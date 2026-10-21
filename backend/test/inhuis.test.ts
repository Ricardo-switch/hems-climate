/**
 * Welke veranderingen het huis raken, en wat er mis is aan een token (besluit
 * 180: los uit main.ts, en daardoor nu te toetsen).
 */

import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { tokenComplaint } from '../src/env.js';
import { inHouse, snelInHuis } from '../src/web/inhuis.js';

const st = (entity_id: string, device_class?: string): HaEntityState => ({ entity_id, state: 'on', attributes: device_class ? { device_class } : {}, last_changed: '', last_updated: '' });

describe('wat het huis raakt (besluit 174)', () => {
  it('neemt lampen, schermen, klimaat, beweging, rookmelders en metingen mee, en niet de rest', () => {
    for (const s of [st('light.plafond'), st('cover.screen'), st('climate.airco'), st('binary_sensor.gang', 'motion'), st('binary_sensor.rook', 'smoke'), st('sensor.kamer', 'temperature'), st('sensor.airco_vermogen', 'power'), st('sensor.radiator_klep')]) {
      expect(inHouse(s), s.entity_id).toBe(true);
    }
    for (const s of [st('sensor.internet'), st('binary_sensor.deur', 'door'), st('switch.stekker'), st('person.iemand')]) {
      expect(inHouse(s), s.entity_id).toBe(false);
    }
  });

  it('geeft meteen door wat je bedient of ziet bewegen, en een meting rustig', () => {
    expect(snelInHuis(st('light.plafond'))).toBe(true);
    expect(snelInHuis(st('binary_sensor.gang', 'motion'))).toBe(true);
    expect(snelInHuis(st('sensor.kamer', 'temperature'))).toBe(false);
    expect(snelInHuis(st('sensor.airco_vermogen', 'power'))).toBe(false);
  });
});

describe('een token van Home Assistant', () => {
  it('zegt wat er mis is als het geen JWT is, en niets als het klopt', () => {
    const deel = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(tokenComplaint(`${deel({ typ: 'JWT', alg: 'HS256' })}.${deel({})}.handtekening`)).toBeNull();
    expect(tokenComplaint('alleen.twee')).toContain('2 delen in plaats van 3');
    expect(tokenComplaint(`${deel({ typ: 'iets' })}.x.y`)).toContain('"iets" in plaats van "JWT"');
  });
});
