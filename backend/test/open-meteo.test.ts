import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { kindOfCode, OpenMeteo, openMeteoUrl, parseOpenMeteo, UREN_FILE, UREN_VOORUIT } from '../src/web/open-meteo.js';

const H = 3_600_000;
/** Middernacht in UTC, en een antwoord zoals Open-Meteo het geeft: drie dagen per uur, zes dagen per dag. */
const T0 = Date.UTC(2026, 9, 14);
function antwoord() {
  const uren = Array.from({ length: 72 }, (_, i) => i);
  return {
    current: { weather_code: 3, cloud_cover: 90 },
    hourly: {
      time: uren.map((i) => (T0 + i * H) / 1000),
      temperature_2m: uren.map((i) => 10 + (i % 24) / 2),
      relative_humidity_2m: uren.map(() => 80),
      cloud_cover: uren.map(() => 50),
      shortwave_radiation: uren.map((i) => (i % 24 >= 8 && i % 24 <= 16 ? 300 : 0)),
      direct_radiation: uren.map(() => 100),
      diffuse_radiation: uren.map(() => 50),
      wind_speed_10m: uren.map(() => 3.2),
      precipitation_probability: uren.map(() => 10),
    },
    daily: {
      weather_code: [3, 0, 2, 61, 81, 95],
      temperature_2m_max: [14, 18, 17, 12, 13, 15],
      temperature_2m_min: [8, 9, 10, 7, 6, 8],
      precipitation_probability_max: [20, 0, 10, 80, 55, 60],
      sunshine_duration: [3600, 36000, 18000, 0, 30000, 7200],
      daylight_duration: [40000, 40000, 40000, 40000, 40000, 40000],
    },
  };
}

describe('Open-Meteo (besluit 127)', () => {
  it('vraagt het weer met de ligging op één decimaal', () => {
    const url = new URL(openMeteoUrl({ latDeg: 51.94321, lonDeg: 5.87654 }, 'Europe/Amsterdam'));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('51.9');
    expect(url.searchParams.get('longitude')).toBe('5.9');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('hourly')).toContain('temperature_2m');
    expect(url.toString()).not.toContain('51.94');
  });

  it('geeft de uren vanaf nu en de dagen vanaf morgen', () => {
    const weer = parseOpenMeteo(antwoord(), T0 + 10 * H + 20 * 60_000)!;
    expect(weer.uren.vanMs).toBe(T0 + 10 * H);
    expect(weer.uren.buitenC).toHaveLength(UREN_VOORUIT);
    expect(weer.uren.buitenC.slice(0, 3)).toEqual([15, 15.5, 16]);
    expect(weer.uren.windMs[0]).toBe(3.2);
    expect(weer.dagen.map((d) => [d.offset, d.soort, d.zonkansPct, d.maxC])).toEqual([
      [0, 'bewolkt', 10, null],
      [1, 'zon', 90, 18],
      [2, 'half', 45, 17],
      [3, 'regen', 0, 12],
      // Buien met veel zon: zon en wolken, met de kans op een bui.
      [4, 'half', 75, 13],
      [5, 'onweer', 18, 15],
    ]);
    expect(weer.dagen[4]!.tekst).toBe('Zon en wolken, kans op een bui');
    expect(parseOpenMeteo({ foutje: true }, T0)).toBeNull();
  });

  it('kent de weercodes', () => {
    expect([0, 2, 3, 45, 53, 73, 96].map((c) => kindOfCode(c, 80))).toEqual(['zon', 'half', 'bewolkt', 'mist', 'regen', 'sneeuw', 'onweer']);
    expect(kindOfCode(null, null)).toBeNull();
  });

  describe('ophalen en bewaren', () => {
    let dir: string | null = null;
    afterEach(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
      dir = null;
    });

    it('bewaart elk uur één regel, en vraagt niet vaker dan nodig', async () => {
      dir = await mkdtemp(join(tmpdir(), 'meteo-'));
      let now = T0 + 9 * H;
      const vragen: string[] = [];
      const fake = (async (url: string) => {
        vragen.push(url);
        return new Response(JSON.stringify(antwoord()), { status: 200 });
      }) as unknown as typeof fetch;
      const m = new OpenMeteo({ location: () => ({ latDeg: 52, lonDeg: 5.9 }), timeZone: 'Europe/Amsterdam', logDir: dir, fetch: fake, now: () => now });
      await m.refresh(true);
      await m.refresh(true);
      expect(vragen).toHaveLength(1);
      expect(m.latest?.dagen[1]?.soort).toBe('zon');
      now += H;
      await m.refresh(true);
      const regels = (await readFile(join(dir, UREN_FILE), 'utf-8')).trim().split('\n').map((r) => JSON.parse(r) as { vanMs: number; buitenC: number[] });
      expect(regels.map((r) => r.vanMs)).toEqual([T0 + 9 * H, T0 + 10 * H]);
      // Uit bij Functies: wel het weer, niets bewaard.
      now += H;
      await m.refresh(false);
      expect((await readFile(join(dir, UREN_FILE), 'utf-8')).trim().split('\n')).toHaveLength(2);
    });

    it('vraagt niets zonder ligging, en zet de ligging nooit in een fout', async () => {
      let gevraagd = 0;
      const zonder = new OpenMeteo({ location: () => null, timeZone: 'UTC', logDir: null, fetch: (async () => (gevraagd++, new Response('{}'))) as unknown as typeof fetch });
      await zonder.refresh(true);
      expect(gevraagd).toBe(0);
      const fout = new OpenMeteo({ location: () => ({ latDeg: 51.9, lonDeg: 5.9 }), timeZone: 'UTC', logDir: null, fetch: (async () => new Response('nee', { status: 503 })) as unknown as typeof fetch });
      const e = await fout.refresh(true).then(() => null, (x: Error) => x);
      expect(e?.message).toBe('Open-Meteo gaf 503');
      expect(e?.message).not.toContain('51.9');
    });
  });
});
