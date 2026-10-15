/**
 * Wie mag bedienen (besluit 99).
 *
 * Kijken blijft open op het thuisnetwerk en in het tailnet. Bedienen vraagt een
 * inlog, en die gaat via Home Assistant: de app stuurt de bewoner naar het
 * inlogscherm van zijn eigen Home Assistant, krijgt een code terug, en vraagt
 * daarmee wie het is. Het token van Home Assistant gaat daarna weg; de dienst
 * bewaart alleen een eigen sessie, en daarvan alleen een vingerafdruk.
 *
 * Drie manieren van toegang, en `main.ts` kiest er één:
 *
 * - `sessions`: de NAS en elke dienst met een eigen poort. Inloggen via Home
 *   Assistant, met een sessiecookie.
 * - `ingress`: de add-on achter Ingress. Home Assistant heeft de bezoeker al
 *   vastgesteld (besluit 42, 77); een tweede inlog is er niet.
 * - `open`: alleen voor tests en voor wie het uitdrukkelijk vraagt. Elke deur
 *   is open, zoals vóór dit besluit.
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';

export type Role = 'bewoner' | 'beheerder';

export interface Visitor {
  readonly naam: string;
  readonly rol: Role;
}

/** Wat elke deur vraagt (besluit 99). De indeling en de onboarding zijn voor de beheerder. */
export const DOOR_ROLES: Readonly<Record<string, Role>> = {
  '/api/licht': 'bewoner',
  '/api/scene': 'bewoner',
  '/api/scherm': 'bewoner',
  // Hoe het voelt mag zonder inlog (besluit 134): het verandert niets aan het huis.
  '/api/uitstel': 'bewoner',
  // Een melding wegzetten (besluit 136): voor wie in huis woont.
  '/api/meldingen': 'bewoner',
  '/api/indeling': 'beheerder',
  '/api/energie': 'beheerder',
  '/api/aansluiting': 'beheerder',
  '/api/functies': 'beheerder',
  // Comfort zet de bewoner zelf (besluit 130).
  '/api/comfort': 'bewoner',
  '/api/onboarding': 'beheerder',
};

export const SESSION_COOKIE = 'hems_sessie';
/** Zo lang blijft een sessie geldig zonder gebruik: de tablet aan de muur logt één keer in. */
export const SESSION_IDLE_MS = 180 * 86_400_000;

/* ---------------------------------------------------------------- hostnamen */

/**
 * Antwoordt de dienst op deze hostnaam? Een IP-adres, `localhost`, een naam
 * zonder punt, of een naam op een domein dat alleen thuis of in het tailnet
 * bestaat. Een publieke naam die een vreemde website naar het adres van de NAS
 * laat wijzen (DNS-rebinding), valt daarbuiten. Wat de beheerder er zelf bij
 * zet, mag ook.
 */
export function hostAllowed(hostHeader: string | undefined, extra: readonly string[] = []): boolean {
  if (hostHeader == null || hostHeader === '') return false;
  let host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) host = host.slice(1, host.indexOf(']'));
  else if (host.split(':').length === 2) host = host.split(':')[0]!;
  if (isIP(host) !== 0) return true;
  if (host === 'localhost' || !host.includes('.')) return true;
  if (/\.(local|lan|home\.arpa|ts\.net|localhost)$/.test(host)) return true;
  return extra.map((h) => h.trim().toLowerCase()).includes(host);
}

/* ----------------------------------------------------------------- cookies */

export function cookieValue(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (raw == null) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Het cookie voor een sessie, of om hem te wissen. `Secure` alleen als de pagina via https kwam. */
export function sessionCookie(id: string | null, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${id ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  parts.push(id == null ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSION_IDLE_MS / 1000)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/* ----------------------------------------------------------------- sessies */

interface StoredSession {
  readonly userId: string;
  readonly naam: string;
  readonly rol: Role;
  readonly sinceMs: number;
  seenMs: number;
}

const fingerprint = (id: string) => createHash('sha256').update(id).digest('hex');

/**
 * De sessies, op vingerafdruk. Wie het bestand leest (een back-up, een
 * export), kan er niet mee inloggen: de sessie zelf staat alleen in het cookie.
 */
export class SessionStore {
  readonly #file: string | null;
  readonly #now: () => number;
  #sessions = new Map<string, StoredSession>();
  #loaded = false;

  constructor(options: { logDir?: string | null; now?: () => number } = {}) {
    this.#file = options.logDir ? join(options.logDir, 'sessies.json') : null;
    this.#now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    if (this.#loaded || this.#file == null) return;
    this.#loaded = true;
    try {
      const saved = JSON.parse(await readFile(this.#file, 'utf-8')) as Record<string, StoredSession>;
      this.#sessions = new Map(Object.entries(saved));
    } catch {
      // Nog geen sessies.
    }
  }

  /** Maakt een sessie en geeft de waarde voor het cookie terug. */
  async create(user: { userId: string; naam: string; rol: Role }): Promise<string> {
    await this.load();
    const id = randomBytes(32).toString('base64url');
    const now = this.#now();
    this.#sessions.set(fingerprint(id), { ...user, sinceMs: now, seenMs: now });
    await this.#save();
    return id;
  }

  /** Wie hoort bij dit cookie, of null. Een sessie die lang niet gebruikt is, vervalt. */
  async visitor(id: string | null): Promise<Visitor | null> {
    if (id == null || id === '') return null;
    await this.load();
    const key = fingerprint(id);
    const s = this.#sessions.get(key);
    if (!s) return null;
    const now = this.#now();
    if (now - s.seenMs > SESSION_IDLE_MS) {
      this.#sessions.delete(key);
      await this.#save();
      return null;
    }
    // Hooguit één keer per uur wegschrijven dat hij gebruikt is.
    if (now - s.seenMs > 3_600_000) {
      s.seenMs = now;
      await this.#save();
    }
    return { naam: s.naam, rol: s.rol };
  }

  async remove(id: string | null): Promise<void> {
    if (id == null) return;
    await this.load();
    if (this.#sessions.delete(fingerprint(id))) await this.#save();
  }

  async #save(): Promise<void> {
    if (this.#file == null) return;
    const temp = `${this.#file}.tmp`;
    await writeFile(temp, JSON.stringify(Object.fromEntries(this.#sessions)), 'utf-8');
    await rename(temp, this.#file);
  }
}

/* ------------------------------------------------- inloggen via Home Assistant */

/** Wat de dienst na het inloggen van Home Assistant wil weten. */
export interface HaUser {
  readonly userId: string;
  readonly naam: string;
  readonly isAdmin: boolean;
}

/** Inloggen via Home Assistant; in tests vervangen door een nep. */
export interface HaLogin {
  /** Waar de browser heen gaat om in te loggen. */
  authorizeUrl(appOrigin: string, state: string): string;
  /** Wisselt de code in voor wie het is, en gooit het token van Home Assistant weg. */
  identify(code: string, appOrigin: string): Promise<HaUser>;
}

/**
 * De echte: de inlogstroom van Home Assistant. De app is daar een "client" met
 * zijn eigen adres als `client_id`; de terugkeer-URL ligt op hetzelfde adres,
 * dus Home Assistant vraagt verder niets na.
 */
export function homeAssistantLogin(haUrl: string, fetchFn: typeof fetch = fetch): HaLogin {
  // Het adres van de dienst is vaak het websocket-adres ("ws://…/api/websocket");
  // een browser opent alleen http(s). Op de NAS stuurde de inlog zo naar ws://
  // en gebeurde er niets (7 oktober).
  const base = haUrl
    .replace(/\/+$/, '')
    .replace(/\/api\/websocket$/, '')
    .replace(/^ws(s?):\/\//i, 'http$1://');
  return {
    authorizeUrl(appOrigin, state) {
      const q = new URLSearchParams({
        response_type: 'code',
        client_id: `${appOrigin}/`,
        redirect_uri: `${appOrigin}/auth/callback`,
        state,
      });
      return `${base}/auth/authorize?${q}`;
    },
    async identify(code, appOrigin) {
      const res = await fetchFn(`${base}/auth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: `${appOrigin}/` }).toString(),
      });
      if (!res.ok) throw new Error(`Home Assistant weigerde de code (${res.status})`);
      const token = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!token.access_token) throw new Error('Home Assistant gaf geen token');
      try {
        const user = await currentUser(base, token.access_token);
        return { userId: user.id, naam: user.name, isAdmin: user.is_admin };
      } finally {
        // Het token van de bewoner hebben we niet meer nodig.
        if (token.refresh_token) {
          await fetchFn(`${base}/auth/revoke`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: token.refresh_token }).toString(),
          }).catch(() => undefined);
        }
      }
    },
  };
}

/** Vraagt Home Assistant via de websocket wie bij dit token hoort. */
function currentUser(base: string, accessToken: string): Promise<{ id: string; name: string; is_admin: boolean }> {
  const wsUrl = `${base.replace(/^http/, 'ws')}/api/websocket`;
  return new Promise((resolveUser, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Home Assistant antwoordde niet op tijd'));
    }, 10_000);
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as { type: string; id?: number; success?: boolean; result?: { id: string; name: string; is_admin: boolean } };
      if (msg.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: accessToken }));
      else if (msg.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, type: 'auth/current_user' }));
      else if (msg.type === 'auth_invalid') {
        clearTimeout(timer);
        socket.close();
        reject(new Error('Home Assistant herkende het token niet'));
      } else if (msg.type === 'result' && msg.id === 1) {
        clearTimeout(timer);
        socket.close();
        if (msg.success && msg.result) resolveUser(msg.result);
        else reject(new Error('Home Assistant zei niet wie het is'));
      }
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('geen verbinding met Home Assistant'));
    });
  });
}

/* ------------------------------------------------------------------ toegang */

export type Access =
  | { readonly kind: 'sessions'; readonly store: SessionStore; readonly login: HaLogin; readonly hosts?: readonly string[] }
  | { readonly kind: 'ingress' }
  | { readonly kind: 'open' };

/** Een terugweg na het inloggen: alleen een pad op deze dienst, nooit een andere site. */
export function safeReturn(raw: string | null): string {
  if (raw == null || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/thuis.html';
  return raw;
}

/** Een willekeurige waarde die een inlogpoging aan zijn terugkeer koppelt. */
export const newState = () => randomBytes(16).toString('base64url');
