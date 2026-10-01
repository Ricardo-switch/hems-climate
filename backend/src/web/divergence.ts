/**
 * De divergentieanalyse, klaargezet voor de webweergave.
 *
 * Dit is dezelfde analyse die `npm run divergence` in de terminal draait — één
 * `analyse()`, twee vensters. Het verschil zit alleen in wanneer hij draait en
 * hoe hij wordt opgeschreven.
 *
 * **Waarom een cache en niet per verzoek.** Gemeten op eigen logboeken loopt
 * `analyse()` op ongeveer 280.000 momenten per seconde. Vijf dagen kosten zo
 * 120 ms; een winter van honderdtachtig dagen wordt eerder vier seconden. Dat
 * is geen ramp — de analyse is I/O-verweven, dus de event loop blijft vrij (met
 * de huidige logboeken gemeten op 0 ms vertraging) — maar het is wel zonde om
 * het bij elke paginaweergave opnieuw te doen voor een uitkomst die per kwartier
 * hoogstens één tijdvak opschuift.
 *
 * **Waarom niet vooraf wegschrijven.** Dat zou een tweede waarheid maken die
 * kan verlopen zonder dat iemand het merkt. Nu staat er bij elk antwoord wanneer
 * hij is berekend en hoe lang dat duurde, en kan de pagina daar eerlijk over
 * zijn.
 *
 * **Wat er sinds besluit 63 wel bewaard wordt: een tussenstand, geen uitkomst.**
 * Die schatting van vier seconden bleek op de NAS 35 te zijn, na 26 dagen. Dus
 * bewaren we de doorlopende stand van de analyse na de laatste afgesloten dag,
 * en leest een ronde alleen wat daarna kwam (`review-checkpoint.ts`). De
 * uitkomst wordt nog steeds elke ronde berekend. Een tussenstand die niet meer
 * klopt met de bestanden wordt weggegooid, en een test bewaakt dat voortzetten
 * precies hetzelfde oplevert als opnieuw rekenen.
 */

import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { Analyser, bucketsPerDay, BUCKET_CODE, type Episode } from '../divergence/analyse.js';
import { findLogFiles, newReaderCarry, readMoments } from '../divergence/read.js';
import { DatasetCounter, type DatasetStatus } from './dataset.js';
import {
  CHECKPOINT_VERSION,
  coveredPrefix,
  loadCheckpoint,
  saveCheckpoint,
  type Checkpoint,
  type DayFile,
} from './review-checkpoint.js';

/**
 * Een terugkerende afwijking, samengevat.
 *
 * Een lijst van tweeënzeventig losse episodes vertelt je wat er is gebeurd,
 * maar niet wat er stéeds gebeurt. Door ze te groeperen op wat ze
 * gemeenschappelijk hebben — welk apparaat, welke kant op, om welke reden, in
 * welke modus — verschuift de vraag van "wat gebeurde er die middag" naar
 * "waar loopt dit systematisch uit de pas". Dat tweede is waar je iets aan
 * verandert.
 */
export interface Pattern {
  readonly actuatorId: string;
  readonly direction: 'strenger' | 'ruimer';
  readonly blockedBy: string | null;
  readonly mode: string;
  /** Hoe vaak dit patroon als losse episode voorkwam. */
  readonly keren: number;
  readonly minuten: number;
  readonly langsteMinuten: number;
  /** Toe te rekenen netstroom over alle keren samen. */
  readonly wh: number;
  readonly laatsteMs: number;
}

/** Groepeert alle episodes en levert de zwaarste bovenaan. */
function patterns(episodes: readonly Episode[], maximum: number): Pattern[] {
  const per = new Map<string, Pattern & { keren: number }>();
  for (const e of episodes) {
    const key = `${e.actuatorId}|${e.direction}|${e.blockedBy ?? ''}|${e.mode}`;
    const existing = per.get(key);
    if (existing) {
      per.set(key, {
        ...existing,
        keren: existing.keren + 1,
        minuten: existing.minuten + e.minutes,
        langsteMinuten: Math.max(existing.langsteMinuten, e.minutes),
        wh: existing.wh + e.attributableWh,
        laatsteMs: Math.max(existing.laatsteMs, e.toMs),
      });
    } else {
      per.set(key, {
        actuatorId: e.actuatorId,
        direction: e.direction,
        blockedBy: e.blockedBy,
        mode: e.mode,
        keren: 1,
        minuten: e.minutes,
        langsteMinuten: e.minutes,
        wh: e.attributableWh,
        laatsteMs: e.toMs,
      });
    }
  }
  // Op totale tijd en niet op aantal: twintig hikjes van twee minuten zijn
  // minder waard dan drie middagen van een uur.
  return [...per.values()].sort((a, b) => b.minuten - a.minuten).slice(0, maximum);
}

export interface DivergenceOptions {
  /** Map met `decisions-JJJJ-MM-DD.ndjson`. */
  readonly logDir: string;
  /** Hoe vaak opnieuw rekenen. Standaard een kwartier — de tijdvakgrootte. */
  readonly refreshMs?: number;
  /** Episodes korter dan dit blijven buiten het rapport. */
  readonly minEpisodeMinutes?: number;
  /** Hoeveel episodes er meegaan. De rest wordt geteld, niet opgesomd. */
  readonly maxEpisodes?: number;
  /** Hoeveel samengevatte patronen er meegaan. */
  readonly maxPatterns?: number;
  readonly write?: (line: string) => void;
  readonly now?: () => number;
}

/** Wat de weergave krijgt. Bewust plat en compact; zie `dagen`. */
export interface DivergenceReport {
  readonly berekendOpMs: number;
  readonly duurMs: number;
  readonly bestanden: number;
  /** Hoeveel daarvan deze ronde gelezen zijn; de rest zat in de tussenstand. */
  readonly opnieuwGelezen: number;
  readonly vanMs: number;
  readonly totMs: number;
  readonly momenten: number;
  readonly momentenMetWaarneming: number;
  readonly failsafeMomenten: number;
  readonly tallies: readonly {
    actuatorId: string;
    agree: number;
    stricter: number;
    looser: number;
  }[];
  /**
   * De tijdlijn, één regel per dag van 96 tekens.
   *
   * Als string en niet als array: een winter is 17.280 tijdvakken, en die als
   * losse objecten versturen maakt het antwoord tien keer zo groot voor
   * dezelfde inhoud. De tekencodes komen uit `BUCKET_CODE`, gedeeld met de
   * terminal.
   */
  readonly dagen: readonly { day: string; states: string }[];
  readonly codes: Readonly<Record<string, string>>;
  readonly episodes: readonly Episode[];
  readonly episodesTotaal: number;
  /** Terugkerende afwijkingen, zwaarste eerst. */
  readonly patronen: readonly Pattern[];
  readonly legacyGridWh: number;
  readonly avoidableGridWh: number;
  /** Hoe compleet de opname is. Null wanneer er niets te lezen viel. */
  readonly dataset: DatasetStatus | null;
}

export class DivergenceCache {
  readonly #options: Required<DivergenceOptions>;
  #latest: DivergenceReport | null = null;
  #timer: NodeJS.Timeout | null = null;
  #busy = false;
  /** De stand na de laatste afgesloten dag (besluit 63). */
  #checkpoint: Checkpoint | null = null;
  #checkpointLoaded = false;

  constructor(options: DivergenceOptions) {
    this.#options = {
      logDir: options.logDir,
      refreshMs: options.refreshMs ?? 15 * 60_000,
      minEpisodeMinutes: options.minEpisodeMinutes ?? 2,
      maxEpisodes: options.maxEpisodes ?? 25,
      maxPatterns: options.maxPatterns ?? 10,
      write: options.write ?? ((line) => console.log(line)),
      now: options.now ?? Date.now,
    };
  }

  get latest(): DivergenceReport | null {
    return this.#latest;
  }

  /** Rekent één keer door. Fouten worden gemeld, niet geworpen. */
  async refresh(): Promise<DivergenceReport | null> {
    // Overlappende runs hebben geen zin en zouden bij een groeiend logboek op
    // elkaar gaan stapelen.
    if (this.#busy) return this.#latest;
    this.#busy = true;
    const t0 = this.#options.now();
    try {
      const { logDir, minEpisodeMinutes } = this.#options;
      const files = await findLogFiles(logDir);
      if (files.length === 0) {
        this.#latest = null;
        return null;
      }

      /*
       * Afgesloten is een dag waar niets meer bij kan komen. De dagbestanden
       * heten naar de UTC-datum van het besluit; tien minuten na middernacht
       * UTC is de vorige dag dus dicht.
       */
      const closedBefore = new Date(this.#options.now() - 10 * 60_000).toISOString().slice(0, 10);
      const infos: (DayFile & { path: string })[] = await Promise.all(
        files.map(async (path) => {
          const name = basename(path);
          return { path, name, day: name.slice(10, 20), size: (await stat(path)).size };
        }),
      );
      const closed = infos.filter((f) => f.day < closedBefore);
      const recent = infos.slice(closed.length);

      if (!this.#checkpointLoaded) {
        this.#checkpointLoaded = true;
        this.#checkpoint = await loadCheckpoint(logDir);
      }
      const saved = this.#checkpoint;
      const covered = saved == null ? null : coveredPrefix(saved, closed, minEpisodeMinutes);

      // Verder vanaf een kopie: de tussenstand zelf blijft onaangeroerd.
      const carry = saved && covered != null ? structuredClone(saved.carry) : newReaderCarry();
      const analyser = new Analyser(
        { minEpisodeMinutes },
        saved && covered != null ? structuredClone(saved.analyser) : undefined,
      );
      const counter = new DatasetCounter(
        saved && covered != null ? structuredClone(saved.counter) : undefined,
      );

      const feed = async (paths: readonly string[]): Promise<void> => {
        for await (const m of readMoments(paths, carry)) {
          analyser.add(m);
          counter.add(m);
        }
      };

      const newlyClosed = closed.slice(covered ?? 0);
      await feed(newlyClosed.map((f) => f.path));
      if (newlyClosed.length > 0 || covered == null) {
        this.#checkpoint = {
          version: CHECKPOINT_VERSION,
          minEpisodeMinutes,
          files: closed.map(({ day, name, size }) => ({ day, name, size })),
          carry: structuredClone(carry),
          analyser: analyser.snapshot(),
          counter: counter.snapshot(),
        };
        // Lukt het niet, dan rekent de volgende herstart alles opnieuw. Dat is
        // traag, niet fout.
        await saveCheckpoint(logDir, this.#checkpoint).catch((error: unknown) => {
          this.#options.write(`  tussenstand van de terugblik niet bewaard: ${String(error)}`);
        });
      }
      await feed(recent.map((f) => f.path));

      const a = analyser.result();
      if (a.moments === 0) {
        this.#latest = null;
        return null;
      }
      // In dezelfde doorloop als de analyse, met een eigen optelling: het zijn
      // twee vragen (twee regelaars vergelijken, en tellen wat de opname zag),
      // maar wel over dezelfde momenten.
      const dataset = counter.result();

      this.#latest = {
        berekendOpMs: this.#options.now(),
        duurMs: this.#options.now() - t0,
        bestanden: files.length,
        opnieuwGelezen: newlyClosed.length + recent.length,
        vanMs: a.fromMs,
        totMs: a.toMs,
        momenten: a.moments,
        momentenMetWaarneming: a.momentsWithObservation,
        failsafeMomenten: a.failsafeMoments,
        tallies: a.tallies.map((t) => ({ ...t })),
        dagen: bucketsPerDay(a.buckets).map(({ day, states }) => ({
          day,
          states: states.map((s) => BUCKET_CODE[s]).join(''),
        })),
        codes: BUCKET_CODE,
        episodes: a.episodes.slice(0, this.#options.maxEpisodes),
        episodesTotaal: a.episodes.length,
        // Over álle episodes, niet over de getoonde: een patroon van veertig
        // korte hikjes zou anders onzichtbaar blijven.
        patronen: patterns(a.episodes, this.#options.maxPatterns),
        legacyGridWh: a.legacyGridWh,
        avoidableGridWh: a.avoidableGridWh,
        dataset,
      };
      return this.#latest;
    } catch (error) {
      // Een onleesbaar logboek mag de dienst niet meenemen; de vorige uitkomst
      // blijft staan en de pagina ziet aan `berekendOpMs` dat hij veroudert.
      this.#options.write(`  divergentieanalyse mislukt: ${String(error)}`);
      return this.#latest;
    } finally {
      this.#busy = false;
    }
  }

  /** Rekent meteen door en daarna elk interval. */
  start(): void {
    if (this.#timer) return;
    void this.refresh();
    this.#timer = setInterval(() => void this.refresh(), this.#options.refreshMs);
    // Mag het afsluiten van het proces niet tegenhouden.
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
