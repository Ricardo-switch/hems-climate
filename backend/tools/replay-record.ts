/**
 * Legt het verwachte resultaat van de vaste replay opnieuw vast (besluit 54).
 *
 *   npm run replay:record
 *
 * Alleen draaien wanneer het gedrag bewust verandert: een nieuwe strategie, een
 * ander besluit in de arbiter, een gewijzigde configuratie. De diff van het
 * verwachte bestand hoort dan in dezelfde commit, en is het verslag van wat er
 * anders beslist wordt. Faalt de test zonder dat je iets bewust veranderde, dan
 * is dit het verkeerde gereedschap.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { exampleSite } from '../src/replay/site.js';
import { loadHistory } from '../src/replay/reconstruct.js';
import { playBack } from '../src/replay/golden.js';

const DAY = new URL('../test/fixtures/replay-2026-08-26.ndjson.gz', import.meta.url);
const EXPECTED = new URL('../test/fixtures/replay-2026-08-26.expected.json', import.meta.url);

const s = playBack(await loadHistory(fileURLToPath(DAY)), exampleSite);
await writeFile(EXPECTED, `${JSON.stringify(s, null, 2)}\n`, 'utf-8');
console.log(
  `Vastgelegd: ${s.minuten} minuten, ${s.commandos.length} commando's, ` +
    `${Object.values(s.blokkades).reduce((a, b) => a + b, 0)} blokkades.`,
);
