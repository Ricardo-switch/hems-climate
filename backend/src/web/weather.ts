/**
 * Het weer van de komende dagen, en wat de panelen dan ongeveer leveren
 * (besluit 105).
 *
 * Buienradar in Home Assistant geeft per dag een verwachting: de hoogste en
 * laagste temperatuur, de kans op regen en de kans op zon. `_1d` is morgen,
 * niet vandaag; de feed begint bij de volgende dag. Herkend aan de vaste
 * `translation_key` ("sunchance_1d"): de `unique_id` bevat de ligging van het
 * huis en wordt nergens gelezen.
 *
 * De opbrengst per dag komt van het huis zelf: de lijn voor een heldere lucht
 * die het uit zijn eigen panelen leerde (besluit 93), maal een deel dat bij de
 * zonkans hoort. Dat deel begint als schatting en schuift mee met wat de
 * panelen werkelijk haalden op dagen waarvan de zonkans de dag ervoor bekend
 * was. Alleen voor de weergave en de assistent; de regeling gebruikt het niet.
 */

import { rename, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { Geometry } from '../core/model.js';
import type { QuarterDays, SolarLearned } from './solar-learn.js';
import { clearSkyW, type Location } from './sun.js';
import { partsIn, zonedMidnight } from './today.js';

/** Het bestand met de zonkans per dag, naast het logboek. */
export const WEATHER_FILE = 'weer-verwachting.json';

const QUARTER_MS = 15 * 60_000;
/** Zoveel dagen bewaren; genoeg om een jaar te leren. */
const KEEP_DAYS = 400;
/** Vanaf zoveel dagen weegt wat het huis leerde even zwaar als de schatting. */
const HALF_WEIGHT_DAYS = 5;
/** Zoveel dagen, met genoeg verschil in zonkans, voordat het huis het hele verband leert. */
const FIT_DAYS = 10;
/** Zoveel spreiding in zonkans (procentpunten) is nodig om een lijn te trekken. */
const FIT_SPREAD = 15;
/** Een dag zonder zon van betekenis zegt niets over de verhouding. */
const MIN_CLEAR_WH = 1500;

export type WeatherKind = 'zon' | 'half' | 'bewolkt' | 'regen' | 'onweer' | 'sneeuw' | 'mist';

export interface ForecastDay {
  /** 1 is morgen; 0 is het weer van nu, met alleen de soort en de tekst. */
  readonly offset: number;
  readonly maxC: number | null;
  readonly minC: number | null;
  readonly regenkansPct: number | null;
  readonly zonkansPct: number | null;
  readonly soort: WeatherKind | null;
  /** "Bewolkt met regen": eigen woorden, want Buienradar praat de taal van Home Assistant. */
  readonly tekst: string | null;
  /** Alleen bij dag 0, als de bron het geeft: de temperatuur van nu (besluit 128). */
  readonly nuC?: number | null;
}

/** Het weer per uur zoals Open-Meteo het geeft, als kolommen vanaf `vanMs`. */
export interface HourColumns {
  readonly vanMs: number;
  readonly buitenC: readonly (number | null)[];
  readonly wolkenPct: readonly (number | null)[];
  readonly zonWm2: readonly (number | null)[];
  readonly regenkansPct: readonly (number | null)[];
  readonly code?: readonly (number | null)[];
}

/** Het weer per uur voor Vandaag (besluit 128). */
export interface WeatherHour {
  readonly tMs: number;
  readonly buitenC: number | null;
  readonly soort: WeatherKind | null;
  readonly regenkansPct: number | null;
  /** Geen zon op de grond: dan een maan in plaats van een zon. */
  readonly nacht: boolean;
}

const KEY = /^(temperature|mintemp|rainchance|sunchance|condition)(?:_([1-5])d)?$/;

/** Het weer van nu en de vijf dagen van Buienradar, of een lege lijst als die er niet is. */
export function readForecast(entities: readonly HaRegistryEntity[], states: ReadonlyMap<string, HaEntityState>): ForecastDay[] {
  const days = new Map<number, Record<string, string>>();
  for (const e of entities) {
    if (e.platform !== 'buienradar' || e.disabled_by != null || e.translation_key == null) continue;
    const m = KEY.exec(e.translation_key);
    if (!m) continue;
    const st = states.get(e.entity_id)?.state;
    if (st == null || st === 'unknown' || st === 'unavailable' || st === '') continue;
    const offset = m[2] == null ? 0 : Number(m[2]);
    days.set(offset, { ...(days.get(offset) ?? {}), [m[1]!]: st });
  }
  const num = (v: string | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return [...days.entries()]
    .sort(([a], [b]) => a - b)
    .map(([offset, d]) => {
      const zon = num(d['sunchance']);
      const regen = num(d['rainchance']);
      const soort = kindOf(d['condition'], zon);
      return {
        offset,
        maxC: num(d['temperature']),
        minC: num(d['mintemp']),
        regenkansPct: regen,
        zonkansPct: zon,
        soort,
        tekst: wordsFor(soort, regen),
      };
    });
}

/** Buienradars staat ("cloudy", "rainy") naar een van onze soorten. */
export function kindOf(condition: string | undefined, sunPct: number | null): WeatherKind | null {
  if (condition == null) return null;
  const c = condition.toLowerCase();
  if (/lightning|thunder|onweer/.test(c)) return 'onweer';
  if (/snow|sneeuw|hail|hagel/.test(c)) return 'sneeuw';
  if (/rain|pour|shower|regen|bui/.test(c)) return 'regen';
  if (/fog|mist|haze/.test(c)) return 'mist';
  if (/clear|sunny|zon/.test(c)) return 'zon';
  if (/cloud|bewolk/.test(c)) return sunPct != null && sunPct >= 30 ? 'half' : 'bewolkt';
  return null;
}

/**
 * De zonkans bij een toestand van Home Assistant, als de bron geen bewolking
 * geeft: een schatting, ruw maar beter dan niets (besluit 111).
 */
const ZONKANS_BIJ: Readonly<Record<string, number>> = {
  sunny: 85,
  'clear-night': 85,
  partlycloudy: 50,
  cloudy: 15,
  fog: 10,
  rainy: 10,
  pouring: 5,
  'lightning-rainy': 10,
  lightning: 15,
  snowy: 10,
  'snowy-rainy': 5,
  hail: 10,
  windy: 50,
  'windy-variant': 30,
  exceptional: 30,
};

/** Een verwachting zoals een weerentiteit van Home Assistant hem geeft (`weather/subscribe_forecast`). */
export interface EntityForecast {
  readonly datetime: string;
  readonly condition?: string | null;
  readonly temperature?: number | null;
  readonly templow?: number | null;
  readonly precipitation_probability?: number | null;
  readonly cloud_coverage?: number | null;
}

/**
 * Het weer van nu en de komende dagen uit een weerentiteit van Home Assistant
 * (besluit 111), in dezelfde vorm als Buienradar: dag 0 is nu, 1 is morgen.
 * De zonkans is 100 min de bewolking, of anders een schatting uit de toestand.
 */
export function forecastFromEntity(state: HaEntityState | undefined, forecast: readonly EntityForecast[], nowMs: number, tz: string): ForecastDay[] {
  const out: ForecastDay[] = [];
  const zonkans = (condition: string | null | undefined, wolken: number | null | undefined) =>
    wolken != null && Number.isFinite(wolken) ? Math.round(100 - Math.max(0, Math.min(100, wolken))) : condition ? (ZONKANS_BIJ[condition] ?? null) : null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (state && state.state !== 'unavailable' && state.state !== 'unknown') {
    const zon = zonkans(state.state, num(state.attributes['cloud_coverage']));
    const soort = kindOf(state.state, zon);
    out.push({ offset: 0, maxC: null, minC: null, regenkansPct: null, zonkansPct: zon, soort, tekst: wordsFor(soort, null) });
  }
  const vandaag = partsIn(nowMs, tz);
  const begin = zonedMidnight(vandaag.y, vandaag.m, vandaag.d, tz);
  for (const f of forecast) {
    const t = Date.parse(f.datetime);
    if (!Number.isFinite(t)) continue;
    const p = partsIn(t + 3_600_000, tz);
    const offset = Math.round((zonedMidnight(p.y, p.m, p.d, tz) - begin) / 86_400_000);
    if (offset < 1 || offset > 5 || out.some((d) => d.offset === offset)) continue;
    const zon = zonkans(f.condition, f.cloud_coverage);
    const regen = num(f.precipitation_probability);
    const soort = kindOf(f.condition ?? undefined, zon);
    out.push({ offset, maxC: num(f.temperature), minC: num(f.templow), regenkansPct: regen, zonkansPct: zon, soort, tekst: wordsFor(soort, regen) });
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/**
 * De koppelingen in Home Assistant die het weer van het eigen huis geven.
 * Andere weerentiteiten horen bij iets anders: het circuit van een Formule
 * 1-sensor, een stad in een reisplanner. Die staan niet in de keuze.
 */
const WEERDIENSTEN = new Set([
  'met', 'buienradar', 'knmi', 'openweathermap', 'accuweather', 'pirateweather', 'tomorrowio', 'open_meteo', 'meteoblue',
  'weatherflow', 'weatherflow_cloud', 'nws', 'environment_canada', 'metoffice', 'bom', 'smhi', 'ipma', 'aemet', 'meteo_france',
  'dwd_weather', 'zamg', 'meteoswiss', 'irm_kmi', 'weatherkit', 'google_weather', 'yr', 'foreca', 'climacell', 'darksky',
]);

/** De weerbronnen om uit te kiezen: Buienradar als die er is, en elke weerentiteit van een weerdienst. */
export function weatherSources(entities: readonly HaRegistryEntity[], states: ReadonlyMap<string, HaEntityState>): { id: string; naam: string }[] {
  const out: { id: string; naam: string }[] = [];
  const metSensoren = entities.some((e) => e.platform === 'buienradar' && e.disabled_by == null && e.translation_key != null && KEY.test(e.translation_key));
  if (metSensoren) out.push({ id: 'buienradar', naam: 'Buienradar' });
  for (const e of entities) {
    if (!e.entity_id.startsWith('weather.') || e.disabled_by != null || !/^weather\.[a-z0-9_]+$/.test(e.entity_id)) continue;
    if (!WEERDIENSTEN.has(e.platform ?? '')) continue;
    // Buienradar staat er al, met zijn vijf dagen uit de sensoren: niet nog eens als weerentiteit.
    if (e.platform === 'buienradar' && metSensoren) continue;
    out.push({ id: e.entity_id, naam: String(states.get(e.entity_id)?.attributes['friendly_name'] ?? e.entity_id) });
  }
  return out;
}

/** De soort weer in gewone woorden, met de kans op regen erbij als die telt. */
export function wordsFor(kind: WeatherKind | null, rainPct: number | null): string | null {
  switch (kind) {
    case 'zon':
      return 'Zonnig';
    case 'half':
      return rainPct != null && rainPct >= 50 ? 'Zon en wolken, kans op een bui' : 'Zon en wolken';
    case 'bewolkt':
      return rainPct != null && rainPct >= 50 ? 'Bewolkt, kans op regen' : 'Bewolkt';
    case 'regen':
      return rainPct != null && rainPct < 50 ? 'Bewolkt, af en toe een bui' : 'Bewolkt met regen';
    case 'onweer':
      return 'Kans op onweer';
    case 'sneeuw':
      return 'Sneeuw';
    case 'mist':
      return 'Mist';
    default:
      return null;
  }
}

/**
 * Welk deel van de heldere-luchtopbrengst bij een zonkans hoort, vóór het huis
 * iets leerde. Ook bij een dichte lucht komt er licht door: bij 0 % zonkans
 * nog ongeveer een vijfde.
 */
export function priorShare(sunPct: number): number {
  return 0.18 + 0.72 * Math.max(0, Math.min(100, sunPct)) / 100;
}

/* ------------------------------------------------- de zonkans per dag */

/**
 * De zonkans per dag (`JJJJ-MM-DD`, lokaal), zoals hij de dag ervoor als
 * "morgen" werd verwacht. Wordt overschreven tot die dag begint; daarna staat
 * hij vast en kan het huis hem naast de werkelijke opbrengst leggen.
 */
/** Wat de dienst de dag ervoor voor een dag verwachtte: in kWh, en per kwartier in W. */
export interface StoredExpectation {
  readonly kwh: number;
  readonly kwartieren: readonly number[];
}

export class WeatherLog {
  readonly #file: string;
  #days: Record<string, number> = {};
  #expected: Record<string, StoredExpectation> = {};
  #loaded: Promise<void> | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#file = join(logDir, WEATHER_FILE);
  }

  load(): Promise<void> {
    this.#loaded ??= readFile(this.#file, 'utf-8')
      .then((t) => {
        const saved = JSON.parse(t) as { zonkans?: Record<string, number>; verwacht?: Record<string, StoredExpectation> };
        this.#days = { ...(saved.zonkans ?? {}) };
        this.#expected = { ...(saved.verwacht ?? {}) };
      })
      .catch(() => {
        // Nog niets bewaard: dan begint het hier.
      });
    return this.#loaded;
  }

  /** De zonkans per dag, zoals hij de dag ervoor werd verwacht. */
  get current(): Readonly<Record<string, number>> {
    return this.#days;
  }

  /** De verwachting per dag, zoals hij de dag ervoor werd uitgerekend. */
  get expected(): Readonly<Record<string, StoredExpectation>> {
    return this.#expected;
  }

  /**
   * Noteert de zonkans van morgen, en wat de dienst daarbij verwacht. Schrijft
   * alleen als er iets veranderde; tot middernacht wint de laatste.
   */
  async note(day: string, sunPct: number, expectation?: StoredExpectation): Promise<void> {
    await this.load();
    const same = this.#days[day] === sunPct && (expectation == null || this.#expected[day]?.kwh === expectation.kwh);
    if (same) return;
    const keep = new Set(Object.keys(this.#days).sort().slice(-KEEP_DAYS));
    this.#days = { ...Object.fromEntries([...keep].map((d) => [d, this.#days[d]!])), [day]: sunPct };
    const kept = Object.entries(this.#expected).filter(([d]) => keep.has(d) || d === day);
    this.#expected = { ...Object.fromEntries(kept), ...(expectation ? { [day]: expectation } : {}) };
    const data = JSON.stringify({ versie: 2, zonkans: this.#days, verwacht: this.#expected });
    this.#writing = this.#writing.then(async () => {
      const temp = `${this.#file}.tmp`;
      await writeFile(temp, data, 'utf-8');
      await rename(temp, this.#file);
    });
    await this.#writing;
  }
}

/* --------------------------------------------------------- het rapport */

export interface WeatherDay {
  readonly datum: string;
  readonly maxC: number | null;
  readonly minC: number | null;
  readonly regenkansPct: number | null;
  readonly zonkansPct: number | null;
  readonly soort: WeatherKind | null;
  readonly tekst: string | null;
  /** Wat de panelen bij een heldere lucht zouden leveren, in kWh. */
  readonly heldereLuchtKwh: number;
  /** Wat ze bij deze zonkans ongeveer leveren, in kWh; null zonder zonkans. */
  readonly verwachtKwh: number | null;
  /** Alleen voor morgen: de verwachting per kwartier, in W, voor de tijdlijn van Vandaag. */
  readonly kwartieren?: readonly { readonly tMs: number; readonly verwachtW: number }[];
}

export interface WeatherReport {
  /** De naam van de weerbron, voor onder het blad: "Buienradar", "Open-Meteo". */
  readonly bron: string;
  readonly vandaag: {
    readonly datum: string;
    /** Tot nu toe, gemeten. */
    readonly opgewektKwh: number;
    /** Tot nu toe plus de rest van de dag; null als er niets is om op te rekenen. */
    readonly verwachtKwh: number | null;
    readonly heldereLuchtKwh: number;
    /** De zonkans die gisteren voor vandaag werd verwacht. */
    readonly zonkansPct: number | null;
    /** Het weer van nu, zoals Buienradar het zegt. */
    readonly soort: WeatherKind | null;
    readonly tekst: string | null;
    /** De buitentemperatuur van de weerbron, als die hem geeft (besluit 128). */
    readonly buitenC: number | null;
    /** Het weer per uur, de komende 24 uur, als de bron dat geeft (Open-Meteo). */
    readonly uren: readonly WeatherHour[];
    /**
     * De verwachting per kwartier van vandaag, in W: de geleerde heldere lucht
     * maal het deel bij het weer van vandaag. Leeg als er niets is om op te rekenen.
     */
    readonly kwartieren: readonly { readonly tMs: number; readonly verwachtW: number }[];
  };
  readonly dagen: readonly WeatherDay[];
  /** Hoeveel dagen het huis naast de verwachting kon leggen, en wat het daaruit leerde. */
  readonly geleerd: LearnedShare;
  /**
   * Zo goed klopte het: per afgesloten dag wat de dag ervoor werd verwacht en
   * wat de panelen werkelijk leverden, nieuwste eerst, hooguit twee weken.
   */
  readonly terugblik: readonly {
    readonly datum: string;
    readonly zonkansPct: number | null;
    readonly verwachtKwh: number;
    readonly werkelijkKwh: number;
  }[];
  /** De verwachte lijn van gisteren, per kwartier in W, om naast wat er kwam te leggen. */
  readonly gisteren: { readonly datum: string; readonly kwartieren: readonly number[] } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dateKey = (ms: number, timeZone: string) => {
  const p = partsIn(ms, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/** De heldere-luchtopbrengst van een dag, en tot een moment, in Wh. */
function clearSkyWh(
  geometry: Geometry,
  location: Location,
  learned: SolarLearned | null,
  fromMs: number,
  toMs: number,
  untilMs = toMs,
): { total: number; sofar: number; quarters: { tMs: number; w: number }[] } {
  let total = 0;
  let sofar = 0;
  const quarters: { tMs: number; w: number }[] = [];
  for (let t = fromMs; t < toMs; t += QUARTER_MS) {
    const w = clearSkyW(geometry, location, t + QUARTER_MS / 2, learned);
    quarters.push({ tMs: t, w });
    total += w / 4;
    if (t + QUARTER_MS <= untilMs) sofar += w / 4;
  }
  return { total, sofar, quarters };
}

/**
 * Het deel bij het weer van nu, voor als er voor vandaag nog geen zonkans van
 * gisteren is en de dag nog te jong is om op te rekenen: de eerste dag, of
 * vroeg in de ochtend.
 */
const SHARE_NOW: Readonly<Record<WeatherKind, number>> = { zon: 0.85, half: 0.55, bewolkt: 0.3, regen: 0.22, onweer: 0.25, sneeuw: 0.15, mist: 0.25 };

/**
 * Hoeveel de werkelijke opbrengst afwijkt van de schatting bij de zonkans:
 * het midden van werkelijk / geschat over de dagen waarvan beide bekend zijn,
 * en hoe meer dagen, hoe zwaarder dat weegt tegenover 1.
 */
export interface LearnedShare {
  readonly dagen: number;
  readonly factor: number;
  /**
   * Het verband dat het huis zelf vond, als er genoeg dagen met verschillende
   * zonkansen zijn: deel = a + b × zonkans/100. Anders null.
   */
  readonly lijn: { readonly a: number; readonly b: number } | null;
}

/**
 * Het deel van de heldere-luchtopbrengst bij een zonkans: de schatting, maal
 * de geleerde factor, en met genoeg dagen steeds meer het eigen verband.
 */
export function shareFor(learned: LearnedShare, sunPct: number): number {
  const prior = priorShare(sunPct) * learned.factor;
  if (!learned.lijn) return Math.min(1, prior);
  const own = learned.lijn.a + (learned.lijn.b * Math.max(0, Math.min(100, sunPct))) / 100;
  const w = learned.dagen / (learned.dagen + FIT_DAYS);
  return Math.max(0.03, Math.min(1, (1 - w) * prior + w * own));
}

export function learnShare(
  predicted: Readonly<Record<string, number>>,
  solarDays: QuarterDays,
  clearOf: (day: string) => number,
): LearnedShare {
  const ratios: number[] = [];
  const points: { s: number; r: number }[] = [];
  for (const [day, sunPct] of Object.entries(predicted)) {
    const quarters = solarDays[day];
    if (!quarters) continue;
    const measured = quarters.filter((q) => q != null).length;
    // Een dag met gaten in het logboek telt niet: de opbrengst zou te laag uitvallen.
    if (measured < 60) continue;
    const actualWh = quarters.reduce<number>((t, q) => t + (q ?? 0) / 4, 0);
    const clear = clearOf(day);
    if (clear < MIN_CLEAR_WH) continue;
    ratios.push(actualWh / clear / priorShare(sunPct));
    points.push({ s: sunPct / 100, r: actualWh / clear });
  }
  if (ratios.length === 0) return { dagen: 0, factor: 1, lijn: null };
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const w = ratios.length / (ratios.length + HALF_WEIGHT_DAYS);
  const factor = Math.max(0.5, Math.min(1.6, 1 + w * (mid - 1)));
  return { dagen: ratios.length, factor: Math.round(factor * 100) / 100, lijn: fitLine(points) };
}

/** Een rechte lijn door (zonkans, deel), met de kleinste kwadraten; null bij te weinig of te gelijke dagen. */
function fitLine(points: readonly { s: number; r: number }[]): { a: number; b: number } | null {
  if (points.length < FIT_DAYS) return null;
  const n = points.length;
  const ms = points.reduce((t, p) => t + p.s, 0) / n;
  const mr = points.reduce((t, p) => t + p.r, 0) / n;
  const vs = points.reduce((t, p) => t + (p.s - ms) ** 2, 0) / n;
  if (Math.sqrt(vs) * 100 < FIT_SPREAD) return null;
  const cov = points.reduce((t, p) => t + (p.s - ms) * (p.r - mr), 0) / n;
  // Meer zon geeft nooit minder opbrengst; een dalende lijn is ruis.
  const b = Math.max(0, cov / vs);
  const a = Math.max(0, Math.min(0.8, mr - b * ms));
  return { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 };
}

export function weatherReport(input: {
  readonly forecast: readonly ForecastDay[];
  readonly predicted: Readonly<Record<string, number>>;
  /** Wat de dienst de dag ervoor verwachtte, per dag; leeg als het nog niet bewaard werd. */
  readonly expected?: Readonly<Record<string, StoredExpectation>>;
  readonly solarDays: QuarterDays;
  readonly geometry: Geometry;
  readonly location: Location;
  readonly learned: SolarLearned | null;
  /** Wat de panelen vandaag tot nu toe leverden, in Wh. */
  readonly todayWh: number;
  readonly nowMs: number;
  readonly timeZone: string;
  /** De naam van de weerbron; weg is Buienradar. */
  readonly bron?: string;
  /** Het weer per uur, als kolommen (open-meteo.ts). */
  readonly uren?: HourColumns | null;
  /** WMO-code naar een soort; meegegeven om geen kring van imports te maken. */
  readonly soortVanCode?: (code: number | null, wolkenPct: number | null) => WeatherKind | null;
}): WeatherReport {
  const { geometry, location, learned, nowMs, timeZone } = input;
  const p = partsIn(nowMs, timeZone);
  const dayStart = (offset: number) => zonedMidnight(p.y, p.m, p.d + offset, timeZone);

  // De opbrengst bij een heldere lucht van een afgesloten dag; de kwartieren
  // daarvan staan in UTC, en in Nederland valt de zon binnen dezelfde UTC-dag.
  const clearOf = (day: string) => {
    const from = Date.parse(`${day}T00:00:00Z`);
    return clearSkyWh(geometry, location, learned, from, from + 24 * 3_600_000).total;
  };
  const geleerd = learnShare(input.predicted, input.solarDays, clearOf);
  const share = (sunPct: number) => shareFor(geleerd, sunPct);

  // Vandaag: wat er al was, plus de rest naar hoe de dag tot nu verliep en wat er werd verwacht.
  const today = clearSkyWh(geometry, location, learned, dayStart(0), dayStart(1), nowMs);
  const todayKey = dateKey(nowMs, timeZone);
  const expected = input.predicted[todayKey];
  const soFar = today.sofar >= 300 ? input.todayWh / today.sofar : null;
  const fromForecast = expected != null ? share(expected) : null;
  const passed = today.total > 0 ? today.sofar / today.total : 0;
  const now = input.forecast.find((f) => f.offset === 0);
  const fromNow = now?.soort != null ? Math.min(1, SHARE_NOW[now.soort] * geleerd.factor) : null;
  // Wat gisteren voor vandaag werd verwacht; anders het weer van nu.
  const prior = fromForecast ?? fromNow;
  const restShare = soFar != null && prior != null ? passed * soFar + (1 - passed) * prior : soFar ?? prior;
  const restWh = Math.max(0, today.total - today.sofar);

  return {
    bron: input.bron ?? 'Buienradar',
    vandaag: {
      datum: todayKey,
      opgewektKwh: round1(input.todayWh / 1000),
      verwachtKwh: restShare == null ? null : round1((input.todayWh + restWh * Math.min(1, restShare)) / 1000),
      heldereLuchtKwh: round1(today.total / 1000),
      zonkansPct: expected ?? null,
      soort: now?.soort ?? null,
      tekst: now?.tekst ?? null,
      buitenC: now?.nuC ?? null,
      uren: hoursFrom(input.uren ?? null, nowMs, input.soortVanCode),
      kwartieren: restShare == null ? [] : today.quarters.map((q) => ({ tMs: q.tMs, verwachtW: Math.round(q.w * Math.min(1, restShare)) })),
    },
    dagen: input.forecast.filter((f) => f.offset >= 1).map((f) => {
      const from = dayStart(f.offset);
      const dag = clearSkyWh(geometry, location, learned, from, dayStart(f.offset + 1));
      const clear = dag.total;
      const deel = f.zonkansPct == null ? null : share(f.zonkansPct);
      return {
        datum: dateKey(from + 12 * 3_600_000, timeZone),
        maxC: f.maxC,
        minC: f.minC,
        regenkansPct: f.regenkansPct,
        zonkansPct: f.zonkansPct,
        soort: f.soort,
        tekst: f.tekst,
        heldereLuchtKwh: round1(clear / 1000),
        verwachtKwh: deel == null ? null : round1((clear * deel) / 1000),
        ...(f.offset === 1 && deel != null ? { kwartieren: dag.quarters.map((q) => ({ tMs: q.tMs, verwachtW: Math.round(q.w * deel) })) } : {}),
      };
    }),
    geleerd,
    terugblik: lookBack(input.expected ?? {}, input.predicted, input.solarDays, todayKey),
    gisteren: (() => {
      const key = dateKey(dayStart(-1) + 12 * 3_600_000, timeZone);
      const e = input.expected?.[key];
      return e ? { datum: key, kwartieren: e.kwartieren } : null;
    })(),
  };
}

/** De komende 24 uur, vanaf het uur van nu. */
function hoursFrom(
  u: HourColumns | null,
  nowMs: number,
  soortVanCode: ((code: number | null, wolkenPct: number | null) => WeatherKind | null) | undefined,
): WeatherHour[] {
  if (u == null) return [];
  const out: WeatherHour[] = [];
  for (let i = 0; i < u.buitenC.length && out.length < 24; i++) {
    const tMs = u.vanMs + i * 3_600_000;
    if (tMs + 3_600_000 <= nowMs) continue;
    const wolken = u.wolkenPct[i] ?? null;
    const regen = u.regenkansPct[i] ?? null;
    const code = u.code?.[i] ?? null;
    const soort = soortVanCode && code != null ? soortVanCode(code, wolken) : wolken == null ? null : regen != null && regen >= 50 ? 'regen' : wolken < 25 ? 'zon' : wolken < 70 ? 'half' : 'bewolkt';
    out.push({ tMs, buitenC: u.buitenC[i] ?? null, soort, regenkansPct: regen, nacht: (u.zonWm2[i] ?? 0) <= 0 });
  }
  return out;
}

/** De afgesloten dagen waarvan de verwachting en de opbrengst allebei bekend zijn. */
function lookBack(
  expected: Readonly<Record<string, StoredExpectation>>,
  predicted: Readonly<Record<string, number>>,
  solarDays: QuarterDays,
  todayKey: string,
): WeatherReport['terugblik'] {
  return Object.keys(expected)
    .filter((day) => day < todayKey)
    .sort()
    .reverse()
    .flatMap((day) => {
      const quarters = solarDays[day];
      if (!quarters || quarters.filter((q) => q != null).length < 60) return [];
      const actualWh = quarters.reduce<number>((t, q) => t + (q ?? 0) / 4, 0);
      return [{ datum: day, zonkansPct: predicted[day] ?? null, verwachtKwh: expected[day]!.kwh, werkelijkKwh: round1(actualWh / 1000) }];
    })
    .slice(0, 14);
}
