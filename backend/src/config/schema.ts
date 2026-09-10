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
  MODES,
  type Actuator,
  type ActuatorRole,
  type DeviceRef,
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

function setpoints(
  p: Problems,
  value: unknown,
  path: string,
): Record<Mode, SetpointPair> | null {
  if (!isRecord(value)) {
    p.error(path, value === undefined ? 'ontbreekt' : 'moet een object zijn');
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!(MODES as readonly string[]).includes(key)) {
      p.error(join(path, key), `"${key}" is geen bekende modus; kies uit ${MODES.join(', ')}`);
    }
  }
  const out = {} as Record<Mode, SetpointPair>;
  for (const mode of MODES) {
    const raw = value[mode];
    if (raw === undefined) {
      p.error(join(path, mode), 'ontbreekt — geef een leeg object als deze modus niets regelt');
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
  return out;
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
  const name = str(p, value, path, 'name');
  const refValue = ref(p, value['ref'], join(path, 'ref'), defaultAdapter);
  const role = oneOf(p, value, path, 'role', ROLES);

  const capsRaw = value['capabilities'];
  let capabilities: Actuator['capabilities'] | null = null;
  if (!isRecord(capsRaw)) {
    p.error(join(path, 'capabilities'), 'ontbreekt of is geen object');
  } else {
    const cPath = join(path, 'capabilities');
    const canHeat = bool(p, capsRaw, cPath, 'canHeat');
    const canCool = bool(p, capsRaw, cPath, 'canCool');
    const range = arr(p, capsRaw, cPath, 'setpointRange');
    let min: number | null = null;
    let max: number | null = null;
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

  const powerRaw = value['power'];
  let power: Actuator['power'] | null = null;
  if (!isRecord(powerRaw)) {
    p.error(join(path, 'power'), 'ontbreekt of is geen object');
  } else {
    const pPath = join(path, 'power');
    const estimatedW = num(p, powerRaw, pPath, 'estimatedW', { min: 0, max: 50_000 });
    const sensorRaw = powerRaw['sensor'];
    const sensor =
      sensorRaw === undefined ? null : ref(p, sensorRaw, join(pPath, 'sensor'), defaultAdapter);
    if (estimatedW != null) {
      power = { estimatedW, ...(sensor ? { sensor } : {}) };
    }
  }

  const timingRaw = value['timing'];
  let timing: Actuator['timing'] | null = null;
  if (!isRecord(timingRaw)) {
    p.error(join(path, 'timing'), 'ontbreekt of is geen object');
  } else {
    const tPath = join(path, 'timing');
    const minRunMinutes = num(p, timingRaw, tPath, 'minRunMinutes', { min: 0, max: 240 });
    const minRestMinutes = num(p, timingRaw, tPath, 'minRestMinutes', { min: 0, max: 240 });
    const settleMinutes = num(p, timingRaw, tPath, 'settleMinutes', { min: 0, max: 60 });
    if (minRunMinutes != null && minRestMinutes != null && settleMinutes != null) {
      timing = { minRunMinutes, minRestMinutes, settleMinutes };
    }
  }

  if (!id || !name || !refValue || !role || !capabilities || !power || !timing) return null;
  return { id, name, ref: refValue, role, capabilities, power, timing };
}

function zone(
  p: Problems,
  value: unknown,
  path: string,
  defaultAdapter: string,
): Zone | null {
  if (!isRecord(value)) {
    p.error(path, 'moet een object zijn');
    return null;
  }
  const id = str(p, value, path, 'id');
  const name = str(p, value, path, 'name');
  const temperature = ref(p, value['temperature'], join(path, 'temperature'), defaultAdapter);
  const humidityRaw = value['humidity'];
  const humidity =
    humidityRaw === undefined
      ? null
      : ref(p, humidityRaw, join(path, 'humidity'), defaultAdapter);

  const idsRaw = arr(p, value, path, 'actuatorIds', { minLength: 1 });
  const actuatorIds: string[] = [];
  idsRaw?.forEach((v, i) => {
    if (typeof v !== 'string' || v.trim() === '') {
      p.error(join(join(path, 'actuatorIds'), i), 'moet een actuator-id zijn');
    } else {
      actuatorIds.push(v);
    }
  });

  const priority = num(p, value, path, 'priority', { min: 1, max: 999, integer: true });
  const thermalMass = oneOf(p, value, path, 'thermalMass', THERMAL_MASS);

  const hystRaw = value['hysteresis'];
  let hysteresis: Zone['hysteresis'] | null = null;
  if (!isRecord(hystRaw)) {
    p.error(join(path, 'hysteresis'), 'ontbreekt of is geen object');
  } else {
    const hPath = join(path, 'hysteresis');
    const onDelta = num(p, hystRaw, hPath, 'onDelta', { min: 0, max: 5 });
    const offDelta = num(p, hystRaw, hPath, 'offDelta', { min: 0, max: 5 });
    if (onDelta != null && offDelta != null) {
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

  const bufRaw = value['buffering'];
  let buffering: Zone['buffering'] | null = null;
  if (!isRecord(bufRaw)) {
    p.error(join(path, 'buffering'), 'ontbreekt of is geen object');
  } else {
    const bPath = join(path, 'buffering');
    const enabled = bool(p, bufRaw, bPath, 'enabled');
    const bandC = num(p, bufRaw, bPath, 'bandC', { min: 0, max: 5 });
    if (enabled != null && bandC != null) {
      buffering = { enabled, bandC };
      if (enabled && bandC === 0) {
        p.warn(bPath, 'buffering staat aan maar de band is nul, dus er wordt niets voorgeladen');
      }
    }
  }

  const points = setpoints(p, value['setpoints'], join(path, 'setpoints'));

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
    ...(humidity ? { humidity } : {}),
    actuatorIds,
    priority,
    thermalMass,
    hysteresis,
    buffering,
    setpoints: points,
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
    p.error('schemaVersion', `ontbreekt; deze versie verwacht ${SCHEMA_VERSION}`);
  } else if (version !== SCHEMA_VERSION) {
    p.error(
      'schemaVersion',
      `is ${String(version)}, maar deze versie leest ${SCHEMA_VERSION}. ` +
        'Werk het bestand bij of gebruik een passende versie van de software.',
    );
  }

  const id = str(p, input, '', 'id');
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
    .map((v, i) => zone(p, v, `zones[${i}]`, defaultAdapter))
    .filter((z): z is Zone => z != null);

  type Power = SiteConfig['power'];
  let power: Power | null = null;
  const powerRaw = input['power'];
  if (!isRecord(powerRaw)) {
    p.error('power', 'ontbreekt of is geen object');
  } else {
    const gridPower = ref(p, powerRaw['gridPower'], 'power.gridPower', defaultAdapter);
    const startSurplusW = num(p, powerRaw, 'power', 'startSurplusW', { min: 0, max: 50_000 });
    const stopImportW = num(p, powerRaw, 'power', 'stopImportW', { min: 0, max: 50_000 });
    const resumeSurplusW = num(p, powerRaw, 'power', 'resumeSurplusW', { min: 0, max: 50_000 });
    const stabilisationMinutes = num(p, powerRaw, 'power', 'stabilisationMinutes', {
      min: 0,
      max: 120,
    });
    if (
      gridPower &&
      startSurplusW != null &&
      stopImportW != null &&
      resumeSurplusW != null &&
      stabilisationMinutes != null
    ) {
      if (resumeSurplusW > startSurplusW) {
        p.error(
          'power.resumeSurplusW',
          `hervatten bij ${resumeSurplusW} W terwijl starten pas bij ${startSurplusW} W mag, ` +
            'is tegenstrijdig; hervatten hoort de lagere drempel te zijn',
        );
      } else {
        power = { gridPower, startSurplusW, stopImportW, resumeSurplusW, stabilisationMinutes };
      }
    }
  }

  const occupancyRaw = arr(p, input, '', 'occupancy');
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

  type Schedule = SiteConfig['schedule'];
  let schedule: Schedule | null = null;
  const scheduleRaw = input['schedule'];
  if (!isRecord(scheduleRaw)) {
    p.error('schedule', 'ontbreekt of is geen object');
  } else {
    const preheatFromHour = num(p, scheduleRaw, 'schedule', 'preheatFromHour', {
      min: 0,
      max: 23,
      integer: true,
    });
    const dayFromHour = num(p, scheduleRaw, 'schedule', 'dayFromHour', {
      min: 0,
      max: 23,
      integer: true,
    });
    const nightFromHour = num(p, scheduleRaw, 'schedule', 'nightFromHour', {
      min: 0,
      max: 23,
      integer: true,
    });
    const lightsRaw = arr(p, scheduleRaw, 'schedule', 'eveningExtensionLights');
    const lights = refList(p, lightsRaw ?? [], 'schedule.eveningExtensionLights', defaultAdapter);
    if (preheatFromHour != null && dayFromHour != null && nightFromHour != null) {
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

  const strategiesRaw = arr(p, input, '', 'enabledStrategies', { minLength: 1 });
  const enabledStrategies: string[] = [];
  strategiesRaw?.forEach((v, i) => {
    if (typeof v !== 'string') p.error(`enabledStrategies[${i}]`, 'moet een tekst zijn');
    else enabledStrategies.push(v);
  });

  const criticalRaw = arr(p, input, '', 'criticalInputs');
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
      for (const [stand, doel] of Object.entries(aliasRaw)) {
        if (typeof doel !== 'string' || !(MODES as readonly string[]).includes(doel)) {
          p.error(
            join('mode.aliases', stand),
            `"${String(doel)}" is geen bekende modus; kies uit ${MODES.join(', ')}`,
          );
          continue;
        }
        aliases[stand] = doel as Mode;
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
      const kentHandmatig =
        Object.values(aliases).includes('handmatig') || handsOffWhen.length > 0;
      if (!kentHandmatig) {
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
    const stabilisation = ref(p, timersRaw['stabilisation'], 'timers.stabilisation', defaultAdapter);
    // `manualOverride` is optioneel: op dit moment leest niets in de kern hem
    // uit. Wie hem weglaat verandert geen enkel besluit.
    const manualOverrideRaw = timersRaw['manualOverride'];
    const manualOverride =
      manualOverrideRaw === undefined
        ? null
        : ref(p, manualOverrideRaw, 'timers.manualOverride', defaultAdapter);
    if (stabilisation) {
      timers = { stabilisation, ...(manualOverride ? { manualOverride } : {}) };
    }
  }

  const sun = ref(p, input['sun'], 'sun', defaultAdapter);

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
          const uit: Record<string, Partial<Record<Mode, { heat?: DeviceRef; cool?: DeviceRef }>>> =
            {};
          for (const [zoneId, perModus] of Object.entries(setpointsRaw)) {
            const zPath = join('migration.setpoints', zoneId);
            if (!zones.some((z) => z.id === zoneId)) {
              p.error(zPath, `verwijst naar zone "${zoneId}" die niet bestaat`);
              continue;
            }
            if (!isRecord(perModus)) {
              p.error(zPath, 'moet een object zijn met een ingang per modus');
              continue;
            }
            const modi: Partial<Record<Mode, { heat?: DeviceRef; cool?: DeviceRef }>> = {};
            for (const [modus, richtingen] of Object.entries(perModus)) {
              const mPath = join(zPath, modus);
              if (!(MODES as readonly string[]).includes(modus)) {
                p.error(mPath, `"${modus}" is geen bekende modus`);
                continue;
              }
              if (!isRecord(richtingen)) {
                p.error(mPath, 'moet een object zijn met heat en/of cool');
                continue;
              }
              const heat =
                richtingen['heat'] === undefined
                  ? null
                  : ref(p, richtingen['heat'], join(mPath, 'heat'), defaultAdapter);
              const cool =
                richtingen['cool'] === undefined
                  ? null
                  : ref(p, richtingen['cool'], join(mPath, 'cool'), defaultAdapter);
              if (heat || cool) {
                modi[modus as Mode] = { ...(heat ? { heat } : {}), ...(cool ? { cool } : {}) };
              }
            }
            if (Object.keys(modi).length > 0) uit[zoneId] = modi;
          }
          if (Object.keys(uit).length > 0) setpoints = uit;
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

  checkCoherence(p, { zones, actuators, enabledStrategies }, knownStrategies);

  const errors = p.errors;
  const incomplete =
    !id ||
    !timezone ||
    !power ||
    !schedule ||
    !sun ||
    zones.length === 0 ||
    actuators.length === 0;

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
      sun: sun as DeviceRef,
      ...(outdoorTemperature ? { outdoorTemperature } : {}),
      ...(migration ? { migration } : {}),
    },
    warnings: p.warnings,
  };
}

/** Zet problemen om naar regels die je aan een mens kunt laten zien. */
export function formatProblems(problems: readonly ConfigProblem[]): string[] {
  return problems.map((p) => `  ${p.path === '' ? '(configuratie)' : p.path}: ${p.message}`);
}
