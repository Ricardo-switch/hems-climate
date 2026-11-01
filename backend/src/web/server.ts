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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';
import { PICTURE_FILE } from './scene-pictures.js';
import type { Luisterpost } from './luisterpost.js';
import { wachttijdVan } from './spraakeinde.js';
import { gevoeligheidVan } from './wekwoord.js';
import { accepteer, isUpgrade, weiger } from './websocket.js';
import type { Duplex } from 'node:stream';
import type { WeatherReport } from './weather.js';
import { DOOR_ROLES, SESSION_COOKIE, cookieValue, hostAllowed, ingressVisitor, openZonderInlog, viaTailscale } from './auth.js';
import type { AlarmMelder } from './live.js';
import type { WebOptions } from './server-opties.js';
import { INPAKKEN, inpakkingVoor, sameOrigin, sendFile, sendJson } from './http.js';
import { Diensten, type Verzoek } from './diensten.js';
import { cameraRoutes } from './routes/camera.js';
import { inloggenRoutes } from './routes/inloggen.js';
import { beheerRoutes } from './routes/beheer.js';
import { energieRoutes } from './routes/energie.js';
import { bewonersRoutes } from './routes/bewoners.js';
import { opbrengstRoutes } from './routes/opbrengst.js';
import { standRoutes } from './routes/stand.js';
import { assistentRoutes } from './routes/assistent.js';
import { huisRoutes } from './routes/huis.js';
import { teDoenRoutes } from './routes/tedoen.js';

export { taalVan } from './diensten.js';
export type { AlarmMelder } from './live.js';
export { UNKNOWN_VERSION, versionFromEnv, type Version, type WebOptions } from './server-opties.js';

/** De onderwerpen, in de volgorde waarin #handle ze vraagt (hun paden overlappen niet). */
const ROUTES = [cameraRoutes, inloggenRoutes, beheerRoutes, energieRoutes, bewonersRoutes, opbrengstRoutes, standRoutes, assistentRoutes, huisRoutes, teDoenRoutes] as const;

/**
 * De beta op de NAS (23 oktober 2026): het manifest en de iconen met een label
 * BETA in plaats van de gewone. De pagina's verwijzen naar de gewone namen;
 * een eigen server geeft hier de beta. Zo staan de NAS en de Pi niet als twee
 * gelijke apps op een startscherm.
 */
export const BETA_ICOON: Readonly<Record<string, string>> = {
  '/manifest.webmanifest': 'manifest-beta.webmanifest',
  '/icoon-192.png': 'icoon-beta-192.png',
  '/icoon-512.png': 'icoon-beta-512.png',
  '/icoon-512-maskable.png': 'icoon-beta-512-maskable.png',
};

export class WebServer {
  /** De gedeelde context (diensten.ts): de opties, de toegang, de live-verbinding en de caches. */
  readonly #d: Diensten;
  readonly #server: Server;
  /** De eigen poort (besluit 160), of null. */
  readonly #eigen: Server | null = null;
  #eigenPort: number | null = null;

  constructor(options: WebOptions) {
    this.#d = new Diensten(options);
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
          res.end('Open SunArc via het adres in Tailscale (https://….ts.net).\n');
          return;
        }
        this.#d.toegang.set(req, eigen.access);
        // Het adres waarop SunArc in Tailscale staat, voor de knop Op je startscherm.
        this.#d.eigenAdres = `https://${String(req.headers.host).replace(/:443$/, '')}`;
        verzoek(req, res);
      });
      this.#eigen.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!viaTailscale(req)) return weiger(socket, 421, 'Misdirected Request');
        this.#d.toegang.set(req, eigen.access);
        upgrade(req, socket, head);
      });
    }
  }

  readonly #luistersockets = new Set<Duplex>();

  /**
   * Een websocket voor de microfoon (besluit 150). Dezelfde poort als de rest:
   * alleen bekende hostnamen, alleen vanaf de eigen pagina (een browser stuurt
   * bij een websocket altijd een Origin), en met de inlog van de app.
   */
  async #luister(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const deur = this.#d.options.luisteren;
    if (url.pathname !== '/api/luister' || deur == null || !isUpgrade(req)) return weiger(socket, 404, 'Not Found');
    const access = this.#d.access(req);
    if (access.kind !== 'ingress' && !hostAllowed(req.headers.host, access.kind === 'sessions' ? access.hosts : [])) return weiger(socket, 421, 'Misdirected Request');
    if (!req.headers.origin || !sameOrigin(req)) return weiger(socket, 403, 'Forbidden');
    if (access.kind === 'sessions' && (await access.store.visitor(cookieValue(req, SESSION_COOKIE))) == null) return weiger(socket, 401, 'Unauthorized');
    const begin = url.searchParams.get('start') === 'spraak' ? 'stt' : 'wake_word';
    // De twee schuiven van dit scherm (besluit 208), bij Functies › Praten.
    const stand = {
      gevoeligheid: gevoeligheidVan(url.searchParams.get('gevoeligheid')),
      wachttijd: wachttijdVan(url.searchParams.get('wachttijd')),
      // De taal van de app op dat scherm, voor het uitschrijven (besluit 211).
      taal: url.searchParams.get('taal') === 'en' ? ('en' as const) : ('nl' as const),
    };
    if (head.length > 0) socket.unshift(head);
    this.#luistersockets.add(socket);
    socket.on('close', () => this.#luistersockets.delete(socket));
    const post = this.#d.luisterpost!;
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
    ronde = await post.begin(verbinding, begin, stand);
    for (const d of wacht.splice(0)) ronde.geluid(d);
    if (dicht) ronde.dicht();
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const access = this.#d.access(req);
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
    if (access.kind === 'sessions' && !openZonderInlog(path) && !this.#d.metSleutel(req, url, path)) {
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
      if (pagina && path !== '/welkom.html' && visitor.userId != null && this.#d.options.bewoners) {
        const eerst = await this.#d.options.bewoners.herken({ userId: visitor.userId, naam: visitor.naam }).catch(() => null);
        if (eerst != null) {
          res.writeHead(302, { location: `/welkom.html?terug=${encodeURIComponent(path === '/' ? '/thuis.html' : path)}#${eerst}`, 'cache-control': 'no-store' });
          res.end();
          return;
        }
      }
    }

    /*
     * Het voorbeeldhuis (besluit 237): alles onder `voorbeeld/` gaat naar een
     * eigen proces met een nagemaakt Home Assistant, ook in een huis zonder
     * configuratie. De inlog is hierboven al nagekeken; een opdracht moet net als
     * elders JSON zijn en van de eigen pagina komen.
     */
    const voorbeeld = this.#d.options.voorbeeld;
    if (voorbeeld != null && (path === '/voorbeeld' || path.startsWith('/voorbeeld/'))) {
      if (path === '/voorbeeld' || path === '/voorbeeld/') {
        res.writeHead(302, { location: path === '/voorbeeld' ? 'voorbeeld/thuis.html' : 'thuis.html', 'cache-control': 'no-store' });
        res.end();
        return;
      }
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
        sendJson(res, 405, { fout: 'GET of POST' });
        return;
      }
      if (method === 'POST' && (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json') || !sameOrigin(req))) {
        sendJson(res, 403, { fout: 'alleen JSON, vanaf de eigen pagina' });
        return;
      }
      await voorbeeld.verzoek(req, res, path.slice('/voorbeeld'.length), url.search);
      return;
    }

    /*
     * In de add-on is de app de voordeur (besluit 154). Zonder configuratie is
     * het huis leeg: elke pagina van de app gaat dan naar het welkom. De
     * cijferpagina blijft bestaan voor wie hem direct opent.
     *
     * Achter Ingress altijd een relatief adres: de app staat daar onder een pad
     * van Home Assistant, en `/thuis.html` zou naar Home Assistant zelf gaan.
     */
    if (this.#d.options.onboarding != null && (method === 'GET' || method === 'HEAD') && (path === '/' || path.endsWith('.html'))) {
      const pagina = path.slice(1);
      const leeg = this.#d.options.config == null;
      const naar = (doel: string) => {
        res.writeHead(302, { location: doel, 'cache-control': 'no-store' });
        res.end();
      };
      if (leeg && pagina !== '' && pagina !== 'begin.html' && pagina !== 'index.html') return naar('begin.html');
      if (!leeg && pagina === 'begin.html') return naar('thuis.html');
      // Wie voor het eerst komt, krijgt eerst "wie ben je?" (besluit 147), ook achter Ingress.
      if (!leeg && access.kind === 'ingress' && pagina !== 'welkom.html' && pagina !== 'index.html' && this.#d.options.bewoners) {
        const visitor = await ingressVisitor(req);
        if (visitor.userId != null) {
          const eerst = await this.#d.options.bewoners.herken({ userId: visitor.userId, naam: visitor.naam }).catch(() => null);
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
      (this.#d.options.onboarding != null && path === '/api/onboarding') ||
      (this.#d.options.feedback != null && path === '/api/gevoel') ||
      (this.#d.options.uitstel != null && path === '/api/uitstel') ||
      // Klaar om bij de jacuzzi (besluit 186): alleen in het eigen bestand.
      (this.#d.options.buffers != null && path === '/api/klaarom') ||
      // Een melding niet meer laten zien (besluit 136): alleen in het eigen bestand.
      (this.#d.options.meldingen != null && path === '/api/meldingen') ||
      // Thuis naar eigen smaak (besluit 162): alleen wat er gekozen is, in het eigen bestand.
      (this.#d.options.voorkeuren != null && path === '/api/voorkeuren') ||
      // Wat de bewoner over het sluipverbruik zegt (besluit 88, 192): één korte zin, in het eigen bestand.
      (this.#d.options.sluipverbruik != null && path === '/api/sluipverbruik') ||
      // De integratie neerzetten (besluit 184): alleen custom_components/smart_climate, na een tik van de beheerder.
      (this.#d.options.integratie != null && path === '/api/integratie') ||
      // Helemaal in huis (besluit 203): de spraakassistent maken, na een tik van de beheerder.
      (this.#d.options.stemInHuis != null && path === '/api/stem-in-huis') ||
      // Een proefmelding naar je eigen telefoon (besluit 183): alleen notify.mobile_app_…
      (this.#d.options.proefmelding != null && path === '/api/proefmelding') ||
      (this.#d.options.energy != null && path === '/api/energie') ||
      // De zon en je aansluiting (besluit 103): alleen antwoorden, naar een eigen bestand.
      (this.#d.options.connection != null && path === '/api/aansluiting') ||
      // De gevels op de kaart (21 oktober 2026): niets bewaren, alleen een vraag aan OpenStreetMap.
      (this.#d.options.location != null && path === '/api/gevel-kaart') ||
      // De add-on bijwerken (21 oktober 2026): update.install op de eigen add-on, en niets anders.
      (this.#d.options.bijwerken != null && path === '/api/update') ||
      (this.#d.options.layout != null && path === '/api/indeling') ||
      // Camera's en de deurbel (besluit 109): alleen de keuzes, naar een eigen bestand.
      (this.#d.options.functies != null && path === '/api/functies') ||
      // Comfort (besluit 130): doelen voor de regeling, naar een eigen bestand.
      (this.#d.options.comfort != null && path === '/api/comfort') ||
      // Bewoners (besluit 147): naar een eigen bestand, en nooit naar Home Assistant.
      (this.#d.options.bewoners != null && path === '/api/bewoners') ||
      (this.#d.options.lights != null && path === '/api/licht') ||
      // Schermen (besluit 121): open, dicht, stop of een stand, voor de bewoner.
      (this.#d.options.covers != null && path === '/api/scherm') ||
      // De klimaatbrug (besluit 210): alleen de knoppen van het oude systeem, tot stap B. Een gast niet.
      (this.#d.options.klimaat != null && path === '/api/klimaat') ||
      // Klimaat met de hand (besluit 235): stond er niet bij, dus elke opdracht kreeg 405 (gevonden in ronde 5).
      (this.#d.options.hand != null && path === '/api/hand') ||
      // Witgoed starten (besluit 238): alleen Nu starten, op de startknop van het apparaat.
      (this.#d.options.witgoed != null && path === '/api/witgoed') ||
      // Te doen (besluit 216): een herinnering in het eigen bestand, of iets op een lijst van Home Assistant. Een gast niet.
      (this.#d.options.tedoen != null && path === '/api/te-doen') ||
      // Scènes (besluit 100): een eigen smalle deur naast het licht.
      (this.#d.options.lights?.scenesEnabled === true && path === '/api/scene') ||
      // Een back-up terugzetten en opnieuw beginnen (besluit 151): alleen de eigen bestanden.
      (this.#d.options.gegevens != null && (path === '/api/back-up' || path === '/api/opnieuw')) ||
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
        const visitor = await this.#d.bezoeker(req);
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
      const gast = access.kind !== 'open' && path !== '/auth/logout' ? await this.#d.gast(req) : null;
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


    // De routes per onderwerp (routes/), op volgorde; de eerste die het verzoek kent, handelt het af.
    const v: Verzoek = { req, res, url, path, method, access };
    for (const routes of ROUTES) if (await routes(this.#d, v)) return;

    // Scèneplaatjes uit de map van de bewoner: alleen een plat bestand met een
    // nette naam, en alleen uit die map (besluit 100).
    if (path.startsWith('/scene-plaatjes/') && this.#d.options.scenePicturesDir && (method === 'GET' || method === 'HEAD')) {
      const file = path.slice('/scene-plaatjes/'.length);
      const since0 = req.headers['if-modified-since'];
      if (!PICTURE_FILE.test(file) || !(await sendFile(res, this.#d.options.scenePicturesDir, file, method === 'HEAD', typeof since0 === 'string' ? since0 : undefined))) {
        sendJson(res, 404, { fout: 'geen plaatje met die naam' });
      }
      return;
    }

    const headOnly = method === 'HEAD';
    // De voordeur: op de NAS de cijfers, in de add-on de app of het welkom (besluit 154).
    const voordeur = path !== '/' ? path : this.#d.options.onboarding == null ? 'index.html' : this.#d.options.config == null ? 'begin.html' : 'thuis.html';
    // Een eigen server (de NAS, die beta volgt) geeft een eigen naam en icoon, zodat hij op een startscherm niet lijkt op de add-on.
    // Het voorbeeldhuis (besluit 237) draait als eigen server, maar is geen beta.
    const target = this.#d.options.version?.installatie === 'server' && process.env['HEMS_VOORBEELD'] !== '1' ? (BETA_ICOON[voordeur] ?? voordeur) : voordeur;
    const since = req.headers['if-modified-since'];
    if (
      await sendFile(
        res,
        this.#d.options.webDir,
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

  /*
   * De live-verbinding (live.ts, besluit 180): de besluiten, aanbellen, het
   * rookalarm, de wand wekken, en dat het huis, de meldingen of de bewoners
   * veranderden. Hier alleen doorgegeven, zodat de dienst niets merkt.
   */
  /** Er wordt aangebeld (besluit 107). */
  ring(camera: string, naam: string, hoe: { readonly seconden: number; readonly schermAan: boolean; readonly reserve?: readonly string[] } = { seconden: 120, schermAan: true }): void {
    this.#d.live.ring(camera, naam, hoe);
  }

  /** Een rookmelder ziet rook, koolmonoxide of hitte, of niet meer. */
  alarm(melders: readonly AlarmMelder[]): void {
    this.#d.live.alarm(melders);
  }

  /** De wand wekken (besluit 164). */
  wek(waarom: 'beweging'): void {
    this.#d.live.wek(waarom);
  }

  /** Er veranderde iets in het huis (besluit 174). */
  huisVeranderd(snel: boolean): void {
    this.#d.live.huisVeranderd(snel);
  }

  /** De meldingen veranderden (besluit 177). */
  meldingenVeranderd(): void {
    this.#d.live.meldingenVeranderd();
  }

  /** Iemand komt thuis of gaat weg (besluit 174). */
  bewonersVeranderd(): void {
    this.#d.live.bewonersVeranderd();
  }

  /** Duwt een besluit naar alle kijkers. Hier hangt de runner zich aan. */
  publish(snapshot: LiveSnapshot): void {
    this.#d.live.publish(snapshot);
  }

  /**
   * Het weer van de komende dagen (besluit 105), tien minuten vastgehouden. Main
   * roept dit elke tien minuten aan, zodat de verwachting voor morgen bewaard
   * wordt, ook als niemand kijkt.
   */
  weatherNow(): Promise<WeatherReport | { wachten: string }> {
    return this.#d.weatherNow();
  }

  async start(): Promise<number> {
    await new Promise<void>((ok, fail) => {
      this.#server.once('error', fail);
      this.#server.listen(this.#d.options.port, this.#d.options.host, () => {
        this.#server.removeListener('error', fail);
        ok();
      });
    });
    const address = this.#server.address();
    const eigen = this.#eigen;
    if (eigen != null) {
      await new Promise<void>((ok, fail) => {
        eigen.once('error', fail);
        eigen.listen(this.#d.options.eigenPoort!.port, this.#d.options.host, () => {
          eigen.removeListener('error', fail);
          ok();
        });
      });
      const a = eigen.address();
      this.#eigenPort = typeof a === 'object' && a != null ? a.port : this.#d.options.eigenPoort!.port;
    }
    return typeof address === 'object' && address != null ? address.port : this.#d.options.port;
  }

  /** Waar de eigen poort luistert (besluit 160), of null als er geen is. */
  get eigenPoort(): number | null {
    return this.#eigenPort;
  }

  async stop(): Promise<void> {
    this.#d.live.sluit();
    // Open microfoons (besluit 150) houden de server anders open.
    for (const socket of this.#luistersockets) socket.destroy();
    await new Promise<void>((ok) => this.#server.close(() => ok()));
    if (this.#eigen?.listening) await new Promise<void>((ok) => this.#eigen!.close(() => ok()));
  }

  get viewers(): number {
    return this.#d.live.kijkers;
  }
}

/** Waar de gebouwde frontend staat, gerekend vanaf de pakketwortel. */
export function defaultWebDir(packageRoot: string): string {
  return join(packageRoot, 'web');
}
