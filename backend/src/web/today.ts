/**
 * Vandaag in één antwoord, voor de bewonersweergave (besluit 71).
 *
 * De terugblik rekent over weken en draait elk kwartier; de live stroom kent
 * alleen het besluit van dit moment. Daartussen zat niets, en dat is precies
 * wat een scherm "vandaag" nodig heeft: de zon per kwartier, wanneer elk
 * apparaat draaide (volgens Smart Climate en volgens de huidige regeling), en
 * welke besluiten er vandaag vielen.
 *
 * Gelezen met dezelfde lezer als de terugblik (`readMoments`), zodat "draaide"
 * hier hetzelfde betekent als daar: standby telt niet, en een kort record draagt
 * de wens van de arbiter voort.
 *
 * "Vandaag" is de dag in de tijdzone van de installatie, niet de UTC-dag van de
 * dagbestanden. Om 01:00 in Amsterdam staat het begin van de dag dus nog in het
 * bestand van gisteren.
 */

import { basename } from 'node:path';

import type { SiteConfig } from '../core/model.js';
import { arbiterRunning, findLogFiles, observedRunning, readMoments } from '../divergence/read.js';

const QUARTER_MS = 15 * 60_000;
/** Een gat groter dan dit in het logboek breekt een draaiperiode af. */
const GAP_MS = 10 * 60_000;
/** Bij het optellen van energie telt een moment hooguit zo lang. */
const STEP_CAP_MS = 5 * 60_000;
/** Genoeg voor een scherm; de oudste vallen eraf. */
const MAX_DECISIONS = 200;

export interface TodaySpan {
  readonly vanMs: number;
  readonly totMs: number;
  /** 'cool' of 'heat'. */
  readonly actie: string;
}

export interface TodayDecision {
  readonly tMs: number;
  readonly opdrachten: readonly { kind: string; actuatorId?: string; action?: string; setpointC?: number; timerId?: string; durationS?: number }[];
  readonly redenen: readonly { actuatorId: string; actie: string; strategie: string | null; reden: string | null }[];
}

export interface TodayReport {
  readonly vanMs: number;
  readonly totMs: number;
  /** Per kwartier vanaf middernacht: gemiddelde zon en netvermogen, of null zonder meting. */
  readonly kwartieren: readonly { readonly tMs: number; readonly zonW: number | null; readonly netW: number | null }[];
  readonly zonWh: number;
  readonly netAfWh: number;
  readonly netTerugWh: number;
  readonly apparaten: readonly {
    readonly actuatorId: string;
    readonly smartClimate: readonly TodaySpan[];
    readonly huidig: readonly TodaySpan[];
  }[];
  /** Besluiten met een opdracht, nieuwste eerst. */
  readonly besluiten: readonly TodayDecision[];
}

/** De delen van een tijdstip in een tijdzone. */
function partsIn(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p['year']!, m: +p['month']!, d: +p['day']!, h: +p['hour']!, mi: +p['minute']!, s: +p['second']! };
}

/** Hoeveel een tijdzone op dit moment voorloopt op UTC, in ms. */
function offsetAt(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Middernacht van de dag waarin `nowMs` valt, in de tijdzone van de installatie. */
export function startOfLocalDay(nowMs: number, timeZone: string): number {
  const p = partsIn(nowMs, timeZone);
  const guess = Date.UTC(p.y, p.m - 1, p.d);
  // Twee keer: rond de omschakeling naar zomertijd verschilt de offset om
  // middernacht van die van nu.
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function todayReport(logDir: string, config: SiteConfig, nowMs: number): Promise<TodayReport> {
  const vanMs = startOfLocalDay(nowMs, config.timezone);
  const days = new Set([utcDay(vanMs), utcDay(nowMs)]);
  const files = (await findLogFiles(logDir)).filter((f) => days.has(basename(f).slice(10, 20)));

  const quarters = Math.ceil((nowMs - vanMs) / QUARTER_MS);
  const sums = Array.from({ length: Math.max(0, quarters) }, () => ({ zon: 0, zonN: 0, net: 0, netN: 0 }));
  let zonWh = 0;
  let netAfWh = 0;
  let netTerugWh = 0;

  const ids = config.actuators.map((a) => a.id);
  type Open = { vanMs: number; totMs: number; actie: string } | null;
  const spans = new Map(ids.map((id) => [id, { sc: [] as TodaySpan[], now: [] as TodaySpan[], openSc: null as Open, openNow: null as Open }]));
  const decisions: TodayDecision[] = [];

  /** Verlengt of sluit een draaiperiode met dit moment. */
  const step = (list: TodaySpan[], open: Open, tMs: number, actie: string | null): Open => {
    if (open && (actie !== open.actie || tMs - open.totMs > GAP_MS)) {
      list.push({ vanMs: open.vanMs, totMs: open.totMs, actie: open.actie });
      open = null;
    }
    if (actie == null) return open;
    if (open) return { ...open, totMs: tMs };
    return { vanMs: tMs, totMs: tMs, actie };
  };

  let previous: { tMs: number; zon: number | null; net: number } | null = null;
  let lastMs = vanMs;

  for await (const m of readMoments(files)) {
    if (m.tMs < vanMs || m.tMs > nowMs) continue;
    lastMs = m.tMs;

    const q = Math.floor((m.tMs - vanMs) / QUARTER_MS);
    const bucket = sums[q];
    if (bucket) {
      if (m.solarW != null) {
        bucket.zon += m.solarW;
        bucket.zonN += 1;
      }
      bucket.net += m.budget.gridPowerW;
      bucket.netN += 1;
    }

    if (previous) {
      const hours = Math.min(m.tMs - previous.tMs, STEP_CAP_MS) / 3_600_000;
      if (previous.zon != null) zonWh += previous.zon * hours;
      if (previous.net > 0) netAfWh += previous.net * hours;
      else netTerugWh += -previous.net * hours;
    }
    previous = { tMs: m.tMs, zon: m.solarW, net: m.budget.gridPowerW };

    for (const id of ids) {
      const s = spans.get(id)!;
      const want = arbiterRunning(m, id) ? (m.handsOff ? actionOf(m.observed[id]) : m.arbiterAction[id] ?? actionOf(m.observed[id])) : null;
      s.openSc = step(s.sc, s.openSc, m.tMs, want === 'cool' || want === 'heat' ? want : null);
      const real = observedRunning(m.observed[id]) ? actionOf(m.observed[id]) : null;
      s.openNow = step(s.now, s.openNow, m.tMs, real);
    }

    if (m.full && m.commands.length > 0) {
      const touched = new Set(m.commands.map((c) => c.actuatorId).filter((x): x is string => x != null));
      decisions.push({
        tMs: m.tMs,
        opdrachten: m.commands,
        redenen: m.accepted
          .filter((a) => touched.has(a.actuatorId))
          .map((a) => ({
            actuatorId: a.actuatorId,
            actie: a.action,
            strategie: a.strategyId ?? null,
            reden: (a as { reason?: string }).reason ?? null,
          })),
      });
    }
  }

  const apparaten = ids.map((id) => {
    const s = spans.get(id)!;
    if (s.openSc) s.sc.push({ vanMs: s.openSc.vanMs, totMs: lastMs, actie: s.openSc.actie });
    if (s.openNow) s.now.push({ vanMs: s.openNow.vanMs, totMs: lastMs, actie: s.openNow.actie });
    return { actuatorId: id, smartClimate: s.sc, huidig: s.now };
  });

  return {
    vanMs,
    totMs: nowMs,
    kwartieren: sums.map((b, i) => ({
      tMs: vanMs + i * QUARTER_MS,
      zonW: b.zonN > 0 ? Math.round(b.zon / b.zonN) : null,
      netW: b.netN > 0 ? Math.round(b.net / b.netN) : null,
    })),
    zonWh: Math.round(zonWh),
    netAfWh: Math.round(netAfWh),
    netTerugWh: Math.round(netTerugWh),
    apparaten,
    besluiten: decisions.reverse().slice(0, MAX_DECISIONS),
  };
}

/** "cool@22" → "cool". */
function actionOf(observed: string | undefined): string | null {
  if (observed == null) return null;
  return observed.split('@')[0] ?? null;
}

/**
 * Houdt het laatste rapport een minuut vast.
 *
 * Een dag logboek lezen kost een paar honderd milliseconden; een pagina die
 * elke minuut vraagt, plus een tweede scherm aan de muur, hoort dat niet elke
 * keer opnieuw te laten doen.
 */
export class TodayCache {
  readonly #logDir: string;
  readonly #config: SiteConfig;
  readonly #now: () => number;
  #at = 0;
  #pending: Promise<TodayReport> | null = null;

  constructor(logDir: string, config: SiteConfig, now: () => number = Date.now) {
    this.#logDir = logDir;
    this.#config = config;
    this.#now = now;
  }

  get(): Promise<TodayReport> {
    const now = this.#now();
    if (this.#pending == null || now - this.#at > 60_000) {
      this.#at = now;
      this.#pending = todayReport(this.#logDir, this.#config, now);
      // Mislukt het, dan de volgende keer opnieuw proberen in plaats van de fout vast te houden.
      this.#pending.catch(() => {
        this.#pending = null;
      });
    }
    return this.#pending;
  }
}
