/**
 * Wat een comfortplafond kost, per hoogte, over de opgenomen historie.
 *
 *   npx tsx src/replay/decision-50.ts [venster.ndjson.gz ...]
 *
 * Besluit 50 is de vraag of comfort mag koelen wanneer de zon het niet betaalt.
 * Dit script rekent de hoogtes door: geen plafond (zoals het nu is), 26, 25, 24
 * en 23 °C. Besluit 49 staat aan in alle varianten, want anders meten de
 * draaitijden het oude systeem.
 *
 * **Wat dit wél zegt.** Hoeveel minuten de airco extra zou draaien, hoeveel
 * daarvan tijdens invoer uit het net, en hoeveel netstroom dat bovengrens-
 * gewijs kost. Dat is de rekening, en die is te kiezen.
 *
 * **Wat dit niet zegt.** Hoeveel koeler het huis wordt. De reconstructie speelt
 * de gemeten temperaturen af en rekent niet door wat koelen ermee doet (zie
 * `reconstruct.ts`). Daarmee zijn álle getallen hier bovengrenzen: in
 * werkelijkheid was de zone eerder onder het plafond en viel de vraag eerder
 * weg. Het is dus een prijskaartje met een marge naar beneden, geen begroting.
 *
 * De comfortwinst blijft tot fase 7 onmeetbaar. Wat wél te zien is: hoeveel
 * minuten de zone boven het plafond zat — de omvang van het probleem.
 */

import { basename, resolve } from 'node:path';

import { exampleSite, withLegacyStabilisation } from '../../src/replay/site.js';
import { Cursor, configAt, loadHistory, snapshot } from '../../src/replay/reconstruct.js';
import { ShadowActuators } from '../../src/adapters/shadow-actuators.js';
import { decide } from '../../src/core/decide.js';
import type { SiteConfig, Zone } from '../../src/core/model.js';
import { defaultStrategies } from '../../src/index.js';

const TICK_MS = 60_000;
const CEILINGS = [null, 26, 25, 24, 23] as const;

/** De zones zonder koelende primary — precies de zones met het gat. */
const ZONES = ['woonkamer', 'zolder'] as const;
type ZoneId = (typeof ZONES)[number];

const CLIMATE: Readonly<Record<ZoneId, string>> = {
  woonkamer: 'climate.air_conditioning_woonkamer',
  zolder: 'climate.air_conditioning_zolder',
};
const ACTUATOR: Readonly<Record<ZoneId, string>> = {
  woonkamer: 'ac-woonkamer',
  zolder: 'ac-zolder',
};

/** De zone met dit plafond, of zonder: dan hoort het veld er niet te zijn. */
function zoneCeiling(z: Zone, ceiling: number | null): Zone {
  const { comfortMaxC: _omitted, ...rest } = z;
  return ceiling == null ? rest : { ...rest, comfortMaxC: ceiling };
}

function withCeiling(base: SiteConfig, ceiling: number | null): SiteConfig {
  return {
    ...base,
    zones: base.zones.map((z) =>
      (ZONES as readonly string[]).includes(z.id) ? zoneCeiling(z, ceiling) : z,
    ),
  };
}

function actuallyRunning(cursor: Cursor, zone: ZoneId): boolean {
  const state = cursor.state(CLIMATE[zone]);
  const setpoint = cursor.attrNumber(CLIMATE[zone], 'temperature');
  const standby =
    (state === 'heat' && setpoint != null && setpoint <= 18) ||
    (state === 'cool' && setpoint != null && setpoint >= 25);
  return (state === 'heat' || state === 'cool') && !standby;
}

interface PerZone {
  /** Minuten waarin de meting boven het plafond stond. De omvang van het gat. */
  aboveCeiling: number;
  /** Minuten waarin comfort de airco liet koelen (niet pv-overschot). */
  comfortCooling: number;
  /** Daarvan: tijdens invoer, terwijl het echte apparaat stilstond. */
  importMinutes: number;
  importWh: number;
}

async function measure(
  path: string,
  ceiling: number | null,
): Promise<{ ticks: number; zone: Record<ZoneId, PerZone> }> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const shadow = new ShadowActuators();
  // Gemeten met de timer van het oude systeem, zoals toen (zie besluit 60).
  const base = withCeiling(withLegacyStabilisation(exampleSite), ceiling);

  const zone: Record<ZoneId, PerZone> = {
    woonkamer: { aboveCeiling: 0, comfortCooling: 0, importMinutes: 0, importWh: 0 },
    zolder: { aboveCeiling: 0, comfortCooling: 0, importMinutes: 0, importWh: 0 },
  };
  let ticks = 0;

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(base, cursor);
    const state = snapshot(config, cursor, t, undefined, shadow);
    const decision = decide({ config, state, strategies });
    shadow.follow(decision);
    ticks += 1;

    const netW = cursor.number('sensor.p1_meter_power') ?? 0;

    for (const z of ZONES) {
      const measured = state.zones[z]?.temperatureC;
      if (ceiling != null && measured?.ok && measured.value >= ceiling) {
        zone[z].aboveCeiling += 1;
      }

      // Draait de airco op verzoek van comfort, en niet van pv-overschot?
      const accepted = decision.accepted.find(
        (i) => i.actuatorId === ACTUATOR[z] && i.action === 'cool',
      );
      if (accepted?.strategyId !== 'comfort') continue;
      zone[z].comfortCooling += 1;

      if (netW > 0 && !actuallyRunning(cursor, z)) {
        const estimate = exampleSite.actuators.find((a) => a.id === ACTUATOR[z])!
          .power.estimatedW;
        zone[z].importMinutes += 1;
        zone[z].importWh += estimate / 60;
      }
    }
  }

  return { ticks, zone };
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(0);
}

async function main(): Promise<void> {
  const paths =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];

  console.log('');
  console.log('  Besluit 50 — wat een comfortplafond kost');
  console.log('  ' + '═'.repeat(74));

  for (const p of paths) {
    const path = resolve(p);
    console.log('');

    for (const ceiling of CEILINGS) {
      const { ticks, zone } = await measure(path, ceiling);
      if (ceiling === null) {
        console.log(
          `  ${basename(path)}  (${ticks.toLocaleString('nl-NL')} minuten, ${(ticks / 1440).toFixed(1)} dagen)`,
        );
        console.log('');
        console.log(
          '  plafond   zone         boven plafond   comfort koelt   waarvan uit net',
        );
      }
      const label = ceiling == null ? 'geen  ' : `${ceiling} °C `;
      for (const z of ZONES) {
        const d = zone[z];
        console.log(
          `  ${label.padEnd(9)} ${z.padEnd(12)} ` +
            `${(ceiling == null ? '—' : `${hours(d.aboveCeiling)} uur`).padStart(13)}   ` +
            `${`${hours(d.comfortCooling)} uur`.padStart(13)}   ` +
            `${`${hours(d.importMinutes)} uur ≈ ${(d.importWh / 1000).toFixed(1)} kWh`.padStart(18)}`,
        );
      }
    }
  }
  console.log('');
  console.log('  Alle getallen zijn bovengrenzen: de temperatuur is de gemeten');
  console.log('  temperatuur, dus het koelen dat hier gebeurt maakt het huis niet');
  console.log('  koeler en de vraag valt niet eerder weg. Zie de kop van dit script.');
  console.log('');
}

await main();
