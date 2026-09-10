/**
 * De ontdekking stelt voor, en stelt het juiste voor.
 *
 * Twee soorten tests. De meeste met verzonnen registers, omdat je alleen zo
 * één regel tegelijk kunt toetsen. En één met het échte entiteitenregister uit
 * de HA-export van deze woning — 2.507 entiteiten, met alle rommel die daarbij
 * hoort — want de twee fouten die dit bestand vormgeven zijn allebei gevonden
 * door naar die data te kijken en niet naar de documentatie:
 *
 *  1. gebieden hangen aan apparaten, niet aan entiteiten;
 *  2. zonder filter op `entity_category` wordt de schijftemperatuur van een NAS
 *     een woonkamerthermostaat.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import {
  ontdek,
  pasKeuzesToe,
  type HaArea,
  type HaCoreConfig,
  type HaDevice,
  type HaRegistryEntity,
  type Registers,
} from '../src/adapters/homeassistant/discovery.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';

function state(entity_id: string, s: string, attributes: Record<string, unknown> = {}): HaEntityState {
  return {
    entity_id,
    state: s,
    attributes,
    last_changed: '2026-09-10T12:00:00+00:00',
    last_updated: '2026-09-10T12:00:00+00:00',
  };
}

function ent(entity_id: string, extra: Partial<HaRegistryEntity> = {}): HaRegistryEntity {
  return { entity_id, device_id: null, area_id: null, ...extra };
}

/** `Registers` is read-only; de tests bouwen erop voort, dus hier los. */
interface Bewerkbaar {
  config: HaCoreConfig;
  areas: HaArea[];
  devices: HaDevice[];
  entities: HaRegistryEntity[];
  states: HaEntityState[];
}

/** Een woonkamer met een airco en een thermometer, allebei via hun apparaat. */
function basis(): Bewerkbaar {
  return {
    config: { time_zone: 'Europe/Amsterdam' },
    areas: [{ area_id: 'woonkamer', name: 'Woonkamer' }],
    devices: [
      { id: 'dev-airco', area_id: 'woonkamer' },
      { id: 'dev-sensor', area_id: 'woonkamer' },
    ],
    entities: [
      ent('climate.airco', { device_id: 'dev-airco' }),
      ent('sensor.woonkamer_temp', { device_id: 'dev-sensor', original_device_class: 'temperature' }),
    ],
    states: [
      state('climate.airco', 'off', { hvac_modes: ['off', 'cool', 'heat'], min_temp: 16, max_temp: 30 }),
      state('sensor.woonkamer_temp', '21.4', { device_class: 'temperature' }),
    ],
  };
}

const parse = (c: unknown) => parseSiteConfig(c, { knownStrategies: defaultStrategies().ids });

describe('de ontdekking', () => {
  it('levert een configuratie op die het schema aanneemt', () => {
    // De belangrijkste test van dit bestand. Een voorstel dat er goed uitziet
    // maar door de eigen controle wordt afgewezen, is geen voorstel.
    const voorstel = ontdek(basis());
    const result = parse(voorstel.config);
    if (!result.ok) {
      throw new Error(result.problems.map((p) => `${p.path}: ${p.message}`).join('\n'));
    }
    expect(result.config.zones).toHaveLength(1);
    expect(result.config.actuators).toHaveLength(1);
    expect(result.config.timezone).toBe('Europe/Amsterdam');
  });

  it('vindt het gebied via het apparaat en niet via de entiteit', () => {
    // In de gemeten woning hadden 3 van de 2.507 entiteiten een eigen area_id.
    // Wie alleen daarnaar kijkt, vindt niets.
    const r = basis();
    expect(r.entities.every((e) => e.area_id == null)).toBe(true);
    const voorstel = ontdek(r);
    expect(voorstel.config['zones']).toHaveLength(1);
  });

  it('neemt wat een apparaat kan over uit hvac_modes', () => {
    const alleenKoelen = basis();
    alleenKoelen.states = [
      state('climate.airco', 'off', { hvac_modes: ['off', 'cool'], min_temp: 16, max_temp: 30 }),
      state('sensor.woonkamer_temp', '21.4', { device_class: 'temperature' }),
    ];
    const result = parse(ontdek(alleenKoelen).config);
    if (!result.ok) throw new Error('afgewezen');
    expect(result.config.actuators[0]!.capabilities).toMatchObject({
      canHeat: false,
      canCool: true,
      setpointRange: [16, 30],
    });
  });

  it('slaat een apparaat over dat niet kan verwarmen en niet kan koelen', () => {
    const r = basis();
    r.states = [
      state('climate.airco', 'off', { hvac_modes: ['off', 'fan_only', 'dry'] }),
      state('sensor.woonkamer_temp', '21.4', { device_class: 'temperature' }),
    ];
    const voorstel = ontdek(r);
    expect(voorstel.config['actuators']).toHaveLength(0);
    expect(voorstel.bevindingen.some((b) => b.tekst.includes('fan_only'))).toBe(true);
  });

  it('gebruikt een diagnostische sensor nooit als thermometer', () => {
    // Uit de echte export: de schijftemperatuur van een NAS, de accu van een
    // telefoon. Allemaal device_class temperature, geen van alle een kamer.
    const r = basis();
    r.entities = [
      ent('climate.airco', { device_id: 'dev-airco' }),
      ent('sensor.nas_schijf_temperatuur', {
        device_id: 'dev-sensor',
        original_device_class: 'temperature',
        entity_category: 'diagnostic',
      }),
    ];
    r.states = [
      state('climate.airco', 'off', { hvac_modes: ['off', 'cool', 'heat'] }),
      state('sensor.nas_schijf_temperatuur', '38', { device_class: 'temperature' }),
    ];
    const voorstel = ontdek(r);
    expect(voorstel.config['zones']).toHaveLength(0);
    expect(
      voorstel.bevindingen.some(
        (b) => b.soort === 'overgeslagen' && b.tekst.includes('niets dat de temperatuur meet'),
      ),
    ).toBe(true);
  });

  it('laat een uitgeschakelde of verborgen entiteit buiten beeld', () => {
    const r = basis();
    r.entities = [
      ...r.entities,
      ent('climate.oude_airco', { device_id: 'dev-airco', disabled_by: 'user' }),
      ent('climate.verborgen', { device_id: 'dev-airco', hidden_by: 'user' }),
    ];
    r.states = [
      ...r.states,
      state('climate.oude_airco', 'off', { hvac_modes: ['off', 'heat'] }),
      state('climate.verborgen', 'off', { hvac_modes: ['off', 'heat'] }),
    ];
    expect(ontdek(r).config['actuators']).toHaveLength(1);
  });

  it('houdt de buitentemperatuur buiten de zones', () => {
    // Anders zou de regeling de woonkamer op de buitentemperatuur sturen —
    // en dat gaat een hele winter goed mis zonder één foutmelding.
    const r = basis();
    r.devices.push({ id: 'dev-buiten', area_id: 'woonkamer' });
    r.entities.push(
      ent('sensor.buiten_temperatuur', {
        device_id: 'dev-buiten',
        original_device_class: 'temperature',
      }),
    );
    r.states.push(state('sensor.buiten_temperatuur', '11.2', { device_class: 'temperature' }));

    const voorstel = ontdek(r);
    expect(voorstel.config['outdoorTemperature']).toBe('sensor.buiten_temperatuur');
    const zone = (voorstel.config['zones'] as Record<string, unknown>[])[0]!;
    expect(zone['temperature']).toBe('sensor.woonkamer_temp');
  });

  it('vindt de buitentemperatuur bij de weerintegratie', () => {
    // Een integratie die een `weather.`-entiteit levert, is een weerintegratie.
    // Zo hoeft er geen lijst met namen bijgehouden te worden die veroudert.
    const r = basis();
    r.entities.push(
      ent('weather.buienradar', { platform: 'buienradar' }),
      ent('sensor.temperatuur', { platform: 'buienradar', original_device_class: 'temperature' }),
      // De rest van wat zo'n integratie meelevert, en wat we niet willen.
      ent('sensor.gevoelstemperatuur', {
        platform: 'buienradar',
        original_device_class: 'temperature',
      }),
      ent('sensor.grondtemperatuur', {
        platform: 'buienradar',
        original_device_class: 'temperature',
      }),
      ent('sensor.temperatuur_1d', {
        platform: 'buienradar',
        original_device_class: 'temperature',
      }),
      ent('sensor.minimale_temperatuur_3d', {
        platform: 'buienradar',
        original_device_class: 'temperature',
      }),
    );
    const voorstel = ontdek(r);
    expect(voorstel.config['outdoorTemperature']).toBe('sensor.temperatuur');
    expect(voorstel.bevindingen.find((b) => b.pad === 'outdoorTemperature')!.soort).toBe('geraden');
  });

  it('kiest niet wanneer er twee weerintegraties zijn, maar sorteert wel', () => {
    // Uit de echte installatie: naast het weer thuis ook het weer op een
    // circuit. Dan is kiezen aan de bewoner — wij leggen alleen de meest
    // waarschijnlijke bovenop.
    const r = basis();
    r.entities.push(
      ent('weather.buienradar', { platform: 'buienradar' }),
      ent('weather.circuit', { platform: 'f1_sensor' }),
      ent('sensor.f1_weather', { platform: 'f1_sensor', original_device_class: 'temperature' }),
      ent('sensor.temperatuur', { platform: 'buienradar', original_device_class: 'temperature' }),
    );
    const voorstel = ontdek(r);
    expect(voorstel.config['outdoorTemperature']).toBeUndefined();
    const b = voorstel.bevindingen.find((x) => x.pad === 'outdoorTemperature')!;
    expect(b.soort).toBe('ontbreekt');
    expect(b.alternatieven?.[0]).toBe('sensor.temperatuur');
  });

  it('raadt de slimme meter en zegt erbij dat het een gok is', () => {
    const r = basis();
    r.devices.push({ id: 'dev-p1', area_id: null });
    r.entities.push(ent('sensor.p1_meter_power', { device_id: 'dev-p1', original_device_class: 'power' }));
    r.states.push(state('sensor.p1_meter_power', '-1200', { device_class: 'power' }));

    const voorstel = ontdek(r);
    expect((voorstel.config['power'] as Record<string, unknown>)['gridPower']).toBe(
      'sensor.p1_meter_power',
    );
    const b = voorstel.bevindingen.find((x) => x.pad === 'power.gridPower')!;
    expect(b.soort).toBe('geraden');
    expect(b.tekst).toContain('negatief');
  });

  it('trapt niet in een sensor die alleen toevallig "net" in zijn naam heeft', () => {
    const r = basis();
    r.entities.push(ent('sensor.internet_verbruik', { original_device_class: 'power' }));
    r.states.push(state('sensor.internet_verbruik', '12', { device_class: 'power' }));
    expect(ontdek(r).config['power']).toBeUndefined();
  });

  it('koppelt een vermogenssensor aan het apparaat waar hij op zit', () => {
    const r = basis();
    r.entities.push(
      ent('sensor.airco_verbruik', { device_id: 'dev-airco', original_device_class: 'power' }),
    );
    r.states.push(state('sensor.airco_verbruik', '410', { device_class: 'power' }));

    const actuator = (ontdek(r).config['actuators'] as Record<string, unknown>[])[0]!;
    expect(actuator['power']).toEqual({ estimatedW: 0, sensor: 'sensor.airco_verbruik' });
  });

  it('meldt het wanneer er niets te vinden valt in plaats van iets te verzinnen', () => {
    const leeg: Registers = {
      config: { time_zone: 'Europe/Amsterdam' },
      areas: [],
      devices: [],
      entities: [],
      states: [],
    };
    const voorstel = ontdek(leeg);
    expect(voorstel.config['zones']).toHaveLength(0);
    expect(
      voorstel.bevindingen.some((b) => b.pad === 'zones' && b.soort === 'ontbreekt'),
    ).toBe(true);
  });
});

describe('tegen het echte register van deze woning', () => {
  /*
   * 2.507 entiteiten uit de HA-export. De export bevat geen apparaat- of
   * gebiedsregister, dus er kan hier geen zone uitkomen — dat is precies wat
   * er getoetst wordt: op rommelige echte data hoort de ontdekking niets te
   * verzinnen en netjes te zeggen wat er ontbreekt.
   */
  const pad = resolve(process.cwd(), '..', 'HA export', 'core.entity_registry');
  const ruw = JSON.parse(readFileSync(pad, 'utf-8')) as {
    data: { entities: HaRegistryEntity[] };
  };
  const entities = ruw.data.entities;

  it('leest een register van deze omvang zonder te struikelen', () => {
    expect(entities.length).toBeGreaterThan(2000);
    const voorstel = ontdek({
      config: { time_zone: 'Europe/Amsterdam' },
      areas: [],
      devices: [],
      entities,
      states: [],
    });
    expect(voorstel.config['zones']).toHaveLength(0);
    expect(voorstel.config['actuators']).toHaveLength(0);
  });

  it('zegt hoeveel er buiten beeld blijft, en dat is niet niks', () => {
    const voorstel = ontdek({
      config: {},
      areas: [],
      devices: [],
      entities,
      states: [],
    });
    const b = voorstel.bevindingen.find((x) => x.pad === '(register)');
    expect(b).toBeDefined();
    expect(b!.soort).toBe('overgeslagen');
  });

  it('vindt de bewoners wel, want die hangen nergens aan', () => {
    const voorstel = ontdek({
      config: {},
      areas: [],
      devices: [],
      entities,
      states: [],
    });
    const b = voorstel.bevindingen.find((x) => x.pad === 'occupancy')!;
    expect(b.soort).toBe('gevonden');
    expect(b.tekst).toContain('person.');
  });
});

describe('de antwoorden van de bewoner', () => {
  /** Een woning met alle drie de twijfelgevallen erin. */
  function twijfelachtig() {
    const r = basis();
    r.devices.push({ id: 'dev-p1', area_id: null }, { id: 'dev-airco2', area_id: 'woonkamer' });
    r.entities.push(
      // twee thermometers in dezelfde kamer
      ent('sensor.woonkamer_temp_2', {
        device_id: 'dev-sensor',
        original_device_class: 'temperature',
      }),
      // dezelfde airco via een tweede integratie
      ent('climate.airco_2', { device_id: 'dev-airco2' }),
      // twee kandidaten voor de netmeting
      ent('sensor.p1_meter_power', { device_id: 'dev-p1', original_device_class: 'power' }),
      ent('sensor.grid_power', { device_id: 'dev-p1', original_device_class: 'power' }),
    );
    r.states.push(
      state('sensor.woonkamer_temp_2', '21.9', { device_class: 'temperature' }),
      state('climate.airco_2', 'off', { hvac_modes: ['off', 'cool', 'heat'] }),
      state('sensor.p1_meter_power', '-1200', { device_class: 'power' }),
      state('sensor.grid_power', '-1200', { device_class: 'power' }),
    );
    return ontdek(r);
  }

  it('vraagt precies waar het onzeker over is, en niet meer', () => {
    const v = twijfelachtig();
    expect(v.keuzes.map((k) => k.id).sort()).toEqual([
      'dubbel:airco',
      'gridPower',
      'zone:woonkamer:temperature',
    ]);
  });

  it('neemt een andere thermometer over', () => {
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, { 'zone:woonkamer:temperature': 'sensor.woonkamer_temp_2' });
    expect((c['zones'] as Record<string, unknown>[])[0]!['temperature']).toBe(
      'sensor.woonkamer_temp_2',
    );
  });

  it('haalt bij een dubbel apparaat de ander eruit, inclusief de verwijzing', () => {
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, { 'dubbel:airco': 'climate.airco_2' });
    const actuators = c['actuators'] as Record<string, unknown>[];
    expect(actuators.map((a) => a['ref'])).toEqual(['climate.airco_2']);
    // En de zone wijst niet meer naar iets dat niet bestaat.
    const zone = (c['zones'] as Record<string, unknown>[])[0]!;
    expect(zone['actuatorIds']).toEqual(['airco-2']);
  });

  it('laat een veld weg wanneer het antwoord leeg mag zijn', () => {
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, { gridPower: null });
    expect(c['power']).toBeUndefined();
  });

  it('negeert een antwoord dat niet in de keuzelijst stond', () => {
    // De pagina levert een keuzelijst aan. Alles daarbuiten is een fout, of
    // iets ergers, en in geen van beide gevallen iets om over te nemen.
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, { gridPower: 'sensor.iets_heel_anders' });
    expect((c['power'] as Record<string, unknown>)['gridPower']).toBe('sensor.p1_meter_power');
  });

  it('weigert leeg te laten wat niet leeg mag', () => {
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, { 'zone:woonkamer:temperature': null });
    expect((c['zones'] as Record<string, unknown>[])[0]!['temperature']).toBe(
      'sensor.woonkamer_temp',
    );
  });

  it('levert na het beantwoorden nog steeds iets op dat het schema aanneemt', () => {
    const v = twijfelachtig();
    const c = pasKeuzesToe(v, {
      'zone:woonkamer:temperature': 'sensor.woonkamer_temp_2',
      'dubbel:airco': 'climate.airco',
      gridPower: 'sensor.grid_power',
    });
    const result = parse(c);
    if (!result.ok) {
      throw new Error(result.problems.map((x) => `${x.path}: ${x.message}`).join('\n'));
    }
    expect(result.config.zones[0]!.temperature.id).toBe('sensor.woonkamer_temp_2');
    expect(result.config.actuators).toHaveLength(1);
    expect(result.config.power.gridPower!.id).toBe('sensor.grid_power');
  });

  it('raakt het oorspronkelijke voorstel niet aan', () => {
    // De weergave mag hetzelfde voorstel meerdere keren met andere antwoorden
    // doorrekenen zonder dat het onderweg verandert.
    const v = twijfelachtig();
    const voor = JSON.stringify(v.config);
    pasKeuzesToe(v, { 'dubbel:airco': 'climate.airco_2' });
    expect(JSON.stringify(v.config)).toBe(voor);
  });
});

describe('een kamer waar het apparaat de enige thermometer is', () => {
  /*
   * Besluit 41 noemde dit als bekende beperking: bij de gemeten woning had de
   * badkamer een thermostaat met een ingebouwde meting maar geen losse
   * sensor, en werd daardoor geen zone. Een thermostaat meldt die meting als
   * `current_temperature` — een attribuut, geen entiteit.
   */
  function badkamer(): Bewerkbaar {
    return {
      config: { time_zone: 'Europe/Amsterdam' },
      areas: [{ area_id: 'badkamer', name: 'Badkamer' }],
      devices: [{ id: 'dev-thermostaat', area_id: 'badkamer' }],
      entities: [ent('climate.thermostaat_badkamer', { device_id: 'dev-thermostaat' })],
      states: [
        state('climate.thermostaat_badkamer', 'heat', {
          hvac_modes: ['off', 'heat'],
          min_temp: 5,
          max_temp: 30,
          current_temperature: 21.5,
          current_humidity: 62,
        }),
      ],
    };
  }

  it('maakt er nu wel een zone van', () => {
    const voorstel = ontdek(badkamer());
    const zones = voorstel.config['zones'] as Record<string, unknown>[];
    expect(zones).toHaveLength(1);
    expect(zones[0]!['temperature']).toEqual({
      id: 'climate.thermostaat_badkamer',
      attribute: 'current_temperature',
    });
  });

  it('zegt erbij dat die thermometer in het apparaat zit', () => {
    const b = ontdek(badkamer()).bevindingen.find((x) => x.pad === 'zones.badkamer.temperature');
    expect(b?.soort).toBe('geraden');
    expect(b?.tekst).toContain('leest');
  });

  it('neemt de luchtvochtigheid langs dezelfde weg mee', () => {
    const zones = ontdek(badkamer()).config['zones'] as Record<string, unknown>[];
    expect(zones[0]!['humidity']).toEqual({
      id: 'climate.thermostaat_badkamer',
      attribute: 'current_humidity',
    });
  });

  it('laat een losse sensor altijd voorgaan', () => {
    // Een thermometer aan de muur leest de kamer; die in het apparaat leest
    // de uitblaas. Bij twijfel wint de muur.
    const r = badkamer();
    r.devices.push({ id: 'dev-sensor', area_id: 'badkamer' });
    r.entities.push(
      ent('sensor.badkamer_temp', { device_id: 'dev-sensor', original_device_class: 'temperature' }),
    );
    r.states.push(state('sensor.badkamer_temp', '21.0', { device_class: 'temperature' }));

    const zones = ontdek(r).config['zones'] as Record<string, unknown>[];
    expect(zones[0]!['temperature']).toBe('sensor.badkamer_temp');
  });

  it('levert een configuratie op die het schema aanneemt en te lezen is', () => {
    const voorstel = ontdek(badkamer());
    const result = parse(voorstel.config);
    if (!result.ok) {
      throw new Error(result.problems.map((x) => `${x.path}: ${x.message}`).join('\n'));
    }
    const zone = result.config.zones[0]!;
    expect(zone.temperature.id).toBe('climate.thermostaat_badkamer');
    expect(zone.temperature.attribute).toBe('current_temperature');
  });

  it('slaat de kamer nog steeds over wanneer niemand iets meet', () => {
    const r = badkamer();
    r.states = [state('climate.thermostaat_badkamer', 'heat', { hvac_modes: ['off', 'heat'] })];
    const voorstel = ontdek(r);
    expect(voorstel.config['zones']).toHaveLength(0);
    expect(
      voorstel.bevindingen.some((b) => b.tekst.includes('niets dat de temperatuur meet')),
    ).toBe(true);
  });
});
