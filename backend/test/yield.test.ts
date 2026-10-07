/**
 * Opbrengst om terug te kijken (besluit 102): meters en prijzen in de app, met
 * een import uit het Energie-dashboard, en de cijfers per periode uit de
 * statistiek van Home Assistant.
 */

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HaClient } from '../src/adapters/homeassistant/client.js';
import { EnergyStore, importFromPrefs, pricesInPrefs, validateEnergy, type EnergySettings, type EnergySource } from '../src/web/energy.js';
import { partsIn, zonedMidnight } from '../src/web/today.js';
import { periodRange, yieldReport } from '../src/web/yield.js';

const TZ = 'Europe/Amsterdam';

/** Een dag in september: wat elke meter per uur telt, op het lokale uur. */
const HOURLY: Record<string, (h: number) => number> = {
  'sensor.afname': (h) => (h >= 10 && h < 17 ? 0 : 0.4),
  'sensor.terug': (h) => (h >= 10 && h < 17 ? 1 : 0),
  'sensor.zon': (h) => (h >= 10 && h < 17 ? 2 : 0),
  'sensor.airco': (h) => (h === 12 || h === 13 ? 0.5 : h === 20 ? 0.2 : 0),
  'sensor.gas': (h) => (h === 7 ? 0.2 : 0),
};
const daily = (id: string) => Array.from({ length: 24 }, (_, h) => HOURLY[id]!(h)).reduce((a, b) => a + b, 0);

/**
 * Een nep-Home Assistant: elke dag hetzelfde, maar een jaar eerder 80%. Per uur,
 * dag, week of maand, zoals de statistiek dat geeft.
 */
function fakeSource(): EnergySource & { calls: string[] } {
  const calls: string[] = [];
  const scale = (ms: number) => (partsIn(ms, TZ).y < 2026 ? 0.8 : 1);
  return {
    calls,
    async prefs() {
      return null;
    },
    async meters() {
      return [];
    },
    async changes(ids, startMs, endMs, period) {
      calls.push(period);
      const out: Record<string, { startMs: number; change: number }[]> = {};
      for (const id of ids) {
        const rows: { startMs: number; change: number }[] = [];
        if (period === 'hour') {
          for (let t = startMs; t < endMs; t += 3_600_000) rows.push({ startMs: t, change: HOURLY[id]!(partsIn(t, TZ).h) * scale(t) });
        } else {
          // Een rij per dag, week of maand, op middernacht in de tijdzone.
          let p = partsIn(startMs + 3 * 3_600_000, TZ);
          let t = zonedMidnight(p.y, p.m, p.d, TZ);
          while (t < endMs) {
            p = partsIn(t + 3 * 3_600_000, TZ);
            const next = period === 'day' ? zonedMidnight(p.y, p.m, p.d + 1, TZ) : period === 'week' ? zonedMidnight(p.y, p.m, p.d + 7, TZ) : zonedMidnight(p.y, p.m + 1, 1, TZ);
            const days = Math.round((next - t) / 86_400_000);
            rows.push({ startMs: t, change: daily(id) * days * scale(t) });
            t = next;
          }
        }
        out[id] = rows;
      }
      return out;
    },
  };
}

const SETTINGS: EnergySettings = {
  versie: 1,
  bron: 'zelf',
  net: { afname: ['sensor.afname'], teruglevering: ['sensor.terug'] },
  zon: ['sensor.zon'],
  gas: 'sensor.gas',
  apparaten: [{ id: 'sensor.airco', naam: 'Airco woonkamer' }],
  prijzen: { stroom: 0.25, teruglevering: null, gas: 1.3, vastPerMaand: null },
};

describe('een dag terugkijken', () => {
  it('rekent zon, net, gas en de apparaten uit, met zon per apparaat per uur', async () => {
    const now = Date.UTC(2026, 9, 7, 12);
    const r = (await yieldReport(fakeSource(), SETTINGS, 'dag', '2026-09-15', TZ, now))!;
    expect(r.periode).toMatchObject({ label: 'Dinsdag 15 september', vorige: '2026-09-14', volgende: '2026-09-16' });
    // 17 uur × 0,4 van het net, en 7 uur 1 kWh zelf gebruikt.
    expect(r.stroom).toEqual({ verbruikKwh: 13.8, eigenZonKwh: 7, vanNetKwh: 6.8, terugKwh: 7, eigenZonPct: 51, vorigeKwh: 13.8 });
    expect(r.zon).toMatchObject({ opgewektKwh: 14, zelfKwh: 7, terugKwh: 7, zelfPct: 50 });
    expect(r.gas).toEqual({ m3: 0.2, kwh: 2, vorigeM3: 0.2 });
    // De airco draaide twee uur op zon en een uur 's avonds op het net.
    expect(r.apparaten).toEqual([
      { id: 'sensor.airco', naam: 'Airco woonkamer', kwh: 1.2, zonKwh: 1, netKwh: 0.2, kosten: 0.05 },
      { id: 'rest', naam: 'Rest van het huis', kwh: 12.6, zonKwh: 6, netKwh: 6.6, kosten: 1.65, rest: true },
    ]);
    // De sankey telt op: zon is zelf gebruikt plus terug, net is van het net.
    const from = (src: string) => r.stromen.filter((s) => s.van === src).reduce((a, s) => a + s.kwh, 0);
    expect(from('zon')).toBeCloseTo(14);
    expect(from('net')).toBeCloseTo(6.8);
    expect(r.perBucket).toHaveLength(24);
    expect(r.perBucket[12]).toEqual({ label: '12', zonKwh: 1, netKwh: 0, gasM3: 0 });
    // Kosten: van het net min terug (gesaldeerd tegen dezelfde prijs) plus gas.
    expect(r.kosten.regels.map((x) => [x.naam, x.euro])).toEqual([
      ['Stroom van het net', 1.7],
      ['Teruggeleverd', -1.75],
      ['Gas', 0.26],
      ['Vaste kosten', null],
    ]);
    expect(r.kosten.totaal).toBe(0.21);
    expect(r.kosten.regels.map((x) => x.uitleg)).toEqual(['6,8 kWh × € 0,25', '7 kWh, gesaldeerd tot 2027', '0,2 m³ × € 1,30', 'nog niet ingesteld']);
  });

  it('zonder zonnepanelen geen zon, en alles van het net', async () => {
    const r = (await yieldReport(fakeSource(), { ...SETTINGS, zon: [], net: { afname: ['sensor.afname'], teruglevering: [] } }, 'dag', '2026-09-15', TZ, Date.UTC(2026, 9, 7)))!;
    expect(r.zon).toBeNull();
    expect(r.stroom).toMatchObject({ verbruikKwh: 6.8, eigenZonKwh: 0, eigenZonPct: null });
    expect(r.apparaten[0]).toMatchObject({ zonKwh: 0, netKwh: 1.2 });
  });
});

describe('een maand, en vergelijken', () => {
  it('geeft twaalf maanden met dezelfde maand een jaar eerder ernaast', async () => {
    const source = fakeSource();
    const r = (await yieldReport(source, SETTINGS, 'maand', '2026-09-20', TZ, Date.UTC(2026, 8, 25)))!;
    expect(r.periode).toMatchObject({ datum: '2026-09-01', label: 'September 2026', vorige: '2026-08-01', volgende: null, vorigeNaam: 'augustus' });
    expect(r.perBucket).toHaveLength(30);
    expect(r.zon?.besteDag).toEqual({ label: 'dinsdag 1 september', kwh: 14 });
    const stroom = r.vergelijk.stroom;
    expect(stroom.map((p) => p.label)).toEqual(['okt', 'nov', 'dec', 'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep']);
    // September: 30 dagen van 13,8 kWh; een jaar eerder 80%.
    expect(stroom.at(-1)).toEqual({ label: 'sep', nu: 414, jaarEerder: 331.2 });
    expect(r.stroom.vorigeKwh).toBe(stroom.at(-2)!.nu);
    expect(r.vergelijk.gas.at(-1)).toEqual({ label: 'sep', nu: 6, jaarEerder: 4.8 });
    // Augustus had 31 dagen, september 30; een jaar eerder 80%.
    expect(r.verschil.stroom).toEqual({ vorige: { dan: 427.8, pct: -3 }, jaar: { dan: 331.2, pct: 25 } });
    expect(source.calls).toEqual(['hour', 'month']);
  });

  it('kent dag, week, maand en jaar in de tijdzone van het huis, ook rond de wintertijd', () => {
    expect(periodRange('week', '2026-10-01', TZ)).toMatchObject({ label: 'Week 40 · 28 september – 4 oktober', prev: '2026-09-21', next: '2026-10-05' });
    const dst = periodRange('dag', '2026-10-25', TZ)!;
    expect(dst.endMs - dst.startMs).toBe(25 * 3_600_000);
    expect(periodRange('jaar', '2026-06-01', TZ)).toMatchObject({ label: '2026', startMs: Date.UTC(2025, 11, 31, 23) });
    expect(periodRange('maand', '2026-02-30', TZ)).toBeNull();
  });
});

describe('meters en prijzen in de app', () => {
  const prefs = {
    energy_sources: [
      {
        type: 'grid',
        flow_from: [
          { stat_energy_from: 'sensor.p1_meter_energy_import_tariff_1', number_energy_price: 0.27 },
          { stat_energy_from: 'sensor.p1_meter_energy_import_tariff_2', entity_energy_price: 'sensor.prijs' },
        ],
        flow_to: [{ stat_energy_to: 'sensor.p1_meter_energy_export_tariff_1', number_energy_price: null }],
      },
      { type: 'solar', stat_energy_from: 'sensor.solaredge_lifetime_energy' },
      { type: 'gas', stat_energy_from: 'sensor.gas_meter_gas', number_energy_price: 1.25 },
      { type: 'battery', stat_energy_from: 'sensor.accu_uit', stat_energy_to: 'sensor.accu_in' },
    ],
    device_consumption: [{ stat_consumption: 'sensor.airconditioning_woonkamer_energie_kwh' }, { stat_consumption: 'sensor.samsung_oled_energie', name: 'Tv' }],
  };

  it('neemt het Energie-dashboard van Home Assistant over, met namen uit de statistiek', () => {
    const s = importFromPrefs(prefs, [{ id: 'sensor.airconditioning_woonkamer_energie_kwh', naam: 'Airco woonkamer energie', soort: 'energy' }]);
    expect(s).toEqual({
      versie: 1,
      bron: 'home-assistant',
      net: { afname: ['sensor.p1_meter_energy_import_tariff_1', 'sensor.p1_meter_energy_import_tariff_2'], teruglevering: ['sensor.p1_meter_energy_export_tariff_1'] },
      zon: ['sensor.solaredge_lifetime_energy'],
      gas: 'sensor.gas_meter_gas',
      apparaten: [
        { id: 'sensor.airconditioning_woonkamer_energie_kwh', naam: 'Airco woonkamer energie' },
        { id: 'sensor.samsung_oled_energie', naam: 'Tv' },
      ],
      prijzen: { stroom: 0.27, teruglevering: null, gas: 1.25, vastPerMaand: null },
    });
    expect(importFromPrefs(null)).toBeNull();
    expect(importFromPrefs({ energy_sources: 'x' })).toBeNull();
  });

  it('zegt per meter waar het dashboard zijn prijs vandaan haalt', () => {
    const p = { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.a', stat_cost: 'sensor.a_kosten', number_energy_price: null, entity_energy_price: null }], flow_to: [{ stat_energy_to: 'sensor.t', number_energy_price: 0.09 }] }] };
    expect(pricesInPrefs(p)).toEqual([
      { soort: 'afname', meter: 'sensor.a', prijs: null, prijsEntiteit: null, kostenMeter: 'sensor.a_kosten' },
      { soort: 'teruglevering', meter: 'sensor.t', prijs: 0.09, prijsEntiteit: null, kostenMeter: null },
    ]);
  });

  it('neemt een prijs uit een entiteit over met de stand van nu', () => {
    const only = { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.afname', entity_energy_price: 'input_number.stroomprijs' }] }, { type: 'gas', stat_energy_from: 'sensor.gas', entity_energy_price: 'input_number.gasprijs' }] };
    const prices: Record<string, number> = { 'input_number.stroomprijs': 0.2899, 'input_number.gasprijs': 1.31 };
    expect(importFromPrefs(only, [], (id) => prices[id] ?? null)?.prijzen).toEqual({ stroom: 0.2899, teruglevering: null, gas: 1.31, vastPerMaand: null });
  });

  it('bewaart alleen meters en redelijke bedragen, en houdt ze over een herstart', async () => {
    expect(validateEnergy({ ...SETTINGS, zon: ['geen meter'] })).toMatchObject({ ok: false });
    expect(validateEnergy({ ...SETTINGS, prijzen: { stroom: 25 } })).toMatchObject({ ok: false });
    expect(validateEnergy({ ...SETTINGS, apparaten: [{ id: 'sensor.x', naam: '' }] })).toMatchObject({ ok: false });
    const dir = await mkdtemp(join(tmpdir(), 'hems-energie-'));
    const store = new EnergyStore(dir);
    expect(await store.load()).toBeNull();
    expect(await store.save(SETTINGS)).toEqual({ ok: true, settings: SETTINGS });
    const again = new EnergyStore(dir);
    expect(await again.load()).toEqual(SETTINGS);
  });

  it('leest uit Home Assistant alleen wat op de lijst staat, en geeft nergens anders velden aan mee', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: 'x' });
    await expect(client.query('call_service', { domain: 'light' })).rejects.toThrow(/niet op de lijst/);
    await expect(client.query('get_config', { extra: 1 })).rejects.toThrow(/geen velden/);
    await expect(client.query('energy/get_prefs', { extra: 1 })).rejects.toThrow(/geen velden/);
  });
});
