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
import { OwnState } from '../src/adapters/own-state.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { decide } from '../src/core/decide.js';
import { defaultStrategies } from '../src/index.js';
import type { DeviceRef, ModeSource, SiteConfig } from '../src/core/model.js';
import { exampleSite, withHaStabilisation } from './site.js';

const NOW = Date.parse('2026-09-10T12:00:00Z');

/** Een bron die alleen states en attributen kent, uit een tabel. */
function sourceOfFile(
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
function withZoneSensor(config: SiteConfig, zoneId: string, id: string): SiteConfig {
  return {
    ...config,
    zones: config.zones.map((z) => (z.id === zoneId ? { ...z, temperature: ref(id) } : z)),
  };
}

/** Vervangt de entiteit van één actuator. */
function withActuatorRef(config: SiteConfig, actuatorId: string, id: string): SiteConfig {
  return {
    ...config,
    actuators: config.actuators.map((a) => (a.id === actuatorId ? { ...a, ref: ref(id) } : a)),
  };
}

describe('zonetemperaturen', () => {
  it('leest de sensor die de configuratie noemt', () => {
    const zone = exampleSite.zones[0]!;
    const config = withZoneSensor(exampleSite, zone.id, 'sensor.andere_bron');

    const state = buildSystemState(
      config,
      // De oude sensor staat er nog en heeft een andere waarde. Wie die
      // uitleest, krijgt 99 en valt door de mand.
      sourceOfFile({ [zone.temperature.id]: '99', 'sensor.andere_bron': '21.5' }),
      NOW,
    );

    expect(state.zones[zone.id]?.temperatureC).toEqual({ ok: true, value: 21.5, atMs: NOW });
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

    const state = buildSystemState(config, sourceOfFile({ 'sensor.washok_temperatuur': '18.0' }), NOW);
    expect(state.zones['washok']?.temperatureC).toEqual({ ok: true, value: 18, atMs: NOW });
  });
});

describe('actuatoren', () => {
  it('leest de climate-entiteit die de configuratie noemt', () => {
    const actuator = exampleSite.actuators.find((a) => a.capabilities.canCool)!;
    const config = withActuatorRef(exampleSite, actuator.id, 'climate.andere_airco');

    const state = buildSystemState(
      config,
      sourceOfFile(
        { [actuator.ref.id]: 'off', 'climate.andere_airco': 'cool' },
        { 'climate.andere_airco': { temperature: 21 } },
      ),
      NOW,
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
      sourceOfFile({
        [actuator.power.sensor!.id]: '999',
        'sensor.ander_vermogen': '412',
        [actuator.ref.id]: 'cool',
      }),
      NOW,
    );

    expect(state.actuators[actuator.id]?.powerW).toEqual({ ok: true, value: 412, atMs: NOW });
  });

  it('kent elke actuator uit de configuratie, ook een nieuwe', () => {
    const config: SiteConfig = {
      ...exampleSite,
      actuators: [
        ...exampleSite.actuators,
        { ...exampleSite.actuators[0]!, id: 'kachel', name: 'Kachel', ref: ref('climate.kachel') },
      ],
    };

    const state = buildSystemState(config, sourceOfFile({ 'climate.kachel': 'heat' }), NOW);
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
      sourceOfFile({ [exampleSite.power.gridPower!.id]: '9999', 'sensor.andere_meter': '-1200' }),
      NOW,
    );

    expect(state.power.gridPowerW).toEqual({ ok: true, value: -1200, atMs: NOW });
  });

  it('leest de bewoners uit de configuratie', () => {
    const config: SiteConfig = {
      ...exampleSite,
      occupancy: [{ id: 'gast', ref: ref('person.gast') }],
    };

    const state = buildSystemState(config, sourceOfFile({ 'person.gast': 'home' }), NOW);

    expect(Object.keys(state.occupancy)).toEqual(['gast']);
    expect(state.occupancy['gast']).toEqual({ ok: true, value: true, atMs: NOW });
  });
});

describe('de filter volgt de configuratie', () => {
  it('kent de entiteiten van een gewijzigde configuratie', () => {
    const config = withZoneSensor(exampleSite, exampleSite.zones[0]!.id, 'sensor.andere_bron');
    const ids = relevantEntities(config);

    expect(ids.has('sensor.andere_bron')).toBe(true);
    // En de oude niet meer: die staat nergens meer in de configuratie, dus een
    // wijziging erop hoort geen herberekening meer uit te lokken.
    expect(ids.has(exampleSite.zones[0]!.temperature.id)).toBe(false);
  });
});

describe('de modusbron', () => {
  // Deze woning noemt wél een keuzelijst in Home Assistant; sinds fase 6e mag
  // dat ontbreken, dus het type is optioneel geworden. Eén keer vastpakken.
  const modeSource = exampleSite.mode!;

  const withMode = (config: SiteConfig, over: Partial<ModeSource>): SiteConfig => ({
    ...config,
    mode: { ...(config.mode ?? modeSource), ...over },
  });

  it('leest de keuzelijst die de configuratie noemt', () => {
    const config = withMode(exampleSite, { select: ref('input_select.andere_lijst') });
    const state = buildSystemState(
      config,
      sourceOfFile({ [modeSource.select.id]: 'nacht', 'input_select.andere_lijst': 'vakantie' }),
      NOW,
    );
    expect(state.modeOverride).toBe('vakantie');
  });

  it('vertaalt standen volgens de tabel uit de configuratie', () => {
    // Het oude systeem kende een aparte koelmodus; bij ons is koelen een
    // richting en geen modus, dus die valt samen met de dagmodus.
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [modeSource.select.id]: 'koelen' }),
      NOW,
    );
    expect(state.modeOverride).toBe('dag');
  });

  it('laat de regeling zelf kiezen bij de automatische stand', () => {
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [modeSource.select.id]: modeSource.automatic }),
      NOW,
    );
    expect(state.modeOverride).toBeNull();
  });

  it('kent een onbekende stand geen modus toe in plaats van te knallen', () => {
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [modeSource.select.id]: 'iets-nieuws' }),
      NOW,
    );
    expect(state.modeOverride).toBeNull();
  });

  it('laat elke handen-af knop van de configuratie winnen', () => {
    // Dit is de fout uit besluit 8b: de code kende maar één knop. Nu staan ze
    // in de configuratie en kunnen het er meer zijn.
    const button = modeSource.handsOffWhen[0]!;
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({
        [modeSource.select.id]: 'vakantie',
        [button.ref.id]: button.state,
      }),
      NOW,
    );
    expect(state.modeOverride).toBe('handmatig');
  });

  it('werkt met een tweede handen-af knop erbij', () => {
    const config = withMode(exampleSite, {
      handsOffWhen: [
        ...modeSource.handsOffWhen,
        { ref: ref('input_boolean.gasten'), state: 'on' },
      ],
    });
    const state = buildSystemState(
      config,
      sourceOfFile({ [modeSource.select.id]: 'dag', 'input_boolean.gasten': 'on' }),
      NOW,
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
    const end = '2026-09-10T12:05:00+00:00';
    const state = buildSystemState(
      config,
      {
        ...sourceOfFile({ 'timer.anders': 'active' }),
        attr: (id, k) => (id === 'timer.anders' && k === 'finishes_at' ? end : null),
      },
      NOW,
    );
    expect(state.timers.stabilisation.endsAtMs).toBe(Date.parse(end));
  });

  it('leest de zon uit de configuratie', () => {
    const config: SiteConfig = { ...exampleSite, sun: ref('sun.andere_zon') };
    const state = buildSystemState(config, sourceOfFile({ 'sun.andere_zon': 'above_horizon' }), NOW);
    expect(state.sunAboveHorizon).toEqual({ ok: true, value: true, atMs: NOW });
  });
});

describe('de buitentemperatuur', () => {
  it('gaat mee in de toestand wanneer de configuratie hem noemt', () => {
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [exampleSite.outdoorTemperature!.id]: '11.4' }),
      NOW,
    );
    expect(state.outdoorTemperatureC).toEqual({ ok: true, value: 11.4, atMs: NOW });
  });

  it('blijft onbekend zonder sensor, in plaats van iets te verzinnen', () => {
    const config: SiteConfig = { ...exampleSite };
    delete (config as { outdoorTemperature?: unknown }).outdoorTemperature;
    const state = buildSystemState(config, sourceOfFile({}), NOW);
    expect(state.outdoorTemperatureC.ok).toBe(false);
  });

  it('staat in de filter, zodat een wijziging wordt opgemerkt', () => {
    expect(relevantEntities(exampleSite).has(exampleSite.outdoorTemperature!.id)).toBe(true);
  });
});

describe('de legacy-setpoints', () => {
  it('leest de helpers die het migratieblok noemt', () => {
    const livingRoom = exampleSite.zones.find((z) => z.id === 'woonkamer')!;
    const helper = exampleSite.migration!.setpoints!['woonkamer']!.dag!.heat!;

    const adjusted = configFrom(exampleSite, sourceOfFile({ [helper.id]: '20.5' }));
    const zone = adjusted.zones.find((z) => z.id === 'woonkamer')!;

    expect(zone.setpoints.dag?.heat).toBe(20.5);
    // En de configuratie zelf blijft ongemoeid.
    expect(livingRoom.setpoints.dag?.heat).not.toBe(20.5);
  });

  it('valt terug op de configuratie en niet op een getal in de code', () => {
    // Hier stonden negen hardgecodeerde terugvalwaarden die de setpoints uit de
    // configuratie herhaalden. Valt een helper weg, dan is "wat de configuratie
    // zegt" het juiste antwoord.
    const livingRoom = exampleSite.zones.find((z) => z.id === 'woonkamer')!;
    const adjusted = configFrom(exampleSite, sourceOfFile({}));
    const zone = adjusted.zones.find((z) => z.id === 'woonkamer')!;

    expect(zone.setpoints.dag?.heat).toBe(livingRoom.setpoints.dag?.heat);
  });

  it('laat de configuratie met rust zonder migratieblok', () => {
    const config: SiteConfig = { ...exampleSite };
    delete (config as { migration?: unknown }).migration;
    expect(configFrom(config, sourceOfFile({}))).toBe(config);
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
    const touched = new Set<string>();
    const spy: EntitySource = {
      state: (id) => (touched.add(id), null),
      number: (id) => (touched.add(id), null),
      bool: (id) => (touched.add(id), null),
      attr: (id) => (touched.add(id), null),
      attrNumber: (id) => (touched.add(id), null),
      changedAt: (id) => (touched.add(id), null),
      hvacAction: (id) => (touched.add(id), null),
      hvacActionSince: (id) => (touched.add(id), null),
    };

    buildSystemState(configFrom(exampleSite, spy), spy, NOW);

    // Wat alleen voor het logboek wordt bijgehouden telt niet mee: dat is met
    // opzet niet iets waar de vertaling naar kijkt.
    const logOnly = observedEntities(exampleSite);
    const unused = [...relevantEntities(exampleSite)]
      .filter((id) => !touched.has(id) && !logOnly.has(id))
      .sort();

    expect(unused).toEqual([]);
  });

  it('legt de luchtvochtigheid vast waar de zone er een sensor voor heeft', () => {
    const zone = exampleSite.zones.find((z) => z.humidity != null)!;
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [zone.humidity!.id]: '54' }),
      NOW,
    );
    expect(state.zones[zone.id]?.humidityPct).toEqual({ ok: true, value: 54, atMs: NOW });
  });

  it('laat een zone zonder vochtsensor met rust', () => {
    const without = exampleSite.zones.find((z) => z.humidity == null)!;
    const state = buildSystemState(exampleSite, sourceOfFile({}), NOW);
    expect(state.zones[without.id]?.humidityPct).toBeUndefined();
  });
});

describe('zonder bronnen in Home Assistant', () => {
  /*
   * Deze woning heeft een `input_select` en twee `timer.`-entiteiten, omdat de
   * oude YAML ze had aangemaakt. Een verse installatie heeft ze niet, en ze
   * aanmaken zou schrijven zijn (besluit 15). Dan houdt de dienst ze zelf bij.
   *
   * Wat hier bewaakt wordt is de volgorde: staat er een bron in de
   * configuratie, dan wint Home Assistant. Zonder die regel zou een interne
   * stand stilletjes over de knop van de bewoner heen gaan liggen.
   */
  const choiceList = exampleSite.mode!;

  const without = (config: SiteConfig, ...keys: string[]): SiteConfig => {
    const copy: Record<string, unknown> = { ...config };
    for (const k of keys) delete copy[k];
    return copy as unknown as SiteConfig;
  };

  it('leest de modus uit de eigen stand wanneer de configuratie er geen noemt', () => {
    const own = new OwnState();
    own.setMode('vakantie');
    const state = buildSystemState(without(exampleSite, 'mode'), sourceOfFile({}), NOW, own);
    expect(state.modeOverride).toBe('vakantie');
  });

  it('staat zonder gekozen modus op volautomatisch', () => {
    const state = buildSystemState(
      without(exampleSite, 'mode'),
      sourceOfFile({}),
      NOW,
      new OwnState(),
    );
    expect(state.modeOverride).toBeNull();
  });

  it('laat Home Assistant winnen wanneer de configuratie een keuzelijst noemt', () => {
    const own = new OwnState();
    own.setMode('vakantie');
    const state = buildSystemState(
      exampleSite,
      sourceOfFile({ [choiceList.select.id]: 'nacht' }),
      NOW,
      own,
    );
    expect(state.modeOverride).toBe('nacht');
  });

  it('houdt de stabilisatietimer zelf bij op verzoek van de kern', () => {
    const own = new OwnState();
    own.apply([{ kind: 'startTimer', timerId: 'stabilisation', durationS: 300 }], NOW);
    const state = buildSystemState(without(exampleSite, 'timers'), sourceOfFile({}), NOW, own);
    expect(state.timers.stabilisation.endsAtMs).toBe(NOW + 300_000);
  });

  it('laat de timer uit Home Assistant winnen wanneer die is opgegeven', () => {
    // De eigen boekhouding loopt door, maar de vertaling kijkt er niet naar
    // (besluit 39). Deze woning noemt hem sinds besluit 60 niet meer; een
    // woning die hem wel noemt, krijgt hem.
    const own = new OwnState();
    own.apply([{ kind: 'startTimer', timerId: 'stabilisation', durationS: 300 }], NOW);
    const state = buildSystemState(withHaStabilisation, sourceOfFile({}), NOW, own);
    expect(state.timers.stabilisation.endsAtMs).toBeNull();
  });

  it('leest per timer: alleen manualOverride in Home Assistant, stabilisatie zelf', () => {
    // Zo staat deze woning sinds besluit 60.
    const own = new OwnState();
    own.apply([{ kind: 'startTimer', timerId: 'stabilisation', durationS: 300 }], NOW);
    expect(exampleSite.timers?.manualOverride).toBeDefined();
    const state = buildSystemState(exampleSite, sourceOfFile({}), NOW, own);
    expect(state.timers.stabilisation.endsAtMs).toBe(NOW + 300_000);
    expect(relevantEntities(exampleSite).has('timer.pv_stabilisatie')).toBe(false);
  });

  it('vergeet een timer weer na een cancelTimer', () => {
    const own = new OwnState();
    own.apply([{ kind: 'startTimer', timerId: 'stabilisation', durationS: 300 }], NOW);
    own.apply([{ kind: 'cancelTimer', timerId: 'stabilisation' }], NOW);
    const state = buildSystemState(without(exampleSite, 'timers'), sourceOfFile({}), NOW, own);
    expect(state.timers.stabilisation.endsAtMs).toBeNull();
  });

  it('wacht niet op entiteiten die er niet zijn', () => {
    const bare = without(exampleSite, 'mode', 'timers');
    const ids = relevantEntities(bare);
    expect(ids.has(choiceList.select.id)).toBe(false);
    expect(ids.has('timer.pv_stabilisatie')).toBe(false);
    // En de rest staat er nog wel in.
    expect(ids.has(exampleSite.power.gridPower!.id)).toBe(true);
  });
});

describe('een verse installatie beslist ook echt', () => {
  /*
   * Het schema aannemen is niet hetzelfde als kunnen draaien. Een
   * configuratie die parseert maar waarop `decide()` struikelt, is een
   * drempel die je pas voelt nadat je hem genomen hebt.
   *
   * Dit is de kleinste installatie die het schema toelaat — een tijdzone, een
   * zone, een apparaat — helemaal tot een besluit.
   */
  const minimal = parseSiteConfig(
    {
      timezone: 'Europe/Amsterdam',
      actuators: [
        { id: 'ketel', ref: 'climate.ketel', capabilities: { canHeat: true, canCool: false } },
      ],
      zones: [{ id: 'woonkamer', temperature: 'sensor.woonkamer', actuatorIds: ['ketel'] }],
    },
    { knownStrategies: defaultStrategies().ids },
  );

  it('komt tot een besluit zonder meter, zon, modusknop of timers', () => {
    if (!minimal.ok) throw new Error(minimal.problems.map((x) => x.message).join('\n'));

    const state = buildSystemState(
      minimal.config,
      sourceOfFile({ 'sensor.woonkamer': '17.5', 'climate.ketel': 'off' }),
      NOW,
      new OwnState(),
    );
    const record = decide({
      config: minimal.config,
      state,
      strategies: defaultStrategies(),
    });

    // Het huis is koud en er is niemand opgegeven, dus het geldt als bewoond
    // en er wordt naar het dagsetpoint van 20 geregeld.
    expect(record.explanation.occupied).toBe(true);
    expect(record.commands.some((c) => c.kind === 'setAction' && c.action === 'heat')).toBe(true);
  });

  it('wacht niet op entiteiten die deze installatie niet heeft', () => {
    if (!minimal.ok) throw new Error('configuratie ongeldig');
    const ids = [...relevantEntities(minimal.config)].sort();
    // Precies twee: de thermometer en het apparaat. Geen meter, geen zon,
    // geen keuzelijst, geen timers.
    expect(ids).toEqual(['climate.ketel', 'sensor.woonkamer']);
  });
});
