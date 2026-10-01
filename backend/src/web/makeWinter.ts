/**
 * Bouwt een logboek van winterformaat uit de dagen die we al hebben.
 *
 *   node dist/main.js --make-winter [dagen] [bronmap] [doelmap]
 *   node dist/main.js --make-winter 180 data/shadow data/bench
 *
 * Als vlag op `main.js` en niet als los script in `tools/`, om één reden: op een
 * Raspberry Pi met HAOS staat geen npm en geen tsx. Wat in het image zit kun je
 * daar draaien; wat in `tools/` staat niet (dat wordt door `.dockerignore`
 * buitengesloten). Zelfde afweging als bij `--check-config`.
 *
 * **Waarom nabouwen en niet wachten.** De vraag is of een Raspberry Pi de
 * analyse van een hele winter trekt náást Home Assistant. Het antwoord bepaalt
 * of we de add-on kunnen bouwen zoals we hem willen (besluit 34). Wachten tot
 * maart om dat te weten is de verkeerde volgorde: dan is de add-on al af.
 *
 * **Wat dit wel en niet meet.** Dit is een *prestatiemeting*, geen dataset. De
 * dagen worden herhaald met verschoven tijdstempels, dus de uitkomsten van de
 * analyse zijn onzin — er zitten 36 identieke septemberdagen in. Wat wél
 * realistisch is: het aantal momenten, de verhouding tussen volledige en korte
 * records, de recordgrootte en daarmee het lees- en rekenwerk. Precies wat je
 * voor een benchmark nodig hebt.
 *
 * Draai dit één keer op je werkstation en kopieer de map naar de Pi. Dezelfde
 * invoer aan beide kanten maakt de cijfers vergelijkbaar; twee keer genereren
 * niet.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { findLogFiles, linesOf } from '../divergence/read.js';

const DAY_MS = 86_400_000;

export async function makeWinter(
  days: number,
  source: string,
  target: string,
): Promise<number> {
  if (!Number.isInteger(days) || days < 1 || days > 1000) {
    console.error(`Aantal dagen moet tussen 1 en 1000 liggen, niet "${days}".`);
    return 1;
  }

  // Via dezelfde lezer als de analyse, zodat gecomprimeerde dagen ook als
  // sjabloon dienen (besluit 58).
  const files = (await findLogFiles(source)).map((p) => basename(p));

  if (files.length === 0) {
  console.error(`Geen decisions-*.ndjson in ${source} om mee te vullen.`);
  process.exit(1);
  }

  /** JJJJ-MM-DD van een tijdstip, in lokale tijd — net als de schaduwrunner. */
  const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  // Terugtellen vanaf gisteren, zodat de reeks aansluit op "nu" en de
  // seizoensverdeling van de datasetmeter er realistisch uitziet.
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const startMs = end.getTime() - days * DAY_MS;

  let lines = 0;
  let bytes = 0;

  for (let i = 0; i < days; i++) {
  const targetDayMs = startMs + i * DAY_MS;
  const template = files[i % files.length]!;

  // Het verschil tussen de brondag en de doeldag, zodat elke tijdstempel
  // meeschuift en de volgorde binnen de dag intact blijft.
  const sourceDay = Date.parse(`${template.slice(10, 20)}T00:00:00`);
  const difference = targetDayMs - sourceDay;

  const outStream = createWriteStream(join(target, `decisions-${dayKey(targetDayMs)}.ndjson`));
  for await (const line of linesOf(join(source, template))) {
    if (line.trim() === '') continue;
    let r: { t?: number };
    try {
      r = JSON.parse(line) as { t?: number };
    } catch {
      continue;
    }
    if (typeof r.t !== 'number') continue;
    r.t += difference;
    const serialized = `${JSON.stringify(r)}\n`;
    bytes += Buffer.byteLength(serialized);
    lines += 1;
    if (!outStream.write(serialized)) await new Promise<void>((ok) => outStream.once('drain', () => ok()));
  }

  outStream.end();
  await new Promise<void>((ok) => outStream.once('close', () => ok()));
  }

  const onDisk = (
  await Promise.all(
    (await readdir(target)).map(async (n) => (await stat(join(target, n))).size),
  )
  ).reduce((a, b) => a + b, 0);

  console.log(`${days} dagbestanden geschreven naar ${target}`);
  console.log(`  ${lines.toLocaleString('nl-NL')} regels`);
  console.log(`  ${(onDisk / 1e6).toFixed(1)} MB op schijf`);
  console.log(`  ${(bytes / days / 1e6).toFixed(2)} MB per dag`);
  console.log('');
  console.log('Kopieer deze map naar de Pi en draai daar dezelfde meting:');
  console.log('  node dist/main.js --benchmark <map>');

  return 0;
}
