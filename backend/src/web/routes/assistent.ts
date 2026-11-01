/**
 * De assistent: vragen, de stem, Assist en het taalmodel (besluiten 141, 148 en 184).
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { assistKamers } from '../assist.js';
import { ask, LANGS, parseQuestion } from '../assistant.js';
import type { BrugVraag, Lang, Question } from '../assistant.js';
import { brugVraag, brugZone, klok } from '../klimaatbrug.js';
import { handVraag } from '../hand.js';
import type { SiteConfig } from '../../core/model.js';
import { uitspraak } from '../uitspraak.js';
import { afsluiter, begrijp, isHalf, isRuis, MAX_TEKST, verbeter } from '../woordzoeker.js';
import { bedienbaar, herkenOpdracht, kiesUit, schermVaag, type Bedienbaar, type Herkend, type Opdracht, type Optie } from '../opdracht.js';
import { controleerZin, inEigenWoorden, PROEF_MS, WACHT_MS, type Vraag } from '../taalmodel.js';
import { dagRegels, deelVan, denk, herkenDelen, isTerug, samen, terugVan, type Deel, type Situatie, type Stap } from '../brein.js';
import type { Fact } from '../assistant.js';
import type { IncomingMessage } from 'node:http';
import { alsAntwoord, teDoenZin } from './tedoen.js';
import { leesLijstZin } from '../tedoen.js';
import { planZin } from './gepland.js';
import type { URL } from 'node:url';
import { momentWoorden } from '../lichtrecept.js';
import { sunReport } from '../sun.js';
import { weatherInLang } from '../weather.js';
import { startOfLocalDay } from '../today.js';
import { MAX_ZEG } from '../stem.js';
import { stemOpties, VOORBEELD } from '../stemmen.js';
import { functiesVoorstel, volledig } from '../functies.js';
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
  // De stemmen om uit te kiezen (besluit 212), en welke gekozen is.
  if (path === '/api/stemmen') {
    const stem = d.options.stem;
    const f = d.options.functies;
    const g = f?.gevonden() ?? null;
    const praten = f?.store.current ? volledig(f.store.current, g).praten : null;
    sendJson(res, 200, { gekozen: praten?.stemKeuze ?? null, nu: stem?.naam ?? null, opties: (stem ? await stem.opties().catch(() => null) : null) ?? stemOpties(new Map()), voorbeeld: VOORBEELD });
    return true;
  }

  if (path === '/api/stem') {
    const stem = d.options.stem;
    const tekst = url.searchParams.get('tekst');
    // In de taal van de app (besluit 185).
    const lang = taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']);
    // Een stem om te horen voordat je kiest (besluit 212).
    const keuze = url.searchParams.get('keuze');
    if (tekst != null && keuze != null && stem != null) {
      if (tekst.trim() === '' || tekst.length > MAX_ZEG) {
        sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_ZEG} tekens zijn` });
        return true;
      }
      try {
        const g = await stem.voorbeeld(keuze, tekst, lang);
        res.writeHead(200, { 'content-type': g.type, 'content-length': g.data.length, 'cache-control': 'private, max-age=3600' });
        res.end(g.data);
      } catch (error) {
        sendJson(res, 502, { fout: (error as Error).message });
      }
      return true;
    }
    if (tekst == null) {
      // Welke stem, en of die de taal van de app kan; zonder gebruikt de pagina de stem van het apparaat.
      const t = stem ? await stem.taalVoor(lang).catch(() => ({ taal: null, voice: null })) : { taal: null, voice: null };
      // Waar de stem vandaan komt (besluit 203): het apparaat eerst, of Piper in huis; en of de browser mag verstaan.
      const f = d.options.functies;
      const g = f?.gevonden() ?? null;
      const praten = f?.store.current ? volledig(f.store.current, g).praten : g ? functiesVoorstel(g).praten : null;
      // Wie spreekt (besluit 212): een gekozen stem gaat voor; vanzelf zoals eerst. Luisteren in huis
      // als er een spraak naar tekst in huis is (besluit 211), ook zonder de oude keuze.
      const spreek = stem?.keuze ?? praten?.stem ?? 'apparaat';
      const bron = d.options.verstaanInHuis?.() ? 'huis' : (praten?.stem ?? 'apparaat');
      sendJson(res, 200, { stem: stem?.naam ?? null, taal: t.taal, voice: t.voice, bron, spreek, verstaan: praten?.verstaan ?? true });
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

  // Hoe de schermen luisteren (besluit 208): wie het wekwoord hoort, en hoe vaak het huis vandaag wakker werd.
  if (path === '/api/luister-stand') {
    const post = d.luisterpost;
    if (post == null) {
      sendJson(res, 200, { kan: false });
      return true;
    }
    const s = post.stand;
    const vandaag = startOfLocalDay(Date.now(), (d.options.configNow?.() ?? d.options.config)?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    const boek = s.boek.filter((m) => m.ms >= vandaag);
    sendJson(res, 200, {
      kan: true,
      zelf: s.zelf,
      traag: s.traag,
      rekentijdPct: s.rekentijd == null ? null : Math.round(s.rekentijd * 100),
      // Hoe de app verstaat (besluit 211): de spraak naar tekst in huis, of null (via de spraakassistent).
      verstaan: d.options.verstaanInHuis?.() ?? null,
      vandaag: { wakker: boek.length, zonderVraag: boek.filter((m) => m.vraag === false).length },
      laatste: boek.slice(-10).reverse().map((m) => ({ ms: m.ms, kans: m.kans == null ? null : Math.round(m.kans * 100) / 100, gevoeligheid: m.gevoeligheid, vraag: m.vraag })),
    });
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
    // Voor eigen woorden alleen als het model snel genoeg is (29 oktober 2026); het brein vraagt het altijd.
    const woorden = model && d.options.praten?.eigenWoorden?.() !== false ? model : null;
    // De assistent van Home Assistant (147) bedient niets: die schakelt zelf.
    const viaSleutel = d.metSleutel(req, url, path);
    // Een vraag in eigen woorden (besluit 115): de woordzoeker maakt er een
    // vaste vraag van, of antwoordt zelf over de app.
    let parsed: { question: Question; lang: Lang };
    let vrijeTekst: string | null = null;
    // Het gesprek van dit scherm (besluit 213), om te onthouden wat er gezegd en gedaan is.
    let gesprekId: string | null = null;
    if ((url.searchParams.get('v') ?? '').toLowerCase() === 'vrij') {
      const taal = (url.searchParams.get('taal') ?? 'nl').toLowerCase();
      const lang: Lang = (LANGS as readonly string[]).includes(taal) ? (taal as Lang) : 'nl';
      let tekst = (url.searchParams.get('tekst') ?? '').trim();
      if (tekst === '' || tekst.length > MAX_TEKST) {
        sendJson(res, 400, { fout: `tekst moet 1 tot ${MAX_TEKST} tekens zijn` });
        return true;
      }
      // Het antwoord op een vraag terug (besluit 209): "de grote", "ja", of een tik op een keuze.
      // De pagina stuurt de keuzes mee; de gekozen zin gaat daarna gewoon door de woordzoeker.
      const gekozen = kiesUit(tekst, optiesUit(url.searchParams.get('opties')));
      if (gekozen) tekst = gekozen.tekst;
      // Wat bijna goed verstaan is, recht zetten naar de namen uit het huis (besluit 211).
      else tekst = verbeter(tekst, huisNamen(d, config)) || tekst;
      vrijeTekst = tekst;
      // Alleen geluid, of het gesprek is klaar (21 oktober 2026): geen vraag.
      if (isRuis(tekst)) {
        sendJson(res, 200, { vraag: 'ruis', taal: lang, kamer: null, antwoord: '', feiten: [], gesproken: '' });
        return true;
      }
      // Een gesproken zin die niet af is (besluit 208): de pagina luistert door.
      if (url.searchParams.get('half') === '1' && isHalf(tekst)) {
        sendJson(res, 200, { vraag: 'half', taal: lang, kamer: null, antwoord: '', feiten: [], gesproken: '' });
        return true;
      }
      const klaar = afsluiter(tekst, lang);
      if (klaar != null) {
        sendJson(res, 200, { vraag: 'klaar', taal: lang, kamer: null, antwoord: klaar, feiten: [], gesproken: uitspraak(klaar, lang) });
        return true;
      }
      const id = (gesprekId = gesprekVan(req, url));
      // Stuurt het antwoord, en onthoudt het voor de volgende zin (besluit 213).
      const stuur = (r: { readonly body: Record<string, unknown>; readonly terug: readonly Stap[] | null }) => {
        sendJson(res, 200, r.body);
        d.gesprekken.voeg(id, { vraag: tekst, antwoord: String(r.body['antwoord'] ?? ''), terug: r.terug });
        return true;
      };
      // Bedienen met een zin (besluit 148): eerst de woordzoeker, en wat die
      // niet begrijpt het taalmodel. De pagina stuurt de opdracht naar de deur.
      const lijst = viaSleutel || d.options.praten?.bedienen() === false ? null : d.bedienbaar();
      // "Doe maar terug" (besluit 213): hoe het was vóór de laatste opdracht, zonder model.
      if (lijst && isTerug(tekst)) {
        const terug = d.gesprekken.neemTerug(id);
        const nl = lang === 'nl';
        const antwoord = terug ? (nl ? 'Ik heb het teruggezet zoals het was.' : 'I put it back the way it was.') : nl ? 'Er is niets om terug te zetten.' : 'There is nothing to undo.';
        const body = { vraag: 'bedien', taal: lang, kamer: null, antwoord, feiten: [], gesproken: uitspraak(antwoord, lang), ...(terug ? { opdracht: terug[0], meer: terug.slice(1), gedaan: [], beweegt: null, vervolg: [] } : {}) };
        return stuur({ body, terug: null });
      }
      // Te doen (besluit 216): een herinnering, iets op een lijst, gedaan of later, of een vraag over afval en agenda.
      const tedoen = d.options.tedoen;
      if (tedoen && !viaSleutel) {
        const a = await teDoenZin(d, tedoen, tekst, await d.bezoeker(req), config.timezone, lang).catch(() => null);
        if (a) return stuur({ body: alsAntwoord(a, lang), terug: null });
      }
      // Via Assist van Home Assistant zet SunArc niets op een lijst (de integratie leest alleen): zeg dat eerlijk, in plaats van "dat begrijp ik niet" (ronde 5).
      if (tedoen && viaSleutel && leesLijstZin(tekst)) {
        const antwoord = lang === 'nl'
          ? 'Iets op een lijst zetten doe ik via de app, op de wand of je telefoon. Via deze spraakassistent kan het met "Opdrachten bij voorkeur lokaal afhandelen" aan in Home Assistant.'
          : 'I put things on a list through the app, on the wall or your phone. Through this voice assistant it works with "Prefer handling commands locally" switched on in Home Assistant.';
        return stuur({ body: { vraag: 'tedoen', taal: lang, kamer: null, antwoord, feiten: [], gesproken: uitspraak(antwoord, lang) }, terug: null });
      }
      // Later uitvoeren (besluit 218): "zet over vijf minuten de lamp aan", "na zonsondergang de screens dicht".
      if (tedoen && lijst && !viaSleutel) {
        // Wat de woordzoeker bij een tijd niet leest, vraagt hij het taalmodel: alleen wát, nooit wanneer (besluit 224).
        const denkLater =
          model == null
            ? null
            : async (rest: string) => {
                const zones = config.zones.map((z) => ({ id: z.id, naam: z.name }));
                const plan = await denk(model, rest, lijst, zones, await situatieVoor(d, config, lang), d.gesprekken.van(id), klimaatKamers(d, config), lang);
                if (plan.soort !== 'doen') return null;
                const ops = plan.stappen.map((s) => (s.soort === 'opdracht' && s.herkend.ok ? s.herkend.opdracht : null));
                if (!ops.length || ops.some((o) => o == null)) return null;
                for (const o of ops as Opdracht[]) {
                  const vaag = schermVaag(tekst, o, lijst, lang);
                  if (vaag && !vaag.ok) return { vraag: vaag };
                }
                return { stappen: samen((ops as Opdracht[]).map(deelVan)).stappen };
              };
        const g = await planZin(d, tedoen.herinneringen, tekst, lijst, await d.bezoeker(req), config.timezone, lang, url.searchParams.get('scherm'), tedoen.naamVan, Date.now(), denkLater).catch(() => null);
        if (g) return stuur({ body: g, terug: null });
      }
      // Meer in één zin (besluit 213): "screens dicht en de lamp aan", elk deel apart.
      const delen = lijst ? herkenDelen(tekst, lijst, lang, url.searchParams.get('scherm')) : null;
      if (delen && lijst) return stuur(await bedienAntwoord(samen(delen.map(deelVan)), tekst, lang, woorden, lijst));
      const herkend = lijst ? herkenOpdracht(tekst, lijst, lang, url.searchParams.get('scherm')) : null;
      if (herkend && lijst) return stuur(await opdrachtAntwoord(d, herkend, tekst, lang, woorden, lijst));
      let b = begrijp(tekst, config, lang);
      if (b.soort === 'onbekend' && model != null) {
        // Het brein (besluit 213): een plan van meer stappen, een vaste vraag, of een antwoord uit de feiten.
        const zones = config.zones.map((z) => ({ id: z.id, naam: z.name }));
        const situatie = await situatieVoor(d, config, lang);
        const leeg = lijst ?? bedienbaar(null, { licht: false, scenes: false, schermen: false });
        const plan = await denk(model, tekst, leeg, zones, situatie, d.gesprekken.van(id), klimaatKamers(d, config), lang);
        if (plan.soort === 'doen') {
          // Eén opdracht met een vraag terug (de sfeerverlichting?) gaat zoals bij de woordzoeker.
          const enig = plan.stappen.length === 1 ? plan.stappen[0]! : null;
          if (enig?.soort === 'opdracht' && !enig.herkend.ok) return stuur(await opdrachtAntwoord(d, enig.herkend, tekst, lang, woorden, leeg));
          // Koos het model één screen dat je niet noemde, dan vragen welke (besluit 224).
          for (const s of plan.stappen) {
            const vaag = s.soort === 'opdracht' && s.herkend.ok ? schermVaag(tekst, s.herkend.opdracht, leeg, lang) : null;
            if (vaag) return stuur(await opdrachtAntwoord(d, vaag, tekst, lang, woorden, leeg));
          }
          const stukken: Deel[] = [];
          const nee: string[] = [];
          const brug = klimaatBrugVoor(d, config, tekst);
          for (const s of plan.stappen) {
            if (s.soort === 'opdracht') {
              if (s.herkend.ok) stukken.push(deelVan(s.herkend.opdracht));
              else nee.push(s.herkend.antwoord);
              continue;
            }
            const r = brug?.(s.wens, s.kamer, s.temperatuurC, lang) ?? null;
            if (r?.ok) stukken.push({ antwoord: r.antwoord, feiten: r.feiten, stappen: [r.opdracht], gedaan: r.gedaan, ruimte: null });
            else nee.push(r?.antwoord ?? (lang === 'nl' ? 'Het klimaat bedien ik niet: de klimaatbrug staat uit.' : 'I do not operate the climate: the climate bridge is off.'));
          }
          if (stukken.length) return stuur(await bedienAntwoord(samen(stukken), tekst, lang, woorden, leeg, nee.length ? null : plan.zin, nee));
          const antwoord = nee[0]!;
          return stuur({ body: { vraag: 'bedien', taal: lang, kamer: null, antwoord, feiten: [], gesproken: uitspraak(antwoord, lang) }, terug: null });
        }
        if (plan.soort === 'antwoord') {
          const feiten = situatie.feiten.filter((f) => plan.zin.includes(f.tekst));
          return stuur({ body: { vraag: 'brein', taal: lang, kamer: null, antwoord: plan.zin, eigen: true, feiten, gesproken: uitspraak(plan.zin, lang) }, terug: null });
        }
        if (plan.soort === 'vraag') b = { soort: 'huis', vraag: plan.vraag };
      }
      if (b.soort === 'app') {
        return stuur({ body: { vraag: 'app', taal: lang, kamer: null, antwoord: b.antwoord, feiten: [], link: b.link, gesproken: uitspraak(b.antwoord, lang) }, terug: null });
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
    if ((parsed.question.kind === 'zon' || parsed.question.kind === 'vandaag' || parsed.question.kind === 'terug') && logDir != null) {
      try {
        // Met de geschiedenis van Home Assistant waar het logboek nog niets heeft, zoals Vandaag (30 oktober 2026).
        today = await d.vandaag();
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
    const kind = parsed.question.kind;
    const weer = kind === 'zon' || kind === 'straks' || kind === 'weer' || kind === 'morgen' ? await weerVoor(d, config, parsed.lang) : null;
    // Wat de apparaten met een meter deze maand kostten (besluit 142), uit Opbrengst; en het hele huis, ook voor wat er terugging.
    const kosten = kind === 'kosten' || kind === 'terug' ? await kostenDezeMaand(d, config, parsed.lang).catch(() => null) : null;
    // Het sluipverbruik (besluit 192): wat de dienst al weet, zonder te wachten.
    const sluip = kind === 'sluip' ? await (d.options.sluipverbruik?.rapport() ?? Promise.resolve(null)).catch(() => null) : null;
    const antwoord = ask(parsed.question, {
      weer,
      kosten,
      sluip,
      // De klimaatbrug (besluit 210): als hij aan staat, wordt een wens om te verwarmen een opdracht.
      brug: klimaatBrugVoor(d, config, vrijeTekst),
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
    const eigen = woorden && !antwoord.letterlijk ? await inEigenWoorden(woorden, vrijeTekst, antwoord, parsed.lang) : { antwoord: antwoord.antwoord, eigen: false };
    // Onthouden voor de volgende zin (besluit 213), en een opdracht van de klimaatbrug kan terug.
    if (gesprekId != null && vrijeTekst != null) {
      d.gesprekken.voeg(gesprekId, { vraag: vrijeTekst, antwoord: eigen.antwoord, terug: antwoord.opdracht ? terugVan([antwoord.opdracht], d.bedienbaar()) : null });
    }
    // Hoe het klinkt (besluit 142), voor de stem van het apparaat zelf.
    sendJson(res, 200, { ...antwoord, antwoord: eigen.antwoord, eigen: eigen.eigen, gesproken: uitspraak(eigen.antwoord, parsed.lang) });
    return true;
  }

  /*
   * Praten met je huis (besluit 148): één vraag aan een AI-taak, voor "Nog
   * een keer proberen" bij Functies. Alleen een AI-taak die Home Assistant
   * kent; er verandert niets.
   */
  // Hoeveel vragen er per dag naar het model gingen en hoe snel (besluit 213).
  if (path === '/api/praten/teller') {
    const dagen = (await d.options.praten?.teller?.().catch(() => null)) ?? [];
    sendJson(res, 200, {
      dagen: dagen.slice(0, 7).map((x) => ({ dag: x.dag, vragen: x.vragen, fouten: x.fouten, gemiddeldMs: x.vragen > x.fouten ? Math.round(x.totaalMs / (x.vragen - x.fouten)) : null, langsteMs: x.langsteMs || null })),
      wachtMs: WACHT_MS,
      // Eigen woorden staan even uit omdat het model te traag is (29 oktober 2026).
      eigenWoorden: d.options.praten?.eigenWoorden?.() ?? true,
      // De dag in het huis, zodat de pagina vandaag vindt.
      vandaag: new Intl.DateTimeFormat('en-CA', { timeZone: d.config()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date()),
    });
    return true;
  }

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
/** De namen uit het huis, om bijna goed verstane woorden recht te zetten (besluit 211). */
function huisNamen(d: Diensten, config: SiteConfig): string[] {
  const b = d.bedienbaar();
  return [...config.zones.map((z) => z.name), ...b.kamers.map((k) => k.naam), ...b.zones.map((z) => z.naam), ...b.lampen.map((l) => l.naam), ...b.schermen.map((s) => s.naam), ...b.scenes.map((s) => s.naam)];
}

/**
 * De klimaatbrug voor de assistent, of null als hij uit staat of het oude
 * systeem er niet is. Gaat een kamer niet via de brug (zoals de zolder), dan
 * met de hand (besluit 235).
 */
function klimaatBrugVoor(d: Diensten, config: SiteConfig, tekst: string | null): BrugVraag | null {
  const k = d.options.klimaat;
  const brug = k != null && k.aan() && k.brug.beschikbaar ? brugVraag(k.brug, config, tekst) : null;
  const h = d.options.hand;
  const hand = h != null && h.aan() ? handVraag(h.hand, config, tekst) : null;
  if (!brug) return hand;
  return hand ? (wens, zone, temp, lang) => brug(wens, zone, temp, lang) ?? hand(wens, zone, temp, lang) : brug;
}

/** De keuzes die de pagina meestuurt: hooguit vier, elk een label en een zin, en anders geen. */
export function optiesUit(ruw: string | null): Optie[] {
  if (ruw == null || ruw.length > 1200) return [];
  try {
    const lijst: unknown = JSON.parse(ruw);
    if (!Array.isArray(lijst)) return [];
    return lijst
      .slice(0, 4)
      .filter((o): o is Optie => typeof o === 'object' && o != null && typeof (o as Optie).label === 'string' && typeof (o as Optie).tekst === 'string')
      .map((o) => ({ label: o.label.slice(0, 60), tekst: o.tekst.slice(0, MAX_TEKST) }));
  } catch {
    return [];
  }
}

/** Een antwoord met wat er terug kan (besluit 213): de body voor de pagina, en hoe het was. */
export interface MetTerug {
  readonly body: Record<string, unknown>;
  readonly terug: readonly Stap[] | null;
}

export async function opdrachtAntwoord(_d: Diensten, h: Herkend, tekst: string, lang: Lang, model: Vraag | null, lijst: Bedienbaar): Promise<MetTerug> {
  if (!h.ok) return { body: { vraag: 'bedien', taal: lang, kamer: null, antwoord: h.antwoord, feiten: [], gesproken: uitspraak(h.antwoord, lang), ...(h.keuze ? { keuze: h.keuze } : {}) }, terug: null };
  return bedienAntwoord(deelVan(h.opdracht), tekst, lang, model, lijst);
}

/**
 * Een of meer opdrachten als antwoord: de zin (die van het plan als elk getal
 * klopt, anders in eigen woorden als dat kan), de stappen voor de deuren, en
 * hoe het was, uit de stand vóór de opdracht.
 */
export async function bedienAntwoord(
  deel: Deel,
  tekst: string,
  lang: Lang,
  model: Vraag | null,
  lijst: Bedienbaar,
  zin: string | null = null,
  nee: readonly string[] = [],
): Promise<MetTerug> {
  const vast = { antwoord: [deel.antwoord, ...nee].join(' '), feiten: deel.feiten };
  const vanPlan = zin ? controleerZin(zin, vast) : null;
  const eigen = vanPlan ? { antwoord: vanPlan, eigen: true } : model ? await inEigenWoorden(model, tekst, vast, lang) : { antwoord: vast.antwoord, eigen: false };
  const [eerste, ...rest] = deel.stappen;
  return {
    body: {
      vraag: 'bedien',
      taal: lang,
      kamer: null,
      ruimte: deel.ruimte ?? null,
      antwoord: eigen.antwoord,
      eigen: eigen.eigen,
      feiten: deel.feiten,
      gesproken: uitspraak(eigen.antwoord, lang),
      opdracht: eerste,
      // Meer opdrachten erachteraan (besluit 211, 213), zoals allebei de screens.
      ...(rest.length ? { meer: rest } : {}),
      gedaan: deel.gedaan,
      beweegt: deel.beweegt ?? null,
      vervolg: deel.vervolg ?? [],
    },
    terug: terugVan(deel.stappen, lijst),
  };
}

/** Het gesprek van een scherm: het id dat de pagina meestuurt, of het adres. */
function gesprekVan(req: IncomingMessage, url: URL): string {
  const id = url.searchParams.get('gesprek') ?? '';
  return /^[\w-]{6,64}$/.test(id) ? id : `adres:${req.socket.remoteAddress ?? 'onbekend'}`;
}

/** De kamers die de klimaatbrug kan verwarmen of koelen, of geen als hij uit staat. */
function klimaatKamers(d: Diensten, config: SiteConfig): { id: string; naam: string }[] {
  const k = d.options.klimaat;
  if (k == null || !k.aan() || !k.brug.beschikbaar) return [];
  return config.zones.filter((z) => brugZone(config, z.id, 'verwarmen') || brugZone(config, z.id, 'koelen')).map((z) => ({ id: z.id, naam: z.name }));
}

/** Het weer voor de assistent, uit dezelfde bron als Vandaag (besluit 141, 142); null zonder weer. */
async function weerVoor(d: Diensten, config: SiteConfig, lang: Lang) {
  const ruw = await d.weatherNow().catch(() => null);
  // Het weer in woorden in de taal van de vraag (besluit 185).
  const w = ruw && 'vandaag' in ruw ? weatherInLang(ruw, lang) : null;
  if (!w) return null;
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
  return { opgewektKwh: w.vandaag.opgewektKwh, verwachtKwh: w.vandaag.verwachtKwh, voorafKwh: w.vandaag.verwachtVoorafKwh, vandaag, morgen };
}

/**
 * Hoe het huis ervoor staat (besluit 213), voor het brein: de klok, wat het
 * huis doet, hoe warm het is, wie er thuis is, wat er draait, het weer, en
 * vandaag en gisteren. Allemaal vaste antwoorden met hun feiten, zodat elk
 * getal in een antwoord van het model na te gaan is.
 */
export async function situatieVoor(d: Diensten, config: SiteConfig, lang: Lang): Promise<Situatie> {
  const nl = lang === 'nl';
  const nu = Date.now();
  const regels: string[] = [];
  const feiten: Fact[] = [];
  const tijd = klok(nu, config.timezone);
  const datum = new Intl.DateTimeFormat(nl ? 'nl-NL' : 'en-GB', { timeZone: config.timezone, weekday: 'long', day: 'numeric', month: 'long' }).format(nu);
  const recept = d.lichtRecept(nu);
  regels.push(nl ? `Het is ${datum}, ${tijd}${recept ? ` (licht: ${momentWoorden(recept.moment, true)})` : ''}.` : `It is ${datum}, ${tijd}.`);
  feiten.push({ bron: 'nu.klok', tekst: tijd }, { bron: 'nu.datum', tekst: datum });
  const basis = { config, snapshot: d.options.latest(), today: null, nowMs: nu, shadow: true, lang } as const;
  const weer = await weerVoor(d, config, lang).catch(() => null);
  const vragen: Question[] = [{ kind: 'nu' }, { kind: 'warm' }, { kind: 'thuis' }, { kind: 'draait', apparaat: '' }];
  for (const v of vragen) {
    const a = ask(v, basis);
    regels.push(a.antwoord);
    feiten.push(...a.feiten);
  }
  if (weer) {
    const a = ask({ kind: 'weer' }, { ...basis, weer });
    regels.push(a.antwoord);
    feiten.push(...a.feiten);
  }
  if (d.options.logDir != null) {
    // Ook voor het brein met de geschiedenis van Home Assistant (30 oktober 2026).
    const vandaag = await d.vandaag().catch(() => null);
    const gisteren = await d.vandaag(true).catch(() => null);
    for (const [r, dag] of [[vandaag, 'vandaag'], [gisteren, 'gisteren']] as const) {
      if (r == null) continue;
      const s = dagRegels(r, config, dag, lang);
      regels.push(...s.regels);
      feiten.push(...s.feiten);
    }
  }
  return { regels, feiten };
}
