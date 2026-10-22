/*
 * De kamers voor Assist (besluit 184): wat de integratie van Smart Climate in
 * Home Assistant nodig heeft om de zinnen voor dit huis te schrijven. Per zone
 * de naam, en de namen van de kamers in de indeling die bij die zone horen
 * ("keuken" en "zithoek" bij de woonkamer), zodat "waarom is het zo warm in de
 * keuken" bij de goede zone uitkomt; en de zinnen zelf, met die kamers
 * erin. Geen entiteiten: alleen woorden.
 */

import { zinnenNl } from './zinnen.js';
import type { SiteConfig } from '../core/model.js';
import type { HouseReport } from './house.js';

export interface AssistKamer {
  /** De zone zoals de vraag hem noemt (`kamer=` bij /api/vraag). */
  readonly id: string;
  readonly naam: string;
  /** Andere woorden voor dezelfde kamer, in kleine letters. */
  readonly woorden: readonly string[];
}

export interface AssistInfo {
  readonly naam: 'Smart Climate';
  readonly versie: string | null;
  /** In welke talen de dienst antwoordt. */
  readonly talen: readonly string[];
  readonly kamers: readonly AssistKamer[];
  /** Het zinnenbestand per taal, voor `custom_sentences/<taal>/` (zinnen.ts); de integratie schrijft het weg. */
  readonly zinnen: Readonly<Record<string, Record<string, unknown>>>;
}

/** Een woord dat in een zin van Assist mag: zonder de tekens die daar iets betekenen. */
export const alsWoord = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[()[\]{}<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function assistKamers(config: SiteConfig, huis: HouseReport | null, versie: string | null): AssistInfo {
  const ruimtes = (huis?.etages ?? []).flatMap((e) => e.ruimtes);
  const kamers = config.zones.map((z) => {
    const naam = alsWoord(z.name);
    const woorden = new Set<string>();
    for (const w of [z.id.replace(/[_-]+/g, ' '), ...ruimtes.filter((r) => r.zoneId === z.id || r.meedoenMet?.zoneId === z.id).map((r) => r.naam)]) {
      const woord = alsWoord(w);
      if (woord && woord !== naam) woorden.add(woord);
    }
    return { id: z.id, naam: z.name, woorden: [...woorden].sort() };
  });
  return { naam: 'Smart Climate', versie, talen: ['nl', 'en'], kamers, zinnen: { nl: zinnenNl(kamers) } };
}
