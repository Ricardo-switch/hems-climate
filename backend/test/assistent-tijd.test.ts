/*
 * De assistent bij screens en tijden (besluit 224): "dichtdoen" als één woord,
 * "half" als stand en niet als tijd, doorvragen bij twee screens in één kamer
 * of als het taalmodel er zelf één koos, en nooit een eigen tijd van het
 * taalmodel bij een geplande opdracht.
 */
import { describe, expect, it } from 'vitest';

import type { Diensten } from '../src/web/diensten.js';
import { herkenOpdracht, schermVaag, type BedienScherm, type Bedienbaar, type Opdracht } from '../src/web/opdracht.js';
import { planZin } from '../src/web/routes/gepland.js';
import { Herinneringen } from '../src/web/tedoen.js';

const TZ = 'Europe/Amsterdam';
/** Zaterdag 31 oktober 2026 om 14:00 in Nederland (wintertijd, UTC+1). */
const NU = Date.UTC(2026, 9, 31, 13, 0);
const PLEK = { latDeg: 51.9, lonDeg: 5.3 };

const scherm = (id: string, naam: string, kamer: string, zonnescherm = false): BedienScherm => ({ id, naam, kamer, standKiezen: !zonnescherm, terugmelding: !zonnescherm, zonnescherm, positiePct: zonnescherm ? null : 100 });
/** Zoals bij de bewoner: groot en klein in de woonkamer, het zonnescherm in de achtertuin. */
function huis(): Bedienbaar {
  return {
    kamers: [
      { id: 'woonkamer', naam: 'Woonkamer', etageId: 'beneden', lampen: [] },
      { id: 'achtertuin', naam: 'Achtertuin', etageId: 'buiten', lampen: [] },
    ],
    zones: [],
    lampen: [],
    scenes: [],
    schermen: [scherm('cover.screen_groot', 'Screen groot', 'Woonkamer'), scherm('cover.screen_klein', 'Screen klein', 'Woonkamer'), scherm('cover.zonnescherm', 'Zonnescherm', 'Achtertuin', true)],
    etages: [{ id: 'beneden', naam: 'Beneden' }],
    recept: null,
  };
}
const vraagt = (zin: string) => {
  const h = herkenOpdracht(zin, huis(), 'nl');
  return h != null && !h.ok ? h.antwoord : null;
};
const doet = (zin: string) => {
  const h = herkenOpdracht(zin, huis(), 'nl');
  return h?.ok ? h.opdracht.body : null;
};
const opdracht = (id: string, actie: string): Opdracht => ({ soort: 'scherm', pad: 'api/scherm', body: { id, actie, standPct: null }, antwoord: '', feiten: [], gedaan: [], beweegt: null, vervolg: [] }) as unknown as Opdracht;
const diensten = { options: { location: () => PLEK } } as unknown as Diensten;
const plan = (zin: string, denkLater: Parameters<typeof planZin>[10] = null) =>
  planZin(diensten, new Herinneringen({ map: null, nu: () => NU }), zin, huis(), null, TZ, 'nl', null, () => null, NU, denkLater);

describe('screens in eigen woorden (besluit 224)', () => {
  it('verstaat dichtdoen, opendraaien en neerlaten als één woord', () => {
    expect(vraagt('Kun je het screen dichtdoen')).toMatch(/groot of klein/);
    expect(doet('screen klein dichtdoen')).toMatchObject({ id: 'cover.screen_klein', actie: 'dicht' });
    expect(doet('screen groot opendraaien')).toMatchObject({ id: 'cover.screen_groot', actie: 'open' });
    expect(doet('screen klein neerlaten')).toMatchObject({ id: 'cover.screen_klein', actie: 'dicht' });
  });

  it('leest half als stand, maar niet in een tijd', () => {
    expect(doet('screen groot half')).toMatchObject({ actie: 'stand', standPct: 50 });
    expect(doet('screen groot om half acht dicht')).toMatchObject({ actie: 'dicht' });
    expect(doet('screen groot half 8 dicht')).toMatchObject({ actie: 'dicht' });
  });

  it('vraagt welke als er in de genoemde kamer twee hangen', () => {
    expect(vraagt('doe het screen in de woonkamer dicht')).toMatch(/groot of klein/);
    expect(vraagt('screen woonkamer dicht')).toMatch(/groot of klein/);
    // De kamer met maar één: dan die.
    expect(doet('het zonnescherm in de achtertuin uit')).toMatchObject({ id: 'cover.zonnescherm' });
  });
});

describe('een screen dat het taalmodel koos (besluit 224)', () => {
  it('vraagt welke als je zin er geen noemt', () => {
    const v = schermVaag('kun je het screen dichtdoen', opdracht('cover.screen_groot', 'dicht'), huis(), 'nl');
    expect(v && !v.ok ? v.antwoord : null).toMatch(/groot of klein/);
    expect(v && !v.ok ? v.keuze?.map((k) => k.tekst) : null).toContain('Screen klein dicht');
  });

  it('laat het zo als je het screen noemt, allebei zegt, of het het enige van die soort is', () => {
    expect(schermVaag('doe het grote screen dicht', opdracht('cover.screen_groot', 'dicht'), huis(), 'nl')).toBeNull();
    expect(schermVaag('doe ze allebei dicht', opdracht('cover.screen_groot', 'dicht'), huis(), 'nl')).toBeNull();
    expect(schermVaag('doe de zonwering uit', opdracht('cover.zonnescherm', 'open'), huis(), 'nl')).toBeNull();
  });
});

describe('een opdracht met een tijd (besluit 224)', () => {
  it('zegt eerlijk dat hij de tijd hoorde maar niet wat, zonder taalmodel', async () => {
    const r = await plan('kun je om half acht de boel even regelen met het licht');
    expect(r?.['antwoord']).toMatch(/^Ik hoorde om 19:30, maar niet wat er dan moet gebeuren/);
    expect(r?.['gepland']).toBeUndefined();
  });

  it('plant wat het taalmodel noemt, op de tijd uit de zin', async () => {
    const stappen = [{ pad: 'api/scherm', body: { id: 'cover.screen_klein', actie: 'dicht' } }];
    const r = await plan('kun je om half acht het kleintje laten zakken', async () => ({ stappen }));
    expect(r?.['antwoord']).toMatch(/^Goed, om 19:30 doe ik dit/);
    expect((r?.['gepland'] as { ms: number }).ms).toBe(Date.UTC(2026, 9, 31, 18, 30));
  });

  it('vraagt welke screen, en houdt de tijd bij de keuze', async () => {
    const vraag = schermVaag('het screen', opdracht('cover.screen_groot', 'dicht'), huis(), 'nl');
    const r = await plan('kun je om half acht het screen sluiten graag', async () => (vraag && !vraag.ok ? { vraag } : null));
    expect(r?.['antwoord']).toMatch(/groot of klein/);
    expect((r?.['keuze'] as { tekst: string }[]).map((k) => k.tekst)).toContain('Screen klein dicht om 19:30');
  });

  it('laat een vraag met een tijd gewoon door', async () => {
    expect(await plan('wat doet het licht om half acht')).toBeNull();
  });
});
