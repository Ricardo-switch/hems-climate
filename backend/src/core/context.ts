/**
 * De afgeleide grootheden die strategieën en arbiter delen.
 *
 * Eén keer berekend per ronde, zodat twee strategieën nooit van een net iets
 * andere definitie van hetzelfde begrip kunnen uitgaan. Dat was in de
 * YAML-versie precies de fout: `pv_hard_stop` betekende in de controller iets
 * anders dan in de sensor die het dashboard voedde.
 */

import type { Mode, SiteConfig, Zone } from './model.js';
import { actuatorById } from './model.js';
import type { SystemState } from './state.js';
import { readOr, timerActive } from './state.js';

export interface ZoneDerived {
  readonly zone: Zone;
  readonly temperatureC: number | null;
  /** Setpoint voor de geldende modus, of null wanneer de modus niet regelt. */
  readonly heatTargetC: number | null;
  readonly coolTargetC: number | null;
  /** Vraag na toepassing van de hysterese van deze zone. */
  readonly demand: 'heat' | 'cool' | 'none';
}

export interface DecisionContext {
  readonly config: SiteConfig;
  readonly state: SystemState;
  readonly nowMs: number;
  readonly mode: Mode;
  readonly modeSource: 'override' | 'schedule';
  readonly occupied: boolean;
  /** Netvermogen in W; negatief bij teruglevering. */
  readonly gridPowerW: number;
  /** Teruglevering in W, altijd >= 0. */
  readonly surplusW: number;
  /** Vermogen dat vrijkomt door bestuurde apparaten terug te schakelen. */
  readonly reclaimableW: number;
  /** Te verdelen vermogen: overschot + tolerantie + terugwinbaar. */
  readonly availableW: number;
  readonly stabilisationActive: boolean;
  /** Geen zon, geen overschot. Onbekend telt als onder de horizon. */
  readonly sunDown: boolean;
  /** DeviceRef.id van elk kritiek meetpunt dat nu onbetrouwbaar is. */
  readonly unreliableInputs: readonly string[];
  readonly failsafeActive: boolean;
  readonly zones: readonly ZoneDerived[];
}

/**
 * Het uur van de dag in de tijdzone van de installatie.
 *
 * Niet `new Date(ms).getHours()`: dat leest de tijdzone van het *proces*. Op een
 * laptop in Nederland valt dat toevallig samen met de woning, maar in een
 * container draait Node standaard in UTC — en dan zou voorverwarmen twee uur te
 * laat beginnen, zonder één foutmelding. Voor een dienst die straks huizen in
 * meerdere tijdzones bedient is het sowieso de enige juiste bron.
 */
function hourIn(timezone: string, atMs: number): number {
  try {
    // Let op: Intl werpt al bij het aanmaken van de formatter, niet pas bij
    // format(). De try moet dus om allebei heen.
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(atMs));
    const hour = Number(formatted);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return hour;
  } catch {
    // Onbekende tijdzone. De configuratiecontrole hoort dit al te vangen; komen
    // we hier toch, dan is een uur dat mogelijk verkeerd staat beter dan een
    // regeling die omvalt.
  }
  return new Date(atMs).getHours();
}

/** Bepaalt de modus uit klok, aanwezigheid en avondverlenging. */
export function scheduledMode(
  config: SiteConfig,
  state: SystemState,
  occupied: boolean,
): Mode {
  if (!occupied) return 'afwezig';

  const hour = hourIn(config.timezone, state.nowMs);
  const { preheatFromHour, dayFromHour, nightFromHour } = config.schedule;

  const anyLightOn = config.schedule.eveningExtensionLights.some((ref) =>
    readOr(state.lights[ref.id], false),
  );
  const inNightWindow = hour >= nightFromHour || hour < preheatFromHour;
  if (inNightWindow && anyLightOn) return 'dag';
  if (inNightWindow) return 'nacht';
  if (hour < dayFromHour) return 'voorverwarmen';
  return 'dag';
}

function demandOf(
  zone: Zone,
  temperatureC: number | null,
  heatTargetC: number | null,
  coolTargetC: number | null,
  previous: 'heat' | 'cool' | 'none',
): 'heat' | 'cool' | 'none' {
  if (temperatureC == null) return 'none';
  const { onDelta, offDelta } = zone.hysteresis;

  if (heatTargetC != null) {
    // Al aan het verwarmen: pas loslaten boven de smallere uitschakelband.
    if (previous === 'heat' && temperatureC < heatTargetC + offDelta) return 'heat';
    if (previous !== 'heat' && temperatureC <= heatTargetC - onDelta) return 'heat';
  }
  if (coolTargetC != null) {
    if (previous === 'cool' && temperatureC > coolTargetC - offDelta) return 'cool';
    if (previous !== 'cool' && temperatureC >= coolTargetC + onDelta) return 'cool';
  }
  return 'none';
}

/** Wat de zone nu al doet, afgeleid uit de stand van haar actuatoren. */
function currentZoneAction(
  config: SiteConfig,
  state: SystemState,
  zone: Zone,
): 'heat' | 'cool' | 'none' {
  for (const id of zone.actuatorIds) {
    const a = state.actuators[id]?.action;
    if (a?.ok && (a.value === 'heat' || a.value === 'cool')) return a.value;
  }
  return 'none';
}

export function buildContext(
  config: SiteConfig,
  state: SystemState,
): DecisionContext {
  /*
   * Zonder aanwezigheidsbronnen is het huis bewoond.
   *
   * `some()` op een lege lijst geeft false, en dat betekende: altijd afwezig,
   * dus altijd de zuinige setpoints. Een installatie waarin niemand
   * `person.`-entiteiten heeft ingesteld zou het huis stilzwijgend koud
   * houden — en dat is de verkeerde kant om te raden. Comfort boven besparing
   * wanneer we het niet weten.
   */
  const occupied =
    config.occupancy.length === 0
      ? true
      : config.occupancy.some((o) => readOr(state.occupancy[o.id], false));
  const mode = state.modeOverride ?? scheduledMode(config, state, occupied);
  const modeSource: 'override' | 'schedule' =
    state.modeOverride == null ? 'schedule' : 'override';

  const gridPowerW = readOr(state.power.gridPowerW, 0);
  const surplusW = gridPowerW < 0 ? -gridPowerW : 0;

  let reclaimableW = 0;
  for (const actuator of config.actuators) {
    const s = state.actuators[actuator.id];
    if (!s) continue;
    const running = s.action.ok && (s.action.value === 'heat' || s.action.value === 'cool');
    if (running) {
      reclaimableW += s.powerW.ok ? s.powerW.value : actuator.power.estimatedW;
    }
  }

  // Ontbrekend telt als onbetrouwbaar: een meetpunt dat de adapter niet kon
  // vullen is even onbruikbaar als een meetpunt dat unavailable meldt.
  const unreliableInputs = config.criticalInputs
    .filter((ref) => state.inputHealth[ref.id] !== true)
    .map((ref) => ref.id);

  const zones: ZoneDerived[] = config.zones.map((zone) => {
    const reading = state.zones[zone.id]?.temperatureC;
    const temperatureC = reading?.ok ? reading.value : null;
    const pair = zone.setpoints[mode];
    const heatTargetC = pair.heat ?? null;
    const coolTargetC = pair.cool ?? null;
    const previous = currentZoneAction(config, state, zone);
    return {
      zone,
      temperatureC,
      heatTargetC,
      coolTargetC,
      demand: demandOf(zone, temperatureC, heatTargetC, coolTargetC, previous),
    };
  });

  return {
    config,
    state,
    nowMs: state.nowMs,
    mode,
    modeSource,
    occupied,
    gridPowerW,
    surplusW,
    reclaimableW,
    // Let op het teken: hier hoort `-gridPowerW` te staan en niet `surplusW`.
    // `surplusW` is afgekapt op nul voor de weergave, maar in het budget moet
    // import juist meetellen als negatieve ruimte. Anders zou een huis dat 200 W
    // importeert terwijl de airco's 500 W trekken uitrekenen dat er 550 W te
    // besteden valt, in plaats van 350 W — en zou de arbiter alles laten
    // doordraaien op netstroom. De replay-harness liep hier tegenaan.
    availableW: Math.max(
      0,
      -gridPowerW + reclaimableW + config.power.stopImportW,
    ),
    stabilisationActive: timerActive(state.timers.stabilisation, state.nowMs),
    sunDown: !readOr(state.sunAboveHorizon, false),
    unreliableInputs,
    failsafeActive: unreliableInputs.length > 0,
    zones,
  };
}

/** Zoekt de actuator op, voor gebruik door strategieën. */
export { actuatorById };
