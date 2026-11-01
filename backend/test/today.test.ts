/**
 * Vandaag voor de bewonersweergave (besluit 71).
 *
 * Een dag logboek die over twee dagbestanden loopt, want middernacht in
 * Amsterdam valt in het UTC-bestand van gisteren. Daarin: een nacht op het net,
 * twee uur zon, SunArc die de woonkamer een uur zou koelen, en het oude
 * systeem dat de zolder een half uur laat koelen.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startOfLocalDay, todayReport, withHistory, type TodayReport } from '../src/web/today.js';
import { exampleSite } from './site.js';

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;

function record(t: number, extra: Record<string, unknown> = {}) {
  const sunny = t >= at('2026-10-02T08:00:00Z') && t < at('2026-10-02T10:00:00Z');
  const zolderOn = t >= at('2026-10-02T08:30:00Z') && t < at('2026-10-02T09:00:00Z');
  return {
    t,
    changed: false,
    mode: 'dag',
    budget: { availableW: 0, allocatedW: 0, surplusW: 0, reclaimableW: 0, gridPowerW: sunny ? -200 : 300 },
    zonW: sunny ? 1000 : 0,
    zonesT: [['woonkamer', 24, 'cool', 60]],
    obs: { nest: 'off', badkamer: 'off@18', 'ac-woonkamer': 'off', 'ac-zolder': zolderOn ? 'cool@22' : 'off' },
    ...extra,
  };
}

async function writeDay(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hems-today-'));
  cleanup.push(dir);
  const files: Record<string, string[]> = {};
  for (let t = at('2026-10-01T21:50:00Z'); t <= at('2026-10-02T10:00:00Z'); t += MIN) {
    let extra = {};
    if (t === at('2026-10-02T08:10:00Z')) {
      extra = {
        changed: true,
        accepted: [{ strategyId: 'pv-surplus', zoneId: 'woonkamer', actuatorId: 'ac-woonkamer', action: 'cool', priority: 20, budgetW: 900, reason: 'buffering_free_energy' }],
        commands: [{ kind: 'setAction', actuatorId: 'ac-woonkamer', action: 'cool' }],
        rejected: [],
      };
    }
    if (t === at('2026-10-02T09:10:00Z')) {
      extra = {
        changed: true,
        accepted: [{ strategyId: 'arbiter:wind-down', zoneId: 'woonkamer', actuatorId: 'ac-woonkamer', action: 'off', priority: 0, budgetW: 0, reason: 'zone_satisfied' }],
        commands: [{ kind: 'setAction', actuatorId: 'ac-woonkamer', action: 'off' }],
        rejected: [],
      };
    }
    const day = new Date(t).toISOString().slice(0, 10);
    (files[day] ??= []).push(JSON.stringify(record(t, extra)));
  }
  for (const [day, lines] of Object.entries(files)) {
    await writeFile(join(dir, `decisions-${day}.ndjson`), `${lines.join('\n')}\n`, 'utf-8');
  }
  return dir;
}

describe('vandaag', () => {
  it('begint om middernacht in de tijdzone van het huis, ook rond de zomertijd', () => {
    expect(startOfLocalDay(at('2026-10-02T10:00:00Z'), 'Europe/Amsterdam')).toBe(at('2026-10-01T22:00:00Z'));
    expect(startOfLocalDay(at('2026-12-01T10:00:00Z'), 'Europe/Amsterdam')).toBe(at('2026-11-30T23:00:00Z'));
    // Op de dag van de omschakeling geldt om middernacht nog wintertijd.
    expect(startOfLocalDay(at('2026-03-29T10:00:00Z'), 'Europe/Amsterdam')).toBe(at('2026-03-28T23:00:00Z'));
    // Net na middernacht lokaal is het in UTC nog gisteren.
    expect(startOfLocalDay(at('2026-10-01T22:30:00Z'), 'Europe/Amsterdam')).toBe(at('2026-10-01T22:00:00Z'));
  });

  it('vat de dag samen over twee dagbestanden', async () => {
    const dir = await writeDay();
    const r = await todayReport(dir, exampleSite, at('2026-10-02T10:00:00Z'));

    expect(r.vanMs).toBe(at('2026-10-01T22:00:00Z'));
    // Twaalf uur, per kwartier; de minuten vóór middernacht tellen niet mee.
    expect(r.kwartieren).toHaveLength(48);
    expect(r.kwartieren[0]).toEqual({ tMs: at('2026-10-01T22:00:00Z'), zonW: 0, netW: 300 });
    expect(r.kwartieren[40]).toEqual({ tMs: at('2026-10-02T08:00:00Z'), zonW: 1000, netW: -200 });

    expect(r.zonWh).toBe(2000);
    expect(r.netAfWh).toBe(3000);
    expect(r.netTerugWh).toBe(400);

    const woonkamer = r.apparaten.find((a) => a.actuatorId === 'ac-woonkamer')!;
    // Een kort record draagt de wens van de arbiter voort tot hij van gedachten verandert.
    expect(woonkamer.smartClimate).toEqual([{ vanMs: at('2026-10-02T08:10:00Z'), totMs: at('2026-10-02T09:09:00Z'), actie: 'cool' }]);
    expect(woonkamer.huidig).toEqual([]);

    const zolder = r.apparaten.find((a) => a.actuatorId === 'ac-zolder')!;
    expect(zolder.huidig).toEqual([{ vanMs: at('2026-10-02T08:30:00Z'), totMs: at('2026-10-02T08:59:00Z'), actie: 'cool' }]);
    // De badkamer op 18 is standby, en dat telt niet als draaien.
    expect(r.apparaten.find((a) => a.actuatorId === 'badkamer')!.huidig).toEqual([]);

    expect(r.besluiten.map((b) => b.tMs)).toEqual([at('2026-10-02T09:10:00Z'), at('2026-10-02T08:10:00Z')]);
    expect(r.besluiten[1]!.redenen).toEqual([
      { actuatorId: 'ac-woonkamer', actie: 'cool', strategie: 'pv-surplus', reden: 'buffering_free_energy' },
    ]);
  });

  it('telt een apparaat dat zegt wat het doet alleen als draaiend als het echt verwarmt (1 november 2026)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-today-'));
    cleanup.push(dir);
    // De Nest staat de hele tijd op verwarmen naar 20°, maar brandt alleen van 08:00 tot 08:30.
    const lines: string[] = [];
    for (let t = at('2026-10-02T07:00:00Z'); t <= at('2026-10-02T09:00:00Z'); t += MIN) {
      const brandt = t >= at('2026-10-02T08:00:00Z') && t < at('2026-10-02T08:30:00Z');
      lines.push(JSON.stringify(record(t, { obs: { nest: 'heat@20', badkamer: 'off@18', 'ac-woonkamer': 'off', 'ac-zolder': 'off' }, doet: { nest: brandt ? 'heating' : 'idle' } })));
    }
    await writeFile(join(dir, 'decisions-2026-10-02.ndjson'), `${lines.join('\n')}\n`, 'utf-8');
    const r = await todayReport(dir, exampleSite, at('2026-10-02T09:00:00Z'));
    expect(r.apparaten.find((a) => a.actuatorId === 'nest')!.huidig).toEqual([{ vanMs: at('2026-10-02T08:00:00Z'), totMs: at('2026-10-02T08:29:00Z'), actie: 'heat' }]);
  });

  it('weet wanneer een uitstelbaar apparaat draaide, en wanneer SunArc het zou starten', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-today-'));
    cleanup.push(dir);
    // Wacht op zon tot 08:00, zou dan starten, de bewoner start hem om 08:20 zelf, klaar om 09:00.
    const state = (t: number) => (t < at('2026-10-02T08:00:00Z') ? 'waiting' : t < at('2026-10-02T08:20:00Z') ? 'would_start' : t < at('2026-10-02T09:00:00Z') ? 'running' : 'not_ready');
    const lines: string[] = [];
    for (let t = at('2026-10-02T07:00:00Z'); t <= at('2026-10-02T10:00:00Z'); t += MIN) {
      lines.push(JSON.stringify(record(t, { uitstel: [['droger', state(t), 'surplus_available']] })));
    }
    await writeFile(join(dir, 'decisions-2026-10-02.ndjson'), `${lines.join('\n')}\n`, 'utf-8');
    const site = { ...exampleSite, deferrables: [{ id: 'droger', name: 'Droger', remoteStart: { adapter: 'homeassistant', id: 'binary_sensor.droger_remote' }, estimatedW: 700, latestStart: '15:00' }] };

    const r = await todayReport(dir, site, at('2026-10-02T10:00:00Z'));

    expect(r.uitstelbaar).toEqual([
      {
        id: 'droger',
        draaide: [{ vanMs: at('2026-10-02T08:20:00Z'), totMs: at('2026-10-02T08:59:00Z'), actie: 'run' }],
        zouStarten: [{ vanMs: at('2026-10-02T08:00:00Z'), totMs: at('2026-10-02T08:19:00Z'), actie: 'run' }],
      },
    ]);
  });

  it('geeft per zone de temperatuur per kwartier, en wat er goed is', async () => {
    const dir = await writeDay();
    const r = await todayReport(dir, exampleSite, at('2026-10-02T10:00:00Z'));
    const woonkamer = r.zones.find((z) => z.zoneId === 'woonkamer')!;
    expect(woonkamer.kwartieren).toHaveLength(48);
    expect(woonkamer.kwartieren[0]).toBe(24);
    const zone = exampleSite.zones.find((z) => z.id === 'woonkamer')!;
    expect(woonkamer.goed).toEqual({ vanC: zone.setpoints.dag?.heat ?? null, totC: zone.setpoints.dag?.cool ?? null });
    // Een zone zonder metingen heeft lege kwartieren, geen nullen.
    const ander = r.zones.find((z) => z.zoneId !== 'woonkamer');
    if (ander) expect(ander.kwartieren.every((q) => q === null)).toBe(true);
  });

  it('geeft met "gisteren" de hele dag ervoor, in dezelfde vorm', async () => {
    const dir = await writeDay();
    // Op 3 oktober is 2 oktober gisteren: van middernacht tot middernacht in Amsterdam.
    const r = await todayReport(dir, exampleSite, at('2026-10-03T09:00:00Z'), 'gisteren');
    expect(r.vanMs).toBe(at('2026-10-01T22:00:00Z'));
    expect(r.totMs).toBe(at('2026-10-02T22:00:00Z'));
    expect(r.kwartieren).toHaveLength(96);
    expect(r.zonWh).toBe(2000);
    expect(r.apparaten.find((a) => a.actuatorId === 'ac-zolder')!.huidig).toHaveLength(1);
  });

  it('geeft een lege dag als er nog niets gelogd is', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-today-'));
    cleanup.push(dir);
    const r = await todayReport(dir, exampleSite, at('2026-10-02T10:00:00Z'));
    expect(r.zonWh).toBe(0);
    expect(r.besluiten).toEqual([]);
    expect(r.kwartieren.every((k) => k.zonW == null)).toBe(true);
  });
});

describe('vandaag aangevuld uit Home Assistant (17 oktober 2026)', () => {
  const Q = 15 * 60_000;
  const van = Date.UTC(2026, 9, 17, 0, 0);
  const rapport = (kwartieren: TodayReport['kwartieren']): TodayReport =>
    ({ vanMs: van, totMs: van + kwartieren.length * Q, kwartieren, zonWh: 100, netAfWh: 50, netTerugWh: 10, apparaten: [], uitstelbaar: [], zones: [], besluiten: [] }) as unknown as TodayReport;

  it('vult alleen de kwartieren zonder eigen meting, en telt hun energie mee', () => {
    const r = rapport([
      { tMs: van, zonW: null, netW: null },
      { tMs: van + Q, zonW: 400, netW: -100 },
    ]);
    const vijf = (i: number) => van + i * 5 * 60_000;
    const uit = withHistory(
      r,
      // Drie keer vijf minuten in het eerste kwartier, en één in het tweede die niet telt.
      [{ startMs: vijf(0), meanW: 600 }, { startMs: vijf(1), meanW: 1200 }, { startMs: vijf(2), meanW: 1200 }, { startMs: vijf(3), meanW: 9999 }],
      [{ startMs: vijf(0), meanW: -300 }, { startMs: vijf(1), meanW: 300 }, { startMs: vijf(2), meanW: 0 }],
    );
    expect(uit.kwartieren).toEqual([
      { tMs: van, zonW: 1000, netW: 0 },
      { tMs: van + Q, zonW: 400, netW: -100 },
    ]);
    // 600 + 1200 + 1200 W, elk vijf minuten: 250 Wh erbij.
    expect(uit.zonWh).toBe(350);
    // 300 W van het net vijf minuten (25 Wh), en 300 W terug (25 Wh).
    expect(uit.netAfWh).toBe(75);
    expect(uit.netTerugWh).toBe(35);
  });

  it('laat alles staan zonder statistiek', () => {
    const r = rapport([{ tMs: van, zonW: null, netW: null }]);
    expect(withHistory(r, [], [])).toEqual(r);
  });
});
