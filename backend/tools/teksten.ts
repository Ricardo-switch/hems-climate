/*
 * Losse Nederlandse tekst in de weergave vinden (besluit 185, stap 9).
 *
 * De taaltest (test/taal.test.ts) gebruikt dit om te bewaken dat een omgezet
 * bestand zijn teksten uit kit/teksten.*.js haalt. Los gedraaid toont het per
 * bestand wat er nog om te zetten is:
 *
 *   npm run teksten -- ../frontend/src/kamer.js        (aantallen)
 *   npm run teksten -- --toon ../frontend/src/kamer.js (met de regels)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Woorden die in een Engelse of neutrale tekst niet voorkomen, maar in bijna elke Nederlandse zin. */
export const NEDERLANDS = /\b(de|het|een|en|van|je|jij|jouw|is|niet|nog|geen|wat|naar|met|voor|bij|uit|dan|er|om|te|nu|zon|huis|kamers?|tik|klaar|sluiten|bekijk|vandaag|morgen|weer|straks|favorieten|batterijen?|laadt|rust|thuis|weg|overdag|nachts|goed|koud|warm)\b/i;

/** Ziet een stukje tekst eruit als Nederlands voor de bewoner, en niet als code? */
export function nederlands(tekst: string): string[] {
  const vondsten: string[] = [];
  // Wat een schermlezer of de muis toont, staat in een tag; niet data-t-aria-label: dat is al een sleutel.
  for (const m of tekst.matchAll(/(?<![\w-])(?:aria-label|title|alt|placeholder|data-naam|data-leeg)="([^"$]*)"/g)) if (NEDERLANDS.test(m[1]!)) vondsten.push(m[1]!);
  const zichtbaar = tekst.replace(/^[^<]*>/, ' ').replace(/<[^>]*>?/g, ' ').trim();
  // Een pad, een selector, een sleutel of een klassenaam is geen tekst.
  if (!zichtbaar || (!/\s/.test(zichtbaar) && !/^[A-ZÀ-Ý]/.test(zichtbaar))) return vondsten;
  if (/^[[#.]|^[a-z0-9-]+(\.[a-zA-Z0-9_-]+)+$|^(api|kamer|thuis|assistent|vandaag|apparaten|functies|opbrengst)[./#]/.test(zichtbaar)) return vondsten;
  // Woorden met code erin (data-gevoel-tik, class=", ${…}) tellen niet mee.
  const woorden = zichtbaar.split(/\s+/).filter((w) => !/[=<>"{}()/\\_$-]/.test(w.replace(/[.,!?:;]+$/, '')));
  if (NEDERLANDS.test(woorden.join(' '))) vondsten.push(zichtbaar);
  return vondsten;
}

/** De teksten in een script, met hun regel: elke string en elk stuk van een template, zonder commentaar en zonder console. */
export function stringsIn(code: string): { tekst: string; regel: number }[] {
  const bron = ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const uit: { tekst: string; regel: number }[] = [];
  const loop = (n: ts.Node) => {
    // Een melding voor de ontwikkelaar, in de console of in een fout, is geen tekst voor de bewoner.
    if (ts.isCallExpression(n) && /^console\./.test(n.expression.getText(bron))) return;
    if (ts.isNewExpression(n) && /^(Error|TypeError)$/.test(n.expression.getText(bron))) return;
    // Een klassenaam is geen tekst: el.className = 'glas app niet', classList.add('...').
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && /\.className$/.test(n.left.getText(bron))) return;
    if (ts.isCallExpression(n) && /\.classList\.\w+$/.test(n.expression.getText(bron))) return;
    const regel = () => bron.getLineAndCharacterOfPosition(n.getStart(bron)).line + 1;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) uit.push({ tekst: n.text, regel: regel() });
    else if (ts.isTemplateExpression(n)) for (const t of [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]) uit.push({ tekst: t, regel: regel() });
    ts.forEachChild(n, loop);
  };
  loop(bron);
  return uit;
}

/** Losse Nederlandse tekst in een bestand: een script, of de body van een pagina. */
export function losInBestand(pad: string, code: string): { tekst: string; regel: number }[] {
  if (!pad.endsWith('.html')) return stringsIn(code).flatMap((s) => nederlands(s.tekst).map((tekst) => ({ tekst, regel: s.regel })));
  const begin = code.indexOf('<body');
  const regelVan = (i: number) => code.slice(0, i).split('\n').length;
  // Alleen wat de bewoner ziet: de body, zonder scripts, opmaak en commentaar (met spaties, zodat de regels kloppen).
  const lijf = code.slice(begin).replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const uit: { tekst: string; regel: number }[] = [];
  for (const m of lijf.matchAll(/>([^<]+)</g)) for (const tekst of nederlands(`>${m[1]}<`)) uit.push({ tekst, regel: regelVan(begin + m.index!) });
  for (const m of lijf.matchAll(/<[^>]+>/g)) for (const tekst of nederlands(m[0].replace(/>$/, ' >').replace(/^</, '< '))) if (!/^</.test(tekst)) uit.push({ tekst, regel: regelVan(begin + m.index!) });
  return uit;
}

/**
 * Ruimer, om om te zetten (`--alles`): elke string met een woord erin dat geen
 * code is, ook een los woord als "Rook". Niet voor de test: te veel ruis.
 */
export function alleTekst(pad: string, code: string): { tekst: string; regel: number }[] {
  if (pad.endsWith('.html')) return losInBestand(pad, code);
  return stringsIn(code).filter(({ tekst }) => {
    const zonderTags = tekst.replace(/<[^>]*>?/g, ' ').replace(/^[^<]*>/, ' ');
    const woorden = zonderTags.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ'’]{2,}[.,!?:;…]*$/.test(w));
    if (!woorden.length) return /(?<![\w-])(?:aria-label|title|alt|placeholder)="[^"$]*[A-Za-z]{3}/.test(tekst);
    // Eén los woord in kleine letters is meestal een sleutel, een klasse of een soort.
    return woorden.length > 1 || /^[A-ZÀ-Ý]/.test(woorden[0]!) || /(?<![\w-])(?:aria-label|title|alt|placeholder)="/.test(tekst);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const toon = process.argv.includes('--toon') || process.argv.includes('--alles');
  const alles = process.argv.includes('--alles');
  for (const pad of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    const code = readFileSync(pad, 'utf-8');
    const los = alles ? alleTekst(pad, code) : losInBestand(pad, code);
    console.log(`${los.length}\t${pad}`);
    if (toon) for (const l of los) console.log(`  ${l.regel}: ${l.tekst.slice(0, 120).replace(/\s+/g, ' ')}`);
  }
}
