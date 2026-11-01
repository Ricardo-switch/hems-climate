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
  /** Wanneer op een dag, om het volgende moment uit te rekenen (besluit 234). */
  readonly moment: Moment;
  /** Hoe vaak; één keer als de zin niets zegt. */
  readonly herhaal: Herhaal;
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
  // Hoe vaak eerst (besluit 234): "elke werkdag", "elke ochtend".
  const { herhaal, rest: zonderHerhaal } = leesHerhaal(kaal(tekst));
  let t = ` ${zonderHerhaal} `;
  const metMinuten = leesZonMinuten(t);
  const zon: Zon | null = metMinuten?.zon ?? (ONDER.test(t) ? 'onder' : OP.test(t) ? 'op' : null);
  if (zon) {
    if (plek == null) return null;
    t = metMinuten ? ` ${metMinuten.rest} ` : t.replace(zon === 'onder' ? ONDER : OP, ' ');
    // "Morgen na zonsondergang": vanaf het begin van morgen.
    const morgen = /\b(morgen|tomorrow)\b/.test(t);
    t = t.replace(/\b(morgen|tomorrow|vandaag|today|vanavond|tonight)\b/g, ' ');
    const n = partsIn(nuMs, tz);
    const van = morgen ? zonedTime(n.y, n.m, n.d + 1, 0, 0, tz) : nuMs;
    const moment: Moment = { soort: 'zon', zon, minuten: metMinuten?.minuten ?? 0 };
    // Eén keer: de eerstvolgende dag waarop het moment nog komt.
    const ms = volgendeMoment(moment, herhaal.soort === 'een' ? { soort: 'dag' } : herhaal, van, tz, plek);
    return ms == null ? null : { ms, rest: t.replace(/\s+/g, ' ').trim(), zon, moment, herhaal };
  }
  // Steeds: het uur zoals je het zegt ("elke werkdag om zeven" is 07:00), niet het
  // eerstvolgende zeven uur; wie de avond bedoelt, zegt "'s avonds" of "19:00".
  const n = partsIn(nuMs, tz);
  const tijd = leesTijd(zonderHerhaal, herhaal.soort === 'een' ? nuMs : zonedTime(n.y, n.m, n.d, 0, 0, tz), tz);
  if (tijd == null || (herhaal.soort === 'een' && tijd.ms <= nuMs + 30_000)) return null;
  const p = partsIn(tijd.ms, tz);
  const moment: Moment = { soort: 'tijd', uur: p.h, minuut: p.mi };
  const ms = herhaal.soort === 'een' ? tijd.ms : volgendeMoment(moment, herhaal, nuMs, tz, plek);
  return ms == null ? null : { ms, rest: tijd.rest, zon: null, moment, herhaal };
}

/** "Annuleer", "annuleer dat", "cancel it": de laatst geplande opdracht niet doen. */
export function isAnnuleer(ruw: string): boolean {
  return /^(?:annuleer|annuleren|cancel)(?: dat| het| die| deze| maar| de (?:geplande |laatste )?opdracht| (?:that|it|the (?:planned |last )?(?:task|command)))?$/.test(kaal(ruw));
}

/** "Wat staat er gepland?", "wat ga je straks doen?". */
export function isGeplandVraag(ruw: string): boolean {
  return /\b(?:wat staat er gepland|wat is er gepland|wat heb je gepland|wat ga je (?:straks|later|nog) doen|welke opdrachten|geplande opdrachten|what(?:'s| is) (?:planned|scheduled)|what are you going to do later)\b/.test(kaal(ruw));
}

/* ------------------------------------------------------- vast en gepland */

/**
 * Hoe vaak (besluit 234): één keer, elke dag, werkdagen, het weekend, of
 * gekozen dagen (1 is maandag, 7 zondag).
 */
export interface Herhaal {
  readonly soort: 'een' | 'dag' | 'werkdagen' | 'weekend' | 'dagen';
  readonly dagen?: readonly number[];
}

/** Wanneer op een dag: een tijd, of de zon met minuten ervoor (negatief) of erna. */
export type Moment =
  | { readonly soort: 'tijd'; readonly uur: number; readonly minuut: number }
  | { readonly soort: 'zon'; readonly zon: Zon; readonly minuten: number };

export const EEN_KEER: Herhaal = { soort: 'een' };

/** Op welke dagen (1 is maandag) het mag. */
export function dagenVan(h: Herhaal): readonly number[] {
  if (h.soort === 'werkdagen') return [1, 2, 3, 4, 5];
  if (h.soort === 'weekend') return [6, 7];
  if (h.soort === 'dagen') return [...new Set(h.dagen ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  return [1, 2, 3, 4, 5, 6, 7];
}

/**
 * Het eerstvolgende moment na `vanMs` dat bij de herhaling past: een tijd op
 * die dag, of de zon van die dag met de minuten erbij. Null als de zon niet te
 * berekenen is of er geen dag gekozen is.
 */
export function volgendeMoment(moment: Moment, herhaal: Herhaal, vanMs: number, tz: string, plek: { readonly latDeg: number; readonly lonDeg: number } | null): number | null {
  const mag = new Set(dagenVan(herhaal));
  if (mag.size === 0) return null;
  const n = partsIn(vanMs, tz);
  for (let d = 0; d <= 8; d++) {
    const weekdag = new Date(Date.UTC(n.y, n.m - 1, n.d + d)).getUTCDay() || 7;
    if (!mag.has(weekdag)) continue;
    let ms: number | null;
    if (moment.soort === 'tijd') ms = zonedTime(n.y, n.m, n.d + d, moment.uur, moment.minuut, tz);
    else {
      if (plek == null) return null;
      const zon = volgendeZon(moment.zon, zonedTime(n.y, n.m, n.d + d, 0, 0, tz), plek);
      ms = zon == null ? null : zon + moment.minuten * 60_000;
    }
    if (ms != null && ms > vanMs) return ms;
  }
  return null;
}

const DAG_NAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAG_WOORD = `(${[...DAG_NAMEN, ...DAY_NAMES].join('|')})`;

/**
 * Hoe vaak, uit een zin (besluit 234): "elke dag", "elke ochtend", "elke
 * werkdag", "in het weekend", "elke maandag en woensdag". Geeft de zin terug
 * zonder die woorden; "elke ochtend" laat "ochtend" staan, zodat de tijd weet
 * welk dagdeel. Zonder herhaling: één keer.
 */
export function leesHerhaal(tekst: string): { readonly herhaal: Herhaal; readonly rest: string } {
  let t = ` ${tekst} `;
  const klaar = (h: Herhaal, re: RegExp | string, door = ' ') => ({ herhaal: h, rest: t.replace(re, door).replace(/\s+/g, ' ').trim() });
  const dagen = new RegExp(`\\b(?:elke|iedere|every|on) ${DAG_WOORD}(?:(?:,| en| and) ${DAG_WOORD})*\\b`).exec(t);
  if (dagen) {
    const namen = [...dagen[0].matchAll(new RegExp(DAG_WOORD, 'g'))].map((m) => m[1]!);
    const nrs = namen.map((x) => (DAG_NAMEN.indexOf(x) >= 0 ? DAG_NAMEN.indexOf(x) : DAY_NAMES.indexOf(x)) + 1);
    // "Op maandag" is een keer; alleen "elke" en "every" herhalen.
    if (!/^(?:on) /.test(dagen[0].trim())) return klaar({ soort: 'dagen', dagen: [...new Set(nrs)].sort((a, b) => a - b) }, dagen[0]);
  }
  const werk = /\b(?:(?:elke|iedere) (?:werkdag|doordeweekse dag)|op werkdagen|doordeweeks|(?:every |on )?weekdays|every weekday)\b/;
  if (werk.test(t)) return klaar({ soort: 'werkdagen' }, werk);
  const weekend = /\b(?:(?:in het|elk|ieder) weekend|in de weekenden|(?:every |on )?weekends|every weekend)\b/;
  if (weekend.test(t)) return klaar({ soort: 'weekend' }, weekend);
  const dagdeel = /\b(?:elke|iedere) (ochtend|morgen|middag|avond|nacht)\b|\bevery (morning|afternoon|evening|night)\b/.exec(t);
  if (dagdeel) {
    const woord = dagdeel[1] === 'morgen' ? 'ochtend' : (dagdeel[1] ?? dagdeel[2]!);
    t = t.replace(dagdeel[0], ` ${woord === 'night' ? 'nacht' : woord} `);
    return { herhaal: { soort: 'dag' }, rest: t.replace(/\s+/g, ' ').trim() };
  }
  const dag = /\b(?:(?:elke|iedere) dag|dagelijks|every day|daily)\b/;
  if (dag.test(t)) return klaar({ soort: 'dag' }, dag);
  return { herhaal: EEN_KEER, rest: tekst.trim() };
}

const ZON_WOORD = '(?:de )?(zonsondergang|zonsonder|zonsopkomst|zonsopgang|sunset|sunrise)';
const MINUTEN_WOORD = '(een kwartier|een half uur|half uur|een uur|(\\d{1,3}|vijf|tien|vijftien|twintig|dertig|veertig|vijftig) (?:minuten|minuut|min|minutes|minute))';

/** "Een kwartier voor zonsondergang", "10 minuten na zonsopkomst": de zon met minuten. Null zonder. */
export function leesZonMinuten(tekst: string): { readonly zon: Zon; readonly minuten: number; readonly rest: string } | null {
  const m = new RegExp(`\\b${MINUTEN_WOORD} (voor|na|before|after) ${ZON_WOORD}\\b`).exec(` ${tekst} `);
  if (!m) return null;
  const woord = m[1]!;
  const n = /kwartier/.test(woord) ? 15 : /half uur/.test(woord) ? 30 : /een uur/.test(woord) ? 60 : Number.isFinite(Number(m[2])) ? Number(m[2]) : ({ vijf: 5, tien: 10, vijftien: 15, twintig: 20, dertig: 30, veertig: 40, vijftig: 50 } as Record<string, number>)[m[2] ?? ''] ?? NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 180) return null;
  const voor = m[3] === 'voor' || m[3] === 'before';
  const zon: Zon = /onder|sunset/.test(m[4]!) ? 'onder' : 'op';
  return { zon, minuten: voor ? -n : n, rest: ` ${tekst} `.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
}

/*
 * Wat een geplande opdracht mag doen (besluit 218): licht, scènes en schermen,
 * en sinds besluit 240 ook klimaat met de hand (besluit 235) en witgoed starten
 * (besluit 238). Dezelfde deuren als op de pagina; er komt geen deur bij. De
 * dienst kijkt bij het uitvoeren nog eens of het bij Functies aan staat.
 */
export const LATER_MAG: ReadonlySet<string> = new Set(['api/licht', 'api/scene', 'api/scherm', 'api/hand', 'api/witgoed']);
/** Hoe lang klimaat met de hand duurt als hij op zijn moment aangaat. */
export const HAND_TOT = ['uur1', 'uur2', 'dagdeel', 'doel'] as const;
export type HandTot = (typeof HAND_TOT)[number];

const LICHT_DOEL = ['lamp', 'kamer', 'zone', 'etage', 'buiten', 'huis'];
const isId = (v: unknown, re: RegExp = /^[a-z_]+\.[\w-]{1,120}$/) => typeof v === 'string' && re.test(v);

/** Eén stap voor later, nagekeken op zijn vorm; een tekst als hij niet klopt. */
export function leesStap(s: unknown): { readonly pad: string; readonly body: Readonly<Record<string, unknown>> } | string {
  if (typeof s !== 'object' || s == null || Array.isArray(s)) return 'een stap is { pad, body }';
  const { pad, body } = s as Record<string, unknown>;
  if (typeof pad !== 'string' || !LATER_MAG.has(pad)) return `pad is een van ${[...LATER_MAG].join(', ')}`;
  if (typeof body !== 'object' || body == null || Array.isArray(body) || JSON.stringify(body).length > 600) return 'body is een klein object';
  const b = body as Record<string, unknown>;
  if (pad === 'api/licht') {
    if (typeof b['doel'] !== 'string' || !LICHT_DOEL.includes(b['doel']) || typeof b['aan'] !== 'boolean') return 'licht: doel en aan';
  } else if (pad === 'api/scene') {
    if (!isId(b['id'], /^scene\.[\w-]{1,120}$/)) return 'scène: id is een scene';
  } else if (pad === 'api/scherm') {
    if (!isId(b['id'], /^cover\.[\w-]{1,120}$/) || !['open', 'dicht', 'stand'].includes(String(b['actie']))) return 'scherm: id en actie open, dicht of stand';
    if (b['actie'] === 'stand' && !(Number.isInteger(b['standPct']) && (b['standPct'] as number) >= 0 && (b['standPct'] as number) <= 100)) return 'scherm: standPct van 0 tot 100';
  } else if (pad === 'api/hand') {
    if (!isId(b['id'], /^(?:climate|switch)\.[\w-]{1,120}$/) || !(HAND_TOT as readonly string[]).includes(String(b['tot']))) return 'klimaat: id en tot (uur1, uur2, dagdeel of doel)';
    if (String(b['id']).startsWith('climate.')) {
      const doel = b['doelC'];
      if (typeof doel !== 'number' || doel < 5 || doel > 35) return 'klimaat: doelC van 5 tot 35';
      if (b['modus'] !== undefined && b['modus'] !== 'verwarmen' && b['modus'] !== 'koelen') return 'klimaat: modus is verwarmen of koelen';
    }
  } else if (pad === 'api/witgoed') {
    if (!isId(b['id'], /^[\w.-]{1,120}$/) || b['start'] !== true) return 'witgoed: id en start';
  }
  return { pad, body: b };
}
