/**
 * Werkt de index bovenaan `DECISIONS.md` bij (zie `tools/decision-records.ts`).
 *
 *   npm run decisions:index
 *
 * Weigert als een besluit geen onderwerp of status heeft, of als een status
 * naar een besluit verwijst dat niet bestaat: dan zou de index iets beweren
 * wat het log niet zegt.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validate, parseDecisionRecords, withIndex } from './decision-records.js';

const PATH = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));

const text = await readFile(PATH, 'utf-8');
const errors = validate(parseDecisionRecords(text));
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
}
