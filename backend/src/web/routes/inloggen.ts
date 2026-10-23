/**
 * Inloggen, uitloggen en "wie ben ik" (besluit 99).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { SESSION_COOKIE, cookieValue, newState, safeReturn, sessionCookie, type Visitor } from '../auth.js';
import { sendJson, verderNa } from '../http.js';
import type { Diensten, Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function inloggenRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  if (path === '/api/sessie' || path.startsWith('/auth/')) {
    await authRoute(d, req, res, method, path, url);
    return true;
  }

  return false;
}

/**
 * Inloggen, uitloggen en "wie ben ik" (besluit 99).
 *
 * Inloggen stuurt de browser naar Home Assistant; die komt terug op
 * `/auth/callback` met een code. De dienst wisselt die in voor wie het is,
 * maakt een eigen sessie en gooit het token van Home Assistant weg.
 */

export async function authRoute(d: Diensten, req: IncomingMessage, res: ServerResponse, method: string, path: string, url: URL): Promise<void> {
  const access = d.access(req);
  if (path === '/api/sessie') {
    let visitor: Visitor | null = null;
    if (access.kind !== 'open') visitor = await d.bezoeker(req);
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
    for (const [k, v] of d.pending) if (v.untilMs < now) d.pending.delete(k);
    const state = newState();
    d.pending.set(state, { terug: safeReturn(url.searchParams.get('terug')), untilMs: now + 10 * 60_000 });
    res.writeHead(302, { location: access.login.authorizeUrl(origin, state), 'cache-control': 'no-store' });
    res.end();
    return;
  }
  if (path === '/auth/callback') {
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    const pending = d.pending.get(state);
    d.pending.delete(state);
    if (pending == null || pending.untilMs < Date.now() || code == null) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Deze inlog is verlopen of komt niet van hier. Probeer het opnieuw.\n');
      return;
    }
    try {
      const user = await access.login.identify(code, origin);
      const id = await access.store.create({ userId: user.userId, naam: user.naam, rol: user.isAdmin ? 'beheerder' : 'bewoner' });
      // Wie is het (besluit 147)? Een nieuwe bewoner krijgt het welkom, een account zonder persoon de vraag.
      const eerst = (await d.options.bewoners?.herken({ userId: user.userId, naam: user.naam }).catch(() => null)) ?? null;
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
