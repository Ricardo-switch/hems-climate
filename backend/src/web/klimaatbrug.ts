/**
 * De klimaatbrug (besluit 210): tot stap B bedient de assistent het klimaat
 * via de knoppen van het oude systeem van dit huis, niet via de thermostaat of
 * de airco zelf. "Het is koud in de woonkamer" zet de dagtemperatuur van de
 * Nest een graad hoger (`input_number.temp_nest_dag`); de regeling in Home
 * Assistant doet de rest, met al haar eigen beveiligingen, binnen drie
 * minuten. Aan het eind van het dagdeel zet de brug de knop terug op de
 * standaard, tenzij iemand hem intussen zelf verzette.
 *
 * Alleen voor dit huis: de knoppen hieronder bestaan alleen in zijn YAML. Zonder
 * die knoppen is er geen brug, en de brug staat standaard uit (Functies ›
 * Praten). Bij stap B verdwijnt hij: dan regelt de app zelf.
 *
 * 's Nachts (de Nest staat dan uit) zet de brug de verwarmingsmodus op dag; de
 * timer van het oude systeem zet hem na twee uur terug op automatisch. De
 * zolder doet niet mee: daar verwarmt de airco alleen met zon of als hulp.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { actuatorsOf, type SiteConfig } from '../core/model.js';
import type { BrugVraag } from './assistant.js';
import { metLidwoord } from './kamerwoorden.js';

/** De knoppen van het oude systeem, per wens. */
export const KNOPPEN = {
  verwarmen: { knop: 'input_number.temp_nest_dag', standaard: 'input_number.temp_nest_dag_standaard', apparaat: 'climate.beneden' },
  koelen: { knop: 'input_number.temp_airco_woonkamer_koelen', standaard: 'input_number.temp_airco_woonkamer_koelen_standaard', apparaat: 'climate.air_conditioning_woonkamer' },
} as const;
export const MODUS = 'input_select.verwarming_modus';
export const MODUS_ACTIEF = 'input_select.verwarming_modus_actief';
export const KOELSTRATEGIE = 'input_select.koel_strategie';
/** Wat de client mag verzetten (de smalle deur in `HaClient`). */
export const BRUG_ENTITEITEN: readonly string[] = [KNOPPEN.verwarmen.knop, KNOPPEN.koelen.knop, MODUS];
/** Alleen deze opties van de modus mag de brug kiezen. */
export const MODUS_OPTIES: readonly string[] = ['dag'];

/** Hoe lang 's nachts: zo lang als de timer van het oude systeem (`timer.verwarming_handmatig`). */
const NACHT_MS = 2 * 3_600_000;
/** Het eind van het dagdeel "dag" in het oude systeem. */
const DAG_TOT_UUR = 22;

export const BRUG_BESTAND = 'klimaatbrug.json';

export type BrugWens = 'verwarmen' | 'koelen';

interface Toestand {
  readonly state: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface BrugDeur {
  readonly state: (id: string) => Toestand | undefined;
  /** `input_number.set_value` op een knop. */
  readonly zet: (knop: string, waarde: number) => Promise<void>;
  /** `input_select.select_option` op de modus. */
  readonly kies: (select: string, optie: string) => Promise<void>;
  readonly nu?: () => number;
  /** De map om te onthouden wat terug moet, of null: alleen in het geheugen. */
  readonly map: string | null;
}

/** Wat er terug moet, en wanneer. */
export interface Terugzetten {
  readonly knop: string;
  /** Wat de brug zette: staat er iets anders, dan blijft de brug eraf. */
  readonly gezet: number;
  readonly terug: number;
  readonly totMs: number;
}

export interface BrugPlan {
  readonly wens: BrugWens;
  readonly knop: string;
  readonly was: number;
  readonly doel: number;
  readonly terug: number;
  /** De modus op dag zetten ('s nachts). */
  readonly modusDag: boolean;
  readonly totMs: number;
}

export type BrugUitkomst = { readonly ok: true; readonly plan: BrugPlan } | { readonly ok: false; readonly reden: string };

const getal = (s: Toestand | undefined): number | null => {
  const n = Number(s?.state);
  return s != null && s.state !== '' && Number.isFinite(n) ? n : null;
};

/** "21°" of "20,5°". */
export const graden = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}°`;

/** "22:00", in de tijdzone van het huis. */
export function klok(ms: number, tijdzone: string): string {
  return new Intl.DateTimeFormat('nl-NL', { timeZone: tijdzone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

/** Het uur in de tijdzone van het huis, en het moment van vandaag om `uur`:00. */
function vandaagOm(nuMs: number, tijdzone: string, uur: number): { uurNu: number; ms: number } {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tijdzone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(nuMs));
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const sinds = (v('hour') * 3600 + v('minute') * 60 + v('second')) * 1000;
  return { uurNu: v('hour') + v('minute') / 60, ms: nuMs - sinds + uur * 3_600_000 };
}

/**
 * Tot hoe laat (besluit 75): wat je zei ("een uur", "tot vanavond"), anders het
 * eind van het dagdeel: 22:00, of 's nachts twee uur, zoals de timer van het
 * oude systeem.
 */
export function totWanneer(tekst: string | null, nuMs: number, tijdzone: string, nacht: boolean): number {
  const t = (tekst ?? '').toLowerCase();
  if (/\b(half uur|halfuur|30 minuten|half an hour)\b/.test(t)) return nuMs + 1_800_000;
  if (/\b(een uur|1 uur|uurtje|an hour|one hour)\b/.test(t)) return nuMs + 3_600_000;
  if (/\b(twee uur|2 uur|two hours)\b/.test(t)) return nuMs + 2 * 3_600_000;
  const { uurNu, ms } = vandaagOm(nuMs, tijdzone, DAG_TOT_UUR);
  if (!nacht && uurNu < DAG_TOT_UUR) return ms;
  return nuMs + NACHT_MS;
}

export class KlimaatBrug {
  readonly #d: BrugDeur;
  #terug: Terugzetten[] = [];
  #geladen = false;

  constructor(d: BrugDeur) {
    this.#d = d;
  }

  #nu(): number {
    return this.#d.nu?.() ?? Date.now();
  }

  /** Of het oude systeem er is: de knop en zijn standaard voor verwarmen, en de modus. */
  get beschikbaar(): boolean {
    return getal(this.#d.state(KNOPPEN.verwarmen.knop)) != null && getal(this.#d.state(KNOPPEN.verwarmen.standaard)) != null && this.#d.state(MODUS) != null;
  }

  /** Wat er nog terug moet (voor Functies en de test). */
  get terugzetten(): readonly Terugzetten[] {
    return [...this.#terug];
  }

  /**
   * Wat de brug zou doen, zonder iets te doen: dezelfde berekening voor het
   * antwoord van de assistent als straks voor de deur.
   */
  plan(wens: BrugWens, temperatuurC: number | null, tekst: string | null, tijdzone: string): BrugUitkomst {
    const k = KNOPPEN[wens];
    const knop = this.#d.state(k.knop);
    const was = getal(knop);
    const terug = getal(this.#d.state(k.standaard));
    if (was == null || terug == null) return { ok: false, reden: wens === 'koelen' ? 'Koelen via je eigen regeling kan hier niet.' : 'Verwarmen via je eigen regeling kan hier niet.' };
    if (wens === 'koelen') {
      const strategie = this.#d.state(KOELSTRATEGIE)?.state ?? 'uit';
      if (strategie === 'uit') return { ok: false, reden: 'Koelen staat in je regeling uit. Zet de koelstrategie aan in Home Assistant, dan kan ik de woonkamer koeler zetten.' };
    }
    const min = Number(knop?.attributes['min'] ?? -Infinity);
    const max = Number(knop?.attributes['max'] ?? Infinity);
    const stap = Number(knop?.attributes['step'] ?? 0.5) || 0.5;
    const actief = this.#d.state(MODUS_ACTIEF)?.state ?? 'dag';
    const keuze = this.#d.state(MODUS)?.state ?? 'automatisch';
    if (wens === 'verwarmen' && (keuze === 'vakantie' || keuze === 'koelen' || actief === 'vakantie' || actief === 'koelen')) {
      return { ok: false, reden: `Je regeling staat op ${keuze === 'automatisch' ? actief : keuze}; dan zet ik de verwarming niet hoger.` };
    }
    // 's Nachts, afwezig of voorverwarmen: dan geldt de dagtemperatuur niet, dus eerst de modus op dag.
    const modusDag = wens === 'verwarmen' && actief !== 'dag';
    const gevraagd = temperatuurC ?? (wens === 'verwarmen' ? was + 1 : was - 1);
    const doel = Math.min(max, Math.max(min, Math.round(gevraagd / stap) * stap));
    if (temperatuurC != null && doel !== temperatuurC) return { ok: false, reden: `${graden(temperatuurC)} kan je regeling niet: de knop gaat van ${graden(min)} tot ${graden(max)}.` };
    if (doel === was && !modusDag) {
      return { ok: false, reden: wens === 'verwarmen' ? `De woonkamer staat al op ${graden(was)}, het hoogste wat je regeling toestaat.` : `De woonkamer staat al op ${graden(was)} om te koelen, het laagste wat je regeling toestaat.` };
    }
    return { ok: true, plan: { wens, knop: k.knop, was, doel, terug, modusDag, totMs: totWanneer(tekst, this.#nu(), tijdzone, modusDag) } };
  }

  /** Doet het plan: de knop, de modus, en onthouden wat terug moet. */
  async voerUit(plan: BrugPlan): Promise<void> {
    await this.#laad();
    if (plan.modusDag) await this.#d.kies(MODUS, 'dag');
    if (plan.doel !== plan.was) await this.#d.zet(plan.knop, plan.doel);
    // Al iets van de brug op deze knop: de oude standaard blijft, de eindtijd schuift mee.
    const eerder = this.#terug.find((t) => t.knop === plan.knop);
    this.#terug = [...this.#terug.filter((t) => t.knop !== plan.knop), { knop: plan.knop, gezet: plan.doel, terug: eerder?.terug ?? plan.terug, totMs: plan.totMs }];
    await this.#bewaar();
  }

  /**
   * Elke minuut: wat voorbij zijn tijd is, terug naar de standaard, maar alleen
   * als de knop nog staat waar de brug hem zette.
   */
  async ronde(): Promise<string[]> {
    await this.#laad();
    const nu = this.#nu();
    const klaar = this.#terug.filter((t) => t.totMs <= nu);
    if (!klaar.length) return [];
    const gedaan: string[] = [];
    for (const t of klaar) {
      const staat = getal(this.#d.state(t.knop));
      if (staat === t.gezet && staat !== t.terug) {
        try {
          await this.#d.zet(t.knop, t.terug);
          gedaan.push(`${t.knop} terug naar ${graden(t.terug)}`);
        } catch {
          // Volgende ronde opnieuw.
          continue;
        }
      }
      this.#terug = this.#terug.filter((x) => x !== t);
    }
    await this.#bewaar();
    return gedaan;
  }

  /**
   * "Doe maar terug" (besluit 213): wat de brug zette, nu meteen terug naar de
   * standaard. Ook als Home Assistant de nieuwe stand nog niet meldde: de
   * bewoner vraagt het zelf. Geeft terug hoeveel knoppen er terug gingen.
   */
  async terugNu(): Promise<number> {
    await this.#laad();
    let n = 0;
    for (const t of this.#terug) {
      if (getal(this.#d.state(t.knop)) === t.terug) continue;
      await this.#d.zet(t.knop, t.terug);
      n++;
    }
    this.#terug = [];
    await this.#bewaar();
    return n;
  }

  async #laad(): Promise<void> {
    if (this.#geladen) return;
    this.#geladen = true;
    if (this.#d.map == null) return;
    try {
      const j: unknown = JSON.parse(await readFile(join(this.#d.map, BRUG_BESTAND), 'utf8'));
      const lijst = (j as { terug?: unknown })?.terug;
      if (Array.isArray(lijst)) {
        this.#terug = lijst.filter(
          (t): t is Terugzetten =>
            typeof t === 'object' && t != null && BRUG_ENTITEITEN.includes((t as Terugzetten).knop) && [(t as Terugzetten).gezet, (t as Terugzetten).terug, (t as Terugzetten).totMs].every((n) => typeof n === 'number' && Number.isFinite(n)),
        );
      }
    } catch {
      // Nog niets bewaard.
    }
  }

  async #bewaar(): Promise<void> {
    if (this.#d.map == null) return;
    const pad = join(this.#d.map, BRUG_BESTAND);
    await writeFile(`${pad}.tmp`, `${JSON.stringify({ versie: 1, terug: this.#terug }, null, 2)}\n`);
    await rename(`${pad}.tmp`, pad);
  }
}

/* ------------------------------------------------- de kamer, de deur, het antwoord */

/** Of de brug over deze kamer en wens gaat: de kamer met het apparaat dat de knop stuurt (de Nest, de airco woonkamer). */
export function brugZone(config: SiteConfig, zoneId: string, wens: BrugWens): boolean {
  const zone = config.zones.find((z) => z.id === zoneId);
  return zone != null && actuatorsOf(config, zone).some((a) => a.ref.id === KNOPPEN[wens].apparaat);
}

export type BrugVerzoek =
  | { readonly ok: true; readonly wens: BrugWens; readonly zone: string; readonly temperatuurC: number | null; readonly totMs: number }
  | { readonly ok: false; readonly reden: string };

/** Wat de pagina naar `/api/klimaat` stuurt, getoetst: een wens, een kamer van de brug, een getal of niets, en een eindtijd binnen twaalf uur. */
export function brugVerzoek(body: unknown, config: SiteConfig, nuMs: number): BrugVerzoek {
  const b = (typeof body === 'object' && body != null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const wens = b['wens'];
  const zone = b['zone'];
  const t = b['temperatuurC'] ?? null;
  const tot = b['totMs'];
  if (wens !== 'verwarmen' && wens !== 'koelen') return { ok: false, reden: 'wens is verwarmen of koelen' };
  if (typeof zone !== 'string' || !brugZone(config, zone, wens)) return { ok: false, reden: 'die kamer gaat niet via je eigen regeling' };
  if (t !== null && (typeof t !== 'number' || !Number.isFinite(t))) return { ok: false, reden: 'temperatuurC is een getal of leeg' };
  if (typeof tot !== 'number' || tot <= nuMs || tot > nuMs + 12 * 3_600_000) return { ok: false, reden: 'totMs ligt in de komende twaalf uur' };
  return { ok: true, wens, zone, temperatuurC: t as number | null, totMs: tot };
}

/**
 * Voor de assistent: de opdracht met zijn antwoord, of waarom het niet kan, of
 * null als de brug niet over deze kamer gaat. `tekst` is wat de bewoner zei,
 * voor "tot hoe laat".
 */
export function brugVraag(brug: KlimaatBrug, config: SiteConfig, tekst: string | null): BrugVraag {
  return (wens, zoneId, temperatuurC, lang) => {
    if (!brugZone(config, zoneId, wens)) return null;
    const p = brug.plan(wens, temperatuurC, tekst, config.timezone);
    if (!p.ok) return { ok: false, antwoord: p.reden };
    const { plan } = p;
    const zone = config.zones.find((z) => z.id === zoneId)!;
    const naam = zone.name;
    const doel = graden(plan.doel);
    const tot = klok(plan.totMs, config.timezone);
    const terug = graden(plan.terug);
    const nl = lang === 'nl';
    const antwoord =
      wens === 'koelen'
        ? nl ? `Ik zet ${metLidwoord(naam)} op ${doel} om te koelen, tot ${tot}.` : `I am setting ${naam} to cool to ${doel}, until ${tot}.`
        : plan.modusDag
          ? nl ? `Ik zet de verwarming weer aan, op ${doel}, tot ${tot}.` : `I am turning the heating back on, at ${doel}, until ${tot}.`
          : nl ? `Ik zet ${metLidwoord(naam)} op ${doel}, tot ${tot}. Daarna weer ${terug}.` : `I am setting ${naam} to ${doel}, until ${tot}. Then back to ${terug}.`;
    return {
      ok: true,
      antwoord,
      feiten: [
        { bron: 'brug.doel', tekst: doel },
        { bron: 'brug.tot', tekst: tot },
        { bron: 'brug.terug', tekst: terug },
      ],
      opdracht: { pad: 'api/klimaat', body: { wens, zone: zoneId, temperatuurC, totMs: plan.totMs } },
      gedaan: [{ soort: 'klimaat', waarde: doel, uitleg: `${naam}, was ${graden(plan.was)}` }],
    };
  };
}
