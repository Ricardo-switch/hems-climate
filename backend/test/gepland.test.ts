/*
 * Later uitvoeren (besluit 218): de tijd en de zon uit een opdracht lezen,
 * een geplande opdracht bewaren en uitvoeren, en annuleren. En wat er meekwam:
 * vragen over een dag in de agenda, de afgevinkte weghalen, en een getal bij
 * een tijd dat geen helderheid is.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isTodoCall } from '../src/adapters/homeassistant/client.js';
import { isAnnuleer, isGeplandVraag, leesPlanTijd, volgendeZon } from '../src/web/gepland.js';
import { herkenOpdracht, type BedienLamp, type Bedienbaar } from '../src/web/opdracht.js';
import { Herinneringen, leesTeDoenVraag } from '../src/web/tedoen.js';

const TZ = 'Europe/Amsterdam';
/** Maandag 2 november 2026 om 12:00 in Nederland (wintertijd, UTC+1). */
const NU = Date.UTC(2026, 10, 2, 11, 0);
const om = (dag: number, uur: number, min = 0) => Date.UTC(2026, 10, dag, uur - 1, min);
const PLEK = { latDeg: 51.9, lonDeg: 5.3 };

const lamp = (id: string, naam: string, kamerId: string, kamer: string): BedienLamp => ({ id, naam, kamerId, kamer, dimbaar: true, kleurtemp: true, aan: false, helderheidPct: null, zone: null });
function huis(): Bedienbaar {
  const keuken = lamp('light.keuken', 'Licht keuken', 'keuken', 'Keuken');
  const kamers = [{ id: 'keuken', naam: 'Keuken', etageId: 'beneden', lampen: [keuken] }];
  return {
    kamers,
    zones: [],
    lampen: [keuken],
    scenes: [],
    schermen: [{ id: 'cover.screen', naam: 'Screen', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 }],
    etages: [{ id: 'beneden', naam: 'Beneden' }],
    recept: null,
  };
}

describe('wanneer, uit een opdracht', () => {
  it('leest een gewone tijd en laat de opdracht over', () => {
    const p = leesPlanTijd('Zet over 5 minuten de lamp in de keuken aan', NU, TZ, PLEK);
    expect(p).toMatchObject({ ms: NU + 5 * 60_000, rest: 'zet de lamp in de keuken aan', zon: null, herhaal: { soort: 'een' } });
    expect(leesPlanTijd('doe om 22:00 de screens dicht', NU, TZ, PLEK)).toMatchObject({ ms: om(2, 22), rest: 'doe de screens dicht', zon: null });
    expect(leesPlanTijd('morgen om 7 uur het licht in de keuken aan', NU, TZ, PLEK)).toMatchObject({ ms: om(3, 7), zon: null });
    // Zonder tijd: gewoon nu.
    expect(leesPlanTijd('zet de lamp in de keuken aan', NU, TZ, PLEK)).toBeNull();
  });

  it('rekent zonsondergang en zonsopkomst uit voor de plek', () => {
    const p = leesPlanTijd('Doe na zonsondergang de screens dicht', NU, TZ, PLEK);
    expect(p?.zon).toBe('onder');
    expect(p?.rest).toBe('doe de screens dicht');
    // Begin november gaat de zon in het midden van het land rond tien over vijf onder.
    expect(p!.ms).toBeGreaterThan(om(2, 16, 50));
    expect(p!.ms).toBeLessThan(om(2, 17, 30));
    const op = leesPlanTijd('morgen bij zonsopkomst de screens open', NU, TZ, PLEK);
    expect(op?.zon).toBe('op');
    expect(op!.ms).toBeGreaterThan(om(3, 7, 15));
    expect(op!.ms).toBeLessThan(om(3, 7, 50));
    // Na zonsondergang is de volgende ondergang morgen.
    expect(volgendeZon('onder', om(2, 20), PLEK)).toBeGreaterThan(om(3, 16, 50));
    // Zonder plek geen zon.
    expect(leesPlanTijd('na zonsondergang de screens dicht', NU, TZ, null)).toBeNull();
  });

  it('herkent annuleren en de vraag wat er gepland staat', () => {
    expect(isAnnuleer('Annuleer')).toBe(true);
    expect(isAnnuleer('annuleer dat')).toBe(true);
    expect(isAnnuleer('annuleer de herinnering voor morgen')).toBe(false);
    expect(isGeplandVraag('Wat staat er gepland?')).toBe(true);
    expect(isGeplandVraag('Wat ga je straks doen?')).toBe(true);
    expect(isGeplandVraag('Wat staat er morgen op de agenda?')).toBe(false);
  });
});

describe('een getal bij een tijd is geen helderheid', () => {
  it('zet de lamp aan, niet op 5%', () => {
    const h = herkenOpdracht('zet over 5 minuten de lamp in de keuken aan', huis(), 'nl');
    expect(h?.ok).toBe(true);
    if (h?.ok) expect(h.opdracht.antwoord).not.toContain('5%');
    const h2 = herkenOpdracht('zet de lamp in de keuken op 40', huis(), 'nl');
    expect(h2?.ok).toBe(true);
    if (h2?.ok) expect(h2.opdracht.antwoord).toContain('40%');
  });
});

describe('een geplande opdracht bewaren', () => {
  it('speelt niet op de wand, komt één keer terug om uit te voeren, en is dan klaar', async () => {
    let nu = NU;
    const store = new Herinneringen({ map: await mkdtemp(join(tmpdir(), 'gepland-')), nu: () => nu });
    const stappen = [{ pad: 'api/licht', body: { doel: 'lamp', id: 'light.keuken', aan: true } }];
    const g = await store.voeg({ tekst: 'Zet de lamp in de keuken aan', ms: NU + 5 * 60_000, voor: null, naam: null, opdracht: { stappen, zon: null } });
    expect(g.id.startsWith('g')).toBe(true);
    expect((await store.gepland()).map((x) => x.id)).toEqual([g.id]);
    nu = NU + 6 * 60_000;
    const uit = await store.ronde();
    expect(uit).toHaveLength(1);
    expect(uit[0]!.opdracht?.stappen).toEqual(stappen);
    expect(uit[0]!.status).toBe('klaar');
    expect(await store.speelt()).toEqual([]);
    expect(await store.gepland()).toEqual([]);
    // Een volgende ronde doet hem niet nog eens.
    expect(await store.ronde()).toEqual([]);
  });

  it('kan geannuleerd worden voordat het zover is', async () => {
    const store = new Herinneringen({ map: null, nu: () => NU });
    const g = await store.voeg({ tekst: 'Doe de screens dicht', ms: NU + 3_600_000, voor: null, naam: null, opdracht: { stappen: [{ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'dicht' } }], zon: 'onder' } });
    await store.klaar(g.id);
    expect(await store.gepland()).toEqual([]);
  });
});

describe('meegekomen', () => {
  it('leest een dag van de week, overmorgen en volgende week in de agenda', () => {
    expect(leesTeDoenVraag('Wat staat er dinsdag op de agenda?')).toBe('wd2');
    expect(leesTeDoenVraag('Welke afspraken heb ik zaterdag?')).toBe('wd6');
    expect(leesTeDoenVraag('Wat staat er overmorgen?')).toBe('overmorgen');
    expect(leesTeDoenVraag('Wat staat er volgende week op de agenda?')).toBe('volgendeWeek');
    expect(leesTeDoenVraag('Wat staat er op de agenda?')).toBe('vandaag');
    // Geen agenda: het weer, en wat er gepland staat.
    expect(leesTeDoenVraag('Wat is het weer morgen?')).toBeNull();
    expect(leesTeDoenVraag('Wat staat er gepland?')).toBeNull();
  });

  it('laat de afgevinkte van één lijst weghalen, en verder niets', () => {
    expect(isTodoCall('todo', 'remove_completed_items', {}, { entity_id: 'todo.to_do' })).toBe(true);
    expect(isTodoCall('todo', 'remove_completed_items', { item: 'x' }, { entity_id: 'todo.to_do' })).toBe(false);
    expect(isTodoCall('todo', 'remove_completed_items', {}, { entity_id: ['todo.a', 'todo.b'] })).toBe(false);
    expect(isTodoCall('todo', 'remove_item', { item: 'x' }, { entity_id: 'todo.to_do' })).toBe(false);
  });
});
