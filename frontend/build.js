/**
 * Bouwt de weergave naar `backend/web`, waar de schaduwdienst hem uitserveert.
 *
 *   npm run build
 *   npm run watch
 *
 * Waarom een scriptje en geen `cp` in package.json: dit draait zowel op Windows
 * tijdens het ontwikkelen als in een Alpine-container tijdens het uitrollen, en
 * die twee delen geen enkel shell-commando. Node is de enige tolk die er op
 * allebei staat.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const out = process.env['HEMS_WEB_OUT'] ?? join(here, '..', 'backend', 'web');
const watch = process.argv.includes('--watch');

await mkdir(out, { recursive: true });

/** Alles wat geen CSS is gaat ongewijzigd mee; Tailwind doet de rest. */
async function copyStatic() {
  // input.css is de bron voor Tailwind; die bouwt app.css. Andere css gaat zo mee.
  const names = (await readdir(src)).filter((n) => n !== 'input.css');
  await Promise.all(names.map((n) => copyFile(join(src, n), join(out, n))));
  return names;
}

const copied = await copyStatic();

/*
 * De tekenmotor en de stijlbasis van ontwerp 2 (besluit 104): de schets is de
 * code. Ze staan in frontend/kit; de schetsen in design/app2 laden ze daarvandaan.
 */
const kitDir = join(here, 'kit');
await mkdir(join(out, 'kit'), { recursive: true });
for (const n of await readdir(kitDir)) {
  await copyFile(join(kitDir, n), join(out, 'kit', n));
  copied.push(`kit/${n}`);
}

/*
 * De lettertypen staan in de dienst zelf, niet bij Google: de app werkt zo ook
 * zonder internet, en een bezoek lekt niets naar buiten. Uit de npm-pakketten
 * van Fontsource (OFL), alleen de Latijnse set: die heeft ook €, ³, ° en −.
 */
const FONTS = {
  'figtree.woff2': '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2',
  'bricolage-grotesque.woff2': '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2',
};
for (const [name, from] of Object.entries(FONTS)) {
  await copyFile(join(here, 'node_modules', from), join(out, name));
  copied.push(name);
}
/* De QR-code bij Bewoners (besluit 147): qrcode-generator (MIT), lokaal, zonder internet. */
await copyFile(join(here, 'node_modules', 'qrcode-generator/dist/qrcode.js'), join(out, 'qrcode.js'));
copied.push('qrcode.js');

const args = [
  '--input',
  join(src, 'input.css'),
  '--output',
  join(out, 'app.css'),
  ...(watch ? ['--watch'] : ['--minify']),
];

/*
 * De CLI wordt rechtstreeks als JS-module aangeroepen, niet via `npx`.
 *
 * `npx` is op Windows een .cmd, en Node weigert die sinds v20 te spawnen
 * zonder shell (EINVAL) — terecht, want dat is precies het gat waar
 * argument-injectie doorheen gaat. Met `shell: true` zou het werken en zou
 * elk pad met een spatie erin een probleem worden; dit project staat in
 * "C:\Project HEMS-CLIMATE". Het binnenpad opzoeken en met `process.execPath`
 * starten omzeilt de shell volledig en werkt overal hetzelfde.
 */
const cliPakket = join(here, 'node_modules', '@tailwindcss', 'cli');
const cli = join(
  cliPakket,
  JSON.parse(await readFile(join(cliPakket, 'package.json'), 'utf-8')).bin.tailwindcss,
);
if (!existsSync(cli)) {
  console.error(`Tailwind niet gevonden op ${cli}.`);
  console.error('Draai eerst `npm install` in frontend/.');
  process.exit(1);
}

const tailwind = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  cwd: here,
});

/**
 * Zet een versiestempel achter de verwijzingen naar de scripts en de opmaak.
 *
 * De bestandsnamen blijven gelijk, dus een browser die er ooit een met een
 * `max-age` heeft opgehaald houdt die vast tot die vervalt — ook als de server
 * inmiddels iets anders zegt. Dat is precies één keer misgegaan: nieuwe HTML,
 * oude JS, een pagina die half werkt zonder één foutmelding.
 *
 * Een korte hash van de inhoud in de URL maakt dat onmogelijk: wijzigt het
 * bestand, dan wijzigt de URL, en dan is er niets om uit de cache te halen.
 * Wijzigt het niet, dan blijft de URL gelijk en werkt de cache gewoon.
 */
async function stempel() {
  /*
   * Elke pagina, en elk script en elke opmaak die ze zelf laadt (`src="…"` of
   * `href="…"`, een bestand hiernaast). Eerst stond dit als lijst met de hand
   * hier; die vergat de microfoon op Assistent en het huismodel bij Energie.
   */
  const paginas = (await readdir(out)).filter((n) => n.endsWith('.html'));
  const hashes = new Map();
  const hashVan = async (naam) => {
    if (!hashes.has(naam)) hashes.set(naam, createHash('sha256').update(await readFile(join(out, naam))).digest('hex').slice(0, 8));
    return hashes.get(naam);
  };
  for (const pagina of paginas) {
    const html = join(out, pagina);
    let inhoud = await readFile(html, 'utf-8');
    const namen = new Set([...inhoud.matchAll(/(?:src|href)="([^":#?]+\.(?:js|css))"/g)].map((m) => m[1]));
    for (const naam of namen) {
      if (!existsSync(join(out, naam))) continue;
      inhoud = inhoud.replaceAll(`"${naam}"`, `"${naam}?v=${await hashVan(naam)}"`);
    }
    await writeFile(html, inhoud, 'utf-8');
  }
}

tailwind.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Tailwind stopte met code ${code}.`);
    process.exit(code ?? 1);
  }
  // Pas stempelen als Tailwind klaar is; anders hasht hij de vorige CSS.
  void stempel().then(() => {
    console.log(`Weergave gebouwd naar ${out}`);
    console.log(`  ${[...copied, 'app.css'].sort().join(', ')}`);
  });
});
