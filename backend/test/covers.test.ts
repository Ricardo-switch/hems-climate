/**
 * Schermen bedienen (besluit 121): alleen schermen uit het huis, een stand
 * alleen met terugmelding, en een grens op het tempo.
 */

import { describe, expect, it } from 'vitest';

import { CoverSwitch, parseCoverRequest } from '../src/web/covers.js';
import type { HouseDevice, HouseReport } from '../src/web/house.js';

function scherm(id: string, terugmelding: boolean): HouseDevice {
  return { id, naam: id, haNaam: id, soort: 'screen', stand: 'open', aan: false, helderheidPct: null, positiePct: terugmelding ? 100 : null, actuatorId: null, zone: null, groepen: [], dimbaar: false, kleurtemp: false, meting: null, klimaat: null, meetKamer: false, scherm: { terugmelding, standKiezen: terugmelding } };
}

const house = {
  etages: [{ id: 'bg', naam: 'Begane grond', ruimtes: [{ id: 'woonkamer', apparaten: [scherm('cover.screen', true), scherm('cover.zonnescherm', false)] }] }],
} as unknown as HouseReport;

function opzet(perMinute = 30) {
  const calls: [string, string, Record<string, unknown>][] = [];
  const sw = new CoverSwitch({ house: () => house, call: async (service, id, data) => void calls.push([service, id, data]), perMinute, now: () => 0 });
  return { sw, calls };
}

describe('schermen bedienen (besluit 121)', () => {
  it('leest alleen een scherm, een actie en bij een stand een getal', () => {
    expect(parseCoverRequest({ id: 'cover.screen', actie: 'stand', standPct: 40 })).toEqual({ ok: true, request: { id: 'cover.screen', actie: 'stand', standPct: 40 } });
    for (const fout of [null, [], { id: 'light.hal', actie: 'open' }, { id: 'cover.screen', actie: 'toggle' }, { id: 'cover.screen', actie: 'stand' }, { id: 'cover.screen', actie: 'stand', standPct: 101 }, { id: 'cover.screen', actie: 'open', standPct: 10 }]) {
      expect(parseCoverRequest(fout).ok, JSON.stringify(fout)).toBe(false);
    }
  });

  it('stuurt open, dicht, stop en een stand naar Home Assistant', async () => {
    const { sw, calls } = opzet();
    expect(await sw.move({ id: 'cover.screen', actie: 'dicht' })).toEqual({ ok: true });
    expect(await sw.move({ id: 'cover.screen', actie: 'stand', standPct: 30 })).toEqual({ ok: true });
    expect(await sw.move({ id: 'cover.zonnescherm', actie: 'stop' })).toEqual({ ok: true });
    expect(calls).toEqual([
      ['close_cover', 'cover.screen', {}],
      ['set_cover_position', 'cover.screen', { position: 30 }],
      ['stop_cover', 'cover.zonnescherm', {}],
    ]);
  });

  it('geeft een scherm zonder terugmelding (RTS) geen stand, en kent alleen schermen uit het huis', async () => {
    const { sw, calls } = opzet();
    expect(await sw.move({ id: 'cover.zonnescherm', actie: 'stand', standPct: 50 })).toMatchObject({ ok: false, status: 400 });
    expect(await sw.move({ id: 'cover.garagedeur', actie: 'open' })).toMatchObject({ ok: false, status: 404 });
    expect(calls).toEqual([]);
  });

  it('houdt een grens op het tempo', async () => {
    const { sw } = opzet(2);
    await sw.move({ id: 'cover.screen', actie: 'open' });
    await sw.move({ id: 'cover.screen', actie: 'stop' });
    expect(await sw.move({ id: 'cover.screen', actie: 'dicht' })).toMatchObject({ ok: false, status: 429 });
  });
});
