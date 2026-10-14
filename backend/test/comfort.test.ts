/**
 * Comfort uit de app (besluit 130): controleren, over de configuratie leggen,
 * en wat de app ervan ziet.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveConfigPathSync } from '../src/config/load.js';
import { parseSiteConfig } from '../src/config/schema.js';
import { defaultStrategies } from '../src/index.js';
import { COMFORT_FILE, ComfortStore, comfortView, controleerComfort, withComfort, type Comfort } from '../src/web/comfort.js';
import { exampleSite } from './site.js';

const raw = JSON.parse(readFileSync(resolveConfigPathSync(), 'utf-8')) as Record<string, unknown>;
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
