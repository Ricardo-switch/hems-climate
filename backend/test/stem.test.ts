/*
 * De stem van het huis (besluit 141): Piper in Home Assistant geeft het geluid
 * van een zin. Alleen geluid opvragen; geen andere aanroep, en het geluid komt
 * altijd van Home Assistant zelf.
 */
import { describe, expect, it } from 'vitest';

import { kiesStem, kiesTaal, Stem } from '../src/web/stem.js';

function nep() {
  const vragen: { url: string; methode: string; body: unknown }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    vragen.push({ url: String(url), methode: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).endsWith('/api/tts_get_url')) return new Response(JSON.stringify({ url: 'https://buiten.example/api/tts_proxy/abc.mp3', path: '/api/tts_proxy/abc.mp3' }), { status: 200 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;
  return { vragen, f };
}

describe('de stem (besluit 141)', () => {
  it('kiest Piper, en anders een lokale stem; nooit een stem uit de cloud', () => {
    expect(kiesStem(['tts.google_translate_nl_nl', 'tts.piper'])).toBe('tts.piper');
    expect(kiesStem(['tts.google_translate_nl_nl', 'tts.wyoming_nl'])).toBe('tts.wyoming_nl');
    expect(kiesStem(['tts.google_translate_nl_nl', 'tts.home_assistant_cloud'])).toBeNull();
    expect(kiesStem(['sensor.x'])).toBeNull();
  });

  it('vraagt het geluid op bij Home Assistant zelf, en maakt dezelfde zin maar één keer', async () => {
    const { vragen, f } = nep();
    const stem = new Stem({ base: 'http://ha.local:8123', token: 't', stemmen: () => ['tts.piper'], fetch: f });
    const g = await stem.zeg('De wasruimte wacht op zon.');
    expect(g.type).toBe('audio/mpeg');
    expect([...g.data]).toEqual([1, 2, 3]);
    expect(vragen.map((v) => `${v.methode} ${v.url}`)).toEqual(['POST http://ha.local:8123/api/tts_get_url', 'GET http://ha.local:8123/api/tts_proxy/abc.mp3']);
    expect(vragen[0]!.body).toEqual({ engine_id: 'tts.piper', message: 'De wasruimte wacht op zon.', cache: true });
    await stem.zeg('De wasruimte wacht op zon.');
    expect(vragen).toHaveLength(2);
  });

  it('zegt niets zonder lokale stem', async () => {
    const { f } = nep();
    const stem = new Stem({ base: 'http://ha.local:8123', token: 't', stemmen: () => [], fetch: f });
    expect(stem.naam).toBeNull();
    await expect(stem.zeg('Hallo')).rejects.toThrow('geen lokale stem');
  });

  it('spreekt Nederlands: met de taal en een Nederlandse stem erbij (opgelost 15 oktober)', async () => {
    expect(kiesTaal(['en_US', 'nl_BE', 'nl_NL'])).toBe('nl_NL');
    expect(kiesTaal(['en_US', 'nl_BE'])).toBe('nl_BE');
    expect(kiesTaal(['en-US', 'nl'])).toBe('nl');
    expect(kiesTaal(['en_US'])).toBeNull();
    const { vragen, f } = nep();
    const stem = new Stem({
      base: 'http://ha.local:8123',
      token: 't',
      stemmen: () => ['tts.piper'],
      talen: async () => ['en_US', 'nl_NL'],
      stemmenVoor: async (_s, taal) => (taal === 'nl_NL' ? [{ voice_id: 'nl_NL-mls-medium', name: 'mls' }] : []),
      fetch: f,
    });
    await stem.zeg('Hallo');
    expect(vragen[0]!.body).toEqual({ engine_id: 'tts.piper', message: 'Hallo', cache: true, language: 'nl_NL', options: { voice: 'nl_NL-mls-medium' } });
    // Zonder Nederlands: geen Engels geluid, maar een fout, zodat de pagina een andere stem kiest.
    const engels = new Stem({ base: 'http://ha.local:8123', token: 't', stemmen: () => ['tts.piper'], talen: async () => ['en_US'], fetch: f });
    await expect(engels.zeg('Hallo')).rejects.toThrow('geen Nederlands');
  });

  it('spreekt Engels met een Engelse stem, Brits eerst, en Engelse eenheden (besluit 185)', async () => {
    expect(kiesTaal(['en_US', 'en_GB', 'nl_NL'], 'en')).toBe('en_GB');
    expect(kiesTaal(['nl_NL', 'en-US'], 'en')).toBe('en-US');
    expect(kiesTaal(['nl_NL'], 'en')).toBeNull();
    const { vragen, f } = nep();
    const stem = new Stem({
      base: 'http://ha.local:8123',
      token: 't',
      stemmen: () => ['tts.piper'],
      talen: async () => ['en_GB', 'nl_NL'],
      stemmenVoor: async (_s, taal) => (taal === 'en_GB' ? [{ voice_id: 'en_GB-alba-medium', name: 'alba' }] : [{ voice_id: 'nl_NL-mls-medium', name: 'mls' }]),
      fetch: f,
    });
    await stem.zeg('The panels gave 4 kWh.', 'en');
    expect(vragen[0]!.body).toEqual({ engine_id: 'tts.piper', message: 'The panels gave 4 kilowatt hours.', cache: true, language: 'en_GB', options: { voice: 'en_GB-alba-medium' } });
    // Dezelfde zin in een andere taal is een ander geluid; Nederlands blijft Nederlands.
    await stem.zeg('Hallo', 'nl');
    expect(vragen.at(-2)!.body).toMatchObject({ language: 'nl_NL', options: { voice: 'nl_NL-mls-medium' } });
    expect(await stem.taalVoor('en')).toEqual({ stem: 'tts.piper', taal: 'en_GB', voice: 'en_GB-alba-medium' });
    // Zonder Engelse stem een fout, zodat de pagina de stem van het apparaat kiest.
    const alleenNl = new Stem({ base: 'http://ha.local:8123', token: 't', stemmen: () => ['tts.piper'], talen: async () => ['nl_NL'], fetch: f });
    await expect(alleenNl.zeg('Hello', 'en')).rejects.toThrow('geen Engels');
  });
});
