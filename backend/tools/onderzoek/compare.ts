/**
 * Vergelijkt het besluit van de arbiter met wat het oude systeem op dat moment
 * werkelijk deed.
 *
 * Twee bronnen naast elkaar: de feitelijke stand van de airco's uit de
 * geschiedenis, en de tekst die het oude systeem zelf als verklaring toonde in
 * `sensor.airco_assist_reden`. De eerste zegt wat er gebeurde, de tweede wat
 * het systeem dacht dat het deed.
 */

import type { Action } from '../../src/core/model.js';
import type { Decision } from '../../src/core/decision.js';

/** De assist-apparaten; alleen daarover doen beide systemen uitspraken. */
export const ASSIST_IDS = ['ac-woonkamer', 'ac-zolder'] as const;
export type AssistId = (typeof ASSIST_IDS)[number];

/** Grofmazige indeling van de verklaringstekst van het oude systeem. */
export const LEGACY_CATEGORIES = [
  'koelen-actief',
  'verwarmen-actief',
  'heat-assist',
  'standby',
  'wacht-op-overschot',
  'gepauzeerd-import',
  'op-temperatuur',
  'zon-onder',
  'uit',
  'overig',
] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

export function classifyLegacyReason(raw: string | null): LegacyCategory {
  if (raw == null) return 'overig';
  const s = raw.toLowerCase();
  if (s.includes('gepauzeerd')) return 'gepauzeerd-import';
  if (s.includes('op temperatuur')) return 'op-temperatuur';
  if (s.includes('zon is onder')) return 'zon-onder';
  if (s.includes('wacht op overschot')) return 'wacht-op-overschot';
  if (s.includes('heat-assist')) return 'heat-assist';
  if (s.includes('standby')) return 'standby';
  if (s.includes('koelen actief') || s.includes('pv-koelen actief')) {
    return 'koelen-actief';
  }
  if (s.includes('pv-verwarmen actief')) return 'verwarmen-actief';
  if (s.includes('staan momenteel uit') || s.includes('nest op eco')) return 'uit';
  return 'overig';
}

/** Wat de arbiter voor dit apparaat wil, na arbitrage. */
export function intendedAction(decision: Decision, actuatorId: string): Action | null {
  const accepted = decision.accepted.find((i) => i.actuatorId === actuatorId);
  return accepted?.action ?? null;
}

export function isDrawingPower(action: Action | null): boolean {
  return action === 'heat' || action === 'cool';
}

export interface TickComparison {
  readonly tMs: number;
  readonly mode: string;
  readonly surplusW: number;
  readonly availableW: number;
  readonly allocatedW: number;
  readonly gridPowerW: number;
  readonly legacy: LegacyCategory;
  /** Feitelijke stand per assist-apparaat in de geschiedenis. */
  readonly legacyRunning: Readonly<Record<AssistId, boolean>>;
  readonly legacyPowerW: Readonly<Record<AssistId, number>>;
  /** Wat de arbiter zou willen. */
  readonly arbiterRunning: Readonly<Record<AssistId, boolean>>;
  /** Hoeveel het oude systeem boven het beschikbare budget zat, in W. */
  readonly legacyOverBudgetW: number;
  readonly failsafe: boolean;
}

export interface Totals {
  ticks: number;
  minutesPerTick: number;
  /** Ticks waarin beide airco's tegelijk vermogen vroegen. */
  legacyBothRunning: number;
  /** Daarvan: ticks waarin het beschikbare vermogen dat niet dekte. */
  legacyBothOverBudget: number;
  /** Netto-import toe te rekenen aan draaien boven budget, in Wh. */
  legacyOverBudgetWh: number;
  arbiterBothRunning: number;
  agree: Record<AssistId, number>;
  arbiterStricter: Record<AssistId, number>;
  arbiterLooser: Record<AssistId, number>;
  failsafeTicks: number;
  byLegacyCategory: Record<string, number>;
  /** Ticks waarop het oude systeem airco's liet draaien terwijl er werd geimporteerd. */
  legacyImportingTicks: number;
  legacyImportWh: number;
  /** Daarvan: waar de arbiter minstens een apparaat teruggeschakeld zou hebben. */
  arbiterWouldShedTicks: number;
  arbiterWouldSaveWh: number;
  /** Moet nul blijven: de arbiter mag nooit boven zijn eigen budget toewijzen. */
  arbiterOverAllocatedTicks: number;
}

export function emptyTotals(minutesPerTick: number): Totals {
  return {
    ticks: 0,
    minutesPerTick,
    legacyBothRunning: 0,
    legacyBothOverBudget: 0,
    legacyOverBudgetWh: 0,
    arbiterBothRunning: 0,
    agree: { 'ac-woonkamer': 0, 'ac-zolder': 0 },
    arbiterStricter: { 'ac-woonkamer': 0, 'ac-zolder': 0 },
    arbiterLooser: { 'ac-woonkamer': 0, 'ac-zolder': 0 },
    failsafeTicks: 0,
    byLegacyCategory: {},
    legacyImportingTicks: 0,
    legacyImportWh: 0,
    arbiterWouldShedTicks: 0,
    arbiterWouldSaveWh: 0,
    arbiterOverAllocatedTicks: 0,
  };
}

export function accumulate(totals: Totals, c: TickComparison): void {
  totals.ticks += 1;
  if (c.failsafe) totals.failsafeTicks += 1;
  totals.byLegacyCategory[c.legacy] = (totals.byLegacyCategory[c.legacy] ?? 0) + 1;

  const bothLegacy = ASSIST_IDS.every((id) => c.legacyRunning[id]);
  if (bothLegacy) totals.legacyBothRunning += 1;
  if (ASSIST_IDS.every((id) => c.arbiterRunning[id])) totals.arbiterBothRunning += 1;

  if (bothLegacy && c.legacyOverBudgetW > 0) totals.legacyBothOverBudget += 1;

  for (const id of ASSIST_IDS) {
    const legacy = c.legacyRunning[id];
    const mine = c.arbiterRunning[id];
    if (legacy === mine) totals.agree[id] += 1;
    else if (legacy && !mine) totals.arbiterStricter[id] += 1;
    else totals.arbiterLooser[id] += 1;
  }
}
