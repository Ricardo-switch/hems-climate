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
import { CAMERA_ID, GEEN_BEELD, findCameras } from './camera.js';
import { DREMPEL_KEUZES, STANDAARD_DREMPELS, type Drempels } from './house.js';
import { OPEN_METEO, OPEN_METEO_NAAM } from './open-meteo.js';
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
   * (`weather.…`), `open-meteo` (besluit 127), of null voor geen weer. Weg in
   * een ouder bestand: het voorstel. `uren`: de verwachting per uur van
   * Open-Meteo bewaren voor het thermisch model; weg is aan.
   */
  readonly weer?: { readonly bron: string | null; readonly uren?: boolean };
  /**
   * Licht en scènes bedienen in de app (besluit 111). Kan alleen aan als de
   * installatie het toestaat (`HEMS_LIGHTS`, besluit 97); dit zet het binnen
   * die grens aan of uit. Weg in een ouder bestand: aan.
   */
  readonly licht?: { readonly bedienen: boolean };
  /** Schermen bedienen in de app (besluit 121); weg is aan. */
  readonly schermen?: { readonly bedienen: boolean };
  /**
   * Praten met je huis (besluit 148): de AI-taak van Home Assistant die het
   * vaste antwoord in eigen woorden zegt, of null (uit, het voorstel). En of de
   * assistent licht, scènes en schermen mag bedienen met een zin, binnen wat
   * licht en schermen bedienen toestaan; weg is aan.
   */
  readonly praten?: {
    readonly taalmodel: string | null;
    readonly bedienen: boolean;
    /**
     * De spraakassistent van Home Assistant voor de microfoon en het wekwoord
     * (besluit 150), of null: die Home Assistant zelf voorop heeft. Weg: null.
     */
    readonly spraak?: string | null;
  };
  /**
   * Wanneer een batterij of een airco-filter een melding geeft (besluit 149):
   * onder dit percentage, of null voor nooit. Weg is 10%, zoals het was.
   */
  readonly meldingen?: Drempels;
}

/** Een camera zoals Home Assistant hem heeft: één apparaat, soms met meer beelden. */
export interface CameraKeuze {
  readonly naam: string;
  readonly beelden: readonly { readonly id: string; readonly naam: string; readonly voorkeur: boolean }[];
  /**
   * De bewegingsmelders van hetzelfde apparaat (25 oktober 2026): gewone
   * beweging, of wat de camera herkent (een persoon, een voertuig, een dier).
   * Weg in een oudere vorm: geen.
   */
  readonly melders?: readonly CameraMelder[];
}

/** Wat een melder op een camera ziet: beweging, of wat hij herkent. */
export type BewegingSoort = 'beweging' | 'persoon' | 'voertuig' | 'dier';
export interface CameraMelder {
  readonly id: string;
  readonly soort: BewegingSoort;
}
/** De klassen van een melder die beweging ziet. */
const BEWEGING_KLASSE = new Set(['motion', 'occupancy', 'presence', 'moving']);
/**
 * Wat een melder herkent, uit zijn sleutel, id of naam: Reolink heet ze
 * person, vehicle, pet en animal (hier "persoon", "voertuig", "huisdier",
 * "dier"); de rest is gewone beweging.
 */
export function bewegingSoort(tekst: string): BewegingSoort {
  if (/person|persoon|mens|human|people|face|gezicht/i.test(tekst)) return 'persoon';
  if (/vehicle|voertuig|(?<![a-z])auto(?![a-z])|car(?![a-z])/i.test(tekst)) return 'voertuig';
  if (/(?<![a-z])pet(?![a-z])|dier|animal|dog|cat(?![a-z])|hond|kat(?![a-z])/i.test(tekst)) return 'dier';
  return 'beweging';
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
  /** De AI-taken in Home Assistant (besluit 148), om een taalmodel te kiezen. */
  readonly taalmodellen?: readonly { readonly id: string; readonly naam: string }[];
  /** De spraakassistenten in Home Assistant (besluit 150). */
  readonly spraakassistenten?: readonly SpraakKeuze[];
}

/** Een spraakassistent uit Home Assistant (besluit 150): met welk wekwoord en welke spraak naar tekst. */
export interface SpraakKeuze {
  readonly id: string;
  readonly naam: string;
  /** Het wekwoord, zoals openWakeWord het noemt ("he_huis"), of null. */
  readonly wekwoord: string | null;
  /** Of hij spraak naar tekst heeft. */
  readonly spraakNaarTekst: boolean;
  readonly taal: string | null;
  /** Of Home Assistant hem voorop heeft. */
  readonly voorkeur: boolean;
}

/** De spraakassistenten uit `assist_pipeline/pipeline/list`, zoals Functies ze toont. */
export function spraakKeuzes(lijst: unknown): SpraakKeuze[] {
  const r = (typeof lijst === 'object' && lijst != null ? lijst : {}) as { pipelines?: unknown; preferred_pipeline?: unknown };
  const voorkeur = typeof r.preferred_pipeline === 'string' ? r.preferred_pipeline : null;
  return (Array.isArray(r.pipelines) ? r.pipelines : [])
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p != null && typeof (p as Record<string, unknown>)['id'] === 'string')
    .map((p) => ({
      id: String(p['id']),
      naam: typeof p['name'] === 'string' ? p['name'] : String(p['id']),
      wekwoord: typeof p['wake_word_id'] === 'string' && p['wake_word_entity'] ? p['wake_word_id'] : null,
      spraakNaarTekst: typeof p['stt_engine'] === 'string' && p['stt_engine'] !== '',
      taal: typeof p['stt_language'] === 'string' ? p['stt_language'] : typeof p['language'] === 'string' ? p['language'] : null,
      voorkeur: p['id'] === voorkeur,
    }));
}

const BEELD: Readonly<Record<string, string>> = { sub: 'vloeiend', main: 'scherp', ext: 'breed', snapshots_sub: 'plaatjes vloeiend', snapshots_main: 'plaatjes scherp' };
/** Een melder die naar een deurbel klinkt. */
const BEL_NAAM = /deurbel|doorbell|aanbel|bezoeker|visitor|(?<![a-z])(?:ding|bel|ring)(?![a-z])/i;
/**
 * Wat op een deurbel zit maar geen bel is. Een liggend streepje telt als grens,
 * ook hierboven: entiteiten heten deurbel_mens en voordeur_bel.
 */
const GEEN_BEL = /beweging|motion|persoon|person|(?<![a-z])mens|human|dier|(?<![a-z])pet(?![a-z])|voertuig|vehicle|pakket|package|gezicht|face/i;
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
  const eigenBeeld = new Set<string>();
  const via = new Set<string>();
  for (const e of entities) {
    if (!e.entity_id.startsWith('camera.') || e.disabled_by != null || GEEN_BEELD.has(e.platform ?? '') || !CAMERA_ID.test(e.entity_id)) continue;
    const naam = (e.device_id ? deviceName.get(e.device_id) : '') || friendly(states, e.entity_id);
    const sleutel = naam.toLowerCase().replace(/[^a-z0-9]+/g, '') || e.entity_id;
    if (e.device_id) camVanApparaat.set(e.device_id, sleutel);
    const groep = perCamera.get(sleutel) ?? { naam, beelden: [] };
    const beeld = BEELD[e.translation_key ?? ''] ?? KOPPELING[e.platform ?? ''] ?? friendly(states, e.entity_id);
    groep.beelden.push({ id: e.entity_id, naam: beeld, voorkeur: voorkeur.has(e.entity_id) });
    if (BEELD[e.translation_key ?? '']) eigenBeeld.add(sleutel);
    else via.add(e.entity_id);
    perCamera.set(sleutel, groep);
  }
  /*
   * Heeft een camera eigen beelden van zijn merk (vloeiend, scherp), dan geen
   * beeld via een tweede koppeling zoals de Synology (besluit 130): dat gaf
   * hier geen beeld, en het is dezelfde camera.
   */
  for (const [sleutel, groep] of perCamera) {
    if (eigenBeeld.has(sleutel)) groep.beelden = groep.beelden.filter((b) => !via.has(b.id));
  }
  // De bewegingsmelders bij hun camera, op hetzelfde apparaat (25 oktober 2026).
  const meldersVan = new Map<string, CameraMelder[]>();
  for (const e of entities) {
    // De klasse uit het register, en anders uit de toestand: het register noemt hem niet altijd.
    const klasse = e.device_class ?? e.original_device_class ?? String(states.get(e.entity_id)?.attributes['device_class'] ?? '');
    if (e.disabled_by != null || !e.entity_id.startsWith('binary_sensor.') || !BEWEGING_KLASSE.has(klasse) || !e.device_id) continue;
    const sleutel = camVanApparaat.get(e.device_id);
    if (!sleutel) continue;
    meldersVan.set(sleutel, [...(meldersVan.get(sleutel) ?? []), { id: e.entity_id, soort: bewegingSoort(`${e.translation_key ?? ''} ${e.entity_id} ${e.original_name ?? ''}`) }]);
  }
  const cameras = [...perCamera.entries()].map(([sleutel, g]) => ({ ...g, melders: meldersVan.get(sleutel) ?? [] })).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

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
  // Open-Meteo kan altijd (besluit 127): dan heeft elk huis weer, ook zonder Home Assistant.
  // De AI-taken (besluit 148): wat de bewoner in Home Assistant als taalmodel heeft staan.
  const taalmodellen = [...states.keys()]
    .filter((id) => /^ai_task\.[a-z0-9_]+$/.test(id) && states.get(id)?.state !== 'unavailable')
    .map((id) => ({ id, naam: friendly(states, id) }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  return { cameras, melders, weerbronnen: [...weatherSources(entities, states), { id: OPEN_METEO, naam: OPEN_METEO_NAAM }], taalmodellen };
}

/** Het voorstel: elke camera met het lichtste beeld, en de deurbel als die er zeker is. */
export function functiesVoorstel(g: FunctiesGevonden): Functies {
  const lijst = g.cameras.map((c) => (c.beelden.find((b) => b.voorkeur) ?? c.beelden[0])!.id);
  const bel = g.melders.find((m) => m.zeker && m.camera != null);
  return {
    versie: 1,
    cameras: { aan: lijst.length > 0, lijst },
    deurbel: { aan: bel != null, melder: bel?.id ?? null, camera: bel?.camera ?? null, schermAan: true, seconden: BEL_SECONDEN.standaard },
    weer: { bron: g.weerbronnen?.[0]?.id ?? null, uren: true },
    licht: { bedienen: true },
    schermen: { bedienen: true },
    // Het taalmodel staat standaard uit (besluit 148): het vaste antwoord werkt altijd.
    praten: { taalmodel: null, bedienen: true, spraak: null },
    meldingen: STANDAARD_DREMPELS,
  };
}

/** Een ouder bestand aangevuld met het voorstel voor wat er toen nog niet in stond. */
export function volledig(
  f: Functies,
  g: FunctiesGevonden | null,
): Functies & { weer: { bron: string | null; uren: boolean }; licht: { bedienen: boolean }; schermen: { bedienen: boolean }; praten: { taalmodel: string | null; bedienen: boolean; spraak: string | null }; meldingen: Drempels } {
  const weer = f.weer ?? { bron: g?.weerbronnen?.[0]?.id ?? null };
  return {
    ...f,
    weer: { bron: weer.bron, uren: weer.uren ?? true },
    licht: f.licht ?? { bedienen: true },
    schermen: f.schermen ?? { bedienen: true },
    praten: { taalmodel: f.praten?.taalmodel ?? null, bedienen: f.praten?.bedienen ?? true, spraak: f.praten?.spraak ?? null },
    meldingen: f.meldingen ?? STANDAARD_DREMPELS,
  };
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
  let uren = true;
  if (weerIn !== undefined) {
    const w = (typeof weerIn === 'object' && weerIn != null ? weerIn : {}) as Record<string, unknown>;
    const v = w['bron'] ?? null;
    if (v !== null && (typeof v !== 'string' || !(g.weerbronnen ?? []).some((x) => x.id === v))) return { ok: false, reden: 'die weerbron kent Home Assistant niet' };
    bron = v as string | null;
    if (w['uren'] !== undefined && typeof w['uren'] !== 'boolean') return { ok: false, reden: 'weer.uren is ja of nee' };
    uren = w['uren'] !== false;
  }
  const lichtIn = b['licht'];
  let bedienen = true;
  if (lichtIn !== undefined) {
    const l = (typeof lichtIn === 'object' && lichtIn != null ? lichtIn : {}) as Record<string, unknown>;
    if (typeof l['bedienen'] !== 'boolean') return { ok: false, reden: 'licht.bedienen is ja of nee' };
    bedienen = l['bedienen'];
  }
  const schermIn = b['schermen'];
  let schermen = true;
  if (schermIn !== undefined) {
    const sc = (typeof schermIn === 'object' && schermIn != null ? schermIn : {}) as Record<string, unknown>;
    if (typeof sc['bedienen'] !== 'boolean') return { ok: false, reden: 'schermen.bedienen is ja of nee' };
    schermen = sc['bedienen'];
  }
  // Praten met je huis (besluit 148): alleen een AI-taak die Home Assistant kent.
  const pratenIn = b['praten'];
  let praten = { taalmodel: null as string | null, bedienen: true, spraak: null as string | null };
  if (pratenIn !== undefined) {
    const pr = (typeof pratenIn === 'object' && pratenIn != null ? pratenIn : {}) as Record<string, unknown>;
    const model = pr['taalmodel'] ?? null;
    if (model !== null && (typeof model !== 'string' || !(g.taalmodellen ?? []).some((x) => x.id === model))) return { ok: false, reden: 'die AI-taak kent Home Assistant niet' };
    if (typeof pr['bedienen'] !== 'boolean') return { ok: false, reden: 'praten.bedienen is ja of nee' };
    // De spraakassistent (besluit 150): alleen een die Home Assistant kent.
    const spraak = pr['spraak'] ?? null;
    if (spraak !== null && (typeof spraak !== 'string' || !(g.spraakassistenten ?? []).some((x) => x.id === spraak))) return { ok: false, reden: 'die spraakassistent kent Home Assistant niet' };
    praten = { taalmodel: model as string | null, bedienen: pr['bedienen'], spraak: spraak as string | null };
  }
  // Wanneer een batterij of filter een melding geeft (besluit 149): een van de keuzes, of nooit.
  const meldingenIn = b['meldingen'];
  let meldingen: Drempels = STANDAARD_DREMPELS;
  if (meldingenIn !== undefined) {
    const m = (typeof meldingenIn === 'object' && meldingenIn != null ? meldingenIn : {}) as Record<string, unknown>;
    const keuze = (v: unknown) => v === null || (DREMPEL_KEUZES as readonly unknown[]).includes(v);
    if (!keuze(m['batterij']) || !keuze(m['filter'])) return { ok: false, reden: `meldingen: onder ${DREMPEL_KEUZES.join(', ')}%, of nooit` };
    meldingen = { batterij: m['batterij'] as number | null, filter: m['filter'] as number | null };
  }
  return {
    ok: true,
    functies: {
      versie: 1,
      cameras: { aan: cam['aan'], lijst },
      deurbel: { aan: bel['aan'], melder: melder as string | null, camera: camera as string | null, schermAan: bel['schermAan'], seconden },
      weer: { bron, uren },
      licht: { bedienen },
      schermen: { bedienen: schermen },
      praten,
      meldingen,
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
