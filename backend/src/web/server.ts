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
  /** De configuratie, voor de namen en de eenheden in de weergave. */
  readonly config: SiteConfig;
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
  sinds: string | undefined,
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
  const gewijzigd = info.mtime.toUTCString();
  if (sinds != null && sinds === gewijzigd) {
    res.writeHead(304, { 'cache-control': 'no-cache', 'last-modified': gewijzigd });
    res.end();
    return true;
  }

  res.writeHead(200, {
    'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-cache',
    'last-modified': gewijzigd,
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

    // Read-only als grens, niet als afspraak. Vóór de routering, zodat een
    // nieuwe route hem niet per ongeluk kan omzeilen.
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      res.end('Deze weergave leest alleen.\n');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (path === '/api/site') {
      sendJson(res, 200, siteInfo(this.#options.config));
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

    if (path === '/api/health') {
      const snapshot = this.#options.latest();
      sendJson(res, 200, {
        ok: true,
        laatsteBesluitMs: snapshot?.atMs ?? null,
        analyseBerekendOpMs: this.#options.divergence?.()?.berekendOpMs ?? null,
        kijkers: this.#listeners.size,
      });
      return;
    }

    const headOnly = method === 'HEAD';
    const target = path === '/' ? 'index.html' : path;
    const sinds = req.headers['if-modified-since'];
    if (
      await sendFile(
        res,
        this.#options.webDir,
        target,
        headOnly,
        typeof sinds === 'string' ? sinds : undefined,
      )
    ) {
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(headOnly ? undefined : 'Niet gevonden.\n');
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
