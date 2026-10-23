/**
 * De assistent: vragen, de stem, Assist en het taalmodel (besluiten 141, 148 en 184).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { assistKamers } from '../assist.js';
import { TodayCache } from '../today.js';
import { ask, LANGS, parseQuestion } from '../assistant.js';
import type { Lang, Question } from '../assistant.js';
import { uitspraak } from '../uitspraak.js';
import { afsluiter, begrijp, isRuis, MAX_TEKST } from '../woordzoeker.js';
import { bedienbaar, herkenOpdracht, type Herkend } from '../opdracht.js';
import { inEigenWoorden, kies, PROEF_MS, WACHT_MS, type Vraag } from '../taalmodel.js';
import { sunReport } from '../sun.js';
import { weatherInLang } from '../weather.js';
import { startOfLocalDay } from '../today.js';
import { MAX_ZEG } from '../stem.js';
import { sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';
import { kostenDezeMaand } from './opbrengst.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function assistentRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path } = v;
  const logDir = d.options.logDir;
  /*
   * De assistent die uitlegt (ONTWERP §7, fase 1): een vaste vraag, een
   * antwoord in woorden uit het laatste besluit. Leest alleen, ook voor
   * "zet de zolder op 21"; de muur hierboven blijft staan.
   */
  // De stem (besluit 141): het geluid van een zin, of welke stem er is.
  if (path === '/api/stem') {
    const stem = d.options.stem;
    const tekst = url.searchParams.get('tekst');
    // In de taal van de app (besluit 185).
    const lang = taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']);
    if (tekst == null) {
      // Welke stem, en of die de taal van de app kan; zonder gebruikt de pagina de stem van het apparaat.
      const t = stem ? await stem.taalVoor(lang).catch(() => ({ taal: null, voice: null })) : { taal: null, voice: null };
      sendJson(res, 200, { stem: stem?.naam ?? null, taal: t.taal, voice: t.voice });
      return true;
    }
    if (stem == null || stem.naam == null) {
      sendJson(res, 404, { fout: 'er is geen lokale stem in Home Assistant' });
      return true;
    }
    if (tekst.trim() === '' || tekst.length > MAX_ZEG) {
      sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_ZEG} tekens zijn` });
      return true;
    }
    try {
      const g = await stem.zeg(tekst, lang);
      res.writeHead(200, { 'content-type': g.type, 'content-length': g.data.length, 'cache-control': 'private, max-age=3600' });
      res.end(g.data);
    } catch (error) {
      sendJson(res, 502, { fout: (error as Error).message });
    }
    return true;
  }

  /*
   * Voor de integratie in Home Assistant (besluit 184): de kamers en de
   * woorden waarmee je ze noemt, zodat Assist ze in elk huis herkent. Met
   * dezelfde sleutel als de vragen; er staat geen entiteit in.
   */
  if (path === '/api/assist') {
    const config = d.config();
    if (config == null) {
      sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
      return true;
    }
    sendJson(res, 200, assistKamers(config, d.options.house?.() ?? null, d.options.version?.nummer ?? null));
    return true;
  }

  if (path === '/api/vraag') {
    const config = d.config();
    if (config == null) {
      sendJson(res, 503, { wachten: 'nog geen installatie ingesteld' });
      return true;
    }
    // Het taalmodel (besluit 148), als de bewoner er een koos; anders null.
    const model = d.options.praten?.model() ?? null;
    // De assistent van Home Assistant (147) bedient niets: die schakelt zelf.
    const viaSleutel = d.metSleutel(req, url, path);
    // Een vraag in eigen woorden (besluit 115): de woordzoeker maakt er een
    // vaste vraag van, of antwoordt zelf over de app.
    let parsed: { question: Question; lang: Lang };
    let vrijeTekst: string | null = null;
    if ((url.searchParams.get('v') ?? '').toLowerCase() === 'vrij') {
      const taal = (url.searchParams.get('taal') ?? 'nl').toLowerCase();
      const lang: Lang = (LANGS as readonly string[]).includes(taal) ? (taal as Lang) : 'nl';
      const tekst = (url.searchParams.get('tekst') ?? '').trim();
      if (tekst === '' || tekst.length > MAX_TEKST) {
        sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_TEKST} tekens zijn` });
        return true;
      }
      vrijeTekst = tekst;
      // Alleen geluid, of het gesprek is klaar (21 oktober 2026): geen vraag.
      if (isRuis(tekst)) {
        sendJson(res, 200, { vraag: 'ruis', taal: lang, kamer: null, antwoord: '', feiten: [], gesproken: '' });
        return true;
      }
      const klaar = afsluiter(tekst, lang);
      if (klaar != null) {
        sendJson(res, 200, { vraag: 'klaar', taal: lang, kamer: null, antwoord: klaar, feiten: [], gesproken: uitspraak(klaar, lang) });
        return true;
      }
      // Bedienen met een zin (besluit 148): eerst de woordzoeker, en wat die
      // niet begrijpt het taalmodel. De pagina stuurt de opdracht naar de deur.
      const lijst = viaSleutel || d.options.praten?.bedienen() === false ? null : d.bedienbaar();
      const herkend = lijst ? herkenOpdracht(tekst, lijst, lang, url.searchParams.get('scherm')) : null;
      if (herkend) {
        sendJson(res, 200, await opdrachtAntwoord(d, herkend, tekst, lang, model));
        return true;
      }
      let b = begrijp(tekst, config, lang);
      if (b.soort === 'onbekend' && model != null) {
        const zones = config.zones.map((z) => ({ id: z.id, naam: z.name }));
        const keuze = await kies(model, tekst, lijst ?? bedienbaar(null, { licht: false, scenes: false, schermen: false }), zones, lang);
        if (keuze.soort === 'opdracht') {
          sendJson(res, 200, await opdrachtAntwoord(d, keuze.herkend, tekst, lang, model));
          return true;
        }
        if (keuze.soort === 'vraag') b = { soort: 'huis', vraag: keuze.vraag };
      }
      if (b.soort === 'app') {
        sendJson(res, 200, { vraag: 'app', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], link: b.link, gesproken: uitspraak(b.antwoord, lang) });
        return true;
      }
      if (b.soort === 'onbekend') {
        // Hardop staan de voorbeelden er zelf in (besluit 166); op het scherm zijn het knoppen.
        sendJson(res, 200, { vraag: 'onbekend', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], voorbeelden: b.voorbeelden, gesproken: uitspraak(b.gesproken, lang) });
        return true;
      }
      parsed = { question: b.vraag, lang };
    } else {
      const p = parseQuestion(url.searchParams);
      if (!p.ok) {
        sendJson(res, 400, { fout: p.reden });
        return true;
      }
      parsed = p;
    }
    let today = null;
    if ((parsed.question.kind === 'zon' || parsed.question.kind === 'vandaag') && logDir != null) {
      d.today ??= new TodayCache(logDir, config);
      try {
        today = await d.today.get();
      } catch {
        // Zonder dagoverzicht zegt het antwoord dat het het niet weet.
      }
    }
    // Op welke gevel de zon staat, als de ligging bekend is (besluit 93).
    const location = d.options.location?.() ?? null;
    let zoninval = null;
    if (parsed.question.kind === 'zon' && config.geometry != null && location != null) {
      const now = Date.now();
      const r = sunReport(config.geometry, location, now, startOfLocalDay(now, config.timezone));
      zoninval = { boven: r.zon.boven, gevels: r.gevels.filter((g) => g.inDeZon).map((g) => g.naam) };
    }
    // De weersverwachting bij de zon, straks en morgen (besluit 141, 142); uit dezelfde bron als Vandaag.
    let weer = null;
    const kind = parsed.question.kind;
    if (kind === 'zon' || kind === 'straks' || kind === 'weer' || kind === 'morgen') {
      const ruw = await d.weatherNow().catch(() => null);
      // Het weer in woorden in de taal van de vraag (besluit 185).
      const w = ruw && 'vandaag' in ruw ? weatherInLang(ruw, parsed.lang) : null;
      if (w) {
        const m = w.dagen[0];
        const morgen = m ? { tekst: m.tekst, minC: m.minC, maxC: m.maxC, regenkansPct: m.regenkansPct, verwachtKwh: m.verwachtKwh } : null;
        // De rest van vandaag (besluit 166): uit de uren tot middernacht, anders het weer van nu.
        const nu = Date.now();
        const eind = startOfLocalDay(nu, config.timezone) + 24 * 3_600_000;
        const uren = w.vandaag.uren.filter((u) => u.tMs < eind);
        const temps = uren.map((u) => u.buitenC).filter((t): t is number => t != null);
        const regen = uren.map((u) => u.regenkansPct).filter((r): r is number => r != null);
        const vandaag = {
          tekst: w.vandaag.tekst,
          minC: temps.length ? Math.min(...temps) : w.vandaag.buitenC,
          maxC: temps.length ? Math.max(...temps) : w.vandaag.buitenC,
          regenkansPct: regen.length ? Math.max(...regen) : null,
        };
        weer = { opgewektKwh: w.vandaag.opgewektKwh, verwachtKwh: w.vandaag.verwachtKwh, voorafKwh: w.vandaag.verwachtVoorafKwh, vandaag, morgen };
      }
    }
    // Wat de apparaten met een meter deze maand kostten (besluit 142), uit Opbrengst.
    const kosten = kind === 'kosten' ? await kostenDezeMaand(d, config, parsed.lang).catch(() => null) : null;
    const antwoord = ask(parsed.question, {
      weer,
      kosten,
      zoninval,
      config,
      snapshot: d.options.latest(),
      today,
      nowMs: Date.now(),
      // Tot stap B schrijft de dienst niets (besluit 15): hij is altijd schaduw.
      shadow: true,
      lang: parsed.lang,
    });
    // In eigen woorden (besluit 148), met het vaste antwoord als vangnet.
    const eigen = model ? await inEigenWoorden(model, vrijeTekst, antwoord, parsed.lang) : { antwoord: antwoord.antwoord, eigen: false };
    // Hoe het klinkt (besluit 142), voor de stem van het apparaat zelf.
    sendJson(res, 200, { ...antwoord, antwoord: eigen.antwoord, eigen: eigen.eigen, gesproken: uitspraak(eigen.antwoord, parsed.lang) });
    return true;
  }

  /*
   * Praten met je huis (besluit 148): één vraag aan een AI-taak, voor "Nog
   * een keer proberen" bij Functies. Alleen een AI-taak die Home Assistant
   * kent; er verandert niets.
   */
  if (path === '/api/praten/proef') {
    const praten = d.options.praten;
    const config = d.config();
    const id = url.searchParams.get('model') ?? '';
    const kent = d.options.functies?.gevonden()?.taalmodellen?.some((m) => m.id === id) ?? false;
    if (praten == null || config == null || !kent) {
      sendJson(res, 404, { fout: 'die AI-taak kent Home Assistant niet' });
      return true;
    }
    const vast = ask({ kind: 'nu' }, { config, snapshot: d.options.latest(), today: null, nowMs: Date.now(), shadow: true, lang: 'nl' });
    // Tijdens een pauze (gebruik op, te druk): zeggen tot wanneer, zonder het model te vragen.
    const pauze = praten.pauze?.(id) ?? null;
    if (pauze) {
      const om = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone }).format(pauze.tot);
      sendJson(res, 200, { vast: vast.antwoord, eigen: null, reden: `${pauze.reden} Rond ${om} probeert de assistent het weer; tot dan hoor je het vaste antwoord.`, ms: null });
      return true;
    }
    // Lang genoeg wachten om te zien hoe traag het model is; de assistent zelf wacht korter.
    const eigen = await inEigenWoorden(praten.proef(id), 'Wat doe je nu?', vast, 'nl', PROEF_MS);
    const seconden = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
    const traag = eigen.ms != null && eigen.ms > WACHT_MS;
    const reden = traag
      ? `Het model deed er ${seconden(eigen.ms!)} seconden over. De assistent wacht hooguit ${WACHT_MS / 1000} seconden; daarna hoor je het vaste antwoord. Kies een sneller model, zoals een met flash-lite in de naam.`
      : eigen.reden;
    sendJson(res, 200, { vast: vast.antwoord, eigen: eigen.eigen ? eigen.antwoord : null, reden, ms: eigen.ms, snel: eigen.eigen && !traag });
    return true;
  }

  return false;
}

/** Een opdracht als antwoord: de zin, in eigen woorden als dat kan, en wat de pagina moet sturen. */
export async function opdrachtAntwoord(d: Diensten, h: Herkend, tekst: string, lang: Lang, model: Vraag | null): Promise<Record<string, unknown>> {
  if (!h.ok) return { vraag: 'bedien', taal: lang, kamer: null, antwoord: h.antwoord, feiten: [], gesproken: uitspraak(h.antwoord, lang) };
  const o = h.opdracht;
  const eigen = model ? await inEigenWoorden(model, tekst, o, lang) : { antwoord: o.antwoord, eigen: false };
  return {
    vraag: 'bedien',
    taal: lang,
    kamer: null,
    ruimte: o.ruimte,
    antwoord: eigen.antwoord,
    eigen: eigen.eigen,
    feiten: o.feiten,
    gesproken: uitspraak(eigen.antwoord, lang),
    opdracht: { pad: o.pad, body: o.body },
    gedaan: o.gedaan,
    beweegt: o.beweegt,
    vervolg: o.vervolg,
  };
}
