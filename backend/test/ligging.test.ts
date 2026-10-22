/**
 * Hoe de panelen liggen (besluit 157): meten uit de opbrengst, een schatting,
 * wat geldt, wat de bewoner bevestigt, en wat de pagina krijgt.
 *
 * De opbrengst is nagemaakt met hetzelfde model voor een heldere lucht, met
 * ruis, wolken en schaduw erdoor, op een plek midden in het land. De echte
 * toets op dit huis staat in besluit 157.
 */

import { describe, expect, it } from 'vitest';

import { clearSkyOnPlaneWm2, sunPosition } from '../src/core/sun.js';
import type { Geometry } from '../src/core/model.js';
import { validateConnection } from '../src/web/aansluiting.js';
import {
  dakUitAanpassing,
  dakUitMeting,
  kiesLigging,
  liggingView,
  meetLigging,
  omvormerUitType,
  schatLigging,
  voorgevelVan,
  type Meting,
  type PanelenAntwoord,
} from '../src/web/ligging.js';
import { MeldingenStore, type MeldingenBron } from '../src/web/meldingen.js';
import type { PowerRow } from '../src/web/today.js';

const PLEK = { latDeg: 52.1, lonDeg: 5.1 };
const ZONE = 'Europe/Amsterdam';
const DAG = 86_400_000;
const START = Date.UTC(2026, 9, 6);

/** Een vaste reeks "willekeurige" getallen, zodat de toets elke keer hetzelfde ziet. */
function rnd(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/**
 * Tien dagen per vijf minuten voor een dak. `helder` zegt welke dagen helder
 * zijn; de rest is bewolkt (een kwart tot de helft, met gaten). Na `schaduwUur`
 * (UTC) valt er schaduw, zoals een buurhuis.
 */
function opbrengst(
  vlakken: { azimuthDeg: number; tiltDeg: number; peakW: number }[],
  opts: { helder: number[]; omvormerW?: number; schaduwUur?: number; dagen?: number },
): PowerRow[] {
  const r = rnd(7);
  const rows: PowerRow[] = [];
  for (let d = 0; d < (opts.dagen ?? 10); d++) {
    const helder = opts.helder.includes(d);
    for (let i = 0; i < 288; i++) {
      const startMs = START + d * DAG + i * 300_000;
      const sun = sunPosition(startMs + 150_000, PLEK.latDeg, PLEK.lonDeg);
      let w = vlakken.reduce((s, v) => s + (clearSkyOnPlaneWm2(sun, v) / 1000) * v.peakW, 0) * 1.02;
      w *= helder ? 0.97 + r() * 0.05 : 0.2 + r() * 0.35;
      if (opts.schaduwUur != null && (startMs % DAG) / 3_600_000 > opts.schaduwUur) w *= 0.15;
      rows.push({ startMs, meanW: Math.min(w, opts.omvormerW ?? Infinity) });
    }
  }
  return rows;
}

const OOST_WEST = [
  { azimuthDeg: 95, tiltDeg: 45, peakW: 2400 },
  { azimuthDeg: 275, tiltDeg: 45, peakW: 2400 },
];
const beide = (v: number | null = 6, a: number | null = 6): PanelenAntwoord => ({ ligging: 'beide', aantal: v != null && a != null ? v + a : 12, voorkant: v, achterkant: a });
const verschil = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('meten uit de opbrengst (besluit 157)', () => {
  it('vindt oost en west, de helling en het vermogen uit drie heldere dagen', () => {
    const m = meetLigging(opbrengst(OOST_WEST, { helder: [1, 4, 8] }), PLEK, beide(), { timeZone: ZONE });
    expect(m).not.toBeNull();
    const az = m!.vlakken.map((v) => v.azimuthDeg).sort((a, b) => a - b);
    expect(verschil(az[0]!, 95)).toBeLessThanOrEqual(6);
    expect(verschil(az[1]!, 275)).toBeLessThanOrEqual(6);
    expect(Math.abs(m!.vlakken[0]!.tiltDeg - 45)).toBeLessThanOrEqual(6);
    expect(m!.peakW).toBeGreaterThan(4800 * 0.9);
    expect(m!.peakW).toBeLessThan(4800 * 1.15);
    // Gelijk aan beide kanten: welke de voorkant is, zegt de meting niet.
    expect(m!.vlakken.every((v) => v.kant === null)).toBe(true);
  });

  it('één heldere dag is genoeg, ook met schaduw aan het eind van de middag', () => {
    const m = meetLigging(opbrengst(OOST_WEST, { helder: [5], schaduwUur: 14.5 }), PLEK, beide(), { timeZone: ZONE });
    expect(m).not.toBeNull();
    expect(Math.min(...m!.vlakken.map((v) => verschil(v.azimuthDeg, 95)))).toBeLessThanOrEqual(8);
  });

  it('vindt een dak op het zuiden als de panelen op één kant liggen', () => {
    const zuid = [{ azimuthDeg: 185, tiltDeg: 35, peakW: 3200 }];
    const m = meetLigging(opbrengst(zuid, { helder: [2, 3] }), PLEK, { ligging: 'achterkant', aantal: 8, voorkant: null, achterkant: null }, { timeZone: ZONE });
    expect(m!.vlakken).toHaveLength(1);
    expect(verschil(m!.vlakken[0]!.azimuthDeg, 185)).toBeLessThanOrEqual(6);
    expect(Math.abs(m!.vlakken[0]!.tiltDeg - 35)).toBeLessThanOrEqual(6);
    expect(m!.vlakken[0]!.kant).toBe('achterkant');
  });

  it('kiest zelf één of twee vlakken als de kant niet bekend is', () => {
    const m = meetLigging(opbrengst(OOST_WEST, { helder: [1, 6] }), PLEK, { ligging: 'weetniet', aantal: 12, voorkant: null, achterkant: null }, { timeZone: ZONE });
    expect(m!.vlakken).toHaveLength(2);
  });

  it('weet bij een verschil per kant ook welke kant de voorkant is', () => {
    const vlakken = [
      { azimuthDeg: 95, tiltDeg: 45, peakW: 3200 },
      { azimuthDeg: 275, tiltDeg: 45, peakW: 1600 },
    ];
    const m = meetLigging(opbrengst(vlakken, { helder: [0, 3, 7] }), PLEK, beide(8, 4), { timeZone: ZONE });
    const voor = m!.vlakken.find((v) => v.kant === 'voorkant')!;
    expect(verschil(voor.azimuthDeg, 95)).toBeLessThanOrEqual(8);
  });

  it('laat afgekapte uren van de omvormer buiten de richting', () => {
    const zuid = [{ azimuthDeg: 180, tiltDeg: 40, peakW: 4800 }];
    const m = meetLigging(opbrengst(zuid, { helder: [1, 2, 3], omvormerW: 2500 }), PLEK, { ligging: 'voorkant', aantal: 12, voorkant: null, achterkant: null }, { timeZone: ZONE, omvormerW: 2500 });
    expect(m).not.toBeNull();
    expect(verschil(m!.vlakken[0]!.azimuthDeg, 180)).toBeLessThanOrEqual(8);
  });

  it('meet niets zonder heldere dag, zonder metingen, of zonder panelen', () => {
    expect(meetLigging(opbrengst(OOST_WEST, { helder: [] }), PLEK, beide(), { timeZone: ZONE })).toBeNull();
    expect(meetLigging([], PLEK, beide(), { timeZone: ZONE })).toBeNull();
    expect(meetLigging(opbrengst(OOST_WEST, { helder: [1, 2] }), PLEK, { ligging: 'geen', aantal: null, voorkant: null, achterkant: null }, { timeZone: ZONE })).toBeNull();
  });

  it('geeft de helderste dag per kwartier mee, gemeten naast de lijn', () => {
    const m = meetLigging(opbrengst(OOST_WEST, { helder: [4] }), PLEK, beide(), { timeZone: ZONE });
    expect(m!.dag.datum).toBe('2026-10-10');
    expect(m!.dag.kWh).toBeGreaterThan(10);
    const [uur, gemeten, berekend] = m!.dag.punten.find((p) => p[0] === 12)!;
    expect(uur).toBe(12);
    expect(Math.abs(gemeten - berekend) / berekend).toBeLessThan(0.15);
  });
});

describe('de omvormer uit zijn type', () => {
  it('leest de gangbare merken', () => {
    expect(omvormerUitType('SE3000H-RW000BNN4')).toBe(3000);
    expect(omvormerUitType('SE5K-RWS48BEN4')).toBe(5000);
    expect(omvormerUitType('MIN 3600TL-XH')).toBe(3600);
    expect(omvormerUitType('SUN2000-5KTL-L1')).toBe(5000);
    expect(omvormerUitType('SB3.0-1AV-41')).toBe(3000);
    expect(omvormerUitType('Primo 4.0-1')).toBe(4000);
    expect(omvormerUitType('GW5000D-NS')).toBe(5000);
  });
  it('raadt niet bij iets anders', () => {
    expect(omvormerUitType('TRVZB')).toBeNull();
    expect(omvormerUitType('Aubess Smart Switch 1-gang')).toBeNull();
    expect(omvormerUitType(null)).toBeNull();
  });
});

describe('de voorkant en een schatting', () => {
  const ew = [
    { azimuthDeg: 92, tiltDeg: 50, peakW: 2500, kant: null },
    { azimuthDeg: 272, tiltDeg: 50, peakW: 2500, kant: null },
  ] as const;
  it('kiest bij beide kanten het vlak waar de zon op de voorkant schijnt', () => {
    expect(voorgevelVan(ew, beide(), 'ochtend')).toBe(92);
    expect(voorgevelVan(ew, beide(), 'avond')).toBe(272);
    expect(voorgevelVan(ew, beide(), 'weetniet')).toBeNull();
    // Middag ligt bij geen van beide: dan het antwoord zelf.
    expect(voorgevelVan(ew, beide(), 'middag')).toBe(180);
  });
  it('volgt uit een vlak aan een bekende kant', () => {
    expect(voorgevelVan([{ azimuthDeg: 200, tiltDeg: 30, peakW: 3000, kant: 'achterkant' }], { ligging: 'achterkant', aantal: 8, voorkant: null, achterkant: null }, null)).toBe(20);
  });
  it('schat uit de kant, het aantal en de voorkant', () => {
    const s = schatLigging(beide(), 'ochtend')!;
    expect(s.voorgevelDeg).toBe(90);
    expect(s.vlakken.map((v) => [v.azimuthDeg, v.tiltDeg, v.peakW])).toEqual([
      [90, 40, 2400],
      [270, 40, 2400],
    ]);
    expect(schatLigging({ ligging: 'voorkant', aantal: 10, voorkant: null, achterkant: null }, null)!.vlakken[0]!.azimuthDeg).toBe(180);
    expect(schatLigging({ ligging: 'voorkant', aantal: null, voorkant: null, achterkant: null }, 'ochtend')).toBeNull();
    expect(schatLigging({ ligging: 'geen', aantal: 4, voorkant: null, achterkant: null }, 'ochtend')).toBeNull();
  });
});

describe('welke ligging geldt', () => {
  const meting: Meting = {
    vlakken: [
      { azimuthDeg: 92, tiltDeg: 52, peakW: 2500, kant: null },
      { azimuthDeg: 272, tiltDeg: 52, peakW: 2500, kant: null },
    ],
    peakW: 5000,
    fout: 0.09,
    dag: { datum: '2026-10-12', kWh: 10.7, punten: [[12, 1245, 1308]] },
  };
  const config: Geometry = { facades: [], solarPlanes: [{ id: 'dak', azimuthDeg: 180, tiltDeg: 35, peakW: 3000, source: 'schatting' }] };
  const basis = { configuratie: undefined, dak: null, meting: null, panelen: beide(), voorkantZon: 'ochtend' as const, omvormerGevonden: 3000 };

  it('van een nieuw huis: de schatting, dan de meting', () => {
    const s = kiesLigging(basis)!;
    expect(s.bron).toBe('schatting');
    expect(s.geometry.inverterMaxW).toBe(3000);
    expect(s.geometry.facades.map((f) => [f.id, f.azimuthDeg])).toEqual([
      ['voorgevel', 90],
      ['achtergevel', 270],
    ]);
    const m = kiesLigging({ ...basis, meting })!;
    expect(m.bron).toBe('gemeten');
    expect(m.geometry.solarPlanes.map((p) => [p.id, p.azimuthDeg, p.source])).toEqual([
      ['dak-oost', 92, 'gemeten'],
      ['dak-west', 272, 'gemeten'],
    ]);
    expect(m.geometry.facades[0]!.azimuthDeg).toBe(92);
  });

  it('de configuratie gaat voor de meting, wat de bewoner bevestigde gaat voor alles', () => {
    expect(kiesLigging({ ...basis, meting, configuratie: config })!.geometry).toBe(config);
    const dak = dakUitMeting(meting, beide(), 'ochtend', 3000);
    const g = kiesLigging({ ...basis, meting, configuratie: config, dak })!;
    expect(g.bron).toBe('app');
    expect(g.geometry.solarPlanes.map((p) => p.azimuthDeg)).toEqual([92, 272]);
  });

  it('zonder panelen geen ligging', () => {
    expect(kiesLigging({ ...basis, panelen: { ligging: 'geen', aantal: null, voorkant: null, achterkant: null } })).toBeNull();
  });

  it('aanpassen: de vlakken volgen uit de kant en het aantal per kant', () => {
    const dak = dakUitAanpassing({ voorgevelDeg: 97, hellingDeg: 47, wpPerPaneel: 390, omvormerW: 3000 }, beide(), meting);
    expect(dak).toEqual({
      voorgevelDeg: 97,
      vlakken: [
        { azimuthDeg: 97, tiltDeg: 47, peakW: 2340 },
        { azimuthDeg: 277, tiltDeg: 47, peakW: 2340 },
      ],
      omvormerW: 3000,
      bron: 'bewoner',
      kant: 'beide',
      aantal: 12,
    });
    expect(dakUitAanpassing({ voorgevelDeg: 90, hellingDeg: 40, wpPerPaneel: 400, omvormerW: null }, { ligging: 'voorkant', aantal: null, voorkant: null, achterkant: null }, null)).toEqual({ fout: 'vul eerst het aantal panelen in' });
  });

  it('de pagina krijgt de ligging in woorden, met de dag erbij', () => {
    const v = liggingView({ ...basis, meting });
    expect(v.stand).toBe('voorstel');
    expect(v.voorstel).toMatchObject({ richting: 'Oost en west', hellingDeg: 52, helling: 'Rond 50°, een steil dak', vermogen: "Samen zo'n 5 kWp", wpPerPaneel: 415, perPaneel: 'ongeveer 415 Wp per paneel', omvormerW: 3000, voorgevelDeg: 92 });
    expect(v.lijn).toMatchObject({ datum: '2026-10-12', datumTekst: '12 oktober', kWh: 10.7 });
    expect(v.kanten).toBe('6 panelen op elke kant');
    expect(v.aantal).toBe(12);
    // Oost en west: de voorkant krijgt ochtend- of avondzon.
    expect(v.vraagVoorkant).toEqual(['ochtend', 'avond', 'weetniet']);
    expect(liggingView({ ...basis }).vraagVoorkant).toEqual(['ochtend', 'middag', 'avond', 'weetniet']);
    const bevestigd = liggingView({ ...basis, meting, dak: dakUitAanpassing({ voorgevelDeg: 97, hellingDeg: 47, wpPerPaneel: 390, omvormerW: 3000 }, beide(), meting) as never });
    expect(bevestigd.stand).toBe('bevestigd');
    expect(bevestigd.nu).toMatchObject({ vermogen: 'Samen 4,68 kWp', perPaneel: '390 Wp per paneel', bron: 'app' });
    expect(liggingView({ ...basis, voorkantZon: null, panelen: { ligging: 'voorkant', aantal: 10, voorkant: null, achterkant: null } }).nu?.richting).toBe('Op het zuiden');
  });

  it('zegt de ligging in de taal van de app (besluit 185)', () => {
    const v = liggingView({ ...basis, meting }, 'en');
    expect(v.voorstel).toMatchObject({ richting: 'East and west', helling: 'Around 50°, a steep roof', vermogen: 'about 5 kWp in total', vermogenKort: 'about 5 kWp', perPaneel: 'about 415 Wp per panel' });
    expect([v.lijn?.datumTekst, v.kanten]).toEqual(['12 October', '6 panels on each side']);
    const bevestigd = liggingView({ ...basis, meting, dak: dakUitAanpassing({ voorgevelDeg: 97, hellingDeg: 47, wpPerPaneel: 390, omvormerW: 3000 }, beide(), meting) as never }, 'en');
    expect(bevestigd.nu).toMatchObject({ vermogen: '4.68 kWp in total', vermogenKort: '4.68 kWp', perPaneel: '390 Wp per panel' });
    expect(liggingView({ ...basis, voorkantZon: null, panelen: { ligging: 'voorkant', aantal: 10, voorkant: null, achterkant: null } }, 'en').nu?.richting).toBe('Facing south');
    // Het Nederlands heeft ook een korte vorm, zonder "samen".
    expect(liggingView({ ...basis, meting }).voorstel?.vermogenKort).toBe("zo'n 5 kWp");
  });

  it('bewaren: klopt, aangepast, terug van de pagina, en vervallen bij een andere kant', () => {
    const found = { fasen: [], apparaten: [], meting, omvormerGevonden: 3000 };
    const panelen = { ligging: 'beide', voorkant: 6, achterkant: 6 };
    const klopt = validateConnection({ panelen, voorkantZon: 'ochtend', dak: 'voorstel' }, found);
    if (!klopt.ok) throw new Error(klopt.reden);
    expect(klopt.answers.dak).toMatchObject({ voorgevelDeg: 92, bron: 'gemeten', omvormerW: 3000 });
    // Wat de pagina terugstuurt, blijft staan.
    const terug = validateConnection({ panelen, voorkantZon: 'ochtend', dak: klopt.answers.dak }, { fasen: [], apparaten: [] });
    expect(terug.ok && terug.answers.dak).toEqual(klopt.answers.dak);
    // Een andere kant van het dak, of een ander aantal: het oude dak vervalt.
    const anders = validateConnection({ panelen: { ligging: 'voorkant', aantal: 12 }, dak: klopt.answers.dak }, { fasen: [], apparaten: [] });
    expect(anders.ok && anders.answers.dak).toBeNull();
    const meer = validateConnection({ panelen: { ligging: 'beide', voorkant: 7, achterkant: 6 }, dak: klopt.answers.dak }, { fasen: [], apparaten: [] });
    expect(meer.ok && meer.answers.dak).toBeNull();
    const aangepast = validateConnection({ panelen, dak: { aanpassen: { voorgevelDeg: 97, hellingDeg: 47, wpPerPaneel: 390, omvormerW: 3000 } } }, found);
    expect(aangepast.ok && aangepast.answers.dak?.bron).toBe('bewoner');
    expect(validateConnection({ panelen, dak: 'voorstel' }, { fasen: [], apparaten: [] })).toEqual({ ok: false, reden: 'er is nog geen meting om te bevestigen' });
    expect(validateConnection({ panelen, voorkantZon: 'nacht' }, found)).toEqual({ ok: false, reden: 'onbekend antwoord bij de voorkant' });
    expect(validateConnection({ panelen, dak: { aanpassen: { voorgevelDeg: 400, hellingDeg: 47, wpPerPaneel: 390 } } }, found).ok).toBe(false);
  });
});

describe('de melding', () => {
  const bron = (o: Partial<MeldingenBron>): MeldingenBron => ({ nu: Date.UTC(2026, 9, 17, 12), zonderRuimte: [], volgen: [], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null, ...o });
  it('meldt een meting die op de bewoner wacht, en lost op na bevestigen', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'hems-ligging-'));
    try {
      const s = new MeldingenStore({ logDir: dir });
      s.bij(bron({ panelen: { voorstel: true } }));
      expect(s.lijst(Date.UTC(2026, 9, 17, 14)).actief.map((m) => [m.id, m.actie?.href])).toEqual([['panelen:voorstel', 'energie.html#panelen']]);
      s.bij(bron({ nu: Date.UTC(2026, 9, 17, 13), panelen: { voorstel: false } }));
      expect(s.lijst(Date.UTC(2026, 9, 17, 14)).actief).toEqual([]);
      expect(s.lijst(Date.UTC(2026, 9, 17, 14)).eerder[0]?.titel).toBe('Je panelen staan erin');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
