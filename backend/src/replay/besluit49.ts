/**
 * Wat besluit 49 met het gedrag doet, over de opgenomen historie.
 *
 *   npx tsx src/replay/besluit49.ts [venster.ndjson.gz ...]
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
import { SchaduwApparaten } from '../adapters/shadow-actuators.js';
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
const zonderPlafond = (z: Zone): Zone => {
  const { comfortMaxC: _weg, ...rest } = z;
  return rest;
};
const SITE: SiteConfig = { ...exampleSite, zones: exampleSite.zones.map(zonderPlafond) };
const APPARATEN = ['ac-woonkamer', 'ac-zolder'] as const;
type ApparaatId = (typeof APPARATEN)[number];

function draait(a: Action | null): boolean {
  return a === 'heat' || a === 'cool';
}

const KLIMAAT: Readonly<Record<ApparaatId, string>> = {
  'ac-woonkamer': 'climate.air_conditioning_woonkamer',
  'ac-zolder': 'climate.air_conditioning_zolder',
};

/** Deed het echte apparaat op dit moment iets? Zelfde standby-conventie als de reconstructie. */
function echtDraait(cursor: Cursor, id: ApparaatId): boolean {
  const state = cursor.state(KLIMAAT[id]);
  const setpoint = cursor.attrNumber(KLIMAAT[id], 'temperature');
  const standby =
    (state === 'heat' && setpoint != null && setpoint <= 18) ||
    (state === 'cool' && setpoint != null && setpoint >= 25);
  return (state === 'heat' || state === 'cool') && !standby;
}

interface PerApparaat {
  wisselingen: number;
  /** Duur van elke afgeronde rit waarin het apparaat vermogen vroeg, in minuten. */
  ritten: number[];
  /**
   * Minuten waarin het apparaat draaide terwijl het huis netstroom invoerde.
   *
   * Dit is de prijs van de draaitijd, en de reden dat dit gemeten hoort te
   * worden vóór de actuator-laag aangaat. De arbiter koopt geen netstroom voor
   * comfort — maar een apparaat dat door `minRunMinutes` wordt aangehouden
   * terwijl de zon wegvalt, doet dat alsnog. Zolang de grens niet bijt, kan dat
   * niet gebeuren en meet je het dus ook niet.
   */
  importMinuten: number;
  /** Ruwe schatting van de bijbehorende netstroom, in Wh. */
  importWh: number;
}

interface Uitkomst {
  ticks: number;
  apparaat: Record<ApparaatId, PerApparaat>;
  blokkades: Map<string, number>;
}

function leeg(): Uitkomst {
  return {
    ticks: 0,
    apparaat: {
      'ac-woonkamer': { wisselingen: 0, ritten: [], importMinuten: 0, importWh: 0 },
      'ac-zolder': { wisselingen: 0, ritten: [], importMinuten: 0, importWh: 0 },
    },
    blokkades: new Map(),
  };
}

async function meet(pad: string, metSchaduw: boolean): Promise<Uitkomst> {
  const history = await loadHistory(pad);
  const strategies = defaultStrategies();
  const cursor = new Cursor(history);
  const schaduw = metSchaduw ? new SchaduwApparaten() : undefined;
  const uit = leeg();

  // De doorgeschoven stand: wat er staat zolang er geen nieuw commando komt.
  const stand: Record<string, Action | null> = {};
  const sinds: Record<string, number | null> = {};

  const start = Math.ceil(history.meta.fromMs / TICK_MS) * TICK_MS;
  for (let t = start; t <= history.meta.toMs; t += TICK_MS) {
    cursor.advanceTo(t);
    const config = configAt(SITE, cursor);
    const state = snapshot(config, cursor, t, undefined, schaduw);
    const decision = decide({ config, state, strategies });
    schaduw?.apply(decision.commands, t);
    uit.ticks += 1;

    for (const r of decision.rejected) {
      uit.blokkades.set(r.blockedBy, (uit.blokkades.get(r.blockedBy) ?? 0) + 1);
    }

    /*
     * Eerst de rekening van deze minuut, dan de nieuwe stand.
     *
     * De stand zoals hij de minuut ínging bepaalt wat er in die minuut draaide;
     * een commando dat nu valt geldt pas hierna. De toerekening is ruw: een
     * apparaat kan nooit meer invoer veroorzaken dan het zelf trekt, en nooit
     * meer dan er werkelijk ingevoerd werd.
     */
    const netW = cursor.number('sensor.p1_meter_power') ?? 0;
    if (netW > 0) {
      for (const id of APPARATEN) {
        if (!draait(stand[id] ?? null)) continue;
        /*
         * Alleen wanneer het échte apparaat stilstond.
         *
         * De meterstand die we afspelen bevat al wat het echte apparaat trok.
         * Draaide dat ook, dan zit onze invoer er dus al in en zou toerekenen
         * dubbel tellen. Stond het stil, dan komt het vermogen van ons
         * veronderstelde apparaat er bovenop, en is de schatting de bovengrens
         * van wat dat extra uit het net had gehaald.
         */
        if (echtDraait(cursor, id)) continue;
        const schatting = exampleSite.actuators.find((a) => a.id === id)!.power
          .estimatedW;
        uit.apparaat[id].importMinuten += 1;
        uit.apparaat[id].importWh += schatting / 60;
      }
    }

    for (const id of APPARATEN) {
      const cmd = decision.commands.find(
        (c) => c.kind === 'setAction' && c.actuatorId === id,
      );
      if (!cmd || cmd.kind !== 'setAction') continue;
      const vorige = stand[id] ?? null;
      if (cmd.action === vorige) continue;

      // Een afgeronde rit: hij draaide, en nu niet meer.
      if (draait(vorige) && !draait(cmd.action) && sinds[id] != null) {
        uit.apparaat[id].ritten.push((t - sinds[id]!) / 60_000);
      }
      if (!draait(vorige) && draait(cmd.action)) sinds[id] = t;

      stand[id] = cmd.action;
      uit.apparaat[id].wisselingen += 1;
    }
  }

  return uit;
}

function mediaan(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

function ondergrensVan(id: ApparaatId): number {
  return exampleSite.actuators.find((a) => a.id === id)!.timing.minRunMinutes;
}

function tePlat(ritten: readonly number[], grens: number): string {
  if (ritten.length === 0) return '—';
  const kort = ritten.filter((r) => r < grens).length;
  return `${((kort / ritten.length) * 100).toFixed(0)}%`;
}

function toon(naam: string, zonder: Uitkomst, met: Uitkomst): void {
  console.log('');
  console.log(`  ${naam}  (${met.ticks.toLocaleString('nl-NL')} minuten)`);
  console.log('');
  /*
   * `ritten` is de eerlijke maat en niet `wisselingen`.
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
  for (const id of APPARATEN) {
    const g = ondergrensVan(id);
    const z = zonder.apparaat[id];
    const m = met.apparaat[id];
    console.log(
      `  ${id.padEnd(14)} ` +
        `${String(z.ritten.length).padStart(4)} ${String(m.ritten.length).padStart(4)}    ` +
        `${mediaan(z.ritten).toFixed(1).padStart(6)} ${mediaan(m.ritten).toFixed(1).padStart(6)}    ` +
        `${tePlat(z.ritten, g).padStart(6)} ${tePlat(m.ritten, g).padStart(5)}      ` +
        `${String(z.wisselingen).padStart(5)} ${String(m.wisselingen).padStart(4)}` +
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
  for (const id of APPARATEN) {
    const m = met.apparaat[id];
    console.log(
      `  ${id.padEnd(14)} ${String(m.importMinuten).padStart(5)} minuten draaien tijdens invoer` +
        `  ≈ ${(m.importWh / 1000).toFixed(2)} kWh`,
    );
  }

  const codes = [...new Set([...zonder.blokkades.keys(), ...met.blokkades.keys()])].sort();
  console.log('');
  console.log('  blokkade                        was       nu');
  for (const c of codes) {
    console.log(
      `  ${c.padEnd(30)} ${String(zonder.blokkades.get(c) ?? 0).padStart(6)} ` +
        `${String(met.blokkades.get(c) ?? 0).padStart(8)}`,
    );
  }
}

async function main(): Promise<void> {
  const paden =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ['data/replay/history.ndjson.gz', 'data/replay/history-2026-09-30.ndjson.gz'];

  console.log('');
  console.log('  Besluit 49 — de draaitijden over de eigen geschiedenis');
  console.log('  ' + '═'.repeat(70));

  for (const p of paden) {
    const pad = resolve(p);
    const [zonder, met] = [await meet(pad, false), await meet(pad, true)];
    toon(basename(pad), zonder, met);
  }
  console.log('');
}

await main();
