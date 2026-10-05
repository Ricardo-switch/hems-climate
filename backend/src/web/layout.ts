/**
 * De indeling van het huis: etages, kamers, zones en waar elk apparaat staat
 * (besluiten 95 en 96).
 *
 * Home Assistant weet het vaak half: gebieden komen uit allerlei koppelingen, en
 * veel lampen hangen nergens. De bewoner deelt het in de proefomgeving zelf in,
 * en dat komt hier terecht. Het is de derde smalle deur in de muur (na de
 * onboarding en het gevoel, 42 en 84), en daarom net zo smal:
 *
 * - één eigen bestand in de logmap, nooit naar Home Assistant, nooit over de
 *   configuratie van het huis heen;
 * - alleen de vaste etages, apparaten die Home Assistant kent, en zones van de
 *   regeling die bestaan; wat er verder in een verzoek staat, wordt niet bewaard
 *   (een apparaat dat Home Assistant niet meer kent ook niet, zie `carryOver`);
 * - een grens op het tempo, en de grens op de grootte die de server al had.
 *
 * De regeling leest de indeling niet. Hij dient de weergave en de assistent.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LAYOUT_FILE = 'indeling.json';

/** De vaste etages (95), van boven naar beneden zoals de doorsnede ze tekent. */
export const FLOORS = ['e2', 'e1', 'bg', 'buiten'] as const;
export type FloorId = (typeof FLOORS)[number];

export const FLOOR_NAMES: Readonly<Record<FloorId, string>> = {
  e2: '2e verdieping',
  e1: '1e verdieping',
  bg: 'Begane grond',
  buiten: 'Buiten',
};

export interface LayoutZone {
  readonly id: string;
  readonly naam: string;
}

export interface LayoutRoom {
  readonly id: string;
  readonly naam: string;
  readonly etage: FloorId;
  /** Delen van de kamer, als die ze heeft: keuken en zithoek (95). */
  readonly zones: readonly LayoutZone[];
  /** Het regelgebied uit de configuratie dat deze kamer is, of null. */
  readonly regelzone: string | null;
  /** Het gebied in Home Assistant waar deze kamer uit kwam; daar komen nieuwe apparaten vandaan. */
  readonly haGebied: string | null;
}

export interface LayoutDevice {
  /** De naam in de app, die overal gebruikt wordt (95); weg is de naam uit Home Assistant. */
  readonly naam?: string;
  readonly kamer: string;
  readonly zone: string | null;
}

export interface Layout {
  readonly versie: 1;
  /** Eigen namen voor de etages; een etage zonder naam heet zoals in `FLOOR_NAMES`. */
  readonly etages: Readonly<Partial<Record<FloorId, string>>>;
  readonly kamers: readonly LayoutRoom[];
  /** Per apparaat, op de sleutel die het huis gebruikt (actuator-id of entity-ID). */
  readonly apparaten: Readonly<Record<string, LayoutDevice>>;
}

export interface LayoutKnown {
  /** De apparaten die het huis nu kent. */
  readonly deviceIds: ReadonlySet<string>;
  /** De regelgebieden uit de configuratie. */
  readonly zoneIds: ReadonlySet<string>;
  /**
   * Per lamp die niet meer los in het huis staat (uitgezet of verborgen in Home
   * Assistant), de groep die hem nu als één lamp toont.
   */
  readonly opvolgers?: ReadonlyMap<string, string>;
}

/**
 * De apparaten die het huis nog kent. Een lamp die de bewoner in Home Assistant
 * uitzette, staat niet meer in het huis; zijn plek gaat naar de groep die hem nu
 * toont, als die zelf nog geen plek heeft. Zijn eigen naam niet, want die hoorde
 * bij de losse lamp. Wat het huis helemaal niet meer kent, valt weg: een oude
 * indeling mag het bewaren van een nieuwe nooit blokkeren.
 */
export function carryOver(apparaten: Readonly<Record<string, unknown>>, known: Pick<LayoutKnown, 'deviceIds' | 'opvolgers'>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const moved: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(apparaten)) {
    if (known.deviceIds.has(id)) {
      kept[id] = v;
      continue;
    }
    const to = known.opvolgers?.get(id);
    if (to == null || !known.deviceIds.has(to) || to in apparaten || to in moved) continue;
    if (typeof v === 'object' && v != null && !Array.isArray(v)) {
      const { naam: _naam, ...rest } = v as Record<string, unknown>;
      moved[to] = rest;
    }
  }
  return { ...moved, ...kept };
}

export type LayoutResult =
  | { readonly ok: true; readonly layout: Layout }
  | { readonly ok: false; readonly status: 400 | 429 | 503; readonly reden: string };

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MAX_ROOMS = 60;
const MAX_ZONES = 8;
const MAX_DEVICES = 600;

function name(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return t.length >= 1 && t.length <= max ? t : null;
}

/**
 * Toetst een indeling en geeft alleen de bekende velden terug, of een reden.
 * Zuiver, zodat de tests elke regel los kunnen raken.
 */
export function validateLayout(body: unknown, known: LayoutKnown): { ok: true; layout: Layout } | { ok: false; reden: string } {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, reden: 'verwacht een object' };
  const b = body as Record<string, unknown>;
  if (b['versie'] !== 1) return { ok: false, reden: 'versie moet 1 zijn' };

  const etagesIn = b['etages'] ?? {};
  if (typeof etagesIn !== 'object' || etagesIn == null || Array.isArray(etagesIn)) return { ok: false, reden: 'etages is een object' };
  const etages: Partial<Record<FloorId, string>> = {};
  for (const [k, v] of Object.entries(etagesIn as Record<string, unknown>)) {
    if (!(FLOORS as readonly string[]).includes(k)) return { ok: false, reden: `onbekende etage "${k}"; kies uit ${FLOORS.join(', ')}` };
    const n = name(v, 40);
    if (n == null) return { ok: false, reden: `de naam van etage ${k} is leeg of te lang` };
    etages[k as FloorId] = n;
  }

  const kamersIn = b['kamers'];
  if (!Array.isArray(kamersIn)) return { ok: false, reden: 'kamers is een lijst' };
  if (kamersIn.length > MAX_ROOMS) return { ok: false, reden: `hooguit ${MAX_ROOMS} kamers` };
  const kamers: LayoutRoom[] = [];
  const roomIds = new Set<string>();
  const regelzones = new Set<string>();
  for (const [i, r] of kamersIn.entries()) {
    if (typeof r !== 'object' || r == null || Array.isArray(r)) return { ok: false, reden: `kamer ${i} is geen object` };
    const k = r as Record<string, unknown>;
    const id = k['id'];
    if (typeof id !== 'string' || !ID.test(id) || roomIds.has(id)) return { ok: false, reden: `kamer ${i} heeft geen geldig of een dubbel id` };
    roomIds.add(id);
    const naam = name(k['naam'], 40);
    if (naam == null) return { ok: false, reden: `de naam van kamer ${id} is leeg of te lang` };
    const etage = k['etage'];
    if (typeof etage !== 'string' || !(FLOORS as readonly string[]).includes(etage)) return { ok: false, reden: `kamer ${id} staat op een onbekende etage` };
    const zonesIn = k['zones'] ?? [];
    if (!Array.isArray(zonesIn) || zonesIn.length > MAX_ZONES) return { ok: false, reden: `kamer ${id}: zones is een lijst van hooguit ${MAX_ZONES}` };
    const zones: LayoutZone[] = [];
    const zoneIds = new Set<string>();
    for (const z of zonesIn) {
      const zz = (typeof z === 'object' && z != null ? z : {}) as Record<string, unknown>;
      const zid = zz['id'];
      const zn = name(zz['naam'], 40);
      if (typeof zid !== 'string' || !ID.test(zid) || zoneIds.has(zid) || zn == null) return { ok: false, reden: `kamer ${id} heeft een ongeldige zone` };
      zoneIds.add(zid);
      zones.push({ id: zid, naam: zn });
    }
    const rz = k['regelzone'] ?? null;
    if (rz !== null) {
      if (typeof rz !== 'string' || !known.zoneIds.has(rz)) return { ok: false, reden: `kamer ${id} regelt een onbekende zone` };
      if (regelzones.has(rz)) return { ok: false, reden: `zone ${rz} hoort al bij een andere kamer` };
      regelzones.add(rz);
    }
    const ha = k['haGebied'] ?? null;
    if (ha !== null && (typeof ha !== 'string' || ha.length > 80)) return { ok: false, reden: `kamer ${id} heeft een ongeldig gebied` };
    kamers.push({ id, naam, etage: etage as FloorId, zones, regelzone: rz as string | null, haGebied: ha as string | null });
  }

  const appIn = b['apparaten'] ?? {};
  if (typeof appIn !== 'object' || appIn == null || Array.isArray(appIn)) return { ok: false, reden: 'apparaten is een object' };
  if (Object.keys(appIn).length > MAX_DEVICES) return { ok: false, reden: `hooguit ${MAX_DEVICES} apparaten` };
  const entries = Object.entries(carryOver(appIn as Record<string, unknown>, known));
  const apparaten: Record<string, LayoutDevice> = {};
  for (const [id, v] of entries) {
    const d = (typeof v === 'object' && v != null && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
    if (d == null) return { ok: false, reden: `apparaat ${id} is geen object` };
    const kamer = d['kamer'];
    const room = kamers.find((r) => r.id === kamer);
    if (!room) return { ok: false, reden: `apparaat ${id} staat in een onbekende kamer` };
    const zone = d['zone'] ?? null;
    if (zone !== null && !room.zones.some((z) => z.id === zone)) return { ok: false, reden: `apparaat ${id} staat in een zone die de kamer niet heeft` };
    const hasName = d['naam'] !== undefined && d['naam'] !== null && d['naam'] !== '';
    const naam = hasName ? name(d['naam'], 60) : null;
    if (hasName && naam == null) return { ok: false, reden: `de naam van apparaat ${id} is te lang` };
    apparaten[id] = { ...(naam ? { naam } : {}), kamer: room.id, zone: zone as string | null };
  }

  return { ok: true, layout: { versie: 1, etages, kamers, apparaten } };
}

export interface LayoutStoreOptions {
  readonly logDir: string;
  /** Wat het huis nu kent, of null zolang de registers niet gelezen zijn. */
  readonly known: () => LayoutKnown | null;
  readonly now?: () => number;
  /** Zoveel keer opslaan per tien minuten. */
  readonly perTenMinutes?: number;
}

const WINDOW_MS = 10 * 60_000;

export class LayoutStore {
  readonly #path: string;
  readonly #known: () => LayoutKnown | null;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];
  #current: Layout | null = null;
  #loaded = false;

  constructor(options: LayoutStoreOptions) {
    this.#path = join(options.logDir, LAYOUT_FILE);
    this.#known = options.known;
    this.#now = options.now ?? Date.now;
    this.#limit = options.perTenMinutes ?? 120;
  }

  /** Leest het bestand één keer; daarna houdt het de laatste stand in het geheugen. */
  async load(): Promise<Layout | null> {
    if (this.#loaded) return this.#current;
    this.#loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf-8')) as Layout;
      this.#current = parsed?.versie === 1 ? parsed : null;
    } catch {
      this.#current = null;
    }
    return this.#current;
  }

  /** De indeling zoals hij nu is, zonder te wachten; null zolang er geen is. */
  get current(): Layout | null {
    return this.#current;
  }

  async save(body: unknown): Promise<LayoutResult> {
    const known = this.#known();
    if (known == null) return { ok: false, status: 503, reden: 'het huis is nog niet gelezen uit Home Assistant' };
    const checked = validateLayout(body, known);
    if (!checked.ok) return { ok: false, status: 400, reden: checked.reden };

    const t = this.#now();
    this.#recent = this.#recent.filter((x) => t - x < WINDOW_MS);
    if (this.#recent.length >= this.#limit) {
      return { ok: false, status: 429, reden: 'even te veel achter elkaar; probeer het zo weer' };
    }
    this.#recent.push(t);

    // Eerst naast het bestand schrijven, dan omwisselen: een stroomstoring laat
    // nooit een half bestand achter.
    const tmp = `${this.#path}.nieuw`;
    await writeFile(tmp, `${JSON.stringify(checked.layout, null, 2)}\n`, 'utf-8');
    await rename(tmp, this.#path);
    this.#current = checked.layout;
    this.#loaded = true;
    return { ok: true, layout: checked.layout };
  }
}
