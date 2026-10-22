/**
 * Schermen bedienen vanuit de app (besluit 121): een screen of zonnescherm
 * open, dicht, stoppen, of naar een stand.
 *
 * Net als het licht (97) een knop voor de bewoner, rechtstreeks naar Home
 * Assistant; de regeling stuurt de schermen niet en leest hun stand niet als
 * zeker. Even smal als de andere deuren:
 *
 * - alleen schermen die het huis nu toont, dus nooit iets wat de bewoner
 *   verborg;
 * - alleen `cover.open_cover`, `close_cover`, `stop_cover` en
 *   `set_cover_position`; de client laat ook niets anders door (`allowCovers`);
 * - een stand alleen bij een scherm dat zijn stand terugmeldt en dat het kan
 *   (Somfy io); een scherm zonder terugmelding (Somfy RTS) krijgt alleen open,
 *   dicht en stop;
 * - één scherm per opdracht, en een grens op het tempo.
 */

import { standNaOpdracht, type HouseDevice, type HouseReport } from './house.js';
import type { Lang } from './assistant.js';

export type CoverAction = 'open' | 'dicht' | 'stop' | 'stand';

export interface CoverRequest {
  readonly id: string;
  readonly actie: CoverAction;
  /** 0 is dicht, 100 is open, zoals Home Assistant het zegt; alleen bij `stand`. */
  readonly standPct: number | null;
}

export type CoverResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 400 | 404 | 429 | 502 | 503; readonly reden: string };

const ACTIONS: readonly CoverAction[] = ['open', 'dicht', 'stop', 'stand'];

/** Toetst een verzoek en geeft alleen de bekende velden terug, of een reden. */
export function parseCoverRequest(body: unknown): { ok: true; request: CoverRequest } | { ok: false; reden: string } {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, reden: 'verwacht een object' };
  const b = body as Record<string, unknown>;
  const id = b['id'];
  if (typeof id !== 'string' || !/^cover\.[a-z0-9_]+$/.test(id)) return { ok: false, reden: 'id is een scherm' };
  const actie = b['actie'];
  if (typeof actie !== 'string' || !(ACTIONS as readonly string[]).includes(actie)) return { ok: false, reden: `actie is een van ${ACTIONS.join(', ')}` };
  const raw = b['standPct'] ?? null;
  if (actie === 'stand') {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 100) return { ok: false, reden: 'standPct is een heel getal van 0 tot 100' };
  } else if (raw !== null) return { ok: false, reden: 'standPct hoort alleen bij actie stand' };
  return { ok: true, request: { id, actie: actie as CoverAction, standPct: actie === 'stand' ? (raw as number) : null } };
}

export interface CoverSwitchOptions {
  /** Het huis zoals het nu is, of null zolang de registers niet gelezen zijn. */
  readonly house: () => HouseReport | null;
  /** Roept de dienst aan in Home Assistant; de client staat alleen schermen toe. */
  readonly call: (service: 'open_cover' | 'close_cover' | 'stop_cover' | 'set_cover_position', entityId: string, data: Record<string, unknown>) => Promise<void>;
  readonly now?: () => number;
  /** Zoveel opdrachten per minuut. */
  readonly perMinute?: number;
}

const WINDOW_MS = 60_000;

const SERVICE: Readonly<Record<CoverAction, 'open_cover' | 'close_cover' | 'stop_cover' | 'set_cover_position'>> = {
  open: 'open_cover',
  dicht: 'close_cover',
  stop: 'stop_cover',
  stand: 'set_cover_position',
};

export class CoverSwitch {
  readonly #options: CoverSwitchOptions;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];
  /** De laatste opdracht per scherm uit de app, open of dicht (besluit 128). */
  readonly #laatste = new Map<string, 'open' | 'dicht'>();

  constructor(options: CoverSwitchOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#limit = options.perMinute ?? 30;
  }

  async move(body: unknown): Promise<CoverResult> {
    const parsed = parseCoverRequest(body);
    if (!parsed.ok) return { ok: false, status: 400, reden: parsed.reden };
    const { id, actie, standPct } = parsed.request;
    const house = this.#options.house();
    if (house == null) return { ok: false, status: 503, reden: 'het huis is nog niet gelezen uit Home Assistant' };
    const scherm: HouseDevice | undefined = house.etages.flatMap((f) => f.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === id && d.soort === 'screen');
    if (scherm == null) return { ok: false, status: 404, reden: 'dat scherm staat niet in je indeling' };
    if (actie === 'stand' && !scherm.scherm?.standKiezen) return { ok: false, status: 400, reden: 'dit scherm meldt zijn stand niet terug; kies open, dicht of stop' };
    if (!this.#take()) return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };
    try {
      await this.#options.call(SERVICE[actie], id, actie === 'stand' ? { position: standPct } : {});
    } catch (error) {
      return { ok: false, status: 502, reden: `Home Assistant weigerde: ${(error as Error).message}` };
    }
    // Na stop staat hij ergens halverwege: dan weet niemand het meer.
    if (actie === 'open' || actie === 'dicht') this.#laatste.set(id, actie);
    else this.#laatste.delete(id);
    return { ok: true };
  }

  /**
   * Het huis met de laatste opdracht uit de app bij elk scherm zonder
   * terugmelding (Somfy RTS, besluit 128), zodat er niet "onbekend" staat.
   */
  withLast(house: HouseReport | null, lang: Lang = 'nl'): HouseReport | null {
    if (house == null || this.#laatste.size === 0) return house;
    const patch = (d: HouseDevice): HouseDevice => {
      const laatste = this.#laatste.get(d.id);
      if (d.soort !== 'screen' || !d.scherm || d.scherm.terugmelding || laatste == null) return d;
      return { ...d, stand: standNaOpdracht(laatste, d.scherm.zonnescherm === true, lang), standCode: 'na-opdracht', scherm: { ...d.scherm, laatste } };
    };
    return {
      ...house,
      etages: house.etages.map((f) => ({ ...f, ruimtes: f.ruimtes.map((r) => ({ ...r, apparaten: r.apparaten.map(patch) })) })),
    };
  }

  #take(): boolean {
    const t = this.#now();
    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) return false;
    this.#recent.push(t);
    return true;
  }
}
