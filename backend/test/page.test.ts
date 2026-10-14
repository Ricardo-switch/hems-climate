/**
 * De echte pagina in een echte browser (besluit 69).
 *
 * De webtests controleren wat de server stuurt; deze controleert wat een
 * browser ervan maakt. Bij het hernoemen van besluit 59 bleek hoe dun die grens
 * is: de pagina leest de sleutels van de API letterlijk (`dekking`, `versie`,
 * `versies`), en niets anders bewaakte dat beide kanten dezelfde gebruiken.
 *
 * De server draait in dit proces, met de gebouwde weergave uit `backend/web`
 * en gegevens die lijken op wat de NAS stuurt: een echt besluit van de arbiter
 * over een minuut uit de vaste replay, en een terugblik over drie dagen logboek
 * met twee versies. De browser is headless Chromium via Playwright.
 *
 * Alleen met `HEMS_PAGE_TEST=1`: de rest van de suite heeft geen browser nodig.
 * De CI zet hem aan in een eigen taak. Lokaal kan het met de Edge die er al
 * staat: `HEMS_PAGE_TEST=1 HEMS_PAGE_BROWSER=msedge npx vitest run test/page.test.ts`.
 *
 * Faalt een weergavetest, dan bewaart hij een Playwright-trace in
 * `test-results/`: elke stap met een schermafdruk, de netwerkverzoeken en de
 * console. De CI bewaart die map dan als artefact; openen kan op
 * trace.playwright.dev, of met `npx playwright show-trace`.
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

import type { LiveSnapshot } from '../src/adapters/homeassistant/shadow.js';
import { recordRun } from '../src/adapters/runs.js';
import { decide } from '../src/core/decide.js';
import { defaultStrategies } from '../src/index.js';
import { Cursor, configAt, loadHistory, snapshot } from '../src/replay/reconstruct.js';
import { DivergenceCache } from '../src/web/divergence.js';
import { FeedbackLog } from '../src/web/feedback.js';
import { WebServer } from '../src/web/server.js';
import { buildHouse, knownForLayout, proposeLayout } from '../src/web/house.js';
import { LayoutStore } from '../src/web/layout.js';
import { FunctiesStore, functiesGevonden } from '../src/web/functies.js';
import { LightSwitch } from '../src/web/lights.js';
import { UitstelStore } from '../src/web/uitstel.js';
import { WeatherLog } from '../src/web/weather.js';
import { EnergyStore, type EnergySource } from '../src/web/energy.js';
import { ConnectionStore, connectionView, type FoundAppliance, type FoundPhase } from '../src/web/aansluiting.js';

/**
 * Een Home Assistant met een Energie-dashboard (besluit 102): net, zon, gas en
 * een airco, elke dag hetzelfde, een jaar eerder 80%.
 */
const ENERGY_SOURCE: EnergySource = {
  prefs: async () => ({
    energy_sources: [
      { type: 'grid', flow_from: [{ stat_energy_from: 'sensor.afname', number_energy_price: 0.25 }], flow_to: [{ stat_energy_to: 'sensor.terug' }] },
      { type: 'solar', stat_energy_from: 'sensor.zon' },
      { type: 'gas', stat_energy_from: 'sensor.gas', number_energy_price: 1.3 },
    ],
    device_consumption: [{ stat_consumption: 'sensor.airco', name: 'Airco woonkamer' }],
  }),
  meters: async () => [
    { id: 'sensor.afname', naam: 'P1 afname', soort: 'energy', rol: 'afname' },
    { id: 'sensor.terug', naam: 'P1 teruglevering', soort: 'energy', rol: 'teruglevering' },
    { id: 'sensor.zon', naam: 'SolarEdge opgewekt', soort: 'energy', rol: 'zon' },
    { id: 'sensor.airco', naam: 'Airco woonkamer energie', soort: 'energy', rol: 'apparaat' },
    { id: 'sensor.tv', naam: 'Tv energie', soort: 'energy', rol: 'apparaat' },
    { id: 'sensor.p1_totaal', naam: 'P1 import totaal', soort: 'energy', rol: 'afname' },
    { id: 'sensor.gas', naam: 'Gasmeter', soort: 'volume', rol: 'gas' },
  ],
  changes: async (ids, startMs, endMs, period) => {
    const hourly: Record<string, (h: number) => number> = {
      'sensor.afname': (h) => (h >= 10 && h < 17 ? 0 : 0.4),
      'sensor.terug': (h) => (h >= 10 && h < 17 ? 1 : 0),
      'sensor.zon': (h) => (h >= 10 && h < 17 ? 2 : 0),
      'sensor.airco': (h) => (h === 12 || h === 13 ? 0.5 : 0),
      'sensor.gas': (h) => (h === 7 ? 0.2 : 0),
    };
    const scale = (t: number) => (new Date(t).getUTCFullYear() < 2026 ? 0.8 : 1);
    const step = period === 'hour' ? 3_600_000 : 86_400_000;
    return Object.fromEntries(
      ids.map((id) => {
        const rows = [];
        for (let t = startMs; t < endMs; t += step) {
          const h = (new Date(t).getUTCHours() + 2) % 24;
          const v = period === 'hour' ? hourly[id]!(h) : Array.from({ length: 24 }, (_, x) => hourly[id]!(x)).reduce((a, b) => a + b, 0);
          rows.push({ startMs: t, change: v * scale(t) });
        }
        return [id, rows];
      }),
    );
  },
};
import { SessionStore } from '../src/web/auth.js';
import { registers as houseRegisters, states as houseStates } from './house-fixture.js';
import { CoverSwitch } from '../src/web/covers.js';
import type { HouseBattery, HouseReport } from '../src/web/house.js';

/** Schermopdrachten die de nagemaakte Home Assistant kreeg (besluit 121). */
const coverCalls: string[] = [];
/** Batterijen die een test erbij zet (besluit 122); leeg is: wat het huis zegt. */
let extraBatterijen: HouseBattery[] = [];
const metBatterijen = (h: HouseReport): HouseReport => (extraBatterijen.length ? { ...h, batterijen: extraBatterijen } : h);
import { onUsablePort } from './ports.js';
import { exampleSite } from './site.js';

const ENABLED = process.env['HEMS_PAGE_TEST'] === '1';
const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/replay-2026-08-26.ndjson.gz', import.meta.url));

/** Een echt besluit: 26 augustus om 13:00, uit de vaste replay. */
async function liveSnapshot(): Promise<LiveSnapshot> {
  const history = await loadHistory(FIXTURE);
  const cursor = new Cursor(history);
  const t = Date.parse('2026-08-26T11:00:00Z');
  cursor.advanceTo(t);
  const config = configAt(exampleSite, cursor);
  const decision = decide({
    config,
    state: snapshot(config, cursor, t),
    strategies: defaultStrategies(),
  });
  const observed: Record<string, string> = {};
  for (const a of config.actuators) {
    const s = cursor.state(a.ref.id);
    const setpoint = cursor.attrNumber(a.ref.id, 'temperature');
    observed[a.id] = s == null ? 'onbekend' : setpoint == null ? s : `${s}@${setpoint}`;
  }
  return {
    atMs: t,
    trigger: 'hartslag',
    changed: true,
    explanation: decision.explanation,
    commands: decision.commands,
    accepted: decision.accepted,
    rejected: decision.rejected,
    observed,
    legacy: null,
  };
}

const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30'];

/** Drie dagen logboek, één record per minuut, met afwijkingen erin. */
async function writeLogs(dir: string): Promise<void> {
  for (const [d, day] of DAYS.entries()) {
    const lines: string[] = [];
    const start = Date.parse(`${day}T00:00:00Z`);
    for (let m = 0; m < 1440; m += 1) {
      const t = start + m * 60_000;
      const sunny = m > 600 && m < 900;
      const legacyOn = sunny && m % 120 < 80;
      const full = m % 10 === 0;
      lines.push(
        JSON.stringify({
          t,
          changed: full,
          mode: 'dag',
          budget: {
            availableW: sunny ? 1500 : 0,
            allocatedW: sunny ? 900 : 0,
            surplusW: sunny ? 1500 : 0,
            reclaimableW: legacyOn ? 900 : 0,
            gridPowerW: sunny ? -800 : 300 + d * 10,
          },
          zonesT: [['woonkamer', 23.5, sunny ? 'cool' : 'none', null]],
          obs: { 'ac-woonkamer': legacyOn ? 'cool@22' : 'off', 'ac-zolder': 'off' },
          buitenC: 16,
          zonW: sunny ? 1500 : 0,
          ...(full
            ? {
                accepted: sunny ? [{ actuatorId: 'ac-woonkamer', action: 'cool', strategyId: 'pv-surplus' }] : [],
                commands: [],
                rejected: [],
              }
            : {}),
        }),
      );
    }
    await writeFile(join(dir, `decisions-${day}.ndjson`), `${lines.join('\n')}\n`, 'utf-8');
  }
  // Twee versies, elk midden op een dag, zodat de markering op die rij valt.
  await recordRun(dir, { t: Date.parse('2026-09-28T12:00:00Z'), commit: 'aaaaaaa', built: null, config: 'c1', site: 'huis-cornelissen' });
  await recordRun(dir, { t: Date.parse('2026-09-30T12:00:00Z'), commit: 'bbbbbbb', built: null, config: 'c1', site: 'huis-cornelissen' });
}

describe.skipIf(!ENABLED)('de pagina in een browser (besluit 69)', () => {
  let dir: string;
  let server: WebServer;
  let browser: Browser;
  let page: Page;
  let live: LiveSnapshot;
  let baseUrl: string;
  let layoutStore: LayoutStore;
  let uitstel: UitstelStore;
  let energyStore: EnergyStore;
  let connStore: ConnectionStore;
  let functiesStore: FunctiesStore;
  const sessions = new SessionStore();
  let sessionId = '';
  let stopCamera: () => Promise<void> = async () => {};
  /** Hoeveel live-beelden de nagemaakte Home Assistant nu geeft. */
  let liveOpen = 0;
  const pageErrors: string[] = [];
  const lightCalls: string[] = [];
  const lightData: Record<string, unknown>[] = [];
  const sceneCalls: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  beforeAll(async () => {
    expect(existsSync(join(WEB_DIR, 'app.js')), 'eerst de weergave bouwen: npm run build in frontend/').toBe(true);

    dir = await mkdtemp(join(tmpdir(), 'hems-page-'));
    await writeLogs(dir);
    const review = new DivergenceCache({ logDir: dir, write: () => {}, now: () => Date.parse('2026-10-01T00:30:00Z') });
    await review.refresh();
    live = await liveSnapshot();
    // De droger staat klaar, met een programma van 2 u 48 (besluit 101).
    live = { ...live, explanation: { ...live.explanation, deferrables: [{ id: 'droger', state: 'waiting', reason: 'surplus_insufficient', durationMin: 168 }] } };
    layoutStore = new LayoutStore({ logDir: dir, known: () => knownForLayout(exampleSite, houseRegisters, houseStates) });
    uitstel = new UitstelStore({ logDir: dir, config: exampleSite, status: () => 'waiting' });
    energyStore = new EnergyStore(dir);
    // De zon en je aansluiting (besluit 103): de droger staat in de configuratie, een vaatwasser is nieuw.
    connStore = new ConnectionStore(dir);
    functiesStore = new FunctiesStore(dir);
    const connFound = {
      fasen: [{ id: 'L1', current: 'sensor.p1_meter_current_phase_1' }] as FoundPhase[],
      apparaten: [
        { id: 'droger', naam: 'Droger', soort: 'droger', remoteStart: 'binary_sensor.droger_remote', estimatedW: 700 },
        { id: 'vaatwasser', naam: 'Vaatwasser', soort: 'vaatwasser', remoteStart: 'binary_sensor.vaatwasser_remote', estimatedW: 1800 },
      ] as FoundAppliance[],
    };

    // Een nagemaakte Home Assistant voor het camerabeeld: een klein grijs plaatje,
    // en live een stroom van plaatjes zoals `camera_proxy_stream` die geeft.
    const frame = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDCooorQAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z', 'base64');
    const haCamera = createServer((req, res) => {
      if (req.url?.includes('camera_proxy_stream')) {
        liveOpen += 1;
        res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' });
        const kop = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        const tik = setInterval(() => res.write(Buffer.concat([kop, frame, Buffer.from('\r\n')])), 100);
        req.on('close', () => {
          clearInterval(tik);
          liveOpen -= 1;
        });
        return;
      }
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.end(frame);
    });
    await new Promise<void>((r) => haCamera.listen(0, '127.0.0.1', () => r()));
    const haCameraPort = (haCamera.address() as { port: number }).port;
    stopCamera = () =>
      new Promise<void>((r) => {
        haCamera.closeAllConnections();
        haCamera.close(() => r());
      });

    // Niet zomaar poort 0: Chromium weigert dezelfde poorten. Zie ports.ts.
    let port: number;
    ({ server, port } = await onUsablePort(
      async () => {
        const server = new WebServer({
          port: 0,
          host: '127.0.0.1',
          webDir: WEB_DIR,
          config: exampleSite,
          latest: () => live,
          divergence: () => review.latest,
          logDir: dir,
          feedback: new FeedbackLog({ logDir: dir, zoneIds: exampleSite.zones.map((z) => z.id) }),
          // Het kleine huis uit house-fixture, met de deur voor de indeling (besluit 96).
          house: () => metBatterijen(buildHouse(exampleSite, houseRegisters, houseStates, live, layoutStore.current)),
          layout: { store: layoutStore, proposal: () => proposeLayout(exampleSite, houseRegisters, houseStates) },
          // Licht bedienen (besluit 97), met een Home Assistant die alleen onthoudt wat er kwam.
          lights: new LightSwitch({
            house: () => buildHouse(exampleSite, houseRegisters, houseStates, live, layoutStore.current),
            call: async (service, ids, data) => {
              lightCalls.push(`${service} ${ids.join(',')}`);
              lightData.push(data);
            },
            // Scènes (besluit 100): alleen onthouden welke.
            callScene: async (id) => void sceneCalls.push(id),
          }),
          // Schermen bedienen (besluit 121): alleen onthouden wat er kwam.
          covers: new CoverSwitch({
            house: () => buildHouse(exampleSite, houseRegisters, houseStates, live, layoutStore.current),
            call: async (service, id, data) => void coverCalls.push(`${service} ${id}${data['position'] != null ? ` ${String(data['position'])}` : ''}`),
          }),
          version: { commit: 'bbbbbbb', gebouwd: '2026-09-30T12:00:00Z' },
          // De camera (besluit 106): een nagemaakte Home Assistant die een plaatje geeft.
          camera: { base: `http://127.0.0.1:${haCameraPort}`, token: 'test', ids: () => new Set(['camera.camera_oprit_vloeiend']) },
          // Camera's en de deurbel als instelling (besluit 109).
          functies: { store: functiesStore, gevonden: () => functiesGevonden(houseRegisters.entities, houseRegisters.devices, houseStates) },
          // Het weer (besluit 105): twee dagen van een nagemaakte Buienradar.
          weather: {
            forecast: () => [
              { offset: 0, maxC: null, minC: null, regenkansPct: null, zonkansPct: null, soort: 'bewolkt', tekst: 'Zwaar bewolkt' },
              { offset: 1, maxC: 17, minC: 10, regenkansPct: 90, zonkansPct: 10, soort: 'regen', tekst: 'Zwaar bewolkt en regen' },
              { offset: 2, maxC: 18, minC: 7, regenkansPct: 30, zonkansPct: 50, soort: 'half', tekst: null },
            ],
            log: new WeatherLog(dir),
          },
          uitstel,
          energy: { store: energyStore, source: ENERGY_SOURCE },
          connection: {
            store: connStore,
            found: () => connFound,
            view: () =>
              connectionView({
                base: exampleSite,
                found: connFound,
                applied: { toegevoegd: [], overgeslagen: [] },
                answersAtStart: null,
                answers: connStore.current,
                solar: { naam: 'Zonnepanelen', intervalS: 61, platform: 'solaredge_modbus_multi' },
              }),
          },
          // De inlog van besluit 99, met een nep-Home Assistant; de browser krijgt
          // hieronder een sessie als beheerder, zodat de deuren echt op slot zitten.
          access: { kind: 'sessions', store: sessions, login: { authorizeUrl: () => 'http://ha.local/', identify: async () => ({ userId: 'u', naam: 'Test', isAdmin: true }) } },
          // De ligging, zoals Home Assistant hem geeft: op één decimaal (besluit 93).
          location: () => ({ latDeg: 52.1, lonDeg: 5.1 }),
          write: () => {},
        });
        return { server, port: await server.start() };
      },
      (s) => s.port,
      (s) => s.server.stop(),
    ));
    baseUrl = `http://127.0.0.1:${port}`;
    sessionId = await sessions.create({ userId: 'u', naam: 'Test', rol: 'beheerder' });

    const channel = process.env['HEMS_PAGE_BROWSER'];
    browser = await chromium.launch(channel ? { channel } : {});
    // UTC, net als de rest van de suite in de CI: de tijdlijn en de
    // versiemarkering rekenen dan in dezelfde dagen.
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    page = await context.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('response', (r) => {
      if (r.status() >= 400) failedResponses.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    // Klaar als de laatste stap van het laden, de exportknop, er staat.
    await page.locator('#dataset-export').waitFor({ state: 'visible' });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await stopCamera();
    await server?.stop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('laadt zonder fouten', () => {
    expect(pageErrors).toEqual([]);
    // De onboarding staat buiten de add-on uit en antwoordt dan met 503. Dat
    // is de enige verwachte fout, en de browser meldt hem als laadfout.
    expect(failedResponses).toEqual(['503 /api/onboarding']);
    expect(consoleErrors.filter((t) => !t.includes('503'))).toEqual([]);
  });

  it('toont het live besluit', async () => {
    // De modus van het besluit, als woord en niet als code.
    expect((await page.locator('#modus').textContent())?.toLowerCase()).toBe(live.explanation.mode);
    expect(await page.locator('#zones').textContent()).toContain('Woonkamer');
    expect(await page.locator('#budget-net').textContent()).toMatch(/\d W/);
    expect((await page.locator('#apparaten').textContent())?.trim()).not.toBe('');
  });

  it('toont de terugblik, met de tijdlijn en de versies', async () => {
    await page.locator('#tab-terugblik').click();
    expect(await page.locator('#stat-eens').textContent()).toMatch(/%/);
    const timeline = (await page.locator('#tijdlijn').textContent()) ?? '';
    for (const day of DAYS) expect(timeline).toContain(day);
    expect(timeline).toContain('▲ aaaaaaa');
    expect(timeline).toContain('▲ bbbbbbb');
  });

  it('toont de dataset en de exportknop', async () => {
    expect(await page.locator('#dataset-export').textContent()).toContain('Exporteren · 3 dagen');
    expect(await page.locator('#dataset-pct').textContent()).toMatch(/\d+%/);
    // Het zonplafond is een cijfer over de dataset: hier, niet in de app.
    await page.locator('#dataset-zon').waitFor({ state: 'visible' });
    expect(await page.locator('#dataset-zon').textContent()).toMatch(/zonplafond (geleerd uit \d+ dagen|nog geschat) · factor \d,\d\d/);
  });

  /*
   * Zon en aansluiting in ontwerp 2 (besluiten 103 en 104): wat de configuratie
   * vastlegt gaat voor, en de antwoorden gaan door de eigen deur. De pagina haalt
   * niets van buiten, ook de lettertypen niet.
   */
  it('toont Zon en aansluiting, en bewaart de antwoorden', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    const outside: string[] = [];
    await context.route(
      (url) => !url.href.startsWith(baseUrl),
      (route) => {
        outside.push(route.request().url());
        return route.abort();
      },
    );
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/aansluiting.html`);
    const wand = p.locator('#wand');
    await wand.locator('h2', { hasText: 'Op welke kant van het dak' }).waitFor();
    // De zekering uit de configuratie staat voorgekozen, en is te wijzigen (besluit 117).
    const zekering = wand.locator('button[aria-pressed="true"]', { hasText: '1 × 35 A' });
    expect(await zekering.isDisabled()).toBe(false);
    expect(await wand.textContent()).toContain('uit de configuratie van het huis');
    await zekering.click();
    expect(await wand.textContent()).toContain('Start bij zonne-overschot. Ingesteld in de configuratie.');
    expect(await wand.textContent()).toContain('Snel genoeg');
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    await wand.locator('button', { hasText: 'Beide kanten' }).click();
    await wand.getByLabel('Aantal aan de voorkant').fill('6');
    await wand.getByLabel('Aantal aan de achterkant').fill('6');
    await wand.getByLabel('Aantal aan de achterkant').press('Tab');
    await wand.locator('[aria-label="Vaatwasser op zon"] button', { hasText: 'Ja' }).click();
    // De verwarming (besluit 122): wat het is en de aanvoertemperatuur.
    await wand.locator('[aria-label="Verwarming"] button', { hasText: 'Cv-ketel' }).click();
    await wand.locator('[data-aanvoer]').fill('60');
    await wand.locator('[data-aanvoer]').press('Tab');
    await wand.locator('[data-opslaan]').click();
    await wand.locator('[data-melding]', { hasText: 'Opgeslagen' }).waitFor();
    expect(connStore.current).toMatchObject({ verwarming: { soort: 'cv', aanvoerC: 60 }, zekering: { fasen: 1, ampere: 35 }, panelen: { ligging: 'beide', aantal: 12, voorkant: 6, achterkant: 6 }, apparaten: [{ id: 'droger', opZon: false }, { id: 'vaatwasser', opZon: true }] });
    expect(await wand.locator('.notitie').textContent()).toContain('na de volgende herstart');
    // De eigen lettertypen zijn geladen, en er ging niets naar buiten.
    const fonts = await p.evaluate("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('\"', '')))");
    expect(fonts).toEqual(expect.arrayContaining(['Figtree', 'Bricolage Grotesque']));
    expect(outside).toEqual([]);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Meters en prijzen in ontwerp 2 (besluiten 102 en 104): overnemen uit het
   * Energie-dashboard, de meters die bij een rol passen eerst, en bewaren.
   */
  it('toont Meters en prijzen, neemt de meters over en bewaart', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/meters.html`);
    const wand = p.locator('#wand');
    await wand.locator('.vraag', { hasText: 'Je Energie-dashboard heeft' }).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    await wand.locator('[data-overnemen]').click();
    await wand.locator('.meterchips button', { hasText: 'SolarEdge opgewekt' }).waitFor();
    // Apparaat erbij: eerst wat een apparaat is (de tv), de P1-meter pas onder "Andere meters".
    const groepen = await wand.locator('select[aria-label="Apparaat erbij"] optgroup').evaluateAll((gs) => gs.map((g) => [g.getAttribute('label'), [...g.querySelectorAll('option')].map((o) => o.textContent)]));
    expect(groepen).toEqual([
      ['Past hierbij', ['Tv energie']],
      ['Andere meters', ['P1 import totaal']],
    ]);
    // De prijzen zoals op een contract (besluit 110): normaal en dal, en een vaste post per jaar.
    await wand.locator('[data-kies="tarief"]', { hasText: 'Normaal en dal' }).click();
    await wand.locator('[data-prijs="stroomDal"]').waitFor();
    await wand.locator('[data-prijs="stroom"]').fill('0.27142');
    await wand.locator('[data-prijs="stroomDal"]').fill('0.269');
    await wand.locator('[data-prijs="stroomDal"]').press('Tab');
    await wand.locator('[data-vast-erbij]', { hasText: 'Vermindering energiebelasting' }).click();
    await wand.locator('[data-vast="bedrag"]').last().fill('628.96');
    await wand.locator('[data-vast="per"]').last().selectOption('jaar');
    await wand.locator('[data-opslaan]').click();
    await wand.locator('[data-melding]', { hasText: 'Bewaard' }).waitFor();
    expect(energyStore.current?.zon).toEqual(['sensor.zon']);
    expect(energyStore.current?.prijzen).toMatchObject({ stroom: 0.27142, stroomDal: 0.269, vast: [{ naam: 'Vermindering energiebelasting', bedrag: -628.96, per: 'jaar', soort: 'stroom' }] });
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Zonder verbinding (besluit 82): de laatste stand, grijs, met sinds wanneer,
   * en niets om op te drukken. Komt de verbinding terug, dan is het weg.
   */
  /*
   * Een tablet zonder de balken van het systeem is breder dan 16:10 (de Tab
   * A9+: 1280 × 728). De wand groeit dan mee in de breedte: geen lege rand.
   */
  it('vult op een breed scherm de hele breedte, zonder te scrollen', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 728 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    for (const pagina of ['thuis.html', 'kamer.html', 'opbrengst.html', 'indeling.html']) {
      await p.goto(`${baseUrl}/${pagina}`);
      await p.locator('#wand main').waitFor();
      const r = await p.evaluate<{ links: number; rechts: number; boven: number; onder: number }>("(() => { const b = document.getElementById('wand').getBoundingClientRect(); return { links: b.left, rechts: innerWidth - b.right, boven: b.top, onder: innerHeight - b.bottom }; })()");
      expect(Math.abs(r.links), `${pagina} links`).toBeLessThan(1);
      expect(Math.abs(r.rechts), `${pagina} rechts`).toBeLessThan(1);
      expect(Math.abs(r.boven), `${pagina} boven`).toBeLessThan(1);
      expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1'), `${pagina} scrolt`).toBe(true);
    }
    await context.close();
  }, 30_000);

  /* Schermen (besluit 121) en batterijen (besluit 122). */
  it('bedient een scherm vanuit Kamer, en meldt een lege batterij op Thuis', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huis = (await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport & { schermenBedienen: boolean };
    expect(huis.schermenBedienen).toBe(true);
    const kamer = huis.etages.flatMap((e) => e.ruimtes).find((r) => r.apparaten.some((d) => d.id === 'cover.screen'))!;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(kamer.id)}/cover.screen`);
    const wand = p.locator('#wand');
    await wand.locator('[data-scherm="dicht"]').click({ timeout: 10_000 });
    await expect.poll(() => coverCalls.at(-1)).toBe('close_cover cover.screen');
    await wand.locator('[data-scherm="stop"]').click();
    await expect.poll(() => coverCalls.at(-1)).toBe('stop_cover cover.screen');
    expect(await wand.textContent()).toContain('De regeling doet er niets mee');

    // Een batterij onder de 10%: een pil op Thuis, naar zijn kamer.
    extraBatterijen = [{ id: 'd-knop', naam: 'Knop bank', pct: 7, kamer: kamer.naam, kamerId: kamer.id }];
    await p.goto(`${baseUrl}/thuis.html`);
    const pil = wand.locator('[data-batterij]');
    await expect.poll(() => pil.isVisible(), { timeout: 10_000 }).toBe(true);
    expect(await pil.textContent()).toContain('Batterij bijna leeg: Knop bank, 7%');
    expect(await pil.getAttribute('href')).toBe(`kamer.html#${encodeURIComponent(kamer.id)}`);
    extraBatterijen = [];
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /* Een liggende telefoon krijgt de wand van de tablet, staand de telefoon (besluit 120). */
  it('toont op een liggende telefoon de tabletweergave, en staand de telefoon', async () => {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    for (const pagina of ['thuis.html', 'kamer.html', 'opbrengst.html']) {
      await p.goto(`${baseUrl}/${pagina}`);
      await p.locator('#wand main').waitFor();
      expect(await p.evaluate<boolean>("document.documentElement.classList.contains('tel-stand')"), pagina).toBe(false);
      expect(await p.locator('#wand').isVisible(), pagina).toBe(true);
      const r = await p.evaluate<{ links: number; rechts: number; boven: number; onder: number }>("(() => { const b = document.getElementById('wand').getBoundingClientRect(); return { links: b.left, rechts: innerWidth - b.right, boven: b.top, onder: innerHeight - b.bottom }; })()");
      // Binnen het scherm, en het vult de hoogte.
      expect(r.links, `${pagina} links`).toBeGreaterThanOrEqual(-1);
      expect(r.rechts, `${pagina} rechts`).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(r.boven), `${pagina} boven`).toBeLessThan(1);
      expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1'), `${pagina} scrolt`).toBe(true);
    }
    // Draai je hem rechtop, dan de telefoon.
    await p.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => p.evaluate<boolean>("document.documentElement.classList.contains('tel-stand')")).toBe(true);
    await context.close();
  }, 30_000);

  /*
   * Camera's en deurbel (besluit 109): het voorstel uit Home Assistant, een
   * ander beeld kiezen, en opslaan in het eigen bestand.
   */
  it('stelt de camera\u2019s en de deurbel in', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand a[href="functies.html"]').click();
    const wand = p.locator('#wand');
    await wand.locator('.regelrij', { hasText: 'Camera oprit' }).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Het voorstel: het vloeiende beeld. Nu het scherpe.
    expect(await wand.locator('[aria-label="Beeld van Camera oprit"] button[aria-pressed="true"]').textContent()).toBe('Vloeiend');
    await wand.locator('[aria-label="Beeld van Camera oprit"] button', { hasText: 'Scherp' }).click();
    // Licht: de installatie staat het toe, dus bedienen staat aan; hier op alleen kijken (besluit 111).
    expect(await wand.locator('[aria-label="Licht bedienen"] button[aria-pressed="true"]').textContent()).toBe('Bedienen in de app');
    await wand.locator('[aria-label="Licht bedienen"] button', { hasText: 'Alleen kijken' }).click();
    // Zonder deurbel in Home Assistant zegt de pagina dat.
    expect(await wand.textContent()).toContain('Geen deurbel gevonden');
    await wand.locator('[data-opslaan]').click();
    await wand.locator('[data-melding]', { hasText: 'Opgeslagen' }).waitFor();
    expect(functiesStore.current?.cameras).toEqual({ aan: true, lijst: ['camera.camera_oprit_duidelijk'] });
    expect(functiesStore.current?.licht).toEqual({ bedienen: false });
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Inrichten (besluit 114): de stappen, wat er al klaar is, en vanaf een
   * stap naar de pagina en via de balk door naar de volgende.
   */
  it('loopt door het inrichten, met een balk naar de volgende stap', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand a[href="inrichten.html"]').click();
    const wand = p.locator('#wand');
    await wand.locator('.stapknop').first().waitFor();
    expect(await wand.locator('.stapknop').count()).toBe(7);
    expect(await wand.locator('[data-voortgang]').textContent()).toMatch(/van 5 stappen klaar/);
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    await wand.locator('.stapknop', { hasText: 'Zon en aansluiting' }).click();
    await wand.locator('[data-stapblad] h2', { hasText: 'Zon en aansluiting' }).waitFor();
    await wand.locator('[data-stapblad] a', { hasText: /Instellen|Nakijken/ }).click();
    await p.waitForURL(/aansluiting\.html\?inrichten=zon/);
    const balk = p.locator('.inrichtbalk');
    await balk.waitFor();
    expect(await balk.textContent()).toContain('Stap 4 van 7');
    await balk.locator('a', { hasText: 'Volgende stap' }).click();
    await p.waitForURL(/inrichten\.html#meters/);
    await wand.locator('[data-stapblad] h2', { hasText: 'Meters en prijzen' }).waitFor();
    // Op de telefoon: de balk op één regel, binnen het scherm.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${baseUrl}/aansluiting.html?inrichten=zon`);
    const vak = (await p.locator('.inrichtbalk').boundingBox())!;
    expect(vak.x).toBeGreaterThanOrEqual(0);
    expect(vak.x + vak.width).toBeLessThanOrEqual(390);
    expect(vak.height).toBeLessThan(64);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  it('toont zonder verbinding de laatste stand, grijs', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/thuis.html`);
    await p.locator('#wand svg.sc-huis').first().waitFor();
    await p.evaluate('app.offline(Date.now())');
    await p.locator('.geenverbinding', { hasText: 'De regeling loopt gewoon door' }).waitFor();
    expect(await p.evaluate("getComputedStyle(document.querySelector('#wand main')).pointerEvents")).toBe('none');
    await p.evaluate('app.online()');
    expect(await p.locator('.geenverbinding').count()).toBe(0);
    await context.close();
  }, 20_000);

  /*
   * Thuis in ontwerp 2 (besluit 104): het huis uit de tekenmotor van de schets,
   * met de gegevens van de dienst. De wand past altijd op het scherm, zonder
   * scrollen; de telefoon heeft dezelfde inhoud onder elkaar.
   */
  for (const [stand, viewport] of [
    ['wand', { width: 1340, height: 800 }],
    ['telefoon', { width: 390, height: 844 }],
  ] as const) {
    it(`toont Thuis van ontwerp 2 op de ${stand}`, async () => {
      const context = await browser.newContext({ viewport, timezoneId: 'UTC', locale: 'nl-NL' });
      await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
      // De rondleiding is al gezien; die heeft hieronder een eigen test.
      await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
      const p = await context.newPage();
      const fouten: string[] = [];
      p.on('pageerror', (e) => fouten.push(e.message));
      await p.goto(`${baseUrl}/thuis.html`);
      const zichtbaar = stand === 'wand' ? '#wand' : '#tel';
      await p.locator(`${zichtbaar} [data-kop]`).filter({ hasNotText: 'Even laden' }).waitFor();
      // Het huis is getekend, met de kamers uit de indeling.
      await p.locator(`${zichtbaar} svg.sc-huis`).waitFor();
      const stateNu = (await (await fetch(`${baseUrl}/api/state`)).json()) as { bewoner: { kop: { titel: string } } };
      expect(await p.locator(`${zichtbaar} [data-kop]`).textContent()).toBe(stateNu.bewoner.kop.titel);
      if (stand === 'wand') {
        expect(await p.locator('#wand .sc-kamer').count()).toBeGreaterThan(0);
        // Ook buiten is aan te tikken: de oprit en de tuin openen hun kamer.
        const tikbaar = await p.locator('#wand .sc-tik').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
        expect(tikbaar).toEqual(expect.arrayContaining(['Oprit', 'Tuin']));
        // Nooit scrollen aan de muur, en de hele wand binnen het scherm.
        expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth')).toBe(true);
        const vak = await p.locator('#wand').boundingBox();
        expect(vak && vak.x >= -1 && vak.y >= -1 && vak.x + vak.width <= viewport.width + 1 && vak.y + vak.height <= viewport.height + 1).toBe(true);
      } else {
        expect(await p.evaluate('document.scrollingElement.scrollWidth <= innerWidth')).toBe(true);
      }
      // Het weer (besluit 105): de knop met de temperatuur opent de komende dagen.
      const knop = p.locator(`${zichtbaar} [data-buiten]`);
      // Dicht tot erop getikt wordt.
      expect(await p.locator(`${zichtbaar} [data-weer]`).isVisible()).toBe(false);
      await knop.and(p.locator(':enabled')).waitFor({ timeout: 5000 });
      await knop.click();
      const blad = p.locator(`${zichtbaar} [data-weer]`);
      await blad.waitFor({ timeout: 5000 });
      expect(await blad.textContent()).toContain('Morgen');
      expect(await blad.textContent()).toContain('90% regen');
      expect(await blad.locator('.rij').count()).toBe(3);
      await p.keyboard.press('Escape');
      await blad.waitFor({ state: 'hidden', timeout: 5000 });
      // Ook dicht door ernaast te tikken, en door nog eens op de knop te tikken.
      await knop.click();
      await blad.waitFor({ timeout: 5000 });
      await p.locator(`${zichtbaar} [data-kop]`).click({ force: true });
      await blad.waitFor({ state: 'hidden', timeout: 5000 });
      await knop.click();
      await blad.waitFor({ timeout: 5000 });
      // Op de telefoon ligt het donkere vlak over de knop; een tik daar sluit het ook.
      await knop.click({ force: true });
      await blad.waitFor({ state: 'hidden', timeout: 5000 });
      expect(fouten).toEqual([]);
      await context.close();
    }, 20_000);
  }

  /*
   * Apparaten in ontwerp 2 (besluit 104; schets Wand-Apparaten): de droger die
   * klaarstaat met "klaar voor" (besluit 101), de vaatwasser die gevonden is
   * maar niet op zon staat, en waar de stroom nu heen gaat.
   */
  for (const [stand, viewport] of [
    ['wand', { width: 1340, height: 800 }],
    ['telefoon', { width: 390, height: 844 }],
  ] as const) {
    it(`toont Apparaten van ontwerp 2 op de ${stand}`, async () => {
      const context = await browser.newContext({ viewport, timezoneId: 'UTC', locale: 'nl-NL' });
      await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
      await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
      const p = await context.newPage();
      const fouten: string[] = [];
      p.on('pageerror', (e) => fouten.push(e.message));
      await p.goto(`${baseUrl}/apparaten.html`);
      const z = stand === 'wand' ? '#wand' : '#tel';
      const droger = p.locator(`${z} .app`, { hasText: 'Droger' });
      await droger.waitFor();
      await p.locator(`${z} .app`, { hasText: 'Vaatwasser' }).filter({ hasText: 'Niet op zon' }).waitFor();
      await p.locator(`${z} [data-verdeling] h2`).waitFor();
      // De navigatie wijst Apparaten aan.
      expect(await p.locator(`${stand === 'wand' ? '#balk' : '#tabs'} [aria-current="page"]`).textContent()).toBe('Apparaten');
      if (stand === 'wand') {
        expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth')).toBe(true);
        // Alles binnen de wand: de body scrolt niet, dus wat eronder valt is gewoon weg.
        const wand = await p.locator('#wand').boundingBox();
        const onder = await p.locator('#wand [data-verdeling]').boundingBox();
        expect(onder && wand && onder.y + onder.height <= wand.y + wand.height + 1).toBe(true);
      } else {
        expect(await p.evaluate('document.scrollingElement.scrollWidth <= innerWidth')).toBe(true);
      }
      // Klaar voor kiezen gaat naar de dienst, en terug naar geen haast.
      await droger.locator('.keuze button', { hasText: '18:00' }).click();
      await droger.filter({ hasText: 'Genoteerd: klaar voor 18:00.' }).waitFor();
      expect(Object.keys(uitstel.readyBy)).toEqual(['droger']);
      await droger.locator('.keuze button', { hasText: 'Geen haast' }).click();
      await droger.filter({ hasText: 'Geen haast: hij begint op zon' }).waitFor();
      expect(uitstel.readyBy).toEqual({});
      expect(fouten).toEqual([]);
      await context.close();
    }, 20_000);
  }

  /*
   * De rondleiding (schets Wand-Uitleg): de eerste keer vanzelf, drie stappen,
   * daarna niet meer vanzelf, maar wel achter "Zo werkt het huis".
   */
  it('toont de rondleiding de eerste keer, en daarna achter "Zo werkt het huis"', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/thuis.html`);
    const ballon = p.locator('#wand .ballon');
    await ballon.filter({ hasText: 'Dit is je huis' }).waitFor();
    expect(await p.locator('#wand [data-stappen] .stap').count()).toBe(3);
    await ballon.locator('[data-volgende]').click();
    await ballon.filter({ hasText: 'Tik op een kamer' }).waitFor();
    await ballon.locator('[data-volgende]').click();
    await ballon.locator('[data-volgende]', { hasText: 'Klaar' }).click();
    await ballon.waitFor({ state: 'detached' });
    // Gezien: na herladen niet vanzelf, wel met de knop.
    await p.reload();
    await p.locator('#wand [data-kop]').filter({ hasNotText: 'Even laden' }).waitFor();
    await p.waitForTimeout(900);
    expect(await ballon.count()).toBe(0);
    await p.locator('#wand [data-uitleg]').click();
    await ballon.filter({ hasText: 'Dit is je huis' }).waitFor();
    await p.keyboard.press('Escape');
    await ballon.waitFor({ state: 'detached' });
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * Vandaag in ontwerp 2 (schetsen Wand-Vandaag en Vandaag): de tijdlijn, wat
   * er gebeurde en wat er verwacht wordt, en wisselen naar gisteren en morgen.
   */
  for (const [stand, viewport] of [
    ['wand', { width: 1340, height: 800 }],
    ['telefoon', { width: 390, height: 844 }],
  ] as const) {
    it(`toont Vandaag van ontwerp 2 op de ${stand}, ook gisteren en morgen`, async () => {
      const context = await browser.newContext({ viewport, timezoneId: 'UTC', locale: 'nl-NL' });
      await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
      const p = await context.newPage();
      const fouten: string[] = [];
      p.on('pageerror', (e) => fouten.push(e.message));
      await p.goto(`${baseUrl}/vandaag.html`);
      const z = stand === 'wand' ? '#wand' : '#tel';
      if (stand === 'wand') {
        await p.locator('#wand [data-tijdlijn] svg').waitFor();
        await p.locator('#wand [data-momentkaart] h2').waitFor();
        expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
        const onder = await p.locator('#wand .kaarten').boundingBox();
        const wand = await p.locator('#wand').boundingBox();
        expect(onder && wand && onder.y + onder.height <= wand.y + wand.height + 1).toBe(true);
      } else {
        await p.locator('#tel [data-zonkaart] svg').waitFor();
      }
      await p.locator(`${z} [data-dag="gisteren"]`).click();
      await p.locator(`${z} h1`, { hasText: 'Gisteren' }).waitFor();
      await p.locator(`${z} [data-dag="morgen"]`).click();
      await p.locator(`${z} h1`, { hasText: 'Morgen' }).waitFor();
      expect(await p.locator(`${stand === 'wand' ? '#balk' : '#tabs'} [aria-current="page"]`).textContent()).toBe('Vandaag');
      expect(fouten).toEqual([]);
      await context.close();
    }, 20_000);
  }

  /*
   * Opbrengst in ontwerp 2 (schetsen Wand-Opbrengst en Opbrengst): de cijfers,
   * of de weg naar de meters, en wisselen van periode.
   */
  it('toont Opbrengst van ontwerp 2, en wisselt van periode', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/opbrengst.html`);
    await p.locator('#wand [data-titel]').filter({ hasNotText: 'Even laden' }).waitFor();
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    await p.locator('#wand [data-soort="jaar"]').click();
    await p.locator('#wand [data-soort="jaar"][aria-pressed="true"]').waitFor();
    // Vergelijken, en een tik op een staaf zegt wat erin zit.
    const vergelijk = p.locator('#wand [data-blik="vergelijk"]');
    if (await vergelijk.count()) {
      await vergelijk.click();
      await p.locator('#wand [data-blik="vergelijk"][aria-pressed="true"]').waitFor();
      await p.locator('#wand [data-staaf]').first().click();
      await p.locator('#wand .detail').filter({ hasNotText: 'Tik op een staaf' }).waitFor();
    }
    expect(await p.locator('#balk [aria-current="page"]').textContent()).toBe('Opbrengst');
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * De assistent in ontwerp 2 (schets Wand-Assistent): een vraag uit het adres
   * wordt meteen gesteld, en de knoppen stellen een volgende.
   */
  it('stelt de vraag uit het adres meteen, en een volgende met een knop', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/assistent.html#nu`);
    await p.locator('#wand .jij', { hasText: 'Wat doe je nu?' }).waitFor();
    await p.locator('#wand .antwoord').filter({ hasNotText: 'Even kijken' }).waitFor();
    await p.locator('#wand [data-vragen] button', { hasText: 'Hoeveel zon vandaag?' }).click();
    await p.locator('#wand .jij', { hasText: 'Hoeveel zon vandaag?' }).waitFor();
    await p.locator('#wand .antwoord').filter({ hasNotText: 'Even kijken' }).waitFor();
    // Geen ruwe codes bij de feiten.
    expect(await p.locator('#wand .feiten').textContent().catch(() => '')).not.toMatch(/[a-z][A-Z]|_/);
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /* Een vraag in eigen woorden (besluit 115): over de app komt er een knop bij. */
  /*
   * De inrichting van een kamer (besluit 119): elke soort, in drie breedtes,
   * met en zonder apparaten, op een gewone etage en onder het dak. De tekening
   * geeft met `controle` elk meubel en apparaat als blok; geen meubel mag door
   * een apparaat, een ander meubel, een muur of het dak.
   */
  it('richt elke soort kamer in zonder dat een meubel ergens doorheen steekt', async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/manifest.webmanifest`);
    await p.setContent(`<!doctype html><body style="margin:0;background:#0b1424"><div id="uit" style="display:grid;grid-template-columns:repeat(2,700px)"></div><script src="${baseUrl}/kit/huis.js"></script></body>`);
    await p.waitForFunction('window.huis != null');
    type Blok = { kamer?: string; wat: string; soort?: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; ruimte: [number, number]; plafond?: number };
    const uitkomst = await p.evaluate(() => {
      const w = globalThis as unknown as { huis: { svg: (m: unknown, o: unknown) => string }; document: { getElementById: (id: string) => { innerHTML: string } } };
      const soorten = ['woonkamer', 'woonkeuken', 'keuken', 'eetkamer', 'slaapkamer', 'kinderkamer', 'logeerkamer', 'badkamer', 'toilet', 'hal', 'werkkamer', 'wasruimte', 'berging', 'leeg'];
      const apparaten = [
        [],
        [{ soort: 'radiator', aan: false }, { soort: 'lamp', aan: true, x: 0.35 }],
        [{ soort: 'airco', aan: true, naam: 'a' }, { soort: 'lamp', aan: false, x: 0.35 }, { soort: 'lamp', aan: false, x: 0.72 }],
        [{ soort: 'cv', aan: true }, { soort: 'radiator', aan: true }],
      ];
      const kamer = (soort: string, i: number, gewicht: number, apps: unknown[]) => ({ id: `${soort}-${i}`, naam: soort, gewicht, inrichting: soort, temp: '20,0°', apparaten: apps });
      const per: Record<string, unknown[]> = {};
      const html: string[] = [];
      for (const soort of soorten) {
        const model = {
          tijd: 'dag',
          etages: [
            { naam: 'bg', kamers: [kamer(soort, 0, 0.55, apparaten[0]!), kamer(soort, 1, 1.0, apparaten[1]!), kamer(soort, 2, 1.4, apparaten[2]!)] },
            { naam: 'e1', kamers: [kamer(soort, 3, 1.4, apparaten[3]!), kamer(soort, 4, 0.8, [{ soort: 'droger', aan: true }])] },
            { naam: 'dak', dak: true, kamers: [kamer(soort, 5, 1, apparaten[2]!), kamer(soort, 6, 1, apparaten[1]!)] },
          ],
        };
        const svg = w.huis.svg(model, { breedte: 700, hoogte: 520, meubels: true, controle: true });
        html.push(svg);
        const desc = /<desc class="sc-controle">(.*?)<\/desc>/s.exec(svg)?.[1] ?? '[]';
        per[soort] = JSON.parse(desc.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      }
      // Eén verdieping zonder dak erboven: een hal zonder trap.
      const plat = w.huis.svg({ tijd: 'dag', zonderDak: true, etages: [{ naam: 'bg', kamers: [kamer('hal', 9, 1, [])] }] }, { breedte: 700, hoogte: 520, meubels: true, controle: true });
      const vlak = JSON.parse((/<desc class="sc-controle">(.*?)<\/desc>/s.exec(plat)?.[1] ?? '[]').replace(/&quot;/g, '"'));
      // Ingezoomd op één etage zegt de pagina zelf dat er een etage boven is.
      const los = w.huis.svg({ tijd: 'dag', zonderDak: true, etages: [{ naam: 'bg', erBoven: true, kamers: [kamer('hal', 8, 1, [])] }] }, { breedte: 700, hoogte: 520, meubels: true, controle: true });
      const metTrap = JSON.parse((/<desc class="sc-controle">(.*?)<\/desc>/s.exec(los)?.[1] ?? '[]').replace(/&quot;/g, '"'));
      w.document.getElementById('uit').innerHTML = html.map((x) => `<div style="width:700px;height:520px">${x}</div>`).join('');
      return { per, vlak, metTrap };
    });
    const overlap = (a: Blok, b: Blok, marge = 0.01) =>
      a.x0 < b.x1 - marge && b.x0 < a.x1 - marge && a.y0 < b.y1 - marge && b.y0 < a.y1 - marge && a.z0 < b.z1 - marge && b.z0 < a.z1 - marge;
    const problemen: string[] = [];
    for (const [soort, lijst] of Object.entries(uitkomst.per) as [string, Blok[]][]) {
      const meubels = lijst.filter((b) => b.wat === 'meubel');
      const apps = lijst.filter((b) => b.wat === 'apparaat');
      if (soort !== 'leeg' && meubels.length === 0) problemen.push(`${soort}: geen enkel meubel`);
      if (soort === 'leeg' && meubels.length > 0) problemen.push('leeg: toch meubels');
      for (const m of meubels) {
        const naam = `${m.kamer} (${m.x0.toFixed(2)}–${m.x1.toFixed(2)})`;
        if (m.x0 < m.ruimte[0] - 1e-6 || m.x1 > m.ruimte[1] + 1e-6) problemen.push(`${naam}: door de zijmuur`);
        if (m.y0 < -1e-6 || m.y1 > 1.5 + 1e-6) problemen.push(`${naam}: buiten de kamer`);
        if (m.plafond != null && m.z1 > m.plafond + 1e-6) problemen.push(`${naam}: door het plafond of dak`);
        for (const a of apps) {
          // Een trap mag onder een hanglamp door: die hangt in het trapgat.
          if (a.kamer !== m.kamer || (a.soort === 'lamp' && soort === 'hal')) continue;
          if (overlap(m, a)) problemen.push(`${naam}: door ${a.soort}`);
        }
        for (const n of meubels) if (n !== m && n.kamer === m.kamer && overlap(m, n) && m.x0 <= n.x0) problemen.push(`${naam}: door een ander meubel`);
      }
    }
    expect(problemen).toEqual([]);
    // Witgoed maakt een wasruimte; een hal zonder etage erboven heeft geen trap.
    expect((uitkomst.per['slaapkamer'] as Blok[]).some((b) => b.kamer === 'slaapkamer-4' && b.wat === 'meubel' && b.x1 - b.x0 > 0.5)).toBe(false);
    expect((uitkomst.vlak as Blok[]).filter((b) => b.wat === 'meubel')).toEqual([]);
    expect((uitkomst.metTrap as Blok[]).filter((b) => b.wat === 'meubel').length).toBeGreaterThan(0);
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT, fullPage: true });
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  it('beantwoordt een getypte vraag, met een knop naar de pagina', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/assistent.html#typ`);
    const veld = p.locator('#wand [data-vrij] input');
    await expect.poll(() => p.evaluate('document.activeElement?.closest("#wand [data-vrij]") != null')).toBe(true);
    await veld.fill('Waar vul ik de prijzen in?');
    await veld.press('Enter');
    await p.locator('#wand .jij', { hasText: 'Waar vul ik de prijzen in?' }).waitFor();
    const knop = p.locator('#wand .verder a', { hasText: 'Naar Meters en prijzen' });
    await knop.waitFor();
    expect(await knop.getAttribute('href')).toBe('meters.html');
    expect(await veld.inputValue()).toBe('');
    // Niets herkend: voorbeelden om op te tikken.
    await veld.fill('banaan');
    await veld.press('Enter');
    await p.locator('#wand .verder button', { hasText: 'Hoe pas ik de indeling aan?' }).click();
    await p.locator('#wand .verder a', { hasText: 'Naar Indeling' }).waitFor();
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT });
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * Instellingen en Wat je huis kan (schetsen Instellingen, Wand-Leren en
   * Wand-Huis-groeit): wie stuurt, wat het huis weet, en de stappen.
   */
  it('toont Instellingen, en daarvandaan Wat je huis kan', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand [data-stuurt] .fase').first().waitFor();
    await p.locator('#wand [data-weet] .weet').first().waitFor();
    expect(await p.locator('#balk [aria-current="page"]').getAttribute('aria-label')).toBe('Instellingen');
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    await p.locator('#wand [data-huis] a', { hasText: 'Wat je huis kan' }).click();
    await p.locator('#wand h1', { hasText: 'Wat je huis kan' }).waitFor();
    await p.locator('#wand .stap svg.sc-huis').first().waitFor();
    expect(await p.locator('#wand .stap').count()).toBe(4);
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  it('is als app te installeren: een manifest met iconen, en een service worker', async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    const m = (await res.json()) as { start_url: string; display: string; icons: { src: string; sizes: string }[] };
    expect(m).toMatchObject({ start_url: 'thuis.html', display: 'standalone' });
    for (const icoon of m.icons) expect((await fetch(`${baseUrl}/${icoon.src}`)).headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${baseUrl}/sw.js`)).status).toBe(200);
    const thuis = await (await fetch(`${baseUrl}/thuis.html`)).text();
    expect(thuis).toContain('rel="manifest"');
  });

  /*
   * Aanbellen (besluit 107): elke open pagina toont het beeld van de deurbel,
   * en sluit het weer.
   */
  it('toont het beeld van de deurbel als er wordt aangebeld', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/opbrengst.html`);
    // Bellen tot de pagina het laat zien: een kijker van een eerdere test kan
    // nog als open tellen terwijl de stroom van deze pagina er nog niet is.
    await expect
      .poll(async () => {
        server.ring('camera.camera_oprit_vloeiend', 'Camera oprit');
        return p.locator('.aanbel', { hasText: 'Er wordt aangebeld' }).count();
      }, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect.poll(() => p.evaluate<number>("document.querySelector('.aanbel img')?.naturalWidth ?? 0")).toBeGreaterThan(0);
    // Het hele beeld past in het vak, niets valt eronder weg.
    const past = await p.evaluate<boolean>("(() => { const v = document.querySelector('.aanbel-beeld').getBoundingClientRect(); const i = document.querySelector('.aanbel img').getBoundingClientRect(); return i.bottom <= v.bottom + 1 && i.right <= v.right + 1 && i.height > 0; })()");
    expect(past).toBe(true);
    await p.locator('.aanbel [data-bel-dicht]').click();
    await p.locator('.aanbel').waitFor({ state: 'detached' });
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * Kamer in ontwerp 2 (besluit 104; schetsen Wand-Kamer en Wand-Bedienen): de
   * etage met de gekozen kamer, het blad met wat erin is, en per apparaat een
   * blad. Klimaat zegt wat het huis zou doen; een lamp schakelt echt.
   */
  it('toont Kamer van ontwerp 2, met het blad van een klimaatapparaat en een lamp die schakelt', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huisNu = (await (await fetch(`${baseUrl}/api/huis`)).json()) as { etages: { ruimtes: { id: string; zoneId: string | null; apparaten: { id: string; soort: string }[] }[] }[] };
    const kamers = huisNu.etages.flatMap((e) => e.ruimtes);
    const metKlimaat = kamers.find((r) => r.zoneId && r.apparaten.some((d) => d.soort === 'klimaat'))!;
    const metLamp = kamers.find((r) => r.apparaten.some((d) => d.soort === 'licht'))!;

    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metKlimaat.id)}`);
    await p.locator('#wand [data-blad] .bladkop').waitFor();
    // Het huis met tikvlakken, en de wand zonder scrollen.
    await p.locator('#wand svg.sc-huis .sc-tik').first().waitFor();
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    // Een klimaatapparaat: het blad zegt wat het huis zou doen, en schakelt niets.
    await p.locator('#wand [data-blad] .rij[data-open]').first().click();
    await p.locator('#wand [data-blad] .doelrij').waitFor();
    await p.locator('#wand [data-blad] [data-doel="0.5"]').click();
    await p.locator('#wand [data-blad] [data-wens]').first().click();
    await p.locator('#wand [data-gezegd]').filter({ hasText: 'zou' }).waitFor();
    await p.locator('#wand [data-blad] [data-terug]').click();
    await p.locator('#wand [data-blad] .bladkop').waitFor();

    // De camera op de oprit: het beeld, want deze browser is ingelogd.
    const oprit = kamers.find((r) => r.apparaten.some((d) => d.soort === 'camera'))!;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(oprit.id)}/camera.camera_oprit_vloeiend`);
    await p.locator('#wand .camerabeeld img').waitFor();

    // In het blad van de oprit blijft het live beeld staan, ook als het huis ververst.
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(oprit.id)}`);
    await p.locator('#wand .camerabeeld[data-gestart] img').waitFor();
    await p.waitForTimeout(2500);
    expect(await p.evaluate<number>("document.querySelector('#wand .camerabeeld img')?.naturalWidth ?? 0")).toBeGreaterThan(0);
    expect(liveOpen).toBe(1);
    // Een andere kamer: het beeld stopt.
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metKlimaat.id)}`);
    await expect.poll(() => liveOpen).toBe(0);

    // Een lamp: de schakelaar gaat via de deur naar Home Assistant.
    const voor = lightCalls.length;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metLamp.id)}`);
    await p.locator('#wand [data-blad] [data-schakel]').first().click();
    await expect.poll(() => lightCalls.length).toBeGreaterThan(voor);

    // Scènes pas bij een lamp, en dan alleen die erbij horen, elke naam één keer.
    const metSfeer = kamers.find((r) => r.apparaten.some((d) => d.id === 'light.sfeerverlichting'))!;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metSfeer.id)}`);
    await p.locator('#wand [data-blad] .bladkop').waitFor();
    expect(await p.locator('#wand [data-blad] .scene').count()).toBe(0);
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metSfeer.id)}/light.sfeerverlichting`);
    await p.locator('#wand [data-blad] .scene').first().waitFor();
    const namen = await p.locator('#wand [data-blad] .scene').allTextContents();
    expect(new Set(namen).size).toBe(namen.length);
    // Een scène kiezen gaat door de deur van de scènes (besluit 100).
    const scenesVoor = sceneCalls.length;
    await p.locator('#wand [data-blad] .scene').first().click();
    await expect.poll(() => sceneCalls.length).toBeGreaterThan(scenesVoor);
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * Kamers en indeling in ontwerp 2 (besluit 104; schets Wand-Indeling): een
   * kamer kiezen en hernoemen, een apparaat naar een andere kamer slepen, en
   * alles weer ongedaan maken. Alles via de deur van de indeling (besluit 96).
   */
  it('deelt het huis in op de wand: kiezen, hernoemen, slepen en ongedaan maken', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    type Kamer = { id: string; naam: string; etage: string };
    const info = (await (await fetch(`${baseUrl}/api/indeling`)).json()) as { indeling: { kamers: Kamer[] } | null; voorstel: { kamers: Kamer[] } };
    const kamers = (info.indeling ?? info.voorstel).kamers;
    const huisNu = (await (await fetch(`${baseUrl}/api/huis`)).json()) as { etages: { ruimtes: { id: string; apparaten: { id: string }[] }[] }[] };
    const metApparaat = huisNu.etages.flatMap((e) => e.ruimtes).filter((r) => r.apparaten.length > 0);
    // Een kamer met een apparaat, en een andere kamer op dezelfde etage (niet buiten).
    const a = kamers.find((k) => k.etage !== 'buiten' && metApparaat.some((r) => r.id === k.id) && kamers.some((x) => x.etage === k.etage && x.id !== k.id && !/tuin|oprit/i.test(x.naam)))!;
    const b = kamers.find((x) => x.etage === a.etage && x.id !== a.id && !/tuin|oprit/i.test(x.naam))!;

    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(a.id)}`);
    await p.locator('#wand [data-actie="kamernaam"]').waitFor({ timeout: 10_000 });
    expect(await p.locator('#wand [data-etages] .etage[data-etage]').count()).toBe(4);
    // De wand scrolt niet.
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);

    // Hernoemen, en ongedaan maken.
    await p.locator('#wand [data-actie="kamernaam"]').fill('Testkamer');
    await p.locator('#wand [data-actie="kamernaam"]').press('Tab');
    // Wachten op wat bewaard is, niet op een melding die alweer weg kan zijn;
    // en met een eigen grens, zodat een hapering zegt waar hij zat.
    const kort = { timeout: 5000 };
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === a.id)?.naam, kort).toBe('Testkamer');
    await p.locator('#wand [data-ongedaan]').click(kort);
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === a.id)?.naam, kort).toBe(a.naam);

    // Een apparaat uit het blad naar de andere kamer in het huis slepen.
    const rij = p.locator('#wand [data-blad] .app').first();
    const id = (await rij.getAttribute('data-app'))!;
    // Na "Ongedaan maken" tekent het blad zich opnieuw: wachten tot de rij stilstaat.
    await rij.hover({ position: { x: 20, y: 10 }, ...kort });
    let van: { x: number; y: number; width: number; height: number } | null = null;
    await expect.poll(async () => (van = await rij.boundingBox()), kort).not.toBeNull();
    van = van!;
    const naar = (await p.locator(`#wand .sc-tik[data-kamer="${b.id}"]`).boundingBox())!;
    await p.mouse.down();
    await p.mouse.move(van.x - 40, van.y + 10, { steps: 4 });
    await p.mouse.move(naar.x + naar.width / 2, naar.y + naar.height / 2, { steps: 8 });
    await p.mouse.up();
    await expect.poll(() => layoutStore.current?.apparaten[id]?.kamer, kort).toBe(b.id);
    // Na het neerzetten staat de andere kamer open.
    await expect.poll(() => p.locator('#wand [data-actie="kamernaam"]').inputValue(), kort).toBe(b.naam);
    await p.locator('#wand [data-ongedaan]').click(kort);
    await expect.poll(() => layoutStore.current?.apparaten[id]?.kamer ?? a.id, kort).toBe(a.id);

    // Een etage toevoegen, verschuiven en weer weghalen (besluit 112).
    await p.locator('#wand [data-etage-erbij]').click(kort);
    await p.locator('#wand [data-etage-vast]', { hasText: 'Kelder' }).click(kort);
    await expect.poll(() => layoutStore.current?.volgorde?.at(-1), kort).toBe('kelder');
    await p.locator('#wand .etage[aria-pressed="true"]', { hasText: 'Kelder' }).waitFor(kort);
    await p.locator('#wand [data-etage-schuif="-1"]').click(kort);
    await expect.poll(() => layoutStore.current?.volgorde?.at(-2), kort).toBe('kelder');
    await p.locator('#wand [data-etage-weg]').click(kort);
    await expect.poll(() => layoutStore.current?.volgorde?.includes('kelder'), kort).toBe(false);

    // Een buitenruimte: kiezen wat het is (besluit 109).
    const tuin = (layoutStore.current?.kamers ?? kamers).find((k) => k.etage === 'buiten' && !/oprit/i.test(k.naam))!;
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(tuin.id)}`);
    await p.locator('#wand [data-buiten="soort"]', { hasText: 'Terras' }).click(kort);
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === tuin.id)?.buiten?.soort, kort).toBe('terras');
    await p.locator('#wand [data-buiten="soort"][aria-pressed="true"]', { hasText: 'Terras' }).waitFor(kort);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  it('wijst wie niet is ingelogd de weg naar de inlog van Home Assistant (besluit 99)', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/instellingen.html`);
    const inlog = p.locator('#tel [data-inlog] a', { hasText: 'Inloggen' });
    await inlog.waitFor();
    // Zonder te volgen: de dienst stuurt door naar het inlogscherm van Home Assistant.
    const go = p.waitForRequest((r) => new URL(r.url()).pathname === '/auth/login');
    await inlog.click();
    expect(new URL((await go).url()).searchParams.get('terug')).toBe('/instellingen.html');
    await context.close();
  }, 20_000);
});
