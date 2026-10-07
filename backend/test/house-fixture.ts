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
    { area_id: 'hal', name: 'Hal', floor_id: 'bg' },
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
    { id: 'd-keuken', area_id: 'woonkamer' },
    { id: 'd-badspot-1', area_id: 'badkamer', name: 'Badkamer spot 1' },
    { id: 'd-badspot-2', area_id: 'badkamer', name: 'Hue spot', name_by_user: 'Badkamer spot 2' },
    { id: 'd-zolderspot', area_id: 'zolder', name: 'Zolderspot' },
    { id: 'd-bureaulamp', area_id: 'zolder', name: 'Bureaulamp' },
    { id: 'd-halsensor', area_id: 'hal', name: 'Bewegingssensor hal' },
    { id: 'd-nas', area_id: 'hal', name: 'NAS' },
    { id: 'd-f1', area_id: null, name: 'F1' },
    // De Hue-kamer van de zolder, met zijn scènes (besluit 100).
    { id: 'd-hue-zolder', area_id: 'zolder', name: 'Zolderkamer' },
  ],
  entities: [
    entity(ref('ac-woonkamer'), 'd-ac-wk'),
    entity(ref('nest'), 'd-nest'),
    entity(zoneTemp('woonkamer'), 'd-nest', { device_class: 'temperature' }),
    entity('sensor.beneden_luchtvochtigheid', 'd-nest', { device_class: 'humidity' }),
    entity(ref('ac-zolder'), 'd-ac-z'),
    entity(ref('badkamer'), 'd-bad'),
    entity('light.woonkamer_plafonniere', 'd-plaf'),
    entity('scene.zolderkamer_helder', 'd-hue-zolder'),
    entity('light.sfeerverlichting', 'd-sfeer'),
    entity('light.woonkamer_alles', null, { area_id: 'woonkamer' }),
    entity('cover.screen', 'd-screen'),
    entity('cover.screen_low_speed', 'd-screen'),
    entity('light.achtertuin', 'd-tuin'),
    entity('light.oprit', 'd-oprit'),
    entity('light.uitgezet', 'd-plaf', { disabled_by: 'user' }),
    entity('light.zwerver', 'd-nergens'),
    entity('light.tuin_alles', null),
    entity('light.hue_keuken', null),
    // De keukenlamp: drie peren, verborgen achter de Hue-kamer "Keuken".
    entity('light.keukentafel_1', 'd-keuken', { hidden_by: 'user' }),
    entity('light.keukentafel_2', 'd-keuken', { hidden_by: 'user' }),
    entity('light.keukentafel_3', 'd-keuken', { hidden_by: 'user' }),
    entity('light.hue_sfeer', null),
    // De badkamerspots: uitgezet, dus zonder toestand; de Hue-kamer noemt ze bij naam.
    entity('light.badkamer_spot_1', 'd-badspot-1', { disabled_by: 'user' }),
    entity('light.badkamer_spot_2', 'd-badspot-2', { disabled_by: 'user' }),
    entity('light.hue_badkamer', null),
    // Een uitgezette groep van Home Assistant, nog genoemd in "Tuin alles".
    entity('light.oude_groep', null, { disabled_by: 'user', platform: 'group' }),
    // Een uitgezette spot die alleen nog in "Etage 2 alles" zit: die groep is geen lamp.
    entity('light.zolder_spot', 'd-zolderspot', { disabled_by: 'user' }),
    entity('light.etage2_alles', null, { platform: 'group' }),
    // Een brandende lamp op de bovenste etage: daar staat het dak in de tekening.
    entity('light.bureaulamp', 'd-bureaulamp'),
    // Meters: een bewegingssensor in de hal meet temperatuur en luchtvochtigheid.
    entity('sensor.bewegingssensor_hal_temperatuur', 'd-halsensor', { original_device_class: 'temperature', original_name: 'Temperatuur' }),
    entity('sensor.bewegingssensor_hal_luchtvochtigheid', 'd-halsensor', { original_device_class: 'humidity', original_name: 'Luchtvochtigheid' }),
    // Geen meters: een schijf van de NAS, het weer, en het weer van een raceweekend.
    entity('sensor.nas_temperatuur', 'd-nas', { device_class: 'temperature', entity_category: 'diagnostic' }),
    entity('sensor.temperatuur', null, { device_class: 'temperature', platform: 'buienradar' }),
    entity('sensor.f1_track_weather', 'd-f1', { device_class: 'temperature', platform: 'f1_sensor' }),
  ],
};

export const states = new Map<string, HaEntityState>([
  ['light.woonkamer_plafonniere', state('light.woonkamer_plafonniere', 'on', { friendly_name: 'Woonkamer plafonnière', brightness: 178, supported_color_modes: ['color_temp'] })],
  ['light.sfeerverlichting', state('light.sfeerverlichting', 'on', { friendly_name: 'Sfeerverlichting', supported_color_modes: ['color_temp', 'hs'], color_mode: 'hs', hs_color: [30, 80], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 })],
  // Scènes (besluit 100): uit Hue met de naam van de Hue-kamer, uit Home Assistant
  // met zijn lampen, en een van een ruimte die er niet is.
  ['scene.keuken_lezen', state('scene.keuken_lezen', '2026-10-05T07:00:00+00:00', { friendly_name: 'Keuken Lezen', group_name: 'Keuken', name: 'Lezen' })],
  ['scene.ontspannen', state('scene.ontspannen', '2026-10-05T07:30:00+00:00', { friendly_name: 'Ontspannen', entity_id: ['light.woonkamer_plafonniere', 'light.sfeerverlichting'] })],
  // Een Hue-kamer met een naam die geen lamp of ruimte kent: via het gebied van zijn apparaat.
  ['scene.zolderkamer_helder', state('scene.zolderkamer_helder', '2026-10-05T06:00:00+00:00', { friendly_name: 'Zolderkamer Helder', group_name: 'Zolderkamer', name: 'Helder' })],
  ['scene.garage_feest', state('scene.garage_feest', '2026-10-05T08:00:00+00:00', { friendly_name: 'Garage Feest', group_name: 'Garage', name: 'Feest' })],
  ['light.woonkamer_alles', state('light.woonkamer_alles', 'on', { friendly_name: 'Woonkamer alles', entity_id: ['light.woonkamer_plafonniere'] })],
  ['cover.screen', state('cover.screen', 'open', { friendly_name: 'Screen', current_position: 40 })],
  ['cover.screen_low_speed', state('cover.screen_low_speed', 'open', { friendly_name: 'Screen low speed', current_position: 40 })],
  ['light.achtertuin', state('light.achtertuin', 'off', { friendly_name: 'Achtertuin' })],
  // Een groep die een lamp zonder gebied bevat, en een Hue-kamer die zijn lampen alleen bij naam noemt.
  ['light.tuin_alles', state('light.tuin_alles', 'off', { friendly_name: 'Tuin alles', entity_id: ['light.zwerver', 'light.oude_groep'] })],
  ['light.hue_keuken', state('light.hue_keuken', 'on', { friendly_name: 'Keuken', is_hue_group: true, lights: ['Keukentafel 1', 'Keukentafel 2', 'Keukentafel 3'], brightness: 128 })],
  ['light.keukentafel_1', state('light.keukentafel_1', 'on', { friendly_name: 'Keukentafel 1' })],
  ['light.keukentafel_2', state('light.keukentafel_2', 'on', { friendly_name: 'Keukentafel 2' })],
  ['light.keukentafel_3', state('light.keukentafel_3', 'on', { friendly_name: 'Keukentafel 3' })],
  // Een Hue-zone met een zichtbare lamp: alleen context, geen armatuur.
  ['light.hue_sfeer', state('light.hue_sfeer', 'on', { friendly_name: 'Sfeer', is_hue_group: true, lights: ['Sfeerverlichting'] })],
  [zoneTemp('woonkamer'), state(zoneTemp('woonkamer'), '21.9', { device_class: 'temperature' })],
  ['sensor.beneden_luchtvochtigheid', state('sensor.beneden_luchtvochtigheid', '55', { device_class: 'humidity' })],
  [ref('ac-woonkamer'), state(ref('ac-woonkamer'), 'cool', { current_temperature: 22.4, temperature: 22, hvac_action: 'cooling' })],
  ['sensor.bewegingssensor_hal_temperatuur', state('sensor.bewegingssensor_hal_temperatuur', '19.5')],
  ['sensor.bewegingssensor_hal_luchtvochtigheid', state('sensor.bewegingssensor_hal_luchtvochtigheid', '61.4')],
  ['sensor.nas_temperatuur', state('sensor.nas_temperatuur', '41')],
  ['sensor.temperatuur', state('sensor.temperatuur', '13')],
  ['sensor.f1_track_weather', state('sensor.f1_track_weather', '30')],
  // Een Hue-kamer met alleen uitgezette lampen: die is zelf de lamp.
  ['light.etage2_alles', state('light.etage2_alles', 'on', { friendly_name: 'Etage 2 alles', entity_id: ['light.zolder_spot'] })],
  ['light.bureaulamp', state('light.bureaulamp', 'on', { friendly_name: 'Bureaulamp' })],
  ['light.hue_badkamer', state('light.hue_badkamer', 'off', { friendly_name: 'Badkamer', is_hue_group: true, lights: ['Badkamer spot 1', 'Badkamer spot 2'] })],
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
