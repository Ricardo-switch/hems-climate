/**
 * Wat stroom en gas kosten (besluit 110): de daltijden, welke meter dal telt,
 * en de kosten met de tarieven van een echt contract (oktober 2026).
 */

import { describe, expect, it } from 'vitest';

import { SALDEREN_TOT_MS, dalAandeel, isDal, isFeestdag, kostenVan, raadDal, vastOver, type Gebruik, type Tarieven } from '../src/web/tarief.js';

const TZ = 'Europe/Amsterdam';
/** Lokale tijd in Nederland (zomertijd, UTC+2) als epoch-ms. */
const zomer = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m - 1, d, h - 2, min);

describe('de tijden van het daltarief (besluit 110)', () => {
  it('is dal op werkdagen van 23 tot 7 uur, in het zuiden vanaf 21 uur', () => {
    // Donderdag 8 oktober 2026.
    expect(isDal(zomer(2026, 10, 8, 22, 30), TZ)).toBe(false);
    expect(isDal(zomer(2026, 10, 8, 23, 30), TZ)).toBe(true);
    expect(isDal(zomer(2026, 10, 8, 6, 59), TZ)).toBe(true);
    expect(isDal(zomer(2026, 10, 8, 7, 0), TZ)).toBe(false);
    expect(isDal(zomer(2026, 10, 8, 21, 30), TZ, 'zuid')).toBe(true);
  });

  it('is dal in het weekend en op feestdagen', () => {
    expect(isDal(zomer(2026, 10, 10, 12), TZ)).toBe(true); // zaterdag
    expect(isFeestdag(2026, 4, 6)).toBe(true); // tweede paasdag
    expect(isFeestdag(2026, 5, 14)).toBe(true); // Hemelvaart
    expect(isFeestdag(2026, 5, 25)).toBe(true); // tweede pinksterdag
    expect(isFeestdag(2026, 4, 27)).toBe(true); // Koningsdag
    expect(isFeestdag(2025, 4, 26)).toBe(true); // Koningsdag op zaterdag, 27 april is zondag
    expect(isFeestdag(2026, 12, 26)).toBe(true);
    expect(isFeestdag(2026, 10, 8)).toBe(false);
  });

  it('telt over een week 88 van de 168 uur als dal', () => {
    // Maandag 5 tot maandag 12 oktober 2026.
    expect(dalAandeel(zomer(2026, 10, 5, 0), zomer(2026, 10, 12, 0), TZ)).toBeCloseTo(88 / 168, 5);
  });

  it('herkent de dalmeter van een slimme meter aan zijn naam', () => {
    expect(raadDal('sensor.p1_meter_energy_import_tariff_1')).toBe(true);
    expect(raadDal('sensor.p1_meter_energy_import_tariff_2')).toBe(false);
    expect(raadDal('sensor.dsmr_reading_electricity_delivered_1')).toBe(false);
    expect(raadDal('sensor.energie_verbruik_tarief_1')).toBe(true);
    expect(raadDal('sensor.stroom_dal')).toBe(true);
    expect(raadDal('sensor.p1_meter')).toBe(false);
  });
});

describe('de kosten met een echt contract (besluit 110)', () => {
  const contract: Tarieven = {
    stroom: 0.27142,
    stroomDal: 0.269,
    dalUren: 'nl',
    teruglevering: 0.15,
    vanaf2027: { vergoeding: 0.06635, kosten: 0.06385 },
    gas: 1.36568,
    vast: [
      { naam: 'Vaste leveringskosten', bedrag: 0.36121, per: 'dag', soort: 'stroom' },
      { naam: 'Netbeheer', bedrag: 478.04, per: 'jaar', soort: 'stroom' },
      { naam: 'Vermindering energiebelasting', bedrag: -628.96, per: 'jaar', soort: 'stroom' },
      { naam: 'Vaste leveringskosten gas', bedrag: 0.26256, per: 'dag', soort: 'gas' },
      { naam: 'Netbeheer gas', bedrag: 0.73048, per: 'dag', soort: 'gas' },
    ],
    vastPerMaand: null,
  };
  const heeft = { net: true, terug: true, gas: true };
  const leeg: Gebruik = { afNormaal: 0, afDal: 0, terugNormaal: 0, terugDal: 0, terugNa: 0, gasM3: 0, dagen: 30, heelJaar: false };

  it('rekent normaal en dal elk met hun eigen prijs', () => {
    const k = kostenVan(contract, { ...leeg, afNormaal: 100, afDal: 50 }, heeft);
    expect(k.regels.slice(0, 2)).toEqual([
      { naam: 'Stroom normaal', uitleg: '100 kWh × € 0,27142', euro: 27.14 },
      { naam: 'Stroom dal', uitleg: '50 kWh × € 0,269', euro: 13.45 },
    ]);
    expect(k.stroomPerKwh).toBeCloseTo((27.142 + 13.45) / 150, 5);
  });

  it('saldeert teruglevering tegen het eigen tarief, en over een jaar het overschot tegen de vergoeding', () => {
    const maand = kostenVan(contract, { ...leeg, afNormaal: 10, terugNormaal: 200, terugDal: 20 }, heeft);
    expect(maand.regels.find((r) => r.naam === 'Teruggeleverd')!.euro).toBe(-(200 * 0.27142 + 20 * 0.269).toFixed(2) * 1);
    const jaar = kostenVan(contract, { ...leeg, afNormaal: 1000, terugNormaal: 1500, dagen: 365, heelJaar: true }, heeft);
    const terug = jaar.regels.find((r) => r.naam === 'Teruggeleverd')!;
    expect(terug.uitleg).toBe('1000 kWh gesaldeerd, 500 kWh boven je verbruik × € 0,15');
    expect(terug.euro).toBeCloseTo(-(1000 * 0.27142 + 500 * 0.15), 2);
  });

  it('rekent vanaf 2027 een vergoeding met terugleverkosten, zonder salderen', () => {
    const k = kostenVan(contract, { ...leeg, terugNa: 100 }, heeft);
    expect(k.regels.find((r) => r.naam === 'Teruggeleverd, zonder salderen')).toEqual({ naam: 'Teruggeleverd, zonder salderen', uitleg: '100 kWh × € 0,06635 vergoeding, min € 0,06385 kosten', euro: -0.25 });
    expect(new Date(SALDEREN_TOT_MS).toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('telt de vaste posten per dag, maand of jaar, met de vermindering energiebelasting als aftrek', () => {
    expect(vastOver({ naam: 'x', bedrag: 478.04, per: 'jaar', soort: 'stroom' }, 365.25)).toBeCloseTo(478.04, 5);
    expect(vastOver({ naam: 'x', bedrag: 10, per: 'maand', soort: 'stroom' }, 30.4375)).toBeCloseTo(10, 5);
    const k = kostenVan(contract, leeg, heeft);
    const stroom = k.regels.find((r) => r.naam === 'Vaste kosten stroom')!;
    expect(stroom.uitleg).toBe('Vaste leveringskosten, Netbeheer, Vermindering energiebelasting');
    expect(stroom.euro).toBeCloseTo(0.36121 * 30 + ((478.04 - 628.96) * 30) / 365.25, 2);
    expect(k.regels.find((r) => r.naam === 'Vaste kosten gas')!.euro).toBeCloseTo((0.26256 + 0.73048) * 30, 2);
  });

  it('zegt wat er nog niet is ingesteld, en valt terug op de oude vaste kosten per maand', () => {
    const niets = kostenVan({ stroom: null, teruglevering: null, gas: null, vastPerMaand: null }, { ...leeg, afNormaal: 5 }, heeft);
    expect(niets.variabel).toBeNull();
    expect(niets.regels.at(-1)).toEqual({ naam: 'Vaste kosten', uitleg: 'nog niet ingesteld', euro: null });
    const oud = kostenVan({ stroom: 0.25, teruglevering: null, gas: null, vastPerMaand: 30 }, { ...leeg, dagen: 30.4375 }, heeft);
    expect(oud.vast).toBe(30);
  });
});
