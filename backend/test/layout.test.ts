/**
 * De indeling van het huis (besluit 96): een smalle deur, dus elke regel getoetst.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { LAYOUT_FILE, LayoutStore, validateLayout, type LayoutKnown } from '../src/web/layout.js';

const known: LayoutKnown = {
  deviceIds: new Set(['nest', 'light.sfeerverlichting', 'cover.screen']),
  zoneIds: new Set(['woonkamer', 'zolder']),
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

  it('weigert wat niet klopt, met een reden', () => {
    const bad: [string, unknown][] = [
      ['geen object', 'hoi'],
      ['verkeerde versie', { ...good, versie: 2 }],
      ['onbekende etage', { ...good, etages: { kelder: 'Kelder' } }],
      ['kamer op een onbekende etage', { ...good, kamers: [{ ...good.kamers[0], etage: 'kelder' }] }],
      ['dubbel kamer-id', { ...good, kamers: [good.kamers[0], good.kamers[0]], apparaten: {} }],
      ['ongeldig id', { ...good, kamers: [{ ...good.kamers[0], id: 'Woon Kamer!' }], apparaten: {} }],
      ['lege naam', { ...good, kamers: [{ ...good.kamers[0], naam: '   ' }] }],
      ['onbekend regelgebied', { ...good, kamers: [{ ...good.kamers[0], regelzone: 'kelder' }] }],
      ['regelgebied twee keer', { ...good, kamers: [good.kamers[0], { ...good.kamers[1], regelzone: 'woonkamer' }] }],
      ['onbekend apparaat', { ...good, apparaten: { 'light.bestaat_niet': { kamer: 'hal', zone: null } } }],
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
