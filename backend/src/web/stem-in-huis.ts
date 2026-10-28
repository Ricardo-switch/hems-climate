/*
 * Helemaal in huis (28 oktober 2026, besluit 203): verstaan en praten op je
 * eigen Home Assistant, met Whisper, Piper en openWakeWord. Die drie add-ons
 * installeert de bewoner zelf: de knop opent hun pagina in Home Assistant, en
 * Smart Climate krijgt er geen extra rechten voor. Staan ze erin, dan doet de
 * add-on na één tik van de beheerder de rest:
 *
 * 1. wat Home Assistant van die add-ons vond (Wyoming, "Nieuw apparaat
 *    gevonden") bevestigen, zodat ze als spraak naar tekst, stem en wekwoord
 *    in Home Assistant staan;
 * 2. een spraakassistent "Smart Climate" maken met die drie, in de taal van de
 *    app, met "Hé huis" als dat wekwoord er al is;
 * 3. die bij Functies › Praten kiezen, en de stem op "helemaal in huis" zetten.
 *
 * Bevestigen en de spraakassistent maken is schrijven naar Home Assistant,
 * buiten licht, scènes en schermen; daarom alleen na die tik, alleen in de
 * add-on, en alleen deze twee dingen: geen andere koppelingen, en een
 * bestaande spraakassistent blijft zoals hij is.
 */

import type { Lang } from './assistant.js';

export type AddOnId = 'whisper' | 'piper' | 'openwakeword';

/** De drie add-ons: hun pagina in Home Assistant, en waar ze als entiteit staan. */
export const ADDONS: readonly { readonly id: AddOnId; readonly slug: string; readonly domein: 'stt' | 'tts' | 'wake_word'; readonly naam: RegExp }[] = [
  { id: 'whisper', slug: 'core_whisper', domein: 'stt', naam: /whisper/i },
  { id: 'piper', slug: 'core_piper', domein: 'tts', naam: /piper/i },
  { id: 'openwakeword', slug: 'core_openwakeword', domein: 'wake_word', naam: /wake.?word/i },
];

/** De naam van de spraakassistent die Smart Climate maakt. */
export const NAAM = 'Smart Climate';
/** Het eigen wekwoord, zoals openWakeWord het noemt. */
export const WEKWOORD = 'he_huis';

/** Aan: hij staat in Home Assistant. Gevonden: Home Assistant zag hem, nog niet bevestigd. Nee: nog niet geïnstalleerd (of niet gestart). */
export type AddOnStaat = 'aan' | 'gevonden' | 'nee';

export interface InHuisStand {
  readonly addons: readonly { readonly id: AddOnId; readonly slug: string; readonly staat: AddOnStaat }[];
  /** De spraakassistent die Smart Climate maakte, of null. */
  readonly assistent: { readonly id: string; readonly wekwoord: string | null } | null;
  readonly bezig: boolean;
  /** Waarom het niet lukte, of null. */
  readonly fout: string | null;
}

/** Een stroom die Home Assistant begon, zoals `config_entries/flow/progress` hem geeft. */
export interface Stroom {
  readonly flow_id: string;
  readonly handler: string;
  readonly context?: { readonly source?: string; readonly title_placeholders?: { readonly name?: string } };
}

/** Een entiteit met zijn naam, uit de toestanden van Home Assistant. */
export interface Entiteit {
  readonly id: string;
  readonly naam: string;
}

/** De velden van `assist_pipeline/pipeline/create`. */
export interface NieuweAssistent {
  readonly name: string;
  readonly language: string;
  readonly conversation_engine: string;
  readonly conversation_language: string;
  readonly stt_engine: string;
  readonly stt_language: string;
  readonly tts_engine: string;
  readonly tts_language: string | null;
  readonly tts_voice: string | null;
  readonly wake_word_entity: string | null;
  readonly wake_word_id: string | null;
}

/** Wat de add-on kan, zodat dit los te toetsen is. */
export interface InHuisDeuren {
  /** De entiteiten voor spraak naar tekst, stem en wekwoord. */
  entiteiten(): readonly Entiteit[];
  /** Wat Home Assistant gevonden heeft en nog wacht op bevestigen (lezen). */
  stromen(): Promise<readonly Stroom[]>;
  /** Een gevonden add-on bevestigen (schrijven, alleen voor `wyoming`). */
  bevestig(flowId: string): Promise<void>;
  /** De spraakassistenten in Home Assistant: id, naam en wekwoord (lezen). */
  assistenten(): Promise<readonly { readonly id: string; readonly naam: string; readonly wekwoord: string | null }[]>;
  /** Welke wekwoorden een wekwoord-entiteit kent (lezen). */
  wekwoorden(entiteit: string): Promise<readonly string[]>;
  /** De taal en stem van een stem-entiteit voor de taal van de app (lezen). */
  stemVoor(entiteit: string, lang: Lang): Promise<{ readonly taal: string | null; readonly voice: string | null }>;
  /** De spraakassistent maken (schrijven); geeft zijn id. */
  maak(a: NieuweAssistent): Promise<string>;
  /** Hem kiezen bij Functies › Praten, met de stem helemaal in huis. */
  kies(id: string): Promise<void>;
  wacht(ms: number): Promise<void>;
}

/** Hoe lang de add-on wacht tot bevestigde add-ons als entiteit in Home Assistant staan. */
export const WACHT_MS = 60_000;

const entiteitVan = (deuren: Pick<InHuisDeuren, 'entiteiten'>, a: (typeof ADDONS)[number]): string | null => {
  const van = deuren.entiteiten().filter((e) => e.id.startsWith(`${a.domein}.`));
  return van.find((e) => a.naam.test(e.id) || a.naam.test(e.naam))?.id ?? null;
};
const stroomVan = (stromen: readonly Stroom[], a: (typeof ADDONS)[number]): Stroom | null =>
  stromen.find((s) => s.handler === 'wyoming' && a.naam.test(s.context?.title_placeholders?.name ?? '')) ?? null;

export class InHuis {
  readonly #d: InHuisDeuren;
  #bezig = false;
  #fout: string | null = null;

  constructor(deuren: InHuisDeuren) {
    this.#d = deuren;
  }

  async stand(): Promise<InHuisStand> {
    const stromen = await this.#d.stromen().catch(() => []);
    const assistent = (await this.#d.assistenten().catch(() => [])).find((a) => a.naam === NAAM) ?? null;
    return {
      addons: ADDONS.map((a) => ({ id: a.id, slug: a.slug, staat: entiteitVan(this.#d, a) ? 'aan' : stroomVan(stromen, a) ? 'gevonden' : 'nee' })),
      assistent: assistent ? { id: assistent.id, wekwoord: assistent.wekwoord } : null,
      bezig: this.#bezig,
      fout: this.#fout,
    };
  }

  /** Bevestigen, de spraakassistent maken en kiezen. Loopt het al, dan gebeurt er niets. */
  async start(lang: Lang): Promise<void> {
    if (this.#bezig) return;
    this.#bezig = true;
    this.#fout = null;
    try {
      await this.#loop(lang);
    } catch (error) {
      this.#fout = (error as Error).message;
    } finally {
      this.#bezig = false;
    }
  }

  async #loop(lang: Lang): Promise<void> {
    // 1. Wat Home Assistant van de drie vond, bevestigen; andere koppelingen niet.
    const stromen = await this.#d.stromen();
    const teBevestigen = ADDONS.map((a) => (entiteitVan(this.#d, a) ? null : stroomVan(stromen, a))).filter((s): s is Stroom => s != null);
    for (const s of teBevestigen) await this.#d.bevestig(s.flow_id);
    // Daarna staan ze er pas na een paar tellen als entiteit.
    const tot = Date.now() + WACHT_MS;
    const [whisper, piper, wekker] = ADDONS;
    while ((!entiteitVan(this.#d, whisper!) || !entiteitVan(this.#d, piper!)) && teBevestigen.length && Date.now() < tot) await this.#d.wacht(2_000);
    const stt = entiteitVan(this.#d, whisper!);
    const tts = entiteitVan(this.#d, piper!);
    if (!stt) throw new Error('Whisper staat nog niet in Home Assistant');
    if (!tts) throw new Error('Piper staat nog niet in Home Assistant');

    // 2. Een bestaande "Smart Climate" blijft zoals hij is; anders een nieuwe.
    const al = (await this.#d.assistenten()).find((a) => a.naam === NAAM);
    let id = al?.id ?? null;
    if (id == null) {
      const ww = entiteitVan(this.#d, wekker!);
      const wekwoord = ww ? ((await this.#d.wekwoorden(ww).catch((): readonly string[] => [])).includes(WEKWOORD) ? WEKWOORD : null) : null;
      const stem = await this.#d.stemVoor(tts, lang).catch(() => ({ taal: null, voice: null }));
      id = await this.#d.maak({
        name: NAAM,
        language: lang,
        conversation_engine: 'conversation.home_assistant',
        conversation_language: lang,
        stt_engine: stt,
        stt_language: lang,
        tts_engine: tts,
        tts_language: stem.taal,
        tts_voice: stem.voice,
        wake_word_entity: wekwoord ? ww : null,
        wake_word_id: wekwoord,
      });
    }
    // 3. Kiezen bij Functies › Praten.
    await this.#d.kies(id);
  }
}

/**
 * Een gevonden add-on bevestigen via de Supervisor (REST): alleen een stroom
 * van `wyoming`, en die vraagt bij een add-on niets dan "ja".
 */
export async function bevestigViaRest(basis: string, token: string, flowId: string, f: typeof fetch = fetch): Promise<void> {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const r = await f(`${basis}/config/config_entries/flow/${encodeURIComponent(flowId)}`, { method: 'POST', headers, body: '{}' });
  if (!r.ok) throw new Error(`Home Assistant gaf ${r.status} bij bevestigen`);
  const uit = (await r.json().catch(() => ({}))) as { type?: string; reason?: string };
  if (uit.type !== 'create_entry' && !(uit.type === 'abort' && uit.reason === 'already_configured')) throw new Error(`bevestigen lukte niet (${uit.reason ?? uit.type ?? 'onbekend'})`);
}

/**
 * De spraakassistent maken over een eigen, korte websocket met Home Assistant
 * (via de Supervisor): niet via HaClient, die schrijft alleen licht, scènes en
 * schermen. Eén opdracht, dan dicht.
 */
export function maakViaWebsocket(adres: string, token: string, a: NieuweAssistent): Promise<string> {
  return new Promise((klaar, mis) => {
    const ws = new WebSocket(adres);
    const grens = setTimeout(() => {
      ws.close();
      mis(new Error('Home Assistant antwoordde niet op tijd'));
    }, 20_000);
    const einde = (fout: Error | null, id?: string) => {
      clearTimeout(grens);
      ws.close();
      if (fout) mis(fout);
      else klaar(id!);
    };
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data)) as { type: string; id?: number; success?: boolean; result?: { id?: string }; error?: { message?: string } };
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (m.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, type: 'assist_pipeline/pipeline/create', ...a }));
      else if (m.type === 'auth_invalid') einde(new Error('Home Assistant herkende de add-on niet'));
      else if (m.type === 'result' && m.id === 1) {
        if (m.success && typeof m.result?.id === 'string') einde(null, m.result.id);
        else einde(new Error(`de spraakassistent maken lukte niet (${m.error?.message ?? 'onbekend'})`));
      }
    });
    ws.addEventListener('error', () => einde(new Error('geen verbinding met Home Assistant')));
  });
}
