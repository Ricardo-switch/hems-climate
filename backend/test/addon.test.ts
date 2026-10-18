/*
 * De add-on bouwt dezelfde code als de NAS (besluit 153).
 *
 * Er zijn twee Dockerfiles: `backend/Dockerfile` voor de NAS en
 * `addon/Dockerfile` voor Home Assistant, met `addon/stage.ps1` dat de boom
 * platslaat. Op 17 oktober 2026 bleek de add-on de tekenmotor (`frontend/kit`)
 * te missen, maanden nadat de NAS hem kreeg: niets merkte het, want de add-on
 * werd niet gebouwd. Dit houdt de drie gelijk.
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const lees = (pad: string) => readFile(new URL(pad, import.meta.url), 'utf-8');

/** De mappen en bestanden uit `frontend/` en `backend/` die een Dockerfile kopieert. */
function bronnen(dockerfile: string): string[] {
  return [...dockerfile.matchAll(/^COPY (?!--from)(.+) \S+$/gm)]
    .flatMap((m) => m[1]!.split(/\s+/))
    .filter((b) => b.startsWith('frontend/') || b.startsWith('backend/'))
    .sort();
}

describe('de add-on en de NAS', () => {
  it('kopiëren dezelfde bronnen', async () => {
    const nas = bronnen(await lees('../Dockerfile'));
    expect(nas).toContain('frontend/kit');
    expect(bronnen(await lees('../../addon/Dockerfile'))).toEqual(nas);
  });

  it('en stage.ps1 zet ze allemaal klaar', async () => {
    const stage = await lees('../../addon/stage.ps1');
    for (const b of bronnen(await lees('../../addon/Dockerfile'))) expect(stage).toContain(`Van = '${b}'`);
  });

  it('bouwen op GitHub voor dezelfde soorten als het manifest noemt', async () => {
    const manifest = await lees('../../addon/config.yaml');
    const soorten = [...manifest.slice(manifest.indexOf('\narch:')).matchAll(/^ {2}- (\w+)$/gm)].map((m) => m[1]).sort();
    const basis = [...(await lees('../../addon/build.yaml')).matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]).sort();
    const workflow = [...(await lees('../../.github/workflows/addon.yml')).matchAll(/- arch: (\w+)$/gm)].map((m) => m[1]).sort();
    expect(soorten).toEqual(['aarch64', 'amd64']);
    expect(basis).toEqual(soorten);
    expect(workflow).toEqual(soorten);
  });

  it('zet het paneel voor iedereen met een account in de zijbalk (besluit 161)', async () => {
    const manifest = await lees('../../addon/config.yaml');
    expect(manifest).toMatch(/^panel_admin: false$/m);
  });
});
