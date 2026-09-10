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
  'capability_missing',
  'setpoint_out_of_range',
  'superseded_by_higher_priority',
  'no_change_needed',
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
  readonly targetC: number | null;
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
