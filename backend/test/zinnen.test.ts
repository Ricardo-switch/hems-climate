/**
 * De zinnen voor Assist (besluit 184): gemaakt door de dienst, weggeschreven
 * door de integratie. Het voorbeeld in tests/integratie/ geeft de test in een
 * echte Home Assistant dezelfde zinnen; deze test houdt het bij.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { INTENTIE, kamerlijst, zinnenNl } from '../src/web/zinnen.js';

const KAMERS = [
  { id: 'woonkamer', naam: 'Woonkamer', woorden: ['keuken', 'zithoek'] },
  { id: 'zolder', naam: 'Zolder', woorden: ['hobbykamer boven'] },
  { id: 'badkamer', naam: 'Badkamer', woorden: ['keuken'] },
];
const VOORBEELD = new URL('../../tests/integratie/zinnen_voorbeeld.json', import.meta.url);

describe('de zinnen voor Assist (besluit 184)', () => {
  it('noemt elke kamer met zijn woorden, en een woord bij één kamer', () => {
    expect(kamerlijst(KAMERS)).toEqual([
      { in: '(woonkamer|keuken|zithoek)', out: 'woonkamer' },
      { in: '(zolder|hobbykamer boven)', out: 'zolder' },
      { in: 'badkamer', out: 'badkamer' },
    ]);
    // Zonder kamers een lijst die Home Assistant niet weigert.
    expect((zinnenNl([]) as { lists: { kamer: { values: unknown[] } } }).lists.kamer.values).toHaveLength(1);
  });

  it('stuurt alles naar één intentie, met de soort vraag als vaste waarde', () => {
    const z = zinnenNl(KAMERS) as { language: string; intents: Record<string, { data: { slots: Record<string, string> }[] }> };
    expect(z.language).toBe('nl');
    expect(z.intents[INTENTIE]!.data.map((d) => [d.slots['vraag'], d.slots['wens'] ?? null])).toEqual([
      ['nu', null],
      ['waarom', null],
      ['straks', null],
      ['zon', null],
      ['doe', 'koelen'],
      ['doe', 'verwarmen'],
      ['doe', 'uit'],
    ]);
  });

  it('houdt het voorbeeld voor de test in Home Assistant bij (HEMS_ZINNEN_SCHRIJF=1 schrijft het)', async () => {
    const tekst = `${JSON.stringify(zinnenNl(KAMERS.slice(0, 2)), null, 2)}\n`;
    if (process.env['HEMS_ZINNEN_SCHRIJF'] === '1') await writeFile(VOORBEELD, tekst, 'utf-8');
    // Op Windows kan git CRLF neerzetten; de inhoud telt.
    expect((await readFile(VOORBEELD, 'utf-8')).replace(/\r\n/g, '\n')).toBe(tekst);
  });
});
