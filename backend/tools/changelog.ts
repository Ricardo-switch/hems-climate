/**
 * Schrijft `addon/CHANGELOG.md` uit `NIEUW` in `src/version.ts` (21 oktober 2026):
 *
 *   npm run changelog
 *
 * De Supervisor leest dat bestand van GitHub, en Home Assistant geeft het als
 * releasenotes van de nieuwste versie; zo ziet de app bij een update wat er
 * nieuw is (`src/web/bijwerken.ts`). Een test eist dat het bestand klopt.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { changelog } from '../src/web/bijwerken.js';
import { NIEUW } from '../src/version.js';

const PATH = fileURLToPath(new URL('../../addon/CHANGELOG.md', import.meta.url));
await writeFile(PATH, changelog(NIEUW));
console.log(`addon/CHANGELOG.md bijgewerkt: ${NIEUW.length} versies.`);
