/**
 * Een assistent die meedenkt (besluit 209): licht dat bij het moment past, een
 * gevoel dat een opdracht wordt, de delen van een kamer, doorvragen met korte
 * keuzes, en 's avonds de sfeerverlichting voorstellen.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { lichtRecept, type Lichtrecept } from '../src/web/lichtrecept.js';
import { herkenOpdracht, kiesUit, onderscheid, type BedienLamp, type Bedienbaar, type Herkend } from '../src/web/opdracht.js';
import { optiesUit } from '../src/web/routes/assistent.js';
import { afstand, begrijp, verbeter } from '../src/web/woordzoeker.js';

const TZ = 'Europe/Amsterdam';
/** 29 oktober 2026 om dit uur, Nederlandse tijd (wintertijd, UTC+1). */
const om = (uur: number, min = 0) => Date.UTC(2026, 9, 29, uur - 1, min);

describe('het lichtrecept', () => {
  it('kiest per moment hoe fel en welk wit', () => {
    expect(lichtRecept({ nuMs: om(13), tijdzone: TZ, zonHoogteDeg: 25, weer: 'zon' })).toEqual({ moment: 'dag', helderheidPct: 100, kleur: 'neutraal' });
    expect(lichtRecept({ nuMs: om(13), tijdzone: TZ, zonHoogteDeg: 25, weer: 'regen' }).moment).toBe('grijs');
    expect(lichtRecept({ nuMs: om(17, 15), tijdzone: TZ, zonHoogteDeg: 2, weer: null })).toMatchObject({ moment: 'schemer', kleur: 'warm' });
    expect(lichtRecept({ nuMs: om(19), tijdzone: TZ, zonHoogteDeg: -20, weer: null })).toEqual({ moment: 'avond', helderheidPct: 70, kleur: 'warm' });
    expect(lichtRecept({ nuMs: om(22, 30), tijdzone: TZ, zonHoogteDeg: -30, weer: null }).moment).toBe('laat');
    expect(lichtRecept({ nuMs: om(2), tijdzone: TZ, zonHoogteDeg: -40, weer: null })).toEqual({ moment: 'nacht', helderheidPct: 20, kleur: 'warm' });
    // Zonder ligging alleen de klok.
    expect(lichtRecept({ nuMs: om(20), tijdzone: TZ, zonHoogteDeg: null, weer: null }).moment).toBe('avond');
  });
});

/* ------------------------------------------------------------ een klein huis */

const lamp = (id: string, naam: string, kamerId: string, kamer: string, o: Partial<BedienLamp> = {}): BedienLamp => ({
  id,
  naam,
  kamerId,
  kamer,
  dimbaar: true,
  kleurtemp: true,
  aan: false,
  helderheidPct: null,
  zone: null,
  ...o,
});
const AVOND: Lichtrecept = { moment: 'avond', helderheidPct: 70, kleur: 'warm' };
const DAG: Lichtrecept = { moment: 'dag', helderheidPct: 100, kleur: 'neutraal' };

function huis(recept: Lichtrecept | null, o: { keukenAan?: boolean } = {}): Bedienbaar {
  const bank = lamp('light.bank', 'Bank lamp', 'woonkamer', 'Woonkamer', { zone: 'zithoek' });
  const eettafel = lamp('light.eettafel', 'Eettafel', 'woonkamer', 'Woonkamer');
  const keuken = lamp('light.keuken', 'Keukenspots', 'keuken', 'Keuken', o.keukenAan ? { aan: true, helderheidPct: 40 } : {});
  const kamers = [
    { id: 'woonkamer', naam: 'Woonkamer', etageId: 'beneden', lampen: [bank, eettafel] },
    { id: 'keuken', naam: 'Keuken', etageId: 'beneden', lampen: [keuken] },
  ];
  return {
    kamers,
    zones: [{ id: 'woonkamer::zithoek', naam: 'Zithoek', kamerId: 'woonkamer', kamer: 'Woonkamer', lampen: [bank] }],
    lampen: kamers.flatMap((k) => k.lampen),
    scenes: [{ id: 'scene.woonkamer_sfeer', naam: 'Sfeer', kamer: 'Woonkamer' }],
    schermen: [
      { id: 'cover.screen_klein', naam: 'Screen klein', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 },
      { id: 'cover.screen_groot', naam: 'Screen groot', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 },
    ],
    etages: [{ id: 'beneden', naam: 'Beneden' }],
    recept,
  };
}

const opdracht = (h: Herkend | null) => {
  if (!h?.ok) throw new Error(`geen opdracht: ${h ? h.antwoord : 'null'}`);
  return h.opdracht;
};
const vraagTerug = (h: Herkend | null) => {
  if (h == null || h.ok) throw new Error('geen vraag terug');
  return h;
};

describe('een gevoel wordt een opdracht', () => {
  it('"het is donker in de keuken": licht aan, warm voor de avond', () => {
    const o = opdracht(herkenOpdracht('Het is donker in de keuken', huis(AVOND), 'nl'));
    expect(o.body).toEqual({ doel: 'kamer', id: 'keuken', aan: true, helderheidPct: 70, kleur: 'warm' });
    expect(o.antwoord).toBe('Het licht in de keuken is aan, op 70%, warm voor de avond.');
    expect(o.feiten.map((f) => f.tekst)).toContain('70%');
  });

  it('overdag helder en neutraal, en een lamp die al aan staat gaat feller', () => {
    expect(opdracht(herkenOpdracht('doe het licht in de keuken aan', huis(DAG), 'nl')).body).toEqual({ doel: 'kamer', id: 'keuken', aan: true, helderheidPct: 100, kleur: 'neutraal' });
    expect(opdracht(herkenOpdracht('het is nog te donker in de keuken', huis(DAG, { keukenAan: true }), 'nl')).body).toMatchObject({ aan: true, helderheidPct: 70 });
  });

  it('"het is hier te fel": de enige kamer waar licht brandt; "het is donker": vragen welke', () => {
    expect(opdracht(herkenOpdracht('het is hier te fel', huis(AVOND, { keukenAan: true }), 'nl')).body).toEqual({ doel: 'kamer', id: 'keuken', aan: true, helderheidPct: 20 });
    expect(vraagTerug(herkenOpdracht('het is hier te fel', huis(AVOND), 'nl')).antwoord).toBe('In welke kamer? Zeg bijvoorbeeld "het is donker in de keuken".');
    // Een plek die hij niet kent, laat hij aan het taalmodel.
    expect(herkenOpdracht('het is te donker op de trap', huis(AVOND), 'nl')).toBeNull();
    const donker = vraagTerug(herkenOpdracht('het is donker', huis(AVOND), 'nl'));
    expect(donker.antwoord).toBe('In welke kamer: Woonkamer of Keuken?');
    expect(donker.keuze?.map((k) => k.tekst)).toEqual(['licht Woonkamer aan', 'licht Keuken aan']);
  });

  it('een vraag blijft een vraag', () => {
    expect(herkenOpdracht('is het donker in de keuken?', huis(AVOND), 'nl')).toBeNull();
  });

  it('"het is koud in de woonkamer" is een wens om te verwarmen, "waarom" blijft een vraag', () => {
    expect(begrijp('Het is koud in de woonkamer', exampleSite, 'nl')).toMatchObject({ soort: 'huis', vraag: { kind: 'doe', kamer: 'woonkamer', wens: 'verwarmen' } });
    expect(begrijp('Ik heb het warm op zolder', exampleSite, 'nl')).toMatchObject({ soort: 'huis', vraag: { kind: 'doe', kamer: 'zolder', wens: 'koelen' } });
    expect(begrijp('Het mag wat warmer in de woonkamer', exampleSite, 'nl')).toMatchObject({ soort: 'huis', vraag: { kind: 'doe', wens: 'verwarmen' } });
    expect(begrijp('Waarom is het koud in de woonkamer?', exampleSite, 'nl')).toMatchObject({ soort: 'huis', vraag: { kind: 'waarom', kamer: 'woonkamer' } });
  });
});

/**
 * Zoals het huis van de bewoner (29 oktober 2026): de woonkamer is een
 * woonkeuken met twee zones, de zithoek (plafonnière en sfeerverlichting) en
 * de keuken. In 0.80.0 kende de assistent alleen kamers, en "kan je de lamp in
 * de keuken aanzetten?" werd "Welk licht bedoel je?".
 */
function woonkeuken(recept: Lichtrecept | null): Bedienbaar {
  const plafonniere = lamp('light.woonkamer_plafonniere', 'Plafonnière', 'beneden', 'Woonkamer', { zone: 'zithoek' });
  const sfeer = lamp('light.sfeerverlichting', 'Sfeerverlichting', 'beneden', 'Woonkamer', { zone: 'zithoek' });
  const keuken = lamp('light.keuken', 'Plafonnière keuken', 'beneden', 'Woonkamer', { zone: 'keuken' });
  const kamers = [{ id: 'beneden', naam: 'Woonkamer', etageId: 'bg', lampen: [plafonniere, sfeer, keuken] }];
  return {
    kamers,
    zones: [
      { id: 'beneden::zithoek', naam: 'Zithoek', kamerId: 'beneden', kamer: 'Woonkamer', lampen: [plafonniere, sfeer] },
      { id: 'beneden::keuken', naam: 'Keuken', kamerId: 'beneden', kamer: 'Woonkamer', lampen: [keuken] },
    ],
    lampen: kamers.flatMap((k) => k.lampen),
    scenes: [{ id: 'scene.woonkamer_sfeer', naam: 'Sfeer', kamer: 'Woonkamer' }],
    schermen: [],
    etages: [{ id: 'bg', naam: 'Begane grond' }],
    recept,
  };
}

describe('de delen van een kamer, en de sfeerverlichting', () => {
  it('"kan je de lamp in de keuken aanzetten?": de keuken is een deel van de woonkamer', () => {
    const o = opdracht(herkenOpdracht('Kan je de lamp in de keuken aanzetten?', woonkeuken(AVOND), 'nl'));
    // Geen voorstel voor sfeer: in de keuken staat geen sfeerlamp.
    expect(o.body).toEqual({ doel: 'zone', id: 'beneden::keuken', aan: true, helderheidPct: 70, kleur: 'warm' });
    expect(o.antwoord).toBe('Het licht in de keuken is aan, op 70%, warm voor de avond.');
  });

  it("kent de zithoek, en stelt 's avonds de sfeerverlichting voor", () => {
    const vraag = vraagTerug(herkenOpdracht('zet de zithoek aan', woonkeuken(AVOND), 'nl'));
    expect(vraag.antwoord).toBe('Wil je de sfeerverlichting in de zithoek?');
    expect(vraag.keuze?.map((k) => k.label)).toEqual(['Ja', 'Nee, gewoon licht']);
    // Ja: alleen de sfeerverlichting, warm voor de avond.
    const ja = kiesUit('ja graag', vraag.keuze!)!;
    expect(opdracht(herkenOpdracht(ja.tekst, woonkeuken(AVOND), 'nl')).body).toEqual({ doel: 'lamp', id: 'light.sfeerverlichting', aan: true, helderheidPct: 70, kleur: 'warm' });
    // Nee: de hele zithoek, zonder nog eens te vragen.
    const nee = kiesUit('nee', vraag.keuze!)!;
    expect(opdracht(herkenOpdracht(nee.tekst, woonkeuken(AVOND), 'nl')).body).toEqual({ doel: 'zone', id: 'beneden::zithoek', aan: true, helderheidPct: 70, kleur: 'warm' });
  });

  it('bij de hele kamer de scène met sfeer, en overdag geen voorstel', () => {
    const vraag = vraagTerug(herkenOpdracht('licht woonkamer aan', woonkeuken(AVOND), 'nl'));
    expect(kiesUit('ja', vraag.keuze!)?.tekst).toBe('Sfeerverlichting aan');
    const zonderLamp = vraagTerug(herkenOpdracht('licht woonkamer aan', huis(AVOND), 'nl'));
    expect(kiesUit('ja', zonderLamp.keuze!)?.tekst).toBe('scène Sfeer');
    expect(opdracht(herkenOpdracht('zet de zithoek aan', woonkeuken(DAG), 'nl')).body).toMatchObject({ doel: 'zone', id: 'beneden::zithoek', helderheidPct: 100 });
  });
});

describe('doorvragen', () => {
  it('vraagt met het woord dat het verschil maakt, en begrijpt het antwoord', () => {
    const vraag = vraagTerug(herkenOpdracht('doe het screen naar beneden', huis(DAG), 'nl'));
    expect(vraag.antwoord).toBe('Welke bedoel je: klein of groot, of allebei?');
    // De richting zit in de keuze (besluit 211): op de wand werd "groot" eerst "Screen groot kan je doen".
    expect(vraag.keuze).toEqual([
      { label: 'klein', tekst: 'Screen klein dicht' },
      { label: 'groot', tekst: 'Screen groot dicht' },
      { label: 'Allebei', tekst: 'alle screens dicht' },
    ]);
    const groot = kiesUit('de grote', vraag.keuze!)!;
    expect(opdracht(herkenOpdracht(groot.tekst, huis(DAG), 'nl')).body).toMatchObject({ id: 'cover.screen_groot', actie: 'dicht' });
    expect(kiesUit('de eerste', vraag.keuze!)?.label).toBe('klein');
    expect(kiesUit('allebei', vraag.keuze!)?.label).toBe('Allebei');
    expect(kiesUit('doe ze maar beide', vraag.keuze!)?.label).toBe('Allebei');
    // Iets anders zeggen is gewoon een nieuwe zin.
    expect(kiesUit('wat doe je nu', vraag.keuze!)).toBeNull();
  });

  it('"kan je de screens naar beneden doen?": meervoud doet ze allebei, zonder te vragen', () => {
    const o = opdracht(herkenOpdracht('Kan je de screens naar beneden doen?', huis(DAG), 'nl'));
    expect(o.antwoord).toBe('De screens gaan dicht.');
    expect(o.body).toMatchObject({ id: 'cover.screen_klein', actie: 'dicht' });
    expect(o.meer).toEqual([{ pad: 'api/scherm', body: expect.objectContaining({ id: 'cover.screen_groot', actie: 'dicht' }) }]);
    expect(o.gedaan).toHaveLength(2);
    expect(opdracht(herkenOpdracht('alle screens half', huis(DAG), 'nl')).meer?.[0]?.body).toMatchObject({ actie: 'stand', standPct: 50 });
  });

  it('haalt het gemeenschappelijke weg, en houdt namen zonder verschil heel', () => {
    expect(onderscheid(['Screen klein', 'Screen groot'])).toEqual(['klein', 'groot']);
    expect(onderscheid(['Plafonnière', 'Leeslamp'])).toEqual(['Plafonnière', 'Leeslamp']);
    expect(onderscheid(['Lamp', 'Lamp'])).toEqual(['Lamp', 'Lamp']);
  });

  it('neemt van de pagina hooguit vier keuzes aan, en anders geen', () => {
    expect(optiesUit(JSON.stringify([{ label: 'a', tekst: 'licht a aan' }, { label: 1, tekst: 'x' }]))).toEqual([{ label: 'a', tekst: 'licht a aan' }]);
    expect(optiesUit('geen json')).toEqual([]);
    expect(optiesUit(null)).toEqual([]);
    expect(optiesUit(JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ label: `${i}`, tekst: `${i}` }))))).toHaveLength(4);
  });
});

describe('bijna goed verstaan (besluit 211)', () => {
  // Zoals Whisper het op de Pi verstond, in de toets van 29 oktober 2026.
  const namen = ['Woonkamer', 'Slaapkamer', 'Zolder', 'Zithoek', 'Keuken', 'Screen groot'];
  it('zet een woord dat er heel dicht bij ligt recht naar een naam uit het huis', () => {
    expect(verbeter('Het is koud in de wonkamer.', namen)).toBe('het is koud in de woonkamer');
    expect(verbeter('Doe het licht in de slabkamer uit.', namen)).toBe('doe het licht in de slaapkamer uit');
    expect(verbeter('Hoe warm is het op zoldeer?', namen)).toBe('hoe warm is het op zolder');
    expect(verbeter('Zet de Ziethoek aan', namen)).toBe('zet de zithoek aan');
    expect(verbeter('Zette woonkamer op 21 graden.', namen)).toBe('zet de woonkamer op 21 graden');
    // Met het grotere model (small-int8): s en z klinken aan het begin hetzelfde.
    expect(verbeter('Hoe warm is het op solder?', namen)).toBe('hoe warm is het op zolder');
  });

  it('laat gewone woorden en korte woorden met rust', () => {
    expect(verbeter('Wat doe je nu?', namen)).toBe('wat doe je nu');
    expect(verbeter('Doe het licht aan', namen)).toBe('doe het licht aan');
    // Nooit naar een andere kamer: "wandkamer" ligt twee letters van badkamer, maar begint anders.
    expect(verbeter('Zet de wandkamer op 21', [...namen, 'Badkamer'])).toBe('zet de wandkamer op 21');
    expect(afstand('wonkamer', 'woonkamer')).toBe(1);
  });
});
