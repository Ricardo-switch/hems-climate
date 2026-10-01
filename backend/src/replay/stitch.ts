/**
 * Van dagbestanden met live historie naar één replay-dataset (besluit 52).
 *
 * De schaduwdienst schrijft elke wijziging van de gevolgde entiteiten weg in
 * `history-JJJJ-MM-DD.ndjson`. De replay-harness leest één gzip-bestand met een
 * meta-regel voorop — het formaat dat `tools/export-history.ts` uit de recorder
 * maakt. Dit zet het eerste om in het tweede, zodat elk meetscript de live
 * historie kan lezen zonder te weten waar hij vandaan kwam.
 *
 * **Dubbelingen gaan eruit.** Bij elk (her)verbinden legt de dienst de volledige
 * stand vast; een entiteit die intussen niet veranderde, staat er dan twee keer
 * in met dezelfde tijd en waarde.
 *
 * **Het venster begint waar de dataset compleet is.** Die momentopname draagt de
 * tijdstempels van Home Assistant, en een persoon die een week thuis is heeft
 * dan een rij van een week terug. De vroegste tijd als begin nemen zou de replay
 * een week laten afspelen waarin alleen die ene entiteit iets weet, en de rest —
 * de netmeter voorop — onbekend is: een week failsafe. Het venster begint daarom
 * bij het moment waarop élke entiteit haar eerste rij heeft.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { findHistoryFiles, linesOf } from '../divergence/read.js';
import type { DatasetMeta, DatasetRow } from './dataset.js';

export interface Dataset {
  readonly meta: DatasetMeta;
  readonly rows: readonly DatasetRow[];
}

function isRow(x: unknown): x is DatasetRow {
  if (x == null || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r['t'] === 'number' && typeof r['e'] === 'string' && typeof r['s'] === 'string';
}

export async function stitchHistory(map: string, nowMs: number = Date.now()): Promise<Dataset> {
  const all: DatasetRow[] = [];
  for (const path of await findHistoryFiles(map)) {
    for await (const line of linesOf(path)) {
      if (line.trim() === '') continue;
      // Een regel die halverwege is afgekapt — de container werd gestopt — mag
      // de rest niet meeslepen.
      try {
        const x: unknown = JSON.parse(line);
        if (isRow(x)) all.push(x);
      } catch {
        /* overslaan */
      }
    }
  }

  // Stabiel: bij gelijke tijd blijft de volgorde van binnenkomst.
  all.sort((a, b) => a.t - b.t);

  const last = new Map<string, string>();
  const first = new Map<string, number>();
  const rows: DatasetRow[] = [];
  for (const r of all) {
    const key = `${r.t}|${r.s}|${JSON.stringify(r.a ?? null)}`;
    if (last.get(r.e) === key) continue;
    last.set(r.e, key);
    if (!first.has(r.e)) first.set(r.e, r.t);
    rows.push(r);
  }

  if (rows.length === 0) {
    throw new Error(`Geen historie gevonden in ${map} (history-JJJJ-MM-DD.ndjson)`);
  }

  const meta: DatasetMeta = {
    kind: 'meta',
    version: 1,
    source: `live:${resolve(map)}`,
    exportedAtMs: nowMs,
    fromMs: Math.max(...first.values()),
    toMs: rows[rows.length - 1]!.t,
    entities: [...first.keys()].sort(),
    rows: rows.length,
  };
  return { meta, rows };
}

/** Schrijft een dataset als gzip-NDJSON, meta-regel voorop. */
export async function writeDataset(path: string, d: Dataset): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  async function* lines(): AsyncGenerator<string> {
    yield `${JSON.stringify(d.meta)}\n`;
    for (const r of d.rows) yield `${JSON.stringify(r)}\n`;
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(path));
}
