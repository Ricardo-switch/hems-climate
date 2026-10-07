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

export const ENERGY_FILE = 'energie.json';

export interface EnergyDevice {
  /** Het statistiek-id, meestal de entiteit: `sensor.airconditioning_woonkamer_energie_kwh`. */
  readonly id: string;
  readonly naam: string;
}

export interface EnergyPrices {
  /** Euro per kWh van het net. */
  readonly stroom: number | null;
  /** Euro per kWh terug; null is "zoals stroom", zolang er gesaldeerd wordt. */
  readonly teruglevering: number | null;
  /** Euro per m³ gas. */
  readonly gas: number | null;
  /** Vaste kosten per maand, stroom en gas samen. */
  readonly vastPerMaand: number | null;
}

export interface EnergySettings {
  readonly versie: 1;
  /** Overgenomen uit Home Assistant, of zelf ingesteld. */
  readonly bron: 'home-assistant' | 'zelf';
  readonly net: { readonly afname: readonly string[]; readonly teruglevering: readonly string[] };
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
    net: { afname, teruglevering: terug },
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
  const p = isRecord(body['prijzen']) ? body['prijzen'] : {};
  const prijzen: Record<keyof EnergyPrices, number | null> = { stroom: null, teruglevering: null, gas: null, vastPerMaand: null };
  for (const k of Object.keys(prijzen) as (keyof EnergyPrices)[]) {
    const v = p[k] ?? null;
    const max = k === 'vastPerMaand' ? 500 : 10;
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max)) return { ok: false, reden: `prijzen.${k} is een bedrag van 0 tot ${max} euro, of null` };
    prijzen[k] = v === null ? null : Math.round(v * 100_000) / 100_000;
  }
  const bron = body['bron'] === 'home-assistant' ? 'home-assistant' : 'zelf';
  return { ok: true, settings: { versie: 1, bron, net: { afname, teruglevering: terug }, zon, gas, apparaten, prijzen } };
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
