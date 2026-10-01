/**
 * Besluit 56: regels die voor élke toestand gelden, niet alleen voor de
 * voorbeelden die iemand bedacht.
 *
 * De andere tests beschrijven gevallen: "900 W overschot, zolder warm, dan
 * gebeurt dit". Dat vangt wat iemand voorzag. Deze test genereert duizenden
 * toestanden — willekeurige temperaturen, netstanden, apparaatstanden,
 * draaitijden, modi, timers, haperende sensoren — en eist dat een paar regels
 * altijd houden. Dat vangt wat niemand voorzag.
 *
 * **Waarom geen bibliotheek.** Een kleine generator met een vast startgetal is
 * genoeg, en elke run is exact herhaalbaar: faalt er iets, dan staan het
 * startgetal en het geval in de melding, en speel je precies dat opnieuw af.
 * Wie meer gevallen wil draaien, zet HEMS_INVARIANT_RUNS hoger.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { decide } from '../src/core/decide.js';
import type { Command, Decision } from '../src/core/decision.js';
import { ACTIONS, MODES, actuatorById, isHandsOff } from '../src/core/model.js';
import type { Action, Mode, SiteConfig } from '../src/core/model.js';
import type { ActuatorState, SystemState } from '../src/core/state.js';
import { minutesSinceChange, unavailable, value } from '../src/core/state.js';
import { defaultStrategies } from '../src/index.js';

const NOW = Date.UTC(2026, 6, 15, 11, 0, 0);
const CASES = Number(process.env['HEMS_INVARIANT_RUNS'] ?? 3_000);
const SEED = Number(process.env['HEMS_INVARIANT_SEED'] ?? 20260930);

/** mulberry32: klein, snel, en genoeg voor testinvoer. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dice {
  numberAttr(min: number, max: number): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(listAttr: readonly T[]): T;
}

function dice(r: () => number): Dice {
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

function entityState(k: Dice, config: SiteConfig): SystemState {
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
  };
}

function isRunning(a: Action | undefined): boolean {
  return a === 'heat' || a === 'cool';
}

function action(s: ActuatorState | undefined): Action | undefined {
  return s?.action.ok ? s.action.value : undefined;
}

/**
 * Loopt alle gevallen af en controleert elke regel. Geeft de eerste overtreding
 * terug, met genoeg om hem na te spelen.
 */
function validate(config: SiteConfig): string | null {
  const k = dice(generator(SEED));
  const strategies = defaultStrategies();

  for (let caseIndex = 0; caseIndex < CASES; caseIndex += 1) {
    const state = entityState(k, config);
    const d: Decision = decide({ config, state, strategies });
    const error = (line: string): string =>
      `geval ${caseIndex} (startgetal ${SEED}): ${line}\n${JSON.stringify(state)}`;

    // Zelfde toestand, zelfde besluit.
    const again = decide({ config, state, strategies });
    if (JSON.stringify(again) !== JSON.stringify(d)) return error('niet deterministisch');

    // Nooit meer toegewezen dan er is.
    const b = d.explanation.budget;
    if (b.allocatedW > b.availableW) {
      return error(`${b.allocatedW} W toegewezen van ${b.availableW} W`);
    }

    // In handmatig trekt de regeling zich terug, behalve bij de failsafe.
    if (isHandsOff(d.explanation.mode) && !d.explanation.failsafe.active && d.commands.length > 0) {
      return error('commando in handmatig zonder failsafe');
    }

    const perActuator = new Map<string, Command[]>();
    for (const c of d.commands) {
      if (c.kind !== 'setAction' && c.kind !== 'setSetpoint') continue;
      perActuator.set(c.actuatorId, [...(perActuator.get(c.actuatorId) ?? []), c]);
    }

    for (const [id, cmds] of perActuator) {
      const actuatorCfg = actuatorById(config, id);
      const caps = actuatorCfg.capabilities;
      const now = state.actuators[id];
      const actions = cmds.filter((c): c is Extract<Command, { kind: 'setAction' }> => c.kind === 'setAction');

      if (actions.length > 1) return error(`${id} krijgt ${actions.length} schakelcommando's`);

      for (const c of cmds) {
        if (c.kind === 'setSetpoint') {
          const [minC, maxC] = caps.setpointRange;
          if (c.setpointC < minC || c.setpointC > maxC) {
            return error(`${id} setpoint ${c.setpointC} buiten ${minC}-${maxC}`);
          }
        }
      }

      const to = actions[0]?.action;
      if (to == null) continue;

      // Nooit een stand die het apparaat niet kan.
      if (to === 'heat' && !caps.canHeat) return error(`${id} kan niet verwarmen`);
      if (to === 'cool' && !caps.canCool) return error(`${id} kan niet koelen`);
      if (to === 'standby' && !caps.standby) return error(`${id} kent geen standby`);

      // Bij de failsafe gaat er nooit een airco aan.
      if (d.explanation.failsafe.active && actuatorCfg.role === 'assist' && isRunning(to)) {
        return error(`${id} start terwijl de failsafe aanstaat`);
      }

      if (now == null) continue;
      const isOn = isRunning(action(now));
      const minutes = minutesSinceChange(now, state.nowMs);

      // Geen stop binnen de minimale draaitijd.
      if (isOn && !isRunning(to) && minutes < actuatorCfg.timing.minRunMinutes) {
        return error(`${id} stopt na ${minutes.toFixed(1)} min, minimum ${actuatorCfg.timing.minRunMinutes}`);
      }
      // Geen start binnen de rusttijd.
      if (!isOn && isRunning(to) && minutes < actuatorCfg.timing.minRestMinutes) {
        return error(`${id} start na ${minutes.toFixed(1)} min rust, minimum ${actuatorCfg.timing.minRestMinutes}`);
      }
    }

    // Geen start op overschot onder de startdrempel (besluit 51). Alleen voor
    // voorstellen die vermogen claimen en een apparaat dat echt uit stond.
    for (const i of d.accepted) {
      if (i.budgetW <= 0 || !isRunning(i.action)) continue;
      const now = action(state.actuators[i.actuatorId]);
      if (now === 'off' && b.availableW - config.power.stopImportW < config.power.startSurplusW) {
        return error(`${i.actuatorId} start op ${b.availableW} W, drempel ${config.power.startSurplusW}`);
      }
    }
  }
  return null;
}

describe('regels die altijd gelden', () => {
  it(`houden voor ${CASES} gegenereerde toestanden`, () => {
    expect(validate(exampleSite)).toBeNull();
  });

  it('houden ook zonder comfortplafond', () => {
    // Het plafond is een keuze per woning; de regels mogen er niet van afhangen.
    const without: SiteConfig = {
      ...exampleSite,
      zones: exampleSite.zones.map((z) => {
        const { comfortMaxC: _omitted, ...rest } = z;
        return rest;
      }),
    };
    expect(validate(without)).toBeNull();
  });

  it('dekken de interessante gevallen', () => {
    // Een generator die alleen saaie toestanden maakt, bewijst niets. Tel wat
    // er langskwam.
    const k = dice(generator(SEED));
    const strategies = defaultStrategies();
    let starts = 0;
    let stops = 0;
    let budgetBlock = 0;
    let runtimeBlock = 0;
    let failsafe = 0;
    for (let caseIndex = 0; caseIndex < CASES; caseIndex += 1) {
      const d = decide({ config: exampleSite, state: entityState(k, exampleSite), strategies });
      for (const c of d.commands) {
        if (c.kind !== 'setAction') continue;
        if (isRunning(c.action)) starts += 1;
        else stops += 1;
      }
      if (d.rejected.some((r) => r.blockedBy === 'insufficient_power_budget')) budgetBlock += 1;
      if (d.rejected.some((r) => r.blockedBy === 'min_run_not_elapsed')) runtimeBlock += 1;
      if (d.explanation.failsafe.active) failsafe += 1;
    }
    expect(starts).toBeGreaterThan(50);
    expect(stops).toBeGreaterThan(50);
    expect(budgetBlock).toBeGreaterThan(50);
    expect(runtimeBlock).toBeGreaterThan(20);
    expect(failsafe).toBeGreaterThan(10);
    // Voor wie het wil zien: npx vitest run test/invariants.test.ts
    expect(ACTIONS.length).toBe(4);
  });
});
