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
    expect(exampleSite.id).toBe('voorbeeld-huis');
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
    // Drie fouten van verschillende soort: een ontbrekend levensader-veld, een
    // veld met de verkeerde soort waarde, en een verwijzing die nergens heen
    // gaat. Ze horen alle drie in één keer op tafel te komen.
    delete c['timezone'];
    (c['power'] as Record<string, unknown>)['startSurplusW'] = 'veel';
    (c['zones'] as Record<string, unknown>[])[0]!['temperature'] = 42;
    const result = parse(c);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = result.problems.map((p) => p.path);
    expect(paths).toContain('timezone');
    expect(paths).toContain('power.startSurplusW');
    expect(paths).toContain('zones[0].temperature');
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
  const without = (...keys: string[]): Record<string, unknown> => {
    const c = baseConfig();
    for (const k of keys) delete c[k];
    return c;
  };

  it('neemt een configuratie zonder mode en timers aan', () => {
    const result = parse(without('mode', 'timers'));
    expect(result.ok).toBe(true);
  });

  it('zegt erbij wat er dan intern gebeurt', () => {
    const result = parse(without('mode', 'timers'));
    if (!result.ok) throw new Error(messages(result));
    const reported = result.warnings.map((w) => `${w.path}: ${w.message}`);
    expect(reported.join('\n')).toContain('intern bijgehouden');
    // En niet alleen voor één van de twee.
    expect(reported.filter((m) => m.includes('intern bijgehouden'))).toHaveLength(2);
  });

  it('laat de velden dan ook echt weg in plaats van iets te verzinnen', () => {
    const result = parse(without('mode', 'timers'));
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
    expect(result.config.timers?.stabilisation?.id).toBe('timer.stabilisatie');
    expect(result.config.timers?.manualOverride).toBeUndefined();
  });

  it('leest recordOnly als lijst met entiteiten (besluit 65)', () => {
    const c = baseConfig();
    c['recordOnly'] = ['sensor.gas', { adapter: 'homeassistant', id: 'sensor.ventilatie' }];
    const result = parse(c);
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.recordOnly?.map((r) => r.id)).toEqual(['sensor.gas', 'sensor.ventilatie']);

    const wrong = baseConfig();
    wrong['recordOnly'] = 'sensor.gas';
    expect(parse(wrong).ok).toBe(false);
  });

  it('vindt een timerblok zonder stabilisatietimer goed', () => {
    // Per timer optioneel (besluit 60): wat ontbreekt, houdt de dienst zelf bij.
    const c = baseConfig();
    c['timers'] = { manualOverride: 'timer.handmatig' };
    const result = parse(c);
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.timers?.stabilisation).toBeUndefined();
    expect(result.config.timers?.manualOverride?.id).toBe('timer.handmatig');
  });

  it('blijft klagen wanneer mode er wél staat maar onzin is', () => {
    const c = baseConfig();
    c['mode'] = 'input_select.modus';
    expect(messages(parse(c))).toContain('mode: moet een object zijn');
  });
});

describe('het kleinst mogelijke bestand', () => {
  /*
   * De maat voor stap 2 van fase 6e.
   *
   * Daarvoor moest een nieuwe gebruiker 158 waarden aanleveren met 34
   * entity-ID's, waarvan de meeste keuzes waren waar hij nog geen mening over
   * had — schakelbanden, thermische massa, draaitijden, een setpoint per modus
   * per zone. Dat is geen configuratie maar een examen.
   *
   * Wat er overblijft: een tijdzone, één zone, één apparaat. De rest heeft een
   * terugval, en waar raden gevaarlijk zou zijn blijft het verplicht.
   */
  const minimal = (): Record<string, unknown> => ({
    timezone: 'Europe/Amsterdam',
    actuators: [
      {
        id: 'ketel',
        ref: 'climate.ketel',
        // Wat een apparaat kán is het enige dat niet te raden valt: aannemen
        // dat iets kan verwarmen terwijl het alleen koelt, is de verkeerde
        // kant van fout.
        capabilities: { canHeat: true, canCool: false },
      },
    ],
    zones: [{ id: 'woonkamer', temperature: 'sensor.woonkamer', actuatorIds: ['ketel'] }],
  });

  it('wordt aangenomen', () => {
    const result = parse(minimal());
    if (!result.ok) throw new Error(messages(result));
    expect(result.ok).toBe(true);
  });

  it('vult in wat niet gevraagd is', () => {
    const result = parse(minimal());
    if (!result.ok) throw new Error(messages(result));
    const c = result.config;

    expect(c.id).toBe('installatie');
    // De standaard voor een nieuw huis (besluit 204): de dag vanaf 7 uur.
    expect(c.schedule).toEqual({
      preheatFromHour: 6,
      dayFromHour: 7,
      nightFromHour: 22,
      eveningExtensionLights: [],
    });

    const a = c.actuators[0]!;
    expect(a.name).toBe('ketel');
    expect(a.role).toBe('primary');
    expect(a.power.estimatedW).toBe(0);
    expect(a.timing).toEqual({ minRunMinutes: 10, minRestMinutes: 5, settleMinutes: 2 });
    expect(a.capabilities.setpointRange).toEqual([5, 35]);

    const z = c.zones[0]!;
    expect(z.name).toBe('woonkamer');
    expect(z.priority).toBe(1);
    expect(z.thermalMass).toBe('medium');
    expect(z.hysteresis).toEqual({ onDelta: 0.3, offDelta: 0.2 });
    expect(z.buffering).toEqual({ enabled: false, bandC: 0 });
  });

  it('regelt alleen verwarmen wanneer niemand om koelen heeft gevraagd', () => {
    // Een koeldrempel verzinnen zou een airco kunnen laten draaien op een getal
    // dat wij hebben bedacht.
    const result = parse(minimal());
    if (!result.ok) throw new Error(messages(result));
    const sp = result.config.zones[0]!.setpoints;
    // De standaard voor een nieuw huis (besluit 204): zuinig.
    expect(sp.dag).toEqual({ heat: 20 });
    expect(sp.nacht).toEqual({ heat: 16 });
    expect(sp.voorverwarmen).toEqual({ heat: 19 });
    expect(sp.afwezig).toEqual({ heat: 15 });
    expect(sp.vakantie).toEqual({ heat: 12 });
    expect(sp.handmatig).toEqual({});
    for (const mode of Object.values(sp)) {
      expect(mode.cool).toBeUndefined();
    }
  });

  it('vult een half ingevulde setpointtabel aan in plaats van hem af te keuren', () => {
    const c = minimal();
    (c['zones'] as Record<string, unknown>[])[0]!['setpoints'] = { dag: { heat: 21 } };
    const result = parse(c);
    if (!result.ok) throw new Error(messages(result));
    const sp = result.config.zones[0]!.setpoints;
    expect(sp.dag).toEqual({ heat: 21 });
    expect(sp.nacht).toEqual({ heat: 16 });
  });

  it('zet pv-surplus uit in plaats van hem stil niets te laten doen', () => {
    const result = parse(minimal());
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.enabledStrategies).not.toContain('pv-surplus');
    expect(result.config.enabledStrategies).toContain('comfort');
    expect(result.warnings.map((w) => w.message).join('\n')).toContain('valt pv-surplus weg');
  });

  it('houdt pv-surplus wél aan zodra er een netmeting is', () => {
    const c = minimal();
    c['power'] = { gridPower: 'sensor.p1' };
    const result = parse(c);
    if (!result.ok) throw new Error(messages(result));
    expect(result.config.enabledStrategies).toContain('pv-surplus');
    // En de drempels zijn ingevuld, zonder dat erom gevraagd is.
    expect(result.config.power.startSurplusW).toBe(1000);
    expect(result.config.power.stopImportW).toBe(50);
  });
});

describe('wat verplicht blijft', () => {
  const minimal = (): Record<string, unknown> => ({
    timezone: 'Europe/Amsterdam',
    actuators: [
      { id: 'ketel', ref: 'climate.ketel', capabilities: { canHeat: true, canCool: false } },
    ],
    zones: [{ id: 'woonkamer', temperature: 'sensor.woonkamer', actuatorIds: ['ketel'] }],
  });

  it('een tijdzone, want anders schuift de hele dagindeling ongemerkt', () => {
    const c = minimal();
    delete c['timezone'];
    expect(messages(parse(c))).toContain('timezone');
  });

  it('een huis zonder slimme regeling mag: geen zones en geen apparaten (besluit 194)', () => {
    const c = minimal();
    c['zones'] = [];
    c['actuators'] = [];
    const r = parse(c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.zones).toEqual([]);
    delete c['zones'];
    delete c['actuators'];
    expect(parse(c).ok).toBe(true);
  });

  it('een zone zonder zijn apparaten niet, want dan valt er niets mee te regelen', () => {
    const c = minimal();
    c['actuators'] = [];
    expect(parse(c).ok).toBe(false);
  });

  it('wat een apparaat kan, want dat raden is de gevaarlijke kant', () => {
    const c = minimal();
    delete (c['actuators'] as Record<string, unknown>[])[0]!['capabilities'];
    expect(messages(parse(c))).toContain('capabilities');
  });

  it('een thermometer per zone', () => {
    const c = minimal();
    delete (c['zones'] as Record<string, unknown>[])[0]!['temperature'];
    expect(messages(parse(c))).toContain('zones[0].temperature');
  });

  it('het vermogen van een assist-apparaat', () => {
    // Comfort vraagt budgetW 0 en merkt er niets van. Maar pv-surplus verdeelt
    // overschot, en een apparaat dat nul watt claimt past altijd — hoe weinig
    // er ook over is. Daar is raden niet ongevaarlijk maar juist het probleem.
    const c = minimal();
    (c['actuators'] as Record<string, unknown>[])[0]!['role'] = 'assist';
    expect(messages(parse(c))).toContain('estimatedW');
  });

  it('en klaagt nog steeds over een veld dat er wél staat maar niet deugt', () => {
    const c = minimal();
    (c['zones'] as Record<string, unknown>[])[0]!['thermalMass'] = 'zwaar';
    expect(messages(parse(c))).toContain('thermalMass');
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

  it('neemt een comfortplafond over, en laat het weg als het ontbreekt', () => {
    // Geen standaardwaarde: koelen op netstroom is een keuze (besluit 50).
    const without = parse(baseConfig());
    expect(without.ok && without.config.zones[0]!.comfortMaxC).toBe(undefined);

    const c = baseConfig();
    (c['zones'] as Record<string, unknown>[])[0]!['comfortMaxC'] = 26;
    const withCeiling = parse(c);
    expect(withCeiling.ok && withCeiling.config.zones[0]!.comfortMaxC).toBe(26);
  });

  it('waarschuwt bij een comfortplafond onder het koeldoel', () => {
    // Dan is de dure regel strenger dan de zuinige, en koelt hij altijd op
    // netstroom. Werkt wel, kost alleen geld — dus waarschuwing, geen fout.
    const c = baseConfig();
    // Een koeldoel vraagt een apparaat dat kan koelen; de ketel alleen kan dat
    // niet, en dan keurt de samenhangscontrole het terecht af.
    (c['actuators'] as Record<string, unknown>[]).push({
      id: 'airco',
      name: 'Airco',
      ref: 'climate.airco',
      role: 'assist',
      capabilities: { canHeat: true, canCool: true, setpointRange: [16, 30] },
      power: { estimatedW: 900 },
      timing: { minRunMinutes: 15, minRestMinutes: 5, settleMinutes: 3 },
    });
    const zone = (c['zones'] as Record<string, unknown>[])[0]!;
    zone['actuatorIds'] = ['ketel', 'airco'];
    (zone['setpoints'] as Record<string, unknown>)['dag'] = { heat: 20, cool: 24 };
    zone['comfortMaxC'] = 23;
    const result = parse(c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((w) => w.message).join()).toContain('niet boven het koeldoel');
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

describe('de volgorde op zon (besluit 176)', () => {
  const droger = { id: 'droger', name: 'Droger', remoteStart: 'binary_sensor.droger_start', estimatedW: 600 };

  it('kent zones en uitstelbare apparaten door elkaar, en is optioneel', () => {
    const r = parse({ ...baseConfig(), deferrables: [droger], sunOrder: [{ kind: 'deferrable', id: 'droger' }, { kind: 'zone', id: 'woonkamer' }] });
    expect(messages(r)).toBe('');
    expect(r.ok && r.config.sunOrder).toEqual([{ kind: 'deferrable', id: 'droger' }, { kind: 'zone', id: 'woonkamer' }]);
    const zonder = parse(baseConfig());
    expect(zonder.ok && zonder.config.sunOrder).toBeUndefined();
  });

  it('weigert wat niet bestaat of er twee keer staat', () => {
    expect(messages(parse({ ...baseConfig(), sunOrder: [{ kind: 'deferrable', id: 'droger' }] }))).toContain('apparaat "droger" bestaat niet');
    expect(messages(parse({ ...baseConfig(), sunOrder: [{ kind: 'zone', id: 'woonkamer' }, { kind: 'zone', id: 'woonkamer' }] }))).toContain('staat er twee keer');
    expect(messages(parse({ ...baseConfig(), sunOrder: [{ kind: 'lamp', id: 'x' }] }))).toContain('kind');
  });
});

describe('warmtebuffers: de boiler en de jacuzzi (besluit 186)', () => {
  const jacuzzi = { id: 'jacuzzi', name: 'Jacuzzi', kind: 'jacuzzi', control: 'setpoint', actuator: 'climate.spa', temperature: { id: 'climate.spa', attribute: 'current_temperature' } };

  it('vult per soort aan wat er niet staat, en mag in de volgorde op zon', () => {
    const r = parse({ ...baseConfig(), heatStores: [jacuzzi], sunOrder: [{ kind: 'heatStore', id: 'jacuzzi' }] });
    expect(messages(r)).toBe('');
    expect(r.ok && r.config.heatStores?.[0]).toMatchObject({ estimatedW: 2200, minC: 30, sunC: 38, heatRateCPerHour: 1.5 });
    expect(r.ok && r.config.sunOrder).toEqual([{ kind: 'heatStore', id: 'jacuzzi' }]);
    const boiler = parse({ ...baseConfig(), heatStores: [{ id: 'boiler', name: 'Boiler', kind: 'boiler', control: 'switch', actuator: 'switch.boiler', legionellaC: 60 }] });
    expect(boiler.ok && boiler.config.heatStores?.[0]).toMatchObject({ minC: 50, sunC: 65, legionellaC: 60 });
    expect(parse(baseConfig()).ok && (parse(baseConfig()) as Extract<ConfigResult, { ok: true }>).config.heatStores).toBeUndefined();
  });

  it('weigert wat niet kan', () => {
    expect(messages(parse({ ...baseConfig(), heatStores: [{ ...jacuzzi, sunC: 42 }] }))).toContain('niet boven 40°');
    expect(messages(parse({ ...baseConfig(), heatStores: [{ ...jacuzzi, minC: 36, sunC: 34 }] }))).toContain('ondergrens');
    expect(messages(parse({ ...baseConfig(), heatStores: [{ ...jacuzzi, legionellaC: 60 }] }))).toContain('alleen bij een boiler');
    const { temperature: _t, ...zonder } = jacuzzi;
    expect(messages(parse({ ...baseConfig(), heatStores: [zonder] }))).toContain('zonder meting');
    expect(messages(parse({ ...baseConfig(), heatStores: [{ ...jacuzzi, kind: 'zwembad' }] }))).toContain('kind');
    expect(messages(parse({ ...baseConfig(), sunOrder: [{ kind: 'heatStore', id: 'jacuzzi' }] }))).toContain('buffer "jacuzzi" bestaat niet');
  });
});
