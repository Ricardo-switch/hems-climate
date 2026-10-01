/**
 * Snijdt één dag uit een replay-dataset, voor de vaste replay-test (besluit 54).
 *
 *   npx tsx tools/replay-excerpt.ts <dataset.ndjson.gz> <JJJJ-MM-DD> <uit.ndjson.gz>
 *
 * Alleen de entiteiten die de configuratie leest, plus per entiteit de laatste
 * rij van vóór middernacht: de replay moet weten waar de dag begint.
 *
 * **Aanwezigheid gaat eruit.** Deze uitsnede staat in git, en wanneer er
 * iemand thuis was is geen code maar het leven van een huishouden. Elke
 * `person.`-entiteit staat de hele dag op `home`. De test bewaakt gedrag, geen
 * werkelijkheid; een vaste aanwezigheid bewaakt dat net zo goed.
 */

import { resolve } from 'node:path';

import { exampleSite } from '../src/replay/site.js';
import { observedEntities, relevantEntities } from '../src/adapters/homeassistant/mapping.js';
import { loadHistory } from '../src/replay/reconstruct.js';
import { writeDataset } from '../src/replay/stitch.js';
import type { DatasetRow } from '../src/replay/dataset.js';

/** Middernacht van die dag in de tijdzone van de installatie, in epoch-ms. */
function midnight(day: string, timezone: string): number {
  // Het verschil tussen UTC en de tijdzone op dat moment, via Intl: geen
  // aanname over zomer- of wintertijd.
  const utc = Date.parse(`${day}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utc));
  const d = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const local = Date.parse(`${d['year']}-${d['month']}-${d['day']}T${d['hour']}:${d['minute']}:${d['second']}Z`);
  return utc - (local - utc);
}

async function main(): Promise<void> {
  const [source, day, result] = process.argv.slice(2);
  if (!source || !day || !result) {
    console.error('Gebruik: tsx tools/replay-excerpt.ts <dataset.ndjson.gz> <JJJJ-MM-DD> <uit.ndjson.gz>');
    process.exitCode = 1;
    return;
  }

  const needed = new Set([...relevantEntities(exampleSite), ...observedEntities(exampleSite)]);
  const from = midnight(day, exampleSite.timezone);
  const until = from + 24 * 60 * 60_000;

  const history = await loadHistory(resolve(source));
  const rows: DatasetRow[] = [];
  for (const [e, track] of history.tracks) {
    if (!needed.has(e)) continue;
    const before = track.rows.filter((r) => r.t < from).at(-1);
    const inside = track.rows.filter((r) => r.t >= from && r.t < until);
    if (e.startsWith('person.')) {
      // Eén rij, thuis, vanaf het begin. Geen tijdlijn van wie wanneer weg was.
      rows.push({ t: before?.t ?? from, e, s: 'home' });
      continue;
    }
    if (before) rows.push(before);
    rows.push(...inside);
  }
  rows.sort((a, b) => a.t - b.t);

  const entities = [...new Set(rows.map((r) => r.e))].sort();
  await writeDataset(resolve(result), {
    meta: {
      kind: 'meta',
      version: 1,
      source: `uitsnede ${day} uit ${history.meta.source}`,
      exportedAtMs: history.meta.exportedAtMs,
      fromMs: from,
      toMs: until - 60_000,
      entities,
      rows: rows.length,
    },
    rows,
  });
  console.log(`Geschreven: ${result} — ${rows.length} rijen, ${entities.length} entiteiten`);
  const missing = [...needed].filter((e) => !entities.includes(e));
  if (missing.length > 0) console.log(`  niet in de bron: ${missing.join(', ')}`);
}

await main();
