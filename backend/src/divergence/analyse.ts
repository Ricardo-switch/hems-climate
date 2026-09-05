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

const BUCKET_MS = 15 * 60_000;

/** Tolerantie voor import waar we niemand op afrekenen, in W. */
const IMPORT_TOLERANCE_W = 50;

interface OpenEpisode {
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

export async function analyse(
  moments: AsyncIterable<Moment>,
  options: AnalyseOptions = {},
): Promise<Analysis> {
  const minMinutes = options.minEpisodeMinutes ?? 2;

  const tallies = new Map<string, ActuatorTally>();
  const open = new Map<string, OpenEpisode>();
  const episodes: Episode[] = [];
  const buckets = new Map<number, BucketState>();

  let fromMs = Number.POSITIVE_INFINITY;
  let toMs = Number.NEGATIVE_INFINITY;
  let count = 0;
  let failsafeMoments = 0;
  let withObservation = 0;
  let legacyGridWh = 0;
  let avoidableGridWh = 0;
  let previousMs: number | null = null;

  const tallyFor = (id: string): ActuatorTally => {
    let t = tallies.get(id);
    if (!t) {
      t = { actuatorId: id, agree: 0, stricter: 0, looser: 0 };
      tallies.set(id, t);
    }
    return t;
  };

  for await (const moment of moments) {
    count += 1;
    fromMs = Math.min(fromMs, moment.tMs);
    toMs = Math.max(toMs, moment.tMs);
    if (moment.failsafe) failsafeMoments += 1;
    if (Object.keys(moment.observed).length > 0) withObservation += 1;

    // Hoe lang dit moment "geldig" was: tot het volgende. Een vaste stap
    // aannemen zou fout zijn, want de snelheidsbegrenzer maakt de afstand
    // ongelijk en een herstart laat een gat achter.
    const gapMinutes =
      previousMs == null ? 0 : Math.min(5, (moment.tMs - previousMs) / 60_000);
    previousMs = moment.tMs;

    const ids =
      options.actuatorIds ??
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

      const tally = tallyFor(id);
      const key = id;

      if (legacyOn === mineOn) {
        tally.agree += 1;
        const closing = open.get(key);
        if (closing) {
          const done = closeEpisode(closing);
          if (done.minutes >= minMinutes) episodes.push(done);
          open.delete(key);
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

      const existing = open.get(key);
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
          if (done.minutes >= minMinutes) episodes.push(done);
        }
        const blocks = new Map<string, number>();
        for (const r of moment.rejected) {
          if (r.actuatorId === id) blocks.set(r.blockedBy, 1);
        }
        open.set(key, {
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
      legacyGridWh += attributableWh;
      if (anyArbiterWouldStop) avoidableGridWh += attributableWh;
    }

    if (moment.failsafe) bucketState = 'failsafe';
    const bucket = Math.floor(moment.tMs / BUCKET_MS) * BUCKET_MS;
    const current = buckets.get(bucket);
    // Afwijking overheerst in de weergave: een kwartier waarin het één minuut
    // misging is interessanter dan een kwartier waarin alles klopte.
    const rank: Record<BucketState, number> = {
      geen: 0,
      'beide-uit': 1,
      eens: 2,
      ruimer: 3,
      strenger: 4,
      failsafe: 5,
    };
    if (current == null || rank[bucketState] > rank[current]) {
      buckets.set(bucket, bucketState);
    }
  }

  for (const still of open.values()) {
    const done = closeEpisode(still);
    if (done.minutes >= minMinutes) episodes.push(done);
  }

  episodes.sort((a, b) => b.minutes - a.minutes);

  return {
    fromMs: Number.isFinite(fromMs) ? fromMs : 0,
    toMs: Number.isFinite(toMs) ? toMs : 0,
    moments: count,
    momentsWithObservation: withObservation,
    failsafeMoments,
    tallies: [...tallies.values()].sort((a, b) =>
      a.actuatorId.localeCompare(b.actuatorId),
    ),
    episodes,
    legacyGridWh,
    avoidableGridWh,
    buckets,
  };
}
