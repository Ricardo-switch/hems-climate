/**
 * De integratie heeft een eigen versie (besluit 184): los van de app, zodat een
 * update van de app in Home Assistant geen herstart vraagt. Die versie gaat
 * alleen omhoog als de code van de integratie verandert; dan pas zien HACS en
 * de knop in de app een nieuwe versie. Deze test bewaakt dat: verandert er iets
 * in custom_components/smart_climate zonder nieuwe versie, dan faalt hij.
 *
 * Na een wijziging aan de integratie: verhoog `version` in manifest.json, zet
 * hieronder de nieuwe versie en de vingerafdruk die de test noemt, en maak na
 * het samenvoegen een GitHub-release met die versie (voor HACS).
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const VINGER = { versie: '1.2.0', afdruk: '98d32af772b5d833' };

const MAP = fileURLToPath(new URL('../../custom_components/smart_climate/', import.meta.url));

async function bestanden(map: string, pad = ''): Promise<string[]> {
  const uit: string[] = [];
  for (const d of await readdir(join(map, pad), { withFileTypes: true })) {
    if (d.name === '__pycache__') continue;
    const rel = pad ? `${pad}/${d.name}` : d.name;
    if (d.isDirectory()) uit.push(...(await bestanden(map, rel)));
    else uit.push(rel);
  }
  return uit.sort();
}

describe('de versie van de integratie (besluit 184)', () => {
  it('gaat omhoog als de integratie verandert, en alleen dan', async () => {
    const hash = createHash('sha256');
    let versie = '';
    for (const rel of await bestanden(MAP)) {
      let inhoud = (await readFile(join(MAP, rel), 'utf-8')).replace(/\r\n/g, '\n');
      if (rel === 'manifest.json') {
        versie = (JSON.parse(inhoud) as { version: string }).version;
        // De versie zelf telt niet mee in de afdruk.
        inhoud = inhoud.replace(/"version": "[^"]*"/, '"version": ""');
      }
      hash.update(`${rel}\n${inhoud}\n`);
    }
    const afdruk = hash.digest('hex').slice(0, 16);
    expect(versie, 'zet de versie uit manifest.json in VINGER').toBe(VINGER.versie);
    expect(afdruk, `de integratie veranderde: verhoog de versie in manifest.json, en zet hier versie en afdruk ${afdruk}`).toBe(VINGER.afdruk);
  });
});
