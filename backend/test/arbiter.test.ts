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
import type { Action, SiteConfig } from '../src/core/model.js';
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
  livingRoomC?: number;
  atticC?: number;
  bathroomC?: number;
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
    solarProductionW: unavailable<number>('missing'),
    occupancy: { ricardo: value(true, NOW) },
    zones: {
      woonkamer: { temperatureC: value(o.livingRoomC ?? 21.0, NOW) },
      badkamer: { temperatureC: value(o.bathroomC ?? 20.0, NOW) },
      zolder: { temperatureC: value(o.atticC ?? 24.0, NOW) },
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
      buildState({ gridPowerW: -1000, livingRoomC: 24.0, atticC: 24.5 }),
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
        livingRoomC: 24.0,
        atticC: 24.5,
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
      buildState({ gridPowerW: 3000, livingRoomC: 18.0, bathroomC: 15.0 }),
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
        atticC: 24.0,
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
        atticC: 24.5,
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
        livingRoomC: 18.0,
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
    const state = buildState({ gridPowerW: -1200, livingRoomC: 23.8, atticC: 24.2 });
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
        livingRoomC: 24.0,
        atticC: 24.5,
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
      livingRoomC: 18.5,
      bathroomC: 20.0,
      atticC: 20.0,
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
      livingRoomC: 19.8, // 0,2 onder doel: onder minShortfallC
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
    buildState({ gridPowerW: -3000, livingRoomC: 24.5, atticC: 25.0, ...extra });

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
      livingRoomC: 24.2,
      bathroomC: 22.5,
      atticC: 23.2,
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

describe('hooguit één start per beslissing (besluit 68)', () => {
  it('start bij ruim overschot één airco, en houdt de tweede op de stabilisatie', () => {
    // Genoeg zon voor allebei, en allebei te warm.
    const decision = run(buildState({ gridPowerW: -6000, livingRoomC: 24.5, atticC: 25.5 }));
    const starts = decision.commands.filter(
      (c) =>
        c.kind === 'setAction' &&
        (c.actuatorId === 'ac-woonkamer' || c.actuatorId === 'ac-zolder') &&
        c.action === 'cool',
    );
    expect(starts).toHaveLength(1);

    const held = decision.rejected.find(
      (r) => r.intent.actuatorId !== (starts[0] as { actuatorId: string }).actuatorId && r.blockedBy === 'stabilisation_active',
    );
    expect(held?.detail).toBe('er is deze ronde al iets gestart');
  });
});

describe('parkeren start de stabilisatie (besluit 61)', () => {
  const quiet = (actuators: Partial<Record<string, ActuatorState>>) => ({
    ...buildState({ gridPowerW: 200, livingRoomC: 24.2, bathroomC: 22.5, atticC: 23.2, actuators }),
    modeOverride: 'voorverwarmen' as const,
  });
  const timerStart = (d: ReturnType<typeof run>) =>
    d.commands.find((c) => c.kind === 'startTimer' && c.timerId === 'stabilisation');

  it('start de timer wanneer een draaiende airco wordt geparkeerd', () => {
    const decision = run(quiet({ 'ac-zolder': actuator('cool', { setpointC: 21.5, minutesAgo: 90 }) }));
    expect(
      decision.commands.find((c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder'),
    ).toMatchObject({ action: 'standby' });
    expect(timerStart(decision)).toMatchObject({ durationS: 5 * 60 });
  });

  it('start geen timer wanneer een geparkeerde airco uitgaat', () => {
    // Uitzetten na het parkeren is het einde van de stabilisatie, geen nieuwe.
    const decision = run(quiet({ 'ac-zolder': actuator('standby', { setpointC: 25, minutesAgo: 90 }) }));
    expect(
      decision.commands.find((c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder'),
    ).toMatchObject({ action: 'off' });
    expect(timerStart(decision)).toBeUndefined();
  });

  it('start geen timer wanneer er niets verandert', () => {
    expect(timerStart(run(quiet({})))).toBeUndefined();
  });
});

describe('een huis zonder aanwezigheidsbronnen', () => {
  /*
   * `some()` op een lege lijst geeft false, en dat betekende: altijd afwezig,
   * dus altijd de zuinige setpoints. Een installatie waarin niemand
   * `person.`-entiteiten heeft ingesteld zou zichzelf stilzwijgend koud
   * houden. Wanneer we het niet weten, raden we de comfortabele kant.
   */
  const withoutResidents = { ...exampleSite, occupancy: [] };

  it('geldt als bewoond in plaats van als leeg', () => {
    const state = { ...buildState({ livingRoomC: 19.0 }), occupancy: {}, modeOverride: null };
    const decision = decide({
      config: withoutResidents,
      state,
      strategies: defaultStrategies(),
    });
    expect(decision.explanation.occupied).toBe(true);
    expect(decision.explanation.mode).not.toBe('afwezig');
  });

  it('laat een huis mét bronnen gewoon afwezig zijn', () => {
    // De tegenhanger: de lege lijst is de uitzondering, niet de regel.
    const state = { ...buildState({ livingRoomC: 19.0 }), occupancy: {}, modeOverride: null };
    const decision = decide({ config: exampleSite, state, strategies: defaultStrategies() });
    expect(decision.explanation.occupied).toBe(false);
  });
});

describe('koelen tijdens afwezigheid', () => {
  /** Warm huis, niemand thuis, zon op het dak. */
  const awayAndWarm = () => ({
    ...buildState({ gridPowerW: -2500, livingRoomC: 24.0, atticC: 24.5 }),
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

describe('het comfortplafond (besluit 50)', () => {
  /** Dezelfde woning, met een plafond op de woonkamer. */
  function withCeiling(ceiling: number | undefined): SiteConfig {
    return {
      ...exampleSite,
      zones: exampleSite.zones.map((z) => {
        if (z.id !== 'woonkamer') return z;
        const { comfortMaxC: _omitted, ...rest } = z;
        return ceiling == null ? rest : { ...rest, comfortMaxC: ceiling };
      }),
    };
  }

  const decideWith = (config: SiteConfig, state: SystemState) =>
    decide({ config, state, strategies: defaultStrategies() });

  /** Warm, en de zon betaalt niets: het huis voert 500 W in. */
  const hotAndCloudy = (o: Overrides = {}) =>
    buildState({ gridPowerW: 500, livingRoomC: 27.0, ...o });

  it('koelt zonder plafond niet op netstroom, hoe warm het ook is', () => {
    // Het gat zoals het was: de airco is assist, en assist draait op overschot.
    const decision = decideWith(withCeiling(undefined), hotAndCloudy());

    const cools = decision.commands.some(
      (c) => c.kind === 'setAction' && c.actuatorId === 'ac-woonkamer' && c.action === 'cool',
    );
    expect(cools).toBe(false);
  });

  it('koelt met een plafond wel, en laat zich daarbij niet door het budget tegenhouden', () => {
    const decision = decideWith(withCeiling(26), hotAndCloudy());

    const accepted = decision.accepted.find(
      (i) => i.actuatorId === 'ac-woonkamer' && i.action === 'cool',
    );
    expect(accepted?.strategyId).toBe('comfort');
    expect(accepted?.budgetW).toBe(0);
    expect(
      decision.rejected.some(
        (r) =>
          r.intent.actuatorId === 'ac-woonkamer' &&
          r.intent.strategyId === 'comfort' &&
          r.blockedBy === 'insufficient_power_budget',
      ),
    ).toBe(false);
  });

  it('koelt tot het plafond en niet door naar het koeldoel', () => {
    // Het verschil tussen "het mag niet warmer worden" en "het moet hier
    // naartoe". Het koeldoel van de woonkamer is 22; op netstroom daarheen
    // koelen zou het grootste deel van de rekening zijn.
    const decision = decideWith(withCeiling(26), hotAndCloudy());

    const accepted = decision.accepted.find(
      (i) => i.actuatorId === 'ac-woonkamer' && i.strategyId === 'comfort',
    );
    expect(accepted?.setpointC).toBe(26);
  });

  it('slaat pas aan boven het plafond plus de schakelband', () => {
    // onDelta is 0,3 voor de woonkamer. Op 26,2 nog niet, op 26,3 wel.
    const justBelow = decideWith(withCeiling(26), hotAndCloudy({ livingRoomC: 26.2 }));
    const justAbove = decideWith(withCeiling(26), hotAndCloudy({ livingRoomC: 26.3 }));

    const comfortCools = (d: ReturnType<typeof decideWith>) =>
      d.accepted.some((i) => i.actuatorId === 'ac-woonkamer' && i.strategyId === 'comfort');
    expect(comfortCools(justBelow)).toBe(false);
    expect(comfortCools(justAbove)).toBe(true);
  });

  it('houdt vast tot onder het plafond min de uitschakelband', () => {
    // Al aan het koelen, op 25,9: offDelta 0,2 betekent doorgaan tot onder 25,8.
    // Zonder deze band zou hij op het plafond zelf klapperen.
    const decision = decideWith(
      withCeiling(26),
      hotAndCloudy({
        livingRoomC: 25.9,
        actuators: { 'ac-woonkamer': actuator('cool', { setpointC: 26, powerW: 850 }) },
      }),
    );

    expect(
      decision.accepted.some(
        (i) => i.actuatorId === 'ac-woonkamer' && i.strategyId === 'comfort',
      ),
    ).toBe(true);
  });

  it('geeft een zone met een koelende primary geen tweede voorstel', () => {
    // Kan de primary zelf koelen, dan verdedigt het koeldoel al een strengere
    // grens. Een tweede voorstel zou alleen maar afgewezen worden.
    const config: SiteConfig = {
      ...withCeiling(26),
      actuators: exampleSite.actuators.map((a) =>
        a.id === 'nest' ? { ...a, capabilities: { ...a.capabilities, canCool: true } } : a,
      ),
    };
    const decision = decideWith(config, hotAndCloudy());

    const byComfort = decision.proposed.filter(
      (i) => i.zoneId === 'woonkamer' && i.strategyId === 'comfort' && i.action === 'cool',
    );
    expect(byComfort.map((i) => i.actuatorId)).toEqual(['nest']);
  });
});

describe('starten vraagt meer dan draaien (besluit 51)', () => {
  // Alleen de zolder wil koelen: de woonkamer staat op 21,0 en valt daarmee net
  // buiten zijn bufferband. `startSurplusW` is 1000, `resumeSurplusW` 600.
  const atticRejection = (d: ReturnType<typeof run>) =>
    d.rejected.find((r) => r.intent.actuatorId === 'ac-zolder')?.blockedBy;
  const atticStart = (d: ReturnType<typeof run>) =>
    d.commands.some(
      (c) => c.kind === 'setAction' && c.actuatorId === 'ac-zolder' && c.action === 'cool',
    );

  it('start niet op een overschot dat het apparaat net dekt', () => {
    // 900 W overschot is genoeg voor de 750 W van de zolder-airco, maar geen
    // marge: een wolk later draait hij een kwartier op netstroom.
    const d = run(buildState({ gridPowerW: -900 }));
    expect(atticStart(d)).toBe(false);
    expect(atticRejection(d)).toBe('start_threshold_not_met');
  });

  it('start wel zodra de marge er is', () => {
    const d = run(buildState({ gridPowerW: -1000 }));
    expect(atticStart(d)).toBe(true);
  });

  it('laat een draaiend apparaat door op de tolerantie, zonder startdrempel', () => {
    // 30 W invoer, 750 W eigen opname: 770 W budget voor een claim van 750.
    // Uitschakelen voor een dip van 30 W zou duurder zijn dan doordraaien.
    const d = run(
      buildState({
        gridPowerW: 30,
        actuators: { 'ac-zolder': actuator('cool', { setpointC: 21.5, powerW: 750 }) },
      }),
    );
    expect(d.accepted.some((i) => i.actuatorId === 'ac-zolder' && i.action === 'cool')).toBe(true);
    expect(atticRejection(d)).toBeUndefined();
  });

  it('laat een geparkeerd apparaat hervatten op de lagere drempel', () => {
    // 800 W vrij: onder de startdrempel, boven de hervatdrempel. Een koude
    // start wacht, een apparaat dat net geparkeerd werd pakt het weer op.
    const cold = run(buildState({ gridPowerW: -800 }));
    const parked = run(
      buildState({
        gridPowerW: -800,
        actuators: { 'ac-zolder': actuator('standby', { setpointC: 25, minutesAgo: 10 }) },
      }),
    );
    expect(atticRejection(cold)).toBe('start_threshold_not_met');
    expect(atticStart(parked)).toBe(true);
  });
});
