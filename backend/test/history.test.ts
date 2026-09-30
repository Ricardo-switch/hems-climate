/**
 * Besluit 52: de ruwe historie komt van de dienst zelf, niet van de recorder.
 *
 * De maat is of de replay het kan lezen. Een historie die er goed uitziet maar
 * waar `loadHistory` op struikelt, of waar de cursor op het beginmoment niets
 * weet, is een map vol tekst en geen dataset.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { HaEntityState } from '../src/adapters/homeassistant/client.js';
import { Historieschrijver, naarRij } from '../src/adapters/homeassistant/history.js';
import { Cursor, loadHistory } from '../src/replay/reconstruct.js';
import { schrijfDataset, stikHistorie } from '../src/replay/stitch.js';

const opruimen: string[] = [];
afterEach(async () => {
  for (const d of opruimen.splice(0)) await rm(d, { recursive: true, force: true });
});

async function map(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-historie-'));
  opruimen.push(d);
  return d;
}

const DAG1 = Date.UTC(2026, 9, 1, 10, 0, 0);
const DAG2 = Date.UTC(2026, 9, 2, 10, 0, 0);

function toestand(
  entity_id: string,
  state: string,
  atMs: number,
  attributes: Record<string, unknown> = {},
): HaEntityState {
  const stamp = new Date(atMs).toISOString();
  return { entity_id, state, attributes, last_changed: stamp, last_updated: stamp };
}

describe('een toestand als datasetregel', () => {
  it('houdt alleen de attributen die de replay leest', () => {
    const r = naarRij(
      toestand('climate.air_conditioning_zolder', 'cool', DAG1, {
        temperature: 21,
        hvac_action: 'cooling',
        friendly_name: 'Airco zolder',
        supported_features: 393,
      }),
    );
    expect(r).toEqual({
      t: DAG1,
      e: 'climate.air_conditioning_zolder',
      s: 'cool',
      a: { temperature: 21, hvac_action: 'cooling' },
    });
  });

  it('laat de attributen weg als er geen enkele toe doet', () => {
    const r = naarRij(toestand('sensor.p1_meter_power', '-812', DAG1, { unit: 'W' }));
    expect(r).toEqual({ t: DAG1, e: 'sensor.p1_meter_power', s: '-812' });
  });
});

describe('de schrijver', () => {
  it('schrijft in volgorde, in het bestand van de dag van ontvangst', async () => {
    const d = await map();
    let nu = DAG2;
    const w = new Historieschrijver(d, () => nu, (e) => {
      throw e;
    });

    // Een momentopname op dag 2 met een rij van dag 1: die hoort in het bestand
    // van dag 2, want daar kwam hij binnen.
    w.vastleggen([toestand('person.iemand', 'home', DAG1)]);
    for (let i = 0; i < 20; i += 1) {
      w.vastleggen([toestand('sensor.p1_meter_power', String(-i), DAG2 + i * 1000)]);
    }
    await w.gereed();

    const regels = (await readFile(join(d, 'history-2026-10-02.ndjson'), 'utf-8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { e: string; s: string });
    expect(regels).toHaveLength(21);
    expect(regels[0]!.e).toBe('person.iemand');
    expect(regels.slice(1).map((r) => r.s)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(-i)),
    );

    nu = DAG2 + 86_400_000;
    w.vastleggen([toestand('sensor.p1_meter_power', '5', nu)]);
    await w.gereed();
    expect(await readFile(join(d, 'history-2026-10-03.ndjson'), 'utf-8')).toContain('"s":"5"');
  });

  it('blijft schrijven na een fout', async () => {
    // Een bestand waar de map had moeten staan: de eerste schrijfpoging faalt.
    const d = await map();
    const geblokkeerd = join(d, 'bezet');
    await writeFile(geblokkeerd, 'geen map', 'utf-8');
    const fouten: unknown[] = [];
    const w = new Historieschrijver(geblokkeerd, () => DAG1, (e) => fouten.push(e));

    w.vastleggen([toestand('sensor.p1_meter_power', '1', DAG1)]);
    w.vastleggen([toestand('sensor.p1_meter_power', '2', DAG1)]);
    await w.gereed();

    // Beide mislukken, maar de rij loopt door en elke fout wordt gemeld in
    // plaats van de dienst om te trekken.
    expect(fouten).toHaveLength(2);
  });
});

describe('samenvoegen tot een replay-dataset', () => {
  async function tweeDagen(d: string): Promise<void> {
    const regel = (r: object): string => `${JSON.stringify(r)}\n`;
    await writeFile(
      join(d, 'history-2026-10-01.ndjson'),
      // Momentopname bij het verbinden: de persoon is al een week thuis.
      regel({ t: DAG1 - 7 * 86_400_000, e: 'person.iemand', s: 'home' }) +
        regel({ t: DAG1, e: 'sensor.p1_meter_power', s: '-500' }) +
        regel({ t: DAG1 + 60_000, e: 'sensor.p1_meter_power', s: '-450' }) +
        '{"t":' /* afgekapte regel, container gestopt */ +
        '\n',
      'utf-8',
    );
    await writeFile(
      join(d, 'history-2026-10-02.ndjson'),
      // Herverbonden: dezelfde persoon, dezelfde tijd — een dubbeling.
      regel({ t: DAG1 - 7 * 86_400_000, e: 'person.iemand', s: 'home' }) +
        regel({ t: DAG2, e: 'sensor.p1_meter_power', s: '120' }) +
        regel({ t: DAG2 + 5_000, e: 'person.iemand', s: 'not_home' }),
      'utf-8',
    );
  }

  it('sorteert, haalt dubbelingen weg en slaat kapotte regels over', async () => {
    const d = await map();
    await tweeDagen(d);
    const { rows } = await stikHistorie(d, DAG2);

    expect(rows.map((r) => `${r.e}=${r.s}`)).toEqual([
      'person.iemand=home',
      'sensor.p1_meter_power=-500',
      'sensor.p1_meter_power=-450',
      'sensor.p1_meter_power=120',
      'person.iemand=not_home',
    ]);
  });

  it('laat het venster beginnen waar elke entiteit iets weet', async () => {
    // Niet een week eerder, bij de oude rij van de persoon: dan zou de replay
    // een week afspelen zonder netmeting.
    const d = await map();
    await tweeDagen(d);
    const { meta } = await stikHistorie(d, DAG2);

    expect(meta.fromMs).toBe(DAG1);
    expect(meta.toMs).toBe(DAG2 + 5_000);
    expect(meta.entities).toEqual(['person.iemand', 'sensor.p1_meter_power']);
  });

  it('levert een bestand dat de replay leest, en dat op het beginmoment compleet is', async () => {
    const d = await map();
    await tweeDagen(d);
    const pad = join(d, 'uit.ndjson.gz');
    await schrijfDataset(pad, await stikHistorie(d, DAG2));

    const history = await loadHistory(pad);
    const cursor = new Cursor(history);
    cursor.advanceTo(history.meta.fromMs);
    expect(cursor.state('person.iemand')).toBe('home');
    expect(cursor.number('sensor.p1_meter_power')).toBe(-500);

    cursor.advanceTo(history.meta.toMs);
    expect(cursor.state('person.iemand')).toBe('not_home');
  });
});
