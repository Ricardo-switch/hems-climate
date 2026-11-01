/**
 * Opbrengst, vandaag, de zon en het weer (besluiten 71, 102, 105 en 125).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import type { ServerResponse } from 'node:http';
import type { SiteConfig } from '../../core/model.js';
import { todayInLang } from '../today.js';
import { SolarHistory, learnSolar } from '../solar-learn.js';
import { PERIODS, periodRange, yearStartOf, yieldReport, type PeriodKind, type YieldReport } from '../yield.js';
import { partsIn, zonedMidnight } from '../today.js';
import type { AskContext, Lang } from '../assistant.js';
import { sunReport } from '../sun.js';
import { expectedAndActual, expectedTotal, weatherInLang, type ExpectedTotal } from '../weather.js';
import { startOfLocalDay } from '../today.js';
import { readJson, sendJson } from '../http.js';
import { leesToelichting } from '../sluipverbruik.js';
import { isDal } from '../tarief.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';
import { accuJaar } from '../accu.js';
import { ThermischLeer } from '../thermisch.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function opbrengstRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path } = v;
  const logDir = d.options.logDir;
  if (path === '/api/opbrengst') {
    await opbrengstRoute(d, res, url.searchParams, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']));
    return true;
  }

  /*
   * De goedkope uren van vandaag (besluit 196): de daluren van het contract,
   * per uur, met beide prijzen. Leeg zonder daltarief.
   */
  if (path === '/api/goedkoop') {
    const config = d.config();
    if (config == null) {
      sendJson(res, 503, { wachten: 'nog geen configuratie' });
      return true;
    }
    sendJson(res, 200, goedkoopVandaag(config.timezone, d.options.energy?.store.current?.prijzen ?? null, Date.now()));
    return true;
  }

  /*
   * Een thuisbatterij op je eigen uren (besluit 230): het afgelopen jaar per
   * uur nagerekend, welke maat past en wanneer hij bijsprong. Een jaar per uur
   * is zwaar, dus een paar uur bewaard.
   */
  if (path === '/api/accu') {
    const config = d.config();
    const energy = d.options.energy;
    const settings = energy?.store.current;
    if (config == null || energy == null || settings == null) {
      sendJson(res, 503, { wachten: 'Opbrengst staat niet aan' });
      return true;
    }
    const now = Date.now();
    const sleutel = JSON.stringify(settings.net);
    if (d.accu?.sleutel !== sleutel || now - d.accu.atMs > 6 * 3_600_000) {
      try {
        d.accu = { sleutel, atMs: now, som: await accuJaar(energy.source, settings, config.timezone, now) };
      } catch (error) {
        sendJson(res, 502, { fout: `Home Assistant gaf de statistiek niet: ${(error as Error).message}` });
        return true;
      }
    }
    if (d.accu.som == null) sendJson(res, 404, { fout: 'er ging niets naar het net, dus een batterij heeft niets te bewaren' });
    else sendJson(res, 200, d.accu.som);
    return true;
  }

  /*
   * Het sluipverbruik (besluit 192): elke nacht, het gemiddelde, wat het kost,
   * en wat opviel. POST bewaart wat de bewoner over een reeks zegt (besluit 88).
   */
  if (path === '/api/sluipverbruik') {
    const s = d.options.sluipverbruik;
    if (s == null) {
      sendJson(res, 503, { wachten: 'zonder slimme meter is er geen sluipverbruik' });
      return true;
    }
    if (v.method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return true;
      }
      const t = leesToelichting(body);
      if (!t.ok) {
        sendJson(res, 400, { fout: t.reden });
        return true;
      }
      await s.zeg(t.toelichting);
    }
    const rapport = await s.rapport().catch(() => null);
    if (rapport == null) {
      sendJson(res, 503, { wachten: 'nog geen week aan nachten van de slimme meter' });
      return true;
    }
    sendJson(res, 200, rapport);
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
    try {
      // ?dag=gisteren: de hele dag ervoor, in dezelfde vorm. Kwartieren zonder eigen meting uit Home Assistant.
      const rapport = await d.vandaag(url.searchParams.get('dag') === 'gisteren');
      if (rapport == null) throw new Error('geen logboek');
      sendJson(res, 200, todayInLang(rapport, config, taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    } catch (error) {
      sendJson(res, 500, { fout: (error as Error).message });
    }
    return true;
  }

  /*
   * Hoe je huis warmte vasthoudt (besluit 231): per zone hoe snel hij afkoelt,
   * wat de zon doet en wat elk apparaat doet, uit het logboek. Eén keer per dag
   * uitgerekend; de eerste keer duurt het een paar seconden.
   */
  if (path === '/api/thermisch') {
    const config = d.config();
    if (logDir == null || config == null) {
      sendJson(res, 503, { wachten: 'er wordt niet gelogd, dus er is niets om van te leren' });
      return true;
    }
    d.thermisch ??= new ThermischLeer({ logDir });
    try {
      sendJson(res, 200, await d.thermisch.bijwerken(config));
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

/** Wat de apparaten met een eigen meter en het hele huis deze maand kostten, voor de assistent (besluit 142). */
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
  // Het hele huis (29 oktober 2026): stroom met de teruglevering ervan af, en gas, uit de regels van Opbrengst.
  const som = (soorten: readonly string[]) => {
    const r = report.kosten.regels.filter((x) => soorten.includes(x.soort));
    return r.length === 0 || r.some((x) => x.euro == null && x.soort !== 'terug') ? null : Math.round(r.reduce((t, x) => t + (x.euro ?? 0), 0) * 100) / 100;
  };
  const huis = report.heeft.net
    ? { stroomEuro: som(['stroom', 'normaal', 'dal', 'terug', 'terug-na']), gasEuro: report.heeft.gas ? som(['gas']) : null, totaalEuro: report.kosten.totaal, vanNetKwh: report.stroom.vanNetKwh, terugKwh: report.stroom.terugKwh }
    : undefined;
  return { maand, apparaten: report.apparaten.filter((a) => !a.rest).map((a) => ({ id: a.id, naam: naamVan(a.id, a.naam), kwh: a.kwh, zonKwh: a.zonKwh, euro: a.kosten })), ...(huis ? { huis } : {}) };
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

/** De daluren van vandaag, per uur (besluit 196); `dal` is leeg zonder daltarief. */
export function goedkoopVandaag(
  timeZone: string,
  prijzen: { readonly stroom?: number | null; readonly stroomDal?: number | null; readonly dalUren?: Parameters<typeof isDal>[2]; readonly dalEigen?: Parameters<typeof isDal>[3] } | null,
  nowMs: number,
): { dagStartMs: number; dal: boolean[]; normaal: number | null; dalPrijs: number | null } {
  const p = partsIn(nowMs, timeZone);
  const start = zonedMidnight(p.y, p.m, p.d, timeZone);
  const dalPrijs = prijzen?.stroomDal ?? null;
  // Een dag met de klokwissel heeft 23 of 25 uur; per uur vanaf middernacht tot de volgende.
  const eind = zonedMidnight(...(() => { const q = partsIn(start + 30 * 3_600_000, timeZone); return [q.y, q.m, q.d] as const; })(), timeZone);
  const dal: boolean[] = [];
  if (dalPrijs != null) for (let t = start; t < eind; t += 3_600_000) dal.push(isDal(t, timeZone, prijzen?.dalUren ?? 'nl', prijzen?.dalEigen ?? null));
  return { dagStartMs: start, dal, normaal: prijzen?.stroom ?? null, dalPrijs };
}
