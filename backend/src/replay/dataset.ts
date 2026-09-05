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

/**
 * De entiteiten die de harness nodig heeft. Dit is bewust een expliciete lijst
 * en geen patroon: wat hier niet in staat wordt niet geëxporteerd, en de
 * omvang van het archief blijft daardoor voorspelbaar.
 */
export const REPLAY_ENTITIES: readonly string[] = [
  // Actuatoren
  'climate.beneden',
  'climate.thermostaat_badkamer',
  'climate.air_conditioning_woonkamer',
  'climate.air_conditioning_zolder',
  // Temperatuur en vocht
  'sensor.beneden_temperatuur',
  'sensor.beneden_luchtvochtigheid',
  'sensor.badkamer_huidige_temperatuur',
  'sensor.hue_motion_sensor_zolder_temperatuur',
  'sensor.entree_temperatuur',
  'sensor.temperatuur',
  // Energie
  'sensor.p1_meter_power',
  'sensor.pv_overschot_w',
  'sensor.net_import_w',
  'sensor.airco_totaal_vermogen_w',
  'sensor.gratis_stroom_naar_airco_w',
  'sensor.air_conditioning_woonkamer_energy_current',
  'sensor.air_conditioning_zolder_energy_current',
  // De uitleg van het oude systeem: onze referentie-uitvoer
  'sensor.airco_assist_reden',
  // Modus en strategie
  'input_select.verwarming_modus',
  'input_select.verwarming_modus_actief',
  'input_select.koel_strategie',
  // Schakelaars en interne statussen
  'input_boolean.airco_toestaan',
  'input_boolean.voorverwarmen_aan',
  'input_boolean.zomer_modus_actief',
  'input_boolean.pv_verwarmen_actief',
  'input_boolean.status_airco_assist_actief',
  'input_boolean.airco_assist_start_pending',
  'input_boolean.status_nest_regeling_actief',
  'input_boolean.status_voorverwarmen_actief',
  // Setpoints
  'input_number.temp_nest_dag',
  'input_number.temp_nest_eco',
  'input_number.temp_nest_voorwarm',
  'input_number.badkamer_heat_off_temp_dag',
  'input_number.temp_airco_woonkamer',
  'input_number.temp_airco_zolder',
  'input_number.temp_airco_woonkamer_koelen',
  'input_number.temp_airco_zolder_koelen',
  'input_number.pv_klimaat_start_overschot_w',
  'input_number.pv_klimaat_stop_import_w',
  // Timers
  'timer.airco_assist_min_on',
  'timer.airco_assist_start_delay',
  'timer.pv_stabilisatie',
  'timer.verwarming_handmatig',
  // Aanwezigheid en omgeving
  'person.ricardo_cornelissen',
  'person.shira',
  'binary_sensor.saskia_thuis_gestabiliseerd',
  'binary_sensor.rob_thuis_gestabiliseerd',
  'binary_sensor.dini_thuis_gestabiliseerd',
  'light.sfeerverlichting',
  'light.woonkamer_plafonniere',
  'sun.sun',
];

export const UNUSABLE_STATES = new Set(['unavailable', 'unknown', 'none', '']);

export function isUsable(state: string | null | undefined): state is string {
  return state != null && !UNUSABLE_STATES.has(state);
}
