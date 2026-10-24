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

export interface PhaseState {
  readonly currentA: Reading<number>;
  readonly voltageV: Reading<number>;
}

export interface PowerState {
  /** Netvermogen in W. Negatief bij teruglevering. */
  readonly gridPowerW: Reading<number>;
  /**
   * Stroom en spanning per fase, op `GridPhase.id` (besluit 78). Alleen als de
   * configuratie een aansluiting kent; weglaten is "niet gemeten".
   */
  readonly phases?: Readonly<Record<string, PhaseState>>;
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
  /**
   * De uitstelbare apparaten, op `Deferrable.id` (besluit 98). Alleen als de
   * configuratie er een kent.
   */
  readonly deferrables?: Readonly<Record<string, DeferrableState>>;
  /**
   * De warmtebuffers, op `HeatStore.id` (besluit 186). Alleen als de
   * configuratie er een kent.
   */
  readonly heatStores?: Readonly<Record<string, HeatStoreState>>;
  /**
   * De goedkoopste uren van de komende dag, van de dienst: de daluren, of later
   * de uren met de laagste prijs (besluit 186). Leeg of weg: er zijn geen
   * goedkopere uren, en wat van het net moet, gebeurt zo laat als het kan.
   */
  readonly cheapWindows?: readonly { readonly fromMs: number; readonly toMs: number }[];
}

/** Wat de dienst bij een buffer onthoudt en bij elk besluit toevoegt (besluit 186). */
export type HeatStoreExtra = Pick<HeatStoreState, 'readyBy' | 'legionellaAtMs' | 'lastFullMs'>;

export interface HeatStoreState {
  /** De watertemperatuur; `missing` als er geen meter is. */
  readonly temperatureC: Reading<number>;
  /** Wat hij nu trekt, in W, als er een meter is. */
  readonly powerW?: Reading<number>;
  /** Staat hij aan: de schakelaar, of de stand van de boiler of thermostaat. */
  readonly on: Reading<boolean>;
  /** "Klaar om" van de bewoner: wanneer en hoe warm. Null of weg: geen. */
  readonly readyBy?: { readonly atMs: number; readonly targetC: number } | null;
  /** Wanneer hij voor het laatst de temperatuur tegen legionella haalde, in epoch-ms. */
  readonly legionellaAtMs?: number | null;
  /**
   * Bij een boiler zonder temperatuur: wanneer hij voor het laatst vol was (hij
   * stond aan en trok bijna niets), in epoch-ms. Null: onbekend.
   */
  readonly lastFullMs?: number | null;
}

export interface DeferrableState {
  /** Mag het nu op afstand starten? */
  readonly remoteStartAllowed: Reading<boolean>;
  /** De bedrijfsstatus zoals het apparaat hem meldt. */
  readonly operation: Reading<string>;
  /**
   * Sinds wanneer "start op afstand" en de bedrijfsstatus hun huidige waarde
   * hebben, in epoch-ms. Wisselde de status ná het klaarzetten weer naar
   * "klaar", dan draaide er sindsdien een programma: dan is de machine leeg,
   * ook al staat "start op afstand" nog aan (besluit 101).
   */
  readonly remoteStartSinceMs?: number | null;
  readonly operationSinceMs?: number | null;
  /** Hoe lang het gekozen programma duurt, in minuten (besluit 101). */
  readonly durationMin?: Reading<number>;
  /**
   * Hoe lang het programma nog duurt, in minuten, en hoe ver het is in procent;
   * met sinds wanneer elk zijn waarde heeft (besluit 167).
   */
  readonly remainingMin?: Reading<number>;
  readonly remainingSinceMs?: number | null;
  readonly progressPct?: Reading<number>;
  readonly progressSinceMs?: number | null;
  /** "Klaar voor" van de bewoner, in epoch-ms; null of weg als er geen is (besluit 101). */
  readonly readyByMs?: number | null;
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
