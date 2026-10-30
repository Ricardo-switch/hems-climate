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
  // Praten met je stem (besluit 150): welke spraakassistenten er zijn, met hun wekwoord.
  'assist_pipeline/pipeline/list',
  // Wie er beheerder is (besluit 161): de accounts, om achter Ingress de rol te weten.
  'config/auth/list',
  // Wat er nieuw is in de nieuwste versie van de add-on (21 oktober 2026).
  'update/release_notes',
  // Welke versie van de integratie Smart Climate Home Assistant geladen heeft (besluit 184).
  'manifest/get',
  // Of de integratie Smart Climate ook is toegevoegd (22 oktober 2026).
  'config_entries/get',
  // Wanneer de camera's het laatst beweging zagen (besluit 201): de historie van hun melders.
  'history/history_during_period',
  // Helemaal in huis (besluit 203): welke add-ons Home Assistant vond, en welke wekwoorden er zijn.
  'config_entries/flow/progress',
  'wake_word/info',
]);

/** Alleen deze leesopdrachten krijgen velden mee; de rest gaat zonder. */
const READ_WITH_FIELDS: ReadonlySet<string> = new Set(['recorder/list_statistic_ids', 'recorder/statistics_during_period', 'tts/engine/voices', 'update/release_notes', 'manifest/get', 'config_entries/get', 'history/history_during_period', 'wake_word/info']);

/**
 * Zo lang wacht een vraag aan Home Assistant op antwoord, en een nieuwe
 * verbinding op de handdruk (22 oktober 2026). Zonder grens bleef een vraag die
 * tijdens een herstart van Home Assistant wegviel voor altijd hangen, en een
 * verbinding die halverwege bleef steken kwam nooit terug.
 */
const ANTWOORD_MS = 20_000;
const HANDDRUK_MS = 20_000;

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
  /**
   * Bijwerken vanuit de app (21 oktober 2026): `update.install` op precies deze
   * entiteit, de update van de eigen add-on, zonder velden. Null of weg: dicht.
   */
  readonly allowUpdate?: () => string | null;
  /**
   * Of deze client een melding naar een telefoon mag sturen (besluit 183):
   * precies `notify.mobile_app_…`, de app van Home Assistant op een telefoon,
   * met alleen een titel, een tekst en de vaste velden van zo'n melding (een
   * label om hem later te vervangen, waar een tik naartoe gaat, hoe dringend).
   * Geen doel, geen andere notify-dienst; er verandert niets in het huis.
   */
  readonly allowNotify?: boolean;
  /**
   * De klimaatbrug (besluit 210): de knoppen van het oude systeem die de
   * assistent tot stap B mag verzetten. Precies `input_number.set_value` met
   * alleen een getal, of `input_select.select_option` met een van de opties
   * hieronder, op één entiteit uit deze lijst. Een thermostaat of airco zelf
   * (`climate.`) komt hier nooit doorheen. Leeg of weg: dicht.
   */
  readonly allowKnoppen?: () => { readonly entiteiten: readonly string[]; readonly opties: readonly string[] };
  /**
   * Of deze client een AI-taak van Home Assistant om een tekst mag vragen
   * (besluit 148): precies `ai_task.generate_data`, via `generateData`, met
   * alleen een taaknaam, een opdracht, één `ai_task.`-entiteit en eventueel
   * de velden van het antwoord. Er verandert niets in het huis; `callService`
   * laat ook dit niet door.
   */
  readonly allowAiTask?: boolean;
  /**
   * Of deze client geluid mag laten uitschrijven (besluit 150): precies
   * `assist_pipeline/run`, via `listen`, vanaf het wekwoord of de spraak en
   * altijd tot en met tekst (`end_stage: stt`). De gespreksagent en het
   * schakelen van Home Assistant komen er nooit aan te pas.
   */
  readonly allowListen?: boolean;
  /**
   * Te doen (besluit 216): een ding op een lijst van Home Assistant zetten of
   * afvinken. Precies `todo.add_item` met alleen een tekst, of
   * `todo.update_item` met een tekst en klaar of niet klaar, op één
   * `todo.`-entiteit. Niets weghalen, geen andere lijstdienst.
   */
  readonly allowTodo?: boolean;
  /** Wachttijd voordat een verbroken verbinding opnieuw wordt opgezet. */
  readonly reconnectBaseMs?: number;
  /** Zo lang wacht een vraag op antwoord; weg is 20 seconden (22 oktober 2026). Kleiner in de tests. */
  readonly antwoordMs?: number;
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

/** De eigen add-on bijwerken (21 oktober 2026): `update.install` op die ene entiteit, zonder velden. */
function isUpdateCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>, eigen: string | null): boolean {
  if (eigen == null || domain !== 'update' || service !== 'install') return false;
  if (Object.keys(data).length > 0 || Object.keys(target).some((k) => k !== 'entity_id')) return false;
  return target['entity_id'] === eigen && /^update\.[a-z0-9_]+$/.test(eigen);
}

/** Wat er in een melding naar de app van Home Assistant mag, naast de titel en de tekst (besluit 183). */
const MELDING_VELDEN = new Set(['tag', 'group', 'clickAction', 'url', 'push', 'channel', 'importance', 'priority', 'ttl', 'alert_once']);

/**
 * Een melding naar een telefoon (besluit 183): `notify.mobile_app_…`, zonder
 * doel, met een tekst, een titel en alleen de vaste velden van de app.
 */
export function isNotifyCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (domain !== 'notify' || !/^mobile_app_[a-z0-9_]+$/.test(service)) return false;
  if (Object.keys(target).length > 0) return false;
  if (Object.keys(data).some((k) => k !== 'title' && k !== 'message' && k !== 'data')) return false;
  if (typeof data['message'] !== 'string' || data['message'].length > 500) return false;
  if (data['title'] !== undefined && (typeof data['title'] !== 'string' || data['title'].length > 120)) return false;
  const extra = data['data'];
  if (extra === undefined) return true;
  if (typeof extra !== 'object' || extra == null || Array.isArray(extra)) return false;
  for (const [k, v] of Object.entries(extra)) {
    if (!MELDING_VELDEN.has(k)) return false;
    if (k === 'push') {
      if (typeof v !== 'object' || v == null || Array.isArray(v) || Object.keys(v).some((x) => x !== 'interruption-level')) return false;
    } else if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return false;
  }
  return true;
}

/**
 * De klimaatbrug (besluit 210): een getal op een toegestane `input_number`, of
 * een toegestane optie op een toegestane `input_select`. Verder niets.
 */
/**
 * Iets op een lijst zetten of afvinken (besluit 216): `todo.add_item` met
 * alleen `item`, of `todo.update_item` met `item` en `status`, op precies één
 * `todo.`-entiteit. Sinds besluit 218 ook de afgevinkte weghalen:
 * `todo.remove_completed_items`, zonder gegevens, op één lijst. Losse items
 * weghalen kan niet.
 */
export function isTodoCall(domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (domain !== 'todo') return false;
  if (Object.keys(target).length !== 1 || typeof target['entity_id'] !== 'string' || !/^todo\.[a-z0-9_]+$/.test(target['entity_id'])) return false;
  if (service === 'remove_completed_items') return Object.keys(data).length === 0;
  const item = data['item'];
  if (typeof item !== 'string' || item.trim() === '' || item.length > 120) return false;
  if (service === 'add_item') return Object.keys(data).length === 1;
  if (service === 'update_item') return Object.keys(data).length === 2 && (data['status'] === 'completed' || data['status'] === 'needs_action');
  return false;
}

export function isKnopCall(
  domain: string,
  service: string,
  data: Record<string, unknown>,
  target: Record<string, unknown>,
  mag: { readonly entiteiten: readonly string[]; readonly opties: readonly string[] },
): boolean {
  if (Object.keys(target).some((k) => k !== 'entity_id')) return false;
  const id = target['entity_id'];
  if (typeof id !== 'string' || !mag.entiteiten.includes(id) || !id.startsWith(`${domain}.`)) return false;
  const keys = Object.keys(data);
  if (domain === 'input_number' && service === 'set_value') {
    const v = data['value'];
    return keys.length === 1 && keys[0] === 'value' && typeof v === 'number' && Number.isFinite(v);
  }
  if (domain === 'input_select' && service === 'select_option') {
    const o = data['option'];
    return keys.length === 1 && keys[0] === 'option' && typeof o === 'string' && mag.opties.includes(o);
  }
  return false;
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
  readonly #options: Required<Omit<HaClientOptions, 'allowWrites' | 'allowLights' | 'allowScenes' | 'allowCovers' | 'allowAiTask' | 'allowListen' | 'allowUpdate' | 'allowNotify' | 'allowKnoppen' | 'allowTodo'>> & {
    allowUpdate: () => string | null;
    allowKnoppen: () => { readonly entiteiten: readonly string[]; readonly opties: readonly string[] };
    allowNotify: boolean;
    allowWrites: boolean;
    allowLights: boolean;
    allowScenes: boolean;
    allowCovers: boolean;
    allowAiTask: boolean;
    allowListen: boolean;
    allowTodo: boolean;
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
      allowUpdate: options.allowUpdate ?? (() => null),
      allowNotify: options.allowNotify ?? false,
      allowKnoppen: options.allowKnoppen ?? (() => ({ entiteiten: [], opties: [] })),
      allowAiTask: options.allowAiTask ?? false,
      allowListen: options.allowListen ?? false,
      allowTodo: options.allowTodo ?? false,
      reconnectBaseMs: options.reconnectBaseMs ?? 1_000,
      antwoordMs: options.antwoordMs ?? ANTWOORD_MS,
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
    // Blijft de handdruk hangen (Home Assistant start nog), dan opnieuw: sluiten geeft 'close', en die verbindt opnieuw.
    const handdruk = setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) socket.close();
    }, HANDDRUK_MS);
    handdruk.unref?.();
    socket.addEventListener('open', () => clearTimeout(handdruk));

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
      clearTimeout(handdruk);
      this.#failPending('verbinding gesloten');
      // Een gesprek dat liep, is voorbij (besluit 150).
      for (const luister of this.#luisteraars.values()) luister({ type: 'error', data: { code: 'verbinding', message: 'verbinding met Home Assistant verbroken' } });
      this.#luisteraars.clear();
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
        // Een bericht van MQTT (besluit 221): zoals het binnenkomt.
        const ruw = this.#ruw.get(msg['id'] as number);
        if (ruw) {
          ruw(msg['event']);
          return;
        }
        // Een spraakopdracht (besluit 150): de gebeurtenissen gaan naar wie luistert.
        const luister = this.#luisteraars.get(msg['id'] as number);
        if (luister) {
          const ev = msg['event'] as { type?: string; data?: Record<string, unknown> } | undefined;
          luister({ type: String(ev?.type ?? ''), data: ev?.data ?? {} });
          if (ev?.type === 'run-end') this.#luisteraars.delete(msg['id'] as number);
          return;
        }
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
      // Zonder verbinding meteen nee: eerst ging de vraag stil verloren en kwam er nooit antwoord.
      if (this.#socket?.readyState !== WebSocket.OPEN) {
        reject(new Error('geen verbinding met Home Assistant'));
        return;
      }
      const grens = setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error('Home Assistant antwoordde niet op tijd'));
      }, this.#options.antwoordMs);
      grens.unref?.();
      this.#pending.set(id, {
        resolve: (v) => {
          clearTimeout(grens);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(grens);
          reject(e);
        },
      });
      this.#send({ ...payload, id });
    });
  }

  /** Wie naar een spraakopdracht luistert, per opdracht-id (besluit 150). */
  readonly #luisteraars = new Map<number, (event: SpraakEvent) => void>();
  /** Wie een gebeurtenis zoals hij binnenkomt wil, per opdracht-id: een bericht van MQTT (besluit 221). */
  readonly #ruw = new Map<number, (event: unknown) => void>();

  /**
   * De groepen van Zigbee2MQTT (besluit 221). Zigbee2MQTT zet een groep in Home
   * Assistant als gewone lamp, zonder zijn lampen; die staan in het bericht dat
   * Zigbee2MQTT op `<basis>/bridge/groups` bewaart. Home Assistant geeft dat
   * door met `mqtt/subscribe`. Alleen lezen: luisteren, het eerste bericht, en
   * weer opzeggen. Leeg zonder MQTT, zonder Zigbee2MQTT of zonder bericht.
   */
  async leesZigbeeGroepen(onderwerp = 'zigbee2mqtt/bridge/groups', wachtMs = 4000): Promise<ZigbeeGroep[]> {
    if (!/^[\w/-]{1,120}$/.test(onderwerp)) throw new Error(`geen onderwerp: ${onderwerp}`);
    const id = this.#nextId;
    const bericht = new Promise<unknown>((resolve) => {
      const grens = setTimeout(() => resolve(null), wachtMs);
      grens.unref?.();
      this.#ruw.set(id, (ev) => {
        clearTimeout(grens);
        resolve(ev);
      });
    });
    try {
      await this.#command({ type: 'mqtt/subscribe', topic: onderwerp });
    } catch {
      this.#ruw.delete(id);
      return [];
    }
    const ev = await bericht;
    this.#ruw.delete(id);
    void this.#command({ type: 'unsubscribe_events', subscription: id }).catch(() => {});
    return zigbeeGroepenUit(ev);
  }

  /**
   * Laat Home Assistant geluid uitschrijven (besluit 150). Begint bij het
   * wekwoord of meteen bij de spraak, en stopt altijd na het uitschrijven: de
   * gespreksagent en het schakelen van Home Assistant komen er niet aan te pas.
   * Het geluid is ruwe PCM, 16 kHz, 16 bit, mono; `end` zegt dat het klaar is.
   */
  async listen(opts: {
    readonly start: 'wake_word' | 'stt';
    readonly pipeline: string | null;
    readonly onEvent: (event: SpraakEvent) => void;
  }): Promise<Gesprek> {
    if (!this.#options.allowListen) throw new Error('Luisteren staat uit: assist_pipeline/run is niet verstuurd.');
    if (opts.start !== 'wake_word' && opts.start !== 'stt') throw new Error(`geen begin: ${String(opts.start)}`);
    if (opts.pipeline != null && !/^[A-Za-z0-9_-]{1,64}$/.test(opts.pipeline)) throw new Error(`geen spraakassistent: ${opts.pipeline}`);
    const id = this.#nextId;
    let handler: number | null = null;
    let klaar = false;
    const wachtrij: Uint8Array[] = [];
    const stuur = (stuk: Uint8Array) => {
      const socket = this.#socket;
      if (handler == null || !socket || socket.readyState !== WebSocket.OPEN) return;
      const bericht = new Uint8Array(stuk.length + 1);
      bericht[0] = handler;
      bericht.set(stuk, 1);
      socket.send(bericht);
    };
    this.#luisteraars.set(id, (event) => {
      if (event.type === 'run-start') {
        const h = (event.data['runner_data'] as { stt_binary_handler_id?: unknown } | undefined)?.stt_binary_handler_id;
        if (typeof h === 'number') {
          handler = h;
          for (const stuk of wachtrij.splice(0)) stuur(stuk);
          if (klaar) stuur(new Uint8Array(0));
        }
      }
      opts.onEvent(event);
    });
    try {
      await this.#command({
        type: 'assist_pipeline/run',
        start_stage: opts.start,
        end_stage: 'stt',
        // Het wekwoord mag lang op zich laten wachten; daarna begint de pagina opnieuw.
        // Wanneer je klaar bent met praten, zegt de dienst (besluit 208): Home Assistant
        // stopte na 0,7 seconde stilte, ook midden in een zin. Dus `no_vad`, en `end`.
        input: opts.start === 'wake_word' ? { sample_rate: 16000, timeout: 280, noise_suppression_level: 1, no_vad: true } : { sample_rate: 16000, noise_suppression_level: 1, no_vad: true },
        timeout: 300,
        ...(opts.pipeline ? { pipeline: opts.pipeline } : {}),
      });
    } catch (error) {
      this.#luisteraars.delete(id);
      throw error;
    }
    return {
      send: (stuk) => {
        if (klaar || stuk.length === 0) return;
        if (handler == null) wachtrij.push(stuk.slice());
        else stuur(stuk);
      },
      end: () => {
        if (klaar) return;
        klaar = true;
        stuur(new Uint8Array(0));
      },
      stop: () => {
        klaar = true;
        if (this.#luisteraars.delete(id)) void this.#command({ type: 'unsubscribe_events', subscription: id }).catch(() => {});
      },
    };
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
      (this.#options.allowCovers && isCoverCall(domain, service, data, target)) ||
      isUpdateCall(domain, service, data, target, this.#options.allowUpdate()) ||
      (this.#options.allowNotify && isNotifyCall(domain, service, data, target)) ||
      (this.#options.allowTodo && isTodoCall(domain, service, data, target)) ||
      isKnopCall(domain, service, data, target, this.#options.allowKnoppen());
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

  /**
   * Vraagt een AI-taak van Home Assistant om een tekst (besluit 148). Werpt
   * zonder `allowAiTask`, en voor alles wat geen gewone opdracht aan één
   * `ai_task.`-entiteit is. Geeft terug wat de taak antwoordt (`data`): een
   * tekst, of een object met de gevraagde velden.
   */
  async generateData(entityId: string, instructions: string, structure?: Readonly<Record<string, AiTaskField>>): Promise<unknown> {
    if (!this.#options.allowAiTask) throw new Error('Een AI-taak vragen staat uit: ai_task.generate_data is niet verstuurd.');
    if (!/^ai_task\.[a-z0-9_]+$/.test(entityId)) throw new Error(`geen AI-taak: ${entityId}`);
    if (typeof instructions !== 'string' || instructions.trim() === '' || instructions.length > AI_TASK_MAX) {
      throw new Error(`een opdracht is 1 tot ${AI_TASK_MAX} tekens`);
    }
    const data: Record<string, unknown> = { task_name: 'smart_climate', entity_id: entityId, instructions };
    if (structure) {
      for (const [naam, veld] of Object.entries(structure)) {
        if (!/^[a-z_]{1,32}$/.test(naam) || typeof veld.description !== 'string') throw new Error(`geen geldig veld: ${naam}`);
      }
      data['structure'] = Object.fromEntries(
        Object.entries(structure).map(([naam, veld]) => [naam, { description: veld.description, required: veld.required === true, selector: { text: {} } }]),
      );
    }
    const result = (await this.#command({ type: 'call_service', domain: 'ai_task', service: 'generate_data', service_data: data, return_response: true })) as {
      response?: { data?: unknown };
    } | null;
    return result?.response?.data ?? null;
  }

  /**
   * De afspraken van agenda's tussen twee momenten (besluit 216), met
   * `calendar.get_events`: alleen lezen, er verandert niets.
   */
  async leesAgendas(ids: readonly string[], vanMs: number, totMs: number): Promise<HaAntwoord> {
    if (!ids.length || ids.some((id) => !/^calendar\.[a-z0-9_]+$/.test(id))) throw new Error('geen agenda');
    const r = (await this.#command({
      type: 'call_service',
      domain: 'calendar',
      service: 'get_events',
      service_data: { start_date_time: new Date(vanMs).toISOString(), end_date_time: new Date(totMs).toISOString() },
      target: { entity_id: [...ids] },
      return_response: true,
    })) as { response?: HaAntwoord } | null;
    return r?.response ?? null;
  }

  /** Wat er op lijsten staat (besluit 216), met `todo.get_items`: alleen lezen. */
  async leesLijsten(ids: readonly string[]): Promise<HaAntwoord> {
    if (!ids.length || ids.some((id) => !/^todo\.[a-z0-9_]+$/.test(id))) throw new Error('geen lijst');
    const r = (await this.#command({
      type: 'call_service',
      domain: 'todo',
      service: 'get_items',
      service_data: { status: ['needs_action', 'completed'] },
      target: { entity_id: [...ids] },
      return_response: true,
    })) as { response?: HaAntwoord } | null;
    return r?.response ?? null;
  }
}

/** Een groep van Zigbee2MQTT: zijn nummer, naam en de IEEE-adressen van zijn lampen (besluit 221). */
export interface ZigbeeGroep {
  readonly id: number;
  readonly naam: string;
  readonly leden: readonly string[];
}

/** Het bericht `bridge/groups` van Zigbee2MQTT, zoals Home Assistant het doorgeeft, als groepen. */
export function zigbeeGroepenUit(ev: unknown): ZigbeeGroep[] {
  const payload = (ev as { payload?: unknown } | null)?.payload;
  let lijst: unknown;
  try {
    lijst = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    return [];
  }
  if (!Array.isArray(lijst)) return [];
  return lijst.flatMap((g) => {
    const x = g as { id?: unknown; friendly_name?: unknown; members?: unknown };
    if (typeof x.id !== 'number' || !Array.isArray(x.members)) return [];
    const leden = x.members.map((m) => (m as { ieee_address?: unknown })?.ieee_address).filter((a): a is string => typeof a === 'string' && /^0x[0-9a-f]{16}$/i.test(a));
    return [{ id: x.id, naam: typeof x.friendly_name === 'string' ? x.friendly_name : `Groep ${x.id}`, leden: [...new Set(leden)] }];
  });
}

/** Een gebeurtenis van een spraakopdracht, zoals Home Assistant hem stuurt (besluit 150). */
export interface SpraakEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

/** Iets dat Home Assistant teruggeeft op een vraag zonder dat er iets verandert, of null. */
export type HaAntwoord = Readonly<Record<string, unknown>> | null;

/** Een lopende spraakopdracht: geluid erin, klaar, of stoppen. */
export interface Gesprek {
  readonly send: (pcm: Uint8Array) => void;
  readonly end: () => void;
  readonly stop: () => void;
}

/** Hoe lang een opdracht aan een AI-taak mag zijn (besluit 148). */
/** Het brein (besluit 213) stuurt de situatie en het gesprek mee: dan is 6000 te krap. */
export const AI_TASK_MAX = 12_000;

/** Een veld in het antwoord van een AI-taak: altijd tekst. */
export interface AiTaskField {
  readonly description: string;
  readonly required?: boolean;
}
