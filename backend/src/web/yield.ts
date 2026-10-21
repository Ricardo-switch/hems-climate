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

import { SALDEREN_TOT_MS, dalAandeel, kostenVan, raadDal, type Gebruik } from './tarief.js';
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

/** "+11%" tegen de periode ervoor en tegen een jaar eerder; null zonder cijfer. */
export interface YieldDelta {
  readonly vorige: { readonly dan: number; readonly pct: number } | null;
  readonly jaar: { readonly dan: number; readonly pct: number } | null;
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
  /**
   * Begint de meting pas na het begin van de periode (Home Assistant had nog
   * geen historie), dan vanaf welke dag, en over hoeveel van de dagen. Null
   * als de hele periode gemeten is. De vaste kosten tellen dan ook alleen over
   * de gemeten dagen, zodat het totaal bij het verbruik past.
   */
  readonly dekking: { readonly vanaf: string; readonly dagen: number; readonly vanDagen: number } | null;
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
  readonly verschil: Readonly<Record<keyof YieldCompare, YieldDelta>>;
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

/** Maand en dag waarop het jaar begint: de startdatum van het contract, of 1 januari (besluit 116). */
export interface YearStart {
  readonly m: number;
  readonly d: number;
}

/** Leest de startdatum van het contract; zonder datum 1 januari. Een 29 februari wordt 1 maart. */
export function yearStartOf(contractStart: string | null | undefined): YearStart {
  const p = contractStart ? parseDate(contractStart) : null;
  if (!p) return { m: 1, d: 1 };
  return p.m === 2 && p.d === 29 ? { m: 3, d: 1 } : { m: p.m, d: p.d };
}

/** Het jaar (van het contract) waarin een datum valt: het beginjaar. */
function yearOf(p: { y: number; m: number; d: number }, start: YearStart): number {
  return p.m > start.m || (p.m === start.m && p.d >= start.d) ? p.y : p.y - 1;
}

/** "2026" bij een kalenderjaar, anders "2026/27". */
function yearName(y: number, start: YearStart): string {
  return start.m === 1 && start.d === 1 ? String(y) : `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

/** De periode rond een datum, in de tijdzone van het huis. */
export function periodRange(kind: PeriodKind, date: string, tz: string, start: YearStart = { m: 1, d: 1 }): Range | null {
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
  // Een jaar: een kalenderjaar, of een contractjaar vanaf de startdatum.
  const j = yearOf(p, start);
  const kalender = start.m === 1 && start.d === 1;
  const eind = new Date(Date.UTC(j + 1, start.m - 1, start.d - 1));
  return {
    startMs: zonedMidnight(j, start.m, start.d, tz),
    endMs: zonedMidnight(j + 1, start.m, start.d, tz),
    first: { y: j, m: start.m, d: start.d },
    prev: iso(j - 1, start.m, start.d),
    next: iso(j + 1, start.m, start.d),
    label: kalender ? String(j) : `${start.d} ${MONTHS[start.m - 1]} ${j} – ${eind.getUTCDate()} ${MONTHS[eind.getUTCMonth()]} ${eind.getUTCFullYear()}`,
    prevName: kalender ? String(j - 1) : yearName(j - 1, start),
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

/**
 * Welke meters van het net het daltarief tellen (besluit 110): wat de bewoner
 * koos, of geraden aan de naam (tarief 1 van de slimme meter). Telt het net
 * niet per tarief, dan verdeelt de dienst op de tijden van het daltarief.
 */
function tariefMeters(s: EnergySettings): { dal: Set<string>; perMeter: boolean } {
  const dal = new Set(s.net.dal ?? [...s.net.afname, ...s.net.teruglevering].filter(raadDal));
  const perMeter = s.net.afname.some((id) => dal.has(id)) && s.net.afname.some((id) => !dal.has(id));
  return { dal, perMeter };
}

/** Het gebruik in [van, tot) verdeeld over normaal, dal en na het salderen. */
export function verdeel(
  s: EnergySettings,
  af: number,
  afDal: number | null,
  terug: number,
  terugDal: number | null,
  van: number,
  tot: number,
  tz: string,
): Pick<Gebruik, 'afNormaal' | 'afDal' | 'terugNormaal' | 'terugDal' | 'terugNa'> {
  const p = s.prijzen;
  let ad = 0;
  let td = 0;
  if (p.stroomDal != null) {
    // De meter zegt het; anders de tijden van het daltarief.
    const deel = afDal == null ? dalAandeel(van, tot, tz, p.dalUren ?? 'nl', p.dalEigen ?? null) : 0;
    ad = afDal ?? af * deel;
    td = terugDal ?? terug * deel;
  }
  // Zonder salderen (besluit 178) telt alles wat teruggaat zoals na 2027.
  const na = p.salderen === false || van >= SALDEREN_TOT_MS;
  return { afNormaal: af - ad, afDal: ad, terugNormaal: na ? 0 : terug - td, terugDal: na ? 0 : td, terugNa: na ? terug : 0 };
}

/** Wat stroom en gas samen kosten in een periode, de vaste posten erbij. */
function costOf(s: EnergySettings, g: Gebruik): number | null {
  const p = s.prijzen;
  if (p.stroom == null && p.gas == null) return null;
  const k = kostenVan(p, g, { net: s.net.afname.length > 0, terug: s.net.teruglevering.length > 0, gas: s.gas != null });
  return k.variabel == null ? null : r2(k.variabel + (k.vast ?? 0));
}

export async function yieldReport(
  source: EnergySource,
  settings: EnergySettings,
  kind: PeriodKind,
  date: string,
  tz: string,
  nowMs: number,
): Promise<YieldReport | null> {
  const range = periodRange(kind, date, tz, yearStartOf(settings.prijzen.contractStart));
  if (!range) return null;
  const s = settings;
  const deviceIds = s.apparaten.map((a) => a.id);
  const all = [...s.net.afname, ...s.net.teruglevering, ...s.zon, ...(s.gas ? [s.gas] : []), ...deviceIds];

  // Per uur, of per dag voor een heel jaar: fijn genoeg om zon per apparaat toe te rekenen.
  const fine = kind === 'jaar' ? 'day' : 'hour';
  const rows = await source.changes(all, range.startMs, range.endMs, fine);
  const afname = sumBy(rows, s.net.afname);
  const terug = sumBy(rows, s.net.teruglevering);
  // Normaal en dal (besluit 110): per meter als het net per tarief telt.
  const tm = tariefMeters(s);
  const afnameDal = tm.perMeter ? sumBy(rows, s.net.afname.filter((id) => tm.dal.has(id))) : null;
  const terugDal = tm.perMeter ? sumBy(rows, s.net.teruglevering.filter((id) => tm.dal.has(id))) : null;
  const stap = fine === 'hour' ? 3_600_000 : 86_400_000;
  const gebruik = { afNormaal: 0, afDal: 0, terugNormaal: 0, terugDal: 0, terugNa: 0 };
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
  // Telt de meter van het net in een uur meer terug dan de zonnemeter opwekte,
  // dan loopt een van de twee achter. Dat tekort schuift door naar het volgende
  // uur, zodat zelf gebruikt plus terug gelijk blijft aan opgewekt (opgelost
  // 15 oktober: 125 kWh opgewekt, maar 127 in het stroomschema).
  let tekort = 0;
  for (const t of times) {
    const a = afname.get(t) ?? 0;
    const tr = terug.get(t) ?? 0;
    const v = verdeel(s, a, afnameDal ? (afnameDal.get(t) ?? 0) : null, tr, terugDal ? (terugDal.get(t) ?? 0) : null, t, t + stap, tz);
    for (const k of Object.keys(gebruik) as (keyof typeof gebruik)[]) gebruik[k] += v[k];
    const z = zon.get(t) ?? 0;
    const self = hasSun ? Math.max(0, z - tr - tekort) : 0;
    tekort = hasSun ? Math.max(0, tr + tekort - z) : 0;
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
  // De kosten (besluit 110): normaal en dal, salderen of niet, de vaste posten
  // over de dagen die er al waren.
  // Begint de meting later dan de periode, dan tellen de vaste kosten vanaf de
  // eerste meting: een jaarafrekening over dagen zonder verbruik klopt niet.
  const eerste = Math.min(...[afname, terug, zon, gas].flatMap((m) => [...m.keys()]));
  const totMs = Math.min(range.endMs, nowMs);
  const vanMs = Number.isFinite(eerste) && eerste - range.startMs > 86_400_000 ? Math.min(eerste, totMs) : range.startMs;
  const dagen = (totMs - vanMs) / 86_400_000;
  const vanP = partsIn(vanMs + 3 * 3_600_000, tz);
  const dekking = vanMs > range.startMs ? { vanaf: iso(vanP.y, vanP.m, vanP.d), dagen: Math.round(dagen), vanDagen: Math.round((totMs - range.startMs) / 86_400_000) } : null;
  const kosten = kostenVan(s.prijzen, { ...gebruik, gasM3, dagen: Math.max(0, dagen), heelJaar: kind === 'jaar' }, { net: s.net.afname.length > 0, terug: s.net.teruglevering.length > 0, gas: s.gas != null });
  const stroomPrijs = kosten.stroomPerKwh;

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

  const p = s.prijzen;
  const regels = kosten.regels;
  const variable = kosten.variabel == null ? null : r2(kosten.variabel + (kosten.vast ?? 0));

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
    dekking,
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
    verschil: {
      stroom: deltaOf(vergelijk.stroom),
      zon: deltaOf(vergelijk.zon),
      gas: deltaOf(vergelijk.gas),
      kosten: deltaOf(vergelijk.kosten),
    },
    kosten: { regels, totaal: variable, vorige: prev(vergelijk.kosten) },
  };
}

function deltaOf(series: readonly YieldComparePoint[]): YieldDelta {
  const now = series.at(-1)?.nu ?? null;
  const pct = (then: number | null) => (now == null || then == null || then === 0 ? null : { dan: then, pct: Math.round(((now - then) / Math.abs(then)) * 100) });
  return { vorige: pct(series.at(-2)?.nu ?? null), jaar: pct(series.at(-1)?.jaarEerder ?? null) };
}

/** De vakken van de grafiek, in volgorde. */
function bucketLabels(kind: PeriodKind, range: Range, tz: string): string[] {
  if (kind === 'dag') return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  // Een contractjaar begint bij zijn eigen maand; een maand die het jaar in
  // tweeën deelt, is één vak.
  if (kind === 'jaar') return Array.from({ length: 12 }, (_, i) => SHORT_MONTHS[(range.first.m - 1 + i) % 12]!);
  // Per dag één vak. Een maand met de wintertijd erin is een uur langer; in
  // stappen van 24 uur leverde dat een 32e vak op, met de naam van de eerste dag.
  const out: string[] = [];
  for (let t = range.startMs; t < range.endMs; t += 86_400_000) {
    const key = bucketKey(kind, t + 3 * 3_600_000, tz);
    if (!out.includes(key)) out.push(key);
  }
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
    else starts.push({ ms: zonedMidnight(y - i, m, d, tz), label: yearName(y - i, { m, d }) });
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
  const tm = tariefMeters(s);
  const dalSums = tm.perMeter ? { afname: sumBy(rows, s.net.afname.filter((id) => tm.dal.has(id))), terug: sumBy(rows, s.net.teruglevering.filter((id) => tm.dal.has(id))) } : null;

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
    const v = verdeel(s, af ?? 0, dalSums ? (between(dalSums.afname, a, b) ?? 0) : null, tr, dalSums ? (between(dalSums.terug, a, b) ?? 0) : null, a, b, tz);
    return {
      stroom: af == null ? null : r1(af + self),
      zon: zo == null ? null : r1(zo),
      gas: ga == null ? null : r2(ga),
      kosten: af == null && ga == null ? null : costOf(s, { ...v, gasM3: ga ?? 0, dagen: (b - a) / 86_400_000, heelJaar: kind === 'jaar' }),
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
