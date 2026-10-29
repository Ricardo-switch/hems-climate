/**
 * De assistent die uitlegt (ONTWERP §7, fase 1).
 *
 * Een vaste set vragen met antwoorden die een sjabloon zijn over het laatste
 * besluit. Geen taalmodel: wat hier staat is altijd waar, want elk getal in een
 * antwoord komt uit het besluit, de configuratie, het dagoverzicht of de vraag
 * zelf, en staat met zijn bron in `feiten` (besluit 88). Een test bewijst dat er
 * geen ander getal in de tekst staat.
 *
 * Leest alleen. Ook "zet de zolder op 21" verandert niets: tijdens de schaduw
 * zegt de assistent wat hij zou doen, en dat hij nog niet mag schakelen.
 *
 * Het eerste stuk van het bewonerscontract (besluit 76): de uitleg per kamer
 * wordt hier uitgerekend en getest, niet in een pagina. De teksten staan op
 * één plek, in het Nederlands en het Engels (besluit 86).
 */

import type { Command, Intent, RejectedIntent } from '../core/decision.js';
import type { SluipRapport } from './sluipverbruik.js';
import type { Explanation, ReasonCode, BlockCode } from '../core/decision.js';
import { actuatorsOf, isHandsOff } from '../core/model.js';
import type { Actuator, Mode, SiteConfig, Zone } from '../core/model.js';
import type { TodayReport } from './today.js';
import { startOfLocalDay } from './today.js';
import { KAMERWOORDEN, lidwoordVan, metLidwoord } from './kamerwoorden.js';

/** Wat de assistent van een besluit nodig heeft; `LiveSnapshot` voldoet. */
export interface DecisionView {
  readonly atMs: number;
  readonly explanation: Explanation;
  readonly commands: readonly Command[];
  readonly accepted: readonly Intent[];
  readonly rejected: readonly RejectedIntent[];
  /** Wat de apparaten werkelijk deden, als `cool@22`, op actuator-id. */
  readonly observed: Readonly<Record<string, string>>;
  /** Wat een apparaat zegt dat het nu doet (`hvac_action`), als het dat zegt. */
  readonly observedAction?: Readonly<Record<string, string>>;
  /**
   * Waar de zon staat (25 oktober 2026): op, nog niet op, of vandaag niet meer
   * genoeg ('s middags lager dan 10°). Zonder ligging weg: dan zoals het was.
   */
  readonly zonNu?: ZonNu;
}

export type ZonNu = 'op' | 'nog' | 'weg';
/** Waar de zon nu staat, uit de hoogte en de richting: voor de middag nog, erna weg als hij laag is. */
export function zonNuVan(elevationDeg: number, azimuthDeg: number): ZonNu {
  const middag = azimuthDeg > 180;
  if (middag && elevationDeg < 10) return 'weg';
  if (!middag && elevationDeg < 3) return 'nog';
  return 'op';
}

export const LANGS = ['nl', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const QUESTION_KINDS = ['nu', 'waarom', 'straks', 'zon', 'doe', 'vandaag', 'warm', 'weer', 'morgen', 'kosten', 'sluip', 'thuis', 'terug', 'draait'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** `aan` zonder meer (29 oktober 2026): koelen of verwarmen, naar wat de kamer nodig heeft. */
export type Wish = 'koelen' | 'verwarmen' | 'drogen' | 'uit' | 'aan';

export type Question =
  | { readonly kind: 'nu' }
  | { readonly kind: 'waarom'; readonly kamer: string }
  | { readonly kind: 'straks' }
  | { readonly kind: 'zon' }
  /** Wat het huis vandaag deed (besluit 141). */
  | { readonly kind: 'vandaag' }
  /** Hoe warm het overal is (besluit 141). */
  | { readonly kind: 'warm' }
  /** Het weer en de zon van vandaag (besluit 166). */
  | { readonly kind: 'weer' }
  /** Het weer en de zon van morgen (besluit 142). */
  | { readonly kind: 'morgen' }
  /** Wat de apparaten met een meter deze maand kostten (besluit 142). */
  | { readonly kind: 'kosten' }
  /** Het sluipverbruik: wat het huis 's nachts gebruikt (besluit 192). */
  | { readonly kind: 'sluip' }
  /** Of er iemand thuis is, wat er terugging naar het net, en of een apparaat draait (29 oktober 2026). */
  | { readonly kind: 'thuis' }
  | { readonly kind: 'terug' }
  | { readonly kind: 'draait'; readonly apparaat: string }
  | {
      readonly kind: 'doe';
      /** Leeg als er geen kamer in de vraag stond ("zet de airco aan"). */
      readonly kamer: string;
      readonly wens: Wish;
      readonly temperatuurC: number | null;
    };

/** Een getal in het antwoord, precies zoals het er staat, met waar het vandaan komt. */
export interface Fact {
  readonly bron: string;
  readonly tekst: string;
}

export interface Answer {
  readonly vraag: QuestionKind;
  readonly taal: Lang;
  /** De kamer waar het over ging, als zone-id, of null. */
  readonly kamer: string | null;
  readonly antwoord: string;
  readonly feiten: readonly Fact[];
  /**
   * Zo zeggen, niet in eigen woorden (29 oktober 2026): een kamer die er niet
   * is of nog geen besluit. Het model zette er een sfeerzinnetje achter, zoals
   * "Laten we het gezellig houden in huis".
   */
  readonly letterlijk?: true;
  /** Een vraag terug met keuzes om op te tikken of te zeggen (besluit 209). */
  readonly keuze?: readonly { readonly label: string; readonly tekst: string }[];
  /** Een opdracht voor een deur (besluit 210): de pagina stuurt hem, zoals bij licht. */
  readonly opdracht?: { readonly pad: string; readonly body: Readonly<Record<string, unknown>> };
  /** Wat er verandert, als kaartjes onder het antwoord. */
  readonly gedaan?: readonly { readonly soort: string; readonly waarde: string; readonly uitleg: string }[];
}

/**
 * De klimaatbrug (besluit 210), voor de assistent: voor een kamer en een wens
 * de opdracht met zijn antwoord, een reden waarom het niet kan, of null als de
 * brug niet over die kamer of wens gaat (dan zegt het huis wat het zou doen).
 */
export type BrugVraag = (
  wens: 'verwarmen' | 'koelen',
  zoneId: string,
  temperatuurC: number | null,
  lang: Lang,
) =>
  | { readonly ok: true; readonly antwoord: string; readonly feiten: readonly Fact[]; readonly opdracht: NonNullable<Answer['opdracht']>; readonly gedaan: NonNullable<Answer['gedaan']> }
  | { readonly ok: false; readonly antwoord: string }
  | null;

export interface AskContext {
  readonly config: SiteConfig;
  readonly snapshot: DecisionView | null;
  /** Het dagoverzicht, of null waar er niet gelogd wordt. */
  readonly today: TodayReport | null;
  readonly nowMs: number;
  /** Tijdens de schaduw zegt de assistent "ik zou", niet "ik doe". */
  readonly shadow: boolean;
  readonly lang: Lang;
  /**
   * Of de zon op is en op welke gevels hij staat, op naam (besluit 93). Weg of
   * null als de ligging van het huis niet bekend is; dan zegt de assistent er
   * niets over.
   */
  readonly zoninval?: { readonly boven: boolean; readonly gevels: readonly string[] } | null;
  /**
   * Wat het weer verwacht voor de zon van vandaag (besluit 141): wat er al
   * was, wat er samen verwacht wordt, en wat de dag ervoor werd verwacht. Weg
   * of null zonder weerbron.
   */
  readonly weer?: {
    readonly opgewektKwh: number;
    readonly verwachtKwh: number | null;
    readonly voorafKwh: number | null;
    /**
     * Het weer van de rest van vandaag (besluit 166): wat Buienradar nu zegt,
     * en uit de uren de warmste en koudste temperatuur en de grootste regenkans.
     */
    readonly vandaag?: {
      readonly tekst: string | null;
      readonly minC: number | null;
      readonly maxC: number | null;
      readonly regenkansPct: number | null;
    } | null;
    /** Morgen (besluit 142): de verwachting van het weer en van je dak. */
    readonly morgen?: {
      readonly tekst: string | null;
      readonly minC: number | null;
      readonly maxC: number | null;
      readonly regenkansPct: number | null;
      readonly verwachtKwh: number | null;
    } | null;
  } | null;
  /**
   * Wat de apparaten met een eigen meter deze maand gebruikten en kostten
   * (besluit 142), uit Opbrengst. Alleen het deel van het net kost geld.
   */
  readonly kosten?: {
    readonly maand: string;
    readonly apparaten: readonly { readonly id: string; readonly naam: string; readonly kwh: number; readonly zonKwh: number; readonly euro: number | null }[];
    /**
     * Het hele huis deze maand (29 oktober 2026), uit de slimme meter: stroom
     * met de teruglevering ervan af, gas, en alles met de vaste kosten. Null
     * waar een prijs ontbreekt.
     */
    readonly huis?: {
      readonly stroomEuro: number | null;
      readonly gasEuro: number | null;
      readonly totaalEuro: number | null;
      readonly vanNetKwh: number;
      readonly terugKwh: number;
    };
  } | null;
  /** Het sluipverbruik (besluit 192), uit de nachten van de slimme meter. */
  readonly sluip?: SluipRapport | null;
  /** De klimaatbrug (besluit 210): weg of null als hij uit staat. */
  readonly brug?: BrugVraag | null;
}

/** "De zon staat nu op de voorgevel." Zonder getallen: de gevels hebben namen. */
function facadeSentence(zoninval: AskContext['zoninval'], lang: Lang): string | null {
  if (zoninval == null || !zoninval.boven) return null;
  const list = zoninval.gevels.map((n) => withArticle(n, lang));
  if (list.length === 0) {
    return lang === 'nl' ? 'De zon staat nu op geen van de gevels.' : 'The sun is not on any of the facades right now.';
  }
  const joined = list.join(lang === 'nl' ? ' en ' : ' and ');
  return lang === 'nl' ? `De zon staat nu op ${joined}.` : `The sun is on ${joined} right now.`;
}

/** "a, b en c". */
function joinList(items: readonly string[], lang: Lang): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'nl' ? 'en' : 'and'} ${items.at(-1)}`;
}

/**
 * Wat er nog aan zon komt (besluit 141): vandaag als er nog iets komt, en
 * anders wat er morgen van je dak verwacht wordt (besluit 142).
 */
function restSentence(f: Facts, weer: AskContext['weer'], lang: Lang): string | null {
  if (weer == null) return null;
  const rest = weer.verwachtKwh == null ? 0 : Math.max(0, weer.verwachtKwh - weer.opgewektKwh);
  if (rest >= 0.05) {
    const r = f.energy('weer.rest', rest * 1000);
    return lang === 'nl' ? `Er komt vandaag nog ongeveer ${r} zon bij.` : `About ${r} more sun is expected today.`;
  }
  const m = weer.morgen;
  if (m?.verwachtKwh != null) {
    const k = f.energy('weer.morgen.verwacht', m.verwachtKwh * 1000);
    return lang === 'nl' ? `Vandaag komt er weinig zon meer bij; morgen verwacht ik ${k} van je panelen.` : `Little more sun today; tomorrow I expect ${k} from your panels.`;
  }
  if (weer.verwachtKwh == null) return null;
  return lang === 'nl' ? 'Vandaag komt er weinig zon meer bij.' : 'Little more sun is expected today.';
}

/** "Beneden" blijft "Beneden"; "de wasruimte" wordt "in de wasruimte". */
const BIJWOORD = /^(beneden|boven|binnen|buiten|overal|downstairs|upstairs)$/i;
/** Op zolder, op de overloop; verder in. */
const OP = /^(zolder|overloop|vliering)\b/i;
function plekVan(zone: Zone, lang: Lang): string {
  if (BIJWOORD.test(zone.name.trim())) return zone.name.trim();
  return `${lang === 'nl' && OP.test(zone.name.trim()) ? 'op' : 'in'} ${zoneName(zone, lang)}`;
}

/* ---------------------------------------------------------------- vragen */

const WISHES: Readonly<Record<string, Wish>> = {
  koelen: 'koelen',
  koel: 'koelen',
  cool: 'koelen',
  verwarmen: 'verwarmen',
  verwarm: 'verwarmen',
  warm: 'verwarmen',
  heat: 'verwarmen',
  uit: 'uit',
  off: 'uit',
  // Drogen (besluit 129): een airco die de lucht droger maakt, zonder doel.
  drogen: 'drogen',
  droog: 'drogen',
  dry: 'drogen',
  aan: 'aan',
  on: 'aan',
};

export type Parsed =
  | { readonly ok: true; readonly question: Question; readonly lang: Lang }
  | { readonly ok: false; readonly reden: string };

/**
 * Leest een vraag uit de querystring:
 * `v=nu|waarom|straks|zon|doe`, `kamer=`, `wens=koelen|verwarmen|uit`,
 * `temperatuur=21,5`, `taal=nl|en`.
 */
export function parseQuestion(params: URLSearchParams): Parsed {
  const rawLang = (params.get('taal') ?? 'nl').toLowerCase();
  if (!(LANGS as readonly string[]).includes(rawLang)) {
    return { ok: false, reden: `taal moet een van ${LANGS.join(', ')} zijn` };
  }
  const lang = rawLang as Lang;
  const v = (params.get('v') ?? '').toLowerCase();
  const kamer = (params.get('kamer') ?? '').trim();

  switch (v) {
    case 'nu':
    case 'straks':
    case 'zon':
    case 'vandaag':
    case 'warm':
    case 'weer':
    case 'morgen':
    case 'kosten':
    case 'sluip':
    case 'thuis':
    case 'terug':
      return { ok: true, lang, question: { kind: v } };
    case 'draait':
      return { ok: true, lang, question: { kind: 'draait', apparaat: (params.get('apparaat') ?? '').trim() } };
    case 'waarom':
      if (kamer === '') return { ok: false, reden: 'waarom vraagt een kamer' };
      return { ok: true, lang, question: { kind: 'waarom', kamer } };
    case 'doe': {
      if (kamer === '') return { ok: false, reden: 'doe vraagt een kamer' };
      const wens = WISHES[(params.get('wens') ?? '').trim().toLowerCase()];
      if (wens == null) return { ok: false, reden: 'wens moet koelen, verwarmen, drogen, uit of aan zijn' };
      const raw = (params.get('temperatuur') ?? '').trim().replace(',', '.');
      let temperatuurC: number | null = null;
      if (raw !== '') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return { ok: false, reden: 'temperatuur is geen getal' };
        temperatuurC = n;
      }
      return { ok: true, lang, question: { kind: 'doe', kamer, wens, temperatuurC } };
    }
    default:
      return { ok: false, reden: `v moet een van ${QUESTION_KINDS.join(', ')} zijn` };
  }
}

/** Zoekt de kamer bij wat iemand zei: het id, de naam, of een deel ervan. */
export function findZone(config: SiteConfig, said: string): Zone | undefined {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^(de|het|the)\s+/, '')
      .trim();
  const wanted = norm(said);
  if (wanted === '') return undefined;
  return (
    config.zones.find((z) => norm(z.id) === wanted || norm(z.name) === wanted) ??
    config.zones.find((z) => norm(z.name).includes(wanted) || wanted.includes(norm(z.name)))
  );
}

/* ------------------------------------------------------------- opmaak */

/** Houdt bij welke getallen er in het antwoord staan. */
class Facts {
  readonly list: Fact[] = [];
  readonly #lang: Lang;
  readonly #timeZone: string;

  constructor(lang: Lang, timeZone: string) {
    this.#lang = lang;
    this.#timeZone = timeZone;
  }

  #num(n: number): string {
    const r = Math.round(n * 10) / 10;
    const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return this.#lang === 'nl' ? s.replace('.', ',') : s;
  }

  /** Neemt de feiten over van een zin die in het antwoord komt. */
  merge(other: Facts): void {
    this.list.push(...other.list);
  }

  #add(bron: string, tekst: string): string {
    this.list.push({ bron, tekst });
    return tekst;
  }

  temp(bron: string, c: number): string {
    return this.#add(bron, `${this.#num(c)}°`);
  }

  /** Vermogen zonder teken; de zin zegt de richting. */
  power(bron: string, w: number): string {
    const a = Math.abs(w);
    return this.#add(bron, a < 1000 ? `${Math.round(a / 10) * 10} W` : `${this.#num(a / 1000)} kW`);
  }

  energy(bron: string, wh: number): string {
    const a = Math.abs(wh);
    return this.#add(bron, a < 1000 ? `${Math.round(a / 10) * 10} Wh` : `${this.#num(a / 1000)} kWh`);
  }

  /** Watt precies, zoals op het scherm Sluipverbruik: "304 W". */
  watt(bron: string, w: number): string {
    return this.#add(bron, `${Math.round(Math.abs(w))} W`);
  }

  /** Een aantal, zoals "13 keer". */
  count(bron: string, n: number): string {
    return this.#add(bron, String(Math.round(n)));
  }

  pct(bron: string, p: number): string {
    return this.#add(bron, `${Math.round(p)}%`);
  }

  /** Een bedrag: "€ 0,45". */
  euro(bron: string, n: number): string {
    const s = (Math.round(n * 100) / 100).toFixed(2);
    return this.#add(bron, `€ ${this.#lang === 'nl' ? s.replace('.', ',') : s}`);
  }

  /** Een duur in gewone woorden: "25 minuten", "1,5 uur". */
  duration(bron: string, ms: number): string {
    const min = Math.round(ms / 60_000);
    const nl = this.#lang === 'nl';
    if (min < 60) return this.#add(bron, `${Math.max(1, min)} ${nl ? 'minuten' : 'minutes'}`);
    return this.#add(bron, `${this.#num(min / 60)} ${nl ? 'uur' : 'hours'}`);
  }

  time(bron: string, ms: number): string {
    const t = new Intl.DateTimeFormat(this.#lang === 'nl' ? 'nl-NL' : 'en-GB', {
      timeZone: this.#timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(ms);
    return this.#add(bron, t);
  }
}

/* ------------------------------------------------------------- teksten */

const WORDS = {
  nl: {
    mode: {
      dag: 'de dagstand',
      nacht: 'de nachtstand',
      voorverwarmen: 'voorverwarmen',
      afwezig: 'afwezig',
      vakantie: 'vakantie',
      handmatig: 'handmatig',
    } satisfies Record<Mode, string>,
    wish: { koelen: 'koelen', verwarmen: 'verwarmen', drogen: 'drogen', uit: 'uit', aan: 'aan' } satisfies Record<Wish, string>,
    doing: { cool: 'koelt', heat: 'verwarmt' },
    infinitive: { cool: 'koelen', heat: 'verwarmen' },
    // Een kamer met alleen hulpapparaten (role assist): die verwarmen of koelen alleen op zon (29 oktober 2026).
    alleenZon: { cool: 'hier alleen met zon over gekoeld wordt', heat: 'hier alleen met zon over verwarmd wordt' },
    observed: {
      cool: 'koelen',
      heat: 'verwarmen',
      off: 'uit',
      heat_cool: 'automatisch',
      auto: 'automatisch',
      dry: 'drogen',
      fan_only: 'ventileren',
    } as Record<string, string>,
    reason: {
      zone_below_setpoint: 'het er kouder is dan het doel',
      zone_above_setpoint: 'het er warmer is dan het doel',
      zone_satisfied: 'de kamer op temperatuur is',
      buffering_free_energy: 'er gratis zonnestroom is om op te slaan',
      surplus_available: 'er zon over is',
      surplus_insufficient: 'er te weinig zon over is',
      importing_from_grid: 'het huis stroom van het net haalt',
      outside_active_hours: 'het buiten de actieve uren is',
      mode_excludes_action: 'dat niet past bij de stand van nu',
      nobody_home: 'er niemand thuis is',
      failsafe_unreliable_input: 'een meting niet betrouwbaar is',
    } satisfies Record<ReasonCode, string>,
    // Bijzinnen: ze staan na "omdat", dus het werkwoord achteraan.
    block: {
      min_run_not_elapsed: 'het apparaat eerst een minimale tijd moet blijven draaien',
      min_rest_not_elapsed: 'het apparaat na het uitgaan eerst even moet pauzeren, dat spaart de compressor',
      stabilisation_active: 'het verbruik eerst even stabiel moet zijn',
      settling_after_switch: 'het apparaat net van stand is gewisseld',
      insufficient_power_budget: 'er te weinig zon over is',
      start_threshold_not_met: 'er net te weinig zon over is om te starten',
      capability_missing: 'het apparaat dat niet kan',
      setpoint_out_of_range: 'het doel buiten het bereik van het apparaat valt',
      superseded_by_higher_priority: 'een andere kamer voorgaat',
      no_change_needed: 'er niets te veranderen is',
      resident_override: 'jij het zelf hebt overgenomen',
      insufficient_current_budget: 'de stroom op de hoofdzekering dan te hoog zou worden',
    } satisfies Record<BlockCode, string>,
  },
  en: {
    mode: {
      dag: 'day mode',
      nacht: 'night mode',
      voorverwarmen: 'preheating',
      afwezig: 'away',
      vakantie: 'holiday',
      handmatig: 'manual',
    } satisfies Record<Mode, string>,
    wish: { koelen: 'cool', verwarmen: 'heat', drogen: 'dry', uit: 'off', aan: 'on' } satisfies Record<Wish, string>,
    doing: { cool: 'is cooling', heat: 'is heating' },
    infinitive: { cool: 'cool', heat: 'heat' },
    alleenZon: { cool: 'it only cools here with spare sun', heat: 'it only heats here with spare sun' },
    observed: {
      cool: 'cooling',
      heat: 'heating',
      off: 'off',
      heat_cool: 'automatic',
      auto: 'automatic',
      dry: 'drying',
      fan_only: 'fan only',
    } as Record<string, string>,
    reason: {
      zone_below_setpoint: 'it is colder than the target',
      zone_above_setpoint: 'it is warmer than the target',
      zone_satisfied: 'the room is at temperature',
      buffering_free_energy: 'there is free solar power to store',
      surplus_available: 'there is solar power to spare',
      surplus_insufficient: 'there is not enough solar power to spare',
      importing_from_grid: 'the house is drawing power from the grid',
      outside_active_hours: 'it is outside the active hours',
      mode_excludes_action: 'that does not fit the current mode',
      nobody_home: 'nobody is home',
      failsafe_unreliable_input: 'a measurement is unreliable',
    } satisfies Record<ReasonCode, string>,
    block: {
      min_run_not_elapsed: 'the unit has to finish its minimum run time first',
      min_rest_not_elapsed: 'the unit has to rest for a moment first',
      stabilisation_active: 'I am waiting for the power use to settle',
      settling_after_switch: 'the unit is still settling after a switch',
      insufficient_power_budget: 'there is not enough solar power to spare',
      start_threshold_not_met: 'there is just too little solar power to start',
      capability_missing: 'the unit cannot do that',
      setpoint_out_of_range: 'the target is outside the range of the unit',
      superseded_by_higher_priority: 'another room comes first',
      no_change_needed: 'nothing needs to change',
      resident_override: 'you took it over yourself',
      insufficient_current_budget: 'the current on the main fuse would then get too high',
    } satisfies Record<BlockCode, string>,
  },
} as const;

/**
 * Een naam midden in een zin. Alleen de eerste letter gaat klein, en alleen als
 * het eerste woord een gewoon woord is: "Slaapkamer Daan" wordt "slaapkamer
 * Daan" en "Nest (beneden)" blijft "Nest (beneden)". Een merk of een naam
 * houdt zijn hoofdletter.
 */
const COMMON = new RegExp(
  `^(${[...Object.keys(KAMERWOORDEN), 'airco', 'thermostaat', 'lamp', 'screen', 'zonnescherm', 'droger', 'wasmachine', 'vaatwasser', 'verwarming', 'vloerverwarming', 'radiator', 'ventilatie', 'warmtepomp', 'boiler', 'voorgevel', 'achtergevel', 'zijgevel', 'gevel'].join('|')})\\b`,
  'i',
);

export function inSentence(name: string): string {
  return COMMON.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/**
 * Een naam in een zin: "Zolder" wordt "de zolder", maar een eigen naam zoals
 * "Beneden" of "Kamer van Sam" blijft zoals hij is (besluit 131). De kamers
 * heten zoals in de indeling, dus het kan allebei.
 */
export function withArticle(name: string, lang: Lang): string {
  if (!COMMON.test(name)) return name;
  if (lang !== 'nl') return `the ${name}`;
  // Een kamer met zijn eigen lidwoord ("het kantoor"); een apparaat of gevel met "de".
  return lidwoordVan(name) ? metLidwoord(name) : `de ${inSentence(name)}`;
}

function zoneName(zone: Zone, lang: Lang): string {
  return withArticle(zone.name, lang);
}

function deviceName(actuator: Actuator, lang: Lang): string {
  // Een apparaat altijd met lidwoord: "de Nest", "de airco woonkamer".
  return lang === 'nl' ? `de ${inSentence(actuator.name)}` : `the ${actuator.name}`;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------------------------- de stand van een kamer */

/** Soorten: cool, heat, wait, ok, idle, bad — dezelfde als op de wand. */
export type RoomKind = 'cool' | 'heat' | 'wait' | 'ok' | 'idle' | 'bad';

export interface RoomStatus {
  readonly kind: RoomKind;
  readonly zin: string;
  readonly feiten: readonly Fact[];
}

/** Wat de meetpunten zijn die de failsafe onbetrouwbaar vond, in woorden. */
function unreliableWords(config: SiteConfig, ids: readonly string[], lang: Lang): string {
  const words = new Set<string>();
  for (const id of ids) {
    const zone = config.zones.find((z) => z.temperature.id === id);
    if (zone) words.add(lang === 'nl' ? `de temperatuur in ${zoneName(zone, lang)}` : `the temperature in ${zoneName(zone, lang)}`);
    else if (config.power.gridPower?.id === id) words.add(lang === 'nl' ? 'de slimme meter' : 'the smart meter');
    else if (config.solarProduction?.id === id) words.add(lang === 'nl' ? 'de zonnepanelen' : 'the solar panels');
    else words.add(lang === 'nl' ? 'een meting' : 'a measurement');
  }
  return [...words].join(lang === 'nl' ? ' en ' : ' and ');
}

/** "het is er 24,3° en het doel is 24°" — of minder, als er iets ontbreekt. */
function tempClause(f: Facts, zone: Zone, e: Explanation, lang: Lang): string {
  const pz = e.perZone.find((z) => z.zoneId === zone.id);
  const parts: string[] = [];
  if (pz?.temperatureC != null) {
    const t = f.temp(`zone.${zone.id}.temperatuur`, pz.temperatureC);
    parts.push(lang === 'nl' ? `het is er ${t}` : `it is ${t}`);
  }
  if (pz?.targetC != null) {
    const t = f.temp(`zone.${zone.id}.doel`, pz.targetC);
    parts.push(lang === 'nl' ? `het doel is ${t}` : `the target is ${t}`);
  }
  return parts.join(lang === 'nl' ? ' en ' : ' and ');
}

/** Wat er van het net komt of teruggaat, als losse zin. */
function gridSentence(f: Facts, e: Explanation, lang: Lang): string | null {
  const g = e.budget.gridPowerW;
  if (!Number.isFinite(g)) return null;
  if (Math.abs(g) < 50) return lang === 'nl' ? 'Er gaat nu bijna niets van of naar het net.' : 'Almost nothing goes to or from the grid right now.';
  const p = f.power('budget.netvermogen', g);
  if (g < 0) return lang === 'nl' ? `Er gaat nu ${p} terug naar het net.` : `${cap(p)} is going back to the grid right now.`;
  return lang === 'nl' ? `Het huis haalt nu ${p} van het net.` : `The house is drawing ${p} from the grid right now.`;
}

/**
 * De panelen en het net in één zin (besluit 142): "Je panelen leveren 1,2 kW,
 * en 300 W gaat terug naar het net." Zonder zon alleen het net.
 */
function powerSentence(f: Facts, e: Explanation, lang: Lang, withSun: boolean): string | null {
  const zon = e.solarProductionW;
  if (!withSun || zon == null || zon <= 0) return gridSentence(f, e, lang);
  const p = f.power('zon.vermogen', zon);
  const g = e.budget.gridPowerW;
  if (!Number.isFinite(g)) return lang === 'nl' ? `Je panelen leveren nu ${p}.` : `Your panels are producing ${p}.`;
  if (Math.abs(g) < 50) return lang === 'nl' ? `Je panelen leveren nu ${p}, precies genoeg voor het huis.` : `Your panels are producing ${p}, just enough for the house.`;
  const q = f.power('budget.netvermogen', g);
  if (g < 0) return lang === 'nl' ? `Je panelen leveren nu ${p}, en ${q} daarvan gaat terug naar het net.` : `Your panels are producing ${p}, and ${q} of it goes back to the grid.`;
  return lang === 'nl' ? `Je panelen leveren nu ${p}; het huis haalt er ${q} van het net bij.` : `Your panels are producing ${p}; the house draws another ${q} from the grid.`;
}

/**
 * De stand van één kamer, in één zin. Volgt dezelfde voorrang als de wand: een
 * storing, dan een ingreep van de bewoner, dan wat draait, wat wacht en wat
 * niets nodig heeft.
 */
export function roomStatus(
  config: SiteConfig,
  snap: DecisionView,
  zone: Zone,
  lang: Lang,
  shadow: boolean,
): RoomStatus {
  const f = new Facts(lang, config.timezone);
  const s = statusOf(config, snap, zone, lang, shadow, f);
  return { ...s, feiten: f.list };
}

/*
 * De zinnen zijn kort en vertellen eerst het antwoord (besluit 142): "In de
 * wasruimte is het 22,3°, precies goed." Daarna hooguit één of twee zinnen
 * met wat er speelt.
 */
function statusOf(
  config: SiteConfig,
  snap: DecisionView,
  zone: Zone,
  lang: Lang,
  shadow: boolean,
  f: Facts,
  // "Wat doe je nu?" noemt het net één keer voor het hele huis.
  withGrid = true,
): { kind: RoomKind; zin: string } {
  const w = WORDS[lang];
  const e = snap.explanation;
  const zn = zoneName(zone, lang);
  const plek = plekVan(zone, lang);
  const ids = new Set(zone.actuatorIds);
  const pz = e.perZone.find((z) => z.zoneId === zone.id);

  if (e.failsafe.active) {
    const what = unreliableWords(config, e.failsafe.unreliable, lang);
    return {
      kind: 'bad',
      zin:
        lang === 'nl'
          ? `Ik heb alles veilig gezet, want ${what} is niet betrouwbaar.`
          : `I have put everything in a safe state, because ${what} is unreliable.`,
    };
  }

  const taken = (e.overrides ?? []).find((o) => ids.has(o.actuatorId));
  if (taken) {
    const dev = config.actuators.find((a) => a.id === taken.actuatorId);
    const dn = dev ? deviceName(dev, lang) : zn;
    if (taken.untilMs == null) {
      return {
        kind: 'wait',
        zin: lang === 'nl' ? `Je hebt ${dn} zelf in handen. Ik blijf eraf tot je hem teruggeeft.` : `You have ${dn} in your own hands. I will leave it until you hand it back.`,
      };
    }
    const t = f.time(`ingreep.${taken.actuatorId}.tot`, taken.untilMs);
    return {
      kind: 'wait',
      zin: lang === 'nl' ? `Je hebt ${dn} zelf in handen, tot ${t}. Tot dan blijf ik eraf.` : `You have ${dn} in your own hands until ${t}. I will leave it until then.`,
    };
  }

  const mine = snap.accepted.filter((i) => ids.has(i.actuatorId));
  const running = mine.find((i) => i.action === 'cool' || i.action === 'heat');
  if (running && (running.action === 'cool' || running.action === 'heat')) {
    const a = running.action;
    const onSun = running.strategyId === 'pv-surplus';
    const temps = tempClause(f, zone, e, lang);
    let sun = '';
    if (onSun && e.solarProductionW != null && e.solarProductionW > 0) {
      const p = f.power('zon.vermogen', e.solarProductionW);
      sun = lang === 'nl' ? `Je panelen leveren ${p}, dus dat kan op eigen stroom.` : `Your panels are producing ${p}, so it can run on your own power.`;
    }
    const head =
      lang === 'nl'
        ? shadow
          ? `Ik zou ${zn} nu laten ${w.infinitive[a]}${onSun ? ' op zon' : ''}`
          : `${cap(zn)} ${w.doing[a]}${onSun ? ' op zon' : ''}`
        : shadow
          ? `I would ${w.infinitive[a]} ${zn} now${onSun ? ' on solar power' : ''}`
          : `${cap(zn)} ${w.doing[a]}${onSun ? ' on solar power' : ''}`;
    return {
      kind: a,
      zin: [`${head}${temps ? `: ${temps}` : ''}.`, sun].filter((s) => s !== '').join(' '),
    };
  }

  const parked = mine.find((i) => i.action === 'standby');
  if (parked) {
    const dev = config.actuators.find((a) => a.id === parked.actuatorId);
    const dn = dev ? deviceName(dev, lang) : zn;
    return {
      kind: 'wait',
      zin:
        lang === 'nl'
          ? `${cap(dn)} ${shadow ? 'zou ik even stilzetten' : 'staat even stil'}, omdat ${w.reason[parked.reason]}. Komt er genoeg zon terug, dan gaat hij verder.`
          : `${shadow ? `I would pause ${dn}` : `${cap(dn)} is paused`}, because ${w.reason[parked.reason]}. If enough sun comes back, it carries on.`,
    };
  }

  if (pz == null || pz.temperatureC == null) {
    return {
      kind: 'bad',
      zin: lang === 'nl' ? `Ik meet ${plek} nu geen temperatuur.` : `I have no temperature for ${zn} right now.`,
    };
  }

  if (pz.demand !== 'none') {
    const temps = tempClause(f, zone, e, lang);
    const a = pz.demand;
    const blocked = snap.rejected.find((r) => r.intent.zoneId === zone.id && r.intent.action === a);
    // Niets tegengehouden en alleen hulpapparaten: dan wacht het op zon. Eerst stond hier de reden van de vraag
    // zelf ("omdat het er kouder is dan het doel"), en dat is geen reden om te wachten.
    const ids = zone.actuatorIds;
    const alleenZon = !blocked && ids.length > 0 && ids.every((id) => config.actuators.find((x) => x.id === id)?.role === 'assist');
    const why = blocked ? w.block[blocked.blockedBy] : alleenZon ? w.alleenZon[a] : w.reason[pz.reason];
    const sunBlock =
      blocked?.blockedBy === 'insufficient_power_budget' || blocked?.blockedBy === 'start_threshold_not_met';
    const grid = sunBlock && withGrid ? gridSentence(f, e, lang) : null;
    // De redenen zijn bijzinnen ("er te weinig zon over is"); na "omdat" staan ze goed.
    const head =
      lang === 'nl'
        ? `${cap(zn)} wil ${w.infinitive[a]}: ${temps}. Dat wacht nog even, omdat ${why}.`
        : `${cap(zn)} wants to ${w.infinitive[a]}: ${temps}. That has to wait, because ${why}.`;
    return { kind: 'wait', zin: grid ? `${head} ${grid}` : head };
  }

  // Geen vraag: de kamer zit tussen het doel voor verwarmen en dat voor koelen.
  const t = f.temp(`zone.${zone.id}.temperatuur`, pz.temperatureC);
  const heatC = pz.heatTargetC ?? (pz.coolTargetC === undefined ? pz.targetC : null);
  const coolC = pz.coolTargetC ?? null;
  const Plek = cap(plek);
  if (heatC == null && coolC == null) {
    return {
      kind: 'idle',
      zin: lang === 'nl' ? `${Plek} is het ${t}. Er is nu geen doel, dus ik laat het zo.` : `It is ${t} ${plek}. There is no target right now, so I leave it.`,
    };
  }
  const nl = lang === 'nl';
  const beide = heatC != null && coolC != null;
  const head = nl
    ? `${Plek} is het ${t}, ${beide ? 'precies goed' : heatC != null ? 'warm genoeg' : 'koel genoeg'}.`
    : `It is ${t} ${plek}, ${beide ? 'just right' : heatC != null ? 'warm enough' : 'cool enough'}.`;
  // Wanneer het huis ingrijpt; alleen als die zin er ook komt, tellen de doelen als feit.
  const wanneerZin = (): string => {
    const h = heatC == null ? null : f.temp(`zone.${zone.id}.doelVerwarmen`, heatC);
    const c = coolC == null ? null : f.temp(`zone.${zone.id}.doelKoelen`, coolC);
    return nl
      ? h && c
        ? shadow ? `Ik zou pas ingrijpen onder ${h} of boven ${c}.` : `Pas onder ${h} of boven ${c} grijp ik in.`
        : h
          ? shadow ? `Pas onder ${h} zou ik gaan verwarmen.` : `Pas onder ${h} ga ik verwarmen.`
          : shadow ? `Pas boven ${c} zou ik gaan koelen.` : `Pas boven ${c} ga ik koelen.`
      : h && c
        ? `I ${shadow ? 'would only step in' : 'only step in'} below ${h} or above ${c}.`
        : h
          ? `Only below ${h} ${shadow ? 'would I' : 'do I'} heat.`
          : `Only above ${c} ${shadow ? 'would I' : 'do I'} cool.`;
  };
  // Op zon zou het nog verder mogen (besluit 133), maar er is te weinig over (besluit 141).
  const opZon = snap.rejected.find((r) => r.intent.zoneId === zone.id && (r.blockedBy === 'insufficient_power_budget' || r.blockedBy === 'start_threshold_not_met') && r.intent.budgetW > 0 && (r.intent.action === 'cool' || r.intent.action === 'heat'));
  let zon = '';
  if (opZon) {
    const a = opZon.intent.action as 'cool' | 'heat';
    const doel = opZon.intent.setpointC != null ? f.temp(`zone.${zone.id}.opZonDoel`, opZon.intent.setpointC) : null;
    const vraagt = f.power(`opzon.${opZon.intent.actuatorId}.vraagt`, opZon.intent.budgetW);
    const over = Math.max(0, e.budget?.surplusW ?? 0);
    const rest = over >= 50 ? f.power('zon.over', over) : null;
    zon = nl
      ? `Op zon zou ik nog ${w.infinitive[a]}${doel ? ` tot ${doel}` : ''}, maar dat vraagt ${vraagt} en er is ${rest ?? 'niets'} over.`
      : `On solar I would ${w.infinitive[a]}${doel ? ` to ${doel}` : ''}, but that needs ${vraagt} and ${rest ?? 'nothing'} is spare.`;
  }
  return { kind: 'ok', zin: [head, zon || wanneerZin()].join(' ') };
}

/** Wat de apparaten van de kamer echt doen, zolang de schaduw meekijkt. */
function realSentence(f: Facts, config: SiteConfig, snap: DecisionView, zone: Zone, lang: Lang): string {
  const w = WORDS[lang];
  const known: string[] = [];
  const unknown: string[] = [];
  for (const a of actuatorsOf(config, zone)) {
    const [state = '', sp] = (snap.observed[a.id] ?? '').split('@');
    const word = w.observed[state];
    const dn = deviceName(a, lang);
    if (word == null) {
      unknown.push(dn);
      continue;
    }
    const n = sp == null ? NaN : Number(sp);
    const setpoint = state !== 'off' && Number.isFinite(n) ? f.temp(`apparaat.${a.id}.setpoint`, n) : null;
    known.push(
      lang === 'nl'
        ? state === 'off'
          ? `${dn} uit`
          : `${dn} op ${word}${setpoint ? ` naar ${setpoint}` : ''}`
        : state === 'off'
          ? `${dn} is off`
          : `${dn} is set to ${word}${setpoint ? ` at ${setpoint}` : ''}`,
    );
  }
  const out: string[] = [];
  if (known.length > 0) out.push(lang === 'nl' ? `Nu staat ${joinList(known, lang)}.` : `Right now ${joinList(known, lang)}.`);
  if (unknown.length > 0) {
    const names = joinList(unknown, lang);
    out.push(lang === 'nl' ? `Hoe ${names} staat, weet ik niet.` : `I do not know the state of ${names}.`);
  }
  return out.join(' ');
}

/* --------------------------------------------------------------- antwoorden */

function unknownRoom(config: SiteConfig, said: string, lang: Lang): string {
  const names = joinList(config.zones.map((z) => inSentence(z.name)), lang);
  return lang === 'nl'
    ? `"${said}" ken ik niet als kamer. Ik ken ${names}.`
    : `I do not know the room "${said}". I know ${names}.`;
}

function noDecision(lang: Lang): string {
  return lang === 'nl'
    ? 'Ik ben net opgestart en heb nog niets besloten. Vraag het me zo nog eens.'
    : 'I have just started and have not decided anything yet. Ask me again in a moment.';
}

const NO_DAY = {
  nl: 'In deze installatie houd ik geen dag bij, dus dat weet ik niet.',
  en: 'This installation does not keep a daily record, so I do not know.',
} as const;

/** Het volgende uur waarop de klok de stand verandert, met die stand. */
function nextScheduleChange(config: SiteConfig, nowMs: number): { atMs: number; mode: Mode } {
  const { preheatFromHour, dayFromHour, nightFromHour } = config.schedule;
  const marks: { hour: number; mode: Mode }[] = [
    { hour: preheatFromHour, mode: 'voorverwarmen' },
    { hour: dayFromHour, mode: 'dag' },
    { hour: nightFromHour, mode: 'nacht' },
  ];
  const midnight = startOfLocalDay(nowMs, config.timezone);
  const candidates = [0, 1].flatMap((d) =>
    marks.map((m) => ({
      // Een dag later via de volgende middernacht, zodat zomertijd geen uur scheelt.
      atMs: (d === 0 ? midnight : startOfLocalDay(midnight + 30 * 3_600_000, config.timezone)) + m.hour * 3_600_000,
      mode: m.mode,
    })),
  );
  return candidates.filter((c) => c.atMs > nowMs).sort((a, b) => a.atMs - b.atMs)[0]!;
}

/*
 * De antwoorden (besluit 142): eerst het antwoord, dan hooguit twee zinnen
 * met wat er speelt. Warm en inhoudelijk, met de cijfers die het huis heeft;
 * "ik kijk alleen mee" zegt de assistent alleen als je vraagt wat hij doet.
 */
export function ask(question: Question, ctx: AskContext): Answer {
  const { config, snapshot, lang, shadow } = ctx;
  const nl = lang === 'nl';
  const f = new Facts(lang, config.timezone);
  const done = (antwoord: string, kamer: string | null = null): Answer => ({
    vraag: question.kind,
    taal: lang,
    kamer,
    antwoord: antwoord.replace(/\s+/g, ' ').trim(),
    feiten: f.list,
  });
  const letterlijk = (antwoord: string, kamer: string | null = null): Answer => ({ ...done(antwoord, kamer), letterlijk: true });

  switch (question.kind) {
    case 'nu': {
      if (snapshot == null) return letterlijk(noDecision(lang));
      const e = snapshot.explanation;
      const out: string[] = [];
      if (isHandsOff(e.mode)) {
        out.push(nl ? 'De regeling staat op handmatig, dus ik doe niets.' : 'The system is set to manual, so I am not doing anything.');
      } else {
        // Elke kamer met eigen feiten: alleen wat in het antwoord komt, telt mee.
        const statuses = config.zones.map((z) => {
          const own = new Facts(lang, config.timezone);
          return { ...statusOf(config, snapshot, z, lang, shadow, own, false), own };
        });
        const said = e.failsafe.active
          ? // Bij een storing zegt elke kamer hetzelfde; één keer is genoeg.
            statuses.slice(0, 1)
          : statuses.filter((s) => s.kind !== 'ok' && s.kind !== 'idle');
        // Zonder slimme regeling (besluit 194) zijn er geen kamers om iets te willen.
        if (said.length === 0) out.push(ctx.config.zones.length === 0 ? (nl ? 'Het is rustig: er draait niets.' : 'All quiet: nothing is running.') : nl ? 'Het is rustig: geen kamer heeft nu iets nodig.' : 'All quiet: no room needs anything right now.');
        for (const s of said) {
          out.push(s.zin);
          f.merge(s.own);
        }
      }
      // Een kamer die op zon draait, noemde de panelen al.
      const saidSun = f.list.some((x) => x.bron === 'zon.vermogen');
      const power = powerSentence(f, e, lang, !saidSun);
      if (power) out.push(power);
      // Wiens comfort er geldt (besluit 147), alleen als het niet dat van de hoofdgebruiker is.
      const profiel = snapshot.explanation.profile;
      const hoofd = config.profiles?.[0];
      if (profiel && hoofd && (profiel.id !== hoofd.id || profiel.reason === 'gekozen')) {
        out.push(
          profiel.reason === 'gekozen'
            ? nl ? `Het comfort van ${profiel.name} is gekozen, tot er iemand thuiskomt of weggaat.` : `${profiel.name}'s comfort was chosen, until someone comes home or leaves.`
            : nl ? `Het comfort van ${profiel.name} geldt, want ${hoofd.name} is weg.` : `${profiel.name}'s comfort applies, because ${hoofd.name} is away.`,
        );
      }
      if (shadow) out.push(nl ? 'Zelf schakel ik nog niets: ik kijk mee en leer je huis kennen.' : 'I do not switch anything myself yet: I watch and learn your house.');
      return done(out.join(' '));
    }

    case 'waarom': {
      const zone = findZone(config, question.kamer);
      if (zone == null) return letterlijk(unknownRoom(config, question.kamer, lang));
      if (snapshot == null) return letterlijk(noDecision(lang), zone.id);
      const status = statusOf(config, snapshot, zone, lang, shadow, f);
      const real = shadow ? realSentence(f, config, snapshot, zone, lang) : '';
      return done(`${status.zin} ${real}`, zone.id);
    }

    case 'straks': {
      const out: string[] = [];
      const e = snapshot?.explanation;
      // Eerst wat op zon wacht, net als de kaart Straks op Thuis (16 oktober 2026): daar tik je vandaan.
      const wacht = (snapshot?.rejected ?? []).find((r) => r.blockedBy === 'insufficient_power_budget' && r.intent.budgetW > 0 && (r.intent.action === 'cool' || r.intent.action === 'heat'));
      const wachtZone = wacht ? config.zones.find((z) => z.id === wacht.intent.zoneId) : undefined;
      if (wacht && wachtZone) {
        const a = wacht.intent.action as 'cool' | 'heat';
        const vraagt = f.power(`opzon.${wacht.intent.actuatorId}.vraagt`, wacht.intent.budgetW);
        const over = Math.max(0, e?.budget?.availableW ?? 0);
        const nu = over >= 50 ? f.power('budget.beschikbaar', over) : null;
        out.push(
          nl
            ? `${cap(zoneName(wachtZone, lang))} gaat ${WORDS.nl.infinitive[a]} zodra er ${vraagt} zon over is. Nu is dat ${nu ?? 'nog niets'}; het begint vanzelf.`
            : `${cap(zoneName(wachtZone, lang))} will ${WORDS.en.infinitive[a]} as soon as ${vraagt} of solar is spare. Right now that is ${nu ?? 'nothing yet'}; it starts by itself.`,
        );
      }
      for (const o of e?.overrides ?? []) {
        if (o.untilMs == null || o.untilMs <= ctx.nowMs) continue;
        const dev = config.actuators.find((a) => a.id === o.actuatorId);
        if (!dev) continue;
        const t = f.time(`ingreep.${o.actuatorId}.tot`, o.untilMs);
        out.push(nl ? `Je hebt ${deviceName(dev, lang)} tot ${t}; daarna neem ik het weer over.` : `You have ${deviceName(dev, lang)} until ${t}; after that I take over again.`);
      }
      if (e?.modeSource === 'override') {
        out.push(
          nl
            ? `De stand staat met de hand op ${WORDS.nl.mode[e.mode]}; die verandert niet vanzelf.`
            : `The mode was set to ${WORDS.en.mode[e.mode]} by hand; it does not change by itself.`,
        );
      } else {
        const next = nextScheduleChange(config, ctx.nowMs);
        const t = f.time(`schema.${next.mode}`, next.atMs);
        const later = next.mode === 'nacht' && config.schedule.eveningExtensionLights.length > 0;
        out.push(
          nl
            ? `Om ${t} ga ik naar ${WORDS.nl.mode[next.mode]}${later ? ', of later als er dan nog licht brandt en er iemand thuis is' : ''}.`
            : `At ${t} I switch to ${WORDS.en.mode[next.mode]}${later ? ', or later if a light is still on and someone is home' : ''}.`,
        );
      }
      const rest = restSentence(f, ctx.weer, lang);
      out.push(rest ?? (nl ? 'Wat de zon gaat doen, weet ik nog niet: er is nog geen weersverwachting.' : 'I do not know yet what the sun will do: there is no weather forecast yet.'));
      return done(out.join(' '));
    }

    case 'zon': {
      const t = ctx.today;
      const facade = facadeSentence(ctx.zoninval, lang);
      if (t == null) return done([NO_DAY[lang], facade ?? ''].join(' '));
      const out: string[] = [];
      const vooraf = ctx.weer?.voorafKwh ?? null;
      if (t.zonWh < 5) {
        out.push(nl ? 'Je panelen hebben vandaag nog bijna niets geleverd.' : 'Your panels have produced almost nothing so far today.');
      } else {
        const zon = f.energy('vandaag.zonWh', t.zonWh);
        // Naast wat er vanochtend verwacht werd (besluit 137).
        let naast = '';
        if (vooraf != null && vooraf > 0) {
          const v = f.energy('weer.vooraf', vooraf * 1000);
          const r = t.zonWh / 1000 / vooraf;
          naast = nl
            ? r > 1.1 ? `, meer dan de ${v} die verwacht werd` : r < 0.9 ? `, minder dan de ${v} die verwacht werd` : `, ongeveer de ${v} die verwacht werd`
            : r > 1.1 ? `, more than the ${v} expected` : r < 0.9 ? `, less than the ${v} expected` : `, about the ${v} expected`;
        }
        out.push(nl ? `Je panelen leverden vandaag ${zon}${naast}.` : `Your panels produced ${zon} today${naast}.`);
        if (t.netTerugWh >= 5) {
          const zelf = f.pct('vandaag.zelfPct', Math.max(0, Math.min(100, ((t.zonWh - t.netTerugWh) / t.zonWh) * 100)));
          const terug = f.energy('vandaag.netTerugWh', t.netTerugWh);
          out.push(nl ? `Je gebruikte er ${zelf} zelf van; ${terug} ging terug naar het net.` : `You used ${zelf} of it yourself; ${terug} went back to the grid.`);
        } else {
          out.push(nl ? 'Alles wat ze leverden, gebruikte je zelf.' : 'You used everything they produced yourself.');
        }
      }
      const now = snapshot?.explanation.solarProductionW;
      const best = t.kwartieren
        .filter((k): k is typeof k & { zonW: number } => k.zonW != null)
        .reduce<{ tMs: number; zonW: number } | null>((m, k) => (m == null || k.zonW > m.zonW ? k : m), null);
      const onder = ctx.zoninval != null && !ctx.zoninval.boven;
      if (now != null && now > 0) {
        const p = f.power('zon.vermogen', now);
        out.push(facade ? (nl ? `Nu leveren ze ${p}. ${facade}` : `Right now they produce ${p}. ${facade}`) : nl ? `Nu leveren ze ${p}.` : `Right now they produce ${p}.`);
      } else if (best && best.zonW > 0) {
        const p = f.power('vandaag.piekW', best.zonW);
        const at = f.time('vandaag.piekTijd', best.tMs);
        out.push(nl ? `Het meeste was ${p}, rond ${at}${onder ? '; nu is de zon onder' : ''}.` : `The most was ${p}, around ${at}${onder ? '; the sun has set now' : ''}.`);
      }
      // Hooguit drie zinnen; alleen wat erin komt, telt als feit.
      if (out.length < 3) {
        const own = new Facts(lang, config.timezone);
        const rest = restSentence(own, ctx.weer, lang);
        if (rest) {
          out.push(rest);
          f.merge(own);
        }
      }
      return done(out.join(' '));
    }

    case 'vandaag': {
      const t = ctx.today;
      if (t == null) return done(NO_DAY[lang]);
      const out: string[] = [];
      const duur = (spans: readonly { vanMs: number; totMs: number }[]) => spans.reduce((s, x) => s + Math.max(0, x.totMs - x.vanMs), 0);
      const lijst = (key: 'smartClimate' | 'huidig') =>
        t.apparaten
          .map((a) => ({ a, ms: duur(a[key]), dev: config.actuators.find((x) => x.id === a.actuatorId) }))
          .filter((x) => x.dev && x.ms >= 60_000)
          .sort((x, y) => y.ms - x.ms)
          .slice(0, 3)
          .map((x) => `${deviceName(x.dev!, lang)} ${f.duration(`vandaag.${key}.${x.a.actuatorId}`, x.ms)}`);
      const zou = lijst('smartClimate');
      const echt = lijst('huidig');
      if (zou.length === 0 && echt.length === 0) {
        out.push(nl ? 'Een rustige dag: ik had niets aan hoeven zetten, en er stond ook niets aan.' : 'A quiet day: I did not need to switch anything on, and nothing was on.');
      } else {
        if (zou.length) out.push(nl ? `${shadow ? 'Ik had' : 'Ik heb'} ${joinList(zou, lang)} laten draaien.` : `I ${shadow ? 'would have run' : 'ran'} ${joinList(zou, lang)}.`);
        out.push(
          echt.length
            ? nl ? `Echt aan stond ${joinList(echt, lang)}.` : `Actually on: ${joinList(echt, lang)}.`
            : nl ? 'Echt aan stond er vandaag niets.' : 'Nothing was actually on today.',
        );
      }
      if (t.zonWh >= 50) {
        const zon = f.energy('vandaag.zonWh', t.zonWh);
        const zelf = f.pct('vandaag.zelfPct', Math.max(0, Math.min(100, ((t.zonWh - t.netTerugWh) / t.zonWh) * 100)));
        out.push(nl ? `Je panelen leverden ${zon}, en ${zelf} daarvan gebruikte je zelf.` : `Your panels produced ${zon}, and you used ${zelf} of it yourself.`);
      }
      return done(out.join(' '));
    }

    case 'warm': {
      if (snapshot == null) return letterlijk(noDecision(lang));
      const e = snapshot.explanation;
      const delen = config.zones
        .map((z) => ({ z, c: e.perZone.find((p) => p.zoneId === z.id)?.temperatureC ?? null }))
        .filter((x): x is { z: Zone; c: number } => x.c != null)
        .map((x) => ({ z: x.z, plek: plekVan(x.z, lang), c: f.temp(`zone.${x.z.id}.temperatuur`, x.c) }));
      const out: string[] = [];
      if (delen.length === 0) out.push(nl ? 'Ik meet nu nergens een temperatuur.' : 'I am not measuring a temperature anywhere right now.');
      else if (nl) {
        // "Beneden is het 21,7°, in de badkamer 19° en in de wasruimte 21,7°."
        const [eerste, ...rest] = delen;
        out.push(`${joinList([`${cap(eerste!.plek)} is het ${eerste!.c}`, ...rest.map((d) => `${d.plek} ${d.c}`)], lang)}.`);
      } else out.push(`${joinList(delen.map((d) => `${cap(zoneName(d.z, lang))} ${d.c}`), lang)}.`);
      // Wie er iets wil, in één zin; zonder getallen, die staan er al.
      const willen = delen
        .map((d) => ({ d, s: statusOf(config, snapshot, d.z, lang, shadow, new Facts(lang, config.timezone)) }))
        .filter((x) => x.s.kind === 'heat' || x.s.kind === 'cool' || x.s.kind === 'wait');
      if (delen.length > 1 && willen.length === 0) out.push(nl ? 'Overal precies goed.' : 'Just right everywhere.');
      else if (willen.length > 0) {
        const namen = joinList(willen.map((x) => zoneName(x.d.z, lang)), lang);
        out.push(nl ? `${cap(namen)} ${willen.length > 1 ? 'willen' : 'wil'} nog iets; vraag waarom voor meer.` : `${cap(namen)} still ${willen.length > 1 ? 'want' : 'wants'} something; ask why for more.`);
      }
      if (e.outdoorTemperatureC != null) {
        const b = f.temp('buiten.temperatuur', e.outdoorTemperatureC);
        out.push(nl ? `Buiten is het ${b}.` : `Outside it is ${b}.`);
      }
      return done(out.join(' '));
    }

    case 'weer': {
      // Vandaag (besluit 166): het weer van de rest van de dag, en wat er van je dak komt.
      const w = ctx.weer;
      const v = w?.vandaag;
      const geen = nl ? 'Voor vandaag heb ik geen weersverwachting.' : 'I have no forecast for today.';
      if (w == null) return done(geen);
      const out: string[] = [];
      const wat = v?.tekst ? (nl ? v.tekst.charAt(0).toLowerCase() + v.tekst.slice(1) : v.tekst.toLowerCase()) : null;
      const max = v?.maxC == null ? null : f.temp('weer.vandaag.maxC', v.maxC);
      const min = v?.minC == null || max == null || v.minC === v.maxC ? null : f.temp('weer.vandaag.minC', v.minC);
      const temp = max && min ? (nl ? `tussen ${min} en ${max}` : `between ${min} and ${max}`) : max ? (nl ? `rond ${max}` : `around ${max}`) : null;
      if (wat || temp) out.push(nl ? `Vandaag is het ${[wat, temp].filter(Boolean).join(', ')}.` : `Today: ${[wat, temp].filter(Boolean).join(', ')}.`);
      if (v?.regenkansPct != null) {
        if (v.regenkansPct >= 30) {
          const r = f.pct('weer.vandaag.regenkans', v.regenkansPct);
          out.push(nl ? `De kans op regen is ${r}.` : `The chance of rain is ${r}.`);
        } else out.push(nl ? 'Waarschijnlijk blijft het droog.' : 'It will probably stay dry.');
      }
      if (w.verwachtKwh != null) {
        const k = f.energy('weer.vandaag.verwacht', w.verwachtKwh * 1000);
        const al = w.opgewektKwh >= 0.1 ? f.energy('weer.vandaag.opgewekt', w.opgewektKwh * 1000) : null;
        out.push(nl ? `Van je panelen verwacht ik vandaag ${k}${al ? `, ${al} is er al` : ''}.` : `I expect ${k} from your panels today${al ? `, ${al} so far` : ''}.`);
      }
      return done(out.length ? out.join(' ') : geen);
    }

    case 'morgen': {
      const m = ctx.weer?.morgen;
      const geen = nl ? 'Voor morgen heb ik nog geen weersverwachting.' : 'I have no forecast for tomorrow yet.';
      if (m == null) return done(geen);
      const out: string[] = [];
      const wat = m.tekst ? (nl ? m.tekst.charAt(0).toLowerCase() + m.tekst.slice(1) : m.tekst.toLowerCase()) : null;
      const max = m.maxC == null ? null : f.temp('weer.morgen.maxC', m.maxC);
      const min = m.minC == null || max == null ? null : f.temp('weer.morgen.minC', m.minC);
      const temp = max && min ? (nl ? `tussen ${min} en ${max}` : `between ${min} and ${max}`) : max ? (nl ? `tot ${max}` : `up to ${max}`) : null;
      if (wat || temp) out.push(nl ? `Morgen wordt het ${[wat, temp].filter(Boolean).join(', ')}.` : `Tomorrow: ${[wat, temp].filter(Boolean).join(', ')}.`);
      if (m.regenkansPct != null) {
        if (m.regenkansPct >= 30) {
          const r = f.pct('weer.morgen.regenkans', m.regenkansPct);
          out.push(nl ? `De kans op regen is ${r}.` : `The chance of rain is ${r}.`);
        } else out.push(nl ? 'Waarschijnlijk blijft het droog.' : 'It will probably stay dry.');
      }
      if (m.verwachtKwh != null) {
        const k = f.energy('weer.morgen.verwacht', m.verwachtKwh * 1000);
        out.push(nl ? `Van je panelen verwacht ik ${k}.` : `I expect ${k} from your panels.`);
      }
      return done(out.length ? out.join(' ') : geen);
    }

    case 'sluip': {
      // Het wat en het hoeveel, geen apparaat (besluit 88).
      const s = ctx.sluip;
      if (s == null) {
        return done(
          nl
            ? 'Dat weet ik nog niet: daarvoor heb ik minstens een week aan nachten van je slimme meter nodig.'
            : 'I do not know yet: for that I need at least a week of nights from your smart meter.',
        );
      }
      const w = f.watt('sluip.vannacht', s.vannacht.w);
      const gewoon = f.watt('sluip.gewoon', s.gewoonW);
      if (!s.hoog) {
        const gem = f.watt('sluip.gemiddeld', s.gemiddeldW);
        return done(nl ? `Vannacht ${w}, rond je gewone nacht van ${gewoon}. De laatste 30 nachten gemiddeld ${gem}.` : `Last night ${w}, around your usual night of ${gewoon}. The last 30 nights averaged ${gem}.`);
      }
      const boven = f.watt('sluip.boven', s.bovenW);
      const out = [nl ? `Vannacht ${w}. Gewoon is ${gewoon}, dus ${boven} meer.` : `Last night ${w}. Usual is ${gewoon}, so ${boven} more.`];
      if (s.reeks && s.reeks.nachten > 1) {
        const datum = new Date(`${s.reeks.sinds}T12:00:00Z`).toLocaleDateString(nl ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        out.push(nl ? `Dat al sinds ${datum}.` : `It has been like that since ${datum}.`);
      }
      if (s.scheelt?.euro != null) out.push(nl ? `Zo een jaar lang kost het zo’n ${f.euro('sluip.scheelt', s.scheelt.euro)} extra.` : `A whole year like this costs about ${f.euro('sluip.scheelt', s.scheelt.euro)} extra.`);
      else if (s.scheelt) out.push(nl ? `Zo een jaar lang is dat ${f.energy('sluip.scheelt', s.scheelt.kwh * 1000)} extra.` : `A whole year like this is ${f.energy('sluip.scheelt', s.scheelt.kwh * 1000)} extra.`);
      if (s.toelichting?.tekst) out.push(nl ? `Jij zei: ${s.toelichting.tekst}.` : `You said: ${s.toelichting.tekst}.`);
      return done(out.join(' '));
    }

    case 'kosten': {
      const k = ctx.kosten;
      const met = (k?.apparaten ?? []).filter((a) => a.euro != null && a.kwh > 0).sort((a, b) => b.euro! - a.euro!);
      // Eerst het hele huis (29 oktober 2026): "wat kost de stroom" noemde alleen de airco's.
      const h = k?.huis;
      const huis: string[] = [];
      if (k != null && h != null && h.stroomEuro != null) {
        const stroom = f.euro('kosten.huis.stroom', h.stroomEuro);
        const gas = h.gasEuro != null ? f.euro('kosten.huis.gas', h.gasEuro) : null;
        huis.push(
          nl
            ? `In ${k.maand} kostte de stroom tot nu toe ${stroom}${gas ? ` en het gas ${gas}` : ''}${h.terugKwh >= 0.5 ? ', met wat je terugleverde er al af' : ''}.`
            : `In ${k.maand} electricity has cost ${stroom} so far${gas ? ` and gas ${gas}` : ''}${h.terugKwh >= 0.5 ? ', with what you fed back already taken off' : ''}.`,
        );
        if (h.totaalEuro != null && h.totaalEuro > h.stroomEuro + (h.gasEuro ?? 0) + 0.5) {
          const totaal = f.euro('kosten.huis.totaal', h.totaalEuro);
          huis.push(nl ? `Met de vaste kosten erbij is dat ${totaal}.` : `With the fixed costs that is ${totaal}.`);
        }
      }
      if (huis.length > 0 && met.length === 0) return done(huis.join(' '));
      if (k == null || met.length === 0) {
        return done(
          nl
            ? 'Wat een apparaat kost, weet ik pas als het een eigen meter heeft en je stroomprijs bij Energie staat.'
            : 'I can only tell what a device costs once it has its own meter and your electricity price is set under Energy.',
        );
      }
      const delen = met.slice(0, 3).map((a) => {
        const naam = nl ? `de ${inSentence(a.naam)}` : `the ${a.naam}`;
        return { id: a.id, naam, kwhRuw: a.kwh, euro: f.euro(`kosten.${a.id}.euro`, a.euro!), zonDeel: a.kwh > 0 ? a.zonKwh / a.kwh : 0 };
      });
      const out: string[] = [...huis];
      if (delen.length === 1) {
        const d = delen[0]!;
        const kwh = f.energy(`kosten.${d.id}.kwh`, d.kwhRuw * 1000);
        out.push(nl ? `${cap(d.naam)} kostte in ${k.maand} ${d.euro}, voor ${kwh}.` : `${cap(d.naam)} cost ${d.euro} in ${k.maand}, for ${kwh}.`);
      } else {
        out.push(
          huis.length
            ? nl ? `Daarvan ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.` : `Of that, ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.`
            : nl ? `In ${k.maand} kostte ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.` : `In ${k.maand}: ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.`,
        );
      }
      const zuinig = delen.filter((d) => d.zonDeel >= 0.6).map((d) => d.naam);
      if (zuinig.length) out.push(nl ? `${cap(joinList(zuinig, lang))} draaide${zuinig.length > 1 ? 'n' : ''} vooral op je eigen zon.` : `${cap(joinList(zuinig, lang))} ran mostly on your own sun.`);
      if (huis.length) out.push(nl ? 'Bij de apparaten reken ik alleen wat van het net kwam.' : 'For the devices I only count what came from the grid.');
      else out.push(nl ? 'Ik reken alleen wat van het net kwam.' : 'I only count what came from the grid.');
      return done(out.join(' '));
    }

    case 'thuis': {
      if (snapshot == null) return letterlijk(noDecision(lang));
      if (config.occupancy.length === 0) {
        return done(nl ? 'Dat zie ik niet: er is geen aanwezigheid gekoppeld.' : 'I cannot see that: no presence is linked.');
      }
      // Met bewoners op naam, na de rust van tien minuten (besluit 147); anders alleen of er iemand is.
      const p = snapshot.explanation.profile;
      const namen = p ? p.home.map((id) => config.profiles?.find((x) => x.id === id)?.name).filter((n): n is string => n != null) : [];
      if (namen.length > 0) {
        return done(nl ? `${joinList(namen, lang)} ${namen.length > 1 ? 'zijn' : 'is'} thuis.` : `${joinList(namen, lang)} ${namen.length > 1 ? 'are' : 'is'} home.`);
      }
      return done(
        snapshot.explanation.occupied
          ? nl ? 'Ja, er is iemand thuis.' : 'Yes, someone is home.'
          : nl ? 'Er is nu niemand thuis.' : 'Nobody is home right now.',
      );
    }

    case 'terug': {
      const t = ctx.today;
      const h = ctx.kosten?.huis;
      if (t == null && h == null) return done(NO_DAY[lang]);
      const out: string[] = [];
      if (t != null) {
        out.push(
          t.netTerugWh >= 5
            ? nl ? `Vandaag ging er ${f.energy('vandaag.netTerugWh', t.netTerugWh)} terug naar het net.` : `Today ${f.energy('vandaag.netTerugWh', t.netTerugWh)} went back to the grid.`
            : nl ? 'Vandaag ging er nog niets terug naar het net.' : 'Nothing has gone back to the grid yet today.',
        );
      }
      if (h != null && ctx.kosten != null && h.terugKwh >= 0.5) {
        const m = f.energy('kosten.huis.terugKwh', h.terugKwh * 1000);
        out.push(nl ? `In ${ctx.kosten.maand} tot nu toe ${m}.` : `In ${ctx.kosten.maand} so far ${m}.`);
      }
      return done(out.join(' '));
    }

    case 'draait': {
      // De apparaten die op zon wachten (besluit 98): alleen die ziet het huis draaien.
      const lijst = config.deferrables ?? [];
      const gewoon = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const gevraagd = question.apparaat;
      const dit = lijst.filter((a) => gevraagd === '' || gewoon(a.name).includes(gewoon(gevraagd)) || gewoon(gevraagd).includes(gewoon(a.name)) || a.id === gevraagd);
      if (dit.length === 0) {
        const ken = joinList(lijst.map((a) => (nl ? `de ${inSentence(a.name)}` : `the ${a.name}`)), lang);
        return letterlijk(
          nl
            ? `${gevraagd ? `De ${gevraagd}` : 'Dat apparaat'} zie ik niet${lijst.length ? `; ik volg alleen ${ken}` : ': ik volg geen apparaten die op zon wachten'}.`
            : `I cannot see ${gevraagd ? `the ${gevraagd}` : 'that appliance'}${lijst.length ? `; I only follow ${ken}` : ': I do not follow any appliances that wait for sun'}.`,
        );
      }
      if (snapshot == null) return letterlijk(noDecision(lang));
      const zinnen = dit.map((a) => {
        const naam = nl ? `de ${inSentence(a.name)}` : `the ${a.name}`;
        const x = snapshot.explanation.deferrables?.find((d) => d.id === a.id);
        if (x == null || x.state === 'unknown') return nl ? `Hoe het met ${naam} staat, kan ik nu niet lezen.` : `I cannot read how ${naam} is doing right now.`;
        if (x.doneSinceMs != null) return nl ? `${cap(naam)} is klaar.` : `${cap(naam)} is done.`;
        if (x.state === 'running') {
          const min = x.remainingMin != null && x.remainingMin > 0 ? f.count(`apparaat.${a.id}.nogMin`, x.remainingMin) : null;
          const nog = min ? (nl ? `, nog ${min} minuten` : `, ${min} more minutes`) : '';
          return nl ? `${cap(naam)} draait${nog}.` : `${cap(naam)} is running${nog}.`;
        }
        if (x.state === 'waiting' || x.state === 'would_start') return nl ? `${cap(naam)} staat klaar en wacht op zon.` : `${cap(naam)} is ready and waiting for sun.`;
        return nl ? `${cap(naam)} draait niet.` : `${cap(naam)} is not running.`;
      });
      return done(zinnen.join(' '));
    }

    case 'doe': {
      const wait = nl
        ? shadow ? 'Schakelen mag ik nog niet, dus zet het nu even zelf.' : 'Opdrachten neem ik nog niet aan.'
        : shadow ? 'I may not switch anything yet, so please set it yourself for now.' : 'I do not take commands yet.';
      // Geen kamer in de vraag (29 oktober 2026): met één kamer die het kan, die; anders vragen welke.
      let zone: Zone | undefined;
      if (question.kamer === '') {
        const kan = config.zones.filter((z) => actuatorsOf(config, z).some((a) => question.wens === 'koelen' || question.wens === 'drogen' ? a.capabilities.canCool : question.wens === 'verwarmen' ? a.capabilities.canHeat : true));
        if (kan.length !== 1) {
          const plekken = kan.map((z) => zoneName(z, lang));
          const welke = plekken.length > 1 ? `${plekken.slice(0, -1).join(', ')} ${nl ? 'of' : 'or'} ${plekken.at(-1)}` : plekken.join('');
          if (kan.length === 0) return letterlijk(wait);
          // Als keuzes (besluit 209): de zin die de woordzoeker dan zelf verstaat.
          const werkwoord = question.wens === 'verwarmen' ? (nl ? 'verwarm' : 'heat') : question.wens === 'koelen' ? (nl ? 'koel' : 'cool') : null;
          const keuze = werkwoord && kan.length <= 4 ? kan.map((z) => ({ label: cap(z.name), tekst: `${werkwoord} ${z.name}` })) : undefined;
          return { ...letterlijk(nl ? `Welke kamer bedoel je: ${welke}?` : `Which room do you mean: ${welke}?`), ...(keuze ? { keuze } : {}) };
        }
        zone = kan[0];
      } else zone = findZone(config, question.kamer);
      if (zone == null) return letterlijk(unknownRoom(config, question.kamer, lang));
      const w = WORDS[lang];
      const devices = actuatorsOf(config, zone);
      const zn = zoneName(zone, lang);

      if (question.wens === 'uit') {
        const names = joinList(devices.map((a) => deviceName(a, lang)), lang);
        return done(nl ? `Dan zou ik ${names} uitzetten. ${wait}` : `Then I would switch off ${names}. ${wait}`, zone.id);
      }

      // Aan zonder meer: wat de kamer nodig heeft, of wat het apparaat alleen kan.
      let wens = question.wens;
      if (wens === 'aan') {
        const pz = snapshot?.explanation.perZone.find((p) => p.zoneId === zone.id);
        const kanWarm = devices.some((a) => a.capabilities.canHeat);
        const kanKoel = devices.some((a) => a.capabilities.canCool);
        const buiten = snapshot?.explanation.outdoorTemperatureC ?? null;
        const kouder = pz?.temperatureC != null && pz.targetC != null ? pz.temperatureC < pz.targetC : buiten != null ? buiten < 15 : true;
        wens = kanWarm && (!kanKoel || kouder) ? 'verwarmen' : 'koelen';
      }
      // Via de knoppen van het oude systeem (besluit 210), als de brug aan staat en over deze kamer gaat.
      if ((wens === 'verwarmen' || wens === 'koelen') && ctx.brug) {
        const b = ctx.brug(wens, zone.id, question.temperatuurC, lang);
        if (b?.ok) return { vraag: 'doe', taal: lang, kamer: zone.id, antwoord: b.antwoord, feiten: b.feiten, opdracht: b.opdracht, gedaan: b.gedaan };
        if (b) return letterlijk(b.antwoord, zone.id);
      }
      const heat = wens === 'verwarmen';
      // Drogen kan wat kan koelen: een airco.
      const able = devices.filter((a) => (heat ? a.capabilities.canHeat : a.capabilities.canCool));
      // Verwarmen eerst met wat de basiswarmte levert; koelen kan alleen een airco.
      const device = able.find((a) => a.role === 'primary') ?? able[0];
      if (device == null) {
        return done(nl ? `${cap(zn)} heeft geen apparaat dat kan ${w.wish[wens]}.` : `${cap(zn)} has no unit that can ${w.wish[wens]}.`, zone.id);
      }
      const dn = deviceName(device, lang);
      let target = '';
      // Drogen heeft geen doel.
      if (question.temperatuurC != null && wens !== 'drogen') {
        const [min, max] = device.capabilities.setpointRange;
        if (question.temperatuurC < min || question.temperatuurC > max) {
          const asked = f.temp('vraag.temperatuur', question.temperatuurC);
          const lo = f.temp(`apparaat.${device.id}.minimum`, min);
          const hi = f.temp(`apparaat.${device.id}.maximum`, max);
          return done(nl ? `${asked} kan ${dn} niet: hij gaat van ${lo} tot ${hi}.` : `${dn} cannot do ${asked}: its range is ${lo} to ${hi}.`, zone.id);
        }
        target = f.temp('vraag.temperatuur', question.temperatuurC);
      }
      const what = nl ? `${dn} op ${w.wish[wens]}${target ? ` naar ${target}` : ''}` : `${dn} to ${w.wish[wens]}${target ? ` at ${target}` : ''}`;
      return done(nl ? `Dan zou ik ${what} zetten, tot het volgende dagdeel. ${wait}` : `Then I would set ${what}, until the next part of the day. ${wait}`, zone.id);
    }
  }
}

/* ------------------------------------------------- de stand per kamer, kort */

/*
 * Het bewonerscontract (76, 94): per kamer de soort, een korte stand voor de
 * kaart ("Wacht op meer zon"), de lange zin van de assistent, en wat het echte
 * apparaat doet. Uitgerekend in de dienst, zodat de pagina alleen toont.
 */

export const SHORT = {
  nl: {
    failsafe: 'Storing: veilig gezet',
    taken: 'Jij hebt het overgenomen',
    takenUntil: (t: string) => `Jij hebt het tot ${t}`,
    run: { cool: 'Koelt', heat: 'Verwarmt' },
    // Tijdens de schaduw doet het apparaat het niet echt: "zou" (besluit 124).
    wouldRun: { cool: 'Zou koelen', heat: 'Zou verwarmen' },
    onSun: ' op zon',
    parked: 'Staat klaar om verder te gaan',
    noMeasurement: 'Geen meting',
    waitSun: 'Wacht op meer zon',
    // De zon is nog niet op, of komt vandaag niet meer (25 oktober 2026).
    waitSunOp: 'Op zon zodra hij op is',
    waitSunMorgen: 'Morgen weer op zon',
    wait: (why: string) => `Wacht: ${why}`,
    ok: 'Op temperatuur',
    idle: 'Niets te doen',
    idleWhy: (why: string) => `Niets te doen: ${why}`,
    off: 'uit',
    block: {
      min_run_not_elapsed: 'draait nog even door',
      min_rest_not_elapsed: 'pauzeert even na het uitgaan',
      stabilisation_active: 'wacht tot het verbruik stabiel is',
      settling_after_switch: 'is net van stand gewisseld',
      insufficient_power_budget: 'te weinig zon over',
      start_threshold_not_met: 'net te weinig zon om te starten',
      capability_missing: 'het apparaat kan dit niet',
      setpoint_out_of_range: 'doel buiten bereik van het apparaat',
      superseded_by_higher_priority: 'een andere kamer ging voor',
      no_change_needed: 'niets te veranderen',
      resident_override: 'jij hebt het overgenomen',
      insufficient_current_budget: 'de hoofdzekering zou te zwaar belast worden',
    } satisfies Record<BlockCode, string>,
    reason: {
      zone_below_setpoint: 'onder het doel',
      zone_above_setpoint: 'boven het doel',
      zone_satisfied: 'op temperatuur',
      buffering_free_energy: 'zon over, dus alvast op voorraad',
      surplus_available: 'er is zon over',
      surplus_insufficient: 'te weinig zon over',
      importing_from_grid: 'het huis haalt stroom van het net',
      outside_active_hours: 'buiten de actieve uren',
      mode_excludes_action: 'past niet bij deze modus',
      nobody_home: 'niemand thuis',
      failsafe_unreliable_input: 'een meting is onbetrouwbaar',
    } satisfies Record<ReasonCode, string>,
    action: { cool: 'koelen', heat: 'verwarmen', standby: 'geparkeerd', off: 'uit' } as Record<string, string>,
    towards: 'naar',
  },
  en: {
    failsafe: 'Fault: put in a safe state',
    taken: 'You took it over',
    takenUntil: (t: string) => `You have it until ${t}`,
    run: { cool: 'Cooling', heat: 'Heating' },
    wouldRun: { cool: 'Would cool', heat: 'Would heat' },
    onSun: ' on solar',
    parked: 'Parked, ready to resume',
    noMeasurement: 'No measurement',
    waitSun: 'Waiting for more sun',
    waitSunOp: 'On solar once the sun is up',
    waitSunMorgen: 'On solar again tomorrow',
    wait: (why: string) => `Waiting: ${why}`,
    ok: 'At temperature',
    idle: 'Nothing to do',
    idleWhy: (why: string) => `Nothing to do: ${why}`,
    off: 'off',
    block: {
      min_run_not_elapsed: 'must finish its minimum run time',
      min_rest_not_elapsed: 'must rest for a moment',
      stabilisation_active: 'waiting for the power use to settle',
      settling_after_switch: 'settling after a switch',
      insufficient_power_budget: 'too little solar to spare',
      start_threshold_not_met: 'just too little solar to start',
      capability_missing: 'the unit cannot do this',
      setpoint_out_of_range: 'target outside the unit range',
      superseded_by_higher_priority: 'another room came first',
      no_change_needed: 'nothing to change',
      resident_override: 'you took it over',
      insufficient_current_budget: 'the main fuse would be overloaded',
    } satisfies Record<BlockCode, string>,
    reason: {
      zone_below_setpoint: 'below target',
      zone_above_setpoint: 'above target',
      zone_satisfied: 'at temperature',
      buffering_free_energy: 'storing free solar as cooling or heat',
      surplus_available: 'solar to spare',
      surplus_insufficient: 'too little solar to spare',
      importing_from_grid: 'the house is drawing from the grid',
      outside_active_hours: 'outside active hours',
      mode_excludes_action: 'does not fit this mode',
      nobody_home: 'nobody home',
      failsafe_unreliable_input: 'a measurement is unreliable',
    } satisfies Record<ReasonCode, string>,
    action: { cool: 'cooling', heat: 'heating', standby: 'parked', off: 'off' } as Record<string, string>,
    towards: 'at',
  },
} as const;

export interface ResidentRoom {
  readonly zoneId: string;
  readonly soort: RoomKind;
  /** De korte stand voor de kaart. */
  readonly kort: string;
  /** De zin van de assistent, met de getallen. */
  readonly zin: string;
  /** Wat de apparaten van de kamer werkelijk doen, of "uit". */
  readonly echt: string;
  /** Het apparaat dat draait volgens het besluit, voor de stromen in de tekening. */
  readonly actuatorId: string | null;
  /**
   * Doet het echte apparaat al wat het besluit wil (besluit 188)? Dan zegt de
   * kamer in de schaduw "Verwarmt" in plaats van "Zou verwarmen": dat klopt met
   * wat er in huis gebeurt, ook al regelt de oude regeling het.
   */
  readonly klopt: boolean;
}

function shortStatusOf(
  config: SiteConfig,
  snap: DecisionView,
  zone: Zone,
  lang: Lang,
  shadow = true,
): { soort: RoomKind; kort: string; actuatorId: string | null; klopt?: boolean } {
  const w = SHORT[lang];
  const e = snap.explanation;
  const ids = new Set(zone.actuatorIds);
  const pz = e.perZone.find((z) => z.zoneId === zone.id);
  if (e.failsafe.active) return { soort: 'bad', kort: w.failsafe, actuatorId: null };
  const taken = (e.overrides ?? []).find((o) => ids.has(o.actuatorId));
  if (taken) {
    if (taken.untilMs == null) return { soort: 'wait', kort: w.taken, actuatorId: null };
    const t = new Intl.DateTimeFormat(lang === 'nl' ? 'nl-NL' : 'en-GB', {
      timeZone: config.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(taken.untilMs);
    return { soort: 'wait', kort: w.takenUntil(t), actuatorId: null };
  }
  const mine = snap.accepted.filter((i) => ids.has(i.actuatorId));
  const running = mine.find((i) => i.action === 'cool' || i.action === 'heat');
  if (running && (running.action === 'cool' || running.action === 'heat')) {
    const onSun = running.strategyId === 'pv-surplus';
    // Doet het apparaat het al echt (de oude regeling), dan geen "zou" (besluit 188). Zegt het
    // apparaat wat het doet, dan moet het ook echt stoken of koelen: een Nest op "verwarmen
    // naar 20°" die stil staat, verwarmt niet (25 oktober 2026, de wand zei het wel).
    const doet = snap.observedAction?.[running.actuatorId];
    const klopt = (snap.observed[running.actuatorId] ?? '').split('@')[0] === running.action && (doet == null || doet === (running.action === 'heat' ? 'heating' : 'cooling'));
    return { soort: running.action, kort: `${(shadow && !klopt ? w.wouldRun : w.run)[running.action]}${onSun ? w.onSun : ''}`, actuatorId: running.actuatorId, klopt };
  }
  if (mine.some((i) => i.action === 'standby')) return { soort: 'wait', kort: w.parked, actuatorId: null };
  const wanting = pz != null && pz.demand !== 'none';
  const blocked = snap.rejected.find((r) => r.intent.zoneId === zone.id);
  if (blocked && wanting) {
    const zon = snap.zonNu === 'weg' ? w.waitSunMorgen : snap.zonNu === 'nog' ? w.waitSunOp : w.waitSun;
    const kort = blocked.blockedBy === 'insufficient_power_budget' ? zon : w.wait(w.block[blocked.blockedBy]);
    return { soort: 'wait', kort, actuatorId: null };
  }
  if (pz == null || pz.temperatureC == null) return { soort: 'bad', kort: w.noMeasurement, actuatorId: null };
  if (pz.reason === 'zone_satisfied') {
    return pz.targetC == null ? { soort: 'idle', kort: w.idle, actuatorId: null } : { soort: 'ok', kort: w.ok, actuatorId: null };
  }
  if (wanting) return { soort: 'idle', kort: w.idleWhy(w.reason[pz.reason]), actuatorId: null };
  return { soort: 'idle', kort: w.idle, actuatorId: null };
}

/** "Airco woonkamer koelen naar 22°", of "uit" als niets van de kamer aan staat. */
function realShort(config: SiteConfig, snap: DecisionView, zone: Zone, lang: Lang): string {
  const w = SHORT[lang];
  const parts: string[] = [];
  for (const a of actuatorsOf(config, zone)) {
    const [state = '', sp] = (snap.observed[a.id] ?? '').split('@');
    if (state === '' || state === 'off' || state === 'onbekend' || state === 'unavailable' || state === 'unknown') continue;
    const word = w.action[state] ?? state;
    const n = sp == null ? NaN : Number(sp);
    const at = Number.isFinite(n) ? ` ${w.towards} ${lang === 'nl' ? String(Math.round(n * 10) / 10).replace('.', ',') : String(Math.round(n * 10) / 10)}°` : '';
    parts.push(`${a.name} ${word}${at}`);
  }
  return parts.length === 0 ? w.off : parts.join(', ');
}

export function residentRooms(config: SiteConfig, snap: DecisionView, lang: Lang = 'nl', shadow = true): ResidentRoom[] {
  return config.zones.map((zone) => {
    const s = shortStatusOf(config, snap, zone, lang, shadow);
    return {
      zoneId: zone.id,
      soort: s.soort,
      kort: s.kort,
      zin: roomStatus(config, snap, zone, lang, shadow).zin,
      echt: realShort(config, snap, zone, lang),
      actuatorId: s.actuatorId,
      klopt: s.klopt === true,
    };
  });
}
