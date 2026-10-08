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

import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest';
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
import { onUsablePort } from './ports.js';
import { exampleSite } from './site.js';

const ENABLED = process.env['HEMS_PAGE_TEST'] === '1';
const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/replay-2026-08-26.ndjson.gz', import.meta.url));
const TRACES = fileURLToPath(new URL('../test-results', import.meta.url));

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

/**
 * Hoe het scherm eruitziet, voor zover een test dat kan zeggen.
 *
 * De rest van deze test vraagt wat de pagina doet. Op 7 oktober lag er een
 * lampicoon zo breed als het dak over de tekst van de zolder, en dat kwam door
 * elke stap heen: de knop werkte gewoon. Daarom hier drie dingen die voor elk
 * scherm gelden:
 *
 * - de pagina scrolt niet opzij;
 * - een icoon houdt zijn maat, en tekst past in zijn vak;
 * - tekst ligt nergens onder iets anders. Elk stuk tekst wordt in beeld
 *   geschoven, en wat de browser in het midden ervan vindt, moet die tekst
 *   zelf zijn, iets erin of iets eromheen.
 */
async function layoutProblems(p: Page): Promise<string[]> {
  return p.evaluate<string[]>(LAYOUT_CHECK);
}

/** Draait in de browser; als tekst, zodat de backend geen DOM-typen nodig heeft. */
const LAYOUT_CHECK = `(() => {
  const out = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) out.push('de pagina is ' + doc.scrollWidth + ' px breed op ' + window.innerWidth + ' px');
  const view = [...document.querySelectorAll('.view')].find((v) => !v.hidden) || document.body;
  for (const svg of view.querySelectorAll('svg.icoon')) {
    const r = svg.getBoundingClientRect();
    if (r.width > 48 || r.height > 48) out.push('een icoon van ' + Math.round(r.width) + ' x ' + Math.round(r.height) + ' px in ' + (svg.parentElement ? svg.parentElement.className : '?'));
  }
  const nav = document.querySelector('.bottomnav');
  const navTop = nav && nav.offsetParent ? nav.getBoundingClientRect().top : window.innerHeight;
  const scrollY = window.scrollY;
  for (const el of view.querySelectorAll('*')) {
    // Alleen wat zelf tekst draagt, en zichtbaar is.
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim() !== '');
    if (!own || el.closest('[hidden]') || el.closest('svg')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // Tekst die over de rand van zijn eigen vak loopt, zoals een woord in een te smalle knop.
    if (style.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push('"' + (el.textContent || '').trim().slice(0, 30) + '" past niet: ' + el.scrollWidth + ' px in ' + el.clientWidth + ' px');
    }
    const x = r.left + r.width / 2;
    const y = r.top + Math.min(r.height / 2, 10);
    if (y >= navTop || y < 0 || x < 0 || x > window.innerWidth) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit == null || el.contains(hit) || hit.contains(el)) continue;
    const owner = hit.closest('svg') || hit;
    const cls = String(owner.getAttribute('class') || '').split(' ')[0];
    out.push('"' + (el.textContent || '').trim().slice(0, 30) + '" ligt onder ' + owner.tagName.toLowerCase() + (cls ? '.' + cls : ''));
  }
  window.scrollTo(0, scrollY);
  return out;
})()`;

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
          house: () => buildHouse(exampleSite, houseRegisters, houseStates, live, layoutStore.current),
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
          version: { commit: 'bbbbbbb', gebouwd: '2026-09-30T12:00:00Z' },
          // De camera (besluit 106): een nagemaakte Home Assistant die een plaatje geeft.
          camera: { base: `http://127.0.0.1:${haCameraPort}`, token: 'test', ids: () => new Set(['camera.camera_oprit_vloeiend']) },
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
   * De testversie van de bewonersapp (besluit 71): dezelfde gegevens, en de
   * indeling volgt de stand van het scherm. Portret krijgt het menu onderin,
   * landschap de balk links en drie kolommen.
   */
  for (const [stand, viewport, menu] of [
    ['portret', { width: 390, height: 844 }, '.bottomnav'],
    ['landschap', { width: 1280, height: 800 }, '.rail'],
  ] as const) {
    it(`toont de nieuwe weergave in ${stand}`, async () => {
      const context = await browser.newContext({ viewport, timezoneId: 'UTC', locale: 'nl-NL' });
      await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
      // De pagina haalt niets van buiten, ook de lettertypen niet: die staan in de
      // dienst zelf. Wat toch naar buiten wil, wordt tegengehouden en onthouden.
      const outside: string[] = [];
      await context.route(
        (url) => !url.href.startsWith(baseUrl),
        (route) => {
          outside.push(route.request().url());
          return route.abort();
        },
      );
      // Alleen bij een fout bewaard: zo is te zien wat de pagina deed, ook in de CI.
      await context.tracing.start({ screenshots: true, snapshots: true });
      onTestFailed(async () => {
        await context.tracing.stop({ path: join(TRACES, `weergave-${stand}.zip`) });
      });
      const p = await context.newPage();
      // Een stap die niet lukt, faalt met zijn eigen melding, ruim voor de 30 s van de test.
      p.setDefaultTimeout(10_000);
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(String(e)));
      await p.goto(`${baseUrl}/nieuw.html`);
      await p.locator('#h-titel').filter({ hasNotText: 'Even laden' }).waitFor();

      expect(errors).toEqual([]);
      expect(await p.locator('#h-rooms').textContent()).toContain('Woonkamer');
      expect(await p.locator('#huis svg').getAttribute('aria-label')).toContain('Woonkamer');
      expect(await p.locator(menu).isVisible()).toBe(true);
      // Het dagoverzicht komt uit /api/vandaag; ook een dag zonder zon toont de kaart.
      await p.locator('#h-vandaag').waitFor({ state: 'visible' });
      expect(await p.locator('#v-grafiek svg').count()).toBe(1);
      expect(await p.locator(stand === 'portret' ? '.rail' : '.bottomnav').isVisible()).toBe(false);
      expect(await layoutProblems(p), `Thuis in ${stand}`).toEqual([]);
      // De controle zelf: een blok over de kop moet hij zien.
      // Vlak na de kop en er met een negatieve marge overheen, zodat hij meeschuift
      // met de kolom die scrolt (liggend scrolt niet het venster).
      await p.evaluate(`(() => {
        const t = document.querySelector('#h-titel');
        const r = t.getBoundingClientRect();
        const b = document.createElement('div');
        b.id = 'proefblok';
        Object.assign(b.style, { position: 'relative', zIndex: 50, background: 'red', width: r.width + 'px', height: r.height + 40 + 'px', marginTop: -(r.height + 20) + 'px' });
        t.after(b);
      })()`);
      expect((await layoutProblems(p)).join(' ')).toContain('ligt onder div');
      await p.evaluate(`document.querySelector('#proefblok').remove()`);

      // Gevoel vastleggen (besluit 84): de enige knop die iets bewaart.
      await p.locator('#h-gevoel').waitFor({ state: 'visible' });
      await p.locator('#g-voel button', { hasText: 'Te warm' }).click();
      await p.locator('#g-status').filter({ hasText: 'te warm' }).waitFor();

      // Op de doorsnede een verdieping aantikken gaat meteen naar die etage, met terug naar Thuis.
      await p.locator('#huis svg a.verdieping-link[href="#huis/etagevan/woonkamer"]').click();
      await p.locator('#hu-lijst .plattegrond').waitFor();
      expect(await p.locator('#hu-terug').textContent()).toBe('‹ Thuis');
      expect(await p.locator('#hu-terug').getAttribute('href')).toBe('#thuis');

      // De assistent die uitlegt (ONTWERP §7, fase 1): een vaste vraag, het antwoord uit de dienst.
      await p.goto(`${baseUrl}/nieuw.html#assistent`);
      await p.locator('#a-vragen button', { hasText: 'Wat doe je nu?' }).click();
      await p.locator('#a-gesprek .bel.hij').filter({ hasText: 'Ik kijk nog alleen mee' }).waitFor();

      // Het huis als navigatie (ONTWERP §4): inzoomen tot een apparaat. Licht schakelt
      // (besluit 97); klimaat zegt wat er zou gebeuren.
      await p.goto(`${baseUrl}/nieuw.html#huis`);
      // Wat nergens hangt, staat erbij, tot het indelen hieronder het een kamer gaf.
      if (stand === 'portret') await p.locator('#hu-lijst .note').filter({ hasText: 'in geen kamer' }).waitFor();
      expect(await layoutProblems(p), `het huis in ${stand}`).toEqual([]);
      // Op de plek, niet op de naam: het indelen hieronder hernoemt de etage.
      await p.locator('#hu-lijst a.room[href="#huis/etage/bg"]').click();
      await p.locator('#hu-titel').filter({ hasNotText: 'Het huis' }).waitFor();
      expect(await layoutProblems(p), `de begane grond in ${stand}`).toEqual([]);
      // Alles uit op de etage: alleen de lampen die het huis daar toont.
      lightCalls.length = 0;
      await p.locator('#hu-lijst button', { hasText: 'Alle lampen uit' }).click();
      await p.locator('#hu-lijst .knoppen span').filter({ hasText: 'Gaat uit' }).waitFor();
      expect(lightCalls).toHaveLength(1);
      expect(lightCalls[0]).toMatch(/^turn_off light\./);
      expect(lightCalls[0]).not.toContain('etage2_alles');
      // Op de etage (ONTWERP §4): chips met wat er aan staat, de plattegrond met de apparaten
      // in hun kamer, en per kamer de lampen met een schakelaar.
      expect(await p.locator('#hu-chips').textContent()).toContain('lampen aan');
      expect(await p.locator('#hu-lijst .plattegrond .plan-kamer', { hasText: 'Woonkamer' }).locator('.plan-apparaat').count()).toBeGreaterThan(3);
      await p.locator('#hu-lijst .apparaatrij', { hasText: 'Sfeerverlichting' }).locator('[role="switch"]').click();
      await p.locator('#hu-lijst .apparaatrij', { hasText: 'Sfeerverlichting' }).filter({ hasText: 'gaat uit' }).waitFor();
      expect(lightCalls.at(-1)).toBe('turn_off light.sfeerverlichting');
      await p.locator('#hu-lijst a.room', { hasText: 'Woonkamer' }).click();
      await p.locator('#hu-titel').filter({ hasText: 'Woonkamer' }).waitFor();
      expect(await layoutProblems(p), `de woonkamer in ${stand}`).toEqual([]);
      // In de kamer: het blad van de plafonnière. Hij brandt, dus de schakelaar zet hem uit; warm wit weer aan.
      await p.locator('#hu-lijst .tegel', { hasText: 'Plafonnière' }).click();
      await p.locator('#hu-blad [role="switch"]').click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'gaat uit' }).waitFor();
      expect(lightCalls.at(-1)).toBe('turn_off light.woonkamer_plafonniere');
      // Na een lamp ververst het huis zich even later; dat mag het antwoord op de
      // volgende knop niet wissen (de CI ving dat, 7 oktober).
      const refreshed = p.waitForResponse((r) => new URL(r.url()).pathname === '/api/huis');
      // De plafonnière kan alleen wit: geen tab Kleur (besluit 100).
      expect(await p.locator('#hu-blad-extra .seg').count()).toBe(0);
      await p.locator('#hu-blad-extra').getByRole('button', { name: 'Warm', exact: true }).click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'warm wit' }).waitFor();
      expect(lightCalls.at(-1)).toBe('turn_on light.woonkamer_plafonniere');
      expect(lightData.at(-1)).toEqual({ color_temp_kelvin: 2700 });
      await p.locator('#hu-lijst .tegel', { hasText: 'Airco woonkamer' }).click();
      await p.locator('#hu-blad-knoppen button', { hasText: 'Koelen' }).click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'mag nog niet schakelen' }).waitFor();
      await refreshed;
      await p.waitForTimeout(100);
      expect(await p.locator('#hu-blad-zin').textContent()).toContain('mag nog niet schakelen');
      // De Nest kan alleen verwarmen: geen knop om te koelen, wel wat hij meet en kan.
      await p.locator('#hu-lijst .tegel', { hasText: 'Nest (beneden)' }).click();
      await p.locator('#hu-blad-knoppen button', { hasText: 'Verwarmen' }).waitFor();
      expect(await p.locator('#hu-blad-knoppen button', { hasText: 'Koelen' }).count()).toBe(0);
      expect(await p.locator('#hu-blad-extra').textContent()).toContain('Kan verwarmen.');
      // Wit, kleur en scènes (besluit 100): de sfeerverlichting staat in oranje,
      // dus de tab Kleur staat open met oranje gekozen.
      await p.locator('#hu-lijst .tegel', { hasText: 'Sfeerverlichting' }).click();
      await p.locator('#hu-blad-extra .seg button[aria-pressed="true"]', { hasText: 'Kleur' }).waitFor();
      expect(await p.locator('#hu-blad-extra .stalen button[aria-pressed="true"]').getAttribute('aria-label')).toBe('oranje');
      expect(await layoutProblems(p), `een kleurenlamp in ${stand}`).toEqual([]);
      // Het kleurenwiel: rechts aan de rand is rood en vol; indrukken en loslaten zet hem.
      const wheel = p.locator('#hu-blad-extra .kleurwiel');
      // Meten en klikken samen opnieuw: het huis ververst het blad, en een losgekoppeld
      // wiel meet 0 breed, waarna de klik op de hoek buiten de cirkel zou vallen.
      for (let tries = 0; ; tries++) {
        const size = await wheel.evaluate((e) => (e.isConnected ? e.clientWidth : 0));
        const clicked = size > 0 && (await wheel.click({ position: { x: size * 0.95, y: size / 2 }, timeout: 1000 }).then(() => true, () => false));
        if (clicked) break;
        if (tries === 10) throw new Error('het kleurenwiel bleef onklikbaar');
      }
      await p.locator('#hu-blad-zin').filter({ hasText: 'in de gekozen kleur' }).waitFor();
      expect(lightData.at(-1)).toEqual({ hs_color: [0, 90] });
      await p.locator('#hu-blad-extra .stalen button[aria-label="blauw"]').click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'Sfeerverlichting blauw' }).waitFor();
      expect(lightData.at(-1)).toEqual({ hs_color: [220, 75] });
      // Het huis ververst even later; het antwoord en de open tab blijven staan.
      await p.waitForResponse((r) => new URL(r.url()).pathname === '/api/huis');
      await p.waitForTimeout(100);
      expect(await p.locator('#hu-blad-zin').textContent()).toContain('Sfeerverlichting blauw');
      await p.locator('#hu-blad-extra .seg button[aria-pressed="true"]', { hasText: 'Kleur' }).waitFor();
      await p.locator('#hu-blad-extra .seg button', { hasText: 'Wit' }).click();
      await p.locator('#hu-blad-extra').getByRole('button', { name: 'Daglicht', exact: true }).click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'daglicht' }).waitFor();
      expect(lightData.at(-1)).toEqual({ color_temp_kelvin: 6500 });
      // De scènes van de woonkamer; de laatst gekozen staat aan.
      // Per Hue-groep, met de laatst gebruikte bovenaan en actief per groep.
      expect(await p.locator('#hu-blad .scenes button[aria-pressed="true"]').allTextContents()).toEqual(['Ontspannen', 'Lezen']);
      expect(await p.locator('#hu-blad .scenebox').textContent()).toContain('Keuken');
      await p.locator('#hu-blad .scenes button', { hasText: 'Lezen' }).click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'Scène Lezen' }).waitFor();
      expect(sceneCalls.at(-1)).toBe('scene.keuken_lezen');
      // Terug is uitzoomen.
      await p.locator('#hu-terug').click();
      await p.locator('#hu-titel').filter({ hasNotText: 'Woonkamer' }).waitFor();
      expect(p.url()).toContain('#huis/etage/bg');

      // Indelen (besluit 96): het voorstel uit Home Assistant aanpassen. Eén keer,
      // in de eerste stand: daarna is de indeling eigen.
      if (stand === 'portret') {
        await p.goto(`${baseUrl}/nieuw.html#huis`);
        await p.locator('#hu-lijst button', { hasText: 'Indeling bewerken' }).click();
        // Een huis dat laat binnenkomt, terwijl je typt, wist het veld niet (de
        // CI ving dat, 7 oktober): hier komt het expres pas na het typen.
        let release = () => {};
        const held = new Promise<void>((r) => (release = r));
        await p.route('**/api/huis', async (route) => {
          await held;
          await route.continue();
        });
        const late = p.waitForResponse((r) => new URL(r.url()).pathname === '/api/huis');
        await p.evaluate('void loadHouse(true)');
        const etage = p.getByLabel('Naam van Begane grond');
        await etage.fill('Beneden');
        release();
        await late;
        await p.waitForTimeout(100);
        await p.unroute('**/api/huis');
        // Hetzelfde veld, nog met de cursor erin en wat je typte.
        expect(await p.evaluate('document.activeElement?.value')).toBe('Beneden');
        await etage.press('Tab');
        await p.locator('#hu-bewerk-status').filter({ hasText: 'bewaard' }).waitFor();
        // Wat nergens hing, kan uit de app, en weer terug: op een plek naar keuze of zoals het was.
        await p.locator('#hu-lijst .rij', { hasText: 'light.zwerver' }).locator('button', { hasText: 'Verbergen' }).click();
        await p.locator('#hu-lijst .groep').filter({ hasText: 'VERBORGEN (1)' }).waitFor();
        await p.getByLabel('Plek voor light.zwerver').waitFor();
        await p.locator('#hu-lijst button', { hasText: 'Weer tonen' }).click();
        await p.locator('#hu-lijst .groep').filter({ hasText: 'VERBORGEN' }).waitFor({ state: 'detached' });
        // En krijgt een kamer.
        await p.getByLabel('Kamer voor light.zwerver').selectOption({ label: 'Tuin (Buiten)' });
        // De droger (besluit 98) krijgt ook een kamer; daarvoor stond hij nergens.
        await p.getByLabel('Kamer voor Droger').selectOption({ index: 1 });
        await p.locator('#hu-lijst').filter({ hasNotText: 'NOG IN TE DELEN' }).waitFor();
        // Een kamer toevoegen op de begane grond, via de link: herladen zou de bewerkstand sluiten.
        await p.locator('#hu-lijst a[href="#huis/etage/bg"]').click();
        await p.getByLabel('Naam van een nieuwe kamer').fill('Hal en trap');
        await p.locator('#hu-lijst button', { hasText: 'Kamer toevoegen' }).click();
        await p.getByLabel('Naam van Hal en trap').waitFor();
        await p.locator('#hu-lijst button', { hasText: 'Klaar met indelen' }).click();
        await p.locator('#hu-titel').filter({ hasText: 'Beneden' }).waitFor();
        expect(await p.locator('#hu-lijst').textContent()).toContain('Hal en trap');
      }

      // Bediening: de modusbalk met vijf woorden naast elkaar.
      await p.goto(`${baseUrl}/nieuw.html#bediening`);
      await p.locator('#b-modus button').first().waitFor();
      // Wie er is ingelogd (besluit 99): de browser heeft een sessie als beheerder.
      await p.locator('#b-account').filter({ hasText: 'Ingelogd als Test' }).waitFor();
      // Ingelogd: geen knop "Inloggen" bovenin.
      expect(await p.locator('#inlog-chip').isVisible()).toBe(false);
      expect(await layoutProblems(p), `Bediening in ${stand}`).toEqual([]);
      // De zon en je aansluiting (besluit 103), via Je huis in Bediening.
      await p.locator('.b-huisvak a', { hasText: 'Zon en aansluiting' }).click();
      await p.locator('#z-inhoud h2', { hasText: 'Zonnepanelen' }).waitFor();
      // De zekering en de droger staan in de configuratie; die gaan voor.
      expect(await p.locator('#z-inhoud button[aria-pressed="true"]', { hasText: '1 × 35 A' }).isDisabled()).toBe(true);
      expect(await p.locator('#z-inhoud').textContent()).toContain('Start bij zonne-overschot. Ingesteld in de configuratie.');
      expect(await p.locator('#z-inhoud').textContent()).toContain('Snel genoeg');
      expect(await layoutProblems(p), `Zon en aansluiting in ${stand}`).toEqual([]);
      await p.locator('#z-inhoud button', { hasText: 'Beide kanten' }).click();
      // Bij beide kanten een veld per kant; een invoerveld in een kolom groeit niet in de hoogte.
      expect(await p.getByLabel('Aantal aan de voorkant').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(60);
      await p.getByLabel('Aantal aan de voorkant').fill('6');
      await p.getByLabel('Aantal aan de achterkant').fill('6');
      await p.getByLabel('Aantal aan de achterkant').press('Tab');
      await p.locator('#z-inhoud [aria-label="Vaatwasser op zon"] button', { hasText: 'Ja' }).click();
      await p.locator('#z-inhoud button', { hasText: 'Opslaan' }).click();
      await p.locator('#z-zin').filter({ hasText: 'Opgeslagen' }).waitFor();
      expect(connStore.current).toMatchObject({ panelen: { ligging: 'beide', aantal: 12, voorkant: 6, achterkant: 6 }, apparaten: [{ id: 'droger', opZon: false }, { id: 'vaatwasser', opZon: true }] });
      expect(await p.locator('#z-inhoud .note').textContent()).toContain('na de volgende herstart');
      expect(await layoutProblems(p), `Zon en aansluiting bewaard in ${stand}`).toEqual([]);

      // De terugblik op zijn eigen tabblad, met het percentage uit dezelfde bron als index.html.
      await p.goto(`${baseUrl}/nieuw.html#opbrengst`);
      // Wat Smart Climate scheelde: op de wand één zin, op de telefoon ook het percentage.
      await p.locator('#o-periode').filter({ hasText: 'kWh minder van het net' }).waitFor();
      if (stand === 'portret') {
        await p.locator('#o-hero .big').waitFor();
        expect(await p.locator('#o-hero').textContent()).toMatch(/kWh/);
      }
      // Terugkijken (besluit 102): de eerste keer de meters overnemen uit Home Assistant.
      if (stand === 'portret') {
        await p.locator('#o-terug a', { hasText: 'Meters en prijzen instellen' }).click();
        await p.locator('#e-inhoud').filter({ hasText: 'Je Energie-dashboard heeft' }).waitFor();
        expect(await layoutProblems(p), `Meters en prijzen in ${stand}`).toEqual([]);
        await p.locator('#e-inhoud button', { hasText: 'Overnemen' }).click();
        await p.locator('#e-inhoud .chip', { hasText: 'SolarEdge opgewekt' }).waitFor();
        // Apparaat erbij: eerst wat een apparaat is (de tv), de P1-meter pas onder "Andere meters".
        const groups = await p.locator('#e-inhoud select[aria-label="Apparaat erbij"] optgroup').evaluateAll((gs) => gs.map((g) => [g.getAttribute('label'), [...g.querySelectorAll('option')].map((o) => o.textContent)]));
        expect(groups).toEqual([
          ['Past hierbij', ['Tv energie']],
          ['Andere meters', ['P1 import totaal']],
        ]);
        await p.locator('#e-inhoud button', { hasText: 'Bewaren' }).click();
        await p.locator('#e-zin').filter({ hasText: 'Bewaard' }).waitFor();
        expect(energyStore.current?.zon).toEqual(['sensor.zon']);
        await p.locator('#e-inhoud a', { hasText: 'Naar Opbrengst' }).click();
      }
      await p.locator('#o-terug .o-kpi', { hasText: 'STROOM' }).waitFor();
      expect(await p.locator('#o-terug').textContent()).toContain('Je zonnepanelen');
      expect(await p.locator('#o-terug').textContent()).toContain('Airco woonkamer');
      expect(await p.locator('#o-terug svg').count()).toBeGreaterThanOrEqual(3);
      expect(await layoutProblems(p), `Opbrengst in ${stand}`).toEqual([]);
      await p.locator('#o-terug .seg button', { hasText: 'Jaar' }).click();
      await p.locator('#o-terug .o-nav b', { hasText: /^\d{4}$/ }).waitFor();
      await p.locator('#o-terug .seg button', { hasText: 'Stroom en gas' }).click();
      await p.locator('#o-terug h2', { hasText: 'Waar je energie heen ging' }).waitFor();
      expect(await layoutProblems(p), `Opbrengst per jaar in ${stand}`).toEqual([]);
      // Apparaten op zon (besluit 101): vanaf Thuis, en "klaar voor" kiezen.
      await p.goto(`${baseUrl}/nieuw.html#thuis`);
      await p.locator('#nu-lijst a', { hasText: 'Apparaten op zon' }).click();
      await p.locator('#ap-lijst .apparaat', { hasText: 'Droger' }).waitFor();
      expect(await p.locator('#ap-lijst .apparaat').textContent()).toContain('2 u 48 min');
      expect(await p.locator('#ap-lijst .apparaat').textContent()).toContain('uiterlijk om 15:00');
      expect(await layoutProblems(p), `Apparaten in ${stand}`).toEqual([]);
      await p.locator('#ap-lijst .seg button', { hasText: '18:00' }).click();
      await p.locator('#ap-lijst .apparaat').filter({ hasText: 'Genoteerd: klaar voor 18:00' }).waitFor();
      expect(Object.keys(uitstel.readyBy)).toEqual(['droger']);
      await p.locator('#ap-lijst .seg button', { hasText: 'Geen haast' }).click();
      await p.locator('#ap-lijst .apparaat').filter({ hasText: 'Geen tijd meer' }).waitFor();
      expect(uitstel.readyBy).toEqual({});

      // Zonder verbinding (besluit 82): de laatste stand, grijs, met sinds wanneer.
      await p.evaluate('showOffline(Date.now())');
      await p.locator('#offline').filter({ hasText: 'De regeling loopt gewoon door' }).waitFor();
      expect(await p.evaluate("getComputedStyle(document.querySelector('main button')).pointerEvents")).toBe('none');
      expect(await layoutProblems(p), `zonder verbinding in ${stand}`).toEqual([]);
      await p.evaluate('markOnline()');
      expect(await p.locator('#offline').isVisible()).toBe(false);

      // De eigen lettertypen zijn geladen, en er ging niets naar buiten.
      const fonts = await p.evaluate("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('\"', '')))");
      expect(fonts).toEqual(expect.arrayContaining(['Figtree', 'Bricolage Grotesque']));
      expect(outside).toEqual([]);
      await context.close();
    }, 30_000);
  }

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
    await p.locator('#wand [data-actie="kamernaam"]').waitFor();
    expect(await p.locator('#wand [data-etages] .etage').count()).toBe(4);
    // De wand scrolt niet.
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);

    // Hernoemen, en ongedaan maken.
    await p.locator('#wand [data-actie="kamernaam"]').fill('Testkamer');
    await p.locator('#wand [data-actie="kamernaam"]').press('Tab');
    await p.locator('#wand [data-status]', { hasText: 'Naam bewaard.' }).waitFor();
    expect(layoutStore.current?.kamers.find((k) => k.id === a.id)?.naam).toBe('Testkamer');
    await p.locator('#wand [data-ongedaan]').click();
    await p.locator('#wand [data-status]', { hasText: 'Teruggezet.' }).waitFor();
    expect(layoutStore.current?.kamers.find((k) => k.id === a.id)?.naam).toBe(a.naam);

    // Een apparaat uit het blad naar de andere kamer in het huis slepen.
    const rij = p.locator('#wand [data-blad] .app').first();
    const id = (await rij.getAttribute('data-app'))!;
    const van = (await rij.boundingBox())!;
    const naar = (await p.locator(`#wand .sc-tik[data-kamer="${b.id}"]`).boundingBox())!;
    await p.mouse.move(van.x + 20, van.y + van.height / 2);
    await p.mouse.down();
    await p.mouse.move(van.x - 40, van.y + 10, { steps: 4 });
    await p.mouse.move(naar.x + naar.width / 2, naar.y + naar.height / 2, { steps: 8 });
    await p.mouse.up();
    await expect.poll(() => layoutStore.current?.apparaten[id]?.kamer).toBe(b.id);
    await p.locator('#wand [data-status]', { hasText: 'staat nu in' }).waitFor();
    // Na het neerzetten staat de andere kamer open.
    expect(await p.locator('#wand [data-actie="kamernaam"]').inputValue()).toBe(b.naam);
    await p.locator('#wand [data-ongedaan]').click();
    await expect.poll(() => layoutStore.current?.apparaten[id]?.kamer ?? a.id).toBe(a.id);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  it('wijst wie niet is ingelogd bovenin de weg naar de inlog van Home Assistant (besluit 99)', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/nieuw.html#bediening`);
    await p.locator('#inlog-chip').waitFor();
    // Zonder te volgen: de dienst stuurt door naar het inlogscherm van Home Assistant.
    const go = p.waitForRequest((r) => new URL(r.url()).pathname === '/auth/login');
    await p.locator('#inlog-chip').click();
    expect(new URL((await go).url()).searchParams.get('terug')).toBe('/nieuw.html#bediening');
    await context.close();
  }, 20_000);
});
