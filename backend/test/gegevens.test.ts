/**
 * Back-up, herstel en opnieuw beginnen, en de export zonder namen (besluit 151).
 *
 * De back-up is pas goed als hij terug kan: daarom maakt deze test er een,
 * gooit alles weg, en zet hem terug in een lege map. En de export pas als hij
 * uit te pakken is, met de `tar` van het systeem, zonder namen erin.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { BACKUP_DIR, BACKUPS_BEWAREN, beginOpnieuw, bewaarBackup, bewaardeBackups, leesBackup, maakBackup, zetTerug } from '../src/web/gegevens.js';
import { entiteitenLijst, vervanger, writeExport } from '../src/web/export.js';
import { GEEN_BEWONERS, herken, namenVoorExport, personenUit } from '../src/web/bewoners.js';

const execute = promisify(execFile);
const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

async function map(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'hems-gegevens-'));
  cleanup.push(dir);
  return dir;
}

/** Een logmap zoals op de NAS: instellingen, geleerd, het logboek, en wat moet blijven. */
async function huis(): Promise<{ log: string; sites: string; config: string }> {
  const log = await map();
  const sites = join(log, 'sites');
  await mkdir(sites);
  const config = join(sites, 'thuis.json');
  await writeFile(config, JSON.stringify({ id: 'thuis' }), 'utf-8');
  await writeFile(join(log, 'indeling.json'), JSON.stringify({ versie: 1, kamers: [{ id: 'woonkamer' }] }), 'utf-8');
  await writeFile(join(log, 'comfort.json'), JSON.stringify({ versie: 1, kamers: {} }), 'utf-8');
  await writeFile(join(log, 'zon-kwartieren.json'), JSON.stringify({ dagen: {} }), 'utf-8');
  await writeFile(join(log, 'uitstel.json'), '{}', 'utf-8');
  await writeFile(join(log, 'decisions-2026-10-01.ndjson'), '{"t":1}\n', 'utf-8');
  await writeFile(join(log, 'history-2026-09-01.ndjson.gz'), gzipSync('{"t":0}\n'));
  await writeFile(join(log, 'runs.ndjson'), '{}\n', 'utf-8');
  await writeFile(join(log, 'sessies.json'), '{}', 'utf-8');
  await writeFile(join(log, 'sleutel-assistent.txt'), 'geheim', 'utf-8');
  await mkdir(join(log, 'scene-plaatjes'));
  await writeFile(join(log, 'scene-plaatjes', 'relax.png'), 'png');
  return { log, sites, config };
}

describe('een back-up (besluit 151)', () => {
  it('bewaart instellingen, wat het huis leerde en de configuratie, maar niet het logboek', async () => {
    const h = await huis();
    const b = await maakBackup(h.log, h.config, '0.30.0', new Date('2026-10-17T08:00:00Z'));
    expect(b).toMatchObject({ soort: 'smart-climate-back-up', versie: 1, app: '0.30.0', gemaakt: '2026-10-17T08:00:00.000Z' });
    expect(Object.keys(b.bestanden).sort()).toEqual(['comfort.json', 'indeling.json', 'zon-kwartieren.json']);
    expect(b.configuratie).toEqual({ naam: 'thuis.json', inhoud: { id: 'thuis' } });
  });

  it('gaat terug in een lege map, en een configuratie alleen als er geen is', async () => {
    const h = await huis();
    const b = JSON.parse(JSON.stringify(await maakBackup(h.log, h.config, '0.30.0'))) as unknown;
    const gelezen = leesBackup(b);
    if (!gelezen.ok) throw new Error(gelezen.reden);

    const leeg = await map();
    const uit = await zetTerug(leeg, gelezen.backup, { configPad: null, sitesDir: join(leeg, 'sites') });
    expect(uit.configuratie).toBe('neergezet');
    expect(uit.bestanden.sort()).toEqual(['comfort.json', 'indeling.json', 'zon-kwartieren.json']);
    expect(JSON.parse(await readFile(join(leeg, 'indeling.json'), 'utf-8'))).toEqual({ versie: 1, kamers: [{ id: 'woonkamer' }] });
    expect(JSON.parse(await readFile(join(leeg, 'sites', 'thuis.json'), 'utf-8'))).toEqual({ id: 'thuis' });

    // Staat er al een configuratie, dan blijft die van dit huis.
    await writeFile(h.config, JSON.stringify({ id: 'ander' }), 'utf-8');
    expect((await zetTerug(h.log, gelezen.backup, { configPad: h.config, sitesDir: h.sites })).configuratie).toBe('bleef');
    expect(JSON.parse(await readFile(h.config, 'utf-8'))).toEqual({ id: 'ander' });

    // In de add-on maakte de app hem zelf: dan komt die uit de back-up ervoor in de plaats, en nooit twee naast elkaar.
    const zelf = join(h.sites, 'mijn-huis.json');
    await rm(h.config);
    await writeFile(zelf, JSON.stringify({ id: 'ontdekt' }), 'utf-8');
    expect((await zetTerug(h.log, gelezen.backup, { configPad: zelf, sitesDir: h.sites, vervang: true })).configuratie).toBe('vervangen');
    expect((await readdir(h.sites)).sort()).toEqual(['thuis.json']);
    expect(JSON.parse(await readFile(join(h.sites, 'thuis.json'), 'utf-8'))).toEqual({ id: 'thuis' });
  });

  it('weigert wat geen back-up is, slaat onbekende bestanden over, en toetst de configuratie', () => {
    expect(leesBackup({ soort: 'iets anders' })).toMatchObject({ ok: false });
    expect(leesBackup({ soort: 'smart-climate-back-up', versie: 2, bestanden: {} })).toMatchObject({ ok: false, reden: expect.stringContaining('nieuwere versie') });
    const r = leesBackup({ soort: 'smart-climate-back-up', versie: 1, bestanden: { 'comfort.json': {}, 'sessies.json': {}, '../etc/passwd': 'x' }, configuratie: null });
    expect(r).toMatchObject({ ok: true, overgeslagen: ['sessies.json', '../etc/passwd'] });
    expect(r.ok && Object.keys(r.backup.bestanden)).toEqual(['comfort.json']);
    expect(leesBackup({ soort: 'smart-climate-back-up', versie: 1, bestanden: {}, configuratie: { naam: '../thuis.json', inhoud: {} } })).toMatchObject({ ok: true });
    expect(leesBackup({ soort: 'smart-climate-back-up', versie: 1, bestanden: {}, configuratie: { naam: 'thuis.yaml', inhoud: {} } })).toMatchObject({ ok: false });
    expect(leesBackup({ soort: 'smart-climate-back-up', versie: 1, bestanden: {}, configuratie: { naam: 'thuis.json', inhoud: {} } }, () => 'zones ontbreekt')).toMatchObject({ ok: false, reden: expect.stringContaining('zones ontbreekt') });
  });

  it('bewaart hooguit tien back-ups in de eigen map, de nieuwste eerst', async () => {
    const h = await huis();
    const b = await maakBackup(h.log, null, '0.30.0');
    for (let i = 0; i < BACKUPS_BEWAREN + 2; i++) await bewaarBackup(h.log, b, new Date(Date.UTC(2026, 9, 1, 0, i)));
    const lijst = await bewaardeBackups(h.log);
    expect(lijst).toHaveLength(BACKUPS_BEWAREN);
    expect(lijst[0]).toBe('smart-climate-back-up-2026-10-01-00-11-00.json');
  });
});

describe('opnieuw beginnen (besluit 151)', () => {
  it('haalt instellingen, geleerd en het logboek weg, en laat back-ups, sessies, sleutel en plaatjes staan', async () => {
    const h = await huis();
    await bewaarBackup(h.log, await maakBackup(h.log, h.config, '0.30.0'));
    const weg = await beginOpnieuw(h.log, { configPad: h.config, configWeg: false });
    expect(weg).toEqual(['comfort.json', 'decisions-2026-10-01.ndjson', 'history-2026-09-01.ndjson.gz', 'indeling.json', 'runs.ndjson', 'uitstel.json', 'zon-kwartieren.json']);
    expect((await readdir(h.log)).sort()).toEqual([BACKUP_DIR, 'scene-plaatjes', 'sessies.json', 'sites', 'sleutel-assistent.txt']);
    expect(await readdir(h.sites)).toEqual(['thuis.json']);
  });

  it('haalt de configuratie alleen weg als de app hem ook maakte', async () => {
    const h = await huis();
    expect(await beginOpnieuw(h.log, { configPad: h.config, configWeg: true })).toContain('thuis.json');
    expect(await readdir(h.sites)).toEqual([]);
  });
});

describe('de export voor de analyse (besluit 151)', () => {
  const persoon = (entity_id: string, userId: string | null, naam: string) => ({ entity_id, state: 'home', attributes: { ...(userId ? { user_id: userId } : {}), friendly_name: naam }, last_changed: '', last_updated: '' });
  const personen = personenUit([persoon('person.ricardo_cornelissen', 'u-ricardo', 'Ricardo Cornelissen'), persoon('person.noor', 'u-noor', 'Noor Cornelissen'), persoon('person.oma', null, 'Oma Truus')]);

  it('noemt bewoners op volgorde, dan personen zonder account, ook zoals ze in een id staan', () => {
    const r = herken(GEEN_BEWONERS, { userId: 'u-noor', naam: 'Noor Cornelissen' }, personen, [], 0);
    if (r.soort !== 'bewoner') throw new Error('Noor hoort bewoner te worden');
    const paren = new Map(namenVoorExport(r.bewoners, personen));
    expect(paren.get('Noor Cornelissen')).toBe('Bewoner 1');
    expect(paren.get('Noor')).toBe('Bewoner 1');
    expect(paren.get('noor')).toBe('bewoner_1');
    expect(paren.get('Ricardo Cornelissen')).toBe('Bewoner 2');
    expect(paren.get('ricardo_cornelissen')).toBe('bewoner_2');
    expect(paren.get('Truus')).toBeUndefined();
    expect(paren.get('Oma Truus')).toBe('Bewoner 3');
  });

  it('vervangt namen als heel woord, de langste eerst, en haalt de ligging weg', () => {
    const v = vervanger([['Jan', 'Bewoner 1'], ['Jan de Vries', 'Bewoner 1'], ['jan', 'bewoner_1'], ['Al', 'Bewoner 2']]);
    expect(v('Jan de Vries is thuis, Jan ook, maar in Januari niet. Al is weg.')).toBe('Bewoner 1 is thuis, Bewoner 1 ook, maar in Januari niet. Al is weg.');
    expect(v('{"entity_id":"device_tracker.jan_iphone","latitude":51.4416,"longitude":-5.47e1}')).toBe('{"entity_id":"device_tracker.bewoner_1_iphone","latitude":null,"longitude":null}');
  });

  it('zegt per entiteit waar SunArc hem gebruikt', () => {
    const states = new Map([
      ['sensor.woonkamer_temperatuur', { entity_id: 'sensor.woonkamer_temperatuur', state: '20.5', attributes: { friendly_name: 'Woonkamer temperatuur', device_class: 'temperature', unit_of_measurement: '°C', latitude: 51 }, last_changed: '', last_updated: '' }],
      ['light.hal', { entity_id: 'light.hal', state: 'off', attributes: {}, last_changed: '', last_updated: '' }],
    ]);
    const lijst = entiteitenLijst(
      {
        floors: [{ floor_id: 'beneden', name: 'Begane grond' }],
        areas: [{ area_id: 'woonkamer', name: 'Woonkamer', floor_id: 'beneden' }],
        devices: [{ id: 'd1', area_id: 'woonkamer', name: 'Thermometer', manufacturer: 'SONOFF', model: 'SNZB-02' }],
        entities: [{ entity_id: 'sensor.woonkamer_temperatuur', device_id: 'd1', platform: 'zha' }],
      },
      states,
      { configuratie: { zones: [{ id: 'woonkamer', sensors: ['sensor.woonkamer_temperatuur'] }] }, 'indeling.json': { lampen: { 'sensor.woonkamer_temperatuur': true } } },
    );
    expect(lijst[1]).toEqual({
      id: 'sensor.woonkamer_temperatuur',
      naam: 'Woonkamer temperatuur',
      domein: 'sensor',
      integratie: 'zha',
      apparaat: { naam: 'Thermometer', merk: 'SONOFF', model: 'SNZB-02' },
      ruimte: 'Woonkamer',
      etage: 'Begane grond',
      soort: 'temperature',
      eenheid: '°C',
      stand: '20.5',
      uit: false,
      verborgen: false,
      categorie: null,
      gebruikt: ['configuratie.zones[0].sensors[0]', 'indeling.json.lampen.sensor.woonkamer_temperatuur'],
    });
    expect(lijst[0]).toMatchObject({ id: 'light.hal', ruimte: null, gebruikt: [] });
  });

  it('levert een archief zonder namen, met de instellingen en de entiteiten erbij', async () => {
    const log = await map();
    await writeFile(join(log, 'decisions-2026-10-16.ndjson'), '{"profile":{"id":"noor","name":"Noor"}}\n', 'utf-8');
    await writeFile(join(log, 'history-2026-10-01.ndjson.gz'), gzipSync('{"e":"person.noor","s":"home"}\n'));
    const tgz = join(log, 'uit.tar.gz');
    const stream = createWriteStream(tgz);
    const res = Object.assign(stream, { writeHead: () => res }) as never;
    await writeExport(log, res, new Date('2026-10-17T12:00:00Z'), { bestanden: { 'entiteiten.json': '[{"id":"person.noor","naam":"Noor Cornelissen"}]' }, vervang: [['Noor Cornelissen', 'Bewoner 1'], ['Noor', 'Bewoner 1'], ['noor', 'bewoner_1']] });
    await mkdir(join(log, 'uit'));
    await execute('tar', ['-xzf', 'uit.tar.gz', '-C', 'uit'], { cwd: log });
    const m = join(log, 'uit', 'hems-logboek-2026-10-17');
    expect((await readdir(m)).sort()).toEqual(['analyse', 'decisions-2026-10-16.ndjson', 'history-2026-10-01.ndjson']);
    expect(await readFile(join(m, 'decisions-2026-10-16.ndjson'), 'utf-8')).toBe('{"profile":{"id":"bewoner_1","name":"Bewoner 1"}}\n');
    expect(await readFile(join(m, 'history-2026-10-01.ndjson'), 'utf-8')).toBe('{"e":"person.bewoner_1","s":"home"}\n');
    expect(await readFile(join(m, 'analyse', 'entiteiten.json'), 'utf-8')).toBe('[{"id":"person.bewoner_1","naam":"Bewoner 1"}]');
  });
});
