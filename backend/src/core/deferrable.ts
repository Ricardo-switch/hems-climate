/**
 * Uitstelbare apparaten: de droger draait op zon, via dezelfde budgetten als de
 * airco's (besluit 98). Eerst in de schaduw.
 *
 * Een uitstelbaar apparaat draait één programma en stopt dan; halverwege
 * pauzeren kan niet. De bewoner kiest een programma, sluit de deur en zet "start
 * op afstand" aan. Vanaf dat moment beslist SunArc wanneer het begint:
 *
 * - **op zon**, als het overschot na de airco's het apparaat draagt;
 * - **uiterlijk om `latestStart`**, ook zonder zon, zoals de oude automatisering
 *   om 15:00 deed; of, als de bewoner "klaar voor" koos, op tijd om dan klaar te
 *   zijn: die tijd min de duur van het programma (besluit 101);
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
import { isHandsOff, type Deferrable } from './model.js';

/**
 * De bedrijfsstatus in woorden. Home Connect geeft "...OperationState.Run" of een
 * vertaling, op het laatste deel herkend. De droger in dit huis zei op 7 oktober:
 * "Klaar" bij aanzetten, "Loopt" tijdens het programma, een tel "Afgerond" en
 * dan weer "Klaar". "Klaar" is dus gereed om te beginnen, niet afgelopen.
 */
const RUNNING = new Set([
  'run', 'running', 'delayedstart', 'pause', 'loopt', 'vertraagdestart', 'pauze', 'draait', 'bezig',
  // Andere merken (besluit 178): Miele, LG ThinQ en SmartThings.
  'in_use', 'inuse', 'waiting_to_start', 'paused', 'reservation', 'drying', 'washing', 'rinsing', 'spinning', 'detecting',
]);
const FINISHED = new Set(['finished', 'afgerond', 'voltooid', 'end', 'program_ended', 'programended']);
const READY = new Set(['ready', 'klaar', 'programmed', 'initial', 'standby', 'stop', 'idle']);
/** Lopend, maar niet bezig: een pauze of een uitgestelde start is nooit "klaar". */
const PAUSED = new Set(['delayedstart', 'pause', 'vertraagdestart', 'pauze', 'waiting_to_start', 'paused', 'reservation']);

/**
 * Hoe lang na het klaarzetten de status nog mag wisselen zonder dat het een
 * gedraaid programma is: aanzetten en klaarzetten gebeuren soms in dezelfde tel.
 */
const SETTLE_MS = 60_000;

/**
 * Meldt een apparaat geen resterende tijd en geen voortgang, dan is het zoveel
 * na de start plus de duur van het programma klaar, ook als het nog "loopt"
 * zegt (besluit 167): een droger draait daarna tegen kreuken.
 */
const DONE_GRACE_MS = 10 * 60_000;

/** Duurt het programma onbekend lang, dan rekent "klaar voor" met zoveel. */
export const FALLBACK_PROGRAM_MIN = 180;

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

type Deadline = Pick<DeferrableExplanation, 'durationMin' | 'readyByMs' | 'latestStartMs'>;

/**
 * Wat er van een apparaat al vaststaat voordat het overschot telt: het draait,
 * is niet klaar, wacht op de zekering, of moet nu starten om op tijd klaar te
 * zijn. Of `zon`: het wacht op genoeg zon, en vraagt daarvoor zijn deel.
 */
function vooraf(ctx: DecisionContext, d: Deferrable): { readonly klaar: DeferrableExplanation } | { readonly zon: Deadline } {
  const klaar = (e: DeferrableExplanation) => ({ klaar: e });
  const s = ctx.state.deferrables?.[d.id];
  const op = s?.operation.ok ? lastWord(s.operation.value) : null;
  // "Klaar voor" en de start die daarvoor nodig is (besluit 101).
  const readyBy = s?.readyByMs ?? null;
  const durationMin = s?.durationMin?.ok && s.durationMin.value > 0 ? s.durationMin.value : FALLBACK_PROGRAM_MIN;
  const known = s?.durationMin?.ok && s.durationMin.value > 0 ? { durationMin: s.durationMin.value } : {};
  const deadline: Deadline = { ...known, ...(readyBy == null ? {} : { readyByMs: readyBy, latestStartMs: readyBy - durationMin * 60_000 }) };
  if (op != null && RUNNING.has(op)) {
    // De echte eindtijd en "klaar" uit de resterende tijd en de voortgang (besluit 167).
    const rest = s?.remainingMin?.ok ? Math.max(0, Math.round(s.remainingMin.value)) : null;
    const pct = s?.progressPct?.ok ? s.progressPct.value : null;
    const loopt = !PAUSED.has(op);
    // Zonder die twee: de start plus de duur. Ruim voorbij en nog steeds "loopt", dan is hij klaar.
    const geschat = rest == null && pct == null && known.durationMin != null && s?.operationSinceMs != null ? s.operationSinceMs + known.durationMin * 60_000 : null;
    const klaarSinds = !loopt
      ? null
      : pct != null && pct >= 100
        ? (s?.progressSinceMs ?? null)
        : rest === 0
          ? (s?.remainingSinceMs ?? null)
          : geschat;
    const isKlaar = loopt && ((pct != null && pct >= 100) || rest === 0 || (geschat != null && ctx.nowMs > geschat + DONE_GRACE_MS));
    return klaar({
      id: d.id,
      state: 'running',
      reason: 'program_running',
      ...deadline,
      ...(rest != null ? { remainingMin: rest } : {}),
      ...(isKlaar ? { doneSinceMs: klaarSinds ?? ctx.nowMs } : {}),
    });
  }
  if (op != null && FINISHED.has(op)) return klaar({ id: d.id, state: 'not_ready', reason: 'program_finished' });
  if (!s?.remoteStartAllowed.ok) return klaar({ id: d.id, state: 'unknown', reason: 'reading_unavailable' });
  if (!s.remoteStartAllowed.value) return klaar({ id: d.id, state: 'not_ready', reason: 'remote_start_not_allowed' });
  // Werd de status ná het klaarzetten weer "klaar", dan draaide er sindsdien
  // een programma en is de machine leeg; "start op afstand" blijft daarna
  // soms gewoon aan. Nooit nog eens starten (besluit 101). Een haperende
  // koppeling valt zo ook aan de veilige kant: dan wacht hij op opnieuw klaarzetten.
  const since = s.remoteStartSinceMs ?? null;
  const opSince = s.operationSinceMs ?? null;
  if (op != null && READY.has(op) && since != null && opSince != null && opSince > since + SETTLE_MS) {
    return klaar({ id: d.id, state: 'not_ready', reason: 'program_finished' });
  }
  if (ctx.failsafeActive) return klaar({ id: d.id, state: 'waiting', reason: 'failsafe_unreliable_input' });
  if (isHandsOff(ctx.mode)) return klaar({ id: d.id, state: 'waiting', reason: 'mode_excludes_action' });

  // De hoofdzekering gaat voor alles, ook voor de eindtijd (besluit 78).
  for (const phase of ctx.phases) {
    if (phase.signedA == null) return klaar({ id: d.id, state: 'waiting', reason: 'insufficient_current_budget', ...deadline });
    if (Math.abs(phase.signedA + d.estimatedW / phase.voltageV) > phase.limitA) {
      return klaar({ id: d.id, state: 'waiting', reason: 'insufficient_current_budget', ...deadline });
    }
  }
  // Met "klaar voor" telt die tijd, anders de vaste uiterlijke start.
  if (deadline.latestStartMs != null) {
    if (ctx.nowMs >= deadline.latestStartMs) return klaar({ id: d.id, state: 'would_start', reason: 'ready_by_reached', ...deadline });
  } else if (localMinutes(ctx.config.timezone, ctx.nowMs) >= minutesOf(d.latestStart)) {
    return klaar({ id: d.id, state: 'would_start', reason: 'latest_start_reached' });
  }
  return { zon: deadline };
}

/** Een apparaat dat op zon wacht, met wat het vraagt (besluit 176). */
export interface SunClaim {
  readonly id: string;
  /** Een warmtebuffer (besluit 186); weg is een uitstelbaar apparaat. */
  readonly kind?: 'heatStore';
  readonly estimatedW: number;
  /**
   * Een buffer die al stookt, met wat hij trekt: hij mag door met de tolerantie
   * van een draaiend apparaat (besluit 51), en dat is geen start (besluit 68).
   */
  readonly runningW?: number;
}

/** Hoe het de arbiter verging op zijn plek in de volgorde op zon. */
export interface ClaimOutcome {
  /** Het kreeg zijn deel: het zou nu starten. */
  readonly accepted: boolean;
  /** Er was deze ronde al iets gestart vóór zijn plek (besluit 68). */
  readonly startedBefore: boolean;
}

/**
 * De apparaten die op zon wachten. Met een volgorde op zon (besluit 176) vragen
 * ze hun deel op hun plek in die volgorde, bij de arbiter, tussen de zones
 * die op zon opwarmen of koelen.
 */
export function deferrableClaims(ctx: DecisionContext): SunClaim[] {
  return (ctx.config.deferrables ?? []).filter((d) => 'zon' in vooraf(ctx, d)).map((d) => ({ id: d.id, estimatedW: d.estimatedW }));
}

export function deferrableDecisions(ctx: DecisionContext, allocatedW: number, commands: readonly Command[], claims?: ReadonlyMap<string, ClaimOutcome>): DeferrableExplanation[] {
  const list = ctx.config.deferrables ?? [];
  if (list.length === 0) return [];
  // Startte deze beslissing al een airco (besluit 68)?
  const started = commands.some((c) => {
    if (c.kind !== 'setAction' || !isOn(c.action)) return false;
    const now = ctx.state.actuators[c.actuatorId]?.action;
    return !(now?.ok && isOn(now.value));
  });

  return list.map((d): DeferrableExplanation => {
    const v = vooraf(ctx, d);
    if ('klaar' in v) return v.klaar;
    const deadline = v.zon;
    // Op zijn plek in de volgorde op zon (besluit 176): de arbiter besliste.
    const claim = claims?.get(d.id);
    if (claim) {
      if (claim.accepted) return { id: d.id, state: 'would_start', reason: 'surplus_available', ...deadline };
      if (claim.startedBefore || ctx.stabilisationActive) return { id: d.id, state: 'waiting', reason: 'stabilisation_active', ...deadline };
      return { id: d.id, state: 'waiting', reason: 'surplus_insufficient', ...deadline };
    }
    if (started || ctx.stabilisationActive) return { id: d.id, state: 'waiting', reason: 'stabilisation_active', ...deadline };
    // Wat de airco's overlaten, gerekend zoals de arbiter een start rekent (besluit 51).
    const free = ctx.availableW - allocatedW - ctx.config.power.stopImportW;
    if (free >= d.estimatedW) return { id: d.id, state: 'would_start', reason: 'surplus_available', ...deadline };
    return { id: d.id, state: 'waiting', reason: 'surplus_insufficient', ...deadline };
  });
}
