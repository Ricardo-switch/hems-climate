/**
 * De read-only webweergave.
 *
 * Toont wat de arbiter op dit moment denkt: de modus, het vermogensbudget, de
 * vraag per zone, en wat hij zou sturen als hij het stuur had. Meer niet.
 *
 * Drie eigenschappen die geen toeval zijn:
 *
 *  1. **Read-only, structureel.** Er is geen route die iets wijzigt. Alles wat
 *     geen GET of HEAD is krijgt 405, vóór de routering. Dat is dezelfde grens
 *     als bij `HaClient` zonder `allowWrites`: geen afspraak maar een muur.
 *  2. **De weergave rekent niets uit.** Wat hier de deur uit gaat is het
 *     `Explanation`-object van de kern, onbewerkt. Het oude dashboard had
 *     ~500 regels JS die de state machine dupliceerden, en dat was een bron
 *     van divergentie op zichzelf.
 *  3. **Geen afhankelijkheden.** `node:http` kan dit, en een dienst die in een
 *     container bij mensen thuis draait heeft baat bij weinig pakketten die
 *     ooit een kwetsbaarheid kunnen krijgen.
 */

import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import type { SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import type { DivergenceReport } from './divergence.js';
import type { Onboarding } from './onboarding.js';
import { exportInfo, writeExport } from './export.js';
import { TodayCache } from './today.js';
import { SolarHistory, learnSolar } from './solar-learn.js';
import type { FeedbackLog } from './feedback.js';
import type { UitstelStore } from './uitstel.js';
import { validateConnection, type ConnectionStore, type ConnectionView, type FoundAppliance, type FoundPhase } from './aansluiting.js';
import { importFromPrefs, pricesInPrefs, type DashboardPrice, type EnergySource, type EnergyStore, type MeterOption } from './energy.js';
import { PERIODS, periodRange, yearStartOf, yieldReport, type PeriodKind, type YieldReport } from './yield.js';
import { partsIn } from './today.js';
import { PICTURE_FILE } from './scene-pictures.js';
import { ask, LANGS, parseQuestion } from './assistant.js';
import type { Lang, Question } from './assistant.js';
import { begrijp, MAX_TEKST } from './woordzoeker.js';
import { residentView, type ResidentView } from './resident.js';
import { sunReport, type Location } from './sun.js';
import { CAMERA_ID } from './camera.js';
import { weatherReport, type ForecastDay, type HourColumns, type WeatherLog, type WeatherReport } from './weather.js';
import { kindOfCode } from './open-meteo.js';
import type { HouseReport } from './house.js';
import { OUTSIDE_FLOOR, STANDARD_FLOORS, floorName, floorOrder, type Layout, type LayoutStore } from './layout.js';
import type { CoverSwitch } from './covers.js';
import type { LightSwitch } from './lights.js';
import { controleer as controleerFuncties, functiesVoorstel, volledig, type FunctiesGevonden, type FunctiesStore } from './functies.js';
import { DOOR_ROLES, SESSION_COOKIE, cookieValue, hostAllowed, newState, safeReturn, sessionCookie, type Access, type Visitor } from './auth.js';
import { startOfLocalDay } from './today.js';

/** De versie die het image meekreeg bij het bouwen. */
export interface Version {
  /** Korte commit-hash, of `onbekend`. */
  readonly commit: string;
  /** Bouwtijd in ISO 8601, of null. */
  readonly gebouwd: string | null;
}

export const UNKNOWN_VERSION: Version = { commit: 'onbekend', gebouwd: null };

/**
 * Leest de versie uit de omgeving. Het image zet `HEMS_COMMIT` en `HEMS_GEBOUWD`
 * uit bouwargumenten die `deploy.sh` meegeeft; een lege of ontbrekende waarde
 * betekent dat niemand ze meegaf.
 */
export function versionFromEnv(env: NodeJS.ProcessEnv): Version {
  const commit = env['HEMS_COMMIT']?.trim();
  const built = env['HEMS_GEBOUWD']?.trim();
  return {
    commit: commit && commit !== '' ? commit : UNKNOWN_VERSION.commit,
    gebouwd: built && built !== '' ? built : null,
  };
}

export interface WebOptions {
  /** Poort om op te luisteren. */
  readonly port: number;
  /**
   * Adres om aan te binden. Standaard alle adressen, want in een container is
   * `127.0.0.1` alleen vanuit de container zelf bereikbaar en dan zie je niets.
   */
  readonly host?: string;
  /** Map met de gebouwde frontend. Ontbreekt hij, dan draait de API gewoon. */
  readonly webDir: string;
  /**
   * De configuratie, voor de namen en de eenheden in de weergave.
   *
   * Mag null zijn: bij een verse installatie is er nog niets, en dan is de
   * onboarding het enige wat deze server te bieden heeft.
   */
  readonly config: SiteConfig | null;
  /** Levert het laatste besluit, of null zolang er nog niet gerekend is. */
  readonly latest: () => LiveSnapshot | null;
  /**
   * Levert de divergentieanalyse over de logboeken, of null.
   *
   * Los van `latest`, want het is een andere waarheid: `latest` is het besluit
   * van dit moment, dit is wat er sinds het begin van de opname is gebeurd.
   * Weglaten mag — dan is er geen analyse en zegt het eindpunt dat ook.
   */
  readonly divergence?: () => DivergenceReport | null;
  /**
   * Waar de dagbestanden staan, voor de export.
   *
   * Weglaten betekent: geen exportknop. Dat is de stand wanneer er niet
   * gelogd wordt — dan valt er ook niets te downloaden.
   */
  readonly logDir?: string;
  /**
   * De onboarding, of weg wanneer die niet mag.
   *
   * Aanwezigheid is de schakelaar. Deze server accepteert alleen een POST
   * wanneer dit is meegegeven, en `main.ts` geeft het alleen mee wanneer we
   * achter Ingress draaien. Zie besluit 42.
   */
  readonly onboarding?: Onboarding;
  /**
   * Gevoel en toelichting van de bewoner (besluit 84), of weg wanneer die niet
   * mogen. Zelfde schakelaar als de onboarding: zonder dit object bestaat de
   * route niet, en staat de muur er ook voor `/api/gevoel`.
   */
  readonly feedback?: FeedbackLog;
  /** "Klaar voor" bij de droger (besluit 101); zonder dit bestaat de route niet. */
  readonly uitstel?: UitstelStore;
  /**
   * Opbrengst (besluit 102): de meters en prijzen van de app, en de statistiek
   * van Home Assistant om ze mee te lezen. Zonder dit geen terugblik.
   */
  readonly energy?: { readonly store: EnergyStore; readonly source: EnergySource };
  /** De map met scèneplaatjes van de bewoner (scene-pictures.ts); zonder dit geen route. */
  readonly scenePicturesDir?: string;
  /**
   * De zon en je aansluiting (besluit 103): antwoorden naar een eigen bestand
   * naast de dataset. Zonder dit bestaat de route niet.
   */
  readonly connection?: {
    readonly store: ConnectionStore;
    readonly view: () => ConnectionView;
    readonly found: () => { readonly fasen: readonly FoundPhase[]; readonly apparaten: readonly FoundAppliance[] };
  };
  /**
   * Het weer van de komende dagen (besluit 105): de verwachting van Buienradar
   * uit Home Assistant, en de zonkans per dag zoals die de dag ervoor werd
   * verwacht. Zonder dit bestaat de route niet.
   */
  readonly weather?: {
    readonly forecast: () => readonly ForecastDay[];
    readonly log: WeatherLog;
    readonly bron?: () => string;
    /** Het weer per uur van Open-Meteo (besluit 128), of null. */
    readonly uren?: () => HourColumns | null;
  };
  /**
   * De camera's bekijken (besluit 106): alleen lezen, via de proxy van Home
   * Assistant, en alleen met inlog. `ids` zijn de camera's die het huis toont.
   */
  readonly camera?: { readonly base: string; readonly token: string; readonly ids: () => ReadonlySet<string> };
  /**
   * Camera's en de deurbel als instelling (besluit 109): wat er gevonden is, en
   * wat de bewoner vastlegde. Zonder dit bestaat `/api/functies` niet.
   */
  readonly functies?: { readonly store: FunctiesStore; readonly gevonden: () => FunctiesGevonden | null };
  /**
   * Of de bewoner licht bedienen in de app aan heeft staan (besluit 111). Kan
   * alleen iets uitzetten: zonder `lights` (HEMS_LIGHTS) is er niets aan te zetten.
   */
  readonly lichtAan?: () => boolean;
  /** Schermen bedienen staat aan bij Functies (besluit 121); weg is aan. */
  readonly schermenAan?: () => boolean;
  /**
   * Welke code er draait (besluit 54). Komt uit het image; zie `versionFromEnv`.
   *
   * Zonder dit moest "draait de nieuwe versie al?" worden afgeleid uit
   * herstarts in het logboek. Weglaten geeft `onbekend`, en dat is ook een
   * antwoord: dan is het image gebouwd zonder dat iemand het zei.
   */
  readonly version?: Version;
  /**
   * De ligging van het huis op één decimaal, of null zolang Home Assistant hem
   * niet gaf. Alleen voor de stand van de zon (besluit 93).
   */
  readonly location?: () => Location | null;
  /**
   * Het huis als navigatie: etages, ruimtes en de apparaten erin (ONTWERP §4),
   * of null zolang de registers van Home Assistant nog niet gelezen zijn.
   */
  readonly house?: () => HouseReport | null;
  /**
   * De indeling van het huis (besluit 96), of weg wanneer die niet mag. Zelfde
   * schakelaar als het gevoel: zonder dit object bestaat de route niet, en staat
   * de muur er ook voor `/api/indeling`.
   */
  readonly layout?: {
    readonly store: LayoutStore;
    /** Het voorstel uit Home Assistant, of null zolang de registers niet gelezen zijn. */
    readonly proposal: () => Layout | null;
  };
  /**
   * Licht bedienen (besluit 97), of weg wanneer dat niet mag. Zelfde schakelaar
   * als de indeling: zonder dit object bestaat de route niet, en staat de muur er
   * ook voor `/api/licht`.
   */
  readonly lights?: LightSwitch;
  /** Schermen bedienen voor de bewoner (besluit 121); weg als de installatie het niet toestaat. */
  readonly covers?: CoverSwitch;
  /**
   * Wie mag bedienen (besluit 99): een eigen inlog via Home Assistant, Ingress
   * van de add-on, of open (alleen voor tests). Verplicht, zodat een nieuwe
   * opstelling er niet per ongeluk zonder komt te staan.
   */
  readonly access: Access;
  /** Waar meldingen naartoe gaan. Standaard de console. */
  readonly write?: (line: string) => void;
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // Om de app te installeren.
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Wat de weergave over de installatie moet weten om namen te tonen.
 *
 * Los van het besluit, omdat het niet verandert: de pagina haalt dit één keer
 * op en de stroom eronder blijft klein.
 */
function siteInfo(config: SiteConfig): unknown {
  return {
    id: config.id,
    timezone: config.timezone,
    zones: config.zones.map((z) => ({
      id: z.id,
      name: z.name,
      actuatorIds: z.actuatorIds,
    })),
    actuators: config.actuators.map((a) => ({
      id: a.id,
      name: a.name,
      capabilities: a.capabilities,
    })),
    /** Zolang dit er staat, draait de vergelijking met het oude systeem nog. */
    migrating: config.migration?.legacyExplanation != null,
  };
}

/**
 * Komt het verzoek van deze dienst zelf? Zonder Origin (curl, een script op de
 * NAS) is het geen browser van een ander, en mag het. Met een Origin moet de
 * host gelijk zijn aan die van dit verzoek, of aan die waarvoor een proxy het
 * doorgaf (Ingress van Home Assistant zet `x-forwarded-host`).
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin == null || origin === '') return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const own = [req.headers.host, req.headers['x-forwarded-host']]
    .flat()
    .filter((h): h is string => typeof h === 'string')
    .flatMap((h) => h.split(','))
    .map((h) => h.trim().toLowerCase());
  return own.includes(host);
}

/** Zoveel mag een verzoek zijn. Antwoorden op keuzes zijn kilobytes, geen megabytes. */
const MAX_BODY = 64 * 1024;

/**
 * Leest een JSON-verzoek, met een dak erop.
 *
 * Zonder grens houdt een verzoek dat blijft doorsturen deze dienst bezig tot
 * het geheugen op is. Dat is hier extra onprettig: het is dezelfde dienst die
 * de opname doet, en die hoort niet om te vallen door een pagina.
 */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const pieces: Buffer[] = [];
  let bytes = 0;
  for await (const piece of req) {
    bytes += (piece as Buffer).length;
    if (bytes > MAX_BODY) throw new Error('verzoek te groot');
    pieces.push(piece as Buffer);
  }
  const text = Buffer.concat(pieces).toString('utf-8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('geen geldige JSON');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // De stand van nú. Een tussenliggende cache die dit vasthoudt laat een
    // dashboard zien dat er goed uitziet en niet klopt.
    'cache-control': 'no-store',
  });
  res.end(text);
}

/**
 * Serveert een bestand uit `webDir`, en niets erbuiten.
 *
 * Het pad wordt genormaliseerd en daarna gecontroleerd tegen de wortel. Zonder
 * die controle haalt `GET /../../.env` het token op — die map ligt precies één
 * niveau boven de gebouwde frontend.
 */
async function sendFile(
  res: ServerResponse,
  webDir: string,
  pathname: string,
  headOnly: boolean,
  since: string | undefined,
): Promise<boolean> {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const full = resolve(webDir, relative);
  const root = resolve(webDir);
  if (full !== root && !full.startsWith(root + sep)) return false;

  let info;
  try {
    info = await stat(full);
  } catch {
    return false;
  }
  if (info.isDirectory()) return false;

  /*
   * `no-cache` en niet `max-age`.
   *
   * De bestandsnamen dragen geen hash: het blijven `app.js` en `app.css`. Met
   * een `max-age` van een uur krijgt een bezoeker na een uitrol dus de nieuwe
   * HTML met de oude JS, en dat mislukt op precies de manier die het lastigst
   * te vinden is — een pagina die half werkt zonder één foutmelding. Dat is
   * hier één keer gebeurd tijdens het bouwen van de tabs.
   *
   * `no-cache` betekent niet "niet bewaren" maar "altijd navragen". Samen met
   * `last-modified` kost een ongewijzigd bestand een leeg 304-antwoord in
   * plaats van tien kilobyte, en klopt de pagina altijd.
   */
  const changed = info.mtime.toUTCString();
  if (since != null && since === changed) {
    res.writeHead(304, { 'cache-control': 'no-cache', 'last-modified': changed });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-cache',
    'last-modified': changed,
  });
  if (headOnly) {
    res.end();
    return true;
  }
  createReadStream(full).pipe(res);
  return true;
}

/** Eén open SSE-verbinding. */
interface Listener {
  readonly res: ServerResponse;
  readonly ping: NodeJS.Timeout;
}

export class WebServer {
  readonly #options: WebOptions & { host: string; write: (line: string) => void };
  readonly #server: Server;
  readonly #listeners = new Set<Listener>();
  #today: TodayCache | null = null;
  /** Het weerrapport, tien minuten vastgehouden: vijf dagen zon uitrekenen kost wat. */
  #weather: { atMs: number; report: WeatherReport } | null = null;
  #solar: SolarHistory | null = null;

  constructor(options: WebOptions) {
    this.#options = {
      ...options,
      host: options.host ?? '0.0.0.0',
      write: options.write ?? ((line) => console.log(line)),
    };
    this.#server = createServer((req, res) => {
      void this.#handle(req, res).catch((error: unknown) => {
        // Een verzoek dat onderuitgaat mag de dienst niet meenemen. De
        // schaduwopname is het product; dit is een venster erop.
        if (!res.headersSent) sendJson(res, 500, { error: String(error) });
        else res.end();
      });
    });
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const access = this.#options.access;

    /*
     * Alleen bekende hostnamen (besluit 99). Een vreemde website die zijn eigen
     * naam naar het adres van de NAS laat wijzen (DNS-rebinding), is voor de
     * browser "dezelfde" herkomst; hier strandt hij. Achter Ingress niet: daar
     * staat Home Assistant voor, onder welke naam dan ook.
     */
    if (access.kind !== 'ingress' && !hostAllowed(req.headers.host, access.kind === 'sessions' ? access.hosts : [])) {
      res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Onbekende hostnaam.\n');
      return;
    }

    /*
     * Read-only als grens, niet als afspraak — met sinds fase 6e stap 4 één
     * deur erin.
     *
     * Die deur is smal en dubbel op slot. Hij zit op één pad, hij bestaat
     * alleen wanneer `onboarding` is meegegeven, en `main.ts` geeft dat alleen
     * mee wanneer we achter Ingress draaien, waar Home Assistant heeft
     * vastgesteld wie er kijkt (besluit 42). Zonder die twee is dit weer een
     * muur: elke andere methode krijgt 405 vóór de routering, zodat een nieuwe
     * route hem niet per ongeluk kan omzeilen.
     */
    // De tweede deur (besluit 84): gevoel en toelichting, naar een eigen
    // bestand in de logmap en nooit naar Home Assistant.
    // De derde (besluit 96): de indeling, naar een eigen bestand in de logmap.
    // De vierde (besluit 97): lampen aan en uit, en alleen lampen.
    const mayWrite =
      (this.#options.onboarding != null && path === '/api/onboarding') ||
      (this.#options.feedback != null && path === '/api/gevoel') ||
      (this.#options.uitstel != null && path === '/api/uitstel') ||
      (this.#options.energy != null && path === '/api/energie') ||
      // De zon en je aansluiting (besluit 103): alleen antwoorden, naar een eigen bestand.
      (this.#options.connection != null && path === '/api/aansluiting') ||
      (this.#options.layout != null && path === '/api/indeling') ||
      // Camera's en de deurbel (besluit 109): alleen de keuzes, naar een eigen bestand.
      (this.#options.functies != null && path === '/api/functies') ||
      (this.#options.lights != null && path === '/api/licht') ||
      // Schermen (besluit 121): open, dicht, stop of een stand, voor de bewoner.
      (this.#options.covers != null && path === '/api/scherm') ||
      // Scènes (besluit 100): een eigen smalle deur naast het licht.
      (this.#options.lights?.scenesEnabled === true && path === '/api/scene') ||
      // Uitloggen (besluit 99): alleen de eigen sessie weg, verder niets.
      (access.kind === 'sessions' && path === '/auth/logout');
    if (method !== 'GET' && method !== 'HEAD' && !(method === 'POST' && mayWrite)) {
      res.writeHead(405, {
        allow: mayWrite ? 'GET, HEAD, POST' : 'GET, HEAD',
        'content-type': 'text/plain; charset=utf-8',
      });
      res.end('Deze weergave leest alleen.\n');
      return;
    }

    /*
     * Alleen de eigen pagina mag door een deur (CSRF). Op de NAS staat geen
     * inlog voor de weergave: wie op het thuisnetwerk of in het tailnet zit,
     * mag kijken en de deuren gebruiken. Maar zonder deze controle kon ook een
     * willekeurige website, geopend op zo'n apparaat, een verzoek sturen als
     * gewone tekst (de browser vraagt dan niets vooraf) en zo lampen schakelen,
     * de indeling overschrijven of gevoel in de dataset zetten. Daarom: alleen
     * JSON, wat een vreemde site niet zonder voorafgaande vraag kan sturen, en
     * die vraag beantwoordt deze dienst niet. En een Origin, als de browser er
     * een meegeeft, moet deze dienst zelf zijn.
     */
    if (method === 'POST') {
      const type = String(req.headers['content-type'] ?? '').toLowerCase();
      if (!type.startsWith('application/json')) {
        sendJson(res, 415, { fout: 'alleen JSON' });
        return;
      }
      if (!sameOrigin(req)) {
        sendJson(res, 403, { fout: 'alleen vanaf de eigen pagina' });
        return;
      }
      // Wie is het, en mag dat (besluit 99)?
      const role = DOOR_ROLES[path];
      if (role != null && access.kind === 'sessions') {
        const visitor = await access.store.visitor(cookieValue(req, SESSION_COOKIE));
        if (visitor == null) {
          sendJson(res, 401, { fout: 'log eerst in', inlog: '/auth/login' });
          return;
        }
        if (role === 'beheerder' && visitor.rol !== 'beheerder') {
          sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
          return;
        }
      }
    }

    /*
     * Een camera bekijken (besluit 106): live, of één plaatje. Alleen met inlog,
     * alleen camera's die het huis toont, en alleen lezen bij Home Assistant.
     */
    if (path === '/api/camera' && (method === 'GET' || method === 'HEAD')) {
      await this.#camera(req, res, url);
      return;
    }

    if (path === '/api/sessie' || path.startsWith('/auth/')) {
      await this.#auth(req, res, method, path, url);
      return;
    }

    if (path === '/api/site') {
      const config = this.#options.config;
      if (config == null) {
        // 503 en niet 404: de installatie bestaat, hij is alleen nog niet
        // ingesteld. De pagina kan daar iets nuttigs mee doen.
        sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
        return;
      }
      sendJson(res, 200, siteInfo(config));
      return;
    }

    if (path === '/api/onboarding') {
      await this.#onboarding(req, res, method);
      return;
    }

    if (path === '/api/energie') {
      await this.#energy(req, res, method);
      return;
    }

    if (path === '/api/aansluiting') {
      await this.#connection(req, res, method);
      return;
    }

    if (path === '/api/functies') {
      await this.#functies(req, res, method);
      return;
    }

    if (path === '/api/opbrengst') {
      await this.#yield(res, url.searchParams);
      return;
    }

    if (path === '/api/uitstel') {
      const uitstel = this.#options.uitstel;
      if (uitstel == null) {
        sendJson(res, 503, { wachten: '"klaar voor" staat niet aan' });
        return;
      }
      if (method !== 'POST') {
        sendJson(res, 405, { fout: '"klaar voor" zet je met een POST' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await uitstel.set(body);
      if (result.ok) sendJson(res, 200, { id: result.id, klaarVoorMs: result.klaarVoorMs });
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    if (path === '/api/gevoel') {
      const feedback = this.#options.feedback;
      if (feedback == null) {
        sendJson(res, 503, { wachten: 'gevoel en toelichting staan niet aan' });
        return;
      }
      if (method === 'POST') {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch (error) {
          sendJson(res, 400, { fout: (error as Error).message });
          return;
        }
        const result = await feedback.add(body);
        if (result.ok) sendJson(res, 200, result.record);
        else sendJson(res, result.status, { fout: result.reden });
        return;
      }
      // Wat er de afgelopen 24 uur is vastgelegd, voor de bevestiging op de pagina.
      sendJson(res, 200, await feedback.since(Date.now() - 86_400_000));
      return;
    }

    if (path === '/api/state') {
      const snapshot = this.#options.latest();
      if (snapshot == null) {
        // 503 en niet 200-met-null: er ís nog geen stand, en dat is iets
        // anders dan een lege stand. De pagina kan dat onderscheid tonen.
        sendJson(res, 503, { wachten: 'nog geen besluit genomen' });
        return;
      }
      sendJson(res, 200, this.#withResident(snapshot));
      return;
    }

    if (path === '/api/events') {
      this.#subscribe(res, method === 'HEAD');
      return;
    }

    if (path === '/api/divergence') {
      const report = this.#options.divergence?.() ?? null;
      if (report == null) {
        // Onderscheid tussen "staat uit" en "nog niet gerekend" is voor de
        // pagina het verschil tussen iets verbergen en iets uitleggen.
        sendJson(res, 503, {
          wachten:
            this.#options.divergence == null
              ? 'geen logboekanalyse ingeschakeld'
              : 'nog niet doorgerekend',
        });
        return;
      }
      sendJson(res, 200, report);
      return;
    }

    /*
     * De dataset ophalen.
     *
     * Twee paden: `/api/export/info` zegt hoe groot het is, zodat de knop een
     * getal kan tonen in plaats van een belofte, en `/api/export` levert het
     * spul. Allebei lezen; de 405-muur hierboven blijft dus ongemoeid.
     */
    const logDir = this.#options.logDir;

    /*
     * Vandaag, voor de bewonersweergave (besluit 71): de zon per kwartier,
     * wanneer elk apparaat draaide en de besluiten van vandaag. Leest het
     * logboek, dus alleen waar er gelogd wordt.
     */
    if (path === '/api/vandaag') {
      const config = this.#options.config;
      if (logDir == null || config == null) {
        sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er is geen dag om te tonen' });
        return;
      }
      this.#today ??= new TodayCache(logDir, config);
      try {
        // ?dag=gisteren: de hele dag ervoor, in dezelfde vorm.
        const gisteren = url.searchParams.get('dag') === 'gisteren';
        sendJson(res, 200, await (gisteren ? this.#today.yesterday() : this.#today.get()));
      } catch (error) {
        sendJson(res, 500, { fout: (error as Error).message });
      }
      return;
    }

    /*
     * De assistent die uitlegt (ONTWERP §7, fase 1): een vaste vraag, een
     * antwoord in woorden uit het laatste besluit. Leest alleen, ook voor
     * "zet de zolder op 21"; de muur hierboven blijft staan.
     */
    if (path === '/api/vraag') {
      const config = this.#options.config;
      if (config == null) {
        sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
        return;
      }
      // Een vraag in eigen woorden (besluit 115): de woordzoeker maakt er een
      // vaste vraag van, of antwoordt zelf over de app.
      let parsed: { question: Question; lang: Lang };
      if ((url.searchParams.get('v') ?? '').toLowerCase() === 'vrij') {
        const taal = (url.searchParams.get('taal') ?? 'nl').toLowerCase();
        const lang: Lang = (LANGS as readonly string[]).includes(taal) ? (taal as Lang) : 'nl';
        const tekst = (url.searchParams.get('tekst') ?? '').trim();
        if (tekst === '' || tekst.length > MAX_TEKST) {
          sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_TEKST} tekens zijn` });
          return;
        }
        const b = begrijp(tekst, config, lang);
        if (b.soort === 'app') {
          sendJson(res, 200, { vraag: 'app', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], link: b.link });
          return;
        }
        if (b.soort === 'onbekend') {
          sendJson(res, 200, { vraag: 'onbekend', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], voorbeelden: b.voorbeelden });
          return;
        }
        parsed = { question: b.vraag, lang };
      } else {
        const p = parseQuestion(url.searchParams);
        if (!p.ok) {
          sendJson(res, 400, { fout: p.reden });
          return;
        }
        parsed = p;
      }
      let today = null;
      if (parsed.question.kind === 'zon' && logDir != null) {
        this.#today ??= new TodayCache(logDir, config);
        try {
          today = await this.#today.get();
        } catch {
          // Zonder dagoverzicht zegt het antwoord dat het het niet weet.
        }
      }
      // Op welke gevel de zon staat, als de ligging bekend is (besluit 93).
      const location = this.#options.location?.() ?? null;
      let zoninval = null;
      if (parsed.question.kind === 'zon' && config.geometry != null && location != null) {
        const now = Date.now();
        const r = sunReport(config.geometry, location, now, startOfLocalDay(now, config.timezone));
        zoninval = { boven: r.zon.boven, gevels: r.gevels.filter((g) => g.inDeZon).map((g) => g.naam) };
      }
      sendJson(
        res,
        200,
        ask(parsed.question, {
          zoninval,
          config,
          snapshot: this.#options.latest(),
          today,
          nowMs: Date.now(),
          // Tot stap B schrijft de dienst niets (besluit 15): hij is altijd schaduw.
          shadow: true,
          lang: parsed.lang,
        }),
      );
      return;
    }

    /*
     * De zoninval (besluit 93): waar de zon staat, op welke gevel hij valt, en
     * wat de panelen bij een heldere lucht zouden leveren.
     */
    if (path === '/api/zon') {
      const config = this.#options.config;
      const location = this.#options.location?.() ?? null;
      if (config?.geometry == null || location == null) {
        sendJson(res, 503, {
          wachten:
            config?.geometry == null
              ? 'de ligging van het huis en de panelen is nog niet bekend'
              : 'de ligging van het huis komt van Home Assistant zodra die verbonden is',
        });
        return;
      }
      // Wat de panelen werkelijk halen, geleerd uit de afgesloten dagen van het
      // logboek. Zonder logboek, of als dat lezen faalt, blijft het een schatting.
      let learned = null;
      if (logDir != null) {
        this.#solar ??= new SolarHistory({ logDir });
        try {
          await this.#solar.refresh();
        } catch {
          // Dan met wat er al was.
        }
        learned = learnSolar(this.#solar.current, config.geometry, location);
      }
      const now = Date.now();
      sendJson(res, 200, sunReport(config.geometry, location, now, startOfLocalDay(now, config.timezone), learned));
      return;
    }

    /*
     * Het weer van de komende dagen (besluit 105), met wat de panelen dan
     * ongeveer leveren. Alleen om te tonen; de regeling gebruikt het niet.
     */
    if (path === '/api/weer') {
      const uit = await this.weatherNow();
      if ('wachten' in uit) sendJson(res, 503, uit);
      else sendJson(res, 200, uit);
      return;
    }

    if (path === '/api/indeling') {
      const door = this.#options.layout;
      const config = this.#options.config;
      if (door == null || config == null) {
        sendJson(res, 503, { wachten: 'indelen staat niet aan' });
        return;
      }
      if (method === 'POST') {
        let body: unknown;
        try {
          body = await readJson(req);
        } catch (error) {
          sendJson(res, 400, { fout: (error as Error).message });
          return;
        }
        const result = await door.store.save(body);
        if (result.ok) sendJson(res, 200, result.layout);
        else sendJson(res, result.status, { fout: result.reden });
        return;
      }
      // Alles wat de bewerkstand nodig heeft om te kiezen, zonder zelf te rekenen.
      sendJson(res, 200, {
        indeling: door.store.current,
        voorstel: door.proposal(),
        // De etages van deze indeling, van boven naar beneden, en buiten (besluit 112);
        // de vaste etages als voorstel om toe te voegen.
        etages: [...floorOrder(door.store.current ?? door.proposal() ?? { kamers: [] }), OUTSIDE_FLOOR].map((id) => ({ id, standaardNaam: floorName(id) })),
        standaard: STANDARD_FLOORS,
        regelzones: config.zones.map((z) => ({ id: z.id, naam: z.name })),
      });
      return;
    }

    if (path === '/api/huis') {
      const house = this.#options.house?.() ?? null;
      if (house == null) {
        sendJson(res, 503, { wachten: 'de etages en ruimtes komen van Home Assistant zodra die verbonden is' });
        return;
      }
      // Of de knoppen voor licht echt schakelen, of zeggen dat het nog niet mag.
      sendJson(res, 200, { ...house, lichtBedienen: this.#lichtMag(), schermenBedienen: this.#schermMag() });
      return;
    }

    if (path === '/api/scene') {
      const lights = this.#options.lights;
      if (lights == null || !lights.scenesEnabled || !this.#lichtMag()) {
        sendJson(res, 503, { wachten: 'scènes staan niet aan' });
        return;
      }
      if (method !== 'POST') {
        sendJson(res, 405, { fout: 'een scène zet je aan met een POST' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await lights.scene(body);
      if (result.ok) sendJson(res, 200, { aan: true });
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    if (path === '/api/scherm') {
      const covers = this.#options.covers;
      if (covers == null || !this.#schermMag()) {
        sendJson(res, 503, { wachten: 'schermen bedienen staat niet aan' });
        return;
      }
      if (method !== 'POST') {
        sendJson(res, 405, { fout: 'een scherm bedien je met een POST' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await covers.move(body);
      if (result.ok) sendJson(res, 200, { ok: true });
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    if (path === '/api/licht') {
      const lights = this.#options.lights;
      if (lights == null || !this.#lichtMag()) {
        sendJson(res, 503, { wachten: 'licht bedienen staat niet aan' });
        return;
      }
      if (method !== 'POST') {
        sendJson(res, 405, { fout: 'licht bedien je met een POST' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await lights.switch(body);
      if (result.ok) sendJson(res, 200, { lampen: result.lampen });
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    if (path === '/api/export/info') {
      if (logDir == null) {
        sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er valt niets te exporteren' });
        return;
      }
      sendJson(res, 200, await exportInfo(logDir));
      return;
    }

    if (path === '/api/export') {
      if (logDir == null) {
        sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er valt niets te exporteren' });
        return;
      }
      const info = await exportInfo(logDir);
      if (info.bestanden === 0) {
        sendJson(res, 503, { wachten: 'nog geen dagbestanden' });
        return;
      }
      if (method === 'HEAD') {
        // Geen inhoud, wel het antwoord dat er iets te halen valt.
        res.writeHead(200, { 'content-type': 'application/gzip' });
        res.end();
        return;
      }
      await writeExport(logDir, res);
      return;
    }

    if (path === '/api/health') {
      const snapshot = this.#options.latest();
      sendJson(res, 200, {
        ok: true,
        versie: this.#options.version ?? UNKNOWN_VERSION,
        laatsteBesluitMs: snapshot?.atMs ?? null,
        analyseBerekendOpMs: this.#options.divergence?.()?.berekendOpMs ?? null,
        kijkers: this.#listeners.size,
      });
      return;
    }

    // Scèneplaatjes uit de map van de bewoner: alleen een plat bestand met een
    // nette naam, en alleen uit die map (besluit 100).
    if (path.startsWith('/scene-plaatjes/') && this.#options.scenePicturesDir && (method === 'GET' || method === 'HEAD')) {
      const file = path.slice('/scene-plaatjes/'.length);
      const since0 = req.headers['if-modified-since'];
      if (!PICTURE_FILE.test(file) || !(await sendFile(res, this.#options.scenePicturesDir, file, method === 'HEAD', typeof since0 === 'string' ? since0 : undefined))) {
        sendJson(res, 404, { fout: 'geen plaatje met die naam' });
      }
      return;
    }

    const headOnly = method === 'HEAD';
    const target = path === '/' ? 'index.html' : path;
    const since = req.headers['if-modified-since'];
    if (
      await sendFile(
        res,
        this.#options.webDir,
        target,
        headOnly,
        typeof since === 'string' ? since : undefined,
      )
    ) {
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(headOnly ? undefined : 'Niet gevonden.\n');
  }

  /** Inlogpogingen die onderweg zijn: de waarde voor Home Assistant, met de terugweg. */
  readonly #pending = new Map<string, { terug: string; untilMs: number }>();

  /**
   * Inloggen, uitloggen en "wie ben ik" (besluit 99).
   *
   * Inloggen stuurt de browser naar Home Assistant; die komt terug op
   * `/auth/callback` met een code. De dienst wisselt die in voor wie het is,
   * maakt een eigen sessie en gooit het token van Home Assistant weg.
   */
  /**
   * Opbrengst per periode, bewaard (besluit 125). Een afgelopen periode
   * verandert niet meer: die blijft tot de meters of prijzen veranderen. De
   * lopende periode komt meteen uit de bewaarde, en wordt op de achtergrond
   * opnieuw uitgerekend als hij ouder is dan twee minuten. De sleutel is het
   * begin van de periode, zodat elke datum in hetzelfde jaar hetzelfde vindt.
   */
  readonly #yieldCache = new Map<string, { atMs: number; report: YieldReport }>();
  readonly #yieldBusy = new Map<string, Promise<YieldReport | null>>();

  async #energy(req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
    const energy = this.#options.energy;
    if (energy == null) {
      sendJson(res, 503, { wachten: 'Opbrengst staat niet aan' });
      return;
    }
    if (method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await energy.store.save(body);
      this.#yieldCache.clear();
      if (result.ok) sendJson(res, 200, result.settings);
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }
    // Wat er staat, wat Home Assistant voorstelt, en de meters om uit te kiezen.
    let voorstel = null;
    let dashboardPrijzen: readonly DashboardPrice[] = [];
    let dashboard: unknown = null;
    let meters: readonly MeterOption[] = [];
    let fout: string | null = null;
    try {
      meters = await energy.source.meters();
      const prefs = await energy.source.prefs();
      voorstel = importFromPrefs(prefs, meters, (id) => energy.source.entityNumber?.(id) ?? null);
      dashboardPrijzen = pricesInPrefs(prefs);
      // Het dashboard zoals Home Assistant het geeft: entiteiten en prijzen, om
      // na te gaan wat het overnemen ervan maakte.
      dashboard = prefs;
    } catch (error) {
      fout = `Home Assistant gaf de meters niet: ${(error as Error).message}`;
    }
    sendJson(res, 200, { instellingen: energy.store.current, voorstel, dashboardPrijzen, dashboard, meters, ...(fout ? { fout } : {}) });
  }

  /** De zon en je aansluiting (besluit 103): wat er staat, of de antwoorden bewaren. */
  async #connection(req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
    const connection = this.#options.connection;
    if (connection == null) {
      sendJson(res, 503, { wachten: 'De aansluiting staat niet aan' });
      return;
    }
    if (method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const checked = validateConnection(body, connection.found());
      if (!checked.ok) {
        sendJson(res, 400, { fout: checked.reden });
        return;
      }
      await connection.store.save(checked.answers);
    }
    sendJson(res, 200, connection.view());
  }

  async #yield(res: ServerResponse, params: URLSearchParams): Promise<void> {
    const energy = this.#options.energy;
    const config = this.#options.config;
    if (energy == null || config == null) {
      sendJson(res, 503, { wachten: 'Opbrengst staat niet aan' });
      return;
    }
    const settings = energy.store.current;
    if (settings == null) {
      sendJson(res, 409, { fout: 'er zijn nog geen meters ingesteld', instellen: true });
      return;
    }
    const soort = (params.get('soort') ?? 'maand') as PeriodKind;
    if (!PERIODS.includes(soort)) {
      sendJson(res, 400, { fout: `soort is ${PERIODS.join(', ')}` });
      return;
    }
    const now = Date.now();
    const today = partsIn(now, config.timezone);
    const vandaag = `${today.y}-${String(today.m).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;
    const datum = params.get('datum') ?? vandaag;
    const range = periodRange(soort, datum, config.timezone, yearStartOf(settings.prijzen.contractStart));
    if (range == null) {
      sendJson(res, 400, { fout: 'datum is een dag als "2026-10-07"' });
      return;
    }
    const key = `${soort}:${range.startMs}`;
    const hit = this.#yieldCache.get(key);
    // Klaar is klaar: uitgerekend na het einde van de periode.
    const fresh = (h: { atMs: number; report: YieldReport }) => h.atMs >= h.report.periode.totMs || now - h.atMs < 120_000;
    if (hit) {
      sendJson(res, 200, hit.report);
      if (!fresh(hit)) void this.#yieldCompute(key, soort, datum, now).catch(() => null);
      this.#yieldWarm(vandaag);
      return;
    }
    try {
      const report = await this.#yieldCompute(key, soort, datum, now);
      if (report == null) {
        sendJson(res, 400, { fout: 'datum is een dag als "2026-10-07"' });
        return;
      }
      sendJson(res, 200, report);
      this.#yieldWarm(vandaag);
    } catch (error) {
      sendJson(res, 502, { fout: `Home Assistant gaf de statistiek niet: ${(error as Error).message}` });
    }
  }

  /** Rekent één periode uit, één keer tegelijk per periode, en bewaart hem. */
  #yieldCompute(key: string, soort: PeriodKind, datum: string, now: number): Promise<YieldReport | null> {
    const busy = this.#yieldBusy.get(key);
    if (busy) return busy;
    const energy = this.#options.energy!;
    const config = this.#options.config!;
    const settings = energy.store.current!;
    const job = yieldReport(energy.source, settings, soort, datum, config.timezone, now)
      .then((report) => {
        if (report != null) {
          // Hooguit honderd periodes; de oudste eruit.
          if (this.#yieldCache.size >= 100) this.#yieldCache.delete(this.#yieldCache.keys().next().value!);
          this.#yieldCache.delete(key);
          this.#yieldCache.set(key, { atMs: now, report });
        }
        return report;
      })
      .finally(() => this.#yieldBusy.delete(key));
    this.#yieldBusy.set(key, job);
    return job;
  }

  /** Na een vraag: de andere periodes van vandaag alvast uitrekenen, op de achtergrond. */
  #yieldWarm(vandaag: string): void {
    const config = this.#options.config;
    const settings = this.#options.energy?.store.current;
    if (config == null || settings == null) return;
    const now = Date.now();
    for (const soort of PERIODS) {
      const range = periodRange(soort, vandaag, config.timezone, yearStartOf(settings.prijzen.contractStart));
      if (range == null) continue;
      const key = `${soort}:${range.startMs}`;
      const hit = this.#yieldCache.get(key);
      if (hit && (hit.atMs >= hit.report.periode.totMs || now - hit.atMs < 120_000)) continue;
      void this.#yieldCompute(key, soort, vandaag, now).catch(() => null);
    }
  }

  async #auth(req: IncomingMessage, res: ServerResponse, method: string, path: string, url: URL): Promise<void> {
    const access = this.#options.access;
    if (path === '/api/sessie') {
      let visitor: Visitor | null = null;
      if (access.kind === 'sessions') visitor = await access.store.visitor(cookieValue(req, SESSION_COOKIE));
      else if (access.kind === 'ingress') visitor = { naam: String(req.headers['x-remote-user-display-name'] ?? req.headers['x-remote-user-name'] ?? 'bewoner'), rol: 'beheerder' };
      else visitor = { naam: 'iedereen', rol: 'beheerder' };
      sendJson(res, 200, {
        toegang: access.kind,
        ingelogd: visitor != null,
        ...(visitor ? { naam: visitor.naam, rol: visitor.rol } : {}),
        ...(access.kind === 'sessions' ? { inlog: '/auth/login', uitlog: '/auth/logout' } : {}),
      });
      return;
    }
    if (access.kind !== 'sessions') {
      sendJson(res, 404, { fout: 'inloggen gaat hier via Home Assistant zelf' });
      return;
    }
    const origin = `${String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]!.trim()}://${req.headers.host}`;
    const secure = origin.startsWith('https:');

    if (path === '/auth/login') {
      const now = Date.now();
      for (const [k, v] of this.#pending) if (v.untilMs < now) this.#pending.delete(k);
      const state = newState();
      this.#pending.set(state, { terug: safeReturn(url.searchParams.get('terug')), untilMs: now + 10 * 60_000 });
      res.writeHead(302, { location: access.login.authorizeUrl(origin, state), 'cache-control': 'no-store' });
      res.end();
      return;
    }
    if (path === '/auth/callback') {
      const state = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code');
      const pending = this.#pending.get(state);
      this.#pending.delete(state);
      if (pending == null || pending.untilMs < Date.now() || code == null) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Deze inlog is verlopen of komt niet van hier. Probeer het opnieuw.\n');
        return;
      }
      try {
        const user = await access.login.identify(code, origin);
        const id = await access.store.create({ userId: user.userId, naam: user.naam, rol: user.isAdmin ? 'beheerder' : 'bewoner' });
        res.writeHead(302, { location: pending.terug, 'set-cookie': sessionCookie(id, secure), 'cache-control': 'no-store' });
        res.end();
      } catch (error) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Inloggen lukte niet: ${(error as Error).message}\n`);
      }
      return;
    }
    if (path === '/auth/logout' && method === 'POST') {
      await access.store.remove(cookieValue(req, SESSION_COOKIE));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'set-cookie': sessionCookie(null, secure) });
      res.end('{"uitgelogd":true}');
      return;
    }
    sendJson(res, 404, { fout: 'onbekend' });
  }

  /**
   * De onboarding: een voorstel ophalen, of het beantwoorde voorstel bewaren.
   *
   * Twee methoden op één pad, omdat het over hetzelfde ding gaat. De GET is
   * altijd beschikbaar zolang de onboarding bestaat; de POST kwam hierboven
   * al langs de 405-muur en zit dus achter dezelfde voorwaarde.
   */
  async #onboarding(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
  ): Promise<void> {
    const onboarding = this.#options.onboarding;
    if (onboarding == null) {
      sendJson(res, 503, { wachten: 'de onboarding staat niet aan' });
      return;
    }

    if (method === 'GET' || method === 'HEAD') {
      try {
        const [proposal, existing] = await Promise.all([
          onboarding.proposal(),
          onboarding.existing(),
        ]);
        // `bestaande` erbij, zodat de pagina kan zeggen dat er al iets staat
        // vóórdat iemand op een knop drukt die toch zou weigeren.
        sendJson(res, 200, { ...proposal, bestaande: existing });
      } catch (error) {
        // Ontdekken vraagt Home Assistant iets, en dat kan misgaan zonder dat
        // er met deze dienst iets mis is. Geen 500: de pagina hoort te kunnen
        // zeggen wat er niet lukte.
        sendJson(res, 502, { fout: (error as Error).message });
      }
      return;
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return;
    }

    const answers =
      typeof body === 'object' && body != null && 'antwoorden' in body
        ? (body as { antwoorden: unknown }).antwoorden
        : null;
    if (typeof answers !== 'object' || answers == null || Array.isArray(answers)) {
      sendJson(res, 400, { fout: 'verwacht een object met veld "antwoorden"' });
      return;
    }

    const clean: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
      if (v == null) clean[k] = null;
      else if (typeof v === 'string') clean[k] = v;
      // Al het andere valt weg. `applyChoices` weigert wat niet in de
      // keuzelijst stond, dus dit is de tweede zeef en niet de enige.
    }

    const result = await onboarding.save(clean);
    sendJson(res, result.ok ? 200 : 422, result);
  }

  /**
   * Abonneert een kijker op de besluitenstroom.
   *
   * SSE en geen websocket: het verkeer gaat maar één kant op, browsers
   * herverbinden vanzelf, en het kost geen enkele afhankelijkheid.
   */
  #subscribe(res: ServerResponse, headOnly: boolean): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Achter een reverse proxy die buffert komt er anders niets door tot de
      // stroom sluit — en die sluit nooit.
      'x-accel-buffering': 'no',
    });
    if (headOnly) {
      res.end();
      return;
    }

    // Een kwartier stilte is normaal 's nachts. Zonder teken van leven sluit
    // een proxy of een telefoon in slaapstand de verbinding.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    ping.unref?.();
    const listener: Listener = { res, ping };
    this.#listeners.add(listener);

    res.on('close', () => {
      clearInterval(ping);
      this.#listeners.delete(listener);
    });

    // Meteen de huidige stand, zodat de pagina niet leeg blijft tot het
    // volgende besluit. Bij dertig seconden hartslag is dat lang genoeg om
    // voor kapot door te gaan.
    const snapshot = this.#options.latest();
    if (snapshot != null) this.#send(listener, snapshot);
  }

  #send(listener: Listener, snapshot: LiveSnapshot): void {
    listener.res.write(`data: ${JSON.stringify(this.#withResident(snapshot))}\n\n`);
  }

  /**
   * Het besluit onbewerkt, met het bewonerscontract ernaast (76, 94): per kamer
   * de stand in woorden, uitgerekend in de dienst. De kern blijft wat hij was;
   * de proefomgeving leest `bewoner`, de schaduwweergave de rest.
   */
  #withResident(snapshot: LiveSnapshot): LiveSnapshot & { bewoner?: ResidentView } {
    const config = this.#options.config;
    if (config == null) return snapshot;
    return { ...snapshot, bewoner: residentView(config, snapshot) };
  }

  /**
   * Er wordt aangebeld (besluit 107): elke open pagina toont het beeld van de
   * deurbel. De melding zegt alleen welke camera; het beeld vraagt de inlog.
   */
  ring(camera: string, naam: string, hoe: { readonly seconden: number; readonly schermAan: boolean } = { seconden: 120, schermAan: true }): void {
    const data = JSON.stringify({ camera, naam, tMs: Date.now(), seconden: hoe.seconden, schermAan: hoe.schermAan });
    for (const listener of this.#listeners) {
      try {
        listener.res.write(`event: aanbellen\ndata: ${data}\n\n`);
      } catch {
        clearInterval(listener.ping);
        this.#listeners.delete(listener);
      }
    }
  }

  /** Duwt een besluit naar alle kijkers. Hier hangt de runner zich aan. */
  publish(snapshot: LiveSnapshot): void {
    for (const listener of this.#listeners) {
      try {
        this.#send(listener, snapshot);
      } catch {
        // Een kijker die wegviel voordat 'close' afging. Opruimen en door;
        // dit mag de opname niet raken.
        clearInterval(listener.ping);
        this.#listeners.delete(listener);
      }
    }
  }

  /**
   * Het weer van de komende dagen (besluit 105), tien minuten vastgehouden. Bewaart
   * meteen wat er voor morgen verwacht wordt, zodat het huis die verwachting na
   * die dag naast de werkelijke opbrengst kan leggen; main roept dit daarom elke
   * tien minuten aan, ook als niemand kijkt.
   */
  async weatherNow(): Promise<WeatherReport | { wachten: string }> {
    const config = this.#options.config;
    const location = this.#options.location?.() ?? null;
    const weather = this.#options.weather;
    const logDir = this.#options.logDir;
    if (weather == null || config?.geometry == null || location == null || logDir == null) {
      return { wachten: 'het weer komt zodra de ligging van het huis en de panelen bekend zijn' };
    }
    const now = Date.now();
    if (this.#weather != null && now - this.#weather.atMs < 10 * 60_000) return this.#weather.report;
    const forecast = weather.forecast();
    if (forecast.length === 0) return { wachten: 'er is nog geen weerverwachting; kies een weerbron bij Functies' };
    this.#solar ??= new SolarHistory({ logDir });
    this.#today ??= new TodayCache(logDir, config);
    try {
      await this.#solar.refresh();
    } catch {
      // Dan met wat er al was.
    }
    await weather.log.load();
    const todayWh = await this.#today.get().then(
      (t) => t.zonWh,
      () => 0,
    );
    const report = weatherReport({
      forecast,
      predicted: weather.log.current,
      expected: weather.log.expected,
      solarDays: this.#solar.current,
      geometry: config.geometry,
      location,
      learned: learnSolar(this.#solar.current, config.geometry, location),
      todayWh,
      nowMs: now,
      timeZone: config.timezone,
      ...(weather.bron ? { bron: weather.bron() } : {}),
      ...(weather.uren ? { uren: weather.uren(), soortVanCode: kindOfCode } : {}),
    });
    this.#weather = { atMs: now, report };
    const morgen = report.dagen[0];
    if (morgen?.zonkansPct != null && morgen.verwachtKwh != null && morgen.kwartieren) {
      await weather.log.note(morgen.datum, morgen.zonkansPct, { kwh: morgen.verwachtKwh, kwartieren: morgen.kwartieren.map((q) => q.verwachtW) }).catch(() => {
        // Niet bewaard: de volgende keer opnieuw.
      });
    }
    return report;
  }

  /**
   * Camera's en de deurbel (besluit 109). GET geeft wat er gevonden is, het
   * voorstel en wat er vastligt; POST legt de keuzes vast, na de controle dat
   * Home Assistant elke camera en melder kent.
   */
  async #functies(req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
    const door = this.#options.functies;
    const gevonden = door?.gevonden() ?? null;
    if (door == null || gevonden == null) {
      sendJson(res, 503, { wachten: 'de camera’s en melders komen van Home Assistant zodra die verbonden is' });
      return;
    }
    if (method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const uit = controleerFuncties(body, gevonden);
      if (!uit.ok) {
        sendJson(res, 400, { fout: uit.reden });
        return;
      }
      await door.store.save(uit.functies);
    }
    // Of de installatie licht bedienen toestaat (HEMS_LIGHTS): anders valt er niets aan te zetten.
    sendJson(res, 200, { instellingen: door.store.current ? volledig(door.store.current, gevonden) : null, voorstel: functiesVoorstel(gevonden), gevonden, lichtMogelijk: this.#options.lights != null, schermMogelijk: this.#options.covers != null });
  }

  /** Schermen bedienen: de installatie staat het toe, en het staat aan bij Functies (besluit 121). */
  #schermMag(): boolean {
    return this.#options.covers != null && (this.#options.schermenAan?.() ?? true);
  }

  /** Licht bedienen: de installatie staat het toe, en de bewoner heeft het aan (besluit 111). */
  #lichtMag(): boolean {
    return this.#options.lights != null && (this.#options.lichtAan?.() ?? true);
  }

  /** Hoeveel live-beelden er nu lopen; meer dan dit belast Home Assistant en de NAS te veel. */
  #liveStreams = 0;

  async #camera(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const cam = this.#options.camera;
    const access = this.#options.access;
    if (cam == null) {
      sendJson(res, 503, { wachten: 'camera’s bekijken staat niet aan' });
      return;
    }
    if (access.kind === 'sessions' && (await access.store.visitor(cookieValue(req, SESSION_COOKIE))) == null) {
      sendJson(res, 401, { fout: 'log eerst in om de camera te bekijken', inlog: '/auth/login' });
      return;
    }
    const id = url.searchParams.get('id') ?? '';
    if (!CAMERA_ID.test(id) || !cam.ids().has(id)) {
      sendJson(res, 404, { fout: 'die camera kent het huis niet' });
      return;
    }
    const live = url.searchParams.get('live') === '1';
    if (live && this.#liveStreams >= 4) {
      sendJson(res, 429, { fout: 'er kijken al vier schermen mee; probeer het zo nog eens' });
      return;
    }
    const stop = new AbortController();
    req.on('close', () => stop.abort());
    let up: Response;
    try {
      up = await fetch(`${cam.base}/api/${live ? 'camera_proxy_stream' : 'camera_proxy'}/${id}`, {
        headers: { authorization: `Bearer ${cam.token}` },
        signal: stop.signal,
      });
    } catch {
      if (!res.headersSent) sendJson(res, 502, { fout: 'Home Assistant gaf geen beeld' });
      return;
    }
    if (!up.ok || up.body == null) {
      sendJson(res, 502, { fout: 'Home Assistant gaf geen beeld' });
      return;
    }
    res.writeHead(200, { 'content-type': up.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'no-store' });
    if (live) this.#liveStreams += 1;
    const klaar = () => {
      if (live) this.#liveStreams = Math.max(0, this.#liveStreams - 1);
    };
    Readable.fromWeb(up.body as import('node:stream/web').ReadableStream<Uint8Array>)
      .on('error', () => res.destroy())
      .on('close', klaar)
      .pipe(res);
  }

  async start(): Promise<number> {
    await new Promise<void>((ok, fail) => {
      this.#server.once('error', fail);
      this.#server.listen(this.#options.port, this.#options.host, () => {
        this.#server.removeListener('error', fail);
        ok();
      });
    });
    const address = this.#server.address();
    return typeof address === 'object' && address != null ? address.port : this.#options.port;
  }

  async stop(): Promise<void> {
    for (const listener of this.#listeners) {
      clearInterval(listener.ping);
      listener.res.end();
    }
    this.#listeners.clear();
    await new Promise<void>((ok) => this.#server.close(() => ok()));
  }

  get viewers(): number {
    return this.#listeners.size;
  }
}

/** Waar de gebouwde frontend staat, gerekend vanaf de pakketwortel. */
export function defaultWebDir(packageRoot: string): string {
  return join(packageRoot, 'web');
}
