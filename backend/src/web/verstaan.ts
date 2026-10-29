/**
 * Uitschrijven in huis, rechtstreeks (besluit 211). Tot nu toe liep je zin via
 * een spraakassistent van Home Assistant, en welke spraak-naar-tekst die
 * gebruikte, koos de bewoner daar. Hier stond Google AI: 22 seconden voor een
 * zin van twee seconden, waar Whisper in huis er 1,6 over deed. Nu kiest de
 * app zelf: een spraak-naar-tekst die in huis draait (Whisper, of een andere
 * via Wyoming), en vraagt die rechtstreeks om tekst (`/api/stt/<entiteit>`).
 * Er verandert niets in het huis; het geluid wordt nergens bewaard.
 *
 * Zonder spraak-naar-tekst in huis valt de app terug op de spraakassistent
 * van Home Assistant, zoals eerst.
 */

/** Wat uit de cloud komt: niet vanzelf kiezen. */
const CLOUD = /google|cloud|openai|azure|amazon|microsoft|deepgram|elevenlabs|nabu/i;

/**
 * De spraak-naar-tekst om te gebruiken, uit de `stt.`-entiteiten van Home
 * Assistant: Whisper eerst, dan een andere die in huis draait. Null als er
 * alleen cloud is.
 */
export function kiesVerstaan(entiteiten: readonly string[]): string | null {
  const stt = entiteiten.filter((e) => /^stt\.[a-z0-9_]+$/.test(e));
  return stt.find((e) => /whisper/i.test(e)) ?? stt.find((e) => !CLOUD.test(e)) ?? null;
}

/** De taal zoals deze spraak-naar-tekst hem kent: "nl", "nl-NL" of "nl_NL". */
export function kiesTaalVoor(talen: readonly string[], lang: 'nl' | 'en'): string {
  const voorkeur = lang === 'nl' ? ['nl', 'nl-NL', 'nl_NL', 'nl-BE'] : ['en', 'en-GB', 'en-US', 'en_GB', 'en_US'];
  return voorkeur.find((t) => talen.includes(t)) ?? talen.find((t) => t.toLowerCase().startsWith(lang)) ?? voorkeur[0]!;
}

export interface VerstaanOpties {
  /** Het http-adres van Home Assistant, zonder /api. */
  readonly base: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
  /** Zo lang mag uitschrijven duren; daarna een fout. */
  readonly wachtMs?: number;
}

export class Verstaan {
  readonly #o: VerstaanOpties;
  readonly #talen = new Map<string, readonly string[]>();

  constructor(o: VerstaanOpties) {
    this.#o = o;
  }

  async #talenVan(entiteit: string): Promise<readonly string[]> {
    const al = this.#talen.get(entiteit);
    if (al) return al;
    const f = this.#o.fetch ?? fetch;
    try {
      const r = await f(`${this.#o.base}/api/stt/${entiteit}`, { headers: { authorization: `Bearer ${this.#o.token}` } });
      const j = (await r.json()) as { languages?: unknown };
      const talen = Array.isArray(j.languages) ? j.languages.filter((t): t is string => typeof t === 'string') : [];
      this.#talen.set(entiteit, talen);
      return talen;
    } catch {
      return [];
    }
  }

  /** Ruwe pcm (16 kHz, 16 bit, mono) naar tekst. */
  async tekst(entiteit: string, pcm: Buffer, lang: 'nl' | 'en'): Promise<string> {
    if (!/^stt\.[a-z0-9_]+$/.test(entiteit)) throw new Error(`geen spraak naar tekst: ${entiteit}`);
    const taal = kiesTaalVoor(await this.#talenVan(entiteit), lang);
    const f = this.#o.fetch ?? fetch;
    const r = await f(`${this.#o.base}/api/stt/${entiteit}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#o.token}`,
        'X-Speech-Content': `format=wav; codec=pcm; sample_rate=16000; bit_rate=16; channel=1; language=${taal}`,
      },
      body: new Uint8Array(pcm),
      signal: AbortSignal.timeout(this.#o.wachtMs ?? 20_000),
    });
    if (!r.ok) throw new Error(`Home Assistant kon het niet uitschrijven (${r.status})`);
    const j = (await r.json()) as { text?: unknown; result?: unknown };
    if (j.result !== 'success') return '';
    return typeof j.text === 'string' ? j.text.trim().slice(0, 200) : '';
  }
}
