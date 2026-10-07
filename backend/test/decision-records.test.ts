/**
 * Het besluitenlog heeft een index, en die blijft kloppen.
 *
 * `Architecture.md` liep weken achter zonder dat iemand het merkte. Een index
 * die met de hand bijgehouden wordt, doet dat ook. Deze test eist dat elk besluit
 * een onderwerp en een status heeft, dat een status naar een bestaand besluit
 * verwijst, en dat de index bovenaan precies is wat `npm run decisions:index`
 * ervan zou maken.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  anchor,
  validate,
  validateStand,
  parseDecisionRecords,
  standReferences,
  withIndex,
  withLinks,
} from '../tools/decision-records.js';

const PATH = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));
const text = readFileSync(PATH, 'utf-8');
const STAND = fileURLToPath(new URL('../../STAND.md', import.meta.url));
const stand = readFileSync(STAND, 'utf-8');

describe('het besluitenlog', () => {
  it('geeft elk besluit een onderwerp en een geldige status', () => {
    const records = parseDecisionRecords(text);
    expect(records.length).toBeGreaterThanOrEqual(63);
    // Faalt dit na een nieuw besluit: zet onder de kop een regel
    // "*Onderwerp: … · Status: …*" zoals bij de andere.
    expect(validate(records)).toEqual([]);
  });

  it('heeft een index die klopt', () => {
    // Faalt dit: npm run decisions:index, en de wijziging mee committen.
    expect(withIndex(text)).toBe(text);
  });

  it('verwijst naar een kop die bestaat voor de open punten', () => {
    expect(text).toContain('\n## Wat nog een besluit wacht');
  });
});

describe('ankers zoals GitHub ze maakt', () => {
  it('laat leestekens weg en houdt letters met accent', () => {
    expect(anchor('34. Hybride SaaS — verborgen HA met een dunne agent')).toBe(
      '34-hybride-saas--verborgen-ha-met-een-dunne-agent',
    );
    expect(anchor('8. `handmatig` is een modus waarin de regeling zich terugtrekt')).toBe(
      '8-handmatig-is-een-modus-waarin-de-regeling-zich-terugtrekt',
    );
    expect(anchor('46. Het huis leert wat het ís, niet wat het moet doen')).toBe(
      '46-het-huis-leert-wat-het-ís-niet-wat-het-moet-doen',
    );
  });

  it('vangt een status die naar niets verwijst', () => {
    const broken = parseDecisionRecords(
      '## 1. Een\n\n*Onderwerp: weergave · Status: vervangen door 99*\n\n' +
        '## 2. Twee\n\n*Onderwerp: iets anders · Status: geldig*\n\n' +
        '## 3. Drie\n\nGeen regel.\n',
    );
    const errors = validate(broken);
    expect(errors).toHaveLength(3);
    expect(errors.join('\n')).toContain('besluit 99, en dat bestaat niet');
    expect(errors.join('\n')).toContain('onbekend onderwerp "iets anders"');
    expect(errors.join('\n')).toContain('besluit 3');
  });
});

/*
 * De stand (STAND.md) is de doorsnede naast de geschiedenis. Hij veroudert net
 * zo stil als een index met de hand, dus ook hier een test.
 */
describe('de stand per onderwerp', () => {
  it('noemt elk besluit dat nog geldt, en verwijst alleen naar wat bestaat', () => {
    // Faalt dit na een nieuw besluit: zet het in STAND.md bij zijn onderwerp,
    // met [nummer], en draai npm run decisions:index.
    expect(validateStand(stand, parseDecisionRecords(text))).toEqual([]);
  });

  it('heeft links die kloppen', () => {
    // Faalt dit: npm run decisions:index, en de wijziging mee committen.
    expect(withLinks(stand, parseDecisionRecords(text))).toBe(stand);
  });

  it('vangt een ontbrekend besluit, een onbekende verwijzing en twee aan elkaar', () => {
    const records = parseDecisionRecords(
      [
        '## 1. Een',
        '',
        '*Onderwerp: weergave · Status: geldig*',
        '',
        '## 2. Twee',
        '',
        '*Onderwerp: weergave · Status: vervangen door 3*',
        '',
        '## 3. Drie',
        '',
        '*Onderwerp: weergave · Status: aangevuld door 1*',
      ].join('\n'),
    );
    const errors = validateStand('Zo staat het: [3][7].', records).join(' | ');
    expect(errors).toContain('besluit 7, en dat bestaat niet');
    expect(errors).toContain('direct naast elkaar');
    // Geldig ontbreekt; vervangen hoeft er niet in, aangevuld wel (en staat erin).
    expect(errors).toContain('besluit 1 (geldig) staat niet in de stand');
    expect(errors).not.toContain('besluit 2');
    expect(errors).not.toContain('besluit 3 (');
  });

  it('leest geen linkdefinitie of inline link als verwijzing', () => {
    const sample = ['Zie [12] en [8b], [13](x.md).', '<!-- links:begin -->', '[14]: x', '<!-- links:einde -->'].join('\n');
    expect(standReferences(sample)).toEqual(['8b', '12']);
  });
});
