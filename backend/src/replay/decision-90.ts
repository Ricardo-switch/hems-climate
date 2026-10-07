/**
 * Kandidaat 2 van besluit 90, over de opgenomen historie: parkeren of meteen
 * uit, op wat er nog komt.
 *
 *   npx tsx src/replay/decision-90.ts <logmap> [venster.ndjson.gz ...]
 *
 * De logmap levert de beslislogboeken waaruit het plafond per zonnestand wordt
 * geleerd (`web/solar-learn.ts`). De ligging komt uit `HEMS_LAT` en `HEMS_LON`,
 * op één decimaal; zonder die twee rekent hij met het midden van Nederland. Dat
 * scheelt minder dan het lijkt: het plafond wordt met dezelfde ligging geleerd
 * als toegepast, dus een verschoven zon zit in beide.
 *
 * Dezelfde minuten, drie keer. Eén keer zoals de regeling nu is: wat de zon niet
 * meer draagt, gaat naar standby, en na de stabilisatie uit als het niet
 * hervat. Twee keer met de kandidaat: kan er volgens het geleerde plafond in het
 * komende kwartier niet meer genoeg zon komen om te hervatten, dan meteen uit.
 * "Genoeg" is het plafond min wat het huis verbruikt, en dat verbruik is één
 * keer dat van dit moment en één keer het laagste van het afgelopen uur.
 *
 * Gemeten op 7 oktober 2026 (zie besluit 90): met het verbruik van nu verliest
 * hij, met het laagste van het uur wint hij, nipt.
 *
 * De kandidaat wint als hij minder schakelt en minder opdrachten geeft, bij
 * hetzelfde comfort en niet meer netstroom (besluit 90). Comfort is hier niet
 * door te rekenen (de reconstructie speelt de gemeten temperaturen af); de maat
 * ervoor is hoeveel minuten er gedraaid wordt, en hoe vaak de kandidaat uitzet
 * waar de huidige regeling daarna gewoon hervatte.
 *
 * Alleen een meting: de regeling verandert er niet door. Een kandidaat gaat pas
 * na de start van B in de regeling, zodat de vergelijking deze winter zuiver
 * blijft.
 */

import { basename, join, resolve } from 'node:path';

import { exampleSite } from './site.js';
import { Cursor, configAt, loadHistory, snapshot } from './reconstruct.js';
import { OwnState } from '../adapters/own-state.js';
import { ShadowActuators } from '../adapters/shadow-actuators.js';
import { decide } from '../core/decide.js';
import type { Command, Decision } from '../core/decision.js';
import type { Action, SiteConfig } from '../core/model.js';
import { linesOf } from '../divergence/read.js';
import { defaultStrategies } from '../index.js';
import { SolarHistory, learnSolar, type QuarterDays } from '../web/solar-learn.js';
import { clearSkyW, type Location } from '../web/sun.js';

const TICK_MS = 60_000;
/** Hoe ver vooruit de kandidaat kijkt: de stabilisatie, met wat marge. */
const HORIZON_MS = 15 * 60_000;
/** De zonnesensor: sinds 4 oktober via Modbus, daarvoor de cloud (besluit 89). */
const SOLAR_IDS = ['sensor.solaredge_i1_ac_power', 'sensor.solaredge_huidig_vermogen'];

interface PerActuator {
  starts: number;
  resumes: number;
  parks: number;
  /** De kandidaat zette uit in plaats van te parkeren. */
  straightOff: number;
  commands: number;
  runMinutes: number;
  standbyMinutes: number;
  importWh: number;
}

type Outcome = Record<string, PerActuator>;

const isOn = (a: Action | null | undefined) => a === 'heat' || a === 'cool';

function empty(ids: readonly string[]): Outcome {
  return Object.fromEntries(
    ids.map((id) => [
      id,
      { starts: 0, resumes: 0, parks: 0, straightOff: 0, commands: 0, runMinutes: 0, standbyMinutes: 0, importWh: 0 },
    ]),
  );
}

/**
 * De zon per minuut uit het beslislogboek (`zonW`). De oudere replay-vensters
 * kennen geen zonnesensor, het logboek wel: sinds 10 september.
 */
async function solarFromLog(logDir: string, fromMs: number, toMs: number): Promise<Map<number, number>> {
  const byMinute = new Map<number, number>();
  for (let day = Math.floor(fromMs / 86_400_000) * 86_400_000; day <= toMs; day += 86_400_000) {
    const name = `decisions-${new Date(day).toISOString().slice(0, 10)}.ndjson`;
    for (const file of [name, `${name}.gz`]) {
      try {
        for await (const line of linesOf(join(logDir, file))) {
          const m = /"t":(\d+).*"zonW":(-?\d+(?:\.\d+)?)/.exec(line);
          if (m) byMinute.set(Math.floor(Number(m[1]) / TICK_MS), Number(m[2]));
        }
        break;
      } catch {
        // Dit dagbestand bestaat niet in deze vorm; probeer de andere.
      }
    }
  }
  return byMinute;
}

/** Wat er in de komende minuten bij een heldere lucht hooguit kan komen. */
type Ceiling = (ms: number) => number;

/**
 * De kandidaat: parkeren wordt meteen uit als het plafond van het komende
 * kwartier, min wat het huis zonder dit apparaat gebruikt, niet genoeg laat om
 * te hervatten. Geeft het besluit terug zoals het dan zou zijn, en welke
 * apparaten het betrof.
 */
/**
 * Welk verbruik van het huis de kandidaat aftrekt van het plafond. `nu` is het
 * verbruik van dit moment; `laagste uur` het laagste van het afgelopen uur, zodat
 * koken of een wasmachine de dag niet voorbij laat lijken terwijl de zon er nog is.
 */
type Base = 'nu' | 'laagste uur';

function candidate(
  decision: Decision,
  site: SiteConfig,
  ceiling: Ceiling,
  t: number,
  solarNow: number | null,
  base: Base,
  recentLoads: readonly number[],
): { decision: Decision; off: string[] } {
  const parked = decision.commands.filter(
    (c): c is Extract<Command, { kind: 'setAction' }> => c.kind === 'setAction' && c.action === 'standby',
  );
  if (parked.length === 0) return { decision, off: [] };
  const e = decision.explanation;
  const solar = e.solarProductionW ?? solarNow;
  if (solar == null) return { decision, off: [] };
  // Wat het huis zonder de draaiende apparaten verbruikt.
  const loadNow = solar + e.budget.gridPowerW - e.budget.reclaimableW;
  const baseLoad = base === 'nu' || recentLoads.length === 0 ? loadNow : Math.min(loadNow, ...recentLoads);
  let best = 0;
  for (let m = 0; m <= HORIZON_MS; m += 5 * 60_000) best = Math.max(best, ceiling(t + m));
  const off: string[] = [];
  for (const c of parked) {
    const a = site.actuators.find((x) => x.id === c.actuatorId);
    if (!a) continue;
    const need = Math.max(site.power.resumeSurplusW, a.power.estimatedW - site.power.stopImportW);
    if (best - baseLoad < need) off.push(c.actuatorId);
  }
  if (off.length === 0) return { decision, off };
  const commands = decision.commands.flatMap((c): Command[] => {
    if (!('actuatorId' in c) || !off.includes(c.actuatorId)) return [c];
    if (c.kind === 'setAction') return [{ ...c, action: 'off' }];
    // Het setpoint van de parkeerstand hoeft niet meer.
    return [];
  });
  const accepted = decision.accepted.map((i) => (off.includes(i.actuatorId) && i.action === 'standby' ? { ...i, action: 'off' as const } : i));
  return { decision: { ...decision, commands, accepted }, off };
}

async function measure(
  path: string,
  site: SiteConfig,
  ceiling: Ceiling | null,
  logged: Map<number, number>,
  base: Base = 'nu',
): Promise<{ outcome: Outcome; ticks: number; offAt: Map<string, number[]> }> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const own = new OwnState();
  const shadow = new ShadowActuators();
  const ids = site.actuators.filter((a) => a.capabilities.standby).map((a) => a.id);
  const outcome = empty(ids);
  const previous: Record<string, Action | null> = {};
  const offAt = new Map<string, number[]>();
  const loads: number[] = [];
  let ticks = 0;

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(site, cursor);
    const state = snapshot(config, cursor, t, own, shadow);
    const netW = state.power.gridPowerW.ok ? state.power.gridPowerW.value : 0;

    for (const id of ids) {
      const a = state.actuators[id]?.action;
      const action = a?.ok ? a.value : null;
      const was = id in previous ? previous[id]! : action;
      const per = outcome[id]!;
      if (!isOn(was) && isOn(action)) {
        if (was === 'standby') per.resumes += 1;
        else per.starts += 1;
      }
      if (isOn(was) && action === 'standby') per.parks += 1;
      if (isOn(action)) {
        per.runMinutes += 1;
        if (netW > 0) per.importWh += site.actuators.find((x) => x.id === id)!.power.estimatedW / 60;
      }
      if (action === 'standby') per.standbyMinutes += 1;
      previous[id] = action;
    }

    let decision = decide({ config, state, strategies });
    if (ceiling) {
      const solarNow = SOLAR_IDS.map((id) => cursor.number(id)).find((v) => v != null) ?? logged.get(Math.floor(t / TICK_MS)) ?? null;
      const c = candidate(decision, site, ceiling, t, solarNow, base, loads);
      decision = c.decision;
      for (const id of c.off) {
        outcome[id]!.straightOff += 1;
        offAt.set(id, [...(offAt.get(id) ?? []), t]);
      }
    }
    for (const c of decision.commands) {
      if ('actuatorId' in c && outcome[c.actuatorId]) outcome[c.actuatorId]!.commands += 1;
    }
    // Het verbruik van het huis zonder de draaiende apparaten, het laatste uur.
    const e = decision.explanation;
    const sun = e.solarProductionW ?? SOLAR_IDS.map((id) => cursor.number(id)).find((v) => v != null) ?? logged.get(Math.floor(t / TICK_MS));
    if (sun != null) {
      loads.push(sun + e.budget.gridPowerW - e.budget.reclaimableW);
      if (loads.length > 60) loads.shift();
    }
    own.apply(decision.commands, t);
    shadow.follow(decision);
    ticks += 1;
  }
  return { outcome, ticks, offAt };
}

/** Hervatte de huidige regeling binnen de stabilisatie na een moment waarop de kandidaat uitzette? */
async function resumedAfter(path: string, site: SiteConfig, moments: Map<string, number[]>): Promise<Map<string, number>> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const own = new OwnState();
  const shadow = new ShadowActuators();
  const wrong = new Map<string, number>();
  const watch = new Map<string, number>();
  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(site, cursor);
    const state = snapshot(config, cursor, t, own, shadow);
    for (const [id, ts] of moments) if (ts.includes(t)) watch.set(id, t);
    const decision = decide({ config, state, strategies });
    for (const [id, since] of watch) {
      if (t - since > HORIZON_MS) {
        watch.delete(id);
        continue;
      }
      const resumed = decision.commands.some((c) => c.kind === 'setAction' && c.actuatorId === id && isOn(c.action));
      if (resumed) {
        wrong.set(id, (wrong.get(id) ?? 0) + 1);
        watch.delete(id);
      }
    }
    own.apply(decision.commands, t);
    shadow.follow(decision);
  }
  return wrong;
}

const pad = (v: string | number, n: number) => String(v).padStart(n);

async function main(): Promise<void> {
  const logDir = process.argv[2];
  if (!logDir) {
    console.error('Gebruik: tsx src/replay/decision-90.ts <logmap> [venster.ndjson.gz ...]');
    process.exitCode = 1;
    return;
  }
  const paths = process.argv.length > 3 ? process.argv.slice(3) : ['data/replay/history-2026-09-30.ndjson.gz'];
  const lat = Number(process.env['HEMS_LAT'] ?? NaN);
  const lon = Number(process.env['HEMS_LON'] ?? NaN);
  const location: Location = Number.isFinite(lat) && Number.isFinite(lon) ? { latDeg: lat, lonDeg: lon } : { latDeg: 52.1, lonDeg: 5.1 };
  const geometry = exampleSite.geometry;
  if (!geometry) {
    console.error('De configuratie kent geen geometry; zonder panelen geen plafond.');
    process.exitCode = 1;
    return;
  }

  const solar = new SolarHistory({ logDir: resolve(logDir) });
  await solar.refresh();
  const all = solar.current;

  console.log('');
  console.log('  Besluit 90, kandidaat 2 — parkeren of meteen uit, op wat er nog komt');
  console.log('  ' + '═'.repeat(72));
  console.log(`  plafond uit ${Object.keys(all).length} dagen; ligging ${process.env['HEMS_LAT'] ? 'uit HEMS_LAT/HEMS_LON' : 'midden van Nederland'}`);

  for (const p of paths) {
    const path = resolve(p);
    const history = await loadHistory(path);
    // Niet de dagen van het venster zelf: geen blik in de toekomst.
    const fromDay = new Date(history.meta.fromMs).toISOString().slice(0, 10);
    const toDay = new Date(history.meta.toMs).toISOString().slice(0, 10);
    const others: QuarterDays = Object.fromEntries(Object.entries(all).filter(([d]) => d < fromDay || d > toDay));
    const learned = learnSolar(others, geometry, location);
    const ceiling: Ceiling = (ms) => clearSkyW(geometry, location, ms, learned);

    const logged = await solarFromLog(resolve(logDir), history.meta.fromMs, history.meta.toMs);
    const now = await measure(path, exampleSite, null, logged);
    const variants: [Base, Awaited<ReturnType<typeof measure>>, Map<string, number>][] = [];
    for (const base of ['nu', 'laagste uur'] as const) {
      const cand = await measure(path, exampleSite, ceiling, logged, base);
      variants.push([base, cand, await resumedAfter(path, exampleSite, cand.offAt)]);
    }

    console.log('');
    console.log(
      `  ${basename(path)}  (${now.ticks.toLocaleString('nl-NL')} minuten, zon uit het logboek voor ${logged.size.toLocaleString('nl-NL')}; plafond uit ${learned.days} andere dagen)`,
    );
    console.log('');
    console.log('                  starts  hervat  parkeren  opdrachten  draaien(min)  standby(min)  netstroom(kWh)');
    const row = (o: PerActuator) =>
      `${pad(o.starts, 6)}${pad(o.resumes, 8)}${pad(o.parks, 10)}${pad(o.commands, 12)}${pad(o.runMinutes, 14)}${pad(o.standbyMinutes, 14)}${pad((o.importWh / 1000).toFixed(2), 16)}`;
    for (const id of Object.keys(now.outcome)) {
      console.log(`  ${id.padEnd(14)}${row(now.outcome[id]!)}   zoals nu`);
      for (const [base, cand, wrong] of variants) {
        const b = cand.outcome[id]!;
        console.log(`  ${''.padEnd(14)}${row(b)}   kandidaat, basis ${base}`);
        console.log(`  ${''.padEnd(14)}    meteen uit ${b.straightOff}×, waarvan de huidige regeling binnen ${HORIZON_MS / 60_000} min hervatte: ${wrong.get(id) ?? 0}×`);
      }
    }
  }
  console.log('');
}

await main();
