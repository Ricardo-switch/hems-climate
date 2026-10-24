/**
 * Warmtebuffers: een boiler of een jacuzzi bewaart de zon als warm water
 * (besluit 186). Eerst in de schaduw, net als de droger.
 *
 * Anders dan de droger draait een buffer geen programma: hij mag aan zolang er
 * zon is, en uit als die wegvalt. Wat hij nu zou doen:
 *
 * - **van het net, altijd** onder de ondergrens (`minC`): warm water of een
 *   warme jacuzzi hoort er te zijn;
 * - **van het net, op tijd** voor "klaar om" van de bewoner: uiterlijk zo laat
 *   dat hij het met zijn snelheid haalt, en eerder als dat in de goedkoopste
 *   uren kan, maar niet zo vroeg dat hij weer afkoelt;
 * - **tegen legionella** eens per week naar `legionellaC`, het liefst op zon,
 *   anders in de goedkoopste uren;
 * - **een boiler zonder temperatuur** (aan een stekker) elke dag één keer vol,
 *   op zon of in de goedkoopste uren;
 * - **op zon** tot `sunC`, achteraan in de volgorde op zon: hij pakt wat de
 *   kamers en de apparaten met een eindtijd overlaten (besluit 176);
 * - **nooit** in de failsafe, in een stand waarin de bewoner de regeling
 *   terugtrok, of bij een start die de hoofdzekering niet draagt.
 *
 * Hooguit één start per beslissing (besluit 68); een buffer die al stookt, mag
 * door met de tolerantie van een draaiend apparaat (besluit 51).
 *
 * Dit geeft alleen uitleg. Een opdracht komt er pas met stap B.
 */

import type { DecisionContext } from './context.js';
import type { Command, DeferrableExplanation, HeatStoreExplanation } from './decision.js';
import type { ClaimOutcome, SunClaim } from './deferrable.js';
import { isHandsOff, type HeatStore } from './model.js';
import type { HeatStoreState } from './state.js';

/** Trekt hij meer dan dit, dan stookt hij. */
export const HEATING_W = 50;
/** Ruimte bij "klaar om": zo veel eerder begint hij dan strikt nodig. */
const MARGIN_MS = 30 * 60_000;
/**
 * Hoe veel eerder dan nodig hij in de goedkoopste uren mag beginnen. Vroeger
 * koelt het water weer af voordat iemand erin gaat.
 */
const CHEAP_LEAD_MS = 4 * 3_600_000;
const WEEK_MS = 7 * 24 * 3_600_000;
/** Een dag over de week heen: dan moet het tegen legionella van het net. */
const OVERDUE_MS = WEEK_MS + 24 * 3_600_000;
/** Een boiler zonder temperatuur: was hij dit lang niet vol, dan moet hij weer vol. */
const PLUG_FULL_MS = 20 * 3_600_000;
const PLUG_EMPTY_MS = 24 * 3_600_000;

/** Een sleutel in de uitkomsten van de arbiter, apart van de uitstelbare apparaten. */
export const claimKey = (id: string) => `warmte:${id}`;

const isOn = (a: string | undefined) => a === 'heat' || a === 'cool';

function heatingNow(s: HeatStoreState): boolean {
  if (s.powerW?.ok) return s.powerW.value > HEATING_W;
  return s.on.ok && s.on.value;
}

/** Wat hij nu trekt als hij stookt: gemeten, of de schatting. */
function drawW(h: HeatStore, s: HeatStoreState): number {
  return s.powerW?.ok ? s.powerW.value : h.estimatedW;
}

/**
 * Wat er over is voor een buffer die al stookt: zonder de afkapping op nul van
 * `availableW`, want zijn eigen verbruik komt er nog bij. Met de tolerantie van
 * een draaiend apparaat (besluit 51).
 */
export function vrijVoorDraaiend(ctx: DecisionContext, usedW: number, eigenW: number): number {
  return -ctx.gridPowerW + ctx.reclaimableW + ctx.config.power.stopImportW - usedW + eigenW;
}

function inCheap(ctx: DecisionContext): boolean {
  return (ctx.state.cheapWindows ?? []).some((w) => w.fromMs <= ctx.nowMs && ctx.nowMs < w.toMs);
}

type Basis = Pick<HeatStoreExplanation, 'id' | 'heating' | 'temperatureC'>;
type Zon = Basis & Pick<HeatStoreExplanation, 'targetC' | 'readyByMs' | 'latestStartMs'> & { readonly drawW: number };

/** Moet hij nu van het net, en waarom? Null: alleen op zon. */
function vanHetNet(ctx: DecisionContext, h: HeatStore, s: HeatStoreState, temp: number | null): Omit<HeatStoreExplanation, keyof Basis | 'state'> | null {
  const now = ctx.nowMs;
  if (temp != null && temp < h.minC) return { reason: 'below_minimum', targetC: h.minC };

  const rb = s.readyBy;
  if (rb && rb.atMs > now && temp != null && temp < rb.targetC) {
    const latestStartMs = rb.atMs - ((rb.targetC - temp) / h.heatRateCPerHour) * 3_600_000 - MARGIN_MS;
    const tijd = { targetC: rb.targetC, readyByMs: rb.atMs, latestStartMs };
    if (now >= latestStartMs) return { reason: 'ready_by', ...tijd };
    if (inCheap(ctx) && now >= latestStartMs - CHEAP_LEAD_MS) return { reason: 'cheap_hours', ...tijd };
  }

  if (h.legionellaC != null && temp != null && temp < h.legionellaC && s.legionellaAtMs != null && now - s.legionellaAtMs >= OVERDUE_MS) {
    if (inCheap(ctx) || (ctx.state.cheapWindows ?? []).length === 0) return { reason: 'legionella_due', targetC: h.legionellaC };
  }

  // Een boiler zonder temperatuur: één keer per dag vol (de eigen thermostaat zegt wanneer).
  if (h.temperature == null) {
    const sinds = s.lastFullMs == null ? Number.POSITIVE_INFINITY : now - s.lastFullMs;
    if (sinds >= PLUG_FULL_MS && inCheap(ctx)) return { reason: 'cheap_hours' };
    if (sinds >= PLUG_EMPTY_MS && s.lastFullMs != null) return { reason: 'below_minimum' };
  }
  return null;
}

/**
 * Wat er van een buffer al vaststaat voordat het overschot telt, of `zon`: hij
 * wacht op zon, en vraagt daarvoor zijn deel.
 */
function vooraf(ctx: DecisionContext, h: HeatStore): { readonly klaar: HeatStoreExplanation } | { readonly zon: Zon } {
  const s = ctx.state.heatStores?.[h.id];
  if (s == null) return { klaar: { id: h.id, state: 'unknown', reason: 'reading_unavailable', heating: false } };
  const heating = heatingNow(s);
  const temp = s.temperatureC.ok ? s.temperatureC.value : null;
  const basis: Basis = { id: h.id, heating, ...(temp != null ? { temperatureC: temp } : {}) };
  if (h.temperature != null && temp == null) return { klaar: { ...basis, state: 'unknown', reason: 'reading_unavailable' } };
  if (ctx.failsafeActive) return { klaar: { ...basis, state: 'waiting', reason: 'failsafe_unreliable_input' } };
  if (isHandsOff(ctx.mode)) return { klaar: { ...basis, state: 'waiting', reason: 'mode_excludes_action' } };

  // De hoofdzekering gaat voor alles bij een start, ook voor de ondergrens (besluit 78).
  if (!heating) {
    for (const phase of ctx.phases) {
      if (phase.signedA == null || Math.abs(phase.signedA + h.estimatedW / phase.voltageV) > phase.limitA) {
        return { klaar: { ...basis, state: 'waiting', reason: 'insufficient_current_budget' } };
      }
    }
  }

  const net = vanHetNet(ctx, h, s, temp);
  if (net) return { klaar: { ...basis, state: 'would_heat', ...net } };

  // Op zon: tot het doel, of tegen legionella hoger als dat weer moet.
  const legionella = h.legionellaC != null && (s.legionellaAtMs == null || ctx.nowMs - s.legionellaAtMs >= WEEK_MS);
  const targetC = legionella ? Math.max(h.sunC, h.legionellaC!) : h.sunC;
  const rb = s.readyBy && s.readyBy.atMs > ctx.nowMs ? s.readyBy : null;
  const tijd = rb && temp != null && temp < rb.targetC
    ? { readyByMs: rb.atMs, latestStartMs: rb.atMs - ((rb.targetC - temp) / h.heatRateCPerHour) * 3_600_000 - MARGIN_MS }
    : {};
  if (temp != null && temp >= targetC) return { klaar: { ...basis, state: 'full', reason: 'target_reached', targetC } };
  // Zonder temperatuur: vol als hij aan staat en niets meer trekt.
  if (temp == null && s.on.ok && s.on.value && s.powerW?.ok && s.powerW.value <= HEATING_W) {
    return { klaar: { ...basis, state: 'full', reason: 'target_reached' } };
  }
  return { zon: { ...basis, ...(temp != null ? { targetC } : {}), ...tijd, drawW: drawW(h, s) } };
}

/** De buffers die op zon wachten, voor de volgorde op zon (besluit 176). */
export function heatStoreClaims(ctx: DecisionContext): SunClaim[] {
  return (ctx.config.heatStores ?? []).flatMap((h): SunClaim[] => {
    const v = vooraf(ctx, h);
    if (!('zon' in v)) return [];
    return [{ id: h.id, kind: 'heatStore', estimatedW: h.estimatedW, ...(v.zon.heating ? { runningW: v.zon.drawW } : {}) }];
  });
}

export function heatStoreDecisions(
  ctx: DecisionContext,
  allocatedW: number,
  commands: readonly Command[],
  deferrables: readonly DeferrableExplanation[],
  claims?: ReadonlyMap<string, ClaimOutcome>,
): HeatStoreExplanation[] {
  const list = ctx.config.heatStores ?? [];
  if (list.length === 0) return [];
  // Startte deze beslissing al een airco (besluit 68), of start de droger op zon?
  const deferrableStarts = deferrables.filter((d) => d.state === 'would_start' && d.reason === 'surplus_available');
  let started =
    deferrableStarts.length > 0 ||
    commands.some((c) => {
      if (c.kind !== 'setAction' || !isOn(c.action)) return false;
      const now = ctx.state.actuators[c.actuatorId]?.action;
      return !(now?.ok && isOn(now.value));
    });
  // Zonder volgorde op zon komen de buffers na de droger: wat die vraagt, is weg.
  let used = allocatedW + deferrableStarts.reduce((n, d) => n + (ctx.config.deferrables?.find((x) => x.id === d.id)?.estimatedW ?? 0), 0);

  return list.map((h): HeatStoreExplanation => {
    const v = vooraf(ctx, h);
    if ('klaar' in v) return v.klaar;
    const { drawW: eigen, ...z } = v.zon;
    const claim = claims?.get(claimKey(h.id));
    if (claim) {
      if (claim.accepted) return { ...z, state: 'would_heat', reason: 'surplus_available' };
      if (!z.heating && (claim.startedBefore || ctx.stabilisationActive)) return { ...z, state: 'waiting', reason: 'stabilisation_active' };
      return { ...z, state: 'waiting', reason: 'surplus_insufficient' };
    }
    if (z.heating) {
      // Hij stookt al: zijn eigen verbruik zit in wat het net nu levert, en hij
      // mag door met de tolerantie van een draaiend apparaat (besluit 51).
      if (vrijVoorDraaiend(ctx, used, eigen) >= h.estimatedW) return { ...z, state: 'would_heat', reason: 'surplus_available' };
      return { ...z, state: 'waiting', reason: 'surplus_insufficient' };
    }
    if (started || ctx.stabilisationActive) return { ...z, state: 'waiting', reason: 'stabilisation_active' };
    const free = ctx.availableW - used - ctx.config.power.stopImportW;
    if (free >= h.estimatedW) {
      used += h.estimatedW;
      started = true;
      return { ...z, state: 'would_heat', reason: 'surplus_available' };
    }
    return { ...z, state: 'waiting', reason: 'surplus_insufficient' };
  });
}
