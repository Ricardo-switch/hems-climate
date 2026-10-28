import { describe, expect, it } from 'vitest';
import { AssistentAan, voegToeViaFlow, type AanzetDeuren } from '../src/web/assistent-aan.js';

/* De assistent met één knop (besluit 202): neerzetten, herstarten en toevoegen. */
function deuren(o: Partial<AanzetDeuren> & { log?: string[] } = {}): AanzetDeuren & { log: string[] } {
  const log = o.log ?? [];
  return {
    log,
    zetNeer: async () => (log.push('neer'), { ok: true }),
    geladen: async () => false,
    toegevoegd: async () => false,
    herstart: async () => void log.push('herstart'),
    wachtOpHerstart: async () => void log.push('terug'),
    voegToe: async () => (log.push('toe'), { ok: true }),
    nu: () => 1_000,
    ...o,
  };
}

describe('de assistent met één knop (besluit 202)', () => {
  it('zet neer, herstart en voegt toe, en zegt waar het is', async () => {
    const d = deuren();
    const a = new AssistentAan(d);
    expect(a.stand.bezig).toBe(false);
    const klaar = a.start();
    // Nog eens tikken terwijl hij loopt: hetzelfde verloop.
    expect(a.start()).toBe(klaar);
    expect(a.stand.bezig).toBe(true);
    await klaar;
    expect(d.log).toEqual(['neer', 'herstart', 'terug', 'toe']);
    expect(a.stand).toEqual({ bezig: false, stap: null, klaar: ['neerzetten', 'herstarten', 'toevoegen'], fout: null, herstartMs: 1_000 });
  });

  it('herstart niet als Home Assistant de versie al heeft, en voegt niet toe wat er al is', async () => {
    const d = deuren({ geladen: async () => true, toegevoegd: async () => true });
    const a = new AssistentAan(d);
    await a.start();
    expect(d.log).toEqual(['neer']);
    expect(a.stand.klaar).toEqual(['neerzetten', 'herstarten', 'toevoegen']);
  });

  it('zegt waarom het niet lukte, en houdt wat al gedaan is', async () => {
    const a = new AssistentAan(deuren({ voegToe: async () => ({ ok: false, reden: 'de sleutel klopt niet' }) }));
    await a.start();
    expect(a.stand).toMatchObject({ bezig: false, stap: null, klaar: ['neerzetten', 'herstarten'], fout: 'de sleutel klopt niet' });
    const b = new AssistentAan(deuren({ zetNeer: async () => ({ ok: false, reden: 'de integratie staat er al, via HACS' }) }));
    await b.start();
    expect(b.stand).toMatchObject({ klaar: [], fout: 'de integratie staat er al, via HACS' });
  });

  it('voegt toe via een stroom bij Home Assistant, met het adres en de sleutel', async () => {
    const vragen: { url: string; body: unknown }[] = [];
    const f = (async (url: string, init: { body: string }) => {
      vragen.push({ url, body: JSON.parse(init.body) });
      const antwoord = url.endsWith('/flow') ? { flow_id: 'abc', type: 'form', step_id: 'user' } : { type: 'create_entry' };
      return new Response(JSON.stringify(antwoord), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await voegToeViaFlow('http://supervisor/core/api', 't', 'http://sc:8099', 'geheim', f)).toEqual({ ok: true });
    expect(vragen).toEqual([
      { url: 'http://supervisor/core/api/config/config_entries/flow', body: { handler: 'smart_climate', show_advanced_options: false } },
      { url: 'http://supervisor/core/api/config/config_entries/flow/abc', body: { adres: 'http://sc:8099', sleutel: 'geheim' } },
    ]);
    // Staat hij er al: ook goed. Bereikt Home Assistant hem niet: dat zegt hij.
    const al = (async () => new Response(JSON.stringify({ type: 'abort', reason: 'already_configured' }))) as unknown as typeof fetch;
    expect(await voegToeViaFlow('b', 't', 'a', 's', al)).toEqual({ ok: true });
    let n = 0;
    const weg = (async () => new Response(JSON.stringify(n++ === 0 ? { flow_id: 'x', type: 'form' } : { type: 'form', errors: { base: 'niet_bereikbaar' } }))) as unknown as typeof fetch;
    expect(await voegToeViaFlow('b', 't', 'a', 's', weg)).toEqual({ ok: false, reden: 'Home Assistant bereikt Smart Climate niet' });
  });
});
