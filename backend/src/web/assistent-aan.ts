/*
 * De assistent met één knop (25 oktober 2026, besluit 202). Wat eerst drie
 * stappen in Home Assistant waren, doet de add-on na één tik van de
 * beheerder zelf:
 *
 * 1. de integratie SunArc neerzetten (besluit 184);
 * 2. Home Assistant herstarten, als hij die versie nog niet geladen heeft;
 * 3. de integratie toevoegen, met het adres en de sleutel van de add-on.
 *
 * Herstarten en toevoegen is schrijven naar Home Assistant, buiten de grens
 * van licht, scènes en schermen; daarom alleen na die tik, en alleen deze twee
 * dingen. De stand blijft in de dienst, zodat een pagina die tijdens het
 * herstarten opnieuw laadt, ziet waar het is.
 */

export type AanzetStap = 'neerzetten' | 'herstarten' | 'toevoegen';

export interface AanzetStand {
  readonly bezig: boolean;
  /** De stap die nu loopt, of null. */
  readonly stap: AanzetStap | null;
  /** Wat al gedaan is, op volgorde. */
  readonly klaar: readonly AanzetStap[];
  /** Waarom het niet lukte, of null. */
  readonly fout: string | null;
  /** Wanneer het herstarten begon, om "nog zo'n minuut" te zeggen. */
  readonly herstartMs: number | null;
}

/** Wat de add-on kan, zodat dit los te toetsen is. */
export interface AanzetDeuren {
  zetNeer(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reden: string }>;
  /** Of Home Assistant de versie in het image al geladen heeft: dan hoeft hij niet te herstarten. */
  geladen(): Promise<boolean>;
  toegevoegd(): Promise<boolean>;
  herstart(): Promise<void>;
  /** Tot Home Assistant weer verbonden is en de integratie kent; werpt na de grens. */
  wachtOpHerstart(): Promise<void>;
  voegToe(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reden: string }>;
  nu(): number;
}

const LEEG: AanzetStand = { bezig: false, stap: null, klaar: [], fout: null, herstartMs: null };

export class AssistentAan {
  readonly #deuren: AanzetDeuren;
  #stand: AanzetStand = LEEG;
  #loopt: Promise<void> | null = null;

  constructor(deuren: AanzetDeuren) {
    this.#deuren = deuren;
  }

  get stand(): AanzetStand {
    return this.#stand;
  }

  /** Beginnen; loopt het al, dan niets. Geeft de belofte van het hele verloop, voor de test. */
  start(): Promise<void> {
    this.#loopt ??= this.#loop().finally(() => (this.#loopt = null));
    return this.#loopt;
  }

  async #loop(): Promise<void> {
    const d = this.#deuren;
    const klaar: AanzetStap[] = [];
    const zet = (stap: AanzetStap | null, extra: Partial<AanzetStand> = {}) => (this.#stand = { ...this.#stand, bezig: stap != null, stap, klaar: [...klaar], fout: null, ...extra });
    try {
      zet('neerzetten', { herstartMs: null });
      const neer = await d.zetNeer();
      if (!neer.ok) throw new Error(neer.reden);
      klaar.push('neerzetten');
      if (!(await d.geladen())) {
        zet('herstarten', { herstartMs: d.nu() });
        await d.herstart();
        await d.wachtOpHerstart();
      }
      klaar.push('herstarten');
      zet('toevoegen');
      if (!(await d.toegevoegd())) {
        const toe = await d.voegToe();
        if (!toe.ok) throw new Error(toe.reden);
      }
      klaar.push('toevoegen');
      zet(null);
    } catch (error) {
      this.#stand = { ...this.#stand, bezig: false, stap: null, klaar: [...klaar], fout: (error as Error).message || 'het lukte niet' };
    }
  }
}

/**
 * Toevoegen via de configuratie van Home Assistant (REST, via de proxy van de
 * Supervisor): een nieuwe stroom voor `smart_climate`, en die meteen invullen
 * met het adres en de sleutel. Staat hij er al, dan is dat ook goed.
 */
export async function voegToeViaFlow(basis: string, token: string, adres: string, sleutel: string, f: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; reden: string }> {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const start = await f(`${basis}/config/config_entries/flow`, { method: 'POST', headers, body: JSON.stringify({ handler: 'smart_climate', show_advanced_options: false }) });
  if (!start.ok) return { ok: false, reden: `Home Assistant gaf ${start.status} bij toevoegen` };
  const flow = (await start.json()) as { flow_id?: string; type?: string; reason?: string };
  if (flow.type === 'abort') return flow.reason === 'already_configured' ? { ok: true } : { ok: false, reden: flow.reason ?? 'Home Assistant stopte het toevoegen' };
  if (!flow.flow_id) return { ok: false, reden: 'Home Assistant gaf geen stroom om in te vullen' };
  const stap = await f(`${basis}/config/config_entries/flow/${encodeURIComponent(flow.flow_id)}`, { method: 'POST', headers, body: JSON.stringify({ adres, sleutel }) });
  if (!stap.ok) return { ok: false, reden: `Home Assistant gaf ${stap.status} bij invullen` };
  const uit = (await stap.json()) as { type?: string; reason?: string; errors?: Record<string, string> };
  if (uit.type === 'create_entry' || (uit.type === 'abort' && uit.reason === 'already_configured')) return { ok: true };
  const fout = uit.errors?.['base'] ?? uit.reason ?? 'onbekend';
  return { ok: false, reden: fout === 'niet_bereikbaar' ? 'Home Assistant bereikt SunArc niet' : fout === 'sleutel' ? 'de sleutel klopt niet' : `toevoegen lukte niet (${fout})` };
}
