/**
 * Welke versie wanneer besliste (besluit 66).
 */

import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { RUNS_FILE, configFingerprint, readRuns, recordRun } from '../src/adapters/runs.js';
import { DivergenceCache } from '../src/web/divergence.js';
import { runsFromDeployLog } from '../tools/runs-from-deploy-log.js';
import { exampleSite } from './site.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'hems-runs-'));
  dirs.push(d);
  return d;
}

describe('welke versie wanneer besliste (besluit 66)', () => {
  it('geeft dezelfde configuratie dezelfde vingerafdruk, en een andere een andere', () => {
    const same = configFingerprint(structuredClone(exampleSite));
    expect(configFingerprint(exampleSite)).toBe(same);
    expect(same).toMatch(/^[0-9a-f]{12}$/);

    const other = { ...exampleSite, power: { ...exampleSite.power, startSurplusW: 1234 } };
    expect(configFingerprint(other)).not.toBe(same);
  });

  it('leest terug wat er is vastgelegd, oudste eerst, en slaat kapotte regels over', async () => {
    const dir = await freshDir();
    await recordRun(dir, { t: 2, commit: 'bbbbbbb', built: null, config: 'c2', site: 'huis' });
    await recordRun(dir, { t: 1, commit: 'aaaaaaa', built: null, config: 'c1', site: 'huis' });
    await appendFile(join(dir, RUNS_FILE), '{"t":3,"comm', 'utf-8');

    const runs = await readRuns(dir);
    expect(runs.map((r) => r.commit)).toEqual(['aaaaaaa', 'bbbbbbb']);
  });

  it('reconstrueert starts uit het uitroljournaal, en zegt dat erbij', () => {
    const log = [
      '2026-10-01 08:21:56  Container omwisselen…',
      '2026-10-01 08:24:41  Klaar op b6619bb1 — container running, gezondheid healthy',
      '2026-10-01 08:35:04  Wijzigingen raken de draaiende dienst niet. Klaar.',
    ].join('\n');
    expect(runsFromDeployLog(log, 'huis')).toEqual([
      {
        t: new Date('2026-10-01T08:24:41').getTime(),
        commit: 'b6619bb',
        built: null,
        config: 'onbekend',
        site: 'huis',
        source: 'deploy.log',
      },
    ]);
  });

  it('kent geen bestand als een lege lijst', async () => {
    expect(await readRuns(await freshDir())).toEqual([]);
  });

  it('geeft de versies mee aan de terugblik', async () => {
    const dir = await freshDir();
    const t = Date.UTC(2026, 9, 1, 8, 0, 0);
    await writeFile(
      join(dir, 'decisions-2026-10-01.ndjson'),
      `${JSON.stringify({ t, changed: true, mode: 'dag', obs: { 'ac-zolder': 'off' } })}\n`,
      'utf-8',
    );
    await recordRun(dir, { t, commit: '139b209', built: null, config: 'abc', site: 'huis' });

    const report = await new DivergenceCache({ logDir: dir, write: () => {}, now: () => t }).refresh();
    expect(report?.versies).toEqual([{ tMs: t, commit: '139b209', config: 'abc' }]);
  });
});
