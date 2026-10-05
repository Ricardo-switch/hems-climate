/**
 * Het huis als navigatie (ONTWERP §4, besluiten 94 en 95): etages, kamers met
 * hun zones, en de apparaten erin, met hun stand in woorden.
 *
 * Een stuk van het bewonerscontract (76): de proefomgeving toont dit en rekent
 * zelf niets uit. Zuiver: de registers en toestanden van Home Assistant en de
 * indeling erin, het huis eruit.
 *
 * Er is altijd een indeling. Heeft de bewoner er een vastgelegd (96), dan is het
 * die; anders een voorstel uit Home Assistant (`proposeLayout`). Zo is er één weg
 * door de code, en is het voorstel precies wat de bewoner met één tik vastlegt.
 * Een apparaat zonder eigen plek staat in de kamer die uit zijn gebied in Home
 * Assistant kwam; heeft het geen gebied, of hoort dat gebied bij geen kamer, dan
 * staat het bij "nog in te delen".
 *
 * Wat erin komt: lampen, zonwering, en de klimaatapparaten uit de configuratie.
 * Groepen van lampen niet, want die zouden lampen dubbel tellen; uitgezette en
 * verborgen entiteiten ook niet. Behalve een groep waarvan de lampen uitgezet of
 * verborgen zijn: die is zelf de lamp (een armatuur, zie `collect`).
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaArea, HaDevice, HaFloor, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { SiteConfig } from '../core/model.js';
import { roomStatus, type DecisionView, type RoomKind } from './assistant.js';
import {
  FLOORS,
  FLOOR_NAMES,
  carryOver,
  type FloorId,
  type Layout,
  type LayoutDevice,
  type LayoutKnown,
  type LayoutRoom,
} from './layout.js';

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
  /** De naam in de app: de eigen naam uit de indeling, anders die uit Home Assistant. */
  readonly naam: string;
  /** De naam zoals Home Assistant hem kent, voor wie hem hernoemt. */
  readonly haNaam: string;
  readonly soort: DeviceKind;
  /** De stand in woorden: "aan · 70%", "60% dicht", "koelen naar 22°". */
  readonly stand: string;
  readonly aan: boolean;
  readonly helderheidPct: number | null;
  /** Zoals Home Assistant het zegt: 100 is open, 0 is dicht. */
  readonly positiePct: number | null;
  /** Het klimaatapparaat uit de configuratie, voor "wat zou ik doen". */
  readonly actuatorId: string | null;
  /** De zone in de kamer waar het staat, of null. */
  readonly zone: string | null;
  /** De lampgroepen in Home Assistant waar het in zit: context bij een naam die vaker voorkomt. */
  readonly groepen: readonly string[];
}

export interface HouseRoom {
  readonly id: string;
  readonly naam: string;
  /** Het regelgebied uit de configuratie dat deze kamer is, of null. */
  readonly zoneId: string | null;
  /** De delen van de kamer (95), leeg als hij er geen heeft. */
  readonly zones: readonly { readonly id: string; readonly naam: string }[];
  readonly temperatuurC: number | null;
  readonly status: { readonly soort: RoomKind; readonly zin: string } | null;
  readonly lampenAan: number;
  readonly apparaten: readonly HouseDevice[];
}

export interface HouseFloor {
  readonly id: FloorId;
  readonly naam: string;
  readonly lampenAan: number;
  readonly ruimtes: readonly HouseRoom[];
}

export interface HouseReport {
  /** "eigen" als de bewoner de indeling vastlegde, anders "voorstel" uit Home Assistant. */
  readonly indeling: 'eigen' | 'voorstel';
  readonly etages: readonly HouseFloor[];
  readonly lampenAan: number;
  /**
   * Wat in geen kamer staat. Het huis kan het nergens tonen; de bewoner deelt
   * het in (95), met als voorstel het gebied uit Home Assistant als dat er is.
   */
  readonly zonderRuimte: readonly {
    readonly id: string;
    readonly naam: string;
    readonly soort: DeviceKind;
    readonly voorstel: string | null;
    /** De lampgroepen waar het in zit, zoals "Hal alles" of de Hue-kamer "Keuken". */
    readonly groepen: readonly string[];
    /** De kamer die bij een van die groepen lijkt te horen, of null. */
    readonly voorstelKamer: string | null;
  }[];
  /**
   * De lampgroepen uit Home Assistant: groepen en Hue-kamers en -zones. Ze staan
   * niet als apparaat in het huis (dan telt een lamp dubbel), maar zeggen wel welke
   * lampen bij elkaar horen.
   */
  readonly lampgroepen: readonly { readonly id: string; readonly naam: string; readonly leden: readonly string[]; readonly hue: boolean }[];
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
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : fallback;
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
  return { id, naam: name, haNaam: name, soort: 'licht', stand, aan: on, helderheidPct: pct, positiePct: null, actuatorId: null, zone: null, groepen: [] };
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
  return { id, naam: name, haNaam: name, soort: 'screen', stand, aan: down, helderheidPct: null, positiePct: pos, actuatorId: null, zone: null, groepen: [] };
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
  return { id: actuatorId, naam: name, haNaam: name, soort: 'klimaat', stand, aan: word != null, helderheidPct: null, positiePct: null, actuatorId, zone: null, groepen: [] };
}

interface Found {
  readonly device: Omit<HouseDevice, 'naam' | 'haNaam' | 'zone' | 'groepen'>;
  readonly haNaam: string;
  readonly haArea: string | null;
  readonly groepen: readonly string[];
}

interface LightGroup {
  readonly id: string;
  readonly naam: string;
  readonly leden: readonly string[];
  readonly hue: boolean;
}

interface Context {
  readonly found: readonly Found[];
  readonly areaOf: (entityId: string) => string | null;
  readonly groups: readonly LightGroup[];
  /** Per lamp die niet los in het huis staat, de groep die hem als één lamp toont. */
  readonly successors: ReadonlyMap<string, string>;
}

/**
 * De lampgroepen: een groep van Home Assistant somt zijn lampen op als
 * `entity_id`, een Hue-kamer of -zone doet dat soms alleen met namen (`lights`).
 * Een uitgezette lamp heeft geen toestand; zijn naam staat dan alleen nog in de
 * registers, bij de entiteit of bij het apparaat (Hue noemt de lamp zoals het
 * apparaat heet).
 */
function lightGroups(registers: HouseRegisters, states: ReadonlyMap<string, HaEntityState>): LightGroup[] {
  const byName = new Map<string, string>();
  const devices = new Map(registers.devices.map((d) => [d.id, d]));
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('light.')) continue;
    const dev = e.device_id ? devices.get(e.device_id) : undefined;
    for (const n of [dev?.name, dev?.name_by_user, e.original_name, e.name]) {
      if (typeof n === 'string' && n.trim() !== '') byName.set(n.trim().toLowerCase(), e.entity_id);
    }
  }
  for (const [id, st] of states) {
    if (!id.startsWith('light.')) continue;
    const n = st.attributes['friendly_name'];
    if (typeof n === 'string') byName.set(n.trim().toLowerCase(), id);
  }
  const out: LightGroup[] = [];
  for (const [id, st] of states) {
    if (!id.startsWith('light.')) continue;
    const members = st.attributes['entity_id'];
    const names = st.attributes['lights'];
    const hue = st.attributes['is_hue_group'] === true;
    let leden: string[] = [];
    if (Array.isArray(members)) leden = members.filter((m): m is string => typeof m === 'string');
    else if (Array.isArray(names)) {
      leden = names
        .map((n) => (typeof n === 'string' ? byName.get(n.trim().toLowerCase()) : undefined))
        .filter((m): m is string => m != null);
    }
    if (!hue && !Array.isArray(members)) continue;
    out.push({ id, naam: friendly(st, id), leden, hue });
  }
  return out;
}

/** Alle apparaten die het huis toont, met hun gebied in Home Assistant. */
function collect(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
  snapshot: DecisionView | null,
): Context {
  const deviceArea = new Map(registers.devices.map((d) => [d.id, d.area_id]));
  const registry = new Map(registers.entities.map((e) => [e.entity_id, e]));
  const areaOf = (entityId: string): string | null => {
    const e = registry.get(entityId);
    if (!e) return null;
    return e.area_id ?? (e.device_id ? (deviceArea.get(e.device_id) ?? null) : null);
  };
  const found: Found[] = [];
  const groups = lightGroups(registers, states);
  const groupIds = new Set(groups.map((g) => g.id));
  const memberOf = new Map<string, string[]>();
  for (const g of groups) {
    // Twee groepen met dezelfde naam zeggen niets extra's; één keer noemen.
    for (const m of g.leden) memberOf.set(m, [...new Set([...(memberOf.get(m) ?? []), g.naam])]);
  }

  // Klimaat: de apparaten uit de configuratie, met wat ze werkelijk doen.
  for (const a of config.actuators) {
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = climateOf(a.id, a.name, snapshot?.observed[a.id]);
    found.push({ device, haNaam: a.name, haArea: areaOf(a.ref.id), groepen: [] });
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
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = coverOf(id, states.get(id), '');
    found.push({ device, haNaam: friendly(states.get(id), id), haArea: areaOf(id), groepen: [] });
  }

  /*
   * Armaturen: een groep waarvan de lampen verborgen of uitgezet zijn, is één lamp.
   *
   * Wie de losse peren van een plafonnière verbergt of uitzet in Home Assistant,
   * ziet die plafonnière als één ding; zo staat hij ook in het huis. Per peer
   * telt de kleinste groep waar hij in zit: de Hue-zone "Woonkamer plafonnière"
   * (4 peren), niet de Hue-kamer "Woonkamer" (6). Grotere groepen blijven
   * context, en tellen nooit als lamp, anders telt een lamp dubbel. Een
   * uitgezette groep van Home Assistant is geen peer: die somt alleen lampen op.
   */
  const offstage = new Set(
    registers.entities
      .filter(
        (e) =>
          e.entity_id.startsWith('light.') &&
          (e.hidden_by || e.disabled_by) &&
          e.platform !== 'group' &&
          !groupIds.has(e.entity_id),
      )
      .map((e) => e.entity_id),
  );
  const fixtures = new Set<string>();
  const successors = new Map<string, string>();
  for (const peer of offstage) {
    const smallest = groups
      .filter((g) => g.leden.includes(peer))
      .sort((a, b) => a.leden.length - b.leden.length || Number(b.hue) - Number(a.hue))[0];
    if (smallest) {
      fixtures.add(smallest.id);
      successors.set(peer, smallest.id);
    }
  }
  const majorityArea = (ids: readonly string[]): string | null => {
    const votes = new Map<string, number>();
    for (const id of ids) {
      const a = areaOf(id);
      if (a) votes.set(a, (votes.get(a) ?? 0) + 1);
    }
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  for (const g of groups) {
    if (!fixtures.has(g.id)) continue;
    const s = states.get(g.id);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = lightOf(g.id, s, '');
    found.push({
      device,
      haNaam: g.naam,
      haArea: areaOf(g.id) ?? majorityArea(g.leden),
      groepen: (memberOf.get(g.id) ?? []).filter((n) => n !== g.naam),
    });
  }

  // Losse lampen: niet verborgen, en zelf geen groep (een groep somt lampen op die er al in staan).
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('light.') || e.disabled_by || e.hidden_by) continue;
    if (groupIds.has(e.entity_id)) continue;
    const s = states.get(e.entity_id);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = lightOf(e.entity_id, s, '');
    found.push({ device, haNaam: friendly(s, e.entity_id), haArea: areaOf(e.entity_id), groepen: memberOf.get(e.entity_id) ?? [] });
  }
  return { found, areaOf, groups, successors };
}

const GROUP_WORDS = /\b(alles|alle|groep|lampen|lamp|licht|verlichting|all|hue)\b/g;

/** "Hal alles" → "hal"; leeg als er niets kamerachtigs overblijft. */
function groupCore(name: string): string {
  return name.toLowerCase().replace(GROUP_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * De kamer die bij een van de groepen hoort: dezelfde naam, of de groepsnaam in
 * de kamernaam ("Hal" bij "Hal en trap"). Niet andersom: "Slaapkamer Mylan" is
 * een andere kamer dan "Slaapkamer".
 */
function roomForGroups(groepen: readonly string[], rooms: readonly LayoutRoom[]): string | null {
  for (const g of groepen) {
    const core = groupCore(g);
    if (core.length < 3) continue;
    const exact = rooms.find((r) => r.naam.toLowerCase() === core);
    if (exact) return exact.id;
    // Hele woorden: "hal" in "hal en trap", maar niet in "halfopen".
    const within = rooms.find((r) => ` ${r.naam.toLowerCase()} `.includes(` ${core} `));
    if (within) return within.id;
  }
  return null;
}

/** Wat het huis nu kent: de sleutels die een indeling mag gebruiken. */
export function knownForLayout(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
): LayoutKnown {
  const { found, successors } = collect(config, registers, states, null);
  return {
    deviceIds: new Set(found.map((f) => f.device.id)),
    zoneIds: new Set(config.zones.map((z) => z.id)),
    opvolgers: successors,
  };
}

/** Een id dat de indeling accepteert, uit een gebied van Home Assistant. */
function slug(text: string, taken: ReadonlySet<string>): string {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'kamer';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

const OUTSIDE = /tuin|oprit|terras|buiten|schuur|carport|balkon|veranda/i;

/**
 * Het voorstel uit Home Assistant (95): elk gebied met iets erin wordt een kamer,
 * op de etage die bij het niveau hoort, en een gebied zonder etage op de begane
 * grond, of buiten als de naam daarop wijst. Een regelgebied hoort bij het gebied
 * waar zijn thermometer en apparaten het vaakst hangen.
 */
export function proposeLayout(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
): Layout {
  const { found, areaOf } = collect(config, registers, states, null);
  const floorById = new Map(registers.floors.map((f) => [f.floor_id, f]));
  const floorOf = (area: HaArea): FloorId => {
    // Een tuin of oprit is buiten, ook als Home Assistant hem op de begane grond zet.
    if (OUTSIDE.test(area.name)) return 'buiten';
    const f = area.floor_id ? floorById.get(area.floor_id) : undefined;
    if (f && f.level != null) return f.level <= 0 ? 'bg' : f.level === 1 ? 'e1' : 'e2';
    return 'bg';
  };

  // De naam van een etage komt van de etage op precies dat niveau; een "Dak" op
  // niveau 3 geeft de tweede verdieping geen naam.
  const etages: Partial<Record<FloorId, string>> = {};
  for (const [id, level] of [['bg', 0], ['e1', 1], ['e2', 2]] as const) {
    const f = registers.floors.find((x) => x.level === level && x.name.trim() !== '');
    if (f) etages[id] = f.name.trim();
  }

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

  const used = new Set(found.map((f) => f.haArea).filter((a): a is string => a != null));
  const taken = new Set<string>();
  const claimed = new Set<string>();
  const kamers: LayoutRoom[] = [];
  for (const area of registers.areas) {
    const zone = config.zones.find((z) => zoneArea.get(z.id) === area.area_id && !claimed.has(z.id)) ?? null;
    if (!used.has(area.area_id) && zone == null) continue;
    const id = slug(area.area_id || area.name, taken);
    taken.add(id);
    if (zone) claimed.add(zone.id);
    kamers.push({ id, naam: area.name.trim(), etage: floorOf(area), zones: [], regelzone: zone?.id ?? null, haGebied: area.area_id });
  }
  return { versie: 1, etages, kamers, apparaten: {} };
}

export function buildHouse(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
  snapshot: DecisionView | null,
  saved: Layout | null = null,
): HouseReport {
  const { found, groups, successors } = collect(config, registers, states, snapshot);
  const base = saved ?? proposeLayout(config, registers, states);
  // Een lamp die sinds het indelen is uitgezet, geeft zijn plek door aan zijn groep.
  const deviceIds = new Set(found.map((f) => f.device.id));
  const layout: Layout = {
    ...base,
    apparaten: carryOver(base.apparaten, { deviceIds, opvolgers: successors }) as Record<string, LayoutDevice>,
  };
  const areaName = new Map(registers.areas.map((a) => [a.area_id, a.name]));
  const roomByArea = new Map(layout.kamers.filter((k) => k.haGebied).map((k) => [k.haGebied as string, k]));

  const perRoom = new Map<string, HouseDevice[]>();
  const homeless: {
    id: string;
    naam: string;
    soort: DeviceKind;
    voorstel: string | null;
    groepen: readonly string[];
    voorstelKamer: string | null;
  }[] = [];
  for (const f of found) {
    const own = layout.apparaten[f.device.id];
    const room = own ? layout.kamers.find((k) => k.id === own.kamer) : f.haArea ? roomByArea.get(f.haArea) : undefined;
    const fromHa = shortName(f.haNaam, f.haArea ? (areaName.get(f.haArea) ?? null) : null);
    const naam = own?.naam ?? (room && room.naam !== areaName.get(f.haArea ?? '') ? shortName(fromHa, room.naam) : fromHa);
    if (!room) {
      homeless.push({
        id: f.device.id,
        naam,
        soort: f.device.soort,
        voorstel: f.haArea ? (areaName.get(f.haArea) ?? null) : null,
        groepen: f.groepen,
        voorstelKamer: roomForGroups(f.groepen, layout.kamers),
      });
      continue;
    }
    const zone = own?.zone && room.zones.some((z) => z.id === own.zone) ? own.zone : null;
    const list = perRoom.get(room.id) ?? [];
    list.push({ ...f.device, naam, haNaam: f.haNaam, zone, groepen: f.groepen });
    perRoom.set(room.id, list);
  }

  const rooms = layout.kamers.map((k): HouseRoom => {
    const devices = perRoom.get(k.id) ?? [];
    devices.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || Number(b.aan) - Number(a.aan) || a.naam.localeCompare(b.naam, 'nl'));
    const zone = k.regelzone ? config.zones.find((z) => z.id === k.regelzone) : undefined;
    const pz = zone ? snapshot?.explanation.perZone.find((z) => z.zoneId === zone.id) : undefined;
    const status = zone && snapshot ? roomStatus(config, snapshot, zone, 'nl', true) : null;
    return {
      id: k.id,
      naam: k.naam,
      zoneId: zone?.id ?? null,
      zones: k.zones.map((z) => ({ id: z.id, naam: z.naam })),
      temperatuurC: pz?.temperatureC ?? null,
      status: status ? { soort: status.kind, zin: status.zin } : null,
      lampenAan: devices.filter((d) => d.soort === 'licht' && d.aan).length,
      apparaten: devices,
    };
  });

  const floors: HouseFloor[] = [];
  for (const id of FLOORS) {
    const ruimtes = rooms.filter((r) => layout.kamers.find((k) => k.id === r.id)?.etage === id);
    if (ruimtes.length === 0) continue;
    floors.push({ id, naam: layout.etages[id] ?? FLOOR_NAMES[id], lampenAan: ruimtes.reduce((n, r) => n + r.lampenAan, 0), ruimtes });
  }

  homeless.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || a.naam.localeCompare(b.naam, 'nl'));
  return {
    indeling: saved ? 'eigen' : 'voorstel',
    etages: floors,
    lampenAan: floors.reduce((n, f) => n + f.lampenAan, 0),
    zonderRuimte: homeless,
    lampgroepen: groups.map((g) => ({ id: g.id, naam: g.naam, leden: g.leden, hue: g.hue })),
  };
}
