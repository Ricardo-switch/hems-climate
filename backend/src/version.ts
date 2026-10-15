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

export const VERSIE = '0.12.0';

export interface Nieuw {
  readonly versie: string;
  /** De dag van de versie, als YYYY-MM-DD. */
  readonly datum: string;
  /** Wat er nieuw bij kwam: een functie die er nog niet was. */
  readonly nieuw?: readonly string[];
  /** Wat beter werkt of er beter uitziet. */
  readonly beter?: readonly string[];
  /** Wat niet goed ging en nu wel. */
  readonly opgelost?: readonly string[];
}

/** Zoveel versies terug laat de app zien (besluit 133). */
export const TERUGKIJKEN = 10;

/** De nieuwste versie eerst. Per versie kort en voor de bewoner, het belangrijkste eerst. */
export const NIEUW: readonly Nieuw[] = [
  {
    versie: '0.12.0',
    datum: '2026-10-15',
    nieuw: [
      'Voorrang bij koelen en bij verwarmen apart, met een voorstel om mee te beginnen',
      'Hoe voelt het: na een tik meteen een antwoord, en na een paar keer hetzelfde een voorstel voor Comfort',
      'Wat het huis leerde: elke tik als een stip op de temperatuur van toen',
    ],
    beter: ['Hoe voelt het werkt zonder inlog, voor elke kamer, ook op de kamerpagina'],
  },
  {
    versie: '0.11.2',
    datum: '2026-10-15',
    opgelost: ['Een app die open bleef staan, liet na een update nog de oude versie zien; nu laadt hij vanzelf opnieuw'],
  },
  {
    versie: '0.11.1',
    datum: '2026-10-15',
    beter: ['Bij Versie staat alleen de nieuwste open, de rest ingeklapt, verdeeld in nieuw, beter en opgelost'],
  },
  {
    versie: '0.11.0',
    datum: '2026-10-15',
    nieuw: ['Per kamer kies je hoeveel verder het op zon mag, en of koelen ook van het net mag', 'Afwezig en vakantie hebben een eigen deel, per kamer'],
    beter: ['Bij Comfort per dagdeel een rustige regel voor verwarmen en voor koelen; een tik zegt wanneer het aan- en uitgaat', 'Op de balk het gele stuk: waar het op zon naartoe mag'],
  },
  {
    versie: '0.10.1',
    datum: '2026-10-15',
    beter: ['Zoeken vindt ook je kamers en je apparaten'],
    opgelost: ['Zoeken bij Instellingen vond meervoud en een deel van een woord niet, zoals "batterij"'],
  },
  {
    versie: '0.10.0',
    datum: '2026-10-15',
    nieuw: [
      'Bij Indeling per kamer wat er warmt en koelt: radiator, vloerverwarming, infraroodpaneel, kachel of airco',
      'Een elektrische bron met een vermogen mag opwarmen op zon',
      'Haal er meer uit: de drie beste ideeën voor je huis',
    ],
    beter: ['Wat Home Assistant al weet, staat er al; een thermostaat vraagt wat eraan hangt', 'Wat je huis kan zegt in welke kamers iets werkt'],
  },
  {
    versie: '0.9.0',
    datum: '2026-10-14',
    nieuw: ['Een versienummer, en deze lijst met wat er nieuw is', 'Alle batterijen en filters zijn altijd te bekijken, ook als niets bijna leeg is'],
    beter: [
      'Elke kamer heet overal zoals in Indeling, ook in de zinnen van het huis',
      'Bij Comfort per dagdeel een schakelaar voor verwarmen en voor koelen',
      'De etages naast elkaar van beneden naar boven, onder elkaar zoals het huis staat',
    ],
    opgelost: ['De airco in de tekening was te groot en hing voor het raam'],
  },
];
