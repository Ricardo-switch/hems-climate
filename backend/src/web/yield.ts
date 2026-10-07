/**
 * Opbrengst om terug te kijken (besluit 102, schetsen `Opbrengst-terug` en
 * `Wand-Opbrengst`).
 *
 * Per dag, week, maand of jaar: wat het huis gebruikte, waar het vandaan kwam
 * en wat het kostte. De cijfers komen uit de statistiek van Home Assistant, met
 * de meters en prijzen uit de instellingen van de app (`energy.ts`). Zo gaat de
 * terugblik ook over de tijd van vóór Smart Climate.
 *
 * Wat de meters zeggen en wat hier volgt:
 *
 * - **zelf gebruikt** is opgewekt min teruggeleverd, per uur;
 * - **verbruik** is van het net plus zelf gebruikt;
 * - **per apparaat** is een eigen meter. Welk deel daarvan zon was, volgt per
 *   uur uit het aandeel eigen zon in dat uur: draaide de airco om 13:00 op een
 *   uur met 80% eigen zon, dan telt 80% van dat uur als zon. Een schatting,
 *   maar een eerlijke: dezelfde regel voor elk apparaat;
 * - **rest van het huis** is wat de apparaten met een eigen meter niet verklaren.
 *
 * De pagina tekent; rekenen gebeurt hier (besluit 94).
 */

import type { EnergySettings, EnergySource } from './energy.js';
import { partsIn, zonedMidnight } from './today.js';

export const PERIODS = ['dag', 'week', 'maand', 'jaar'] as const;
export type PeriodKind = (typeof PERIODS)[number];

/** Warmte uit een kubieke meter aardgas, ongeveer (Groningen-kwaliteit). */
export const GAS_KWH_PER_M3 = 9.77;

export interface YieldDevice {
  readonly id: string;
  readonly naam: string;
  readonly kwh: number;
  readonly zonKwh: number;
  readonly netKwh: number;
  /** Wat het deel van het net kostte; null zonder stroomprijs. */
  readonly kosten: number | null;
  /** Geen eigen meter: wat de andere niet verklaren. */
  readonly rest?: true;
}

export interface YieldBucket {
  readonly label: string;
  readonly zonKwh: number;
  readonly netKwh: number;
  readonly gasM3: number;
}

export interface YieldComparePoint {
  readonly label: string;
  readonly nu: number | null;
  readonly jaarEerder: number | null;
}

export interface YieldCompare {
  readonly stroom: readonly YieldComparePoint[];
  readonly zon: readonly YieldComparePoint[];
  readonly gas: readonly YieldComparePoint[];
  readonly kosten: readonly YieldComparePoint[];
}

export interface YieldReport {
  readonly periode: {
    readonly soort: PeriodKind;
    readonly datum: string;
    readonly label: string;
    readonly vanMs: number;
    readonly totMs: number;
    readonly vorige: string;
    /** Null als de volgende periode nog moet beginnen. */
    readonly volgende: string | null;
    /** Hoe de vorige periode heet: "augustus", "vorige week". */
    readonly vorigeNaam: string;
  };
  /** Welke meters er zijn; wat ontbreekt, laat de pagina weg. */
  readonly heeft: { readonly net: boolean; readonly zon: boolean; readonly gas: boolean; readonly prijzen: boolean };
  readonly stroom: {
    readonly verbruikKwh: number;
    readonly eigenZonKwh: number;
    readonly vanNetKwh: number;
    readonly terugKwh: number;
    /** Welk deel van het verbruik van het eigen dak kwam. */
    readonly eigenZonPct: number | null;
    readonly vorigeKwh: number | null;
  };
  readonly zon: {
    readonly opgewektKwh: number;
    readonly zelfKwh: number;
    readonly terugKwh: number;
    readonly zelfPct: number | null;
    readonly besteDag: { readonly label: string; readonly kwh: number } | null;
    readonly vorigeKwh: number | null;
  } | null;
  readonly gas: { readonly m3: number; readonly kwh: number; readonly vorigeM3: number | null } | null;
  readonly apparaten: readonly YieldDevice[];
  /** De sankey: knopen en stromen in kWh, op schaal te tekenen. */
  readonly stromen: readonly { readonly van: 'zon' | 'net' | 'gas'; readonly naar: string; readonly kwh: number }[];
  readonly perBucket: readonly YieldBucket[];
  readonly vergelijk: YieldCompare;
  readonly kosten: {
    readonly regels: readonly { readonly naam: string; readonly uitleg: string; readonly euro: number | null }[];
    readonly totaal: number | null;
    readonly vorige: number | null;
  };
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const SHORT_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
};

/** Een kalenderdatum "2026-10-07" in delen; null als het geen datum is. */
function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

/** ISO-week: maandag is de eerste dag. */
function weekOf(y: number, m: number, d: number): { week: number; year: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7), year: t.getUTCFullYear() };
}

interface Range {
  readonly startMs: number;
  readonly endMs: number;
  /** De eerste kalenderdag, en die van de vorige en volgende periode. */
  readonly first: { y: number; m: number; d: number };
  readonly prev: string;
  readonly next: string;
  readonly label: string;
  readonly prevName: string;
}

/** De periode rond een datum, in de tijdzone van het huis. */
export function periodRange(kind: PeriodKind, date: string, tz: string): Range | null {
  const p = parseDate(date);
  if (!p) return null;
  const { y, m, d } = p;
  if (kind === 'dag') {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return {
      startMs: zonedMidnight(y, m, d, tz),
      endMs: zonedMidnight(y, m, d + 1, tz),
      first: p,
      prev: iso(y, m, d - 1),
      next: iso(y, m, d + 1),
      label: `${DAYS[wd]![0]!.toUpperCase()}${DAYS[wd]!.slice(1)} ${d} ${MONTHS[m - 1]}`,
      prevName: 'de dag ervoor',
    };
  }
  if (kind === 'week') {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
    const mon = new Date(Date.UTC(y, m - 1, d - (wd - 1)));
    const [my, mm, md] = [mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate()];
    const sun = new Date(Date.UTC(my, mm - 1, md + 6));
    const w = weekOf(my, mm, md);
    const span = mm === sun.getUTCMonth() + 1 ? `${md} – ${sun.getUTCDate()} ${MONTHS[mm - 1]}` : `${md} ${MONTHS[mm - 1]} – ${sun.getUTCDate()} ${MONTHS[sun.getUTCMonth()]}`;
    return {
      startMs: zonedMidnight(my, mm, md, tz),
      endMs: zonedMidnight(my, mm, md + 7, tz),
      first: { y: my, m: mm, d: md },
      prev: iso(my, mm, md - 7),
      next: iso(my, mm, md + 7),
      label: `Week ${w.week} · ${span}`,
      prevName: 'vorige week',
    };
  }
  if (kind === 'maand') {
    return {
      startMs: zonedMidnight(y, m, 1, tz),
      endMs: zonedMidnight(y, m + 1, 1, tz),
      first: { y, m, d: 1 },
      prev: iso(y, m - 1, 1),
      next: iso(y, m + 1, 1),
      label: `${MONTHS[m - 1]![0]!.toUpperCase()}${MONTHS[m - 1]!.slice(1)} ${y}`,
      prevName: MONTHS[(m + 10) % 12]!,
    };
  }
  return {
    startMs: zonedMidnight(y, 1, 1, tz),
    endMs: zonedMidnight(y + 1, 1, 1, tz),
    first: { y, m: 1, d: 1 },
    prev: iso(y - 1, 1, 1),
    next: iso(y + 1, 1, 1),
    label: String(y),
    prevName: String(y - 1),
  };
}

type Rows = Readonly<Record<string, readonly { readonly startMs: number; readonly change: number }[]>>;

/** Per begintijd de som over een paar meters. */
function sumBy(rows: Rows, ids: readonly string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) for (const r of rows[id] ?? []) out.set(r.startMs, (out.get(r.startMs) ?? 0) + Math.max(0, r.change));
  return out;
}

const total = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** De sleutel van het vak in de grafiek: uur, dag of maand in de tijdzone van het huis. */
function bucketKey(kind: PeriodKind, ms: number, tz: string): string {
  const p = partsIn(ms, tz);
  if (kind === 'dag') return String(p.h).padStart(2, '0');
  if (kind === 'jaar') return SHORT_MONTHS[p.m - 1]!;
  return kind === 'week' ? DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]!.slice(0, 2) : String(p.d);
}

/** Wat stroom en gas samen kosten in een periode, met de prijzen van nu. */
function costOf(s: EnergySettings, netKwh: number, terugKwh: number, gasM3: number): number | null {
  const p = s.prijzen;
  if (p.stroom == null && p.gas == null) return null;
  const terugPrijs = p.teruglevering ?? p.stroom ?? 0;
  return r2((p.stroom ?? 0) * netKwh - terugPrijs * terugKwh + (p.gas ?? 0) * gasM3);
}

export async function yieldReport(
  source: EnergySource,
  settings: EnergySettings,
  kind: PeriodKind,
  date: string,
  tz: string,
  nowMs: number,
): Promise<YieldReport | null> {
  const range = periodRange(kind, date, tz);
  if (!range) return null;
  const s = settings;
  const deviceIds = s.apparaten.map((a) => a.id);
  const all = [...s.net.afname, ...s.net.teruglevering, ...s.zon, ...(s.gas ? [s.gas] : []), ...deviceIds];

  // Per uur, of per dag voor een heel jaar: fijn genoeg om zon per apparaat toe te rekenen.
  const fine = kind === 'jaar' ? 'day' : 'hour';
  const rows = await source.changes(all, range.startMs, range.endMs, fine);
  const afname = sumBy(rows, s.net.afname);
  const terug = sumBy(rows, s.net.teruglevering);
  const zon = sumBy(rows, s.zon);
  const gas = s.gas ? sumBy(rows, [s.gas]) : new Map<number, number>();
  const hasSun = s.zon.length > 0;

  const times = [...new Set([...afname.keys(), ...terug.keys(), ...zon.keys(), ...gas.keys(), ...deviceIds.flatMap((id) => (rows[id] ?? []).map((r) => r.startMs))])].sort((a, b) => a - b);
  const dev = new Map(s.apparaten.map((a) => [a.id, { zon: 0, net: 0 }]));
  const devRows = new Map(s.apparaten.map((a) => [a.id, new Map((rows[a.id] ?? []).map((r) => [r.startMs, Math.max(0, r.change)]))]));
  const buckets = new Map<string, { zon: number; net: number; gas: number }>();
  let selfTotal = 0;
  let restZon = 0;
  let restNet = 0;
  for (const t of times) {
    const a = afname.get(t) ?? 0;
    const tr = terug.get(t) ?? 0;
    const self = hasSun ? Math.max(0, (zon.get(t) ?? 0) - tr) : 0;
    const use = a + self;
    const share = use > 0 ? self / use : 0;
    selfTotal += self;
    let devUse = 0;
    for (const [id, m] of devRows) {
      const k = m.get(t) ?? 0;
      devUse += k;
      const acc = dev.get(id)!;
      acc.zon += k * share;
      acc.net += k * (1 - share);
    }
    // Wat de apparaten niet verklaren; nooit negatief, ook niet bij een meter die achterloopt.
    const rest = Math.max(0, use - devUse);
    restZon += rest * share;
    restNet += rest * (1 - share);
    const key = bucketKey(kind, t, tz);
    const b = buckets.get(key) ?? { zon: 0, net: 0, gas: 0 };
    b.zon += self;
    b.net += a;
    b.gas += gas.get(t) ?? 0;
    buckets.set(key, b);
  }

  const afnameKwh = total(afname);
  const terugKwh = total(terug);
  const zonKwh = total(zon);
  const gasM3 = total(gas);
  const use = afnameKwh + selfTotal;
  const stroomPrijs = s.prijzen.stroom;

  // Vakken in de grafiek: ook de lege, zodat een dag zonder meting een gat is.
  const perBucket = bucketLabels(kind, range, tz).map((label) => {
    const b = buckets.get(label) ?? { zon: 0, net: 0, gas: 0 };
    return { label, zonKwh: r1(b.zon), netKwh: r1(b.net), gasM3: r2(b.gas) };
  });

  // Beste dag van de zon: alleen over hele dagen.
  let besteDag: { label: string; kwh: number } | null = null;
  if (hasSun && kind !== 'dag') {
    const perDay = new Map<string, number>();
    for (const [t, v] of zon) {
      const p = partsIn(t, tz);
      const key = kind === 'jaar' ? `${p.d} ${MONTHS[p.m - 1]}` : `${DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]} ${p.d} ${MONTHS[p.m - 1]}`;
      perDay.set(key, (perDay.get(key) ?? 0) + v);
    }
    for (const [label, kwh] of perDay) if (!besteDag || kwh > besteDag.kwh) besteDag = { label, kwh: r1(kwh) };
  }

  const apparaten: YieldDevice[] = s.apparaten.map((a) => {
    const v = dev.get(a.id)!;
    return { id: a.id, naam: a.naam, kwh: r1(v.zon + v.net), zonKwh: r1(v.zon), netKwh: r1(v.net), kosten: stroomPrijs == null ? null : r2(v.net * stroomPrijs) };
  });
  apparaten.push({
    id: 'rest',
    naam: 'Rest van het huis',
    kwh: r1(restZon + restNet),
    zonKwh: r1(restZon),
    netKwh: r1(restNet),
    kosten: stroomPrijs == null ? null : r2(restNet * stroomPrijs),
    rest: true,
  });

  const stromen: YieldReport['stromen'][number][] = [];
  for (const d of apparaten) {
    if (d.zonKwh > 0) stromen.push({ van: 'zon', naar: d.id, kwh: d.zonKwh });
    if (d.netKwh > 0) stromen.push({ van: 'net', naar: d.id, kwh: d.netKwh });
  }
  if (terugKwh > 0) stromen.push({ van: 'zon', naar: 'terug', kwh: r1(terugKwh) });
  if (gasM3 > 0) stromen.push({ van: 'gas', naar: 'cv', kwh: r1(gasM3 * GAS_KWH_PER_M3) });

  // Vergelijken: de periodes ervoor, en dezelfde een jaar eerder.
  const vergelijk = await compareSeries(source, s, kind, range, tz);
  const prevPoint = vergelijk.stroom.at(-2);
  const prev = (series: readonly YieldComparePoint[]) => series.at(-2)?.nu ?? null;

  const regels: { naam: string; uitleg: string; euro: number | null }[] = [];
  const p = s.prijzen;
  const eur = (n: number) => `€ ${n.toFixed(2).replace('.', ',')}`;
  if (s.net.afname.length) regels.push({ naam: 'Stroom van het net', uitleg: p.stroom == null ? `${r1(afnameKwh)} kWh, prijs nog niet ingesteld` : `${r1(afnameKwh)} kWh × ${eur(p.stroom)}`, euro: p.stroom == null ? null : r2(afnameKwh * p.stroom) });
  if (s.net.teruglevering.length) {
    const tp = p.teruglevering ?? p.stroom;
    const uitleg = p.teruglevering == null ? `${r1(terugKwh)} kWh, gesaldeerd tot 2027` : `${r1(terugKwh)} kWh × ${eur(p.teruglevering)}`;
    regels.push({ naam: 'Teruggeleverd', uitleg, euro: tp == null ? null : -r2(terugKwh * tp) });
  }
  if (s.gas) regels.push({ naam: 'Gas', uitleg: p.gas == null ? `${r2(gasM3)} m³, prijs nog niet ingesteld` : `${r2(gasM3)} m³ × ${eur(p.gas)}`, euro: p.gas == null ? null : r2(gasM3 * p.gas) });
  const months = (range.endMs - range.startMs) / (30.44 * 86_400_000);
  regels.push({ naam: 'Vaste kosten', uitleg: p.vastPerMaand == null ? 'nog niet ingesteld' : `${eur(p.vastPerMaand)} per maand`, euro: p.vastPerMaand == null ? null : r2(p.vastPerMaand * months) });
  const variable = costOf(s, afnameKwh, terugKwh, gasM3);

  return {
    periode: {
      soort: kind,
      datum: iso(range.first.y, range.first.m, range.first.d),
      label: range.label,
      vanMs: range.startMs,
      totMs: range.endMs,
      vorige: range.prev,
      volgende: range.endMs > nowMs ? null : range.next,
      vorigeNaam: range.prevName,
    },
    heeft: { net: s.net.afname.length > 0, zon: hasSun, gas: s.gas != null, prijzen: p.stroom != null || p.gas != null },
    stroom: {
      verbruikKwh: r1(use),
      eigenZonKwh: r1(selfTotal),
      vanNetKwh: r1(afnameKwh),
      terugKwh: r1(terugKwh),
      eigenZonPct: use > 0 && hasSun ? Math.round((selfTotal / use) * 100) : null,
      vorigeKwh: prevPoint?.nu ?? null,
    },
    zon: hasSun
      ? {
          opgewektKwh: r1(zonKwh),
          zelfKwh: r1(selfTotal),
          terugKwh: r1(terugKwh),
          zelfPct: zonKwh > 0 ? Math.round((selfTotal / zonKwh) * 100) : null,
          besteDag,
          vorigeKwh: prev(vergelijk.zon),
        }
      : null,
    gas: s.gas ? { m3: r2(gasM3), kwh: r1(gasM3 * GAS_KWH_PER_M3), vorigeM3: prev(vergelijk.gas) } : null,
    apparaten,
    stromen,
    perBucket,
    vergelijk,
    kosten: { regels, totaal: variable, vorige: prev(vergelijk.kosten) },
  };
}

/** De vakken van de grafiek, in volgorde. */
function bucketLabels(kind: PeriodKind, range: Range, tz: string): string[] {
  if (kind === 'dag') return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  if (kind === 'jaar') return [...SHORT_MONTHS];
  const out: string[] = [];
  for (let t = range.startMs; t < range.endMs; t += 86_400_000) out.push(bucketKey(kind, t + 3 * 3_600_000, tz));
  return out;
}

/**
 * Twaalf periodes tot en met deze, en dezelfde twaalf een jaar eerder (bij een
 * jaar: de jaren tot en met dit, zonder "een jaar eerder"). Per stroom, zon,
 * gas en kosten.
 */
async function compareSeries(source: EnergySource, s: EnergySettings, kind: PeriodKind, range: Range, tz: string): Promise<YieldCompare> {
  const { y, m, d } = range.first;
  const n = kind === 'jaar' ? 5 : 12;
  // De begintijden van de periodes, oudste eerst, en hun naam.
  const starts: { ms: number; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    if (kind === 'dag') starts.push({ ms: zonedMidnight(y, m, d - i, tz), label: String(new Date(Date.UTC(y, m - 1, d - i)).getUTCDate()) });
    else if (kind === 'week') starts.push({ ms: zonedMidnight(y, m, d - 7 * i, tz), label: `wk ${weekOf(y, m, d - 7 * i).week}` });
    else if (kind === 'maand') starts.push({ ms: zonedMidnight(y, m - i, 1, tz), label: SHORT_MONTHS[(((m - 1 - i) % 12) + 12) % 12]! });
    else starts.push({ ms: zonedMidnight(y - i, 1, 1, tz), label: String(y - i) });
  }
  const yearBack = (ms: number) => {
    const p = partsIn(ms + 3 * 3_600_000, tz);
    return zonedMidnight(p.y - 1, p.m, p.d, tz);
  };
  const period = kind === 'dag' ? 'day' : kind === 'week' ? 'week' : 'month';
  const ids = [...s.net.afname, ...s.net.teruglevering, ...s.zon, ...(s.gas ? [s.gas] : [])];
  const from = kind === 'jaar' ? starts[0]!.ms : yearBack(starts[0]!.ms);
  const rows = await source.changes(ids, from, range.endMs, period);
  const sums = { afname: sumBy(rows, s.net.afname), terug: sumBy(rows, s.net.teruglevering), zon: sumBy(rows, s.zon), gas: s.gas ? sumBy(rows, [s.gas]) : new Map<number, number>() };

  /** Optellen over [van, tot): een maand is één rij, een jaar twaalf. */
  const between = (map: Map<number, number>, a: number, b: number): number | null => {
    let sum = 0;
    let any = false;
    for (const [t, v] of map) {
      if (t >= a - 3_600_000 && t < b - 3_600_000) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };
  const point = (a: number, b: number) => {
    const af = between(sums.afname, a, b);
    const tr = between(sums.terug, a, b) ?? 0;
    const zo = between(sums.zon, a, b);
    const ga = between(sums.gas, a, b);
    const self = zo == null ? 0 : Math.max(0, zo - tr);
    return {
      stroom: af == null ? null : r1(af + self),
      zon: zo == null ? null : r1(zo),
      gas: ga == null ? null : r2(ga),
      kosten: af == null && ga == null ? null : costOf(s, af ?? 0, tr, ga ?? 0),
    };
  };
  const ends = [...starts.slice(1).map((x) => x.ms), range.endMs];
  const out: Record<keyof YieldCompare, YieldComparePoint[]> = { stroom: [], zon: [], gas: [], kosten: [] };
  starts.forEach((st, i) => {
    const now = point(st.ms, ends[i]!);
    const before = kind === 'jaar' ? null : point(yearBack(st.ms), yearBack(ends[i]!));
    for (const k of ['stroom', 'zon', 'gas', 'kosten'] as const) out[k].push({ label: st.label, nu: now[k], jaarEerder: before ? before[k] : null });
  });
  return out;
}
