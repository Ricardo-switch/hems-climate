/**
 * Deze tests leggen het gedrag vast dat de YAML-versie niet had.
 *
 * De eerste is de regressietest voor `zolder_started_now`: daar hield een vlag
 * de tweede unit tegen, maar door een scopingfout stond die vlag altijd op
 * false. Hier is het geen vlag maar een budget, en het budget is niet te
 * omzeilen.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { decide } from '../src/core/decide.js';
import {
  comfort,
  createHeatAssist,
  defaultStrategies,
  pvSurplus,
  StrategyRegistry,
} from '../src/index.js';
import type { Action } from '../src/core/model.js';
import type { ActuatorState, SystemState } from '../src/core/state.js';
import { unavailable, value } from '../src/core/state.js';

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0); // woensdagmiddag, dagmodus

function actuator(
  action: Action,
  opts: {
    setpointC?: number;
    powerW?: number;
    minutesAgo?: number;
    /** Minuten dat het apparaat onafgebroken levert; weglaten = rapporteert niets. */
    producingFor?: number;
  } = {},
): ActuatorState {
  const { setpointC, powerW, minutesAgo = 60, producingFor } = opts;
  return {
    action: value(action, NOW),
    setpointC: setpointC == null ? unavailable<number>() : value(setpointC, NOW),
    powerW: value(powerW ?? 0, NOW),
    lastChangeMs: NOW - minutesAgo * 60_000,
    producing:
      producingFor == null ? unavailable<boolean>('missing') : value(true, NOW),
    producingSinceMs: producingFor == null ? null : NOW - producingFor * 60_000,
  };
}

interface Overrides {
  gridPowerW?: number;
  woonkamerC?: number;
  zolderC?: number;
  badkamerC?: number;
  actuators?: Partial<Record<string, ActuatorState>>;
  inputHealth?: Record<string, boolean>;
  stabilisationEndsAtMs?: number | null;
}

function buildState(o: Overrides = {}): SystemState {
  const healthy = Object.fromEntries(
    exampleSite.criticalInputs.map((r) => [r.id, true]),
  );
  return {
    nowMs: NOW,
    modeOverride: null,
    // De regeling doet er niets mee (besluit 30), maar het veld hoort te bestaan.
    outdoorTemperatureC: unavailable<number>('missing'),
    occupancy: { ricardo: value(true, NOW) },
    zones: {
      woonkamer: { temperatureC: value(o.woonkamerC ?? 21.0, NOW) },
      badkamer: { temperatureC: value(o.badkamerC ?? 20.0, NOW) },
      zolder: { temperatureC: value(o.zolderC ?? 24.0, NOW) },
    },
    actuators: {
      nest: actuator('off'),
      badkamer: actuator('off'),
      'ac-woonkamer': actuator('off'),
      'ac-zolder': actuator('off'),
      ...o.actuators,
    },
    power: { gridPowerW: value(o.gridPowerW ?? -2000, NOW) },
    timers: {
      stabilisation: { endsAtMs: o.stabilisationEndsAtMs ?? null },
      manualOverride: { endsAtMs: null },
    },
    lights: {},
    sunAboveHorizon: value(true, NOW),
    inputHealth: { ...healthy, ...o.inputHealth },
  };
}

const run = (state: SystemState) =>
  decide({ config: exampleSite, state, strategies: defaultStrategies() });

describe('vermogensbudget', () => {
  it('start niet twee airco\'s op een overschot dat er maar een dekt', () => {
    // Beide zones warm genoeg om te willen koelen; 900 + 750 W gevraagd,
    // maar slechts 1000 W overschot plus 50 W importtolerantie beschikbaar.
    const decision = run(
      buildState({ gridPowerW: -1000, woonkamerC: 24.0, zolderC: 24.5 }),
    );

    const starts = decision.commands.filter(
      (c) => c.kind === 'setAction' && c.action === 'cool',
    );
    expect(starts).toHaveLength(1);

    const starved = decision.rejected.find(
      (r) => r.blockedBy === 'insufficient_power_budget',
    );
    expect(starved).toBeDefined();
    // De woonkamer heeft de laagste zonenummer en wint dus.
    expect(starved?.intent.actuatorId).toBe('ac-zolder');
  });

  it('rekent een draaiende unit af op zijn gemeten opname, niet op de schatting', () => {
    const decision = run(
      buildState({
        gridPowerW: -200,
        woonkamerC: 24.0,
        zolderC: 24.5,
        actuators: {
          'ac-woonkamer': actuator('cool', { setpointC: 21, powerW: 400 }),
        },
      }),
    );

    // 200 W teruglevering + 50 W tolerantie + 400 W terugwinbaar = 650 W.
    expect(decision.explanation.budget.availableW).toBe(650);
    expect(decision.explanation.budget.reclaimableW).toBe(400);
    // Genoeg om de woonkamer te blijven voeden, te weinig voor de zolder erbij.
    expect(decision.explanation.budget.allocatedW).toBe(400);
  });

  it('laat comfort doorgaan zonder overschot', () => {
    const decision = run(
      buildState({ gridPowerW: 3000, woonkamerC: 18.0, badkamerC: 15.0 }),
    );
    const heating = decision.accepted.filter((i) => i.action === 'heat');
    expect(heating.map((i) => i.actuatorId).sort()).toEqual(['badkamer', 'nest']);
  });
});

describe('timing', () => {
  it('schakelt een unit niet uit binnen zijn minimale draaitijd', () => {
    const decision = run(
      buildState({
        gridPowerW: 3000, // geen overschot, dus pv-surplus wil terugschakelen
        zolderC: 24.0,
        actuators: {
          'ac-zolder': actuator('cool', { setpointC: 21.5, minutesAgo: 3 }),
        },
      }),
    );

    expect(
      decision.rejected.some(
        (r) =>
          r.intent.actuatorId === 'ac-zolder' &&
          r.blockedBy === 'min_run_not_elapsed',
      ),
    ).toBe(true);
    expect(
      decision.commands.some(
        (c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder',
      ),
    ).toBe(false);
  });

  it('houdt een start tegen zolang de stabilisatietimer loopt', () => {
    const decision = run(
      buildState({
        gridPowerW: -3000,
        zolderC: 24.5,
        stabilisationEndsAtMs: NOW + 120_000,
      }),
    );
    expect(
      decision.rejected.some((r) => r.blockedBy === 'stabilisation_active'),
    ).toBe(true);
  });
});

describe('failsafe', () => {
  it('schakelt assist uit en laat de primary met rust', () => {
    const decision = run(
      buildState({
        woonkamerC: 18.0,
        inputHealth: { 'sensor.p1_meter_power': false },
        actuators: {
          'ac-woonkamer': actuator('heat', { setpointC: 21, minutesAgo: 60 }),
        },
      }),
    );

    expect(decision.explanation.failsafe.active).toBe(true);
    expect(decision.explanation.failsafe.unreliable).toContain(
      'sensor.p1_meter_power',
    );
    expect(
      decision.commands.some(
        (c) =>
          c.kind === 'setAction' &&
          c.actuatorId === 'ac-woonkamer' &&
          c.action === 'off',
      ),
    ).toBe(true);
    expect(
      decision.commands.some((c) => c.kind === 'setAction' && c.actuatorId === 'nest'),
    ).toBe(false);
  });
});

describe('determinisme', () => {
  it('geeft bij gelijke invoer exact hetzelfde besluit', () => {
    const state = buildState({ gridPowerW: -1200, woonkamerC: 23.8, zolderC: 24.2 });
    expect(JSON.stringify(run(state))).toBe(JSON.stringify(run(state)));
  });
});

describe('budget bij import', () => {
  it('trekt lopende import af van de beschikbare ruimte', () => {
    // Beide airco's draaien samen 500 W terwijl het net 200 W importeert.
    // Zonder de airco's zou er 300 W over zijn: dat is de echte ruimte.
    const decision = run(
      buildState({
        gridPowerW: 200,
        woonkamerC: 24.0,
        zolderC: 24.5,
        actuators: {
          'ac-woonkamer': actuator('cool', { setpointC: 21, powerW: 300 }),
          'ac-zolder': actuator('cool', { setpointC: 21.5, powerW: 200 }),
        },
      }),
    );
    // -200 import + 500 terugwinbaar + 50 tolerantie = 350 W.
    expect(decision.explanation.budget.availableW).toBe(350);
    // Niet genoeg voor beide (300 + 200); de zolder moet wijken.
    expect(decision.explanation.budget.allocatedW).toBe(300);
    expect(
      decision.rejected.some(
        (r) =>
          r.intent.actuatorId === 'ac-zolder' &&
          r.blockedBy === 'insufficient_power_budget',
      ),
    ).toBe(true);
  });
});

describe('heat-assist startvertraging', () => {
  /** Koude woonkamer, geen zon: alleen heat-assist kan hier de airco starten. */
  const winterish = (nestOpts: Parameters<typeof actuator>[1]) =>
    buildState({
      gridPowerW: 1500,
      woonkamerC: 18.5,
      badkamerC: 20.0,
      zolderC: 20.0,
      actuators: { nest: actuator('heat', { setpointC: 20, ...nestOpts }) },
    });

  const assistProposed = (state: SystemState) =>
    run(state).proposed.some(
      (i) => i.strategyId === 'heat-assist' && i.actuatorId === 'ac-woonkamer',
    );

  it('springt niet bij als de ketel nog maar net stookt', () => {
    expect(assistProposed(winterish({ producingFor: 2 }))).toBe(false);
  });

  it('springt bij zodra de ketel lang genoeg onafgebroken stookt', () => {
    expect(assistProposed(winterish({ producingFor: 7 }))).toBe(true);
  });

  it('springt niet bij als de ketel aan staat maar niet brandt', () => {
    // producing onbekend of onwaar: geen aanname dat er gestookt wordt.
    expect(assistProposed(winterish({}))).toBe(false);
  });

  it('springt niet bij bij een verwaarloosbaar temperatuurtekort', () => {
    const state = buildState({
      gridPowerW: 1500,
      woonkamerC: 19.8, // 0,2 onder doel: onder minShortfallC
      actuators: { nest: actuator('heat', { setpointC: 20, producingFor: 30 }) },
    });
    expect(assistProposed(state)).toBe(false);
  });

  it('respecteert een aangepaste startvertraging', () => {
    const strict = new StrategyRegistry().register(
      comfort,
      createHeatAssist({ startDelayMinutes: 20 }),
      pvSurplus,
    );
    const decision = decide({
      config: exampleSite,
      state: winterish({ producingFor: 7 }),
      strategies: strict,
    });
    expect(
      decision.proposed.some((i) => i.strategyId === 'heat-assist'),
    ).toBe(false);
  });
});

describe('handmatige stand', () => {
  /** Warme zolder én ruim overschot: normaal zou de arbiter gaan koelen. */
  const hot = (extra: Partial<Parameters<typeof buildState>[0]> = {}) =>
    buildState({ gridPowerW: -3000, woonkamerC: 24.5, zolderC: 25.0, ...extra });

  it('laat alles met rust zodra de bewoner overneemt', () => {
    const auto = run(hot());
    expect(auto.commands.length).toBeGreaterThan(0);

    const manual = run({ ...hot(), modeOverride: 'handmatig' });
    expect(manual.explanation.mode).toBe('handmatig');
    expect(manual.commands).toEqual([]);
    expect(manual.proposed).toEqual([]);
  });

  it('schakelt een draaiend apparaat niet af, anders dan in nachtmodus', () => {
    const running = {
      'ac-zolder': actuator('cool', { setpointC: 21.5, minutesAgo: 90 }),
    };

    // 's Nachts betekent "niets te doen" dat het uit mag.
    const night = run({
      ...hot({ actuators: running }),
      modeOverride: 'nacht',
    });
    expect(
      night.commands.some(
        (c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder',
      ),
    ).toBe(true);

    // Handmatig betekent: afblijven.
    const manual = run({
      ...hot({ actuators: running }),
      modeOverride: 'handmatig',
    });
    expect(manual.commands).toEqual([]);
  });

  it('laat de failsafe wel ingrijpen', () => {
    const decision = run({
      ...hot({
        actuators: {
          'ac-woonkamer': actuator('cool', { setpointC: 21, minutesAgo: 90 }),
        },
        inputHealth: { 'sensor.p1_meter_power': false },
      }),
      modeOverride: 'handmatig',
    });

    expect(decision.explanation.failsafe.active).toBe(true);
    expect(
      decision.commands.some(
        (c) =>
          c.kind === 'setAction' &&
          c.actuatorId === 'ac-woonkamer' &&
          c.action === 'off',
      ),
    ).toBe(true);
  });
});

describe('afbouwen', () => {
  /**
   * Precies de situatie uit het schaduwlogboek: voorverwarmen, een huis dat al
   * ruim warm genoeg is, en beide airco's uit. Er valt niets te bufferen.
   */
  const nothingToDo = (actuators: Partial<Record<string, ActuatorState>> = {}) => ({
    ...buildState({
      gridPowerW: 200,
      woonkamerC: 24.2,
      badkamerC: 22.5,
      zolderC: 23.2,
      actuators,
    }),
    modeOverride: 'voorverwarmen' as const,
  });

  it('zet een uitgeschakelde airco niet aan om hem te parkeren', () => {
    // Dit ging live mis: standby werd voorgesteld voor apparaten die al uit
    // stonden, en dan is het geen afbouwen maar aanzetten.
    const decision = run(nothingToDo());
    const touched = decision.commands.filter(
      (c) =>
        'actuatorId' in c &&
        (c.actuatorId === 'ac-woonkamer' || c.actuatorId === 'ac-zolder'),
    );
    expect(touched).toEqual([]);
  });

  it('parkeert een draaiende airco in plaats van hem hard uit te zetten', () => {
    const decision = run(
      nothingToDo({
        'ac-zolder': actuator('cool', { setpointC: 21.5, minutesAgo: 90 }),
      }),
    );
    expect(
      decision.commands.find(
        (c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder',
      ),
    ).toMatchObject({ action: 'standby' });

    // Het setpoint gaat omhoog, want hij was aan het koelen.
    expect(
      decision.commands.find(
        (c) => c.kind === 'setSetpoint' && c.actuatorId === 'ac-zolder',
      ),
    ).toMatchObject({ setpointC: 25 });
  });

  it('duwt het setpoint omlaag bij parkeren na verwarmen', () => {
    const decision = run(
      nothingToDo({
        'ac-woonkamer': actuator('heat', { setpointC: 21, minutesAgo: 90 }),
      }),
    );
    expect(
      decision.commands.find(
        (c) => c.kind === 'setSetpoint' && c.actuatorId === 'ac-woonkamer',
      ),
    ).toMatchObject({ setpointC: 18 });
  });

  it('zet een geparkeerd apparaat pas uit als de rustperiode voorbij is', () => {
    const parked = {
      'ac-zolder': actuator('standby', { setpointC: 25, minutesAgo: 90 }),
    };

    const during = run({
      ...nothingToDo(parked),
      timers: {
        stabilisation: { endsAtMs: NOW + 120_000 },
        manualOverride: { endsAtMs: null },
      },
    });
    expect(
      during.commands.some(
        (c) => 'actuatorId' in c && c.actuatorId === 'ac-zolder',
      ),
    ).toBe(false);

    expect(
      run(nothingToDo(parked)).commands.find(
        (c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder',
      ),
    ).toMatchObject({ action: 'off' });
  });
});

describe('een huis zonder aanwezigheidsbronnen', () => {
  /*
   * `some()` op een lege lijst geeft false, en dat betekende: altijd afwezig,
   * dus altijd de zuinige setpoints. Een installatie waarin niemand
   * `person.`-entiteiten heeft ingesteld zou zichzelf stilzwijgend koud
   * houden. Wanneer we het niet weten, raden we de comfortabele kant.
   */
  const zonderBewoners = { ...exampleSite, occupancy: [] };

  it('geldt als bewoond in plaats van als leeg', () => {
    const state = { ...buildState({ woonkamerC: 19.0 }), occupancy: {}, modeOverride: null };
    const decision = decide({
      config: zonderBewoners,
      state,
      strategies: defaultStrategies(),
    });
    expect(decision.explanation.occupied).toBe(true);
    expect(decision.explanation.mode).not.toBe('afwezig');
  });

  it('laat een huis mét bronnen gewoon afwezig zijn', () => {
    // De tegenhanger: de lege lijst is de uitzondering, niet de regel.
    const state = { ...buildState({ woonkamerC: 19.0 }), occupancy: {}, modeOverride: null };
    const decision = decide({ config: exampleSite, state, strategies: defaultStrategies() });
    expect(decision.explanation.occupied).toBe(false);
  });
});

describe('koelen tijdens afwezigheid', () => {
  /** Warm huis, niemand thuis, zon op het dak. */
  const awayAndWarm = () => ({
    ...buildState({ gridPowerW: -2500, woonkamerC: 24.0, zolderC: 24.5 }),
    occupancy: {},
    modeOverride: null,
  });

  it('koelt voor op gratis zon terwijl het huis leeg is', () => {
    const decision = run(awayAndWarm());
    expect(decision.explanation.mode).toBe('afwezig');
    expect(decision.explanation.occupied).toBe(false);
    expect(
      decision.commands.some((c) => c.kind === 'setAction' && c.action === 'cool'),
    ).toBe(true);
  });

  it('doet dat niet zonder zon, ook al is het warm', () => {
    const decision = run({
      ...awayAndWarm(),
      sunAboveHorizon: value(false, NOW),
    });
    expect(
      decision.commands.some((c) => c.kind === 'setAction' && c.action === 'cool'),
    ).toBe(false);
  });

  it('vraagt de ketel niet om te koelen', () => {
    // De Nest kan alleen verwarmen. Zonder de capaciteitscontrole in comfort
    // zou hij elke ronde een koelvoorstel krijgen dat de arbiter afwijst.
    const decision = run(awayAndWarm());
    expect(
      decision.proposed.some((i) => i.actuatorId === 'nest' && i.action === 'cool'),
    ).toBe(false);
    expect(
      decision.rejected.some((r) => r.blockedBy === 'capability_missing'),
    ).toBe(false);
  });
});
