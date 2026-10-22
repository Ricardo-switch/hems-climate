/*
 * De talen van de app (besluit 185, stap 8; besluit 86).
 *
 * Bewaakt drie dingen: dat teksten.nl.js en teksten.en.js dezelfde sleutels
 * hebben, met dezelfde {plekken} en dezelfde meervoudsvormen; dat elke sleutel
 * die de code vraagt er ook staat; en dat er in de bestanden die al omgezet
 * zijn geen losse Nederlandse tekst meer staat. Die lijst groeit met stap 9,
 * pagina voor pagina, tot de hele app erin staat.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { taalVan } from '../src/web/server.js';
import { losInBestand, nederlands } from '../tools/teksten.js';

const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
const lees = (pad: string) => readFileSync(FRONTEND + pad, 'utf-8');

type Tekst = string | Record<string, string> | ((p: unknown) => string);
function laadTalen(): Record<string, Record<string, Tekst>> {
  const window: { TALEN?: Record<string, Record<string, Tekst>> } = {};
  for (const taal of ['nl', 'en']) runInNewContext(lees(`kit/teksten.${taal}.js`), { window });
  return window.TALEN!;
}

/** De bestanden die al helemaal uit de tekstbestanden lezen (stap 8: Thuis). */
const OMGEZET = ['src/thuis.js', 'src/thuis.html', 'src/gevoel.js', 'src/basis.js', 'src/eigen.js', 'src/niemand.js', 'src/rondleiding.js', 'src/kamer.js', 'src/kamer.html', 'src/vandaag.js', 'src/vandaag.html', 'src/apparaten.js', 'src/apparaten.html', 'src/opbrengst.js', 'src/opbrengst.html', 'src/assistent.js', 'src/assistent.html', 'src/luisteren.js', 'src/jij.js', 'src/jij.html', 'src/instellingen.js', 'src/instellingen.html', 'src/groep.js', 'src/comfort.js', 'src/comfort.html', 'src/regeling.js', 'src/regeling.html', 'src/energie.js', 'src/energie.html', 'src/panelen.js', 'src/functies.js', 'src/functies.html', 'src/toegang.js', 'src/toegang.html', 'src/bewoners.js', 'src/bewoners.html', 'src/huismodel.js', 'src/stand.js', 'src/huis-kan.js', 'src/huis-kan.html', 'src/indeling.js', 'src/indeling.html', 'kit/nav.js', 'kit/sankey.js', 'kit/taal.js'];
/** Waar de code sleutels vraagt: wat omgezet is, en de tekening van het huis. */
const VRAGEN = [...OMGEZET, 'kit/huis.js'];

/** Een script zonder commentaar, zodat een voorbeeld in de uitleg niet als sleutel telt. */
function zonderCommentaar(pad: string, code: string): string {
  if (!pad.endsWith('.js')) return code.replace(/<!--[\s\S]*?-->/g, '');
  const bron = ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return ts.createPrinter({ removeComments: true }).printFile(bron);
}

describe('de talen van de app (besluit 185)', () => {
  const talen = laadTalen();

  it('heeft in het Engels precies de sleutels van het Nederlands, met dezelfde plekken en vormen', () => {
    const nl = talen['nl']!;
    const en = talen['en']!;
    expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
    const plekken = (w: Tekst) => [...new Set([...JSON.stringify(typeof w === 'function' ? '' : w).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    for (const k of Object.keys(nl)) {
      const a = nl[k]!;
      const b = en[k]!;
      expect(typeof b, k).toBe(typeof a);
      if (typeof a === 'object') expect(Object.keys(b as object).sort(), k).toEqual(Object.keys(a).sort());
      expect(plekken(b), k).toEqual(plekken(a));
    }
  });

  it('heeft een tekst voor elke sleutel die de app vraagt', () => {
    const nl = talen['nl']!;
    const soorten = new Set(Object.keys(nl).map((k) => k.split('.')[0]!));
    const ontbreekt: string[] = [];
    for (const pad of VRAGEN) {
      const code = zonderCommentaar(pad, lees(pad));
      // t('…'), vet('…') en taal.html('…'), en in de HTML data-t="…" en data-t-…="…".
      for (const m of code.matchAll(/(?:\bt|\bvet|\.html|global\.t\??\.?)\(\s*'([a-zA-Z_]+\.[a-zA-Z_.]+)'/g)) if (!(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
      for (const m of code.matchAll(/'([a-z]+\.[a-zA-Z_]+(?:\.[a-zA-Z_]+)*)'/g)) {
        // Een sleutel in een ternary, zoals t(x ? 'a.b' : 'a.c'): ook die moet er zijn.
        if (soorten.has(m[1]!.split('.')[0]!) && !/\.(html|js)$/.test(m[1]!) && !(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
      }
      // Een sleutel met een stuk erin, zoals t(`thuis.stand.${id}`): er moet er minstens één met dat begin zijn.
      for (const m of code.matchAll(/t\(`([a-zA-Z_.]+)\$\{/g)) if (!Object.keys(nl).some((k) => k.startsWith(m[1]!))) ontbreekt.push(`${pad}: ${m[1]}…`);
      for (const m of code.matchAll(/data-t(?:-[a-z-]+)?="([^"]+)"/g)) if (!(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
    }
    expect(ontbreekt).toEqual([]);
  });

  it('heeft geen losse Nederlandse tekst meer in wat al omgezet is', () => {
    const los = OMGEZET.flatMap((pad) => losInBestand(pad, lees(pad)).map((l) => `${pad}:${l.regel}: ${l.tekst}`));
    expect(los).toEqual([]);
  });

  it('vindt Nederlands, en laat code met rust', () => {
    expect(nederlands('Nog geen metingen van vandaag.')).toHaveLength(1);
    expect(nederlands('<button aria-label="Sluiten">×</button>')).toHaveLength(1);
    expect(nederlands('Klaar')).toHaveLength(1);
    expect(nederlands('No measurements yet today.')).toEqual([]);
    expect(nederlands('[data-weer]')).toEqual([]);
    expect(nederlands('api/vandaag')).toEqual([]);
    expect(nederlands('thuis.vandaag.geen')).toEqual([]);
    expect(nederlands(' kW')).toEqual([]);
    expect(nederlands('" data-gevoel-tik="')).toEqual([]);
    expect(nederlands('<b data-t-aria-label="thuis.uitleg">')).toEqual([]);
  });

  it('kiest de taal van de pagina uit ?taal= of de kop x-taal, en anders Nederlands', () => {
    expect(taalVan('en')).toBe('en');
    expect(taalVan(['en', 'nl'])).toBe('en');
    expect(taalVan('fr')).toBe('nl');
    expect(taalVan(undefined)).toBe('nl');
  });
});
