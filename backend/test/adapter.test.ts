/**
 * Tests tegen een nagebootste Home Assistant.
 *
 * De server hieronder spreekt het echte websocketprotocol — auth_required,
 * auth_ok, get_states, subscribe_events, state_changed — zodat de client niet
 * tegen een versimpelde versie van de werkelijkheid wordt getoetst.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';

import { HaClient, websocketUrl, type HaEntityState } from '../src/adapters/homeassistant/client.js';
import { EntityStore } from '../src/adapters/homeassistant/store.js';
import {
  buildSystemState,
  relevantEntities,
} from '../src/adapters/homeassistant/mapping.js';
import {
  ShadowRunner,
  type LiveSnapshot,
} from '../src/adapters/homeassistant/shadow.js';
import { exampleSite } from './site.js';
import { decide } from '../src/core/decide.js';
import type { SiteConfig } from '../src/core/model.js';
import { defaultStrategies } from '../src/index.js';

const TOKEN = 'geheim-token';

/** Vaste klok voor de schaduwtest: een woensdagmiddag in juli. */
const SHADOW_NOW = new Date(2026, 6, 15, 13, 0, 0).getTime();

function entity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  atMs: number = Date.now(),
): HaEntityState {
  const stamp = new Date(atMs).toISOString();
  return { entity_id, state, attributes, last_changed: stamp, last_updated: stamp };
}

/** Zelfde entiteit, maar gestempeld ruim voor de vaste klok van de schaduwtest. */
function shadowEntity(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HaEntityState {
  return entity(entity_id, state, attributes, SHADOW_NOW - 3_600_000);
}

interface FakeHa {
  readonly port: number;
  readonly close: () => Promise<void>;
  /** Duwt een state_changed naar alle geabonneerde clients. */
  readonly push: (state: HaEntityState) => void;
  /** Alles wat de client stuurde, voor controle op ongewenste schrijfacties. */
  readonly received: Record<string, unknown>[];
}

async function startFakeHa(options: {
  states?: HaEntityState[];
  rejectAuth?: boolean;
}): Promise<FakeHa> {
  const received: Record<string, unknown>[] = [];
  const sockets = new Set<WsSocket>();
  const subscriptions = new Map<WsSocket, number>();

  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', resolve));

  wss.on('connection', (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.9.0' }));

    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      received.push(msg);

      if (msg['type'] === 'auth') {
        if (options.rejectAuth || msg['access_token'] !== TOKEN) {
          socket.send(JSON.stringify({ type: 'auth_invalid', message: 'nope' }));
        } else {
          socket.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.9.0' }));
        }
        return;
      }
      if (msg['type'] === 'get_states') {
        socket.send(
          JSON.stringify({
            id: msg['id'],
            type: 'result',
            success: true,
            result: options.states ?? [],
          }),
        );
        return;
      }
      if (msg['type'] === 'subscribe_events') {
        subscriptions.set(socket, msg['id'] as number);
        socket.send(
          JSON.stringify({ id: msg['id'], type: 'result', success: true, result: null }),
        );
        return;
      }
      socket.send(
        JSON.stringify({ id: msg['id'], type: 'result', success: true, result: null }),
      );
    });

    socket.on('close', () => {
      sockets.delete(socket);
      subscriptions.delete(socket);
    });
  });

  const address = wss.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    received,
    push(state) {
      for (const [socket, id] of subscriptions) {
        socket.send(
          JSON.stringify({
            id,
            type: 'event',
            event: {
              event_type: 'state_changed',
              data: { entity_id: state.entity_id, new_state: state, old_state: null },
            },
          }),
        );
      }
    },
    async close() {
      for (const socket of sockets) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0)) await fn();
});

describe('websocketUrl', () => {
  it('maakt van een http-basis het juiste eindpunt', () => {
    expect(websocketUrl('http://homeassistant.local:8123')).toBe(
      'ws://homeassistant.local:8123/api/websocket',
    );
  });

  it('houdt tls in stand en gooit query en fragment weg', () => {
    expect(websocketUrl('https://huis.example.com/?x=1#top')).toBe(
      'wss://huis.example.com/api/websocket',
    );
  });

  it('plakt het pad niet twee keer aan als iemand het eindpunt invult', () => {
    expect(websocketUrl('ws://192.168.67.52:8123/api/websocket')).toBe(
      'ws://192.168.67.52:8123/api/websocket',
    );
    expect(websocketUrl('http://192.168.67.52:8123/api/websocket/')).toBe(
      'ws://192.168.67.52:8123/api/websocket',
    );
  });

  it('werkt met een HA achter een subpad', () => {
    expect(websocketUrl('https://example.com/ha')).toBe(
      'wss://example.com/ha/api/websocket',
    );
  });
});

describe('HaClient', () => {
  it('authenticeert, haalt states op en levert events af', async () => {
    const ha = await startFakeHa({
      states: [entity('sensor.p1_meter_power', '-1200')],
    });
    cleanups.push(() => ha.close());

    const client = new HaClient({
      url: `http://127.0.0.1:${ha.port}`,
      token: TOKEN,
    });
    cleanups.push(() => client.close());

    const ready = new Promise<HaEntityState[]>((resolve) =>
      client.on('ready', resolve),
    );
    client.connect();
    const states = await ready;
    expect(states).toHaveLength(1);
    expect(states[0]?.entity_id).toBe('sensor.p1_meter_power');

    const changed = new Promise<HaEntityState>((resolve) =>
      client.on('stateChanged', resolve),
    );
    ha.push(entity('sensor.p1_meter_power', '-2400'));
    expect((await changed).state).toBe('-2400');
  });

  it('meldt een ongeldig token met een bruikbare uitleg', async () => {
    const ha = await startFakeHa({ rejectAuth: true });
    cleanups.push(() => ha.close());

    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: 'fout' });
    cleanups.push(() => client.close());

    const error = await new Promise<Error>((resolve) => {
      client.on('error', resolve);
      client.connect();
    });
    expect(error.message).toContain('token');
  });
});

describe('schrijfbeveiliging', () => {
  it('weigert callService zolang schrijven uit staat', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: TOKEN });
    expect(client.writesAllowed).toBe(false);
    await expect(
      client.callService('climate', 'turn_off', {}, { entity_id: 'climate.beneden' }),
    ).rejects.toThrow(/Schrijven staat uit/);
  });
});

describe('EntityStore', () => {
  it('laat de hvac_action-klok doorlopen zolang de waarde gelijk blijft', () => {
    const store = new EntityStore();
    const t0 = Date.parse('2026-01-10T08:00:00.000Z');

    store.apply({
      entity_id: 'climate.beneden',
      state: 'heat',
      attributes: { hvac_action: 'heating', temperature: 20 },
      last_changed: new Date(t0).toISOString(),
      last_updated: new Date(t0).toISOString(),
    });
    // Nieuwe meting, tien minuten later, zelfde hvac_action.
    store.apply({
      entity_id: 'climate.beneden',
      state: 'heat',
      attributes: { hvac_action: 'heating', temperature: 20.5 },
      last_changed: new Date(t0 + 600_000).toISOString(),
      last_updated: new Date(t0 + 600_000).toISOString(),
    });

    // De klok telt vanaf het begin van het stoken, niet vanaf de laatste meting.
    expect(store.hvacActionSince('climate.beneden')).toBe(t0);
    expect(store.hvacAction('climate.beneden')).toBe('heating');
  });

  it('behandelt unavailable als geen waarde', () => {
    const store = new EntityStore();
    store.apply(entity('sensor.p1_meter_power', 'unavailable'));
    expect(store.state('sensor.p1_meter_power')).toBeNull();
    expect(store.number('sensor.p1_meter_power')).toBeNull();
    expect(store.has('sensor.p1_meter_power')).toBe(true);
  });
});

function shadowStates(): HaEntityState[] {
  return [
      shadowEntity('sensor.p1_meter_power', '-2500'),
      shadowEntity('sensor.beneden_temperatuur', '24.5'),
      shadowEntity('sensor.badkamer_huidige_temperatuur', '21.0'),
      shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.0'),
      shadowEntity('climate.beneden', 'off', {
        current_temperature: 24.5,
        hvac_action: 'off',
      }),
      shadowEntity('climate.thermostaat_badkamer', 'off', { temperature: 18 }),
      shadowEntity('climate.air_conditioning_woonkamer', 'off', {}),
      shadowEntity('climate.air_conditioning_zolder', 'off', {}),
      shadowEntity('sensor.air_conditioning_woonkamer_energy_current', '0'),
      shadowEntity('sensor.air_conditioning_zolder_energy_current', '0'),
      shadowEntity('person.ricardo_cornelissen', 'home'),
      shadowEntity('sun.sun', 'above_horizon'),
      shadowEntity('input_select.verwarming_modus', 'automatisch'),
      shadowEntity('input_number.temp_airco_woonkamer_koelen', '22'),
    shadowEntity('input_number.temp_airco_zolder_koelen', '22.5'),
  ];
}

describe('ShadowRunner', () => {
  it('beslist op live data en stuurt niets naar Home Assistant', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const lines: string[] = [];
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600, // geen hartslag tijdens de test
      debounceMs: 10,
      minIntervalSeconds: 0,
      write: (line) => lines.push(line),
      // Vaste klok: anders bepaalt het uur waarop de test draait of het huis
      // in dag- of nachtmodus staat, en daarmee de uitkomst.
      now: () => SHADOW_NOW,
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Er is beslist, en het besluit is opgeschreven.
    expect(lines.some((l) => l.includes('verbonden'))).toBe(true);
    expect(lines.some((l) => l.includes('zou sturen') || l.includes('zou niets'))).toBe(
      true,
    );

    // Ruim overschot en een warme zolder: de arbiter wil koelen.
    expect(lines.some((l) => l.includes('→ cool'))).toBe(true);

    // En het belangrijkste: er is geen enkele dienst aangeroepen.
    expect(ha.received.some((m) => m['type'] === 'call_service')).toBe(false);
    expect(ha.received.map((m) => m['type'])).toEqual(
      expect.arrayContaining(['auth', 'get_states', 'subscribe_events']),
    );
  });
});

describe('zonder helpers in Home Assistant', () => {
  /*
   * De kern vraagt met een commando om een stabilisatietimer. Tot nu toe
   * beantwoordde het oude systeem die vraag: dat startte zijn eigen
   * `timer.pv_stabilisatie`, en de vertaling las die weer uit. Bij een verse
   * installatie bestaat die timer niet en bleef de vraag onbeantwoord — de
   * stabilisatie sloeg dan nooit aan, stil en zonder foutmelding.
   *
   * Deze twee tests zetten dezelfde woning twee keer neer, met en zonder
   * `timers` in de configuratie, en eisen dat het verschil precies dáár zit.
   */
  function zonderHelpers(config: SiteConfig): SiteConfig {
    const kopie: Record<string, unknown> = { ...config };
    delete kopie['mode'];
    delete kopie['timers'];
    return kopie as unknown as SiteConfig;
  }

  /**
   * Dezelfde woning, maar met een koele woonkamer.
   *
   * Sinds besluit 49 houdt de schaduw bij wat hij zelf geschakeld zou hebben.
   * Een apparaat dat hij in de eerste ronde aanzette geldt daarna als draaiend,
   * en de stabilisatie blokkeert alleen het *starten* van iets dat stilstaat.
   * Zou de woonkamer meteen willen koelen, dan startte hij in dezelfde ronde
   * als de zolder en bleef er niets over om tegen te houden.
   *
   * Dus: eerst alleen de zolder warm. De woonkamer komt in de tweede ronde, en
   * dát is het geval waar de stabilisatie voor bestaat — niet een tweede unit
   * opstarten zolang het vermogen van de eerste nog geen betrouwbare basis is.
   */
  function koeleWoonkamer(): HaEntityState[] {
    return shadowStates().map((s) =>
      s.entity_id === 'sensor.beneden_temperatuur'
        ? shadowEntity('sensor.beneden_temperatuur', '21.0')
        : s,
    );
  }

  async function draai(config: SiteConfig): Promise<string[]> {
    const ha = await startFakeHa({ states: koeleWoonkamer() });
    cleanups.push(() => ha.close());
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const lines: string[] = [];
    const runner = new ShadowRunner({
      config,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      write: (line) => lines.push(line),
      now: () => SHADOW_NOW,
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Een tweede evaluatie uitlokken, nu met een woonkamer die wél wil koelen.
    // De klok staat stil, dus de timer die bij het eerste besluit is gestart
    // loopt nu gegarandeerd nog.
    ha.push(shadowEntity('sensor.beneden_temperatuur', '24.5'));
    await new Promise((resolve) => setTimeout(resolve, 300));

    return lines;
  }

  it('houdt de stabilisatietimer zelf bij en blokkeert daarna zelf', async () => {
    const lines = await draai(zonderHelpers(exampleSite));

    // Ruim overschot en een warme zolder: het eerste besluit zet de zolder aan,
    // en vraagt daarbij om een stabilisatietimer.
    expect(lines.some((l) => l.includes('timer stabilisation start'))).toBe(true);
    // Bij de volgende evaluatie wil de woonkamer ook koelen, en die staat nog
    // stil — dus houdt de eigen timer hem tegen, zonder dat er ooit een
    // `timer.`-entiteit aan te pas kwam.
    expect(lines.some((l) => l.includes('stabilisation_active'))).toBe(true);
  });

  it('laat de opname die met het oude systeem vergelijkt ongemoeid', async () => {
    // Dezelfde woning, maar mét `timers` in de configuratie. De nep-HA kent
    // `timer.pv_stabilisatie` niet, dus die staat niet actief — en de eigen
    // boekhouding mag daar niet overheen gaan liggen. Deed hij dat wel, dan
    // zou de draaiende schaduwopname ineens andere besluiten nemen dan het
    // systeem waarmee hij wordt vergeleken.
    const lines = await draai(exampleSite);

    expect(lines.some((l) => l.includes('timer stabilisation start'))).toBe(true);
    expect(lines.some((l) => l.includes('stabilisation_active'))).toBe(false);
  });
});

describe('eventfilter', () => {
  /** Elke entity-ID die letterlijk in de broncode van de vertaling staat. */
  function literalsInMapping(): string[] {
    const source = readFileSync(
      new URL('../src/adapters/homeassistant/mapping.ts', import.meta.url),
      'utf-8',
    );
    return [
      ...new Set(
        [
          ...source.matchAll(
            /'((?:climate|sensor|binary_sensor|input_number|input_select|input_boolean|timer|person|light|sun)\.[a-z0-9_.]+)'/g,
          ),
        ].map((m) => m[1]!),
      ),
    ].sort();
  }

  it('bevat geen enkele entity-ID meer', () => {
    // Sinds fase 6b is dit de bewaking, en hij is scherper dan de oude.
    //
    // Die eiste dat een hardgecodeerd ID in de filter zat; deze eist dat er
    // geen hardgecodeerd ID meer ís. Zolang dat waar is kan de vertaling niet
    // afwijken van de configuratie, want er is niets om van af te wijken — en
    // is een tweede woning geen codewijziging maar een tweede JSON-bestand.
    expect(literalsInMapping()).toEqual([]);
  });

  it('volgt de configuratie in plaats van een eigen tabel', () => {
    // De sterkere garantie, sinds fase 6a. Wat de configuratie noemt hoort de
    // filter te kennen — óók wanneer die configuratie van een ander huis komt.
    // Dit is wat de vijf handgeschreven tabellen vervangt: die stonden identiek
    // aan de configuratie en niets bewaakte dat.
    const anders: SiteConfig = {
      ...exampleSite,
      power: {
        ...exampleSite.power,
        gridPower: { adapter: 'homeassistant', id: 'sensor.andere_meter' },
      },
      zones: exampleSite.zones.map((z) => ({
        ...z,
        temperature: { adapter: 'homeassistant', id: `sensor.${z.id}_anders` },
      })),
      occupancy: [{ id: 'gast', ref: { adapter: 'homeassistant', id: 'person.gast' } }],
      // Ook deze, anders blijft de oude slimme meter langs deze weg in de
      // filter staan en zegt de negatieve controle hieronder niets.
      criticalInputs: [{ adapter: 'homeassistant', id: 'sensor.andere_meter' }],
    };

    const known = relevantEntities(anders);
    expect(known.has('sensor.andere_meter')).toBe(true);
    expect(known.has('person.gast')).toBe(true);
    for (const z of anders.zones) expect(known.has(`sensor.${z.id}_anders`)).toBe(true);

    // En de entiteiten van dít huis komen er niet meer in voor. Dat is de kern
    // van 6a: zonder de handgeschreven tabellen sleept de vertaling geen
    // meetpunten van de één naar de ander mee.
    expect(known.has(exampleSite.power.gridPower!.id)).toBe(false);
    expect(known.has(exampleSite.occupancy[0]!.ref.id)).toBe(false);
    for (const z of exampleSite.zones) expect(known.has(z.temperature.id)).toBe(false);
  });

  it('negeert entiteiten die niets met klimaat te maken hebben', () => {
    const store = new EntityStore(relevantEntities(exampleSite));
    expect(store.apply(entity('sensor.p1_meter_power', '-1000'))).toBe(true);
    expect(store.apply(entity('sensor.telefoon_shira_batterij', '61'))).toBe(false);
    expect(store.apply(entity('light.slaapkamer', 'on'))).toBe(false);
    expect(store.has('sensor.telefoon_shira_batterij')).toBe(false);
    expect(store.size).toBe(1);
  });

  it('rekent niet opnieuw op ruis, wel op een klimaatwijziging', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      write: () => {},
      now: () => SHADOW_NOW,
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const baseline = runner.stats.evaluations;

    // Twintig irrelevante events: geen enkele herberekening.
    for (let i = 0; i < 20; i++) {
      ha.push(entity(`sensor.ruis_${i}`, String(i)));
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(runner.stats.evaluations).toBe(baseline);
    expect(runner.stats.ignoredEvents).toBe(20);

    // Een echte klimaatwijziging wel.
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '26.5'));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(runner.stats.evaluations).toBe(baseline + 1);
  });
});

describe('loghygiene', () => {
  it('schrijft een kort record zolang het besluit niet verandert', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-shadow-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      logDir: dir,
      write: () => {},
      now: () => SHADOW_NOW,
    });
    cleanups.push(() => runner.stop());

    /**
     * Wacht tot er zoveel evaluaties geweest zijn.
     *
     * Niet op een vaste tijd: deze test doet drie rondes, en onder een
     * volgelopen suite haalt de debounce van 10 ms plus het schrijven naar
     * schijf een vast venster van 150 ms niet altijd. Dan viel hij om zonder
     * dat er iets mis was.
     */
    async function tot(n: number): Promise<void> {
      const uiterlijk = Date.now() + 5_000;
      while (runner.stats.evaluations < n) {
        if (Date.now() > uiterlijk) {
          throw new Error(`bleef op ${runner.stats.evaluations} evaluaties staan`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    runner.start();
    await tot(1);
    /*
     * Drie evaluaties, want sinds besluit 49 komt de rust pas bij de derde.
     *
     * De eerste zet de airco's aan. De tweede geeft geen commando's meer: de
     * schaduw weet nu dat hij ze gestuurd heeft, dus staan ze goed. Dat is een
     * ánder besluit dan het eerste en levert dus een volledig record. Pas de
     * derde is gelijk aan de tweede, en dat is het korte record.
     *
     * Voorheen was de tweede al kort — maar om de verkeerde reden: het echte
     * apparaat bewoog nooit, dus gaf de arbiter elke ronde hetzelfde commando
     * opnieuw. Stilstand die op rust leek.
     */
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.1'));
    await tot(2);
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.2'));
    await tot(3);
    // Het derde record moet ook geschreven zijn, en dat gaat na de evaluatie.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const day = new Date(SHADOW_NOW).toISOString().slice(0, 10);
    const lines = (await readFile(join(dir, `decisions-${day}.ndjson`), 'utf-8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);

    expect(lines.length).toBeGreaterThanOrEqual(2);
    const full = lines.find((l) => l['changed'] === true);
    const compact = lines.find((l) => l['changed'] === false);

    expect(full).toBeDefined();
    expect(full).toHaveProperty('zones');
    expect(full).toHaveProperty('accepted');

    expect(compact).toBeDefined();
    expect(compact).not.toHaveProperty('accepted');
    expect(compact).not.toHaveProperty('zones');
    expect(compact).toHaveProperty('zonesT');

    // Het korte record hoort fors kleiner te zijn dan het volledige.
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(full).length / 2,
    );
  });
});

describe('snelheidsbegrenzer', () => {
  it('rekent niet op elke meterpuls, maar verliest de wijziging ook niet', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    // Klok die met de echte tijd meeloopt vanaf het vaste startpunt, zodat de
    // begrenzer meetbaar is zonder de test aan de wandklok te hangen.
    const t0 = Date.now();
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 5,
      minIntervalSeconds: 0.4,
      write: () => {},
      now: () => SHADOW_NOW + (Date.now() - t0),
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const baseline = runner.stats.evaluations;

    // Tien meterpulsen kort achter elkaar, zoals de P1 ze levert.
    for (let i = 0; i < 10; i++) {
      ha.push(shadowEntity('sensor.p1_meter_power', String(-1000 - i * 10)));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Binnen het venster is er hooguit één keer gerekend.
    expect(runner.stats.evaluations - baseline).toBeLessThanOrEqual(1);
    expect(runner.stats.throttledRequests).toBeGreaterThan(0);

    // Maar de laatste stand komt er alsnog doorheen zodra het venster opent.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runner.stats.evaluations).toBeGreaterThan(baseline);
  });
});

describe('bewaking tegen vastlopen', () => {
  it('slaat alarm wanneer er te lang geen besluit meer is genomen', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    const stalls: number[] = [];
    let clock = SHADOW_NOW;
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 5,
      minIntervalSeconds: 0,
      watchdogMinutes: 1,
      // De klok is geïnjecteerd, dus de bewaking kan op echte tijd snel kijken
      // terwijl de gemeten stilte in gesimuleerde tijd verstrijkt.
      watchdogCheckMs: 40,
      onStall: (idle) => stalls.push(idle),
      write: () => {},
      now: () => clock,
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(runner.stats.evaluations).toBeGreaterThan(0);
    expect(stalls).toEqual([]);

    // De klok springt twee minuten vooruit zonder dat er iets gebeurt.
    clock = SHADOW_NOW + 2 * 60_000;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stalls.length).toBeGreaterThan(0);
    expect(stalls[0]).toBeGreaterThan(1);
  });
});

describe('de modus uit twee knoppen', () => {
  /**
   * Een bron die alleen states kent. `buildSystemState` mag daar geen moeite
   * mee hebben: alles wat ontbreekt hoort `unavailable` te worden, niet te
   * knallen. Wat we hier toetsen is uitsluitend de modus-keuze.
   */
  const sourceOf = (states: Record<string, string>) => ({
    state: (id: string) => states[id] ?? null,
    number: () => null,
    bool: () => null,
    attr: () => null,
    attrNumber: () => null,
    changedAt: () => null,
    hvacAction: () => null,
    hvacActionSince: () => null,
  });

  const modeFor = (states: Record<string, string>) =>
    buildSystemState(exampleSite, sourceOf(states), SHADOW_NOW).modeOverride;

  it('laat de regeling met rust in automatisch zonder handmatige koelstand', () => {
    expect(
      modeFor({
        'input_select.verwarming_modus': 'automatisch',
        'input_select.koel_strategie': 'Pv koelen',
      }),
    ).toBeNull();
  });

  it('leest de handmatige koelstand van het dashboard als handmatig', () => {
    // Dit is het geval van 6 september 2026: de modus stond op automatisch en
    // de bewoner zette de zolderairco met de hand aan via de koelstrategie.
    expect(
      modeFor({
        'input_select.verwarming_modus': 'automatisch',
        'input_select.koel_strategie': 'Handmatig koelen',
      }),
    ).toBe('handmatig');
  });

  it('laat de handmatige koelstand voorgaan op de modus-keuze', () => {
    // Het oude systeem schermde óók zijn afbouwblok af met
    // `not handmatig_koelen_actief`, tot en met vakantie.
    expect(
      modeFor({
        'input_select.verwarming_modus': 'vakantie',
        'input_select.koel_strategie': 'Handmatig koelen',
      }),
    ).toBe('handmatig');
  });

  it('houdt de automatische koelstand buiten de handmatige stand', () => {
    // 'Automatisch koelen' is een andere regeling, geen overname door de
    // bewoner. Zie het openstaande punt in DECISIONS.md.
    expect(
      modeFor({
        'input_select.verwarming_modus': 'automatisch',
        'input_select.koel_strategie': 'Automatisch koelen',
      }),
    ).toBeNull();
  });

  it('vertaalt de handmatige stand van de modus-keuze onveranderd', () => {
    expect(
      modeFor({
        'input_select.verwarming_modus': 'handmatig',
        'input_select.koel_strategie': 'Pv koelen',
      }),
    ).toBe('handmatig');
  });
});

describe('de weergave krijgt het besluit', () => {
  it('geeft elk besluit door en houdt het laatste vast', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const gezien: LiveSnapshot[] = [];
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      // Zonder logDir: de weergave mag niet afhangen van of er gelogd wordt.
      write: () => {},
      now: () => SHADOW_NOW,
      onDecision: (snapshot) => gezien.push(snapshot),
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(gezien.length).toBeGreaterThan(0);
    const laatste = gezien[gezien.length - 1]!;

    // Wat de weergave krijgt is hetzelfde besluit dat de runner vasthoudt.
    expect(runner.latest).toEqual(laatste);
    // En het is compleet genoeg om de pagina mee te vullen.
    expect(laatste.explanation.perZone.length).toBe(exampleSite.zones.length);
    expect(Object.keys(laatste.observed).length).toBe(exampleSite.actuators.length);
    expect(typeof laatste.atMs).toBe('number');
  });

  it('laat een kapotte weergave de opname niet meeslepen', async () => {
    const ha = await startFakeHa({ states: shadowStates() });
    cleanups.push(() => ha.close());

    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      write: () => {},
      now: () => SHADOW_NOW,
      onDecision: () => {
        throw new Error('de weergave is stuk');
      },
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 300));

    // De schaduwopname is het product; het venster erop is dat niet.
    expect(runner.stats.evaluations).toBeGreaterThan(0);
    expect(runner.latest).not.toBeNull();
  });
});

describe('waarnemingen zijn geen invoer voor de regeling', () => {
  it('worden nergens in de kern gelezen', () => {
    // Besluit 30: hij gaat mee het logboek in zodat fase 7 straks een complete
    // winter heeft, maar de arbiter neemt er geen besluit op. Zodra iemand dat
    // wél wil, hoort daar een besluit bij — en dan faalt deze test als
    // herinnering in plaats van dat het ongemerkt gebeurt.
    //
    // `decide.ts` mag hem aanraken: die zet hem in de uitleg en dus in het log.
    const kern = new URL('../src/core/', import.meta.url);
    const bestanden = readdirSync(kern).filter((n) => n.endsWith('.ts'));
    expect(bestanden.length).toBeGreaterThan(4);

    // Twee waarnemingen inmiddels: de buitentemperatuur (besluit 30) en de
    // opbrengst van de panelen (besluit 47). Voor allebei geldt hetzelfde.
    for (const veld of ['outdoorTemperatureC', 'solarProductionW']) {
      const lezers = bestanden.filter((naam) => {
        if (naam === 'state.ts' || naam === 'decision.ts' || naam === 'decide.ts') return false;
        return readFileSync(new URL(naam, kern), 'utf-8').includes(veld);
      });
      expect(lezers, veld).toEqual([]);
    }
  });

  it('komt onbewerkt in de uitleg terecht', () => {
    const state = buildSystemState(
      exampleSite,
      {
        state: (id) => (id === exampleSite.outdoorTemperature!.id ? '7.3' : null),
        number: (id) =>
          id === exampleSite.outdoorTemperature!.id
            ? 7.3
            : id === exampleSite.solarProduction!.id
              ? 1840
              : null,
        bool: () => null,
        attr: () => null,
        attrNumber: () => null,
        changedAt: () => null,
        hvacAction: () => null,
        hvacActionSince: () => null,
      },
      SHADOW_NOW,
    );

    const decision = decide({
      config: exampleSite,
      state,
      strategies: defaultStrategies(),
    });
    expect(decision.explanation.outdoorTemperatureC).toBe(7.3);
    expect(decision.explanation.solarProductionW).toBe(1840);
  });
});

describe('het websocket-eindpunt', () => {
  it('vult /api/websocket aan bij een basis-URL', () => {
    expect(websocketUrl('http://homeassistant.local:8123')).toBe(
      'ws://homeassistant.local:8123/api/websocket',
    );
  });

  it('laat een volledig eindpunt met rust', () => {
    expect(websocketUrl('ws://192.168.1.20:8123/api/websocket')).toBe(
      'ws://192.168.1.20:8123/api/websocket',
    );
  });

  it('laat het Supervisor-eindpunt met rust', () => {
    // De Supervisor proxyt HA op /core/websocket. Dat is een websocket-eindpunt
    // maar niet /api/websocket; er nog eens /api/websocket achter plakken gaf
    // een add-on die nergens verbinding mee maakte.
    expect(websocketUrl('http://supervisor/core/websocket')).toBe(
      'ws://supervisor/core/websocket',
    );
  });
});
