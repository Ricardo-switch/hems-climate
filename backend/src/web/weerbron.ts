/**
 * Waar het weer vandaan komt (besluit 111): Buienradar, een weerentiteit van
 * Home Assistant, of Open-Meteo (besluit 127). De naam voor onder het blad,
 * en de dagverwachting van die bron.
 *
 * Stond in main.ts (besluit 180, verder geknipt op 23 oktober 2026); hier
 * zuiver en daardoor te toetsen. Welke bron gekozen is en het ophalen zelf
 * blijven in main.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import { OPEN_METEO } from './open-meteo.js';
import { forecastFromEntity, readForecast, type EntityForecast, type ForecastDay } from './weather.js';

/** De naam van de weerbron, voor onder het blad. */
export function weerNaamVan(bron: string | null, states: ReadonlyMap<string, HaEntityState>): string {
  if (bron === OPEN_METEO) return 'Open-Meteo';
  if (bron?.startsWith('weather.')) return String(states.get(bron)?.attributes['friendly_name'] ?? 'je weerdienst');
  return 'Buienradar';
}

/** De dagverwachting van de gekozen bron; leeg als er nog niets is. */
export function verwachtingVan(
  bron: string | null,
  i: {
    readonly openMeteo: readonly ForecastDay[] | null;
    readonly entities: readonly HaRegistryEntity[] | null;
    readonly states: ReadonlyMap<string, HaEntityState>;
    /** De dagverwachting van een weerentiteit, uit het abonnement. */
    readonly entiteit: { readonly entity: string | null; readonly days: readonly EntityForecast[] };
    readonly nu: number;
    readonly zone: string;
  },
): ForecastDay[] {
  if (bron === OPEN_METEO) return [...(i.openMeteo ?? [])];
  if (!i.entities) return [];
  if (bron === 'buienradar') return readForecast(i.entities, i.states);
  if (bron?.startsWith('weather.')) {
    return forecastFromEntity(i.states.get(bron), i.entiteit.entity === bron ? [...i.entiteit.days] : [], i.nu, i.zone);
  }
  return [];
}
