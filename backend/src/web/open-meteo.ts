/**
 * Het weer rechtstreeks van Open-Meteo (besluit 127), zonder Home Assistant.
 *
 * Twee dingen. De verwachting per uur voor de komende twee dagen, elk uur
 * bewaard naast de dataset: de buitentemperatuur, de zon, de bewolking en de
 * wind. Dat heeft het thermisch model (D) nodig om de temperatuur van een kamer
 * vooruit te rekenen, en om achteraf te zien hoe goed de verwachting klopte.
 * En de verwachting per dag, als weerbron om uit te kiezen: dan heeft elk huis
 * weer, ook als Home Assistant er geen heeft.
 *
 * Open-Meteo is gratis, zonder sleutel en zonder account, en gebruikt voor
 * Nederland het model van het KNMI. De dienst stuurt alleen de ligging op één
 * decimaal (ongeveer tien kilometer, besluit 90); die komt nooit in een logregel.
 */

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { kindOf, wordsFor, type ForecastDay, type WeatherKind } from './weather.js';

/** De id van deze weerbron in Functies. */
export const OPEN_METEO = 'open-meteo';
export const OPEN_METEO_NAAM = 'Open-Meteo (via internet)';
const URL_BASIS = 'https://api.open-meteo.com/v1/forecast';
/** Het bestand met de verwachting per uur, één regel per ophaalmoment. */
export const UREN_FILE = 'weer-uren.ndjson';
/** Zoveel uur vooruit bewaren: genoeg voor een nacht en een dag vooruit. */
export const UREN_VOORUIT = 48;
const HOUR_MS = 3_600_000;

/** De verwachting per uur, als kolommen vanaf `vanMs`, elk uur één waarde. */
export interface HourlyForecast {
  /** Wanneer opgehaald. */
  readonly opgehaaldMs: number;
  /** Het eerste uur (UTC, op het hele uur). */
  readonly vanMs: number;
  readonly buitenC: readonly (number | null)[];
  readonly vochtPct: readonly (number | null)[];
  readonly wolkenPct: readonly (number | null)[];
  /** Zon op een vlak stuk grond, in W/m², gemiddeld over het uur ervoor. */
  readonly zonWm2: readonly (number | null)[];
  readonly directWm2: readonly (number | null)[];
  readonly diffuusWm2: readonly (number | null)[];
  readonly windMs: readonly (number | null)[];
  readonly regenkansPct: readonly (number | null)[];
}

export interface OpenMeteoWeer {
  readonly uren: HourlyForecast;
  /** Dag 0 is nu, 1 is morgen, zoals Buienradar. */
  readonly dagen: readonly ForecastDay[];
}

/** De vraag aan Open-Meteo. De ligging gaat er op één decimaal in. */
export function openMeteoUrl(location: { readonly latDeg: number; readonly lonDeg: number }, timeZone: string): string {
  const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
  const q = new URLSearchParams({
    latitude: r1(location.latDeg),
    longitude: r1(location.lonDeg),
    hourly: 'temperature_2m,relative_humidity_2m,cloud_cover,shortwave_radiation,direct_radiation,diffuse_radiation,wind_speed_10m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunshine_duration,daylight_duration',
    current: 'weather_code,cloud_cover',
    timezone: timeZone,
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    forecast_days: '6',
  });
  return `${URL_BASIS}?${q.toString()}`;
}

/** WMO-weercode naar onze soorten, zoals Open-Meteo hem geeft. */
export function kindOfCode(code: number | null, wolkenPct: number | null): WeatherKind | null {
  if (code == null) return null;
  if (code >= 95) return 'onweer';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sneeuw';
  // Buien met veel zon ertussen: zon en wolken, met de kans op een bui.
  if (code >= 80 && code <= 82) return wolkenPct != null && wolkenPct <= 60 ? 'half' : 'regen';
  if (code >= 51 && code <= 67) return 'regen';
  if (code === 45 || code === 48) return 'mist';
  if (code <= 1) return 'zon';
  if (code === 2) return 'half';
  if (code === 3) return kindOf('cloudy', wolkenPct == null ? null : 100 - wolkenPct);
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Het antwoord van Open-Meteo naar de uren vanaf nu en de dagen. Null als het niet klopt. */
export function parseOpenMeteo(body: unknown, nowMs: number): OpenMeteoWeer | null {
  if (typeof body !== 'object' || body == null) return null;
  const b = body as Record<string, Record<string, unknown> | undefined>;
  const h = b['hourly'];
  const d = b['daily'];
  if (!h || !d) return null;
  const tijden = list(h['time']).map(num);
  // Vanaf het hele uur van nu; Open-Meteo begint om middernacht.
  const nuUur = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const start = tijden.findIndex((t) => t != null && t * 1000 >= nuUur);
  if (start < 0) return null;
  const kolom = (naam: string) => list(h[naam]).slice(start, start + UREN_VOORUIT).map(num);
  const uren: HourlyForecast = {
    opgehaaldMs: nowMs,
    vanMs: tijden[start]! * 1000,
    buitenC: kolom('temperature_2m'),
    vochtPct: kolom('relative_humidity_2m'),
    wolkenPct: kolom('cloud_cover'),
    zonWm2: kolom('shortwave_radiation'),
    directWm2: kolom('direct_radiation'),
    diffuusWm2: kolom('diffuse_radiation'),
    windMs: kolom('wind_speed_10m'),
    regenkansPct: kolom('precipitation_probability'),
  };

  const dagen: ForecastDay[] = [];
  const c = b['current'];
  if (c) {
    const wolken = num(c['cloud_cover']);
    const soort = kindOfCode(num(c['weather_code']), wolken);
    dagen.push({ offset: 0, maxC: null, minC: null, regenkansPct: null, zonkansPct: wolken == null ? null : Math.round(100 - wolken), soort, tekst: wordsFor(soort, null) });
  }
  const code = list(d['weather_code']).map(num);
  const max = list(d['temperature_2m_max']).map(num);
  const min = list(d['temperature_2m_min']).map(num);
  const regen = list(d['precipitation_probability_max']).map(num);
  const zonuren = list(d['sunshine_duration']).map(num);
  const daglicht = list(d['daylight_duration']).map(num);
  // De eerste dag is vandaag (de tijdzone van het huis); dan morgen tot en met vijf dagen.
  for (let i = 1; i < code.length && i <= 5; i++) {
    const zon = zonuren[i];
    const licht = daglicht[i];
    // Zonkans zoals Buienradar: het deel van de tijd met daglicht dat de zon schijnt.
    const zonkans = zon != null && licht != null && licht > 0 ? Math.round(Math.max(0, Math.min(100, (zon / licht) * 100))) : null;
    const soort = kindOfCode(code[i] ?? null, zonkans == null ? null : 100 - zonkans);
    const kans = regen[i] ?? null;
    dagen.push({ offset: i, maxC: max[i] ?? null, minC: min[i] ?? null, regenkansPct: kans, zonkansPct: zonkans, soort, tekst: wordsFor(soort, kans) });
  }
  return { uren, dagen };
}

export interface OpenMeteoOptions {
  readonly location: () => { readonly latDeg: number; readonly lonDeg: number } | null;
  readonly timeZone: string;
  /** Map met de dataset; zonder map niets bewaren. */
  readonly logDir: string | null;
  /** Voor de tests. */
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/**
 * Haalt het weer op en bewaart de verwachting per uur. Hooguit één keer per
 * drie kwartier; een fout laat het vorige weer staan.
 */
export class OpenMeteo {
  readonly #o: OpenMeteoOptions;
  #latest: OpenMeteoWeer | null = null;
  #lastMs = 0;
  #busy: Promise<void> | null = null;
  #lastSavedFrom = 0;

  constructor(options: OpenMeteoOptions) {
    this.#o = options;
  }

  get latest(): OpenMeteoWeer | null {
    return this.#latest;
  }

  /** Haalt opnieuw op als het laatste weer ouder is dan drie kwartier. */
  refresh(bewaren: boolean): Promise<void> {
    const now = (this.#o.now ?? Date.now)();
    if (now - this.#lastMs < 45 * 60_000) return Promise.resolve();
    this.#busy ??= this.#haal(now, bewaren).finally(() => {
      this.#busy = null;
    });
    return this.#busy;
  }

  async #haal(now: number, bewaren: boolean): Promise<void> {
    const location = this.#o.location();
    if (location == null) return;
    this.#lastMs = now;
    const res = await (this.#o.fetch ?? fetch)(openMeteoUrl(location, this.#o.timeZone), { signal: AbortSignal.timeout(20_000) });
    // Nooit de vraag zelf in de melding: daar staat de ligging in.
    if (!res.ok) throw new Error(`Open-Meteo gaf ${res.status}`);
    const weer = parseOpenMeteo(await res.json(), now);
    if (weer == null) throw new Error('Open-Meteo gaf iets onbekends');
    this.#latest = weer;
    if (bewaren && this.#o.logDir && weer.uren.vanMs !== this.#lastSavedFrom) {
      this.#lastSavedFrom = weer.uren.vanMs;
      await appendFile(join(this.#o.logDir, UREN_FILE), `${JSON.stringify(weer.uren)}\n`, 'utf-8');
    }
  }
}
