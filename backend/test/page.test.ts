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
  const pageErrors: string[] = [];
  const lightCalls: string[] = [];
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  beforeAll(async () => {
    expect(existsSync(join(WEB_DIR, 'app.js')), 'eerst de weergave bouwen: npm run build in frontend/').toBe(true);

    dir = await mkdtemp(join(tmpdir(), 'hems-page-'));
    await writeLogs(dir);
    const review = new DivergenceCache({ logDir: dir, write: () => {}, now: () => Date.parse('2026-10-01T00:30:00Z') });
    await review.refresh();
    live = await liveSnapshot();
    layoutStore = new LayoutStore({ logDir: dir, known: () => knownForLayout(exampleSite, houseRegisters, houseStates) });

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
            call: async (service, ids) => {
              lightCalls.push(`${service} ${ids.join(',')}`);
            },
          }),
          version: { commit: 'bbbbbbb', gebouwd: '2026-09-30T12:00:00Z' },
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

    const channel = process.env['HEMS_PAGE_BROWSER'];
    browser = await chromium.launch(channel ? { channel } : {});
    // UTC, net als de rest van de suite in de CI: de tijdlijn en de
    // versiemarkering rekenen dan in dezelfde dagen.
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'nl-NL' });
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
      // De lettertypen komen van buiten; zonder internet in de test is dat geen fout van de pagina.
      await p.route('https://fonts.googleapis.com/**', (r) => r.abort());
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
      // Op de plek, niet op de naam: het indelen hieronder hernoemt de etage.
      await p.locator('#hu-lijst a.room[href="#huis/etage/bg"]').click();
      await p.locator('#hu-titel').filter({ hasNotText: 'Het huis' }).waitFor();
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
      // In de kamer: het blad van de plafonnière. Hij brandt, dus de schakelaar zet hem uit; warm wit weer aan.
      await p.locator('#hu-lijst .tegel', { hasText: 'Plafonnière' }).click();
      await p.locator('#hu-blad [role="switch"]').click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'gaat uit' }).waitFor();
      expect(lightCalls.at(-1)).toBe('turn_off light.woonkamer_plafonniere');
      // Na een lamp ververst het huis zich even later; dat mag het antwoord op de
      // volgende knop niet wissen (de CI ving dat, 7 oktober).
      const refreshed = p.waitForResponse((r) => new URL(r.url()).pathname === '/api/huis');
      await p.locator('#hu-blad-knoppen button', { hasText: 'Warm' }).click();
      await p.locator('#hu-blad-zin').filter({ hasText: 'warm wit' }).waitFor();
      expect(lightCalls.at(-1)).toBe('turn_on light.woonkamer_plafonniere');
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
      // Terug is uitzoomen.
      await p.locator('#hu-terug').click();
      await p.locator('#hu-titel').filter({ hasNotText: 'Woonkamer' }).waitFor();
      expect(p.url()).toContain('#huis/etage/bg');

      // Indelen (besluit 96): het voorstel uit Home Assistant aanpassen. Eén keer,
      // in de eerste stand: daarna is de indeling eigen.
      if (stand === 'portret') {
        await p.goto(`${baseUrl}/nieuw.html#huis`);
        await p.locator('#hu-lijst button', { hasText: 'Indeling bewerken' }).click();
        const etage = p.getByLabel('Naam van Begane grond');
        await etage.fill('Beneden');
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

      // De terugblik op zijn eigen tabblad, met het percentage uit dezelfde bron als index.html.
      await p.goto(`${baseUrl}/nieuw.html#opbrengst`);
      await p.locator('#o-hero .big').waitFor();
      expect(await p.locator('#o-hero').textContent()).toMatch(/kWh/);
      await context.close();
    }, 30_000);
  }
});
