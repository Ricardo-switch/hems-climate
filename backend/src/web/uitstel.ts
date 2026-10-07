/**
 * "Klaar voor" bij een uitstelbaar apparaat (besluit 101).
 *
 * De bewoner zet de droger klaar en kiest per keer hoe laat hij klaar moet zijn.
 * Dat is de vijfde smalle deur: hij bewaart alleen die eindtijd, per apparaat,
 * in `uitstel.json` naast de dataset. Er gaat niets naar Home Assistant.
 *
 * De kern rekent ermee: de uiterlijke start is de eindtijd min de duur van het
 * programma. Is het programma klaar, of gaat de deur open, dan vervalt de
 * eindtijd vanzelf (`prune`): de volgende keer kiest de bewoner opnieuw.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DeferrableExplanation, DeferrableStateCode } from '../core/decision.js';
import type { SiteConfig } from '../core/model.js';
import { nextLocalTime } from './today.js';

export const UITSTEL_FILE = 'uitstel.json';

const WINDOW_MS = 10 * 60_000;
/** Een eindtijd die al zo lang voorbij is, ruimt zichzelf op. */
const STALE_MS = 12 * 3_600_000;

export interface UitstelOptions {
  readonly logDir: string;
  readonly config: SiteConfig;
  /** Wat het apparaat nu doet, uit het laatste besluit; null als dat er nog niet is. */
  readonly status: (id: string) => DeferrableStateCode | null;
  /** Na een wijziging: zodat de dienst meteen opnieuw beslist. */
  readonly onChange?: () => void;
  readonly now?: () => number;
  readonly perTenMinutes?: number;
}

export type UitstelResult =
  | { readonly ok: true; readonly id: string; readonly klaarVoorMs: number | null }
  | { readonly ok: false; readonly status: number; readonly reden: string };

export class UitstelStore {
  readonly #path: string;
  readonly #options: UitstelOptions;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];
  #current: Record<string, number> = {};

  constructor(options: UitstelOptions) {
    this.#options = options;
    this.#path = join(options.logDir, UITSTEL_FILE);
    this.#now = options.now ?? Date.now;
    this.#limit = options.perTenMinutes ?? 30;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { versie?: unknown; klaarVoor?: unknown };
      const known = new Set((this.#options.config.deferrables ?? []).map((d) => d.id));
      const list = raw?.versie === 1 && typeof raw.klaarVoor === 'object' && raw.klaarVoor != null ? raw.klaarVoor : {};
      this.#current = Object.fromEntries(
        Object.entries(list).filter((e): e is [string, number] => known.has(e[0]) && typeof e[1] === 'number' && Number.isFinite(e[1])),
      );
    } catch {
      this.#current = {};
    }
  }

  /** Per apparaat de eindtijd in epoch-ms, voor de kern. */
  get readyBy(): Readonly<Record<string, number>> {
    return this.#current;
  }

  /** `{ id, klaarVoor: "18:00" }` zet de eindtijd, `klaarVoor: null` haalt hem weg. */
  async set(body: unknown): Promise<UitstelResult> {
    if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, status: 400, reden: 'verwacht { id, klaarVoor }' };
    const b = body as Record<string, unknown>;
    const id = b['id'];
    const d = (this.#options.config.deferrables ?? []).find((x) => x.id === id);
    if (typeof id !== 'string' || d == null) return { ok: false, status: 404, reden: 'dat apparaat kent Smart Climate niet als uitstelbaar' };
    const klaarVoor = b['klaarVoor'];
    if (klaarVoor !== null && (typeof klaarVoor !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(klaarVoor))) {
      return { ok: false, status: 400, reden: 'klaarVoor is een tijd als "18:00", of null' };
    }

    const t = this.#now();
    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };

    let next: Record<string, number>;
    if (klaarVoor === null) {
      next = Object.fromEntries(Object.entries(this.#current).filter(([k]) => k !== id));
    } else {
      // Alleen als hij klaarstaat: anders vervalt de tijd bij het volgende besluit meteen weer.
      const status = this.#options.status(id);
      if (status === 'running') return { ok: false, status: 409, reden: `${d.name} draait al` };
      if (status !== 'waiting' && status !== 'would_start') {
        return { ok: false, status: 409, reden: `${d.name} staat niet klaar: kies een programma, sluit de deur en zet "op afstand starten" aan` };
      }
      next = { ...this.#current, [id]: nextLocalTime(t, klaarVoor, this.#options.config.timezone) };
    }
    this.#recent.push(t);
    await this.#save(next);
    this.#options.onChange?.();
    return { ok: true, id, klaarVoorMs: next[id] ?? null };
  }

  /**
   * Na elk besluit: een eindtijd vervalt als het programma klaar is of de deur
   * openging (het apparaat staat niet meer klaar), of als hij lang voorbij is.
   */
  async prune(explanations: readonly DeferrableExplanation[] | undefined): Promise<void> {
    const t = this.#now();
    const gone = Object.keys(this.#current).filter((id) => {
      const state = explanations?.find((x) => x.id === id)?.state;
      return state === 'not_ready' || t - (this.#current[id] ?? 0) > STALE_MS;
    });
    if (gone.length === 0) return;
    await this.#save(Object.fromEntries(Object.entries(this.#current).filter(([k]) => !gone.includes(k))));
  }

  #writing: Promise<void> = Promise.resolve();

  #save(next: Record<string, number>): Promise<void> {
    // Eerst naast het bestand schrijven, dan omwisselen: een stroomstoring laat
    // nooit een half bestand achter. Na elkaar, zodat twee keer bewaren niet
    // hetzelfde tijdelijke bestand delen.
    this.#current = next;
    const text = `${JSON.stringify({ versie: 1, klaarVoor: next }, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    return this.#writing;
  }
}
