/**
 * Het brein van de assistent (besluit 213): een gesprek in plaats van losse
 * zinnen.
 *
 * - **Gespreksgeheugen:** per scherm de laatste beurten, tien minuten lang. Het
 *   model ziet ze, zodat "en in de keuken ook" of "nog wat zachter" weet waar
 *   het over gaat.
 * - **Doe maar terug:** bij elke opdracht onthoudt de dienst hoe het was
 *   (`terugVan`), uit de stand van het huis vóór de opdracht. "Doe maar terug"
 *   stuurt dat door dezelfde deuren; daar is geen model voor nodig.
 * - **Meer in één zin:** "screens dicht en de lamp aan" leest de woordzoeker
 *   per deel (`herkenDelen`). Wat hij niet begrijpt, legt de dienst voor aan
 *   het model, met de situatie: hoe laat het is, hoe warm, wie er thuis is, wat
 *   er aan staat, het weer, vandaag en gisteren. Het model maakt een plan van
 *   hooguit vier stappen uit de lijst, of beantwoordt een vraag met alleen die
 *   feiten (`denk`). Elke stap gaat door dezelfde bouwers als de woordzoeker,
 *   en elk getal in een zin van het model moet een feit zijn (besluit 88).
 * - **Teller:** hoeveel vragen er per dag naar het model gaan en hoe snel het
 *   antwoordt (`Teller`), voor Functies › Praten.
 *
 * Het model raakt zelf niets aan: het kiest, de dienst toetst en de pagina
 * stuurt de opdracht naar de deur, zoals een knop.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiTaskField } from '../adapters/homeassistant/client.js';
import type { Fact, Lang, Question } from './assistant.js';
import type { Bedienbaar, BedienLamp, Herkend, Kaartje, Opdracht } from './opdracht.js';
import { herkenOpdracht } from './opdracht.js';
import { controleerZin, opdrachtKiezen, vanKeuze, type Kamerlijst, type Vraag } from './taalmodel.js';
import { gewoon } from './woordzoeker.js';
import type { TodayReport } from './today.js';
import type { SiteConfig } from '../core/model.js';

/* ------------------------------------------------------------ gespreksgeheugen */

/** Een opdracht voor een deur, zoals de pagina hem stuurt. */
export interface Stap {
  readonly pad: string;
  readonly body: Readonly<Record<string, unknown>>;
}

/** Eén keer heen en weer: wat de bewoner zei, wat het huis zei, en hoe het terug kan. */
export interface Beurt {
  readonly ms: number;
  readonly vraag: string;
  readonly antwoord: string;
  /** Hoe het was vóór de opdracht; null zonder opdracht of als het al terug is. */
  readonly terug: readonly Stap[] | null;
}

/** Zo lang onthoudt het huis een gesprek. */
export const GEHEUGEN_MS = 10 * 60_000;
/** Zoveel beurten per gesprek. */
const BEURTEN = 6;
/** Zoveel gesprekken tegelijk (schermen, telefoons). */
const GESPREKKEN = 50;

export class Gesprekken {
  readonly #map = new Map<string, Beurt[]>();
  readonly #nu: () => number;

  constructor(nu: () => number = Date.now) {
    this.#nu = nu;
  }

  /** De beurten van dit gesprek die nog meetellen, oudste eerst. */
  van(id: string): readonly Beurt[] {
    const lijst = this.#map.get(id);
    if (!lijst) return [];
    const vers = lijst.filter((b) => this.#nu() - b.ms < GEHEUGEN_MS);
    if (vers.length !== lijst.length) {
      if (vers.length) this.#map.set(id, vers);
      else this.#map.delete(id);
    }
    return vers;
  }

  voeg(id: string, beurt: Omit<Beurt, 'ms'>): void {
    const lijst = [...this.van(id), { ...beurt, ms: this.#nu() }].slice(-BEURTEN);
    this.#map.delete(id);
    this.#map.set(id, lijst);
    // De oudste gesprekken eraf.
    while (this.#map.size > GESPREKKEN) this.#map.delete(this.#map.keys().next().value!);
  }

  /** Wat terug kan: de laatste opdracht van dit gesprek, en die is daarna niet meer terug te draaien. */
  neemTerug(id: string): readonly Stap[] | null {
    const lijst = this.van(id);
    for (let i = lijst.length - 1; i >= 0; i--) {
      const b = lijst[i]!;
      if (b.terug?.length) {
        const uit = b.terug;
        this.#map.set(id, lijst.map((x, j) => (j === i ? { ...x, terug: null } : x)));
        return uit;
      }
    }
    return null;
  }
}

/** "Doe maar terug", "maak dat ongedaan", "zet het terug zoals het was". */
const TERUG = /^(?:(?:nee |oh |oeps |hmm )?(?:doe|draai|zet) (?:dat |het |alles )?(?:maar |toch |even )*(?:weer )?terug(?: zoals het was)?|(?:maak|zet) (?:dat |het )?(?:maar )?ongedaan|ongedaan maken|terugdraaien|terug zoals het was|zoals het was|undo(?: that| it)?|(?:put|change|turn|set) (?:it|that|everything) back(?: the way it was)?|go back)$/;

export function isTerug(ruw: string): boolean {
  return TERUG.test(gewoon(ruw));
}

/** Hoe een lamp nu staat, als opdracht om hem weer zo te zetten. */
function lampZoals(l: BedienLamp): Stap {
  if (!l.aan) return { pad: 'api/licht', body: { doel: 'lamp', id: l.id, aan: false } };
  return { pad: 'api/licht', body: { doel: 'lamp', id: l.id, aan: true, ...(l.dimbaar && l.helderheidPct != null ? { helderheidPct: Math.min(100, Math.max(1, Math.round(l.helderheidPct))) } : {}) } };
}

/**
 * Hoe het terug kan, uit de stand van het huis vóór de opdracht. Licht en
 * scènes: elke lamp zoals hij stond. Een scherm: naar zijn stand, of de andere
 * kant op als hij zijn stand niet meldt. Klimaat: de brug zet de knop terug.
 * Null als er niets terug kan (een stop).
 */
export function terugVan(stappen: readonly Stap[], b: Bedienbaar): Stap[] | null {
  const uit: Stap[] = [];
  const lampen = new Map<string, BedienLamp>();
  for (const s of stappen) {
    const body = s.body;
    if (s.pad === 'api/licht' || s.pad === 'api/scene') {
      const id = body['id'];
      const doel = s.pad === 'api/scene' ? 'scene' : body['doel'];
      const geraakt =
        doel === 'lamp' ? b.lampen.filter((l) => l.id === id)
        : doel === 'kamer' ? (b.kamers.find((k) => k.id === id)?.lampen ?? [])
        : doel === 'zone' ? (b.zones.find((z) => z.id === id)?.lampen ?? [])
        : doel === 'etage' ? b.kamers.filter((k) => k.etageId === id).flatMap((k) => k.lampen)
        : doel === 'huis' ? b.lampen
        // Een scène: de lampen van zijn kamer.
        : doel === 'scene' ? (b.kamers.find((k) => k.naam === b.scenes.find((x) => x.id === id)?.kamer)?.lampen ?? [])
        : [];
      for (const l of geraakt) lampen.set(l.id, l);
    } else if (s.pad === 'api/scherm') {
      const scherm = b.schermen.find((x) => x.id === body['id']);
      if (!scherm || body['actie'] === 'stop') continue;
      if (scherm.standKiezen && scherm.positiePct != null) uit.push({ pad: 'api/scherm', body: { id: scherm.id, actie: 'stand', standPct: Math.round(scherm.positiePct) } });
      else if (scherm.positiePct === 100 || scherm.positiePct === 0) uit.push({ pad: 'api/scherm', body: { id: scherm.id, actie: scherm.positiePct === 100 ? 'open' : 'dicht', standPct: null } });
      else if (body['actie'] === 'open' || body['actie'] === 'dicht') uit.push({ pad: 'api/scherm', body: { id: scherm.id, actie: body['actie'] === 'open' ? 'dicht' : 'open', standPct: null } });
    } else if (s.pad === 'api/klimaat') {
      if (!uit.some((x) => x.pad === 'api/klimaat')) uit.push({ pad: 'api/klimaat', body: { terug: true } });
    }
  }
  for (const l of lampen.values()) uit.push(lampZoals(l));
  return uit.length ? uit : null;
}

/** De stappen van een opdracht: de eerste en wat erachteraan gaat. */
export function stappenVan(o: Pick<Opdracht, 'pad' | 'body' | 'meer'>): Stap[] {
  return [{ pad: o.pad, body: o.body }, ...(o.meer ?? [])];
}

/* ------------------------------------------------------------ meer in één zin */

/** Waar een zin in delen uiteenvalt: "en", "en dan", een komma. */
const VOEG = /\s*(?:,|;|\ben (?:daarna|dan|ook)\b|\ben\b|\bdaarna\b|\band then\b|\band\b|\bthen\b)\s*/i;

/**
 * "Screens dicht en de lamp in de zithoek aan": elk deel apart, als de
 * woordzoeker álle delen als opdracht leest. Anders null: dan gaat de hele zin
 * de gewone weg (en zo nodig naar het model).
 */
export function herkenDelen(ruw: string, b: Bedienbaar, lang: Lang, laatsteScherm: string | null = null): Opdracht[] | null {
  const delen = ruw.split(VOEG).map((d) => d.trim()).filter((d) => d !== '');
  if (delen.length < 2 || delen.length > 4) return null;
  const uit: Opdracht[] = [];
  for (const deel of delen) {
    const h = herkenOpdracht(deel, b, lang, laatsteScherm);
    if (!h?.ok) return null;
    uit.push(h.opdracht);
  }
  return uit;
}

/** Een deel van een plan: wat het huis zegt, zijn feiten, de stappen en de kaartjes. */
export interface Deel {
  readonly antwoord: string;
  readonly feiten: readonly Fact[];
  readonly stappen: readonly Stap[];
  readonly gedaan: readonly Kaartje[] | readonly { readonly soort: string; readonly waarde: string; readonly uitleg: string }[];
  readonly ruimte?: string | null;
  readonly beweegt?: Opdracht['beweegt'];
  /** Wat erna kan, om op te tikken; alleen bij één opdracht. */
  readonly vervolg?: Opdracht['vervolg'];
}

export function deelVan(o: Opdracht): Deel {
  return { antwoord: o.antwoord, feiten: o.feiten, stappen: stappenVan(o), gedaan: o.gedaan, ruimte: o.ruimte, beweegt: o.beweegt, vervolg: o.vervolg };
}

/** Meer delen als één antwoord: de zinnen achter elkaar, de stappen achter elkaar. */
export function samen(delen: readonly Deel[]): Deel {
  return {
    antwoord: delen.map((d) => d.antwoord.replace(/ Zeg stop als het genoeg is\.| Say stop when it is enough\./, '')).join(' '),
    feiten: delen.flatMap((d) => d.feiten),
    stappen: delen.flatMap((d) => d.stappen),
    gedaan: delen.flatMap((d) => [...d.gedaan]),
    ruimte: delen.find((d) => d.ruimte)?.ruimte ?? null,
    beweegt: delen.length === 1 ? (delen[0]!.beweegt ?? null) : null,
    vervolg: delen.length === 1 ? (delen[0]!.vervolg ?? []) : [],
  };
}

/* ------------------------------------------------------------ denken */

/** Hoe het huis er nu voor staat, in zinnen met hun getallen. */
export interface Situatie {
  readonly regels: readonly string[];
  readonly feiten: readonly Fact[];
}

/** Een stap die het model koos en de dienst toetste. */
export type PlanStap =
  | { readonly soort: 'opdracht'; readonly herkend: Herkend }
  | { readonly soort: 'klimaat'; readonly wens: 'verwarmen' | 'koelen'; readonly kamer: string; readonly temperatuurC: number | null };

export type Plan =
  | { readonly soort: 'doen'; readonly stappen: readonly PlanStap[]; readonly zin: string | null }
  | { readonly soort: 'vraag'; readonly vraag: Question }
  | { readonly soort: 'antwoord'; readonly zin: string }
  | { readonly soort: 'niets' };

/**
 * Zo lang wacht het brein op een plan: langer dan voor eigen woorden, want het
 * plan is het antwoord. Flash-Lite deed er op 29 oktober 8 à 9 seconden over.
 */
export const DENK_MS = 10_000;
const MAX_STAPPEN = 4;

const VELDEN: Readonly<Record<string, AiTaskField>> = {
  soort: { description: 'doen, vraag, antwoord of niets', required: true },
  stappen: {
    description:
      'alleen bij doen: een JSON-lijst van 1 tot 4 stappen, elk {"soort": "licht|scene|scherm|klimaat", "id": "...", "actie": "...", "waarde": ""}; bij klimaat is id het id van de kamer, actie warmer of koeler en waarde de temperatuur of leeg',
  },
  vraag: { description: 'alleen bij vraag: een van de vaste vragen' },
  kamer: { description: 'alleen bij de vaste vraag waarom: het id van de kamer' },
  zin: { description: 'bij doen: één korte zin wat het huis doet; bij antwoord: het antwoord, hooguit drie zinnen' },
};

/** De opdracht aan het model: wie het is, wat het weet, wat er gezegd is, en wat het mag kiezen. */
export function opdrachtDenken(
  tekst: string,
  b: Bedienbaar,
  zones: readonly Kamerlijst[],
  situatie: Situatie,
  gesprek: readonly Beurt[],
  klimaat: readonly Kamerlijst[],
  lang: Lang,
): string {
  const nl = lang === 'nl';
  const regels: string[] = [
    'Je bent het brein van een huis dat praat met de bewoner. Kies wat het huis doet met wat de bewoner zei:',
    '- doen: een plan van 1 tot 4 stappen uit de lijsten onderaan, ook als de bewoner een gevoel of een bezigheid noemt ("het is hier zo donker en ik ga film kijken": screens dicht en het licht in de zithoek zachter). Alleen ids uit de lijsten. Klimaat: "warmer" of "koeler" voor een kamer uit de lijst klimaat.',
    '- vraag: een van de vaste vragen, als die het beste antwoord geeft.',
    '- antwoord: een vraag die je kunt beantwoorden met alleen de feiten bij "Hoe het huis ervoor staat" (zoals hoe warm het gisteren was). Neem elk getal precies over zoals het er staat, met de eenheid; geen getallen erbij, geen getallen in woorden, geen adviezen.',
    '- niets: als het er niet bij staat, gevaarlijk of onduidelijk is.',
    'Acties per soort, precies zo geschreven: licht: aan, uit, zachter, feller, helderheid (waarde 1 tot 100), warm, neutraal of koel. scherm: open, dicht, stop of stand (waarde 0 is open, 100 is dicht). scene: aan. klimaat: warmer of koeler.',
    `Zinnen: warm, kort, ${nl ? 'in gewoon Nederlands' : 'in plain English'}, in de ik-vorm, zonder opmaak of aanhalingstekens. Woorden als "die", "daar", "ook", "nog wat" en "weer" gaan over het gesprek tot nu.`,
    'Hoe het huis ervoor staat:',
    ...situatie.regels.map((r) => `- ${r}`),
  ];
  if (gesprek.length) {
    regels.push('Het gesprek tot nu:');
    for (const g of gesprek) regels.push(`- Bewoner: ${g.vraag}`, `  Huis: ${g.antwoord}`);
  }
  // De lijsten en de vaste vragen, zoals bij kiezen (besluit 148), zonder de eerste regels.
  regels.push(...opdrachtKiezen(tekst, b, zones).split('\n').slice(2));
  if (klimaat.length) regels.push(`Klimaat (soort klimaat, id is de kamer): ${klimaat.map((k) => `${k.id} (${k.naam})`).join(', ')}`);
  return regels.join('\n');
}

/** Woorden die het model voor een actie gebruikt, naar de actie die de bouwers kennen. */
const ACTIE: Readonly<Record<string, string>> = {
  sluiten: 'dicht', sluit: 'dicht', dichtdoen: 'dicht', omlaag: 'dicht', neer: 'dicht', close: 'dicht', closed: 'dicht', down: 'dicht',
  openen: 'open', opendoen: 'open', omhoog: 'open', up: 'open', 'open doen': 'open',
  aanzetten: 'aan', on: 'aan', uitzetten: 'uit', off: 'uit',
  dimmen: 'zachter', dim: 'zachter', dimmer: 'zachter', lager: 'zachter', fellerzetten: 'feller', brighter: 'feller', hoger: 'feller',
  stoppen: 'stop', positie: 'stand', helderheidpct: 'helderheid', brightness: 'helderheid',
};

/**
 * Een stap van het model in de woorden van de bouwers (29 oktober 2026): de
 * proef met Flash-Lite gaf "sluiten", "dimmen" en "30%". Dimmen met een getal
 * is een helderheid; een getal mag een procentteken hebben.
 */
function gewoneStap(x: Record<string, unknown>): Record<string, unknown> {
  const ruw = String(x['actie'] ?? '').trim().toLowerCase();
  const w = String(x['waarde'] ?? '').replace(/\s*%\s*$/, '').trim();
  let actie = ACTIE[ruw] ?? ruw;
  if (actie === 'zachter' && /^\d{1,3}$/.test(w)) actie = 'helderheid';
  return { ...x, soort: String(x['soort'] ?? '').trim().toLowerCase(), actie, waarde: w };
}

function leesJson(ruw: unknown): unknown {
  if (typeof ruw !== 'string') return ruw;
  try {
    return JSON.parse(ruw.replace(/^\s*```(?:json)?|```\s*$/g, '').trim());
  } catch {
    return null;
  }
}

/**
 * Toetst wat het model antwoordde. Elke stap door `vanKeuze` (alleen ids uit
 * de lijst), klimaat alleen voor een kamer uit de lijst; een zin alleen als
 * elk getal een feit is.
 */
export function vanPlan(
  ruw: unknown,
  b: Bedienbaar,
  zones: readonly Kamerlijst[],
  klimaat: readonly Kamerlijst[],
  situatie: Situatie,
  lang: Lang,
): Plan {
  const data = leesJson(ruw);
  if (typeof data !== 'object' || data == null || Array.isArray(data)) return { soort: 'niets' };
  const d = data as Record<string, unknown>;
  const soort = typeof d['soort'] === 'string' ? d['soort'].trim().toLowerCase() : '';
  const zinRuw = typeof d['zin'] === 'string' ? d['zin'] : null;
  if (soort === 'doen') {
    const lijst = leesJson(d['stappen']);
    if (!Array.isArray(lijst) || lijst.length === 0) return { soort: 'niets' };
    const stappen: PlanStap[] = [];
    for (const s of lijst.slice(0, MAX_STAPPEN)) {
      if (typeof s !== 'object' || s == null) continue;
      const x = s as Record<string, unknown>;
      if (String(x['soort'] ?? '').toLowerCase() === 'klimaat') {
        const kamer = String(x['id'] ?? x['kamer'] ?? '').trim();
        const actie = String(x['actie'] ?? '').trim().toLowerCase();
        const w = String(x['waarde'] ?? '').trim().replace(',', '.');
        const t = /^\d{2}(\.\d)?$/.test(w) ? Number(w) : null;
        if (!klimaat.some((k) => k.id === kamer) || (actie !== 'warmer' && actie !== 'koeler')) continue;
        if (t != null && (t < 10 || t > 30)) continue;
        stappen.push({ soort: 'klimaat', wens: actie === 'warmer' ? 'verwarmen' : 'koelen', kamer, temperatuurC: t });
        continue;
      }
      const k = vanKeuze(gewoneStap(x), b, zones, lang);
      if (k.soort === 'opdracht') stappen.push({ soort: 'opdracht', herkend: k.herkend });
    }
    return stappen.length ? { soort: 'doen', stappen, zin: zinRuw } : { soort: 'niets' };
  }
  if (soort === 'vraag') {
    const k = vanKeuze({ soort: 'vraag', actie: d['vraag'], kamer: d['kamer'] }, b, zones, lang);
    return k.soort === 'vraag' ? { soort: 'vraag', vraag: k.vraag } : { soort: 'niets' };
  }
  if (soort === 'antwoord') {
    const zin = controleerZin(zinRuw, { antwoord: situatie.regels.join(' '), feiten: situatie.feiten });
    return zin ? { soort: 'antwoord', zin } : { soort: 'niets' };
  }
  return { soort: 'niets' };
}

function opTijd<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, fout) => {
    const t = setTimeout(() => fout(new Error('het taalmodel deed er te lang over')), ms);
    t.unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        ok(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        fout(e as Error);
      },
    );
  });
}

/** Laat het model denken; bij twijfel, fout of wachten: niets, en dan zegt het huis wat het wel kan. */
export async function denk(
  vraagModel: Vraag,
  tekst: string,
  b: Bedienbaar,
  zones: readonly Kamerlijst[],
  situatie: Situatie,
  gesprek: readonly Beurt[],
  klimaat: readonly Kamerlijst[],
  lang: Lang,
  wachtMs = DENK_MS,
): Promise<Plan> {
  try {
    const ruw = await opTijd(vraagModel(opdrachtDenken(tekst, b, zones, situatie, gesprek, klimaat, lang), VELDEN), wachtMs);
    return vanPlan(ruw, b, zones, klimaat, situatie, lang);
  } catch {
    return { soort: 'niets' };
  }
}

/* ------------------------------------------------------------ de teller */

export interface Dagtelling {
  /** De dag in het huis, als 2026-10-29. */
  readonly dag: string;
  readonly vragen: number;
  readonly fouten: number;
  /** Opgeteld, voor het gemiddelde; alleen van de vragen die antwoordden. */
  readonly totaalMs: number;
  readonly langsteMs: number;
}

export const TELLER_BESTAND = 'taalmodel-teller.json';
/** Zoveel dagen bewaard. */
const DAGEN = 14;

/**
 * Hoeveel vragen er naar het model gaan en hoe snel het antwoordt (besluit
 * 213), per dag. Telt elke vraag die echt verstuurd wordt; tijdens een pauze
 * gaat er niets.
 */
export class Teller {
  #dagen: Dagtelling[] = [];
  #laden: Promise<void> | null = null;
  #bewaren: Promise<void> = Promise.resolve();
  readonly #map: string | null;
  readonly #dag: () => string;
  readonly #nu: () => number;

  constructor(o: { readonly map: string | null; readonly dag: () => string; readonly nu?: () => number }) {
    this.#map = o.map;
    this.#dag = o.dag;
    this.#nu = o.nu ?? Date.now;
  }

  /** Dezelfde vraag, maar geteld en gemeten. */
  om(vraag: Vraag): Vraag {
    return async (opdracht, velden) => {
      const t0 = this.#nu();
      try {
        const uit = await vraag(opdracht, velden);
        void this.#tel(this.#nu() - t0, false);
        return uit;
      } catch (e) {
        void this.#tel(null, true);
        throw e;
      }
    };
  }

  /** De dagen, nieuwste eerst. */
  async stand(): Promise<readonly Dagtelling[]> {
    await this.#laad();
    return [...this.#dagen].reverse();
  }

  /** De dag wordt meteen bepaald, niet pas na het laden: een vraag om middernacht telt bij de dag waarop hij kwam. */
  async #tel(ms: number | null, fout: boolean, dag = this.#dag()): Promise<void> {
    await this.#laad();
    const nu = this.#dagen.find((d) => d.dag === dag) ?? { dag, vragen: 0, fouten: 0, totaalMs: 0, langsteMs: 0 };
    this.#dagen = this.#dagen.filter((d) => d.dag !== dag);
    this.#dagen.push({
      dag,
      vragen: nu.vragen + 1,
      fouten: nu.fouten + (fout ? 1 : 0),
      totaalMs: nu.totaalMs + (ms ?? 0),
      langsteMs: Math.max(nu.langsteMs, ms ?? 0),
    });
    this.#dagen = this.#dagen.sort((a, b) => a.dag.localeCompare(b.dag)).slice(-DAGEN);
    this.#bewaren = this.#bewaren.then(() => this.#bewaar()).catch(() => undefined);
    await this.#bewaren;
  }

  /** Eén keer lezen; wie intussen telt, wacht op hetzelfde lezen. */
  #laad(): Promise<void> {
    this.#laden ??= this.#lees();
    return this.#laden;
  }

  async #lees(): Promise<void> {
    if (this.#map == null) return;
    try {
      const j: unknown = JSON.parse(await readFile(join(this.#map, TELLER_BESTAND), 'utf8'));
      const lijst = (j as { dagen?: unknown })?.dagen;
      if (Array.isArray(lijst)) {
        this.#dagen = lijst
          .filter(
            (d): d is Dagtelling =>
              typeof d === 'object' && d != null && typeof (d as Dagtelling).dag === 'string' && [(d as Dagtelling).vragen, (d as Dagtelling).fouten, (d as Dagtelling).totaalMs, (d as Dagtelling).langsteMs].every((n) => typeof n === 'number' && Number.isFinite(n)),
          )
          .slice(-DAGEN);
      }
    } catch {
      // Nog niets geteld.
    }
  }

  async #bewaar(): Promise<void> {
    if (this.#map == null) return;
    const pad = join(this.#map, TELLER_BESTAND);
    await writeFile(`${pad}.tmp`, `${JSON.stringify({ versie: 1, dagen: this.#dagen }, null, 2)}\n`);
    await rename(`${pad}.tmp`, pad);
  }
}

/* ------------------------------------------------------------ vandaag en gisteren */

/** "21,5" of "21.5", met hooguit één cijfer achter de komma. */
function getal1(n: number, lang: Lang): string {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return lang === 'nl' ? s.replace('.', ',') : s;
}

/** Uren en minuten: "4 uur en 15 minuten", of "45 minuten". */
function duur(ms: number, lang: Lang): string {
  const min = Math.round(ms / 60_000);
  const u = Math.floor(min / 60);
  const m = min % 60;
  if (lang === 'en') return u === 0 ? `${m} minutes` : m === 0 ? `${u} hours` : `${u} hours and ${m} minutes`;
  return u === 0 ? `${m} minuten` : m === 0 ? `${u} uur` : `${u} uur en ${m} minuten`;
}

/**
 * Een dag uit het logboek als zinnen met hun getallen (besluit 213): per
 * kamer de laagste en hoogste temperatuur, de zon, het net, en hoe lang elk
 * apparaat verwarmde of koelde. Voor vragen als "hoe warm was het gisteren?".
 */
export function dagRegels(r: TodayReport, config: SiteConfig, dag: 'vandaag' | 'gisteren', lang: Lang): Situatie {
  const nl = lang === 'nl';
  const label = nl ? (dag === 'vandaag' ? 'Vandaag tot nu' : 'Gisteren') : dag === 'vandaag' ? 'Today so far' : 'Yesterday';
  const regels: string[] = [];
  const feiten: Fact[] = [];
  const feit = (bron: string, tekst: string) => (feiten.push({ bron: `${dag}.${bron}`, tekst }), tekst);
  for (const z of r.zones) {
    const t = z.kwartieren.filter((x): x is number => x != null);
    if (!t.length) continue;
    const lo = feit(`${z.zoneId}.min`, `${getal1(Math.min(...t), lang)}°`);
    const hi = feit(`${z.zoneId}.max`, `${getal1(Math.max(...t), lang)}°`);
    regels.push(nl ? `${label} in ${z.naam}: van ${lo} tot ${hi}.` : `${label} in ${z.naam}: from ${lo} to ${hi}.`);
  }
  if (r.zonWh > 0 || r.netAfWh > 0 || r.netTerugWh > 0) {
    const zon = feit('zon', `${getal1(r.zonWh / 1000, lang)} kWh`);
    const af = feit('net', `${getal1(r.netAfWh / 1000, lang)} kWh`);
    const terug = feit('terug', `${getal1(r.netTerugWh / 1000, lang)} kWh`);
    regels.push(nl ? `${label} gaven de panelen ${zon}, kwam er ${af} van het net en ging er ${terug} terug.` : `${label} the panels gave ${zon}, ${af} came from the grid and ${terug} went back.`);
  }
  for (const a of r.apparaten) {
    const naam = config.actuators.find((x) => x.id === a.actuatorId)?.name ?? a.actuatorId;
    for (const actie of ['heat', 'cool'] as const) {
      const ms = a.huidig.filter((s) => s.actie === actie).reduce((n, s) => n + Math.max(0, s.totMs - s.vanMs), 0);
      if (ms < 60_000) continue;
      const hoe = feit(`${a.actuatorId}.${actie}`, duur(ms, lang));
      regels.push(nl ? `${label} ${actie === 'heat' ? 'verwarmde' : 'koelde'} ${naam} ${hoe}.` : `${label} ${naam} ${actie === 'heat' ? 'heated' : 'cooled'} for ${hoe}.`);
    }
  }
  return { regels, feiten };
}
