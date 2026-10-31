import { describe, expect, it } from 'vitest';
import { InHuis, bevestigViaRest, type Entiteit, type InHuisDeuren, type NieuweAssistent, type Stroom } from '../src/web/stem-in-huis.js';

/** Een nagebootst Home Assistant: wat er staat, wat er gevonden is, en wat de add-on deed. */
function huis(begin: { entiteiten?: Entiteit[]; stromen?: Stroom[]; assistenten?: { id: string; naam: string; wekwoord: string | null }[]; wekwoorden?: string[] } = {}) {
  const entiteiten = [...(begin.entiteiten ?? [])];
  let stromen = [...(begin.stromen ?? [])];
  const assistenten = [...(begin.assistenten ?? [])];
  const bevestigd: string[] = [];
  const gemaakt: NieuweAssistent[] = [];
  const gekozen: string[] = [];
  const deuren: InHuisDeuren = {
    entiteiten: () => entiteiten,
    stromen: async () => stromen,
    bevestig: async (id) => {
      bevestigd.push(id);
      const s = stromen.find((x) => x.flow_id === id)!;
      stromen = stromen.filter((x) => x.flow_id !== id);
      // Na bevestigen staat hij er als entiteit.
      const naam = s.context?.title_placeholders?.name ?? '';
      if (/whisper/i.test(naam)) entiteiten.push({ id: 'stt.faster_whisper', naam: 'faster-whisper' });
      if (/piper/i.test(naam)) entiteiten.push({ id: 'tts.piper', naam: 'piper' });
      if (/wake/i.test(naam)) entiteiten.push({ id: 'wake_word.openwakeword', naam: 'openwakeword' });
    },
    assistenten: async () => assistenten,
    wekwoorden: async () => begin.wekwoorden ?? ['ok_nabu'],
    stemVoor: async (_e, lang) => (lang === 'nl' ? { taal: 'nl_NL', voice: 'nl_NL-mls-medium' } : { taal: 'en_GB', voice: 'en_GB-alan-medium' }),
    maak: async (a) => {
      gemaakt.push(a);
      assistenten.push({ id: 'p-nieuw', naam: a.name, wekwoord: a.wake_word_id });
      return 'p-nieuw';
    },
    kies: async (id) => void gekozen.push(id),
    wacht: async () => {},
  };
  return { deuren, bevestigd, gemaakt, gekozen };
}

const gevonden = (id: string, name: string, handler = 'wyoming'): Stroom => ({ flow_id: id, handler, context: { source: 'hassio', title_placeholders: { name } } });

describe('helemaal in huis (besluit 203)', () => {
  it('zegt per add-on of hij erin staat, gevonden is of nog niet', async () => {
    const h = huis({ entiteiten: [{ id: 'tts.piper', naam: 'piper' }], stromen: [gevonden('f1', 'Whisper')] });
    const s = await new InHuis(h.deuren).stand();
    expect(s.addons.map((a) => [a.id, a.staat])).toEqual([
      ['whisper', 'gevonden'],
      ['piper', 'aan'],
      ['openwakeword', 'nee'],
    ]);
    expect(s.addons[0]!.slug).toBe('core_whisper');
    expect(s.assistent).toBeNull();
  });

  it('bevestigt wat gevonden is, maakt de spraakassistent met Hé huis en kiest hem', async () => {
    const h = huis({ stromen: [gevonden('f1', 'faster-whisper'), gevonden('f2', 'piper'), gevonden('f3', 'openWakeWord'), gevonden('f4', 'Hue Bridge', 'hue')], wekwoorden: ['ok_nabu', 'he_huis'] });
    const inHuis = new InHuis(h.deuren);
    await inHuis.start('nl');
    // Alleen de drie van Wyoming; de Hue-brug blijft van de bewoner.
    expect(h.bevestigd).toEqual(['f1', 'f2', 'f3']);
    expect(h.gemaakt).toEqual([
      {
        name: 'SunArc',
        language: 'nl',
        conversation_engine: 'conversation.home_assistant',
        conversation_language: 'nl',
        stt_engine: 'stt.faster_whisper',
        stt_language: 'nl',
        tts_engine: 'tts.piper',
        tts_language: 'nl_NL',
        tts_voice: 'nl_NL-mls-medium',
        wake_word_entity: 'wake_word.openwakeword',
        wake_word_id: 'he_huis',
      },
    ]);
    expect(h.gekozen).toEqual(['p-nieuw']);
    const s = await inHuis.stand();
    expect(s.bezig).toBe(false);
    expect(s.fout).toBeNull();
    expect(s.assistent).toEqual({ id: 'p-nieuw', wekwoord: 'he_huis' });
    expect(s.addons.every((a) => a.staat === 'aan')).toBe(true);
  });

  it('zonder Hé huis of zonder openWakeWord: een spraakassistent zonder wekwoord', async () => {
    const h = huis({ entiteiten: [{ id: 'stt.faster_whisper', naam: 'w' }, { id: 'tts.piper', naam: 'p' }] });
    await new InHuis(h.deuren).start('en');
    expect(h.bevestigd).toEqual([]);
    expect(h.gemaakt[0]).toMatchObject({ language: 'en', tts_language: 'en_GB', wake_word_entity: null, wake_word_id: null });
  });

  it('een bestaande "SunArc" blijft zoals hij is, en wordt gekozen', async () => {
    const h = huis({ entiteiten: [{ id: 'stt.faster_whisper', naam: 'w' }, { id: 'tts.piper', naam: 'p' }], assistenten: [{ id: 'p-oud', naam: 'SunArc', wekwoord: null }] });
    await new InHuis(h.deuren).start('nl');
    expect(h.gemaakt).toEqual([]);
    expect(h.gekozen).toEqual(['p-oud']);
  });

  it('een spraakassistent van vóór de nieuwe naam ("Smart Climate") is ook van ons (besluit 222)', async () => {
    const h = huis({ entiteiten: [{ id: 'stt.faster_whisper', naam: 'w' }, { id: 'tts.piper', naam: 'p' }], assistenten: [{ id: 'p-oud', naam: 'Smart Climate', wekwoord: null }] });
    const inHuis = new InHuis(h.deuren);
    expect((await inHuis.stand()).assistent?.id).toBe('p-oud');
    await inHuis.start('nl');
    expect(h.gemaakt).toEqual([]);
    expect(h.gekozen).toEqual(['p-oud']);
  });

  it('zonder Whisper zegt hij wat er mist, en maakt niets', async () => {
    const h = huis({ entiteiten: [{ id: 'tts.piper', naam: 'p' }, { id: 'stt.home_assistant_cloud', naam: 'Home Assistant Cloud' }] });
    const inHuis = new InHuis(h.deuren);
    await inHuis.start('nl');
    expect(h.gemaakt).toEqual([]);
    expect(h.gekozen).toEqual([]);
    expect((await inHuis.stand()).fout).toBe('Whisper staat nog niet in Home Assistant');
  });

  it('bevestigen via de Supervisor: alleen "ja", en een weigering is een fout', async () => {
    const verzoeken: { url: string; body: unknown }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      verzoeken.push({ url, body: init?.body });
      return new Response(JSON.stringify({ type: 'create_entry' }), { status: 200 });
    }) as typeof fetch;
    await bevestigViaRest('http://supervisor/core/api', 't', 'f 1', f);
    expect(verzoeken).toEqual([{ url: 'http://supervisor/core/api/config/config_entries/flow/f%201', body: '{}' }]);
    const nee = (async () => new Response(JSON.stringify({ type: 'abort', reason: 'not_found' }), { status: 200 })) as typeof fetch;
    await expect(bevestigViaRest('http://supervisor/core/api', 't', 'f1', nee)).rejects.toThrow('bevestigen lukte niet (not_found)');
  });
});
