/**
 * Licht bedienen vanuit de app (besluit 97): een lamp aan of uit, dimmen, warm
 * of koel wit, of alles uit in een kamer, op een etage of in het hele huis.
 *
 * Smart Climate regelt het licht niet (92); dit is een knop voor de bewoner,
 * rechtstreeks naar Home Assistant. Het is de vierde smalle deur in de muur, en
 * daarom net zo smal als de andere:
 *
 * - alleen lampen die het huis nu toont (`lampsFor`), dus nooit iets wat de
 *   bewoner verborg, en nooit een klimaatapparaat of screen;
 * - alleen `light.turn_on` en `light.turn_off`; de client laat ook niets anders
 *   door (`allowLights`);
 * - "aan" voor één lamp of één kamer, nooit voor een hele etage of het huis: dat
 *   is zelden de bedoeling en 's nachts een vervelende vergissing;
 * - een grens op het tempo.
 */

import { lampsFor, type HouseReport } from './house.js';

export type LightTarget = 'lamp' | 'kamer' | 'etage' | 'huis';

export interface LightRequest {
  readonly doel: LightTarget;
  readonly id: string | null;
  readonly aan: boolean;
  /** 1 tot en met 100, alleen bij aan. */
  readonly helderheidPct: number | null;
  /** Warm, neutraal of koel wit, alleen bij aan. */
  readonly kleur: LightColor | null;
}

export type LightColor = 'warm' | 'neutraal' | 'koel';

/** De kleurtemperatuur per keuze, in kelvin: gloeilamp, kantoor, daglicht. */
const KELVIN: Readonly<Record<LightColor, number>> = { warm: 2700, neutraal: 4000, koel: 6000 };

export type LightResult =
  | { readonly ok: true; readonly lampen: number }
  | { readonly ok: false; readonly status: 400 | 404 | 429 | 502 | 503; readonly reden: string };

const TARGETS: readonly LightTarget[] = ['lamp', 'kamer', 'etage', 'huis'];

/** Toetst een verzoek en geeft alleen de bekende velden terug, of een reden. */
export function parseLightRequest(body: unknown): { ok: true; request: LightRequest } | { ok: false; reden: string } {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, reden: 'verwacht een object' };
  const b = body as Record<string, unknown>;
  const doel = b['doel'];
  if (typeof doel !== 'string' || !(TARGETS as readonly string[]).includes(doel)) {
    return { ok: false, reden: `doel is een van ${TARGETS.join(', ')}` };
  }
  const id = b['id'] ?? null;
  if (doel === 'huis' ? id !== null : typeof id !== 'string' || id === '' || id.length > 120) {
    return { ok: false, reden: doel === 'huis' ? 'het huis heeft geen id' : `een ${doel} heeft een id` };
  }
  const aan = b['aan'];
  if (typeof aan !== 'boolean') return { ok: false, reden: 'aan is waar of onwaar' };
  if (aan && (doel === 'etage' || doel === 'huis')) return { ok: false, reden: doel === 'huis' ? 'het hele huis gaat alleen uit' : 'een hele etage gaat alleen uit' };
  const h = b['helderheidPct'] ?? null;
  if (h !== null && (!aan || typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 100)) {
    return { ok: false, reden: 'helderheidPct is een geheel getal van 1 tot en met 100, en alleen bij aan' };
  }
  const kleur = b['kleur'] ?? null;
  if (kleur !== null && (!aan || typeof kleur !== 'string' || !(kleur in KELVIN))) {
    return { ok: false, reden: `kleur is ${Object.keys(KELVIN).join(', ')}, en alleen bij aan` };
  }
  return {
    ok: true,
    request: { doel: doel as LightTarget, id: id as string | null, aan, helderheidPct: h as number | null, kleur: kleur as LightColor | null },
  };
}

export interface LightSwitchOptions {
  /** Het huis zoals het nu is, of null zolang de registers niet gelezen zijn. */
  readonly house: () => HouseReport | null;
  /** Roept de dienst aan in Home Assistant; de client staat alleen licht toe. */
  readonly call: (service: 'turn_on' | 'turn_off', entityIds: readonly string[], data: Record<string, unknown>) => Promise<void>;
  readonly now?: () => number;
  /** Zoveel opdrachten per minuut. */
  readonly perMinute?: number;
}

const WINDOW_MS = 60_000;

export class LightSwitch {
  readonly #options: LightSwitchOptions;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];

  constructor(options: LightSwitchOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#limit = options.perMinute ?? 60;
  }

  async switch(body: unknown): Promise<LightResult> {
    const parsed = parseLightRequest(body);
    if (!parsed.ok) return { ok: false, status: 400, reden: parsed.reden };
    const { doel, id, aan, helderheidPct, kleur } = parsed.request;

    const house = this.#options.house();
    if (house == null) return { ok: false, status: 503, reden: 'het huis is nog niet gelezen uit Home Assistant' };
    const lamps = lampsFor(house, { soort: doel, id });
    if (lamps == null) return { ok: false, status: 404, reden: `die ${doel} kent het huis niet` };
    if (lamps.length === 0) return { ok: true, lampen: 0 };

    const t = this.#now();
    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };
    this.#recent.push(t);

    try {
      const data = {
        ...(helderheidPct == null ? {} : { brightness_pct: helderheidPct }),
        ...(kleur == null ? {} : { color_temp_kelvin: KELVIN[kleur] }),
      };
      await this.#options.call(aan ? 'turn_on' : 'turn_off', lamps, data);
    } catch (error) {
      return { ok: false, status: 502, reden: `Home Assistant weigerde: ${(error as Error).message}` };
    }
    return { ok: true, lampen: lamps.length };
  }
}
