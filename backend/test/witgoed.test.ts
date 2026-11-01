/*
 * Witgoed starten (besluit 238): SunArc drukt op de startknop van een droger
 * die op zon wacht, als de regeling zegt dat het moment er is of op een tik,
 * en nooit twee keer kort na elkaar (een tweede druk op start/pauze zet hem
 * weer stil).
 */
import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { isStartCall } from '../src/adapters/homeassistant/client.js';
import type { LiveSnapshot } from '../src/adapters/homeassistant/shadow.js';
import type { SiteConfig } from '../src/core/model.js';
import { NIET_OPNIEUW_MS, Witgoed } from '../src/web/witgoed.js';

const config = {
  deferrables: [{ id: 'droger', name: 'Droger', remoteStart: { id: 'binary_sensor.droger_op_afstand' }, operationState: { id: 'sensor.droger_status' }, estimatedW: 700, latestStart: '15:00' }],
} as unknown as SiteConfig;

const entiteiten = [
  { entity_id: 'binary_sensor.droger_op_afstand', device_id: 'd1' },
  { entity_id: 'sensor.droger_status', device_id: 'd1' },
  { entity_id: 'button.droger_stop', device_id: 'd1' },
  { entity_id: 'button.droger_start_pause', device_id: 'd1' },
  { entity_id: 'button.vaatwasser_start', device_id: 'd2' },
];

function maak(staten: Record<string, string>, aan = true) {
  const gedrukt: string[] = [];
  const nu = { ms: Date.UTC(2026, 10, 2, 12) };
  const w = new Witgoed({
    config: () => config,
    entiteiten: () => entiteiten,
    state: (id) => (staten[id] == null ? undefined : ({ entity_id: id, state: staten[id], attributes: {}, last_changed: '', last_updated: '' }) as HaEntityState),
    druk: async (k) => {
      gedrukt.push(k);
    },
    aan: () => aan,
    nu: () => nu.ms,
  });
  return { w, gedrukt, nu };
}
const besluit = (state: string) => ({ explanation: { deferrables: [{ id: 'droger', state, reason: 'surplus_available' }] } }) as unknown as LiveSnapshot;

describe('witgoed starten (besluit 238)', () => {
  it('vindt de startknop van hetzelfde apparaat, niet de stopknop', () => {
    const { w } = maak({});
    expect(w.knopVan(config.deferrables![0]!)).toBe('button.droger_start_pause');
    expect(w.knoppen()).toEqual(['button.droger_start_pause']);
    expect(maak({}, false).w.knoppen()).toEqual([]);
  });

  it('drukt als de regeling hem zou starten, één keer, en weer na een programma', async () => {
    const { w, gedrukt, nu } = maak({ 'binary_sensor.droger_op_afstand': 'on', 'sensor.droger_status': 'Ready' });
    expect(await w.opBesluit(besluit('would_start'))).toEqual(['droger']);
    expect(await w.opBesluit(besluit('would_start'))).toEqual([]);
    nu.ms += NIET_OPNIEUW_MS - 60_000;
    expect(await w.opBesluit(besluit('would_start'))).toEqual([]);
    await w.opBesluit(besluit('running'));
    expect(await w.opBesluit(besluit('would_start'))).toEqual(['droger']);
    expect(gedrukt).toEqual(['button.droger_start_pause', 'button.droger_start_pause']);
  });

  it('drukt niet zonder op afstand starten, of als het programma al loopt', async () => {
    expect(await maak({ 'binary_sensor.droger_op_afstand': 'off', 'sensor.droger_status': 'Ready' }).w.opBesluit(besluit('would_start'))).toEqual([]);
    const loopt = maak({ 'binary_sensor.droger_op_afstand': 'on', 'sensor.droger_status': 'Run' });
    expect(await loopt.w.opBesluit(besluit('would_start'))).toEqual([]);
    expect(await loopt.w.nuStarten('droger')).toEqual({ ok: false, reden: 'het programma loopt al' });
    expect(await maak({ 'binary_sensor.droger_op_afstand': 'on' }).w.opBesluit(besluit('waiting'))).toEqual([]);
  });

  it('Nu starten op een tik', async () => {
    const { w, gedrukt } = maak({ 'binary_sensor.droger_op_afstand': 'on', 'sensor.droger_status': 'Ready' });
    expect(await w.nuStarten('droger')).toEqual({ ok: true, knop: 'button.droger_start_pause' });
    expect(w.stand('droger')).toMatchObject({ kan: false, reden: 'net al gestart; even wachten tot hij draait' });
    expect(gedrukt).toEqual(['button.droger_start_pause']);
  });

  it('de smalle deur: alleen button.press op een knop uit de lijst, zonder iets erbij', () => {
    const mag = ['button.droger_start_pause'];
    expect(isStartCall('button', 'press', {}, { entity_id: 'button.droger_start_pause' }, mag)).toBe(true);
    expect(isStartCall('button', 'press', {}, { entity_id: 'button.droger_stop' }, mag)).toBe(false);
    expect(isStartCall('button', 'press', { x: 1 }, { entity_id: 'button.droger_start_pause' }, mag)).toBe(false);
    expect(isStartCall('button', 'press', {}, { entity_id: 'button.droger_start_pause', device_id: 'd1' }, mag)).toBe(false);
    expect(isStartCall('switch', 'turn_on', {}, { entity_id: 'button.droger_start_pause' }, mag)).toBe(false);
  });
});
