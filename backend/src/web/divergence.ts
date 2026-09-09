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
 */

import { analyse, bucketsPerDay, BUCKET_CODE, type Episode } from '../divergence/analyse.js';
import { findLogFiles, readMoments } from '../divergence/read.js';

export interface DivergenceOptions {
  /** Map met `decisions-JJJJ-MM-DD.ndjson`. */
  readonly logDir: string;
  /** Hoe vaak opnieuw rekenen. Standaard een kwartier — de tijdvakgrootte. */
  readonly refreshMs?: number;
  /** Episodes korter dan dit blijven buiten het rapport. */
  readonly minEpisodeMinutes?: number;
  /** Hoeveel episodes er meegaan. De rest wordt geteld, niet opgesomd. */
  readonly maxEpisodes?: number;
  readonly write?: (line: string) => void;
  readonly now?: () => number;
}

/** Wat de weergave krijgt. Bewust plat en compact; zie `dagen`. */
export interface DivergenceReport {
  readonly berekendOpMs: number;
  readonly duurMs: number;
  readonly bestanden: number;
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
  readonly legacyGridWh: number;
  readonly avoidableGridWh: number;
}

export class DivergenceCache {
  readonly #options: Required<DivergenceOptions>;
  #latest: DivergenceReport | null = null;
  #timer: NodeJS.Timeout | null = null;
  #bezig = false;

  constructor(options: DivergenceOptions) {
    this.#options = {
      logDir: options.logDir,
      refreshMs: options.refreshMs ?? 15 * 60_000,
      minEpisodeMinutes: options.minEpisodeMinutes ?? 2,
      maxEpisodes: options.maxEpisodes ?? 25,
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
    if (this.#bezig) return this.#latest;
    this.#bezig = true;
    const t0 = this.#options.now();
    try {
      const files = await findLogFiles(this.#options.logDir);
      if (files.length === 0) {
        this.#latest = null;
        return null;
      }

      const a = await analyse(readMoments(files), {
        minEpisodeMinutes: this.#options.minEpisodeMinutes,
      });
      if (a.moments === 0) {
        this.#latest = null;
        return null;
      }

      this.#latest = {
        berekendOpMs: this.#options.now(),
        duurMs: this.#options.now() - t0,
        bestanden: files.length,
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
        legacyGridWh: a.legacyGridWh,
        avoidableGridWh: a.avoidableGridWh,
      };
      return this.#latest;
    } catch (error) {
      // Een onleesbaar logboek mag de dienst niet meenemen; de vorige uitkomst
      // blijft staan en de pagina ziet aan `berekendOpMs` dat hij veroudert.
      this.#options.write(`  divergentieanalyse mislukt: ${String(error)}`);
      return this.#latest;
    } finally {
      this.#bezig = false;
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
