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
import { FunctiesStore, aangebeld, controleer, functiesGevonden, functiesVoorstel, getoondeCameras, volledig, type Functies } from '../src/web/functies.js';

const entities: HaRegistryEntity[] = [
  { entity_id: 'camera.camera_oprit_duidelijk', platform: 'reolink', device_id: 'reo1', translation_key: 'main' },
  { entity_id: 'camera.camera_oprit_vloeiend', platform: 'reolink', device_id: 'reo1', translation_key: 'sub' },
  { entity_id: 'camera.deurbel_vloeiend', platform: 'reolink', device_id: 'reo2', translation_key: 'sub' },
  { entity_id: 'camera.buienradar', platform: 'buienradar', translation_key: null },
  // Reolink: een melder voor een bezoeker, op het apparaat van de deurbel.
  { entity_id: 'binary_sensor.deurbel_bezoeker', platform: 'reolink', device_id: 'reo2', translation_key: 'visitor' },
  { entity_id: 'binary_sensor.deurbel_persoon', platform: 'reolink', device_id: 'reo2', translation_key: 'person', original_device_class: 'motion' },
  // Ring: een gebeurtenis met de klasse deurbel, zonder camera in Home Assistant.
  { entity_id: 'event.voordeur_ding', platform: 'ring', device_id: 'ring1', original_device_class: 'doorbell' },
  // Iets wat alleen zo heet: een kandidaat, geen zekerheid.
  { entity_id: 'binary_sensor.deurbel_knop', platform: 'zha', device_id: 'zig1' },
  { entity_id: 'binary_sensor.voordeur_bel', platform: 'zha', device_id: 'zig3' },
  // Een sensor die "Spring" heet is geen deurbel.
  { entity_id: 'binary_sensor.spring_sensor', platform: 'zha', device_id: 'zig2' },
  // Beweging op de deurbel, zonder sleutel van het merk: geen bel.
  { entity_id: 'binary_sensor.deurbel_beweging', platform: 'reolink', device_id: 'reo2', original_device_class: 'motion' },
  // Een mens of een huisdier gezien bij de deurbel: ook geen bel.
  { entity_id: 'binary_sensor.deurbel_mens', platform: 'reolink', device_id: 'reo2' },
  { entity_id: 'binary_sensor.deurbel_pet', platform: 'reolink', device_id: 'reo2', original_device_class: 'motion' },
  // Dezelfde camera via de Synology: een tweede beeld, geen tweede camera.
  { entity_id: 'camera.camera_oprit', platform: 'synology_dsm', device_id: 'syn1' },
];
const devices = [
  { id: 'reo1', area_id: null, name: 'Camera Oprit' },
  { id: 'reo2', area_id: null, name: 'Deurbel' },
  { id: 'ring1', area_id: null, name: 'Voordeur' },
  { id: 'zig1', area_id: null, name: 'Knop' },
  { id: 'zig2', area_id: null, name: 'Spring' },
  { id: 'syn1', area_id: null, name: 'Camera Oprit' },
];
const g = functiesGevonden(entities, devices, new Map());
const state = (entity_id: string, s: string): HaEntityState => ({ entity_id, state: s, attributes: {}, last_changed: '', last_updated: '' }) as unknown as HaEntityState;

describe('camera’s en de deurbel vinden (besluit 109)', () => {
  it('geeft per camera zijn beelden, met het lichtste als voorkeur, zonder het buienradarplaatje', () => {
    // Met eigen beelden van het merk geen beeld via de Synology (besluit 130).
    expect(g.cameras).toEqual([
      {
        naam: 'Camera Oprit',
        beelden: [
          { id: 'camera.camera_oprit_duidelijk', naam: 'scherp', voorkeur: false },
          { id: 'camera.camera_oprit_vloeiend', naam: 'vloeiend', voorkeur: true },
        ],
        melders: [],
      },
      // De bewegingsmelders op hetzelfde apparaat (besluit 201), met wat ze herkennen.
      {
        naam: 'Deurbel',
        beelden: [{ id: 'camera.deurbel_vloeiend', naam: 'vloeiend', voorkeur: true }],
        melders: [
          { id: 'binary_sensor.deurbel_persoon', soort: 'persoon' },
          { id: 'binary_sensor.deurbel_beweging', soort: 'beweging' },
          { id: 'binary_sensor.deurbel_pet', soort: 'dier' },
        ],
      },
    ]);
  });

  it('vindt de deurbel van verschillende merken, en wat er alleen zo heet als kandidaat', () => {
    expect(g.melders.map((m) => [m.id, m.zeker, m.camera])).toEqual([
      ['binary_sensor.deurbel_bezoeker', true, 'camera.deurbel_vloeiend'],
      ['event.voordeur_ding', true, null],
      ['binary_sensor.deurbel_knop', false, null],
      ['binary_sensor.voordeur_bel', false, null],
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
    // Zonder weerbron in Home Assistant: Open-Meteo (besluit 127); licht staat aan tot je het uitzet.
    expect(controleer(goed, g)).toEqual({ ok: true, functies: { ...goed, weer: { bron: 'open-meteo', uren: true }, licht: { bedienen: true }, schermen: { bedienen: true }, praten: { taalmodel: null, bedienen: true, spraak: null }, meldingen: { batterij: 10, filter: 10 } } });
    expect(getoondeCameras(goed)).toEqual(new Set(['camera.camera_oprit_duidelijk']));
  });

  it('kiest alleen een AI-taak die Home Assistant kent als taalmodel (besluit 148)', () => {
    const st = (entity_id: string, state = 'unknown') => ({ entity_id, state, attributes: { friendly_name: 'Google AI Task' }, last_changed: '', last_updated: '' });
    const metModel = functiesGevonden(entities, devices, new Map([['ai_task.google_ai_task', st('ai_task.google_ai_task')], ['ai_task.weg', st('ai_task.weg', 'unavailable')], ['conversation.google', st('conversation.google')]]));
    expect(metModel.taalmodellen).toEqual([{ id: 'ai_task.google_ai_task', naam: 'Google AI Task' }]);
    // Standaard uit: het vaste antwoord werkt altijd.
    expect(functiesVoorstel(metModel).praten).toEqual({ taalmodel: null, bedienen: true, spraak: null });
    expect(controleer({ ...goed, praten: { taalmodel: 'ai_task.google_ai_task', bedienen: false } }, metModel)).toMatchObject({ ok: true, functies: { praten: { taalmodel: 'ai_task.google_ai_task', bedienen: false } } });
    expect(controleer({ ...goed, praten: { taalmodel: 'conversation.google', bedienen: true } }, metModel).ok).toBe(false);
    expect(controleer({ ...goed, praten: { taalmodel: 'ai_task.weg', bedienen: true } }, metModel).ok).toBe(false);
    expect(controleer({ ...goed, praten: { taalmodel: null } }, metModel).ok).toBe(false);
  });

  it('kiest alleen een spraakassistent die Home Assistant kent (besluit 150)', () => {
    const metSpraak = { ...g, spraakassistenten: [{ id: 'smart_climate', naam: 'Smart Climate', wekwoord: 'he_huis', spraakNaarTekst: true, taal: 'nl', voorkeur: false }] };
    expect(controleer({ ...goed, praten: { taalmodel: null, bedienen: true, spraak: 'smart_climate' } }, metSpraak)).toMatchObject({ ok: true, functies: { praten: { spraak: 'smart_climate' } } });
    expect(controleer({ ...goed, praten: { taalmodel: null, bedienen: true, spraak: 'bestaat_niet' } }, metSpraak).ok).toBe(false);
    // Een ouder bestand zonder spraak: die van Home Assistant zelf.
    expect(volledig({ ...goed, praten: { taalmodel: null, bedienen: true } }, metSpraak).praten.spraak).toBeNull();
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

  it('neemt een drempel voor meldingen aan uit de keuzes, of nooit (besluit 149)', () => {
    expect(controleer({ ...goed, meldingen: { batterij: 20, filter: null } }, g)).toMatchObject({ ok: true, functies: { meldingen: { batterij: 20, filter: null } } });
    expect(controleer({ ...goed, meldingen: { batterij: 15, filter: 10 } }, g).ok).toBe(false);
    expect(controleer({ ...goed, meldingen: { batterij: 10 } }, g).ok).toBe(false);
    // Een ouder bestand zonder drempels: 10%, zoals het was.
    expect(volledig(goed, g).meldingen).toEqual({ batterij: 10, filter: 10 });
  });

  it('toont geen camera als de camera’s uit staan', () => {
    expect(getoondeCameras({ ...goed, cameras: { aan: false, lijst: ['camera.camera_oprit_duidelijk'] } })).toEqual(new Set());
  });
});

describe('weer en licht als functie (besluit 111)', () => {
  const metWeer = functiesGevonden(
    [
      ...entities,
      { entity_id: 'weather.forecast_home', platform: 'met' },
      { entity_id: 'sensor.sunchance_1d', platform: 'buienradar', translation_key: 'sunchance_1d' },
      // Buienradar als weerentiteit, en het weer van een Formule 1-circuit: niet in de keuze.
      { entity_id: 'weather.buienradar', platform: 'buienradar' },
      { entity_id: 'weather.marina_bay', platform: 'f1_sensor' },
    ],
    devices,
    new Map(),
  );
  const goed = { ...functiesVoorstel(metWeer) };

  it('vindt Buienradar en elke weerentiteit, en stelt Buienradar voor', () => {
    expect(metWeer.weerbronnen).toEqual([{ id: 'buienradar', naam: 'Buienradar' }, { id: 'weather.forecast_home', naam: 'weather.forecast_home' }, { id: 'open-meteo', naam: 'Open-Meteo (via internet)' }]);
    expect(goed.weer).toEqual({ bron: 'buienradar', uren: true });
    expect(goed.licht).toEqual({ bedienen: true });
  });

  it('neemt een andere weerbron aan, en licht uit; weigert een onbekende bron', () => {
    expect(controleer({ ...goed, weer: { bron: 'weather.forecast_home' }, licht: { bedienen: false } }, metWeer)).toMatchObject({ ok: true, functies: { weer: { bron: 'weather.forecast_home' }, licht: { bedienen: false } } });
    expect(controleer({ ...goed, weer: { bron: 'weather.van_de_buren' } }, metWeer).ok).toBe(false);
    expect(controleer({ ...goed, licht: { bedienen: 'ja' } }, metWeer).ok).toBe(false);
    // Open-Meteo kan altijd, en de verwachting per uur kan uit (besluit 127).
    expect(controleer({ ...goed, weer: { bron: 'open-meteo', uren: false } }, metWeer)).toMatchObject({ ok: true, functies: { weer: { bron: 'open-meteo', uren: false } } });
    expect(controleer({ ...goed, weer: { bron: 'open-meteo', uren: 'ja' } }, metWeer).ok).toBe(false);
  });

  it('vult een ouder bestand aan met het voorstel', () => {
    const oud: Functies = { versie: 1, cameras: { aan: true, lijst: [] }, deurbel: { aan: false, melder: null, camera: null, schermAan: true, seconden: 120 } };
    expect(volledig(oud, metWeer)).toMatchObject({ weer: { bron: 'buienradar' }, licht: { bedienen: true } });
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
