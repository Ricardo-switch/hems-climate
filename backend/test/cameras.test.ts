import { describe, expect, it } from 'vitest';
import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { cameraMelders, camerasNu, laatsteAanUitHistorie } from '../src/web/cameras.js';
import { bewegingSoort, type Functies, type FunctiesGevonden } from '../src/web/functies.js';

/*
 * De kaart Camera's (besluit 201): elke camera met wat hij nu ziet of wanneer
 * het laatst, en de deurbel met wanneer er werd aangebeld.
 */
const g: FunctiesGevonden = {
  cameras: [
    {
      naam: 'Camera oprit',
      beelden: [
        { id: 'camera.camera_oprit_vloeiend', naam: 'vloeiend', voorkeur: true },
        { id: 'camera.camera_oprit_duidelijk', naam: 'scherp', voorkeur: false },
      ],
      melders: [
        { id: 'binary_sensor.camera_oprit_beweging', soort: 'beweging' },
        { id: 'binary_sensor.camera_oprit_persoon', soort: 'persoon' },
        { id: 'binary_sensor.camera_oprit_dier', soort: 'dier' },
      ],
    },
    { naam: 'Deurbel', beelden: [{ id: 'camera.deurbel_vloeiend', naam: 'vloeiend', voorkeur: true }], melders: [{ id: 'binary_sensor.deurbel_beweging', soort: 'beweging' }] },
    { naam: 'Tuin', beelden: [{ id: 'camera.tuin', naam: 'tuin', voorkeur: true }], melders: [] },
  ],
  melders: [],
};
const f: Functies = {
  versie: 1,
  cameras: { aan: true, lijst: ['camera.camera_oprit_vloeiend', 'camera.tuin'] },
  deurbel: { aan: true, melder: 'binary_sensor.deurbel_bezoeker', camera: 'camera.deurbel_vloeiend', schermAan: true, seconden: 120 },
};
const stand = (entity_id: string, state: string, last_changed: string): [string, HaEntityState] => [entity_id, { entity_id, state, attributes: {}, last_changed, last_updated: last_changed } as unknown as HaEntityState];

describe('de kaart Camera’s (besluit 201)', () => {
  it('herkent wat een melder ziet, uit zijn sleutel of naam', () => {
    expect(bewegingSoort('person binary_sensor.camera_oprit_persoon')).toBe('persoon');
    expect(bewegingSoort('vehicle binary_sensor.camera_oprit_voertuig')).toBe('voertuig');
    expect(bewegingSoort(' binary_sensor.deurbel_huisdier')).toBe('dier');
    expect(bewegingSoort('pet binary_sensor.x')).toBe('dier');
    expect(bewegingSoort('motion binary_sensor.camera_oprit_beweging')).toBe('beweging');
    // "carport" is geen auto, en "kattenluik" geen kat.
    expect(bewegingSoort(' binary_sensor.carport_beweging')).toBe('beweging');
  });

  it('zet de deurbel voorop, met wanneer er werd aangebeld, en de rest zoals gekozen', () => {
    const uit = camerasNu(f, g, new Map(), new Map(), 1_000);
    expect(uit.map((c) => [c.id, c.naam, c.deurbel, c.aangebeldMs, c.melders])).toEqual([
      ['camera.deurbel_vloeiend', 'Deurbel', true, 1_000, true],
      ['camera.camera_oprit_vloeiend', 'Camera oprit', false, null, true],
      ['camera.tuin', 'Tuin', false, null, false],
    ]);
    expect(uit[1]!.reserve).toEqual(['camera.camera_oprit_duidelijk']);
  });

  it('zegt wat er nu beweegt, het meest bijzondere eerst, en sinds wanneer', () => {
    const states = new Map([stand('binary_sensor.camera_oprit_beweging', 'on', '2026-10-25T13:46:00Z'), stand('binary_sensor.camera_oprit_persoon', 'on', '2026-10-25T13:46:20Z'), stand('binary_sensor.camera_oprit_dier', 'off', '2026-10-25T06:04:42Z')]);
    const oprit = camerasNu(f, g, states, new Map(), null)[1]!;
    expect(oprit.nu).toBe('persoon');
    expect(oprit.sindsMs).toBe(Date.parse('2026-10-25T13:46:00Z'));
  });

  it('weet wanneer het laatst, en wat de camera toen herkende', () => {
    const t = Date.parse('2026-10-25T13:47:00Z');
    // Een persoon twintig tellen na de beweging: hetzelfde moment, dus een persoon.
    const laatste = new Map([['binary_sensor.camera_oprit_beweging', t], ['binary_sensor.camera_oprit_persoon', t - 20_000], ['binary_sensor.camera_oprit_dier', t - 3_600_000]]);
    const oprit = camerasNu(f, g, new Map(), laatste, null)[1]!;
    expect([oprit.nu, oprit.laatsteMs, oprit.laatsteSoort]).toEqual([null, t, 'persoon']);
    // Zonder iets: niets.
    expect(camerasNu(f, g, new Map(), new Map(), null)[2]!.laatsteMs).toBeNull();
  });

  it('haalt uit de historie wanneer een melder het laatst aanging', () => {
    const uit = laatsteAanUitHistorie({
      'binary_sensor.camera_oprit_beweging': [{ s: 'off', lu: 100 }, { s: 'on', lu: 200 }, { s: 'off', lu: 210 }, { s: 'on', lc: 300 }, { s: 'off', lu: 320 }],
      'binary_sensor.deurbel_beweging': [{ s: 'off', lu: 50 }],
    });
    expect([...uit]).toEqual([['binary_sensor.camera_oprit_beweging', 300_000]]);
    expect(laatsteAanUitHistorie(null).size).toBe(0);
  });

  it('kent de melders van de camera’s die het huis toont, en die van de deurbel', () => {
    expect(cameraMelders(f, g)).toEqual(['binary_sensor.camera_oprit_beweging', 'binary_sensor.camera_oprit_persoon', 'binary_sensor.camera_oprit_dier', 'binary_sensor.deurbel_beweging']);
    expect(cameraMelders({ ...f, cameras: { aan: false, lijst: [] }, deurbel: { ...f.deurbel, aan: false } }, g)).toEqual([]);
  });
});
