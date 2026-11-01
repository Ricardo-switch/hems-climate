/*
 * Witgoed starten (ronde 5, besluit 238): SunArc drukt op de startknop van een
 * droger of vaatwasser die op zon wacht, zodra de regeling zegt dat het moment
 * er is (zon over, of op tijd voor "Klaar voor"), of als de bewoner Nu starten
 * kiest.
 *
 * Het is de eerste keer dat de regeling zelf iets aanzet, dus smal:
 *  - alleen de startknop (`button.`) van hetzelfde apparaat als de melder voor
 *    op afstand starten, gevonden in de registers van Home Assistant;
 *  - alleen als op afstand starten aan staat, en het programma niet al loopt;
 *  - één keer per programma: na een druk wacht hij tot het apparaat draait of
 *    klaar is, en drukt hij nooit twee keer kort na elkaar (een tweede druk op
 *    start/pauze zou hem weer stilzetten).
 * Een andere automatisering die hetzelfde doet, hoort uit; dat zegt de uitleg.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { HaRegistryEntity } from '../adapters/homeassistant/discovery.js';
import type { Deferrable, SiteConfig } from '../core/model.js';
import type { LiveSnapshot } from '../adapters/homeassistant/shadow.js';

/** Zo lang na een druk geen tweede: het apparaat moet eerst laten zien dat het draait. */
export const NIET_OPNIEUW_MS = 2 * 3_600_000;
/** Een programma dat loopt of even stilstaat: dan nooit drukken. */
const LOOPT = /run|pause|delay|actief|active|bezig|loopt/i;

export interface WitgoedOpties {
  readonly config: () => SiteConfig | null;
  readonly entiteiten: () => readonly HaRegistryEntity[] | null;
  readonly state: (id: string) => HaEntityState | undefined;
  readonly druk: (knop: string) => Promise<void>;
  /** Of SunArc mag starten: alleen in de add-on (en het voorbeeldhuis). */
  readonly aan: () => boolean;
  readonly nu?: () => number;
  readonly write?: (regel: string) => void;
}

export type StartUitkomst = { readonly ok: true; readonly knop: string } | { readonly ok: false; readonly reden: string };

export class Witgoed {
  readonly #o: WitgoedOpties;
  /** Wanneer er voor het laatst gedrukt is, per apparaat. */
  readonly #gedrukt = new Map<string, number>();

  constructor(o: WitgoedOpties) {
    this.#o = o;
  }

  #nu(): number {
    return this.#o.nu?.() ?? Date.now();
  }

  /** De startknop van een apparaat: een `button.` met "start" erin, op hetzelfde apparaat als de melder voor op afstand starten. */
  knopVan(d: Deferrable): string | null {
    const lijst = this.#o.entiteiten();
    if (!lijst) return null;
    const apparaat = lijst.find((e) => e.entity_id === d.remoteStart.id)?.device_id;
    if (!apparaat) return null;
    const knoppen = lijst.filter((e) => e.device_id === apparaat && !e.disabled_by && e.entity_id.startsWith('button.') && /start/.test(e.entity_id) && !/stop/.test(e.entity_id));
    return knoppen[0]?.entity_id ?? null;
  }

  /** De startknoppen die de deur doorlaat. */
  knoppen(): readonly string[] {
    if (!this.#o.aan()) return [];
    return (this.#o.config()?.deferrables ?? []).map((d) => this.knopVan(d)).filter((k): k is string => k != null);
  }

  /** Kan dit apparaat nu gestart worden, en zo nee, waarom niet. */
  #kan(d: Deferrable): StartUitkomst {
    if (!this.#o.aan()) return { ok: false, reden: 'starten kan alleen in de add-on' };
    const knop = this.knopVan(d);
    if (!knop) return { ok: false, reden: 'geen startknop gevonden bij dit apparaat' };
    if (this.#o.state(d.remoteStart.id)?.state !== 'on') return { ok: false, reden: 'zet op het apparaat op afstand starten aan' };
    const op = d.operationState ? this.#o.state(d.operationState.id)?.state ?? '' : '';
    if (LOOPT.test(op)) return { ok: false, reden: 'het programma loopt al' };
    const was = this.#gedrukt.get(d.id);
    if (was != null && this.#nu() - was < NIET_OPNIEUW_MS) return { ok: false, reden: 'net al gestart; even wachten tot hij draait' };
    return { ok: true, knop };
  }

  async #start(d: Deferrable): Promise<StartUitkomst> {
    const kan = this.#kan(d);
    if (!kan.ok) return kan;
    this.#gedrukt.set(d.id, this.#nu());
    try {
      await this.#o.druk(kan.knop);
    } catch (e) {
      this.#gedrukt.delete(d.id);
      return { ok: false, reden: `Home Assistant weigerde: ${(e as Error).message}` };
    }
    this.#o.write?.(`${d.name} gestart met ${kan.knop}`);
    return kan;
  }

  /** Nu starten, op een tik van de bewoner. */
  async nuStarten(id: string): Promise<StartUitkomst> {
    const d = (this.#o.config()?.deferrables ?? []).find((x) => x.id === id);
    if (!d) return { ok: false, reden: 'dat apparaat kent SunArc niet' };
    return this.#start(d);
  }

  /** Bij elk besluit: wat de regeling zou starten, starten. Geeft terug wat er gestart is. */
  async opBesluit(snapshot: LiveSnapshot): Promise<string[]> {
    const gestart: string[] = [];
    for (const uitleg of snapshot.explanation.deferrables ?? []) {
      // Draait of is hij klaar, dan mag hij een volgende keer weer.
      if (uitleg.state === 'running' || uitleg.state === 'not_ready') this.#gedrukt.delete(uitleg.id);
      if (uitleg.state !== 'would_start') continue;
      const d = (this.#o.config()?.deferrables ?? []).find((x) => x.id === uitleg.id);
      if (!d || !this.#kan(d).ok) continue;
      const uit = await this.#start(d);
      if (uit.ok) gestart.push(d.id);
    }
    return gestart;
  }

  /** Per apparaat: of het hier kan, en wanneer er gedrukt is. Voor het blad in de app. */
  stand(id: string): { readonly kan: boolean; readonly reden: string | null; readonly gestartMs: number | null } {
    const d = (this.#o.config()?.deferrables ?? []).find((x) => x.id === id);
    if (!d) return { kan: false, reden: 'onbekend', gestartMs: null };
    const kan = this.#kan(d);
    return { kan: kan.ok, reden: kan.ok ? null : kan.reden, gestartMs: this.#gedrukt.get(id) ?? null };
  }
}
