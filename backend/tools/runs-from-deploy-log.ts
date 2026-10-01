/**
 * Reconstrueert `runs.ndjson` voor de tijd vóór besluit 66, uit het
 * uitroljournaal van de NAS.
 *
 *   npx tsx tools/runs-from-deploy-log.ts <deploy.log> [site-id]
 *
 * Schrijft regels naar stdout; zelf in de logmap zetten. Elke geslaagde uitrol
 * ("Klaar op <commit>") wordt een start, met `source: "deploy.log"`. Wat het
 * journaal niet weet, staat er eerlijk bij: de configuratie is "onbekend", en
 * een herstart zonder uitrol (een gekopieerde configuratie) ontbreekt.
 *
 * De tijden in het journaal zijn lokale tijd op de NAS. Ze worden gelezen als
 * lokale tijd van deze machine, dus draai dit in dezelfde tijdzone.
 */

import { readFile } from 'node:fs/promises';

import type { RunRecord } from '../src/adapters/runs.js';

const DONE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s+Klaar op ([0-9a-f]{7,40})\b/;

export function runsFromDeployLog(text: string, site: string): RunRecord[] {
  const runs: RunRecord[] = [];
  for (const line of text.split('\n')) {
    const m = DONE.exec(line.trim());
    if (!m) continue;
    runs.push({
      t: new Date(`${m[1]}T${m[2]}`).getTime(),
      commit: m[3]!.slice(0, 7),
      built: null,
      config: 'onbekend',
      site,
      source: 'deploy.log',
    });
  }
  return runs;
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('Gebruik: npx tsx tools/runs-from-deploy-log.ts <deploy.log> [site-id]');
    process.exit(1);
  }
  const site = process.argv[3] ?? 'huis-cornelissen';
  for (const run of runsFromDeployLog(await readFile(path, 'utf-8'), site)) {
    console.log(JSON.stringify(run));
  }
}

if (process.argv[1]?.endsWith('runs-from-deploy-log.ts')) await main();
