/**
 * Uitstelbare apparaten: de droger draait op zon, via dezelfde budgetten als de
 * airco's (besluit 98). Eerst in de schaduw.
 *
 * Een uitstelbaar apparaat draait één programma en stopt dan; halverwege
 * pauzeren kan niet. De bewoner kiest een programma, sluit de deur en zet "start
 * op afstand" aan. Vanaf dat moment beslist Smart Climate wanneer het begint:
 *
 * - **op zon**, als het overschot na de airco's het apparaat draagt;
 * - **uiterlijk om `latestStart`**, ook zonder zon, zoals de oude automatisering
 *   om 15:00 deed;
 * - **nooit** zonder "start op afstand", in de failsafe, in een stand waarin de
 *   bewoner de regeling terugtrok, of als de hoofdzekering het niet draagt.
 *
 * Hooguit één start per beslissing (besluit 68): is er deze ronde al een airco
 * gestart, of loopt de stabilisatie, dan wacht de droger een ronde. Comfort gaat
 * voor (besluit 85): de droger krijgt alleen wat de airco's overlaten.
 *
 * Dit geeft alleen uitleg: wat de droger nu zou doen en waarom. Een opdracht
 * komt er pas met stap B, via een eigen schrijfdeur die alleen de startknop van
 * dit apparaat kent (besluit 98).
 */

import type { DecisionContext } from './context.js';
import type { Command, DeferrableExplanation } from './decision.js';
import { isHandsOff } from './model.js';

/**
 * De bedrijfsstatus in woorden. Home Connect geeft "...OperationState.Run" of een
 * vertaling; welke dit huis geeft, is pas te zien als de droger draait. Daarom
 * ruim herkend, op het laatste deel.
 */
const RUNNING = new Set(['run', 'running', 'delayedstart', 'draait', 'bezig']);
const FINISHED = new Set(['finished', 'voltooid', 'afgerond']);

function lastWord(state: string): string {
  return (state.split('.').pop() ?? state).trim().toLowerCase().replace(/\s+/g, '');
}

function localMinutes(timezone: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(atMs);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** "15:00" → 900. */
function minutesOf(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

const isOn = (a: string | undefined) => a === 'heat' || a === 'cool';

export function deferrableDecisions(ctx: DecisionContext, allocatedW: number, commands: readonly Command[]): DeferrableExplanation[] {
  const list = ctx.config.deferrables ?? [];
  if (list.length === 0) return [];
  // Startte deze beslissing al een airco (besluit 68)?
  const started = commands.some((c) => {
    if (c.kind !== 'setAction' || !isOn(c.action)) return false;
    const now = ctx.state.actuators[c.actuatorId]?.action;
    return !(now?.ok && isOn(now.value));
  });

  return list.map((d): DeferrableExplanation => {
    const s = ctx.state.deferrables?.[d.id];
    const op = s?.operation.ok ? lastWord(s.operation.value) : null;
    if (op != null && RUNNING.has(op)) return { id: d.id, state: 'running', reason: 'program_running' };
    if (op != null && FINISHED.has(op)) return { id: d.id, state: 'not_ready', reason: 'program_finished' };
    if (!s?.remoteStartAllowed.ok) return { id: d.id, state: 'unknown', reason: 'reading_unavailable' };
    if (!s.remoteStartAllowed.value) return { id: d.id, state: 'not_ready', reason: 'remote_start_not_allowed' };
    if (ctx.failsafeActive) return { id: d.id, state: 'waiting', reason: 'failsafe_unreliable_input' };
    if (isHandsOff(ctx.mode)) return { id: d.id, state: 'waiting', reason: 'mode_excludes_action' };

    // De hoofdzekering gaat voor alles, ook voor de eindtijd (besluit 78).
    for (const phase of ctx.phases) {
      if (phase.signedA == null) return { id: d.id, state: 'waiting', reason: 'insufficient_current_budget' };
      if (Math.abs(phase.signedA + d.estimatedW / phase.voltageV) > phase.limitA) {
        return { id: d.id, state: 'waiting', reason: 'insufficient_current_budget' };
      }
    }
    if (localMinutes(ctx.config.timezone, ctx.nowMs) >= minutesOf(d.latestStart)) {
      return { id: d.id, state: 'would_start', reason: 'latest_start_reached' };
    }
    if (started || ctx.stabilisationActive) return { id: d.id, state: 'waiting', reason: 'stabilisation_active' };
    // Wat de airco's overlaten, gerekend zoals de arbiter een start rekent (besluit 51).
    const free = ctx.availableW - allocatedW - ctx.config.power.stopImportW;
    if (free >= d.estimatedW) return { id: d.id, state: 'would_start', reason: 'surplus_available' };
    return { id: d.id, state: 'waiting', reason: 'surplus_insufficient' };
  });
}
