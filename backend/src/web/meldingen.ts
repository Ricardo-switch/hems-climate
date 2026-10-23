/*
 * Meldingen in de app (besluit 136, schets Wand-Meldingen).
 *
 * Een bel in het menu, op elke pagina, met een getal als er iets aandacht
 * vraagt. Wat er een melding krijgt, is wat de bewoner koos:
 *
 * - nieuw in Home Assistant: een apparaat dat in geen kamer staat;
 * - reageert niet meer: een apparaat in een kamer dat al een uur onbereikbaar
 *   is, en "weer goed" als het terug is;
 * - een batterij of een airco-filter onder de 10%, of wat de bewoner koos
 *   (besluit 149);
 * - een meter die niets meer levert: zonder meter kloppen de cijfers niet;
 * - de panelen zijn gemeten: kijk of de ligging klopt (besluit 157);
 * - een nieuwe versie, en een mijlpaal zoals 10, 20 of 30 winterdagen.
 *
 * Wat vanzelf weer goed is, lost zichzelf op en schuift naar Eerder. Een
 * wachttijd houdt kort haperen buiten de lijst. Alles staat in één eigen
 * bestand naast de dataset; er gaat niets naar Home Assistant. Een deel gaat
 * ook naar de telefoon, via de app van Home Assistant (besluit 183, push.ts).
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Lang } from './assistant.js';
import { STANDAARD_DREMPELS, onderDrempel, type Drempels } from './house.js';
import { metLidwoord } from './kamerwoorden.js';

export const MELDINGEN_FILE = 'meldingen.json';

export type MeldingSoort = 'nieuw' | 'stil' | 'batterij' | 'filter' | 'meter' | 'versie' | 'mijlpaal' | 'comfort' | 'panelen' | 'rook' | 'update';

export interface Melding {
  /** Vast per onderwerp, zoals `stil:light.hal`: zo komt hetzelfde niet dubbel. */
  readonly id: string;
  readonly soort: MeldingSoort;
  readonly titel: string;
  readonly tekst: string;
  readonly actie?: { readonly label: string; readonly href: string };
  /** Sinds wanneer het speelt. */
  readonly sindsMs: number;
  /** Wanneer het vanzelf goed kwam, of null. */
  readonly opgelostMs: number | null;
  /** Vraagt het aandacht (telt in het getal), of is het alleen ter informatie. */
  readonly aandacht: boolean;
  /** Wat er bij opgelost staat, zoals "Airco zolder weer goed". */
  readonly klaar?: { readonly titel: string; readonly tekst: string };
  /**
   * Dezelfde woorden in het Engels (besluit 185): de dienst maakt een melding
   * in beide talen, en de bel en de telefoon kiezen. Een melding van voor
   * 0.59.5 heeft ze niet en blijft Nederlands.
   */
  readonly en?: MeldingWoorden;
}

/** De woorden van een melding in één taal. */
export interface MeldingWoorden {
  readonly titel: string;
  readonly tekst: string;
  readonly actie?: { readonly label: string };
  readonly klaar?: { readonly titel: string; readonly tekst: string };
}

/** Wat de dienst weet, elke ronde opnieuw. */
export interface MeldingenBron {
  readonly nu: number;
  /** Apparaten zonder kamer: nieuw in Home Assistant. */
  readonly zonderRuimte: readonly { readonly id: string; readonly naam: string }[];
  /** Apparaten in een kamer om te volgen, met hun toestand in Home Assistant. */
  readonly volgen: readonly { readonly id: string; readonly naam: string; readonly kamer: string; readonly kamerId: string; readonly onbereikbaarSindsMs: number | null }[];
  readonly batterijen: readonly { readonly id: string; readonly naam: string; readonly pct: number; readonly kamerId: string | null }[];
  readonly filters: readonly { readonly id: string; readonly naam: string; readonly pct: number; readonly kamerId: string | null }[];
  /**
   * De rookmelders (21 oktober 2026): wat ze zien en sinds wanneer, of hun
   * batterij op is en wanneer ze vervangen moeten (`JJJJ-MM-DD`).
   */
  readonly rookmelders?: readonly { readonly id: string; readonly naam: string; readonly kamer: string; readonly kamerId: string; readonly gevaar: 'rook' | 'co' | 'hitte' | null; readonly sindsMs: number | null; readonly batterijProbleem: boolean; readonly vervangenVoor: string | null }[];
  /** Een nieuwe versie van de add-on die klaarstaat (21 oktober 2026); weg buiten de add-on. */
  readonly update?: { readonly nieuw: string; readonly nu: string } | null;
  /** Meters die altijd moeten leveren, met hun laatste meting; `naamEn` als de naam van de dienst komt. */
  readonly meters: readonly { readonly id: string; readonly naam: string; readonly naamEn?: string; readonly laatsteMs: number | null }[];
  /** Onder welk percentage een batterij of filter een melding geeft (besluit 149); weg is 10%. */
  readonly drempels?: Drempels;
  /** De versie, met het eerste wat er nieuw is; `eersteEn` als het er in het Engels is. */
  readonly versie: { readonly nummer: string; readonly eerste?: string; readonly eersteEn?: string } | null;
  readonly winterdagen: number | null;
  /** Hoe de panelen liggen (besluit 157): gemeten en nog niet bevestigd. Weg zonder panelen. */
  readonly panelen?: { readonly voorstel: boolean } | null;
  /**
   * Wiens comfort er geldt (besluit 147), uit het laatste besluit; weg zonder
   * bewoners. Wisselt het, dan staat het één keer bij de bel.
   */
  readonly comfort?: { readonly id: string; readonly naam: string; readonly waarom: 'thuis' | 'niemand' | 'gekozen'; readonly hoofdNaam: string; readonly hoofd: boolean } | null;
}

/** Zo lang onbereikbaar voor het een melding is: kort haperen hoort er niet in. */
export const STIL_NA_MS = 60 * 60_000;
/** Zo lang nieuw voor het een melding is: wie net iets koppelt, deelt het vaak meteen in. */
export const NIEUW_NA_MS = 10 * 60_000;
/** Zo lang geen meting van een meter. */
export const METER_STIL_NA_MS = 30 * 60_000;
/** Zo lang blijft iets onder Eerder staan. */
export const EERDER_MS = 7 * 86_400_000;
const MIJLPALEN = [10, 20, 30];

interface Bestand {
  readonly versie: 1;
  readonly meldingen: Melding[];
  readonly negeer: string[];
  readonly laatsteVersie: string | null;
  readonly mijlpalen: number[];
  /** Wiens comfort er het laatst gold (besluit 147). */
  readonly laatsteComfort?: string | null;
}

const LOCALE: Readonly<Record<Lang, string>> = { nl: 'nl-NL', en: 'en-GB' };
const duur = (ms: number, lang: Lang) => {
  const w = WOORDEN[lang];
  const min = Math.round(ms / 60_000);
  if (min < 60) return w.minuten(min);
  const uur = Math.round(min / 60);
  return uur < 48 ? w.uren(uur) : w.dagen(Math.round(uur / 24));
};
const klok = (ms: number, lang: Lang) => new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit', timeZone: process.env['TZ'] || undefined }).format(ms);
/** Een kamer midden in een zin: in het Nederlands met lidwoord, in het Engels zoals de bewoner hem noemde. */
const inKamer = (kamer: string, lang: Lang) => (lang === 'nl' ? metLidwoord(kamer) : kamer);
const hoofdletter = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** De woorden van de meldingen, per taal (besluit 185). Engels is Brits. */
const WOORDEN = {
  nl: {
    minuten: (n: number) => `${n} minuten`,
    uren: (n: number) => `${n} uur`,
    dagen: (n: number) => `${n} dagen`,
    bekijk: 'Bekijk',
    nieuw: { titel: (naam: string) => `Nieuw in Home Assistant: ${naam}`, tekst: 'Zet het in een kamer, dan staat het in het huis en kun je het bedienen.', actie: 'Zet in een kamer' },
    stil: {
      titel: (naam: string) => `${naam} reageert niet meer`,
      tekst: (duur: string, kamer: string) => `Al ${duur} geen bericht, in ${kamer}. Staat de stekker erin, of is de verbinding weg?`,
      klaar: (naam: string) => `${naam} weer goed`,
      klaarTekst: (duur: string) => `Na ${duur} zonder verbinding.`,
    },
    batterij: {
      titel: (naam: string) => `Batterij bijna leeg: ${naam}`,
      tekst: (pct: number) => `Nog ${pct}%. Een nieuwe batterij en het doet het weer maanden.`,
      klaar: (naam: string) => `Nieuwe batterij in ${naam}`,
      klaarTekst: (pct: number | null) => `Weer boven de ${pct}%.`,
    },
    filter: {
      titel: (naam: string) => `Filter bijna vol: ${naam}`,
      tekst: (pct: number) => `Nog ${pct}%. Een schoon filter koelt en verwarmt zuiniger.`,
      klaar: (naam: string) => `Filter schoon: ${naam}`,
      klaarTekst: 'Het filter is weer goed.',
    },
    gevaar: { rook: 'rook', co: 'koolmonoxide', hitte: 'hitte' },
    rook: {
      titel: (wat: string, kamer: string) => `${hoofdletter(wat)} in ${kamer}`,
      tekst: (wat: string, om: string) => `De rookmelder ziet ${wat} sinds ${om}. Ga bij brand naar buiten en bel 112.`,
      klaar: (wat: string, kamer: string) => `Geen ${wat} meer in ${kamer}`,
      klaarTekst: (wat: string, om: string) => `Om ${om} zag de rookmelder ${wat}.`,
    },
    rookBatterij: {
      titel: (naam: string) => `Batterij op: ${naam}`,
      tekst: 'De rookmelder zegt dat zijn batterij vervangen moet. Zonder batterij waarschuwt hij niet.',
      klaar: (naam: string) => `Nieuwe batterij in ${naam}`,
      klaarTekst: 'De rookmelder is weer goed.',
    },
    vervangen: {
      titel: (naam: string) => `${naam} vervangen`,
      tekst: (datum: string) => `Een rookmelder gaat tien jaar mee. Deze moet vervangen worden voor ${datum}.`,
      klaarTekst: 'Er hangt een nieuwe melder.',
    },
    update: {
      titel: (nieuw: string) => `Versie ${nieuw} staat klaar`,
      tekst: (nu: string) => `Je hebt ${nu}. Tik om te zien wat er nieuw is, en om bij te werken.`,
      klaar: (nieuw: string) => `Bijgewerkt naar ${nieuw}`,
      klaarTekst: 'De nieuwe versie draait.',
    },
    meter: {
      titel: (naam: string) => `${naam} levert niets meer`,
      sinds: (om: string) => `Sinds ${om} geen meting.`,
      geen: 'Geen meting.',
      waarom: 'Zonder deze meter kloppen de cijfers en de zon niet.',
      klaar: (naam: string) => `${naam} levert weer`,
      klaarTekst: 'De metingen komen weer binnen.',
    },
    panelen: {
      titel: 'Je panelen zijn gemeten',
      tekst: 'Uit een heldere dag volgt hoe ze liggen. Kijk of de richting, de helling en het vermogen kloppen.',
      klaar: 'Je panelen staan erin',
      klaarTekst: 'Zon, het weer en de verwachting rekenen ermee.',
    },
    versie: { titel: (nummer: string) => `Versie ${nummer}: wat is er nieuw`, tekst: 'Kijk wat er beter is.', actie: 'Lees' },
    mijlpaal: {
      titel: (n: number) => `${n} winterdagen meegekeken`,
      nog: (n: number) => `Nog ${n} te gaan, dan weet het huis genoeg om zelf te regelen.`,
      genoeg: 'Genoeg om zelf te regelen. Wanneer dat begint, kies jij.',
    },
    comfort: {
      gekozen: 'Gekozen op een scherm, tot er iemand thuiskomt of weggaat.',
      niemand: 'Er is niemand thuis.',
      thuis: (naam: string) => `${naam} is thuis.`,
      wissel: (hoofd: string, naam: string) => `${hoofd} is weg; ${naam} is thuis.`,
      weer: (naam: string) => `Het comfort van ${naam} geldt weer`,
      nu: (naam: string) => `Het comfort van ${naam} geldt nu`,
      actie: 'Bewoners',
    },
    om: (tijd: string) => `Om ${tijd}.`,
  },
  en: {
    minuten: (n: number) => `${n} minutes`,
    uren: (n: number) => `${n} hours`,
    dagen: (n: number) => `${n} days`,
    bekijk: 'View',
    nieuw: { titel: (naam: string) => `New in Home Assistant: ${naam}`, tekst: 'Put it in a room, then it is in the house and you can control it.', actie: 'Put in a room' },
    stil: {
      titel: (naam: string) => `${naam} no longer responds`,
      tekst: (duur: string, kamer: string) => `No message for ${duur}, in ${kamer}. Is it plugged in, or has the connection gone?`,
      klaar: (naam: string) => `${naam} working again`,
      klaarTekst: (duur: string) => `After ${duur} without a connection.`,
    },
    batterij: {
      titel: (naam: string) => `Battery almost empty: ${naam}`,
      tekst: (pct: number) => `${pct}% left. A new battery and it works for months again.`,
      klaar: (naam: string) => `New battery in ${naam}`,
      klaarTekst: (pct: number | null) => `Above ${pct}% again.`,
    },
    filter: {
      titel: (naam: string) => `Filter almost full: ${naam}`,
      tekst: (pct: number) => `${pct}% left. A clean filter cools and heats more efficiently.`,
      klaar: (naam: string) => `Filter clean: ${naam}`,
      klaarTekst: 'The filter is fine again.',
    },
    gevaar: { rook: 'smoke', co: 'carbon monoxide', hitte: 'heat' },
    rook: {
      titel: (wat: string, kamer: string) => `${hoofdletter(wat)} in ${kamer}`,
      tekst: (wat: string, om: string) => `The smoke detector has seen ${wat} since ${om}. If there is a fire, get outside and call 112.`,
      klaar: (wat: string, kamer: string) => `No more ${wat} in ${kamer}`,
      klaarTekst: (wat: string, om: string) => `At ${om} the smoke detector saw ${wat}.`,
    },
    rookBatterij: {
      titel: (naam: string) => `Battery flat: ${naam}`,
      tekst: 'The smoke detector says its battery needs replacing. Without a battery it cannot warn you.',
      klaar: (naam: string) => `New battery in ${naam}`,
      klaarTekst: 'The smoke detector is fine again.',
    },
    vervangen: {
      titel: (naam: string) => `Replace ${naam}`,
      tekst: (datum: string) => `A smoke detector lasts ten years. This one needs replacing before ${datum}.`,
      klaarTekst: 'A new detector is up.',
    },
    update: {
      titel: (nieuw: string) => `Version ${nieuw} is ready`,
      tekst: (nu: string) => `You have ${nu}. Tap to see what is new, and to update.`,
      klaar: (nieuw: string) => `Updated to ${nieuw}`,
      klaarTekst: 'The new version is running.',
    },
    meter: {
      titel: (naam: string) => `${naam} has stopped reporting`,
      sinds: (om: string) => `No reading since ${om}.`,
      geen: 'No reading.',
      waarom: 'Without this meter the figures and the sun are not right.',
      klaar: (naam: string) => `${naam} is reporting again`,
      klaarTekst: 'The readings are coming in again.',
    },
    panelen: {
      titel: 'Your panels have been measured',
      tekst: 'A clear day shows how they lie. Check whether the direction, the tilt and the power are right.',
      klaar: 'Your panels are in',
      klaarTekst: 'The sun, the weather and the forecast take them into account.',
    },
    versie: { titel: (nummer: string) => `Version ${nummer}: what is new`, tekst: 'See what is better.', actie: 'Read' },
    mijlpaal: {
      titel: (n: number) => `${n} winter days watched`,
      nog: (n: number) => `${n} to go, then the house knows enough to run itself.`,
      genoeg: 'Enough to run itself. You choose when that starts.',
    },
    comfort: {
      gekozen: 'Chosen on a screen, until someone comes home or leaves.',
      niemand: 'Nobody is home.',
      thuis: (naam: string) => `${naam} is home.`,
      wissel: (hoofd: string, naam: string) => `${hoofd} has left; ${naam} is home.`,
      weer: (naam: string) => `${naam}’s comfort applies again`,
      nu: (naam: string) => `${naam}’s comfort applies now`,
      actie: 'Residents',
    },
    om: (tijd: string) => `At ${tijd}.`,
  },
} satisfies Record<Lang, unknown>;

type Nieuwe = Omit<Melding, 'sindsMs' | 'opgelostMs' | 'en'> & { sindsMs?: number };

/** Een melding in beide talen: de Nederlandse woorden zijn de melding, de Engelse gaan mee als `en`. */
function tweetalig(maak: (lang: Lang) => Nieuwe): Nieuwe & { en: MeldingWoorden } {
  const en = maak('en');
  return { ...maak('nl'), en: { titel: en.titel, tekst: en.tekst, ...(en.actie ? { actie: { label: en.actie.label } } : {}), ...(en.klaar ? { klaar: en.klaar } : {}) } };
}

/** De melding in een taal (besluit 185): de Engelse woorden als die er zijn, anders zoals hij is. */
export function inTaal(m: Melding, lang: Lang): Melding {
  const { en, ...rest } = m;
  if (lang !== 'en' || en == null) return rest;
  return {
    ...rest,
    titel: en.titel,
    tekst: en.tekst,
    ...(rest.actie ? { actie: { ...rest.actie, label: en.actie?.label ?? rest.actie.label } } : {}),
    ...(rest.klaar ? { klaar: en.klaar ?? rest.klaar } : {}),
  };
}
const kamerHref = (kamerId: string | null, id?: string) => (kamerId ? `kamer.html#${encodeURIComponent(kamerId)}${id ? `/${encodeURIComponent(id)}` : ''}` : 'thuis.html#batterijen');

/** Wat er nu speelt, uit de bron, in beide talen; zonder geheugen, dat doet de opslag. */
export function wat(bron: MeldingenBron): (Nieuwe & { en: MeldingWoorden })[] {
  const uit: (Nieuwe & { en: MeldingWoorden })[] = [];
  const nu = bron.nu;
  for (const d of bron.zonderRuimte) {
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang].nieuw;
      return { id: `nieuw:${d.id}`, soort: 'nieuw', aandacht: true, titel: w.titel(d.naam), tekst: w.tekst, actie: { label: w.actie, href: 'indeling.html' } };
    }));
  }
  for (const d of bron.volgen) {
    const sinds = d.onbereikbaarSindsMs;
    if (sinds == null || nu - sinds < STIL_NA_MS) continue;
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang];
      return {
        id: `stil:${d.id}`,
        soort: 'stil',
        aandacht: true,
        sindsMs: sinds,
        titel: w.stil.titel(d.naam),
        tekst: w.stil.tekst(duur(nu - sinds, lang), d.kamer),
        actie: { label: w.bekijk, href: kamerHref(d.kamerId, d.id) },
        klaar: { titel: w.stil.klaar(d.naam), tekst: w.stil.klaarTekst(duur(nu - sinds, lang)) },
      };
    }));
  }
  const drempels = bron.drempels ?? STANDAARD_DREMPELS;
  for (const b of bron.batterijen) {
    if (!onderDrempel(b.pct, drempels.batterij)) continue;
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang];
      return { id: `batterij:${b.id}`, soort: 'batterij', aandacht: true, titel: w.batterij.titel(b.naam), tekst: w.batterij.tekst(b.pct), actie: { label: w.bekijk, href: kamerHref(b.kamerId, `batterij-${b.id}`) }, klaar: { titel: w.batterij.klaar(b.naam), tekst: w.batterij.klaarTekst(drempels.batterij) } };
    }));
  }
  for (const f of bron.filters) {
    if (!onderDrempel(f.pct, drempels.filter)) continue;
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang];
      return { id: `filter:${f.id}`, soort: 'filter', aandacht: true, titel: w.filter.titel(f.naam), tekst: w.filter.tekst(f.pct), actie: { label: w.bekijk, href: kamerHref(f.kamerId) }, klaar: { titel: w.filter.klaar(f.naam), tekst: w.filter.klaarTekst } };
    }));
  }
  // Rook, koolmonoxide of hitte (21 oktober 2026): waar en wanneer; ook als het weer weg is, onder Eerder.
  for (const r of bron.rookmelders ?? []) {
    const gevaar = r.gevaar;
    if (gevaar) {
      const sinds = r.sindsMs ?? nu;
      uit.push(tweetalig((lang) => {
        const w = WOORDEN[lang];
        const wat = w.gevaar[gevaar];
        const kamer = inKamer(r.kamer, lang);
        return {
          id: `rook:${r.id}:${gevaar}`,
          soort: 'rook',
          aandacht: true,
          sindsMs: sinds,
          titel: w.rook.titel(wat, kamer),
          tekst: w.rook.tekst(wat, klok(sinds, lang)),
          actie: { label: w.bekijk, href: kamerHref(r.kamerId, r.id) },
          klaar: { titel: w.rook.klaar(wat, kamer), tekst: w.rook.klaarTekst(wat, klok(sinds, lang)) },
        };
      }));
    }
    if (r.batterijProbleem) {
      uit.push(tweetalig((lang) => {
        const w = WOORDEN[lang];
        return { id: `rook-batterij:${r.id}`, soort: 'batterij', aandacht: true, titel: w.rookBatterij.titel(r.naam), tekst: w.rookBatterij.tekst, actie: { label: w.bekijk, href: kamerHref(r.kamerId, r.id) }, klaar: { titel: w.rookBatterij.klaar(r.naam), tekst: w.rookBatterij.klaarTekst } };
      }));
    }
    // Vervangen: drie maanden van tevoren.
    const voor = r.vervangenVoor ? Date.parse(`${r.vervangenVoor}T12:00:00Z`) : NaN;
    if (Number.isFinite(voor) && voor - nu < 90 * 86_400_000) {
      uit.push(tweetalig((lang) => {
        const w = WOORDEN[lang];
        const datum = new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(voor);
        return { id: `rook-vervangen:${r.id}`, soort: 'rook', aandacht: true, titel: w.vervangen.titel(r.naam), tekst: w.vervangen.tekst(datum), actie: { label: w.bekijk, href: kamerHref(r.kamerId, r.id) }, klaar: { titel: w.vervangen.titel(r.naam), tekst: w.vervangen.klaarTekst } };
      }));
    }
  }
  // Een nieuwe versie (21 oktober 2026): een tik geeft wat er nieuw is en de knop Bijwerken.
  if (bron.update) {
    const u = bron.update;
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang].update;
      return { id: `update:${u.nieuw}`, soort: 'update', aandacht: true, titel: w.titel(u.nieuw), tekst: w.tekst(u.nu), klaar: { titel: w.klaar(u.nieuw), tekst: w.klaarTekst } };
    }));
  }
  for (const m of bron.meters) {
    const laatste = m.laatsteMs;
    if (laatste != null && nu - laatste < METER_STIL_NA_MS) continue;
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang].meter;
      const naam = lang === 'en' ? (m.naamEn ?? m.naam) : m.naam;
      return {
        id: `meter:${m.id}`,
        soort: 'meter',
        aandacht: true,
        ...(laatste != null ? { sindsMs: laatste } : {}),
        titel: w.titel(naam),
        tekst: `${laatste != null ? w.sinds(klok(laatste, lang)) : w.geen} ${w.waarom}`,
        klaar: { titel: w.klaar(naam), tekst: w.klaarTekst },
      };
    }));
  }
  if (bron.panelen?.voorstel) {
    uit.push(tweetalig((lang) => {
      const w = WOORDEN[lang];
      return { id: 'panelen:voorstel', soort: 'panelen', aandacht: true, titel: w.panelen.titel, tekst: w.panelen.tekst, actie: { label: w.bekijk, href: 'energie.html#panelen' }, klaar: { titel: w.panelen.klaar, tekst: w.panelen.klaarTekst } };
    }));
  }
  return uit;
}

export class MeldingenStore {
  readonly #path: string;
  #bestand: Bestand = { versie: 1, meldingen: [], negeer: [], laatsteVersie: null, mijlpalen: [] };
  #vies = false;

  constructor(options: { readonly logDir: string }) {
    this.#path = join(options.logDir, MELDINGEN_FILE);
  }

  async load(): Promise<void> {
    try {
      const b = JSON.parse(await readFile(this.#path, 'utf-8')) as Partial<Bestand>;
      if (b.versie === 1 && Array.isArray(b.meldingen)) {
        this.#bestand = { versie: 1, meldingen: b.meldingen, negeer: Array.isArray(b.negeer) ? b.negeer : [], laatsteVersie: b.laatsteVersie ?? null, mijlpalen: Array.isArray(b.mijlpalen) ? b.mijlpalen : [], laatsteComfort: typeof b.laatsteComfort === 'string' ? b.laatsteComfort : null };
      }
    } catch {
      // Nog geen bestand, of niet te lezen: dan begint de lijst leeg.
    }
  }

  /** Eén ronde: wat speelt erbij, wat is opgelost, en oude dingen weg. */
  bij(bron: MeldingenBron): void {
    const nu = bron.nu;
    const b = this.#bestand;
    const nuSpeelt = wat(bron);
    const ids = new Set(nuSpeelt.map((m) => m.id));
    const meldingen = [...b.meldingen];
    for (const m of nuSpeelt) {
      const i = meldingen.findIndex((x) => x.id === m.id && x.opgelostMs == null);
      if (i >= 0) {
        // Werk de tekst bij ("al 3 uur"), maar houd sinds wanneer.
        meldingen[i] = { ...m, sindsMs: meldingen[i]!.sindsMs, opgelostMs: null };
        continue;
      }
      // Hetzelfde kwam het afgelopen etmaal al eens terug: dat ene bericht weer openen.
      const j = meldingen.findIndex((x) => x.id === m.id && x.opgelostMs != null && nu - x.opgelostMs < 86_400_000);
      if (j >= 0) {
        meldingen[j] = { ...m, sindsMs: meldingen[j]!.sindsMs, opgelostMs: null };
        continue;
      }
      meldingen.push({ ...m, sindsMs: m.sindsMs ?? nu, opgelostMs: null });
    }
    for (let i = 0; i < meldingen.length; i++) {
      const m = meldingen[i]!;
      if (m.opgelostMs == null && m.aandacht && !ids.has(m.id)) meldingen[i] = { ...m, opgelostMs: nu };
    }
    // Een nieuwe versie, en een mijlpaal: ter informatie, één keer.
    let laatsteVersie = b.laatsteVersie;
    if (bron.versie && bron.versie.nummer !== laatsteVersie) {
      const v = bron.versie;
      if (laatsteVersie != null) {
        meldingen.push({
          ...tweetalig((lang) => {
            const w = WOORDEN[lang];
            const eerste = lang === 'en' ? v.eersteEn : v.eerste;
            return { id: `versie:${v.nummer}`, soort: 'versie', aandacht: false, titel: w.versie.titel(v.nummer), tekst: eerste || w.versie.tekst, actie: { label: w.versie.actie, href: 'toegang.html#versie' } };
          }),
          sindsMs: nu,
          opgelostMs: nu,
        });
      }
      laatsteVersie = bron.versie.nummer;
    }
    const mijlpalen = [...b.mijlpalen];
    for (const n of MIJLPALEN) {
      if (bron.winterdagen == null || bron.winterdagen < n || mijlpalen.includes(n)) continue;
      mijlpalen.push(n);
      meldingen.push({
        ...tweetalig((lang) => {
          const w = WOORDEN[lang];
          return { id: `mijlpaal:winter-${n}`, soort: 'mijlpaal', aandacht: false, titel: w.mijlpaal.titel(n), tekst: n < 30 ? w.mijlpaal.nog(30 - n) : w.mijlpaal.genoeg, actie: { label: w.bekijk, href: 'huis-kan.html' } };
        }),
        sindsMs: nu,
        opgelostMs: nu,
      });
    }
    // Wiens comfort er geldt (besluit 147): wisselt het, dan één keer ter informatie.
    let laatsteComfort = b.laatsteComfort ?? null;
    const c = bron.comfort;
    if (c && c.id !== laatsteComfort) {
      if (laatsteComfort != null) {
        meldingen.push({
          ...tweetalig((lang) => {
            const w = WOORDEN[lang].comfort;
            const tekst = c.waarom === 'gekozen' ? w.gekozen : c.waarom === 'niemand' ? w.niemand : c.hoofd ? w.thuis(c.naam) : w.wissel(c.hoofdNaam, c.naam);
            return { id: `comfort:${c.id}:${nu}`, soort: 'comfort', aandacht: false, titel: c.hoofd && c.waarom !== 'gekozen' ? w.weer(c.naam) : w.nu(c.naam), tekst, actie: { label: w.actie, href: 'bewoners.html' } };
          }),
          sindsMs: nu,
          opgelostMs: nu,
        });
      }
      laatsteComfort = c.id;
    }
    // Wat lang geleden opgelost is, gaat weg; zo blijft het bestand klein.
    const bewaar = meldingen.filter((m) => m.opgelostMs == null || nu - m.opgelostMs < EERDER_MS);
    const negeer = b.negeer.filter((id) => ids.has(id) || bewaar.some((m) => m.id === id));
    const nieuw: Bestand = { versie: 1, meldingen: bewaar, negeer, laatsteVersie, mijlpalen, laatsteComfort };
    if (JSON.stringify(nieuw) !== JSON.stringify(b)) {
      this.#bestand = nieuw;
      this.#vies = true;
    }
  }

  /** Wat de pagina laat zien: wat aandacht vraagt (na de wachttijd), en Eerder; in de taal van de app (besluit 185). */
  lijst(nu: number, lang: Lang = 'nl'): { actief: Melding[]; eerder: Melding[] } {
    const b = this.#bestand;
    const wacht = (m: Melding) => m.soort === 'nieuw' && nu - m.sindsMs < NIEUW_NA_MS;
    const actief = b.meldingen.filter((m) => m.opgelostMs == null && m.aandacht && !b.negeer.includes(m.id) && !wacht(m)).sort((x, y) => y.sindsMs - x.sindsMs).map((m) => inTaal(m, lang));
    const eerder = b.meldingen
      .filter((m) => m.opgelostMs != null && m.soort !== 'nieuw' && (m.klaar != null || !m.aandacht) && !b.negeer.includes(m.id))
      .sort((x, y) => (y.opgelostMs ?? 0) - (x.opgelostMs ?? 0))
      .slice(0, 10)
      .map((m) => inTaal(m, lang))
      .map((m) => (m.klaar ? { ...m, titel: m.klaar.titel, tekst: `${m.klaar.tekst} ${WOORDEN[lang].om(klok(m.opgelostMs!, lang))}` } : m));
    return { actief, eerder };
  }

  /** Niet meer laten zien, zoals een nieuw apparaat dat er niet toe doet. */
  negeer(id: unknown): boolean {
    if (typeof id !== 'string' || !this.#bestand.meldingen.some((m) => m.id === id && m.opgelostMs == null)) return false;
    if (!this.#bestand.negeer.includes(id)) {
      this.#bestand = { ...this.#bestand, negeer: [...this.#bestand.negeer, id] };
      this.#vies = true;
    }
    return true;
  }

  /**
   * Weghalen (besluit 136, aangevuld 15 oktober): wat nog speelt, laat de app
   * niet meer zien tot het voorbij is; wat al voorbij is, gaat uit de lijst.
   */
  verwijder(id: unknown): boolean {
    if (typeof id !== 'string') return false;
    if (this.#bestand.meldingen.some((m) => m.id === id && m.opgelostMs == null)) return this.negeer(id);
    const over = this.#bestand.meldingen.filter((m) => m.id !== id);
    if (over.length === this.#bestand.meldingen.length) return false;
    this.#bestand = { ...this.#bestand, meldingen: over };
    this.#vies = true;
    return true;
  }

  /**
   * Alles wissen (besluit 187): wat nog speelt, laat de app niet meer zien tot
   * het voorbij is, en wat al voorbij is gaat uit de lijst. Komt iets daarna
   * opnieuw, dan staat het er weer, zoals bij één melding weghalen.
   */
  verwijderAlles(): void {
    const b = this.#bestand;
    const spelen = b.meldingen.filter((m) => m.opgelostMs == null);
    const negeer = [...new Set([...b.negeer, ...spelen.map((m) => m.id)])];
    if (spelen.length === b.meldingen.length && negeer.length === b.negeer.length) return;
    this.#bestand = { ...b, meldingen: spelen, negeer };
    this.#vies = true;
  }

  /** Naar het bestand als er iets veranderde; eerst ernaast, dan omwisselen. */
  async bewaar(): Promise<void> {
    if (!this.#vies) return;
    this.#vies = false;
    const tmp = `${this.#path}.nieuw`;
    await writeFile(tmp, `${JSON.stringify(this.#bestand)}\n`, 'utf-8');
    await rename(tmp, this.#path);
  }
}
