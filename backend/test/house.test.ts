/**
 * Het huis als navigatie (ONTWERP §4, besluiten 95 en 96): etages, kamers met
 * hun zones en de apparaten erin, uit een voorstel of een vastgelegde indeling.
 */

import { describe, expect, it } from 'vitest';

import { programMinutes } from '../src/adapters/homeassistant/mapping.js';
import type { EntitySource } from '../src/adapters/homeassistant/source.js';

import { buildHouse, knownForLayout, lampsFor, outsideFromNames, proposeLayout, roomTypeFromNames } from '../src/web/house.js';
import type { Layout } from '../src/web/layout.js';
import { registers, snapshot, states } from './house-fixture.js';
import { exampleSite } from './site.js';

const config = exampleSite;

describe('het voorstel uit Home Assistant', () => {
  const house = buildHouse(config, registers, states, snapshot);

  it('is een voorstel, met de vaste etages van boven naar beneden en buiten apart', () => {
    expect(house.indeling).toBe('voorstel');
    expect(house.etages.map((e) => [e.id, e.naam])).toEqual([
      ['e2', 'Zolder'],
      ['e1', 'Eerste verdieping'],
      ['bg', 'Begane grond'],
      ['buiten', 'Buiten'],
    ]);
    expect(house.etages.at(-1)!.ruimtes.map((r) => r.naam)).toEqual(['Tuin', 'Oprit']);
  });

  it('zet een tuin of oprit buiten, ook als Home Assistant hem op de begane grond zet', () => {
    expect(house.etages.find((e) => e.id === 'bg')!.ruimtes.map((r) => r.naam)).not.toContain('Oprit');
  });

  it('zegt bij een buitenruimte wat het is, uit de naam zolang de bewoner niets koos (besluit 109)', () => {
    const buiten = house.etages.find((e) => e.id === 'buiten')!.ruimtes;
    expect(buiten.find((r) => r.naam === 'Oprit')!.buiten).toEqual({ soort: 'oprit', auto: true, tuinhuis: false });
    expect(buiten.find((r) => r.naam === 'Tuin')!.buiten!.soort).toBe('tuin');
    expect(house.etages.find((e) => e.id === 'bg')!.ruimtes.every((r) => r.buiten === null)).toBe(true);
    expect(outsideFromNames({ naam: 'Achtertuin', zones: [] }, [{ naam: 'Tuinhuis overstek' }])).toEqual({ soort: 'tuin', auto: false, tuinhuis: true });
    expect(outsideFromNames({ naam: 'Dakterras', zones: [] }, [])).toEqual({ soort: 'terras', auto: false, tuinhuis: false });
    expect(outsideFromNames({ naam: 'Carport', zones: [] }, []).soort).toBe('oprit');
    // Een voortuin heeft zijn eigen plek in de tekening (besluit 113).
    expect(outsideFromNames({ naam: 'Voortuin', zones: [] }, []).soort).toBe('voortuin');
  });

  it('raadt wat voor kamer het is uit de naam, de zones en de etage (besluit 119)', () => {
    const soort = (naam: string, zones: string[] = [], etage = 'e1') => roomTypeFromNames({ naam, etage, zones: zones.map((z, i) => ({ id: `z${i}`, naam: z })) });
    const verwacht: [string, string | null][] = [
      ['Woonkamer', 'woonkamer'], ['Huiskamer', 'woonkamer'], ['Serre', 'woonkamer'], ['Living', 'woonkamer'],
      ['Woonkeuken', 'woonkeuken'], ['Keuken', 'keuken'], ['Bijkeuken', 'wasruimte'], ['Eetkamer', 'eetkamer'],
      ['Slaapkamer', 'slaapkamer'], ['Ouderslaapkamer', 'slaapkamer'], ['Master bedroom', 'slaapkamer'],
      ['Slaapkamer Matts', 'kinderkamer'], ['Kinderslaapkamer', 'kinderkamer'], ['Babykamer', 'kinderkamer'], ['Speelkamer', 'kinderkamer'],
      ['Logeerkamer', 'logeerkamer'], ['Gastenkamer', 'logeerkamer'],
      ['Badkamer', 'badkamer'], ['Douche', 'badkamer'], ['Toilet', 'toilet'], ['WC beneden', 'toilet'],
      ['Hal', 'hal'], ['Overloop', 'hal'], ['Gang', 'hal'], ['Entree', 'hal'],
      ['Werkkamer', 'werkkamer'], ['Kantoor', 'werkkamer'], ['Hobbykamer', 'werkkamer'], ['Studeerkamer', 'werkkamer'],
      ['Wasruimte', 'wasruimte'], ['Washok', 'wasruimte'], ['Zolder', 'berging'], ['Berging', 'berging'], ['Kelder', 'berging'],
      ['Kamer Lisa', null], ['Beneden', null],
    ];
    for (const [naam, soortVerwacht] of verwacht) expect(soort(naam), naam).toBe(soortVerwacht);
    // Een kamer met een keuken en een zithoek: een woonkamer met open keuken.
    expect(soort('Beneden', ['Keuken', 'Zithoek'])).toBe('woonkeuken');
    // Een kelder zonder naam die iets zegt: een berging.
    expect(soort('Ruimte 1', [], 'kelder')).toBe('berging');
    // Wat er staat, helpt: een droger maakt een wasruimte.
    expect(roomTypeFromNames({ naam: 'Achterkamer', etage: 'e2', zones: [] }, [{ naam: 'Droger', soort: 'apparaat' }])).toBe('wasruimte');
    // In het huis: de keuze gaat voor, anders het voorstel; buiten geen soort.
    const eigen = proposeLayout(config, registers, states);
    const binnen = eigen.kamers.find((k) => k.etage !== 'buiten')!;
    const met = buildHouse(config, registers, states, snapshot, { ...eigen, kamers: eigen.kamers.map((k) => (k.id === binnen.id ? { ...k, soort: 'werkkamer' as const } : k)) });
    const eerste = met.etages.flatMap((e) => e.ruimtes).find((r) => r.id === binnen.id)!;
    expect([eerste.soort, eerste.soortGekozen]).toEqual(['werkkamer', true]);
    expect(met.etages.find((e) => e.id === 'buiten')!.ruimtes.every((r) => r.soort === null)).toBe(true);
  });

  it('raadt welke etage onder het dak ligt, en volgt wat de bewoner koos (besluit 111)', () => {
    expect(house.dakEtage).toBe('e2');
    const eigen = proposeLayout(config, registers, states);
    expect(buildHouse(config, registers, states, snapshot, { ...eigen, dak: 'geen' }).dakEtage).toBeNull();
    expect(buildHouse(config, registers, states, snapshot, { ...eigen, dak: 'e1' }).dakEtage).toBe('e1');
  });

  it('zet een kelder bij de begane grond, net als een trapkast (besluit 119)', () => {
    const metKelder = { ...registers, floors: [...registers.floors, { floor_id: 'kelder', name: 'Kelder', level: -1 }], areas: registers.areas.map((a) => (a.area_id === 'hal' ? { ...a, floor_id: 'kelder' } : a)) };
    const voorstel = proposeLayout(config, metKelder, states);
    expect(voorstel.kamers.find((k) => k.naam === 'Hal')!.etage).toBe('bg');
    expect(voorstel.etages).not.toHaveProperty('kelder');
    expect(roomTypeFromNames({ naam: 'Trapkast', etage: 'bg', zones: [] })).toBe('berging');
    expect(roomTypeFromNames({ naam: 'Meterkast', etage: 'bg', zones: [] })).toBe('berging');
  });

  it('noemt een etage naar het precieze niveau, niet naar een "Dak" erboven', () => {
    expect(proposeLayout(config, registers, states).etages.e2).toBe('Zolder');
  });

  it('laat gebieden zonder iets erin weg', () => {
    expect(house.etages.flatMap((e) => e.ruimtes).some((r) => r.naam === 'Berging')).toBe(false);
  });

  it('koppelt de kamer aan het regelgebied, met temperatuur en de zin van de assistent', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    expect(wk.zoneId).toBe('woonkamer');
    expect(wk.temperatuurC).toBe(21.9);
    expect(wk.status?.soort).toBe('ok');
    expect(wk.status?.zin).toContain('precies goed');
  });

  it('laat een kamer die meedoet de stand en temperatuur van die regeling zien (besluit 142)', () => {
    const eigen = proposeLayout(config, registers, states);
    const wk = eigen.kamers.find((k) => k.regelzone === 'woonkamer')!;
    const hal = eigen.kamers.find((k) => k.naam === 'Hal')!;
    const met = { ...eigen, kamers: eigen.kamers.map((k) => (k.id === hal.id ? { ...k, regelzone: null, meedoenMet: wk.id } : k)) };
    const h = buildHouse(config, registers, states, snapshot, met);
    const r = h.etages.flatMap((e) => e.ruimtes).find((x) => x.id === hal.id)!;
    // Geen eigen regelzone, zodat de regeling één keer in de app staat.
    expect(r.zoneId).toBeNull();
    expect(r.meedoenMet).toEqual({ kamerId: wk.id, naam: wk.naam, zoneId: 'woonkamer' });
    expect(r.status?.zin).toMatch(/^Doet mee met de regeling van .+\. .+ is het 21,9°, precies goed\./);
    expect(h.etages.flatMap((e) => e.ruimtes).filter((x) => x.zoneId === 'woonkamer')).toHaveLength(1);
  });

  it('zegt of een scherm zijn stand terugmeldt (Somfy io) of niet (Somfy RTS, besluit 121)', () => {
    const screen = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'cover.screen')!;
    expect(screen.scherm).toEqual({ terugmelding: true, standKiezen: true });
    // Een RTS-scherm: Home Assistant neemt de stand aan.
    const rts = new Map(states);
    rts.set('cover.screen', { ...states.get('cover.screen')!, state: 'open', attributes: { friendly_name: 'Zonnescherm', assumed_state: true, supported_features: 15 } });
    const metRts = buildHouse(config, registers, rts, snapshot).etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'cover.screen')!;
    // Home Assistant onthoudt de laatste opdracht; die staat er (besluit 128).
    expect([metRts.stand, metRts.positiePct, metRts.aan, metRts.scherm]).toEqual(['open, volgens de laatste opdracht', null, false, { terugmelding: false, standKiezen: false, laatste: 'open' }]);
    // Een zonnescherm: uitgevouwen en ingeklapt; zonder opdracht geen stand.
    rts.set('cover.screen', { ...states.get('cover.screen')!, state: 'closed', attributes: { friendly_name: 'Zonnescherm', assumed_state: true, device_class: 'awning' } });
    const zonnescherm = () => buildHouse(config, registers, rts, snapshot).etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'cover.screen')!;
    expect([zonnescherm().stand, zonnescherm().scherm]).toEqual(['ingeklapt, volgens de laatste opdracht', { terugmelding: false, standKiezen: false, zonnescherm: true, laatste: 'dicht' }]);
    rts.set('cover.screen', { ...states.get('cover.screen')!, state: 'unknown', attributes: { friendly_name: 'Zonnescherm', assumed_state: true, device_class: 'awning' } });
    expect([zonnescherm().stand, zonnescherm().scherm?.laatste]).toEqual(['zonder terugmelding', undefined]);
    // Een zonnescherm met terugmelding: 100 is helemaal uitgevouwen.
    rts.set('cover.screen', { ...states.get('cover.screen')!, state: 'open', attributes: { friendly_name: 'Zonnescherm', device_class: 'awning', current_position: 60, supported_features: 15 } });
    expect([zonnescherm().stand, zonnescherm().aan]).toEqual(['60% uitgevouwen', true]);
    // Een io-scherm met een stand en de functie om er een te kiezen.
    const io = new Map(states);
    io.set('cover.screen', { ...states.get('cover.screen')!, attributes: { friendly_name: 'Screen', current_position: 40, supported_features: 15 } });
    const metIo = buildHouse(config, registers, io, snapshot).etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'cover.screen')!;
    expect(metIo.scherm).toEqual({ terugmelding: true, standKiezen: true });
  });

  it('toont een radiatorknop die de configuratie niet kent, met hoe hij gekoppeld is (besluit 126)', () => {
    const basis = states.get('cover.screen')!;
    const area = registers.areas.find((x) => x.name === 'Badkamer')!.area_id;
    const metKnop = {
      ...registers,
      devices: [...registers.devices, { id: 'd-trv', area_id: area, name: 'Radiator badkamer', name_by_user: null, manufacturer: 'SONOFF', model: 'TRVZB' }],
      entities: [
        ...registers.entities,
        { entity_id: 'climate.radiator_badkamer', device_id: 'd-trv', platform: 'zha' },
        { entity_id: 'sensor.radiator_badkamer_valve_position', device_id: 'd-trv', platform: 'zha' },
      ],
    };
    const metStand = new Map(states);
    metStand.set('climate.radiator_badkamer', { ...basis, entity_id: 'climate.radiator_badkamer', state: 'heat', attributes: { friendly_name: 'Radiator badkamer', hvac_modes: ['off', 'heat'], current_temperature: 19.5, temperature: 20, hvac_action: 'idle' } });
    metStand.set('sensor.radiator_badkamer_valve_position', { ...basis, entity_id: 'sensor.radiator_badkamer_valve_position', state: '35', attributes: { unit_of_measurement: '%' } });
    const h = buildHouse(config, metKnop, metStand, snapshot);
    const knop = h.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'climate.radiator_badkamer')!;
    expect([knop.soort, knop.stand, knop.aan, knop.actuatorId]).toEqual(['klimaat', 'staat klaar, doel 20°', false, null]);
    expect(knop.radiatorknop).toEqual({ koppeling: 'zha', klepPct: 35 });
    expect(knop.meting?.temperatuurC).toBe(19.5);
    expect(knop.klimaat).toMatchObject({ kanKoelen: false, kanVerwarmen: true, doelC: 20 });
  });

  it('toont een airco via een tweede koppeling niet nog eens (besluit 127)', () => {
    const basis = states.get('cover.screen')!;
    const ac = config.actuators.find((a) => a.ref.id.startsWith('climate.'))!;
    const eigen = registers.entities.find((e) => e.entity_id === ac.ref.id);
    const area = registers.areas[0]!.area_id;
    const metTwee = {
      ...registers,
      devices: [
        ...registers.devices,
        { id: 'd-lg', area_id: area, name: 'Airco boven', name_by_user: null, manufacturer: 'LGE', model: 'RAC_056905_WW (DEVICE_AIR_CONDITIONER)' },
        { id: 'd-lg2', area_id: area, name: 'Air Conditioning boven', name_by_user: null, manufacturer: 'LG', model: 'RAC_056905_WW-RAC (AC)' },
      ],
      entities: [
        ...registers.entities.filter((e) => e.entity_id !== ac.ref.id),
        { ...(eigen ?? { entity_id: ac.ref.id }), device_id: 'd-lg' },
        { entity_id: 'climate.air_conditioning_boven_2', device_id: 'd-lg2', platform: 'smartthinq_sensors' },
      ],
    };
    const metStand = new Map(states);
    metStand.set('climate.air_conditioning_boven_2', { ...basis, entity_id: 'climate.air_conditioning_boven_2', state: 'off', attributes: { hvac_modes: ['off', 'cool', 'heat'] } });
    const ids = (h: ReturnType<typeof buildHouse>) => h.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).map((d) => d.id);
    expect(ids(buildHouse(config, metTwee, metStand, snapshot))).not.toContain('climate.air_conditioning_boven_2');
    // Een ander type in dezelfde ruimte is een tweede apparaat, en staat er wel.
    const ander = { ...metTwee, devices: metTwee.devices.map((d) => (d.id === 'd-lg2' ? { ...d, name: 'Mobiele airco', model: 'PAC_2000' } : d)) };
    expect(ids(buildHouse(config, ander, metStand, snapshot))).toContain('climate.air_conditioning_boven_2');
  });

  it('geeft een airco drogen en zijn filter, ook van een tweede koppeling, en meldt een vol filter (besluit 129)', () => {
    const basis = states.get('cover.screen')!;
    const ac = config.actuators.find((a) => a.ref.id.startsWith('climate.') && a.capabilities.canCool)!;
    const area = registers.areas[0]!.area_id;
    const metFilter = {
      ...registers,
      devices: [
        ...registers.devices,
        { id: 'd-lg', area_id: area, name: 'Airco boven', name_by_user: null, manufacturer: 'LGE', model: 'RAC_056905_WW' },
        { id: 'd-lg2', area_id: area, name: 'Airco boven', name_by_user: null, manufacturer: 'LG', model: 'RAC_056905_WW-RAC' },
      ],
      entities: [
        ...registers.entities.filter((e) => e.entity_id !== ac.ref.id),
        { entity_id: ac.ref.id, device_id: 'd-lg' },
        { entity_id: 'sensor.airco_filter_resterend', device_id: 'd-lg', translation_key: 'filter_lifetime' },
        { entity_id: 'sensor.airco_boven_filter_remaining_life', device_id: 'd-lg2' },
      ],
    };
    const metStand = new Map(states);
    metStand.set(ac.ref.id, { ...basis, entity_id: ac.ref.id, state: 'off', attributes: { hvac_modes: ['off', 'cool', 'dry', 'heat'] } });
    metStand.set('sensor.airco_filter_resterend', { ...basis, entity_id: 'sensor.airco_filter_resterend', state: '120', attributes: { unit_of_measurement: 'h' } });
    metStand.set('sensor.airco_boven_filter_remaining_life', { ...basis, entity_id: 'sensor.airco_boven_filter_remaining_life', state: '8', attributes: { unit_of_measurement: '%' } });
    const h = buildHouse(config, metFilter, metStand, snapshot);
    const airco = h.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === ac.id)!;
    expect(airco.klimaat).toMatchObject({ kanDrogen: true, filter: { pct: 8, uren: 120 } });
    expect(h.filters.map((f) => [f.id, f.pct])).toEqual([[ac.id, 8]]);
    // Een vol filter is geen batterij.
    expect(h.batterijen.some((b) => b.pct === 8)).toBe(false);
  });

  it('toont alleen kleine batterijen in huis: geen telefoon, thuisbatterij of auto (besluit 127)', () => {
    const basis = states.get('cover.screen')!;
    const accu = (id: string, pct: string) => [id, { ...basis, entity_id: id, state: pct, attributes: { unit_of_measurement: '%' } }] as const;
    const metAccu = {
      ...registers,
      devices: [
        ...registers.devices,
        { id: 'd-dimmer', area_id: null, name: 'Hue dimmer switch', name_by_user: null, manufacturer: 'Signify Netherlands B.V.', model: 'Hue dimmer switch' },
        { id: 'd-tel', area_id: null, name: 'Telefoon', name_by_user: null },
        { id: 'd-thuisaccu', area_id: null, name: 'Thuisbatterij', name_by_user: null },
        { id: 'd-omvormer', area_id: null, name: 'Omvormer B1', name_by_user: null, manufacturer: 'SolarEdge', model: 'StorEdge' },
        { id: 'd-auto', area_id: null, name: 'Auto', name_by_user: null },
        { id: 'd-zonscreen', area_id: null, name: 'Screen op zon', name_by_user: null, manufacturer: 'Somfy', model: 'RollerShutter' },
      ],
      entities: [
        ...registers.entities,
        { entity_id: 'sensor.dimmer_batterij', device_id: 'd-dimmer', original_device_class: 'battery', platform: 'hue' },
        { entity_id: 'sensor.telefoon_batterij', device_id: 'd-tel', original_device_class: 'battery', platform: 'mobile_app' },
        { entity_id: 'sensor.thuisaccu_soc', device_id: 'd-thuisaccu', original_device_class: 'battery' },
        { entity_id: 'sensor.thuisaccu_vermogen', device_id: 'd-thuisaccu', original_device_class: 'power' },
        { entity_id: 'sensor.thuisaccu_geladen', device_id: 'd-thuisaccu', original_device_class: 'energy' },
        { entity_id: 'sensor.omvormer_soe', device_id: 'd-omvormer', original_device_class: 'battery' },
        { entity_id: 'sensor.auto_accu', device_id: 'd-auto', original_device_class: 'battery' },
        { entity_id: 'sensor.auto_bereik', device_id: 'd-auto', original_device_class: 'distance' },
        { entity_id: 'sensor.zonscreen_batterij', device_id: 'd-zonscreen', original_device_class: 'battery' },
        { entity_id: 'sensor.zonscreen_zon', device_id: 'd-zonscreen', original_device_class: 'power' },
      ],
    };
    const metStand = new Map(states);
    for (const [id, st] of [accu('sensor.dimmer_batterij', '9'), accu('sensor.telefoon_batterij', '3'), accu('sensor.thuisaccu_soc', '0'), accu('sensor.omvormer_soe', '0'), accu('sensor.auto_accu', '5'), accu('sensor.zonscreen_batterij', '80')]) metStand.set(id, st);
    const h = buildHouse(config, metAccu, metStand, snapshot);
    expect(h.batterijen.map((b) => [b.naam, b.pct])).toEqual([
      ['Hue dimmer switch', 9],
      ['Screen op zon', 80],
    ]);
  });

  it('toont in een kamer zonder regeling het gemiddelde van de gekozen sensoren (besluit 123)', () => {
    const eigen = proposeLayout(config, registers, states);
    const zonder = eigen.kamers.find((k) => k.etage !== 'buiten' && k.regelzone == null)!;
    const basis = states.get('cover.screen')!;
    const metStand = new Map(states);
    metStand.set('sensor.a', { ...basis, entity_id: 'sensor.a', state: '19.0', attributes: {} });
    metStand.set('climate.b', { ...basis, entity_id: 'climate.b', state: 'heat', attributes: { current_temperature: 21.2 } });
    const h = buildHouse(config, registers, metStand, snapshot, { ...eigen, kamers: eigen.kamers.map((k) => (k.id === zonder.id ? { ...k, meten: ['sensor.a', 'climate.b', 'sensor.weg'] } : k)) });
    const kamer = h.etages.flatMap((e) => e.ruimtes).find((r) => r.id === zonder.id)!;
    expect(kamer.temperatuurC).toBe(20.1);
    expect(kamer.gemetenDoor).toBeNull();
  });

  it('zet de batterij bij het apparaat, en geeft alle batterijen met de leegste eerst (besluit 122)', () => {
    const basis = states.get('cover.screen')!;
    const metAccu = {
      ...registers,
      entities: [
        ...registers.entities,
        { entity_id: 'sensor.screen_batterij', device_id: 'd-screen', original_device_class: 'battery' },
        { entity_id: 'sensor.screen_batterij_spanning', device_id: 'd-screen', original_device_class: 'voltage' },
        { entity_id: 'sensor.knop_batterij', device_id: 'd-knop', device_class: 'battery' },
      ],
      devices: [...registers.devices, { id: 'd-knop', area_id: 'woonkamer', name: 'Knop bank', name_by_user: null }],
    };
    const metStand = new Map(states);
    metStand.set('sensor.screen_batterij', { ...basis, entity_id: 'sensor.screen_batterij', state: '62', attributes: { unit_of_measurement: '%' } });
    metStand.set('sensor.screen_batterij_spanning', { ...basis, entity_id: 'sensor.screen_batterij_spanning', state: '3', attributes: { unit_of_measurement: 'V' } });
    metStand.set('sensor.knop_batterij', { ...basis, entity_id: 'sensor.knop_batterij', state: '8', attributes: { unit_of_measurement: '%' } });
    const h = buildHouse(config, metAccu, metStand, snapshot);
    const screen = h.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'cover.screen')!;
    expect(screen.batterijPct).toBe(62);
    expect(h.batterijen.map((b) => [b.naam, b.pct, b.kamer])).toEqual([
      ['Knop bank', 8, 'Woonkamer'],
      [h.batterijen[1]!.naam, 62, 'Woonkamer'],
    ]);
    // Zonder batterij geen veld.
    expect(house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).some((d) => 'batterijPct' in d)).toBe(false);
  });

  it('toont lampen, zonwering en klimaat, zonder groepen of uitgezette entiteiten', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    expect(wk.apparaten.map((d) => [d.soort, d.naam, d.stand])).toEqual([
      ['klimaat', 'Airco woonkamer', 'koelen naar 22°'],
      ['klimaat', 'Nest (beneden)', 'uit'],
      ['screen', 'Screen', '60% dicht'],
      ['licht', 'Keuken', 'aan · 50%'],
      ['licht', 'Plafonnière', 'aan · 70%'],
      ['licht', 'Sfeerverlichting', 'aan'],
    ]);
    expect(wk.lampenAan).toBe(3);
    // De drie in de woonkamer en de bureaulamp op de zolder.
    expect(house.lampenAan).toBe(4);
  });

  it('toont een meter in een kamer zonder regeling, met temperatuur en luchtvochtigheid', () => {
    const hal = house.etages.find((e) => e.id === 'bg')!.ruimtes.find((r) => r.naam === 'Hal')!;
    expect(hal.apparaten.map((d) => [d.soort, d.naam, d.stand])).toEqual([['meter', 'Bewegingssensor hal', '19,5° · 61%']]);
    expect([hal.temperatuurC, hal.vochtPct, hal.gemetenDoor]).toEqual([19.5, 61.4, 'Bewegingssensor hal']);
    expect(hal.samenvatting).toEqual({ lampenAan: 0, screens: null, draait: 0, klimaat: 'Er draait niets' });
  });

  it('laat weer, schijven, telefoons en diagnose weg, en een sensor van een klimaatapparaat is geen meter', () => {
    const all = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).map((d) => d.id);
    for (const id of ['sensor.nas_temperatuur', 'sensor.temperatuur', 'sensor.f1_track_weather', 'sensor.beneden_luchtvochtigheid']) {
      expect(all, id).not.toContain(id);
      expect(house.zonderRuimte.map((d) => d.id), id).not.toContain(id);
    }
  });

  it('zegt bij klimaat wat het meet, doet en kan: de Nest kan niet koelen', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    const nest = wk.apparaten.find((d) => d.id === 'nest')!;
    expect(nest.meting).toEqual({ temperatuurC: 21.9, vochtPct: 55 });
    expect(nest.klimaat).toMatchObject({ kanKoelen: false, kanVerwarmen: true });
    const ac = wk.apparaten.find((d) => d.id === 'ac-woonkamer')!;
    expect(ac.meting).toEqual({ temperatuurC: 22.4, vochtPct: null });
    expect(ac.klimaat).toEqual({ kanKoelen: true, kanVerwarmen: true, doelC: 22, actie: 'koelt', rol: 'zon', vermogenW: null });
    // Wat de regeling ermee doet (besluit 138): de Nest houdt de kamer op temperatuur.
    expect(nest.klimaat?.rol).toBe('houdt');
    // Met een regelgebied komt de temperatuur van de kamer daarvandaan, niet van een meter.
    expect([wk.temperatuurC, wk.vochtPct, wk.gemetenDoor]).toEqual([21.9, 55, null]);
  });

  it('vat elk niveau samen in woorden, en zegt wat een lamp kan', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    expect(wk.samenvatting).toEqual({ lampenAan: 3, screens: '60% dicht', draait: 1, klimaat: 'Airco woonkamer: koelen naar 22°' });
    expect(house.etages.find((e) => e.id === 'buiten')!.samenvatting).toEqual({ lampenAan: 0, screens: null, draait: 0, klimaat: 'Er draait niets' });
    expect(house.samenvatting.lampenAan).toBe(house.lampenAan);
    const lamp = (id: string) => wk.apparaten.find((d) => d.id === id)!;
    expect([lamp('light.woonkamer_plafonniere').dimbaar, lamp('light.woonkamer_plafonniere').kleurtemp]).toEqual([true, true]);
    expect([lamp('light.sfeerverlichting').dimbaar, lamp('light.sfeerverlichting').kleurtemp]).toEqual([true, true]);
    const tuin = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'light.achtertuin')!;
    expect([tuin.dimbaar, tuin.kleurtemp]).toEqual([false, false]);
    expect(tuin.licht).toEqual({ wit: null, kleur: false, kelvin: null, tint: null });
  });

  it('zet wat in geen gebied hangt bij "nog in te delen", met de kamer van zijn groep als voorstel', () => {
    const tuin = proposeLayout(config, registers, states).kamers.find((k) => k.naam === 'Tuin')!;
    expect(house.zonderRuimte).toEqual([
      { id: 'light.zwerver', naam: 'light.zwerver', soort: 'licht', voorstel: null, groepen: ['Tuin alles'], voorstelKamer: tuin.id },
      // Een uitstelbaar apparaat (besluit 98) zonder gebied: de bewoner geeft het een kamer.
      { id: 'droger', naam: 'Droger', soort: 'apparaat', voorstel: null, groepen: [], voorstelKamer: null },
    ]);
  });

  it('toont lampgroepen niet als lamp, maar zegt wel in welke groep een lamp zit, ook bij een Hue-kamer', () => {
    const all = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
    expect(all.some((d) => d.id === 'light.hue_sfeer' || d.id === 'light.tuin_alles')).toBe(false);
    expect(all.find((d) => d.id === 'light.sfeerverlichting')!.groepen).toEqual(['Sfeer']);
    expect(all.find((d) => d.id === 'light.woonkamer_plafonniere')!.groepen).toEqual(['Woonkamer alles']);
    expect(house.lampgroepen.map((g) => [g.naam, g.hue, g.overzicht])).toEqual([
      ['Woonkamer alles', false, true],
      ['Tuin alles', false, true],
      ['Keuken', true, false],
      ['Sfeer', true, false],
      ['Etage 2 alles', false, true],
      ['Badkamer', true, false],
    ]);
  });

  it('toont een "alles"-groep nooit als lamp, en noemt een lamp die alleen daarin zit', () => {
    const all = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
    expect(all.some((d) => d.id === 'light.etage2_alles')).toBe(false);
    expect(house.onvindbaar).toEqual([{ id: 'light.zolder_spot', naam: 'Zolderspot', groepen: ['Etage 2 alles'] }]);
    expect(knownForLayout(config, registers, states).opvolgers?.has('light.zolder_spot')).toBe(false);
  });

  it('noemt een groep die zelf groepen bevat een overzicht, ook zonder "alles" in de naam', () => {
    const st = new Map(states);
    st.set('light.beneden', { ...st.get('light.tuin_alles')!, entity_id: 'light.beneden', attributes: { friendly_name: 'Beneden', entity_id: ['light.hue_keuken', 'light.sfeerverlichting'] } });
    const h = buildHouse(config, registers, st, snapshot);
    expect(h.lampgroepen.find((g) => g.id === 'light.beneden')!.overzicht).toBe(true);
  });

  it('geeft per doel de lampen die het huis toont', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    const inWk = wk.apparaten.filter((d) => d.soort === 'licht').map((d) => d.id);
    expect(lampsFor(house, { soort: 'kamer', id: wk.id })).toEqual(inWk);
    expect(lampsFor(house, { soort: 'etage', id: 'bg' })).toEqual(inWk);
    expect(lampsFor(house, { soort: 'huis', id: null })).toContain('light.hue_badkamer');
    expect(lampsFor(house, { soort: 'lamp', id: 'light.sfeerverlichting' })).toEqual(['light.sfeerverlichting']);
    expect(lampsFor(house, { soort: 'lamp', id: 'cover.screen' })).toBeNull();
    expect(lampsFor(house, { soort: 'lamp', id: 'light.zwerver' })).toBeNull();
    expect(lampsFor(house, { soort: 'etage', id: 'kelder' })).toBeNull();
  });

  it('toont een groep met uitgezette lampen als één lamp, ook als Hue ze alleen bij naam noemt', () => {
    const bad = house.etages.find((e) => e.id === 'e1')!.ruimtes.find((r) => r.naam === 'Badkamer')!;
    expect(bad.apparaten.filter((d) => d.soort === 'licht').map((d) => [d.id, d.naam, d.stand])).toEqual([['light.hue_badkamer', 'Badkamer', 'uit']]);
    expect(house.lampgroepen.find((g) => g.id === 'light.hue_badkamer')!.leden).toEqual(['light.badkamer_spot_1', 'light.badkamer_spot_2']);
  });

  it('stelt een kamer alleen voor bij dezelfde naam, of de groepsnaam als woord in de kamernaam', () => {
    const base = proposeLayout(config, registers, states);
    const rooms = [
      { ...base.kamers[0]!, id: 'slaapkamer', naam: 'Slaapkamer' },
      { ...base.kamers[0]!, id: 'hal', naam: 'Hal en trap', regelzone: null },
    ];
    const layout = { ...base, kamers: rooms, apparaten: {} };
    const at = (group: string) => {
      const st = new Map(states);
      st.set('light.tuin_alles', { ...st.get('light.tuin_alles')!, attributes: { friendly_name: group, entity_id: ['light.zwerver'] } });
      return buildHouse(config, registers, st, null, layout).zonderRuimte.find((d) => d.id === 'light.zwerver')!.voorstelKamer;
    };
    expect(at('Hal alles')).toBe('hal');
    expect(at('Slaapkamer')).toBe('slaapkamer');
    expect(at('Slaapkamer Mylan')).toBeNull();
    expect(at('Halfopen')).toBeNull();
  });

  it('toont een groep met verborgen peren als één lamp, in de kamer van die peren', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    const lamps = wk.apparaten.filter((d) => d.soort === 'licht').map((d) => [d.naam, d.stand]);
    expect(lamps).toContainEqual(['Keuken', 'aan · 50%']);
    expect(lamps.some(([n]) => String(n).startsWith('Keukentafel'))).toBe(false);
  });

  it('zet alles op de begane grond als Home Assistant geen etages kent, en buiten wat naar buiten klinkt', () => {
    const flat = buildHouse(config, { ...registers, floors: [] }, states, null);
    expect(flat.etages.map((e) => e.id)).toEqual(['bg', 'buiten']);
    expect(flat.etages[0]!.ruimtes.find((r) => r.naam === 'Woonkamer')!.status).toBeNull();
  });
});

describe('een vastgelegde indeling', () => {
  const proposal = proposeLayout(config, registers, states);
  const woonkamer = proposal.kamers.find((k) => k.regelzone === 'woonkamer')!;
  const tuin = proposal.kamers.find((k) => k.naam === 'Tuin')!;
  const layout: Layout = {
    ...proposal,
    etages: { ...proposal.etages, bg: 'Beneden' },
    kamers: proposal.kamers.map((k) =>
      k.id === woonkamer.id
        ? { ...k, zones: [{ id: 'keuken', naam: 'Keuken' }, { id: 'woonzone', naam: 'Woonzone' }] }
        : k,
    ),
    apparaten: {
      'light.sfeerverlichting': { naam: 'Sfeer', kamer: woonkamer.id, zone: 'woonzone' },
      nest: { kamer: woonkamer.id, zone: 'keuken' },
      'light.zwerver': { naam: 'Tuinlamp', kamer: tuin.id, zone: null },
      droger: { kamer: woonkamer.id, zone: null },
    },
  };
  const house = buildHouse(config, registers, states, snapshot, layout);

  it('is eigen, met de eigen naam van de etage', () => {
    expect(house.indeling).toBe('eigen');
    expect(house.etages.find((e) => e.id === 'bg')!.naam).toBe('Beneden');
  });

  it('gebruikt de eigen naam en de zone van een apparaat', () => {
    const wk = house.etages.find((e) => e.id === 'bg')!.ruimtes[0]!;
    expect(wk.zones.map((z) => z.naam)).toEqual(['Keuken', 'Woonzone']);
    const sfeer = wk.apparaten.find((d) => d.id === 'light.sfeerverlichting')!;
    expect([sfeer.naam, sfeer.haNaam, sfeer.zone]).toEqual(['Sfeer', 'Sfeerverlichting', 'woonzone']);
    expect(wk.apparaten.find((d) => d.id === 'nest')!.zone).toBe('keuken');
  });

  it('haalt een ingedeeld apparaat uit "nog in te delen"', () => {
    expect(house.zonderRuimte).toEqual([]);
    // De droger staat in de kamer die de bewoner koos, met zijn stand uit het besluit.
    const droger = house.etages.flatMap((e) => e.ruimtes).find((r) => r.id === woonkamer.id)!.apparaten.find((d) => d.id === 'droger')!;
    expect([droger.soort, droger.naam]).toEqual(['apparaat', 'Droger']);
    expect(knownForLayout(config, registers, states).deviceIds.has('droger')).toBe(true);
    expect(house.etages.find((e) => e.id === 'buiten')!.ruimtes[0]!.apparaten.map((d) => d.naam)).toContain('Tuinlamp');
  });

  it('zet een apparaat terug bij "nog in te delen" als zijn kamer weg is, met het gebied als voorstel', () => {
    const without = buildHouse(config, registers, states, snapshot, { ...layout, kamers: layout.kamers.filter((k) => k.id !== tuin.id), apparaten: {} });
    expect(without.zonderRuimte.map((d) => [d.naam, d.voorstel])).toEqual([
      ['Achtertuin', 'Tuin'],
      ['light.zwerver', null],
      ['Droger', null],
    ]);
  });

  it('kent alleen apparaten die er zijn, en de regelgebieden uit de configuratie', () => {
    const known = knownForLayout(config, registers, states);
    expect(known.deviceIds.has('light.sfeerverlichting')).toBe(true);
    expect(known.deviceIds.has('light.woonkamer_alles')).toBe(false);
    expect(known.deviceIds.has('cover.screen_low_speed')).toBe(false);
    expect(known.deviceIds.has('light.badkamer_spot_1')).toBe(false);
    expect([...known.zoneIds]).toEqual(config.zones.map((z) => z.id));
    expect(known.opvolgers?.get('light.badkamer_spot_1')).toBe('light.hue_badkamer');
    expect(known.opvolgers?.get('light.keukentafel_2')).toBe('light.hue_keuken');
    expect(known.opvolgers?.has('light.oude_groep')).toBe(false);
  });

  it('toont een etage zonder kamers als de bewoner hem een naam gaf, en anders niet', () => {
    const empty = { ...layout, etages: { ...layout.etages, e1: '1e verdieping' }, kamers: layout.kamers.filter((k) => k.etage !== 'e1') };
    const named = buildHouse(config, registers, states, snapshot, empty);
    expect(named.etages.find((e) => e.id === 'e1')).toMatchObject({ naam: '1e verdieping', ruimtes: [], lampenAan: 0 });
    const { e1: _e1, ...without } = empty.etages;
    expect(buildHouse(config, registers, states, snapshot, { ...empty, etages: without }).etages.some((e) => e.id === 'e1')).toBe(false);
  });

  it('laat een verborgen apparaat weg uit zijn kamer en uit de telling, en noemt het om terug te zetten', () => {
    const h = buildHouse(config, registers, states, snapshot, { ...layout, verborgen: ['light.sfeerverlichting', 'light.zwerver'] });
    const all = h.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
    expect(all.some((d) => d.id === 'light.sfeerverlichting' || d.id === 'light.zwerver')).toBe(false);
    expect(h.lampenAan).toBe(house.lampenAan - 1);
    expect(h.verborgen).toEqual([
      { id: 'light.sfeerverlichting', naam: 'Sfeer', soort: 'licht' },
      { id: 'light.zwerver', naam: 'Tuinlamp', soort: 'licht' },
    ]);
    expect(lampsFor(h, { soort: 'huis', id: null })).not.toContain('light.sfeerverlichting');
  });

  it('geeft de plek van een lamp die sindsdien is uitgezet door aan zijn groep, zonder zijn naam', () => {
    const later = buildHouse(config, registers, states, snapshot, {
      ...layout,
      apparaten: { ...layout.apparaten, 'light.badkamer_spot_1': { naam: 'Spot', kamer: tuin.id, zone: null } },
    });
    const tuinRoom = later.etages.find((e) => e.id === 'buiten')!.ruimtes.find((r) => r.id === tuin.id)!;
    expect(tuinRoom.apparaten.find((d) => d.id === 'light.hue_badkamer')?.naam).toBe('Badkamer');
  });
});

describe('wit, kleur en scènes (besluit 100)', () => {
  const house = buildHouse(exampleSite, registers, states, snapshot);
  const rooms = house.etages.flatMap((f) => f.ruimtes);
  const wk = rooms.find((r) => r.naam === 'Woonkamer')!;

  it('zegt per lamp wat hij in wit en kleur kan, en hoe hij nu staat', () => {
    const sfeer = wk.apparaten.find((d) => d.id === 'light.sfeerverlichting')!;
    expect(sfeer.licht).toEqual({ wit: { minK: 2000, maxK: 6500 }, kleur: true, kelvin: null, tint: [30, 80] });
    const plaf = wk.apparaten.find((d) => d.id === 'light.woonkamer_plafonniere')!;
    expect(plaf.licht?.kleur).toBe(false);
    expect(plaf.licht?.wit).not.toBeNull();
  });

  it('zet de scènes bij hun ruimte, met de laatst gekozen als actief, en laat een scène zonder ruimte weg', () => {
    // De recentste eerst; actief per Hue-groep; de vaste kleuren bij hun naam.
    expect(wk.scenes).toEqual([
      { id: 'scene.ontspannen', naam: 'Ontspannen', actief: true, groep: null, gebruiktMs: Date.parse('2026-10-05T07:30:00+00:00'), kleuren: ['#ffc059', '#ffe0a8'], plaatje: null, wit: true },
      { id: 'scene.keuken_lezen', naam: 'Lezen', actief: true, groep: 'Keuken', gebruiktMs: Date.parse('2026-10-05T07:00:00+00:00'), kleuren: ['#fdfb9f', '#fffde0'], plaatje: null, wit: true },
    ]);
    expect(rooms.flatMap((r) => r.scenes).map((s) => s.id)).not.toContain('scene.garage_feest');
    // Via het gebied van de Hue-kamer, als de naam niets oplevert.
    expect(rooms.find((r) => r.naam === 'Zolder')?.scenes).toMatchObject([{ id: 'scene.zolderkamer_helder', naam: 'Helder', actief: true, groep: 'Zolderkamer' }]);
  });
});

describe('de duur van een programma (besluit 101)', () => {
  const source = (state: string, unit?: string) =>
    ({
      state: () => state,
      number: () => (Number.isFinite(Number(state)) ? Number(state) : null),
      attr: (_id: string, key: string) => (key === 'unit_of_measurement' ? (unit ?? null) : null),
    }) as unknown as EntitySource;

  it('leest "2:48" van Home Connect, en een getal met een eenheid', () => {
    expect(programMinutes(source('2:48'), 'x')).toBe(168);
    expect(programMinutes(source('0:00'), 'x')).toBeNull();
    expect(programMinutes(source('5400', 's'), 'x')).toBe(90);
    expect(programMinutes(source('95', 'min'), 'x')).toBe(95);
    expect(programMinutes(source('1.5', 'h'), 'x')).toBe(90);
  });
  it('ziet beweging bij de meter van hetzelfde apparaat (15 oktober 2026)', () => {
    const house = buildHouse(config, registers, states, snapshot);
    const meter = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((d) => d.id === 'sensor.bewegingssensor_hal_temperatuur')!;
    expect(meter.meting?.beweging).toEqual({ nu: true, sindsMs: Date.parse('2026-10-15T13:40:00Z') });
  });
});
