/**
 * De live-verbinding naar de open pagina's (uit server.ts, besluit 180). SSE en
 * geen websocket: het verkeer gaat maar één kant op, browsers herverbinden
 * vanzelf, en het kost geen afhankelijkheid. Erover gaan de besluiten, aanbellen
 * (107), het rookalarm, de wand wekken (164), en dat het huis, de bewoners
 * (174) of de meldingen (177) veranderden.
 */

import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';

import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';

/** Een rookmelder in het alarm: wat hij ziet (null: niets), en in welke kamer. */
export interface AlarmMelder {
  readonly id: string;
  readonly naam: string;
  readonly kamer: string;
  readonly gevaar: 'rook' | 'co' | 'hitte' | null;
  readonly sindsMs: number | null;
}

/** Eén open SSE-verbinding. */
interface Listener {
  readonly res: ServerResponse;
  readonly ping: NodeJS.Timeout;
}

/** Hoe lang de dienst wacht voor hij een verandering in het huis doorgeeft: een lamp meteen, een meting rustig. */
const HUIS_SNEL_MS = 300;
const HUIS_RUSTIG_MS = 2_000;

/** Waar de stroom zijn inhoud vandaan haalt. */
export interface LiveBron {
  /** Het laatste besluit, of null zolang er nog niet gerekend is. */
  readonly laatste: () => LiveSnapshot | null;
  /** Het besluit zoals de pagina het krijgt: met het bewonerscontract erbij. */
  readonly metBewoner: (snapshot: LiveSnapshot) => unknown;
  /** Het huis, voor de vingerafdruk; null zonder huis. */
  readonly huis: () => unknown;
}

export class LiveStroom {
  readonly #bron: LiveBron;
  readonly #listeners = new Set<Listener>();

  constructor(bron: LiveBron) {
    this.#bron = bron;
  }

  /**
   * Abonneert een kijker op de besluitenstroom.
   *
   * SSE en geen websocket: het verkeer gaat maar één kant op, browsers
   * herverbinden vanzelf, en het kost geen enkele afhankelijkheid.
   */
  abonneer(res: ServerResponse, headOnly: boolean): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Achter een reverse proxy die buffert komt er anders niets door tot de
      // stroom sluit — en die sluit nooit.
      'x-accel-buffering': 'no',
    });
    if (headOnly) {
      res.end();
      return;
    }
    // Meteen open, ook zonder besluit om mee te sturen: anders hoort de pagina
    // pas bij de eerste ping (25 tellen) dat hij verbonden is, en toont hij
    // na 15 tellen "geen verbinding" (21 oktober 2026).
    res.flushHeaders();

    // Een kwartier stilte is normaal 's nachts. Zonder teken van leven sluit
    // een proxy of een telefoon in slaapstand de verbinding.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    ping.unref?.();
    const listener: Listener = { res, ping };
    this.#listeners.add(listener);
    // Gaat er nu een rookmelder af, dan ziet een scherm dat net opent het meteen.
    if (this.#alarm.some((a) => a.gevaar != null)) res.write(`event: alarm
data: ${JSON.stringify({ melders: this.#alarm, tMs: Date.now() })}

`);

    res.on('close', () => {
      clearInterval(ping);
      this.#listeners.delete(listener);
    });

    // Meteen de huidige stand, zodat de pagina niet leeg blijft tot het
    // volgende besluit. Bij dertig seconden hartslag is dat lang genoeg om
    // voor kapot door te gaan.
    const snapshot = this.#bron.laatste();
    if (snapshot != null) this.#send(listener, snapshot);
  }

  #send(listener: Listener, snapshot: LiveSnapshot): void {
    listener.res.write(`data: ${JSON.stringify(this.#bron.metBewoner(snapshot))}\n\n`);
  }

  /**
   * Er wordt aangebeld (besluit 107): elke open pagina toont het beeld van de
   * deurbel. De melding zegt alleen welke camera; het beeld vraagt de inlog.
   */
  ring(camera: string, naam: string, hoe: { readonly seconden: number; readonly schermAan: boolean; readonly reserve?: readonly string[] } = { seconden: 120, schermAan: true }): void {
    this.#zend('aanbellen', { camera, naam, tMs: Date.now(), seconden: hoe.seconden, schermAan: hoe.schermAan, reserve: hoe.reserve ?? [] });
  }

  /** Wat de rookmelders nu zien (21 oktober 2026). */
  #alarm: readonly AlarmMelder[] = [];

  /**
   * Een rookmelder ziet rook, koolmonoxide of hitte, of niet meer (21 oktober
   * 2026, schets Wand-Rook): elke open pagina toont het alarm met de kamer, of
   * haalt het weg. Alleen lezen; afzetten doe je op de melder.
   */
  alarm(melders: readonly AlarmMelder[]): void {
    this.#alarm = melders;
    this.#zend('alarm', { melders, tMs: Date.now() });
  }

  /**
   * De wand wekken (besluit 164): de gekozen bewegingsmelder ziet iemand. Een
   * wand in de nachtstand of in rust laat dan Thuis weer zien; de rest merkt
   * er niets van.
   */
  wek(waarom: 'beweging'): void {
    this.#zend('wekken', { waarom, tMs: Date.now() });
  }

  /** Een gebeurtenis naar elke open pagina. Een kijker die wegviel, ruimt hij op. */
  #zend(soort: string, data: unknown): void {
    const tekst = `event: ${soort}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const listener of this.#listeners) {
      try {
        listener.res.write(tekst);
      } catch {
        clearInterval(listener.ping);
        this.#listeners.delete(listener);
      }
    }
  }

  /*
   * Het huis en wie er thuis is, live (21 oktober 2026). Eerst vroeg Thuis het
   * huis elke 15 tellen op en Kamer elke 5, per open scherm, ook 's nachts als
   * er niets veranderde. Nu zegt de dienst het als er iets veranderde, en
   * haalt de pagina het dan op. Wat je bedient of ziet bewegen (een lamp, een
   * scherm, beweging, wie er thuis is) gaat meteen; een temperatuur of verbruik
   * dat verschuift rustig, en de pagina bepaalt hoe vaak dat telt. Alleen een
   * vingerafdruk gaat mee: het huis zelf is ruim 100 kB, en een live-stroom
   * wordt niet ingepakt.
   */
  #huisVinger: string | null = null;
  #huisWacht: NodeJS.Timeout | null = null;
  #huisSnel = false;
  #bewonersWacht: NodeJS.Timeout | null = null;

  /** Er veranderde iets in het huis; `snel` voor wat je bedient of ziet bewegen. */
  huisVeranderd(snel: boolean): void {
    if (this.#listeners.size === 0) return;
    this.#huisSnel ||= snel;
    // Een snelle verandering wacht niet op een rustige die al gepland stond.
    if (this.#huisWacht && !snel) return;
    if (this.#huisWacht) clearTimeout(this.#huisWacht);
    this.#huisWacht = setTimeout(() => {
      this.#huisWacht = null;
      const huis = this.#bron.huis();
      if (huis == null) return;
      const vinger = createHash('sha1').update(JSON.stringify(huis)).digest('hex').slice(0, 12);
      const zeg = this.#huisSnel;
      this.#huisSnel = false;
      if (vinger === this.#huisVinger) return;
      this.#huisVinger = vinger;
      this.#zend('huis', { v: vinger, snel: zeg });
    }, snel ? HUIS_SNEL_MS : HUIS_RUSTIG_MS);
    this.#huisWacht.unref?.();
  }

  /** De meldingen veranderden (21 oktober 2026): een nieuwe versie, een lege batterij, of iemand haalde er een weg. */
  meldingenVeranderd(): void {
    this.#zend('meldingen', { tMs: Date.now() });
  }

  /** Iemand komt thuis of gaat weg: de rondjes op Thuis. */
  bewonersVeranderd(): void {
    if (this.#listeners.size === 0 || this.#bewonersWacht) return;
    this.#bewonersWacht = setTimeout(() => {
      this.#bewonersWacht = null;
      this.#zend('bewoners', { tMs: Date.now() });
    }, HUIS_SNEL_MS);
    this.#bewonersWacht.unref?.();
  }

  /** Duwt een besluit naar alle kijkers. Hier hangt de runner zich aan. */
  publish(snapshot: LiveSnapshot): void {
    for (const listener of this.#listeners) {
      try {
        this.#send(listener, snapshot);
      } catch {
        // Een kijker die wegviel voordat 'close' afging. Opruimen en door;
        // dit mag de opname niet raken.
        clearInterval(listener.ping);
        this.#listeners.delete(listener);
      }
    }
  }

  /** Hoeveel pagina's er open zijn. */
  get kijkers(): number {
    return this.#listeners.size;
  }

  /** Alle verbindingen dicht, bij het stoppen van de dienst. */
  sluit(): void {
    for (const listener of this.#listeners) {
      clearInterval(listener.ping);
      listener.res.end();
    }
    this.#listeners.clear();
  }
}
