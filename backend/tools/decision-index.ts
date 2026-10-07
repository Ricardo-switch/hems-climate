/**
 * Werkt de index bovenaan `DECISIONS.md` bij, en de links onder `STAND.md`
 * (zie `tools/decision-records.ts`).
 *
 *   npm run decisions:index
 *
 * Weigert als een besluit geen onderwerp of status heeft, of als een status
 * naar een besluit verwijst dat niet bestaat: dan zou de index iets beweren
 * wat het log niet zegt. Mist er een geldend besluit in de stand, dan zegt hij
 * welk, maar werkt hij de links wel bij.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validate, validateStand, parseDecisionRecords, withIndex, withLinks } from './decision-records.js';

const PATH = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));
const STAND = fileURLToPath(new URL('../../STAND.md', import.meta.url));

const text = await readFile(PATH, 'utf-8');
const records = parseDecisionRecords(text);
const errors = validate(records);
if (errors.length > 0) {
  console.error('De index kan niet worden bijgewerkt:');
  for (const f of errors) console.error(`  ${f}`);
  process.exitCode = 1;
} else {
  const output = withIndex(text);
  if (output === text) {
    console.log('De index was al bij.');
  } else {
    await writeFile(PATH, output, 'utf-8');
    console.log(`Index bijgewerkt: ${parseDecisionRecords(output).length} besluiten.`);
  }

  const stand = await readFile(STAND, 'utf-8');
  const linked = withLinks(stand, records);
  if (linked !== stand) {
    await writeFile(STAND, linked, 'utf-8');
    console.log('De links onder STAND.md zijn bijgewerkt.');
  }
  const gaps = validateStand(linked, records);
  if (gaps.length > 0) {
    console.error('STAND.md loopt achter:');
    for (const f of gaps) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}
