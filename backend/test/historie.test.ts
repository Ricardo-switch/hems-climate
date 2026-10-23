/**
 * Vandaag uit de statistiek van Home Assistant (17 oktober 2026), los uit
 * main.ts (23 oktober 2026): wat het vraagt, en wat het bewaart.
 */

import { describe, expect, it } from 'vitest';

import { Historie } from '../src/web/historie.js';
import { exampleSite } from './site.js';

describe('de historie uit de statistiek (historie.ts)', () => {
  it('vraagt de zon en het net per vijf minuten, en bewaart een afgesloten dag', async () => {
    const vragen: Record<string, unknown>[] = [];
    let nu = Date.UTC(2026, 9, 23, 12);
    const zon = exampleSite.solarProduction!.id;
    const h = new Historie({
      config: () => exampleSite,
      vraag: async (_type, velden) => {
        vragen.push(velden);
        return { [zon]: [{ start: Date.UTC(2026, 9, 22, 10), mean: 1200 }, { start: '2026-10-22T10:05:00Z', mean: null }] };
      },
      nu: () => nu,
    });
    const gisteren = await h.van(Date.UTC(2026, 9, 22), Date.UTC(2026, 9, 23));
    expect(gisteren?.zon).toEqual([{ startMs: Date.UTC(2026, 9, 22, 10), meanW: 1200 }]);
    expect(vragen[0]).toMatchObject({ period: '5minute', types: ['mean'] });
    // Een afgesloten dag verandert niet meer: niet opnieuw vragen, ook later niet.
    nu += 3_600_000;
    await h.van(Date.UTC(2026, 9, 22), Date.UTC(2026, 9, 23));
    expect(vragen).toHaveLength(1);
    // Zonder configuratie niets.
    expect(await new Historie({ config: () => null, vraag: async () => null }).van(0, 1)).toBeNull();
  });
});
