/**
 * Hoe de panelen liggen, gemeten uit wat ze leverden (besluit 157, op 93).
 *
 * Een nieuw huis via de add-on had geen `geometry`: de richting, de helling en
 * het vermogen van de panelen stonden alleen in een configuratie die met de
 * hand was geschreven. Zonder die drie geen Zon, geen weer met opbrengst en
 * geen verwachting. Een bewoner weet ze zelden, dus zoekt de dienst ze op:
 *
 * - **De opbrengst van de afgelopen tien dagen,** per vijf minuten uit de
 *   statistiek van Home Assistant (die bewaart hij standaard tien dagen). Van
 *   elk tijdstip telt de hoogste dag: de bovenkant van de metingen, waar de
 *   lucht helder was. Eén heldere dag in tien is zo genoeg.
 * - **Elke richting en helling langs,** met één vlak of twee tegenover elkaar
 *   (zoals oost en west), naar wat de bewoner zei over de kant van het dak. Het
 *   vlak waarvan de vorm van de dag het best past, wint; het midden van de
 *   hoogte geeft het vermogen (een wolkenrand die de zon even versterkt, telt
 *   zo niet mee). Het aantal panelen houdt dat binnen de perken: zonder grens past
 *   op één dag soms "noorden, 60°, 44 kWp" ook.
 * - **Zonder heldere dag geen meting.** Dan past geen enkel vlak goed, en dat
 *   is te zien. Tot er een is, rekent het huis met een schatting.
 * - **De omvormer uit zijn typenummer** in Home Assistant, zoals "SE3000H".
 *
 * Getoetst op dit huis (17 oktober 2026, twaalf dagen): elke reeks met één
 * heldere dag gaf oost en west (85 tot 95° en 265 tot 275°), een helling van
 * 45 tot 55° en 4,4 tot 5,1 kWp; werkelijk 97° en 277°, 47° en 4,68 kWp.
 *
 * Wat de bewoner bevestigt of verbetert, gaat voor de meting en voor de
 * configuratie (zoals de zekering, besluit 117). Alles hier is zuiver; het
 * lezen van de statistiek doet `main.ts`.
 */

import type { Facade, Geometry, GeometrySource, SolarPlane } from '../core/model.js';
import { clearSkyOnPlaneWm2, sunPosition, type SunPosition } from '../core/sun.js';
import type { Lang } from './assistant.js';
import type { Location } from './sun.js';
import { partsIn, type PowerRow } from './today.js';

/** De kant van het dak, zoals Inrichten hem vraagt (`aansluiting.ts`). */
/** `geen`: geen panelen; dan is er niets te meten of te schatten. */
export type DakKant = 'voorkant' | 'achterkant' | 'beide' | 'plat' | 'weetniet' | 'geen';

/** Wanneer de zon op de voorkant schijnt: de richting van het huis zonder kompas. */
export const VOORKANT_ZON = ['ochtend', 'middag', 'avond', 'weetniet'] as const;
export type VoorkantZon = (typeof VOORKANT_ZON)[number];
const ZON_RICHTING: Record<Exclude<VoorkantZon, 'weetniet'>, number> = { ochtend: 90, middag: 180, avond: 270 };

/** Wat Inrichten over de panelen weet. */
export interface PanelenAntwoord {
  readonly ligging: DakKant | null;
  readonly aantal: number | null;
  readonly voorkant: number | null;
  readonly achterkant: number | null;
}

export interface GemetenVlak {
  readonly azimuthDeg: number;
  readonly tiltDeg: number;
  readonly peakW: number;
  /** Aan welke kant van het huis, als dat uit de antwoorden volgt; anders null. */
  readonly kant: 'voorkant' | 'achterkant' | null;
}

export interface Meting {
  readonly vlakken: readonly GemetenVlak[];
  readonly peakW: number;
  /** Hoe goed het past: de spreiding op de heldere momenten (log), lager is beter. */
  readonly fout: number;
  /** De helderste dag, om te laten zien waarom. */
  readonly dag: DagLijn;
}

export interface DagLijn {
  /** `JJJJ-MM-DD`, lokale tijd. */
  readonly datum: string;
  readonly kWh: number;
  /** Per kwartier: het uur (lokaal, 9.25 is kwart over negen), gemeten en wat bij de ligging hoort. */
  readonly punten: readonly (readonly [number, number, number])[];
}

/**
 * Wat de bewoner bevestigde of verbeterde (besluit 157), bewaard bij de
 * antwoorden. Compleet uit zichzelf: een latere meting verandert het niet.
 */
export interface Dak {
  /** Waar de voorkant naartoe kijkt; null als het niet bekend is. */
  readonly voorgevelDeg: number | null;
  readonly vlakken: readonly { readonly azimuthDeg: number; readonly tiltDeg: number; readonly peakW: number }[];
  readonly omvormerW: number | null;
  /** `gemeten`: de meting zoals hij was ("Klopt"); `bewoner`: aangepast. */
  readonly bron: 'gemeten' | 'bewoner';
  /** De kant en het aantal panelen bij het bevestigen; veranderen ze, dan vervalt het dak. */
  readonly kant: DakKant | null;
  readonly aantal: number | null;
}

/** Wat de bewoner op Aanpassen kiest. */
export interface DakAanpassing {
  readonly voorgevelDeg: number;
  readonly hellingDeg: number;
  readonly wpPerPaneel: number;
  readonly omvormerW: number | null;
}

/* ------------------------------------------------------------ de omvormer */

/**
 * Het vermogen van de omvormer uit zijn type, in W, of null. De gangbare
 * merken: SolarEdge (SE3000H, SE5K), Growatt (MIN 3000TL-X), Huawei
 * (SUN2000-5KTL), SMA (SB3.0, STP 6.0), Fronius (Primo 3.0-1), GoodWe (GW5000D).
 */
export function omvormerUitType(model: string | null | undefined): number | null {
  if (!model) return null;
  const m = model.toUpperCase();
  const tries: [RegExp, number][] = [
    [/\bSE(\d{4,5})[A-Z]?\b/, 1],
    [/\bSE(\d{1,2}(?:\.\d)?)K\b/, 1000],
    [/SUN2000-(\d{1,2}(?:\.\d+)?)K/, 1000],
    [/\b(?:SB|STP|SBS)\s?(\d{1,2}\.\d)\b/, 1000],
    [/SUNNY (?:BOY|TRIPOWER) (\d{1,2}\.\d)\b/, 1000],
    [/\b(?:PRIMO|SYMO)\s(\d{1,2}\.\d)-/, 1000],
    [/\bGW(\d{4,5})/, 1],
    [/\b(\d{4,5})\s?TL/, 1],
  ];
  for (const [re, factor] of tries) {
    const hit = re.exec(m);
    if (!hit) continue;
    const w = Math.round(Number(hit[1]) * factor);
    if (w >= 600 && w <= 30_000) return w;
  }
  return null;
}

/* ------------------------------------------------------------ meten */

/** Zoveel moet er goed passen voordat het een meting heet. */
const MAX_FOUT = 0.3;
/** Zoveel van de bovenkant moet in het vlak passen; de rest mag schaduw of wolk zijn. */
const MIN_DEEL = 0.6;
/** De passende momenten moeten zo'n deel van de dag beslaan: de vorm zegt de richting. */
const MIN_SPAN_MS = 5 * 3_600_000;
const BIN_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
/** Zoveel wattpiek per paneel is mogelijk; daarbuiten past een verkeerd vlak toevallig. */
const WP_MIN = 250;
const WP_MAX = 550;

interface Proef {
  readonly vlakken: readonly { readonly azimuthDeg: number; readonly tiltDeg: number; readonly deel: number; readonly kant: 'voorkant' | 'achterkant' | null }[];
}

interface Punt {
  readonly t: number;
  readonly w: number;
  readonly sun: SunPosition;
}

/** Het model voor een heldere lucht op de vlakken, per W/m² wattpiek. */
const modelOp = (p: Proef, sun: SunPosition) => p.vlakken.reduce((s, v) => s + clearSkyOnPlaneWm2(sun, v) * v.deel, 0);

/** Welke vlakken er te proberen zijn, naar wat de bewoner over het dak zei. */
function proeven(panelen: PanelenAntwoord, stap: number, rond?: Proef): Proef[] {
  const uit: Proef[] = [];
  const een = (tilts: [number, number], kant: 'voorkant' | 'achterkant' | null) => {
    for (let az = 0; az < 360; az += stap) for (let t = tilts[0]; t <= tilts[1]; t += stap) uit.push({ vlakken: [{ azimuthDeg: az, tiltDeg: t, deel: 1, kant }] });
  };
  const twee = (tilts: [number, number], deelVoor: number | null) => {
    // Bekend welk deel aan de voorkant ligt: dan zegt de vorm ook welke kant dat is (de hele cirkel).
    const tot = deelVoor == null ? 180 : 360;
    for (let az = 0; az < tot; az += stap) {
      for (let t = tilts[0]; t <= tilts[1]; t += stap) {
        const d = deelVoor ?? 0.5;
        const kant = (k: 'voorkant' | 'achterkant') => (deelVoor == null ? null : k);
        uit.push({ vlakken: [{ azimuthDeg: az, tiltDeg: t, deel: d, kant: kant('voorkant') }, { azimuthDeg: (az + 180) % 360, tiltDeg: t, deel: 1 - d, kant: kant('achterkant') }] });
      }
    }
  };
  const k = panelen.ligging;
  if (k === 'voorkant' || k === 'achterkant') een([10, 60], k);
  else if (k === 'beide') {
    const v = panelen.voorkant;
    const a = panelen.achterkant;
    twee([10, 60], v != null && a != null && v + a > 0 && v !== a ? v / (v + a) : null);
  } else if (k === 'plat') {
    een([0, 20], null);
    twee([5, 20], null);
  } else {
    een([0, 60], null);
    twee([10, 60], null);
  }
  if (!rond) return uit;
  // Fijner rond de beste: dezelfde vorm, binnen een stap van de grove.
  const r = rond.vlakken[0]!;
  return uit.filter((p) => {
    const v = p.vlakken[0]!;
    const dAz = Math.abs(((v.azimuthDeg - r.azimuthDeg + 540) % 360) - 180);
    return p.vlakken.length === rond.vlakken.length && dAz <= 5 && Math.abs(v.tiltDeg - r.tiltDeg) <= 5;
  });
}

/**
 * Meet de ligging uit de opbrengst, of null zonder heldere dag (of zonder
 * genoeg metingen). `omvormerW` als die bekend is: wat ertegenaan zit, is
 * afgekapt en zegt niets over de richting.
 */
export function meetLigging(
  rows: readonly PowerRow[],
  location: Location,
  panelen: PanelenAntwoord,
  opts: { readonly timeZone: string; readonly omvormerW?: number | null },
): Meting | null {
  if (panelen.ligging === 'geen') return null;
  const geldig = rows.filter((r) => Number.isFinite(r.meanW) && r.meanW >= 0);
  if (geldig.length < 24) return null;
  const maxW = Math.max(...geldig.map((r) => r.meanW));
  if (maxW < 100) return null;

  // De bovenkant: per tijdstip van de dag de hoogste. Eén heldere dag in tien is genoeg.
  const bins = new Map<number, PowerRow[]>();
  for (const r of geldig) {
    const b = Math.floor((((r.startMs % DAY_MS) + DAY_MS) % DAY_MS) / BIN_MS);
    const l = bins.get(b);
    if (l) l.push(r);
    else bins.set(b, [r]);
  }
  const clip = 0.97 * (opts.omvormerW ?? maxW);
  const punten: Punt[] = [];
  for (const lijst of bins.values()) {
    const p = lijst.reduce((a, b) => (b.meanW > a.meanW ? b : a));
    if (p.meanW <= 0.08 * maxW || p.meanW >= clip) continue;
    const t = p.startMs + BIN_MS / 2;
    punten.push({ t, w: p.meanW, sun: sunPosition(t, location.latDeg, location.lonDeg) });
  }
  if (punten.length < 24) return null;

  const aantal = panelen.ligging === 'beide' && panelen.voorkant != null && panelen.achterkant != null ? panelen.voorkant + panelen.achterkant : panelen.aantal;
  const laag = Math.max(maxW * 0.9, aantal ? aantal * WP_MIN : 0);
  const hoog = Math.min(maxW * 4, aantal ? aantal * WP_MAX : Infinity);

  const beoordeel = (p: Proef) => {
    const pts = punten.map((x) => ({ x, y: Math.log(x.w), m: modelOp(p, x.sun) })).filter((q) => q.m > 20);
    if (pts.length < 24) return null;
    // Wat ver onder het vlak blijft, is wolk of schaduw: vier keer weglaten en opnieuw.
    let use = pts;
    let ls = 0;
    for (let i = 0; i < 4; i++) {
      ls = use.reduce((s, q) => s + q.y - Math.log(q.m), 0) / use.length;
      const nu = pts.filter((q) => q.y - Math.log(q.m) - ls > -0.25);
      if (nu.length < 12) return null;
      use = nu;
    }
    ls = use.reduce((s, q) => s + q.y - Math.log(q.m), 0) / use.length;
    // Het vermogen uit het midden: een wolkenrand die de zon even versterkt, telt zo niet mee.
    const midden = use.map((q) => q.y - Math.log(q.m)).sort((a, b) => a - b)[Math.floor(use.length / 2)]!;
    const peakW = Math.exp(midden) * 1000;
    if (peakW < laag || peakW > hoog) return null;
    const spreiding = Math.sqrt(use.reduce((s, q) => s + (q.y - Math.log(q.m) - ls) ** 2, 0) / use.length);
    const deel = use.length / pts.length;
    const uren = use.map((q) => (((q.x.t % DAY_MS) + DAY_MS) % DAY_MS));
    return { fout: spreiding / deel, deel, span: Math.max(...uren) - Math.min(...uren), peakW };
  };

  let best: { p: Proef; r: NonNullable<ReturnType<typeof beoordeel>> } | null = null;
  const probeer = (lijst: Proef[]) => {
    for (const p of lijst) {
      const r = beoordeel(p);
      if (r && (best == null || r.fout < best.r.fout)) best = { p, r };
    }
  };
  probeer(proeven(panelen, 5));
  if (best == null) return null;
  probeer(proeven(panelen, 1, (best as { p: Proef }).p));
  const b = best as { p: Proef; r: NonNullable<ReturnType<typeof beoordeel>> };
  if (b.r.fout > MAX_FOUT || b.r.deel < MIN_DEEL || b.r.span < MIN_SPAN_MS) return null;

  const vlakken: GemetenVlak[] = b.p.vlakken.map((v) => ({ azimuthDeg: v.azimuthDeg, tiltDeg: v.tiltDeg, peakW: Math.round((b.r.peakW * v.deel) / 10) * 10, kant: v.kant }));
  const peakW = vlakken.reduce((s, v) => s + v.peakW, 0);
  return { vlakken, peakW, fout: Math.round(b.r.fout * 1000) / 1000, dag: helderste(geldig, b.p, b.r.peakW, location, opts.timeZone) };
}

/** De dag die het dichtst bij een heldere lucht kwam, per kwartier, met de lijn ernaast. */
function helderste(rows: readonly PowerRow[], p: Proef, peakW: number, location: Location, timeZone: string): DagLijn {
  const perDag = new Map<string, PowerRow[]>();
  for (const r of rows) {
    const d = partsIn(r.startMs, timeZone);
    const k = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    const l = perDag.get(k);
    if (l) l.push(r);
    else perDag.set(k, [r]);
  }
  const model = (t: number) => (modelOp(p, sunPosition(t, location.latDeg, location.lonDeg)) * peakW) / 1000;
  let keuze: { datum: string; rows: PowerRow[]; deel: number } | null = null;
  for (const [datum, l] of perDag) {
    // Alleen een hele dag: van voor de zon tot erna.
    if (l.length < 200) continue;
    const gemeten = l.reduce((s, r) => s + r.meanW, 0);
    const verwacht = l.reduce((s, r) => s + model(r.startMs + BIN_MS / 2), 0);
    const deel = verwacht > 0 ? gemeten / verwacht : 0;
    if (keuze == null || deel > keuze.deel - 0.02) keuze = { datum, rows: l, deel };
  }
  if (keuze == null) return { datum: '', kWh: 0, punten: [] };
  const kwartieren = new Map<number, { som: number; n: number; t: number }>();
  for (const r of keuze.rows) {
    const d = partsIn(r.startMs, timeZone);
    const q = d.h * 4 + Math.floor(d.mi / 15);
    const k = kwartieren.get(q) ?? { som: 0, n: 0, t: r.startMs - (d.mi % 15) * 60_000 };
    k.som += r.meanW;
    k.n += 1;
    kwartieren.set(q, k);
  }
  const punten: [number, number, number][] = [];
  for (const [q, k] of [...kwartieren].sort((a, b) => a[0] - b[0])) {
    const gemeten = Math.round(k.som / k.n);
    const berekend = Math.round(model(k.t + 7.5 * 60_000));
    if (gemeten > 15 || berekend > 15) punten.push([q / 4, gemeten, berekend]);
  }
  const kWh = Math.round(keuze.rows.reduce((s, r) => s + r.meanW / 12, 0) / 100) / 10;
  return { datum: keuze.datum, kWh, punten };
}

/* ------------------------------------------------------------ de voorkant */

const hoekVerschil = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const norm = (deg: number) => Math.round(((deg % 360) + 360) % 360);

/**
 * Waar de voorkant naartoe kijkt. Uit de meting als een vlak aan een bekende
 * kant ligt; bij twee kanten zonder verschil kiest het antwoord "wanneer
 * schijnt de zon op de voorkant?" welke van de twee het is.
 */
export function voorgevelVan(vlakken: readonly GemetenVlak[], panelen: PanelenAntwoord, zon: VoorkantZon | null): number | null {
  const voor = vlakken.find((v) => v.kant === 'voorkant');
  if (voor) return norm(voor.azimuthDeg);
  const achter = vlakken.find((v) => v.kant === 'achterkant');
  if (achter) return norm(achter.azimuthDeg + 180);
  const doel = zon && zon !== 'weetniet' ? ZON_RICHTING[zon] : null;
  if (doel == null) return null;
  // Een plat dak zegt niets over de voorkant; panelen op beide kanten wel.
  if (panelen.ligging === 'beide' && vlakken.length === 2) {
    const dichtst = [...vlakken].sort((a, b) => hoekVerschil(a.azimuthDeg, doel) - hoekVerschil(b.azimuthDeg, doel))[0]!;
    if (hoekVerschil(dichtst.azimuthDeg, doel) <= 60) return norm(dichtst.azimuthDeg);
  }
  return doel;
}

/* ------------------------------------------------------------ een schatting */

/** Een gewoon dak, en een gangbaar paneel: tot er gemeten is. */
export const SCHATTING = { hellingDeg: 40, platDeg: 15, wpPerPaneel: 400 } as const;

export function aantalVan(p: PanelenAntwoord): { voor: number; achter: number; totaal: number } | null {
  if (p.ligging === 'beide') {
    const v = p.voorkant;
    const a = p.achterkant;
    if (v != null && a != null) return { voor: v, achter: a, totaal: v + a };
    if (p.aantal != null) return { voor: p.aantal / 2, achter: p.aantal / 2, totaal: p.aantal };
    return null;
  }
  return p.aantal != null ? { voor: p.aantal, achter: 0, totaal: p.aantal } : null;
}

/**
 * Een begin zonder meting: de kant en het aantal uit Inrichten, de voorkant
 * uit wanneer de zon erop schijnt. Zonder kant of aantal geen schatting.
 */
export function schatLigging(panelen: PanelenAntwoord, zon: VoorkantZon | null): { voorgevelDeg: number | null; vlakken: GemetenVlak[] } | null {
  const n = aantalVan(panelen);
  const k = panelen.ligging;
  if (n == null || n.totaal <= 0 || k == null || k === 'weetniet' || k === 'geen') return null;
  const voorgevel = zon && zon !== 'weetniet' ? ZON_RICHTING[zon] : null;
  const wp = SCHATTING.wpPerPaneel;
  if (k === 'plat') return { voorgevelDeg: voorgevel, vlakken: [{ azimuthDeg: 180, tiltDeg: SCHATTING.platDeg, peakW: n.totaal * wp, kant: null }] };
  if (k === 'beide') {
    // Panelen op twee kanten liggen meestal op oost en west.
    const voor = voorgevel ?? 90;
    return {
      voorgevelDeg: voorgevel,
      vlakken: [
        { azimuthDeg: voor, tiltDeg: SCHATTING.hellingDeg, peakW: Math.round(n.voor * wp), kant: 'voorkant' },
        { azimuthDeg: norm(voor + 180), tiltDeg: SCHATTING.hellingDeg, peakW: Math.round(n.achter * wp), kant: 'achterkant' },
      ],
    };
  }
  // Op één kant: zonder richting van het huis liggen ze meestal op het zuiden.
  const az = voorgevel == null ? 180 : k === 'voorkant' ? voorgevel : norm(voorgevel + 180);
  return { voorgevelDeg: voorgevel, vlakken: [{ azimuthDeg: az, tiltDeg: SCHATTING.hellingDeg, peakW: n.totaal * wp, kant: k }] };
}

/* ------------------------------------------------------------ bevestigen */

/** "Klopt": de meting wordt het dak van de bewoner, met de voorkant erbij. */
export function dakUitMeting(m: Meting, panelen: PanelenAntwoord, zon: VoorkantZon | null, omvormerW: number | null): Dak {
  return {
    voorgevelDeg: voorgevelVan(m.vlakken, panelen, zon),
    vlakken: m.vlakken.map((v) => ({ azimuthDeg: norm(v.azimuthDeg), tiltDeg: Math.round(v.tiltDeg), peakW: v.peakW })),
    omvormerW,
    bron: 'gemeten',
    kant: panelen.ligging,
    aantal: aantalVan(panelen)?.totaal ?? null,
  };
}

/**
 * Aangepast: de voorkant, de helling, het vermogen per paneel en de omvormer.
 * De vlakken volgen uit de kant van het dak en het aantal per kant. Bij een
 * plat dak (of als de kant niet bekend is) houden ze de richting van de meting.
 */
export function dakUitAanpassing(a: DakAanpassing, panelen: PanelenAntwoord, meting: Meting | null): Dak | { fout: string } {
  const n = aantalVan(panelen);
  if (n == null || n.totaal <= 0) return { fout: 'vul eerst het aantal panelen in' };
  const voor = norm(a.voorgevelDeg);
  const helling = Math.round(a.hellingDeg);
  const k = panelen.ligging;
  let vlakken: Dak['vlakken'];
  if (k === 'voorkant' || k === 'achterkant') {
    vlakken = [{ azimuthDeg: k === 'voorkant' ? voor : norm(voor + 180), tiltDeg: helling, peakW: Math.round(n.totaal * a.wpPerPaneel) }];
  } else if (k === 'beide') {
    vlakken = [
      { azimuthDeg: voor, tiltDeg: helling, peakW: Math.round(n.voor * a.wpPerPaneel) },
      { azimuthDeg: norm(voor + 180), tiltDeg: helling, peakW: Math.round(n.achter * a.wpPerPaneel) },
    ].filter((v) => v.peakW > 0);
  } else {
    const totaal = n.totaal * a.wpPerPaneel;
    const basis = meting?.vlakken ?? [{ azimuthDeg: 180, peakW: 1 }];
    const som = basis.reduce((s, v) => s + v.peakW, 0);
    vlakken = basis.map((v) => ({ azimuthDeg: norm(v.azimuthDeg), tiltDeg: helling, peakW: Math.round((totaal * v.peakW) / som) }));
  }
  return { voorgevelDeg: voor, vlakken, omvormerW: a.omvormerW, bron: 'bewoner', kant: k, aantal: n.totaal };
}

/* ------------------------------------------------------------ de ligging die geldt */

export type LiggingBron = 'app' | 'configuratie' | 'gemeten' | 'schatting';

export interface LiggingInput {
  /** De ligging uit de configuratie (de NAS), of undefined. */
  readonly configuratie: Geometry | undefined;
  readonly dak: Dak | null;
  readonly meting: Meting | null;
  readonly panelen: PanelenAntwoord | null;
  readonly voorkantZon: VoorkantZon | null;
  /** De omvormer uit zijn typenummer in Home Assistant. */
  readonly omvormerGevonden: number | null;
}

const KOMPAS: Readonly<Record<Lang, readonly string[]>> = {
  nl: ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'],
  en: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
};
const kompas = (deg: number, lang: Lang = 'nl') => KOMPAS[lang][Math.round(norm(deg) / 45) % 8]!;

function gevels(voorgevelDeg: number | null, source: GeometrySource): Facade[] {
  if (voorgevelDeg == null) return [];
  return [
    { id: 'voorgevel', name: 'Voorgevel', azimuthDeg: norm(voorgevelDeg), zoneIds: [], source },
    { id: 'achtergevel', name: 'Achtergevel', azimuthDeg: norm(voorgevelDeg + 180), zoneIds: [], source },
  ];
}

function vlakkenVan(vlakken: readonly { azimuthDeg: number; tiltDeg: number; peakW: number }[], source: GeometrySource): SolarPlane[] {
  const gebruikt = new Set<string>();
  return vlakken
    .filter((v) => v.peakW > 0)
    .map((v) => {
      let id = `dak-${v.tiltDeg < 10 ? 'plat' : kompas(v.azimuthDeg)}`;
      for (let i = 2; gebruikt.has(id); i++) id = `${id.replace(/-\d+$/, '')}-${i}`;
      gebruikt.add(id);
      return { id, azimuthDeg: norm(v.azimuthDeg), tiltDeg: Math.round(v.tiltDeg), peakW: Math.round(v.peakW), source };
    });
}

/**
 * Welke ligging geldt, en waarvandaan: wat de bewoner bevestigde, anders de
 * configuratie, anders de meting, anders de schatting.
 */
export function kiesLigging(i: LiggingInput): { geometry: Geometry; bron: LiggingBron } | null {
  const omvormer = (w: number | null | undefined) => (w != null ? { inverterMaxW: w } : {});
  if (i.dak) {
    const source: GeometrySource = i.dak.bron === 'gemeten' ? 'gemeten' : 'bewoner';
    return { bron: 'app', geometry: { facades: gevels(i.dak.voorgevelDeg, source), solarPlanes: vlakkenVan(i.dak.vlakken, source), ...omvormer(i.dak.omvormerW ?? i.omvormerGevonden) } };
  }
  if (i.configuratie) return { bron: 'configuratie', geometry: i.configuratie };
  if (i.panelen?.ligging === 'geen') return null;
  const panelen = i.panelen ?? { ligging: null, aantal: null, voorkant: null, achterkant: null };
  if (i.meting) {
    return {
      bron: 'gemeten',
      geometry: { facades: gevels(voorgevelVan(i.meting.vlakken, panelen, i.voorkantZon), 'gemeten'), solarPlanes: vlakkenVan(i.meting.vlakken, 'gemeten'), ...omvormer(i.omvormerGevonden) },
    };
  }
  const s = schatLigging(panelen, i.voorkantZon);
  if (!s) return null;
  return { bron: 'schatting', geometry: { facades: gevels(s.voorgevelDeg, 'schatting'), solarPlanes: vlakkenVan(s.vlakken, 'schatting'), ...omvormer(i.omvormerGevonden) } };
}

/* ------------------------------------------------------------ de pagina */

/** Een ligging in woorden, voor Inrichten en Energie. */
export interface LiggingWoorden {
  readonly richting: string;
  readonly hellingDeg: number;
  readonly helling: string;
  readonly peakW: number;
  /** "Samen 4,2 kWp"; `vermogenKort` is zonder "samen": "4,2 kWp", "zo'n 4,2 kWp". */
  readonly vermogen: string;
  readonly vermogenKort: string;
  readonly wpPerPaneel: number | null;
  readonly perPaneel: string | null;
  readonly omvormerW: number | null;
  readonly voorgevelDeg: number | null;
  /** Voor Aanpassen: de richting van het eerste vlak en de helling als getal. */
  readonly vlakken: readonly { readonly azimuthDeg: number; readonly tiltDeg: number; readonly peakW: number }[];
}

export interface LiggingView {
  /**
   * `bevestigd`: de bewoner zei klopt of paste aan; `voorstel`: er is gemeten
   * en het wacht op de bewoner; `configuratie`: zoals in het bestand, zonder
   * meting; `wachten`: nog geen heldere dag, met een schatting als die kan.
   */
  readonly stand: 'bevestigd' | 'voorstel' | 'configuratie' | 'wachten';
  /** Wat nu geldt, of null als er nog niets is. */
  readonly nu: (LiggingWoorden & { readonly bron: LiggingBron }) | null;
  readonly voorstel: LiggingWoorden | null;
  readonly lijn: (DagLijn & { readonly datumTekst: string }) | null;
  readonly omvormerGevonden: number | null;
  /** Panelen per kant in woorden, zoals "6 panelen op elke kant". */
  readonly kanten: string | null;
  /** Het totaal aantal panelen, voor "12 × 390 Wp" bij Aanpassen. */
  readonly aantal: number | null;
  /**
   * Welke antwoorden de vraag "wanneer schijnt de zon op de voorkant?" krijgt,
   * of null als de meting het al weet of de bewoner het bevestigde.
   */
  readonly vraagVoorkant: readonly VoorkantZon[] | null;
}

/** De ligging in woorden, per taal (besluit 185). Engels is Brits. */
const WOORDEN = {
  nl: {
    locale: 'nl-NL',
    maanden: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
    eenKant: (kant: string) => `Op het ${kant}en`,
    en: ' en ',
    bijnaPlat: (r: number) => `Rond ${r}°, bijna plat`,
    dak: (r: number, deg: number) => `Rond ${r}°, ${deg < 32 ? 'een flauw' : deg < 45 ? 'een gewoon' : 'een steil'} dak`,
    samen: (kwp: string) => `Samen ${kwp}`,
    zoEen: (kwp: string) => `zo'n ${kwp}`,
    perPaneel: (wp: number, zeker: boolean) => (zeker ? `${wp} Wp per paneel` : `ongeveer ${wp} Wp per paneel`),
    elkeKant: (n: number) => `${n} panelen op elke kant`,
    voorAchter: (voor: number, achter: number) => `${voor} aan de voorkant, ${achter} aan de achterkant`,
    panelen: (n: number) => `${n} panelen`,
  },
  en: {
    locale: 'en-GB',
    maanden: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    eenKant: (kant: string) => `Facing ${kant}`,
    en: ' and ',
    bijnaPlat: (r: number) => `Around ${r}°, almost flat`,
    dak: (r: number, deg: number) => `Around ${r}°, ${deg < 32 ? 'a shallow' : deg < 45 ? 'an ordinary' : 'a steep'} roof`,
    samen: (kwp: string) => `${kwp} in total`,
    zoEen: (kwp: string) => `about ${kwp}`,
    perPaneel: (wp: number, zeker: boolean) => (zeker ? `${wp} Wp per panel` : `about ${wp} Wp per panel`),
    elkeKant: (n: number) => `${n} panels on each side`,
    voorAchter: (voor: number, achter: number) => `${voor} on the front, ${achter} on the back`,
    panelen: (n: number) => `${n} panels`,
  },
} satisfies Record<Lang, unknown>;
const kWp = (w: number, lang: Lang) => (w / 1000).toLocaleString(WOORDEN[lang].locale, { maximumFractionDigits: w >= 10_000 ? 1 : 2, minimumFractionDigits: 0 });
const kWpGrof = (w: number, lang: Lang) => (Math.round(w / 100) / 10).toLocaleString(WOORDEN[lang].locale);

function richtingIn(vlakken: readonly { azimuthDeg: number; peakW: number }[], lang: Lang): string {
  const echt = vlakken.filter((v) => v.peakW > 0);
  if (echt.length === 0) return '';
  const w = WOORDEN[lang];
  const woorden = [...new Set([...echt].sort((a, b) => norm(a.azimuthDeg) - norm(b.azimuthDeg)).map((v) => kompas(v.azimuthDeg, lang)))];
  if (woorden.length === 1) return w.eenKant(woorden[0]!);
  return `${woorden[0]![0]!.toUpperCase()}${woorden[0]!.slice(1)}${w.en}${woorden.slice(1).join(w.en)}`;
}

function hellingIn(deg: number, lang: Lang): string {
  const r = Math.round(deg / 5) * 5;
  return deg < 12 ? WOORDEN[lang].bijnaPlat(r) : WOORDEN[lang].dak(r, deg);
}

function woorden(
  vlakken: readonly { azimuthDeg: number; tiltDeg: number; peakW: number }[],
  voorgevelDeg: number | null,
  omvormerW: number | null,
  aantal: number | null,
  zeker: boolean,
  lang: Lang,
): LiggingWoorden {
  const w = WOORDEN[lang];
  const echt = vlakken.filter((v) => v.peakW > 0);
  const peakW = echt.reduce((s, v) => s + v.peakW, 0);
  const tilt = echt.length ? echt.reduce((s, v) => s + v.tiltDeg * v.peakW, 0) / Math.max(1, peakW) : 0;
  const wp = aantal ? Math.round(peakW / aantal / 5) * 5 : null;
  return {
    richting: richtingIn(echt, lang),
    hellingDeg: Math.round(tilt),
    helling: hellingIn(tilt, lang),
    peakW,
    vermogen: w.samen(zeker ? `${kWp(peakW, lang)} kWp` : w.zoEen(`${kWpGrof(peakW, lang)} kWp`)),
    vermogenKort: zeker ? `${kWp(peakW, lang)} kWp` : w.zoEen(`${kWpGrof(peakW, lang)} kWp`),
    wpPerPaneel: wp,
    perPaneel: wp == null ? null : w.perPaneel(wp, zeker),
    omvormerW,
    voorgevelDeg,
    vlakken: echt.map((v) => ({ azimuthDeg: norm(v.azimuthDeg), tiltDeg: Math.round(v.tiltDeg), peakW: v.peakW })),
  };
}

/** Het moment van de dag waarop de zon op een vlak met deze richting staat. */
const momentVan = (az: number): Exclude<VoorkantZon, 'weetniet'> | null => {
  const a = norm(az);
  return a >= 45 && a < 135 ? 'ochtend' : a >= 135 && a < 225 ? 'middag' : a >= 225 && a < 315 ? 'avond' : null;
};

function vraagVoorkant(i: LiggingInput, panelen: PanelenAntwoord): readonly VoorkantZon[] | null {
  if (i.dak || panelen.ligging === 'geen') return null;
  const vlakken = i.meting?.vlakken ?? [];
  // De meting weet het al: de panelen liggen aan een bekende kant.
  if (vlakken.some((v) => v.kant != null)) return null;
  // Twee kanten tegenover elkaar: alleen de twee momenten die erbij horen.
  if (panelen.ligging === 'beide' && vlakken.length === 2) {
    const momenten = vlakken.map((v) => momentVan(v.azimuthDeg)).filter((m): m is Exclude<VoorkantZon, 'weetniet'> => m != null);
    const volgorde = VOORKANT_ZON.filter((m) => momenten.includes(m as never));
    if (volgorde.length > 0) return [...volgorde, 'weetniet'];
  }
  return VOORKANT_ZON;
}

/** Wat Inrichten en Energie over de ligging laten zien. Zonder entiteiten of plaats. */
export function liggingView(i: LiggingInput, lang: Lang = 'nl'): LiggingView {
  const w = WOORDEN[lang];
  const panelen = i.panelen ?? { ligging: null, aantal: null, voorkant: null, achterkant: null };
  const n = aantalVan(panelen);
  const aantal = n?.totaal ?? null;
  const gekozen = kiesLigging(i);
  const geo = gekozen?.geometry;
  const voorgevel = geo?.facades.find((f) => f.id === 'voorgevel')?.azimuthDeg ?? null;
  const zeker = gekozen?.bron === 'app' && i.dak?.bron === 'bewoner';
  const nu = geo && geo.solarPlanes.length > 0 ? { ...woorden(geo.solarPlanes, voorgevel, geo.inverterMaxW ?? null, aantal, zeker || gekozen?.bron === 'configuratie', lang), bron: gekozen!.bron } : null;
  const voorstel = i.meting ? woorden(i.meting.vlakken, voorgevelVan(i.meting.vlakken, panelen, i.voorkantZon), i.omvormerGevonden, aantal, false, lang) : null;
  const d = i.meting?.dag;
  const lijn = d && d.punten.length > 0 ? { ...d, datumTekst: `${Number(d.datum.slice(8, 10))} ${w.maanden[Number(d.datum.slice(5, 7)) - 1] ?? ''}` } : null;
  const kanten =
    panelen.ligging === 'beide' && panelen.voorkant != null && panelen.achterkant != null
      ? panelen.voorkant === panelen.achterkant
        ? w.elkeKant(panelen.voorkant)
        : w.voorAchter(panelen.voorkant, panelen.achterkant)
      : aantal != null
        ? w.panelen(aantal)
        : null;
  return {
    stand: i.dak ? 'bevestigd' : i.meting ? 'voorstel' : i.configuratie ? 'configuratie' : 'wachten',
    aantal,
    vraagVoorkant: vraagVoorkant(i, panelen),
    nu,
    voorstel,
    lijn,
    omvormerGevonden: i.omvormerGevonden,
    kanten,
  };
}
