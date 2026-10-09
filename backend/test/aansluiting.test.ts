/**
 * De zon en je aansluiting (besluit 103): herkennen, bewaren, en wat de regeling
 * ervan overneemt.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import {
  ConnectionStore,
  SensorPace,
  connectionView,
  findAppliances,
  findPhases,
  solarBrand,
  validateConnection,
  withConnection,
  type ConnectionAnswers,
} from '../src/web/aansluiting.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

function st(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HaEntityState {
  return { entity_id, state, attributes, last_changed: '', last_updated: '' };
}

const P1 = [
  st('sensor.p1_meter_current_phase_1', '3.2', { device_class: 'current', unit_of_measurement: 'A' }),
  st('sensor.p1_meter_voltage_phase_1', '231', { device_class: 'voltage', unit_of_measurement: 'V' }),
  st('sensor.p1_meter_voltage_sags_detected_phase_1', '0', {}),
  st('sensor.p1_meter_power_phase_1', '700', { device_class: 'power', unit_of_measurement: 'W' }),
];

const DRYER = 'bosch_wtx87mwin_68a40e64ae22';
const entities: HaRegistryEntity[] = [
  { entity_id: `binary_sensor.${DRYER}_bsh_common_status_remotecontrolstartallowed`, device_id: 'dev-droger' },
  { entity_id: `sensor.${DRYER}_bsh_common_status_operationstate`, device_id: 'dev-droger' },
  { entity_id: `sensor.${DRYER}_bsh_common_option_estimatedtotalprogramtime`, device_id: 'dev-droger' },
  { entity_id: `sensor.${DRYER}_laundrycare_common_option_processphase`, device_id: 'dev-droger' },
  { entity_id: 'binary_sensor.vaatwasser_remote_start', device_id: 'dev-vaat' },
  { entity_id: 'binary_sensor.uitgezet_remote_start', device_id: 'dev-uit', disabled_by: 'user' },
];
const devices: HaDevice[] = [
  { id: 'dev-droger', area_id: null, name: 'WTX87MWIN' },
  { id: 'dev-vaat', area_id: null, name: 'Dishwasher', name_by_user: 'Vaatwasser keuken' },
];
const states = new Map(
  [
    st(`binary_sensor.${DRYER}_bsh_common_status_remotecontrolstartallowed`, 'off'),
    st(`sensor.${DRYER}_bsh_common_status_operationstate`, 'Ready'),
    st(`sensor.${DRYER}_bsh_common_option_estimatedtotalprogramtime`, '2:48'),
    st(`sensor.${DRYER}_laundrycare_common_option_processphase`, 'none'),
    st('binary_sensor.vaatwasser_remote_start', 'on'),
  ].map((s) => [s.entity_id, s]),
);

describe('herkennen in Home Assistant', () => {
  it('vindt de stroom en spanning per fase van de P1-meter, en niet de dalen of het vermogen', () => {
    expect(findPhases(P1)).toEqual([{ id: 'L1', current: 'sensor.p1_meter_current_phase_1', voltage: 'sensor.p1_meter_voltage_phase_1' }]);
  });

  it('kiest geen fase als twee meters even goed passen', () => {
    const twee = [
      st('sensor.groep_a_current_l1', '1', { unit_of_measurement: 'A' }),
      st('sensor.groep_b_current_l1', '1', { unit_of_measurement: 'A' }),
    ];
    expect(findPhases(twee)).toEqual([]);
    // Met een meter van het net erbij wint die.
    expect(findPhases([...twee, st('sensor.dsmr_current_l1', '2', { unit_of_measurement: 'A' })]).map((f) => f.current)).toEqual(['sensor.dsmr_current_l1']);
  });

  it('vindt drie fasen als de meter ze heeft', () => {
    const drie = [1, 2, 3].map((n) => st(`sensor.p1_meter_current_phase_${n}`, '1', { device_class: 'current' }));
    expect(findPhases(drie).map((f) => f.id)).toEqual(['L1', 'L2', 'L3']);
  });

  it('vindt de droger van Home Connect met zijn status en duur, en een vaatwasser bij zijn eigen naam', () => {
    const found = findAppliances(states, entities, devices);
    expect(found).toEqual([
      {
        id: 'droger',
        naam: 'Droger',
        soort: 'droger',
        remoteStart: `binary_sensor.${DRYER}_bsh_common_status_remotecontrolstartallowed`,
        operationState: `sensor.${DRYER}_bsh_common_status_operationstate`,
        programDuration: `sensor.${DRYER}_bsh_common_option_estimatedtotalprogramtime`,
        estimatedW: 700,
      },
      {
        id: 'vaatwasser',
        naam: 'Vaatwasser keuken',
        soort: 'vaatwasser',
        remoteStart: 'binary_sensor.vaatwasser_remote_start',
        estimatedW: 1800,
      },
    ]);
  });
});

describe('hoe snel de zonnesensor is (besluit 89)', () => {
  it('geeft de mediaan tussen twee waarden, pas na genoeg metingen, en telt de nacht niet', () => {
    const pace = new SensorPace();
    const t0 = Date.parse('2026-10-07T10:00:00Z');
    for (let i = 0; i < 5; i++) pace.note(t0 + i * 61_000, 800);
    expect(pace.intervalS).toBeNull();
    pace.note(t0 + 5 * 61_000, 820);
    expect(pace.intervalS).toBe(61);
    pace.note(t0 + 6 * 61_000, 0);
    expect(pace.intervalS).toBe(61);
    // Na een nacht begint het opnieuw.
    pace.note(t0 + 14 * 3_600_000, 50);
    expect(pace.intervalS).toBeNull();
  });

  it('kent de lokale weg per merk', () => {
    expect(solarBrand('solaredge_modbus_multi')).toMatchObject({ merk: 'SolarEdge', lokaal: true });
    expect(solarBrand('solaredge')).toMatchObject({ merk: 'SolarEdge', lokaal: false, weg: expect.stringMatching(/Modbus/) });
    expect(solarBrand('iets')).toMatchObject({ merk: null, weg: expect.stringMatching(/kWh-meter/) });
  });
});

const found = { fasen: findPhases(P1), apparaten: findAppliances(states, entities, devices) };

describe('bewaren', () => {
  it('neemt alleen antwoorden aan; de meters en apparaten komen van de dienst', () => {
    const ok = validateConnection(
      { panelen: { ligging: 'beide', aantal: 12 }, zekering: { fasen: 1, ampere: 35 }, tarief: 'vast', opZon: { droger: true } },
      found,
    );
    expect(ok.ok && ok.answers).toMatchObject({
      panelen: { ligging: 'beide', aantal: 12 },
      zekering: { fasen: 1, ampere: 35 },
      fasen: [{ id: 'L1' }],
      apparaten: [{ id: 'droger', opZon: true }, { id: 'vaatwasser', opZon: false }],
    });
    expect(validateConnection({ zekering: 'weetniet' }, found)).toMatchObject({ ok: true, answers: { zekering: 'weetniet', panelen: { ligging: null } } });
  });

  it('telt bij beide kanten per kant, en het totaal volgt daaruit', () => {
    const both = validateConnection({ panelen: { ligging: 'beide', voorkant: 6, achterkant: 6 } }, found);
    expect(both.ok && both.answers.panelen).toEqual({ ligging: 'beide', aantal: 12, voorkant: 6, achterkant: 6 });
    // Bij één kant telt alleen het aantal; een aantal per kant valt weg.
    const one = validateConnection({ panelen: { ligging: 'voorkant', aantal: 8, voorkant: 3 } }, found);
    expect(one.ok && one.answers.panelen).toEqual({ ligging: 'voorkant', aantal: 8, voorkant: null, achterkant: null });
    expect(validateConnection({ panelen: { ligging: 'beide', voorkant: 0 } }, found).ok).toBe(false);
  });

  it('weigert wat niet kan', () => {
    expect(validateConnection({ panelen: { ligging: 'zuid' } }, found).ok).toBe(false);
    expect(validateConnection({ panelen: { aantal: 0 } }, found).ok).toBe(false);
    expect(validateConnection({ zekering: { fasen: 2, ampere: 25 } }, found).ok).toBe(false);
    expect(validateConnection({ zekering: { fasen: 1, ampere: 3 } }, found).ok).toBe(false);
    expect(validateConnection({ tarief: 'gratis' }, found).ok).toBe(false);
    expect(validateConnection({ opZon: { wasmachine: true } }, found).ok).toBe(false);
    expect(validateConnection({ opZon: { droger: 'ja' } }, found).ok).toBe(false);
    expect(validateConnection([], found).ok).toBe(false);
  });

  it('bewaart in aansluiting.json en leest het terug', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-aansluiting-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const store = new ConnectionStore(dir);
    expect(await store.load()).toBeNull();
    const checked = validateConnection({ zekering: { fasen: 1, ampere: 35 }, opZon: { droger: true } }, found);
    if (!checked.ok) throw new Error(checked.reden);
    await store.save(checked.answers);
    expect(JSON.parse(await readFile(join(dir, 'aansluiting.json'), 'utf-8'))).toMatchObject({ versie: 1, zekering: { ampere: 35 } });
    expect(await new ConnectionStore(dir).load()).toEqual(checked.answers);
  });
});

describe('wat de regeling overneemt', () => {
  const answers = (over: Partial<ConnectionAnswers> = {}): ConnectionAnswers => {
    const checked = validateConnection({ zekering: { fasen: 1, ampere: 35 }, opZon: { droger: true, vaatwasser: false } }, found);
    if (!checked.ok) throw new Error(checked.reden);
    return { ...checked.answers, ...over };
  };

  it('vult de zekering en de droger aan als de configuratie ze niet noemt, en dat past in het schema', async () => {
    const real = JSON.parse(await readFile(join(import.meta.dirname, '..', '..', 'config', 'sites', 'huis-cornelissen.json'), 'utf-8')) as Record<string, unknown>;
    const bare = { ...real };
    delete bare['grid'];
    delete bare['deferrables'];
    const applied = withConnection(bare, answers());
    expect(applied.toegevoegd).toEqual(['het stroombudget: 1 × 35 A', 'Droger op zon']);
    const parsed = parseSiteConfig(applied.raw, { knownStrategies: defaultStrategies().ids });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
    expect(parsed.config.grid?.phases).toEqual([
      { id: 'L1', current: { adapter: 'homeassistant', id: 'sensor.p1_meter_current_phase_1' }, voltage: { adapter: 'homeassistant', id: 'sensor.p1_meter_voltage_phase_1' }, maxA: 35 },
    ]);
    expect(parsed.config.deferrables?.map((d) => [d.id, d.estimatedW, d.latestStart])).toEqual([['droger', 700, '15:00']]);
  });

  it('laat de zekering uit de app voorgaan, met de meters uit de configuratie (besluit 117)', async () => {
    const real = JSON.parse(await readFile(join(import.meta.dirname, '..', '..', 'config', 'sites', 'huis-cornelissen.json'), 'utf-8')) as Record<string, unknown>;
    const applied = withConnection(real, answers({ zekering: { fasen: 1, ampere: 25 }, apparaten: [] }));
    expect(applied.toegevoegd).toEqual(['de hoofdzekering: 1 × 25 A']);
    const grid = applied.raw['grid'] as { phases: { current: unknown; maxA: number }[]; marginA: number };
    const was = real['grid'] as typeof grid;
    expect(grid.phases.map((p) => p.maxA)).toEqual([25]);
    expect(grid.phases[0]!.current).toEqual(was.phases[0]!.current);
    expect(grid.marginA).toBe(was.marginA);
    expect(parseSiteConfig(applied.raw, { knownStrategies: defaultStrategies().ids }).ok).toBe(true);
    // Dezelfde zekering als de configuratie: niets te doen.
    expect(withConnection(real, answers({ zekering: { fasen: 1, ampere: 35 }, apparaten: [] })).raw).toEqual(real);
  });

  it('zegt het als er voor drie fasen te weinig meters zijn', () => {
    const applied = withConnection({}, answers({ zekering: { fasen: 3, ampere: 25 } }));
    expect(applied.raw['grid']).toBeUndefined();
    expect(applied.overgeslagen).toEqual(['3 × 25 A, maar één stroommeter per fase gevonden']);
  });

  it('doet niets zonder antwoorden of met "weet ik niet"', () => {
    expect(withConnection({ id: 'x' }, null)).toEqual({ raw: { id: 'x' }, toegevoegd: [], overgeslagen: [] });
    expect(withConnection({ id: 'x' }, answers({ zekering: 'weetniet', apparaten: [] })).toegevoegd).toEqual([]);
  });
});

describe('wat de pagina krijgt', () => {
  it('toont wat de configuratie vastlegt, de zonnesensor, en of een nieuw antwoord op de volgende start wacht', async () => {
    const real = JSON.parse(await readFile(join(import.meta.dirname, '..', '..', 'config', 'sites', 'huis-cornelissen.json'), 'utf-8')) as unknown;
    const parsed = parseSiteConfig(real, { knownStrategies: defaultStrategies().ids });
    if (!parsed.ok) throw new Error('configuratie');
    const checked = validateConnection({ zekering: { fasen: 3, ampere: 25 } }, found);
    if (!checked.ok) throw new Error(checked.reden);
    const view = connectionView({
      base: parsed.config,
      found,
      // Zoals main.ts het doorgeeft: het hele resultaat, met de configuratie erin.
      applied: { toegevoegd: [], overgeslagen: [], raw: real } as never,
      answersAtStart: null,
      answers: checked.answers,
      solar: { naam: 'SolarEdge AC-vermogen', intervalS: 61, platform: 'solaredge_modbus_multi' },
    });
    expect(view.configuratie).toEqual({
      zekering: { fasen: 1, ampere: 35 },
      apparaten: [{ id: 'droger', naam: 'Droger' }],
      panelen: ['2,3 kWp op het oosten, 47°', '2,3 kWp op het westen, 47°'],
    });
    expect(view.zonnesensor).toMatchObject({ intervalS: 61, snelGenoeg: true, merk: 'SolarEdge' });
    expect(view.gevonden.apparaten.map((a) => a.id)).toEqual(['droger', 'vaatwasser']);
    // De pagina krijgt nooit een entiteit (besluit 45), ook niet bij de antwoorden.
    expect(view.gevonden.fasen).toEqual(['L1']);
    expect(JSON.stringify(view.gevonden)).not.toMatch(/sensor\./);
    expect(view.inDeRegeling).toEqual({ toegevoegd: [], overgeslagen: [] });
    expect(JSON.stringify(view)).not.toMatch(/sensor\.|binary_sensor\.|climate\./);
    expect(view.volgendeStart).toBe(true);
  });
});
