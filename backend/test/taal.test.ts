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

const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
const lees = (pad: string) => readFileSync(FRONTEND + pad, 'utf-8');

type Tekst = string | Record<string, string> | ((p: unknown) => string);
function laadTalen(): Record<string, Record<string, Tekst>> {
  const window: { TALEN?: Record<string, Record<string, Tekst>> } = {};
  for (const taal of ['nl', 'en']) runInNewContext(lees(`kit/teksten.${taal}.js`), { window });
  return window.TALEN!;
}

/** De bestanden die al helemaal uit de tekstbestanden lezen (stap 8: Thuis). */
const OMGEZET = ['src/thuis.js', 'src/thuis.html', 'src/gevoel.js', 'kit/nav.js', 'kit/taal.js'];
/** Waar de code sleutels vraagt; huismodel en jij deels, maar hun sleutels moeten er wel zijn. */
const VRAGEN = [...OMGEZET, 'src/huismodel.js', 'src/jij.js', 'src/basis.js', 'kit/huis.js'];

/** Woorden die in een Engelse of neutrale tekst niet voorkomen, maar in bijna elke Nederlandse zin. */
const NEDERLANDS = /\b(de|het|een|en|van|je|jij|jouw|is|niet|nog|geen|wat|naar|met|voor|bij|uit|dan|er|om|te|nu|zon|huis|kamers?|tik|klaar|sluiten|bekijk|vandaag|morgen|weer|straks|favorieten|batterijen?|laadt|rust|thuis|weg|overdag|nachts|goed|koud|warm)\b/i;

/** Ziet een stukje tekst eruit als Nederlands voor de bewoner, en niet als code? */
function nederlands(tekst: string): string[] {
  const vondsten: string[] = [];
  // Wat een schermlezer of de muis toont, staat in een tag.
  // Niet data-t-aria-label: dat is al een sleutel.
  for (const m of tekst.matchAll(/(?<![\w-])(?:aria-label|title|alt|placeholder|data-naam|data-leeg)="([^"$]*)"/g)) if (NEDERLANDS.test(m[1]!)) vondsten.push(m[1]!);
  const zichtbaar = tekst.replace(/^[^<]*>/, ' ').replace(/<[^>]*>?/g, ' ').trim();
  // Een pad, een selector, een sleutel of een klassenaam is geen tekst.
  if (!zichtbaar || (!/\s/.test(zichtbaar) && !/^[A-ZÀ-Ý]/.test(zichtbaar))) return vondsten;
  if (/^[[#.]|^[a-z0-9-]+(\.[a-zA-Z0-9_-]+)+$|^(api|kamer|thuis|assistent|vandaag|apparaten|functies|opbrengst)[./#]/.test(zichtbaar)) return vondsten;
  // Woorden met code erin (data-gevoel-tik, class=", ${…}) tellen niet mee.
  const woorden = zichtbaar.split(/\s+/).filter((w) => !/[=<>"{}()/\_$-]/.test(w.replace(/[.,!?:;]+$/, '')));
  if (NEDERLANDS.test(woorden.join(' '))) vondsten.push(zichtbaar);
  return vondsten;
}

/** De teksten in een script: elke string en elk stuk van een template, zonder commentaar. */
function stringsIn(code: string): string[] {
  const bron = ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const uit: string[] = [];
  const loop = (n: ts.Node) => {
    // Een melding voor de ontwikkelaar in de console is geen tekst voor de bewoner.
    if (ts.isCallExpression(n) && /^console\./.test(n.expression.getText(bron))) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) uit.push(n.text);
    else if (ts.isTemplateExpression(n)) uit.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
    ts.forEachChild(n, loop);
  };
  loop(bron);
  return uit;
}

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
    const ontbreekt: string[] = [];
    for (const pad of VRAGEN) {
      const code = zonderCommentaar(pad, lees(pad));
      // t('…'), vet('…') en taal.html('…'), en in de HTML data-t="…" en data-t-…="…".
      for (const m of code.matchAll(/(?:\bt|\bvet|\.html|global\.t\??\.?)\(\s*'([a-zA-Z_]+\.[a-zA-Z_.]+)'/g)) if (!(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
      for (const m of code.matchAll(/'([a-z]+\.[a-zA-Z_]+(?:\.[a-zA-Z_]+)*)'/g)) {
        // Een sleutel in een ternary, zoals t(x ? 'a.b' : 'a.c'): ook die moet er zijn.
        if (/^(thuis|gevoel|nav|algemeen|huis|jij)\./.test(m[1]!) && !/\.(html|js)$/.test(m[1]!) && !(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
      }
      // Een sleutel met een stuk erin, zoals t(`thuis.stand.${id}`): er moet er minstens één met dat begin zijn.
      for (const m of code.matchAll(/t\(`([a-zA-Z_.]+)\$\{/g)) if (!Object.keys(nl).some((k) => k.startsWith(m[1]!))) ontbreekt.push(`${pad}: ${m[1]}…`);
      for (const m of code.matchAll(/data-t(?:-[a-z-]+)?="([^"]+)"/g)) if (!(m[1]! in nl)) ontbreekt.push(`${pad}: ${m[1]}`);
    }
    expect(ontbreekt).toEqual([]);
  });

  it('heeft geen losse Nederlandse tekst meer in wat al omgezet is', () => {
    const los: string[] = [];
    for (const pad of OMGEZET) {
      const code = lees(pad);
      if (pad.endsWith('.html')) {
        // Alleen wat de bewoner ziet: de body, zonder scripts, opmaak en commentaar.
        const lijf = code.slice(code.indexOf('<body')).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
        for (const m of lijf.matchAll(/>([^<]+)</g)) for (const v of nederlands(`>${m[1]}<`)) los.push(`${pad}: ${v}`);
        for (const v of nederlands(lijf.replace(/>[^<]*</g, '><'))) los.push(`${pad}: ${v}`);
      } else {
        for (const s of stringsIn(code)) for (const v of nederlands(s)) los.push(`${pad}: ${v}`);
      }
    }
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
