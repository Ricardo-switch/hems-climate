/**
 * Strategieën stellen voor, de arbiter beslist.
 *
 * Een strategie mag niets weten van andere strategieën en schakelt zelf niets.
 * Ze kijkt naar de context en levert voorstellen met een prijskaartje. Daardoor
 * kan een nieuwe strategie worden toegevoegd zonder een bestaande te raken —
 * en kan er nooit meer een tweede plek ontstaan waar dezelfde beslissing net
 * iets anders wordt genomen.
 */

import type { DecisionContext } from './context.js';
import type { Intent } from './decision.js';

export interface Strategy {
  readonly id: string;
  /** Lager wint van hoger wanneer twee strategieën hetzelfde apparaat willen. */
  readonly priority: number;
  propose(ctx: DecisionContext): Intent[];
}

export class StrategyRegistry {
  readonly #byId = new Map<string, Strategy>();

  register(...strategies: Strategy[]): this {
    for (const s of strategies) {
      if (this.#byId.has(s.id)) {
        throw new Error(`Strategie "${s.id}" is al geregistreerd`);
      }
      this.#byId.set(s.id, s);
    }
    return this;
  }

  /** Alle geregistreerde strategie-ID's, voor de configuratiecontrole. */
  get ids(): string[] {
    return [...this.#byId.keys()].sort();
  }

  /** De strategieën die deze site heeft ingeschakeld, op voorrangsvolgorde. */
  resolve(enabledIds: readonly string[]): Strategy[] {
    const out = enabledIds.map((id) => {
      const s = this.#byId.get(id);
      if (!s) throw new Error(`Onbekende strategie "${id}" in configuratie`);
      return s;
    });
    return out.sort((a, b) => a.priority - b.priority);
  }
}
