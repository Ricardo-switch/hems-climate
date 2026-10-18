/*
 * Hoe een zin klinkt (besluit 142): Piper krijgt eenheden voluit, tijden zoals
 * je ze zegt, en "airco" zoals het klinkt (opgelost 15 oktober).
 */
import { describe, expect, it } from 'vitest';

import { tijdInWoorden, uitspraak } from '../src/web/uitspraak.js';

describe('de uitspraak (besluit 142)', () => {
  it('zegt een tijd zoals je hem zegt', () => {
    expect(tijdInWoorden(13, 45)).toBe('kwart voor twee');
    expect(tijdInWoorden(22, 0)).toBe('tien uur');
    expect(tijdInWoorden(0, 0)).toBe('twaalf uur');
    expect(tijdInWoorden(12, 30)).toBe('half één');
    expect(tijdInWoorden(13, 20)).toBe('tien voor half twee');
    expect(tijdInWoorden(13, 5)).toBe('vijf over één');
    expect(tijdInWoorden(13, 33)).toBe('drie over half twee');
    expect(tijdInWoorden(13, 47)).toBe('dertien voor twee');
    expect(tijdInWoorden(23, 50)).toBe('tien voor twaalf');
    expect(tijdInWoorden(6, 15)).toBe('kwart over zes');
  });

  it('zegt eenheden voluit, en airco zoals het klinkt', () => {
    expect(uitspraak('Je dak leverde 9,3 kWh, het meeste om 13:45.')).toBe('Je dak leverde 9,3 kilowattuur, het meeste om kwart voor twee.');
    expect(uitspraak('Het huis haalt 2,6 kW van het net, de airco zolder 300 W.')).toBe('Het huis haalt 2,6 kilowatt van het net, de erko zolder 300 watt.');
    expect(uitspraak('Het is 22,3° in de wasruimte, en 55% kwam van je dak.')).toBe('Het is 22,3 graden in de wasruimte, en 55 procent kwam van je dak.');
    expect(uitspraak('De airco’s kostten € 0,45 en € 62,18, en € 3.')).toBe('De erko’s kostten 45 cent en 62 euro 18, en 3 euro.');
    expect(uitspraak("Airco's en de cv: 13,5 m³ gas.")).toBe("erko's en de cee vee: 13,5 kuub gas.");
  });

  it('zegt gevel met een lange e', () => {
    expect(uitspraak('De zon staat nu op de voorgevel en de zijgevels.')).toBe('De zon staat nu op de voorgeevel en de zij geevels.');
    expect(uitspraak('Gevel en achtergevel, maar een gevelde boom blijft.')).toBe('geevel en achter geevel, maar een gevelde boom blijft.');
  });

  it('zegt app op zijn Engels (besluit 166)', () => {
    expect(uitspraak('Dat stel je in de app in. Apps en een appel.')).toBe('Dat stel je in de ep in. eps en een appel.');
  });

  it('laat gewone tekst met rust', () => {
    const zin = 'Het is rustig in huis. Wat wil je weten?';
    expect(uitspraak(zin)).toBe(zin);
    expect(uitspraak(uitspraak('Om 22:00, 4 kWh.'))).toBe('Om tien uur, 4 kilowattuur.');
  });
});
