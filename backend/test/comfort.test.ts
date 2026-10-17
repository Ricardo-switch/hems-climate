/**
 * Comfort uit de app (besluit 130): controleren, over de configuratie leggen,
 * en wat de app ervan ziet.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { COMFORT_FILE, ComfortStore, comfortView, controleerComfort, withComfort, type Comfort } from '../src/web/comfort.js';
import { exampleSite, exampleSitePath } from './site.js';

const raw = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
const zone = exampleSite.zones[0]!;

describe('comfort uit de app (besluit 130)', () => {
  it('toont per kamer de dagdelen, het plafond en de voorrang zoals ze nu gelden', () => {
    const v = comfortView(exampleSite, null);
    expect(v.kamers.map((k) => k.id)).toEqual(exampleSite.zones.map((z) => z.id));
    const k = v.kamers[0]!;
    expect(k.modi.dag).toEqual({ heat: zone.setpoints.dag.heat ?? null, cool: zone.setpoints.dag.cool ?? null });
    expect(k.uitApp).toBe(false);
    expect(v.dagdelen).toEqual({ voorverwarmen: exampleSite.schedule.preheatFromHour, dag: exampleSite.schedule.dayFromHour, nacht: exampleSite.schedule.nightFromHour });
  });

  it('neemt alleen kamers en waarden aan die de regeling aankan', () => {
    const goed = { kamers: { [zone.id]: { modi: { dag: { heat: 20.5, cool: 23 }, nacht: { heat: 17, cool: null } }, nooitWarmerC: 27, voorrang: 1 } }, dagdelen: { voorverwarmen: 6, dag: 7, nacht: 23 } };
    const c = controleerComfort(goed, exampleSite);
    expect(c.ok).toBe(true);
    for (const fout of [
      null,
      { kamers: { kelder: { modi: {} } } },
      { kamers: { [zone.id]: { modi: { dag: { heat: 20.3, cool: null } } } } },
      { kamers: { [zone.id]: { modi: { dag: { heat: 22, cool: 22.5 } } } } },
      { kamers: { [zone.id]: { modi: { ochtend: { heat: 20 } } } } },
      { kamers: { [zone.id]: { modi: {}, voorrang: 4 } } },
      { kamers: {}, dagdelen: { voorverwarmen: 8, dag: 7, nacht: 23 } },
    ]) {
      expect(controleerComfort(fout, exampleSite).ok, JSON.stringify(fout)).toBe(false);
    }
  });

  it('legt comfort over de configuratie, en dat komt door het schema', () => {
    const c = controleerComfort({ kamers: { [zone.id]: { modi: { dag: { heat: 20.5, cool: 23 }, nacht: { heat: 17, cool: null } }, nooitWarmerC: null, voorrang: 2 } }, dagdelen: { voorverwarmen: 6, dag: 7, nacht: 23 } }, exampleSite);
    if (!c.ok) throw new Error(c.reden);
    const met = withComfort(raw, c.comfort);
    expect(met.toegevoegd).toContain('de dagdelen');
    const checked = parseSiteConfig(met.raw, { knownStrategies: defaultStrategies().ids });
    if (!checked.ok) throw new Error(JSON.stringify(checked.problems[0]));
    const z = checked.config.zones.find((x) => x.id === zone.id)!;
    expect(z.setpoints.dag).toMatchObject({ heat: 20.5, cool: 23 });
    // Voorverwarmen volgt de dag.
    expect(z.setpoints.voorverwarmen.heat).toBe(20.5);
    expect(z.setpoints.nacht.cool).toBeUndefined();
    expect(z.comfortMaxC).toBeUndefined();
    expect(z.priority).toBe(2);
    expect(checked.config.schedule).toMatchObject({ preheatFromHour: 6, dayFromHour: 7, nightFromHour: 23 });
    // Andere kamers blijven zoals het bestand zegt.
    const ander = exampleSite.zones[1]!;
    expect(checked.config.zones.find((x) => x.id === ander.id)!.setpoints).toEqual(ander.setpoints);
    expect(comfortView(checked.config, c.comfort).kamers[0]!.uitApp).toBe(true);
  });

  it('gaat voor de helpers van het oude systeem, alleen voor de kamers uit de app (besluit 143)', () => {
    const helpers = { [zone.id]: { dag: { heat: 'input_number.oud' } }, ander: { dag: { heat: 'input_number.ander' } } };
    const metHelpers = { ...raw, migration: { ...((raw['migration'] as Record<string, unknown>) ?? {}), setpoints: helpers } };
    const c = controleerComfort({ kamers: { [zone.id]: { modi: { dag: { heat: 18, cool: 22.5 } } } } }, exampleSite);
    if (!c.ok) throw new Error(c.reden);
    const met = withComfort(metHelpers, c.comfort);
    expect((met.raw['migration'] as { setpoints: Record<string, unknown> }).setpoints).toEqual({ ander: helpers.ander });
    expect(met.toegevoegd).toContain('comfort uit de app gaat voor de helpers van het oude systeem');
    // Zonder comfort voor die kamer blijven de helpers.
    expect(withComfort(metHelpers, { versie: 1, kamers: {} }).raw['migration']).toEqual(metHelpers.migration);
  });

  describe('bewaren', () => {
    let dir: string | null = null;
    afterEach(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
      dir = null;
    });

    it('bewaart in een eigen bestand naast de dataset, en leest het terug', async () => {
      dir = await mkdtemp(join(tmpdir(), 'comfort-'));
      const store = new ComfortStore(dir);
      expect(await store.load()).toBeNull();
      const c: Comfort = { versie: 1, kamers: { [zone.id]: { modi: { dag: { heat: 19, cool: null } } } } };
      await store.save(c);
      expect(JSON.parse(await readFile(join(dir, COMFORT_FILE), 'utf-8'))).toEqual(c);
      expect(await new ComfortStore(dir).load()).toEqual(c);
    });
  });
});

/* Zon en net, en wanneer het aan- en uitgaat (besluit 133). */
describe('op zon, en wanneer het aan- en uitgaat', () => {
  const raw = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
  const opties = { knownStrategies: defaultStrategies().ids };

  it('neemt op zon als buffer van de zone, ook uit', () => {
    for (const [v, aan] of [[2, true], [0, false]] as const) {
      const c = controleerComfort({ kamers: { woonkamer: { modi: {}, opZonC: v } } }, exampleSite);
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const parsed = parseSiteConfig(withComfort(raw, c.comfort).raw, opties);
      expect(parsed.ok && parsed.config.zones.find((z) => z.id === 'woonkamer')?.buffering).toMatchObject({ enabled: aan, bandC: v });
    }
    expect(controleerComfort({ kamers: { woonkamer: { modi: {}, opZonC: 3 } } }, exampleSite).ok).toBe(false);
  });

  it('zegt per kamer wanneer het aan- en uitgaat, en wat er op zon kan', () => {
    const v = comfortView(exampleSite, null).kamers.find((k) => k.id === 'woonkamer')!;
    const z = exampleSite.zones.find((x) => x.id === 'woonkamer')!;
    expect(v.hysterese).toEqual({ aan: z.hysteresis.onDelta, uit: z.hysteresis.offDelta });
    expect(v.opZonC).toBe(z.buffering.enabled ? z.buffering.bandC : 0);
    // De woonkamer heeft een airco die op zon koelt en verwarmt, en een cv die niet koelt.
    expect(v.opZon).toEqual({ verwarmen: true, koelen: true });
    expect(v.koeltVanNet).toBe(false);
  });
});

/* Voorrang per richting (besluit 134). */
describe('voorrang bij koelen en bij verwarmen', () => {
  const raw = JSON.parse(readFileSync(exampleSitePath, 'utf-8')) as Record<string, unknown>;
  const opties = { knownStrategies: defaultStrategies().ids };

  it('geeft per richting alleen de kamers die het kunnen, op volgorde', () => {
    const v = comfortView(exampleSite, null).voorrang;
    expect(v.koelen).toEqual(['woonkamer', 'zolder']);
    expect(v.verwarmen).toEqual(['woonkamer', 'badkamer', 'zolder']);
  });

  it('maakt van de plek in de lijst de voorrang', () => {
    const c = controleerComfort({ kamers: {}, voorrang: { koelen: ['zolder', 'woonkamer'], verwarmen: ['woonkamer', 'badkamer', 'zolder'] } }, exampleSite);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const parsed = parseSiteConfig(withComfort(raw, c.comfort).raw, opties);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.config.zones.find((z) => z.id === 'zolder')?.priorityByAction).toEqual({ heat: 3, cool: 1 });
    expect(comfortView(parsed.config, c.comfort).voorrang.koelen).toEqual(['zolder', 'woonkamer']);
  });

  it('weigert een onbekende of dubbele kamer', () => {
    expect(controleerComfort({ kamers: {}, voorrang: { koelen: ['kelder'], verwarmen: [] } }, exampleSite).ok).toBe(false);
    expect(controleerComfort({ kamers: {}, voorrang: { koelen: ['zolder', 'zolder'], verwarmen: [] } }, exampleSite).ok).toBe(false);
  });
});
