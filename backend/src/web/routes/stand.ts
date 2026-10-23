/**
 * De stand van nu: het besluit, de live-verbinding en de vergelijking met het oude systeem.
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function standRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  if (path === '/api/state') {
    const snapshot = d.options.latest();
    if (snapshot == null) {
      // 503 en niet 200-met-null: er ís nog geen stand, en dat is iets
      // anders dan een lege stand. De pagina kan dat onderscheid tonen.
      sendJson(res, 503, { wachten: 'nog geen besluit genomen' });
      return true;
    }
    sendJson(res, 200, d.withResident(snapshot, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    return true;
  }

  if (path === '/api/events') {
    d.live.abonneer(res, method === 'HEAD', taalVan(url.searchParams.get('taal')));
    return true;
  }

  if (path === '/api/divergence') {
    const report = d.options.divergence?.() ?? null;
    if (report == null) {
      // Onderscheid tussen "staat uit" en "nog niet gerekend" is voor de
      // pagina het verschil tussen iets verbergen en iets uitleggen.
      sendJson(res, 503, {
        wachten:
          d.options.divergence == null
            ? 'geen logboekanalyse ingeschakeld'
            : 'nog niet doorgerekend',
      });
      return true;
    }
    sendJson(res, 200, report);
    return true;
  }

  return false;
}
