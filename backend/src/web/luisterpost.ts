/**
 * De microfoon via de dienst (besluit 150): de pagina stuurt geluid over een
 * websocket, de dienst geeft het door aan Home Assistant, en vertaalt wat Home
 * Assistant terugzegt in een paar eenvoudige berichten voor de pagina:
 *
 * - `{ soort: 'klaar' }`: er wordt geluisterd;
 * - `{ soort: 'wakker' }`: het wekwoord is gehoord;
 * - `{ soort: 'praat' }` en `{ soort: 'stil' }`: je begint en stopt met praten;
 * - `{ soort: 'tekst', tekst }`: wat je zei, uitgeschreven;
 * - `{ soort: 'niets' }`: na het wekwoord kwam er geen woord (besluit 208);
 * - `{ soort: 'einde' }`: deze ronde is voorbij (ook als er geen wekwoord kwam);
 * - `{ soort: 'fout', reden }`: in gewone woorden waarom het niet lukt.
 *
 * Sinds besluit 208 hoort de dienst het wekwoord zelf (`wekwoord.ts`), met de
 * gevoeligheid die het scherm meegeeft, en bepaalt hij zelf wanneer je klaar
 * bent met praten (`spraakeinde.ts`), na de wachttijd van het scherm. Home
 * Assistant schrijft alleen nog uit (`end_stage: stt`, `no_vad`). Zonder de
 * modellen, of als het rekenen te traag is, hoort Home Assistant het
 * wekwoord, zoals eerst. Het geluid wordt nergens bewaard.
 */

import type { Gesprek, SpraakEvent } from '../adapters/homeassistant/client.js';
import { Spraakeinde, type Wachttijd } from './spraakeinde.js';
import { Wekluisteraar, Wekmelder, type Gevoeligheid, type Wekmodellen } from './wekwoord.js';
import type { Verbinding } from './websocket.js';
import { isRuis } from './woordzoeker.js';

export type Begin = 'wake_word' | 'stt';

export interface LuisterDeur {
  /** Start een spraakopdracht in Home Assistant, tot en met tekst. */
  readonly start: (opts: { readonly start: Begin; readonly pipeline: string | null; readonly onEvent: (e: SpraakEvent) => void }) => Promise<Gesprek>;
  /** De spraakassistent die de bewoner bij Functies koos, of null: die van Home Assistant zelf. */
  readonly pipeline: () => string | null;
  /** Het wekwoord in de dienst, of null: dan hoort Home Assistant het (besluit 208). */
  readonly wekwoord?: () => Wekmodellen | null;
  /**
   * Rechtstreeks uitschrijven in huis (besluit 211): je hele zin in één keer
   * naar Whisper, zonder spraakassistent. Null als er geen spraak naar tekst
   * in huis is; dan gaat het via de spraakassistent, zoals eerst.
   */
  readonly uitschrijven?: () => ((pcm: Buffer, lang: 'nl' | 'en') => Promise<string>) | null;
}

/** Hoe een scherm luistert: de stand van de twee schuiven bij Functies › Praten. */
export interface Luisterstand {
  readonly gevoeligheid: Gevoeligheid;
  readonly wachttijd: Wachttijd;
  /** De taal van de app op dat scherm, voor het uitschrijven. */
  readonly taal?: 'nl' | 'en';
}

/** Hoeveel gesprekken er tegelijk mogen lopen: een paar schermen, geen zaal. */
export const MAX_TEGELIJK = 4;
/** Na het wekwoord telt praten pas na deze tijd: eerst klinkt de staart van "huis" nog. */
export const NA_WEKWOORD_MS = 300;
/**
 * Rekent het wekwoord langer dan dit deel van de tijd die het geluid duurt,
 * dan houdt de dienst ermee op en hoort Home Assistant het weer: een wand die
 * achterloopt, hoort "Hé huis" pas als je allang klaar bent.
 */
export const TE_TRAAG = 0.6;

/** Een fout van Home Assistant in gewone woorden. */
export function foutInWoorden(code: string, bericht = ''): string {
  if (code === 'wake-engine-missing' || /wake.?word/i.test(bericht)) return 'De gekozen spraakassistent heeft geen wekwoord. Geef hem er een in Home Assistant, of kies een andere bij Functies.';
  if (code === 'stt-provider-missing' || code === 'stt-provider-unsupported-metadata') return 'De spraakassistent heeft geen spraak naar tekst die Nederlands kan.';
  if (code === 'pipeline-not-found' || /pipeline not found/i.test(bericht)) return 'Die spraakassistent bestaat niet meer in Home Assistant. Kies een andere bij Functies.';
  if (code === 'verbinding') return 'De verbinding met Home Assistant viel weg.';
  if (code === 'timeout') return 'Het duurde te lang.';
  if (/staat uit/.test(bericht)) return 'Luisteren mag niet op deze installatie.';
  return 'Home Assistant kon het niet uitschrijven.';
}

/** Wat Home Assistant zegt, als bericht voor de pagina; null als de pagina er niets mee hoeft. */
export function vertaal(e: SpraakEvent): Record<string, unknown> | null {
  switch (e.type) {
    case 'run-start':
      return { soort: 'klaar' };
    case 'wake_word-end':
      return e.data['wake_word_output'] ? { soort: 'wakker' } : null;
    case 'stt-vad-start':
      return { soort: 'praat' };
    case 'stt-vad-end':
      return { soort: 'stil' };
    case 'stt-end': {
      const uit = e.data['stt_output'] as { text?: unknown } | undefined;
      const tekst = typeof uit?.text === 'string' ? uit.text.trim().slice(0, 200) : '';
      // Alleen geluid ("(noise)") is niets gezegd (21 oktober 2026).
      return { soort: 'tekst', tekst: isRuis(tekst) ? '' : tekst };
    }
    case 'run-end':
      return { soort: 'einde' };
    case 'error': {
      const code = String(e.data['code'] ?? '');
      // Geen wekwoord binnen de tijd, of niets verstaan: gewoon een nieuwe ronde.
      if (code === 'wake-word-timeout') return { soort: 'einde' };
      if (code === 'stt-no-text-recognized') return { soort: 'tekst', tekst: '' };
      return { soort: 'fout', reden: foutInWoorden(code, String(e.data['message'] ?? '')) };
    }
    default:
      return null;
  }
}

/** Eén keer wakker: wanneer, hoe zeker, en of er daarna een vraag kwam (null: nog bezig). */
export interface Wekmoment {
  readonly ms: number;
  readonly kans: number | null;
  readonly gevoeligheid: Gevoeligheid | null;
  vraag: boolean | null;
}

/** Hoeveel wekmomenten de dienst onthoudt, alleen in het geheugen. */
export const WEKBOEK = 100;

/** Pcm uit een buffer van de pagina: 16 bit, little-endian. */
const naarPcm = (b: Buffer): Int16Array => new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));

/**
 * Eén ronde: geluid van de pagina naar Home Assistant, berichten terug. De
 * pagina sluit, of Home Assistant is klaar: dan stopt de ronde.
 */
export class Luisterpost {
  readonly #deur: LuisterDeur;
  readonly #nu: () => number;
  #lopend = 0;
  /** Te traag om het wekwoord zelf te horen: dan Home Assistant, tot de dienst herstart. */
  #traag = false;
  /** Hoe lang het wekwoord rekent, als deel van de tijd die het geluid duurt (gemiddeld). */
  #rekentijd: number | null = null;
  #stappen = 0;
  readonly #boek: Wekmoment[] = [];

  constructor(deur: LuisterDeur, nu: () => number = Date.now) {
    this.#deur = deur;
    this.#nu = nu;
  }

  get lopend(): number {
    return this.#lopend;
  }

  /** Wie het wekwoord hoort, en hoe vaak het huis wakker werd (voor Functies › Praten). */
  get stand(): { readonly zelf: boolean; readonly traag: boolean; readonly rekentijd: number | null; readonly boek: readonly Wekmoment[] } {
    return { zelf: !this.#traag && (this.#deur.wekwoord?.() ?? null) != null, traag: this.#traag, rekentijd: this.#rekentijd, boek: [...this.#boek] };
  }

  #wakker(kans: number | null, gevoeligheid: Gevoeligheid | null): Wekmoment {
    const m: Wekmoment = { ms: this.#nu(), kans, gevoeligheid, vraag: null };
    this.#boek.push(m);
    if (this.#boek.length > WEKBOEK) this.#boek.shift();
    return m;
  }

  /** Begint een ronde voor een verbinding; geeft de afhandeling van geluid en sluiten terug. */
  async begin(
    verbinding: Verbinding,
    begin: Begin,
    stand: Luisterstand = { gevoeligheid: 3, wachttijd: 'normaal' },
  ): Promise<{ readonly geluid: (pcm: Buffer) => void; readonly tekst: (s: string) => void; readonly dicht: () => void }> {
    const stuur = (b: Record<string, unknown>) => verbinding.open() && verbinding.tekst(JSON.stringify(b));
    const niets = { geluid: () => {}, tekst: () => {}, dicht: () => {} };
    if (this.#lopend >= MAX_TEGELIJK) {
      stuur({ soort: 'fout', reden: 'Er luisteren al te veel schermen tegelijk.' });
      verbinding.sluit(1013, 'te druk');
      return niets;
    }
    this.#lopend += 1;
    let gesprek: Gesprek | null = null;
    let weg = false;
    const klaar = () => {
      if (weg) return;
      weg = true;
      this.#lopend -= 1;
      gesprek?.stop();
    };
    const einde = (code = 1000) => {
      klaar();
      verbinding.sluit(code);
    };

    // Wie hoort het wekwoord: de dienst, als hij de modellen heeft en het bijhoudt.
    const modellen = begin === 'wake_word' && !this.#traag ? (this.#deur.wekwoord?.() ?? null) : null;
    let oor: { readonly l: Wekluisteraar; readonly melder: Wekmelder } | null = modellen ? { l: new Wekluisteraar(modellen), melder: new Wekmelder(stand.gevoeligheid) } : null;
    // Rechtstreeks uitschrijven (besluit 211): als de dienst ook zelf het einde volgt.
    const direct = modellen || begin === 'stt' ? (this.#deur.uitschrijven?.() ?? null) : null;
    /** Je zin tot nu toe, voor het rechtstreeks uitschrijven. */
    const opname: Buffer[] = [];
    // Het einde van je zin: na het wekwoord (of meteen, zonder wekwoord).
    let zin: Spraakeinde | null = begin === 'stt' ? new Spraakeinde({ wachttijd: stand.wachttijd }) : null;
    let moment: Wekmoment | null = null;
    /** Wat er na het wekwoord binnenkwam voordat Home Assistant klaarstond. */
    let wachtend: Buffer[] | null = null;

    const opEvent = (e: SpraakEvent) => {
      const b = vertaal(e);
      // Het wekwoord van Home Assistant: vanaf nu volgt de dienst je zin.
      if (b?.['soort'] === 'wakker') {
        zin = new Spraakeinde({ wachttijd: stand.wachttijd, negeerMs: NA_WEKWOORD_MS });
        moment = this.#wakker(null, null);
      }
      if (b?.['soort'] === 'tekst' && moment) moment.vraag = b['tekst'] !== '';
      // `klaar` alleen bij het begin; als de dienst het wekwoord al hoorde, is de pagina al verder.
      if (b && !(b['soort'] === 'klaar' && modellen)) stuur(b);
      if (b?.['soort'] === 'einde' || b?.['soort'] === 'fout') einde();
    };

    /** Home Assistant laten uitschrijven, vanaf nu. */
    const start = async (vanaf: Begin) => {
      try {
        gesprek = await this.#deur.start({ start: vanaf, pipeline: this.#deur.pipeline(), onEvent: opEvent });
        if (weg) gesprek.stop();
      } catch (error) {
        const m = (error as Error).message;
        stuur({ soort: 'fout', reden: foutInWoorden(/not found/i.test(m) ? 'pipeline-not-found' : '', m) });
        einde();
        return false;
      }
      return true;
    };

    if (oor || direct) stuur({ soort: 'klaar' });
    else if (!(await start(begin))) return niets;

    /** Je zin is klaar: in één keer naar Whisper, en de tekst naar de pagina. */
    const schrijfUit = async () => {
      if (!direct || weg) return;
      const t = performance.now();
      try {
        const ruw = await direct(Buffer.concat(opname), stand.taal ?? 'nl');
        const tekst = isRuis(ruw) ? '' : ruw;
        console.log(`[luisteren] uitgeschreven in ${((performance.now() - t) / 1000).toFixed(1)} s, ${(opname.reduce((n, b) => n + b.length, 0) / 32_000).toFixed(1)} s geluid`);
        if (moment) moment.vraag = tekst !== '';
        stuur({ soort: 'tekst', tekst });
        stuur({ soort: 'einde' });
      } catch (error) {
        stuur({ soort: 'fout', reden: foutInWoorden('', (error as Error).message) });
      }
      einde();
    };

    /** Volgt je zin; zegt Home Assistant dat het geluid op is als je klaar bent. */
    const volg = (pcm: Int16Array) => {
      for (const e of zin?.voeg(pcm) ?? []) {
        if (e === 'praat') stuur({ soort: 'praat' });
        else if (e === 'stil') {
          stuur({ soort: 'stil' });
          if (direct) void schrijfUit();
          else gesprek?.end();
        } else {
          // Na het wekwoord geen woord: waarschijnlijk was het niet voor het huis. Stil stoppen.
          if (moment) moment.vraag = false;
          stuur({ soort: 'niets' });
          einde();
        }
      }
    };

    return {
      // Ruwe PCM, 16 kHz, 16 bit, mono; een oneven aantal bytes is geen geluid.
      geluid: (b) => {
        if (weg || b.length % 2 !== 0) return;
        const pcm = naarPcm(b);
        if (oor) {
          const t = performance.now();
          const kansen = oor.l.voeg(pcm);
          if (kansen.length) {
            this.#stappen += kansen.length;
            const deel = (performance.now() - t) / (kansen.length * 80);
            this.#rekentijd = this.#rekentijd == null ? deel : 0.95 * this.#rekentijd + 0.05 * deel;
          }
          const hoorde = kansen.some((k) => oor!.melder.kans(k));
          if (hoorde) {
            moment = this.#wakker(oor.melder.hoogste, stand.gevoeligheid);
            oor = null;
            zin = new Spraakeinde({ wachttijd: stand.wachttijd, negeerMs: NA_WEKWOORD_MS });
            stuur({ soort: 'wakker' });
            if (!direct) {
              wachtend = [];
              void start('stt').then((ok) => {
                if (!ok) return;
                for (const d of wachtend?.splice(0) ?? []) gesprek?.send(d);
                wachtend = null;
              });
            }
          } else if (this.#stappen > 100 && this.#rekentijd != null && this.#rekentijd > TE_TRAAG) {
            // Te traag: de pagina begint opnieuw, en dan hoort Home Assistant het.
            this.#traag = true;
            console.warn(`[luisteren] het wekwoord rekent ${Math.round(this.#rekentijd * 100)}% van de tijd; Home Assistant hoort het weer`);
            einde();
          }
          return;
        }
        if (direct) opname.push(b);
        else if (wachtend) wachtend.push(b);
        else gesprek?.send(b);
        volg(pcm);
      },
      // De pagina zegt "klaar met praten" (de telefoon, na een tik).
      tekst: (s) => {
        if (weg || s !== 'klaar') return;
        if (direct) void schrijfUit();
        else gesprek?.end();
      },
      dicht: klaar,
    };
  }
}
