/*
 * Meldingen op de telefoon (besluit 183, schets Instellingen-Tel-Meldingen;
 * besluit 79). Wat bij de bel in de app staat, gaat voor een deel ook naar de
 * telefoon van een bewoner, via de app van Home Assistant:
 *
 *  - **rook en koolmonoxide** en **als de regeling hapert** (een apparaat dat
 *    al een uur niet reageert, een meter die niets levert): dringend, altijd,
 *    ook 's nachts; standaard aan;
 *  - **een batterij of filter bijna op** en **een nieuwe versie**: overdag;
 *    wat 's nachts opkomt, wacht tot het einde van de nachtrust; standaard uit.
 *
 * Komt iets vanzelf goed, dan vervangt de app de melding op de telefoon stil
 * door "weer goed" (hetzelfde label, zonder geluid). Wat langer dan een dag
 * speelt, gaat niet meer op de telefoon als je het aanzet: geen stapel oude
 * meldingen ineens.
 *
 * De telefoon van een bewoner: de app van Home Assistant op een telefoon
 * (een apparaat van `mobile_app`). Hangt die aan de persoon van zijn account,
 * dan is het zijn telefoon; anders kiest hij er een bij Jij. De melding gaat
 * naar `notify.mobile_app_…`, de enige notify-deur van de client.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { Lang } from './assistant.js';
import { inTaal, type Melding, type MeldingSoort } from './meldingen.js';

export const PUSH_FILE = 'push.json';

/** Wat een bewoner op zijn telefoon wil horen, en wanneer niet. */
export interface MeldingKeus {
  readonly rook: boolean;
  readonly regeling: boolean;
  readonly onderhoud: boolean;
  readonly versie: boolean;
  /** De nachtrust, als uu:mm: dan alleen wat dringend is. */
  readonly van: string;
  readonly tot: string;
  /** Het apparaat van de telefoon in Home Assistant, of null: die van je persoon. */
  readonly telefoon: string | null;
}
export const STANDAARD_MELDINGEN: MeldingKeus = { rook: true, regeling: true, onderhoud: false, versie: false, van: '23:00', tot: '07:00', telefoon: null };
export type MeldingGroep = 'rook' | 'regeling' | 'onderhoud' | 'versie';

/** Bij welke keus een melding hoort; null: alleen bij de bel. */
export function groepVan(soort: MeldingSoort): MeldingGroep | null {
  if (soort === 'rook') return 'rook';
  if (soort === 'stil' || soort === 'meter') return 'regeling';
  if (soort === 'batterij' || soort === 'filter') return 'onderhoud';
  if (soort === 'update') return 'versie';
  return null;
}
const dringend = (g: MeldingGroep) => g === 'rook' || g === 'regeling';

export interface Telefoon {
  /** Het apparaat in Home Assistant. */
  readonly id: string;
  readonly naam: string;
  /** De notify-dienst, zonder `notify.`: `mobile_app_pixel_8`. */
  readonly dienst: string;
  /** Het account van de persoon aan wie hij hangt, of null. */
  readonly account: string | null;
}

/** Zoals Home Assistant een naam tot een dienst maakt: kleine letters, de rest een liggend streepje. */
export function alsDienst(naam: string): string {
  return naam
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** De telefoons met de app van Home Assistant, en aan wiens persoon ze hangen. */
export function vindTelefoons(registers: { readonly devices: readonly HaDevice[]; readonly entities: readonly HaRegistryEntity[] }, states: ReadonlyMap<string, HaEntityState>): Telefoon[] {
  const mobiel = new Set(registers.entities.filter((e) => e.platform === 'mobile_app' && e.device_id && !e.disabled_by).map((e) => e.device_id as string));
  // Een persoon noemt zijn trackers; een tracker van de app hangt aan een apparaat.
  const trackerApparaat = new Map(registers.entities.filter((e) => e.entity_id.startsWith('device_tracker.') && e.device_id).map((e) => [e.entity_id, e.device_id as string]));
  const accountVan = new Map<string, string>();
  for (const s of states.values()) {
    if (!s.entity_id.startsWith('person.')) continue;
    const account = s.attributes['user_id'];
    const trackers = s.attributes['device_trackers'];
    if (typeof account !== 'string' || !account || !Array.isArray(trackers)) continue;
    for (const t of trackers) {
      const d = typeof t === 'string' ? trackerApparaat.get(t) : undefined;
      if (d && !accountVan.has(d)) accountVan.set(d, account);
    }
  }
  return registers.devices
    .filter((d) => mobiel.has(d.id) && (d.name ?? '').trim() !== '')
    .map((d) => ({ id: d.id, naam: d.name_by_user || d.name!, dienst: `mobile_app_${alsDienst(d.name!)}`, account: accountVan.get(d.id) ?? null }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

/** De telefoon van een account: gekozen, of die aan zijn persoon hangt. */
export function telefoonVan(account: string, keus: MeldingKeus, telefoons: readonly Telefoon[]): Telefoon | null {
  if (keus.telefoon) return telefoons.find((t) => t.id === keus.telefoon) ?? null;
  return telefoons.find((t) => t.account === account) ?? null;
}

const minuten = (uu: string) => {
  const [h, m] = uu.split(':').map(Number);
  return h! * 60 + m!;
};
/** Of het nu nachtrust is, in de tijd van het huis. */
export function inNachtrust(keus: MeldingKeus, nu: number, timeZone: string): boolean {
  const delen = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nu));
  const t = Number(delen.find((p) => p.type === 'hour')?.value) * 60 + Number(delen.find((p) => p.type === 'minute')?.value);
  const van = minuten(keus.van);
  const tot = minuten(keus.tot);
  return van <= tot ? t >= van && t < tot : t >= van || t < tot;
}

export interface Ontvanger {
  readonly account: string;
  readonly keus: MeldingKeus;
  readonly telefoon: Telefoon | null;
  /** De taal die hij bij Jij koos (besluit 185); weg is Nederlands. */
  readonly taal?: Lang;
}

/** Wat er staat als een melding geen eigen woorden heeft voor weer goed. */
const WEER_GOED: Readonly<Record<Lang, { titel: (t: string) => string; tekst: string }>> = {
  nl: { titel: (t) => `${t}: weer goed`, tekst: 'Het is vanzelf weer goed gekomen.' },
  en: { titel: (t) => `${t}: fine again`, tekst: 'It sorted itself out.' },
};

export interface Bericht {
  readonly dienst: string;
  readonly titel: string;
  readonly tekst: string;
  /** Hetzelfde label vervangt de melding op de telefoon. */
  readonly tag: string;
  readonly dringend: boolean;
  /** Stil: zonder geluid, zoals "weer goed". */
  readonly stil: boolean;
}

/** Wat al op een telefoon staat, per account en melding. */
export type Verstuurd = Readonly<Record<string, { readonly ms: number; readonly opgelost: boolean }>>;

/** Wat langer speelt dan dit, gaat niet meer op de telefoon. */
const TE_OUD_MS = 24 * 3_600_000;
/** Zo lang onthouden we wat er verstuurd is. */
const ONTHOUD_MS = 30 * 24 * 3_600_000;

/**
 * Wat er nu naar welke telefoon moet. Zuiver: de dienst stuurt, dit beslist.
 * `meldingen`: wat speelt en wat eerder was, zoals bij de bel.
 */
export function teSturen(meldingen: readonly Melding[], ontvangers: readonly Ontvanger[], verstuurd: Verstuurd, nu: number, timeZone: string): { berichten: Bericht[]; verstuurd: Verstuurd } {
  const uit: Record<string, { ms: number; opgelost: boolean }> = Object.fromEntries(Object.entries(verstuurd).filter(([, v]) => nu - v.ms < ONTHOUD_MS));
  const berichten: Bericht[] = [];
  for (const o of ontvangers) {
    if (!o.telefoon) continue;
    const nacht = inNachtrust(o.keus, nu, timeZone);
    const taal = o.taal ?? 'nl';
    for (const melding of meldingen) {
      const m = inTaal(melding, taal);
      const g = groepVan(m.soort);
      if (g == null || !o.keus[g]) continue;
      const sleutel = `${o.account}|${m.id}`;
      const was = uit[sleutel];
      const tag = `smart-climate-${m.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      if (m.opgelostMs == null) {
        if (was || nu - m.sindsMs > TE_OUD_MS) continue;
        // 's Nachts alleen wat dringend is; de rest komt na de nachtrust, als het dan nog speelt.
        if (nacht && !dringend(g)) continue;
        berichten.push({ dienst: o.telefoon.dienst, titel: m.titel, tekst: m.tekst, tag, dringend: dringend(g), stil: false });
        uit[sleutel] = { ms: nu, opgelost: false };
      } else if (was && !was.opgelost) {
        berichten.push({ dienst: o.telefoon.dienst, titel: m.klaar?.titel ?? WEER_GOED[taal].titel(m.titel), tekst: m.klaar?.tekst ?? WEER_GOED[taal].tekst, tag, dringend: false, stil: true });
        uit[sleutel] = { ms: nu, opgelost: true };
      }
    }
  }
  return { berichten, verstuurd: uit };
}

/**
 * Waar een tik op de melding naartoe gaat: het paneel van de add-on in de
 * zijbalk van Home Assistant, op `/<slug>` (zo registreert Home Assistant een
 * add-on met Ingress, ook voor wie geen beheerder is). Eerst stond hier
 * `/hassio/ingress/<slug>`, en dat gaf in de app een 404.
 */
export function paneelVan(slug: string | null | undefined): string | null {
  return slug && /^[a-z0-9_]+$/.test(slug) ? `/${slug}` : null;
}

/** Een bericht als de velden van `notify.mobile_app_…`; `pad` opent Smart Climate in de app. */
export function alsMelding(b: Bericht, pad: string | null): { title: string; message: string; data: Record<string, unknown> } {
  return {
    title: b.titel,
    message: b.tekst,
    data: {
      tag: b.tag,
      group: 'smart-climate',
      ...(pad ? { clickAction: pad, url: pad } : {}),
      ...(b.stil ? { alert_once: true, push: { 'interruption-level': 'passive' } } : b.dringend ? { priority: 'high', ttl: 0, push: { 'interruption-level': 'time-sensitive' } } : {}),
    },
  };
}

/** Wat er verstuurd is, in een eigen bestand naast de dataset. */
export class PushStore {
  readonly #path: string;
  #verstuurd: Verstuurd = {};

  constructor(logDir: string) {
    this.#path = join(logDir, PUSH_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { verstuurd?: unknown };
      this.#verstuurd = typeof raw?.verstuurd === 'object' && raw.verstuurd != null ? (raw.verstuurd as Verstuurd) : {};
    } catch {
      this.#verstuurd = {};
    }
  }

  get verstuurd(): Verstuurd {
    return this.#verstuurd;
  }

  async save(v: Verstuurd): Promise<void> {
    if (JSON.stringify(v) === JSON.stringify(this.#verstuurd)) return;
    this.#verstuurd = v;
    const tmp = `${this.#path}.nieuw`;
    await writeFile(tmp, `${JSON.stringify({ versie: 1, verstuurd: v })}\n`, 'utf-8');
    await rename(tmp, this.#path);
  }
}
