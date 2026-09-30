/**
 * De export is pas goed wanneer je hem terug kunt zetten.
 *
 * Een tar-kop met een verkeerde checksum of een vergeten vulblok levert een
 * bestand op dat er prima uitziet en dat geen enkel programma opent. Daarom
 * pakt deze test het archief werkelijk uit — met de `tar` van het systeem, niet
 * met onze eigen code — en legt de inhoud naast het origineel.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { exportInfo, schrijfExport } from '../src/web/export.js';

const uitvoeren = promisify(execFile);
const opruimen: string[] = [];
afterEach(async () => {
  for (const d of opruimen.splice(0)) await rm(d, { recursive: true, force: true });
});

async function logboekMet(dagen: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hems-export-'));
  opruimen.push(dir);
  for (const [dag, inhoud] of Object.entries(dagen)) {
    await writeFile(join(dir, `decisions-${dag}.ndjson`), inhoud, 'utf-8');
  }
  // Rommel die er niet in hoort: findLogFiles filtert op de naamvorm.
  await writeFile(join(dir, 'aantekening.txt'), 'geen logboek', 'utf-8');
  return dir;
}

/** Een antwoord dat naar een bestand schrijft in plaats van naar een socket. */
function nepAntwoord(pad: string) {
  const stream = createWriteStream(pad);
  const koppen: Record<string, string> = {};
  let status = 0;
  return {
    res: Object.assign(stream, {
      writeHead(code: number, h: Record<string, string>) {
        status = code;
        Object.assign(koppen, h);
        return this;
      },
    }) as never,
    get status() {
      return status;
    },
    get koppen() {
      return koppen;
    },
  };
}

describe('de dataset exporteren', () => {
  it('telt alleen de dagbestanden en hun omvang', async () => {
    const dir = await logboekMet({
      '2026-09-05': 'a\nb\n',
      '2026-09-06': 'c\n',
    });
    const info = await exportInfo(dir);
    expect(info.bestanden).toBe(2);
    expect(info.bytes).toBe(6);
    expect(info.eerste).toBe('decisions-2026-09-05.ndjson');
    expect(info.laatste).toBe('decisions-2026-09-06.ndjson');
  });

  it('klaagt niet over een map die er niet is', async () => {
    // De dienst kan starten voordat er één regel is geschreven.
    const info = await exportInfo(join(tmpdir(), 'bestaat-echt-niet-hems'));
    expect(info).toEqual({ bestanden: 0, bytes: 0, eerste: null, laatste: null });
  });

  it('levert een archief dat het systeem kan uitpakken, met de inhoud intact', async () => {
    // Groot genoeg om over meerdere tar-blokken te lopen: een bestand van
    // precies 512 bytes zou een vulfout kunnen verbergen.
    const groot = 'x'.repeat(1500) + '\n';
    const dir = await logboekMet({
      '2026-09-05': '{"t":1}\n{"t":2}\n',
      '2026-09-06': groot,
    });

    const tgz = join(dir, 'uit.tar.gz');
    const doel = nepAntwoord(tgz);
    await schrijfExport(dir, doel.res, new Date('2026-09-30T12:00:00Z'));

    expect(doel.status).toBe(200);
    expect(doel.koppen['content-disposition']).toContain('hems-logboek-2026-09-30.tar.gz');

    const uit = join(dir, 'uitgepakt');
    await mkdir(uit);
    // Relatieve paden, met de map als werkmap: GNU tar leest een pad dat met
    // "C:" begint als `host:pad` en probeert verbinding te maken.
    await uitvoeren('tar', ['-xzf', 'uit.tar.gz', '-C', 'uitgepakt'], { cwd: dir });

    const map = join(uit, 'hems-logboek-2026-09-30');
    expect((await readdir(map)).sort()).toEqual([
      'decisions-2026-09-05.ndjson',
      'decisions-2026-09-06.ndjson',
    ]);
    expect(await readFile(join(map, 'decisions-2026-09-05.ndjson'), 'utf-8')).toBe(
      '{"t":1}\n{"t":2}\n',
    );
    expect(await readFile(join(map, 'decisions-2026-09-06.ndjson'), 'utf-8')).toBe(groot);
  });

  it('neemt de ruwe historie mee, en telt op de knop alleen dagen (besluit 52)', async () => {
    const dir = await logboekMet({ '2026-09-05': 'a\n' });
    await writeFile(join(dir, 'history-2026-09-05.ndjson'), '{"t":1,"e":"x","s":"1"}\n', 'utf-8');

    const info = await exportInfo(dir);
    // Eén dag, al zijn er twee bestanden: zo staat het op de knop.
    expect(info.bestanden).toBe(1);
    // Maar de omvang is wat je downloadt, dus alles.
    expect(info.bytes).toBe(2 + 24);

    const tgz = join(dir, 'uit.tar.gz');
    await schrijfExport(dir, nepAntwoord(tgz).res, new Date('2026-09-30T12:00:00Z'));
    const uit = join(dir, 'uitgepakt');
    await mkdir(uit);
    await uitvoeren('tar', ['-xzf', 'uit.tar.gz', '-C', 'uitgepakt'], { cwd: dir });
    expect((await readdir(join(uit, 'hems-logboek-2026-09-30'))).sort()).toEqual([
      'decisions-2026-09-05.ndjson',
      'history-2026-09-05.ndjson',
    ]);
  });

  it('laat wat geen dagbestand is buiten het archief', async () => {
    const dir = await logboekMet({ '2026-09-05': 'a\n' });
    const tgz = join(dir, 'uit.tar.gz');
    await schrijfExport(dir, nepAntwoord(tgz).res, new Date('2026-09-30T12:00:00Z'));

    const uit = join(dir, 'uitgepakt');
    await mkdir(uit);
    await uitvoeren('tar', ['-xzf', 'uit.tar.gz', '-C', 'uitgepakt'], { cwd: dir });
    const map = join(uit, 'hems-logboek-2026-09-30');
    expect(await readdir(map)).toEqual(['decisions-2026-09-05.ndjson']);
  });
});
