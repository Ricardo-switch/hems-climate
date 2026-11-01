/*
 * Het voorbeeldhuis (besluit 237): een verzonnen huis met alles erin, zoals
 * Home Assistant het zou kennen. De registers (etages, ruimtes, apparaten,
 * entiteiten), de configuratie van SunArc, en de standen van alle entiteiten
 * op een moment van de dag (dag.ts), met wat de bezoeker zelf aanzette.
 *
 * De klimaatapparaten dragen dezelfde namen als in het eerste huis, zodat de
 * knoppen van klimaat met de hand (hand.ts, besluit 235) er ook werken. Er
 * staan geen namen van echte mensen in: de bewoners heten Sam en Noa.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaArea, HaDevice, HaFloor, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import { type Klok, type Moment, ZON, moment } from './dag.js';

/* ---- de configuratie van SunArc voor dit huis ---- */

const actuator = (id: string, name: string, ref: string, role: 'primary' | 'assist', heat: boolean, cool: boolean, range: [number, number], power: Record<string, unknown>) => ({
  id,
  name,
  ref,
  role,
  capabilities: { canHeat: heat, canCool: cool, setpointRange: range, ...(role === 'assist' ? { standby: { heat: 18, cool: 25 } } : {}) },
  power,
  timing: role === 'assist' ? { minRunMinutes: 15, minRestMinutes: 5, settleMinutes: 3 } : { minRunMinutes: 10, minRestMinutes: 5, settleMinutes: 2 },
});

/** De configuratie zoals een bewoner hem na Inrichten zou hebben, als ruw bestand. */
export const VOORBEELD_SITE = {
  schemaVersion: 1,
  id: 'voorbeeldhuis',
  timezone: 'Europe/Amsterdam',
  defaultAdapter: 'homeassistant',
  power: { gridPower: 'sensor.p1_vermogen', startSurplusW: 1000, stopImportW: 50, resumeSurplusW: 600, stabilisationMinutes: 5 },
  schedule: { preheatFromHour: 6, dayFromHour: 7, nightFromHour: 22, eveningExtensionLights: ['light.woonkamer_sfeer'] },
  occupancy: [
    { id: 'sam', ref: 'person.sam' },
    { id: 'noa', ref: 'person.noa' },
  ],
  actuators: [
    actuator('nest', 'Warmtepomp', 'climate.beneden', 'primary', true, false, [12, 24], { sensor: 'sensor.warmtepomp_vermogen', estimatedW: 1100 }),
    actuator('badkamer', 'Thermostaat badkamer', 'climate.thermostaat_badkamer', 'primary', true, false, [16, 24], { estimatedW: 0 }),
    actuator('ac-woonkamer', 'Airco woonkamer', 'climate.air_conditioning_woonkamer', 'assist', true, true, [16, 30], { sensor: 'sensor.airco_woonkamer_vermogen', estimatedW: 900 }),
    actuator('ac-zolder', 'Airco zolder', 'climate.air_conditioning_zolder', 'assist', true, true, [16, 30], { sensor: 'sensor.airco_zolder_vermogen', estimatedW: 750 }),
  ],
  zones: [
    {
      id: 'woonkamer',
      name: 'Woonkamer',
      temperature: 'sensor.woonkamer_temperatuur',
      humidity: 'sensor.woonkamer_luchtvochtigheid',
      actuatorIds: ['nest', 'ac-woonkamer'],
      priority: 1,
      thermalMass: 'high',
      hysteresis: { onDelta: 0.3, offDelta: 0.2 },
      comfortMaxC: 26,
      buffering: { enabled: true, bandC: 1 },
      setpoints: { dag: { heat: 20.5, cool: 23 }, nacht: {}, voorverwarmen: { heat: 19.5 }, afwezig: { heat: 16, cool: 24 }, vakantie: { heat: 12 }, handmatig: {} },
    },
    {
      id: 'badkamer',
      name: 'Badkamer',
      temperature: 'sensor.badkamer_temperatuur',
      actuatorIds: ['badkamer'],
      priority: 2,
      thermalMass: 'low',
      hysteresis: { onDelta: 0.3, offDelta: 0.2 },
      buffering: { enabled: false, bandC: 0 },
      setpoints: { dag: { heat: 21 }, nacht: { heat: 17 }, voorverwarmen: { heat: 21 }, afwezig: {}, vakantie: {}, handmatig: {} },
    },
    {
      id: 'zolder',
      name: 'Zolder',
      temperature: 'sensor.zolder_temperatuur',
      actuatorIds: ['ac-zolder'],
      priority: 3,
      thermalMass: 'low',
      hysteresis: { onDelta: 0, offDelta: 0.5 },
      comfortMaxC: 26,
      buffering: { enabled: true, bandC: 1 },
      setpoints: { dag: { heat: 18, cool: 23 }, nacht: {}, voorverwarmen: { heat: 18 }, afwezig: { cool: 24 }, vakantie: {}, handmatig: {} },
    },
  ],
  enabledStrategies: ['comfort', 'heat-assist', 'pv-surplus'],
  criticalInputs: ['climate.beneden', 'climate.air_conditioning_woonkamer', 'climate.air_conditioning_zolder', 'sensor.zolder_temperatuur', 'sensor.p1_vermogen'],
  migration: {
    legacyExplanation: 'sensor.airco_assist_reden',
    setpoints: {
      woonkamer: { dag: { heat: 'input_number.temp_nest_dag', cool: 'input_number.temp_airco_woonkamer_koelen' }, voorverwarmen: { heat: 'input_number.temp_nest_voorwarm' }, afwezig: { heat: 'input_number.temp_nest_eco' } },
      badkamer: { dag: { heat: 'input_number.badkamer_heat_off_temp_dag' }, voorverwarmen: { heat: 'input_number.badkamer_heat_off_temp_dag' } },
      zolder: { dag: { heat: 'input_number.temp_airco_zolder', cool: 'input_number.temp_airco_zolder_koelen' }, voorverwarmen: { heat: 'input_number.temp_airco_zolder' } },
    },
    power: { startSurplusW: 'input_number.pv_klimaat_start_overschot_w', stopImportW: 'input_number.pv_klimaat_stop_import_w' },
  },
  mode: {
    select: 'input_select.verwarming_modus',
    automatic: 'automatisch',
    aliases: { dag: 'dag', nacht: 'nacht', voorverwarmen: 'voorverwarmen', afwezig: 'afwezig', vakantie: 'vakantie', koelen: 'dag', handmatig: 'handmatig' },
    handsOffWhen: [{ ref: 'input_select.koel_strategie', state: 'Handmatig koelen' }],
  },
  timers: { manualOverride: 'timer.verwarming_handmatig' },
  sun: 'sun.sun',
  outdoorTemperature: 'sensor.buiten_temperatuur',
  solarProduction: 'sensor.omvormer_vermogen',
  deferrables: [
    {
      id: 'droger',
      name: 'Droger',
      remoteStart: 'binary_sensor.droger_op_afstand',
      operationState: 'sensor.droger_status',
      estimatedW: 700,
      latestStart: '16:00',
      programDuration: 'sensor.droger_programmaduur',
    },
  ],
  grid: {
    phases: [
      { id: 'L1', current: 'sensor.p1_stroom_fase_1', voltage: 'sensor.p1_spanning_fase_1', maxA: 25 },
      { id: 'L2', current: 'sensor.p1_stroom_fase_2', voltage: 'sensor.p1_spanning_fase_2', maxA: 25 },
      { id: 'L3', current: 'sensor.p1_stroom_fase_3', voltage: 'sensor.p1_spanning_fase_3', maxA: 25 },
    ],
    marginA: 2,
  },
  geometry: {
    facades: [
      { id: 'voorgevel', name: 'Voorgevel', azimuthDeg: 180, zoneIds: ['woonkamer'], source: 'schatting' },
      { id: 'achtergevel', name: 'Achtergevel', azimuthDeg: 0, zoneIds: ['woonkamer'], source: 'schatting' },
    ],
    solarPlanes: [{ id: 'dak-zuid', azimuthDeg: 180, tiltDeg: 40, peakW: 4800, source: 'schatting' }],
    inverterMaxW: 5000,
  },
  recordOnly: ['cover.screen_slaapkamer', 'cover.screen_woonkamer'],
} as const;

/* ---- de registers van Home Assistant ---- */

export const ETAGES: readonly HaFloor[] = [
  { floor_id: 'bg', name: 'Begane grond', level: 0 },
  { floor_id: 'e1', name: 'Eerste verdieping', level: 1 },
  { floor_id: 'zolder', name: 'Zolder', level: 2 },
];

export const RUIMTES: readonly HaArea[] = [
  { area_id: 'woonkamer', name: 'Woonkamer', floor_id: 'bg' },
  { area_id: 'keuken', name: 'Keuken', floor_id: 'bg' },
  { area_id: 'hal', name: 'Hal', floor_id: 'bg' },
  { area_id: 'badkamer', name: 'Badkamer', floor_id: 'e1' },
  { area_id: 'slaapkamer', name: 'Slaapkamer', floor_id: 'e1' },
  { area_id: 'kinderkamer', name: 'Kinderkamer', floor_id: 'e1' },
  { area_id: 'zolder', name: 'Zolder', floor_id: 'zolder' },
  { area_id: 'tuin', name: 'Tuin', floor_id: null },
  { area_id: 'oprit', name: 'Oprit', floor_id: null },
];

/** Eén apparaat met zijn entiteiten: [entity_id, wat erbij hoort]. */
interface Toestel {
  readonly id: string;
  readonly naam: string;
  readonly ruimte: string | null;
  readonly merk?: string;
  readonly model?: string;
  readonly platform?: string;
  readonly entiteiten: readonly (readonly [string, Partial<HaRegistryEntity>?])[];
}

const meter = (klasse: string, naam?: string): Partial<HaRegistryEntity> => ({ original_device_class: klasse, ...(naam ? { original_name: naam } : {}) });

const TOESTELLEN: readonly Toestel[] = [
  { id: 'd-warmtepomp', naam: 'Warmtepomp', ruimte: 'woonkamer', merk: 'Daikin', model: 'Altherma', entiteiten: [['climate.beneden'], ['sensor.warmtepomp_vermogen', meter('power', 'Vermogen')]] },
  { id: 'd-airco-wk', naam: 'Airco woonkamer', ruimte: 'woonkamer', merk: 'Daikin', entiteiten: [['climate.air_conditioning_woonkamer'], ['sensor.airco_woonkamer_vermogen', meter('power', 'Vermogen')]] },
  { id: 'd-airco-z', naam: 'Airco zolder', ruimte: 'zolder', merk: 'Daikin', entiteiten: [['climate.air_conditioning_zolder'], ['sensor.airco_zolder_vermogen', meter('power', 'Vermogen')]] },
  { id: 'd-bad', naam: 'Thermostaat badkamer', ruimte: 'badkamer', entiteiten: [['climate.thermostaat_badkamer']] },
  { id: 'd-meter-wk', naam: 'Meter woonkamer', ruimte: 'woonkamer', entiteiten: [['sensor.woonkamer_temperatuur', meter('temperature', 'Temperatuur')], ['sensor.woonkamer_luchtvochtigheid', meter('humidity', 'Luchtvochtigheid')]] },
  { id: 'd-meter-keuken', naam: 'Meter keuken', ruimte: 'keuken', entiteiten: [['sensor.keuken_temperatuur', meter('temperature', 'Temperatuur')]] },
  { id: 'd-meter-bad', naam: 'Meter badkamer', ruimte: 'badkamer', entiteiten: [['sensor.badkamer_temperatuur', meter('temperature', 'Temperatuur')]] },
  { id: 'd-meter-sk', naam: 'Meter slaapkamer', ruimte: 'slaapkamer', entiteiten: [['sensor.slaapkamer_temperatuur', meter('temperature', 'Temperatuur')]] },
  { id: 'd-meter-kk', naam: 'Meter kinderkamer', ruimte: 'kinderkamer', entiteiten: [['sensor.kinderkamer_temperatuur', meter('temperature', 'Temperatuur')]] },
  { id: 'd-meter-z', naam: 'Meter zolder', ruimte: 'zolder', entiteiten: [['sensor.zolder_temperatuur', meter('temperature', 'Temperatuur')], ['binary_sensor.zolder_beweging', meter('motion', 'Beweging')]] },
  { id: 'd-lamp-wk', naam: 'Plafondlamp woonkamer', ruimte: 'woonkamer', entiteiten: [['light.woonkamer_plafond']] },
  { id: 'd-lamp-sfeer', naam: 'Sfeerlamp', ruimte: 'woonkamer', entiteiten: [['light.woonkamer_sfeer']] },
  { id: 'd-lamp-keuken', naam: 'Keukenlamp', ruimte: 'keuken', entiteiten: [['light.keuken']] },
  { id: 'd-lamp-hal', naam: 'Lamp hal', ruimte: 'hal', entiteiten: [['light.hal']] },
  { id: 'd-lamp-sk', naam: 'Lamp slaapkamer', ruimte: 'slaapkamer', entiteiten: [['light.slaapkamer']] },
  { id: 'd-lamp-kk', naam: 'Lamp kinderkamer', ruimte: 'kinderkamer', entiteiten: [['light.kinderkamer']] },
  { id: 'd-lamp-z', naam: 'Lamp zolder', ruimte: 'zolder', entiteiten: [['light.zolder']] },
  { id: 'd-lamp-tuin', naam: 'Tuinverlichting', ruimte: 'tuin', entiteiten: [['light.tuin']] },
  { id: 'd-lamp-oprit', naam: 'Lamp oprit', ruimte: 'oprit', entiteiten: [['light.oprit']] },
  { id: 'd-screen-wk', naam: 'Screen woonkamer', ruimte: 'woonkamer', entiteiten: [['cover.screen_woonkamer']] },
  { id: 'd-screen-sk', naam: 'Screen slaapkamer', ruimte: 'slaapkamer', entiteiten: [['cover.screen_slaapkamer']] },
  {
    id: 'd-droger',
    naam: 'Droger',
    ruimte: 'keuken',
    merk: 'Bosch',
    platform: 'home_connect',
    entiteiten: [['binary_sensor.droger_op_afstand', meter('', 'Op afstand starten')], ['sensor.droger_status', meter('', 'Status')], ['sensor.droger_programmaduur', meter('duration', 'Programmaduur')], ['button.droger_start_pauze', meter('', 'Start of pauze')]],
  },
  { id: 'd-accu', naam: 'Thuisbatterij', ruimte: 'hal', merk: 'Sessy', platform: 'sessy', entiteiten: [['sensor.thuisbatterij_lading', meter('battery', 'Lading')], ['sensor.thuisbatterij_vermogen', meter('power', 'Batterij vermogen')]] },
  {
    id: 'd-auto',
    naam: 'Elektrische auto',
    ruimte: 'oprit',
    merk: 'Volkswagen',
    model: 'ID.3',
    platform: 'volkswagen_we_connect_id',
    entiteiten: [['sensor.auto_lading', meter('battery', 'Lading')], ['sensor.auto_bereik', meter('distance', 'Bereik')], ['binary_sensor.auto_laadt', meter('battery_charging', 'Laadt')], ['binary_sensor.auto_stekker', meter('plug', 'Stekker')]],
  },
  { id: 'd-laadpaal', naam: 'Laadpaal', ruimte: 'oprit', merk: 'Easee', platform: 'easee', entiteiten: [['sensor.laadpaal_vermogen', meter('power', 'Vermogen')], ['sensor.laadpaal_status', meter('', 'Status')]] },
  {
    id: 'd-p1',
    naam: 'P1-meter',
    ruimte: 'hal',
    merk: 'HomeWizard',
    platform: 'homewizard',
    entiteiten: [
      ['sensor.p1_vermogen', meter('power', 'Vermogen')],
      ['sensor.p1_stroom_fase_1', meter('current', 'Stroom fase 1')],
      ['sensor.p1_stroom_fase_2', meter('current', 'Stroom fase 2')],
      ['sensor.p1_stroom_fase_3', meter('current', 'Stroom fase 3')],
      ['sensor.p1_spanning_fase_1', meter('voltage', 'Spanning fase 1')],
      ['sensor.p1_spanning_fase_2', meter('voltage', 'Spanning fase 2')],
      ['sensor.p1_spanning_fase_3', meter('voltage', 'Spanning fase 3')],
      ['sensor.p1_afname_totaal', meter('energy', 'Afname totaal')],
      ['sensor.p1_teruglevering_totaal', meter('energy', 'Teruglevering totaal')],
    ],
  },
  { id: 'd-omvormer', naam: 'Omvormer', ruimte: null, merk: 'SolarEdge', platform: 'solaredge', entiteiten: [['sensor.omvormer_vermogen', meter('power', 'Vermogen')], ['sensor.omvormer_opbrengst_totaal', meter('energy', 'Opbrengst totaal')]] },
  { id: 'd-deurbel', naam: 'Deurbel', ruimte: 'oprit', merk: 'Reolink', platform: 'reolink', entiteiten: [['camera.deurbel', { platform: 'reolink', translation_key: 'sub' }], ['binary_sensor.deurbel_bezoeker', meter('occupancy', 'Bezoeker')]] },
];

export const APPARATEN: readonly HaDevice[] = TOESTELLEN.map((t) => ({ id: t.id, name: t.naam, area_id: t.ruimte, ...(t.merk ? { manufacturer: t.merk } : {}), ...(t.model ? { model: t.model } : {}) }));

export const ENTITEITEN: readonly HaRegistryEntity[] = [
  ...TOESTELLEN.flatMap((t) => t.entiteiten.map(([id, extra]) => ({ entity_id: id, device_id: t.id, ...(t.platform ? { platform: t.platform } : {}), ...(extra ?? {}) }))),
  { entity_id: 'sensor.buiten_temperatuur', device_id: null, platform: 'buienradar', original_device_class: 'temperature' },
  { entity_id: 'weather.thuis', device_id: null, platform: 'buienradar' },
  { entity_id: 'scene.woonkamer_avond', device_id: null, area_id: 'woonkamer' },
  { entity_id: 'scene.woonkamer_helder', device_id: null, area_id: 'woonkamer' },
];

/* ---- de standen op een moment ---- */

/** Wat de bezoeker zelf zette: lampen, screens, klimaat en knoppen. Dat gaat voor de dag. */
export type Ingrepen = Map<string, { readonly state: string; readonly attributes: Record<string, unknown> }>;

const LAMPEN = ['light.woonkamer_plafond', 'light.woonkamer_sfeer', 'light.keuken', 'light.hal', 'light.slaapkamer', 'light.kinderkamer', 'light.zolder', 'light.tuin', 'light.oprit'];
const NAMEN: Readonly<Record<string, string>> = Object.fromEntries([
  ...TOESTELLEN.flatMap((t) => t.entiteiten.map(([id, extra]) => [id, id.startsWith('light.') || id.startsWith('cover.') || id.startsWith('climate.') ? t.naam : `${t.naam} ${(extra?.original_name ?? '').toLowerCase()}`.trim()])),
  ['sensor.buiten_temperatuur', 'Temperatuur buiten'],
  ['weather.thuis', 'Thuis'],
  ['scene.woonkamer_avond', 'Woonkamer Avond'],
  ['scene.woonkamer_helder', 'Woonkamer Helder'],
]);

/** Een knop van de oude regeling, met zijn standaard ernaast (hand.ts kijkt daarnaar). */
const KNOPPEN: readonly (readonly [string, number, number, number])[] = [
  ['input_number.temp_nest_dag', 20.5, 12, 24],
  ['input_number.temp_nest_voorwarm', 19.5, 12, 24],
  ['input_number.temp_nest_eco', 16, 12, 24],
  ['input_number.temp_airco_woonkamer', 21, 16, 30],
  ['input_number.temp_airco_woonkamer_koelen', 23, 16, 30],
  ['input_number.temp_airco_zolder', 18, 16, 30],
  ['input_number.temp_airco_zolder_koelen', 23, 16, 30],
  ['input_number.badkamer_heat_off_temp_dag', 21, 16, 24],
  ['input_number.pv_klimaat_start_overschot_w', 1000, 0, 5000],
  ['input_number.pv_klimaat_stop_import_w', 50, 0, 2000],
];

/** Alle entiteiten van het voorbeeldhuis op het moment van `klok`, op tijdstip `nuMs`. */
export function staten(klok: Klok, ingrepen: Ingrepen, nuMs: number): HaEntityState[] {
  const m: Moment = moment(klok);
  const tijd = new Date(nuMs).toISOString();
  const lijst: HaEntityState[] = [];
  const zet = (entity_id: string, state: string | number, attributes: Record<string, unknown> = {}) => {
    const eigen = ingrepen.get(entity_id);
    lijst.push({
      entity_id,
      state: eigen?.state ?? String(state),
      attributes: { friendly_name: NAMEN[entity_id] ?? entity_id, ...attributes, ...(eigen?.attributes ?? {}) },
      last_changed: tijd,
      last_updated: tijd,
    });
  };
  const winter = klok.seizoen === 'winter';
  const [op, onder] = ZON[klok.seizoen];

  // Klimaat. De warmtepomp volgt de regeling van het huis; de airco's koelen op zon.
  const klimaat = (id: string, stand: 'heat' | 'cool' | 'off', doel: number, huidig: number, actie: string, modes: string[]) =>
    zet(id, stand, { hvac_modes: modes, hvac_action: actie, temperature: doel, current_temperature: huidig, min_temp: 7, max_temp: 30, target_temp_step: 0.5 });
  klimaat('climate.beneden', winter ? 'heat' : 'off', 20.5, m.temp.woonkamer, m.verwarmt ? 'heating' : winter ? 'idle' : 'off', ['off', 'heat']);
  klimaat('climate.air_conditioning_woonkamer', m.koelt ? 'cool' : 'off', 23, m.temp.woonkamer, m.koelt ? 'cooling' : 'off', ['off', 'heat', 'cool']);
  klimaat('climate.air_conditioning_zolder', 'off', 18, m.temp.zolder, 'off', ['off', 'heat', 'cool']);
  klimaat('climate.thermostaat_badkamer', 'heat', 21, m.temp.badkamer, winter && m.temp.badkamer < 21 ? 'heating' : 'idle', ['off', 'heat']);
  const stroomW = (id: string) => (ingrepen.get(id)?.state ?? '') === 'heat' || (ingrepen.get(id)?.state ?? '') === 'cool';
  zet('sensor.warmtepomp_vermogen', m.verwarmt ? (m.zonW > 800 ? 1400 : 1100) : 0, { unit_of_measurement: 'W', device_class: 'power' });
  zet('sensor.airco_woonkamer_vermogen', m.koelt || stroomW('climate.air_conditioning_woonkamer') ? 900 : 4, { unit_of_measurement: 'W', device_class: 'power' });
  zet('sensor.airco_zolder_vermogen', stroomW('climate.air_conditioning_zolder') ? 750 : 3, { unit_of_measurement: 'W', device_class: 'power' });

  // Meters per kamer.
  const temp = (id: string, c: number) => zet(id, c.toFixed(1), { unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' });
  temp('sensor.woonkamer_temperatuur', m.temp.woonkamer);
  zet('sensor.woonkamer_luchtvochtigheid', winter ? 44 : 55, { unit_of_measurement: '%', device_class: 'humidity' });
  temp('sensor.keuken_temperatuur', m.temp.keuken);
  temp('sensor.badkamer_temperatuur', m.temp.badkamer);
  temp('sensor.slaapkamer_temperatuur', m.temp.slaapkamer);
  temp('sensor.kinderkamer_temperatuur', m.temp.kinderkamer);
  temp('sensor.zolder_temperatuur', m.temp.zolder);
  temp('sensor.buiten_temperatuur', m.buitenC);
  zet('binary_sensor.zolder_beweging', 'off', { device_class: 'motion' });

  // Licht: 's avonds de woonkamer, de keuken en de tuin.
  const lampAan: Readonly<Record<string, boolean>> = {
    'light.woonkamer_plafond': m.lampen && klok.minuut < 1380,
    'light.woonkamer_sfeer': m.lampen && klok.minuut < 1380,
    'light.keuken': m.lampen && klok.minuut < 1320,
    'light.tuin': m.avond && klok.minuut > onder && klok.minuut < 1380,
    'light.oprit': !m.licht && (klok.minuut > onder || klok.minuut < op - 30),
  };
  for (const id of LAMPEN) {
    const aan = lampAan[id] ?? false;
    zet(id, aan ? 'on' : 'off', { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', ...(aan ? { brightness: 190, color_temp_kelvin: 2700 } : {}), min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 });
  }
  zet('scene.woonkamer_avond', '2026-01-01T19:00:00+00:00', { entity_id: ['light.woonkamer_plafond', 'light.woonkamer_sfeer'] });
  zet('scene.woonkamer_helder', '2026-01-01T07:00:00+00:00', { entity_id: ['light.woonkamer_plafond', 'light.woonkamer_sfeer', 'light.keuken'] });

  // Screens: dicht tegen de middagzon en 's avonds.
  for (const id of ['cover.screen_woonkamer', 'cover.screen_slaapkamer']) {
    const dicht = id === 'cover.screen_slaapkamer' ? m.screensDicht : !winter && klok.minuut > 780 && klok.minuut < 1020;
    zet(id, dicht ? 'closed' : 'open', { current_position: dicht ? 0 : 100, supported_features: 15, device_class: 'shade' });
  }

  // De droger, op zon.
  zet('binary_sensor.droger_op_afstand', !winter && klok.minuut < 690 ? 'on' : 'off', { device_class: 'running' });
  zet('sensor.droger_status', m.droger ? 'Run' : !winter && klok.minuut < 690 ? 'Ready' : klok.minuut >= 860 && !winter ? 'Finished' : 'Inactive', {});
  zet('sensor.droger_programmaduur', 168, { unit_of_measurement: 'min', device_class: 'duration' });
  zet('button.droger_start_pauze', 'unknown', {});

  // Thuisbatterij, auto en laadpaal.
  zet('sensor.thuisbatterij_lading', m.batterijPct, { unit_of_measurement: '%', device_class: 'battery' });
  zet('sensor.thuisbatterij_vermogen', m.batterijW, { unit_of_measurement: 'W', device_class: 'power' });
  zet('sensor.auto_lading', m.autoPct, { unit_of_measurement: '%', device_class: 'battery' });
  zet('sensor.auto_bereik', Math.round(m.autoPct * 3.9), { unit_of_measurement: 'km', device_class: 'distance' });
  zet('binary_sensor.auto_laadt', m.autoLaadt ? 'on' : 'off', { device_class: 'battery_charging' });
  zet('binary_sensor.auto_stekker', 'on', { device_class: 'plug' });
  zet('sensor.laadpaal_vermogen', m.autoLaadt ? 1400 : 0, { unit_of_measurement: 'W', device_class: 'power' });
  zet('sensor.laadpaal_status', m.autoLaadt ? 'charging' : m.autoPct >= 100 ? 'completed' : 'connected', {});

  // Het net: wat het huis vraagt, min de zon, min de batterij.
  const netW = Math.round(m.huisW + (m.autoLaadt ? 1400 : 0) + m.batterijW - m.zonW);
  zet('sensor.p1_vermogen', netW, { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' });
  for (const f of [1, 2, 3]) {
    zet(`sensor.p1_stroom_fase_${f}`, Math.abs(netW / 3 / 230).toFixed(1), { unit_of_measurement: 'A', device_class: 'current' });
    zet(`sensor.p1_spanning_fase_${f}`, 231, { unit_of_measurement: 'V', device_class: 'voltage' });
  }
  zet('sensor.p1_afname_totaal', 18234.5, { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' });
  zet('sensor.p1_teruglevering_totaal', 9876.1, { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' });
  zet('sensor.omvormer_vermogen', m.zonW, { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' });
  zet('sensor.omvormer_opbrengst_totaal', 21543.2, { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' });

  // De zon, het weer, de deurbel.
  const elevatie = Math.round(m.zonHoogte * (winter ? 18 : 60));
  zet('sun.sun', m.licht ? 'above_horizon' : 'below_horizon', { elevation: elevatie, azimuth: Math.round(90 + 180 * m.zonStand), rising: m.zonStand < 0.5 });
  zet('weather.thuis', m.licht ? (winter ? 'cloudy' : 'sunny') : 'clear-night', { temperature: m.buitenC, humidity: winter ? 88 : 60, wind_speed: 12, cloud_coverage: winter ? 70 : 15 });
  zet('camera.deurbel', 'idle', { access_token: 'voorbeeld', entity_picture: '/api/camera_proxy/camera.deurbel' });
  zet('binary_sensor.deurbel_bezoeker', 'off', { device_class: 'occupancy' });

  // De bewoners, de modus en de knoppen van de oude regeling.
  zet('person.sam', 'home', { user_id: 'voorbeeld-sam' });
  zet('person.noa', klok.minuut > 510 && klok.minuut < 1050 && !winter ? 'not_home' : 'home', { user_id: 'voorbeeld-noa' });
  zet('input_select.verwarming_modus', 'automatisch', { options: ['automatisch', 'dag', 'nacht', 'voorverwarmen', 'afwezig', 'vakantie', 'handmatig'] });
  zet('input_select.verwarming_modus_actief', klok.minuut >= 1320 || klok.minuut < 360 ? 'nacht' : klok.minuut < 420 ? 'voorverwarmen' : 'dag', {});
  zet('input_select.koel_strategie', winter ? 'uit' : 'automatisch', { options: ['uit', 'automatisch', 'Handmatig koelen'] });
  zet('timer.verwarming_handmatig', 'idle', {});
  zet('sensor.airco_assist_reden', m.koelt ? 'koelen op zon' : 'geen', {});
  for (const [id, waarde, min, max] of KNOPPEN) {
    zet(id, waarde, { min, max, step: id.includes('_w') && !id.includes('woonkamer') ? 50 : 0.5 });
    zet(`${id}_standaard`, waarde, { min, max, step: 0.5 });
  }
  return lijst;
}
