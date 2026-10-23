/**
 * Een boiler of jacuzzi vinden in Home Assistant, en hem op zon zetten
 * (besluit 186).
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { withConnection, type ConnectionAnswers } from '../src/web/aansluiting.js';
import { findHeatStores } from '../src/web/buffers-vinden.js';
import { defaultStrategies } from '../src/index.js';
import { exampleSitePath } from './site.js';
import { readFileSync } from 'node:fs';

const st = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaEntityState =>
  ({ entity_id, state, attributes, last_changed: '', last_updated: '' }) as HaEntityState;
const ent = (entity_id: string, device_id: string, extra: Partial<HaRegistryEntity> = {}): HaRegistryEntity => ({ entity_id, device_id, ...extra });

describe('een boiler of jacuzzi vinden (besluit 186)', () => {
  it('vindt een Intex via Intex Spa en via Tuya Local, met de meter van de stekker', () => {
    const devices: HaDevice[] = [
      { id: 'd1', area_id: null, name: 'Intex PureSpa', model: 'SB-H20' },
      { id: 'd2', area_id: null, name: 'Spa stekker' },
    ];
    const entities = [
      ent('climate.spa', 'd1', { platform: 'intex_spa' }),
      ent('switch.spa_bubbles', 'd1', { platform: 'intex_spa' }),
      ent('sensor.spa_stekker_power', 'd1', { device_class: 'power' }),
    ];
    const states = new Map([
      ['climate.spa', st('climate.spa', 'heat', { current_temperature: 34 })],
      ['switch.spa_bubbles', st('switch.spa_bubbles', 'off')],
      ['sensor.spa_stekker_power', st('sensor.spa_stekker_power', '2150', { unit_of_measurement: 'W' })],
    ]);
    expect(findHeatStores(states, entities, devices)).toEqual([
      {
        id: 'jacuzzi',
        naam: 'Jacuzzi',
        soort: 'jacuzzi',
        control: 'setpoint',
        actuator: 'climate.spa',
        temperature: { id: 'climate.spa', attribute: 'current_temperature' },
        power: 'sensor.spa_stekker_power',
        estimatedW: 2200,
        minC: 30,
        sunC: 38,
        heatRateCPerHour: 1.5,
      },
    ]);
    // Tuya Local maakt er een water_heater van: nog steeds een jacuzzi, geen boiler.
    const tuya = findHeatStores(new Map([['water_heater.spa', st('water_heater.spa', 'heat', { current_temperature: 31 })]]), [ent('water_heater.spa', 'd1', { platform: 'tuya_local' })], devices);
    expect(tuya[0]).toMatchObject({ soort: 'jacuzzi', actuator: 'water_heater.spa' });
  });

  it('vindt een warmtepompboiler en een boiler aan een stekker, elk één keer', () => {
    const devices: HaDevice[] = [
      { id: 'b1', area_id: null, name: 'Atlantic Explorer' },
      { id: 'b2', area_id: null, name: 'Boiler zolder', name_by_user: 'Boiler zolder' },
    ];
    const entities = [
      ent('water_heater.explorer', 'b1'),
      ent('switch.explorer_boost', 'b1'),
      ent('switch.boiler_zolder', 'b2'),
      ent('sensor.boiler_zolder_vermogen', 'b2'),
      ent('switch.tuinlamp', 'b3'),
    ];
    const states = new Map([
      ['water_heater.explorer', st('water_heater.explorer', 'eco', { current_temperature: 52 })],
      ['switch.explorer_boost', st('switch.explorer_boost', 'off')],
      ['switch.boiler_zolder', st('switch.boiler_zolder', 'on')],
      ['sensor.boiler_zolder_vermogen', st('sensor.boiler_zolder_vermogen', '0', { unit_of_measurement: 'W', device_class: 'power' })],
      ['switch.tuinlamp', st('switch.tuinlamp', 'on')],
    ]);
    const found = findHeatStores(states, entities, devices);
    expect(found.map((b) => [b.id, b.control, b.estimatedW, b.legionellaC ?? null])).toEqual([
      ['boiler', 'setpoint', 500, 60],
      ['boiler-2', 'switch', 2000, null],
    ]);
    expect(found[1]).toMatchObject({ naam: 'Boiler zolder', power: 'sensor.boiler_zolder_vermogen' });
  });

  it('zet een gevonden buffer op zon in de configuratie, en die is geldig', () => {
    const raw = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
    const answers: ConnectionAnswers = {
      versie: 1,
      panelen: { ligging: null, aantal: null, voorkant: null, achterkant: null },
      zekering: null,
      tarief: null,
      fasen: [],
      apparaten: [],
      buffers: [
        { id: 'jacuzzi', naam: 'Jacuzzi', soort: 'jacuzzi', control: 'setpoint', actuator: 'climate.spa', temperature: { id: 'climate.spa', attribute: 'current_temperature' }, estimatedW: 2200, minC: 30, sunC: 38, heatRateCPerHour: 1.5, opZon: true },
        { id: 'boiler', naam: 'Boiler', soort: 'boiler', control: 'switch', actuator: 'switch.boiler', estimatedW: 2000, minC: 50, sunC: 65, heatRateCPerHour: 10, opZon: false },
      ],
    };
    const applied = withConnection(raw, answers);
    expect(applied.toegevoegd).toContain('Jacuzzi op zon');
    const parsed = parseSiteConfig(applied.raw, { knownStrategies: defaultStrategies().ids });
    expect(parsed.ok && parsed.config.heatStores?.map((h) => h.id)).toEqual(['jacuzzi']);
    // En weer uit.
    const uit = withConnection(applied.raw, { ...answers, buffers: [], opZonUit: ['jacuzzi'] });
    expect(uit.raw['heatStores']).toBeUndefined();
    expect(uit.toegevoegd).toContain('Jacuzzi niet meer op zon');
  });
});
