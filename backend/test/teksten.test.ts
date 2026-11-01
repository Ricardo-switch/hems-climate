/*
 * Teksten voor elk huis (besluit 131). SunArc wordt openbaar (besluit
 * 118); wat de app zegt, moet kloppen in elk huis, niet alleen in het huis
 * waar het gemaakt is. Deze test leest de pagina's van de weergave, zonder
 * commentaar, en zoekt woorden die over één installatie gaan: de NAS, de
 * namen van omgevingsvariabelen, de manier van uitrollen, of namen uit dat
 * ene huis. De proefomgeving (index.html en app.js) telt niet mee: die is
 * voor wie aan SunArc werkt.
 */
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const MAP = new URL('../../frontend/src/', import.meta.url);
const NIET = ['index.html', 'app.js'];
const WOORDEN: readonly [RegExp, string][] = [
  [/\bNAS\b/, 'de NAS: niet elk huis draait op een NAS'],
  [/HEMS_[A-Z]/, 'een omgevingsvariabele: dat is iets voor wie installeert'],
  // Tailscale mag sinds besluit 160: de eigen poort van de add-on gaat in elk huis via Tailscale.
  [/\bdeploy\b|\bDocker\b/i, 'hoe het bij één huis uitgerold wordt'],
  [/\bSynology\b/, 'een merk alsof iedereen het heeft'],
  [/Cornelissen|Matts|Daan/, 'een naam uit één huis'],
];

/** Zonder commentaar: daar mag uitgelegd worden hoe het hier zit. */
function zonderCommentaar(tekst: string): string {
  return tekst
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/[^:'"`]\/\/ .*$/gm, '');
}

describe('teksten voor elk huis (besluit 131)', () => {
  it('noemt in de app geen NAS, geen omgevingsvariabelen en geen namen uit één huis', async () => {
    const bestanden = (await readdir(MAP)).filter((f) => /\.(js|html)$/.test(f) && !NIET.includes(f));
    expect(bestanden.length).toBeGreaterThan(10);
    const fout: string[] = [];
    for (const f of bestanden) {
      const tekst = zonderCommentaar(await readFile(new URL(f, MAP), 'utf-8'));
      for (const [woord, waarom] of WOORDEN) {
        const m = woord.exec(tekst);
        if (m) fout.push(`${f}: "${tekst.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}" — ${waarom}`);
      }
    }
    expect(fout).toEqual([]);
  });
});

/*
 * Altijd verwarm, verwarmt of verwarmen (15 oktober en 1 november 2026, twee
 * keer gezegd): nooit het kale werkwoord, ook niet "warmt op" of "op warm". In
 * alles wat iemand leest: de app, de dienst, de uitleg in Home Assistant, de
 * pagina's op GitHub en de schetsen. "Te warm" en "warm water" mogen gewoon, en
 * wat de assistent moet verstaan ("maak het warmer", "opwarmen") ook.
 */
const KAAL_WERKWOORD = /\b[Ww]arm(?:t|en|de|den)\b|\b[Oo]p warm\b(?![a-zë])|\bopwarmt\b/;
const OVERAL = ['README.md', 'README.nl.md', 'STAND.md', 'DECISIONS.md', 'addon/DOCS.md', 'addon/CHANGELOG.md', 'frontend/kit', 'frontend/src', 'backend/src', 'backend/test', 'design/app2'];

async function allesIn(pad: string): Promise<string[]> {
  try {
    const items = await readdir(new URL(`../../${pad}`, import.meta.url), { withFileTypes: true });
    const lijst = await Promise.all(items.map(async (i) => (i.isDirectory() ? allesIn(`${pad}/${i.name}`) : /\.(md|js|ts|html|css)$/.test(i.name) ? [`${pad}/${i.name}`] : [])));
    return lijst.flat();
  } catch {
    return [pad];
  }
}

describe('verwarmen, nooit het kale werkwoord', () => {
  it('zegt nergens warmt, warmen, warmde of op warm', async () => {
    // Deze test zelf noemt de woorden in zijn uitleg.
    const bestanden = (await Promise.all(OVERAL.map(allesIn))).flat().filter((f) => !f.endsWith('teksten.test.ts'));
    expect(bestanden.length).toBeGreaterThan(100);
    const fout: string[] = [];
    for (const f of bestanden) {
      const tekst = await readFile(new URL(`../../${f}`, import.meta.url), 'utf-8');
      const m = KAAL_WERKWOORD.exec(tekst);
      if (m) fout.push(`${f}: "${tekst.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}"`);
    }
    expect(fout).toEqual([]);
  });
});
