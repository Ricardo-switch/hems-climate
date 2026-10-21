/*
 * Rookmelders (21 oktober 2026, schets Wand-Rook): de Nest Protect en elke
 * melder met een sensor voor rook of koolmonoxide. Wat hij ziet, zijn batterij,
 * de test en het vervangen; bij Meldingen waar en wanneer.
 */
import { describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import { wat, type MeldingenBron } from '../src/web/meldingen.js';
import { alarmSensoren, melderNaam, rookmelderNu, vindRookmelders } from '../src/web/rookmelders.js';

const T0 = Date.UTC(2026, 9, 21, 10, 41, 0);
const st = (entity_id: string, state: string, device_class: string, lastMs = T0): HaEntityState => ({
  entity_id,
  state,
  attributes: { device_class, friendly_name: entity_id },
  last_changed: new Date(lastMs).toISOString(),
  last_updated: new Date(lastMs).toISOString(),
});
const ent = (entity_id: string, device_id: string | null): HaRegistryEntity => ({ entity_id, device_id, platform: 'nest_protect' });

const devices: HaDevice[] = [
  { id: 'keuken', name: 'Nest Protect (Rookmelder keuken)', name_by_user: null, area_id: 'keuken' } as HaDevice,
  { id: 'lamp', name: 'Lamp keuken', name_by_user: null, area_id: 'keuken' } as HaDevice,
];
const entities: HaRegistryEntity[] = [
  ent('binary_sensor.protect_smoke_status', 'keuken'),
  ent('binary_sensor.protect_co_status', 'keuken'),
  ent('binary_sensor.protect_heat_status', 'keuken'),
  ent('binary_sensor.protect_battery_health', 'keuken'),
  ent('sensor.protect_replace_by', 'keuken'),
  ent('sensor.protect_last_audio_self_test', 'keuken'),
  ent('sensor.protect_last_manual_test', 'keuken'),
  ent('binary_sensor.lamp_beweging', 'lamp'),
];
function states(o: Record<string, string> = {}): Map<string, HaEntityState> {
  const lijst = [
    st('binary_sensor.protect_smoke_status', o['rook'] ?? 'off', 'smoke'),
    st('binary_sensor.protect_co_status', o['co'] ?? 'off', 'carbon_monoxide'),
    st('binary_sensor.protect_heat_status', 'off', 'heat'),
    st('binary_sensor.protect_battery_health', o['batterij'] ?? 'off', 'battery'),
    st('sensor.protect_replace_by', o['vervangen'] ?? '2034-01-19T08:00:00', 'date'),
    st('sensor.protect_last_audio_self_test', '2026-09-26T11:15:23', 'date'),
    st('sensor.protect_last_manual_test', '2025-07-12T15:13:54', 'date'),
    st('binary_sensor.lamp_beweging', 'on', 'motion'),
  ];
  return new Map(lijst.map((s) => [s.entity_id, s]));
}

describe('rookmelders (21 oktober 2026)', () => {
  it('vindt een melder per apparaat, met een gewone naam', () => {
    const [m, ...rest] = vindRookmelders(entities, devices, states());
    expect(rest).toEqual([]);
    expect(m).toMatchObject({ id: 'binary_sensor.protect_smoke_status', deviceId: 'keuken', naam: 'Rookmelder keuken', co: 'binary_sensor.protect_co_status', hitte: 'binary_sensor.protect_heat_status', batterijGoed: 'binary_sensor.protect_battery_health', vervangen: 'sensor.protect_replace_by' });
    expect(alarmSensoren([m!])).toEqual(new Set(['binary_sensor.protect_smoke_status', 'binary_sensor.protect_co_status', 'binary_sensor.protect_heat_status']));
    expect(melderNaam('Nest Protect (Rookmelder Entree)')).toBe('Rookmelder Entree');
    expect(melderNaam('Rookmelder zolder')).toBe('Rookmelder zolder');
  });

  it('zegt wat hij ziet: rook voor koolmonoxide, de laatste test en wanneer vervangen', () => {
    const s = states();
    const m = vindRookmelders(entities, devices, s)[0]!;
    expect(rookmelderNu(m, (id) => s.get(id))).toEqual({ gevaar: null, sindsMs: null, bereikbaar: true, batterijProbleem: false, vervangenVoor: '2034-01-19', getestOp: '2026-09-26' });
    const rook = states({ rook: 'on', co: 'on', batterij: 'on' });
    expect(rookmelderNu(m, (id) => rook.get(id))).toMatchObject({ gevaar: 'rook', sindsMs: T0, batterijProbleem: true });
    const co = states({ co: 'on' });
    expect(rookmelderNu(m, (id) => co.get(id)).gevaar).toBe('co');
  });

  it('staat bij Meldingen: waar en wanneer, een lege batterij, en vervangen', () => {
    const bron = (o: Partial<NonNullable<MeldingenBron['rookmelders']>[number]>): MeldingenBron => ({
      nu: T0, zonderRuimte: [], volgen: [], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null,
      rookmelders: [{ id: 'binary_sensor.protect_smoke_status', naam: 'Rookmelder keuken', kamer: 'Keuken', kamerId: 'keuken', gevaar: null, sindsMs: null, batterijProbleem: false, vervangenVoor: '2034-01-19', ...o }],
    });
    expect(wat(bron({}))).toEqual([]);
    const rook = wat(bron({ gevaar: 'rook', sindsMs: T0 }));
    expect(rook.map((m) => m.titel)).toEqual(['Rook in de keuken']);
    expect(rook[0]).toMatchObject({ soort: 'rook', aandacht: true, sindsMs: T0, actie: { href: 'kamer.html#keuken/binary_sensor.protect_smoke_status' } });
    expect(rook[0]?.klaar?.titel).toBe('Geen rook meer in de keuken');
    expect(wat(bron({ batterijProbleem: true })).map((m) => m.titel)).toEqual(['Batterij op: Rookmelder keuken']);
    expect(wat(bron({ vervangenVoor: '2026-12-01' })).map((m) => m.titel)).toEqual(['Rookmelder keuken vervangen']);
  });
});
