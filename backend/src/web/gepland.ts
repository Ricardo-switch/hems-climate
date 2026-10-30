/**
 * Later uitvoeren (besluit 218): "zet over vijf minuten de lamp in de keuken
 * aan", "doe na zonsondergang de screens dicht", "morgen om zeven uur het
 * licht in de badkamer aan". Dit bestand leest wanneer; wat er moet gebeuren
 * leest de woordzoeker zoals altijd, uit wat er overblijft.
 *
 * De dienst bewaart een geplande opdracht bij de herinneringen
 * (`herinneringen.json`) met de stappen voor de deuren, en voert hem zelf uit
 * als het zover is: licht, scènes en schermen, binnen wat bij Functies aan
 * staat. Een zonsmoment rekent hij uit bij het plannen, voor deze plek.
 */

import { sunPosition } from '../core/sun.js';
import { kaal, leesTijd } from './tedoen.js';
import { partsIn, zonedTime } from './today.js';

export type Zon = 'onder' | 'op';

export interface PlanTijd {
  readonly ms: number;
  /** De zin zonder de tijd: "zet de lamp in de keuken aan". */
  readonly rest: string;
  /** Bij zonsondergang of -opkomst; null bij een gewone tijd. */
  readonly zon: Zon | null;
}

const ONDER = /\b(?:(?:na|bij|vanaf|zodra|als|wanneer) (?:de )?(?:zonsondergang|zonsonder|zon ondergaat|zon onder is|zon onder gaat|het donker wordt|het donker is|het schemert)|(?:after|at|when) (?:the )?(?:sunset|sun sets|sun goes down|it gets dark))\b/;
const OP = /\b(?:(?:na|bij|vanaf|zodra|als|wanneer) (?:de )?(?:zonsopkomst|zonsopgang|zon opkomt|zon op is|zon op komt|het licht wordt)|(?:after|at|when) (?:the )?(?:sunrise|sun rises|sun comes up))\b/;

/**
 * Het eerstvolgende moment waarop de zon onder de horizon zakt (onder) of
 * erboven komt (op), vanaf `vanMs`, minuut voor minuut. Null als dat de
 * komende twee dagen niet gebeurt (poolnacht).
 */
export function volgendeZon(soort: Zon, vanMs: number, plek: { readonly latDeg: number; readonly lonDeg: number }): number | null {
  let boven = sunPosition(vanMs, plek.latDeg, plek.lonDeg).elevationDeg > 0;
  for (let t = vanMs + 60_000; t <= vanMs + 48 * 3_600_000; t += 60_000) {
    const nu = sunPosition(t, plek.latDeg, plek.lonDeg).elevationDeg > 0;
    if (soort === 'onder' && boven && !nu) return t;
    if (soort === 'op' && !boven && nu) return t;
    boven = nu;
  }
  return null;
}

/**
 * Wanneer, uit een opdracht: een gewone tijd ("over vijf minuten", "om 22:00",
 * "morgen om zeven uur", "vanavond") of de zon ("na zonsondergang", "morgen
 * bij zonsopkomst"). Null zonder tijd, of als de zon niet te berekenen is.
 */
export function leesPlanTijd(tekst: string, nuMs: number, tz: string, plek: { readonly latDeg: number; readonly lonDeg: number } | null): PlanTijd | null {
  let t = ` ${kaal(tekst)} `;
  const zon: Zon | null = ONDER.test(t) ? 'onder' : OP.test(t) ? 'op' : null;
  if (zon) {
    if (plek == null) return null;
    t = t.replace(zon === 'onder' ? ONDER : OP, ' ');
    // "Morgen na zonsondergang": vanaf het begin van morgen.
    const morgen = /\b(morgen|tomorrow)\b/.test(t);
    t = t.replace(/\b(morgen|tomorrow|vandaag|today|vanavond|tonight)\b/g, ' ');
    const n = partsIn(nuMs, tz);
    const van = morgen ? zonedTime(n.y, n.m, n.d + 1, 0, 0, tz) : nuMs;
    const ms = volgendeZon(zon, van, plek);
    return ms == null ? null : { ms, rest: t.replace(/\s+/g, ' ').trim(), zon };
  }
  const tijd = leesTijd(tekst, nuMs, tz);
  if (tijd == null || tijd.ms <= nuMs + 30_000) return null;
  return { ms: tijd.ms, rest: tijd.rest, zon: null };
}

/** "Annuleer", "annuleer dat", "cancel it": de laatst geplande opdracht niet doen. */
export function isAnnuleer(ruw: string): boolean {
  return /^(?:annuleer|annuleren|cancel)(?: dat| het| die| deze| maar| de (?:geplande |laatste )?opdracht| (?:that|it|the (?:planned |last )?(?:task|command)))?$/.test(kaal(ruw));
}

/** "Wat staat er gepland?", "wat ga je straks doen?". */
export function isGeplandVraag(ruw: string): boolean {
  return /\b(?:wat staat er gepland|wat is er gepland|wat heb je gepland|wat ga je (?:straks|later|nog) doen|welke opdrachten|geplande opdrachten|what(?:'s| is) (?:planned|scheduled)|what are you going to do later)\b/.test(kaal(ruw));
}
