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
import { EnergyStore, importFromPrefs, meterRole, pricesInPrefs, validateEnergy, type EnergySettings, type EnergySource } from '../src/web/energy.js';
import { partsIn, zonedMidnight } from '../src/web/today.js';
import { periodRange, verdeel, yearStartOf, yieldReport } from '../src/web/yield.js';

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
    expect(r.kosten.regels.map((x) => x.uitleg)).toEqual(['6,8 kWh × € 0,25', '7 kWh, gesaldeerd tegen je stroomprijs', '0,2 m³ × € 1,30', 'nog niet ingesteld']);
  });

  it('houdt zelf gebruikt plus terug gelijk aan opgewekt, ook als de zonnemeter een uur achterloopt', async () => {
    // De zonnemeter telt een uur later dan de meter van het net (opgelost 15 oktober).
    const bron = fakeSource();
    const echt = bron.changes.bind(bron);
    bron.changes = async (ids, startMs, endMs, period) => {
      const uit = await echt(ids, startMs, endMs, period);
      const zon = uit['sensor.zon'];
      return zon ? { ...uit, 'sensor.zon': zon.map((r) => ({ ...r, change: HOURLY['sensor.zon']!(partsIn(r.startMs, TZ).h - 1) })) } : uit;
    };
    const r = (await yieldReport(bron, SETTINGS, 'dag', '2026-09-15', TZ, Date.UTC(2026, 9, 7, 12)))!;
    expect(r.zon).toMatchObject({ opgewektKwh: 14, zelfKwh: 7, terugKwh: 7, zelfPct: 50 });
    const from = (src: string) => r.stromen.filter((s) => s.van === src).reduce((a, s) => a + s.kwh, 0);
    expect(from('zon')).toBeCloseTo(14);
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

  it('geeft oktober, met de wintertijd erin, één vak per dag', async () => {
    const r = (await yieldReport(fakeSource(), SETTINGS, 'maand', '2026-10-08', TZ, Date.UTC(2026, 9, 8, 12)))!;
    expect(r.perBucket.map((b) => b.label)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
  });

  it('kent dag, week, maand en jaar in de tijdzone van het huis, ook rond de wintertijd', () => {
    expect(periodRange('week', '2026-10-01', TZ)).toMatchObject({ label: 'Week 40 · 28 september – 4 oktober', prev: '2026-09-21', next: '2026-10-05' });
    const dst = periodRange('dag', '2026-10-25', TZ)!;
    expect(dst.endMs - dst.startMs).toBe(25 * 3_600_000);
    expect(periodRange('jaar', '2026-06-01', TZ)).toMatchObject({ label: '2026', startMs: Date.UTC(2025, 11, 31, 23) });
    expect(periodRange('maand', '2026-02-30', TZ)).toBeNull();
  });

  it('laat het jaar beginnen op de startdatum van het contract (besluit 116)', () => {
    const start = yearStartOf('2024-03-15');
    // 1 juni 2026 valt in het contractjaar van 15 maart 2026.
    expect(periodRange('jaar', '2026-06-01', TZ, start)).toMatchObject({
      label: '15 maart 2026 – 14 maart 2027',
      startMs: Date.UTC(2026, 2, 14, 23),
      endMs: Date.UTC(2027, 2, 14, 23),
      prev: '2025-03-15',
      next: '2027-03-15',
      prevName: '2025/26',
    });
    // Vóór 15 maart hoort een dag bij het jaar ervoor.
    expect(periodRange('jaar', '2026-03-14', TZ, start)).toMatchObject({ prev: '2024-03-15' });
    // Zonder datum: het kalenderjaar; een 29 februari wordt 1 maart.
    expect(yearStartOf(null)).toEqual({ m: 1, d: 1 });
    expect(yearStartOf('2024-02-29')).toEqual({ m: 3, d: 1 });
  });

  it('zegt vanaf wanneer er gemeten is, en telt de vaste kosten alleen over die dagen', async () => {
    const vol = fakeSource();
    // Home Assistant heeft pas historie vanaf 1 maart 2026.
    const vanaf = Date.UTC(2026, 1, 28, 23);
    const laat: EnergySource = {
      ...vol,
      async changes(ids, startMs, endMs, period) {
        const rows = await vol.changes(ids, startMs, endMs, period);
        return Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.filter((x) => x.startMs >= vanaf)]));
      },
    };
    const settings = { ...SETTINGS, prijzen: { ...SETTINGS.prijzen, vast: [{ naam: 'Netbeheer', bedrag: 1, per: 'dag' as const, soort: 'stroom' as const }] } };
    const r = (await yieldReport(laat, settings, 'jaar', '2026-06-01', TZ, Date.UTC(2027, 0, 5)))!;
    expect(r.dekking).toEqual({ vanaf: '2026-03-01', dagen: 306, vanDagen: 365 });
    expect(r.kosten.regels.find((x) => x.naam === 'Vaste kosten stroom')?.euro).toBe(306);
    // Een hele gemeten periode heeft geen dekking nodig.
    expect((await yieldReport(fakeSource(), settings, 'maand', '2026-09-20', TZ, Date.UTC(2026, 9, 1)))!.dekking).toBeNull();
  });

  it('telt de grafiek van een contractjaar vanaf zijn eigen maand', async () => {
    const r = (await yieldReport(fakeSource(), { ...SETTINGS, prijzen: { ...SETTINGS.prijzen, contractStart: '2025-07-01' } }, 'jaar', '2026-09-15', TZ, Date.UTC(2026, 8, 20)))!;
    expect(r.periode.label).toBe('1 juli 2026 – 30 juni 2027');
    expect(r.perBucket.map((b) => b.label).slice(0, 3)).toEqual(['jul', 'aug', 'sep']);
    expect(r.vergelijk.stroom.at(-1)?.label).toBe('2026/27');
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
      net: {
        afname: ['sensor.p1_meter_energy_import_tariff_1', 'sensor.p1_meter_energy_import_tariff_2'],
        teruglevering: ['sensor.p1_meter_energy_export_tariff_1'],
        // Tarief 1 van de slimme meter is het daltarief (besluit 110).
        dal: ['sensor.p1_meter_energy_import_tariff_1', 'sensor.p1_meter_energy_export_tariff_1'],
      },
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

  it('raadt de rol van een meter, zodat elke lijst eerst toont wat past', () => {
    // De meters van dit huis, zoals Home Assistant ze op 7 oktober gaf.
    const cases: [string, string, string | null, string][] = [
      ['sensor.p1_meter_energy_import_tariff_1', 'P1 Meter Energie import tarief 1', 'homewizard', 'afname'],
      ['sensor.p1_meter_energy_export_tariff_2', 'P1 Meter Energie export tarief 2', 'homewizard', 'teruglevering'],
      ['sensor.solaredge_produced_energy', 'SolarEdge Produced energy', 'solaredge', 'zon'],
      ['sensor.solaredge_lifetime_energy', 'SolarEdge Lifetime energy', 'solaredge', 'zon'],
      ['sensor.solaredge_self_consumed_energy', 'SolarEdge Self consumed energy', 'solaredge', 'periode'],
      ['sensor.solaredge_imported_energy', 'SolarEdge Imported energy', 'solaredge', 'periode'],
      ['sensor.airconditioning_woonkamer_energie_kwh', 'Airco woonkamer totaal (kWh)', 'integration', 'apparaat'],
      ['sensor.samsung_oled_power_energy', 'Samsung_OLED Power energy', 'smartthings', 'apparaat'],
      ['sensor.samsung_oled_energie_bespaard', 'Samsung_OLED Energie bespaard', 'smartthings', 'periode'],
      ['sensor.gratis_airco_kwh_maand', 'Gratis airco stroom deze maand (kWh)', 'utility_meter', 'periode'],
      ['sensor.airconditioning_totaal_energie', "Airco's gecombineerd totaal (kWh)", 'template', 'periode'],
      ['sensor.energy_production_today', 'Energy production today', 'forecast_solar', 'periode'],
    ];
    for (const [id, naam, platform, rol] of cases) expect(meterRole(id, naam, 'energy', platform), naam).toBe(rol);
    expect(meterRole('sensor.gas_meter_gas', 'Gas meter Gas', 'volume', 'homewizard')).toBe('gas');
  });

  it('zegt per meter waar het dashboard zijn prijs vandaan haalt', () => {
    const p = { energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.a', stat_cost: 'sensor.a_kosten', number_energy_price: null, entity_energy_price: null }], flow_to: [{ stat_energy_to: 'sensor.t', number_energy_price: 0.09 }] }] };
    expect(pricesInPrefs(p)).toEqual([
      { soort: 'afname', meter: 'sensor.a', prijs: null, prijsEntiteit: null, kostenMeter: 'sensor.a_kosten', kostenIsMeter: false },
      { soort: 'teruglevering', meter: 'sensor.t', prijs: 0.09, prijsEntiteit: null, kostenMeter: null, kostenIsMeter: false },
    ]);
  });

  it('leest de nieuwe opbouw van het dashboard: een netbron per tarief, met de prijs van teruglevering apart', () => {
    // Zoals Home Assistant het op 7 oktober in dit huis gaf, met prijzen erbij.
    const p = {
      energy_sources: [
        {
          type: 'grid',
          stat_energy_from: 'sensor.p1_meter_energy_import_tariff_2',
          stat_cost: 'sensor.p1_meter_energy_import_tariff_2',
          entity_energy_price: null,
          number_energy_price: null,
          stat_energy_to: 'sensor.p1_meter_energy_export_tariff_1',
          stat_compensation: 'sensor.p1_meter_energy_export_tariff_1',
          number_energy_price_export: 0.07,
        },
        { type: 'grid', stat_energy_from: 'sensor.p1_meter_energy_import_tariff_1', number_energy_price: 0.27, stat_energy_to: 'sensor.p1_meter_energy_export_tariff_2' },
        { type: 'gas', stat_energy_from: 'sensor.gas_meter_gas', stat_cost: 'sensor.gas_meter_gas' },
      ],
    };
    const s = importFromPrefs(p)!;
    expect(s.net).toEqual({
      afname: ['sensor.p1_meter_energy_import_tariff_2', 'sensor.p1_meter_energy_import_tariff_1'],
      teruglevering: ['sensor.p1_meter_energy_export_tariff_1', 'sensor.p1_meter_energy_export_tariff_2'],
      dal: ['sensor.p1_meter_energy_import_tariff_1', 'sensor.p1_meter_energy_export_tariff_1'],
    });
    expect(s.prijzen).toEqual({ stroom: 0.27, teruglevering: 0.07, gas: null, vastPerMaand: null });
    const why = pricesInPrefs(p);
    expect(why.filter((x) => x.kostenIsMeter).map((x) => x.soort)).toEqual(['afname', 'teruglevering', 'gas']);
    expect(why.find((x) => x.meter === 'sensor.p1_meter_energy_export_tariff_1')?.prijs).toBe(0.07);
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
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...SETTINGS.prijzen, contractStart: '2025-02-30' } })).toMatchObject({ ok: false });
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...SETTINGS.prijzen, contractStart: '2025-03-15' } })).toMatchObject({ ok: true, settings: { prijzen: { contractStart: '2025-03-15' } } });
    const dir = await mkdtemp(join(tmpdir(), 'hems-energie-'));
    const store = new EnergyStore(dir);
    expect(await store.load()).toBeNull();
    const saved = await store.save(SETTINGS);
    expect(saved).toMatchObject({ ok: true, settings: { ...SETTINGS, prijzen: SETTINGS.prijzen } });
    const again = new EnergyStore(dir);
    expect(await again.load()).toEqual(saved.ok ? saved.settings : null);
  });

  it('leest uit Home Assistant alleen wat op de lijst staat, en geeft nergens anders velden aan mee', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: 'x' });
    await expect(client.query('call_service', { domain: 'light' })).rejects.toThrow(/niet op de lijst/);
    await expect(client.query('get_config', { extra: 1 })).rejects.toThrow(/geen velden/);
    await expect(client.query('energy/get_prefs', { extra: 1 })).rejects.toThrow(/geen velden/);
  });
});

describe('zonder salderen (besluit 178)', () => {
  it('telt teruglevering dan meteen zonder salderen, ook voor 2027', () => {
    const van = Date.UTC(2026, 5, 1);
    const tot = Date.UTC(2026, 5, 2);
    const met = verdeel(SETTINGS, 10, null, 4, null, van, tot, 'Europe/Amsterdam');
    expect(met.terugNa).toBe(0);
    const zonder = verdeel({ ...SETTINGS, prijzen: { ...SETTINGS.prijzen, salderen: false } }, 10, null, 4, null, van, tot, 'Europe/Amsterdam');
    expect(zonder).toMatchObject({ terugNormaal: 0, terugDal: 0, terugNa: 4 });
  });

  it('bewaart eigen daltijden en geen salderen, en weigert wat niet klopt', () => {
    const p = SETTINGS.prijzen;
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...p, dalUren: 'eigen', dalEigen: { van: 22, tot: 6, weekend: false }, salderen: false } })).toMatchObject({ ok: true, settings: { prijzen: { dalUren: 'eigen', dalEigen: { van: 22, tot: 6, weekend: false }, salderen: false } } });
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...p, dalUren: 'eigen', dalEigen: { van: 6, tot: 6, weekend: false } } })).toMatchObject({ ok: false });
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...p, dalUren: 'eigen' } })).toMatchObject({ ok: false });
    expect(validateEnergy({ ...SETTINGS, prijzen: { ...p, salderen: 'ja' } })).toMatchObject({ ok: false });
  });
});
