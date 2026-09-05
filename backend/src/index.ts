/** Publieke oppervlakte van de kern. Adapters importeren alleen hiervandaan. */

export * from './core/model.js';
export * from './core/state.js';
export * from './core/decision.js';
export * from './core/context.js';
export * from './core/strategy.js';
export * from './core/arbiter.js';
export * from './core/decide.js';

export { comfort } from './core/strategies/comfort.js';
export {
  heatAssist,
  createHeatAssist,
  HEAT_ASSIST_DEFAULTS,
  type HeatAssistOptions,
} from './core/strategies/heatAssist.js';
export { pvSurplus } from './core/strategies/pvSurplus.js';

import { StrategyRegistry } from './core/strategy.js';
import { comfort } from './core/strategies/comfort.js';
import { heatAssist } from './core/strategies/heatAssist.js';
import { pvSurplus } from './core/strategies/pvSurplus.js';

/** De standaardset. Een site kiest hieruit via `enabledStrategies`. */
export function defaultStrategies(): StrategyRegistry {
  return new StrategyRegistry().register(comfort, heatAssist, pvSurplus);
}
