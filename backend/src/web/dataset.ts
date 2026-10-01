/**
 * Hoe compleet is de dataset?
 *
 * De schaduwmodus draait om één belofte: aantonen of de arbiter het beter doet.
 * Die belofte staat of valt met wat er *in* de opname zit. Vijf dagen september
 * zeggen niets over verwarmen, en een winter zonder één vakantieweek zegt niets
 * over de vakantiestand.
 *
 * Dit bestand telt daarom niet hoeveel er is opgenomen, maar **wat er is
 * langsgekomen**: welke modi, welke strategieën, welke richtingen, welke
 * blokkades. De gesloten unions uit de kern (`MODES`, `REASON_CODES`,
 * `BLOCK_CODES`, `ACTIONS`) zijn de lijst waar tegen wordt afgevinkt — daardoor
 * groeit deze meter automatisch mee zodra iemand een nieuwe reden of modus
 * toevoegt, in plaats van stilletjes achter te blijven.
 *
 * **Wat hier een oordeel is en geen meting.** De dagdoelen per seizoen zijn een
 * keuze op ervaring, net als `bufferBandC` (besluit 14): genoeg dagen om
 * variatie in weer en aanwezigheid te zien, niet meer. Ze staan hier expliciet
 * zodat je erover kunt twisten, in plaats van dat ze voor gemeten doorgaan.
 */

import { MODES, ACTIONS, type Mode } from '../core/model.js';
import { REASON_CODES, BLOCK_CODES } from '../core/decision.js';
import { readMoments, type Moment } from '../divergence/read.js';

/** De meteorologische seizoenen, op maandnummer. */
export type Season = 'winter' | 'lente' | 'zomer' | 'herfst';

const SEASON_OF_MONTH: readonly Season[] = [
  'winter', 'winter', 'lente', 'lente', 'lente', 'zomer',
  'zomer', 'zomer', 'herfst', 'herfst', 'herfst', 'winter',
];

/**
 * Hoeveel dagen per seizoen we nodig achten.
 *
 * Winter telt het zwaarst: daar doet de verwarming het werk, en daar zit het
 * hele deel van de regeling dat in een zomerdataset niet één keer afgaat.
 * Lente en herfst zijn de overgangen waar voorverwarmen en PV-koelen elkaar
 * afwisselen. Zomer is het goedkoopst om te krijgen en het minst leerzaam.
 *
 * Dit is een oordeel. Zie de kop van dit bestand.
 */
export const DAILY_TARGET: Readonly<Record<Season, number>> = {
  winter: 30,
  lente: 14,
  zomer: 14,
  herfst: 14,
};

/**
 * Eén ding dat gezien moet zijn.
 *
 * `gezien` telt de momenten, `dagen` het aantal verschillende dagen waarop het
 * voorkwam. Dat tweede is wat telt: iets dat één middag gebeurde is
 * waargenomen, niet aangetoond. `handmatig` stond op groen op grond van één
 * enkel moment van de drieëndertigduizend.
 */
export interface Coverage {
  readonly id: string;
  readonly gezien: number;
  readonly dagen: number;
  /**
   * 1 = gedekt, 0,5 = één dag gezien, 0 = nooit.
   *
   * Hier meegestuurd en niet in de weergave herrekend: dan zou de drempel op
   * twee plekken staan en kan hij uiteenlopen. Dat is de bugklasse waar dit
   * project vandaan komt.
   */
  readonly deel: number;
}

/**
 * Op hoeveel verschillende dagen iets moet zijn voorgekomen om te tellen.
 *
 * Twee. Eén dag kan toeval zijn of een handmatige test; op twee losse dagen
 * heeft de regeling het uit zichzelf gedaan. Dit is een oordeel, net als de
 * dagdoelen hierboven.
 */
export const DAYS_FOR_COVERAGE = 2;



export interface SeasonProgress {
  readonly seizoen: Season;
  /**
   * Opgenomen dagen, in echte dagen en niet in aangeraakte kalenderdagen.
   *
   * Een opname die om 17:11 begint levert die dag geen dag op maar een derde.
   * Gemeten als het aandeel uren van de dag waarin minstens één besluit staat;
   * dat is bestand tegen een gat en tegen twee losse records rond middernacht.
   */
  readonly dagen: number;
  readonly doel: number;
}

export interface DatasetStatus {
  readonly vanMs: number;
  readonly totMs: number;
  /**
   * Opgenomen dagen, in echte dagen.
   *
   * Niet "hoeveel kalenderdagen zijn aangeraakt": een opname die om vijf uur
   * 's middags begint en de volgende ochtend eindigt raakt twee dagen aan en
   * levert er ruim één op.
   */
  readonly dagenOpgenomen: number;
  /** Hoeveel kalenderdagen er minstens één regel hebben. */
  readonly kalenderdagenAangeraakt: number;
  /** Kalenderdagen tussen begin en eind, om gaten zichtbaar te maken. */
  readonly kalenderdagen: number;
  /** Dagen zonder één regel, tussen de eerste en de laatste. */
  readonly gatendagen: readonly string[];
  readonly momenten: number;
  readonly seizoenen: readonly SeasonProgress[];
  readonly modi: readonly Coverage[];
  readonly strategieen: readonly Coverage[];
  readonly richtingen: readonly Coverage[];
  readonly zoneRedenen: readonly Coverage[];
  readonly blokkades: readonly Coverage[];
  readonly failsafeMomenten: number;
  /**
   * Meetpunten die de regeling straks nodig heeft maar nu niet worden
   * vastgelegd. Een dataset die daar niet in voorziet is ook na een winter niet
   * compleet, en dat merk je pas als je hem gaat gebruiken.
   */
  readonly ontbrekendeInvoer: readonly { id: string; waarvoor: string }[];
  /** Eén getal plus de twee assen waar het uit komt. */
  readonly gereedheid: Readiness;
}

/**
 * Meetpunten die de dataset nodig heeft en die de meter zelf nakijkt.
 *
 * Eerst stond hier een vaste regel dat de buitentemperatuur ontbrak. Dat klopte
 * toen, en dat is precies het probleem met een vaste regel: sinds fase 6b wordt
 * hij wél vastgelegd (besluit 30) en zou de meter een onwaarheid zijn blijven
 * tonen. Nu telt hij hoeveel momenten er een waarde voor hebben en meldt het
 * alleen wanneer dat er geen zijn.
 */
const EXPECTED_INPUTS: readonly {
  id: string;
  purpose: string;
  present: (m: Moment) => boolean;
}[] = [
  {
    id: 'buitentemperatuur',
    purpose: 'nodig voor fase 7 (vooruitkijken)',
    present: (m) => m.outdoorC != null,
  },
  {
    id: 'opbrengst zonnepanelen',
    purpose: 'maat voor instraling; zonder deze kolom is niet te berekenen hoeveel de zon een kamer opwarmt',
    present: (m) => m.solarW != null,
  },
];

const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seasonOf = (ms: number): Season =>
  SEASON_OF_MONTH[new Date(ms).getMonth()] ?? 'winter';

/** Wat er van één soort is gezien: momenten en de dagen waarop. */
type Counter = Map<string, { n: number; days: Set<string> }>;

function count(m: Counter, key: string, day: string): void {
  let x = m.get(key);
  if (!x) {
    x = { n: 0, days: new Set() };
    m.set(key, x);
  }
  x.n += 1;
  x.days.add(day);
}

/**
 * Vult een lijst aan met alles wat nog niet is gezien, op nul.
 *
 * `negeer` houdt dingen buiten de checklist die er niet in horen. Concreet:
 * `arbiter:wind-down` is geen strategie maar de arbiter die afbouwt (besluit
 * 5). Die kwam via de opvangregel voor onbekende id's in de lijst terecht en
 * gaf een gratis punt in zowel de teller als de noemer — 3/4 in plaats van 2/3.
 */
function complete(
  seen: Counter,
  everything: readonly string[],
  ignore: (id: string) => boolean = () => false,
): Coverage[] {
  const make = (id: string): Coverage => {
    const x = seen.get(id);
    const days = x?.days.size ?? 0;
    return {
      id,
      gezien: x?.n ?? 0,
      dagen: days,
      deel: days >= DAYS_FOR_COVERAGE ? 1 : days === 1 ? 0.5 : 0,
    };
  };
  const result = everything.map(make);
  // Wat de kern niet kent maar wel in het logboek staat, hoort er ook bij:
  // anders verdwijnt een strategie die later is toegevoegd uit beeld.
  for (const id of seen.keys()) {
    if (!everything.includes(id) && !ignore(id)) result.push(make(id));
  }
  return result;
}

/**
 * Loopt de logboeken langs en telt wat er is langsgekomen.
 *
 * Let op de teller: modi worden per moment geteld, maar strategieën, redenen en
 * blokkades staan alleen in volledige records. Dat is geen fout in de meting —
 * die dingen wíjzigen alleen bij een nieuw besluit — maar het betekent dat de
 * getallen hier niet met elkaar te vergelijken zijn. Ze beantwoorden één vraag:
 * is dit ooit voorgekomen, en hoe vaak ongeveer.
 */
export async function datasetStatus(
  moments: AsyncIterable<Moment>,
): Promise<DatasetStatus | null> {
  const days = new Set<string>();
  /** Per dag de uren waarin iets is opgenomen; zo tellen halve dagen half. */
  const hoursPerDay = new Map<string, Set<number>>();
  const modes: Counter = new Map();
  const strategies: Counter = new Map();
  const directions: Counter = new Map();
  const zoneReasons: Counter = new Map();
  const blocks: Counter = new Map();

  let fromMs = Number.POSITIVE_INFINITY;
  let toMs = Number.NEGATIVE_INFINITY;
  let momentsTotal = 0;
  let failsafeMoments = 0;
  const inputSeen = new Map<string, number>();

  for await (const m of moments) {
    momentsTotal += 1;
    fromMs = Math.min(fromMs, m.tMs);
    toMs = Math.max(toMs, m.tMs);
    const day = dayKey(m.tMs);
    days.add(day);

    let hours = hoursPerDay.get(day);
    if (!hours) {
      hours = new Set();
      hoursPerDay.set(day, hours);
    }
    hours.add(new Date(m.tMs).getHours());

    if (m.mode !== 'onbekend') count(modes, m.mode, day);
    if (m.failsafe) failsafeMoments += 1;

    for (const inv of EXPECTED_INPUTS) {
      if (inv.present(m)) inputSeen.set(inv.id, (inputSeen.get(inv.id) ?? 0) + 1);
    }

    for (const a of m.accepted) {
      if (a.strategyId) count(strategies, a.strategyId, day);
    }
    // De richting is wat er werkelijk zou zijn gestuurd. `heat` is het
    // interessantste vakje van deze hele tabel: zolang dat leeg is, is de
    // verwarmingskant van de regeling nooit in het echt afgegaan.
    for (const c of m.commands) {
      if (c.kind === 'setAction' && c.action) count(directions, c.action, day);
    }
    for (const z of m.zones) {
      if (z.reason) count(zoneReasons, z.reason, day);
    }
    for (const r of m.rejected) count(blocks, r.blockedBy, day);
  }

  if (momentsTotal === 0) return null;

  // Seizoenen tellen per opgenomen dag, niet per moment: een dag met twintig
  // evaluaties is één dag, net als een dag met tienduizend.
  const perSeason = new Map<Season, number>();
  for (const day of days) {
    const s = seasonOf(Date.parse(`${day}T12:00:00`));
    // Het aandeel uren van die dag waarin iets is opgenomen. Een opname die om
    // 17:11 begint levert die dag geen dag op maar zeven vierentwintigste.
    const share = (hoursPerDay.get(day)?.size ?? 0) / 24;
    perSeason.set(s, (perSeason.get(s) ?? 0) + share);
  }
  const seasons: SeasonProgress[] = (
    ['winter', 'lente', 'zomer', 'herfst'] as const
  ).map((season) => ({
    seizoen: season,
    dagen: perSeason.get(season) ?? 0,
    doel: DAILY_TARGET[season],
  }));

  // Gaten: kalenderdagen tussen begin en eind waarop niets is opgenomen. Een
  // dienst die drie dagen stil lag hoort dat te laten zien.
  const gapDays: string[] = [];
  for (let t = fromMs; t <= toMs; t += 86_400_000) {
    const day = dayKey(t);
    if (!days.has(day)) gapDays.push(day);
  }

  const modeCoverage = complete(modes, [...MODES] as string[]);
  const directionCoverage = complete(directions, [...ACTIONS] as string[]);
  const reasonCoverage = complete(zoneReasons, [...REASON_CODES] as string[]);
  const blockCoverage = complete(blocks, [...BLOCK_CODES] as string[]);
  const strategyCoverage = complete(
    strategies,
    ['comfort', 'pv-surplus', 'heat-assist'],
    // Alles met het voorvoegsel `arbiter:` komt van de arbiter zelf en is geen
    // strategie. Zie `complete`.
    (id) => id.startsWith('arbiter:'),
  );

  return {
    vanMs: fromMs,
    totMs: toMs,
    dagenOpgenomen:
      Math.round(
        [...hoursPerDay.values()].reduce((n, u) => n + u.size / 24, 0) * 10,
      ) / 10,
    kalenderdagenAangeraakt: days.size,
    kalenderdagen: Math.max(1, Math.round((toMs - fromMs) / 86_400_000) + 1),
    gatendagen: gapDays,
    momenten: momentsTotal,
    seizoenen: seasons,
    modi: modeCoverage,
    strategieen: strategyCoverage,
    richtingen: directionCoverage,
    zoneRedenen: reasonCoverage,
    blokkades: blockCoverage,
    failsafeMomenten: failsafeMoments,
    ontbrekendeInvoer: EXPECTED_INPUTS.filter((inv) => (inputSeen.get(inv.id) ?? 0) === 0).map(
      ({ id, purpose }) => ({ id, waarvoor: purpose }),
    ),
    gereedheid: readinessOf(seasons, [
      modeCoverage,
      strategyCoverage,
      directionCoverage,
    ]),
  };
}

/** De twee assen apart, zodat de weergave ze naast het getal kan tonen. */
export interface Readiness {
  /** Heb je de seizoenen gezien. */
  readonly tijd: number;
  /** Is elk onderdeel van de regeling afgegaan, op genoeg losse dagen. */
  readonly dekking: number;
  readonly totaal: number;
}

/**
 * Eén percentage uit twee assen, meetkundig gemiddeld.
 *
 * *Eerst was dit het gewone gemiddelde,* en dat gaf een getal dat te vriendelijk
 * was: 8,9% tijd en 78,6% dekking werd 44%, terwijl er geen enkele
 * winterdag in zat. Rekenkundig middelen behandelt de twee als uitwisselbaar —
 * alsof veel functiedekking een tekort aan seizoenen kan goedmaken. Dat kan
 * niet: het zijn allebei *noodzakelijke* voorwaarden. Zonder winter valt er over
 * verwarmen niets aan te tonen, hoeveel zomerdagen je er ook tegenaan gooit.
 *
 * Het meetkundig gemiddelde doet dat wel goed. Het is nul zodra één as nul is,
 * het kan nooit ver boven de zwakste as uitkomen, en het blijft op beide assen
 * bewegen — anders dan het minimum, waarbij vooruitgang in dekking onzichtbaar
 * zou blijven tot de tijd is bijgetrokken.
 *
 * De zone- en blokkadecodes tellen hier bewust niet mee: sommige daarvan hóren
 * zeldzaam te zijn (`setpoint_out_of_range` is een fout), en dan zou een
 * gezonde installatie nooit op honderd procent uitkomen.
 */
function readinessOf(
  seasons: readonly SeasonProgress[],
  groups: readonly (readonly Coverage[])[],
): Readiness {
  const time =
    seasons.reduce((n, s) => n + Math.min(1, s.dagen / s.doel), 0) /
    seasons.length;

  const points = groups.flat();
  // Halve punten voor wat maar op één dag voorkwam: waargenomen, niet aangetoond.
  const coverage = points.reduce((n, p) => n + p.deel, 0) / Math.max(1, points.length);

  return {
    tijd: Math.round(time * 100),
    dekking: Math.round(coverage * 100),
    totaal: Math.round(Math.sqrt(time * coverage) * 100),
  };
}

/** Leest de logboeken en levert de stand. */
export async function statusFromFiles(
  files: readonly string[],
): Promise<DatasetStatus | null> {
  return datasetStatus(readMoments(files));
}

/** Alleen voor de leesbaarheid van de weergave. */
export type { Mode };
