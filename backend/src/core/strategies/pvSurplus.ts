/**
 * PV-overschot: laadt het gebouw op met stroom die anders het net op gaat.
 *
 * Dit is de generalisatie van PV-koelen én PV-verwarmen uit de YAML-versie.
 * Daar waren het twee bijna identieke blokken van elk ~70 regels; het verschil
 * zat alleen in de richting. Hier is de richting een variabele.
 *
 * Het `budgetW` van elk voorstel is bewust marginaal: een apparaat dat al
 * draait rekent zijn gemeten opname, een apparaat dat nog stilstaat rekent zijn
 * schatting. Zo kost het bijschakelen van een tweede unit alleen het verschil,
 * precies zoals de oorspronkelijke drempellogica bedoelde — maar nu zonder dat
 * één gemiste vlag twee units tegelijk kan laten starten.
 */

import type { DecisionContext, ZoneDerived } from '../context.js';
import type { Intent } from '../decision.js';
import type { Actuator } from '../model.js';
import { actuatorById } from '../model.js';
import type { Strategy } from '../strategy.js';

/** Modi waarin het gebouw niet actief geladen wordt. */
const PASSIVE_MODES = new Set(['nacht', 'vakantie']);

function claimW(ctx: DecisionContext, actuator: Actuator): number {
  const s = ctx.state.actuators[actuator.id];
  const running = s?.action.ok && (s.action.value === 'heat' || s.action.value === 'cool');
  if (running && s.powerW.ok && s.powerW.value > 0) return s.powerW.value;
  return actuator.power.estimatedW;
}

/**
 * De richting waarin gebufferd mag worden, en tot welke temperatuur. Buiten de
 * bufferband gebeurt er niets: dan is comfort al tevreden en zou doorladen
 * alleen maar warmte of koude weggooien.
 */
function bufferTarget(
  derived: ZoneDerived,
): { action: 'heat' | 'cool'; setpointC: number } | null {
  const { zone, temperatureC, heatTargetC, coolTargetC } = derived;
  if (temperatureC == null) return null;
  if (!zone.buffering.enabled || zone.buffering.bandC <= 0) return null;
  const band = zone.buffering.bandC;

  if (coolTargetC != null) {
    const floor = coolTargetC - band;
    if (temperatureC > floor) return { action: 'cool', setpointC: floor };
  }
  if (heatTargetC != null) {
    const ceiling = heatTargetC + band;
    if (temperatureC < ceiling) return { action: 'heat', setpointC: ceiling };
  }
  return null;
}

export const pvSurplus: Strategy = {
  id: 'pv-surplus',
  priority: 20,

  propose(ctx: DecisionContext): Intent[] {
    if (PASSIVE_MODES.has(ctx.mode)) return [];
    if (ctx.sunDown) return [];

    const intents: Intent[] = [];
    // Zones met de laagste prioriteit eerst, zodat de arbiter bij krapte de
    // belangrijkste zone overhoudt.
    const zones = [...ctx.zones].sort((a, b) => a.zone.priority - b.zone.priority);

    for (const derived of zones) {
      const target = bufferTarget(derived);

      for (const actuatorId of derived.zone.actuatorIds) {
        const actuator = actuatorById(ctx.config, actuatorId);
        if (actuator.role !== 'assist') continue;

        // Niets te bufferen: geen voorstel. Een strategie drukt vraag uit; het
        // afbouwen bij afwezige vraag doet de arbiter, die als enige weet wat
        // het apparaat nú doet. Hier "standby" voorstellen zou een uitgeschakeld
        // apparaat aanzetten om vervolgens niets te doen.
        if (target == null) continue;

        const supported =
          target.action === 'heat'
            ? actuator.capabilities.canHeat
            : actuator.capabilities.canCool;
        if (!supported) continue;

        intents.push({
          strategyId: pvSurplus.id,
          zoneId: derived.zone.id,
          actuatorId,
          action: target.action,
          setpointC: target.setpointC,
          priority: pvSurplus.priority,
          budgetW: claimW(ctx, actuator),
          reason: 'buffering_free_energy',
        });
      }
    }

    return intents;
  },
};
