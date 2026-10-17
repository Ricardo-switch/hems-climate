/**
 * Een kleine websocket-server (RFC 6455), voor de microfoon (besluit 150).
 *
 * Node heeft een websocket-client (die praat met Home Assistant), maar geen
 * server, en de dienst heeft geen afhankelijkheden. Dit is precies genoeg om
 * geluid van de pagina binnen te krijgen en korte berichten terug te sturen:
 * de handdruk, tekst en binair, berichten in stukken, ping en sluiten. Geen
 * extensies (compressie) en geen subprotocollen.
 */

import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Zo groot mag één bericht van de pagina zijn: ruim een seconde geluid. */
export const MAX_BERICHT = 64 * 1024;

export interface Verbinding {
  /** Stuurt een tekstbericht, als de verbinding nog open is. */
  readonly tekst: (s: string) => void;
  /** Sluit netjes, met een code en een korte reden. */
  readonly sluit: (code?: number, reden?: string) => void;
  /** Of de verbinding nog open is. */
  readonly open: () => boolean;
}

export interface Luisteraars {
  readonly binair?: (data: Buffer) => void;
  readonly tekst?: (s: string) => void;
  readonly dicht?: () => void;
}

/** Of een verzoek een websocket wil, met een sleutel die klopt. */
export function isUpgrade(req: IncomingMessage): boolean {
  const upgrade = String(req.headers.upgrade ?? '').toLowerCase();
  const sleutel = req.headers['sec-websocket-key'];
  return upgrade === 'websocket' && typeof sleutel === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(sleutel) && req.headers['sec-websocket-version'] === '13';
}

/** De handdruk, en daarna berichten van en naar de pagina. */
export function accepteer(req: IncomingMessage, socket: Duplex, luisteraars: Luisteraars): Verbinding {
  const sleutel = String(req.headers['sec-websocket-key']);
  const accept = createHash('sha1').update(sleutel + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));

  let open = true;
  let buffer = Buffer.alloc(0);
  let stukken: Buffer[] = [];
  let stukSoort = 0;

  const frame = (opcode: number, data: Buffer) => {
    if (!open) return;
    const lengte = data.length;
    const kop = lengte < 126 ? Buffer.from([0x80 | opcode, lengte]) : lengte < 65536 ? Buffer.from([0x80 | opcode, 126, lengte >> 8, lengte & 0xff]) : (() => {
      const k = Buffer.alloc(10);
      k[0] = 0x80 | opcode;
      k[1] = 127;
      k.writeBigUInt64BE(BigInt(lengte), 2);
      return k;
    })();
    socket.write(Buffer.concat([kop, data]));
  };

  const dicht = () => {
    if (!open) return;
    open = false;
    luisteraars.dicht?.();
  };

  const sluit = (code = 1000, reden = '') => {
    if (!open) return;
    const r = Buffer.from(reden.slice(0, 100), 'utf-8');
    const d = Buffer.alloc(2 + r.length);
    d.writeUInt16BE(code, 0);
    r.copy(d, 2);
    frame(0x8, d);
    dicht();
    socket.end();
  };

  const verwerk = () => {
    while (buffer.length >= 2) {
      const b0 = buffer[0]!;
      const b1 = buffer[1]!;
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const gemaskeerd = (b1 & 0x80) !== 0;
      let lengte = b1 & 0x7f;
      let pos = 2;
      if (lengte === 126) {
        if (buffer.length < 4) return;
        lengte = buffer.readUInt16BE(2);
        pos = 4;
      } else if (lengte === 127) {
        if (buffer.length < 10) return;
        const groot = buffer.readBigUInt64BE(2);
        if (groot > BigInt(MAX_BERICHT)) return sluit(1009, 'te groot');
        lengte = Number(groot);
        pos = 10;
      }
      // Een pagina maskeert altijd (RFC 6455, 5.1); zonder masker is het geen browser.
      if (!gemaskeerd) return sluit(1002, 'zonder masker');
      if (lengte > MAX_BERICHT) return sluit(1009, 'te groot');
      if (buffer.length < pos + 4 + lengte) return;
      const masker = buffer.subarray(pos, pos + 4);
      const data = Buffer.from(buffer.subarray(pos + 4, pos + 4 + lengte));
      for (let i = 0; i < data.length; i++) data[i] = data[i]! ^ masker[i % 4]!;
      buffer = buffer.subarray(pos + 4 + lengte);

      if (opcode === 0x8) return sluit(1000);
      if (opcode === 0x9) {
        frame(0xa, data);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x0) {
        if (!stukSoort) return sluit(1002, 'vervolg zonder begin');
        stukken.push(data);
      } else if (opcode === 0x1 || opcode === 0x2) {
        if (stukSoort) return sluit(1002, 'nieuw bericht midden in een ander');
        stukSoort = opcode;
        stukken = [data];
      } else return sluit(1003, 'onbekende soort');
      if (stukken.reduce((n, s) => n + s.length, 0) > MAX_BERICHT) return sluit(1009, 'te groot');
      if (!fin) continue;
      const geheel = Buffer.concat(stukken);
      const soort = stukSoort;
      stukSoort = 0;
      stukken = [];
      if (soort === 0x2) luisteraars.binair?.(geheel);
      else luisteraars.tekst?.(geheel.toString('utf-8'));
    }
  };

  socket.on('data', (d: Buffer) => {
    buffer = Buffer.concat([buffer, d]);
    if (buffer.length > MAX_BERICHT * 2 + 16) return sluit(1009, 'te groot');
    verwerk();
  });
  socket.on('close', dicht);
  // De pagina sloot zijn kant: dan deze ook.
  socket.on('end', () => {
    dicht();
    socket.end();
  });
  socket.on('error', dicht);

  return {
    tekst: (s) => frame(0x1, Buffer.from(s, 'utf-8')),
    sluit,
    open: () => open,
  };
}

/** Weigert een upgrade met een gewone http-status, en sluit de verbinding. */
export function weiger(socket: Duplex, status: number, reden: string): void {
  socket.write(`HTTP/1.1 ${status} ${reden}\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\n${reden}\n`);
  socket.destroy();
}
