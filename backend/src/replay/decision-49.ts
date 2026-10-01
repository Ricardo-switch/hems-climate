/**
 * Wat besluit 49 met het gedrag doet, over de opgenomen historie.
 *
 *   npx tsx src/replay/decision-49.ts [venster.ndjson.gz ...]
 *
 * Twee keer dezelfde minuten: één keer zoals het was, waarbij de draaitijden de
 * geschiedenis van het échte apparaat lazen, en één keer met de eigen
 * boekhouding uit `shadow-actuators.ts`. Het verschil is wat de grenzen doen
 * zodra ze over de eigen schakelingen gaan.
 *
 * Wat je hier ziet en wat niet:
 *
 * - WEL: hoe vaak de arbiter van stand wisselt, hoe lang zijn ritten duren, en
 *   welke blokkades afgaan. Dat is precies het gedrag waarover de draaitijd iets
 *   te zeggen heeft.
 * - NIET: wat het met de temperatuur doet. De reconstructie speelt de gemeten
 *   temperaturen af (zie `reconstruct.ts`). Een rit die langer wordt aangehouden
 *   koelt in werkelijkheid verder door dan hier te zien is, dus de vraag naar
 *   comfort blijft open tot er een thermisch model is.
 *
 * Een "wisseling" is een verandering in de gestuurde stand, met doorschuiven
 * wanneer er geen commando komt. Dus vier rondes achter elkaar "ga koelen"
 * tellen als één wisseling — anders zou de oude opstelling er kunstmatig slecht
 * uitkomen, want die gaf hetzelfde commando elke minuut opnieuw.
 */

import { basename, resolve } from 'node:path';

import { exampleSite } from './site.js';
import { Cursor, configAt, loadHistory, snapshot } from './reconstruct.js';
import { ShadowActuators } from '../adapters/shadow-actuators.js';
import { decide } from '../core/decide.js';
import type { Action, SiteConfig, Zone } from '../core/model.js';
import { defaultStrategies } from '../index.js';

const TICK_MS = 60_000;

/**
 * De woning zonder comfortplafond.
 *
 * Dit script meet besluit 49 en niets anders. Sinds besluit 50 staat er een
 * plafond in de configuratie, en met dat plafond aan zouden hier twee
 * veranderingen door elkaar lopen — en zouden de getallen in DECISIONS.md niet
 * meer uit dit script te halen zijn.
 */
const withoutCeiling = (z: Zone): Zone => {
  const { comfortMaxC: _omitted, ...rest } = z;
  return rest;
};
const SITE: SiteConfig = { ...exampleSite, zones: exampleSite.zones.map(withoutCeiling) };
const ACTUATORS = ['ac-woonkamer', 'ac-zolder'] as const;
type ActuatorId = (typeof ACTUATORS)[number];

function isOn(a: Action | null): boolean {
  return a === 'heat' || a === 'cool';
}

const CLIMATE: Readonly<Record<ActuatorId, string>> = {
  'ac-woonkamer': 'climate.air_conditioning_woonkamer',
  'ac-zolder': 'climate.air_conditioning_zolder',
};

/** Deed het echte apparaat op dit moment iets? Zelfde standby-conventie als de reconstructie. */
function actuallyRunning(cursor: Cursor, id: ActuatorId): boolean {
  const state = cursor.state(CLIMATE[id]);
  const setpoint = cursor.attrNumber(CLIMATE[id], 'temperature');
  const standby =
    (state === 'heat' && setpoint != null && setpoint <= 18) ||
    (state === 'cool' && setpoint != null && setpoint >= 25);
  return (state === 'heat' || state === 'cool') && !standby;
}

interface PerActuator {
  switches: number;
  /** Duur van elke afgeronde rit waarin het apparaat vermogen vroeg, in minuten. */
  runs: number[];
  /**
   * Minuten waarin het apparaat draaide terwijl het huis netstroom invoerde.
   *
   * Dit is de prijs van de draaitijd, en de reden dat dit gemeten hoort te
   * worden vóór de actuator-laag aangaat. De arbiter koopt geen netstroom voor
   * comfort — maar een apparaat dat door `minRunMinutes` wordt aangehouden
   * terwijl de zon wegvalt, doet dat alsnog. Zolang de grens niet bijt, kan dat
   * niet gebeuren en meet je het dus ook niet.
   */
  importMinutes: number;
  /** Ruwe schatting van de bijbehorende netstroom, in Wh. */
  importWh: number;
}

interface Outcome {
  ticks: number;
  actuator: Record<ActuatorId, PerActuator>;
  blocks: Map<string, number>;
}

function empty(): Outcome {
  return {
    ticks: 0,
    actuator: {
      'ac-woonkamer': { switches: 0, runs: [], importMinutes: 0, importWh: 0 },
      'ac-zolder': { switches: 0, runs: [], importMinutes: 0, importWh: 0 },
    },
    blocks: new Map(),
  };
}

async function measure(path: string, withShadow: boolean): Promise<Outcome> {
  const history = await loadHistory(path);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const shadow = withShadow ? new ShadowActuators() : undefined;
  const result = empty();

  /*
   * De stand die de arbiter het apparaat zou geven.
   *
   * Met eigen boekhouding is dat wat de arbiter zelf ziet: de stand in de
   * toestand waarmee hij de minuut ingaat — zijn veronderstelling, of het echte
   * apparaat wanneer hij heeft losgelaten (handmatig, besluit 49b). Zonder
   * boekhouding hield niemand die stand bij, en is het laatst gegeven commando
   * het beste wat er is.
   *
   * Dat verschil is geen detail. Na handmatig laat de boekhouding los en hoeft
   * de arbiter niets te sturen, want het echte apparaat staat al uit. Wie dan het
   * laatste commando blijft onthouden, telt een airco die "koelt" terwijl hij uit
   * staat — precies de fout die 49b uit de schaduw haalde.
   */
  const assumed: Record<string, Action | null> = {};
  const since: Record<string, number | null> = {};

  const toggle = (id: ActuatorId, action: Action | null, t: number): void => {
    const previous = assumed[id] ?? null;
    if (action === previous) return;
    // Een afgeronde rit: hij draaide, en nu niet meer.
    if (isOn(previous) && !isOn(action) && since[id] != null) {
      result.actuator[id].runs.push((t - since[id]!) / 60_000);
    }
    if (!isOn(previous) && isOn(action)) since[id] = t;
    // Het eerste gegeven is geen wisseling, alleen een beginstand.
    if (id in assumed) result.actuator[id].switches += 1;
    assumed[id] = action;
  };

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(SITE, cursor);
    const state = snapshot(config, cursor, t, undefined, shadow);

    if (shadow) {
      for (const id of ACTUATORS) {
        const a = state.actuators[id]?.action;
        toggle(id, a?.ok ? a.value : null, t);
      }
    }

    const decision = decide({ config, state, strategies });
    shadow?.follow(decision);
    result.ticks += 1;

    for (const r of decision.rejected) {
      result.blocks.set(r.blockedBy, (result.blocks.get(r.blockedBy) ?? 0) + 1);
    }

    /*
     * Eerst de rekening van deze minuut, dan de nieuwe stand.
     *
     * De stand zoals hij de minuut ínging bepaalt wat er in die minuut draaide;
     * een commando dat nu valt geldt pas hierna.
     */
    const netW = cursor.number('sensor.p1_meter_power') ?? 0;
    if (netW > 0) {
      for (const id of ACTUATORS) {
        if (!isOn(assumed[id] ?? null)) continue;
        /*
         * Alleen wanneer het échte apparaat stilstond.
         *
         * De meterstand die we afspelen bevat al wat het echte apparaat trok.
         * Draaide dat ook, dan zit onze invoer er dus al in en zou toerekenen
         * dubbel tellen. Stond het stil, dan komt het vermogen van ons
         * veronderstelde apparaat er bovenop, en is de schatting de bovengrens
         * van wat dat extra uit het net had gehaald.
         */
        if (actuallyRunning(cursor, id)) continue;
        const estimate = exampleSite.actuators.find((a) => a.id === id)!.power
          .estimatedW;
        result.actuator[id].importMinutes += 1;
        result.actuator[id].importWh += estimate / 60;
      }
    }

    if (!shadow) {
      for (const id of ACTUATORS) {
        const cmd = decision.commands.find(
          (c) => c.kind === 'setAction' && c.actuatorId === id,
        );
        if (cmd && cmd.kind === 'setAction') toggle(id, cmd.action, t);
      }
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

function lowerBoundOf(id: ActuatorId): number {
  return exampleSite.actuators.find((a) => a.id === id)!.timing.minRunMinutes;
}

function shortRuns(runs: readonly number[], limit: number): string {
  if (runs.length === 0) return '—';
  const short = runs.filter((r) => r < limit).length;
  return `${((short / runs.length) * 100).toFixed(0)}%`;
}

function show(name: string, without: Outcome, withChange: Outcome): void {
  console.log('');
  console.log(`  ${name}  (${withChange.ticks.toLocaleString('nl-NL')} minuten)`);
  console.log('');
  /*
   * `runs` is de eerlijke maat en niet `switches`.
   *
   * Een rit is een keer aanslaan en weer stoppen — dat is wat een compressor
   * kost en waar `minRunMinutes` over gaat. Het aantal wisselingen is tussen de
   * twee opstellingen niet vergelijkbaar: zonder eigen stand staat het apparaat
   * altijd `off`, en `windDownIntent` laat een uitgeschakeld apparaat met rust.
   * De halve afbouwketen (koelen → standby → uit) was daardoor onbereikbaar en
   * werd dus ook nooit geteld. Hij staat er alleen bij om dat zichtbaar te
   * houden.
   */
  console.log('  apparaat         ritten        mediane rit     korter dan grens   wisselingen');
  console.log('                  was   nu       was     nu       was    nu         was   nu');
  for (const id of ACTUATORS) {
    const g = lowerBoundOf(id);
    const z = without.actuator[id];
    const m = withChange.actuator[id];
    console.log(
      `  ${id.padEnd(14)} ` +
        `${String(z.runs.length).padStart(4)} ${String(m.runs.length).padStart(4)}    ` +
        `${median(z.runs).toFixed(1).padStart(6)} ${median(m.runs).toFixed(1).padStart(6)}    ` +
        `${shortRuns(z.runs, g).padStart(6)} ${shortRuns(m.runs, g).padStart(5)}      ` +
        `${String(z.switches).padStart(5)} ${String(m.switches).padStart(4)}` +
        `   (grens ${g} min)`,
    );
  }

  /*
   * De invoer alleen voor de nieuwe opstelling.
   *
   * In de oude bleef de gestuurde stand op `cool` hangen zodra hij één keer
   * gegeven was — de afbouw was onbereikbaar — dus zou daar een getal uitkomen
   * dat alleen die vastgelopen stand meet en verder niets.
   */
  console.log('');
  console.log('  wat de draaitijd aan netstroom kost (alleen de nieuwe opstelling)');
  for (const id of ACTUATORS) {
    const m = withChange.actuator[id];
    console.log(
      `  ${id.padEnd(14)} ${String(m.importMinutes).padStart(5)} minuten draaien tijdens invoer` +
        `  ≈ ${(m.importWh / 1000).toFixed(2)} kWh`,
    );
  }

  const codes = [...new Set([...without.blocks.keys(), ...withChange.blocks.keys()])].sort();
  console.log('');
  console.log('  blokkade                        was       nu');
  for (const c of codes) {
    console.log(
      `  ${c.padEnd(30)} ${String(without.blocks.get(c) ?? 0).padStart(6)} ` +
        `${String(withChange.blocks.get(c) ?? 0).padStart(8)}`,
    );
  }
}

async function main(): Promise<void> {
  const paths =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];

  console.log('');
  console.log('  Besluit 49 — de draaitijden over de eigen geschiedenis');
  console.log('  ' + '═'.repeat(70));

  for (const p of paths) {
    const path = resolve(p);
    const [without, withChange] = [await measure(path, false), await measure(path, true)];
    show(basename(path), without, withChange);
  }
  console.log('');
}

await main();
