/**
 * Tests op de configuratielaag.
 *
 * De nadruk ligt op de foutmeldingen. Een validator die "invalid input"
 * teruggeeft is even nutteloos als geen validator: het gaat erom dat iemand
 * die zijn eigen huis instelt kan zien wát er mis is en waar.
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { ConfigError, resolveConfigPath } from '../src/config/load.js';

import { scheduledMode } from '../src/core/context.js';
import { parseSiteConfig, SCHEMA_VERSION } from '../src/config/schema.js';
import type { ConfigResult } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { exampleSite, exampleWarnings } from './site.js';

const STRATEGIES = defaultStrategies().ids;

/** Een minimale, geldige configuratie om varianten op te maken. */
function baseConfig(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'testhuis',
    timezone: 'Europe/Amsterdam',
    defaultAdapter: 'homeassistant',
    power: {
      gridPower: 'sensor.p1',
      startSurplusW: 1000,
      stopImportW: 50,
      resumeSurplusW: 600,
      stabilisationMinutes: 5,
    },
    schedule: {
      preheatFromHour: 6,
      dayFromHour: 8,
      nightFromHour: 22,
      eveningExtensionLights: [],
    },
    occupancy: [{ id: 'iemand', ref: 'person.iemand' }],
    mode: {
      select: 'input_select.modus',
      automatic: 'automatisch',
      aliases: { dag: 'dag', nacht: 'nacht', handmatig: 'handmatig' },
    },
    timers: {
      stabilisation: 'timer.stabilisatie',
      manualOverride: 'timer.handmatig',
    },
    sun: 'sun.sun',
    outdoorTemperature: 'sensor.buiten',
    actuators: [
      {
        id: 'ketel',
        name: 'Ketel',
        ref: 'climate.ketel',
        role: 'primary',
        capabilities: { canHeat: true, canCool: false, setpointRange: [12, 24] },
        power: { estimatedW: 0 },
        timing: { minRunMinutes: 10, minRestMinutes: 5, settleMinutes: 2 },
      },
    ],
    zones: [
      {
        id: 'woonkamer',
        name: 'Woonkamer',
        temperature: 'sensor.woonkamer',
        actuatorIds: ['ketel'],
        priority: 1,
        thermalMass: 'high',
        hysteresis: { onDelta: 0.3, offDelta: 0.2 },
        buffering: { enabled: false, bandC: 0 },
        setpoints: {
          dag: { heat: 20 },
          nacht: {},
          voorverwarmen: { heat: 19 },
          afwezig: { heat: 16 },
          vakantie: { heat: 12 },
          handmatig: {},
        },
      },
    ],
    enabledStrategies: ['comfort'],
    criticalInputs: ['sensor.p1'],
  };
}

const parse = (c: unknown): ConfigResult =>
  parseSiteConfig(c, { knownStrategies: STRATEGIES });

/** Alle foutteksten samen, om op inhoud te kunnen toetsen. */
function messages(result: ConfigResult): string {
  return result.ok ? '' : result.problems.map((p) => `${p.path}: ${p.message}`).join('\n');
}

describe('geleverde configuratie', () => {
  it('is geldig en drukt deze woning volledig uit', () => {
    expect(exampleSite.id).toBe('huis-cornelissen');
    expect(exampleSite.zones).toHaveLength(3);
    expect(exampleSite.actuators).toHaveLength(4);
    expect(exampleSite.enabledStrategies).toContain('pv-surplus');
  });

  it('waarschuwt alleen over dingen die we bewust zo hebben gedaan', () => {
    // De zolder heeft met opzet alleen een airco; comfort regelt hem niet.
    expect(exampleWarnings.join('\n')).toContain('zolder');
    expect(exampleWarnings).toHaveLength(1);
  });
});

describe('vorm', () => {
  it('neemt de basisconfiguratie aan', () => {
    const result = parse(baseConfig());
    expect(result.ok).toBe(true);
  });

  it('eist een schemaversie die deze code kent', () => {
    const result = parse({ ...baseConfig(), schemaVersion: 99 });
    expect(messages(result)).toContain('schemaVersion');
    expect(messages(result)).toContain('99');
  });

  it('meldt alle problemen tegelijk, niet alleen het eerste', () => {
    const c = baseConfig();
    delete c['id'];
    delete c['timezone'];
    (c['power'] as Record<string, unknown>)['startSurplusW'] = 'veel';
    const result = parse(c);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.problems.map((p) => p.path);
    expect(paths).toContain('id');
    expect(paths).toContain('timezone');
    expect(paths).toContain('power.startSurplusW');
  });

  it('wijst een onbekende modus in setpoints af en noemt de geldige', () => {
    const c = baseConfig();
    const zone = (c['zones'] as Record<string, unknown>[])[0]!;
    (zone['setpoints'] as Record<string, unknown>)['zomer'] = { cool: 22 };
    const text = messages(parse(c));
    expect(text).toContain('"zomer" is geen bekende modus');
    expect(text).toContain('voorverwarmen');
  });

  it('accepteert een verwijzing als tekst en als object', () => {
    const c = baseConfig();
    (c['actuators'] as Record<string, unknown>[])[0]!['ref'] = {
      adapter: 'modbus',
      id: '40001',
    };
    const result = parse(c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.actuators[0]?.ref).toEqual({ adapter: 'modbus', id: '40001' });
    // De korte vorm erft de standaardadapter.
    expect(result.config.zones[0]?.temperature).toEqual({
      adapter: 'homeassistant',
      id: 'sensor.woonkamer',
    });
  });
});

describe('een installatie zonder helpers in Home Assistant', () => {
  /*
   * De reden dat deze tests bestaan.
   *
   * Tot fase 6e eiste het schema een `input_select` voor de modus en twee
   * `timer.`-entiteiten. Die bestaan alleen omdat de oude YAML van dit huis ze
   * had aangemaakt. Bij iemand anders staan ze er niet, en ze aanmaken zou
   * schrijven naar Home Assistant zijn (besluit 15) — dus weigerde de dienst
   * te starten bij precies de installatie waarvoor hij bedoeld is.
   */
  const zonder = (...sleutels: string[]): Record<string, unknown> => {
    const c = baseConfig();
    for (const k of sleutels) delete c[k];
    return c;
  };

  it('neemt een configuratie zonder mode en timers aan', () => {
    const result = parse(zonder('mode', 'timers'));
    expect(result.ok).toBe(true);
  });

  it('zegt erbij wat er dan intern gebeurt', () => {
    const result = parse(zonder('mode', 'timers'));
    if (!result.ok) throw new Error(messages(result));
    const meldingen = result.warnings.map((w) => `${w.path}: ${w.message}`);
    expect(meldingen.join('\n')).toContain('intern bijgehouden');
    // En niet alleen voor één van de twee.
    expect(meldingen.filter((m) => m.includes('intern bijgehouden'))).toHaveLength(2);
  });

  it('laat de velden dan ook echt weg in plaats van iets te verzinnen', () => {
    const result = parse(zonder('mode', 'timers'));
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.mode).toBeUndefined();
    expect(result.config.timers).toBeUndefined();
  });

  it('vindt een timerblok zonder manualOverride goed', () => {
    // Niets in de kern leest die timer uit; hem eisen was een eis zonder doel.
    const c = baseConfig();
    c['timers'] = { stabilisation: 'timer.stabilisatie' };
    const result = parse(c);
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.timers?.stabilisation.id).toBe('timer.stabilisatie');
    expect(result.config.timers?.manualOverride).toBeUndefined();
  });

  it('blijft klagen wanneer mode er wél staat maar onzin is', () => {
    const c = baseConfig();
    c['mode'] = 'input_select.modus';
    expect(messages(parse(c))).toContain('mode: moet een object zijn');
  });
});

describe('samenhang', () => {
  it('vindt een zone die naar een onbekende actuator wijst, en denkt mee', () => {
    const c = baseConfig();
    (c['zones'] as Record<string, unknown>[])[0]!['actuatorIds'] = ['ketels'];
    const text = messages(parse(c));
    expect(text).toContain('"ketels", die niet bestaat');
    expect(text).toContain('Bedoelde je "ketel"?');
  });

  it('staat niet toe dat twee zones hetzelfde apparaat opeisen', () => {
    const c = baseConfig();
    const zones = c['zones'] as Record<string, unknown>[];
    zones.push({ ...zones[0]!, id: 'keuken', name: 'Keuken', priority: 2 });
    expect(messages(parse(c))).toContain('hoort al bij zone');
  });

  it('herkent dubbele id\'s', () => {
    const c = baseConfig();
    const actuators = c['actuators'] as Record<string, unknown>[];
    actuators.push({ ...actuators[0]! });
    expect(messages(parse(c))).toContain('komt meer dan één keer voor');
  });

  it('wijst een strategie af die deze build niet kent', () => {
    const c = baseConfig();
    c['enabledStrategies'] = ['comfort', 'quantum-koeling'];
    const text = messages(parse(c));
    expect(text).toContain('"quantum-koeling" bestaat niet');
    expect(text).toContain('pv-surplus');
  });

  it('laat een doel toe dat maar één apparaat in de zone kan halen', () => {
    // De ketel zakt tot 12, een airco pas tot 16. Vakantie op 12 is dan prima:
    // de airco krijgt in die stand geen opdracht.
    const c = baseConfig();
    (c['actuators'] as Record<string, unknown>[]).push({
      id: 'airco',
      name: 'Airco',
      ref: 'climate.airco',
      role: 'assist',
      capabilities: { canHeat: true, canCool: true, setpointRange: [16, 30] },
      power: { estimatedW: 800 },
      timing: { minRunMinutes: 15, minRestMinutes: 5, settleMinutes: 3 },
    });
    (c['zones'] as Record<string, unknown>[])[0]!['actuatorIds'] = ['ketel', 'airco'];
    expect(parse(c).ok).toBe(true);
  });

  it('wijst een doel af dat geen enkel apparaat kan halen', () => {
    const c = baseConfig();
    const zone = (c['zones'] as Record<string, unknown>[])[0]!;
    (zone['setpoints'] as Record<string, Record<string, number>>)['dag'] = { heat: 30 };
    const text = messages(parse(c));
    expect(text).toContain('30 °C is voor geen enkel apparaat');
    expect(text).toContain('12-24');
  });
});

describe('grenswaarden met een reden', () => {
  it('weigert een hysteresisband van nul', () => {
    const c = baseConfig();
    (c['zones'] as Record<string, unknown>[])[0]!['hysteresis'] = {
      onDelta: 0,
      offDelta: 0,
    };
    expect(messages(parse(c))).toContain('klapperen');
  });

  it('weigert hervatten boven de startdrempel', () => {
    const c = baseConfig();
    (c['power'] as Record<string, unknown>)['resumeSurplusW'] = 2000;
    expect(messages(parse(c))).toContain('tegenstrijdig');
  });

  it('weigert uren die niet oplopen', () => {
    const c = baseConfig();
    (c['schedule'] as Record<string, unknown>)['nightFromHour'] = 5;
    expect(messages(parse(c))).toContain('moeten oplopen');
  });

  it('weigert verwarmen boven koelen in dezelfde modus', () => {
    const c = baseConfig();
    const zone = (c['zones'] as Record<string, unknown>[])[0]!;
    (zone['setpoints'] as Record<string, unknown>)['dag'] = { heat: 24, cool: 20 };
    expect(messages(parse(c))).toContain('laat geen ruimte');
  });

  it('waarschuwt bij buffering aan met een band van nul', () => {
    const c = baseConfig();
    (c['zones'] as Record<string, unknown>[])[0]!['buffering'] = {
      enabled: true,
      bandC: 0,
    };
    const result = parse(c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((w) => w.message).join()).toContain('niets voorgeladen');
  });
});

describe('tijdzone', () => {
  /**
   * Hetzelfde moment, twee installaties in verschillende tijdzones.
   *
   * Dit is de fout die een container stilzwijgend zou introduceren: Node draait
   * daar in UTC, en dan begint voorverwarmen twee uur te laat zonder dat er
   * iets misgaat waar je het aan ziet.
   */
  function modeAt(timezone: string, iso: string) {
    const base = baseConfig();
    base['timezone'] = timezone;
    const result = parse(base);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('config ongeldig');

    const nowMs = Date.parse(iso);
    return scheduledMode(
      result.config,
      { nowMs, lights: {} } as never,
      true,
    );
  }

  it('leest het uur in de tijdzone van de installatie, niet die van het proces', () => {
    // In juli is Amsterdam UTC+2 en Londen UTC+1. Op hetzelfde moment is het
    // dus 06:30 hier en 05:30 daar — precies over de grens van voorverwarmen,
    // dat om 6 uur begint.
    expect(modeAt('Europe/Amsterdam', '2026-07-15T04:30:00Z')).toBe('voorverwarmen');
    expect(modeAt('Europe/London', '2026-07-15T04:30:00Z')).toBe('nacht');
    // En in UTC, waar een container standaard in draait, is het 04:30: nacht.
    // Dit is de fout die de containerstap stilzwijgend zou introduceren.
    expect(modeAt('UTC', '2026-07-15T04:30:00Z')).toBe('nacht');
  });

  it('wijst een onbekende tijdzone af bij het inlezen', () => {
    const c = baseConfig();
    c['timezone'] = 'Mars/Olympus_Mons';
    expect(messages(parse(c))).toContain('geen bekende tijdzone');
  });
});

describe('vindbaarheid van de configuratie', () => {
  it('wijst de weg wanneer het bestand een niveau te diep staat', async () => {
    // De vergissing die de containeruitrol opleverde: een mount die de map
    // hernoemde, waardoor config/sites in config/sites/sites belandde. De
    // melding "geen bestanden gevonden" was waar en volstrekt nutteloos.
    const root = await mkdtemp(join(tmpdir(), 'hems-config-'));
    await mkdir(join(root, 'config', 'sites', 'sites'), { recursive: true });
    await writeFile(
      join(root, 'config', 'sites', 'sites', 'huis.json'),
      '{"schemaVersion":1}',
      'utf-8',
    );

    await expect(resolveConfigPath({ root })).rejects.toMatchObject({
      name: 'ConfigError',
    });

    const error = await resolveConfigPath({ root }).catch((e: ConfigError) => e);
    const text = (error as ConfigError).format();
    expect(text).toContain('sites/');
    expect(text).toContain('een niveau te diep');
  });
});
