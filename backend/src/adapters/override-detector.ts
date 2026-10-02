/**
 * Herkent dat de bewoner zelf ingreep, en houdt bij tot wanneer (besluit 74).
 *
 * De kern weet alleen óf een apparaat overgenomen is (`residentOverrides`).
 * Wie dat bepaalt, zit hier: de herkenner onthoudt de laatste opdracht per
 * apparaat, legt elke waarneming daarnaast (`classifyDeviation`), en begint of
 * beëindigt een ingreep.
 *
 * **Nog niet aangesloten.** In de schaduwmodus voert niemand de opdrachten van
 * de arbiter uit, dus elk apparaat zou er voortdurend "anders" bij staan. De
 * herkenner hoort bij de actuator-laag van stap B, waar opdrachten echt uitgaan.
 * Tot die tijd bewijzen de tests dat de regels kloppen.
 *
 * Wanneer een ingreep eindigt:
 * - op de eindtijd (een uur, vanavond, of het volgende dagdeel);
 * - als de bewoner het apparaat zelf uitzet;
 * - als de bewoner het teruggeeft (`giveBack`).
 * Daarna gaat de regeling verder vanaf de stand waarin de bewoner het apparaat
 * achterliet (49b): de vorige opdracht vervalt, er valt niets meer te vergelijken.
 */

import type { SiteConfig } from '../core/model.js';
import { classifyDeviation, DEFAULT_MARGINS, overrideEndMs } from '../core/override.js';
import type {
  Deviation,
  DeviationMargins,
  DeviceSetting,
  LastCommand,
  OverrideChoice,
  ResidentOverride,
} from '../core/override.js';

export interface OverrideDetectorState {
  readonly lastCommands: Readonly<Record<string, LastCommand>>;
  readonly overrides: Readonly<Record<string, ResidentOverride>>;
}

export class OverrideDetector {
  readonly #config: Pick<SiteConfig, 'timezone' | 'schedule'>;
  readonly #margins: DeviationMargins;
  #last = new Map<string, LastCommand>();
  #overrides = new Map<string, ResidentOverride>();

  constructor(config: Pick<SiteConfig, 'timezone' | 'schedule'>, margins: DeviationMargins = DEFAULT_MARGINS) {
    this.#config = config;
    this.#margins = margins;
  }

  /** De regeling stuurde dit apparaat; zo stond het ervoor. */
  recordCommand(actuatorId: string, wanted: DeviceSetting, before: DeviceSetting, atMs: number): void {
    this.#last.set(actuatorId, { wanted, before, atMs });
  }

  /**
   * Een nieuwe waarneming van een apparaat. Geeft terug wat de afwijking
   * betekent; bij `resident` begint er een ingreep tot het volgende dagdeel,
   * tenzij er al een loopt.
   */
  observe(actuatorId: string, observed: DeviceSetting, nowMs: number): Deviation {
    this.#expire(actuatorId, nowMs);

    if (this.#overrides.has(actuatorId)) {
      // Zelf uitgezet: de ingreep is voorbij, de regeling mag weer.
      if (observed.action === 'off') this.giveBack(actuatorId);
      return 'resident';
    }

    const verdict = classifyDeviation(this.#last.get(actuatorId) ?? null, observed, nowMs, this.#margins);
    if (verdict === 'resident') {
      this.#overrides.set(actuatorId, {
        sinceMs: nowMs,
        untilMs: overrideEndMs('nextDayPart', nowMs, this.#config),
      });
      // Wat de regeling eerder vroeg, telt niet meer: de bewoner heeft gesproken.
      this.#last.delete(actuatorId);
    }
    return verdict;
  }

  /**
   * De bewoner nam het over via de app, of koos hoe lang (besluit 75). Begint
   * een ingreep, of past de eindtijd van een lopende aan.
   */
  takeOver(actuatorId: string, choice: OverrideChoice, nowMs: number): ResidentOverride {
    const current = this.#overrides.get(actuatorId);
    const override = {
      sinceMs: current?.sinceMs ?? nowMs,
      untilMs: overrideEndMs(choice, nowMs, this.#config),
    };
    this.#overrides.set(actuatorId, override);
    this.#last.delete(actuatorId);
    return override;
  }

  /** De bewoner geeft het apparaat terug aan de regeling. */
  giveBack(actuatorId: string): void {
    this.#overrides.delete(actuatorId);
    this.#last.delete(actuatorId);
  }

  /** De ingrepen die nu gelden, voor `SystemState.residentOverrides`. */
  overrides(nowMs: number): Readonly<Record<string, ResidentOverride>> {
    for (const id of [...this.#overrides.keys()]) this.#expire(id, nowMs);
    return Object.fromEntries(this.#overrides);
  }

  #expire(actuatorId: string, nowMs: number): void {
    const o = this.#overrides.get(actuatorId);
    if (o && o.untilMs != null && o.untilMs <= nowMs) this.giveBack(actuatorId);
  }

  /** Voor het bewaren over een herstart heen (besluit 62). */
  snapshot(): OverrideDetectorState {
    return { lastCommands: Object.fromEntries(this.#last), overrides: Object.fromEntries(this.#overrides) };
  }

  restore(state: OverrideDetectorState): void {
    this.#last = new Map(Object.entries(state.lastCommands));
    this.#overrides = new Map(Object.entries(state.overrides));
  }
}
