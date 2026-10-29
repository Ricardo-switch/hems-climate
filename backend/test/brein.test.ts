/*
 * Het brein van de assistent (besluit 213): het gespreksgeheugen, "doe maar
 * terug", meer in één zin, het plan van het model en de teller.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import {
  dagRegels,
  deelVan,
  denk,
  Gesprekken,
  GEHEUGEN_MS,
  herkenDelen,
  isTerug,
  opdrachtDenken,
  samen,
  Teller,
  TELLER_BESTAND,
  terugVan,
  vanPlan,
  type Situatie,
} from '../src/web/brein.js';
import type { BedienLamp, Bedienbaar } from '../src/web/opdracht.js';
import type { TodayReport } from '../src/web/today.js';

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

/** Een klein huis: de zithoek met een lamp op 40%, de eettafel uit, twee screens open. */
function huis(): Bedienbaar {
  const bank = lamp('light.bank', 'Bank lamp', 'woonkamer', 'Woonkamer', { zone: 'zithoek', aan: true, helderheidPct: 40 });
  const eettafel = lamp('light.eettafel', 'Eettafel', 'woonkamer', 'Woonkamer');
  const kamers = [{ id: 'woonkamer', naam: 'Woonkamer', etageId: 'beneden', lampen: [bank, eettafel] }];
  return {
    kamers,
    zones: [{ id: 'woonkamer::zithoek', naam: 'Zithoek', kamerId: 'woonkamer', kamer: 'Woonkamer', lampen: [bank] }],
    lampen: kamers.flatMap((k) => k.lampen),
    scenes: [{ id: 'scene.woonkamer_film', naam: 'Film', kamer: 'Woonkamer' }],
    schermen: [
      { id: 'cover.screen_klein', naam: 'Screen klein', kamer: 'Woonkamer', standKiezen: true, terugmelding: true, zonnescherm: false, positiePct: 100 },
      { id: 'cover.screen_groot', naam: 'Screen groot', kamer: 'Woonkamer', standKiezen: false, terugmelding: false, zonnescherm: false, positiePct: null },
    ],
    etages: [{ id: 'beneden', naam: 'Beneden' }],
    recept: null,
  };
}

const ZONES = [{ id: 'woonkamer', naam: 'Woonkamer' }];
const SITUATIE: Situatie = {
  regels: ['Het is donderdag 29 oktober, 21:10.', 'Gisteren in Woonkamer: van 19,5° tot 21,5°.'],
  feiten: [
    { bron: 'nu.klok', tekst: '21:10' },
    { bron: 'gisteren.woonkamer.min', tekst: '19,5°' },
    { bron: 'gisteren.woonkamer.max', tekst: '21,5°' },
  ],
};

describe('het gespreksgeheugen (besluit 213)', () => {
  it('onthoudt de laatste beurten tien minuten, per gesprek', () => {
    let nu = 0;
    const g = new Gesprekken(() => nu);
    g.voeg('wand', { vraag: 'licht aan', antwoord: 'Het licht is aan.', terug: null });
    g.voeg('telefoon', { vraag: 'hoe warm is het', antwoord: 'Het is 21°.', terug: null });
    expect(g.van('wand').map((b) => b.vraag)).toEqual(['licht aan']);
    for (let i = 0; i < 8; i++) g.voeg('wand', { vraag: `zin ${i}`, antwoord: '', terug: null });
    expect(g.van('wand')).toHaveLength(6);
    nu = GEHEUGEN_MS + 1;
    expect(g.van('wand')).toEqual([]);
  });

  it('draait de laatste opdracht één keer terug', () => {
    const g = new Gesprekken(() => 0);
    const stap = { pad: 'api/licht', body: { doel: 'lamp', id: 'light.bank', aan: false } };
    g.voeg('wand', { vraag: 'bank lamp aan', antwoord: 'De bank lamp is aan.', terug: [stap] });
    g.voeg('wand', { vraag: 'hoe warm is het', antwoord: 'Het is 21°.', terug: null });
    expect(g.neemTerug('wand')).toEqual([stap]);
    expect(g.neemTerug('wand')).toBeNull();
  });

  it('verstaat "doe maar terug", maar niet een gewone nee', () => {
    for (const z of ['Doe maar terug', 'zet het terug zoals het was', 'Maak dat ongedaan', 'draai het maar terug', 'oeps, doe het terug', 'undo', 'put it back']) expect(isTerug(z), z).toBe(true);
    for (const z of ['nee', 'terug naar thuis', 'hoeveel ging er terug naar het net', 'screen terug omhoog']) expect(isTerug(z), z).toBe(false);
  });
});

describe('terug zoals het was (besluit 213)', () => {
  it('zet elke lamp zoals hij stond, een scherm naar zijn stand, en klimaat via de brug', () => {
    const b = huis();
    expect(terugVan([{ pad: 'api/licht', body: { doel: 'kamer', id: 'woonkamer', aan: false } }], b)).toEqual([
      { pad: 'api/licht', body: { doel: 'lamp', id: 'light.bank', aan: true, helderheidPct: 40 } },
      { pad: 'api/licht', body: { doel: 'lamp', id: 'light.eettafel', aan: false } },
    ]);
    // Een scène: de lampen van zijn kamer.
    expect(terugVan([{ pad: 'api/scene', body: { id: 'scene.woonkamer_film' } }], b)).toHaveLength(2);
    // Met een stand: terug naar die stand; zonder: de andere kant op.
    expect(terugVan([{ pad: 'api/scherm', body: { id: 'cover.screen_klein', actie: 'dicht', standPct: null } }], b)).toEqual([
      { pad: 'api/scherm', body: { id: 'cover.screen_klein', actie: 'stand', standPct: 100 } },
    ]);
    expect(terugVan([{ pad: 'api/scherm', body: { id: 'cover.screen_groot', actie: 'dicht', standPct: null } }], b)).toEqual([
      { pad: 'api/scherm', body: { id: 'cover.screen_groot', actie: 'open', standPct: null } },
    ]);
    expect(terugVan([{ pad: 'api/klimaat', body: { wens: 'verwarmen', zone: 'woonkamer' } }], b)).toEqual([{ pad: 'api/klimaat', body: { terug: true } }]);
    // Een stop kan niet terug.
    expect(terugVan([{ pad: 'api/scherm', body: { id: 'cover.screen_groot', actie: 'stop', standPct: null } }], b)).toBeNull();
  });
});

describe('meer in één zin (besluit 213)', () => {
  it('leest elk deel apart als de woordzoeker ze allemaal begrijpt', () => {
    const b = huis();
    const delen = herkenDelen('doe screen klein dicht en de eettafel aan', b, 'nl');
    expect(delen?.map((o) => o.pad)).toEqual(['api/scherm', 'api/licht']);
    const s = samen(delen!.map(deelVan));
    expect(s.stappen).toHaveLength(2);
    expect(s.antwoord).toBe('Het screen klein gaat dicht. Eettafel is aan.');
    // Eén deel dat geen opdracht is: dan de hele zin de gewone weg.
    expect(herkenDelen('doe de eettafel aan en vertel hoe warm het is', b, 'nl')).toBeNull();
    expect(herkenDelen('eettafel aan', b, 'nl')).toBeNull();
  });
});

describe('het plan van het model (besluit 213)', () => {
  const b = huis();
  const KLIMAAT = [{ id: 'woonkamer', naam: 'Woonkamer' }];

  it('maakt een plan van stappen uit de lijst, en laat de rest weg', () => {
    const plan = vanPlan(
      {
        soort: 'doen',
        stappen: JSON.stringify([
          { soort: 'scherm', id: 'cover.screen_klein', actie: 'dicht' },
          { soort: 'licht', id: 'zone:woonkamer::zithoek', actie: 'helderheid', waarde: '20' },
          { soort: 'scherm', id: 'cover.garagedeur', actie: 'open' },
          { soort: 'klimaat', id: 'woonkamer', actie: 'warmer', waarde: '' },
        ]),
        zin: 'Ik doe het screen dicht en het licht zachter.',
      },
      b,
      ZONES,
      KLIMAAT,
      SITUATIE,
      'nl',
    );
    expect(plan.soort).toBe('doen');
    if (plan.soort !== 'doen') return;
    expect(plan.stappen.map((s) => s.soort)).toEqual(['opdracht', 'opdracht', 'klimaat']);
    expect(plan.stappen[2]).toEqual({ soort: 'klimaat', wens: 'verwarmen', kamer: 'woonkamer', temperatuurC: null });
    // De woorden van Flash-Lite in de proef van 29 oktober: "sluiten", "dimmen" met "30%".
    const flash = vanPlan(
      { soort: 'doen', stappen: '[{"soort": "scherm", "id": "cover.screen_groot", "actie": "sluiten", "waarde": ""}, {"soort": "licht", "id": "zone:woonkamer::zithoek", "actie": "dimmen", "waarde": "30%"}]' },
      b,
      ZONES,
      KLIMAAT,
      SITUATIE,
      'nl',
    );
    expect(flash.soort === 'doen' && flash.stappen.map((s) => (s.soort === 'opdracht' && s.herkend.ok ? s.herkend.opdracht.body : null))).toEqual([
      { id: 'cover.screen_groot', actie: 'dicht', standPct: null },
      { doel: 'zone', id: 'woonkamer::zithoek', aan: true, helderheidPct: 30 },
    ]);
    // Klimaat alleen voor een kamer van de brug.
    expect(vanPlan({ soort: 'doen', stappen: [{ soort: 'klimaat', id: 'zolder', actie: 'warmer' }] }, b, ZONES, KLIMAAT, SITUATIE, 'nl')).toEqual({ soort: 'niets' });
  });

  it('beantwoordt een vraag alleen met de getallen uit de feiten', () => {
    expect(vanPlan({ soort: 'antwoord', zin: 'Gisteren was het in de woonkamer tussen 19,5° en 21,5°.' }, b, ZONES, [], SITUATIE, 'nl')).toEqual({
      soort: 'antwoord',
      zin: 'Gisteren was het in de woonkamer tussen 19,5° en 21,5°.',
    });
    expect(vanPlan({ soort: 'antwoord', zin: 'Gisteren was het 22°.' }, b, ZONES, [], SITUATIE, 'nl')).toEqual({ soort: 'niets' });
    expect(vanPlan({ soort: 'vraag', vraag: 'warm' }, b, ZONES, [], SITUATIE, 'nl')).toEqual({ soort: 'vraag', vraag: { kind: 'warm' } });
    expect(vanPlan('geen json', b, ZONES, [], SITUATIE, 'nl')).toEqual({ soort: 'niets' });
  });

  it('geeft het model de situatie, het gesprek en de lijsten', () => {
    const tekst = opdrachtDenken('en nog wat zachter', b, ZONES, SITUATIE, [{ ms: 0, vraag: 'zithoek aan', antwoord: 'Het licht in de zithoek is aan.', terug: null }], [{ id: 'woonkamer', naam: 'Woonkamer' }], 'nl');
    expect(tekst).toContain('Gisteren in Woonkamer: van 19,5° tot 21,5°.');
    expect(tekst).toContain('- Bewoner: zithoek aan');
    expect(tekst).toContain('zone:woonkamer::zithoek');
    expect(tekst).toContain('Zin van de bewoner: en nog wat zachter');
    expect(tekst).toContain('Klimaat (soort klimaat, id is de kamer): woonkamer (Woonkamer)');
  });

  it('wacht niet langer dan afgesproken', async () => {
    const traag = () => new Promise<unknown>((ok) => setTimeout(() => ok({ soort: 'vraag', vraag: 'warm' }), 200));
    expect(await denk(traag, 'hoe warm', b, ZONES, SITUATIE, [], [], 'nl', 20)).toEqual({ soort: 'niets' });
    expect(await denk(traag, 'hoe warm', b, ZONES, SITUATIE, [], [], 'nl', 1000)).toEqual({ soort: 'vraag', vraag: { kind: 'warm' } });
  });
});

describe('vandaag en gisteren als feiten (besluit 213)', () => {
  it('zegt per kamer de laagste en hoogste temperatuur, de zon en hoe lang er verwarmd werd', () => {
    const config = exampleSite;
    const zone = config.zones[0]!;
    const actuator = config.actuators[0]!;
    const r = {
      vanMs: 0,
      totMs: 86_400_000,
      kwartieren: [],
      zonWh: 3240,
      netAfWh: 8100,
      netTerugWh: 950,
      apparaten: [{ actuatorId: actuator.id, smartClimate: [], huidig: [{ vanMs: 0, totMs: 4.25 * 3_600_000, actie: 'heat' }] }],
      uitstelbaar: [],
      warmtebuffers: [],
      zones: [{ zoneId: zone.id, naam: zone.name, goed: { vanC: null, totC: null }, kwartieren: [19.46, null, 21.5, 20] }],
      besluiten: [],
    } as unknown as TodayReport;
    const s = dagRegels(r, config, 'gisteren', 'nl');
    expect(s.regels).toEqual([
      `Gisteren in ${zone.name}: van 19,5° tot 21,5°.`,
      'Gisteren gaven de panelen 3,2 kWh, kwam er 8,1 kWh van het net en ging er 1 kWh terug.',
      `Gisteren verwarmde ${actuator.name} 4 uur en 15 minuten.`,
    ]);
    // Elk getal is een feit.
    for (const f of ['19,5°', '21,5°', '3,2 kWh', '8,1 kWh', '1 kWh', '4 uur en 15 minuten']) expect(s.feiten.map((x) => x.tekst)).toContain(f);
  });
});

describe('de teller (besluit 213)', () => {
  it('telt per dag de vragen, de fouten en hoe snel, en bewaart dat', async () => {
    const map = await mkdtemp(join(tmpdir(), 'teller-'));
    let nu = 0;
    let dag = '2026-10-29';
    const teller = new Teller({ map, dag: () => dag, nu: () => nu });
    const snel = teller.om(async () => ((nu += 1200), 'ok'));
    const fout = teller.om(async () => {
      throw new Error('RESOURCE_EXHAUSTED');
    });
    await snel('a');
    await snel('b');
    await expect(fout('c')).rejects.toThrow();
    dag = '2026-10-30';
    await snel('d');
    // Even wachten tot het bewaren klaar is.
    await new Promise((r) => setTimeout(r, 20));
    expect(await teller.stand()).toEqual([
      { dag: '2026-10-30', vragen: 1, fouten: 0, totaalMs: 1200, langsteMs: 1200 },
      { dag: '2026-10-29', vragen: 3, fouten: 1, totaalMs: 2400, langsteMs: 1200 },
    ]);
    const bewaard = JSON.parse(await readFile(join(map, TELLER_BESTAND), 'utf8')) as { dagen: unknown[] };
    expect(bewaard.dagen).toHaveLength(2);
    expect(await new Teller({ map, dag: () => dag }).stand()).toHaveLength(2);
  });
});
