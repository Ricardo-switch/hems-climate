/**
 * Kandidaten 3 en 4 van besluit 90, over de opgenomen historie: grenzen per uur.
 *
 *   npx tsx src/replay/decision-90-limits.ts [venster.ndjson.gz ...]
 *
 * Kandidaat 3 beschermt de compressor: hooguit een aantal starts per uur per
 * apparaat, met de minimale draaitijd als ondergrens. Kandidaat 4 is het
 * piepbudget van deel 1: hooguit een aantal opdrachten per uur per apparaat,
 * goed voor de oren en voor het apparaat.
 *
 * Eerst de vraag of zo'n grens hier ooit iets doet: hoeveel uren de regeling
 * van nu boven een grens komt. Dan dezelfde minuten met de grens erin. Een start
 * of een nieuw setpoint boven de grens vervalt; afbouwen, parkeren en uitzetten
 * nooit, want dan bleef een airco op netstroom draaien.
 *
 * Een kandidaat wint als hij minder schakelt en minder opdrachten geeft, bij
 * hetzelfde comfort en niet meer netstroom. Comfort is hier niet door te
 * rekenen (de reconstructie speelt de gemeten temperaturen af); de maat ervoor
 * is hoeveel minuten er gedraaid wordt.
 *
 * Alleen een meting: de regeling verandert er niet door (besluit 90, deel 2).
 */

import { basename, resolve } from 'node:path';

import { exampleSite } from '../../src/replay/site.js';
import { Cursor, configAt, loadHistory, snapshot } from '../../src/replay/reconstruct.js';
import { OwnState } from '../../src/adapters/own-state.js';
import { ShadowActuators } from '../../src/adapters/shadow-actuators.js';
import { decide } from '../../src/core/decide.js';
import type { Command } from '../../src/core/decision.js';
import type { Action, SiteConfig } from '../../src/core/model.js';
import { defaultStrategies } from '../../src/index.js';

const TICK_MS = 60_000;
const HOUR_MS = 3_600_000;

const isOn = (a: Action | null | undefined) => a === 'heat' || a === 'cool';

interface Limits {
  readonly name: string;
  /** Hooguit zoveel starts per uur per apparaat; null is geen grens. */
  readonly startsPerHour: number | null;
  /** Hooguit zoveel opdrachten (stand of setpoint, geen afbouw) per uur per apparaat. */
  readonly commandsPerHour: number | null;
}

interface PerActuator {
  starts: number;
  commands: number;
  runMinutes: number;
  importWh: number;
  /** Starts en opdrachten die door de grens vervielen. */
  droppedStarts: number;
  droppedCommands: number;
  /** Per klokuur: starts en opdrachten, voor de verdeling. */
  hourStarts: Map<number, number>;
  hourCommands: Map<number, number>;
}

function empty(): PerActuator {
  return { starts: 0, commands: 0, runMinutes: 0, importWh: 0, droppedStarts: 0, droppedCommands: 0, hourStarts: new Map(), hourCommands: new Map() };
}

/** Telt wat er in het afgelopen uur gebeurde. */
const inLastHour = (times: readonly number[], t: number) => times.filter((x) => t - x < HOUR_MS).length;

async function measure(path: string, site: SiteConfig, limits: Limits): Promise<{ per: Record<string, PerActuator>; ticks: number }> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const own = new OwnState();
  const shadow = new ShadowActuators();
  const ids = site.actuators.filter((a) => a.capabilities.canCool || a.capabilities.canHeat).map((a) => a.id);
  const per: Record<string, PerActuator> = Object.fromEntries(ids.map((id) => [id, empty()]));
  const startTimes: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  const commandTimes: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  let ticks = 0;

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(site, cursor);
    const state = snapshot(config, cursor, t, own, shadow);
    const netW = state.power.gridPowerW.ok ? state.power.gridPowerW.value : 0;
    const now: Record<string, Action | null> = {};
    for (const id of ids) {
      const a = state.actuators[id]?.action;
      now[id] = a?.ok ? a.value : null;
      if (isOn(now[id])) {
        per[id]!.runMinutes += 1;
        if (netW > 0) per[id]!.importWh += site.actuators.find((x) => x.id === id)!.power.estimatedW / 60;
      }
    }

    const decision = decide({ config, state, strategies });
    // Welke apparaten deze minuut iets zouden starten of bijstellen, en of de grens dat toelaat.
    const blocked = new Set<string>();
    for (const id of ids) {
      const mine = decision.commands.filter((c) => 'actuatorId' in c && c.actuatorId === id);
      if (mine.length === 0) continue;
      const starts = mine.some((c) => c.kind === 'setAction' && isOn(c.action) && !isOn(now[id]));
      // Afbouwen gaat altijd door: uit, parkeren, of een stand die niet draait.
      const windDown = mine.some((c) => c.kind === 'setAction' && !isOn(c.action));
      if (windDown) continue;
      if (starts && limits.startsPerHour != null && inLastHour(startTimes[id]!, t) >= limits.startsPerHour) {
        blocked.add(id);
        per[id]!.droppedStarts += 1;
        continue;
      }
      if (limits.commandsPerHour != null && inLastHour(commandTimes[id]!, t) + mine.filter((c) => c.kind !== 'startTimer').length > limits.commandsPerHour) {
        blocked.add(id);
        per[id]!.droppedCommands += mine.length;
      }
    }
    const commands: Command[] = decision.commands.filter((c) => !('actuatorId' in c) || !blocked.has(c.actuatorId));
    const kept = { ...decision, commands };

    const hour = Math.floor(t / HOUR_MS);
    for (const c of commands) {
      if (!('actuatorId' in c) || !per[c.actuatorId]) continue;
      const p = per[c.actuatorId]!;
      p.commands += 1;
      commandTimes[c.actuatorId]!.push(t);
      p.hourCommands.set(hour, (p.hourCommands.get(hour) ?? 0) + 1);
      if (c.kind === 'setAction' && isOn(c.action) && !isOn(now[c.actuatorId])) {
        p.starts += 1;
        startTimes[c.actuatorId]!.push(t);
        p.hourStarts.set(hour, (p.hourStarts.get(hour) ?? 0) + 1);
      }
    }
    own.apply(commands, t);
    shadow.follow(kept);
    ticks += 1;
  }
  return { per, ticks };
}

const pad = (v: string | number, n: number) => String(v).padStart(n);

/** Hoeveel klokuren er 0, 1, 2, 3 of meer keer iets gebeurde. */
function spread(hours: Map<number, number>): string {
  const counts = [0, 0, 0, 0];
  for (const n of hours.values()) counts[Math.min(3, n)]! += 1;
  return `1×: ${counts[1]}, 2×: ${counts[2]}, 3× of meer: ${counts[3]}`;
}

async function main(): Promise<void> {
  const paths = process.argv.length > 2 ? process.argv.slice(2) : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];
  const variants: Limits[] = [
    { name: 'zoals nu', startsPerHour: null, commandsPerHour: null },
    { name: 'hooguit 2 starts per uur', startsPerHour: 2, commandsPerHour: null },
    { name: 'hooguit 3 starts per uur', startsPerHour: 3, commandsPerHour: null },
    { name: 'hooguit 4 opdrachten per uur', startsPerHour: null, commandsPerHour: 4 },
    { name: 'hooguit 6 opdrachten per uur', startsPerHour: null, commandsPerHour: 6 },
  ];

  console.log('');
  console.log('  Besluit 90, kandidaten 3 en 4 — grenzen op starts en opdrachten per uur');
  console.log('  ' + '═'.repeat(72));
  for (const p of paths) {
    const path = resolve(p);
    const results = [];
    for (const v of variants) results.push({ v, r: await measure(path, exampleSite, v) });
    console.log('');
    console.log(`  ${basename(path)}  (${results[0]!.r.ticks.toLocaleString('nl-NL')} minuten)`);
    const base = results[0]!.r.per;
    for (const id of Object.keys(base)) {
      const b = base[id]!;
      if (b.commands === 0) continue;
      console.log('');
      console.log(`  ${id}: per klokuur zoals nu — starts ${spread(b.hourStarts)}; opdrachten ${spread(b.hourCommands)}`);
      console.log('                                     starts  opdrachten  draaien(min)  netstroom(kWh)  vervallen');
      for (const { v, r } of results) {
        const o = r.per[id]!;
        console.log(
          `    ${v.name.padEnd(32)}${pad(o.starts, 7)}${pad(o.commands, 12)}${pad(o.runMinutes, 14)}${pad((o.importWh / 1000).toFixed(2), 16)}` +
            `${pad(o.droppedStarts ? `${o.droppedStarts} starts` : o.droppedCommands ? `${o.droppedCommands} opdr.` : '—', 12)}`,
        );
      }
    }
  }
  console.log('');
}

await main();
