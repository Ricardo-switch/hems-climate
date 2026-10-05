/**
 * Het huis als navigatie (ONTWERP §4, besluit 94): etages, ruimtes en de
 * apparaten erin, met hun stand in woorden.
 *
 * Een stuk van het bewonerscontract (76): de proefomgeving toont dit en rekent
 * zelf niets uit. Zuiver: de registers en de toestanden van Home Assistant
 * erin, het huis eruit. Waar Home Assistant iets niet weet (geen etages), valt
 * het terug op één etage "Huis" in plaats van te raden.
 *
 * Wat erin komt: lampen, zonwering, en de klimaatapparaten uit de configuratie.
 * Groepen van lampen niet, want die zouden lampen dubbel tellen; uitgezette en
 * verborgen entiteiten ook niet.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaArea, HaDevice, HaFloor, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { SiteConfig, Zone } from '../core/model.js';
import { roomStatus, type DecisionView, type RoomKind } from './assistant.js';

export interface HouseRegisters {
  readonly floors: readonly HaFloor[];
  readonly areas: readonly HaArea[];
  readonly devices: readonly HaDevice[];
  readonly entities: readonly HaRegistryEntity[];
}

export type DeviceKind = 'klimaat' | 'screen' | 'licht';

export interface HouseDevice {
  /** Voor de pagina, als sleutel; de bewoner ziet hem nooit (45). */
  readonly id: string;
  readonly naam: string;
  readonly soort: DeviceKind;
  /** De stand in woorden: "aan · 70%", "60% dicht", "koelen naar 22°". */
  readonly stand: string;
  readonly aan: boolean;
  readonly helderheidPct: number | null;
  /** Zoals Home Assistant het zegt: 100 is open, 0 is dicht. */
  readonly positiePct: number | null;
  /** Het klimaatapparaat uit de configuratie, voor "wat zou ik doen". */
  readonly actuatorId: string | null;
}

export interface HouseRoom {
  readonly id: string;
  readonly naam: string;
  readonly zoneId: string | null;
  readonly temperatuurC: number | null;
  readonly status: { readonly soort: RoomKind; readonly zin: string } | null;
  readonly lampenAan: number;
  readonly apparaten: readonly HouseDevice[];
}

export interface HouseFloor {
  readonly id: string | null;
  readonly naam: string;
  readonly niveau: number | null;
  readonly lampenAan: number;
  readonly ruimtes: readonly HouseRoom[];
}

export interface HouseReport {
  readonly etages: readonly HouseFloor[];
  readonly lampenAan: number;
}

const ORDER: Readonly<Record<DeviceKind, number>> = { klimaat: 0, screen: 1, licht: 2 };

const CLIMATE_WORD: Readonly<Record<string, string>> = {
  cool: 'koelen',
  heat: 'verwarmen',
  heat_cool: 'automatisch',
  auto: 'automatisch',
  dry: 'drogen',
  fan_only: 'ventileren',
};

function nl1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

/** "Woonkamer plafonnière" in de woonkamer heet daar gewoon "Plafonnière". */
function shortName(full: string, areaName: string | null): string {
  if (areaName) {
    const prefix = `${areaName.toLowerCase()} `;
    if (full.toLowerCase().startsWith(prefix) && full.length > prefix.length) {
      const rest = full.slice(prefix.length);
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return full;
}

function friendly(state: HaEntityState | undefined, fallback: string): string {
  const name = state?.attributes['friendly_name'];
  return typeof name === 'string' && name.trim() !== '' ? name : fallback;
}

function lightOf(id: string, state: HaEntityState | undefined, name: string): HouseDevice {
  const on = state?.state === 'on';
  const b = state?.attributes['brightness'];
  const pct = on && typeof b === 'number' ? Math.round((b / 255) * 100) : null;
  const stand =
    state == null || state.state === 'unavailable' || state.state === 'unknown'
      ? 'onbereikbaar'
      : on
        ? pct == null
          ? 'aan'
          : `aan · ${pct}%`
        : 'uit';
  return { id, naam: name, soort: 'licht', stand, aan: on, helderheidPct: pct, positiePct: null, actuatorId: null };
}

function coverOf(id: string, state: HaEntityState | undefined, name: string): HouseDevice {
  const p = state?.attributes['current_position'];
  const pos = typeof p === 'number' ? p : null;
  let stand: string;
  if (state == null || state.state === 'unavailable' || state.state === 'unknown') stand = 'onbekend';
  else if (state.state === 'opening') stand = 'gaat open';
  else if (state.state === 'closing') stand = 'gaat dicht';
  else if (pos == null) stand = state.state === 'closed' ? 'dicht' : 'open';
  else if (pos >= 100) stand = 'open';
  else if (pos <= 0) stand = 'dicht';
  else stand = `${100 - pos}% dicht`;
  // "Aan" is voor een screen: hij hangt (deels) voor het raam.
  const down = pos != null ? pos < 100 : state?.state === 'closed';
  return { id, naam: name, soort: 'screen', stand, aan: down, helderheidPct: null, positiePct: pos, actuatorId: null };
}

function climateOf(
  actuatorId: string,
  name: string,
  observed: string | undefined,
): HouseDevice {
  const [mode = '', sp] = (observed ?? '').split('@');
  const word = CLIMATE_WORD[mode];
  const setpoint = sp == null ? NaN : Number(sp);
  const stand =
    mode === 'off'
      ? 'uit'
      : word == null
        ? 'onbekend'
        : Number.isFinite(setpoint)
          ? `${word} naar ${nl1(setpoint)}°`
          : word;
  return { id: actuatorId, naam: name, soort: 'klimaat', stand, aan: word != null, helderheidPct: null, positiePct: null, actuatorId };
}

export function buildHouse(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
  snapshot: DecisionView | null,
): HouseReport {
  const deviceArea = new Map(registers.devices.map((d) => [d.id, d.area_id]));
  const registry = new Map(registers.entities.map((e) => [e.entity_id, e]));
  const areaName = new Map(registers.areas.map((a) => [a.area_id, a.name]));
  const areaOf = (entityId: string): string | null => {
    const e = registry.get(entityId);
    if (!e) return null;
    return e.area_id ?? (e.device_id ? (deviceArea.get(e.device_id) ?? null) : null);
  };

  // Welke ruimte bij welke zone hoort: waar zijn thermometer en apparaten hangen.
  const zoneArea = new Map<string, string>();
  for (const zone of config.zones) {
    const votes = new Map<string, number>();
    const ids = [zone.temperature.id, ...zone.actuatorIds.map((id) => config.actuators.find((a) => a.id === id)?.ref.id)];
    for (const id of ids) {
      const area = id ? areaOf(id) : null;
      if (area) votes.set(area, (votes.get(area) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) zoneArea.set(zone.id, best[0]);
  }
  const areaZone = new Map<string, Zone>();
  for (const zone of config.zones) {
    const a = zoneArea.get(zone.id);
    if (a && !areaZone.has(a)) areaZone.set(a, zone);
  }

  const perArea = new Map<string, HouseDevice[]>();
  const add = (area: string | null, d: HouseDevice) => {
    if (!area) return;
    const list = perArea.get(area) ?? [];
    list.push(d);
    perArea.set(area, list);
  };

  // Klimaat: de apparaten uit de configuratie, met wat ze werkelijk doen.
  for (const a of config.actuators) {
    add(areaOf(a.ref.id), climateOf(a.id, a.name, snapshot?.observed[a.id]));
  }

  // Zonwering: één per apparaat (Somfy levert er per screen twee, ook een langzame).
  const coverPerDevice = new Map<string, string>();
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('cover.') || e.disabled_by || e.hidden_by) continue;
    const key = e.device_id ?? e.entity_id;
    const prev = coverPerDevice.get(key);
    if (prev == null || e.entity_id.length < prev.length) coverPerDevice.set(key, e.entity_id);
  }
  for (const id of coverPerDevice.values()) {
    const area = areaOf(id);
    add(area, coverOf(id, states.get(id), shortName(friendly(states.get(id), id), area ? (areaName.get(area) ?? null) : null)));
  }

  // Lampen, zonder groepen: een groep somt lampen op die er al in staan.
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('light.') || e.disabled_by || e.hidden_by) continue;
    const s = states.get(e.entity_id);
    if (Array.isArray(s?.attributes['entity_id'])) continue;
    const area = areaOf(e.entity_id);
    add(area, lightOf(e.entity_id, s, shortName(friendly(s, e.entity_id), area ? (areaName.get(area) ?? null) : null)));
  }

  const rooms = new Map<string, HouseRoom>();
  for (const area of registers.areas) {
    const devices = perArea.get(area.area_id) ?? [];
    const zone = areaZone.get(area.area_id) ?? null;
    if (devices.length === 0 && zone == null) continue;
    devices.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || Number(b.aan) - Number(a.aan) || a.naam.localeCompare(b.naam, 'nl'));
    const pz = zone ? snapshot?.explanation.perZone.find((z) => z.zoneId === zone.id) : undefined;
    const status = zone && snapshot ? roomStatus(config, snapshot, zone, 'nl', true) : null;
    rooms.set(area.area_id, {
      id: area.area_id,
      naam: area.name,
      zoneId: zone?.id ?? null,
      temperatuurC: pz?.temperatureC ?? null,
      status: status ? { soort: status.kind, zin: status.zin } : null,
      lampenAan: devices.filter((d) => d.soort === 'licht' && d.aan).length,
      apparaten: devices,
    });
  }

  const floorOfArea = new Map(registers.areas.map((a) => [a.area_id, a.floor_id ?? null]));
  const floors: HouseFloor[] = [];
  const known = [...registers.floors].sort((a, b) => (b.level ?? -99) - (a.level ?? -99));
  const knownIds = new Set(known.map((f) => f.floor_id));
  // Een etage die Home Assistant niet (meer) kent, telt als geen etage.
  const floorOf = (areaId: string) => {
    const f = floorOfArea.get(areaId) ?? null;
    return f != null && knownIds.has(f) ? f : null;
  };
  const roomsOn = (floorId: string | null) =>
    [...rooms.values()]
      .filter((r) => floorOf(r.id) === floorId)
      .sort((a, b) => Number(b.zoneId != null) - Number(a.zoneId != null) || a.naam.localeCompare(b.naam, 'nl'));
  const pushFloor = (id: string | null, naam: string, niveau: number | null) => {
    const ruimtes = roomsOn(id);
    if (ruimtes.length === 0) return;
    floors.push({ id, naam, niveau, lampenAan: ruimtes.reduce((n, r) => n + r.lampenAan, 0), ruimtes });
  };
  for (const f of known) pushFloor(f.floor_id, f.name, f.level ?? null);
  // Ruimtes zonder etage: zonder etages in Home Assistant is dat het hele huis.
  pushFloor(null, known.length === 0 ? 'Huis' : 'Zonder etage', null);

  return { etages: floors, lampenAan: floors.reduce((n, f) => n + f.lampenAan, 0) };
}
