/**
 * Het huis als navigatie (ONTWERP §4, besluiten 95 en 96): etages, kamers met
 * hun zones en de apparaten erin, uit een voorstel of een vastgelegde indeling.
 */

import { describe, expect, it } from 'vitest';

import { buildHouse, knownForLayout, proposeLayout } from '../src/web/house.js';
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
    expect(house.lampenAan).toBe(3);
  });

  it('zet wat in geen gebied hangt bij "nog in te delen", met de kamer van zijn groep als voorstel', () => {
    const tuin = proposeLayout(config, registers, states).kamers.find((k) => k.naam === 'Tuin')!;
    expect(house.zonderRuimte).toEqual([
      { id: 'light.zwerver', naam: 'light.zwerver', soort: 'licht', voorstel: null, groepen: ['Tuin alles'], voorstelKamer: tuin.id },
    ]);
  });

  it('toont lampgroepen niet als lamp, maar zegt wel in welke groep een lamp zit, ook bij een Hue-kamer', () => {
    const all = house.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
    expect(all.some((d) => d.id === 'light.hue_sfeer' || d.id === 'light.tuin_alles')).toBe(false);
    expect(all.find((d) => d.id === 'light.sfeerverlichting')!.groepen).toEqual(['Sfeer']);
    expect(all.find((d) => d.id === 'light.woonkamer_plafonniere')!.groepen).toEqual(['Woonkamer alles']);
    expect(house.lampgroepen.map((g) => [g.naam, g.hue])).toEqual([
      ['Woonkamer alles', false],
      ['Tuin alles', false],
      ['Keuken', true],
      ['Sfeer', true],
    ]);
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
    expect(house.etages.find((e) => e.id === 'buiten')!.ruimtes[0]!.apparaten.map((d) => d.naam)).toContain('Tuinlamp');
  });

  it('zet een apparaat terug bij "nog in te delen" als zijn kamer weg is, met het gebied als voorstel', () => {
    const without = buildHouse(config, registers, states, snapshot, { ...layout, kamers: layout.kamers.filter((k) => k.id !== tuin.id), apparaten: {} });
    expect(without.zonderRuimte.map((d) => [d.naam, d.voorstel])).toEqual([
      ['Achtertuin', 'Tuin'],
      ['light.zwerver', null],
    ]);
  });

  it('kent alleen apparaten die er zijn, en de regelgebieden uit de configuratie', () => {
    const known = knownForLayout(config, registers, states);
    expect(known.deviceIds.has('light.sfeerverlichting')).toBe(true);
    expect(known.deviceIds.has('light.woonkamer_alles')).toBe(false);
    expect(known.deviceIds.has('cover.screen_low_speed')).toBe(false);
    expect([...known.zoneIds]).toEqual(config.zones.map((z) => z.id));
  });
});
