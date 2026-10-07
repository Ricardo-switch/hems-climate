/**
 * De kleuren van een Hue-scène (besluit 100): wat de lampen lieten zien na het
 * aanzetten, of de vaste kleuren van de standaardscènes.
 */

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HouseDevice } from '../src/web/house.js';
import { SceneColorStore, colorsFromLamps, defaultSceneColors, hsCss } from '../src/web/scene-colors.js';

const lamp = (aan: boolean, licht: HouseDevice['licht']): HouseDevice =>
  ({ id: 'light.x', naam: 'x', haNaam: 'x', soort: 'licht', aan, licht }) as unknown as HouseDevice;

describe('de kleuren van een scène', () => {
  it('leest de kleuren van de lampen die aan staan: kleur of tint wit, zonder dubbele', () => {
    const lamps = [
      lamp(true, { wit: null, kleur: true, kelvin: null, tint: [0, 100] }),
      lamp(true, { wit: { minK: 2000, maxK: 6500 }, kleur: false, kelvin: 2700, tint: null }),
      lamp(true, { wit: null, kleur: true, kelvin: null, tint: [0, 100] }),
      lamp(false, { wit: null, kleur: true, kelvin: null, tint: [240, 100] }),
    ];
    expect(colorsFromLamps(lamps)).toEqual(['#ff0000', '#ffa757']);
    expect(hsCss(240, 100)).toBe('#0000ff');
    expect(hsCss(0, 0)).toBe('#ffffff');
  });

  it('kent de standaardscènes van Hue bij hun naam, en verzint niets voor een andere', () => {
    expect(defaultSceneColors('Nachtlampje')).toEqual(['#a2531b', '#5c2d0e']);
    expect(defaultSceneColors('Relax')).toEqual(['#ffc27a', '#ffa757']);
    expect(defaultSceneColors('Tyrell')).toEqual([]);
  });

  it('onthoudt wat hij zag, en houdt het over een herstart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-scenes-'));
    const store = new SceneColorStore(dir);
    await store.load();
    expect(store.colors('scene.tuin_soho', 'Soho')).toEqual([]);
    await store.remember('scene.tuin_soho', ['#ff0000', '#ffa757']);
    const again = new SceneColorStore(dir);
    await again.load();
    expect(again.colors('scene.tuin_soho', 'Soho')).toEqual(['#ff0000', '#ffa757']);
    // Gezien gaat voor de vaste kleuren bij de naam.
    await again.remember('scene.tuin_lezen', ['#123456']);
    expect(again.colors('scene.tuin_lezen', 'Lezen')).toEqual(['#123456']);
  });
});
