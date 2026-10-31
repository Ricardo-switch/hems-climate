/**
 * Wat de webserver over HTTP zelf weet (uit server.ts, besluit 180): de soort
 * van een bestand, of een verzoek van de eigen pagina komt, een JSON-verzoek
 * lezen met een dak erop, inpakken (besluit 173), een antwoord in JSON, en een
 * bestand uit de weergave met zijn versiestempel en zonder iets erbuiten.
 */

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';

export const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Om de app te installeren.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Komt het verzoek van deze dienst zelf? Zonder Origin (curl, een script op de
 * NAS) is het geen browser van een ander, en mag het. Met een Origin moet de
 * host gelijk zijn aan die van dit verzoek, of aan die waarvoor een proxy het
 * doorgaf (Ingress van Home Assistant zet `x-forwarded-host`).
 */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin == null || origin === '') return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const own = [req.headers.host, req.headers['x-forwarded-host']]
    .flat()
    .filter((h): h is string => typeof h === 'string')
    .flatMap((h) => h.split(','))
    .map((h) => h.trim().toLowerCase());
  return own.includes(host);
}

/** Zoveel mag een verzoek zijn. Antwoorden op keuzes zijn kilobytes, geen megabytes. */
export const MAX_BODY = 64 * 1024;

/**
 * Leest een JSON-verzoek, met een dak erop.
 *
 * Zonder grens houdt een verzoek dat blijft doorsturen deze dienst bezig tot
 * het geheugen op is. Dat is hier extra onprettig: het is dezelfde dienst die
 * de opname doet, en die hoort niet om te vallen door een pagina.
 */
export async function readJson(req: IncomingMessage, max: number = MAX_BODY): Promise<unknown> {
  const pieces: Buffer[] = [];
  let bytes = 0;
  for await (const piece of req) {
    bytes += (piece as Buffer).length;
    if (bytes > max) throw new Error('verzoek te groot');
    pieces.push(piece as Buffer);
  }
  const text = Buffer.concat(pieces).toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('geen geldige JSON');
  }
}

/*
 * Inpakken (21 oktober 2026): scripts, opmaak en antwoorden gaan ingepakt over
 * de lijn, als de browser dat kan. Een antwoord van het huis is ruim 100 kB en
 * komt om de paar tellen; ingepakt is dat een tiende. Niet achter Ingress: daar
 * pakt de Supervisor het eerst weer uit, en pakt Home Assistant zelf in.
 */
export type Inpakking = 'br' | 'gzip';
export const INPAKKEN = new WeakMap<ServerResponse, Inpakking>();
/** Kleiner dan dit loont inpakken niet. */
export const INPAKKEN_VANAF = 1024;

export function inpakkingVoor(req: IncomingMessage): Inpakking | null {
  const accept = String(req.headers['accept-encoding'] ?? '');
  return /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
}

export function inpak(data: Buffer | string, soort: Inpakking, snel: boolean): Buffer {
  return soort === 'br'
    ? brotliCompressSync(data, { params: { [zlib.BROTLI_PARAM_QUALITY]: snel ? 5 : 11 } })
    : gzipSync(data, { level: snel ? 6 : 9 });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  const soort = INPAKKEN.get(res);
  const data = soort && Buffer.byteLength(text) >= INPAKKEN_VANAF ? inpak(text, soort, true) : null;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data ? data.length : Buffer.byteLength(text),
    // De stand van nú. Een tussenliggende cache die dit vasthoudt laat een
    // dashboard zien dat er goed uitziet en niet klopt.
    'cache-control': 'no-store',
    ...(soort ? { vary: 'accept-encoding' } : {}),
    ...(data && soort ? { 'content-encoding': soort } : {}),
  });
  res.end(data ?? text);
}

/** Wat ingepakt mag: tekst. Een plaatje of lettertype is dat al. */
export const TEKST = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg']);
/** Wat met een versiestempel (`?v=…`, frontend/build.js) altijd hetzelfde blijft. */
export const BLIJVEND = new Set(['.css', '.js']);
/** Ingepakte bestanden, per pad en soort; opnieuw als het bestand verandert. */
export const ingepakt = new Map<string, { mtimeMs: number; data: Buffer }>();

export interface FileOpties {
  /** Er staat een versiestempel in het adres: de browser mag hem bewaren. */
  readonly gestempeld?: boolean;
  readonly inpakken?: Inpakking | null;
}

/**
 * Serveert een bestand uit `webDir`, en niets erbuiten.
 *
 * Het pad wordt genormaliseerd en daarna gecontroleerd tegen de wortel. Zonder
 * die controle haalt `GET /../../.env` het token op — die map ligt precies één
 * niveau boven de gebouwde frontend.
 */
export async function sendFile(
  res: ServerResponse,
  webDir: string,
  pathname: string,
  headOnly: boolean,
  since: string | undefined,
  opties: FileOpties = {},
): Promise<boolean> {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const full = resolve(webDir, relative);
  const root = resolve(webDir);
  if (full !== root && !full.startsWith(root + sep)) return false;

  let info;
  try {
    info = await stat(full);
  } catch {
    return false;
  }
  if (info.isDirectory()) return false;

  /*
   * `no-cache` en niet `max-age`.
   *
   * De bestandsnamen dragen geen hash: het blijven `app.js` en `app.css`. Met
   * een `max-age` van een uur krijgt een bezoeker na een uitrol dus de nieuwe
   * HTML met de oude JS, en dat mislukt op precies de manier die het lastigst
   * te vinden is — een pagina die half werkt zonder één foutmelding. Dat is
   * hier één keer gebeurd tijdens het bouwen van de tabs.
   *
   * `no-cache` betekent niet "niet bewaren" maar "altijd navragen". Samen met
   * `last-modified` kost een ongewijzigd bestand een leeg 304-antwoord in
   * plaats van tien kilobyte, en klopt de pagina altijd.
   *
   * Met een versiestempel in het adres (21 oktober 2026) is dat navragen niet
   * nodig: verandert het bestand, dan verandert het adres. Dan mag de browser
   * het bewaren zonder te vragen. Dat scheelt per pagina tien tot twaalf
   * rondjes, en achter Ingress gaat elk rondje door Home Assistant.
   */
  const ext = extname(full).toLowerCase();
  const cache = opties.gestempeld && BLIJVEND.has(ext) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const changed = info.mtime.toUTCString();
  const soort = opties.inpakken && TEKST.has(ext) && info.size >= INPAKKEN_VANAF ? opties.inpakken : null;
  const vary = opties.inpakken !== undefined && TEKST.has(ext) ? { vary: 'accept-encoding' } : {};
  if (since != null && since === changed) {
    res.writeHead(304, { 'cache-control': cache, 'last-modified': changed, ...vary });
    res.end();
    return true;
  }

  let data: Buffer | null = null;
  if (soort) {
    const sleutel = `${full}|${soort}`;
    const bewaard = ingepakt.get(sleutel);
    if (bewaard && bewaard.mtimeMs === info.mtimeMs) data = bewaard.data;
    else {
      data = inpak(await readFile(full), soort, false);
      ingepakt.set(sleutel, { mtimeMs: info.mtimeMs, data });
    }
  }
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': data ? data.length : info.size,
    'cache-control': cache,
    'last-modified': changed,
    ...vary,
    ...(data && soort ? { 'content-encoding': soort } : {}),
  });
  if (headOnly) {
    res.end();
    return true;
  }
  if (data) res.end(data);
  else createReadStream(full).pipe(res);
  return true;
}

/** Een pagina die na het inloggen zelf verder gaat, vanaf deze site (zie de terugkeer van het inloggen). */
export function verderNa(naar: string): string {
  const html = naar.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const js = JSON.stringify(naar).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${html}"><title>Ingelogd · SunArc</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1424;color:#eef3f7;font-family:system-ui,sans-serif}</style></head><body><p>Ingelogd. <a href="${html}" style="color:#6fd3ff">Verder</a></p><script>location.replace(${js});</script></body></html>`;
}
