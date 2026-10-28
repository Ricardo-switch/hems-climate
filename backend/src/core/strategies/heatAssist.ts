/**
 * Heat-assist: de warmtepomp helpt de hoofdverwarming.
 *
 * De regel komt uit de YAML-versie: stookt de ketel al een tijd onafgebroken en
 * loopt de zone nog steeds meetbaar achter, dan springt de airco bij, want die
 * haalt zijn warmte goedkoper uit de buitenlucht dan de ketel uit gas.
 *
 * De startvertraging is het hart ervan. Zonder die eis zou de airco meestarten
 * bij elke korte warmtevraag, wat juist duurder uitpakt: een warmtepomp die om
 * de tien minuten aanslaat verliest meer aan opstarten dan hij aan rendement
 * wint. Daarom telt niet of de ketel áán staat, maar of hij daadwerkelijk
 * staat te stoken — `producing`, niet `action`.
 *
 * Anders dan pv-surplus vraagt deze strategie geen vermogensbudget: bijstoken
 * gebeurt omdat het huis koud is, niet omdat de zon schijnt. Wel verliest hij
 * van comfort, zodat de primary altijd voorgaat.
 */

import type { DecisionContext } from '../context.js';
import type { Intent } from '../decision.js';
import { actuatorById } from '../model.js';
import { producingMinutes } from '../state.js';
import type { Strategy } from '../strategy.js';

export interface HeatAssistOptions {
  /**
   * Hoe lang de hoofdverwarming onafgebroken moet stoken voordat de airco
   * bijspringt. Kwam overeen met `input_number.airco_assist_start_na_min`.
   */
  readonly startDelayMinutes: number;
  /**
   * Hoeveel de zone minstens onder het doel moet zitten. Kwam overeen met
   * `input_number.airco_assist_delta_min`.
   */
  readonly minShortfallC: number;
}

/**
 * Overgenomen van het eerste huis, en bewust zo gelaten als algemene
 * standaard (besluit 204): vijf minuten en een halve graad is voorzichtig
 * genoeg voor een huis dat de app nog niet kent.
 */
export const HEAT_ASSIST_DEFAULTS: HeatAssistOptions = {
  startDelayMinutes: 5,
  minShortfallC: 0.5,
};

/** Modi waarin bijstoken niet aan de orde is. */
const PASSIVE_MODES = new Set(['nacht', 'vakantie', 'afwezig']);

export function createHeatAssist(
  options: Partial<HeatAssistOptions> = {},
): Strategy {
  const { startDelayMinutes, minShortfallC } = {
    ...HEAT_ASSIST_DEFAULTS,
    ...options,
  };

  return {
    id: 'heat-assist',
    priority: 15,

    propose(ctx: DecisionContext): Intent[] {
      if (PASSIVE_MODES.has(ctx.mode)) return [];

      const intents: Intent[] = [];

      for (const derived of ctx.zones) {
        const { zone, temperatureC, heatTargetC, demand } = derived;
        if (temperatureC == null || heatTargetC == null) continue;
        if (demand !== 'heat') continue;

        // Stookt de hoofdverwarming van deze zone al lang genoeg?
        //
        // Rapporteert het apparaat niet of het levert, dan gebeurt hier niets.
        // Dat is met opzet: aannemen dat een ingeschakelde ketel ook brandt zou
        // de airco laten meestarten op elke korte vraag, precies wat de
        // startvertraging moet voorkomen.
        const primarySettled = zone.actuatorIds.some((id) => {
          const actuator = actuatorById(ctx.config, id);
          if (actuator.role !== 'primary') return false;
          const s = ctx.state.actuators[id];
          if (!s) return false;
          return producingMinutes(s, ctx.nowMs) >= startDelayMinutes;
        });
        if (!primarySettled) continue;

        if (heatTargetC - temperatureC < minShortfallC) continue;

        for (const actuatorId of zone.actuatorIds) {
          const actuator = actuatorById(ctx.config, actuatorId);
          if (actuator.role !== 'assist') continue;
          if (!actuator.capabilities.canHeat) continue;

          intents.push({
            strategyId: 'heat-assist',
            zoneId: zone.id,
            actuatorId,
            action: 'heat',
            setpointC: heatTargetC,
            priority: 15,
            budgetW: 0,
            reason: 'zone_below_setpoint',
          });
        }
      }

      return intents;
    },
  };
}

/** De standaardvariant, met de drempels uit de YAML-versie. */
export const heatAssist: Strategy = createHeatAssist();
