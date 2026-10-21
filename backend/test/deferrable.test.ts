/**
 * De droger op zon, in de schaduw (besluit 98).
 *
 * Wat de kern over een uitstelbaar apparaat zegt: wanneer het zou beginnen en
 * waarom niet. Er komt geen opdracht; die hoort bij stap B.
 */

import { describe, expect, it } from 'vitest';

import { decide } from '../src/core/decide.js';
import type { DeferrableExplanation } from '../src/core/decision.js';
import type { SiteConfig } from '../src/core/model.js';
import type { SystemState } from '../src/core/state.js';
import { unavailable, value } from '../src/core/state.js';
import { defaultStrategies } from '../src/index.js';
import { exampleSite } from './site.js';

// 12:00 UTC is 14:00 in Amsterdam: vóór de uiterlijke start van 15:00.
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);

const droger = exampleSite.deferrables?.find((d) => d.id === 'droger');

const actuator = (action: 'off' | 'cool') => ({
  action: value(action, NOW),
  setpointC: unavailable<number>(),
  powerW: value(0, NOW),
  lastChangeMs: NOW - 3_600_000,
  producing: unavailable<boolean>('missing'),
  producingSinceMs: null,
});

function state(o: {
  gridPowerW?: number;
  remote?: boolean | null;
  operation?: string | null;
  nowMs?: number;
  atticC?: number;
  stabilising?: boolean;
  modeOverride?: SystemState['modeOverride'];
  healthy?: boolean;
  currentA?: number;
  remoteSinceMs?: number;
  operationSinceMs?: number;
  durationMin?: number;
  readyByMs?: number;
  remainingMin?: number | null;
  remainingSinceMs?: number;
  progressPct?: number;
  progressSinceMs?: number;
} = {}): SystemState {
  const now = o.nowMs ?? NOW;
  return {
    nowMs: now,
    modeOverride: o.modeOverride ?? null,
    outdoorTemperatureC: unavailable<number>('missing'),
    solarProductionW: unavailable<number>('missing'),
    occupancy: { ricardo: value(true, now) },
    // Niemand wil koelen, tenzij de test de zolder warm maakt.
    zones: {
      woonkamer: { temperatureC: value(21, now) },
      badkamer: { temperatureC: value(20, now) },
      zolder: { temperatureC: value(o.atticC ?? 21, now) },
    },
    actuators: { nest: actuator('off'), badkamer: actuator('off'), 'ac-woonkamer': actuator('off'), 'ac-zolder': actuator('off') },
    power: {
      gridPowerW: value(o.gridPowerW ?? -1500, now),
      ...(o.currentA != null ? { phases: { L1: { currentA: value(o.currentA, now), voltageV: value(230, now) } } } : {}),
    },
    timers: { stabilisation: { endsAtMs: o.stabilising ? now + 120_000 : null }, manualOverride: { endsAtMs: null } },
    lights: {},
    sunAboveHorizon: value(true, now),
    inputHealth: Object.fromEntries(exampleSite.criticalInputs.map((r) => [r.id, o.healthy ?? true])),
    deferrables: {
      droger: {
        remoteStartAllowed: o.remote === null ? unavailable<boolean>() : value(o.remote ?? true, now),
        operation: o.operation == null ? unavailable<string>('missing') : value(o.operation, now),
        ...(o.remoteSinceMs != null ? { remoteStartSinceMs: o.remoteSinceMs } : {}),
        ...(o.operationSinceMs != null ? { operationSinceMs: o.operationSinceMs } : {}),
        ...(o.durationMin != null ? { durationMin: value(o.durationMin, now) } : {}),
        ...(o.readyByMs != null ? { readyByMs: o.readyByMs } : {}),
        ...(o.remainingMin !== undefined ? { remainingMin: o.remainingMin === null ? unavailable<number>('missing') : value(o.remainingMin, now), remainingSinceMs: o.remainingSinceMs ?? null } : {}),
        ...(o.progressPct != null ? { progressPct: value(o.progressPct, now), progressSinceMs: o.progressSinceMs ?? null } : {}),
      },
    },
  };
}

function dryer(s: SystemState, config: SiteConfig = exampleSite): DeferrableExplanation | undefined {
  return decide({ config, state: s, strategies: defaultStrategies() }).explanation.deferrables?.find((d) => d.id === 'droger');
}

describe('de droger op zon (besluit 98)', () => {
  it('staat in de configuratie van dit huis, met "start op afstand" als invoer', () => {
    expect(droger).toMatchObject({ estimatedW: 600, latestStart: '15:00' });
    expect((exampleSite.recordOnly ?? []).map((r) => r.id)).not.toContain(droger!.remoteStart.id);
  });

  it('zou starten als het overschot hem draagt', () => {
    expect(dryer(state({ gridPowerW: -900 }))).toEqual({ id: 'droger', state: 'would_start', reason: 'surplus_available' });
  });

  it('wacht op zon als er te weinig over is', () => {
    expect(dryer(state({ gridPowerW: -300 }))).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient' });
  });

  it('start uiterlijk om 15:00, ook zonder zon', () => {
    const late = Date.UTC(2026, 7, 28, 13, 5, 0); // 15:05 in Amsterdam
    expect(dryer(state({ gridPowerW: 400, nowMs: late }))).toMatchObject({ state: 'would_start', reason: 'latest_start_reached' });
  });

  it('nooit zonder "start op afstand", en zegt het als dat onbekend is', () => {
    expect(dryer(state({ remote: false }))).toMatchObject({ state: 'not_ready', reason: 'remote_start_not_allowed' });
    expect(dryer(state({ remote: null }))).toMatchObject({ state: 'unknown', reason: 'reading_unavailable' });
  });

  it('weet dat hij al draait of klaar is, ook als Home Connect het in een eigen vorm zegt', () => {
    expect(dryer(state({ operation: 'BSH.Common.EnumType.OperationState.Run' }))).toMatchObject({ state: 'running' });
    expect(dryer(state({ operation: 'Finished' }))).toMatchObject({ state: 'not_ready', reason: 'program_finished' });
    expect(dryer(state({ operation: 'BSH.Common.EnumType.OperationState.Ready' }))).toMatchObject({ state: 'would_start' });
  });

  it('laat een airco voorgaan, en start niet in dezelfde ronde (besluiten 68 en 85)', () => {
    // De zolder wil koelen en krijgt het overschot; de droger wacht een ronde.
    const s = state({ gridPowerW: -2500, atticC: 26 });
    const d = decide({ config: exampleSite, state: s, strategies: defaultStrategies() });
    expect(d.commands.some((c) => c.kind === 'setAction' && c.action === 'cool')).toBe(true);
    expect(d.explanation.deferrables?.[0]).toMatchObject({ state: 'waiting', reason: 'stabilisation_active' });
    expect(dryer(state({ gridPowerW: -2500, stabilising: true }))).toMatchObject({ reason: 'stabilisation_active' });
  });

  it('niet in de failsafe en niet als de bewoner de regeling terugtrok', () => {
    expect(dryer(state({ healthy: false }))).toMatchObject({ state: 'waiting', reason: 'failsafe_unreliable_input' });
    expect(dryer(state({ modeOverride: 'handmatig' }))).toMatchObject({ state: 'waiting', reason: 'mode_excludes_action' });
  });

  it('niet als de hoofdzekering het niet draagt, ook niet om 15:00 (besluit 78)', () => {
    const late = Date.UTC(2026, 7, 28, 13, 5, 0);
    // 31 A op een grens van 33 A: 600 W is 2,6 A, en dat past niet.
    expect(dryer(state({ gridPowerW: 7100, currentA: 31, nowMs: late }))).toMatchObject({ state: 'waiting', reason: 'insufficient_current_budget' });
  });

  it('geeft nooit een opdracht: dat komt pas met stap B', () => {
    const d = decide({ config: exampleSite, state: state({ gridPowerW: -900 }), strategies: defaultStrategies() });
    expect(d.commands.filter((c) => 'actuatorId' in c && c.actuatorId === 'droger')).toEqual([]);
  });

  it('kan in de volgorde op zon voor een zone gaan, maar nooit voor comfort (besluit 176)', () => {
    // 22° op zolder: geen comfort (koelen boven 22,5°), wel koelen op zon tot 21,5°.
    const opZon = state({ gridPowerW: -1500, atticC: 22 });
    const koeltOpZon = (config: SiteConfig) => decide({ config, state: opZon, strategies: defaultStrategies() }).commands.some((c) => c.kind === 'setAction' && c.action === 'cool');
    // Zonder volgorde: de zolder eerst, de droger wacht een ronde (besluit 68).
    expect(koeltOpZon(exampleSite)).toBe(true);
    expect(dryer(opZon)).toMatchObject({ state: 'waiting', reason: 'stabilisation_active' });
    // De droger vóór de zolder: hij krijgt het overschot, en de zolder wacht.
    const drogerEerst: SiteConfig = { ...exampleSite, sunOrder: [{ kind: 'deferrable', id: 'droger' }, { kind: 'zone', id: 'zolder' }] };
    expect(dryer(opZon, drogerEerst)).toMatchObject({ state: 'would_start', reason: 'surplus_available' });
    expect(koeltOpZon(drogerEerst)).toBe(false);
    const d = decide({ config: drogerEerst, state: opZon, strategies: defaultStrategies() });
    expect(d.rejected.find((r) => r.intent.actuatorId === 'ac-zolder')?.blockedBy).toBe('stabilisation_active');
    // In de schaduw start de droger niets: geen opdracht en geen stabilisatie.
    expect(d.commands.some((c) => c.kind === 'startTimer')).toBe(false);
    // De zolder vóór de droger: zoals zonder volgorde.
    const zolderEerst: SiteConfig = { ...exampleSite, sunOrder: [{ kind: 'zone', id: 'zolder' }, { kind: 'deferrable', id: 'droger' }] };
    expect(koeltOpZon(zolderEerst)).toBe(true);
    expect(dryer(opZon, zolderEerst)).toMatchObject({ state: 'waiting', reason: 'stabilisation_active' });
    // Te weinig zon voor de droger: hij wacht op zon.
    expect(dryer(state({ gridPowerW: -500, atticC: 22 }), drogerEerst)).toMatchObject({ state: 'waiting', reason: 'surplus_insufficient' });
    // Comfort gaat altijd voor: 26° op zolder koelt, ook met de droger vooraan.
    const warm = state({ gridPowerW: -2500, atticC: 26 });
    expect(decide({ config: drogerEerst, state: warm, strategies: defaultStrategies() }).commands.some((c) => c.kind === 'setAction' && c.action === 'cool')).toBe(true);
    expect(dryer(warm, drogerEerst)).toMatchObject({ state: 'waiting', reason: 'stabilisation_active' });
  });

  it('verandert niets zonder uitstelbare apparaten in de configuratie', () => {
    const { deferrables: _gone, ...without } = exampleSite;
    const d = decide({ config: without, state: state(), strategies: defaultStrategies() });
    expect(d.explanation.deferrables).toBeUndefined();
  });
});

describe('de droger zoals hij op 7 oktober echt draaide (besluit 101)', () => {
  const MIN = 60_000;

  it('kent "Loopt" als draaien, en "Klaar" als klaar om te beginnen', () => {
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0 }))).toMatchObject({ state: 'running', reason: 'program_running' });
    expect(dryer(state({ operation: 'Vertraagde start' }))).toMatchObject({ state: 'running' });
    // Eerst aangezet ("Klaar"), daarna klaargezet: dat is gereed.
    expect(dryer(state({ operation: 'Klaar', operationSinceMs: NOW - 10 * MIN, remoteSinceMs: NOW - 5 * MIN }))).toMatchObject({
      state: 'would_start',
      reason: 'surplus_available',
    });
  });

  it('start een droger die al gedraaid heeft nooit nog eens, ook al blijft "start op afstand" aan', () => {
    // 15:20 klaargezet, 15:55 weer "Klaar": er draaide sindsdien een programma.
    const s = state({ operation: 'Klaar', remoteSinceMs: NOW - 40 * MIN, operationSinceMs: NOW - 5 * MIN, nowMs: NOW });
    expect(dryer(s)).toEqual({ id: 'droger', state: 'not_ready', reason: 'program_finished' });
    // Ook na de uiterlijke start van 15:00.
    const late = NOW + 2 * 60 * MIN;
    expect(dryer(state({ operation: 'Klaar', remoteSinceMs: late - 40 * MIN, operationSinceMs: late - 5 * MIN, nowMs: late }))).toMatchObject({
      state: 'not_ready',
    });
    // Aanzetten en klaarzetten in dezelfde minuut is geen programma.
    expect(dryer(state({ operation: 'Klaar', remoteSinceMs: NOW - 5 * MIN, operationSinceMs: NOW - 5 * MIN + 30_000 }))).toMatchObject({
      state: 'would_start',
    });
  });

  it('rekent van "klaar voor" terug naar de uiterlijke start, met de duur van het programma', () => {
    const readyBy = NOW + 4 * 60 * MIN; // 18:00
    const waiting = dryer(state({ gridPowerW: 0, durationMin: 168, readyByMs: readyBy }));
    expect(waiting).toEqual({
      id: 'droger',
      state: 'waiting',
      reason: 'surplus_insufficient',
      durationMin: 168,
      readyByMs: readyBy,
      latestStartMs: readyBy - 168 * MIN,
    });
    // Om 15:05 wacht hij nog: de eindtijd telt, niet de vaste tijd van 15:00.
    const at1505 = NOW + 65 * MIN;
    expect(dryer(state({ gridPowerW: 0, durationMin: 168, readyByMs: readyBy, nowMs: at1505 }))).toMatchObject({ state: 'waiting' });
    // Om 15:12 is het tijd, ook zonder zon.
    expect(dryer(state({ gridPowerW: 0, durationMin: 168, readyByMs: readyBy, nowMs: readyBy - 168 * MIN }))).toMatchObject({
      state: 'would_start',
      reason: 'ready_by_reached',
    });
  });

  it('rekent met drie uur als de duur onbekend is, en de hoofdzekering gaat nog steeds voor', () => {
    const readyBy = NOW + 3 * 60 * MIN;
    expect(dryer(state({ gridPowerW: 0, readyByMs: readyBy }))).toMatchObject({ state: 'would_start', reason: 'ready_by_reached', latestStartMs: NOW });
    // 31 A op een grens van 33 A, zoals hierboven: ook als de tijd dringt.
    expect(dryer(state({ gridPowerW: 7100, currentA: 31, readyByMs: readyBy }))).toMatchObject({ state: 'waiting', reason: 'insufficient_current_budget' });
  });
});

describe('de echte eindtijd, en klaar terwijl hij nog tegen kreuken draait (besluit 167)', () => {
  const MIN = 60_000;

  it('geeft de resterende tijd door zolang het programma loopt', () => {
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0, durationMin: 120, remainingMin: 42 }))).toMatchObject({ state: 'running', remainingMin: 42 });
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0, remainingMin: 42 }))?.doneSinceMs).toBeUndefined();
  });

  it('is klaar bij 0 minuten of 100%, ook al zegt de status nog "Loopt"', () => {
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0, remainingMin: 0, remainingSinceMs: NOW - 25 * MIN }))).toMatchObject({ state: 'running', remainingMin: 0, doneSinceMs: NOW - 25 * MIN });
    expect(dryer(state({ operation: 'Run', gridPowerW: 0, progressPct: 100, progressSinceMs: NOW - 5 * MIN }))).toMatchObject({ doneSinceMs: NOW - 5 * MIN });
  });

  it('is in een pauze of een uitgestelde start nooit klaar', () => {
    expect(dryer(state({ operation: 'Pauze', gridPowerW: 0, remainingMin: 0 }))?.doneSinceMs).toBeUndefined();
    expect(dryer(state({ operation: 'Vertraagde start', gridPowerW: 0, progressPct: 100 }))?.doneSinceMs).toBeUndefined();
  });

  it('rekent zonder die sensoren met de start plus de duur, met tien minuten speling', () => {
    const begon = NOW - 150 * MIN;
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0, durationMin: 135, operationSinceMs: begon }))?.doneSinceMs).toBe(begon + 135 * MIN);
    expect(dryer(state({ operation: 'Loopt', gridPowerW: 0, durationMin: 145, operationSinceMs: begon }))?.doneSinceMs).toBeUndefined();
  });
});
