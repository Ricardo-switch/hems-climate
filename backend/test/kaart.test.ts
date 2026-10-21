/*
 * De gevels opmeten op de kaart (21 oktober 2026): uit de omtrek van het huis
 * in OpenStreetMap de richting van elke muur naar buiten, de hoofdas, en de
 * voorkant die het dichtst bij de meting ligt.
 */
import { describe, expect, it } from 'vitest';

import { binnen, gevelsUitOmtrek, kiesGebouw, overpassVraag, voorkantUitKaart, type Punt } from '../src/web/kaart.js';

const LAT = 51.5;
const LON = 5.0;
/** Een rechthoek van `breed` bij `diep` meter, met de voorkant naar `voorDeg`, vanuit het midden. */
function huis(voorDeg: number, breed = 6, diep = 10, lat = LAT, lon = LON): Punt[] {
  const r = (voorDeg * Math.PI) / 180;
  // Naar voren (de voorkant) en opzij, in meters oost en noord.
  const voor = { x: Math.sin(r), y: Math.cos(r) };
  const zij = { x: Math.cos(r), y: -Math.sin(r) };
  const hoek = (a: number, b: number) => {
    const x = voor.x * a + zij.x * b;
    const y = voor.y * a + zij.y * b;
    return { lat: lat + y / 110_540, lon: lon + x / (111_320 * Math.cos((lat * Math.PI) / 180)) };
  };
  const p = [hoek(diep / 2, -breed / 2), hoek(diep / 2, breed / 2), hoek(-diep / 2, breed / 2), hoek(-diep / 2, -breed / 2)];
  return [...p, p[0]!];
}

describe('de gevels op de kaart (21 oktober 2026)', () => {
  it('vindt de richting van elke muur naar buiten, de klok mee of ertegenin', () => {
    for (const omtrek of [huis(92), [...huis(92)].reverse()]) {
      const g = gevelsUitOmtrek(omtrek)!;
      expect(g.gevels.map((x) => x.richtingDeg).sort((a, b) => a - b)).toEqual([2, 92, 182, 272]);
      // De lange muren zijn de zijmuren: die van een rijtjeshuis.
      expect([...g.as].sort((a, b) => a - b)).toEqual([2, 182]);
    }
  });

  it('kiest de voorkant die het dichtst bij de meting ligt, ook haaks op de hoofdas', () => {
    const g = gevelsUitOmtrek(huis(92))!;
    expect(voorkantUitKaart(g, 92)).toBe(92);
    expect(voorkantUitKaart(g, 77)).toBe(92);
    expect(voorkantUitKaart(g, 260)).toBe(272);
    expect(voorkantUitKaart(gevelsUitOmtrek(huis(135, 12, 8))!, 150)).toBe(135);
  });

  it('neemt het gebouw waar het huis in ligt, en anders het dichtstbijzijnde', () => {
    const eigen = huis(92);
    const buren = huis(92, 6, 10, LAT, LON + 0.0001);
    expect(binnen({ lat: LAT, lon: LON }, eigen)).toBe(true);
    expect(binnen({ lat: LAT, lon: LON }, buren)).toBe(false);
    const antwoord = { elements: [{ geometry: buren }, { geometry: eigen }] };
    expect(kiesGebouw(antwoord, { lat: LAT, lon: LON })).toBe(eigen);
    expect(kiesGebouw(antwoord, { lat: LAT + 0.0002, lon: LON + 0.0001 })).toBe(buren);
    expect(kiesGebouw({ elements: [] }, { lat: LAT, lon: LON })).toBeNull();
    expect(overpassVraag(LAT, LON)).toContain('way(around:40,51.500000,5.000000)["building"]');
  });
});
