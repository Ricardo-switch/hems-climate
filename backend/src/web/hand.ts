/**
 * Klimaat met de hand (besluit 235): tot stap B bedient de app het klimaat via
 * de knoppen van het oude systeem van dit huis, zoals de klimaatbrug (besluit
 * 210), maar dan voor elk apparaat, vanuit een blad op Apparaten.
 *
 * - De Nest, het koelen met de airco's en de badkamer gaan via hun knop: de
 *   regeling doet de rest, met al haar eigen beveiligingen.
 * - Verwarmen met een airco doet de regeling alleen met zon of als hulp. Met de
 *   hand zet de app daarom de knop van die airco op het doel (dan ziet de
 *   regeling een handmatige stand en stopt ze niet bij stroom van het net) en
 *   zet ze de airco zelf op verwarmen. Een smalle deur: alleen deze airco's, alleen
 *   warm of uit en een temperatuur.
 * - Een schakelbare warmtebron die niet in de regeling zit (zoals een paneel op
 *   een slimme stekker), zet de app direct aan.
 *
 * Alles met een eindtijd. Dan gaat de knop terug naar zijn standaard en de airco
 * of de stekker uit, maar alleen als die nog staan zoals de app ze zette: wie
 * intussen zelf iets verzette, wint. Wat terug moet staat in
 * `handbediening.json`, zodat een herstart het niet vergeet.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SiteConfig } from '../core/model.js';
import type { BrugVraag } from './assistant.js';
import { metLidwoord } from './kamerwoorden.js';
import { KNOPPEN, KOELSTRATEGIE, MODUS, MODUS_ACTIEF, klok, totWanneer } from './klimaatbrug.js';

export type HandModus = 'verwarmen' | 'koelen';

interface ModusDef {
  readonly knop: string;
  readonly standaard: string;
  /** De airco zelf op verwarmen (de regeling verwarmt er alleen mee met zon of als hulp). */
  readonly direct?: boolean;
  /** Koelen kan alleen als de koelstrategie van de regeling aan staat. */
  readonly koelstrategie?: boolean;
  /** 's Nachts, afwezig of bij voorverwarmen eerst de modus op dag (de Nest). */
  readonly modusDag?: boolean;
}

interface ApparaatDef {
  /** Het `climate.` van het apparaat; daarmee vindt de app het in de configuratie. */
  readonly klimaat: string;
  readonly verwarmen?: ModusDef;
  readonly koelen?: ModusDef;
}

/** De apparaten van dit huis met hun knoppen in het oude systeem. */
export const HAND: readonly ApparaatDef[] = [
  { klimaat: KNOPPEN.verwarmen.apparaat, verwarmen: { knop: KNOPPEN.verwarmen.knop, standaard: KNOPPEN.verwarmen.standaard, modusDag: true } },
  {
    klimaat: 'climate.air_conditioning_woonkamer',
    verwarmen: { knop: 'input_number.temp_airco_woonkamer', standaard: 'input_number.temp_airco_woonkamer_standaard', direct: true },
    koelen: { knop: KNOPPEN.koelen.knop, standaard: KNOPPEN.koelen.standaard, koelstrategie: true },
  },
  {
    klimaat: 'climate.air_conditioning_zolder',
    verwarmen: { knop: 'input_number.temp_airco_zolder', standaard: 'input_number.temp_airco_zolder_standaard', direct: true },
    koelen: { knop: 'input_number.temp_airco_zolder_koelen', standaard: 'input_number.temp_airco_zolder_koelen_standaard', koelstrategie: true },
  },
  { klimaat: 'climate.thermostaat_badkamer', verwarmen: { knop: 'input_number.badkamer_heat_off_temp_dag', standaard: 'input_number.badkamer_heat_off_temp_dag_standaard' } },
];

/** Alle knoppen die de hand mag verzetten. */
export const HAND_KNOPPEN: readonly string[] = HAND.flatMap((a) => [a.verwarmen?.knop, a.koelen?.knop].filter((k): k is string => k != null));
/** De airco's die de hand zelf op verwarmen mag zetten. */
export const HAND_KLIMAAT: readonly string[] = HAND.filter((a) => a.verwarmen?.direct || a.koelen?.direct).map((a) => a.klimaat);

export const HAND_BESTAND = 'handbediening.json';
/** Hooguit zo lang met de hand. */
export const HAND_MAX_MS = 12 * 3_600_000;

interface Toestand {
  readonly state: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface HandDeur {
  readonly state: (id: string) => Toestand | undefined;
  readonly zet: (knop: string, waarde: number) => Promise<void>;
  readonly kies: (select: string, optie: string) => Promise<void>;
  /** Een airco op verwarmen met een temperatuur, of uit. */
  readonly klimaat: (id: string, stand: { readonly warm: number } | 'uit') => Promise<void>;
  readonly schakel: (id: string, aan: boolean) => Promise<void>;
  /** Alleen het doel van een thermostaat, zoals een radiatorknop. */
  readonly temperatuur: (id: string, c: number) => Promise<void>;
  readonly nu?: () => number;
  readonly map: string | null;
}

/** Wat er op een eindtijd terug moet. */
export interface HandTerug {
  /** Het apparaat (`climate.` of `switch.`). */
  readonly id: string;
  readonly modus: HandModus | 'aan';
  readonly knop?: string;
  readonly gezet?: number;
  readonly terug?: number;
  /** De airco die de app zelf op verwarmen zette, of de stekker die hij aanzette. */
  readonly direct?: boolean;
  /** Een radiatorknop buiten de regeling: terug naar zijn eigen doel van daarvoor, niet uit. */
  readonly thermostaat?: boolean;
  /** Tot het doel (ronde 5): terug zodra de kamer het doel haalt, en uiterlijk op `totMs`. */
  readonly totDoel?: boolean;
  readonly totMs: number;
}

/** Wat het blad van een apparaat nodig heeft. */
export interface HandModusStand {
  readonly modus: HandModus;
  readonly doelC: number | null;
  readonly standaardC: number | null;
  readonly min: number;
  readonly max: number;
  readonly stap: number;
  /** Via de knop, of de knop en de airco zelf. */
  readonly via: 'knop' | 'direct';
  /** Waarom het nu niet kan; null als het kan. */
  readonly niet: 'koelstrategie' | 'vakantie' | null;
}

export interface HandStand {
  readonly id: string;
  /** Een radiatorknop buiten de regeling (besluit 126); weg bij een apparaat van de regeling. */
  readonly soort?: 'radiatorknop';
  readonly modi: readonly HandModusStand[];
  /** Wat het apparaat nu doet (`heat`, `cool`, `off`), en zijn eigen temperatuur. */
  readonly hvac: string | null;
  readonly nuC: number | null;
  readonly actief: { readonly modus: HandModus | 'aan'; readonly doelC: number | null; readonly totMs: number; readonly totDoel?: boolean } | null;
}

const getal = (s: Toestand | undefined): number | null => {
  const n = Number(s?.state);
  return s != null && s.state !== '' && Number.isFinite(n) ? n : null;
};

export type HandUitkomst = { readonly ok: true; readonly doelC: number | null; readonly totMs: number } | { readonly ok: false; readonly reden: string };

export class Handbediening {
  readonly #d: HandDeur;
  #terug: HandTerug[] = [];
  #geladen = false;

  constructor(d: HandDeur) {
    this.#d = d;
  }

  #nu(): number {
    return this.#d.nu?.() ?? Date.now();
  }

  /** Nu, voor de assistent. */
  get nu(): number {
    return this.#nu();
  }

  /** Wat er nog terug moet. */
  get terugzetten(): readonly HandTerug[] {
    return [...this.#terug];
  }

  /**
   * De apparaten waarvan de knoppen er zijn, met hun stand, en de
   * radiatorknoppen buiten de regeling: hun eigen doel, binnen hun eigen bereik.
   */
  async standen(knoppen: readonly string[] = []): Promise<HandStand[]> {
    await this.#laad();
    const uit: HandStand[] = [];
    for (const a of HAND) {
      const modi: HandModusStand[] = [];
      for (const modus of ['verwarmen', 'koelen'] as const) {
        const m = a[modus];
        const knop = m ? this.#d.state(m.knop) : undefined;
        if (!m || getal(knop) == null) continue;
        modi.push({
          modus,
          doelC: getal(knop),
          standaardC: getal(this.#d.state(m.standaard)),
          min: Number(knop?.attributes['min'] ?? 5),
          max: Number(knop?.attributes['max'] ?? 30),
          stap: Number(knop?.attributes['step'] ?? 0.5) || 0.5,
          via: m.direct ? 'direct' : 'knop',
          niet: this.#niet(m),
        });
      }
      if (!modi.length) continue;
      const k = this.#d.state(a.klimaat);
      const t = this.#terug.find((x) => x.id === a.klimaat);
      uit.push({
        id: a.klimaat,
        modi,
        hvac: k?.state ?? null,
        nuC: typeof k?.attributes['current_temperature'] === 'number' ? (k.attributes['current_temperature'] as number) : null,
        actief: t ? { modus: t.modus, doelC: t.gezet ?? null, totMs: t.totMs, ...(t.totDoel ? { totDoel: true } : {}) } : null,
      });
    }
    for (const id of knoppen) {
      const k = this.#d.state(id);
      const doel = Number(k?.attributes['temperature']);
      if (!k || !Number.isFinite(doel)) continue;
      const t = this.#terug.find((x) => x.id === id);
      uit.push({
        id,
        soort: 'radiatorknop',
        modi: [{ modus: 'verwarmen', doelC: doel, standaardC: t?.terug ?? doel, min: Number(k.attributes['min_temp'] ?? 5), max: Number(k.attributes['max_temp'] ?? 30), stap: Number(k.attributes['target_temp_step'] ?? 0.5) || 0.5, via: 'direct', niet: null }],
        hvac: k.state,
        nuC: typeof k.attributes['current_temperature'] === 'number' ? (k.attributes['current_temperature'] as number) : null,
        actief: t ? { modus: t.modus, doelC: t.gezet ?? null, totMs: t.totMs, ...(t.totDoel ? { totDoel: true } : {}) } : null,
      });
    }
    return uit;
  }

  /**
   * Een radiatorknop buiten de regeling met de hand: zijn eigen doel tot een
   * tijd. Daarna terug naar het doel van daarvoor, niet uit.
   */
  async zetKnop(id: string, doelC: number, totMs: number, totDoel = false): Promise<HandUitkomst> {
    await this.#laad();
    const nu = this.#nu();
    if (!(totMs > nu && totMs <= nu + HAND_MAX_MS)) return { ok: false, reden: 'tot wanneer ligt in de komende twaalf uur' };
    const k = this.#d.state(id);
    const was = Number(k?.attributes['temperature']);
    if (!k || !Number.isFinite(was)) return { ok: false, reden: 'die radiatorknop is er niet' };
    const stap = Number(k.attributes['target_temp_step'] ?? 0.5) || 0.5;
    const doel = Math.round(doelC / stap) * stap;
    const min = Number(k.attributes['min_temp'] ?? 5);
    const max = Number(k.attributes['max_temp'] ?? 30);
    if (!Number.isFinite(doel) || doel < min || doel > max) return { ok: false, reden: `de knop gaat van ${min} tot ${max}` };
    await this.#d.klimaat(id, { warm: doel });
    // Al met de hand: het doel van daarvoor blijft wat terug moet.
    const eerder = this.#terug.find((t) => t.id === id);
    this.#terug = [...this.#terug.filter((t) => t.id !== id), { id, modus: 'verwarmen', gezet: doel, terug: eerder?.terug ?? was, thermostaat: true, ...(totDoel ? { totDoel: true } : {}), totMs }];
    await this.#bewaar();
    return { ok: true, doelC: doel, totMs };
  }

  /** Of de schakelaar met de hand aan staat, en tot wanneer. */
  schakelaarTot(id: string): number | null {
    return this.#terug.find((x) => x.id === id && x.modus === 'aan')?.totMs ?? null;
  }

  #niet(m: ModusDef): HandModusStand['niet'] {
    if (m.koelstrategie && (this.#d.state(KOELSTRATEGIE)?.state ?? 'uit').trim().toLowerCase() === 'uit') return 'koelstrategie';
    const keuze = this.#d.state(MODUS)?.state ?? 'automatisch';
    const actief = this.#d.state(MODUS_ACTIEF)?.state ?? 'dag';
    if (!m.koelstrategie && [keuze, actief].some((s) => s === 'vakantie' || s === 'koelen')) return 'vakantie';
    return null;
  }

  /**
   * Wat met de hand zou gebeuren, zonder iets te doen (voor de assistent): het
   * doel binnen de knop, of een graad hoger of lager als er geen getal is.
   */
  plan(id: string, modus: HandModus, doelC: number | null): { ok: true; doelC: number; terugC: number; direct: boolean } | { ok: false; reden: 'koelstrategie' | 'vakantie' | 'knop' | 'bereik' } {
    const m = HAND.find((x) => x.klimaat === id)?.[modus];
    if (!m) return { ok: false, reden: 'knop' };
    const knop = this.#d.state(m.knop);
    const was = getal(knop);
    const terug = getal(this.#d.state(m.standaard));
    if (was == null || terug == null) return { ok: false, reden: 'knop' };
    const niet = this.#niet(m);
    if (niet) return { ok: false, reden: niet };
    const stap = Number(knop?.attributes['step'] ?? 0.5) || 0.5;
    const doel = Math.round((doelC ?? (modus === 'verwarmen' ? was + 1 : was - 1)) / stap) * stap;
    if (doel < Number(knop?.attributes['min'] ?? 5) || doel > Number(knop?.attributes['max'] ?? 30)) return { ok: false, reden: 'bereik' };
    return { ok: true, doelC: doel, terugC: terug, direct: m.direct === true && modus === 'verwarmen' };
  }

  /** Een apparaat met de hand: het doel, tot wanneer; met `totDoel` eerder terug zodra de kamer het doel haalt. */
  async zet(id: string, modus: HandModus, doelC: number, totMs: number, totDoel = false): Promise<HandUitkomst> {
    await this.#laad();
    const a = HAND.find((x) => x.klimaat === id);
    const m = a?.[modus];
    if (!a || !m) return { ok: false, reden: 'dat apparaat kan dat niet met de hand' };
    const nu = this.#nu();
    if (!(totMs > nu && totMs <= nu + HAND_MAX_MS)) return { ok: false, reden: 'tot wanneer ligt in de komende twaalf uur' };
    const knop = this.#d.state(m.knop);
    const was = getal(knop);
    const terug = getal(this.#d.state(m.standaard));
    if (was == null || terug == null) return { ok: false, reden: 'de knop van je regeling is er niet' };
    const niet = this.#niet(m);
    if (niet) return { ok: false, reden: niet === 'koelstrategie' ? 'koelen staat in je regeling uit' : 'je regeling staat op vakantie of koelen' };
    const min = Number(knop?.attributes['min'] ?? 5);
    const max = Number(knop?.attributes['max'] ?? 30);
    const stap = Number(knop?.attributes['step'] ?? 0.5) || 0.5;
    const doel = Math.round(doelC / stap) * stap;
    if (!Number.isFinite(doel) || doel < min || doel > max) return { ok: false, reden: `de knop gaat van ${min} tot ${max}` };
    // 's Nachts, afwezig of bij voorverwarmen geldt de dagtemperatuur niet: eerst de modus op dag.
    if (m.modusDag && (this.#d.state(MODUS_ACTIEF)?.state ?? 'dag') !== 'dag') await this.#d.kies(MODUS, 'dag');
    if (doel !== was) await this.#d.zet(m.knop, doel);
    if (m.direct && modus === 'verwarmen') await this.#d.klimaat(a.klimaat, { warm: doel });
    // Al iets met de hand op dit apparaat: de oude standaard blijft, de eindtijd en het doel schuiven mee.
    const eerder = this.#terug.find((t) => t.id === a.klimaat);
    const oudeKnop = eerder?.knop && eerder.knop !== m.knop ? eerder : null;
    if (oudeKnop) await this.#zetTerug(oudeKnop);
    this.#terug = [
      ...this.#terug.filter((t) => t.id !== a.klimaat),
      { id: a.klimaat, modus, knop: m.knop, gezet: doel, terug: oudeKnop ? terug : (eerder?.terug ?? terug), ...(m.direct && modus === 'verwarmen' ? { direct: true } : {}), ...(totDoel ? { totDoel: true } : {}), totMs },
    ];
    await this.#bewaar();
    return { ok: true, doelC: doel, totMs };
  }

  /** Een stekker met een warmtebron aan, tot wanneer. */
  async schakelAan(id: string, totMs: number): Promise<HandUitkomst> {
    await this.#laad();
    const nu = this.#nu();
    if (!(totMs > nu && totMs <= nu + HAND_MAX_MS)) return { ok: false, reden: 'tot wanneer ligt in de komende twaalf uur' };
    await this.#d.schakel(id, true);
    this.#terug = [...this.#terug.filter((t) => t.id !== id), { id, modus: 'aan', direct: true, totMs }];
    await this.#bewaar();
    return { ok: true, doelC: null, totMs };
  }

  /** Terug naar de regeling: nu meteen, voor dit apparaat. */
  async terugNu(id: string): Promise<boolean> {
    await this.#laad();
    const t = this.#terug.find((x) => x.id === id);
    if (!t) return false;
    await this.#zetTerug(t, true);
    this.#terug = this.#terug.filter((x) => x !== t);
    await this.#bewaar();
    return true;
  }

  /** Elke minuut: wat voorbij zijn tijd is, terug. */
  async ronde(): Promise<string[]> {
    await this.#laad();
    const nu = this.#nu();
    const klaar = this.#terug.filter((t) => t.totMs <= nu || (t.totDoel === true && this.#bereikt(t)));
    if (!klaar.length) return [];
    const gedaan: string[] = [];
    for (const t of klaar) {
      try {
        gedaan.push(...(await this.#zetTerug(t)));
      } catch {
        // Volgende ronde opnieuw.
        continue;
      }
      this.#terug = this.#terug.filter((x) => x !== t);
    }
    await this.#bewaar();
    return gedaan;
  }

  /** Heeft het apparaat zijn doel gehaald: warm genoeg, of koel genoeg? Naar zijn eigen temperatuur. */
  #bereikt(t: HandTerug): boolean {
    const nu = this.#d.state(t.id)?.attributes['current_temperature'];
    if (typeof nu !== 'number' || t.gezet == null) return false;
    return t.modus === 'koelen' ? nu <= t.gezet : nu >= t.gezet;
  }

  /**
   * Terug zoals het was, maar alleen wat nog staat zoals de app het zette; met
   * `altijd` (de bewoner vraagt het zelf) ook als Home Assistant de nieuwe stand
   * nog niet meldde.
   */
  async #zetTerug(t: HandTerug, altijd = false): Promise<string[]> {
    const gedaan: string[] = [];
    if (t.knop && t.terug != null) {
      const staat = getal(this.#d.state(t.knop));
      if ((altijd || staat === t.gezet) && staat !== t.terug) {
        await this.#d.zet(t.knop, t.terug);
        gedaan.push(`${t.knop} terug naar ${t.terug}`);
      }
    }
    if (t.thermostaat && t.terug != null) {
      const s = this.#d.state(t.id);
      if (altijd || Number(s?.attributes['temperature']) === t.gezet) {
        await this.#d.temperatuur(t.id, t.terug);
        gedaan.push(`${t.id} terug naar ${t.terug}`);
      }
    }
    if (t.direct) {
      const s = this.#d.state(t.id);
      if (t.modus === 'aan') {
        if (altijd || s?.state === 'on') {
          await this.#d.schakel(t.id, false);
          gedaan.push(`${t.id} uit`);
        }
      } else if (altijd || (s?.state === 'heat' && Number(s.attributes['temperature']) === t.gezet)) {
        await this.#d.klimaat(t.id, 'uit');
        gedaan.push(`${t.id} uit`);
      }
    }
    return gedaan;
  }

  async #laad(): Promise<void> {
    if (this.#geladen) return;
    this.#geladen = true;
    if (this.#d.map == null) return;
    try {
      const j: unknown = JSON.parse(await readFile(join(this.#d.map, HAND_BESTAND), 'utf8'));
      const lijst = (j as { terug?: unknown })?.terug;
      if (Array.isArray(lijst)) {
        this.#terug = lijst.filter(
          (t): t is HandTerug =>
            typeof t === 'object' && t != null && typeof (t as HandTerug).id === 'string' && Number.isFinite((t as HandTerug).totMs) && ((t as HandTerug).knop === undefined || HAND_KNOPPEN.includes((t as HandTerug).knop!)),
        );
      }
    } catch {
      // Nog niets bewaard.
    }
  }

  async #bewaar(): Promise<void> {
    if (this.#d.map == null) return;
    const pad = join(this.#d.map, HAND_BESTAND);
    await writeFile(`${pad}.tmp`, `${JSON.stringify({ versie: 1, terug: this.#terug }, null, 2)}\n`);
    await rename(`${pad}.tmp`, pad);
  }
}

/* ------------------------------------------------------------ de assistent */

const graad = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')}°`;

/**
 * Voor de assistent (besluit 235): "zet de zolder op 21", "het is koud op
 * zolder". Het apparaat van die kamer dat het kan, met wat het blad ook zou
 * doen; de pagina stuurt de opdracht naar `api/hand`. Null als geen apparaat
 * van die kamer het met de hand kan.
 */
export function handVraag(hand: Handbediening, config: SiteConfig, tekst: string | null): BrugVraag {
  return (wens, zoneId, temperatuurC, lang) => {
    const zone = config.zones.find((z) => z.id === zoneId);
    if (!zone) return null;
    const ids = zone.actuatorIds.map((a) => config.actuators.find((x) => x.id === a)?.ref.id).filter((x): x is string => x != null);
    const def = HAND.find((a) => ids.includes(a.klimaat) && a[wens]);
    if (!def) return null;
    const nl = lang === 'nl';
    const p = hand.plan(def.klimaat, wens, temperatuurC);
    if (!p.ok) {
      const reden = {
        koelstrategie: nl ? 'Koelen staat in je regeling uit. Zet de koelstrategie aan in Home Assistant, dan kan het.' : 'Cooling is off in your controller. Turn on the cooling strategy in Home Assistant.',
        vakantie: nl ? 'Je regeling staat op vakantie of koelen; dan verwarm ik niet met de hand.' : 'Your controller is on holiday or cooling; then I do not heat by hand.',
        bereik: nl ? 'Zo ver kan de knop van je regeling niet.' : 'The knob of your controller does not go that far.',
        knop: nl ? 'Dat kan hier niet met de hand.' : 'That cannot be done by hand here.',
      }[p.reden];
      return { ok: false, antwoord: reden };
    }
    const totMs = totWanneer(tekst, hand.nu, config.timezone, false);
    const naam = zone.name;
    const doel = graad(p.doelC);
    const tot = klok(totMs, config.timezone);
    const apparaat = config.actuators.find((x) => x.ref.id === def.klimaat)?.name ?? naam;
    const antwoord = p.direct
      ? nl ? `Ik zet ${apparaat.toLowerCase().startsWith('airco') ? `de ${apparaat.toLowerCase()}` : apparaat} op verwarmen, ${doel}, tot ${tot}.` : `I am turning ${apparaat} to heat, ${doel}, until ${tot}.`
      : wens === 'koelen'
        ? nl ? `Ik zet ${metLidwoord(naam)} op ${doel} om te koelen, tot ${tot}.` : `I am setting ${naam} to cool to ${doel}, until ${tot}.`
        : nl ? `Ik zet ${metLidwoord(naam)} op ${doel}, tot ${tot}. Daarna weer ${graad(p.terugC)}.` : `I am setting ${naam} to ${doel}, until ${tot}. Then back to ${graad(p.terugC)}.`;
    return {
      ok: true,
      antwoord,
      feiten: [
        { bron: 'brug.doel', tekst: doel },
        { bron: 'brug.tot', tekst: tot },
      ],
      opdracht: { pad: 'api/hand', body: { id: def.klimaat, modus: wens, doelC: p.doelC, totMs } },
      gedaan: [{ soort: 'klimaat', waarde: doel, uitleg: `${naam}, met de hand` }],
    };
  };
}
