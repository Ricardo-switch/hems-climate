/**
 * De boiler en de jacuzzi op zon, in de schaduw (besluit 186).
 *
 * Wat de kern over een warmtebuffer zegt: wanneer hij zou stoken en waarom. Er
 * komt geen opdracht; die hoort bij stap B.
 */

import { describe, expect, it } from 'vitest';

import { decide } from '../src/core/decide.js';
import type { HeatStoreExplanation } from '../src/core/decision.js';
import type { HeatStore, SiteConfig } from '../src/core/model.js';
import type { HeatStoreState, SystemState } from '../src/core/state.js';
import { unavailable, value } from '../src/core/state.js';
import { defaultStrategies } from '../src/index.js';
import { exampleSite } from './site.js';

// 12:00 UTC is 14:00 in Amsterdam.
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const UUR = 3_600_000;
const DAG = 24 * UUR;

const jacuzzi: HeatStore = {
  id: 'jacuzzi',
  name: 'Jacuzzi',
  kind: 'jacuzzi',
  control: 'setpoint',
  actuator: { adapter: 'homeassistant', id: 'climate.spa' },
  temperature: { adapter: 'homeassistant', id: 'climate.spa', attribute: 'current_temperature' },
  power: { adapter: 'homeassistant', id: 'sensor.spa_vermogen' },
  estimatedW: 2200,
  minC: 30,
  sunC: 38,
  heatRateCPerHour: 1.5,
};
const boiler: HeatStore = {
  id: 'boiler',
  name: 'Boiler',
  kind: 'boiler',
  control: 'setpoint',
  actuator: { adapter: 'homeassistant', id: 'water_heater.boiler' },
  temperature: { adapter: 'homeassistant', id: 'water_heater.boiler', attribute: 'current_temperature' },
  estimatedW: 500,
  minC: 50,
  sunC: 65,
  heatRateCPerHour: 6,
  legionellaC: 60,
};
const stekker: HeatStore = {
  id: 'stekker',
  name: 'Boiler',
  kind: 'boiler',
  control: 'switch',
  actuator: { adapter: 'homeassistant', id: 'switch.boiler' },
  power: { adapter: 'homeassistant', id: 'sensor.boiler_vermogen' },
  estimatedW: 2000,
  minC: 50,
  sunC: 65,
  heatRateCPerHour: 8,
};

const metBuffers = (...heatStores: HeatStore[]): SiteConfig => ({ ...exampleSite, deferrables: [], heatStores });

const actuator = (action: 'off' | 'cool') => ({
  action: value(action, NOW),
  setpointC: unavailable<number>(),
  powerW: value(0, NOW),
  lastChangeMs: NOW - UUR,
  producing: unavailable<boolean>('missing'),
  producingSinceMs: null,
});

type Buffer = Partial<Omit<HeatStoreState, 'temperatureC' | 'powerW' | 'on'>> & { temp?: number | null; powerW?: number; on?: boolean };

function state(
  o: {
    gridPowerW?: number;
    nowMs?: number;
    atticC?: number;
    stabilising?: boolean;
    modeOverride?: SystemState['modeOverride'];
    healthy?: boolean;
    currentA?: number;
    cheap?: { fromMs: number; toMs: number }[];
  } = {},
  buffers: Record<string, Buffer> = { jacuzzi: { temp: 34 } },
): SystemState {
  const now = o.nowMs ?? NOW;
  return {
    nowMs: now,
    modeOverride: o.modeOverride ?? null,
    outdoorTemperatureC: unavailable<number>('missing'),
    solarProductionW: unavailable<number>('missing'),
    occupancy: { ricardo: value(true, now) },
    zones: {
      woonkamer: { temperatureC: value(21, now) },
      badkamer: { temperatureC: value(20, now) },
      zolder: { temperatureC: value(o.atticC ?? 21, now) },
    },
    actuators: { nest: actuator('off'), badkamer: actuator('off'), 'ac-woonkamer': actuator('off'), 'ac-zolder': actuator('off') },
    power: {
      gridPowerW: value(o.gridPowerW ?? -1500, now),
      ...(o.currentA != null ? { phases: { L1: { currentA: value(o.currentA, now), voltageV: value(230, now) } } } : {}),
    },
    timers: { stabilisation: { endsAtMs: o.stabilising ? now + 120_000 : null }, manualOverride: { endsAtMs: null } },
    lights: {},
    sunAboveHorizon: value(true, now),
    inputHealth: Object.fromEntries(exampleSite.criticalInputs.map((r) => [r.id, o.healthy ?? true])),
    ...(o.cheap ? { cheapWindows: o.cheap } : {}),
    heatStores: Object.fromEntries(
      Object.entries(buffers).map(([id, b]) => {
        const { temp, powerW, on, ...rest } = b;
        return [
          id,
          {
            temperatureC: temp == null ? unavailable<number>(temp === null ? 'unavailable' : 'missing') : value(temp, now),
            ...(powerW != null ? { powerW: value(powerW, now) } : {}),
            on: value(on ?? (powerW != null && powerW > 50), now),
            ...rest,
          },
        ];
      }),
    ),
  };
}

function uitleg(s: SystemState, config: SiteConfig, id = 'jacuzzi'): HeatStoreExplanation | undefined {
  return decide({ config, state: s, strategies: defaultStrategies() }).explanation.heatStores?.find((h) => h.id === id);
}

describe('de jacuzzi op zon (besluit 186)', () => {
  const cfg = metBuffers(jacuzzi);

  it('zou stoken als het overschot hem draagt, tot de badtemperatuur', () => {
    expect(uitleg(state({ gridPowerW: -2500 }), cfg)).toEqual({ id: 'jacuzzi', state: 'would_heat', reason: 'surplus_available', temperatureC: 34, targetC: 38, heating: false });
  });

  it('wacht op zon als er te weinig over is, en is vol op de badtemperatuur', () => {
    expect(uitleg(state({ gridPowerW: -1000 }), cfg)).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient', targetC: 38 });
    expect(uitleg(state({ gridPowerW: -2500 }, { jacuzzi: { temp: 38 } }), cfg)).toMatchObject({ state: 'full', reason: 'target_reached' });
  });

  it('houdt de ondergrens vast, ook zonder zon', () => {
    expect(uitleg(state({ gridPowerW: 600 }, { jacuzzi: { temp: 28.5 } }), cfg)).toMatchObject({ state: 'would_heat', reason: 'below_minimum', targetC: 30 });
  });

  it('stookt door met minder zon als hij al stookt (besluit 51), maar start daar niet op', () => {
    // Hij trekt 2.200 W en er gaat nog 100 W naar het net: dat draagt hem.
    expect(uitleg(state({ gridPowerW: -100 }, { jacuzzi: { temp: 35, powerW: 2200 } }), cfg)).toMatchObject({ state: 'would_heat', reason: 'surplus_available', heating: true });
    expect(uitleg(state({ gridPowerW: -100 }, { jacuzzi: { temp: 35 } }), cfg)).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient', heating: false });
    // Komt er 300 W van het net bij, dan niet meer.
    expect(uitleg(state({ gridPowerW: 300 }, { jacuzzi: { temp: 35, powerW: 2200 } }), cfg)).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient' });
  });

  it('haalt klaar om op tijd: uiterlijk zo laat dat het met zijn snelheid lukt', () => {
    // Van 30° naar 38° met 1,5° per uur is 5 uur 20, plus een half uur speling.
    const vroeg = { atMs: NOW + 12 * UUR, targetC: 38 };
    const e = uitleg(state({ gridPowerW: 600 }, { jacuzzi: { temp: 30, readyBy: vroeg } }), cfg);
    expect(e).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient', readyByMs: vroeg.atMs });
    expect(e?.latestStartMs).toBe(NOW + 12 * UUR - (8 / 1.5) * UUR - 30 * 60_000);
    const laat = { atMs: NOW + 5 * UUR, targetC: 38 };
    expect(uitleg(state({ gridPowerW: 600 }, { jacuzzi: { temp: 30, readyBy: laat } }), cfg)).toMatchObject({ state: 'would_heat', reason: 'ready_by', targetC: 38 });
  });

  it('begint eerder in de goedkoopste uren, maar niet zo vroeg dat hij weer afkoelt', () => {
    const cheap = [{ fromMs: NOW - UUR, toMs: NOW + 3 * UUR }];
    // Uiterlijk over 2 uur 10 beginnen: nu goedkoop, dus nu.
    const straks = { atMs: NOW + 8 * UUR, targetC: 38 };
    expect(uitleg(state({ gridPowerW: 600, cheap }, { jacuzzi: { temp: 30, readyBy: straks } }), cfg)).toMatchObject({ state: 'would_heat', reason: 'cheap_hours' });
    // Uiterlijk over 6 uur 10: dan is nu te vroeg, ook al is het goedkoop.
    const later = { atMs: NOW + 12 * UUR, targetC: 38 };
    expect(uitleg(state({ gridPowerW: 600, cheap }, { jacuzzi: { temp: 30, readyBy: later } }), cfg)).toMatchObject({ state: 'waiting' });
  });

  it('niet in de failsafe, niet als de bewoner de regeling terugtrok, en niet als hij niet te lezen is', () => {
    expect(uitleg(state({ healthy: false }), cfg)).toMatchObject({ state: 'waiting', reason: 'failsafe_unreliable_input' });
    expect(uitleg(state({ modeOverride: 'handmatig' }), cfg)).toMatchObject({ state: 'waiting', reason: 'mode_excludes_action' });
    expect(uitleg(state({}, { jacuzzi: { temp: null } }), cfg)).toMatchObject({ state: 'unknown', reason: 'reading_unavailable' });
  });

  it('niet als de hoofdzekering de start niet draagt, ook niet onder de ondergrens (besluit 78)', () => {
    // 31 A op een grens van 33 A: 2.200 W is 9,6 A.
    expect(uitleg(state({ gridPowerW: 7100, currentA: 31 }, { jacuzzi: { temp: 25 } }), cfg)).toMatchObject({ state: 'waiting', reason: 'insufficient_current_budget' });
  });

  it('geeft nooit een opdracht en start geen stabilisatie: dat komt pas met stap B', () => {
    const d = decide({ config: cfg, state: state({ gridPowerW: -2500 }), strategies: defaultStrategies() });
    expect(d.commands).toEqual([]);
  });

  it('verandert niets zonder warmtebuffers in de configuratie', () => {
    const d = decide({ config: { ...exampleSite, deferrables: [] }, state: state(), strategies: defaultStrategies() });
    expect(d.explanation.heatStores).toBeUndefined();
  });
});

describe('de boiler (besluit 186)', () => {
  it('warmt op zon tot het doel, en eens per week tegen legionella', () => {
    const cfg = metBuffers(boiler);
    expect(uitleg(state({ gridPowerW: -800 }, { boiler: { temp: 55, legionellaAtMs: NOW - 2 * DAG } }), cfg, 'boiler')).toMatchObject({ state: 'would_heat', targetC: 65 });
    expect(uitleg(state({ gridPowerW: -800 }, { boiler: { temp: 65, legionellaAtMs: NOW - 2 * DAG } }), cfg, 'boiler')).toMatchObject({ state: 'full' });
    // Een dag over de week, en geen zon: in de goedkoopste uren naar 60°.
    const cheap = [{ fromMs: NOW - UUR, toMs: NOW + UUR }];
    expect(uitleg(state({ gridPowerW: 400, cheap }, { boiler: { temp: 55, legionellaAtMs: NOW - 9 * DAG } }), cfg, 'boiler')).toMatchObject({ state: 'would_heat', reason: 'legionella_due', targetC: 60 });
    // Buiten de goedkoopste uren wacht hij erop.
    const straks = [{ fromMs: NOW + 9 * UUR, toMs: NOW + 17 * UUR }];
    expect(uitleg(state({ gridPowerW: 400, cheap: straks }, { boiler: { temp: 55, legionellaAtMs: NOW - 9 * DAG } }), cfg, 'boiler')).toMatchObject({ state: 'waiting' });
    // Weet de dienst het nog niet (net gestart), dan niet meteen van het net.
    expect(uitleg(state({ gridPowerW: 400 }, { boiler: { temp: 55 } }), cfg, 'boiler')).toMatchObject({ state: 'waiting' });
  });

  it('aan een stekker: vol als hij aan staat en niets trekt, en elke dag een keer vol', () => {
    const cfg = metBuffers(stekker);
    expect(uitleg(state({ gridPowerW: -2500 }, { stekker: { on: true, powerW: 3 } }), cfg, 'stekker')).toMatchObject({ state: 'full' });
    expect(uitleg(state({ gridPowerW: -2500 }, { stekker: { on: true, powerW: 1900 } }), cfg, 'stekker')).toMatchObject({ state: 'would_heat', reason: 'surplus_available', heating: true });
    const cheap = [{ fromMs: NOW - UUR, toMs: NOW + UUR }];
    expect(uitleg(state({ gridPowerW: 400, cheap }, { stekker: { on: false, powerW: 0, lastFullMs: NOW - 21 * UUR } }), cfg, 'stekker')).toMatchObject({ state: 'would_heat', reason: 'cheap_hours' });
    expect(uitleg(state({ gridPowerW: 400, cheap }, { stekker: { on: false, powerW: 0, lastFullMs: NOW - 5 * UUR } }), cfg, 'stekker')).toMatchObject({ state: 'waiting' });
  });
});

describe('de buffers in de volgorde op zon (besluiten 68 en 176)', () => {
  it('hooguit één start per ronde, ook met twee buffers', () => {
    const cfg = metBuffers(jacuzzi, boiler);
    const d = decide({ config: cfg, state: state({ gridPowerW: -5000 }, { jacuzzi: { temp: 34 }, boiler: { temp: 55, legionellaAtMs: NOW } }), strategies: defaultStrategies() });
    expect(d.explanation.heatStores?.map((h) => [h.id, h.state, h.reason])).toEqual([
      ['jacuzzi', 'would_heat', 'surplus_available'],
      ['boiler', 'waiting', 'stabilisation_active'],
    ]);
  });

  it('staat zonder keuze achter de kamers, en kan ervoor als de bewoner dat kiest', () => {
    // 22° op zolder: koelen op zon tot 21,5°, geen comfort.
    const opZon = state({ gridPowerW: -2500, atticC: 22 });
    const zonder: SiteConfig = { ...metBuffers(jacuzzi), sunOrder: [{ kind: 'zone', id: 'zolder' }] };
    expect(uitleg(opZon, zonder)).toMatchObject({ state: 'waiting', reason: 'stabilisation_active' });
    const voorop: SiteConfig = { ...metBuffers(jacuzzi), sunOrder: [{ kind: 'heatStore', id: 'jacuzzi' }, { kind: 'zone', id: 'zolder' }] };
    expect(uitleg(opZon, voorop)).toMatchObject({ state: 'would_heat', reason: 'surplus_available' });
    const d = decide({ config: voorop, state: opZon, strategies: defaultStrategies() });
    expect(d.commands.some((c) => c.kind === 'setAction' && c.action === 'cool')).toBe(false);
    // Stookt hij al, dan is doorgaan geen start: de zolder mag erna nog starten.
    const stookt = state({ gridPowerW: -2500, atticC: 22 }, { jacuzzi: { temp: 35, powerW: 2200 } });
    expect(uitleg(stookt, voorop)).toMatchObject({ state: 'would_heat', heating: true });
    expect(decide({ config: voorop, state: stookt, strategies: defaultStrategies() }).commands.some((c) => c.kind === 'setAction' && c.action === 'cool')).toBe(true);
  });
});
