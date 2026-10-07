/**
 * Wie mag bedienen (besluit 99): hostnamen, sessies, en inloggen via Home
 * Assistant tegen een nep die zich gedraagt als het echte inlogscherm.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';

import { SESSION_IDLE_MS, SessionStore, homeAssistantLogin, hostAllowed, safeReturn } from '../src/web/auth.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('alleen bekende hostnamen', () => {
  it('kent het thuisnetwerk en het tailnet', () => {
    for (const h of ['192.168.67.65:8099', '100.64.1.2', '[::1]:8099', 'localhost:8099', 'nas', 'nas.local', 'nas.lan', 'nas.home.arpa', 'nas.tail1234.ts.net']) {
      expect(hostAllowed(h), h).toBe(true);
    }
  });

  it('weigert een publieke naam, behalve als de beheerder hem toevoegt', () => {
    expect(hostAllowed('nas.vreemd.example')).toBe(false);
    expect(hostAllowed('klimaat.thuis.nl:8099', ['klimaat.thuis.nl'])).toBe(true);
    expect(hostAllowed(undefined)).toBe(false);
  });
});

describe('de terugweg na het inloggen', () => {
  it('is altijd een pad op deze dienst', () => {
    expect(safeReturn('/nieuw.html#huis')).toBe('/nieuw.html#huis');
    for (const bad of [null, '//vreemd.example', 'https://vreemd.example', '/\\vreemd.example']) {
      expect(safeReturn(bad)).toBe('/nieuw.html');
    }
  });
});

describe('sessies', () => {
  it('herkennen het cookie, vervallen na lang niet gebruiken, en overleven een herstart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-sessie-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    let now = 1_000_000;
    const store = new SessionStore({ logDir: dir, now: () => now });
    const id = await store.create({ userId: 'u1', naam: 'Ricardo', rol: 'beheerder' });
    expect(await store.visitor(id)).toEqual({ naam: 'Ricardo', rol: 'beheerder' });
    expect(await store.visitor('verzonnen')).toBeNull();

    // Na een herstart, uit het bestand.
    const again = new SessionStore({ logDir: dir, now: () => now });
    expect(await again.visitor(id)).toEqual({ naam: 'Ricardo', rol: 'beheerder' });
    expect(await readFile(join(dir, 'sessies.json'), 'utf-8')).not.toContain(id);

    now += SESSION_IDLE_MS + 1;
    expect(await again.visitor(id)).toBeNull();
  });
});

describe('inloggen via Home Assistant', () => {
  /** Een nep-Home Assistant: het inlogscherm, het inwisselen van de code, en wie het is. */
  async function fakeHa(user: { id: string; name: string; is_admin: boolean }) {
    const seen: string[] = [];
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += String(c)));
      req.on('end', () => {
        seen.push(`${req.method} ${req.url} ${body}`);
        if (req.url === '/auth/token') {
          const form = new URLSearchParams(body);
          if (form.get('code') !== 'goede-code') {
            res.writeHead(400).end('{}');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: 'toegang', refresh_token: 'ververs', expires_in: 1800 }));
        } else if (req.url === '/auth/revoke') {
          res.writeHead(200).end();
        } else {
          res.writeHead(404).end();
        }
      });
    });
    const wss = new WebSocketServer({ server, path: '/api/websocket' });
    wss.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'auth_required' }));
      socket.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; id?: number; access_token?: string };
        if (msg.type === 'auth') socket.send(JSON.stringify({ type: msg.access_token === 'toegang' ? 'auth_ok' : 'auth_invalid' }));
        if (msg.type === 'auth/current_user') socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: user }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    cleanups.push(() => new Promise<void>((r) => {
      wss.close();
      server.close(() => r());
    }));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
  }

  it('stuurt naar het inlogscherm met de app als client en een terugweg op hetzelfde adres', () => {
    const url = new URL(homeAssistantLogin('http://ha.local:8123/').authorizeUrl('http://192.168.67.65:8099', 'st'));
    expect(url.origin + url.pathname).toBe('http://ha.local:8123/auth/authorize');
    expect(url.searchParams.get('client_id')).toBe('http://192.168.67.65:8099/');
    expect(url.searchParams.get('redirect_uri')).toBe('http://192.168.67.65:8099/auth/callback');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('maakt van het websocket-adres van de dienst een adres dat een browser opent', async () => {
    const ws = new URL(homeAssistantLogin('ws://192.168.67.52:8123/api/websocket').authorizeUrl('http://nas:8099', 'st'));
    expect(ws.origin + ws.pathname).toBe('http://192.168.67.52:8123/auth/authorize');
    const wss = new URL(homeAssistantLogin('wss://ha.example.ts.net/api/websocket').authorizeUrl('http://nas:8099', 'st'));
    expect(wss.origin + wss.pathname).toBe('https://ha.example.ts.net/auth/authorize');
    // En de hele inlog werkt via zo'n adres.
    const ha = await fakeHa({ id: 'abc', name: 'Ricardo', is_admin: false });
    const user = await homeAssistantLogin(`${ha.base.replace('http', 'ws')}/api/websocket`).identify('goede-code', 'http://nas:8099');
    expect(user).toEqual({ userId: 'abc', naam: 'Ricardo', isAdmin: false });
  });

  it('wisselt de code in, vraagt wie het is, en gooit het token van Home Assistant weg', async () => {
    const ha = await fakeHa({ id: 'abc', name: 'Ricardo', is_admin: true });
    const user = await homeAssistantLogin(ha.base).identify('goede-code', 'http://192.168.67.65:8099');
    expect(user).toEqual({ userId: 'abc', naam: 'Ricardo', isAdmin: true });
    expect(ha.seen.some((s) => s.startsWith('POST /auth/token') && s.includes('client_id=http%3A%2F%2F192.168.67.65%3A8099%2F'))).toBe(true);
    expect(ha.seen.some((s) => s.startsWith('POST /auth/revoke') && s.includes('token=ververs'))).toBe(true);
  });

  it('weigert een code die Home Assistant niet kent', async () => {
    const ha = await fakeHa({ id: 'abc', name: 'Ricardo', is_admin: false });
    await expect(homeAssistantLogin(ha.base).identify('foute-code', 'http://nas:8099')).rejects.toThrow(/weigerde/);
  });
});
