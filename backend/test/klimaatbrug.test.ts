/**
 * De klimaatbrug (besluit 210): tot stap B verzet de assistent de knoppen van
 * het oude systeem, en niets anders. Een thermostaat of airco zelf blijft
 * dicht; de knop gaat terug aan het eind van het dagdeel, tenzij iemand hem
 * intussen zelf verzette.
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HaClient, isKnopCall } from '../src/adapters/homeassistant/client.js';
import { ask, type Question } from '../src/web/assistant.js';
import { BRUG_BESTAND, BRUG_ENTITEITEN, brugVerzoek, brugVraag, KlimaatBrug, MODUS_OPTIES, totWanneer } from '../src/web/klimaatbrug.js';
import { exampleSite } from './site.js';

const TZ = 'Europe/Amsterdam';
/** 29 oktober 2026 om dit uur, Nederlandse tijd (wintertijd, UTC+1). */
const om = (uur: number, min = 0) => Date.UTC(2026, 9, 29, uur - 1, min);
const MAG = { entiteiten: BRUG_ENTITEITEN, opties: MODUS_OPTIES };

describe('de smalle deur voor de knoppen', () => {
  it('laat een getal op een knop van de brug door, en de modus op dag', () => {
    expect(isKnopCall('input_number', 'set_value', { value: 21 }, { entity_id: 'input_number.temp_nest_dag' }, MAG)).toBe(true);
    expect(isKnopCall('input_select', 'select_option', { option: 'dag' }, { entity_id: 'input_select.verwarming_modus' }, MAG)).toBe(true);
  });

  it('weigert al het andere', () => {
    // Een andere knop, een andere optie, extra velden, of een thermostaat zelf.
    expect(isKnopCall('input_number', 'set_value', { value: 21 }, { entity_id: 'input_number.temp_nest_dag_standaard' }, MAG)).toBe(false);
    expect(isKnopCall('input_select', 'select_option', { option: 'vakantie' }, { entity_id: 'input_select.verwarming_modus' }, MAG)).toBe(false);
    expect(isKnopCall('input_number', 'set_value', { value: 21, x: 1 }, { entity_id: 'input_number.temp_nest_dag' }, MAG)).toBe(false);
    expect(isKnopCall('input_number', 'set_value', { value: Number.NaN }, { entity_id: 'input_number.temp_nest_dag' }, MAG)).toBe(false);
    expect(isKnopCall('input_number', 'increment', {}, { entity_id: 'input_number.temp_nest_dag' }, MAG)).toBe(false);
    expect(isKnopCall('climate', 'set_temperature', { temperature: 21 }, { entity_id: 'climate.beneden' }, { entiteiten: ['climate.beneden'], opties: [] })).toBe(false);
    expect(isKnopCall('input_number', 'set_value', { value: 21 }, { entity_id: 'input_number.temp_nest_dag' }, { entiteiten: [], opties: [] })).toBe(false);
  });

  it('de client werpt voor een thermostaat, ook met de brug open', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:9', token: 'x', allowKnoppen: () => MAG });
    await expect(client.callService('climate', 'set_temperature', { temperature: 22 }, { entity_id: 'climate.beneden' })).rejects.toThrow(/Schrijven staat uit/);
    await expect(client.callService('input_number', 'set_value', { value: 22 }, { entity_id: 'input_number.temp_airco_zolder' })).rejects.toThrow(/Schrijven staat uit/);
  });
});

/* -------------------------------------------------------------- het oude systeem */

function systeem(o: { actief?: string; keuze?: string; dag?: number; koel?: string } = {}) {
  const states = new Map<string, { state: string; attributes: Record<string, unknown> }>([
    ['input_number.temp_nest_dag', { state: String(o.dag ?? 20), attributes: { min: 15, max: 22, step: 0.5 } }],
    ['input_number.temp_nest_dag_standaard', { state: '20', attributes: {} }],
    ['input_number.temp_airco_woonkamer_koelen', { state: '22', attributes: { min: 18, max: 26, step: 0.5 } }],
    ['input_number.temp_airco_woonkamer_koelen_standaard', { state: '22', attributes: {} }],
    ['input_select.verwarming_modus', { state: o.keuze ?? 'automatisch', attributes: {} }],
    ['input_select.verwarming_modus_actief', { state: o.actief ?? 'dag', attributes: {} }],
    ['input_select.koel_strategie', { state: o.koel ?? 'uit', attributes: {} }],
  ]);
  const gedaan: string[] = [];
  let nu = om(19);
  return {
    states,
    gedaan,
    zetNu: (ms: number) => (nu = ms),
    deur: (map: string | null = null) => ({
      state: (id: string) => states.get(id),
      zet: async (knop: string, waarde: number) => {
        gedaan.push(`${knop}=${waarde}`);
        states.set(knop, { ...states.get(knop)!, state: String(waarde) });
      },
      kies: async (select: string, optie: string) => {
        gedaan.push(`${select}=${optie}`);
        states.set(select, { ...states.get(select)!, state: optie });
      },
      nu: () => nu,
      map,
    }),
  };
}

describe('het plan', () => {
  it('overdag een graad hoger, tot 22:00', () => {
    const s = systeem();
    const p = new KlimaatBrug(s.deur()).plan('verwarmen', null, 'het is koud in de woonkamer', TZ);
    expect(p).toEqual({ ok: true, plan: { wens: 'verwarmen', knop: 'input_number.temp_nest_dag', was: 20, doel: 21, terug: 20, modusDag: false, totMs: om(22) } });
  });

  it("'s nachts eerst de modus op dag, voor twee uur", () => {
    const s = systeem({ actief: 'nacht' });
    s.zetNu(om(23, 30));
    const p = new KlimaatBrug(s.deur()).plan('verwarmen', null, null, TZ);
    expect(p).toMatchObject({ ok: true, plan: { modusDag: true, doel: 21, totMs: om(23, 30) + 2 * 3_600_000 } });
  });

  it('een genoemde temperatuur, binnen het bereik van de knop', () => {
    const brug = new KlimaatBrug(systeem().deur());
    expect(brug.plan('verwarmen', 21.5, null, TZ)).toMatchObject({ ok: true, plan: { doel: 21.5 } });
    expect(brug.plan('verwarmen', 25, null, TZ)).toEqual({ ok: false, reden: '25° kan je regeling niet: de knop gaat van 15° tot 22°.' });
    expect(new KlimaatBrug(systeem({ dag: 22 }).deur()).plan('verwarmen', null, null, TZ)).toEqual({ ok: false, reden: 'De woonkamer staat al op 22°, het hoogste wat je regeling toestaat.' });
  });

  it('niet bij vakantie, en koelen alleen als de koelstrategie aan staat', () => {
    expect(new KlimaatBrug(systeem({ keuze: 'vakantie' }).deur()).plan('verwarmen', null, null, TZ)).toMatchObject({ ok: false, reden: expect.stringContaining('vakantie') });
    expect(new KlimaatBrug(systeem().deur()).plan('koelen', null, null, TZ)).toMatchObject({ ok: false, reden: expect.stringContaining('Koelen staat in je regeling uit') });
    expect(new KlimaatBrug(systeem({ koel: 'Handmatig koelen' }).deur()).plan('koelen', null, null, TZ)).toMatchObject({ ok: true, plan: { knop: 'input_number.temp_airco_woonkamer_koelen', doel: 21 } });
  });

  it('tot hoe laat, uit wat je zei', () => {
    expect(totWanneer('maak het een uur warmer', om(15), TZ, false)).toBe(om(16));
    expect(totWanneer(null, om(15), TZ, false)).toBe(om(22));
    expect(totWanneer(null, om(22, 30), TZ, false)).toBe(om(22, 30) + 2 * 3_600_000);
  });
});

describe('doen en terugzetten', () => {
  it('zet de knop, onthoudt het in een bestand, en zet hem om 22:00 terug', async () => {
    const map = await mkdtemp(join(tmpdir(), 'brug-'));
    const s = systeem();
    const brug = new KlimaatBrug(s.deur(map));
    const p = brug.plan('verwarmen', null, null, TZ);
    if (!p.ok) throw new Error(p.reden);
    await brug.voerUit(p.plan);
    expect(s.gedaan).toEqual(['input_number.temp_nest_dag=21']);
    expect(JSON.parse(await readFile(join(map, BRUG_BESTAND), 'utf8')).terug).toEqual([{ knop: 'input_number.temp_nest_dag', gezet: 21, terug: 20, totMs: om(22) }]);
    // Nog niet: niets.
    expect(await brug.ronde()).toEqual([]);
    // Na een herstart weet een nieuwe brug het nog.
    s.zetNu(om(22, 1));
    const na = new KlimaatBrug(s.deur(map));
    expect(await na.ronde()).toEqual(['input_number.temp_nest_dag terug naar 20°']);
    expect(s.gedaan.at(-1)).toBe('input_number.temp_nest_dag=20');
    expect(na.terugzetten).toEqual([]);
  });

  it('blijft eraf als iemand de knop intussen zelf verzette', async () => {
    const s = systeem();
    const brug = new KlimaatBrug(s.deur());
    const p = brug.plan('verwarmen', null, null, TZ);
    if (!p.ok) throw new Error(p.reden);
    await brug.voerUit(p.plan);
    s.states.set('input_number.temp_nest_dag', { state: '21.5', attributes: { min: 15, max: 22, step: 0.5 } });
    s.zetNu(om(22, 1));
    expect(await brug.ronde()).toEqual([]);
    expect(s.gedaan).toEqual(['input_number.temp_nest_dag=21']);
  });

  it("'s nachts de modus en de knop, en twee keer warmer houdt de oude standaard", async () => {
    const s = systeem({ actief: 'nacht' });
    s.zetNu(om(23));
    const brug = new KlimaatBrug(s.deur());
    const eerst = brug.plan('verwarmen', null, null, TZ);
    if (!eerst.ok) throw new Error(eerst.reden);
    await brug.voerUit(eerst.plan);
    expect(s.gedaan).toEqual(['input_select.verwarming_modus=dag', 'input_number.temp_nest_dag=21']);
    s.states.set('input_select.verwarming_modus_actief', { state: 'dag', attributes: {} });
    const nog = brug.plan('verwarmen', null, null, TZ);
    if (!nog.ok) throw new Error(nog.reden);
    await brug.voerUit(nog.plan);
    expect(brug.terugzetten).toEqual([expect.objectContaining({ gezet: 22, terug: 20 })]);
  });
});

describe('de assistent en de deur', () => {
  const doe = (kamer: string, wens: 'verwarmen' | 'koelen', temperatuurC: number | null = null): Question => ({ kind: 'doe', kamer, wens, temperatuurC });
  const ctx = (brug: ReturnType<typeof brugVraag> | null) => ({ config: exampleSite, snapshot: null, today: null, nowMs: om(19), shadow: true, lang: 'nl' as const, brug });

  it('"het is koud in de woonkamer" wordt een opdracht voor de deur', () => {
    const s = systeem();
    const a = ask(doe('woonkamer', 'verwarmen'), ctx(brugVraag(new KlimaatBrug(s.deur()), exampleSite, null)));
    expect(a.antwoord).toBe('Ik zet de woonkamer op 21°, tot 22:00. Daarna weer 20°.');
    expect(a.opdracht).toEqual({ pad: 'api/klimaat', body: { wens: 'verwarmen', zone: 'woonkamer', temperatuurC: null, totMs: om(22) } });
    expect(a.gedaan).toEqual([{ soort: 'klimaat', waarde: '21°', uitleg: 'Woonkamer, was 20°' }]);
    expect(a.feiten.map((f) => f.tekst)).toEqual(['21°', '22:00', '20°']);
  });

  it('de zolder gaat niet via de brug: dan zegt het huis wat het zou doen', () => {
    const a = ask(doe('zolder', 'verwarmen'), ctx(brugVraag(new KlimaatBrug(systeem().deur()), exampleSite, null)));
    expect(a.opdracht).toBeUndefined();
    expect(a.antwoord).toContain('Dan zou ik');
  });

  it('de deur toetst wat de pagina stuurt', () => {
    expect(brugVerzoek({ wens: 'verwarmen', zone: 'woonkamer', temperatuurC: null, totMs: om(22) }, exampleSite, om(19))).toEqual({ ok: true, wens: 'verwarmen', zone: 'woonkamer', temperatuurC: null, totMs: om(22) });
    expect(brugVerzoek({ wens: 'verwarmen', zone: 'zolder', totMs: om(22) }, exampleSite, om(19))).toMatchObject({ ok: false });
    expect(brugVerzoek({ wens: 'drogen', zone: 'woonkamer', totMs: om(22) }, exampleSite, om(19))).toMatchObject({ ok: false });
    expect(brugVerzoek({ wens: 'verwarmen', zone: 'woonkamer', totMs: om(19) + 13 * 3_600_000 }, exampleSite, om(19))).toMatchObject({ ok: false });
  });
});
