/*
 * Thuis naar eigen smaak (besluit 162, schetsen Thuis-Tel-Eigen en
 * Wand-Thuis-Eigen).
 *
 * Op de telefoon kiest ieder account zelf welke kaarten Thuis heeft, in welke
 * volgorde, en welke scènes en lampen in Favorieten staan. De wand is van
 * iedereen: één indeling voor het hele huis, die alleen de hoofdgebruiker of
 * een beheerder verandert. De wand heeft vier vakken, want hij schuift nooit;
 * Vandaag vraagt er twee. Straks staat niet in de lijst van de wand: dat
 * schuift er vanzelf bovenin bij als het huis op zon wacht.
 *
 * De tweede stap (besluit 164, schetsen Wand-Nacht en Thuis-Tel-Eigen
 * #weergave): per account eenvoudig of uitgebreid, grotere letters en minder
 * beweging; en voor de wand wat hij doet als niemand kijkt: de nachtstand van
 * bedtijd tot de ochtend, rust overdag na een paar minuten, en welke
 * bewegingsmelder hem wekt. Dat laatste verandert alleen wie de wand mag
 * aanpassen.
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
export const KAARTEN = ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag', 'morgen'] as const;
export type KaartId = (typeof KAARTEN)[number];

/** Hoeveel vakken een kaart op de wand vraagt. De kamers staan daar in het huis, Straks komt vanzelf. */
export const WAND_VAKKEN: Readonly<Partial<Record<KaartId, number>>> = { favorieten: 1, vandaag: 2, apparaat: 1, gevoel: 1, morgen: 1 };
export const WAND_RUIMTE = 4;
export const MAX_FAVORIETEN = 4;

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

/** De wand als niemand kijkt (besluit 164, schets Wand-Nacht). */
export interface Niemand {
  /** De nachtstand: de klok en een gedimd huis, zonder getallen. */
  readonly nacht: boolean;
  /** Van bedtijd tot de ochtend, als uu:mm; ook als iemand het huis op Nacht zet. */
  readonly van: string;
  readonly tot: string;
  /** Rust overdag: de klok, wat het huis doet en het weer. */
  readonly rustMin: RustMinuten;
  /** De bewegingsmelder die de wand wekt, of null. */
  readonly melder: string | null;
}
export const STANDAARD_NIEMAND: Niemand = { nacht: true, van: '23:00', tot: '07:00', rustMin: 5, melder: null };

export interface Favoriet {
  readonly soort: 'lamp' | 'scene';
  /** Een lamp zoals het huis hem noemt, of een `scene.` uit Home Assistant. */
  readonly id: string;
}

interface Eigen {
  readonly tel?: readonly KaartId[];
  readonly favorieten?: readonly Favoriet[];
  readonly weergave?: Weergave;
}

interface Bestand {
  readonly versie: 1;
  /** Per account van Home Assistant; '' is zonder inlog (de NAS op het thuisnetwerk). */
  readonly accounts: Readonly<Record<string, Eigen>>;
  readonly wand?: { readonly kaarten?: readonly KaartId[]; readonly favorieten?: readonly Favoriet[]; readonly niemand?: Niemand };
}

const LEEG: Bestand = { versie: 1, accounts: {} };

export interface VoorkeurenView {
  readonly tel: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly weergave: Weergave };
  readonly wand: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly magAanpassen: boolean; readonly niemand: Niemand };
  readonly ruimte: number;
  readonly vakken: Readonly<Partial<Record<KaartId, number>>>;
  readonly maxFavorieten: number;
}

export type VoorkeurenResult = { readonly ok: true; readonly view: VoorkeurenView } | { readonly ok: false; readonly status: number; readonly reden: string };

/** Wie er kijkt: zijn account, en of hij de wand mag aanpassen. */
export interface VoorkeurWie {
  readonly userId: string | null;
  readonly magWand: boolean;
}

/** Een lijst kaarten, of de reden waarom niet. Op de wand: zonder kamers en Straks, en binnen de vier vakken. */
export function leesKaarten(x: unknown, plek: 'tel' | 'wand'): { ok: true; kaarten: KaartId[] } | { ok: false; reden: string } {
  if (!Array.isArray(x) || x.length > KAARTEN.length) return { ok: false, reden: 'kaarten is een lijst' };
  const kaarten: KaartId[] = [];
  for (const k of x) {
    if (typeof k !== 'string' || !(KAARTEN as readonly string[]).includes(k)) return { ok: false, reden: `die kaart bestaat niet: ${String(k)}` };
    if (kaarten.includes(k as KaartId)) return { ok: false, reden: `${k} staat er twee keer in` };
    kaarten.push(k as KaartId);
  }
  if (plek === 'wand') {
    if (kaarten.some((k) => WAND_VAKKEN[k] == null)) return { ok: false, reden: 'de kamers en Straks staan op de wand al vanzelf' };
    const vakken = kaarten.reduce((n, k) => n + (WAND_VAKKEN[k] ?? 0), 0);
    if (vakken > WAND_RUIMTE) return { ok: false, reden: `de wand heeft ${WAND_RUIMTE} vakken; dit zijn er ${vakken}` };
  }
  return { ok: true, kaarten };
}

/** Hooguit vier favorieten, elk een lamp of een scène, en geen dubbele. */
export function leesFavorieten(x: unknown): { ok: true; favorieten: Favoriet[] } | { ok: false; reden: string } {
  if (!Array.isArray(x)) return { ok: false, reden: 'favorieten is een lijst' };
  if (x.length > MAX_FAVORIETEN) return { ok: false, reden: `hooguit ${MAX_FAVORIETEN} favorieten` };
  const favorieten: Favoriet[] = [];
  for (const f of x) {
    const r = typeof f === 'object' && f != null && !Array.isArray(f) ? (f as Record<string, unknown>) : {};
    const soort = r['soort'];
    const id = r['id'];
    if (soort !== 'lamp' && soort !== 'scene') return { ok: false, reden: 'een favoriet is een lamp of een scène' };
    if (typeof id !== 'string' || id.length > 160 || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)) return { ok: false, reden: 'een favoriet heeft een id uit Home Assistant' };
    if (soort === 'scene' && !id.startsWith('scene.')) return { ok: false, reden: 'een scène begint met scene.' };
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
    if (k === 'nacht') {
      if (typeof w !== 'boolean') return { ok: false, reden: 'de nachtstand is aan of uit' };
    } else if (k === 'van' || k === 'tot') {
      if (typeof w !== 'string' || !TIJD.test(w)) return { ok: false, reden: `${k} is een tijd als 23:00` };
    } else if (k === 'rustMin') {
      if (!(RUST_MINUTEN as readonly unknown[]).includes(w)) return { ok: false, reden: `rust overdag is ${RUST_MINUTEN.join(', ')} minuten` };
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
  return {
    tel: { kaarten: eigen.tel ?? STANDAARD_TEL, favorieten: eigen.favorieten ?? [], weergave: { ...STANDAARD_WEERGAVE, ...eigen.weergave } },
    wand: { kaarten: b.wand?.kaarten ?? STANDAARD_WAND, favorieten: b.wand?.favorieten ?? [], magAanpassen: wie.magWand, niemand: { ...STANDAARD_NIEMAND, ...b.wand?.niemand } },
    ruimte: WAND_RUIMTE,
    vakken: WAND_VAKKEN,
    maxFavorieten: MAX_FAVORIETEN,
  };
}

/**
 * Wat er verandert: `{ plek: 'tel' | 'wand', kaarten?, favorieten? }`. Op de
 * telefoon je eigen keuze; de wand alleen als je hem mag aanpassen. Bij de
 * telefoon ook `weergave` (die geldt voor jou, op elk scherm), bij de wand
 * `niemand`.
 */
export function pasToe(b: Bestand, body: unknown, wie: VoorkeurWie): { ok: true; bestand: Bestand } | { ok: false; status: number; reden: string } {
  const r = isObject(body) ? body : null;
  const plek = r?.['plek'];
  if (plek !== 'tel' && plek !== 'wand') return { ok: false, status: 400, reden: 'plek is tel of wand' };
  if (!['kaarten', 'favorieten', 'weergave', 'niemand'].some((k) => r![k] !== undefined)) return { ok: false, status: 400, reden: 'geef kaarten, favorieten, weergave of niemand' };
  if (plek === 'wand' && r!['weergave'] !== undefined) return { ok: false, status: 400, reden: 'de weergave is per account: plek tel' };
  if (plek === 'tel' && r!['niemand'] !== undefined) return { ok: false, status: 400, reden: 'als niemand kijkt hoort bij de wand: plek wand' };
  if (plek === 'wand' && !wie.magWand) return { ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' };
  const kaarten = r!['kaarten'] === undefined ? null : leesKaarten(r!['kaarten'], plek);
  if (kaarten && !kaarten.ok) return { ok: false, status: 400, reden: kaarten.reden };
  const favorieten = r!['favorieten'] === undefined ? null : leesFavorieten(r!['favorieten']);
  if (favorieten && !favorieten.ok) return { ok: false, status: 400, reden: favorieten.reden };
  const nu = voorkeurenView(b, wie);
  if (plek === 'wand') {
    const niemand = r!['niemand'] === undefined ? null : leesNiemand(r!['niemand'], nu.wand.niemand);
    if (niemand && !niemand.ok) return { ok: false, status: 400, reden: niemand.reden };
    const wand = {
      ...b.wand,
      ...(kaarten ? { kaarten: kaarten.kaarten } : {}),
      ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
      ...(niemand ? { niemand: niemand.niemand } : {}),
    };
    return { ok: true, bestand: { ...b, wand } };
  }
  const weergave = r!['weergave'] === undefined ? null : leesWeergave(r!['weergave'], nu.tel.weergave);
  if (weergave && !weergave.ok) return { ok: false, status: 400, reden: weergave.reden };
  const sleutel = wie.userId ?? '';
  const eigen = {
    ...b.accounts[sleutel],
    ...(kaarten ? { tel: kaarten.kaarten } : {}),
    ...(favorieten ? { favorieten: favorieten.favorieten } : {}),
    ...(weergave ? { weergave: weergave.weergave } : {}),
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
