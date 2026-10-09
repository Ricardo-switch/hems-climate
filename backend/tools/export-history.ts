/**
 * Exporteert de relevante geschiedenis uit een Home Assistant recorder-database
 * naar gzip-NDJSON.
 *
 * Bedoeld om nachtelijk te draaien. De recorder zelf mag dan kort blijven
 * bewaren — 60 dagen is genoeg om een uitval te overbruggen — terwijl dit
 * archief op volledige resolutie doorloopt. Voor de ~50 entiteiten die ertoe
 * doen is dat onder de gigabyte per jaar, tegenover tientallen gigabytes als je
 * de hele recorder zou bewaren.
 *
 *   npx tsx tools/export-history.ts <pad/naar/home-assistant_v2.db> [uitvoer.ndjson.gz]
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

import {
  KEPT_ATTRIBUTES,
  type DatasetMeta,
  type DatasetRow,
  type KeptAttribute,
} from '../src/replay/dataset.js';

/**
 * De entiteiten die de harness nodig heeft, van het huis waar Smart Climate
 * ontstond (besluit 109). Onderzoeksgereedschap: dit staat bewust in tools/ en
 * niet in src/, zodat het niet in de dienst en niet in de add-on komt.
 *
 * Bewust een expliciete lijst en geen patroon: wat hier niet in staat wordt niet
 * geëxporteerd, en de omvang van het archief blijft daardoor voorspelbaar.
 */
const REPLAY_ENTITIES: readonly string[] = [
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

interface RawRow {
  readonly entity_id: string;
  readonly state: string | null;
  readonly last_updated_ts: number | null;
  readonly shared_attrs: string | null;
}

function pickAttributes(
  json: string | null,
): DatasetRow['a'] | undefined {
  if (!json) return undefined;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const out: Partial<Record<KeptAttribute, string | number | null>> = {};
  let found = false;
  for (const key of KEPT_ATTRIBUTES) {
    if (!(key in parsed)) continue;
    const v = parsed[key];
    if (typeof v === 'string' || typeof v === 'number' || v === null) {
      out[key] = v;
      found = true;
    }
  }
  return found ? out : undefined;
}

async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error(
      'Gebruik: tsx tools/export-history.ts <home-assistant_v2.db> [uitvoer.ndjson.gz]',
    );
    process.exitCode = 1;
    return;
  }
  const outPath = resolve(
    process.argv[3] ?? 'data/replay/history.ndjson.gz',
  );

  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });

  const placeholders = REPLAY_ENTITIES.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT m.entity_id      AS entity_id,
           s.state          AS state,
           s.last_updated_ts AS last_updated_ts,
           a.shared_attrs   AS shared_attrs
      FROM states s
      JOIN states_meta m ON m.metadata_id = s.metadata_id
      LEFT JOIN state_attributes a ON a.attributes_id = s.attributes_id
     WHERE m.entity_id IN (${placeholders})
       AND s.last_updated_ts IS NOT NULL
     ORDER BY s.last_updated_ts ASC
  `);

  const raw = stmt.all(...REPLAY_ENTITIES) as unknown as RawRow[];
  db.close();

  if (raw.length === 0) {
    console.error('Geen rijen gevonden. Klopt het pad naar de database?');
    process.exitCode = 1;
    return;
  }

  const rows: DatasetRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (r.last_updated_ts == null) continue;
    const attrs = pickAttributes(r.shared_attrs);
    seen.add(r.entity_id);
    rows.push({
      t: Math.round(r.last_updated_ts * 1000),
      e: r.entity_id,
      s: r.state ?? 'unknown',
      ...(attrs ? { a: attrs } : {}),
    });
  }

  const meta: DatasetMeta = {
    kind: 'meta',
    version: 1,
    source: resolve(dbPath),
    exportedAtMs: Date.now(),
    fromMs: rows[0]!.t,
    toMs: rows[rows.length - 1]!.t,
    entities: [...seen].sort(),
    rows: rows.length,
  };

  await mkdir(dirname(outPath), { recursive: true });
  async function* lines(): AsyncGenerator<string> {
    yield `${JSON.stringify(meta)}\n`;
    for (const row of rows) yield `${JSON.stringify(row)}\n`;
  }
  await pipeline(Readable.from(lines()), createGzip(), createWriteStream(outPath));

  const missing = REPLAY_ENTITIES.filter((e) => !seen.has(e));
  const span = (meta.toMs - meta.fromMs) / 86_400_000;

  console.log(`Geschreven: ${outPath}`);
  console.log(`  rijen        ${meta.rows.toLocaleString('nl-NL')}`);
  console.log(`  entiteiten   ${meta.entities.length} van ${REPLAY_ENTITIES.length}`);
  console.log(
    `  venster      ${new Date(meta.fromMs).toISOString().slice(0, 16)} tot ` +
      `${new Date(meta.toMs).toISOString().slice(0, 16)}  (${span.toFixed(1)} dagen)`,
  );
  if (missing.length > 0) {
    console.log(`  ontbrekend   ${missing.join(', ')}`);
  }
}

await main();
