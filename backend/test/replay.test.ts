/**
 * De vaste replay (besluit 54): een echte dag, en precies dezelfde besluiten.
 *
 * 26 augustus 2026, een dag met zowel overschot als invoer, afgespeeld zoals de
 * schaduwdienst op de NAS beslist. Elke verandering in de kern, de vertaling,
 * de schaduwboekhouding of de configuratie die het gedrag raakt, maakt deze test
 * rood — ook als alle andere tests groen blijven.
 *
 * Rood en het was de bedoeling? `npm run replay:record`, en de diff van het
 * verwachte bestand gaat mee in de commit. Rood en het was níet de bedoeling?
 * Dan is dit precies waarvoor de test er staat.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { loadHistory } from '../src/replay/reconstruct.js';
import { playBack, type Summary } from '../src/replay/golden.js';

const DAY = fileURLToPath(new URL('./fixtures/replay-2026-08-26.ndjson.gz', import.meta.url));
const EXPECTED = new URL('./fixtures/replay-2026-08-26.expected.json', import.meta.url);

describe('de vaste replay', () => {
  it('beslist over 26 augustus precies zoals vastgelegd', async () => {
    const actual = playBack(await loadHistory(DAY), exampleSite);
    const expected = JSON.parse(readFileSync(EXPECTED, 'utf-8')) as Summary;

    // Eerst de tellingen: die geven bij een afwijking het snelste beeld.
    expect(actual.minuten).toBe(1440);
    expect(actual.blokkades).toEqual(expected.blokkades);
    expect(actual.aanvaard).toEqual(expected.aanvaard);
    // Dan elk commando, met zijn tijd.
    expect(actual.commandos).toEqual(expected.commandos);
  });

  it('heeft een dag die iets te beslissen gaf', () => {
    // Een vaste test op een dag waarop niets gebeurt, bewaakt niets.
    const expected = JSON.parse(readFileSync(EXPECTED, 'utf-8')) as Summary;
    const starts = expected.commandos.filter((c) => / (cool|heat)$/.test(c));
    expect(starts.length).toBeGreaterThan(0);
    expect(Object.keys(expected.blokkades).length).toBeGreaterThan(2);
  });
});
