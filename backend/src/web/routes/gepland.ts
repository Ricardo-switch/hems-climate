/**
 * Later uitvoeren (besluit 218): een opdracht met een tijd bewaren in plaats
 * van meteen doen, zeggen wat er gepland staat, en de laatste annuleren. De
 * tijd leest `gepland.ts`, de opdracht de woordzoeker; de dienst voert hem op
 * het tijdstip zelf uit (main.ts).
 */

import type { Lang } from '../assistant.js';
import type { Visitor } from '../auth.js';
import { deelVan, herkenDelen, samen, type Stap } from '../brein.js';
import type { Diensten } from '../diensten.js';
import { isAnnuleer, isGeplandVraag, leesPlanTijd, type Herhaal, type Moment, type PlanTijd } from '../gepland.js';
import { klok } from '../klimaatbrug.js';
import { herkenOpdracht, type Bedienbaar, type Herkend } from '../opdracht.js';
import type { Herinnering, Herinneringen } from '../tedoen.js';
import { uitspraak } from '../uitspraak.js';
import { dagWoord } from './tedoen.js';

/** Wat later kan: licht, scènes en schermen. Het klimaat niet (dat regelt de klimaatbrug zelf). */
const LATER_MAG = new Set(['api/licht', 'api/scene', 'api/scherm']);
/** Een zin die iets wil laten doen, en geen vraag: dan beantwoordt het taalmodel hem niet vrij (besluit 224). */
const VRAAG = /^(waarom|wanneer|hoe|wat|welke|staat|staan|is|zijn|why|when|how|what|which)\b/;
const BEDIEN = /\b(lamp|lampen|licht|lichten|verlichting|spots?|plafonniere|scene|sfeer|screens?|schermen?|zonnescherm|rolluik|dicht|open|aan|uit|zakken|omlaag|omhoog|neer|light|lights|blinds?|close|on|off|lower|raise)\b/;

const nl = (lang: Lang) => lang === 'nl';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "na zonsondergang", "10 minuten voor zonsondergang", "een kwartier na zonsopkomst". */
export function zonZin(zon: 'onder' | 'op', minuten: number, lang: Lang): string {
  const naam = zon === 'onder' ? (nl(lang) ? 'zonsondergang' : 'sunset') : nl(lang) ? 'zonsopkomst' : 'sunrise';
  if (minuten === 0) return zon === 'onder' ? (nl(lang) ? 'na zonsondergang' : 'after sunset') : nl(lang) ? 'bij zonsopkomst' : 'at sunrise';
  const n = Math.abs(minuten);
  const duur = nl(lang) ? (n === 15 ? 'een kwartier' : n === 30 ? 'een half uur' : n === 60 ? 'een uur' : `${n} minuten`) : n === 15 ? 'a quarter of an hour' : n === 30 ? 'half an hour' : n === 60 ? 'an hour' : `${n} minutes`;
  return `${duur} ${minuten < 0 ? (nl(lang) ? 'voor' : 'before') : nl(lang) ? 'na' : 'after'} ${naam}`;
}

/** "om 21:43", "morgen om 07:00", "na zonsondergang, om 17:21", "10 minuten voor zonsondergang, om 16:49". */
export function wanneerZin(ms: number, zon: PlanTijd['zon'], nuMs: number, tz: string, lang: Lang, minuten = 0): string {
  const dag = dagWoord(ms, nuMs, tz, lang);
  const vandaag = dag === (nl(lang) ? 'vandaag' : 'today');
  const tijd = `${nl(lang) ? 'om' : 'at'} ${klok(ms, tz)}`;
  if (zon) return `${vandaag ? '' : `${dag} `}${zonZin(zon, minuten, lang)}, ${tijd}`;
  return `${vandaag ? '' : `${dag} `}${tijd}`;
}

const DAG_NL = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAG_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "elke dag", "elke werkdag", "in het weekend", "elke maandag en woensdag"; leeg bij één keer (besluit 234). */
export function herhaalZin(h: Herhaal | undefined, lang: Lang): string {
  if (!h || h.soort === 'een') return '';
  if (h.soort === 'dag') return nl(lang) ? 'elke dag' : 'every day';
  if (h.soort === 'werkdagen') return nl(lang) ? 'elke werkdag' : 'every weekday';
  if (h.soort === 'weekend') return nl(lang) ? 'in het weekend' : 'at weekends';
  const namen = (h.dagen ?? []).map((d) => (nl(lang) ? DAG_NL : DAG_EN)[d - 1]).filter(Boolean) as string[];
  const lijst = namen.length <= 1 ? (namen[0] ?? '') : `${namen.slice(0, -1).join(', ')} ${nl(lang) ? 'en' : 'and'} ${namen.at(-1)}`;
  return `${nl(lang) ? 'elke' : 'every'} ${lijst}`;
}

/** Het moment op een dag, zonder dag: "om 07:00", "10 minuten voor zonsondergang". */
export function momentZin(m: Moment, lang: Lang): string {
  if (m.soort === 'zon') return zonZin(m.zon, m.minuten, lang);
  return `${nl(lang) ? 'om' : 'at'} ${String(m.uur).padStart(2, '0')}:${String(m.minuut).padStart(2, '0')}`;
}

/** Wat de keuze zegt als je doorvraagt: de tijd erbij, zodat hij gepland blijft. */
function tijdWoorden(p: PlanTijd, nuMs: number, tz: string, lang: Lang): string {
  const dag = dagWoord(p.ms, nuMs, tz, lang);
  const vandaag = dag === (nl(lang) ? 'vandaag' : 'today');
  const vaak = herhaalZin(p.herhaal, lang);
  if (vaak) return `${vaak} ${momentZin(p.moment, lang)}`;
  if (p.zon) return `${vandaag ? '' : `${dag} `}${zonZin(p.zon, p.moment.soort === 'zon' ? p.moment.minuten : 0, lang)}`;
  return `${vandaag ? '' : `${dag} `}${nl(lang) ? 'om' : 'at'} ${klok(p.ms, tz)}`;
}

/** Het antwoord voor de pagina: alleen tekst, er gaat nu niets naar een deur. */
function antwoord(tekst: string, lang: Lang, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { vraag: 'tedoen', taal: lang, kamer: null, antwoord: tekst, feiten: [], gesproken: uitspraak(tekst, lang), ...extra };
}

/** Wat er gepland staat, als zin. */
function geplandZin(lijst: readonly Herinnering[], nuMs: number, tz: string, lang: Lang): string {
  if (!lijst.length) return nl(lang) ? 'Er staat niets gepland.' : 'Nothing is planned.';
  const regels = lijst.slice(0, 4).map((g) => {
    const vaak = herhaalZin(g.opdracht?.herhaal, lang);
    const minuten = g.opdracht?.moment?.soort === 'zon' ? g.opdracht.moment.minuten : 0;
    return `${vaak ? `${vaak}, ` : ''}${wanneerZin(g.ms, g.opdracht?.zon ?? null, nuMs, tz, lang, minuten)}: ${g.tekst.charAt(0).toLowerCase()}${g.tekst.slice(1)}`;
  });
  const meer = lijst.length > 4 ? (nl(lang) ? ` En nog ${lijst.length - 4}.` : ` And ${lijst.length - 4} more.`) : '';
  return `${nl(lang) ? 'Gepland' : 'Planned'}: ${regels.join('; ')}.${meer}`;
}

/**
 * Een zin over later: een opdracht met een tijd ("zet over vijf minuten de
 * lamp in de keuken aan"), "wat staat er gepland", of "annuleer". Null als
 * het daar niet over gaat; dan gaat de zin de gewone weg.
 */
export async function planZin(
  d: Diensten,
  store: Herinneringen,
  tekst: string,
  lijst: Bedienbaar,
  wie: Visitor | null,
  tz: string,
  lang: Lang,
  laatsteScherm: string | null,
  naamVan: (account: string) => string | null,
  nuMs = Date.now(),
  denkLater: ((rest: string) => Promise<{ readonly stappen: readonly Stap[] } | { readonly vraag: Extract<Herkend, { ok: false }> } | null>) | null = null,
): Promise<Record<string, unknown> | null> {
  if (isGeplandVraag(tekst)) return antwoord(geplandZin(await store.gepland(), nuMs, tz, lang), lang);
  if (isAnnuleer(tekst)) {
    const laatste = [...(await store.gepland())].sort((a, b) => b.gemaakt - a.gemaakt)[0];
    if (!laatste) return antwoord(nl(lang) ? 'Er staat niets gepland om te annuleren.' : 'There is nothing planned to cancel.', lang);
    await store.klaar(laatste.id);
    return antwoord(nl(lang) ? `Goed, dat doe ik niet: ${laatste.tekst.charAt(0).toLowerCase()}${laatste.tekst.slice(1)}.` : `All right, I will not do that: ${laatste.tekst}.`, lang);
  }
  const p = leesPlanTijd(tekst, nuMs, tz, d.options.location?.() ?? null);
  if (p == null || p.rest === '') return null;
  const rest = p.rest.replace(/^(?:kun je|kan je|wil je|wilt u|can you|could you|please) /, '');
  // Doorvragen (welke screen?): de keuzes houden de tijd vast.
  const doorvraag = (h: Extract<Herkend, { ok: false }>) => {
    const bij = tijdWoorden(p, nuMs, tz, lang);
    return antwoord(h.antwoord, lang, h.keuze ? { keuze: h.keuze.map((k) => ({ ...k, tekst: `${k.tekst} ${bij}` })) } : {});
  };
  // Wat er moet gebeuren: één opdracht, of meer in één zin.
  let stappen: readonly Stap[];
  const delen = herkenDelen(rest, lijst, lang, laatsteScherm);
  if (delen) stappen = samen(delen.map(deelVan)).stappen;
  else {
    const h = herkenOpdracht(rest, lijst, lang, laatsteScherm);
    if (h == null) {
      // Een opdracht met een tijd die de woordzoeker niet leest (besluit 224): het
      // taalmodel zegt alleen wát, de tijd houden we hier. Lukt dat niet, dan een
      // vast antwoord, en nooit een zin van het model met een eigen tijd.
      if (!BEDIEN.test(rest) || VRAAG.test(rest)) return null;
      const doen = denkLater ? await denkLater(rest).catch(() => null) : null;
      if (doen && 'vraag' in doen) return doorvraag(doen.vraag);
      if (!doen?.stappen.length) {
        const wanneer = tijdWoorden(p, nuMs, tz, lang);
        return antwoord(nl(lang) ? `Ik hoorde ${wanneer}, maar niet wat er dan moet gebeuren. Zeg bijvoorbeeld: ${wanneer} de screens dicht.` : `I heard ${wanneer}, but not what should happen then. Say for example: ${wanneer} close the screens.`, lang);
      }
      stappen = doen.stappen;
    } else if (!h.ok) return doorvraag(h);
    else stappen = deelVan(h.opdracht).stappen;
  }
  if (!stappen.length || !stappen.every((s) => LATER_MAG.has(s.pad))) {
    return antwoord(nl(lang) ? 'Dat kan ik nog niet voor later plannen; alleen licht, scènes en schermen.' : 'I cannot plan that for later yet; only lights, scenes and screens.', lang);
  }
  const account = wie?.userId ?? null;
  const naam = account ? naamVan(account) : null;
  const label = cap(rest);
  const g = await store.voeg({ tekst: label, ms: p.ms, voor: naam ? account : null, naam, opdracht: { stappen, zon: p.zon, moment: p.moment, herhaal: p.herhaal, aan: true } });
  const minuten = p.moment.soort === 'zon' ? p.moment.minuten : 0;
  const vaak = herhaalZin(p.herhaal, lang);
  // Steeds (besluit 234): wat hij vastlegde, en wanneer de eerste keer is.
  const eerste = `${dagWoord(g.ms, nuMs, tz, lang)} ${nl(lang) ? 'om' : 'at'} ${klok(g.ms, tz)}`;
  const zin = vaak
    ? nl(lang)
      ? `Goed, ${vaak} ${momentZin(p.moment, lang)}: ${rest}. De eerste keer is ${eerste}.`
      : `All right, ${vaak} ${momentZin(p.moment, lang)}: ${rest}. The first time is ${eerste}.`
    : nl(lang)
      ? `Goed, ${wanneerZin(g.ms, p.zon, nuMs, tz, lang, minuten)} doe ik dit: ${rest}.`
      : `All right, ${wanneerZin(g.ms, p.zon, nuMs, tz, lang, minuten)} I will do this: ${rest}.`;
  return antwoord(zin, lang, { feiten: [{ bron: 'tedoen.tijd', tekst: klok(g.ms, tz) }], gepland: { id: g.id, ms: g.ms } });
}
