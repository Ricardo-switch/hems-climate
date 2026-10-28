/*
 * De standaard voor een nieuw huis (28 oktober 2026, besluit 204): zuinig,
 * zoals energieadvies vaak aanraadt, en niet die van het huis waar Smart
 * Climate begon. Eén plek, zodat de basisregels, een kamer die er later bij
 * komt, Inrichten en "terug naar standaard" in de app hetzelfde zeggen.
 *
 * Een huis dat zijn eigen waarden in zijn bestand of in de app heeft staan,
 * merkt hier niets van: dit vult alleen aan wat er nog niet is.
 */

/** Verwarmen tot, per dagdeel. Voorverwarmen staat een graad onder de dag: het huis is dan al op weg. */
export const STANDAARD_WARM = { dag: 20, nacht: 16, voorverwarmen: 19, afwezig: 15, vakantie: 12 } as const;

/**
 * Koelen vanaf, per dagdeel. Standaard koelt een kamer alleen overdag; wie
 * koelen in een ander dagdeel aanzet, begint bij deze waarde.
 */
export const STANDAARD_KOEL = { dag: 25, nacht: 25, afwezig: 27, vakantie: 28 } as const;

/** De dagdelen: voorverwarmen vanaf 6:00, de dag vanaf 7:00, de nacht vanaf 22:00. */
export const STANDAARD_DAGDELEN = { voorverwarmen: 6, dag: 7, nacht: 22 } as const;

/** "Nooit warmer dan", als je dat aanzet: zoveel graden boven koelen overdag. */
export const STANDAARD_PLAFOND_BOVEN = 2;

/** Wat een kamer krijgt die verwarmt, koelt of allebei. */
export function standaardKamer(warm: boolean, koel: boolean): Record<'dag' | 'nacht' | 'afwezig' | 'vakantie', { heat: number | null; cool: number | null }> {
  return {
    dag: { heat: warm ? STANDAARD_WARM.dag : null, cool: koel ? STANDAARD_KOEL.dag : null },
    nacht: { heat: warm ? STANDAARD_WARM.nacht : null, cool: null },
    afwezig: { heat: warm ? STANDAARD_WARM.afwezig : null, cool: null },
    vakantie: { heat: warm ? STANDAARD_WARM.vakantie : null, cool: null },
  };
}
