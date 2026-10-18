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

export interface Favoriet {
  readonly soort: 'lamp' | 'scene';
  /** Een lamp zoals het huis hem noemt, of een `scene.` uit Home Assistant. */
  readonly id: string;
}

interface Eigen {
  readonly tel?: readonly KaartId[];
  readonly favorieten?: readonly Favoriet[];
}

interface Bestand {
  readonly versie: 1;
  /** Per account van Home Assistant; '' is zonder inlog (de NAS op het thuisnetwerk). */
  readonly accounts: Readonly<Record<string, Eigen>>;
  readonly wand?: { readonly kaarten?: readonly KaartId[]; readonly favorieten?: readonly Favoriet[] };
}

const LEEG: Bestand = { versie: 1, accounts: {} };

export interface VoorkeurenView {
  readonly tel: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[] };
  readonly wand: { readonly kaarten: readonly KaartId[]; readonly favorieten: readonly Favoriet[]; readonly magAanpassen: boolean };
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

export function voorkeurenView(b: Bestand, wie: VoorkeurWie): VoorkeurenView {
  const eigen = b.accounts[wie.userId ?? ''] ?? {};
  return {
    tel: { kaarten: eigen.tel ?? STANDAARD_TEL, favorieten: eigen.favorieten ?? [] },
    wand: { kaarten: b.wand?.kaarten ?? STANDAARD_WAND, favorieten: b.wand?.favorieten ?? [], magAanpassen: wie.magWand },
    ruimte: WAND_RUIMTE,
    vakken: WAND_VAKKEN,
    maxFavorieten: MAX_FAVORIETEN,
  };
}

/**
 * Wat er verandert: `{ plek: 'tel' | 'wand', kaarten?, favorieten? }`. Op de
 * telefoon je eigen keuze; de wand alleen als je hem mag aanpassen.
 */
export function pasToe(b: Bestand, body: unknown, wie: VoorkeurWie): { ok: true; bestand: Bestand } | { ok: false; status: number; reden: string } {
  const r = typeof body === 'object' && body != null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const plek = r?.['plek'];
  if (plek !== 'tel' && plek !== 'wand') return { ok: false, status: 400, reden: 'plek is tel of wand' };
  if (r!['kaarten'] === undefined && r!['favorieten'] === undefined) return { ok: false, status: 400, reden: 'geef kaarten of favorieten' };
  if (plek === 'wand' && !wie.magWand) return { ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' };
  const kaarten = r!['kaarten'] === undefined ? null : leesKaarten(r!['kaarten'], plek);
  if (kaarten && !kaarten.ok) return { ok: false, status: 400, reden: kaarten.reden };
  const favorieten = r!['favorieten'] === undefined ? null : leesFavorieten(r!['favorieten']);
  if (favorieten && !favorieten.ok) return { ok: false, status: 400, reden: favorieten.reden };
  if (plek === 'wand') {
    const wand = { ...b.wand, ...(kaarten ? { kaarten: kaarten.kaarten } : {}), ...(favorieten ? { favorieten: favorieten.favorieten } : {}) };
    return { ok: true, bestand: { ...b, wand } };
  }
  const sleutel = wie.userId ?? '';
  const eigen = { ...b.accounts[sleutel], ...(kaarten ? { tel: kaarten.kaarten } : {}), ...(favorieten ? { favorieten: favorieten.favorieten } : {}) };
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
