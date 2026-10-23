/**
 * Praten met je huis (besluit 148): bedienen met een zin, en het vaste antwoord
 * in eigen woorden met het vaste antwoord als vangnet.
 */

import { describe, expect, it } from 'vitest';

import type { HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import type { HouseDevice, HouseReport } from '../src/web/house.js';
import { geenScherm } from '../src/web/house.js';
import { bedienbaar, herkenOpdracht, type Bedienbaar, type Herkend, type Opdracht } from '../src/web/opdracht.js';
import { controleerZin, inEigenWoorden, kies, opdrachtKiezen, Pauze, vanKeuze } from '../src/web/taalmodel.js';

const apparaat = (d: Partial<HouseDevice> & Pick<HouseDevice, 'id' | 'naam' | 'soort'>): HouseDevice =>
  ({ haNaam: d.naam, stand: '', aan: false, helderheidPct: null, positiePct: null, actuatorId: null, zone: null, groepen: [], dimbaar: false, kleurtemp: false, meting: null, klimaat: null, meetKamer: false, ...d }) as HouseDevice;

const lamp = (id: string, naam: string, aan: boolean, helderheidPct: number | null, dimbaar = true) => apparaat({ id, naam, soort: 'licht', aan, helderheidPct, dimbaar, kleurtemp: dimbaar });
const scherm = (id: string, naam: string, terugmelding: boolean, zonnescherm = false, positiePct: number | null = 100) =>
  apparaat({ id, naam, soort: 'screen', positiePct: terugmelding ? positiePct : null, scherm: { terugmelding, standKiezen: terugmelding, ...(zonnescherm ? { zonnescherm } : {}) } });

const ruimte = (id: string, naam: string, apparaten: HouseDevice[], scenes: { id: string; naam: string }[] = []) => ({ id, naam, apparaten, scenes: scenes.map((s) => ({ ...s, actief: false })) });

const huis = {
  etages: [
    {
      id: 'bg',
      naam: 'Begane grond',
      ruimtes: [
        ruimte('beneden', 'Beneden', [lamp('light.plafonniere', 'Plafonnière', true, 80), lamp('light.sfeer', 'Sfeerverlichting', true, 100), scherm('cover.screen', 'Screen woonkamer', true, false, 100)], [{ id: 'scene.film', naam: 'Film' }]),
        ruimte('keuken', 'Keuken', [lamp('light.keuken', 'Keukenlamp', false, null, false)]),
      ],
    },
    { id: 'tuin', naam: 'Buiten', ruimtes: [ruimte('achtertuin', 'Achtertuin', [scherm('cover.zonnescherm', 'Zonnescherm', false, true), lamp('light.spot_3', 'Spot tuinhuis 3', false, null)])] },
  ],
} as unknown as HouseReport;

const alles = bedienbaar(huis, { licht: true, scenes: true, schermen: true });

function opdracht(tekst: string, b: Bedienbaar = alles, laatste: string | null = null): Opdracht {
  const h = herkenOpdracht(tekst, b, 'nl', laatste);
  if (!h?.ok) throw new Error(`geen opdracht voor "${tekst}": ${h ? h.antwoord : 'null'}`);
  return h.opdracht;
}

/** Elk getal in de zin is een feit (besluit 88), ook bij een opdracht. */
function elkGetalEenFeit(o: Opdracht): void {
  let rest = o.antwoord;
  for (const f of [...o.feiten].sort((a, b) => b.tekst.length - a.tekst.length)) rest = rest.split(f.tekst).join('');
  expect(rest, o.antwoord).not.toMatch(/\d/);
}

describe('wat de assistent mag bedienen', () => {
  it('volgt licht, scènes en schermen bedienen, net als de knoppen', () => {
    expect(alles.lampen.map((l) => l.id)).toEqual(['light.plafonniere', 'light.sfeer', 'light.keuken', 'light.spot_3']);
    expect(alles.schermen.map((s) => s.id)).toEqual(['cover.screen', 'cover.zonnescherm']);
    expect(alles.scenes.map((s) => s.id)).toEqual(['scene.film']);
    const geenLicht = bedienbaar(huis, { licht: false, scenes: true, schermen: true });
    expect(geenLicht.lampen).toEqual([]);
    expect(geenLicht.scenes).toEqual([]);
    expect(bedienbaar(huis, { licht: true, scenes: false, schermen: false }).schermen).toEqual([]);
    expect(bedienbaar(null, { licht: true, scenes: true, schermen: true }).lampen).toEqual([]);
  });

  it('ziet een garagedeur, poort of deur niet als scherm', () => {
    const e = (entity_id: string, extra: Partial<HaRegistryEntity> = {}) => ({ entity_id, device_id: null, ...extra }) as HaRegistryEntity;
    expect(geenScherm(e('cover.garagedeur'), undefined)).toBe(true);
    expect(geenScherm(e('cover.io_2243641_1', { original_device_class: 'garage' }), undefined)).toBe(true);
    expect(geenScherm(e('cover.x'), { entity_id: 'cover.x', state: 'closed', attributes: { device_class: 'gate' }, last_changed: '', last_updated: '' })).toBe(true);
    expect(geenScherm(e('cover.tuinpoort'), undefined)).toBe(true);
    expect(geenScherm(e('cover.screen'), undefined)).toBe(false);
    expect(geenScherm(e('cover.zonnescherm', { original_device_class: 'awning' }), undefined)).toBe(false);
  });
});

describe('bedienen met een zin', () => {
  it('maakt het licht in een kamer zachter, met wat het was', () => {
    const o = opdracht('Doe het licht beneden wat zachter');
    expect(o.pad).toBe('api/licht');
    expect(o.body).toEqual({ doel: 'kamer', id: 'beneden', aan: true, helderheidPct: 50 });
    expect(o.antwoord).toBe('Het licht beneden staat op 50%.');
    expect(o.gedaan).toEqual([{ soort: 'licht', waarde: '50%', uitleg: 'Licht beneden, was aan' }]);
    expect(o.ruimte).toBe('beneden');
    elkGetalEenFeit(o);
  });

  it('zet een lamp bij naam op een stand, aan of uit', () => {
    const o = opdracht('plafonnière op 40%');
    expect(o.body).toEqual({ doel: 'lamp', id: 'light.plafonniere', aan: true, helderheidPct: 40 });
    expect(o.antwoord).toBe('De plafonnière staat op 40%.');
    expect(o.gedaan[0]).toEqual({ soort: 'licht', waarde: '40%', uitleg: 'Plafonnière, was 80%' });
    // Een vervolg dat nu kan: de andere lamp, de scène, of alles uit.
    expect(opdracht('plafonnière zachter').vervolg.map((v) => v.label)).toEqual(['Sfeerverlichting ook zachter', 'Scène Film', 'Alles beneden uit']);
    expect(opdracht('keukenlamp aan').body).toEqual({ doel: 'lamp', id: 'light.keuken', aan: true });
    expect(opdracht('licht in de keuken uit').body).toEqual({ doel: 'kamer', id: 'keuken', aan: false });
    expect(opdracht('sfeerverlichting warm').body).toEqual({ doel: 'lamp', id: 'light.sfeer', aan: true, kleur: 'warm' });
    // Een cijfer in de naam is zelf een feit.
    elkGetalEenFeit(opdracht('spot tuinhuis 3 op 20 procent'));
    expect(opdracht('spot tuinhuis 3 op 20 procent').body).toEqual({ doel: 'lamp', id: 'light.spot_3', aan: true, helderheidPct: 20 });
  });

  it('zegt waarom het niet kan, in plaats van te gokken', () => {
    const h = (t: string) => herkenOpdracht(t, alles, 'nl') as Extract<Herkend, { ok: false }>;
    expect(h('keukenlamp zachter')).toMatchObject({ ok: false, antwoord: 'Keukenlamp kan alleen aan en uit.' });
    expect(h('doe het licht aan')).toMatchObject({ ok: false, antwoord: expect.stringContaining('Welk licht') });
    // Alles uit kan, alles aan niet (besluit 97).
    expect(opdracht('alle lampen uit').body).toEqual({ doel: 'huis', id: null, aan: false });
    expect(h('alle lampen aan')).toMatchObject({ ok: false });
  });

  it('doet een screen dicht en open, ook "naar beneden" zonder de kamer Beneden', () => {
    const dicht = opdracht('doe het screen dicht');
    expect(dicht).toMatchObject({ pad: 'api/scherm', body: { id: 'cover.screen', actie: 'dicht', standPct: null }, beweegt: { id: 'cover.screen', naam: 'Screen woonkamer' } });
    expect(dicht.antwoord).toBe('Het screen woonkamer gaat dicht. Zeg stop als het genoeg is.');
    expect(dicht.gedaan[0]).toEqual({ soort: 'scherm', waarde: 'Gaat dicht', uitleg: 'Screen woonkamer, was open' });
    expect(opdracht('screen naar beneden').body).toMatchObject({ actie: 'dicht' });
    expect(opdracht('screen omhoog').body).toMatchObject({ actie: 'open' });
    // Een stand is hoeveel dicht, zoals de app hem toont; Home Assistant krijgt 100 als open.
    const stand = opdracht('screen op 60%');
    expect(stand.body).toEqual({ id: 'cover.screen', actie: 'stand', standPct: 40 });
    expect(stand.antwoord).toBe('Het screen woonkamer gaat naar 60% dicht.');
    elkGetalEenFeit(stand);
    expect(opdracht('screen half').body).toEqual({ id: 'cover.screen', actie: 'stand', standPct: 50 });
  });

  it('vouwt een zonnescherm uit en klapt het in, zonder stand als het niet terugmeldt', () => {
    expect(opdracht('zonnescherm uit').body).toMatchObject({ id: 'cover.zonnescherm', actie: 'open' });
    expect(opdracht('zonnescherm in').body).toMatchObject({ id: 'cover.zonnescherm', actie: 'dicht' });
    expect(herkenOpdracht('zonnescherm half', alles, 'nl')).toMatchObject({ ok: false, antwoord: expect.stringContaining('open, dicht en stop') });
  });

  it('stopt het scherm dat net bewoog, of vraagt welk', () => {
    expect(opdracht('stop', alles, 'cover.zonnescherm').body).toEqual({ id: 'cover.zonnescherm', actie: 'stop', standPct: null });
    expect(opdracht('stop', alles, 'cover.zonnescherm').antwoord).toContain('meldt niet terug');
    expect(opdracht('Stop het screen').body).toMatchObject({ id: 'cover.screen', actie: 'stop' });
    expect(herkenOpdracht('stop', alles, 'nl')).toMatchObject({ ok: false, antwoord: expect.stringContaining('Welk scherm') });
    const eenScherm = bedienbaar(huis, { licht: true, scenes: true, schermen: true });
    expect(herkenOpdracht('stop', { ...eenScherm, schermen: eenScherm.schermen.slice(0, 1) }, 'nl')).toMatchObject({ ok: true });
  });

  it('zet een scène aan', () => {
    expect(opdracht('scène film').body).toEqual({ id: 'scene.film' });
    expect(opdracht('zet film aan').pad).toBe('api/scene');
  });

  it('laat vragen en ander werk aan de woordzoeker', () => {
    for (const t of ['waarom is het licht aan', 'staat het screen dicht?', 'hoeveel zon komt er nog', 'wat doe je nu', 'koel de zolder', 'het is hier zo fel']) {
      expect(herkenOpdracht(t, alles, 'nl'), t).toBeNull();
    }
  });

  it('bedient niets wat niet mag', () => {
    const geen = bedienbaar(huis, { licht: false, scenes: false, schermen: false });
    // Het zegt waar je het aanzet, en geeft geen opdracht.
    expect(herkenOpdracht('doe het screen dicht', geen, 'nl')).toMatchObject({ ok: false, antwoord: expect.stringContaining('Schermen bedienen staat niet aan') });
    expect(herkenOpdracht('plafonnière uit', geen, 'nl')).toMatchObject({ ok: false, antwoord: expect.stringContaining('Licht bedienen staat niet aan') });
  });
});

describe('bedienen met een zin in het Engels (besluit 185, stap 9 deel 6)', () => {
  function en(tekst: string, laatste: string | null = null): Opdracht {
    const h = herkenOpdracht(tekst, alles, 'en', laatste);
    if (!h?.ok) throw new Error(`geen opdracht voor "${tekst}": ${h ? h.antwoord : 'null'}`);
    return h.opdracht;
  }

  it('verstaat het licht: aan, uit, zachter, feller, een stand en een tint', () => {
    expect(en('Turn on the lights in the keuken').body).toEqual({ doel: 'kamer', id: 'keuken', aan: true });
    expect(en('switch off the plafonnière').body).toEqual({ doel: 'lamp', id: 'light.plafonniere', aan: false });
    const dim = en('dim the lights in beneden');
    expect(dim.body).toEqual({ doel: 'kamer', id: 'beneden', aan: true, helderheidPct: 50 });
    expect(dim.antwoord).toBe('The lights in Beneden are at 50%.');
    expect(dim.gedaan).toEqual([{ soort: 'licht', waarde: '50%', uitleg: 'Lights Beneden, was on' }]);
    expect(en('set the plafonnière to 40%').body).toMatchObject({ helderheidPct: 40 });
    expect(en('make the sfeerverlichting brighter').body).toMatchObject({ doel: 'lamp', id: 'light.sfeer' });
    expect(en('sfeerverlichting warm white').body).toMatchObject({ kleur: 'warm' });
    expect(en('turn off all the lights').body).toEqual({ doel: 'huis', id: null, aan: false });
    expect(en('switch off the plafonnière').gedaan[0]).toEqual({ soort: 'licht', waarde: 'Off', uitleg: 'Plafonnière, was 80%' });
  });

  it('geeft een Engels vervolg dat het zelf weer verstaat', () => {
    const o = en('plafonnière dimmer');
    expect(o.vervolg.map((v) => v.label)).toEqual(['Sfeerverlichting dimmer too', 'Scene Film', 'All off in Beneden']);
    for (const v of o.vervolg) expect(herkenOpdracht(v.tekst, alles, 'en'), v.tekst).toMatchObject({ ok: true });
  });

  it('verstaat schermen en het zonnescherm', () => {
    const dicht = en('close the screen');
    expect(dicht.body).toMatchObject({ id: 'cover.screen', actie: 'dicht' });
    expect(dicht.antwoord).toBe('Screen woonkamer is closing. Say stop when it is enough.');
    expect(dicht.gedaan[0]).toEqual({ soort: 'scherm', waarde: 'Closing', uitleg: 'Screen woonkamer, was open' });
    expect(en('lower the blinds').body).toMatchObject({ actie: 'dicht' });
    expect(en('raise the screen').body).toMatchObject({ actie: 'open' });
    expect(en('screen to 60%').body).toEqual({ id: 'cover.screen', actie: 'stand', standPct: 40 });
    expect(en('extend the awning').body).toMatchObject({ id: 'cover.zonnescherm', actie: 'open' });
    expect(en('retract the awning').body).toMatchObject({ id: 'cover.zonnescherm', actie: 'dicht' });
    expect(en('stop the awning').body).toMatchObject({ id: 'cover.zonnescherm', actie: 'stop' });
    expect(en('stop', 'cover.zonnescherm').antwoord).toContain('does not report where it is');
    for (const v of dicht.vervolg) expect(herkenOpdracht(v.tekst, alles, 'en'), v.tekst).toMatchObject({ ok: true });
  });

  it('zet een scène aan, en laat vragen aan de woordzoeker', () => {
    expect(en('activate scene film').body).toEqual({ id: 'scene.film' });
    expect(en('turn on film').pad).toBe('api/scene');
    for (const t of ['why is the light on', 'is the screen closed?', 'what are you doing now', 'cool the zolder']) expect(herkenOpdracht(t, alles, 'en'), t).toBeNull();
    expect(herkenOpdracht('turn on the light', alles, 'en')).toMatchObject({ ok: false, antwoord: expect.stringContaining('Which light') });
  });
});

describe('in eigen woorden', () => {
  const vast = { antwoord: 'De wasruimte wacht op zon. De airco heeft 0,8 kW nodig en er is nu 0,5 kW over.', feiten: [{ bron: 'a', tekst: '0,8 kW' }, { bron: 'b', tekst: '0,5 kW' }] };

  it('neemt een zin met dezelfde getallen over', () => {
    expect(controleerZin('"De wasruimte wacht nog even: de airco vraagt 0,8 kW en het dak geeft nu 0,5 kW."', vast)).toBe('De wasruimte wacht nog even: de airco vraagt 0,8 kW en het dak geeft nu 0,5 kW.');
    expect(controleerZin('Even geduld, de zon is nog niet sterk genoeg voor de wasruimte.', vast)).not.toBeNull();
  });

  it('weigert een getal dat er niet stond, ook in woorden', () => {
    expect(controleerZin('De airco vraagt 0,9 kW.', vast)).toBeNull();
    expect(controleerZin('De airco vraagt 0,8 kW en het is 21 graden.', vast)).toBeNull();
    expect(controleerZin('Over twee uur is er genoeg zon.', vast)).toBeNull();
    expect(controleerZin('Er is de helft van wat nodig is.', vast)).toBeNull();
  });

  it('weigert opmaak, entity-ID’s, lijsten en lange verhalen', () => {
    expect(controleerZin('**De wasruimte** wacht.', vast)).toBeNull();
    expect(controleerZin('climate.wasruimte wacht.', vast)).toBeNull();
    expect(controleerZin('- de wasruimte wacht', vast)).toBeNull();
    expect(controleerZin('Een. Twee. Drie. Vier.', vast)).toBeNull();
    expect(controleerZin('x'.repeat(500), vast)).toBeNull();
    expect(controleerZin(42, vast)).toBeNull();
  });

  it('valt terug op het vaste antwoord bij een fout, een slechte zin of wachten, en zegt waarom', async () => {
    expect(await inEigenWoorden(async () => 'De wasruimte wacht op meer zon: 0,8 kW nodig, 0,5 kW over.', null, vast, 'nl')).toMatchObject({ antwoord: 'De wasruimte wacht op meer zon: 0,8 kW nodig, 0,5 kW over.', eigen: true, reden: null });
    expect(await inEigenWoorden(async () => ({ zin: 'Nog even wachten op de zon.' }), null, vast, 'nl')).toMatchObject({ antwoord: 'Nog even wachten op de zon.', eigen: true });
    expect(await inEigenWoorden(async () => 'Er is 3 kW over.', null, vast, 'nl')).toMatchObject({ antwoord: vast.antwoord, eigen: false, reden: expect.stringContaining('klopte niet') });
    expect(await inEigenWoorden(async () => { throw new Error('You exceeded your current quota'); }, null, vast, 'nl')).toMatchObject({ antwoord: vast.antwoord, eigen: false, reden: 'Het gratis gebruik van dit model is op.' });
    const traag = () => new Promise<string>((ok) => setTimeout(() => ok('Te laat.'), 200));
    expect(await inEigenWoorden(traag, null, vast, 'nl', 20)).toMatchObject({ antwoord: vast.antwoord, eigen: false, reden: expect.stringContaining('langer dan') });
  });

  it('vraagt na "gebruik op" of "te druk" even niets, zodat een vraag niet eerst op de fout wacht', async () => {
    let nu = 0;
    const pauze = new Pauze(() => nu);
    let vragen = 0;
    let fout: Error | null = new Error('Sorry, I had a problem getting a response from Google Generative AI.: {"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20\nPlease retry in 3h21m52.6s.","status":"RESOURCE_EXHAUSTED"}}');
    const model = pauze.om(async () => {
      vragen += 1;
      if (fout) throw fout;
      return 'Goed.';
    });
    await expect(model('x')).rejects.toThrow(/quota/);
    expect(pauze.stand).toEqual({ tot: (3 * 3600 + 21 * 60 + 52.6) * 1000, reden: 'Het gratis gebruik van dit model is op.' });
    // Tijdens de pauze: meteen een fout, zonder het model te vragen.
    await expect(model('x')).rejects.toThrow(/^pauze: /);
    expect(vragen).toBe(1);
    expect((await inEigenWoorden(model, null, vast, 'nl')).reden).toBe('Het gratis gebruik van dit model is op.');
    // Daarna weer gewoon.
    nu = 4 * 3600_000;
    fout = null;
    expect(await model('x')).toBe('Goed.');
    // Te druk: twee minuten.
    fout = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');
    await expect(model('x')).rejects.toThrow();
    expect(pauze.stand).toEqual({ tot: nu + 120_000, reden: 'Het model heeft het nu te druk.' });
    // Een andere fout: geen pauze.
    nu += 200_000;
    fout = new Error('iets anders');
    await expect(model('x')).rejects.toThrow();
    expect(pauze.stand).toBeNull();
  });

  it('vraagt het model om de getallen precies over te nemen', async () => {
    let gevraagd = '';
    await inEigenWoorden(async (o) => ((gevraagd = o), 'Goed.'), 'Waarom wacht de wasruimte?', vast, 'nl');
    expect(gevraagd).toContain('Vraag van de bewoner: Waarom wacht de wasruimte?');
    expect(gevraagd).toContain(`Vast antwoord: ${vast.antwoord}`);
    expect(gevraagd).toContain('Getallen: 0,8 kW ; 0,5 kW');
  });
});

describe('het model laten kiezen', () => {
  const zones = [{ id: 'zolder', naam: 'Zolder' }];

  it('neemt alleen een keuze uit de lijst over, en bouwt die als een gewone opdracht', () => {
    expect(vanKeuze({ soort: 'scherm', id: 'cover.screen', actie: 'dicht' }, alles, zones, 'nl')).toMatchObject({ soort: 'opdracht', herkend: { ok: true, opdracht: { body: { id: 'cover.screen', actie: 'dicht' } } } });
    expect(vanKeuze({ soort: 'licht', id: 'kamer:beneden', actie: 'zachter' }, alles, zones, 'nl')).toMatchObject({ soort: 'opdracht', herkend: { ok: true, opdracht: { body: { doel: 'kamer', id: 'beneden' } } } });
    expect(vanKeuze('{"soort":"scene","id":"scene.film"}', alles, zones, 'nl')).toMatchObject({ soort: 'opdracht' });
    expect(vanKeuze({ soort: 'vraag', actie: 'waarom', kamer: 'zolder' }, alles, zones, 'nl')).toEqual({ soort: 'vraag', vraag: { kind: 'waarom', kamer: 'zolder' } });
    expect(vanKeuze({ soort: 'vraag', actie: 'zon' }, alles, zones, 'nl')).toEqual({ soort: 'vraag', vraag: { kind: 'zon' } });
  });

  it('weigert wat niet in de lijst staat of niet bestaat', () => {
    for (const k of [
      { soort: 'scherm', id: 'cover.garagedeur', actie: 'open' },
      { soort: 'licht', id: 'climate.zolder', actie: 'uit' },
      { soort: 'licht', id: 'light.plafonniere', actie: 'knipper' },
      { soort: 'licht', id: 'light.plafonniere', actie: 'helderheid', waarde: '250' },
      { soort: 'scherm', id: 'cover.screen', actie: 'stand' },
      { soort: 'klimaat', id: 'climate.zolder', actie: 'koelen' },
      { soort: 'vraag', actie: 'waarom', kamer: 'kelder' },
      'geen json',
      null,
    ]) {
      expect(vanKeuze(k, alles, zones, 'nl'), JSON.stringify(k)).toEqual({ soort: 'niets' });
    }
  });

  it('geeft het model de lijst en de velden, en niets bij een fout', async () => {
    const tekst = opdrachtKiezen('het is hier zo fel', alles, zones);
    expect(tekst).toContain('- cover.screen | Screen woonkamer | Beneden | stand kiezen kan');
    expect(tekst).toContain('- kamer:beneden | Beneden');
    expect(tekst).not.toContain('garage');
    let velden: unknown = null;
    expect(await kies(async (_o, v) => ((velden = v), { soort: 'scherm', id: 'cover.screen', actie: 'dicht' }), 'het is hier zo fel', alles, zones, 'nl')).toMatchObject({ soort: 'opdracht' });
    expect(Object.keys(velden as object)).toEqual(['soort', 'id', 'actie', 'waarde', 'kamer']);
    expect(await kies(async () => { throw new Error('op'); }, 'x', alles, zones, 'nl')).toEqual({ soort: 'niets' });
  });
});
