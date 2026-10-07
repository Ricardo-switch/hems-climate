/**
 * Besluit 55: wat de omgeving zegt over hoe de dienst draait.
 *
 * Het belangrijkste hier is de schrijfdeur uit besluit 42. Een pagina die
 * configuratie wegschrijft hoort alleen te bestaan achter de inlog van Home
 * Assistant, of wanneer iemand er uitdrukkelijk om vraagt. Die voorwaarde stond
 * twee keer in `main.ts`, zonder test; nu één keer, met deze tests.
 */

import { describe, expect, it } from 'vitest';

import { readStartup } from '../src/startup.js';

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
    const o = readStartup(NAS);
    expect(o.asAddon).toBe(false);
    expect(o.ha).toEqual({ url: NAS.HA_URL, token: NAS.HA_TOKEN });
    expect(o.web.port).toBe(8080);
    expect(o.tickSeconds).toBe(30);
    expect(o.minIntervalSeconds).toBe(15);
    expect(o.watchdogMinutes).toBe(10);
    expect(o.logDir).toBe('/logs');
    expect(o.haProblems).toEqual([]);
    expect(o.errors).toEqual([]);
  });

  it('herkent de add-on aan het token van de Supervisor', () => {
    const o = readStartup(ADDON);
    expect(o.asAddon).toBe(true);
    expect(o.ha).toEqual({ url: 'http://supervisor/core/websocket', token: 'supervisor-token' });
    expect(o.haProblems).toEqual([]);
  });

  it('meldt een ontbrekend en een leeg token verschillend', () => {
    // Leeg is het bestand dat je aanmaakte voordat je het token plakte.
    expect(readStartup({ HA_URL: 'http://ha:8123' }).haProblems).toEqual(['HA_TOKEN ontbreekt.']);
    expect(readStartup({ HA_URL: 'http://ha:8123', HA_TOKEN: '  ' }).haProblems).toEqual([
      'HA_TOKEN staat er wel, maar is leeg — het token is nog niet geplakt.',
    ]);
  });
});

describe('de schrijfdeur (besluit 42)', () => {
  it('staat open in de add-on, achter Ingress', () => {
    const o = readStartup(ADDON);
    expect(o.onboarding).toEqual({ enabled: true, withoutIngress: false });
  });

  it('staat dicht op de NAS', () => {
    expect(readStartup(NAS).onboarding).toEqual({ enabled: false, withoutIngress: false });
  });

  it('staat dicht zodra iemand de add-on naar een eigen Home Assistant wijst', () => {
    // De omgeving wint van de Supervisor, en dan is er geen garantie meer dat
    // de pagina achter de inlog van Home Assistant zit.
    const o = readStartup({ ...ADDON, HA_URL: 'http://elders:8123', HA_TOKEN: 'eyJ.a.b' });
    expect(o.asAddon).toBe(false);
    expect(o.onboarding.enabled).toBe(false);
  });

  it('gaat buiten de add-on alleen open op uitdrukkelijk verzoek, en zegt dat erbij', () => {
    const o = readStartup({ ...NAS, HEMS_ONBOARDING: '1' });
    expect(o.onboarding).toEqual({ enabled: true, withoutIngress: true });
  });

  it('bestaat niet zonder weergave, ook niet op verzoek', () => {
    // Geen pagina, dus ook geen deur — ook niet een die niemand aanroept.
    expect(readStartup({ ...ADDON, HEMS_WEB_PORT: undefined }).onboarding.enabled).toBe(false);
    const { HEMS_WEB_PORT: _omitted, ...withoutPort } = NAS;
    expect(readStartup({ ...withoutPort, HEMS_ONBOARDING: '1' }).onboarding.enabled).toBe(false);
  });

  it('opent alleen op precies "1"', () => {
    for (const value of ['true', 'ja', '0', '']) {
      expect(readStartup({ ...NAS, HEMS_ONBOARDING: value }).onboarding.enabled).toBe(false);
    }
  });
});

describe('licht bedienen (besluit 97)', () => {
  it('staat aan in de add-on, achter Ingress, tenzij de bewoner het uitzet', () => {
    expect(readStartup(ADDON).lights).toEqual({ enabled: true, withoutIngress: false });
    expect(readStartup({ ...ADDON, HEMS_LIGHTS: '0' }).lights.enabled).toBe(false);
  });

  it('staat buiten de add-on alleen aan op uitdrukkelijk verzoek, en waarschuwt alleen zonder inlog', () => {
    expect(readStartup(NAS).lights.enabled).toBe(false);
    // Met de inlog van besluit 99 kan niet iedereen schakelen.
    expect(readStartup({ ...NAS, HEMS_LIGHTS: '1' }).lights).toEqual({ enabled: true, withoutIngress: false });
    expect(readStartup({ ...NAS, HEMS_LIGHTS: '1', HEMS_OPEN: '1' }).lights).toEqual({ enabled: true, withoutIngress: true });
  });

  it('bestaat niet zonder weergave', () => {
    const { HEMS_WEB_PORT: _omitted, ...withoutPort } = NAS;
    expect(readStartup({ ...withoutPort, HEMS_LIGHTS: '1' }).lights.enabled).toBe(false);
  });

  it('weigert iets anders dan 1 of 0', () => {
    const o = readStartup({ ...NAS, HEMS_LIGHTS: 'ja' });
    expect(o.lights.enabled).toBe(false);
    expect(o.errors.join(' ')).toContain('HEMS_LIGHTS');
  });
});

describe('instellingen die niet kloppen, vallen op', () => {
  it('weigert een poort die er geen is', () => {
    for (const port of ['0', '70000', '80a', '8.5']) {
      const o = readStartup({ ...NAS, HEMS_WEB_PORT: port });
      expect(o.web.port).toBeNull();
      expect(o.errors).toEqual([`HEMS_WEB_PORT is geen geldige poort: "${port}".`]);
    }
  });

  it('weigert een hartslag van nul of een getal met een eenheid erachter', () => {
    // Voorheen werd "30s" stil 30 en ging nul door: een hartslag zonder pauze.
    for (const tick of ['0', '30s', '-5']) {
      const o = readStartup({ ...NAS, SHADOW_TICK_SECONDS: tick });
      expect(o.errors).toEqual([
        `SHADOW_TICK_SECONDS moet een getal van minstens 1 zijn, niet "${tick}".`,
      ]);
    }
  });

  it('laat nul toe waar nul iets betekent', () => {
    // Geen minimale pauze tussen evaluaties, en de bewaking uit.
    const o = readStartup({ ...NAS, SHADOW_MIN_INTERVAL_SECONDS: '0', SHADOW_WATCHDOG_MINUTES: '0' });
    expect(o.errors).toEqual([]);
    expect(o.minIntervalSeconds).toBe(0);
    expect(o.watchdogMinutes).toBe(0);
  });

  it('houdt een lege logmap leeg: dan wordt er niet gelogd', () => {
    expect(readStartup({ ...NAS, SHADOW_LOG_DIR: '' }).logDir).toBe('');
    const { SHADOW_LOG_DIR: _omitted, ...without } = NAS;
    expect(readStartup(without).logDir).toBe('data/shadow');
  });
});

describe('wie mag bedienen (besluit 99)', () => {
  it('vraagt op de NAS een inlog via Home Assistant, op het adres van HA_URL', () => {
    const a = readStartup(NAS).access;
    expect(a.kind).toBe('sessions');
    if (a.kind === 'sessions') expect(a.haLoginUrl).toBe(NAS['HA_URL']);
  });

  it('neemt een eigen inlogadres en extra hostnamen', () => {
    const a = readStartup({ ...NAS, HEMS_HA_LOGIN_URL: 'http://ha.tailnet.ts.net:8123', HEMS_HOSTS: 'nas.thuis.nl, klimaat.thuis.nl' }).access;
    expect(a).toEqual({ kind: 'sessions', haLoginUrl: 'http://ha.tailnet.ts.net:8123', hosts: ['nas.thuis.nl', 'klimaat.thuis.nl'] });
  });

  it('laat Ingress de bezoeker vaststellen in de add-on', () => {
    expect(readStartup({ SUPERVISOR_TOKEN: 'x', HEMS_WEB_PORT: '8099' }).access).toEqual({ kind: 'ingress' });
  });

  it('staat alleen open op uitdrukkelijk verzoek, en weigert iets anders dan 1 of 0', () => {
    expect(readStartup({ ...NAS, HEMS_OPEN: '1' }).access).toEqual({ kind: 'open' });
    expect(readStartup({ ...NAS, HEMS_OPEN: 'ja' }).errors.join(' ')).toContain('HEMS_OPEN');
  });
});
