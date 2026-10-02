/**
 * De regels achter een ingreep van de bewoner (besluit 74): tot wanneer hij
 * duurt, en wanneer een afwijking een ingreep is.
 */

import { describe, expect, it } from 'vitest';

import { classifyDeviation, overrideEndMs } from '../src/core/override.js';
import type { LastCommand } from '../src/core/override.js';
import { exampleSite } from './site.js';

const at = (iso: string) => Date.parse(iso);

describe('tot wanneer een ingreep duurt', () => {
  // Zaterdag 3 oktober 2026, 14:20 in Amsterdam (zomertijd, UTC+2).
  const now = at('2026-10-03T12:20:00Z');

  it('een uur', () => {
    expect(overrideEndMs('oneHour', now, exampleSite)).toBe(now + 3_600_000);
  });

  it('tot vanavond: tot de nacht begint', () => {
    expect(exampleSite.schedule.nightFromHour).toBe(22);
    expect(overrideEndMs('tonight', now, exampleSite)).toBe(at('2026-10-03T20:00:00Z'));
  });

  it('tot ik hem teruggeef: geen eindtijd', () => {
    expect(overrideEndMs('untilReturned', now, exampleSite)).toBeNull();
  });

  it('zonder keuze: tot het volgende dagdeel', () => {
    expect(overrideEndMs('nextDayPart', now, exampleSite)).toBe(at('2026-10-03T20:00:00Z'));
    // Om 23:00 is het volgende dagdeel het voorverwarmen van morgen, om 06:00.
    expect(overrideEndMs('nextDayPart', at('2026-10-03T21:00:00Z'), exampleSite)).toBe(
      at('2026-10-04T04:00:00Z'),
    );
    // Om 07:00 begint de dag om 08:00.
    expect(overrideEndMs('nextDayPart', at('2026-10-04T05:00:00Z'), exampleSite)).toBe(
      at('2026-10-04T06:00:00Z'),
    );
  });

  it('rekent in de tijdzone van het huis, ook in de winter', () => {
    // 1 december, 14:20 in Amsterdam is 13:20 UTC; de nacht begint om 21:00 UTC.
    expect(overrideEndMs('tonight', at('2026-12-01T13:20:00Z'), exampleSite)).toBe(
      at('2026-12-01T21:00:00Z'),
    );
  });
});

describe('een afwijking herkennen', () => {
  const now = at('2026-10-03T12:20:00Z');
  const last: LastCommand = {
    wanted: { action: 'cool', setpointC: 21 },
    before: { action: 'off', setpointC: 25 },
    atMs: now - 10 * 60_000,
  };

  it('ziet niets als het apparaat staat zoals gevraagd, op afronding na', () => {
    expect(classifyDeviation(last, { action: 'cool', setpointC: 21 }, now)).toBe('same');
    expect(classifyDeviation(last, { action: 'cool', setpointC: 21.5 }, now)).toBe('same');
  });

  it('wacht even na een opdracht', () => {
    const fresh = { ...last, atMs: now - 30_000 };
    expect(classifyDeviation(fresh, { action: 'off', setpointC: 25 }, now)).toBe('pending');
  });

  it('ziet een storing als het apparaat blijft staan waar het stond', () => {
    expect(classifyDeviation(last, { action: 'off', setpointC: 25 }, now)).toBe('fault');
  });

  it('ziet een ingreep als het apparaat ergens anders staat', () => {
    expect(classifyDeviation(last, { action: 'cool', setpointC: 19 }, now)).toBe('resident');
    expect(classifyDeviation(last, { action: 'heat', setpointC: 21 }, now)).toBe('resident');
  });

  it('kan zonder eigen opdracht niets toeschrijven', () => {
    expect(classifyDeviation(null, { action: 'cool', setpointC: 19 }, now)).toBe('same');
  });

  it('let bij uit niet op het setpoint', () => {
    const off: LastCommand = { ...last, wanted: { action: 'off', setpointC: null } };
    expect(classifyDeviation(off, { action: 'off', setpointC: 18 }, now)).toBe('same');
  });
});
