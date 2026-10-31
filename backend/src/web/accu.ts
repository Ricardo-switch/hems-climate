/**
 * Een thuisbatterij nagerekend op je eigen uren (besluit 230). Wat er in een uur
 * naar het net ging, laadt de accu (met verlies); wat er in een uur van het net
 * kwam, haalt hij er weer uit zolang hij iets heeft. Zo per maat, zodat de app
 * kan zeggen welke maat past, hoeveel er dan nog tekortkwam, en wanneer de accu
 * bijsprong.
 *
 * Een schatting uit de meters van het net: wat er binnen een uur heen en terug
 * ging, ziet de meter niet. Een gewone accu laadt en levert hooguit zo'n halve
 * keer zijn maat per uur, en minstens 2,5 kW.
 */

import type { EnergySettings, EnergySource } from './energy.js';
import { partsIn } from './today.js';

/** De maten om uit te kiezen, in kWh: wat er in een huis gangbaar is. */
export const MATEN = [2.5, 5, 7.5, 10, 12.5, 15, 20] as const;
/** Rond-om rendement: wat er van een kWh terugkomt. */
export const RENDEMENT = 0.9;
/** De aanbevolen maat haalt dit deel van wat de grootste maat zou doen. */
const GENOEG = 0.9;

export interface AccuUur {
  readonly t: number;
  /** Van het net in dit uur, kWh. */
  readonly af: number;
  /** Naar het net in dit uur, kWh. */
  readonly terug: number;
}

export interface AccuMaat {
  readonly kwh: number;
  /** Wat de accu zelf leverde in plaats van het net, kWh. */
  readonly gedektKwh: number;
}

export interface AccuSom {
  readonly aanbevolenKwh: number;
  readonly maten: readonly AccuMaat[];
  /** Wat er in de periode van het net kwam, kWh. */
  readonly vanNetKwh: number;
  /** Wat de aanbevolen accu daarvan zelf had geleverd. */
  readonly gedektKwh: number;
  /** Wat er met die accu nog van het net kwam. */
  readonly tekortKwh: number;
  /** Per uur van de dag (0–23) wat de aanbevolen accu gemiddeld leverde, kWh per dag. */
  readonly uren: readonly number[];
  /** Op hoeveel dagen hij leeg raakte terwijl er nog van het net kwam. */
  readonly legeDagen: number;
  readonly dagen: number;
}

interface Uitkomst {
  gedekt: number;
  uren: number[];
  legeDagen: Set<string>;
}

function reken(uren: readonly AccuUur[], maat: number, tz: string): Uitkomst {
  const kw = Math.max(2.5, maat / 2);
  let lading = 0;
  let gedekt = 0;
  const perUur = Array.from({ length: 24 }, () => 0);
  const legeDagen = new Set<string>();
  for (const u of uren) {
    // Eerst laden met wat er terugging, dan leveren voor wat er van het net kwam: binnen een uur weet de meter de volgorde niet.
    lading = Math.min(maat, lading + Math.min(u.terug, kw) * RENDEMENT);
    const lever = Math.min(u.af, lading, kw);
    lading -= lever;
    gedekt += lever;
    const p = partsIn(u.t, tz);
    perUur[p.h] = (perUur[p.h] ?? 0) + lever;
    if (u.af - lever > 0.05 && lading < 0.01) legeDagen.add(`${p.y}-${p.m}-${p.d}`);
  }
  return { gedekt, uren: perUur, legeDagen };
}

/**
 * De som voor deze uren, of null als er niets naar het net ging (dan heeft een
 * accu niets om te bewaren).
 */
export function accuSom(uren: readonly AccuUur[], tz: string): AccuSom | null {
  const gesorteerd = [...uren].sort((a, b) => a.t - b.t);
  const terug = gesorteerd.reduce((s, u) => s + u.terug, 0);
  if (terug < 1) return null;
  const dagen = new Set(gesorteerd.map((u) => { const p = partsIn(u.t, tz); return `${p.y}-${p.m}-${p.d}`; })).size;
  const uitkomsten = MATEN.map((kwh) => ({ kwh, ...reken(gesorteerd, kwh, tz) }));
  const meest = uitkomsten.at(-1)!.gedekt;
  const beste = uitkomsten.find((u) => u.gedekt >= meest * GENOEG) ?? uitkomsten.at(-1)!;
  const vanNet = gesorteerd.reduce((s, u) => s + u.af, 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    aanbevolenKwh: beste.kwh,
    maten: uitkomsten.map((u) => ({ kwh: u.kwh, gedektKwh: r1(u.gedekt) })),
    vanNetKwh: r1(vanNet),
    gedektKwh: r1(beste.gedekt),
    tekortKwh: r1(Math.max(0, vanNet - beste.gedekt)),
    uren: beste.uren.map((k) => r1(k / Math.max(1, dagen))),
    legeDagen: beste.legeDagen.size,
    dagen,
  };
}

/** Hoe ver terug de som kijkt: een heel jaar, zodat zomer en winter allebei meetellen. */
export const TERUG_MS = 365 * 86_400_000;

/**
 * De som over het afgelopen jaar per uur, uit de meters van het net. Null
 * zonder teruglevering (dan weet de meter niet wat er over was).
 */
export async function accuJaar(source: EnergySource, s: EnergySettings, tz: string, nowMs: number): Promise<(AccuSom & { readonly vanMs: number; readonly totMs: number }) | null> {
  if (s.net.teruglevering.length === 0 || s.net.afname.length === 0) return null;
  const totMs = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const vanMs = totMs - TERUG_MS;
  const rows = await source.changes([...s.net.afname, ...s.net.teruglevering], vanMs, totMs, 'hour');
  const perUur = new Map<number, { af: number; terug: number }>();
  const tel = (ids: readonly string[], k: 'af' | 'terug') => {
    for (const id of ids) {
      for (const r of rows[id] ?? []) {
        const u = perUur.get(r.startMs) ?? { af: 0, terug: 0 };
        u[k] += Math.max(0, r.change);
        perUur.set(r.startMs, u);
      }
    }
  };
  tel(s.net.afname, 'af');
  tel(s.net.teruglevering, 'terug');
  const som = accuSom([...perUur].map(([t, u]) => ({ t, ...u })), tz);
  if (som == null) return null;
  const eerste = Math.min(...perUur.keys());
  return { ...som, vanMs: Math.max(vanMs, eerste), totMs };
}
