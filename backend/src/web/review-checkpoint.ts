/**
 * De tussenstand van de terugblik (besluit 63).
 *
 * De terugblik las elk kwartier de hele opname opnieuw: op 30 september 2026,
 * na 26 dagen, 35 seconden per keer, en na een winter zouden dat minuten
 * worden. Maar een afgesloten dag verandert niet meer. Dus bewaren we de stand
 * van de analyse na de laatste afgesloten dag, en leest elke volgende ronde
 * alleen wat erna kwam.
 *
 * De stand is niet "per dag opgeteld" maar de volledige doorlopende stand: de
 * lezer, de analyse en de datasetmeter dragen dingen over dagen heen mee — een
 * afwijking die over middernacht doorloopt, wat een kort record weglaat. Daarom
 * is voortzetten exact hetzelfde als opnieuw rekenen, en een test bewaakt dat.
 *
 * Op schijf in de logmap, zodat ook de eerste ronde na een herstart (bij elke
 * uitrol) niet alles hoeft te lezen. Met `node:v8`, omdat de stand uit Maps en
 * Sets bestaat die JSON niet kent.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deserialize, serialize } from 'node:v8';

import type { AnalyserState } from '../divergence/analyse.js';
import type { ReaderCarry } from '../divergence/read.js';
import type { DatasetCounterState } from './dataset.js';

export const CHECKPOINT_FILE = 'review-checkpoint.bin';

/**
 * Omhoog bij elke wijziging aan wat de analyse, de lezer of de datasetmeter
 * bijhoudt of hoe ze rekenen. Een tussenstand van een andere versie wordt
 * weggegooid, en dan rekent de terugblik één keer alles opnieuw.
 */
export const CHECKPOINT_VERSION = 1;

/** Eén dagbestand zoals het er lag toen de tussenstand werd gemaakt. */
export interface DayFile {
  readonly day: string;
  readonly name: string;
  readonly size: number;
}

export interface Checkpoint {
  readonly version: number;
  readonly minEpisodeMinutes: number;
  /** De afgesloten dagen die erin zitten, op volgorde. */
  readonly files: readonly DayFile[];
  readonly carry: ReaderCarry;
  readonly analyser: AnalyserState;
  readonly counter: DatasetCounterState;
}

/** Leest de bewaarde tussenstand. Geen bestand of onleesbaar: null, nooit een fout. */
export async function loadCheckpoint(dir: string): Promise<Checkpoint | null> {
  try {
    const value = deserialize(await readFile(join(dir, CHECKPOINT_FILE))) as Partial<Checkpoint>;
    if (value.version !== CHECKPOINT_VERSION || !Array.isArray(value.files)) return null;
    return value as Checkpoint;
  } catch {
    return null;
  }
}

/** Schrijft de tussenstand weg: eerst tijdelijk, dan een atomaire rename. */
export async function saveCheckpoint(dir: string, checkpoint: Checkpoint): Promise<void> {
  const path = join(dir, CHECKPOINT_FILE);
  await writeFile(`${path}.tmp`, serialize(checkpoint));
  await rename(`${path}.tmp`, path);
}

/**
 * Hoeveel van de afgesloten dagen de tussenstand al dekt, of null als hij niet
 * meer klopt met wat er ligt.
 *
 * Hij klopt als zijn dagen precies het begin van de huidige afgesloten dagen
 * zijn, elk onveranderd. Eén verandering is toegestaan: het comprimeren van een
 * week oude dag (besluit 58) verandert naam en grootte, niet de inhoud. Elke
 * andere afwijking — een dag erbij aan het begin, een bestand dat is
 * vervangen — en we rekenen alles opnieuw. Dat kost één keer tijd; een
 * tussenstand die stil verkeerd is, kost de betrouwbaarheid van de terugblik.
 */
export function coveredPrefix(
  checkpoint: Checkpoint,
  closed: readonly DayFile[],
  minEpisodeMinutes: number,
): number | null {
  if (checkpoint.version !== CHECKPOINT_VERSION) return null;
  if (checkpoint.minEpisodeMinutes !== minEpisodeMinutes) return null;
  if (checkpoint.files.length > closed.length) return null;
  for (let i = 0; i < checkpoint.files.length; i += 1) {
    const was = checkpoint.files[i]!;
    const now = closed[i]!;
    if (was.day !== now.day) return null;
    const unchanged = was.name === now.name && was.size === now.size;
    const compressed = now.name === `${was.name}.gz`;
    if (!unchanged && !compressed) return null;
  }
  return checkpoint.files.length;
}
