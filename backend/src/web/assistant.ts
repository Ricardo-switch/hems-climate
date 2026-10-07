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
import { isHandsOff } from '../core/model.js';
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

export const QUESTION_KINDS = ['nu', 'waarom', 'straks', 'zon', 'doe'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export type Wish = 'koelen' | 'verwarmen' | 'uit';

export type Question =
  | { readonly kind: 'nu' }
  | { readonly kind: 'waarom'; readonly kamer: string }
  | { readonly kind: 'straks' }
  | { readonly kind: 'zon' }
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
}

/** "De zon staat nu op de voorgevel." Zonder getallen: de gevels hebben namen. */
function facadeSentence(zoninval: AskContext['zoninval'], lang: Lang): string | null {
  if (zoninval == null || !zoninval.boven) return null;
  const list = zoninval.gevels.map((n) => (lang === 'nl' ? `de ${n.toLowerCase()}` : `the ${n.toLowerCase()}`));
  if (list.length === 0) {
    return lang === 'nl' ? 'De zon staat nu op geen van de gevels.' : 'The sun is not on any of the facades right now.';
  }
  const joined = list.join(lang === 'nl' ? ' en ' : ' and ');
  return lang === 'nl' ? `De zon staat nu op ${joined}.` : `The sun is on ${joined} right now.`;
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
      return { ok: true, lang, question: { kind: v } };
    case 'waarom':
      if (kamer === '') return { ok: false, reden: 'waarom vraagt een kamer' };
      return { ok: true, lang, question: { kind: 'waarom', kamer } };
    case 'doe': {
      if (kamer === '') return { ok: false, reden: 'doe vraagt een kamer' };
      const wens = WISHES[(params.get('wens') ?? '').trim().toLowerCase()];
      if (wens == null) return { ok: false, reden: 'wens moet koelen, verwarmen of uit zijn' };
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
    wish: { koelen: 'koelen', verwarmen: 'verwarmen', uit: 'uit' } satisfies Record<Wish, string>,
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
      min_run_not_elapsed: 'het apparaat eerst zijn minimale draaitijd moet halen',
      min_rest_not_elapsed: 'het apparaat eerst even moet rusten',
      stabilisation_active: 'ik wacht tot het verbruik stabiel is',
      settling_after_switch: 'het apparaat na een wissel nog tot rust komt',
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
    wish: { koelen: 'cool', verwarmen: 'heat', uit: 'off' } satisfies Record<Wish, string>,
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

/** "Zolder" → "de zolder"; in het Engels de naam zoals hij is. */
function zoneName(zone: Zone, lang: Lang): string {
  return lang === 'nl' ? `de ${zone.name.toLowerCase()}` : `the ${zone.name}`;
}

function deviceName(actuator: Actuator, lang: Lang): string {
  return lang === 'nl' ? `de ${actuator.name.toLowerCase()}` : `the ${actuator.name}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actuatorsOf(config: SiteConfig, zone: Zone): Actuator[] {
  return zone.actuatorIds
    .map((id) => config.actuators.find((a) => a.id === id))
    .filter((a): a is Actuator => a != null);
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

/** "het is er 24,3°, het doel is 24°" — of minder, als er iets ontbreekt. */
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
  return parts.join(', ');
}

/** Wat er van het net komt of teruggaat, als losse zin. */
function gridSentence(f: Facts, e: Explanation, lang: Lang): string | null {
  const g = e.budget.gridPowerW;
  if (!Number.isFinite(g)) return null;
  if (Math.abs(g) < 50) return lang === 'nl' ? 'Er gaat nu vrijwel niets naar of van het net.' : 'Almost nothing goes to or from the grid right now.';
  const p = f.power('budget.netvermogen', g);
  if (g < 0) return lang === 'nl' ? `Er gaat nu ${p} terug naar het net.` : `${cap(p)} is going back to the grid right now.`;
  return lang === 'nl' ? `Het huis haalt nu ${p} van het net.` : `The house is drawing ${p} from the grid right now.`;
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
    const until =
      taken.untilMs == null
        ? lang === 'nl'
          ? 'tot je hem teruggeeft'
          : 'until you hand it back'
        : `${lang === 'nl' ? 'tot' : 'until'} ${f.time(`ingreep.${taken.actuatorId}.tot`, taken.untilMs)}`;
    return {
      kind: 'wait',
      zin:
        lang === 'nl'
          ? `Je hebt ${dn} zelf overgenomen, ${until}. Ik laat hem met rust.`
          : `You took over ${dn} yourself, ${until}. I am leaving it alone.`,
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
      sun = lang === 'nl' ? `De panelen leveren ${p}.` : `The panels are producing ${p}.`;
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
          ? `${cap(dn)} ${shadow ? 'zou ik parkeren' : 'staat geparkeerd'}, omdat ${w.reason[parked.reason]}. Komt er genoeg terug, dan gaat hij verder.`
          : `${shadow ? `I would park ${dn}` : `${cap(dn)} is parked`}, because ${w.reason[parked.reason]}. If enough comes back, it carries on.`,
    };
  }

  if (pz == null || pz.temperatureC == null) {
    return {
      kind: 'bad',
      zin: lang === 'nl' ? `Ik heb geen meting van ${zn}.` : `I have no measurement for ${zn}.`,
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
        ? `${cap(zn)} wil ${w.infinitive[a]} (${temps}), maar dat kan nu niet, omdat ${why}.`
        : `${cap(zn)} wants to ${w.infinitive[a]} (${temps}), but that has to wait, because ${why}.`;
    return { kind: 'wait', zin: grid ? `${head} ${grid}` : head };
  }

  // Geen vraag: de kamer zit tussen het doel voor verwarmen en dat voor koelen.
  const t = f.temp(`zone.${zone.id}.temperatuur`, pz.temperatureC);
  const heatC = pz.heatTargetC ?? (pz.coolTargetC === undefined ? pz.targetC : null);
  const coolC = pz.coolTargetC ?? null;
  if (heatC == null && coolC == null) {
    return {
      kind: 'idle',
      zin:
        lang === 'nl'
          ? `Voor ${zn} is er nu geen doel; het is er ${t}.`
          : `There is no target for ${zn} right now; it is ${t}.`,
    };
  }
  const h = heatC == null ? null : f.temp(`zone.${zone.id}.doelVerwarmen`, heatC);
  const c = coolC == null ? null : f.temp(`zone.${zone.id}.doelKoelen`, coolC);
  const band =
    lang === 'nl'
      ? h && c
        ? `tussen het doel voor verwarmen (${h}) en dat voor koelen (${c})`
        : h
          ? `en het doel voor verwarmen is ${h}`
          : `en het doel voor koelen is ${c}`
      : h && c
        ? `between the heating target (${h}) and the cooling target (${c})`
        : h
          ? `and the heating target is ${h}`
          : `and the cooling target is ${c}`;
  return {
    kind: 'ok',
    zin:
      lang === 'nl'
        ? `${cap(zn)} heeft niets nodig: het is er ${t}, ${band}.`
        : `${cap(zn)} needs nothing: it is ${t}, ${band}.`,
  };
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
          ? `staat ${dn} uit`
          : `staat ${dn} op ${word}${setpoint ? ` naar ${setpoint}` : ''}`
        : state === 'off'
          ? `${dn} is off`
          : `${dn} is set to ${word}${setpoint ? ` at ${setpoint}` : ''}`,
    );
  }
  const out: string[] = [];
  if (known.length > 0) {
    out.push(
      lang === 'nl'
        ? `In werkelijkheid ${known.join(', en ')}.`
        : `In reality, ${known.join(', and ')}.`,
    );
  }
  if (unknown.length > 0) {
    const names = unknown.join(lang === 'nl' ? ' en ' : ' and ');
    out.push(lang === 'nl' ? `Van ${names} weet ik de stand niet.` : `I do not know the state of ${names}.`);
  }
  out.push(
    lang === 'nl'
      ? 'Ik kijk nog alleen mee en schakel zelf niets.'
      : 'I am only watching for now and do not switch anything myself.',
  );
  return out.join(' ');
}

/* --------------------------------------------------------------- antwoorden */

function unknownRoom(config: SiteConfig, said: string, lang: Lang): string {
  const names = config.zones.map((z) => z.name.toLowerCase()).join(', ');
  return lang === 'nl'
    ? `De kamer "${said}" ken ik niet. Ik ken: ${names}.`
    : `I do not know the room "${said}". I know: ${names}.`;
}

function noDecision(lang: Lang): string {
  return lang === 'nl'
    ? 'Ik heb nog geen besluit genomen; de dienst start net op.'
    : 'I have not made a decision yet; the service is just starting.';
}

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

export function ask(question: Question, ctx: AskContext): Answer {
  const { config, snapshot, lang, shadow } = ctx;
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
        out.push(
          lang === 'nl'
            ? 'De regeling staat op handmatig, dus ik doe niets.'
            : 'The system is set to manual, so I am not doing anything.',
        );
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
        if (said.length === 0) {
          out.push(lang === 'nl' ? 'In geen enkele kamer is nu iets nodig.' : 'No room needs anything right now.');
        }
        for (const s of said) {
          out.push(s.zin);
          f.merge(s.own);
        }
      }
      // Een kamer die op zon draait, noemde de panelen al.
      const saidSun = f.list.some((x) => x.bron === 'zon.vermogen');
      if (!saidSun && e.solarProductionW != null && e.solarProductionW > 0) {
        const p = f.power('zon.vermogen', e.solarProductionW);
        out.push(lang === 'nl' ? `De panelen leveren ${p}.` : `The panels are producing ${p}.`);
      }
      const grid = gridSentence(f, e, lang);
      if (grid) out.push(grid);
      if (shadow) {
        out.push(
          lang === 'nl'
            ? 'Ik kijk nog alleen mee en schakel zelf niets.'
            : 'I am only watching for now and do not switch anything myself.',
        );
      }
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
      for (const o of e?.overrides ?? []) {
        if (o.untilMs == null || o.untilMs <= ctx.nowMs) continue;
        const dev = config.actuators.find((a) => a.id === o.actuatorId);
        if (!dev) continue;
        const t = f.time(`ingreep.${o.actuatorId}.tot`, o.untilMs);
        out.push(
          lang === 'nl'
            ? `Je hebt ${deviceName(dev, lang)} tot ${t}; daarna neem ik het weer over.`
            : `You have ${deviceName(dev, lang)} until ${t}; after that I take over again.`,
        );
      }
      if (e?.modeSource === 'override') {
        out.push(
          lang === 'nl'
            ? `De stand is met de hand op ${WORDS.nl.mode[e.mode]} gezet; die verandert niet vanzelf.`
            : `The mode was set to ${WORDS.en.mode[e.mode]} by hand; it does not change by itself.`,
        );
      } else {
        const next = nextScheduleChange(config, ctx.nowMs);
        const t = f.time(`schema.${next.mode}`, next.atMs);
        out.push(
          lang === 'nl'
            ? `Om ${t} ga ik naar ${WORDS.nl.mode[next.mode]}.`
            : `At ${t} I switch to ${WORDS.en.mode[next.mode]}.`,
        );
        if (next.mode === 'nacht' && config.schedule.eveningExtensionLights.length > 0) {
          out.push(
            lang === 'nl'
              ? 'Brandt er dan nog licht en is er iemand thuis, dan wordt het later.'
              : 'If a light is still on and someone is home, it will be later.',
          );
        }
      }
      out.push(
        lang === 'nl'
          ? 'Wat de zon gaat doen, weet ik nog niet: een weersverwachting heb ik nog niet.'
          : 'I do not know yet what the sun will do: I have no weather forecast yet.',
      );
      return done(out.join(' '));
    }

    case 'zon': {
      const t = ctx.today;
      const facade = facadeSentence(ctx.zoninval, lang);
      if (t == null) {
        return done(
          [
            lang === 'nl'
              ? 'In deze installatie houd ik geen dag bij, dus dat weet ik niet.'
              : 'This installation does not keep a daily record, so I do not know.',
            facade ?? '',
          ].join(' '),
        );
      }
      const out: string[] = [];
      if (t.zonWh < 5) {
        out.push(lang === 'nl' ? 'Vandaag leverden de panelen nog vrijwel niets.' : 'So far today the panels have produced almost nothing.');
      } else {
        const zon = f.energy('vandaag.zonWh', t.zonWh);
        out.push(lang === 'nl' ? `Vandaag leverden de panelen tot nu toe ${zon}.` : `So far today the panels produced ${zon}.`);
      }
      const best = t.kwartieren
        .filter((k): k is typeof k & { zonW: number } => k.zonW != null)
        .reduce<{ tMs: number; zonW: number } | null>((m, k) => (m == null || k.zonW > m.zonW ? k : m), null);
      if (best && best.zonW > 0) {
        const p = f.power('vandaag.piekW', best.zonW);
        const at = f.time('vandaag.piekTijd', best.tMs);
        out.push(lang === 'nl' ? `Het meeste was ${p}, in het kwartier van ${at}.` : `The most was ${p}, in the quarter from ${at}.`);
      }
      const off = f.energy('vandaag.netAfWh', t.netAfWh);
      if (t.netTerugWh < 5) {
        out.push(
          lang === 'nl'
            ? `Je huis leverde nog niets terug en haalde ${off} van het net.`
            : `Your house has not returned anything yet and drew ${off} from the grid.`,
        );
      } else {
        const back = f.energy('vandaag.netTerugWh', t.netTerugWh);
        out.push(
          lang === 'nl'
            ? `Je huis leverde ${back} terug en haalde ${off} van het net.`
            : `Your house returned ${back} to the grid and drew ${off} from it.`,
        );
      }
      const now = snapshot?.explanation.solarProductionW;
      if (now != null) {
        out.push(
          now > 0
            ? lang === 'nl'
              ? `Nu leveren ze ${f.power('zon.vermogen', now)}.`
              : `Right now they are producing ${f.power('zon.vermogen', now)}.`
            : lang === 'nl'
              ? 'Nu leveren ze niets.'
              : 'Right now they are producing nothing.',
        );
      }
      if (facade) out.push(facade);
      return done(out.join(' '));
    }

    case 'doe': {
      const zone = findZone(config, question.kamer);
      if (zone == null) return done(unknownRoom(config, question.kamer, lang));
      const w = WORDS[lang];
      const devices = actuatorsOf(config, zone);
      const zn = zoneName(zone, lang);

      if (question.wens === 'uit') {
        const names = devices.map((a) => deviceName(a, lang)).join(lang === 'nl' ? ' en ' : ' and ');
        return done(
          lang === 'nl'
            ? `Dan zou ik ${names} uitzetten. ${shadow ? 'Maar ik kijk nog alleen mee en mag nog niet schakelen. Wil je het nu, zet het dan zelf.' : 'Opdrachten neem ik nog niet aan.'}`
            : `Then I would switch off ${names}. ${shadow ? 'But I am only watching for now and may not switch anything yet. If you want it now, set it yourself.' : 'I do not take commands yet.'}`,
          zone.id,
        );
      }

      const heat = question.wens === 'verwarmen';
      const able = devices.filter((a) => (heat ? a.capabilities.canHeat : a.capabilities.canCool));
      // Verwarmen eerst met wat de basiswarmte levert; koelen kan alleen een airco.
      const device = able.find((a) => a.role === 'primary') ?? able[0];
      if (device == null) {
        return done(
          lang === 'nl'
            ? `${cap(zn)} heeft geen apparaat dat kan ${w.wish[question.wens]}.`
            : `${cap(zn)} has no unit that can ${w.wish[question.wens]}.`,
          zone.id,
        );
      }
      const dn = deviceName(device, lang);
      let target = '';
      if (question.temperatuurC != null) {
        const [min, max] = device.capabilities.setpointRange;
        if (question.temperatuurC < min || question.temperatuurC > max) {
          const asked = f.temp('vraag.temperatuur', question.temperatuurC);
          const lo = f.temp(`apparaat.${device.id}.minimum`, min);
          const hi = f.temp(`apparaat.${device.id}.maximum`, max);
          return done(
            lang === 'nl'
              ? `${asked} kan ${dn} niet: hij gaat van ${lo} tot ${hi}.`
              : `${dn} cannot do ${asked}: its range is ${lo} to ${hi}.`,
            zone.id,
          );
        }
        target = f.temp('vraag.temperatuur', question.temperatuurC);
      }
      const what =
        lang === 'nl'
          ? `${dn} op ${w.wish[question.wens]}${target ? ` naar ${target}` : ''}`
          : `${dn} to ${w.wish[question.wens]}${target ? ` at ${target}` : ''}`;
      return done(
        lang === 'nl'
          ? `Dan zou ik ${what} zetten, tot het volgende dagdeel. ${shadow ? 'Maar ik kijk nog alleen mee en mag nog niet schakelen. Wil je het nu, zet het dan zelf.' : 'Opdrachten neem ik nog niet aan.'}`
          : `Then I would set ${what}, until the next part of the day. ${shadow ? 'But I am only watching for now and may not switch anything yet. If you want it now, set it yourself.' : 'I do not take commands yet.'}`,
        zone.id,
      );
    }
  }
}
