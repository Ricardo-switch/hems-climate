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

export const VERSIE = '0.30.0';

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
    versie: '0.30.0',
    datum: '2026-10-17',
    nieuw: [
      'Een back-up van je instellingen, en weer terugzetten, bij Bewoners en toegang › Je gegevens',
      'Opnieuw beginnen met een leeg huis, alleen door de hoofdgebruiker en met eerst een back-up',
      'Het logboek voor onderzoek, zonder namen en zonder ligging, met alle apparaten en wat Smart Climate ermee doet',
    ],
    beter: [
      'Wie zonder persoon in Home Assistant inlogt, kijkt eerst mee als gast; de hoofdgebruiker maakt er een bewoner van',
      'Een gast ziet geen instellingen meer die hij toch niet kan veranderen',
    ],
  },
  {
    versie: '0.28.0',
    datum: '2026-10-17',
    nieuw: [
      'Bij Functies › Meldingen kies je wanneer een batterij of een airco-filter een melding geeft: onder 5, 10, 20 of 30%, of nooit',
      'Een scherm zoals de wand beheer je bij Bewoners: een andere naam geven, of weghalen',
    ],
    opgelost: ['Een tweede bewoner kan weer een eigen comfort kiezen, ook als er een kamer uit de regeling ging'],
  },
  {
    versie: '0.27.1',
    datum: '2026-10-16',
    beter: [
      'Proberen bij Praten met je huis zegt hoe lang het taalmodel erover deed, en waarom het niet lukte',
      'Is het gratis gebruik van het taalmodel op, of heeft het het te druk, dan hoor je meteen het vaste antwoord, zonder te wachten',
    ],
    opgelost: ['De assistent wacht nu vijf seconden op het taalmodel in plaats van drie'],
  },
  {
    versie: '0.27.0',
    datum: '2026-10-16',
    nieuw: [
      'Lampen, scènes en schermen bedien je met een zin bij de Assistent, zoals "doe het licht beneden wat zachter" of "screen dicht"',
      'Terwijl een scherm beweegt, stopt "Stop het screen" het scherm en "Stil" het praten; "stop" typen kan ook',
      'Bij Functies › Praten met je huis kies je een taalmodel uit Home Assistant: dan zegt de assistent het in eigen woorden',
    ],
    beter: ['Onder het antwoord staat wat er veranderde, zoals "40%, plafonnière, was 80%", met wat je daarna kunt doen'],
    opgelost: [
      'Een garagedeur, poort of deur staat niet meer als scherm in de app, en gaat dus nooit met een knop open',
      'Bij Bewoners staan alleen nog je eigen persoon in Home Assistant en sensors om uit te kiezen, geen andere mensen',
    ],
  },
  {
    versie: '0.26.0',
    datum: '2026-10-16',
    nieuw: ['Een gast: kijkt mee, en bedient licht en screens alleen als hij thuis is; van een gast wordt niets bewaard'],
    opgelost: [
      'Na het inloggen bij Home Assistant kom je weer echt binnen, in plaats van terug bij het inloggen',
      'Wie al ingelogd was, kiest bij de eerste pagina of hij hier woont of een scherm is',
      'Een tablet met een persoon in Home Assistant kan op het welkom "Dit is een scherm" kiezen',
      'Bij Bewoners staan alleen wie in de app inlogde, niet iedereen uit Home Assistant',
    ],
  },
  {
    versie: '0.25.0',
    datum: '2026-10-16',
    nieuw: [
      'Comfort per bewoner: wie het eerst op de lijst thuis is, bepaalt het comfort; de hoofdgebruiker staat bovenaan',
      'Het huis begroet je met je naam; de wand begroet wie er thuis is',
      'Bij Instellingen › Bewoners en toegang: de volgorde, je naam, wat je volgt en je eigen comfort',
      'De hele app vraagt een inlog; wie voor het eerst inlogt, kiest of hij hier woont of een scherm is',
    ],
    beter: ['Toch die van Ricardo: het comfort terugzetten met één tik, tot er iemand thuiskomt of weggaat'],
  },
  {
    versie: '0.24.2',
    datum: '2026-10-16',
    beter: [
      'Bij Inrichten kies je per apparaat Op temperatuur, Op zon of Kijkt mee',
      'Buiten: eerst wat een ruimte is, en daarna met een schakelaar of er een tuinhuis of auto bij hoort',
    ],
    opgelost: [
      'Lijsten schuiven weer met de vinger op de tablet, ook bij Indeling; slepen kan zijwaarts',
      'De zon staat in de tekening weer op zijn lijn',
      'Straks op Thuis en de assistent vertellen hetzelfde',
      'De assistent zegt ook achtergevel goed',
      'Een camerabeeld stopt nu altijd als je wegtikt, ook als je heel snel wegtikt',
    ],
  },
  {
    versie: '0.24.1',
    datum: '2026-10-16',
    opgelost: ['De muziek van de film kan niet meer kraken'],
  },
  {
    versie: '0.24.0',
    datum: '2026-10-16',
    nieuw: ['De film is een dag in je huis: de zon komt op, zes beelden met je eigen cijfers, en muziek die opbouwt'],
    beter: ['Inrichten zoals de schets: zes hoofdstukken bovenaan, knoppen naast elkaar, en de prijzen en de zekering in vakken'],
  },
  {
    versie: '0.23.1',
    datum: '2026-10-16',
    beter: [
      'Bij Indeling krijgt een zone een soort, zoals zithoek of keuken, en die komt in de tekening',
      'Kamers en zones schuif je naar links of rechts',
    ],
    opgelost: [
      'Een screen of zonnescherm zegt alleen "zon" als de zon op zijn eigen gevel staat; kies de gevel bij Indeling',
      'Een bewegingsmelder heeft zijn eigen icoon, ook als hij de temperatuur meet',
      'De assistent zegt voorgevel met een lange e, niet als voorge-vel',
    ],
  },
  {
    versie: '0.23.0',
    datum: '2026-10-16',
    nieuw: [
      'Inrichten loopt nu langs alles: buiten, welke thermometer telt, de zekering, je prijzen, licht en camera\'s, en inloggen op de wand',
      'Een nieuwe film van twintig tellen, met de cijfers van je eigen huis',
    ],
    beter: ['De rondleiding komt langs alle tabbladen en een kamer'],
    opgelost: ['Een sensor zonder naam in Home Assistant krijgt een leesbare naam'],
  },
  {
    versie: '0.22.0',
    datum: '2026-10-16',
    nieuw: ['Het huis heeft een voordeur met de deurbel, de meterkast, de camera op de oprit, de tuin met de border en het terras'],
    beter: ['Buitenunits en witgoed op ware grootte, en namen van kamers die binnen hun muren passen'],
    opgelost: [
      'Wat je bij Comfort instelt, geldt nu ook echt; de oude helpers in Home Assistant gingen voor',
      'De kosten noemen je apparaten zoals in de app',
    ],
  },
  {
    versie: '0.21.0',
    datum: '2026-10-15',
    nieuw: [
      'Een kamer kan meedoen met de regeling van een andere kamer, zoals een slaapkamer met de airco in de wasruimte',
      'Vraag de assistent naar het weer van morgen, en wat je apparaten deze maand kostten',
    ],
    beter: [
      'De assistent antwoordt korter en warmer, en spreekt kilowattuur, tijden en "airco" uit zoals je ze zegt',
      'Vandaag: een airco die met de zon mee aan en uit gaat, is één regel',
    ],
    opgelost: [
      'Na een tik op Thuis praat de assistent meteen hardop',
      'De wasruimte heeft zijn eigen regeling en comfort terug',
      'Opbrengst: zelf gebruikt en teruggeleverd tellen precies op tot wat je panelen opwekten',
      'Een afgeknipte zin, een dubbel doel, en de maan die op de telefoon over de tekst viel',
    ],
  },
  {
    versie: '0.20.2',
    datum: '2026-10-15',
    opgelost: ['De assistent spreekt Nederlands: met een Nederlandse stem van Piper, of anders die van het apparaat'],
  },
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
