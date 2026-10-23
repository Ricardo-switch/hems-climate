/**
 * Waar het weer vandaan komt (besluit 111), los uit main.ts (23 oktober 2026).
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { OPEN_METEO } from '../src/web/open-meteo.js';
import type { ForecastDay } from '../src/web/weather.js';
import { verwachtingVan, weerNaamVan } from '../src/web/weerbron.js';

const weer: HaEntityState = { entity_id: 'weather.knmi', state: 'sunny', attributes: { friendly_name: 'KNMI' }, last_changed: '', last_updated: '' };
const states = new Map([[weer.entity_id, weer]]);
const dag: ForecastDay = { offset: 1, maxC: 18, minC: 9, regenkansPct: 10, zonkansPct: 70, soort: 'zon', tekst: 'Zonnig' };
const basis = { openMeteo: [dag], entities: [], states, entiteit: { entity: null, days: [] }, nu: Date.UTC(2026, 9, 23, 10), zone: 'Europe/Amsterdam' };

describe('de weerbron (weerbron.ts)', () => {
  it('noemt de bron zoals de bewoner hem kent', () => {
    expect(weerNaamVan(OPEN_METEO, states)).toBe('Open-Meteo');
    expect(weerNaamVan('weather.knmi', states)).toBe('KNMI');
    expect(weerNaamVan('weather.weg', states)).toBe('je weerdienst');
    expect(weerNaamVan(null, states)).toBe('Buienradar');
  });

  it('geeft de verwachting van de gekozen bron, en niets zonder registers', () => {
    expect(verwachtingVan(OPEN_METEO, basis)).toEqual([dag]);
    expect(verwachtingVan('buienradar', { ...basis, entities: null })).toEqual([]);
    expect(verwachtingVan('buienradar', basis)).toEqual([]);
    expect(verwachtingVan(null, basis)).toEqual([]);
    // Een weerentiteit zonder abonnement op die entiteit: nog niets per dag.
    expect(Array.isArray(verwachtingVan('weather.knmi', basis))).toBe(true);
  });
});
