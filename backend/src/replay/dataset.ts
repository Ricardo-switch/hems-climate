/**
 * Het uitwisselingsformaat tussen Home Assistant en de harness.
 *
 * Gzip-NDJSON: één meta-regel, daarna één regel per toestandswijziging,
 * oplopend in tijd. Bewust regelgebaseerd, zodat een nachtelijke export kan
 * aanvullen zonder het bestaande bestand te herschrijven, en zodat een defecte
 * regel de rest niet meesleept.
 */

/** Attributen die we bewaren. De rest van HA's attributen is voor ons ruis. */
export const KEPT_ATTRIBUTES = [
  'temperature',
  'current_temperature',
  'hvac_action',
  'preset_mode',
  'finishes_at',
  // De stand van een screen of zonnescherm, 0 (dicht) tot 100 (open). Voor het
  // thermisch model: hoeveel zon er door een raam binnenkomt (besluit 92).
  'current_position',
] as const;
export type KeptAttribute = (typeof KEPT_ATTRIBUTES)[number];

export interface DatasetMeta {
  readonly kind: 'meta';
  readonly version: 1;
  readonly source: string;
  readonly exportedAtMs: number;
  readonly fromMs: number;
  readonly toMs: number;
  readonly entities: readonly string[];
  readonly rows: number;
}

export interface DatasetRow {
  /** Epoch-ms van de wijziging. */
  readonly t: number;
  /** Entity-ID zoals Home Assistant het kent. */
  readonly e: string;
  /** Ruwe state-string, inclusief 'unavailable' en 'unknown'. */
  readonly s: string;
  /** Alleen de attributen uit KEPT_ATTRIBUTES die aanwezig waren. */
  readonly a?: Partial<Record<KeptAttribute, string | number | null>>;
}

export type DatasetLine = DatasetMeta | DatasetRow;

export function isMeta(line: DatasetLine): line is DatasetMeta {
  return (line as DatasetMeta).kind === 'meta';
}

export const UNUSABLE_STATES = new Set(['unavailable', 'unknown', 'none', '']);

export function isUsable(state: string | null | undefined): state is string {
  return state != null && !UNUSABLE_STATES.has(state);
}
