/**
 * De afgeleide grootheden die strategieën en arbiter delen.
 *
 * Eén keer berekend per ronde, zodat twee strategieën nooit van een net iets
 * andere definitie van hetzelfde begrip kunnen uitgaan. Dat was in de
 * YAML-versie precies de fout: `pv_hard_stop` betekende in de controller iets
 * anders dan in de sensor die het dashboard voedde.
 */

import type { ComfortProfile, Mode, SiteConfig, Zone } from './model.js';
import { actuatorById, PROFILE_SETTLE_MS } from './model.js';
import { isOverridden } from './override.js';
import type { SystemState } from './state.js';
import { readOr, timerActive } from './state.js';

/**
 * Welk comfort er geldt (besluit 147): van welk profiel, en waarom. `home` zijn
 * de profielen die nu thuis zijn, na de rust van tien minuten.
 */
export interface ProfileChoice {
  readonly id: string;
  readonly name: string;
  readonly reason: 'thuis' | 'niemand' | 'gekozen';
  readonly home: readonly string[];
}

/**
 * Thuis, met rust: wie net thuiskwam, telt de eerste tien minuten nog als weg,
 * en wie net wegging nog als thuis. Zo wisselt het comfort niet bij een
 * boodschap. De meting draagt sinds wanneer ze zo staat.
 */
function settledHome(state: SystemState, sourceId: string): boolean {
  const r = state.occupancy[sourceId];
  if (!r?.ok) return false;
  return state.nowMs - r.atMs < PROFILE_SETTLE_MS ? !r.value : r.value;
}

/** Het profiel dat geldt, of null zonder profielen. Zuiver: dezelfde toestand geeft dezelfde keuze. */
export function chooseProfile(config: SiteConfig, state: SystemState): ProfileChoice | null {
  const profiles = config.profiles ?? [];
  if (profiles.length === 0) return null;
  const home = profiles.filter((p) => p.occupancyIds.some((id) => settledHome(state, id))).map((p) => p.id);
  const pick = (p: ComfortProfile, reason: ProfileChoice['reason']): ProfileChoice => ({ id: p.id, name: p.name, reason, home });
  const hold = config.profileHold;
  const held = hold ? profiles.find((p) => p.id === hold.id) : undefined;
  if (held && hold && hold.home.length === home.length && hold.home.every((id) => home.includes(id))) return pick(held, 'gekozen');
  const first = profiles.find((p) => home.includes(p.id));
  return first ? pick(first, 'thuis') : pick(profiles[0]!, 'niemand');
}

/** De zone zoals het geldende profiel hem wil: eigen doelen en plafond over die van de zone. */
function zoneFor(zone: Zone, profile: ComfortProfile | undefined): Zone {
  const own = profile?.zones[zone.id];
  if (own == null) return zone;
  const { comfortMaxC: _plafond, ...rest } = zone;
  const plafond = own.comfortMaxC === undefined ? zone.comfortMaxC : own.comfortMaxC;
  return {
    ...rest,
    setpoints: own.setpoints ? ({ ...zone.setpoints, ...own.setpoints } as Zone['setpoints']) : zone.setpoints,
    ...(plafond != null ? { comfortMaxC: plafond } : {}),
  };
}

export interface ZoneDerived {
  readonly zone: Zone;
  readonly temperatureC: number | null;
  /** Setpoint voor de geldende modus, of null wanneer de modus niet regelt. */
  readonly heatTargetC: number | null;
  readonly coolTargetC: number | null;
  /** Vraag na toepassing van de hysterese van deze zone. */
  readonly demand: 'heat' | 'cool' | 'none';
  /** Het comfortplafond van deze zone, of null wanneer ze er geen heeft. */
  readonly comfortMaxC: number | null;
  /**
   * Staat de zone boven haar comfortplafond, hysterese meegerekend?
   *
   * Dit is een ándere vraag dan `demand === 'cool'`. Die gaat over het koeldoel,
   * dat op eigen stroom gehaald wordt. Deze gaat over de grens die comfort
   * desnoods op netstroom verdedigt (besluit 50).
   */
  readonly aboveComfortCeiling: boolean;
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
  /**
   * Het stroombudget per fase (besluit 78); leeg als de configuratie geen
   * aansluiting kent.
   */
  readonly phases: readonly PhaseDerived[];
  readonly stabilisationActive: boolean;
  /** Geen zon, geen overschot. Onbekend telt als onder de horizon. */
  readonly sunDown: boolean;
  /** DeviceRef.id van elk kritiek meetpunt dat nu onbetrouwbaar is. */
  readonly unreliableInputs: readonly string[];
  readonly failsafeActive: boolean;
  readonly zones: readonly ZoneDerived[];
  /** Welk comfort er geldt (besluit 147); null zonder profielen. */
  readonly profile: ProfileChoice | null;
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

/**
 * Staat de zone boven haar comfortplafond? Zelfde hysterese als de gewone
 * vraag, zodat er niet twee definities van "te warm" naast elkaar bestaan.
 */
function aboveCeiling(
  zone: Zone,
  temperatureC: number | null,
  previous: 'heat' | 'cool' | 'none',
): boolean {
  if (temperatureC == null || zone.comfortMaxC == null) return false;
  const { onDelta, offDelta } = zone.hysteresis;
  return previous === 'cool'
    ? temperatureC > zone.comfortMaxC - offDelta
    : temperatureC >= zone.comfortMaxC + onDelta;
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

/** Wat de arbiter over één fase weet. */
export interface PhaseDerived {
  readonly id: string;
  /** De stroom nu in A, of null als hij niet gemeten en niet te schatten is. */
  readonly currentA: number | null;
  /**
   * Dezelfde stroom met een richting: negatief bij teruglevering. Alleen bij één
   * fase is die bekend, uit het teken van het netvermogen; bij drie fasen geeft
   * de meter per fase geen richting, en geldt hij als afname (de veilige kant).
   */
  readonly signedA: number | null;
  readonly voltageV: number;
  /** De zekering min de marge. */
  readonly limitA: number;
  readonly bron: 'gemeten' | 'geschat' | 'onbekend';
}

/** Zonder spanningsmeting: de netspanning in Nederland. */
const NOMINAL_VOLTAGE = 230;

/**
 * De stroom per fase, uit de meting of anders uit het netvermogen.
 *
 * Een ontbrekende of onbetrouwbare stroommeting is geen reden om alles stil te
 * zetten: het netvermogen zegt het ook, zij het grof. Bij één fase is dat
 * netvermogen ÷ spanning; bij drie fasen weten we niet hoe het verdeeld is, en
 * nemen we de veilige kant: alles op elke fase. Pas als ook het netvermogen
 * ontbreekt, is de stroom onbekend, en start de arbiter niets (zie arbiter.ts).
 */
function phasesOf(config: SiteConfig, state: SystemState): PhaseDerived[] {
  if (!config.grid) return [];
  const grid = state.power.gridPowerW;
  const single = config.grid.phases.length === 1;
  // Bij één fase zegt het netvermogen de richting; anders telt alles als afname.
  const sign = single && grid.ok && grid.value < 0 ? -1 : 1;
  return config.grid.phases.map((phase) => {
    const s = state.power.phases?.[phase.id];
    const voltageV = s?.voltageV.ok && s.voltageV.value > 100 ? s.voltageV.value : NOMINAL_VOLTAGE;
    const limitA = phase.maxA - config.grid!.marginA;
    if (s?.currentA.ok) {
      const a = Math.abs(s.currentA.value);
      return { id: phase.id, currentA: a, signedA: sign * a, voltageV, limitA, bron: 'gemeten' as const };
    }
    if (grid.ok) {
      const a = Math.abs(grid.value) / voltageV;
      return { id: phase.id, currentA: a, signedA: sign * a, voltageV, limitA, bron: 'geschat' as const };
    }
    return { id: phase.id, currentA: null, signedA: null, voltageV, limitA, bron: 'onbekend' as const };
  });
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

  /*
   * Terugwinbaar: wat de bestuurde apparaten nu opnemen.
   *
   * Het hoort bij hetzelfde huis als `gridPowerW`, want het budget is het
   * verschil tussen die twee: netvermogen zonder de bestuurde apparaten, oftewel
   * de basislast. Meestal volgt het uit `actuators`. In de schaduwmodus staat
   * daar wat de arbiter gestuurd zou hebben, en dan geeft de adapter het
   * werkelijke verbruik apart mee (besluit 49b) — anders telde een
   * veronderstelde airco als terugwinbaar terwijl de meter hem nooit zag.
   */
  let reclaimableW = 0;
  if (state.power.observedDrawW != null) {
    reclaimableW = state.power.observedDrawW;
  } else {
    for (const actuator of config.actuators) {
      const s = state.actuators[actuator.id];
      if (!s) continue;
      // Een apparaat dat de bewoner heeft overgenomen, schakelt de regeling niet
      // terug; zijn verbruik is dus geen ruimte voor een ander (besluit 74). Het
      // zit wel in het netvermogen, en drukt zo vanzelf het budget.
      if (isOverridden(state, actuator.id)) continue;
      const running = s.action.ok && (s.action.value === 'heat' || s.action.value === 'cool');
      if (running) {
        reclaimableW += s.powerW.ok ? s.powerW.value : actuator.power.estimatedW;
      }
    }
  }

  // Ontbrekend telt als onbetrouwbaar: een meetpunt dat de adapter niet kon
  // vullen is even onbruikbaar als een meetpunt dat unavailable meldt.
  const unreliableInputs = config.criticalInputs
    .filter((ref) => state.inputHealth[ref.id] !== true)
    .map((ref) => ref.id);

  const profile = chooseProfile(config, state);
  const profileConfig = profile ? config.profiles?.find((p) => p.id === profile.id) : undefined;
  const zones: ZoneDerived[] = config.zones.map((raw) => {
    const zone = zoneFor(raw, profileConfig);
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
      comfortMaxC: zone.comfortMaxC ?? null,
      aboveComfortCeiling: aboveCeiling(zone, temperatureC, previous),
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
    phases: phasesOf(config, state),
    stabilisationActive: timerActive(state.timers.stabilisation, state.nowMs),
    sunDown: !readOr(state.sunAboveHorizon, false),
    unreliableInputs,
    failsafeActive: unreliableInputs.length > 0,
    zones,
    profile,
  };
}

/** Zoekt de actuator op, voor gebruik door strategieën. */
export { actuatorById };
