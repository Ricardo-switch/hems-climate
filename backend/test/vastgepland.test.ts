/*
 * Vast en gepland (besluit 234): herhalen, de zon met minuten erbij, het
 * volgende moment na elke keer, pauzeren en aanpassen.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { leesHerhaal, leesPlanTijd, leesZonMinuten, volgendeMoment, volgendeZon, type Herhaal, type Moment } from '../src/web/gepland.js';
import type { Diensten } from '../src/web/diensten.js';
import type { Bedienbaar } from '../src/web/opdracht.js';
import { herhaalZin, momentZin, planZin } from '../src/web/routes/gepland.js';
import { leesAanpassing } from '../src/web/routes/tedoen.js';
import { Herinneringen, type GeplandeOpdracht } from '../src/web/tedoen.js';

const TZ = 'Europe/Amsterdam';
/** Zondag 1 november 2026 om 15:10 in Nederland (wintertijd, UTC+1). */
const NU = Date.UTC(2026, 10, 1, 14, 10);
/** Een tijd op een dag in november, Nederlandse tijd. */
const om = (dag: number, uur: number, min = 0) => Date.UTC(2026, 10, dag, uur - 1, min);
const PLEK = { latDeg: 51.9, lonDeg: 5.3 };
const STAP = [{ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'dicht' } }];

describe('hoe vaak, uit een zin (besluit 234)', () => {
  it('leest elke dag, werkdagen, het weekend en gekozen dagen', () => {
    expect(leesHerhaal('elke dag om 8 uur de lamp aan')).toEqual({ herhaal: { soort: 'dag' }, rest: 'om 8 uur de lamp aan' });
    expect(leesHerhaal('doe elke werkdag om zeven de lamp aan').herhaal).toEqual({ soort: 'werkdagen' });
    expect(leesHerhaal('doordeweeks om zeven de lamp aan').herhaal).toEqual({ soort: 'werkdagen' });
    expect(leesHerhaal('in het weekend om negen de screens open').herhaal).toEqual({ soort: 'weekend' });
    expect(leesHerhaal('elke maandag en woensdag om 7 uur de lamp aan')).toEqual({ herhaal: { soort: 'dagen', dagen: [1, 3] }, rest: 'om 7 uur de lamp aan' });
    expect(leesHerhaal('every weekday at 7 turn on the lamp').herhaal).toEqual({ soort: 'werkdagen' });
  });

  it('laat bij "elke ochtend" het dagdeel staan, en zonder herhaling is het een keer', () => {
    expect(leesHerhaal('elke ochtend om zeven de lamp aan')).toEqual({ herhaal: { soort: 'dag' }, rest: 'ochtend om zeven de lamp aan' });
    expect(leesHerhaal('om 22:00 de screens dicht')).toEqual({ herhaal: { soort: 'een' }, rest: 'om 22:00 de screens dicht' });
    // "Op maandag" is één keer.
    expect(leesHerhaal('op maandag om 7 uur de lamp aan').herhaal).toEqual({ soort: 'een' });
  });

  it('leest de zon met minuten erbij', () => {
    expect(leesZonMinuten('een kwartier voor zonsondergang de screens dicht')).toEqual({ zon: 'onder', minuten: -15, rest: 'de screens dicht' });
    expect(leesZonMinuten('10 minuten na zonsopkomst de screens open')).toEqual({ zon: 'op', minuten: 10, rest: 'de screens open' });
    expect(leesZonMinuten('een half uur voor de zonsondergang de lamp aan')?.minuten).toBe(-30);
    expect(leesZonMinuten('na zonsondergang de screens dicht')).toBeNull();
  });
});

describe('het volgende moment (besluit 234)', () => {
  const zevenUur: Moment = { soort: 'tijd', uur: 7, minuut: 0 };

  it('slaat dagen over die niet passen', () => {
    // Zondagmiddag: werkdagen om zeven is maandag, het weekend om zeven is volgende zaterdag.
    expect(volgendeMoment(zevenUur, { soort: 'werkdagen' }, NU, TZ, PLEK)).toBe(om(2, 7));
    expect(volgendeMoment(zevenUur, { soort: 'weekend' }, NU, TZ, PLEK)).toBe(om(7, 7));
    expect(volgendeMoment(zevenUur, { soort: 'dagen', dagen: [3] }, NU, TZ, PLEK)).toBe(om(4, 7));
    expect(volgendeMoment({ soort: 'tijd', uur: 20, minuut: 30 }, { soort: 'dag' }, NU, TZ, PLEK)).toBe(om(1, 20, 30));
    expect(volgendeMoment(zevenUur, { soort: 'dagen', dagen: [] }, NU, TZ, PLEK)).toBeNull();
  });

  it('rekent de zon van die dag uit, met de minuten erbij', () => {
    const onder = volgendeZon('onder', om(1, 0), PLEK)!;
    const tienErvoor = volgendeMoment({ soort: 'zon', zon: 'onder', minuten: -10 }, { soort: 'dag' }, NU, TZ, PLEK)!;
    expect(tienErvoor).toBe(onder - 10 * 60_000);
    // Al voorbij vandaag: dan morgen.
    const laat = volgendeMoment({ soort: 'zon', zon: 'onder', minuten: -10 }, { soort: 'dag' }, onder, TZ, PLEK)!;
    expect(laat).toBeGreaterThan(onder + 20 * 3_600_000);
  });

  it('leest uit een hele zin wat, wanneer en hoe vaak', () => {
    const p = leesPlanTijd('Doe elke werkdag een kwartier voor zonsondergang de screens dicht', NU, TZ, PLEK)!;
    expect(p).toMatchObject({ rest: 'doe de screens dicht', zon: 'onder', moment: { soort: 'zon', zon: 'onder', minuten: -15 }, herhaal: { soort: 'werkdagen' } });
    // Zondag: de eerste keer is maandag.
    expect(new Date(p.ms).toISOString().slice(0, 10)).toBe('2026-11-02');
    const q = leesPlanTijd('zet elke dag om 22:30 de lamp in de keuken uit', NU, TZ, PLEK)!;
    expect(q).toMatchObject({ ms: om(1, 22, 30), moment: { soort: 'tijd', uur: 22, minuut: 30 }, herhaal: { soort: 'dag' } });
  });

  it('zegt het in gewone woorden', () => {
    expect(herhaalZin({ soort: 'dagen', dagen: [1, 3, 5] }, 'nl')).toBe('elke maandag, woensdag en vrijdag');
    expect(herhaalZin({ soort: 'werkdagen' }, 'en')).toBe('every weekday');
    expect(herhaalZin({ soort: 'een' }, 'nl')).toBe('');
    expect(momentZin({ soort: 'zon', zon: 'onder', minuten: -15 }, 'nl')).toBe('een kwartier voor zonsondergang');
    expect(momentZin({ soort: 'zon', zon: 'op', minuten: 10 }, 'nl')).toBe('10 minuten na zonsopkomst');
    expect(momentZin({ soort: 'tijd', uur: 7, minuut: 5 }, 'nl')).toBe('om 07:05');
  });
});

describe('vast en gepland bewaren (besluit 234)', () => {
  async function opslag(nu: { ms: number }) {
    const map = await mkdtemp(join(tmpdir(), 'vastgepland-'));
    return new Herinneringen({
      map,
      nu: () => nu.ms,
      volgende: (o: GeplandeOpdracht, van: number) => (o.moment && o.herhaal ? volgendeMoment(o.moment, o.herhaal, van, TZ, PLEK) : null),
    });
  }
  const vast = (herhaal: Herhaal, extra: Partial<GeplandeOpdracht> = {}): GeplandeOpdracht => ({ stappen: STAP, zon: null, moment: { soort: 'tijd', uur: 7, minuut: 0 }, herhaal, aan: true, ...extra });

  it('komt na elke keer terug op het volgende moment', async () => {
    const nu = { ms: om(2, 6, 59) };
    const s = await opslag(nu);
    const g = await s.voeg({ tekst: 'Lamp aan', ms: om(2, 7), voor: null, naam: null, opdracht: vast({ soort: 'werkdagen' }) });
    nu.ms = om(2, 7, 0) + 5_000;
    const uit = await s.ronde();
    expect(uit.map((x) => x.id)).toEqual([g.id]);
    const daarna = (await s.gepland())[0]!;
    expect(daarna).toMatchObject({ id: g.id, ms: om(3, 7), status: 'wacht' });
    expect(daarna.opdracht?.laatstMs).toBe(nu.ms);
  });

  it('slaat zijn beurt over als hij gepauzeerd is, en een keer is daarna klaar', async () => {
    const nu = { ms: om(2, 6, 59) };
    const s = await opslag(nu);
    await s.voeg({ tekst: 'Vast', ms: om(2, 7), voor: null, naam: null, opdracht: vast({ soort: 'dag' }, { aan: false }) });
    await s.voeg({ tekst: 'Een keer', ms: om(2, 7), voor: null, naam: null, opdracht: vast({ soort: 'een' }) });
    nu.ms = om(2, 7, 1);
    const uit = await s.ronde();
    expect(uit.map((x) => x.tekst)).toEqual(['Een keer']);
    const over = await s.gepland();
    expect(over.map((x) => [x.tekst, x.ms])).toEqual([['Vast', om(3, 7)]]);
  });

  it('past het moment, de herhaling en aan of uit aan', async () => {
    const nu = { ms: NU };
    const s = await opslag(nu);
    const g = await s.voeg({ tekst: 'Screens dicht', ms: om(2, 7), voor: null, naam: null, opdracht: vast({ soort: 'werkdagen' }) });
    expect(await s.pasAan(g.id, { moment: { soort: 'tijd', uur: 21, minuut: 15 }, herhaal: { soort: 'dag' } })).toBe(true);
    expect((await s.gepland())[0]).toMatchObject({ ms: om(1, 21, 15), opdracht: { herhaal: { soort: 'dag' }, zon: null } });
    expect(await s.pasAan(g.id, { aan: false, overslaanWeg: true })).toBe(true);
    expect((await s.gepland())[0]?.opdracht).toMatchObject({ aan: false, overslaanWeg: true });
    // Geen dag gekozen: dan komt er geen moment, en blijft het zoals het was.
    expect(await s.pasAan(g.id, { herhaal: { soort: 'dagen', dagen: [] } })).toBe(false);
    expect(await s.pasAan('bestaat-niet', { aan: true })).toBe(false);
  });

  it('legt met je stem een vaste opdracht vast, en zegt wanneer de eerste keer is', async () => {
    const nu = { ms: NU };
    const s = await opslag(nu);
    const keuken = { id: 'light.keuken', naam: 'Licht keuken', kamerId: 'keuken', kamer: 'Keuken', dimbaar: true, kleurtemp: true, aan: false, helderheidPct: null, zone: null };
    const lijst: Bedienbaar = {
      kamers: [{ id: 'keuken', naam: 'Keuken', etageId: 'beneden', lampen: [keuken] }],
      zones: [],
      lampen: [keuken],
      scenes: [],
      schermen: [{ id: 'cover.screen', naam: 'Screen', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 }],
      etages: [{ id: 'beneden', naam: 'Beneden' }],
      recept: null,
    };
    const d = { options: { location: () => PLEK } } as unknown as Diensten;
    const uit = await planZin(d, s, 'zet elke werkdag om zeven uur de lamp in de keuken aan', lijst, null, TZ, 'nl', null, () => null, NU);
    expect(uit?.['antwoord']).toBe('Goed, elke werkdag om 07:00: zet de lamp in de keuken aan. De eerste keer is morgen om 07:00.');
    const g = (await s.gepland())[0]!;
    expect(g).toMatchObject({ ms: om(2, 7), opdracht: { herhaal: { soort: 'werkdagen' }, moment: { soort: 'tijd', uur: 7, minuut: 0 }, aan: true } });
    const zon = await planZin(d, s, 'doe elke dag een kwartier voor zonsondergang de screen dicht', lijst, null, TZ, 'nl', null, () => null, NU);
    expect(String(zon?.['antwoord'])).toMatch(/^Goed, elke dag een kwartier voor zonsondergang: doe de screen dicht\. De eerste keer is vandaag om 16:\d\d\.$/);
  });

  it('neemt alleen een aanpassing die klopt', () => {
    expect(leesAanpassing({ aan: false, moment: { soort: 'zon', zon: 'onder', minuten: -10 }, herhaal: { soort: 'dagen', dagen: [5, 1, 1] } })).toEqual({ aan: false, moment: { soort: 'zon', zon: 'onder', minuten: -10 }, herhaal: { soort: 'dagen', dagen: [1, 5] } });
    expect(typeof leesAanpassing({ moment: { soort: 'tijd', uur: 25, minuut: 0 } })).toBe('string');
    expect(typeof leesAanpassing({ herhaal: { soort: 'dagen', dagen: [] } })).toBe('string');
    expect(typeof leesAanpassing({ aan: 'ja' })).toBe('string');
  });
});
