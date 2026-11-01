/*
 * Klimaat met de hand (besluit 235): via de knop van de regeling, de airco op
 * warm ook zelf, een stekker direct, en alles op tijd terug, behalve wat
 * iemand intussen zelf verzette.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isHandCall } from '../src/adapters/homeassistant/client.js';
import type { SiteConfig } from '../src/core/model.js';
import { HAND_KLIMAAT, HAND_KNOPPEN, Handbediening, handVraag } from '../src/web/hand.js';

type Staat = { state: string; attributes: Record<string, unknown> };
const knop = (waarde: number, min = 16, max = 25): Staat => ({ state: String(waarde), attributes: { min, max, step: 0.5 } });

async function huis(extra: Record<string, Staat> = {}) {
  const staten: Record<string, Staat> = {
    'input_number.temp_nest_dag': knop(20),
    'input_number.temp_nest_dag_standaard': knop(20),
    'input_number.temp_airco_zolder': knop(19),
    'input_number.temp_airco_zolder_standaard': knop(19),
    'input_number.temp_airco_zolder_koelen': knop(24),
    'input_number.temp_airco_zolder_koelen_standaard': knop(24),
    'input_select.verwarming_modus': { state: 'automatisch', attributes: {} },
    'input_select.verwarming_modus_actief': { state: 'dag', attributes: {} },
    'input_select.koel_strategie': { state: 'uit', attributes: {} },
    'climate.air_conditioning_zolder': { state: 'off', attributes: { current_temperature: 17.8 } },
    'switch.paneel_keuken': { state: 'off', attributes: {} },
    ...extra,
  };
  const gedaan: string[] = [];
  const nu = { ms: Date.UTC(2026, 10, 1, 14, 10) };
  const h = new Handbediening({
    state: (id) => staten[id],
    zet: async (k, w) => {
      gedaan.push(`${k}=${w}`);
      staten[k] = { ...staten[k]!, state: String(w) };
    },
    kies: async (s, o) => {
      gedaan.push(`${s}=${o}`);
    },
    klimaat: async (id, stand) => {
      gedaan.push(`${id}=${stand === 'uit' ? 'uit' : `warm ${stand.warm}`}`);
      staten[id] = stand === 'uit' ? { state: 'off', attributes: {} } : { state: 'heat', attributes: { temperature: stand.warm } };
    },
    temperatuur: async (id, c) => {
      gedaan.push(`${id}=doel ${c}`);
      staten[id] = { ...staten[id]!, attributes: { ...staten[id]!.attributes, temperature: c } };
    },
    schakel: async (id, aan) => {
      gedaan.push(`${id}=${aan ? 'aan' : 'uit'}`);
      staten[id] = { state: aan ? 'on' : 'off', attributes: {} };
    },
    nu: () => nu.ms,
    map: await mkdtemp(join(tmpdir(), 'hand-')),
  });
  return { h, staten, gedaan, nu };
}

describe('klimaat met de hand (besluit 235)', () => {
  it('zet de zolder warm: de knop op het doel, en de airco zelf op warm', async () => {
    const { h, gedaan, nu } = await huis();
    const uit = await h.zet('climate.air_conditioning_zolder', 'verwarmen', 20, nu.ms + 3_600_000);
    expect(uit).toEqual({ ok: true, doelC: 20, totMs: nu.ms + 3_600_000 });
    expect(gedaan).toEqual(['input_number.temp_airco_zolder=20', 'climate.air_conditioning_zolder=warm 20']);
    const zolder = (await h.standen()).find((s) => s.id === 'climate.air_conditioning_zolder')!;
    expect(zolder.actief).toEqual({ modus: 'verwarmen', doelC: 20, totMs: nu.ms + 3_600_000 });
    expect(zolder.modi.find((m) => m.modus === 'verwarmen')).toMatchObject({ via: 'direct', niet: null });
    // Koelen kan niet zolang de koelstrategie uit staat.
    expect(zolder.modi.find((m) => m.modus === 'koelen')?.niet).toBe('koelstrategie');
  });

  it('zet op tijd terug: de knop naar zijn standaard en de airco uit', async () => {
    const { h, gedaan, nu } = await huis();
    await h.zet('climate.air_conditioning_zolder', 'verwarmen', 20, nu.ms + 3_600_000);
    gedaan.length = 0;
    nu.ms += 3_600_000;
    await h.ronde();
    expect(gedaan).toEqual(['input_number.temp_airco_zolder=19', 'climate.air_conditioning_zolder=uit']);
    expect(h.terugzetten).toEqual([]);
  });

  it('laat staan wat iemand intussen zelf verzette', async () => {
    const { h, staten, gedaan, nu } = await huis();
    await h.zet('climate.air_conditioning_zolder', 'verwarmen', 20, nu.ms + 3_600_000);
    staten['input_number.temp_airco_zolder'] = knop(22);
    staten['climate.air_conditioning_zolder'] = { state: 'heat', attributes: { temperature: 22 } };
    gedaan.length = 0;
    nu.ms += 3_600_000;
    await h.ronde();
    expect(gedaan).toEqual([]);
  });

  it('zet de Nest via de dagtemperatuur, en eerst de modus op dag als het nacht is', async () => {
    const { h, gedaan, nu } = await huis({ 'input_select.verwarming_modus_actief': { state: 'nacht', attributes: {} } });
    await h.zet('climate.beneden', 'verwarmen', 21, nu.ms + 3_600_000);
    expect(gedaan).toEqual(['input_select.verwarming_modus=dag', 'input_number.temp_nest_dag=21']);
  });

  it('weigert wat de knop niet kan, of te lang', async () => {
    const { h, nu } = await huis();
    expect(await h.zet('climate.beneden', 'verwarmen', 28, nu.ms + 3_600_000)).toMatchObject({ ok: false });
    expect(await h.zet('climate.beneden', 'verwarmen', 21, nu.ms + 13 * 3_600_000)).toMatchObject({ ok: false });
    expect(await h.zet('climate.air_conditioning_zolder', 'koelen', 22, nu.ms + 3_600_000)).toMatchObject({ ok: false, reden: 'koelen staat in je regeling uit' });
  });

  it('zet een radiatorknop buiten de regeling op zijn eigen doel, en daarna terug naar wat het was', async () => {
    const knop = 'climate.sonoff_thermostaat';
    const { h, gedaan, nu } = await huis({ [knop]: { state: 'heat', attributes: { temperature: 17, current_temperature: 18.4, min_temp: 5, max_temp: 35, target_temp_step: 0.5 } } });
    const standen = await h.standen([knop]);
    expect(standen.find((s) => s.id === knop)).toMatchObject({ soort: 'radiatorknop', modi: [{ doelC: 17, standaardC: 17, via: 'direct' }], nuC: 18.4 });
    expect(await h.zetKnop(knop, 20.2, nu.ms + 3_600_000)).toEqual({ ok: true, doelC: 20, totMs: nu.ms + 3_600_000 });
    expect(gedaan).toEqual([`${knop}=warm 20`]);
    nu.ms += 3_600_000;
    await h.ronde();
    expect(gedaan.at(-1)).toBe(`${knop}=doel 17`);
    expect(await h.zetKnop(knop, 40, nu.ms + 3_600_000)).toMatchObject({ ok: false });
  });

  it('tot het doel: terug zodra de zolder warm genoeg is, niet eerder (besluit 238)', async () => {
    const { h, staten, gedaan, nu } = await huis();
    await h.zet('climate.air_conditioning_zolder', 'verwarmen', 20, nu.ms + 6 * 3_600_000, true);
    expect((await h.standen()).find((s) => s.id === 'climate.air_conditioning_zolder')?.actief).toMatchObject({ doelC: 20, totDoel: true });
    gedaan.length = 0;
    staten['climate.air_conditioning_zolder'] = { state: 'heat', attributes: { temperature: 20, current_temperature: 19.4 } };
    expect(await h.ronde()).toEqual([]);
    staten['climate.air_conditioning_zolder'] = { state: 'heat', attributes: { temperature: 20, current_temperature: 20.1 } };
    await h.ronde();
    expect(gedaan).toEqual(['input_number.temp_airco_zolder=19', 'climate.air_conditioning_zolder=uit']);
    expect(h.terugzetten).toEqual([]);
  });

  it('zet een stekker aan tot een tijd, en terug met de hand', async () => {
    const { h, gedaan, nu } = await huis();
    await h.schakelAan('switch.paneel_keuken', nu.ms + 2 * 3_600_000);
    expect(h.schakelaarTot('switch.paneel_keuken')).toBe(nu.ms + 2 * 3_600_000);
    expect(await h.terugNu('switch.paneel_keuken')).toBe(true);
    expect(gedaan).toEqual(['switch.paneel_keuken=aan', 'switch.paneel_keuken=uit']);
  });
});

describe('met de hand via de assistent (besluit 235)', () => {
  const config = {
    timezone: 'Europe/Amsterdam',
    zones: [{ id: 'zolder', name: 'Zolder', actuatorIds: ['ac-zolder'] }, { id: 'hal', name: 'Hal', actuatorIds: [] }],
    actuators: [{ id: 'ac-zolder', name: 'Airco zolder', ref: { id: 'climate.air_conditioning_zolder' } }],
  } as unknown as SiteConfig;

  it('zet de zolder warm met de airco, en zegt tot wanneer', async () => {
    const { h } = await huis();
    const vraag = handVraag(h, config, 'zet de zolder op 21');
    const uit = vraag('verwarmen', 'zolder', 21, 'nl');
    expect(uit).toMatchObject({ ok: true, opdracht: { pad: 'api/hand', body: { id: 'climate.air_conditioning_zolder', modus: 'verwarmen', doelC: 21 } } });
    expect(uit && uit.antwoord).toBe('Ik zet de airco zolder op warm, 21°, tot 22:00.');
  });

  it('zegt eerlijk waarom niet, en laat een kamer zonder apparaat aan de rest', async () => {
    const { h } = await huis();
    expect(handVraag(h, config, null)('koelen', 'zolder', null, 'nl')).toEqual({ ok: false, antwoord: 'Koelen staat in je regeling uit. Zet de koelstrategie aan in Home Assistant, dan kan het.' });
    expect(handVraag(h, config, null)('verwarmen', 'hal', null, 'nl')).toBeNull();
  });
});

describe('de smalle deur voor met de hand (besluit 235)', () => {
  const MAG = { klimaat: HAND_KLIMAAT, schakelaars: ['switch.paneel_keuken'] };
  it('laat alleen warm, een temperatuur of uit door, op de airco\'s van de lijst', () => {
    expect(isHandCall('climate', 'set_hvac_mode', { hvac_mode: 'heat' }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(true);
    expect(isHandCall('climate', 'set_temperature', { temperature: 20 }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(true);
    expect(isHandCall('climate', 'turn_off', {}, { entity_id: 'climate.air_conditioning_woonkamer' }, MAG)).toBe(true);
    expect(isHandCall('climate', 'set_hvac_mode', { hvac_mode: 'cool' }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(false);
    expect(isHandCall('climate', 'set_temperature', { temperature: 35 }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(false);
    expect(isHandCall('climate', 'set_temperature', { temperature: 4 }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(false);
    expect(isHandCall('climate', 'set_temperature', { temperature: 20, hvac_mode: 'heat' }, { entity_id: 'climate.air_conditioning_zolder' }, MAG)).toBe(false);
    // De Nest zelf nooit: die gaat via zijn knop.
    expect(isHandCall('climate', 'set_temperature', { temperature: 21 }, { entity_id: 'climate.beneden' }, MAG)).toBe(false);
  });

  it('laat alleen de stekkers van de lijst aan en uit', () => {
    expect(isHandCall('switch', 'turn_on', {}, { entity_id: 'switch.paneel_keuken' }, MAG)).toBe(true);
    expect(isHandCall('switch', 'turn_on', {}, { entity_id: 'switch.wasmachine' }, MAG)).toBe(false);
    expect(isHandCall('switch', 'toggle', {}, { entity_id: 'switch.paneel_keuken' }, MAG)).toBe(false);
    expect(isHandCall('switch', 'turn_on', {}, { entity_id: 'switch.paneel_keuken', device_id: 'x' }, MAG)).toBe(false);
  });

  it('kent de knoppen en airco\'s van dit huis', () => {
    expect(HAND_KNOPPEN).toContain('input_number.temp_airco_zolder');
    expect(HAND_KNOPPEN).toContain('input_number.badkamer_heat_off_temp_dag');
    expect(HAND_KLIMAAT).toEqual(['climate.air_conditioning_woonkamer', 'climate.air_conditioning_zolder']);
  });
});
