/*
 * Bijwerken vanuit de app (21 oktober 2026): de update-entiteit van de eigen
 * add-on, wat er nieuw is uit addon/CHANGELOG.md, en een smalle deur die
 * alleen update.install op die ene entiteit doorlaat.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HaClient, type HaEntityState } from '../src/adapters/homeassistant/client.js';
import { changelog, eigenUpdate, leesChangelog, nieuwer, updateView } from '../src/web/bijwerken.js';
import { wat, type MeldingenBron } from '../src/web/meldingen.js';
import { NIEUW } from '../src/version.js';

const update = (state: string, latest: string, extra: Record<string, unknown> = {}): HaEntityState => ({
  entity_id: 'update.smart_climate_update',
  state,
  attributes: { title: 'Smart Climate', installed_version: '0.46.1', latest_version: latest, in_progress: false, ...extra },
  last_changed: '2026-10-21T10:00:00Z',
  last_updated: '2026-10-21T10:00:00Z',
});

describe('bijwerken (21 oktober 2026)', () => {
  it('houdt addon/CHANGELOG.md gelijk aan wat er nieuw is (npm run changelog)', async () => {
    const bestand = await readFile(fileURLToPath(new URL('../../addon/CHANGELOG.md', import.meta.url)), 'utf8');
    expect(bestand.replace(/\r\n/g, '\n')).toBe(changelog(NIEUW));
    // En de app leest hem weer terug, versie voor versie.
    const terug = leesChangelog(bestand);
    expect(terug.map((n) => n.versie)).toEqual(NIEUW.map((n) => n.versie));
    expect(terug[0]).toEqual({ versie: NIEUW[0]!.versie, nieuw: [...(NIEUW[0]!.nieuw ?? [])], beter: [...(NIEUW[0]!.beter ?? [])], opgelost: [...(NIEUW[0]!.opgelost ?? [])] });
  });

  it('vergelijkt versies, en vindt de update van de eigen add-on', () => {
    expect(nieuwer('0.47.0', '0.46.1')).toBe(true);
    expect(nieuwer('0.46.10', '0.46.9')).toBe(true);
    expect(nieuwer('v1.0.0', '0.99.0')).toBe(true);
    expect(nieuwer('0.46.1', '0.46.1')).toBe(false);
    const ander = { ...update('on', '2.0.0'), entity_id: 'update.iets_anders', attributes: { title: 'Iets anders' } };
    expect(eigenUpdate([ander, update('off', '0.46.1')])?.entity_id).toBe('update.smart_climate_update');
    expect(eigenUpdate([ander])).toBeNull();
  });

  it('zegt wat er klaarstaat, met alleen de versies na die van nu', () => {
    const md = changelog([
      { versie: '0.48.0', datum: '2026-10-25', nieuw: ['Iets moois'] },
      { versie: '0.47.0', datum: '2026-10-22', opgelost: ['Een fout'] },
      { versie: '0.46.1', datum: '2026-10-21', opgelost: ['Al binnen'] },
    ]);
    const v = updateView('0.46.1', update('on', '0.47.0'), md, true);
    expect(v).toMatchObject({ beschikbaar: true, nu: '0.46.1', nieuwste: '0.47.0', bezig: false, magBijwerken: true });
    expect(v.notities.map((n) => n.versie)).toEqual(['0.47.0']);
    expect(updateView('0.46.1', update('off', '0.46.1'), md, true)).toMatchObject({ beschikbaar: false, notities: [] });
    expect(updateView('0.46.1', update('on', '0.47.0', { in_progress: true }), null, false)).toMatchObject({ beschikbaar: true, bezig: true, notities: [], magBijwerken: false });
    expect(updateView('0.46.1', null, null, true).beschikbaar).toBe(false);
  });

  it('zet een melding klaar, die na het bijwerken onder Eerder komt', () => {
    const bron: MeldingenBron = { nu: Date.UTC(2026, 9, 21), zonderRuimte: [], volgen: [], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null, update: { nieuw: '0.47.0', nu: '0.46.1' } };
    const [m, ...rest] = wat(bron);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({ id: 'update:0.47.0', soort: 'update', aandacht: true, titel: 'Versie 0.47.0 staat klaar' });
    expect(m?.klaar?.titel).toBe('Bijgewerkt naar 0.47.0');
    expect(wat({ ...bron, update: null })).toEqual([]);
  });

  it('laat alleen update.install op de eigen update door, zonder velden', async () => {
    const eigen = 'update.smart_climate_update';
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: 'x', allowUpdate: () => eigen });
    const geweigerd = async (domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown>) => {
      await expect(client.callService(domain, service, data, target)).rejects.toThrow(/Schrijven staat uit/);
    };
    await geweigerd('update', 'install', {}, { entity_id: 'update.iets_anders' });
    await geweigerd('update', 'install', { backup: true }, { entity_id: eigen });
    await geweigerd('update', 'skip', {}, { entity_id: eigen });
    await geweigerd('climate', 'set_temperature', {}, { entity_id: eigen });
    await geweigerd('update', 'install', {}, { entity_id: eigen, area_id: 'woonkamer' });
    // Zonder eigen update is de deur dicht.
    const dicht = new HaClient({ url: 'http://127.0.0.1:1', token: 'x', allowUpdate: () => null });
    await expect(dicht.callService('update', 'install', {}, { entity_id: eigen })).rejects.toThrow(/Schrijven staat uit/);
  });
});
