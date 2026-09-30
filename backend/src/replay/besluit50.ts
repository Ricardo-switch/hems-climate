/**
 * Wat een comfortplafond kost, per hoogte, over de opgenomen historie.
 *
 *   npx tsx src/replay/besluit50.ts [venster.ndjson.gz ...]
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

import { exampleSite } from './site.js';
import { Cursor, configAt, loadHistory, snapshot } from './reconstruct.js';
import { SchaduwApparaten } from '../adapters/shadow-actuators.js';
import { decide } from '../core/decide.js';
import type { SiteConfig, Zone } from '../core/model.js';
import { defaultStrategies } from '../index.js';

const TICK_MS = 60_000;
const PLAFONDS = [null, 26, 25, 24, 23] as const;

/** De zones zonder koelende primary — precies de zones met het gat. */
const ZONES = ['woonkamer', 'zolder'] as const;
type ZoneId = (typeof ZONES)[number];

const KLIMAAT: Readonly<Record<ZoneId, string>> = {
  woonkamer: 'climate.air_conditioning_woonkamer',
  zolder: 'climate.air_conditioning_zolder',
};
const APPARAAT: Readonly<Record<ZoneId, string>> = {
  woonkamer: 'ac-woonkamer',
  zolder: 'ac-zolder',
};

/** De zone met dit plafond, of zonder: dan hoort het veld er niet te zijn. */
function zonePlafond(z: Zone, plafond: number | null): Zone {
  const { comfortMaxC: _weg, ...rest } = z;
  return plafond == null ? rest : { ...rest, comfortMaxC: plafond };
}

function metPlafond(base: SiteConfig, plafond: number | null): SiteConfig {
  return {
    ...base,
    zones: base.zones.map((z) =>
      (ZONES as readonly string[]).includes(z.id) ? zonePlafond(z, plafond) : z,
    ),
  };
}

function echtDraait(cursor: Cursor, zone: ZoneId): boolean {
  const state = cursor.state(KLIMAAT[zone]);
  const setpoint = cursor.attrNumber(KLIMAAT[zone], 'temperature');
  const standby =
    (state === 'heat' && setpoint != null && setpoint <= 18) ||
    (state === 'cool' && setpoint != null && setpoint >= 25);
  return (state === 'heat' || state === 'cool') && !standby;
}

interface PerZone {
  /** Minuten waarin de meting boven het plafond stond. De omvang van het gat. */
  bovenPlafond: number;
  /** Minuten waarin comfort de airco liet koelen (niet pv-overschot). */
  comfortKoelen: number;
  /** Daarvan: tijdens invoer, terwijl het echte apparaat stilstond. */
  invoerminuten: number;
  invoerWh: number;
}

async function meet(
  pad: string,
  plafond: number | null,
): Promise<{ ticks: number; zone: Record<ZoneId, PerZone> }> {
  const history = await loadHistory(pad);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const schaduw = new SchaduwApparaten();
  const basis = metPlafond(exampleSite, plafond);

  const zone: Record<ZoneId, PerZone> = {
    woonkamer: { bovenPlafond: 0, comfortKoelen: 0, invoerminuten: 0, invoerWh: 0 },
    zolder: { bovenPlafond: 0, comfortKoelen: 0, invoerminuten: 0, invoerWh: 0 },
  };
  let ticks = 0;

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(basis, cursor);
    const state = snapshot(config, cursor, t, undefined, schaduw);
    const decision = decide({ config, state, strategies });
    schaduw.volg(decision);
    ticks += 1;

    const netW = cursor.number('sensor.p1_meter_power') ?? 0;

    for (const z of ZONES) {
      const gemeten = state.zones[z]?.temperatureC;
      if (plafond != null && gemeten?.ok && gemeten.value >= plafond) {
        zone[z].bovenPlafond += 1;
      }

      // Draait de airco op verzoek van comfort, en niet van pv-overschot?
      const aanvaard = decision.accepted.find(
        (i) => i.actuatorId === APPARAAT[z] && i.action === 'cool',
      );
      if (aanvaard?.strategyId !== 'comfort') continue;
      zone[z].comfortKoelen += 1;

      if (netW > 0 && !echtDraait(cursor, z)) {
        const schatting = exampleSite.actuators.find((a) => a.id === APPARAAT[z])!
          .power.estimatedW;
        zone[z].invoerminuten += 1;
        zone[z].invoerWh += schatting / 60;
      }
    }
  }

  return { ticks, zone };
}

function uren(minuten: number): string {
  return (minuten / 60).toFixed(0);
}

async function main(): Promise<void> {
  const paden =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];

  console.log('');
  console.log('  Besluit 50 — wat een comfortplafond kost');
  console.log('  ' + '═'.repeat(74));

  for (const p of paden) {
    const pad = resolve(p);
    console.log('');

    for (const plafond of PLAFONDS) {
      const { ticks, zone } = await meet(pad, plafond);
      if (plafond === null) {
        console.log(
          `  ${basename(pad)}  (${ticks.toLocaleString('nl-NL')} minuten, ${(ticks / 1440).toFixed(1)} dagen)`,
        );
        console.log('');
        console.log(
          '  plafond   zone         boven plafond   comfort koelt   waarvan uit net',
        );
      }
      const label = plafond == null ? 'geen  ' : `${plafond} °C `;
      for (const z of ZONES) {
        const d = zone[z];
        console.log(
          `  ${label.padEnd(9)} ${z.padEnd(12)} ` +
            `${(plafond == null ? '—' : `${uren(d.bovenPlafond)} uur`).padStart(13)}   ` +
            `${`${uren(d.comfortKoelen)} uur`.padStart(13)}   ` +
            `${`${uren(d.invoerminuten)} uur ≈ ${(d.invoerWh / 1000).toFixed(1)} kWh`.padStart(18)}`,
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
