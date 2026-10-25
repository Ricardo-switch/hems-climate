import { describe, expect, it } from 'vitest';

import { GRENS_W, jaarPrijs, leesToelichting, nachtenUit, sluipRapport, sluipVoorBel, type Nacht } from '../src/web/sluipverbruik.js';
import { wat, type MeldingenBron } from '../src/web/meldingen.js';
import { groepVan, STANDAARD_MELDINGEN } from '../src/web/push.js';

const TZ = 'Europe/Amsterdam';
/** Een uur in de plaatselijke klok van Amsterdam (zomertijd: UTC+2). */
const uur = (dag: string, u: number) => Date.parse(`${dag}T${String(u).padStart(2, '0')}:00:00+02:00`);

/** Nachten vanaf een dag, met deze watts. */
function nachten(van: string, watts: readonly number[]): Nacht[] {
  const start = Date.parse(`${van}T12:00:00Z`);
  return watts.map((w, i) => ({ dag: new Date(start + i * 86_400_000).toISOString().slice(0, 10), w }));
}

describe('het sluipverbruik (besluit 192)', () => {
  it('neemt per nacht het laagste uur tussen 01:00 en 05:00, in de plaatselijke klok', () => {
    const rijen = [
      { start: uur('2026-10-20', 0), mean: 90 }, // voor het venster
      { start: uur('2026-10-20', 1), mean: 220 },
      { start: uur('2026-10-20', 2), mean: 190 },
      { start: uur('2026-10-20', 3), mean: 200.4 },
      { start: uur('2026-10-20', 4), mean: 210 },
      { start: uur('2026-10-20', 5), mean: 80 }, // na het venster
      { start: new Date(uur('2026-10-21', 1)).toISOString(), mean: 300 },
      { start: uur('2026-10-21', 2), mean: 310 },
    ];
    expect(nachtenUit(rijen, TZ, uur('2026-10-21', 12))).toEqual([
      { dag: '2026-10-20', w: 190 },
      { dag: '2026-10-21', w: 300 },
    ]);
  });

  it('telt de nacht van vandaag pas na 05:00, en niet met één uur of stroom terug', () => {
    const rijen = [
      { start: uur('2026-10-19', 1), mean: 200 }, // maar één uur
      { start: uur('2026-10-20', 1), mean: 150 },
      { start: uur('2026-10-20', 2), mean: -40 }, // terug naar het net: geen sluipverbruik
      { start: uur('2026-10-21', 1), mean: 180 },
      { start: uur('2026-10-21', 2), mean: 170 },
    ];
    expect(nachtenUit(rijen, TZ, uur('2026-10-21', 4))).toEqual([]);
    expect(nachtenUit(rijen, TZ, uur('2026-10-21', 6))).toEqual([{ dag: '2026-10-21', w: 170 }]);
  });

  it('kent je gewone nacht, een hoge nacht, de reeks en wat het scheelt', () => {
    // 20 gewone nachten rond 180 W, dan 10 nachten op 300 W.
    const n = nachten('2026-09-25', [...Array.from({ length: 20 }, (_, i) => 175 + (i % 5) * 5), ...Array.from({ length: 10 }, () => 300)]);
    const r = sluipRapport(n, 0.25)!;
    // De vijf laagste: vier keer 175 en één keer 180.
    expect(r.gewoonW).toBe(176);
    expect(r.vannacht).toEqual({ dag: '2026-10-24', w: 300 });
    expect(r.bovenW).toBe(124);
    expect(r.hoog).toBe(true);
    expect(r.reeks).toEqual({ sinds: '2026-10-15', nachten: 10 });
    expect(r.hoogIn30).toBe(10);
    expect(r.perJaarKwh).toBe(Math.round((300 * 8760) / 1000));
    expect(r.perJaarEuro).toBe(Math.round(r.perJaarKwh * 0.25));
    expect(r.scheelt).toEqual({ kwh: Math.round((124 * 8760) / 1000), euro: Math.round(Math.round((124 * 8760) / 1000) * 0.25) });
    expect(r.laagste.w).toBe(175);
    expect(r.maanden.map((m) => m.maand)).toEqual(['2026-09', '2026-10']);
  });

  it('noemt een gewone nacht gewoon, zonder reeks en zonder wat het scheelt', () => {
    const n = nachten('2026-09-25', [...Array.from({ length: 29 }, () => 180), 180 + GRENS_W - 1]);
    const r = sluipRapport(n, null)!;
    expect(r.hoog).toBe(false);
    expect(r.reeks).toBeNull();
    expect(r.scheelt).toBeNull();
    expect(r.perJaarEuro).toBeNull();
  });

  it('heeft minstens een week nodig', () => {
    expect(sluipRapport(nachten('2026-10-18', [180, 180, 180, 180, 180, 180]), 0.25)).toBeNull();
  });

  it('vergelijkt met dezelfde maand een jaar eerder', () => {
    const n = [...nachten('2025-10-01', Array.from({ length: 31 }, () => 200)), ...nachten('2026-10-01', Array.from({ length: 24 }, () => 280))];
    expect(sluipRapport(n, null)!.vorigJaar).toEqual({ maand: '2025-10', w: 200 });
  });

  it('rekent met het daltarief voor zijn deel van de uren', () => {
    expect(jaarPrijs({ stroom: 0.3, stroomDal: null })).toBe(0.3);
    expect(jaarPrijs({ stroom: null })).toBeNull();
    expect(jaarPrijs({ stroom: 0.3, stroomDal: 0.2 })).toBeCloseTo(0.3 * (80 / 168) + 0.2 * (88 / 168), 6);
  });

  it('bewaart wat de bewoner zegt alleen bij de reeks waar het over ging (besluit 88)', () => {
    const n = nachten('2026-09-25', [...Array.from({ length: 20 }, () => 180), ...Array.from({ length: 10 }, () => 300)]);
    expect(sluipRapport(n, null, { sinds: '2026-10-15', tekst: 'de pc', weetNiet: false })!.toelichting).toEqual({ tekst: 'de pc', weetNiet: false });
    expect(sluipRapport(n, null, { sinds: '2026-09-01', tekst: 'de pc', weetNiet: false })!.toelichting).toBeNull();
    expect(leesToelichting({ sinds: '2026-10-15', tekst: '  de pc  ' })).toEqual({ ok: true, toelichting: { sinds: '2026-10-15', tekst: 'de pc', weetNiet: false } });
    expect(leesToelichting({ sinds: '2026-10-15', weetNiet: true })).toEqual({ ok: true, toelichting: { sinds: '2026-10-15', tekst: null, weetNiet: true } });
    expect(leesToelichting({ sinds: '15 oktober', tekst: 'x' }).ok).toBe(false);
    expect(leesToelichting({ sinds: '2026-10-15' }).ok).toBe(false);
  });

  it('meldt een hoge nacht van vandaag of gisteren, en een oude niet meer', () => {
    const n = nachten('2026-09-25', [...Array.from({ length: 20 }, () => 180), ...Array.from({ length: 10 }, () => 300)]);
    const r = sluipRapport(n, null);
    expect(sluipVoorBel(r, uur('2026-10-24', 9), TZ)).toEqual({ dag: '2026-10-24', w: 300, gewoonW: 180, bovenW: 120, nachten: 10 });
    expect(sluipVoorBel(r, uur('2026-10-25', 3), TZ)?.dag).toBe('2026-10-24');
    expect(sluipVoorBel(r, uur('2026-10-26', 9), TZ)).toBeNull();
  });

  it('staat bij de bel met het wat en het hoeveel, zonder apparaat, en gaat de ochtend erna naar de telefoon', () => {
    const bron = { nu: 0, zonderRuimte: [], volgen: [], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null, sluip: { dag: '2026-10-24', w: 304, gewoonW: 185, bovenW: 119, nachten: 1 } } satisfies MeldingenBron;
    const [m] = wat(bron);
    expect(m).toMatchObject({ id: 'sluip', soort: 'sluip', aandacht: true, titel: 'Vannacht 119 W meer dan gewoon', tekst: '304 W tegen je gewone 185 W. Staat er iets aan?', actie: { href: 'sluipverbruik.html' } });
    expect(m!.en.titel).toBe('Last night 119 W more than usual');
    expect(wat({ ...bron, sluip: { ...bron.sluip, nachten: 10 } })[0]!.titel).toBe('Al 10 nachten meer dan gewoon');
    expect(wat({ ...bron, sluip: null })).toEqual([]);
    expect(groepVan('sluip')).toBe('sluip');
    expect(STANDAARD_MELDINGEN.sluip).toBe(true);
  });
});
