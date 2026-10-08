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
  /** "Zwaar bewolkt en regen", zoals Buienradar het zegt. */
  readonly tekst: string | null;
}

const KEY = /^(temperature|mintemp|rainchance|sunchance|condition|conditionexact)(?:_([1-5])d)?$/;

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
      return {
        offset,
        maxC: num(d['temperature']),
        minC: num(d['mintemp']),
        regenkansPct: num(d['rainchance']),
        zonkansPct: zon,
        soort: kindOf(d['condition'], zon),
        tekst: d['conditionexact'] ?? null,
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
export class WeatherLog {
  readonly #file: string;
  #days: Record<string, number> = {};
  #loaded: Promise<void> | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#file = join(logDir, WEATHER_FILE);
  }

  load(): Promise<void> {
    this.#loaded ??= readFile(this.#file, 'utf-8')
      .then((t) => {
        const saved = JSON.parse(t) as { zonkans?: Record<string, number> };
        this.#days = { ...(saved.zonkans ?? {}) };
      })
      .catch(() => {
        // Nog niets bewaard: dan begint het hier.
      });
    return this.#loaded;
  }

  get current(): Readonly<Record<string, number>> {
    return this.#days;
  }

  /** Noteert de zonkans van morgen. Schrijft alleen als hij veranderde. */
  async note(day: string, sunPct: number): Promise<void> {
    await this.load();
    if (this.#days[day] === sunPct) return;
    const keep = Object.keys(this.#days).sort().slice(-KEEP_DAYS);
    this.#days = { ...Object.fromEntries(keep.map((d) => [d, this.#days[d]!])), [day]: sunPct };
    const data = JSON.stringify({ versie: 1, zonkans: this.#days });
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
}

export interface WeatherReport {
  readonly bron: 'Buienradar';
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
  };
  readonly dagen: readonly WeatherDay[];
  /** Hoeveel dagen het huis naast de verwachting kon leggen, en hoeveel het afwijkt van de schatting. */
  readonly geleerd: { readonly dagen: number; readonly factor: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dateKey = (ms: number, timeZone: string) => {
  const p = partsIn(ms, timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/** De heldere-luchtopbrengst van een dag, en tot een moment, in Wh. */
function clearSkyWh(geometry: Geometry, location: Location, learned: SolarLearned | null, fromMs: number, toMs: number, untilMs = toMs): { total: number; sofar: number } {
  let total = 0;
  let sofar = 0;
  for (let t = fromMs; t < toMs; t += QUARTER_MS) {
    const wh = clearSkyW(geometry, location, t + QUARTER_MS / 2, learned) / 4;
    total += wh;
    if (t + QUARTER_MS <= untilMs) sofar += wh;
  }
  return { total, sofar };
}

/**
 * Hoeveel de werkelijke opbrengst afwijkt van de schatting bij de zonkans:
 * het midden van werkelijk / geschat over de dagen waarvan beide bekend zijn,
 * en hoe meer dagen, hoe zwaarder dat weegt tegenover 1.
 */
export function learnShare(
  predicted: Readonly<Record<string, number>>,
  solarDays: QuarterDays,
  clearOf: (day: string) => number,
): { dagen: number; factor: number } {
  const ratios: number[] = [];
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
  }
  if (ratios.length === 0) return { dagen: 0, factor: 1 };
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const w = ratios.length / (ratios.length + HALF_WEIGHT_DAYS);
  const factor = Math.max(0.5, Math.min(1.6, 1 + w * (mid - 1)));
  return { dagen: ratios.length, factor: Math.round(factor * 100) / 100 };
}

export function weatherReport(input: {
  readonly forecast: readonly ForecastDay[];
  readonly predicted: Readonly<Record<string, number>>;
  readonly solarDays: QuarterDays;
  readonly geometry: Geometry;
  readonly location: Location;
  readonly learned: SolarLearned | null;
  /** Wat de panelen vandaag tot nu toe leverden, in Wh. */
  readonly todayWh: number;
  readonly nowMs: number;
  readonly timeZone: string;
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
  const share = (sunPct: number) => Math.min(1, priorShare(sunPct) * geleerd.factor);

  // Vandaag: wat er al was, plus de rest naar hoe de dag tot nu verliep en wat er werd verwacht.
  const today = clearSkyWh(geometry, location, learned, dayStart(0), dayStart(1), nowMs);
  const todayKey = dateKey(nowMs, timeZone);
  const expected = input.predicted[todayKey];
  const soFar = today.sofar >= 300 ? input.todayWh / today.sofar : null;
  const fromForecast = expected != null ? share(expected) : null;
  const passed = today.total > 0 ? today.sofar / today.total : 0;
  const restShare = soFar != null && fromForecast != null ? passed * soFar + (1 - passed) * fromForecast : soFar ?? fromForecast;
  const restWh = Math.max(0, today.total - today.sofar);
  const now = input.forecast.find((f) => f.offset === 0);

  return {
    bron: 'Buienradar',
    vandaag: {
      datum: todayKey,
      opgewektKwh: round1(input.todayWh / 1000),
      verwachtKwh: restShare == null ? null : round1((input.todayWh + restWh * Math.min(1, restShare)) / 1000),
      heldereLuchtKwh: round1(today.total / 1000),
      zonkansPct: expected ?? null,
      soort: now?.soort ?? null,
      tekst: now?.tekst ?? null,
    },
    dagen: input.forecast.filter((f) => f.offset >= 1).map((f) => {
      const from = dayStart(f.offset);
      const clear = clearSkyWh(geometry, location, learned, from, dayStart(f.offset + 1)).total;
      return {
        datum: dateKey(from + 12 * 3_600_000, timeZone),
        maxC: f.maxC,
        minC: f.minC,
        regenkansPct: f.regenkansPct,
        zonkansPct: f.zonkansPct,
        soort: f.soort,
        tekst: f.tekst,
        heldereLuchtKwh: round1(clear / 1000),
        verwachtKwh: f.zonkansPct == null ? null : round1((clear * share(f.zonkansPct)) / 1000),
      };
    }),
    geleerd,
  };
}
