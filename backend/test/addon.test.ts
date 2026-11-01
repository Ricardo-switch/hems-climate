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

  it('zet het wekwoord "Hé huis" klaar voor openWakeWord, zonder een eigen te overschrijven (besluit 177)', async () => {
    const { stat } = await import('node:fs/promises');
    expect((await stat(new URL('../../addon/wekwoord/he_huis.tflite', import.meta.url))).size).toBeGreaterThan(100_000);
    expect(await lees('../../addon/stage.ps1')).toContain("Van = 'addon/wekwoord'");
    expect(await lees('../../addon/Dockerfile')).toMatch(/^COPY wekwoord \/app\/wekwoord$/m);
    const run = await lees('../../addon/run.sh');
    expect(run).toContain('WEKWOORD_DIR=/share/openwakeword');
    expect(run).toContain('if [ ! -e "${WEKWOORD_DIR}/${naam}" ]; then');
  });

  it('bouwen op GitHub voor dezelfde soorten als het manifest noemt', async () => {
    const manifest = await lees('../../addon/config.yaml');
    // Alleen het blok van arch, tot de eerste lege regel: daarna komen andere lijsten, zoals discovery.
    const blok = manifest.slice(manifest.indexOf('\narch:')).split('\n\n')[0]!;
    const soorten = [...blok.matchAll(/^ {2}- (\w+)$/gm)].map((m) => m[1]).sort();
    const basis = [...(await lees('../../addon/build.yaml')).matchAll(/^ {2}(\w+): /gm)].map((m) => m[1]).sort();
    expect(soorten).toEqual(['aarch64', 'amd64']);
    expect(basis).toEqual(soorten);
    // De workflow leest de soorten uit config.yaml (besluit 236), en bouwt met de stappen van Home Assistant.
    const workflow = await lees('../../.github/workflows/addon.yml');
    expect(workflow).toContain("awk '/^arch:/");
    expect(workflow).toMatch(/home-assistant\/builder\/actions\/build-image@\d{4}\.\d{2}\.\d+$/m);
    expect(workflow).toMatch(/^ {6}id-token: write$/m);
  });

  it('bouwt op een vaste basis, dezelfde op GitHub als bij een lokale bouw (besluit 236)', async () => {
    const basis = [...(await lees('../../addon/build.yaml')).matchAll(/^ {2}\w+: (\S+)$/gm)].map((m) => m[1]);
    const docker = (await lees('../../addon/Dockerfile')).match(/^ARG BUILD_FROM=(\S+)$/m)?.[1];
    expect(docker).toMatch(/^ghcr\.io\/home-assistant\/base:\d+\.\d+$/);
    expect(new Set(basis)).toEqual(new Set([docker]));
  });

  it('heeft een eigen AppArmor-profiel voor cijfer 8, en is experimenteel tot stap B (besluit 236)', async () => {
    const profiel = await lees('../../addon/apparmor.txt');
    expect(profiel).toMatch(/^profile hems_climate flags=/m);
    expect(profiel).toContain('/usr/bin/node cx -> node,');
    // De dienst schrijft alleen in de mappen die config.yaml aankoppelt.
    const schrijven = [...profiel.slice(profiel.indexOf('profile node')).matchAll(/^ +(\/\S+) \w*w\w*,$/gm)].map((m) => m[1]);
    expect(schrijven).toEqual(['/dev/null', '/tmp/**', '/config/{,**}', '/share/{,**}', '/data/{,**}', '/homeassistant/{,**}']);
    expect(await lees('../../addon/stage.ps1')).toContain("Van = 'addon/apparmor.txt'");
    const manifest = await lees('../../addon/config.yaml');
    expect(manifest).toMatch(/^stage: experimental$/m);
    expect(manifest).not.toMatch(/^(apparmor: false|full_access|docker_api|host_network|privileged)/m);
  });

  it('zet het paneel voor iedereen met een account in de zijbalk (besluit 161)', async () => {
    const manifest = await lees('../../addon/config.yaml');
    expect(manifest).toMatch(/^panel_admin: false$/m);
  });
});
