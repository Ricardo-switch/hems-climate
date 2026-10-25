/**
 * Wat de bel elke minuut weet (besluit 136): uit het huis, de toestanden van
 * Home Assistant en de stand van de dienst de bron voor `MeldingenStore.bij`.
 *
 * Stond in `main.ts` (besluit 180, verder geknipt op 23 oktober 2026); hier
 * zuiver en daardoor te toetsen. Wat main erbij deed (bewaren, de telefoon, de
 * live-verbinding), doet main nog steeds.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';
import type { SiteConfig } from '../core/model.js';
import { NIEUW, VERSIE, eersteVan } from '../version.js';
import { eigenUpdate } from './bijwerken.js';
import type { HouseReport } from './house.js';
import type { MeldingenBron } from './meldingen.js';
import type { SluipBel } from './sluipverbruik.js';

export interface BronInvoer {
  readonly nu: number;
  readonly config: SiteConfig;
  readonly huis: HouseReport;
  readonly states: ReadonlyMap<string, HaEntityState>;
  /** In de add-on: dan telt een nieuwe versie van de add-on (21 oktober 2026). */
  readonly addOn: boolean;
  /** De panelen zijn gemeten en nog niet bevestigd (besluit 157). */
  readonly panelenVoorstel: boolean;
  readonly winterdagen: number | null;
  /** Wiens comfort er geldt, uit het laatste besluit (besluit 147). */
  readonly profiel: { readonly id: string; readonly name: string; readonly reason: 'thuis' | 'niemand' | 'gekozen' } | null;
  readonly hoofd: { readonly id: string; readonly naam: string } | null;
  /** Een nacht met opvallend sluipverbruik (besluit 192), of null. */
  readonly sluip?: SluipBel | null;
}

/** De bron voor de bel, of null als bijna alles tegelijk weg is: dan is Home Assistant zelf weg. */
export function meldingenBron(i: BronInvoer): MeldingenBron | null {
  const { config: cfg, huis: h, states: allStates } = i;
  const entiteit = (d: { id: string; actuatorId: string | null }) =>
    d.actuatorId ? (cfg.actuators.find((a) => a.id === d.actuatorId)?.ref.id ?? null) : d.id.includes('.') ? d.id : null;
  const volgen = h.etages.flatMap((e) =>
    e.ruimtes.flatMap((r) =>
      r.apparaten.map((d) => {
        const id = entiteit(d);
        const st = id ? allStates.get(id) : undefined;
        return { id: d.id, naam: d.naam, kamer: r.naam, kamerId: r.id, onbereikbaarSindsMs: st && st.state === 'unavailable' ? Date.parse(st.last_changed) : null };
      }),
    ),
  );
  // Is bijna alles tegelijk weg, dan is Home Assistant zelf weg; dat is geen melding per apparaat.
  const weg = volgen.filter((v) => v.onbereikbaarSindsMs != null).length;
  if (volgen.length > 4 && weg > volgen.length / 2) return null;
  const grid = cfg.power.gridPower;
  const gst = grid ? allStates.get(grid.id) : undefined;
  const nieuwste = NIEUW[0];
  return {
    nu: i.nu,
    zonderRuimte: h.zonderRuimte.map((d) => ({ id: d.id, naam: d.naam })),
    // Wat je zelf verborg, is niet weg uit Home Assistant (25 oktober 2026).
    verborgen: (h.verborgen ?? []).map((d) => d.id),
    volgen,
    batterijen: h.batterijen,
    filters: h.filters,
    // Een nieuwe versie van de add-on (21 oktober 2026).
    update: (() => {
      const s = i.addOn ? eigenUpdate(allStates.values()) : null;
      const n = s?.state === 'on' && typeof s.attributes['latest_version'] === 'string' ? (s.attributes['latest_version'] as string).replace(/^v/, '') : null;
      return n ? { nieuw: n, nu: VERSIE } : null;
    })(),
    // De rookmelders (21 oktober 2026): rook, een lege batterij, vervangen.
    rookmelders: h.etages.flatMap((e) => e.ruimtes.flatMap((r) => r.apparaten.filter((d) => d.soort === 'rookmelder' && d.rookmelder).map((d) => ({ id: d.id, naam: d.naam, kamer: r.naam, kamerId: r.id, gevaar: d.rookmelder!.gevaar, sindsMs: d.rookmelder!.sindsMs, batterijProbleem: d.rookmelder!.batterijProbleem, vervangenVoor: d.rookmelder!.vervangenVoor })))),
    drempels: h.drempels,
    meters: grid ? [{ id: grid.id, naam: 'De slimme meter', naamEn: 'The smart meter', laatsteMs: gst && gst.state !== 'unavailable' && gst.state !== 'unknown' ? Date.parse(gst.last_updated) : null }] : [],
    versie: { nummer: VERSIE, ...(nieuwste ? { eerste: eersteVan(nieuwste), eersteEn: nieuwste.en ? eersteVan(nieuwste.en) : '' } : {}) },
    // Hoe de panelen liggen (besluit 157): gemeten, en nog niet bevestigd.
    panelen: { voorstel: i.panelenVoorstel },
    sluip: i.sluip ?? null,
    winterdagen: i.winterdagen,
    // Wiens comfort er geldt (besluit 147), voor één melding bij een wissel.
    comfort: (() => {
      const p = i.profiel;
      const hoofd = i.hoofd;
      return p && hoofd ? { id: p.id, naam: p.name, waarom: p.reason, hoofdNaam: hoofd.naam, hoofd: p.id === hoofd.id } : null;
    })(),
  };
}
