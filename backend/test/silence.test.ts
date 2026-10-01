/**
 * Besluit 54: een instelling die er staat en niets doet, valt op.
 *
 * Dit project begon omdat de YAML-regeling niet meldde wat hij níet deed. Toch
 * stond `power.startSurplusW` weken in de configuratie — ingelezen,
 * gecontroleerd, beschreven — zonder dat iets hem las (besluit 51). En
 * `thermalMass` staat er nog: woonkamer "high", zolder "low", en geen regel code
 * die ernaar kijkt. Zulke stiltes werden gevonden door iemand die ging kijken.
 * Deze test kijkt altijd.
 *
 * Elk veld van de configuratie hoort ergens buiten de parser gelezen te worden,
 * of op de lijst hieronder te staan met de reden waarom nog niet. Die lijst
 * wordt zelf ook bewaakt: een veld dat er staat maar inmiddels wél gelezen
 * wordt, laat de test ook falen. Anders veroudert de lijst net zo stil als de
 * velden die hij moest vangen.
 *
 * **Doorgeven is geen lezen.** `startSurplusW` werd wel genoemd buiten de
 * parser: `configFrom` kopieerde hem uit een helper van het oude systeem, en
 * `relevantEntities` abonneerde op die helper. Geen van beide doet iets mét de
 * waarde. Die functies tellen daarom niet mee; zonder die uitzondering had deze
 * test besluit 51 alleen via het broertje `resumeSurplusW` gevonden.
 *
 * Het zoeken gaat verder op tekst, zoals de entity-ID-test in `adapter.test.ts`.
 * Dat is grof: een veld dat dezelfde naam heeft als iets anders (`priority`
 * bestaat ook op een voorstel) telt als gelezen. De test vangt dus velden die
 * nergens gebruikt worden, en dat is precies de soort die weken onopgemerkt
 * bleef.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TIMER_IDS } from '../src/core/state.js';

const srcPath = fileURLToPath(new URL('../src/', import.meta.url));

/** Velden die bewust nog door niets gelezen worden, met de reden. */
const NOT_YET_READ: Readonly<Record<string, string>> = {
  thermalMass:
    'Gereserveerd voor het thermisch model (fase 7, besluit 46). Wordt ingelezen ' +
    'en gecontroleerd, maar stuurt nog niets.',
  adapter:
    'De naad voor andere platformen dan Home Assistant (zie de kop van model.ts). ' +
    'Er is er nog maar één, dus niets hoeft erop te kiezen.',
  recordOnly:
    'Bewust: wordt alleen gevolgd en in de ruwe historie vastgelegd (besluit 65). ' +
    'Niets in de regeling leest het, en dat is de bedoeling.',
  manualOverride:
    'De HA-timer van het oude systeem. Wordt opgehaald en in de toestand gezet, ' +
    'maar niets leest die timer; zie TIMERS_NOT_YET_READ hieronder.',
};

/** Timers die bijgehouden worden maar die de kern (nog) niet leest. */
const TIMERS_NOT_YET_READ: Readonly<Record<string, string>> = {
  manualOverride:
    'Komt uit het oude systeem en wordt gevuld, maar de handmatige stand loopt ' +
    'via de modus `handmatig` (besluit 8). Geen strategie leest deze timer.',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** Functies die configuratie alleen doorgeven: kopiëren of op abonneren. */
const PASS_THROUGH_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  'adapters/homeassistant/mapping.ts': ['configFrom', 'relevantEntities', 'observedEntities'],
};

/** Haalt de body van een functie weg, op accolades geteld. */
function withoutFunction(text: string, name: string): string {
  const begin = text.search(new RegExp(`function ${name}\\s*\\(`));
  if (begin < 0) throw new Error(`functie ${name} niet gevonden; klopt PASS_THROUGH_FUNCTIONS nog?`);
  // De eerste accolade na de parameterlijst opent de body.
  const closingBrace = text.indexOf(')', begin);
  const open = text.indexOf('{', closingBrace);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(0, begin) + text.slice(i + 1);
    }
  }
  throw new Error(`einde van ${name} niet gevonden`);
}

/** Alle bronbestanden behalve de parser en het model zelf. */
function readers(): Map<string, string> {
  const result = new Map<string, string>();
  for (const path of sourceFiles(srcPath)) {
    const rel = relative(srcPath, path).split(sep).join('/');
    if (rel.startsWith('config/') || rel === 'core/model.ts') continue;
    let text = readFileSync(path, 'utf-8');
    for (const name of PASS_THROUGH_FUNCTIONS[rel] ?? []) text = withoutFunction(text, name);
    result.set(rel, text);
  }
  return result;
}

function fields(): string[] {
  const model = readFileSync(join(srcPath, 'core', 'model.ts'), 'utf-8');
  return [...new Set([...model.matchAll(/^\s+readonly\s+([A-Za-z]+)\??:/gm)].map((m) => m[1]!))]
    .sort();
}

function isRead(field: string, sources: Map<string, string>): boolean {
  const access = new RegExp(`[.?]${field}\\b`);
  const unpack = new RegExp(`\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=`);
  for (const text of sources.values()) {
    if (access.test(text) || unpack.test(text)) return true;
  }
  return false;
}

describe('geen instelling zonder werking', () => {
  const sources = readers();
  const all = fields();

  it('vindt de velden van het model', () => {
    // Als de uitlezing stuk gaat, slaagt de test hieronder vanzelf. Deze niet.
    expect(all.length).toBeGreaterThan(40);
    expect(all).toContain('startSurplusW');
    expect(all).toContain('comfortMaxC');
  });

  it('leest elk configuratieveld ergens buiten de parser', () => {
    const silent = all.filter(
      (v) => !(v in NOT_YET_READ) && !isRead(v, sources),
    );
    // Faalt dit, dan staat er een instelling die niets doet. Laat hem iets doen,
    // haal hem weg, of zet hem met een reden op NOT_YET_READ.
    expect(silent).toEqual([]);
  });

  it('houdt de lijst met uitzonderingen actueel', () => {
    const stale = Object.keys(NOT_YET_READ).filter(
      (v) => !all.includes(v) || isRead(v, sources),
    );
    // Wordt een veld inmiddels gelezen, of bestaat het niet meer: van de lijst af.
    expect(stale).toEqual([]);
  });

  it('leest elke timer in de kern', () => {
    const core = new Map([...sources].filter(([rel]) => rel.startsWith('core/')));
    const unread = TIMER_IDS.filter(
      (id) => ![...core.values()].some((t) => new RegExp(`timers\\.${id}\\b`).test(t)),
    );
    expect(unread.sort()).toEqual(Object.keys(TIMERS_NOT_YET_READ).sort());
  });
});
