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

export const VERSIE = '0.20.1';

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
    versie: '0.20.1',
    datum: '2026-10-15',
    nieuw: ['Beweging: een bewegingsmelder laat in de kamer en in het huis zien als hij iemand ziet'],
    opgelost: ['Bewegingsmelders staan met hun batterij in de kamer'],
  },
  {
    versie: '0.20.0',
    datum: '2026-10-15',
    nieuw: [
      'De assistent praat: je huis begroet je, leest zijn antwoord voor en vraagt of het nog iets kan doen',
      'De stem is Piper, in je eigen Home Assistant; de bol leeft mee en de woorden komen mee',
      'Nieuwe vragen: wat deed je vandaag, en hoe warm is het overal',
    ],
    beter: ['Vragen die nu ergens over gaan, met het cijfer erbij', 'Zon en straks noemen wat er volgens het weer nog komt'],
    opgelost: ['Onderhoud op Thuis heeft een korte, leesbare tekst'],
  },
  {
    versie: '0.19.2',
    datum: '2026-10-15',
    opgelost: ['Apparaten vindt ook een kWh-meter die niet aan de airco zelf hangt'],
  },
  {
    versie: '0.19.1',
    datum: '2026-10-15',
    nieuw: ['Thuis begroet je: goedemorgen, goedemiddag of goedenavond'],
    beter: [
      'Onderhoud bovenin als een sleutel; een tik laat zien wat er te doen is',
      'Het getal bij de bel verdwijnt als je de meldingen hebt gezien',
      'De vraagbalk staat alleen onder het huis; de kaarten rechts krijgen meer ruimte',
    ],
  },
  {
    versie: '0.19.0',
    datum: '2026-10-15',
    nieuw: ['Apparaten laat per apparaat zien wat het nu doet en vraagt, en wat het vandaag op eigen zon deed'],
    beter: ['Wat nu iets doet, staat bovenaan', 'De grafiek van de dag staat alleen nog bij Vandaag'],
  },
  {
    versie: '0.18.1',
    datum: '2026-10-15',
    beter: ['Een schakelaar of sensor met een batterij staat bij de kamer, en een melding brengt je erheen'],
    opgelost: ['Vandaag toont de temperatuur van elke kamer met een regeling, niet maar twee'],
  },
  {
    versie: '0.18.0',
    datum: '2026-10-15',
    nieuw: ['De rondleiding: zeven stops door de app, met je eigen huis, en daarna het filmpje nog eens als je wilt'],
    beter: ['Het vraagteken op Thuis start de nieuwe rondleiding'],
  },
  {
    versie: '0.17.0',
    datum: '2026-10-15',
    nieuw: ['Het filmpje: hoe je huis leert, in een minuut, met je eigen huis en je eigen cijfers'],
    beter: ['Verwarmen in plaats van warmen'],
    opgelost: ['Gewone kamernamen krijgen weer "de", zoals "de badkamer"'],
  },
  {
    versie: '0.16.0',
    datum: '2026-10-15',
    nieuw: ['Inrichten op één pagina: links je huis dat meegroeit, rechts één vraag per stap'],
    beter: ['Wat Home Assistant al weet, staat klaar; jij kijkt of het klopt', 'Overslaan kan altijd; bij Klaar staat wat nog openstaat'],
  },
  {
    versie: '0.15.1',
    datum: '2026-10-15',
    opgelost: ['Bij Meet met staat een gewone naam, ook voor een sensor die het huis verder niet toont'],
  },
  {
    versie: '0.15.0',
    datum: '2026-10-15',
    nieuw: [
      'De regeling per kamer in de app: bij Indeling kies je per apparaat of het de kamer op temperatuur houdt, op zon helpt of alleen kijkt',
      'Een airco of thermostaat uit Home Assistant doet meteen mee, zonder herstart',
      'Bij Regeling per kamer wat er regelt, en welke kamers nog niet meedoen',
    ],
    beter: ['Bij Verwarmen en koelen staat bovenaan waarmee de kamer meet'],
  },
  {
    versie: '0.14.2',
    datum: '2026-10-15',
    beter: ['Een andere sensor bij Meten met telt meteen, zonder herstart'],
    opgelost: ['Meten met de airco of de thermostaat zelf telde niet mee: de kamer toont nu het gemiddelde'],
  },
  {
    versie: '0.14.1',
    datum: '2026-10-15',
    beter: [
      'Elke melding is weg te halen met het kruisje',
      'Een oude melding is weer aan te tikken: een versie toont opnieuw wat er nieuw was',
      'In de instellingen alleen nog een bolletje waar iets ontbreekt',
    ],
    opgelost: ['Onderhoud toont geen groen vinkje meer als een batterij bijna leeg is'],
  },
  {
    versie: '0.14.0',
    datum: '2026-10-15',
    nieuw: [
      'Verwacht naast echt: bij Gisteren hoeveel de panelen opwekten naast wat de dag ervoor werd verwacht',
      'Zo klopte de verwachting: de afgelopen twee weken per dag naast elkaar',
      'Bij Opbrengst verwacht naast opgewekt, per dag, week, maand en jaar',
    ],
    beter: ['Vandaag en Thuis zetten het opgewekte naast de verwachting', 'Het warmste moment staat niet meer over de naam van de kamer'],
  },
  {
    versie: '0.13.0',
    datum: '2026-10-15',
    nieuw: [
      'Meldingen: een bel in het menu, met een getal als er iets aandacht vraagt',
      'Een melding als iets nieuws in Home Assistant staat, iets niet meer reageert, een batterij of filter bijna op is, of de slimme meter niets meer levert',
      'Onderhoud: alle batterijen en filters, altijd te bekijken',
      'Na een update één keer: wat is er nieuw',
    ],
    beter: ['Wat vanzelf weer goed komt, schuift naar Eerder', 'Op de telefoon staat de stand bovenaan alleen als die niet automatisch is'],
    opgelost: ['Op de telefoon liep de kop van Thuis en een lange batterijmelding buiten het scherm'],
  },
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
      'Bij Indeling per kamer wat er verwarmt en koelt: radiator, vloerverwarming, infraroodpaneel, kachel of airco',
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
