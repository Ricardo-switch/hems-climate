/**
 * Energie: meters en prijzen, de aansluiting en de gevels op de kaart (besluiten 102 en 103).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateConnection } from '../aansluiting.js';
import { importFromPrefs, pricesInPrefs, type DashboardPrice, type MeterOption } from '../energy.js';
import { gevelsUitOmtrek, haalOmtrek, voorkantUitKaart } from '../kaart.js';
import { readJson, sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function energieRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, path, method } = v;
  if (path === '/api/energie') {
    await energieRoute(d, req, res, method);
    return true;
  }

  if (path === '/api/aansluiting') {
    await aansluitingRoute(d, req, res, method);
    return true;
  }

  if (path === '/api/gevel-kaart' && method === 'POST') {
    await gevelKaartRoute(d, req, res);
    return true;
  }

  return false;
}

export async function energieRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
  const energy = d.options.energy;
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
    d.yieldCache.clear();
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
export async function aansluitingRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, method: string): Promise<void> {
  const connection = d.options.connection;
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
  sendJson(res, 200, connection.view(taalVan(new URL(req.url ?? '/', 'http://localhost').searchParams.get('taal') ?? req.headers['x-taal'])));
}

/**
 * De gevels opmeten op de kaart (21 oktober 2026): de omtrek van het huis in
 * OpenStreetMap, en daaruit de voorkant die het dichtst bij `nuDeg` ligt.
 * Alleen na een tik van de beheerder; niets bewaard behalve een dag de omtrek.
 */
export async function gevelKaartRoute(d: Diensten, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const loc = d.options.location?.() ?? null;
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
  let bewaard = d.kaart.get(sleutel);
  if (bewaard == null || Date.now() - bewaard.at > 86_400_000) {
    try {
      bewaard = { at: Date.now(), omtrek: await (d.options.omtrek ?? haalOmtrek)(loc.latDeg, loc.lonDeg) };
    } catch {
      sendJson(res, 502, { fout: 'De kaart gaf geen antwoord. Probeer het straks nog eens.' });
      return;
    }
    d.kaart.set(sleutel, bewaard);
  }
  const gevels = bewaard.omtrek ? gevelsUitOmtrek(bewaard.omtrek) : null;
  if (gevels == null) {
    sendJson(res, 404, { fout: 'Op de kaart staat op deze plek geen huis.' });
    return;
  }
  sendJson(res, 200, { voorkantDeg: voorkantUitKaart(gevels, nu), as: gevels.as, bron: 'OpenStreetMap' });
}
