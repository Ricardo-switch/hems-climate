/**
 * Het beslislogboek teruglezen tot een reeks momenten.
 *
 * Het logboek kent twee soorten regels: een volledige wanneer het besluit
 * wijzigt, en een korte wanneer er niets verandert. Die korte regel laat weg wat
 * hetzelfde bleef, dus de lezer moet dat voortdragen. Dat is de prijs van een
 * logboek dat een winter lang meegaat zonder de schijf te vullen.
 */

import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

/** Eén moment uit het logboek, met alles ingevuld wat de korte regel weglaat. */
export interface Moment {
  readonly tMs: number;
  readonly mode: string;
  readonly budget: {
    readonly availableW: number;
    readonly allocatedW: number;
    readonly surplusW: number;
    readonly reclaimableW: number;
    /** Netvermogen; negatief bij teruglevering. */
    readonly gridPowerW: number;
  };
  /** Temperatuur en vraag per zone. */
  readonly zones: readonly { id: string; temperatureC: number | null; demand: string }[];
  /** Wat de apparaten op dat moment werkelijk deden, op actuator-id. */
  readonly observed: Readonly<Record<string, string>>;
  /** De uitleg van het oude systeem, voortgedragen tot hij wijzigt. */
  readonly legacy: string | null;
  /** Wat de arbiter zou sturen. Alleen op momenten dat het besluit wijzigde. */
  readonly commands: readonly { kind: string; actuatorId?: string; action?: string }[];
  /** Waarom een voorstel het niet haalde. Idem. */
  readonly rejected: readonly { actuatorId: string; action: string; blockedBy: string }[];
  /** Aanvaarde voorstellen, voor het bepalen van wat er zou draaien. */
  readonly accepted: readonly { actuatorId: string; action: string }[];
  /**
   * Wat de arbiter voor elk apparaat wil, voortgedragen over korte records.
   *
   * In schaduwmodus wordt zijn commando nooit uitgevoerd, dus zijn wens blijft
   * gelden tot hij van gedachten verandert. Een kort record betekent "het
   * besluit is niet gewijzigd" — dat is iets anders dan "er is geen besluit".
   * Zonder dit voortdragen zou elke afwijking na één minuut lijken op te lossen.
   *
   * Ontbreekt een apparaat, dan is er geen voorstel aanvaard en houdt het
   * apparaat gewoon aan wat het deed.
   */
  readonly arbiterAction: Readonly<Record<string, string>>;
  readonly failsafe: boolean;
  /** Of dit een volledig record was; korte records dragen veel voort. */
  readonly full: boolean;
}

interface RawRecord {
  t: number;
  changed?: boolean;
  mode?: string;
  budget?: Moment['budget'];
  zones?: { zoneId: string; temperatureC: number | null; demand: string }[];
  zonesT?: [string, number | null, string][];
  obs?: Record<string, string>;
  legacy?: string;
  commands?: { kind: string; actuatorId?: string; action?: string }[];
  rejected?: { intent: { actuatorId: string; action: string }; blockedBy: string }[];
  accepted?: { actuatorId: string; action: string }[];
  failsafe?: { active: boolean };
}

const EMPTY_BUDGET = {
  availableW: 0,
  allocatedW: 0,
  surplusW: 0,
  reclaimableW: 0,
  gridPowerW: 0,
} as const;

/** Alle dagbestanden in een map, op datum gesorteerd. */
export async function findLogFiles(dir: string): Promise<string[]> {
  const names = (await readdir(dir))
    .filter((n) => /^decisions-\d{4}-\d{2}-\d{2}\.ndjson$/.test(n))
    .sort();
  return names.map((n) => join(dir, n));
}

/**
 * Leest de logboeken en levert momenten op, in tijdsvolgorde.
 *
 * Kapotte regels worden overgeslagen in plaats van fataal: een logboek dat
 * halverwege een regel is afgekapt doordat de container werd gestopt mag de
 * hele analyse niet blokkeren.
 */
export async function* readMoments(
  files: readonly string[],
): AsyncGenerator<Moment> {
  // Wat een kort record weglaat, dragen we voort.
  let lastLegacy: string | null = null;
  let lastObserved: Record<string, string> = {};
  let arbiterAction: Record<string, string> = {};

  for (const file of files) {
    const rl = createInterface({
      input: createReadStream(file, 'utf-8'),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim() === '') continue;
      let raw: RawRecord;
      try {
        raw = JSON.parse(line) as RawRecord;
      } catch {
        continue;
      }
      if (typeof raw.t !== 'number') continue;

      if (raw.legacy != null) lastLegacy = raw.legacy;
      if (raw.obs) lastObserved = raw.obs;

      // Alleen een volledig record herziet de wens van de arbiter.
      if (raw.changed === true) {
        const next: Record<string, string> = {};
        for (const intent of raw.accepted ?? []) {
          next[intent.actuatorId] = intent.action;
        }
        // Een uitgaand commando is stelliger dan een aanvaard voorstel.
        for (const c of raw.commands ?? []) {
          if (c.kind === 'setAction' && c.actuatorId && c.action) {
            next[c.actuatorId] = c.action;
          }
        }
        arbiterAction = next;
      }

      const zones = raw.zones
        ? raw.zones.map((z) => ({
            id: z.zoneId,
            temperatureC: z.temperatureC,
            demand: z.demand,
          }))
        : (raw.zonesT ?? []).map(([id, temperatureC, demand]) => ({
            id,
            temperatureC,
            demand,
          }));

      yield {
        tMs: raw.t,
        mode: raw.mode ?? 'onbekend',
        budget: raw.budget
          ? { ...EMPTY_BUDGET, ...raw.budget }
          : EMPTY_BUDGET,
        zones,
        observed: lastObserved,
        legacy: lastLegacy,
        commands: raw.commands ?? [],
        rejected: (raw.rejected ?? []).map((r) => ({
          actuatorId: r.intent.actuatorId,
          action: r.intent.action,
          blockedBy: r.blockedBy,
        })),
        accepted: raw.accepted ?? [],
        arbiterAction,
        failsafe: raw.failsafe?.active === true,
        full: raw.changed === true,
      };
    }
  }
}

/** Draaide dit apparaat volgens de waarneming? */
export function observedRunning(observed: string | undefined): boolean {
  if (observed == null || observed === 'onbekend' || observed === 'off') return false;
  const [state, setpointRaw] = observed.split('@');
  if (state !== 'heat' && state !== 'cool') return false;

  // Dezelfde standby-afspraak als in de rest van het project: verwarmen op 18 of
  // lager en koelen op 25 of hoger betekende in het oude systeem "aan, maar
  // vraagt niets". Dat telt niet als draaien.
  const setpoint = setpointRaw == null ? null : Number(setpointRaw);
  if (setpoint != null && Number.isFinite(setpoint)) {
    if (state === 'heat' && setpoint <= 18) return false;
    if (state === 'cool' && setpoint >= 25) return false;
  }
  return true;
}

/**
 * Wat er na dít besluit zou draaien.
 *
 * Let op het verschil met "welk voorstel is aanvaard": houdt de minimale
 * draaitijd het afschakelen tegen, dan gaat er geen commando uit en blijft het
 * apparaat gewoon aan. Dat als "teruggeschakeld" tellen zou de uitkomst mooier
 * maken dan hij is.
 */
export function arbiterRunning(moment: Moment, actuatorId: string): boolean {
  const wanted = moment.arbiterAction[actuatorId];
  if (wanted != null) return wanted === 'heat' || wanted === 'cool';
  // Geen aanvaard voorstel: er gaat niets uit, dus het apparaat houdt aan wat
  // het deed. Dat als "teruggeschakeld" tellen zou de uitkomst mooier maken
  // dan hij is.
  return observedRunning(moment.observed[actuatorId]);
}
