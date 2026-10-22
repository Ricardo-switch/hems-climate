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

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const VOORKEUREN_FILE = 'voorkeuren.json';

/** De kaarten van Thuis, onder het huis (telefoon) of rechts ervan (wand). */
/** De auto, de batterij, deze maand en de deurbel kwamen erbij in besluit 182: om te kiezen, niet standaard. */
export const KAARTEN = ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag', 'morgen', 'auto', 'batterij', 'maand', 'deurbel'] as const;
export type KaartId = (typeof KAARTEN)[number];

/** De kaarten die op de wand kunnen. De kamers staan daar in het huis, Straks komt vanzelf. */
export const WAND_KAARTEN: readonly KaartId[] = ['favorieten', 'vandaag', 'apparaat', 'gevoel', 'morgen', 'auto', 'batterij', 'maand', 'deurbel'];
/** Twaalf favorieten, vier per pagina (21 oktober 2026; eerst vier, besluit 162). */
export const MAX_FAVORIETEN = 12;

/** Zo staat Thuis erbij zolang niemand iets koos: zoals het was, met Favorieten onder de kamers. */
export const STANDAARD_TEL: readonly KaartId[] = ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag'];
/** Op de wand: wijkt er een voor Straks, dan liever het apparaat dan Hoe voelt het. */
export const STANDAARD_WAND: readonly KaartId[] = ['vandaag', 'gevoel', 'apparaat'];

/** Hoe Thuis eruitziet voor jou, op elk scherm waar je inlogt (besluit 164). */
export interface Weergave {
  /** De temperatuur en wat het huis doet in zinnen, minder getallen. */
  readonly eenvoudig: boolean;
  /** Alle tekst een maat groter; op de wand niet, want die schuift nooit. */
  readonly groteLetters: boolean;
  /** Geen lopende stromen en geen ademende bol. */
  readonly minderBeweging: boolean;
}
export const STANDAARD_WEERGAVE: Weergave = { eenvoudig: false, groteLetters: false, minderBeweging: false };

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

export interface Favoriet {
  readonly soort: 'lamp' | 'scene' | 'scherm';
  /** Een lamp zoals het huis hem noemt, een `scene.` of een screen of zonnescherm (`cover.`) uit Home Assistant. */
  readonly id: string;
}

interface Eigen {
  readonly tel?: readonly KaartId[];
  readonly favorieten?: readonly Favoriet[];
  readonly weergave?: Weergave;
  readonly thema?: Thema;
  readonly kleur?: Kleur;
}

interface Bestand {
  readonly versie: 1;
  /** Per account van Home Assistant; '' is zonder inlog (de NAS op het thuisnetwerk). */
  readonly accounts: Readonly<Record<string, Eigen>>;
  /** De wand. Kaarten en favorieten hier gelden alleen zonder bewoners (besluit 181). */
  readonly wand?: { readonly kaarten?: readonly KaartId[]; readonly favorieten?: readonly Favoriet[]; readonly niemand?: Niemand };
}

const LEEG: Bestand = { versie: 1, accounts: {} };

export interface VoorkeurenView {
  readonly tel: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly weergave: Weergave; readonly thema: Thema; readonly kleur: Kleur };
  /**
   * De wand: de kaarten, favorieten en kleur van wiens profiel geldt (`van`,
   * een account), zoals op zijn telefoon; zonder bewoners die van het huis.
   * `eigen`: wie kijkt is zelf die bewoner, en niet een scherm.
   */
  readonly wand: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly magAanpassen: boolean; readonly niemand: Niemand; readonly kleur: Kleur; readonly van: string | null; readonly naam: string | null; readonly eigen: boolean };
  /** De kleur van elke bewoner, op zijn id: voor de begroeting en de rondjes. */
  readonly kleuren: Readonly<Record<string, Kleur>>;
  /** Wie kijkt is een scherm, zoals de wand: dat blijft donker, ook met een breed scherm. */
  readonly scherm: boolean;
  readonly maxFavorieten: number;
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
  const thema = eigen.thema && (THEMAS as readonly string[]).includes(eigen.thema) ? eigen.thema : STANDAARD_THEMA;
  return {
    tel: { kaarten: eigen.tel ?? STANDAARD_TEL, favorieten: eigen.favorieten ?? [], weergave: { ...STANDAARD_WEERGAVE, ...eigen.weergave }, thema, kleur: kleurVan(b, wie.userId, wie.profielen) },
    wand: {
      kaarten: profiel ? (profiel.tel ?? STANDAARD_TEL).filter((k) => WAND_KAARTEN.includes(k)) : (b.wand?.kaarten ?? STANDAARD_WAND),
      favorieten: profiel ? (profiel.favorieten ?? []) : (b.wand?.favorieten ?? []),
      // Zonder bewoners past de hoofdgebruiker of een beheerder de wand aan; met bewoners je eigen indeling, of op een scherm die van wie er geldt.
      magAanpassen: van == null ? wie.magWand : true,
      niemand: { ...STANDAARD_NIEMAND, ...b.wand?.niemand },
      kleur: van == null ? 'lucht' : kleurVan(b, van, wie.profielen),
      van,
      naam: wie.profielen?.volgorde.find((x) => x.account === van)?.naam ?? null,
      eigen: zelf,
    },
    kleuren: Object.fromEntries((wie.profielen?.volgorde ?? []).map((x) => [x.id, kleurVan(b, x.account, wie.profielen)])),
    scherm: wie.scherm === true,
    maxFavorieten: MAX_FAVORIETEN,
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

/** Het thema en de kleur (besluit 181), elk uit de vaste lijst. */
export function leesThema(x: unknown): { ok: true; thema: Thema } | { ok: false; reden: string } {
  return typeof x === 'string' && (THEMAS as readonly string[]).includes(x) ? { ok: true, thema: x as Thema } : { ok: false, reden: `het thema is ${THEMAS.join(', ')}` };
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
 * `weergave`, `thema` en `kleur` (die gelden voor jou, op elk scherm), bij de
 * wand `niemand`, dat alleen de hoofdgebruiker of een beheerder verandert.
 */
export function pasToe(b: Bestand, body: unknown, wie: VoorkeurWie): { ok: true; bestand: Bestand } | { ok: false; status: number; reden: string } {
  const r = isObject(body) ? body : null;
  const plek = r?.['plek'];
  if (plek !== 'tel' && plek !== 'wand') return { ok: false, status: 400, reden: 'plek is tel of wand' };
  if (!['kaarten', 'favorieten', 'weergave', 'niemand', 'thema', 'kleur'].some((k) => r![k] !== undefined)) return { ok: false, status: 400, reden: 'geef kaarten, favorieten, weergave, thema, kleur of niemand' };
  if (plek === 'wand' && (r!['weergave'] !== undefined || r!['thema'] !== undefined || r!['kleur'] !== undefined)) return { ok: false, status: 400, reden: 'de weergave, het thema en de kleur zijn per account: plek tel' };
  if (plek === 'tel' && r!['niemand'] !== undefined) return { ok: false, status: 400, reden: 'als niemand kijkt hoort bij de wand: plek wand' };
  const { van } = wandVan(wie);
  if (plek === 'wand' && (van == null || r!['niemand'] !== undefined) && !wie.magWand) return { ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' };
  const kaarten = r!['kaarten'] === undefined ? null : leesKaarten(r!['kaarten'], plek);
  if (kaarten && !kaarten.ok) return { ok: false, status: 400, reden: kaarten.reden };
  const favorieten = r!['favorieten'] === undefined ? null : leesFavorieten(r!['favorieten']);
  if (favorieten && !favorieten.ok) return { ok: false, status: 400, reden: favorieten.reden };
  const nu = voorkeurenView(b, wie);
  if (plek === 'wand') {
    const niemand = r!['niemand'] === undefined ? null : leesNiemand(r!['niemand'], nu.wand.niemand);
    if (niemand && !niemand.ok) return { ok: false, status: 400, reden: niemand.reden };
    const indeling = {
      ...(kaarten ? { kaarten: kaarten.kaarten } : {}),
      ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
    };
    const wand = { ...b.wand, ...(van == null ? indeling : {}), ...(niemand ? { niemand: niemand.niemand } : {}) };
    const profiel = van == null ? null : (b.accounts[van] ?? {});
    const accounts = profiel == null || (!kaarten && !favorieten)
      ? b.accounts
      : {
          ...b.accounts,
          [van!]: {
            ...profiel,
            ...(kaarten ? { tel: metWandVolgorde(profiel.tel ?? STANDAARD_TEL, kaarten.kaarten) } : {}),
            ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
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
  const sleutel = wie.userId ?? '';
  const eigen = {
    ...b.accounts[sleutel],
    ...(kaarten ? { tel: kaarten.kaarten } : {}),
    ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
    ...(weergave ? { weergave: weergave.weergave } : {}),
    ...(thema ? { thema: thema.thema } : {}),
    ...(kleur ? { kleur: kleur.kleur } : {}),
  };
  return { ok: true, bestand: { ...b, accounts: { ...b.accounts, [sleutel]: eigen } } };
}

export class VoorkeurenStore {
  readonly #path: string;
  #current: Bestand = LEEG;
  #writing: Promise<void> = Promise.resolve();

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
