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
import { chromium, type Browser, type BrowserContextOptions, type Page } from 'playwright';

import type { LiveSnapshot } from '../src/adapters/homeassistant/shadow.js';
import { recordRun } from '../src/adapters/runs.js';
import { decide } from '../src/core/decide.js';
import { Cursor, configAt, loadHistory, snapshot } from '../src/replay/reconstruct.js';
import { DivergenceCache } from '../src/web/divergence.js';
import { MeldingenStore } from '../src/web/meldingen.js';
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
import { BewonersStore, GEEN_BEWONERS, alsScherm, bewonersView, comfortVanBewoner, gastStand, herken, leesActie, personenUit, voegToe, voerUit, type Bewoners } from '../src/web/bewoners.js';
import { registers as houseRegisters, states as houseStates } from './house-fixture.js';
import { CoverSwitch } from '../src/web/covers.js';
import type { HouseBattery, HouseReport } from '../src/web/house.js';

/** Schermopdrachten die de nagemaakte Home Assistant kreeg (besluit 121). */
const coverCalls: string[] = [];
/** Batterijen die een test erbij zet (besluit 122); leeg is: wat het huis zegt. */
let extraBatterijen: HouseBattery[] = [];
const metBatterijen = (h: HouseReport): HouseReport => (extraBatterijen.length ? { ...h, batterijen: extraBatterijen } : h);
import { onUsablePort } from './ports.js';
import { exampleSite, exampleSitePath } from './site.js';
import { readFileSync } from 'node:fs';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { VERSIE } from '../src/version.js';
import { comfortView, controleerComfort, withComfort, type Comfort } from '../src/web/comfort.js';
import type { SiteConfig } from '../src/core/model.js';

/* Comfort (besluit 130): in het geheugen, met hetzelfde schema als de dienst. */
const rauweConfig = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
let comfortNu: Comfort | null = null;
let configNu: SiteConfig = exampleSite;
const comfortDeur = {
  view: () => comfortView(configNu, comfortNu),
  save: async (body: unknown) => {
    const c = controleerComfort(body, configNu);
    if (!c.ok) return { ok: false as const, status: 400, reden: c.reden };
    const checked = parseSiteConfig(withComfort(rauweConfig, c.comfort).raw, { knownStrategies: defaultStrategies().ids });
    if (!checked.ok) return { ok: false as const, status: 400, reden: checked.problems[0]?.message ?? 'past niet' };
    comfortNu = c.comfort;
    configNu = checked.config;
    return { ok: true as const, view: comfortView(configNu, comfortNu) };
  },
};

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
  /** Bewoners (besluit 147), met een echt bestand. */
  let bewonersStore: BewonersStore;
  const startBewoners: Bewoners = alsScherm(GEEN_BEWONERS, { userId: 'u', naam: 'Test' }, Date.now());
  /** Waar het inloggen van Home Assistant staat; een test kan er een nagemaakt Home Assistant op een andere site van maken. */
  let haInlog = 'http://ha.local/';
  /** De echte fetch: hieronder krijgt elke vraag aan de testdienst de inlog mee. */
  const echteFetch = globalThis.fetch;
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
    bewonersStore = new BewonersStore(dir);
    // De testgebruiker is een scherm (besluit 147): anders vraagt elke pagina eerst "wie ben je?".
    await bewonersStore.save(startBewoners);
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
          configNow: () => configNu,
          // Wiens comfort (besluit 147): dat van wie er kijkt, of van wie er gevraagd wordt.
          comfort: { view: (wie, bewoner) => comfortVanBewoner(configNu, comfortNu, bewonersStore.current, wie, bewoner).view, save: comfortDeur.save },
          latest: () => live,
          divergence: () => review.latest,
          logDir: dir,
          feedback: new FeedbackLog({ logDir: dir, zoneIds: exampleSite.zones.map((z) => z.id) }),
          // Meldingen (besluit 136): één apparaat dat al twee uur niet reageert.
          meldingen: (() => {
            const m = new MeldingenStore({ logDir: dir });
            m.bij({ nu: Date.now(), zonderRuimte: [], volgen: [{ id: 'switch.droger', naam: 'De droger', kamer: 'Zolder', kamerId: 'zolder', onbereikbaarSindsMs: Date.now() - 2 * 3_600_000 }], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null });
            return m;
          })(),
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
          version: { nummer: VERSIE, installatie: 'server', commit: 'bbbbbbb', gebouwd: '2026-09-30T12:00:00Z' },
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
          access: { kind: 'sessions', store: sessions, login: { authorizeUrl: (_origin, state) => `${haInlog}?state=${state}`, identify: async () => ({ userId: 'u', naam: 'Test', isAdmin: true }) } },
          // Bewoners (besluit 147): dezelfde deur als de dienst, met wie er geldt uit het laatste besluit.
          bewoners: {
            view: (wie) => bewonersView(bewonersStore.current, wie, exampleSite.occupancy, (id) => houseStates.get(id), live.explanation.profile ?? null),
            actie: async (body, wie) => {
              const a = leesActie(body);
              if (a == null) return { ok: false as const, status: 400, reden: 'onbekende actie' };
              const uit = voerUit(bewonersStore.current, comfortNu, a, wie, exampleSite.occupancy, live.explanation.profile?.home ?? [], Date.now());
              if (!uit.ok) return uit;
              await bewonersStore.save(uit.bewoners);
              return { ok: true as const, view: bewonersView(uit.bewoners, wie, exampleSite.occupancy, (id) => houseStates.get(id), live.explanation.profile ?? null) };
            },
            herken: async (account) => {
              const r = herken(bewonersStore.current, account, personenUit(houseStates.values()), exampleSite.occupancy, Date.now());
              if (r.soort === 'vraag') return 'vraag' as const;
              if (r.soort !== 'bewoner' || !r.nieuw) return null;
              await bewonersStore.save(r.bewoners);
              return 'welkom' as const;
            },
            gast: (userId) => gastStand(bewonersStore.current, userId, exampleSite.occupancy, (id) => houseStates.get(id)),
          },
          sleutel: 'test-sleutel-voor-de-assistent-12345',
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
    /*
     * De hele app vraagt een inlog (besluit 147). Elk nieuw venster krijgt de
     * inlog van de beheerder, tenzij een test juist zonder wil kijken
     * (`zonderInlog: true`); en elke vraag aan de testdienst ook.
     */
    const nieuwVenster = browser.newContext.bind(browser);
    browser.newContext = (async (o?: BrowserContextOptions & { zonderInlog?: boolean }) => {
      const { zonderInlog, ...rest } = o ?? {};
      const c = await nieuwVenster(rest);
      if (!zonderInlog) await c.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
      return c;
    }) as typeof browser.newContext;
    browser.newPage = (async (o?: BrowserContextOptions & { zonderInlog?: boolean }) => {
      const c = await browser.newContext(o);
      const p = await c.newPage();
      p.on('close', () => void c.close());
      return p;
    }) as typeof browser.newPage;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const adres = input instanceof Request ? input.url : String(input);
      if (!adres.startsWith(baseUrl)) return echteFetch(input, init);
      const kop = new Headers(init?.headers);
      if (!kop.has('cookie')) kop.set('cookie', `hems_sessie=${sessionId}`);
      return echteFetch(input, { ...init, headers: kop });
    }) as typeof fetch;
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
    globalThis.fetch = echteFetch;
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
  it('toont Energie en Regeling, en bewaart meteen wat je kiest (besluit 130)', async () => {
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
    // Rechtstreeks naar het deel van Energie; de oude doorverwijzing is weg sinds besluit 142.
    await p.goto(`${baseUrl}/energie.html#panelen`);
    const wand = p.locator('#wand');
    await wand.locator('h3', { hasText: 'Op welke kant van het dak' }).waitFor();
    expect(await wand.textContent()).toContain('Snel genoeg');
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    await wand.locator('button', { hasText: 'Beide kanten' }).click();
    await wand.getByLabel('Aantal aan de voorkant').fill('6');
    await wand.getByLabel('Aantal aan de voorkant').press('Tab');
    await wand.getByLabel('Aantal aan de achterkant').fill('6');
    await wand.getByLabel('Aantal aan de achterkant').press('Tab');
    // De zekering uit de configuratie staat voorgekozen, en is te wijzigen (besluit 117).
    await wand.locator('[data-delen] .deel', { hasText: 'Aansluiting' }).click();
    await wand.locator('[data-vorm] h2', { hasText: 'Aansluiting' }).waitFor();
    const zekering = wand.locator('button[aria-pressed="true"]', { hasText: '1 × 35 A' });
    expect(await wand.textContent()).toContain('uit de configuratie van het huis');
    await zekering.click();
    // De verwarming (besluit 122): wat het is en de aanvoertemperatuur.
    await wand.locator('[data-delen] .deel', { hasText: 'Verwarming' }).click();
    await wand.locator('[data-vorm] h2', { hasText: 'Verwarming' }).waitFor();
    await wand.locator('[aria-label="Verwarming"] button', { hasText: 'Cv-ketel' }).click();
    await wand.locator('[data-aanvoer]').fill('60');
    await wand.locator('[data-aanvoer]').press('Tab');
    await expect.poll(() => connStore.current, { timeout: 5_000 }).toMatchObject({ verwarming: { soort: 'cv', aanvoerC: 60 }, zekering: { fasen: 1, ampere: 35 }, panelen: { ligging: 'beide', aantal: 12, voorkant: 6, achterkant: 6 } });
    await wand.locator('[data-bewaard]', { hasText: 'Bewaard' }).waitFor();
    // Apparaten op zon staan bij Regeling.
    await p.goto(`${baseUrl}/regeling.html#opzon`);
    await wand.locator('[aria-label="Vaatwasser op zon"] button', { hasText: 'Ja' }).click();
    expect(await wand.textContent()).toContain('Start bij zonne-overschot. Ingesteld in de configuratie.');
    await expect.poll(() => connStore.current?.apparaten, { timeout: 5_000 }).toMatchObject([{ id: 'droger', opZon: false }, { id: 'vaatwasser', opZon: true }]);
    // De verwarming bleef staan toen Regeling bewaarde.
    expect(connStore.current).toMatchObject({ verwarming: { soort: 'cv', aanvoerC: 60 } });
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
  it('toont de meters en prijzen bij Energie, neemt de meters over en bewaart', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/energie.html#meters`);
    const wand = p.locator('#wand');
    await wand.locator('.deelvraag', { hasText: 'In je Energie-dashboard staan' }).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    await wand.locator('[data-overnemen]').click();
    await wand.locator('.meterchips button', { hasText: 'SolarEdge opgewekt' }).waitFor();
    await expect.poll(() => energyStore.current?.zon, { timeout: 5_000 }).toEqual(['sensor.zon']);
    // Apparaat erbij: eerst wat een apparaat is (de tv), de P1-meter pas onder "Andere meters".
    const groepen = await wand.locator('select[aria-label="Apparaat erbij"] optgroup').evaluateAll((gs) => gs.map((g) => [g.getAttribute('label'), [...g.querySelectorAll('option')].map((o) => o.textContent)]));
    expect(groepen).toEqual([
      ['Past hierbij', ['Tv energie']],
      ['Andere meters', ['P1 import totaal']],
    ]);
    // De prijzen zoals op een contract (besluit 110): normaal en dal, en een vaste post per jaar.
    await wand.locator('[data-delen] .deel', { hasText: 'Contract en prijzen' }).click();
    await wand.locator('[data-vorm] h2', { hasText: 'Contract en prijzen' }).waitFor();
    await wand.locator('[data-kies="stroomtarief"]', { hasText: 'Normaal en dal' }).click();
    await wand.locator('[data-prijs="stroomDal"]').waitFor();
    await wand.locator('[data-prijs="stroom"]').fill('0.27142');
    await wand.locator('[data-prijs="stroom"]').press('Tab');
    await wand.locator('[data-prijs="stroomDal"]').fill('0.269');
    await wand.locator('[data-prijs="stroomDal"]').press('Tab');
    await wand.locator('[data-vast-erbij]', { hasText: 'Vermindering energiebelasting' }).click();
    await wand.locator('[data-vast="bedrag"]').last().fill('628.96');
    await wand.locator('[data-vast="bedrag"]').last().press('Tab');
    await wand.locator('[data-vast="per"]').last().selectOption('jaar');
    await expect.poll(() => energyStore.current?.prijzen, { timeout: 5_000 }).toMatchObject({ stroom: 0.27142, stroomDal: 0.269, vast: [{ naam: 'Vermindering energiebelasting', bedrag: -628.96, per: 'jaar', soort: 'stroom' }] });
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

  /* Meten met (besluit 123): een sensor aan- en weer uitzetten bij Indeling. */
  it('kiest bij Indeling met welke sensor een kamer meet', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huis = (await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport;
    const kamer = huis.etages.flatMap((e) => e.ruimtes).find((r) => r.apparaten.some((d) => d.meting?.temperatuurC != null))!;
    const bron = kamer.apparaten.find((d) => d.meting?.temperatuurC != null)!;
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(kamer.id)}`);
    const chip = p.locator(`#wand [data-meten="${bron.id}"]`);
    await chip.click({ timeout: 10_000 });
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === kamer.id)?.meten).toEqual([bron.id]);
    await p.locator(`#wand [data-meten="${bron.id}"][aria-pressed="true"]`).click({ timeout: 5000 });
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === kamer.id)?.meten ?? null).toBeNull();
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Verwarmen en koelen per kamer (besluit 132): wat er hangt toevoegen, een
   * thermostaat aanvullen met vermogen, en op zon aanzetten.
   */
  it('legt bij Indeling vast wat er in een kamer warmt, en zet het op zon', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huis = (await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport;
    // Een kamer met een regeling en een thermostaat die alleen verwarmt.
    const kamer = huis.etages.flatMap((e) => e.ruimtes).find((r) => r.zoneId && r.apparaten.some((d) => d.soort === 'klimaat' && d.actuatorId && d.klimaat?.kanVerwarmen && !d.klimaat.kanKoelen))!;
    const thermo = kamer.apparaten.find((d) => d.soort === 'klimaat' && d.actuatorId && !d.klimaat?.kanKoelen)!;
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(kamer.id)}/warmte`);
    const blad = p.locator('#wand [data-blad]');
    await blad.locator('[data-kamertab="warmte"][aria-selected="true"]').waitFor({ timeout: 10_000 });
    // De thermostaat staat er al; wat hangt eraan?
    await blad.locator(`[data-bron-nieuw="${thermo.actuatorId}"]`).click();
    await blad.locator('[data-bron-soort="vloer"]').click();
    await blad.locator('[data-bron-vloer="elektrisch"]').click();
    await blad.locator('[data-bron-soort="paneel"]').click();
    await blad.locator('[data-bron-w]').fill('1150');
    await blad.locator('[data-bron-bewaar]').click();
    const bronnen = () => layoutStore.current?.kamers.find((k) => k.id === kamer.id)?.bronnen ?? null;
    await expect.poll(bronnen).toEqual([expect.objectContaining({ soorten: ['vloer-elektrisch', 'paneel'], aan: 'thermostaat', apparaat: thermo.actuatorId, vermogenW: 1150 })]);
    // Op zon: meteen in de regeling.
    await blad.locator('[data-bron-zon]').click();
    await expect.poll(() => bronnen()?.[0]?.opZon).toBe(true);
    // Een paneel met de hand: geen vermogen, wel een idee.
    await blad.locator('[data-bron-nieuw=""]').click();
    await blad.locator('[data-bron-soort="kachel"]').click();
    await blad.locator('[data-bron-aan="hand"]').click();
    expect(await blad.locator('[data-bron-w]').count()).toBe(0);
    await blad.locator('[data-bron-bewaar]').click();
    await expect.poll(() => bronnen()?.length).toBe(2);
    await blad.locator('.bron .idee').first().waitFor();
    expect(bronnen()?.[1]).toEqual(expect.objectContaining({ soorten: ['kachel'], aan: 'hand' }));
    expect(bronnen()?.[1]?.vermogenW).toBeUndefined();
    // Weer weghalen.
    await blad.locator(`[data-bron-open="${bronnen()?.[1]?.id}"]`).click();
    await blad.locator('[data-bron-weg]').click();
    await expect.poll(() => bronnen()?.length).toBe(1);
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * De regeling per kamer (besluit 138): bij Verwarmen en koelen per apparaat
   * wat de regeling ermee doet, en bovenaan waarmee de kamer meet.
   */
  it('kiest bij Indeling per apparaat wat de regeling ermee doet', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huis = (await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport;
    // Een kamer met een airco die op zon helpt.
    const kamer = huis.etages.flatMap((e) => e.ruimtes).find((r) => r.zoneId && r.apparaten.some((d) => d.klimaat?.rol === 'zon'))!;
    const airco = kamer.apparaten.find((d) => d.klimaat?.rol === 'zon')!;
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(kamer.id)}/warmte`);
    const blad = p.locator('#wand [data-blad]');
    await blad.locator('.meetrij', { hasText: 'Meet met' }).waitFor({ timeout: 10_000 });
    expect(kamer.meetMet.length).toBeGreaterThan(0);
    const keuze = blad.locator(`[data-rol="${airco.actuatorId}"]`);
    expect(await keuze.inputValue()).toBe('zon');
    await blad.locator('.rolzin').first().waitFor();
    await keuze.selectOption('houdt');
    const rollen = () => layoutStore.current?.kamers.find((k) => k.id === kamer.id)?.rollen ?? null;
    await expect.poll(rollen).toEqual(expect.objectContaining({ [airco.actuatorId!]: 'houdt' }));
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT });
    // Terug zoals het was, voor de andere tests.
    await blad.locator(`[data-rol="${airco.actuatorId}"]`).selectOption('zon');
    await expect.poll(() => rollen()?.[airco.actuatorId!]).toBe('zon');
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Het overzicht bij Regeling: per kamer wat er regelt, met een tik naar de kamer.
    await p.goto(`${baseUrl}/regeling.html#klimaat`);
    const rij = p.locator('#wand .kamerrij', { hasText: kamer.naam });
    await rij.waitFor({ timeout: 10_000 });
    expect(await rij.textContent()).toContain('helpt op zon');
    expect(await rij.getAttribute('href')).toBe(`indeling.html#${encodeURIComponent(kamer.id)}/warmte`);
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', '-regeling.png') });
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /* Sensoren in de kamer (15 oktober 2026): wat ze meten, hun batterij, en beweging nu. */
  it('toont de bewegingsmelder in de kamer, met beweging nu', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const huis = (await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport;
    const kamer = huis.etages.flatMap((e) => e.ruimtes).find((r) => r.apparaten.some((d) => d.meting?.beweging?.nu))!;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(kamer.id)}`);
    const rij = p.locator('#wand .meterrij', { hasText: 'Beweging, nu' });
    await rij.waitFor({ timeout: 10_000 });
    await p.locator('#wand .beweegt').first().waitFor();
    expect(await p.locator('#wand .sc-beweging').count()).toBeGreaterThan(0);
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', '-beweging.png') });
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Hoe voelt het (besluit 134): tikken kan zonder inlog, er komt meteen een
   * antwoord, en na drie keer hetzelfde in hetzelfde dagdeel een voorstel.
   */
  it('noteert hoe het voelt zonder inlog, en stelt na een paar keer iets voor', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/thuis.html`);
    const kaart = p.locator('#wand [data-gevoel]');
    await kaart.locator('[data-gevoel-tik="te_koud"]').waitFor({ timeout: 10_000 });
    for (let i = 0; i < 3; i++) {
      await kaart.locator('[data-gevoel-tik="te_koud"]').click();
      await kaart.locator('.gevoelantwoord', { hasText: 'Genoteerd: te koud' }).waitFor();
    }
    // Zonder inlog bewaard, met de temperatuur van toen; en het blijft op Thuis.
    expect(new URL(p.url()).pathname).toBe('/thuis.html');
    // De temperatuur van toen staat erbij als de dienst die had; in de CI soms niet.
    expect(await kaart.locator('.gevoelantwoord').textContent()).toMatch(/^Genoteerd: te koud( bij \d+(,\d)?°)?\./);
    // Overdag in de test: drie keer te koud geeft een voorstel, als er overdag verwarmd wordt.
    const voorstel = kaart.locator('.gevoelvoorstel', { hasText: 'Voortaan anders?' });
    if (await voorstel.count()) expect(await voorstel.textContent()).toContain('3 keer te koud');
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /* Meldingen (besluit 136): de bel met een getal, het blad, Onderhoud, en na een update wat er nieuw is. */
  it('toont meldingen achter de bel, Onderhoud, en na een update wat er nieuw is', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => {
      localStorage.setItem('sc-rondleiding-gezien', '1');
      // Een oudere versie gezien: dan komt er één keer de pop-up.
      if (!sessionStorage.getItem('al')) {
        localStorage.setItem('sc-versie-gezien', '0.0.1');
        sessionStorage.setItem('al', '1');
      }
    });
    // Weghalen vraagt een bewoner, zoals Negeer (besluit 136).
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/vandaag.html`);
    // Wat is er nieuw, één keer.
    const pop = p.locator('[data-nieuwpop]');
    await pop.waitFor({ timeout: 10_000 });
    expect(await pop.textContent()).toContain(`Wat is er nieuw in ${VERSIE}`);
    expect(await p.locator('[data-nieuw-dicht]').textContent()).toBe('Oké');
    await p.locator('[data-nieuw-dicht]').click();
    expect(await pop.count()).toBe(0);
    // De bel met een getal, op elke pagina.
    const bel = p.locator('#wand [data-meldbel]');
    await expect.poll(() => bel.locator('[data-meldaantal]').textContent(), { timeout: 10_000 }).toBe('1');
    await bel.click();
    const blad = p.locator('[data-meldblad]');
    await blad.locator('.melding', { hasText: 'De droger reageert niet meer' }).waitFor();
    // Gelezen (15 oktober): het getal is weg, de melding staat er nog.
    expect(await bel.locator('[data-meldaantal]').isHidden()).toBe(true);
    await blad.locator('[data-meld-onderhoud]').click();
    await blad.locator('h2', { hasText: 'Onderhoud' }).waitFor();
    // Een melding weghalen met het kruisje: het getal verdwijnt (aangevuld 15 oktober).
    await blad.locator('[data-meld-terug]').click();
    await blad.locator('.melding', { hasText: 'De droger reageert niet meer' }).locator('[data-meld-weg]').click();
    await blad.locator('.stil', { hasText: 'Alles werkt' }).waitFor();
    expect(await bel.locator('[data-meldaantal]').isHidden()).toBe(true);
    await blad.locator('[data-meld-sluit]').click();
    expect(await blad.isHidden()).toBe(true);
    // De volgende keer geen pop-up meer.
    await p.reload();
    await bel.waitFor();
    await p.waitForTimeout(1600);
    expect(await pop.count()).toBe(0);
    expect(fouten).toEqual([]);
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
    // Een io-screen (schets Wand-Bedienen): Open, Half, de stand van nu en Dicht.
    await wand.locator('[data-scherm]').first().waitFor({ timeout: 10_000 });
    expect(await wand.locator('[data-scherm]').allTextContents()).toEqual(['Open', 'Half', '60%', 'Dicht']);
    await wand.locator('[data-scherm="stand:100"]').click({ timeout: 10_000 });
    await expect.poll(() => coverCalls.at(-1)).toBe('set_cover_position cover.screen 0');
    // Home Assistant meldt de nieuwe stand hier nooit: het doek blijft toch dicht staan (besluit 129).
    await p.waitForTimeout(1500);
    expect(await wand.locator('[data-standtekst]').textContent()).toBe('100%');
    // De greep slepen: helemaal omhoog is open.
    const doek = wand.locator('[data-schermsleep]');
    const vak = (await doek.boundingBox())!;
    const greep = (await wand.locator('[data-greep] rect').boundingBox())!;
    await p.mouse.move(greep.x + greep.width / 2, greep.y + greep.height / 2);
    await p.mouse.down();
    await p.mouse.move(greep.x + greep.width / 2, vak.y + 4, { steps: 6 });
    await p.mouse.up();
    await expect.poll(() => coverCalls.at(-1)).toBe('set_cover_position cover.screen 100');
    if (process.env.HEMS_PAGE_SHOT) await wand.locator('.blad').screenshot({ path: process.env.HEMS_PAGE_SHOT });
    expect(await wand.textContent()).toContain('De regeling doet er niets mee');

    // Een batterij onder de 10%: een pil op Thuis; een tik opent de lijst (besluit 127).
    extraBatterijen = [
      { id: 'd-knop', naam: 'Knop bank', pct: 7, kamer: kamer.naam, kamerId: kamer.id, leeg: true },
      { id: 'd-dimmer', naam: 'Hue dimmer switch', pct: 64, kamer: null, kamerId: null, leeg: false },
    ];
    await p.goto(`${baseUrl}/thuis.html`);
    // Onderhoud (15 oktober): ingeklapt een sleutel, een tik klapt open, Bekijk gaat naar de knop in de kamer.
    const sleutel = wand.locator('[data-onderhoud-knop]');
    await expect.poll(() => sleutel.isVisible(), { timeout: 10_000 }).toBe(true);
    await sleutel.click();
    const open = wand.locator('.onderhoudtekst');
    expect(await open.textContent()).toContain(`${kamer.naam}: batterij 7%`);
    expect(await open.locator('a', { hasText: 'Bekijk' }).getAttribute('href')).toBe(`kamer.html#${encodeURIComponent(kamer.id)}/batterij-d-knop`);
    // De hele lijst blijft achter het weer.
    await p.evaluate("location.hash = '#batterijen'; location.reload()");
    const lijst = wand.locator('#weer-wand');
    await expect.poll(() => lijst.isVisible()).toBe(true);
    expect(await lijst.getAttribute('aria-label')).toBe('Batterijen');
    const rijen = await lijst.locator('.accu').allTextContents();
    expect(rijen).toHaveLength(2);
    expect(rijen[0]).toMatch(/Knop bank\s*7%/);
    expect(rijen[1]).toMatch(/Hue dimmer switch\s*64%\s*Nog in geen kamer/);
    expect(await lijst.locator('a.accu').getAttribute('href')).toBe(`kamer.html#${encodeURIComponent(kamer.id)}`);
    await lijst.locator('.sluit').click();
    await expect.poll(() => lijst.isVisible()).toBe(false);
    extraBatterijen = [];
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Het schermtoetsenbord (besluit 124): de wand houdt zijn maat en schuift
   * omhoog tot het veld zichtbaar is; daarna staat alles weer op zijn plek. En
   * een te volle kolom schuift binnen zijn vak.
   */
  /*
   * Comfort (besluit 130): per kamer een balk per dagdeel. Een greep slepen
   * bewaart meteen, en de dienst rekent ermee.
   */
  it('zet comfort per kamer met een greep, en bewaart meteen', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const zone = exampleSite.zones[0]!;
    await p.goto(`${baseUrl}/comfort.html#${zone.id}`);
    const wand = p.locator('#wand');
    await wand.locator('[data-delen] .deel').first().waitFor({ timeout: 10_000 });
    const delen = await wand.locator('[data-delen] .deel b').allTextContents();
    expect(delen).toEqual([...exampleSite.zones.map((z) => z.name), 'Dagdelen', 'Voorrang', 'Afwezig en vakantie']);
    // De verwarmgreep van overdag een stuk naar rechts.
    const greep = wand.locator('[data-modus="dag"] [data-greep="heat"]');
    const vak = (await wand.locator('[data-modus="dag"] .schaal').boundingBox())!;
    const g = (await greep.boundingBox())!;
    await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await p.mouse.down();
    // 10 tot 30 graden over de balk: naar 75% is 25°, maar koelen ligt erboven, dus een graad eronder.
    await p.mouse.move(vak.x + vak.width * 0.5, g.y + g.height / 2, { steps: 5 });
    await p.mouse.up();
    await expect.poll(() => comfortNu?.kamers[zone.id]?.modi.dag?.heat, { timeout: 5_000 }).toBe(20);
    expect(configNu.zones[0]!.setpoints.dag.heat).toBe(20);
    await expect.poll(() => wand.locator('[data-bewaard]').textContent()).toContain('Bewaard');
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT });
    // Met de pijltjes een halve graad omhoog.
    await wand.locator('[data-modus="dag"] [data-greep="heat"]').focus();
    await p.keyboard.press('ArrowRight');
    await expect.poll(() => comfortNu?.kamers[zone.id]?.modi.dag?.heat, { timeout: 5_000 }).toBe(20.5);
    // Een tik op de regel: wanneer het aan- en uitgaat (besluit 133).
    await wand.locator('[data-modus="dag"] [data-uitleg$=":heat"]').click();
    expect(await wand.locator('[data-modus="dag"] .regel small').first().textContent()).toMatch(/^Aan onder .*, uit bij /);
    // Per kamer alleen overdag en 's nachts; op zon mag het 2 graden verder.
    expect(await wand.locator('[data-vorm] [data-modus]').evaluateAll((els) => els.map((e) => e.getAttribute('data-modus')))).toEqual(['dag', 'nacht']);
    const opZon = wand.locator('[data-opzon="2"]');
    if (await opZon.count()) {
      await opZon.click();
      await expect.poll(() => comfortNu?.kamers[zone.id]?.opZonC, { timeout: 5_000 }).toBe(2);
      expect(configNu.zones[0]!.buffering).toMatchObject({ enabled: true, bandC: 2 });
    }
    // Afwezig en vakantie in hun eigen deel, per kamer te kiezen.
    await wand.locator('[data-delen] .deel', { hasText: 'Afwezig en vakantie' }).click();
    await wand.locator('[data-vorm] [data-modus="vakantie"]').waitFor();
    expect(await wand.locator('[data-afwezig-kamer]').count()).toBe(exampleSite.zones.length);
    // Voorrang (besluit 134): bij koelen de tweede kamer omhoog.
    await wand.locator('[data-delen] .deel', { hasText: 'Voorrang' }).click();
    await wand.locator('[data-vorm] .rang').first().waitFor();
    const koelVoor = configNu.zones.filter((z) => comfortView(configNu, null).voorrang.koelen.includes(z.id));
    if (koelVoor.length > 1) {
      const tweede = comfortView(configNu, comfortNu).voorrang.koelen[1]!;
      await wand.locator(`[data-schuif="koelen:${tweede}:-1"]`).click();
      await expect.poll(() => comfortNu?.voorrang?.koelen[0], { timeout: 5_000 }).toBe(tweede);
      expect(configNu.zones.find((z) => z.id === tweede)?.priorityByAction?.cool).toBe(1);
    }
    // De dagdelen: overdag een uur later.
    await wand.locator('[data-delen] .deel', { hasText: 'Dagdelen' }).click();
    await wand.locator('[data-uur="dag:1"]').click();
    await expect.poll(() => configNu.schedule.dayFromHour, { timeout: 5_000 }).toBe(exampleSite.schedule.dayFromHour + 1);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  it('houdt de maat bij een schermtoetsenbord, en laat volle kolommen schuiven', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/assistent.html`);
    const veld = p.locator('#wand [data-vrij] input');
    await veld.waitFor();
    const schaal = () => p.evaluate<string>("getComputedStyle(document.documentElement).getPropertyValue('--wandschaal').trim()");
    const voor = await schaal();
    await veld.focus();
    // Het toetsenbord komt: het scherm is nog 430 hoog.
    await p.setViewportSize({ width: 1280, height: 430 });
    await expect.poll(async () => (await veld.boundingBox())!.y + (await veld.boundingBox())!.height, { timeout: 5000 }).toBeLessThanOrEqual(430);
    expect(await schaal()).toBe(voor);
    // Het toetsenbord gaat weg.
    await veld.evaluate((el) => (el as unknown as { blur: () => void }).blur());
    await p.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => p.evaluate<string>("getComputedStyle(document.documentElement).getPropertyValue('--toetsschuif').trim()")).toBe('0px');
    expect(await schaal()).toBe(voor);
    // Een groep achter het tandwiel: elk vak schuift zelf, de pagina niet (besluit 130).
    await p.goto(`${baseUrl}/energie.html#prijzen`);
    await p.locator('#wand [data-vorm] h2').first().waitFor();
    const vakken = await p.evaluate<string[]>("['[data-delen]', '[data-vorm]', '[data-naast]'].map((s) => getComputedStyle(document.querySelector('#wand ' + s)).overflowY)");
    expect(vakken.every((o) => o === 'auto')).toBe(true);
    await p.goto(`${baseUrl}/thuis.html`);
    expect(await p.evaluate<string>("getComputedStyle(document.querySelector('#wand .rechts')).overflowY")).toBe('auto');
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
  it('stelt de camera\u2019s en de deurbel in, en bewaart meteen', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand a.tegel[href="functies.html"]').click();
    const wand = p.locator('#wand');
    await wand.locator('.regelrij', { hasText: 'Camera oprit' }).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Het voorstel: het vloeiende beeld. Nu het scherpe.
    expect(await wand.locator('[aria-label="Beeld van Camera oprit"] button[aria-pressed="true"]').textContent()).toBe('Vloeiend');
    await wand.locator('[aria-label="Beeld van Camera oprit"] button', { hasText: 'Scherp' }).click();
    await expect.poll(() => functiesStore.current?.cameras, { timeout: 5_000 }).toEqual({ aan: true, lijst: ['camera.camera_oprit_duidelijk'] });
    // Licht: de installatie staat het toe, dus bedienen staat aan; hier op alleen kijken (besluit 111).
    await wand.locator('[data-delen] .deel', { hasText: 'Licht en screens' }).click();
    await wand.locator('[data-vorm] h2', { hasText: 'Licht en screens' }).waitFor();
    expect(await wand.locator('[aria-label="Licht bedienen"] button[aria-pressed="true"]').textContent()).toBe('Bedienen in de app');
    await wand.locator('[aria-label="Licht bedienen"] button', { hasText: 'Alleen kijken' }).click();
    await expect.poll(() => functiesStore.current?.licht, { timeout: 5_000 }).toEqual({ bedienen: false });
    // Meldingen (besluit 149): een batterij al onder de 20%, een filter nooit.
    await wand.locator('[data-delen] .deel', { hasText: 'Meldingen' }).click();
    await wand.locator('[aria-label="Batterij bijna leeg onder"] button', { hasText: '20%' }).click();
    await wand.locator('[aria-label="Filter bijna vol onder"] button', { hasText: 'Nooit' }).click();
    await expect.poll(() => functiesStore.current?.meldingen, { timeout: 5_000 }).toEqual({ batterij: 20, filter: null });
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Zonder deurbel in Home Assistant zegt de pagina dat.
    await wand.locator('[data-delen] .deel', { hasText: 'Deurbel' }).click();
    await wand.locator('[data-vorm] h2', { hasText: 'Deurbel' }).waitFor();
    expect(await wand.textContent()).toContain('Geen deurbel gevonden');
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Inrichten in één keer (besluit 139): over het hele scherm, de stappen
   * bovenaan, links het huis en rechts één vraag. Van Instellingen naar
   * Inrichten, en zonder van pagina te wisselen door alle stappen.
   */
  it('loopt in één pagina door het inrichten', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const shot = async (naam: string) => {
      if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', `-${naam}.png`) });
    };
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand a[href="inrichten.html"]').click();
    const kaart = p.locator('#wand [data-kaart]');
    await kaart.locator('h1', { hasText: 'Laten we je huis neerzetten' }).waitFor({ timeout: 10_000 });
    await kaart.locator('.cijfers').waitFor();
    await p.waitForTimeout(400);
    expect(await p.locator('#wand [data-stappen] .stap').count()).toBe(6);
    expect(await p.locator('#wand [data-stappen] .stipjes i').count()).toBe(13);
    expect(await p.locator('#wand #balk').count()).toBe(0);
    await shot('welkom');
    await kaart.locator('a', { hasText: 'Begin' }).click();
    await kaart.locator('h1', { hasText: 'Klopt je huis?' }).waitFor();
    // Een kamer aantikken: de naam en de etage om te veranderen.
    await kaart.locator('[data-kamer]').first().click();
    await kaart.locator('[data-naam]').waitFor();
    await shot('huis');
    await kaart.locator('[data-klopt]').click();
    // Zes hoofdstukken met kleine stappen (besluit 144).
    await p.waitForURL(/#buiten$/);
    await kaart.locator('h1', { hasText: 'Wat ligt er rond je huis?' }).waitFor();
    await shot('buiten');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    // Wie woont hier (besluit 147): wie al ingelogd is, en de code om anderen te laten inloggen.
    await kaart.locator('h1', { hasText: 'Wie woont hier?' }).waitFor();
    await kaart.locator('.qr svg').waitFor();
    await shot('bewoners');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await p.waitForURL(/#apparaten$/);
    await kaart.locator('.waar', { hasText: '2. Apparaten' }).waitFor();
    await shot('apparaten');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Welke thermometer telt per kamer?' }).waitFor();
    await shot('meten');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Wat verwarmt en koelt er?' }).waitFor();
    expect(await kaart.locator('[data-rol]').count()).toBeGreaterThan(0);
    // Drie knoppen per apparaat, zoals de schets (besluit 146).
    const seg = kaart.locator('[data-rol]').first();
    const doel = (await seg.locator('[aria-pressed="true"]').getAttribute('data-rolwaarde')) === 'zon' ? 'kijken' : 'zon';
    await seg.locator(`[data-rolwaarde="${doel}"]`).click();
    await kaart.locator(`[data-rol] [data-rolwaarde="${doel}"][aria-pressed="true"]`).first().waitFor({ timeout: 5000 });
    await shot('warmte');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Hoe warm wil je het?' }).waitFor();
    await kaart.locator('[data-comfort="warm"]').waitFor();
    await shot('comfort');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Je panelen en je verwarming' }).waitFor();
    await shot('zon');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Hoe zwaar is je aansluiting?' }).waitFor();
    // Eerst de fasen, dan de ampère in een vak.
    await kaart.locator('[data-fasen="3"]').click();
    await kaart.locator('[data-fasen="3"][aria-pressed="true"]').waitFor({ timeout: 5000 });
    await kaart.locator('[data-ampere]').selectOption('40');
    await expect.poll(async () => ((await (await fetch(`${baseUrl}/api/aansluiting`, { headers: { cookie: `hems_sessie=${sessionId}` } })).json()) as { antwoorden?: { zekering?: unknown } }).antwoorden?.zekering, { timeout: 5000 }).toEqual({ fasen: 3, ampere: 40 });
    await shot('zekering');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Wat betaal je per kWh?' }).waitFor();
    await shot('prijzen');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: "Licht en camera's" }).waitFor();
    await shot('functies');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('.waar', { hasText: '5. Gemak · De wand' }).waitFor();
    await shot('wand');
    await kaart.locator('a', { hasText: 'Volgende' }).click();
    await kaart.locator('h1', { hasText: 'Je huis staat erin' }).waitFor();
    await shot('klaar');
    // De film (besluit 144): je eigen huis, beelden van drie tellen, pauzeren, het geluid uit en overslaan.
    await kaart.locator('button', { hasText: 'Speel af' }).click();
    const film = p.locator('.film');
    await film.locator('.groot').waitFor({ timeout: 10_000 });
    await film.locator('[data-film-huis] svg').waitFor();
    await shot('film-0');
    await film.locator('[data-film-pauze]').click();
    expect(await film.locator('[data-film-pauze]').getAttribute('aria-label')).toBe('Verder afspelen');
    await film.locator('[data-film-geluid]').click();
    expect(await film.locator('[data-film-geluid]').getAttribute('aria-pressed')).toBe('false');
    await film.locator('[data-film-klaar]').click();
    await p.waitForURL(/thuis\.html#rondleiding$/);
    // Elk beeld, los afgespeeld.
    await p.goto(`${baseUrl}/inrichten.html#klaar`);
    await kaart.locator('h1', { hasText: 'Je huis staat erin' }).waitFor();
    await p.evaluate(`film.speel({}).then((f) => (window.__film = f))`);
    await p.waitForFunction('window.__film != null');
    const aantal = await p.evaluate<number>('window.__film.aantal');
    expect(aantal).toBeGreaterThanOrEqual(3);
    // Zo'n 45 seconden: een intro, de beelden en een slot (besluit 146).
    const lengte = await p.evaluate<number>('window.__film.lengteS');
    expect(lengte).toBeGreaterThan(30);
    expect(lengte).toBeLessThan(55);
    const titels: string[] = [];
    for (let i = 0; i < aantal; i++) {
      await p.evaluate(`window.__film.pauze(true); window.__film.naar(${i}); window.__film.pauze(false)`);
      // De intro laat zijn woorden later komen, met de zon.
      await p.waitForTimeout(i === 0 ? 5200 : 1300);
      titels.push((await p.locator('.film .titel').textContent()) ?? '');
      // Elk beeld een groot getal of woord en een zin, en nooit iets leegs.
      expect(((await p.locator('.film .groot').textContent()) ?? '').trim()).not.toBe('');
      expect(await p.locator('.film h2').textContent()).not.toMatch(/undefined|NaN|null/);
      await shot(`film-${i}`);
    }
    await p.evaluate('window.__film.stop(); window.__film = null');
    expect(titels).toContain('Vraag het je huis');
    expect(titels.at(-1)).toBe('Klaar');
    // De muziek bouwt op: stil begin, voller in de opbouw, het hardst in de drop, en hij kraakt nergens.
    const luid = await p.evaluate<{ intro: number; opbouw: number; drop: number; slot: number; piek: number }>(`(async () => {
      const plan = { intro: 4, drop: 10, slot: 16, eind: 21 };
      const buf = await film.opname(plan);
      const kan = buf.getChannelData(0);
      const rms = (vanMaat, totMaat) => {
        const a = Math.floor(vanMaat * film.MAAT * buf.sampleRate), b = Math.floor(totMaat * film.MAAT * buf.sampleRate);
        let s = 0;
        for (let i = a; i < b; i++) s += kan[i] * kan[i];
        return Math.sqrt(s / (b - a));
      };
      let piek = 0;
      for (let i = 0; i < kan.length; i++) piek = Math.max(piek, Math.abs(kan[i]));
      return { intro: rms(0, 4), opbouw: rms(4, 9), drop: rms(10, 16), slot: rms(16, 19), piek };
    })()`);
    expect(luid.intro).toBeGreaterThan(0.005);
    expect(luid.opbouw).toBeGreaterThan(luid.intro);
    expect(luid.drop).toBeGreaterThan(luid.opbouw);
    expect(luid.piek).toBeLessThan(0.96);
    console.log('muziek', JSON.stringify(luid));
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Op de telefoon: alles onder elkaar, binnen het scherm.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto(`${baseUrl}/inrichten.html#warmte`);
    await p.locator('#tel [data-kaart] h1', { hasText: 'Wat verwarmt en koelt er?' }).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(true);
    await shot('telefoon');
    expect(fouten).toEqual([]);
    await context.close();
  }, 40_000);

  it('toont zonder verbinding de laatste stand, grijs', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addInitScript(() => localStorage.setItem('sc-rondleiding-gezien', '1'));
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/thuis.html`);
    await p.locator('#wand svg.sc-huis').first().waitFor();
    // Echt geen verbinding meer: anders haalt een vraag die nog onderweg was de balk weer weg.
    await context.route((url) => url.pathname.startsWith('/api/'), (route) => route.abort());
    await expect.poll(async () => {
      await p.evaluate('app.offline(Date.now())');
      return p.locator('.geenverbinding', { hasText: 'De regeling loopt gewoon door' }).isVisible();
    }, { timeout: 20_000 }).toBe(true);
    expect(await p.evaluate("getComputedStyle(document.querySelector('#wand main')).pointerEvents")).toBe('none');
    await p.evaluate('app.online()');
    expect(await p.locator('.geenverbinding').count()).toBe(0);
    await context.close();
  }, 40_000);

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
      // Het nu (besluit 140): elk klimaatapparaat als kaart naar zijn kamer, en geen grafiek van de dag meer.
      const klimaatKaart = p.locator(`${z} a.app[href^="kamer.html#"]`);
      await klimaatKaart.first().waitFor();
      expect(await klimaatKaart.first().textContent()).toMatch(/Vandaag/);
      expect(await p.locator(`${z} [data-dag]`).count()).toBe(0);
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
   * De rondleiding (besluit 139 en 144): twaalf stops op de echte pagina's en
   * dan Klaar, de eerste keer vanzelf, daarna achter het vraagteken op Thuis.
   */
  it('loopt de rondleiding langs alle tabbladen en een kamer, en daarna achter het vraagteken', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const shot = async (naam: string) => {
      if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', `-${naam}.png`) });
    };
    await p.goto(`${baseUrl}/thuis.html`);
    const kaart = p.locator('.rl-kaart');
    const volgende = async (kop: string, naam: string) => {
      await kaart.filter({ hasText: kop }).waitFor({ timeout: 10_000 });
      await p.waitForTimeout(450);
      await shot(naam);
      await kaart.locator('[data-rl-volgende]').click();
    };
    await volgende('Dit is je huis', 'rl-1');
    await volgende('Tik op een kamer', 'rl-2');
    await p.waitForURL(/kamer\.html$/);
    await volgende('De kamer van dichtbij', 'rl-3');
    await p.waitForURL(/thuis\.html$/);
    await volgende('Hoe voelt het?', 'rl-4');
    await p.waitForURL(/vandaag\.html$/);
    await volgende('Wat er vandaag gebeurt', 'rl-5');
    await volgende('Gisteren en morgen', 'rl-6');
    await p.waitForURL(/apparaten\.html$/);
    await volgende('Wat elk apparaat nu doet', 'rl-7');
    await p.waitForURL(/opbrengst\.html$/);
    await volgende('Wat je dak opleverde', 'rl-8');
    await p.waitForURL(/assistent\.html$/);
    await volgende('Vraag het je huis', 'rl-9');
    await p.waitForURL(/thuis\.html$/);
    await volgende('De bel', 'rl-10');
    await p.waitForURL(/instellingen\.html$/);
    await volgende('Het tandwiel', 'rl-11');
    await p.waitForURL(/huis-kan\.html$/);
    await volgende('Hoe ver het huis is', 'rl-12');
    await p.waitForURL(/thuis\.html$/);
    await kaart.filter({ hasText: 'Klaar' }).locator('[data-rl-klaar]').waitFor();
    await shot('rl-klaar');
    await kaart.locator('[data-rl-klaar]').click();
    await kaart.waitFor({ state: 'detached' });
    expect(await p.evaluate('localStorage.getItem("sc-rondleiding-gezien")')).toBe('1');
    // Gezien: na herladen niet vanzelf, wel achter het vraagteken; Escape stopt.
    await p.reload();
    await p.locator('#wand [data-kop]').filter({ hasNotText: 'Even laden' }).waitFor();
    await p.waitForTimeout(900);
    expect(await kaart.count()).toBe(0);
    await p.locator('#wand [data-uitleg]').click();
    await kaart.filter({ hasText: 'Dit is je huis' }).waitFor();
    await p.keyboard.press('Escape');
    await kaart.waitFor({ state: 'detached' });
    // Op de telefoon: de kaart over de breedte, binnen het scherm.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('#tel [data-uitleg]').click();
    await kaart.filter({ hasText: 'Dit is je huis' }).waitFor();
    await volgende('Dit is je huis', 'rl-tel-1');
    await kaart.filter({ hasText: 'Tik op een kamer' }).waitFor();
    const vak = (await kaart.boundingBox())!;
    expect(vak.x).toBeGreaterThanOrEqual(0);
    expect(vak.x + vak.width).toBeLessThanOrEqual(390);
    await p.waitForTimeout(450);
    await shot('rl-tel-2');
    expect(fouten).toEqual([]);
    await context.close();
  }, 60_000);

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
      // Verwacht naast echt (besluit 137): het getal van vandaag, en bij gisteren hoe het klopte.
      if (stand === 'wand') expect(await p.locator('#wand [data-tijdlijn] svg').textContent()).toContain('tot nu toe');
      await p.locator(`${z} [data-dag="gisteren"]`).click();
      await p.locator(`${z} h1`, { hasText: 'Gisteren' }).waitFor();
      await p.locator(stand === 'wand' ? '#wand [data-verwacht]' : '#tel [data-klopte]', { hasText: 'Zo klopte de verwachting' }).waitFor();
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
  it('stelt de vraag uit het adres meteen, praat, en vraagt of het nog iets kan doen (besluit 141)', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    const shot = async (naam: string) => {
      if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', `-${naam}.png`) });
    };
    // Het begin: een begroeting en vragen die nu ergens over gaan.
    await p.goto(`${baseUrl}/assistent.html`);
    await p.locator('#wand [data-zegt]', { hasText: 'Waarmee kan ik je helpen?' }).waitFor({ timeout: 10_000 });
    await p.locator('#wand [data-sug]').first().waitFor();
    expect(await p.locator('#wand [data-sug]').count()).toBeGreaterThanOrEqual(3);
    expect(await p.locator('#wand [data-suggesties]').textContent()).not.toMatch(/de beneden|de Beneden/);
    await shot('as-begin');
    // Een vraag uit het adres: hij praat, met de woorden die meekomen; Stop maakt het af.
    await p.goto(`${baseUrl}/assistent.html#nu`);
    await p.locator('#wand .jij', { hasText: 'Wat doe je nu?' }).waitFor({ timeout: 10_000 });
    await p.locator('body[data-stand="praat"]').waitFor();
    await shot('as-praat');
    await p.locator('#wand [data-stop]').click();
    await p.locator('#wand .klein-zegt', { hasText: 'Kan ik je nog ergens mee helpen?' }).waitFor();
    // Een vervolgvraag, en dan "Nee, dank je".
    await p.locator('#wand [data-sug]').first().click();
    await p.locator('body[data-stand="praat"]').waitFor();
    await p.locator('#wand [data-stop]').click();
    await p.locator('#wand [data-eerder]', { hasText: 'Wat doe je nu?' }).waitFor();
    // Geen ruwe codes bij de feiten.
    expect(((await p.locator('#wand .feiten').textContent().catch(() => '')) ?? '').replace(/kWh|kW/g, '')).not.toMatch(/[a-z][A-Z]|_/);
    await shot('as-verder');
    await p.locator('#wand [data-nee]').click();
    await p.locator('#wand [data-zegt]', { hasText: 'Ik ben er als je me nodig hebt' }).waitFor();
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    expect(fouten).toEqual([]);
    await context.close();
  }, 40_000);

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
    // Een airco hangt nooit voor het raam (besluit 131).
    for (const [soort, lijst] of Object.entries(uitkomst.per) as [string, Blok[]][]) {
      for (const a of lijst.filter((b) => b.wat === 'apparaat' && b.soort === 'airco')) {
        for (const r of lijst.filter((b) => b.wat === 'raam' && b.kamer === a.kamer)) {
          if (a.y0 < 0.3 && a.x0 < r.x1 && r.x0 < a.x1 && a.z0 < r.z1 && r.z0 < a.z1) problemen.push(`${soort}: de airco in ${a.kamer} hangt voor het raam`);
        }
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
    await p.locator('#wand [data-stop]').click();
    const knop = p.locator('#wand .verder a', { hasText: 'Naar Contract en prijzen' });
    await knop.waitFor();
    expect(await knop.getAttribute('href')).toBe('energie.html#prijzen');
    expect(await veld.inputValue()).toBe('');
    // Niets herkend: voorbeelden om op te tikken.
    await veld.fill('banaan');
    await veld.press('Enter');
    await p.locator('#wand [data-stop]').click();
    await p.locator('#wand [data-sug]', { hasText: 'Waar vul ik de prijzen in?' }).click();
    await p.locator('#wand [data-stop]').click();
    await p.locator('#wand .verder a', { hasText: 'Naar Contract en prijzen' }).waitFor();
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    if (process.env.HEMS_PAGE_SHOT) await p.screenshot({ path: process.env.HEMS_PAGE_SHOT });
    expect(fouten).toEqual([]);
    await context.close();
  }, 20_000);

  /*
   * Instellingen en Wat je huis kan (schetsen Instellingen, Wand-Leren en
   * Wand-Huis-groeit): wie stuurt, wat het huis weet, en de stappen.
   */
  /*
   * De zon op zijn boog (16 oktober 2026): ook als de tekening laag is en de
   * boog omlaag moet, staat de zon op de stippellijn, bij elke stand.
   */
  it('zet de zon in de tekening altijd op zijn boog', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`${baseUrl}/thuis.html`);
    await p.waitForFunction('window.huis != null');
    const afwijkingen = await p.evaluate<number[]>(`(() => {
      const uit = [];
      const doos = document.createElement('div');
      document.body.append(doos);
      const etages = [{ naam: 'Begane grond', kamers: [{ naam: 'Woonkamer', apparaten: [] }] }, { dak: true, kamers: [{ naam: 'Zolder', apparaten: [] }] }];
      for (const hoogte of [612, 420, 300, 220]) {
        for (const stand of [0.05, 0.2, 0.5, 0.8, 0.95]) {
          huis.teken(doos, { tijd: 'dag', zon: { stand, hoogte: 0.6, aandeel: 0.5, panelen: 8 }, etages, net: true, labels: [] }, { breedte: 860, hoogte });
          const [x0, y0, rx, ry, , , , x1] = doos.querySelector('path[stroke-dasharray="2 7"]').getAttribute('d').match(/-?[0-9.]+/g).map(Number);
          const zon = doos.querySelector('circle[fill="#FFD27A"]');
          const sx = Number(zon.getAttribute('cx'));
          const sy = Number(zon.getAttribute('cy'));
          uit.push(Math.abs(((sx - (x0 + x1) / 2) / rx) ** 2 + ((sy - y0) / ry) ** 2 - 1));
        }
      }
      return uit;
    })()`);
    await p.close();
    expect(Math.max(...afwijkingen)).toBeLessThan(0.01);
  });

  /*
   * Vegen op de tablet (16 oktober 2026): elke lijst die kan schuiven, schuift
   * met de vinger, ook als de vinger op een regel landt die je kunt slepen. Een
   * echte veeg via Chrome zelf, op elke pagina van de wand.
   */
  it('laat op de tablet elke schuivende lijst met de vinger schuiven', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.addCookies([{ name: 'hems_sessie', value: sessionId, url: baseUrl }]);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const cdp = await context.newCDPSession(p);
    const huisNu = (await (await fetch(`${baseUrl}/api/huis`)).json()) as { etages: { ruimtes: { id: string; apparaten: unknown[] }[] }[] };
    const vol = huisNu.etages.flatMap((e) => e.ruimtes).sort((x, y) => y.apparaten.length - x.apparaten.length)[0]!;
    const paginas = ['thuis.html', 'vandaag.html', 'apparaten.html', 'opbrengst.html', `kamer.html#${encodeURIComponent(vol.id)}`, `indeling.html#${encodeURIComponent(vol.id)}`, 'instellingen.html', 'comfort.html', 'energie.html', 'functies.html', 'regeling.html', 'huis-kan.html', 'toegang.html', 'inrichten.html#warmte'];
    const vast: string[] = [];
    let geveegd = 0;
    for (const pagina of paginas) {
      await p.goto(`${baseUrl}/${pagina}`);
      // Een open stroom houdt het netwerk nooit stil: gewoon even laten tekenen.
      await p.waitForTimeout(1500);
      // Alles wat kan schuiven en meer inhoud heeft dan past, met een punt erop dat zichtbaar is.
      const lijsten = await p.evaluate<{ sel: string; x: number; y: number }[]>(`(() => {
        const uit = [];
        document.querySelectorAll('#wand *').forEach((el, i) => {
          const st = getComputedStyle(el);
          if (!/(auto|scroll)/.test(st.overflowY) || el.scrollHeight <= el.clientHeight + 24) return;
          const r = el.getBoundingClientRect();
          if (r.width < 60 || r.height < 80) return;
          const x = r.left + r.width / 2;
          const y = r.top + Math.min(r.height * 0.6, r.height - 30);
          const raak = document.elementFromPoint(x, y);
          if (!raak || !el.contains(raak)) return;
          el.dataset.veegtest = String(i);
          uit.push({ sel: '[data-veegtest="' + i + '"]', x, y });
        });
        return uit;
      })()`);
      for (const l of lijsten) {
        const voor = await p.locator(l.sel).evaluate((el) => el.scrollTop);
        // Vinger neer, omhoog vegen, los: zoals op het scherm zelf.
        const x = Math.round(l.x);
        const y = Math.round(l.y);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 14 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(250);
        const na = await p.locator(l.sel).evaluate((el) => el.scrollTop);
        geveegd++;
        if (na <= voor) vast.push(`${pagina}: ${l.sel}`);
      }
    }
    // En slepen met de vinger blijft werken: een apparaat zijwaarts naar een andere kamer.
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(vol.id)}`);
    await p.waitForTimeout(1500);
    const rij = p.locator('#wand [data-blad] .app').first();
    await rij.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const appId = (await rij.getAttribute('data-app'))!;
    const andere = p.locator(`#wand .sc-tik[data-kamer]:not([data-kamer="${vol.id}"]):not([data-kamer="__nieuw"])`).first();
    const naarKamer = (await andere.getAttribute('data-kamer'))!;
    const van = (await rij.boundingBox())!;
    const naar = (await andere.boundingBox())!;
    const [x0, y0] = [Math.round(van.x + 30), Math.round(van.y + van.height / 2)];
    const [x1, y1] = [Math.round(naar.x + naar.width / 2), Math.round(naar.y + naar.height / 2)];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 16; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + ((x1 - x0) * i) / 16), y: Math.round(y0 + ((y1 - y0) * Math.max(0, i - 4)) / 12) }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => layoutStore.current?.apparaten[appId]?.kamer, { timeout: 5000 }).toBe(naarKamer);
    await p.locator('#wand [data-ongedaan]').click({ timeout: 5000 });
    await expect.poll(() => layoutStore.current?.apparaten[appId]?.kamer ?? vol.id, { timeout: 5000 }).toBe(vol.id);
    await context.close();
    expect(geveegd).toBeGreaterThan(0);
    expect(vast).toEqual([]);
  }, 90_000);

  it('toont Instellingen in zes groepen, en daarvandaan Wat je huis kan (besluit 130)', async () => {
    const context = await browser.newContext({ viewport: { width: 1340, height: 800 }, timezoneId: 'UTC', locale: 'nl-NL' });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    const fouten: string[] = [];
    p.on('pageerror', (e) => fouten.push(e.message));
    await p.goto(`${baseUrl}/instellingen.html`);
    await p.locator('#wand [data-groepen] .tegel').first().waitFor();
    expect(await p.locator('#wand [data-groepen] .tegel h3').allTextContents()).toEqual(['Je huis', 'Comfort', 'Energie', 'Regeling', 'Functies', 'Bewoners en toegang']);
    expect(await p.locator('#balk [aria-current="page"]').getAttribute('aria-label')).toBe('Instellingen');
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
    // Zoeken: "zekering" vindt de aansluiting bij Energie.
    await p.locator('#wand [data-zoek]').fill('zekering');
    await p.locator('#wand [data-gevonden] a', { hasText: 'Hoofdzekering' }).waitFor();
    expect(await p.locator('#wand [data-gevonden] a').first().getAttribute('href')).toBe('energie.html#aansluiting');
    // Meervoud, een hoofdletter, en ook wat niet in de vaste lijst staat: een kamer van dit huis (besluit 132).
    await p.locator('#wand [data-zoek]').fill('Batterijen');
    await p.locator('#wand [data-gevonden] a', { hasText: 'Batterijen en filters' }).waitFor();
    const eenKamer = (((await (await fetch(`${baseUrl}/api/huis`)).json()) as HouseReport).etages[0]?.ruimtes[0]?.naam) ?? '';
    await p.locator('#wand [data-zoek]').fill(eenKamer.toLowerCase());
    await p.locator('#wand [data-gevonden] a', { hasText: eenKamer }).first().waitFor();
    await p.locator('#wand [data-zoek]').press('Escape');
    await p.locator('#wand a.kan').click();
    await p.locator('#wand h1', { hasText: 'Wat je huis kan' }).waitFor();
    await p.locator('#wand svg.sc-huis').first().waitFor();
    expect(await p.locator('#wand [data-vakken] .vak h3').allTextContents()).toEqual(['Comfort', 'Zon en kosten', 'Gemak', 'Overzicht']);
    // Een tik opent het blad, met wat het is en wanneer het werkt.
    await p.locator('#wand [data-vakken] .regel', { hasText: 'Thuisbatterij' }).click();
    await p.locator('#wand [data-blad]', { hasText: 'Wanneer het werkt' }).waitFor();
    await p.locator('#wand [data-blad] [data-sluit]').click();
    await expect.poll(() => p.locator('#wand [data-blad]').isHidden()).toBe(true);
    expect(await p.evaluate('document.scrollingElement.scrollHeight <= innerHeight')).toBe(true);
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
    // De etages naast elkaar van beneden naar boven, buiten achteraan (besluit 131).
    const naast = await p.locator('#wand [data-etages] button').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-etage')));
    const binnen = huisNu.etages.map((e) => (e as unknown as { id: string }).id).filter((id) => id !== 'buiten' && naast.includes(id));
    expect(naast.filter((id) => id !== 'buiten')).toEqual([...binnen].reverse());
    if (naast.includes('buiten')) expect(naast.at(-1)).toBe('buiten');
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
    // Een beeld van een vorige test kan nog even open tellen tot de verbinding dicht is.
    await expect.poll(() => liveOpen, { timeout: 5_000 }).toBe(1);
    // Een andere kamer: het beeld stopt.
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metKlimaat.id)}`);
    await expect.poll(() => liveOpen).toBe(0);

    // Een lamp: de schakelaar gaat via de deur naar Home Assistant.
    const voor = lightCalls.length;
    await p.goto(`${baseUrl}/kamer.html#${encodeURIComponent(metLamp.id)}`);
    const schakel = p.locator('#wand [data-blad] [data-schakel]').first();
    const was = await schakel.getAttribute('aria-checked');
    await schakel.click();
    await expect.poll(() => lightCalls.length).toBeGreaterThan(voor);
    // Home Assistant meldt de nieuwe stand hier nooit: de schakelaar blijft toch
    // staan op wat je koos, en springt niet terug (besluit 128).
    await p.waitForTimeout(1500);
    expect(await p.locator('#wand [data-blad] [data-schakel]').first().getAttribute('aria-checked')).toBe(String(was !== 'true'));

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

    // Zones met een soort, schuiven, en een kamer naar links of rechts (besluit 145).
    // Alleen het hekje wisselen opent de kamer niet: opnieuw laden.
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(a.id)}`);
    await p.reload();
    await p.waitForLoadState('networkidle');
    await expect.poll(() => p.locator('#wand [data-actie="kamernaam"]').inputValue(), kort).toBe(a.naam);
    const zonesVan = () => layoutStore.current?.kamers.find((k) => k.id === a.id)?.zones ?? [];
    const voorZones = zonesVan().length;
    for (const naam of ['Keukenhoek', 'Bij het raam']) {
      await p.locator('#wand [data-nieuwe-zone]').fill(naam, kort);
      await p.locator('#wand [data-nieuwe-zone]').press('Tab');
      await expect.poll(() => zonesVan().some((z) => z.naam === naam), kort).toBe(true);
    }
    const raam = zonesVan().find((z) => z.naam === 'Bij het raam')!;
    await p.locator(`#wand [data-zone-soort="${raam.id}"]`).selectOption('woonkamer', kort);
    await expect.poll(() => zonesVan().find((z) => z.id === raam.id)?.soort, kort).toBe('woonkamer');
    await p.locator(`#wand [data-zone-schuif="-1"][data-zone="${raam.id}"]`).click(kort);
    await expect.poll(() => zonesVan().at(-2)?.id, kort).toBe(raam.id);
    const plek = () => (layoutStore.current?.kamers ?? []).filter((k) => k.etage === a.etage).findIndex((k) => k.id === a.id);
    const plekVoor = plek();
    const schuif = plekVoor === 0 ? '1' : '-1';
    await p.locator(`#wand [data-kamer-schuif="${schuif}"]`).click(kort);
    await expect.poll(plek, kort).toBe(plekVoor + Number(schuif));
    if (process.env.HEMS_PAGE_SHOT) {
      await p.locator(`#wand [data-zone-soort="${raam.id}"]`).scrollIntoViewIfNeeded();
      await p.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', '-zones.png') });
    }
    // En alles weer terug.
    for (let n = 0; n < 5; n++) await p.locator('#wand [data-ongedaan]').click(kort);
    await expect.poll(() => zonesVan().length, kort).toBe(voorZones);
    await expect.poll(plek, kort).toBe(plekVoor);

    // De gevel van een scherm kiezen (besluit 145).
    const metScreen = huisNu.etages.flatMap((e) => e.ruimtes).find((r) => r.apparaten.some((x) => x.id === 'cover.screen'))!;
    await p.goto(`${baseUrl}/indeling.html#${encodeURIComponent(metScreen.id)}`);
    await p.reload();
    await p.waitForLoadState('networkidle');
    await p.locator('#wand .app[data-app="cover.screen"]').click(kort);
    await p.locator('#wand [data-app-gevel]').selectOption('achtergevel', kort);
    await p.locator('#wand [data-app-bewaar="cover.screen"]').click(kort);
    await expect.poll(() => layoutStore.current?.apparaten['cover.screen']?.gevel, kort).toBe('achtergevel');
    const huisNa = (await (await fetch(`${baseUrl}/api/huis`)).json()) as { etages: { ruimtes: { apparaten: { id: string; scherm?: { gevel?: { id: string; gekozen: boolean } } }[] }[] }[] };
    expect(huisNa.etages.flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).find((x) => x.id === 'cover.screen')?.scherm?.gevel).toMatchObject({ id: 'achtergevel', gekozen: true });
    await p.locator('#wand [data-ongedaan]').click(kort);
    await expect.poll(() => layoutStore.current?.apparaten['cover.screen']?.gevel, kort).toBeUndefined();

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
    // De pagina tekent opnieuw zodra alles binnen is; eerst rustig laten worden, en
    // klikt het toch net tijdens het tekenen, dan nog eens (in de CI eens misgegaan).
    await p.waitForLoadState('networkidle');
    const soortNu = () => layoutStore.current?.kamers.find((k) => k.id === tuin.id)?.buiten?.soort;
    await expect
      .poll(async () => {
        if (soortNu() !== 'terras') await p.locator('#wand [data-buiten="soort"]', { hasText: 'Terras' }).click({ timeout: 1500 }).catch(() => undefined);
        return soortNu();
      }, { timeout: 10_000 })
      .toBe('terras');
    await expect.poll(() => layoutStore.current?.kamers.find((k) => k.id === tuin.id)?.buiten?.soort, kort).toBe('terras');
    await p.locator('#wand [data-buiten="soort"][aria-pressed="true"]', { hasText: 'Terras' }).waitFor(kort);
    expect(fouten).toEqual([]);
    await context.close();
  }, 30_000);

  /*
   * Inloggen via Home Assistant op een andere site (16 oktober 2026): na het
   * inloggen kom je echt binnen. Het cookie is SameSite=Strict, en ging bij een
   * doorverwijzing vanaf de site van Home Assistant niet mee: dan stond je
   * weer bij het inloggen.
   */
  it('laat je na het inloggen bij Home Assistant echt binnen, ook vanaf een andere site', async () => {
    // Het nagemaakte Home Assistant, op localhost: voor de browser een andere site dan 127.0.0.1.
    const ha = createServer((req, res) => {
      const state = new URL(req.url ?? '/', 'http://localhost').searchParams.get('state') ?? '';
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<script>location.href = ${JSON.stringify(`${baseUrl}/auth/callback?code=abc&state=`)} + ${JSON.stringify(state)};</script>`);
    });
    await new Promise<void>((r) => ha.listen(0, 'localhost', () => r()));
    const vorige = haInlog;
    haInlog = `http://localhost:${(ha.address() as { port: number }).port}/`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, zonderInlog: true } as BrowserContextOptions);
    await context.route((url) => !url.href.startsWith(baseUrl) && url.hostname !== 'localhost', (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/vandaag.html`);
    await p.waitForURL(/\/inloggen\.html/);
    await p.locator('a', { hasText: 'Inloggen met Home Assistant' }).click();
    await p.waitForURL(/\/vandaag\.html$/, { timeout: 10_000 });
    await p.waitForTimeout(800);
    expect(new URL(p.url()).pathname).toBe('/vandaag.html');
    await context.close();
    haInlog = vorige;
    ha.close();
  }, 30_000);

  it('stuurt wie niet is ingelogd naar het inloggen, en van daar naar Home Assistant (besluit 99 en 147)', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, zonderInlog: true } as BrowserContextOptions);
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    // De hele app vraagt een inlog: een pagina gaat naar het inloggen, met de weg terug.
    await p.goto(`${baseUrl}/toegang.html`);
    await p.waitForURL(/\/inloggen\.html\?terug=%2Ftoegang\.html$/);
    const inlog = p.locator('a', { hasText: 'Inloggen met Home Assistant' });
    await inlog.waitFor();
    // Zonder te volgen: de dienst stuurt door naar het inlogscherm van Home Assistant.
    const go = p.waitForRequest((r) => new URL(r.url()).pathname === '/auth/login');
    await inlog.click();
    expect(new URL((await go).url()).searchParams.get('terug')).toBe('/toegang.html');
    await context.close();
  }, 20_000);

  /*
   * Bewoners (besluit 147): de eerste inlog als scherm en als bewoner, de
   * pagina Bewoners, Thuis met de begroeting en het comfort dat geldt, en
   * Comfort van een ander.
   */
  it('laat bewoners binnen bij hun eerste inlog, en toont wie er thuis is en wiens comfort geldt', async () => {
    const shot = async (pp: Page, naam: string) => {
      if (process.env.HEMS_PAGE_SHOT) await pp.screenshot({ path: process.env.HEMS_PAGE_SHOT.replace('.png', `-${naam}.png`) });
    };
    const kort = { timeout: 5000 };
    await bewonersStore.save(GEEN_BEWONERS);

    // De wand: een account zonder persoon kiest "Dit is een scherm" en wordt geen bewoner.
    const wandSessie = await sessions.create({ userId: 'u-wand', naam: 'Wand', rol: 'bewoner' });
    const wand = await browser.newContext({ viewport: { width: 1280, height: 800 }, zonderInlog: true } as BrowserContextOptions);
    await wand.addCookies([{ name: 'hems_sessie', value: wandSessie, url: baseUrl }]);
    await wand.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const w = await wand.newPage();
    await w.goto(`${baseUrl}/welkom.html?terug=%2Fthuis.html#vraag`);
    await w.locator('h1', { hasText: 'Woon je hier, of is dit een scherm?' }).waitFor();
    await shot(w, 'welkom-vraag');
    await w.locator('[data-keus="scherm"]').click();
    await w.locator('[data-verder]').click();
    await w.waitForURL(/\/thuis\.html$/);
    expect(bewonersStore.current.schermen['u-wand']?.naam).toBe('Wand');
    expect(bewonersStore.current.volgorde).toEqual([]);

    // De beheerder ("Test") woont hier: hij kiest wat hem volgt, en wordt de eerste, dus hoofdgebruiker.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await ctx.newPage();
    await p.goto(`${baseUrl}/welkom.html?terug=%2Fbewoners.html#vraag`);
    await p.locator('[data-keus="bewoner"]').click();
    await p.locator('[data-verder]').click();
    await p.locator('h1', { hasText: 'Welke sensor ziet of je thuis bent?' }).waitFor();
    await p.locator('[data-bron="ricardo"]').click();
    await p.locator('[data-klaar]').click();
    await p.locator('h1', { hasText: 'Welkom, Test' }).waitFor();
    await shot(p, 'welkom');
    await p.locator('[data-naam]').fill('Ricardo');
    await p.locator('[data-klopt]').click();
    await p.waitForURL(/\/bewoners\.html$/);
    await expect.poll(() => bewonersStore.current.bewoners['test']?.naam, kort).toBe('Ricardo');
    expect(bewonersStore.current.bewoners['test']).toMatchObject({ aanwezigheid: 'ricardo', comfort: 'volgt' });

    // Shira logt later in; zij volgt eerst Ricardo.
    await bewonersStore.save(voegToe(bewonersStore.current, { userId: 'u-shira', naam: 'Shira Cornelissen' }, 'shira', Date.now()));
    await p.reload();
    const wandL = p.locator('#wand');
    await wandL.locator('[data-lijst] [data-rij]').nth(1).waitFor();
    expect(await wandL.locator('[data-lijst] [data-rij] b').allTextContents()).toEqual(['Ricardo (jij)', 'Shira']);
    await wandL.locator('[data-kies="shira"]').click();
    await wandL.locator('[data-blad] h2', { hasText: 'Shira' }).waitFor();
    await wandL.locator('[data-blad] [data-comfort="eigen"]').click();
    await expect.poll(() => bewonersStore.current.bewoners['shira']?.comfort, kort).toBe('eigen');
    // De volgorde met het greepje en de pijltjes: Shira omhoog maakt haar hoofdgebruiker; en weer terug.
    await wandL.locator('[data-greep="shira"]').focus();
    await p.keyboard.press('ArrowUp');
    await expect.poll(() => bewonersStore.current.volgorde, kort).toEqual(['shira', 'test']);
    await wandL.locator('[data-greep="test"]').focus();
    await p.keyboard.press('ArrowUp');
    await expect.poll(() => bewonersStore.current.volgorde, kort).toEqual(['test', 'shira']);
    await shot(p, 'bewoners');
    expect(await p.evaluate<boolean>('document.documentElement.scrollHeight <= innerHeight + 1')).toBe(true);
    // Op de telefoon: alles onder elkaar, niets zijwaarts buiten beeld.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('#tel [data-lijst] [data-rij]').nth(1).waitFor();
    expect(await p.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth + 1')).toBe(true);
    await shot(p, 'bewoners-tel');
    await p.setViewportSize({ width: 1280, height: 800 });

    // Thuis: Ricardo is weg, Shira is thuis. De begroeting noemt wie er ingelogd is, en het strookje wiens comfort geldt.
    const voor = live;
    live = { ...live, explanation: { ...live.explanation, profile: { id: 'shira', name: 'Shira', reason: 'thuis', home: ['shira'] } } };
    await p.goto(`${baseUrl}/thuis.html`);
    await wandL.locator('[data-groet]', { hasText: 'Ricardo' }).waitFor();
    const strook = wandL.locator('[data-geldt]');
    await strook.locator('b', { hasText: 'Comfort van Shira' }).waitFor();
    await shot(p, 'thuis-geldt');
    await strook.locator('[data-vasthouden]', { hasText: 'Toch die van Ricardo' }).click();
    await expect.poll(() => bewonersStore.current.vasthouden, kort).toMatchObject({ id: 'test', home: ['shira'] });

    // Comfort van Shira, bekeken door de hoofdgebruiker: met de keuze wiens comfort.
    await p.goto(`${baseUrl}/comfort.html?bewoner=shira`);
    await wandL.locator('[data-titel]', { hasText: 'Comfort van Shira' }).waitFor();
    expect(await wandL.locator('[data-wie] option').count()).toBe(2);
    await shot(p, 'comfort-shira');

    // Een gast (besluit 147): Shira wordt gast. Ze staat dan bij Schermen en gasten, niet in de volgorde.
    await p.goto(`${baseUrl}/bewoners.html#shira`);
    await wandL.locator('[data-blad] [data-gast="ja"]').click();
    await expect.poll(() => bewonersStore.current.bewoners['shira']?.gast, kort).toBe(true);
    expect(bewonersStore.current.volgorde).toEqual(['test']);
    await wandL.locator('[data-schermen] .gastrij', { hasText: 'Shira' }).waitFor();
    await shot(p, 'bewoners-gast');
    // Als gast: bedienen alleen thuis, en verder niets.
    const gastSessie = await sessions.create({ userId: 'u-shira', naam: 'Shira Cornelissen', rol: 'beheerder' });
    const alsGast = (pad: string, body: unknown) => fetch(`${baseUrl}${pad}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: baseUrl, cookie: `hems_sessie=${gastSessie}` }, body: JSON.stringify(body) });
    const lamp = { doel: 'huis', id: null, aan: false };
    const weg = await alsGast('/api/licht', lamp);
    expect(weg.status).toBe(403);
    expect(((await weg.json()) as { fout: string }).fout).toMatch(/thuis/);
    expect((await alsGast('/api/comfort', { kamers: {} })).status).toBe(403);
    expect((await alsGast('/api/bewoners', { actie: 'naam', id: 'shira', naam: 'S' })).status).toBe(403);
    houseStates.set('person.shira', { entity_id: 'person.shira', state: 'home', attributes: { friendly_name: 'Shira' }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() });
    try {
      expect((await alsGast('/api/licht', lamp)).status).not.toBe(403);
    } finally {
      houseStates.delete('person.shira');
    }
    expect((await fetch(`${baseUrl}/api/export`, { headers: { cookie: `hems_sessie=${gastSessie}` } })).status).toBe(403);

    // Een scherm beheren (besluit 149): de wand een andere naam geven, en weghalen.
    await p.goto(`${baseUrl}/bewoners.html`);
    await wandL.locator('[data-schermen] [data-kies="scherm:u-wand"]').click();
    const schermNaam = wandL.locator('[data-blad] [data-schermnaam]');
    await schermNaam.waitFor();
    await shot(p, 'bewoners-scherm');
    await schermNaam.fill('Tablet hal');
    await schermNaam.evaluate((el) => (el as unknown as { blur: () => void }).blur());
    await expect.poll(() => bewonersStore.current.schermen['u-wand']?.naam, kort).toBe('Tablet hal');
    expect(bewonersStore.current.schermen['u-wand']?.haNaam).toBe('Wand');
    p.once('dialog', (d) => void d.accept());
    await wandL.locator('[data-blad] [data-schermweg]').click();
    await expect.poll(() => bewonersStore.current.schermen['u-wand'], kort).toBeUndefined();

    // De inlogpagina, voor wie nog niet is ingelogd: alleen een huis als silhouet en de knop.
    const buiten = await browser.newContext({ viewport: { width: 1280, height: 800 }, zonderInlog: true } as BrowserContextOptions);
    await buiten.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const b = await buiten.newPage();
    await b.goto(`${baseUrl}/thuis.html`);
    await b.locator('a', { hasText: 'Inloggen met Home Assistant' }).waitFor();
    expect(await b.locator('body').textContent()).not.toMatch(/Ricardo|Shira|kWh/);
    await shot(b, 'inloggen');
    await buiten.close();

    live = voor;
    await bewonersStore.save(startBewoners);
    await wand.close();
    await ctx.close();
  }, 60_000);

  /* Een versienummer, en wat er nieuw is (besluit 131). */
  it('toont de versie en wat er nieuw is', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route((url) => !url.href.startsWith(baseUrl), (route) => route.abort());
    const p = await context.newPage();
    await p.goto(`${baseUrl}/toegang.html#versie`);
    const vorm = p.locator('#wand [data-vorm]');
    await vorm.locator('h2', { hasText: `Versie ${VERSIE}` }).waitFor();
    expect(await vorm.locator('.nieuw').first().textContent()).toContain(`Versie ${VERSIE}`);
    // Alleen de nieuwste open (besluit 133), en hooguit tien.
    expect(await vorm.locator('details.nieuw[open]').count()).toBe(1);
    expect(await vorm.locator('details.nieuw').count()).toBeLessThanOrEqual(10);
    expect(await vorm.locator('details.nieuw[open] .soort').count()).toBeGreaterThan(0);
    expect(await vorm.textContent()).not.toMatch(/NAS/);
    await context.close();
  }, 20_000);
});
