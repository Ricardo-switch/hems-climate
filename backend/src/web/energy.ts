/**
 * Meters en prijzen voor Opbrengst (besluit 102).
 *
 * De app bewaart zelf welke meters het huis heeft en wat stroom en gas kosten,
 * in `energie.json` naast de dataset, en de bewoner beheert dat via Instellingen.
 * Wie Home Assistant al heeft ingericht, neemt het in één keer over uit het
 * Energie-dashboard (`energy/get_prefs`); wie dat niet heeft, kiest de meters
 * uit een lijst en vult de prijzen in. Daarna rekent Opbrengst met wat hier
 * staat, ook als het dashboard later verandert: de app is de bron.
 *
 * Alles hier is lezen uit Home Assistant. Er gaat niets naartoe.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { raadDal, type DalEigen, type DalRegio, type Tarieven, type VastePost } from './tarief.js';

export const ENERGY_FILE = 'energie.json';

/**
 * Zonder slimme meter (besluit 196): wat een huis overdag gewoon gebruikt naast
 * de apparaten met een eigen meter, om te schatten hoeveel zon je zelf gebruikte
 * en hoeveel er over is. Een gemiddeld huis gebruikt rond 310 W, overdag meer.
 * Liever te zuinig dan te mooi: bij het huis van de bewoner (gemiddeld 625 W)
 * schatte dit oktober 47% zelf gebruikt, met de meter was het 63%.
 */
export const BASIS_ZONDER_METER_W = 400;

export interface EnergyDevice {
  /** Het statistiek-id, meestal de entiteit: `sensor.airconditioning_woonkamer_energie_kwh`. */
  readonly id: string;
  readonly naam: string;
}

/** Wat stroom en gas kosten, zoals het contract het zegt (besluit 110, `tarief.ts`). */
export type EnergyPrices = Tarieven;

export interface EnergySettings {
  readonly versie: 1;
  /** Overgenomen uit Home Assistant, of zelf ingesteld. */
  readonly bron: 'home-assistant' | 'zelf';
  /**
   * De meters van het net. `dal` zegt welke het daltarief tellen (tarief 1 van
   * de slimme meter, besluit 110); zonder lijst raadt de dienst het aan de naam.
   */
  readonly net: { readonly afname: readonly string[]; readonly teruglevering: readonly string[]; readonly dal?: readonly string[] };
  readonly zon: readonly string[];
  readonly gas: string | null;
  readonly apparaten: readonly EnergyDevice[];
  readonly prijzen: EnergyPrices;
}

/** Een meter om uit te kiezen, uit de statistiek van Home Assistant. */
export interface MeterOption {
  readonly id: string;
  readonly naam: string;
  /** `energy` (kWh) of `volume` (m³). */
  readonly soort: 'energy' | 'volume';
  /**
   * Waar hij waarschijnlijk voor is, zodat elke lijst eerst toont wat past: een
   * P1-meter is geen apparaat, een tv geen zonnepaneel. `periode` is een teller
   * die elke dag, maand of jaar opnieuw begint, of een berekende waarde; die
   * hoort nergens als bron.
   */
  readonly rol?: MeterRole;
}

export type MeterRole = 'afname' | 'teruglevering' | 'zon' | 'gas' | 'apparaat' | 'periode';

/** Integraties van een slimme meter (het net). */
const GRID_PLATFORMS = new Set(['dsmr', 'dsmr_reader', 'p1_monitor', 'slimmelezer', 'energyzero']);
/** Integraties van omvormers en zonnepanelen. */
const SOLAR_PLATFORMS = new Set(['solaredge', 'solaredge_modbus', 'fronius', 'enphase_envoy', 'sma', 'growatt_server', 'huawei_solar', 'solax', 'goodwe', 'apsystems', 'solarman', 'omnik_inverter', 'forecast_solar', 'sunsynk']);

/**
 * De rol van een meter, uit zijn integratie en zijn naam. Een schatting: in de
 * app staat wat niet past onder "andere meters", zodat er altijd een uitweg is.
 */
export function meterRole(id: string, naam: string, soort: 'energy' | 'volume', platform: string | null = null): MeterRole {
  if (soort === 'volume') return 'gas';
  const text = `${id} ${naam}`.toLowerCase();
  const has = (re: RegExp) => re.test(text);
  // Tellers die opnieuw beginnen, en berekende of geschatte waarden.
  if (platform === 'utility_meter' || platform === 'forecast_solar' || has(/vandaag|deze maand|dit jaar|today|this[ _]month|this[ _]year|_dag\b|_maand\b|_jaar\b|daily|monthly|yearly|bespaard|saved|verschil|gratis|free|gecombineerd|combined|forecast|prognose|remaining/)) {
    return 'periode';
  }
  const export_ = has(/export|teruglever|returned|production_tarif|levering_aan|to_grid/);
  const gridMeter = (platform != null && GRID_PLATFORMS.has(platform)) || has(/\bp1\b|p1_meter|p1 meter|dsmr|slimme meter|smart meter|electricity_meter/);
  if (gridMeter) return export_ ? 'teruglevering' : 'afname';
  const solar = (platform != null && SOLAR_PLATFORMS.has(platform)) || has(/solar|zonnepane|omvormer|inverter|\bpv\b|opgewekt|opbrengst/);
  if (solar) {
    // Een omvormer meet ook wat het huis gebruikte of uitwisselde: dat is geen opbrengst.
    if (has(/import|export|consum|verbruik|self|zelf/)) return 'periode';
    return 'zon';
  }
  return 'apparaat';
}

/** Wat de dienst uit Home Assistant leest; in de tests een nep. */
export interface EnergySource {
  /** Het Energie-dashboard, of null als het niet is ingericht. */
  prefs(): Promise<unknown>;
  /** De meters met een optelbare statistiek. */
  meters(): Promise<readonly MeterOption[]>;
  /** De stand van een entiteit als getal: voor een prijs die uit een entiteit komt. */
  entityNumber?(entityId: string): number | null;
  /** Per meter het verbruik per periode, in kWh en m³. */
  changes(
    ids: readonly string[],
    startMs: number,
    endMs: number,
    period: 'hour' | 'day' | 'week' | 'month',
  ): Promise<Readonly<Record<string, readonly { readonly startMs: number; readonly change: number }[]>>>;
}

const STAT_ID = /^[a-z_][a-z0-9_]*[.:][a-z0-9_]+$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && STAT_ID.test(v) ? v : null);
const price = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 ? Math.round(v * 100_000) / 100_000 : null);

/**
 * Leest het Energie-dashboard van Home Assistant. Het net heeft afname en
 * teruglevering (vaak per tarief), de zon een of meer omvormers, gas één meter
 * met een prijs; de apparaten staan los. Een prijs die uit een entiteit komt
 * (een `input_number`, of een dynamisch tarief) neemt de stand van nu over; die
 * kan de bewoner daarna aanpassen.
 */
export function importFromPrefs(
  prefs: unknown,
  meters: readonly MeterOption[] = [],
  entityNumber: (entityId: string) => number | null = () => null,
): EnergySettings | null {
  if (!isRecord(prefs) || !Array.isArray(prefs['energy_sources'])) return null;
  const nameOf = (id: string) => meters.find((m) => m.id === id)?.naam ?? id;
  // Een vast getal, of de stand van de entiteit die de prijs geeft.
  const priceIn = (x: Record<string, unknown>, suffix = '') => {
    const entity = x[`entity_energy_price${suffix}`];
    return price(x[`number_energy_price${suffix}`]) ?? (typeof entity === 'string' ? price(entityNumber(entity)) : null);
  };
  const afname: string[] = [];
  const terug: string[] = [];
  const zon: string[] = [];
  let gas: string | null = null;
  let stroomPrijs: number | null = null;
  let terugPrijs: number | null = null;
  let gasPrijs: number | null = null;
  for (const src of prefs['energy_sources']) {
    if (!isRecord(src)) continue;
    if (src['type'] === 'grid') {
      // Twee opbouwen: de oude met lijsten `flow_from` en `flow_to`, de nieuwe
      // (2025) met een netbron per tarief, afname en teruglevering samen, en de
      // prijs van teruglevering in velden met `_export` erachter.
      const flat = !Array.isArray(src['flow_from']);
      const from: unknown[] = flat ? [src] : (src['flow_from'] as unknown[]);
      const to: unknown[] = flat ? [src] : Array.isArray(src['flow_to']) ? src['flow_to'] : [];
      for (const f of from) {
        const id = isRecord(f) ? str(f['stat_energy_from']) : null;
        if (id && !afname.includes(id)) afname.push(id);
        if (isRecord(f)) stroomPrijs ??= priceIn(f);
      }
      for (const t of to) {
        const id = isRecord(t) ? str(t['stat_energy_to']) : null;
        if (id && !terug.includes(id)) terug.push(id);
        if (isRecord(t)) terugPrijs ??= priceIn(t, flat ? '_export' : '');
      }
    } else if (src['type'] === 'solar') {
      const id = str(src['stat_energy_from']);
      if (id && !zon.includes(id)) zon.push(id);
    } else if (src['type'] === 'gas') {
      gas ??= str(src['stat_energy_from']);
      gasPrijs ??= priceIn(src);
    }
  }
  const apparaten: EnergyDevice[] = [];
  for (const d of Array.isArray(prefs['device_consumption']) ? prefs['device_consumption'] : []) {
    const id = isRecord(d) ? str(d['stat_consumption']) : null;
    if (!id || apparaten.some((a) => a.id === id)) continue;
    const own = isRecord(d) && typeof d['name'] === 'string' && d['name'].trim() ? d['name'].trim() : null;
    apparaten.push({ id, naam: (own ?? nameOf(id)).slice(0, 40) });
  }
  return {
    versie: 1,
    bron: 'home-assistant',
    // Welke meters het daltarief tellen: tarief 1 van de slimme meter.
    net: { afname, teruglevering: terug, dal: [...afname, ...terug].filter(raadDal) },
    zon,
    gas,
    apparaten,
    prijzen: { stroom: stroomPrijs, teruglevering: terugPrijs, gas: gasPrijs, vastPerMaand: null },
  };
}

/**
 * Waar het Energie-dashboard zijn prijzen vandaan haalt, per meter: een vast
 * getal, een entiteit met de prijs, of een sensor met de totale kosten. Zo kan
 * de app zeggen waarom een prijs niet mee kwam.
 */
export interface DashboardPrice {
  readonly soort: string;
  readonly meter: string | null;
  readonly prijs: number | null;
  readonly prijsEntiteit: string | null;
  readonly kostenMeter: string | null;
  /**
   * De kostensensor is de meter zelf: dan telt Home Assistant elke kWh of m³
   * als een euro. Zo stond het op 7 oktober in dit huis.
   */
  readonly kostenIsMeter: boolean;
}

export function pricesInPrefs(prefs: unknown): DashboardPrice[] {
  if (!isRecord(prefs) || !Array.isArray(prefs['energy_sources'])) return [];
  const out: DashboardPrice[] = [];
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  const add = (soort: string, x: unknown, key: string, suffix = '', costKey = 'stat_cost') => {
    if (!isRecord(x)) return;
    const meter = text(x[key]);
    const cost = text(x[costKey]);
    const n = x[`number_energy_price${suffix}`];
    out.push({
      soort,
      meter,
      prijs: typeof n === 'number' ? n : null,
      prijsEntiteit: text(x[`entity_energy_price${suffix}`]),
      kostenMeter: cost,
      kostenIsMeter: cost != null && cost === meter,
    });
  };
  for (const src of prefs['energy_sources']) {
    if (!isRecord(src)) continue;
    if (src['type'] === 'grid') {
      if (Array.isArray(src['flow_from'])) {
        for (const f of src['flow_from']) add('afname', f, 'stat_energy_from');
        for (const t of Array.isArray(src['flow_to']) ? src['flow_to'] : []) add('teruglevering', t, 'stat_energy_to', '', 'stat_compensation');
      } else {
        add('afname', src, 'stat_energy_from');
        if (typeof src['stat_energy_to'] === 'string') add('teruglevering', src, 'stat_energy_to', '_export', 'stat_compensation');
      }
    } else if (src['type'] === 'gas') add('gas', src, 'stat_energy_from');
  }
  return out;
}

export type EnergyCheck = { readonly ok: true; readonly settings: EnergySettings } | { readonly ok: false; readonly reden: string };

/** Toetst wat de app wil bewaren. Meters zijn statistiek-id's, prijzen 0 tot 10 euro. */
export function validateEnergy(body: unknown): EnergyCheck {
  if (!isRecord(body)) return { ok: false, reden: 'verwacht een object' };
  const ids = (v: unknown, what: string): string[] | string => {
    if (!Array.isArray(v) || v.length > 10) return `${what} is een lijst van hooguit 10 meters`;
    const out: string[] = [];
    for (const x of v) {
      const id = str(x);
      if (!id) return `${what}: "${String(x)}" is geen meter`;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };
  const net = isRecord(body['net']) ? body['net'] : {};
  const afname = ids(net['afname'] ?? [], 'net.afname');
  if (typeof afname === 'string') return { ok: false, reden: afname };
  const terug = ids(net['teruglevering'] ?? [], 'net.teruglevering');
  if (typeof terug === 'string') return { ok: false, reden: terug };
  const zon = ids(body['zon'] ?? [], 'zon');
  if (typeof zon === 'string') return { ok: false, reden: zon };
  const gasRaw = body['gas'] ?? null;
  const gas = gasRaw === null ? null : str(gasRaw);
  if (gasRaw !== null && gas == null) return { ok: false, reden: 'gas is één meter, of null' };
  const devicesRaw = body['apparaten'] ?? [];
  if (!Array.isArray(devicesRaw) || devicesRaw.length > 30) return { ok: false, reden: 'apparaten is een lijst van hooguit 30' };
  const apparaten: EnergyDevice[] = [];
  for (const d of devicesRaw) {
    const id = isRecord(d) ? str(d['id']) : null;
    const naam = isRecord(d) && typeof d['naam'] === 'string' ? d['naam'].trim() : '';
    if (!id || !naam || naam.length > 40) return { ok: false, reden: 'een apparaat heeft een meter en een naam van hooguit 40 tekens' };
    if (!apparaten.some((a) => a.id === id)) apparaten.push({ id, naam });
  }
  // Welke meters het daltarief tellen; alleen meters van het net.
  const dalRaw = net['dal'];
  let dal: string[] | undefined;
  if (dalRaw !== undefined) {
    const d = ids(dalRaw, 'net.dal');
    if (typeof d === 'string') return { ok: false, reden: d };
    if (d.some((id) => !afname.includes(id) && !terug.includes(id))) return { ok: false, reden: 'net.dal noemt een meter die niet bij het net staat' };
    dal = d;
  }
  const p = isRecord(body['prijzen']) ? body['prijzen'] : {};
  const bedrag = (k: string, v: unknown, max: number): number | null | string => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return `prijzen.${k} is een bedrag van 0 tot ${max} euro, of null`;
    return Math.round(v * 100_000) / 100_000;
  };
  const enkel: Record<'stroom' | 'stroomDal' | 'teruglevering' | 'gas' | 'vastPerMaand', number | null> = { stroom: null, stroomDal: null, teruglevering: null, gas: null, vastPerMaand: null };
  for (const k of Object.keys(enkel) as (keyof typeof enkel)[]) {
    const v = bedrag(k, p[k], k === 'vastPerMaand' ? 500 : 10);
    if (typeof v === 'string') return { ok: false, reden: v };
    enkel[k] = v;
  }
  const dalUren = p['dalUren'] ?? 'nl';
  if (dalUren !== 'nl' && dalUren !== 'zuid' && dalUren !== 'eigen') return { ok: false, reden: 'prijzen.dalUren is nl, zuid of eigen' };
  // Eigen daltijden (besluit 178): hele uren, van en tot verschillend.
  let dalEigen: DalEigen | null = null;
  if (dalUren === 'eigen') {
    const d = isRecord(p['dalEigen']) ? p['dalEigen'] : {};
    const uur = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23;
    if (!uur(d['van']) || !uur(d['tot']) || d['van'] === d['tot'] || typeof d['weekend'] !== 'boolean') {
      return { ok: false, reden: 'prijzen.dalEigen is { van, tot, weekend }: twee verschillende hele uren van 0 tot 23, en of het weekend dal is' };
    }
    dalEigen = { van: d['van'] as number, tot: d['tot'] as number, weekend: d['weekend'] as boolean };
  }
  const salderen = p['salderen'] ?? true;
  if (typeof salderen !== 'boolean') return { ok: false, reden: 'prijzen.salderen is waar of onwaar' };
  const na = isRecord(p['vanaf2027']) ? p['vanaf2027'] : {};
  const vergoeding = bedrag('vanaf2027.vergoeding', na['vergoeding'], 10);
  const terugKosten = bedrag('vanaf2027.kosten', na['kosten'], 10);
  if (typeof vergoeding === 'string') return { ok: false, reden: vergoeding };
  if (typeof terugKosten === 'string') return { ok: false, reden: terugKosten };
  const startRaw = p['contractStart'] ?? null;
  let contractStart: string | null = null;
  if (startRaw !== null) {
    const m = typeof startRaw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(startRaw) : null;
    const t = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!m || !t || t.getUTCMonth() !== Number(m[2]) - 1 || t.getUTCDate() !== Number(m[3]) || Number(m[1]) < 2000 || Number(m[1]) > 2100) {
      return { ok: false, reden: 'prijzen.contractStart is een datum als 2025-03-15, of null' };
    }
    contractStart = startRaw as string;
  }
  const vastRaw = p['vast'] ?? [];
  if (!Array.isArray(vastRaw) || vastRaw.length > 20) return { ok: false, reden: 'prijzen.vast is een lijst van hooguit 20 posten' };
  const vast: VastePost[] = [];
  for (const x of vastRaw) {
    const naam = isRecord(x) && typeof x['naam'] === 'string' ? x['naam'].trim().replace(/\s+/g, ' ') : '';
    const b = isRecord(x) ? x['bedrag'] : null;
    const per = isRecord(x) ? x['per'] : null;
    const soort = isRecord(x) ? x['soort'] : null;
    if (!naam || naam.length > 40) return { ok: false, reden: 'een vaste post heeft een naam van hooguit 40 tekens' };
    if (typeof b !== 'number' || !Number.isFinite(b) || Math.abs(b) > 5000) return { ok: false, reden: `vaste post ${naam}: het bedrag is van -5000 tot 5000 euro` };
    if (per !== 'dag' && per !== 'maand' && per !== 'jaar') return { ok: false, reden: `vaste post ${naam}: per dag, maand of jaar` };
    if (soort !== 'stroom' && soort !== 'gas') return { ok: false, reden: `vaste post ${naam}: stroom of gas` };
    vast.push({ naam, bedrag: Math.round(b * 100_000) / 100_000, per, soort });
  }
  const prijzen: EnergyPrices = {
    ...enkel,
    dalUren: dalUren as DalRegio,
    ...(dalEigen ? { dalEigen } : {}),
    salderen,
    vanaf2027: { vergoeding, kosten: terugKosten },
    vast,
    contractStart,
  };
  const bron = body['bron'] === 'home-assistant' ? 'home-assistant' : 'zelf';
  return { ok: true, settings: { versie: 1, bron, net: { afname, teruglevering: terug, ...(dal ? { dal } : {}) }, zon, gas, apparaten, prijzen } };
}

export type EnergySaveResult = { readonly ok: true; readonly settings: EnergySettings } | { readonly ok: false; readonly status: number; readonly reden: string };

export class EnergyStore {
  readonly #path: string;
  #current: EnergySettings | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#path = join(logDir, ENERGY_FILE);
  }

  async load(): Promise<EnergySettings | null> {
    try {
      const checked = validateEnergy(JSON.parse(await readFile(this.#path, 'utf-8')));
      this.#current = checked.ok ? checked.settings : null;
    } catch {
      this.#current = null;
    }
    return this.#current;
  }

  get current(): EnergySettings | null {
    return this.#current;
  }

  async save(body: unknown): Promise<EnergySaveResult> {
    const checked = validateEnergy(body);
    if (!checked.ok) return { ok: false, status: 400, reden: checked.reden };
    this.#current = checked.settings;
    const text = `${JSON.stringify(checked.settings, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    // Eerst naast het bestand, dan omwisselen; na elkaar, nooit door elkaar.
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
    return { ok: true, settings: checked.settings };
  }
}
