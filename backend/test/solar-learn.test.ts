/**
 * Wat de panelen werkelijk halen, geleerd uit hun eigen opbrengst (besluit 93).
 *
 * De dagen zijn gemaakt met het model zelf maal een bekende factor, zodat de
 * test weet wat eruit hoort te komen: leert hij die factor terug, en laat hij
 * zich niet gek maken door één wolkenrand, een omvormer die afkapt of een paar
 * bewolkte dagen?
 */

import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sunPosition } from '../src/core/sun.js';
import {
  MIN_DAYS,
  SHADE_DAYS,
  SOLAR_FILE,
  SolarHistory,
  factorFor,
  learnSolar,
  modelW,
  quartersOfDay,
  type QuarterDays,
} from '../src/web/solar-learn.js';
import { sunReport } from '../src/web/sun.js';
import { exampleSite } from './site.js';

const geometry = exampleSite.geometry!;
const location = { latDeg: 52.1, lonDeg: 5.1 };
const QUARTER_MS = 15 * 60_000;

/** Een dag waarop de panelen elk kwartier `factor` maal het model halen. */
function day(date: string, factor: (q: number) => number = () => 1.1): (number | null)[] {
  const start = Date.parse(`${date}T00:00:00Z`);
  return Array.from({ length: 96 }, (_, q) => {
    const sun = sunPosition(start + q * QUARTER_MS + QUARTER_MS / 2, location.latDeg, location.lonDeg);
    return sun.elevationDeg <= 0 ? 0 : Math.round(modelW(geometry, sun) * factor(q));
  });
}

/** `n` dagen vanaf 20 september. */
function days(n: number, factor?: (date: string, q: number) => number): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
    out[date] = day(date, factor ? (q) => factor(date, q) : undefined);
  }
  return out;
}

/** Een stand van de zon op de middag van 25 september, als voorbeeld. */
const middag = sunPosition(Date.parse('2026-09-25T11:30:00Z'), location.latDeg, location.lonDeg);

describe('wat de panelen bij een heldere lucht halen', () => {
  it('leert de factor terug die in de dagen zit', () => {
    const learned = learnSolar(days(8), geometry, location);
    expect(learned.days).toBe(8);
    expect(learned.bins.size).toBeGreaterThan(5);
    for (const f of learned.bins.values()) expect(f).toBeCloseTo(1.1, 1);
    const middle = factorFor(learned, middag, 0.85);
    expect(middle.learned).toBe(true);
    expect(middle.factor).toBeCloseTo(1.1, 1);
  });

  it('laat één wolkenrand niet als maximum tellen', () => {
    // Op één dag haalt elk kwartier ineens 1,6 maal het model.
    const learned = learnSolar(days(8, (d) => (d === '2026-09-22' ? 1.6 : 1.1)), geometry, location);
    expect(factorFor(learned, middag, 0.85).factor).toBeCloseTo(1.1, 1);
  });

  it('leert niets van een vak met te weinig dagen, en valt dan terug op de schatting', () => {
    const learned = learnSolar(days(MIN_DAYS - 1), geometry, location);
    expect(learned.bins.size).toBe(0);
    expect(learned.overall).toBeNull();
    expect(factorFor(learned, middag, 0.85)).toEqual({ factor: 0.85, learned: false });
    expect(factorFor(null, middag, 0.85)).toEqual({ factor: 0.85, learned: false });
  });

  it('negeert wat de omvormer afkapt', () => {
    // Afgekapt op 500 W: dat zegt niets over wat het dak kan, dus geen vak zakt daardoor.
    const capped = days(8);
    for (const quarters of Object.values(capped)) quarters.forEach((w, q) => (quarters[q] = w == null ? null : Math.min(w, 500)));
    const learned = learnSolar(capped, { ...geometry, inverterMaxW: 500 }, location);
    for (const f of learned.bins.values()) expect(f).toBeCloseTo(1.1, 1);
  });

  it('zakt pas onder het midden na veel dagen: schaduw komt elke dag terug, bewolking niet', () => {
    // Schaduw hoort bij een stand van de zon, niet bij een kloktijd: een boom
    // in het zuiden, op de hoogte van de middagzon.
    const az = Math.floor(middag.azimuthDeg / 15);
    const el = Math.floor(middag.elevationDeg / 5);
    const shaded = (date: string, q: number) => {
      const sun = sunPosition(Date.parse(`${date}T00:00:00Z`) + q * QUARTER_MS + QUARTER_MS / 2, location.latDeg, location.lonDeg);
      return Math.floor(sun.azimuthDeg / 15) === az && Math.floor(sun.elevationDeg / 5) === el ? 0.6 : 1.1;
    };
    // 25 september in opeenvolgende jaren: elke dag hetzelfde pad van de zon,
    // zodat het vak van de middag op elke dag langskomt. In één najaar schuift
    // de zon sneller door de vakken; schaduw herkennen gaat dan langzamer, en
    // tot die tijd blijft de lijn op het midden.
    const sameDay = (n: number) => {
      const out: Record<string, (number | null)[]> = {};
      for (let i = 0; i < n; i++) {
        const date = `${2026 - i}-09-25`;
        out[date] = day(date, (q) => shaded(date, q));
      }
      return out;
    };
    // Een paar dagen: dan kan het ook bewolking zijn geweest, en geldt het midden.
    const few = learnSolar(sameDay(MIN_DAYS + 2), geometry, location);
    expect(factorFor(few, middag, 0.85).factor).toBeCloseTo(1.1, 1);
    // Elke dag weer: dat is schaduw, en die mag de lijn zien.
    const many = learnSolar(sameDay(SHADE_DAYS + 1), geometry, location);
    expect(factorFor(many, middag, 0.85).factor).toBeCloseTo(0.6, 1);
  });
});

describe('de lijn voor een heldere lucht', () => {
  const start = Date.parse('2026-09-25T00:00:00Z');

  it('is een schatting zolang er niets geleerd is, en zegt dat', () => {
    const r = sunReport(geometry, location, start + 11.5 * 3_600_000, start);
    expect(r.heldereLucht).toEqual({ bron: 'geschat', dagen: 0, factor: 0.85 });
  });

  it('volgt wat het huis leerde, en zegt uit hoeveel dagen', () => {
    const learned = learnSolar(days(8, () => 1.2), geometry, location);
    const before = sunReport(geometry, location, start + 11.5 * 3_600_000, start);
    const after = sunReport(geometry, location, start + 11.5 * 3_600_000, start, learned);
    expect(after.heldereLucht.bron).toBe('geleerd');
    expect(after.heldereLucht.dagen).toBe(8);
    expect(after.heldereLucht.factor).toBeCloseTo(1.2, 1);
    // 1,2 in plaats van 0,85, behalve waar de omvormer afkapt.
    const ratio = after.panelen.reduce((s, p) => s + p.heldereLuchtW, 0) / before.panelen.reduce((s, p) => s + p.heldereLuchtW, 0);
    expect(ratio).toBeCloseTo(1.2 / 0.85, 1);
    for (const q of after.kwartieren) expect(q.heldereLuchtW).toBeLessThanOrEqual(geometry.inverterMaxW!);
  });
});

describe('de kwartieren naast het logboek', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hems-zon-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  /** Een dagbestand met een meting per 15 s, zoals de dienst schrijft. */
  async function log(date: string, zonW: (t: number) => number | null): Promise<void> {
    const start = Date.parse(`${date}T00:00:00Z`);
    const lines: string[] = [];
    for (let t = start; t < start + 86_400_000; t += 15_000) {
      const z = zonW(t);
      lines.push(JSON.stringify(z == null ? { t, changed: false } : { t, changed: false, zonW: z }));
    }
    await writeFile(join(dir, `decisions-${date}.ndjson`), `${lines.join('\n')}\n`, 'utf-8');
  }

  it('middelt per kwartier, en laat een kwartier zonder genoeg metingen leeg', async () => {
    const start = Date.parse('2026-09-25T00:00:00Z');
    // Het eerste kwartier om en om 100 en 300; het tweede heeft maar vier metingen.
    await log('2026-09-25', (t) => {
      const i = (t - start) / 15_000;
      if (i < 60) return i % 2 === 0 ? 100 : 300;
      if (i < 120) return i < 64 ? 50 : null;
      return 0;
    });
    const q = await quartersOfDay(join(dir, 'decisions-2026-09-25.ndjson'), start);
    expect(q).toHaveLength(96);
    expect(q[0]).toBe(200);
    expect(q[1]).toBeNull();
    expect(q[2]).toBe(0);
  });

  it('leest alleen afgesloten dagen, bewaart ze, en leest ze na een herstart niet opnieuw', async () => {
    await log('2026-09-24', () => 400);
    await log('2026-09-25', () => 500);
    const now = () => Date.parse('2026-09-25T12:00:00Z');
    const first = new SolarHistory({ logDir: dir, now });
    await first.refresh();
    // Vandaag is niet af.
    expect(Object.keys(first.current)).toEqual(['2026-09-24']);
    const saved = JSON.parse(await readFile(join(dir, SOLAR_FILE), 'utf-8')) as { dagen: QuarterDays };
    expect(saved.dagen['2026-09-24']![40]).toBe(400);

    // Na een herstart komt het uit het bestand, ook als het logboek er niet meer is.
    await unlink(join(dir, 'decisions-2026-09-24.ndjson'));
    const again = new SolarHistory({ logDir: dir, now });
    await again.refresh();
    expect(again.current['2026-09-24']![40]).toBe(400);
  });

  it('neemt een nieuwe dag mee zodra hij af is', async () => {
    await log('2026-09-24', () => 400);
    await log('2026-09-25', () => 500);
    let nowMs = Date.parse('2026-09-25T12:00:00Z');
    const history = new SolarHistory({ logDir: dir, now: () => nowMs });
    await history.refresh();
    expect(Object.keys(history.current)).toEqual(['2026-09-24']);
    nowMs = Date.parse('2026-09-26T00:20:00Z');
    await history.refresh();
    expect(Object.keys(history.current).sort()).toEqual(['2026-09-24', '2026-09-25']);
  });
});
