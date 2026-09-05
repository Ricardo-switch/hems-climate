/**
 * De live tegenhanger van de replay-cursor.
 *
 * Houdt de laatst bekende toestand van elke entiteit bij, gevoed door
 * `get_states` bij verbinden en daarna door `state_changed`-events. Levert
 * dezelfde `EntitySource` als de harness, zodat beide door precies dezelfde
 * vertaling gaan.
 */

import type { HaEntityState } from './client.js';
import type { EntitySource } from './source.js';

const UNUSABLE = new Set(['unavailable', 'unknown', 'none', '']);

interface Entry {
  state: string;
  attributes: Record<string, unknown>;
  /** Wanneer de state zelf wisselde, in epoch-ms. */
  changedAtMs: number;
  /** De laatste hvac_action, of null. */
  hvacAction: string | null;
  /** Sinds wanneer die hvac_action onafgebroken geldt. */
  hvacActionSinceMs: number | null;
}

export class EntityStore implements EntitySource {
  readonly #entries = new Map<string, Entry>();
  readonly #tracked: ReadonlySet<string> | null;
  readonly #triggers: ReadonlySet<string> | null;

  /**
   * @param tracked Alleen deze entiteiten bewaren. Weglaten bewaart alles.
   *   Een gemiddelde HA-installatie telt duizenden entiteiten waarvan er enkele
   *   tientallen over klimaat gaan; de rest opslaan kost geheugen en levert
   *   niets op.
   * @param triggers Welke daarvan aanleiding zijn om opnieuw te beslissen.
   *   Weglaten maakt alles wat bijgehouden wordt ook een aanleiding. Het
   *   verschil bestaat voor waarnemingen die we alleen vastleggen: het oude
   *   systeem dat zijn uitleg bijwerkt hoort ons niet aan het rekenen te zetten.
   */
  constructor(tracked?: ReadonlySet<string>, triggers?: ReadonlySet<string>) {
    this.#tracked = tracked ?? null;
    this.#triggers = triggers ?? null;
  }

  /** Bewaren we deze entiteit? */
  isRelevant(entityId: string): boolean {
    return this.#tracked == null || this.#tracked.has(entityId);
  }

  /** Is een wijziging hierin reden om opnieuw te beslissen? */
  isTrigger(entityId: string): boolean {
    if (this.#triggers == null) return this.isRelevant(entityId);
    return this.#triggers.has(entityId);
  }

  /** Vult de hele store, bij het opzetten of herstellen van de verbinding. */
  replaceAll(states: readonly HaEntityState[]): void {
    this.#entries.clear();
    for (const s of states) this.apply(s);
  }

  /** Verwerkt één state_changed-event. Geeft terug of er iets is bijgewerkt. */
  apply(s: HaEntityState): boolean {
    if (!this.isRelevant(s.entity_id)) return false;
    const previous = this.#entries.get(s.entity_id);
    const changedAtMs = Date.parse(s.last_changed);
    const hvacRaw = s.attributes['hvac_action'];
    const hvacAction = typeof hvacRaw === 'string' ? hvacRaw : null;

    // De hvac_action-klok loopt door zolang de waarde niet verandert. Dat is
    // wat heat-assist nodig heeft: niet of de ketel aan staat, maar hoe lang
    // hij onafgebroken brandt.
    const hvacChanged = previous?.hvacAction !== hvacAction;
    const now = Number.isFinite(changedAtMs) ? changedAtMs : Date.now();

    this.#entries.set(s.entity_id, {
      state: s.state,
      attributes: s.attributes,
      changedAtMs:
        previous && previous.state === s.state ? previous.changedAtMs : now,
      hvacAction,
      hvacActionSinceMs: hvacChanged ? now : (previous?.hvacActionSinceMs ?? now),
    });
    return true;
  }

  get size(): number {
    return this.#entries.size;
  }

  has(entityId: string): boolean {
    return this.#entries.has(entityId);
  }

  state(entityId: string): string | null {
    const e = this.#entries.get(entityId);
    if (!e || UNUSABLE.has(e.state)) return null;
    return e.state;
  }

  number(entityId: string): number | null {
    const s = this.state(entityId);
    if (s == null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  bool(entityId: string): boolean | null {
    const s = this.state(entityId);
    if (s == null) return null;
    return s === 'on' || s === 'home' || s === 'above_horizon';
  }

  attr(entityId: string, key: string): string | number | null {
    const v = this.#entries.get(entityId)?.attributes[key];
    if (typeof v === 'string' || typeof v === 'number') return v;
    return null;
  }

  attrNumber(entityId: string, key: string): number | null {
    const v = this.attr(entityId, key);
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  changedAt(entityId: string): number | null {
    return this.#entries.get(entityId)?.changedAtMs ?? null;
  }

  hvacAction(entityId: string): string | null {
    return this.#entries.get(entityId)?.hvacAction ?? null;
  }

  hvacActionSince(entityId: string): number | null {
    return this.#entries.get(entityId)?.hvacActionSinceMs ?? null;
  }
}
