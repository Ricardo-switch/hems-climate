/*
 * Het voorbeeldhuis (besluit 237): een verzonnen huis met alles erin, op een
 * nagemaakt Home Assistant, achter `voorbeeld/` in de app. Dit bewaakt dat het
 * huis een geldige configuratie is, dat het nagemaakte Home Assistant doet wat
 * de dienst vraagt (en alleen in het geheugen), en dat de dienst het voorbeeld
 * doorgeeft met dezelfde controles als elders.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';

import { relevantEntities } from '../src/adapters/homeassistant/mapping.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { moment } from '../src/voorbeeld/dag.js';
import { VOORBEELD_SITE, staten } from '../src/voorbeeld/huis.js';
import { NepHa } from '../src/voorbeeld/nep-ha.js';
import { WebServer } from '../src/web/server.js';
import type { Voorbeeld } from '../src/web/voorbeeld.js';

const NU = Date.UTC(2026, 6, 15, 10, 40);

describe('het voorbeeldhuis (besluit 237)', () => {
  it('is een geldige configuratie, en elke entiteit die de regeling leest bestaat', () => {
    const uit = parseSiteConfig(JSON.parse(JSON.stringify(VOORBEELD_SITE)), { knownStrategies: defaultStrategies().ids });
    expect(uit.ok, JSON.stringify(uit.ok ? null : uit.problems)).toBe(true);
    if (!uit.ok) return;
    const ids = new Set(staten({ minuut: 760, seizoen: 'zomer' }, new Map(), NU).map((s) => s.entity_id));
    const ontbreekt = [...relevantEntities(uit.config)].filter((id) => !ids.has(id));
    expect(ontbreekt).toEqual([]);
  });

  it('heeft geen namen van echte mensen, en geen adres of sleutel van een huis', () => {
    const tekst = JSON.stringify(VOORBEELD_SITE);
    expect(tekst).not.toMatch(/ricardo|cornelissen|saskia|dini|matts|mylan/i);
    expect(VOORBEELD_SITE.occupancy.map((o) => o.ref)).toEqual(['person.sam', 'person.noa']);
  });

  it('volgt de dag: op zon koelen en laden, \'s avonds voedt de batterij het huis', () => {
    const middag = moment({ minuut: 760, seizoen: 'zomer' });
    expect(middag).toMatchObject({ koelt: true, autoLaadt: true, droger: true });
    expect(middag.zonW).toBeGreaterThan(3500);
    const avond = moment({ minuut: 1340, seizoen: 'zomer' });
    expect(avond.zonW).toBe(0);
    expect(avond.batterijW).toBeLessThan(0);
    const winter = moment({ minuut: 450, seizoen: 'winter' });
    expect(winter).toMatchObject({ warmt: true, licht: false, koelt: false });
  });
});

describe('het nagemaakte Home Assistant (besluit 237)', () => {
  const klok = { minuut: 760, seizoen: 'zomer' as const };

  it('volgt de klok: andere standen op een ander moment', () => {
    let nu: { minuut: number; seizoen: 'zomer' | 'winter' } = klok;
    const ha = new NepHa({ klok: () => nu, nu: () => NU });
    const stand = (id: string) => ha.standen.find((s) => s.entity_id === id)!;
    expect(stand('climate.air_conditioning_woonkamer').state).toBe('cool');
    expect(Number(stand('sensor.omvormer_vermogen').state)).toBeGreaterThan(3500);
    nu = { minuut: 450, seizoen: 'winter' };
    ha.ververs();
    expect(stand('climate.beneden').attributes['hvac_action']).toBe('heating');
    expect(stand('sensor.omvormer_vermogen').state).toBe('0');
  });

  it('spreekt het protocol: aanmelden, standen, bedienen en meterstanden', async () => {
    const ha = new NepHa({ klok: () => klok, nu: () => NU });
    const poort = await ha.start();
    const ws = new WebSocket(`ws://127.0.0.1:${poort}/api/websocket`);
    const berichten: Record<string, unknown>[] = [];
    const wacht = (f: (b: Record<string, unknown>) => boolean) =>
      new Promise<Record<string, unknown>>((ok) => {
        const kijk = () => {
          const b = berichten.find(f);
          if (b) ok(b);
          else setTimeout(kijk, 10);
        };
        kijk();
      });
    ws.addEventListener('message', (e) => berichten.push(JSON.parse(String(e.data)) as Record<string, unknown>));
    await wacht((b) => b['type'] === 'auth_required');
    ws.send(JSON.stringify({ type: 'auth', access_token: 'x' }));
    await wacht((b) => b['type'] === 'auth_ok');
    ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
    ws.send(JSON.stringify({ id: 2, type: 'call_service', domain: 'light', service: 'turn_on', service_data: {}, target: { entity_id: 'light.slaapkamer' } }));
    const event = await wacht((b) => b['type'] === 'event' && (b['event'] as { data?: { entity_id?: string } }).data?.entity_id === 'light.slaapkamer');
    expect((event['event'] as { data: { new_state: { state: string } } }).data.new_state.state).toBe('on');
    ws.send(JSON.stringify({ id: 3, type: 'recorder/statistics_during_period', start_time: new Date(NU - 2 * 86_400_000).toISOString(), end_time: new Date(NU).toISOString(), statistic_ids: ['sensor.omvormer_opbrengst_totaal'], period: 'day', types: ['change'] }));
    const stat = await wacht((b) => b['id'] === 3);
    const dagen = (stat['result'] as Record<string, { change: number }[]>)['sensor.omvormer_opbrengst_totaal']!;
    expect(dagen.length).toBeGreaterThanOrEqual(2);
    expect(dagen[0]!.change).toBeGreaterThan(1);
    ws.send(JSON.stringify({ id: 4, type: 'iets/onbekends' }));
    expect(await wacht((b) => b['id'] === 4)).toMatchObject({ success: false });
    expect(ha.bediend).toEqual(['light.turn_on']);
    ws.close();
    await ha.stop();
  });
});

describe('het voorbeeld in de dienst (besluit 237)', () => {
  async function dienst() {
    const gezien: string[] = [];
    const voorbeeld = {
      verzoek: async (_req: IncomingMessage, res: ServerResponse, pad: string, zoek: string) => {
        gezien.push(pad + zoek);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      },
    } as unknown as Voorbeeld;
    const web = new WebServer({ access: { kind: 'open' }, port: 0, host: '127.0.0.1', webDir: '.', config: null, latest: () => null, voorbeeld });
    const poort = await web.start();
    return { web, gezien, basis: `http://127.0.0.1:${poort}` };
  }

  it('geeft alles onder voorbeeld/ door, ook zonder huis', async () => {
    const { web, gezien, basis } = await dienst();
    expect((await fetch(`${basis}/voorbeeld/api/huis?taal=nl`)).status).toBe(200);
    const naar = await fetch(`${basis}/voorbeeld`, { redirect: 'manual' });
    expect(naar.headers.get('location')).toBe('voorbeeld/thuis.html');
    expect(gezien).toEqual(['/api/huis?taal=nl']);
    await web.stop();
  });

  it('met de hand en witgoed mogen schrijven; eerst kreeg met de hand 405 (besluit 238)', async () => {
    type Opties = ConstructorParameters<typeof WebServer>[0];
    const hand = { hand: {}, aan: () => false, schakelaars: () => [], knoppen: () => [] } as unknown as NonNullable<Opties['hand']>;
    const witgoed = { nuStarten: async () => ({ ok: true, knop: 'button.droger_start' }), stand: () => ({ kan: true, reden: null, gestartMs: null }) } as unknown as NonNullable<Opties['witgoed']>;
    const config = { timezone: 'Europe/Amsterdam', zones: [], actuators: [], deferrables: [{ id: 'droger', name: 'Droger' }] } as unknown as NonNullable<Opties['config']>;
    const web = new WebServer({ access: { kind: 'open' }, port: 0, host: '127.0.0.1', webDir: '.', config, latest: () => null, hand, witgoed });
    const basis = `http://127.0.0.1:${await web.start()}`;
    const post = (pad: string, body: unknown) => fetch(basis + pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    // De brug staat uit: de deur antwoordt zelf, niet de muur van "leest alleen".
    expect((await post('/api/hand', { id: 'climate.x' })).status).toBe(409);
    expect((await post('/api/witgoed', { id: 'droger', start: true })).status).toBe(200);
    expect((await post('/api/witgoed', { id: 'droger' })).status).toBe(400);
    await web.stop();
  });

  it('een opdracht alleen als JSON, en van de eigen pagina', async () => {
    const { web, gezien, basis } = await dienst();
    expect((await fetch(`${basis}/voorbeeld/api/licht`, { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status).toBe(403);
    expect((await fetch(`${basis}/voorbeeld/api/licht`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: 'https://kwaad.example' } })).status).toBe(403);
    expect((await fetch(`${basis}/voorbeeld/api/licht`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status).toBe(200);
    expect(gezien).toEqual(['/api/licht']);
    await web.stop();
  });
});
