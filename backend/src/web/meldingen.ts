/*
 * Meldingen in de app (besluit 136, schets Wand-Meldingen).
 *
 * Een bel in het menu, op elke pagina, met een getal als er iets aandacht
 * vraagt. Wat er een melding krijgt, is wat de bewoner koos:
 *
 * - nieuw in Home Assistant: een apparaat dat in geen kamer staat;
 * - reageert niet meer: een apparaat in een kamer dat al een uur onbereikbaar
 *   is, en "weer goed" als het terug is;
 * - een batterij of een airco-filter onder de 10%;
 * - een meter die niets meer levert: zonder meter kloppen de cijfers niet;
 * - een nieuwe versie, en een mijlpaal zoals 10, 20 of 30 winterdagen.
 *
 * Wat vanzelf weer goed is, lost zichzelf op en schuift naar Eerder. Een
 * wachttijd houdt kort haperen buiten de lijst. Alles staat in één eigen
 * bestand naast de dataset; er gaat niets naar Home Assistant. Een melding
 * op de telefoon, via de app van Home Assistant, is schrijven en komt later
 * met een eigen besluit (79).
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MELDINGEN_FILE = 'meldingen.json';

export type MeldingSoort = 'nieuw' | 'stil' | 'batterij' | 'filter' | 'meter' | 'versie' | 'mijlpaal';

export interface Melding {
  /** Vast per onderwerp, zoals `stil:light.hal`: zo komt hetzelfde niet dubbel. */
  readonly id: string;
  readonly soort: MeldingSoort;
  readonly titel: string;
  readonly tekst: string;
  readonly actie?: { readonly label: string; readonly href: string };
  /** Sinds wanneer het speelt. */
  readonly sindsMs: number;
  /** Wanneer het vanzelf goed kwam, of null. */
  readonly opgelostMs: number | null;
  /** Vraagt het aandacht (telt in het getal), of is het alleen ter informatie. */
  readonly aandacht: boolean;
  /** Wat er bij opgelost staat, zoals "Airco zolder weer goed". */
  readonly klaar?: { readonly titel: string; readonly tekst: string };
}

/** Wat de dienst weet, elke ronde opnieuw. */
export interface MeldingenBron {
  readonly nu: number;
  /** Apparaten zonder kamer: nieuw in Home Assistant. */
  readonly zonderRuimte: readonly { readonly id: string; readonly naam: string }[];
  /** Apparaten in een kamer om te volgen, met hun toestand in Home Assistant. */
  readonly volgen: readonly { readonly id: string; readonly naam: string; readonly kamer: string; readonly kamerId: string; readonly onbereikbaarSindsMs: number | null }[];
  readonly batterijen: readonly { readonly id: string; readonly naam: string; readonly pct: number; readonly kamerId: string | null }[];
  readonly filters: readonly { readonly id: string; readonly naam: string; readonly pct: number; readonly kamerId: string | null }[];
  /** Meters die altijd moeten leveren, met hun laatste meting. */
  readonly meters: readonly { readonly id: string; readonly naam: string; readonly laatsteMs: number | null }[];
  readonly versie: { readonly nummer: string; readonly eerste?: string } | null;
  readonly winterdagen: number | null;
}

/** Zo lang onbereikbaar voor het een melding is: kort haperen hoort er niet in. */
export const STIL_NA_MS = 60 * 60_000;
/** Zo lang nieuw voor het een melding is: wie net iets koppelt, deelt het vaak meteen in. */
export const NIEUW_NA_MS = 10 * 60_000;
/** Zo lang geen meting van een meter. */
export const METER_STIL_NA_MS = 30 * 60_000;
/** Zo lang blijft iets onder Eerder staan. */
export const EERDER_MS = 7 * 86_400_000;
const MIJLPALEN = [10, 20, 30];

interface Bestand {
  readonly versie: 1;
  readonly meldingen: Melding[];
  readonly negeer: string[];
  readonly laatsteVersie: string | null;
  readonly mijlpalen: number[];
}

const duur = (ms: number) => {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} minuten`;
  const uur = Math.round(min / 60);
  return uur < 48 ? `${uur} uur` : `${Math.round(uur / 24)} dagen`;
};
const klok = (ms: number) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: process.env['TZ'] || undefined }).format(ms);
const kamerHref = (kamerId: string | null, id?: string) => (kamerId ? `kamer.html#${encodeURIComponent(kamerId)}${id ? `/${encodeURIComponent(id)}` : ''}` : 'thuis.html#batterijen');

/** Wat er nu speelt, uit de bron; zonder geheugen, dat doet de opslag. */
export function wat(bron: MeldingenBron): (Omit<Melding, 'sindsMs' | 'opgelostMs'> & { sindsMs?: number })[] {
  const uit: (Omit<Melding, 'sindsMs' | 'opgelostMs'> & { sindsMs?: number })[] = [];
  for (const d of bron.zonderRuimte) {
    uit.push({ id: `nieuw:${d.id}`, soort: 'nieuw', aandacht: true, titel: `Nieuw in Home Assistant: ${d.naam}`, tekst: 'Zet het in een kamer, dan staat het in het huis en kun je het bedienen.', actie: { label: 'Zet in een kamer', href: 'indeling.html' } });
  }
  for (const d of bron.volgen) {
    if (d.onbereikbaarSindsMs == null || bron.nu - d.onbereikbaarSindsMs < STIL_NA_MS) continue;
    uit.push({
      id: `stil:${d.id}`,
      soort: 'stil',
      aandacht: true,
      sindsMs: d.onbereikbaarSindsMs,
      titel: `${d.naam} reageert niet meer`,
      tekst: `Al ${duur(bron.nu - d.onbereikbaarSindsMs)} geen bericht, in ${d.kamer}. Staat de stekker erin, of is de verbinding weg?`,
      actie: { label: 'Bekijk', href: kamerHref(d.kamerId, d.id) },
      klaar: { titel: `${d.naam} weer goed`, tekst: `Na ${duur(bron.nu - d.onbereikbaarSindsMs)} zonder verbinding.` },
    });
  }
  for (const b of bron.batterijen) {
    if (b.pct >= 10) continue;
    uit.push({ id: `batterij:${b.id}`, soort: 'batterij', aandacht: true, titel: `Batterij bijna leeg: ${b.naam}`, tekst: `Nog ${b.pct}%. Een nieuwe batterij en het doet het weer maanden.`, actie: { label: 'Bekijk', href: kamerHref(b.kamerId) }, klaar: { titel: `Nieuwe batterij in ${b.naam}`, tekst: 'Weer boven de 10%.' } });
  }
  for (const f of bron.filters) {
    uit.push({ id: `filter:${f.id}`, soort: 'filter', aandacht: true, titel: `Filter bijna vol: ${f.naam}`, tekst: `Nog ${f.pct}%. Een schoon filter koelt en verwarmt zuiniger.`, actie: { label: 'Bekijk', href: kamerHref(f.kamerId) }, klaar: { titel: `Filter schoon: ${f.naam}`, tekst: 'Het filter is weer goed.' } });
  }
  for (const m of bron.meters) {
    if (m.laatsteMs != null && bron.nu - m.laatsteMs < METER_STIL_NA_MS) continue;
    uit.push({
      id: `meter:${m.id}`,
      soort: 'meter',
      aandacht: true,
      ...(m.laatsteMs != null ? { sindsMs: m.laatsteMs } : {}),
      titel: `${m.naam} levert niets meer`,
      tekst: `${m.laatsteMs != null ? `Sinds ${klok(m.laatsteMs)} geen meting.` : 'Geen meting.'} Zonder deze meter kloppen de cijfers en de zon niet.`,
      klaar: { titel: `${m.naam} levert weer`, tekst: 'De metingen komen weer binnen.' },
    });
  }
  return uit;
}

export class MeldingenStore {
  readonly #path: string;
  #bestand: Bestand = { versie: 1, meldingen: [], negeer: [], laatsteVersie: null, mijlpalen: [] };
  #vies = false;

  constructor(options: { readonly logDir: string }) {
    this.#path = join(options.logDir, MELDINGEN_FILE);
  }

  async load(): Promise<void> {
    try {
      const b = JSON.parse(await readFile(this.#path, 'utf-8')) as Partial<Bestand>;
      if (b.versie === 1 && Array.isArray(b.meldingen)) {
        this.#bestand = { versie: 1, meldingen: b.meldingen, negeer: Array.isArray(b.negeer) ? b.negeer : [], laatsteVersie: b.laatsteVersie ?? null, mijlpalen: Array.isArray(b.mijlpalen) ? b.mijlpalen : [] };
      }
    } catch {
      // Nog geen bestand, of niet te lezen: dan begint de lijst leeg.
    }
  }

  /** Eén ronde: wat speelt erbij, wat is opgelost, en oude dingen weg. */
  bij(bron: MeldingenBron): void {
    const nu = bron.nu;
    const b = this.#bestand;
    const nuSpeelt = wat(bron);
    const ids = new Set(nuSpeelt.map((m) => m.id));
    const meldingen = [...b.meldingen];
    for (const m of nuSpeelt) {
      const i = meldingen.findIndex((x) => x.id === m.id && x.opgelostMs == null);
      if (i >= 0) {
        // Werk de tekst bij ("al 3 uur"), maar houd sinds wanneer.
        meldingen[i] = { ...m, sindsMs: meldingen[i]!.sindsMs, opgelostMs: null };
        continue;
      }
      // Hetzelfde kwam het afgelopen etmaal al eens terug: dat ene bericht weer openen.
      const j = meldingen.findIndex((x) => x.id === m.id && x.opgelostMs != null && nu - x.opgelostMs < 86_400_000);
      if (j >= 0) {
        meldingen[j] = { ...m, sindsMs: meldingen[j]!.sindsMs, opgelostMs: null };
        continue;
      }
      meldingen.push({ ...m, sindsMs: m.sindsMs ?? nu, opgelostMs: null });
    }
    for (let i = 0; i < meldingen.length; i++) {
      const m = meldingen[i]!;
      if (m.opgelostMs == null && m.aandacht && !ids.has(m.id)) meldingen[i] = { ...m, opgelostMs: nu };
    }
    // Een nieuwe versie, en een mijlpaal: ter informatie, één keer.
    let laatsteVersie = b.laatsteVersie;
    if (bron.versie && bron.versie.nummer !== laatsteVersie) {
      if (laatsteVersie != null) meldingen.push({ id: `versie:${bron.versie.nummer}`, soort: 'versie', aandacht: false, sindsMs: nu, opgelostMs: nu, titel: `Versie ${bron.versie.nummer}: wat is er nieuw`, tekst: bron.versie.eerste ?? 'Kijk wat er beter is.', actie: { label: 'Lees', href: 'toegang.html#versie' } });
      laatsteVersie = bron.versie.nummer;
    }
    const mijlpalen = [...b.mijlpalen];
    for (const n of MIJLPALEN) {
      if (bron.winterdagen == null || bron.winterdagen < n || mijlpalen.includes(n)) continue;
      mijlpalen.push(n);
      meldingen.push({ id: `mijlpaal:winter-${n}`, soort: 'mijlpaal', aandacht: false, sindsMs: nu, opgelostMs: nu, titel: `${n} winterdagen meegekeken`, tekst: n < 30 ? `Nog ${30 - n} te gaan, dan weet het huis genoeg om zelf te regelen.` : 'Genoeg om zelf te regelen. Wanneer dat begint, kies jij.', actie: { label: 'Bekijk', href: 'huis-kan.html' } });
    }
    // Wat lang geleden opgelost is, gaat weg; zo blijft het bestand klein.
    const bewaar = meldingen.filter((m) => m.opgelostMs == null || nu - m.opgelostMs < EERDER_MS);
    const negeer = b.negeer.filter((id) => ids.has(id) || bewaar.some((m) => m.id === id));
    const nieuw: Bestand = { versie: 1, meldingen: bewaar, negeer, laatsteVersie, mijlpalen };
    if (JSON.stringify(nieuw) !== JSON.stringify(b)) {
      this.#bestand = nieuw;
      this.#vies = true;
    }
  }

  /** Wat de pagina laat zien: wat aandacht vraagt (na de wachttijd), en Eerder. */
  lijst(nu: number): { actief: Melding[]; eerder: Melding[] } {
    const b = this.#bestand;
    const wacht = (m: Melding) => m.soort === 'nieuw' && nu - m.sindsMs < NIEUW_NA_MS;
    const actief = b.meldingen.filter((m) => m.opgelostMs == null && m.aandacht && !b.negeer.includes(m.id) && !wacht(m)).sort((x, y) => y.sindsMs - x.sindsMs);
    const eerder = b.meldingen
      .filter((m) => m.opgelostMs != null && m.soort !== 'nieuw' && (m.klaar != null || !m.aandacht) && !b.negeer.includes(m.id))
      .sort((x, y) => (y.opgelostMs ?? 0) - (x.opgelostMs ?? 0))
      .slice(0, 10)
      .map((m) => (m.klaar ? { ...m, titel: m.klaar.titel, tekst: `${m.klaar.tekst} Om ${klok(m.opgelostMs!)}.` } : m));
    return { actief, eerder };
  }

  /** Niet meer laten zien, zoals een nieuw apparaat dat er niet toe doet. */
  negeer(id: unknown): boolean {
    if (typeof id !== 'string' || !this.#bestand.meldingen.some((m) => m.id === id && m.opgelostMs == null)) return false;
    if (!this.#bestand.negeer.includes(id)) {
      this.#bestand = { ...this.#bestand, negeer: [...this.#bestand.negeer, id] };
      this.#vies = true;
    }
    return true;
  }

  /**
   * Weghalen (besluit 136, aangevuld 15 oktober): wat nog speelt, laat de app
   * niet meer zien tot het voorbij is; wat al voorbij is, gaat uit de lijst.
   */
  verwijder(id: unknown): boolean {
    if (typeof id !== 'string') return false;
    if (this.#bestand.meldingen.some((m) => m.id === id && m.opgelostMs == null)) return this.negeer(id);
    const over = this.#bestand.meldingen.filter((m) => m.id !== id);
    if (over.length === this.#bestand.meldingen.length) return false;
    this.#bestand = { ...this.#bestand, meldingen: over };
    this.#vies = true;
    return true;
  }

  /** Naar het bestand als er iets veranderde; eerst ernaast, dan omwisselen. */
  async bewaar(): Promise<void> {
    if (!this.#vies) return;
    this.#vies = false;
    const tmp = `${this.#path}.nieuw`;
    await writeFile(tmp, `${JSON.stringify(this.#bestand)}\n`, 'utf-8');
    await rename(tmp, this.#path);
  }
}
