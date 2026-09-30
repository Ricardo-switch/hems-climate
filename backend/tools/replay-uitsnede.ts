/**
 * Snijdt één dag uit een replay-dataset, voor de vaste replay-test (besluit 54).
 *
 *   npx tsx tools/replay-uitsnede.ts <dataset.ndjson.gz> <JJJJ-MM-DD> <uit.ndjson.gz>
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
import { schrijfDataset } from '../src/replay/stitch.js';
import type { DatasetRow } from '../src/replay/dataset.js';

/** Middernacht van die dag in de tijdzone van de installatie, in epoch-ms. */
function middernacht(dag: string, timezone: string): number {
  // Het verschil tussen UTC en de tijdzone op dat moment, via Intl: geen
  // aanname over zomer- of wintertijd.
  const utc = Date.parse(`${dag}T00:00:00Z`);
  const delen = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utc));
  const d = Object.fromEntries(delen.map((p) => [p.type, p.value]));
  const lokaal = Date.parse(`${d['year']}-${d['month']}-${d['day']}T${d['hour']}:${d['minute']}:${d['second']}Z`);
  return utc - (lokaal - utc);
}

async function main(): Promise<void> {
  const [bron, dag, uit] = process.argv.slice(2);
  if (!bron || !dag || !uit) {
    console.error('Gebruik: tsx tools/replay-uitsnede.ts <dataset.ndjson.gz> <JJJJ-MM-DD> <uit.ndjson.gz>');
    process.exitCode = 1;
    return;
  }

  const nodig = new Set([...relevantEntities(exampleSite), ...observedEntities(exampleSite)]);
  const van = middernacht(dag, exampleSite.timezone);
  const tot = van + 24 * 60 * 60_000;

  const history = await loadHistory(resolve(bron));
  const rows: DatasetRow[] = [];
  for (const [e, track] of history.tracks) {
    if (!nodig.has(e)) continue;
    const ervoor = track.rows.filter((r) => r.t < van).at(-1);
    const binnen = track.rows.filter((r) => r.t >= van && r.t < tot);
    if (e.startsWith('person.')) {
      // Eén rij, thuis, vanaf het begin. Geen tijdlijn van wie wanneer weg was.
      rows.push({ t: ervoor?.t ?? van, e, s: 'home' });
      continue;
    }
    if (ervoor) rows.push(ervoor);
    rows.push(...binnen);
  }
  rows.sort((a, b) => a.t - b.t);

  const entities = [...new Set(rows.map((r) => r.e))].sort();
  await schrijfDataset(resolve(uit), {
    meta: {
      kind: 'meta',
      version: 1,
      source: `uitsnede ${dag} uit ${history.meta.source}`,
      exportedAtMs: history.meta.exportedAtMs,
      fromMs: van,
      toMs: tot - 60_000,
      entities,
      rows: rows.length,
    },
    rows,
  });
  console.log(`Geschreven: ${uit} — ${rows.length} rijen, ${entities.length} entiteiten`);
  const ontbreekt = [...nodig].filter((e) => !entities.includes(e));
  if (ontbreekt.length > 0) console.log(`  niet in de bron: ${ontbreekt.join(', ')}`);
}

await main();
