/**
 * Praten met je stem (besluit 150): wat Home Assistant zegt in berichten voor
 * de pagina, de spraakassistenten bij Functies, en de kleine websocket-server.
 */

import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { spraakKeuzes } from '../src/web/functies.js';
import { foutInWoorden, vertaal } from '../src/web/luisterpost.js';
import { accepteer, MAX_BERICHT } from '../src/web/websocket.js';

const opruimen: (() => void)[] = [];
afterEach(() => {
  for (const f of opruimen.splice(0)) f();
});

describe('wat Home Assistant zegt, voor de pagina', () => {
  it('vertaalt de gebeurtenissen van een spraakopdracht', () => {
    expect(vertaal({ type: 'run-start', data: {} })).toEqual({ soort: 'klaar' });
    expect(vertaal({ type: 'wake_word-end', data: { wake_word_output: { wake_word_id: 'he_huis' } } })).toEqual({ soort: 'wakker' });
    expect(vertaal({ type: 'wake_word-end', data: {} })).toBeNull();
    expect(vertaal({ type: 'stt-vad-start', data: {} })).toEqual({ soort: 'praat' });
    expect(vertaal({ type: 'stt-vad-end', data: {} })).toEqual({ soort: 'stil' });
    expect(vertaal({ type: 'stt-end', data: { stt_output: { text: ' Hé huis, licht aan ' } } })).toEqual({ soort: 'tekst', tekst: 'Hé huis, licht aan' });
    expect(vertaal({ type: 'stt-end', data: { stt_output: { text: 'x'.repeat(500) } } })).toEqual({ soort: 'tekst', tekst: 'x'.repeat(200) });
    expect(vertaal({ type: 'run-end', data: {} })).toEqual({ soort: 'einde' });
    // Geen wekwoord binnen de tijd, of niets verstaan: geen fout, gewoon verder.
    expect(vertaal({ type: 'error', data: { code: 'wake-word-timeout' } })).toEqual({ soort: 'einde' });
    expect(vertaal({ type: 'error', data: { code: 'stt-no-text-recognized' } })).toEqual({ soort: 'tekst', tekst: '' });
    expect(vertaal({ type: 'intent-start', data: {} })).toBeNull();
  });

  it('zegt een fout in gewone woorden', () => {
    expect(foutInWoorden('wake-engine-missing')).toContain('geen wekwoord');
    expect(foutInWoorden('', 'Pipeline not found: id=x')).toContain('bestaat niet meer');
    expect(foutInWoorden('stt-provider-missing')).toContain('spraak naar tekst');
    expect(foutInWoorden('iets')).toBe('Home Assistant kon het niet uitschrijven.');
  });
});

describe('de spraakassistenten bij Functies', () => {
  it('neemt naam, wekwoord en spraak naar tekst over, en welke voorop staat', () => {
    expect(
      spraakKeuzes({
        preferred_pipeline: 'a',
        pipelines: [
          { id: 'a', name: 'Home Assistant', language: 'nl', stt_engine: null, wake_word_entity: null, wake_word_id: null },
          { id: 'b', name: 'SunArc', language: 'nl', stt_engine: 'stt.faster_whisper', stt_language: 'nl', wake_word_entity: 'wake_word.openwakeword', wake_word_id: 'he_huis' },
          { name: 'zonder id' },
        ],
      }),
    ).toEqual([
      { id: 'a', naam: 'Home Assistant', wekwoord: null, spraakNaarTekst: false, taal: 'nl', voorkeur: true },
      { id: 'b', naam: 'SunArc', wekwoord: 'he_huis', spraakNaarTekst: true, taal: 'nl', voorkeur: false },
    ]);
    expect(spraakKeuzes(null)).toEqual([]);
  });
});

describe('de kleine websocket-server', () => {
  async function server(): Promise<{ port: number; ontvangen: Buffer[] }> {
    const ontvangen: Buffer[] = [];
    const s = createServer();
    s.on('upgrade', (req, socket) => accepteer(req, socket, { binair: (d) => void ontvangen.push(d) }));
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
    opruimen.push(() => s.close());
    return { port: (s.address() as AddressInfo).port, ontvangen };
  }

  /** Doet de handdruk met een rauwe socket, en stuurt daarna wat de test wil. */
  function rauw(port: number, frames: Buffer[]): Promise<Buffer> {
    return new Promise((ok) => {
      const sock = connect(port, '127.0.0.1');
      opruimen.push(() => sock.destroy());
      let alles = Buffer.alloc(0);
      sock.on('data', (d) => {
        alles = Buffer.concat([alles, d]);
        if (alles.includes('\r\n\r\n') && frames.length) for (const f of frames.splice(0)) sock.write(f);
      });
      sock.on('close', () => ok(alles));
      setTimeout(() => sock.destroy(), 400);
      sock.write('GET /api/luister HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    });
  }

  const gemaskeerd = (opcode: number, data: Buffer) => {
    const masker = Buffer.from([1, 2, 3, 4]);
    const kop = data.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | data.length]) : Buffer.from([0x80 | opcode, 0x80 | 126, data.length >> 8, data.length & 0xff]);
    return Buffer.concat([kop, masker, Buffer.from(data.map((b, i) => b ^ masker[i % 4]!))]);
  };

  it('geeft het juiste antwoord op de handdruk en ontvangt binaire berichten', async () => {
    const { port, ontvangen } = await server();
    const antwoord = await rauw(port, [gemaskeerd(0x2, Buffer.from([5, 6, 7, 8]))]);
    // Het voorbeeld uit RFC 6455, paragraaf 1.3.
    expect(antwoord.toString('latin1')).toContain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    expect(ontvangen.map((b) => [...b])).toEqual([[5, 6, 7, 8]]);
  });

  it('sluit bij een bericht zonder masker of een te groot bericht', async () => {
    const { port, ontvangen } = await server();
    const zonderMasker = await rauw(port, [Buffer.from([0x82, 2, 1, 2])]);
    expect([...zonderMasker.subarray(zonderMasker.indexOf('\r\n\r\n') + 4)].slice(0, 4)).toEqual([0x88, expect.any(Number), 0x03, 0xea]);
    const groot = Buffer.alloc(10);
    groot[0] = 0x82;
    groot[1] = 0x80 | 127;
    groot.writeBigUInt64BE(BigInt(MAX_BERICHT + 1), 2);
    const teGroot = await rauw(port, [groot]);
    expect([...teGroot.subarray(teGroot.indexOf('\r\n\r\n') + 4)].slice(2, 4)).toEqual([0x03, 0xf1]);
    expect(ontvangen).toEqual([]);
  });
});
