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
import type { SiteConfig } from '../core/model.js';
import { controleerBronnen, type Warmtebron } from './warmte.js';

export const LAYOUT_FILE = 'indeling.json';

/**
 * De etages (95, vrij sinds 112). Een etage heeft een id en een naam; de vaste
 * etages hieronder zijn het voorstel, van boven naar beneden. Buiten is er
 * altijd, en staat los van de volgorde: het is de grond rond het huis.
 */
export type FloorId = string;
export const OUTSIDE_FLOOR = 'buiten';
export const STANDARD_FLOORS: readonly { readonly id: string; readonly naam: string }[] = [
  { id: 'e3', naam: '3e verdieping' },
  { id: 'e2', naam: '2e verdieping' },
  { id: 'e1', naam: '1e verdieping' },
  { id: 'bg', naam: 'Begane grond' },
  { id: 'kelder', naam: 'Kelder' },
];
/** Zonder eigen volgorde: de etages van een gewoon huis. */
const DEFAULT_ORDER = ['e2', 'e1', 'bg'];
const MAX_FLOORS = 10;

/** De standaardnaam van een etage, of het id als het een eigen etage is. */
export function floorName(id: string): string {
  return id === OUTSIDE_FLOOR ? 'Buiten' : (STANDARD_FLOORS.find((f) => f.id === id)?.naam ?? id);
}

/**
 * De etages binnen van een indeling, van boven naar beneden: de eigen volgorde,
 * of anders de gewone drie met wat de kamers nog meer gebruiken op hun vaste
 * plek. Buiten staat er niet bij.
 */
export function floorOrder(layout: Pick<Layout, 'volgorde' | 'kamers'>): string[] {
  if (layout.volgorde?.length) return [...layout.volgorde];
  const used = new Set([...DEFAULT_ORDER, ...layout.kamers.map((k) => k.etage).filter((e) => e !== OUTSIDE_FLOOR)]);
  const standard = STANDARD_FLOORS.map((f) => f.id).filter((id) => used.has(id));
  const own = [...used].filter((id) => !STANDARD_FLOORS.some((f) => f.id === id));
  return [...standard, ...own];
}

export interface LayoutZone {
  readonly id: string;
  readonly naam: string;
}

/** Wat een buitenruimte is, voor de tekening van het huis (besluit 109). */
export const OUTSIDE_KINDS = ['oprit', 'tuin', 'voortuin', 'terras', 'balkon'] as const;
export type OutsideKind = (typeof OUTSIDE_KINDS)[number];

export interface LayoutOutside {
  readonly soort: OutsideKind;
  /** Een auto op de oprit. */
  readonly auto: boolean;
  /** Een tuinhuis of schuur in de tuin. */
  readonly tuinhuis: boolean;
}

/**
 * Wat voor kamer het is, voor de inrichting in de tekening (besluit 119).
 * Weg is: een voorstel uit de naam. "leeg" tekent niets.
 */
export const ROOM_TYPES = ['woonkamer', 'woonkeuken', 'keuken', 'eetkamer', 'slaapkamer', 'kinderkamer', 'logeerkamer', 'badkamer', 'toilet', 'hal', 'werkkamer', 'wasruimte', 'berging', 'leeg'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export interface LayoutRoom {
  readonly id: string;
  readonly naam: string;
  readonly etage: FloorId;
  /** Alleen binnen: wat voor kamer het is (besluit 119). Weg is: de naam zegt het. */
  readonly soort?: RoomType;
  /**
   * Meten met (besluit 123): de sensoren waarvan het gemiddelde de temperatuur
   * van de kamer is, sensoren en klimaatapparaten uit het huis. Weg is: zoals
   * de configuratie het zegt.
   */
  readonly meten?: readonly string[];
  /** Alleen op de etage buiten: wat voor ruimte het is (besluit 109). Weg is: de naam zegt het. */
  readonly buiten?: LayoutOutside;
  /** Delen van de kamer, als die ze heeft: keuken en zithoek (95). */
  readonly zones: readonly LayoutZone[];
  /** Alleen binnen: wat er warmt en koelt (besluit 132). Weg is: nog niets vastgelegd. */
  readonly bronnen?: readonly Warmtebron[];
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
  /** Eigen namen voor de etages; een etage zonder naam heet zoals in `floorName`. */
  readonly etages: Readonly<Partial<Record<FloorId, string>>>;
  /** De etages binnen, van boven naar beneden (besluit 112). Weg: zie `floorOrder`. */
  readonly volgorde?: readonly string[];
  readonly kamers: readonly LayoutRoom[];
  /** Per apparaat, op de sleutel die het huis gebruikt (actuator-id of entity-ID). */
  readonly apparaten: Readonly<Record<string, LayoutDevice>>;
  /** Apparaten die de bewoner in de app niet wil zien, zoals een lamp die nergens hoort. */
  readonly verborgen?: readonly string[];
  /**
   * Welke etage onder het schuine dak ligt (besluit 111), of `geen` voor een
   * plat dak of een huis zonder zolder. Weg: de dienst raadt het.
   */
  readonly dak?: FloorId | 'geen';
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

  // De volgorde van de etages binnen (besluit 112): eigen ids mogen, buiten niet.
  const volgordeIn = b['volgorde'];
  let volgorde: string[] | undefined;
  if (volgordeIn !== undefined) {
    if (!Array.isArray(volgordeIn) || volgordeIn.length === 0 || volgordeIn.length > MAX_FLOORS) return { ok: false, reden: `volgorde is een lijst van 1 tot ${MAX_FLOORS} etages` };
    volgorde = [];
    for (const id of volgordeIn) {
      if (typeof id !== 'string' || !ID.test(id) || id === OUTSIDE_FLOOR || volgorde.includes(id)) return { ok: false, reden: 'volgorde heeft een ongeldige of dubbele etage' };
      volgorde.push(id);
    }
  }
  const bekend = (id: string) => id === OUTSIDE_FLOOR || (volgorde ? volgorde.includes(id) : STANDARD_FLOORS.some((f) => f.id === id));

  const etagesIn = b['etages'] ?? {};
  if (typeof etagesIn !== 'object' || etagesIn == null || Array.isArray(etagesIn)) return { ok: false, reden: 'etages is een object' };
  const etages: Partial<Record<FloorId, string>> = {};
  for (const [k, v] of Object.entries(etagesIn as Record<string, unknown>)) {
    if (!bekend(k)) return { ok: false, reden: `onbekende etage "${k}"` };
    const n = name(v, 40);
    if (n == null) return { ok: false, reden: `de naam van etage ${k} is leeg of te lang` };
    etages[k] = n;
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
    if (typeof etage !== 'string' || !bekend(etage)) return { ok: false, reden: `kamer ${id} staat op een onbekende etage` };
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
    // Wat een buitenruimte is (besluit 109); op een andere etage valt het weg.
    const bi = k['buiten'];
    let buiten: LayoutOutside | undefined;
    if (bi !== undefined && bi !== null && etage === 'buiten') {
      const o = (typeof bi === 'object' && !Array.isArray(bi) ? bi : {}) as Record<string, unknown>;
      if (!(OUTSIDE_KINDS as readonly unknown[]).includes(o['soort']) || typeof o['auto'] !== 'boolean' || typeof o['tuinhuis'] !== 'boolean') {
        return { ok: false, reden: `buitenruimte ${id}: soort is ${OUTSIDE_KINDS.join(', ')}, met auto en tuinhuis als ja of nee` };
      }
      buiten = { soort: o['soort'] as OutsideKind, auto: o['auto'], tuinhuis: o['tuinhuis'] };
    }
    // Wat voor kamer het is (besluit 119); buiten valt het weg.
    const so = k['soort'];
    if (so !== undefined && so !== null && !(ROOM_TYPES as readonly unknown[]).includes(so)) return { ok: false, reden: `kamer ${id}: soort is ${ROOM_TYPES.join(', ')}` };
    const soort = so != null && etage !== OUTSIDE_FLOOR ? (so as RoomType) : undefined;
    // Meten met (besluit 123): apparaten die het huis kent, hooguit zes, geen dubbele.
    const me = k['meten'];
    let meten: string[] | undefined;
    if (me !== undefined && me !== null) {
      if (!Array.isArray(me) || me.length > 6 || me.some((x) => typeof x !== 'string' || !known.deviceIds.has(x)) || new Set(me).size !== me.length) {
        return { ok: false, reden: `kamer ${id}: meten is een lijst van hooguit zes bekende sensoren` };
      }
      if (me.length > 0) meten = me as string[];
    }
    // Wat er warmt en koelt (besluit 132); buiten valt het weg. Een apparaat dat
    // het huis niet meer kent, valt weg, en daarmee op zon: anders kan de
    // bewoner niets meer bewaren als er iets uit Home Assistant verdwijnt.
    let bronnen: Warmtebron[] | undefined;
    if (k['bronnen'] !== undefined && k['bronnen'] !== null && etage !== OUTSIDE_FLOOR) {
      const c = controleerBronnen(id, k['bronnen']);
      if (!c.ok) return { ok: false, reden: c.reden };
      bronnen = c.bronnen.map((b) => (b.apparaat && !known.deviceIds.has(b.apparaat) ? (({ apparaat: _a, opZon: _z, ...rest }) => rest)(b) : b));
      if (bronnen.length === 0) bronnen = undefined;
    }
    kamers.push({ id, naam, etage, zones, regelzone: rz as string | null, haGebied: ha as string | null, ...(buiten ? { buiten } : {}), ...(soort ? { soort } : {}), ...(meten ? { meten } : {}), ...(bronnen ? { bronnen } : {}) });
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

  // Verbergen kan alleen wat het huis kent; wat het niet meer kent, valt weg, net als hierboven.
  const verborgenIn = b['verborgen'] ?? [];
  if (!Array.isArray(verborgenIn) || verborgenIn.length > MAX_DEVICES) return { ok: false, reden: `verborgen is een lijst van hooguit ${MAX_DEVICES} apparaten` };
  const verborgen = [...new Set(verborgenIn.filter((id): id is string => typeof id === 'string' && known.deviceIds.has(id)))];

  const dak = b['dak'];
  if (dak !== undefined && dak !== 'geen' && (typeof dak !== 'string' || dak === OUTSIDE_FLOOR || !bekend(dak))) return { ok: false, reden: 'dak is een etage binnen, of geen' };
  return {
    ok: true,
    layout: { versie: 1, etages, ...(volgorde ? { volgorde } : {}), kamers, apparaten, verborgen, ...(dak !== undefined ? { dak: dak as FloorId | 'geen' } : {}) },
  };
}

/**
 * Eén naam per kamer (besluit 131): wat de app laat zien, heet zoals in de
 * indeling. Een zone krijgt de naam van de kamer die hem regelt, een apparaat
 * de naam die de bewoner het in de app gaf, en de zones staan in de volgorde
 * van het huis. Alleen voor wat de app laat zien; de regeling zelf rekent met
 * de id's.
 */
export function withLayoutNames(config: SiteConfig, layout: Pick<Layout, 'kamers' | 'apparaten' | 'volgorde'> | null): SiteConfig {
  if (layout == null) return config;
  let anders = false;
  // In de volgorde van het huis, de zolder boven: zo staan ze ook in lijsten onder elkaar.
  const etages = floorOrder(layout);
  const plek = (zoneId: string) => {
    const kamer = layout.kamers.find((k) => k.regelzone === zoneId);
    if (!kamer) return Number.MAX_SAFE_INTEGER;
    const e = etages.indexOf(kamer.etage);
    return (e === -1 ? etages.length : e) * 1000 + layout.kamers.indexOf(kamer);
  };
  const volgorde = [...config.zones].sort((a, b) => plek(a.id) - plek(b.id));
  if (volgorde.some((z, i) => z !== config.zones[i])) anders = true;
  const zones = volgorde.map((z) => {
    const naam = layout.kamers.find((k) => k.regelzone === z.id)?.naam.trim();
    if (!naam || naam === z.name) return z;
    anders = true;
    return { ...z, name: naam };
  });
  const actuators = config.actuators.map((a) => {
    const naam = layout.apparaten[a.id]?.naam?.trim();
    if (!naam || naam === a.name) return a;
    anders = true;
    return { ...a, name: naam };
  });
  return anders ? { ...config, zones, actuators } : config;
}

export interface LayoutStoreOptions {
  readonly logDir: string;
  /** Wat het huis nu kent, of null zolang de registers niet gelezen zijn. */
  readonly known: () => LayoutKnown | null;
  readonly now?: () => number;
  /** Zoveel keer opslaan per tien minuten. */
  readonly perTenMinutes?: number;
  /** Na het bewaren, bijvoorbeeld om de regeling bij te werken (besluit 132). */
  readonly onSaved?: (layout: Layout) => void;
}

const WINDOW_MS = 10 * 60_000;

export class LayoutStore {
  readonly #onSaved: ((layout: Layout) => void) | undefined;
  readonly #path: string;
  readonly #known: () => LayoutKnown | null;
  readonly #now: () => number;
  readonly #limit: number;
  #recent: number[] = [];
  #current: Layout | null = null;
  #loaded = false;

  constructor(options: LayoutStoreOptions) {
    this.#onSaved = options.onSaved;
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
    this.#onSaved?.(checked.layout);
    return { ok: true, layout: checked.layout };
  }
}
