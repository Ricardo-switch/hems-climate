/**
 * Bewoners (besluit 147): erbij door één keer in te loggen, comfort per
 * bewoner, de hoofdgebruiker wisselen, en wie wat mag.
 */

import { describe, expect, it } from 'vitest';

import type { OccupancySource } from '../src/core/model.js';
import { exampleSite } from './site.js';
import { GEEN_BEWONERS, comfortVanBewoner, gastStand, herken, hoofdVan, leesActie, personenUit, profielenVoor, roepnaam, voerUit, wisselHoofd, type Bewoners } from '../src/web/bewoners.js';
import type { Comfort } from '../src/web/comfort.js';

const NU = Date.UTC(2026, 9, 16, 17, 0, 0);
const occupancy: OccupancySource[] = [
  { id: 'ricardo', ref: { adapter: 'homeassistant', id: 'person.ricardo_cornelissen' } },
  { id: 'shira', ref: { adapter: 'homeassistant', id: 'person.shira' } },
  { id: 'saskia', ref: { adapter: 'homeassistant', id: 'binary_sensor.saskia_thuis_gestabiliseerd' } },
];
const persoon = (entity_id: string, userId: string, naam: string) => ({ entity_id, state: 'home', attributes: { user_id: userId, friendly_name: naam }, last_changed: '', last_updated: '' });
const personen = personenUit([persoon('person.ricardo_cornelissen', 'u-ricardo', 'Ricardo Cornelissen'), persoon('person.shira', 'u-shira', 'Shira Cornelissen')]);
const comfort: Comfort = { versie: 1, kamers: { woonkamer: { modi: { dag: { heat: 20, cool: 25 } } } } };

/** Ricardo en Shira, in die volgorde. */
function tweeBewoners(): Bewoners {
  const r = herken(GEEN_BEWONERS, { userId: 'u-ricardo', naam: 'Ricardo Cornelissen' }, personen, occupancy, NU);
  if (r.soort !== 'bewoner') throw new Error('Ricardo hoort bewoner te worden');
  const s = herken(r.bewoners, { userId: 'u-shira', naam: 'Shira Cornelissen' }, personen, occupancy, NU);
  if (s.soort !== 'bewoner') throw new Error('Shira hoort bewoner te worden');
  return s.bewoners;
}

describe('de eerste inlog', () => {
  it('maakt van een account met een persoon een bewoner, met zijn aanwezigheid; de eerste is hoofdgebruiker', () => {
    const b = tweeBewoners();
    expect(b.volgorde).toEqual(['ricardo', 'shira']);
    expect(hoofdVan(b)?.naam).toBe('Ricardo');
    expect(b.bewoners['shira']).toMatchObject({ naam: 'Shira', haNaam: 'Shira Cornelissen', aanwezigheid: 'shira', comfort: 'volgt' });
    // Wie al bekend is, blijft wat hij was.
    expect(herken(b, { userId: 'u-shira', naam: 'Shira' }, personen, occupancy, NU)).toMatchObject({ soort: 'bewoner', nieuw: false });
  });

  it('vraagt het een account zonder persoon, en een scherm wordt geen bewoner', () => {
    const b = tweeBewoners();
    expect(herken(b, { userId: 'u-wand', naam: 'Wand' }, personen, occupancy, NU).soort).toBe('vraag');
    const scherm = voerUit(b, comfort, { actie: 'ik', soort: 'scherm', aanwezigheid: null }, { userId: 'u-wand', naam: 'Wand', beheerder: false }, occupancy, [], NU);
    expect(scherm.ok && scherm.bewoners.volgorde).toEqual(['ricardo', 'shira']);
    expect(scherm.ok && herken(scherm.bewoners, { userId: 'u-wand', naam: 'Wand' }, personen, occupancy, NU).soort).toBe('scherm');
    const saskia = voerUit(b, comfort, { actie: 'ik', soort: 'bewoner', aanwezigheid: 'saskia' }, { userId: 'u-saskia', naam: 'Saskia de Vries', beheerder: false }, occupancy, [], NU) as { ok: true; bewoners: Bewoners };
    expect(saskia.bewoners.bewoners['saskia']).toMatchObject({ naam: 'Saskia', aanwezigheid: 'saskia', comfort: 'volgt' });
  });

  it('noemt je bij je voornaam', () => {
    expect(roepnaam('Shira Cornelissen')).toBe('Shira');
    expect(roepnaam('  ')).toBe('Bewoner');
  });
});

describe('comfort per bewoner', () => {
  it('wie volgt, heeft geen eigen doelen; een eigen comfort komt als doelen per zone, met voorverwarmen zoals de dag', () => {
    const b = tweeBewoners();
    expect(profielenVoor(b, comfort, occupancy)).toEqual([
      { id: 'ricardo', name: 'Ricardo', occupancyIds: ['ricardo'], zones: {} },
      { id: 'shira', name: 'Shira', occupancyIds: ['shira'], zones: {} },
    ]);
    const eigen = voerUit(b, comfort, { actie: 'comfort', id: 'shira', comfort: 'eigen' }, { userId: 'u-shira', naam: 'Shira', beheerder: false }, occupancy, [], NU) as { ok: true; bewoners: Bewoners; comfort: Comfort };
    const metZijn = { ...eigen.comfort, profielen: { shira: { woonkamer: { modi: { dag: { heat: 21, cool: 24 } } } } } };
    expect(profielenVoor(eigen.bewoners, metZijn, occupancy)[1]!.zones).toEqual({ woonkamer: { setpoints: { dag: { heat: 21, cool: 24 }, voorverwarmen: { heat: 21 } } } });
    // Voor het eerst eigen: een kopie van de hoofdgebruiker.
    expect(eigen.comfort.profielen?.['shira']).toEqual(comfort.kamers);
  });

  it('een andere hoofdgebruiker neemt zijn eigen comfort mee, en de oude het zijne', () => {
    const b = tweeBewoners();
    const met: Comfort = { ...comfort, profielen: { shira: { woonkamer: { modi: { dag: { heat: 21.5, cool: 24 } } } } } };
    const zijn = { ...b, bewoners: { ...b.bewoners, shira: { ...b.bewoners['shira']!, comfort: 'eigen' as const } } };
    const w = wisselHoofd(zijn, met, 'shira');
    expect(w.bewoners.volgorde).toEqual(['shira', 'ricardo']);
    expect(w.comfort?.kamers).toEqual(met.profielen!['shira']);
    expect(w.comfort?.profielen).toEqual({ ricardo: comfort.kamers });
  });
});

describe('wie wat mag', () => {
  it('aan jezelf alles, aan een ander alleen als hoofdgebruiker of beheerder', () => {
    const b = tweeBewoners();
    const shira = { userId: 'u-shira', naam: 'Shira', beheerder: false };
    const ricardo = { userId: 'u-ricardo', naam: 'Ricardo', beheerder: false };
    expect(voerUit(b, comfort, { actie: 'naam', id: 'shira', naam: 'Shiri' }, shira, occupancy, [], NU).ok).toBe(true);
    expect(voerUit(b, comfort, { actie: 'naam', id: 'ricardo', naam: 'Rico' }, shira, occupancy, [], NU)).toMatchObject({ ok: false, status: 403 });
    expect(voerUit(b, comfort, { actie: 'volgorde', volgorde: ['shira', 'ricardo'] }, shira, occupancy, [], NU)).toMatchObject({ ok: false, status: 403 });
    expect(voerUit(b, comfort, { actie: 'volgorde', volgorde: ['shira', 'ricardo'] }, ricardo, occupancy, [], NU).ok).toBe(true);
    // De hoofdgebruiker gaat niet weg zolang er anderen zijn.
    expect(voerUit(b, comfort, { actie: 'weg', id: 'ricardo' }, ricardo, occupancy, [], NU)).toMatchObject({ ok: false, status: 400 });
    // Een aanwezigheid die al bij een ander hoort, kan niet.
    expect(voerUit(b, comfort, { actie: 'aanwezigheid', id: 'shira', bron: 'ricardo' }, shira, occupancy, [], NU)).toMatchObject({ ok: false, status: 400 });
  });

  it('"toch die van" onthoudt wie er nu thuis is', () => {
    const b = tweeBewoners();
    const uit = voerUit(b, comfort, { actie: 'vasthouden', id: 'ricardo' }, { userId: 'u-wand', naam: 'Wand', beheerder: false }, occupancy, ['shira'], NU) as { ok: true; bewoners: Bewoners };
    expect(uit.bewoners.vasthouden).toEqual({ id: 'ricardo', home: ['shira'], sindsMs: NU });
    expect(leesActie({ actie: 'vasthouden', id: null })).toEqual({ actie: 'vasthouden', id: null });
    expect(leesActie({ actie: 'iets' })).toBeNull();
  });
});

describe('wiens comfort je ziet', () => {
  it('jouw comfort, of dat van de hoofdgebruiker als je volgt; een ander aanpassen alleen als hoofdgebruiker', () => {
    const b = tweeBewoners();
    const shira = { userId: 'u-shira', beheerder: false };
    const ricardo = { userId: 'u-ricardo', beheerder: false };
    const zelf = comfortVanBewoner(exampleSite, comfort, b, shira, null);
    expect(zelf.view.van).toMatchObject({ id: 'shira', naam: 'Shira', hoofd: false, volgt: true, hoofdNaam: 'Ricardo', magAanpassen: true, bewoners: [] });
    expect(comfortVanBewoner(exampleSite, comfort, b, shira, 'ricardo').view.van).toMatchObject({ id: 'ricardo', hoofd: true, magAanpassen: false });
    const alsHoofd = comfortVanBewoner(exampleSite, comfort, b, ricardo, 'shira');
    expect(alsHoofd.view.van).toMatchObject({ id: 'shira', magAanpassen: true });
    expect(alsHoofd.view.van?.bewoners.map((x) => x.id)).toEqual(['ricardo', 'shira']);
    // Een eigen comfort laat de eigen doelen zien.
    const eigen = { ...b, bewoners: { ...b.bewoners, shira: { ...b.bewoners['shira']!, comfort: 'eigen' as const } } };
    const metZijn: Comfort = { ...comfort, profielen: { shira: { woonkamer: { modi: { dag: { heat: 22.5, cool: 26 } } } } } };
    const v = comfortVanBewoner(exampleSite, metZijn, eigen, shira, null).view;
    expect(v.van?.volgt).toBe(false);
    expect(v.kamers.find((k) => k.id === 'woonkamer')?.modi.dag).toEqual({ heat: 22.5, cool: 26 });
  });
});

describe('een tablet met een persoon', () => {
  it('wordt een scherm en geen bewoner, en blijft dat bij een volgende inlog', () => {
    const b = tweeBewoners();
    const uit = voerUit(b, comfort, { actie: 'scherm' }, { userId: 'u-shira', naam: 'Shira', beheerder: false }, occupancy, [], NU) as { ok: true; bewoners: Bewoners };
    expect(uit.bewoners.volgorde).toEqual(['ricardo']);
    expect(herken(uit.bewoners, { userId: 'u-shira', naam: 'Shira' }, personen, occupancy, NU).soort).toBe('scherm');
    // De hoofdgebruiker wordt geen scherm zolang er anderen zijn.
    expect(voerUit(b, comfort, { actie: 'scherm' }, { userId: 'u-ricardo', naam: 'Ricardo', beheerder: false }, occupancy, [], NU)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('een gast (besluit 147)', () => {
  it('staat niet in de volgorde, heeft geen comfort, verandert niets, en wordt weer bewoner als je dat kiest', () => {
    const b = tweeBewoners();
    const ricardo = { userId: 'u-ricardo', naam: 'Ricardo', beheerder: false };
    const met: Comfort = { ...comfort, profielen: { shira: { woonkamer: { modi: { dag: { heat: 22, cool: 25 } } } } } };
    const gast = voerUit(b, met, { actie: 'gast', id: 'shira', gast: true }, ricardo, occupancy, [], NU) as { ok: true; bewoners: Bewoners; comfort: Comfort };
    expect(gast.bewoners.volgorde).toEqual(['ricardo']);
    expect(gast.bewoners.bewoners['shira']).toMatchObject({ gast: true, comfort: 'volgt' });
    expect(gast.comfort.profielen).toEqual({});
    expect(profielenVoor(gast.bewoners, gast.comfort, occupancy).map((x) => x.id)).toEqual(['ricardo']);
    // Een gast verandert niets, ook niet aan zichzelf.
    expect(voerUit(gast.bewoners, gast.comfort, { actie: 'naam', id: 'shira', naam: 'S' }, { userId: 'u-shira', naam: 'Shira', beheerder: true }, occupancy, [], NU)).toMatchObject({ ok: false, status: 403 });
    // De hoofdgebruiker kan geen gast zijn; Shira kan weer bewoner worden, achteraan.
    expect(voerUit(b, comfort, { actie: 'gast', id: 'ricardo', gast: true }, ricardo, occupancy, [], NU)).toMatchObject({ ok: false, status: 400 });
    const terug = voerUit(gast.bewoners, gast.comfort, { actie: 'gast', id: 'shira', gast: false }, ricardo, occupancy, [], NU) as { ok: true; bewoners: Bewoners };
    expect(terug.bewoners.volgorde).toEqual(['ricardo', 'shira']);
    expect(terug.bewoners.bewoners['shira']?.gast).toBeUndefined();
  });

  it('is thuis volgens zijn aanwezigheid; wie geen gast is, telt hier niet', () => {
    const b = tweeBewoners();
    const gast = (voerUit(b, comfort, { actie: 'gast', id: 'shira', gast: true }, { userId: 'u-ricardo', naam: 'Ricardo', beheerder: false }, occupancy, [], NU) as { ok: true; bewoners: Bewoners }).bewoners;
    const thuis = (s: string) => () => ({ entity_id: 'person.shira', state: s, attributes: {}, last_changed: '', last_updated: '' });
    expect(gastStand(gast, 'u-shira', occupancy, thuis('home'))).toEqual({ gast: true, thuis: true });
    expect(gastStand(gast, 'u-shira', occupancy, thuis('not_home'))).toEqual({ gast: true, thuis: false });
    expect(gastStand(gast, 'u-ricardo', occupancy, thuis('home'))).toEqual({ gast: false, thuis: null });
  });
});
