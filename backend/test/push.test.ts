/**
 * Meldingen op de telefoon (besluit 183): de enige notify-deur, welke telefoon
 * van wie is, en wat er wanneer naar een telefoon gaat.
 */

import { describe, expect, it } from 'vitest';

import { HaClient, type HaEntityState } from '../src/adapters/homeassistant/client.js';
import type { HaDevice, HaRegistryEntity } from '../src/adapters/homeassistant/discovery.js';
import type { Melding } from '../src/web/meldingen.js';
import { STANDAARD_MELDINGEN, alsDienst, alsMelding, inNachtrust, teSturen, telefoonVan, vindTelefoons, type Ontvanger, type Telefoon } from '../src/web/push.js';
import { leesMeldingen } from '../src/web/voorkeuren.js';

const TZ = 'Europe/Amsterdam';
/** 22 oktober 2026 om uu:mm in Nederland (zomertijd, UTC+2). */
const om = (uu: number, mm = 0) => Date.UTC(2026, 9, 22, uu - 2, mm);

describe('de deur naar de telefoon (besluit 183)', () => {
  it('laat alleen notify.mobile_app_… door, zonder doel en met de vaste velden', async () => {
    const client = new HaClient({ url: 'http://127.0.0.1:1', token: 'x', allowNotify: true });
    const geweigerd = async (domain: string, service: string, data: Record<string, unknown>, target: Record<string, unknown> = {}) => {
      await expect(client.callService(domain, service, data, target)).rejects.toThrow(/Schrijven staat uit/);
    };
    await geweigerd('notify', 'notify', { message: 'hoi' });
    await geweigerd('notify', 'persistent_notification', { message: 'hoi' });
    await geweigerd('notify', 'mobile_app_pixel_8', { message: 'hoi' }, { entity_id: 'light.hal' });
    await geweigerd('notify', 'mobile_app_pixel_8', { message: 'hoi', target: 'iedereen' });
    await geweigerd('notify', 'mobile_app_pixel_8', { message: 'hoi', data: { actions: [{ action: 'URI', uri: 'https://x' }] } });
    await geweigerd('notify', 'mobile_app_pixel_8', { message: 'hoi', data: { push: { sound: 'alarm' } } });
    await geweigerd('notify', 'mobile_app_pixel_8', { title: 'Zonder tekst' });
    await geweigerd('climate', 'set_temperature', { temperature: 30 }, { entity_id: 'climate.woonkamer' });
    // Zonder de deur ook geen telefoon.
    const dicht = new HaClient({ url: 'http://127.0.0.1:1', token: 'x' });
    await expect(dicht.callService('notify', 'mobile_app_pixel_8', { message: 'hoi' }, {})).rejects.toThrow(/Schrijven staat uit/);
  });

  it('maakt een melding met een label, stil voor weer goed en dringend voor rook', () => {
    const stil = alsMelding({ dienst: 'mobile_app_x', titel: 'Airco zolder weer goed', tekst: 'Nu weer wel.', tag: 'smart-climate-stil', dringend: false, stil: true }, '/hassio/ingress/abc_smart_climate');
    expect(stil).toEqual({ title: 'Airco zolder weer goed', message: 'Nu weer wel.', data: { tag: 'smart-climate-stil', group: 'smart-climate', clickAction: '/hassio/ingress/abc_smart_climate', url: '/hassio/ingress/abc_smart_climate', alert_once: true, push: { 'interruption-level': 'passive' } } });
    const rook = alsMelding({ dienst: 'mobile_app_x', titel: 'Rook in de keuken', tekst: '…', tag: 't', dringend: true, stil: false }, null);
    expect(rook.data).toEqual({ tag: 't', group: 'smart-climate', priority: 'high', ttl: 0, push: { 'interruption-level': 'time-sensitive' } });
  });
});

describe('de telefoon van een bewoner', () => {
  const pixel: HaDevice = { id: 'd-pixel', area_id: null, name: 'Pixel 8', manufacturer: 'Google', model: 'Pixel 8' };
  const ipad: HaDevice = { id: 'd-ipad', area_id: null, name: 'iPad van Noor', manufacturer: 'Apple', model: 'iPad' };
  const knop: HaDevice = { id: 'd-knop', area_id: null, name: 'Knop', manufacturer: 'IKEA' };
  const entities: HaRegistryEntity[] = [
    { entity_id: 'device_tracker.pixel_8', device_id: 'd-pixel', platform: 'mobile_app' },
    { entity_id: 'sensor.pixel_8_battery_level', device_id: 'd-pixel', platform: 'mobile_app' },
    { entity_id: 'device_tracker.ipad_van_noor', device_id: 'd-ipad', platform: 'mobile_app' },
    { entity_id: 'sensor.knop_batterij', device_id: 'd-knop', platform: 'zha' },
  ];
  const persoon = (id: string, user: string, trackers: string[]): HaEntityState => ({ entity_id: id, state: 'home', attributes: { user_id: user, device_trackers: trackers }, last_changed: '', last_updated: '' });
  const states = new Map([['person.ricardo', persoon('person.ricardo', 'u-ricardo', ['device_tracker.pixel_8'])]]);

  it('vindt de telefoons met de app van Home Assistant, en aan wiens persoon ze hangen', () => {
    expect(vindTelefoons({ devices: [knop, pixel, ipad], entities }, states)).toEqual([
      { id: 'd-ipad', naam: 'iPad van Noor', dienst: 'mobile_app_ipad_van_noor', account: null },
      { id: 'd-pixel', naam: 'Pixel 8', dienst: 'mobile_app_pixel_8', account: 'u-ricardo' },
    ]);
    expect(alsDienst("Noor's Galaxy S24 — wit")).toBe('noor_s_galaxy_s24_wit');
  });

  it('neemt de telefoon van je persoon, of die je koos', () => {
    const t = vindTelefoons({ devices: [pixel, ipad], entities }, states);
    expect(telefoonVan('u-ricardo', STANDAARD_MELDINGEN, t)?.id).toBe('d-pixel');
    expect(telefoonVan('u-noor', STANDAARD_MELDINGEN, t)).toBeNull();
    expect(telefoonVan('u-noor', { ...STANDAARD_MELDINGEN, telefoon: 'd-ipad' }, t)?.id).toBe('d-ipad');
    expect(telefoonVan('u-noor', { ...STANDAARD_MELDINGEN, telefoon: 'weg' }, t)).toBeNull();
  });
});

describe('wat er wanneer naar de telefoon gaat', () => {
  const telefoon: Telefoon = { id: 'd', naam: 'Pixel 8', dienst: 'mobile_app_pixel_8', account: 'u' };
  const ik = (keus = {}): Ontvanger => ({ account: 'u', keus: { ...STANDAARD_MELDINGEN, ...keus }, telefoon });
  const melding = (id: string, soort: Melding['soort'], sindsMs: number, opgelostMs: number | null = null): Melding => ({ id, soort, titel: `Titel ${id}`, tekst: 'Tekst', sindsMs, opgelostMs, aandacht: true, klaar: { titel: `${id} weer goed`, tekst: 'Nu weer wel.' } });

  it('kent de nachtrust in de tijd van het huis, ook over middernacht', () => {
    expect(inNachtrust(STANDAARD_MELDINGEN, om(23, 30), TZ)).toBe(true);
    expect(inNachtrust(STANDAARD_MELDINGEN, om(3), TZ)).toBe(true);
    expect(inNachtrust(STANDAARD_MELDINGEN, om(7), TZ)).toBe(false);
    expect(inNachtrust({ ...STANDAARD_MELDINGEN, van: '13:00', tot: '14:00' }, om(13, 30), TZ)).toBe(true);
  });

  it('stuurt dringend meteen, ook \'s nachts, en de rest pas na de nachtrust', () => {
    const lijst = [melding('rook:keuken', 'rook', om(3)), melding('stil:airco', 'stil', om(2, 30)), melding('batterij:knop', 'batterij', om(2))];
    const nacht = teSturen(lijst, [ik({ onderhoud: true })], {}, om(3, 1), TZ);
    expect(nacht.berichten.map((b) => [b.titel, b.dringend])).toEqual([['Titel rook:keuken', true], ['Titel stil:airco', true]]);
    // Om 07:00 de batterij, en niets dubbel.
    const ochtend = teSturen(lijst, [ik({ onderhoud: true })], nacht.verstuurd, om(7, 1), TZ);
    expect(ochtend.berichten.map((b) => b.titel)).toEqual(['Titel batterij:knop']);
    expect(teSturen(lijst, [ik({ onderhoud: true })], ochtend.verstuurd, om(7, 2), TZ).berichten).toEqual([]);
  });

  it('volgt de keuzes: wat uit staat, en wat niet naar de telefoon gaat, blijft bij de bel', () => {
    const lijst = [melding('batterij:knop', 'batterij', om(12)), melding('update:0.57.0', 'update', om(12)), melding('nieuw:lamp', 'nieuw', om(12)), melding('rook:keuken', 'rook', om(12))];
    expect(teSturen(lijst, [ik()], {}, om(12, 1), TZ).berichten.map((b) => b.titel)).toEqual(['Titel rook:keuken']);
    expect(teSturen(lijst, [ik({ rook: false, versie: true })], {}, om(12, 1), TZ).berichten.map((b) => b.titel)).toEqual(['Titel update:0.57.0']);
    // Zonder telefoon niets.
    expect(teSturen(lijst, [{ ...ik(), telefoon: null }], {}, om(12, 1), TZ).berichten).toEqual([]);
  });

  it('vervangt de melding stil als het vanzelf goed komt, één keer', () => {
    const voor = teSturen([melding('stil:airco', 'stil', om(10))], [ik()], {}, om(10, 1), TZ);
    const opgelost = [melding('stil:airco', 'stil', om(10), om(11))];
    const na = teSturen(opgelost, [ik()], voor.verstuurd, om(11, 1), TZ);
    expect(na.berichten).toEqual([{ dienst: 'mobile_app_pixel_8', titel: 'stil:airco weer goed', tekst: 'Nu weer wel.', tag: 'smart-climate-stil-airco', dringend: false, stil: true }]);
    expect(teSturen(opgelost, [ik()], na.verstuurd, om(11, 2), TZ).berichten).toEqual([]);
    // Wat nooit op de telefoon stond, komt ook niet als weer goed.
    expect(teSturen(opgelost, [ik()], {}, om(11, 2), TZ).berichten).toEqual([]);
  });

  it('stuurt niets wat al langer dan een dag speelt: geen stapel oude meldingen', () => {
    expect(teSturen([melding('meter:p1', 'meter', om(12) - 2 * 86_400_000)], [ik()], {}, om(12), TZ).berichten).toEqual([]);
  });

  it('bewaart de keuzes per account, en weigert wat niet klopt', () => {
    expect(leesMeldingen({ onderhoud: true, van: '22:30' }, STANDAARD_MELDINGEN)).toEqual({ ok: true, meldingen: { ...STANDAARD_MELDINGEN, onderhoud: true, van: '22:30' } });
    expect(leesMeldingen({ telefoon: 'd-pixel' }, STANDAARD_MELDINGEN).ok).toBe(true);
    expect(leesMeldingen({ rook: 'ja' }, STANDAARD_MELDINGEN).ok).toBe(false);
    expect(leesMeldingen({ van: '25:00' }, STANDAARD_MELDINGEN).ok).toBe(false);
    expect(leesMeldingen({ alles: true }, STANDAARD_MELDINGEN).ok).toBe(false);
  });
});
