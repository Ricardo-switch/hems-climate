/**
 * De kamers voor Assist (besluit 184): wat de integratie in Home Assistant
 * nodig heeft voor de zinnen van dit huis, zonder entiteiten.
 */

import { describe, expect, it } from 'vitest';

import { buildHouse } from '../src/web/house.js';
import { alsWoord, assistKamers } from '../src/web/assist.js';
import { registers, states } from './house-fixture.js';
import { exampleSite } from './site.js';

describe('de kamers voor Assist (besluit 184)', () => {
  it('geeft per zone de naam en de kamers die erbij horen, als woorden', () => {
    const info = assistKamers(exampleSite, buildHouse(exampleSite, registers, states, null), '0.58.0');
    expect(info).toMatchObject({ naam: 'Smart Climate', versie: '0.58.0', talen: ['nl', 'en'] });
    expect(info.kamers.map((k) => k.id)).toEqual(exampleSite.zones.map((z) => z.id));
    for (const k of info.kamers) {
      // Woorden, geen entiteiten, en zonder de tekens die in een zin van Assist iets betekenen.
      for (const w of k.woorden) expect(w).toMatch(/^[^()[\]{}<>|.]+$/);
      expect(k.woorden).not.toContain(alsWoord(k.naam));
    }
    // Zonder huis alleen de zones.
    expect(assistKamers(exampleSite, null, null).kamers.length).toBe(exampleSite.zones.length);
  });

  it('maakt van een naam een woord voor een zin', () => {
    expect(alsWoord('Slaapkamer (Matts) | boven')).toBe('slaapkamer matts boven');
  });
});
