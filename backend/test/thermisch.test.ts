/*
 * Hoe je huis warmte vasthoudt (besluit 231): uit een nagemaakt logboek met
 * een bekende kamer haalt het leren dezelfde getallen terug.
 */
import { describe, expect, it } from 'vitest';

import { leerThermisch, type ThermischMoment } from '../src/web/thermisch.js';

const BUITEN = 5;
const K = 0.01;
const ZON_PER_KW = 0.3;
const AIRCO = -0.5;

/**
 * Een kamer volgens Newton, per minuut: 's nachts niets, overdag 2 kW zon,
 * aan het eind van de middag de airco op koelen. 's Ochtends vraagt de Nest om
 * warmte zonder dat er iets gebeurt. De badkamer staat de hele tijd uit op 18.
 */
function logboek(dagen: number): ThermischMoment[] {
  const uit: ThermischMoment[] = [];
  let T = 20;
  const start = Date.UTC(2026, 9, 1);
  for (let m = 0; m < dagen * 24 * 60; m++) {
    const uur = Math.floor(m / 60) % 24;
    const zonKw = uur >= 10 && uur < 15 ? 2 : 0;
    const airco = uur >= 16 && uur < 19;
    const nest = uur === 9;
    uit.push({
      tMs: start + m * 60_000,
      zones: [{ id: 'kamer', temperatureC: Math.round(T * 100) / 100 }],
      observed: { nest: nest ? 'heat@30' : 'off', airco: airco ? 'cool@10' : 'off', badkamer: 'off@18' },
      outdoorC: BUITEN,
      solarW: zonKw * 1000,
    });
    T += (-K * (T - BUITEN) + ZON_PER_KW * zonKw + (airco ? AIRCO : 0)) / 60;
  }
  return uit;
}

const ZONES = [{ id: 'kamer', naam: 'Kamer', apparaten: [{ id: 'nest', naam: 'Nest', warmen: true, koelen: false }, { id: 'airco', naam: 'Airco kamer', warmen: true, koelen: true }] }];

describe('hoe je huis warmte vasthoudt (besluit 231)', () => {
  const r = leerThermisch(logboek(25), ZONES, Date.UTC(2026, 9, 26));
  const kamer = r.zones[0]!;

  it('leert hoe snel de kamer afkoelt, uit de rustige nachten', () => {
    expect(kamer.k).toBeCloseTo(K, 3);
    expect(kamer.tauUur).toBeGreaterThan(90);
    expect(kamer.tauUur).toBeLessThan(110);
    expect(kamer.zeker.afkoelen).toBe(4);
  });

  it('leert wat de zon doet per kW', () => {
    expect(kamer.zonPerKw).toBeCloseTo(ZON_PER_KW, 1);
    expect(kamer.zeker.zon).toBeGreaterThanOrEqual(2);
  });

  it('leert wat de airco doet, bovenop het afkoelen', () => {
    const koelt = kamer.apparaten.find((a) => a.id === 'airco' && a.stand === 'koelt')!;
    expect(koelt.perUur).toBeCloseTo(AIRCO, 1);
    expect(koelt.zeker).toBeGreaterThanOrEqual(2);
  });

  it('noemt een verwarmer die niets merkbaars doet onduidelijk, en wat nooit gebeurde nog niet gezien', () => {
    const nest = kamer.apparaten.find((a) => a.id === 'nest')!;
    expect(nest.perUur).toBeNull();
    expect(nest.kwartieren).toBeGreaterThanOrEqual(8);
    const aircoWarmt = kamer.apparaten.find((a) => a.id === 'airco' && a.stand === 'warmt')!;
    expect(aircoWarmt.kwartieren).toBe(0);
    expect(r.stand).toBe('leert');
  });

  it('heeft zonder logboek niets te zeggen', () => {
    expect(leerThermisch([], ZONES, Date.now()).zones).toEqual([]);
  });
});
