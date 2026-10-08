/**
 * De zon en je aansluiting (besluit 103, schets Onboarding-Zon).
 *
 * Een paar dingen haalt de app niet uit Home Assistant: waar de panelen liggen,
 * hoe zwaar de hoofdzekering is, welk stroomcontract je hebt, en of een
 * apparaat dat op afstand kan starten op zon mag beginnen. Die vraagt de app,
 * en de antwoorden staan in `aansluiting.json` naast de dataset.
 *
 * De regeling leest mee waar de configuratie van het huis zwijgt: zonder `grid`
 * wordt de zekering met de gevonden stroommeters het stroombudget (78), en een
 * apparaat op zon dat de configuratie niet noemt, wordt uitstelbaar (98). Wat
 * de configuratie wel noemt, gaat altijd voor. Dat gebeurt bij het starten van
 * de dienst; een nieuw antwoord gaat in bij de volgende start.
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

export const CONNECTION_FILE = 'aansluiting.json';

export const PANEL_SIDES = ['voorkant', 'achterkant', 'beide', 'plat', 'weetniet'] as const;
export type PanelSide = (typeof PANEL_SIDES)[number];
export const TARIFFS = ['vast', 'dynamisch', 'weetniet'] as const;
export type Tariff = (typeof TARIFFS)[number];
/** De zekeringen uit de schets; een andere waarde mag ook, binnen het schema. */
export const FUSES = [
  { fasen: 1, ampere: 25 },
  { fasen: 1, ampere: 35 },
  { fasen: 3, ampere: 25 },
] as const;

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
  /** De stroommeters zoals bij het bewaren gevonden, zodat de regeling ze bij het starten kent. */
  readonly fasen: readonly FoundPhase[];
  readonly apparaten: readonly (FoundAppliance & { readonly opZon: boolean })[];
}

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

const REMOTE_START = /remote_?(?:control_?)?start_?allowed|remotecontrolstartallowed|remote_?start/i;
const OPERATION = /operation_?state|operationstate|programma_?status|program_?state/i;
const DURATION = /estimated_?total_?program_?time|estimatedtotalprogramtime|program_?duration/i;

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
    const operation = mine.find((x) => x.entity_id.startsWith('sensor.') && OPERATION.test(x.entity_id));
    const duration = mine.find((x) => x.entity_id.startsWith('sensor.') && DURATION.test(x.entity_id));
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
export function solarBrand(platform: string | null): { merk: string | null; lokaal: boolean | null; weg: string } {
  const p = (platform ?? '').toLowerCase();
  const kwh = 'Een kWh-meter op de groep van de panelen, naast de P1-meter: zelf te doen of door een installateur.';
  if (p === 'solaredge_modbus_multi' || p === 'solaredge_modbus') return { merk: 'SolarEdge', lokaal: true, weg: '' };
  if (p === 'solaredge') {
    return { merk: 'SolarEdge', lokaal: false, weg: 'Zet Modbus TCP aan in SetApp en gebruik de integratie SolarEdge Modbus Multi. Geavanceerd, soms via de installateur.' };
  }
  if (p.startsWith('growatt')) {
    return { merk: 'Growatt', lokaal: p !== 'growatt_server', weg: 'RS485 naar het netwerk (bijvoorbeeld een Elfin EW11) of een USB-stick aan Home Assistant. Geavanceerd.' };
  }
  return { merk: null, lokaal: null, weg: kwh };
}

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
 * Vult de configuratie aan met de antwoorden, alleen waar hij zwijgt.
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
  if (fuse != null && fuse !== 'weetniet' && raw['grid'] === undefined) {
    const phases = answers.fasen.slice(0, fuse.fasen);
    if (phases.length === fuse.fasen) {
      out['grid'] = { phases: phases.map((ph) => ({ ...ph, maxA: fuse.ampere })), marginA: 2 };
      toegevoegd.push(`het stroombudget: ${fuse.fasen} × ${fuse.ampere} A`);
    } else {
      overgeslagen.push(`${fuse.fasen} × ${fuse.ampere} A, maar ${answers.fasen.length === 1 ? 'één stroommeter' : `${answers.fasen.length} stroommeters`} per fase gevonden`);
    }
  }

  const existing = Array.isArray(raw['deferrables']) ? (raw['deferrables'] as Record<string, unknown>[]) : [];
  const known = new Set(existing.flatMap((d) => [String(d['id']), String(d['remoteStart'])]));
  const added = answers.apparaten
    .filter((a) => a.opZon && !known.has(a.id) && !known.has(a.remoteStart))
    .map((a) => ({
      id: a.id,
      name: a.naam,
      remoteStart: a.remoteStart,
      ...(a.operationState ? { operationState: a.operationState } : {}),
      ...(a.programDuration ? { programDuration: a.programDuration } : {}),
      estimatedW: a.estimatedW,
      latestStart: '15:00',
    }));
  if (added.length > 0) {
    out['deferrables'] = [...existing, ...added];
    for (const a of added) toegevoegd.push(`${a.name} op zon`);
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
export function validateConnection(body: unknown, found: { fasen: readonly FoundPhase[]; apparaten: readonly FoundAppliance[] }): ConnectionCheck {
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
  const given = count(p['aantal']);
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

  const opZonRaw = (typeof b['opZon'] === 'object' && b['opZon'] != null ? b['opZon'] : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(opZonRaw)) {
    if (typeof v !== 'boolean') return { ok: false, reden: `"op zon" is ja of nee (${id})` };
    if (!found.apparaten.some((a) => a.id === id)) return { ok: false, reden: `onbekend apparaat: ${id}` };
  }

  return {
    ok: true,
    answers: {
      versie: 1,
      panelen: { ligging: ligging as PanelSide | null, aantal, voorkant, achterkant },
      zekering,
      tarief: tarief as Tariff | null,
      fasen: [...found.fasen],
      apparaten: found.apparaten.map((a) => ({ ...a, opZon: opZonRaw[a.id] === true })),
    },
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
  const checked = validateConnection(
    { ...r, opZon: Object.fromEntries(apparaten.map((a) => [a.id, a.opZon === true])) },
    { fasen, apparaten },
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

const COMPASS = ['het noorden', 'het noordoosten', 'het oosten', 'het zuidoosten', 'het zuiden', 'het zuidwesten', 'het westen', 'het noordwesten'];
const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

export interface ConnectionView {
  /** Wat de bewoner antwoordde, zonder de entiteiten die de dienst erbij zocht. */
  readonly antwoorden: {
    readonly panelen: ConnectionAnswers['panelen'];
    readonly zekering: ConnectionAnswers['zekering'];
    readonly tarief: Tariff | null;
    readonly opZon: Readonly<Record<string, boolean>>;
  } | null;
  readonly gevonden: { readonly fasen: readonly FoundPhase['id'][]; readonly apparaten: readonly { id: string; naam: string; soort: ApplianceKind }[] };
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
  readonly found: { readonly fasen: readonly FoundPhase[]; readonly apparaten: readonly FoundAppliance[] };
  readonly applied: Pick<Applied, 'toegevoegd' | 'overgeslagen'>;
  /** De antwoorden bij de start, om te zien of er iets veranderde. */
  readonly answersAtStart: ConnectionAnswers | null;
  readonly answers: ConnectionAnswers | null;
  readonly solar: { readonly naam: string; readonly intervalS: number | null; readonly platform: string | null } | null;
}

export function connectionView(c: ConnectionContext): ConnectionView {
  const grid = c.base.grid;
  const planes = c.base.geometry?.solarPlanes ?? [];
  const brand = c.solar ? solarBrand(c.solar.platform) : null;
  const relevant = (a: ConnectionAnswers | null) => JSON.stringify(a ? [a.zekering, a.fasen, a.apparaten.filter((x) => x.opZon).map((x) => x.id)] : null);
  return {
    antwoorden: c.answers
      ? {
          panelen: c.answers.panelen,
          zekering: c.answers.zekering,
          tarief: c.answers.tarief,
          opZon: Object.fromEntries(c.answers.apparaten.map((a) => [a.id, a.opZon])),
        }
      : null,
    gevonden: { fasen: c.found.fasen.map((f) => f.id), apparaten: c.found.apparaten.map(({ id, naam, soort }) => ({ id, naam, soort })) },
    configuratie: {
      zekering: grid && grid.phases.length > 0 ? { fasen: grid.phases.length === 3 ? 3 : 1, ampere: grid.phases[0]!.maxA } : null,
      apparaten: (c.base.deferrables ?? []).map((d) => ({ id: d.id, naam: d.name })),
      panelen: planes.map((pl) => `${(pl.peakW / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kWp op ${compass(pl.azimuthDeg)}, ${Math.round(pl.tiltDeg)}°`),
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
