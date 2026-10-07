/**
 * Het Energie-dashboard en de statistiek van Home Assistant, voor Opbrengst
 * (besluit 102). Alleen leesopdrachten, via de witte lijst van de client.
 */

import type { EnergySource, MeterOption } from '../../web/energy.js';
import type { HaClient } from './client.js';

interface StatisticId {
  readonly statistic_id: string;
  readonly name?: string | null;
  readonly unit_class?: string | null;
  readonly has_sum?: boolean;
}

interface StatisticRow {
  readonly start: number | string;
  readonly change?: number | null;
}

const toMs = (v: number | string) => (typeof v === 'number' ? v : Date.parse(v));

export function haEnergySource(client: HaClient): EnergySource {
  return {
    async prefs() {
      try {
        return await client.query<unknown>('energy/get_prefs');
      } catch {
        // Niet ingericht: Home Assistant antwoordt dan met een fout.
        return null;
      }
    },
    async meters(): Promise<readonly MeterOption[]> {
      const list = await client.query<StatisticId[]>('recorder/list_statistic_ids', { statistic_type: 'sum' });
      return list
        .filter((s) => s.has_sum !== false && (s.unit_class === 'energy' || s.unit_class === 'volume'))
        .map((s) => ({ id: s.statistic_id, naam: s.name?.trim() || s.statistic_id, soort: s.unit_class === 'volume' ? 'volume' : 'energy' }) as const)
        .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    },
    async changes(ids, startMs, endMs, period) {
      if (ids.length === 0) return {};
      const raw = await client.query<Record<string, StatisticRow[]>>('recorder/statistics_during_period', {
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
        statistic_ids: [...ids],
        period,
        types: ['change'],
        // Alles in kWh en m³, ook een omvormer die in Wh telt.
        units: { energy: 'kWh', volume: 'm³' },
      });
      return Object.fromEntries(
        Object.entries(raw ?? {}).map(([id, rows]) => [
          id,
          rows.filter((r) => typeof r.change === 'number' && Number.isFinite(r.change)).map((r) => ({ startMs: toMs(r.start), change: r.change as number })),
        ]),
      );
    },
  };
}
