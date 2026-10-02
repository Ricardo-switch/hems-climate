/**
 * Gevoel en toelichting van de bewoner, vastgelegd naast het logboek (besluit 84).
 *
 * "Te koud, goed, te warm" en "we kookten" zijn wat sensoren niet zien, en het
 * thermisch model heeft ze nodig (besluit 73). Om ze deze winter al te hebben,
 * mag de testpagina ze hier afgeven. Dat is een uitzondering op "de weergave
 * leest alleen" (42), en daarom zo smal als het kan:
 *
 * - het gaat naar één eigen bestand in de logmap, nooit naar Home Assistant
 *   (besluit 15 blijft staan);
 * - alleen vaste woorden voor een bestaande zone, geen vrije tekst;
 * - een grens op de grootte (die van de server) en op het tempo, zodat een
 *   tikkende peuter of een haperend script de dataset niet volstopt.
 *
 * Aanwezigheid van dit object is de schakelaar, net als bij de onboarding: geeft
 * `main.ts` het niet mee, dan bestaat de route niet en staat de muur er.
 */

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FEEDBACK_FILE = 'gevoel.ndjson';

export const FEELINGS = ['te_koud', 'goed', 'te_warm'] as const;
export type Feeling = (typeof FEELINGS)[number];

/** Wat sensoren niet zien. Vaste woorden: geen vrije tekst in de dataset. */
export const NOTES = ['koken', 'raam_open', 'gasten', 'douche', 'zon_door_raam', 'weet_niet'] as const;
export type Note = (typeof NOTES)[number];

export interface FeedbackRecord {
  readonly t: number;
  readonly zoneId: string;
  readonly gevoel?: Feeling;
  readonly toelichting?: Note;
}

export type FeedbackResult =
  | { readonly ok: true; readonly record: FeedbackRecord }
  | { readonly ok: false; readonly status: 400 | 429; readonly reden: string };

export interface FeedbackOptions {
  readonly logDir: string;
  readonly zoneIds: readonly string[];
  readonly now?: () => number;
  /** Zoveel per tien minuten, voor alle zones samen. */
  readonly perTenMinutes?: number;
}

const WINDOW_MS = 10 * 60_000;

export class FeedbackLog {
  readonly #path: string;
  readonly #zones: ReadonlySet<string>;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];

  constructor(options: FeedbackOptions) {
    this.#path = join(options.logDir, FEEDBACK_FILE);
    this.#zones = new Set(options.zoneIds);
    this.#now = options.now ?? Date.now;
    this.#limit = options.perTenMinutes ?? 30;
  }

  /** Toetst een verzoek en schrijft het weg, of zegt waarom niet. */
  async add(body: unknown): Promise<FeedbackResult> {
    if (typeof body !== 'object' || body == null || Array.isArray(body)) {
      return { ok: false, status: 400, reden: 'verwacht een object' };
    }
    const b = body as Record<string, unknown>;
    const zoneId = b['zoneId'];
    if (typeof zoneId !== 'string' || !this.#zones.has(zoneId)) {
      return { ok: false, status: 400, reden: 'onbekende zone' };
    }
    const gevoel = b['gevoel'];
    const toelichting = b['toelichting'];
    const hasFeeling = gevoel !== undefined;
    const hasNote = toelichting !== undefined;
    if (hasFeeling === hasNote) {
      return { ok: false, status: 400, reden: 'precies één van gevoel of toelichting' };
    }
    if (hasFeeling && !(FEELINGS as readonly unknown[]).includes(gevoel)) {
      return { ok: false, status: 400, reden: `gevoel is een van ${FEELINGS.join(', ')}` };
    }
    if (hasNote && !(NOTES as readonly unknown[]).includes(toelichting)) {
      return { ok: false, status: 400, reden: `toelichting is een van ${NOTES.join(', ')}` };
    }

    const t = this.#now();
    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) {
      return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };
    }
    this.#recent.push(t);

    // Alleen de bekende velden, in een vaste volgorde: wat er verder in het
    // verzoek stond, komt niet in de dataset.
    const record: FeedbackRecord = hasFeeling
      ? { t, zoneId, gevoel: gevoel as Feeling }
      : { t, zoneId, toelichting: toelichting as Note };
    await appendFile(this.#path, `${JSON.stringify(record)}\n`, 'utf-8');
    return { ok: true, record };
  }

  /** Wat er sinds `sinceMs` is vastgelegd, nieuwste eerst. */
  async since(sinceMs: number): Promise<FeedbackRecord[]> {
    let text: string;
    try {
      text = await readFile(this.#path, 'utf-8');
    } catch {
      return [];
    }
    const out: FeedbackRecord[] = [];
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const r = JSON.parse(line) as FeedbackRecord;
        if (typeof r.t === 'number' && r.t >= sinceMs) out.push(r);
      } catch {
        // Een afgekapte regel na een herstart telt niet.
      }
    }
    return out.reverse();
  }
}
