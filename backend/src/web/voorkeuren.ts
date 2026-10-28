/*
 * Thuis naar eigen smaak (besluit 162, schetsen Thuis-Tel-Eigen en
 * Wand-Thuis-Eigen).
 *
 * Op de telefoon kiest ieder account zelf welke kaarten Thuis heeft, in welke
 * volgorde, en welke scènes en lampen in Favorieten staan. De wand is van
 * iedereen: één indeling voor het hele huis, die alleen de hoofdgebruiker of
 * een beheerder verandert. Op de wand staan de kaarten in een kolom die zelf
 * schuift, zoveel als je wilt (besluit 167; eerst waren het vier vakken).
 * Straks staat niet in de lijst van de wand: dat schuift er vanzelf bovenin
 * bij als het huis op zon wacht.
 *
 * De tweede stap (besluit 164, schetsen Wand-Nacht en Thuis-Tel-Eigen
 * #weergave): per account eenvoudig of uitgebreid, grotere letters en minder
 * beweging; en voor de wand wat hij doet als niemand kijkt: de nachtstand van
 * bedtijd tot de ochtend, rust overdag na een paar minuten, en welke
 * bewegingsmelder hem wekt. Dat laatste verandert alleen wie de wand mag
 * aanpassen.
 *
 * Het profiel (besluit 181): per bewoner ook het thema op de telefoon
 * (donker, licht of zoals de telefoon) en een eigen kleur. Er is één
 * indeling per bewoner: de wand toont de kaarten, de favorieten en de kleur
 * van wiens comfort geldt, zoals die op zijn telefoon staan, zonder de kamers
 * en Straks; is er niemand thuis, die van de hoofdgebruiker. Wie nog geen
 * kleur koos, krijgt er een op volgorde. Wat de wand doet als niemand kijkt,
 * blijft van de wand.
 *
 * Alles staat in één eigen bestand naast de dataset en gaat mee in de
 * back-up; er gaat niets naar Home Assistant. Favorieten schakelen via de
 * deuren die er al zijn (`/api/licht`, `/api/scene`); dit bestand onthoudt
 * alleen wat er gekozen is.
 */

import type { Lang } from './assistant.js';
import { STANDAARD_MELDINGEN, type MeldingKeus } from './push.js';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const VOORKEUREN_FILE = 'voorkeuren.json';

/** De kaarten van Thuis, onder het huis (telefoon) of rechts ervan (wand). */
/** De auto, de batterij, deze maand en de deurbel kwamen erbij in besluit 182: om te kiezen, niet standaard. */
/** De boiler (de boiler of de jacuzzi) kwam erbij in besluit 189. */
export const KAARTEN = ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag', 'morgen', 'auto', 'batterij', 'maand', 'deurbel', 'boiler', 'sluip'] as const;
export type KaartId = (typeof KAARTEN)[number];

/** De kaarten die op de wand kunnen. De kamers staan daar in het huis, Straks komt vanzelf. */
export const WAND_KAARTEN: readonly KaartId[] = ['favorieten', 'vandaag', 'apparaat', 'gevoel', 'morgen', 'auto', 'batterij', 'maand', 'deurbel', 'boiler', 'sluip'];
/** Twaalf favorieten, vier per pagina (21 oktober 2026; eerst vier, besluit 162). */
export const MAX_FAVORIETEN = 12;

/** Zo staat Thuis erbij zolang niemand iets koos: zoals het was, met Favorieten onder de kamers. */
export const STANDAARD_TEL: readonly KaartId[] = ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag'];
/** Op de wand: wijkt er een voor Straks, dan liever het apparaat dan Hoe voelt het. */
export const STANDAARD_WAND: readonly KaartId[] = ['vandaag', 'gevoel', 'apparaat'];
/**
 * Op de wand staan de kaarten in twee kolommen (besluit 187): een kaart is smal
 * (een kolom) of breed (de hele breedte, laat meer zien). Zo staan ze erbij
 * zolang niemand iets koos: wat een lijst of grafiek heeft, breed.
 */
export const STANDAARD_BREED: readonly KaartId[] = ['favorieten', 'vandaag', 'gevoel'];

/** Hoe Thuis eruitziet voor jou, op elk scherm waar je inlogt (besluit 164). */
export interface Weergave {
  /** De temperatuur en wat het huis doet in zinnen, minder getallen. */
  readonly eenvoudig: boolean;
  /** Alle tekst een maat groter; op de wand niet, want die schuift nooit. */
  readonly groteLetters: boolean;
  /** Geen lopende stromen en geen ademende bol. */
  readonly minderBeweging: boolean;
  /** Het seizoen in het huis: herfstbladeren, kale bomen in de winter (25 oktober 2026). */
  readonly seizoen: boolean;
  /** Het weer rond het huis: regen en sneeuw. */
  readonly weer: boolean;
  /** Feestdagen: een pompoen met Halloween, lichtjes met Kerst, vuurwerk met Oud en Nieuw, eieren met Pasen. */
  readonly feestdagen: boolean;
  /** De baan van de zon rond het huis, met de uren, opkomst en ondergang (besluit 205); de zon zelf staat er altijd. */
  readonly zonnebaan: boolean;
}
export const STANDAARD_WEERGAVE: Weergave = { eenvoudig: false, groteLetters: false, minderBeweging: false, seizoen: true, weer: true, feestdagen: true, zonnebaan: true };

/** Na hoeveel minuten zonder iemand aan het scherm de wand overdag rust; 0 is nooit. */
export const RUST_MINUTEN = [0, 2, 5, 15] as const;
export type RustMinuten = (typeof RUST_MINUTEN)[number];

/** Zo lang blijft het display aan zonder beweging, voor het 's nachts of zonder iemand thuis uitgaat (besluit 165). */
export const AAN_MINUTEN = [1, 5, 15, 30] as const;
export type AanMinuten = (typeof AAN_MINUTEN)[number];

/**
 * Het scherm aan de wand als niemand kijkt (besluiten 164 en 165, schets
 * Wand-Nacht): een always-on display, overdag de dagstand en na
 * zonsondergang de avondstand; 's nachts en als niemand thuis is uit.
 */
export interface Niemand {
  /** De nachtstand: het scherm uit. */
  readonly nacht: boolean;
  /** Van bedtijd tot de ochtend, als uu:mm; ook als iemand het huis op Nacht zet. */
  readonly van: string;
  readonly tot: string;
  /** Na zoveel minuten zonder iemand aan het scherm het always-on display; 0 is nooit. */
  readonly rustMin: RustMinuten;
  /** Zo lang blijft het display aan zonder beweging, 's nachts of zonder iemand thuis. */
  readonly aanMin: AanMinuten;
  /** Ook uit als niemand thuis is. */
  readonly weg: boolean;
  /**
   * De dagstand en de avondstand (besluit 168): overdag vanaf het einde van de
   * nacht tot zonsondergang, 's avonds van zonsondergang tot de nacht. Staat er
   * één uit, dan neemt de andere zijn tijd over.
   */
  readonly dag: boolean;
  readonly avond: boolean;
  /**
   * Hoe fel het scherm is, in procenten (21 oktober 2026): overdag (ook als
   * iemand de app gebruikt) en in de avondstand. Eerst zette de avondstand
   * de helderheid laag en onthield de pagina wat er was; laadde de wand
   * intussen een andere pagina, dan bleef hij ook de ochtend erna zo laag.
   */
  readonly helderDag: HelderDag;
  readonly helderAvond: HelderAvond;
  /** De bewegingsmelder die het display aanzet, of null. */
  readonly melder: string | null;
}
export const HELDER_DAG = [50, 75, 100] as const;
export type HelderDag = (typeof HELDER_DAG)[number];
export const HELDER_AVOND = [10, 20, 30, 50] as const;
export type HelderAvond = (typeof HELDER_AVOND)[number];
export const STANDAARD_NIEMAND: Niemand = { nacht: true, van: '23:00', tot: '07:00', rustMin: 5, aanMin: 5, weg: true, dag: true, avond: true, helderDag: 100, helderAvond: 20, melder: null };

/** De eigen kleuren (besluit 181), in de volgorde waarin bewoners er een krijgen. Nooit een kleur die iets betekent. */
export const KLEUREN = ['lucht', 'framboos', 'zeegroen', 'violet', 'koper', 'grafiet'] as const;
export type Kleur = (typeof KLEUREN)[number];
/** Het thema op de telefoon; de wand blijft donker. */
export const THEMAS = ['donker', 'licht', 'systeem'] as const;
export type Thema = (typeof THEMAS)[number];
export const STANDAARD_THEMA: Thema = 'donker';
/**
 * De taal van de app (besluit 185): `auto` is de taal van je account in Home
 * Assistant; of zelf gekozen. De wand volgt altijd zijn eigen account.
 */
export const TAALKEUZES = ['auto', 'nl', 'en'] as const;
export type TaalKeus = (typeof TAALKEUZES)[number];
export const STANDAARD_TAAL: TaalKeus = 'auto';

export interface Favoriet {
  readonly soort: 'lamp' | 'scene' | 'scherm';
  /** Een lamp zoals het huis hem noemt, een `scene.` of een screen of zonnescherm (`cover.`) uit Home Assistant. */
  readonly id: string;
}

interface Eigen {
  readonly tel?: readonly KaartId[];
  /** Welke kaarten op de wand breed staan (besluit 187). */
  readonly breed?: readonly KaartId[];
  readonly favorieten?: readonly Favoriet[];
  /** De camera's op de kaart Camera's (besluit 201), in deze volgorde; weg is alle. */
  readonly cameras?: readonly string[];
  readonly weergave?: Weergave;
  readonly thema?: Thema;
  readonly kleur?: Kleur;
  readonly taal?: TaalKeus;
  /** Wat je op je telefoon wilt horen (besluit 183); weg is de standaard. */
  readonly meldingen?: Partial<MeldingKeus>;
}

interface Bestand {
  readonly versie: 1;
  /** Per account van Home Assistant; '' is zonder inlog (de NAS op het thuisnetwerk). */
  readonly accounts: Readonly<Record<string, Eigen>>;
  /** De wand. Kaarten en favorieten hier gelden alleen zonder bewoners (besluit 181). */
  readonly wand?: { readonly kaarten?: readonly KaartId[]; readonly breed?: readonly KaartId[]; readonly favorieten?: readonly Favoriet[]; readonly cameras?: readonly string[]; readonly niemand?: Niemand };
}

const LEEG: Bestand = { versie: 1, accounts: {} };

export interface VoorkeurenView {
  readonly tel: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly cameras: readonly string[] | null; readonly weergave: Weergave; readonly thema: Thema; readonly kleur: Kleur; readonly taal: TaalKeus; readonly meldingen: MeldingKeus };
  /**
   * De wand: de kaarten, favorieten en kleur van wiens profiel geldt (`van`,
   * een account), zoals op zijn telefoon; zonder bewoners die van het huis.
   * `eigen`: wie kijkt is zelf die bewoner, en niet een scherm.
   */
  readonly wand: { readonly kaarten: readonly KaartId[]; readonly breed: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly cameras: readonly string[] | null; readonly magAanpassen: boolean; readonly niemand: Niemand; readonly kleur: Kleur; readonly van: string | null; readonly naam: string | null; readonly eigen: boolean;
    /**
     * Wat de wand overneemt van wie hij volgt (25 oktober 2026): de weergave, het
     * thema en de taal van diens account, net als de kaarten en de kleur. Null
     * zonder bewoners: dan die van het scherm zelf.
     */
    readonly persoon: { readonly weergave: Weergave; readonly thema: Thema; readonly taal: TaalKeus } | null };
  /** De kleur van elke bewoner, op zijn id: voor de begroeting en de rondjes. */
  readonly kleuren: Readonly<Record<string, Kleur>>;
  /** Wie kijkt is een scherm, zoals de wand: dat blijft donker, ook met een breed scherm. */
  readonly scherm: boolean;
  readonly maxFavorieten: number;
  /** De standaard (besluit 204), voor "terug naar standaard" bij Jij: de weergave, het thema, de kleur en de kaarten. */
  readonly standaard: { readonly weergave: Weergave; readonly thema: Thema; readonly kleur: Kleur; readonly kaarten: readonly KaartId[]; readonly breed: readonly KaartId[] };
}

export type VoorkeurenResult = { readonly ok: true; readonly view: VoorkeurenView } | { readonly ok: false; readonly status: number; readonly reden: string };

/**
 * De bewoners voor het profiel (besluit 181): op volgorde, de hoofdgebruiker
 * eerst, elk met zijn id en zijn account; en het account van wiens comfort nu
 * geldt.
 */
export interface Profielen {
  readonly volgorde: readonly { readonly id: string; readonly account: string; readonly naam?: string }[];
  readonly geldt: string | null;
}
const accounts = (p: Profielen | undefined): string[] => (p?.volgorde ?? []).map((x) => x.account);

/** Wie er kijkt: zijn account, of hij de wand mag aanpassen, en of het een scherm is. */
export interface VoorkeurWie {
  readonly userId: string | null;
  readonly magWand: boolean;
  readonly scherm?: boolean;
  readonly profielen?: Profielen;
}

/** De kleur van een account: zelf gekozen, of op zijn plek in de volgorde. */
export function kleurVan(b: Bestand, userId: string | null, p: Profielen | undefined): Kleur {
  const gekozen = userId == null ? undefined : b.accounts[userId]?.kleur;
  if (gekozen && (KLEUREN as readonly string[]).includes(gekozen)) return gekozen;
  return standaardKleur(userId, p);
}

/** De kleur zonder eigen keuze: die van je plek in het huis (besluit 147), anders lucht. */
export function standaardKleur(userId: string | null, p: Profielen | undefined): Kleur {
  const plek = userId == null ? -1 : accounts(p).indexOf(userId);
  return plek < 0 ? 'lucht' : KLEUREN[plek % KLEUREN.length]!;
}

/**
 * Van wie de wand is: op een scherm wiens comfort geldt, anders de
 * hoofdgebruiker; op je eigen tablet of computer jijzelf, als je bewoner bent.
 * Null zonder bewoners: dan is de wand van het huis, zoals vóór besluit 181.
 */
function wandVan(wie: VoorkeurWie): { van: string | null; eigen: boolean } {
  const p = wie.profielen;
  if (p == null || p.volgorde.length === 0) return { van: null, eigen: false };
  const a = accounts(p);
  if (!wie.scherm && wie.userId != null && a.includes(wie.userId)) return { van: wie.userId, eigen: true };
  return { van: p.geldt != null && a.includes(p.geldt) ? p.geldt : a[0]!, eigen: false };
}

/** Een lijst kaarten, of de reden waarom niet. Op de wand: zonder kamers en Straks. */
export function leesKaarten(x: unknown, plek: 'tel' | 'wand'): { ok: true; kaarten: KaartId[] } | { ok: false; reden: string } {
  if (!Array.isArray(x) || x.length > KAARTEN.length) return { ok: false, reden: 'kaarten is een lijst' };
  const kaarten: KaartId[] = [];
  for (const k of x) {
    if (typeof k !== 'string' || !(KAARTEN as readonly string[]).includes(k)) return { ok: false, reden: `die kaart bestaat niet: ${String(k)}` };
    if (kaarten.includes(k as KaartId)) return { ok: false, reden: `${k} staat er twee keer in` };
    kaarten.push(k as KaartId);
  }
  if (plek === 'wand') {
    if (kaarten.some((k) => !WAND_KAARTEN.includes(k))) return { ok: false, reden: 'de kamers en Straks staan op de wand al vanzelf' };
  }
  return { ok: true, kaarten };
}

/** Welke kaarten breed staan (besluit 187): kaarten die op de wand kunnen, elk één keer. */
export function leesBreed(x: unknown): { ok: true; breed: KaartId[] } | { ok: false; reden: string } {
  if (!Array.isArray(x) || x.length > WAND_KAARTEN.length) return { ok: false, reden: 'breed is een lijst kaarten' };
  const breed: KaartId[] = [];
  for (const k of x) {
    if (!WAND_KAARTEN.includes(k as KaartId)) return { ok: false, reden: `die kaart staat niet op de wand: ${String(k)}` };
    if (!breed.includes(k as KaartId)) breed.push(k as KaartId);
  }
  return { ok: true, breed };
}

/** De camera's op de kaart (besluit 201): hooguit twaalf beelden van Home Assistant, geen dubbele. */
export function leesCameras(x: unknown): { ok: true; cameras: string[] } | { ok: false; reden: string } {
  if (!Array.isArray(x)) return { ok: false, reden: 'cameras is een lijst' };
  if (x.length > MAX_FAVORIETEN) return { ok: false, reden: `hooguit ${MAX_FAVORIETEN} camera's` };
  const cameras: string[] = [];
  for (const id of x) {
    if (typeof id !== 'string' || !/^camera\.[a-z0-9_]+$/.test(id)) return { ok: false, reden: 'een camera is een camera.… uit Home Assistant' };
    if (cameras.includes(id)) return { ok: false, reden: `${id} staat er twee keer in` };
    cameras.push(id);
  }
  return { ok: true, cameras };
}

/** Hooguit twaalf favorieten, elk een lamp, een scène of een scherm, en geen dubbele. */
export function leesFavorieten(x: unknown): { ok: true; favorieten: Favoriet[] } | { ok: false; reden: string } {
  if (!Array.isArray(x)) return { ok: false, reden: 'favorieten is een lijst' };
  if (x.length > MAX_FAVORIETEN) return { ok: false, reden: `hooguit ${MAX_FAVORIETEN} favorieten` };
  const favorieten: Favoriet[] = [];
  for (const f of x) {
    const r = typeof f === 'object' && f != null && !Array.isArray(f) ? (f as Record<string, unknown>) : {};
    const soort = r['soort'];
    const id = r['id'];
    if (soort !== 'lamp' && soort !== 'scene' && soort !== 'scherm') return { ok: false, reden: 'een favoriet is een lamp, een scène of een scherm' };
    if (typeof id !== 'string' || id.length > 160 || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)) return { ok: false, reden: 'een favoriet heeft een id uit Home Assistant' };
    if (soort === 'scene' && !id.startsWith('scene.')) return { ok: false, reden: 'een scène begint met scene.' };
    if (soort === 'scherm' && !id.startsWith('cover.')) return { ok: false, reden: 'een scherm begint met cover.' };
    if (favorieten.some((g) => g.id === id)) return { ok: false, reden: `${id} staat er twee keer in` };
    favorieten.push({ soort, id });
  }
  return { ok: true, favorieten };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x != null && !Array.isArray(x);

/** Een deel van de weergave, bovenop wat er al stond. */
export function leesWeergave(x: unknown, nu: Weergave): { ok: true; weergave: Weergave } | { ok: false; reden: string } {
  if (!isObject(x)) return { ok: false, reden: 'weergave is een object' };
  const uit: Record<string, boolean> = { ...nu };
  for (const [k, w] of Object.entries(x)) {
    if (!(k in STANDAARD_WEERGAVE)) return { ok: false, reden: `die keuze bestaat niet: ${k}` };
    if (typeof w !== 'boolean') return { ok: false, reden: `${k} is aan of uit` };
    uit[k] = w;
  }
  return { ok: true, weergave: uit as unknown as Weergave };
}

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const MELDER = /^binary_sensor\.[a-z0-9_]+$/;

/** Een deel van wat de wand doet als niemand kijkt, bovenop wat er al stond. */
export function leesNiemand(x: unknown, nu: Niemand): { ok: true; niemand: Niemand } | { ok: false; reden: string } {
  if (!isObject(x)) return { ok: false, reden: 'niemand is een object' };
  const uit: Record<string, unknown> = { ...nu };
  for (const [k, w] of Object.entries(x)) {
    if (k === 'nacht' || k === 'weg' || k === 'dag' || k === 'avond') {
      if (typeof w !== 'boolean') return { ok: false, reden: `${k} is aan of uit` };
    } else if (k === 'aanMin') {
      if (!(AAN_MINUTEN as readonly unknown[]).includes(w)) return { ok: false, reden: `aan zonder beweging is ${AAN_MINUTEN.join(', ')} minuten` };
    } else if (k === 'van' || k === 'tot') {
      if (typeof w !== 'string' || !TIJD.test(w)) return { ok: false, reden: `${k} is een tijd als 23:00` };
    } else if (k === 'rustMin') {
      if (!(RUST_MINUTEN as readonly unknown[]).includes(w)) return { ok: false, reden: `rust overdag is ${RUST_MINUTEN.join(', ')} minuten` };
    } else if (k === 'helderDag') {
      if (!(HELDER_DAG as readonly unknown[]).includes(w)) return { ok: false, reden: `helderheid overdag is ${HELDER_DAG.join(', ')} procent` };
    } else if (k === 'helderAvond') {
      if (!(HELDER_AVOND as readonly unknown[]).includes(w)) return { ok: false, reden: `helderheid in de avondstand is ${HELDER_AVOND.join(', ')} procent` };
    } else if (k === 'melder') {
      if (w !== null && (typeof w !== 'string' || w.length > 160 || !MELDER.test(w))) return { ok: false, reden: 'de melder is een binary_sensor uit Home Assistant' };
    } else return { ok: false, reden: `die keuze bestaat niet: ${k}` };
    uit[k] = w;
  }
  if (uit['van'] === uit['tot']) return { ok: false, reden: 'de nacht begint en eindigt niet op dezelfde tijd' };
  return { ok: true, niemand: uit as unknown as Niemand };
}

export function voorkeurenView(b: Bestand, wie: VoorkeurWie): VoorkeurenView {
  const eigen = b.accounts[wie.userId ?? ''] ?? {};
  const { van, eigen: zelf } = wandVan(wie);
  // Eén indeling per bewoner: op de wand die van zijn telefoon, zonder wat de wand zelf al toont.
  const profiel = van == null ? null : (b.accounts[van] ?? {});
  const themaVan = (a: { thema?: string }) => (a.thema && (THEMAS as readonly string[]).includes(a.thema) ? (a.thema as Thema) : STANDAARD_THEMA);
  const taalVan = (a: { taal?: string }) => (a.taal && (TAALKEUZES as readonly string[]).includes(a.taal) ? (a.taal as TaalKeus) : STANDAARD_TAAL);
  const thema = themaVan(eigen);
  const taal = taalVan(eigen);
  return {
    tel: { kaarten: eigen.tel ?? STANDAARD_TEL, favorieten: eigen.favorieten ?? [], cameras: eigen.cameras ?? null, weergave: { ...STANDAARD_WEERGAVE, ...eigen.weergave }, thema, kleur: kleurVan(b, wie.userId, wie.profielen), taal, meldingen: { ...STANDAARD_MELDINGEN, ...eigen.meldingen } },
    wand: {
      kaarten: profiel ? (profiel.tel ?? STANDAARD_TEL).filter((k) => WAND_KAARTEN.includes(k)) : (b.wand?.kaarten ?? STANDAARD_WAND),
      breed: (profiel ? profiel.breed : b.wand?.breed) ?? STANDAARD_BREED,
      favorieten: profiel ? (profiel.favorieten ?? []) : (b.wand?.favorieten ?? []),
      cameras: profiel ? (profiel.cameras ?? null) : (b.wand?.cameras ?? null),
      // Zonder bewoners past de hoofdgebruiker of een beheerder de wand aan; met bewoners je eigen indeling, of op een scherm die van wie er geldt.
      magAanpassen: van == null ? wie.magWand : true,
      niemand: { ...STANDAARD_NIEMAND, ...b.wand?.niemand },
      kleur: van == null ? 'lucht' : kleurVan(b, van, wie.profielen),
      van,
      naam: wie.profielen?.volgorde.find((x) => x.account === van)?.naam ?? null,
      eigen: zelf,
      persoon: profiel ? { weergave: { ...STANDAARD_WEERGAVE, ...profiel.weergave }, thema: themaVan(profiel), taal: taalVan(profiel) } : null,
    },
    kleuren: Object.fromEntries((wie.profielen?.volgorde ?? []).map((x) => [x.id, kleurVan(b, x.account, wie.profielen)])),
    scherm: wie.scherm === true,
    maxFavorieten: MAX_FAVORIETEN,
    standaard: { weergave: STANDAARD_WEERGAVE, thema: STANDAARD_THEMA, kleur: standaardKleur(wie.userId, wie.profielen), kaarten: STANDAARD_TEL, breed: STANDAARD_BREED },
  };
}

/**
 * De kaarten van de telefoon, met de volgorde die op de wand gekozen is
 * (besluit 181): de kamers en Straks blijven op hun plek, de kaarten die de
 * wand kent komen in de nieuwe volgorde op de plekken van de wand, wat de wand
 * wegliet gaat weg en wat erbij kwam komt achteraan.
 */
export function metWandVolgorde(tel: readonly KaartId[], wand: readonly KaartId[]): KaartId[] {
  const rest = [...wand];
  const uit: KaartId[] = [];
  for (const k of tel) {
    if (!WAND_KAARTEN.includes(k)) uit.push(k);
    else if (rest.length) uit.push(rest.shift()!);
  }
  return [...uit, ...rest];
}

/** Een deel van wat je op je telefoon wilt horen (besluit 183), bovenop wat er al stond. */
export function leesMeldingen(x: unknown, nu: MeldingKeus): { ok: true; meldingen: MeldingKeus } | { ok: false; reden: string } {
  if (!isObject(x)) return { ok: false, reden: 'meldingen is een object' };
  const uit: Record<string, unknown> = { ...nu };
  for (const [k, w] of Object.entries(x)) {
    if (k === 'rook' || k === 'regeling' || k === 'onderhoud' || k === 'versie' || k === 'sluip') {
      if (typeof w !== 'boolean') return { ok: false, reden: `${k} is aan of uit` };
    } else if (k === 'van' || k === 'tot') {
      if (typeof w !== 'string' || !TIJD.test(w)) return { ok: false, reden: `${k} is een tijd als 23:00` };
    } else if (k === 'telefoon') {
      if (w !== null && (typeof w !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(w))) return { ok: false, reden: 'de telefoon is een apparaat uit Home Assistant' };
    } else return { ok: false, reden: `die keuze bestaat niet: ${k}` };
    uit[k] = w;
  }
  return { ok: true, meldingen: uit as unknown as MeldingKeus };
}

/** Wat een account op zijn telefoon wil horen; voor de dienst die meldt. */
export function meldingenVan(b: Bestand, account: string): MeldingKeus {
  return { ...STANDAARD_MELDINGEN, ...b.accounts[account]?.meldingen };
}

/** Het thema en de kleur (besluit 181), elk uit de vaste lijst. */
export function leesThema(x: unknown): { ok: true; thema: Thema } | { ok: false; reden: string } {
  return typeof x === 'string' && (THEMAS as readonly string[]).includes(x) ? { ok: true, thema: x as Thema } : { ok: false, reden: `het thema is ${THEMAS.join(', ')}` };
}
export function leesTaal(x: unknown): { ok: true; taal: TaalKeus } | { ok: false; reden: string } {
  return typeof x === 'string' && (TAALKEUZES as readonly string[]).includes(x) ? { ok: true, taal: x as TaalKeus } : { ok: false, reden: `de taal is ${TAALKEUZES.join(', ')}` };
}
export function leesKleur(x: unknown): { ok: true; kleur: Kleur } | { ok: false; reden: string } {
  return typeof x === 'string' && (KLEUREN as readonly string[]).includes(x) ? { ok: true, kleur: x as Kleur } : { ok: false, reden: `de kleur is ${KLEUREN.join(', ')}` };
}

/**
 * Wat er verandert: `{ plek: 'tel' | 'wand', kaarten?, favorieten? }`. Op de
 * telefoon je eigen keuze. Op de wand de indeling van wie hij nu is (besluit
 * 181): je eigen, of op een scherm die van wiens comfort geldt; dat is
 * dezelfde als op de telefoon. Zonder bewoners alleen als je de wand mag
 * aanpassen. Bij de telefoon ook
 * `weergave`, `thema`, `kleur` en `taal` (die gelden voor jou, op elk scherm), bij de
 * wand `niemand`, dat alleen de hoofdgebruiker of een beheerder verandert.
 */
export function pasToe(b: Bestand, body: unknown, wie: VoorkeurWie): { ok: true; bestand: Bestand } | { ok: false; status: number; reden: string } {
  const r = isObject(body) ? body : null;
  const plek = r?.['plek'];
  if (plek !== 'tel' && plek !== 'wand') return { ok: false, status: 400, reden: 'plek is tel of wand' };
  if (!['kaarten', 'breed', 'favorieten', 'cameras', 'weergave', 'niemand', 'thema', 'kleur', 'taal', 'meldingen'].some((k) => r![k] !== undefined)) return { ok: false, status: 400, reden: 'geef kaarten, breed, favorieten, cameras, weergave, thema, kleur, taal, meldingen of niemand' };
  if (plek === 'wand' && ['weergave', 'thema', 'kleur', 'taal', 'meldingen'].some((k) => r![k] !== undefined)) return { ok: false, status: 400, reden: 'de weergave, het thema, de kleur, de taal en de meldingen zijn per account: plek tel' };
  if (plek === 'tel' && r!['niemand'] !== undefined) return { ok: false, status: 400, reden: 'als niemand kijkt hoort bij de wand: plek wand' };
  const { van } = wandVan(wie);
  if (plek === 'wand' && (van == null || r!['niemand'] !== undefined) && !wie.magWand) return { ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' };
  const kaarten = r!['kaarten'] === undefined ? null : leesKaarten(r!['kaarten'], plek);
  if (kaarten && !kaarten.ok) return { ok: false, status: 400, reden: kaarten.reden };
  const favorieten = r!['favorieten'] === undefined ? null : leesFavorieten(r!['favorieten']);
  if (favorieten && !favorieten.ok) return { ok: false, status: 400, reden: favorieten.reden };
  const breed = r!['breed'] === undefined ? null : leesBreed(r!['breed']);
  if (breed && !breed.ok) return { ok: false, status: 400, reden: breed.reden };
  const cameras = r!['cameras'] === undefined ? null : leesCameras(r!['cameras']);
  if (cameras && !cameras.ok) return { ok: false, status: 400, reden: cameras.reden };
  const nu = voorkeurenView(b, wie);
  if (plek === 'wand') {
    const niemand = r!['niemand'] === undefined ? null : leesNiemand(r!['niemand'], nu.wand.niemand);
    if (niemand && !niemand.ok) return { ok: false, status: 400, reden: niemand.reden };
    const indeling = {
      ...(kaarten ? { kaarten: kaarten.kaarten } : {}),
      ...(breed ? { breed: breed.breed } : {}),
      ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
      ...(cameras ? { cameras: cameras.cameras } : {}),
    };
    const wand = { ...b.wand, ...(van == null ? indeling : {}), ...(niemand ? { niemand: niemand.niemand } : {}) };
    const profiel = van == null ? null : (b.accounts[van] ?? {});
    const accounts = profiel == null || (!kaarten && !favorieten && !breed && !cameras)
      ? b.accounts
      : {
          ...b.accounts,
          [van!]: {
            ...profiel,
            ...(kaarten ? { tel: metWandVolgorde(profiel.tel ?? STANDAARD_TEL, kaarten.kaarten) } : {}),
            ...(breed ? { breed: breed.breed } : {}),
            ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
            ...(cameras ? { cameras: cameras.cameras } : {}),
          },
        };
    return { ok: true, bestand: { ...b, accounts, wand } };
  }
  const weergave = r!['weergave'] === undefined ? null : leesWeergave(r!['weergave'], nu.tel.weergave);
  if (weergave && !weergave.ok) return { ok: false, status: 400, reden: weergave.reden };
  const thema = r!['thema'] === undefined ? null : leesThema(r!['thema']);
  if (thema && !thema.ok) return { ok: false, status: 400, reden: thema.reden };
  const kleur = r!['kleur'] === undefined ? null : leesKleur(r!['kleur']);
  if (kleur && !kleur.ok) return { ok: false, status: 400, reden: kleur.reden };
  const taal = r!['taal'] === undefined ? null : leesTaal(r!['taal']);
  if (taal && !taal.ok) return { ok: false, status: 400, reden: taal.reden };
  const meldingen = r!['meldingen'] === undefined ? null : leesMeldingen(r!['meldingen'], nu.tel.meldingen);
  if (meldingen && !meldingen.ok) return { ok: false, status: 400, reden: meldingen.reden };
  const sleutel = wie.userId ?? '';
  const eigen = {
    ...b.accounts[sleutel],
    ...(kaarten ? { tel: kaarten.kaarten } : {}),
    ...(breed ? { breed: breed.breed } : {}),
    ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
    ...(cameras ? { cameras: cameras.cameras } : {}),
    ...(weergave ? { weergave: weergave.weergave } : {}),
    ...(thema ? { thema: thema.thema } : {}),
    ...(kleur ? { kleur: kleur.kleur } : {}),
    ...(taal ? { taal: taal.taal } : {}),
    ...(meldingen ? { meldingen: meldingen.meldingen } : {}),
  };
  return { ok: true, bestand: { ...b, accounts: { ...b.accounts, [sleutel]: eigen } } };
}

export class VoorkeurenStore {
  readonly #path: string;
  #current: Bestand = LEEG;
  #writing: Promise<void> = Promise.resolve();
  /** Per account de taal waarin de app het laatst opende (voor Automatisch). */
  readonly #gezien = new Map<string, Lang>();

  constructor(logDir: string) {
    this.#path = join(logDir, VOORKEUREN_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { versie?: unknown; accounts?: unknown };
      this.#current = raw?.versie === 1 && typeof raw.accounts === 'object' && raw.accounts != null ? (raw as Bestand) : LEEG;
    } catch {
      this.#current = LEEG;
    }
  }

  view(wie: VoorkeurWie): VoorkeurenView {
    return voorkeurenView(this.#current, wie);
  }

  /** Wat een account op zijn telefoon wil horen (besluit 183). */
  meldingen(account: string): MeldingKeus {
    return meldingenVan(this.#current, account);
  }

  /**
   * De taal van een account voor wat de dienst zelf stuurt, zoals een melding
   * op de telefoon (besluit 185): wat hij bij Jij koos. Bij Automatisch de
   * taal waarin de app van dat account het laatst opende: de dienst kent de
   * taal van het account in Home Assistant niet, de app wel. Nog niet gezien
   * (na een herstart, voor de app weer opent): Nederlands.
   */
  taal(account: string): Lang {
    const keus = this.#current.accounts[account]?.taal;
    if (keus === 'en' || keus === 'nl') return keus;
    return this.#gezien.get(account) ?? 'nl';
  }

  /** De app van dit account opende in deze taal; alleen voor Automatisch, en niet bewaard. */
  zagTaal(account: string | null, lang: Lang): void {
    if (account) this.#gezien.set(account, lang);
  }

  /** De bewegingsmelder die de wand wekt (besluit 164), of null. */
  melder(): string | null {
    return this.#current.wand?.niemand?.melder ?? null;
  }

  async save(body: unknown, wie: VoorkeurWie): Promise<VoorkeurenResult> {
    const uit = pasToe(this.#current, body, wie);
    if (!uit.ok) return uit;
    this.#current = uit.bestand;
    const text = `${JSON.stringify(uit.bestand, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
    return { ok: true, view: this.view(wie) };
  }
}
