/*
 * Nieuw in Vast en gepland (besluit 240): een opdracht in stappen, Zeg het als
 * voorstel zonder te bewaren, en klimaat met de hand en witgoed op hun moment.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Diensten } from '../src/web/diensten.js';
import { handTotMs, voerStapUit, type GeplandeDeuren } from '../src/web/gepland-uit.js';
import { leesStap, volgendeMoment } from '../src/web/gepland.js';
import type { Bedienbaar } from '../src/web/opdracht.js';
import { planZin } from '../src/web/routes/gepland.js';
import { handel, leesPlan, type TeDoenDienst } from '../src/web/routes/tedoen.js';
import { Herinneringen, type GeplandeOpdracht } from '../src/web/tedoen.js';

const TZ = 'Europe/Amsterdam';
/** Zondag 1 november 2026 om 15:10 in Nederland. */
const NU = Date.UTC(2026, 10, 1, 14, 10);
const om = (dag: number, uur: number, min = 0) => Date.UTC(2026, 10, dag, uur - 1, min);
const PLEK = { latDeg: 51.9, lonDeg: 5.3 };

async function opslag() {
  const map = await mkdtemp(join(tmpdir(), 'nieuw-gepland-'));
  return new Herinneringen({ map, nu: () => NU, volgende: (o: GeplandeOpdracht, van: number) => (o.moment && o.herhaal ? volgendeMoment(o.moment, o.herhaal, van, TZ, PLEK) : null) });
}

describe('een stap voor later (besluit 240)', () => {
  it('neemt licht, scènes, schermen, klimaat met de hand en witgoed, in hun eigen vorm', () => {
    expect(leesStap({ pad: 'api/licht', body: { doel: 'lamp', id: 'light.keuken', aan: true } })).toMatchObject({ pad: 'api/licht' });
    expect(leesStap({ pad: 'api/scene', body: { id: 'scene.avond' } })).toMatchObject({ pad: 'api/scene' });
    expect(leesStap({ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'stand', standPct: 50 } })).toMatchObject({ pad: 'api/scherm' });
    expect(leesStap({ pad: 'api/hand', body: { id: 'climate.zolder', modus: 'verwarmen', doelC: 21, tot: 'doel' } })).toMatchObject({ pad: 'api/hand' });
    expect(leesStap({ pad: 'api/hand', body: { id: 'switch.kachel', tot: 'uur1' } })).toMatchObject({ pad: 'api/hand' });
    expect(leesStap({ pad: 'api/witgoed', body: { id: 'droger', start: true } })).toMatchObject({ pad: 'api/witgoed' });
  });

  it('weigert andere deuren en een verkeerde vorm', () => {
    expect(typeof leesStap({ pad: 'api/klimaat', body: {} })).toBe('string');
    expect(typeof leesStap({ pad: 'api/hand', body: { id: 'climate.zolder', doelC: 40, tot: 'doel' } })).toBe('string');
    expect(typeof leesStap({ pad: 'api/hand', body: { id: 'climate.zolder', doelC: 21, tot: 'morgen' } })).toBe('string');
    expect(typeof leesStap({ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'stop' } })).toBe('string');
    expect(typeof leesStap({ pad: 'api/witgoed', body: { id: 'droger' } })).toBe('string');
  });
});

describe('Nieuw: een opdracht in stappen (besluit 240)', () => {
  const plan = {
    actie: 'plan',
    tekst: 'Zolder verwarmen tot 21°',
    stappen: [{ pad: 'api/hand', body: { id: 'climate.zolder', modus: 'verwarmen', doelC: 21, tot: 'doel' } }],
    moment: { soort: 'tijd', uur: 7, minuut: 0 },
    herhaal: { soort: 'werkdagen' },
  };

  it('leest wat, wanneer en hoe vaak, en eist wanneer en hoe vaak', () => {
    expect(leesPlan(plan)).toMatchObject({ tekst: 'Zolder verwarmen tot 21°', opdracht: { zon: null, herhaal: { soort: 'werkdagen' }, aan: true } });
    expect(typeof leesPlan({ ...plan, herhaal: undefined })).toBe('string');
    expect(typeof leesPlan({ ...plan, stappen: [] })).toBe('string');
    expect(typeof leesPlan({ ...plan, tekst: '' })).toBe('string');
  });

  it('bewaart hem met het eerste moment, op naam van wie hem maakte', async () => {
    const s = await opslag();
    const t = { keus: () => ({ aan: true }), herinneringen: s, naamVan: () => 'Ricardo' } as unknown as TeDoenDienst;
    const uit = await handel(t, plan, { userId: 'u1' } as never);
    expect(uit).toMatchObject({ status: 200, antwoord: { ok: true, ms: om(2, 7) } });
    expect((await s.gepland())[0]).toMatchObject({ tekst: 'Zolder verwarmen tot 21°', voor: 'u1', naam: 'Ricardo', opdracht: { moment: { soort: 'tijd', uur: 7, minuut: 0 } } });
    // Geen dag gekozen: dan komt er geen moment.
    expect((await handel(t, { ...plan, herhaal: { soort: 'dagen', dagen: [] } }, null)).status).toBe(400);
  });
});

describe('Zeg het: alleen een voorstel (besluit 240)', () => {
  it('leest de zin, maar bewaart niets', async () => {
    const s = await opslag();
    const lijst: Bedienbaar = {
      kamers: [],
      zones: [],
      lampen: [],
      scenes: [],
      schermen: [{ id: 'cover.screen', naam: 'Screen', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 }],
      etages: [],
      recept: null,
    };
    const d = { options: { location: () => PLEK } } as unknown as Diensten;
    const uit = await planZin(d, s, 'doe elke dag een kwartier voor zonsondergang de screen dicht', lijst, null, TZ, 'nl', null, () => null, NU, null, true);
    expect(uit?.['voorstel']).toMatchObject({ moment: { soort: 'zon', zon: 'onder', minuten: -15 }, herhaal: { soort: 'dag' }, stappen: [{ pad: 'api/scherm' }] });
    expect(String(uit?.['antwoord'])).toMatch(/^Zo: elke dag een kwartier voor zonsondergang, doe de screen dicht\.$/);
    expect(await s.gepland()).toEqual([]);
  });
});

describe('op het moment zelf (besluit 240)', () => {
  const log: unknown[][] = [];
  const ok = async () => ({ ok: true });
  const deuren: GeplandeDeuren = {
    hand: {
      zet: async (...a) => (log.push(['zet', ...a]), { ok: true }),
      zetKnop: async (...a) => (log.push(['knop', ...a]), { ok: true }),
      schakelAan: async (...a) => (log.push(['stekker', ...a]), { ok: true }),
      isKnop: (id) => id === 'climate.radiator',
    },
    witgoed: async (id) => (log.push(['witgoed', id]), { ok: true }),
    licht: ok,
    tz: TZ,
  };

  it('zet klimaat met de hand tot het eind van het dagdeel, of een of twee uur', async () => {
    log.length = 0;
    const dagdeel = handTotMs('dagdeel', NU, TZ);
    expect(handTotMs('uur2', NU, TZ)).toBe(NU + 7_200_000);
    await voerStapUit({ pad: 'api/hand', body: { id: 'climate.zolder', modus: 'verwarmen', doelC: 21, tot: 'doel' } }, deuren, NU);
    await voerStapUit({ pad: 'api/hand', body: { id: 'climate.radiator', doelC: 19, tot: 'uur1' } }, deuren, NU);
    await voerStapUit({ pad: 'api/hand', body: { id: 'switch.kachel', tot: 'uur2' } }, deuren, NU);
    await voerStapUit({ pad: 'api/witgoed', body: { id: 'droger', start: true } }, deuren, NU);
    expect(log).toEqual([
      ['zet', 'climate.zolder', 'verwarmen', 21, dagdeel, true],
      ['knop', 'climate.radiator', 19, NU + 3_600_000, false],
      ['stekker', 'switch.kachel', NU + 7_200_000],
      ['witgoed', 'droger'],
    ]);
  });

  it('doet niets als de deur er niet is (uit bij Functies, of niet in de add-on)', async () => {
    expect(await voerStapUit({ pad: 'api/hand', body: { id: 'climate.zolder', doelC: 21, tot: 'doel' } }, { tz: TZ }, NU)).toBeNull();
    expect(await voerStapUit({ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'dicht' } }, deuren, NU)).toBeNull();
  });
});
