/*
 * Teksten voor elk huis (besluit 131). Smart Climate wordt openbaar (besluit
 * 118); wat de app zegt, moet kloppen in elk huis, niet alleen in het huis
 * waar het gemaakt is. Deze test leest de pagina's van de weergave, zonder
 * commentaar, en zoekt woorden die over één installatie gaan: de NAS, de
 * namen van omgevingsvariabelen, de manier van uitrollen, of namen uit dat
 * ene huis. De proefomgeving (index.html en app.js) telt niet mee: die is
 * voor wie aan Smart Climate werkt.
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
  // "Warmen" klinkt niet gewoon (15 oktober 2026): verwarmen, en opwarmen mag.
  [/'warmen'|\b(?:gaat|zou|kan|mag) warmen\b|[a-z] warmt (?!op\b)[a-z]/, 'warmen: zeg verwarmen'],
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
