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

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const DAG_MS = 86_400_000;

export async function makeWinter(
  dagen: number,
  bron: string,
  doel: string,
): Promise<number> {
  if (!Number.isInteger(dagen) || dagen < 1 || dagen > 1000) {
    console.error(`Aantal dagen moet tussen 1 en 1000 liggen, niet "${dagen}".`);
    return 1;
  }

  const bestanden = (await readdir(bron))
  .filter((n) => /^decisions-\d{4}-\d{2}-\d{2}\.ndjson$/.test(n))
  .sort();

  if (bestanden.length === 0) {
  console.error(`Geen decisions-*.ndjson in ${bron} om mee te vullen.`);
  process.exit(1);
  }

  /** JJJJ-MM-DD van een tijdstip, in lokale tijd — net als de schaduwrunner. */
  const dagSleutel = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  await rm(doel, { recursive: true, force: true });
  await mkdir(doel, { recursive: true });

  // Terugtellen vanaf gisteren, zodat de reeks aansluit op "nu" en de
  // seizoensverdeling van de datasetmeter er realistisch uitziet.
  const eind = new Date();
  eind.setHours(0, 0, 0, 0);
  const startMs = eind.getTime() - dagen * DAG_MS;

  let regels = 0;
  let bytes = 0;

  for (let i = 0; i < dagen; i++) {
  const doelDagMs = startMs + i * DAG_MS;
  const sjabloon = bestanden[i % bestanden.length]!;

  // Het verschil tussen de brondag en de doeldag, zodat elke tijdstempel
  // meeschuift en de volgorde binnen de dag intact blijft.
  const bronDag = Date.parse(`${sjabloon.slice(10, 20)}T00:00:00`);
  const verschil = doelDagMs - bronDag;

  const uit = createWriteStream(join(doel, `decisions-${dagSleutel(doelDagMs)}.ndjson`));
  const rl = createInterface({
    input: createReadStream(join(bron, sjabloon), 'utf-8'),
    crlfDelay: Infinity,
  });

  for await (const regel of rl) {
    if (regel.trim() === '') continue;
    let r: { t?: number };
    try {
      r = JSON.parse(regel) as { t?: number };
    } catch {
      continue;
    }
    if (typeof r.t !== 'number') continue;
    r.t += verschil;
    const nieuw = `${JSON.stringify(r)}\n`;
    bytes += Buffer.byteLength(nieuw);
    regels += 1;
    if (!uit.write(nieuw)) await new Promise<void>((ok) => uit.once('drain', () => ok()));
  }

  uit.end();
  await new Promise<void>((ok) => uit.once('close', () => ok()));
  }

  const opSchijf = (
  await Promise.all(
    (await readdir(doel)).map(async (n) => (await stat(join(doel, n))).size),
  )
  ).reduce((a, b) => a + b, 0);

  console.log(`${dagen} dagbestanden geschreven naar ${doel}`);
  console.log(`  ${regels.toLocaleString('nl-NL')} regels`);
  console.log(`  ${(opSchijf / 1e6).toFixed(1)} MB op schijf`);
  console.log(`  ${(bytes / dagen / 1e6).toFixed(2)} MB per dag`);
  console.log('');
  console.log('Kopieer deze map naar de Pi en draai daar dezelfde meting:');
  console.log('  node dist/main.js --benchmark <map>');

  return 0;
}
