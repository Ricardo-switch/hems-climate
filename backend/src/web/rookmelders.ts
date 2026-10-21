/**
 * Rookmelders (21 oktober 2026, schets Wand-Rook): de Nest Protect, en elke
 * melder die in Home Assistant een sensor voor rook of koolmonoxide heeft.
 *
 * Smart Climate leest alleen. Per melder: of hij rook, koolmonoxide of hitte
 * ziet, zijn batterij, wanneer hij voor het laatst getest is en wanneer hij
 * vervangen moet. Ziet er een iets, dan toont elk open scherm een alarm, zoals
 * bij aanbellen (besluit 107), en staat het bij Meldingen; afzetten doe je op
 * de melder of in de app van het merk.
 *
 * Herkend op de klasse van de sensor (`smoke`, `carbon_monoxide`, `heat`), per
 * apparaat in Home Assistant. Alles hier is zuiver; het luisteren doet `main.ts`.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../adapters/homeassistant/discovery.js';

export interface Rookmelder {
  /** De sensor voor rook, of anders die voor koolmonoxide: de id van de melder in de app. */
  readonly id: string;
  readonly deviceId: string | null;
  readonly naam: string;
  readonly rook: string | null;
  readonly co: string | null;
  readonly hitte: string | null;
  /** Een `binary_sensor` met de klasse batterij: aan is een probleem. */
  readonly batterijGoed: string | null;
  /** Een datum: wanneer de melder vervangen moet. */
  readonly vervangen: string | null;
  /** Een datum: de laatste test (zelf, of met de hand). */
  readonly getest: readonly string[];
}

/** Wat een melder nu ziet: rook gaat voor koolmonoxide, en dat voor hitte. */
export type Gevaar = 'rook' | 'co' | 'hitte';

export interface RookmelderNu {
  readonly gevaar: Gevaar | null;
  /** Sinds wanneer, als hij iets ziet. */
  readonly sindsMs: number | null;
  readonly bereikbaar: boolean;
  readonly batterijProbleem: boolean;
  /** `JJJJ-MM-DD`, of null. */
  readonly vervangenVoor: string | null;
  readonly getestOp: string | null;
}

const klasseVan = (e: HaRegistryEntity, states: ReadonlyMap<string, HaEntityState>) =>
  e.device_class ?? e.original_device_class ?? (states.get(e.entity_id)?.attributes['device_class'] as string | undefined) ?? null;

/**
 * De naam van een melder: "Nest Protect (Rookmelder keuken)" heet "Rookmelder
 * keuken"; zonder haakjes de naam van het apparaat.
 */
export function melderNaam(naam: string): string {
  const m = /^\s*(?:nest\s+protect|protect|smoke\s*detector|rookmelder)\s*\((.+)\)\s*$/i.exec(naam);
  return (m ? m[1]! : naam).trim();
}

/** Alle rookmelders in Home Assistant, één per apparaat. */
export function vindRookmelders(entities: readonly HaRegistryEntity[], devices: readonly HaDevice[], states: ReadonlyMap<string, HaEntityState>): Rookmelder[] {
  const naamVan = new Map(devices.map((d) => [d.id, (d.name_by_user ?? d.name ?? '').trim()]));
  const per = new Map<string, HaRegistryEntity[]>();
  for (const e of entities) {
    if (e.disabled_by != null) continue;
    const sleutel = e.device_id ?? `ent:${e.entity_id}`;
    const l = per.get(sleutel);
    if (l) l.push(e);
    else per.set(sleutel, [e]);
  }
  const uit: Rookmelder[] = [];
  for (const [sleutel, lijst] of per) {
    const binair = (klasse: string) => lijst.find((e) => e.entity_id.startsWith('binary_sensor.') && klasseVan(e, states) === klasse)?.entity_id ?? null;
    const rook = binair('smoke');
    const co = binair('carbon_monoxide');
    if (rook == null && co == null) continue;
    const datum = (re: RegExp) => lijst.filter((e) => e.entity_id.startsWith('sensor.') && (klasseVan(e, states) === 'date' || klasseVan(e, states) === 'timestamp') && re.test(`${e.entity_id} ${e.translation_key ?? ''}`)).map((e) => e.entity_id);
    const deviceId = sleutel.startsWith('ent:') ? null : sleutel;
    const ruw = (deviceId ? naamVan.get(deviceId) : '') || String(states.get((rook ?? co)!)?.attributes['friendly_name'] ?? rook ?? co);
    uit.push({
      id: (rook ?? co)!,
      deviceId,
      naam: melderNaam(ruw),
      rook,
      co,
      hitte: binair('heat'),
      batterijGoed: binair('battery'),
      vervangen: datum(/replace/)[0] ?? null,
      getest: datum(/test/),
    });
  }
  return uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

const aan = (s: HaEntityState | undefined) => s?.state === 'on';
const ms = (s: HaEntityState | undefined) => {
  const t = s ? Date.parse(s.last_changed) : NaN;
  return Number.isFinite(t) ? t : null;
};
/** Een datum uit een sensor als `JJJJ-MM-DD`, of null. */
const dag = (s: HaEntityState | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s.state) ? s.state.slice(0, 10) : null);

/** Wat een melder nu ziet en hoe hij erbij staat. */
export function rookmelderNu(m: Rookmelder, state: (entityId: string) => HaEntityState | undefined): RookmelderNu {
  const rook = m.rook ? state(m.rook) : undefined;
  const co = m.co ? state(m.co) : undefined;
  const hitte = m.hitte ? state(m.hitte) : undefined;
  const gevaar: Gevaar | null = aan(rook) ? 'rook' : aan(co) ? 'co' : aan(hitte) ? 'hitte' : null;
  const bron = gevaar === 'rook' ? rook : gevaar === 'co' ? co : gevaar === 'hitte' ? hitte : undefined;
  const hoofd = rook ?? co;
  const getest = m.getest.map((id) => dag(state(id))).filter((d): d is string => d != null).sort();
  return {
    gevaar,
    sindsMs: gevaar ? ms(bron) : null,
    bereikbaar: hoofd != null && hoofd.state !== 'unavailable' && hoofd.state !== 'unknown',
    batterijProbleem: m.batterijGoed ? aan(state(m.batterijGoed)) : false,
    vervangenVoor: m.vervangen ? dag(state(m.vervangen)) : null,
    getestOp: getest.at(-1) ?? null,
  };
}

/** Alle sensoren waar het alarm naar luistert. */
export function alarmSensoren(melders: readonly Rookmelder[]): Set<string> {
  return new Set(melders.flatMap((m) => [m.rook, m.co, m.hitte].filter((x): x is string => x != null)));
}

/** Het woord voor het gevaar, in een zin: "Rook in de keuken". */
export const GEVAAR_WOORD: Readonly<Record<Gevaar, string>> = { rook: 'Rook', co: 'Koolmonoxide', hitte: 'Hitte' };
