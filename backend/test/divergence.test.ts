/**
 * Tests op de divergentietool.
 *
 * De logboeken hier zijn met de hand gemaakt, met precies de gevallen die ertoe
 * doen: eensgezindheid, een episode waarin de arbiter strenger is, een waarin
 * hij ruimer is, en netstroom die toegerekend moet worden. Dat is beter dan een
 * echt logboek als invoer: dan toets je de tool tegen wat er die dag toevallig
 * gebeurde in plaats van tegen wat hij moet kunnen.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { analyse } from '../src/divergence/analyse.js';
import {
  arbiterRunning,
  findLogFiles,
  observedRunning,
  readMoments,
  type Moment,
} from '../src/divergence/read.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

const DAY = '2026-11-20';
const T0 = Date.parse(`${DAY}T09:00:00Z`);

interface RecordSpec {
  /** Minuten na T0. */
  min: number;
  obs: Record<string, string>;
  gridW: number;
  reclaimableW?: number;
  /** Wat de arbiter zou sturen. */
  commands?: { kind: string; actuatorId: string; action: string }[];
  accepted?: { actuatorId: string; action: string }[];
  rejected?: { actuatorId: string; action: string; blockedBy: string }[];
  legacy?: string;
  changed?: boolean;
}

function line(spec: RecordSpec): string {
  const full = spec.changed ?? false;
  const base = {
    t: T0 + spec.min * 60_000,
    changed: full,
    mode: 'dag',
    budget: {
      availableW: 0,
      allocatedW: 0,
      surplusW: Math.max(0, -spec.gridW),
      reclaimableW: spec.reclaimableW ?? 0,
      gridPowerW: spec.gridW,
    },
    obs: spec.obs,
    ...(spec.legacy != null ? { legacy: spec.legacy } : {}),
    ...(full
      ? {
          zones: [{ zoneId: 'zolder', temperatureC: 24, demand: 'cool' }],
          commands: spec.commands ?? [],
          accepted: spec.accepted ?? [],
          rejected: (spec.rejected ?? []).map((r) => ({
            intent: { actuatorId: r.actuatorId, action: r.action },
            blockedBy: r.blockedBy,
          })),
        }
      : { zonesT: [['zolder', 24, 'cool']] }),
  };
  return JSON.stringify(base);
}

async function logDir(specs: readonly RecordSpec[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hems-div-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, `decisions-${DAY}.ndjson`),
    specs.map(line).join('\n') + '\n',
    'utf-8',
  );
  return dir;
}

async function run(specs: readonly RecordSpec[], minEpisodeMinutes = 2) {
  const dir = await logDir(specs);
  const files = await findLogFiles(dir);
  return analyse(readMoments(files), { minEpisodeMinutes });
}

describe('waarneming lezen', () => {
  it('herkent draaien, uit en de standby-afspraak', () => {
    expect(observedRunning('cool@21')).toBe(true);
    expect(observedRunning('heat@21')).toBe(true);
    expect(observedRunning('off')).toBe(false);
    expect(observedRunning('onbekend')).toBe(false);
    expect(observedRunning(undefined)).toBe(false);
    // Geparkeerd telt niet als draaien: 25 bij koelen, 18 bij verwarmen.
    expect(observedRunning('cool@25')).toBe(false);
    expect(observedRunning('heat@18')).toBe(false);
  });

  it('draagt voort wat een kort record weglaat', async () => {
    const dir = await logDir([
      { min: 0, obs: { 'ac-zolder': 'cool@21' }, gridW: -900, legacy: 'PV-koelen actief' },
      { min: 1, obs: { 'ac-zolder': 'cool@21' }, gridW: -900 },
      { min: 2, obs: { 'ac-zolder': 'cool@21' }, gridW: -900 },
    ]);
    const moments: Moment[] = [];
    for await (const m of readMoments(await findLogFiles(dir))) moments.push(m);

    expect(moments).toHaveLength(3);
    // De uitleg stond alleen in het eerste record.
    expect(moments[2]?.legacy).toBe('PV-koelen actief');
  });

  it('slaat een kapotte regel over in plaats van te stoppen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-div-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    await writeFile(
      join(dir, `decisions-${DAY}.ndjson`),
      [
        line({ min: 0, obs: { 'ac-zolder': 'off' }, gridW: 0 }),
        '{"t":123, dit is geen json',
        line({ min: 1, obs: { 'ac-zolder': 'off' }, gridW: 0 }),
      ].join('\n') + '\n',
      'utf-8',
    );
    const moments: Moment[] = [];
    for await (const m of readMoments(await findLogFiles(dir))) moments.push(m);
    expect(moments).toHaveLength(2);
  });
});

describe('wat de arbiter zou doen', () => {
  const moment = (over: Partial<Moment>): Moment => ({
    tMs: T0,
    mode: 'dag',
    budget: {
      availableW: 0,
      allocatedW: 0,
      surplusW: 0,
      reclaimableW: 0,
      gridPowerW: 0,
    },
    zones: [],
    observed: { 'ac-zolder': 'cool@21' },
    legacy: null,
    commands: [],
    rejected: [],
    accepted: [],
    arbiterAction: {},
    failsafe: false,
    outdoorC: null,
    full: true,
    handsOff: false,
    ...over,
  });

  it('volgt het commando wanneer er een uitgaat', () => {
    expect(
      arbiterRunning(
        moment({ arbiterAction: { 'ac-zolder': 'standby' } }),
        'ac-zolder',
      ),
    ).toBe(false);
  });

  it('houdt een apparaat draaiend als er niets gestuurd wordt', () => {
    // De minimale draaitijd hield het afschakelen tegen: geen commando, dus het
    // apparaat blijft aan. Dat als "teruggeschakeld" tellen zou de uitkomst
    // mooier maken dan hij is.
    expect(arbiterRunning(moment({}), 'ac-zolder')).toBe(true);
  });
});

describe('episodes', () => {
  it('voegt aaneengesloten afwijking samen tot één episode met een reden', async () => {
    const specs: RecordSpec[] = [];
    // Tien minuten eensgezind: allebei uit.
    for (let m = 0; m < 10; m++) {
      specs.push({ min: m, obs: { 'ac-zolder': 'off' }, gridW: -100 });
    }
    // Twintig minuten waarin het oude systeem koelt terwijl het huis importeert,
    // en de arbiter zou terugschakelen wegens het budget.
    for (let m = 10; m < 30; m++) {
      specs.push({
        min: m,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: 400,
        reclaimableW: 600,
        changed: m === 10,
        ...(m === 10
          ? { legacy: 'PV-koelen actief:<br>&emsp;❄️ Zolder (Koelen)' }
          : {}),
        commands:
          m === 10
            ? [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'standby' }]
            : [],
        rejected:
          m === 10
            ? [
                {
                  actuatorId: 'ac-zolder',
                  action: 'cool',
                  blockedBy: 'insufficient_power_budget',
                },
              ]
            : [],
      });
    }
    // En weer eensgezind uit.
    for (let m = 30; m < 40; m++) {
      specs.push({ min: m, obs: { 'ac-zolder': 'off' }, gridW: -100 });
    }

    const a = await run(specs);

    expect(a.momentsWithObservation).toBe(40);
    expect(a.episodes).toHaveLength(1);

    const e = a.episodes[0]!;
    expect(e.actuatorId).toBe('ac-zolder');
    expect(e.direction).toBe('strenger');
    expect(e.minutes).toBe(19);
    expect(e.blockedBy).toBe('insufficient_power_budget');
    expect(e.legacy).toContain('PV-koelen actief');
    // 400 W net, 50 W tolerantie, hoogstens de 600 W die de units opnemen.
    expect(e.meanGridW).toBeCloseTo(400, 0);
    expect(e.attributableWh).toBeGreaterThan(100);
  });

  it('telt de andere richting apart', async () => {
    const specs: RecordSpec[] = [];
    for (let m = 0; m < 15; m++) {
      specs.push({
        min: m,
        obs: { 'ac-zolder': 'off' },
        gridW: -2000,
        changed: m === 0,
        commands:
          m === 0 ? [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'cool' }] : [],
        accepted: m === 0 ? [{ actuatorId: 'ac-zolder', action: 'cool' }] : [],
      });
    }
    const a = await run(specs);
    expect(a.episodes).toHaveLength(1);
    expect(a.episodes[0]?.direction).toBe('ruimer');
    // Ruimer draaien kost geen netstroom: er was ruim overschot.
    expect(a.episodes[0]?.attributableWh).toBe(0);
  });

  it('laat korte hikjes weg', async () => {
    const specs: RecordSpec[] = [
      { min: 0, obs: { 'ac-zolder': 'off' }, gridW: 0 },
      {
        min: 1,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: 300,
        changed: true,
        commands: [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'standby' }],
      },
      { min: 2, obs: { 'ac-zolder': 'off' }, gridW: 0 },
    ];
    expect((await run(specs, 5)).episodes).toHaveLength(0);
    expect((await run(specs, 1)).episodes).toHaveLength(1);
  });
});

describe('toerekening van netstroom', () => {
  it('rekent alleen echte import toe, niet verbruik tijdens teruglevering', async () => {
    const exporting: RecordSpec[] = [];
    for (let m = 0; m < 20; m++) {
      exporting.push({
        min: m,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: -500, // het huis levert terug terwijl de airco draait
        reclaimableW: 600,
      });
    }
    const a = await run(exporting);
    // Volledig op zon: er valt niets aan het net toe te rekenen.
    expect(a.legacyGridWh).toBe(0);
  });

  it('rekent hoogstens toe wat de apparaten zelf opnemen', async () => {
    const specs: RecordSpec[] = [];
    for (let m = 0; m < 61; m++) {
      specs.push({
        min: m,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: 5000, // een oven staat ook aan
        reclaimableW: 300, // maar de airco trekt maar 300 W
      });
    }
    const a = await run(specs);
    // Eén uur lang hoogstens 300 W toerekenen, niet de volle 5 kW.
    expect(a.legacyGridWh).toBeGreaterThan(280);
    expect(a.legacyGridWh).toBeLessThan(310);
  });
});

describe('de bewoner neemt over', () => {
  const HANDMATIG = 'Handmatig koelen actief:<br>&emsp;❄️ Zolder (Koelen)';

  /**
   * Het geval van 6 september 2026, ingedikt.
   *
   * De arbiter had eerder besloten dat de zolder uit mocht. Daarna zet de
   * bewoner hem met de hand aan. Zonder de hands-off regel blijft dat oude
   * besluit doorwerken en groeit er een episode van "oud draaide, ik zou
   * stoppen" — terwijl de arbiter in die stand juist niets vindt.
   */
  const specs = [
    {
      min: 0,
      obs: { 'ac-zolder': 'off' },
      gridW: 200,
      changed: true,
      legacy: 'PV-koelen: Zon is onder',
      commands: [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'off' }],
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      min: 1 + i,
      obs: { 'ac-zolder': 'cool@21' },
      gridW: 700,
      reclaimableW: 700,
      ...(i === 0 ? { legacy: HANDMATIG } : {}),
    })),
  ];

  it('telt een handmatig aangezet apparaat niet als afwijking', async () => {
    const analysis = await run(specs);
    const zolder = analysis.tallies.find((t) => t.actuatorId === 'ac-zolder');

    expect(zolder?.stricter).toBe(0);
    expect(analysis.episodes).toEqual([]);
  });

  it('rekent de handmatige stroom niet als vermijdbaar', async () => {
    const analysis = await run(specs);

    // Het oude systeem gaf die stroom wel uit — dat blijft staan.
    expect(analysis.legacyGridWh).toBeGreaterThan(0);
    // Maar de arbiter zou er niets aan gedaan hebben, dus valt er niets te
    // vermijden. Anders zou het rapport een besparing claimen op een keuze van
    // de bewoner.
    expect(analysis.avoidableGridWh).toBe(0);
  });

  it('pakt de draad weer op zodra de bewoner de stand loslaat', async () => {
    const analysis = await run([
      ...specs,
      {
        min: 21,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: 700,
        reclaimableW: 700,
        changed: true,
        legacy: 'PV-koelen: Gepauzeerd (Import)',
        commands: [{ kind: 'setAction', actuatorId: 'ac-zolder', action: 'off' }],
      },
      ...Array.from({ length: 10 }, (_, i) => ({
        min: 22 + i,
        obs: { 'ac-zolder': 'cool@21' },
        gridW: 700,
        reclaimableW: 700,
      })),
    ]);

    const zolder = analysis.tallies.find((t) => t.actuatorId === 'ac-zolder');
    expect(zolder?.stricter).toBeGreaterThan(0);
    expect(analysis.episodes).toHaveLength(1);
    expect(analysis.episodes[0]?.direction).toBe('strenger');
  });
});
