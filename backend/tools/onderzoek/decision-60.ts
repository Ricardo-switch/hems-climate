/**
 * Wat besluit 60 met het gedrag doet, over de opgenomen historie.
 *
 *   npx tsx src/replay/decision-60.ts [venster.ndjson.gz ...]
 *
 * Twee keer dezelfde minuten, met alles zoals het op de NAS draait (eigen
 * apparaatstand, comfortplafond, startdrempel). Eén keer leest de schaduw de
 * stabilisatietimer van het oude systeem (`timer.pv_stabilisatie`), zoals tot
 * nu toe; één keer zijn eigen timer, die loopt wanneer de arbiter zelf iets
 * start.
 *
 * Waar de timer over gaat: na een start vijf minuten geen tweede start, zodat
 * het vermogen van de eerste airco in de meting zit voordat er over de tweede
 * wordt beslist. En een geparkeerde airco (standby) blijft zolang geparkeerd in
 * plaats van meteen uit te gaan.
 *
 * Wat je hier ziet en wat niet: hoe vaak er gestart wordt, hoe snel achter
 * elkaar, hoe lang er geparkeerd wordt, en hoe vaak de arbiter het oneens is met
 * het oude systeem. Niet wat het met de temperatuur doet — de reconstructie
 * speelt de gemeten temperaturen af (zie `reconstruct.ts`).
 */

import { basename, resolve } from 'node:path';

import { exampleSite, withLegacyStabilisation } from '../../src/replay/site.js';
import { Cursor, configAt, loadHistory, snapshot } from '../../src/replay/reconstruct.js';
import { OwnState } from '../../src/adapters/own-state.js';
import { ShadowActuators } from '../../src/adapters/shadow-actuators.js';
import { decide } from '../../src/core/decide.js';
import type { Action, SiteConfig } from '../../src/core/model.js';
import { defaultStrategies } from '../../src/index.js';

const TICK_MS = 60_000;
const ACTUATORS = ['ac-woonkamer', 'ac-zolder'] as const;
type ActuatorId = (typeof ACTUATORS)[number];

const CLIMATE: Readonly<Record<ActuatorId, string>> = {
  'ac-woonkamer': 'climate.air_conditioning_woonkamer',
  'ac-zolder': 'climate.air_conditioning_zolder',
};

/** De opstelling tot nu toe: de timer van het oude systeem. */
const LEGACY_TIMER: SiteConfig = withLegacyStabilisation(exampleSite);

/** De opstelling van besluit 60: de eigen timer. Zo staat de configuratie nu. */
const OWN_TIMER: SiteConfig = (() => {
  const { stabilisation: _omitted, ...rest } = exampleSite.timers ?? {};
  return { ...exampleSite, timers: rest };
})();

function isOn(a: Action | null | undefined): boolean {
  return a === 'heat' || a === 'cool';
}

/** Draaide het échte apparaat, met de standby-conventie van het oude systeem. */
function actuallyRunning(cursor: Cursor, id: ActuatorId): boolean {
  const state = cursor.state(CLIMATE[id]);
  const setpoint = cursor.attrNumber(CLIMATE[id], 'temperature');
  const standby =
    (state === 'heat' && setpoint != null && setpoint <= 18) ||
    (state === 'cool' && setpoint != null && setpoint >= 25);
  return (state === 'heat' || state === 'cool') && !standby;
}

interface PerActuator {
  starts: number;
  /** Starts binnen vijf minuten na een start van een ánder apparaat. */
  quickSecondStarts: number;
  /** Duur van elke afgeronde parkeerbeurt (standby), in minuten. */
  parks: number[];
  /** Minuten: de arbiter zou draaien, het oude systeem draaide niet. */
  wouldRun: number;
  /** Minuten: het oude systeem draaide, de arbiter zou het niet. */
  wouldStop: number;
  /** Minuten draaien tijdens netinvoer terwijl het echte apparaat stilstond. */
  importMinutes: number;
  importWh: number;
}

interface Outcome {
  ticks: number;
  /** Starts van het échte apparaat, door het oude systeem. Gelijk in beide opstellingen. */
  legacyStarts: Record<ActuatorId, number>;
  timerMinutes: number;
  actuator: Record<ActuatorId, PerActuator>;
  blocks: Map<string, number>;
}

function empty(): Outcome {
  const per = (): PerActuator => ({
    starts: 0,
    quickSecondStarts: 0,
    parks: [],
    wouldRun: 0,
    wouldStop: 0,
    importMinutes: 0,
    importWh: 0,
  });
  return {
    ticks: 0,
    legacyStarts: { 'ac-woonkamer': 0, 'ac-zolder': 0 },
    timerMinutes: 0,
    actuator: { 'ac-woonkamer': per(), 'ac-zolder': per() },
    blocks: new Map(),
  };
}

async function measure(path: string, site: SiteConfig): Promise<Outcome> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const own = new OwnState();
  const shadow = new ShadowActuators();
  const result = empty();

  const previous: Record<string, Action | null> = {};
  const parkedSince: Record<string, number | null> = {};
  const lastStart: Record<string, number | null> = {};
  const realBefore: Record<string, boolean> = {};

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(site, cursor);
    const state = snapshot(config, cursor, t, own, shadow);
    if (state.timers.stabilisation.endsAtMs != null && state.timers.stabilisation.endsAtMs > t) {
      result.timerMinutes += 1;
    }

    // De stand waarmee de arbiter deze minuut ingaat.
    const netW = cursor.number('sensor.p1_meter_power') ?? 0;
    for (const id of ACTUATORS) {
      const a = state.actuators[id]?.action;
      const action = a?.ok ? a.value : null;
      const was = id in previous ? previous[id]! : action;
      const per = result.actuator[id];

      if (!isOn(was) && isOn(action)) {
        per.starts += 1;
        const other = ACTUATORS.find((o) => o !== id)!;
        const otherStart = lastStart[other];
        if (otherStart != null && t - otherStart < 5 * TICK_MS) per.quickSecondStarts += 1;
        lastStart[id] = t;
      }
      if (was !== 'standby' && action === 'standby') parkedSince[id] = t;
      if (was === 'standby' && action !== 'standby' && parkedSince[id] != null) {
        per.parks.push((t - parkedSince[id]!) / TICK_MS);
        parkedSince[id] = null;
      }
      previous[id] = action;

      const real = actuallyRunning(cursor, id);
      if (id in realBefore && !realBefore[id] && real) result.legacyStarts[id] += 1;
      realBefore[id] = real;
      if (isOn(action) && !real) per.wouldRun += 1;
      if (!isOn(action) && real) per.wouldStop += 1;
      if (netW > 0 && isOn(action) && !real) {
        const estimate = exampleSite.actuators.find((x) => x.id === id)!.power.estimatedW;
        per.importMinutes += 1;
        per.importWh += estimate / 60;
      }
    }

    const decision = decide({ config, state, strategies });
    own.apply(decision.commands, t);
    shadow.follow(decision);
    result.ticks += 1;
    for (const r of decision.rejected) {
      result.blocks.set(r.blockedBy, (result.blocks.get(r.blockedBy) ?? 0) + 1);
    }
  }
  return result;
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

const pad = (v: string | number, n: number): string => String(v).padStart(n);

function show(name: string, legacy: Outcome, mine: Outcome): void {
  console.log('');
  console.log(`  ${name}  (${mine.ticks.toLocaleString('nl-NL')} minuten)`);
  console.log(
    `  stabilisatietimer actief: ${legacy.timerMinutes} min (oude timer)  →  ${mine.timerMinutes} min (eigen timer)`,
  );
  console.log('');
  console.log('                    starts    2e start <5 min   parkeerbeurten   mediaan parkeren');
  console.log('                  oud  eigen     oud  eigen        oud  eigen        oud   eigen');
  for (const id of ACTUATORS) {
    const l = legacy.actuator[id];
    const m = mine.actuator[id];
    console.log(
      `  ${id.padEnd(14)}${pad(l.starts, 5)}${pad(m.starts, 6)}  ${pad(l.quickSecondStarts, 6)}${pad(m.quickSecondStarts, 6)}  ` +
        `${pad(l.parks.length, 10)}${pad(m.parks.length, 6)}  ${pad(median(l.parks).toFixed(1), 10)}${pad(median(m.parks).toFixed(1), 7)} min` +
        `   (oude systeem zelf: ${mine.legacyStarts[id]} starts)`,
    );
  }
  console.log('');
  console.log('  oneens met het oude systeem (minuten)   ik zou draaien     ik zou stoppen    invoer bij draaien');
  console.log('                                           oud   eigen        oud   eigen        oud    eigen');
  for (const id of ACTUATORS) {
    const l = legacy.actuator[id];
    const m = mine.actuator[id];
    console.log(
      `  ${id.padEnd(38)}${pad(l.wouldRun, 6)}${pad(m.wouldRun, 7)}  ${pad(l.wouldStop, 9)}${pad(m.wouldStop, 7)}  ` +
        `${pad((l.importWh / 1000).toFixed(2), 9)}${pad((m.importWh / 1000).toFixed(2), 8)} kWh`,
    );
  }
  const codes = [...new Set([...legacy.blocks.keys(), ...mine.blocks.keys()])].sort();
  console.log('');
  console.log('  blokkade                          oud     eigen');
  for (const c of codes) {
    console.log(`  ${c.padEnd(30)}${pad(legacy.blocks.get(c) ?? 0, 7)}${pad(mine.blocks.get(c) ?? 0, 10)}`);
  }
}

async function main(): Promise<void> {
  const paths =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];

  console.log('');
  console.log('  Besluit 60 — de stabilisatie op de eigen timer');
  console.log('  ' + '═'.repeat(70));
  for (const p of paths) {
    const path = resolve(p);
    show(basename(path), await measure(path, LEGACY_TIMER), await measure(path, OWN_TIMER));
  }
  console.log('');
}

await main();
