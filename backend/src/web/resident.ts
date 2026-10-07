/**
 * Het bewonerscontract voor Thuis en Waarom (besluiten 76 en 94).
 *
 * De proefomgeving wordt de app en blijft dun: wat hij laat zien, komt
 * kant-en-klaar uit de dienst. De stand per kamer kwam er al uit
 * (`residentRooms`); hier de rest van Thuis en de woorden bij een besluit:
 *
 * - **de kop**: "Het huis wacht op zon", met een zin eronder;
 * - **de stromen** in de tekening, in kW en zo afgerond dat ze optellen: zon
 *   plus net is wat het huis gebruikt, en dat is de airco plus de rest;
 * - **wat Smart Climate per apparaat zou doen**, met de reden;
 * - **wat een besluit deed en waarom**, voor de tijdlijn van Waarom.
 *
 * De pagina tekent en kiest de plek; rekenen en formuleren gebeurt hier, met
 * tests, in het Nederlands en het Engels.
 */

import type { Command } from '../core/decision.js';
import type { SiteConfig } from '../core/model.js';
import { SHORT, inSentence, residentRooms, type DecisionView, type Lang, type ResidentRoom } from './assistant.js';

export interface ResidentHeadline {
  /** "Nu · Dag", met "(gekozen)" als de bewoner de modus koos. */
  readonly boven: string;
  readonly titel: string;
  readonly zin: string;
}

/**
 * De stromen van dit moment in kW, op 0,1 afgerond. `verbruik` is zon plus net
 * van de afgeronde getallen, zodat de tekening nooit "0,6 zon, 0,4 huis, 0,1
 * terug" zegt. Null zonder zonmeting.
 */
export interface ResidentFlows {
  readonly zonKw: number | null;
  /** Positief van het net, negatief terug. 0 als het minder dan 0,05 kW is. */
  readonly netKw: number;
  /** Wat het hele huis nu gebruikt, de airco's meegeteld. */
  readonly verbruikKw: number | null;
  /** Wat de airco's werkelijk opnemen, gemeten. */
  readonly aircoKw: number;
  /** Het huis zonder de airco's. */
  readonly huisKw: number | null;
  /** Wat Smart Climate voor de airco's op zon gepland heeft. */
  readonly geplandKw: number;
}

export interface ResidentDevice {
  readonly actuatorId: string;
  readonly naam: string;
  readonly soort: 'cool' | 'heat' | 'wait';
  readonly tekst: string;
}

export interface ResidentDecisionWords {
  /** Wat er verandert, per opdracht: "Airco woonkamer: koelen". */
  readonly wat: readonly string[];
  /** Waarom, per apparaat: "Airco woonkamer: er is zon over". */
  readonly waarom: readonly string[];
}

export interface ResidentView {
  readonly kamers: readonly ResidentRoom[];
  readonly kop: ResidentHeadline;
  readonly stromen: ResidentFlows;
  readonly apparaten: readonly ResidentDevice[];
  /** De apparaten zonder iets te doen, op één regel; null als die er niet zijn. */
  readonly rust: string | null;
  /** De woorden bij dit besluit als het iets veranderde; anders null. */
  readonly besluit: ResidentDecisionWords | null;
}

const MODE = {
  nl: { dag: 'Dag', nacht: 'Nacht', voorverwarmen: 'Voorverwarmen', afwezig: 'Afwezig', vakantie: 'Vakantie', handmatig: 'Handmatig' },
  en: { dag: 'Day', nacht: 'Night', voorverwarmen: 'Preheating', afwezig: 'Away', vakantie: 'Holiday', handmatig: 'Manual' },
} as const;

const HEAD = {
  nl: {
    now: 'Nu',
    chosen: ' (gekozen)',
    fault: ['Er is een storing', 'Een meting is onbetrouwbaar; Smart Climate zet de hulpapparaten veilig uit.'],
    one: (room: string, cool: boolean) => `De ${room} wordt ${cool ? 'gekoeld' : 'verwarmd'}`,
    many: 'Het huis wordt geregeld',
    waitSun: 'Het huis wacht op zon',
    waitSunWhy: (rooms: string, many: boolean) => `De ${rooms} ${many ? 'willen' : 'wil'} koelen zodra er genoeg zon over is.`,
    waitOther: 'Er wacht iets',
    nothing: 'Er draait niets',
    nothingSun: 'Geen kamer heeft iets nodig.',
    nothingDark: 'Geen zon, en geen kamer heeft iets nodig.',
    and: ' en de ',
    comma: ', de ',
    towards: 'naar',
    would: (what: string, why: string) => `zou ${what}, maar ${why}`,
    quiet: (names: string) => `${names}: niets te doen`,
    goal: (c: string) => `doel ${c}°`,
    stabilise: (min: number) => `Stabiliseren, ${min} minuten`,
    timer: (id: string) => `Timer ${id}`,
  },
  en: {
    now: 'Now',
    chosen: ' (chosen)',
    fault: ['There is a fault', 'A measurement is unreliable; Smart Climate switches the helper units off safely.'],
    one: (room: string, cool: boolean) => `The ${room} is being ${cool ? 'cooled' : 'heated'}`,
    many: 'The house is being managed',
    waitSun: 'The house is waiting for sun',
    waitSunWhy: (rooms: string) => `The ${rooms} will cool as soon as there is enough solar to spare.`,
    waitOther: 'Something is waiting',
    nothing: 'Nothing is running',
    nothingSun: 'No room needs anything.',
    nothingDark: 'No sun, and no room needs anything.',
    and: ' and the ',
    comma: ', the ',
    towards: 'at',
    would: (what: string, why: string) => `would be ${what}, but ${why}`,
    quiet: (names: string) => `${names}: nothing to do`,
    goal: (c: string) => `target ${c}°`,
    stabilise: (min: number) => `Settling, ${min} minutes`,
    timer: (id: string) => `Timer ${id}`,
  },
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const decimal = (n: number, lang: Lang) => (lang === 'nl' ? String(round1(n)).replace('.', ',') : String(round1(n)));

/** "woonkamer", "zolder" → "woonkamer en de zolder". */
function joinRooms(names: readonly string[], lang: Lang): string {
  if (names.length <= 1) return names[0] ?? '';
  const w = HEAD[lang];
  return `${names.slice(0, -1).join(w.comma)}${w.and}${names[names.length - 1]}`;
}

export function residentHeadline(config: SiteConfig, snap: DecisionView, rooms: readonly ResidentRoom[], lang: Lang = 'nl'): ResidentHeadline {
  const w = HEAD[lang];
  const e = snap.explanation;
  const boven = `${w.now} · ${MODE[lang][e.mode] ?? e.mode}${e.modeSource === 'override' ? w.chosen : ''}`;
  const named = rooms.map((r) => ({ r, name: config.zones.find((z) => z.id === r.zoneId)?.name ?? r.zoneId }));
  // Midden in een Nederlandse zin gaat een gewoon woord klein; in het Engels blijft een naam een naam.
  const mid = (name: string) => (lang === 'nl' ? inSentence(name) : name);
  const line = (list: typeof named) => list.map(({ r, name }) => `${name}: ${r.kort.toLowerCase()}.`).join(' ');
  const active = named.filter(({ r }) => r.soort === 'cool' || r.soort === 'heat');
  const waiting = named.filter(({ r }) => r.soort === 'wait');
  if (e.failsafe.active) return { boven, titel: w.fault[0], zin: w.fault[1] };
  if (active.length > 0) {
    const titel = active.length === 1 ? w.one(mid(active[0]!.name), active[0]!.r.soort === 'cool') : w.many;
    return { boven, titel, zin: [line(active), line(waiting)].filter((x) => x !== '').join(' ') };
  }
  if (waiting.length > 0) {
    const onSun = waiting.every(({ r }) => r.kort === SHORT[lang].waitSun);
    if (!onSun) return { boven, titel: w.waitOther, zin: line(waiting) };
    return { boven, titel: w.waitSun, zin: w.waitSunWhy(joinRooms(waiting.map(({ name }) => mid(name)), lang), waiting.length > 1) };
  }
  const solar = e.solarProductionW;
  return { boven, titel: w.nothing, zin: solar != null && solar > 30 ? w.nothingSun : w.nothingDark };
}

export function residentFlows(snap: DecisionView): ResidentFlows {
  const e = snap.explanation;
  const zonKw = e.solarProductionW == null ? null : round1(Math.max(0, e.solarProductionW) / 1000);
  // -0 wordt 0: "0 kW terug" bestaat niet.
  const netKw = round1(e.budget.gridPowerW / 1000) || 0;
  const verbruikKw = zonKw == null ? null : Math.max(0, round1(zonKw + netKw));
  const aircoKw = round1((e.budget.reclaimableW ?? 0) / 1000);
  const huisKw = verbruikKw == null ? null : Math.max(0, round1(verbruikKw - aircoKw));
  return { zonKw, netKw, verbruikKw, aircoKw, huisKw, geplandKw: round1((e.budget.allocatedW ?? 0) / 1000) };
}

export function residentDevices(config: SiteConfig, snap: DecisionView, lang: Lang = 'nl'): { apparaten: ResidentDevice[]; rust: string | null } {
  const short = SHORT[lang];
  const w = HEAD[lang];
  const apparaten: ResidentDevice[] = [];
  const quiet: string[] = [];
  for (const a of config.actuators) {
    const acc = snap.accepted.find((i) => i.actuatorId === a.id);
    const rej = snap.rejected.find((r) => r.intent.actuatorId === a.id);
    if (acc && (acc.action === 'cool' || acc.action === 'heat')) {
      const at = acc.setpointC != null ? ` ${w.towards} ${decimal(acc.setpointC, lang)}°` : '';
      apparaten.push({ actuatorId: a.id, naam: a.name, soort: acc.action, tekst: `${short.action[acc.action]}${at} · ${short.reason[acc.reason]}` });
    } else if (rej) {
      const what = short.action[rej.intent.action] ?? rej.intent.action;
      apparaten.push({ actuatorId: a.id, naam: a.name, soort: 'wait', tekst: w.would(what, short.block[rej.blockedBy]) });
    } else {
      quiet.push(a.name);
    }
  }
  return { apparaten, rust: quiet.length ? w.quiet(quiet.join(', ')) : null };
}

/** Een opdracht in woorden: "Airco woonkamer: koelen", "Stabiliseren, 5 minuten". */
export function describeCommand(config: SiteConfig, c: Command, lang: Lang = 'nl'): string {
  const w = HEAD[lang];
  const short = SHORT[lang];
  if (c.kind === 'setAction' || c.kind === 'setSetpoint') {
    const who = config.actuators.find((a) => a.id === c.actuatorId)?.name ?? c.actuatorId;
    return c.kind === 'setAction' ? `${who}: ${short.action[c.action] ?? c.action}` : `${who}: ${w.goal(decimal(c.setpointC, lang))}`;
  }
  if (c.kind === 'startTimer') return c.timerId === 'stabilisation' ? w.stabilise(Math.round(c.durationS / 60)) : w.timer(c.timerId);
  return w.timer(c.timerId);
}

/**
 * De woorden bij een besluit: wat er verandert en waarom. `redenen` zijn de
 * voorstellen die een opdracht kregen, zoals het logboek ze bewaart.
 */
export function decisionWords(
  config: SiteConfig,
  commands: readonly Command[],
  redenen: readonly { actuatorId: string; actie: string; reden: string | null }[],
  lang: Lang = 'nl',
): ResidentDecisionWords {
  const short = SHORT[lang];
  const name = (id: string) => config.actuators.find((a) => a.id === id)?.name ?? id;
  const why = (r: (typeof redenen)[number]) => {
    const reason = r.reden == null ? null : (short.reason as Record<string, string>)[r.reden] ?? r.reden;
    return `${name(r.actuatorId)}: ${reason ?? short.action[r.actie] ?? r.actie}`;
  };
  return { wat: commands.map((c) => describeCommand(config, c, lang)), waarom: redenen.map(why) };
}

export function residentView(config: SiteConfig, snap: DecisionView, lang: Lang = 'nl', shadow = true): ResidentView {
  const kamers = residentRooms(config, snap, lang, shadow);
  const { apparaten, rust } = residentDevices(config, snap, lang);
  const touched = new Set(snap.commands.flatMap((c) => ('actuatorId' in c ? [c.actuatorId] : [])));
  const redenen = snap.accepted
    .filter((i) => touched.has(i.actuatorId))
    .map((i) => ({ actuatorId: i.actuatorId, actie: i.action, reden: i.reason }));
  return {
    kamers,
    kop: residentHeadline(config, snap, kamers, lang),
    stromen: residentFlows(snap),
    apparaten,
    rust,
    besluit: snap.commands.length > 0 ? decisionWords(config, snap.commands, redenen, lang) : null,
  };
}
