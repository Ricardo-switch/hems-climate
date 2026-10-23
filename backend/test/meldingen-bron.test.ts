/**
 * Wat de bel elke minuut weet (besluit 136), los uit main.ts (23 oktober 2026)
 * en daardoor nu te toetsen.
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { buildHouse } from '../src/web/house.js';
import { meldingenBron, type BronInvoer } from '../src/web/meldingen-bron.js';
import { VERSIE } from '../src/version.js';
import { registers, snapshot, states } from './house-fixture.js';
import { exampleSite } from './site.js';

const huis = buildHouse(exampleSite, registers, states, snapshot);
const NU = Date.UTC(2026, 9, 23, 10);
const invoer = (o: Partial<BronInvoer> = {}): BronInvoer => ({
  nu: NU,
  config: exampleSite,
  huis,
  states,
  addOn: false,
  panelenVoorstel: false,
  winterdagen: null,
  profiel: null,
  hoofd: null,
  ...o,
});

describe('wat de bel weet (meldingen-bron.ts)', () => {
  it('volgt elk apparaat in een kamer, met de versie en de meter erbij', () => {
    const bron = meldingenBron(invoer())!;
    expect(bron.nu).toBe(NU);
    expect(bron.volgen.length).toBeGreaterThan(0);
    expect(bron.volgen.every((v) => v.kamer !== '' && v.onbereikbaarSindsMs === null)).toBe(true);
    expect(bron.versie?.nummer).toBe(VERSIE);
    expect(bron.update).toBeNull();
    expect(bron.comfort).toBeNull();
  });

  it('zegt niets als bijna alles tegelijk weg is: dan is Home Assistant zelf weg', () => {
    const weg = new Map<string, HaEntityState>([...states].map(([id, s]) => [id, { ...s, state: 'unavailable', last_changed: '2026-10-23T09:00:00Z' }]));
    expect(meldingenBron(invoer({ states: weg }))).toBeNull();
  });

  it('noemt wiens comfort er geldt, en een update alleen in de add-on', () => {
    const bron = meldingenBron(invoer({ profiel: { id: 'p-noor', name: 'Noor', reason: 'thuis' }, hoofd: { id: 'p-ricardo', naam: 'Ricardo' } }))!;
    expect(bron.comfort).toEqual({ id: 'p-noor', naam: 'Noor', waarom: 'thuis', hoofdNaam: 'Ricardo', hoofd: false });
    const update: HaEntityState = { entity_id: 'update.smart_climate_update', state: 'on', attributes: { title: 'Smart Climate', latest_version: 'v9.9.9' }, last_changed: '', last_updated: '' };
    const met = new Map(states).set(update.entity_id, update);
    expect(meldingenBron(invoer({ states: met }))!.update).toBeNull();
    expect(meldingenBron(invoer({ states: met, addOn: true }))!.update).toEqual({ nieuw: '9.9.9', nu: VERSIE });
  });
});
