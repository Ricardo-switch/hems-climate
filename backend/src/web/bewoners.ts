/**
 * Bewoners (besluit 147): wie hier woont, op volgorde, met een eigen naam en
 * een eigen comfort. De eerste op de lijst is de hoofdgebruiker; de eerste die
 * thuis is, bepaalt het comfort. Dat kiest de kern zelf (`chooseProfile`); dit
 * bestand houdt bij wie er is en maakt er profielen van voor de configuratie.
 *
 * Een bewoner komt erbij door één keer in te loggen, niet doordat de app
 * iedereen uit Home Assistant haalt. Heeft het account een persoon in Home
 * Assistant, dan weet het huis meteen wie het is en of die thuis is. Zonder
 * persoon is het een gast (besluit 151): die kijkt mee, en alleen de
 * hoofdgebruiker maakt er een bewoner van. Zelf kiezen kan alleen "dit is een
 * scherm", zoals de wand; een scherm is geen bewoner en begroet wie er thuis
 * is. Het allereerste account kiest zelf, want er is nog geen hoofdgebruiker.
 *
 * Er gaat niets naar Home Assistant: de naam in de app verandert niets daar.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { ComfortProfile, OccupancySource, ProfileHold, ProfileZone, SetpointPair } from '../core/model.js';
import type { SiteConfig } from '../core/model.js';
import { comfortView, comfortViewVoorProfiel, type Comfort, type ComfortRoom, type ComfortView } from './comfort.js';

export const BEWONERS_FILE = 'bewoners.json';

export interface Bewoner {
  readonly id: string;
  /** Het account in Home Assistant. */
  readonly haUser: string;
  /** De naam van dat account in Home Assistant, zoals hij binnenkwam. */
  readonly haNaam: string;
  /** Zo noemt het huis je; in de app te veranderen. */
  readonly naam: string;
  /** De aanwezigheidsbron (`occupancy[].id`), of null als het huis het niet weet. */
  readonly aanwezigheid: string | null;
  /** Een eigen comfort, of dat van de hoofdgebruiker volgen. */
  readonly comfort: 'volgt' | 'eigen';
  readonly sindsMs: number;
  /**
   * Een gast (besluit 147): kijkt mee, en bedient licht en screens alleen als
   * hij thuis is. Staat niet in de volgorde, heeft geen comfort, en van hem
   * wordt niets bewaard.
   */
  readonly gast?: boolean;
}

export interface Scherm {
  readonly haUser: string;
  /** Zo heet het scherm in de app; in de app te veranderen (besluit 149). */
  readonly naam: string;
  /** De naam van het account in Home Assistant, als de naam in de app anders werd. */
  readonly haNaam?: string;
  readonly sindsMs: number;
  /**
   * Hoe dit scherm werkt (besluit 166), in te stellen vanaf elk apparaat: het
   * hele scherm, en luisteren naar "Hé huis". Weg is: zoals het scherm het zelf
   * koos, in zijn browser.
   */
  readonly opties?: SchermOpties;
}

export interface SchermOpties {
  readonly volledig?: boolean;
  readonly luisteren?: boolean;
}

export interface Bewoners {
  readonly versie: 1;
  /** De volgorde; de eerste is de hoofdgebruiker. */
  readonly volgorde: readonly string[];
  readonly bewoners: Readonly<Record<string, Bewoner>>;
  /** Schermen zoals de wand, op account. */
  readonly schermen: Readonly<Record<string, Scherm>>;
  /** "Toch die van": dit comfort zolang precies deze bewoners thuis zijn; sindsMs om het op te ruimen. */
  readonly vasthouden?: ProfileHold & { readonly sindsMs?: number };
}

export const GEEN_BEWONERS: Bewoners = { versie: 1, volgorde: [], bewoners: {}, schermen: {} };

/** Zonder "toch die van": na een wissel die het niet meer waar maakt. */
function zonderVasthouden(b: Bewoners): Bewoners {
  const { vasthouden: _v, ...rest } = b;
  return rest;
}

/**
 * Is "toch die van" voorbij? Zodra de kern na het kiezen een besluit nam
 * zonder hem, is er iemand thuisgekomen of weggegaan: dan weg ermee, zodat hij
 * niet terugkomt als later dezelfde mensen weer thuis zijn.
 */
export function vasthoudenVoorbij(b: Bewoners, laatste: { readonly atMs: number; readonly reden: string | null } | null): boolean {
  const h = b.vasthouden;
  if (h == null || laatste == null) return false;
  return laatste.atMs > (h.sindsMs ?? 0) + 5_000 && laatste.reden !== 'gekozen';
}

export function zonderVasthoudenVan(b: Bewoners): Bewoners {
  return zonderVasthouden(b);
}

/** De hoofdgebruiker, of null zonder bewoners. */
/**
 * De bewoners voor het profiel (besluit 181): op volgorde met hun account,
 * het account van wiens comfort geldt (het profiel uit het laatste besluit),
 * en of wie kijkt een scherm is.
 */
export function profielenVan(b: Bewoners, geldt: string | null, userId: string | null): { profielen: { volgorde: { id: string; account: string; naam: string }[]; geldt: string | null }; scherm: boolean } {
  const volgorde = b.volgorde.flatMap((id) => (b.bewoners[id] ? [{ id, account: b.bewoners[id]!.haUser, naam: b.bewoners[id]!.naam }] : []));
  return { profielen: { volgorde, geldt: geldt == null ? null : (b.bewoners[geldt]?.haUser ?? null) }, scherm: userId != null && b.schermen[userId] != null };
}

export const hoofdVan = (b: Bewoners): Bewoner | null => (b.volgorde[0] != null ? (b.bewoners[b.volgorde[0]] ?? null) : null);

/** Een persoon in Home Assistant, met het account dat erbij hoort. */
export interface Persoon {
  readonly entityId: string;
  readonly userId: string | null;
  readonly naam: string;
}

export function personenUit(states: Iterable<HaEntityState>): Persoon[] {
  const uit: Persoon[] = [];
  for (const s of states) {
    if (!s.entity_id.startsWith('person.')) continue;
    const userId = s.attributes['user_id'];
    const naam = s.attributes['friendly_name'];
    uit.push({ entityId: s.entity_id, userId: typeof userId === 'string' && userId !== '' ? userId : null, naam: typeof naam === 'string' && naam.trim() !== '' ? naam.trim() : s.entity_id.slice('person.'.length) });
  }
  return uit;
}

/** Zo noemt het huis je: de voornaam uit de naam in Home Assistant ("Noor Cornelissen" wordt "Noor"). */
export function roepnaam(haNaam: string): string {
  const eerste = haNaam.trim().split(/\s+/)[0] ?? '';
  return (eerste || haNaam.trim() || 'Bewoner').slice(0, 40);
}

function nieuwId(b: Bewoners, naam: string): string {
  const basis = naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bewoner';
  let id = basis;
  for (let n = 2; b.bewoners[id] != null; n++) id = `${basis}-${n}`;
  return id;
}

export interface Account {
  readonly userId: string;
  readonly naam: string;
}

export type Herkenning =
  | { readonly soort: 'bewoner'; readonly bewoner: Bewoner; readonly nieuw: boolean; readonly bewoners: Bewoners }
  | { readonly soort: 'scherm' }
  /** Geen persoon in Home Assistant, en er woont al iemand: een gast (besluit 151). */
  | { readonly soort: 'gast'; readonly bewoners: Bewoners }
  | { readonly soort: 'vraag' };

/**
 * Wie logt er in? Een bekende bewoner, gast of scherm blijft wat het was. Een
 * account met een persoon in Home Assistant wordt meteen bewoner, met die
 * persoon als aanwezigheid als de configuratie hem volgt. Zonder persoon een
 * gast (besluit 151), behalve als er nog niemand woont: dan de vraag.
 */
export function herken(b: Bewoners, account: Account, personen: readonly Persoon[], occupancy: readonly OccupancySource[], nowMs: number): Herkenning {
  const bekend = Object.values(b.bewoners).find((x) => x.haUser === account.userId);
  if (bekend) return { soort: 'bewoner', bewoner: bekend, nieuw: false, bewoners: b };
  if (b.schermen[account.userId] != null) return { soort: 'scherm' };
  const persoon = personen.find((p) => p.userId === account.userId);
  if (persoon == null) return b.volgorde.length === 0 ? { soort: 'vraag' } : { soort: 'gast', bewoners: alsGast(b, account, nowMs) };
  const bron = occupancy.find((o) => o.ref.id === persoon.entityId)?.id ?? null;
  const bewoners = voegToe(b, account, bron, nowMs);
  return { soort: 'bewoner', bewoner: bewoners.bewoners[bewoners.volgorde.at(-1)!]!, nieuw: true, bewoners };
}

/** Een nieuwe bewoner achteraan; de eerste wordt hoofdgebruiker. Comfort: dat van de hoofdgebruiker volgen. */
export function voegToe(b: Bewoners, account: Account, aanwezigheid: string | null, nowMs: number): Bewoners {
  const naam = roepnaam(account.naam);
  const id = nieuwId(b, naam);
  const vrij = aanwezigheid != null && !Object.values(b.bewoners).some((x) => x.aanwezigheid === aanwezigheid) ? aanwezigheid : null;
  const bewoner: Bewoner = { id, haUser: account.userId, haNaam: account.naam, naam, aanwezigheid: vrij, comfort: 'volgt', sindsMs: nowMs };
  const { [account.userId]: _scherm, ...schermen } = b.schermen;
  return { ...b, volgorde: [...b.volgorde, id], bewoners: { ...b.bewoners, [id]: bewoner }, schermen };
}

/** Een nieuwe gast (besluit 151): niet in de volgorde, zonder comfort en zonder aanwezigheid. */
export function alsGast(b: Bewoners, account: Account, nowMs: number): Bewoners {
  const naam = roepnaam(account.naam);
  const id = nieuwId(b, naam);
  const gast: Bewoner = { id, haUser: account.userId, haNaam: account.naam, naam, aanwezigheid: null, comfort: 'volgt', sindsMs: nowMs, gast: true };
  return { ...b, bewoners: { ...b.bewoners, [id]: gast } };
}

export function alsScherm(b: Bewoners, account: Account, nowMs: number): Bewoners {
  return { ...b, schermen: { ...b.schermen, [account.userId]: { haUser: account.userId, naam: account.naam, sindsMs: nowMs } } };
}

/* ----------------------------------------------------------- comfort */

/**
 * De doelen van een eigen comfort, zoals de kern ze per zone wil. Net als bij
 * het comfort van het huis volgt voorverwarmen de dag.
 */
export function profielZones(kamers: Readonly<Record<string, ComfortRoom>>, zones?: ReadonlySet<string>): Record<string, ProfileZone> {
  const uit: Record<string, ProfileZone> = {};
  for (const [zone, kamer] of Object.entries(kamers)) {
    // Een kamer die niet meer meedoet in de regeling (besluit 138): overslaan, maar bewaard houden voor als hij terugkomt.
    if (zones != null && !zones.has(zone)) continue;
    const setpoints: Record<string, SetpointPair> = {};
    for (const [m, pair] of Object.entries(kamer.modi)) {
      if (pair == null) continue;
      setpoints[m] = { ...(pair.heat != null ? { heat: pair.heat } : {}), ...(pair.cool != null ? { cool: pair.cool } : {}) };
      if (m === 'dag' && pair.heat != null) setpoints['voorverwarmen'] = { heat: pair.heat };
    }
    uit[zone] = { setpoints, ...(kamer.nooitWarmerC !== undefined ? { comfortMaxC: kamer.nooitWarmerC } : {}) };
  }
  return uit;
}

/**
 * De profielen voor de configuratie, op volgorde. De hoofdgebruiker heeft het
 * comfort van het huis zelf (de zones); wie volgt ook. Een eigen comfort komt
 * als eigen doelen per zone, alleen voor zones die de regeling nu heeft
 * (`zones`): een eigen comfort is een kopie van dat van het huis, en daar kan
 * een kamer in staan die sindsdien niet meer meedoet.
 */
export function profielenVoor(b: Bewoners, comfort: Comfort | null, occupancy: readonly OccupancySource[], zones?: ReadonlySet<string>): ComfortProfile[] {
  const bekend = new Set(occupancy.map((o) => o.id));
  return b.volgorde.flatMap((id, i) => {
    const x = b.bewoners[id];
    if (x == null) return [];
    const eigen = i > 0 && x.comfort === 'eigen' ? comfort?.profielen?.[id] : undefined;
    return [{ id, name: x.naam, occupancyIds: x.aanwezigheid != null && bekend.has(x.aanwezigheid) ? [x.aanwezigheid] : [], zones: eigen ? profielZones(eigen, zones) : {} }];
  });
}

/**
 * Een andere hoofdgebruiker. Het comfort van het huis is van de hoofdgebruiker:
 * de oude neemt het zijne mee als eigen comfort, en de nieuwe brengt het zijne
 * in, als hij er een had.
 */
export function wisselHoofd(b: Bewoners, comfort: Comfort | null, nieuw: string): { bewoners: Bewoners; comfort: Comfort | null } {
  const oud = hoofdVan(b);
  const n = b.bewoners[nieuw];
  if (n == null || oud == null || oud.id === nieuw) return { bewoners: b, comfort };
  const volgorde = [nieuw, ...b.volgorde.filter((x) => x !== nieuw)];
  const bewoners = { ...b.bewoners, [oud.id]: { ...oud, comfort: 'eigen' as const }, [nieuw]: { ...n, comfort: 'eigen' as const } };
  if (comfort == null) return { bewoners: { ...b, volgorde, bewoners }, comfort };
  const { [nieuw]: zijn, ...rest } = comfort.profielen ?? {};
  const profielen = { ...rest, [oud.id]: comfort.kamers };
  return {
    bewoners: zonderVasthouden({ ...b, volgorde, bewoners }),
    comfort: { ...comfort, kamers: n.comfort === 'eigen' && zijn ? zijn : comfort.kamers, profielen },
  };
}

/** Een bewoner weg, met zijn eigen comfort. De hoofdgebruiker gaat niet weg zolang er anderen zijn. */
export function haalWeg(b: Bewoners, comfort: Comfort | null, id: string): { bewoners: Bewoners; comfort: Comfort | null } | null {
  if (b.bewoners[id] == null) return null;
  if (b.volgorde[0] === id && b.volgorde.length > 1) return null;
  const { [id]: _weg, ...bewoners } = b.bewoners;
  const { [id]: _comfort, ...profielen } = comfort?.profielen ?? {};
  const zonder: Bewoners = { ...b, volgorde: b.volgorde.filter((x) => x !== id), bewoners };
  return {
    bewoners: b.vasthouden?.id === id ? zonderVasthouden(zonder) : zonder,
    comfort: comfort ? { ...comfort, profielen } : null,
  };
}

/**
 * Wiens comfort (besluit 147): dat van de gevraagde bewoner, anders van wie er
 * kijkt, anders van de hoofdgebruiker. Wie volgt, ziet dat van de
 * hoofdgebruiker; aanpassen maakt het een eigen comfort. Een ander bekijken
 * mag iedereen; aanpassen alleen jezelf, of als hoofdgebruiker of beheerder.
 */
export function comfortVanBewoner(config: SiteConfig, huis: Comfort | null, b: Bewoners, wie: { readonly userId: string | null; readonly beheerder: boolean }, gevraagd: string | null): { id: string | null; view: ComfortView } {
  const hoofd = hoofdVan(b);
  if (hoofd == null) return { id: null, view: comfortView(config, huis) };
  const ik = Object.values(b.bewoners).find((x) => wie.userId != null && x.haUser === wie.userId) ?? null;
  const beheert = !ik?.gast && (wie.beheerder || ik?.id === hoofd.id);
  // Een gast heeft geen comfort: hij ziet dat van de hoofdgebruiker, alleen om te kijken.
  const doel = (gevraagd != null ? b.bewoners[gevraagd] : null) ?? (ik?.gast ? null : ik) ?? hoofd;
  const eigen = doel.id !== hoofd.id && doel.comfort === 'eigen' ? huis?.profielen?.[doel.id] : undefined;
  const view = eigen ? comfortViewVoorProfiel(config, eigen) : comfortView(config, huis);
  return {
    id: doel.id,
    view: {
      ...view,
      van: {
        id: doel.id,
        naam: doel.naam,
        hoofd: doel.id === hoofd.id,
        volgt: doel.id !== hoofd.id && eigen == null,
        hoofdNaam: hoofd.naam,
        magAanpassen: beheert || (!ik?.gast && ik?.id === doel.id),
        bewoners: beheert ? b.volgorde.flatMap((id) => (b.bewoners[id] ? [{ id, naam: b.bewoners[id].naam }] : [])) : [],
      },
    },
  };
}

/**
 * Is dit account een gast, en is hij thuis (besluit 147)? Thuis volgens zijn
 * aanwezigheid in Home Assistant; zonder aanwezigheid weet het huis het niet.
 */
export function gastStand(b: Bewoners, userId: string | null, occupancy: readonly OccupancySource[], state: (entityId: string) => HaEntityState | undefined): { readonly gast: boolean; readonly thuis: boolean | null } {
  const x = Object.values(b.bewoners).find((y) => userId != null && y.haUser === userId);
  if (!x?.gast) return { gast: false, thuis: null };
  const o = x.aanwezigheid != null ? occupancy.find((y) => y.id === x.aanwezigheid) : undefined;
  return { gast: true, thuis: o ? thuisVan(state(o.ref.id)) : null };
}

/* ------------------------------------------------------------- bewaren */

export class BewonersStore {
  readonly #path: string;
  #current: Bewoners = GEEN_BEWONERS;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#path = join(logDir, BEWONERS_FILE);
  }

  async load(): Promise<Bewoners> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { versie?: unknown };
      this.#current = raw?.versie === 1 ? (raw as Bewoners) : GEEN_BEWONERS;
    } catch {
      this.#current = GEEN_BEWONERS;
    }
    return this.#current;
  }

  get current(): Bewoners {
    return this.#current;
  }

  async save(b: Bewoners): Promise<void> {
    this.#current = b;
    const text = `${JSON.stringify(b, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
  }
}

/* ------------------------------------------------------------- de weergave */

export interface BewonerView {
  readonly id: string;
  readonly naam: string;
  readonly haNaam: string;
  readonly plek: number;
  readonly hoofd: boolean;
  readonly aanwezigheid: string | null;
  readonly aanwezigheidNaam: string | null;
  /** Nu thuis volgens Home Assistant, of null als het huis het niet weet. */
  readonly thuis: boolean | null;
  readonly thuisSindsMs: number | null;
  readonly comfort: 'volgt' | 'eigen';
  readonly geldt: boolean;
  readonly ik: boolean;
  readonly sindsMs: number;
  readonly gast: boolean;
  /** Volgt zijn eigen persoon in Home Assistant, die aan zijn account hangt: dan valt er niets te kiezen. */
  readonly gekoppeld: boolean;
  /** Wat deze bewoner als aanwezigheid kan kiezen. */
  readonly kiesbaar: readonly Bron[];
}

/**
 * Een aanwezigheidsbron om te kiezen: een persoon in Home Assistant of een
 * sensor, zoals wifi. Een persoon die aan het account van een ander hangt, en
 * een bron die al bij een andere bewoner hoort, staat er niet bij.
 */
export interface Bron {
  readonly id: string;
  readonly naam: string;
  readonly soort: 'persoon' | 'sensor';
  readonly thuis: boolean | null;
}

export interface BewonersView {
  readonly ik: {
    readonly soort: 'bewoner' | 'gast' | 'scherm' | 'onbekend';
    readonly id: string | null;
    readonly naam: string | null;
    readonly magBeheren: boolean;
    /** De hoofdgebruiker zelf (besluit 151): alleen die maakt een gast bewoner, en begint opnieuw. */
    readonly hoofd: boolean;
  };
  readonly bewoners: readonly BewonerView[];
  /** Gasten: ingelogd in de app, maar zonder plek in de volgorde. */
  readonly gasten: readonly BewonerView[];
  /** Schermen zoals de wand (besluit 149): op account, met een naam die je kunt veranderen. */
  readonly schermen: readonly { readonly id: string; readonly naam: string; readonly haNaam: string; readonly sindsMs: number; readonly ik: boolean; readonly opties: { readonly volledig: boolean | null; readonly luisteren: boolean | null } }[];
  /** Wat wie er kijkt als aanwezigheid kan kiezen, bij de eerste inlog. */
  readonly kiesbaarVoorMij: readonly Bron[];
  readonly geldt: { readonly id: string; readonly naam: string; readonly waarom: 'thuis' | 'niemand' | 'gekozen'; readonly thuis: readonly string[] } | null;
}

export interface Wie {
  readonly userId: string | null;
  readonly beheerder: boolean;
}

const thuisVan = (s: HaEntityState | undefined): boolean | null => (s == null || s.state === 'unavailable' || s.state === 'unknown' ? null : s.state === 'on' || s.state === 'home');
const naamVan = (s: HaEntityState | undefined, id: string): string => {
  const n = s?.attributes['friendly_name'];
  return typeof n === 'string' && n.trim() !== '' ? n.trim() : id;
};

/** Het account in Home Assistant achter een bron: alleen bij een persoon die aan een account hangt. */
export function persoonsAccount(o: OccupancySource, state: (entityId: string) => HaEntityState | undefined): string | null {
  if (!o.ref.id.startsWith('person.')) return null;
  const u = state(o.ref.id)?.attributes['user_id'];
  return typeof u === 'string' && u !== '' ? u : null;
}

export type ProfielNu = { readonly id: string; readonly name: string; readonly reason: 'thuis' | 'niemand' | 'gekozen'; readonly home: readonly string[] };

export function bewonersView(
  b: Bewoners,
  wie: Wie,
  occupancy: readonly OccupancySource[],
  state: (entityId: string) => HaEntityState | undefined,
  profile: ProfielNu | null,
): BewonersView {
  const ikB = Object.values(b.bewoners).find((x) => wie.userId != null && x.haUser === wie.userId) ?? null;
  const ikScherm = wie.userId != null && b.schermen[wie.userId] != null;
  const hoofd = hoofdVan(b);
  const bron = (id: string | null) => (id == null ? undefined : occupancy.find((o) => o.id === id));
  const accountVan = (o: OccupancySource) => persoonsAccount(o, state);
  /** Wat iemand met dit account kan kiezen; de bron die hij al heeft, telt mee. */
  const kiesbaarVoor = (haUser: string | null, eigen: string | null): Bron[] =>
    occupancy
      .filter((o) => o.id === eigen || !Object.values(b.bewoners).some((y) => y.aanwezigheid === o.id))
      .filter((o) => { const a = accountVan(o); return a == null || a === haUser; })
      .map((o) => ({ id: o.id, naam: naamVan(state(o.ref.id), o.id), soort: o.ref.id.startsWith('person.') ? 'persoon' : 'sensor', thuis: thuisVan(state(o.ref.id)) }));
  const view = (x: Bewoner, i: number): BewonerView => {
    const o = bron(x.aanwezigheid);
    const s = o ? state(o.ref.id) : undefined;
    const sinds = s ? Date.parse(s.last_changed) : NaN;
    return {
      id: x.id, naam: x.naam, haNaam: x.haNaam, plek: i + 1, hoofd: !x.gast && i === 0,
      aanwezigheid: o ? o.id : null, aanwezigheidNaam: o ? naamVan(s, o.id) : null,
      thuis: o ? thuisVan(s) : null, thuisSindsMs: Number.isFinite(sinds) ? sinds : null,
      comfort: i === 0 ? 'eigen' : x.comfort, geldt: profile?.id === x.id, ik: ikB?.id === x.id, sindsMs: x.sindsMs, gast: x.gast === true,
      gekoppeld: o != null && accountVan(o) === x.haUser,
      kiesbaar: kiesbaarVoor(x.haUser, x.aanwezigheid),
    };
  };
  const bewoners = b.volgorde.flatMap((id, i): BewonerView[] => (b.bewoners[id] && !b.bewoners[id].gast ? [view(b.bewoners[id], i)] : []));
  const gasten = Object.values(b.bewoners).filter((x) => x.gast).map((x) => view(x, -1));
  return {
    ik: {
      soort: ikB ? (ikB.gast ? 'gast' : 'bewoner') : ikScherm ? 'scherm' : 'onbekend',
      id: ikB?.id ?? null,
      naam: ikB?.naam ?? null,
      // Een gast beheert nooit, ook niet als hij in Home Assistant beheerder is.
      magBeheren: !ikB?.gast && (wie.beheerder || (hoofd != null && ikB?.id === hoofd.id) || b.volgorde.length === 0),
      hoofd: hoofd != null && ikB?.id === hoofd.id,
    },
    bewoners,
    gasten,
    schermen: Object.values(b.schermen).map((s) => ({ id: s.haUser, naam: s.naam, haNaam: s.haNaam ?? s.naam, sindsMs: s.sindsMs, ik: wie.userId === s.haUser, opties: { volledig: s.opties?.volledig ?? null, luisteren: s.opties?.luisteren ?? null } })),
    kiesbaarVoorMij: kiesbaarVoor(wie.userId, ikB?.aanwezigheid ?? null),
    geldt: profile ? { id: profile.id, naam: profile.name, waarom: profile.reason, thuis: profile.home } : null,
  };
}

/* ---------------------------------------------------------------- de deur */

export type Actie =
  | { readonly actie: 'ik'; readonly soort: 'bewoner' | 'scherm'; readonly aanwezigheid: string | null }
  | { readonly actie: 'naam'; readonly id: string; readonly naam: string }
  | { readonly actie: 'aanwezigheid'; readonly id: string; readonly bron: string | null }
  | { readonly actie: 'comfort'; readonly id: string; readonly comfort: 'volgt' | 'eigen' }
  | { readonly actie: 'volgorde'; readonly volgorde: readonly string[] }
  | { readonly actie: 'hoofd'; readonly id: string }
  | { readonly actie: 'weg'; readonly id: string }
  | { readonly actie: 'vasthouden'; readonly id: string | null }
  /** Een scherm een andere naam geven, of weghalen (besluit 149); het id is het account. */
  | { readonly actie: 'schermNaam'; readonly id: string; readonly naam: string }
  | { readonly actie: 'schermWeg'; readonly id: string }
  /** Hoe een scherm werkt (besluit 166): het hele scherm, luisteren naar "Hé huis". */
  | { readonly actie: 'schermOpties'; readonly id: string; readonly opties: SchermOpties }
  /** Dit account is een scherm, ook als het een persoon in Home Assistant heeft (zoals een tablet). */
  | { readonly actie: 'scherm' }
  /** Een gast of weer een bewoner (besluit 147). */
  | { readonly actie: 'gast'; readonly id: string; readonly gast: boolean };

export type Uitkomst =
  | { readonly ok: true; readonly bewoners: Bewoners; readonly comfort?: Comfort | null }
  | { readonly ok: false; readonly status: 400 | 403 | 404; readonly reden: string };

/** Alleen bekende velden, en alleen wat bij de actie hoort. */
export function leesActie(body: unknown): Actie | null {
  if (typeof body !== 'object' || body == null) return null;
  const x = body as Record<string, unknown>;
  const id = typeof x['id'] === 'string' ? x['id'] : null;
  switch (x['actie']) {
    case 'ik':
      return x['soort'] === 'bewoner' || x['soort'] === 'scherm' ? { actie: 'ik', soort: x['soort'], aanwezigheid: typeof x['aanwezigheid'] === 'string' ? x['aanwezigheid'] : null } : null;
    case 'naam':
      return id && typeof x['naam'] === 'string' ? { actie: 'naam', id, naam: x['naam'] } : null;
    case 'aanwezigheid':
      return id ? { actie: 'aanwezigheid', id, bron: typeof x['bron'] === 'string' ? x['bron'] : null } : null;
    case 'comfort':
      return id && (x['comfort'] === 'volgt' || x['comfort'] === 'eigen') ? { actie: 'comfort', id, comfort: x['comfort'] } : null;
    case 'volgorde':
      return Array.isArray(x['volgorde']) && x['volgorde'].every((v) => typeof v === 'string') ? { actie: 'volgorde', volgorde: x['volgorde'] as string[] } : null;
    case 'hoofd':
      return id ? { actie: 'hoofd', id } : null;
    case 'weg':
      return id ? { actie: 'weg', id } : null;
    case 'vasthouden':
      return { actie: 'vasthouden', id };
    case 'scherm':
      return { actie: 'scherm' };
    case 'schermNaam':
      return id && typeof x['naam'] === 'string' ? { actie: 'schermNaam', id, naam: x['naam'] } : null;
    case 'schermWeg':
      return id ? { actie: 'schermWeg', id } : null;
    case 'schermOpties': {
      const o = typeof x['opties'] === 'object' && x['opties'] != null ? (x['opties'] as Record<string, unknown>) : null;
      if (!id || o == null) return null;
      const opties: { volledig?: boolean; luisteren?: boolean } = {};
      for (const k of ['volledig', 'luisteren'] as const) {
        if (o[k] === undefined) continue;
        if (typeof o[k] !== 'boolean') return null;
        opties[k] = o[k];
      }
      return Object.keys(opties).length ? { actie: 'schermOpties', id, opties } : null;
    }
    case 'gast':
      return id && typeof x['gast'] === 'boolean' ? { actie: 'gast', id, gast: x['gast'] } : null;
    default:
      return null;
  }
}

/**
 * Wat een actie doet. Aan jezelf mag je alles; de hoofdgebruiker en een
 * beheerder ook aan een ander. "Toch die van" mag iedereen die ingelogd is,
 * ook de wand; thuis zijn de bewoners die nu thuis zijn, uit de kern.
 */
export function voerUit(
  b: Bewoners,
  comfort: Comfort | null,
  a: Actie,
  wie: Wie & { readonly naam: string },
  occupancy: readonly OccupancySource[],
  thuis: readonly string[],
  nowMs: number,
  /** Het account achter een bron, als het een persoon met een account is: die is alleen voor dat account. */
  accountVan: (bronId: string) => string | null = () => null,
): Uitkomst {
  const vanEenAnder = (bronId: string | null, haUser: string | null) => { const acc = bronId == null ? null : accountVan(bronId); return acc != null && acc !== haUser; };
  const ik = Object.values(b.bewoners).find((x) => wie.userId != null && x.haUser === wie.userId) ?? null;
  // Een gast kijkt alleen: van hem wordt niets bewaard, en hij verandert niets. Wel kan hij zeggen dat hij een scherm is (besluit 151).
  const wordtScherm = a.actie === 'scherm' || (a.actie === 'ik' && a.soort === 'scherm');
  if (ik?.gast && !wordtScherm) return { ok: false, status: 403, reden: 'een gast kan alleen kijken' };
  const hoofd = hoofdVan(b);
  const beheert = wie.beheerder || (hoofd != null && ik?.id === hoofd.id);
  const mag = (id: string) => beheert || ik?.id === id;
  const bewoner = (id: string) => b.bewoners[id];
  switch (a.actie) {
    case 'ik': {
      if (wie.userId == null) return { ok: false, status: 403, reden: 'log eerst in' };
      if (ik && !ik.gast) return { ok: true, bewoners: b };
      if (a.soort === 'scherm') return { ok: true, bewoners: alsScherm(ik ? haalWeg(b, comfort, ik.id)!.bewoners : b, { userId: wie.userId, naam: wie.naam }, nowMs) };
      // Zelf bewoner worden kan alleen het eerste account; daarna maakt de hoofdgebruiker een gast bewoner (besluit 151).
      if (b.volgorde.length > 0) return { ok: false, status: 403, reden: 'de hoofdgebruiker maakt je bewoner' };
      if (a.aanwezigheid != null && !occupancy.some((o) => o.id === a.aanwezigheid)) return { ok: false, status: 400, reden: 'die aanwezigheid kent het huis niet' };
      if (vanEenAnder(a.aanwezigheid, wie.userId)) return { ok: false, status: 400, reden: 'die persoon hoort bij een ander account' };
      return { ok: true, bewoners: voegToe(b, { userId: wie.userId, naam: wie.naam }, a.aanwezigheid, nowMs) };
    }
    case 'naam': {
      const x = bewoner(a.id);
      if (x == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      if (!mag(a.id)) return { ok: false, status: 403, reden: 'alleen je eigen naam, of als hoofdgebruiker' };
      const naam = a.naam.trim().replace(/\s+/g, ' ');
      if (naam === '' || naam.length > 40) return { ok: false, status: 400, reden: 'een naam van 1 tot 40 tekens' };
      return { ok: true, bewoners: { ...b, bewoners: { ...b.bewoners, [a.id]: { ...x, naam } } } };
    }
    case 'aanwezigheid': {
      const x = bewoner(a.id);
      if (x == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      if (!mag(a.id)) return { ok: false, status: 403, reden: 'alleen je eigen, of als hoofdgebruiker' };
      if (a.bron != null && !occupancy.some((o) => o.id === a.bron)) return { ok: false, status: 400, reden: 'die aanwezigheid kent het huis niet' };
      if (a.bron != null && Object.values(b.bewoners).some((y) => y.id !== a.id && y.aanwezigheid === a.bron)) return { ok: false, status: 400, reden: 'die hoort al bij een andere bewoner' };
      if (vanEenAnder(a.bron, x.haUser)) return { ok: false, status: 400, reden: 'die persoon hoort bij een ander account' };
      return { ok: true, bewoners: { ...b, bewoners: { ...b.bewoners, [a.id]: { ...x, aanwezigheid: a.bron } } } };
    }
    case 'comfort': {
      const x = bewoner(a.id);
      if (x == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      if (!mag(a.id)) return { ok: false, status: 403, reden: 'alleen je eigen comfort, of als hoofdgebruiker' };
      if (hoofd?.id === a.id) return { ok: false, status: 400, reden: 'de hoofdgebruiker heeft altijd zijn eigen comfort' };
      const bewoners = { ...b, bewoners: { ...b.bewoners, [a.id]: { ...x, comfort: a.comfort } } };
      // Eigen, voor het eerst: begint als een kopie van de hoofdgebruiker.
      if (a.comfort === 'eigen' && comfort != null && comfort.profielen?.[a.id] == null) return { ok: true, bewoners, comfort: { ...comfort, profielen: { ...comfort.profielen, [a.id]: comfort.kamers } } };
      return { ok: true, bewoners };
    }
    case 'volgorde': {
      if (!beheert) return { ok: false, status: 403, reden: 'de volgorde zet de hoofdgebruiker' };
      if (a.volgorde.length !== b.volgorde.length || !a.volgorde.every((id) => b.bewoners[id] != null) || new Set(a.volgorde).size !== a.volgorde.length) return { ok: false, status: 400, reden: 'de volgorde noemt elke bewoner één keer' };
      // Een andere bovenaan is een andere hoofdgebruiker: dan gaat het comfort mee.
      if (a.volgorde[0] !== b.volgorde[0]) {
        const w = wisselHoofd(b, comfort, a.volgorde[0]!);
        return { ok: true, bewoners: { ...w.bewoners, volgorde: a.volgorde }, comfort: w.comfort };
      }
      return { ok: true, bewoners: { ...b, volgorde: a.volgorde } };
    }
    case 'hoofd': {
      if (!beheert) return { ok: false, status: 403, reden: 'dat kan alleen de hoofdgebruiker' };
      if (bewoner(a.id) == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      const w = wisselHoofd(b, comfort, a.id);
      return { ok: true, bewoners: w.bewoners, comfort: w.comfort };
    }
    case 'weg': {
      if (!mag(a.id)) return { ok: false, status: 403, reden: 'dat kan alleen de hoofdgebruiker' };
      const w = haalWeg(b, comfort, a.id);
      if (w == null) return { ok: false, status: 400, reden: 'maak eerst een ander hoofdgebruiker' };
      return { ok: true, bewoners: w.bewoners, comfort: w.comfort };
    }
    case 'gast': {
      const x = bewoner(a.id);
      if (x == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      // Alleen de hoofdgebruiker zelf, ook niet een beheerder in Home Assistant (besluit 151).
      if (hoofd == null || ik?.id !== hoofd.id) return { ok: false, status: 403, reden: 'dat kan alleen de hoofdgebruiker' };
      if (a.gast && hoofd.id === a.id) return { ok: false, status: 400, reden: 'de hoofdgebruiker kan geen gast zijn' };
      if (a.gast === (x.gast === true)) return { ok: true, bewoners: b };
      if (a.gast) {
        // Gast: uit de volgorde, en zonder eigen comfort; er blijft niets van hem bewaard.
        const { [a.id]: _eigen, ...profielen } = comfort?.profielen ?? {};
        const zonder: Bewoners = { ...b, volgorde: b.volgorde.filter((id) => id !== a.id), bewoners: { ...b.bewoners, [a.id]: { ...x, gast: true, comfort: 'volgt' } } };
        return { ok: true, bewoners: b.vasthouden?.id === a.id ? zonderVasthouden(zonder) : zonder, comfort: comfort ? { ...comfort, profielen } : null };
      }
      const { gast: _g, ...weerBewoner } = x;
      return { ok: true, bewoners: { ...b, volgorde: [...b.volgorde, a.id], bewoners: { ...b.bewoners, [a.id]: weerBewoner } } };
    }
    case 'scherm': {
      if (wie.userId == null) return { ok: false, status: 403, reden: 'log eerst in' };
      // Een tablet met een persoon in Home Assistant: geen bewoner, maar een scherm, en dat blijft het.
      const weg = ik ? haalWeg(b, comfort, ik.id) : { bewoners: b, comfort };
      if (weg == null) return { ok: false, status: 400, reden: 'maak eerst een ander hoofdgebruiker' };
      return { ok: true, bewoners: alsScherm(weg.bewoners, { userId: wie.userId, naam: wie.naam }, nowMs), comfort: weg.comfort };
    }
    /*
     * Een scherm beheren (besluit 149): de hoofdgebruiker, een beheerder, of het
     * scherm zelf. Weghalen maakt er geen bewoner van: bij de volgende pagina
     * vraagt dat account opnieuw wat het is.
     */
    case 'schermNaam': {
      const sc = b.schermen[a.id];
      if (sc == null) return { ok: false, status: 404, reden: 'dat scherm is er niet' };
      if (!beheert && wie.userId !== a.id) return { ok: false, status: 403, reden: 'een scherm beheert de hoofdgebruiker' };
      const naam = a.naam.trim().replace(/\s+/g, ' ');
      if (naam === '' || naam.length > 40) return { ok: false, status: 400, reden: 'een naam van 1 tot 40 tekens' };
      return { ok: true, bewoners: { ...b, schermen: { ...b.schermen, [a.id]: { ...sc, naam, haNaam: sc.haNaam ?? sc.naam } } } };
    }
    case 'schermOpties': {
      const sc = b.schermen[a.id];
      if (sc == null) return { ok: false, status: 404, reden: 'dat scherm is er niet' };
      if (!beheert && wie.userId !== a.id) return { ok: false, status: 403, reden: 'een scherm beheert de hoofdgebruiker' };
      return { ok: true, bewoners: { ...b, schermen: { ...b.schermen, [a.id]: { ...sc, opties: { ...sc.opties, ...a.opties } } } } };
    }
    case 'schermWeg': {
      if (b.schermen[a.id] == null) return { ok: false, status: 404, reden: 'dat scherm is er niet' };
      if (!beheert && wie.userId !== a.id) return { ok: false, status: 403, reden: 'een scherm beheert de hoofdgebruiker' };
      const { [a.id]: _weg, ...schermen } = b.schermen;
      return { ok: true, bewoners: { ...b, schermen } };
    }
    case 'vasthouden': {
      if (wie.userId == null) return { ok: false, status: 403, reden: 'log eerst in' };
      // Iedere bewoner en de wand kiezen wiens comfort geldt; een gast kijkt alleen (besluit 169).
      if (ik?.gast) return { ok: false, status: 403, reden: 'een gast kiest niet wiens comfort geldt' };
      if (a.id == null) return { ok: true, bewoners: zonderVasthouden(b) };
      if (bewoner(a.id) == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      return { ok: true, bewoners: { ...b, vasthouden: { id: a.id, home: [...thuis], sindsMs: nowMs } } };
    }
  }
}

/* ------------------------------------------------------ de export (151) */

/** Een naam zoals hij in een entiteit staat: "Noor" wordt "noor", "José" wordt "jose". */
function alsId(naam: string): string {
  return naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Welke namen er uit de export moeten (besluit 151), en waarmee: bewoners en
 * gasten op volgorde "Bewoner 1", "Bewoner 2", dan personen in Home Assistant
 * die geen bewoner zijn. Een naam ook zoals hij in een entiteit of een id
 * staat ("person.noor" wordt "person.bewoner_2"), zodat het logboek dezelfde
 * persoon dezelfde naam houdt.
 */
export function namenVoorExport(b: Bewoners, personen: readonly Persoon[]): [string, string][] {
  const paren = new Map<string, string>();
  let n = 0;
  const voeg = (namen: readonly string[], ids: readonly string[]) => {
    n += 1;
    for (const naam of namen) if (naam.trim() !== '' && !paren.has(naam.trim())) paren.set(naam.trim(), `Bewoner ${n}`);
    for (const id of ids) if (id !== '' && !paren.has(id)) paren.set(id, `bewoner_${n}`);
  };
  const volgorde = [...b.volgorde.map((id) => b.bewoners[id]).filter((x): x is Bewoner => x != null), ...Object.values(b.bewoners).filter((x) => !b.volgorde.includes(x.id))];
  const gehad = new Set<string>();
  for (const x of volgorde) {
    const p = personen.find((q) => q.userId != null && q.userId === x.haUser);
    if (p) gehad.add(p.entityId);
    const namen = [x.naam, x.haNaam, roepnaam(x.haNaam), ...(p ? [p.naam, roepnaam(p.naam)] : [])];
    voeg(namen, [x.id, ...namen.map(alsId), ...(p ? [p.entityId.slice('person.'.length)] : [])]);
  }
  for (const p of personen) {
    if (gehad.has(p.entityId)) continue;
    voeg([p.naam, roepnaam(p.naam)], [p.entityId.slice('person.'.length), alsId(p.naam), alsId(roepnaam(p.naam))]);
  }
  return [...paren];
}
