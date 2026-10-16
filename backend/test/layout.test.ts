/**
 * De indeling van het huis (besluit 96): een smalle deur, dus elke regel getoetst.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { LAYOUT_FILE, LayoutStore, floorOrder, validateLayout, withLayoutNames, type LayoutKnown } from '../src/web/layout.js';
import { exampleSite } from './site.js';

const known: LayoutKnown = {
  deviceIds: new Set(['nest', 'light.sfeerverlichting', 'cover.screen']),
  zoneIds: new Set(['woonkamer', 'zolder']),
  gevelIds: new Set(['voorgevel', 'achtergevel']),
};

const good = {
  versie: 1,
  etages: { bg: 'Beneden', e2: 'Zolder' },
  kamers: [
    { id: 'woonkamer', naam: 'Woonkamer', etage: 'bg', zones: [{ id: 'keuken', naam: 'Keuken' }], regelzone: 'woonkamer', haGebied: 'woonkamer' },
    { id: 'hal', naam: 'Hal en trap', etage: 'bg', zones: [], regelzone: null, haGebied: null },
  ],
  apparaten: {
    nest: { kamer: 'woonkamer', zone: 'keuken' },
    'light.sfeerverlichting': { naam: '  Sfeer   bij de bank ', kamer: 'woonkamer', zone: null },
  },
};

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

async function dir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-indeling-'));
  cleanups.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('de indeling toetsen', () => {
  it('neemt een goede indeling aan, met opgeschoonde namen en alleen bekende velden', () => {
    const r = validateLayout({ ...good, extra: 'weg ermee' }, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.apparaten['light.sfeerverlichting']!.naam).toBe('Sfeer bij de bank');
    expect('extra' in r.layout).toBe(false);
  });

  it('bewaart de gevel van een scherm (besluit 145)', () => {
    const r = validateLayout({ ...good, apparaten: { ...good.apparaten, 'cover.screen': { kamer: 'woonkamer', zone: null, gevel: 'achtergevel' } } }, known);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.layout.apparaten['cover.screen']!.gevel).toBe('achtergevel');
  });

  it('bewaart de soort van een zone, en de volgorde van zones en kamers (besluit 145)', () => {
    const zones = [{ id: 'zit', naam: 'Hoek bij het raam', soort: 'woonkamer' }, { id: 'keuken', naam: 'Keuken' }];
    const r = validateLayout({ ...good, kamers: [good.kamers[1], { ...good.kamers[0], zones }] }, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.kamers.map((k) => k.id)).toEqual(['hal', 'woonkamer']);
    expect(r.layout.kamers[1]!.zones).toEqual([{ id: 'zit', naam: 'Hoek bij het raam', soort: 'woonkamer' }, { id: 'keuken', naam: 'Keuken' }]);
  });

  it('weigert wat niet klopt, met een reden', () => {
    const bad: [string, unknown][] = [
      ['geen object', 'hoi'],
      ['verkeerde versie', { ...good, versie: 2 }],
      ['onbekende etage', { ...good, etages: { vliering: 'Vliering' } }],
      ['kamer op een onbekende etage', { ...good, kamers: [{ ...good.kamers[0], etage: 'vliering' }] }],
      ['buiten in de volgorde', { ...good, volgorde: ['bg', 'buiten'] }],
      ['een etage twee keer', { ...good, volgorde: ['bg', 'bg'] }],
      ['dubbel kamer-id', { ...good, kamers: [good.kamers[0], good.kamers[0]], apparaten: {} }],
      ['een scherm aan een onbekende gevel', { ...good, apparaten: { ...good.apparaten, 'cover.screen': { kamer: 'woonkamer', zone: null, gevel: 'dakkapel' } } }],
      ['een zone met een onbekende soort', { ...good, kamers: [{ ...good.kamers[0], zones: [{ id: 'keuken', naam: 'Keuken', soort: 'balzaal' }] }, good.kamers[1]] }],
      ['ongeldig id', { ...good, kamers: [{ ...good.kamers[0], id: 'Woon Kamer!' }], apparaten: {} }],
      ['lege naam', { ...good, kamers: [{ ...good.kamers[0], naam: '   ' }] }],
      ['regelgebied twee keer', { ...good, kamers: [good.kamers[0], { ...good.kamers[1], regelzone: 'woonkamer' }] }],
      ['apparaat in een onbekende kamer', { ...good, apparaten: { nest: { kamer: 'kelder', zone: null } } }],
      ['zone die de kamer niet heeft', { ...good, apparaten: { nest: { kamer: 'hal', zone: 'keuken' } } }],
      ['te lange naam', { ...good, apparaten: { nest: { naam: 'x'.repeat(61), kamer: 'hal', zone: null } } }],
    ];
    for (const [label, body] of bad) {
      const r = validateLayout(body, known);
      expect(r.ok, label).toBe(false);
      if (!r.ok) expect(r.reden, label).not.toBe('');
    }
  });

  it('laat een regelgebied dat er niet meer is los, in plaats van alles te weigeren (besluit 142)', () => {
    const r = validateLayout({ ...good, kamers: [{ ...good.kamers[0], regelzone: 'kelder' }, ...good.kamers.slice(1)] }, known);
    expect(r.ok).toBe(true);
    expect(r.ok && r.layout.kamers[0]!.regelzone).toBeNull();
  });

  it('bewaart met welke sensoren een kamer meet, alleen bekende en hooguit zes (besluit 123)', () => {
    const kamer = good.kamers[0]!;
    const met = validateLayout({ ...good, kamers: [{ ...kamer, meten: ['nest', 'cover.screen'] }, ...good.kamers.slice(1)] }, known);
    expect(met.ok && met.layout.kamers[0]!.meten).toEqual(['nest', 'cover.screen']);
    for (const meten of [['sensor.onbekend'], ['nest', 'nest'], 'nest', [1]]) {
      expect(validateLayout({ ...good, kamers: [{ ...kamer, meten }, ...good.kamers.slice(1)] }, known).ok, JSON.stringify(meten)).toBe(false);
    }
    const leeg = validateLayout({ ...good, kamers: [{ ...kamer, meten: [] }, ...good.kamers.slice(1)] }, known);
    expect(leeg.ok && 'meten' in leeg.layout.kamers[0]!).toBe(false);
  });

  it('bewaart wat voor kamer het is, alleen binnen (besluit 119)', () => {
    const kamer = good.kamers[0]!;
    const met = validateLayout({ ...good, kamers: [{ ...kamer, soort: 'kinderkamer' }, ...good.kamers.slice(1)] }, known);
    expect(met.ok && met.layout.kamers[0]!.soort).toBe('kinderkamer');
    // Een onbekende soort weigert; null is: het voorstel uit de naam.
    expect(validateLayout({ ...good, kamers: [{ ...kamer, soort: 'zwembad' }, ...good.kamers.slice(1)] }, known).ok).toBe(false);
    const leeg = validateLayout({ ...good, kamers: [{ ...kamer, soort: null }, ...good.kamers.slice(1)] }, known);
    expect(leeg.ok && 'soort' in leeg.layout.kamers[0]!).toBe(false);
    // Buiten valt het weg.
    const tuin = { id: 'tuin', naam: 'Tuin', etage: 'buiten', zones: [], regelzone: null, haGebied: null, soort: 'keuken' };
    const r = validateLayout({ ...good, kamers: [...good.kamers, tuin] }, known);
    expect(r.ok && 'soort' in r.layout.kamers.find((k) => k.id === 'tuin')!).toBe(false);
  });

  it('bewaart wat een buitenruimte is, alleen op de etage buiten (besluit 109)', () => {
    const tuin = { id: 'tuin', naam: 'Tuin', etage: 'buiten', zones: [], regelzone: null, haGebied: null, buiten: { soort: 'terras', auto: false, tuinhuis: true } };
    const r = validateLayout({ ...good, kamers: [...good.kamers, tuin] }, known);
    expect(r.ok && r.layout.kamers.find((k) => k.id === 'tuin')!.buiten).toEqual({ soort: 'terras', auto: false, tuinhuis: true });
    expect(validateLayout({ ...good, kamers: [...good.kamers, { ...tuin, buiten: { soort: 'voortuin', auto: false, tuinhuis: false } }] }, known).ok).toBe(true);
    // Op een etage binnen valt het weg.
    const binnen = validateLayout({ ...good, kamers: [...good.kamers, { ...tuin, etage: 'bg' }] }, known);
    expect(binnen.ok && 'buiten' in binnen.layout.kamers.find((k) => k.id === 'tuin')!).toBe(false);
    // Een onbekende soort, of geen ja of nee, weigert.
    expect(validateLayout({ ...good, kamers: [...good.kamers, { ...tuin, buiten: { soort: 'kelder', auto: false, tuinhuis: false } }] }, known).ok).toBe(false);
    expect(validateLayout({ ...good, kamers: [...good.kamers, { ...tuin, buiten: { soort: 'tuin', auto: 'ja', tuinhuis: false } }] }, known).ok).toBe(false);
  });

  it('neemt eigen etages aan in een eigen volgorde, en de vaste als voorstel (besluit 112)', () => {
    const vliering = { id: 'vliering', naam: 'Vliering', etage: 'vliering', zones: [], regelzone: null, haGebied: null };
    const r = validateLayout({ ...good, volgorde: ['vliering', 'bg', 'kelder'], etages: { vliering: 'Vliering' }, kamers: [...good.kamers, vliering] }, known);
    expect(r).toMatchObject({ ok: true, layout: { volgorde: ['vliering', 'bg', 'kelder'] } });
    // Een kelder kan ook zonder eigen volgorde: het is een van de vaste etages.
    expect(validateLayout({ ...good, kamers: [{ ...good.kamers[1], etage: 'kelder' }, good.kamers[0]] }, known).ok).toBe(true);
    expect(floorOrder({ kamers: [{ etage: 'kelder' }, { etage: 'bg' }, { etage: 'buiten' }] as never })).toEqual(['e2', 'e1', 'bg', 'kelder']);
    // Een kamer op een etage die niet in de eigen volgorde staat, weigert.
    expect(validateLayout({ ...good, volgorde: ['bg'] , kamers: [{ ...good.kamers[0], etage: 'e1' }] }, known).ok).toBe(false);
  });

  it('bewaart welke etage onder het dak ligt (besluit 111)', () => {
    expect(validateLayout({ ...good, dak: 'e2' }, known)).toMatchObject({ ok: true, layout: { dak: 'e2' } });
    expect(validateLayout({ ...good, dak: 'geen' }, known)).toMatchObject({ ok: true, layout: { dak: 'geen' } });
    expect(validateLayout({ ...good, dak: 'buiten' }, known).ok).toBe(false);
  });

  it('laat een apparaat dat Home Assistant niet meer kent vallen, in plaats van te weigeren', () => {
    const r = validateLayout({ ...good, apparaten: { ...good.apparaten, 'light.uitgezet': { kamer: 'hal', zone: null } } }, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.layout.apparaten)).toEqual(['nest', 'light.sfeerverlichting']);
  });

  it('bewaart welke apparaten verborgen zijn, zonder dubbele en zonder onbekende', () => {
    const r = validateLayout({ ...good, verborgen: ['cover.screen', 'cover.screen', 'light.weg', 7] }, known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.verborgen).toEqual(['cover.screen']);
    expect(validateLayout({ ...good, verborgen: 'cover.screen' }, known).ok).toBe(false);
  });

  it('geeft de plek van een uitgezette lamp door aan de groep die hem nu toont, tenzij die er zelf een heeft', () => {
    const withGroup: LayoutKnown = {
      ...known,
      deviceIds: new Set([...known.deviceIds, 'light.hue_hal']),
      opvolgers: new Map([
        ['light.hal_1', 'light.hue_hal'],
        ['light.hal_2', 'light.hue_hal'],
        ['light.sfeer_1', 'light.sfeerverlichting'],
      ]),
    };
    const r = validateLayout(
      {
        ...good,
        apparaten: {
          ...good.apparaten,
          'light.hal_1': { naam: 'Spot 1', kamer: 'hal', zone: null },
          'light.hal_2': { kamer: 'woonkamer', zone: null },
          'light.sfeer_1': { kamer: 'hal', zone: null },
        },
      },
      withGroup,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.apparaten['light.hue_hal']).toEqual({ kamer: 'hal', zone: null });
    expect(r.layout.apparaten['light.sfeerverlichting']!.kamer).toBe('woonkamer');
    expect('light.hal_1' in r.layout.apparaten).toBe(false);
  });
});

describe('de indeling bewaren', () => {
  it('schrijft naar een eigen bestand en leest het na een herstart terug', async () => {
    const d = await dir();
    const store = new LayoutStore({ logDir: d, known: () => known });
    const r = await store.save(good);
    expect(r.ok).toBe(true);
    const onDisk = JSON.parse(await readFile(join(d, LAYOUT_FILE), 'utf-8')) as { etages: { bg: string } };
    expect(onDisk.etages.bg).toBe('Beneden');

    const again = new LayoutStore({ logDir: d, known: () => known });
    expect(again.current).toBeNull();
    expect((await again.load())?.kamers).toHaveLength(2);
  });

  it('wacht zolang het huis niet uit Home Assistant gelezen is', async () => {
    const store = new LayoutStore({ logDir: await dir(), known: () => null });
    const r = await store.save(good);
    expect(r).toEqual({ ok: false, status: 503, reden: expect.any(String) });
  });

  it('heeft een grens op het tempo', async () => {
    let t = 0;
    const store = new LayoutStore({ logDir: await dir(), known: () => known, now: () => t, perTenMinutes: 2 });
    expect((await store.save(good)).ok).toBe(true);
    expect((await store.save(good)).ok).toBe(true);
    const third = await store.save(good);
    expect(third.ok ? 200 : third.status).toBe(429);
    t = 11 * 60_000;
    expect((await store.save(good)).ok).toBe(true);
  });

  it('bewaart niets als de indeling niet deugt', async () => {
    const d = await dir();
    const store = new LayoutStore({ logDir: d, known: () => known });
    const r = await store.save({ ...good, versie: 3 });
    expect(r.ok).toBe(false);
    await expect(readFile(join(d, LAYOUT_FILE), 'utf-8')).rejects.toThrow();
  });
});

/* Eén naam per kamer (besluit 131): de app noemt een kamer zoals de indeling. */
describe('de namen uit de indeling', () => {
  const kamer = (id: string, naam: string, etage: string, regelzone: string | null) => ({ id, naam, etage, zones: [], regelzone, haGebied: null });
  it('geeft een zone de naam van zijn kamer, en een apparaat zijn eigen naam', () => {
    const layout = {
      kamers: [kamer('k1', 'Beneden', 'bg', 'woonkamer'), kamer('k2', 'Wasruimte', 'e2', 'zolder'), kamer('k3', 'Badkamer', 'e1', 'badkamer')],
      apparaten: { nest: { kamer: 'k1', zone: null, naam: 'Thermostaat' } },
    };
    const c = withLayoutNames(exampleSite, layout);
    expect(c.zones.find((z) => z.id === 'woonkamer')?.name).toBe('Beneden');
    expect(c.zones.find((z) => z.id === 'zolder')?.name).toBe('Wasruimte');
    expect(c.actuators.find((a) => a.id === 'nest')?.name).toBe('Thermostaat');
    // In de volgorde van het huis, de zolder boven.
    expect(c.zones.map((z) => z.id)).toEqual(['zolder', 'badkamer', 'woonkamer']);
    // De regeling zelf houdt zijn eigen configuratie.
    expect(exampleSite.zones.find((z) => z.id === 'woonkamer')?.name).toBe('Woonkamer');
  });

  it('laat de configuratie zoals hij is zonder indeling, of als er niets anders is', () => {
    expect(withLayoutNames(exampleSite, null)).toBe(exampleSite);
    const zelfde = { kamers: exampleSite.zones.map((z, i) => kamer(`k${i}`, z.name, ['e2', 'e1', 'bg'][i] ?? 'bg', z.id)), apparaten: {} };
    const volgorde = withLayoutNames(exampleSite, zelfde).zones.map((z) => z.id);
    expect(volgorde.length).toBe(exampleSite.zones.length);
  });
});
