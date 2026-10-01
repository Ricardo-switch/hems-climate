/**
 * Van momenten naar iets waar je een gesprek over kunt voeren.
 *
 * De verleiding is om per minuut te tellen en een percentage te tonen. Dat geeft
 * een cijfer waar je niets mee kunt: vierhonderd afwijkende minuten zeggen niet
 * of dat vierhonderd losse hikjes waren of drie keer een lange middag. Daarom
 * worden aaneengesloten afwijkingen samengevoegd tot episodes, met per episode
 * de reden die de arbiter zelf opgaf.
 */

import { arbiterRunning, observedRunning, type Moment } from './read.js';

/** Wie loopt er voor op wie. */
export type Direction = 'strenger' | 'ruimer';

export interface Episode {
  readonly actuatorId: string;
  readonly direction: Direction;
  readonly fromMs: number;
  readonly toMs: number;
  readonly minutes: number;
  /** Aantal momenten in deze episode. */
  readonly samples: number;
  /** Vaakst genoemde reden waarom de arbiter het voorstel blokkeerde. */
  readonly blockedBy: string | null;
  /** Wat het oude systeem er zelf over zei, aan het begin van de episode. */
  readonly legacy: string | null;
  readonly mode: string;
  /** Gemiddeld netvermogen; negatief bij teruglevering. */
  readonly meanGridW: number;
  /** Netstroom die aan de draaiende apparaten toe te rekenen valt, in Wh. */
  readonly attributableWh: number;
}

export interface ActuatorTally {
  readonly actuatorId: string;
  agree: number;
  stricter: number;
  looser: number;
}

export interface Analysis {
  readonly fromMs: number;
  readonly toMs: number;
  readonly moments: number;
  /**
   * Momenten waarop de waarneming van het oude systeem is meegeschreven.
   *
   * Logboeken van vóór die toevoeging hebben dit niet, en dan valt er niets te
   * vergelijken. Beter dat hardop zeggen dan een tabel vol nullen tonen.
   */
  readonly momentsWithObservation: number;
  readonly failsafeMoments: number;
  readonly tallies: readonly ActuatorTally[];
  readonly episodes: readonly Episode[];
  /** Netstroom die het oude systeem aan de airco's besteedde, in Wh. */
  readonly legacyGridWh: number;
  /** Daarvan het deel waarop de arbiter zou hebben teruggeschakeld. */
  readonly avoidableGridWh: number;
  /** Tijdvakken van een kwartier, voor de tijdlijn. */
  readonly buckets: ReadonlyMap<number, BucketState>;
}

/** Wat er in een kwartier overheerste. */
export type BucketState = 'geen' | 'beide-uit' | 'eens' | 'strenger' | 'ruimer' | 'failsafe';

export const BUCKET_MS = 15 * 60_000;
export const BUCKETS_PER_DAY = 96;

/**
 * Eén teken per tijdvak.
 *
 * Gedeeld door de terminal en de webweergave. Twee losse tabellen zouden vroeg
 * of laat iets anders betekenen, en dan zegt "de tijdlijn" op twee plekken iets
 * anders — precies de bugklasse waar dit project vandaan komt.
 */
export const BUCKET_CODE: Readonly<Record<BucketState, string>> = {
  geen: ' ',
  'beide-uit': '·',
  eens: '=',
  ruimer: '+',
  strenger: '!',
  failsafe: 'X',
};

export interface DayRow {
  /** JJJJ-MM-DD in lokale tijd. */
  readonly day: string;
  /** 96 tijdvakken van een kwartier, middernacht tot middernacht. */
  readonly states: readonly BucketState[];
}

/**
 * Zet de tijdvakken om naar één rij per dag.
 *
 * Lokale tijd en niet UTC: een tijdlijn waarop "de middag" niet in het midden
 * ligt is onleesbaar. Dagen zonder waarneming krijgen `geen`, zodat een gat in
 * de opname zichtbaar blijft in plaats van weg te vallen.
 */
export function bucketsPerDay(
  buckets: ReadonlyMap<number, BucketState>,
): DayRow[] {
  const byDay = new Map<string, BucketState[]>();
  for (const [bucketMs, state] of buckets) {
    const d = new Date(bucketMs);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let row = byDay.get(day);
    if (!row) {
      row = new Array<BucketState>(BUCKETS_PER_DAY).fill('geen');
      byDay.set(day, row);
    }
    const midnight = new Date(bucketMs);
    midnight.setHours(0, 0, 0, 0);
    const index = Math.floor((bucketMs - midnight.getTime()) / BUCKET_MS);
    if (index >= 0 && index < BUCKETS_PER_DAY) row[index] = state;
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, states]) => ({ day, states }));
}

/** Tolerantie voor import waar we niemand op afrekenen, in W. */
const IMPORT_TOLERANCE_W = 50;

export interface OpenEpisode {
  actuatorId: string;
  direction: Direction;
  fromMs: number;
  toMs: number;
  samples: number;
  blocks: Map<string, number>;
  legacy: string | null;
  mode: string;
  gridSum: number;
  attributableWh: number;
}

function closeEpisode(open: OpenEpisode): Episode {
  let blockedBy: string | null = null;
  let best = 0;
  for (const [code, n] of open.blocks) {
    if (n > best) {
      best = n;
      blockedBy = code;
    }
  }
  return {
    actuatorId: open.actuatorId,
    direction: open.direction,
    fromMs: open.fromMs,
    toMs: open.toMs,
    minutes: Math.max(1, Math.round((open.toMs - open.fromMs) / 60_000)),
    samples: open.samples,
    blockedBy,
    legacy: open.legacy,
    mode: open.mode,
    meanGridW: open.samples === 0 ? 0 : open.gridSum / open.samples,
    attributableWh: open.attributableWh,
  };
}

export interface AnalyseOptions {
  /** Welke apparaten vergeleken worden. Standaard alles wat in het log voorkomt. */
  readonly actuatorIds?: readonly string[];
  /** Episodes korter dan dit worden weggelaten. */
  readonly minEpisodeMinutes?: number;
}

/**
 * De doorlopende stand van de analyse (besluit 63).
 *
 * Alles wat van moment naar moment meegaat, in één object, zodat het na een
 * afgesloten dag bevroren kan worden en later voortgezet. `structuredClone`
 * kan hem kopiëren en `node:v8` kan hem bewaren: alleen getallen, tekst,
 * arrays, Maps en gewone objecten.
 */
export interface AnalyserState {
  tallies: Map<string, ActuatorTally>;
  open: Map<string, OpenEpisode>;
  episodes: Episode[];
  buckets: Map<number, BucketState>;
  fromMs: number;
  toMs: number;
  count: number;
  failsafeMoments: number;
  withObservation: number;
  legacyGridWh: number;
  avoidableGridWh: number;
  previousMs: number | null;
}

function emptyAnalyserState(): AnalyserState {
  return {
    tallies: new Map(),
    open: new Map(),
    episodes: [],
    buckets: new Map(),
    fromMs: Number.POSITIVE_INFINITY,
    toMs: Number.NEGATIVE_INFINITY,
    count: 0,
    failsafeMoments: 0,
    withObservation: 0,
    legacyGridWh: 0,
    avoidableGridWh: 0,
    previousMs: null,
  };
}

/** Afwijking overheerst in de weergave; zie `add`. */
const BUCKET_RANK: Record<BucketState, number> = {
  geen: 0,
  'beide-uit': 1,
  eens: 2,
  ruimer: 3,
  strenger: 4,
  failsafe: 5,
};

/**
 * De analyse als optelling: moment voor moment erbij, en op elk punt een
 * uitkomst. Wie alles in één keer wil, gebruikt `analyse`.
 */
export class Analyser {
  readonly #options: AnalyseOptions;
  readonly #minMinutes: number;
  readonly #s: AnalyserState;

  constructor(options: AnalyseOptions = {}, state: AnalyserState = emptyAnalyserState()) {
    this.#options = options;
    this.#minMinutes = options.minEpisodeMinutes ?? 2;
    this.#s = state;
  }

  /** Een kopie van de stand, om te bewaren of later voort te zetten. */
  snapshot(): AnalyserState {
    return structuredClone(this.#s);
  }

  #tallyFor(id: string): ActuatorTally {
    let t = this.#s.tallies.get(id);
    if (!t) {
      t = { actuatorId: id, agree: 0, stricter: 0, looser: 0 };
      this.#s.tallies.set(id, t);
    }
    return t;
  }

  add(moment: Moment): void {
    const s = this.#s;
    s.count += 1;
    s.fromMs = Math.min(s.fromMs, moment.tMs);
    s.toMs = Math.max(s.toMs, moment.tMs);
    if (moment.failsafe) s.failsafeMoments += 1;
    if (Object.keys(moment.observed).length > 0) s.withObservation += 1;

    // Hoe lang dit moment "geldig" was: tot het volgende. Een vaste stap
    // aannemen zou fout zijn, want de snelheidsbegrenzer maakt de afstand
    // ongelijk en een herstart laat een gat achter.
    const gapMinutes =
      s.previousMs == null ? 0 : Math.min(5, (moment.tMs - s.previousMs) / 60_000);
    s.previousMs = moment.tMs;

    const ids =
      this.#options.actuatorIds ??
      Object.keys(moment.observed).filter((id) => id.startsWith('ac-'));

    // Netstroom die aan de draaiende apparaten valt toe te rekenen. Het
    // netvermogen bevat hun verbruik al, dus alleen echte import boven de
    // tolerantie telt, en hoogstens zoveel als ze samen opnemen.
    const runningDraw = moment.budget.reclaimableW;
    const attributableW = Math.max(
      0,
      Math.min(moment.budget.gridPowerW - IMPORT_TOLERANCE_W, runningDraw),
    );
    const attributableWh = (attributableW * gapMinutes) / 60;

    let anyLegacyRunning = false;
    let anyArbiterWouldStop = false;
    let bucketState: BucketState = 'beide-uit';

    for (const id of ids) {
      const legacyOn = observedRunning(moment.observed[id]);
      const mineOn = arbiterRunning(moment, id);
      if (legacyOn) anyLegacyRunning = true;
      if (legacyOn && !mineOn) anyArbiterWouldStop = true;

      const tally = this.#tallyFor(id);
      const key = id;

      if (legacyOn === mineOn) {
        tally.agree += 1;
        const closing = s.open.get(key);
        if (closing) {
          const done = closeEpisode(closing);
          if (done.minutes >= this.#minMinutes) s.episodes.push(done);
          s.open.delete(key);
        }
        if (legacyOn && bucketState !== 'strenger' && bucketState !== 'ruimer') {
          bucketState = 'eens';
        }
        continue;
      }

      const direction: Direction = legacyOn ? 'strenger' : 'ruimer';
      if (direction === 'strenger') tally.stricter += 1;
      else tally.looser += 1;
      if (bucketState !== 'strenger') {
        bucketState = direction === 'strenger' ? 'strenger' : 'ruimer';
      }

      const existing = s.open.get(key);
      if (existing && existing.direction === direction) {
        existing.toMs = moment.tMs;
        existing.samples += 1;
        existing.gridSum += moment.budget.gridPowerW;
        existing.attributableWh += direction === 'strenger' ? attributableWh : 0;
        for (const r of moment.rejected) {
          if (r.actuatorId !== id) continue;
          existing.blocks.set(r.blockedBy, (existing.blocks.get(r.blockedBy) ?? 0) + 1);
        }
      } else {
        if (existing) {
          const done = closeEpisode(existing);
          if (done.minutes >= this.#minMinutes) s.episodes.push(done);
        }
        const blocks = new Map<string, number>();
        for (const r of moment.rejected) {
          if (r.actuatorId === id) blocks.set(r.blockedBy, 1);
        }
        s.open.set(key, {
          actuatorId: id,
          direction,
          fromMs: moment.tMs,
          toMs: moment.tMs,
          samples: 1,
          blocks,
          legacy: moment.legacy,
          mode: moment.mode,
          gridSum: moment.budget.gridPowerW,
          attributableWh: direction === 'strenger' ? attributableWh : 0,
        });
      }
    }

    if (anyLegacyRunning) {
      s.legacyGridWh += attributableWh;
      if (anyArbiterWouldStop) s.avoidableGridWh += attributableWh;
    }

    if (moment.failsafe) bucketState = 'failsafe';
    const bucket = Math.floor(moment.tMs / BUCKET_MS) * BUCKET_MS;
    const current = s.buckets.get(bucket);
    // Afwijking overheerst in de weergave: een kwartier waarin het één minuut
    // misging is interessanter dan een kwartier waarin alles klopte.
    if (current == null || BUCKET_RANK[bucketState] > BUCKET_RANK[current]) {
      s.buckets.set(bucket, bucketState);
    }
  }

  /**
   * De uitkomst tot nu toe. Raakt de stand niet: episodes die nog open staan
   * worden in een kopie gesloten, zodat er daarna gewoon verder geteld kan
   * worden.
   */
  result(): Analysis {
    const s = this.#s;
    const episodes = [...s.episodes];
    for (const still of s.open.values()) {
      const done = closeEpisode(still);
      if (done.minutes >= this.#minMinutes) episodes.push(done);
    }
    episodes.sort((a, b) => b.minutes - a.minutes);

    return {
      fromMs: Number.isFinite(s.fromMs) ? s.fromMs : 0,
      toMs: Number.isFinite(s.toMs) ? s.toMs : 0,
      moments: s.count,
      momentsWithObservation: s.withObservation,
      failsafeMoments: s.failsafeMoments,
      tallies: [...s.tallies.values()]
        .map((t) => ({ ...t }))
        .sort((a, b) => a.actuatorId.localeCompare(b.actuatorId)),
      episodes,
      legacyGridWh: s.legacyGridWh,
      avoidableGridWh: s.avoidableGridWh,
      buckets: new Map(s.buckets),
    };
  }
}

export async function analyse(
  moments: AsyncIterable<Moment>,
  options: AnalyseOptions = {},
): Promise<Analysis> {
  const analyser = new Analyser(options);
  for await (const moment of moments) analyser.add(moment);
  return analyser.result();
}
