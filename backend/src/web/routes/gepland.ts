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
import { isAnnuleer, isGeplandVraag, leesPlanTijd, type PlanTijd } from '../gepland.js';
import { klok } from '../klimaatbrug.js';
import { herkenOpdracht, type Bedienbaar } from '../opdracht.js';
import type { Herinnering, Herinneringen } from '../tedoen.js';
import { uitspraak } from '../uitspraak.js';
import { dagWoord } from './tedoen.js';

/** Wat later kan: licht, scènes en schermen. Het klimaat niet (dat regelt de klimaatbrug zelf). */
const LATER_MAG = new Set(['api/licht', 'api/scene', 'api/scherm']);

const nl = (lang: Lang) => lang === 'nl';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "om 21:43", "morgen om 07:00", "na zonsondergang, om 17:21". */
export function wanneerZin(ms: number, zon: PlanTijd['zon'], nuMs: number, tz: string, lang: Lang): string {
  const dag = dagWoord(ms, nuMs, tz, lang);
  const vandaag = dag === (nl(lang) ? 'vandaag' : 'today');
  const tijd = `${nl(lang) ? 'om' : 'at'} ${klok(ms, tz)}`;
  if (zon) {
    const moment = zon === 'onder' ? (nl(lang) ? 'na zonsondergang' : 'after sunset') : nl(lang) ? 'bij zonsopkomst' : 'at sunrise';
    return `${vandaag ? '' : `${dag} `}${moment}, ${tijd}`;
  }
  return `${vandaag ? '' : `${dag} `}${tijd}`;
}

/** Wat de keuze zegt als je doorvraagt: de tijd erbij, zodat hij gepland blijft. */
function tijdWoorden(p: PlanTijd, nuMs: number, tz: string, lang: Lang): string {
  const dag = dagWoord(p.ms, nuMs, tz, lang);
  const vandaag = dag === (nl(lang) ? 'vandaag' : 'today');
  if (p.zon) return `${vandaag ? '' : `${dag} `}${p.zon === 'onder' ? (nl(lang) ? 'na zonsondergang' : 'after sunset') : nl(lang) ? 'bij zonsopkomst' : 'at sunrise'}`;
  return `${vandaag ? '' : `${dag} `}${nl(lang) ? 'om' : 'at'} ${klok(p.ms, tz)}`;
}

/** Het antwoord voor de pagina: alleen tekst, er gaat nu niets naar een deur. */
function antwoord(tekst: string, lang: Lang, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { vraag: 'tedoen', taal: lang, kamer: null, antwoord: tekst, feiten: [], gesproken: uitspraak(tekst, lang), ...extra };
}

/** Wat er gepland staat, als zin. */
function geplandZin(lijst: readonly Herinnering[], nuMs: number, tz: string, lang: Lang): string {
  if (!lijst.length) return nl(lang) ? 'Er staat niets gepland.' : 'Nothing is planned.';
  const regels = lijst.slice(0, 4).map((g) => `${wanneerZin(g.ms, g.opdracht?.zon ?? null, nuMs, tz, lang)}: ${g.tekst.charAt(0).toLowerCase()}${g.tekst.slice(1)}`);
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
  // Wat er moet gebeuren: één opdracht, of meer in één zin.
  let stappen: readonly Stap[];
  const delen = herkenDelen(rest, lijst, lang, laatsteScherm);
  if (delen) stappen = samen(delen.map(deelVan)).stappen;
  else {
    const h = herkenOpdracht(rest, lijst, lang, laatsteScherm);
    if (h == null) return null;
    if (!h.ok) {
      // Doorvragen (welke screen?): de keuzes houden de tijd vast.
      const bij = tijdWoorden(p, nuMs, tz, lang);
      return antwoord(h.antwoord, lang, h.keuze ? { keuze: h.keuze.map((k) => ({ ...k, tekst: `${k.tekst} ${bij}` })) } : {});
    }
    stappen = deelVan(h.opdracht).stappen;
  }
  if (!stappen.length || !stappen.every((s) => LATER_MAG.has(s.pad))) {
    return antwoord(nl(lang) ? 'Dat kan ik nog niet voor later plannen; alleen licht, scènes en schermen.' : 'I cannot plan that for later yet; only lights, scenes and screens.', lang);
  }
  const account = wie?.userId ?? null;
  const naam = account ? naamVan(account) : null;
  const label = cap(rest);
  const g = await store.voeg({ tekst: label, ms: p.ms, voor: naam ? account : null, naam, opdracht: { stappen, zon: p.zon } });
  const wanneer = wanneerZin(g.ms, p.zon, nuMs, tz, lang);
  const zin = nl(lang) ? `Goed, ${wanneer} doe ik dit: ${rest}.` : `All right, ${wanneer} I will do this: ${rest}.`;
  return antwoord(zin, lang, { feiten: [{ bron: 'tedoen.tijd', tekst: klok(g.ms, tz) }], gepland: { id: g.id, ms: g.ms } });
}
