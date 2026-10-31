/*
 * Een thuisbatterij nagerekend op je eigen uren (besluit 230): welke maat past,
 * hoeveel er nog tekortkwam, en wanneer de accu bijsprong.
 */
import { describe, expect, it } from 'vitest';

import { accuSom, MATEN, RENDEMENT, type AccuUur } from '../src/web/accu.js';

const TZ = 'Europe/Amsterdam';
/** Maandag 5 oktober 2026, 00:00 in Nederland (zomertijd, UTC+2). */
const START = Date.UTC(2026, 9, 4, 22, 0);

/** Elke dag hetzelfde: overdag `over` kWh naar het net (10–15 uur), 's avonds `avond` kWh van het net (18–22 uur). */
function dagen(n: number, over: number, avond: number): AccuUur[] {
  const uit: AccuUur[] = [];
  for (let d = 0; d < n; d++) {
    for (let h = 0; h < 24; h++) {
      const t = START + (d * 24 + h) * 3_600_000;
      const terug = h >= 10 && h < 15 ? over / 5 : 0;
      const af = h >= 18 && h < 22 ? avond / 4 : 0;
      uit.push({ t, af, terug });
    }
  }
  return uit;
}

describe('een thuisbatterij op je eigen uren (besluit 230)', () => {
  it('kiest de kleinste maat die vrijwel alles doet wat een grote zou doen', () => {
    // Elke dag 8 kWh over en 6 kWh 's avonds nodig: 6 kWh is genoeg, dus 7,5 kWh.
    const s = accuSom(dagen(10, 8, 6), TZ)!;
    expect(s.aanbevolenKwh).toBe(7.5);
    expect(s.vanNetKwh).toBe(60);
    expect(s.gedektKwh).toBe(60);
    expect(s.tekortKwh).toBe(0);
    expect(s.legeDagen).toBe(0);
    expect(s.dagen).toBe(10);
    expect(s.maten.map((m) => m.kwh)).toEqual([...MATEN]);
  });

  it('zegt wat er tekortkwam als er minder zon over is dan de avond vraagt', () => {
    // 4 kWh over, met verlies 3,6 in de accu; 6 kWh nodig: 2,4 kWh tekort per dag, en elke avond leeg.
    const s = accuSom(dagen(10, 4, 6), TZ)!;
    expect(s.gedektKwh).toBeCloseTo(10 * 4 * RENDEMENT, 1);
    expect(s.tekortKwh).toBeCloseTo(60 - 36, 1);
    expect(s.legeDagen).toBe(10);
    expect(s.aanbevolenKwh).toBe(5);
  });

  it('springt bij in de uren dat er van het net kwam', () => {
    const s = accuSom(dagen(5, 8, 6), TZ)!;
    expect(s.uren.slice(18, 22).every((k) => k > 1)).toBe(true);
    expect(s.uren.slice(0, 18).every((k) => k === 0)).toBe(true);
  });

  it('heeft niets te zeggen als er niets naar het net ging', () => {
    expect(accuSom(dagen(5, 0, 6), TZ)).toBeNull();
  });
});
