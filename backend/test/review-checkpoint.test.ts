/**
 * De tussenstand van de terugblik (besluit 63).
 *
 * Eén eis boven alle andere: voortzetten vanaf de tussenstand levert precies
 * hetzelfde op als alles opnieuw rekenen. Een snellere terugblik die iets
 * anders zegt, is erger dan een trage.
 *
 * De logboeken komen uit een generator met een vast startgetal, over meerdere
 * dagen, met afwijkingen die over middernacht doorlopen, korte en volledige
 * records, handmatig, failsafes en blokkades — alles wat de lezer en de analyse
 * over een dag heen moeten meenemen.
 */

import { appendFile, copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { compressOldDays } from '../src/adapters/archive.js';
import { DivergenceCache, type DivergenceReport } from '../src/web/divergence.js';
import { CHECKPOINT_FILE } from '../src/web/review-checkpoint.js';

const DAY_MS = 86_400_000;
const FIRST = Date.UTC(2026, 10, 2); // 2 november 2026, middernacht UTC
const dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-review-'));
  dirs.push(d);
  return d;
}

/** mulberry32: klein, snel en met een vast startgetal herhaalbaar. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const LEGACY_STATES = ['cool@21', 'cool@21.5', 'cool@25', 'off', 'heat@21', 'heat@18'];
const ACTIONS = ['cool', 'heat', 'standby', 'off'];
const MODES = ['dag', 'dag', 'dag', 'nacht', 'afwezig', 'handmatig'];
const BLOCKS = ['insufficient_power_budget', 'min_run_not_elapsed', 'stabilisation_active'];
const REASONS = ['below_target', 'above_target', 'within_band'];

/** Eén logboek per UTC-dag, één record per minuut, vanaf `FIRST`. */
function logDays(seed: number, days: number): Map<string, string> {
  const rand = generator(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const files = new Map<string, string>();
  const legacy: Record<string, string> = { 'ac-woonkamer': 'off', 'ac-zolder': 'off' };
  let mode = 'dag';

  for (let t = FIRST; t < FIRST + days * DAY_MS; t += 60_000) {
    // Langzaam veranderend, zodat afwijkingen uren kunnen duren — ook over middernacht.
    for (const id of Object.keys(legacy)) if (rand() < 0.01) legacy[id] = pick(LEGACY_STATES);
    if (rand() < 0.003) mode = pick(MODES);
    const full = rand() < 0.2;

    const record: Record<string, unknown> = {
      t,
      changed: full,
      mode,
      budget: {
        availableW: Math.round(rand() * 3000),
        allocatedW: Math.round(rand() * 1500),
        surplusW: Math.round(rand() * 2000),
        reclaimableW: Math.round(rand() * 1500),
        gridPowerW: Math.round(rand() * 3500 - 2000),
      },
      zonesT: [
        ['woonkamer', 20 + rand() * 6, pick(['heat', 'cool', 'none']), null],
        ['zolder', 20 + rand() * 7, pick(['heat', 'cool', 'none']), null],
      ],
      buitenC: rand() < 0.1 ? null : Math.round(rand() * 20 * 10) / 10,
      zonW: rand() < 0.1 ? null : Math.round(rand() * 4000),
    };
    if (rand() < 0.5) record['obs'] = { ...legacy };
    if (rand() < 0.02) {
      record['legacy'] = rand() < 0.2 ? 'Handmatig koelen actief: bewoner' : `uitleg ${Math.floor(rand() * 5)}`;
    }
    if (full) {
      const accepted = ['ac-woonkamer', 'ac-zolder']
        .filter(() => rand() < 0.7)
        .map((actuatorId) => ({ actuatorId, action: pick(ACTIONS), strategyId: pick(['pv-surplus', 'comfort']) }));
      record['accepted'] = accepted;
      record['commands'] = accepted
        .filter(() => rand() < 0.4)
        .map((a) => ({ kind: 'setAction', actuatorId: a.actuatorId, action: a.action }));
      record['rejected'] = rand() < 0.5 ? [{ intent: { actuatorId: 'ac-zolder', action: 'cool' }, blockedBy: pick(BLOCKS) }] : [];
      record['zones'] = [{ zoneId: 'woonkamer', temperatureC: 22, demand: 'cool', reason: pick(REASONS) }];
      delete record['zonesT'];
    }
    if (rand() < 0.002) record['failsafe'] = { active: true };

    const day = new Date(t).toISOString().slice(0, 10);
    files.set(day, (files.get(day) ?? '') + `${JSON.stringify(record)}\n`);
  }
  return files;
}

async function write(dir: string, files: Map<string, string>, days: readonly string[]): Promise<void> {
  for (const day of days) await writeFile(join(dir, `decisions-${day}.ndjson`), files.get(day)!, 'utf-8');
}

function cache(dir: string, nowMs: number): DivergenceCache {
  return new DivergenceCache({
    logDir: dir,
    maxEpisodes: 100_000,
    maxPatterns: 1_000,
    write: (line) => {
      throw new Error(`onverwachte melding: ${line}`);
    },
    now: () => nowMs,
  });
}

/** Alles behalve wanneer en hoe lang, en hoeveel er gelezen werd. */
function content(r: DivergenceReport | null): unknown {
  expect(r).not.toBeNull();
  const { berekendOpMs: _a, duurMs: _b, opnieuwGelezen: _c, ...rest } = r!;
  return rest;
}

/** Wat een dienst zonder tussenstand over dezelfde bestanden zegt. */
async function fromScratch(dir: string, nowMs: number): Promise<DivergenceReport> {
  const copy = await freshDir();
  for (const name of await readdir(dir)) {
    if (name.startsWith('decisions-')) await copyFile(join(dir, name), join(copy, name));
  }
  const r = await cache(copy, nowMs).refresh();
  expect(r!.opnieuwGelezen).toBe(r!.bestanden);
  return r!;
}

const dayAt = (i: number): string => new Date(FIRST + i * DAY_MS).toISOString().slice(0, 10);
/** Een half uur na middernacht UTC van dag `i`. */
const justAfter = (i: number): number => FIRST + i * DAY_MS + 30 * 60_000;

describe('de tussenstand van de terugblik (besluit 63)', () => {
  const files = logDays(20261102, 6);
  const DAYS = [0, 1, 2, 3, 4, 5].map(dayAt);

  it('gaat stap voor stap naar precies dezelfde uitkomst als alles in één keer', async () => {
    const dir = await freshDir();
    const c = cache(dir, justAfter(2));

    await write(dir, files, DAYS.slice(0, 2));
    const first = await c.refresh();
    expect(first!.opnieuwGelezen).toBe(2); // beide waren nieuw

    // Drie dagen later: dag 2 en 3 zijn erbij en afgesloten, dag 4 loopt nog.
    await write(dir, files, DAYS.slice(2, 5));
    const later = cache(dir, justAfter(4));
    const r = await later.refresh();
    expect(r!.opnieuwGelezen).toBe(3); // dag 2, 3 en de lopende dag 4
    expect(content(r)).toEqual(content(await fromScratch(dir, justAfter(4))));

    // De test moet ook echt een afwijking over middernacht bevatten.
    const crossing = r!.episodes.some(
      (e) => new Date(e.fromMs).toISOString().slice(0, 10) !== new Date(e.toMs).toISOString().slice(0, 10),
    );
    expect(crossing).toBe(true);
  });

  it('leest na een herstart alleen wat na de laatste afgesloten dag kwam', async () => {
    const dir = await freshDir();
    await write(dir, files, DAYS.slice(0, 5));
    await cache(dir, justAfter(4)).refresh();

    // Een nieuwe dienst, dezelfde map: de tussenstand komt van schijf.
    const r = await cache(dir, justAfter(4) + 15 * 60_000).refresh();
    expect(r!.opnieuwGelezen).toBe(1);
    expect(content(r)).toEqual(content(await fromScratch(dir, justAfter(4) + 15 * 60_000)));
  });

  it('blijft geldig als oude dagen gecomprimeerd worden', async () => {
    const dir = await freshDir();
    await write(dir, files, DAYS);
    await cache(dir, justAfter(5)).refresh();

    // Een week na dag 0 en 1: die twee gaan in een .gz (besluit 58).
    const compressed = await compressOldDays(dir, FIRST + 9 * DAY_MS + 3_600_000, 7);
    expect(compressed.length).toBe(2);

    const r = await cache(dir, justAfter(5)).refresh();
    expect(r!.opnieuwGelezen).toBe(1);
    expect(content(r)).toEqual(content(await fromScratch(dir, justAfter(5))));
  });

  it('rekent alles opnieuw als een afgesloten dag veranderd is', async () => {
    const dir = await freshDir();
    await write(dir, files, DAYS);
    await cache(dir, justAfter(5)).refresh();

    // Iemand voegt een regel toe aan een oude dag. Dat hoort niet te gebeuren;
    // als het toch gebeurt, telt de nieuwe inhoud.
    const extra = { t: FIRST + DAY_MS + 3_600_000, changed: false, mode: 'dag', obs: { 'ac-zolder': 'cool@21' } };
    await appendFile(join(dir, `decisions-${DAYS[1]}.ndjson`), `${JSON.stringify(extra)}\n`, 'utf-8');

    const r = await cache(dir, justAfter(5)).refresh();
    expect(r!.opnieuwGelezen).toBe(r!.bestanden);
    expect(content(r)).toEqual(content(await fromScratch(dir, justAfter(5))));
  });

  it('negeert een onleesbare tussenstand en rekent gewoon', async () => {
    const dir = await freshDir();
    await write(dir, files, DAYS);
    await writeFile(join(dir, CHECKPOINT_FILE), 'geen tussenstand', 'utf-8');

    const r = await cache(dir, justAfter(5)).refresh();
    expect(r!.opnieuwGelezen).toBe(r!.bestanden);
    expect(content(r)).toEqual(content(await fromScratch(dir, justAfter(5))));
  });

  it('gebruikt geen tussenstand die met andere instellingen is gemaakt', async () => {
    const dir = await freshDir();
    await write(dir, files, DAYS);
    await cache(dir, justAfter(5)).refresh();

    const other = new DivergenceCache({
      logDir: dir,
      minEpisodeMinutes: 10,
      maxEpisodes: 100_000,
      write: () => {},
      now: () => justAfter(5),
    });
    const r = await other.refresh();
    expect(r!.opnieuwGelezen).toBe(r!.bestanden);
  });
});
