/**
 * Te doen (besluit 216): het overzicht voor de kaart en het blad, de deur om
 * iets op een lijst te zetten, af te vinken of een herinnering te maken, en
 * het antwoord van de assistent op een zin over te doen.
 */

import type { Fact, Lang } from '../assistant.js';
import type { Visitor } from '../auth.js';
import type { TeDoenKeus } from '../functies.js';
import { sendJson, readJson } from '../http.js';
import { klok } from '../klimaatbrug.js';
import { uitspraak } from '../uitspraak.js';
import { startOfLocalDay } from '../today.js';
import type { AgendaKeus } from '../voorkeuren.js';
import type { Diensten, Verzoek } from '../diensten.js';
import {
  afvalBak,
  afvalSoort,
  isGedaan,
  leesAfspraken,
  leesHerinnering,
  leesLater,
  leesLijst,
  leesLijstZin,
  leesTeDoenVraag,
  type Afspraak,
  type Herinnering,
  type Herinneringen,
  type LijstItem,
  type LijstSoort,
} from '../tedoen.js';

/** Wat de dienst voor te doen nodig heeft (besluit 216); weg: geen te doen. */
export interface TeDoenDienst {
  readonly keus: () => TeDoenKeus;
  readonly herinneringen: Herinneringen;
  readonly leesAgendas: (ids: readonly string[], vanMs: number, totMs: number) => Promise<unknown>;
  readonly leesLijsten: (ids: readonly string[]) => Promise<unknown>;
  /**
   * Iets op een lijst zetten, afvinken (klaar) of terugzetten (open), of de
   * afgevinkte weghalen (opruimen, besluit 218). Bij afvinken is `item` de uid
   * als die er is: een naam kan op een lijst vaker staan.
   */
  readonly lijst: (id: string, item: string, actie: 'toevoegen' | 'klaar' | 'open' | 'opruimen') => Promise<void>;
  readonly agendaVan: (account: string) => AgendaKeus;
  /** De naam van een bewoner bij zijn account, of null als het geen bewoner is (een scherm). */
  readonly naamVan: (account: string) => string | null;
  readonly namen?: (ids: readonly string[]) => Readonly<Record<string, string>>;
  /** De bewoners die nu thuis zijn, voor hun eigen agenda's op de wand (besluit 219). */
  readonly thuis?: () => readonly { readonly account: string; readonly naam: string }[];
  /** Alle agenda's in Home Assistant, om bij Jij uit te kiezen. */
  readonly agendas?: () => readonly { readonly id: string; readonly naam: string }[];
}

/** Hoe lang de lijsten en agenda's van Home Assistant even vastgehouden worden. */
const VAST_MS = 20_000;
const bewaard = new Map<string, { ms: number; waarde: Promise<unknown> }>();
function vast(sleutel: string, vraag: () => Promise<unknown>): Promise<unknown> {
  const b = bewaard.get(sleutel);
  if (b && Date.now() - b.ms < VAST_MS) return b.waarde;
  const waarde = vraag().catch(() => null);
  bewaard.set(sleutel, { ms: Date.now(), waarde });
  return waarde;
}
/** Na iets toevoegen of afvinken: de lijsten opnieuw lezen. */
const vergeetLijsten = () => {
  for (const k of [...bewaard.keys()]) if (k.startsWith('lijst')) bewaard.delete(k);
};

export interface Overzicht {
  readonly aan: boolean;
  /** Of wie kijkt een bewoner is; een scherm aan de wand heeft geen eigen agenda's. */
  readonly bewoner?: boolean;
  readonly herinneringen: readonly (Herinnering & { readonly eigen: boolean })[];
  /** Wat de dienst later doet (besluit 218): licht, scènes en schermen op een tijd. */
  readonly gepland?: readonly Herinnering[];
  readonly lijsten: readonly { readonly soort: LijstSoort; readonly id: string; readonly naam: string; readonly items: readonly LijstItem[] }[];
  /** `wie`: op de wand, van welke bewoner die thuis is deze eigen afspraak is (besluit 219). */
  readonly afspraken: readonly (Afspraak & { readonly afval?: string; readonly wie?: string })[];
  readonly speelt: readonly Herinnering[];
  /** De namen van de agenda's in de afspraken, voor de kleuren op de pagina. */
  readonly agendas?: Readonly<Record<string, string>>;
}

/** Wat er voor wie kijkt te doen is: zijn herinneringen (op een scherm die van iedereen), de lijsten en de week. */
export async function overzicht(d: Diensten, t: TeDoenDienst, wie: Visitor | null, tz: string, nuMs = Date.now()): Promise<Overzicht> {
  const keus = t.keus();
  const speelt = await t.herinneringen.speelt();
  if (!keus.aan) return { aan: false, herinneringen: [], gepland: [], lijsten: [], afspraken: [], speelt: [] };
  const account = wie?.userId ?? null;
  const bewoner = account != null && t.naamVan(account) != null;
  const herinneringen = (await t.herinneringen.lijst())
    .filter((h) => !h.opdracht && h.status !== 'klaar' && (!bewoner || h.voor == null || h.voor === account))
    .map((h) => ({ ...h, eigen: h.voor != null && h.voor === account }));
  const lijstIds = [keus.boodschappen, keus.todo].filter((x): x is string => x != null);
  const lijstAntwoord = lijstIds.length ? await vast(`lijst:${lijstIds.join(',')}`, () => t.leesLijsten(lijstIds)) : null;
  const namen = t.namen?.(lijstIds) ?? {};
  const lijsten = (
    [
      ['boodschappen', keus.boodschappen],
      ['todo', keus.todo],
    ] as const
  )
    .filter(([, id]) => id != null)
    .map(([soort, id]) => ({ soort, id: id!, naam: namen[id!] ?? (soort === 'boodschappen' ? 'Boodschappen' : 'To-do'), items: leesLijst(lijstAntwoord, id!) }));
  // De week: het huis (afval en gezin) en, voor een bewoner, zijn eigen agenda's.
  const eigen = bewoner && account ? t.agendaVan(account) : null;
  // Op de wand (besluit 219): de eigen agenda's van iedereen die nu thuis is, met de naam erbij.
  const vanWie = new Map<string, string>();
  if (!bewoner) {
    for (const p of t.thuis?.() ?? []) {
      const k = t.agendaVan(p.account);
      if (k.aan) for (const id of k.ids) if (id !== keus.afval && id !== keus.gezin && !vanWie.has(id)) vanWie.set(id, p.naam);
    }
  }
  const ids = [...new Set([keus.afval, keus.gezin, ...(eigen?.aan ? eigen.ids : []), ...vanWie.keys()].filter((x): x is string => x != null))];
  const van = startOfLocalDay(nuMs, tz);
  const tot = van + 15 * 86_400_000;
  const agenda = ids.length ? await vast(`agenda:${ids.join(',')}:${van}`, () => t.leesAgendas(ids, van, tot)) : null;
  const afspraken = leesAfspraken(agenda, (id) => (id === keus.afval ? 'afval' : id === keus.gezin ? 'gezin' : 'eigen'), tz).map((a) =>
    a.bron === 'afval' ? { ...a, afval: afvalSoort(a.tekst) } : vanWie.has(a.agenda) ? { ...a, wie: vanWie.get(a.agenda)! } : a,
  );
  void d;
  return { aan: true, bewoner, herinneringen, gepland: await t.herinneringen.gepland(), lijsten, afspraken, speelt, agendas: t.namen?.(ids) ?? {} };
}

/** De routes van te doen. */
export async function teDoenRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  if (path !== '/api/te-doen') return false;
  const t = d.options.tedoen;
  const config = d.config();
  if (t == null || config == null) {
    sendJson(res, 404, { fout: 'te doen is er hier niet' });
    return true;
  }
  const wie = await d.bezoeker(req);
  if (method === 'GET') {
    // Alleen wat nu speelt (de wand vraagt het vaak): zonder Home Assistant te vragen.
    // De agenda's om bij Jij uit te kiezen (besluit 216), met welke van het huis zijn.
    if (url.searchParams.get('alleen') === 'agendas') {
      const keus = t.keus();
      sendJson(res, 200, { aan: keus.aan, agendas: (t.agendas?.() ?? []).map((a) => ({ ...a, huis: a.id === keus.afval ? 'afval' : a.id === keus.gezin ? 'gezin' : null })) });
      return true;
    }
    if (url.searchParams.get('alleen') === 'nu') {
      sendJson(res, 200, { speelt: t.keus().aan ? await t.herinneringen.speelt() : [] });
      return true;
    }
    sendJson(res, 200, await overzicht(d, t, wie, config.timezone));
    return true;
  }
  let body: Record<string, unknown>;
  try {
    const b = await readJson(req);
    if (typeof b !== 'object' || b == null || Array.isArray(b)) throw new Error('verwacht een object');
    body = b as Record<string, unknown>;
  } catch (error) {
    sendJson(res, 400, { fout: (error as Error).message });
    return true;
  }
  const uit = await handel(t, body, wie);
  sendJson(res, uit.status, uit.antwoord);
  return true;
}

/** Eén handeling: toevoegen, afvinken, een herinnering, gedaan of later. */
export async function handel(t: TeDoenDienst, body: Record<string, unknown>, wie: Visitor | null): Promise<{ status: number; antwoord: Record<string, unknown> }> {
  const keus = t.keus();
  if (!keus.aan) return { status: 409, antwoord: { fout: 'te doen staat uit bij Instellingen › Assistent' } };
  const actie = body['actie'];
  const tekst = typeof body['item'] === 'string' ? body['item'].trim() : '';
  // Afvinken op uid (besluit 218): op naam vond Home Assistant een oud, al afgevinkt item met dezelfde naam.
  const uid = typeof body['uid'] === 'string' && /^[\w.:-]{1,80}$/.test(body['uid']) ? body['uid'] : null;
  const lijstId = body['lijst'] === 'boodschappen' ? keus.boodschappen : body['lijst'] === 'todo' ? keus.todo : null;
  try {
    if (actie === 'opruimen') {
      if (lijstId == null) return { status: 400, antwoord: { fout: 'lijst is boodschappen of todo, en die moet er zijn' } };
      await t.lijst(lijstId, '', 'opruimen');
      vergeetLijsten();
      return { status: 200, antwoord: { ok: true } };
    }
    if (actie === 'toevoegen' || actie === 'klaar' || actie === 'open') {
      if (lijstId == null) return { status: 400, antwoord: { fout: 'lijst is boodschappen of todo, en die moet er zijn' } };
      if (tekst === '' || tekst.length > 120) return { status: 400, antwoord: { fout: 'item is 1 tot 120 tekens' } };
      await t.lijst(lijstId, actie !== 'toevoegen' && uid ? uid : tekst, actie);
      vergeetLijsten();
      return { status: 200, antwoord: { ok: true } };
    }
    if (actie === 'annuleer') {
      const id = typeof body['id'] === 'string' ? body['id'] : '';
      const g = (await t.herinneringen.gepland()).find((x) => x.id === id);
      if (!g) return { status: 404, antwoord: { fout: 'die geplande opdracht is er niet' } };
      await t.herinneringen.klaar(id);
      return { status: 200, antwoord: { ok: true } };
    }
    if (actie === 'herinner') {
      const ms = Number(body['ms']);
      const zin = typeof body['tekst'] === 'string' ? body['tekst'].trim() : '';
      if (zin === '' || zin.length > 120) return { status: 400, antwoord: { fout: 'tekst is 1 tot 120 tekens' } };
      if (!Number.isFinite(ms) || ms < Date.now() - 60_000 || ms > Date.now() + 366 * 86_400_000) return { status: 400, antwoord: { fout: 'ms ligt in het komende jaar' } };
      const account = wie?.userId ?? null;
      const naam = account ? t.naamVan(account) : null;
      const h = await t.herinneringen.voeg({ tekst: zin, ms, voor: naam ? account : null, naam });
      return { status: 200, antwoord: { ok: true, id: h.id } };
    }
    if (actie === 'gedaan' || actie === 'later') {
      const id = typeof body['id'] === 'string' ? body['id'] : '';
      const minuten = Number(body['minuten'] ?? 10);
      const ok = actie === 'gedaan' ? await t.herinneringen.klaar(id) : Number.isFinite(minuten) && minuten > 0 && minuten <= 24 * 60 ? await t.herinneringen.later(id, minuten) : false;
      return ok ? { status: 200, antwoord: { ok: true } } : { status: 404, antwoord: { fout: 'die herinnering is er niet' } };
    }
  } catch (error) {
    return { status: 502, antwoord: { fout: `Home Assistant weigerde: ${(error as Error).message}` } };
  }
  return { status: 400, antwoord: { fout: 'actie is toevoegen, klaar, open, opruimen, herinner, gedaan, later of annuleer' } };
}

/* ------------------------------------------------------------ de assistent */

const nl = (lang: Lang) => lang === 'nl';
/** "maandag", "morgen", "vandaag". */
export function dagWoord(ms: number, nuMs: number, tz: string, lang: Lang): string {
  const dag = Math.round((startOfLocalDay(ms, tz) - startOfLocalDay(nuMs, tz)) / 86_400_000);
  if (dag === 0) return nl(lang) ? 'vandaag' : 'today';
  if (dag === 1) return nl(lang) ? 'morgen' : 'tomorrow';
  if (dag === 2 && nl(lang)) return 'overmorgen';
  return new Intl.DateTimeFormat(nl(lang) ? 'nl-NL' : 'en-GB', { timeZone: tz, weekday: 'long', ...(dag > 6 ? { day: 'numeric', month: 'long' } : {}) }).format(ms);
}
const lijstNaam = (s: LijstSoort, lang: Lang) => (nl(lang) ? (s === 'boodschappen' ? 'de boodschappenlijst' : 'de to-do') : s === 'boodschappen' ? 'the shopping list' : 'the to-do list');
/** "melk, brood en eieren". */
function opsomming(woorden: readonly string[], lang: Lang): string {
  if (woorden.length <= 1) return woorden[0] ?? '';
  return `${woorden.slice(0, -1).join(', ')} ${nl(lang) ? 'en' : 'and'} ${woorden.at(-1)}`;
}

export interface TeDoenAntwoord {
  readonly antwoord: string;
  readonly feiten: readonly Fact[];
  readonly opdracht?: { readonly pad: string; readonly body: Readonly<Record<string, unknown>> };
  readonly keuze?: readonly { readonly label: string; readonly tekst: string }[];
  readonly gedaan?: readonly { readonly soort: string; readonly waarde: string; readonly uitleg: string }[];
}

/**
 * Een zin over te doen, als antwoord met de opdracht voor de deur; null als
 * het daar niet over gaat. De pagina stuurt de opdracht, zoals bij licht.
 */
export async function teDoenZin(d: Diensten, t: TeDoenDienst, tekst: string, wie: Visitor | null, tz: string, lang: Lang, nuMs = Date.now()): Promise<TeDoenAntwoord | null> {
  if (!t.keus().aan) return null;
  // Gedaan of later, als er een herinnering speelt.
  const speelt = (await t.herinneringen.speelt())[0];
  if (speelt) {
    if (isGedaan(tekst)) {
      const zin = nl(lang) ? `Mooi, ${speelt.tekst.charAt(0).toLowerCase()}${speelt.tekst.slice(1)} is gedaan.` : `Great, ${speelt.tekst} is done.`;
      return { antwoord: zin, feiten: [], opdracht: { pad: 'api/te-doen', body: { actie: 'gedaan', id: speelt.id } } };
    }
    const later = leesLater(tekst);
    if (later != null) {
      const tijd = klok(nuMs + later * 60_000, tz);
      return {
        antwoord: nl(lang) ? `Goed, om ${tijd} zeg ik het nog een keer.` : `All right, I will say it again at ${tijd}.`,
        feiten: [{ bron: 'tedoen.tijd', tekst: tijd }],
        opdracht: { pad: 'api/te-doen', body: { actie: 'later', id: speelt.id, minuten: later } },
      };
    }
  }
  // Een herinnering.
  const h = leesHerinnering(tekst, nuMs, tz);
  if (h?.soort === 'herinner') {
    const tijd = klok(h.ms, tz);
    const dag = dagWoord(h.ms, nuMs, tz, lang);
    const wat = h.tekst.charAt(0).toLowerCase() + h.tekst.slice(1);
    return {
      antwoord: nl(lang) ? `Goed, ik herinner je ${dag} om ${tijd} aan ${wat}.` : `All right, I will remind you ${dag} at ${tijd}: ${wat}.`,
      feiten: [{ bron: 'tedoen.tijd', tekst: tijd }],
      opdracht: { pad: 'api/te-doen', body: { actie: 'herinner', tekst: h.tekst, ms: h.ms } },
      gedaan: [{ soort: 'tedoen', waarde: tijd, uitleg: h.tekst }],
    };
  }
  if (h?.soort === 'hoelaat') {
    const wat = h.tekst.charAt(0).toLowerCase() + h.tekst.slice(1);
    return {
      antwoord: nl(lang) ? `Wanneer moet ik je herinneren aan ${wat}?` : `When should I remind you: ${wat}?`,
      feiten: [],
      keuze: nl(lang)
        ? [
            { label: 'Over een uur', tekst: `herinner me over een uur aan ${wat}` },
            { label: 'Vanavond om acht', tekst: `herinner me vanavond om 8 uur aan ${wat}` },
            { label: 'Morgen om negen', tekst: `herinner me morgen om 9 uur aan ${wat}` },
          ]
        : [
            { label: 'In an hour', tekst: `remind me in an hour about ${wat}` },
            { label: 'Tonight at eight', tekst: `remind me tonight at 8 about ${wat}` },
          ],
    };
  }
  // Iets op een lijst.
  const l = leesLijstZin(tekst);
  if (l) {
    const keus = t.keus();
    if ((l.lijst === 'boodschappen' ? keus.boodschappen : keus.todo) == null) {
      return { antwoord: nl(lang) ? `Er is geen ${l.lijst === 'boodschappen' ? 'boodschappenlijst' : 'to-do-lijst'} in Home Assistant. Kies er een bij Functies, onder Te doen.` : 'There is no such list in Home Assistant. Choose one under Features, To do.', feiten: [] };
    }
    return {
      antwoord: nl(lang) ? `${l.item} staat op ${lijstNaam(l.lijst, lang)}.` : `${l.item} is on ${lijstNaam(l.lijst, lang)}.`,
      feiten: [],
      opdracht: { pad: 'api/te-doen', body: { actie: 'toevoegen', lijst: l.lijst, item: l.item } },
      gedaan: [{ soort: 'tedoen', waarde: l.item, uitleg: nl(lang) ? (l.lijst === 'boodschappen' ? 'Boodschappen' : 'To-do') : l.lijst === 'boodschappen' ? 'Shopping' : 'To-do' }],
    };
  }
  // Een vraag.
  const vraag = leesTeDoenVraag(tekst);
  if (vraag == null) return null;
  const o = await overzicht(d, t, wie, tz, nuMs);
  if (vraag === 'boodschappen' || vraag === 'todo') {
    const lijst = o.lijsten.find((x) => x.soort === vraag);
    const open = (lijst?.items ?? []).filter((x) => !x.klaar).map((x) => x.tekst);
    const vandaag = vraag === 'todo' ? o.herinneringen.filter((x) => x.ms < startOfLocalDay(nuMs, tz) + 86_400_000) : [];
    const delen: string[] = [];
    if (open.length) delen.push(nl(lang) ? `Op ${lijstNaam(vraag, lang)} staat ${opsomming(open.slice(0, 8), lang)}${open.length > 8 ? `, en nog ${open.length - 8}` : ''}.` : `On ${lijstNaam(vraag, lang)}: ${opsomming(open.slice(0, 8), lang)}.`);
    else delen.push(nl(lang) ? `${lijstNaam(vraag, lang).charAt(0).toUpperCase()}${lijstNaam(vraag, lang).slice(1)} is leeg.` : `${lijstNaam(vraag, lang)} is empty.`);
    for (const x of vandaag.slice(0, 3)) delen.push(nl(lang) ? `Om ${klok(x.ms, tz)}: ${x.tekst.toLowerCase()}.` : `At ${klok(x.ms, tz)}: ${x.tekst}.`);
    return { antwoord: delen.join(' '), feiten: vandaag.map((x) => ({ bron: 'tedoen.tijd', tekst: klok(x.ms, tz) })) };
  }
  if (vraag === 'afval') {
    const afval = o.afspraken.filter((a) => a.bron === 'afval' && a.startMs >= startOfLocalDay(nuMs, tz));
    if (!afval.length) return { antwoord: nl(lang) ? 'Ik zie de komende twee weken geen afval in de agenda.' : 'I see no waste collection in the next two weeks.', feiten: [] };
    const eerste = afval[0]!;
    const zelfde = afval.filter((a) => a.startMs === eerste.startMs);
    const dag = dagWoord(eerste.startMs, nuMs, tz, lang);
    const soorten = zelfde.map((a) => (nl(lang) ? `${a.tekst} (${afvalBak(afvalSoort(a.tekst), lang)})` : a.tekst));
    const daarna = afval.find((a) => a.startMs > eerste.startMs);
    return {
      antwoord: nl(lang)
        ? `${dag.charAt(0).toUpperCase()}${dag.slice(1)} komt ${opsomming(soorten, lang)}.${daarna ? ` Daarna ${dagWoord(daarna.startMs, nuMs, tz, lang)} ${daarna.tekst}.` : ''}`
        : `${dag.charAt(0).toUpperCase()}${dag.slice(1)}: ${opsomming(soorten, lang)}.`,
      feiten: [],
    };
  }
  // De agenda: vandaag, morgen, overmorgen, een dag van de week, deze of volgende week.
  const dagStart = startOfLocalDay(nuMs, tz);
  const D = 86_400_000;
  const vandaagWd = new Date(dagStart + 12 * 3_600_000).getUTCDay();
  // Een dag van de week ("dinsdag"): de eerstvolgende, vandaag meegeteld.
  const wd = /^wd(\d)$/.exec(vraag);
  const dagen = wd ? (Number(wd[1]) - vandaagWd + 7) % 7 : vraag === 'morgen' ? 1 : vraag === 'overmorgen' ? 2 : 0;
  const lang7 = vraag === 'week' || vraag === 'volgendeWeek';
  // Volgende week: van maandag tot en met zondag.
  const volgendeMaandag = dagStart + (((1 - vandaagWd + 7) % 7) || 7) * D;
  const [van, tot] =
    vraag === 'week' ? [nuMs, dagStart + 7 * D]
    : vraag === 'volgendeWeek' ? [volgendeMaandag, volgendeMaandag + 7 * D]
    : dagen === 0 ? [nuMs, dagStart + D]
    : [dagStart + dagen * D, dagStart + (dagen + 1) * D];
  const daar = o.afspraken.filter((a) => a.startMs >= (a.heleDag ? startOfLocalDay(van, tz) : van) && a.startMs < tot);
  const wanneer =
    vraag === 'week' ? (nl(lang) ? 'deze week' : 'this week')
    : vraag === 'volgendeWeek' ? (nl(lang) ? 'volgende week' : 'next week')
    : dagWoord(dagStart + dagen * D + 12 * 3_600_000, nuMs, tz, lang);
  if (!daar.length) return { antwoord: nl(lang) ? `Er staat ${wanneer} niets in de agenda.` : `Nothing on the calendar ${wanneer}.`, feiten: [] };
  const regels = daar.slice(0, 5).map((a) => {
    const tijd = a.heleDag ? '' : ` ${nl(lang) ? 'om' : 'at'} ${klok(a.startMs, tz)}`;
    const dag = lang7 ? `${dagWoord(a.startMs, nuMs, tz, lang)}${tijd}` : tijd.trim();
    return `${dag ? `${dag}: ` : ''}${a.tekst}`;
  });
  const feiten = daar.slice(0, 5).filter((a) => !a.heleDag).map((a) => ({ bron: 'tedoen.agenda', tekst: klok(a.startMs, tz) }));
  return { antwoord: `${nl(lang) ? `${wanneer.charAt(0).toUpperCase()}${wanneer.slice(1)} staat er` : `${wanneer}:`} ${regels.join('; ')}.`, feiten };
}

/** Het antwoord voor de pagina, zoals bij bedienen. */
export function alsAntwoord(a: TeDoenAntwoord, lang: Lang): Record<string, unknown> {
  return {
    vraag: a.opdracht ? 'bedien' : 'tedoen',
    taal: lang,
    kamer: null,
    antwoord: a.antwoord,
    feiten: a.feiten,
    gesproken: uitspraak(a.antwoord, lang),
    ...(a.opdracht ? { opdracht: a.opdracht, gedaan: a.gedaan ?? [], beweegt: null, vervolg: [] } : {}),
    ...(a.keuze ? { keuze: a.keuze } : {}),
  };
}
