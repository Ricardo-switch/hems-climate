/**
 * Het logboek van gevoel en toelichting (besluit 84): alleen vaste woorden,
 * alleen bekende zones, met een grens op het tempo.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FeedbackLog } from '../src/web/feedback.js';

const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true });
});

async function log(extra: { now?: () => number; perTenMinutes?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hems-gevoel-'));
  cleanup.push(dir);
  return { dir, log: new FeedbackLog({ logDir: dir, zoneIds: ['woonkamer', 'zolder'], ...extra }) };
}

describe('gevoel en toelichting (besluit 84)', () => {
  it('legt een gevoel en een toelichting vast, met tijd en zone', async () => {
    let t = 1_000;
    const { dir, log: l } = await log({ now: () => t });
    expect(await l.add({ zoneId: 'woonkamer', gevoel: 'te_koud' })).toEqual({
      ok: true,
      record: { t: 1_000, zoneId: 'woonkamer', gevoel: 'te_koud' },
    });
    t = 2_000;
    await l.add({ zoneId: 'zolder', toelichting: 'raam_open' });
    const lines = (await readFile(join(dir, 'gevoel.ndjson'), 'utf-8')).trim().split('\n');
    expect(lines.map((x) => JSON.parse(x))).toEqual([
      { t: 1_000, zoneId: 'woonkamer', gevoel: 'te_koud' },
      { t: 2_000, zoneId: 'zolder', toelichting: 'raam_open' },
    ]);
    expect((await l.since(1_500)).map((r) => r.zoneId)).toEqual(['zolder']);
  });

  it('neemt alleen de bekende velden over', async () => {
    const { dir, log: l } = await log();
    await l.add({ zoneId: 'woonkamer', gevoel: 'goed', naam: 'Ricardo', extra: 'x'.repeat(100) });
    const text = await readFile(join(dir, 'gevoel.ndjson'), 'utf-8');
    expect(text).not.toContain('Ricardo');
    expect(text).not.toContain('xxxx');
  });

  it('weigert onbekende zones, onbekende woorden en twijfel', async () => {
    const { log: l } = await log();
    for (const body of [
      null,
      [],
      'goed',
      { zoneId: 'kelder', gevoel: 'goed' },
      { zoneId: 'woonkamer', gevoel: 'lekker' },
      { zoneId: 'woonkamer', toelichting: 'iets anders' },
      { zoneId: 'woonkamer', gevoel: 'goed', toelichting: 'koken' },
      { zoneId: 'woonkamer' },
    ]) {
      const r = await l.add(body);
      expect(r.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('remt af bij te veel achter elkaar, en laat na tien minuten weer toe', async () => {
    let t = 0;
    const { log: l } = await log({ now: () => t, perTenMinutes: 3 });
    for (let i = 0; i < 3; i += 1) expect((await l.add({ zoneId: 'woonkamer', gevoel: 'goed' })).ok).toBe(true);
    const fourth = await l.add({ zoneId: 'woonkamer', gevoel: 'goed' });
    expect(fourth).toMatchObject({ ok: false, status: 429 });
    t = 10 * 60_000 + 1;
    expect((await l.add({ zoneId: 'woonkamer', gevoel: 'goed' })).ok).toBe(true);
  });

  it('geeft een lege lijst zolang er niets is vastgelegd', async () => {
    const { log: l } = await log();
    expect(await l.since(0)).toEqual([]);
  });
});
