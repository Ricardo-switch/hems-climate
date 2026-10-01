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

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

import type { SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import type { DivergenceReport } from './divergence.js';
import type { Onboarding } from './onboarding.js';
import { exportInfo, writeExport } from './export.js';

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
   * Welke code er draait (besluit 54). Komt uit het image; zie `versionFromEnv`.
   *
   * Zonder dit moest "draait de nieuwe versie al?" worden afgeleid uit
   * herstarts in het logboek. Weglaten geeft `onbekend`, en dat is ook een
   * antwoord: dan is het image gebouwd zonder dat iemand het zei.
   */
  readonly version?: Version;
  /** Waar meldingen naartoe gaan. Standaard de console. */
  readonly write?: (line: string) => void;
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
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
    const mayWrite = this.#options.onboarding != null && path === '/api/onboarding';
    if (method !== 'GET' && method !== 'HEAD' && !(method === 'POST' && mayWrite)) {
      res.writeHead(405, {
        allow: mayWrite ? 'GET, HEAD, POST' : 'GET, HEAD',
        'content-type': 'text/plain; charset=utf-8',
      });
      res.end('Deze weergave leest alleen.\n');
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

    if (path === '/api/state') {
      const snapshot = this.#options.latest();
      if (snapshot == null) {
        // 503 en niet 200-met-null: er ís nog geen stand, en dat is iets
        // anders dan een lege stand. De pagina kan dat onderscheid tonen.
        sendJson(res, 503, { wachten: 'nog geen besluit genomen' });
        return;
      }
      sendJson(res, 200, snapshot);
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
    listener.res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
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
