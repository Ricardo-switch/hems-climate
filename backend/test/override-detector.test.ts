/**
 * De herkenner van besluit 74: een opdracht gaat uit, het apparaat doet iets,
 * en de herkenner beslist of de bewoner ingreep en tot wanneer.
 */

import { describe, expect, it } from 'vitest';

import { OverrideDetector } from '../src/adapters/override-detector.js';
import { exampleSite } from './site.js';

const at = (iso: string) => Date.parse(iso);
// Zaterdag 3 oktober 2026, 14:00 in Amsterdam.
const T0 = at('2026-10-03T12:00:00Z');
const MIN = 60_000;

const off = { action: 'off' as const, setpointC: null };
const cool21 = { action: 'cool' as const, setpointC: 21 };

describe('de herkenner (besluit 74)', () => {
  it('ziet niets als het apparaat de opdracht volgt', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    expect(d.observe('ac-zolder', cool21, T0 + 3 * MIN)).toBe('same');
    expect(d.overrides(T0 + 3 * MIN)).toEqual({});
  });

  it('begint een ingreep tot het volgende dagdeel als de bewoner het anders zet', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    expect(d.observe('ac-zolder', { action: 'cool', setpointC: 19 }, T0 + 12 * MIN)).toBe('resident');
    // De nacht begint om 22:00 in Amsterdam, 20:00 UTC.
    expect(d.overrides(T0 + 13 * MIN)).toEqual({
      'ac-zolder': { sinceMs: T0 + 12 * MIN, untilMs: at('2026-10-03T20:00:00Z') },
    });
  });

  it('ziet een storing als het apparaat de opdracht niet uitvoert, en begint dan niets', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    expect(d.observe('ac-zolder', off, T0 + 5 * MIN)).toBe('fault');
    expect(d.overrides(T0 + 5 * MIN)).toEqual({});
  });

  it('beëindigt de ingreep als de bewoner het apparaat zelf uitzet', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    d.observe('ac-zolder', { action: 'cool', setpointC: 19 }, T0 + 12 * MIN);
    d.observe('ac-zolder', off, T0 + 40 * MIN);
    expect(d.overrides(T0 + 41 * MIN)).toEqual({});
    // Daarna is er niets meer om tegen te vergelijken: de regeling begint bij de stand van de bewoner.
    expect(d.observe('ac-zolder', off, T0 + 42 * MIN)).toBe('same');
  });

  it('laat de ingreep aflopen op de eindtijd, en bij teruggeven', () => {
    const d = new OverrideDetector(exampleSite);
    d.takeOver('ac-woonkamer', 'oneHour', T0);
    expect(Object.keys(d.overrides(T0 + 59 * MIN))).toEqual(['ac-woonkamer']);
    expect(d.overrides(T0 + 60 * MIN)).toEqual({});

    d.takeOver('ac-woonkamer', 'untilReturned', T0);
    expect(d.overrides(T0 + 24 * 60 * MIN)['ac-woonkamer']?.untilMs).toBeNull();
    d.giveBack('ac-woonkamer');
    expect(d.overrides(T0 + 24 * 60 * MIN)).toEqual({});
  });

  it('houdt het begin vast als de bewoner later kiest hoe lang', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    d.observe('ac-zolder', { action: 'cool', setpointC: 19 }, T0 + 12 * MIN);
    const o = d.takeOver('ac-zolder', 'oneHour', T0 + 15 * MIN);
    expect(o).toEqual({ sinceMs: T0 + 12 * MIN, untilMs: T0 + 75 * MIN });
  });

  it('overleeft een herstart', () => {
    const d = new OverrideDetector(exampleSite);
    d.recordCommand('ac-zolder', cool21, off, T0);
    d.takeOver('ac-woonkamer', 'tonight', T0);
    const saved = JSON.parse(JSON.stringify(d.snapshot()));

    const again = new OverrideDetector(exampleSite);
    again.restore(saved);
    expect(again.overrides(T0 + MIN)).toEqual(d.overrides(T0 + MIN));
    expect(again.observe('ac-zolder', { action: 'heat', setpointC: 21 }, T0 + 10 * MIN)).toBe('resident');
  });
});
