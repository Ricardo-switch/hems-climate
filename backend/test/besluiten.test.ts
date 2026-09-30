/**
 * Het besluitenlog heeft een index, en die blijft kloppen.
 *
 * `Architecture.md` liep weken achter zonder dat iemand het merkte. Een index
 * die met de hand bijgehouden wordt, doet dat ook. Deze test eist dat elk besluit
 * een onderwerp en een status heeft, dat een status naar een bestaand besluit
 * verwijst, en dat de index bovenaan precies is wat `npm run besluiten:index`
 * ervan zou maken.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { anker, controleer, leesBesluiten, metIndex } from '../tools/besluiten.js';

const PAD = fileURLToPath(new URL('../../DECISIONS.md', import.meta.url));
const tekst = readFileSync(PAD, 'utf-8');

describe('het besluitenlog', () => {
  it('geeft elk besluit een onderwerp en een geldige status', () => {
    const besluiten = leesBesluiten(tekst);
    expect(besluiten.length).toBeGreaterThanOrEqual(63);
    // Faalt dit na een nieuw besluit: zet onder de kop een regel
    // "*Onderwerp: … · Status: …*" zoals bij de andere.
    expect(controleer(besluiten)).toEqual([]);
  });

  it('heeft een index die klopt', () => {
    // Faalt dit: npm run besluiten:index, en de wijziging mee committen.
    expect(metIndex(tekst)).toBe(tekst);
  });

  it('verwijst naar een kop die bestaat voor de open punten', () => {
    expect(tekst).toContain('\n## Wat nog een besluit wacht');
  });
});

describe('ankers zoals GitHub ze maakt', () => {
  it('laat leestekens weg en houdt letters met accent', () => {
    expect(anker('34. Hybride SaaS — verborgen HA met een dunne agent')).toBe(
      '34-hybride-saas--verborgen-ha-met-een-dunne-agent',
    );
    expect(anker('8. `handmatig` is een modus waarin de regeling zich terugtrekt')).toBe(
      '8-handmatig-is-een-modus-waarin-de-regeling-zich-terugtrekt',
    );
    expect(anker('46. Het huis leert wat het ís, niet wat het moet doen')).toBe(
      '46-het-huis-leert-wat-het-ís-niet-wat-het-moet-doen',
    );
  });

  it('vangt een status die naar niets verwijst', () => {
    const kapot = leesBesluiten(
      '## 1. Een\n\n*Onderwerp: weergave · Status: vervangen door 99*\n\n' +
        '## 2. Twee\n\n*Onderwerp: iets anders · Status: geldig*\n\n' +
        '## 3. Drie\n\nGeen regel.\n',
    );
    const fouten = controleer(kapot);
    expect(fouten).toHaveLength(3);
    expect(fouten.join('\n')).toContain('besluit 99, en dat bestaat niet');
    expect(fouten.join('\n')).toContain('onbekend onderwerp "iets anders"');
    expect(fouten.join('\n')).toContain('besluit 3');
  });
});
