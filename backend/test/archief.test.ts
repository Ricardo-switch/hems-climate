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

import { comprimeerOudeDagen } from '../src/adapters/archief.js';
import { findHistoryFiles, findLogFiles, regelsVan } from '../src/divergence/read.js';
import { stikHistorie } from '../src/replay/stitch.js';

const opruimen: string[] = [];
afterEach(async () => {
  for (const d of opruimen.splice(0)) await rm(d, { recursive: true, force: true });
});

const NU = Date.UTC(2026, 9, 20, 12, 0, 0); // 20 oktober

/** Een logmap met besluiten en historie over twee weken. */
async function logmap(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-archief-'));
  opruimen.push(d);
  for (const dag of ['2026-10-05', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-19', '2026-10-20']) {
    const t = Date.parse(`${dag}T10:00:00Z`);
    await writeFile(
      join(d, `decisions-${dag}.ndjson`),
      `${JSON.stringify({ t, changed: true, dag })}\n${JSON.stringify({ t: t + 60_000, changed: false })}\n`,
      'utf-8',
    );
    await writeFile(
      join(d, `history-${dag}.ndjson`),
      `${JSON.stringify({ t, e: 'sensor.p1_meter_power', s: String(-t % 997) })}\n` +
        `${JSON.stringify({ t, e: 'sun.sun', s: 'above_horizon' })}\n`,
      'utf-8',
    );
  }
  return d;
}

async function alleRegels(bestanden: readonly string[]): Promise<string[]> {
  const uit: string[] = [];
  for (const pad of bestanden) for await (const r of regelsVan(pad)) uit.push(r);
  return uit;
}

describe('oude dagen comprimeren', () => {
  it('comprimeert alleen wat ouder is dan een week, en houdt de inhoud gelijk', async () => {
    const d = await logmap();
    const voor = await readFile(join(d, 'decisions-2026-10-05.ndjson'));

    const gedaan = await comprimeerOudeDagen(d, NU);

    // Grens is 13 oktober: alles daarvoor, voor beide soorten.
    expect(gedaan.sort()).toEqual([
      'decisions-2026-10-05.ndjson',
      'decisions-2026-10-09.ndjson',
      'decisions-2026-10-12.ndjson',
      'history-2026-10-05.ndjson',
      'history-2026-10-09.ndjson',
      'history-2026-10-12.ndjson',
    ]);
    const namen = await readdir(d);
    expect(namen).toContain('decisions-2026-10-13.ndjson');
    expect(namen).toContain('decisions-2026-10-20.ndjson');
    expect(namen).not.toContain('decisions-2026-10-05.ndjson');
    expect(namen.filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(gunzipSync(await readFile(join(d, 'decisions-2026-10-05.ndjson.gz')))).toEqual(voor);
  });

  it('doet bij een tweede ronde niets', async () => {
    const d = await logmap();
    await comprimeerOudeDagen(d, NU);
    expect(await comprimeerOudeDagen(d, NU)).toEqual([]);
  });

  it('laat elke lezer precies hetzelfde zien als ervoor', async () => {
    const d = await logmap();
    const logboekVoor = await alleRegels(await findLogFiles(d));
    const historieVoor = await stikHistorie(d, NU);

    await comprimeerOudeDagen(d, NU);

    expect(await findLogFiles(d)).toHaveLength(6);
    expect(await alleRegels(await findLogFiles(d))).toEqual(logboekVoor);
    const historieNa = await stikHistorie(d, NU);
    expect(historieNa.rows).toEqual(historieVoor.rows);
    expect(historieNa.meta.fromMs).toBe(historieVoor.meta.fromMs);
  });

  it('telt een half gecomprimeerde dag niet dubbel, en ruimt hem daarna op', async () => {
    // De stroom viel uit na de rename en vóór het weghalen: beide bestaan.
    const d = await logmap();
    const pad = join(d, 'decisions-2026-10-05.ndjson');
    await writeFile(`${pad}.gz`, gzipSync(await readFile(pad)));

    const bestanden = await findLogFiles(d);
    expect(bestanden.filter((p) => p.includes('2026-10-05'))).toEqual([`${pad}.gz`]);
    expect(await findHistoryFiles(d)).toHaveLength(6);

    await comprimeerOudeDagen(d, NU);
    expect(await readdir(d)).not.toContain('decisions-2026-10-05.ndjson');
    expect(await readdir(d)).toContain('decisions-2026-10-05.ndjson.gz');
  });
});
