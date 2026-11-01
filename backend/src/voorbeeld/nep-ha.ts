/*
 * Een nagemaakt Home Assistant voor het voorbeeldhuis (besluit 237).
 *
 * Het spreekt hetzelfde websocket-protocol als Home Assistant, voor zover de
 * dienst het gebruikt: aanmelden, de standen, meldingen van veranderingen, de
 * registers, de meterstanden, de lijsten en het weer. Wat de dienst bedient
 * (een lamp, een screen, klimaat met de hand) verandert alleen hier, in het
 * geheugen: er is geen verbinding met een echt Home Assistant, en die kan er
 * ook niet komen, want dit proces kent geen adres en geen sleutel daarvan.
 *
 * Alles komt uit huis.ts en dag.ts: de standen op het moment van de klok, met
 * daaroverheen wat de bezoeker zelf zette.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { HaEntityState } from '../adapters/homeassistant/client.js';
import { accepteer, isUpgrade, type Verbinding } from '../web/websocket.js';
import { type Klok, dagBegin, moment, uurOpWelkeDag } from './dag.js';
import { APPARATEN, ENTITEITEN, ETAGES, RUIMTES, type Ingrepen, staten } from './huis.js';

/** Een klein grijs beeld voor de deurbel: geen camera, wel een plaatje. */
const BEELD = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDCooorQAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z',
  'base64',
);

/** De meters van Opbrengst: wat het huis afnam, terugleverde en opwekte. */
const ENERGIE = ['sensor.p1_afname_totaal', 'sensor.p1_teruglevering_totaal', 'sensor.omvormer_opbrengst_totaal'] as const;

interface Lijstje {
  readonly naam: string;
  readonly items: { uid: string; summary: string; status: 'needs_action' | 'completed' }[];
}

export interface NepHaOpties {
  /** De klok van het voorbeeld, die de bezoeker met de dagschuif verzet. */
  readonly klok: () => Klok;
  /** Nu, in epoch-ms; in het voorbeeldproces de verzette tijd. */
  readonly nu?: () => number;
}

export class NepHa {
  readonly #opties: NepHaOpties;
  readonly #server: Server;
  readonly #ingrepen: Ingrepen = new Map();
  readonly #volgers = new Set<{ verbinding: Verbinding; id: number }>();
  readonly #weer = new Set<{ verbinding: Verbinding; id: number }>();
  #standen = new Map<string, HaEntityState>();
  readonly #lijsten = new Map<string, Lijstje>([
    ['todo.boodschappen', { naam: 'Boodschappen', items: [{ uid: '1', summary: 'Melk', status: 'needs_action' }, { uid: '2', summary: 'Brood', status: 'needs_action' }, { uid: '3', summary: 'Appels', status: 'completed' }] }],
  ]);
  /** Wat er via de dienst bediend is, voor Probeer dit. */
  readonly bediend: string[] = [];

  constructor(opties: NepHaOpties) {
    this.#opties = opties;
    this.#server = createServer((req, res) => this.#http(req, res));
    this.#server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => this.#websocket(req, socket, head));
    this.ververs();
  }

  #nu(): number {
    return this.#opties.nu?.() ?? Date.now();
  }

  /** Luistert op een vrije poort van 127.0.0.1 en geeft die terug. */
  async start(): Promise<number> {
    await new Promise<void>((ok) => this.#server.listen(0, '127.0.0.1', () => ok()));
    const a = this.#server.address();
    return typeof a === 'object' && a != null ? a.port : 0;
  }

  stop(): Promise<void> {
    return new Promise((ok) => this.#server.close(() => ok()));
  }

  /** Alle standen van nu. */
  get standen(): readonly HaEntityState[] {
    return [...this.#standen.values()];
  }

  /** Rekent de standen opnieuw uit (na een andere klok of een ingreep) en meldt wat veranderde. */
  ververs(): void {
    const nieuw = new Map<string, HaEntityState>();
    for (const s of staten(this.#opties.klok(), this.#ingrepen, this.#nu())) nieuw.set(s.entity_id, s);
    for (const [id, l] of this.#lijsten) {
      const open = l.items.filter((i) => i.status === 'needs_action').length;
      const tijd = new Date(this.#nu()).toISOString();
      nieuw.set(id, { entity_id: id, state: String(open), attributes: { friendly_name: l.naam, supported_features: 15 }, last_changed: tijd, last_updated: tijd });
    }
    const oud = this.#standen;
    this.#standen = nieuw;
    for (const [id, s] of nieuw) {
      const was = oud.get(id);
      if (was && was.state === s.state && JSON.stringify(was.attributes) === JSON.stringify(s.attributes)) {
        // Niets veranderd: de oude tijd van veranderen houden.
        nieuw.set(id, was);
        continue;
      }
      for (const v of this.#volgers) {
        v.verbinding.tekst(JSON.stringify({ id: v.id, type: 'event', event: { event_type: 'state_changed', data: { entity_id: id, old_state: was ?? null, new_state: s }, time_fired: s.last_updated } }));
      }
    }
  }

  /** Vergeet alles wat de bezoeker zette. */
  terug(): void {
    this.#ingrepen.clear();
    this.bediend.length = 0;
    this.ververs();
  }

  /* ---- http ---- */

  #http(req: IncomingMessage, res: ServerResponse): void {
    const pad = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pad === '/api/' || pad === '/api') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"message":"API running."}');
      return;
    }
    if (pad.startsWith('/api/camera_proxy/')) {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': BEELD.length });
      res.end(BEELD);
      return;
    }
    if (pad.startsWith('/api/camera_proxy_stream/')) {
      res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame' });
      const kop = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${BEELD.length}\r\n\r\n`);
      const tik = setInterval(() => res.write(Buffer.concat([kop, BEELD, Buffer.from('\r\n')])), 500);
      req.on('close', () => clearInterval(tik));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"message":"Niet in het voorbeeld"}');
  }

  /* ---- websocket ---- */

  #websocket(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/websocket' || !isUpgrade(req)) {
      socket.destroy();
      return;
    }
    if (head.length > 0) socket.unshift(head);
    let aangemeld = false;
    const verbinding: Verbinding = accepteer(req, socket, {
      tekst: (t) => {
        let bericht: Record<string, unknown>;
        try {
          bericht = JSON.parse(t) as Record<string, unknown>;
        } catch {
          return;
        }
        if (!aangemeld) {
          if (bericht['type'] === 'auth') {
            aangemeld = true;
            verbinding.tekst(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
          }
          return;
        }
        const id = Number(bericht['id']);
        const antwoord = (result: unknown) => verbinding.tekst(JSON.stringify({ id, type: 'result', success: true, result }));
        const fout = (message: string) => verbinding.tekst(JSON.stringify({ id, type: 'result', success: false, error: { code: 'not_found', message } }));
        try {
          const uit = this.#opdracht(bericht, verbinding, id);
          if (uit === NIET) fout(`${String(bericht['type'])} kent het voorbeeld niet`);
          else antwoord(uit);
        } catch (e) {
          fout((e as Error).message);
        }
      },
      dicht: () => {
        for (const v of [...this.#volgers, ...this.#weer]) if (v.verbinding === verbinding) {
          this.#volgers.delete(v);
          this.#weer.delete(v);
        }
      },
    });
    verbinding.tekst(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
  }

  #opdracht(b: Record<string, unknown>, verbinding: Verbinding, id: number): unknown {
    switch (b['type']) {
      case 'get_states':
        return this.standen;
      case 'subscribe_events':
        this.#volgers.add({ verbinding, id });
        return null;
      case 'unsubscribe_events':
        return null;
      case 'config/floor_registry/list':
        return ETAGES;
      case 'config/area_registry/list':
        return RUIMTES;
      case 'config/device_registry/list':
        return APPARATEN;
      case 'config/entity_registry/list':
        return [...ENTITEITEN, ...[...this.#lijsten.keys()].map((e) => ({ entity_id: e, device_id: null, platform: 'shopping_list' }))];
      case 'config/auth/list':
        return [
          { id: 'voorbeeld-sam', name: 'Sam', is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] },
          { id: 'voorbeeld-noa', name: 'Noa', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
        ];
      case 'auth/current_user':
        return { id: 'voorbeeld-sam', name: 'Sam', is_owner: true, is_admin: true };
      case 'tts/engine/list':
        return { providers: [] };
      case 'tts/engine/voices':
        return { voices: [] };
      case 'assist_pipeline/pipeline/list':
        return { pipelines: [], preferred_pipeline: null };
      case 'energy/get_prefs':
        return {
          energy_sources: [
            { type: 'grid', flow_from: [{ stat_energy_from: ENERGIE[0] }], flow_to: [{ stat_energy_to: ENERGIE[1] }], cost_adjustment_day: 0 },
            { type: 'solar', stat_energy_from: ENERGIE[2] },
          ],
          device_consumption: [],
        };
      case 'recorder/list_statistic_ids':
        return [
          { statistic_id: ENERGIE[0], name: 'P1-meter afname totaal', has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh', source: 'recorder' },
          { statistic_id: ENERGIE[1], name: 'P1-meter teruglevering totaal', has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh', source: 'recorder' },
          { statistic_id: ENERGIE[2], name: 'Omvormer opbrengst totaal', has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh', source: 'recorder' },
        ];
      case 'recorder/statistics_during_period':
        return this.#statistiek(b);
      case 'history/history_during_period':
        return {};
      case 'weather/subscribe_forecast':
        this.#weer.add({ verbinding, id });
        setTimeout(() => this.#stuurWeer(verbinding, id), 10).unref?.();
        return null;
      case 'call_service':
        return this.#dienst(b);
      default:
        return NIET;
    }
  }

  /* ---- bedienen ---- */

  #zet(id: string, state: string | null, attributes: Record<string, unknown> = {}): void {
    const nu = this.#standen.get(id);
    const was = this.#ingrepen.get(id);
    this.#ingrepen.set(id, { state: state ?? was?.state ?? nu?.state ?? 'unknown', attributes: { ...(was?.attributes ?? {}), ...attributes } });
  }

  #dienst(b: Record<string, unknown>): unknown {
    const domein = String(b['domain']);
    const dienst = String(b['service']);
    const data = (b['service_data'] ?? {}) as Record<string, unknown>;
    const doel = (b['target'] ?? {}) as { entity_id?: string | string[] };
    const ids = [doel.entity_id ?? data['entity_id'] ?? []].flat().map(String);
    this.bediend.push(`${domein}.${dienst}`);
    const leeg = { context: { id: 'voorbeeld' } };

    if (domein === 'todo') return this.#lijst(dienst, ids, data);
    for (const id of ids) {
      if (domein === 'light' || domein === 'switch') {
        const aan = dienst === 'toggle' ? this.#standen.get(id)?.state !== 'on' : dienst === 'turn_on';
        const { entity_id: _e, ...rest } = data;
        this.#zet(id, aan ? 'on' : 'off', aan ? { brightness: 190, ...rest } : {});
      } else if (domein === 'scene' && dienst === 'turn_on') {
        for (const lamp of (this.#standen.get(id)?.attributes['entity_id'] as string[] | undefined) ?? []) this.#zet(lamp, 'on', { brightness: id.endsWith('avond') ? 110 : 254, color_temp_kelvin: id.endsWith('avond') ? 2400 : 4000 });
      } else if (domein === 'cover') {
        const stand = dienst === 'open_cover' ? 100 : dienst === 'close_cover' ? 0 : dienst === 'set_cover_position' ? Number(data['position']) : null;
        if (stand != null && Number.isFinite(stand)) this.#zet(id, stand === 0 ? 'closed' : 'open', { current_position: stand });
      } else if (domein === 'climate') {
        if (dienst === 'set_hvac_mode') {
          const m = String(data['hvac_mode']);
          this.#zet(id, m, { hvac_action: m === 'heat' ? 'heating' : m === 'cool' ? 'cooling' : 'off' });
        } else if (dienst === 'set_temperature') this.#zet(id, null, { temperature: Number(data['temperature']) });
        else if (dienst === 'turn_off') this.#zet(id, 'off', { hvac_action: 'off' });
        else if (dienst === 'turn_on') this.#zet(id, 'heat', { hvac_action: 'heating' });
      } else if (domein === 'button' && dienst === 'press' && id.startsWith('button.droger')) {
        // De droger start: hij draait, en op afstand starten gaat uit.
        this.#zet('sensor.droger_status', 'Run');
        this.#zet('binary_sensor.droger_op_afstand', 'off');
      } else if (domein === 'input_number' && dienst === 'set_value') {
        this.#zet(id, String(data['value']));
      } else if (domein === 'input_select' && dienst === 'select_option') {
        this.#zet(id, String(data['option']));
      }
    }
    this.ververs();
    return leeg;
  }

  #lijst(dienst: string, ids: readonly string[], data: Record<string, unknown>): unknown {
    if (dienst === 'get_items') {
      return { context: {}, response: Object.fromEntries(ids.map((id) => [id, { items: this.#lijsten.get(id)?.items ?? [] }])) };
    }
    for (const id of ids) {
      const l = this.#lijsten.get(id);
      if (!l) continue;
      if (dienst === 'add_item') l.items.push({ uid: String(Date.now()), summary: String(data['item'] ?? ''), status: 'needs_action' });
      if (dienst === 'update_item') {
        const i = l.items.find((x) => x.uid === data['item'] || x.summary === data['item']);
        if (i && (data['status'] === 'completed' || data['status'] === 'needs_action')) i.status = data['status'];
      }
      if (dienst === 'remove_completed_items') l.items.splice(0, l.items.length, ...l.items.filter((x) => x.status !== 'completed'));
    }
    this.ververs();
    return { context: {} };
  }

  /* ---- meterstanden en weer ---- */

  #statistiek(b: Record<string, unknown>): Record<string, unknown[]> {
    const begin = Date.parse(String(b['start_time']));
    const eind = b['end_time'] ? Date.parse(String(b['end_time'])) : this.#nu();
    const periode = String(b['period'] ?? 'hour');
    const stap = periode === '5minute' ? 300_000 : 3_600_000;
    const uit: Record<string, unknown[]> = {};
    for (const id of (b['statistic_ids'] as string[] | undefined) ?? []) {
      const rijen: { start: number; end: number; change?: number; sum?: number; mean?: number }[] = [];
      let som = 0;
      for (let t = Math.floor(begin / stap) * stap; t < Math.min(eind, this.#nu()); t += stap) {
        const plek = new Date(t + 3_600_000);
        const dagVanJaar = Math.floor((plek.getTime() - Date.UTC(plek.getUTCFullYear(), 0, 1)) / 86_400_000);
        const { zonWh, verbruikWh } = uurOpWelkeDag(dagVanJaar, plek.getUTCHours());
        const zelf = Math.min(zonWh, verbruikWh) * 0.85;
        const kWh = id === ENERGIE[0] ? (verbruikWh - zelf) / 1000 : id === ENERGIE[1] ? (zonWh - zelf) / 1000 : id === ENERGIE[2] ? zonWh / 1000 : 0;
        const deel = stap / 3_600_000;
        som += kWh * deel;
        const mean = id === 'sensor.omvormer_vermogen' ? zonWh : id === 'sensor.p1_vermogen' ? verbruikWh - zonWh : undefined;
        rijen.push({ start: t, end: t + stap, change: kWh * deel, sum: som, ...(mean != null ? { mean } : {}) });
      }
      uit[id] = periode === 'day' || periode === 'week' || periode === 'month' ? bundel(rijen, periode) : rijen;
    }
    return uit;
  }

  #stuurWeer(verbinding: Verbinding, id: number): void {
    const klok = this.#opties.klok();
    const dag0 = dagBegin(klok.seizoen, this.#nu());
    const forecast = Array.from({ length: 6 }, (_, d) => {
      const m = moment({ minuut: 900, seizoen: klok.seizoen });
      const zon = d % 3 !== 2;
      return {
        datetime: new Date(dag0 + d * 86_400_000 + 12 * 3_600_000).toISOString(),
        condition: zon ? (klok.seizoen === 'winter' ? 'partlycloudy' : 'sunny') : 'cloudy',
        temperature: Math.round(m.buitenC + (d % 2)),
        templow: Math.round(m.buitenC - (klok.seizoen === 'winter' ? 5 : 9)),
        precipitation: zon ? 0 : 2.4,
        precipitation_probability: zon ? 10 : 70,
      };
    });
    verbinding.tekst(JSON.stringify({ id, type: 'event', event: { type: 'daily', forecast } }));
  }
}

const NIET = Symbol('niet');

/** Uren samenvoegen tot dagen, weken of maanden, zoals de recorder dat doet. */
function bundel(rijen: readonly { start: number; change?: number; sum?: number }[], periode: string): unknown[] {
  const sleutel = (t: number) => {
    const d = new Date(t + 3_600_000);
    if (periode === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 3_600_000;
    const dag = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3_600_000;
    return periode === 'week' ? dag - ((d.getUTCDay() + 6) % 7) * 86_400_000 : dag;
  };
  const groepen = new Map<number, { start: number; change: number; sum: number }>();
  for (const r of rijen) {
    const k = sleutel(r.start);
    const g = groepen.get(k) ?? { start: k, change: 0, sum: 0 };
    g.change += r.change ?? 0;
    g.sum = r.sum ?? g.sum;
    groepen.set(k, g);
  }
  return [...groepen.values()];
}
