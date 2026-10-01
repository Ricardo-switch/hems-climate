/**
 * Doorrekening van de bufferband van de zolder.
 *
 *   npx tsx src/replay/sweep.ts [data/replay/history.ndjson.gz]
 *
 * `buffering.bandC` bepaalt hoeveel graden voorbij het setpoint er nog doorgeladen
 * mag worden zolang de stroom gratis is. Die waarde stond op 1,0 omdat dat een
 * plausibel getal leek, niet omdat iemand het gemeten had. Dit script zet de
 * afweging naast elkaar op de eigen historie.
 *
 * Wat je hier ziet en wat niet:
 *
 * - WEL: hoe vaak de zolder-airco extra zou draaien, hoeveel zonnestroom dat
 *   opneemt die anders het net op was gegaan, en hoeveel compressorstarts dat
 *   kost. Ook of het ooit op netstroom gebeurt — dat hoort nul te blijven,
 *   want het budget staat het niet toe.
 * - NIET: wat het met de zoldertemperatuur doet. De reconstructie speelt de
 *   werkelijke temperaturen af; hij rekent niet door dat de zolder kouder zou
 *   zijn geworden. Bij een grotere band is de opgenomen energie daardoor eerder
 *   over- dan onderschat, want in werkelijkheid was de zolder de bufferband
 *   sneller doorgekomen en had het apparaat weer afgeschakeld.
 *
 * Gebruik het dus om orde van grootte en richting te kiezen, niet als
 * eindafrekening.
 */

import { exampleSite } from './site.js';
import { decide } from '../core/decide.js';
import type { SiteConfig } from '../core/model.js';
import { defaultStrategies } from '../index.js';
import { Cursor, configAt, loadHistory, snapshot } from './reconstruct.js';
import { OwnState } from '../adapters/own-state.js';

const TICK_MINUTES = 1;
const TICK_MS = TICK_MINUTES * 60_000;
const BANDS = [0, 0.5, 1.0, 1.5, 2.0];
const ZONE_ID = 'zolder';
const ACTUATOR_ID = 'ac-zolder';

interface Outcome {
  bandC: number;
  runningTicks: number;
  starts: number;
  /** Opgenomen energie in de ticks waarin het apparaat zou draaien, in Wh. */
  energyWh: number;
  /** Daarvan het deel dat uit netstroom zou komen. Hoort nul te zijn. */
  gridWh: number;
}

function withBand(base: SiteConfig, bandC: number): SiteConfig {
  return {
    ...base,
    zones: base.zones.map((z) =>
      z.id === ZONE_ID
        ? { ...z, buffering: { enabled: bandC > 0, bandC } }
        : z,
    ),
  };
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? 'data/replay/history.ndjson.gz';
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const estimatedW =
    exampleSite.actuators.find((a) => a.id === ACTUATOR_ID)?.power.estimatedW ?? 0;

  const results: Outcome[] = [];

  for (const bandC of BANDS) {
    const base = withBand(exampleSite, bandC);
    const cursor = new Cursor(history);
    // De stabilisatietimer houdt de dienst zelf bij (besluit 60).
    const own = new OwnState();
    const out: Outcome = {
      bandC,
      runningTicks: 0,
      starts: 0,
      energyWh: 0,
      gridWh: 0,
    };
    let wasRunning = false;

    const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
    for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
      cursor.advanceTo(t);
      const config = configAt(base, cursor);
      const state = snapshot(config, cursor, t, own);
      const decision = decide({ config, state, strategies });
      own.apply(decision.commands, t);

      const intent = decision.accepted.find((i) => i.actuatorId === ACTUATOR_ID);
      const running = intent?.action === 'cool' || intent?.action === 'heat';

      if (running) {
        out.runningTicks += 1;
        if (!wasRunning) out.starts += 1;
        const measured = state.actuators[ACTUATOR_ID]?.powerW;
        const w = measured?.ok && measured.value > 0 ? measured.value : estimatedW;
        const wh = (w * TICK_MINUTES) / 60;
        out.energyWh += wh;
        // Netstroom is alleen in het spel wanneer het huis daadwerkelijk
        // importeert boven de tolerantie.
        const gridW = cursor.number('sensor.p1_meter_power') ?? 0;
        if (gridW > config.power.stopImportW) out.gridWh += wh;
      }
      wasRunning = running;
    }

    results.push(out);
    process.stdout.write(`  band ${bandC.toFixed(1)} °C doorgerekend\n`);
  }

  const f = (n: number, d = 0) =>
    n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const base = results.find((r) => r.bandC === 0);

  console.log();
  console.log('═'.repeat(72));
  console.log(`  BUFFERBAND ZOLDER — ${BANDS.length} varianten over 10 dagen`);
  console.log('═'.repeat(72));
  console.log(
    `  ${'band'.padStart(6)}${'draaitijd'.padStart(12)}${'starts'.padStart(9)}` +
      `${'energie'.padStart(11)}${'netstroom'.padStart(12)}${'extra vs 0'.padStart(13)}`,
  );
  console.log('  ' + '─'.repeat(68));
  for (const r of results) {
    const extraWh = base ? r.energyWh - base.energyWh : 0;
    console.log(
      `  ${(r.bandC.toFixed(1) + '°').padStart(6)}` +
        `${(f(r.runningTicks / 60, 1) + ' u').padStart(12)}` +
        `${f(r.starts).padStart(9)}` +
        `${(f(r.energyWh / 1000, 2) + ' kWh').padStart(11)}` +
        `${(f(r.gridWh / 1000, 2) + ' kWh').padStart(12)}` +
        `${(f(extraWh / 1000, 2) + ' kWh').padStart(13)}`,
    );
  }
  console.log('═'.repeat(72));
  console.log(
    '  Netstroom hoort in elke rij nul te zijn; het budget laat draaien op\n' +
      '  import niet toe. Kiezen doe je op de verhouding tussen extra opgenomen\n' +
      '  zonnestroom en het aantal extra compressorstarts.',
  );
}

await main();
