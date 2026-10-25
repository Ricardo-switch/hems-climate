/*
 * De kaart Camera's (25 oktober 2026, besluit 201): de camera's die het huis
 * toont, elk met zijn beeld en een regel erbij. Bij de deurbel wanneer er het
 * laatst werd aangebeld; bij elke camera wat hij nu ziet (beweging, of wat hij
 * herkent: een persoon, een voertuig, een dier) of wanneer hij het laatst
 * iets zag. Alleen lezen.
 */
import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { BewegingSoort, Functies, FunctiesGevonden } from './functies.js';

export interface CameraNu {
  /** Het beeld dat de app toont. */
  readonly id: string;
  readonly naam: string;
  /** De andere beelden van dezelfde camera, als het eerste niets geeft. */
  readonly reserve: readonly string[];
  /** Of dit de camera van de deurbel is. */
  readonly deurbel: boolean;
  /** Wanneer er het laatst werd aangebeld; alleen bij de deurbel. */
  readonly aangebeldMs: number | null;
  /** Of de camera melders heeft; zonder zegt de kaart niets over beweging. */
  readonly melders: boolean;
  /** Wat hij nu ziet, het meest bijzondere eerst; null als er niets beweegt. */
  readonly nu: BewegingSoort | null;
  /** Sinds wanneer er nu beweging is. */
  readonly sindsMs: number | null;
  /** Wanneer hij het laatst iets zag, en wat. */
  readonly laatsteMs: number | null;
  readonly laatsteSoort: BewegingSoort | null;
}

/** Wat het zwaarst telt als er meer tegelijk is: een persoon gaat voor een dier, voor een voertuig, voor beweging. */
const GEWICHT: Readonly<Record<BewegingSoort, number>> = { persoon: 3, dier: 2, voertuig: 1, beweging: 0 };
/** Binnen zoveel tijd telt het als hetzelfde moment: dan wint wat de camera herkende. */
const ZELFDE_MS = 60_000;

/**
 * Wat er nu op elke camera te zien is. `laatsteAan`: per melder wanneer hij het
 * laatst aanging, uit de historie en wat de dienst sindsdien zag.
 */
export function camerasNu(
  f: Functies,
  g: FunctiesGevonden | null,
  states: ReadonlyMap<string, HaEntityState>,
  laatsteAan: ReadonlyMap<string, number>,
  aangebeldMs: number | null,
): CameraNu[] {
  const ids = [...(f.cameras.aan ? f.cameras.lijst : [])];
  const bel = f.deurbel.aan ? f.deurbel.camera : null;
  if (bel && !ids.includes(bel)) ids.unshift(bel);
  return ids.map((id) => {
    const groep = g?.cameras.find((c) => c.beelden.some((b) => b.id === id));
    const melders = groep?.melders ?? [];
    const aan = melders.filter((m) => states.get(m.id)?.state === 'on');
    const nu = aan.length ? aan.reduce((a, b) => (GEWICHT[b.soort] > GEWICHT[a.soort] ? b : a)) : null;
    const sinds = aan.map((m) => Date.parse(states.get(m.id)!.last_changed)).filter(Number.isFinite);
    const keren = melders.map((m) => ({ soort: m.soort, ms: laatsteAan.get(m.id) ?? null })).filter((x): x is { soort: BewegingSoort; ms: number } => x.ms != null);
    const laatste = keren.length ? Math.max(...keren.map((x) => x.ms)) : null;
    const soort = laatste == null ? null : keren.filter((x) => laatste - x.ms < ZELFDE_MS).reduce((a, b) => (GEWICHT[b.soort] > GEWICHT[a.soort] ? b : a)).soort;
    return {
      id,
      naam: groep?.naam ?? String(states.get(id)?.attributes['friendly_name'] ?? id),
      reserve: (groep?.beelden ?? []).filter((b) => b.id !== id).sort((a, b) => Number(b.voorkeur) - Number(a.voorkeur)).map((b) => b.id),
      deurbel: id === bel,
      aangebeldMs: id === bel ? aangebeldMs : null,
      melders: melders.length > 0,
      nu: nu?.soort ?? null,
      sindsMs: sinds.length ? Math.min(...sinds) : null,
      laatsteMs: laatste,
      laatsteSoort: soort,
    };
  });
}

/** Alle melders van de camera's die het huis toont, om hun historie op te halen en bij te houden. */
export function cameraMelders(f: Functies, g: FunctiesGevonden | null): string[] {
  const ids = new Set([...(f.cameras.aan ? f.cameras.lijst : []), ...(f.deurbel.aan && f.deurbel.camera ? [f.deurbel.camera] : [])]);
  return (g?.cameras ?? []).filter((c) => c.beelden.some((b) => ids.has(b.id))).flatMap((c) => (c.melders ?? []).map((m) => m.id));
}

/**
 * Wanneer elke melder het laatst aanging, uit `history/history_during_period`
 * met `minimal_response`: per entiteit een lijst met `s` (de stand) en `lc` of
 * `lu` (het moment, in seconden).
 */
export function laatsteAanUitHistorie(antwoord: unknown): Map<string, number> {
  const uit = new Map<string, number>();
  if (typeof antwoord !== 'object' || antwoord == null) return uit;
  for (const [id, rij] of Object.entries(antwoord as Record<string, unknown>)) {
    if (!Array.isArray(rij)) continue;
    for (const x of rij as Record<string, unknown>[]) {
      if (x?.['s'] !== 'on') continue;
      const t = typeof x['lc'] === 'number' ? x['lc'] : typeof x['lu'] === 'number' ? x['lu'] : null;
      if (t != null && t * 1000 > (uit.get(id) ?? 0)) uit.set(id, t * 1000);
    }
  }
  return uit;
}
