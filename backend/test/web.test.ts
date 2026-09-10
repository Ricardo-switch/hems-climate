/**
 * Tests op de read-only webweergave.
 *
 * De server draait hier echt en wordt over http benaderd, niet via een
 * nagebootst verzoek. Dat is het verschil tussen "de routering klopt" en "een
 * browser krijgt dit werkelijk te zien" — en juist bij SSE en bij het serveren
 * van bestanden zit het venijn in dat tweede.
 */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { WebServer } from '../src/web/server.js';
import { DivergenceCache, type DivergenceReport } from '../src/web/divergence.js';
import type { LiveSnapshot } from '../src/adapters/homeassistant/shadow.js';
import { exampleSite } from './site.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

function snapshot(over: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    atMs: Date.parse('2026-09-09T13:00:00Z'),
    trigger: 'wijziging',
    changed: true,
    explanation: {
      mode: 'dag',
      modeSource: 'schedule',
      occupied: true,
      budget: {
        availableW: 1200,
        allocatedW: 400,
        surplusW: 1200,
        reclaimableW: 0,
        gridPowerW: -1200,
      },
      failsafe: { active: false, unreliable: [] },
      perZone: [
        {
          zoneId: 'zolder',
          temperatureC: 24.5,
          humidityPct: null,
          targetC: 22.5,
          demand: 'cool',
          reason: 'zone_above_setpoint',
        },
      ],
      outdoorTemperatureC: 18.2,
    },
    commands: [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }],
    accepted: [],
    rejected: [],
    observed: { 'ac-zolder': 'off' },
    legacy: 'PV-koelen: Wacht op overschot',
    ...over,
  };
}

/** Start een server op een vrije poort en levert de basis-URL. */
async function start(options: {
  latest?: () => LiveSnapshot | null;
  webDir?: string;
  divergence?: () => DivergenceReport | null;
}): Promise<{ base: string; server: WebServer }> {
  const webDir = options.webDir ?? (await mkdtemp(join(tmpdir(), 'hems-web-')));
  if (!options.webDir) cleanups.push(() => rm(webDir, { recursive: true, force: true }));

  const server = new WebServer({
    port: 0,
    host: '127.0.0.1',
    webDir,
    config: exampleSite,
    latest: options.latest ?? (() => null),
    ...(options.divergence ? { divergence: options.divergence } : {}),
    write: () => {},
  });
  const port = await server.start();
  cleanups.push(() => server.stop());
  return { base: `http://127.0.0.1:${port}`, server };
}

describe('de weergave leest alleen', () => {
  it('weigert elke methode die zou kunnen schrijven', async () => {
    const { base } = await start({ latest: () => snapshot() });

    // Niet één route uitgezonderd: de controle staat vóór de routering.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const path of ['/api/state', '/api/site', '/api/events', '/']) {
        const res = await fetch(`${base}${path}`, { method });
        expect(res.status, `${method} ${path}`).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD');
      }
    }
  });

  it('serveert niets buiten de webmap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hems-web-'));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    // Het geheim ligt precies één niveau boven de gebouwde frontend.
    await writeFile(join(root, 'geheim.txt'), 'HA_TOKEN=eyJ...', 'utf-8');
    const webDir = join(root, 'web');
    await mkdir(webDir);
    await writeFile(join(webDir, 'index.html'), '<h1>hallo</h1>', 'utf-8');

    const { base } = await start({ webDir });

    expect((await fetch(`${base}/`)).status).toBe(200);
    for (const attempt of [
      '/../geheim.txt',
      '/..%2Fgeheim.txt',
      '/%2e%2e/geheim.txt',
      '/web/../../geheim.txt',
    ]) {
      const res = await fetch(`${base}${attempt}`);
      expect(await res.text(), attempt).not.toContain('HA_TOKEN');
    }
  });
});

describe('de stand opvragen', () => {
  it('zegt dat er nog niets is in plaats van een lege stand te tonen', async () => {
    const { base } = await start({ latest: () => null });
    const res = await fetch(`${base}/api/state`);

    // 503 en niet 200-met-null: "nog niet gerekend" is iets anders dan
    // "niets te doen", en de pagina moet dat verschil kunnen tonen.
    expect(res.status).toBe(503);
  });

  it('geeft het besluit onbewerkt door', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const res = await fetch(`${base}/api/state`);
    const body = (await res.json()) as LiveSnapshot;

    expect(res.status).toBe(200);
    // Onbewerkt: de weergave rekent niets uit, dus wat de kern zei moet er
    // ongewijzigd uit komen.
    expect(body).toEqual(snapshot());
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('levert de namen uit de configuratie los van het besluit', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const site = (await (await fetch(`${base}/api/site`)).json()) as {
      zones: { id: string; name: string }[];
      actuators: { id: string }[];
    };

    expect(site.zones.length).toBe(exampleSite.zones.length);
    expect(site.actuators.length).toBe(exampleSite.actuators.length);
    // Geen token, geen URL, geen configuratiepad: alleen wat de weergave toont.
    expect(JSON.stringify(site)).not.toMatch(/token|HA_URL|password/i);
  });
});

describe('de besluitenstroom', () => {
  /** Leest zoveel SSE-gebeurtenissen als gevraagd en breekt dan af. */
  async function readEvents(url: string, count: number): Promise<unknown[]> {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const out: unknown[] = [];
    let buffer = '';

    try {
      while (out.length < count) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf('\n\n');
        while (index !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          for (const line of frame.split('\n')) {
            if (line.startsWith('data: ')) out.push(JSON.parse(line.slice(6)));
          }
          index = buffer.indexOf('\n\n');
        }
      }
    } finally {
      controller.abort();
    }
    return out;
  }

  it('stuurt de huidige stand meteen mee bij het openen', async () => {
    // Bij een hartslag van dertig seconden is wachten op het volgende besluit
    // lang genoeg om voor een kapotte pagina door te gaan.
    const { base } = await start({ latest: () => snapshot() });
    const events = await readEvents(`${base}/api/events`, 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(snapshot());
  });

  it('duwt elk volgend besluit door, ook als het niet wijzigde', async () => {
    const { base, server } = await start({ latest: () => snapshot() });

    const events = readEvents(`${base}/api/events`, 2);
    // Even wachten tot de abonnee binnen is; anders publiceren we in het niets.
    while (server.viewers === 0) await new Promise((r) => setTimeout(r, 5));

    // Ongewijzigd besluit, hogere temperatuur. Een dashboard dat pas bijwerkt
    // als de arbiter van gedachten verandert, lijkt vastgelopen.
    server.publish(
      snapshot({
        changed: false,
        explanation: {
          ...snapshot().explanation,
          perZone: [
            {
              zoneId: 'zolder',
              temperatureC: 25.1,
              humidityPct: null,
              targetC: 22.5,
              demand: 'cool',
              reason: 'zone_above_setpoint',
            },
          ],
        },
      }),
    );

    const received = (await events) as LiveSnapshot[];
    expect(received).toHaveLength(2);
    expect(received[1]?.explanation.perZone[0]?.temperatureC).toBe(25.1);
  });

  it('ruimt een kijker op die weggaat', async () => {
    const { base, server } = await start({ latest: () => snapshot() });

    await readEvents(`${base}/api/events`, 1);
    // De verbinding is afgebroken; de server hoort dat te merken.
    const deadline = Date.now() + 2_000;
    while (server.viewers > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(server.viewers).toBe(0);
  });
});

describe('de terugblik op de logboeken', () => {
  const DAG = '2026-11-20';
  const T0 = Date.parse(`${DAG}T09:00:00Z`);

  /** Een logboek met een korte periode waarin de arbiter strenger zou zijn. */
  async function logboek(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-div-web-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const regels: string[] = [];
    for (let i = 0; i < 30; i++) {
      const vol = i === 0;
      regels.push(
        JSON.stringify({
          t: T0 + i * 60_000,
          changed: vol,
          mode: 'dag',
          budget: {
            availableW: 0,
            allocatedW: 0,
            surplusW: 0,
            reclaimableW: 700,
            gridPowerW: 700,
          },
          obs: { 'ac-zolder': 'cool@21' },
          ...(vol
            ? {
                zones: [{ zoneId: 'zolder', temperatureC: 24, demand: 'cool' }],
                commands: [
                  { kind: 'setAction', actuatorId: 'ac-zolder', action: 'off' },
                ],
                accepted: [],
                rejected: [],
                legacy: 'PV-koelen: Gepauzeerd (Import)',
              }
            : { zonesT: [['zolder', 24, 'cool']] }),
        }),
      );
    }
    await writeFile(join(dir, `decisions-${DAG}.ndjson`), regels.join('\n') + '\n', 'utf-8');
    return dir;
  }

  it('zegt dat er nog niets is berekend in plaats van niets te tonen', async () => {
    const { base } = await start({ divergence: () => null });
    const res = await fetch(`${base}/api/divergence`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ wachten: 'nog niet doorgerekend' });
  });

  it('onderscheidt "staat uit" van "nog niet gerekend"', async () => {
    const { base } = await start({});
    const res = await fetch(`${base}/api/divergence`);
    expect(res.status).toBe(503);
    // De pagina moet iets kunnen verbergen dat uitstaat, en iets kunnen
    // uitleggen dat nog moet komen. Dat zijn twee verschillende dingen.
    expect(await res.json()).toEqual({ wachten: 'geen logboekanalyse ingeschakeld' });
  });

  it('levert tijdlijn, verhoudingen en stroom uit een echt logboek', async () => {
    const cache = new DivergenceCache({ logDir: await logboek(), write: () => {} });
    await cache.refresh();

    const { base } = await start({ divergence: () => cache.latest });
    const res = await fetch(`${base}/api/divergence`);
    const r = (await res.json()) as DivergenceReport;

    expect(res.status).toBe(200);
    expect(r.momenten).toBe(30);
    expect(r.bestanden).toBe(1);

    // De tijdlijn is één regel per dag van 96 tekens — compact genoeg om een
    // winter te versturen zonder er tienduizend objecten van te maken.
    expect(r.dagen).toHaveLength(1);
    expect(r.dagen[0]?.states).toHaveLength(96);
    expect(r.dagen[0]?.day).toBe(DAG);

    // Het oude systeem koelde, de arbiter zou hebben afgeschakeld.
    const zolder = r.tallies.find((t) => t.actuatorId === 'ac-zolder');
    expect(zolder?.stricter).toBeGreaterThan(0);
    expect(r.episodes.length).toBeGreaterThan(0);
    expect(r.episodesTotaal).toBeGreaterThanOrEqual(r.episodes.length);

    // Import boven de tolerantie, dus er valt stroom toe te rekenen.
    expect(r.legacyGridWh).toBeGreaterThan(0);
    expect(r.avoidableGridWh).toBeGreaterThan(0);
  });

  it('houdt het aantal episodes begrensd maar telt ze wel allemaal', async () => {
    const cache = new DivergenceCache({
      logDir: await logboek(),
      maxEpisodes: 0,
      write: () => {},
    });
    await cache.refresh();

    expect(cache.latest?.episodes).toHaveLength(0);
    expect(cache.latest?.episodesTotaal).toBeGreaterThan(0);
  });

  it('houdt de vorige uitkomst vast wanneer het opnieuw rekenen mislukt', async () => {
    const dir = await logboek();
    const cache = new DivergenceCache({ logDir: dir, write: () => {} });
    await cache.refresh();
    const eerste = cache.latest;
    expect(eerste).not.toBeNull();

    // Map weg: de analyse kan niets meer lezen.
    await rm(dir, { recursive: true, force: true });
    await cache.refresh();

    // Geen lege pagina en geen crash; de weergave ziet aan berekendOpMs dat
    // het cijfer veroudert.
    expect(cache.latest).toBe(eerste);
  });
});

describe('de pagina veroudert niet stilletjes', () => {
  /** Een webmap met een pagina en een script erin. */
  async function webmap(inhoud: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-cache-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, 'index.html'), '<h1>hallo</h1>', 'utf-8');
    await writeFile(join(dir, 'app.js'), inhoud, 'utf-8');
    return dir;
  }

  it('laat een browser nooit een oud script vasthouden', async () => {
    const { base } = await start({ webDir: await webmap('const versie = 1;') });

    for (const pad of ['/', '/app.js']) {
      const res = await fetch(`${base}${pad}`);
      // `max-age` zou hier fataal zijn: de bestandsnamen dragen geen hash, dus
      // na een uitrol krijgt de bezoeker nieuwe HTML met oude JS. Dat mislukt
      // op de lastigst vindbare manier — een pagina die half werkt.
      expect(res.headers.get('cache-control'), pad).toBe('no-cache');
    }
  });

  it('geeft 304 zolang het bestand niet wijzigde', async () => {
    const { base } = await start({ webDir: await webmap('const versie = 1;') });

    const eerste = await fetch(`${base}/app.js`);
    const gewijzigd = eerste.headers.get('last-modified');
    expect(gewijzigd).not.toBeNull();

    const tweede = await fetch(`${base}/app.js`, {
      headers: { 'if-modified-since': gewijzigd! },
    });
    // Navragen mag; opnieuw versturen hoeft niet.
    expect(tweede.status).toBe(304);
    expect(await tweede.text()).toBe('');
  });

  it('stuurt de nieuwe versie zodra het bestand wel wijzigde', async () => {
    const dir = await webmap('const versie = 1;');
    const { base } = await start({ webDir: dir });

    const eerste = await fetch(`${base}/app.js`);
    const gewijzigd = eerste.headers.get('last-modified')!;

    // Een uitrol, een seconde later: `last-modified` heeft secondeprecisie.
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(join(dir, 'app.js'), 'const versie = 2;', 'utf-8');

    const tweede = await fetch(`${base}/app.js`, {
      headers: { 'if-modified-since': gewijzigd },
    });
    expect(tweede.status).toBe(200);
    expect(await tweede.text()).toContain('versie = 2');
  });
});
