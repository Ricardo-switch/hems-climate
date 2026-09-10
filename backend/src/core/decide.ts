/**
 * Het enige instappunt van de kern.
 *
 * `decide` is puur: gelijke invoer geeft gelijke uitvoer, er wordt niets
 * gelezen dat niet in `state` staat en niets geschreven dat niet in
 * `Decision.commands` terugkomt. Daarom kan de replay-harness hem voeden met
 * opgenomen historie en de uitkomst vergelijken met wat de YAML-versie destijds
 * werkelijk deed.
 */

import { arbitrate } from './arbiter.js';
import { buildContext } from './context.js';
import type { DecisionContext } from './context.js';
import type {
  Decision,
  Explanation,
  Intent,
  ZoneExplanation,
} from './decision.js';
import { isHandsOff } from './model.js';
import type { SiteConfig } from './model.js';
import type { StrategyRegistry } from './strategy.js';
import type { SystemState } from './state.js';

export interface DecideOptions {
  readonly config: SiteConfig;
  readonly state: SystemState;
  readonly strategies: StrategyRegistry;
}

/**
 * Bij een onbetrouwbaar kritiek meetpunt schakelen alle assist-apparaten terug.
 * De primary blijft met rust: een CV-ketel uitzetten omdat een zoldersensor
 * wegvalt is gevaarlijker dan hem te laten doorlopen.
 */
function failsafeIntents(ctx: DecisionContext): Intent[] {
  const intents: Intent[] = [];
  for (const zone of ctx.config.zones) {
    for (const actuatorId of zone.actuatorIds) {
      const actuator = ctx.config.actuators.find((a) => a.id === actuatorId);
      if (!actuator || actuator.role !== 'assist') continue;
      intents.push({
        strategyId: 'failsafe',
        zoneId: zone.id,
        actuatorId,
        action: 'off',
        priority: 0,
        budgetW: 0,
        reason: 'failsafe_unreliable_input',
      });
    }
  }
  return intents;
}

function explain(
  ctx: DecisionContext,
  budget: Explanation['budget'],
  state: SystemState,
): Explanation {
  const perZone: ZoneExplanation[] = ctx.zones.map((d) => ({
    zoneId: d.zone.id,
    temperatureC: d.temperatureC,
    // Rechtstreeks uit de toestand: de context is wat de regeling gebruikt, en
    // dit is uitdrukkelijk geen invoer voor de regeling.
    humidityPct: (() => {
      const h = state.zones[d.zone.id]?.humidityPct;
      return h?.ok ? h.value : null;
    })(),
    targetC: d.demand === 'cool' ? d.coolTargetC : d.heatTargetC,
    demand: d.demand,
    reason:
      d.temperatureC == null
        ? 'failsafe_unreliable_input'
        : d.demand === 'heat'
          ? 'zone_below_setpoint'
          : d.demand === 'cool'
            ? 'zone_above_setpoint'
            : 'zone_satisfied',
  }));

  return {
    mode: ctx.mode,
    modeSource: ctx.modeSource,
    occupied: ctx.occupied,
    budget,
    failsafe: { active: ctx.failsafeActive, unreliable: ctx.unreliableInputs },
    perZone,
    // Rechtstreeks uit de toestand en niet uit de context: de context is wat de
    // regeling gebruikt, en dit is uitdrukkelijk geen invoer voor de regeling
    // (besluit 30). Het gaat alleen mee het logboek in.
    outdoorTemperatureC: state.outdoorTemperatureC.ok
      ? state.outdoorTemperatureC.value
      : null,
    solarProductionW: state.solarProductionW.ok ? state.solarProductionW.value : null,
  };
}

export function decide({ config, state, strategies }: DecideOptions): Decision {
  const ctx = buildContext(config, state);

  // Handen af. Geen voorstellen, dus ook geen afschakelronde: de arbiter laat
  // alles staan zoals de bewoner het heeft achtergelaten.
  //
  // Behalve wanneer de failsafe aanstaat. Een onbetrouwbare sensor is geen
  // voorkeur maar een storing, en de assist-apparaten moeten dan terug — ook
  // als de bewoner net had gezegd dat de regeling zich er niet mee moest
  // bemoeien. Het oude systeem deed dat ook zo, en terecht.
  if (isHandsOff(ctx.mode) && !ctx.failsafeActive) {
    return {
      atMs: ctx.nowMs,
      commands: [],
      proposed: [],
      accepted: [],
      rejected: [],
      explanation: explain(ctx, {
        availableW: ctx.availableW,
        allocatedW: 0,
        surplusW: ctx.surplusW,
        reclaimableW: ctx.reclaimableW,
        gridPowerW: ctx.gridPowerW,
      }, state),
    };
  }

  const proposed: Intent[] = ctx.failsafeActive
    ? failsafeIntents(ctx)
    : strategies
        .resolve(config.enabledStrategies)
        .flatMap((s) => s.propose(ctx));

  const { accepted, rejected, commands, budget } = arbitrate(proposed, ctx);

  return {
    atMs: ctx.nowMs,
    commands,
    proposed,
    accepted,
    rejected,
    explanation: explain(ctx, budget, state),
  };
}
