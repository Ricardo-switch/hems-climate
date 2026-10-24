/**
 * Een boiler of jacuzzi vinden in Home Assistant (besluit 186), zoals de droger
 * bij de zon en je aansluiting (besluit 103).
 *
 * - **Een jacuzzi:** een thermostaat of boiler die zo heet, zoals de Intex
 *   PureSpa via de koppeling Intex Spa (`climate.`) of via Tuya Local
 *   (`water_heater.`).
 * - **Een boiler met temperatuur:** een `water_heater.`, zoals een
 *   warmtepompboiler of een elektrische boiler met eigen koppeling.
 * - **Een boiler aan een stekker:** een schakelaar die zo heet, met de meter
 *   van hetzelfde apparaat.
 * - **Een zonne-boilerregelaar:** een getal dat het vermogen zet, zoals een
 *   AC·THOR of PEEC.
 *
 * Wat hij trekt en hoe snel hij opwarmt, is een schatting per soort; het huis
 * leert het daarna zelf. Een voorstel: de bewoner kiest of hij op zon mag.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { HeatStore } from '../core/model.js';

export interface FoundHeatStore {
  readonly id: string;
  readonly naam: string;
  readonly soort: HeatStore['kind'];
  readonly control: HeatStore['control'];
  readonly actuator: string;
  readonly temperature?: { readonly id: string; readonly attribute?: string };
  readonly power?: string;
  readonly estimatedW: number;
  readonly minC: number;
  readonly sunC: number;
  readonly heatRateCPerHour: number;
  readonly legionellaC?: number;
}

const SPA = /spa|jacuzzi|hot.?tub|whirlpool|bubbelbad|bubbel|intex/i;
const BOILER = /boiler|geyser|water.?heater|warm.?water|tapwater|dhw/i;
const DIVERTER = /ac.?thor|elwa|my.?pv|peec|diverter/i;
/** Merken en woorden van warmtepompboilers: die trekken weinig en warmen langzaam. */
const WARMTEPOMP = /heat.?pump|warmtepomp|explorer|nuos|aquarea|altherma|ecotech|lyos|vitocal|aerotermo|thermo/i;

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function findHeatStores(
  states: ReadonlyMap<string, HaEntityState>,
  entities: readonly HaRegistryEntity[],
  devices: readonly HaDevice[],
): FoundHeatStore[] {
  const out: FoundHeatStore[] = [];
  const used = new Set<string>();
  const doneDevices = new Set<string>();
  const live = entities.filter((e) => !e.disabled_by && states.has(e.entity_id));
  // Eerst wat een temperatuur heeft, dan de schakelaars: een boiler met beide telt één keer.
  const volgorde = (e: HaRegistryEntity) => (/^(water_heater|climate)\./.test(e.entity_id) ? 0 : 1);
  for (const e of [...live].sort((a, b) => volgorde(a) - volgorde(b))) {
    const domain = e.entity_id.split('.')[0]!;
    if (!['water_heater', 'climate', 'switch', 'number'].includes(domain)) continue;
    if (e.device_id && doneDevices.has(e.device_id)) continue;
    const device = devices.find((d) => d.id === e.device_id);
    const deviceName = device?.name_by_user ?? device?.name ?? '';
    const label = `${deviceName} ${e.entity_id} ${e.original_name ?? ''} ${e.platform ?? ''} ${device?.model ?? ''}`;
    const mine = e.device_id ? live.filter((x) => x.device_id === e.device_id) : [e];
    const state = states.get(e.entity_id)!;

    let gevonden: Omit<FoundHeatStore, 'id' | 'naam' | 'power'> | null = null;
    if ((domain === 'climate' || domain === 'water_heater') && (SPA.test(label) || e.platform === 'intex_spa')) {
      gevonden = { soort: 'jacuzzi', control: 'setpoint', actuator: e.entity_id, temperature: { id: e.entity_id, attribute: 'current_temperature' }, estimatedW: 2200, minC: 30, sunC: 38, heatRateCPerHour: 1.5 };
    } else if (domain === 'water_heater') {
      const wp = WARMTEPOMP.test(label);
      const heeftTemp = typeof state.attributes['current_temperature'] === 'number';
      gevonden = {
        soort: 'boiler',
        control: heeftTemp ? 'setpoint' : 'switch',
        actuator: e.entity_id,
        ...(heeftTemp ? { temperature: { id: e.entity_id, attribute: 'current_temperature' } } : {}),
        estimatedW: wp ? 500 : 2000,
        minC: 50,
        sunC: 65,
        heatRateCPerHour: wp ? 6 : 10,
        ...(heeftTemp ? { legionellaC: 60 } : {}),
      };
    } else if (domain === 'switch' && BOILER.test(label)) {
      const temp = mine.find((x) => x.entity_id.startsWith('sensor.') && (x.device_class ?? x.original_device_class ?? states.get(x.entity_id)?.attributes['device_class']) === 'temperature');
      gevonden = {
        soort: 'boiler',
        control: 'switch',
        actuator: e.entity_id,
        ...(temp ? { temperature: { id: temp.entity_id } } : {}),
        estimatedW: 2000,
        minC: 50,
        sunC: 65,
        heatRateCPerHour: 10,
      };
    } else if (domain === 'number' && DIVERTER.test(label)) {
      const temp = mine.find((x) => x.entity_id.startsWith('sensor.') && (x.device_class ?? x.original_device_class ?? states.get(x.entity_id)?.attributes['device_class']) === 'temperature');
      gevonden = {
        soort: 'boiler',
        control: 'diverter',
        actuator: e.entity_id,
        ...(temp ? { temperature: { id: temp.entity_id } } : {}),
        estimatedW: 3000,
        minC: 50,
        sunC: 65,
        heatRateCPerHour: 10,
        ...(temp ? { legionellaC: 60 } : {}),
      };
    }
    if (gevonden == null) continue;
    if (e.device_id) doneDevices.add(e.device_id);

    const power = mine.find((x) => {
      if (!x.entity_id.startsWith('sensor.')) return false;
      const s = states.get(x.entity_id);
      return (x.device_class ?? x.original_device_class ?? s?.attributes['device_class']) === 'power' || /^k?W$/.test(String(s?.attributes['unit_of_measurement'] ?? ''));
    });
    const standaard = gevonden.soort === 'jacuzzi' ? 'Jacuzzi' : 'Boiler';
    const naam = device?.name_by_user?.trim() || standaard;
    let id = slug(gevonden.soort) || 'buffer';
    for (let i = 2; used.has(id); i++) id = `${gevonden.soort}-${i}`;
    used.add(id);
    out.push({ id, naam, ...gevonden, ...(power ? { power: power.entity_id } : {}) });
  }
  return out;
}

/** Een gevonden buffer zoals hij in de configuratie komt (besluit 186). */
export function heatStoreConfig(b: FoundHeatStore): Record<string, unknown> {
  return {
    id: b.id,
    name: b.naam,
    kind: b.soort,
    control: b.control,
    actuator: b.actuator,
    ...(b.temperature ? { temperature: b.temperature.attribute ? { id: b.temperature.id, attribute: b.temperature.attribute } : b.temperature.id } : {}),
    ...(b.power ? { power: b.power } : {}),
    estimatedW: b.estimatedW,
    minC: b.minC,
    sunC: b.sunC,
    heatRateCPerHour: b.heatRateCPerHour,
    ...(b.legionellaC != null ? { legionellaC: b.legionellaC } : {}),
  };
}
