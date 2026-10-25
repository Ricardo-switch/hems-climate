/**
 * Beheer: de installatie, het begin, bijwerken, functies, de integratie, gegevens en de versie.
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SiteConfig } from '../../core/model.js';
import { exportInfo, writeExport } from '../export.js';
import { MAX_BACKUP, backupNaam } from '../gegevens.js';
import { keuzesInTaal } from '../onboarding.js';
import { controleer as controleerFuncties, functiesVoorstel, volledig } from '../functies.js';
import { NIEUW, TERUGKIJKEN, VERSIE, nieuwInTaal } from '../../version.js';
import { UNKNOWN_VERSION } from '../server-opties.js';
import { MAX_BODY, readJson, sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

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
    /** Of het huis een slimme meter en een zonnemeting heeft (besluit 196): zonder past de app zich aan. */
    meter: config.power?.gridPower != null,
    zonMeter: config.solarProduction != null,
    /** Zolang dit er staat, draait de vergelijking met het oude systeem nog. */
    migrating: config.migration?.legacyExplanation != null,
  };
}

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function beheerRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  const logDir = d.options.logDir;
  if (path === '/api/site') {
    const config = d.config();
    if (config == null) {
      // 503 en niet 404: de installatie bestaat, hij is alleen nog niet
      // ingesteld. De pagina kan daar iets nuttigs mee doen.
      sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
      return true;
    }
    sendJson(res, 200, siteInfo(config));
    return true;
  }

  if (path === '/api/onboarding') {
    await onboardingRoute(d, req, res, method);
    return true;
  }

  if (path === '/api/update') {
    const b = d.options.bijwerken;
    if (b == null) {
      sendJson(res, 200, { beschikbaar: false, nu: VERSIE, nieuwste: null, bezig: false, notities: [], magBijwerken: false });
      return true;
    }
    const wie = await d.wie(req);
    if (method === 'POST') {
      const uit = await b.installeer();
      if (!uit.ok) {
        sendJson(res, 409, { fout: uit.reden ?? 'bijwerken lukte niet' });
        return true;
      }
    }
    sendJson(res, 200, await b.view(wie.beheerder, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    return true;
  }

  if (path === '/api/functies') {
    await functiesRoute(d, req, res, method);
    return true;
  }

  // De integratie in Home Assistant (besluit 184): hoe hij erbij staat, en neerzetten; alleen de beheerder.
  if (path === '/api/integratie') {
    const integratie = d.options.integratie;
    const wie = await d.wie(req);
    if (integratie == null) {
      sendJson(res, 200, { kan: false, staat: 'nee', versie: null, nieuw: null, geladen: null, toegevoegd: null });
      return true;
    }
    if (!wie.beheerder) {
      sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 200, await integratie.stand());
      return true;
    }
    const uit = await integratie.zetNeer();
    if (uit.ok) sendJson(res, 200, await integratie.stand());
    else sendJson(res, 409, { fout: uit.reden });
    return true;
  }

  // Een proefmelding naar je eigen telefoon (besluit 183).
  if (path === '/api/proefmelding') {
    if (method !== 'POST' || d.options.proefmelding == null) {
      sendJson(res, method !== 'POST' ? 405 : 503, { fout: 'een proefmelding is een POST, in de add-on' });
      return true;
    }
    const wie = await d.wie(req);
    const uit = await d.options.proefmelding(wie.userId);
    if (uit.ok) sendJson(res, 200, uit);
    else sendJson(res, uit.status, { fout: uit.reden });
    return true;
  }

  /*
   * De dataset ophalen.
   *
   * Twee paden: `/api/export/info` zegt hoe groot het is, zodat de knop een
   * getal kan tonen in plaats van een belofte, en `/api/export` levert het
   * spul. Allebei lezen; de 405-muur hierboven blijft dus ongemoeid.
   */

  if (path === '/api/export/info') {
    if (logDir == null) {
      sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er valt niets te exporteren' });
      return true;
    }
    sendJson(res, 200, await exportInfo(logDir));
    return true;
  }

  if (path === '/api/gegevens' || path === '/api/back-up' || path === '/api/opnieuw') {
    await gegevensRoute(d, req, res, method, path);
    return true;
  }

  if (path === '/api/export') {
    // Je gegevens downloaden is meer dan kijken: niet voor een gast (besluit 147), en sinds besluit 151 alleen de hoofdgebruiker.
    if ((await d.gast(req))?.gast) {
      sendJson(res, 403, { fout: 'als gast kun je de gegevens niet downloaden' });
      return true;
    }
    if (d.options.gegevens && !(await d.hoofd(req))) {
      sendJson(res, 403, { fout: 'alleen de hoofdgebruiker kan het logboek downloaden' });
      return true;
    }
    if (logDir == null) {
      sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er valt niets te exporteren' });
      return true;
    }
    const info = await exportInfo(logDir);
    if (info.bestanden === 0) {
      sendJson(res, 503, { wachten: 'nog geen dagbestanden' });
      return true;
    }
    if (method === 'HEAD') {
      // Geen inhoud, wel het antwoord dat er iets te halen valt.
      res.writeHead(200, { 'content-type': 'application/gzip' });
      res.end();
      return true;
    }
    await writeExport(logDir, res, new Date(), await d.options.gegevens?.analyse());
    return true;
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
    sendJson(res, 200, { punten: d.options.klaarzetten ? await d.options.klaarzetten(taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])) : [] });
    return true;
  }

  if (path === '/api/startscherm') {
    sendJson(res, 200, { eigenPoort: d.options.eigenPoort != null, adres: d.eigenAdres });
    return true;
  }

  if (path === '/api/versie') {
    // Hooguit tien versies terug (besluit 133).
    sendJson(res, 200, { ...(d.options.version ?? UNKNOWN_VERSION), nieuw: nieuwInTaal(NIEUW.slice(0, TERUGKIJKEN), taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])) });
    return true;
  }

  if (path === '/api/health') {
    const snapshot = d.options.latest();
    sendJson(res, 200, {
      ok: true,
      versie: d.options.version ?? UNKNOWN_VERSION,
      laatsteBesluitMs: snapshot?.atMs ?? null,
      analyseBerekendOpMs: d.options.divergence?.()?.berekendOpMs ?? null,
      kijkers: d.live.kijkers,
    });
    return true;
  }

  return false;
}

/**
 * Back-up, herstel en opnieuw beginnen (besluit 151). Kijken mag iedereen
 * die ingelogd is; downloaden, terugzetten en opnieuw beginnen alleen de
 * hoofdgebruiker. Na terugzetten of opnieuw beginnen start de dienst
 * opnieuw, pas als het antwoord weg is.
 */
export async function gegevensRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, method: string, path: string): Promise<void> {
  const g = d.options.gegevens;
  const logDir = d.options.logDir;
  if (g == null || logDir == null) {
    sendJson(res, 503, { wachten: 'er wordt niets bewaard, dus er is geen back-up' });
    return;
  }
  const hoofd = await d.hoofd(req);
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

/**
 * De onboarding: een voorstel ophalen, of het beantwoorde voorstel bewaren.
 *
 * Twee methoden op één pad, omdat het over hetzelfde ding gaat. De GET is
 * altijd beschikbaar zolang de onboarding bestaat; de POST kwam hierboven
 * al langs de 405-muur en zit dus achter dezelfde voorwaarde.
 */
export async function onboardingRoute(
  d: Diensten,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
): Promise<void> {
  const onboarding = d.options.onboarding;
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
      // De vragen in de taal van de app (besluit 185).
      const lang = taalVan(new URL(req.url ?? '/', 'http://localhost').searchParams.get('taal') ?? req.headers['x-taal']);
      sendJson(res, 200, { ...proposal, keuzes: keuzesInTaal(proposal.keuzes, lang), bestaande: existing, namen: onboarding.namen(), huis: d.options.welkomHuis?.() ?? null });
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

  const result = await onboarding.save(clean, taalVan(new URL(req.url ?? '/', 'http://localhost').searchParams.get('taal') ?? req.headers['x-taal']));
  sendJson(res, result.ok ? 200 : 422, result);
  // Eerst het antwoord, dan opnieuw starten: de pagina wacht tot de dienst terug is.
  if (result.ok) d.options.naOnboarding?.();
}

/**
 * Camera's en de deurbel (besluit 109). GET geeft wat er gevonden is, het
 * voorstel en wat er vastligt; POST legt de keuzes vast, na de controle dat
 * Home Assistant elke camera en melder kent.
 */
export async function functiesRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
  const door = d.options.functies;
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
  sendJson(res, 200, { instellingen: door.store.current ? volledig(door.store.current, gevonden) : null, voorstel: functiesVoorstel(gevonden), gevonden, lichtMogelijk: d.options.lights != null, schermMogelijk: d.options.covers != null });
}
