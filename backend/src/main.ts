/**
 * Instappunt van de schaduwmodus.
 *
 *   npm run shadow
 *
 * Leest `.env` uit de projectmap wanneer die er is; variabelen die al in de
 * shell staan winnen daarvan. Verbindt daarna met Home Assistant, laat de
 * arbiter meedenken op de echte toestand, en schrijft zijn besluiten naar de
 * console en een NDJSON-logboek. Er gaat niets terug naar Home Assistant: de
 * client wordt zonder schrijfrechten aangemaakt, en een `callService` zou daar
 * op stuklopen.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';


import { ConfigError, loadSiteConfig } from './config/load.js';
import { HaClient } from './adapters/homeassistant/client.js';
import { ShadowRunner } from './adapters/homeassistant/shadow.js';
import { defaultStrategies } from './index.js';

/**
 * Laadt een .env-bestand, maar laat variabelen die al gezet zijn met rust.
 * Wie `HA_TOKEN=... npm run shadow` typt verwacht dat dát wint van het bestand.
 */
function loadDotEnv(file: string): boolean {
  if (!existsSync(file)) return false;
  const fromShell = { ...process.env };
  try {
    process.loadEnvFile(file);
  } catch {
    return false;
  }
  for (const [key, v] of Object.entries(fromShell)) {
    if (v !== undefined) process.env[key] = v;
  }
  return true;
}

const packageRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const candidates = [resolve(process.cwd(), '.env'), join(packageRoot, '.env')];
const loadedFrom = candidates.find((file) => loadDotEnv(file));

function read(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : null;
}

function fail(problems: readonly string[]): never {
  console.error('Kan de schaduwmodus niet starten.');
  console.error('');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('');
  console.error(
    loadedFrom
      ? `Gelezen uit: ${loadedFrom}`
      : `Geen .env gevonden. Gezocht in:\n  ${candidates.join('\n  ')}`,
  );
  console.error('');
  console.error('Verwacht:');
  console.error('  HA_URL    basis-URL van Home Assistant, zonder pad');
  console.error('            bijvoorbeeld http://homeassistant.local:8123');
  console.error('  HA_TOKEN  long-lived access token');
  console.error('            HA → klik je naam linksonder → tabblad Beveiliging');
  console.error('            → onderaan "Langlopende toegangstokens" → Aanmaken');
  console.error('');
  console.error('Optioneel:');
  console.error('  SHADOW_TICK_SECONDS   hartslag in seconden (standaard 30)');
  console.error('  SHADOW_MIN_INTERVAL_SECONDS');
  console.error('                        ondergrens tussen evaluaties (standaard 15)');
  console.error('  SHADOW_WATCHDOG_MINUTES');
  console.error('                        afsluiten na zoveel minuten zonder besluit,');
  console.error('                        zodat de omgeving kan herstarten (standaard 10)');
  console.error('  HEMS_CONFIG           pad naar het configuratiebestand');
  console.error('  HEMS_SITE             naam in config/sites (zonder .json)');
  console.error('  SHADOW_LOG_DIR        map voor het beslislogboek');
  console.error('                        (standaard data/shadow)');
  process.exit(1);
}

const url = read('HA_URL');
const token = read('HA_TOKEN');

// Onderscheid tussen "staat er niet" en "staat er wel maar is leeg" — dat
// tweede is de fout die je maakt als je het bestand hebt aangemaakt maar het
// token nog moet plakken, en dan wil je dat ook horen.
const problems: string[] = [];
if (url == null) {
  problems.push(
    'HA_URL' in process.env
      ? 'HA_URL staat er wel, maar is leeg.'
      : 'HA_URL ontbreekt.',
  );
}
if (token == null) {
  problems.push(
    'HA_TOKEN' in process.env
      ? 'HA_TOKEN staat er wel, maar is leeg — het token is nog niet geplakt.'
      : 'HA_TOKEN ontbreekt.',
  );
}
if (problems.length > 0) fail(problems);

/**
 * Kijkt of het token er überhaupt uitziet als een JWT, voordat we Home
 * Assistant ermee lastigvallen. Een token raakt bij het plakken makkelijk
 * beschadigd — er verdwijnt een stuk, of er sluipt een teken in — en dan zegt
 * HA alleen "geweigerd". Dan weet je nog niet of je het verkeerde token hebt,
 * of het juiste half. Dit is met opzet een waarschuwing en geen weigering:
 * het formaat is niet iets waar wij over gaan.
 */
function tokenComplaint(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return `het bestaat uit ${segments.length} delen in plaats van 3 — er is een stuk kwijt of er staat een punt te veel`;
  }
  try {
    const [header] = segments as [string, string, string];
    const json = Buffer.from(header, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as { typ?: string };
    if (parsed.typ !== 'JWT') {
      return `de kop leest "${String(parsed.typ)}" in plaats van "JWT" — het token is beschadigd geraakt`;
    }
  } catch {
    return 'de kop is niet te lezen — het token is beschadigd geraakt bij het kopiëren';
  }
  return null;
}

const complaint = tokenComplaint(token!);
if (complaint) {
  console.error('Het token in HA_TOKEN klopt niet:');
  console.error(`  ${complaint}.`);
  console.error('');
  console.error('Maak een nieuw token aan en plak het in één keer:');
  console.error('  Home Assistant → je naam linksonder → tabblad Beveiliging');
  console.error('  → onderaan "Langlopende toegangstokens" → Token aanmaken');
  console.error('');
  console.error('Let op bij het plakken:');
  console.error('  - alles op één regel, geen regeleinde erin');
  console.error('  - geen aanhalingstekens en geen spaties eromheen');
  console.error('  - het token is ongeveer 180 tekens en begint met "eyJ"');
  console.error('');
  console.error('Doorgaan heeft geen zin; Home Assistant zou dit weigeren.');
  process.exit(1);
}

const tickSeconds = Number(process.env['SHADOW_TICK_SECONDS'] ?? 30);
const minInterval = Number(process.env['SHADOW_MIN_INTERVAL_SECONDS'] ?? 15);
const watchdog = Number(process.env['SHADOW_WATCHDOG_MINUTES'] ?? 10);
const logDir = process.env['SHADOW_LOG_DIR'] ?? 'data/shadow';

const strategies = defaultStrategies();

// De configuratie wordt hier gelezen én gecontroleerd. Een fout erin is een
// opstartfout met een aanwijzing, niet een storing die zich pas 's nachts laat
// zien wanneer de regeling iets onmogelijks probeert.
let site;
try {
  site = await loadSiteConfig({
    explicitPath: process.env['HEMS_CONFIG'],
    siteId: process.env['HEMS_SITE'],
    knownStrategies: strategies.ids,
  });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.format());
    process.exit(1);
  }
  throw error;
}

const client = new HaClient({
  url: url!,
  token: token!,
  // Schaduwmodus: expliciet geen schrijfrechten.
  allowWrites: false,
});

const runner = new ShadowRunner({
  config: site.config,
  strategies,
  client,
  tickSeconds: Number.isFinite(tickSeconds) ? tickSeconds : 30,
  minIntervalSeconds: Number.isFinite(minInterval) ? minInterval : 15,
  watchdogMinutes: Number.isFinite(watchdog) ? watchdog : 10,
  logDir,
});

console.log('─'.repeat(64));
console.log('  SCHADUWMODUS — de arbiter denkt mee, maar schakelt niets');
console.log('─'.repeat(64));
console.log(`  Home Assistant   ${url}`);
console.log(`  configuratie     ${site.source}`);
console.log(`  installatie      ${site.config.id} — ${site.config.zones.length} zones, ${site.config.actuators.length} apparaten`);
console.log(`  instellingen     ${loadedFrom ?? 'uit de omgeving'}`);
console.log(`  hartslag         ${tickSeconds} s`);
console.log(`  min. interval    ${minInterval} s tussen twee evaluaties`);
console.log(
  `  bewaking         ${watchdog > 0 ? `afsluiten na ${watchdog} min zonder besluit` : 'uit'}`,
);
console.log(`  logboek          ${logDir}/decisions-JJJJ-MM-DD.ndjson`);
console.log(`  schrijfrechten   ${client.writesAllowed ? 'AAN' : 'uit'}`);
console.log('─'.repeat(64));

if (site.warnings.length > 0) {
  console.log('  Let op in de configuratie:');
  for (const warning of site.warnings) console.log(warning);
  console.log('─'.repeat(64));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nafsluiten…');
    runner.stop();
    process.exit(0);
  });
}

runner.start();
