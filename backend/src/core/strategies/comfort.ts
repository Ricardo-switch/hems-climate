/**
 * Comfort: de basisregeling.
 *
 * Houdt elke zone op het setpoint van de geldende modus met haar primary
 * actuator. Vraagt geen vermogensbudget — comfort mag nooit sneuvelen omdat de
 * zon niet schijnt. Dat is meteen het verschil met alle assist-strategieën.
 */

import type { DecisionContext } from '../context.js';
import type { Intent } from '../decision.js';
import { actuatorById } from '../model.js';
import type { Strategy } from '../strategy.js';

export const comfort: Strategy = {
  id: 'comfort',
  priority: 10,

  propose(ctx: DecisionContext): Intent[] {
    const intents: Intent[] = [];

    for (const derived of ctx.zones) {
      const { zone, demand, temperatureC } = derived;

      for (const actuatorId of zone.actuatorIds) {
        const actuator = actuatorById(ctx.config, actuatorId);
        if (actuator.role !== 'primary') continue;

        if (temperatureC == null) {
          // Zonder meting niets forceren; de failsafe in decide() vangt dit af.
          continue;
        }

        // Vraagt de zone iets dat dit apparaat niet kan? Dan is er voor hém
        // niets te doen, en volgt hieronder de uit-tak. Zonder deze controle
        // zou een ketel elke ronde een koelvoorstel doen dat de arbiter
        // afwijst — een storingsmelding die geen storing is.
        const canServe =
          demand === 'heat'
            ? actuator.capabilities.canHeat
            : demand === 'cool'
              ? actuator.capabilities.canCool
              : false;

        if (canServe && demand === 'heat' && derived.heatTargetC != null) {
          intents.push({
            strategyId: comfort.id,
            zoneId: zone.id,
            actuatorId,
            action: 'heat',
            setpointC: derived.heatTargetC,
            priority: comfort.priority,
            budgetW: 0,
            reason: 'zone_below_setpoint',
          });
        } else if (canServe && demand === 'cool' && derived.coolTargetC != null) {
          intents.push({
            strategyId: comfort.id,
            zoneId: zone.id,
            actuatorId,
            action: 'cool',
            setpointC: derived.coolTargetC,
            priority: comfort.priority,
            budgetW: 0,
            reason: 'zone_above_setpoint',
          });
        } else {
          intents.push({
            strategyId: comfort.id,
            zoneId: zone.id,
            actuatorId,
            action: 'off',
            priority: comfort.priority,
            budgetW: 0,
            reason: 'zone_satisfied',
          });
        }
      }
    }

    return intents;
  },
};
