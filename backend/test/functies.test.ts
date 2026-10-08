/**
 * Camera's en de deurbel als instelling (besluit 109): wat er gevonden wordt,
 * het voorstel, de controle, en wanneer er is aangebeld.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { FunctiesStore, aangebeld, controleer, functiesGevonden, functiesVoorstel, getoondeCameras, type Functies } from '../src/web/functies.js';

const entities: HaRegistryEntity[] = [
  { entity_id: 'camera.camera_oprit_duidelijk', platform: 'reolink', device_id: 'reo1', translation_key: 'main' },
  { entity_id: 'camera.camera_oprit_vloeiend', platform: 'reolink', device_id: 'reo1', translation_key: 'sub' },
  { entity_id: 'camera.deurbel_vloeiend', platform: 'reolink', device_id: 'reo2', translation_key: 'sub' },
  { entity_id: 'camera.buienradar', platform: 'buienradar', translation_key: null },
  // Reolink: een melder voor een bezoeker, op het apparaat van de deurbel.
  { entity_id: 'binary_sensor.deurbel_bezoeker', platform: 'reolink', device_id: 'reo2', translation_key: 'visitor' },
  { entity_id: 'binary_sensor.deurbel_persoon', platform: 'reolink', device_id: 'reo2', translation_key: 'person' },
  // Ring: een gebeurtenis met de klasse deurbel, zonder camera in Home Assistant.
  { entity_id: 'event.voordeur_ding', platform: 'ring', device_id: 'ring1', original_device_class: 'doorbell' },
  // Iets wat alleen zo heet: een kandidaat, geen zekerheid.
  { entity_id: 'binary_sensor.deurbel_knop', platform: 'zha', device_id: 'zig1' },
  // Een sensor die "Spring" heet is geen deurbel.
  { entity_id: 'binary_sensor.spring_sensor', platform: 'zha', device_id: 'zig2' },
];
const devices = [
  { id: 'reo1', area_id: null, name: 'Camera Oprit' },
  { id: 'reo2', area_id: null, name: 'Deurbel' },
  { id: 'ring1', area_id: null, name: 'Voordeur' },
  { id: 'zig1', area_id: null, name: 'Knop' },
  { id: 'zig2', area_id: null, name: 'Spring' },
];
const g = functiesGevonden(entities, devices, new Map());
const state = (entity_id: string, s: string): HaEntityState => ({ entity_id, state: s, attributes: {}, last_changed: '', last_updated: '' }) as unknown as HaEntityState;

describe('camera’s en de deurbel vinden (besluit 109)', () => {
  it('geeft per camera zijn beelden, met het lichtste als voorkeur, zonder het buienradarplaatje', () => {
    expect(g.cameras).toEqual([
      { naam: 'Camera Oprit', beelden: [{ id: 'camera.camera_oprit_duidelijk', naam: 'scherp', voorkeur: false }, { id: 'camera.camera_oprit_vloeiend', naam: 'vloeiend', voorkeur: true }] },
      { naam: 'Deurbel', beelden: [{ id: 'camera.deurbel_vloeiend', naam: 'vloeiend', voorkeur: true }] },
    ]);
  });

  it('vindt de deurbel van verschillende merken, en wat er alleen zo heet als kandidaat', () => {
    expect(g.melders.map((m) => [m.id, m.zeker, m.camera])).toEqual([
      ['binary_sensor.deurbel_bezoeker', true, 'camera.deurbel_vloeiend'],
      ['event.voordeur_ding', true, null],
      ['binary_sensor.deurbel_knop', false, null],
    ]);
  });

  it('stelt elke camera voor, en de deurbel die zeker is en een beeld heeft', () => {
    const v = functiesVoorstel(g);
    expect(v.cameras).toEqual({ aan: true, lijst: ['camera.camera_oprit_vloeiend', 'camera.deurbel_vloeiend'] });
    expect(v.deurbel).toEqual({ aan: true, melder: 'binary_sensor.deurbel_bezoeker', camera: 'camera.deurbel_vloeiend', schermAan: true, seconden: 120 });
  });

  it('stelt zonder deurbel met een beeld geen deurbel voor', () => {
    const zonder = functiesGevonden(entities.filter((e) => e.entity_id !== 'binary_sensor.deurbel_bezoeker'), devices, new Map());
    expect(functiesVoorstel(zonder).deurbel.aan).toBe(false);
  });
});

describe('de keuzes controleren (besluit 109)', () => {
  const goed: Functies = { versie: 1, cameras: { aan: true, lijst: ['camera.camera_oprit_duidelijk'] }, deurbel: { aan: true, melder: 'event.voordeur_ding', camera: 'camera.camera_oprit_vloeiend', schermAan: false, seconden: 60 } };

  it('neemt een ander beeld en een andere melder aan, als Home Assistant ze kent', () => {
    expect(controleer(goed, g)).toEqual({ ok: true, functies: goed });
    expect(getoondeCameras(goed)).toEqual(new Set(['camera.camera_oprit_duidelijk']));
  });

  it('weigert wat Home Assistant niet kent, een deurbel zonder melder, en een rare duur', () => {
    expect(controleer({ ...goed, cameras: { aan: true, lijst: ['camera.bestaat_niet'] } }, g).ok).toBe(false);
    expect(controleer({ ...goed, deurbel: { ...goed.deurbel, melder: 'binary_sensor.deurbel_persoon' } }, g).ok).toBe(false);
    expect(controleer({ ...goed, deurbel: { ...goed.deurbel, melder: null } }, g).ok).toBe(false);
    expect(controleer({ ...goed, deurbel: { ...goed.deurbel, seconden: 5 } }, g).ok).toBe(false);
    expect(controleer({ ...goed, cameras: { aan: true, lijst: ['camera.camera_oprit_duidelijk', 'camera.camera_oprit_duidelijk'] } }, g).ok).toBe(false);
    // Uit mag zonder melder.
    expect(controleer({ ...goed, deurbel: { aan: false, melder: null, camera: null, schermAan: true, seconden: 120 } }, g).ok).toBe(true);
  });

  it('toont geen camera als de camera’s uit staan', () => {
    expect(getoondeCameras({ ...goed, cameras: { aan: false, lijst: ['camera.camera_oprit_duidelijk'] } })).toEqual(new Set());
  });
});

describe('aanbellen (besluit 109)', () => {
  const reolink: Functies = { versie: 1, cameras: { aan: true, lijst: [] }, deurbel: { aan: true, melder: 'binary_sensor.deurbel_bezoeker', camera: 'camera.deurbel_vloeiend', schermAan: true, seconden: 120 } };
  const ring: Functies = { ...reolink, deurbel: { ...reolink.deurbel, melder: 'event.voordeur_ding' } };

  it('is een melder die aangaat, niet een die aan blijft', () => {
    expect(aangebeld(reolink, state('binary_sensor.deurbel_bezoeker', 'on'), state('binary_sensor.deurbel_bezoeker', 'off'))).toBe(true);
    expect(aangebeld(reolink, state('binary_sensor.deurbel_bezoeker', 'on'), state('binary_sensor.deurbel_bezoeker', 'on'))).toBe(false);
    expect(aangebeld(reolink, state('binary_sensor.deurbel_persoon', 'on'), undefined)).toBe(false);
  });

  it('is een gebeurtenis met een nieuw tijdstip, niet een die terugkomt na een storing', () => {
    expect(aangebeld(ring, state('event.voordeur_ding', '2026-10-08T19:00:00Z'), state('event.voordeur_ding', '2026-10-08T18:00:00Z'))).toBe(true);
    expect(aangebeld(ring, state('event.voordeur_ding', '2026-10-08T19:00:00Z'), state('event.voordeur_ding', 'unavailable'))).toBe(false);
  });

  it('belt niet als de deurbel uit staat', () => {
    expect(aangebeld({ ...reolink, deurbel: { ...reolink.deurbel, aan: false } }, state('binary_sensor.deurbel_bezoeker', 'on'), state('binary_sensor.deurbel_bezoeker', 'off'))).toBe(false);
  });
});

describe('het bestand (besluit 109)', () => {
  it('bewaart de keuzes en leest ze na een herstart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-functies-'));
    try {
      const store = new FunctiesStore(dir);
      expect(await store.load()).toBeNull();
      const f = functiesVoorstel(g);
      await store.save(f);
      expect(await new FunctiesStore(dir).load()).toEqual(f);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
