/*
 * Verwarmen en koelen per kamer (besluit 132): wat de bewoner vastlegt, en
 * wat de regeling ermee doet als een elektrische bron op zon mag.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { controleerBronnen, withHeatSources } from '../src/web/warmte.js';
import { validateLayout } from '../src/web/layout.js';
import { exampleSitePath } from './site.js';

const raw = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
const opties = { knownStrategies: defaultStrategies().ids };

describe('de bronnen van een kamer', () => {
  it('neemt vloer en paneel samen, met een thermostaat en een vermogen', () => {
    const c = controleerBronnen('badkamer', [{ id: 'b1', soorten: ['vloer-elektrisch', 'paneel'], aan: 'thermostaat', apparaat: 'badkamer', vermogenW: 1150, opZon: true }]);
    expect(c).toEqual({ ok: true, bronnen: [{ id: 'b1', soorten: ['vloer-elektrisch', 'paneel'], aan: 'thermostaat', apparaat: 'badkamer', vermogenW: 1150, opZon: true }] });
  });

  it('vergeet vermogen, apparaat en zon bij wat met de hand gaat', () => {
    const c = controleerBronnen('hobby', [{ id: 'p', soorten: ['paneel'], aan: 'hand', apparaat: 'switch.x', vermogenW: 700, opZon: true }]);
    expect(c).toEqual({ ok: true, bronnen: [{ id: 'p', soorten: ['paneel'], aan: 'hand' }] });
  });

  it('vergeet vermogen en zon bij wat niet elektrisch is', () => {
    const c = controleerBronnen('woon', [{ id: 'r', soorten: ['radiator'], aan: 'knop', apparaat: 'climate.knop', vermogenW: 900, opZon: true }]);
    expect(c).toEqual({ ok: true, bronnen: [{ id: 'r', soorten: ['radiator'], aan: 'knop', apparaat: 'climate.knop' }] });
  });

  it('weigert wat niet kan', () => {
    for (const fout of [
      'geen lijst',
      [{ id: 'x', soorten: [], aan: 'hand' }],
      [{ id: 'x', soorten: ['open haard'], aan: 'hand' }],
      [{ id: 'x', soorten: ['paneel'], aan: 'misschien' }],
      [{ id: 'x', soorten: ['paneel'], aan: 'stekker', vermogenW: 20 }],
      [{ id: 'x', soorten: ['paneel'], aan: 'hand' }, { id: 'x', soorten: ['kachel'], aan: 'hand' }],
    ]) {
      expect(controleerBronnen('k', fout).ok).toBe(false);
    }
  });

  it('laat in de indeling een apparaat weg dat het huis niet meer kent, en daarmee de zon', () => {
    const indeling = {
      versie: 1,
      etages: {},
      kamers: [{ id: 'bad', naam: 'Badkamer', etage: 'e1', zones: [], regelzone: 'badkamer', haGebied: null, bronnen: [{ id: 'b1', soorten: ['paneel'], aan: 'thermostaat', apparaat: 'weg', vermogenW: 800, opZon: true }] }],
      apparaten: {},
    };
    const uit = validateLayout(indeling, { deviceIds: new Set(['badkamer']), zoneIds: new Set(['badkamer']) });
    expect(uit.ok && uit.layout.kamers[0]?.bronnen).toEqual([{ id: 'b1', soorten: ['paneel'], aan: 'thermostaat', vermogenW: 800 }]);
  });
});

describe('op zon in de regeling', () => {
  const kamers = [{ regelzone: 'badkamer', bronnen: [{ id: 'b1', soorten: ['vloer-elektrisch' as const], aan: 'thermostaat' as const, apparaat: 'badkamer', vermogenW: 1150, opZon: true }] }];

  it('laat het apparaat ook op zon draaien, met zijn vermogen, en de zone buffert', () => {
    const met = withHeatSources(raw, kamers);
    const parsed = parseSiteConfig(met.raw, opties);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const a = parsed.config.actuators.find((x) => x.id === 'badkamer');
    expect(a?.onSurplus).toBe(true);
    expect(a?.power.estimatedW).toBe(1150);
    expect(parsed.config.zones.find((z) => z.id === 'badkamer')?.buffering).toMatchObject({ enabled: true, bandC: 1 });
    expect(met.toegevoegd.join()).toContain('1150 W');
  });

  it('doet niets voor een apparaat buiten de zone, of zonder op zon', () => {
    expect(withHeatSources(raw, [{ regelzone: 'zolder', bronnen: kamers[0]!.bronnen }]).raw).toBe(raw);
    // Zonder op zon geen budget en geen buffer, wel het typeplaatje voor de hoofdzekering (besluit 178).
    const zonder = withHeatSources(raw, [{ regelzone: 'badkamer', bronnen: [{ ...kamers[0]!.bronnen[0]!, opZon: false }] }]);
    const bad = (zonder.raw['actuators'] as Record<string, unknown>[]).find((a) => a['id'] === 'badkamer')!;
    expect(bad['onSurplus']).toBeUndefined();
    expect(bad['power']).toMatchObject({ estimatedW: 0, ratedW: kamers[0]!.bronnen[0]!.vermogenW });
    expect(zonder.raw['zones']).toEqual(raw['zones']);
    expect(parseSiteConfig(zonder.raw, opties).ok).toBe(true);
    expect(withHeatSources(raw, null).raw).toBe(raw);
  });

  it('weigert een apparaat op zon zonder vermogen', () => {
    const acts = (raw['actuators'] as Record<string, unknown>[]).map((a) => (a['id'] === 'badkamer' ? { ...a, onSurplus: true, power: { estimatedW: 0 } } : a));
    expect(parseSiteConfig({ ...raw, actuators: acts }, opties).ok).toBe(false);
  });
});
