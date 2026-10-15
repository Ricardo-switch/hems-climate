/**
 * Reconstrueert `SystemState` per minuut uit de geëxporteerde geschiedenis.
 *
 * Belangrijk voor de interpretatie: dit is een schaduwvergelijking, geen
 * gesloten simulatie. Op elk historisch moment krijgt de arbiter de toestand
 * waarin het huis werkelijk verkeerde, en we kijken wat hij dan zou doen. We
 * rekenen niet door wat er met de temperatuur gebeurd zou zijn als hij het
 * stuur had gehad — dat zou na de eerste afwijking fictie worden.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import { type EntitySource, attrToNumber, stateBool, stateNumber } from '../adapters/homeassistant/source.js';
import {
  isMeta,
  isUsable,
  type DatasetLine,
  type DatasetMeta,
  type DatasetRow,
} from './dataset.js';

export {
  buildSystemState as snapshot,
  configFrom as configAt,
  mapAction,
} from '../adapters/homeassistant/mapping.js';

export interface Track {
  readonly entityId: string;
  readonly rows: DatasetRow[];
}

export interface History {
  readonly meta: DatasetMeta;
  readonly tracks: ReadonlyMap<string, Track>;
}

export async function loadHistory(path: string): Promise<History> {
  const tracks = new Map<string, Track>();
  let meta: DatasetMeta | null = null;

  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.length === 0) continue;
    const parsed = JSON.parse(line) as DatasetLine;
    if (isMeta(parsed)) {
      meta = parsed;
      continue;
    }
    let track = tracks.get(parsed.e);
    if (!track) {
      track = { entityId: parsed.e, rows: [] };
      tracks.set(parsed.e, track);
    }
    track.rows.push(parsed);
  }

  if (!meta) throw new Error(`Geen meta-regel in ${path}`);
  for (const track of tracks.values()) track.rows.sort((a, b) => a.t - b.t);
  return { meta, tracks };
}

/** Volgt per entiteit de laatst geldige rij bij een oplopende tijdlijn. */
export class Cursor implements EntitySource {
  readonly #tracks: ReadonlyMap<string, Track>;
  readonly #index = new Map<string, number>();
  /** Wanneer de gemapte toestand van deze entiteit voor het laatst wisselde. */
  readonly #changedAt = new Map<string, number>();
  readonly #lastState = new Map<string, string>();
  /** Sinds wanneer hvac_action onafgebroken op deze waarde staat. */
  readonly #actionSince = new Map<string, number>();
  readonly #lastHvacAction = new Map<string, string>();

  constructor(history: History) {
    this.#tracks = history.tracks;
  }

  /** Schuift alle entiteiten door tot en met `tMs`. */
  advanceTo(tMs: number): void {
    for (const [entityId, track] of this.#tracks) {
      let i = this.#index.get(entityId) ?? -1;
      while (i + 1 < track.rows.length && track.rows[i + 1]!.t <= tMs) {
        i += 1;
        const row = track.rows[i]!;
        if (this.#lastState.get(entityId) !== row.s) {
          this.#lastState.set(entityId, row.s);
          this.#changedAt.set(entityId, row.t);
        }
        const hvac = row.a?.hvac_action;
        const hvacStr = typeof hvac === 'string' ? hvac : '';
        if (this.#lastHvacAction.get(entityId) !== hvacStr) {
          this.#lastHvacAction.set(entityId, hvacStr);
          this.#actionSince.set(entityId, row.t);
        }
      }
      this.#index.set(entityId, i);
    }
  }

  at(entityId: string): DatasetRow | null {
    const track = this.#tracks.get(entityId);
    const i = this.#index.get(entityId) ?? -1;
    if (!track || i < 0) return null;
    return track.rows[i] ?? null;
  }

  state(entityId: string): string | null {
    const row = this.at(entityId);
    return row && isUsable(row.s) ? row.s : null;
  }

  number(entityId: string): number | null {
    return stateNumber(this.state(entityId));
  }

  bool(entityId: string): boolean | null {
    return stateBool(this.state(entityId));
  }

  attr(entityId: string, key: string): string | number | null {
    const row = this.at(entityId);
    const v = row?.a?.[key as keyof NonNullable<DatasetRow['a']>];
    return v ?? null;
  }

  attrNumber(entityId: string, key: string): number | null {
    return attrToNumber(this.attr(entityId, key));
  }

  changedAt(entityId: string): number | null {
    return this.#changedAt.get(entityId) ?? null;
  }

  /** De laatst gerapporteerde hvac_action, of null als het apparaat die niet geeft. */
  hvacAction(entityId: string): string | null {
    const v = this.#lastHvacAction.get(entityId);
    return v == null || v === '' ? null : v;
  }

  /** Sinds wanneer die hvac_action onafgebroken geldt. */
  hvacActionSince(entityId: string): number | null {
    return this.#actionSince.get(entityId) ?? null;
  }
}
