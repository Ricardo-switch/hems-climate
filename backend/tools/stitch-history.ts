/**
 * Voegt de live historie van de schaduwdienst samen tot een replay-dataset.
 *
 *   npx tsx tools/stitch-history.ts <logmap> [uitvoer.ndjson.gz]
 *
 * De logmap is die van de dienst, of een uitgepakte export van de NAS: daar
 * staan `history-JJJJ-MM-DD.ndjson` naast het beslislogboek. Het resultaat is
 * hetzelfde formaat als `export-history.ts` uit de recorder maakt, dus elk
 * meetscript leest het zonder aanpassing. Zie `src/replay/stitch.ts`.
 */

import { resolve } from 'node:path';

import { schrijfDataset, stikHistorie } from '../src/replay/stitch.js';

async function main(): Promise<void> {
  const map = process.argv[2];
  if (!map) {
    console.error('Gebruik: tsx tools/stitch-history.ts <logmap> [uitvoer.ndjson.gz]');
    process.exitCode = 1;
    return;
  }
  const uit = resolve(process.argv[3] ?? 'data/replay/history-live.ndjson.gz');

  const d = await stikHistorie(map);
  await schrijfDataset(uit, d);

  const dagen = (d.meta.toMs - d.meta.fromMs) / 86_400_000;
  console.log(`Geschreven: ${uit}`);
  console.log(`  rijen        ${d.meta.rows.toLocaleString('nl-NL')}`);
  console.log(`  entiteiten   ${d.meta.entities.length}`);
  console.log(
    `  venster      ${new Date(d.meta.fromMs).toISOString().slice(0, 16)} tot ` +
      `${new Date(d.meta.toMs).toISOString().slice(0, 16)}  (${dagen.toFixed(1)} dagen)`,
  );
}

await main();
