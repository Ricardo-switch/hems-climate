/**
 * De zinnen voor Assist (besluit 184): gemaakt door de dienst, weggeschreven
 * door de integratie. Het voorbeeld in tests/integratie/ geeft de test in een
 * echte Home Assistant dezelfde zinnen; deze test houdt het bij.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { INTENTIE, kamerlijst, zinnenNl, zinnenVoor } from '../src/web/zinnen.js';

const KAMERS = [
  { id: 'woonkamer', naam: 'Woonkamer', woorden: ['keuken', 'zithoek'] },
  { id: 'zolder', naam: 'Zolder', woorden: ['hobbykamer boven'] },
  { id: 'badkamer', naam: 'Badkamer', woorden: ['keuken'] },
];
const VOORBEELD = new URL('../../tests/integratie/zinnen_voorbeeld.json', import.meta.url);
const VOORBEELD_EN = new URL('../../tests/integratie/zinnen_voorbeeld_en.json', import.meta.url);

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

  it('maakt dezelfde vragen ook in het Engels, met dezelfde kamers (besluit 185)', () => {
    type Bestand = { language: string; expansion_rules: Record<string, string>; intents: Record<string, { data: { sentences: string[]; slots: Record<string, string> }[] }>; lists: unknown };
    const nl = zinnenVoor('nl', KAMERS) as Bestand;
    const en = zinnenVoor('en', KAMERS) as Bestand;
    expect(en.language).toBe('en');
    expect(en.intents[INTENTIE]!.data.map((d) => d.slots)).toEqual(nl.intents[INTENTIE]!.data.map((d) => d.slots));
    expect(en.lists).toEqual(nl.lists);
    // Elke regel die een zin gebruikt, bestaat.
    const regels = new Set(Object.keys(en.expansion_rules));
    for (const d of en.intents[INTENTIE]!.data) for (const z of d.sentences) for (const [, r] of z.matchAll(/<([a-z_]+)>/g)) expect(regels.has(r!), `${z}: <${r}>`).toBe(true);
  });

  it('houdt de voorbeelden voor de test in Home Assistant bij (HEMS_ZINNEN_SCHRIJF=1 schrijft ze)', async () => {
    for (const [lang, pad] of [['nl', VOORBEELD], ['en', VOORBEELD_EN]] as const) {
      const tekst = `${JSON.stringify(zinnenVoor(lang, KAMERS.slice(0, 2)), null, 2)}\n`;
      if (process.env['HEMS_ZINNEN_SCHRIJF'] === '1') await writeFile(pad, tekst, 'utf-8');
      // Op Windows kan git CRLF neerzetten; de inhoud telt.
      expect((await readFile(pad, 'utf-8')).replace(/\r\n/g, '\n')).toBe(tekst);
    }
  });
});
