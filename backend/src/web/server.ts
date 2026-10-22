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

import { assistKamers } from './assist.js';
import { timingSafeEqual } from 'node:crypto';
import { Readable, pipeline } from 'node:stream';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { Geometry, SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import { exportInfo, writeExport } from './export.js';
import { MAX_BACKUP, backupNaam } from './gegevens.js';
import { TodayCache, withHistory } from './today.js';
import { SolarHistory, learnSolar } from './solar-learn.js';
import { validateConnection } from './aansluiting.js';
import { importFromPrefs, pricesInPrefs, type DashboardPrice, type MeterOption } from './energy.js';
import { PERIODS, periodRange, yearStartOf, yieldReport, type PeriodKind, type YieldReport } from './yield.js';
import { partsIn, zonedMidnight } from './today.js';
import { PICTURE_FILE } from './scene-pictures.js';
import { ask, LANGS, parseQuestion } from './assistant.js';
import type { AskContext, Lang, Question } from './assistant.js';
import { uitspraak } from './uitspraak.js';
import { afsluiter, begrijp, isRuis, MAX_TEKST } from './woordzoeker.js';
import { gevelsUitOmtrek, haalOmtrek, voorkantUitKaart, type Punt } from './kaart.js';
import { bedienbaar, herkenOpdracht, type Bedienbaar, type Herkend } from './opdracht.js';
import { inEigenWoorden, kies, PROEF_MS, WACHT_MS, type Vraag } from './taalmodel.js';
import { Luisterpost } from './luisterpost.js';
import { accepteer, isUpgrade, weiger } from './websocket.js';
import type { Duplex } from 'node:stream';
import { residentView, type ResidentView } from './resident.js';
import { sunReport } from './sun.js';
import { CAMERA_ID } from './camera.js';
import { expectedAndActual, expectedTotal, weatherReport, type ExpectedTotal, type WeatherReport } from './weather.js';
import { kindOfCode } from './open-meteo.js';
import { OUTSIDE_FLOOR, floorName, floorOrder, standardFloors } from './layout.js';
import { controleer as controleerFuncties, functiesVoorstel, volledig } from './functies.js';
import { DOOR_ROLES, SESSION_COOKIE, cookieValue, hostAllowed, ingressVisitor, newState, openZonderInlog, safeReturn, sessionCookie, viaTailscale, type Access, type Visitor } from './auth.js';
import type { Wie } from './bewoners.js';
import { startOfLocalDay } from './today.js';
import { MAX_ZEG } from './stem.js';
import { NIEUW, TERUGKIJKEN, VERSIE } from '../version.js';
import { LiveStroom, type AlarmMelder } from './live.js';

export type { AlarmMelder } from './live.js';
import { UNKNOWN_VERSION, type WebOptions } from './server-opties.js';

export { UNKNOWN_VERSION, versionFromEnv, type Version, type WebOptions } from './server-opties.js';
import { INPAKKEN, MAX_BODY, inpakkingVoor, readJson, sameOrigin, sendFile, sendJson, verderNa } from './http.js';


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
 * De taal van de pagina (besluit 185): `?taal=` of de kop `x-taal`, die de app
 * meestuurt. Niet Accept-Language: die zet de browser zelf, en dan zou de
 * uitleg wisselen met de taal van de telefoon in plaats van die van de app.
 */
export function taalVan(x: unknown): Lang {
  const t = Array.isArray(x) ? x[0] : x;
  return typeof t === 'string' && (LANGS as readonly string[]).includes(t) ? (t as Lang) : 'nl';
}

export class WebServer {
  readonly #options: WebOptions & { host: string; write: (line: string) => void };
  readonly #server: Server;
  /** De eigen poort (besluit 160), of null. */
  readonly #eigen: Server | null = null;
  #eigenPort: number | null = null;
  /** De toegang van een verzoek op de eigen poort; de rest volgt `access`. */
  readonly #toegang = new WeakMap<IncomingMessage, Access>();
  readonly #live: LiveStroom;
  #today: TodayCache | null = null;
  /** Het weerrapport, tien minuten vastgehouden: vijf dagen zon uitrekenen kost wat. */
  #weather: { atMs: number; report: WeatherReport; geometry: Geometry } | null = null;
  #solar: SolarHistory | null = null;

  constructor(options: WebOptions) {
    this.#options = {
      ...options,
      host: options.host ?? '0.0.0.0',
      write: options.write ?? ((line) => console.log(line)),
    };
    this.#live = new LiveStroom({
      laatste: () => this.#options.latest(),
      metBewoner: (snapshot, taal) => this.#withResident(snapshot, taalVan(taal)),
      huis: () => this.#options.house?.() ?? null,
    });
    const verzoek = (req: IncomingMessage, res: ServerResponse) => {
      void this.#handle(req, res).catch((error: unknown) => {
        // Een verzoek dat onderuitgaat mag de dienst niet meenemen. De
        // schaduwopname is het product; dit is een venster erop.
        if (!res.headersSent) sendJson(res, 500, { error: String(error) });
        else res.end();
      });
    };
    // De microfoon (besluit 150): een websocket, alleen voor `/api/luister`.
    const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      void this.#luister(req, socket, head).catch(() => socket.destroy());
    };
    this.#server = createServer(verzoek);
    this.#server.on('upgrade', upgrade);
    /*
     * De eigen poort (besluit 160): dezelfde app met een eigen inlog, en alleen
     * via Tailscale. Een kop van Ingress telt hier niet, want de toegang is die
     * van de eigen poort.
     */
    const eigen = options.eigenPoort;
    if (eigen != null) {
      this.#eigen = createServer((req, res) => {
        if (!viaTailscale(req)) {
          res.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Open Smart Climate via het adres in Tailscale (https://….ts.net).\n');
          return;
        }
        this.#toegang.set(req, eigen.access);
        // Het adres waarop Smart Climate in Tailscale staat, voor de knop Op je startscherm.
        this.#eigenAdres = `https://${String(req.headers.host).replace(/:443$/, '')}`;
        verzoek(req, res);
      });
      this.#eigen.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!viaTailscale(req)) return weiger(socket, 421, 'Misdirected Request');
        this.#toegang.set(req, eigen.access);
        upgrade(req, socket, head);
      });
    }
  }

  /** Het adres van de eigen poort in Tailscale, zodra iemand het gebruikte; null tot dan. */
  #eigenAdres: string | null = null;

  /** De toegang voor dit verzoek: die van de eigen poort, of anders die van de dienst. */
  #access(req: IncomingMessage): Access {
    return this.#toegang.get(req) ?? this.#options.access;
  }

  #luisterpost: Luisterpost | null = null;
  readonly #luistersockets = new Set<Duplex>();

  /**
   * Een websocket voor de microfoon (besluit 150). Dezelfde poort als de rest:
   * alleen bekende hostnamen, alleen vanaf de eigen pagina (een browser stuurt
   * bij een websocket altijd een Origin), en met de inlog van de app.
   */
  async #luister(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const deur = this.#options.luisteren;
    if (url.pathname !== '/api/luister' || deur == null || !isUpgrade(req)) return weiger(socket, 404, 'Not Found');
    const access = this.#access(req);
    if (access.kind !== 'ingress' && !hostAllowed(req.headers.host, access.kind === 'sessions' ? access.hosts : [])) return weiger(socket, 421, 'Misdirected Request');
    if (!req.headers.origin || !sameOrigin(req)) return weiger(socket, 403, 'Forbidden');
    if (access.kind === 'sessions' && (await access.store.visitor(cookieValue(req, SESSION_COOKIE))) == null) return weiger(socket, 401, 'Unauthorized');
    const begin = url.searchParams.get('start') === 'spraak' ? 'stt' : 'wake_word';
    if (head.length > 0) socket.unshift(head);
    this.#luistersockets.add(socket);
    socket.on('close', () => this.#luistersockets.delete(socket));
    this.#luisterpost ??= new Luisterpost(deur);
    const post = this.#luisterpost;
    // Geluid dat binnenkomt voordat Home Assistant klaarstaat, wacht even (hooguit een paar seconden).
    const wacht: Buffer[] = [];
    let ronde: Awaited<ReturnType<Luisterpost['begin']>> | null = null;
    let dicht = false;
    const verbinding = accepteer(req, socket, {
      binair: (d) => (ronde ? ronde.geluid(d) : wacht.length < 60 && wacht.push(d)),
      tekst: (t) => ronde?.tekst(t),
      dicht: () => {
        dicht = true;
        ronde?.dicht();
      },
    });
    ronde = await post.begin(verbinding, begin);
    for (const d of wacht.splice(0)) ronde.geluid(d);
    if (dicht) ronde.dicht();
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const access = this.#access(req);
    const inpakken = access.kind === 'ingress' ? null : inpakkingVoor(req);
    if (inpakken) INPAKKEN.set(res, inpakken);

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
     * Inloggen voor de hele app (besluit 147), niet alleen voor bedienen. Elke
     * pagina en elke vraag aan de dienst vraagt een inlog; zonder gaat een
     * pagina naar het inloggen en krijgt een vraag 401. Open blijven het
     * inloggen zelf, of de dienst draait, en opmaak en script. De assistent van
     * Home Assistant stelt zijn vraag met een eigen sleutel.
     */
    if (access.kind === 'sessions' && !openZonderInlog(path) && !this.#metSleutel(req, url, path)) {
      const visitor = await access.store.visitor(cookieValue(req, SESSION_COOKIE));
      if (visitor == null) {
        if (path.startsWith('/api/') || path.startsWith('/scene-plaatjes/')) {
          sendJson(res, 401, { fout: 'log eerst in', inlog: '/auth/login' });
        } else {
          res.writeHead(302, { location: `/inloggen.html?terug=${encodeURIComponent(path === '/' ? '/thuis.html' : path)}`, 'cache-control': 'no-store' });
          res.end();
        }
        return;
      }
      // Al ingelogd, maar nog nooit langs "wie ben je?" (wie inlogde vóór besluit 147): eerst dat.
      const pagina = path === '/' || path.endsWith('.html');
      if (pagina && path !== '/welkom.html' && visitor.userId != null && this.#options.bewoners) {
        const eerst = await this.#options.bewoners.herken({ userId: visitor.userId, naam: visitor.naam }).catch(() => null);
        if (eerst != null) {
          res.writeHead(302, { location: `/welkom.html?terug=${encodeURIComponent(path === '/' ? '/thuis.html' : path)}#${eerst}`, 'cache-control': 'no-store' });
          res.end();
          return;
        }
      }
    }

    /*
     * In de add-on is de app de voordeur (besluit 154). Zonder configuratie is
     * het huis leeg: elke pagina van de app gaat dan naar het welkom. De
     * cijferpagina blijft bestaan voor wie hem direct opent.
     *
     * Achter Ingress altijd een relatief adres: de app staat daar onder een pad
     * van Home Assistant, en `/thuis.html` zou naar Home Assistant zelf gaan.
     */
    if (this.#options.onboarding != null && (method === 'GET' || method === 'HEAD') && (path === '/' || path.endsWith('.html'))) {
      const pagina = path.slice(1);
      const leeg = this.#options.config == null;
      const naar = (doel: string) => {
        res.writeHead(302, { location: doel, 'cache-control': 'no-store' });
        res.end();
      };
      if (leeg && pagina !== '' && pagina !== 'begin.html' && pagina !== 'index.html') return naar('begin.html');
      if (!leeg && pagina === 'begin.html') return naar('thuis.html');
      // Wie voor het eerst komt, krijgt eerst "wie ben je?" (besluit 147), ook achter Ingress.
      if (!leeg && access.kind === 'ingress' && pagina !== 'welkom.html' && pagina !== 'index.html' && this.#options.bewoners) {
        const visitor = await ingressVisitor(req);
        if (visitor.userId != null) {
          const eerst = await this.#options.bewoners.herken({ userId: visitor.userId, naam: visitor.naam }).catch(() => null);
          if (eerst != null) return naar(`welkom.html?terug=${encodeURIComponent(pagina || 'thuis.html')}#${eerst}`);
        }
      }
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
      // Een melding niet meer laten zien (besluit 136): alleen in het eigen bestand.
      (this.#options.meldingen != null && path === '/api/meldingen') ||
      // Thuis naar eigen smaak (besluit 162): alleen wat er gekozen is, in het eigen bestand.
      (this.#options.voorkeuren != null && path === '/api/voorkeuren') ||
      // De integratie neerzetten (besluit 184): alleen custom_components/smart_climate, na een tik van de beheerder.
      (this.#options.integratie != null && path === '/api/integratie') ||
      // Een proefmelding naar je eigen telefoon (besluit 183): alleen notify.mobile_app_…
      (this.#options.proefmelding != null && path === '/api/proefmelding') ||
      (this.#options.energy != null && path === '/api/energie') ||
      // De zon en je aansluiting (besluit 103): alleen antwoorden, naar een eigen bestand.
      (this.#options.connection != null && path === '/api/aansluiting') ||
      // De gevels op de kaart (21 oktober 2026): niets bewaren, alleen een vraag aan OpenStreetMap.
      (this.#options.location != null && path === '/api/gevel-kaart') ||
      // De add-on bijwerken (21 oktober 2026): update.install op de eigen add-on, en niets anders.
      (this.#options.bijwerken != null && path === '/api/update') ||
      (this.#options.layout != null && path === '/api/indeling') ||
      // Camera's en de deurbel (besluit 109): alleen de keuzes, naar een eigen bestand.
      (this.#options.functies != null && path === '/api/functies') ||
      // Comfort (besluit 130): doelen voor de regeling, naar een eigen bestand.
      (this.#options.comfort != null && path === '/api/comfort') ||
      // Bewoners (besluit 147): naar een eigen bestand, en nooit naar Home Assistant.
      (this.#options.bewoners != null && path === '/api/bewoners') ||
      (this.#options.lights != null && path === '/api/licht') ||
      // Schermen (besluit 121): open, dicht, stop of een stand, voor de bewoner.
      (this.#options.covers != null && path === '/api/scherm') ||
      // Scènes (besluit 100): een eigen smalle deur naast het licht.
      (this.#options.lights?.scenesEnabled === true && path === '/api/scene') ||
      // Een back-up terugzetten en opnieuw beginnen (besluit 151): alleen de eigen bestanden.
      (this.#options.gegevens != null && (path === '/api/back-up' || path === '/api/opnieuw')) ||
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
      // Wie is het, en mag dat (besluit 99)? Achter Ingress ook (besluit 161).
      const role = DOOR_ROLES[path];
      if (role != null && access.kind !== 'open') {
        const visitor = await this.#bezoeker(req);
        if (visitor == null) {
          sendJson(res, 401, { fout: 'log eerst in', inlog: '/auth/login' });
          return;
        }
        if (role === 'beheerder' && visitor.rol !== 'beheerder') {
          sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
          return;
        }
      }
      // Een gast (besluit 147): bedienen alleen als hij thuis is, en verder niets bewaren. Achter Ingress ook (besluit 161).
      const gast = access.kind !== 'open' && path !== '/auth/logout' ? await this.#gast(req) : null;
      // Behalve bij Bewoners: daar kan een gast zeggen dat hij een scherm is (besluit 151), en de deur laat verder niets toe.
      if (gast?.gast && path !== '/api/bewoners') {
        const bedienen = path === '/api/licht' || path === '/api/scene' || path === '/api/scherm';
        if (!bedienen) {
          sendJson(res, 403, { fout: 'als gast kun je kijken; dit verandert iets aan het huis' });
          return;
        }
        if (gast.thuis !== true) {
          sendJson(res, 403, { fout: 'als gast bedien je alleen als je thuis bent' });
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
      const config = this.#config();
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

    if (path === '/api/update') {
      const b = this.#options.bijwerken;
      if (b == null) {
        sendJson(res, 200, { beschikbaar: false, nu: VERSIE, nieuwste: null, bezig: false, notities: [], magBijwerken: false });
        return;
      }
      const wie = await this.#wie(req);
      if (method === 'POST') {
        const uit = await b.installeer();
        if (!uit.ok) {
          sendJson(res, 409, { fout: uit.reden ?? 'bijwerken lukte niet' });
          return;
        }
      }
      sendJson(res, 200, await b.view(wie.beheerder));
      return;
    }

    if (path === '/api/gevel-kaart' && method === 'POST') {
      await this.#gevelKaart(req, res);
      return;
    }

    if (path === '/api/functies') {
      await this.#functies(req, res, method);
      return;
    }

    // De integratie in Home Assistant (besluit 184): hoe hij erbij staat, en neerzetten; alleen de beheerder.
    if (path === '/api/integratie') {
      const integratie = this.#options.integratie;
      const wie = await this.#wie(req);
      if (integratie == null) {
        sendJson(res, 200, { kan: false, staat: 'nee', versie: null, nieuw: null, geladen: null, toegevoegd: null });
        return;
      }
      if (!wie.beheerder) {
        sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
        return;
      }
      if (method !== 'POST') {
        sendJson(res, 200, await integratie.stand());
        return;
      }
      const uit = await integratie.zetNeer();
      if (uit.ok) sendJson(res, 200, await integratie.stand());
      else sendJson(res, 409, { fout: uit.reden });
      return;
    }

    // Een proefmelding naar je eigen telefoon (besluit 183).
    if (path === '/api/proefmelding') {
      if (method !== 'POST' || this.#options.proefmelding == null) {
        sendJson(res, method !== 'POST' ? 405 : 503, { fout: 'een proefmelding is een POST, in de add-on' });
        return;
      }
      const wie = await this.#wie(req);
      const uit = await this.#options.proefmelding(wie.userId);
      if (uit.ok) sendJson(res, 200, uit);
      else sendJson(res, uit.status, { fout: uit.reden });
      return;
    }

    // De deurbel als kaart op Thuis (besluit 182): welk beeld, en wanneer er het laatst werd aangebeld.
    if (path === '/api/deurbel') {
      const d = this.#options.deurbel?.() ?? null;
      sendJson(res, 200, d ? { aan: true, ...d } : { aan: false });
      return;
    }

    if (path === '/api/comfort') {
      const comfort = this.#options.comfort;
      if (comfort == null) {
        sendJson(res, 503, { wachten: 'comfort instellen kan pas met een configuratie en een logmap' });
        return;
      }
      const wie = await this.#wie(req);
      const van = url.searchParams.get('bewoner');
      if (method !== 'POST') {
        sendJson(res, 200, comfort.view(wie, van));
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await comfort.save(body, wie, van);
      if (result.ok) sendJson(res, 200, result.view);
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    if (path === '/api/opbrengst') {
      await this.#yield(res, url.searchParams);
      return;
    }

    if (path === '/api/bewoners') {
      const bewoners = this.#options.bewoners;
      if (bewoners == null) {
        sendJson(res, 503, { wachten: 'bewoners kan pas met een configuratie en een logmap' });
        return;
      }
      const wie = await this.#wie(req);
      if (method !== 'POST') {
        sendJson(res, 200, bewoners.view(wie));
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await bewoners.actie(body, wie);
      if (result.ok) sendJson(res, 200, result.view);
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    /*
     * Thuis naar eigen smaak (besluit 162): je eigen kaarten en favorieten op de
     * telefoon, je thema en je kleur, en de wand in het profiel van wiens
     * comfort geldt (besluit 181).
     */
    if (path === '/api/voorkeuren') {
      const voorkeuren = this.#options.voorkeuren;
      if (voorkeuren == null) {
        sendJson(res, 503, { wachten: 'kiezen kan pas met een logmap' });
        return;
      }
      const wie = await this.#wie(req);
      const profiel = this.#options.profielen?.(wie.userId);
      const kijker = { userId: wie.userId, magWand: wie.beheerder || (await this.#hoofd(req)), ...(profiel ? { profielen: profiel.profielen, scherm: profiel.scherm } : {}) };
      // De telefoons voor de meldingen (besluit 183) staan erbij: die komen uit Home Assistant, niet uit het bestand.
      const telefoons = this.#options.telefoons?.(wie.userId) ?? [];
      if (method !== 'POST') {
        sendJson(res, 200, { ...voorkeuren.view(kijker), telefoons });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return;
      }
      const result = await voorkeuren.save(body, kijker);
      if (result.ok) sendJson(res, 200, { ...result.view, telefoons });
      else sendJson(res, result.status, { fout: result.reden });
      return;
    }

    // De sleutel voor de assistent van Home Assistant (besluit 147): alleen voor een beheerder.
    if (path === '/api/sleutel') {
      const wie = await this.#wie(req);
      if (!wie.beheerder) sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
      else if (this.#options.sleutel == null) sendJson(res, 404, { fout: 'er is geen sleutel' });
      else {
        const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]!.trim();
        sendJson(res, 200, { sleutel: this.#options.sleutel, adres: this.#options.sleutelAdres ?? `${proto}://${req.headers.host}/api/vraag` });
      }
      return;
    }

    if (path === '/api/meldingen') {
      const store = this.#options.meldingen;
      if (store == null) {
        sendJson(res, 200, { actief: [], eerder: [] });
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
        const vraag = typeof body === 'object' && body != null ? (body as Record<string, unknown>) : {};
        // "verwijder" haalt elke melding weg; "negeer" blijft voor wat er al was.
        const gelukt = vraag['verwijder'] != null ? store.verwijder(vraag['verwijder']) : store.negeer(vraag['negeer']);
        if (!gelukt) {
          sendJson(res, 400, { fout: 'die melding is er niet' });
          return;
        }
        await store.bewaar().catch(() => undefined);
        // Weggehaald op de telefoon: ook weg op de wand.
        this.meldingenVeranderd();
      }
      sendJson(res, 200, store.lijst(Date.now()));
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
        // De temperatuur en het dagdeel van nu erbij (besluit 134): daaruit leert het huis wat jij prettig vindt.
        const snap = this.#options.latest();
        const zoneId = typeof body === 'object' && body != null ? (body as Record<string, unknown>)['zoneId'] : null;
        const pz = snap?.explanation.perZone.find((z) => z.zoneId === zoneId);
        const result = await feedback.add(body, { temperatuurC: pz?.temperatureC ?? null, dagdeel: snap?.explanation.mode ?? null });
        if (result.ok) sendJson(res, 200, result.record);
        else sendJson(res, result.status, { fout: result.reden });
        return;
      }
      // Wat er is vastgelegd: standaard de afgelopen 24 uur, of tot acht weken terug (besluit 134).
      const dagen = Math.max(1, Math.min(56, Number(url.searchParams.get('dagen')) || 1));
      sendJson(res, 200, await feedback.since(Date.now() - dagen * 86_400_000));
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
      sendJson(res, 200, this.#withResident(snapshot, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
      return;
    }

    if (path === '/api/events') {
      this.#live.abonneer(res, method === 'HEAD', taalVan(url.searchParams.get('taal')));
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
      const config = this.#config();
      if (logDir == null || config == null) {
        sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er is geen dag om te tonen' });
        return;
      }
      this.#today ??= new TodayCache(logDir, config);
      try {
        // ?dag=gisteren: de hele dag ervoor, in dezelfde vorm.
        const gisteren = url.searchParams.get('dag') === 'gisteren';
        let rapport = await (gisteren ? this.#today.yesterday() : this.#today.get());
        // Kwartieren zonder eigen meting uit de statistiek van Home Assistant (17 oktober 2026).
        const historie = this.#options.historie;
        if (historie && rapport.kwartieren.some((q) => q.zonW == null || q.netW == null)) {
          const h = await historie(rapport.vanMs, rapport.totMs).catch(() => null);
          if (h) rapport = withHistory(rapport, h.zon, h.net);
        }
        sendJson(res, 200, rapport);
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
    // De stem (besluit 141): het geluid van een zin, of welke stem er is.
    if (path === '/api/stem') {
      const stem = this.#options.stem;
      const tekst = url.searchParams.get('tekst');
      if (tekst == null) {
        // Welke stem, en of die Nederlands kan; zonder Nederlands gebruikt de pagina de stem van het apparaat.
        const nl = stem ? await stem.nederlands().catch(() => ({ taal: null, voice: null })) : { taal: null, voice: null };
        sendJson(res, 200, { stem: stem?.naam ?? null, taal: nl.taal, voice: nl.voice });
        return;
      }
      if (stem == null || stem.naam == null) {
        sendJson(res, 404, { fout: 'er is geen lokale stem in Home Assistant' });
        return;
      }
      if (tekst.trim() === '' || tekst.length > MAX_ZEG) {
        sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_ZEG} tekens zijn` });
        return;
      }
      try {
        const g = await stem.zeg(tekst);
        res.writeHead(200, { 'content-type': g.type, 'content-length': g.data.length, 'cache-control': 'private, max-age=3600' });
        res.end(g.data);
      } catch (error) {
        sendJson(res, 502, { fout: (error as Error).message });
      }
      return;
    }

    /*
     * Voor de integratie in Home Assistant (besluit 184): de kamers en de
     * woorden waarmee je ze noemt, zodat Assist ze in elk huis herkent. Met
     * dezelfde sleutel als de vragen; er staat geen entiteit in.
     */
    if (path === '/api/assist') {
      const config = this.#config();
      if (config == null) {
        sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
        return;
      }
      sendJson(res, 200, assistKamers(config, this.#options.house?.() ?? null, this.#options.version?.nummer ?? null));
      return;
    }

    if (path === '/api/vraag') {
      const config = this.#config();
      if (config == null) {
        sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
        return;
      }
      // Het taalmodel (besluit 148), als de bewoner er een koos; anders null.
      const model = this.#options.praten?.model() ?? null;
      // De assistent van Home Assistant (147) bedient niets: die schakelt zelf.
      const viaSleutel = this.#metSleutel(req, url, path);
      // Een vraag in eigen woorden (besluit 115): de woordzoeker maakt er een
      // vaste vraag van, of antwoordt zelf over de app.
      let parsed: { question: Question; lang: Lang };
      let vrijeTekst: string | null = null;
      if ((url.searchParams.get('v') ?? '').toLowerCase() === 'vrij') {
        const taal = (url.searchParams.get('taal') ?? 'nl').toLowerCase();
        const lang: Lang = (LANGS as readonly string[]).includes(taal) ? (taal as Lang) : 'nl';
        const tekst = (url.searchParams.get('tekst') ?? '').trim();
        if (tekst === '' || tekst.length > MAX_TEKST) {
          sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_TEKST} tekens zijn` });
          return;
        }
        vrijeTekst = tekst;
        // Alleen geluid, of het gesprek is klaar (21 oktober 2026): geen vraag.
        if (isRuis(tekst)) {
          sendJson(res, 200, { vraag: 'ruis', taal: lang, kamer: null, antwoord: '', feiten: [], gesproken: '' });
          return;
        }
        const klaar = afsluiter(tekst, lang);
        if (klaar != null) {
          sendJson(res, 200, { vraag: 'klaar', taal: lang, kamer: null, antwoord: klaar, feiten: [], gesproken: uitspraak(klaar) });
          return;
        }
        // Bedienen met een zin (besluit 148): eerst de woordzoeker, en wat die
        // niet begrijpt het taalmodel. De pagina stuurt de opdracht naar de deur.
        const lijst = viaSleutel || this.#options.praten?.bedienen() === false ? null : this.#bedienbaar();
        const herkend = lijst ? herkenOpdracht(tekst, lijst, lang, url.searchParams.get('scherm')) : null;
        if (herkend) {
          sendJson(res, 200, await this.#opdrachtAntwoord(herkend, tekst, lang, model));
          return;
        }
        let b = begrijp(tekst, config, lang);
        if (b.soort === 'onbekend' && model != null) {
          const zones = config.zones.map((z) => ({ id: z.id, naam: z.name }));
          const keuze = await kies(model, tekst, lijst ?? bedienbaar(null, { licht: false, scenes: false, schermen: false }), zones, lang);
          if (keuze.soort === 'opdracht') {
            sendJson(res, 200, await this.#opdrachtAntwoord(keuze.herkend, tekst, lang, model));
            return;
          }
          if (keuze.soort === 'vraag') b = { soort: 'huis', vraag: keuze.vraag };
        }
        if (b.soort === 'app') {
          sendJson(res, 200, { vraag: 'app', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], link: b.link, gesproken: uitspraak(b.antwoord) });
          return;
        }
        if (b.soort === 'onbekend') {
          // Hardop staan de voorbeelden er zelf in (besluit 166); op het scherm zijn het knoppen.
          sendJson(res, 200, { vraag: 'onbekend', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], voorbeelden: b.voorbeelden, gesproken: uitspraak(b.gesproken) });
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
      if ((parsed.question.kind === 'zon' || parsed.question.kind === 'vandaag') && logDir != null) {
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
      // De weersverwachting bij de zon, straks en morgen (besluit 141, 142); uit dezelfde bron als Vandaag.
      let weer = null;
      const kind = parsed.question.kind;
      if (kind === 'zon' || kind === 'straks' || kind === 'weer' || kind === 'morgen') {
        const w = await this.weatherNow().catch(() => null);
        if (w && 'vandaag' in w) {
          const m = w.dagen[0];
          const morgen = m ? { tekst: m.tekst, minC: m.minC, maxC: m.maxC, regenkansPct: m.regenkansPct, verwachtKwh: m.verwachtKwh } : null;
          // De rest van vandaag (besluit 166): uit de uren tot middernacht, anders het weer van nu.
          const nu = Date.now();
          const eind = startOfLocalDay(nu, config.timezone) + 24 * 3_600_000;
          const uren = w.vandaag.uren.filter((u) => u.tMs < eind);
          const temps = uren.map((u) => u.buitenC).filter((t): t is number => t != null);
          const regen = uren.map((u) => u.regenkansPct).filter((r): r is number => r != null);
          const vandaag = {
            tekst: w.vandaag.tekst,
            minC: temps.length ? Math.min(...temps) : w.vandaag.buitenC,
            maxC: temps.length ? Math.max(...temps) : w.vandaag.buitenC,
            regenkansPct: regen.length ? Math.max(...regen) : null,
          };
          weer = { opgewektKwh: w.vandaag.opgewektKwh, verwachtKwh: w.vandaag.verwachtKwh, voorafKwh: w.vandaag.verwachtVoorafKwh, vandaag, morgen };
        }
      }
      // Wat de apparaten met een meter deze maand kostten (besluit 142), uit Opbrengst.
      const kosten = kind === 'kosten' ? await this.#kostenDezeMaand(config).catch(() => null) : null;
      const antwoord = ask(parsed.question, {
        weer,
        kosten,
        zoninval,
        config,
        snapshot: this.#options.latest(),
        today,
        nowMs: Date.now(),
        // Tot stap B schrijft de dienst niets (besluit 15): hij is altijd schaduw.
        shadow: true,
        lang: parsed.lang,
      });
      // In eigen woorden (besluit 148), met het vaste antwoord als vangnet.
      const eigen = model ? await inEigenWoorden(model, vrijeTekst, antwoord, parsed.lang) : { antwoord: antwoord.antwoord, eigen: false };
      // Hoe het klinkt (besluit 142), voor de stem van het apparaat zelf.
      sendJson(res, 200, { ...antwoord, antwoord: eigen.antwoord, eigen: eigen.eigen, gesproken: uitspraak(eigen.antwoord) });
      return;
    }

    /*
     * Praten met je huis (besluit 148): één vraag aan een AI-taak, voor "Nog
     * een keer proberen" bij Functies. Alleen een AI-taak die Home Assistant
     * kent; er verandert niets.
     */
    if (path === '/api/praten/proef') {
      const praten = this.#options.praten;
      const config = this.#config();
      const id = url.searchParams.get('model') ?? '';
      const kent = this.#options.functies?.gevonden()?.taalmodellen?.some((m) => m.id === id) ?? false;
      if (praten == null || config == null || !kent) {
        sendJson(res, 404, { fout: 'die AI-taak kent Home Assistant niet' });
        return;
      }
      const vast = ask({ kind: 'nu' }, { config, snapshot: this.#options.latest(), today: null, nowMs: Date.now(), shadow: true, lang: 'nl' });
      // Tijdens een pauze (gebruik op, te druk): zeggen tot wanneer, zonder het model te vragen.
      const pauze = praten.pauze?.(id) ?? null;
      if (pauze) {
        const om = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone }).format(pauze.tot);
        sendJson(res, 200, { vast: vast.antwoord, eigen: null, reden: `${pauze.reden} Rond ${om} probeert de assistent het weer; tot dan hoor je het vaste antwoord.`, ms: null });
        return;
      }
      // Lang genoeg wachten om te zien hoe traag het model is; de assistent zelf wacht korter.
      const eigen = await inEigenWoorden(praten.proef(id), 'Wat doe je nu?', vast, 'nl', PROEF_MS);
      const seconden = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
      const traag = eigen.ms != null && eigen.ms > WACHT_MS;
      const reden = traag
        ? `Het model deed er ${seconden(eigen.ms!)} seconden over. De assistent wacht hooguit ${WACHT_MS / 1000} seconden; daarna hoor je het vaste antwoord. Kies een sneller model, zoals een met flash-lite in de naam.`
        : eigen.reden;
      sendJson(res, 200, { vast: vast.antwoord, eigen: eigen.eigen ? eigen.antwoord : null, reden, ms: eigen.ms, snel: eigen.eigen && !traag });
      return;
    }

    /*
     * De zoninval (besluit 93): waar de zon staat, op welke gevel hij valt, en
     * wat de panelen bij een heldere lucht zouden leveren.
     */
    if (path === '/api/zon') {
      const config = this.#config();
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
      const taal = taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']);
      const config = this.#config();
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
        etages: [...floorOrder(door.store.current ?? door.proposal() ?? { kamers: [] }), OUTSIDE_FLOOR].map((id) => ({ id, standaardNaam: floorName(id, taal) })),
        standaard: standardFloors(taal),
        regelzones: config.zones.map((z) => ({ id: z.id, naam: z.name })),
      });
      return;
    }

    if (path === '/api/huis') {
      const house = this.#options.house?.(taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])) ?? null;
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

    if (path === '/api/gegevens' || path === '/api/back-up' || path === '/api/opnieuw') {
      await this.#gegevens(req, res, method, path);
      return;
    }

    if (path === '/api/export') {
      // Je gegevens downloaden is meer dan kijken: niet voor een gast (besluit 147), en sinds besluit 151 alleen de hoofdgebruiker.
      if ((await this.#gast(req))?.gast) {
        sendJson(res, 403, { fout: 'als gast kun je de gegevens niet downloaden' });
        return;
      }
      if (this.#options.gegevens && !(await this.#hoofd(req))) {
        sendJson(res, 403, { fout: 'alleen de hoofdgebruiker kan het logboek downloaden' });
        return;
      }
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
      await writeExport(logDir, res, new Date(), await this.#options.gegevens?.analyse());
      return;
    }

    // De versie en wat er nieuw is (besluit 131), voor App en toegang.
    /*
     * Op je startscherm (21 oktober 2026): installeren met het eigen icoon kan
     * alleen over https en buiten Home Assistant, dus via de eigen poort in
     * Tailscale (besluit 160). Of die openstaat, en op welk adres hij al eens
     * gebruikt is; anders raadt de app het adres uit dat van Home Assistant.
     */
    // Klaarzetten in Home Assistant (besluit 179): per functie wat er staat en wat er mist.
    if (path === '/api/klaarzetten') {
      sendJson(res, 200, { punten: this.#options.klaarzetten ? await this.#options.klaarzetten() : [] });
      return;
    }

    if (path === '/api/startscherm') {
      sendJson(res, 200, { eigenPoort: this.#options.eigenPoort != null, adres: this.#eigenAdres });
      return;
    }

    if (path === '/api/versie') {
      // Hooguit tien versies terug (besluit 133).
      sendJson(res, 200, { ...(this.#options.version ?? UNKNOWN_VERSION), nieuw: NIEUW.slice(0, TERUGKIJKEN) });
      return;
    }

    if (path === '/api/health') {
      const snapshot = this.#options.latest();
      sendJson(res, 200, {
        ok: true,
        versie: this.#options.version ?? UNKNOWN_VERSION,
        laatsteBesluitMs: snapshot?.atMs ?? null,
        analyseBerekendOpMs: this.#options.divergence?.()?.berekendOpMs ?? null,
        kijkers: this.#live.kijkers,
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
    // De voordeur: op de NAS de cijfers, in de add-on de app of het welkom (besluit 154).
    const target = path !== '/' ? path : this.#options.onboarding == null ? 'index.html' : this.#options.config == null ? 'begin.html' : 'thuis.html';
    const since = req.headers['if-modified-since'];
    if (
      await sendFile(
        res,
        this.#options.webDir,
        target,
        headOnly,
        typeof since === 'string' ? since : undefined,
        { gestempeld: url.searchParams.has('v'), inpakken },
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
    const config = this.#config();
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
    // Verwacht naast echt over de dagen van de periode (besluit 137); los van de statistiek.
    const verwacht = await this.#expectedIn(range.startMs, range.endMs, config.timezone).catch(() => null);
    if (hit) {
      sendJson(res, 200, { ...hit.report, verwacht });
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
      sendJson(res, 200, { ...report, verwacht });
      this.#yieldWarm(vandaag);
    } catch (error) {
      sendJson(res, 502, { fout: `Home Assistant gaf de statistiek niet: ${(error as Error).message}` });
    }
  }

  /**
   * Wat de dag ervoor werd verwacht en wat de panelen leverden, opgeteld over
   * de afgesloten dagen tussen twee momenten (besluit 137). Null zonder weer of
   * zonder zulke dagen.
   */
  async #expectedIn(vanMs: number, totMs: number, timeZone: string): Promise<ExpectedTotal | null> {
    const weather = this.#options.weather;
    const logDir = this.#options.logDir;
    if (weather == null || logDir == null) return null;
    await weather.log.load();
    if (Object.keys(weather.log.expected).length === 0) return null;
    this.#solar ??= new SolarHistory({ logDir });
    if (Object.keys(this.#solar.current).length === 0) await this.#solar.refresh().catch(() => undefined);
    const p = partsIn(Date.now(), timeZone);
    const today = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    const binnen = (day: string) => {
      const [y, m, d] = day.split('-').map(Number);
      const middag = zonedMidnight(y!, m!, d!, timeZone) + 12 * 3_600_000;
      return day < today && middag >= vanMs && middag < totMs;
    };
    return expectedTotal(expectedAndActual(weather.log.expected, weather.log.current, this.#solar.current, binnen));
  }

  /** Rekent één periode uit, één keer tegelijk per periode, en bewaart hem. */
  #yieldCompute(key: string, soort: PeriodKind, datum: string, now: number): Promise<YieldReport | null> {
    const busy = this.#yieldBusy.get(key);
    if (busy) return busy;
    const energy = this.#options.energy!;
    const config = this.#config()!;
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

  /** Wat de apparaten met een eigen meter deze maand kostten, voor de assistent (besluit 142). */
  async #kostenDezeMaand(config: SiteConfig): Promise<NonNullable<AskContext['kosten']> | null> {
    const settings = this.#options.energy?.store.current;
    if (settings == null) return null;
    const now = Date.now();
    const p = partsIn(now, config.timezone);
    const datum = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    const range = periodRange('maand', datum, config.timezone, yearStartOf(settings.prijzen.contractStart));
    if (range == null) return null;
    const key = `maand:${range.startMs}`;
    const hit = this.#yieldCache.get(key);
    const report = hit && now - hit.atMs < 600_000 ? hit.report : await this.#yieldCompute(key, 'maand', datum, now);
    if (report == null) return null;
    const maand = report.periode.label.split(' ')[0]!.toLowerCase();
    // Een apparaat heet zoals in de app, niet zoals zijn meter (het klimaatapparaat bij die meter).
    const apparaten = (this.#options.house?.()?.etages ?? []).flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
    const naamVan = (meter: string, terug: string) => apparaten.find((d) => d.klimaat?.energieMeter === meter)?.naam ?? terug;
    return { maand, apparaten: report.apparaten.filter((a) => !a.rest).map((a) => ({ id: a.id, naam: naamVan(a.id, a.naam), kwh: a.kwh, zonKwh: a.zonKwh, euro: a.kosten })) };
  }

  /** Na een vraag: de andere periodes van vandaag alvast uitrekenen, op de achtergrond. */
  #yieldWarm(vandaag: string): void {
    const config = this.#config();
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

  /** Wie er kijkt (besluit 147): het account, of het een beheerder is, en de naam. Een gast is nooit beheerder. */
  async #wie(req: IncomingMessage): Promise<Wie & { readonly naam: string }> {
    const access = this.#access(req);
    if (access.kind === 'open') return { userId: null, beheerder: true, naam: '' };
    const v = await this.#bezoeker(req);
    const gast = this.#options.bewoners?.gast?.(v?.userId ?? null).gast === true;
    return { userId: v?.userId ?? null, beheerder: v?.rol === 'beheerder' && !gast, naam: v?.naam ?? '' };
  }

  /** Is wie er kijkt de hoofdgebruiker (besluit 151)? Zonder inlog (alleen in tests) mag alles. */
  async #hoofd(req: IncomingMessage): Promise<boolean> {
    if (this.#access(req).kind === 'open') return true;
    return this.#options.gegevens?.hoofd(await this.#wie(req)) === true;
  }

  /**
   * Back-up, herstel en opnieuw beginnen (besluit 151). Kijken mag iedereen
   * die ingelogd is; downloaden, terugzetten en opnieuw beginnen alleen de
   * hoofdgebruiker. Na terugzetten of opnieuw beginnen start de dienst
   * opnieuw, pas als het antwoord weg is.
   */
  async #gegevens(req: IncomingMessage, res: ServerResponse, method: string, path: string): Promise<void> {
    const g = this.#options.gegevens;
    const logDir = this.#options.logDir;
    if (g == null || logDir == null) {
      sendJson(res, 503, { wachten: 'er wordt niets bewaard, dus er is geen back-up' });
      return;
    }
    const hoofd = await this.#hoofd(req);
    if (path === '/api/gegevens') {
      sendJson(res, 200, { hoofd, configWeg: g.configWeg, logboek: await exportInfo(logDir), backups: hoofd ? await g.bewaard() : [] });
      return;
    }
    if (!hoofd) {
      sendJson(res, 403, { fout: 'dit kan alleen de hoofdgebruiker' });
      return;
    }
    if (path === '/api/back-up' && method !== 'POST') {
      const text = `${JSON.stringify(await g.backup(), null, 2)}\n`;
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${backupNaam()}"`,
        'content-length': Buffer.byteLength(text),
        'cache-control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : text);
      return;
    }
    let body: unknown;
    try {
      body = await readJson(req, path === '/api/back-up' ? MAX_BACKUP : MAX_BODY);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return;
    }
    if (path === '/api/opnieuw' && (body as { zeker?: unknown } | null)?.zeker !== true) {
      sendJson(res, 400, { fout: 'bevestig eerst dat je opnieuw wilt beginnen' });
      return;
    }
    const uit = path === '/api/back-up' ? await g.herstel(body) : await g.opnieuw();
    if (!uit.ok) {
      sendJson(res, uit.status, { fout: uit.reden });
      return;
    }
    res.once('finish', () => g.herstart());
    sendJson(res, 200, { ...uit, herstart: true });
  }

  /** Of wie er kijkt een gast is, en thuis (besluit 147). */
  async #gast(req: IncomingMessage): Promise<{ readonly gast: boolean; readonly thuis: boolean | null } | null> {
    if (this.#access(req).kind === 'open' || this.#options.bewoners?.gast == null) return null;
    const v = await this.#bezoeker(req);
    return this.#options.bewoners.gast(v?.userId ?? null);
  }

  /** Wie er kijkt: bij een eigen inlog de sessie, achter Ingress Home Assistant (besluit 161). Zonder inlog niemand. */
  async #bezoeker(req: IncomingMessage): Promise<Visitor | null> {
    const access = this.#access(req);
    if (access.kind === 'sessions') return access.store.visitor(cookieValue(req, SESSION_COOKIE));
    if (access.kind === 'ingress') return ingressVisitor(req, access.beheerders);
    return null;
  }

  /** Een vraag van de assistent van Home Assistant met de juiste sleutel (besluit 147). */
  #metSleutel(req: IncomingMessage, url: URL, path: string): boolean {
    const sleutel = this.#options.sleutel;
    // De vragen, en de kamers voor de zinnen van de integratie (besluit 184).
    if (sleutel == null || (path !== '/api/vraag' && path !== '/api/assist')) return false;
    const kop = String(req.headers.authorization ?? '');
    const gegeven = kop.startsWith('Bearer ') ? kop.slice(7).trim() : (url.searchParams.get('sleutel') ?? '');
    return gegeven.length === sleutel.length && timingSafeEqual(Buffer.from(gegeven), Buffer.from(sleutel));
  }

  async #auth(req: IncomingMessage, res: ServerResponse, method: string, path: string, url: URL): Promise<void> {
    const access = this.#access(req);
    if (path === '/api/sessie') {
      let visitor: Visitor | null = null;
      if (access.kind !== 'open') visitor = await this.#bezoeker(req);
      else visitor = { naam: 'iedereen', rol: 'beheerder', userId: null };
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
        // Wie is het (besluit 147)? Een nieuwe bewoner krijgt het welkom, een account zonder persoon de vraag.
        const eerst = (await this.#options.bewoners?.herken({ userId: user.userId, naam: user.naam }).catch(() => null)) ?? null;
        const naar = eerst == null ? pending.terug : `/welkom.html?terug=${encodeURIComponent(pending.terug)}#${eerst}`;
        /*
         * Niet meteen doorsturen (16 oktober 2026): de browser komt hier vanaf
         * Home Assistant, een andere site, en een cookie met SameSite=Strict gaat
         * dan bij de doorverwijzing niet mee. Sinds de hele app een inlog vraagt
         * (besluit 147), stond je zo weer bij het inloggen. Een kleine pagina die
         * zelf verder gaat, is een stap vanaf deze site: dan gaat het cookie mee.
         */
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': sessionCookie(id, secure), 'cache-control': 'no-store' });
        res.end(verderNa(naar));
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
        // vóórdat iemand op een knop drukt die toch zou weigeren. En het huis
        // zoals Home Assistant het kent, voor het welkom (besluit 154).
        sendJson(res, 200, { ...proposal, bestaande: existing, namen: onboarding.namen(), huis: this.#options.welkomHuis?.() ?? null });
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
    // Eerst het antwoord, dan opnieuw starten: de pagina wacht tot de dienst terug is.
    if (result.ok) this.#options.naOnboarding?.();
  }

  /**
   * Het besluit onbewerkt, met het bewonerscontract ernaast (76, 94): per kamer
   * de stand in woorden, uitgerekend in de dienst. De kern blijft wat hij was;
   * de proefomgeving leest `bewoner`, de schaduwweergave de rest.
   */
  #withResident(snapshot: LiveSnapshot, taal: Lang = 'nl'): LiveSnapshot & { bewoner?: ResidentView } {
    const config = this.#config();
    if (config == null) return snapshot;
    return { ...snapshot, bewoner: residentView(config, snapshot, taal) };
  }

  /*
   * De live-verbinding (live.ts, besluit 180): de besluiten, aanbellen, het
   * rookalarm, de wand wekken, en dat het huis, de meldingen of de bewoners
   * veranderden. Hier alleen doorgegeven, zodat de dienst niets merkt.
   */
  /** Er wordt aangebeld (besluit 107). */
  ring(camera: string, naam: string, hoe: { readonly seconden: number; readonly schermAan: boolean; readonly reserve?: readonly string[] } = { seconden: 120, schermAan: true }): void {
    this.#live.ring(camera, naam, hoe);
  }

  /** Een rookmelder ziet rook, koolmonoxide of hitte, of niet meer. */
  alarm(melders: readonly AlarmMelder[]): void {
    this.#live.alarm(melders);
  }

  /** De wand wekken (besluit 164). */
  wek(waarom: 'beweging'): void {
    this.#live.wek(waarom);
  }

  /** Er veranderde iets in het huis (besluit 174). */
  huisVeranderd(snel: boolean): void {
    this.#live.huisVeranderd(snel);
  }

  /** De meldingen veranderden (besluit 177). */
  meldingenVeranderd(): void {
    this.#live.meldingenVeranderd();
  }

  /** Iemand komt thuis of gaat weg (besluit 174). */
  bewonersVeranderd(): void {
    this.#live.bewonersVeranderd();
  }

  /** Duwt een besluit naar alle kijkers. Hier hangt de runner zich aan. */
  publish(snapshot: LiveSnapshot): void {
    this.#live.publish(snapshot);
  }

  /**
   * Het weer van de komende dagen (besluit 105), tien minuten vastgehouden. Bewaart
   * meteen wat er voor morgen verwacht wordt, zodat het huis die verwachting na
   * die dag naast de werkelijke opbrengst kan leggen; main roept dit daarom elke
   * tien minuten aan, ook als niemand kijkt.
   */
  /** De configuratie zoals hij nu is (besluit 130). */
  #config(): SiteConfig | null {
    return this.#options.configNow?.() ?? this.#options.config;
  }

  async weatherNow(): Promise<WeatherReport | { wachten: string }> {
    const config = this.#config();
    const location = this.#options.location?.() ?? null;
    const weather = this.#options.weather;
    const logDir = this.#options.logDir;
    if (weather == null || config?.geometry == null || location == null || logDir == null) {
      return { wachten: 'het weer komt zodra de ligging van het huis en de panelen bekend zijn' };
    }
    const now = Date.now();
    // Een andere ligging (besluit 157) rekent meteen opnieuw.
    if (this.#weather != null && now - this.#weather.atMs < 10 * 60_000 && this.#weather.geometry === config.geometry) return this.#weather.report;
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
    this.#weather = { atMs: now, report, geometry: config.geometry };
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

  /** Wat de assistent nu mag bedienen (besluit 148): dezelfde grenzen als de knoppen. */
  #bedienbaar(): Bedienbaar {
    const licht = this.#lichtMag();
    return bedienbaar(this.#options.house?.() ?? null, { licht, scenes: licht && this.#options.lights?.scenesEnabled === true, schermen: this.#schermMag() });
  }

  /** Een opdracht als antwoord: de zin, in eigen woorden als dat kan, en wat de pagina moet sturen. */
  async #opdrachtAntwoord(h: Herkend, tekst: string, lang: Lang, model: Vraag | null): Promise<Record<string, unknown>> {
    if (!h.ok) return { vraag: 'bedien', taal: lang, kamer: null, antwoord: h.antwoord, feiten: [], gesproken: uitspraak(h.antwoord) };
    const o = h.opdracht;
    const eigen = model ? await inEigenWoorden(model, tekst, o, lang) : { antwoord: o.antwoord, eigen: false };
    return {
      vraag: 'bedien',
      taal: lang,
      kamer: null,
      ruimte: o.ruimte,
      antwoord: eigen.antwoord,
      eigen: eigen.eigen,
      feiten: o.feiten,
      gesproken: uitspraak(eigen.antwoord),
      opdracht: { pad: o.pad, body: o.body },
      gedaan: o.gedaan,
      beweegt: o.beweegt,
      vervolg: o.vervolg,
    };
  }

  /** Schermen bedienen: de installatie staat het toe, en het staat aan bij Functies (besluit 121). */
  #schermMag(): boolean {
    return this.#options.covers != null && (this.#options.schermenAan?.() ?? true);
  }

  /** Licht bedienen: de installatie staat het toe, en de bewoner heeft het aan (besluit 111). */
  #lichtMag(): boolean {
    return this.#options.lights != null && (this.#options.lichtAan?.() ?? true);
  }

  /** Wat de kaart zei, per ligging, een dag lang: OpenStreetMap is van iedereen. */
  #kaart = new Map<string, { at: number; omtrek: readonly Punt[] | null }>();

  /**
   * De gevels opmeten op de kaart (21 oktober 2026): de omtrek van het huis in
   * OpenStreetMap, en daaruit de voorkant die het dichtst bij `nuDeg` ligt.
   * Alleen na een tik van de beheerder; niets bewaard behalve een dag de omtrek.
   */
  async #gevelKaart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const loc = this.#options.location?.() ?? null;
    if (loc == null) {
      sendJson(res, 503, { wachten: 'de ligging van het huis komt van Home Assistant zodra die verbonden is' });
      return;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return;
    }
    const nu = Number((body as { nuDeg?: unknown } | null)?.nuDeg);
    if (!Number.isFinite(nu) || nu < 0 || nu >= 360) {
      sendJson(res, 400, { fout: 'nuDeg is een richting van 0 tot 360' });
      return;
    }
    const sleutel = `${loc.latDeg.toFixed(5)},${loc.lonDeg.toFixed(5)}`;
    let bewaard = this.#kaart.get(sleutel);
    if (bewaard == null || Date.now() - bewaard.at > 86_400_000) {
      try {
        bewaard = { at: Date.now(), omtrek: await (this.#options.omtrek ?? haalOmtrek)(loc.latDeg, loc.lonDeg) };
      } catch {
        sendJson(res, 502, { fout: 'De kaart gaf geen antwoord. Probeer het straks nog eens.' });
        return;
      }
      this.#kaart.set(sleutel, bewaard);
    }
    const gevels = bewaard.omtrek ? gevelsUitOmtrek(bewaard.omtrek) : null;
    if (gevels == null) {
      sendJson(res, 404, { fout: 'Op de kaart staat op deze plek geen huis.' });
      return;
    }
    sendJson(res, 200, { voorkantDeg: voorkantUitKaart(gevels, nu), as: gevels.as, bron: 'OpenStreetMap' });
  }

  /** Hoeveel live-beelden er nu lopen; meer dan dit belast Home Assistant en de NAS te veel. */
  #liveStreams = 0;

  async #camera(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const cam = this.#options.camera;
    const access = this.#access(req);
    if (cam == null) {
      sendJson(res, 503, { wachten: 'camera’s bekijken staat niet aan' });
      return;
    }
    // Meteen luisteren of de kijker ophangt, nog vóór het wachten op de inlog: een
    // luisteraar die later komt, hoort het niet meer, en dan liep de stroom bij
    // Home Assistant door zonder kijker (16 oktober 2026).
    const stop = new AbortController();
    res.on('close', () => stop.abort());
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
    if (stop.signal.aborted || res.destroyed) return;
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
      await up.body?.cancel().catch(() => {});
      if (!res.destroyed) sendJson(res, 502, { fout: 'Home Assistant gaf geen beeld' });
      return;
    }
    if (res.destroyed) {
      await up.body.cancel().catch(() => {});
      return;
    }
    res.writeHead(200, { 'content-type': up.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'no-store' });
    if (live) this.#liveStreams += 1;
    // Samen dicht: hangt de kijker op, dan stopt ook de stroom van Home Assistant.
    pipeline(Readable.fromWeb(up.body as import('node:stream/web').ReadableStream<Uint8Array>), res, () => {
      if (live) this.#liveStreams = Math.max(0, this.#liveStreams - 1);
    });
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
    const eigen = this.#eigen;
    if (eigen != null) {
      await new Promise<void>((ok, fail) => {
        eigen.once('error', fail);
        eigen.listen(this.#options.eigenPoort!.port, this.#options.host, () => {
          eigen.removeListener('error', fail);
          ok();
        });
      });
      const a = eigen.address();
      this.#eigenPort = typeof a === 'object' && a != null ? a.port : this.#options.eigenPoort!.port;
    }
    return typeof address === 'object' && address != null ? address.port : this.#options.port;
  }

  /** Waar de eigen poort luistert (besluit 160), of null als er geen is. */
  get eigenPoort(): number | null {
    return this.#eigenPort;
  }

  async stop(): Promise<void> {
    this.#live.sluit();
    // Open microfoons (besluit 150) houden de server anders open.
    for (const socket of this.#luistersockets) socket.destroy();
    await new Promise<void>((ok) => this.#server.close(() => ok()));
    if (this.#eigen?.listening) await new Promise<void>((ok) => this.#eigen!.close(() => ok()));
  }

  get viewers(): number {
    return this.#live.kijkers;
  }
}

/** Waar de gebouwde frontend staat, gerekend vanaf de pakketwortel. */
export function defaultWebDir(packageRoot: string): string {
  return join(packageRoot, 'web');
}
