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
import { createInterface, type Interface } from 'node:readline';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';

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
  /** Temperatuur en vraag per zone. `reason` alleen op volledige records. */
  readonly zones: readonly {
    id: string;
    temperatureC: number | null;
    demand: string;
    reason?: string;
    /** Luchtvochtigheid, wanneer de zone er een sensor voor heeft. */
    humidityPct?: number;
  }[];
  /** Wat de apparaten op dat moment werkelijk deden, op actuator-id. */
  readonly observed: Readonly<Record<string, string>>;
  /** De uitleg van het oude systeem, voortgedragen tot hij wijzigt. */
  readonly legacy: string | null;
  /** Wat de arbiter zou sturen. Alleen op momenten dat het besluit wijzigde. */
  readonly commands: readonly { kind: string; actuatorId?: string; action?: string }[];
  /** Waarom een voorstel het niet haalde. Idem. */
  readonly rejected: readonly { actuatorId: string; action: string; blockedBy: string }[];
  /** Aanvaarde voorstellen, voor het bepalen van wat er zou draaien. */
  readonly accepted: readonly {
    actuatorId: string;
    action: string;
    /** Welke strategie het voorstelde. Alleen op volledige records. */
    strategyId?: string;
  }[];
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
  /** Buitentemperatuur, of null. Waarneming; de regeling gebruikt hem niet. */
  readonly outdoorC: number | null;
  /** Opbrengst van de panelen in W, als maat voor instraling (besluit 47). */
  readonly solarW: number | null;
  /** Of dit een volledig record was; korte records dragen veel voort. */
  readonly full: boolean;
  /**
   * Of de bewoner op dat moment de knoppen had overgenomen.
   *
   * In een hands-off stand stelt de arbiter niets voor en stuurt hij niets, dus
   * er valt niets te vergelijken: wat er draait is wat de bewoner wilde. Een
   * episode maken van "het oude systeem koelde en ik zou stoppen" is dan geen
   * meningsverschil tussen twee regelaars maar een meningsverschil met de
   * bewoner, en dat hoort niet in dit rapport.
   */
  readonly handsOff: boolean;
  /**
   * De stand van elk uitstelbaar apparaat (besluit 98), op id: `running`,
   * `would_start`, `waiting`, `not_ready` of `unknown`. Leeg in logboeken van
   * vóór de uitstelbare apparaten.
   */
  readonly deferrables: Readonly<Record<string, string>>;
  /**
   * De boiler en de jacuzzi (besluit 186), op id: de stand en of hij stookte.
   * Leeg in logboeken van daarvoor.
   */
  readonly heatStores?: Readonly<Record<string, { readonly state: string; readonly heating: boolean }>>;
}

/** Modi waarin de regeling zich terugtrekt. Spiegelt `HANDS_OFF_MODES`. */
const HANDS_OFF_MODES: ReadonlySet<string> = new Set(['handmatig']);

/**
 * Herkent de handmatige stand in logboeken van vóór de vertaalfout-fix.
 *
 * Tot september 2026 las `mapping.ts` alleen `input_select.verwarming_modus`,
 * en niet `input_select.koel_strategie`. Die logboeken schreven dus `dag` waar
 * de bewoner op het dashboard 'Handmatig koelen' had staan.
 *
 * De uitleg van het oude systeem staat er wél in, en die is eenduidig: in
 * `sensor.airco_assist_reden` is dit de éérste tak van de sjabloon —
 *
 *   {%- if koel_strategie == 'Handmatig koelen' -%}
 *     Handmatig koelen actief:…
 *
 * — dus deze tekst verschijnt precies dan, en alleen dan, als die stand aan
 * stond. Daarmee is de stand uit het logboek zelf terug te lezen, zonder
 * verbinding met Home Assistant (besluit 11).
 *
 * Weghalen zodra er geen logboeken van vóór die fix meer worden meegenomen.
 */
const LEGACY_MANUAL_PREFIX = 'Handmatig koelen actief';

function handsOffAt(mode: string, legacy: string | null): boolean {
  if (HANDS_OFF_MODES.has(mode)) return true;
  return legacy != null && legacy.startsWith(LEGACY_MANUAL_PREFIX);
}

interface RawRecord {
  t: number;
  changed?: boolean;
  mode?: string;
  budget?: Moment['budget'];
  zones?: {
    zoneId: string;
    temperatureC: number | null;
    demand: string;
    reason?: string;
    humidityPct?: number | null;
  }[];
  zonesT?: [string, number | null, string, (number | null)?][];
  obs?: Record<string, string>;
  legacy?: string;
  commands?: { kind: string; actuatorId?: string; action?: string }[];
  rejected?: { intent: { actuatorId: string; action: string }; blockedBy: string }[];
  accepted?: { actuatorId: string; action: string; strategyId?: string }[];
  failsafe?: { active: boolean };
  buitenC?: number | null;
  zonW?: number | null;
  /** Per uitstelbaar apparaat: id, stand, reden en soms "klaar voor". */
  uitstel?: [string, string, string, number?][];
  /** Per warmtebuffer: id, stand, reden, temperatuur en of hij stookt (besluit 186). */
  warmte?: [string, string, string, number | null, boolean][];
}

const EMPTY_BUDGET = {
  availableW: 0,
  allocatedW: 0,
  surplusW: 0,
  reclaimableW: 0,
  gridPowerW: 0,
} as const;

const DECISION_LOG = /^decisions-(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/;
const HISTORY = /^history-(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/;

/**
 * Per dag één bestand, gewoon of gecomprimeerd, op datum gesorteerd.
 *
 * Dagen ouder dan een week worden gecomprimeerd (besluit 58). Elke lezer gaat
 * via deze functie, zodat geen analyse ongemerkt de oude dagen mist.
 *
 * Staan beide er — een compressie die halverwege werd onderbroken — dan telt
 * de `.gz`: die ontstaat pas met een rename als hij compleet is, en de gewone
 * wordt daarna weggehaald. Beide tellen zou die dag dubbel meenemen.
 */
async function dayFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const perDay = new Map<string, string>();
  for (const name of await readdir(dir)) {
    const m = pattern.exec(name);
    if (!m) continue;
    const day = m[1]!;
    if (!perDay.has(day) || m[2] != null) perDay.set(day, name);
  }
  return [...perDay.keys()].sort().map((day) => join(dir, perDay.get(day)!));
}

/** Alle dagbestanden van het beslislogboek. */
export function findLogFiles(dir: string): Promise<string[]> {
  return dayFiles(dir, DECISION_LOG);
}

/** De dagbestanden met ruwe historie naast het logboek (besluit 52). */
export function findHistoryFiles(dir: string): Promise<string[]> {
  return dayFiles(dir, HISTORY);
}

/** Leest een dagbestand regel voor regel, gecomprimeerd of niet. */
export function linesOf(path: string): Interface {
  const source = createReadStream(path);
  return createInterface({
    input: path.endsWith('.gz') ? source.pipe(createGunzip()) : source,
    crlfDelay: Infinity,
  });
}

/**
 * Wat een kort record weglaat en de lezer dus voortdraagt, van regel naar regel
 * en van dagbestand naar dagbestand.
 *
 * Een eigen object, zodat wie halverwege wil stoppen en later verdergaan (de
 * tussenstand van de terugblik, besluit 63) het kan bewaren en teruggeven.
 */
export interface ReaderCarry {
  lastLegacy: string | null;
  lastObserved: Record<string, string>;
  arbiterAction: Record<string, string>;
}

export function newReaderCarry(): ReaderCarry {
  return { lastLegacy: null, lastObserved: {}, arbiterAction: {} };
}

/**
 * Leest de logboeken en levert momenten op, in tijdsvolgorde.
 *
 * Kapotte regels worden overgeslagen in plaats van fataal: een logboek dat
 * halverwege een regel is afgekapt doordat de container werd gestopt mag de
 * hele analyse niet blokkeren.
 *
 * `carry` begint leeg, of bij wat een eerdere lezing achterliet; na afloop
 * staat erin waar deze lezing eindigde.
 */
export async function* readMoments(
  files: readonly string[],
  carry: ReaderCarry = newReaderCarry(),
): AsyncGenerator<Moment> {
  for (const file of files) {
    for await (const line of linesOf(file)) {
      if (line.trim() === '') continue;
      let raw: RawRecord;
      try {
        raw = JSON.parse(line) as RawRecord;
      } catch {
        continue;
      }
      if (typeof raw.t !== 'number') continue;

      if (raw.legacy != null) carry.lastLegacy = raw.legacy;
      if (raw.obs) carry.lastObserved = raw.obs;

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
        carry.arbiterAction = next;
      }

      const zones = raw.zones
        ? raw.zones.map((z) => ({
            id: z.zoneId,
            temperatureC: z.temperatureC,
            demand: z.demand,
            ...(z.reason != null ? { reason: z.reason } : {}),
            ...(z.humidityPct != null ? { humidityPct: z.humidityPct } : {}),
          }))
        : (raw.zonesT ?? []).map(([id, temperatureC, demand, humidityPct]) => ({
            id,
            temperatureC,
            demand,
            ...(humidityPct == null ? {} : { humidityPct }),
          }));

      const mode = raw.mode ?? 'onbekend';

      yield {
        tMs: raw.t,
        mode,
        budget: raw.budget
          ? { ...EMPTY_BUDGET, ...raw.budget }
          : EMPTY_BUDGET,
        zones,
        observed: carry.lastObserved,
        legacy: carry.lastLegacy,
        commands: raw.commands ?? [],
        rejected: (raw.rejected ?? []).map((r) => ({
          actuatorId: r.intent.actuatorId,
          action: r.intent.action,
          blockedBy: r.blockedBy,
        })),
        accepted: raw.accepted ?? [],
        arbiterAction: carry.arbiterAction,
        failsafe: raw.failsafe?.active === true,
        outdoorC: raw.buitenC ?? null,
        solarW: raw.zonW ?? null,
        full: raw.changed === true,
        handsOff: handsOffAt(mode, carry.lastLegacy),
        deferrables: Object.fromEntries((raw.uitstel ?? []).map(([id, state]) => [id, state])),
        heatStores: Object.fromEntries((raw.warmte ?? []).map(([id, state, , , heating]) => [id, { state, heating: heating === true }])),
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
  // Handen af betekent: geen voorstel, geen commando, en dus ook geen mening
  // over wat er draait. De wens van de arbiter ís hier de waarneming. Zonder
  // dit zou een eerder besluit blijven doorwerken en een handmatig aangezette
  // airco als afwijking gaan tellen.
  if (moment.handsOff) return observedRunning(moment.observed[actuatorId]);

  const wanted = moment.arbiterAction[actuatorId];
  if (wanted != null) return wanted === 'heat' || wanted === 'cool';
  // Geen aanvaard voorstel: er gaat niets uit, dus het apparaat houdt aan wat
  // het deed. Dat als "teruggeschakeld" tellen zou de uitkomst mooier maken
  // dan hij is.
  return observedRunning(moment.observed[actuatorId]);
}
