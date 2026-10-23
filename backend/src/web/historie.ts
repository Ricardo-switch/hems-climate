/**
 * Vandaag uit de statistiek van Home Assistant (17 oktober 2026): het vermogen
 * van de panelen en het net per vijf minuten, voor de kwartieren die het eigen
 * logboek nog niet heeft, zoals op de eerste dag van een nieuwe installatie.
 * Alleen lezen, met dezelfde vraag als Opbrengst. Vijf minuten bewaard; een
 * afgesloten dag (gisteren) verandert niet meer.
 *
 * Stond in main.ts (besluit 180, verder geknipt op 23 oktober 2026); hier met
 * de vraag aan Home Assistant en de klok als invoer, en daardoor te toetsen.
 */

import type { DeviceRef, MeasurementPoint, SiteConfig } from '../core/model.js';
import type { PowerRow } from './today.js';

type Rijen = { zon: PowerRow[]; net: PowerRow[] };
type Statistiek = Record<string, { start: number | string; mean?: number | null }[]>;

export interface HistorieOpties {
  readonly config: () => SiteConfig | null;
  /** Een vraag aan Home Assistant: hier `recorder/statistics_during_period`. */
  readonly vraag: (type: string, velden: Record<string, unknown>) => Promise<Statistiek | null>;
  readonly nu?: () => number;
}

export class Historie {
  readonly #bewaard = new Map<number, { at: number; rijen: Rijen }>();
  readonly #o: HistorieOpties;

  constructor(o: HistorieOpties) {
    this.#o = o;
  }

  /** De zon en het net per vijf minuten tussen twee momenten, of null zonder meters. */
  async van(vanMs: number, totMs: number): Promise<Rijen | null> {
    const config = this.#o.config();
    if (!config) return null;
    const nu = this.#o.nu ?? Date.now;
    const punt = (p: MeasurementPoint | DeviceRef | undefined) => (p && !('attribute' in p && p.attribute) ? p.id : null);
    const zonId = punt(config.solarProduction);
    const netId = punt(config.power.gridPower);
    const ids = [zonId, netId].filter((x): x is string => x != null);
    if (ids.length === 0) return null;
    const bewaard = this.#bewaard.get(vanMs);
    if (bewaard && (totMs < nu() - 3_600_000 || nu() - bewaard.at < 5 * 60_000)) return bewaard.rijen;
    const raw = await this.#o.vraag('recorder/statistics_during_period', {
      start_time: new Date(vanMs).toISOString(),
      end_time: new Date(Math.min(totMs, nu())).toISOString(),
      statistic_ids: ids,
      period: '5minute',
      types: ['mean'],
      units: { power: 'W' },
    });
    const rijen = (id: string | null): PowerRow[] =>
      id == null
        ? []
        : (raw?.[id] ?? [])
            .filter((r) => typeof r.mean === 'number' && Number.isFinite(r.mean))
            .map((r) => ({ startMs: typeof r.start === 'number' ? r.start : Date.parse(r.start), meanW: r.mean as number }));
    const uit = { zon: rijen(zonId), net: rijen(netId) };
    this.#bewaard.set(vanMs, { at: nu(), rijen: uit });
    // Alleen vandaag en gisteren zijn nodig.
    for (const k of this.#bewaard.keys()) if (k < vanMs - 2 * 86_400_000) this.#bewaard.delete(k);
    return uit;
  }
}
