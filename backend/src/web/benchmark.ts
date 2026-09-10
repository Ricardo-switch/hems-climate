/**
 * Meten of deze machine de winteranalyse trekt.
 *
 *   node dist/main.js --benchmark data/bench
 *
 * De schaduwdienst rekent elk kwartier de hele opname door: de
 * divergentieanalyse en de datasetmeter, elk in een eigen doorloop over alle
 * dagbestanden. Op vijf dagen kost dat samen ongeveer 220 ms op een
 * werkstation. De vraag voor besluit 34 is wat dat wordt op een Raspberry Pi,
 * met een winter aan logboeken, náást een draaiende Home Assistant.
 *
 * **Wat er gemeten wordt, en waarom juist dat.**
 *
 *  - *Wandtijd* — hoe lang de gebruiker erop zou wachten. Niet het belangrijkst.
 *  - *Processortijd* — wat we van de machine afpakken. Dit is wat HA merkt.
 *  - *Piekgeheugen* — de container heeft een `mem_limit` van 256 MB. Daar
 *    overheen betekent dat de kernel ons afschiet, niet dat het traag wordt.
 *  - *Vertraging van de event loop* — de maat die op een werkstation nul was
 *    omdat de analyse I/O-verweven is. Op een Pi met een SD-kaart hoeft dat niet
 *    zo te blijven, en dán vertraagt hij ook de opname zelf.
 *
 * Die laatste is de reden dat deze meting bestaat. De andere drie kun je
 * schatten; die niet.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { analyse } from '../divergence/analyse.js';
import { findLogFiles, readMoments } from '../divergence/read.js';
import { statusVanBestanden } from './dataset.js';

/** Grenzen waarboven we de Pi niet geschikt noemen. Oordeel, geen meting. */
const GRENS = {
  /** Vier keer speling op een cyclus van een kwartier. */
  wandtijdMs: 60_000,
  /** De `mem_limit` uit docker-compose.yml. */
  piekMb: 256,
  /**
   * Hierboven begint de analyse de opname zelf te vertragen: de runner werkt
   * met een ondergrens van vijftien seconden tussen evaluaties.
   */
  vertragingMs: 1_000,
};

/** Houdt bij hoe lang de event loop wegblijft terwijl er gerekend wordt. */
function meetVertraging(intervalMs = 20): { stop: () => number } {
  let ergste = 0;
  let vorige = performance.now();
  const timer = setInterval(() => {
    const nu = performance.now();
    ergste = Math.max(ergste, nu - vorige - intervalMs);
    vorige = nu;
  }, intervalMs);
  timer.unref?.();
  return {
    stop: () => {
      clearInterval(timer);
      return ergste;
    },
  };
}

const mb = (bytes: number): string => (bytes / 1e6).toFixed(1);
const ms = (n: number): string => `${Math.round(n).toLocaleString('nl-NL')} ms`;

export async function benchmark(dir: string): Promise<number> {
  const files = await findLogFiles(dir);
  if (files.length === 0) {
    console.error(`Geen decisions-*.ndjson in ${dir}.`);
    console.error('  Maak eerst een testset: npx tsx tools/make-winter.ts 180 data/bench');
    return 1;
  }

  const opSchijf = (
    await Promise.all((await readdir(dir)).map(async (n) => (await stat(join(dir, n))).size))
  ).reduce((a, b) => a + b, 0);

  console.log('─'.repeat(64));
  console.log('  PRESTATIEMETING — kan deze machine de winteranalyse aan?');
  console.log('─'.repeat(64));
  console.log(`  invoer          ${files.length} dagbestanden, ${mb(opSchijf)} MB`);
  console.log(`  node            ${process.version} op ${process.platform}/${process.arch}`);
  console.log('─'.repeat(64));

  // Eerst opruimen wat er van het opstarten nog ligt, zodat de piek van de
  // meting zelf is en niet van wat ervoor gebeurde.
  global.gc?.();

  const vertraging = meetVertraging();
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();

  const a = await analyse(readMoments(files), { minEpisodeMinutes: 2 });
  const tNaAnalyse = performance.now();

  const d = await statusVanBestanden(files);
  const t1 = performance.now();

  const cpu = process.cpuUsage(cpu0);
  const ergsteVertraging = vertraging.stop();
  const piek = process.memoryUsage();

  const wand = t1 - t0;
  const cpuTotaalMs = (cpu.user + cpu.system) / 1000;

  console.log(`  momenten        ${a.moments.toLocaleString('nl-NL')}`);
  console.log(`  episodes        ${a.episodes.length.toLocaleString('nl-NL')}`);
  console.log(`  dagen in beeld  ${d?.dagenOpgenomen.toFixed(1) ?? '?'}`);
  console.log('');
  console.log(`  divergentie     ${ms(tNaAnalyse - t0)}`);
  console.log(`  datasetmeter    ${ms(t1 - tNaAnalyse)}`);
  console.log(`  samen           ${ms(wand)}   (${Math.round(a.moments / (wand / 1000)).toLocaleString('nl-NL')} momenten/s)`);
  console.log('');
  console.log(`  processortijd   ${ms(cpuTotaalMs)}  (${((cpuTotaalMs / wand) * 100).toFixed(0)}% van de wandtijd)`);
  console.log(`  piekgeheugen    ${mb(piek.rss)} MB rss, ${mb(piek.heapUsed)} MB heap`);
  console.log(`  ergste vertraging van de event loop  ${ms(ergsteVertraging)}`);
  console.log('');

  // Elke cyclus is een kwartier. Wat we hier gebruiken pakken we van HA af.
  const bezetting = (cpuTotaalMs / (15 * 60_000)) * 100;
  console.log(`  bezetting       ${bezetting.toFixed(2)}% van één kern, elk kwartier`);
  console.log('─'.repeat(64));

  const oordeel: [string, boolean, string][] = [
    ['wandtijd', wand < GRENS.wandtijdMs, `${ms(wand)} < ${ms(GRENS.wandtijdMs)}`],
    ['piekgeheugen', piek.rss / 1e6 < GRENS.piekMb, `${mb(piek.rss)} MB < ${GRENS.piekMb} MB`],
    [
      'event loop',
      ergsteVertraging < GRENS.vertragingMs,
      `${ms(ergsteVertraging)} < ${ms(GRENS.vertragingMs)}`,
    ],
  ];

  let geslaagd = true;
  for (const [naam, ok, uitleg] of oordeel) {
    if (!ok) geslaagd = false;
    console.log(`  ${ok ? 'HAALT' : 'FAALT'}  ${naam.padEnd(14)} ${uitleg}`);
  }
  console.log('─'.repeat(64));

  if (geslaagd) {
    console.log('  Deze machine kan de analyse aan binnen de gestelde grenzen.');
    console.log('');
    console.log('  Let op: dit meet ons eigen werk. Of Home Assistant er last van');
    console.log('  heeft, meet je door tijdens deze run zijn API te bevragen —');
    console.log('  zie deploy/README-NAS.md.');
  } else {
    console.log('  Deze machine haalt de grenzen niet.');
    console.log('');
    console.log('  De uitweg staat al op de lijst in DECISIONS.md: een tussenstand');
    console.log('  per dag in plaats van elke keer de hele opname doorrekenen. Dat');
    console.log('  is bewust uitgesteld tot het zou gaan knellen. Als deze meting');
    console.log('  op de doelmachine faalt, knelt het.');
  }

  return geslaagd ? 0 : 1;
}
