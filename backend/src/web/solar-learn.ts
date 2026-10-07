/**
 * Wat de panelen bij een heldere lucht werkelijk halen, geleerd uit hun eigen
 * opbrengst (besluit 93).
 *
 * Het model in `core/sun.ts` is een grove maat: directe zon volgens Meinel plus
 * een vaste fractie verstrooid licht. Naast de echte opbrengst bleek het op
 * 7 oktober 2026 structureel te laag, en het meest bij een lage zon in het
 * westen. Rendement, kabels en de omvormer zitten er ook niet in. Het huis
 * leert daarom per zonnestand hoeveel het werkelijk haalt, als factor op het
 * model.
 *
 * Twee lagen, zodat de ligging van het huis nergens wordt opgeslagen:
 *
 * - **Per afgesloten dag de gemiddelde zon per kwartier** (UTC), uit het
 *   beslislogboek. Gewone wattages zonder ligging, bewaard in
 *   `zon-kwartieren.json` in de logmap, zodat een herstart niet alles opnieuw
 *   hoeft te lezen. Vandaag telt pas mee als de dag af is.
 * - **De factoren** rekent `learnSolar` daaruit bij elke vraag, met de ligging
 *   uit Home Assistant die alleen in het geheugen staat.
 *
 * Per vak van de hemel (15° richting, 5° hoogte) is de factor de op één na
 * hoogste dag: één kwartier waarin een wolkenrand de zon even versterkte, telt
 * zo niet als het maximum. Een vak telt pas na genoeg dagen; daarbuiten geldt
 * het midden van de geleerde vakken, en zonder geleerde vakken de schatting.
 * Lager dan het midden mag een vak pas na veel dagen: echte schaduw (een boom,
 * een schoorsteen) komt elke dag terug, een reeks bewolkte dagen niet.
 */

import { rename, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Geometry } from '../core/model.js';
import { clearSkyOnPlaneWm2, sunPosition, type SunPosition } from '../core/sun.js';
import { findLogFiles, linesOf } from '../divergence/read.js';
import type { Location } from './sun.js';

const QUARTER_MS = 15 * 60_000;
/** Een kwartier telt pas met zoveel metingen erin; het logboek schrijft er een per 15 s. */
const MIN_SAMPLES = 5;
/** Het bestand met de kwartieren, naast het logboek. */
export const SOLAR_FILE = 'zon-kwartieren.json';

/** Onder deze hoogte zegt het model weinig: huizen, bomen en de horizon. */
const MIN_ELEVATION = 5;
/** Een kwartier waarin het model minder dan dit belooft, zegt niets over het maximum. */
const MIN_MODEL_W = 200;
/** Zoveel dagen in een vak voordat het geleerd heet. */
export const MIN_DAYS = 5;
/** Zoveel dagen voordat een vak lager mag uitkomen dan het midden: dan is het schaduw, geen pech. */
export const SHADE_DAYS = 15;
/** Grenzen aan een factor: daarbuiten is het een meetfout, geen dak. */
const FACTOR_MIN = 0.3;
const FACTOR_MAX = 2;
const AZ_STEP = 15;
const EL_STEP = 5;

/** Per dag (`JJJJ-MM-DD`, UTC) 96 kwartieren: de gemiddelde zon in W, of null zonder metingen. */
export type QuarterDays = Readonly<Record<string, readonly (number | null)[]>>;

/** De kwartieren van één dagbestand van het beslislogboek. */
export async function quartersOfDay(path: string, dayStartMs: number): Promise<(number | null)[]> {
  const sum = new Array<number>(96).fill(0);
  const n = new Array<number>(96).fill(0);
  for await (const line of linesOf(path)) {
    if (!line.includes('"zonW"')) continue;
    let record: { t?: unknown; zonW?: unknown };
    try {
      record = JSON.parse(line) as { t?: unknown; zonW?: unknown };
    } catch {
      continue;
    }
    if (typeof record.t !== 'number' || typeof record.zonW !== 'number') continue;
    const q = Math.floor((record.t - dayStartMs) / QUARTER_MS);
    if (q < 0 || q >= 96) continue;
    sum[q]! += record.zonW;
    n[q]! += 1;
  }
  return sum.map((s, q) => (n[q]! >= MIN_SAMPLES ? Math.round(s / n[q]!) : null));
}

const DAY_OF = /(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/;

/**
 * De kwartieren van alle afgesloten dagen, bijgehouden naast het logboek.
 *
 * `current` geeft meteen wat er is; het bijwerken loopt erachter, hooguit één
 * keer tegelijk. Een eerste keer leest hij alle dagbestanden (op de NAS een
 * paar seconden), daarna alleen een nieuwe dag.
 */
export class SolarHistory {
  readonly #logDir: string;
  readonly #now: () => number;
  #days: Record<string, (number | null)[]> = {};
  #loaded = false;
  #running: Promise<void> | null = null;
  #checkedDay: string | null = null;

  constructor(options: { logDir: string; now?: () => number }) {
    this.#logDir = options.logDir;
    this.#now = options.now ?? Date.now;
  }

  get current(): QuarterDays {
    return this.#days;
  }

  /** Werkt bij als er een dag bij kan zijn gekomen. Wacht niet als het al loopt. */
  refresh(): Promise<void> {
    const today = new Date(this.#now()).toISOString().slice(0, 10);
    if (this.#checkedDay === today) return Promise.resolve();
    this.#running ??= this.#update(today).finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #update(today: string): Promise<void> {
    const file = join(this.#logDir, SOLAR_FILE);
    if (!this.#loaded) {
      try {
        const saved = JSON.parse(await readFile(file, 'utf-8')) as { dagen?: Record<string, (number | null)[]> };
        this.#days = { ...(saved.dagen ?? {}) };
      } catch {
        // Nog niet bewaard, of onleesbaar: dan opnieuw uit het logboek.
      }
      this.#loaded = true;
    }
    let added = 0;
    for (const path of await findLogFiles(this.#logDir)) {
      const day = DAY_OF.exec(basename(path))?.[1];
      // Vandaag is niet af; een dag die er al staat, verandert niet meer.
      if (day == null || day >= today || this.#days[day] != null) continue;
      this.#days = { ...this.#days, [day]: await quartersOfDay(path, Date.parse(`${day}T00:00:00Z`)) };
      added += 1;
    }
    if (added > 0) {
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify({ versie: 1, dagen: this.#days }), 'utf-8');
      await rename(temp, file);
    }
    this.#checkedDay = today;
  }
}

/** Wat het huis over zijn panelen heeft geleerd. */
export interface SolarLearned {
  /** Per vak van de hemel de factor op het model. */
  readonly bins: ReadonlyMap<string, number>;
  /** Het midden van de geleerde vakken, voor een stand die nog niet langskwam; null zonder. */
  readonly overall: number | null;
  /** Uit hoeveel dagen. */
  readonly days: number;
}

const binOf = (sun: SunPosition) =>
  `${Math.floor(sun.azimuthDeg / AZ_STEP) * AZ_STEP}|${Math.floor(sun.elevationDeg / EL_STEP) * EL_STEP}`;

/** Het model zonder rendement en zonder omvormer: wat er op de vlakken valt, maal de wattpiek. */
export function modelW(geometry: Geometry, sun: SunPosition): number {
  return geometry.solarPlanes.reduce((sum, p) => sum + (clearSkyOnPlaneWm2(sun, p) / 1000) * p.peakW, 0);
}

export function learnSolar(days: QuarterDays, geometry: Geometry, location: Location): SolarLearned {
  const perBin = new Map<string, Map<string, number>>();
  const clipW = (geometry.inverterMaxW ?? Infinity) * 0.97;
  let used = 0;
  for (const [day, quarters] of Object.entries(days)) {
    const start = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(start)) continue;
    let any = false;
    quarters.forEach((measured, q) => {
      if (measured == null) return;
      // Afgekapt door de omvormer zegt niets over wat het dak kan.
      if (measured >= clipW) return;
      const sun = sunPosition(start + q * QUARTER_MS + QUARTER_MS / 2, location.latDeg, location.lonDeg);
      if (sun.elevationDeg < MIN_ELEVATION) return;
      const model = modelW(geometry, sun);
      if (model < MIN_MODEL_W) return;
      const ratio = measured / model;
      const key = binOf(sun);
      const byDay = perBin.get(key) ?? new Map<string, number>();
      byDay.set(day, Math.max(byDay.get(day) ?? 0, ratio));
      perBin.set(key, byDay);
      any = true;
    });
    if (any) used += 1;
  }
  const raw = new Map<string, { factor: number; days: number }>();
  for (const [key, byDay] of perBin) {
    if (byDay.size < MIN_DAYS) continue;
    const sorted = [...byDay.values()].sort((a, b) => b - a);
    raw.set(key, { factor: Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, sorted[1]!)), days: byDay.size });
  }
  const values = [...raw.values()].map((b) => b.factor).sort((a, b) => a - b);
  const overall = values.length === 0 ? null : values[Math.floor(values.length / 2)]!;
  const bins = new Map<string, number>();
  for (const [key, b] of raw) {
    bins.set(key, b.factor < overall! && b.days < SHADE_DAYS ? overall! : b.factor);
  }
  return { bins, overall, days: used };
}

/** De factor voor deze stand van de zon, en of hij geleerd is. */
export function factorFor(learned: SolarLearned | null, sun: SunPosition, fallback: number): { factor: number; learned: boolean } {
  if (learned == null) return { factor: fallback, learned: false };
  const own = learned.bins.get(binOf(sun));
  if (own != null) return { factor: own, learned: true };
  if (learned.overall != null) return { factor: learned.overall, learned: true };
  return { factor: fallback, learned: false };
}
