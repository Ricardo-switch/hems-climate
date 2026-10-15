/*
 * Meldingen in de app (besluit 136): wat aandacht vraagt, met een wachttijd,
 * wat zichzelf oplost naar Eerder, en wat er onthouden wordt.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MeldingenStore, type MeldingenBron } from '../src/web/meldingen.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'hems-meldingen-'));
  dirs.push(dir);
  return { dir, s: new MeldingenStore({ logDir: dir }) };
}

const UUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 15, 10, 0, 0);
const leeg = (o: Partial<MeldingenBron> = {}): MeldingenBron => ({ nu: T0, zonderRuimte: [], volgen: [], batterijen: [], filters: [], meters: [], versie: null, winterdagen: null, ...o });
const droger = (sinds: number | null) => ({ id: 'switch.droger', naam: 'De droger', kamer: 'Zolder', kamerId: 'zolder', onbereikbaarSindsMs: sinds });

describe('meldingen (besluit 136)', () => {
  it('meldt een apparaat dat een uur niet reageert, en zet het naar Eerder als het terug is', async () => {
    const { s } = await store();
    s.bij(leeg({ volgen: [droger(T0 - 30 * 60_000)] }));
    expect(s.lijst(T0).actief).toEqual([]);
    s.bij(leeg({ nu: T0 + 2 * UUR, volgen: [droger(T0 - 30 * 60_000)] }));
    const nu = s.lijst(T0 + 2 * UUR).actief;
    expect(nu.map((m) => m.titel)).toEqual(['De droger reageert niet meer']);
    expect(nu[0]?.actie?.href).toBe('kamer.html#zolder/switch.droger');
    s.bij(leeg({ nu: T0 + 3 * UUR, volgen: [droger(null)] }));
    const l = s.lijst(T0 + 3 * UUR);
    expect(l.actief).toEqual([]);
    expect(l.eerder[0]?.titel).toBe('De droger weer goed');
  });

  it('opent hetzelfde bericht weer als het binnen een etmaal terugkomt, in plaats van een nieuw', async () => {
    const { s } = await store();
    s.bij(leeg({ nu: T0, volgen: [droger(T0 - 2 * UUR)] }));
    s.bij(leeg({ nu: T0 + UUR, volgen: [droger(null)] }));
    s.bij(leeg({ nu: T0 + 5 * UUR, volgen: [droger(T0 + 3 * UUR)] }));
    const l = s.lijst(T0 + 5 * UUR);
    expect(l.actief.length).toBe(1);
    expect(l.eerder.length).toBe(0);
  });

  it('wacht met iets nieuws tien minuten, en kan het negeren', async () => {
    const { s } = await store();
    const bron = (nu: number) => leeg({ nu, zonderRuimte: [{ id: 'light.tuinhuis', naam: 'Lamp tuinhuis' }] });
    s.bij(bron(T0));
    expect(s.lijst(T0).actief).toEqual([]);
    s.bij(bron(T0 + 11 * 60_000));
    expect(s.lijst(T0 + 11 * 60_000).actief.map((m) => m.actie?.label)).toEqual(['Zet in een kamer']);
    expect(s.negeer('nieuw:light.tuinhuis')).toBe(true);
    expect(s.negeer('bestaat:niet')).toBe(false);
    expect(s.lijst(T0 + 12 * 60_000).actief).toEqual([]);
  });

  it('meldt een lege batterij, een vol filter en een stille meter', async () => {
    const { s } = await store();
    s.bij(leeg({
      batterijen: [{ id: 'sensor.knop', naam: 'Schakelaar badkamer', pct: 9, kamerId: 'bad' }, { id: 'sensor.ok', naam: 'Goed', pct: 60, kamerId: null }],
      filters: [{ id: 'sensor.filter', naam: 'Airco zolder', pct: 4, kamerId: 'zolder' }],
      meters: [{ id: 'sensor.p1', naam: 'De slimme meter', laatsteMs: T0 - UUR }],
    }));
    expect(s.lijst(T0).actief.map((m) => m.soort).sort()).toEqual(['batterij', 'filter', 'meter']);
    // Een nieuwe batterij: opgelost, met wat er gebeurde.
    s.bij(leeg({ nu: T0 + UUR, batterijen: [{ id: 'sensor.knop', naam: 'Schakelaar badkamer', pct: 100, kamerId: 'bad' }] }));
    expect(s.lijst(T0 + UUR).eerder.map((m) => m.titel)).toContain('Nieuwe batterij in Schakelaar badkamer');
  });

  it('noemt een nieuwe versie en een mijlpaal één keer, ter informatie', async () => {
    const { s } = await store();
    s.bij(leeg({ versie: { nummer: '0.12.0' } }));
    expect(s.lijst(T0).eerder).toEqual([]);
    s.bij(leeg({ nu: T0 + UUR, versie: { nummer: '0.13.0', eerste: 'Meldingen' }, winterdagen: 12 }));
    s.bij(leeg({ nu: T0 + 2 * UUR, versie: { nummer: '0.13.0', eerste: 'Meldingen' }, winterdagen: 12 }));
    const l = s.lijst(T0 + 2 * UUR);
    expect(l.actief).toEqual([]);
    expect(l.eerder.map((m) => m.titel).sort()).toEqual(['10 winterdagen meegekeken', 'Versie 0.13.0: wat is er nieuw']);
  });

  it('onthoudt het in een eigen bestand', async () => {
    const { dir, s } = await store();
    s.bij(leeg({ volgen: [droger(T0 - 2 * UUR)] }));
    await s.bewaar();
    const weer = new MeldingenStore({ logDir: dir });
    await weer.load();
    expect(weer.lijst(T0).actief.length).toBe(1);
  });
});
