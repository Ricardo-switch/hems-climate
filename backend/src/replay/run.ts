/**
 * De replay-harness.
 *
 *   npx tsx src/replay/run.ts [data/replay/history.ndjson.gz]
 *
 * Loopt het historische venster per minuut af, reconstrueert de toestand zoals
 * die werkelijk was, laat de arbiter beslissen, en vergelijkt.
 *
 * Wat dit wel is: een schaduwvergelijking. Op elk moment krijgt de arbiter de
 * echte toestand van dat moment. Wat dit niet is: een gesloten simulatie. We
 * rekenen niet door hoe de temperatuur zich ontwikkeld zou hebben als de
 * arbiter het stuur had gehad — dat wordt na de eerste afwijking fictie, en dan
 * vergelijk je je eigen aannames in plaats van twee regelaars.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { exampleSite } from './site.js';
import { decide } from '../core/decide.js';
import { defaultStrategies } from '../index.js';
import {
  ASSIST_IDS,
  accumulate,
  classifyLegacyReason,
  emptyTotals,
  intendedAction,
  isDrawingPower,
  type AssistId,
  type TickComparison,
} from './compare.js';
import { Cursor, configAt, loadHistory, snapshot } from './reconstruct.js';
import { OwnState } from '../adapters/own-state.js';

const TICK_MINUTES = 1;
const TICK_MS = TICK_MINUTES * 60_000;

/** Feitelijk vermogen van een assist-apparaat volgens de geschiedenis. */
const POWER_ENTITY: Readonly<Record<AssistId, string>> = {
  'ac-woonkamer': 'sensor.air_conditioning_woonkamer_energy_current',
  'ac-zolder': 'sensor.air_conditioning_zolder_energy_current',
};

const CLIMATE_ENTITY: Readonly<Record<AssistId, string>> = {
  'ac-woonkamer': 'climate.air_conditioning_woonkamer',
  'ac-zolder': 'climate.air_conditioning_zolder',
};

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const path = resolve(process.argv[2] ?? 'data/replay/history.ndjson.gz');
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  // De stabilisatietimer houdt de dienst zelf bij (besluit 60).
  const own = new OwnState();
  const totals = emptyTotals(TICK_MINUTES);
  const samples: TickComparison[] = [];
  let heatAssistProposals = 0;

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  const end = history.meta.toMs;

  for (let t = start; t <= end; t += TICK_MS) {
    cursor.advanceTo(t);

    const config = configAt(exampleSite, cursor);
    const state = snapshot(config, cursor, t, own);
    const decision = decide({ config, state, strategies });
    own.apply(decision.commands, t);

    // Wat het oude systeem op dit moment feitelijk deed.
    const legacyRunning = {} as Record<AssistId, boolean>;
    const legacyPowerW = {} as Record<AssistId, number>;
    let legacyDrawW = 0;
    for (const id of ASSIST_IDS) {
      const haState = cursor.state(CLIMATE_ENTITY[id]);
      const setpoint = cursor.attrNumber(CLIMATE_ENTITY[id], 'temperature');
      // Dezelfde standby-conventie als de reconstructie: 18 en 25 betekenden
      // "aan maar vraagt niets".
      const standby =
        (haState === 'heat' && setpoint != null && setpoint <= 18) ||
        (haState === 'cool' && setpoint != null && setpoint >= 25);
      const running = (haState === 'heat' || haState === 'cool') && !standby;
      const powerW = cursor.number(POWER_ENTITY[id]) ?? 0;
      legacyRunning[id] = running;
      legacyPowerW[id] = powerW;
      if (running) legacyDrawW += powerW;
    }

    // Wat er ná dit besluit werkelijk zou draaien. Let op het verschil met
    // "welk voorstel is aanvaard": wanneer de minimale draaitijd het
    // afschakelen tegenhoudt, gaat er geen commando uit en blijft het apparaat
    // gewoon aan. Dat als "teruggeschakeld" tellen zou de uitkomst mooier maken
    // dan hij is.
    const arbiterRunning = {} as Record<AssistId, boolean>;
    for (const id of ASSIST_IDS) {
      const cmd = decision.commands.find(
        (c) => c.kind === 'setAction' && c.actuatorId === id,
      );
      const resulting =
        cmd && cmd.kind === 'setAction'
          ? cmd.action
          : (intendedAction(decision, id) ??
            (legacyRunning[id] ? 'cool' : 'off'));
      arbiterRunning[id] = isDrawingPower(resulting);
    }

    const budget = decision.explanation.budget;
    const gridW = cursor.number('sensor.p1_meter_power') ?? 0;

    // Wat er werkelijk uit het net kwam en aan de airco's toe te rekenen valt.
    //
    // Niet: "verbruik minus overschot". Het netvermogen bevat het airco-verbruik
    // al, dus een huis dat 532 W teruglevert terwijl de airco's 596 W trekken
    // draait volledig op zon — daar valt niets toe te rekenen. Alleen wanneer er
    // daadwerkelijk geïmporteerd wordt bóven de tolerantie is er een tekort, en
    // dan hoogstens zoveel als de airco's zelf opnemen.
    const overBudgetW = Math.max(
      0,
      Math.min(gridW - config.power.stopImportW, legacyDrawW),
    );

    const comparison: TickComparison = {
      tMs: t,
      mode: decision.explanation.mode,
      surplusW: budget.surplusW,
      availableW: budget.availableW,
      allocatedW: budget.allocatedW,
      gridPowerW: gridW,
      legacy: classifyLegacyReason(cursor.state('sensor.airco_assist_reden')),
      legacyRunning,
      legacyPowerW,
      arbiterRunning,
      legacyOverBudgetW: overBudgetW,
      failsafe: decision.explanation.failsafe.active,
    };

    heatAssistProposals += decision.proposed.filter(
      (i) => i.strategyId === 'heat-assist',
    ).length;

    accumulate(totals, comparison);
    if (overBudgetW > 0) {
      const anyLegacy = ASSIST_IDS.some((id) => legacyRunning[id]);
      const arbiterSheds = ASSIST_IDS.some(
        (id) => legacyRunning[id] && !arbiterRunning[id],
      );
      if (anyLegacy) {
        totals.legacyImportingTicks += 1;
        totals.legacyImportWh += (overBudgetW * TICK_MINUTES) / 60;
        if (arbiterSheds) {
          totals.arbiterWouldShedTicks += 1;
          totals.arbiterWouldSaveWh += (overBudgetW * TICK_MINUTES) / 60;
        }
        samples.push(comparison);
      }
    }
    // Controle op de arbiter zelf: hij mag per definitie nooit meer toewijzen
    // dan er beschikbaar is. Dit is geen aanname maar een meting.
    if (budget.allocatedW > budget.availableW + 1e-6) {
      totals.arbiterOverAllocatedTicks += 1;
    }
  }

  report(history.meta.fromMs, end, totals, samples);
  console.log(
    `
  heat-assist voorstellen in dit venster: ${heatAssistProposals}` +
      ` (verwacht 0 — de Nest rapporteerde in augustus nooit 'heating')`,
  );

  const outPath = resolve('data/replay/report.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify({ window: { from: history.meta.fromMs, to: end }, totals }, null, 2),
    'utf-8',
  );
  console.log(`\nSamenvatting weggeschreven naar ${outPath}`);
}

function report(
  fromMs: number,
  toMs: number,
  totals: ReturnType<typeof emptyTotals>,
  samples: readonly TickComparison[],
): void {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
  const line = (s = '') => console.log(s);

  line('═'.repeat(72));
  line('  REPLAY — arbiter naast het YAML-systeem');
  line('═'.repeat(72));
  line(`  venster    ${iso(fromMs)} tot ${iso(toMs)} (UTC)`);
  line(`  ticks      ${fmt(totals.ticks)} van ${totals.minutesPerTick} minuut`);
  line(`  failsafe   ${fmt(totals.failsafeTicks)} ticks (${pct(totals.failsafeTicks, totals.ticks)})`);
  line();

  line('  Overeenstemming per apparaat');
  line('  ' + '─'.repeat(68));
  line(
    `  ${'apparaat'.padEnd(16)}${'gelijk'.padStart(12)}${'ik strenger'.padStart(14)}${'ik ruimer'.padStart(13)}`,
  );
  for (const id of ASSIST_IDS) {
    line(
      `  ${id.padEnd(16)}` +
        `${(fmt(totals.agree[id]) + ' / ' + pct(totals.agree[id], totals.ticks)).padStart(12)}` +
        `${fmt(totals.arbiterStricter[id]).padStart(14)}` +
        `${fmt(totals.arbiterLooser[id]).padStart(13)}`,
    );
  }
  line();

  line('  Gelijktijdig draaien');
  line('  ' + '─'.repeat(68));
  line(`  oud systeem, beide airco's aan       ${fmt(totals.legacyBothRunning).padStart(8)} ticks`);
  line(`  arbiter, beide airco's aan           ${fmt(totals.arbiterBothRunning).padStart(8)} ticks`);
  line();

  line('  Draaien op netstroom');
  line('  ' + '─'.repeat(68));
  line(
    `  oud systeem: airco aan terwijl het huis importeerde  ` +
      `${fmt(totals.legacyImportingTicks).padStart(6)} ticks`,
  );
  line(
    `  toe te rekenen netstroom                             ` +
      `${fmt(totals.legacyImportWh / 1000, 2).padStart(6)} kWh`,
  );
  line(
    `  daarvan zou de arbiter hebben teruggeschakeld        ` +
      `${fmt(totals.arbiterWouldShedTicks).padStart(6)} ticks`,
  );
  line(
    `  vermeden netstroom                                   ` +
      `${fmt(totals.arbiterWouldSaveWh / 1000, 2).padStart(6)} kWh` +
      `  (${pct(totals.arbiterWouldSaveWh, totals.legacyImportWh)})`,
  );
  line();
  line(
    `  Controle — arbiter wees meer toe dan beschikbaar:    ` +
      `${fmt(totals.arbiterOverAllocatedTicks).padStart(6)} ticks`,
  );
  line();

  line('  Wat het oude systeem zelf als reden toonde');
  line('  ' + '─'.repeat(68));
  const cats = Object.entries(totals.byLegacyCategory).sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of cats) {
    const bar = '█'.repeat(Math.max(1, Math.round((n / totals.ticks) * 40)));
    line(`  ${cat.padEnd(22)}${fmt(n).padStart(7)}  ${pct(n, totals.ticks).padStart(6)}  ${bar}`);
  }

  if (samples.length > 0) {
    line();
    line('  Eerste momenten waarop de airco\'s op netstroom draaide');
    line('  ' + '─'.repeat(68));
    line(
      `  ${'tijdstip'.padEnd(18)}${'net W'.padStart(9)}${'overschot'.padStart(11)}${'airco W'.padStart(10)}${'tekort'.padStart(9)}`,
    );
    for (const s of samples.slice(0, 12)) {
      const draw = ASSIST_IDS.reduce(
        (sum, id) => sum + (s.legacyRunning[id] ? s.legacyPowerW[id] : 0),
        0,
      );
      line(
        `  ${iso(s.tMs).padEnd(18)}${fmt(s.gridPowerW).padStart(9)}` +
          `${fmt(s.surplusW).padStart(11)}${fmt(draw).padStart(10)}` +
          `${fmt(s.legacyOverBudgetW).padStart(9)}`,
      );
    }
    if (samples.length > 12) line(`  … en nog ${fmt(samples.length - 12)} andere ticks`);
  }
  line('═'.repeat(72));
}

await main();
