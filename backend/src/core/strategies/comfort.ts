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

      /*
       * Het comfortplafond, en waarom het hier staat (besluit 50).
       *
       * De lus hieronder kijkt alleen naar `primary`, en dat is juist: comfort
       * regelt met het hoofdapparaat. Maar in een zone waar geen primary kan
       * koelen bestond er daardoor géén comfortpad voor koelen — de airco is
       * `assist`, en assist draait alleen op overschot. Dan koelt er op een
       * bewolkte dag van 28 graden niets.
       *
       * Alleen wanneer geen primary het kan. Kan er wel één koelen, dan
       * verdedigt `coolTargetC` al een strengere grens en zou dit niets
       * toevoegen.
       *
       * `budgetW: 0`, dus onblokkeerbaar: dit is comfort, en comfort sneuvelt
       * niet omdat de zon niet schijnt. Het setpoint is het plafond zelf en
       * niet het koeldoel — hij zorgt dat het niet warmer wordt, hij koelt niet
       * door naar het doel. Dat is het verschil dat de rekening bepaalt.
       */
      const primaryCanCool = zone.actuatorIds.some((id) => {
        const a = actuatorById(ctx.config, id);
        return a.role === 'primary' && a.capabilities.canCool;
      });
      if (derived.aboveComfortCeiling && !primaryCanCool && derived.comfortMaxC != null) {
        const cooler = zone.actuatorIds.find(
          (id) => actuatorById(ctx.config, id).capabilities.canCool,
        );
        if (cooler != null) {
          intents.push({
            strategyId: comfort.id,
            zoneId: zone.id,
            actuatorId: cooler,
            action: 'cool',
            setpointC: derived.comfortMaxC,
            priority: comfort.priority,
            budgetW: 0,
            reason: 'zone_above_setpoint',
          });
        }
      }

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
        } else if (actuator.onSurplus === true) {
          // Tevreden, maar hij mag ook op zon (besluit 132): niet uitzetten,
          // anders claimt comfort hem en komt pv-surplus er nooit aan. Wil
          // niemand hem, dan bouwt de arbiter hem af, net als een assist.
          continue;
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
