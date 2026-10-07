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
import { ACTIONS, actuatorById, isHandsOff } from '../src/core/model.js';
import { isOverridden } from '../src/core/override.js';
import type { Action, SiteConfig } from '../src/core/model.js';
import type { ActuatorState } from '../src/core/state.js';
import { minutesSinceChange } from '../src/core/state.js';
import { defaultStrategies } from '../src/index.js';
import { dice, entityState, generator } from './random-state.js';

const CASES = Number(process.env['HEMS_INVARIANT_RUNS'] ?? 3_000);
const SEED = Number(process.env['HEMS_INVARIANT_SEED'] ?? 20260930);

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

    // Nooit een start boven het stroombudget (besluit 78). Onafhankelijk van de
    // arbiter nagerekend: per fase de stroom met richting, plus wat de starts van
    // dit besluit samen vragen, binnen de zekering min de marge.
    if (config.grid) {
      const phases = d.explanation.phases ?? [];
      const grid = state.power.gridPowerW;
      const sign = config.grid.phases.length === 1 && grid.ok && grid.value < 0 ? -1 : 1;
      const started = d.commands.filter((c) => {
        if (c.kind !== 'setAction' || (c.action !== 'heat' && c.action !== 'cool')) return false;
        const before = action(state.actuators[c.actuatorId]);
        const failsafe = d.accepted.some((i) => i.actuatorId === c.actuatorId && i.strategyId === 'failsafe');
        return before !== 'heat' && before !== 'cool' && !failsafe;
      });
      for (const p of phases) {
        if (started.length === 0) break;
        if (p.currentA == null) return error(`gestart zonder stroom of netvermogen op fase ${p.id}`);
        const v = 230;
        const extra = started.reduce((sum, c) => sum + actuatorById(config, (c as { actuatorId: string }).actuatorId).power.estimatedW / v, 0);
        // De uitleg rondt af op 0,1 A; een tiende marge voorkomt een vals alarm.
        if (Math.abs(sign * p.currentA + extra) > p.limitA + 0.1) {
          return error(`fase ${p.id}: ${(sign * p.currentA + extra).toFixed(1)} A na de start, grens ${p.limitA} A`);
        }
      }
    }

    // De droger zou nooit beginnen zonder "start op afstand", in de failsafe of in
    // handmatig, en zonder overschot alleen na zijn uiterlijke starttijd (besluit 98).
    for (const dx of d.explanation.deferrables ?? []) {
      if (dx.state !== 'would_start') continue;
      const s = state.deferrables?.[dx.id];
      if (!(s?.remoteStartAllowed.ok && s.remoteStartAllowed.value)) return error(`${dx.id} zou starten zonder "start op afstand"`);
      if (d.explanation.failsafe.active) return error(`${dx.id} zou starten in de failsafe`);
      if (isHandsOff(d.explanation.mode)) return error(`${dx.id} zou starten in handmatig`);
      if (d.commands.some((c) => 'actuatorId' in c && c.actuatorId === dx.id)) return error(`${dx.id} kreeg een opdracht in de schaduw`);
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
      // Een overgenomen apparaat krijgt niets, behalve van de failsafe (besluit 74).
      if (isOverridden(state, id) && !d.explanation.failsafe.active) {
        return error(`${id} krijgt een commando terwijl de bewoner het heeft overgenomen`);
      }

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

    // Hooguit één start op het budget per beslissing (besluit 68).
    const budgetStarts = d.accepted.filter(
      (i) => i.budgetW > 0 && isRunning(i.action) && !isRunning(action(state.actuators[i.actuatorId])),
    );
    if (budgetStarts.length > 1) {
      return error(`${budgetStarts.length} starts op het budget in één beslissing`);
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
    let overridden = 0;
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
      if (d.rejected.some((r) => r.blockedBy === 'resident_override')) overridden += 1;
    }
    expect(starts).toBeGreaterThan(50);
    expect(stops).toBeGreaterThan(50);
    expect(budgetBlock).toBeGreaterThan(50);
    expect(runtimeBlock).toBeGreaterThan(20);
    expect(failsafe).toBeGreaterThan(10);
    expect(overridden).toBeGreaterThan(20);
    // Voor wie het wil zien: npx vitest run test/invariants.test.ts
    expect(ACTIONS.length).toBe(4);
  });
});
