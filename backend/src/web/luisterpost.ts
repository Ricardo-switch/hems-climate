/**
 * De microfoon via de dienst (besluit 150): de pagina stuurt geluid over een
 * websocket, de dienst geeft het door aan Home Assistant, en vertaalt wat Home
 * Assistant terugzegt in een paar eenvoudige berichten voor de pagina:
 *
 * - `{ soort: 'klaar' }`: Home Assistant luistert;
 * - `{ soort: 'wakker' }`: het wekwoord is gehoord;
 * - `{ soort: 'praat' }` en `{ soort: 'stil' }`: je begint en stopt met praten;
 * - `{ soort: 'tekst', tekst }`: wat je zei, uitgeschreven;
 * - `{ soort: 'einde' }`: deze ronde is voorbij (ook als er geen wekwoord kwam);
 * - `{ soort: 'fout', reden }`: in gewone woorden waarom het niet lukt.
 *
 * Home Assistant schrijft alleen uit (`end_stage: stt`); wat er met de tekst
 * gebeurt, beslist de pagina via `/api/vraag`, net als bij een getypte zin.
 * Het geluid wordt nergens bewaard.
 */

import type { Gesprek, SpraakEvent } from '../adapters/homeassistant/client.js';
import type { Verbinding } from './websocket.js';

export type Begin = 'wake_word' | 'stt';

export interface LuisterDeur {
  /** Start een spraakopdracht in Home Assistant, tot en met tekst. */
  readonly start: (opts: { readonly start: Begin; readonly pipeline: string | null; readonly onEvent: (e: SpraakEvent) => void }) => Promise<Gesprek>;
  /** De spraakassistent die de bewoner bij Functies koos, of null: die van Home Assistant zelf. */
  readonly pipeline: () => string | null;
}

/** Hoeveel gesprekken er tegelijk mogen lopen: een paar schermen, geen zaal. */
export const MAX_TEGELIJK = 4;

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
      return { soort: 'tekst', tekst: typeof uit?.text === 'string' ? uit.text.trim().slice(0, 200) : '' };
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

/**
 * Eén ronde: geluid van de pagina naar Home Assistant, berichten terug. De
 * pagina sluit, of Home Assistant is klaar: dan stopt de ronde.
 */
export class Luisterpost {
  readonly #deur: LuisterDeur;
  #lopend = 0;

  constructor(deur: LuisterDeur) {
    this.#deur = deur;
  }

  get lopend(): number {
    return this.#lopend;
  }

  /** Begint een ronde voor een verbinding; geeft de afhandeling van geluid en sluiten terug. */
  async begin(verbinding: Verbinding, begin: Begin): Promise<{ readonly geluid: (pcm: Buffer) => void; readonly tekst: (s: string) => void; readonly dicht: () => void }> {
    const stuur = (b: Record<string, unknown>) => verbinding.open() && verbinding.tekst(JSON.stringify(b));
    if (this.#lopend >= MAX_TEGELIJK) {
      stuur({ soort: 'fout', reden: 'Er luisteren al te veel schermen tegelijk.' });
      verbinding.sluit(1013, 'te druk');
      return { geluid: () => {}, tekst: () => {}, dicht: () => {} };
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
    try {
      gesprek = await this.#deur.start({
        start: begin,
        pipeline: this.#deur.pipeline(),
        onEvent: (e) => {
          const b = vertaal(e);
          if (b) stuur(b);
          if (b?.['soort'] === 'einde' || b?.['soort'] === 'fout') {
            klaar();
            verbinding.sluit(1000);
          }
        },
      });
    } catch (error) {
      const m = (error as Error).message;
      stuur({ soort: 'fout', reden: foutInWoorden(/not found/i.test(m) ? 'pipeline-not-found' : '', m) });
      klaar();
      verbinding.sluit(1000);
      return { geluid: () => {}, tekst: () => {}, dicht: () => {} };
    }
    if (weg) gesprek.stop();
    return {
      // Ruwe PCM, 16 kHz, 16 bit, mono; een oneven aantal bytes is geen geluid.
      geluid: (pcm) => {
        if (!weg && pcm.length % 2 === 0) gesprek?.send(pcm);
      },
      // De pagina zegt "klaar met praten" (de telefoon, na een tik).
      tekst: (s) => {
        if (!weg && s === 'klaar') gesprek?.end();
      },
      dicht: klaar,
    };
  }
}
