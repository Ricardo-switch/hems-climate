/**
 * De vertaling leest de configuratie, en niets anders.
 *
 * `mapping.ts` bevatte vijf handgeschreven tabellen — zonetemperaturen,
 * actuatorbindingen, vermogenssensoren, het netvermogen en de bewoners — die de
 * configuratie óók al bevatte. Ze stonden identiek in en niets bewaakte dat.
 * Wie de zoldersensor in `huis-cornelissen.json` wijzigde, kreeg een arbiter die
 * stilzwijgend de oude bleef uitlezen.
 *
 * Deze tests toetsen daarom niet dat de twee gelijk zijn, maar dat er nog maar
 * één is: elke test wijzigt de configuratie en eist dat de vertaling meebeweegt.
 * Zolang er ergens een tabel in code staat, faalt dat.
 */

import { describe, expect, it } from 'vitest';

import { buildSystemState, relevantEntities } from '../src/adapters/homeassistant/mapping.js';
import type { EntitySource } from '../src/adapters/homeassistant/source.js';
import type { DeviceRef, SiteConfig } from '../src/core/model.js';
import { exampleSite } from './site.js';

const NU = Date.parse('2026-09-10T12:00:00Z');

/** Een bron die alleen states en attributen kent, uit een tabel. */
function bronVan(
  states: Record<string, string>,
  attrs: Record<string, Record<string, number>> = {},
): EntitySource {
  return {
    state: (id) => states[id] ?? null,
    number: (id) => (states[id] == null ? null : Number(states[id])),
    bool: (id) => (states[id] == null ? null : states[id] === 'on' || states[id] === 'home'),
    attr: (id, k) => attrs[id]?.[k] ?? null,
    attrNumber: (id, k) => attrs[id]?.[k] ?? null,
    changedAt: () => null,
    hvacAction: () => null,
    hvacActionSince: () => null,
  };
}

const ref = (id: string): DeviceRef => ({ adapter: 'homeassistant', id });

/** Vervangt de temperatuurbron van één zone. */
function metZoneSensor(config: SiteConfig, zoneId: string, id: string): SiteConfig {
  return {
    ...config,
    zones: config.zones.map((z) => (z.id === zoneId ? { ...z, temperature: ref(id) } : z)),
  };
}

/** Vervangt de entiteit van één actuator. */
function metActuatorRef(config: SiteConfig, actuatorId: string, id: string): SiteConfig {
  return {
    ...config,
    actuators: config.actuators.map((a) => (a.id === actuatorId ? { ...a, ref: ref(id) } : a)),
  };
}

describe('zonetemperaturen', () => {
  it('leest de sensor die de configuratie noemt', () => {
    const zone = exampleSite.zones[0]!;
    const config = metZoneSensor(exampleSite, zone.id, 'sensor.andere_bron');

    const state = buildSystemState(
      config,
      // De oude sensor staat er nog en heeft een andere waarde. Wie die
      // uitleest, krijgt 99 en valt door de mand.
      bronVan({ [zone.temperature.id]: '99', 'sensor.andere_bron': '21.5' }),
      NU,
    );

    expect(state.zones[zone.id]?.temperatureC).toEqual({ ok: true, value: 21.5, atMs: NU });
  });

  it('kent elke zone uit de configuratie, ook een nieuwe', () => {
    const config: SiteConfig = {
      ...exampleSite,
      zones: [
        ...exampleSite.zones,
        {
          ...exampleSite.zones[0]!,
          id: 'washok',
          name: 'Washok',
          temperature: ref('sensor.washok_temperatuur'),
        },
      ],
    };

    const state = buildSystemState(config, bronVan({ 'sensor.washok_temperatuur': '18.0' }), NU);
    expect(state.zones['washok']?.temperatureC).toEqual({ ok: true, value: 18, atMs: NU });
  });
});

describe('actuatoren', () => {
  it('leest de climate-entiteit die de configuratie noemt', () => {
    const actuator = exampleSite.actuators.find((a) => a.capabilities.canCool)!;
    const config = metActuatorRef(exampleSite, actuator.id, 'climate.andere_airco');

    const state = buildSystemState(
      config,
      bronVan(
        { [actuator.ref.id]: 'off', 'climate.andere_airco': 'cool' },
        { 'climate.andere_airco': { temperature: 21 } },
      ),
      NU,
    );

    // De oude entiteit staat op `off`. Wie die leest, ziet `off`.
    expect(state.actuators[actuator.id]?.action).toEqual({ ok: true, value: 'cool', atMs: 0 });
  });

  it('leest de vermogenssensor uit de configuratie', () => {
    const actuator = exampleSite.actuators.find((a) => a.power.sensor != null)!;
    const config: SiteConfig = {
      ...exampleSite,
      actuators: exampleSite.actuators.map((a) =>
        a.id === actuator.id
          ? { ...a, power: { ...a.power, sensor: ref('sensor.ander_vermogen') } }
          : a,
      ),
    };

    const state = buildSystemState(
      config,
      bronVan({
        [actuator.power.sensor!.id]: '999',
        'sensor.ander_vermogen': '412',
        [actuator.ref.id]: 'cool',
      }),
      NU,
    );

    expect(state.actuators[actuator.id]?.powerW).toEqual({ ok: true, value: 412, atMs: NU });
  });

  it('kent elke actuator uit de configuratie, ook een nieuwe', () => {
    const config: SiteConfig = {
      ...exampleSite,
      actuators: [
        ...exampleSite.actuators,
        { ...exampleSite.actuators[0]!, id: 'kachel', name: 'Kachel', ref: ref('climate.kachel') },
      ],
    };

    const state = buildSystemState(config, bronVan({ 'climate.kachel': 'heat' }), NU);
    expect(state.actuators['kachel']).toBeDefined();
  });
});

describe('losse meetpunten', () => {
  it('leest het netvermogen uit de configuratie', () => {
    const config: SiteConfig = {
      ...exampleSite,
      power: { ...exampleSite.power, gridPower: ref('sensor.andere_meter') },
    };

    const state = buildSystemState(
      config,
      bronVan({ [exampleSite.power.gridPower.id]: '9999', 'sensor.andere_meter': '-1200' }),
      NU,
    );

    expect(state.power.gridPowerW).toEqual({ ok: true, value: -1200, atMs: NU });
  });

  it('leest de bewoners uit de configuratie', () => {
    const config: SiteConfig = {
      ...exampleSite,
      occupancy: [{ id: 'gast', ref: ref('person.gast') }],
    };

    const state = buildSystemState(config, bronVan({ 'person.gast': 'home' }), NU);

    expect(Object.keys(state.occupancy)).toEqual(['gast']);
    expect(state.occupancy['gast']).toEqual({ ok: true, value: true, atMs: NU });
  });
});

describe('de filter volgt de configuratie', () => {
  it('kent de entiteiten van een gewijzigde configuratie', () => {
    const config = metZoneSensor(exampleSite, exampleSite.zones[0]!.id, 'sensor.andere_bron');
    const ids = relevantEntities(config);

    expect(ids.has('sensor.andere_bron')).toBe(true);
    // En de oude niet meer: die staat nergens meer in de configuratie, dus een
    // wijziging erop hoort geen herberekening meer uit te lokken.
    expect(ids.has(exampleSite.zones[0]!.temperature.id)).toBe(false);
  });
});
