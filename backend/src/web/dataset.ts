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
export type Seizoen = 'winter' | 'lente' | 'zomer' | 'herfst';

const SEIZOEN_VAN_MAAND: readonly Seizoen[] = [
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
export const DAGDOEL: Readonly<Record<Seizoen, number>> = {
  winter: 30,
  lente: 14,
  zomer: 14,
  herfst: 14,
};

/** Eén ding dat gezien moet zijn, met hoe vaak dat gebeurde. */
export interface Dekking {
  readonly id: string;
  readonly gezien: number;
}

export interface SeizoenStand {
  readonly seizoen: Seizoen;
  readonly dagen: number;
  readonly doel: number;
}

export interface DatasetStatus {
  readonly vanMs: number;
  readonly totMs: number;
  /** Dagen waarop werkelijk iets is opgenomen; niet de kalenderspanne. */
  readonly dagenOpgenomen: number;
  /** Kalenderdagen tussen begin en eind, om gaten zichtbaar te maken. */
  readonly kalenderdagen: number;
  /** Dagen zonder één regel, tussen de eerste en de laatste. */
  readonly gatendagen: readonly string[];
  readonly momenten: number;
  readonly seizoenen: readonly SeizoenStand[];
  readonly modi: readonly Dekking[];
  readonly strategieen: readonly Dekking[];
  readonly richtingen: readonly Dekking[];
  readonly zoneRedenen: readonly Dekking[];
  readonly blokkades: readonly Dekking[];
  readonly failsafeMomenten: number;
  /**
   * Meetpunten die de regeling straks nodig heeft maar nu niet worden
   * vastgelegd. Een dataset die daar niet in voorziet is ook na een winter niet
   * compleet, en dat merk je pas als je hem gaat gebruiken.
   */
  readonly ontbrekendeInvoer: readonly { id: string; waarvoor: string }[];
  /** Eén getal, zodat de voortgang in één oogopslag te zien is. */
  readonly gereedheid: number;
}

/**
 * Bekend, maar bewust niet vastgelegd.
 *
 * `sensor.temperatuur` staat als openstaand punt in DECISIONS.md: de huidige
 * strategieën gebruiken hem niet, dus hij wordt niet in het beslislogboek
 * meegeschreven. Voor fase 7 (vooruitkijken op weer en prognose) is hij
 * onmisbaar, en dan is de winterdataset die nu wordt opgebouwd er zonder.
 */
const ONTBREKENDE_INVOER: readonly { id: string; waarvoor: string }[] = [
  {
    id: 'sensor.temperatuur',
    waarvoor: 'buitentemperatuur, nodig voor fase 7 (vooruitkijken)',
  },
];

const dagSleutel = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seizoenVan = (ms: number): Seizoen =>
  SEIZOEN_VAN_MAAND[new Date(ms).getMonth()] ?? 'winter';

/** Vult een lijst aan met alles wat nog niet is gezien, op nul. */
function volledig(
  gezien: ReadonlyMap<string, number>,
  alles: readonly string[],
): Dekking[] {
  const uit = alles.map((id) => ({ id, gezien: gezien.get(id) ?? 0 }));
  // Wat de kern niet kent maar wel in het logboek staat, hoort er ook bij:
  // anders verdwijnt een strategie die later is toegevoegd uit beeld.
  for (const [id, n] of gezien) {
    if (!alles.includes(id)) uit.push({ id, gezien: n });
  }
  return uit;
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
  momenten: AsyncIterable<Moment>,
): Promise<DatasetStatus | null> {
  const dagen = new Set<string>();
  const modi = new Map<string, number>();
  const strategieen = new Map<string, number>();
  const richtingen = new Map<string, number>();
  const zoneRedenen = new Map<string, number>();
  const blokkades = new Map<string, number>();

  let vanMs = Number.POSITIVE_INFINITY;
  let totMs = Number.NEGATIVE_INFINITY;
  let momentenTotaal = 0;
  let failsafeMomenten = 0;

  const tel = (m: Map<string, number>, k: string): void => {
    m.set(k, (m.get(k) ?? 0) + 1);
  };

  for await (const m of momenten) {
    momentenTotaal += 1;
    vanMs = Math.min(vanMs, m.tMs);
    totMs = Math.max(totMs, m.tMs);
    dagen.add(dagSleutel(m.tMs));
    if (m.mode !== 'onbekend') tel(modi, m.mode);
    if (m.failsafe) failsafeMomenten += 1;

    for (const a of m.accepted) {
      if (a.strategyId) tel(strategieen, a.strategyId);
    }
    // De richting is wat er werkelijk zou zijn gestuurd. `heat` is het
    // interessantste vakje van deze hele tabel: zolang dat leeg is, is de
    // verwarmingskant van de regeling nooit in het echt afgegaan.
    for (const c of m.commands) {
      if (c.kind === 'setAction' && c.action) tel(richtingen, c.action);
    }
    for (const z of m.zones) {
      if (z.reason) tel(zoneRedenen, z.reason);
    }
    for (const r of m.rejected) tel(blokkades, r.blockedBy);
  }

  if (momentenTotaal === 0) return null;

  // Seizoenen tellen per opgenomen dag, niet per moment: een dag met twintig
  // evaluaties is één dag, net als een dag met tienduizend.
  const perSeizoen = new Map<Seizoen, number>();
  for (const dag of dagen) {
    const s = seizoenVan(Date.parse(`${dag}T12:00:00`));
    perSeizoen.set(s, (perSeizoen.get(s) ?? 0) + 1);
  }
  const seizoenen: SeizoenStand[] = (
    ['winter', 'lente', 'zomer', 'herfst'] as const
  ).map((seizoen) => ({
    seizoen,
    dagen: perSeizoen.get(seizoen) ?? 0,
    doel: DAGDOEL[seizoen],
  }));

  // Gaten: kalenderdagen tussen begin en eind waarop niets is opgenomen. Een
  // dienst die drie dagen stil lag hoort dat te laten zien.
  const gatendagen: string[] = [];
  for (let t = vanMs; t <= totMs; t += 86_400_000) {
    const dag = dagSleutel(t);
    if (!dagen.has(dag)) gatendagen.push(dag);
  }

  const modiDekking = volledig(modi, [...MODES] as string[]);
  const richtingDekking = volledig(richtingen, [...ACTIONS] as string[]);
  const redenDekking = volledig(zoneRedenen, [...REASON_CODES] as string[]);
  const blokkadeDekking = volledig(blokkades, [...BLOCK_CODES] as string[]);
  const strategieDekking = volledig(strategieen, [
    'comfort',
    'pv-surplus',
    'heat-assist',
  ]);

  return {
    vanMs,
    totMs,
    dagenOpgenomen: dagen.size,
    kalenderdagen: Math.max(1, Math.round((totMs - vanMs) / 86_400_000) + 1),
    gatendagen,
    momenten: momentenTotaal,
    seizoenen,
    modi: modiDekking,
    strategieen: strategieDekking,
    richtingen: richtingDekking,
    zoneRedenen: redenDekking,
    blokkades: blokkadeDekking,
    failsafeMomenten,
    ontbrekendeInvoer: ONTBREKENDE_INVOER,
    gereedheid: gereedheidVan(seizoenen, [
      modiDekking,
      strategieDekking,
      richtingDekking,
    ]),
  };
}

/**
 * Eén percentage, uit twee helften.
 *
 * De helft die telt is tijd: heb je de seizoenen gezien. De andere helft is
 * dekking: is elk onderdeel van de regeling ooit afgegaan. Beide even zwaar,
 * want een winter waarin de vakantiestand nooit aanstond is net zo onvolledig
 * als een volledige functiedekking van vijf dagen.
 *
 * `no_change_needed` en de zone- en blokkadecodes tellen hier bewust niet mee:
 * sommige daarvan horen zeldzaam te zijn (`setpoint_out_of_range` is een fout),
 * en dan zou een gezonde installatie nooit op honderd procent uitkomen.
 */
function gereedheidVan(
  seizoenen: readonly SeizoenStand[],
  groepen: readonly (readonly Dekking[])[],
): number {
  const tijd =
    seizoenen.reduce((n, s) => n + Math.min(1, s.dagen / s.doel), 0) /
    seizoenen.length;

  const punten = groepen.flat();
  const dekking = punten.filter((p) => p.gezien > 0).length / punten.length;

  return Math.round(((tijd + dekking) / 2) * 100);
}

/** Leest de logboeken en levert de stand. */
export async function statusVanBestanden(
  files: readonly string[],
): Promise<DatasetStatus | null> {
  return datasetStatus(readMoments(files));
}

/** Alleen voor de leesbaarheid van de weergave. */
export type { Mode };
