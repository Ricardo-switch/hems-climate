/**
 * Een klein huis om het huis als navigatie mee te toetsen: drie etages en een
 * tuin, een woonkamer met airco, Nest, twee lampen en een screen, een lamp die
 * nergens hangt, en een lampgroep die niet mag meetellen.
 */

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import type { HouseRegisters } from '../src/web/house.js';
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

export const registers: HouseRegisters = {
  floors: [
    { floor_id: 'bg', name: 'Begane grond', level: 0 },
    { floor_id: 'zolder', name: 'Zolder', level: 2 },
    { floor_id: 'e1', name: 'Eerste verdieping', level: 1 },
    { floor_id: 'dak', name: 'Dak', level: 3 },
  ],
  areas: [
    { area_id: 'woonkamer', name: 'Woonkamer', floor_id: 'bg' },
    { area_id: 'badkamer', name: 'Badkamer', floor_id: 'e1' },
    { area_id: 'zolder', name: 'Zolder', floor_id: 'zolder' },
    { area_id: 'tuin', name: 'Tuin', floor_id: null },
    { area_id: 'berging', name: 'Berging', floor_id: 'bg' },
    { area_id: 'oprit', name: 'Oprit', floor_id: 'bg' },
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
    { id: 'd-oprit', area_id: 'oprit' },
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
    entity('light.oprit', 'd-oprit'),
    entity('light.uitgezet', 'd-plaf', { disabled_by: 'user' }),
    entity('light.zwerver', 'd-nergens'),
  ],
};

export const states = new Map<string, HaEntityState>([
  ['light.woonkamer_plafonniere', state('light.woonkamer_plafonniere', 'on', { friendly_name: 'Woonkamer plafonnière', brightness: 178 })],
  ['light.sfeerverlichting', state('light.sfeerverlichting', 'on', { friendly_name: 'Sfeerverlichting' })],
  ['light.woonkamer_alles', state('light.woonkamer_alles', 'on', { friendly_name: 'Woonkamer alles', entity_id: ['light.woonkamer_plafonniere'] })],
  ['cover.screen', state('cover.screen', 'open', { friendly_name: 'Screen', current_position: 40 })],
  ['cover.screen_low_speed', state('cover.screen_low_speed', 'open', { friendly_name: 'Screen low speed', current_position: 40 })],
  ['light.achtertuin', state('light.achtertuin', 'off', { friendly_name: 'Achtertuin' })],
]);

export const snapshot: DecisionView = {
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
