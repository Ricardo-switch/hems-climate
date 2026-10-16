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
import type { Explanation, ReasonCode, BlockCode } from '../core/decision.js';
import { actuatorsOf, isHandsOff } from '../core/model.js';
import type { Actuator, Mode, SiteConfig, Zone } from '../core/model.js';
import type { TodayReport } from './today.js';
import { startOfLocalDay } from './today.js';

/** Wat de assistent van een besluit nodig heeft; `LiveSnapshot` voldoet. */
export interface DecisionView {
  readonly atMs: number;
  readonly explanation: Explanation;
  readonly commands: readonly Command[];
  readonly accepted: readonly Intent[];
  readonly rejected: readonly RejectedIntent[];
  /** Wat de apparaten werkelijk deden, als `cool@22`, op actuator-id. */
  readonly observed: Readonly<Record<string, string>>;
}

export const LANGS = ['nl', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const QUESTION_KINDS = ['nu', 'waarom', 'straks', 'zon', 'doe', 'vandaag', 'warm', 'morgen', 'kosten'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export type Wish = 'koelen' | 'verwarmen' | 'drogen' | 'uit';

export type Question =
  | { readonly kind: 'nu' }
  | { readonly kind: 'waarom'; readonly kamer: string }
  | { readonly kind: 'straks' }
  | { readonly kind: 'zon' }
  /** Wat het huis vandaag deed (besluit 141). */
  | { readonly kind: 'vandaag' }
  /** Hoe warm het overal is (besluit 141). */
  | { readonly kind: 'warm' }
  /** Het weer en de zon van morgen (besluit 142). */
  | { readonly kind: 'morgen' }
  /** Wat de apparaten met een meter deze maand kostten (besluit 142). */
  | { readonly kind: 'kosten' }
  | {
      readonly kind: 'doe';
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
}

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
  } | null;
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
    return lang === 'nl' ? `Vandaag komt er weinig zon meer bij; morgen verwacht ik ${k} van je dak.` : `Little more sun today; tomorrow I expect ${k} from your roof.`;
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
    case 'morgen':
    case 'kosten':
      return { ok: true, lang, question: { kind: v } };
    case 'waarom':
      if (kamer === '') return { ok: false, reden: 'waarom vraagt een kamer' };
      return { ok: true, lang, question: { kind: 'waarom', kamer } };
    case 'doe': {
      if (kamer === '') return { ok: false, reden: 'doe vraagt een kamer' };
      const wens = WISHES[(params.get('wens') ?? '').trim().toLowerCase()];
      if (wens == null) return { ok: false, reden: 'wens moet koelen, verwarmen, drogen of uit zijn' };
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
    wish: { koelen: 'koelen', verwarmen: 'verwarmen', drogen: 'drogen', uit: 'uit' } satisfies Record<Wish, string>,
    doing: { cool: 'koelt', heat: 'verwarmt' },
    infinitive: { cool: 'koelen', heat: 'verwarmen' },
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
    wish: { koelen: 'cool', verwarmen: 'heat', drogen: 'dry', uit: 'off' } satisfies Record<Wish, string>,
    doing: { cool: 'is cooling', heat: 'is heating' },
    infinitive: { cool: 'cool', heat: 'heat' },
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
 * het eerste woord een gewoon woord is: "Slaapkamer Mylan" wordt "slaapkamer
 * Mylan" en "Nest (beneden)" blijft "Nest (beneden)". Een merk of een naam
 * houdt zijn hoofdletter.
 */
const COMMON = /^(airco|thermostaat|zolder|woonkamer|badkamer|keuken|slaapkamer|kamer|hal|overloop|kantoor|werkkamer|hobbykamer|wasruimte|bijkeuken|eetkamer|kinderkamer|logeerkamer|zithoek|studeerkamer|berging|garage|kelder|zone|lamp|screen|zonnescherm|droger|wasmachine|vaatwasser|verwarming|vloerverwarming|radiator|ventilatie|warmtepomp|boiler|voorgevel|achtergevel|zijgevel|gevel)\b/i;

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
  return lang === 'nl' ? `de ${inSentence(name)}` : `the ${name}`;
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
    const why = blocked ? w.block[blocked.blockedBy] : w.reason[pz.reason];
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

  switch (question.kind) {
    case 'nu': {
      if (snapshot == null) return done(noDecision(lang));
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
        if (said.length === 0) out.push(nl ? 'Het is rustig: geen kamer heeft nu iets nodig.' : 'All quiet: no room needs anything right now.');
        for (const s of said) {
          out.push(s.zin);
          f.merge(s.own);
        }
      }
      // Een kamer die op zon draait, noemde de panelen al.
      const saidSun = f.list.some((x) => x.bron === 'zon.vermogen');
      const power = powerSentence(f, e, lang, !saidSun);
      if (power) out.push(power);
      if (shadow) out.push(nl ? 'Zelf schakel ik nog niets: ik kijk mee en leer je huis kennen.' : 'I do not switch anything myself yet: I watch and learn your house.');
      return done(out.join(' '));
    }

    case 'waarom': {
      const zone = findZone(config, question.kamer);
      if (zone == null) return done(unknownRoom(config, question.kamer, lang));
      if (snapshot == null) return done(noDecision(lang), zone.id);
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
        out.push(nl ? `Je dak leverde ${zon}, en ${zelf} daarvan gebruikte je zelf.` : `Your roof produced ${zon}, and you used ${zelf} of it yourself.`);
      }
      return done(out.join(' '));
    }

    case 'warm': {
      if (snapshot == null) return done(noDecision(lang));
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
        out.push(nl ? `Van je dak verwacht ik ${k}.` : `I expect ${k} from your roof.`);
      }
      return done(out.length ? out.join(' ') : geen);
    }

    case 'kosten': {
      const k = ctx.kosten;
      const met = (k?.apparaten ?? []).filter((a) => a.euro != null && a.kwh > 0).sort((a, b) => b.euro! - a.euro!);
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
      const out: string[] = [];
      if (delen.length === 1) {
        const d = delen[0]!;
        const kwh = f.energy(`kosten.${d.id}.kwh`, d.kwhRuw * 1000);
        out.push(nl ? `${cap(d.naam)} kostte in ${k.maand} ${d.euro}, voor ${kwh}.` : `${cap(d.naam)} cost ${d.euro} in ${k.maand}, for ${kwh}.`);
      } else {
        out.push(nl ? `In ${k.maand} kostte ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.` : `In ${k.maand}: ${joinList(delen.map((d) => `${d.naam} ${d.euro}`), lang)}.`);
      }
      const zuinig = delen.filter((d) => d.zonDeel >= 0.6).map((d) => d.naam);
      if (zuinig.length) out.push(nl ? `${cap(joinList(zuinig, lang))} draaide${zuinig.length > 1 ? 'n' : ''} vooral op je eigen zon.` : `${cap(joinList(zuinig, lang))} ran mostly on your own sun.`);
      out.push(nl ? 'Ik reken alleen wat van het net kwam.' : 'I only count what came from the grid.');
      return done(out.join(' '));
    }

    case 'doe': {
      const zone = findZone(config, question.kamer);
      if (zone == null) return done(unknownRoom(config, question.kamer, lang));
      const w = WORDS[lang];
      const devices = actuatorsOf(config, zone);
      const zn = zoneName(zone, lang);
      const wait = nl
        ? shadow ? 'Schakelen mag ik nog niet, dus zet het nu even zelf.' : 'Opdrachten neem ik nog niet aan.'
        : shadow ? 'I may not switch anything yet, so please set it yourself for now.' : 'I do not take commands yet.';

      if (question.wens === 'uit') {
        const names = joinList(devices.map((a) => deviceName(a, lang)), lang);
        return done(nl ? `Dan zou ik ${names} uitzetten. ${wait}` : `Then I would switch off ${names}. ${wait}`, zone.id);
      }

      const heat = question.wens === 'verwarmen';
      // Drogen kan wat kan koelen: een airco.
      const able = devices.filter((a) => (heat ? a.capabilities.canHeat : a.capabilities.canCool));
      // Verwarmen eerst met wat de basiswarmte levert; koelen kan alleen een airco.
      const device = able.find((a) => a.role === 'primary') ?? able[0];
      if (device == null) {
        return done(nl ? `${cap(zn)} heeft geen apparaat dat kan ${w.wish[question.wens]}.` : `${cap(zn)} has no unit that can ${w.wish[question.wens]}.`, zone.id);
      }
      const dn = deviceName(device, lang);
      let target = '';
      // Drogen heeft geen doel.
      if (question.temperatuurC != null && question.wens !== 'drogen') {
        const [min, max] = device.capabilities.setpointRange;
        if (question.temperatuurC < min || question.temperatuurC > max) {
          const asked = f.temp('vraag.temperatuur', question.temperatuurC);
          const lo = f.temp(`apparaat.${device.id}.minimum`, min);
          const hi = f.temp(`apparaat.${device.id}.maximum`, max);
          return done(nl ? `${asked} kan ${dn} niet: hij gaat van ${lo} tot ${hi}.` : `${dn} cannot do ${asked}: its range is ${lo} to ${hi}.`, zone.id);
        }
        target = f.temp('vraag.temperatuur', question.temperatuurC);
      }
      const what = nl ? `${dn} op ${w.wish[question.wens]}${target ? ` naar ${target}` : ''}` : `${dn} to ${w.wish[question.wens]}${target ? ` at ${target}` : ''}`;
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
}

function shortStatusOf(
  config: SiteConfig,
  snap: DecisionView,
  zone: Zone,
  lang: Lang,
  shadow = true,
): { soort: RoomKind; kort: string; actuatorId: string | null } {
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
    return { soort: running.action, kort: `${(shadow ? w.wouldRun : w.run)[running.action]}${onSun ? w.onSun : ''}`, actuatorId: running.actuatorId };
  }
  if (mine.some((i) => i.action === 'standby')) return { soort: 'wait', kort: w.parked, actuatorId: null };
  const wanting = pz != null && pz.demand !== 'none';
  const blocked = snap.rejected.find((r) => r.intent.zoneId === zone.id);
  if (blocked && wanting) {
    const kort = blocked.blockedBy === 'insufficient_power_budget' ? w.waitSun : w.wait(w.block[blocked.blockedBy]);
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
    };
  });
}
