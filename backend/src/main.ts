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
import { HaClient, type HaEntityState } from './adapters/homeassistant/client.js';
import { haalRegisters } from './adapters/homeassistant/discovery.js';
import { ShadowRunner, type LiveSnapshot } from './adapters/homeassistant/shadow.js';
import { defaultStrategies } from './index.js';
import { WebServer, defaultWebDir, versieUitOmgeving } from './web/server.js';
import { leesOpstart } from './opstart.js';
import { DivergenceCache } from './web/divergence.js';
import { Onboarding } from './web/onboarding.js';

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
  console.error('  HEMS_WEB_PORT         poort voor de read-only webweergave;');
  console.error('                        weglaten betekent: geen weergave, en dan');
  console.error('                        luistert deze dienst nergens op');
  console.error('  HEMS_WEB_HOST         adres om aan te binden (standaard 0.0.0.0)');
  console.error('  HEMS_WEB_DIR          map met de gebouwde frontend');
  console.error('');
  console.error('Alleen de configuratie nakijken, zonder Home Assistant:');
  console.error('  node dist/main.js --check-config');
  console.error('');
  console.error('Kijken wat er in huis staat en een configuratie voorstellen:');
  console.error('  node dist/main.js --discover [pad naar het nieuwe bestand]');
  console.error('');
  console.error('Meten of deze machine de analyse aankan:');
  console.error('  node dist/main.js --make-winter 180 <bronmap> <doelmap>');
  console.error('  node dist/main.js --benchmark <doelmap>');
  process.exit(1);
}

/*
 * Alleen de configuratie nakijken en stoppen.
 *
 * Bestaat zodat de uitrol de drááiende configuratie kan toetsen tegen het
 * nínuwe image, vóórdat de container wordt omgewisseld. Die configuratie hoort
 * bij de installatie en wordt niet met git meegestuurd (besluit 21), dus een
 * schemawijziging kan hem ongeldig maken zonder dat iemand het merkt.
 *
 * Dat is precies wat er op 10 september 2026 gebeurde: `mode`, `timers` en `sun`
 * werden verplicht, de NAS had de oude configuratie, en de container kwam in een
 * herstartlus terecht. Zie besluit 33.
 *
 * Vóór de tokencontrole, want hiervoor is geen Home Assistant nodig.
 */
/*
 * Prestatiemeting, zonder Home Assistant.
 *
 * Draait binnen het uitgerolde image, zodat je op de Pi precies meet wat daar
 * straks draait — en niet wat er op je werkstation onder een andere Node en een
 * andere schijf gebeurt. Zie besluit 34.
 */
/*
 * Een logboek van winterformaat nabouwen uit de dagen die er al zijn.
 *
 * Ook als vlag, en om dezelfde reden als `--benchmark`: op een Pi met HAOS staat
 * geen npm en geen tsx. Wat in het image zit kun je daar draaien.
 */
if (process.argv.includes('--make-winter')) {
  const i = process.argv.indexOf('--make-winter');
  const dagen = Number(process.argv[i + 1] ?? 180);
  const bron = resolve(process.argv[i + 2] ?? process.env['SHADOW_LOG_DIR'] ?? 'data/shadow');
  const doel = resolve(process.argv[i + 3] ?? 'data/bench');
  const { makeWinter } = await import('./web/makeWinter.js');
  process.exit(await makeWinter(dagen, bron, doel));
}

if (process.argv.includes('--benchmark')) {
  const i = process.argv.indexOf('--benchmark');
  const dir = process.argv[i + 1] ?? process.env['SHADOW_LOG_DIR'] ?? 'data/shadow';
  const { benchmark } = await import('./web/benchmark.js');
  process.exit(await benchmark(resolve(dir)));
}

if (process.argv.includes('--check-config')) {
  try {
    const site = await loadSiteConfig({
      explicitPath: process.env['HEMS_CONFIG'],
      siteId: process.env['HEMS_SITE'],
      knownStrategies: defaultStrategies().ids,
    });
    console.log(`Configuratie in orde: ${site.source}`);
    for (const warning of site.warnings) console.log(warning);
    process.exit(0);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.format());
      process.exit(1);
    }
    throw error;
  }
}

/*
 * Alles wat de omgeving zegt over hoe deze dienst draait, op één plek en getest
 * (besluit 55): add-on of niet, de verbinding, de weergave, de schrijfdeur en
 * de tijden. Hier wordt alleen nog uitgevoerd.
 */
const opstart = leesOpstart(process.env);
const { alsAddon } = opstart;
const { url, token } = opstart.ha;
if (opstart.haProblemen.length > 0) fail(opstart.haProblemen);
if (opstart.fouten.length > 0) {
  console.error('Kan de schaduwmodus niet starten:');
  console.error('');
  for (const fout of opstart.fouten) console.error(`  ${fout}`);
  process.exit(1);
}

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

const complaint = alsAddon ? null : tokenComplaint(token!);
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

/*
 * Ontdekken gaat vóór het inlezen van de configuratie.
 *
 * Dat is de hele reden dat deze vlag bestaat: wie hem gebruikt heeft nog geen
 * configuratie. Zou hij ná `loadSiteConfig` staan, dan zou de opdracht die je
 * helpt aan een configuratie te komen alleen werken als je er al een had.
 */
if (process.argv.includes('--discover')) {
  const i = process.argv.indexOf('--discover');
  const arg = process.argv[i + 1];
  const doel = arg != null && !arg.startsWith('--') ? resolve(arg) : null;
  const { discoverCli } = await import('./adapters/homeassistant/discoverCli.js');
  process.exit(await discoverCli({ url: url!, token: token!, doel }));
}

const { tickSeconds, logDir } = opstart;

/*
 * De webweergave staat standaard uit.
 *
 * Deze dienst houdt het HA-token vast en draait maanden onbewaakt. Luisteren
 * is dus een keuze die je maakt, niet iets wat je overkomt door hem te
 * starten. De compose op de NAS zet de poort; een losse `npm run shadow`
 * blijft dicht.
 */
const webPort = opstart.web.poort;
const webDir = opstart.web.dir ?? defaultWebDir(packageRoot);

const strategies = defaultStrategies();

// De configuratie wordt hier gelezen én gecontroleerd. Een fout erin is een
// opstartfout met een aanwijzing, niet een storing die zich pas 's nachts laat
// zien wanneer de regeling iets onmogelijks probeert.
let site;
try {
  site = await loadSiteConfig({
    explicitPath: opstart.configPad ?? undefined,
    siteId: opstart.siteId ?? undefined,
    knownStrategies: strategies.ids,
  });
} catch (error) {
  /*
   * Ontbreken is iets anders dan kapot zijn.
   *
   * Een configuratie die er staat maar niet deugt blijft een opstartfout: die
   * moet je repareren, en stilzwijgend doorstarten zou de fout verbergen tot
   * hij 's nachts opduikt (besluit 33). Maar er helemaal géén hebben is de
   * normale toestand van een verse installatie, en daar hoort de onboarding
   * bij en geen foutmelding.
   *
   * Alleen achter Ingress: daar heeft Home Assistant vastgesteld wie er kijkt.
   * Zonder die zekerheid is een pagina die configuratie wegschrijft iets wat
   * je niet aan je netwerk hangt (besluit 42).
   */
  if (error instanceof ConfigError && error.soort === 'ontbreekt' && opstart.onboarding.aan) {
    console.log('─'.repeat(64));
    console.log('  NOG GEEN INSTALLATIE INGESTELD');
    console.log('─'.repeat(64));
    console.log('  Er is geen configuratie gevonden, dus er wordt nog niets geregeld.');
    console.log('  Open het paneel Smart Climate in Home Assistant; daar staat wat');
    console.log('  er in huis is gevonden en kun je het bevestigen.');
    console.log('─'.repeat(64));
  } else if (error instanceof ConfigError) {
    console.error(error.format());
    process.exit(1);
  } else {
    throw error;
  }
}

const client = new HaClient({
  url: url!,
  token: token!,
  // Schaduwmodus: expliciet geen schrijfrechten.
  allowWrites: false,
});

// De twee verwijzen naar elkaar: de runner duwt besluiten naar de weergave, de
// weergave haalt de laatste stand bij de runner op. Vandaar eerst een lege doos
// en pas daarna vullen — een van beide moet als eerste bestaan.
let web: WebServer | null = null;

/*
 * De laatst ontvangen toestand van Home Assistant.
 *
 * Zonder configuratie is er geen runner die een winkeltje bijhoudt, en de
 * onboarding heeft die toestanden nodig om te weten wat een apparaat kan.
 * Eén extra luisteraar op hetzelfde `ready`-signaal kost niets en werkt in
 * beide standen hetzelfde.
 */
let laatsteStates: readonly HaEntityState[] = [];
client.on('ready', (states: HaEntityState[]) => {
  laatsteStates = states;
});

const runner =
  site == null
    ? null
    : new ShadowRunner({
        config: site.config,
        strategies,
        client,
        tickSeconds,
        minIntervalSeconds: opstart.minIntervalSeconds,
        watchdogMinutes: opstart.watchdogMinutes,
        logDir,
        ...(webPort == null
          ? {}
          : { onDecision: (snapshot: LiveSnapshot) => web?.publish(snapshot) }),
      });

// De analyse over de logboeken. Alleen zinvol wanneer er ook gelogd wordt —
// zonder logboek valt er niets terug te kijken.
const analyse = webPort == null || logDir === '' ? null : new DivergenceCache({ logDir });

/*
 * De onboarding bestaat alleen achter Ingress.
 *
 * Dit is de schakelaar uit besluit 42, en hij staat hier en niet in de server:
 * de server weet niet waar hij draait, `main.ts` wel. Zonder Supervisor is er
 * geen inlog voor de pagina, en dan hoort er geen route te bestaan die
 * bestanden wegschrijft — ook niet een die niemand aanroept.
 */
/*
 * Buiten de add-on kan het ook, maar dan moet je het zeggen.
 *
 * Dezelfde vorm als `HEMS_WEB_PORT`: luisteren is een keuze die je maakt, niet
 * iets wat je overkomt. Zonder deze schakelaar zou de onboarding alleen achter
 * Ingress bestaan en dus nergens uit te proberen zijn — en een deur die je niet
 * kunt testen, test je op de draaiende dienst.
 *
 * Wie hem aanzet zonder inlog ervoor, zet een pagina op zijn netwerk die
 * bestanden wegschrijft. Vandaar de waarschuwing bij het starten.
 */
if (opstart.onboarding.zonderIngress) {
  console.warn('LET OP: de onboarding staat aan zonder Ingress ervoor.');
  console.warn('  Deze weergave heeft geen inlog. Doe dit alleen op een machine');
  console.warn('  waar je zelf bij bent, en zet HEMS_ONBOARDING daarna weer uit.');
}

const onboarding =
  opstart.onboarding.aan
    ? new Onboarding({
        registers: () => haalRegisters(client, laatsteStates),
        sitesDir: opstart.sitesDir ?? join(process.cwd(), 'config', 'sites'),
        knownStrategies: strategies.ids,
      })
    : null;

if (webPort != null) {
  web = new WebServer({
    port: webPort,
    host: opstart.web.host,
    webDir,
    config: site?.config ?? null,
    latest: () => runner?.latest ?? null,
    ...(analyse ? { divergence: () => analyse.latest } : {}),
    // Alleen wanneer er werkelijk gelogd wordt; anders geen exportknop.
    ...(logDir === '' ? {} : { logDir }),
    ...(onboarding ? { onboarding } : {}),
    versie: versieUitOmgeving(process.env),
  });
}

console.log('─'.repeat(64));
console.log('  SCHADUWMODUS — de arbiter denkt mee, maar schakelt niets');
console.log('─'.repeat(64));
console.log(
  `  Home Assistant   ${url}${alsAddon ? '  (via de Supervisor, geen eigen token)' : ''}`,
);
console.log(`  configuratie     ${site?.source ?? 'nog geen — wachtend op de onboarding'}`);
if (site) {
  console.log(
    `  installatie      ${site.config.id} — ${site.config.zones.length} zones, ${site.config.actuators.length} apparaten`,
  );
}
console.log(`  instellingen     ${loadedFrom ?? 'uit de omgeving'}`);
console.log(`  hartslag         ${tickSeconds} s`);
console.log(`  min. interval    ${opstart.minIntervalSeconds} s tussen twee evaluaties`);
console.log(
  `  bewaking         ${opstart.watchdogMinutes > 0 ? `afsluiten na ${opstart.watchdogMinutes} min zonder besluit` : 'uit'}`,
);
console.log(`  logboek          ${logDir}/decisions-JJJJ-MM-DD.ndjson`);
console.log(`  schrijfrechten   ${client.writesAllowed ? 'AAN' : 'uit'}`);
console.log(
  `  webweergave      ${
    webPort == null
      ? 'uit — deze dienst luistert nergens op'
      : `poort ${webPort}, ${onboarding ? 'lezen plus de onboarding' : 'alleen lezen'}`
  }`,
);
console.log('─'.repeat(64));

if (site && site.warnings.length > 0) {
  console.log('  Let op in de configuratie:');
  for (const warning of site.warnings) console.log(warning);
  console.log('─'.repeat(64));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nafsluiten…');
    runner?.stop();
    analyse?.stop();
    void web?.stop().finally(() => process.exit(0));
    if (web == null) process.exit(0);
  });
}

if (web) {
  try {
    const port = await web.start();
    console.log(`  weergave luistert op http://localhost:${port}/`);
    console.log(`  frontend uit     ${webDir}`);
    if (analyse) {
      // Meteen beginnen, zodat de tijdlijn er staat voordat iemand kijkt.
      analyse.start();
      console.log(`  logboekanalyse   elk kwartier over ${logDir}`);
    }
    console.log('─'.repeat(64));
  } catch (error) {
    // Een bezette poort is een opstartfout, geen reden om zonder venster door
    // te draaien: dan denk je dat het dashboard kapot is terwijl de dienst
    // gewoon nooit is gaan luisteren (besluit 7).
    console.error(`Kan niet luisteren op poort ${webPort}: ${String(error)}`);
    process.exit(1);
  }
}

if (runner) {
  runner.start();
} else {
  // Geen configuratie, dus niets om te beslissen. Wel verbinden: de onboarding
  // heeft de registers nodig, en die komen over deze socket.
  client.connect();
}
