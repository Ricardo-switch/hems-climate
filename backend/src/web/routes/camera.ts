/**
 * Camera's en de deurbel (besluiten 106, 109 en 182).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { Readable, pipeline } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CAMERA_ID } from '../camera.js';
import { SESSION_COOKIE, cookieValue } from '../auth.js';
import { sendJson } from '../http.js';
import type { Diensten, Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function cameraRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  /*
   * Een camera bekijken (besluit 106): live, of één plaatje. Alleen met inlog,
   * alleen camera's die het huis toont, en alleen lezen bij Home Assistant.
   */
  if (path === '/api/camera' && (method === 'GET' || method === 'HEAD')) {
    await cameraRoute(d, req, res, url);
    return true;
  }

  // De kaart Camera's (besluit 201): de camera's met wat ze nu zien of wanneer het laatst.
  if (path === '/api/cameras') {
    const lijst = d.options.cameras?.() ?? [];
    sendJson(res, 200, { aan: lijst.length > 0, cameras: lijst });
    return true;
  }

  // De deurbel als kaart op Thuis (besluit 182): welk beeld, en wanneer er het laatst werd aangebeld.
  if (path === '/api/deurbel') {
    const bel = d.options.deurbel?.() ?? null;
    sendJson(res, 200, bel ? { aan: true, ...bel } : { aan: false });
    return true;
  }

  return false;
}

export async function cameraRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const cam = d.options.camera;
  const access = d.access(req);
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
  // Aanbellen gaat voor (25 oktober 2026): een telefoon met een camera open mag de deurbel niet blokkeren.
  const bel = url.searchParams.get('bel') === '1';
  if (live && d.liveStreams >= (bel ? 8 : 4)) {
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
  if (live) d.liveStreams += 1;
  // Samen dicht: hangt de kijker op, dan stopt ook de stroom van Home Assistant.
  pipeline(Readable.fromWeb(up.body as import('node:stream/web').ReadableStream<Uint8Array>), res, () => {
    if (live) d.liveStreams = Math.max(0, d.liveStreams - 1);
  });
}
