/**
 * Bewoners (besluit 147): wie hier woont, op volgorde, met een eigen naam en
 * een eigen comfort. De eerste op de lijst is de hoofdgebruiker; de eerste die
 * thuis is, bepaalt het comfort. Dat kiest de kern zelf (`chooseProfile`); dit
 * bestand houdt bij wie er is en maakt er profielen van voor de configuratie.
 *
 * Een bewoner komt erbij door één keer in te loggen, niet doordat de app
 * iedereen uit Home Assistant haalt. Heeft het account een persoon in Home
 * Assistant, dan weet het huis meteen wie het is en of die thuis is. Zonder
 * persoon vraagt de app één keer: woon je hier, of is dit een scherm zoals de
 * wand? Een scherm is geen bewoner en begroet wie er thuis is.
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
}

export interface Scherm {
  readonly haUser: string;
  readonly naam: string;
  readonly sindsMs: number;
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

/** Zo noemt het huis je: de voornaam uit de naam in Home Assistant ("Shira Cornelissen" wordt "Shira"). */
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
  | { readonly soort: 'vraag' };

/**
 * Wie logt er in? Een bekende bewoner of een scherm blijft wat het was. Een
 * account met een persoon in Home Assistant wordt meteen bewoner, met die
 * persoon als aanwezigheid als de configuratie hem volgt. Anders: de vraag.
 */
export function herken(b: Bewoners, account: Account, personen: readonly Persoon[], occupancy: readonly OccupancySource[], nowMs: number): Herkenning {
  const bekend = Object.values(b.bewoners).find((x) => x.haUser === account.userId);
  if (bekend) return { soort: 'bewoner', bewoner: bekend, nieuw: false, bewoners: b };
  if (b.schermen[account.userId] != null) return { soort: 'scherm' };
  const persoon = personen.find((p) => p.userId === account.userId);
  if (persoon == null) return { soort: 'vraag' };
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

export function alsScherm(b: Bewoners, account: Account, nowMs: number): Bewoners {
  return { ...b, schermen: { ...b.schermen, [account.userId]: { haUser: account.userId, naam: account.naam, sindsMs: nowMs } } };
}

/* ----------------------------------------------------------- comfort */

/**
 * De doelen van een eigen comfort, zoals de kern ze per zone wil. Net als bij
 * het comfort van het huis volgt voorverwarmen de dag.
 */
export function profielZones(kamers: Readonly<Record<string, ComfortRoom>>): Record<string, ProfileZone> {
  const uit: Record<string, ProfileZone> = {};
  for (const [zone, kamer] of Object.entries(kamers)) {
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
 * als eigen doelen per zone.
 */
export function profielenVoor(b: Bewoners, comfort: Comfort | null, occupancy: readonly OccupancySource[]): ComfortProfile[] {
  const bekend = new Set(occupancy.map((o) => o.id));
  return b.volgorde.flatMap((id, i) => {
    const x = b.bewoners[id];
    if (x == null) return [];
    const eigen = i > 0 && x.comfort === 'eigen' ? comfort?.profielen?.[id] : undefined;
    return [{ id, name: x.naam, occupancyIds: x.aanwezigheid != null && bekend.has(x.aanwezigheid) ? [x.aanwezigheid] : [], zones: eigen ? profielZones(eigen) : {} }];
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
  const beheert = wie.beheerder || ik?.id === hoofd.id;
  const doel = (gevraagd != null ? b.bewoners[gevraagd] : null) ?? ik ?? hoofd;
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
        magAanpassen: beheert || ik?.id === doel.id,
        bewoners: beheert ? b.volgorde.flatMap((id) => (b.bewoners[id] ? [{ id, naam: b.bewoners[id].naam }] : [])) : [],
      },
    },
  };
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
}

export interface BewonersView {
  readonly ik: { readonly soort: 'bewoner' | 'scherm' | 'onbekend'; readonly id: string | null; readonly naam: string | null; readonly magBeheren: boolean };
  readonly bewoners: readonly BewonerView[];
  readonly schermen: readonly { readonly naam: string; readonly sindsMs: number }[];
  /** Aanwezigheid zonder bewoner: gasten, die alleen als "iemand thuis" tellen. */
  readonly gasten: readonly { readonly id: string; readonly naam: string; readonly thuis: boolean | null }[];
  /** Alle bronnen, om er een te kiezen; van is de bewoner die hem al heeft. */
  readonly bronnen: readonly { readonly id: string; readonly naam: string; readonly thuis: boolean | null; readonly van: string | null }[];
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
  const bewoners = b.volgorde.flatMap((id, i): BewonerView[] => {
    const x = b.bewoners[id];
    if (x == null) return [];
    const o = bron(x.aanwezigheid);
    const s = o ? state(o.ref.id) : undefined;
    const sinds = s ? Date.parse(s.last_changed) : NaN;
    return [{
      id, naam: x.naam, haNaam: x.haNaam, plek: i + 1, hoofd: i === 0,
      aanwezigheid: o ? o.id : null, aanwezigheidNaam: o ? naamVan(s, o.id) : null,
      thuis: o ? thuisVan(s) : null, thuisSindsMs: Number.isFinite(sinds) ? sinds : null,
      comfort: i === 0 ? 'eigen' : x.comfort, geldt: profile?.id === id, ik: ikB?.id === id, sindsMs: x.sindsMs,
    }];
  });
  const gebruikt = new Map(Object.values(b.bewoners).filter((x) => x.aanwezigheid != null).map((x) => [x.aanwezigheid!, x.naam]));
  const bronnen = occupancy.map((o) => ({ id: o.id, naam: naamVan(state(o.ref.id), o.id), thuis: thuisVan(state(o.ref.id)), van: gebruikt.get(o.id) ?? null }));
  return {
    ik: {
      soort: ikB ? 'bewoner' : ikScherm ? 'scherm' : 'onbekend',
      id: ikB?.id ?? null,
      naam: ikB?.naam ?? null,
      magBeheren: wie.beheerder || (hoofd != null && ikB?.id === hoofd.id) || b.volgorde.length === 0,
    },
    bewoners,
    schermen: Object.values(b.schermen).map((s) => ({ naam: s.naam, sindsMs: s.sindsMs })),
    gasten: bronnen.filter((x) => x.van == null).map((x) => ({ id: x.id, naam: x.naam, thuis: x.thuis })),
    bronnen,
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
  | { readonly actie: 'vasthouden'; readonly id: string | null };

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
    default:
      return null;
  }
}

/**
 * Wat een actie doet. Aan jezelf mag je alles; de hoofdgebruiker en een
 * beheerder ook aan een ander. "Toch die van" mag iedereen die ingelogd is,
 * ook de wand; thuis zijn de bewoners die nu thuis zijn, uit de kern.
 */
export function voerUit(b: Bewoners, comfort: Comfort | null, a: Actie, wie: Wie & { readonly naam: string }, occupancy: readonly OccupancySource[], thuis: readonly string[], nowMs: number): Uitkomst {
  const ik = Object.values(b.bewoners).find((x) => wie.userId != null && x.haUser === wie.userId) ?? null;
  const hoofd = hoofdVan(b);
  const beheert = wie.beheerder || (hoofd != null && ik?.id === hoofd.id);
  const mag = (id: string) => beheert || ik?.id === id;
  const bewoner = (id: string) => b.bewoners[id];
  switch (a.actie) {
    case 'ik': {
      if (wie.userId == null) return { ok: false, status: 403, reden: 'log eerst in' };
      if (ik) return { ok: true, bewoners: b };
      if (a.soort === 'scherm') return { ok: true, bewoners: alsScherm(b, { userId: wie.userId, naam: wie.naam }, nowMs) };
      if (a.aanwezigheid != null && !occupancy.some((o) => o.id === a.aanwezigheid)) return { ok: false, status: 400, reden: 'die aanwezigheid kent het huis niet' };
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
    case 'vasthouden': {
      if (wie.userId == null) return { ok: false, status: 403, reden: 'log eerst in' };
      if (a.id == null) return { ok: true, bewoners: zonderVasthouden(b) };
      if (bewoner(a.id) == null) return { ok: false, status: 404, reden: 'die bewoner is er niet' };
      return { ok: true, bewoners: { ...b, vasthouden: { id: a.id, home: [...thuis], sindsMs: nowMs } } };
    }
  }
}
