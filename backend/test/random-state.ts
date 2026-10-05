/**
 * Willekeurige maar mogelijke toestanden van het huis, voor de tests die regels
 * eisen voor élke toestand (besluit 56): de invarianten van de arbiter en de
 * zinnen van de assistent.
 *
 * Een vast startgetal maakt elke run exact herhaalbaar.
 */

import { actuatorById, MODES } from '../src/core/model.js';
import type { Action, Mode, SiteConfig } from '../src/core/model.js';
import type { ActuatorState, SystemState } from '../src/core/state.js';
import { unavailable, value } from '../src/core/state.js';

export const NOW = Date.UTC(2026, 6, 15, 11, 0, 0);

/** mulberry32: klein, snel, en genoeg voor testinvoer. */
export function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Dice {
  numberAttr(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(listAttr: readonly T[]): T;
}

export function dice(r: () => number): Dice {
  return {
    numberAttr: (min, max) => Math.round((min + r() * (max - min)) * 10) / 10,
    int: (min, max) => Math.floor(min + r() * (max - min + 1)),
    chance: (p) => r() < p,
    pick: (listAttr) => listAttr[Math.floor(r() * listAttr.length)]!,
  };
}

/** Een apparaatstand die het apparaat kan aannemen, rond het moment `nu`. */
function actuator(k: Dice, config: SiteConfig, id: string, now: number): ActuatorState {
  const caps = actuatorById(config, id).capabilities;
  const possible: Action[] = ['off'];
  if (caps.canHeat) possible.push('heat');
  if (caps.canCool) possible.push('cool');
  if (caps.standby) possible.push('standby');
  const action = k.pick(possible);
  const [minC, maxC] = caps.setpointRange;
  return {
    action: k.chance(0.05) ? unavailable<Action>() : value(action, now),
    setpointC: k.chance(0.2) ? unavailable<number>() : value(k.numberAttr(minC, maxC), now),
    powerW: k.chance(0.2) ? unavailable<number>() : value(k.int(0, 1400), now),
    // De helft kort geleden geschakeld: daar zitten de draaitijdregels.
    lastChangeMs: k.chance(0.1)
      ? null
      : now - (k.chance(0.5) ? k.int(0, 20) : k.int(0, 120)) * 60_000,
    producing: k.chance(0.5) ? unavailable<boolean>('missing') : value(k.chance(0.5), now),
    producingSinceMs: now - k.int(0, 60) * 60_000,
  };
}

export function entityState(k: Dice, config: SiteConfig): SystemState {
  const modes: (Mode | null)[] = [null, null, null, ...MODES];
  // Elk uur van de dag, voor de modi; alles hieronder rekent vanaf dit moment.
  const now = NOW + k.int(0, 24 * 60) * 60_000;
  return {
    nowMs: now,
    modeOverride: k.pick(modes),
    outdoorTemperatureC: unavailable<number>('missing'),
    solarProductionW: unavailable<number>('missing'),
    occupancy: Object.fromEntries(config.occupancy.map((o) => [o.id, value(k.chance(0.6), NOW)])),
    zones: Object.fromEntries(
      config.zones.map((z) => [
        z.id,
        { temperatureC: k.chance(0.03) ? unavailable<number>() : value(k.numberAttr(10, 32), NOW) },
      ]),
    ),
    actuators: Object.fromEntries(config.actuators.map((a) => [a.id, actuator(k, config, a.id, now)])),
    power: {
      gridPowerW: k.chance(0.03) ? unavailable<number>() : value(k.int(-4000, 3000), NOW),
    },
    timers: {
      stabilisation: { endsAtMs: k.chance(0.3) ? now + k.int(-10, 10) * 60_000 : null },
      manualOverride: { endsAtMs: null },
    },
    lights: Object.fromEntries(
      config.schedule.eveningExtensionLights.map((l) => [l.id, value(k.chance(0.3), NOW)]),
    ),
    sunAboveHorizon: value(k.chance(0.6), NOW),
    // Meestal gezond; soms hapert er een meetpunt en moet de failsafe het
    // overnemen.
    inputHealth: Object.fromEntries(config.criticalInputs.map((r) => [r.id, !k.chance(0.02)])),
    // Soms heeft de bewoner een apparaat overgenomen (besluit 74): lopend, tot
    // hij het teruggeeft, of al afgelopen.
    residentOverrides: Object.fromEntries(
      config.actuators
        .filter(() => k.chance(0.15))
        .map((a) => [
          a.id,
          {
            sinceMs: now - k.int(0, 120) * 60_000,
            untilMs: k.chance(0.3) ? null : now + k.int(-30, 120) * 60_000,
          },
        ]),
    ),
  };
}
