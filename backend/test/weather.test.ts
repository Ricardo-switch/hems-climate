/**
 * Het weer van de komende dagen (besluit 105): de verwachting van Buienradar,
 * herkend aan de vaste sleutels, en wat de panelen dan ongeveer leveren.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { kindOf, learnShare, priorShare, readForecast, WEATHER_FILE, WeatherLog, weatherReport } from '../src/web/weather.js';
import { exampleSite } from './site.js';

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

const state = (entity_id: string, value: string): HaEntityState => ({ entity_id, state: value, attributes: {}, last_changed: '', last_updated: '' });
const br = (entity_id: string, translation_key: string): HaRegistryEntity => ({ entity_id, platform: 'buienradar', translation_key });

describe('de verwachting lezen', () => {
  const entities: HaRegistryEntity[] = [
    br('sensor.temperatuur_1d', 'temperature_1d'),
    br('sensor.minimale_temperatuur_1d', 'mintemp_1d'),
    br('sensor.zonkans_1d', 'sunchance_1d'),
    br('sensor.regenkans_1d', 'rainchance_1d'),
    br('sensor.staat_1d', 'condition_1d'),
    br('sensor.zonkans_2d', 'sunchance_2d'),
    br('sensor.staat_2d', 'condition_2d'),
    // Het weer van nu, zonder achtervoegsel: dag 0.
    br('sensor.staat', 'condition'),
    // De temperatuur van nu heeft geen sleutel en telt niet.
    { entity_id: 'sensor.temperatuur', platform: 'buienradar', translation_key: null },
    // Een andere integratie met dezelfde sleutel telt niet.
    { entity_id: 'sensor.ander_zonkans_3d', platform: 'knmi', translation_key: 'sunchance_3d' },
  ];
  const states = new Map(
    [
      state('sensor.temperatuur_1d', '17'),
      state('sensor.minimale_temperatuur_1d', '10'),
      state('sensor.zonkans_1d', '10'),
      state('sensor.regenkans_1d', '90'),
      state('sensor.staat_1d', 'rainy'),
      state('sensor.zonkans_2d', '40'),
      state('sensor.staat_2d', 'cloudy'),
      state('sensor.temperatuur', '14.4'),
      state('sensor.staat', 'cloudy'),
      state('sensor.ander_zonkans_3d', '80'),
    ].map((s) => [s.entity_id, s]),
  );

  it('vindt de dagen aan hun sleutel, morgen eerst', () => {
    const f = readForecast(entities, states);
    expect(f.map((d) => d.offset)).toEqual([0, 1, 2]);
    // Eigen woorden: Buienradar praat de taal van Home Assistant, hier Engels.
    expect(f[0]).toMatchObject({ offset: 0, soort: 'bewolkt', tekst: 'Bewolkt', maxC: null });
    expect(f[1]).toEqual({ offset: 1, maxC: 17, minC: 10, regenkansPct: 90, zonkansPct: 10, soort: 'regen', tekst: 'Bewolkt met regen' });
    // Bewolkt met 40 % zonkans is half bewolkt.
    expect(f[2]).toMatchObject({ offset: 2, zonkansPct: 40, soort: 'half', maxC: null });
  });

  it('slaat een sensor zonder waarde over', () => {
    const f = readForecast(entities, new Map([['sensor.zonkans_1d', state('sensor.zonkans_1d', 'unavailable')]]));
    expect(f).toEqual([]);
  });

  it('kent de soorten weer', () => {
    expect(kindOf('sunny', 90)).toBe('zon');
    expect(kindOf('cloudy', 10)).toBe('bewolkt');
    expect(kindOf('lightning-rainy', 20)).toBe('onweer');
    expect(kindOf('snowy', 0)).toBe('sneeuw');
    expect(kindOf('fog', 0)).toBe('mist');
    expect(kindOf(undefined, 50)).toBeNull();
  });
});

describe('de opbrengst bij een zonkans', () => {
  it('begint bij een vijfde zonder zon en loopt op met de zonkans', () => {
    expect(priorShare(0)).toBeCloseTo(0.18);
    expect(priorShare(50)).toBeCloseTo(0.54);
    expect(priorShare(100)).toBeCloseTo(0.9);
  });

  it('leert uit dagen waarvan de zonkans de dag ervoor bekend was', () => {
    // Elke dag de helft van wat de schatting zei: 10 kWh helder, zonkans 50 → geschat 5,4 kWh, werkelijk 2,7.
    const days: Record<string, (number | null)[]> = {};
    const predicted: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) {
      const day = `2026-09-${String(i).padStart(2, '0')}`;
      days[day] = Array.from({ length: 96 }, () => (2700 * 4) / 96);
      predicted[day] = 50;
    }
    const geleerd = learnShare(predicted, days, () => 10_000);
    expect(geleerd.dagen).toBe(10);
    // Tien dagen tegen een half gewicht van vijf: tweederde van de weg naar 0,5.
    expect(geleerd.factor).toBeCloseTo(1 - (10 / 15) * 0.5, 2);
  });

  it('laat dagen met gaten in het logboek en dagen zonder zon weg', () => {
    const gaps = Array.from({ length: 96 }, (_, i) => (i < 40 ? 500 : null));
    expect(learnShare({ '2026-09-01': 50 }, { '2026-09-01': gaps }, () => 10_000).dagen).toBe(0);
    expect(learnShare({ '2026-09-01': 50 }, { '2026-09-01': Array(96).fill(5) }, () => 800).dagen).toBe(0);
    expect(learnShare({}, {}, () => 10_000)).toEqual({ dagen: 0, factor: 1 });
  });
});

describe('het rapport', () => {
  const location = { latDeg: 52.1, lonDeg: 5.1 };
  const base = {
    solarDays: {},
    geometry: exampleSite.geometry!,
    location,
    learned: null,
    timeZone: 'Europe/Amsterdam',
  };
  const forecast = [
    { offset: 0, maxC: null, minC: null, regenkansPct: null, zonkansPct: null, soort: 'bewolkt' as const, tekst: 'Zwaar bewolkt' },
    { offset: 1, maxC: 17, minC: 10, regenkansPct: 90, zonkansPct: 10, soort: 'regen' as const, tekst: 'Zwaar bewolkt en regen' },
    { offset: 2, maxC: 18, minC: 7, regenkansPct: 30, zonkansPct: 80, soort: 'half' as const, tekst: null },
  ];

  it('geeft per dag de datum en meer opbrengst bij meer zonkans', () => {
    const r = weatherReport({ ...base, forecast, predicted: {}, todayWh: 0, nowMs: Date.parse('2026-10-08T21:30:00Z') });
    // Half twaalf 's avonds in Amsterdam is het nog de achtste: morgen is de negende.
    expect(r.dagen.map((d) => d.datum)).toEqual(['2026-10-09', '2026-10-10']);
    expect(r.dagen[0]!.heldereLuchtKwh).toBeGreaterThan(5);
    expect(r.dagen[0]!.verwachtKwh).toBeLessThan(r.dagen[1]!.verwachtKwh!);
    expect(r.dagen[1]!.verwachtKwh).toBeLessThanOrEqual(r.dagen[1]!.heldereLuchtKwh);
    expect(r.geleerd).toEqual({ dagen: 0, factor: 1 });
    expect(r.vandaag).toMatchObject({ datum: '2026-10-08', soort: 'bewolkt', tekst: 'Zwaar bewolkt' });
  });

  it('rekent vandaag uit wat er al was en hoe de dag tot nu verliep', () => {
    const at = Date.parse('2026-10-08T11:00:00Z');
    const helder = weatherReport({ ...base, forecast, predicted: {}, todayWh: 0, nowMs: at }).vandaag.heldereLuchtKwh;
    // Tot nu toe precies de helft van een heldere lucht, en geen verwachting van gisteren.
    const sofar = weatherReport({ ...base, forecast, predicted: {}, todayWh: 1, nowMs: at });
    expect(sofar.vandaag.zonkansPct).toBeNull();
    // Met een zonkans van gisteren voor vandaag weegt die voor de rest van de dag mee.
    const met = weatherReport({ ...base, forecast, predicted: { '2026-10-08': 100 }, todayWh: 3000, nowMs: at });
    const zonder = weatherReport({ ...base, forecast, predicted: { '2026-10-08': 0 }, todayWh: 3000, nowMs: at });
    expect(met.vandaag.zonkansPct).toBe(100);
    expect(met.vandaag.verwachtKwh!).toBeGreaterThan(zonder.vandaag.verwachtKwh!);
    expect(met.vandaag.verwachtKwh!).toBeLessThanOrEqual(3 + helder);
    expect(met.vandaag.opgewektKwh).toBe(3);
  });

  it('weet vandaag niets als er nog niets te zien was en niets werd verwacht', () => {
    const r = weatherReport({ ...base, forecast, predicted: {}, todayWh: 0, nowMs: Date.parse('2026-10-08T05:00:00Z') });
    expect(r.vandaag.verwachtKwh).toBeNull();
  });
});

describe('de zonkans per dag bewaren', () => {
  it('schrijft alleen wat veranderde, en leest het na een herstart terug', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-weer-'));
    cleanup.push(dir);
    const log = new WeatherLog(dir);
    await log.note('2026-10-09', 10);
    await log.note('2026-10-09', 20);
    expect(JSON.parse(await readFile(join(dir, WEATHER_FILE), 'utf-8'))).toEqual({ versie: 1, zonkans: { '2026-10-09': 20 } });
    const again = new WeatherLog(dir);
    await again.load();
    expect(again.current).toEqual({ '2026-10-09': 20 });
  });
});
