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

const srcPad = fileURLToPath(new URL('../src/', import.meta.url));

/** Velden die bewust nog door niets gelezen worden, met de reden. */
const NOG_NIET_GELEZEN: Readonly<Record<string, string>> = {
  thermalMass:
    'Gereserveerd voor het thermisch model (fase 7, besluit 46). Wordt ingelezen ' +
    'en gecontroleerd, maar stuurt nog niets.',
  adapter:
    'De naad voor andere platformen dan Home Assistant (zie de kop van model.ts). ' +
    'Er is er nog maar één, dus niets hoeft erop te kiezen.',
  manualOverride:
    'De HA-timer van het oude systeem. Wordt opgehaald en in de toestand gezet, ' +
    'maar niets leest die timer; zie TIMERS_NOG_NIET_GELEZEN hieronder.',
};

/** Timers die bijgehouden worden maar die de kern (nog) niet leest. */
const TIMERS_NOG_NIET_GELEZEN: Readonly<Record<string, string>> = {
  manualOverride:
    'Komt uit het oude systeem en wordt gevuld, maar de handmatige stand loopt ' +
    'via de modus `handmatig` (besluit 8). Geen strategie leest deze timer.',
};

function bronbestanden(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) return bronbestanden(pad);
    return naam.endsWith('.ts') ? [pad] : [];
  });
}

/** Functies die configuratie alleen doorgeven: kopiëren of op abonneren. */
const DOORGEEFFUNCTIES: Readonly<Record<string, readonly string[]>> = {
  'adapters/homeassistant/mapping.ts': ['configFrom', 'relevantEntities', 'observedEntities'],
};

/** Haalt de body van een functie weg, op accolades geteld. */
function zonderFunctie(tekst: string, naam: string): string {
  const begin = tekst.search(new RegExp(`function ${naam}\\s*\\(`));
  if (begin < 0) throw new Error(`functie ${naam} niet gevonden; klopt DOORGEEFFUNCTIES nog?`);
  // De eerste accolade na de parameterlijst opent de body.
  const sluitHaakje = tekst.indexOf(')', begin);
  const open = tekst.indexOf('{', sluitHaakje);
  let diepte = 0;
  for (let i = open; i < tekst.length; i += 1) {
    if (tekst[i] === '{') diepte += 1;
    else if (tekst[i] === '}') {
      diepte -= 1;
      if (diepte === 0) return tekst.slice(0, begin) + tekst.slice(i + 1);
    }
  }
  throw new Error(`einde van ${naam} niet gevonden`);
}

/** Alle bronbestanden behalve de parser en het model zelf. */
function lezers(): Map<string, string> {
  const uit = new Map<string, string>();
  for (const pad of bronbestanden(srcPad)) {
    const rel = relative(srcPad, pad).split(sep).join('/');
    if (rel.startsWith('config/') || rel === 'core/model.ts') continue;
    let tekst = readFileSync(pad, 'utf-8');
    for (const naam of DOORGEEFFUNCTIES[rel] ?? []) tekst = zonderFunctie(tekst, naam);
    uit.set(rel, tekst);
  }
  return uit;
}

function velden(): string[] {
  const model = readFileSync(join(srcPad, 'core', 'model.ts'), 'utf-8');
  return [...new Set([...model.matchAll(/^\s+readonly\s+([A-Za-z]+)\??:/gm)].map((m) => m[1]!))]
    .sort();
}

function wordtGelezen(veld: string, bronnen: Map<string, string>): boolean {
  const toegang = new RegExp(`[.?]${veld}\\b`);
  const uitpakken = new RegExp(`\\{[^}]*\\b${veld}\\b[^}]*\\}\\s*=`);
  for (const tekst of bronnen.values()) {
    if (toegang.test(tekst) || uitpakken.test(tekst)) return true;
  }
  return false;
}

describe('geen instelling zonder werking', () => {
  const bronnen = lezers();
  const alle = velden();

  it('vindt de velden van het model', () => {
    // Als de uitlezing stuk gaat, slaagt de test hieronder vanzelf. Deze niet.
    expect(alle.length).toBeGreaterThan(40);
    expect(alle).toContain('startSurplusW');
    expect(alle).toContain('comfortMaxC');
  });

  it('leest elk configuratieveld ergens buiten de parser', () => {
    const stil = alle.filter(
      (v) => !(v in NOG_NIET_GELEZEN) && !wordtGelezen(v, bronnen),
    );
    // Faalt dit, dan staat er een instelling die niets doet. Laat hem iets doen,
    // haal hem weg, of zet hem met een reden op NOG_NIET_GELEZEN.
    expect(stil).toEqual([]);
  });

  it('houdt de lijst met uitzonderingen actueel', () => {
    const achterhaald = Object.keys(NOG_NIET_GELEZEN).filter(
      (v) => !alle.includes(v) || wordtGelezen(v, bronnen),
    );
    // Wordt een veld inmiddels gelezen, of bestaat het niet meer: van de lijst af.
    expect(achterhaald).toEqual([]);
  });

  it('leest elke timer in de kern', () => {
    const kern = new Map([...bronnen].filter(([rel]) => rel.startsWith('core/')));
    const ongelezen = TIMER_IDS.filter(
      (id) => ![...kern.values()].some((t) => new RegExp(`timers\\.${id}\\b`).test(t)),
    );
    expect(ongelezen.sort()).toEqual(Object.keys(TIMERS_NOG_NIET_GELEZEN).sort());
  });
});
