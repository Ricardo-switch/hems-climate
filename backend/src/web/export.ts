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

import { open, stat, type FileHandle } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip, gunzip } from 'node:zlib';

import { findHistoryFiles, findLogFiles } from '../divergence/read.js';
import { RUNS_FILE } from '../adapters/runs.js';
import { FEEDBACK_FILE } from './feedback.js';
import { LAYOUT_FILE } from './layout.js';
import { CONNECTION_FILE } from './aansluiting.js';
import { WEATHER_FILE } from './weather.js';
import { UREN_FILE } from './open-meteo.js';
import { SOLAR_FILE } from './solar-learn.js';
import type { HaArea, HaDevice, HaFloor, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { HaEntityState } from '../adapters/homeassistant/client.js';

const gunzipAsync = promisify(gunzip);

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
  // De losse bestanden naast de dataset, als ze er zijn.
  const los = [
    RUNS_FILE,
    // Gevoel en toelichting horen bij de dataset (besluit 84).
    FEEDBACK_FILE,
    // De indeling ook (besluit 96): zonder weet de dataset niet welke lamp waar staat.
    LAYOUT_FILE,
    // De antwoorden over de aansluiting ook (besluit 103): ze vullen aan wat de regeling las.
    CONNECTION_FILE,
    // De zonkans zoals hij de dag ervoor werd verwacht (besluit 105): achteraf niet terug te halen.
    WEATHER_FILE,
    // Het weer per uur zoals het verwacht werd, en de zon per kwartier (besluit 142):
    // om de zonverwachting per uur na te rekenen. Zonder ligging: die staat er niet in.
    UREN_FILE,
    SOLAR_FILE,
  ].map((naam) => join(logDir, naam));
  const er = await Promise.all(los.map((pad) => stat(pad).then(() => true, () => false)));
  return { decisionLog, everything: [...decisionLog, ...history, ...los.filter((_, i) => er[i])] };
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
 * Wat er voor de analyse bij komt (besluit 151): de instellingen en de
 * apparaten met hun functie, als losse bestanden in `analyse/`, en welke
 * namen er overal uit moeten.
 */
export interface AnalyseExtra {
  /** Naam in `analyse/` en de inhoud. */
  readonly bestanden: Readonly<Record<string, string>>;
  /** Namen van bewoners en wat ervoor in de plaats komt, in elk bestand. */
  readonly vervang: readonly (readonly [string, string])[];
}

/**
 * Schrijft alle dagbestanden als een gzipte tar naar het antwoord.
 *
 * De bestanden komen in een map te staan die de datum van de export draagt:
 * uitgepakt krijg je `hems-logboek-JJJJ-MM-DD/decisions-*.ndjson`, en dat is
 * precies wat je aan `--divergence` of `--benchmark` kunt voeren.
 *
 * **Voor de analyse, zonder namen (besluit 151).** Met `analyse` gaat elk
 * bestand door de vervanger: namen van bewoners worden "Bewoner 1", en een
 * ligging gaat eruit. Dat kan niet als stroom, want de kop van tar noemt de
 * omvang vooraf. Daarom per bestand in het geheugen, uitgepakt: hooguit een
 * dag, een paar megabyte. Een ingepakte dag komt er uitgepakt in; de tar zelf
 * wordt toch gecomprimeerd.
 */
export async function writeExport(
  logDir: string,
  res: ServerResponse,
  now: Date = new Date(),
  analyse?: AnalyseExtra,
): Promise<void> {
  const { everything: paths } = await exportFiles(logDir);
  const stamp = now.toISOString().slice(0, 10);
  const map = `hems-logboek-${stamp}`;
  const vervang = analyse ? vervanger(analyse.vervang) : null;

  res.writeHead(200, {
    'content-type': 'application/gzip',
    'content-disposition': `attachment; filename="${map}.tar.gz"`,
    // Geen content-length: we weten pas na het comprimeren hoe groot het is,
    // en dat uitrekenen zou betekenen dat we alles twee keer lezen.
    'cache-control': 'no-store',
  });

  const gzip = createGzip();

  /*
   * De tar-stroom.
   *
   * Bestand voor bestand: kop, inhoud, vulling. Aan het eind twee lege blokken
   * — dat is hoe tar het einde markeert. De inhoud gaat er als stroom doorheen
   * en niet als buffer, zodat een dagbestand van 3 MB ook 3 MB blijft.
   */
  async function* chunks(): AsyncGenerator<Buffer> {
    for (const path of paths) {
      const opened = await openSettled(path);
      if (opened == null) continue;
      const { handle, name } = opened;
      try {
        if (vervang) yield* anoniemEntry(`${map}/${name.replace(/\.gz$/, '')}`, handle, name.endsWith('.gz'), vervang);
        else yield* entry(`${map}/${name}`, handle);
      } finally {
        await handle.close();
      }
    }
    for (const [naam, inhoud] of Object.entries(analyse?.bestanden ?? {})) {
      const buf = Buffer.from(vervang ? vervang(inhoud) : inhoud, 'utf-8');
      yield heading(`${map}/analyse/${naam}`, buf.length, now.getTime());
      yield buf;
      yield padding(buf.length);
    }
    yield Buffer.alloc(BLOCK * 2);
  }

  // Samen afwachten: gaat de eerste helft mis, dan mag de tweede niet als
  // onafgehandelde fout blijven hangen — die legt in Node de hele dienst stil.
  await Promise.all([pipeline(Readable.from(chunks()), gzip), pipeline(gzip, res)]);
}

/**
 * Opent een dagbestand, of de `.gz` die er intussen van gemaakt is.
 *
 * De lijst wordt aan het begin gemaakt; een download van een paar seconden kan
 * over de nachtelijke compressie heen lopen (besluit 58). Die zet de `.gz`
 * ernaast en haalt het origineel pas daarna weg, dus wie het origineel mist,
 * vindt de `.gz`. Is ook die er niet, dan is er niets te halen en slaan we over.
 */
async function openSettled(path: string): Promise<{ handle: FileHandle; name: string } | null> {
  for (const candidate of path.endsWith('.gz') ? [path] : [path, `${path}.gz`]) {
    try {
      return { handle: await open(candidate, 'r'), name: basename(candidate) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return null;
}

/**
 * Eén bestand in het archief: kop, precies zoveel bytes als de kop belooft, vulling.
 *
 * Het bestand van vandaag groeit terwijl we lezen. De kop noemt de omvang van
 * het moment van openen, en daarom lezen we tot daar en niet tot het einde dat
 * er tegen die tijd is — anders loopt elk volgend bestand in het archief scheef
 * (1 oktober: `runs.ndjson` kwam onleesbaar mee). Wat erbij kwam, komt de
 * volgende export mee. Een open bestand blijft leesbaar als het ondertussen
 * wordt weggehaald, dus ook de compressie kan er niet meer tussen komen.
 */
async function* entry(name: string, handle: FileHandle): AsyncGenerator<Buffer> {
  const info = await handle.stat();
  yield heading(name, info.size, info.mtimeMs);
  let sent = 0;
  if (info.size > 0) {
    for await (const piece of handle.createReadStream({ start: 0, end: info.size - 1, autoClose: false })) {
      sent += (piece as Buffer).length;
      yield piece as Buffer;
    }
  }
  // Korter dan beloofd kan een logboek niet worden, maar mocht het: aanvullen
  // houdt de rest van het archief leesbaar.
  if (sent < info.size) yield Buffer.alloc(info.size - sent);
  yield padding(info.size);
}

/** Eén bestand, uitgepakt en zonder namen; de omvang pas na het vervangen. */
async function* anoniemEntry(name: string, handle: FileHandle, ingepakt: boolean, vervang: (tekst: string) => string): AsyncGenerator<Buffer> {
  const info = await handle.stat();
  const ruw = await handle.readFile();
  const tekst = (ingepakt ? await gunzipAsync(ruw) : ruw).toString('utf-8');
  const buf = Buffer.from(vervang(tekst), 'utf-8');
  yield heading(name, buf.length, info.mtimeMs);
  yield buf;
  yield padding(buf.length);
}

/**
 * De vervanger voor een export zonder namen (besluit 151).
 *
 * Een naam alleen als heel woord, zodat "Jan" niet uit "Januari" verdwijnt; de
 * langste eerst, zodat "Shira Cornelissen" niet half wordt vervangen. Namen
 * korter dan drie tekens blijven staan: dan raakt het te veel andere woorden.
 * Een ligging (`latitude`, `longitude`) wordt overal null.
 */
export function vervanger(paren: readonly (readonly [string, string])[]): (tekst: string) => string {
  const bruikbaar = paren.filter(([van]) => van.trim().length >= 3).sort((a, b) => b[0].length - a[0].length);
  const naar = new Map(bruikbaar.map(([van, voor]) => [van, voor]));
  const veilig = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patroon = bruikbaar.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${bruikbaar.map(([van]) => veilig(van)).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  return (tekst) => {
    const zonderLigging = tekst.replace(/"(latitude|longitude)"\s*:\s*-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g, '"$1":null');
    return patroon ? zonderLigging.replace(patroon, (m) => naar.get(m) ?? m) : zonderLigging;
  };
}

/** Een entiteit uit Home Assistant, zoals de analyse hem nodig heeft. */
export interface EntiteitRij {
  readonly id: string;
  readonly naam: string | null;
  readonly domein: string;
  /** De integratie, zoals "hue" of "buienradar". */
  readonly integratie: string | null;
  readonly apparaat: { readonly naam: string | null; readonly merk: string | null; readonly model: string | null } | null;
  readonly ruimte: string | null;
  readonly etage: string | null;
  readonly soort: string | null;
  readonly eenheid: string | null;
  readonly stand: string | null;
  readonly uit: boolean;
  readonly verborgen: boolean;
  readonly categorie: string | null;
  /**
   * Waar Smart Climate hem gebruikt: het pad in de configuratie of een
   * instelling, zoals `configuratie.zones[0].sensors[1]` of
   * `functies.json.deurbel.camera`. Leeg: Smart Climate doet er niets mee.
   */
  readonly gebruikt: readonly string[];
}

const ENTITEIT = /^[a-z_]+\.[a-z0-9_]+$/;

/** Elk pad in de bronnen waar een entiteit staat, als waarde of als sleutel. */
function verwijzingen(bronnen: Readonly<Record<string, unknown>>): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  const noteer = (id: string, pad: string) => {
    const l = uit.get(id) ?? [];
    if (!l.includes(pad)) l.push(pad);
    uit.set(id, l);
  };
  const loop = (v: unknown, pad: string, diepte: number): void => {
    if (diepte > 40) return;
    if (typeof v === 'string') {
      if (ENTITEIT.test(v)) noteer(v, pad);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => loop(x, `${pad}[${i}]`, diepte + 1));
    } else if (v != null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (ENTITEIT.test(k)) noteer(k, `${pad}.${k}`);
        loop(x, `${pad}.${k}`, diepte + 1);
      }
    }
  };
  for (const [naam, bron] of Object.entries(bronnen)) loop(bron, naam, 0);
  return uit;
}

/**
 * Alle entiteiten uit Home Assistant met hun apparaat, ruimte en etage, en
 * waar Smart Climate ze gebruikt (besluit 151). Van de stand alleen de waarde,
 * de eenheid en de soort: de andere attributen kunnen een ligging of een naam
 * bevatten en zeggen weinig over hoe het huis werkt.
 */
export function entiteitenLijst(
  r: { readonly floors: readonly HaFloor[]; readonly areas: readonly HaArea[]; readonly devices: readonly HaDevice[]; readonly entities: readonly HaRegistryEntity[] } | null,
  states: ReadonlyMap<string, HaEntityState>,
  bronnen: Readonly<Record<string, unknown>>,
): EntiteitRij[] {
  const gebruikt = verwijzingen(bronnen);
  const apparaten = new Map((r?.devices ?? []).map((d) => [d.id, d]));
  const ruimtes = new Map((r?.areas ?? []).map((a) => [a.area_id, a]));
  const etages = new Map((r?.floors ?? []).map((f) => [f.floor_id, f]));
  const registry = new Map((r?.entities ?? []).map((e) => [e.entity_id, e]));
  const tekst = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return [...new Set([...registry.keys(), ...states.keys()])].sort().map((id): EntiteitRij => {
    const e = registry.get(id);
    const s = states.get(id);
    const d = e?.device_id ? apparaten.get(e.device_id) : undefined;
    const ruimte = ruimtes.get(e?.area_id ?? d?.area_id ?? '');
    const etage = ruimte?.floor_id ? etages.get(ruimte.floor_id) : undefined;
    return {
      id,
      naam: tekst(s?.attributes['friendly_name']) ?? e?.name ?? e?.original_name ?? null,
      domein: id.split('.')[0]!,
      integratie: e?.platform ?? null,
      apparaat: d ? { naam: d.name_by_user ?? d.name ?? null, merk: d.manufacturer ?? null, model: d.model ?? null } : null,
      ruimte: ruimte?.name ?? null,
      etage: etage?.name ?? null,
      soort: tekst(s?.attributes['device_class']) ?? e?.device_class ?? e?.original_device_class ?? null,
      eenheid: tekst(s?.attributes['unit_of_measurement']),
      stand: s?.state ?? null,
      uit: e?.disabled_by != null,
      verborgen: e?.hidden_by != null,
      categorie: e?.entity_category ?? null,
      gebruikt: gebruikt.get(id) ?? [],
    };
  });
}
