/**
 * Besluit 58: oude dagen comprimeren zonder dat een analyse het merkt.
 *
 * De maat is niet dat er `.gz`-bestanden ontstaan, maar dat elke lezer daarna
 * precies hetzelfde ziet als ervoor — en dat een onderbroken compressie nooit
 * een dag laat verdwijnen of dubbel laat tellen.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { compressOldDays } from '../src/adapters/archive.js';
import { findHistoryFiles, findLogFiles, linesOf } from '../src/divergence/read.js';
import { stitchHistory } from '../src/replay/stitch.js';

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0); // 20 oktober

/** Een logmap met besluiten en historie over twee weken. */
async function logDirFixture(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-archief-'));
  cleanup.push(d);
  for (const day of ['2026-10-05', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-19', '2026-10-20']) {
    const t = Date.parse(`${day}T10:00:00Z`);
    await writeFile(
      join(d, `decisions-${day}.ndjson`),
      `${JSON.stringify({ t, changed: true, dag: day })}\n${JSON.stringify({ t: t + 60_000, changed: false })}\n`,
      'utf-8',
    );
    await writeFile(
      join(d, `history-${day}.ndjson`),
      `${JSON.stringify({ t, e: 'sensor.p1_meter_power', s: String(-t % 997) })}\n` +
        `${JSON.stringify({ t, e: 'sun.sun', s: 'above_horizon' })}\n`,
      'utf-8',
    );
  }
  return d;
}

async function allLines(files: readonly string[]): Promise<string[]> {
  const result: string[] = [];
  for (const path of files) for await (const r of linesOf(path)) result.push(r);
  return result;
}

describe('oude dagen comprimeren', () => {
  it('comprimeert alleen wat ouder is dan een week, en houdt de inhoud gelijk', async () => {
    const d = await logDirFixture();
    const before = await readFile(join(d, 'decisions-2026-10-05.ndjson'));

    const done = await compressOldDays(d, NOW);

    // Grens is 13 oktober: alles daarvoor, voor beide soorten.
    expect(done.sort()).toEqual([
      'decisions-2026-10-05.ndjson',
      'decisions-2026-10-09.ndjson',
      'decisions-2026-10-12.ndjson',
      'history-2026-10-05.ndjson',
      'history-2026-10-09.ndjson',
      'history-2026-10-12.ndjson',
    ]);
    const names = await readdir(d);
    expect(names).toContain('decisions-2026-10-13.ndjson');
    expect(names).toContain('decisions-2026-10-20.ndjson');
    expect(names).not.toContain('decisions-2026-10-05.ndjson');
    expect(names.filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(gunzipSync(await readFile(join(d, 'decisions-2026-10-05.ndjson.gz')))).toEqual(before);
  });

  it('doet bij een tweede ronde niets', async () => {
    const d = await logDirFixture();
    await compressOldDays(d, NOW);
    expect(await compressOldDays(d, NOW)).toEqual([]);
  });

  it('laat elke lezer precies hetzelfde zien als ervoor', async () => {
    const d = await logDirFixture();
    const decisionLogFor = await allLines(await findLogFiles(d));
    const historyBefore = await stitchHistory(d, NOW);

    await compressOldDays(d, NOW);

    expect(await findLogFiles(d)).toHaveLength(6);
    expect(await allLines(await findLogFiles(d))).toEqual(decisionLogFor);
    const historyAfter = await stitchHistory(d, NOW);
    expect(historyAfter.rows).toEqual(historyBefore.rows);
    expect(historyAfter.meta.fromMs).toBe(historyBefore.meta.fromMs);
  });

  it('telt een half gecomprimeerde dag niet dubbel, en ruimt hem daarna op', async () => {
    // De stroom viel uit na de rename en vóór het weghalen: beide bestaan.
    const d = await logDirFixture();
    const path = join(d, 'decisions-2026-10-05.ndjson');
    await writeFile(`${path}.gz`, gzipSync(await readFile(path)));

    const files = await findLogFiles(d);
    expect(files.filter((p) => p.includes('2026-10-05'))).toEqual([`${path}.gz`]);
    expect(await findHistoryFiles(d)).toHaveLength(6);

    await compressOldDays(d, NOW);
    expect(await readdir(d)).not.toContain('decisions-2026-10-05.ndjson');
    expect(await readdir(d)).toContain('decisions-2026-10-05.ndjson.gz');
  });
});
