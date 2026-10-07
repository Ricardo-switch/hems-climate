/**
 * Wat de kern voorstelt, wat de arbiter besluit, en waarom.
 *
 * De uitleg is hier geen zin maar een object. De UI, het log en de historie
 * lezen alle drie hetzelfde besluit, zodat het dashboard niets hoeft te
 * herberekenen en niet kan afwijken van de regeling.
 */

import type { Action, Mode } from './model.js';
import type { TimerId } from './state.js';

/** Waarom een strategie iets voorstelt. */
export const REASON_CODES = [
  'zone_below_setpoint',
  'zone_above_setpoint',
  'zone_satisfied',
  'buffering_free_energy',
  'surplus_available',
  'surplus_insufficient',
  'importing_from_grid',
  'outside_active_hours',
  'mode_excludes_action',
  'nobody_home',
  'failsafe_unreliable_input',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Waarom de arbiter een voorstel niet heeft overgenomen. */
export const BLOCK_CODES = [
  'min_run_not_elapsed',
  'min_rest_not_elapsed',
  'stabilisation_active',
  'settling_after_switch',
  'insufficient_power_budget',
  // Er is genoeg om te draaien, maar niet genoeg marge om te starten
  // (besluit 51). Anders dan een tekort: een apparaat dat al draaide mocht door.
  'start_threshold_not_met',
  'capability_missing',
  'setpoint_out_of_range',
  'superseded_by_higher_priority',
  'no_change_needed',
  // De bewoner heeft het apparaat zelf overgenomen (besluit 74).
  'resident_override',
  // De stroom op een fase zou boven de hoofdzekering min de marge komen (besluit 78).
  'insufficient_current_budget',
] as const;
export type BlockCode = (typeof BLOCK_CODES)[number];

/**
 * Eén voorstel van één strategie voor één actuator.
 *
 * `budgetW` is wat dit voorstel aan vermogen claimt. Voor een apparaat dat al
 * draait is dat zijn gemeten opname; voor een start is het de schatting. Zo
 * wordt het inschakelen van een tweede unit vanzelf marginaal afgerekend.
 */
export interface Intent {
  readonly strategyId: string;
  readonly zoneId: string;
  readonly actuatorId: string;
  readonly action: Action;
  /** Vereist voor heat en cool; genegeerd voor standby en off. */
  readonly setpointC?: number;
  /** Lager wint. Strategieprioriteit, verfijnd met de zoneprioriteit. */
  readonly priority: number;
  readonly budgetW: number;
  readonly reason: ReasonCode;
}

export const DEFERRABLE_STATES = ['not_ready', 'waiting', 'would_start', 'running', 'unknown'] as const;
export type DeferrableStateCode = (typeof DEFERRABLE_STATES)[number];

export const DEFERRABLE_REASONS = [
  'remote_start_not_allowed',
  'program_running',
  'program_finished',
  'reading_unavailable',
  'failsafe_unreliable_input',
  'mode_excludes_action',
  'insufficient_current_budget',
  'latest_start_reached',
  'ready_by_reached',
  'stabilisation_active',
  'surplus_available',
  'surplus_insufficient',
] as const;
export type DeferrableReason = (typeof DEFERRABLE_REASONS)[number];

export interface DeferrableExplanation {
  readonly id: string;
  readonly state: DeferrableStateCode;
  readonly reason: DeferrableReason;
  /** "Klaar voor" van de bewoner, en de start die daarvoor uiterlijk nodig is (besluit 101). */
  readonly readyByMs?: number;
  readonly latestStartMs?: number;
  /** Hoe lang het gekozen programma duurt, als het apparaat dat meldt. */
  readonly durationMin?: number;
}

export type Command =
  | {
      readonly kind: 'setAction';
      readonly actuatorId: string;
      readonly action: Action;
    }
  | {
      readonly kind: 'setSetpoint';
      readonly actuatorId: string;
      readonly setpointC: number;
    }
  | {
      readonly kind: 'startTimer';
      readonly timerId: TimerId;
      readonly durationS: number;
    }
  | { readonly kind: 'cancelTimer'; readonly timerId: TimerId };

export interface RejectedIntent {
  readonly intent: Intent;
  readonly blockedBy: BlockCode;
  /** Vrije toelichting voor het log. Nooit door de UI geparseerd. */
  readonly detail?: string;
}

export interface PowerBudget {
  /**
   * Wat er te verdelen valt: het overschot plus het vermogen dat de bestuurde
   * apparaten nu zelf opnemen. Een draaiend apparaat koopt zichzelf elke ronde
   * opnieuw, en verliest bij krimpend budget van een hogere prioriteit.
   */
  readonly availableW: number;
  readonly allocatedW: number;
  readonly surplusW: number;
  readonly reclaimableW: number;
  /**
   * Netvermogen op dat moment; negatief bij teruglevering.
   *
   * Staat erbij omdat `surplusW` op nul is afgekapt en daarmee niet laat zien
   * hóéveel er geïmporteerd werd. Voor het toerekenen van netstroom achteraf is
   * juist dat getal nodig.
   */
  readonly gridPowerW: number;
}

export interface Explanation {
  readonly mode: Mode;
  /** Waarom deze modus geldt: 'override' of 'schedule'. */
  readonly modeSource: 'override' | 'schedule';
  readonly occupied: boolean;
  readonly budget: PowerBudget;
  readonly failsafe: {
    readonly active: boolean;
    /** DeviceRef.id van elk onbetrouwbaar meetpunt. */
    readonly unreliable: readonly string[];
  };
  readonly perZone: readonly ZoneExplanation[];
  /**
   * Buitentemperatuur op het moment van het besluit, of null.
   *
   * Waarneming en geen invoer voor de regeling: de arbiter doet er niets mee.
   * Hij staat in de uitleg omdat de uitleg is wat het logboek bewaart, en
   * fase 7 hem straks nodig heeft over een hele winter (besluit 30).
   */
  readonly outdoorTemperatureC: number | null;
  /** Opbrengst van de zonnepanelen in W. Zelfde reden, zie besluit 47. */
  readonly solarProductionW: number | null;
  /**
   * De stroom per fase tegen de grens (besluit 78), alleen als de configuratie
   * een aansluiting kent. `bron` zegt of hij gemeten is of geschat uit het
   * netvermogen; null als geen van beide er was.
   */
  readonly phases?: readonly {
    readonly id: string;
    readonly currentA: number | null;
    readonly limitA: number;
    readonly bron: 'gemeten' | 'geschat' | 'onbekend';
  }[];
  /**
   * Wat de uitstelbare apparaten nu zouden doen, en waarom (besluit 98). Alleen
   * als de configuratie er een kent, zodat het logboek anders niet verandert.
   */
  readonly deferrables?: readonly DeferrableExplanation[];
  /**
   * Apparaten die de bewoner nu zelf bedient, met sinds en tot wanneer
   * (besluit 74). Alleen aanwezig als er iets overgenomen is, zodat het logboek
   * zonder ingrepen niet verandert.
   */
  readonly overrides?: readonly {
    readonly actuatorId: string;
    readonly sinceMs: number;
    readonly untilMs: number | null;
  }[];
}

export interface ZoneExplanation {
  readonly zoneId: string;
  readonly temperatureC: number | null;
  /**
   * Luchtvochtigheid, of null wanneer de zone er geen sensor voor heeft.
   *
   * Waarneming en geen invoer voor de regeling, net als de buitentemperatuur
   * (besluit 30). Hij stond al in de eventfilter en lokte herberekeningen uit,
   * terwijl de vertaling hem nooit uitlas en hij nergens werd vastgelegd.
   */
  readonly humidityPct: number | null;
  /** Het doel dat bij de vraag hoort: koelen bij `cool`, anders verwarmen. */
  readonly targetC: number | null;
  /**
   * Beide doelen van dit moment. Een kamer zonder vraag zit ertussen, en dan
   * zegt `targetC` alleen het doel voor verwarmen: "op temperatuur, doel 20°"
   * terwijl het er 22,3° is. De uitleg aan de bewoner heeft beide nodig.
   * Optioneel, want oudere logboeken hebben ze niet.
   */
  readonly heatTargetC?: number | null;
  readonly coolTargetC?: number | null;
  readonly demand: 'heat' | 'cool' | 'none';
  readonly reason: ReasonCode;
}

export interface Decision {
  readonly atMs: number;
  readonly commands: readonly Command[];
  readonly proposed: readonly Intent[];
  readonly accepted: readonly Intent[];
  readonly rejected: readonly RejectedIntent[];
  readonly explanation: Explanation;
}
