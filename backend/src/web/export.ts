/**
 * Het beslislogboek als één download.
 *
 * Tot nu toe kwam de dataset van de NAS via de Samba-share, met een
 * PowerShell-script dat het pad hardgecodeerd had. Dat werkt zolang je op je
 * eigen netwerk zit met de juiste schijf gekoppeld, en niet daarbuiten. Een
 * knop in de weergave doet hetzelfde zonder die voorwaarden.
 *
 * **Waarom tar en niet één samengevoegd bestand.** NDJSON plakt prima aan
 * elkaar, maar dan verdwijnt de dagindeling — en `findLogFiles` zoekt juist naar
 * `decisions-JJJJ-MM-DD.ndjson`. Een export die je niet terug kunt zetten in de
 * divergentietool is een archief en geen dataset.
 *
 * **Waarom met de hand geschreven en niet met een pakket.** Een tar-header is
 * 512 bytes met velden op vaste posities; dat is minder code dan de
 * afhankelijkheid waard is voor een dienst die maanden onbewaakt in een
 * container draait. `zlib` zit al in Node.
 *
 * **Waarom streamen.** De opname is nu 50 MB en wordt een winter lang groter.
 * Alles eerst in het geheugen zetten zou de dienst die de opname máákt kunnen
 * omleggen — en dat is precies de verkeerde volgorde.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

import { findLogFiles } from '../divergence/read.js';

const BLOK = 512;

/** Octaal met voorloopnullen, zoals tar het wil, met een afsluitende NUL. */
function octaal(n: number, breedte: number): string {
  return n.toString(8).padStart(breedte - 1, '0') + '\0';
}

/**
 * De 512-byte kop voor één bestand.
 *
 * Het ustar-formaat. De checksum wordt berekend over de kop met het
 * checksumveld gevuld met spaties — een eigenaardigheid van het formaat die je
 * één keer opzoekt en daarna nooit meer.
 */
function kop(naam: string, grootte: number, gewijzigdMs: number): Buffer {
  const b = Buffer.alloc(BLOK);
  b.write(naam.slice(0, 99), 0, 'utf-8'); // naam
  b.write(octaal(0o644, 8), 100); // rechten
  b.write(octaal(0, 8), 108); // uid
  b.write(octaal(0, 8), 116); // gid
  b.write(octaal(grootte, 12), 124);
  b.write(octaal(Math.floor(gewijzigdMs / 1000), 12), 136);
  b.write('        ', 148); // checksumveld, tijdelijk spaties
  b.write('0', 156); // typeflag: gewoon bestand
  b.write('ustar\0', 257);
  b.write('00', 263);

  let som = 0;
  for (const byte of b) som += byte;
  b.write(octaal(som, 7), 148);
  b.write(' ', 155);
  return b;
}

/** Vult aan tot een veelvoud van 512; tar werkt in blokken. */
function vulling(grootte: number): Buffer {
  const rest = grootte % BLOK;
  return rest === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOK - rest);
}

export interface ExportInfo {
  readonly bestanden: number;
  readonly bytes: number;
  readonly eerste: string | null;
  readonly laatste: string | null;
}

export async function exportInfo(logDir: string): Promise<ExportInfo> {
  let paden: string[];
  try {
    paden = await findLogFiles(logDir);
  } catch {
    return { bestanden: 0, bytes: 0, eerste: null, laatste: null };
  }
  let bytes = 0;
  for (const p of paden) bytes += (await stat(p)).size;
  return {
    bestanden: paden.length,
    bytes,
    eerste: paden.length > 0 ? basename(paden[0]!) : null,
    laatste: paden.length > 0 ? basename(paden[paden.length - 1]!) : null,
  };
}

/**
 * Schrijft alle dagbestanden als een gzipte tar naar het antwoord.
 *
 * De bestanden komen in een map te staan die de datum van de export draagt:
 * uitgepakt krijg je `hems-logboek-JJJJ-MM-DD/decisions-*.ndjson`, en dat is
 * precies wat je aan `--divergence` of `--benchmark` kunt voeren.
 */
export async function schrijfExport(
  logDir: string,
  res: ServerResponse,
  nu: Date = new Date(),
): Promise<void> {
  const paden = await findLogFiles(logDir);
  const stempel = nu.toISOString().slice(0, 10);
  const map = `hems-logboek-${stempel}`;

  res.writeHead(200, {
    'content-type': 'application/gzip',
    'content-disposition': `attachment; filename="${map}.tar.gz"`,
    // Geen content-length: we weten pas na het comprimeren hoe groot het is,
    // en dat uitrekenen zou betekenen dat we alles twee keer lezen.
    'cache-control': 'no-store',
  });

  const gzip = createGzip();
  const naarAntwoord = pipeline(gzip, res);

  /*
   * De tar-stroom.
   *
   * Bestand voor bestand: kop, inhoud, vulling. Aan het eind twee lege blokken
   * — dat is hoe tar het einde markeert. De inhoud gaat er als stroom doorheen
   * en niet als buffer, zodat een dagbestand van 3 MB ook 3 MB blijft.
   */
  async function* stroom(): AsyncGenerator<Buffer> {
    for (const pad of paden) {
      const info = await stat(pad);
      yield kop(`${map}/${basename(pad)}`, info.size, info.mtimeMs);
      for await (const stuk of createReadStream(pad)) yield stuk as Buffer;
      yield vulling(info.size);
    }
    yield Buffer.alloc(BLOK * 2);
  }

  await pipeline(Readable.from(stroom()), gzip);
  await naarAntwoord;
}
