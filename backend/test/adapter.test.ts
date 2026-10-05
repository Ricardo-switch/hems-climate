/**
 * Tests tegen een nagebootste Home Assistant.
 *
 * De server hieronder spreekt het echte websocketprotocol — auth_required,
 * auth_ok, get_states, subscribe_events, state_changed — zodat de client niet
 * tegen een versimpelde versie van de werkelijkheid wordt getoetst.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
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
import { onUsablePort } from './ports.js';
import { exampleSite, withHaStabilisation } from './site.js';
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

/**
 * Wacht tot de schaduw zoveel evaluaties heeft gedaan.
 *
 * Niet op een vaste tijd. Onder een volle suite — web.test draait ernaast —
 * haalt de debounce plus het schrijven een vast venster niet altijd, en dan
 * viel een test om zonder dat er iets mis was.
 */
async function waitUntil(runner: { stats: { evaluations: number } }, n: number): Promise<void> {
  await waitFor(
    () => runner.stats.evaluations >= n,
    () => `${n} evaluaties (bleef op ${runner.stats.evaluations} staan)`,
  );
}

/**
 * Wacht tot een voorwaarde waar is, met een ruime bovengrens.
 *
 * Voor alles wat een test "na een tijdje" verwacht. Een vaste wachttijd is op
 * een snelle pc ruim en op een drukke CI-machine te krap; deze wacht precies zo
 * lang als nodig en faalt met een zin in plaats van een verkeerde telling.
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  what: string | (() => string),
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`gewacht op ${typeof what === 'function' ? what() : what}, kwam niet`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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

  // Niet zomaar poort 0: zie ports.ts.
  const wss = await onUsablePort(
    async () => {
      const server = new WebSocketServer({ port: 0 });
      await new Promise<void>((resolve) => server.once('listening', resolve));
      return server;
    },
    (server) => (server.address() as AddressInfo).port,
    (server) => new Promise<void>((resolve) => server.close(() => resolve())),
  );

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

  it('laat met allowLights alleen light.turn_on en light.turn_off op lampen door', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: TOKEN, allowLights: true });
    expect(client.writesAllowed).toBe(false);
    expect(client.lightsAllowed).toBe(true);
    const refused: [string, string, Record<string, unknown>][] = [
      ['climate', 'turn_off', { entity_id: 'climate.beneden' }],
      ['cover', 'close_cover', { entity_id: 'cover.screen' }],
      ['light', 'toggle', { entity_id: 'light.hal' }],
      ['light', 'turn_off', { entity_id: 'climate.beneden' }],
      ['light', 'turn_off', { entity_id: ['light.hal', 'switch.pomp'] }],
      ['light', 'turn_off', { area_id: 'woonkamer' }],
      ['light', 'turn_off', { entity_id: 'light.hal', area_id: 'woonkamer' }],
      ['light', 'turn_off', { entity_id: [] }],
      ['homeassistant', 'turn_off', { entity_id: 'light.hal' }],
    ];
    for (const [domain, service, target] of refused) {
      await expect(client.callService(domain, service, {}, target), `${domain}.${service}`).rejects.toThrow(/Schrijven staat uit/);
    }
  });

  it('stuurt een toegestane lichtopdracht echt naar Home Assistant', async () => {
    const ha = await startFakeHa({});
    cleanups.push(() => ha.close());
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN, allowLights: true });
    cleanups.push(() => client.close());
    const ready = new Promise((resolve) => client.on('ready', resolve));
    client.connect();
    await ready;
    await client.callService('light', 'turn_off', {}, { entity_id: ['light.hal', 'light.trap'] });
    expect(ha.received.find((m) => m['type'] === 'call_service')).toMatchObject({
      domain: 'light',
      service: 'turn_off',
      target: { entity_id: ['light.hal', 'light.trap'] },
    });
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
    await waitFor(
      () => lines.some((l) => l.includes('zou sturen') || l.includes('zou niets')),
      'een besluitregel',
    );

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
  function withoutHelpers(config: SiteConfig): SiteConfig {
    const copy: Record<string, unknown> = { ...config };
    delete copy['mode'];
    delete copy['timers'];
    return copy as unknown as SiteConfig;
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
  function coolLivingRoom(): HaEntityState[] {
    return shadowStates().map((s) =>
      s.entity_id === 'sensor.beneden_temperatuur'
        ? shadowEntity('sensor.beneden_temperatuur', '21.0')
        : s,
    );
  }

  async function runShadow(config: SiteConfig): Promise<string[]> {
    const ha = await startFakeHa({ states: coolLivingRoom() });
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
    await waitUntil(runner, 1);

    // Een tweede evaluatie uitlokken, nu met een woonkamer die wél wil koelen.
    // De klok staat stil, dus de timer die bij het eerste besluit is gestart
    // loopt nu gegarandeerd nog.
    ha.push(shadowEntity('sensor.beneden_temperatuur', '24.5'));
    await waitUntil(runner, 2);

    return lines;
  }

  it('houdt de stabilisatietimer zelf bij en blokkeert daarna zelf', async () => {
    const lines = await runShadow(withoutHelpers(exampleSite));

    // Ruim overschot en een warme zolder: het eerste besluit zet de zolder aan,
    // en vraagt daarbij om een stabilisatietimer.
    expect(lines.some((l) => l.includes('timer stabilisation start'))).toBe(true);
    // Bij de volgende evaluatie wil de woonkamer ook koelen, en die staat nog
    // stil — dus houdt de eigen timer hem tegen, zonder dat er ooit een
    // `timer.`-entiteit aan te pas kwam.
    expect(lines.some((l) => l.includes('stabilisation_active'))).toBe(true);
  });

  it('gebruikt in deze woning de eigen timer, niet die van het oude systeem', async () => {
    // Besluit 60. De timer van het oude systeem liep alleen wanneer dát systeem
    // iets startte; de schaduw mat daardoor een stukje van zijn voorganger.
    const lines = await runShadow(exampleSite);

    expect(exampleSite.timers?.stabilisation).toBeUndefined();
    expect(lines.some((l) => l.includes('timer stabilisation start'))).toBe(true);
    expect(lines.some((l) => l.includes('stabilisation_active'))).toBe(true);
  });

  it('laat een timer uit Home Assistant winnen wanneer de configuratie hem noemt', async () => {
    // De nep-HA kent `timer.pv_stabilisatie` niet, dus die staat niet actief —
    // en de eigen boekhouding mag daar niet overheen gaan liggen (besluit 39).
    const lines = await runShadow(withHaStabilisation);

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
    const other: SiteConfig = {
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

    const known = relevantEntities(other);
    expect(known.has('sensor.andere_meter')).toBe(true);
    expect(known.has('person.gast')).toBe(true);
    for (const z of other.zones) expect(known.has(`sensor.${z.id}_anders`)).toBe(true);

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
    await waitUntil(runner, 1);
    const baseline = runner.stats.evaluations;

    // Twintig irrelevante events: geen enkele herberekening. Eerst wachten tot
    // ze aantoonbaar alle twintig verwerkt zijn; pas dan zegt "niet gerekend"
    // iets.
    for (let i = 0; i < 20; i++) {
      ha.push(entity(`sensor.ruis_${i}`, String(i)));
    }
    await waitFor(() => runner.stats.ignoredEvents === 20, 'twintig genegeerde events');
    expect(runner.stats.evaluations).toBe(baseline);
    expect(runner.stats.ignoredEvents).toBe(20);

    // Een echte klimaatwijziging wel.
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '26.5'));
    await waitUntil(runner, baseline + 1);
    expect(runner.stats.evaluations).toBe(baseline + 1);
  });
});

describe('de ruwe historie (besluit 52)', () => {
  it('legt de stand bij verbinden en elke gevolgde wijziging vast, en niets anders', async () => {
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

    runner.start();
    await waitUntil(runner, 1);
    // Eerst iets wat we niet volgen, dan iets wat we wel volgen. Eén
    // verbinding, dus als de tweede verwerkt is, is de eerste dat ook.
    ha.push(shadowEntity('sensor.koelkast_temperatuur', '4.1'));
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.3'));
    await waitUntil(runner, 2);
    await runner.historySettled();

    const day = new Date(SHADOW_NOW).toISOString().slice(0, 10);
    const rows = (await readFile(join(dir, `history-${day}.ndjson`), 'utf-8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { e: string; s: string });

    // De momentopname: de netmeting en de airco's zitten erin.
    expect(rows.some((r) => r.e === 'sensor.p1_meter_power')).toBe(true);
    expect(rows.some((r) => r.e === 'climate.air_conditioning_zolder')).toBe(true);
    // De wijziging daarna.
    expect(
      rows.some((r) => r.e === 'sensor.hue_motion_sensor_zolder_temperatuur' && r.s === '25.3'),
    ).toBe(true);
    // En niets wat de regeling niet leest.
    expect(rows.some((r) => r.e === 'sensor.koelkast_temperatuur')).toBe(false);
  });
});

describe('alleen vastleggen (besluit 65)', () => {
  it('legt het gasverbruik vast, maar beslist er niet opnieuw op', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-shadow-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const ha = await startFakeHa({
      states: [...shadowStates(), shadowEntity('sensor.gas_meter_gas', '4123.456')],
    });
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

    runner.start();
    await waitUntil(runner, 1);
    // Eerst het gas, dan iets wat wél een besluit uitlokt. Eén verbinding, dus
    // als het tweede verwerkt is, is het eerste dat ook.
    ha.push(shadowEntity('sensor.gas_meter_gas', '4123.789'));
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.3'));
    await waitUntil(runner, 2);
    await runner.historySettled();

    // Alleen de temperatuur gaf een besluit, het gas niet.
    expect(runner.stats.evaluations).toBe(2);
    const day = new Date(SHADOW_NOW).toISOString().slice(0, 10);
    const rows = (await readFile(join(dir, `history-${day}.ndjson`), 'utf-8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { e: string; s: string });
    const gas = rows.filter((r) => r.e === 'sensor.gas_meter_gas').map((r) => r.s);
    expect(gas).toEqual(['4123.456', '4123.789']);
  });
});

describe('de eigen stand over een herstart heen (besluit 62)', () => {
  /** Zolder warm, woonkamer wel of niet: zie `coolLivingRoom` hierboven. */
  function states(livingRoomC: string): HaEntityState[] {
    return shadowStates().map((s) =>
      s.entity_id === 'sensor.beneden_temperatuur'
        ? shadowEntity('sensor.beneden_temperatuur', livingRoomC)
        : s,
    );
  }

  /** Eén dienst: verbinden, één besluit, en dan weer weg. */
  async function once(dir: string, livingRoomC: string, nowMs: number): Promise<string[]> {
    const ha = await startFakeHa({ states: states(livingRoomC) });
    const client = new HaClient({ url: `http://127.0.0.1:${ha.port}`, token: TOKEN });
    const lines: string[] = [];
    const runner = new ShadowRunner({
      config: exampleSite,
      strategies: defaultStrategies(),
      client,
      tickSeconds: 3600,
      debounceMs: 10,
      minIntervalSeconds: 0,
      watchdogMinutes: 0,
      logDir: dir,
      write: (line) => lines.push(line),
      now: () => nowMs,
    });
    runner.start();
    await waitUntil(runner, 1);
    await runner.stateSettled();
    await runner.historySettled();
    runner.stop();
    await ha.close();
    return lines;
  }

  async function freshDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hems-shadow-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    return dir;
  }

  it('gaat na een herstart verder met de timer en de veronderstelde stand', async () => {
    const dir = await freshDir();

    // Eerste dienst: de zolder start, en daarmee de stabilisatietimer.
    const first = await once(dir, '21.0', SHADOW_NOW);
    expect(first.some((l) => l.includes('ac-zolder → cool'))).toBe(true);
    const saved = JSON.parse(await readFile(join(dir, 'own-state.json'), 'utf-8')) as {
      timers: { stabilisation: { endsAtMs: number } };
      actuators: Record<string, { action: string }>;
    };
    expect(saved.timers.stabilisation.endsAtMs).toBe(SHADOW_NOW + 5 * 60_000);
    expect(saved.actuators['ac-zolder']?.action).toBe('cool');

    // Een minuut later een nieuwe dienst, nu wil de woonkamer ook koelen.
    const second = await once(dir, '24.5', SHADOW_NOW + 60_000);
    expect(second.some((l) => l.includes('eigen stand hersteld van 1 min geleden'))).toBe(true);
    // De zolder draait in zijn veronderstelling al: niet opnieuw starten.
    expect(second.some((l) => l.includes('ac-zolder → cool'))).toBe(false);
    // En de timer van de vorige dienst houdt de woonkamer tegen.
    expect(second.some((l) => l.includes('stabilisation_active'))).toBe(true);
  });

  it('begint bij het echte apparaat als de bewaarde stand te oud is', async () => {
    const dir = await freshDir();
    await once(dir, '21.0', SHADOW_NOW);

    const later = await once(dir, '21.0', SHADOW_NOW + 2 * 3_600_000);
    expect(later.some((l) => l.includes('apparaatstand te oud'))).toBe(true);
    // Het echte apparaat staat uit, dus begint de arbiter opnieuw.
    expect(later.some((l) => l.includes('ac-zolder → cool'))).toBe(true);
  });

  it('start gewoon als het bestand onleesbaar is, en zegt waarom', async () => {
    const dir = await freshDir();
    await writeFile(join(dir, 'own-state.json'), '{ half', 'utf-8');

    const lines = await once(dir, '21.0', SHADOW_NOW);
    expect(lines.some((l) => l.includes('bewaarde stand genegeerd (geen geldige JSON)'))).toBe(true);
    expect(lines.some((l) => l.includes('ac-zolder → cool'))).toBe(true);
  });
});

describe('oude dagen comprimeren (besluit 58)', () => {
  it('doet de dienst zelf, meteen na het eerste besluit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hems-shadow-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    // Twee weken voor de vaste klok van de schaduwtest.
    await writeFile(join(dir, 'decisions-2026-07-01.ndjson'), '{"t":1}\n', 'utf-8');

    const messages: string[] = [];
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
      // Bewaren, zodat een mislukte compressie in de foutmelding staat.
      write: (line) => messages.push(line),
      now: () => SHADOW_NOW,
    });
    cleanups.push(() => runner.stop());

    runner.start();
    // Wachten op allebei. De dienst hernoemt eerst naar `.gz` en haalt pas
    // daarna het gewone bestand weg (besluit 58). Wie na het eerste meteen het
    // tweede controleert, valt soms precies tussen die twee stappen; onder de
    // last van de volledige suite gebeurde dat ongeveer één keer op twintig.
    await waitFor(
      async () => {
        const names = await readdir(dir);
        return (
          names.includes('decisions-2026-07-01.ndjson.gz') &&
          !names.includes('decisions-2026-07-01.ndjson')
        );
      },
      () => `de gecomprimeerde oude dag, zonder het origineel; de dienst meldde:\n${messages.join('\n')}`,
    );
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

    runner.start();
    await waitUntil(runner, 1);
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
    await waitUntil(runner, 2);
    ha.push(shadowEntity('sensor.hue_motion_sensor_zolder_temperatuur', '25.2'));
    await waitUntil(runner, 3);
    const day = new Date(SHADOW_NOW).toISOString().slice(0, 10);
    // Het derde record moet ook geschreven zijn, en dat gaat na de evaluatie.
    await waitFor(async () => {
      try {
        const text = await readFile(join(dir, `decisions-${day}.ndjson`), 'utf-8');
        return text.trim().split('\n').length >= 3;
      } catch {
        return false;
      }
    }, 'drie records op schijf');

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
      // Ruim, zodat tien pulsen er ook op een drukke CI-machine binnen vallen.
      minIntervalSeconds: 2,
      write: () => {},
      now: () => SHADOW_NOW + (Date.now() - t0),
    });
    cleanups.push(() => runner.stop());

    runner.start();
    // Pas meten na de eerste evaluatie. Een vaste wachttijd haalde onder
    // belasting het verbinden niet, en dan viel die eerste evaluatie ná het
    // nulpunt en telde de test er twee.
    await waitUntil(runner, 1);
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
    // Wachten tot het gebeurt, niet een vaste tijd: de bewering is "uiteindelijk".
    await waitUntil(runner, baseline + 1);
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
    await waitUntil(runner, 1);
    expect(stalls).toEqual([]);

    // De klok springt twee minuten vooruit zonder dat er iets gebeurt.
    clock = SHADOW_NOW + 2 * 60_000;
    await waitFor(() => stalls.length > 0, 'een alarm van de bewaking');
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
    const seen: LiveSnapshot[] = [];
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
      onDecision: (snapshot) => seen.push(snapshot),
    });
    cleanups.push(() => runner.stop());

    runner.start();
    await waitFor(() => seen.length > 0, 'een besluit voor de weergave');

    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1]!;

    // Wat de weergave krijgt is hetzelfde besluit dat de runner vasthoudt.
    expect(runner.latest).toEqual(last);
    // En het is compleet genoeg om de pagina mee te vullen.
    expect(last.explanation.perZone.length).toBe(exampleSite.zones.length);
    expect(Object.keys(last.observed).length).toBe(exampleSite.actuators.length);
    expect(typeof last.atMs).toBe('number');
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
    await waitUntil(runner, 1);

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
    const core = new URL('../src/core/', import.meta.url);
    const files = readdirSync(core).filter((n) => n.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(4);

    // Twee waarnemingen inmiddels: de buitentemperatuur (besluit 30) en de
    // opbrengst van de panelen (besluit 47). Voor allebei geldt hetzelfde.
    for (const field of ['outdoorTemperatureC', 'solarProductionW']) {
      const readers = files.filter((name) => {
        if (name === 'state.ts' || name === 'decision.ts' || name === 'decide.ts') return false;
        return readFileSync(new URL(name, core), 'utf-8').includes(field);
      });
      expect(readers, field).toEqual([]);
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
