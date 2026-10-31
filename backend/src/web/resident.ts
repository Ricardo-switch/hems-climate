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
 * - **wat SunArc per apparaat zou doen**, met de reden;
 * - **wat een besluit deed en waarom**, voor de tijdlijn van Waarom.
 *
 * De pagina tekent en kiest de plek; rekenen en formuleren gebeurt hier, met
 * tests, in het Nederlands en het Engels.
 */

import type { Command, DeferrableExplanation, DeferrableStateCode } from '../core/decision.js';
import { FALLBACK_PROGRAM_MIN } from '../core/deferrable.js';
import type { Deferrable, SiteConfig } from '../core/model.js';
import { SHORT, cap, residentRooms, withArticle, type DecisionView, type Lang, type ResidentRoom } from './assistant.js';
import { clockIn, nextLocalTime, partsIn } from './today.js';
import { residentBuffers, type ResidentBuffer } from './buffers-bewoner.js';
import { BASIS_ZONDER_METER_W } from './energy.js';

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
  /** Positief van het net, negatief terug. 0 als het minder dan 0,05 kW is; null zonder slimme meter. */
  readonly netKw: number | null;
  /** Wat het hele huis nu gebruikt, de airco's meegeteld. */
  readonly verbruikKw: number | null;
  /** Wat de airco's werkelijk opnemen, gemeten. */
  readonly aircoKw: number;
  /** Het huis zonder de airco's. */
  readonly huisKw: number | null;
  /** Wat SunArc voor de airco's op zon gepland heeft. */
  readonly geplandKw: number;
  /**
   * Zonder slimme meter (besluit 196): wat er van de zon over is, geschat als
   * de zon min de airco's en een gewoon huis. Alleen dan staat het erin.
   */
  readonly overKw?: number | null;
  readonly geschat?: true;
}

export interface ResidentDevice {
  readonly actuatorId: string;
  readonly naam: string;
  /** `ok` voor een uitstelbaar apparaat dat zou starten of draait (besluit 98). */
  readonly soort: 'cool' | 'heat' | 'wait' | 'ok';
  readonly tekst: string;
}

/**
 * Een uitstelbaar apparaat voor het scherm Apparaten (besluit 101): wat het
 * doet, in een kop en een zin, en "klaar voor" als de bewoner dat koos.
 */
export interface ResidentDeferrable {
  readonly id: string;
  readonly naam: string;
  readonly stand: DeferrableStateCode;
  /** "Klaargezet · wacht op zon". */
  readonly kop: string;
  readonly zin: string;
  /** "18:00", of null als de bewoner geen tijd koos. */
  readonly klaarVoor: string | null;
  /** De start die uiterlijk nodig is: "15:12", of de vaste tijd uit de configuratie. */
  readonly uiterlijk: string | null;
  /** Hoe lang het gekozen programma duurt, als het apparaat dat meldt. */
  readonly duurMin: number | null;
  /** Hoe lang het nog duurt, in minuten, als het apparaat dat meldt (besluit 167). */
  readonly restMin: number | null;
  /**
   * Het drogen is klaar, maar de trommel draait nog af en toe tegen kreuken:
   * sinds wanneer, in epoch-ms; anders null (besluit 167).
   */
  readonly klaarSindsMs: number | null;
  /** Kan de bewoner nu "klaar voor" kiezen? Alleen als hij klaarstaat. */
  readonly kanKiezen: boolean;
  /** Tijden om uit te kiezen die nog te halen zijn: "18:00", "morgen 07:00". */
  readonly keuzes: readonly { readonly tekst: string; readonly waarde: string }[];
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
  /** De uitstelbare apparaten, voor het scherm Apparaten (besluit 101). */
  readonly uitstelbaar: readonly ResidentDeferrable[];
  /** De boiler en de jacuzzi, voor het scherm Apparaten (besluit 186). */
  readonly warmtebuffers: readonly ResidentBuffer[];
}

const MODE = {
  nl: { dag: 'Dag', nacht: 'Nacht', voorverwarmen: 'Voorverwarmen', afwezig: 'Afwezig', vakantie: 'Vakantie', handmatig: 'Handmatig' },
  en: { dag: 'Day', nacht: 'Night', voorverwarmen: 'Preheating', afwezig: 'Away', vakantie: 'Holiday', handmatig: 'Manual' },
} as const;

const HEAD = {
  nl: {
    now: 'Nu',
    chosen: ' (gekozen)',
    fault: ['Er is een storing', 'Een meting is onbetrouwbaar; SunArc zet de hulpapparaten veilig uit.'],
    one: (room: string, cool: boolean) => `${cap(room)} wordt ${cool ? 'gekoeld' : 'verwarmd'}`,
    many: 'Het huis wordt geregeld',
    // Tijdens de schaduw gebeurt het niet echt (besluit 124).
    oneWould: (room: string, cool: boolean) => `${cap(room)} zou ${cool ? 'koelen' : 'verwarmen'}`,
    // "Het huis zou regelen" las krom voor wie net begint (30 oktober 2026); de kamers eronder zeggen wat het zou doen.
    manyWould: 'Het huis kijkt mee',
    // De schaduw wil wat er al echt gebeurt (besluit 188): zoals het in huis is.
    manyReal: (rooms: string, cool: boolean) => `${cap(rooms)} worden ${cool ? 'gekoeld' : 'verwarmd'}`,
    // Onder de kop over één kamer de getallen, niet nog eens de kop (17 oktober 2026).
    numbers: (temp: string, goal: string | null) => `Het is er ${temp}°${goal != null ? `, het doel is ${goal}°` : ''}.`,
    ownSun: ' Dat kan op eigen zon.',
    waitSun: 'Het huis wacht op zon',
    // Koelen of verwarmen naar wat de kamers willen; eerst stond er altijd koelen (25 oktober 2026).
    waitSunWhy: (rooms: string, many: boolean, doen: string) => `${cap(rooms)} ${many ? 'willen' : 'wil'} ${doen} zodra er genoeg zon over is.`,
    // De zon is nog niet op, of komt vandaag niet meer genoeg (25 oktober 2026).
    waitSunNog: 'Nog geen zon',
    waitSunNogWhy: (rooms: string, many: boolean, doen: string) => `${cap(rooms)} ${many ? 'willen' : 'wil'} op zon ${doen} zodra de zon op is.`,
    waitSunWeg: 'Vandaag geen zon meer',
    waitSunWegWhy: (rooms: string, many: boolean, doen: string) => `${cap(rooms)} ${many ? 'kunnen' : 'kan'} morgen weer op zon ${doen}.`,
    doen: { heat: 'verwarmen', cool: 'koelen', beide: 'verwarmen of koelen' },
    waitOther: 'Er wacht iets',
    nothing: 'Er draait niets',
    // Een droger of wasmachine draait, en het klimaat is rustig (besluit 166).
    running: (names: string, many: boolean) => `${cap(names)} ${many ? 'draaien' : 'draait'}`,
    done: (names: string, many: boolean) => `${cap(names)} ${many ? 'zijn' : 'is'} klaar`,
    nothingSun: 'Geen kamer heeft iets nodig.',
    nothingDark: 'Geen zon, en geen kamer heeft iets nodig.',
    // Zonder slimme regeling (besluit 194): geen kamers om naar te kijken.
    nothingSunNoRooms: 'De zon schijnt, en er hoeft niets te draaien.',
    nothingDarkNoRooms: 'Geen zon, en er hoeft niets te draaien.',
    // De namen hebben hun lidwoord al (withArticle): eerst stond er "de de zolder" (31 oktober 2026).
    and: ' en ',
    comma: ', ',
    towards: 'naar',
    would: (what: string, why: string) => `zou ${what}, maar ${why}`,
    quiet: (names: string) => `${names}: niets te doen`,
    goal: (c: string) => `doel ${c}°`,
    stabilise: (min: number) => `Stabiliseren, ${min} minuten`,
    timer: (id: string) => `Timer ${id}`,
    deferrable: {
      surplus_available: () => 'zou nu starten: er is genoeg zon over',
      latest_start_reached: (t: string) => `zou nu starten: het is na ${t}`,
      ready_by_reached: () => 'zou nu starten: anders is hij niet op tijd klaar',
      surplus_insufficient: (t: string) => `wacht op zon, uiterlijk tot ${t}`,
      stabilisation_active: () => 'wacht een ronde: er is net iets gestart',
      insufficient_current_budget: () => 'wacht: de hoofdzekering zou te zwaar belast worden',
      failsafe_unreliable_input: () => 'wacht: een meting is onbetrouwbaar',
      mode_excludes_action: () => 'wacht: je regelt het huis nu zelf',
      program_running: () => 'draait een programma',
    } as Record<string, (t: string) => string>,
  },
  en: {
    now: 'Now',
    chosen: ' (chosen)',
    fault: ['There is a fault', 'A measurement is unreliable; SunArc switches the helper units off safely.'],
    one: (room: string, cool: boolean) => `${cap(room)} is being ${cool ? 'cooled' : 'heated'}`,
    many: 'The house is being managed',
    oneWould: (room: string, cool: boolean) => `${cap(room)} would ${cool ? 'cool' : 'heat'}`,
    manyWould: 'The house is watching',
    manyReal: (rooms: string, cool: boolean) => `${cap(rooms)} are being ${cool ? 'cooled' : 'heated'}`,
    numbers: (temp: string, goal: string | null) => `It is ${temp}° there${goal != null ? `, the target is ${goal}°` : ''}.`,
    ownSun: ' That can run on your own solar.',
    waitSun: 'The house is waiting for sun',
    waitSunWhy: (rooms: string, _many: boolean, doen: string) => `${cap(rooms)} will ${doen} as soon as there is enough solar to spare.`,
    waitSunNog: 'No sun yet',
    waitSunNogWhy: (rooms: string, _many: boolean, doen: string) => `${cap(rooms)} will ${doen} on solar once the sun is up.`,
    waitSunWeg: 'No more sun today',
    waitSunWegWhy: (rooms: string, _many: boolean, doen: string) => `${cap(rooms)} can ${doen} on solar again tomorrow.`,
    doen: { heat: 'heat', cool: 'cool', beide: 'heat or cool' },
    waitOther: 'Something is waiting',
    nothing: 'Nothing is running',
    running: (names: string, many: boolean) => `${cap(names)} ${many ? 'are' : 'is'} running`,
    done: (names: string, many: boolean) => `${cap(names)} ${many ? 'are' : 'is'} done`,
    nothingSun: 'No room needs anything.',
    nothingDark: 'No sun, and no room needs anything.',
    nothingSunNoRooms: 'The sun is shining, and nothing needs to run.',
    nothingDarkNoRooms: 'No sun, and nothing needs to run.',
    and: ' and ',
    comma: ', ',
    towards: 'at',
    would: (what: string, why: string) => `would be ${what}, but ${why}`,
    quiet: (names: string) => `${names}: nothing to do`,
    goal: (c: string) => `target ${c}°`,
    stabilise: (min: number) => `Settling, ${min} minutes`,
    timer: (id: string) => `Timer ${id}`,
    deferrable: {
      surplus_available: () => 'would start now: there is enough solar to spare',
      latest_start_reached: (t: string) => `would start now: it is past ${t}`,
      ready_by_reached: () => 'would start now: otherwise it will not be done in time',
      surplus_insufficient: (t: string) => `waiting for sun, until ${t} at the latest`,
      stabilisation_active: () => 'waiting a round: something just started',
      insufficient_current_budget: () => 'waiting: the main fuse would be overloaded',
      failsafe_unreliable_input: () => 'waiting: a measurement is unreliable',
      mode_excludes_action: () => 'waiting: you are running the house yourself',
      program_running: () => 'is running a programme',
    } as Record<string, (t: string) => string>,
  },
} as const;

/*
 * De sfeer van de kop (besluit 225): naar het dagdeel en het weer, en wisselend
 * per drie uur, zodat Thuis niet elke dag hetzelfde zegt en ook niet flikkert.
 * Eronder een samenvatting in plaats van "Zolder: zou verwarmen." per kamer; de
 * kamers zelf staan al in het huis.
 */
type Dagdeel = 'nacht' | 'ochtend' | 'middag' | 'avond';
const SFEER = {
  nl: {
    koud: { nacht: ['Koele nacht'], ochtend: ['Frisse ochtend', 'Koude start van de dag'], middag: ['Frisse middag', 'Het mag wat warmer'], avond: ['Koele avond', 'Het mag wat warmer'] },
    warm: { nacht: ['Warme nacht'], ochtend: ['Warme ochtend'], middag: ['Warme middag', 'Het mag wat koeler'], avond: ['Warme avond', 'Het mag wat koeler'] },
    rustig: { nacht: ['Rustige nacht', 'Het huis slaapt'], ochtend: ['Rustige ochtend', 'Alles op temperatuur'], middag: ['Alles op temperatuur', 'Rustig in huis'], avond: ['Rustige avond', 'Alles op temperatuur'] },
    zon: ['Alles op temperatuur', 'Zon op het dak', 'Rustig in huis'],
    fris: (room: string) => `${cap(room)} is fris`,
    warmKamer: (room: string) => `${cap(room)} is warm`,
    binnen: (lo: string, hi: string) => (lo === hi ? `Binnen ${lo}°` : `Binnen ${lo} tot ${hi}°`),
    buiten: (b: string) => `buiten ${b}°`,
    kouder: (kamers: string, veel: boolean) => `${cap(kamers)} ${veel ? 'zijn' : 'is'} kouder dan je wilt.`,
    warmer: (kamers: string, veel: boolean) => `${cap(kamers)} ${veel ? 'zijn' : 'is'} warmer dan je wilt.`,
    gemengd: 'Een paar kamers zijn kouder of warmer dan je wilt.',
    tel: (n: number) => `${['', 'Eén', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes', 'Zeven', 'Acht', 'Negen', 'Tien'][n] ?? n} kamers`,
    kijkt: ['Het huis kijkt nog mee.', 'Het huis kijkt mee en leert.'],
    panelen: (kw: string) => `Je panelen geven ${kw} kW.`,
    niets: 'Geen kamer heeft iets nodig.',
    buitenZin: (b: string) => `Buiten is het ${b}°.`,
  },
  en: {
    koud: { nacht: ['A cool night'], ochtend: ['A crisp morning', 'A chilly start'], middag: ['A crisp afternoon', 'It could be warmer'], avond: ['A cool evening', 'It could be warmer'] },
    warm: { nacht: ['A warm night'], ochtend: ['A warm morning'], middag: ['A warm afternoon', 'It could be cooler'], avond: ['A warm evening', 'It could be cooler'] },
    rustig: { nacht: ['A quiet night', 'The house is asleep'], ochtend: ['A quiet morning', 'All at temperature'], middag: ['All at temperature', 'All quiet at home'], avond: ['A quiet evening', 'All at temperature'] },
    zon: ['All at temperature', 'Sun on the roof', 'All quiet at home'],
    fris: (room: string) => `${cap(room)} is chilly`,
    warmKamer: (room: string) => `${cap(room)} is warm`,
    binnen: (lo: string, hi: string) => (lo === hi ? `Inside ${lo}°` : `Inside ${lo} to ${hi}°`),
    buiten: (b: string) => `outside ${b}°`,
    kouder: (kamers: string, veel: boolean) => `${cap(kamers)} ${veel ? 'are' : 'is'} colder than you like.`,
    warmer: (kamers: string, veel: boolean) => `${cap(kamers)} ${veel ? 'are' : 'is'} warmer than you like.`,
    gemengd: 'A few rooms are colder or warmer than you like.',
    tel: (n: number) => `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? n} rooms`,
    kijkt: ['The house is still watching.', 'The house is watching and learning.'],
    panelen: (kw: string) => `Your panels give ${kw} kW.`,
    niets: 'No room needs anything.',
    buitenZin: (b: string) => `It is ${b}° outside.`,
  },
} as const;

/** Het dagdeel in het huis zelf. */
function dagdeelVan(ms: number, tz: string): Dagdeel {
  const h = partsIn(ms, tz).h;
  return h < 6 ? 'nacht' : h < 12 ? 'ochtend' : h < 18 ? 'middag' : 'avond';
}
/** Een van de varianten, dezelfde voor drie uur: wisselend, maar zonder te flikkeren. */
const kies = <T>(lijst: readonly T[], ms: number): T => lijst[Math.floor(ms / 10_800_000) % lijst.length]!;

const round1 = (n: number) => Math.round(n * 10) / 10;
const decimal = (n: number, lang: Lang) => (lang === 'nl' ? String(round1(n)).replace('.', ',') : String(round1(n)));

/** "de woonkamer", "de zolder" → "de woonkamer en de zolder": de namen hebben hun lidwoord al. */
function joinRooms(names: readonly string[], lang: Lang): string {
  if (names.length <= 1) return names[0] ?? '';
  const w = HEAD[lang];
  return `${names.slice(0, -1).join(w.comma)}${w.and}${names[names.length - 1]}`;
}

export function residentHeadline(config: SiteConfig, snap: DecisionView, rooms: readonly ResidentRoom[], lang: Lang = 'nl', shadow = true): ResidentHeadline {
  const w = HEAD[lang];
  const e = snap.explanation;
  const boven = `${w.now} · ${MODE[lang][e.mode] ?? e.mode}${e.modeSource === 'override' ? w.chosen : ''}`;
  const named = rooms.map((r) => ({ r, name: config.zones.find((z) => z.id === r.zoneId)?.name ?? r.zoneId }));
  // Midden in een Nederlandse zin gaat een gewoon woord klein; in het Engels blijft een naam een naam.
  const mid = (name: string) => withArticle(name, lang);
  const line = (list: typeof named) => list.map(({ r, name }) => `${name}: ${r.kort.toLowerCase()}.`).join(' ');
  const active = named.filter(({ r }) => r.soort === 'cool' || r.soort === 'heat');
  const waiting = named.filter(({ r }) => r.soort === 'wait');
  if (e.failsafe.active) return { boven, titel: w.fault[0], zin: w.fault[1] };
  const s = SFEER[lang];
  const deel = dagdeelVan(snap.atMs, config.timezone);
  const buiten = e.outdoorTemperatureC != null ? decimal(e.outdoorTemperatureC, lang) : null;
  if (active.length > 0) {
    // In de schaduw "zou", tenzij het echte apparaat al doet wat het besluit wil (besluit 188).
    const echt = !shadow || active.every(({ r }) => r.klopt);
    const zelfde = active.every(({ r }) => r.soort === active[0]!.r.soort);
    const koel = active[0]!.r.soort === 'cool';
    // Meer kamers in de schaduw (besluit 225): de sfeer van het moment, en eronder één samenvatting.
    if (active.length > 1 && shadow && !(echt && zelfde)) {
      const temps = active.map(({ r }) => e.perZone.find((z) => z.zoneId === r.zoneId)?.temperatureC).filter((t): t is number => t != null);
      const binnen = temps.length ? s.binnen(decimal(Math.min(...temps), lang), decimal(Math.max(...temps), lang)) : null;
      const kamers = active.length > 3 ? s.tel(active.length) : joinRooms(active.map(({ name }) => mid(name)), lang);
      const wat = !zelfde ? s.gemengd : koel ? s.warmer(kamers, true) : s.kouder(kamers, true);
      const getal = binnen ? `${binnen}${buiten != null ? `, ${s.buiten(buiten)}` : ''}.` : null;
      return { boven, titel: kies(zelfde ? (koel ? s.warm : s.koud)[deel] : [w.manyWould], snap.atMs), zin: [getal, wat, kies(s.kijkt, snap.atMs)].filter((x) => x != null).join(' ') };
    }
    const titel =
      active.length === 1
        ? echt
          ? w.one(mid(active[0]!.name), koel)
          : (koel ? s.warmKamer : s.fris)(mid(active[0]!.name))
        : !shadow
          ? w.many
          : w.manyReal(joinRooms(active.map(({ name }) => mid(name)), lang), koel);
    // Eén kamer: de kop zegt het al, dus eronder hoe warm het er is en wat het doel is.
    const een = active.length === 1 ? e.perZone.find((z) => z.zoneId === active[0]!.r.zoneId) : undefined;
    const getallen =
      een?.temperatureC != null
        ? w.numbers(decimal(een.temperatureC, lang), een.targetC != null ? decimal(een.targetC, lang) : null) + (active[0]!.r.kort.endsWith(SHORT[lang].onSun) ? w.ownSun : '')
        : null;
    return { boven, titel, zin: [getallen ?? line(active), line(waiting)].filter((x) => x !== '').join(' ') };
  }
  if (waiting.length > 0) {
    const s = SHORT[lang];
    const onSun = waiting.every(({ r }) => r.kort === s.waitSun || r.kort === s.waitSunOp || r.kort === s.waitSunMorgen);
    if (!onSun) return { boven, titel: w.waitOther, zin: line(waiting) };
    // Wat de kamers willen: verwarmen, koelen, of allebei.
    const vraag = new Set(waiting.map(({ r }) => e.perZone.find((z) => z.zoneId === r.zoneId)?.demand).filter((x) => x === 'heat' || x === 'cool'));
    const doen = vraag.size === 1 ? w.doen[[...vraag][0] as 'heat' | 'cool'] : vraag.size === 2 ? w.doen.beide : w.doen.cool;
    const kamersZin = joinRooms(waiting.map(({ name }) => mid(name)), lang);
    const veel = waiting.length > 1;
    if (snap.zonNu === 'weg') return { boven, titel: w.waitSunWeg, zin: w.waitSunWegWhy(kamersZin, veel, doen) };
    if (snap.zonNu === 'nog') return { boven, titel: w.waitSunNog, zin: w.waitSunNogWhy(kamersZin, veel, doen) };
    return { boven, titel: w.waitSun, zin: w.waitSunWhy(kamersZin, veel, doen) };
  }
  const solar = e.solarProductionW;
  const zonder = config.zones.length === 0;
  const zonOp = solar != null && solar > 30;
  // Niets te doen (besluit 225): wat de panelen geven en hoe het buiten is, in plaats van "Geen zon, en …".
  const zin = zonder
    ? zonOp
      ? w.nothingSunNoRooms
      : w.nothingDarkNoRooms
    : [zonOp ? s.panelen(decimal(solar / 1000, lang)) : null, s.niets, buiten != null ? s.buitenZin(buiten) : null].filter((x) => x != null).join(' ');
  // Geen kamer heeft iets nodig, maar de droger draait: dan niet "Er draait niets" (besluit 166).
  const naam = (id: string) => config.deferrables?.find((x) => x.id === id)?.name ?? id;
  const draait = (e.deferrables ?? []).filter((d) => d.state === 'running' && d.doneSinceMs == null).map((d) => naam(d.id));
  if (draait.length > 0) return { boven, titel: w.running(joinRooms(draait.map((n) => mid(n)), lang), draait.length > 1), zin };
  // Klaar met drogen, maar nog tegen kreuken: dan "De droger is klaar" (besluit 167).
  const klaar = (e.deferrables ?? []).filter((d) => d.state === 'running' && d.doneSinceMs != null).map((d) => naam(d.id));
  if (klaar.length > 0) return { boven, titel: w.done(joinRooms(klaar.map((n) => mid(n)), lang), klaar.length > 1), zin };
  return { boven, titel: kies(zonOp ? s.zon : s.rustig[deel], snap.atMs), zin };
}

export function residentFlows(snap: DecisionView, metMeter = true): ResidentFlows {
  const e = snap.explanation;
  const zonKw = e.solarProductionW == null ? null : round1(Math.max(0, e.solarProductionW) / 1000);
  // Zonder slimme meter is het net onbekend (besluit 196): niet "0 kW van het net", maar wat er geschat over is.
  if (!metMeter) {
    const aircoKw = round1((e.budget.reclaimableW ?? 0) / 1000);
    const overKw = zonKw == null ? null : Math.max(0, round1(zonKw - aircoKw - BASIS_ZONDER_METER_W / 1000));
    return { zonKw, netKw: null, verbruikKw: null, aircoKw, huisKw: null, geplandKw: round1((e.budget.allocatedW ?? 0) / 1000), overKw, geschat: true };
  }
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
  // De uitstelbare apparaten (besluit 98): wat de droger nu zou doen.
  for (const dx of snap.explanation.deferrables ?? []) {
    const d = config.deferrables?.find((x) => x.id === dx.id);
    if (!d) continue;
    const say = w.deferrable[dx.reason];
    if (dx.state === 'not_ready' || dx.state === 'unknown' || say == null) {
      quiet.push(d.name);
      continue;
    }
    const soort = dx.state === 'would_start' || dx.state === 'running' ? 'ok' : 'wait';
    apparaten.push({ actuatorId: d.id, naam: d.name, soort, tekst: say(latestText(config, d, dx)) });
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
    kop: residentHeadline(config, snap, kamers, lang, shadow),
    stromen: residentFlows(snap, config.power?.gridPower != null),
    apparaten,
    rust,
    besluit: snap.commands.length > 0 ? decisionWords(config, snap.commands, redenen, lang) : null,
    uitstelbaar: residentDeferrables(config, snap.explanation.deferrables ?? [], snap.atMs, lang),
    warmtebuffers: residentBuffers(config, snap.explanation.heatStores ?? [], snap.atMs, lang),
  };
}

/** De uiterlijke start in woorden: met "klaar voor" berekend, anders de vaste tijd. */
function latestText(config: SiteConfig, d: Deferrable, dx: DeferrableExplanation): string {
  return dx.latestStartMs != null ? clockIn(dx.latestStartMs, config.timezone) : d.latestStart;
}

const DEFERRABLE_WORDS = {
  nl: {
    kop: {
      not_ready: 'Niet klaargezet',
      finished: 'Klaar · het programma is afgelopen',
      unknown: 'Niet te lezen',
      running: 'Draait',
      done: 'Klaar · draait nog tegen kreuken',
      waiting: 'Klaargezet · wacht op zon',
      waitingOther: 'Klaargezet · wacht',
      would_start: 'Klaargezet · zou nu starten',
    },
    notReady: (n: string) => `Kies een programma, sluit de deur en zet "op afstand starten" aan op de ${n}. Dan kies ik het moment.`,
    finished: 'Het programma is afgelopen. Zet een nieuw programma klaar om hem weer op zon te laten draaien.',
    unknown: 'Home Connect geeft nu geen stand door.',
    running: (by: string | null) => (by ? `Het programma loopt; hij is op tijd voor ${by}.` : 'Het programma loopt.'),
    done: (sinds: string) => `Het drogen is klaar sinds ${sinds}. De trommel draait nog af en toe tegen kreuken, tot je de deur opent.`,
    waitSun: (latest: string, by: string | null) =>
      by
        ? `Ik begin zodra er zon over is. Komt er niet genoeg, dan begin ik om ${latest}, op tijd voor ${by}.`
        : `Ik begin zodra er zon over is, en uiterlijk om ${latest}.`,
    waitOther: (why: string) => `${why[0]!.toUpperCase()}${why.slice(1)}.`,
    sun: 'Er is genoeg zon over: ik zou hem nu starten.',
    late: (latest: string) => `Het is na ${latest}: ik zou hem nu starten, ook zonder zon.`,
    readyBy: (by: string) => `Ik zou hem nu starten, anders is hij niet op tijd klaar voor ${by}.`,
  },
  en: {
    kop: {
      not_ready: 'Not set up',
      finished: 'Done · the programme has finished',
      unknown: 'Cannot be read',
      running: 'Running',
      done: 'Done · still turning against creases',
      waiting: 'Set up · waiting for sun',
      waitingOther: 'Set up · waiting',
      would_start: 'Set up · would start now',
    },
    notReady: (n: string) => `Choose a programme, close the door and turn on "remote start" on the ${n}. Then I choose the moment.`,
    finished: 'The programme has finished. Set up a new one to run it on solar again.',
    unknown: 'Home Connect is not reporting a state right now.',
    running: (by: string | null) => (by ? `The programme is running; it will be done by ${by}.` : 'The programme is running.'),
    done: (since: string) => `Drying has been done since ${since}. The drum still turns now and then against creases, until you open the door.`,
    waitSun: (latest: string, by: string | null) =>
      by
        ? `I start as soon as there is solar to spare. If there is not enough, I start at ${latest}, in time for ${by}.`
        : `I start as soon as there is solar to spare, and at ${latest} at the latest.`,
    waitOther: (why: string) => `${why[0]!.toUpperCase()}${why.slice(1)}.`,
    sun: 'There is enough solar to spare: I would start it now.',
    late: (latest: string) => `It is past ${latest}: I would start it now, even without sun.`,
    readyBy: (by: string) => `I would start it now, otherwise it will not be done by ${by}.`,
  },
} as const;

/** De uitstelbare apparaten voor het scherm Apparaten (besluit 101). */
export function residentDeferrables(config: SiteConfig, list: readonly DeferrableExplanation[], nowMs: number, lang: Lang = 'nl'): ResidentDeferrable[] {
  const w = DEFERRABLE_WORDS[lang];
  const say = HEAD[lang].deferrable;
  return (config.deferrables ?? []).flatMap((d): ResidentDeferrable[] => {
    const dx = list.find((x) => x.id === d.id);
    if (!dx) return [];
    const by = dx.readyByMs != null ? clockIn(dx.readyByMs, config.timezone) : null;
    const latest = latestText(config, d, dx);
    let kop: string;
    let zin: string;
    if (dx.state === 'not_ready' && dx.reason === 'program_finished') [kop, zin] = [w.kop.finished, w.finished];
    else if (dx.state === 'not_ready') [kop, zin] = [w.kop.not_ready, w.notReady(d.name.toLowerCase())];
    else if (dx.state === 'unknown') [kop, zin] = [w.kop.unknown, w.unknown];
    else if (dx.state === 'running' && dx.doneSinceMs != null) [kop, zin] = [w.kop.done, w.done(clockIn(dx.doneSinceMs, config.timezone))];
    else if (dx.state === 'running') [kop, zin] = [by ? `${w.kop.running} · ${by}` : w.kop.running, w.running(by)];
    else if (dx.state === 'would_start') {
      kop = w.kop.would_start;
      zin = dx.reason === 'surplus_available' ? w.sun : dx.reason === 'ready_by_reached' && by ? w.readyBy(by) : w.late(latest);
    } else if (dx.reason === 'surplus_insufficient') [kop, zin] = [w.kop.waiting, w.waitSun(latest, by)];
    else [kop, zin] = [w.kop.waitingOther, w.waitOther(say[dx.reason]?.(latest) ?? dx.reason)];
    return [
      {
        id: d.id,
        naam: d.name,
        stand: dx.state,
        kop,
        zin,
        klaarVoor: by,
        uiterlijk: dx.state === 'waiting' || dx.state === 'would_start' ? latest : null,
        duurMin: dx.durationMin ?? null,
        restMin: dx.remainingMin ?? null,
        klaarSindsMs: dx.doneSinceMs ?? null,
        kanKiezen: dx.state === 'waiting' || dx.state === 'would_start',
        keuzes: dx.state === 'waiting' || dx.state === 'would_start' ? readyChoices(config, nowMs, dx.durationMin ?? FALLBACK_PROGRAM_MIN, lang) : [],
      },
    ];
  });
}

/**
 * Drie tijden voor "klaar voor" die nog te halen zijn: niet vóór nu plus de
 * duur van het programma. Vandaag als "18:00", anders "morgen 07:00".
 */
function readyChoices(config: SiteConfig, nowMs: number, durationMin: number, lang: Lang): { tekst: string; waarde: string }[] {
  const earliest = nowMs + durationMin * 60_000;
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(ms);
  return ['07:00', '12:00', '15:00', '18:00', '21:00']
    .map((waarde) => ({ waarde, ms: nextLocalTime(nowMs, waarde, config.timezone) }))
    .filter((c) => c.ms >= earliest)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 3)
    .map((c) => ({ waarde: c.waarde, tekst: dayOf(c.ms) === dayOf(nowMs) ? c.waarde : `${lang === 'nl' ? 'morgen' : 'tomorrow'} ${c.waarde}` }));
}
