/*
 * Het voorbeeldhuis vanuit de dienst (besluit 237).
 *
 * Alles onder `voorbeeld/` gaat naar een eigen proces (voorbeeld/start.ts): de
 * gewone app, op een nagemaakt Home Assistant met een verzonnen huis. Dat proces
 * start pas als iemand het voorbeeld opent, en stopt na een half uur zonder
 * bezoek of als de bezoeker Terug kiest; alles wat er gezet is, is dan weg.
 *
 * De dienst geeft de verzoeken door zoals ze binnenkomen, nadat hij zelf de
 * inlog en de herkomst heeft nagekeken. Het proces luistert alleen op
 * 127.0.0.1, en het kent je eigen Home Assistant niet.
 *
 * Drie eigen vragen, voor de balk van het voorbeeld (kit/voorbeeld.js):
 *   GET  voorbeeld/api/voorbeeld            de klok en wat er al geprobeerd is
 *   POST voorbeeld/api/voorbeeld {klok}     de dagschuif
 *   POST voorbeeld/api/voorbeeld {terug}    stoppen, alles vergeten
 */

import { fork, type ChildProcess } from 'node:child_process';
import { request, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Klok, dagBegin } from '../voorbeeld/dag.js';
import { readJson, sendJson } from './http.js';

/** Hoe lang het voorbeeld blijft draaien zonder bezoek. */
const RUST_MS = 30 * 60_000;
/** Hoe lang het starten mag duren. */
const START_MS = 60_000;

/** Wat er te proberen is, en waaraan je ziet dat het gedaan is. */
export const PROBEER = [
  { id: 'lamp', pad: /^\/api\/(licht|scene)$/ },
  { id: 'droger', pad: /^\/api\/uitstel$/ },
  { id: 'avond', pad: null },
  { id: 'vraag', pad: /^\/api\/(assist|vraag)/ },
  { id: 'hand', pad: /^\/api\/hand$/ },
  { id: 'gepland', pad: /^\/api\/te-doen$/ },
] as const;

export interface VoorbeeldOpties {
  /** Het script van het proces, `dist/voorbeeld/start.js`. */
  readonly script: string;
  /** De gebouwde app, dezelfde als die van de dienst. */
  readonly webDir: string;
  readonly write?: (regel: string) => void;
}

export class Voorbeeld {
  readonly #o: VoorbeeldOpties;
  #proces: ChildProcess | null = null;
  #poort: Promise<number> | null = null;
  #klok: Klok = { minuut: 760, seizoen: 'zomer' };
  /** Wanneer de klok zo stond; hij loopt vanaf daar door. */
  #klokOp = Date.now();
  #rust: NodeJS.Timeout | null = null;
  readonly #gedaan = new Set<string>();

  constructor(opties: VoorbeeldOpties) {
    this.#o = opties;
  }

  /** Of het proces nu draait. */
  get draait(): boolean {
    return this.#proces != null;
  }

  #start(): Promise<number> {
    if (this.#poort) return this.#poort;
    this.#gedaan.clear();
    this.#poort = new Promise<number>((ok, fout) => {
      // Alleen wat het proces nodig heeft; het adres en de sleutel van je eigen Home Assistant gaan niet mee.
      const env: NodeJS.ProcessEnv = { PATH: process.env['PATH'], TZ: process.env['TZ'] ?? 'Europe/Amsterdam', NODE_ENV: process.env['NODE_ENV'], HEMS_WEB_DIR: this.#o.webDir, HEMS_COMMIT: process.env['HEMS_COMMIT'], HEMS_GEBOUWD: process.env['HEMS_GEBOUWD'], HEMS_VOORBEELD_KLOK: `${this.#klok.minuut}:${this.#klok.seizoen}` };
      const p = fork(this.#o.script, [], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      this.#proces = p;
      const grens = setTimeout(() => fout(new Error('het voorbeeld startte niet op tijd')), START_MS);
      p.stderr?.on('data', (d: Buffer) => this.#o.write?.(`voorbeeld: ${d.toString().trim()}`));
      p.on('message', (b: { klaar?: number; klok?: Klok }) => {
        if (b.klok) {
          this.#klok = b.klok;
          this.#klokOp = Date.now();
        }
        if (b.klaar) {
          clearTimeout(grens);
          ok(b.klaar);
        }
      });
      p.on('exit', () => {
        clearTimeout(grens);
        fout(new Error('het voorbeeld stopte'));
        if (this.#proces === p) {
          this.#proces = null;
          this.#poort = null;
        }
      });
    });
    this.#poort.catch(() => this.stop());
    return this.#poort;
  }

  /** Stopt het proces; wat er gezet is, is weg. */
  stop(): void {
    if (this.#rust) clearTimeout(this.#rust);
    this.#rust = null;
    this.#proces?.kill();
    this.#proces = null;
    this.#poort = null;
    this.#gedaan.clear();
    this.#klok = { minuut: 760, seizoen: 'zomer' };
    this.#klokOp = Date.now();
  }

  /** De tijd in het voorbeeld, voor de klok van de pagina. */
  get nuMs(): number {
    return dagBegin(this.#klok.seizoen, Date.now()) + this.#klok.minuut * 60_000 + (Date.now() - this.#klokOp);
  }

  #bezoek(): void {
    if (this.#rust) clearTimeout(this.#rust);
    this.#rust = setTimeout(() => this.stop(), RUST_MS);
    this.#rust.unref?.();
  }

  /** Wat er geprobeerd is, als lijst van de ids uit PROBEER. */
  get gedaan(): readonly string[] {
    return PROBEER.map((p) => p.id).filter((id) => this.#gedaan.has(id));
  }

  /**
   * Een verzoek onder `voorbeeld/`, met `pad` het deel erna (met een / ervoor).
   * De dienst heeft de inlog en de herkomst al nagekeken.
   */
  async verzoek(req: IncomingMessage, res: ServerResponse, pad: string, zoek: string): Promise<void> {
    this.#bezoek();
    if (pad === '/api/voorbeeld') return this.#eigen(req, res);
    let poort: number;
    try {
      poort = await this.#start();
    } catch (e) {
      sendJson(res, 503, { fout: `Het voorbeeldhuis start niet: ${(e as Error).message}` });
      return;
    }
    if (req.method === 'POST') {
      const p = PROBEER.find((x) => x.pad?.test(pad));
      if (p) this.#gedaan.add(p.id);
    }
    const kop: Record<string, string | string[] | undefined> = { ...req.headers, host: `127.0.0.1:${poort}` };
    // De herkomst is al nagekeken; binnen het voorbeeld is het de eigen pagina.
    if (kop['origin']) kop['origin'] = `http://127.0.0.1:${poort}`;
    delete kop['x-forwarded-host'];
    await new Promise<void>((klaar) => {
      const door = request({ host: '127.0.0.1', port: poort, path: pad + zoek, method: req.method, headers: kop }, (antwoord) => {
        const koppen = { ...antwoord.headers };
        // Een doorverwijzing binnen het voorbeeld blijft binnen het voorbeeld: relatief, net als achter Ingress.
        const naar = koppen['location'];
        if (typeof naar === 'string' && naar.startsWith('/') && !naar.startsWith('//')) koppen['location'] = naar.slice(1);
        res.writeHead(antwoord.statusCode ?? 502, koppen);
        antwoord.pipe(res);
        antwoord.on('end', klaar);
        antwoord.on('error', klaar);
      });
      door.on('error', () => {
        if (!res.headersSent) sendJson(res, 502, { fout: 'het voorbeeldhuis antwoordt niet' });
        else res.end();
        klaar();
      });
      res.on('close', () => door.destroy());
      req.pipe(door);
    });
  }

  async #eigen(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      if (this.#proces) this.#proces.send({ vraag: 'bediend' });
      sendJson(res, 200, { draait: this.draait, klok: this.#klok, nuMs: this.nuMs, gedaan: this.gedaan, probeer: PROBEER.map((p) => p.id) });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { fout: 'GET of POST' });
      return;
    }
    let body: { klok?: { minuut?: unknown; seizoen?: unknown }; terug?: unknown };
    try {
      body = ((await readJson(req)) ?? {}) as typeof body;
    } catch {
      sendJson(res, 400, { fout: 'geen JSON' });
      return;
    }
    if (body.terug === true) {
      this.stop();
      sendJson(res, 200, { ok: true });
      return;
    }
    const k = body.klok;
    const minuut = Number(k?.minuut);
    if (!k || (k.seizoen !== 'zomer' && k.seizoen !== 'winter') || !Number.isFinite(minuut) || minuut < 0 || minuut >= 1440) {
      sendJson(res, 400, { fout: 'klok: { minuut 0-1439, seizoen zomer of winter }' });
      return;
    }
    const gewenst: Klok = { minuut: Math.round(minuut), seizoen: k.seizoen };
    // Start het proces nog, dan begint het meteen op deze tijd.
    if (!this.#proces) this.#klok = gewenst;
    try {
      await this.#start();
    } catch (e) {
      sendJson(res, 503, { fout: `Het voorbeeldhuis start niet: ${(e as Error).message}` });
      return;
    }
    // Pas na het starten: een vers proces meldt eerst zijn eigen klok, en die mag de keuze niet overschrijven.
    this.#klok = gewenst;
    this.#klokOp = Date.now();
    // 's Avonds kijken telt als proberen.
    if (gewenst.seizoen === 'zomer' ? gewenst.minuut >= 19 * 60 : gewenst.minuut >= 17 * 60) this.#gedaan.add('avond');
    this.#proces?.send({ klok: gewenst });
    sendJson(res, 200, { ok: true, klok: this.#klok, nuMs: this.nuMs, gedaan: this.gedaan });
  }
}
