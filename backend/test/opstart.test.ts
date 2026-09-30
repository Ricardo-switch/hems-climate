/**
 * Besluit 55: wat de omgeving zegt over hoe de dienst draait.
 *
 * Het belangrijkste hier is de schrijfdeur uit besluit 42. Een pagina die
 * configuratie wegschrijft hoort alleen te bestaan achter de inlog van Home
 * Assistant, of wanneer iemand er uitdrukkelijk om vraagt. Die voorwaarde stond
 * twee keer in `main.ts`, zonder test; nu één keer, met deze tests.
 */

import { describe, expect, it } from 'vitest';

import { leesOpstart } from '../src/opstart.js';

const NAS = {
  HA_URL: 'http://192.168.67.52:8123',
  HA_TOKEN: 'eyJ.x.y',
  HEMS_WEB_PORT: '8080',
  SHADOW_TICK_SECONDS: '30',
  SHADOW_MIN_INTERVAL_SECONDS: '15',
  SHADOW_WATCHDOG_MINUTES: '10',
  SHADOW_LOG_DIR: '/logs',
};

const ADDON = {
  SUPERVISOR_TOKEN: 'supervisor-token',
  HEMS_WEB_PORT: '8099',
  HEMS_WEB_HOST: '0.0.0.0',
  SHADOW_LOG_DIR: '/share/hems-climate/logs',
};

describe('de opstart', () => {
  it('leest de NAS zoals hij draait', () => {
    const o = leesOpstart(NAS);
    expect(o.alsAddon).toBe(false);
    expect(o.ha).toEqual({ url: NAS.HA_URL, token: NAS.HA_TOKEN });
    expect(o.web.poort).toBe(8080);
    expect(o.tickSeconds).toBe(30);
    expect(o.minIntervalSeconds).toBe(15);
    expect(o.watchdogMinutes).toBe(10);
    expect(o.logDir).toBe('/logs');
    expect(o.haProblemen).toEqual([]);
    expect(o.fouten).toEqual([]);
  });

  it('herkent de add-on aan het token van de Supervisor', () => {
    const o = leesOpstart(ADDON);
    expect(o.alsAddon).toBe(true);
    expect(o.ha).toEqual({ url: 'http://supervisor/core/websocket', token: 'supervisor-token' });
    expect(o.haProblemen).toEqual([]);
  });

  it('meldt een ontbrekend en een leeg token verschillend', () => {
    // Leeg is het bestand dat je aanmaakte voordat je het token plakte.
    expect(leesOpstart({ HA_URL: 'http://ha:8123' }).haProblemen).toEqual(['HA_TOKEN ontbreekt.']);
    expect(leesOpstart({ HA_URL: 'http://ha:8123', HA_TOKEN: '  ' }).haProblemen).toEqual([
      'HA_TOKEN staat er wel, maar is leeg — het token is nog niet geplakt.',
    ]);
  });
});

describe('de schrijfdeur (besluit 42)', () => {
  it('staat open in de add-on, achter Ingress', () => {
    const o = leesOpstart(ADDON);
    expect(o.onboarding).toEqual({ aan: true, zonderIngress: false });
  });

  it('staat dicht op de NAS', () => {
    expect(leesOpstart(NAS).onboarding).toEqual({ aan: false, zonderIngress: false });
  });

  it('staat dicht zodra iemand de add-on naar een eigen Home Assistant wijst', () => {
    // De omgeving wint van de Supervisor, en dan is er geen garantie meer dat
    // de pagina achter de inlog van Home Assistant zit.
    const o = leesOpstart({ ...ADDON, HA_URL: 'http://elders:8123', HA_TOKEN: 'eyJ.a.b' });
    expect(o.alsAddon).toBe(false);
    expect(o.onboarding.aan).toBe(false);
  });

  it('gaat buiten de add-on alleen open op uitdrukkelijk verzoek, en zegt dat erbij', () => {
    const o = leesOpstart({ ...NAS, HEMS_ONBOARDING: '1' });
    expect(o.onboarding).toEqual({ aan: true, zonderIngress: true });
  });

  it('bestaat niet zonder weergave, ook niet op verzoek', () => {
    // Geen pagina, dus ook geen deur — ook niet een die niemand aanroept.
    expect(leesOpstart({ ...ADDON, HEMS_WEB_PORT: undefined }).onboarding.aan).toBe(false);
    const { HEMS_WEB_PORT: _weg, ...zonderPoort } = NAS;
    expect(leesOpstart({ ...zonderPoort, HEMS_ONBOARDING: '1' }).onboarding.aan).toBe(false);
  });

  it('opent alleen op precies "1"', () => {
    for (const waarde of ['true', 'ja', '0', '']) {
      expect(leesOpstart({ ...NAS, HEMS_ONBOARDING: waarde }).onboarding.aan).toBe(false);
    }
  });
});

describe('instellingen die niet kloppen, vallen op', () => {
  it('weigert een poort die er geen is', () => {
    for (const poort of ['0', '70000', '80a', '8.5']) {
      const o = leesOpstart({ ...NAS, HEMS_WEB_PORT: poort });
      expect(o.web.poort).toBeNull();
      expect(o.fouten).toEqual([`HEMS_WEB_PORT is geen geldige poort: "${poort}".`]);
    }
  });

  it('weigert een hartslag van nul of een getal met een eenheid erachter', () => {
    // Voorheen werd "30s" stil 30 en ging nul door: een hartslag zonder pauze.
    for (const tick of ['0', '30s', '-5']) {
      const o = leesOpstart({ ...NAS, SHADOW_TICK_SECONDS: tick });
      expect(o.fouten).toEqual([
        `SHADOW_TICK_SECONDS moet een getal van minstens 1 zijn, niet "${tick}".`,
      ]);
    }
  });

  it('laat nul toe waar nul iets betekent', () => {
    // Geen minimale pauze tussen evaluaties, en de bewaking uit.
    const o = leesOpstart({ ...NAS, SHADOW_MIN_INTERVAL_SECONDS: '0', SHADOW_WATCHDOG_MINUTES: '0' });
    expect(o.fouten).toEqual([]);
    expect(o.minIntervalSeconds).toBe(0);
    expect(o.watchdogMinutes).toBe(0);
  });

  it('houdt een lege logmap leeg: dan wordt er niet gelogd', () => {
    expect(leesOpstart({ ...NAS, SHADOW_LOG_DIR: '' }).logDir).toBe('');
    const { SHADOW_LOG_DIR: _weg, ...zonder } = NAS;
    expect(leesOpstart(zonder).logDir).toBe('data/shadow');
  });
});
