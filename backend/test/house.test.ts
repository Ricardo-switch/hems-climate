/**
 * Het huis als navigatie (ONTWERP §4): etages, ruimtes en de apparaten erin.
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { buildHouse, type HouseRegisters } from '../src/web/house.js';
import type { DecisionView } from '../src/web/assistant.js';
import { exampleSite } from './site.js';

const config = exampleSite;
const ref = (id: string) => config.actuators.find((a) => a.id === id)!.ref.id;
const zoneTemp = (id: string) => config.zones.find((z) => z.id === id)!.temperature.id;

const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}): HaEntityState => ({
  entity_id,
  state: s,
  attributes,
  last_changed: '2026-10-05T08:00:00Z',
  last_updated: '2026-10-05T08:00:00Z',
});

const entity = (entity_id: string, device_id: string | null, extra: Partial<HaRegistryEntity> = {}): HaRegistryEntity => ({
  entity_id,
  device_id,
  ...extra,
});

const registers: HouseRegisters = {
  floors: [
    { floor_id: 'bg', name: 'Begane grond', level: 0 },
    { floor_id: 'zolder', name: 'Zolder', level: 2 },
    { floor_id: 'e1', name: 'Eerste verdieping', level: 1 },
  ],
  areas: [
    { area_id: 'woonkamer', name: 'Woonkamer', floor_id: 'bg' },
    { area_id: 'badkamer', name: 'Badkamer', floor_id: 'e1' },
    { area_id: 'zolder', name: 'Zolder', floor_id: 'zolder' },
    { area_id: 'tuin', name: 'Tuin', floor_id: null },
    { area_id: 'berging', name: 'Berging', floor_id: 'bg' },
  ],
  devices: [
    { id: 'd-ac-wk', area_id: 'woonkamer' },
    { id: 'd-nest', area_id: 'woonkamer' },
    { id: 'd-ac-z', area_id: 'zolder' },
    { id: 'd-bad', area_id: 'badkamer' },
    { id: 'd-plaf', area_id: 'woonkamer' },
    { id: 'd-sfeer', area_id: 'woonkamer' },
    { id: 'd-screen', area_id: 'woonkamer' },
    { id: 'd-tuin', area_id: 'tuin' },
  ],
  entities: [
    entity(ref('ac-woonkamer'), 'd-ac-wk'),
    entity(ref('nest'), 'd-nest'),
    entity(zoneTemp('woonkamer'), 'd-nest'),
    entity(ref('ac-zolder'), 'd-ac-z'),
    entity(ref('badkamer'), 'd-bad'),
    entity('light.woonkamer_plafonniere', 'd-plaf'),
    entity('light.sfeerverlichting', 'd-sfeer'),
    entity('light.woonkamer_alles', null, { area_id: 'woonkamer' }),
    entity('cover.screen', 'd-screen'),
    entity('cover.screen_low_speed', 'd-screen'),
    entity('light.achtertuin', 'd-tuin'),
    entity('light.uitgezet', 'd-plaf', { disabled_by: 'user' }),
  ],
};

const states = new Map<string, HaEntityState>([
  ['light.woonkamer_plafonniere', state('light.woonkamer_plafonniere', 'on', { friendly_name: 'Woonkamer plafonnière', brightness: 178 })],
  ['light.sfeerverlichting', state('light.sfeerverlichting', 'on', { friendly_name: 'Sfeerverlichting' })],
  ['light.woonkamer_alles', state('light.woonkamer_alles', 'on', { friendly_name: 'Woonkamer alles', entity_id: ['light.woonkamer_plafonniere'] })],
  ['cover.screen', state('cover.screen', 'open', { friendly_name: 'Screen', current_position: 40 })],
  ['cover.screen_low_speed', state('cover.screen_low_speed', 'open', { friendly_name: 'Screen low speed', current_position: 40 })],
  ['light.achtertuin', state('light.achtertuin', 'off', { friendly_name: 'Achtertuin' })],
]);

const snapshot: DecisionView = {
  atMs: Date.parse('2026-10-05T08:00:00Z'),
  explanation: {
    mode: 'dag',
    modeSource: 'schedule',
    occupied: true,
    budget: { availableW: 0, allocatedW: 0, surplusW: 0, reclaimableW: 0, gridPowerW: 400 },
    failsafe: { active: false, unreliable: [] },
    perZone: [
      { zoneId: 'woonkamer', temperatureC: 21.9, humidityPct: 55, targetC: 20, heatTargetC: 20, coolTargetC: 25, demand: 'none', reason: 'zone_satisfied' },
      { zoneId: 'badkamer', temperatureC: 21, humidityPct: null, targetC: 20, demand: 'none', reason: 'zone_satisfied' },
      { zoneId: 'zolder', temperatureC: 23.2, humidityPct: null, targetC: 22.5, demand: 'none', reason: 'zone_satisfied' },
    ],
    outdoorTemperatureC: 12,
    solarProductionW: 900,
  },
  commands: [],
  accepted: [],
  rejected: [],
  observed: { nest: 'off', badkamer: 'off@18', 'ac-woonkamer': 'cool@22', 'ac-zolder': 'off' },
};

describe('het huis als navigatie', () => {
  const house = buildHouse(config, registers, states, snapshot);

  it('zet de etages van boven naar beneden, en wat buiten valt apart', () => {
    expect(house.etages.map((e) => e.naam)).toEqual(['Zolder', 'Eerste verdieping', 'Begane grond', 'Zonder etage']);
    expect(house.etages.at(-1)!.ruimtes.map((r) => r.naam)).toEqual(['Tuin']);
  });

  it('laat ruimtes zonder iets erin weg', () => {
    expect(house.etages.flatMap((e) => e.ruimtes).some((r) => r.naam === 'Berging')).toBe(false);
  });

  it('koppelt de ruimte aan de zone, met temperatuur en de zin van de assistent', () => {
    const wk = house.etages.find((e) => e.naam === 'Begane grond')!.ruimtes[0]!;
    expect(wk.zoneId).toBe('woonkamer');
    expect(wk.temperatuurC).toBe(21.9);
    expect(wk.status?.soort).toBe('ok');
    expect(wk.status?.zin).toContain('heeft niets nodig');
  });

  it('toont lampen, zonwering en klimaat, zonder groepen of uitgezette entiteiten', () => {
    const wk = house.etages.find((e) => e.naam === 'Begane grond')!.ruimtes[0]!;
    expect(wk.apparaten.map((d) => [d.soort, d.naam, d.stand])).toEqual([
      ['klimaat', 'Airco woonkamer', 'koelen naar 22°'],
      ['klimaat', 'Nest (beneden)', 'uit'],
      ['screen', 'Screen', '60% dicht'],
      ['licht', 'Plafonnière', 'aan · 70%'],
      ['licht', 'Sfeerverlichting', 'aan'],
    ]);
    expect(wk.lampenAan).toBe(2);
    expect(house.lampenAan).toBe(2);
  });

  it('valt terug op één etage als Home Assistant er geen kent', () => {
    const flat = buildHouse(config, { ...registers, floors: [] }, states, null);
    expect(flat.etages.map((e) => e.naam)).toEqual(['Huis']);
    expect(flat.etages[0]!.ruimtes.find((r) => r.naam === 'Woonkamer')!.status).toBeNull();
  });
});
