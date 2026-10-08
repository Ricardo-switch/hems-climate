/**
 * De camera's bekijken (besluit 106): welke camera's het huis toont, en waar
 * de dienst het beeld bij Home Assistant ophaalt.
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { findCameras, httpBase } from '../src/web/camera.js';

const cam = (entity_id: string, platform: string, device_id: string, translation_key: string | null, disabled_by: string | null = null): HaRegistryEntity => ({ entity_id, platform, device_id, translation_key, disabled_by });

describe('de camera’s van het huis', () => {
  const entities = [
    cam('camera.camera_oprit_duidelijk', 'reolink', 'reo1', 'main'),
    cam('camera.camera_oprit_vloeiend', 'reolink', 'reo1', 'sub'),
    cam('camera.camera_oprit_foto_s_vloeiend', 'reolink', 'reo1', 'snapshots_sub', 'integration'),
    // Dezelfde camera nog eens, via de Synology-NAS: telt niet dubbel.
    cam('camera.camera_oprit', 'synology_dsm', 'syn1', null),
    cam('camera.deurbel_vloeiend', 'reolink', 'reo2', 'sub'),
    { entity_id: 'camera.buienradar', platform: 'buienradar', translation_key: null },
  ];
  const devices = [
    { id: 'reo1', area_id: null, name: 'Camera Oprit' },
    { id: 'syn1', area_id: null, name: 'Camera Oprit' },
    { id: 'reo2', area_id: null, name: 'Deurbel' },
  ];

  it('neemt per camera de vloeiende stream, en laat dubbele en het buienradarplaatje weg', () => {
    const found = findCameras(entities, devices, new Map<string, HaEntityState>());
    expect(found).toEqual([
      { entityId: 'camera.camera_oprit_vloeiend', naam: 'Camera Oprit', deviceId: 'reo1' },
      { entityId: 'camera.deurbel_vloeiend', naam: 'Deurbel', deviceId: 'reo2' },
    ]);
  });
});

describe('het adres van Home Assistant voor het beeld', () => {
  it('maakt van het websocket-adres een http-adres', () => {
    expect(httpBase('ws://homeassistant.local:8123/api/websocket')).toBe('http://homeassistant.local:8123');
    expect(httpBase('https://ha.example.nl/')).toBe('https://ha.example.nl');
    expect(httpBase('wss://ha.example.nl/api/websocket')).toBe('https://ha.example.nl');
    // De add-on: de Supervisor proxyt Home Assistant op /core.
    expect(httpBase('ws://supervisor/core/websocket')).toBe('http://supervisor/core');
  });
});
