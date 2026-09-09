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
import { statusVanBestanden, type DatasetStatus } from './dataset.js';

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
export interface Patroon {
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
function patronen(episodes: readonly Episode[], maximaal: number): Patroon[] {
  const per = new Map<string, Patroon & { keren: number }>();
  for (const e of episodes) {
    const sleutel = `${e.actuatorId}|${e.direction}|${e.blockedBy ?? ''}|${e.mode}`;
    const bestaand = per.get(sleutel);
    if (bestaand) {
      per.set(sleutel, {
        ...bestaand,
        keren: bestaand.keren + 1,
        minuten: bestaand.minuten + e.minutes,
        langsteMinuten: Math.max(bestaand.langsteMinuten, e.minutes),
        wh: bestaand.wh + e.attributableWh,
        laatsteMs: Math.max(bestaand.laatsteMs, e.toMs),
      });
    } else {
      per.set(sleutel, {
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
  return [...per.values()].sort((a, b) => b.minuten - a.minuten).slice(0, maximaal);
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
  readonly maxPatronen?: number;
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
  /** Terugkerende afwijkingen, zwaarste eerst. */
  readonly patronen: readonly Patroon[];
  readonly legacyGridWh: number;
  readonly avoidableGridWh: number;
  /** Hoe compleet de opname is. Null wanneer er niets te lezen viel. */
  readonly dataset: DatasetStatus | null;
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
      maxPatronen: options.maxPatronen ?? 10,
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

      // Tweede keer langs dezelfde bestanden. Bewust, want het is een andere
      // vraag: de analyse hierboven vergelijkt twee regelaars, deze telt wat de
      // opname heeft gezien. Ze in één doorloop persen zou beide functies
      // troebel maken voor 120 ms winst per kwartier.
      const dataset = await statusVanBestanden(files);

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
        // Over álle episodes, niet over de getoonde: een patroon van veertig
        // korte hikjes zou anders onzichtbaar blijven.
        patronen: patronen(a.episodes, this.#options.maxPatronen),
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
