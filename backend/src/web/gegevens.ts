/**
 * Back-up, herstel en opnieuw beginnen (besluit 151).
 *
 * **De back-up is klein, met opzet.** Wat de bewoner in de app instelde (de
 * indeling, de functies, bewoners, comfort, energie, de aansluiting, de
 * meldingen), wat het huis leerde (de zon per kwartier, de kleuren van
 * scènes) en de configuratie, als één JSON-bestand van een paar kilobyte. Het
 * logboek zit er niet in: dat groeit met ongeveer 60 MB per jaar, en als
 * add-on gaat het al mee in de back-up van Home Assistant zelf. Een back-up
 * die je kunt mailen of op een stick zet, is er een die je ook echt maakt.
 *
 * **Terugzetten is dan opnieuw starten.** De dienst leest zijn bestanden bij
 * het starten en bouwt daar de configuratie uit op (aansluiting, meten,
 * comfort, bewoners). Alles in het geheugen bijwerken zou die volgorde op een
 * tweede plek moeten nadoen. Daarom: de bestanden neerzetten, stoppen met
 * `OPNIEUW_STARTEN`, en de omgeving start hem weer: Docker met
 * `unless-stopped`, de add-on met de lus in `run.sh`.
 *
 * **Een configuratie overschrijft het nooit.** Staat er al een, dan is dat
 * die van dit huis; de back-up zet hem alleen neer als er geen is, zoals na
 * opnieuw beginnen in de add-on.
 *
 * **Opnieuw beginnen maakt eerst een back-up,** in `back-ups/` naast het
 * logboek. Die map, de sessies, de sleutel voor de assistent en de
 * scèneplaatjes van de bewoner blijven staan; de rest van wat de dienst
 * maakte gaat weg. De configuratie alleen als de app hem ook maakte (de
 * onboarding staat aan); anders is het een bestand van de beheerder.
 */

import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { RUNS_FILE } from '../adapters/runs.js';
import { STATE_FILE_NAME } from '../adapters/state-file.js';
import { CONNECTION_FILE } from './aansluiting.js';
import { BEWONERS_FILE } from './bewoners.js';
import { COMFORT_FILE } from './comfort.js';
import { ENERGY_FILE } from './energy.js';
import { FEEDBACK_FILE } from './feedback.js';
import { FUNCTIES_FILE } from './functies.js';
import { LAYOUT_FILE } from './layout.js';
import { MELDINGEN_FILE } from './meldingen.js';
import { SENSOR_LOG_FILE } from './meten.js';
import { UREN_FILE } from './open-meteo.js';
import { CHECKPOINT_FILE } from './review-checkpoint.js';
import { SCENE_COLORS_FILE } from './scene-colors.js';
import { SOLAR_FILE } from './solar-learn.js';
import { UITSTEL_FILE } from './uitstel.js';
import { WEATHER_FILE } from './weather.js';

export const BACKUP_SOORT = 'smart-climate-back-up';
/** De map naast het logboek met de back-ups die de dienst zelf maakte. */
export const BACKUP_DIR = 'back-ups';
/** Zoveel back-ups bewaart de dienst zelf; de oudste gaat weg. */
export const BACKUPS_BEWAREN = 10;
/** De code waarmee de dienst stopt om opnieuw te starten; `run.sh` start hem dan weer. */
export const OPNIEUW_STARTEN = 75;
/** Zo groot mag een back-up zijn die terug moet. Een echte is een paar honderd kilobyte. */
export const MAX_BACKUP = 8 * 1024 * 1024;

/** Wat de bewoner in de app instelde. */
export const INSTELLINGEN: readonly string[] = [LAYOUT_FILE, CONNECTION_FILE, BEWONERS_FILE, COMFORT_FILE, ENERGY_FILE, FUNCTIES_FILE, MELDINGEN_FILE];
/** Wat het huis leerde en niet zomaar terugkomt. */
export const GELEERD: readonly string[] = [SOLAR_FILE, SCENE_COLORS_FILE];
const IN_BACKUP = new Set([...INSTELLINGEN, ...GELEERD]);

/** Wat opnieuw beginnen naast de back-up weghaalt: de stand van de dienst en de dataset. */
const OOK_WEG: readonly string[] = [UITSTEL_FILE, STATE_FILE_NAME, RUNS_FILE, FEEDBACK_FILE, WEATHER_FILE, UREN_FILE, SENSOR_LOG_FILE, CHECKPOINT_FILE];
const DAGBESTAND = /^(?:decisions|history)-\d{4}-\d{2}-\d{2}\.ndjson(?:\.gz)?$/;

export interface Backup {
  readonly soort: typeof BACKUP_SOORT;
  readonly versie: 1;
  /** De versie van Smart Climate die hem maakte. */
  readonly app: string;
  readonly gemaakt: string;
  /** De configuratie van het huis, met de bestandsnaam; null als er geen was. */
  readonly configuratie: { readonly naam: string; readonly inhoud: unknown } | null;
  /** Per bestand in de logmap de inhoud, als JSON. */
  readonly bestanden: Readonly<Record<string, unknown>>;
}

async function leesJson(pad: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(pad, 'utf-8')) as unknown;
  } catch {
    return undefined;
  }
}

/** De back-up van nu. Een bestand dat er niet is of niet te lezen is, ontbreekt gewoon. */
export async function maakBackup(logDir: string, configPad: string | null, app: string, now: Date = new Date()): Promise<Backup> {
  const bestanden: Record<string, unknown> = {};
  for (const naam of [...INSTELLINGEN, ...GELEERD]) {
    const inhoud = await leesJson(join(logDir, naam));
    if (inhoud !== undefined) bestanden[naam] = inhoud;
  }
  const config = configPad ? await leesJson(configPad) : undefined;
  return {
    soort: BACKUP_SOORT,
    versie: 1,
    app,
    gemaakt: now.toISOString(),
    configuratie: config !== undefined && configPad ? { naam: basename(configPad), inhoud: config } : null,
    bestanden,
  };
}

/** De bestandsnaam voor een download of in `back-ups/`. */
export function backupNaam(now: Date = new Date()): string {
  return `smart-climate-back-up-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
}

/**
 * Is dit een back-up die terug kan? Alleen bekende bestanden, en een
 * configuratie alleen als `controleer` hem goedkeurt. Een onbekend bestand
 * maakt hem niet ongeldig: een nieuwere versie kan er meer in zetten.
 */
export function leesBackup(body: unknown, controleer?: (config: unknown) => string | null): { ok: true; backup: Backup; overgeslagen: string[] } | { ok: false; reden: string } {
  if (typeof body !== 'object' || body == null) return { ok: false, reden: 'dit is geen back-up van Smart Climate' };
  const x = body as Record<string, unknown>;
  if (x['soort'] !== BACKUP_SOORT) return { ok: false, reden: 'dit is geen back-up van Smart Climate' };
  if (x['versie'] !== 1) return { ok: false, reden: 'deze back-up komt van een nieuwere versie; werk Smart Climate eerst bij' };
  const ruw = x['bestanden'];
  if (typeof ruw !== 'object' || ruw == null || Array.isArray(ruw)) return { ok: false, reden: 'er staan geen instellingen in deze back-up' };
  const bestanden: Record<string, unknown> = {};
  const overgeslagen: string[] = [];
  for (const [naam, inhoud] of Object.entries(ruw as Record<string, unknown>)) {
    if (IN_BACKUP.has(naam) && inhoud !== undefined) bestanden[naam] = inhoud;
    else overgeslagen.push(naam);
  }
  let configuratie: Backup['configuratie'] = null;
  const c = x['configuratie'];
  if (c != null) {
    const naam = typeof (c as Record<string, unknown>)['naam'] === 'string' ? basename(String((c as Record<string, unknown>)['naam'])) : '';
    const inhoud = (c as Record<string, unknown>)['inhoud'];
    if (!/^[\w.-]+\.json$/.test(naam) || inhoud == null) return { ok: false, reden: 'de configuratie in deze back-up is niet te lezen' };
    const fout = controleer?.(inhoud) ?? null;
    if (fout) return { ok: false, reden: `de configuratie in deze back-up klopt niet: ${fout}` };
    configuratie = { naam, inhoud };
  }
  return {
    ok: true,
    backup: { soort: BACKUP_SOORT, versie: 1, app: String(x['app'] ?? 'onbekend'), gemaakt: String(x['gemaakt'] ?? ''), configuratie, bestanden },
    overgeslagen,
  };
}

/** Eerst een tijdelijk bestand, dan een rename: halverwege stoppen laat nooit een half bestand achter. */
async function zetNeer(pad: string, inhoud: unknown): Promise<void> {
  const tmp = `${pad}.nieuw`;
  await writeFile(tmp, `${JSON.stringify(inhoud, null, 2)}\n`, 'utf-8');
  await rename(tmp, pad);
}

/** Bewaart een back-up in `back-ups/`, en ruimt op tot de laatste tien. Geeft de naam terug. */
export async function bewaarBackup(logDir: string, backup: Backup, now: Date = new Date()): Promise<string> {
  const map = join(logDir, BACKUP_DIR);
  await mkdir(map, { recursive: true });
  const naam = backupNaam(now);
  await zetNeer(join(map, naam), backup);
  const alle = (await readdir(map)).filter((n) => n.startsWith('smart-climate-back-up-') && n.endsWith('.json')).sort();
  for (const oud of alle.slice(0, Math.max(0, alle.length - BACKUPS_BEWAREN))) await unlink(join(map, oud)).catch(() => {});
  return naam;
}

/** De back-ups die de dienst zelf maakte, de nieuwste eerst. */
export async function bewaardeBackups(logDir: string): Promise<string[]> {
  try {
    return (await readdir(join(logDir, BACKUP_DIR))).filter((n) => n.startsWith('smart-climate-back-up-') && n.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

/**
 * Zet een back-up terug. Wat er in de back-up staat, vervangt wat er is; wat
 * er niet in staat, blijft. De configuratie alleen als er nog geen is.
 */
export async function zetTerug(
  logDir: string,
  backup: Backup,
  plek: {
    readonly configPad: string | null;
    readonly sitesDir: string;
    /**
     * Een configuratie die de app zelf maakte (de add-on, met de onboarding),
     * vervangen door die uit de back-up (17 oktober 2026). Anders bleef de
     * ontdekte configuratie staan, zonder bijvoorbeeld de panelen, terwijl de
     * back-up ze wel had. Een configuratie van de beheerder (de NAS) blijft.
     */
    readonly vervang?: boolean;
  },
): Promise<{ readonly bestanden: string[]; readonly configuratie: 'neergezet' | 'vervangen' | 'bleef' | 'geen' }> {
  const bestanden: string[] = [];
  for (const [naam, inhoud] of Object.entries(backup.bestanden)) {
    if (!IN_BACKUP.has(naam)) continue;
    await zetNeer(join(logDir, naam), inhoud);
    bestanden.push(naam);
  }
  let configuratie: 'neergezet' | 'vervangen' | 'bleef' | 'geen' = 'geen';
  if (backup.configuratie) {
    if (plek.configPad != null && !plek.vervang) configuratie = 'bleef';
    else {
      // Eerst de oude weg: twee configuraties naast elkaar laat de lader niet toe.
      if (plek.configPad != null) await rm(plek.configPad, { force: true });
      await mkdir(plek.sitesDir, { recursive: true });
      await zetNeer(join(plek.sitesDir, basename(backup.configuratie.naam)), backup.configuratie.inhoud);
      configuratie = plek.configPad != null ? 'vervangen' : 'neergezet';
    }
  }
  return { bestanden, configuratie };
}

/**
 * Opnieuw beginnen: haalt weg wat de dienst maakte, behalve de back-ups, de
 * sessies, de sleutel en de scèneplaatjes. De configuratie alleen met
 * `configWeg`. Geeft terug wat er weg is.
 */
export async function beginOpnieuw(logDir: string, opties: { readonly configPad: string | null; readonly configWeg: boolean }): Promise<string[]> {
  const weg: string[] = [];
  const namen = await readdir(logDir).catch(() => [] as string[]);
  const vast = new Set([...INSTELLINGEN, ...GELEERD, ...OOK_WEG]);
  for (const naam of namen) {
    if (!vast.has(naam) && !DAGBESTAND.test(naam)) continue;
    await rm(join(logDir, naam), { force: true });
    weg.push(naam);
  }
  if (opties.configWeg && opties.configPad) {
    await rm(opties.configPad, { force: true });
    weg.push(basename(opties.configPad));
  }
  return weg.sort();
}
