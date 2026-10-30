/**
 * Te doen (besluit 216, schets Wand-Te-doen en Tel-Te-doen; stap 5 van het
 * J.A.R.V.I.S.-plan): herinneringen, de lijsten van Home Assistant en de
 * agenda's Afval en Gezin.
 *
 * - **Herinneringen** bewaart de dienst zelf (`herinneringen.json`). Op het
 *   tijdstip gaat er een melding naar de telefoon van wie hem vroeg, en de
 *   wand laat het moment zien en zegt het hardop.
 * - **Lijsten** zijn die van Home Assistant (de Boodschappenlijst, To-do): de
 *   dienst leest ze, en zet er iets op of vinkt iets af door een smalle deur.
 * - **Agenda's** leest de dienst alleen: Afval en Gezin voor het huis, en per
 *   bewoner de agenda's die hij bij Jij koos.
 *
 * Dit bestand leest de zinnen ("herinner me om half negen aan de container",
 * "zet melk op de boodschappen") en rekent de tijden uit; de deuren en de
 * pagina's staan in de route.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Lang } from './assistant.js';
import { partsIn, zonedTime } from './today.js';

/* ------------------------------------------------------------ gewone tekst */

/** Kleine letters zonder accenten; cijfers, dubbele punten en spaties blijven. */
export function kaal(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/(\d)[.](\d{2})\b/g, '$1:$2')
    .replace(/[^a-z0-9:' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GETAL: Readonly<Record<string, number>> = {
  een: 1, 'één': 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
  dertien: 13, veertien: 14, vijftien: 15, twintig: 20, dertig: 30, veertig: 40, vijftig: 50,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
};
const UUR_WOORD = '(\\d{1,2}|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const getal = (w: string): number => (/^\d+$/.test(w) ? Number(w) : (GETAL[w] ?? NaN));
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/* ------------------------------------------------------------ een tijd lezen */

export interface Tijd {
  readonly ms: number;
  /** Wat er van de zin overblijft zonder de tijd: "aan de container". */
  readonly rest: string;
}

/**
 * Een tijd in gewone woorden: "om half negen", "om 20:00", "om acht uur
 * 's avonds", "over een kwartier", "morgen om 7 uur", "vanavond", "zaterdag
 * om 10". Een uur zonder ochtend of avond is het eerstvolgende: om acht uur,
 * 's avonds om half acht, is morgenochtend. Null zonder tijd.
 */
export function leesTijd(tekst: string, nuMs: number, tz: string): Tijd | null {
  let t = ` ${kaal(tekst)} `;
  const weg = (re: RegExp | string) => (t = t.replace(re, ' '));
  // Over een tijd: minuten, een kwartier, een (half) uur.
  const over = /\b(?:over|in) (?:een |1 )?(?:(half|anderhalf) )?(?:(\d{1,3}|een|twee|drie|vier|vijf|tien|twintig|dertig|vijftien|veertig|vijftig) )?(minuut|minuten|min|kwartier|uur|uren|minute|minutes|hour|hours)\b/.exec(t);
  if (over) {
    const n = over[2] ? getal(over[2]) : 1;
    const eenheid = over[3]!;
    let minuten = /kwartier/.test(eenheid) ? 15 * n : /uur|uren|hour/.test(eenheid) ? 60 * n : n;
    if (over[1] === 'half' && /uur|hour/.test(eenheid)) minuten = 30;
    if (over[1] === 'anderhalf') minuten = 90;
    if (!Number.isFinite(minuten) || minuten <= 0 || minuten > 7 * 24 * 60) return null;
    t = t.replace(over[0], ' ');
    return { ms: nuMs + minuten * 60_000, rest: t.replace(/\s+/g, ' ').trim() };
  }
  // De dag.
  const nu = partsIn(nuMs, tz);
  const vandaag = new Date(Date.UTC(nu.y, nu.m - 1, nu.d)).getUTCDay();
  let dag = 0;
  let dagGenoemd = false;
  if (/\bovermorgen\b/.test(t)) (dag = 2), (dagGenoemd = true), weg(/\bovermorgen\b/);
  else if (/\b(morgen|tomorrow)\b/.test(t) && !/\bmorgen ?ochtend\b/.test(t)) (dag = 1), (dagGenoemd = true), weg(/\b(morgen|tomorrow)\b/);
  else if (/\bmorgen ?ochtend\b/.test(t)) (dag = 1), (dagGenoemd = true);
  for (const [i, naam] of [...DAGEN, ...DAYS].entries()) {
    const re = new RegExp(`\\b(?:op |on )?${naam}\\b`);
    if (re.test(t)) {
      const w = i % 7;
      dag = (w - vandaag + 7) % 7 || 7;
      dagGenoemd = true;
      weg(re);
    }
  }
  // Ochtend of avond.
  const avond = /\b(vanavond|'s avonds|s avonds|avond|tonight|in the evening|pm|vannacht)\b/.test(t);
  const middag = /\b(vanmiddag|'s middags|s middags|middag|afternoon)\b/.test(t);
  const ochtend = /\b(vanochtend|vanmorgen|'s ochtends|s ochtends|'s morgens|s morgens|ochtend|morgenochtend|morning|am)\b/.test(t);
  weg(/\b(vanavond|'s avonds|s avonds|tonight|in the evening|vanmiddag|'s middags|s middags|vanochtend|vanmorgen|'s ochtends|s ochtends|'s morgens|s morgens|morgenochtend|morgen ochtend|in the morning|pm|am|vannacht)\b/g);
  // Het uur.
  let h: number | null = null;
  let mi = 0;
  let m: RegExpExecArray | null;
  if ((m = /\b(?:om |at )?(\d{1,2}):(\d{2})(?: uur)?\b/.exec(t))) (h = Number(m[1])), (mi = Number(m[2])), weg(m[0]);
  else if ((m = new RegExp(`\\b(?:om )?half ${UUR_WOORD}\\b`).exec(t))) (h = getal(m[1]!) - 1), (mi = 30), weg(m[0]);
  else if ((m = new RegExp(`\\b(?:om )?kwart (over|voor) ${UUR_WOORD}\\b`).exec(t))) (h = getal(m[2]!) - (m[1] === 'voor' ? 1 : 0)), (mi = m[1] === 'voor' ? 45 : 15), weg(m[0]);
  else if ((m = new RegExp(`\\b(?:om|at) ${UUR_WOORD}(?: uur| o'?clock)?(?: (\\d{1,2}))?\\b`).exec(t))) (h = getal(m[1]!)), (mi = m[2] ? Number(m[2]) : 0), weg(m[0]);
  else if ((m = new RegExp(`\\b${UUR_WOORD} uur\\b`).exec(t))) (h = getal(m[1]!)), weg(m[0]);
  if (h != null && (!Number.isFinite(h) || h < 0 || h > 23 || mi > 59)) return null;
  // Zonder uur: alleen met een dagdeel of een dag ("vanavond", "morgen").
  if (h == null) {
    if (avond) h = 20;
    else if (middag) h = 14;
    else if (ochtend || dagGenoemd) h = 9;
    else return null;
  } else if (h <= 12) {
    if ((avond || middag) && h < 12) h += 12;
    else if (!ochtend && !dagGenoemd && h < 12) {
      // Het eerstvolgende: acht uur is vanavond als het vanochtend al voorbij is.
      const vroeg = zonedTime(nu.y, nu.m, nu.d, h, mi, tz);
      const laat = zonedTime(nu.y, nu.m, nu.d, h + 12, mi, tz);
      if (vroeg <= nuMs && laat > nuMs && h >= 1) h += 12;
    }
  }
  let ms = zonedTime(nu.y, nu.m, nu.d + dag, h, mi, tz);
  // Al voorbij en geen dag genoemd: morgen.
  if (ms <= nuMs && !dagGenoemd) ms = zonedTime(nu.y, nu.m, nu.d + 1, h, mi, tz);
  return { ms, rest: t.replace(/\s+/g, ' ').trim() };
}

/* ------------------------------------------------------------ de zinnen */

const HERINNER = /^(?:(?:kun|kan|wil) je (?:me |mij |ons )?(?:even |eraan )?(?:herinneren|waarschuwen)|herinner (?:me|mij|ons)(?: even| eraan)?|zet (?:een|n) herinnering|maak (?:een|n) herinnering|herinnering|remind (?:me|us))\b\s*/;

/** Het begin van een zin dat een herinnering vraagt, zonder tijd ("herinner me aan de container"). */
export function isHerinnering(ruw: string): boolean {
  return HERINNER.test(kaal(ruw));
}

export type Herinnerzin =
  | { readonly soort: 'herinner'; readonly tekst: string; readonly ms: number }
  | { readonly soort: 'hoelaat'; readonly tekst: string };

/** Hoofdletter aan het begin. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Herinner me om half negen aan de container" wordt "De container" om
 * 20:30. Zonder tijd: wat er moet gebeuren, en dan vraagt het huis hoe laat.
 * Null als het geen herinnering is.
 */
export function leesHerinnering(ruw: string, nuMs: number, tz: string): Herinnerzin | null {
  // "Kun je me over een kwartier herinneren aan de oven": het werkwoord achteraan.
  const k = kaal(ruw).replace(/^(?:kun|kan|wil) je (?:me|mij|ons) (?!herinneren|waarschuwen)(.+?) (?:herinneren|waarschuwen)\b/, 'herinner me $1');
  const m = HERINNER.exec(k);
  if (!m) return null;
  const zin = k.slice(m[0].length);
  const tijd = leesTijd(zin, nuMs, tz);
  const rest = (tijd ? tijd.rest : zin)
    .replace(/^(?:eraan |er aan )/, '')
    .replace(/^(?:aan|dat|om|to|about|that)\b\s*/, '')
    .replace(/\s+(?:te herinneren|herinneren)$/, '')
    .trim();
  if (rest === '' || rest.length > 120) return tijd ? null : null;
  const tekst = cap(rest);
  return tijd ? { soort: 'herinner', tekst, ms: tijd.ms } : { soort: 'hoelaat', tekst };
}

export type LijstSoort = 'boodschappen' | 'todo';

const LIJST_WOORD = '(boodschappen(?:lijst(?:je)?)?|boodschappenlijst(?:je)?|shopping ?list|to ?do(?: ?lijst(?:je)?)?|todo(?: ?lijst)?|takenlijst|takenlijstje|lijst(?:je)?|list)';
const lijstSoort = (w: string): LijstSoort => (/boodschap|shopping/.test(w) ? 'boodschappen' : /to ?do|taken/.test(w) ? 'todo' : 'boodschappen');
/** Lidwoorden en "nog" voor een ding: "de melk" is melk. */
const ding = (s: string) => cap(s.replace(/^(?:nog |ook |even )*(?:de |het |een |wat |some |the |a )?/, '').trim());

/**
 * "Zet melk op de boodschappen", "melk op de boodschappenlijst", "we hebben
 * geen melk meer", "zet de dakgoot op de to-do". Null als het dat niet is.
 */
export function leesLijstZin(ruw: string): { readonly lijst: LijstSoort; readonly item: string } | null {
  const k = kaal(ruw).replace(/^(?:kun je |kan je |wil je )/, '');
  // Een vraag zet niets op een lijst: "wat staat er op de boodschappenlijst".
  if (/^(?:wat|welke|hoe|wie|wanneer|staat|staan|is|zijn|what|which|how|who|is|are)\b/.test(k)) return null;
  let m =new RegExp(`^(?:zet|doe|schrijf|voeg|add|put)\\s+(.+?)\\s+(?:op|bij|aan|on|to)\\s+(?:de |het |mijn |onze |the |my )?${LIJST_WOORD}(?: toe| erbij)?$`).exec(k);
  if (!m) m = new RegExp(`^(.+?)\\s+(?:moet |mag )?(?:op|bij)\\s+(?:de |het |mijn |onze )?${LIJST_WOORD}(?: zetten| erbij)?$`).exec(k);
  if (m) {
    const item = ding(m[1]!);
    return item.length >= 2 && item.length <= 80 && !/^(het|dat|dit|die|iets|it|that)$/i.test(item) ? { lijst: lijstSoort(m[2]!), item } : null;
  }
  const geen = /^(?:we hebben|wij hebben|er is|er zijn|ik heb) geen (.+?) meer$/.exec(k) ?? /^(?:we are|we're) out of (.+)$/.exec(k);
  if (geen) {
    const item = ding(geen[1]!);
    return item.length >= 2 && item.length <= 80 ? { lijst: 'boodschappen', item } : null;
  }
  return null;
}

export type TeDoenVraag = 'boodschappen' | 'todo' | 'afval' | 'vandaag' | 'morgen' | 'week';

/**
 * Een vraag over te doen: wat er op de boodschappen staat, wat ik nog moet
 * doen, wanneer het afval komt, wat er morgen of deze week is. Null anders.
 */
export function leesTeDoenVraag(ruw: string): TeDoenVraag | null {
  const k = kaal(ruw);
  if (/\b(afval|container|kliko|vuilnis|vuilnisbak|gft|pmd|papier|oud papier|restafval|plastic|bins?|garbage|trash)\b/.test(k) && /\b(wanneer|welke|wat|komt|komen|moet|buiten|morgen|when|which)\b/.test(k)) return 'afval';
  if (/\b(boodschappen|boodschappenlijst|shopping)\b/.test(k) && /\b(wat|staat|staan|welke|lees|what)\b/.test(k)) return 'boodschappen';
  if (/\bwat moeten we (?:nog )?halen\b|\bwat moet ik (?:nog )?halen\b/.test(k)) return 'boodschappen';
  if (/\b(wat moet ik (?:nog )?doen|wat moeten we (?:nog )?doen|te doen|to ?do|takenlijst|what do i (?:still )?(?:need|have) to do)\b/.test(k) && /\b(wat|staat|what|lees)\b/.test(k)) return 'todo';
  if (/\bwat (?:staat|is|hebben we|heb ik|gebeurt) (?:er )?(?:op de agenda |allemaal )?(morgen|vandaag|deze week|overmorgen)\b/.test(k) || /\bwhat(?:'s| is) (?:on )?(?:the agenda )?(tomorrow|today|this week)\b/.test(k)) {
    if (/\b(morgen|overmorgen|tomorrow)\b/.test(k)) return 'morgen';
    if (/\b(deze week|this week)\b/.test(k)) return 'week';
    return 'vandaag';
  }
  return null;
}

/** "Gedaan", "klaar", "is gebeurd": de herinnering die nu speelt is klaar. */
export function isGedaan(ruw: string): boolean {
  return /^(?:ok(?:e|ay)? )?(?:gedaan|klaar|is gedaan|is gebeurd|al gedaan|heb ik gedaan|done|it'?s done)$/.test(kaal(ruw));
}

/** "Straks", "later", "over tien minuten": de herinnering die nu speelt komt terug, na zoveel minuten. */
export function leesLater(ruw: string): number | null {
  const k = kaal(ruw);
  if (/^(?:straks|later|zo|zometeen|zo meteen|nog even niet|later please|snooze)$/.test(k)) return 10;
  const m = /^(?:over|in) (?:een |1 )?(?:(\d{1,3}|tien|twintig|vijf|dertig|vijftien|een|twee) )?(minuten|minuut|kwartier|uur|minutes|hour)$/.exec(k);
  if (!m) return null;
  const n = m[1] ? getal(m[1]) : 1;
  const min = /kwartier/.test(m[2]!) ? 15 * n : /uur|hour/.test(m[2]!) ? 60 * n : n;
  return Number.isFinite(min) && min > 0 && min <= 24 * 60 ? min : null;
}

/* ------------------------------------------------------------ afval */

export type AfvalSoort = 'gft' | 'pmd' | 'papier' | 'rest' | 'glas' | 'textiel' | 'anders';

/** De soort uit de naam in de agenda: "GFT", "Restafval", "Oud papier", "Plastic". */
export function afvalSoort(naam: string): AfvalSoort {
  const k = kaal(naam);
  if (/\bgft\b|groen|tuin|bio/.test(k)) return 'gft';
  if (/\bpmd\b|plastic|pbd|blik|drinkpak/.test(k)) return 'pmd';
  if (/papier|karton|paper/.test(k)) return 'papier';
  if (/rest|grijs/.test(k)) return 'rest';
  if (/glas/.test(k)) return 'glas';
  if (/textiel|kleding/.test(k)) return 'textiel';
  return 'anders';
}

/** Hoe je de bak herkent, in gewone woorden. */
export function afvalBak(s: AfvalSoort, lang: Lang): string {
  const nl = lang === 'nl';
  return {
    gft: nl ? 'de groene bak' : 'the green bin',
    pmd: nl ? 'het plastic' : 'the plastic',
    papier: nl ? 'het oud papier' : 'the paper',
    rest: nl ? 'de grijze bak' : 'the grey bin',
    glas: nl ? 'het glas' : 'the glass',
    textiel: nl ? 'het textiel' : 'the textiles',
    anders: nl ? 'het afval' : 'the waste',
  }[s];
}

/* ------------------------------------------------------------ agenda's */

/** Een afspraak uit een agenda van Home Assistant, met waar hij vandaan komt. */
export interface Afspraak {
  readonly startMs: number;
  /** Een hele dag, zoals het afval: zonder tijd. */
  readonly heleDag: boolean;
  readonly tekst: string;
  readonly bron: 'afval' | 'gezin' | 'eigen';
  readonly agenda: string;
}

/** Wat `calendar.get_events` teruggeeft, als afspraken. */
export function leesAfspraken(antwoord: unknown, bronVan: (agenda: string) => Afspraak['bron'], tz: string): Afspraak[] {
  if (typeof antwoord !== 'object' || antwoord == null) return [];
  const uit: Afspraak[] = [];
  for (const [agenda, v] of Object.entries(antwoord as Record<string, unknown>)) {
    const events = (v as { events?: unknown })?.events;
    if (!Array.isArray(events)) continue;
    for (const e of events) {
      const start = typeof e?.start === 'string' ? e.start : null;
      const tekst = typeof e?.summary === 'string' ? e.summary.trim().slice(0, 120) : '';
      if (!start || !tekst) continue;
      const heleDag = /^\d{4}-\d{2}-\d{2}$/.test(start);
      const [y, mo, d] = start.slice(0, 10).split('-').map(Number);
      const startMs = heleDag ? zonedTime(y!, mo!, d!, 0, 0, tz) : Date.parse(start);
      if (!Number.isFinite(startMs)) continue;
      uit.push({ startMs, heleDag, tekst, bron: bronVan(agenda), agenda });
    }
  }
  return uit.sort((a, b) => a.startMs - b.startMs);
}

/** Een lijst van Home Assistant, zoals `todo.get_items` hem teruggeeft. */
export interface LijstItem {
  readonly uid: string | null;
  readonly tekst: string;
  readonly klaar: boolean;
}

export function leesLijst(antwoord: unknown, id: string): LijstItem[] {
  const items = (antwoord as Record<string, { items?: unknown }> | null)?.[id]?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((x) => typeof x?.summary === 'string' && x.summary.trim() !== '')
    .map((x) => ({ uid: typeof x.uid === 'string' ? x.uid : null, tekst: String(x.summary).trim().slice(0, 120), klaar: x.status === 'completed' }));
}

/* ------------------------------------------------------------ herinneringen */

export interface Herinnering {
  readonly id: string;
  readonly tekst: string;
  /** Wanneer, in ms. */
  readonly ms: number;
  /** Het account van wie hem vroeg, of null: het hele huis (alleen de wand). */
  readonly voor: string | null;
  readonly naam: string | null;
  /** Wacht, speelt nu (de wand toont hem), of is klaar. */
  readonly status: 'wacht' | 'nu' | 'klaar';
  readonly gemaakt: number;
  /** Wanneer hij begon te spelen, voor het opruimen. */
  readonly sindsMs?: number;
}

export const HERINNERINGEN_BESTAND = 'herinneringen.json';
/** Zolang speelt een herinnering op de wand voordat hij vanzelf klaar is. */
export const SPEELT_MS = 2 * 3_600_000;
/** Zolang blijft een klare herinnering bewaard. */
const KLAAR_MS = 24 * 3_600_000;
const MAX = 200;

export class Herinneringen {
  #lijst: Herinnering[] = [];
  #laden: Promise<void> | null = null;
  #bewaren: Promise<void> = Promise.resolve();
  readonly #map: string | null;
  readonly #nu: () => number;

  constructor(o: { readonly map: string | null; readonly nu?: () => number }) {
    this.#map = o.map;
    this.#nu = o.nu ?? Date.now;
  }

  async lijst(): Promise<readonly Herinnering[]> {
    await this.#laad();
    return [...this.#lijst].sort((a, b) => a.ms - b.ms);
  }

  async voeg(h: { readonly tekst: string; readonly ms: number; readonly voor: string | null; readonly naam: string | null }): Promise<Herinnering> {
    await this.#laad();
    const nieuw: Herinnering = { id: `h${this.#nu().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tekst: h.tekst.slice(0, 120), ms: h.ms, voor: h.voor, naam: h.naam, status: 'wacht', gemaakt: this.#nu() };
    this.#lijst = [...this.#lijst, nieuw].slice(-MAX);
    await this.#bewaar();
    return nieuw;
  }

  async klaar(id: string): Promise<boolean> {
    return this.#zet(id, (h) => ({ ...h, status: 'klaar', sindsMs: this.#nu() }));
  }

  /** Later nog eens: over zoveel minuten weer. */
  async later(id: string, minuten: number): Promise<boolean> {
    return this.#zet(id, (h) => ({ ...h, status: 'wacht', ms: this.#nu() + minuten * 60_000 }));
  }

  /** De herinnering die nu speelt voor dit account (of het huis), de nieuwste eerst; null zonder. */
  async speelt(): Promise<readonly Herinnering[]> {
    await this.#laad();
    return this.#lijst.filter((h) => h.status === 'nu').sort((a, b) => b.ms - a.ms);
  }

  /**
   * Elke ronde: wat aan de beurt is, gaat spelen (en komt terug, om te
   * melden); wat te lang speelde of al een dag klaar is, gaat weg.
   */
  async ronde(): Promise<Herinnering[]> {
    await this.#laad();
    const nu = this.#nu();
    const nieuw: Herinnering[] = [];
    let anders = false;
    this.#lijst = this.#lijst.flatMap((h) => {
      if (h.status === 'wacht' && h.ms <= nu) {
        const s = { ...h, status: 'nu' as const, sindsMs: nu };
        nieuw.push(s);
        anders = true;
        return [s];
      }
      if (h.status === 'nu' && nu - (h.sindsMs ?? h.ms) > SPEELT_MS) {
        anders = true;
        return [{ ...h, status: 'klaar' as const, sindsMs: nu }];
      }
      if (h.status === 'klaar' && nu - (h.sindsMs ?? h.ms) > KLAAR_MS) {
        anders = true;
        return [];
      }
      return [h];
    });
    if (anders) await this.#bewaar();
    return nieuw;
  }

  async #zet(id: string, f: (h: Herinnering) => Herinnering): Promise<boolean> {
    await this.#laad();
    const i = this.#lijst.findIndex((h) => h.id === id);
    if (i < 0) return false;
    this.#lijst = this.#lijst.map((h, j) => (j === i ? f(h) : h));
    await this.#bewaar();
    return true;
  }

  #laad(): Promise<void> {
    this.#laden ??= this.#lees();
    return this.#laden;
  }

  async #lees(): Promise<void> {
    if (this.#map == null) return;
    try {
      const j: unknown = JSON.parse(await readFile(join(this.#map, HERINNERINGEN_BESTAND), 'utf8'));
      const lijst = (j as { herinneringen?: unknown })?.herinneringen;
      if (Array.isArray(lijst)) {
        this.#lijst = lijst.filter(
          (h): h is Herinnering =>
            typeof h === 'object' && h != null && typeof (h as Herinnering).id === 'string' && typeof (h as Herinnering).tekst === 'string' && Number.isFinite((h as Herinnering).ms) && ['wacht', 'nu', 'klaar'].includes((h as Herinnering).status),
        );
      }
    } catch {
      // Nog niets bewaard.
    }
  }

  async #bewaar(): Promise<void> {
    if (this.#map == null) return;
    const pad = join(this.#map, HERINNERINGEN_BESTAND);
    const inhoud = `${JSON.stringify({ versie: 1, herinneringen: this.#lijst }, null, 2)}\n`;
    this.#bewaren = this.#bewaren.then(async () => {
      await writeFile(`${pad}.tmp`, inhoud);
      await rename(`${pad}.tmp`, pad);
    });
    await this.#bewaren;
  }
}
