/**
 * Wanneer je klaar bent met praten (besluit 208). Home Assistant stopte na
 * ongeveer 0,7 seconde stilte, ook midden in een zin ("zet de lamp in de …
 * keuken aan"). Nu zegt de dienst Home Assistant dat het geluid op is
 * (`no_vad`, en daarna een leeg stuk), na een wachttijd die per scherm in te
 * stellen is.
 *
 * Hoe: het geluid in stukjes van 10 ms, de luidheid in dB, en een
 * achtergrondniveau dat langzaam meeloopt met wat er in de kamer klinkt.
 * Luider dan de achtergrond is praten. Praten begint pas na 150 ms (een tik
 * of klap is geen zin); stil is het pas na de wachttijd. Er wordt niets
 * bewaard.
 *
 * Met geluid in de kamer (30 oktober 2026): een tv of afzuigkap die net boven
 * de achtergrond kwam, telde als praten, en dan luisterde het huis door tot
 * vijftien seconden. Nu is je eigen stem de maat: wat ruim zachter is dan jij
 * praat, telt niet als praten en gaat mee in de achtergrond, ook terwijl je
 * praat. En kwam er twee seconden niets op jouw luidheid, dan ben je klaar.
 */

/** De standen van de wachttijd na je laatste woord, in ms. */
export const WACHTTIJD = { vlot: 700, normaal: 1200, rustig: 1800 } as const;
export type Wachttijd = keyof typeof WACHTTIJD;
export const WACHTTIJD_STANDAARD: Wachttijd = 'normaal';

export function wachttijdVan(s: string | null | undefined): Wachttijd {
  return s != null && s in WACHTTIJD ? (s as Wachttijd) : WACHTTIJD_STANDAARD;
}

/** Zo lang mag het duren voor je begint te praten; daarna was er niets. */
export const BEGIN_MS = 5000;
/** Zo lang mag één zin zijn; daarna stopt het luisteren toch (een tv die doorpraat). */
export const MAX_MS = 15000;

const STUK = 160; // 10 ms bij 16 kHz
/** Zoveel dB boven de achtergrond is praten. */
const BOVEN = 9;
/** Zachter dan dit is nooit praten, hoe stil de kamer ook is. */
const ONDER = -52;
/** Zoveel van de laatste 25 stukjes (250 ms) moeten praten zijn om te beginnen. */
const BEGIN_STUKJES = 15;
/** Zoveel dB zachter dan je eigen stem is geen praten meer: een tv verderop, een afzuigkap. */
export const ONDER_STEM = 16;
/** Zoveel dB zachter dan je stem gaat mee in de achtergrond, ook terwijl je praat. */
const ACHTERGROND_ONDER_STEM = 12;
/** Zo dicht bij je stem is een woord van jou. */
const STEM_BINNEN = 10;
/** Zo lang geen woord op jouw luidheid, en je bent klaar, ook als de kamer blijft klinken (de bewoner koos twee seconden). */
export const GEEN_WOORD_MS = 2000;

export type Einde = 'praat' | 'stil' | 'niets';

/** Luidheid van een stukje in dB ten opzichte van vol (0 dB). */
export function db(pcm: Int16Array, van = 0, tot = pcm.length): number {
  let som = 0;
  for (let i = van; i < tot; i++) som += pcm[i]! * pcm[i]!;
  const rms = Math.sqrt(som / Math.max(1, tot - van)) / 32768;
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

/**
 * Volgt één zin. `voeg` geeft 'praat' als je begint, 'stil' als je klaar
 * bent, en 'niets' als er binnen vijf seconden geen woord kwam; daarna
 * niets meer.
 */
export class Spraakeinde {
  readonly #stilMs: number;
  readonly #negeerMs: number;
  #ms = 0;
  #achtergrond: number | null = null;
  #rest = new Int16Array(0);
  /** De laatste 25 stukjes: praten of niet. */
  #venster: boolean[] = [];
  #praat = false;
  #stil = 0;
  #klaar = false;
  /** Hoe luid jij praat: het luidste van een twintigste seconde, sinds je begon. */
  #stem: number | null = null;
  /** De laatste vijf stukjes, voor de luidheid van je stem zonder losse tikken. */
  #kort: number[] = [];
  /** Zo lang geleden was er een woord op jouw luidheid. */
  #sindsWoord = 0;

  /**
   * `negeerMs`: zo lang na het begin telt praten nog niet. Na het wekwoord is
   * dat de staart van "Hé huis" zelf.
   */
  constructor(o: { readonly wachttijd: Wachttijd; readonly negeerMs?: number }) {
    this.#stilMs = WACHTTIJD[o.wachttijd];
    this.#negeerMs = o.negeerMs ?? 0;
  }

  get praat(): boolean {
    return this.#praat;
  }

  voeg(pcm: Int16Array): Einde[] {
    if (this.#klaar) return [];
    const al = new Int16Array(this.#rest.length + pcm.length);
    al.set(this.#rest);
    al.set(pcm, this.#rest.length);
    const uit: Einde[] = [];
    let p = 0;
    for (; p + STUK <= al.length && !this.#klaar; p += STUK) {
      const e = this.#stukje(db(al, p, p + STUK));
      if (e) uit.push(e);
    }
    this.#rest = al.slice(p);
    return uit;
  }

  #stukje(niveau: number): Einde | null {
    this.#ms += 10;
    // De achtergrond: de eerste keer het niveau zelf, daarna langzaam mee als er niet gepraat wordt.
    this.#achtergrond ??= Math.min(niveau, -40);
    this.#kort.push(niveau);
    if (this.#kort.length > 5) this.#kort.shift();
    // Je stem, als je eenmaal praat: wat ruim zachter is, is de kamer.
    const stem = this.#praat ? this.#stem : null;
    const spraak = niveau > Math.max(this.#achtergrond + BOVEN, ONDER, stem == null ? -Infinity : stem - ONDER_STEM);
    if (!spraak || (stem != null && niveau < stem - ACHTERGROND_ONDER_STEM)) this.#achtergrond = Math.min(0.97 * this.#achtergrond + 0.03 * niveau, stem == null ? 0 : stem - ACHTERGROND_ONDER_STEM);
    else if (!this.#praat) this.#achtergrond = Math.min(this.#achtergrond + 0.02, -20);
    if (this.#praat) {
      // Het luidste van een twintigste seconde; een losse tik telt zo niet als stem.
      const gem = this.#kort.reduce((a, b) => a + b, 0) / this.#kort.length;
      if (spraak && (this.#stem == null || gem > this.#stem)) this.#stem = gem;
      this.#sindsWoord = this.#stem != null && niveau >= this.#stem - STEM_BINNEN ? 0 : this.#sindsWoord + 10;
    }
    this.#venster.push(spraak && this.#ms > this.#negeerMs);
    if (this.#venster.length > 25) this.#venster.shift();
    if (!this.#praat) {
      if (this.#venster.filter(Boolean).length >= BEGIN_STUKJES) {
        this.#praat = true;
        this.#stil = 0;
        return 'praat';
      }
      if (this.#ms >= BEGIN_MS) {
        this.#klaar = true;
        return 'niets';
      }
      return null;
    }
    this.#stil = spraak ? 0 : this.#stil + 10;
    if (this.#stil >= this.#stilMs || this.#sindsWoord >= Math.max(GEEN_WOORD_MS, this.#stilMs) || this.#ms >= MAX_MS) {
      this.#klaar = true;
      return 'stil';
    }
    return null;
  }
}
