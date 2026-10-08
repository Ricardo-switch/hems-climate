/**
 * Het huis als navigatie (ONTWERP §4, besluiten 95 en 96): etages, kamers met
 * hun zones en de apparaten erin, uit een voorstel of een vastgelegde indeling.
 */

import { describe, expect, it } from 'vitest';

import { programMinutes } from '../src/adapters/homeassistant/mapping.js';
import type { EntitySource } from '../src/adapters/homeassistant/source.js';

import { buildHouse, knownForLayout, lampsFor, outsideFromNames, proposeLayout } from '../src/web/house.js';
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
    expect(wk.status?.zin).toContain('heeft niets nodig');
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
    expect(ac.klimaat).toEqual({ kanKoelen: true, kanVerwarmen: true, doelC: 22, actie: 'koelt' });
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
});
