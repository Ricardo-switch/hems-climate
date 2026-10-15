/**
 * WebSocket-client voor de Home Assistant API.
 *
 * Gebruikt de WebSocket die in Node zelf zit; geen extra afhankelijkheid.
 *
 * Schrijven is standaard uit. `callService` bestaat wel, maar werpt zolang
 * `allowWrites` niet expliciet aan staat. Dat is met opzet een harde grens en
 * geen afspraak: deze code praat met de verwarming van een echt huis, en de
 * schaduwmodus moet onmogelijk per ongeluk iets kunnen schakelen.
 */

import { EventEmitter } from 'node:events';

/**
 * Wat `query()` mag opvragen. Alles hierbuiten werpt.
 *
 * Allemaal leesopdrachten uit de registers van Home Assistant. `get_config`
 * staat erbij omdat daar de tijdzone in zit — het enige veld dat de
 * configuratie echt nodig heeft en dat nergens anders te halen is. De etages
 * kwamen erbij voor het huis als navigatie (ONTWERP §4); ook dat is lezen.
 */
const READ_COMMANDS: ReadonlySet<string> = new Set([
  'get_config',
  'config/area_registry/list',
  'config/floor_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list',
  // Opbrengst (besluit 102): het Energie-dashboard en de statistiek van de
  // meters. Ook dat is lezen.
  'energy/get_prefs',
  'recorder/list_statistic_ids',
  'recorder/statistics_during_period',
  // De stem van het huis (besluit 141): welke talen en stemmen Piper heeft.
  'tts/engine/list',
  'tts/engine/voices',
]);

/** Alleen deze leesopdrachten krijgen velden mee; de rest gaat zonder. */
const READ_WITH_FIELDS: ReadonlySet<string> = new Set(['recorder/list_statistic_ids', 'recorder/statistics_during_period', 'tts/engine/voices']);

export interface HaEntityState {
  readonly entity_id: string;
  readonly state: string;
  readonly attributes: Record<string, unknown>;
  readonly last_changed: string;
  readonly last_updated: string;
}

interface StateChangedEvent {
  readonly event_type: 'state_changed';
  readonly data: {
    readonly entity_id: string;
    readonly new_state: HaEntityState | null;
    readonly old_state: HaEntityState | null;
  };
}

export interface HaClientOptions {
  /** Basis-URL van Home Assistant, bijvoorbeeld http://homeassistant.local:8123 */
  readonly url: string;
  /** Long-lived access token. */
  readonly token: string;
  /**
   * Of deze client diensten mag aanroepen. Laat dit uit in schaduwmodus.
   * Zonder deze vlag werpt `callService` en komt er niets bij HA terecht.
   */
  readonly allowWrites?: boolean;
  /**
   * Of deze client lampen mag aan- en uitzetten, ook als `allowWrites` uit staat
   * (besluit 97). Precies `light.turn_on` en `light.turn_off`, en alleen op
   * `light.`-entiteiten; elke andere dienst blijft werpen. Klimaat en screens
   * kunnen hier dus niet doorheen.
   */
  readonly allowLights?: boolean;
  /**
   * Of deze client een scène mag aanzetten (besluit 100): precies
   * `scene.turn_on`, op één `scene.`-entiteit, zonder verdere velden. Elke
   * andere dienst blijft werpen, ook `hue.activate_scene`.
   */
  readonly allowScenes?: boolean;
  /**
   * Of deze client een scherm mag bedienen voor de bewoner (besluit 121):
   * `cover.open_cover`, `close_cover`, `stop_cover` of `set_cover_position`
   * met alleen een stand, op precies één `cover.`-entiteit. De regeling stuurt
   * hier niets doorheen; klimaat en elke andere dienst blijven werpen.
   */
  readonly allowCovers?: boolean;
  /** Wachttijd voordat een verbroken verbinding opnieuw wordt opgezet. */
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const WS_PATH = '/api/websocket';

/**
 * Een aanroep die alleen lampen raakt: `light.turn_on` of `light.turn_off`, met
 * als doel uitsluitend een of meer `light.`-entiteiten. Geen gebied, apparaat of
 * label als doel, want daar kan van alles onder hangen.
 */
function isLightCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (domain !== 'light' || (service !== 'turn_on' && service !== 'turn_off')) return false;
  if (Object.keys(target).some((k) => k !== 'entity_id')) return false;
  // Alleen de velden die de app gebruikt (besluiten 97 en 100): helderheid,
  // kleurtemperatuur en kleur. Niets als knipperen of een effect.
  if (Object.keys(data).some((k) => !LIGHT_FIELDS.has(k))) return false;
  if (service === 'turn_off' && Object.keys(data).length > 0) return false;
  const ids = target['entity_id'];
  const list = Array.isArray(ids) ? ids : [ids];
  return list.length > 0 && list.every((id) => typeof id === 'string' && /^light\.[a-z0-9_]+$/.test(id));
}

const LIGHT_FIELDS: ReadonlySet<string> = new Set(['brightness_pct', 'color_temp_kelvin', 'hs_color']);

const COVER_SERVICES: ReadonlySet<string> = new Set(['open_cover', 'close_cover', 'stop_cover', 'set_cover_position']);

/**
 * Een scherm bedienen (besluit 121): open, dicht, stop, of een stand van 0 tot
 * 100, op één `cover.`-entiteit. Geen kanteling, geen groep, geen gebied.
 */
function isCoverCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (domain !== 'cover' || !COVER_SERVICES.has(service)) return false;
  if (Object.keys(target).some((k) => k !== 'entity_id')) return false;
  const id = target['entity_id'];
  if (typeof id !== 'string' || !/^cover\.[a-z0-9_]+$/.test(id)) return false;
  if (service !== 'set_cover_position') return Object.keys(data).length === 0;
  const keys = Object.keys(data);
  const pos = data['position'];
  return keys.length === 1 && keys[0] === 'position' && typeof pos === 'number' && Number.isInteger(pos) && pos >= 0 && pos <= 100;
}

/** Een scène aanzetten (besluit 100): één `scene.`-entiteit, verder niets. */
function isSceneCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (domain !== 'scene' || service !== 'turn_on') return false;
  if (Object.keys(data).length > 0 || Object.keys(target).some((k) => k !== 'entity_id')) return false;
  const id = target['entity_id'];
  return typeof id === 'string' && /^scene\.[a-z0-9_]+$/.test(id);
}

/**
 * Zet een http(s)- of ws(s)-URL om naar het websocket-eindpunt van HA.
 *
 * Bewust tolerant, want er zijn twee dingen die iemand redelijkerwijs invult:
 * de basis-URL die in de browser staat, of het eindpunt zelf. Beide horen te
 * werken; een dubbel aangeplakt pad is geen configuratiefout die je een
 * gebruiker moet laten uitzoeken.
 *
 * Sinds de add-on is er een derde vorm: de Supervisor proxyt Home Assistant op
 * `ws://supervisor/core/websocket` — wél een websocket-eindpunt, maar niet op
 * `/api/websocket`. Vandaar dat elk pad dat op `/websocket` eindigt met rust
 * wordt gelaten, in plaats van alleen dat ene.
 */
export function websocketUrl(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss:' : 'ws:';
  const path = u.pathname.replace(/\/+$/, '');
  u.pathname = path.endsWith('/websocket') ? path : path + WS_PATH;
  u.search = '';
  u.hash = '';
  return u.toString();
}

export declare interface HaClient {
  on(event: 'ready', listener: (states: HaEntityState[]) => void): this;
  on(event: 'stateChanged', listener: (state: HaEntityState) => void): this;
  on(event: 'disconnected', listener: (reason: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  /** De dagverwachting van de gevolgde weerentiteit (besluit 111). */
  on(event: 'forecast', listener: (entityId: string | null, forecast: unknown[]) => void): this;
}

export class HaClient extends EventEmitter {
  readonly #options: Required<Omit<HaClientOptions, 'allowWrites' | 'allowLights' | 'allowScenes' | 'allowCovers'>> & {
    allowWrites: boolean;
    allowLights: boolean;
    allowScenes: boolean;
    allowCovers: boolean;
  };
  #socket: WebSocket | null = null;
  #nextId = 1;
  #pending = new Map<number, Pending>();
  #subscriptionId: number | null = null;
  #reconnectAttempt = 0;
  #closing = false;

  constructor(options: HaClientOptions) {
    super();
    this.#options = {
      url: options.url,
      token: options.token,
      allowWrites: options.allowWrites ?? false,
      allowLights: options.allowLights ?? false,
      allowScenes: options.allowScenes ?? false,
      allowCovers: options.allowCovers ?? false,
      reconnectBaseMs: options.reconnectBaseMs ?? 1_000,
      reconnectMaxMs: options.reconnectMaxMs ?? 60_000,
    };
  }

  get writesAllowed(): boolean {
    return this.#options.allowWrites;
  }

  get lightsAllowed(): boolean {
    return this.#options.allowLights;
  }

  get coversAllowed(): boolean {
    return this.#options.allowCovers;
  }

  connect(): void {
    this.#closing = false;
    this.#open();
  }

  close(): void {
    this.#closing = true;
    this.#socket?.close();
    this.#socket = null;
  }

  #open(): void {
    const socket = new WebSocket(websocketUrl(this.#options.url));
    this.#socket = socket;

    socket.addEventListener('message', (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      void this.#handle(msg);
    });

    socket.addEventListener('close', () => {
      this.#failPending('verbinding gesloten');
      this.#subscriptionId = null;
      if (this.#closing) return;
      this.emit('disconnected', 'socket gesloten');
      this.#scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // Details komen via 'close'; hier alleen doorgeven dat er iets mis is.
      this.#emitError(new Error('websocketfout'));
    });
  }

  #scheduleReconnect(): void {
    this.#reconnectAttempt += 1;
    const delay = Math.min(
      this.#options.reconnectMaxMs,
      this.#options.reconnectBaseMs * 2 ** (this.#reconnectAttempt - 1),
    );
    setTimeout(() => {
      if (!this.#closing) this.#open();
    }, delay).unref?.();
  }

  async #handle(msg: Record<string, unknown>): Promise<void> {
    switch (msg['type']) {
      case 'auth_required':
        this.#send({ type: 'auth', access_token: this.#options.token });
        return;

      case 'auth_invalid':
        this.#emitError(
          new Error(
            'Home Assistant weigerde het token. Controleer HA_TOKEN — een ' +
              'long-lived access token maak je in je profiel, onderaan de pagina.',
          ),
        );
        this.#closing = true;
        this.#socket?.close();
        return;

      case 'auth_ok': {
        this.#reconnectAttempt = 0;
        try {
          const states = (await this.#command({
            type: 'get_states',
          })) as HaEntityState[];
          this.#subscriptionId = await this.#subscribe();
          // Na een herverbinding opnieuw de verwachting volgen, als dat gevraagd was.
          this.#forecastSub = null;
          if (this.#forecastEntity) void this.#followForecast().catch((e: Error) => this.#emitError(e));
          this.emit('ready', states);
        } catch (error) {
          this.#emitError(error as Error);
        }
        return;
      }

      case 'result': {
        const id = msg['id'] as number;
        const pending = this.#pending.get(id);
        if (!pending) return;
        this.#pending.delete(id);
        if (msg['success'] === true) pending.resolve(msg['result']);
        else {
          const err = msg['error'] as { message?: string } | undefined;
          pending.reject(new Error(err?.message ?? 'onbekende fout van HA'));
        }
        return;
      }

      case 'event': {
        // De verwachting van een weerentiteit (besluit 111): alleen lezen.
        if (this.#forecastSub != null && msg['id'] === this.#forecastSub) {
          const ev = msg['event'] as { forecast?: unknown } | undefined;
          if (Array.isArray(ev?.forecast)) this.emit('forecast', this.#forecastEntity, ev.forecast);
          return;
        }
        if (msg['id'] !== this.#subscriptionId) return;
        const event = msg['event'] as StateChangedEvent | undefined;
        if (event?.event_type !== 'state_changed') return;
        const next = event.data.new_state;
        if (next) this.emit('stateChanged', next);
        return;
      }

      default:
        return;
    }
  }

  /** De weerentiteit waarvan de dienst de verwachting volgt, en het abonnement erop. */
  #forecastEntity: string | null = null;
  #forecastSub: number | null = null;

  /**
   * Volgt de dagverwachting van een weerentiteit (besluit 111). Home Assistant
   * geeft die alleen via een abonnement (`weather/subscribe_forecast`); dat is
   * lezen, net als de toestanden. Null stopt het volgen. Elke nieuwe
   * verwachting komt als `forecast` (entiteit, lijst).
   */
  async followForecast(entityId: string | null): Promise<void> {
    if (entityId != null && !/^weather\.[a-z0-9_]+$/.test(entityId)) throw new Error(`geen weerentiteit: ${entityId}`);
    if (entityId === this.#forecastEntity && this.#forecastSub != null) return;
    if (this.#forecastSub != null) {
      const oud = this.#forecastSub;
      this.#forecastSub = null;
      await this.#command({ type: 'unsubscribe_events', subscription: oud }).catch(() => {});
    }
    this.#forecastEntity = entityId;
    if (entityId) await this.#followForecast();
  }

  async #followForecast(): Promise<void> {
    const id = this.#nextId;
    this.#forecastSub = id;
    await this.#command({ type: 'weather/subscribe_forecast', entity_id: this.#forecastEntity, forecast_type: 'daily' });
  }

  async #subscribe(): Promise<number> {
    const id = this.#nextId;
    await this.#command({ type: 'subscribe_events', event_type: 'state_changed' });
    return id;
  }

  #command(payload: Record<string, unknown>): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ ...payload, id });
    });
  }

  #send(payload: Record<string, unknown>): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }

  /**
   * Zendt een fout uit, maar alleen wanneer er iemand luistert.
   *
   * Een EventEmitter die 'error' uitzendt zonder luisteraar legt het hele
   * proces om. Voor een dienst die maanden moet doorlopen naast een draaiend
   * huis is dat het verkeerde gedrag: een losgeraakte websocket hoort tot een
   * herverbinding te leiden, niet tot een crash.
   */
  #emitError(error: Error): void {
    if (this.listenerCount('error') > 0) this.emit('error', error);
    else console.error(`[HaClient] ${error.message}`);
  }

  #failPending(reason: string): void {
    for (const pending of this.#pending.values()) {
      pending.reject(new Error(reason));
    }
    this.#pending.clear();
  }

  /**
   * Stelt Home Assistant een leesvraag.
   *
   * Bedoeld voor de registers waarmee de onboarding een installatie ontdekt:
   * gebieden, apparaten, entiteiten, en de basisinstellingen waarin de
   * tijdzone staat.
   *
   * De lijst hieronder is een witte lijst en geen gemak. `callService` werpt
   * zolang `allowWrites` uit staat (besluit 15), en dat zou weinig waard zijn
   * als er daarnaast een gat bestaat waar elk willekeurig commando doorheen
   * kan. Wie hier iets wil toevoegen, voegt het bewust toe.
   */
  async query<T>(type: string, fields: Record<string, unknown> = {}): Promise<T> {
    if (!READ_COMMANDS.has(type)) {
      throw new Error(
        `"${type}" staat niet op de lijst van leesopdrachten. ` +
          `Toegestaan zijn: ${[...READ_COMMANDS].join(', ')}.`,
      );
    }
    if (Object.keys(fields).length > 0 && !READ_WITH_FIELDS.has(type)) {
      throw new Error(`"${type}" krijgt geen velden mee.`);
    }
    // De velden komen eerst, zodat ze `type` en `id` nooit kunnen overschrijven.
    return (await this.#command({ ...fields, type })) as T;
  }

  /**
   * Roept een dienst aan in Home Assistant. Werpt zolang `allowWrites` uit
   * staat — in schaduwmodus is dat de bedoeling. De uitzonderingen zijn smal:
   * licht (`isLightCall`), scènes (`isSceneCall`) en schermen voor de bewoner
   * (`isCoverCall`).
   */
  async callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Promise<void> {
    const allowed =
      this.#options.allowWrites ||
      (this.#options.allowLights && isLightCall(domain, service, data, target)) ||
      (this.#options.allowScenes && isSceneCall(domain, service, data, target)) ||
      (this.#options.allowCovers && isCoverCall(domain, service, data, target));
    if (!allowed) {
      throw new Error(
        `Schrijven staat uit: ${domain}.${service} is niet verstuurd. ` +
          'Zet allowWrites expliciet aan om deze adapter te laten schakelen.',
      );
    }
    await this.#command({
      type: 'call_service',
      domain,
      service,
      service_data: data,
      target,
    });
  }
}
