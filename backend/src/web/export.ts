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
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

import { findHistoryFiles, findLogFiles } from '../divergence/read.js';
import { RUNS_FILE } from '../adapters/runs.js';

const BLOCK = 512;

/** Octaal met voorloopnullen, zoals tar het wil, met een afsluitende NUL. */
function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, '0') + '\0';
}

/**
 * De 512-byte kop voor één bestand.
 *
 * Het ustar-formaat. De checksum wordt berekend over de kop met het
 * checksumveld gevuld met spaties — een eigenaardigheid van het formaat die je
 * één keer opzoekt en daarna nooit meer.
 */
function heading(name: string, size: number, changedMs: number): Buffer {
  const b = Buffer.alloc(BLOCK);
  b.write(name.slice(0, 99), 0, 'utf-8'); // naam
  b.write(octal(0o644, 8), 100); // rechten
  b.write(octal(0, 8), 108); // uid
  b.write(octal(0, 8), 116); // gid
  b.write(octal(size, 12), 124);
  b.write(octal(Math.floor(changedMs / 1000), 12), 136);
  b.write('        ', 148); // checksumveld, tijdelijk spaties
  b.write('0', 156); // typeflag: gewoon bestand
  b.write('ustar\0', 257);
  b.write('00', 263);

  let sum = 0;
  for (const byte of b) sum += byte;
  b.write(octal(sum, 7), 148);
  b.write(' ', 155);
  return b;
}

/** Vult aan tot een veelvoud van 512; tar werkt in blokken. */
function padding(size: number): Buffer {
  const rest = size % BLOCK;
  return rest === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rest);
}

export interface ExportInfo {
  readonly bestanden: number;
  readonly bytes: number;
  readonly eerste: string | null;
  readonly laatste: string | null;
}

/**
 * Wat er in de export gaat: het beslislogboek en de ruwe historie (besluit 52).
 * Allebei per dag, allebei nodig — het eerste zegt wat de arbiter besloot, het
 * tweede is waarmee je dat besluit opnieuw kunt nemen met een andere instelling.
 * En welke versie wanneer besliste (besluit 66): zonder dat is een dataset die
 * meerdere versies overspant niet uit elkaar te halen.
 */
async function exportFiles(logDir: string): Promise<{ decisionLog: string[]; everything: string[] }> {
  const decisionLog = await findLogFiles(logDir);
  const history = await findHistoryFiles(logDir);
  const runs = join(logDir, RUNS_FILE);
  const hasRuns = await stat(runs).then(
    () => true,
    () => false,
  );
  return { decisionLog, everything: [...decisionLog, ...history, ...(hasRuns ? [runs] : [])] };
}

export async function exportInfo(logDir: string): Promise<ExportInfo> {
  let paths: string[];
  let everything: string[];
  try {
    ({ decisionLog: paths, everything } = await exportFiles(logDir));
  } catch {
    return { bestanden: 0, bytes: 0, eerste: null, laatste: null };
  }
  // `bestanden` is het aantal dagen — zo staat het op de knop — en telt dus
  // alleen het logboek. De omvang telt alles, want dat is wat je downloadt.
  let bytes = 0;
  for (const p of everything) bytes += (await stat(p)).size;
  return {
    bestanden: paths.length,
    bytes,
    eerste: paths.length > 0 ? basename(paths[0]!) : null,
    laatste: paths.length > 0 ? basename(paths[paths.length - 1]!) : null,
  };
}

/**
 * Schrijft alle dagbestanden als een gzipte tar naar het antwoord.
 *
 * De bestanden komen in een map te staan die de datum van de export draagt:
 * uitgepakt krijg je `hems-logboek-JJJJ-MM-DD/decisions-*.ndjson`, en dat is
 * precies wat je aan `--divergence` of `--benchmark` kunt voeren.
 */
export async function writeExport(
  logDir: string,
  res: ServerResponse,
  now: Date = new Date(),
): Promise<void> {
  const { everything: paths } = await exportFiles(logDir);
  const stamp = now.toISOString().slice(0, 10);
  const map = `hems-logboek-${stamp}`;

  res.writeHead(200, {
    'content-type': 'application/gzip',
    'content-disposition': `attachment; filename="${map}.tar.gz"`,
    // Geen content-length: we weten pas na het comprimeren hoe groot het is,
    // en dat uitrekenen zou betekenen dat we alles twee keer lezen.
    'cache-control': 'no-store',
  });

  const gzip = createGzip();
  const toResponse = pipeline(gzip, res);

  /*
   * De tar-stroom.
   *
   * Bestand voor bestand: kop, inhoud, vulling. Aan het eind twee lege blokken
   * — dat is hoe tar het einde markeert. De inhoud gaat er als stroom doorheen
   * en niet als buffer, zodat een dagbestand van 3 MB ook 3 MB blijft.
   */
  async function* chunks(): AsyncGenerator<Buffer> {
    for (const path of paths) {
      const info = await stat(path);
      yield heading(`${map}/${basename(path)}`, info.size, info.mtimeMs);
      for await (const piece of createReadStream(path)) yield piece as Buffer;
      yield padding(info.size);
    }
    yield Buffer.alloc(BLOCK * 2);
  }

  await pipeline(Readable.from(chunks()), gzip);
  await toResponse;
}
