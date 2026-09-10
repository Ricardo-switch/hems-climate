/**
 * De modus en de timers die de dienst zélf bijhoudt.
 *
 * Tot fase 6e kwamen die uit Home Assistant: een `input_select` voor de modus
 * en twee `timer.`-entiteiten. Dat werkte, want het oude systeem had ze al
 * aangemaakt. Bij iemand anders bestaan ze niet, en ze aanmaken zou schrijven
 * naar Home Assistant zijn — precies wat besluit 15 verbiedt. Dan blijft er één
 * uitweg over: ze hier houden.
 *
 * **Dit is geen tweede waarheid naast de kern.** De kern behandelt timers al
 * als invoer (zie `state.ts`) en vraagt met een commando om een nieuwe. Wat
 * hier gebeurt is dat die vraag wordt beantwoord. Voorheen beantwoordde het
 * oude systeem hem, door zijn eigen timer te starten; nu kan de dienst het
 * zelf. Aan `decide()` verandert niets.
 *
 * **Wat er niet in zit: opslag.** Een herstart wist de stand. Voor de
 * stabilisatietimer maakt dat niets uit — die loopt minuten. Voor de modus is
 * het een keuze die pas telt wanneer de dienst werkelijk gaat schakelen; in de
 * schaduwmodus is "terug naar automatisch na een herstart" ongevaarlijk. Zodra
 * er geschakeld wordt hoort hier een bestandje bij, en dat is dan een eigen
 * besluit waard.
 */

import type { Command } from '../core/decision.js';
import type { Mode } from '../core/model.js';
import type { TimerId, TimerState } from '../core/state.js';

/**
 * Wat de vertaling nodig heeft om een toestand te bouwen.
 *
 * Een leesinterface en niet de klas zelf, zodat de replay-harness er een
 * opgenomen stand voor in de plaats kan zetten.
 */
export interface OwnStateReader {
  /** De gekozen modus, of null voor volautomatisch. */
  modeOverride(): Mode | null;
  timer(id: TimerId): TimerState;
}

/** Een lege stand: automatisch, geen timer loopt. Voor replay en tests. */
export const NEUTRAL_OWN_STATE: OwnStateReader = {
  modeOverride: () => null,
  timer: () => ({ endsAtMs: null }),
};

export class OwnState implements OwnStateReader {
  #mode: Mode | null = null;
  #timers: Record<TimerId, TimerState> = {
    stabilisation: { endsAtMs: null },
    manualOverride: { endsAtMs: null },
  };

  modeOverride(): Mode | null {
    return this.#mode;
  }

  setMode(mode: Mode | null): void {
    this.#mode = mode;
  }

  timer(id: TimerId): TimerState {
    return this.#timers[id];
  }

  /**
   * Voert de timercommando's van een besluit uit.
   *
   * Alleen de timers: `setAction` en `setSetpoint` gaan over apparaten en
   * horen hier niet. Die worden in de schaduwmodus door niemand uitgevoerd
   * (besluit 15), en straks door de actuator-laag.
   *
   * Dit mag ook draaien wanneer de timers uit Home Assistant komen. De
   * vertaling leest dan die entiteiten en kijkt hier niet naar, dus het is
   * hooguit boekhouding die niemand opvraagt. Dat scheelt een tak die alleen
   * in de ene opstelling wordt gelopen en in de andere niet.
   */
  apply(commands: readonly Command[], nowMs: number): void {
    for (const c of commands) {
      if (c.kind === 'startTimer') {
        this.#timers[c.timerId] = { endsAtMs: nowMs + c.durationS * 1000 };
      } else if (c.kind === 'cancelTimer') {
        this.#timers[c.timerId] = { endsAtMs: null };
      }
    }
  }
}
