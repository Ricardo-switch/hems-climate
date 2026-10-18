/**
 * Thuis naar eigen smaak (besluit 162): wat de dienst bewaart, voor wie, en
 * wat hij weigert.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { STANDAARD_TEL, STANDAARD_WAND, VOORKEUREN_FILE, VoorkeurenStore, leesFavorieten, leesKaarten } from '../src/web/voorkeuren.js';

const ricardo = { userId: 'u-ricardo', magWand: true };
const shira = { userId: 'u-shira', magWand: false };

describe('kaarten en favorieten (besluit 162)', () => {
  it('kent alleen bestaande kaarten, elk één keer', () => {
    expect(leesKaarten(['gevoel', 'kamers'], 'tel')).toEqual({ ok: true, kaarten: ['gevoel', 'kamers'] });
    expect(leesKaarten(['kamers', 'kamers'], 'tel').ok).toBe(false);
    expect(leesKaarten(['zwembad'], 'tel').ok).toBe(false);
    expect(leesKaarten('kamers', 'tel').ok).toBe(false);
  });

  it('houdt de wand binnen vier vakken, zonder de kamers en Straks', () => {
    expect(leesKaarten(['vandaag', 'apparaat', 'gevoel'], 'wand').ok).toBe(true);
    expect(leesKaarten(['vandaag', 'apparaat', 'gevoel', 'morgen'], 'wand')).toEqual({ ok: false, reden: 'de wand heeft 4 vakken; dit zijn er 5' });
    expect(leesKaarten(['kamers'], 'wand').ok).toBe(false);
    expect(leesKaarten(['straks'], 'wand').ok).toBe(false);
  });

  it('neemt hooguit vier favorieten, een lamp of een scène', () => {
    expect(leesFavorieten([{ soort: 'lamp', id: 'light.eettafel' }, { soort: 'scene', id: 'scene.film' }]).ok).toBe(true);
    expect(leesFavorieten(['a', 'b', 'c', 'd', 'e'].map((x) => ({ soort: 'lamp', id: `light.${x}` }))).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'scene', id: 'light.eettafel' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'schakelaar', id: 'switch.droger' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'lamp', id: 'light.a' }, { soort: 'lamp', id: 'light.a' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'lamp', id: 'Light A' }]).ok).toBe(false);
  });
});

describe('VoorkeurenStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hems-voorkeuren-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('begint zoals Thuis altijd was', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    const v = store.view(shira);
    expect(v.tel).toEqual({ kaarten: STANDAARD_TEL, favorieten: [] });
    expect(v.wand).toEqual({ kaarten: STANDAARD_WAND, favorieten: [], magAanpassen: false });
    expect(v.ruimte).toBe(4);
  });

  it('bewaart de telefoon per account, en leest het terug na een herstart', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    const uit = await store.save({ plek: 'tel', kaarten: ['gevoel', 'kamers'], favorieten: [{ soort: 'lamp', id: 'light.eettafel' }] }, ricardo);
    expect(uit.ok).toBe(true);
    expect(store.view(ricardo).tel.kaarten).toEqual(['gevoel', 'kamers']);
    // Shira houdt haar eigen Thuis.
    expect(store.view(shira).tel).toEqual({ kaarten: STANDAARD_TEL, favorieten: [] });
    // Alleen de favorieten veranderen laat de kaarten staan.
    await store.save({ plek: 'tel', favorieten: [] }, ricardo);
    expect(store.view(ricardo).tel).toEqual({ kaarten: ['gevoel', 'kamers'], favorieten: [] });

    const opnieuw = new VoorkeurenStore(dir);
    await opnieuw.load();
    expect(opnieuw.view(ricardo).tel.kaarten).toEqual(['gevoel', 'kamers']);
    expect(JSON.parse(await readFile(join(dir, VOORKEUREN_FILE), 'utf-8')).versie).toBe(1);
  });

  it('laat de wand alleen aanpassen door wie dat mag, en dan voor iedereen', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect(await store.save({ plek: 'wand', kaarten: ['favorieten'] }, shira)).toEqual({ ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' });
    expect((await store.save({ plek: 'wand', kaarten: ['vandaag', 'favorieten'], favorieten: [{ soort: 'scene', id: 'scene.film' }] }, ricardo)).ok).toBe(true);
    expect(store.view(shira).wand.kaarten).toEqual(['vandaag', 'favorieten']);
    expect(store.view(shira).wand.favorieten).toEqual([{ soort: 'scene', id: 'scene.film' }]);
  });

  it('weigert wat niet klopt, en verandert dan niets', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect((await store.save({ plek: 'keuken', kaarten: [] }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel' }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel', kaarten: ['kamers'], favorieten: 'alles' }, ricardo)).ok).toBe(false);
    expect(store.view(ricardo).tel.kaarten).toEqual(STANDAARD_TEL);
  });

  it('begint opnieuw bij een kapot bestand', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, VOORKEUREN_FILE), '{ kapot', 'utf-8');
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect(store.view(ricardo).tel.kaarten).toEqual(STANDAARD_TEL);
  });
});
