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
import { HistoryWriter, toRow } from '../src/adapters/homeassistant/history.js';
import { Cursor, loadHistory } from '../src/replay/reconstruct.js';
import { writeDataset, stitchHistory } from '../src/replay/stitch.js';

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

async function map(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-historie-'));
  cleanup.push(d);
  return d;
}

const DAY1 = Date.UTC(2026, 9, 1, 10, 0, 0);
const DAY2 = Date.UTC(2026, 9, 2, 10, 0, 0);

function entityState(
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
    const r = toRow(
      entityState('climate.air_conditioning_zolder', 'cool', DAY1, {
        temperature: 21,
        hvac_action: 'cooling',
        friendly_name: 'Airco zolder',
        supported_features: 393,
      }),
    );
    expect(r).toEqual({
      t: DAY1,
      e: 'climate.air_conditioning_zolder',
      s: 'cool',
      a: { temperature: 21, hvac_action: 'cooling' },
    });
  });

  it('laat de attributen weg als er geen enkele toe doet', () => {
    const r = toRow(entityState('sensor.p1_meter_power', '-812', DAY1, { unit: 'W' }));
    expect(r).toEqual({ t: DAY1, e: 'sensor.p1_meter_power', s: '-812' });
  });
});

describe('de schrijver', () => {
  it('schrijft in volgorde, in het bestand van de dag van ontvangst', async () => {
    const d = await map();
    let now = DAY2;
    const w = new HistoryWriter(d, () => now, (e) => {
      throw e;
    });

    // Een momentopname op dag 2 met een rij van dag 1: die hoort in het bestand
    // van dag 2, want daar kwam hij binnen.
    w.record([entityState('person.iemand', 'home', DAY1)]);
    for (let i = 0; i < 20; i += 1) {
      w.record([entityState('sensor.p1_meter_power', String(-i), DAY2 + i * 1000)]);
    }
    await w.settled();

    const lines = (await readFile(join(d, 'history-2026-10-02.ndjson'), 'utf-8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { e: string; s: string });
    expect(lines).toHaveLength(21);
    expect(lines[0]!.e).toBe('person.iemand');
    expect(lines.slice(1).map((r) => r.s)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(-i)),
    );

    now = DAY2 + 86_400_000;
    w.record([entityState('sensor.p1_meter_power', '5', now)]);
    await w.settled();
    expect(await readFile(join(d, 'history-2026-10-03.ndjson'), 'utf-8')).toContain('"s":"5"');
  });

  it('blijft schrijven na een fout', async () => {
    // Een bestand waar de map had moeten staan: de eerste schrijfpoging faalt.
    const d = await map();
    const blocked = join(d, 'bezet');
    await writeFile(blocked, 'geen map', 'utf-8');
    const errors: unknown[] = [];
    const w = new HistoryWriter(blocked, () => DAY1, (e) => errors.push(e));

    w.record([entityState('sensor.p1_meter_power', '1', DAY1)]);
    w.record([entityState('sensor.p1_meter_power', '2', DAY1)]);
    await w.settled();

    // Beide mislukken, maar de rij loopt door en elke fout wordt gemeld in
    // plaats van de dienst om te trekken.
    expect(errors).toHaveLength(2);
  });
});

describe('samenvoegen tot een replay-dataset', () => {
  async function twoDays(d: string): Promise<void> {
    const line = (r: object): string => `${JSON.stringify(r)}\n`;
    await writeFile(
      join(d, 'history-2026-10-01.ndjson'),
      // Momentopname bij het verbinden: de persoon is al een week thuis.
      line({ t: DAY1 - 7 * 86_400_000, e: 'person.iemand', s: 'home' }) +
        line({ t: DAY1, e: 'sensor.p1_meter_power', s: '-500' }) +
        line({ t: DAY1 + 60_000, e: 'sensor.p1_meter_power', s: '-450' }) +
        '{"t":' /* afgekapte regel, container gestopt */ +
        '\n',
      'utf-8',
    );
    await writeFile(
      join(d, 'history-2026-10-02.ndjson'),
      // Herverbonden: dezelfde persoon, dezelfde tijd — een dubbeling.
      line({ t: DAY1 - 7 * 86_400_000, e: 'person.iemand', s: 'home' }) +
        line({ t: DAY2, e: 'sensor.p1_meter_power', s: '120' }) +
        line({ t: DAY2 + 5_000, e: 'person.iemand', s: 'not_home' }),
      'utf-8',
    );
  }

  it('sorteert, haalt dubbelingen weg en slaat kapotte regels over', async () => {
    const d = await map();
    await twoDays(d);
    const { rows } = await stitchHistory(d, DAY2);

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
    await twoDays(d);
    const { meta } = await stitchHistory(d, DAY2);

    expect(meta.fromMs).toBe(DAY1);
    expect(meta.toMs).toBe(DAY2 + 5_000);
    expect(meta.entities).toEqual(['person.iemand', 'sensor.p1_meter_power']);
  });

  it('levert een bestand dat de replay leest, en dat op het beginmoment compleet is', async () => {
    const d = await map();
    await twoDays(d);
    const path = join(d, 'uit.ndjson.gz');
    await writeDataset(path, await stitchHistory(d, DAY2));

    const history = await loadHistory(path);
    const cursor = new Cursor(history);
    cursor.advanceTo(history.meta.fromMs);
    expect(cursor.state('person.iemand')).toBe('home');
    expect(cursor.number('sensor.p1_meter_power')).toBe(-500);

    cursor.advanceTo(history.meta.toMs);
    expect(cursor.state('person.iemand')).toBe('not_home');
  });
});
