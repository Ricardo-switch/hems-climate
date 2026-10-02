/**
 * Wie zelf ingrijpt, wordt herkend en met rust gelaten (besluit 74).
 *
 * Het oude systeem zet een apparaat dat de bewoner zelf bedient na een paar
 * minuten terug. Hier valt een overgenomen apparaat buiten de regeling tot een
 * natuurlijk eindpunt, en de rest regelt door.
 *
 * Drie stukken, alle drie puur:
 *
 * - `isOverridden`: geldt er nu een ingreep voor dit apparaat? De kern leest
 *   dat uit `SystemState.residentOverrides`; de adapter vult het.
 * - `overrideEndMs`: tot wanneer een ingreep duurt, voor elke keuze die de
 *   bewoner kan maken.
 * - `classifyDeviation`: is een verschil tussen wat de regeling stuurde en wat
 *   het apparaat doet een ingreep, een opdracht die nog onderweg is, of een
 *   storing? Dat beslist de adapter; hier staat alleen de regel.
 *
 * In de schaduwmodus wordt er niets herkend: daar voert niemand de opdrachten
 * van de arbiter uit, dus elk apparaat zou er voortdurend "anders" bij staan.
 * Het aansluiten hoort bij stap B, waar de opdrachten echt uitgaan.
 */

import type { Action, SiteConfig } from './model.js';
import type { ResidentOverride, SystemState } from './state.js';

export type { ResidentOverride };

/** Geldt er op dit moment een ingreep voor dit apparaat? */
export function isOverridden(state: SystemState, actuatorId: string): boolean {
  const o = state.residentOverrides?.[actuatorId];
  if (!o) return false;
  return o.untilMs == null || o.untilMs > state.nowMs;
}

/** De ingrepen die nu gelden, voor de uitleg. */
export function activeOverrides(
  state: SystemState,
): readonly ({ readonly actuatorId: string } & ResidentOverride)[] {
  return Object.entries(state.residentOverrides ?? {})
    .filter(([id]) => isOverridden(state, id))
    .map(([actuatorId, o]) => ({ actuatorId, sinceMs: o.sinceMs, untilMs: o.untilMs }))
    .sort((a, b) => a.actuatorId.localeCompare(b.actuatorId));
}

/* ------------------------------------------------------------ eindpunt */

/**
 * Hoe lang de bewoner het apparaat houdt.
 *
 * - `oneHour`: een uur.
 * - `tonight`: tot de nacht begint (`schedule.nightFromHour`).
 * - `untilReturned`: tot hij het teruggeeft; geen eindtijd.
 * - `nextDayPart`: tot het volgende dagdeel; wat geldt als de bewoner niets kiest.
 */
export type OverrideChoice = 'oneHour' | 'tonight' | 'untilReturned' | 'nextDayPart';

const HOUR_MS = 3_600_000;
const STEP_MS = 15 * 60_000;

/** Uur en minuut in de tijdzone van de installatie. */
function localHourMinute(timezone: string, atMs: number): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(atMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isInteger(hour) && Number.isInteger(minute)) return { hour, minute };
  } catch {
    // Onbekende tijdzone: de configuratiecontrole hoort dat te vangen.
  }
  const d = new Date(atMs);
  return { hour: d.getHours(), minute: d.getMinutes() };
}

/**
 * Het eerstvolgende hele uur, na `nowMs`, waarop een van deze uren begint.
 *
 * In stappen van een kwartier, zodat ook een tijdzone met een half uur verschil
 * klopt; hooguit twee dagen vooruit. Vindt hij niets, dan over 24 uur.
 */
function nextLocalHour(timezone: string, nowMs: number, hours: readonly number[]): number {
  const wanted = new Set(hours);
  const first = Math.floor(nowMs / STEP_MS) * STEP_MS + STEP_MS;
  for (let t = first; t <= nowMs + 48 * HOUR_MS; t += STEP_MS) {
    const { hour, minute } = localHourMinute(timezone, t);
    if (minute === 0 && wanted.has(hour)) return t;
  }
  return nowMs + 24 * HOUR_MS;
}

/** Wanneer een ingreep met deze keuze eindigt, of null voor "tot ik hem teruggeef". */
export function overrideEndMs(
  choice: OverrideChoice,
  nowMs: number,
  config: Pick<SiteConfig, 'timezone' | 'schedule'>,
): number | null {
  const { preheatFromHour, dayFromHour, nightFromHour } = config.schedule;
  switch (choice) {
    case 'oneHour':
      return nowMs + HOUR_MS;
    case 'tonight':
      return nextLocalHour(config.timezone, nowMs, [nightFromHour]);
    case 'untilReturned':
      return null;
    case 'nextDayPart':
      return nextLocalHour(config.timezone, nowMs, [preheatFromHour, dayFromHour, nightFromHour]);
  }
}

/* ------------------------------------------------------------ herkennen */

/** Een stand van een apparaat: wat het doet en op welk setpoint. */
export interface DeviceSetting {
  readonly action: Action;
  readonly setpointC: number | null;
}

/** De laatste opdracht van de regeling aan een apparaat. */
export interface LastCommand {
  /** Wat de regeling vroeg. */
  readonly wanted: DeviceSetting;
  /** Hoe het apparaat erbij stond vlak voor de opdracht. */
  readonly before: DeviceSetting;
  readonly atMs: number;
}

export interface DeviationMargins {
  /** Zo lang mag een apparaat over een opdracht doen. */
  readonly graceMs: number;
  /** Zoveel mag een setpoint afwijken, voor afronding door het apparaat. */
  readonly setpointToleranceC: number;
}

export const DEFAULT_MARGINS: DeviationMargins = { graceMs: 2 * 60_000, setpointToleranceC: 0.5 };

/**
 * - `same`: het apparaat staat zoals de regeling het wilde.
 * - `pending`: het staat nog anders, maar de opdracht is net gegeven.
 * - `fault`: het staat nog zoals vóór de opdracht; het voerde hem niet uit.
 * - `resident`: het staat anders dan gevraagd én anders dan ervoor. Iemand heeft
 *   het zelf bediend.
 */
export type Deviation = 'same' | 'pending' | 'fault' | 'resident';

function matches(a: DeviceSetting, b: DeviceSetting, toleranceC: number): boolean {
  if (a.action !== b.action) return false;
  // Uit heeft geen setpoint dat ertoe doet; en een opdracht zonder setpoint
  // vraagt er ook niet om.
  if (a.action === 'off' || a.setpointC == null || b.setpointC == null) return true;
  return Math.abs(a.setpointC - b.setpointC) <= toleranceC;
}

/**
 * Wat een verschil tussen opdracht en apparaat betekent.
 *
 * Zonder opdracht valt er niets te vergelijken: wat het apparaat doet, is dan
 * gewoon zijn stand, en de regeling begint daarvandaan (49b).
 *
 * Bij twijfel wint de ingreep (besluit 74). Een apparaat ten onrechte met rust
 * laten is zichtbaar en onschuldig; de bewoner overrulen is precies wat hier
 * wordt opgelost. Alleen een apparaat dat exact blijft staan waar het stond, is
 * een storing: de bewoner verandert iets, een storing laat het staan.
 */
export function classifyDeviation(
  last: LastCommand | null,
  observed: DeviceSetting,
  nowMs: number,
  margins: DeviationMargins = DEFAULT_MARGINS,
): Deviation {
  if (last == null) return 'same';
  if (matches(last.wanted, observed, margins.setpointToleranceC)) return 'same';
  if (nowMs - last.atMs < margins.graceMs) return 'pending';
  if (matches(last.before, observed, margins.setpointToleranceC)) return 'fault';
  return 'resident';
}
