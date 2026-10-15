/**
 * Van onbetrouwbare JSON naar een gevalideerde `SiteConfig`.
 *
 * Twee dingen maken dit meer dan een typecast.
 *
 * Ten eerste: er wordt niet geworpen bij de eerste fout. Een
 * onboarding-wizard die één probleem per keer meldt is onbruikbaar; je wilt
 * alles in één keer zien. Daarom levert de parser een lijst.
 *
 * Ten tweede: naast de vorm wordt ook de samenhang gecontroleerd. Een zone die
 * verwijst naar een actuator die niet bestaat is syntactisch prima JSON en
 * functioneel een storing om drie uur 's nachts. Dat soort fouten hoort hier
 * gevonden te worden, met een zin die zegt wat eraan mankeert.
 *
 * Bewust zonder validatiebibliotheek: de foutmeldingen zijn hier het product,
 * de verwijzingscontroles moeten sowieso met de hand, en een dienst die in een
 * container bij mensen thuis draait heeft baat bij een korte lijst
 * afhankelijkheden. Die afweging is omkeerbaar — het raakt alleen dit bestand.
 */

import {
  GEOMETRY_SOURCES,
  MODES,
  type Actuator,
  type Facade,
  type Geometry,
  type GridLimits,
  type GridPhase,
  type Deferrable,
  type SolarPlane,
  type ActuatorRole,
  type DeviceRef,
  type MeasurementPoint,
  type Mode,
  type SetpointPair,
  type SiteConfig,
  type ThermalMass,
  type Zone,
} from '../core/model.js';

/** De schemaversie die deze code begrijpt. */
export const SCHEMA_VERSION = 1;

export interface ConfigProblem {
  /** Waar het zit, in puntnotatie: `zones[1].setpoints.dag.heat`. */
  readonly path: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export type ConfigResult =
  | { readonly ok: true; readonly config: SiteConfig; readonly warnings: readonly ConfigProblem[] }
  | { readonly ok: false; readonly problems: readonly ConfigProblem[] };

const THERMAL_MASS: readonly ThermalMass[] = ['low', 'medium', 'high'];
const ROLES: readonly ActuatorRole[] = ['primary', 'assist'];

/** Verzamelt problemen met hun pad, zodat er niet bij de eerste fout gestopt hoeft te worden. */
class Problems {
  readonly #items: ConfigProblem[] = [];

  error(path: string, message: string): void {
    this.#items.push({ path, message, severity: 'error' });
  }

  warn(path: string, message: string): void {
    this.#items.push({ path, message, severity: 'warning' });
  }

  get errors(): ConfigProblem[] {
    return this.#items.filter((p) => p.severity === 'error');
  }

  get warnings(): ConfigProblem[] {
    return this.#items.filter((p) => p.severity === 'warning');
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function join(path: string, key: string | number): string {
  return typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key;
}

/** Leest een verplicht tekstveld. */
function str(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
): string | null {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim() === '') {
    p.error(join(path, key), v === undefined ? 'ontbreekt' : 'moet een niet-lege tekst zijn');
    return null;
  }
  return v;
}

interface NumOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  optional?: boolean;
}

function num(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  opts: NumOptions = {},
): number | null {
  const v = obj[key];
  if (v === undefined) {
    if (!opts.optional) p.error(join(path, key), 'ontbreekt');
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    p.error(join(path, key), 'moet een getal zijn');
    return null;
  }
  if (opts.integer && !Number.isInteger(v)) {
    p.error(join(path, key), 'moet een geheel getal zijn');
    return null;
  }
  if (opts.min !== undefined && v < opts.min) {
    p.error(join(path, key), `moet minstens ${opts.min} zijn, is ${v}`);
    return null;
  }
  if (opts.max !== undefined && v > opts.max) {
    p.error(join(path, key), `mag hoogstens ${opts.max} zijn, is ${v}`);
    return null;
  }
  return v;
}

function bool(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
): boolean | null {
  const v = obj[key];
  if (typeof v !== 'boolean') {
    p.error(join(path, key), v === undefined ? 'ontbreekt' : 'moet true of false zijn');
    return null;
  }
  return v;
}

function oneOf<T extends string>(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  allowed: readonly T[],
): T | null {
  const v = obj[key];
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    p.error(
      join(path, key),
      v === undefined
        ? `ontbreekt — kies uit ${allowed.join(', ')}`
        : `"${String(v)}" kan niet; kies uit ${allowed.join(', ')}`,
    );
    return null;
  }
  return v as T;
}

/*
 * Hieronder de tegenhangers van `str`, `num`, `bool` en `oneOf` die niet
 * klagen maar terugvallen.
 *
 * Ze bestaan sinds fase 6e stap 2. Daarvoor was bijna elk veld verplicht, wat
 * verdedigbaar leek — hoe explicieter de configuratie, hoe minder verrassingen.
 * Maar het maakte de drempel onneembaar: een nieuwe gebruiker moest 158
 * waarden aanleveren voordat er iets startte, en de meeste daarvan zijn keuzes
 * waar hij nog geen mening over heeft.
 *
 * De regel die we aanhouden: een standaardwaarde mag, zolang fout zijn
 * ongevaarlijk of behoudend is. Een verkeerd geraden schakelband kost comfort;
 * een verkeerd geraden `canHeat` laat de regeling verwarmen met een apparaat
 * dat dat niet kan. Die tweede soort blijft verplicht.
 *
 * Een fout blijft een fout: staat het veld er wél maar deugt het niet, dan is
 * dat geen reden om stilletjes iets anders te doen.
 */

/** Een tekstveld dat mag ontbreken en dan terugvalt. */
function strOr(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  fallback: string,
): string {
  if (obj[key] === undefined) return fallback;
  return str(p, obj, path, key) ?? fallback;
}

function numOr(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  fallback: number,
  opts: NumOptions = {},
): number {
  if (obj[key] === undefined) return fallback;
  return num(p, obj, path, key, opts) ?? fallback;
}

function boolOr(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  fallback: boolean,
): boolean {
  if (obj[key] === undefined) return fallback;
  return bool(p, obj, path, key) ?? fallback;
}

function oneOfOr<T extends string>(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (obj[key] === undefined) return fallback;
  return oneOf(p, obj, path, key, allowed) ?? fallback;
}

/** Een blok dat mag ontbreken. Geeft een leeg object terug in plaats van null. */
function blockOf(
  p: Problems,
  value: unknown,
  path: string,
): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    p.error(path, 'moet een object zijn');
    return null;
  }
  return value;
}

function arr(
  p: Problems,
  obj: Record<string, unknown>,
  path: string,
  key: string,
  { minLength = 0 } = {},
): unknown[] | null {
  const v = obj[key];
  if (!Array.isArray(v)) {
    p.error(join(path, key), v === undefined ? 'ontbreekt' : 'moet een lijst zijn');
    return null;
  }
  if (v.length < minLength) {
    p.error(join(path, key), `moet minstens ${minLength} item(s) bevatten`);
    return null;
  }
  return v;
}

/**
 * Een verwijzing naar een apparaat mag kort ("climate.beneden", gebruikt dan
 * `defaultAdapter`) of volledig ({adapter, id}). De korte vorm scheelt bij
 * handmatig schrijven en bij het genereren vanuit een wizard.
 */
function ref(
  p: Problems,
  value: unknown,
  path: string,
  defaultAdapter: string,
): DeviceRef | null {
  if (typeof value === 'string') {
    if (value.trim() === '') {
      p.error(path, 'mag niet leeg zijn');
      return null;
    }
    return { adapter: defaultAdapter, id: value };
  }
  if (isRecord(value)) {
    const adapter = str(p, value, path, 'adapter');
    const id = str(p, value, path, 'id');
    return adapter && id ? { adapter, id } : null;
  }
  p.error(path, 'moet een tekst zijn of een object met adapter en id');
  return null;
}

/**
 * Een meetpunt: net als `ref`, maar de waarde mag ook in een attribuut staan.
 *
 *   "sensor.woonkamer_temperatuur"
 *   { "id": "climate.thermostaat_badkamer", "attribute": "current_temperature" }
 *
 * De korte vorm blijft precies wat hij was. In de lange vorm is `adapter`
 * optioneel geworden — wie een attribuut opgeeft wil zelden ook nog een andere
 * adapter noemen, en de standaard klopt bijna altijd.
 */
function measurementPoint(
  p: Problems,
  value: unknown,
  path: string,
  defaultAdapter: string,
): MeasurementPoint | null {
  if (!isRecord(value) || value['attribute'] === undefined) {
    return ref(p, value, path, defaultAdapter);
  }
  const id = str(p, value, path, 'id');
  const attribute = str(p, value, path, 'attribute');
  const adapter = value['adapter'] === undefined ? defaultAdapter : str(p, value, path, 'adapter');
  if (!id || !attribute || !adapter) return null;
  return { adapter, id, attribute };
}

function refList(
  p: Problems,
  values: readonly unknown[],
  path: string,
  defaultAdapter: string,
): DeviceRef[] {
  const out: DeviceRef[] = [];
  values.forEach((v, i) => {
    const r = ref(p, v, join(path, i), defaultAdapter);
    if (r) out.push(r);
  });
  return out;
}

/*
 * Waar een zone naartoe regelt wanneer het bestand niets zegt.
 *
 * Alleen verwarmen. Een koeldrempel raden is de gevaarlijke richting: dan zou
 * een airco kunnen gaan draaien omdat wij een getal hebben verzonnen. Wie wil
 * koelen zegt dat zelf.
 *
 * `handmatig` blijft met opzet leeg — daar heeft de bewoner het stuur.
 */
const DEFAULT_SETPOINTS: Readonly<Record<Mode, SetpointPair>> = {
  dag: { heat: 20 },
  nacht: { heat: 17 },
  voorverwarmen: { heat: 20 },
  afwezig: { heat: 16 },
  vakantie: { heat: 12 },
  handmatig: {},
};

interface SetpointOutcome {
  readonly points: Record<Mode, SetpointPair>;
  /** Welke modi uit de standaardwaarden komen in plaats van uit het bestand. */
  readonly filled: ReadonlySet<Mode>;
}

function setpoints(
  p: Problems,
  value: unknown,
  path: string,
): SetpointOutcome | null {
  if (value === undefined) {
    p.warn(
      path,
      'ontbreekt; er wordt alleen verwarmd, volgens ' +
        `dag ${DEFAULT_SETPOINTS.dag.heat} / nacht ${DEFAULT_SETPOINTS.nacht.heat} / ` +
        `afwezig ${DEFAULT_SETPOINTS.afwezig.heat} / vakantie ${DEFAULT_SETPOINTS.vakantie.heat} °C`,
    );
    return { points: { ...DEFAULT_SETPOINTS }, filled: new Set(MODES) };
  }
  if (!isRecord(value)) {
    p.error(path, 'moet een object zijn');
    return null;
  }
  const filled = new Set<Mode>();
  for (const key of Object.keys(value)) {
    if (!(MODES as readonly string[]).includes(key)) {
      p.error(join(path, key), `"${key}" is geen bekende modus; kies uit ${MODES.join(', ')}`);
    }
  }
  const out = {} as Record<Mode, SetpointPair>;
  for (const mode of MODES) {
    const raw = value[mode];
    if (raw === undefined) {
      // Een deels ingevulde tabel aanvullen in plaats van afkeuren. Wie drie
      // modi heeft bedacht is niet van plan de andere drie te verbieden.
      out[mode] = { ...DEFAULT_SETPOINTS[mode] };
      filled.add(mode);
      continue;
    }
    if (!isRecord(raw)) {
      p.error(join(path, mode), 'moet een object zijn met heat en/of cool');
      continue;
    }
    const pair: { heat?: number; cool?: number } = {};
    const heat = num(p, raw, join(path, mode), 'heat', { min: 5, max: 35, optional: true });
    const cool = num(p, raw, join(path, mode), 'cool', { min: 5, max: 35, optional: true });
    if (heat != null) pair.heat = heat;
    if (cool != null) pair.cool = cool;
    if (pair.heat != null && pair.cool != null && pair.heat >= pair.cool) {
      p.error(
        join(path, mode),
        `verwarmen tot ${pair.heat} en koelen vanaf ${pair.cool} laat geen ruimte; ` +
          'de koeldrempel hoort boven de verwarmdrempel te liggen',
      );
    }
    out[mode] = pair;
  }
  return { points: out, filled };
}

function actuator(
  p: Problems,
  value: unknown,
  path: string,
  defaultAdapter: string,
): Actuator | null {
  if (!isRecord(value)) {
    p.error(path, 'moet een object zijn');
    return null;
  }
  const id = str(p, value, path, 'id');
  // Zonder naam is de id de naam. Een label is geen reden om niet te starten.
  const name = strOr(p, value, path, 'name', id ?? '');
  const refValue = ref(p, value['ref'], join(path, 'ref'), defaultAdapter);
  // `primary` is de behoudende aanname: het apparaat regelt zijn zone gewoon.
  // `assist` is de bijzondere rol — opportunistisch meedraaien op overschot —
  // en die kies je bewust.
  const role = oneOfOr(p, value, path, 'role', ROLES, 'primary');

  const capsRaw = value['capabilities'];
  let capabilities: Actuator['capabilities'] | null = null;
  if (!isRecord(capsRaw)) {
    p.error(join(path, 'capabilities'), 'ontbreekt of is geen object');
  } else {
    const cPath = join(path, 'capabilities');
    const canHeat = bool(p, capsRaw, cPath, 'canHeat');
    const canCool = bool(p, capsRaw, cPath, 'canCool');
    // Het bereik begrenst wat we naar het apparaat zouden sturen. Ontbreekt
    // het, dan nemen we de ruimste band die dit schema überhaupt toestaat: het
    // apparaat kapt zelf af, en te ruim raden kost hooguit een genegeerde
    // opdracht. Te krap raden zou juist regelruimte weggooien.
    const rangeRaw = capsRaw['setpointRange'];
    let min: number | null = rangeRaw === undefined ? 5 : null;
    let max: number | null = rangeRaw === undefined ? 35 : null;
    if (rangeRaw === undefined) {
      p.warn(
        join(cPath, 'setpointRange'),
        'ontbreekt; er wordt gerekend met 5-35 °C, wat ruimer is dan de meeste apparaten aankunnen',
      );
    }
    const range = rangeRaw === undefined ? null : arr(p, capsRaw, cPath, 'setpointRange');
    if (range) {
      if (range.length !== 2) {
        p.error(join(cPath, 'setpointRange'), 'moet precies twee getallen bevatten: [min, max]');
      } else {
        const [a, b] = range;
        if (typeof a !== 'number' || typeof b !== 'number') {
          p.error(join(cPath, 'setpointRange'), 'moet twee getallen bevatten');
        } else if (a >= b) {
          p.error(join(cPath, 'setpointRange'), `min ${a} moet kleiner zijn dan max ${b}`);
        } else {
          min = a;
          max = b;
        }
      }
    }
    let standby: { heat: number; cool: number } | undefined;
    const standbyRaw = capsRaw['standby'];
    if (standbyRaw !== undefined) {
      if (!isRecord(standbyRaw)) {
        p.error(join(cPath, 'standby'), 'moet een object zijn met heat en cool');
      } else {
        const sPath = join(cPath, 'standby');
        const h = num(p, standbyRaw, sPath, 'heat', { min: 5, max: 35 });
        const c = num(p, standbyRaw, sPath, 'cool', { min: 5, max: 35 });
        if (h != null && c != null) {
          if (h >= c) {
            p.error(
              sPath,
              `standby verwarmen op ${h} en koelen op ${c} klopt niet; ` +
                'verwarmen hoort naar beneden geduwd te worden en koelen naar boven',
            );
          } else {
            standby = { heat: h, cool: c };
            if (min != null && max != null && (h < min || c > max)) {
              p.error(
                sPath,
                `standby ${h}/${c} valt buiten het bereik ${min}-${max} van het apparaat`,
              );
            }
          }
        }
      }
    }
    if (canHeat != null && canCool != null && min != null && max != null) {
      if (!canHeat && !canCool) {
        p.error(cPath, 'een apparaat dat niet kan verwarmen en niet kan koelen doet niets');
      }
      capabilities = {
        canHeat,
        canCool,
        setpointRange: [min, max],
        ...(standby ? { standby } : {}),
      };
    }
  }

  /*
   * Het vermogen mag ontbreken — behalve bij een assist-apparaat.
   *
   * Voor een `primary` doet het niet mee: comfort vraagt `budgetW: 0` en wordt
   * nooit door het budget tegengehouden. Voor een `assist` is het de hele
   * grondslag: `pv-surplus` verdeelt overschot en een apparaat dat 0 W claimt
   * past altijd, hoe weinig er ook over is. Dat is de gevaarlijke richting, en
   * daarom blijft het daar verplicht.
   */
  const pPath = join(path, 'power');
  const powerRaw = blockOf(p, value['power'], pPath);
  let power: Actuator['power'] | null = null;
  if (powerRaw) {
    const given = powerRaw['estimatedW'] !== undefined;
    if (!given && role === 'assist') {
      p.error(
        join(pPath, 'estimatedW'),
        'ontbreekt; een assist-apparaat verdeelt overschot en een apparaat ' +
          'zonder vermogen past altijd, hoe weinig er ook over is',
      );
    } else {
      const estimatedW = numOr(p, powerRaw, pPath, 'estimatedW', 0, { min: 0, max: 50_000 });
      const sensorRaw = powerRaw['sensor'];
      const sensor =
        sensorRaw === undefined ? null : ref(p, sensorRaw, join(pPath, 'sensor'), defaultAdapter);
      power = { estimatedW, ...(sensor ? { sensor } : {}) };
    }
  }

  // Draaitijden beschermen het apparaat tegen klapperen. Ontbreken ze, dan
  // zijn deze waarden gebruikelijk en aan de veilige kant.
  const tPath = join(path, 'timing');
  const timingRaw = blockOf(p, value['timing'], tPath);
  let timing: Actuator['timing'] | null = null;
  if (timingRaw) {
    timing = {
      minRunMinutes: numOr(p, timingRaw, tPath, 'minRunMinutes', 10, { min: 0, max: 240 }),
      minRestMinutes: numOr(p, timingRaw, tPath, 'minRestMinutes', 5, { min: 0, max: 240 }),
      settleMinutes: numOr(p, timingRaw, tPath, 'settleMinutes', 2, { min: 0, max: 60 }),
    };
  }

  // Ook op zon (besluit 132): net als een assist alleen met een vermogen, anders past hij altijd.
  const onSurplusRaw = value['onSurplus'];
  let onSurplus = false;
  if (onSurplusRaw !== undefined) {
    if (typeof onSurplusRaw !== 'boolean') p.error(join(path, 'onSurplus'), 'is waar of onwaar');
    else onSurplus = onSurplusRaw;
  }
  if (onSurplus && power && power.estimatedW <= 0) {
    p.error(join(join(path, 'power'), 'estimatedW'), 'ontbreekt; een apparaat dat op zon mag, verdeelt overschot en heeft een vermogen nodig');
  }

  if (!id || !name || !refValue || !role || !capabilities || !power || !timing) return null;
  return { id, name, ref: refValue, role, capabilities, power, timing, ...(onSurplus ? { onSurplus: true } : {}) };
}

/*
 * Ingevulde setpoints binnen bereik van de apparaten brengen.
 *
 * De standaardwaarden zijn vaste getallen — vakantie op 12 °C — maar of die
 * haalbaar zijn hangt af van wat er in de kamer hangt. Een airco die pas bij
 * 16 begint, haalt 12 nooit, en de samenhangscontrole wees zo'n configuratie
 * terecht af. Die controle is goed; het waren de standaardwaarden die niet
 * wisten waar ze terechtkwamen.
 *
 * Twee dingen gebeuren hier, en allebei alleen voor wat wij zelf hebben
 * ingevuld. Wat de bewoner opschrijft blijft staan en mag gerust een fout
 * opleveren: dan is er iets anders aan de hand dan een gok van ons.
 *
 *  - een verwarmingsdoel dat buiten het bereik valt wordt erin geschoven;
 *  - een verwarmingsdoel in een zone die niet kan verwarmen verdwijnt. Er
 *    blijft dan niets over, en de zone doet niets — wat eerlijker is dan
 *    een koeldoel verzinnen dat wij hebben bedacht.
 */
function fitted(
  p: Problems,
  parsed: SetpointOutcome,
  path: string,
  actuatorIds: readonly string[],
  actuators: ReadonlyMap<string, Actuator>,
): Record<Mode, SetpointPair> {
  const inZone = actuatorIds.map((id) => actuators.get(id)).filter((a): a is Actuator => a != null);
  if (inZone.length === 0 || parsed.filled.size === 0) return parsed.points;

  const canHeat = inZone.filter((a) => a.capabilities.canHeat);
  const out = { ...parsed.points };

  if (canHeat.length === 0) {
    let removed = 0;
    for (const mode of parsed.filled) {
      if (out[mode].heat != null) {
        out[mode] = { ...out[mode] };
        delete (out[mode] as { heat?: number }).heat;
        removed += 1;
      }
    }
    if (removed > 0) {
      p.warn(
        join(path, 'setpoints'),
        'geen enkel apparaat in deze zone kan verwarmen, dus de ingevulde ' +
          'verwarmingsdoelen zijn weggelaten. Zet zelf een koeldoel als je wilt ' +
          'dat hier iets gebeurt — koelen verzinnen wij niet.',
      );
    }
    return out;
  }

  const lowest = Math.min(...canHeat.map((a) => a.capabilities.setpointRange[0]));
  const highest = Math.max(...canHeat.map((a) => a.capabilities.setpointRange[1]));
  let shifted = 0;
  for (const mode of parsed.filled) {
    const heat = out[mode].heat;
    if (heat == null) continue;
    const inside = Math.min(highest, Math.max(lowest, heat));
    if (inside !== heat) {
      out[mode] = { ...out[mode], heat: inside };
      shifted += 1;
    }
  }
  if (shifted > 0) {
    p.warn(
      join(path, 'setpoints'),
      shifted === 1
        ? `één ingevuld verwarmingsdoel viel buiten het bereik ${lowest}-${highest} °C ` +
          'van de apparaten en is erin geschoven'
        : `${shifted} ingevulde verwarmingsdoelen vielen buiten het bereik ` +
          `${lowest}-${highest} °C van de apparaten en zijn erin geschoven`,
    );
  }
  return out;
}

function zone(
  p: Problems,
  value: unknown,
  path: string,
  defaultAdapter: string,
  /** Positie in de lijst, als terugval voor `priority`. */
  order: number,
  /** De al gelezen apparaten, om ingevulde setpoints haalbaar te houden. */
  actuators: ReadonlyMap<string, Actuator>,
): Zone | null {
  if (!isRecord(value)) {
    p.error(path, 'moet een object zijn');
    return null;
  }
  const id = str(p, value, path, 'id');
  const name = strOr(p, value, path, 'name', id ?? '');
  const temperature = measurementPoint(p, value['temperature'], join(path, 'temperature'), defaultAdapter);
  // Meer sensoren voor één zone (besluit 123): de gemiddelde temperatuur.
  const temperaturesRaw = value['temperatures'];
  let temperatures: MeasurementPoint[] | null = null;
  if (temperaturesRaw !== undefined) {
    if (!Array.isArray(temperaturesRaw) || temperaturesRaw.length === 0 || temperaturesRaw.length > 6) {
      p.error(join(path, 'temperatures'), 'moet een lijst van 1 tot 6 meetpunten zijn');
    } else {
      temperatures = [];
      temperaturesRaw.forEach((t, i) => {
        const m = measurementPoint(p, t, join(join(path, 'temperatures'), i), defaultAdapter);
        if (m) temperatures!.push(m);
      });
    }
  }
  const humidityRaw = value['humidity'];
  const humidity =
    humidityRaw === undefined
      ? null
      : measurementPoint(p, humidityRaw, join(path, 'humidity'), defaultAdapter);

  const idsRaw = arr(p, value, path, 'actuatorIds', { minLength: 1 });
  const actuatorIds: string[] = [];
  idsRaw?.forEach((v, i) => {
    if (typeof v !== 'string' || v.trim() === '') {
      p.error(join(join(path, 'actuatorIds'), i), 'moet een actuator-id zijn');
    } else {
      actuatorIds.push(v);
    }
  });

  // Zonder opgegeven volgorde telt de volgorde in het bestand. Dat is wat een
  // lezer ook zou aannemen.
  const priority = numOr(p, value, path, 'priority', order, {
    min: 1,
    max: 999,
    integer: true,
  });
  // Voorrang per richting (besluit 134); weg is `priority`.
  const pbaRaw = value['priorityByAction'];
  let priorityByAction: { heat?: number; cool?: number } | undefined;
  if (pbaRaw !== undefined) {
    const pPath = join(path, 'priorityByAction');
    const blok = blockOf(p, pbaRaw, pPath);
    if (blok) {
      const heat = blok['heat'] === undefined ? undefined : numOr(p, blok, pPath, 'heat', priority ?? order, { min: 1, max: 999, integer: true });
      const cool = blok['cool'] === undefined ? undefined : numOr(p, blok, pPath, 'cool', priority ?? order, { min: 1, max: 999, integer: true });
      priorityByAction = { ...(heat != null ? { heat } : {}), ...(cool != null ? { cool } : {}) };
    }
  }
  // `medium` raakt niemand hard: het bepaalt hoe ver vooruit er geladen mag
  // worden, en dat staat standaard toch uit.
  const thermalMass = oneOfOr(p, value, path, 'thermalMass', THERMAL_MASS, 'medium');

  // Een gebruikelijke schakelband. Verkeerd geraden kost comfort, geen
  // veiligheid — precies het soort keuze dat een standaardwaarde verdient.
  const hPath = join(path, 'hysteresis');
  const hystRaw = blockOf(p, value['hysteresis'], hPath);
  let hysteresis: Zone['hysteresis'] | null = null;
  if (hystRaw) {
    const onDelta = numOr(p, hystRaw, hPath, 'onDelta', 0.3, { min: 0, max: 5 });
    const offDelta = numOr(p, hystRaw, hPath, 'offDelta', 0.2, { min: 0, max: 5 });
    {
      if (onDelta + offDelta === 0) {
        p.error(
          hPath,
          'een band van nul graden laat het apparaat klapperen; geef onDelta of offDelta een waarde',
        );
      } else {
        hysteresis = { onDelta, offDelta };
        if (onDelta + offDelta < 0.2) {
          p.warn(hPath, `een band van ${onDelta + offDelta} °C is erg smal en kan tot vaak schakelen leiden`);
        }
      }
    }
  }

  /*
   * Het comfortplafond (besluit 50). Geen standaardwaarde: koelen op netstroom
   * is een keuze en niet iets om voor iemand aan te nemen. Weglaten houdt het
   * gedrag zoals het was.
   */
  const comfortMaxC = num(p, value, path, 'comfortMaxC', {
    min: 5,
    max: 35,
    optional: true,
  });

  // Voorladen staat standaard uit. Aanzetten is een keuze, geen aanname.
  const bPath = join(path, 'buffering');
  const bufRaw = blockOf(p, value['buffering'], bPath);
  let buffering: Zone['buffering'] | null = null;
  if (bufRaw) {
    const enabled = boolOr(p, bufRaw, bPath, 'enabled', false);
    const bandC = numOr(p, bufRaw, bPath, 'bandC', 0, { min: 0, max: 5 });
    {
      buffering = { enabled, bandC };
      if (enabled && bandC === 0) {
        p.warn(bPath, 'buffering staat aan maar de band is nul, dus er wordt niets voorgeladen');
      }
    }
  }

  const parsed = setpoints(p, value['setpoints'], join(path, 'setpoints'));
  const points = parsed == null ? null : fitted(p, parsed, path, actuatorIds, actuators);

  /*
   * Een plafond onder het koeldoel is tegenstrijdig.
   *
   * Het plafond is de grens die comfort desnoods op netstroom verdedigt; het
   * koeldoel is waar op eigen stroom naartoe geladen wordt. Ligt het plafond
   * eronder, dan zou de zuinige regel strenger zijn dan de dure — en dan koelt
   * hij altijd op netstroom, wat precies niet de bedoeling is. Een waarschuwing
   * en geen fout: de installatie werkt, hij kost alleen geld.
   */
  if (comfortMaxC != null && points != null) {
    for (const [mode, pair] of Object.entries(points)) {
      if (pair.cool != null && comfortMaxC <= pair.cool) {
        p.warn(
          join(path, 'comfortMaxC'),
          `${comfortMaxC} ligt niet boven het koeldoel van ${pair.cool} in modus ${mode}; ` +
            'het plafond hoort losser te staan dan het doel, anders koelt hij altijd op netstroom',
        );
      }
    }
  }

  if (
    !id ||
    !name ||
    !temperature ||
    actuatorIds.length === 0 ||
    priority == null ||
    !thermalMass ||
    !hysteresis ||
    !buffering ||
    !points
  ) {
    return null;
  }
  return {
    id,
    name,
    temperature,
    ...(temperatures && temperatures.length ? { temperatures } : {}),
    ...(humidity ? { humidity } : {}),
    actuatorIds,
    priority,
    ...(priorityByAction && Object.keys(priorityByAction).length ? { priorityByAction } : {}),
    thermalMass,
    hysteresis,
    buffering,
    setpoints: points,
    ...(comfortMaxC == null ? {} : { comfortMaxC }),
  };
}

/** Controles die pas kunnen als alle onderdelen gelezen zijn. */
function checkCoherence(
  p: Problems,
  config: {
    zones: readonly Zone[];
    actuators: readonly Actuator[];
    enabledStrategies: readonly string[];
  },
  knownStrategies: readonly string[],
): void {
  const seenActuators = new Set<string>();
  config.actuators.forEach((a, i) => {
    if (seenActuators.has(a.id)) {
      p.error(`actuators[${i}].id`, `"${a.id}" komt meer dan één keer voor`);
    }
    seenActuators.add(a.id);
  });

  const seenZones = new Set<string>();
  config.zones.forEach((z, i) => {
    if (seenZones.has(z.id)) {
      p.error(`zones[${i}].id`, `"${z.id}" komt meer dan één keer voor`);
    }
    seenZones.add(z.id);
  });

  const claimed = new Map<string, string>();
  config.zones.forEach((z, zi) => {
    z.actuatorIds.forEach((id, ai) => {
      const path = `zones[${zi}].actuatorIds[${ai}]`;
      const found = config.actuators.find((a) => a.id === id);
      if (!found) {
        const near = [...seenActuators].filter(
          (k) => k.startsWith(id.slice(0, 3)) || id.startsWith(k.slice(0, 3)),
        );
        p.error(
          path,
          `zone "${z.id}" verwijst naar actuator "${id}", die niet bestaat` +
            (near.length > 0 ? `. Bedoelde je ${near.map((n) => `"${n}"`).join(' of ')}?` : ''),
        );
        return;
      }
      const other = claimed.get(id);
      if (other && other !== z.id) {
        p.error(path, `actuator "${id}" hoort al bij zone "${other}"`);
      }
      claimed.set(id, z.id);

    });

    // Een setpoint dat geen enkel apparaat kan halen wordt door de arbiter
    // afgewezen, en dan gebeurt er stilletjes niets.
    //
    // Let op de formulering: geen énkel apparaat. Een zone mag apparaten met
    // verschillende bereiken bevatten, en dan hoeft niet ieder van hen elk doel
    // te kunnen halen. De woonkamer heeft een ketel die tot 12 °C zakt en een
    // airco die bij 16 °C ophoudt; in vakantiestand is 12 °C precies de
    // bedoeling, en krijgt de airco geen opdracht. Alleen als niemand het kan,
    // is het een fout.
    const devices = z.actuatorIds
      .map((id) => config.actuators.find((a) => a.id === id))
      .filter((a): a is Actuator => a != null);

    for (const mode of MODES) {
      const pair = z.setpoints[mode];
      for (const [kind, target] of [
        ['heat', pair.heat],
        ['cool', pair.cool],
      ] as const) {
        if (target == null) continue;
        const capable = devices.filter((a) =>
          kind === 'heat' ? a.capabilities.canHeat : a.capabilities.canCool,
        );
        if (capable.length === 0) {
          p.error(
            `zones[${zi}].setpoints.${mode}.${kind}`,
            `zone "${z.id}" heeft geen apparaat dat kan ${kind === 'heat' ? 'verwarmen' : 'koelen'}`,
          );
          continue;
        }
        const reachable = capable.filter((a) => {
          const [lo, hi] = a.capabilities.setpointRange;
          return target >= lo && target <= hi;
        });
        if (reachable.length === 0) {
          const ranges = capable
            .map((a) => `"${a.name}" (${a.capabilities.setpointRange.join('-')})`)
            .join(', ');
          p.error(
            `zones[${zi}].setpoints.${mode}.${kind}`,
            `${target} °C is voor geen enkel apparaat in deze zone haalbaar: ${ranges}`,
          );
        }
      }
    }

    const roles = z.actuatorIds
      .map((id) => config.actuators.find((a) => a.id === id))
      .filter((a): a is Actuator => a != null);
    if (roles.length > 0 && roles.every((a) => a.role === 'assist')) {
      p.warn(
        `zones[${zi}]`,
        `zone "${z.id}" heeft alleen assist-apparaten; comfort regelt deze zone dan niet`,
      );
    }
  });

  for (const actuator of config.actuators) {
    if (!claimed.has(actuator.id)) {
      p.warn(
        'actuators',
        `actuator "${actuator.id}" hoort bij geen enkele zone en wordt dus nooit aangestuurd`,
      );
    }
  }

  config.enabledStrategies.forEach((id, i) => {
    if (!knownStrategies.includes(id)) {
      p.error(
        `enabledStrategies[${i}]`,
        `strategie "${id}" bestaat niet; beschikbaar zijn ${knownStrategies.join(', ')}`,
      );
    }
  });
  const seenStrategies = new Set<string>();
  config.enabledStrategies.forEach((id, i) => {
    if (seenStrategies.has(id)) {
      p.error(`enabledStrategies[${i}]`, `"${id}" staat er twee keer in`);
    }
    seenStrategies.add(id);
  });
}

export interface ParseOptions {
  /** Strategie-ID's die deze build kent, voor de verwijzingscontrole. */
  readonly knownStrategies?: readonly string[];
}

/** Leest en controleert een configuratie. Werpt niet; geeft alle problemen terug. */
export function parseSiteConfig(
  input: unknown,
  options: ParseOptions = {},
): ConfigResult {
  const p = new Problems();
  const knownStrategies = options.knownStrategies ?? [];

  if (!isRecord(input)) {
    return {
      ok: false,
      problems: [{ path: '', message: 'de configuratie moet een JSON-object zijn', severity: 'error' }],
    };
  }

  const version = input['schemaVersion'];
  if (version === undefined) {
    // Ontbreken is iets anders dan afwijken. Zonder nummer nemen we aan dat
    // het bestand bij deze versie hoort; staat er een ánder nummer, dan weten
    // we juist zeker dat het niet klopt.
    p.warn('schemaVersion', `ontbreekt; er wordt gelezen alsof het ${SCHEMA_VERSION} is`);
  } else if (version !== SCHEMA_VERSION) {
    p.error(
      'schemaVersion',
      `is ${String(version)}, maar deze versie leest ${SCHEMA_VERSION}. ` +
        'Werk het bestand bij of gebruik een passende versie van de software.',
    );
  }

  // De naam van de installatie is een label: hij staat in het logboek en boven
  // de weergave. Geen reden om te weigeren.
  const id = strOr(p, input, '', 'id', 'installatie');
  const timezone = str(p, input, '', 'timezone');
  if (timezone != null) {
    // Een tikfout in de tijdzone zou de dagindeling uren verschuiven zonder één
    // foutmelding. Hier vangen is veel goedkoper dan het in de winterdata
    // terugvinden.
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone });
    } catch {
      p.error(
        'timezone',
        `"${timezone}" is geen bekende tijdzone; gebruik een IANA-naam zoals Europe/Amsterdam`,
      );
    }
  }
  const defaultAdapter = typeof input['defaultAdapter'] === 'string'
    ? (input['defaultAdapter'] as string)
    : 'homeassistant';

  const actuatorsRaw = arr(p, input, '', 'actuators', { minLength: 1 });
  const actuators = (actuatorsRaw ?? [])
    .map((v, i) => actuator(p, v, `actuators[${i}]`, defaultAdapter))
    .filter((a): a is Actuator => a != null);

  const zonesRaw = arr(p, input, '', 'zones', { minLength: 1 });
  const zones = (zonesRaw ?? [])
    .map((v, i) =>
      zone(p, v, `zones[${i}]`, defaultAdapter, i + 1, new Map(actuators.map((a) => [a.id, a]))),
    )
    .filter((z): z is Zone => z != null);

  /*
   * Het hele vermogensblok mag weg.
   *
   * Zonder slimme meter valt `pv-surplus` weg — verderop wordt die dan ook
   * werkelijk uitgezet in plaats van hem stil niets te laten doen. De drempels
   * blijven bestaan met gebruikelijke waarden, want `stopImportW` en
   * `stabilisationMinutes` worden ook buiten die strategie gelezen.
   */
  type Power = SiteConfig['power'];
  let power: Power | null = null;
  const powerRaw = blockOf(p, input['power'], 'power');
  if (powerRaw) {
    const gridRaw = powerRaw['gridPower'];
    const gridPower =
      gridRaw === undefined ? null : ref(p, gridRaw, 'power.gridPower', defaultAdapter);
    const startSurplusW = numOr(p, powerRaw, 'power', 'startSurplusW', 1000, { min: 0, max: 50_000 });
    const stopImportW = numOr(p, powerRaw, 'power', 'stopImportW', 50, { min: 0, max: 50_000 });
    const resumeSurplusW = numOr(p, powerRaw, 'power', 'resumeSurplusW', 600, { min: 0, max: 50_000 });
    const stabilisationMinutes = numOr(p, powerRaw, 'power', 'stabilisationMinutes', 5, {
      min: 0,
      max: 120,
    });
    {
      if (resumeSurplusW > startSurplusW) {
        p.error(
          'power.resumeSurplusW',
          `hervatten bij ${resumeSurplusW} W terwijl starten pas bij ${startSurplusW} W mag, ` +
            'is tegenstrijdig; hervatten hoort de lagere drempel te zijn',
        );
      } else {
        power = {
          ...(gridPower ? { gridPower } : {}),
          startSurplusW,
          stopImportW,
          resumeSurplusW,
          stabilisationMinutes,
        };
      }
    }
  }

  // Geen aanwezigheidsbronnen is een geldige installatie: dan geldt het huis
  // als bewoond (zie context.ts). Dat is de comfortabele kant om te raden.
  const occupancyRaw =
    input['occupancy'] === undefined ? null : arr(p, input, '', 'occupancy');
  const occupancy: { id: string; ref: DeviceRef }[] = [];
  const seenOccupancy = new Set<string>();
  occupancyRaw?.forEach((v, i) => {
    const path = `occupancy[${i}]`;
    if (!isRecord(v)) {
      p.error(path, 'moet een object zijn met id en ref');
      return;
    }
    const oid = str(p, v, path, 'id');
    const oref = ref(p, v['ref'], join(path, 'ref'), defaultAdapter);
    if (oid && seenOccupancy.has(oid)) p.error(join(path, 'id'), `"${oid}" komt twee keer voor`);
    if (oid) seenOccupancy.add(oid);
    if (oid && oref) occupancy.push({ id: oid, ref: oref });
  });
  if (occupancy.length === 0 && occupancyRaw != null) {
    p.warn('occupancy', 'zonder aanwezigheidsbronnen staat het huis altijd op afwezig');
  }

  // Een dagritme dat voor de meeste huishoudens klopt. Wie er anders in staat
  // zet het zelf, maar niemand hoeft erover na te denken om te kunnen starten.
  type Schedule = SiteConfig['schedule'];
  let schedule: Schedule | null = null;
  const scheduleRaw = blockOf(p, input['schedule'], 'schedule');
  if (scheduleRaw) {
    const preheatFromHour = numOr(p, scheduleRaw, 'schedule', 'preheatFromHour', 6, {
      min: 0,
      max: 23,
      integer: true,
    });
    const dayFromHour = numOr(p, scheduleRaw, 'schedule', 'dayFromHour', 8, {
      min: 0,
      max: 23,
      integer: true,
    });
    const nightFromHour = numOr(p, scheduleRaw, 'schedule', 'nightFromHour', 22, {
      min: 0,
      max: 23,
      integer: true,
    });
    const lightsRaw =
      scheduleRaw['eveningExtensionLights'] === undefined
        ? []
        : (arr(p, scheduleRaw, 'schedule', 'eveningExtensionLights') ?? []);
    const lights = refList(p, lightsRaw, 'schedule.eveningExtensionLights', defaultAdapter);
    {
      if (!(preheatFromHour < dayFromHour && dayFromHour < nightFromHour)) {
        p.error(
          'schedule',
          `de uren moeten oplopen: voorverwarmen (${preheatFromHour}) vóór dag (${dayFromHour}) vóór nacht (${nightFromHour})`,
        );
      } else {
        schedule = {
          preheatFromHour,
          dayFromHour,
          nightFromHour,
          eveningExtensionLights: lights,
        };
      }
    }
  }

  /*
   * Welke strategieën meedoen.
   *
   * Ontbreekt de lijst, dan doen ze allemaal mee. Dat is de aanname die past
   * bij "ik heb dit nog niet ingesteld": je wilt dat het werkt, niet dat het
   * niets doet.
   *
   * Verderop gaat `pv-surplus` er weer uit wanneer er geen slimme meter is.
   * Dat is het verschil tussen degraderen en stilvallen: zonder die stap zou
   * de strategie blijven staan en elke ronde een budget van vijftig watt
   * verdelen, wat nergens genoeg voor is — zonder dat iemand het merkt.
   */
  const strategiesRaw =
    input['enabledStrategies'] === undefined
      ? null
      : arr(p, input, '', 'enabledStrategies', { minLength: 1 });
  const enabledStrategies: string[] = [];
  if (input['enabledStrategies'] === undefined) {
    enabledStrategies.push(...knownStrategies);
  } else {
    strategiesRaw?.forEach((v, i) => {
      if (typeof v !== 'string') p.error(`enabledStrategies[${i}]`, 'moet een tekst zijn');
      else enabledStrategies.push(v);
    });
  }

  // Zonder opgegeven meetpunten valt de failsafe nooit aan. Dat is geen
  // verzwakking: de failsafe schakelt assist-apparaten terug wanneer een
  // meetpunt wegvalt, en zonder opgave weten we niet welke dat zouden zijn.
  const criticalRaw =
    input['criticalInputs'] === undefined ? null : arr(p, input, '', 'criticalInputs');
  const criticalInputs = refList(p, criticalRaw ?? [], 'criticalInputs', defaultAdapter);

  // ---- modusbron ------------------------------------------------------------
  let mode: SiteConfig['mode'] | null = null;
  const modeRaw = input['mode'];
  if (modeRaw === undefined) {
    // Geen fout sinds fase 6e: bij een verse installatie bestaan die knoppen
    // in Home Assistant niet, en ze aanmaken zou schrijven zijn (besluit 15).
    // De dienst houdt de modus dan zelf bij.
    p.warn(
      'mode',
      'ontbreekt; de modus wordt dan intern bijgehouden en er is geen knop ' +
        'in Home Assistant die hem verzet',
    );
  } else if (!isRecord(modeRaw)) {
    p.error('mode', 'moet een object zijn');
  } else {
    const select = ref(p, modeRaw['select'], 'mode.select', defaultAdapter);
    const automatic = str(p, modeRaw, 'mode', 'automatic');

    const aliases: Record<string, Mode> = {};
    const aliasRaw = modeRaw['aliases'];
    if (!isRecord(aliasRaw)) {
      p.error('mode.aliases', 'ontbreekt of is geen object');
    } else {
      for (const [state, target] of Object.entries(aliasRaw)) {
        if (typeof target !== 'string' || !(MODES as readonly string[]).includes(target)) {
          p.error(
            join('mode.aliases', state),
            `"${String(target)}" is geen bekende modus; kies uit ${MODES.join(', ')}`,
          );
          continue;
        }
        aliases[state] = target as Mode;
      }
    }

    const handsOffWhen: { ref: DeviceRef; state: string }[] = [];
    const handsRaw = modeRaw['handsOffWhen'];
    if (handsRaw !== undefined) {
      if (!Array.isArray(handsRaw)) {
        p.error('mode.handsOffWhen', 'moet een lijst zijn');
      } else {
        handsRaw.forEach((v, i) => {
          const path = `mode.handsOffWhen[${i}]`;
          if (!isRecord(v)) {
            p.error(path, 'moet een object zijn met ref en state');
            return;
          }
          const r = ref(p, v['ref'], join(path, 'ref'), defaultAdapter);
          const st = str(p, v, path, 'state');
          if (r && st) handsOffWhen.push({ ref: r, state: st });
        });
      }
    }

    if (select && automatic) {
      // Een modus-keuze die nergens naar "handmatig" kan wijzen is verdacht:
      // dan kan de bewoner de regeling nooit loslaten. Waarschuwing en geen
      // fout, want een woning zonder die knop mag bestaan.
      const knowsManual =
        Object.values(aliases).includes('handmatig') || handsOffWhen.length > 0;
      if (!knowsManual) {
        p.warn(
          'mode',
          'geen enkele stand vertaalt naar "handmatig" en er is geen handsOffWhen; ' +
            'de bewoner kan de regeling dan nergens loslaten',
        );
      }
      mode = { select, automatic, aliases, handsOffWhen };
    }
  }

  // ---- timers en zon --------------------------------------------------------
  let timers: SiteConfig['timers'] | null = null;
  const timersRaw = input['timers'];
  if (timersRaw === undefined) {
    // Ook geen fout meer. De kern vraagt met een commando om een timer; die
    // vraag kan de dienst zelf beantwoorden. Zie adapters/own-state.ts.
    p.warn(
      'timers',
      'ontbreekt; de stabilisatietimer wordt dan intern bijgehouden en gaat ' +
        'bij een herstart verloren',
    );
  } else if (!isRecord(timersRaw)) {
    p.error('timers', 'moet een object zijn');
  } else {
    // Per timer optioneel (besluit 39 en 60). Wat ontbreekt, houdt de dienst
    // zelf bij; `manualOverride` leest de kern op dit moment niet eens uit.
    const optionalRef = (key: 'stabilisation' | 'manualOverride'): DeviceRef | null =>
      timersRaw[key] === undefined
        ? null
        : ref(p, timersRaw[key], `timers.${key}`, defaultAdapter);
    const stabilisation = optionalRef('stabilisation');
    const manualOverride = optionalRef('manualOverride');
    if (stabilisation || manualOverride) {
      timers = {
        ...(stabilisation ? { stabilisation } : {}),
        ...(manualOverride ? { manualOverride } : {}),
      };
    }
  }

  // Alleen `pv-surplus` leest de zon, om 's nachts niet op een spookoverschot
  // te reageren. Zonder die strategie doet hij niets, dus hij mag ontbreken.
  const sunRaw = input['sun'];
  const sun = sunRaw === undefined ? null : ref(p, sunRaw, 'sun', defaultAdapter);

  const outdoorRaw = input['outdoorTemperature'];
  const outdoorTemperature =
    outdoorRaw === undefined ? null : ref(p, outdoorRaw, 'outdoorTemperature', defaultAdapter);
  if (outdoorRaw === undefined) {
    // Geen fout: een woning zonder buitensensor moet kunnen draaien. Wel
    // melden, want zonder hem is de dataset niet compleet voor fase 7
    // (besluit 30) en dat merk je pas een winter later.
    p.warn(
      'outdoorTemperature',
      'ontbreekt; de buitentemperatuur wordt dan niet in het beslislogboek ' +
        'vastgelegd en de dataset is niet compleet voor fase 7',
    );
  }

  // Alleen vastleggen, niets beslist erop (besluit 65).
  const recordOnlyRaw = input['recordOnly'];
  let recordOnly: DeviceRef[] | null = null;
  if (recordOnlyRaw !== undefined) {
    if (!Array.isArray(recordOnlyRaw)) {
      p.error('recordOnly', 'moet een lijst met entiteiten zijn');
    } else {
      recordOnly = refList(p, recordOnlyRaw, 'recordOnly', defaultAdapter);
    }
  }

  // Uitstelbare apparaten, zoals de droger (besluit 98). Optioneel.
  const deferrables: Deferrable[] = [];
  const deferrablesRaw = input['deferrables'];
  if (deferrablesRaw !== undefined) {
    if (!Array.isArray(deferrablesRaw)) {
      p.error('deferrables', 'moet een lijst zijn');
    } else {
      const seenDeferrable = new Set<string>();
      deferrablesRaw.forEach((d, i) => {
        const path = join('deferrables', i);
        if (!isRecord(d)) {
          p.error(path, 'moet een object zijn');
          return;
        }
        const id = str(p, d, path, 'id');
        if (id && seenDeferrable.has(id)) p.error(join(path, 'id'), `apparaat "${id}" staat er twee keer`);
        if (id) seenDeferrable.add(id);
        const name = str(p, d, path, 'name');
        const remoteStart = d['remoteStart'] === undefined ? (p.error(join(path, 'remoteStart'), 'ontbreekt'), null) : ref(p, d['remoteStart'], join(path, 'remoteStart'), defaultAdapter);
        const operationState = d['operationState'] === undefined ? null : ref(p, d['operationState'], join(path, 'operationState'), defaultAdapter);
        const programDuration = d['programDuration'] === undefined ? null : ref(p, d['programDuration'], join(path, 'programDuration'), defaultAdapter);
        const estimatedW = num(p, d, path, 'estimatedW', { min: 50, max: 10_000 });
        const latestStart = strOr(p, d, path, 'latestStart', '15:00');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(latestStart)) p.error(join(path, 'latestStart'), 'moet een tijd zijn als "15:00"');
        if (id && name && remoteStart && estimatedW != null) {
          deferrables.push({
            id,
            name,
            remoteStart,
            estimatedW,
            latestStart,
            ...(operationState ? { operationState } : {}),
            ...(programDuration ? { programDuration } : {}),
          });
        }
      });
    }
  }

  // De aansluiting: stroom per fase tegen de hoofdzekering (besluit 78).
  // Optioneel; zonder blijft het alleen een vermogensbudget.
  let grid: GridLimits | null = null;
  const gridRawBlock = input['grid'];
  if (gridRawBlock !== undefined) {
    if (!isRecord(gridRawBlock)) {
      p.error('grid', 'moet een object zijn');
    } else {
      const phasesRaw = arr(p, gridRawBlock, 'grid', 'phases', { minLength: 1 });
      const phases: GridPhase[] = [];
      const seen = new Set<string>();
      (phasesRaw ?? []).forEach((f, i) => {
        const path = join('grid.phases', i);
        if (!isRecord(f)) {
          p.error(path, 'moet een object zijn');
          return;
        }
        const id = str(p, f, path, 'id');
        if (id && seen.has(id)) p.error(join(path, 'id'), `fase "${id}" staat er twee keer`);
        if (id) seen.add(id);
        const current = f['current'] === undefined ? (p.error(join(path, 'current'), 'ontbreekt'), null) : ref(p, f['current'], join(path, 'current'), defaultAdapter);
        const voltage = f['voltage'] === undefined ? null : ref(p, f['voltage'], join(path, 'voltage'), defaultAdapter);
        const maxA = num(p, f, path, 'maxA', { min: 6, max: 250 });
        if (id && current && maxA != null) phases.push({ id, current, maxA, ...(voltage ? { voltage } : {}) });
      });
      if (phases.length === 2 || phases.length > 3) p.error('grid.phases', 'een aansluiting heeft één of drie fasen');
      const marginA = numOr(p, gridRawBlock, 'grid', 'marginA', 2, { min: 0, max: 50 });
      if (phases.some((ph) => ph.maxA - marginA <= 0)) p.error('grid.marginA', 'de marge is groter dan de zekering');
      grid = { phases, marginA };
    }
  }

  // Hoe het huis en de panelen liggen (besluit 93). Optioneel, en zonder valt
  // alleen de zoninval weg; de regeling leest het niet.
  let geometry: Geometry | null = null;
  const geoRaw = input['geometry'];
  if (geoRaw !== undefined) {
    if (!isRecord(geoRaw)) {
      p.error('geometry', 'moet een object zijn');
    } else {
      const zoneIds = new Set(zones.map((z) => z.id));
      const facades: Facade[] = [];
      const facadesRaw = geoRaw['facades'] === undefined ? [] : arr(p, geoRaw, 'geometry', 'facades');
      (facadesRaw ?? []).forEach((f, i) => {
        const path = join('geometry.facades', i);
        if (!isRecord(f)) {
          p.error(path, 'moet een object zijn');
          return;
        }
        const id = str(p, f, path, 'id');
        const name = str(p, f, path, 'name');
        const azimuthDeg = num(p, f, path, 'azimuthDeg', { min: 0, max: 360 });
        const source = oneOfOr(p, f, path, 'source', GEOMETRY_SOURCES, 'schatting');
        const zs = f['zoneIds'] === undefined ? [] : arr(p, f, path, 'zoneIds');
        const ids: string[] = [];
        (zs ?? []).forEach((z, j) => {
          if (typeof z !== 'string' || !zoneIds.has(z)) {
            p.error(join(join(path, 'zoneIds'), j), `"${String(z)}" is geen zone`);
          } else ids.push(z);
        });
        if (id && name && azimuthDeg != null) facades.push({ id, name, azimuthDeg, zoneIds: ids, source });
      });
      const planes: SolarPlane[] = [];
      const planesRaw = geoRaw['solarPlanes'] === undefined ? [] : arr(p, geoRaw, 'geometry', 'solarPlanes');
      (planesRaw ?? []).forEach((f, i) => {
        const path = join('geometry.solarPlanes', i);
        if (!isRecord(f)) {
          p.error(path, 'moet een object zijn');
          return;
        }
        const id = str(p, f, path, 'id');
        const azimuthDeg = num(p, f, path, 'azimuthDeg', { min: 0, max: 360 });
        const tiltDeg = num(p, f, path, 'tiltDeg', { min: 0, max: 90 });
        const peakW = num(p, f, path, 'peakW', { min: 1 });
        const source = oneOfOr(p, f, path, 'source', GEOMETRY_SOURCES, 'schatting');
        if (id && azimuthDeg != null && tiltDeg != null && peakW != null) {
          planes.push({ id, azimuthDeg, tiltDeg, peakW, source });
        }
      });
      const inverterMaxW = num(p, geoRaw, 'geometry', 'inverterMaxW', { min: 1, optional: true });
      geometry = {
        facades,
        solarPlanes: planes,
        ...(inverterMaxW != null ? { inverterMaxW } : {}),
      };
    }
  }

  // Dezelfde behandeling voor de opbrengst van de zonnepanelen (besluit 47).
  const solarRaw = input['solarProduction'];
  const solarProduction =
    solarRaw === undefined ? null : measurementPoint(p, solarRaw, 'solarProduction', defaultAdapter);
  if (solarRaw === undefined) {
    p.warn(
      'solarProduction',
      'ontbreekt; zonder de eigen opbrengst is er geen maat voor instraling, ' +
        'en kan het thermische model van fase 7 niet uitrekenen hoeveel de zon ' +
        'een kamer opwarmt',
    );
  }

  let migration: SiteConfig['migration'];
  const migrationRaw = input['migration'];
  if (migrationRaw !== undefined) {
    if (!isRecord(migrationRaw)) {
      p.error('migration', 'moet een object zijn');
    } else {
      const legacyRaw = migrationRaw['legacyExplanation'];
      const legacyExplanation =
        legacyRaw === undefined
          ? null
          : ref(p, legacyRaw, 'migration.legacyExplanation', defaultAdapter);

      // De helpers waarin de bewoner zijn setpoints zet in het oude systeem.
      // Per zone, per modus, verwarmen en/of koelen. Wat ontbreekt houdt de
      // waarde uit de configuratie zelf — dat is de betere terugval dan een
      // vast getal in de code, want die kon van de configuratie afwijken.
      let setpoints: NonNullable<SiteConfig['migration']>['setpoints'];
      const setpointsRaw = migrationRaw['setpoints'];
      if (setpointsRaw !== undefined) {
        if (!isRecord(setpointsRaw)) {
          p.error('migration.setpoints', 'moet een object zijn met een ingang per zone');
        } else {
          const result: Record<string, Partial<Record<Mode, { heat?: DeviceRef; cool?: DeviceRef }>>> =
            {};
          for (const [zoneId, perMode] of Object.entries(setpointsRaw)) {
            const zPath = join('migration.setpoints', zoneId);
            if (!zones.some((z) => z.id === zoneId)) {
              p.error(zPath, `verwijst naar zone "${zoneId}" die niet bestaat`);
              continue;
            }
            if (!isRecord(perMode)) {
              p.error(zPath, 'moet een object zijn met een ingang per modus');
              continue;
            }
            const modes: Partial<Record<Mode, { heat?: DeviceRef; cool?: DeviceRef }>> = {};
            for (const [mode, directions] of Object.entries(perMode)) {
              const mPath = join(zPath, mode);
              if (!(MODES as readonly string[]).includes(mode)) {
                p.error(mPath, `"${mode}" is geen bekende modus`);
                continue;
              }
              if (!isRecord(directions)) {
                p.error(mPath, 'moet een object zijn met heat en/of cool');
                continue;
              }
              const heat =
                directions['heat'] === undefined
                  ? null
                  : ref(p, directions['heat'], join(mPath, 'heat'), defaultAdapter);
              const cool =
                directions['cool'] === undefined
                  ? null
                  : ref(p, directions['cool'], join(mPath, 'cool'), defaultAdapter);
              if (heat || cool) {
                modes[mode as Mode] = { ...(heat ? { heat } : {}), ...(cool ? { cool } : {}) };
              }
            }
            if (Object.keys(modes).length > 0) result[zoneId] = modes;
          }
          if (Object.keys(result).length > 0) setpoints = result;
        }
      }

      let migrationPower: NonNullable<SiteConfig['migration']>['power'];
      const mPowerRaw = migrationRaw['power'];
      if (mPowerRaw !== undefined) {
        if (!isRecord(mPowerRaw)) {
          p.error('migration.power', 'moet een object zijn');
        } else {
          const start =
            mPowerRaw['startSurplusW'] === undefined
              ? null
              : ref(p, mPowerRaw['startSurplusW'], 'migration.power.startSurplusW', defaultAdapter);
          const stop =
            mPowerRaw['stopImportW'] === undefined
              ? null
              : ref(p, mPowerRaw['stopImportW'], 'migration.power.stopImportW', defaultAdapter);
          if (start || stop) {
            migrationPower = {
              ...(start ? { startSurplusW: start } : {}),
              ...(stop ? { stopImportW: stop } : {}),
            };
          }
        }
      }

      migration = {
        ...(legacyExplanation ? { legacyExplanation } : {}),
        ...(setpoints ? { setpoints } : {}),
        ...(migrationPower ? { power: migrationPower } : {}),
      };
    }
  }

  /*
   * Degraderen in plaats van stilvallen.
   *
   * `pv-surplus` is de enige strategie die vermogen claimt, en de enige die
   * een netmeting nodig heeft. Zonder meter zou hij blijven draaien op een
   * gridPowerW van nul: een budget van `stopImportW`, vijftig watt, waar niets
   * op start. Dat is geen werkende regeling maar een stille.
   *
   * Hetzelfde voor de zon: die staat in dienst van dezelfde strategie.
   */
  const hasMeter = power?.gridPower != null;
  if (!hasMeter && enabledStrategies.includes('pv-surplus')) {
    const i = enabledStrategies.indexOf('pv-surplus');
    enabledStrategies.splice(i, 1);
    p.warn(
      'power.gridPower',
      'ontbreekt; zonder netmeting valt pv-surplus weg. Comfort en heat-assist ' +
        'werken gewoon door — die vragen geen vermogen.',
    );
  }
  if (hasMeter && sun == null && enabledStrategies.includes('pv-surplus')) {
    p.warn(
      'sun',
      'ontbreekt; pv-surplus kan dan bij nacht niet zien dat een gemeten ' +
        'overschot niet van de zon komt',
    );
  }

  checkCoherence(p, { zones, actuators, enabledStrategies }, knownStrategies);

  /*
   * Wat er echt niet zonder kan.
   *
   * Drie dingen. Een tijdzone, want zonder die verschuift de hele dagindeling
   * zonder dat iemand het merkt. Minstens één zone, want anders is er niets om
   * te regelen. En minstens één apparaat, want anders is er niets om mee te
   * regelen. Al het andere heeft hierboven een terugval gekregen.
   *
   * `power` en `schedule` staan er nog wel bij, maar die zijn nu altijd
   * gevuld — ze kunnen alleen nog null zijn wanneer er een échte fout in
   * stond, en dan staat die fout al in `errors`.
   */
  const errors = p.errors;
  const incomplete =
    !timezone || zones.length === 0 || actuators.length === 0 || !power || !schedule;

  if (errors.length > 0 || incomplete) {
    const problems: ConfigProblem[] =
      errors.length > 0
        ? errors
        : [{ path: '', message: 'de configuratie is onvolledig', severity: 'error' }];
    return { ok: false, problems };
  }

  return {
    ok: true,
    config: {
      id,
      timezone,
      zones,
      actuators,
      power: power as Power,
      occupancy,
      schedule: schedule as Schedule,
      enabledStrategies,
      criticalInputs,
      ...(mode ? { mode } : {}),
      ...(timers ? { timers } : {}),
      ...(sun ? { sun } : {}),
      ...(outdoorTemperature ? { outdoorTemperature } : {}),
      ...(solarProduction ? { solarProduction } : {}),
      ...(geometry ? { geometry } : {}),
      ...(grid ? { grid } : {}),
      ...(deferrables.length > 0 ? { deferrables } : {}),
      ...(recordOnly && recordOnly.length > 0 ? { recordOnly } : {}),
      ...(migration ? { migration } : {}),
    },
    warnings: p.warnings,
  };
}

/** Zet problemen om naar regels die je aan een mens kunt laten zien. */
export function formatProblems(problems: readonly ConfigProblem[]): string[] {
  return problems.map((p) => `  ${p.path === '' ? '(configuratie)' : p.path}: ${p.message}`);
}
