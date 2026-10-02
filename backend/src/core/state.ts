/**
 * De waargenomen toestand van de installatie op één moment.
 *
 * Alles wat `decide()` nodig heeft staat hierin, inclusief de klok en de
 * timers. De kern leest nooit zelf een sensor uit en start nooit zelf een
 * timer: een adapter vult dit object, en timerstarts komen als commando terug.
 * Dat is wat de kern deterministisch en dus afspeelbaar maakt.
 */

import type { Action, Mode } from './model.js';

/** Een gelezen waarde, of de reden waarom er geen waarde is. */
export type Reading<T> =
  | { readonly ok: true; readonly value: T; readonly atMs: number }
  | { readonly ok: false; readonly reason: 'unavailable' | 'unknown' | 'missing' };

export function value<T>(v: T, atMs: number): Reading<T> {
  return { ok: true, value: v, atMs };
}

export function unavailable<T>(
  reason: 'unavailable' | 'unknown' | 'missing' = 'unavailable',
): Reading<T> {
  return { ok: false, reason };
}

/** Leest een waarde uit met terugval, zonder de reden te verliezen. */
export function readOr<T>(r: Reading<T> | undefined, fallback: T): T {
  return r && r.ok ? r.value : fallback;
}

export interface ActuatorState {
  /** Wat het apparaat nu doet volgens het apparaat zelf. */
  readonly action: Reading<Action>;
  /** Het setpoint dat op het apparaat staat, in °C. */
  readonly setpointC: Reading<number>;
  /** Actueel opgenomen vermogen, in W. */
  readonly powerW: Reading<number>;
  /**
   * Wanneer het apparaat voor het laatst van actie wisselde. Bepaalt of
   * minRunMinutes en minRestMinutes verstreken zijn.
   */
  readonly lastChangeMs: number | null;
  /**
   * Of het apparaat op dit moment daadwerkelijk warmte of koude levert.
   *
   * Dit is iets anders dan `action`. Een ketel kan op `heat` staan en toch
   * niets doen omdat de ruimte op temperatuur is; dan is `action` gelijk aan
   * `heat` maar `producing` onwaar. Het onderscheid is nodig voor heat-assist,
   * dat pas mag bijspringen als de hoofdverwarming werkelijk staat te stoken —
   * niet als hij alleen maar ingeschakeld is.
   *
   * Niet elk apparaat rapporteert dit. Blijft het onbekend, dan valt een
   * strategie die erop leunt stil in plaats van te gokken.
   */
  readonly producing: Reading<boolean>;
  /** Sinds wanneer `producing` onafgebroken waar is, of null. */
  readonly producingSinceMs: number | null;
}

export interface ZoneState {
  readonly temperatureC: Reading<number>;
  readonly humidityPct?: Reading<number>;
}

export interface PowerState {
  /** Netvermogen in W. Negatief bij teruglevering. */
  readonly gridPowerW: Reading<number>;
  /**
   * Wat de bestuurde apparaten werkelijk opnemen, in W, wanneer dat iets
   * anders is dan hun stand in `actuators` doet vermoeden (besluit 49b).
   *
   * In de schaduwmodus staat in `actuators` wat de arbiter zelf gestuurd zou
   * hebben, maar het netvermogen is gemeten aan het échte huis. Het budget moet
   * met hetzelfde huis rekenen als de meter: anders telt een veronderstelde
   * airco van 750 W als terugwinbaar terwijl de meter hem nooit zag, en ziet
   * de arbiter 770 W ruimte waar er 20 is.
   *
   * Weglaten betekent: de stand in `actuators` ís de werkelijkheid, en het
   * verbruik volgt daaruit. Zo is het zonder schaduw en straks bij echt
   * schakelen.
   */
  readonly observedDrawW?: number;
}

/**
 * Timers zijn invoer, geen bijwerking. De adapter houdt ze bij; de kern leest
 * alleen wanneer ze aflopen en vraagt via een commando om een nieuwe.
 */
export interface TimerState {
  /** Epoch-ms waarop de timer afloopt, of null wanneer hij niet loopt. */
  readonly endsAtMs: number | null;
}

/** Een ingreep van de bewoner op één apparaat (besluit 74). */
export interface ResidentOverride {
  /** Wanneer de ingreep begon. */
  readonly sinceMs: number;
  /** Wanneer hij eindigt, of null: tot de bewoner het apparaat teruggeeft. */
  readonly untilMs: number | null;
}

export const TIMER_IDS = ['stabilisation', 'manualOverride'] as const;
export type TimerId = (typeof TIMER_IDS)[number];

export interface SystemState {
  /** Epoch-ms. De kern roept nooit Date.now() aan. */
  readonly nowMs: number;
  /** Door de gebruiker gekozen modus, of null voor volautomatisch. */
  readonly modeOverride: Mode | null;
  readonly occupancy: Readonly<Record<string, Reading<boolean>>>;
  readonly zones: Readonly<Record<string, ZoneState>>;
  readonly actuators: Readonly<Record<string, ActuatorState>>;
  readonly power: PowerState;
  readonly timers: Readonly<Record<TimerId, TimerState>>;
  /**
   * Apparaten die de bewoner zelf heeft overgenomen, op actuator-id (besluit 74).
   *
   * Zo'n apparaat krijgt geen opdrachten tot de ingreep afloopt, behalve van de
   * failsafe. Een ingreep met een eindtijd in het verleden geldt niet meer.
   * Weglaten betekent: niemand heeft iets overgenomen. Zo is het in de
   * schaduwmodus, waar niets herkend kan worden.
   */
  readonly residentOverrides?: Readonly<Record<string, ResidentOverride>>;
  /**
   * Elk meetpunt uit `SiteConfig.criticalInputs`, op DeviceRef.id, met alleen
   * de vraag of het nu een geldige waarde geeft. De adapter vult dit; de kern
   * gebruikt het om te bepalen of de failsafe moet ingrijpen.
   */
  readonly inputHealth: Readonly<Record<string, boolean>>;
  /** Lampen uit `eveningExtensionLights`, op DeviceRef.id. */
  readonly lights: Readonly<Record<string, Reading<boolean>>>;
  readonly sunAboveHorizon: Reading<boolean>;
  /**
   * Buitentemperatuur, in °C.
   *
   * **De regeling gebruikt hem niet.** Hij staat hier zodat hij mee het
   * beslislogboek in gaat en de dataset compleet is voor fase 7 (besluit 30).
   * Een ontbrekend meetpunt in een logboek valt niet met terugwerkende kracht
   * te repareren, en op één winter per jaar kost dat een jaar.
   *
   * Wie hier een strategie op wil bouwen: doe dat, maar leg het besluit vast.
   * Zolang dat niet gebeurd is, hoort niets in `core/` deze waarde te lezen —
   * en een test bewaakt dat.
   */
  readonly outdoorTemperatureC: Reading<number>;
  /**
   * Opbrengst van de zonnepanelen in W.
   *
   * Zelfde regel als hierboven: waarneming voor het logboek, en niets in
   * `core/` hoort dit te lezen. Dezelfde test bewaakt het.
   */
  readonly solarProductionW: Reading<number>;
}

/** Loopt de timer nog op dit moment? */
export function timerActive(t: TimerState | undefined, nowMs: number): boolean {
  return t?.endsAtMs != null && t.endsAtMs > nowMs;
}

/** Minuten sinds de laatste schakeling, of Infinity wanneer onbekend. */
export function minutesSinceChange(a: ActuatorState, nowMs: number): number {
  if (a.lastChangeMs == null) return Number.POSITIVE_INFINITY;
  // Ondergrens op nul. Een tijdstempel in de toekomst — klokverschil tussen ons
  // en Home Assistant — zou anders een negatieve verstreken tijd geven, en
  // daarmee elke minimale rust- of draaitijd voor onbepaalde duur blokkeren.
  // Nul betekent "zojuist geschakeld": dat stelt uit in plaats van te forceren,
  // en het lost zichzelf op zodra de klok verder loopt.
  return Math.max(0, (nowMs - a.lastChangeMs) / 60_000);
}

/**
 * Hoe lang het apparaat onafgebroken levert, in minuten. Nul wanneer het niet
 * levert of wanneer het apparaat dat niet rapporteert.
 */
export function producingMinutes(a: ActuatorState, nowMs: number): number {
  if (!a.producing.ok || !a.producing.value) return 0;
  if (a.producingSinceMs == null) return 0;
  return Math.max(0, (nowMs - a.producingSinceMs) / 60_000);
}
