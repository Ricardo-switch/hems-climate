/**
 * De vertaling tussen Home Assistant en het domeinmodel.
 *
 * Dit is de enige plek waar entity-ID's voorkomen. De kern kent ze niet, en de
 * twee afnemers — de live-adapter en de replay-harness — delen deze code, zodat
 * ze niet uit elkaar kunnen lopen.
 *
 * De bindingen hieronder zijn nu nog met de hand geschreven voor dit ene huis.
 * In fase 4 levert de onboarding ze aan; de vorm blijft dezelfde.
 */

import type { Mode, SiteConfig, Zone } from '../../core/model.js';
import type { ActuatorState, SystemState, TimerState } from '../../core/state.js';
import { unavailable, value } from '../../core/state.js';
import { isUsable } from '../../replay/dataset.js';
import type { EntitySource } from './source.js';

/** Koppelt een actuator uit de configuratie aan zijn bronnen in de historie. */
interface ActuatorBinding {
  readonly actuatorId: string;
  readonly climateEntity: string;
  readonly powerEntity?: string;
  /** Setpointdrempels waarboven of -onder het apparaat feitelijk standby staat. */
  readonly standby?: { heat: number; cool: number };
}

const BINDINGS: readonly ActuatorBinding[] = [
  { actuatorId: 'nest', climateEntity: 'climate.beneden' },
  { actuatorId: 'badkamer', climateEntity: 'climate.thermostaat_badkamer' },
  {
    actuatorId: 'ac-woonkamer',
    climateEntity: 'climate.air_conditioning_woonkamer',
    powerEntity: 'sensor.air_conditioning_woonkamer_energy_current',
    standby: { heat: 18, cool: 25 },
  },
  {
    actuatorId: 'ac-zolder',
    climateEntity: 'climate.air_conditioning_zolder',
    powerEntity: 'sensor.air_conditioning_zolder_energy_current',
    standby: { heat: 18, cool: 25 },
  },
];

const ZONE_TEMPERATURE: Readonly<Record<string, string>> = {
  woonkamer: 'sensor.beneden_temperatuur',
  badkamer: 'sensor.badkamer_huidige_temperatuur',
  zolder: 'sensor.hue_motion_sensor_zolder_temperatuur',
};

const OCCUPANCY: Readonly<Record<string, string>> = {
  ricardo: 'person.ricardo_cornelissen',
  shira: 'person.shira',
  saskia: 'binary_sensor.saskia_thuis_gestabiliseerd',
  rob: 'binary_sensor.rob_thuis_gestabiliseerd',
  dini: 'binary_sensor.dini_thuis_gestabiliseerd',
};

/**
 * Vertaalt de HA-toestand van een klimaatapparaat naar onze `Action`.
 *
 * De standby-herkenning volgt de conventie van het oude systeem: verwarmen op
 * 18 of lager, en koelen op 25 of hoger, betekende daar "aan maar vraagt niets".
 */
export function mapAction(
  haState: string,
  setpointC: number | null,
  standby: ActuatorBinding['standby'],
): ActuatorState['action'] {
  if (!isUsable(haState)) return unavailable();
  switch (haState) {
    case 'off':
      return value('off', 0);
    case 'cool':
      if (standby && setpointC != null && setpointC >= standby.cool) {
        return value('standby', 0);
      }
      return value('cool', 0);
    case 'heat':
    case 'heat_cool':
    case 'auto':
      if (standby && setpointC != null && setpointC <= standby.heat) {
        return value('standby', 0);
      }
      return value('heat', 0);
    default:
      return unavailable();
  }
}

function timerAt(source: EntitySource, entityId: string): TimerState {
  if (source.state(entityId) !== 'active') return { endsAtMs: null };
  const finishes = source.attr(entityId, 'finishes_at');
  if (typeof finishes !== 'string') return { endsAtMs: null };
  const ms = Date.parse(finishes);
  return { endsAtMs: Number.isFinite(ms) ? ms : null };
}

const MODE_ALIASES: Readonly<Record<string, Mode>> = {
  dag: 'dag',
  nacht: 'nacht',
  voorverwarmen: 'voorverwarmen',
  afwezig: 'afwezig',
  vakantie: 'vakantie',
  // Het oude systeem kende een aparte koelmodus. In het nieuwe model is koelen
  // geen modus maar een richting, dus die valt samen met de dagmodus.
  koelen: 'dag',
  // Toegevoegd aan input_select.verwarming_modus toen de 'handmatig'-bug werd
  // verholpen. Betekent hier hetzelfde als daar: de regeling laat los.
  handmatig: 'handmatig',
};

export function buildSystemState(
  config: SiteConfig,
  source: EntitySource,
  nowMs: number,
): SystemState {
  const actuators: Record<string, ActuatorState> = {};
  for (const b of BINDINGS) {
    const haState = source.state(b.climateEntity) ?? 'unavailable';
    const setpointC = source.attrNumber(b.climateEntity, 'temperature');
    const powerW = b.powerEntity == null ? null : source.number(b.powerEntity);
    // hvac_action wordt lang niet door elk apparaat gerapporteerd. Ontbreekt
    // het, dan blijft `producing` onbekend en valt heat-assist stil in plaats
    // van te gokken dat een ingeschakelde ketel ook brandt.
    const hvac = source.hvacAction(b.climateEntity);
    const producing =
      hvac == null
        ? unavailable<boolean>('missing')
        : value(hvac === 'heating' || hvac === 'cooling', nowMs);

    actuators[b.actuatorId] = {
      action: mapAction(haState, setpointC, b.standby),
      setpointC: setpointC == null ? unavailable<number>() : value(setpointC, nowMs),
      powerW: powerW == null ? unavailable<number>() : value(powerW, nowMs),
      lastChangeMs: source.changedAt(b.climateEntity),
      producing,
      producingSinceMs:
        producing.ok && producing.value ? source.hvacActionSince(b.climateEntity) : null,
    };
  }

  const zones: SystemState['zones'] = Object.fromEntries(
    Object.entries(ZONE_TEMPERATURE).map(([zoneId, entityId]) => {
      const t = source.number(entityId);
      return [
        zoneId,
        { temperatureC: t == null ? unavailable<number>() : value(t, nowMs) },
      ];
    }),
  );

  const occupancy: SystemState['occupancy'] = Object.fromEntries(
    Object.entries(OCCUPANCY).map(([id, entityId]) => {
      const b = source.bool(entityId);
      return [id, b == null ? unavailable<boolean>() : value(b, nowMs)];
    }),
  );

  const lights: SystemState['lights'] = Object.fromEntries(
    config.schedule.eveningExtensionLights.map((ref) => {
      const b = source.bool(ref.id);
      return [ref.id, b == null ? unavailable<boolean>() : value(b, nowMs)];
    }),
  );

  const inputHealth: Record<string, boolean> = {};
  for (const ref of config.criticalInputs) {
    inputHealth[ref.id] = source.state(ref.id) != null;
  }

  const grid = source.number('sensor.p1_meter_power');
  const sun = source.bool('sun.sun');
  const chosen = source.state('input_select.verwarming_modus');
  const modeOverride =
    chosen == null || chosen === 'automatisch'
      ? null
      : (MODE_ALIASES[chosen] ?? null);

  return {
    nowMs,
    modeOverride,
    occupancy,
    zones,
    actuators,
    power: {
      gridPowerW: grid == null ? unavailable<number>() : value(grid, nowMs),
    },
    timers: {
      stabilisation: timerAt(source, 'timer.pv_stabilisatie'),
      manualOverride: timerAt(source, 'timer.verwarming_handmatig'),
    },
    lights,
    sunAboveHorizon: sun == null ? unavailable<boolean>() : value(sun, nowMs),
    inputHealth,
  };
}

/**
 * Legt de setpoints van de configuratie gelijk aan wat de bewoner op dat moment
 * werkelijk had ingesteld. Zonder deze stap zou de arbiter tegen andere doelen
 * regelen dan het oude systeem, en zegt de vergelijking niets.
 */
export function configFrom(base: SiteConfig, source: EntitySource): SiteConfig {
  const num = (id: string, fallback: number): number =>
    source.number(id) ?? fallback;

  const patch: Readonly<Record<string, Partial<Record<Mode, { heat?: number; cool?: number }>>>> = {
    woonkamer: {
      dag: {
        heat: num('input_number.temp_nest_dag', 20),
        cool: num('input_number.temp_airco_woonkamer_koelen', 22),
      },
      voorverwarmen: { heat: num('input_number.temp_nest_voorwarm', 19) },
      afwezig: { heat: num('input_number.temp_nest_eco', 16) },
    },
    badkamer: {
      dag: { heat: num('input_number.badkamer_heat_off_temp_dag', 18) },
      voorverwarmen: { heat: num('input_number.badkamer_heat_off_temp_dag', 18) },
    },
    zolder: {
      dag: {
        heat: num('input_number.temp_airco_zolder', 18),
        cool: num('input_number.temp_airco_zolder_koelen', 22.5),
      },
      voorverwarmen: { heat: num('input_number.temp_airco_zolder', 18) },
    },
  };

  const zones: Zone[] = base.zones.map((zone) => {
    const perMode = patch[zone.id];
    if (!perMode) return zone;
    const setpoints = { ...zone.setpoints };
    for (const [mode, pair] of Object.entries(perMode)) {
      setpoints[mode as Mode] = { ...setpoints[mode as Mode], ...pair };
    }
    return { ...zone, setpoints };
  });

  return {
    ...base,
    zones,
    power: {
      ...base.power,
      startSurplusW: num(
        'input_number.pv_klimaat_start_overschot_w',
        base.power.startSurplusW,
      ),
      stopImportW: num(
        'input_number.pv_klimaat_stop_import_w',
        base.power.stopImportW,
      ),
    },
  };
}

/**
 * Setpoints en drempels die `configFrom` uitleest.
 * Los vastgelegd omdat de filter ze moet kennen; de drift-test in
 * `test/adapter.test.ts` bewaakt dat deze lijst compleet blijft.
 */
const SETPOINT_INPUTS: readonly string[] = [
  'input_number.temp_nest_dag',
  'input_number.temp_nest_eco',
  'input_number.temp_nest_voorwarm',
  'input_number.badkamer_heat_off_temp_dag',
  'input_number.temp_airco_zolder',
  'input_number.temp_airco_woonkamer_koelen',
  'input_number.temp_airco_zolder_koelen',
  'input_number.pv_klimaat_start_overschot_w',
  'input_number.pv_klimaat_stop_import_w',
];

/** Losse meetpunten die `buildSystemState` uitleest. */
const SINGLETON_INPUTS: readonly string[] = [
  'sensor.p1_meter_power',
  'sun.sun',
  'input_select.verwarming_modus',
  'timer.pv_stabilisatie',
  'timer.verwarming_handmatig',
];

/**
 * Elke entiteit waar de vertaling naar kijkt.
 *
 * Home Assistant stuurt een `state_changed` voor alles wat er in huis beweegt —
 * bij een gemiddelde installatie duizenden entiteiten. Zonder deze lijst zou de
 * regeling op elke lamp en elke telefoonbatterij opnieuw gaan rekenen. In de
 * praktijk scheelde dat een factor zeven in het aantal evaluaties.
 */
/**
 * Meetpunten die we alleen vastleggen om achteraf mee te vergelijken.
 *
 * Ze mogen géén herberekening uitlokken: het oude systeem dat zijn eigen
 * uitleg bijwerkt is geen reden voor ons om opnieuw te beslissen. Ze worden
 * wel bijgehouden, zodat elk besluit in het logboek naast de waarneming van
 * datzelfde moment komt te staan — en de vergelijking later geen verbinding
 * met Home Assistant meer nodig heeft.
 */
export function observedEntities(config: SiteConfig): ReadonlySet<string> {
  const ids = new Set<string>();
  const legacy = config.migration?.legacyExplanation;
  if (legacy) ids.add(legacy.id);
  return ids;
}

export function relevantEntities(config: SiteConfig): ReadonlySet<string> {
  const ids = new Set<string>([...SETPOINT_INPUTS, ...SINGLETON_INPUTS]);

  for (const b of BINDINGS) {
    ids.add(b.climateEntity);
    if (b.powerEntity) ids.add(b.powerEntity);
  }
  for (const id of Object.values(ZONE_TEMPERATURE)) ids.add(id);
  for (const id of Object.values(OCCUPANCY)) ids.add(id);

  // Wat de configuratie zelf aandraagt.
  for (const ref of config.criticalInputs) ids.add(ref.id);
  for (const zone of config.zones) {
    ids.add(zone.temperature.id);
    if (zone.humidity) ids.add(zone.humidity.id);
  }
  for (const actuator of config.actuators) {
    ids.add(actuator.ref.id);
    if (actuator.power.sensor) ids.add(actuator.power.sensor.id);
  }
  for (const ref of config.schedule.eveningExtensionLights) ids.add(ref.id);
  for (const source of config.occupancy) ids.add(source.ref.id);

  return ids;
}
