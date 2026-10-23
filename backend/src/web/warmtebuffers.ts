/**
 * De warmtebuffers van de bewoner (besluit 186): "klaar om" bij de jacuzzi, en
 * wat de dienst onthoudt omdat Home Assistant het niet zegt.
 *
 * Een smalle deur, zoals bij de droger (besluit 101): hij bewaart alleen
 * `warmtebuffers.json` naast de dataset, en er gaat niets naar Home Assistant.
 *
 * - **Klaar om:** per buffer wanneer en hoe warm. Voorbij is weg.
 * - **Legionella:** wanneer de boiler voor het laatst warm genoeg was. Dat
 *   moet een herstart overleven, anders is de week na elke update opnieuw vol.
 * - **Vol:** wanneer een boiler zonder temperatuur voor het laatst vol was.
 *
 * En de goedkoopste uren voor de kern: de daluren van het contract, als het er
 * een met een daltarief is. Dynamische prijzen komen met stap E.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HeatStoreExplanation } from '../core/decision.js';
import type { SiteConfig } from '../core/model.js';
import type { HeatStoreExtra } from '../core/state.js';
import { isDal, type Tarieven } from './tarief.js';

export const BUFFERS_FILE = 'warmtebuffers.json';

const WINDOW_MS = 10 * 60_000;
/** Verder vooruit kiezen kan niet: een week. */
const MAX_AHEAD_MS = 7 * 24 * 3_600_000;
/** Zo ver vooruit kijkt de kern naar de goedkoopste uren. */
const CHEAP_AHEAD_MS = 36 * 3_600_000;

interface Bewaard {
  readonly klaarOm: Readonly<Record<string, { readonly atMs: number; readonly targetC: number }>>;
  readonly legionella: Readonly<Record<string, number>>;
  readonly vol: Readonly<Record<string, number>>;
}

export interface BufferOptions {
  readonly logDir: string;
  readonly config: SiteConfig;
  /** Na een wijziging door de bewoner: zodat de dienst meteen opnieuw beslist. */
  readonly onChange?: () => void;
  readonly now?: () => number;
  readonly perTenMinutes?: number;
}

export type BufferResult =
  | { readonly ok: true; readonly id: string; readonly klaarOm: { readonly atMs: number; readonly targetC: number } | null }
  | { readonly ok: false; readonly status: number; readonly reden: string };

const isGetal = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class BufferStore {
  readonly #path: string;
  readonly #options: BufferOptions;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];
  #current: Bewaard = { klaarOm: {}, legionella: {}, vol: {} };

  constructor(options: BufferOptions) {
    this.#options = options;
    this.#path = join(options.logDir, BUFFERS_FILE);
    this.#now = options.now ?? Date.now;
    this.#limit = options.perTenMinutes ?? 30;
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as Record<string, unknown>;
      if (raw?.['versie'] !== 1) return;
      const known = new Set((this.#options.config.heatStores ?? []).map((h) => h.id));
      const tijden = (v: unknown) =>
        Object.fromEntries(Object.entries(typeof v === 'object' && v != null ? v : {}).filter((e): e is [string, number] => known.has(e[0]) && isGetal(e[1])));
      const klaarOm = Object.fromEntries(
        Object.entries(typeof raw['klaarOm'] === 'object' && raw['klaarOm'] != null ? raw['klaarOm'] : {}).filter(
          (e): e is [string, { atMs: number; targetC: number }] => known.has(e[0]) && typeof e[1] === 'object' && e[1] != null && isGetal(e[1].atMs) && isGetal(e[1].targetC),
        ),
      );
      this.#current = { klaarOm, legionella: tijden(raw['legionella']), vol: tijden(raw['vol']) };
    } catch {
      this.#current = { klaarOm: {}, legionella: {}, vol: {} };
    }
  }

  /** Per buffer wat de kern van de dienst krijgt. */
  get extra(): Readonly<Record<string, HeatStoreExtra>> {
    return Object.fromEntries(
      (this.#options.config.heatStores ?? []).map((h) => [
        h.id,
        {
          readyBy: this.#current.klaarOm[h.id] ?? null,
          legionellaAtMs: this.#current.legionella[h.id] ?? null,
          lastFullMs: this.#current.vol[h.id] ?? null,
        },
      ]),
    );
  }

  /** `{ id, klaarOm: epoch-ms, doelC? }` zet klaar om, `klaarOm: null` haalt het weg. */
  async set(body: unknown): Promise<BufferResult> {
    if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, status: 400, reden: 'verwacht { id, klaarOm }' };
    const b = body as Record<string, unknown>;
    const id = b['id'];
    const h = (this.#options.config.heatStores ?? []).find((x) => x.id === id);
    if (typeof id !== 'string' || h == null) return { ok: false, status: 404, reden: 'dat apparaat kent Smart Climate niet als warmtebuffer' };
    const t = this.#now();
    const klaarOm = b['klaarOm'];
    if (klaarOm !== null && (!isGetal(klaarOm) || klaarOm <= t || klaarOm > t + MAX_AHEAD_MS)) {
      return { ok: false, status: 400, reden: 'klaarOm is een tijd in de komende week (epoch-ms), of null' };
    }
    const doel = b['doelC'] ?? h.sunC;
    const max = h.kind === 'jacuzzi' ? 40 : h.sunC;
    if (!isGetal(doel) || doel < h.minC || doel > max) return { ok: false, status: 400, reden: `doelC ligt tussen ${h.minC} en ${max}` };

    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };
    this.#recent.push(t);

    const rest = Object.fromEntries(Object.entries(this.#current.klaarOm).filter(([k]) => k !== id));
    const nieuw = klaarOm === null ? null : { atMs: klaarOm, targetC: doel };
    await this.#save({ ...this.#current, klaarOm: nieuw ? { ...rest, [id]: nieuw } : rest });
    this.#options.onChange?.();
    return { ok: true, id, klaarOm: nieuw };
  }

  /**
   * Na elk besluit: onthoud wanneer de boiler warm genoeg was tegen legionella,
   * en wanneer een boiler zonder temperatuur vol was. Klaar om dat voorbij is,
   * vervalt.
   */
  async observe(explanations: readonly HeatStoreExplanation[] | undefined): Promise<void> {
    const t = this.#now();
    const legionella = { ...this.#current.legionella };
    const vol = { ...this.#current.vol };
    let changed = false;
    for (const e of explanations ?? []) {
      const h = (this.#options.config.heatStores ?? []).find((x) => x.id === e.id);
      if (h == null) continue;
      // Hooguit eens per uur bijwerken: anders schrijft elk besluit het bestand.
      if (h.legionellaC != null && e.temperatureC != null && e.temperatureC >= h.legionellaC && t - (legionella[h.id] ?? 0) > 3_600_000) {
        legionella[h.id] = t;
        changed = true;
      }
      if (h.temperature == null && e.state === 'full' && t - (vol[h.id] ?? 0) > 3_600_000) {
        vol[h.id] = t;
        changed = true;
      }
    }
    const klaarOm = Object.fromEntries(Object.entries(this.#current.klaarOm).filter(([, k]) => k.atMs > t));
    if (Object.keys(klaarOm).length !== Object.keys(this.#current.klaarOm).length) changed = true;
    if (changed) await this.#save({ klaarOm, legionella, vol });
  }

  #writing: Promise<void> = Promise.resolve();

  #save(next: Bewaard): Promise<void> {
    // Eerst naast het bestand schrijven, dan omwisselen, zoals bij de droger.
    this.#current = next;
    const text = `${JSON.stringify({ versie: 1, ...next }, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    return this.#writing;
  }
}

/**
 * De goedkoopste uren van de komende anderhalve dag: de daluren, als het
 * contract een daltarief heeft. Per heel uur, aaneengesloten uren samen.
 */
export function cheapWindows(nowMs: number, timezone: string, prijzen: Pick<Tarieven, 'stroomDal' | 'dalUren' | 'dalEigen'> | null): { fromMs: number; toMs: number }[] {
  if (prijzen?.stroomDal == null) return [];
  const uur = 3_600_000;
  const out: { fromMs: number; toMs: number }[] = [];
  for (let t = Math.floor(nowMs / uur) * uur; t < nowMs + CHEAP_AHEAD_MS; t += uur) {
    if (!isDal(t, timezone, prijzen.dalUren ?? 'nl', prijzen.dalEigen ?? null)) continue;
    const last = out.at(-1);
    if (last && last.toMs === t) last.toMs = t + uur;
    else out.push({ fromMs: t, toMs: t + uur });
  }
  return out;
}
