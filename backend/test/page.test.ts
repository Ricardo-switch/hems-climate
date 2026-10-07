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
import { EnergyStore, type EnergySource } from '../src/web/energy.js';

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
    { id: 'sensor.afname', naam: 'P1 afname', soort: 'energy' },
    { id: 'sensor.terug', naam: 'P1 teruglevering', soort: 'energy' },
    { id: 'sensor.zon', naam: 'SolarEdge opgewekt', soort: 'energy' },
    { id: 'sensor.airco', naam: 'Airco woonkamer energie', soort: 'energy' },
    { id: 'sensor.gas', naam: 'Gasmeter', soort: 'volume' },
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
  const sessions = new SessionStore();
  let sessionId = '';
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
          uitstel,
          energy: { store: energyStore, source: ENERGY_SOURCE },
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
      const size = await wheel.evaluate((e) => e.clientWidth);
      await wheel.click({ position: { x: size * 0.95, y: size / 2 } });
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
      expect(await p.locator('#hu-blad .scenes button[aria-pressed="true"]').textContent()).toBe('Ontspannen');
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

      // De eigen lettertypen zijn geladen, en er ging niets naar buiten.
      const fonts = await p.evaluate("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('\"', '')))");
      expect(fonts).toEqual(expect.arrayContaining(['Figtree', 'Bricolage Grotesque']));
      expect(outside).toEqual([]);
      await context.close();
    }, 30_000);
  }

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
  });
});
