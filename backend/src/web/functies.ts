/**
 * Functies (besluit 109): camera's en de deurbel als instelling die de app
 * wegschrijft, in plaats van wat de code bij dit huis vanzelf koos.
 *
 * Tot nu toe toonde de app elke camera, met de stream die Reolink "sub" noemt,
 * en was een deurbel alleen een Reolink-melder (`visitor`). Dat klopte hier,
 * en nergens anders. Nu doet de dienst een voorstel uit wat Home Assistant
 * heeft, en legt de bewoner vast wat hij wil: welke camera's in de app staan,
 * met welk beeld, en welke melder de deurbel is, bij welke camera.
 *
 * Net als de indeling en de aansluiting: één eigen bestand naast de dataset,
 * nooit naar Home Assistant. Zonder bestand geldt het voorstel. Alleen wat Home
 * Assistant kent, komt erin; de rest weigert de controle.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import { CAMERA_ID, findCameras } from './camera.js';
import { weatherSources } from './weather.js';

export const FUNCTIES_FILE = 'functies.json';

/** Zo lang staat het beeld van de deurbel er, als niemand het sluit. */
export const BEL_SECONDEN = { min: 30, standaard: 120, max: 600 } as const;

export interface Functies {
  readonly versie: 1;
  readonly cameras: {
    readonly aan: boolean;
    /** De camera-entiteiten die de app toont, één per camera. */
    readonly lijst: readonly string[];
  };
  readonly deurbel: {
    readonly aan: boolean;
    /** De melder die aangaat of afgaat als er wordt aangebeld. */
    readonly melder: string | null;
    /** Het beeld dat dan verschijnt. */
    readonly camera: string | null;
    /** Het scherm aanzetten (kan alleen in Fully Kiosk Browser). */
    readonly schermAan: boolean;
    readonly seconden: number;
  };
  /**
   * Waar het weer vandaan komt (besluit 111): `buienradar`, een weerentiteit
   * (`weather.…`), of null voor geen weer. Weg in een ouder bestand: het voorstel.
   */
  readonly weer?: { readonly bron: string | null };
  /**
   * Licht en scènes bedienen in de app (besluit 111). Kan alleen aan als de
   * installatie het toestaat (`HEMS_LIGHTS`, besluit 97); dit zet het binnen
   * die grens aan of uit. Weg in een ouder bestand: aan.
   */
  readonly licht?: { readonly bedienen: boolean };
}

/** Een camera zoals Home Assistant hem heeft: één apparaat, soms met meer beelden. */
export interface CameraKeuze {
  readonly naam: string;
  readonly beelden: readonly { readonly id: string; readonly naam: string; readonly voorkeur: boolean }[];
}

/** Een melder die een deurbel kan zijn. */
export interface MelderKeuze {
  readonly id: string;
  readonly naam: string;
  /** De camera van hetzelfde apparaat, als die er is. */
  readonly camera: string | null;
  /** Hoe zeker het een deurbel is: de deurbel van een merk, of iets wat er zo heet. */
  readonly zeker: boolean;
}

export interface FunctiesGevonden {
  readonly cameras: readonly CameraKeuze[];
  readonly melders: readonly MelderKeuze[];
  /** De weerbronnen om uit te kiezen (besluit 111). Weg in een oudere vorm: geen. */
  readonly weerbronnen?: readonly { readonly id: string; readonly naam: string }[];
}

const BEELD: Readonly<Record<string, string>> = { sub: 'vloeiend', main: 'scherp', ext: 'breed', snapshots_sub: 'plaatjes vloeiend', snapshots_main: 'plaatjes scherp' };
const GEEN_BEELD = new Set(['buienradar']);
/** Een melder die naar een deurbel klinkt. */
const BEL_NAAM = /deurbel|doorbell|aanbel|bezoeker|visitor|\bding\b|\bbel\b|\bring\b/i;
/** Wat op een deurbel zit maar geen bel is. */
const GEEN_BEL = /beweging|motion|persoon|person|mens|human|dier|pet|voertuig|vehicle|pakket|package|gezicht|face/i;
/** De koppeling waar een tweede beeld van dezelfde camera vandaan komt. */
const KOPPELING: Readonly<Record<string, string>> = { synology_dsm: 'via de Synology', unifiprotect: 'via UniFi', frigate: 'via Frigate', generic: 'via een stream', onvif: 'via ONVIF' };
/** De sleutels en klassen waarmee merken een deurbel melden. */
const BEL_SLEUTEL = new Set(['visitor', 'doorbell', 'ding', 'button_press', 'doorbell_press']);

function friendly(states: ReadonlyMap<string, HaEntityState>, id: string): string {
  return String(states.get(id)?.attributes['friendly_name'] ?? id);
}

/** Wat er te kiezen is: de camera's met hun beelden, en de melders die een deurbel kunnen zijn. */
export function functiesGevonden(entities: readonly HaRegistryEntity[], devices: readonly HaDevice[], states: ReadonlyMap<string, HaEntityState>): FunctiesGevonden {
  const deviceName = new Map(devices.map((d) => [d.id, (d.name_by_user ?? d.name ?? '').trim()]));
  const voorkeur = new Set(findCameras(entities, devices, states).map((c) => c.entityId));
  // Eén camera per naam: dezelfde camera via een tweede koppeling (de Synology)
  // is een tweede beeld van die camera, geen tweede camera.
  const perCamera = new Map<string, { naam: string; beelden: { id: string; naam: string; voorkeur: boolean }[] }>();
  const camVanApparaat = new Map<string, string>();
  for (const e of entities) {
    if (!e.entity_id.startsWith('camera.') || e.disabled_by != null || GEEN_BEELD.has(e.platform ?? '') || !CAMERA_ID.test(e.entity_id)) continue;
    const naam = (e.device_id ? deviceName.get(e.device_id) : '') || friendly(states, e.entity_id);
    const sleutel = naam.toLowerCase().replace(/[^a-z0-9]+/g, '') || e.entity_id;
    if (e.device_id) camVanApparaat.set(e.device_id, sleutel);
    const groep = perCamera.get(sleutel) ?? { naam, beelden: [] };
    const beeld = BEELD[e.translation_key ?? ''] ?? KOPPELING[e.platform ?? ''] ?? friendly(states, e.entity_id);
    groep.beelden.push({ id: e.entity_id, naam: beeld, voorkeur: voorkeur.has(e.entity_id) });
    perCamera.set(sleutel, groep);
  }
  const cameras = [...perCamera.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

  const cameraVan = (deviceId: string | null | undefined) => {
    const sleutel = deviceId ? camVanApparaat.get(deviceId) : undefined;
    const groep = sleutel ? perCamera.get(sleutel) : undefined;
    return groep ? (groep.beelden.find((b) => b.voorkeur) ?? groep.beelden[0])?.id ?? null : null;
  };
  const melders: MelderKeuze[] = [];
  for (const e of entities) {
    const id = e.entity_id;
    if (e.disabled_by != null || !(id.startsWith('binary_sensor.') || id.startsWith('event.'))) continue;
    const klasse = e.device_class ?? e.original_device_class ?? '';
    const sleutel = e.translation_key ?? '';
    const naam = `${e.name ?? ''} ${e.original_name ?? ''} ${friendly(states, id)} ${id}`;
    const zeker = BEL_SLEUTEL.has(sleutel) || klasse === 'doorbell';
    // Op naam alleen wat verder niets is: een persoon of beweging op de deurbel
    // heet ook "deurbel", maar is geen bel.
    if (!zeker && (sleutel !== '' || klasse !== '' || !BEL_NAAM.test(naam) || GEEN_BEL.test(naam))) continue;
    melders.push({ id, naam: friendly(states, id), camera: cameraVan(e.device_id), zeker });
  }
  // De zekere eerst, en die met een camera.
  melders.sort((a, b) => Number(b.zeker) - Number(a.zeker) || Number(b.camera != null) - Number(a.camera != null) || a.naam.localeCompare(b.naam, 'nl'));
  return { cameras, melders, weerbronnen: weatherSources(entities, states) };
}

/** Het voorstel: elke camera met het lichtste beeld, en de deurbel als die er zeker is. */
export function functiesVoorstel(g: FunctiesGevonden): Functies {
  const lijst = g.cameras.map((c) => (c.beelden.find((b) => b.voorkeur) ?? c.beelden[0])!.id);
  const bel = g.melders.find((m) => m.zeker && m.camera != null);
  return {
    versie: 1,
    cameras: { aan: lijst.length > 0, lijst },
    deurbel: { aan: bel != null, melder: bel?.id ?? null, camera: bel?.camera ?? null, schermAan: true, seconden: BEL_SECONDEN.standaard },
    weer: { bron: g.weerbronnen?.[0]?.id ?? null },
    licht: { bedienen: true },
  };
}

/** Een ouder bestand aangevuld met het voorstel voor wat er toen nog niet in stond. */
export function volledig(f: Functies, g: FunctiesGevonden | null): Functies & { weer: { bron: string | null }; licht: { bedienen: boolean } } {
  return { ...f, weer: f.weer ?? { bron: g?.weerbronnen?.[0]?.id ?? null }, licht: f.licht ?? { bedienen: true } };
}

export type FunctiesUitkomst = { readonly ok: true; readonly functies: Functies } | { readonly ok: false; readonly reden: string };

/** Alleen wat Home Assistant kent, en alleen de velden die er horen. */
export function controleer(body: unknown, g: FunctiesGevonden): FunctiesUitkomst {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) return { ok: false, reden: 'verwacht een object' };
  const b = body as Record<string, unknown>;
  const cam = b['cameras'] as Record<string, unknown> | undefined;
  const bel = b['deurbel'] as Record<string, unknown> | undefined;
  if (typeof cam !== 'object' || cam == null || typeof bel !== 'object' || bel == null) return { ok: false, reden: 'cameras en deurbel ontbreken' };
  const beelden = new Set(g.cameras.flatMap((c) => c.beelden.map((x) => x.id)));
  const melders = new Set(g.melders.map((m) => m.id));
  if (typeof cam['aan'] !== 'boolean' || !Array.isArray(cam['lijst'])) return { ok: false, reden: 'cameras.aan en cameras.lijst horen er te staan' };
  const lijst = [...new Set(cam['lijst'].filter((x): x is string => typeof x === 'string'))];
  if (lijst.length !== cam['lijst'].length) return { ok: false, reden: 'een camera staat er dubbel of is geen tekst' };
  const onbekend = lijst.find((x) => !beelden.has(x));
  if (onbekend) return { ok: false, reden: `die camera kent Home Assistant niet: ${onbekend}` };
  if (typeof bel['aan'] !== 'boolean' || typeof bel['schermAan'] !== 'boolean') return { ok: false, reden: 'deurbel.aan en deurbel.schermAan horen er te staan' };
  const melder = bel['melder'] ?? null;
  const camera = bel['camera'] ?? null;
  if (melder !== null && (typeof melder !== 'string' || !melders.has(melder))) return { ok: false, reden: 'die melder kent Home Assistant niet als deurbel' };
  if (camera !== null && (typeof camera !== 'string' || !beelden.has(camera))) return { ok: false, reden: 'die camera kent Home Assistant niet' };
  if (bel['aan'] === true && (melder == null || camera == null)) return { ok: false, reden: 'een deurbel heeft een melder en een camera nodig' };
  const seconden = bel['seconden'];
  if (typeof seconden !== 'number' || !Number.isInteger(seconden) || seconden < BEL_SECONDEN.min || seconden > BEL_SECONDEN.max) {
    return { ok: false, reden: `deurbel.seconden is een heel getal van ${BEL_SECONDEN.min} tot ${BEL_SECONDEN.max}` };
  }
  // Weer en licht (besluit 111): weg is het voorstel.
  const weerIn = b['weer'];
  let bron: string | null = g.weerbronnen?.[0]?.id ?? null;
  if (weerIn !== undefined) {
    const w = (typeof weerIn === 'object' && weerIn != null ? weerIn : {}) as Record<string, unknown>;
    const v = w['bron'] ?? null;
    if (v !== null && (typeof v !== 'string' || !(g.weerbronnen ?? []).some((x) => x.id === v))) return { ok: false, reden: 'die weerbron kent Home Assistant niet' };
    bron = v as string | null;
  }
  const lichtIn = b['licht'];
  let bedienen = true;
  if (lichtIn !== undefined) {
    const l = (typeof lichtIn === 'object' && lichtIn != null ? lichtIn : {}) as Record<string, unknown>;
    if (typeof l['bedienen'] !== 'boolean') return { ok: false, reden: 'licht.bedienen is ja of nee' };
    bedienen = l['bedienen'];
  }
  return {
    ok: true,
    functies: {
      versie: 1,
      cameras: { aan: cam['aan'], lijst },
      deurbel: { aan: bel['aan'], melder: melder as string | null, camera: camera as string | null, schermAan: bel['schermAan'], seconden },
      weer: { bron },
      licht: { bedienen },
    },
  };
}

/** De camera's die de app nu toont. */
export function getoondeCameras(f: Functies): ReadonlySet<string> {
  return new Set(f.cameras.aan ? f.cameras.lijst : []);
}

/**
 * Is dit een keer aanbellen? Een melder gaat aan (`binary_sensor`), of een
 * gebeurtenis krijgt een nieuw tijdstip (`event`, zoals Ring en Nest).
 */
export function aangebeld(f: Functies, nieuw: HaEntityState, oud: HaEntityState | undefined): boolean {
  if (!f.deurbel.aan || f.deurbel.melder !== nieuw.entity_id || f.deurbel.camera == null) return false;
  const leeg = (s: string | undefined) => s == null || s === 'unavailable' || s === 'unknown' || s === '';
  if (nieuw.entity_id.startsWith('binary_sensor.')) return nieuw.state === 'on' && oud?.state !== 'on';
  return !leeg(nieuw.state) && !leeg(oud?.state) && nieuw.state !== oud?.state;
}

export class FunctiesStore {
  readonly #path: string;
  #current: Functies | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(logDir: string) {
    this.#path = join(logDir, FUNCTIES_FILE);
  }

  /** Leest het bestand; wat niet meer klopt, valt terug op het voorstel (null). */
  async load(): Promise<Functies | null> {
    try {
      const raw = JSON.parse(await readFile(this.#path, 'utf-8')) as { versie?: unknown };
      this.#current = raw?.versie === 1 ? (raw as Functies) : null;
    } catch {
      this.#current = null;
    }
    return this.#current;
  }

  get current(): Functies | null {
    return this.#current;
  }

  async save(f: Functies): Promise<void> {
    this.#current = f;
    const text = `${JSON.stringify(f, null, 2)}\n`;
    const tmp = `${this.#path}.nieuw`;
    // Eerst naast het bestand, dan omwisselen; na elkaar, nooit door elkaar.
    this.#writing = this.#writing.catch(() => {}).then(async () => {
      await writeFile(tmp, text, 'utf-8');
      await rename(tmp, this.#path);
    });
    await this.#writing;
  }
}
