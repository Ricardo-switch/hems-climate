/*
 * Te doen (besluit 216): tijden en zinnen lezen, afval herkennen, en de
 * herinneringen bewaren.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isTodoCall } from '../src/adapters/homeassistant/client.js';
import {
  afvalSoort,
  HERINNERINGEN_BESTAND,
  Herinneringen,
  isGedaan,
  leesAfspraken,
  leesHerinnering,
  leesLater,
  leesLijst,
  leesLijstZin,
  leesTeDoenVraag,
  leesTijd,
  SPEELT_MS,
} from '../src/web/tedoen.js';

const TZ = 'Europe/Amsterdam';
/** Maandag 2 november 2026 om 19:42 in Nederland (wintertijd, UTC+1). */
const NU = Date.UTC(2026, 10, 2, 18, 42);
const om = (dag: number, uur: number, min = 0) => Date.UTC(2026, 10, dag, uur - 1, min);
const tijd = (zin: string) => leesTijd(zin, NU, TZ)?.ms ?? null;

describe('een tijd lezen', () => {
  it('leest een uur, een half uur en een kwartier, en kiest het eerstvolgende', () => {
    expect(tijd('om 20:00')).toBe(om(2, 20));
    expect(tijd('om acht uur')).toBe(om(2, 20));
    // Om 7 uur is al voorbij, ook 's avonds: morgenochtend.
    expect(tijd('om 7 uur')).toBe(om(3, 7));
    expect(tijd('om half negen')).toBe(om(2, 20, 30));
    expect(tijd('om kwart voor tien')).toBe(om(2, 21, 45));
    expect(tijd('om kwart over 8')).toBe(om(2, 20, 15));
    expect(tijd('om 21.30')).toBe(om(2, 21, 30));
  });

  it('leest over een tijd', () => {
    expect(tijd('over tien minuten')).toBe(NU + 10 * 60_000);
    expect(tijd('over een kwartier')).toBe(NU + 15 * 60_000);
    expect(tijd('over een uur')).toBe(NU + 60 * 60_000);
    expect(tijd('over een half uur')).toBe(NU + 30 * 60_000);
    expect(tijd('over 2 uur')).toBe(NU + 120 * 60_000);
  });

  it('leest een dag en een dagdeel', () => {
    expect(tijd('morgen om half acht')).toBe(om(3, 7, 30));
    expect(tijd('morgen')).toBe(om(3, 9));
    expect(tijd('vanavond')).toBe(om(2, 20));
    expect(tijd('om 9 uur s avonds')).toBe(om(2, 21));
    expect(tijd('donderdag om 16:15')).toBe(om(5, 16, 15));
    // Maandag is vandaag: dan volgende week.
    expect(tijd('maandag om 9 uur')).toBe(om(9, 9));
    expect(tijd('zet de lamp aan')).toBeNull();
  });
});

describe('de zinnen van te doen', () => {
  it('leest een herinnering, met wat er moet gebeuren', () => {
    expect(leesHerinnering('Herinner me om acht uur aan de container.', NU, TZ)).toEqual({ soort: 'herinner', tekst: 'De container', ms: om(2, 20) });
    expect(leesHerinnering('Hé huis, herinner me morgen om half acht dat Matt zijn gymtas mee moet', NU, TZ)).toBeNull();
    expect(leesHerinnering('herinner me morgen om half acht dat matt zijn gymtas mee moet', NU, TZ)).toEqual({ soort: 'herinner', tekst: 'Matt zijn gymtas mee moet', ms: om(3, 7, 30) });
    expect(leesHerinnering('Kun je me over een kwartier herinneren aan de oven?', NU, TZ)).toEqual({ soort: 'herinner', tekst: 'De oven', ms: NU + 15 * 60_000 });
    // Zonder tijd: dan vraagt het huis hoe laat.
    expect(leesHerinnering('herinner me aan de container', NU, TZ)).toEqual({ soort: 'hoelaat', tekst: 'De container' });
    expect(leesHerinnering('zet de lamp aan', NU, TZ)).toBeNull();
  });

  it('leest iets voor een lijst', () => {
    expect(leesLijstZin('Zet melk op de boodschappen')).toEqual({ lijst: 'boodschappen', item: 'Melk' });
    expect(leesLijstZin('zet de koffiebonen op de boodschappenlijst')).toEqual({ lijst: 'boodschappen', item: 'Koffiebonen' });
    expect(leesLijstZin('Brood op de boodschappenlijst')).toEqual({ lijst: 'boodschappen', item: 'Brood' });
    expect(leesLijstZin('We hebben geen eieren meer.')).toEqual({ lijst: 'boodschappen', item: 'Eieren' });
    expect(leesLijstZin('Zet de dakgoot schoonmaken op de to-do')).toEqual({ lijst: 'todo', item: 'Dakgoot schoonmaken' });
    expect(leesLijstZin('zet de lamp op 40')).toBeNull();
    expect(leesLijstZin('zet het op de lijst')).toBeNull();
  });

  it('herkent een vraag over te doen', () => {
    expect(leesTeDoenVraag('Wanneer komt het GFT?')).toBe('afval');
    expect(leesTeDoenVraag('Welke container moet er morgen buiten?')).toBe('afval');
    expect(leesTeDoenVraag('Wat staat er op de boodschappenlijst?')).toBe('boodschappen');
    expect(leesTeDoenVraag('Wat moeten we nog halen?')).toBe('boodschappen');
    expect(leesTeDoenVraag('Wat moet ik nog doen?')).toBe('todo');
    expect(leesTeDoenVraag('Wat staat er morgen op de agenda?')).toBe('morgen');
    expect(leesTeDoenVraag('Wat hebben we deze week?')).toBe('week');
    expect(leesTeDoenVraag('Hoe warm is het?')).toBeNull();
  });

  it('herkent gedaan en later', () => {
    expect(isGedaan('Gedaan')).toBe(true);
    expect(isGedaan('oké, klaar')).toBe(true);
    expect(isGedaan('doe de lamp aan')).toBe(false);
    expect(leesLater('straks')).toBe(10);
    expect(leesLater('over een uur')).toBe(60);
    expect(leesLater('over twintig minuten')).toBe(20);
    expect(leesLater('later vandaag de lamp')).toBeNull();
  });
});

describe('afval en agenda', () => {
  it('herkent de soort afval', () => {
    expect(afvalSoort('GFT')).toBe('gft');
    expect(afvalSoort('Restafval')).toBe('rest');
    expect(afvalSoort('PMD')).toBe('pmd');
    expect(afvalSoort('Oud papier')).toBe('papier');
  });

  it('leest de afspraken uit Home Assistant, een hele dag op middernacht', () => {
    const a = leesAfspraken(
      {
        'calendar.afvalbeheer_dar': { events: [{ start: '2026-11-10', end: '2026-11-11', summary: 'Restafval' }, { start: '2026-11-03', end: '2026-11-04', summary: 'GFT' }] },
        'calendar.gezin': { events: [{ start: '2026-11-05T16:45:00+01:00', end: '2026-11-05T17:30:00+01:00', summary: 'Matts zwemles' }, { start: 'x', summary: '' }] },
      },
      (id) => (/afval/.test(id) ? 'afval' : 'gezin'),
      TZ,
    );
    expect(a.map((x) => [x.tekst, x.bron, x.heleDag])).toEqual([['GFT', 'afval', true], ['Matts zwemles', 'gezin', false], ['Restafval', 'afval', true]]);
    expect(a[0]!.startMs).toBe(om(3, 0));
  });

  it('leest een lijst uit Home Assistant', () => {
    expect(leesLijst({ 'todo.shopping_list': { items: [{ summary: 'Melk', uid: 'a', status: 'needs_action' }, { summary: 'Bananen', uid: 'b', status: 'completed' }, { summary: ' ' }] } }, 'todo.shopping_list')).toEqual([
      { uid: 'a', tekst: 'Melk', klaar: false },
      { uid: 'b', tekst: 'Bananen', klaar: true },
    ]);
    expect(leesLijst(null, 'todo.shopping_list')).toEqual([]);
  });
});

describe('herinneringen', () => {
  it('gaat spelen op het tijdstip, kan later of klaar, en wordt bewaard', async () => {
    const map = await mkdtemp(join(tmpdir(), 'herinner-'));
    let nu = NU;
    const h = new Herinneringen({ map, nu: () => nu });
    const een = await h.voeg({ tekst: 'De container', ms: om(2, 20), voor: 'ricardo', naam: 'Ricardo' });
    expect(await h.ronde()).toEqual([]);
    nu = om(2, 20, 0) + 1000;
    const nieuw = await h.ronde();
    expect(nieuw.map((x) => x.tekst)).toEqual(['De container']);
    expect((await h.speelt()).map((x) => x.id)).toEqual([een.id]);
    // Later: over tien minuten weer.
    expect(await h.later(een.id, 10)).toBe(true);
    expect(await h.speelt()).toEqual([]);
    nu += 10 * 60_000;
    expect((await h.ronde()).length).toBe(1);
    expect(await h.klaar(een.id)).toBe(true);
    expect(await h.speelt()).toEqual([]);
    // Bewaard: een nieuwe weet het nog.
    const bewaard = JSON.parse(await readFile(join(map, HERINNERINGEN_BESTAND), 'utf8')) as { herinneringen: { status: string }[] };
    expect(bewaard.herinneringen[0]!.status).toBe('klaar');
    expect((await new Herinneringen({ map, nu: () => nu }).lijst()).length).toBe(1);
  });

  it('speelt niet eindeloos: na twee uur is hij vanzelf klaar', async () => {
    let nu = NU;
    const h = new Herinneringen({ map: null, nu: () => nu });
    await h.voeg({ tekst: 'Iets', ms: NU + 1000, voor: null, naam: null });
    nu += 2000;
    await h.ronde();
    nu += SPEELT_MS + 1000;
    await h.ronde();
    expect(await h.speelt()).toEqual([]);
  });
});

describe('de deur naar de lijsten (besluit 216)', () => {
  it('laat alleen iets toevoegen of afvinken door, op één lijst', () => {
    const lijst = { entity_id: 'todo.shopping_list' };
    expect(isTodoCall('todo', 'add_item', { item: 'Melk' }, lijst)).toBe(true);
    expect(isTodoCall('todo', 'update_item', { item: 'Melk', status: 'completed' }, lijst)).toBe(true);
    expect(isTodoCall('todo', 'update_item', { item: 'Melk', status: 'needs_action' }, lijst)).toBe(true);
    // Niets weghalen, geen andere velden, geen andere entiteit of meer tegelijk.
    expect(isTodoCall('todo', 'remove_item', { item: 'Melk' }, lijst)).toBe(false);
    expect(isTodoCall('todo', 'remove_completed_items', {}, lijst)).toBe(false);
    expect(isTodoCall('todo', 'add_item', { item: 'Melk', due_date: '2026-11-03' }, lijst)).toBe(false);
    expect(isTodoCall('todo', 'update_item', { item: 'Melk', rename: 'Bier' }, lijst)).toBe(false);
    expect(isTodoCall('todo', 'add_item', { item: 'Melk' }, { entity_id: ['todo.a', 'todo.b'] })).toBe(false);
    expect(isTodoCall('todo', 'add_item', { item: 'Melk' }, { entity_id: 'light.keuken' })).toBe(false);
    expect(isTodoCall('light', 'turn_on', { item: 'Melk' }, lijst)).toBe(false);
    expect(isTodoCall('todo', 'add_item', { item: 'x'.repeat(121) }, lijst)).toBe(false);
  });
});
