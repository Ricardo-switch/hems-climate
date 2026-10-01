/**
 * Welke versie wanneer besliste (besluit 66).
 *
 * Het beslislogboek zegt wat er besloten is, niet door welke code en met welke
 * instellingen. Verandert er deze winter iets aan de arbiter of de
 * configuratie, dan bestaat de dataset uit stukken van verschillende versies.
 * Zonder dit bestand waren die alleen uit het uitroljournaal van de NAS te
 * reconstrueren, en de configuratie helemaal niet.
 *
 * Eén regel per start van de dienst, naast de logboeken in de logmap: wanneer,
 * welke commit, wanneer gebouwd, en een vingerafdruk van de configuratie. Een
 * start is ook het enige moment waarop die kunnen veranderen: code en
 * configuratie worden alleen bij het opstarten gelezen.
 */

import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SiteConfig } from '../core/model.js';

export const RUNS_FILE = 'runs.ndjson';

export interface RunRecord {
  /** Wanneer de dienst startte, in ms. */
  readonly t: number;
  /** Korte commit-hash, of 'onbekend' buiten een image. */
  readonly commit: string;
  readonly built: string | null;
  /** Vingerafdruk van de gelezen configuratie; zie `configFingerprint`. */
  readonly config: string;
  readonly site: string;
  /** Alleen bij regels die achteraf zijn gereconstrueerd, bijvoorbeeld uit het uitroljournaal. */
  readonly source?: string;
}

/**
 * Twaalf tekens van een SHA-256 over de configuratie zoals de dienst hem las.
 *
 * Over het gelezen object en niet over het bestand: witruimte of de volgorde
 * van velden in de JSON verandert geen besluit, en hoort dan ook geen andere
 * vingerafdruk te geven. De parser bouwt het object steeds in dezelfde
 * volgorde op.
 */
export function configFingerprint(config: SiteConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12);
}

export async function recordRun(dir: string, run: RunRecord): Promise<void> {
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, RUNS_FILE), `${JSON.stringify(run)}\n`, 'utf-8');
}

/** Alle starts, oudste eerst. Geen bestand: een lege lijst. Kapotte regels tellen niet. */
export async function readRuns(dir: string): Promise<RunRecord[]> {
  let text: string;
  try {
    text = await readFile(join(dir, RUNS_FILE), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const runs: RunRecord[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const r = JSON.parse(line) as Partial<RunRecord>;
      if (typeof r.t === 'number' && typeof r.commit === 'string' && typeof r.config === 'string') {
        runs.push(r as RunRecord);
      }
    } catch {
      // Een afgekapte regel na een harde stop; de rest blijft bruikbaar.
    }
  }
  return runs.sort((a, b) => a.t - b.t);
}
