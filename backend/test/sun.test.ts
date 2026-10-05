/**
 * De stand van de zon en de zoninval (besluit 93).
 *
 * Getoetst aan wat natuurkundig vaststaat, niet aan een tweede kopie van
 * dezelfde formules: op het middaguur staat de zon op het zuiden, op een hoogte
 * van 90° min de breedte plus de declinatie; rond de equinox komt hij op in het
 * oosten.
 */

import { describe, expect, it } from 'vitest';

import { clearSkyOnPlaneWm2, cosIncidence, incidenceDeg, sunOnPlane, sunPosition } from '../src/core/sun.js';
import { sunReport } from '../src/web/sun.js';
import { startOfLocalDay } from '../src/web/today.js';
import { exampleSite } from './site.js';

const LAT = 52.1;
const LON = 5.1;

/** De hoogste stand van een dag, minuut voor minuut gezocht. */
function noon(dayUtc: number): { elevationDeg: number; azimuthDeg: number } {
  let best = sunPosition(dayUtc, LAT, LON);
  for (let m = 0; m < 24 * 60; m++) {
    const s = sunPosition(dayUtc + m * 60_000, LAT, LON);
    if (s.elevationDeg > best.elevationDeg) best = s;
  }
  return best;
}

describe('de stand van de zon', () => {
  it('staat op het middaguur op het zuiden, zo hoog als de breedte toelaat', () => {
    const june = noon(Date.UTC(2026, 5, 21));
    expect(june.azimuthDeg).toBeGreaterThan(178);
    expect(june.azimuthDeg).toBeLessThan(182);
    expect(june.elevationDeg).toBeCloseTo(90 - LAT + 23.44, 0);

    const december = noon(Date.UTC(2026, 11, 21));
    expect(december.elevationDeg).toBeCloseTo(90 - LAT - 23.44, 0);
  });

  it('komt rond de equinox op in het oosten', () => {
    let rise = null as null | { azimuthDeg: number };
    for (let m = 0; m < 24 * 60 && rise == null; m++) {
      const s = sunPosition(Date.UTC(2026, 2, 20) + m * 60_000, LAT, LON);
      if (s.elevationDeg > 0) rise = s;
    }
    expect(rise!.azimuthDeg).toBeGreaterThan(87);
    expect(rise!.azimuthDeg).toBeLessThan(93);
  });
});

describe('hoe de zon op een vlak valt', () => {
  const east = { azimuthDeg: 90, tiltDeg: 90 };
  it('recht op een gevel die naar de zon kijkt, erachter bij de tegenovergestelde', () => {
    expect(cosIncidence({ elevationDeg: 0, azimuthDeg: 90 }, east)).toBeCloseTo(1, 5);
    expect(cosIncidence({ elevationDeg: 0, azimuthDeg: 270 }, east)).toBeLessThan(0);
    expect(incidenceDeg({ elevationDeg: 10, azimuthDeg: 270 }, east)).toBeNull();
    expect(incidenceDeg({ elevationDeg: 0.001, azimuthDeg: 90 }, east)).toBeCloseTo(0, 0);
  });

  it('op een plat vlak telt alleen de hoogte', () => {
    const flat = { azimuthDeg: 180, tiltDeg: 0 };
    expect(cosIncidence({ elevationDeg: 30, azimuthDeg: 45 }, flat)).toBeCloseTo(0.5, 5);
    expect(sunOnPlane({ elevationDeg: -2, azimuthDeg: 90 }, flat)).toBe(false);
  });

  it('geeft bij een heldere lucht niets in de nacht, en meer in juni dan in december', () => {
    const flat = { azimuthDeg: 180, tiltDeg: 0 };
    expect(clearSkyOnPlaneWm2({ elevationDeg: -5, azimuthDeg: 0 }, flat)).toBe(0);
    expect(clearSkyOnPlaneWm2(noon(Date.UTC(2026, 5, 21)), flat)).toBeGreaterThan(
      clearSkyOnPlaneWm2(noon(Date.UTC(2026, 11, 21)), flat) * 3,
    );
  });
});

describe('de zoninval van dit huis', () => {
  const geometry = exampleSite.geometry!;
  const location = { latDeg: LAT, lonDeg: LON };
  const day = startOfLocalDay(Date.parse('2026-10-05T10:00:00Z'), exampleSite.timezone);

  it("zet de zon 's ochtends op de voorgevel en 's middags op de achtergevel", () => {
    const morning = sunReport(geometry, location, Date.parse('2026-10-05T07:30:00Z'), day);
    expect(morning.gevels.find((g) => g.id === 'voorgevel')!.inDeZon).toBe(true);
    expect(morning.gevels.find((g) => g.id === 'achtergevel')!.inDeZon).toBe(false);
    expect(morning.panelen.find((p) => p.id === 'dak-oost')!.heldereLuchtW).toBeGreaterThan(
      morning.panelen.find((p) => p.id === 'dak-west')!.heldereLuchtW,
    );

    const afternoon = sunReport(geometry, location, Date.parse('2026-10-05T14:30:00Z'), day);
    expect(afternoon.gevels.find((g) => g.id === 'voorgevel')!.inDeZon).toBe(false);
    expect(afternoon.gevels.find((g) => g.id === 'achtergevel')!.inDeZon).toBe(true);
  });

  it('zegt waar de zon op de boog van de dag staat, en dat hij aan de voorkant opkomt', () => {
    const morning = sunReport(geometry, location, Date.parse('2026-10-05T07:30:00Z'), day);
    const noonish = sunReport(geometry, location, Date.parse('2026-10-05T11:40:00Z'), day);
    const night = sunReport(geometry, location, Date.parse('2026-10-05T21:00:00Z'), day);
    expect(morning.dag.opVoorkant).toBe(true);
    expect(morning.dag.fractie!).toBeGreaterThan(0);
    expect(morning.dag.fractie!).toBeLessThan(0.3);
    expect(noonish.dag.fractie!).toBeGreaterThan(0.4);
    expect(noonish.dag.fractie!).toBeLessThan(0.6);
    expect(noonish.dag.hoogteDeel).toBeGreaterThan(0.95);
    expect(morning.dag.hoogteDeel).toBeLessThan(noonish.dag.hoogteDeel);
    expect(night.dag.fractie).toBeNull();
    expect(night.dag.hoogteDeel).toBe(0);
    // Op 5 oktober in het midden van Nederland: op rond 07:50, onder rond 19:05 (zomertijd).
    expect(new Date(morning.dag.opMs!).toISOString()).toMatch(/T05:[45]\d/);
    expect(new Date(morning.dag.onderMs!).toISOString()).toMatch(/T1[67]:\d\d/);
  });

  it('rekent elk kwartier van de dag, en nooit boven de omvormer', () => {
    const r = sunReport(geometry, location, Date.parse('2026-10-05T10:00:00Z'), day);
    expect(r.kwartieren).toHaveLength(96);
    const max = Math.max(...r.kwartieren.map((k) => k.heldereLuchtW));
    expect(max).toBeGreaterThan(1000);
    expect(max).toBeLessThanOrEqual(geometry.inverterMaxW!);
    // Een oost-westdak levert breed: om tien uur 's ochtends al een flink deel van de piek.
    const ten = r.kwartieren.find((k) => k.tMs === Date.parse('2026-10-05T08:00:00Z'))!;
    expect(ten.heldereLuchtW).toBeGreaterThan(max * 0.5);
    expect(r.kwartieren[0]!.heldereLuchtW).toBe(0);
  });
});
