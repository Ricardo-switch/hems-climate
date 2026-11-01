/**
 * Klaar om, legionella en vol bij de boiler en de jacuzzi (besluit 186): wat de
 * dienst onthoudt in `warmtebuffers.json`, en de goedkoopste uren.
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HeatStore, SiteConfig } from '../src/core/model.js';
import { BUFFERS_FILE, BufferStore, cheapWindows } from '../src/web/warmtebuffers.js';
import { exampleSite } from './site.js';

// Vrijdag 28 augustus 2026, 14:00 in Amsterdam.
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const UUR = 3_600_000;

const jacuzzi: HeatStore = {
  id: 'jacuzzi', name: 'Jacuzzi', kind: 'jacuzzi', control: 'setpoint',
  actuator: { adapter: 'homeassistant', id: 'climate.spa' },
  temperature: { adapter: 'homeassistant', id: 'climate.spa', attribute: 'current_temperature' },
  estimatedW: 2200, minC: 30, sunC: 38, heatRateCPerHour: 1.5,
};
const boiler: HeatStore = {
  id: 'boiler', name: 'Boiler', kind: 'boiler', control: 'setpoint',
  actuator: { adapter: 'homeassistant', id: 'water_heater.boiler' },
  temperature: { adapter: 'homeassistant', id: 'water_heater.boiler', attribute: 'current_temperature' },
  estimatedW: 500, minC: 50, sunC: 65, heatRateCPerHour: 6, legionellaC: 60,
};
const config: SiteConfig = { ...exampleSite, heatStores: [jacuzzi, boiler] };

async function store(now = NOW) {
  const logDir = await mkdtemp(join(tmpdir(), 'buffers-'));
  let t = now;
  const s = new BufferStore({ logDir, config, now: () => t });
  await s.load();
  return { s, logDir, zet: (ms: number) => (t = ms) };
}

describe('klaar om bij de jacuzzi (besluit 186)', () => {
  it('bewaart wanneer en hoe warm, en geeft het de kern', async () => {
    const { s, logDir } = await store();
    const r = await s.set({ id: 'jacuzzi', klaarOm: NOW + 30 * UUR, doelC: 39 });
    expect(r).toEqual({ ok: true, id: 'jacuzzi', klaarOm: { atMs: NOW + 30 * UUR, targetC: 39 } });
    expect(s.extra['jacuzzi']?.readyBy).toEqual({ atMs: NOW + 30 * UUR, targetC: 39 });
    const opnieuw = new BufferStore({ logDir, config, now: () => NOW });
    await opnieuw.load();
    expect(opnieuw.extra['jacuzzi']?.readyBy?.targetC).toBe(39);
    expect(JSON.parse(await readFile(join(logDir, BUFFERS_FILE), 'utf-8'))).toMatchObject({ versie: 1 });
    // Zonder doel: de badtemperatuur op zon.
    expect(await s.set({ id: 'jacuzzi', klaarOm: NOW + UUR })).toMatchObject({ ok: true, klaarOm: { targetC: 38 } });
    expect(await s.set({ id: 'jacuzzi', klaarOm: null })).toEqual({ ok: true, id: 'jacuzzi', klaarOm: null });
    expect(s.extra['jacuzzi']?.readyBy).toBeNull();
  });

  it('weigert wat niet kan', async () => {
    const { s } = await store();
    expect(await s.set({ id: 'zwembad', klaarOm: NOW + UUR })).toMatchObject({ ok: false, status: 404 });
    expect(await s.set({ id: 'jacuzzi', klaarOm: NOW - UUR })).toMatchObject({ ok: false, status: 400 });
    expect(await s.set({ id: 'jacuzzi', klaarOm: NOW + 8 * 24 * UUR })).toMatchObject({ ok: false, status: 400 });
    expect(await s.set({ id: 'jacuzzi', klaarOm: NOW + UUR, doelC: 41 })).toMatchObject({ ok: false, status: 400 });
  });

  it('vergeet klaar om als het voorbij is, en onthoudt legionella', async () => {
    const { s, zet } = await store();
    await s.set({ id: 'jacuzzi', klaarOm: NOW + UUR });
    zet(NOW + 2 * UUR);
    await s.observe([{ id: 'boiler', state: 'full', reason: 'target_reached', heating: false, temperatureC: 61 }]);
    expect(s.extra['jacuzzi']?.readyBy).toBeNull();
    expect(s.extra['boiler']?.legionellaAtMs).toBe(NOW + 2 * UUR);
  });
});

describe('de goedkoopste uren (besluit 186)', () => {
  it('zijn de daluren, alleen met een daltarief', () => {
    expect(cheapWindows(NOW, 'Europe/Amsterdam', { stroomDal: null })).toEqual([]);
    const w = cheapWindows(NOW, 'Europe/Amsterdam', { stroomDal: 0.2, dalUren: 'nl' });
    // Vrijdag 23:00 tot maandag 7:00 is dal; binnen 36 uur valt alles na 23:00 erin.
    expect(w[0]).toEqual({ fromMs: Date.UTC(2026, 7, 28, 21, 0, 0), toMs: NOW + 36 * UUR });
  });
});

describe('de boiler en de jacuzzi op Apparaten (besluit 186)', () => {
  it('zegt in gewone woorden wat hij zou doen, met klaar om en de keuzes', async () => {
    const { residentBuffers } = await import('../src/web/buffers-bewoner.js');
    const [j, b] = residentBuffers(
      config,
      [
        { id: 'jacuzzi', state: 'waiting', reason: 'surplus_insufficient', heating: false, temperatureC: 31.04, targetC: 38, readyByMs: NOW + 30 * UUR, latestStartMs: NOW + 24 * UUR },
        { id: 'boiler', state: 'would_heat', reason: 'surplus_available', heating: true, temperatureC: 58, targetC: 65 },
      ],
      NOW,
    );
    expect(j).toMatchObject({ kop: 'Wacht op zon', temperatuurC: 31, klaarOm: { tekst: 'za 20:00', doelC: 38 }, bron: null });
    expect(j!.zin).toBe('Hij verwarmt zodra er zon over is. Komt die niet, dan begint hij om 14:00, op tijd voor za 20:00.');
    // Vrijdag 14:00: vanavond, morgen, en zondag.
    expect(j!.keuzes.map((k) => k.tekst)).toEqual(['Vanavond', 'Morgen', 'zo 20:00']);
    expect(b).toMatchObject({ kop: 'Zou nu opwarmen op zon', zin: 'Er is zon over: hij zou nu verwarmen naar 65°.', bron: 'zon', keuzes: [] });
  });
});
