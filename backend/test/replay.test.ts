/**
 * De vaste replay (besluit 54): een echte dag, en precies dezelfde besluiten.
 *
 * 26 augustus 2026, een dag met zowel overschot als invoer, afgespeeld zoals de
 * schaduwdienst op de NAS beslist. Elke verandering in de kern, de vertaling,
 * de schaduwboekhouding of de configuratie die het gedrag raakt, maakt deze test
 * rood — ook als alle andere tests groen blijven.
 *
 * Rood en het was de bedoeling? `npm run replay:vastleggen`, en de diff van het
 * verwachte bestand gaat mee in de commit. Rood en het was níet de bedoeling?
 * Dan is dit precies waarvoor de test er staat.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { loadHistory } from '../src/replay/reconstruct.js';
import { speelAf, type Samenvatting } from '../src/replay/golden.js';

const DAG = fileURLToPath(new URL('./fixtures/replay-2026-08-26.ndjson.gz', import.meta.url));
const VERWACHT = new URL('./fixtures/replay-2026-08-26.verwacht.json', import.meta.url);

describe('de vaste replay', () => {
  it('beslist over 26 augustus precies zoals vastgelegd', async () => {
    const werkelijk = speelAf(await loadHistory(DAG), exampleSite);
    const verwacht = JSON.parse(readFileSync(VERWACHT, 'utf-8')) as Samenvatting;

    // Eerst de tellingen: die geven bij een afwijking het snelste beeld.
    expect(werkelijk.minuten).toBe(1440);
    expect(werkelijk.blokkades).toEqual(verwacht.blokkades);
    expect(werkelijk.aanvaard).toEqual(verwacht.aanvaard);
    // Dan elk commando, met zijn tijd.
    expect(werkelijk.commandos).toEqual(verwacht.commandos);
  });

  it('heeft een dag die iets te beslissen gaf', () => {
    // Een vaste test op een dag waarop niets gebeurt, bewaakt niets.
    const verwacht = JSON.parse(readFileSync(VERWACHT, 'utf-8')) as Samenvatting;
    const starts = verwacht.commandos.filter((c) => / (cool|heat)$/.test(c));
    expect(starts.length).toBeGreaterThan(0);
    expect(Object.keys(verwacht.blokkades).length).toBeGreaterThan(2);
  });
});
