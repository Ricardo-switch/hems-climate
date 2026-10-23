/**
 * De configuratie met alles wat de app erover legt, los uit main.ts
 * (23 oktober 2026): zonder iets uit de app blijft hij zoals het bestand zegt.
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { defaultStrategies } from '../src/index.js';
import { GEEN_BEWONERS } from '../src/web/bewoners.js';
import { configUitDeApp, type UitDeApp } from '../src/web/config-uit-app.js';
import { exampleSite, exampleSitePath } from './site.js';

const invoer = (o: Partial<UitDeApp> = {}): UitDeApp => ({
  aansluiting: null,
  aansluitingToegevoegd: { toegevoegd: [] },
  layout: null,
  state: () => undefined,
  vermogenSensor: () => null,
  comfort: null,
  bewoners: GEEN_BEWONERS,
  occupancy: exampleSite.occupancy,
  strategieen: defaultStrategies().ids,
  ...o,
});

describe('de configuratie uit de app (config-uit-app.ts)', () => {
  it('laat de configuratie zoals het bestand zegt als de app er niets over legt', async () => {
    const base = JSON.parse(await readFile(exampleSitePath, 'utf-8')) as Record<string, unknown>;
    const uit = configUitDeApp(base, invoer());
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.config.zones.map((z) => z.id)).toEqual(exampleSite.zones.map((z) => z.id));
    expect(uit.toegevoegd).toEqual([]);
  });

  it('zegt waarom als het resultaat geen geldige configuratie is', () => {
    const uit = configUitDeApp({ id: 'leeg' }, invoer());
    expect(uit.ok).toBe(false);
  });
});
