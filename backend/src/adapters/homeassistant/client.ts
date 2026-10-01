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
 * configuratie echt nodig heeft en dat nergens anders te halen is.
 */
const READ_COMMANDS: ReadonlySet<string> = new Set([
  'get_config',
  'config/area_registry/list',
  'config/device_registry/list',
  'config/entity_registry/list',
]);

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
}

export class HaClient extends EventEmitter {
  readonly #options: Required<Omit<HaClientOptions, 'allowWrites'>> & {
    allowWrites: boolean;
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
      reconnectBaseMs: options.reconnectBaseMs ?? 1_000,
      reconnectMaxMs: options.reconnectMaxMs ?? 60_000,
    };
  }

  get writesAllowed(): boolean {
    return this.#options.allowWrites;
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
  async query<T>(type: string): Promise<T> {
    if (!READ_COMMANDS.has(type)) {
      throw new Error(
        `"${type}" staat niet op de lijst van leesopdrachten. ` +
          `Toegestaan zijn: ${[...READ_COMMANDS].join(', ')}.`,
      );
    }
    return (await this.#command({ type })) as T;
  }

  /**
   * Roept een dienst aan in Home Assistant. Werpt zolang `allowWrites` uit
   * staat — in schaduwmodus is dat de bedoeling.
   */
  async callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Promise<void> {
    if (!this.#options.allowWrites) {
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
