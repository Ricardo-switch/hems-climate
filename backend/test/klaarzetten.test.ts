/**
 * Klaarzetten in Home Assistant (besluit 179): wat er staat, wat er mist, en
 * nooit een entity-ID in een zin.
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { klaarzetten, type KlaarInput } from '../src/web/klaarzetten.js';
import { registers, states } from './house-fixture.js';

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaEntityState => ({ entity_id, state, attributes, last_changed: '', last_updated: '' });

const basis: KlaarInput = {
  locatie: true,
  registers,
  states,
  netMeter: true,
  zon: { heeft: true, intervalS: 30 },
  energieDashboard: true,
  apparatenOpZon: 1,
  cameras: 1,
  deurbel: true,
  rookmelders: 0,
  spraak: [{ id: 'p1', naam: 'Thuis', wekwoord: 'he_huis', spraakNaarTekst: true, taal: 'nl', voorkeur: true }],
  addOn: true,
  eigenPoort: false,
};
const van = (punten: ReturnType<typeof klaarzetten>, id: string) => punten.find((p) => p.id === id)!;

describe('klaarzetten in Home Assistant (besluit 179)', () => {
  it('zegt per functie of het klaarstaat, en waar je het regelt', () => {
    const p = klaarzetten(basis);
    expect(van(p, 'locatie')).toMatchObject({ stand: 'klaar', pad: '/config/general' });
    expect(van(p, 'klimaat').stand).toBe('klaar');
    expect(van(p, 'wekwoord').zin).toContain('Hé huis');
    // Zonder eigen poort is de telefoon-app een mogelijkheid, geen tekort.
    expect(van(p, 'tailscale')).toMatchObject({ stand: 'optioneel', pad: '/hassio/dashboard' });
    // Zonder rookmelders: grijs, niet oranje.
    expect(van(p, 'rookmelders').stand).toBe('optioneel');
  });

  it('noemt wat de regeling nodig heeft oranje als het ontbreekt', () => {
    const p = klaarzetten({ ...basis, locatie: false, netMeter: false, registers: { ...registers, floors: [], areas: [] } });
    expect(van(p, 'locatie').stand).toBe('mist');
    expect(van(p, 'netmeter').stand).toBe('mist');
    expect(van(p, 'ruimtes')).toMatchObject({ stand: 'mist', zin: expect.stringContaining('Maak etages en ruimtes') });
  });

  it('telt personen met en zonder account en telefoon', () => {
    const met = new Map(states);
    met.set('person.a', st('person.a', 'home', { user_id: 'u1', device_trackers: ['device_tracker.telefoon_a'] }));
    met.set('person.b', st('person.b', 'not_home', {}));
    const p = klaarzetten({ ...basis, states: met });
    expect(van(p, 'personen')).toMatchObject({ stand: 'mist', zin: '1 persoon heeft nog geen account; koppel er een.' });
    expect(van(p, 'telefoon')).toMatchObject({ stand: 'klaar', zin: expect.stringContaining('1 van 2') });
  });

  it('zegt in de add-on hoe het wekwoord erbij komt, en meldt een trage omvormer', () => {
    const p = klaarzetten({ ...basis, spraak: [], zon: { heeft: true, intervalS: 300 } });
    expect(van(p, 'wekwoord').zin).toContain('openWakeWord-add-on');
    expect(van(p, 'omvormer').zin).toContain('eens per 5 minuten');
  });

  it('noemt nooit een entiteit', () => {
    for (const punt of klaarzetten(basis)) expect(punt.zin).not.toMatch(/\b(?:sensor|light|climate|person|binary_sensor)\.[a-z]/);
  });
});
