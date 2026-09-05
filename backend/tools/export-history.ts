/**
 * Exporteert de relevante geschiedenis uit een Home Assistant recorder-database
 * naar gzip-NDJSON.
 *
 * Bedoeld om nachtelijk te draaien. De recorder zelf mag dan kort blijven
 * bewaren — 60 dagen is genoeg om een uitval te overbruggen — terwijl dit
 * archief op volledige resolutie doorloopt. Voor de ~50 entiteiten die ertoe
 * doen is dat onder de gigabyte per jaar, tegenover tientallen gigabytes als je
 * de hele recorder zou bewaren.
 *
 *   npx tsx tools/export-history.ts <pad/naar/home-assistant_v2.db> [uitvoer.ndjson.gz]
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

import {
  KEPT_ATTRIBUTES,
  REPLAY_ENTITIES,
  type DatasetMeta,
  type DatasetRow,
  type KeptAttribute,
} from '../src/replay/dataset.js';

interface RawRow {
  readonly entity_id: string;
  readonly state: string | null;
  readonly last_updated_ts: number | null;
  readonly shared_attrs: string | null;
}

function pickAttributes(
  json: string | null,
): DatasetRow['a'] | undefined {
  if (!json) return undefined;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const out: Partial<Record<KeptAttribute, string | number | null>> = {};
  let found = false;
  for (const key of KEPT_ATTRIBUTES) {
    if (!(key in parsed)) continue;
    const v = parsed[key];
    if (typeof v === 'string' || typeof v === 'number' || v === null) {
      out[key] = v;
      found = true;
    }
  }
  return found ? out : undefined;
}

async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error(
      'Gebruik: tsx tools/export-history.ts <home-assistant_v2.db> [uitvoer.ndjson.gz]',
    );
    process.exitCode = 1;
    return;
  }
  const outPath = resolve(
    process.argv[3] ?? 'data/replay/history.ndjson.gz',
  );

  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });

  const placeholders = REPLAY_ENTITIES.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT m.entity_id      AS entity_id,
           s.state          AS state,
           s.last_updated_ts AS last_updated_ts,
           a.shared_attrs   AS shared_attrs
      FROM states s
      JOIN states_meta m ON m.metadata_id = s.metadata_id
      LEFT JOIN state_attributes a ON a.attributes_id = s.attributes_id
     WHERE m.entity_id IN (${placeholders})
       AND s.last_updated_ts IS NOT NULL
     ORDER BY s.last_updated_ts ASC
  `);

  const raw = stmt.all(...REPLAY_ENTITIES) as unknown as RawRow[];
  db.close();

  if (raw.length === 0) {
    console.error('Geen rijen gevonden. Klopt het pad naar de database?');
    process.exitCode = 1;
    return;
  }

  const rows: DatasetRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (r.last_updated_ts == null) continue;
    const attrs = pickAttributes(r.shared_attrs);
    seen.add(r.entity_id);
    rows.push({
      t: Math.round(r.last_updated_ts * 1000),
      e: r.entity_id,
      s: r.state ?? 'unknown',
      ...(attrs ? { a: attrs } : {}),
    });
  }

  const meta: DatasetMeta = {
    kind: 'meta',
    version: 1,
    source: resolve(dbPath),
    exportedAtMs: Date.now(),
    fromMs: rows[0]!.t,
    toMs: rows[rows.length - 1]!.t,
    entities: [...seen].sort(),
    rows: rows.length,
  };

  await mkdir(dirname(outPath), { recursive: true });
  async function* lines(): AsyncGenerator<string> {
    yield `${JSON.stringify(meta)}\n`;
    for (const row of rows) yield `${JSON.stringify(row)}\n`;
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(outPath));

  const missing = REPLAY_ENTITIES.filter((e) => !seen.has(e));
  const span = (meta.toMs - meta.fromMs) / 86_400_000;

  console.log(`Geschreven: ${outPath}`);
  console.log(`  rijen        ${meta.rows.toLocaleString('nl-NL')}`);
  console.log(`  entiteiten   ${meta.entities.length} van ${REPLAY_ENTITIES.length}`);
  console.log(
    `  venster      ${new Date(meta.fromMs).toISOString().slice(0, 16)} tot ` +
      `${new Date(meta.toMs).toISOString().slice(0, 16)}  (${span.toFixed(1)} dagen)`,
  );
  if (missing.length > 0) {
    console.log(`  ontbrekend   ${missing.join(', ')}`);
  }
}

await main();
