/**
 * Tests op de read-only webweergave.
 *
 * De server draait hier echt en wordt over http benaderd, niet via een
 * nagebootst verzoek. Dat is het verschil tussen "de routering klopt" en "een
 * browser krijgt dit werkelijk te zien" — en juist bij SSE en bij het serveren
 * van bestanden zit het venijn in dat tweede.
 */

import { SessionStore, type Access, type HaLogin } from '../src/web/auth.js';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { WebServer, versionFromEnv, type Version } from '../src/web/server.js';
import { DivergenceCache, type DivergenceReport } from '../src/web/divergence.js';
import { Onboarding } from '../src/web/onboarding.js';
import { FeedbackLog } from '../src/web/feedback.js';
import type { Registers } from '../src/adapters/homeassistant/discovery.js';
import { defaultStrategies } from '../src/index.js';
import type { LiveSnapshot } from '../src/adapters/homeassistant/shadow.js';
import { summarize, type HouseReport } from '../src/web/house.js';
import { LayoutStore, type Layout } from '../src/web/layout.js';
import { LightSwitch } from '../src/web/lights.js';
import { onUsablePort } from './ports.js';
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
      solarProductionW: 0,
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
/** Zoals de eigen pagina een deur gebruikt: als JSON. */
const JSON_HEADERS = { 'content-type': 'application/json' };

async function start(options: {
  latest?: () => LiveSnapshot | null;
  webDir?: string;
  divergence?: () => DivergenceReport | null;
  onboarding?: Onboarding;
  feedback?: FeedbackLog;
  withoutConfig?: boolean;
  version?: Version;
  location?: { latDeg: number; lonDeg: number } | null;
  house?: () => HouseReport | null;
  layout?: { store: LayoutStore; proposal: () => Layout | null };
  lights?: LightSwitch;
  access?: Access;
}): Promise<{ base: string; server: WebServer }> {
  const webDir = options.webDir ?? (await mkdtemp(join(tmpdir(), 'hems-web-')));
  if (!options.webDir) cleanups.push(() => rm(webDir, { recursive: true, force: true }));

  // Niet zomaar poort 0: zie ports.ts.
  const { server, port } = await onUsablePort(
    async () => {
      const server = new WebServer({
        port: 0,
        host: '127.0.0.1',
        webDir,
        config: options.withoutConfig ? null : exampleSite,
        latest: options.latest ?? (() => null),
        ...(options.divergence ? { divergence: options.divergence } : {}),
        ...(options.onboarding ? { onboarding: options.onboarding } : {}),
        ...(options.feedback ? { feedback: options.feedback } : {}),
        ...(options.version ? { version: options.version } : {}),
        ...(options.location !== undefined ? { location: () => options.location ?? null } : {}),
        ...(options.house ? { house: options.house } : {}),
        ...(options.layout ? { layout: options.layout } : {}),
        ...(options.lights ? { lights: options.lights } : {}),
        // Open, zoals vóór besluit 99, tenzij een test de inlog zelf toetst.
        access: options.access ?? { kind: 'open' },
        write: () => {},
      });
      return { server, port: await server.start() };
    },
    (s) => s.port,
    (s) => s.server.stop(),
  );
  cleanups.push(() => server.stop());
  return { base: `http://127.0.0.1:${port}`, server };
}

describe('welke versie er draait (besluit 54)', () => {
  it('staat in /api/health', async () => {
    const { base } = await start({
      version: { commit: '6f029de', gebouwd: '2026-09-30T18:20:00Z' },
    });
    const health = (await (await fetch(`${base}/api/health`)).json()) as {
      versie: Version;
    };
    expect(health.versie).toEqual({ commit: '6f029de', gebouwd: '2026-09-30T18:20:00Z' });
  });

  it('zegt eerlijk dat hij het niet weet', async () => {
    // Een image zonder bouwargumenten: dan liever `onbekend` dan een lege
    // regel die op een versie lijkt.
    const { base } = await start({});
    const health = (await (await fetch(`${base}/api/health`)).json()) as {
      versie: Version;
    };
    expect(health.versie).toEqual({ commit: 'onbekend', gebouwd: null });
  });

  it('leest de omgeving en behandelt leeg als ontbrekend', () => {
    expect(versionFromEnv({ HEMS_COMMIT: 'abc1234', HEMS_GEBOUWD: '2026-10-01T08:00:00Z' }))
      .toEqual({ commit: 'abc1234', gebouwd: '2026-10-01T08:00:00Z' });
    // Zo komt hij uit de Dockerfile wanneer niemand iets meegaf.
    expect(versionFromEnv({ HEMS_COMMIT: 'onbekend', HEMS_GEBOUWD: '' }))
      .toEqual({ commit: 'onbekend', gebouwd: null });
    expect(versionFromEnv({})).toEqual({ commit: 'onbekend', gebouwd: null });
  });
});

describe('de weergave leest alleen', () => {
  it('weigert elke methode die zou kunnen schrijven', async () => {
    const { base } = await start({ latest: () => snapshot() });

    // Niet één route uitgezonderd: de controle staat vóór de routering.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const path of ['/api/state', '/api/site', '/api/events', '/api/vraag', '/']) {
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
    // Onbewerkt: wat de kern zei, komt er ongewijzigd uit; het bewonerscontract
    // staat er alleen naast (76, 94).
    const { bewoner, ...core } = body as LiveSnapshot & { bewoner?: { kamers: { zoneId: string; kort: string }[] } };
    expect(core).toEqual(snapshot());
    expect(bewoner?.kamers.map((k) => k.zoneId)).toEqual(exampleSite.zones.map((z) => z.id));
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
    // Het besluit onbewerkt, met het bewonerscontract ernaast (94).
    const { bewoner, ...core } = events[0] as LiveSnapshot & { bewoner?: { kamers: unknown[] } };
    expect(core).toEqual(snapshot());
    expect(bewoner?.kamers).toHaveLength(exampleSite.zones.length);
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
  const DAY = '2026-11-20';
  const T0 = Date.parse(`${DAY}T09:00:00Z`);

  /** Een logboek met een korte periode waarin de arbiter strenger zou zijn. */
  async function decisionLog(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-div-web-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      const full = i === 0;
      lines.push(
        JSON.stringify({
          t: T0 + i * 60_000,
          changed: full,
          mode: 'dag',
          budget: {
            availableW: 0,
            allocatedW: 0,
            surplusW: 0,
            reclaimableW: 700,
            gridPowerW: 700,
          },
          obs: { 'ac-zolder': 'cool@21' },
          ...(full
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
    await writeFile(join(dir, `decisions-${DAY}.ndjson`), lines.join('\n') + '\n', 'utf-8');
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
    const cache = new DivergenceCache({ logDir: await decisionLog(), write: () => {} });
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
    expect(r.dagen[0]?.day).toBe(DAY);

    // Het oude systeem koelde, de arbiter zou hebben afgeschakeld.
    const attic = r.tallies.find((t) => t.actuatorId === 'ac-zolder');
    expect(attic?.stricter).toBeGreaterThan(0);
    expect(r.episodes.length).toBeGreaterThan(0);
    expect(r.episodesTotaal).toBeGreaterThanOrEqual(r.episodes.length);

    // Import boven de tolerantie, dus er valt stroom toe te rekenen.
    expect(r.legacyGridWh).toBeGreaterThan(0);
    expect(r.avoidableGridWh).toBeGreaterThan(0);
  });

  it('houdt het aantal episodes begrensd maar telt ze wel allemaal', async () => {
    const cache = new DivergenceCache({
      logDir: await decisionLog(),
      maxEpisodes: 0,
      write: () => {},
    });
    await cache.refresh();

    expect(cache.latest?.episodes).toHaveLength(0);
    expect(cache.latest?.episodesTotaal).toBeGreaterThan(0);
  });

  it('houdt de vorige uitkomst vast wanneer het opnieuw rekenen mislukt', async () => {
    const dir = await decisionLog();
    const cache = new DivergenceCache({ logDir: dir, write: () => {} });
    await cache.refresh();
    const first = cache.latest;
    expect(first).not.toBeNull();

    // Map weg: de analyse kan niets meer lezen.
    await rm(dir, { recursive: true, force: true });
    await cache.refresh();

    // Geen lege pagina en geen crash; de weergave ziet aan berekendOpMs dat
    // het cijfer veroudert.
    expect(cache.latest).toBe(first);
  });
});

describe('de pagina veroudert niet stilletjes', () => {
  /** Een webmap met een pagina en een script erin. */
  async function webDirFixture(content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-cache-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, 'index.html'), '<h1>hallo</h1>', 'utf-8');
    await writeFile(join(dir, 'app.js'), content, 'utf-8');
    return dir;
  }

  it('laat een browser nooit een oud script vasthouden', async () => {
    const { base } = await start({ webDir: await webDirFixture('const versie = 1;') });

    for (const path of ['/', '/app.js']) {
      const res = await fetch(`${base}${path}`);
      // `max-age` zou hier fataal zijn: de bestandsnamen dragen geen hash, dus
      // na een uitrol krijgt de bezoeker nieuwe HTML met oude JS. Dat mislukt
      // op de lastigst vindbare manier — een pagina die half werkt.
      expect(res.headers.get('cache-control'), path).toBe('no-cache');
    }
  });

  it('geeft 304 zolang het bestand niet wijzigde', async () => {
    const { base } = await start({ webDir: await webDirFixture('const versie = 1;') });

    const first = await fetch(`${base}/app.js`);
    const changed = first.headers.get('last-modified');
    expect(changed).not.toBeNull();

    const second = await fetch(`${base}/app.js`, {
      headers: { 'if-modified-since': changed! },
    });
    // Navragen mag; opnieuw versturen hoeft niet.
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('stuurt de nieuwe versie zodra het bestand wel wijzigde', async () => {
    const dir = await webDirFixture('const versie = 1;');
    const { base } = await start({ webDir: dir });

    const first = await fetch(`${base}/app.js`);
    const changed = first.headers.get('last-modified')!;

    // Een uitrol, een seconde later: `last-modified` heeft secondeprecisie.
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(join(dir, 'app.js'), 'const versie = 2;', 'utf-8');

    const second = await fetch(`${base}/app.js`, {
      headers: { 'if-modified-since': changed },
    });
    expect(second.status).toBe(200);
    expect(await second.text()).toContain('versie = 2');
  });
});

describe('de onboarding', () => {
  /*
   * De deur in de muur uit besluit 42. Wat hier getoetst wordt is niet dat hij
   * werkt, maar dat hij er niet is zolang hij er niet hoort te zijn.
   */
  const registers: Registers = {
    config: { time_zone: 'Europe/Amsterdam' },
    areas: [{ area_id: 'woonkamer', name: 'Woonkamer' }],
    devices: [{ id: 'dev', area_id: 'woonkamer' }],
    entities: [
      { entity_id: 'climate.ketel', device_id: 'dev' },
      { entity_id: 'sensor.woonkamer_temp', device_id: 'dev', original_device_class: 'temperature' },
    ],
    states: [
      {
        entity_id: 'climate.ketel',
        state: 'off',
        attributes: { hvac_modes: ['off', 'heat'], min_temp: 10, max_temp: 30 },
        last_changed: '2026-09-10T12:00:00+00:00',
        last_updated: '2026-09-10T12:00:00+00:00',
      },
      {
        entity_id: 'sensor.woonkamer_temp',
        state: '19.0',
        attributes: { device_class: 'temperature' },
        last_changed: '2026-09-10T12:00:00+00:00',
        last_updated: '2026-09-10T12:00:00+00:00',
      },
    ],
  };

  async function createOnboarding(): Promise<{ onboarding: Onboarding; dir: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-sites-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    return {
      onboarding: new Onboarding({
        registers: () => Promise.resolve(registers),
        sitesDir: dir,
        knownStrategies: defaultStrategies().ids,
      }),
      dir,
    };
  }

  it('bestaat niet wanneer hij niet is meegegeven', async () => {
    const { base } = await start({});
    const res = await fetch(`${base}/api/onboarding`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ antwoorden: {} }),
    });
    // Niet 503 en niet 404: de muur staat er nog, en die antwoordt met 405.
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  it('houdt de muur overeind voor elke andere route, ook mét onboarding', async () => {
    const { onboarding } = await createOnboarding();
    const { base } = await start({ onboarding });
    for (const path of ['/api/state', '/api/site', '/api/events', '/']) {
      const res = await fetch(`${base}${path}`, { method: 'POST' });
      expect(res.status, path).toBe(405);
    }
    // En elke andere methode blijft ook op het onboarding-pad geweigerd.
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/api/onboarding`, { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('GET, HEAD, POST');
    }
  });

  it('geeft een voorstel met de gevonden zones en de open keuzes', async () => {
    const { onboarding } = await createOnboarding();
    const { base } = await start({ onboarding });
    const res = await fetch(`${base}/api/onboarding`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { config: Record<string, unknown>; bevindingen: unknown[] };
    expect(body.config['zones']).toHaveLength(1);
    expect(body.bevindingen.length).toBeGreaterThan(0);
  });

  it('schrijft pas na het ophalen van een voorstel', async () => {
    const { onboarding } = await createOnboarding();
    const { base } = await start({ onboarding });
    const res = await fetch(`${base}/api/onboarding`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ antwoorden: {} }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('nog geen voorstel');
  });

  it('schrijft het bestand weg en laat het door de eigen controle komen', async () => {
    const { onboarding, dir } = await createOnboarding();
    const { base } = await start({ onboarding });
    await fetch(`${base}/api/onboarding`);
    const res = await fetch(`${base}/api/onboarding`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ antwoorden: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pad: string };
    expect(body.ok).toBe(true);
    expect(body.pad).toContain(dir);

    // En wat er staat is te lezen door de gewone lader.
    const written = JSON.parse(await readFile(body.pad, 'utf-8')) as Record<string, unknown>;
    expect(written['timezone']).toBe('Europe/Amsterdam');
  });

  it('schrijft nooit over een bestaande configuratie heen', async () => {
    const { onboarding, dir } = await createOnboarding();
    const { base } = await start({ onboarding });
    await writeFile(join(dir, 'mijn-huis.json'), '{"eigen":"werk"}', 'utf-8');

    await fetch(`${base}/api/onboarding`);
    const res = await fetch(`${base}/api/onboarding`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ antwoorden: {} }),
    });
    expect(res.status).toBe(422);
    // Het bestaande bestand is niet aangeraakt.
    expect(await readFile(join(dir, 'mijn-huis.json'), 'utf-8')).toBe('{"eigen":"werk"}');
  });

  it('legt er ook geen tweede naast, hoe anders hij ook heet', async () => {
    /*
     * Dit ging op 11 september 2026 mis op de echte add-on. Het slot keek
     * alleen of het bestand dat wíj zouden schrijven al bestond; naast
     * `huis-cornelissen.json` verscheen `mijn-huis.json`, de lader wist niet
     * meer welke gold, en de dienst startte niet meer op.
     */
    const { onboarding, dir } = await createOnboarding();
    const { base } = await start({ onboarding });
    await writeFile(join(dir, 'huis-van-iemand-anders.json'), '{"eigen":"werk"}', 'utf-8');

    await fetch(`${base}/api/onboarding`);
    const res = await fetch(`${base}/api/onboarding`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ antwoorden: {} }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('staat al een configuratie');

    // En er is niets bijgekomen.
    expect((await readdir(dir)).sort()).toEqual(['huis-van-iemand-anders.json']);
  });

  it('zegt in het voorstel al welke configuraties er staan', async () => {
    const { onboarding, dir } = await createOnboarding();
    const { base } = await start({ onboarding });
    await writeFile(join(dir, 'al-ingesteld.json'), '{}', 'utf-8');

    const body = (await (await fetch(`${base}/api/onboarding`)).json()) as {
      bestaande: string[];
    };
    expect(body.bestaande).toEqual(['al-ingesteld.json']);
  });

  it('weigert een verzoek dat geen antwoorden bevat', async () => {
    const { onboarding } = await createOnboarding();
    const { base } = await start({ onboarding });
    for (const body of ['geen json', '{"iets":1}', '[]']) {
      const res = await fetch(`${base}/api/onboarding`, { method: 'POST', headers: JSON_HEADERS, body });
      expect(res.status, body).toBe(400);
    }
  });

  it('zegt dat er nog niets is ingesteld in plaats van te doen alsof', async () => {
    const { base } = await start({ withoutConfig: true });
    const res = await fetch(`${base}/api/site`);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('nog geen installatie');
  });
});

describe('gevoel en toelichting, de tweede deur (besluit 84)', () => {
  async function feedbackDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-gevoel-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    return dir;
  }

  it('bestaat niet wanneer hij niet is meegegeven', async () => {
    const { base } = await start({});
    const res = await fetch(`${base}/api/gevoel`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ zoneId: 'woonkamer', gevoel: 'goed' }),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
  });

  it('legt een gevoel vast en geeft het terug', async () => {
    const dir = await feedbackDir();
    const feedback = new FeedbackLog({ logDir: dir, zoneIds: exampleSite.zones.map((z) => z.id) });
    const { base } = await start({ feedback });

    const res = await fetch(`${base}/api/gevoel`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ zoneId: 'woonkamer', gevoel: 'te_warm' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ zoneId: 'woonkamer', gevoel: 'te_warm' });

    const list = (await (await fetch(`${base}/api/gevoel`)).json()) as { gevoel?: string }[];
    expect(list.map((r) => r.gevoel)).toEqual(['te_warm']);
    expect(await readFile(join(dir, 'gevoel.ndjson'), 'utf-8')).toContain('"te_warm"');
  });

  it('weigert wat niet in de lijst staat, met een reden', async () => {
    const dir = await feedbackDir();
    const feedback = new FeedbackLog({ logDir: dir, zoneIds: ['woonkamer'] });
    const { base } = await start({ feedback });
    for (const body of [
      { zoneId: 'kelder', gevoel: 'goed' },
      { zoneId: 'woonkamer', gevoel: 'heerlijk' },
      { zoneId: 'woonkamer', toelichting: '<script>' },
      { zoneId: 'woonkamer', gevoel: 'goed', toelichting: 'koken' },
      { zoneId: 'woonkamer' },
    ]) {
      const res = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('houdt de muur overeind voor elke andere route en methode', async () => {
    const dir = await feedbackDir();
    const feedback = new FeedbackLog({ logDir: dir, zoneIds: ['woonkamer'] });
    const { base } = await start({ feedback });
    for (const path of ['/api/state', '/api/site', '/api/onboarding', '/']) {
      const res = await fetch(`${base}${path}`, { method: 'POST' });
      expect(res.status, path).toBe(405);
    }
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base}/api/gevoel`, { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('GET, HEAD, POST');
    }
  });
});

describe('de assistent die uitlegt (ONTWERP §7, fase 1)', () => {
  it('beantwoordt een vaste vraag uit het laatste besluit', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const res = await fetch(`${base}/api/vraag?v=waarom&kamer=zolder`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vraag: string; kamer: string; antwoord: string };
    expect(body.vraag).toBe('waarom');
    expect(body.kamer).toBe('zolder');
    expect(body.antwoord).toContain('24,5°');
    expect(body.antwoord).toContain('Ik kijk nog alleen mee');
  });

  it('spreekt Engels als dat gevraagd wordt', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const body = (await (await fetch(`${base}/api/vraag?v=nu&taal=en`)).json()) as { antwoord: string };
    expect(body.antwoord).toContain('I am only watching');
  });

  it('weigert een vraag die hij niet kent, met een reden', async () => {
    const { base } = await start({ latest: () => snapshot() });
    for (const q of ['', 'v=hoi', 'v=waarom', 'v=doe&kamer=zolder', 'v=nu&taal=fr']) {
      const res = await fetch(`${base}/api/vraag?${q}`);
      expect(res.status, q).toBe(400);
      expect(((await res.json()) as { fout: string }).fout, q).not.toBe('');
    }
  });

  it('schakelt niets, ook niet bij een opdracht', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const res = await fetch(`${base}/api/vraag?v=doe&kamer=zolder&wens=koelen&temperatuur=21`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { antwoord: string }).antwoord).toContain('mag nog niet schakelen');
    const post = await fetch(`${base}/api/vraag?v=doe&kamer=zolder&wens=koelen`, { method: 'POST' });
    expect(post.status).toBe(405);
  });
});

describe('de zoninval (besluit 93)', () => {
  it('wacht op de ligging van het huis in plaats van te gokken', async () => {
    const { base } = await start({ latest: () => snapshot(), location: null });
    const res = await fetch(`${base}/api/zon`);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { wachten: string }).wachten).toContain('Home Assistant');
  });

  it('zegt waar de zon staat, op welke gevel hij valt en wat de panelen bij een heldere lucht leveren', async () => {
    const { base } = await start({ latest: () => snapshot(), location: { latDeg: 52.1, lonDeg: 5.1 } });
    const res = await fetch(`${base}/api/zon`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      zon: { boven: boolean };
      gevels: { id: string; inDeZon: boolean }[];
      panelen: unknown[];
      kwartieren: unknown[];
      heldereLucht: { bron: string; dagen: number; factor: number };
    };
    expect(body.gevels.map((g) => g.id)).toEqual(['voorgevel', 'achtergevel']);
    // Geleerd of geschat, en dat staat erbij (besluit 93).
    expect(['geleerd', 'geschat']).toContain(body.heldereLucht.bron);
    expect(body.heldereLucht.factor).toBeGreaterThan(0);
    expect(body.panelen).toHaveLength(2);
    expect(body.kwartieren.length).toBeGreaterThanOrEqual(92);
    // Nooit allebei in de zon: ze kijken tegenovergesteld.
    expect(body.gevels.filter((g) => g.inDeZon).length).toBeLessThanOrEqual(1);
  });
});

describe('het huis als navigatie (ONTWERP §4)', () => {
  it('wacht op de registers van Home Assistant in plaats van een leeg huis te tonen', async () => {
    const { base } = await start({ latest: () => snapshot(), house: () => null });
    expect((await fetch(`${base}/api/huis`)).status).toBe(503);
  });

  it('geeft het huis door zoals de dienst het opbouwde, en leest alleen', async () => {
    const house: HouseReport = {
      indeling: 'voorstel',
      etages: [{ id: 'bg', naam: 'Begane grond', lampenAan: 0, samenvatting: summarize([]), ruimtes: [] }],
      lampenAan: 0,
      samenvatting: summarize([]),
      zonderRuimte: [],
      lampgroepen: [],
      verborgen: [],
      onvindbaar: [],
    };
    const { base } = await start({ latest: () => snapshot(), house: () => house });
    const res = await fetch(`${base}/api/huis`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...house, lichtBedienen: false });
    expect((await fetch(`${base}/api/huis`, { method: 'POST' })).status).toBe(405);
  });
});

describe('licht bedienen (besluit 97)', () => {
  const lamp = (id: string, aan: boolean) => ({
    id,
    naam: id,
    haNaam: id,
    soort: 'licht' as const,
    stand: aan ? 'aan' : 'uit',
    aan,
    helderheidPct: null,
    positiePct: null,
    actuatorId: null,
    zone: null,
    groepen: [],
    dimbaar: true,
    kleurtemp: false,
    meting: null,
    klimaat: null,
    meetKamer: false,
  });
  const room = (id: string, apparaten: ReturnType<typeof lamp>[]) => ({
    id,
    naam: id,
    zoneId: null,
    zones: [],
    temperatuurC: null,
    vochtPct: null,
    gemetenDoor: null,
    status: null,
    lampenAan: apparaten.filter((d) => d.aan).length,
    samenvatting: summarize(apparaten),
    apparaten,
    scenes: id === 'hal' ? [{ id: 'scene.hal_avond', naam: 'Avond', actief: false }] : [],
  });
  const house: HouseReport = {
    indeling: 'eigen',
    etages: [
      { id: 'e2', naam: 'Zolder', lampenAan: 1, samenvatting: summarize([]), ruimtes: [room('zolder', [lamp('light.zolder', true)])] },
      { id: 'bg', naam: 'Beneden', lampenAan: 1, samenvatting: summarize([]), ruimtes: [room('hal', [lamp('light.hal', true), lamp('light.trap', false)])] },
    ],
    lampenAan: 2,
    samenvatting: summarize([]),
    zonderRuimte: [],
    lampgroepen: [],
    verborgen: [],
    onvindbaar: [],
  };

  async function withLights() {
    const calls: { service: string; ids: readonly string[]; data: Record<string, unknown> }[] = [];
    const lights = new LightSwitch({
      house: () => house,
      call: async (service, ids, data) => {
        calls.push({ service, ids, data });
      },
    });
    const started = await start({ latest: () => snapshot(), house: () => house, lights });
    const post = (body: unknown) => fetch(`${started.base}/api/licht`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    return { ...started, calls, post };
  }

  it('bestaat niet wanneer het niet is meegegeven', async () => {
    const { base } = await start({ latest: () => snapshot(), house: () => house });
    expect((await fetch(`${base}/api/licht`, { method: 'POST', headers: JSON_HEADERS, body: '{}' })).status).toBe(405);
  });

  it('zet een scène van een eigen ruimte aan, en weigert een andere (besluit 100)', async () => {
    const scenes: string[] = [];
    const lights = new LightSwitch({ house: () => house, call: async () => {}, callScene: async (id) => void scenes.push(id) });
    const started = await start({ house: () => house, lights });
    const post = (body: unknown) => fetch(`${started.base}/api/scene`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    expect((await post({ id: 'scene.hal_avond' })).status).toBe(200);
    expect(scenes).toEqual(['scene.hal_avond']);
    expect((await post({ id: 'scene.garage_feest' })).status).toBe(404);
    expect((await post({ id: 'light.hal' })).status).toBe(400);
    expect(scenes).toEqual(['scene.hal_avond']);
  });

  it('heeft geen scènedeur zonder scènes', async () => {
    const lights = new LightSwitch({ house: () => house, call: async () => {} });
    const started = await start({ house: () => house, lights });
    expect((await fetch(`${started.base}/api/scene`, { method: 'POST', headers: JSON_HEADERS, body: '{"id":"scene.hal_avond"}' })).status).toBe(405);
  });

  it('zet wit in kelvin binnen het bereik van de lamp, en kleur alleen op een lamp die het kan (besluit 100)', async () => {
    const calls: { ids: readonly string[]; data: Record<string, unknown> }[] = [];
    const colourHouse: HouseReport = {
      ...house,
      etages: house.etages.map((f) => ({
        ...f,
        ruimtes: f.ruimtes.map((r) => ({
          ...r,
          apparaten: r.apparaten.map((d) => (d.id === 'light.hal' ? { ...d, licht: { wit: { minK: 2200, maxK: 4000 }, kleur: false, kelvin: null, tint: null } } : d)),
        })),
      })),
    };
    const lights = new LightSwitch({ house: () => colourHouse, call: async (_s, ids, data) => void calls.push({ ids, data }) });
    const started = await start({ house: () => colourHouse, lights });
    const post = (body: unknown) => fetch(`${started.base}/api/licht`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: true, kelvin: 6500 })).status).toBe(200);
    expect(calls.at(-1)!.data).toEqual({ color_temp_kelvin: 4000 });
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: true, tint: [200, 80] })).status).toBe(400);
    expect((await post({ doel: 'kamer', id: 'hal', aan: true, tint: [200, 80] })).status).toBe(400);
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: true, kelvin: 3000, kleur: 'warm' })).status).toBe(400);
  });

  it('zet een etage, een kamer of het huis uit, met alleen de lampen die het huis toont', async () => {
    const { post, calls, base } = await withLights();
    expect((await (await fetch(`${base}/api/huis`)).json()) as { lichtBedienen: boolean }).toMatchObject({ lichtBedienen: true });
    expect(await (await post({ doel: 'etage', id: 'bg', aan: false })).json()).toEqual({ lampen: 2 });
    expect((await post({ doel: 'huis', aan: false })).status).toBe(200);
    expect((await post({ doel: 'lamp', id: 'light.zolder', aan: true, helderheidPct: 40 })).status).toBe(200);
    expect((await post({ doel: 'lamp', id: 'light.zolder', aan: true, kleur: 'warm' })).status).toBe(200);
    expect(calls).toEqual([
      { service: 'turn_off', ids: ['light.hal', 'light.trap'], data: {} },
      { service: 'turn_off', ids: ['light.zolder', 'light.hal', 'light.trap'], data: {} },
      { service: 'turn_on', ids: ['light.zolder'], data: { brightness_pct: 40 } },
      { service: 'turn_on', ids: ['light.zolder'], data: { color_temp_kelvin: 2700 } },
    ]);
  });

  it('weigert wat niet klopt, en zet nooit een hele etage of het huis aan', async () => {
    const { post, calls } = await withLights();
    expect((await post({ doel: 'huis', aan: true })).status).toBe(400);
    expect((await post({ doel: 'etage', id: 'bg', aan: true })).status).toBe(400);
    expect((await post({ doel: 'lamp', id: 'climate.beneden', aan: false })).status).toBe(404);
    expect((await post({ doel: 'kamer', id: 'kelder', aan: false })).status).toBe(404);
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: false, helderheidPct: 50 })).status).toBe(400);
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: false, kleur: 'warm' })).status).toBe(400);
    expect((await post({ doel: 'lamp', id: 'light.hal', aan: true, kleur: 'paars' })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('houdt de muur overeind voor elke andere route en methode', async () => {
    const { base } = await withLights();
    for (const path of ['/api/state', '/api/huis', '/api/indeling', '/']) {
      expect((await fetch(`${base}${path}`, { method: 'POST' })).status, path).toBe(405);
    }
    for (const method of ['PUT', 'DELETE']) {
      expect((await fetch(`${base}/api/licht`, { method })).status, method).toBe(405);
    }
  });
});

describe('de indeling (besluit 96)', () => {
  const known = { deviceIds: new Set(['nest']), zoneIds: new Set(exampleSite.zones.map((z) => z.id)) };
  const layout: Layout = {
    versie: 1,
    etages: { bg: 'Beneden' },
    kamers: [{ id: 'woonkamer', naam: 'Woonkamer', etage: 'bg', zones: [], regelzone: 'woonkamer', haGebied: null }],
    apparaten: { nest: { naam: 'Thermostaat', kamer: 'woonkamer', zone: null } },
  };

  async function withLayout() {
    const dir = await mkdtemp(join(tmpdir(), 'hems-indeling-web-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const store = new LayoutStore({ logDir: dir, known: () => known });
    return start({ latest: () => snapshot(), layout: { store, proposal: () => layout } });
  }

  it('bestaat niet wanneer hij niet is meegegeven', async () => {
    const { base } = await start({ latest: () => snapshot() });
    const res = await fetch(`${base}/api/indeling`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(layout) });
    expect(res.status).toBe(405);
  });

  it('geeft het voorstel, de vaste etages en de regelgebieden, en bewaart een indeling', async () => {
    const { base } = await withLayout();
    const before = (await (await fetch(`${base}/api/indeling`)).json()) as {
      indeling: unknown;
      voorstel: Layout;
      etages: { id: string }[];
      regelzones: { id: string }[];
    };
    expect(before.indeling).toBeNull();
    expect(before.voorstel.kamers).toHaveLength(1);
    expect(before.etages.map((e) => e.id)).toEqual(['e2', 'e1', 'bg', 'buiten']);
    expect(before.regelzones.map((z) => z.id)).toEqual(exampleSite.zones.map((z) => z.id));

    const saved = await fetch(`${base}/api/indeling`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(layout) });
    expect(saved.status).toBe(200);
    const after = (await (await fetch(`${base}/api/indeling`)).json()) as { indeling: Layout };
    expect(after.indeling.apparaten['nest']!.naam).toBe('Thermostaat');
  });

  it('weigert een indeling die niet deugt, met een reden', async () => {
    const { base } = await withLayout();
    const res = await fetch(`${base}/api/indeling`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ...layout, etages: { kelder: 'x' } }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fout: string }).fout).toContain('kelder');
  });

  it('houdt de muur overeind voor elke andere route en methode', async () => {
    const { base } = await withLayout();
    for (const path of ['/api/state', '/api/huis', '/api/gevoel', '/']) {
      expect((await fetch(`${base}${path}`, { method: 'POST' })).status, path).toBe(405);
    }
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect((await fetch(`${base}/api/indeling`, { method })).status, method).toBe(405);
    }
  });
});

describe('alleen de eigen pagina door de deuren (CSRF)', () => {
  async function withFeedback(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-csrf-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const { base } = await start({ feedback: new FeedbackLog({ logDir: dir, zoneIds: ['woonkamer'] }) });
    return base;
  }
  const body = JSON.stringify({ zoneId: 'woonkamer', gevoel: 'goed' });

  it('weigert gewone tekst: zo stuurt een vreemde website zonder iets te vragen', async () => {
    const base = await withFeedback();
    const res = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
    expect(res.status).toBe(415);
    // Zonder type stuurt fetch het ook als tekst.
    expect((await fetch(`${base}/api/gevoel`, { method: 'POST', body })).status).toBe(415);
  });

  it('weigert een verzoek van een andere herkomst, ook als JSON', async () => {
    const base = await withFeedback();
    const res = await fetch(`${base}/api/gevoel`, {
      method: 'POST',
      headers: { ...JSON_HEADERS, origin: 'https://vreemd.example' },
      body,
    });
    expect(res.status).toBe(403);
  });

  it('laat de eigen pagina door, en een verzoek zonder browser', async () => {
    const base = await withFeedback();
    const own = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: { ...JSON_HEADERS, origin: base }, body });
    expect(own.status).toBe(200);
    const script = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: JSON_HEADERS, body });
    expect(script.status).toBe(200);
  });
});

describe('bedienen vraagt een inlog via Home Assistant (besluit 99)', () => {
  /** Een nep-Home Assistant: elke code hoort bij één gebruiker. */
  function fakeLogin(user: { userId: string; naam: string; isAdmin: boolean }): HaLogin & { codes: string[] } {
    const codes: string[] = [];
    return {
      codes,
      authorizeUrl: (origin, state) => `http://ha.local:8123/auth/authorize?client_id=${encodeURIComponent(`${origin}/`)}&state=${state}`,
      identify: async (code) => {
        codes.push(code);
        return user;
      },
    };
  }

  async function withLogin(isAdmin: boolean) {
    const dir = await mkdtemp(join(tmpdir(), 'hems-inlog-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const login = fakeLogin({ userId: 'u1', naam: 'Ricardo', isAdmin });
    const access: Access = { kind: 'sessions', store: new SessionStore({ logDir: dir }), login };
    const feedback = new FeedbackLog({ logDir: dir, zoneIds: ['woonkamer'] });
    const started = await start({ feedback, access });
    return { ...started, login, dir };
  }

  /** Loopt de inlog door zoals een browser: naar Home Assistant en terug. */
  async function logIn(base: string): Promise<string> {
    const go = await fetch(`${base}/auth/login?terug=/nieuw.html%23huis`, { redirect: 'manual' });
    expect(go.status).toBe(302);
    const state = new URL(go.headers.get('location')!).searchParams.get('state')!;
    const back = await fetch(`${base}/auth/callback?code=abc&state=${state}`, { redirect: 'manual' });
    expect(back.status).toBe(302);
    expect(back.headers.get('location')).toBe('/nieuw.html#huis');
    const cookie = back.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    return cookie.split(';')[0]!;
  }

  const gevoel = JSON.stringify({ zoneId: 'woonkamer', gevoel: 'goed' });

  it('weigert een deur zonder inlog, en wijst de weg naar binnen', async () => {
    const { base } = await withLogin(false);
    const res = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: JSON_HEADERS, body: gevoel });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ inlog: '/auth/login' });
    // Kijken blijft open.
    expect((await fetch(`${base}/api/gevoel`)).status).toBe(200);
  });

  it('laat een bewoner na het inloggen door, en zegt wie hij is', async () => {
    const { base, login, dir } = await withLogin(false);
    const cookie = await logIn(base);
    expect(login.codes).toEqual(['abc']);
    const res = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: { ...JSON_HEADERS, cookie }, body: gevoel });
    expect(res.status).toBe(200);
    const me = (await (await fetch(`${base}/api/sessie`, { headers: { cookie } })).json()) as { ingelogd: boolean; naam: string; rol: string };
    expect(me).toMatchObject({ ingelogd: true, naam: 'Ricardo', rol: 'bewoner' });
    // In het bestand staat de sessie zelf niet, alleen een vingerafdruk.
    const saved = await readFile(join(dir, 'sessies.json'), 'utf-8');
    expect(saved).not.toContain(cookie.split('=')[1]!);
  });

  it('houdt de indeling voor de beheerder', async () => {
    const { base } = await withLogin(false);
    const cookie = await logIn(base);
    // Zonder indeling-deur in deze opstelling is het de muur; met de deur zou een bewoner 403 krijgen.
    const { DOOR_ROLES } = await import('../src/web/auth.js');
    expect(DOOR_ROLES['/api/indeling']).toBe('beheerder');
    expect(DOOR_ROLES['/api/licht']).toBe('bewoner');
    expect((await fetch(`${base}/api/indeling`, { method: 'POST', headers: { ...JSON_HEADERS, cookie }, body: '{}' })).status).toBe(405);
  });

  it('weigert een terugkeer die niet van hier komt, en een terugweg naar een andere site', async () => {
    const { base } = await withLogin(false);
    const bad = await fetch(`${base}/auth/callback?code=abc&state=verzonnen`, { redirect: 'manual' });
    expect(bad.status).toBe(400);
    const go = await fetch(`${base}/auth/login?terug=//vreemd.example/x`, { redirect: 'manual' });
    const state = new URL(go.headers.get('location')!).searchParams.get('state')!;
    const back = await fetch(`${base}/auth/callback?code=abc&state=${state}`, { redirect: 'manual' });
    expect(back.headers.get('location')).toBe('/nieuw.html');
  });

  it('logt uit: daarna is de sessie weg', async () => {
    const { base } = await withLogin(false);
    const cookie = await logIn(base);
    const out = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { ...JSON_HEADERS, cookie, origin: base }, body: '{}' });
    expect(out.status).toBe(200);
    const res = await fetch(`${base}/api/gevoel`, { method: 'POST', headers: { ...JSON_HEADERS, cookie }, body: gevoel });
    expect(res.status).toBe(401);
  });

  it('antwoordt niet op een onbekende hostnaam (DNS-rebinding)', async () => {
    const { base } = await withLogin(false);
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolveStatus, reject) => {
      const u = new URL(`${base}/api/state`);
      const r = request({ host: u.hostname, port: u.port, path: u.pathname, headers: { host: 'nas.vreemd.example' } }, (res) => {
        res.resume();
        resolveStatus(res.statusCode ?? 0);
      });
      r.on('error', reject);
      r.end();
    });
    expect(status).toBe(421);
  });
});
