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

import type { Command } from '../core/decision.js';
import type { SiteConfig } from '../core/model.js';
import { arbiterRunning, findLogFiles, observedRunning, readMoments } from '../divergence/read.js';
import type { Lang } from './assistant.js';
import { decisionWords } from './resident.js';

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
  /** 'cool' of 'heat'; 'run' bij een uitstelbaar apparaat. */
  readonly actie: string;
}

export interface TodayDecision {
  readonly tMs: number;
  readonly opdrachten: readonly { kind: string; actuatorId?: string; action?: string; setpointC?: number; timerId?: string; durationS?: number }[];
  readonly redenen: readonly { actuatorId: string; actie: string; strategie: string | null; reden: string | null }[];
  /** In woorden, voor de tijdlijn van Waarom (besluit 94). */
  readonly wat: readonly string[];
  readonly waarom: readonly string[];
}

/**
 * De dag met de woorden van de besluiten in de taal van de app (besluit 185).
 * Het rapport wordt bewaard; de opdrachten en redenen staan erin, dus de
 * woorden zijn per verzoek opnieuw te maken.
 */
export function todayInLang<T extends TodayReport>(r: T, config: SiteConfig, lang: Lang): T {
  if (lang === 'nl') return r;
  return { ...r, besluiten: r.besluiten.map((b) => ({ ...b, ...decisionWords(config, b.opdrachten as unknown as Command[], b.redenen, lang) })) };
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
  /**
   * De uitstelbare apparaten (besluit 98): wanneer ze vandaag werkelijk
   * draaiden, en wanneer Smart Climate ze zou starten. In schaduwmodus start
   * hij niets, dus dat tweede is een voorstel, geen handeling.
   */
  readonly uitstelbaar: readonly {
    readonly id: string;
    readonly draaide: readonly TodaySpan[];
    readonly zouStarten: readonly TodaySpan[];
  }[];
  /**
   * De boiler en de jacuzzi (besluit 186): wanneer ze vandaag stookten, en
   * wanneer Smart Climate ze zou laten stoken.
   */
  readonly warmtebuffers: readonly {
    readonly id: string;
    readonly stookte: readonly TodaySpan[];
    readonly zouStoken: readonly TodaySpan[];
  }[];
  /**
   * Per zone de temperatuur per kwartier, gemiddeld, of null zonder meting; en
   * wat er goed is: tussen het doel voor verwarmen en voor koelen in de dagstand.
   */
  readonly zones: readonly {
    readonly zoneId: string;
    readonly naam: string;
    readonly goed: { readonly vanC: number | null; readonly totC: number | null };
    readonly kwartieren: readonly (number | null)[];
  }[];
  /** Besluiten met een opdracht, nieuwste eerst. */
  readonly besluiten: readonly TodayDecision[];
}

/** De delen van een tijdstip in een tijdzone. */
export function partsIn(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
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

/**
 * Middernacht van een kalenderdag in de tijdzone van de installatie. Maand en
 * dag mogen overlopen (maand 13, dag 0): `Date.UTC` rekent dat door.
 */
export function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, m - 1, d);
  return guess - offsetAt(guess - offsetAt(guess, timeZone), timeZone);
}

/** "18:00" in de tijdzone van de installatie. */
export function clockIn(ms: number, timeZone: string): string {
  const p = partsIn(ms, timeZone);
  return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
}

/**
 * De eerstvolgende keer dat het "18:00" is in de tijdzone van de installatie:
 * vandaag, of morgen als die tijd al voorbij is (besluit 101).
 */
export function nextLocalTime(nowMs: number, hhmm: string, timeZone: string): number {
  const [h = 0, mi = 0] = hhmm.split(':').map(Number);
  const at = (dayStart: number) => {
    const p = partsIn(dayStart, timeZone);
    const guess = Date.UTC(p.y, p.m - 1, p.d, h, mi);
    return guess - offsetAt(guess - offsetAt(guess, timeZone), timeZone);
  };
  const today = at(startOfLocalDay(nowMs, timeZone));
  return today > nowMs ? today : at(startOfLocalDay(nowMs + 26 * 3_600_000, timeZone));
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

/**
 * Vandaag tot nu, of met `dag: 'gisteren'` de hele dag ervoor: dezelfde vorm,
 * zodat de pagina tussen de twee kan wisselen.
 */
export async function todayReport(logDir: string, config: SiteConfig, nowMs: number, dag: 'vandaag' | 'gisteren' = 'vandaag'): Promise<TodayReport> {
  const today = startOfLocalDay(nowMs, config.timezone);
  const p0 = partsIn(today + 12 * 3_600_000, config.timezone);
  const vanMs = dag === 'gisteren' ? zonedMidnight(p0.y, p0.m, p0.d - 1, config.timezone) : today;
  const endMs = dag === 'gisteren' ? today : nowMs;
  const days = new Set([utcDay(vanMs), utcDay(endMs - 1)]);
  const files = (await findLogFiles(logDir)).filter((f) => days.has(basename(f).slice(10, 20)));

  const quarters = Math.ceil((endMs - vanMs) / QUARTER_MS);
  const sums = Array.from({ length: Math.max(0, quarters) }, () => ({ zon: 0, zonN: 0, net: 0, netN: 0 }));
  let zonWh = 0;
  let netAfWh = 0;
  let netTerugWh = 0;

  const ids = config.actuators.map((a) => a.id);
  type Open = { vanMs: number; totMs: number; actie: string } | null;
  const spans = new Map(ids.map((id) => [id, { sc: [] as TodaySpan[], now: [] as TodaySpan[], openSc: null as Open, openNow: null as Open }]));
  const decisions: TodayDecision[] = [];
  const zoneSums = new Map(config.zones.map((z) => [z.id, Array.from({ length: Math.max(0, quarters) }, () => ({ som: 0, n: 0 }))]));
  const deferrableIds = (config.deferrables ?? []).map((d) => d.id);
  const deferrableSpans = new Map(deferrableIds.map((id) => [id, { ran: [] as TodaySpan[], would: [] as TodaySpan[], openRan: null as Open, openWould: null as Open }]));
  const bufferIds = (config.heatStores ?? []).map((h) => h.id);
  const bufferSpans = new Map(bufferIds.map((id) => [id, { ran: [] as TodaySpan[], would: [] as TodaySpan[], openRan: null as Open, openWould: null as Open }]));

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
    if (m.tMs < vanMs || m.tMs > endMs) continue;
    lastMs = m.tMs;

    const q = Math.floor((m.tMs - vanMs) / QUARTER_MS);
    for (const z of m.zones) {
      const vak = zoneSums.get(z.id)?.[q];
      if (vak && z.temperatureC != null) {
        vak.som += z.temperatureC;
        vak.n += 1;
      }
    }
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

    for (const id of deferrableIds) {
      const s = deferrableSpans.get(id)!;
      const state = m.deferrables[id];
      s.openRan = step(s.ran, s.openRan, m.tMs, state === 'running' ? 'run' : null);
      s.openWould = step(s.would, s.openWould, m.tMs, state === 'would_start' ? 'run' : null);
    }

    for (const id of bufferIds) {
      const s = bufferSpans.get(id)!;
      const h = m.heatStores?.[id];
      s.openRan = step(s.ran, s.openRan, m.tMs, h?.heating ? 'heat' : null);
      s.openWould = step(s.would, s.openWould, m.tMs, h?.state === 'would_heat' ? 'heat' : null);
    }

    if (m.full && m.commands.length > 0) {
      const touched = new Set(m.commands.map((c) => c.actuatorId).filter((x): x is string => x != null));
      const redenen = m.accepted
        .filter((a) => touched.has(a.actuatorId))
        .map((a) => ({
          actuatorId: a.actuatorId,
          actie: a.action,
          strategie: a.strategyId ?? null,
          reden: (a as { reason?: string }).reason ?? null,
        }));
      // Het logboek bewaart de opdrachten in dezelfde vorm als de kern ze gaf.
      const words = decisionWords(config, m.commands as unknown as Command[], redenen);
      decisions.push({ tMs: m.tMs, opdrachten: m.commands, redenen, wat: words.wat, waarom: words.waarom });
    }
  }

  const apparaten = ids.map((id) => {
    const s = spans.get(id)!;
    if (s.openSc) s.sc.push({ vanMs: s.openSc.vanMs, totMs: lastMs, actie: s.openSc.actie });
    if (s.openNow) s.now.push({ vanMs: s.openNow.vanMs, totMs: lastMs, actie: s.openNow.actie });
    return { actuatorId: id, smartClimate: s.sc, huidig: s.now };
  });

  const uitstelbaar = deferrableIds.map((id) => {
    const s = deferrableSpans.get(id)!;
    if (s.openRan) s.ran.push({ vanMs: s.openRan.vanMs, totMs: lastMs, actie: s.openRan.actie });
    if (s.openWould) s.would.push({ vanMs: s.openWould.vanMs, totMs: lastMs, actie: s.openWould.actie });
    return { id, draaide: s.ran, zouStarten: s.would };
  });

  const warmtebuffers = bufferIds.map((id) => {
    const s = bufferSpans.get(id)!;
    if (s.openRan) s.ran.push({ vanMs: s.openRan.vanMs, totMs: lastMs, actie: s.openRan.actie });
    if (s.openWould) s.would.push({ vanMs: s.openWould.vanMs, totMs: lastMs, actie: s.openWould.actie });
    return { id, stookte: s.ran, zouStoken: s.would };
  });

  const zones = config.zones.map((z) => ({
    zoneId: z.id,
    naam: z.name,
    goed: { vanC: z.setpoints.dag?.heat ?? null, totC: z.setpoints.dag?.cool ?? null },
    kwartieren: (zoneSums.get(z.id) ?? []).map((v) => (v.n > 0 ? Math.round((v.som / v.n) * 10) / 10 : null)),
  }));

  return {
    vanMs,
    totMs: endMs,
    kwartieren: sums.map((b, i) => ({
      tMs: vanMs + i * QUARTER_MS,
      zonW: b.zonN > 0 ? Math.round(b.zon / b.zonN) : null,
      netW: b.netN > 0 ? Math.round(b.net / b.netN) : null,
    })),
    zonWh: Math.round(zonWh),
    netAfWh: Math.round(netAfWh),
    netTerugWh: Math.round(netTerugWh),
    apparaten,
    uitstelbaar,
    warmtebuffers,
    zones,
    besluiten: decisions.reverse().slice(0, MAX_DECISIONS),
  };
}

/** Een rij uit de statistiek van Home Assistant: het gemiddelde vermogen over vijf minuten. */
export interface PowerRow {
  readonly startMs: number;
  readonly meanW: number;
}

/** Vijf minuten in uren, voor Wh uit een gemiddeld vermogen. */
const FIVE_MIN_H = 5 / 60;

/**
 * Vult de kwartieren zonder eigen meting aan uit de statistiek van Home
 * Assistant (17 oktober 2026).
 *
 * Het eigen logboek begint pas als Smart Climate draait. Een nieuwe installatie
 * zag daardoor 's middags "0,2 kWh opgewekt" en een zon die om vijf uur begon,
 * terwijl Home Assistant de hele dag kende. Een kwartier mét eigen meting blijft
 * zoals het is; de rest komt uit de gemiddelden per vijf minuten, en telt mee
 * in de opbrengst en in wat er van het net kwam en terugging.
 */
export function withHistory(report: TodayReport, zon: readonly PowerRow[], net: readonly PowerRow[]): TodayReport {
  let zonWh = report.zonWh;
  let netAfWh = report.netAfWh;
  let netTerugWh = report.netTerugWh;
  const in15 = (rows: readonly PowerRow[], t: number) => rows.filter((r) => r.startMs >= t && r.startMs < t + QUARTER_MS);
  const gemiddeld = (rows: readonly PowerRow[]) => Math.round(rows.reduce((s, r) => s + r.meanW, 0) / rows.length);
  const kwartieren = report.kwartieren.map((q) => {
    let { zonW, netW } = q;
    if (zonW == null) {
      const rows = in15(zon, q.tMs);
      if (rows.length) {
        zonW = Math.max(0, gemiddeld(rows));
        zonWh += rows.reduce((s, r) => s + Math.max(0, r.meanW), 0) * FIVE_MIN_H;
      }
    }
    if (netW == null) {
      const rows = in15(net, q.tMs);
      if (rows.length) {
        netW = gemiddeld(rows);
        netAfWh += rows.reduce((s, r) => s + Math.max(0, r.meanW), 0) * FIVE_MIN_H;
        netTerugWh += rows.reduce((s, r) => s + Math.max(0, -r.meanW), 0) * FIVE_MIN_H;
      }
    }
    return { tMs: q.tMs, zonW, netW };
  });
  return { ...report, kwartieren, zonWh: Math.round(zonWh), netAfWh: Math.round(netAfWh), netTerugWh: Math.round(netTerugWh) };
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
  #yesterday: { day: number; report: Promise<TodayReport> } | null = null;

  constructor(logDir: string, config: SiteConfig, now: () => number = Date.now) {
    this.#logDir = logDir;
    this.#config = config;
    this.#now = now;
  }

  /** De dag van gisteren; die verandert niet meer, dus één keer per dag lezen. */
  yesterday(): Promise<TodayReport> {
    const now = this.#now();
    const day = startOfLocalDay(now, this.#config.timezone);
    if (this.#yesterday?.day !== day) {
      const report = todayReport(this.#logDir, this.#config, now, 'gisteren');
      this.#yesterday = { day, report };
      report.catch(() => {
        this.#yesterday = null;
      });
    }
    return this.#yesterday.report;
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
