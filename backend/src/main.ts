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

import { Stem } from './web/stem.js';
import { doelenBinnenBereik, rollenUitConfig, withRegeling } from './web/regeling.js';
import { MeldingenStore } from './web/meldingen.js';
import { NIEUW, VERSIE } from './version.js';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';


import { ConfigError, loadSiteConfig } from './config/load.js';
import { parseSiteConfig } from './config/schema.js';
import type { DeviceRef, MeasurementPoint, SiteConfig } from './core/model.js';
import { HaClient, type HaEntityState } from './adapters/homeassistant/client.js';
import {
  fetchRegistries,
  type HaArea,
  type HaCoreConfig,
  type HaDevice,
  type HaFloor,
  type HaRegistryEntity,
} from './adapters/homeassistant/discovery.js';
import { buildHouse, houseBeforeSetup, knownForLayout, proposeLayout, type HouseRegisters } from './web/house.js';
import { LayoutStore, herstelMeedoen, withLayoutNames, type Layout } from './web/layout.js';
import { withHeatSources } from './web/warmte.js';
import { noteSensors, readLayoutFile, withMeasurement } from './web/meten.js';
import { ComfortStore, controleerComfort, withComfort, type Comfort, type ComfortRoom, type ComfortView } from './web/comfort.js';
import { BewonersStore, GEEN_BEWONERS, bewonersView, comfortVanBewoner, gastStand, persoonsAccount, herken as herkenBewoner, hoofdVan, leesActie, namenVoorExport, personenUit, profielenVoor, vasthoudenVoorbij, voerUit, zonderVasthoudenVan, type Bewoners, type Wie } from './web/bewoners.js';
import { BACKUP_DIR, OPNIEUW_STARTEN, beginOpnieuw, bewaarBackup, bewaardeBackups, leesBackup, maakBackup, zetTerug } from './web/gegevens.js';
import { entiteitenLijst, type AnalyseExtra } from './web/export.js';
import { UitstelStore } from './web/uitstel.js';
import { VoorkeurenStore } from './web/voorkeuren.js';
import { SceneColorStore, colorsFromLamps } from './web/scene-colors.js';
import { ScenePictures } from './web/scene-pictures.js';
import { EnergyStore } from './web/energy.js';
import { partsIn, zonedMidnight, type PowerRow } from './web/today.js';
import { forecastFromEntity, readForecast, WeatherLog, type EntityForecast } from './web/weather.js';
import { OPEN_METEO, OpenMeteo } from './web/open-meteo.js';
import { httpBase } from './web/camera.js';
import { Pauze } from './web/taalmodel.js';
import { spraakKeuzes, type SpraakKeuze } from './web/functies.js';
import { FunctiesStore, aangebeld, functiesGevonden, functiesVoorstel, getoondeCameras, volledig, type Functies, type FunctiesGevonden } from './web/functies.js';
import { ConnectionStore, SensorPace, connectionView, findAppliances, findPhases, withConnection, type Applied } from './web/aansluiting.js';
import { kiesLigging, meetLigging, omvormerUitType, type Meting } from './web/ligging.js';
import { alarmSensoren, vindRookmelders } from './web/rookmelders.js';
import { haEnergySource } from './adapters/homeassistant/energy.js';
import type { DeferrableStateCode } from './core/decision.js';
import { CoverSwitch } from './web/covers.js';
import { LightSwitch } from './web/lights.js';
import { SessionStore, haBeheerders, homeAssistantLogin, leesOfMaakSleutel, type Access, type HaAccount } from './web/auth.js';
import { ShadowRunner, type LiveSnapshot } from './adapters/homeassistant/shadow.js';
import { defaultStrategies } from './index.js';
import { WebServer, defaultWebDir, versionFromEnv, type AlarmMelder } from './web/server.js';
import { readStartup } from './startup.js';
import { DivergenceCache } from './web/divergence.js';
import { configFingerprint, recordRun } from './adapters/runs.js';
import { Onboarding } from './web/onboarding.js';
import { FeedbackLog } from './web/feedback.js';

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
  const days = Number(process.argv[i + 1] ?? 180);
  const source = resolve(process.argv[i + 2] ?? process.env['SHADOW_LOG_DIR'] ?? 'data/shadow');
  const target = resolve(process.argv[i + 3] ?? 'data/bench');
  const { makeWinter } = await import('./web/makeWinter.js');
  process.exit(await makeWinter(days, source, target));
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
const startup = readStartup(process.env);
const { asAddon } = startup;
const { url, token } = startup.ha;
if (startup.haProblems.length > 0) fail(startup.haProblems);
if (startup.errors.length > 0) {
  console.error('Kan de schaduwmodus niet starten:');
  console.error('');
  for (const error of startup.errors) console.error(`  ${error}`);
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

const complaint = asAddon ? null : tokenComplaint(token!);
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
  const target = arg != null && !arg.startsWith('--') ? resolve(arg) : null;
  const { discoverCli } = await import('./adapters/homeassistant/discoverCli.js');
  process.exit(await discoverCli({ url: url!, token: token!, target }));
}

const { tickSeconds, logDir } = startup;

/*
 * De webweergave staat standaard uit.
 *
 * Deze dienst houdt het HA-token vast en draait maanden onbewaakt. Luisteren
 * is dus een keuze die je maakt, niet iets wat je overkomt door hem te
 * starten. De compose op de NAS zet de poort; een losse `npm run shadow`
 * blijft dicht.
 */
const webPort = startup.web.port;
const webDir = startup.web.dir ?? defaultWebDir(packageRoot);

const strategies = defaultStrategies();

// De configuratie wordt hier gelezen én gecontroleerd. Een fout erin is een
// opstartfout met een aanwijzing, niet een storing die zich pas 's nachts laat
// zien wanneer de regeling iets onmogelijks probeert.
let site: Awaited<ReturnType<typeof loadSiteConfig>> | undefined;
try {
  site = await loadSiteConfig({
    explicitPath: startup.configPath ?? undefined,
    siteId: startup.siteId ?? undefined,
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
  if (error instanceof ConfigError && error.kind === 'ontbreekt' && startup.onboarding.enabled) {
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

/*
 * De zon en je aansluiting (besluit 103): de antwoorden uit de app vullen de
 * configuratie aan waar die zwijgt, zoals de zekering en apparaten op zon. Bij
 * het starten, en alleen als het resultaat door het eigen schema komt; anders
 * draait de dienst zoals het bestand zegt. Wat het bestand noemt, gaat voor.
 */
const connectionStore = logDir !== '' ? new ConnectionStore(logDir) : null;
const answersAtStart = (await connectionStore?.load()) ?? null;
const baseConfig = site?.config ?? null;
let connectionApplied: Pick<Applied, 'toegevoegd' | 'overgeslagen'> = { toegevoegd: [], overgeslagen: [] };
if (site && answersAtStart) {
  try {
    const applied = withConnection(JSON.parse(await readFile(site.source, 'utf-8')) as Record<string, unknown>, answersAtStart);
    const checked = applied.toegevoegd.length > 0 ? parseSiteConfig(applied.raw, { knownStrategies: strategies.ids }) : null;
    if (checked == null) connectionApplied = applied;
    else if (checked.ok) {
      site = { ...site, config: checked.config };
      connectionApplied = applied;
    } else {
      const first = checked.problems[0];
      connectionApplied = {
        toegevoegd: [],
        overgeslagen: [...applied.overgeslagen, `de antwoorden passen niet in de configuratie (${first ? `${first.path}: ${first.message}` : 'onbekend'})`],
      };
    }
  } catch {
    // Het bestand was net te lezen; lukt het nu niet, dan zoals het was.
  }
  for (const t of connectionApplied.toegevoegd) console.log(`Uit de app (aansluiting.json): ${t}`);
  for (const t of connectionApplied.overgeslagen) console.warn(`Uit de app niet overgenomen: ${t}`);
}

/*
 * Meten met (besluit 123): de sensoren die de bewoner per kamer koos, na de
 * aansluiting. Ook hier: alleen als het resultaat door het schema komt. Daarna
 * in het logboek welke sensoren per zone meetellen, als dat anders is dan de
 * vorige start.
 */
// De indeling zoals hij bij het starten was: comfort (besluit 130) bouwt erop voort.
let layoutAtStart: Awaited<ReturnType<typeof readLayoutFile>> = null;
if (site && logDir !== '') {
  try {
    layoutAtStart = await readLayoutFile(logDir);
    const base = JSON.parse(await readFile(site.source, 'utf-8')) as Record<string, unknown>;
    const metAansluiting = answersAtStart && connectionApplied.toegevoegd.length ? withConnection(base, answersAtStart).raw : base;
    const metMeten = withMeasurement(metAansluiting, layoutAtStart);
    if (metMeten.toegevoegd.length) {
      const checked = parseSiteConfig(metMeten.raw, { knownStrategies: strategies.ids });
      if (checked.ok) {
        site = { ...site, config: checked.config };
        for (const t of metMeten.toegevoegd) console.log(`Uit de app (indeling.json): ${t}`);
      } else {
        console.warn(`Meten met uit de app niet overgenomen: ${checked.problems[0]?.path ?? ''} ${checked.problems[0]?.message ?? ''}`);
      }
    }
  } catch {
    // Niet te lezen: dan meet elke zone zoals de configuratie zegt.
  }
  if (site) await noteSensors(logDir, site.config, Date.now()).catch(() => false);
}

/*
 * Comfort uit de app (besluit 130): de temperaturen per kamer en de dagdelen,
 * over alles hierboven. Bij het starten, en daarna meteen als de bewoner iets
 * verandert: dan neemt de regeling het over zonder herstart.
 */
const comfortStore = logDir !== '' ? new ComfortStore(logDir) : null;
await comfortStore?.load();
/* Bewoners (besluit 147): wie hier woont, op volgorde, met elk een eigen comfort of dat van de hoofdgebruiker. */
const bewonersStore = logDir !== '' ? new BewonersStore(logDir) : null;
await bewonersStore?.load();
/** De ruwe configuratie met alles wat de app erover legt, en comfort zoals gegeven. */
async function configWithComfort(comfort: Comfort | null, bewoners: Bewoners = bewonersStore?.current ?? GEEN_BEWONERS): Promise<{ ok: true; config: SiteConfig; toegevoegd: string[] } | { ok: false; reden: string }> {
  if (!site) return { ok: false, reden: 'er is geen configuratie' };
  const base = JSON.parse(await readFile(site.source, 'utf-8')) as Record<string, unknown>;
  const metAansluiting = answersAtStart && connectionApplied.toegevoegd.length ? withConnection(base, answersAtStart).raw : base;
  // Meten met (besluit 123) uit de indeling van nu: de regeling neemt een andere sensor meteen over (138).
  const layout = layoutNu?.() ?? layoutAtStart;
  // De regeling per kamer uit de app (besluit 138): welke apparaten een kamer regelen, en hoe.
  const metRegeling = withRegeling(metAansluiting, layout?.kamers ?? null, {
    state: (id) => allStates.get(id),
    vermogenSensor,
    kamerVan: (id) => layout?.apparaten[id]?.kamer ?? null,
  });
  for (const t of metRegeling.overgeslagen) console.warn(`Regeling uit de app: ${t}`);
  // Meten met (besluit 123) uit de indeling van nu: de regeling neemt een andere sensor meteen over (138).
  const metMeten = withMeasurement(metRegeling.raw, layout).raw;
  // De bronnen per kamer (besluit 132): uit de indeling van nu, want op zon gaat meteen in.
  const metBronnen = withHeatSources(metMeten, (layoutNu?.() ?? layoutAtStart)?.kamers ?? null);
  const metComfort = withComfort(metBronnen.raw, comfort);
  // Comfort per bewoner (besluit 147): de profielen op volgorde, en "toch die van" als iemand dat koos.
  const zoneIds = new Set((Array.isArray(metComfort.raw['zones']) ? (metComfort.raw['zones'] as Record<string, unknown>[]) : []).map((z) => String(z['id'])));
  const profiles = profielenVoor(bewoners, comfort, site.config.occupancy, zoneIds);
  if (profiles.length > 0) {
    metComfort.raw = { ...metComfort.raw, profiles, ...(bewoners.vasthouden ? { profileHold: { id: bewoners.vasthouden.id, home: bewoners.vasthouden.home } } : {}) };
    metComfort.toegevoegd.push(`comfort per bewoner: ${profiles.map((x) => x.name).join(', ')}`);
  }
  // Een kamer die een apparaat kwijtraakte (besluit 138): doelen binnen wat de apparaten kunnen.
  const checked = parseSiteConfig(metRegeling.toegevoegd.length || (layout?.kamers ?? []).some((k) => k.rollen) ? doelenBinnenBereik(metComfort.raw) : metComfort.raw, { knownStrategies: strategies.ids });
  if (!checked.ok) return { ok: false, reden: `${checked.problems[0]?.path ?? ''} ${checked.problems[0]?.message ?? 'past niet'}`.trim() };
  return { ok: true, config: checked.config, toegevoegd: [...metRegeling.toegevoegd, ...metBronnen.toegevoegd, ...metComfort.toegevoegd] };
}
/** De indeling van nu, zodra de opslag er is; daarvoor die van het starten. */
let layoutNu: (() => Layout | null) | null = null;
if (site && (comfortStore?.current || (bewonersStore?.current.volgorde.length ?? 0) > 0 || (layoutAtStart?.kamers ?? []).some((k) => k.rollen || (k.bronnen ?? []).some((b) => b.opZon)))) {
  try {
    const met = await configWithComfort(comfortStore?.current ?? null);
    if (met.ok) {
      site = { ...site, config: met.config };
      for (const t of met.toegevoegd) console.log(`Uit de app (comfort.json, indeling.json): ${t}`);
    } else {
      console.warn(`Comfort uit de app niet overgenomen: ${met.reden}`);
    }
  } catch {
    // Niet te lezen: dan zoals de configuratie zegt.
  }
}

const client = new HaClient({
  url: url!,
  token: token!,
  // Schaduwmodus: expliciet geen schrijfrechten.
  allowWrites: false,
  // Behalve lampen aan en uit vanuit de app, als dat mag (besluit 97). De client
  // laat dan precies light.turn_on en light.turn_off op lampen door, niets anders.
  allowLights: startup.lights.enabled,
  // Scènes horen bij het licht (besluit 100): dezelfde schakelaar, een eigen deur.
  allowScenes: startup.lights.enabled,
  // Schermen open, dicht, stop of een stand, voor de bewoner (besluit 121). De
  // regeling stuurt hier niets doorheen.
  allowCovers: startup.screens.enabled,
  // Een AI-taak om een tekst vragen (besluit 148): de assistent in eigen woorden.
  // Er verandert niets in het huis; welke taak, kiest de bewoner bij Functies.
  allowAiTask: true,
  // Geluid laten uitschrijven, tot tekst en niet verder (besluit 150): de microfoon en "Hé huis".
  allowListen: true,
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
/** Welke code er draait (besluit 54); gaat naar /api/health en runs.ndjson. */
const version = versionFromEnv(process.env);

let lastStates: readonly HaEntityState[] = [];

/*
 * De ligging van het huis, voor de stand van de zon (besluit 93).
 *
 * Eén decimaal, ongeveer tien kilometer: genoeg voor de zon, niet genoeg om het
 * huis te vinden (besluit 90). Alleen in het geheugen; hij gaat niet naar het
 * logboek, de export of de console.
 */
let location: { latDeg: number; lonDeg: number } | null = null;
const round1 = (n: number) => Math.round(n * 10) / 10;

/*
 * Het huis als navigatie (ONTWERP §4): lampen en zonwering per ruimte.
 *
 * De regeling volgt alleen de entiteiten uit de configuratie; voor het huis
 * houdt dit kaartje de stand van alle lampen en screens bij, uit dezelfde
 * stroom. De registers (etages, ruimtes, apparaten) worden bij elke verbinding
 * en daarna elk kwartier opnieuw gelezen: zo komt een verhuisde lamp vanzelf
 * mee. Alleen lezen.
 */
const houseStates = new Map<string, HaEntityState>();
// Alle standen, voor de namen van meters en een prijs uit een entiteit (besluit 102).
const allStates = new Map<string, HaEntityState>();

/** Per AI-taak een pauze na "gebruik op" of "te druk" (besluit 148). */
const pauzes = new Map<string, Pauze>();
function pauzeVan(id: string): Pauze {
  let p = pauzes.get(id);
  if (!p) pauzes.set(id, (p = new Pauze()));
  return p;
}
// Lampen en screens, klimaat, en sensoren die temperatuur of luchtvochtigheid meten.
const inHouse = (st: HaEntityState) =>
  st.entity_id.startsWith('light.') ||
  st.entity_id.startsWith('cover.') ||
  st.entity_id.startsWith('climate.') ||
  // De scènes van Hue, voor de ruimtes (besluit 100).
  st.entity_id.startsWith('scene.') ||
  // De camera's (besluit 106): anders zei het huis "niet bereikbaar" terwijl er beeld was.
  st.entity_id.startsWith('camera.') ||
  // Beweging, voor de kamer en het huis (15 oktober 2026).
  (st.entity_id.startsWith('binary_sensor.') && ['motion', 'occupancy', 'presence'].includes(String(st.attributes['device_class']))) ||
  // Rookmelders (21 oktober 2026): rook, koolmonoxide, hitte en een batterij die op is.
  (st.entity_id.startsWith('binary_sensor.') && ['smoke', 'carbon_monoxide', 'heat', 'battery'].includes(String(st.attributes['device_class']))) ||
  // En wanneer een melder getest is en vervangen moet.
  (st.entity_id.startsWith('sensor.') && ['date', 'timestamp'].includes(String(st.attributes['device_class'])) && /replace|test/.test(st.entity_id)) ||
  (st.entity_id.startsWith('sensor.') &&
    (st.attributes['device_class'] === 'temperature' ||
      st.attributes['device_class'] === 'humidity' ||
      // Batterijen (besluit 122): bij het apparaat, en een melding onder de 10%.
      st.attributes['device_class'] === 'battery' ||
      // Wat een apparaat nu vraagt, voor Apparaten (15 oktober 2026).
      st.attributes['device_class'] === 'power' ||
      st.attributes['device_class'] === 'energy' ||
      // De klep van een radiatorknop (besluit 126), en het filter van een airco (129).
      /valve|klep|filter/i.test(st.entity_id)));
let houseRegisters: HouseRegisters | null = null;
/** De stroommeter bij hetzelfde apparaat in Home Assistant, zoals bij een airco (besluit 138). */
function vermogenSensor(entityId: string): string | null {
  const device = houseRegisters?.entities.find((e) => e.entity_id === entityId)?.device_id;
  if (!device) return null;
  const meter = houseRegisters!.entities.find(
    (e) => e.device_id === device && e.entity_id.startsWith('sensor.') && !e.disabled_by && allStates.get(e.entity_id)?.attributes['device_class'] === 'power',
  );
  return meter?.entity_id ?? null;
}
async function readHouseRegisters(): Promise<void> {
  const [floors, areas, devices, entities] = await Promise.all([
    client.query<HaFloor[]>('config/floor_registry/list').catch(() => [] as HaFloor[]),
    client.query<HaArea[]>('config/area_registry/list'),
    client.query<HaDevice[]>('config/device_registry/list'),
    client.query<HaRegistryEntity[]>('config/entity_registry/list'),
  ]);
  houseRegisters = { floors, areas, devices, entities };
  // Ging er al een rookmelder af voor de dienst startte: dan ook (21 oktober 2026).
  setTimeout(() => web?.alarm(alarmNu()), 2_000).unref?.();
}
// Hoe vaak de zonnesensor een nieuwe waarde geeft (besluit 89), overdag gemeten.
const solarPace = new SensorPace();
/*
 * Camera's en de deurbel (besluit 109): wat de bewoner vastlegde, of anders het
 * voorstel uit wat Home Assistant heeft. Het voorstel wordt opnieuw bepaald als
 * de registers veranderen, niet bij elke toestand: er komen er duizenden per uur.
 */
const functiesStore = logDir !== '' ? new FunctiesStore(logDir) : null;
await functiesStore?.load();
/** De spraakassistenten in Home Assistant (besluit 150), bij het verbinden en elke vijf minuten. */
let spraakLijst: SpraakKeuze[] = [];
async function spraakBij(): Promise<void> {
  try {
    spraakLijst = spraakKeuzes(await client.query('assist_pipeline/pipeline/list'));
  } catch {
    // Geen spraakassistenten (of een oudere Home Assistant): dan kan de microfoon niet.
  }
}
client.on('ready', () => void spraakBij());
setInterval(() => void spraakBij(), 5 * 60_000).unref();
let gevondenVoor: HouseRegisters | null = null;
let gevondenNu: FunctiesGevonden | null = null;
const functiesKeuzes = (): FunctiesGevonden | null => {
  if (!houseRegisters) return null;
  if (gevondenVoor !== houseRegisters || gevondenNu == null) {
    gevondenNu = functiesGevonden(houseRegisters.entities, houseRegisters.devices, allStates);
    gevondenVoor = houseRegisters;
  }
  // De spraakassistenten (besluit 150) komen apart: die vraagt de dienst Home Assistant zelf.
  return { ...gevondenNu, spraakassistenten: spraakLijst };
};

/**
 * De andere beelden van dezelfde camera, het lichtste eerst (21 oktober 2026):
 * gaf het gekozen beeld van de deurbel niets, dan bleef het scherm zwart.
 */
const reserveBeelden = (camera: string): string[] => {
  const groep = functiesKeuzes()?.cameras.find((c) => c.beelden.some((b) => b.id === camera));
  return (groep?.beelden ?? []).filter((b) => b.id !== camera).sort((a, b) => Number(b.voorkeur) - Number(a.voorkeur)).map((b) => b.id);
};

const functiesNu = (): Functies | null => {
  if (functiesStore?.current) return functiesStore.current;
  const g = functiesKeuzes();
  return g ? functiesVoorstel(g) : null;
};
client.on('stateChanged', (state: HaEntityState) => {
  // Aanbellen: de melder van de deurbel gaat af. Dan toont elke open pagina het beeld.
  const f = functiesNu();
  if (f && aangebeld(f, state, allStates.get(state.entity_id))) {
    const camera = f.deurbel.camera!;
    const naam = functiesKeuzes()?.cameras.find((c) => c.beelden.some((b) => b.id === camera))?.naam ?? 'Deurbel';
    web?.ring(camera, naam, { seconden: f.deurbel.seconden, schermAan: f.deurbel.schermAan, reserve: reserveBeelden(camera) });
  }
  // Een rookmelder ziet rook, koolmonoxide of hitte, of niet meer (21 oktober 2026): elk open scherm.
  if (houseRegisters && state.entity_id.startsWith('binary_sensor.') && state.state !== allStates.get(state.entity_id)?.state && alarmSensoren(vindRookmelders(houseRegisters.entities, houseRegisters.devices, allStates)).has(state.entity_id)) {
    // Na deze ronde: dan kent het huis de nieuwe stand al.
    setTimeout(() => {
      web?.alarm(alarmNu());
      // Meteen bij Meldingen, niet pas over een minuut.
      meldingenRonde();
    }, 0);
  }
  // De wand wekken (besluit 164): de gekozen bewegingsmelder ziet iemand.
  if (state.entity_id === voorkeuren?.melder() && state.state === 'on' && allStates.get(state.entity_id)?.state !== 'on') web?.wek('beweging');
  if (inHouse(state)) houseStates.set(state.entity_id, state);
  allStates.set(state.entity_id, state);
  const solar = baseConfig?.solarProduction;
  if (solar && state.entity_id === solar.id) {
    solarPace.note(Date.now(), Number(solar.attribute ? state.attributes[solar.attribute] : state.state));
  }
});
setInterval(() => void readHouseRegisters().catch(() => {}), 15 * 60_000).unref();

client.on('ready', (states: HaEntityState[]) => {
  lastStates = states;
  for (const s of states) {
    if (inHouse(s)) houseStates.set(s.entity_id, s);
    allStates.set(s.entity_id, s);
  }
  void readHouseRegisters()
    .then(() => {
      // Een apparaat uit Home Assistant in de regeling (besluit 138) kan pas met zijn stand erbij.
      if ((layoutNu?.()?.kamers ?? []).some((k) => Object.entries(k.rollen ?? {}).some(([id, r]) => r !== 'kijken' && id.startsWith('climate.')))) void herlaadUitDeApp('de verbinding');
    })
    .catch(() => {
      // Zonder registers is er geen huis te tonen; de volgende verbinding opnieuw.
    });
  if (location == null) {
    client
      .query<HaCoreConfig>('get_config')
      .then((c) => {
        if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
          location = { latDeg: round1(c.latitude), lonDeg: round1(c.longitude) };
        }
      })
      .catch(() => {
        // Zonder ligging valt alleen de zoninval weg; volgende verbinding opnieuw.
      });
  }
});

/*
 * "Klaar voor" bij de droger (besluit 101): alleen met een logmap, want het
 * bestand staat naast de dataset, en alleen als er een uitstelbaar apparaat is.
 * Vóór de dienst, zodat die het bij elk besluit kan lezen.
 */
const uitstelStore: UitstelStore | null =
  logDir !== '' && site && (site.config.deferrables ?? []).length > 0
    ? new UitstelStore({
        logDir,
        config: site.config,
        status: (id): DeferrableStateCode | null => runner?.latest?.explanation.deferrables?.find((d) => d.id === id)?.state ?? null,
        onChange: () => runner?.nudge('uitstel'),
      })
    : null;
await uitstelStore?.load();

/* Meters en prijzen voor Opbrengst (besluit 102): naast de dataset, dus alleen met een logmap. */
const energyStore = logDir !== '' ? new EnergyStore(logDir) : null;
await energyStore?.load();

const runner: ShadowRunner | null =
  site == null
    ? null
    : new ShadowRunner({
        config: site.config,
        strategies,
        client,
        tickSeconds,
        minIntervalSeconds: startup.minIntervalSeconds,
        watchdogMinutes: startup.watchdogMinutes,
        logDir,
        ...(uitstelStore ? { readyBy: () => uitstelStore.readyBy } : {}),
        ...(webPort == null
          ? {}
          : {
              onDecision: (snapshot: LiveSnapshot) => {
                // Een eindtijd vervalt als het programma klaar is of de deur openging.
                void uitstelStore?.prune(snapshot.explanation.deferrables);
                web?.publish(snapshot);
              },
            }),
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
if (startup.onboarding.withoutIngress) {
  console.warn('LET OP: de onboarding staat aan zonder Ingress ervoor.');
  // Met de inlog van besluit 99 vraagt hij een beheerder; open is hij voor iedereen.
  console.warn(
    startup.access.kind === 'open'
      ? '  Deze weergave staat open (HEMS_OPEN). Doe dit alleen op een machine'
      : '  Alleen een beheerder in Home Assistant kan hem gebruiken. Doe dit toch alleen',
  );
  console.warn(startup.access.kind === 'open' ? '  waar je zelf bij bent, en zet HEMS_ONBOARDING daarna weer uit.' : '  als je hem nodig hebt, en zet HEMS_ONBOARDING daarna weer uit.');
}

const onboarding =
  startup.onboarding.enabled
    ? new Onboarding({
        registers: () => fetchRegistries(client, lastStates),
        sitesDir: startup.sitesDir ?? join(process.cwd(), 'config', 'sites'),
        knownStrategies: strategies.ids,
      })
    : null;

// Na het laden; comfort uit de app (besluit 130) kan hem later vervangen.
let siteConfig = site?.config ?? null;

/*
 * De indeling van het huis (besluit 96): alleen als er gelogd wordt, want hij
 * staat naast de dataset, en alleen met een configuratie.
 */
const layoutStore =
  logDir !== '' && siteConfig
    ? new LayoutStore({
        logDir,
        known: () => (houseRegisters ? knownForLayout(siteConfig!, houseRegisters, houseStates) : null),
        // Een bron die op zon mag (besluit 132): de regeling neemt het meteen over, net als comfort.
        onSaved: () => void herlaadUitDeApp('de indeling'),
      })
    : null;
layoutNu = () => layoutStore?.current ?? layoutAtStart;
/*
 * De eenmalige overstap (besluit 138): wat het bestand per zone zegt, komt als
 * rollen in de indeling. Daarna is de app de plek; het bestand houdt alleen
 * wat de app nog niet kent.
 */
async function rollenOvernemen(l: Layout | null): Promise<void> {
  if (!l || !site || l.kamers.some((k) => k.rollen !== undefined)) return;
  const base = JSON.parse(await readFile(site.source, 'utf-8')) as Record<string, unknown>;
  const raw = answersAtStart && connectionApplied.toegevoegd.length ? withConnection(base, answersAtStart).raw : base;
  const over = await layoutStore!.overnemen((x) => ({
    ...x,
    kamers: x.kamers.map((k) => {
      const rollen = rollenUitConfig(raw, k.regelzone);
      return rollen ? { ...k, rollen } : k;
    }),
  }));
  if (over) console.log(`Uit het bestand naar de app (besluit 138): ${over.kamers.filter((k) => k.rollen).map((k) => k.naam).join(', ')}`);
}
// Daarna het herstel van "Geregeld als" (besluit 142), ook voor wat al bewaard staat; na elkaar, zodat de een de ander niet overschrijft.
void layoutStore?.load().then(rollenOvernemen).then(async () => {
  const hersteld = await layoutStore!.overnemen((x) => ({ ...x, kamers: herstelMeedoen(x.kamers) }));
  if (hersteld) console.log(`Hersteld (besluit 142): ${hersteld.kamers.filter((k) => k.meedoenMet).map((k) => `${k.naam} doet mee met ${hersteld.kamers.find((x) => x.id === k.meedoenMet)?.naam}`).join(', ')}`);
});

/** Alles uit de app opnieuw over de configuratie, en de regeling neemt het over als het kan. */
async function herlaadUitDeApp(waarom: string): Promise<void> {
  try {
    const met = await configWithComfort(comfortStore?.current ?? null);
    if (!met.ok) return console.warn(`Na ${waarom}: niet overgenomen, ${met.reden}`);
    // Met de stand van nu kan de regeling ook andere sensoren en apparaten meteen volgen (besluit 138).
    if (runner && !runner.setConfig(met.config, allStates.values())) return console.warn(`Na ${waarom}: de regeling neemt het over na de volgende start`);
    siteConfig = met.config;
    if (logDir !== '') await noteSensors(logDir, met.config, Date.now()).catch(() => false);
  } catch {
    // Niet te lezen: dan blijft het zoals het was.
  }
}

/* De kleuren van de Hue-scènes, zoals de lampen ze lieten zien (besluit 100). */
const sceneColors = logDir !== '' ? new SceneColorStore(logDir) : null;
await sceneColors?.load();
// Plaatjes die de bewoner zelf in logs/scene-plaatjes/ zette; elke tien minuten opnieuw gelezen.
const scenePictures = logDir !== '' ? new ScenePictures(logDir) : null;
await scenePictures?.refresh();
if (scenePictures) setInterval(() => void scenePictures.refresh(), 10 * 60_000).unref();

/*
 * Hoe de panelen liggen (besluit 157): de opbrengst van de afgelopen tien
 * dagen, per vijf minuten uit de statistiek van Home Assistant (zo lang bewaart
 * hij die), om de drie uur opnieuw. De meting rekent opnieuw als de antwoorden
 * over het dak veranderen. Alleen lezen, met dezelfde vraag als Opbrengst.
 */
let liggingRijen: { at: number; rijen: PowerRow[] } | null = null;
async function leesLigging(): Promise<void> {
  const p = siteConfig?.solarProduction;
  if (!p || ('attribute' in p && p.attribute)) return;
  const nu = Date.now();
  const raw = await client.query<Record<string, { start: number | string; mean?: number | null }[]>>('recorder/statistics_during_period', {
    start_time: new Date(nu - 10 * 86_400_000).toISOString(),
    end_time: new Date(nu).toISOString(),
    statistic_ids: [p.id],
    period: '5minute',
    types: ['mean'],
    units: { power: 'W' },
  });
  const rijen = (raw?.[p.id] ?? [])
    .filter((r) => typeof r.mean === 'number' && Number.isFinite(r.mean))
    .map((r) => ({ startMs: typeof r.start === 'number' ? r.start : Date.parse(r.start), meanW: r.mean as number }));
  liggingRijen = { at: nu, rijen };
}
// Eerst kort na het verbinden, daarna om de drie uur; mislukt het, dan over tien minuten opnieuw.
setInterval(() => {
  if (liggingRijen == null || Date.now() - liggingRijen.at > 3 * 3_600_000) void leesLigging().catch(() => {});
}, 10 * 60_000).unref();
setTimeout(() => void leesLigging().catch(() => {}), 45_000).unref();

/** De omvormer uit zijn typenummer: van het apparaat van de zonnesensor, of de enige die er is. */
function omvormerGevonden(): number | null {
  const regs = houseRegisters;
  if (!regs) return null;
  const id = siteConfig?.solarProduction?.id;
  const device = id ? regs.entities.find((e) => e.entity_id === id)?.device_id : null;
  const eigen = device ? omvormerUitType(regs.devices.find((d) => d.id === device)?.model) : null;
  if (eigen != null) return eigen;
  const alle = [...new Set(regs.devices.map((d) => omvormerUitType(d.model)).filter((w): w is number => w != null))];
  return alle.length === 1 ? alle[0]! : null;
}

let metingBewaard: { sleutel: string; meting: Meting | null } | null = null;
/** De ligging gemeten uit de opbrengst, of null zonder heldere dag; bewaard tot er iets verandert. */
function metingNu(): Meting | null {
  const r = liggingRijen;
  const cfg = siteConfig;
  if (!r || !location || !cfg) return null;
  const a = connectionStore?.current ?? null;
  const panelen = a?.panelen ?? { ligging: null, aantal: null, voorkant: null, achterkant: null };
  const omvormerW = a?.dak?.omvormerW ?? omvormerGevonden();
  const sleutel = JSON.stringify([r.at, location, panelen, omvormerW]);
  if (metingBewaard?.sleutel !== sleutel) metingBewaard = { sleutel, meting: meetLigging(r.rijen, location, panelen, { timeZone: cfg.timezone, omvormerW }) };
  return metingBewaard.meting;
}

/**
 * De ligging die geldt, over de configuratie: wat de bewoner bevestigde gaat
 * voor (zoals de zekering, besluit 117), dan het bestand, dan de meting, dan
 * een schatting. De regeling leest hem niet (93), dus dit kan zonder herstart.
 */
let liggingBewaard: { sleutel: string; gekozen: ReturnType<typeof kiesLigging> } | null = null;
function metLigging(c: SiteConfig): SiteConfig {
  const a = connectionStore?.current ?? null;
  const input = {
    configuratie: c.geometry,
    dak: a?.dak ?? null,
    meting: metingNu(),
    panelen: a?.panelen ?? null,
    voorkantZon: a?.voorkantZon ?? null,
    omvormerGevonden: omvormerGevonden(),
  };
  // Hetzelfde object zolang er niets verandert: de weercache kijkt ernaar.
  const sleutel = JSON.stringify(input);
  if (liggingBewaard?.sleutel !== sleutel) liggingBewaard = { sleutel, gekozen: kiesLigging(input) };
  const gekozen = liggingBewaard.gekozen;
  if (gekozen == null) {
    if (c.geometry == null) return c;
    const { geometry: _weg, ...zonder } = c;
    return zonder;
  }
  return gekozen.geometry === c.geometry ? c : { ...c, geometry: gekozen.geometry };
}

/** De configuratie zoals de app hem laat zien: met de namen en de volgorde uit de indeling (besluit 131). */
const webConfig = () => (siteConfig ? metLigging(withLayoutNames(siteConfig, layoutStore?.current ?? null)) : null);

/*
 * Meldingen in de app (besluit 136): elke minuut uit wat de dienst weet, naar
 * een eigen bestand naast de dataset. Niets naar Home Assistant.
 */
const meldingen = logDir !== '' ? new MeldingenStore({ logDir }) : null;
// Thuis naar eigen smaak (besluit 162): kaarten en favorieten, naast de dataset.
const voorkeuren = logDir !== '' ? new VoorkeurenStore(logDir) : null;
await voorkeuren?.load();
await meldingen?.load();
function meldingenRonde(): void {
  const cfg = siteConfig;
  const h = cfg ? houseReport() : null;
  if (!meldingen || !cfg || !h || allStates.size === 0) return;
  const entiteit = (d: { id: string; actuatorId: string | null }) =>
    d.actuatorId ? (cfg.actuators.find((a) => a.id === d.actuatorId)?.ref.id ?? null) : d.id.includes('.') ? d.id : null;
  const volgen = h.etages.flatMap((e) =>
    e.ruimtes.flatMap((r) =>
      r.apparaten.map((d) => {
        const id = entiteit(d);
        const st = id ? allStates.get(id) : undefined;
        return { id: d.id, naam: d.naam, kamer: r.naam, kamerId: r.id, onbereikbaarSindsMs: st && st.state === 'unavailable' ? Date.parse(st.last_changed) : null };
      }),
    ),
  );
  // Is bijna alles tegelijk weg, dan is Home Assistant zelf weg; dat is geen melding per apparaat.
  const weg = volgen.filter((v) => v.onbereikbaarSindsMs != null).length;
  if (volgen.length > 4 && weg > volgen.length / 2) return;
  const grid = cfg.power.gridPower;
  const gst = grid ? allStates.get(grid.id) : undefined;
  const nieuwste = NIEUW[0];
  meldingen.bij({
    nu: Date.now(),
    zonderRuimte: h.zonderRuimte.map((d) => ({ id: d.id, naam: d.naam })),
    volgen,
    batterijen: h.batterijen,
    filters: h.filters,
    // De rookmelders (21 oktober 2026): rook, een lege batterij, vervangen.
    rookmelders: h.etages.flatMap((e) => e.ruimtes.flatMap((r) => r.apparaten.filter((d) => d.soort === 'rookmelder' && d.rookmelder).map((d) => ({ id: d.id, naam: d.naam, kamer: r.naam, kamerId: r.id, gevaar: d.rookmelder!.gevaar, sindsMs: d.rookmelder!.sindsMs, batterijProbleem: d.rookmelder!.batterijProbleem, vervangenVoor: d.rookmelder!.vervangenVoor })))),
    drempels: h.drempels,
    meters: grid ? [{ id: grid.id, naam: 'De slimme meter', laatsteMs: gst && gst.state !== 'unavailable' && gst.state !== 'unknown' ? Date.parse(gst.last_updated) : null }] : [],
    versie: { nummer: VERSIE, ...(nieuwste ? { eerste: nieuwste.nieuw?.[0] ?? nieuwste.beter?.[0] ?? nieuwste.opgelost?.[0] ?? '' } : {}) },
    // Hoe de panelen liggen (besluit 157): gemeten, en nog niet bevestigd.
    panelen: { voorstel: connectionStore?.current?.dak == null && metingNu() != null },
    winterdagen: analyse?.latest?.dataset?.seizoenen?.find((s) => s.seizoen === 'winter')?.dagen ?? null,
    // Wiens comfort er geldt (besluit 147), voor één melding bij een wissel.
    comfort: (() => {
      const p = runner?.latest?.explanation.profile;
      const hoofd = bewonersStore ? hoofdVan(bewonersStore.current) : null;
      return p && hoofd ? { id: p.id, naam: p.name, waarom: p.reason, hoofdNaam: hoofd.naam, hoofd: p.id === hoofd.id } : null;
    })(),
  });
  void meldingen.bewaar().catch(() => undefined);
}
if (meldingen) {
  setTimeout(meldingenRonde, 30_000).unref();
  setInterval(meldingenRonde, 60_000).unref();
}

/*
 * Vandaag uit de statistiek van Home Assistant (17 oktober 2026): het vermogen
 * van de panelen en het net per vijf minuten, voor de kwartieren die het eigen
 * logboek nog niet heeft, zoals op de eerste dag van een nieuwe installatie.
 * Alleen lezen, met dezelfde vraag als Opbrengst. Vijf minuten bewaard; een
 * afgesloten dag (gisteren) verandert niet meer.
 */
const historieBewaard = new Map<number, { at: number; rijen: { zon: PowerRow[]; net: PowerRow[] } }>();
async function historieVan(vanMs: number, totMs: number): Promise<{ zon: PowerRow[]; net: PowerRow[] } | null> {
  const config = siteConfig;
  if (!config) return null;
  const punt = (p: MeasurementPoint | DeviceRef | undefined) => (p && !('attribute' in p && p.attribute) ? p.id : null);
  const zonId = punt(config.solarProduction);
  const netId = punt(config.power.gridPower);
  const ids = [zonId, netId].filter((x): x is string => x != null);
  if (ids.length === 0) return null;
  const bewaard = historieBewaard.get(vanMs);
  if (bewaard && (totMs < Date.now() - 3_600_000 || Date.now() - bewaard.at < 5 * 60_000)) return bewaard.rijen;
  const raw = await client.query<Record<string, { start: number | string; mean?: number | null }[]>>('recorder/statistics_during_period', {
    start_time: new Date(vanMs).toISOString(),
    end_time: new Date(Math.min(totMs, Date.now())).toISOString(),
    statistic_ids: ids,
    period: '5minute',
    types: ['mean'],
    units: { power: 'W' },
  });
  const rijen = (id: string | null): PowerRow[] =>
    id == null
      ? []
      : (raw?.[id] ?? [])
          .filter((r) => typeof r.mean === 'number' && Number.isFinite(r.mean))
          .map((r) => ({ startMs: typeof r.start === 'number' ? r.start : Date.parse(r.start), meanW: r.mean as number }));
  const uit = { zon: rijen(zonId), net: rijen(netId) };
  historieBewaard.set(vanMs, { at: Date.now(), rijen: uit });
  // Alleen vandaag en gisteren zijn nodig.
  for (const k of historieBewaard.keys()) if (k < vanMs - 2 * 86_400_000) historieBewaard.delete(k);
  return uit;
}

/** Welke rookmelders nu iets zien, met hun kamer (21 oktober 2026). */
function alarmNu(): AlarmMelder[] {
  const h = houseReport();
  return (h?.etages ?? []).flatMap((e) => e.ruimtes.flatMap((r) => r.apparaten.filter((d) => d.soort === 'rookmelder').map((d) => ({ id: d.id, naam: d.naam, kamer: r.naam, gevaar: d.rookmelder?.gevaar ?? null, sindsMs: d.rookmelder?.sindsMs ?? null }))));
}

const houseReport = () => {
  const h = siteConfig && houseRegisters
    ? buildHouse(
        webConfig()!,
        houseRegisters,
        houseStates,
        runner?.latest ?? null,
        layoutStore?.current ?? null,
        sceneColors ? (id, naam) => sceneColors.colors(id, naam) : undefined,
        scenePictures ? (naam) => scenePictures.pictureFor(naam) : undefined,
        // Alleen de camera's die de bewoner koos; zonder keuze het voorstel (elke camera).
        functiesStore?.current ? getoondeCameras(functiesStore.current) : null,
        // Wanneer een batterij of filter een melding geeft (besluit 149).
        functiesStore?.current?.meldingen,
      )
    : null;
  // Met de laatste opdracht bij een scherm zonder terugmelding (besluit 128).
  return coverSwitch ? coverSwitch.withLast(h) : h;
};

/*
 * Gaat een scène aan (zijn stand is het tijdstip), dan kijken we zes tellen
 * later naar de lampen van zijn Hue-groep, of anders van zijn ruimte, en
 * onthouden hun kleuren. Alleen lezen.
 */
client.on('stateChanged', (state: HaEntityState) => {
  if (!sceneColors || !state.entity_id.startsWith('scene.') || !Number.isFinite(Date.parse(state.state))) return;
  setTimeout(() => {
    const house = houseReport();
    const room = house?.etages.flatMap((f) => f.ruimtes).find((r) => r.scenes.some((sc) => sc.id === state.entity_id));
    const scene = room?.scenes.find((sc) => sc.id === state.entity_id);
    if (!room || !scene) return;
    const lower = (x: string) => x.trim().toLowerCase();
    const group = scene.groep ? lower(scene.groep) : null;
    const own = group ? room.apparaten.filter((d) => lower(d.haNaam) === group || d.groepen.some((g) => lower(g) === group)) : [];
    void sceneColors.remember(state.entity_id, colorsFromLamps(own.length > 0 ? own : room.apparaten)).catch(() => {});
  }, 6_000).unref?.();
});

/*
 * Licht bedienen (besluit 97): alleen de lampen die het huis toont, en alleen
 * aan en uit. Smart Climate regelt het licht niet (92); dit is een knop.
 */
if (startup.lights.withoutIngress) {
  console.warn('LET OP: licht bedienen staat aan zonder Ingress ervoor.');
  console.warn('  Iedereen die deze weergave kan openen, kan je lampen schakelen.');
  console.warn('  Zet HEMS_LIGHTS=0 als je dat niet wilt.');
}
const lightSwitch = startup.lights.enabled
  ? new LightSwitch({
      house: houseReport,
      call: (service, entityIds, data) => client.callService('light', service, data, { entity_id: [...entityIds] }),
      callScene: (sceneId) => client.callService('scene', 'turn_on', {}, { entity_id: sceneId }),
    })
  : null;

/*
 * Schermen bedienen (besluit 121): alleen schermen die het huis toont, één per
 * opdracht. Een knop voor de bewoner; de regeling doet niets met schermen.
 */
const coverSwitch = startup.screens.enabled
  ? new CoverSwitch({
      house: houseReport,
      call: (service, entityId, data) => client.callService('cover', service, data, { entity_id: entityId }),
    })
  : null;

/*
 * Wie mag bedienen (besluit 99). Op de NAS een eigen inlog via Home Assistant;
 * de sessies staan naast de dataset, alleen als vingerafdruk.
 */
let access: Access;
if (startup.access.kind === 'sessions') {
  const loginUrl = startup.access.haLoginUrl ?? url ?? '';
  access = {
    kind: 'sessions',
    store: new SessionStore({ logDir: logDir === '' ? null : logDir }),
    login: homeAssistantLogin(loginUrl),
    hosts: startup.access.hosts,
  };
} else {
  // Achter Ingress vraagt de dienst Home Assistant wie er beheerder is (besluit 161).
  access = startup.access.kind === 'ingress' ? { kind: 'ingress', beheerders: haBeheerders(() => client.query<HaAccount[]>('config/auth/list')) } : { kind: 'open' };
  if (startup.access.kind === 'open') {
    console.warn('LET OP: HEMS_OPEN=1. Iedereen die deze weergave kan openen, kan bedienen.');
  }
}

/*
 * De eigen poort van de add-on (besluit 160): de app los op de telefoon, via
 * Tailscale, met een eigen inlog via Home Assistant zoals op de NAS. De
 * browser gaat naar het adres dat de bewoner opgaf, de dienst zelf naar Home
 * Assistant in het netwerk van de add-ons.
 */
const eigenPoort: { port: number; access: Access } | null = startup.eigenPoort
  ? {
      port: startup.eigenPoort.port,
      access: {
        kind: 'sessions',
        store: new SessionStore({ logDir: logDir === '' ? null : logDir }),
        login: homeAssistantLogin(startup.eigenPoort.haLoginUrl, fetch, startup.eigenPoort.haDienstUrl),
      },
    }
  : null;

/*
 * Het weer van de komende dagen (besluit 105). Elke tien minuten de zonkans
 * van morgen bewaren, ook als niemand kijkt: na die dag legt het huis hem naast
 * wat de panelen werkelijk haalden.
 */
const weatherLog = logDir === '' ? null : new WeatherLog(logDir);
/*
 * Waar het weer vandaan komt (besluit 111): Buienradar, of een weerentiteit
 * van Home Assistant, zoals de bewoner koos. Van een weerentiteit volgt de
 * dienst de dagverwachting; die komt alleen via een abonnement.
 */
let entityForecast: { entity: string | null; days: EntityForecast[] } = { entity: null, days: [] };
client.on('forecast', (entity, days) => {
  entityForecast = { entity, days: days as EntityForecast[] };
});
const weerZone: string = baseConfig?.timezone ?? 'Europe/Amsterdam';
const weerBron = (): string | null => {
  const f = functiesNu();
  return f ? volledig(f, functiesKeuzes()).weer.bron : null;
};
const volgWeer = () => {
  const bron = weerBron();
  client.followForecast(bron?.startsWith('weather.') ? bron : null).catch((e: unknown) => console.warn(`Verwachting van ${bron} niet te volgen: ${(e as Error).message}`));
};
setInterval(volgWeer, 60_000).unref();
setTimeout(volgWeer, 15_000).unref();
/*
 * Open-Meteo (besluit 127): het weer zonder Home Assistant. Elk uur de
 * verwachting per uur bewaren voor het thermisch model, tenzij de bewoner dat
 * bij Functies uitzette; en de dagverwachting als hij Open-Meteo als weerbron
 * koos. Alleen de ligging op één decimaal gaat de deur uit.
 */
const openMeteo = new OpenMeteo({ location: () => location, timeZone: weerZone, logDir: logDir === '' ? null : logDir });
const haalWeer = () => {
  const f = functiesNu();
  const w = f ? volledig(f, functiesKeuzes()).weer : null;
  if (w == null || (!w.uren && w.bron !== OPEN_METEO)) return;
  openMeteo.refresh(w.uren).catch((e: unknown) => console.warn(`Weer van Open-Meteo niet opgehaald: ${(e as Error).message}`));
};
setInterval(haalWeer, 5 * 60_000).unref();
setTimeout(haalWeer, 20_000).unref();
const weerNaam = (): string => {
  const bron = weerBron();
  if (bron === OPEN_METEO) return 'Open-Meteo';
  if (bron?.startsWith('weather.')) return String(allStates.get(bron)?.attributes['friendly_name'] ?? 'je weerdienst');
  return 'Buienradar';
};
const forecastNow = () => {
  const bron = weerBron();
  if (bron === OPEN_METEO) return [...(openMeteo.latest?.dagen ?? [])];
  if (!houseRegisters) return [];
  if (bron === 'buienradar') return readForecast(houseRegisters.entities, allStates);
  if (bron?.startsWith('weather.')) {
    return forecastFromEntity(allStates.get(bron), entityForecast.entity === bron ? entityForecast.days : [], Date.now(), weerZone);
  }
  return [];
};
if (weatherLog && site) {
  const timeZone = site.config.timezone;
  const noteTomorrow = () => {
    // Met de weergave rekent die ook de verwachting van morgen uit en bewaart hem.
    if (web) {
      web.weatherNow().catch((e: unknown) => console.warn(`Weer van morgen niet bewaard: ${(e as Error).message}`));
      return;
    }
    const morgen = forecastNow().find((f) => f.offset === 1);
    if (morgen?.zonkansPct == null) return;
    const p = partsIn(Date.now(), timeZone);
    const d = partsIn(zonedMidnight(p.y, p.m, p.d + 1, timeZone) + 12 * 3_600_000, timeZone);
    const day = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    weatherLog.note(day, morgen.zonkansPct).catch((e: unknown) => console.warn(`Zonkans van morgen niet bewaard: ${(e as Error).message}`));
  };
  setInterval(noteTomorrow, 10 * 60_000).unref();
  setTimeout(noteTomorrow, 60_000).unref();
}

/**
 * Wiens comfort (besluit 147): dat van de gevraagde bewoner, anders van wie er
 * kijkt, anders van de hoofdgebruiker. Wie volgt, ziet dat van de
 * hoofdgebruiker; aanpassen maakt het een eigen comfort.
 */
function comfortVoor(wie: Wie, gevraagd: string | null): { id: string | null; view: ComfortView } {
  return comfortVanBewoner(webConfig()!, comfortStore?.current ?? null, bewonersStore?.current ?? GEEN_BEWONERS, wie, gevraagd);
}

/*
 * De sleutel voor de assistent van Home Assistant (besluit 147): de hele app
 * vraagt een inlog, en de vraag van de assistent komt zonder mens erachter.
 * Eén keer gemaakt, in de logmap; bij Instellingen › App en toegang te zien.
 */
const sleutel = logDir !== '' ? await leesOfMaakSleutel(join(logDir, 'sleutel-assistent.txt')) : null;

// "Toch die van" voorbij (besluit 147): opruimen, zodat hij later niet vanzelf terugkomt.
if (bewonersStore) {
  setInterval(() => {
    const snap = runner?.latest;
    if (!vasthoudenVoorbij(bewonersStore.current, snap ? { atMs: snap.atMs, reden: snap.explanation.profile?.reason ?? null } : null)) return;
    void bewonersStore.save(zonderVasthoudenVan(bewonersStore.current)).then(() => herlaadUitDeApp('toch die van is voorbij'));
  }, 60_000).unref();
}

/*
 * Back-up, herstel en opnieuw beginnen (besluit 151): alleen met een logmap,
 * en alleen voor de hoofdgebruiker. Zolang er niemand woont, een beheerder in
 * Home Assistant: anders kan niemand een back-up terugzetten op een nieuw huis.
 */
const sitesDir = startup.sitesDir ?? join(process.cwd(), 'config', 'sites');
/** Stopt met rekenen en schrijven, vóór het terugzetten of weghalen. */
function stilzetten(): void {
  runner?.stop();
  analyse?.stop();
}
/** Stopt de dienst; `run.sh` en Docker starten hem opnieuw. */
function herstart(): void {
  console.log('Smart Climate start opnieuw (besluit 151).');
  setTimeout(() => process.exit(OPNIEUW_STARTEN), 3_000);
  void (web?.stop() ?? Promise.resolve()).finally(() => process.exit(OPNIEUW_STARTEN));
}
/** De instellingen en de apparaten voor de export (besluit 151), en welke namen eruit moeten. */
async function analyseVoorExport(): Promise<AnalyseExtra> {
  const nu = await maakBackup(logDir, site?.source ?? null, VERSIE);
  const bronnen: Record<string, unknown> = { configuratie: nu.configuratie?.inhoud ?? null, ...nu.bestanden, 'functies-nu': functiesNu() };
  const leesmij = [
    '# Export voor de analyse',
    '',
    `Smart Climate ${VERSIE} (${version.installatie}), gemaakt op ${new Date().toISOString()}.`,
    '',
    '- `decisions-*.ndjson`: per dag elk besluit van de arbiter, met de uitleg.',
    '- `history-*.ndjson`: per dag de ruwe standen waarmee een besluit opnieuw te nemen is.',
    '- `runs.ndjson`: welke versie wanneer draaide. `gevoel.ndjson`: wat bewoners aangaven.',
    '- `analyse/instellingen.json`: de configuratie en alles wat in de app is ingesteld of geleerd.',
    '- `analyse/entiteiten.json`: alle entiteiten uit Home Assistant met apparaat, ruimte en etage;',
    '  `gebruikt` zegt waar Smart Climate ze gebruikt, als pad in de configuratie of een instelling.',
    '',
    'Namen van bewoners zijn vervangen door "Bewoner 1", "Bewoner 2" (in een id `bewoner_1`).',
    'Een ligging (latitude, longitude) staat er niet in.',
    '',
  ].join('\n');
  return {
    bestanden: {
      'LEESMIJ.md': leesmij,
      'instellingen.json': `${JSON.stringify({ app: VERSIE, installatie: version.installatie, gemaakt: nu.gemaakt, configuratie: nu.configuratie, bestanden: nu.bestanden, functiesNu: functiesNu() }, null, 2)}\n`,
      'entiteiten.json': `${JSON.stringify(entiteitenLijst(houseRegisters, allStates, bronnen), null, 2)}\n`,
    },
    vervang: namenVoorExport(bewonersStore?.current ?? GEEN_BEWONERS, personenUit(allStates.values())),
  };
}
const gegevens =
  logDir === ''
    ? null
    : {
        hoofd: (wie: Wie) => {
          const hoofd = bewonersStore ? hoofdVan(bewonersStore.current) : null;
          return hoofd ? wie.userId != null && wie.userId === hoofd.haUser : wie.beheerder;
        },
        backup: () => maakBackup(logDir, site?.source ?? null, VERSIE),
        herstel: async (body: unknown) => {
          const gelezen = leesBackup(body, (c) => {
            const r = parseSiteConfig(c, { knownStrategies: strategies.ids });
            return r.ok ? null : `${r.problems[0]?.path ?? ''} ${r.problems[0]?.message ?? ''}`.trim();
          });
          if (!gelezen.ok) return { ok: false as const, status: 400, reden: gelezen.reden };
          try {
            // Eerst wat er nu is, zodat terugzetten zelf ook terug kan.
            await bewaarBackup(logDir, await maakBackup(logDir, site?.source ?? null, VERSIE));
            stilzetten();
            // In de add-on is de configuratie van de app zelf, net als bij opnieuw beginnen (besluit 151).
            const uit = await zetTerug(logDir, gelezen.backup, { configPad: site?.source ?? null, sitesDir, vervang: onboarding != null });
            console.log(`Back-up teruggezet (besluit 151): ${uit.bestanden.join(', ') || 'geen bestanden'}; configuratie ${uit.configuratie}`);
            return { ok: true as const, bestanden: uit.bestanden, configuratie: uit.configuratie };
          } catch (error) {
            // Halverwege mis: opnieuw starten met wat er staat, want de regeling staat al stil.
            console.error(`Terugzetten mislukt: ${String(error)}`);
            herstart();
            return { ok: false as const, status: 500, reden: 'terugzetten lukte niet helemaal; Smart Climate start opnieuw' };
          }
        },
        opnieuw: async () => {
          try {
            const naam = await bewaarBackup(logDir, await maakBackup(logDir, site?.source ?? null, VERSIE));
            stilzetten();
            const weg = await beginOpnieuw(logDir, { configPad: site?.source ?? null, configWeg: onboarding != null });
            console.log(`Opnieuw begonnen (besluit 151): ${weg.length} bestanden weg; de back-up staat in ${BACKUP_DIR}/${naam}`);
            return { ok: true as const, backup: naam, weg };
          } catch (error) {
            console.error(`Opnieuw beginnen mislukt: ${String(error)}`);
            herstart();
            return { ok: false as const, status: 500, reden: 'opnieuw beginnen lukte niet helemaal; Smart Climate start opnieuw' };
          }
        },
        configWeg: onboarding != null && site != null,
        bewaard: () => bewaardeBackups(logDir),
        analyse: analyseVoorExport,
        herstart,
      };

if (webPort != null) {
  web = new WebServer({
    access,
    ...(eigenPoort ? { eigenPoort } : {}),
    ...(gegevens ? { gegevens } : {}),
    port: webPort,
    host: startup.web.host,
    webDir,
    config: site?.config ?? null,
    latest: () => runner?.latest ?? null,
    ...(analyse ? { divergence: () => analyse.latest } : {}),
    // Alleen wanneer er werkelijk gelogd wordt; anders geen exportknop.
    ...(logDir === '' ? {} : { logDir }),
    ...(onboarding
      ? {
          onboarding,
          // Het welkom in een leeg huis (besluit 154): het huis uit Home Assistant, en na het opslaan opnieuw starten.
          welkomHuis: () => (siteConfig == null && houseRegisters ? houseBeforeSetup(houseRegisters, houseStates, Intl.DateTimeFormat().resolvedOptions().timeZone) : null),
          naOnboarding: herstart,
        }
      : {}),
    location: () => location,
    historie: historieVan,
    house: houseReport,
    ...(lightSwitch ? { lights: lightSwitch } : {}),
    ...(coverSwitch ? { covers: coverSwitch } : {}),
    ...(layoutStore && siteConfig
      ? {
          layout: {
            store: layoutStore,
            proposal: () => (houseRegisters ? proposeLayout(siteConfig!, houseRegisters, houseStates) : null),
          },
        }
      : {}),
    // Gevoel en toelichting (besluit 84): alleen als er gelogd wordt, want ze
    // horen bij de dataset, en alleen naar een eigen bestand in de logmap.
    ...(logDir !== '' && site
      ? { feedback: new FeedbackLog({ logDir, zoneIds: site.config.zones.map((z) => z.id) }) }
      : {}),
    ...(uitstelStore ? { uitstel: uitstelStore } : {}),
    ...(meldingen ? { meldingen } : {}),
    ...(voorkeuren ? { voorkeuren } : {}),
    ...(scenePictures ? { scenePicturesDir: scenePictures.dir } : {}),
    // De zon en je aansluiting (besluit 103): alleen met een logmap en een configuratie.
    ...(connectionStore && baseConfig ? { connection: connectionDoor(connectionStore, baseConfig) } : {}),
    // Wat de app laat zien, heet zoals in de indeling (besluit 131).
    configNow: webConfig,
    ...(comfortStore && siteConfig
      ? {
          comfort: {
            view: (wie: Wie, bewoner: string | null) => comfortVoor(wie, bewoner).view,
            save: async (body: unknown, wie: Wie, bewoner: string | null) => {
              const doel = comfortVoor(wie, bewoner);
              if (!doel.view.van?.magAanpassen && doel.view.van != null) return { ok: false as const, status: 403, reden: 'alleen je eigen comfort, of als hoofdgebruiker' };
              const check = controleerComfort(body, siteConfig!);
              if (!check.ok) return { ok: false as const, status: 400, reden: check.reden };
              const huidig = comfortStore.current;
              const b = bewonersStore?.current ?? GEEN_BEWONERS;
              let comfort: Comfort;
              let bewoners = b;
              if (doel.id == null || doel.id === hoofdVan(b)?.id) {
                // Het comfort van het huis, van de hoofdgebruiker; de eigen comforts blijven.
                comfort = { ...check.comfort, ...(huidig?.profielen ? { profielen: huidig.profielen } : {}) };
              } else {
                // Een eigen comfort (besluit 147): alleen de doelen en het plafond per kamer.
                const eigen: Record<string, ComfortRoom> = Object.fromEntries(Object.entries(check.comfort.kamers).map(([k, v]) => [k, { modi: v.modi, ...(v.nooitWarmerC !== undefined ? { nooitWarmerC: v.nooitWarmerC } : {}) }]));
                comfort = { ...(huidig ?? { versie: 1, kamers: {} }), profielen: { ...huidig?.profielen, [doel.id]: eigen } };
                bewoners = { ...b, bewoners: { ...b.bewoners, [doel.id]: { ...b.bewoners[doel.id]!, comfort: 'eigen' } } };
              }
              const met = await configWithComfort(comfort, bewoners);
              if (!met.ok) return { ok: false as const, status: 400, reden: `past niet in de regeling: ${met.reden}` };
              if (runner && !runner.setConfig(met.config, allStates.values())) return { ok: false as const, status: 409, reden: 'de regeling kon het niet overnemen; het gaat in na de volgende start' };
              await comfortStore.save(comfort);
              if (bewoners !== b) await bewonersStore!.save(bewoners);
              siteConfig = met.config;
              return { ok: true as const, view: comfortVoor(wie, doel.id).view };
            },
          },
        }
      : {}),
    ...(bewonersStore && siteConfig
      ? {
          bewoners: {
            view: (wie: Wie) => bewonersView(bewonersStore.current, wie, siteConfig!.occupancy, (id) => allStates.get(id), runner?.latest?.explanation.profile ?? null),
            actie: async (body: unknown, wie: Wie & { readonly naam: string }) => {
              const a = leesActie(body);
              if (a == null) return { ok: false as const, status: 400, reden: 'dat is geen actie die de app kent' };
              const thuis = runner?.latest?.explanation.profile?.home ?? [];
              const bronAccount = (id: string) => { const o = siteConfig!.occupancy.find((x) => x.id === id); return o ? persoonsAccount(o, (e) => allStates.get(e)) : null; };
              const uit = voerUit(bewonersStore.current, comfortStore?.current ?? null, a, wie, siteConfig!.occupancy, thuis, Date.now(), bronAccount);
              if (!uit.ok) return uit;
              const comfort = uit.comfort !== undefined ? uit.comfort : (comfortStore?.current ?? null);
              const met = await configWithComfort(comfort, uit.bewoners);
              if (!met.ok) return { ok: false as const, status: 400, reden: `past niet in de regeling: ${met.reden}` };
              if (runner && !runner.setConfig(met.config, allStates.values())) return { ok: false as const, status: 409, reden: 'de regeling kon het niet overnemen; het gaat in na de volgende start' };
              if (uit.comfort !== undefined && uit.comfort != null) await comfortStore?.save(uit.comfort);
              await bewonersStore.save(uit.bewoners);
              siteConfig = met.config;
              return { ok: true as const, view: bewonersView(uit.bewoners, wie, siteConfig.occupancy, (id) => allStates.get(id), runner?.latest?.explanation.profile ?? null) };
            },
            herken: async (account: { readonly userId: string; readonly naam: string }) => {
              const r = herkenBewoner(bewonersStore.current, account, personenUit(allStates.values()), siteConfig!.occupancy, Date.now());
              if (r.soort === 'vraag') return 'vraag' as const;
              // Zonder persoon in Home Assistant een gast (besluit 151); de hoofdgebruiker kan er een bewoner van maken.
              if (r.soort === 'gast') {
                await bewonersStore.save(r.bewoners);
                return 'gast' as const;
              }
              if (r.soort !== 'bewoner' || !r.nieuw) return null;
              await bewonersStore.save(r.bewoners);
              await herlaadUitDeApp('een nieuwe bewoner');
              return 'welkom' as const;
            },
            // Een gast (besluit 147): thuis volgens zijn aanwezigheid in Home Assistant.
            gast: (userId: string | null) => gastStand(bewonersStore.current, userId, siteConfig!.occupancy, (id) => allStates.get(id)),
          },
        }
      : {}),
    ...(sleutel ? { sleutel } : {}),
    ...(weatherLog ? { weather: { forecast: forecastNow, log: weatherLog, bron: weerNaam, uren: () => openMeteo.latest?.uren ?? null } } : {}),
    // De stem van het huis (besluit 141): Piper in Home Assistant; er wordt niets geschakeld.
    stem: new Stem({
      base: httpBase(url!),
      token: token!,
      stemmen: () => [...allStates.keys()].filter((id) => id.startsWith('tts.')),
      // Welke talen en stemmen Piper heeft: lezen, zoals de registers.
      talen: async (stem) => {
        const r = await client.query<{ providers?: { engine_id: string; supported_languages?: string[] }[] }>('tts/engine/list');
        return r.providers?.find((p) => p.engine_id === stem)?.supported_languages ?? [];
      },
      stemmenVoor: async (stem, taal) => (await client.query<{ voices?: { voice_id: string; name: string }[] | null }>('tts/engine/voices', { engine_id: stem, language: taal })).voices ?? [],
    }),
    // De camera's bekijken (besluit 106): alleen lezen, alleen met inlog.
    camera: {
      base: httpBase(url!),
      token: token!,
      // De camera's die de app toont, en die van de deurbel (besluit 109).
      ids: () => {
        const f = functiesNu();
        return new Set(f ? [...getoondeCameras(f), ...(f.deurbel.aan && f.deurbel.camera ? [f.deurbel.camera, ...reserveBeelden(f.deurbel.camera)] : [])] : []);
      },
    },
    ...(functiesStore ? { functies: { store: functiesStore, gevonden: functiesKeuzes } } : {}),
    // Licht bedienen aan of uit in de app (besluit 111), binnen wat HEMS_LIGHTS toestaat.
    lichtAan: () => {
      const f = functiesNu();
      return f ? volledig(f, functiesKeuzes()).licht.bedienen : true;
    },
    // Schermen bedienen aan of uit in de app (besluit 121), binnen wat HEMS_SCREENS toestaat.
    schermenAan: () => {
      const f = functiesNu();
      return f ? volledig(f, functiesKeuzes()).schermen.bedienen : true;
    },
    // Praten met je stem (besluit 150): geluid naar Home Assistant, tot tekst.
    luisteren: {
      start: (opts) => client.listen(opts),
      pipeline: () => {
        const f = functiesNu();
        return f ? volledig(f, functiesKeuzes()).praten.spraak : null;
      },
    },
    // Praten met je huis (besluit 148): de AI-taak die bij Functies gekozen is, standaard uit.
    praten: {
      model: () => {
        const f = functiesNu();
        const id = f ? volledig(f, functiesKeuzes()).praten.taalmodel : null;
        return id && allStates.has(id) ? pauzeVan(id).om((opdracht, velden) => client.generateData(id, opdracht, velden)) : null;
      },
      proef: (id) => pauzeVan(id).om((opdracht, velden) => client.generateData(id, opdracht, velden)),
      // Na "gebruik op" of "te druk" even niet vragen, per AI-taak (besluit 148).
      pauze: (id) => pauzeVan(id).stand,
      bedienen: () => {
        const f = functiesNu();
        return f ? volledig(f, functiesKeuzes()).praten.bedienen : true;
      },
    },
    // Opbrengst (besluit 102): meters en prijzen naast de dataset, de cijfers uit Home Assistant.
    ...(energyStore ? {
          energy: {
            store: energyStore,
            source: haEnergySource(
              client,
              (id) => allStates.get(id),
              (id) => houseRegisters?.entities.find((e) => e.entity_id === id)?.platform ?? null,
            ),
          },
        } : {}),
    version,
  });
}

function connectionDoor(store: ConnectionStore, base: NonNullable<typeof baseConfig>) {
  // De stroommeters en apparaten zoekt de dienst zelf; de pagina noemt nooit een entiteit.
  const found = () => ({
    fasen: findPhases(allStates.values()),
    apparaten: houseRegisters ? findAppliances(allStates, houseRegisters.entities, houseRegisters.devices) : [],
    // Hoe de panelen liggen (besluit 157): om "klopt" te kunnen bewaren.
    meting: metingNu(),
    omvormerGevonden: omvormerGevonden(),
  });
  const solarId = base.solarProduction?.id ?? null;
  return {
    store,
    found,
    view: () =>
      connectionView({
        base,
        found: found(),
        applied: connectionApplied,
        answersAtStart,
        answers: store.current,
        meting: metingNu(),
        omvormerGevonden: omvormerGevonden(),
        solar: solarId
          ? {
              naam: String(allStates.get(solarId)?.attributes['friendly_name'] ?? 'je zonnesensor'),
              intervalS: solarPace.intervalS,
              platform: houseRegisters?.entities.find((e) => e.entity_id === solarId)?.platform ?? null,
            }
          : null,
      }),
  };
}

console.log('─'.repeat(64));
console.log('  SCHADUWMODUS — de arbiter denkt mee, maar schakelt niets');
console.log('─'.repeat(64));
console.log(
  `  Home Assistant   ${url}${asAddon ? '  (via de Supervisor, geen eigen token)' : ''}`,
);
console.log(`  configuratie     ${site?.source ?? 'nog geen — wachtend op de onboarding'}`);
if (site) {
  console.log(
    `  installatie      ${site.config.id} — ${site.config.zones.length} zones, ${site.config.actuators.length} apparaten`,
  );
}
console.log(`  instellingen     ${loadedFrom ?? 'uit de omgeving'}`);
console.log(`  hartslag         ${tickSeconds} s`);
console.log(`  min. interval    ${startup.minIntervalSeconds} s tussen twee evaluaties`);
console.log(
  `  bewaking         ${startup.watchdogMinutes > 0 ? `afsluiten na ${startup.watchdogMinutes} min zonder besluit` : 'uit'}`,
);
console.log(`  logboek          ${logDir}/decisions-JJJJ-MM-DD.ndjson`);
console.log(`  schrijfrechten   ${client.writesAllowed ? 'AAN' : client.lightsAllowed ? 'alleen licht aan/uit (besluit 97)' : 'uit'}`);
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
    if (web.eigenPoort != null) console.log(`  eigen poort      ${web.eigenPoort}, alleen via Tailscale (https://….ts.net)`);
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
  /*
   * Welke versie en welke configuratie vanaf nu beslissen (besluit 66). Vóór
   * het eerste besluit, zodat elk besluit onder een regel in dit bestand valt.
   * Lukt het niet, dan beslist de dienst toch: zonder herkomst is de dataset
   * minder waard, zonder dienst is hij er helemaal niet.
   */
  if (logDir !== '' && site) {
    try {
      await recordRun(logDir, {
        t: Date.now(),
        commit: version.commit,
        built: version.gebouwd,
        config: configFingerprint(site.config),
        site: site.config.id,
      });
    } catch (error) {
      console.error(`Kon de start niet vastleggen in runs.ndjson: ${String(error)}`);
    }
  }
  runner.start();
} else {
  // Geen configuratie, dus niets om te beslissen. Wel verbinden: de onboarding
  // heeft de registers nodig, en die komen over deze socket.
  client.connect();
}
