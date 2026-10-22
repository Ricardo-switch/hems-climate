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
    // Bekijk wijst naar die batterij in de kamer, ook als hij bij een schakelaar hoort.
    expect(s.lijst(T0).actief.find((m) => m.soort === 'batterij')?.actie?.href).toBe('kamer.html#bad/batterij-sensor.knop');
    // Een nieuwe batterij: opgelost, met wat er gebeurde.
    s.bij(leeg({ nu: T0 + UUR, batterijen: [{ id: 'sensor.knop', naam: 'Schakelaar badkamer', pct: 100, kamerId: 'bad' }] }));
    expect(s.lijst(T0 + UUR).eerder.map((m) => m.titel)).toContain('Nieuwe batterij in Schakelaar badkamer');
  });

  it('meldt onder de drempel die de bewoner koos, en nooit als hij dat koos (besluit 149)', async () => {
    const { s } = await store();
    const batterijen = [{ id: 'sensor.knop', naam: 'Knop', pct: 15, kamerId: null }];
    const filters = [{ id: 'sensor.filter', naam: 'Airco zolder', pct: 4, kamerId: 'zolder' }];
    s.bij(leeg({ batterijen, filters, drempels: { batterij: 20, filter: null } }));
    expect(s.lijst(T0).actief.map((m) => m.soort)).toEqual(['batterij']);
    s.bij(leeg({ nu: T0 + UUR, batterijen: [{ ...batterijen[0]!, pct: 90 }], drempels: { batterij: 20, filter: null } }));
    expect(s.lijst(T0 + UUR).eerder[0]?.tekst).toMatch(/^Weer boven de 20%\./);
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

  it('haalt elke melding weg: wat nog speelt tot het voorbij is, wat voorbij is meteen', async () => {
    const { s } = await store();
    s.bij(leeg({ volgen: [droger(T0 - 2 * UUR)], batterijen: [{ id: 'sensor.knop', naam: 'Knop', pct: 5, kamerId: null }] }));
    expect(s.verwijder('stil:switch.droger')).toBe(true);
    expect(s.lijst(T0).actief.map((m) => m.soort)).toEqual(['batterij']);
    s.bij(leeg({ nu: T0 + UUR, versie: { nummer: '0.13.0' } }));
    s.bij(leeg({ nu: T0 + 2 * UUR, versie: { nummer: '0.14.0', eerste: 'Verwacht naast echt' } }));
    const eerder = s.lijst(T0 + 2 * UUR).eerder;
    expect(eerder.map((m) => m.id)).toContain('versie:0.14.0');
    expect(s.verwijder('versie:0.14.0')).toBe(true);
    expect(s.lijst(T0 + 2 * UUR).eerder.map((m) => m.id)).not.toContain('versie:0.14.0');
    // Komt niet terug bij de volgende ronde.
    s.bij(leeg({ nu: T0 + 3 * UUR, versie: { nummer: '0.14.0' } }));
    expect(s.lijst(T0 + 3 * UUR).eerder.map((m) => m.id)).not.toContain('versie:0.14.0');
    expect(s.verwijder('bestaat:niet')).toBe(false);
    expect(s.verwijder(42)).toBe(false);
  });

  it('onthoudt het in een eigen bestand', async () => {
    const { dir, s } = await store();
    s.bij(leeg({ volgen: [droger(T0 - 2 * UUR)] }));
    await s.bewaar();
    const weer = new MeldingenStore({ logDir: dir });
    await weer.load();
    expect(weer.lijst(T0).actief.length).toBe(1);
  });

  it('maakt elke melding in beide talen, en geeft de bel die van de app (besluit 185)', async () => {
    const { s } = await store();
    const bron = (nu: number, sinds: number | null) => leeg({
      nu,
      volgen: [droger(sinds)],
      rookmelders: [{ id: 'melder.keuken', naam: 'Melder keuken', kamer: 'Keuken', kamerId: 'keuken', gevaar: 'rook', sindsMs: nu - 60_000, batterijProbleem: false, vervangenVoor: null }],
      meters: [{ id: 'sensor.p1', naam: 'De slimme meter', naamEn: 'The smart meter', laatsteMs: null }],
    });
    s.bij(bron(T0 + 2 * UUR, T0));
    const en = s.lijst(T0 + 2 * UUR, 'en').actief;
    expect(en.map((m) => m.titel).sort()).toEqual(['De droger no longer responds', 'Smoke in Keuken', 'The smart meter has stopped reporting']);
    expect(en.find((m) => m.id.startsWith('stil:'))?.tekst).toBe('No message for 2 hours, in Zolder. Is it plugged in, or has the connection gone?');
    expect(en.every((m) => m.actie == null || m.actie.label === 'View')).toBe(true);
    // Wat de pagina krijgt, heeft geen tweede taal erin.
    expect(en.some((m) => 'en' in m)).toBe(false);
    expect(s.lijst(T0 + 2 * UUR).actief.map((m) => m.titel).sort()).toEqual(['De droger reageert niet meer', 'De slimme meter levert niets meer', 'Rook in de keuken']);
    // Weer goed: onder Eerder, met de tijd in het Engels.
    s.bij(leeg({ nu: T0 + 3 * UUR, volgen: [droger(null)] }));
    const eerder = s.lijst(T0 + 3 * UUR, 'en').eerder.find((m) => m.id.startsWith('stil:'))!;
    expect([eerder.titel, eerder.tekst]).toEqual(['De droger working again', 'After 2 hours without a connection. At 13:00.']);
  });

  it('noemt een nieuwe versie in het Engels als die woorden er zijn, en anders in algemene woorden', async () => {
    const { s } = await store();
    s.bij(leeg({ versie: { nummer: '0.59.4' } }));
    s.bij(leeg({ versie: { nummer: '0.59.5', eerste: 'Meldingen in het Engels', eersteEn: 'Notifications in English' } }));
    s.bij(leeg({ versie: { nummer: '0.59.6', eerste: 'Iets nieuws', eersteEn: '' } }));
    expect(s.lijst(T0, 'en').eerder.map((m) => [m.titel, m.tekst])).toEqual([
      ['Version 0.59.5: what is new', 'Notifications in English'],
      ['Version 0.59.6: what is new', 'See what is better.'],
    ]);
  });
});
