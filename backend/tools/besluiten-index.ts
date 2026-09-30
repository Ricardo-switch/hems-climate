/**
 * Werkt de index bovenaan `DECISIONS.md` bij (zie `tools/besluiten.ts`).
 *
 *   npm run besluiten:index
 *
 * Weigert als een besluit geen onderwerp of status heeft, of als een status
 * naar een besluit verwijst dat niet bestaat: dan zou de index iets beweren
 * wat het log niet zegt.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { controleer, leesBesluiten, metIndex } from './besluiten.js';

const PAD = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));

const tekst = await readFile(PAD, 'utf-8');
const fouten = controleer(leesBesluiten(tekst));
if (fouten.length > 0) {
  console.error('De index kan niet worden bijgewerkt:');
  for (const f of fouten) console.error(`  ${f}`);
  process.exitCode = 1;
} else {
  const nieuw = metIndex(tekst);
  if (nieuw === tekst) {
    console.log('De index was al bij.');
  } else {
    await writeFile(PAD, nieuw, 'utf-8');
    console.log(`Index bijgewerkt: ${leesBesluiten(nieuw).length} besluiten.`);
  }
}
