/**
 * Meten met (besluit 123): per kamer kiest de bewoner één of meer sensoren. In
 * een kamer met een regeling rekent de regeling met het gemiddelde van wat er
 * meldt; in een kamer zonder regeling toont de app dat gemiddelde.
 *
 * De keuze staat in de indeling (`meten`, in `indeling.json`). Bij het starten
 * van de dienst vult hij de configuratie aan, zoals de antwoorden over de
 * aansluiting (103): de eerste sensor wordt `temperature`, de hele lijst
 * `temperatures`. Een nieuwe keuze gaat dus in bij de volgende start.
 *
 * Omdat de keuze de metingen van de dataset verandert, schrijft de dienst bij
 * elke start waarbij hij anders is dan de vorige keer, welke sensoren per zone
 * meetellen, met de tijd (`sensoren.ndjson` naast de dataset).
 */

import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SiteConfig } from '../core/model.js';
import { LAYOUT_FILE, type Layout } from './layout.js';

export const SENSOR_LOG_FILE = 'sensoren.ndjson';

/** Hoeveel sensoren een kamer hooguit meet. */
export const MAX_METEN = 6;

/** Een klimaatapparaat meet met zijn eigen thermometer; een sensor met zijn stand. */
export function pointFor(id: string): string | { id: string; attribute: string } {
  return id.startsWith('climate.') ? { id, attribute: 'current_temperature' } : id;
}

export interface MeasurementApplied {
  readonly raw: Record<string, unknown>;
  readonly toegevoegd: readonly string[];
}

/**
 * Zet de gekozen sensoren in de configuratie, per kamer met een regeling. Zuiver:
 * het resultaat gaat daarna door het eigen schema.
 */
export function withMeasurement(raw: Record<string, unknown>, layout: Pick<Layout, 'kamers'> | null): MeasurementApplied {
  if (layout == null) return { raw, toegevoegd: [] };
  const zones = Array.isArray(raw['zones']) ? (raw['zones'] as Record<string, unknown>[]) : [];
  const actuators = Array.isArray(raw['actuators']) ? (raw['actuators'] as Record<string, unknown>[]) : [];
  // Een apparaat van de regeling staat in de indeling onder zijn eigen id, zoals "nest";
  // de regeling meet met de entiteit in Home Assistant erachter (hersteld 15 oktober).
  const entiteit = (id: string) => {
    const ref = actuators.find((a) => a['id'] === id)?.['ref'];
    return typeof ref === 'string' ? ref : typeof ref === 'object' && ref != null && typeof (ref as Record<string, unknown>)['id'] === 'string' ? String((ref as Record<string, unknown>)['id']) : id;
  };
  const toegevoegd: string[] = [];
  const next = zones.map((z) => {
    const kamer = layout.kamers.find((k) => k.regelzone === z['id']);
    if (!kamer) return z;
    const eigen = kamer.meten ?? [];
    // Een kamer die meedoet (besluit 142): wat daar gekozen is, telt mee.
    const mee = layout.kamers.filter((k) => k.meedoenMet === kamer.id).flatMap((k) => k.meten ?? []);
    if (eigen.length === 0 && mee.length === 0) return z;
    const ids = [...new Set([...eigen, ...mee])].slice(0, MAX_METEN);
    // Zonder eigen keuze blijft de thermometer van de configuratie de eerste.
    const points = eigen.length ? ids.map((id) => pointFor(entiteit(id))) : [z['temperature'], ...ids.map((id) => pointFor(entiteit(id)))].slice(0, MAX_METEN);
    toegevoegd.push(`${kamer.naam} meet met ${points.length === 1 ? 'één sensor' : `${points.length} sensoren`}`);
    return { ...z, temperature: points[0], temperatures: points };
  });
  return toegevoegd.length ? { raw: { ...raw, zones: next }, toegevoegd } : { raw, toegevoegd };
}

/** De indeling uit het bestand naast de dataset, of null. */
export async function readLayoutFile(logDir: string): Promise<Layout | null> {
  try {
    const parsed = JSON.parse(await readFile(join(logDir, LAYOUT_FILE), 'utf-8')) as Layout;
    return parsed?.versie === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Per zone de sensoren waar de regeling nu mee rekent. */
export function sensorsPerZone(config: Pick<SiteConfig, 'zones'>): Record<string, string[]> {
  return Object.fromEntries(config.zones.map((z) => [z.id, (z.temperatures ?? [z.temperature]).map((t) => (t.attribute ? `${t.id}#${t.attribute}` : t.id))]));
}

/**
 * Schrijft de sensoren per zone in het logboek, als ze anders zijn dan de
 * vorige keer. Geeft terug of er iets geschreven is.
 */
export async function noteSensors(logDir: string, config: Pick<SiteConfig, 'zones'>, nowMs: number): Promise<boolean> {
  const path = join(logDir, SENSOR_LOG_FILE);
  const zones = sensorsPerZone(config);
  let last: Record<string, string[]> | null = null;
  try {
    const lines = (await readFile(path, 'utf-8')).trim().split('\n');
    const parsed = JSON.parse(lines.at(-1) ?? 'null') as { zones?: Record<string, string[]> } | null;
    last = parsed?.zones ?? null;
  } catch {
    last = null;
  }
  if (last != null && JSON.stringify(last) === JSON.stringify(zones)) return false;
  await appendFile(path, `${JSON.stringify({ tMs: nowMs, tijd: new Date(nowMs).toISOString(), zones })}\n`, 'utf-8');
  return true;
}
