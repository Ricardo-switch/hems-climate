/**
 * De zon en je aansluiting (besluit 103, schets Onboarding-Zon).
 *
 * Een paar dingen haalt de app niet uit Home Assistant: waar de panelen liggen,
 * hoe zwaar de hoofdzekering is, welk stroomcontract je hebt, en of een
 * apparaat dat op afstand kan starten op zon mag beginnen. Die vraagt de app,
 * en de antwoorden staan in `aansluiting.json` naast de dataset.
 *
 * De regeling leest mee: de zekering wordt met de gevonden stroommeters het
 * stroombudget (78), en een apparaat op zon dat de configuratie niet noemt,
 * wordt uitstelbaar (98). De zekering uit de app gaat voor die uit de
 * configuratie (besluit 117): de app is waar je hem instelt. Dat gebeurt bij
 * het starten van de dienst; een nieuw antwoord gaat in bij de volgende start.
 *
 * De pagina stuurt alleen antwoorden. Welke stroommeters en apparaten erbij
 * horen, zoekt deze kant zelf op in Home Assistant, zoals bij de onboarding
 * (besluit 42): de pagina noemt nooit een entiteit.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { SiteConfig } from '../core/model.js';
import type { Lang } from './assistant.js';
import { heatStoreConfig, type FoundHeatStore } from './buffers-vinden.js';
import { VOORKANT_ZON, aantalVan, dakUitAanpassing, dakUitMeting, liggingView, type Dak, type LiggingView, type Meting, type VoorkantZon } from './ligging.js';

export const CONNECTION_FILE = 'aansluiting.json';

/** Waar de panelen liggen; `geen` is een huis zonder panelen (besluit 158). */
export const PANEL_SIDES = ['voorkant', 'achterkant', 'beide', 'plat', 'weetniet', 'geen'] as const;
export type PanelSide = (typeof PANEL_SIDES)[number];
export const TARIFFS = ['vast', 'dynamisch', 'weetniet'] as const;
export type Tariff = (typeof TARIFFS)[number];
/** Waar de warmte vandaan komt (besluit 122). */
export const HEATERS = ['cv', 'warmtepomp', 'hybride', 'stadsverwarming', 'weetniet'] as const;
export type Heater = (typeof HEATERS)[number];
/**
 * De verwarming (besluit 122), met de thermostaat die de ketel stuurt (besluit
 * 167), zoals een Nest: daar gaan de radiatoren mee aan. Weg of null: de app
 * stelt er een voor uit Home Assistant; "geen" is: er is er geen.
 */
export interface Verwarming {
  readonly soort: Heater | null;
  readonly aanvoerC: number | null;
  readonly thermostaat?: string | null;
}
/** De aanvoertemperatuur die op een ketel of warmtepomp kan staan, in °C. */
export const SUPPLY_C = { min: 25, max: 90 } as const;

export interface Fuse {
  readonly fasen: 1 | 3;
  readonly ampere: number;
}

export interface FoundPhase {
  readonly id: 'L1' | 'L2' | 'L3';
  readonly current: string;
  readonly voltage?: string;
}

export type ApplianceKind = 'droger' | 'wasmachine' | 'vaatwasser' | 'apparaat';

export interface FoundAppliance {
  readonly id: string;
  readonly naam: string;
  readonly soort: ApplianceKind;
  readonly remoteStart: string;
  readonly operationState?: string;
  readonly programDuration?: string;
  /** Hoe lang het programma nog duurt (of de eindtijd), en de voortgang in procent (besluit 167). */
  readonly remainingTime?: string;
  readonly programProgress?: string;
  /** Wat hij ongeveer vraagt als hij opwarmt; een schatting per soort. */
  readonly estimatedW: number;
}

export interface ConnectionAnswers {
  readonly versie: 1;
  /**
   * Bij panelen op beide kanten het aantal per kant; `aantal` is dan de som, als
   * beide bekend zijn. Anders alleen `aantal`.
   */
  readonly panelen: {
    readonly ligging: PanelSide | null;
    readonly aantal: number | null;
    readonly voorkant: number | null;
    readonly achterkant: number | null;
  };
  readonly zekering: Fuse | 'weetniet' | null;
  readonly tarief: Tariff | null;
  /**
   * De verwarming (besluit 122): wat het is, en de aanvoertemperatuur die op de
   * ketel staat, als de bewoner die weet. Voor het thermisch model: een lagere
   * aanvoer warmt een kamer langzamer op.
   */
  readonly verwarming?: Verwarming;
  /**
   * Hoe de panelen liggen (besluit 157): wanneer de zon op de voorkant schijnt,
   * en wat de bewoner van de meting bevestigde of verbeterde. Weg of null: nog
   * niet bevestigd; dan geldt de configuratie, de meting of een schatting.
   */
  readonly voorkantZon?: VoorkantZon | null;
  readonly dak?: Dak | null;
  /**
   * Panelen op een ander dak dan het huis (besluit 187): de garage, de carport
   * of het tuinhuis, met hun aantal. Voor de tekening en de lijst; de meting
   * van de ligging blijft over het huis gaan.
   */
  readonly elders?: Elders;
  /** De stroommeters zoals bij het bewaren gevonden, zodat de regeling ze bij het starten kent. */
  readonly fasen: readonly FoundPhase[];
  readonly apparaten: readonly (FoundAppliance & { readonly opZon: boolean })[];
  /** De boiler en de jacuzzi (besluit 186): gevonden, en of ze op zon mogen. */
  readonly buffers?: readonly (FoundHeatStore & { readonly opZon: boolean })[];
  /**
   * Apparaten uit de configuratie die de bewoner uitzette (besluit 167): die
   * starten niet meer op zon. Eerst stond daar alleen "Aan".
   */
  readonly opZonUit?: readonly string[];
}

/** De andere daken met panelen (besluit 187). */
export const ELDERS_PLEKKEN = ['garage', 'carport', 'tuinhuis'] as const;
export type Elders = Partial<Record<(typeof ELDERS_PLEKKEN)[number], number>>;

/* ------------------------------------------------------------ herkennen */

const PHASE = /(?:phase|fase)[ _-]?([123])(?![0-9])|(?:^|[^a-z0-9])l([123])(?:[^a-z0-9]|$)/i;
const GRID_METER = /p1|dsmr|grid|slimme[ _-]?meter|smart[ _-]?meter|homewizard|(?:^|[^a-z0-9])net(?:[^a-z0-9]|$)/i;

function label(s: HaEntityState): string {
  const name = s.attributes['friendly_name'];
  return `${s.entity_id} ${typeof name === 'string' ? name : ''}`;
}

function phaseOf(s: HaEntityState): 1 | 2 | 3 | null {
  const m = PHASE.exec(label(s));
  const n = Number(m?.[1] ?? m?.[2]);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

const isUnit = (s: HaEntityState, deviceClass: string, unit: string) =>
  s.entity_id.startsWith('sensor.') && (s.attributes['device_class'] === deviceClass || s.attributes['unit_of_measurement'] === unit);

/**
 * De stroom (en spanning) per fase van de slimme meter.
 *
 * Een fase telt alleen als er één duidelijke kandidaat is: liever een meter van
 * het net (P1, DSMR), en anders alleen als er maar één is. Een verkeerde meter
 * kost meer dan geen meter (besluit 41).
 */
export function findPhases(states: Iterable<HaEntityState>): FoundPhase[] {
  const list = [...states];
  const pick = (deviceClass: string, unit: string, phase: number): string | null => {
    const all = list.filter((s) => isUnit(s, deviceClass, unit) && phaseOf(s) === phase && !/sag|swell|max|min|gemiddeld|average/i.test(s.entity_id));
    const meters = all.filter((s) => GRID_METER.test(label(s)));
    const pool = meters.length > 0 ? meters : all;
    return pool.length === 1 ? pool[0]!.entity_id : null;
  };
  const out: FoundPhase[] = [];
  for (const n of [1, 2, 3] as const) {
    const current = pick('current', 'A', n);
    if (!current) continue;
    const voltage = pick('voltage', 'V', n);
    out.push({ id: `L${n}`, current, ...(voltage ? { voltage } : {}) });
  }
  return out;
}

/*
 * Meer merken dan Home Connect (besluit 178), met de namen van hun koppeling in
 * Home Assistant: LG ThinQ (`remote_control_enabled`, `current_status`,
 * `remaining_time`), SmartThings van Samsung (`remote_control`,
 * `..._machine_state`, `completion_time`) en Miele (`mobile_start`, `status`,
 * `remaining_time`).
 */
const REMOTE_START = /remote_?(?:control_?)?start_?allowed|remotecontrolstartallowed|remote_?start|remote_?control_?enabled|mobile_?start|_remote_?control$/i;
const OPERATION = /operation_?state|operationstate|programma_?status|program_?state|machine_?state|current_?status/i;
/** Miele noemt hem gewoon `status`; alleen als niets anders past, en nooit de deur of de batterij. */
const OPERATION_KAAL = /^sensor\.[a-z0-9_]*(?<!door|deur|battery|batterij|wifi|connection)_status$/i;
const DURATION = /estimated_?total_?program_?time|estimatedtotalprogramtime|program_?duration|total_?time/i;
const REMAINING = /remaining_?program_?time|remainingprogramtime|program_?finish_?time|programma_?eindtijd|remain(?:ing)?_?time|completion_?time/i;
const PROGRESS = /program_?progress|programprogress|programma_?voortgang/i;

/*
 * Soort, naam en wat hij ongeveer vraagt. Naast de woorden de modelcodes van
 * Bosch en Siemens (Home Connect): WT is een droger, WA of WG een wasmachine.
 */
const KINDS: readonly [RegExp, ApplianceKind, string, number][] = [
  [/dryer|droger|tumble|(?:^|[^a-z0-9])wt[a-z]{0,2}\d{2}/i, 'droger', 'Droger', 700],
  [/dish|vaat/i, 'vaatwasser', 'Vaatwasser', 1800],
  [/wash|wasma|(?:^|[^a-z0-9])w[ag][a-z]{0,2}\d{2}/i, 'wasmachine', 'Wasmachine', 2000],
];

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Apparaten die op afstand kunnen starten, zoals een droger van Home Connect.
 *
 * Herkend aan een sensor "op afstand starten toegestaan"; de bedrijfsstatus en
 * de duur van het programma komen van hetzelfde apparaat in Home Assistant.
 */
export function findAppliances(
  states: ReadonlyMap<string, HaEntityState>,
  entities: readonly HaRegistryEntity[],
  devices: readonly HaDevice[],
): FoundAppliance[] {
  const out: FoundAppliance[] = [];
  const used = new Set<string>();
  for (const e of entities) {
    if (!e.entity_id.startsWith('binary_sensor.') || !REMOTE_START.test(e.entity_id) || e.disabled_by || !e.device_id) continue;
    if (!states.has(e.entity_id)) continue;
    const mine = entities.filter((x) => x.device_id === e.device_id && !x.disabled_by && states.has(x.entity_id));
    const operation = mine.find((x) => x.entity_id.startsWith('sensor.') && OPERATION.test(x.entity_id)) ?? mine.find((x) => OPERATION_KAAL.test(x.entity_id));
    const duration = mine.find((x) => x.entity_id.startsWith('sensor.') && DURATION.test(x.entity_id));
    const remaining = mine.find((x) => x.entity_id.startsWith('sensor.') && REMAINING.test(x.entity_id));
    const progress = mine.find((x) => x.entity_id.startsWith('sensor.') && PROGRESS.test(x.entity_id));
    const device = devices.find((d) => d.id === e.device_id);
    const deviceName = device?.name_by_user ?? device?.name ?? '';
    const hint = `${deviceName} ${mine.map((x) => x.entity_id).join(' ')}`;
    const [, soort, standaard, watt] = KINDS.find(([re]) => re.test(hint)) ?? [null, 'apparaat' as const, 'Apparaat', 1000];
    const naam = device?.name_by_user?.trim() || standaard;
    let id = slug(soort === 'apparaat' ? naam : soort) || 'apparaat';
    for (let i = 2; used.has(id); i++) id = `${slug(soort)}-${i}`;
    used.add(id);
    out.push({
      id,
      naam,
      soort,
      remoteStart: e.entity_id,
      ...(operation ? { operationState: operation.entity_id } : {}),
      ...(duration ? { programDuration: duration.entity_id } : {}),
      ...(remaining ? { remainingTime: remaining.entity_id } : {}),
      ...(progress ? { programProgress: progress.entity_id } : {}),
      estimatedW: watt,
    });
  }
  return out;
}

/* ---------------------------------------------------------- de zonnesensor */

/** Hoe vaak de zonnesensor een nieuwe waarde geeft, gemeten overdag (besluit 89). */
export class SensorPace {
  readonly #times: number[] = [];

  /** Een nieuwe waarde; alleen als er zon is, want 's nachts staat hij op 0. */
  note(atMs: number, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    const last = this.#times.at(-1);
    if (last != null && atMs <= last) return;
    // Na een lange stilte (de nacht, een herstart) begint het tellen opnieuw.
    if (last != null && atMs - last > 60 * 60_000) this.#times.length = 0;
    this.#times.push(atMs);
    if (this.#times.length > 41) this.#times.shift();
  }

  /** De mediaan tussen twee waarden, in seconden, of null met te weinig metingen. */
  get intervalS(): number | null {
    if (this.#times.length < 6) return null;
    const gaps = this.#times.slice(1).map((t, i) => t - this.#times[i]!).sort((a, b) => a - b);
    return Math.round(gaps[Math.floor(gaps.length / 2)]! / 1000);
  }
}

/** Merk en weg naar lokaal, uit de integratie van de sensor (besluit 89). */
export function solarBrand(platform: string | null, lang: Lang = 'nl'): { merk: string | null; lokaal: boolean | null; weg: string } {
  const p = (platform ?? '').toLowerCase();
  const w = WEG[lang];
  if (p === 'solaredge_modbus_multi' || p === 'solaredge_modbus') return { merk: 'SolarEdge', lokaal: true, weg: '' };
  if (p === 'solaredge') return { merk: 'SolarEdge', lokaal: false, weg: w.solaredge };
  if (p.startsWith('growatt')) return { merk: 'Growatt', lokaal: p !== 'growatt_server', weg: w.growatt };
  return { merk: null, lokaal: null, weg: w.kwh };
}

/** Hoe de zon sneller te meten is, per taal (besluit 185). */
const WEG: Readonly<Record<Lang, { readonly kwh: string; readonly solaredge: string; readonly growatt: string }>> = {
  nl: {
    kwh: 'Een kWh-meter op de groep van de panelen, naast de P1-meter: zelf te doen of door een installateur.',
    solaredge: 'Zet Modbus TCP aan in SetApp en gebruik de integratie SolarEdge Modbus Multi. Geavanceerd, soms via de installateur.',
    growatt: 'RS485 naar het netwerk (bijvoorbeeld een Elfin EW11) of een USB-stick aan Home Assistant. Geavanceerd.',
  },
  en: {
    kwh: 'A kWh meter on the circuit of the panels, next to the P1 meter: do it yourself or have an installer do it.',
    solaredge: 'Turn on Modbus TCP in SetApp and use the SolarEdge Modbus Multi integration. Advanced, sometimes through the installer.',
    growatt: 'RS485 to the network (for example an Elfin EW11) or a USB stick on Home Assistant. Advanced.',
  },
};

/* --------------------------------------------------------- de regeling */

export interface Applied {
  /** De configuratie zoals de regeling hem leest. */
  readonly raw: Record<string, unknown>;
  /** Wat de antwoorden toevoegden, in gewone woorden. */
  readonly toegevoegd: readonly string[];
  /** Wat niet kon, en waarom. */
  readonly overgeslagen: readonly string[];
}

/**
 * Vult de configuratie aan met de antwoorden. De zekering uit de app gaat voor
 * (besluit 117); apparaten op zon alleen waar de configuratie zwijgt.
 *
 * Zuiver: het resultaat gaat daarna door het eigen schema, en deugt het niet,
 * dan start de dienst met de configuratie zoals hij was.
 */
export function withConnection(raw: Record<string, unknown>, answers: ConnectionAnswers | null): Applied {
  if (answers == null) return { raw, toegevoegd: [], overgeslagen: [] };
  const out: Record<string, unknown> = { ...raw };
  const toegevoegd: string[] = [];
  const overgeslagen: string[] = [];

  const fuse = answers.zekering;
  if (fuse != null && fuse !== 'weetniet') {
    const grid = typeof raw['grid'] === 'object' && raw['grid'] != null ? (raw['grid'] as Record<string, unknown>) : null;
    const configPhases = Array.isArray(grid?.['phases']) ? (grid['phases'] as Record<string, unknown>[]) : [];
    const phases = answers.fasen.slice(0, fuse.fasen);
    if (configPhases.length === fuse.fasen) {
      // De configuratie noemt de meters al: alleen de zekering komt uit de app.
      if (configPhases.some((ph) => ph['maxA'] !== fuse.ampere)) {
        out['grid'] = { ...grid, phases: configPhases.map((ph) => ({ ...ph, maxA: fuse.ampere })) };
        toegevoegd.push(`de hoofdzekering: ${fuse.fasen} × ${fuse.ampere} A`);
      }
    } else if (phases.length === fuse.fasen) {
      out['grid'] = { phases: phases.map((ph) => ({ ...ph, maxA: fuse.ampere })), marginA: typeof grid?.['marginA'] === 'number' ? grid['marginA'] : 2 };
      toegevoegd.push(`het stroombudget: ${fuse.fasen} × ${fuse.ampere} A`);
    } else {
      overgeslagen.push(`${fuse.fasen} × ${fuse.ampere} A, maar ${answers.fasen.length === 1 ? 'één stroommeter' : `${answers.fasen.length} stroommeters`} per fase gevonden`);
    }
  }

  const alles = Array.isArray(raw['deferrables']) ? (raw['deferrables'] as Record<string, unknown>[]) : [];
  // Wat de bewoner uitzette, gaat eruit (besluit 167).
  const uit = new Set(answers.opZonUit ?? []);
  const existing = alles.filter((d) => !uit.has(String(d['id'])));
  for (const d of alles) if (uit.has(String(d['id']))) toegevoegd.push(`${String(d['name'] ?? d['id'])} niet meer op zon`);
  if (existing.length !== alles.length) {
    if (existing.length) out['deferrables'] = existing;
    else delete out['deferrables'];
  }
  const known = new Set(alles.flatMap((d) => [String(d['id']), String(d['remoteStart'])]));
  const added = answers.apparaten
    .filter((a) => a.opZon && !known.has(a.id) && !known.has(a.remoteStart))
    .map((a) => ({
      id: a.id,
      name: a.naam,
      remoteStart: a.remoteStart,
      ...(a.operationState ? { operationState: a.operationState } : {}),
      ...(a.programDuration ? { programDuration: a.programDuration } : {}),
      ...(a.remainingTime ? { remainingTime: a.remainingTime } : {}),
      ...(a.programProgress ? { programProgress: a.programProgress } : {}),
      estimatedW: a.estimatedW,
      latestStart: '15:00',
    }));
  if (added.length > 0) {
    out['deferrables'] = [...existing, ...added];
    for (const a of added) toegevoegd.push(`${a.name} op zon`);
  }

  // De boiler en de jacuzzi (besluit 186), op dezelfde manier: uit wat de bewoner uitzette, erbij wat aan staat.
  const buffers = Array.isArray(raw['heatStores']) ? (raw['heatStores'] as Record<string, unknown>[]) : [];
  const blijven = buffers.filter((h) => !uit.has(String(h['id'])));
  for (const h of buffers) if (uit.has(String(h['id']))) toegevoegd.push(`${String(h['name'] ?? h['id'])} niet meer op zon`);
  if (blijven.length !== buffers.length) {
    if (blijven.length) out['heatStores'] = blijven;
    else delete out['heatStores'];
  }
  const bekend = new Set(buffers.flatMap((h) => [String(h['id']), typeof h['actuator'] === 'string' ? h['actuator'] : String((h['actuator'] as { id?: unknown } | undefined)?.id)]));
  const nieuw = (answers.buffers ?? []).filter((b) => b.opZon && !bekend.has(b.id) && !bekend.has(b.actuator)).map(heatStoreConfig);
  if (nieuw.length > 0) {
    out['heatStores'] = [...blijven, ...nieuw];
    for (const b of nieuw) toegevoegd.push(`${String(b['name'])} op zon`);
  }
  return { raw: out, toegevoegd, overgeslagen };
}

/* ------------------------------------------------------------ bewaren */

export type ConnectionCheck = { ok: true; answers: ConnectionAnswers } | { ok: false; reden: string };

/**
 * Leest wat de pagina stuurde: alleen antwoorden. De stroommeters en apparaten
 * komen van deze kant (`found`), en alleen een apparaat dat daar bij staat,
 * kan op zon.
 */
export function validateConnection(
  body: unknown,
  found: { fasen: readonly FoundPhase[]; apparaten: readonly FoundAppliance[]; buffers?: readonly FoundHeatStore[]; meting?: Meting | null; omvormerGevonden?: number | null },
): ConnectionCheck {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, reden: 'verwacht een object' };
  const b = body as Record<string, unknown>;
  const p = (typeof b['panelen'] === 'object' && b['panelen'] != null ? b['panelen'] : {}) as Record<string, unknown>;

  const ligging = p['ligging'] ?? null;
  if (ligging !== null && !PANEL_SIDES.includes(ligging as PanelSide)) return { ok: false, reden: 'onbekende ligging van de panelen' };
  const count = (v: unknown): number | null | false =>
    v == null ? null : Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 200 ? (v as number) : false;
  const both = ligging === 'beide';
  const voorkant = both ? count(p['voorkant']) : null;
  const achterkant = both ? count(p['achterkant']) : null;
  // Zonder panelen geen aantal (besluit 158).
  const given = ligging === 'geen' ? null : count(p['aantal']);
  if (voorkant === false || achterkant === false || given === false) {
    return { ok: false, reden: 'het aantal panelen is een heel getal van 1 tot 200' };
  }
  // Bij beide kanten telt het aantal per kant; het totaal volgt daaruit.
  const aantal = both && voorkant != null && achterkant != null ? voorkant + achterkant : given;

  let zekering: Fuse | 'weetniet' | null = null;
  const z = b['zekering'] ?? null;
  if (z === 'weetniet') zekering = 'weetniet';
  else if (z !== null) {
    const zz = z as Record<string, unknown>;
    const fasen = zz['fasen'];
    const ampere = zz['ampere'];
    if ((fasen !== 1 && fasen !== 3) || !Number.isInteger(ampere) || (ampere as number) < 6 || (ampere as number) > 250) {
      return { ok: false, reden: 'een zekering is 1 of 3 fasen, van 6 tot 250 A' };
    }
    zekering = { fasen, ampere: ampere as number };
  }

  const tarief = b['tarief'] ?? null;
  if (tarief !== null && !TARIFFS.includes(tarief as Tariff)) return { ok: false, reden: 'onbekend stroomcontract' };

  // De verwarming (besluit 122): wat het is en de aanvoertemperatuur; allebei mag leeg.
  const vw = (typeof b['verwarming'] === 'object' && b['verwarming'] != null ? b['verwarming'] : {}) as Record<string, unknown>;
  const soort = vw['soort'] ?? null;
  if (soort !== null && !HEATERS.includes(soort as Heater)) return { ok: false, reden: 'onbekende verwarming' };
  const aanvoer = vw['aanvoerC'] ?? null;
  if (aanvoer !== null && (typeof aanvoer !== 'number' || !Number.isInteger(aanvoer) || aanvoer < SUPPLY_C.min || aanvoer > SUPPLY_C.max)) {
    return { ok: false, reden: `de aanvoertemperatuur is een heel getal van ${SUPPLY_C.min} tot ${SUPPLY_C.max} °C` };
  }

  // Wanneer de zon op de voorkant schijnt, en het dak (besluit 157).
  const voorkantZon = b['voorkantZon'] ?? null;
  if (voorkantZon !== null && !VOORKANT_ZON.includes(voorkantZon as VoorkantZon)) return { ok: false, reden: 'onbekend antwoord bij de voorkant' };
  const panelen = { ligging: ligging as PanelSide | null, aantal, voorkant, achterkant };
  const dak = readDak(b['dak'] ?? null, panelen, voorkantZon as VoorkantZon | null, found);
  if (dak !== null && 'fout' in dak) return { ok: false, reden: dak.fout };

  const opZonRaw = (typeof b['opZon'] === 'object' && b['opZon'] != null ? b['opZon'] : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(opZonRaw)) {
    if (typeof v !== 'boolean') return { ok: false, reden: `"op zon" is ja of nee (${id})` };
    if (!found.apparaten.some((a) => a.id === id) && !(found.buffers ?? []).some((b) => b.id === id)) return { ok: false, reden: `onbekend apparaat: ${id}` };
  }
  // Apparaten uit de configuratie die uit moeten (besluit 167): een lijst namen.
  const uitRaw = b['opZonUit'] ?? [];
  if (!Array.isArray(uitRaw) || uitRaw.length > 20 || uitRaw.some((x) => typeof x !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(x))) return { ok: false, reden: 'opZonUit is een lijst apparaten' };

  // Panelen op de garage, carport of het tuinhuis (besluit 187): per plek een aantal.
  const eldersRaw = b['elders'] ?? null;
  const elders: Elders = {};
  if (eldersRaw !== null) {
    if (typeof eldersRaw !== 'object' || Array.isArray(eldersRaw)) return { ok: false, reden: 'elders is per plek een aantal panelen' };
    for (const [plek, n] of Object.entries(eldersRaw as Record<string, unknown>)) {
      if (!ELDERS_PLEKKEN.includes(plek as (typeof ELDERS_PLEKKEN)[number])) return { ok: false, reden: `onbekende plek voor panelen: ${plek}` };
      if (n == null || n === 0) continue;
      if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 200) return { ok: false, reden: 'het aantal panelen is een heel getal van 1 tot 200' };
      elders[plek as (typeof ELDERS_PLEKKEN)[number]] = n as number;
    }
  }

  // De thermostaat van de ketel (besluit 167): een klimaatapparaat uit de app, "geen", of leeg.
  const thermostaat = vw['thermostaat'] ?? null;
  if (thermostaat !== null && (typeof thermostaat !== 'string' || !/^[a-z0-9_.:-]{1,160}$/i.test(thermostaat))) return { ok: false, reden: 'de thermostaat is een apparaat uit Home Assistant' };

  return {
    ok: true,
    answers: {
      versie: 1,
      panelen,
      zekering,
      tarief: tarief as Tariff | null,
      verwarming: { soort: soort as Heater | null, aanvoerC: aanvoer as number | null, ...(thermostaat ? { thermostaat: thermostaat as string } : {}) },
      voorkantZon: voorkantZon as VoorkantZon | null,
      dak,
      ...(Object.keys(elders).length ? { elders } : {}),
      fasen: [...found.fasen],
      apparaten: found.apparaten.map((a) => ({ ...a, opZon: opZonRaw[a.id] === true })),
      ...((found.buffers ?? []).length ? { buffers: found.buffers!.map((b) => ({ ...b, opZon: opZonRaw[b.id] === true })) } : {}),
      ...(uitRaw.length ? { opZonUit: [...new Set(uitRaw as string[])] } : {}),
    },
  };
}

const getal = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/**
 * Het dak zoals de pagina het stuurt (besluit 157): `"voorstel"` (klopt, de
 * meting van nu), `{ aanpassen: … }` (verbeterd), het bewaarde dak terug, of
 * null. Een bewaard dak dat niet meer bij de kant van het dak past, vervalt.
 */
function readDak(
  raw: unknown,
  panelen: ConnectionAnswers['panelen'],
  zon: VoorkantZon | null,
  found: { meting?: Meting | null; omvormerGevonden?: number | null },
): Dak | { fout: string } | null {
  if (raw == null) return null;
  if (raw === 'voorstel') {
    if (found.meting == null) return { fout: 'er is nog geen meting om te bevestigen' };
    return dakUitMeting(found.meting, panelen, zon, found.omvormerGevonden ?? null);
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { fout: 'onbekend dak' };
  const r = raw as Record<string, unknown>;
  const omvormer = (v: unknown) => (v == null ? null : getal(v, 100, 100_000) ? Math.round(v as number) : false);
  if (typeof r['aanpassen'] === 'object' && r['aanpassen'] != null) {
    const a = r['aanpassen'] as Record<string, unknown>;
    const omvormerW = omvormer(a['omvormerW']);
    if (!getal(a['voorgevelDeg'], 0, 360) || !getal(a['hellingDeg'], 0, 90) || !getal(a['wpPerPaneel'], 50, 1000) || omvormerW === false) {
      return { fout: 'de voorkant is 0 tot 360°, de helling 0 tot 90°, een paneel 50 tot 1000 Wp' };
    }
    return dakUitAanpassing({ voorgevelDeg: a['voorgevelDeg'] as number, hellingDeg: a['hellingDeg'] as number, wpPerPaneel: a['wpPerPaneel'] as number, omvormerW }, panelen, found.meting ?? null);
  }
  const vlakken = Array.isArray(r['vlakken']) ? (r['vlakken'] as Record<string, unknown>[]) : [];
  const omvormerW = omvormer(r['omvormerW']);
  const ok =
    (r['voorgevelDeg'] == null || getal(r['voorgevelDeg'], 0, 360)) &&
    vlakken.length >= 1 &&
    vlakken.length <= 4 &&
    vlakken.every((v) => typeof v === 'object' && v != null && getal(v['azimuthDeg'], 0, 360) && getal(v['tiltDeg'], 0, 90) && getal(v['peakW'], 1, 100_000)) &&
    omvormerW !== false &&
    (r['bron'] === 'gemeten' || r['bron'] === 'bewoner');
  if (!ok) return { fout: 'onbekend dak' };
  // Een andere kant van het dak of een ander aantal dan bij het bevestigen: dan klopt het niet meer.
  if ((r['kant'] ?? null) !== panelen.ligging || (r['aantal'] ?? null) !== (aantalVan(panelen)?.totaal ?? null)) return null;
  return {
    voorgevelDeg: r['voorgevelDeg'] == null ? null : (r['voorgevelDeg'] as number),
    vlakken: vlakken.map((v) => ({ azimuthDeg: v['azimuthDeg'] as number, tiltDeg: v['tiltDeg'] as number, peakW: v['peakW'] as number })),
    omvormerW,
    bron: r['bron'] as Dak['bron'],
    kant: panelen.ligging,
    aantal: aantalVan(panelen)?.totaal ?? null,
  };
}

/** Een bewaard bestand terug; wat niet klopt, telt als niet beantwoord. */
function readAnswers(raw: unknown): ConnectionAnswers | null {
  if (typeof raw !== 'object' || raw == null || (raw as { versie?: unknown }).versie !== 1) return null;
  const r = raw as Record<string, unknown>;
  const fasen = Array.isArray(r['fasen']) ? (r['fasen'] as FoundPhase[]).filter((f) => /^L[123]$/.test(String(f?.id)) && typeof f.current === 'string') : [];
  const apparaten = Array.isArray(r['apparaten'])
    ? (r['apparaten'] as (FoundAppliance & { opZon: boolean })[]).filter(
        (a) => typeof a?.id === 'string' && typeof a.naam === 'string' && typeof a.remoteStart === 'string' && typeof a.estimatedW === 'number',
      )
    : [];
  // De boiler en de jacuzzi (besluit 186): alleen wat compleet is.
  const buffers = Array.isArray(r['buffers'])
    ? (r['buffers'] as (FoundHeatStore & { opZon: boolean })[]).filter(
        (b) => typeof b?.id === 'string' && typeof b.naam === 'string' && typeof b.actuator === 'string' && (b.soort === 'boiler' || b.soort === 'jacuzzi') && ['switch', 'setpoint', 'diverter'].includes(b.control) && typeof b.estimatedW === 'number',
      )
    : [];
  const checked = validateConnection(
    { ...r, opZon: Object.fromEntries([...apparaten, ...buffers].map((a) => [a.id, a.opZon === true])), opZonUit: Array.isArray(r['opZonUit']) ? r['opZonUit'] : [] },
    { fasen, apparaten, buffers },
  );
  return checked.ok ? checked.answers : null;
}

export class ConnectionStore {
  readonly #path: string;
  #current: ConnectionAnswers | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#path = join(logDir, CONNECTION_FILE);
  }

  async load(): Promise<ConnectionAnswers | null> {
    try {
      this.#current = readAnswers(JSON.parse(await readFile(this.#path, 'utf-8')));
    } catch {
      this.#current = null;
    }
    return this.#current;
  }

  get current(): ConnectionAnswers | null {
    return this.#current;
  }

  async save(answers: ConnectionAnswers): Promise<void> {
    this.#current = answers;
    const text = `${JSON.stringify(answers, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    // Eerst naast het bestand, dan omwisselen; na elkaar, nooit door elkaar.
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
  }
}

/* ------------------------------------------------------------ de pagina */

const COMPASS: Readonly<Record<Lang, readonly string[]>> = {
  nl: ['op het noorden', 'op het noordoosten', 'op het oosten', 'op het zuidoosten', 'op het zuiden', 'op het zuidwesten', 'op het westen', 'op het noordwesten'],
  en: ['facing north', 'facing north-east', 'facing east', 'facing south-east', 'facing south', 'facing south-west', 'facing west', 'facing north-west'],
};
const compass = (deg: number, lang: Lang) => COMPASS[lang][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

export interface ConnectionView {
  /** Wat de bewoner antwoordde, zonder de entiteiten die de dienst erbij zocht. */
  readonly antwoorden: {
    readonly panelen: ConnectionAnswers['panelen'];
    readonly zekering: ConnectionAnswers['zekering'];
    readonly tarief: Tariff | null;
    readonly verwarming: Verwarming;
    readonly voorkantZon: VoorkantZon | null;
    readonly dak: Dak | null;
    /** Panelen op de garage, carport of het tuinhuis (besluit 187). */
    readonly elders: Elders;
    readonly opZon: Readonly<Record<string, boolean>>;
    readonly opZonUit: readonly string[];
  } | null;
  /** Hoe de panelen liggen (besluit 157): wat geldt, het voorstel uit de meting, en de dag erbij. */
  readonly ligging: LiggingView;
  readonly gevonden: { readonly fasen: readonly FoundPhase['id'][]; readonly apparaten: readonly { id: string; naam: string; soort: ApplianceKind | FoundHeatStore['soort'] }[] };
  /** Wat de configuratie van het huis al vastlegt; dat gaat voor. */
  readonly configuratie: {
    readonly zekering: Fuse | null;
    readonly apparaten: readonly { id: string; naam: string }[];
    readonly panelen: readonly string[];
  };
  readonly zonnesensor: {
    readonly naam: string;
    readonly intervalS: number | null;
    readonly snelGenoeg: boolean | null;
    readonly merk: string | null;
    readonly weg: string;
  } | null;
  /** Wat de antwoorden bij de laatste start aan de regeling toevoegden. */
  readonly inDeRegeling: { readonly toegevoegd: readonly string[]; readonly overgeslagen: readonly string[] };
  /** Is er sinds de start iets veranderd dat pas bij de volgende start meetelt? */
  readonly volgendeStart: boolean;
}

export interface ConnectionContext {
  /** De configuratie zoals in het bestand, zonder de antwoorden. */
  readonly base: SiteConfig;
  readonly found: { readonly fasen: readonly FoundPhase[]; readonly apparaten: readonly FoundAppliance[]; readonly buffers?: readonly FoundHeatStore[] };
  readonly applied: Pick<Applied, 'toegevoegd' | 'overgeslagen'>;
  /** De antwoorden bij de start, om te zien of er iets veranderde. */
  readonly answersAtStart: ConnectionAnswers | null;
  readonly answers: ConnectionAnswers | null;
  readonly solar: { readonly naam: string; readonly intervalS: number | null; readonly platform: string | null } | null;
  /** De ligging gemeten uit de opbrengst, of null (besluit 157). */
  readonly meting?: Meting | null;
  /** De omvormer uit zijn typenummer in Home Assistant. */
  readonly omvormerGevonden?: number | null;
}

export function connectionView(c: ConnectionContext, lang: Lang = 'nl'): ConnectionView {
  const grid = c.base.grid;
  const planes = c.base.geometry?.solarPlanes ?? [];
  const brand = c.solar ? solarBrand(c.solar.platform, lang) : null;
  const relevant = (a: ConnectionAnswers | null) =>
    JSON.stringify(a ? [a.zekering, a.fasen, a.apparaten.filter((x) => x.opZon).map((x) => x.id), (a.buffers ?? []).filter((x) => x.opZon).map((x) => x.id), [...(a.opZonUit ?? [])].sort()] : null);
  return {
    antwoorden: c.answers
      ? {
          panelen: c.answers.panelen,
          zekering: c.answers.zekering,
          tarief: c.answers.tarief,
          verwarming: c.answers.verwarming ?? { soort: null, aanvoerC: null },
          voorkantZon: c.answers.voorkantZon ?? null,
          dak: c.answers.dak ?? null,
          elders: c.answers.elders ?? {},
          opZon: Object.fromEntries([...c.answers.apparaten, ...(c.answers.buffers ?? [])].map((a) => [a.id, a.opZon])),
          opZonUit: c.answers.opZonUit ?? [],
        }
      : null,
    ligging: liggingView({
      configuratie: c.base.geometry,
      dak: c.answers?.dak ?? null,
      meting: c.meting ?? null,
      panelen: c.answers?.panelen ?? null,
      voorkantZon: c.answers?.voorkantZon ?? null,
      omvormerGevonden: c.omvormerGevonden ?? null,
    }, lang),
    gevonden: {
      fasen: c.found.fasen.map((f) => f.id),
      apparaten: [...c.found.apparaten.map(({ id, naam, soort }) => ({ id, naam, soort })), ...(c.found.buffers ?? []).map(({ id, naam, soort }) => ({ id, naam, soort }))],
    },
    configuratie: {
      zekering: grid && grid.phases.length > 0 ? { fasen: grid.phases.length === 3 ? 3 : 1, ampere: grid.phases[0]!.maxA } : null,
      apparaten: [...(c.base.deferrables ?? []), ...(c.base.heatStores ?? [])].map((d) => ({ id: d.id, naam: d.name })),
      panelen: planes.map((pl) => `${(pl.peakW / 1000).toLocaleString(lang === 'nl' ? 'nl-NL' : 'en-GB', { maximumFractionDigits: 1 })} kWp ${compass(pl.azimuthDeg, lang)}, ${Math.round(pl.tiltDeg)}°`),
    },
    zonnesensor: c.solar
      ? {
          naam: c.solar.naam,
          intervalS: c.solar.intervalS,
          // Eens per twee minuten of vaker is snel genoeg (besluit 89).
          snelGenoeg: c.solar.intervalS == null ? null : c.solar.intervalS <= 120,
          merk: brand?.merk ?? null,
          weg: brand?.weg ?? '',
        }
      : null,
    // Alleen de twee lijsten: `withConnection` geeft ook de hele configuratie
    // terug (`raw`), met entiteiten, en die hoort niet op de pagina (besluit 45).
    inDeRegeling: { toegevoegd: c.applied.toegevoegd, overgeslagen: c.applied.overgeslagen },
    volgendeStart: relevant(c.answers) !== relevant(c.answersAtStart),
  };
}
