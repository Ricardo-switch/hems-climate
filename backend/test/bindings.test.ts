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

import {
  buildSystemState,
  configFrom,
  observedEntities,
  relevantEntities,
} from '../src/adapters/homeassistant/mapping.js';
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
    // Dezelfde afspraak als de echte bron: on, home en above_horizon zijn waar.
    bool: (id) =>
      states[id] == null
        ? null
        : ['on', 'home', 'above_horizon'].includes(states[id]!),
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

describe('de modusbron', () => {
  const metModus = (config: SiteConfig, over: Partial<SiteConfig['mode']>): SiteConfig => ({
    ...config,
    mode: { ...config.mode, ...over },
  });

  it('leest de keuzelijst die de configuratie noemt', () => {
    const config = metModus(exampleSite, { select: ref('input_select.andere_lijst') });
    const state = buildSystemState(
      config,
      bronVan({ [exampleSite.mode.select.id]: 'nacht', 'input_select.andere_lijst': 'vakantie' }),
      NU,
    );
    expect(state.modeOverride).toBe('vakantie');
  });

  it('vertaalt standen volgens de tabel uit de configuratie', () => {
    // Het oude systeem kende een aparte koelmodus; bij ons is koelen een
    // richting en geen modus, dus die valt samen met de dagmodus.
    const state = buildSystemState(
      exampleSite,
      bronVan({ [exampleSite.mode.select.id]: 'koelen' }),
      NU,
    );
    expect(state.modeOverride).toBe('dag');
  });

  it('laat de regeling zelf kiezen bij de automatische stand', () => {
    const state = buildSystemState(
      exampleSite,
      bronVan({ [exampleSite.mode.select.id]: exampleSite.mode.automatic }),
      NU,
    );
    expect(state.modeOverride).toBeNull();
  });

  it('kent een onbekende stand geen modus toe in plaats van te knallen', () => {
    const state = buildSystemState(
      exampleSite,
      bronVan({ [exampleSite.mode.select.id]: 'iets-nieuws' }),
      NU,
    );
    expect(state.modeOverride).toBeNull();
  });

  it('laat elke handen-af knop van de configuratie winnen', () => {
    // Dit is de fout uit besluit 8b: de code kende maar één knop. Nu staan ze
    // in de configuratie en kunnen het er meer zijn.
    const knop = exampleSite.mode.handsOffWhen[0]!;
    const state = buildSystemState(
      exampleSite,
      bronVan({
        [exampleSite.mode.select.id]: 'vakantie',
        [knop.ref.id]: knop.state,
      }),
      NU,
    );
    expect(state.modeOverride).toBe('handmatig');
  });

  it('werkt met een tweede handen-af knop erbij', () => {
    const config = metModus(exampleSite, {
      handsOffWhen: [
        ...exampleSite.mode.handsOffWhen,
        { ref: ref('input_boolean.gasten'), state: 'on' },
      ],
    });
    const state = buildSystemState(
      config,
      bronVan({ [exampleSite.mode.select.id]: 'dag', 'input_boolean.gasten': 'on' }),
      NU,
    );
    expect(state.modeOverride).toBe('handmatig');
  });
});

describe('timers en zon', () => {
  it('leest de timers die de configuratie noemt', () => {
    const config: SiteConfig = {
      ...exampleSite,
      timers: { stabilisation: ref('timer.anders'), manualOverride: ref('timer.nog_anders') },
    };
    const eind = '2026-09-10T12:05:00+00:00';
    const state = buildSystemState(
      config,
      {
        ...bronVan({ 'timer.anders': 'active' }),
        attr: (id, k) => (id === 'timer.anders' && k === 'finishes_at' ? eind : null),
      },
      NU,
    );
    expect(state.timers.stabilisation.endsAtMs).toBe(Date.parse(eind));
  });

  it('leest de zon uit de configuratie', () => {
    const config: SiteConfig = { ...exampleSite, sun: ref('sun.andere_zon') };
    const state = buildSystemState(config, bronVan({ 'sun.andere_zon': 'above_horizon' }), NU);
    expect(state.sunAboveHorizon).toEqual({ ok: true, value: true, atMs: NU });
  });
});

describe('de buitentemperatuur', () => {
  it('gaat mee in de toestand wanneer de configuratie hem noemt', () => {
    const state = buildSystemState(
      exampleSite,
      bronVan({ [exampleSite.outdoorTemperature!.id]: '11.4' }),
      NU,
    );
    expect(state.outdoorTemperatureC).toEqual({ ok: true, value: 11.4, atMs: NU });
  });

  it('blijft onbekend zonder sensor, in plaats van iets te verzinnen', () => {
    const config: SiteConfig = { ...exampleSite };
    delete (config as { outdoorTemperature?: unknown }).outdoorTemperature;
    const state = buildSystemState(config, bronVan({}), NU);
    expect(state.outdoorTemperatureC.ok).toBe(false);
  });

  it('staat in de filter, zodat een wijziging wordt opgemerkt', () => {
    expect(relevantEntities(exampleSite).has(exampleSite.outdoorTemperature!.id)).toBe(true);
  });
});

describe('de legacy-setpoints', () => {
  it('leest de helpers die het migratieblok noemt', () => {
    const woonkamer = exampleSite.zones.find((z) => z.id === 'woonkamer')!;
    const helper = exampleSite.migration!.setpoints!['woonkamer']!.dag!.heat!;

    const aangepast = configFrom(exampleSite, bronVan({ [helper.id]: '20.5' }));
    const zone = aangepast.zones.find((z) => z.id === 'woonkamer')!;

    expect(zone.setpoints.dag?.heat).toBe(20.5);
    // En de configuratie zelf blijft ongemoeid.
    expect(woonkamer.setpoints.dag?.heat).not.toBe(20.5);
  });

  it('valt terug op de configuratie en niet op een getal in de code', () => {
    // Hier stonden negen hardgecodeerde terugvalwaarden die de setpoints uit de
    // configuratie herhaalden. Valt een helper weg, dan is "wat de configuratie
    // zegt" het juiste antwoord.
    const woonkamer = exampleSite.zones.find((z) => z.id === 'woonkamer')!;
    const aangepast = configFrom(exampleSite, bronVan({}));
    const zone = aangepast.zones.find((z) => z.id === 'woonkamer')!;

    expect(zone.setpoints.dag?.heat).toBe(woonkamer.setpoints.dag?.heat);
  });

  it('laat de configuratie met rust zonder migratieblok', () => {
    const config: SiteConfig = { ...exampleSite };
    delete (config as { migration?: unknown }).migration;
    expect(configFrom(config, bronVan({}))).toBe(config);
  });
});

describe('niets wordt voor niets gevolgd', () => {
  it('leest elke entiteit uit die de filter volgt', () => {
    /*
     * De eventfilter bepaalt waarop de regeling opnieuw rekent. Staat er iets
     * in dat niemand uitleest, dan kost dat evaluaties en levert het niets —
     * en, erger, dan is er een meetpunt dat je dacht te hebben en dat nergens
     * wordt vastgelegd.
     *
     * Dat was precies het geval met `sensor.beneden_luchtvochtigheid`: hij
     * stond in de configuratie, hij zat in de filter, en `buildSystemState`
     * las hem nooit. Zonder deze test zou dat pas een winter later opvallen.
     */
    const aangeraakt = new Set<string>();
    const spion: EntitySource = {
      state: (id) => (aangeraakt.add(id), null),
      number: (id) => (aangeraakt.add(id), null),
      bool: (id) => (aangeraakt.add(id), null),
      attr: (id) => (aangeraakt.add(id), null),
      attrNumber: (id) => (aangeraakt.add(id), null),
      changedAt: (id) => (aangeraakt.add(id), null),
      hvacAction: (id) => (aangeraakt.add(id), null),
      hvacActionSince: (id) => (aangeraakt.add(id), null),
    };

    buildSystemState(configFrom(exampleSite, spion), spion, NU);

    // Wat alleen voor het logboek wordt bijgehouden telt niet mee: dat is met
    // opzet niet iets waar de vertaling naar kijkt.
    const alleenLog = observedEntities(exampleSite);
    const ongebruikt = [...relevantEntities(exampleSite)]
      .filter((id) => !aangeraakt.has(id) && !alleenLog.has(id))
      .sort();

    expect(ongebruikt).toEqual([]);
  });

  it('legt de luchtvochtigheid vast waar de zone er een sensor voor heeft', () => {
    const zone = exampleSite.zones.find((z) => z.humidity != null)!;
    const state = buildSystemState(
      exampleSite,
      bronVan({ [zone.humidity!.id]: '54' }),
      NU,
    );
    expect(state.zones[zone.id]?.humidityPct).toEqual({ ok: true, value: 54, atMs: NU });
  });

  it('laat een zone zonder vochtsensor met rust', () => {
    const zonder = exampleSite.zones.find((z) => z.humidity == null)!;
    const state = buildSystemState(exampleSite, bronVan({}), NU);
    expect(state.zones[zonder.id]?.humidityPct).toBeUndefined();
  });
});
