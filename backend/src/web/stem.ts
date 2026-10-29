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

import type { Lang } from './assistant.js';
import { APPARAAT, stemOpties, stemUit, taalVanStem, type StemOptie } from './stemmen.js';
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
  /** De stem die de bewoner koos (besluit 212): `engine|voice`, `apparaat`, of null voor vanzelf. */
  readonly keuze?: () => string | null;
  readonly fetch?: typeof fetch;
}

type Vast = { readonly engine: string; readonly voice: string };

/**
 * De taal van de stem: Nederlands, en anders Vlaams; Engels Brits eerst, dan
 * Amerikaans (besluit 185). Wat er voor die taal is, in welke schrijfwijze ook.
 */
export function kiesTaal(talen: readonly string[], lang: Lang = 'nl'): string | null {
  const deze = talen.filter((t) => new RegExp(`^${lang}([_-]|$)`, 'i').test(t));
  const voorkeur = lang === 'nl' ? [/^nl[_-]nl$/i, /^nl$/i] : [/^en[_-]gb$/i, /^en[_-]us$/i, /^en$/i];
  for (const re of voorkeur) {
    const t = deze.find((x) => re.test(x));
    if (t) return t;
  }
  return deze[0] ?? null;
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
  /** Per taal de taal en stem van de spraakentiteit, één keer opgezocht. */
  readonly #talen = new Map<Lang, { stem: string; taal: string | null; voice: string | null }>();

  constructor(opties: StemOpties) {
    this.#o = opties;
  }

  /**
   * De stem die de bewoner koos (besluit 212), als Home Assistant die nog
   * heeft: een spraakentiteit met een stem, of het apparaat zelf. Null: vanzelf.
   */
  #gekozen(): Vast | typeof APPARAAT | null {
    const k = this.#o.keuze?.() ?? null;
    if (k === APPARAAT) return APPARAAT;
    const s = stemUit(k);
    return s && this.#o.stemmen().includes(s.engine) ? s : null;
  }

  /** Of de bewoner zelf een stem koos, en welke soort: in Home Assistant, of het apparaat. */
  get keuze(): 'huis' | 'apparaat' | null {
    const g = this.#gekozen();
    return g === APPARAAT ? 'apparaat' : g ? 'huis' : null;
  }

  /** Welke stem er spreekt, of null als er geen is (of de bewoner het apparaat koos). */
  get naam(): string | null {
    const g = this.#gekozen();
    if (g === APPARAAT) return null;
    return g?.engine ?? kiesStem(this.#o.stemmen());
  }

  /** De stemmen om uit te kiezen (besluit 212), uit wat Home Assistant in het Nederlands heeft. */
  async opties(): Promise<StemOptie[]> {
    const beschikbaar = new Map<string, string[]>();
    for (const engine of this.#o.stemmen().filter((s) => /^tts\.(piper|google_cloud)/.test(s))) {
      try {
        const talen = ((await this.#o.talen?.(engine)) ?? []).filter((t) => /^nl[-_](NL|BE)$/i.test(t));
        const stemmen: string[] = [];
        for (const taal of talen) for (const v of (await this.#o.stemmenVoor?.(engine, taal)) ?? []) stemmen.push(v.voice_id);
        beschikbaar.set(engine, stemmen);
      } catch {
        // Deze stem dan niet.
      }
    }
    return stemOpties(beschikbaar);
  }

  /** Een zin met een bepaalde stem, om hem te horen voordat je kiest. */
  async voorbeeld(id: string, tekst: string, lang: Lang = 'nl'): Promise<Geluid> {
    const s = stemUit(id);
    if (!s || !this.#o.stemmen().includes(s.engine)) throw new Error('die stem kent Home Assistant niet');
    return this.zeg(tekst, lang, s);
  }

  async zeg(tekst: string, lang: Lang = 'nl', vast?: Vast): Promise<Geluid> {
    // Zoals hij klinkt (besluit 142): eenheden voluit, tijden in woorden.
    const zin = uitspraak(tekst, lang).slice(0, MAX_ZEG);
    if (zin === '') throw new Error('niets te zeggen');
    const stem = vast?.engine ?? this.naam;
    if (stem == null) throw new Error('geen lokale stem in Home Assistant');
    const sleutel = `${stem}|${vast?.voice ?? (await this.taalVoor(lang)).voice ?? ''}|${lang}|${zin}`;
    const al = this.#bewaard.get(sleutel);
    if (al) return al;
    const bezig = this.#bezig.get(sleutel);
    if (bezig) return bezig;
    const job = this.#maak(stem, zin, lang, vast)
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
   * De taal en stem voor een taal van de app (opgelost 15 oktober 2026, per
   * taal sinds besluit 185): zonder taal kiest Piper zijn eerste stem, en dan
   * klinkt een zin vreemd. Null als de stem die taal niet heeft.
   */
  async taalVoor(lang: Lang): Promise<{ taal: string | null; voice: string | null }> {
    const stem = this.naam;
    if (stem == null) return { taal: null, voice: null };
    // De gekozen stem (besluit 212), als hij deze taal spreekt.
    const g = this.#gekozen();
    if (g && g !== APPARAAT) {
      const taal = taalVanStem(g.voice);
      if (taal && taal.toLowerCase().startsWith(lang)) return { taal, voice: g.voice };
    }
    const al = this.#talen.get(lang);
    if (al?.stem === stem) return al;
    let taal: string | null = null;
    let voice: string | null = null;
    try {
      taal = kiesTaal((await this.#o.talen?.(stem)) ?? [], lang);
      if (taal) {
        const lijst = (await this.#o.stemmenVoor?.(stem, taal)) ?? [];
        voice = lijst[0]?.voice_id ?? null;
      }
    } catch {
      // Dan zonder; de volgende keer opnieuw.
      return { taal, voice };
    }
    const uit = { stem, taal, voice };
    this.#talen.set(lang, uit);
    return uit;
  }

  async #maak(stem: string, zin: string, lang: Lang, vast?: Vast): Promise<Geluid> {
    const f = this.#o.fetch ?? fetch;
    const kop = { authorization: `Bearer ${this.#o.token}`, 'content-type': 'application/json' };
    const t = vast ? { taal: taalVanStem(vast.voice), voice: vast.voice } : await this.taalVoor(lang);
    if (this.#o.talen && t.taal == null) throw new Error(lang === 'nl' ? 'de stem in Home Assistant heeft geen Nederlands' : 'de stem in Home Assistant heeft geen Engels');
    const r = await f(`${this.#o.base}/api/tts_get_url`, {
      method: 'POST',
      headers: kop,
      body: JSON.stringify({ engine_id: stem, message: zin, cache: true, ...(t.taal ? { language: t.taal } : {}), ...(t.voice ? { options: { voice: t.voice } } : {}) }),
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
