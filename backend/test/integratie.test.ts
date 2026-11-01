/**
 * De integratie neerzetten vanuit de add-on (besluit 184): alleen de eigen
 * map, bijhouden met de add-on, en afblijven van een map via HACS.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Integratie, MERKJE } from '../src/web/integratie.js';

let dir: string;
let bron: string;
let config: string;
const doel = () => join(config, 'custom_components', 'sunarc');
const oud = () => join(config, 'custom_components', 'smart_climate');
const versie = async (map: string, v: string) => {
  await mkdir(map, { recursive: true });
  await writeFile(join(map, 'manifest.json'), JSON.stringify({ domain: 'sunarc', version: v }), 'utf-8');
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'integratie-'));
  bron = join(dir, 'image', 'sunarc');
  config = join(dir, 'homeassistant');
  await versie(bron, '0.58.0');
  await writeFile(join(bron, '__init__.py'), '# de integratie\n', 'utf-8');
  await mkdir(config);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('de integratie neerzetten vanuit de add-on (besluit 184)', () => {
  it('zet hem neer met een merkje, en zegt welke versie er staat', async () => {
    const i = new Integratie(bron, config);
    expect(await i.stand()).toEqual({ kan: true, staat: 'nee', versie: null, nieuw: '0.58.0', oud: 'nee' });
    const uit = await i.zetNeer();
    expect(uit).toEqual({ ok: true, stand: { kan: true, staat: 'add-on', versie: '0.58.0', nieuw: '0.58.0', oud: 'nee' } });
    expect(await readFile(join(doel(), '__init__.py'), 'utf-8')).toBe('# de integratie\n');
    expect((await readFile(join(doel(), MERKJE), 'utf-8')).trim()).toBe('0.58.0');
  });

  it('werkt hem bij met een update van de add-on, en haalt wat weg is weg', async () => {
    const i = new Integratie(bron, config);
    await i.zetNeer();
    await writeFile(join(doel(), 'oud.py'), '# weg\n', 'utf-8');
    expect(await i.bijwerken()).toBe(false);
    await versie(bron, '0.59.0');
    expect(await i.bijwerken()).toBe(true);
    expect((await i.stand()).versie).toBe('0.59.0');
    await expect(stat(join(doel(), 'oud.py'))).rejects.toThrow();
  });

  it('zet de oude naam (smart_climate) van de add-on over naar sunarc, bij het starten (2 november 2026)', async () => {
    await versie(oud(), '1.2.0');
    await writeFile(join(oud(), MERKJE), '1.2.0\n', 'utf-8');
    const i = new Integratie(bron, config);
    expect(await i.stand()).toMatchObject({ staat: 'nee', oud: 'add-on' });
    expect(await i.bijwerken()).toBe(true);
    expect(await i.stand()).toMatchObject({ staat: 'add-on', versie: '0.58.0', oud: 'nee' });
    await expect(stat(oud())).rejects.toThrow();
    // Daarna gewoon zoals altijd: niets te doen zonder nieuwe versie.
    expect(await i.bijwerken()).toBe(false);
  });

  it('laat de oude naam via HACS staan, en zet er niets naast', async () => {
    await versie(oud(), '1.2.0');
    const i = new Integratie(bron, config);
    expect(await i.stand()).toMatchObject({ staat: 'anders', versie: '1.2.0', oud: 'anders' });
    expect(await i.bijwerken()).toBe(false);
    expect((await i.zetNeer()).ok).toBe(false);
    await expect(stat(doel())).rejects.toThrow();
    expect((await stat(oud())).isDirectory()).toBe(true);
  });

  it('blijft af van een integratie via HACS of met de hand', async () => {
    await versie(doel(), '0.57.0');
    const i = new Integratie(bron, config);
    expect((await i.stand()).staat).toBe('anders');
    expect(await i.zetNeer()).toEqual({ ok: false, reden: 'de integratie staat er al, via HACS of met de hand; de add-on blijft ervan af' });
    expect(await i.bijwerken()).toBe(false);
    expect((await i.stand()).versie).toBe('0.57.0');
  });

  it('kan niets zonder de configuratie van Home Assistant (buiten de add-on)', async () => {
    const i = new Integratie(bron, join(dir, 'bestaat-niet'));
    expect((await i.stand()).kan).toBe(false);
    expect((await i.zetNeer()).ok).toBe(false);
  });
});
