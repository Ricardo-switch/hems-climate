/**
 * Opbrengst, vandaag, de zon en het weer (besluiten 71, 102, 105 en 125).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import type { ServerResponse } from 'node:http';
import type { SiteConfig } from '../../core/model.js';
import { TodayCache, todayInLang, withHistory } from '../today.js';
import { SolarHistory, learnSolar } from '../solar-learn.js';
import { PERIODS, periodRange, yearStartOf, yieldReport, type PeriodKind, type YieldReport } from '../yield.js';
import { partsIn, zonedMidnight } from '../today.js';
import type { AskContext, Lang } from '../assistant.js';
import { sunReport } from '../sun.js';
import { expectedAndActual, expectedTotal, weatherInLang, type ExpectedTotal } from '../weather.js';
import { startOfLocalDay } from '../today.js';
import { sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function opbrengstRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path } = v;
  const logDir = d.options.logDir;
  if (path === '/api/opbrengst') {
    await opbrengstRoute(d, res, url.searchParams, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']));
    return true;
  }

  /*
   * Vandaag, voor de bewonersweergave (besluit 71): de zon per kwartier,
   * wanneer elk apparaat draaide en de besluiten van vandaag. Leest het
   * logboek, dus alleen waar er gelogd wordt.
   */
  if (path === '/api/vandaag') {
    const config = d.config();
    if (logDir == null || config == null) {
      sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er is geen dag om te tonen' });
      return true;
    }
    d.today ??= new TodayCache(logDir, config);
    try {
      // ?dag=gisteren: de hele dag ervoor, in dezelfde vorm.
      const gisteren = url.searchParams.get('dag') === 'gisteren';
      let rapport = await (gisteren ? d.today.yesterday() : d.today.get());
      // Kwartieren zonder eigen meting uit de statistiek van Home Assistant (17 oktober 2026).
      const historie = d.options.historie;
      if (historie && rapport.kwartieren.some((q) => q.zonW == null || q.netW == null)) {
        const h = await historie(rapport.vanMs, rapport.totMs).catch(() => null);
        if (h) rapport = withHistory(rapport, h.zon, h.net);
      }
      sendJson(res, 200, todayInLang(rapport, config, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    } catch (error) {
      sendJson(res, 500, { fout: (error as Error).message });
    }
    return true;
  }

  /*
   * De zoninval (besluit 93): waar de zon staat, op welke gevel hij valt, en
   * wat de panelen bij een heldere lucht zouden leveren.
   */
  if (path === '/api/zon') {
    const config = d.config();
    const location = d.options.location?.() ?? null;
    if (config?.geometry == null || location == null) {
      sendJson(res, 503, {
        wachten:
          config?.geometry == null
            ? 'de ligging van het huis en de panelen is nog niet bekend'
            : 'de ligging van het huis komt van Home Assistant zodra die verbonden is',
      });
      return true;
    }
    // Wat de panelen werkelijk halen, geleerd uit de afgesloten dagen van het
    // logboek. Zonder logboek, of als dat lezen faalt, blijft het een schatting.
    let learned = null;
    if (logDir != null) {
      d.solar ??= new SolarHistory({ logDir });
      try {
        await d.solar.refresh();
      } catch {
        // Dan met wat er al was.
      }
      learned = learnSolar(d.solar.current, config.geometry, location);
    }
    const now = Date.now();
    sendJson(res, 200, sunReport(config.geometry, location, now, startOfLocalDay(now, config.timezone), learned));
    return true;
  }

  /*
   * Het weer van de komende dagen (besluit 105), met wat de panelen dan
   * ongeveer leveren. Alleen om te tonen; de regeling gebruikt het niet.
   */
  if (path === '/api/weer') {
    const uit = await d.weatherNow();
    if ('wachten' in uit) sendJson(res, 503, uit);
    else sendJson(res, 200, weatherInLang(uit, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    return true;
  }

  return false;
}

export async function opbrengstRoute(d: Diensten, res: ServerResponse, params: URLSearchParams, lang: Lang): Promise<void> {
  const energy = d.options.energy;
  const config = d.config();
  if (energy == null || config == null) {
    sendJson(res, 503, { wachten: 'Opbrengst staat niet aan' });
    return;
  }
  const settings = energy.store.current;
  if (settings == null) {
    sendJson(res, 409, { fout: 'er zijn nog geen meters ingesteld', instellen: true });
    return;
  }
  const soort = (params.get('soort') ?? 'maand') as PeriodKind;
  if (!PERIODS.includes(soort)) {
    sendJson(res, 400, { fout: `soort is ${PERIODS.join(', ')}` });
    return;
  }
  const now = Date.now();
  const today = partsIn(now, config.timezone);
  const vandaag = `${today.y}-${String(today.m).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;
  const datum = params.get('datum') ?? vandaag;
  const range = periodRange(soort, datum, config.timezone, yearStartOf(settings.prijzen.contractStart));
  if (range == null) {
    sendJson(res, 400, { fout: 'datum is een dag als "2026-10-07"' });
    return;
  }
  // Per taal (besluit 185): de namen van de periode en de kostenregels staan erin.
  const key = `${soort}:${range.startMs}:${lang}`;
  const hit = d.yieldCache.get(key);
  // Klaar is klaar: uitgerekend na het einde van de periode.
  const fresh = (h: { atMs: number; report: YieldReport }) => h.atMs >= h.report.periode.totMs || now - h.atMs < 120_000;
  // Verwacht naast echt over de dagen van de periode (besluit 137); los van de statistiek.
  const verwacht = await expectedIn(d, range.startMs, range.endMs, config.timezone).catch(() => null);
  if (hit) {
    sendJson(res, 200, { ...hit.report, verwacht });
    if (!fresh(hit)) void yieldCompute(d, key, soort, datum, now, lang).catch(() => null);
    yieldWarm(d, vandaag, lang);
    return;
  }
  try {
    const report = await yieldCompute(d, key, soort, datum, now, lang);
    if (report == null) {
      sendJson(res, 400, { fout: 'datum is een dag als "2026-10-07"' });
      return;
    }
    sendJson(res, 200, { ...report, verwacht });
    yieldWarm(d, vandaag, lang);
  } catch (error) {
    sendJson(res, 502, { fout: `Home Assistant gaf de statistiek niet: ${(error as Error).message}` });
  }
}

/**
 * Wat de dag ervoor werd verwacht en wat de panelen leverden, opgeteld over
 * de afgesloten dagen tussen twee momenten (besluit 137). Null zonder weer of
 * zonder zulke dagen.
 */
export async function expectedIn(d: Diensten, vanMs: number, totMs: number, timeZone: string): Promise<ExpectedTotal | null> {
  const weather = d.options.weather;
  const logDir = d.options.logDir;
  if (weather == null || logDir == null) return null;
  await weather.log.load();
  if (Object.keys(weather.log.expected).length === 0) return null;
  d.solar ??= new SolarHistory({ logDir });
  if (Object.keys(d.solar.current).length === 0) await d.solar.refresh().catch(() => undefined);
  const p = partsIn(Date.now(), timeZone);
  const today = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  const binnen = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    const middag = zonedMidnight(y!, m!, d!, timeZone) + 12 * 3_600_000;
    return day < today && middag >= vanMs && middag < totMs;
  };
  return expectedTotal(expectedAndActual(weather.log.expected, weather.log.current, d.solar.current, binnen));
}

/** Rekent één periode uit, één keer tegelijk per periode, en bewaart hem. */
export function yieldCompute(d: Diensten, key: string, soort: PeriodKind, datum: string, now: number, lang: Lang = 'nl'): Promise<YieldReport | null> {
  const busy = d.yieldBusy.get(key);
  if (busy) return busy;
  const energy = d.options.energy!;
  const config = d.config()!;
  const settings = energy.store.current!;
  const job = yieldReport(energy.source, settings, soort, datum, config.timezone, now, lang)
    .then((report) => {
      if (report != null) {
        // Hooguit honderd periodes; de oudste eruit.
        if (d.yieldCache.size >= 100) d.yieldCache.delete(d.yieldCache.keys().next().value!);
        d.yieldCache.delete(key);
        d.yieldCache.set(key, { atMs: now, report });
      }
      return report;
    })
    .finally(() => d.yieldBusy.delete(key));
  d.yieldBusy.set(key, job);
  return job;
}

/** Wat de apparaten met een eigen meter deze maand kostten, voor de assistent (besluit 142). */
export async function kostenDezeMaand(d: Diensten, config: SiteConfig, lang: Lang = 'nl'): Promise<NonNullable<AskContext['kosten']> | null> {
  const settings = d.options.energy?.store.current;
  if (settings == null) return null;
  const now = Date.now();
  const p = partsIn(now, config.timezone);
  const datum = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  const range = periodRange('maand', datum, config.timezone, yearStartOf(settings.prijzen.contractStart));
  if (range == null) return null;
  // De naam van de maand komt uit het rapport, in de taal van de vraag.
  const key = `maand:${range.startMs}:${lang}`;
  const hit = d.yieldCache.get(key);
  const report = hit && now - hit.atMs < 600_000 ? hit.report : await yieldCompute(d, key, 'maand', datum, now, lang);
  if (report == null) return null;
  const eerste = report.periode.label.split(' ')[0]!;
  // Een maand midden in een zin: in het Nederlands klein, in het Engels met een hoofdletter.
  const maand = lang === 'nl' ? eerste.toLowerCase() : eerste;
  // Een apparaat heet zoals in de app, niet zoals zijn meter (het klimaatapparaat bij die meter).
  const apparaten = (d.options.house?.()?.etages ?? []).flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten);
  const naamVan = (meter: string, terug: string) => apparaten.find((d) => d.klimaat?.energieMeter === meter)?.naam ?? terug;
  return { maand, apparaten: report.apparaten.filter((a) => !a.rest).map((a) => ({ id: a.id, naam: naamVan(a.id, a.naam), kwh: a.kwh, zonKwh: a.zonKwh, euro: a.kosten })) };
}

/** Na een vraag: de andere periodes van vandaag alvast uitrekenen, op de achtergrond. */
export function yieldWarm(d: Diensten, vandaag: string, lang: Lang): void {
  const config = d.config();
  const settings = d.options.energy?.store.current;
  if (config == null || settings == null) return;
  const now = Date.now();
  for (const soort of PERIODS) {
    const range = periodRange(soort, vandaag, config.timezone, yearStartOf(settings.prijzen.contractStart));
    if (range == null) continue;
    const key = `${soort}:${range.startMs}:${lang}`;
    const hit = d.yieldCache.get(key);
    if (hit && (hit.atMs >= hit.report.periode.totMs || now - hit.atMs < 120_000)) continue;
    void yieldCompute(d, key, soort, vandaag, now, lang).catch(() => null);
  }
}
