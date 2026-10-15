/**
 * Meten met (besluit 123): meer sensoren per zone, het gemiddelde van wat
 * meldt, de keuze uit de indeling in de configuratie, en het logboek.
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSystemState, relevantEntities } from '../src/adapters/homeassistant/mapping.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { noteSensors, pointFor, SENSOR_LOG_FILE, withMeasurement } from '../src/web/meten.js';
import { exampleSite } from './site.js';

const NOW = Date.parse('2026-10-14T10:00:00Z');
const zolder = exampleSite.zones.find((z) => z.id === 'zolder')!;
const metTwee = { ...exampleSite, zones: exampleSite.zones.map((z) => (z.id === 'zolder' ? { ...z, temperatures: [z.temperature, { adapter: 'homeassistant', id: 'climate.knop_zolder', attribute: 'current_temperature' }] } : z)) };

function source(numbers: Record<string, number | null>, attrs: Record<string, number | null> = {}) {
  return {
    state: (id: string) => (numbers[id] != null ? String(numbers[id]) : null),
    number: (id: string) => numbers[id] ?? null,
    bool: () => null,
    attr: () => null,
    attrNumber: (id: string, attribute: string) => attrs[`${id}#${attribute}`] ?? null,
    changedAt: () => null,
    hvacAction: () => null,
    hvacActionSince: () => null,
  };
}

describe('meten met meer sensoren (besluit 123)', () => {
  it('rekent met het gemiddelde van wat meldt, en laat wat wegvalt weg', () => {
    const beide = buildSystemState(metTwee, source({ [zolder.temperature.id]: 20 }, { 'climate.knop_zolder#current_temperature': 22 }), NOW);
    expect(beide.zones['zolder']!.temperatureC).toMatchObject({ ok: true, value: 21 });
    const een = buildSystemState(metTwee, source({ [zolder.temperature.id]: null }, { 'climate.knop_zolder#current_temperature': 22 }), NOW);
    expect(een.zones['zolder']!.temperatureC).toMatchObject({ ok: true, value: 22 });
    const geen = buildSystemState(metTwee, source({}), NOW);
    expect(geen.zones['zolder']!.temperatureC.ok).toBe(false);
    // Elke sensor telt mee voor wat de dienst volgt.
    expect(relevantEntities(metTwee).has('climate.knop_zolder')).toBe(true);
  });

  it('leest de lijst uit de configuratie, en weigert een lege lijst', () => {
    const raw = JSON.parse(JSON.stringify(exampleSite)) as { zones: Record<string, unknown>[] };
    raw.zones[0]!['temperatures'] = ['sensor.a', { id: 'climate.b', attribute: 'current_temperature' }];
    const ok = parseSiteConfig(raw, { knownStrategies: defaultStrategies().ids });
    expect(ok.ok && ok.config.zones[0]!.temperatures?.map((t) => t.id)).toEqual(['sensor.a', 'climate.b']);
    raw.zones[0]!['temperatures'] = [];
    expect(parseSiteConfig(raw, { knownStrategies: defaultStrategies().ids }).ok).toBe(false);
  });

  it('zet de keuze uit de indeling in de configuratie, alleen voor kamers met een regeling', () => {
    const raw = JSON.parse(JSON.stringify(exampleSite)) as Record<string, unknown>;
    const layout = { kamers: [
      { id: 'zolder', naam: 'Zolder', etage: 'e2', zones: [], regelzone: 'zolder', haGebied: null, meten: ['sensor.zolder', 'climate.knop'] },
      { id: 'hal', naam: 'Hal', etage: 'bg', zones: [], regelzone: null, haGebied: null, meten: ['sensor.hal'] },
    ] };
    const uit = withMeasurement(raw, layout);
    expect(uit.toegevoegd).toEqual(['Zolder meet met 2 sensoren']);
    const z = (uit.raw['zones'] as Record<string, unknown>[]).find((x) => x['id'] === 'zolder')!;
    expect(z['temperature']).toBe('sensor.zolder');
    expect(z['temperatures']).toEqual(['sensor.zolder', { id: 'climate.knop', attribute: 'current_temperature' }]);
    expect(parseSiteConfig(uit.raw, { knownStrategies: defaultStrategies().ids }).ok).toBe(true);
    // Zonder keuze: zoals het was.
    expect(withMeasurement(raw, null)).toEqual({ raw, toegevoegd: [] });
    expect(pointFor('sensor.x')).toBe('sensor.x');
  });

  it('meet met een apparaat van de regeling via de entiteit erachter, zoals "nest" (hersteld 15 oktober)', () => {
    const raw = JSON.parse(JSON.stringify(exampleSite)) as Record<string, unknown>;
    const layout = { kamers: [{ id: 'woonkamer', naam: 'Beneden', etage: 'bg', zones: [], regelzone: 'woonkamer', haGebied: null, meten: ['nest', 'ac-woonkamer'] }] };
    const uit = withMeasurement(raw, layout);
    const z = (uit.raw['zones'] as Record<string, unknown>[]).find((x) => x['id'] === 'woonkamer')!;
    expect(z['temperatures']).toEqual([
      { id: 'climate.beneden', attribute: 'current_temperature' },
      { id: 'climate.air_conditioning_woonkamer', attribute: 'current_temperature' },
    ]);
    const ok = parseSiteConfig(uit.raw, { knownStrategies: defaultStrategies().ids });
    expect(ok.ok).toBe(true);
  });

  it('schrijft welke sensoren meetellen in het logboek, alleen als het verandert', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-meten-'));
    expect(await noteSensors(dir, exampleSite, NOW)).toBe(true);
    expect(await noteSensors(dir, exampleSite, NOW + 1000)).toBe(false);
    expect(await noteSensors(dir, metTwee, NOW + 2000)).toBe(true);
    const regels = (await readFile(join(dir, SENSOR_LOG_FILE), 'utf-8')).trim().split('\n').map((l) => JSON.parse(l) as { tMs: number; zones: Record<string, string[]> });
    expect(regels.map((r) => r.tMs)).toEqual([NOW, NOW + 2000]);
    expect(regels[1]!.zones['zolder']).toEqual([zolder.temperature.id, 'climate.knop_zolder#current_temperature']);
  });
});
