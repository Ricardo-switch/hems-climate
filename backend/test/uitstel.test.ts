/**
 * "Klaar voor" bij de droger (besluit 101): de deur die alleen een eindtijd
 * bewaart, en de tijd van vandaag of morgen in de tijdzone van het huis.
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DeferrableStateCode } from '../src/core/decision.js';
import { residentDeferrables } from '../src/web/resident.js';
import { clockIn, nextLocalTime } from '../src/web/today.js';
import { UITSTEL_FILE, UitstelStore } from '../src/web/uitstel.js';
import { exampleSite } from './site.js';

const TZ = 'Europe/Amsterdam';
// 14:00 UTC is 16:00 in Amsterdam (zomertijd).
const NOW = Date.UTC(2026, 9, 7, 14, 0, 0);

describe('een tijd van vandaag of morgen', () => {
  it('neemt vandaag als de tijd nog komt, anders morgen', () => {
    expect(nextLocalTime(NOW, '18:00', TZ)).toBe(Date.UTC(2026, 9, 7, 16, 0));
    expect(nextLocalTime(NOW, '07:00', TZ)).toBe(Date.UTC(2026, 9, 8, 5, 0));
    expect(clockIn(Date.UTC(2026, 9, 7, 16, 0), TZ)).toBe('18:00');
  });

  it('klopt ook over de wisseling naar wintertijd heen', () => {
    // Zaterdag 24 oktober 22:00 in Amsterdam; zondag gaat de klok terug.
    const sat = Date.UTC(2026, 9, 24, 20, 0);
    expect(nextLocalTime(sat, '07:00', TZ)).toBe(Date.UTC(2026, 9, 25, 6, 0));
  });
});

async function store(status: DeferrableStateCode | null = 'waiting', now = NOW) {
  const logDir = await mkdtemp(join(tmpdir(), 'uitstel-'));
  let changes = 0;
  const s = new UitstelStore({ logDir, config: exampleSite, status: () => status, now: () => now, onChange: () => void changes++ });
  await s.load();
  return { s, logDir, changes: () => changes };
}

describe('de deur voor "klaar voor"', () => {
  it('bewaart een eindtijd voor een droger die klaarstaat, en vraagt om opnieuw te beslissen', async () => {
    const { s, logDir, changes } = await store('waiting');
    expect(await s.set({ id: 'droger', klaarVoor: '18:00' })).toEqual({ ok: true, id: 'droger', klaarVoorMs: Date.UTC(2026, 9, 7, 16, 0) });
    expect(s.readyBy).toEqual({ droger: Date.UTC(2026, 9, 7, 16, 0) });
    expect(changes()).toBe(1);
    expect(JSON.parse(await readFile(join(logDir, UITSTEL_FILE), 'utf-8'))).toEqual({ versie: 1, klaarVoor: { droger: Date.UTC(2026, 9, 7, 16, 0) } });
    // Na een herstart is hij er nog.
    const again = new UitstelStore({ logDir, config: exampleSite, status: () => 'waiting' });
    await again.load();
    expect(again.readyBy).toEqual(s.readyBy);
    expect(await s.set({ id: 'droger', klaarVoor: null })).toMatchObject({ ok: true, klaarVoorMs: null });
    expect(s.readyBy).toEqual({});
  });

  it('weigert een droger die niet klaarstaat of al draait, een onbekend apparaat en een rare tijd', async () => {
    expect(await (await store('not_ready')).s.set({ id: 'droger', klaarVoor: '18:00' })).toMatchObject({ ok: false, status: 409 });
    expect(await (await store('running')).s.set({ id: 'droger', klaarVoor: '18:00' })).toMatchObject({ ok: false, status: 409 });
    expect(await (await store(null)).s.set({ id: 'droger', klaarVoor: '18:00' })).toMatchObject({ ok: false, status: 409 });
    const { s } = await store();
    expect(await s.set({ id: 'wasmachine', klaarVoor: '18:00' })).toMatchObject({ ok: false, status: 404 });
    expect(await s.set({ id: 'droger', klaarVoor: '25:00' })).toMatchObject({ ok: false, status: 400 });
    expect(await s.set({ id: 'droger', klaarVoor: 1800 })).toMatchObject({ ok: false, status: 400 });
    expect(await s.set(['droger'])).toMatchObject({ ok: false, status: 400 });
    expect(s.readyBy).toEqual({});
  });

  it('laat de eindtijd vallen als het programma klaar is of de deur openging, niet terwijl hij draait', async () => {
    const { s } = await store();
    await s.set({ id: 'droger', klaarVoor: '18:00' });
    await s.prune([{ id: 'droger', state: 'running', reason: 'program_running' }]);
    expect(s.readyBy).toHaveProperty('droger');
    await s.prune([{ id: 'droger', state: 'not_ready', reason: 'program_finished' }]);
    expect(s.readyBy).toEqual({});
  });
});

describe('de droger op het scherm Apparaten', () => {
  const at = Date.UTC(2026, 9, 7, 16, 0);
  // 14:00 in Amsterdam.
  const now = Date.UTC(2026, 9, 7, 12, 0);
  it('zegt wanneer hij uiterlijk begint om op tijd klaar te zijn', () => {
    const [d] = residentDeferrables(
      exampleSite,
      [{ id: 'droger', state: 'waiting', reason: 'surplus_insufficient', durationMin: 168, readyByMs: at, latestStartMs: at - 168 * 60_000 }],
      now,
    );
    const { stappen, ...rest } = d!;
    expect(rest).toEqual({
      id: 'droger',
      naam: 'Droger',
      stand: 'waiting',
      kop: 'Klaargezet · wacht op zon',
      zin: 'Ik begin zodra er zon over is. Komt er niet genoeg, dan begin ik om 15:12, op tijd voor 18:00.',
      klaarVoor: '18:00',
      uiterlijk: '15:12',
      duurMin: 168,
      restMin: null,
      klaarSindsMs: null,
      kanKiezen: true,
      // Om 14:00 met 2 u 48 kan 15:00 niet meer.
      keuzes: [
        { tekst: '18:00', waarde: '18:00' },
        { tekst: '21:00', waarde: '21:00' },
        { tekst: 'morgen 07:00', waarde: '07:00' },
      ],
    });
    // Het blad (besluit 238): elk half uur dat nog te halen is, met hoe laat hij dan uiterlijk begint.
    expect(stappen[0]).toMatchObject({ tekst: '17:00', waarde: '17:00' });
    expect(stappen[0]!.klaarMs - stappen[0]!.beginMs).toBe(168 * 60_000);
    expect(stappen.at(-1)!.klaarMs - now).toBeLessThanOrEqual(24 * 3_600_000);
    expect(stappen.map((x) => x.waarde)).toContain('18:30');
  });

  it('zonder eindtijd de vaste uiterlijke start, en wat te doen als hij niet klaarstaat of klaar is', () => {
    const [waiting] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'waiting', reason: 'surplus_insufficient' }], now);
    expect(waiting?.zin).toBe('Ik begin zodra er zon over is, en uiterlijk om 15:00.');
    const [idle] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'not_ready', reason: 'remote_start_not_allowed' }], now);
    expect(idle).toMatchObject({ kop: 'Niet klaargezet', kanKiezen: false, uiterlijk: null });
    const [done] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'not_ready', reason: 'program_finished' }], now);
    expect(done?.kop).toBe('Klaar · het programma is afgelopen');
    const [late] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'would_start', reason: 'ready_by_reached', readyByMs: at, latestStartMs: at - 60 * 60_000 }], now);
    expect(late?.zin).toBe('Ik zou hem nu starten, anders is hij niet op tijd klaar voor 18:00.');
    const [en] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'running', reason: 'program_running', readyByMs: at }], now, 'en');
    expect(en?.zin).toBe('The programme is running; it will be done by 18:00.');
  });

  it('klaar met drogen terwijl de trommel nog tegen kreuken draait (besluit 167)', () => {
    const sinds = now - 20 * 60_000;
    const [d] = residentDeferrables(exampleSite, [{ id: 'droger', state: 'running', reason: 'program_running', remainingMin: 0, doneSinceMs: sinds }], now);
    expect(d).toMatchObject({ stand: 'running', kop: 'Klaar · draait nog tegen kreuken', restMin: 0, klaarSindsMs: sinds });
    expect(d?.zin).toMatch(/^Het drogen is klaar sinds \d\d:\d\d\. De trommel draait nog af en toe tegen kreuken, tot je de deur opent\.$/);
  });
});
