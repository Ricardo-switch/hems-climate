/**
 * De thuisbatterij en de auto herkennen in Home Assistant (besluit 182): per
 * apparaat, op wat het meet en wie het levert.
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { vindOpslag } from '../src/web/opslag.js';

type Meting = { id: string; klasse?: string; staat: string; eenheid?: string; naam?: string; platform: string; apparaat: string };

function huis(apparaten: HaDevice[], metingen: Meting[]) {
  const entities: HaRegistryEntity[] = metingen.map((m) => ({ entity_id: m.id, device_id: m.apparaat, platform: m.platform, original_device_class: m.klasse ?? null, original_name: m.naam ?? null }));
  const states = new Map<string, HaEntityState>(
    metingen.map((m) => [m.id, { entity_id: m.id, state: m.staat, attributes: { ...(m.eenheid ? { unit_of_measurement: m.eenheid } : {}), ...(m.naam ? { friendly_name: m.naam } : {}) }, last_changed: '', last_updated: '' }]),
  );
  return vindOpslag({ devices: apparaten, entities }, states);
}

const knop: HaDevice = { id: 'knop', area_id: null, name: 'Knop hal', manufacturer: 'IKEA', model: 'STYRBAR' };
const knopBatterij: Meting = { id: 'sensor.knop_batterij', klasse: 'battery', staat: '80', eenheid: '%', platform: 'zha', apparaat: 'knop' };

describe('de thuisbatterij en de auto (besluit 182)', () => {
  it('vindt niets in een huis zonder, ook niet de batterij van een knop', () => {
    expect(huis([knop], [knopBatterij])).toEqual({ batterij: null, auto: null });
  });

  it('herkent een thuisbatterij, met laden en leveren uit het vermogen', () => {
    const sessy: HaDevice = { id: 'sessy', area_id: null, name: 'Sessy', manufacturer: 'Charged', model: 'Sessy' };
    const met = (w: string) => huis([knop, sessy], [
      knopBatterij,
      { id: 'sensor.sessy_state_of_charge', klasse: 'battery', staat: '78', eenheid: '%', platform: 'sessy', apparaat: 'sessy' },
      { id: 'sensor.sessy_power', klasse: 'power', staat: w, eenheid: 'W', naam: 'Sessy battery power', platform: 'sessy', apparaat: 'sessy' },
    ]);
    expect(met('1800').batterij).toEqual({ id: 'sessy', naam: 'De batterij', pct: 78, vermogenW: 1800, stand: 'laadt' });
    expect(met('-900').batterij).toMatchObject({ vermogenW: -900, stand: 'levert' });
    expect(met('12').batterij).toMatchObject({ stand: 'rust' });
    expect(met('unavailable').batterij).toMatchObject({ pct: 78, vermogenW: null, stand: null });
    expect(met('1800').auto).toBeNull();
  });

  it('leest apart laden en ontladen, en een Powerwall die leveren positief noemt', () => {
    const accu: HaDevice = { id: 'accu', area_id: null, name: 'Thuisbatterij', manufacturer: 'Huawei', model: 'LUNA2000' };
    const twee = huis([accu], [
      { id: 'sensor.luna_soc', klasse: 'battery', staat: '54', eenheid: '%', platform: 'huawei_solar', apparaat: 'accu' },
      { id: 'sensor.luna_charge_power', klasse: 'power', staat: '0', eenheid: 'kW', naam: 'Battery charge power', platform: 'huawei_solar', apparaat: 'accu' },
      { id: 'sensor.luna_discharge_power', klasse: 'power', staat: '0.9', eenheid: 'kW', naam: 'Battery discharge power', platform: 'huawei_solar', apparaat: 'accu' },
    ]);
    expect(twee.batterij).toMatchObject({ pct: 54, vermogenW: -900, stand: 'levert' });
    const pw: HaDevice = { id: 'pw', area_id: null, name: 'Powerwall', manufacturer: 'Tesla', model: 'Powerwall 2' };
    const powerwall = huis([pw], [
      { id: 'sensor.powerwall_charge', klasse: 'battery', staat: '90', eenheid: '%', platform: 'powerwall', apparaat: 'pw' },
      { id: 'sensor.powerwall_battery_power', klasse: 'power', staat: '1.2', eenheid: 'kW', naam: 'Powerwall Battery Power', platform: 'powerwall', apparaat: 'pw' },
    ]);
    expect(powerwall.batterij).toMatchObject({ vermogenW: -1200, stand: 'levert' });
    expect(powerwall.auto).toBeNull();
  });

  it('herkent een auto met zijn lading, bereik, stekker en laden', () => {
    const tesla: HaDevice = { id: 'tesla', area_id: null, name: 'Tesla Model 3', manufacturer: 'Tesla', model: 'Model 3' };
    const op = huis([tesla], [
      { id: 'sensor.model_3_battery', klasse: 'battery', staat: '62', eenheid: '%', platform: 'teslemetry', apparaat: 'tesla' },
      { id: 'sensor.model_3_range', klasse: 'distance', staat: '280', eenheid: 'km', naam: 'Battery range', platform: 'teslemetry', apparaat: 'tesla' },
      { id: 'sensor.model_3_charger_power', klasse: 'power', staat: '3.2', eenheid: 'kW', naam: 'Charger power', platform: 'teslemetry', apparaat: 'tesla' },
      { id: 'binary_sensor.model_3_charge_cable', klasse: 'plug', staat: 'on', platform: 'teslemetry', apparaat: 'tesla' },
      { id: 'binary_sensor.model_3_charging', klasse: 'battery_charging', staat: 'on', platform: 'teslemetry', apparaat: 'tesla' },
    ]);
    expect(op.auto).toEqual({ id: 'tesla', naam: 'Tesla Model 3', pct: 62, aangesloten: true, laadt: true, vermogenW: 3200, bereikKm: 280 });
    // Een auto is geen thuisbatterij, ook al heeft hij een lading in procenten.
    expect(op.batterij).toBeNull();
  });

  it('neemt een laadpaal zonder auto in Home Assistant als de auto', () => {
    const easee: HaDevice = { id: 'easee', area_id: null, name: 'Easee Home', manufacturer: 'Easee', model: 'Home' };
    const paal = (status: string, w: string) => huis([easee], [
      { id: 'sensor.easee_status', staat: status, naam: 'Easee status', platform: 'easee', apparaat: 'easee' },
      { id: 'sensor.easee_power', klasse: 'power', staat: w, eenheid: 'kW', naam: 'Easee power', platform: 'easee', apparaat: 'easee' },
    ]).auto;
    expect(paal('charging', '7.4')).toEqual({ id: 'easee', naam: 'De auto', pct: null, aangesloten: true, laadt: true, vermogenW: 7400, bereikKm: null });
    expect(paal('disconnected', '0')).toMatchObject({ aangesloten: false, laadt: false });
    expect(paal('awaiting_start', '0')).toMatchObject({ aangesloten: true, laadt: false });
  });
});
