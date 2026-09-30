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

import type { DeviceRef, Meetpunt, Mode, SiteConfig, Zone } from '../../core/model.js';
import type { ActuatorState, SystemState, TimerId, TimerState } from '../../core/state.js';
import { unavailable, value } from '../../core/state.js';
import { isUsable } from '../../replay/dataset.js';
import type { OwnStateReader } from '../own-state.js';
import { NEUTRAL_OWN_STATE } from '../own-state.js';
import type { SchaduwApparatenReader } from '../shadow-actuators.js';
import { GEEN_SCHADUW } from '../shadow-actuators.js';
import type { EntitySource } from './source.js';

/**
 * Koppelt een actuator aan zijn bronnen.
 *
 * Afgeleid uit de configuratie, niet uit een tabel hier. Tot september 2026
 * stonden deze bindingen én de zonetemperaturen én de bewoners én de slimme meter
 * met de hand in dit bestand, terwijl `SiteConfig` ze ook al bevatte. Ze stonden
 * identiek in en niets bewaakte dat: wie de zoldersensor in de configuratie
 * wijzigde, kreeg een arbiter die stilzwijgend de oude bleef uitlezen.
 *
 * Nu is er één bron. Dit bestand kent geen entity-ID's meer van dit ene huis —
 * dat is de voorwaarde waaronder een tweede woning geen codewijziging is.
 */
interface ActuatorBinding {
  readonly actuatorId: string;
  readonly climateEntity: string;
  readonly powerEntity: string | null;
  /** Setpointdrempels waarboven of -onder het apparaat feitelijk standby staat. */
  readonly standby: { heat: number; cool: number } | null;
}

function bindingsVan(config: SiteConfig): ActuatorBinding[] {
  return config.actuators.map((a) => ({
    actuatorId: a.id,
    climateEntity: a.ref.id,
    powerEntity: a.power.sensor?.id ?? null,
    standby: a.capabilities.standby ?? null,
  }));
}

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

/**
 * Een meetwaarde ophalen, uit de entiteit zelf of uit een van zijn attributen.
 *
 * Die tweede vorm bestaat voor kamers waar een thermostaat of airco de enige
 * thermometer is: die melden hun kamertemperatuur als `current_temperature` en
 * niet als losse `sensor.`-entiteit. Zonder dit kon zo'n kamer geen zone
 * worden (besluit 41).
 */
function lees(source: EntitySource, punt: Meetpunt): number | null {
  return punt.attribute == null
    ? source.number(punt.id)
    : source.attrNumber(punt.id, punt.attribute);
}

function timerAt(source: EntitySource, entityId: string): TimerState {
  if (source.state(entityId) !== 'active') return { endsAtMs: null };
  const finishes = source.attr(entityId, 'finishes_at');
  if (typeof finishes !== 'string') return { endsAtMs: null };
  const ms = Date.parse(finishes);
  return { endsAtMs: Number.isFinite(ms) ? ms : null };
}

/**
 * Home Assistant wanneer de configuratie een entiteit noemt, anders onszelf.
 *
 * Per timer en niet per blok, zodat een installatie die alleen de
 * stabilisatietimer in Home Assistant heeft staan niet ineens ook de andere
 * daar moet hebben.
 */
function timerVan(
  config: SiteConfig,
  source: EntitySource,
  eigen: OwnStateReader,
  id: TimerId,
): TimerState {
  const ref = config.timers?.[id];
  return ref ? timerAt(source, ref.id) : eigen.timer(id);
}

function modusVan(config: SiteConfig, source: EntitySource, eigen: OwnStateReader): Mode | null {
  if (!config.mode) return eigen.modeOverride();

  const handsOff = config.mode.handsOffWhen.some(
    (knop) => source.state(knop.ref.id) === knop.state,
  );
  if (handsOff) return 'handmatig';

  const chosen = source.state(config.mode.select.id);
  return chosen == null || chosen === config.mode.automatic
    ? null
    : (config.mode.aliases[chosen] ?? null);
}

export function buildSystemState(
  config: SiteConfig,
  source: EntitySource,
  nowMs: number,
  /**
   * Waar modus en timers vandaan komen wanneer de configuratie er geen
   * Home Assistant-bron voor noemt. Weggelaten betekent: automatisch, geen
   * timer loopt — wat de replay-harness van een oude opname wil.
   */
  eigen: OwnStateReader = NEUTRAL_OWN_STATE,
  /**
   * Wat de apparaten zouden doen als de arbiter het stuur had. Weggelaten
   * betekent: neem het echte apparaat, wat juist is zodra er werkelijk
   * geschakeld wordt. Zie `shadow-actuators.ts` (besluit 49).
   */
  schaduw: SchaduwApparatenReader = GEEN_SCHADUW,
): SystemState {
  const actuators: Record<string, ActuatorState> = {};
  // Wat de échte apparaten opnemen, en of de schaduw ergens van de
  // werkelijkheid afwijkt. Zie `PowerState.observedDrawW` (besluit 49b).
  let echtVerbruikW = 0;
  let veronderstelling = false;
  for (const b of bindingsVan(config)) {
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

    const echteActie = mapAction(haState, setpointC, b.standby);
    const eigenStand = schaduw.apparaat(b.actuatorId);
    if (eigenStand != null) veronderstelling = true;

    // Dezelfde regel als `reclaimableW` in de kern: een draaiend apparaat telt
    // met zijn meting, en zonder meting met zijn schatting.
    const echtDraait =
      echteActie.ok && (echteActie.value === 'heat' || echteActie.value === 'cool');
    if (echtDraait) {
      echtVerbruikW +=
        powerW ?? config.actuators.find((a) => a.id === b.actuatorId)!.power.estimatedW;
    }

    /*
     * Meet de vermogenssensor nog wel ons apparaat?
     *
     * Zodra de veronderstelde stand van de echte afwijkt, hoort de meting bij
     * een apparaat dat iets anders doet. Zou `claimW` in pv-overschot hem toch
     * gebruiken, dan vroeg een veronderstelde airco de gemeten 0 W van een echt
     * apparaat dat uit staat — gratis draaien. Onbruikbaar melden is eerlijker
     * dan verkeerd melden, en dan valt `claimW` terug op `estimatedW`, precies
     * waar die schatting voor bedoeld is.
     */
    const meetOnsApparaat =
      eigenStand?.action == null ||
      (echteActie.ok && echteActie.value === eigenStand.action);

    actuators[b.actuatorId] = {
      action: eigenStand?.action != null ? value(eigenStand.action, nowMs) : echteActie,
      setpointC:
        eigenStand?.setpointC != null
          ? value(eigenStand.setpointC, nowMs)
          : setpointC == null
            ? unavailable<number>()
            : value(setpointC, nowMs),
      powerW:
        powerW == null || !meetOnsApparaat
          ? unavailable<number>('missing')
          : value(powerW, nowMs),
      lastChangeMs: eigenStand?.lastChangeMs ?? source.changedAt(b.climateEntity),
      producing,
      producingSinceMs:
        producing.ok && producing.value ? source.hvacActionSince(b.climateEntity) : null,
    };
  }

  const zones: SystemState['zones'] = Object.fromEntries(
    config.zones.map((zone) => {
      const t = lees(source, zone.temperature);
      // Luchtvochtigheid is waarneming en geen invoer, net als de
      // buitentemperatuur (besluit 30). Hij stond al in de filter — en lokte
      // dus herberekeningen uit — terwijl niemand hem uitlas.
      const h = zone.humidity == null ? null : lees(source, zone.humidity);
      return [
        zone.id,
        {
          temperatureC: t == null ? unavailable<number>() : value(t, nowMs),
          ...(zone.humidity == null
            ? {}
            : { humidityPct: h == null ? unavailable<number>('missing') : value(h, nowMs) }),
        },
      ];
    }),
  );

  const occupancy: SystemState['occupancy'] = Object.fromEntries(
    config.occupancy.map((bewoner) => {
      const b = source.bool(bewoner.ref.id);
      return [bewoner.id, b == null ? unavailable<boolean>() : value(b, nowMs)];
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

  const grid =
    config.power.gridPower == null ? null : source.number(config.power.gridPower.id);
  const sun = config.sun == null ? null : source.bool(config.sun.id);
  const buiten =
    config.outdoorTemperature == null ? null : source.number(config.outdoorTemperature.id);
  const zonW = config.solarProduction == null ? null : lees(source, config.solarProduction);

  /*
   * De modus komt uit twee soorten knoppen, en de volgorde is niet vrijblijvend.
   *
   * Eerst de "handen af"-knoppen: die winnen van de modus-keuze, want zo werkte
   * het oude systeem ook — de handmatige koelstand schermde daar zelfs de
   * vakantiestand af. Dat de code er maar één van kende, gaf de 151 minuten uit
   * besluit 8b. Nu staan ze in de configuratie en kunnen het er meer zijn.
   *
   * Noemt de configuratie geen knoppen, dan houdt de dienst de modus zelf bij.
   * Dat is de stand bij een verse installatie: daar bestaat geen
   * `input_select`, en er een aanmaken zou schrijven zijn (besluit 15).
   */
  const modeOverride = modusVan(config, source, eigen);

  return {
    nowMs,
    modeOverride,
    occupancy,
    zones,
    actuators,
    power: {
      gridPowerW: grid == null ? unavailable<number>() : value(grid, nowMs),
      // Alleen wanneer de schaduw iets veronderstelt. Zonder schaduw volgt het
      // verbruik uit de apparaten zelf, en rekent de kern het precies zo uit als
      // altijd — dat houdt de replay bit-identiek.
      ...(veronderstelling ? { observedDrawW: echtVerbruikW } : {}),
    },
    timers: {
      stabilisation: timerVan(config, source, eigen, 'stabilisation'),
      manualOverride: timerVan(config, source, eigen, 'manualOverride'),
    },
    lights,
    sunAboveHorizon: sun == null ? unavailable<boolean>() : value(sun, nowMs),
    // Waarneming, geen invoer voor de regeling (besluit 30). Ontbreekt de
    // sensor in de configuratie, dan blijft dit `unavailable` en gaat er null
    // het logboek in — een lege kolom is eerlijker dan een verzonnen waarde.
    outdoorTemperatureC: buiten == null ? unavailable<number>('missing') : value(buiten, nowMs),
    // Ook waarneming (besluit 47). Zonder panelen of zonder sensor blijft dit
    // leeg, en gaat er null het logboek in.
    solarProductionW: zonW == null ? unavailable<number>('missing') : value(zonW, nowMs),
    inputHealth,
  };
}

/**
 * Legt de setpoints van de configuratie gelijk aan wat de bewoner op dat moment
 * werkelijk had ingesteld. Zonder deze stap zou de arbiter tegen andere doelen
 * regelen dan het oude systeem, en zegt de vergelijking niets.
 */
export function configFrom(base: SiteConfig, source: EntitySource): SiteConfig {
  const bron = base.migration;
  if (!bron?.setpoints && !bron?.power) return base;

  /*
   * De terugval is de configuratie zelf, niet een vast getal.
   *
   * Hier stonden negen `input_number`-ID's met elk een hardgecodeerde
   * terugvalwaarde — 20, 22, 19, 16, 18, 22,5 — die de setpoints uit de
   * configuratie herhaalden. Weer twee plekken die moesten kloppen zonder dat
   * iets het controleerde. Valt een helper weg, dan is "wat de configuratie
   * zegt" het juiste antwoord; een los getal in de vertaling was dat nooit.
   */
  const zones: Zone[] = base.zones.map((zone) => {
    const perModus = bron.setpoints?.[zone.id];
    if (!perModus) return zone;

    const setpoints = { ...zone.setpoints };
    for (const [modus, richtingen] of Object.entries(perModus)) {
      const m = modus as Mode;
      const huidig = setpoints[m] ?? {};
      const heat =
        richtingen.heat == null ? huidig.heat : (source.number(richtingen.heat.id) ?? huidig.heat);
      const cool =
        richtingen.cool == null ? huidig.cool : (source.number(richtingen.cool.id) ?? huidig.cool);
      setpoints[m] = {
        ...huidig,
        ...(heat != null ? { heat } : {}),
        ...(cool != null ? { cool } : {}),
      };
    }
    return { ...zone, setpoints };
  });

  const drempel = (ref: DeviceRef | undefined, terugval: number): number =>
    ref == null ? terugval : (source.number(ref.id) ?? terugval);

  return {
    ...base,
    zones,
    power: {
      ...base.power,
      startSurplusW: drempel(bron.power?.startSurplusW, base.power.startSurplusW),
      stopImportW: drempel(bron.power?.stopImportW, base.power.stopImportW),
    },
  };
}


/**
 * Elke entiteit waar de vertaling naar kijkt.
 *
 * Home Assistant stuurt een `state_changed` voor alles wat er in huis beweegt —
 * bij een gemiddelde installatie duizenden entiteiten. Zonder deze lijst zou de
 * regeling op elke lamp en elke telefoonbatterij opnieuw gaan rekenen. In de
 * praktijk scheelde dat een factor zeven in het aantal evaluaties.
 *
 * De lijst komt sinds fase 6b volledig uit de configuratie. Er staat geen
 * entity-ID meer in dit bestand: wat de vertaling uitleest en wat de filter
 * doorlaat komen daarmee uit één bron, en kunnen dus niet uiteenlopen.
 */
export function relevantEntities(config: SiteConfig): ReadonlySet<string> {
  const ids = new Set<string>();

  if (config.power.gridPower) ids.add(config.power.gridPower.id);
  if (config.sun) ids.add(config.sun.id);
  // Modus en timers hoeven niet uit Home Assistant te komen. Wat de dienst
  // zelf bijhoudt heeft geen entiteit om op te wachten.
  if (config.mode) {
    ids.add(config.mode.select.id);
    for (const knop of config.mode.handsOffWhen) ids.add(knop.ref.id);
  }
  if (config.timers?.stabilisation) ids.add(config.timers.stabilisation.id);
  if (config.timers?.manualOverride) ids.add(config.timers.manualOverride.id);
  if (config.outdoorTemperature) ids.add(config.outdoorTemperature.id);
  if (config.solarProduction) ids.add(config.solarProduction.id);

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

  // De helpers van het oude systeem, zolang de migratie loopt. `configFrom`
  // leest ze uit; zonder ze in de filter zou een gewijzigd setpoint pas bij de
  // volgende hartslag doorkomen.
  for (const perModus of Object.values(config.migration?.setpoints ?? {})) {
    for (const richtingen of Object.values(perModus)) {
      if (richtingen.heat) ids.add(richtingen.heat.id);
      if (richtingen.cool) ids.add(richtingen.cool.id);
    }
  }
  const mPower = config.migration?.power;
  if (mPower?.startSurplusW) ids.add(mPower.startSurplusW.id);
  if (mPower?.stopImportW) ids.add(mPower.stopImportW.id);

  return ids;
}

export function observedEntities(config: SiteConfig): ReadonlySet<string> {
  const ids = new Set<string>();
  const legacy = config.migration?.legacyExplanation;
  if (legacy) ids.add(legacy.id);
  return ids;
}

