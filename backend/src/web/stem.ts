/*
 * De stem van het huis (besluit 141): een antwoord hardop, met Piper, lokaal
 * in Home Assistant. De dienst vraagt Home Assistant om het geluid van een zin
 * (`/api/tts_get_url`), haalt dat op en geeft het aan de pagina. Er wordt
 * niets geschakeld en er gaat niets het huis uit: Piper draait in Home
 * Assistant zelf.
 *
 * Welke stem: een spraakentiteit (`tts.*`) uit Home Assistant, Piper eerst.
 * Een korte lijst van wat al gezegd is, zodat dezelfde zin niet twee keer
 * gemaakt wordt.
 */

import { uitspraak } from './uitspraak.js';

export interface StemOpties {
  /** De http-basis van Home Assistant, zoals voor de camera's. */
  readonly base: string;
  readonly token: string;
  /** De spraakentiteiten die Home Assistant nu kent. */
  readonly stemmen: () => readonly string[];
  /** Welke talen een stem heeft, uit Home Assistant (`tts/engine/list`). */
  readonly talen?: (stem: string) => Promise<readonly string[]>;
  /** Welke stemmen er voor een taal zijn (`tts/engine/voices`). */
  readonly stemmenVoor?: (stem: string, taal: string) => Promise<readonly { readonly voice_id: string; readonly name: string }[]>;
  readonly fetch?: typeof fetch;
}

/** Nederlands, en anders Vlaams: wat er voor Nederlands is, in welke schrijfwijze ook. */
export function kiesTaal(talen: readonly string[]): string | null {
  const nl = talen.filter((t) => /^nl([_-]|$)/i.test(t));
  return nl.find((t) => /^nl[_-]nl$/i.test(t)) ?? nl.find((t) => /^nl$/i.test(t)) ?? nl[0] ?? null;
}

export interface Geluid {
  readonly type: string;
  readonly data: Buffer;
}

export const MAX_ZEG = 600;
const BEWAAR = 40;

/** Piper eerst, dan een andere lokale stem (Wyoming), dan wat er is. */
export function kiesStem(stemmen: readonly string[]): string | null {
  const tts = stemmen.filter((s) => s.startsWith('tts.'));
  return tts.find((s) => /piper/i.test(s)) ?? tts.find((s) => /wyoming/i.test(s)) ?? tts.find((s) => !/google|cloud|amazon|azure|microsoft|elevenlabs|openai/i.test(s)) ?? null;
}

export class Stem {
  readonly #o: StemOpties;
  readonly #bewaard = new Map<string, Geluid>();
  readonly #bezig = new Map<string, Promise<Geluid>>();
  /** Per stem de Nederlandse taal en stem, één keer opgezocht. */
  #nederlands: { stem: string; taal: string | null; voice: string | null } | null = null;

  constructor(opties: StemOpties) {
    this.#o = opties;
  }

  /** Welke stem er spreekt, of null als er geen lokale stem is. */
  get naam(): string | null {
    return kiesStem(this.#o.stemmen());
  }

  async zeg(tekst: string): Promise<Geluid> {
    // Zoals hij klinkt (besluit 142): eenheden voluit, tijden in woorden.
    const zin = uitspraak(tekst).slice(0, MAX_ZEG);
    if (zin === '') throw new Error('niets te zeggen');
    const stem = this.naam;
    if (stem == null) throw new Error('geen lokale stem in Home Assistant');
    const sleutel = `${stem}|${zin}`;
    const al = this.#bewaard.get(sleutel);
    if (al) return al;
    const bezig = this.#bezig.get(sleutel);
    if (bezig) return bezig;
    const job = this.#maak(stem, zin)
      .then((g) => {
        if (this.#bewaard.size >= BEWAAR) this.#bewaard.delete(this.#bewaard.keys().next().value!);
        this.#bewaard.set(sleutel, g);
        return g;
      })
      .finally(() => this.#bezig.delete(sleutel));
    this.#bezig.set(sleutel, job);
    return job;
  }

  /**
   * De Nederlandse taal en stem (opgelost 15 oktober 2026): zonder taal kiest
   * Piper zijn eerste stem, en dat was Engels; dan klinkt Nederlands vreemd.
   */
  async nederlands(): Promise<{ taal: string | null; voice: string | null }> {
    const stem = this.naam;
    if (stem == null) return { taal: null, voice: null };
    if (this.#nederlands?.stem === stem) return this.#nederlands;
    let taal: string | null = null;
    let voice: string | null = null;
    try {
      taal = kiesTaal((await this.#o.talen?.(stem)) ?? []);
      if (taal) {
        const lijst = (await this.#o.stemmenVoor?.(stem, taal)) ?? [];
        voice = lijst[0]?.voice_id ?? null;
      }
    } catch {
      // Dan zonder; de volgende keer opnieuw.
      return { taal, voice };
    }
    this.#nederlands = { stem, taal, voice };
    return this.#nederlands;
  }

  async #maak(stem: string, zin: string): Promise<Geluid> {
    const f = this.#o.fetch ?? fetch;
    const kop = { authorization: `Bearer ${this.#o.token}`, 'content-type': 'application/json' };
    const nl = await this.nederlands();
    if (this.#o.talen && nl.taal == null) throw new Error('de stem in Home Assistant heeft geen Nederlands');
    const r = await f(`${this.#o.base}/api/tts_get_url`, {
      method: 'POST',
      headers: kop,
      body: JSON.stringify({ engine_id: stem, message: zin, cache: true, ...(nl.taal ? { language: nl.taal } : {}), ...(nl.voice ? { options: { voice: nl.voice } } : {}) }),
    });
    if (!r.ok) throw new Error(`Home Assistant gaf geen geluid (${r.status})`);
    const { path, url } = (await r.json()) as { path?: string; url?: string };
    // Altijd via de eigen basis: de url kan een adres buiten het huis noemen.
    const pad = path ?? (url ? new URL(url).pathname : null);
    if (!pad || !pad.startsWith('/api/tts_proxy/')) throw new Error('Home Assistant gaf geen geluid');
    const a = await f(`${this.#o.base}${pad}`, { headers: { authorization: `Bearer ${this.#o.token}` } });
    if (!a.ok) throw new Error(`Home Assistant gaf geen geluid (${a.status})`);
    return { type: a.headers.get('content-type') ?? 'audio/mpeg', data: Buffer.from(await a.arrayBuffer()) };
  }
}
