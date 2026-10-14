/*
 * Het versienummer van Smart Climate (besluit 131), en wat er per versie nieuw
 * is, in gewone taal voor de app.
 *
 * Het eerste getal gaat omhoog bij een grote stap: 1.0 is de dag dat het huis
 * zelf regelt (stap B, besluit 64). Het tweede bij iets nieuws, het derde bij
 * een reparatie. Dit bestand is de bron: package.json van de dienst en van de
 * weergave hebben hetzelfde nummer, en een test houdt dat zo. Elke versie
 * krijgt in git een markering `v<nummer>`.
 */

export const VERSIE = '0.9.0';

export interface Nieuw {
  readonly versie: string;
  /** De dag van de versie, als YYYY-MM-DD. */
  readonly datum: string;
  /** Wat er nieuw is, kort en voor de bewoner; het belangrijkste eerst. */
  readonly punten: readonly string[];
}

/** De nieuwste versie eerst. */
export const NIEUW: readonly Nieuw[] = [
  {
    versie: '0.9.0',
    datum: '2026-10-14',
    punten: [
      'Een versienummer, en deze lijst met wat er nieuw is',
      'Elke kamer heet overal zoals in Indeling, ook in de zinnen van het huis',
      'Bij Comfort per dagdeel een schakelaar voor verwarmen en voor koelen',
      'De etages naast elkaar van beneden naar boven, onder elkaar zoals het huis staat',
      'De airco in de tekening op ware grootte, hoog en naast het raam',
      'Alle batterijen en filters zijn altijd te bekijken, ook als niets bijna leeg is',
    ],
  },
];
