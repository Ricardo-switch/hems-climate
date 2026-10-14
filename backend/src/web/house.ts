/**
 * Het huis als navigatie (ONTWERP §4, besluiten 94 en 95): etages, kamers met
 * hun zones, en de apparaten erin, met hun stand in woorden.
 *
 * Een stuk van het bewonerscontract (76): de proefomgeving toont dit en rekent
 * zelf niets uit. Zuiver: de registers en toestanden van Home Assistant en de
 * indeling erin, het huis eruit.
 *
 * Er is altijd een indeling. Heeft de bewoner er een vastgelegd (96), dan is het
 * die; anders een voorstel uit Home Assistant (`proposeLayout`). Zo is er één weg
 * door de code, en is het voorstel precies wat de bewoner met één tik vastlegt.
 * Een apparaat zonder eigen plek staat in de kamer die uit zijn gebied in Home
 * Assistant kwam; heeft het geen gebied, of hoort dat gebied bij geen kamer, dan
 * staat het bij "nog in te delen".
 *
 * Wat erin komt: lampen, zonwering, de klimaatapparaten uit de configuratie, en
 * meters: sensoren die in een kamer temperatuur en luchtvochtigheid meten.
 * Groepen van lampen niet, want die zouden lampen dubbel tellen; uitgezette en
 * verborgen entiteiten ook niet. Behalve een groep waarvan de lampen uitgezet of
 * verborgen zijn: die is zelf de lamp (een armatuur, zie `collect`).
 */

import { findCameras } from './camera.js';
import type { HaEntityState } from '../adapters/homeassistant/client.js';
import { defaultSceneColors, whiteScene } from './scene-colors.js';
import type { HaArea, HaDevice, HaFloor, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { SiteConfig } from '../core/model.js';
import { roomStatus, type DecisionView, type RoomKind } from './assistant.js';
import {
  OUTSIDE_FLOOR,
  carryOver,
  floorName,
  floorOrder,
  type FloorId,
  type Layout,
  type LayoutDevice,
  type LayoutKnown,
  type LayoutOutside,
  type LayoutRoom,
  type RoomType,
} from './layout.js';

export interface HouseRegisters {
  readonly floors: readonly HaFloor[];
  readonly areas: readonly HaArea[];
  readonly devices: readonly HaDevice[];
  readonly entities: readonly HaRegistryEntity[];
}

/** `apparaat`: een uitstelbaar apparaat (besluit 98), zoals de droger; `camera`: om te bekijken (besluit 106). */
export type DeviceKind = 'klimaat' | 'screen' | 'licht' | 'meter' | 'apparaat' | 'camera';

/** Wat een klimaatapparaat of meter meet, uit Home Assistant. */
export interface HouseReading {
  readonly temperatuurC: number | null;
  readonly vochtPct: number | null;
}

/** Wat een klimaatapparaat kan en doet: de knoppen volgen wat het kan. */
export interface HouseClimate {
  readonly kanKoelen: boolean;
  readonly kanVerwarmen: boolean;
  /** Het doel dat Home Assistant nu heeft, of null. */
  readonly doelC: number | null;
  /** Wat het apparaat nu werkelijk doet: "verwarmt", "koelt", "staat stil", of null. */
  readonly actie: string | null;
}

export interface HouseDevice {
  /** Voor de pagina, als sleutel; de bewoner ziet hem nooit (45). */
  readonly id: string;
  /** De naam in de app: de eigen naam uit de indeling, anders die uit Home Assistant. */
  readonly naam: string;
  /** De naam zoals Home Assistant hem kent, voor wie hem hernoemt. */
  readonly haNaam: string;
  readonly soort: DeviceKind;
  /** De stand in woorden: "aan · 70%", "60% dicht", "koelen naar 22°". */
  readonly stand: string;
  readonly aan: boolean;
  readonly helderheidPct: number | null;
  /** Zoals Home Assistant het zegt: 100 is open, 0 is dicht. */
  readonly positiePct: number | null;
  /** Het klimaatapparaat uit de configuratie, voor "wat zou ik doen". */
  readonly actuatorId: string | null;
  /** De zone in de kamer waar het staat, of null. */
  readonly zone: string | null;
  /** De lampgroepen in Home Assistant waar het in zit: context bij een naam die vaker voorkomt. */
  readonly groepen: readonly string[];
  /** Een lamp die meer kan dan aan en uit. */
  readonly dimbaar: boolean;
  /** Een lamp die warm, neutraal of koel kan (kleurtemperatuur, of kleur). */
  readonly kleurtemp: boolean;
  /**
   * Wat een lamp in wit en kleur kan (besluit 100): het bereik in kelvin, of null,
   * en of hij kleur kan. Met de stand van nu, voor wat er gekozen staat.
   */
  readonly licht?: {
    readonly wit: { readonly minK: number; readonly maxK: number } | null;
    readonly kleur: boolean;
    readonly kelvin: number | null;
    /** Tint 0–360 en verzadiging 0–100, als hij nu in kleur staat. */
    readonly tint: readonly [number, number] | null;
  };
  /** Temperatuur en luchtvochtigheid, voor een meter of een klimaatapparaat. */
  readonly meting: HouseReading | null;
  /** Alleen bij klimaat. */
  readonly klimaat: HouseClimate | null;
  /** Een meter die de temperatuur van een regelgebied levert. */
  readonly meetKamer: boolean;
  /**
   * Alleen bij een scherm (besluit 121): of het zijn stand terugmeldt (Somfy io)
   * of niet (Somfy RTS: de stand is een aanname), en of je een stand kunt kiezen.
   * Alleen een scherm met terugmelding mag later in de regeling.
   */
  readonly scherm?: { readonly terugmelding: boolean; readonly standKiezen: boolean };
  /** De batterij van het apparaat in procenten, als het er een heeft (besluit 122). */
  readonly batterijPct?: number;
  /**
   * Een radiatorknop (besluit 126), zoals de Sonoff TRVZB: hoe hij gekoppeld is
   * (ZHA of Zigbee2MQTT), en hoe ver de klep open staat als hij dat meldt.
   * Alleen kijken: tot stap B bedient Smart Climate geen klimaat.
   */
  readonly radiatorknop?: { readonly koppeling: 'zha' | 'zigbee2mqtt' | 'anders'; readonly klepPct: number | null };
}

/**
 * Wat er op een niveau aan staat, in woorden (ONTWERP §4: "2 lampen aan",
 * "Screens 60% dicht", "Er draait niets"). De dienst zegt het, de pagina toont het.
 */
export interface HouseSummary {
  readonly lampenAan: number;
  /** De stand van de screens, of null als er geen zijn. */
  readonly screens: string | null;
  /** Hoeveel klimaatapparaten draaien, en dat in woorden. */
  readonly draait: number;
  readonly klimaat: string;
}

export interface HouseRoom {
  readonly id: string;
  readonly naam: string;
  /** Het regelgebied uit de configuratie dat deze kamer is, of null. */
  readonly zoneId: string | null;
  /** De delen van de kamer (95), leeg als hij er geen heeft. */
  readonly zones: readonly { readonly id: string; readonly naam: string }[];
  /** Van het regelgebied, of anders van een meter in de kamer. */
  readonly temperatuurC: number | null;
  readonly vochtPct: number | null;
  /** De meter waar de temperatuur vandaan komt, als het niet het regelgebied is. */
  readonly gemetenDoor: string | null;
  readonly status: { readonly soort: RoomKind; readonly zin: string } | null;
  readonly lampenAan: number;
  readonly samenvatting: HouseSummary;
  readonly apparaten: readonly HouseDevice[];
  /** De scènes van deze ruimte, uit Hue (besluit 100); de laatst gekozen is actief. */
  readonly scenes: readonly HouseScene[];
  /**
   * Een buitenruimte (besluit 109): wat voor ruimte, en of er een auto of een
   * tuinhuis bij hoort. Zoals de bewoner het in de indeling vastlegde, of
   * anders een voorstel uit de naam. Null voor een kamer binnen.
   */
  readonly buiten: LayoutOutside | null;
  /**
   * Wat voor kamer het is, voor de inrichting in de tekening (besluit 119):
   * zoals de bewoner koos, of een voorstel uit de naam; null buiten, of als
   * de naam niets zegt.
   */
  readonly soort: RoomType | null;
  /** Of de soort door de bewoner gekozen is, of een voorstel. */
  readonly soortGekozen: boolean;
}

export interface HouseScene {
  readonly id: string;
  readonly naam: string;
  /** De laatst aangezette van zijn Hue-groep: Hue zegt zelf niet welke er "aan" staat. */
  readonly actief: boolean;
  /**
   * De Hue-kamer of -zone waar hij bij hoort ("Tuinhuis overstek"), of null
   * voor een scène uit Home Assistant. Een lamp toont alleen de scènes van zijn
   * eigen groep: zo staan "Energie" van de border en van het tuinhuis niet
   * naast elkaar.
   */
  readonly groep: string | null;
  /** Wanneer hij voor het laatst aan ging; null als nooit. De lijst begint met de recentste. */
  readonly gebruiktMs: number | null;
  /** Zijn kleuren, zoals de lampen ze lieten zien, of die bij zijn naam; leeg als onbekend. */
  readonly kleuren: readonly string[];
  /** Een plaatje uit `scene-plaatjes/` als de bewoner dat heeft (scene-pictures.ts), anders null. */
  readonly plaatje: string | null;
  /** Zet hij alleen wit? Dan kan een lamp zonder kleur hem ook; anders niet (scene-colors.ts). */
  readonly wit: boolean;
}

export interface HouseFloor {
  readonly id: FloorId;
  readonly naam: string;
  readonly lampenAan: number;
  readonly samenvatting: HouseSummary;
  readonly ruimtes: readonly HouseRoom[];
}

export interface HouseReport {
  /** "eigen" als de bewoner de indeling vastlegde, anders "voorstel" uit Home Assistant. */
  readonly indeling: 'eigen' | 'voorstel';
  /** De etage onder het schuine dak (besluit 111), of null: dan geen schuin dak in de tekening. */
  readonly dakEtage: FloorId | null;
  readonly etages: readonly HouseFloor[];
  readonly lampenAan: number;
  readonly samenvatting: HouseSummary;
  /**
   * Wat in geen kamer staat. Het huis kan het nergens tonen; de bewoner deelt
   * het in (95), met als voorstel het gebied uit Home Assistant als dat er is.
   */
  readonly zonderRuimte: readonly {
    readonly id: string;
    readonly naam: string;
    readonly soort: DeviceKind;
    readonly voorstel: string | null;
    /** De lampgroepen waar het in zit, zoals "Hal alles" of de Hue-kamer "Keuken". */
    readonly groepen: readonly string[];
    /** De kamer die bij een van die groepen lijkt te horen, of null. */
    readonly voorstelKamer: string | null;
  }[];
  /**
   * De lampgroepen uit Home Assistant: groepen en Hue-kamers en -zones. Ze staan
   * niet als apparaat in het huis (dan telt een lamp dubbel), maar zeggen wel welke
   * lampen bij elkaar horen.
   */
  readonly lampgroepen: readonly {
    readonly id: string;
    readonly naam: string;
    readonly leden: readonly string[];
    readonly hue: boolean;
    /** Een groep die een heel gebied schakelt ("Etage 2 alles"), geen lamp. */
    readonly overzicht: boolean;
  }[];
  /** Wat de bewoner in de app niet wil zien (96), om terug te kunnen zetten. */
  readonly verborgen: readonly { readonly id: string; readonly naam: string; readonly soort: DeviceKind }[];
  /**
   * Lampen die in Home Assistant uitgezet of verborgen zijn en alleen nog in een
   * groep als "Etage 2 alles" zitten. Het huis kan ze nergens tonen; ze weer
   * aanzetten in Home Assistant, of in een eigen Hue-zone, maakt ze zichtbaar.
   */
  readonly onvindbaar: readonly { readonly id: string; readonly naam: string; readonly groepen: readonly string[] }[];
  /**
   * Elk apparaat met een batterij (besluit 122), de leegste eerst: de naam van
   * het apparaat, het percentage en de kamer waar het hoort, als die er is. Onder
   * de 10% meldt het startscherm het.
   */
  readonly batterijen: readonly HouseBattery[];
}

export interface HouseBattery {
  /** Het apparaat in Home Assistant. */
  readonly id: string;
  readonly naam: string;
  readonly pct: number;
  /** De kamer in de indeling, met naam en id, of null. */
  readonly kamer: string | null;
  readonly kamerId: string | null;
}

/** Onder dit percentage meldt het startscherm een batterij (besluit 122). */
export const BATTERIJ_LEEG_PCT = 10;

/**
 * Koppelingen van telefoons en tablets: die laden zichzelf op, en zijn geen
 * apparaat in huis (besluit 127).
 */
const ZELF_LADEN = new Set(['mobile_app', 'fully_kiosk']);
/**
 * Een apparaat met een van deze klassen is een thuisbatterij, een omvormer of
 * een auto: het bewaart energie, laadt, of heeft een actieradius (besluit 127).
 * Vermogen én energie samen telt ook; vermogen alleen niet, want een screen op
 * zonne-energie meet wat zijn paneeltje levert.
 */
const GROTE_ACCU = new Set(['energy_storage', 'distance', 'battery_charging']);
/** Merken van omvormers, thuisbatterijen en auto's, voor als de klassen ontbreken. */
const OPSLAG_MERK = /solaredge|huawei|growatt|victron|fronius|goodwe|sungrow|enphase|powerwall|tesla|byd|sessy|marstek|zendure|solix|ecoflow|volkswagen|renault|kia|hyundai|polestar|bmw|mercedes|audi|skoda|nissan/i;

/**
 * De batterijen per apparaat in Home Assistant (besluit 122): elke sensor met de
 * klasse batterij en een percentage, de laagste per apparaat. Alleen de kleine
 * apparaten in huis, zoals een knop, een sensor of een radiatorknop, ook als de
 * app ze verder niet gebruikt; geen telefoon, thuisbatterij of auto (besluit 127).
 */
function batteriesPerDevice(registers: HouseRegisters, states: ReadonlyMap<string, HaEntityState>): Map<string, number> {
  const klasseVan = (e: HaRegistryEntity) => e.device_class ?? e.original_device_class ?? (states.get(e.entity_id)?.attributes['device_class'] as string | undefined);
  const groot = new Set<string>();
  const vermogen = new Set<string>();
  const energie = new Set<string>();
  for (const e of registers.entities) {
    if (!e.device_id || e.disabled_by) continue;
    const klasse = klasseVan(e);
    if (ZELF_LADEN.has(e.platform ?? '') || (klasse != null && GROTE_ACCU.has(klasse))) groot.add(e.device_id);
    if (klasse === 'power') vermogen.add(e.device_id);
    if (klasse === 'energy') energie.add(e.device_id);
  }
  for (const d of vermogen) if (energie.has(d)) groot.add(d);
  for (const d of registers.devices) if (OPSLAG_MERK.test(`${d.manufacturer ?? ''} ${d.model ?? ''}`)) groot.add(d.id);
  const out = new Map<string, number>();
  for (const e of registers.entities) {
    if (!e.device_id || e.disabled_by || !e.entity_id.startsWith('sensor.') || groot.has(e.device_id)) continue;
    const s = states.get(e.entity_id);
    const klasse = klasseVan(e);
    if (klasse !== 'battery' || s?.attributes['unit_of_measurement'] !== '%') continue;
    const pct = Number(s.state);
    if (s.state === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
    const prev = out.get(e.device_id);
    out.set(e.device_id, prev == null ? pct : Math.min(prev, pct));
  }
  return out;
}

const ORDER: Readonly<Record<DeviceKind, number>> = { klimaat: 0, screen: 1, licht: 2, apparaat: 3, camera: 4, meter: 5 };

/** Wat geen kamer meet: het weer, telefoons, schijven, de buitenkant van een apparaat. */
const NOT_A_ROOM = /\b(weather|weer|buiten|outdoor|outside|grond|gevoels|gevoelstemperatuur|battery|batterij|body|basal|cpu|processor|schijf|schijftemperatuur|disk|drive|nas|track)\b/i;

const HVAC_ACTION: Readonly<Record<string, string>> = {
  heating: 'verwarmt',
  preheating: 'warmt voor',
  cooling: 'koelt',
  drying: 'droogt',
  fan: 'ventileert',
  idle: 'staat stil',
  off: 'uit',
};

/** Een getal uit een toestand, of null als het er niet is of onbereikbaar. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function readingText(r: HouseReading): string {
  const parts = [r.temperatuurC == null ? null : `${nl1(r.temperatuurC)}°`, r.vochtPct == null ? null : `${Math.round(r.vochtPct)}%`];
  return parts.filter(Boolean).join(' · ') || 'geen meting';
}

const CLIMATE_WORD: Readonly<Record<string, string>> = {
  cool: 'koelen',
  heat: 'verwarmen',
  heat_cool: 'automatisch',
  auto: 'automatisch',
  dry: 'drogen',
  fan_only: 'ventileren',
};

function nl1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

/** "Woonkamer plafonnière" in de woonkamer heet daar gewoon "Plafonnière". */
function shortName(full: string, areaName: string | null): string {
  if (areaName) {
    const prefix = `${areaName.toLowerCase()} `;
    if (full.toLowerCase().startsWith(prefix) && full.length > prefix.length) {
      const rest = full.slice(prefix.length);
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return full;
}

function friendly(state: HaEntityState | undefined, fallback: string): string {
  const name = state?.attributes['friendly_name'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : fallback;
}

/** Kleurstanden voor een echte kleur, niet alleen wit (besluit 100). */
const HUE_MODES: ReadonlySet<string> = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww']);

/** Wat een lamp in wit en kleur kan, uit Home Assistant. */
function lightAbilities(state: HaEntityState | undefined, modes: readonly string[]): NonNullable<HouseDevice['licht']> {
  const a = state?.attributes ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const anyColor = modes.some((m) => COLOR_MODES.has(m));
  const minK = num(a['min_color_temp_kelvin']) ?? (anyColor ? 2200 : null);
  const maxK = num(a['max_color_temp_kelvin']) ?? (anyColor ? 6500 : null);
  const hs = Array.isArray(a['hs_color']) && a['color_mode'] !== 'color_temp' ? (a['hs_color'] as unknown[]).map(num) : null;
  return {
    wit: minK != null && maxK != null ? { minK: Math.round(minK), maxK: Math.round(maxK) } : null,
    kleur: modes.some((m) => HUE_MODES.has(m)),
    kelvin: a['color_mode'] === 'color_temp' ? num(a['color_temp_kelvin']) : null,
    tint: hs && hs[0] != null && hs[1] != null ? [Math.round(hs[0]), Math.round(hs[1])] : null,
  };
}

/**
 * De scènes per ruimte (besluit 100). Hue zet elke scène in Home Assistant als
 * `scene.`-entiteit, met de naam van de Hue-kamer of -zone (`group_name`). Die
 * hoort bij de ruimte waarvan de lampen in die groep zitten, of die zo heet. Een
 * scène uit Home Assistant zelf noemt zijn lampen (`entity_id`): de ruimte met
 * de meeste daarvan. Een scène die bij geen ruimte hoort, laat de app weg.
 */
function scenesPerRoom(
  states: ReadonlyMap<string, HaEntityState>,
  rooms: readonly { readonly id: string; readonly naam: string; readonly devices: readonly HouseDevice[] }[],
  /** De ruimte van een scène via zijn gebied in Home Assistant, als laatste uitweg. */
  roomOfArea: (sceneId: string) => string | null = () => null,
  /** De kleuren van een scène (scene-colors.ts). */
  colorsOf: (sceneId: string, naam: string) => readonly string[] = () => [],
  /** Het plaatje van een scène (scene-pictures.ts). */
  pictureOf: (naam: string) => string | null = () => null,
): Map<string, HouseScene[]> {
  const out = new Map<string, (HouseScene & { t: number })[]>();
  const lower = (s: string) => s.trim().toLowerCase();
  for (const [id, st] of states) {
    if (!id.startsWith('scene.') || st.state === 'unavailable') continue;
    const a = st.attributes;
    let roomId: string | null = null;
    const members = Array.isArray(a['entity_id']) ? (a['entity_id'] as unknown[]).filter((m): m is string => typeof m === 'string') : [];
    if (members.length > 0) {
      let best = 0;
      for (const r of rooms) {
        const n = r.devices.filter((d) => members.includes(d.id)).length;
        if (n > best) {
          best = n;
          roomId = r.id;
        }
      }
    }
    const group = typeof a['group_name'] === 'string' ? lower(a['group_name']) : null;
    if (roomId == null && group != null) {
      roomId =
        rooms.find((r) => r.devices.some((d) => d.groepen.some((g) => lower(g) === group)))?.id ??
        // Een Hue-groep van verborgen peren staat zelf als armatuur in de ruimte.
        rooms.find((r) => r.devices.some((d) => lower(d.haNaam) === group))?.id ??
        rooms.find((r) => lower(r.naam) === group)?.id ??
        null;
    }
    // Een Hue-scène hangt aan het apparaat van zijn Hue-kamer; staat dat in een
    // gebied, dan is dat de ruimte (zo kwamen er op 7 oktober 192 scènes binnen).
    roomId ??= roomOfArea(id);
    if (roomId == null) continue;
    const friendlyName = typeof a['friendly_name'] === 'string' ? a['friendly_name'].trim() : id;
    const own = typeof a['name'] === 'string' && a['name'].trim() !== '' ? a['name'].trim() : null;
    const groupName = typeof a['group_name'] === 'string' ? a['group_name'].trim() : '';
    const naam = own ?? (groupName && friendlyName.toLowerCase().startsWith(groupName.toLowerCase()) ? friendlyName.slice(groupName.length).trim() || friendlyName : friendlyName);
    const t = Date.parse(st.state);
    const list = out.get(roomId) ?? [];
    const kleuren = colorsOf(id, naam);
    list.push({ id, naam, actief: false, groep: groupName || null, gebruiktMs: Number.isFinite(t) ? t : null, kleuren, plaatje: pictureOf(naam), wit: whiteScene(naam, kleuren), t: Number.isFinite(t) ? t : 0 });
    out.set(roomId, list);
  }
  const result = new Map<string, HouseScene[]>();
  for (const [roomId, list] of out) {
    // Actief per Hue-groep: de laatst aangezette van die groep.
    const newest = new Map<string, number>();
    for (const s of list) newest.set(s.groep ?? '', Math.max(newest.get(s.groep ?? '') ?? 0, s.t));
    // De recentste eerst; wat nooit aan ging, op naam erachter.
    list.sort((x, y) => y.t - x.t || x.naam.localeCompare(y.naam, 'nl'));
    result.set(
      roomId,
      list.map((s) => ({ id: s.id, naam: s.naam, actief: s.t > 0 && s.t === newest.get(s.groep ?? ''), groep: s.groep, gebruiktMs: s.gebruiktMs, kleuren: s.kleuren, plaatje: s.plaatje, wit: s.wit })),
    );
  }
  return result;
}

/** Kleurstanden waarmee Home Assistant ook een kleurtemperatuur kan zetten. */
const COLOR_MODES: ReadonlySet<string> = new Set(['color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww']);

function lightOf(id: string, state: HaEntityState | undefined, name: string): HouseDevice {
  const on = state?.state === 'on';
  const b = state?.attributes['brightness'];
  const pct = on && typeof b === 'number' ? Math.round((b / 255) * 100) : null;
  const stand =
    state == null || state.state === 'unavailable' || state.state === 'unknown'
      ? 'onbereikbaar'
      : on
        ? pct == null
          ? 'aan'
          : `aan · ${pct}%`
        : 'uit';
  // Wat de lamp kan, uit Home Assistant; een uitgezette lamp zonder toestand kan alleen aan en uit.
  const modes = state?.attributes['supported_color_modes'];
  const list = Array.isArray(modes) ? modes.filter((m): m is string => typeof m === 'string') : [];
  const dimbaar = list.some((m) => m !== 'onoff') || typeof b === 'number';
  const kleurtemp = list.some((m) => COLOR_MODES.has(m));
  return { id, naam: name, haNaam: name, soort: 'licht', stand, aan: on, helderheidPct: pct, positiePct: null, actuatorId: null, zone: null, groepen: [], dimbaar, kleurtemp, licht: lightAbilities(state, list), meting: null, klimaat: null, meetKamer: false };
}

/**
 * Is dit een radiatorknop (besluit 126)? Aan het type ("TRV", "thermostatic",
 * "radiator"), of een klimaatapparaat dat alleen kan verwarmen en op een
 * batterij werkt.
 */
function isRadiatorKnob(dev: { model?: string | null; manufacturer?: string | null; name?: string | null } | undefined, modes: readonly string[]): boolean {
  const tekst = `${dev?.manufacturer ?? ''} ${dev?.model ?? ''} ${dev?.name ?? ''}`;
  if (/trv|thermostatic|radiator|radiatorknop|thermostaatknop/i.test(tekst)) return true;
  return modes.length > 0 && !modes.some((m) => m === 'cool' || m === 'heat_cool' || m === 'dry' || m === 'fan_only') && /sonoff|tuya|danfoss|eurotronic|moes|aqara|bosch/i.test(tekst);
}

/**
 * Zijn dit twee koppelingen van hetzelfde apparaat (besluit 127)? Dezelfde
 * naam, of in dezelfde ruimte met hetzelfde type ("RAC_056905_WW").
 */
function sameDevice(a: HaDevice, b: HaDevice): boolean {
  if (a.id === b.id) return true;
  const naam = (d: HaDevice) => (d.name_by_user ?? d.name ?? '').trim().toLowerCase();
  if (naam(a) !== '' && naam(a) === naam(b)) return true;
  const type = (d: HaDevice) => /^[a-z0-9_]{4,}/i.exec((d.model ?? '').trim())?.[0].toLowerCase() ?? '';
  return a.area_id != null && a.area_id === b.area_id && type(a) !== '' && type(a) === type(b);
}

/** Hoe ver de klep open staat (0 tot 100%), als het apparaat dat meldt. */
function valveOf(registers: HouseRegisters, states: ReadonlyMap<string, HaEntityState>, deviceId: string | null): number | null {
  if (!deviceId) return null;
  for (const e of registers.entities) {
    if (e.device_id !== deviceId || !e.entity_id.startsWith('sensor.') || !/valve|klep/i.test(e.entity_id)) continue;
    // Een grens als "valve_opening_degree" is een instelling, geen stand: alleen een sensor telt.
    const s = states.get(e.entity_id);
    const n = Number(s?.state);
    if (s && s.attributes['unit_of_measurement'] === '%' && Number.isFinite(n)) return n;
  }
  return null;
}

/** De temperatuur van een sensor of klimaatapparaat (besluit 123), of null. */
function readTemperature(state: HaEntityState | undefined, id: string): number | null {
  if (state == null) return null;
  const raw = id.startsWith('climate.') ? state.attributes['current_temperature'] : state.state;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > -40 && n < 70 ? n : null;
}

/** Kan dit scherm naar een stand (SUPPORT_SET_POSITION, bit 4)? */
const COVER_SET_POSITION = 4;

function coverOf(id: string, state: HaEntityState | undefined, name: string): HouseDevice {
  const p = state?.attributes['current_position'];
  const pos = typeof p === 'number' ? p : null;
  const features = Number(state?.attributes['supported_features'] ?? 0);
  // Somfy RTS (en elk scherm dat zijn stand niet terugmeldt): Home Assistant
  // zegt "assumed_state", of kent geen stand en geen open of dicht.
  const terugmelding = state != null && state.attributes['assumed_state'] !== true && (pos != null || state.state === 'open' || state.state === 'closed' || state.state === 'opening' || state.state === 'closing');
  const scherm = { terugmelding, standKiezen: terugmelding && (features & COVER_SET_POSITION) !== 0 };
  let stand: string;
  if (state == null || state.state === 'unavailable') stand = 'onbekend';
  else if (!terugmelding) stand = 'zonder terugmelding';
  else if (state.state === 'opening') stand = 'gaat open';
  else if (state.state === 'closing') stand = 'gaat dicht';
  else if (pos == null) stand = state.state === 'closed' ? 'dicht' : 'open';
  else if (pos >= 100) stand = 'open';
  else if (pos <= 0) stand = 'dicht';
  else stand = `${100 - pos}% dicht`;
  // "Aan" is voor een screen: hij hangt (deels) voor het raam.
  const down = pos != null ? pos < 100 : state?.state === 'closed';
  return { id, naam: name, haNaam: name, soort: 'screen', stand, aan: terugmelding && down, helderheidPct: null, positiePct: terugmelding ? pos : null, actuatorId: null, zone: null, groepen: [], dimbaar: false, kleurtemp: false, meting: null, klimaat: null, meetKamer: false, scherm };
}

function climateOf(
  actuatorId: string,
  name: string,
  observed: string | undefined,
  info: { meting: HouseReading | null; klimaat: HouseClimate | null } = { meting: null, klimaat: null },
): HouseDevice {
  const [mode = '', sp] = (observed ?? '').split('@');
  const word = CLIMATE_WORD[mode];
  const setpoint = sp == null ? NaN : Number(sp);
  const stand =
    mode === 'off'
      ? 'uit'
      : word == null
        ? 'onbekend'
        : Number.isFinite(setpoint)
          ? `${word} naar ${nl1(setpoint)}°`
          : word;
  return {
    id: actuatorId,
    naam: name,
    haNaam: name,
    soort: 'klimaat',
    stand,
    aan: word != null,
    helderheidPct: null,
    positiePct: null,
    actuatorId,
    zone: null,
    groepen: [],
    dimbaar: false,
    kleurtemp: false,
    meting: info.meting,
    klimaat: info.klimaat,
    meetKamer: false,
  };
}

const APPLIANCE_WORD: Readonly<Record<string, string>> = {
  running: 'draait',
  would_start: 'zou nu starten',
  waiting: 'klaargezet',
  not_ready: 'uit',
  unknown: 'onbekend',
};

/** Een uitstelbaar apparaat (besluit 98): de droger, met zijn stand van nu. */
function applianceOf(id: string, name: string, state: string | undefined): HouseDevice {
  return {
    id,
    naam: name,
    haNaam: name,
    soort: 'apparaat',
    stand: APPLIANCE_WORD[state ?? 'unknown'] ?? 'onbekend',
    aan: state === 'running',
    helderheidPct: null,
    positiePct: null,
    actuatorId: null,
    zone: null,
    groepen: [],
    dimbaar: false,
    kleurtemp: false,
    meting: null,
    klimaat: null,
    meetKamer: false,
  };
}

/** Een camera om te bekijken (besluit 106); de stand zegt alleen of hij bereikbaar is. */
function cameraOf(id: string, name: string, bereikbaar: boolean): HouseDevice {
  return {
    id,
    naam: name,
    haNaam: name,
    soort: 'camera',
    stand: bereikbaar ? 'live te bekijken' : 'niet bereikbaar',
    aan: false,
    helderheidPct: null,
    positiePct: null,
    actuatorId: null,
    zone: null,
    groepen: [],
    dimbaar: false,
    kleurtemp: false,
    meting: null,
    klimaat: null,
    meetKamer: false,
  };
}

/** Een meter: een sensor in een kamer die temperatuur en luchtvochtigheid geeft. */
function meterOf(id: string, name: string, meting: HouseReading, meetKamer: boolean): HouseDevice {
  return {
    id,
    naam: name,
    haNaam: name,
    soort: 'meter',
    stand: readingText(meting),
    aan: false,
    helderheidPct: null,
    positiePct: null,
    actuatorId: null,
    zone: null,
    groepen: [],
    dimbaar: false,
    kleurtemp: false,
    meting,
    klimaat: null,
    meetKamer,
  };
}

interface Found {
  readonly device: Omit<HouseDevice, 'naam' | 'haNaam' | 'zone' | 'groepen'>;
  readonly haNaam: string;
  readonly haArea: string | null;
  readonly groepen: readonly string[];
}

interface LightGroup {
  readonly id: string;
  readonly naam: string;
  readonly leden: readonly string[];
  readonly hue: boolean;
  readonly overzicht: boolean;
}

interface Context {
  readonly found: readonly Found[];
  readonly areaOf: (entityId: string) => string | null;
  readonly groups: readonly LightGroup[];
  /** Per lamp die niet los in het huis staat, de groep die hem als één lamp toont. */
  readonly successors: ReadonlyMap<string, string>;
  /** Uitgezette of verborgen lampen die alleen in een overzichtsgroep zitten. */
  readonly unreachable: readonly { readonly id: string; readonly naam: string; readonly groepen: readonly string[] }[];
}

/** De namen die een lamp in de registers heeft, van algemeen naar eigen; de laatste wint. */
function registryNames(e: HaRegistryEntity, devices: ReadonlyMap<string, HaDevice>): string[] {
  const dev = e.device_id ? devices.get(e.device_id) : undefined;
  return [dev?.name, dev?.name_by_user, e.original_name, e.name].filter(
    (n): n is string => typeof n === 'string' && n.trim() !== '',
  ).map((n) => n.trim());
}

/** "Etage 2 alles", "Alles", `light.bg_alles`: een groep die een heel gebied schakelt. */
const OVERVIEW = /\b(alles|alle|all)\b/i;

/**
 * De lampgroepen: een groep van Home Assistant somt zijn lampen op als
 * `entity_id`, een Hue-kamer of -zone doet dat soms alleen met namen (`lights`).
 * Een uitgezette lamp heeft geen toestand; zijn naam staat dan alleen nog in de
 * registers, bij de entiteit of bij het apparaat (Hue noemt de lamp zoals het
 * apparaat heet).
 *
 * Een overzichtsgroep is een groep die een heel gebied schakelt: zijn naam zegt
 * "alles", of hij bevat zelf groepen. Die is nooit een lamp; alles uit op een
 * etage of in het hele huis doet de app zelf, met de lampen uit de indeling.
 */
function lightGroups(registers: HouseRegisters, states: ReadonlyMap<string, HaEntityState>): LightGroup[] {
  const byName = new Map<string, string>();
  const devices = new Map(registers.devices.map((d) => [d.id, d]));
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('light.')) continue;
    for (const n of registryNames(e, devices)) byName.set(n.toLowerCase(), e.entity_id);
  }
  for (const [id, st] of states) {
    if (!id.startsWith('light.')) continue;
    const n = st.attributes['friendly_name'];
    if (typeof n === 'string') byName.set(n.trim().toLowerCase(), id);
  }
  const out: Omit<LightGroup, 'overzicht'>[] = [];
  for (const [id, st] of states) {
    if (!id.startsWith('light.')) continue;
    const members = st.attributes['entity_id'];
    const names = st.attributes['lights'];
    const hue = st.attributes['is_hue_group'] === true;
    let leden: string[] = [];
    if (Array.isArray(members)) leden = members.filter((m): m is string => typeof m === 'string');
    else if (Array.isArray(names)) {
      leden = names
        .map((n) => (typeof n === 'string' ? byName.get(n.trim().toLowerCase()) : undefined))
        .filter((m): m is string => m != null);
    }
    if (!hue && !Array.isArray(members)) continue;
    out.push({ id, naam: friendly(st, id), leden, hue });
  }
  const ids = new Set(out.map((g) => g.id));
  return out.map((g) => ({
    ...g,
    overzicht: OVERVIEW.test(g.naam) || OVERVIEW.test(g.id.replace(/[._]/g, ' ')) || g.leden.some((m) => ids.has(m)),
  }));
}

/** Alle apparaten die het huis toont, met hun gebied in Home Assistant. */
function collect(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
  snapshot: DecisionView | null,
  /** De camera's die de app toont (besluit 109); null is het voorstel: elke camera. */
  cameras: ReadonlySet<string> | null = null,
): Context {
  const deviceArea = new Map(registers.devices.map((d) => [d.id, d.area_id]));
  const registry = new Map(registers.entities.map((e) => [e.entity_id, e]));
  const areaOf = (entityId: string): string | null => {
    const e = registry.get(entityId);
    if (!e) return null;
    return e.area_id ?? (e.device_id ? (deviceArea.get(e.device_id) ?? null) : null);
  };
  const found: Found[] = [];
  const groups = lightGroups(registers, states);
  const groupIds = new Set(groups.map((g) => g.id));
  const memberOf = new Map<string, string[]>();
  for (const g of groups) {
    // Twee groepen met dezelfde naam zeggen niets extra's; één keer noemen.
    for (const m of g.leden) memberOf.set(m, [...new Set([...(memberOf.get(m) ?? []), g.naam])]);
  }

  /*
   * Metingen per apparaat in Home Assistant: een temperatuur- en een vochtsensor.
   * Alleen wat een kamer meet: met een apparaat, geen diagnose, niet uitgezet of
   * verborgen, geen telefoon, en niets wat naar weer, buiten of een schijf klinkt.
   */
  const devices = new Map(registers.devices.map((d) => [d.id, d]));
  const sensorsOf = new Map<string, { temp?: string; hum?: string }>();
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('sensor.') || !e.device_id || e.entity_category || e.disabled_by || e.hidden_by) continue;
    if (e.platform === 'mobile_app') continue;
    const dc = e.device_class ?? e.original_device_class ?? states.get(e.entity_id)?.attributes['device_class'];
    if (dc !== 'temperature' && dc !== 'humidity') continue;
    const label = `${e.entity_id} ${e.original_name ?? ''} ${e.name ?? ''}`.replace(/[._]/g, ' ');
    if (NOT_A_ROOM.test(label)) continue;
    const r = sensorsOf.get(e.device_id) ?? {};
    if (dc === 'temperature') r.temp ??= e.entity_id;
    else r.hum ??= e.entity_id;
    sensorsOf.set(e.device_id, r);
  }
  const readingOf = (r: { temp?: string; hum?: string } | undefined): HouseReading => ({
    temperatuurC: r?.temp ? num(states.get(r.temp)?.state) : null,
    vochtPct: r?.hum ? num(states.get(r.hum)?.state) : null,
  });

  // Klimaat: de apparaten uit de configuratie, met wat ze werkelijk doen en meten.
  for (const a of config.actuators) {
    const st = states.get(a.ref.id);
    const own = sensorsOf.get(registry.get(a.ref.id)?.device_id ?? '');
    const fromSensors = readingOf(own);
    const meting: HouseReading = {
      temperatuurC: num(st?.attributes['current_temperature']) ?? fromSensors.temperatuurC,
      vochtPct: num(st?.attributes['current_humidity']) ?? fromSensors.vochtPct,
    };
    const action = st?.attributes['hvac_action'];
    const klimaat: HouseClimate = {
      kanKoelen: a.capabilities.canCool,
      kanVerwarmen: a.capabilities.canHeat,
      doelC: num(st?.attributes['temperature']),
      actie: typeof action === 'string' ? (HVAC_ACTION[action] ?? null) : null,
    };
    const hasReading = meting.temperatuurC != null || meting.vochtPct != null;
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = climateOf(a.id, a.name, snapshot?.observed[a.id], {
      meting: hasReading ? meting : null,
      klimaat,
    });
    found.push({ device, haNaam: a.name, haArea: areaOf(a.ref.id), groepen: [] });
  }

  /*
   * Klimaatapparaten die Home Assistant kent maar de configuratie niet (besluit
   * 126), zoals een radiatorknop: in het huis om te zien wat ze meten en doen,
   * en in "Meten met". Alleen kijken.
   */
  const inConfig = new Set(config.actuators.map((a) => a.ref.id));
  const devById = new Map(registers.devices.map((d) => [d.id, d]));
  // Hetzelfde apparaat via een tweede koppeling (besluit 127), zoals een LG-airco
  // via LG ThinQ en via SmartThinQ uit HACS: één keer in het huis, niet twee.
  const configDevs = registers.entities
    .filter((e) => inConfig.has(e.entity_id) && e.device_id)
    .map((e) => devById.get(e.device_id!))
    .filter((d): d is HaDevice => d != null);
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('climate.') || e.disabled_by || e.hidden_by || inConfig.has(e.entity_id)) continue;
    const eigen = e.device_id ? devById.get(e.device_id) : undefined;
    if (eigen && configDevs.some((c) => sameDevice(c, eigen))) continue;
    const st = states.get(e.entity_id);
    const modes = Array.isArray(st?.attributes['hvac_modes']) ? (st!.attributes['hvac_modes'] as unknown[]).map(String) : [];
    const own = sensorsOf.get(e.device_id ?? '');
    const fromSensors = readingOf(own);
    const meting: HouseReading = {
      temperatuurC: num(st?.attributes['current_temperature']) ?? fromSensors.temperatuurC,
      vochtPct: num(st?.attributes['current_humidity']) ?? fromSensors.vochtPct,
    };
    const action = st?.attributes['hvac_action'];
    const klimaat: HouseClimate = {
      kanKoelen: modes.some((m) => m === 'cool' || m === 'heat_cool'),
      kanVerwarmen: modes.some((m) => m === 'heat' || m === 'heat_cool' || m === 'auto'),
      doelC: num(st?.attributes['temperature']),
      actie: typeof action === 'string' ? (HVAC_ACTION[action] ?? null) : null,
    };
    const naam = friendly(st, e.entity_id);
    const sp = num(st?.attributes['temperature']);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...basis } = climateOf(e.entity_id, naam, st ? `${st.state}${sp != null ? `@${sp}` : ''}` : undefined, {
      meting: meting.temperatuurC != null || meting.vochtPct != null ? meting : null,
      klimaat,
    });
    const dev = e.device_id ? devById.get(e.device_id) : undefined;
    const knop = isRadiatorKnob(dev, modes) ? { koppeling: e.platform === 'zha' ? ('zha' as const) : e.platform === 'mqtt' ? ('zigbee2mqtt' as const) : ('anders' as const), klepPct: valveOf(registers, states, e.device_id ?? null) } : null;
    // Zijn stand is wat hij echt doet: een knop staat altijd op verwarmen, en brandt alleen soms.
    const bezig = action === 'heating' || action === 'cooling';
    const doel = sp != null ? `doel ${nl1(sp)}°` : null;
    const stand = st == null || st.state === 'unavailable' || st.state === 'unknown'
      ? 'onbekend'
      : st.state === 'off'
        ? 'uit'
        : [bezig ? (action === 'heating' ? 'verwarmt' : 'koelt') : 'staat klaar', doel].filter(Boolean).join(', ');
    const device = { ...basis, stand, aan: bezig, actuatorId: null, ...(knop ? { radiatorknop: knop } : {}) };
    found.push({ device, haNaam: naam, haArea: areaOf(e.entity_id), groepen: [] });
  }

  /*
   * Meters: per apparaat één, met temperatuur en luchtvochtigheid samen. Een
   * apparaat dat zelf een klimaatapparaat is (de Nest, een airco), is geen meter:
   * wat het meet, staat bij dat apparaat.
   */
  const climateDevices = new Set(
    registers.entities.filter((e) => e.entity_id.startsWith('climate.') && e.device_id).map((e) => e.device_id as string),
  );
  const zoneSensors = new Set(config.zones.flatMap((z) => [z.temperature.id, ...(z.temperatures ?? []).map((t) => t.id)]));
  for (const [deviceId, r] of sensorsOf) {
    if (climateDevices.has(deviceId)) continue;
    const id = r.temp ?? r.hum;
    if (!id) continue;
    const dev = devices.get(deviceId);
    const haNaam = dev?.name_by_user?.trim() || dev?.name?.trim() || friendly(states.get(id), id);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = meterOf(id, haNaam, readingOf(r), zoneSensors.has(r.temp ?? ''));
    found.push({ device, haNaam, haArea: areaOf(id), groepen: [] });
  }

  // Uitstelbare apparaten (besluit 98): zo krijgt de droger een kamer in de indeling.
  // Het gebied komt van het apparaat achter "start op afstand", als Home Assistant het kent.
  for (const d of config.deferrables ?? []) {
    const state = snapshot?.explanation.deferrables?.find((x) => x.id === d.id)?.state;
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = applianceOf(d.id, d.name, state);
    found.push({ device, haNaam: d.name, haArea: areaOf(d.remoteStart.id), groepen: [] });
  }

  // Camera's (besluit 106): één per camera, in de kamer van het apparaat. Welke,
  // en met welk beeld, legt de bewoner vast (besluit 109); anders het voorstel.
  const deviceNames = new Map(registers.devices.map((d) => [d.id, (d.name_by_user ?? d.name ?? '').trim()]));
  const shown =
    cameras == null
      ? findCameras(registers.entities, registers.devices, states)
      : [...cameras].flatMap((id) => {
          const e = registry.get(id);
          if (!e) return [];
          const naam = (e.device_id ? deviceNames.get(e.device_id) : '') || String(states.get(id)?.attributes['friendly_name'] ?? id);
          return [{ entityId: id, naam, deviceId: e.device_id ?? null }];
        });
  for (const cam of shown) {
    const st = states.get(cam.entityId)?.state;
    const bereikbaar = st != null && st !== 'unavailable' && st !== 'unknown';
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = cameraOf(cam.entityId, cam.naam, bereikbaar);
    found.push({ device, haNaam: cam.naam, haArea: areaOf(cam.entityId), groepen: [] });
  }

  // Zonwering: één per apparaat (Somfy levert er per screen twee, ook een langzame).
  const coverPerDevice = new Map<string, string>();
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('cover.') || e.disabled_by || e.hidden_by) continue;
    const key = e.device_id ?? e.entity_id;
    const prev = coverPerDevice.get(key);
    if (prev == null || e.entity_id.length < prev.length) coverPerDevice.set(key, e.entity_id);
  }
  for (const id of coverPerDevice.values()) {
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = coverOf(id, states.get(id), '');
    found.push({ device, haNaam: friendly(states.get(id), id), haArea: areaOf(id), groepen: [] });
  }

  /*
   * Armaturen: een groep waarvan de lampen verborgen of uitgezet zijn, is één lamp.
   *
   * Wie de losse peren van een plafonnière verbergt of uitzet in Home Assistant,
   * ziet die plafonnière als één ding; zo staat hij ook in het huis. Per peer
   * telt de kleinste groep waar hij in zit: de Hue-zone "Woonkamer plafonnière"
   * (4 peren), niet de Hue-kamer "Woonkamer" (6). Grotere groepen blijven
   * context, en tellen nooit als lamp, anders telt een lamp dubbel. Een
   * uitgezette groep van Home Assistant is geen peer: die somt alleen lampen op.
   * Een overzichtsgroep ("Etage 2 alles") is nooit een armatuur; een peer die
   * alleen daarin zit, kan het huis niet tonen, en dat zegt het (`onvindbaar`).
   */
  const offstage = new Set(
    registers.entities
      .filter(
        (e) =>
          e.entity_id.startsWith('light.') &&
          (e.hidden_by || e.disabled_by) &&
          e.platform !== 'group' &&
          !groupIds.has(e.entity_id),
      )
      .map((e) => e.entity_id),
  );
  const fixtures = new Set<string>();
  const successors = new Map<string, string>();
  const unreachable: { id: string; naam: string; groepen: string[] }[] = [];
  for (const peer of offstage) {
    const containing = groups.filter((g) => g.leden.includes(peer));
    const smallest = containing
      .filter((g) => !g.overzicht)
      .sort((a, b) => a.leden.length - b.leden.length || Number(b.hue) - Number(a.hue))[0];
    if (smallest) {
      fixtures.add(smallest.id);
      successors.set(peer, smallest.id);
    } else if (containing.length > 0) {
      const e = registry.get(peer)!;
      unreachable.push({ id: peer, naam: friendly(states.get(peer), registryNames(e, devices).at(-1) ?? peer), groepen: containing.map((g) => g.naam) });
    }
  }
  const majorityArea = (ids: readonly string[]): string | null => {
    const votes = new Map<string, number>();
    for (const id of ids) {
      const a = areaOf(id);
      if (a) votes.set(a, (votes.get(a) ?? 0) + 1);
    }
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  for (const g of groups) {
    if (!fixtures.has(g.id)) continue;
    const s = states.get(g.id);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = lightOf(g.id, s, '');
    found.push({
      device,
      haNaam: g.naam,
      haArea: areaOf(g.id) ?? majorityArea(g.leden),
      groepen: (memberOf.get(g.id) ?? []).filter((n) => n !== g.naam),
    });
  }

  // Losse lampen: niet verborgen, en zelf geen groep (een groep somt lampen op die er al in staan).
  for (const e of registers.entities) {
    if (!e.entity_id.startsWith('light.') || e.disabled_by || e.hidden_by) continue;
    if (groupIds.has(e.entity_id)) continue;
    const s = states.get(e.entity_id);
    const { naam: _n, haNaam: _h, zone: _z, groepen: _g, ...device } = lightOf(e.entity_id, s, '');
    found.push({ device, haNaam: friendly(s, e.entity_id), haArea: areaOf(e.entity_id), groepen: memberOf.get(e.entity_id) ?? [] });
  }
  unreachable.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  return { found, areaOf, groups, successors, unreachable };
}

const GROUP_WORDS = /\b(alles|alle|groep|lampen|lamp|licht|verlichting|all|hue)\b/g;

/** "Hal alles" → "hal"; leeg als er niets kamerachtigs overblijft. */
function groupCore(name: string): string {
  return name.toLowerCase().replace(GROUP_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * De kamer die bij een van de groepen hoort: dezelfde naam, of de groepsnaam in
 * de kamernaam ("Hal" bij "Hal en trap"). Niet andersom: "Slaapkamer Mylan" is
 * een andere kamer dan "Slaapkamer".
 */
function roomForGroups(groepen: readonly string[], rooms: readonly LayoutRoom[]): string | null {
  for (const g of groepen) {
    const core = groupCore(g);
    if (core.length < 3) continue;
    const exact = rooms.find((r) => r.naam.toLowerCase() === core);
    if (exact) return exact.id;
    // Hele woorden: "hal" in "hal en trap", maar niet in "halfopen".
    const within = rooms.find((r) => ` ${r.naam.toLowerCase()} `.includes(` ${core} `));
    if (within) return within.id;
  }
  return null;
}

/** Wat het huis nu kent: de sleutels die een indeling mag gebruiken. */
export function knownForLayout(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
): LayoutKnown {
  const { found, successors } = collect(config, registers, states, null);
  return {
    deviceIds: new Set(found.map((f) => f.device.id)),
    zoneIds: new Set(config.zones.map((z) => z.id)),
    opvolgers: successors,
  };
}

/** Een id dat de indeling accepteert, uit een gebied van Home Assistant. */
function slug(text: string, taken: ReadonlySet<string>): string {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'kamer';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

const OUTSIDE = /tuin|oprit|terras|buiten|schuur|carport|balkon|veranda/i;

/**
 * Een voorstel voor de soort van een kamer zonder eigen keuze (besluit 119),
 * uit de naam, de zones, de etage en wat er staat. De keuze van de bewoner gaat
 * altijd voor; dit is alleen het begin. Null als niets iets zegt.
 */
export function roomTypeFromNames(room: Pick<LayoutRoom, 'naam' | 'zones' | 'etage'>, devices: readonly Pick<HouseDevice, 'naam' | 'soort'>[] = []): RoomType | null {
  const n = room.naam.toLowerCase().trim();
  const zones = room.zones.map((z) => z.naam.toLowerCase());
  const zegt = (re: RegExp) => re.test(n);
  // Een kamer met een keuken en een zithoek als zones is een woonkamer met open keuken.
  if (zones.some((z) => /keuken|kitchen/.test(z)) && zones.some((z) => /woon|zit|lounge|living|bank|tv/.test(z))) return 'woonkeuken';
  if (zegt(/woonkeuken|open keuken|leefkeuken/)) return 'woonkeuken';
  if (zegt(/bijkeuken|wasruimte|washok|wasplaats|laundry|stookhok|technische ruimte|cv-ruimte/)) return 'wasruimte';
  if (zegt(/keuken|kitchen/)) return 'keuken';
  if (zegt(/logeer|gast|guest/)) return 'logeerkamer';
  if (zegt(/kinder|baby|speelkamer|jongenskamer|meisjeskamer|tienerkamer|nursery|kids/)) return 'kinderkamer';
  // "Slaapkamer" alleen, of die van de ouders: een tweepersoonsbed. Met een naam erachter: een kind.
  if (zegt(/^(hoofd|ouder|grote |master )?slaapkamer$|master|ouderslaapkamer|bedroom$/)) return 'slaapkamer';
  if (zegt(/slaapkamer|slaap|bedroom/)) return 'kinderkamer';
  if (zegt(/^(toilet|wc)\b|toilet|^wc /)) return 'toilet';
  if (zegt(/bad|douche|bathroom|shower/)) return 'badkamer';
  if (zegt(/eetkamer|eethoek|dining/)) return 'eetkamer';
  if (zegt(/woon|zitkamer|zithoek|living|lounge|tv-kamer|tv kamer|serre|huiskamer|salon/)) return 'woonkamer';
  if (zegt(/trapkast|meterkast|kast onder de trap/)) return 'berging';
  if (zegt(/^(hal|gang|overloop|entree|portaal|vide|trap|trappenhuis|hall|landing|hallway)\b/)) return 'hal';
  if (zegt(/werk|kantoor|studeer|hobby|office|studio|bureau|game|thuiswerk|atelier|knutsel/)) return 'werkkamer';
  if (zegt(/zolder|vliering|berg|opslag|kelder|garage|schuur|attic|storage|basement/)) return 'berging';
  // Een kelder zonder naam die iets zegt, is een berging.
  if (room.etage === 'kelder') return 'berging';
  if (devices.some((d) => d.soort === 'apparaat' && /was|droog|droger/i.test(d.naam))) return 'wasruimte';
  return null;
}

/**
 * Een voorstel voor een buitenruimte zonder eigen keuze (besluit 109): de soort
 * uit de naam, een auto op een oprit, en een tuinhuis als een zone of een
 * apparaat zo heet.
 */
export function outsideFromNames(room: Pick<LayoutRoom, 'naam' | 'zones'>, devices: readonly Pick<HouseDevice, 'naam'>[]): LayoutOutside {
  const n = room.naam;
  const soort = /oprit|carport/i.test(n) ? 'oprit' : /voortuin/i.test(n) ? 'voortuin' : /terras|veranda/i.test(n) ? 'terras' : /balkon/i.test(n) ? 'balkon' : 'tuin';
  const huisje = /tuinhuis|schuur|berging|huisje/i;
  return { soort, auto: soort === 'oprit', tuinhuis: soort === 'tuin' && (room.zones.some((z) => huisje.test(z.naam)) || devices.some((d) => huisje.test(d.naam))) };
}

/**
 * Het voorstel uit Home Assistant (95): elk gebied met iets erin wordt een kamer,
 * op de etage die bij het niveau hoort, en een gebied zonder etage op de begane
 * grond, of buiten als de naam daarop wijst. Een regelgebied hoort bij het gebied
 * waar zijn thermometer en apparaten het vaakst hangen.
 */
export function proposeLayout(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
): Layout {
  const { found, areaOf } = collect(config, registers, states, null);
  const floorById = new Map(registers.floors.map((f) => [f.floor_id, f]));
  const floorOf = (area: HaArea): FloorId => {
    // Een tuin of oprit is buiten, ook als Home Assistant hem op de begane grond zet.
    if (OUTSIDE.test(area.name)) return 'buiten';
    const f = area.floor_id ? floorById.get(area.floor_id) : undefined;
    // Een kelder blijft bij de begane grond, net als een trapkast (besluit 119): de
    // tekening gaat niet onder de grond. Hoger dan de eerste verdieping is de tweede.
    if (f && f.level != null) return f.level <= 0 ? 'bg' : f.level === 1 ? 'e1' : 'e2';
    return 'bg';
  };

  // De naam van een etage komt van de etage op precies dat niveau; een "Dak" op
  // niveau 3 geeft de tweede verdieping geen naam.
  const etages: Partial<Record<FloorId, string>> = {};
  for (const [id, level] of [['bg', 0], ['e1', 1], ['e2', 2]] as const) {
    const f = registers.floors.find((x) => x.level === level && x.name.trim() !== '');
    if (f) etages[id] = f.name.trim();
  }

  const zoneArea = new Map<string, string>();
  for (const zone of config.zones) {
    const votes = new Map<string, number>();
    const ids = [zone.temperature.id, ...zone.actuatorIds.map((id) => config.actuators.find((a) => a.id === id)?.ref.id)];
    for (const id of ids) {
      const area = id ? areaOf(id) : null;
      if (area) votes.set(area, (votes.get(area) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) zoneArea.set(zone.id, best[0]);
  }

  const used = new Set(found.map((f) => f.haArea).filter((a): a is string => a != null));
  const taken = new Set<string>();
  const claimed = new Set<string>();
  const kamers: LayoutRoom[] = [];
  for (const area of registers.areas) {
    const zone = config.zones.find((z) => zoneArea.get(z.id) === area.area_id && !claimed.has(z.id)) ?? null;
    if (!used.has(area.area_id) && zone == null) continue;
    const id = slug(area.area_id || area.name, taken);
    taken.add(id);
    if (zone) claimed.add(zone.id);
    kamers.push({ id, naam: area.name.trim(), etage: floorOf(area), zones: [], regelzone: zone?.id ?? null, haGebied: area.area_id });
  }
  return { versie: 1, etages, kamers, apparaten: {} };
}

/** "2 lampen aan", "Screens 60% dicht", "Er draait niets": over een lijst apparaten. */
export function summarize(devices: readonly HouseDevice[]): HouseSummary {
  const lampenAan = devices.filter((d) => d.soort === 'licht' && d.aan).length;
  const covers = devices.filter((d) => d.soort === 'screen');
  let screens: string | null = null;
  if (covers.length > 0) {
    const stands = new Set(covers.map((c) => c.stand));
    screens = stands.size === 1 ? covers[0]!.stand : covers.some((c) => c.aan) ? 'deels dicht' : 'open';
  }
  const running = devices.filter((d) => d.soort === 'klimaat' && d.aan);
  const klimaat =
    running.length === 0 ? 'Er draait niets' : running.length === 1 ? `${running[0]!.naam}: ${running[0]!.stand}` : `${running.length} apparaten draaien`;
  return { lampenAan, screens, draait: running.length, klimaat };
}

export function buildHouse(
  config: SiteConfig,
  registers: HouseRegisters,
  states: ReadonlyMap<string, HaEntityState>,
  snapshot: DecisionView | null,
  saved: Layout | null = null,
  /** De kleuren van de Hue-scènes, zoals de app ze zag (scene-colors.ts). */
  sceneColors: (sceneId: string, naam: string) => readonly string[] = (_id, naam) => defaultSceneColors(naam),
  /** De plaatjes van de Hue-scènes, als de bewoner die heeft (scene-pictures.ts). */
  scenePicture: (naam: string) => string | null = () => null,
  /** De camera's die de app toont (besluit 109); null is elke camera. */
  cameras: ReadonlySet<string> | null = null,
): HouseReport {
  const { found, groups, successors, unreachable } = collect(config, registers, states, snapshot, cameras);
  const base = saved ?? proposeLayout(config, registers, states);
  // Een lamp die sinds het indelen is uitgezet, geeft zijn plek door aan zijn groep.
  const deviceIds = new Set(found.map((f) => f.device.id));
  const layout: Layout = {
    ...base,
    apparaten: carryOver(base.apparaten, { deviceIds, opvolgers: successors }) as Record<string, LayoutDevice>,
  };
  const areaName = new Map(registers.areas.map((a) => [a.area_id, a.name]));
  const roomByArea = new Map(layout.kamers.filter((k) => k.haGebied).map((k) => [k.haGebied as string, k]));

  const perRoom = new Map<string, HouseDevice[]>();
  const homeless: {
    id: string;
    naam: string;
    soort: DeviceKind;
    voorstel: string | null;
    groepen: readonly string[];
    voorstelKamer: string | null;
  }[] = [];
  const hiddenIds = new Set(layout.verborgen ?? []);
  const hidden: { id: string; naam: string; soort: DeviceKind }[] = [];
  for (const f of found) {
    const own = layout.apparaten[f.device.id];
    const room = own ? layout.kamers.find((k) => k.id === own.kamer) : f.haArea ? roomByArea.get(f.haArea) : undefined;
    const fromHa = shortName(f.haNaam, f.haArea ? (areaName.get(f.haArea) ?? null) : null);
    const naam = own?.naam ?? (room && room.naam !== areaName.get(f.haArea ?? '') ? shortName(fromHa, room.naam) : fromHa);
    if (hiddenIds.has(f.device.id)) {
      hidden.push({ id: f.device.id, naam, soort: f.device.soort });
      continue;
    }
    if (!room) {
      homeless.push({
        id: f.device.id,
        naam,
        soort: f.device.soort,
        voorstel: f.haArea ? (areaName.get(f.haArea) ?? null) : null,
        groepen: f.groepen,
        voorstelKamer: roomForGroups(f.groepen, layout.kamers),
      });
      continue;
    }
    const zone = own?.zone && room.zones.some((z) => z.id === own.zone) ? own.zone : null;
    const list = perRoom.get(room.id) ?? [];
    list.push({ ...f.device, naam, haNaam: f.haNaam, zone, groepen: f.groepen });
    perRoom.set(room.id, list);
  }

  const deviceArea = new Map(registers.devices.map((d) => [d.id, d.area_id]));
  const registry = new Map(registers.entities.map((e) => [e.entity_id, e]));
  const scenes = scenesPerRoom(
    states,
    layout.kamers.map((k) => ({ id: k.id, naam: k.naam, devices: perRoom.get(k.id) ?? [] })),
    (sceneId) => {
      const e = registry.get(sceneId);
      const area = e?.area_id ?? (e?.device_id ? (deviceArea.get(e.device_id) ?? null) : null);
      return area ? (roomByArea.get(area)?.id ?? null) : null;
    },
    sceneColors,
    scenePicture,
  );
  // Batterijen (besluit 122): per apparaat in Home Assistant, bij elk apparaat in een kamer.
  const accu = batteriesPerDevice(registers, states);
  const deviceOf = (entityId: string) => registry.get(entityId)?.device_id ?? null;
  for (const [roomId, list] of perRoom) {
    perRoom.set(roomId, list.map((d) => {
      const dev = deviceOf(d.id);
      const pct = dev ? accu.get(dev) : undefined;
      return pct == null ? d : { ...d, batterijPct: pct };
    }));
  }
  const rooms = layout.kamers.map((k): HouseRoom => {
    const devices = perRoom.get(k.id) ?? [];
    devices.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || Number(b.aan) - Number(a.aan) || a.naam.localeCompare(b.naam, 'nl'));
    const zone = k.regelzone ? config.zones.find((z) => z.id === k.regelzone) : undefined;
    const pz = zone ? snapshot?.explanation.perZone.find((z) => z.zoneId === zone.id) : undefined;
    // Zonder regelgebied meet een meter in de kamer, zoals in de hal of op zolder.
    const meterTemp = devices.find((d) => d.soort === 'meter' && d.meting?.temperatuurC != null);
    // Meten met (besluit 123): het gemiddelde van de gekozen sensoren. Met een
    // regeling rekent de regeling er na de volgende start zelf mee.
    const gekozen = (k.meten ?? []).map((id) => readTemperature(states.get(id), id)).filter((v): v is number => v != null);
    const gekozenC = gekozen.length ? Math.round((gekozen.reduce((a, b) => a + b, 0) / gekozen.length) * 10) / 10 : null;
    const status = zone && snapshot ? roomStatus(config, snapshot, zone, 'nl', true) : null;
    return {
      id: k.id,
      naam: k.naam,
      zoneId: zone?.id ?? null,
      zones: k.zones.map((z) => ({ id: z.id, naam: z.naam })),
      temperatuurC: pz?.temperatureC ?? gekozenC ?? meterTemp?.meting?.temperatuurC ?? null,
      vochtPct: pz?.humidityPct ?? devices.find((d) => d.meting?.vochtPct != null)?.meting?.vochtPct ?? null,
      gemetenDoor: pz?.temperatureC == null && gekozenC == null && meterTemp ? meterTemp.naam : null,
      status: status ? { soort: status.kind, zin: status.zin } : null,
      lampenAan: devices.filter((d) => d.soort === 'licht' && d.aan).length,
      samenvatting: summarize(devices),
      apparaten: devices,
      scenes: scenes.get(k.id) ?? [],
      buiten: k.buiten ?? (k.etage === 'buiten' || OUTSIDE.test(k.naam) ? outsideFromNames(k, devices) : null),
      soort: k.etage === OUTSIDE_FLOOR ? null : (k.soort ?? roomTypeFromNames(k, devices)),
      soortGekozen: k.etage !== OUTSIDE_FLOOR && k.soort != null,
    };
  });

  const floors: HouseFloor[] = [];
  // Van boven naar beneden (besluit 112), en buiten als laatste.
  for (const id of [...floorOrder(layout), OUTSIDE_FLOOR]) {
    const ruimtes = rooms.filter((r) => layout.kamers.find((k) => k.id === r.id)?.etage === id);
    // Een etage zonder kamers alleen als de bewoner hem een naam gaf of zelf
    // toevoegde: dan wil hij er iets mee, en daar komt de eerste kamer.
    if (ruimtes.length === 0 && !(saved && (saved.etages[id] || saved.volgorde?.includes(id)))) continue;
    floors.push({
      id,
      naam: layout.etages[id] ?? floorName(id),
      lampenAan: ruimtes.reduce((n, r) => n + r.lampenAan, 0),
      samenvatting: summarize(ruimtes.flatMap((r) => r.apparaten)),
      ruimtes,
    });
  }

  homeless.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || a.naam.localeCompare(b.naam, 'nl'));
  hidden.sort((a, b) => ORDER[a.soort] - ORDER[b.soort] || a.naam.localeCompare(b.naam, 'nl'));
  // Onder het dak: wat de bewoner koos, of de bovenste etage als die zo heet of het huis drie lagen heeft.
  const binnen = floors.filter((f) => f.id !== 'buiten' && f.ruimtes.length > 0);
  const boven = binnen[0];
  const dakEtage: FloorId | null =
    layout.dak === 'geen' ? null : layout.dak ?? (boven && (binnen.length >= 3 || /zolder|dak|vliering/i.test(boven.naam)) ? boven.id : null);
  // De lijst van batterijen: de naam van het apparaat, en de kamer waar het staat of hoort.
  const kamerVanApparaat = new Map<string, { id: string; naam: string }>();
  for (const room of rooms) for (const d of room.apparaten) {
    const dev = deviceOf(d.id);
    if (dev) kamerVanApparaat.set(dev, { id: room.id, naam: room.naam });
  }
  const apparaatNaam = new Map(registers.devices.map((d) => [d.id, d.name_by_user ?? d.name ?? null]));
  const batterijen: HouseBattery[] = [...accu].map(([id, pct]) => {
    const area = deviceArea.get(id);
    const kamer = kamerVanApparaat.get(id) ?? (area ? (roomByArea.get(area) ?? null) : null);
    return { id, naam: apparaatNaam.get(id) ?? id, pct, kamer: kamer?.naam ?? null, kamerId: kamer?.id ?? null };
  }).sort((a, b) => a.pct - b.pct || a.naam.localeCompare(b.naam, 'nl'));
  return {
    indeling: saved ? 'eigen' : 'voorstel',
    dakEtage,
    etages: floors,
    lampenAan: floors.reduce((n, f) => n + f.lampenAan, 0),
    samenvatting: summarize(floors.flatMap((f) => f.ruimtes.flatMap((r) => r.apparaten))),
    zonderRuimte: homeless,
    lampgroepen: groups.map((g) => ({ id: g.id, naam: g.naam, leden: g.leden, hue: g.hue, overzicht: g.overzicht })),
    verborgen: hidden,
    onvindbaar: unreachable,
    batterijen,
  };
}

/**
 * De lampen die "alles uit" of een knop raakt (besluit 97): alleen wat het huis
 * nu als lamp toont, dus nooit iets wat de bewoner verborg of wat in geen kamer
 * staat. Null als het doel niet bestaat.
 */
export function lampsFor(
  house: HouseReport,
  doel: { readonly soort: 'lamp' | 'kamer' | 'etage' | 'huis'; readonly id: string | null },
): string[] | null {
  const lampsIn = (rooms: readonly HouseRoom[]) => rooms.flatMap((r) => r.apparaten.filter((d) => d.soort === 'licht').map((d) => d.id));
  const rooms = house.etages.flatMap((f) => f.ruimtes);
  switch (doel.soort) {
    case 'huis':
      return lampsIn(rooms);
    case 'etage': {
      const floor = house.etages.find((f) => f.id === doel.id);
      return floor ? lampsIn(floor.ruimtes) : null;
    }
    case 'kamer': {
      const room = rooms.find((r) => r.id === doel.id);
      return room ? lampsIn([room]) : null;
    }
    case 'lamp':
      return lampsIn(rooms).includes(doel.id ?? '') ? [doel.id as string] : null;
  }
}
