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

/**
 * Eén ding dat gezien moet zijn.
 *
 * `gezien` telt de momenten, `dagen` het aantal verschillende dagen waarop het
 * voorkwam. Dat tweede is wat telt: iets dat één middag gebeurde is
 * waargenomen, niet aangetoond. `handmatig` stond op groen op grond van één
 * enkel moment van de drieëndertigduizend.
 */
export interface Dekking {
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
export const DAGEN_VOOR_DEKKING = 2;



export interface SeizoenStand {
  readonly seizoen: Seizoen;
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
  /** Eén getal plus de twee assen waar het uit komt. */
  readonly gereedheid: Gereedheid;
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
const VERWACHTE_INVOER: readonly {
  id: string;
  waarvoor: string;
  aanwezig: (m: Moment) => boolean;
}[] = [
  {
    id: 'buitentemperatuur',
    waarvoor: 'nodig voor fase 7 (vooruitkijken)',
    aanwezig: (m) => m.outdoorC != null,
  },
  {
    id: 'opbrengst zonnepanelen',
    waarvoor: 'maat voor instraling; zonder deze kolom is niet te berekenen hoeveel de zon een kamer opwarmt',
    aanwezig: (m) => m.solarW != null,
  },
];

const dagSleutel = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seizoenVan = (ms: number): Seizoen =>
  SEIZOEN_VAN_MAAND[new Date(ms).getMonth()] ?? 'winter';

/** Wat er van één soort is gezien: momenten en de dagen waarop. */
type Teller = Map<string, { n: number; dagen: Set<string> }>;

function tel(m: Teller, sleutel: string, dag: string): void {
  let x = m.get(sleutel);
  if (!x) {
    x = { n: 0, dagen: new Set() };
    m.set(sleutel, x);
  }
  x.n += 1;
  x.dagen.add(dag);
}

/**
 * Vult een lijst aan met alles wat nog niet is gezien, op nul.
 *
 * `negeer` houdt dingen buiten de checklist die er niet in horen. Concreet:
 * `arbiter:wind-down` is geen strategie maar de arbiter die afbouwt (besluit
 * 5). Die kwam via de opvangregel voor onbekende id's in de lijst terecht en
 * gaf een gratis punt in zowel de teller als de noemer — 3/4 in plaats van 2/3.
 */
function volledig(
  gezien: Teller,
  alles: readonly string[],
  negeer: (id: string) => boolean = () => false,
): Dekking[] {
  const maak = (id: string): Dekking => {
    const x = gezien.get(id);
    const dagen = x?.dagen.size ?? 0;
    return {
      id,
      gezien: x?.n ?? 0,
      dagen,
      deel: dagen >= DAGEN_VOOR_DEKKING ? 1 : dagen === 1 ? 0.5 : 0,
    };
  };
  const uit = alles.map(maak);
  // Wat de kern niet kent maar wel in het logboek staat, hoort er ook bij:
  // anders verdwijnt een strategie die later is toegevoegd uit beeld.
  for (const id of gezien.keys()) {
    if (!alles.includes(id) && !negeer(id)) uit.push(maak(id));
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
  /** Per dag de uren waarin iets is opgenomen; zo tellen halve dagen half. */
  const urenPerDag = new Map<string, Set<number>>();
  const modi: Teller = new Map();
  const strategieen: Teller = new Map();
  const richtingen: Teller = new Map();
  const zoneRedenen: Teller = new Map();
  const blokkades: Teller = new Map();

  let vanMs = Number.POSITIVE_INFINITY;
  let totMs = Number.NEGATIVE_INFINITY;
  let momentenTotaal = 0;
  let failsafeMomenten = 0;
  const invoerGezien = new Map<string, number>();

  for await (const m of momenten) {
    momentenTotaal += 1;
    vanMs = Math.min(vanMs, m.tMs);
    totMs = Math.max(totMs, m.tMs);
    const dag = dagSleutel(m.tMs);
    dagen.add(dag);

    let uren = urenPerDag.get(dag);
    if (!uren) {
      uren = new Set();
      urenPerDag.set(dag, uren);
    }
    uren.add(new Date(m.tMs).getHours());

    if (m.mode !== 'onbekend') tel(modi, m.mode, dag);
    if (m.failsafe) failsafeMomenten += 1;

    for (const inv of VERWACHTE_INVOER) {
      if (inv.aanwezig(m)) invoerGezien.set(inv.id, (invoerGezien.get(inv.id) ?? 0) + 1);
    }

    for (const a of m.accepted) {
      if (a.strategyId) tel(strategieen, a.strategyId, dag);
    }
    // De richting is wat er werkelijk zou zijn gestuurd. `heat` is het
    // interessantste vakje van deze hele tabel: zolang dat leeg is, is de
    // verwarmingskant van de regeling nooit in het echt afgegaan.
    for (const c of m.commands) {
      if (c.kind === 'setAction' && c.action) tel(richtingen, c.action, dag);
    }
    for (const z of m.zones) {
      if (z.reason) tel(zoneRedenen, z.reason, dag);
    }
    for (const r of m.rejected) tel(blokkades, r.blockedBy, dag);
  }

  if (momentenTotaal === 0) return null;

  // Seizoenen tellen per opgenomen dag, niet per moment: een dag met twintig
  // evaluaties is één dag, net als een dag met tienduizend.
  const perSeizoen = new Map<Seizoen, number>();
  for (const dag of dagen) {
    const s = seizoenVan(Date.parse(`${dag}T12:00:00`));
    // Het aandeel uren van die dag waarin iets is opgenomen. Een opname die om
    // 17:11 begint levert die dag geen dag op maar zeven vierentwintigste.
    const deel = (urenPerDag.get(dag)?.size ?? 0) / 24;
    perSeizoen.set(s, (perSeizoen.get(s) ?? 0) + deel);
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
  const strategieDekking = volledig(
    strategieen,
    ['comfort', 'pv-surplus', 'heat-assist'],
    // Alles met het voorvoegsel `arbiter:` komt van de arbiter zelf en is geen
    // strategie. Zie `volledig`.
    (id) => id.startsWith('arbiter:'),
  );

  return {
    vanMs,
    totMs,
    dagenOpgenomen:
      Math.round(
        [...urenPerDag.values()].reduce((n, u) => n + u.size / 24, 0) * 10,
      ) / 10,
    kalenderdagenAangeraakt: dagen.size,
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
    ontbrekendeInvoer: VERWACHTE_INVOER.filter((inv) => (invoerGezien.get(inv.id) ?? 0) === 0).map(
      ({ id, waarvoor }) => ({ id, waarvoor }),
    ),
    gereedheid: gereedheidVan(seizoenen, [
      modiDekking,
      strategieDekking,
      richtingDekking,
    ]),
  };
}

/** De twee assen apart, zodat de weergave ze naast het getal kan tonen. */
export interface Gereedheid {
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
function gereedheidVan(
  seizoenen: readonly SeizoenStand[],
  groepen: readonly (readonly Dekking[])[],
): Gereedheid {
  const tijd =
    seizoenen.reduce((n, s) => n + Math.min(1, s.dagen / s.doel), 0) /
    seizoenen.length;

  const punten = groepen.flat();
  // Halve punten voor wat maar op één dag voorkwam: waargenomen, niet aangetoond.
  const dekking = punten.reduce((n, p) => n + p.deel, 0) / Math.max(1, punten.length);

  return {
    tijd: Math.round(tijd * 100),
    dekking: Math.round(dekking * 100),
    totaal: Math.round(Math.sqrt(tijd * dekking) * 100),
  };
}

/** Leest de logboeken en levert de stand. */
export async function statusVanBestanden(
  files: readonly string[],
): Promise<DatasetStatus | null> {
  return datasetStatus(readMoments(files));
}

/** Alleen voor de leesbaarheid van de weergave. */
export type { Mode };
