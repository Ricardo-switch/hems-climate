/**
 * Oude dagen comprimeren (besluit 58).
 *
 * Het beslislogboek en de ruwe historie schrijven samen ongeveer 5 MB per dag,
 * rond 1,8 GB per jaar. NDJSON comprimeert ruwweg dertig keer; de export liet
 * 77 MB als 2,3 MB zien. Dagen ouder dan een week worden daarom `.ndjson.gz`.
 * De recente week blijft gewoon, zodat je die zonder gereedschap kunt openen.
 *
 * **Niets mag ervan merken.** Elke lezer gaat via `findLogFiles`,
 * `findHistoryFiles` en `regelsVan` in `divergence/read.ts`, die beide vormen
 * kennen. Een test legt vast dat een analyse vóór en na het comprimeren
 * precies hetzelfde ziet.
 *
 * **Onderbreken mag.** Eerst naar een tijdelijk bestand, dan een rename — die
 * is atomair — en pas daarna de gewone weg. Valt de stroom halverwege, dan is
 * er óf alleen de gewone, óf allebei; bij allebei telt de `.gz` (zie
 * `dagbestanden`), en de volgende ronde ruimt de gewone op. Een dag raakt dus
 * nooit weg en telt nooit dubbel.
 *
 * **Weggooien doet het niet.** De dataset is het product van dit project; wat
 * weg is, komt niet terug.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { access, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const DAGBESTAND = /^(?:decisions|history)-(\d{4}-\d{2}-\d{2})\.ndjson$/;
const DAG_MS = 86_400_000;

async function bestaat(pad: string): Promise<boolean> {
  try {
    await access(pad);
    return true;
  } catch {
    return false;
  }
}

/**
 * Comprimeert elk dagbestand van vóór `bewaarDagen` dagen terug. Geeft terug
 * welke bestanden er gecomprimeerd of opgeruimd zijn.
 *
 * De grens is de UTC-dag, net als de bestandsnamen. Vandaag wordt nooit
 * aangeraakt, en de afgelopen week ook niet.
 */
export async function comprimeerOudeDagen(
  map: string,
  nuMs: number,
  bewaarDagen = 7,
): Promise<string[]> {
  const grens = new Date(nuMs - bewaarDagen * DAG_MS).toISOString().slice(0, 10);
  const gedaan: string[] = [];

  for (const naam of (await readdir(map)).sort()) {
    const m = DAGBESTAND.exec(naam);
    if (!m || m[1]! >= grens) continue;

    const gewoon = join(map, naam);
    const gz = `${gewoon}.gz`;

    // Een eerdere ronde kwam tot de rename maar niet tot het weghalen.
    if (await bestaat(gz)) {
      await unlink(gewoon);
      gedaan.push(naam);
      continue;
    }

    const tijdelijk = `${gz}.tmp`;
    await pipeline(createReadStream(gewoon), createGzip(), createWriteStream(tijdelijk));
    await rename(tijdelijk, gz);
    await unlink(gewoon);
    gedaan.push(naam);
  }
  return gedaan;
}
