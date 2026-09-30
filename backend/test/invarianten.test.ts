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
const GEVALLEN = Number(process.env['HEMS_INVARIANT_RUNS'] ?? 3_000);
const STARTGETAL = Number(process.env['HEMS_INVARIANT_SEED'] ?? 20260930);

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

interface Kans {
  getal(min: number, max: number): number;
  geheel(min: number, max: number): number;
  kans(p: number): boolean;
  een<T>(lijst: readonly T[]): T;
}

function kansen(r: () => number): Kans {
  return {
    getal: (min, max) => Math.round((min + r() * (max - min)) * 10) / 10,
    geheel: (min, max) => Math.floor(min + r() * (max - min + 1)),
    kans: (p) => r() < p,
    een: (lijst) => lijst[Math.floor(r() * lijst.length)]!,
  };
}

/** Een apparaatstand die het apparaat kan aannemen, rond het moment `nu`. */
function apparaat(k: Kans, config: SiteConfig, id: string, nu: number): ActuatorState {
  const caps = actuatorById(config, id).capabilities;
  const mogelijk: Action[] = ['off'];
  if (caps.canHeat) mogelijk.push('heat');
  if (caps.canCool) mogelijk.push('cool');
  if (caps.standby) mogelijk.push('standby');
  const actie = k.een(mogelijk);
  const [minC, maxC] = caps.setpointRange;
  return {
    action: k.kans(0.05) ? unavailable<Action>() : value(actie, nu),
    setpointC: k.kans(0.2) ? unavailable<number>() : value(k.getal(minC, maxC), nu),
    powerW: k.kans(0.2) ? unavailable<number>() : value(k.geheel(0, 1400), nu),
    // De helft kort geleden geschakeld: daar zitten de draaitijdregels.
    lastChangeMs: k.kans(0.1)
      ? null
      : nu - (k.kans(0.5) ? k.geheel(0, 20) : k.geheel(0, 120)) * 60_000,
    producing: k.kans(0.5) ? unavailable<boolean>('missing') : value(k.kans(0.5), nu),
    producingSinceMs: nu - k.geheel(0, 60) * 60_000,
  };
}

function toestand(k: Kans, config: SiteConfig): SystemState {
  const modi: (Mode | null)[] = [null, null, null, ...MODES];
  // Elk uur van de dag, voor de modi; alles hieronder rekent vanaf dit moment.
  const nu = NOW + k.geheel(0, 24 * 60) * 60_000;
  return {
    nowMs: nu,
    modeOverride: k.een(modi),
    outdoorTemperatureC: unavailable<number>('missing'),
    solarProductionW: unavailable<number>('missing'),
    occupancy: Object.fromEntries(config.occupancy.map((o) => [o.id, value(k.kans(0.6), NOW)])),
    zones: Object.fromEntries(
      config.zones.map((z) => [
        z.id,
        { temperatureC: k.kans(0.03) ? unavailable<number>() : value(k.getal(10, 32), NOW) },
      ]),
    ),
    actuators: Object.fromEntries(config.actuators.map((a) => [a.id, apparaat(k, config, a.id, nu)])),
    power: {
      gridPowerW: k.kans(0.03) ? unavailable<number>() : value(k.geheel(-4000, 3000), NOW),
    },
    timers: {
      stabilisation: { endsAtMs: k.kans(0.3) ? nu + k.geheel(-10, 10) * 60_000 : null },
      manualOverride: { endsAtMs: null },
    },
    lights: Object.fromEntries(
      config.schedule.eveningExtensionLights.map((l) => [l.id, value(k.kans(0.3), NOW)]),
    ),
    sunAboveHorizon: value(k.kans(0.6), NOW),
    // Meestal gezond; soms hapert er een meetpunt en moet de failsafe het
    // overnemen.
    inputHealth: Object.fromEntries(config.criticalInputs.map((r) => [r.id, !k.kans(0.02)])),
  };
}

function isRunning(a: Action | undefined): boolean {
  return a === 'heat' || a === 'cool';
}

function actie(s: ActuatorState | undefined): Action | undefined {
  return s?.action.ok ? s.action.value : undefined;
}

/**
 * Loopt alle gevallen af en controleert elke regel. Geeft de eerste overtreding
 * terug, met genoeg om hem na te spelen.
 */
function controleer(config: SiteConfig): string | null {
  const k = kansen(generator(STARTGETAL));
  const strategies = defaultStrategies();

  for (let geval = 0; geval < GEVALLEN; geval += 1) {
    const state = toestand(k, config);
    const d: Decision = decide({ config, state, strategies });
    const fout = (regel: string): string =>
      `geval ${geval} (startgetal ${STARTGETAL}): ${regel}\n${JSON.stringify(state)}`;

    // Zelfde toestand, zelfde besluit.
    const nogEens = decide({ config, state, strategies });
    if (JSON.stringify(nogEens) !== JSON.stringify(d)) return fout('niet deterministisch');

    // Nooit meer toegewezen dan er is.
    const b = d.explanation.budget;
    if (b.allocatedW > b.availableW) {
      return fout(`${b.allocatedW} W toegewezen van ${b.availableW} W`);
    }

    // In handmatig trekt de regeling zich terug, behalve bij de failsafe.
    if (isHandsOff(d.explanation.mode) && !d.explanation.failsafe.active && d.commands.length > 0) {
      return fout('commando in handmatig zonder failsafe');
    }

    const perApparaat = new Map<string, Command[]>();
    for (const c of d.commands) {
      if (c.kind !== 'setAction' && c.kind !== 'setSetpoint') continue;
      perApparaat.set(c.actuatorId, [...(perApparaat.get(c.actuatorId) ?? []), c]);
    }

    for (const [id, cmds] of perApparaat) {
      const apparaatCfg = actuatorById(config, id);
      const caps = apparaatCfg.capabilities;
      const nu = state.actuators[id];
      const acties = cmds.filter((c): c is Extract<Command, { kind: 'setAction' }> => c.kind === 'setAction');

      if (acties.length > 1) return fout(`${id} krijgt ${acties.length} schakelcommando's`);

      for (const c of cmds) {
        if (c.kind === 'setSetpoint') {
          const [minC, maxC] = caps.setpointRange;
          if (c.setpointC < minC || c.setpointC > maxC) {
            return fout(`${id} setpoint ${c.setpointC} buiten ${minC}-${maxC}`);
          }
        }
      }

      const naar = acties[0]?.action;
      if (naar == null) continue;

      // Nooit een stand die het apparaat niet kan.
      if (naar === 'heat' && !caps.canHeat) return fout(`${id} kan niet verwarmen`);
      if (naar === 'cool' && !caps.canCool) return fout(`${id} kan niet koelen`);
      if (naar === 'standby' && !caps.standby) return fout(`${id} kent geen standby`);

      // Bij de failsafe gaat er nooit een airco aan.
      if (d.explanation.failsafe.active && apparaatCfg.role === 'assist' && isRunning(naar)) {
        return fout(`${id} start terwijl de failsafe aanstaat`);
      }

      if (nu == null) continue;
      const draait = isRunning(actie(nu));
      const minuten = minutesSinceChange(nu, state.nowMs);

      // Geen stop binnen de minimale draaitijd.
      if (draait && !isRunning(naar) && minuten < apparaatCfg.timing.minRunMinutes) {
        return fout(`${id} stopt na ${minuten.toFixed(1)} min, minimum ${apparaatCfg.timing.minRunMinutes}`);
      }
      // Geen start binnen de rusttijd.
      if (!draait && isRunning(naar) && minuten < apparaatCfg.timing.minRestMinutes) {
        return fout(`${id} start na ${minuten.toFixed(1)} min rust, minimum ${apparaatCfg.timing.minRestMinutes}`);
      }
    }

    // Geen start op overschot onder de startdrempel (besluit 51). Alleen voor
    // voorstellen die vermogen claimen en een apparaat dat echt uit stond.
    for (const i of d.accepted) {
      if (i.budgetW <= 0 || !isRunning(i.action)) continue;
      const nu = actie(state.actuators[i.actuatorId]);
      if (nu === 'off' && b.availableW - config.power.stopImportW < config.power.startSurplusW) {
        return fout(`${i.actuatorId} start op ${b.availableW} W, drempel ${config.power.startSurplusW}`);
      }
    }
  }
  return null;
}

describe('regels die altijd gelden', () => {
  it(`houden voor ${GEVALLEN} gegenereerde toestanden`, () => {
    expect(controleer(exampleSite)).toBeNull();
  });

  it('houden ook zonder comfortplafond', () => {
    // Het plafond is een keuze per woning; de regels mogen er niet van afhangen.
    const zonder: SiteConfig = {
      ...exampleSite,
      zones: exampleSite.zones.map((z) => {
        const { comfortMaxC: _weg, ...rest } = z;
        return rest;
      }),
    };
    expect(controleer(zonder)).toBeNull();
  });

  it('dekken de interessante gevallen', () => {
    // Een generator die alleen saaie toestanden maakt, bewijst niets. Tel wat
    // er langskwam.
    const k = kansen(generator(STARTGETAL));
    const strategies = defaultStrategies();
    let starts = 0;
    let stops = 0;
    let budgetBlok = 0;
    let draaitijdBlok = 0;
    let failsafe = 0;
    for (let geval = 0; geval < GEVALLEN; geval += 1) {
      const d = decide({ config: exampleSite, state: toestand(k, exampleSite), strategies });
      for (const c of d.commands) {
        if (c.kind !== 'setAction') continue;
        if (isRunning(c.action)) starts += 1;
        else stops += 1;
      }
      if (d.rejected.some((r) => r.blockedBy === 'insufficient_power_budget')) budgetBlok += 1;
      if (d.rejected.some((r) => r.blockedBy === 'min_run_not_elapsed')) draaitijdBlok += 1;
      if (d.explanation.failsafe.active) failsafe += 1;
    }
    expect(starts).toBeGreaterThan(50);
    expect(stops).toBeGreaterThan(50);
    expect(budgetBlok).toBeGreaterThan(50);
    expect(draaitijdBlok).toBeGreaterThan(20);
    expect(failsafe).toBeGreaterThan(10);
    // Voor wie het wil zien: npx vitest run test/invarianten.test.ts
    expect(ACTIONS.length).toBe(4);
  });
});
