/**
 * Thuis naar eigen smaak (besluit 162): wat de dienst bewaart, voor wie, en
 * wat hij weigert.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { STANDAARD_MELDINGEN } from '../src/web/push.js';

import { STANDAARD_BREED, STANDAARD_NIEMAND, STANDAARD_TEL, STANDAARD_WAND, STANDAARD_WEERGAVE, VOORKEUREN_FILE, VoorkeurenStore, leesFavorieten, leesKaarten, leesNiemand, leesWeergave, metWandVolgorde } from '../src/web/voorkeuren.js';

const ricardo = { userId: 'u-ricardo', magWand: true };
const noor = { userId: 'u-noor', magWand: false };

describe('kaarten en favorieten (besluit 162)', () => {
  it('kent alleen bestaande kaarten, elk één keer', () => {
    expect(leesKaarten(['gevoel', 'kamers'], 'tel')).toEqual({ ok: true, kaarten: ['gevoel', 'kamers'] });
    expect(leesKaarten(['kamers', 'kamers'], 'tel').ok).toBe(false);
    expect(leesKaarten(['zwembad'], 'tel').ok).toBe(false);
    expect(leesKaarten('kamers', 'tel').ok).toBe(false);
  });

  it('laat op de wand zoveel kaarten toe als je wilt, zonder de kamers en Straks (besluit 167)', () => {
    expect(leesKaarten(['vandaag', 'apparaat', 'gevoel'], 'wand').ok).toBe(true);
    expect(leesKaarten(['vandaag', 'apparaat', 'gevoel', 'morgen', 'favorieten'], 'wand').ok).toBe(true);
    expect(leesKaarten(['kamers'], 'wand').ok).toBe(false);
    expect(leesKaarten(['straks'], 'wand').ok).toBe(false);
  });

  it('neemt hooguit twaalf favorieten, een lamp, een scène of een scherm (21 oktober 2026)', () => {
    expect(leesFavorieten([{ soort: 'lamp', id: 'light.eettafel' }, { soort: 'scene', id: 'scene.film' }, { soort: 'scherm', id: 'cover.screen_slaapkamer' }]).ok).toBe(true);
    const lampen = (n: number) => Array.from({ length: n }, (_, i) => ({ soort: 'lamp', id: `light.l${i}` }));
    expect(leesFavorieten(lampen(12)).ok).toBe(true);
    expect(leesFavorieten(lampen(13)).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'scherm', id: 'light.eettafel' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'scene', id: 'light.eettafel' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'schakelaar', id: 'switch.droger' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'lamp', id: 'light.a' }, { soort: 'lamp', id: 'light.a' }]).ok).toBe(false);
    expect(leesFavorieten([{ soort: 'lamp', id: 'Light A' }]).ok).toBe(false);
  });
});

describe('weergave en de wand als niemand kijkt (besluit 164)', () => {
  it('neemt een deel van de weergave, bovenop wat er stond', () => {
    expect(leesWeergave({ groteLetters: true }, STANDAARD_WEERGAVE)).toEqual({ ok: true, weergave: { ...STANDAARD_WEERGAVE, groteLetters: true } });
    expect(leesWeergave({ groteLetters: 'ja' }, STANDAARD_WEERGAVE).ok).toBe(false);
    expect(leesWeergave({ kleuren: true }, STANDAARD_WEERGAVE).ok).toBe(false);
    expect(leesWeergave([], STANDAARD_WEERGAVE).ok).toBe(false);
  });

  it('kent de tijden, de rust en een melder uit Home Assistant', () => {
    expect(leesNiemand({ van: '22:30', rustMin: 15 }, STANDAARD_NIEMAND)).toEqual({ ok: true, niemand: { ...STANDAARD_NIEMAND, van: '22:30', rustMin: 15 } });
    expect(leesNiemand({ melder: 'binary_sensor.hal_beweging' }, STANDAARD_NIEMAND).ok).toBe(true);
    expect(leesNiemand({ melder: null }, STANDAARD_NIEMAND).ok).toBe(true);
    expect(leesNiemand({ melder: 'light.hal' }, STANDAARD_NIEMAND).ok).toBe(false);
    // De camera van de wand zelf, via Fully Kiosk (29 oktober 2026).
    expect(leesNiemand({ melder: 'fully' }, STANDAARD_NIEMAND).ok).toBe(true);
    expect(leesNiemand({ melder: 'fullyx' }, STANDAARD_NIEMAND).ok).toBe(false);
    // De dagstand en de avondstand, elk aan of uit (besluit 168).
    expect(leesNiemand({ avond: false }, STANDAARD_NIEMAND)).toEqual({ ok: true, niemand: { ...STANDAARD_NIEMAND, avond: false } });
    expect(leesNiemand({ dag: 'ja' }, STANDAARD_NIEMAND).ok).toBe(false);
    // Een vaste helderheid per stand (21 oktober 2026).
    expect(leesNiemand({ helderAvond: 30, helderDag: 75 }, STANDAARD_NIEMAND)).toEqual({ ok: true, niemand: { ...STANDAARD_NIEMAND, helderAvond: 30, helderDag: 75 } });
    // Een schuif van 0 tot 100 (besluit 206).
    expect(leesNiemand({ helderAvond: 0, helderDag: 63 }, STANDAARD_NIEMAND)).toEqual({ ok: true, niemand: { ...STANDAARD_NIEMAND, helderAvond: 0, helderDag: 63 } });
    expect(leesNiemand({ helderAvond: 101 }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ helderAvond: 12.5 }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(STANDAARD_NIEMAND).toMatchObject({ helderDag: 75, helderAvond: 25 });
    expect(leesNiemand({ helderDag: '100' }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ van: '25:00' }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ van: '7:00' }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ rustMin: 3 }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ van: '07:00' }, STANDAARD_NIEMAND)).toEqual({ ok: false, reden: 'de nacht begint en eindigt niet op dezelfde tijd' });
    expect(leesNiemand({ helderheid: 3 }, STANDAARD_NIEMAND).ok).toBe(false);
    // Besluit 165: zo lang aan zonder beweging, en uit als niemand thuis is.
    expect(leesNiemand({ aanMin: 30, weg: false }, STANDAARD_NIEMAND)).toEqual({ ok: true, niemand: { ...STANDAARD_NIEMAND, aanMin: 30, weg: false } });
    expect(leesNiemand({ aanMin: 2 }, STANDAARD_NIEMAND).ok).toBe(false);
    expect(leesNiemand({ weg: 'ja' }, STANDAARD_NIEMAND).ok).toBe(false);
  });
});

describe('VoorkeurenStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hems-voorkeuren-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('begint zoals Thuis altijd was', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    const v = store.view(noor);
    expect(v.tel).toEqual({ kaarten: STANDAARD_TEL, favorieten: [], cameras: null, weergave: STANDAARD_WEERGAVE, thema: 'donker', kleur: 'lucht', taal: 'auto', meldingen: STANDAARD_MELDINGEN, agenda: { aan: true, ids: [] } });
    expect(v.wand).toEqual({ kaarten: STANDAARD_WAND, breed: STANDAARD_BREED, favorieten: [], cameras: null, magAanpassen: false, niemand: STANDAARD_NIEMAND, kleur: 'lucht', van: null, naam: null, eigen: false, persoon: null });
  });

  it('bewaart welke kaarten op de wand breed staan, bij wiens indeling het is (besluit 187)', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    const uit = await store.save({ plek: 'tel', breed: ['vandaag', 'maand', 'vandaag'] }, ricardo);
    expect(uit.ok).toBe(true);
    const bestand = JSON.parse(await readFile(join(dir, VOORKEUREN_FILE), 'utf-8'));
    expect(bestand.accounts[ricardo.userId!].breed).toEqual(['vandaag', 'maand']);
    expect((await store.save({ plek: 'tel', breed: ['kamers'] }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel', breed: 'vandaag' }, ricardo)).ok).toBe(false);
  });

  it('bewaart de telefoon per account, en leest het terug na een herstart', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    const uit = await store.save({ plek: 'tel', kaarten: ['gevoel', 'kamers'], favorieten: [{ soort: 'lamp', id: 'light.eettafel' }] }, ricardo);
    expect(uit.ok).toBe(true);
    expect(store.view(ricardo).tel.kaarten).toEqual(['gevoel', 'kamers']);
    // Noor houdt haar eigen Thuis.
    expect(store.view(noor).tel).toEqual({ kaarten: STANDAARD_TEL, favorieten: [], cameras: null, weergave: STANDAARD_WEERGAVE, thema: 'donker', kleur: 'lucht', taal: 'auto', meldingen: STANDAARD_MELDINGEN, agenda: { aan: true, ids: [] } });
    // Alleen de favorieten veranderen laat de kaarten staan.
    await store.save({ plek: 'tel', favorieten: [] }, ricardo);
    expect(store.view(ricardo).tel).toEqual({ kaarten: ['gevoel', 'kamers'], favorieten: [], cameras: null, weergave: STANDAARD_WEERGAVE, thema: 'donker', kleur: 'lucht', taal: 'auto', meldingen: STANDAARD_MELDINGEN, agenda: { aan: true, ids: [] } });

    const opnieuw = new VoorkeurenStore(dir);
    await opnieuw.load();
    expect(opnieuw.view(ricardo).tel.kaarten).toEqual(['gevoel', 'kamers']);
    expect(JSON.parse(await readFile(join(dir, VOORKEUREN_FILE), 'utf-8')).versie).toBe(1);
  });

  it('laat de wand alleen aanpassen door wie dat mag, en dan voor iedereen', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect(await store.save({ plek: 'wand', kaarten: ['favorieten'] }, noor)).toEqual({ ok: false, status: 403, reden: 'de wand past alleen de hoofdgebruiker aan' });
    expect((await store.save({ plek: 'wand', kaarten: ['vandaag', 'favorieten'], favorieten: [{ soort: 'scene', id: 'scene.film' }] }, ricardo)).ok).toBe(true);
    expect(store.view(noor).wand.kaarten).toEqual(['vandaag', 'favorieten']);
    expect(store.view(noor).wand.favorieten).toEqual([{ soort: 'scene', id: 'scene.film' }]);
  });

  it('bewaart de weergave per account, en de nachtstand voor de wand (besluit 164)', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect((await store.save({ plek: 'tel', weergave: { eenvoudig: true, groteLetters: true } }, noor)).ok).toBe(true);
    expect((await store.save({ plek: 'tel', weergave: { groteLetters: false } }, noor)).ok).toBe(true);
    expect(store.view(noor).tel.weergave).toEqual({ eenvoudig: true, groteLetters: false, minderBeweging: false, seizoen: true, weer: true, feestdagen: true, zonnebaan: true });
    expect(store.view(ricardo).tel.weergave).toEqual(STANDAARD_WEERGAVE);
    // De wand: alleen wie hem mag aanpassen, en voor iedereen.
    expect((await store.save({ plek: 'wand', niemand: { rustMin: 2 } }, noor)).ok).toBe(false);
    expect((await store.save({ plek: 'wand', niemand: { rustMin: 2, melder: 'binary_sensor.hal_beweging' } }, ricardo)).ok).toBe(true);
    expect(store.view(noor).wand.niemand).toEqual({ ...STANDAARD_NIEMAND, rustMin: 2, melder: 'binary_sensor.hal_beweging' });
    expect(store.melder()).toBe('binary_sensor.hal_beweging');
    // De weergave hoort bij een account, de nachtstand bij de wand.
    expect((await store.save({ plek: 'wand', weergave: { eenvoudig: true } }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel', niemand: { nacht: false } }, ricardo)).ok).toBe(false);
    const opnieuw = new VoorkeurenStore(dir);
    await opnieuw.load();
    expect(opnieuw.view(noor).tel.weergave.eenvoudig).toBe(true);
    expect(opnieuw.melder()).toBe('binary_sensor.hal_beweging');
  });

  it('weigert wat niet klopt, en verandert dan niets', async () => {
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect((await store.save({ plek: 'keuken', kaarten: [] }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel' }, ricardo)).ok).toBe(false);
    expect((await store.save({ plek: 'tel', kaarten: ['kamers'], favorieten: 'alles' }, ricardo)).ok).toBe(false);
    expect(store.view(ricardo).tel.kaarten).toEqual(STANDAARD_TEL);
  });

  describe('het profiel (besluit 181)', () => {
    const volgorde = [{ id: 'b-ricardo', account: 'u-ricardo', naam: 'Ricardo' }, { id: 'b-noor', account: 'u-noor', naam: 'Noor' }, { id: 'b-matts', account: 'u-matts', naam: 'Matts' }];
    const metProfiel = (wie: { userId: string; magWand: boolean }, geldt: string | null, scherm = false) => ({ ...wie, scherm, profielen: { volgorde, geldt } });
    const wand = { userId: 'u-wand', magWand: false };

    it('geeft wie nog niets koos een kleur op volgorde, en bewaart thema en kleur per account', async () => {
      const store = new VoorkeurenStore(dir);
      await store.load();
      const v = store.view(metProfiel(noor, null));
      expect(v.tel.kleur).toBe('framboos');
      expect(v.kleuren).toEqual({ 'b-ricardo': 'lucht', 'b-noor': 'framboos', 'b-matts': 'zeegroen' });
      expect((await store.save({ plek: 'tel', thema: 'systeem', kleur: 'koper' }, metProfiel(noor, null))).ok).toBe(true);
      expect(store.view(metProfiel(noor, null)).tel).toMatchObject({ thema: 'systeem', kleur: 'koper' });
      expect(store.view(metProfiel(ricardo, null)).tel).toMatchObject({ thema: 'donker', kleur: 'lucht' });
      expect(store.view(metProfiel(ricardo, null)).kleuren['b-noor']).toBe('koper');
      // Alleen wat in de lijst staat, en niet op de wand.
      expect((await store.save({ plek: 'tel', kleur: 'oranje' }, noor)).ok).toBe(false);
      expect((await store.save({ plek: 'tel', thema: 'roze' }, noor)).ok).toBe(false);
      expect((await store.save({ plek: 'wand', kleur: 'framboos' }, ricardo)).ok).toBe(false);
    });

    it('geeft de wand de weergave, het thema en de taal van wie hij volgt (25 oktober 2026)', async () => {
      const store = new VoorkeurenStore(dir);
      await store.load();
      expect((await store.save({ plek: 'tel', thema: 'licht', taal: 'en', weergave: { eenvoudig: true, feestdagen: false } }, metProfiel(noor, null))).ok).toBe(true);
      // Het scherm aan de wand, terwijl het comfort van Noor geldt.
      const p = store.view(metProfiel(wand, 'u-noor', true)).wand.persoon;
      expect(p).toMatchObject({ thema: 'licht', taal: 'en', weergave: { eenvoudig: true, feestdagen: false, seizoen: true } });
      // Geldt Ricardo, dan die van Ricardo; zonder bewoners niets.
      expect(store.view(metProfiel(wand, 'u-ricardo', true)).wand.persoon).toMatchObject({ thema: 'donker', taal: 'auto', weergave: { eenvoudig: false } });
      expect(store.view({ ...wand, scherm: true }).wand.persoon).toBeNull();
    });

    it('bewaart de taal per account: automatisch, of zelf gekozen (besluit 185)', async () => {
      const store = new VoorkeurenStore(dir);
      await store.load();
      expect(store.view(noor).tel.taal).toBe('auto');
      expect((await store.save({ plek: 'tel', taal: 'en' }, noor)).ok).toBe(true);
      expect(store.view(noor).tel.taal).toBe('en');
      expect(store.view(ricardo).tel.taal).toBe('auto');
      // Alleen een taal die de app kent, en niet op de wand: die volgt zijn eigen account.
      expect((await store.save({ plek: 'tel', taal: 'fr' }, noor)).ok).toBe(false);
      expect((await store.save({ plek: 'wand', taal: 'en' }, ricardo)).ok).toBe(false);
    });

    it('stuurt een melding in de gekozen taal, of bij Automatisch in de taal waarin de app opende (besluit 185)', async () => {
      const store = new VoorkeurenStore(dir);
      await store.load();
      // Nog niets gezien: Nederlands.
      expect(store.taal('u-ricardo')).toBe('nl');
      store.zagTaal('u-ricardo', 'en');
      expect(store.taal('u-ricardo')).toBe('en');
      // Zelf gekozen gaat voor wat de app zag.
      expect((await store.save({ plek: 'tel', taal: 'nl' }, ricardo)).ok).toBe(true);
      expect(store.taal('u-ricardo')).toBe('nl');
      expect((await store.save({ plek: 'tel', taal: 'en' }, noor)).ok).toBe(true);
      store.zagTaal('u-noor', 'nl');
      expect(store.taal('u-noor')).toBe('en');
      // Zonder account (de wand zonder inlog) onthoudt hij niets.
      store.zagTaal(null, 'en');
      expect(store.taal('')).toBe('nl');
    });

    it('zet de wandvolgorde terug in de telefoon, met de kamers en Straks op hun plek', () => {
      expect(metWandVolgorde(['kamers', 'favorieten', 'straks', 'gevoel'], ['gevoel', 'favorieten'])).toEqual(['kamers', 'gevoel', 'straks', 'favorieten']);
      expect(metWandVolgorde(['kamers', 'favorieten'], ['vandaag', 'favorieten'])).toEqual(['kamers', 'vandaag', 'favorieten']);
      expect(metWandVolgorde(['favorieten', 'straks'], [])).toEqual(['straks']);
    });

    it('toont op de wand de kaarten, favorieten en kleur van wiens comfort geldt, zoals op zijn telefoon', async () => {
      const store = new VoorkeurenStore(dir);
      await store.load();
      // Noor zet haar telefoon zoals ze wil; de wand neemt het over, zonder de kamers en Straks.
      await store.save({ plek: 'tel', kaarten: ['kamers', 'gevoel', 'straks', 'vandaag'], favorieten: [{ soort: 'scene', id: 'scene.film' }] }, metProfiel(noor, null));
      expect(store.view(metProfiel(wand, 'u-noor', true)).wand).toMatchObject({ kaarten: ['gevoel', 'vandaag'], favorieten: [{ soort: 'scene', id: 'scene.film' }], van: 'u-noor', naam: 'Noor', kleur: 'framboos', eigen: false });
      // Niemand thuis: de hoofdgebruiker, die nog niets koos.
      expect(store.view(metProfiel(wand, null, true)).wand).toMatchObject({ van: 'u-ricardo', kaarten: STANDAARD_TEL.filter((k) => k !== 'kamers' && k !== 'straks'), kleur: 'lucht' });
      // Op de wand aanpassen past dezelfde indeling aan: de kamers en Straks blijven op hun plek.
      expect((await store.save({ plek: 'wand', kaarten: ['vandaag', 'morgen'] }, metProfiel(wand, 'u-noor', true))).ok).toBe(true);
      expect(store.view(metProfiel(noor, 'u-noor')).tel.kaarten).toEqual(['kamers', 'vandaag', 'straks', 'morgen']);
      // Op je eigen tablet is Thuis jouw wand.
      expect(store.view(metProfiel(ricardo, 'u-noor')).wand).toMatchObject({ van: 'u-ricardo', eigen: true });
      // Wat de wand doet als niemand kijkt, blijft van de hoofdgebruiker of een beheerder.
      expect((await store.save({ plek: 'wand', niemand: { rustMin: 2 } }, metProfiel(wand, 'u-noor', true))).ok).toBe(false);
    });
  });

  it('begint opnieuw bij een kapot bestand', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, VOORKEUREN_FILE), '{ kapot', 'utf-8');
    const store = new VoorkeurenStore(dir);
    await store.load();
    expect(store.view(ricardo).tel.kaarten).toEqual(STANDAARD_TEL);
  });
});
