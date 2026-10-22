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

export const VERSIE = '0.59.4';

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
  /**
   * Hetzelfde in het Engels (besluit 185), met evenveel regels per soort. Een
   * test eist het bij elke versie die de app laat zien; een oudere heeft het
   * niet, en daar toont de app het Nederlands.
   */
  readonly en?: Pick<Nieuw, 'nieuw' | 'beter' | 'opgelost'>;
}

/** Wat er nieuw is, in de taal van de app: de Engelse regels als die er zijn. */
export function nieuwInTaal(lijst: readonly Nieuw[], lang: 'nl' | 'en'): Omit<Nieuw, 'en'>[] {
  return lijst.map(({ en, ...n }) => (lang === 'en' && en ? { versie: n.versie, datum: n.datum, ...en } : n));
}

/** De eerste regel van een versie: wat nieuw is, anders wat beter is, anders wat opgelost is. */
export function eersteVan(n: Pick<Nieuw, 'nieuw' | 'beter' | 'opgelost'>): string {
  return n.nieuw?.[0] ?? n.beter?.[0] ?? n.opgelost?.[0] ?? '';
}

/** Zoveel versies terug laat de app zien (besluit 133). */
export const TERUGKIJKEN = 10;

/** De nieuwste versie eerst. Per versie kort en voor de bewoner, het belangrijkste eerst. */
export const NIEUW: readonly Nieuw[] = [
  {
    versie: '0.59.4',
    datum: '2026-10-22',
    beter: [
      'In het Engels nu ook Wat je huis kan, Kamers en indeling, Inrichten, het welkom en de film',
      'Een buitenruimte wordt ook aan een Engelse naam herkend, zoals garden of driveway',
    ],
    en: {
      beter: [
        'In English now too: What your house can do, Rooms and layout, Set up, the welcome and the film',
        'An outdoor space is also recognised by an English name, such as garden or driveway',
      ],
    },
  },
  {
    versie: '0.59.3',
    datum: '2026-10-22',
    beter: [
      'In het Engels nu ook Instellingen: Jij, Comfort, Regeling, Energie, Functies, en Bewoners en toegang',
      'Zoeken bij Instellingen vindt een instelling ook op Engelse woorden',
    ],
    opgelost: [
      'Een schermlezer noemt de QR-code bij Bewoners nu een afbeelding',
    ],
    en: {
      beter: [
        'In English now too: Settings, with You, Comfort, Control, Energy, Functions, and Residents and access',
        'Searching in Settings also finds a setting by English words',
      ],
      opgelost: [
        'A screen reader now calls the QR code in Residents an image',
      ],
    },
  },
  {
    versie: '0.59.2',
    datum: '2026-10-22',
    beter: [
      'In het Engels nu ook Kamer, Vandaag, Apparaten, Opbrengst en de Assistent; de assistent antwoordt in je taal',
    ],
    opgelost: [
      'Een test van de integratie in Home Assistant faalde soms, als Home Assistant de integratie nog aan het herladen was',
    ],
    en: {
      beter: [
        'In English now too: Room, Today, Devices, Energy and the Assistant; the assistant answers in your language',
      ],
      opgelost: [
        'A test of the integration in Home Assistant sometimes failed while Home Assistant was still reloading the integration',
      ],
    },
  },
  {
    versie: '0.59.1',
    datum: '2026-10-22',
    beter: [
      'In het Engels nu ook de meldingen, Onderhoud, het rookalarm, aanbellen en wat er nieuw is',
      'Thuis helemaal in het Engels: ook Aanpassen, de favorieten, de rondleiding en de wand als niemand kijkt',
    ],
    en: {
      beter: [
        'In English now too: the notifications, Maintenance, the smoke alarm, the doorbell and what is new',
        'Home entirely in English: also Customise, the favourites, the tour and the wall screen when nobody is looking',
      ],
    },
  },
  {
    versie: '0.59.0',
    datum: '2026-10-22',
    nieuw: [
      'Bij Jij kies je de taal: automatisch die van je account in Home Assistant, Nederlands of English. Engels is een proef: Thuis staat er al in, de rest volgt',
    ],
    beter: [
      'Een schermlezer bereikt de kamers in de tekening van het huis',
    ],
    en: {
      nieuw: [
        'In You you choose the language: automatically that of your Home Assistant account, Dutch or English. English is a trial: Home is already in it, the rest follows',
      ],
      beter: [
        'A screen reader can reach the rooms in the drawing of the house',
      ],
    },
  },
  {
    versie: '0.58.3',
    datum: '2026-10-22',
    opgelost: [
      'Een kamer zonder regeling en zonder losse meter, zoals de badkamer, toont weer zijn temperatuur: die van de thermostaat in de kamer',
      'Bij een open keuken met zones staat de keuken in de tekening onder de zone Keuken en de bank onder de andere, in plaats van altijd links de keuken',
      'Bij Sleutel voor de assistent zie je of de integratie ook is toegevoegd, en zo niet, waar je op Toevoegen en Verzenden klikt',
      'Assist kent ook de zones in een kamer, zoals de zithoek en de keuken: "hoe staat het met de zithoek" komt bij de goede regeling uit',
    ],
    en: {
      opgelost: [
        'A room without control and without its own meter, such as the bathroom, shows its temperature again: that of the thermostat in the room',
        'With an open-plan kitchen with zones, the drawing puts the kitchen under the Kitchen zone and the sofa under the other, instead of always the kitchen on the left',
        'Key for the assistant shows whether the integration has also been added, and if not, where to click Add and Submit',
        'Assist also knows the zones in a room, such as the seating area and the kitchen: "how is the seating area doing" reaches the right control',
      ],
    },
  },
  {
    versie: '0.58.2',
    datum: '2026-10-22',
    opgelost: [
      'Na een herstart van Home Assistant bleef de app hangen: het huis bleef laden, Instellingen leeg, de assistent bleef draaien',
      'In het lichte thema zie je weer welk woord de assistent nu uitspreekt',
      'De app ziet of Home Assistant de integratie geladen heeft, en vraagt niet voor niets om een herstart',
    ],
    en: {
      opgelost: [
        'After a restart of Home Assistant the app got stuck: the house kept loading, Settings stayed empty, the assistant kept spinning',
        'In the light theme you can see again which word the assistant is saying',
        'The app sees whether Home Assistant has loaded the integration, and does not ask for a restart for nothing',
      ],
    },
  },
  {
    versie: '0.58.1',
    datum: '2026-10-22',
    beter: ['De integratie voor Assist heeft een eigen versie: een update van Smart Climate vraagt geen herstart van Home Assistant meer', 'In de app staat hoe je de integratie in HACS vindt'],
    opgelost: ['Een tik op een melding op je telefoon opent Smart Climate, in plaats van een 404'],
    en: {
      beter: [
        'The integration for Assist has its own version: an update of Smart Climate no longer needs a restart of Home Assistant',
        'The app explains how to find the integration in HACS',
      ],
      opgelost: [
        'Tapping a notification on your phone opens Smart Climate, instead of a 404',
      ],
    },
  },
  {
    versie: '0.58.0',
    datum: '2026-10-22',
    nieuw: [
      'Assist van Home Assistant vraagt Smart Climate zonder YAML: de integratie Smart Climate, via HACS of met een knop in de app',
      'De add-on meldt zich vanzelf aan bij Home Assistant; de zinnen en de kamers van je huis houdt hij zelf bij',
    ],
    en: {
      nieuw: [
        'Assist in Home Assistant asks Smart Climate without YAML: the Smart Climate integration, via HACS or with a button in the app',
        'The add-on registers itself with Home Assistant; it keeps the sentences and the rooms of your house up to date itself',
      ],
    },
  },
  {
    versie: '0.57.0',
    datum: '2026-10-22',
    nieuw: [
      'Meldingen op je telefoon via de app van Home Assistant: rook en een haperende regeling meteen, batterij en een nieuwe versie overdag',
      'Bij Jij kies je wat je wilt horen, naar welke telefoon, en je nachtrust; met een proefmelding',
    ],
    en: {
      nieuw: [
        'Notifications on your phone through the Home Assistant app: smoke and a faltering control straight away, battery and a new version during the day',
        'In You you choose what you want to hear, on which phone, and your quiet hours; with a test notification',
      ],
    },
  },
  {
    versie: '0.56.0',
    datum: '2026-10-21',
    nieuw: [
      'Vier nieuwe kaarten voor Thuis: de auto, de batterij, deze maand en de deurbel',
      'De auto en de thuisbatterij bij Apparaten: hoe vol, en of ze laden of het huis voeden',
    ],
  },
  {
    versie: '0.55.2',
    datum: '2026-10-21',
    beter: [
      'Het lichte thema ook als je telefoon of tablet ligt; alleen het scherm aan de wand blijft donker',
      'Bij Jij gaan Kaarten en Favorieten elk meteen naar het aanpassen',
    ],
    opgelost: ['Favorieten sprongen na een paar tellen terug naar de eerste pagina'],
  },
  {
    versie: '0.55.1',
    datum: '2026-10-21',
    beter: [
      'De wand toont dezelfde kaarten en favorieten als je telefoon: één keer instellen',
      'Zes kleuren die beter uit elkaar liggen: lucht, framboos, zeegroen, violet, koper en grafiet',
      'In het licht een lichter huis, witte kaartjes op het huis en een lichte ring om de bewoners',
    ],
    opgelost: ['De knop Inrichten heeft zijn tekst weer in het midden'],
  },
  {
    versie: '0.55.0',
    datum: '2026-10-21',
    nieuw: [
      'Jij, bovenaan Instellingen: je kleur, licht of donker, je Thuis en je comfort op één plek',
      'Op de telefoon een licht thema, of zoals je telefoon het wil',
      'Een eigen kleur voor het menu, de keuzes en je naam; de wand toont de kleur, kaarten en favorieten van wie het comfort heeft',
    ],
    beter: ['Het getal bij de bel is beter te lezen'],
  },
  {
    versie: '0.54.0',
    datum: '2026-10-21',
    nieuw: ['Bij Wat je huis kan: wat er in Home Assistant klaar moet staan, wat er mist, en een tik naar dat scherm'],
  },
  {
    versie: '0.53.0',
    datum: '2026-10-21',
    nieuw: [
      'Bij Meters en prijzen eigen daluren, en geen salderen voor een huis buiten Nederland',
      'Wasmachines, drogers en vaatwassers van LG, Samsung en Miele kunnen op zon, naast die van Bosch en Siemens',
    ],
    beter: ['Het vermogen van een elektrische bron bij Indeling telt mee voor de hoofdzekering, ook als hij niet op zon mag'],
  },
  {
    versie: '0.52.0',
    datum: '2026-10-21',
    nieuw: [
      'Het wekwoord Hé huis zit in de add-on: herstart de openWakeWord-add-on één keer, en kies het bij de spraakassistent',
      'Bij Sleutel voor de assistent staat ook het adres waar Home Assistant zijn vraag stelt',
    ],
    beter: ['Een nieuwe melding, zoals een nieuwe versie, staat meteen bij de bel, op elk scherm'],
  },
  {
    versie: '0.51.0',
    datum: '2026-10-21',
    nieuw: ['Bij Comfort › Voorrang een lijst Op zon: zet de droger voor of na de kamers die op zon voorkoelen of opwarmen. Comfort gaat altijd voor'],
  },
  {
    versie: '0.50.1',
    datum: '2026-10-21',
    opgelost: ['Een lange titel bij Volgende, zoals "Sleutel voor de assistent", breekt op de telefoon af in plaats van dat het begin wegvalt'],
  },
  {
    versie: '0.50.0',
    datum: '2026-10-21',
    nieuw: ['Op je startscherm, bij Functies › Weergave: Smart Climate als app met zijn eigen icoon, of de stappen om dat te kunnen'],
    beter: [
      'Bij het kiezen van favorieten staan de gekozen bovenin als tegels, zoals op Thuis, en schuif je ze met een greep',
      'Een lamp vasthouden bij de favorieten opent op de telefoon meteen die lamp',
    ],
    opgelost: [
      'Een favoriet in een open ruimte noemt zijn zone in plaats van de hele ruimte',
      'Bij Bewoners op de telefoon staan thuis of weg en geldt nu onder de naam, niet eroverheen',
      'Iemand erbij: in Home Assistant wijst de QR-code naar Smart Climate in Home Assistant',
    ],
  },
  {
    versie: '0.49.0',
    datum: '2026-10-21',
    beter: [
      'Een lamp, scherm of beweging zie je meteen op Thuis en in de kamer, ook als je het in Home Assistant bedient',
      'Wie er thuis komt of weggaat, staat meteen bij de rondjes op Thuis',
    ],
    opgelost: ['Een verse installatie zei soms even "geen verbinding" terwijl die er wel was'],
  },
  {
    versie: '0.48.1',
    datum: '2026-10-21',
    opgelost: ['Een nieuwe versie staat nu ook op de wand als niemand kijkt; een tik geeft wat er nieuw is en Bijwerken'],
  },
  {
    versie: '0.48.0',
    datum: '2026-10-21',
    beter: [
      'Tabbladen openen sneller: wat niet veranderde, haalt de browser niet opnieuw op',
      'Op de telefoon via Tailscale gaat alles ingepakt, en het huis wordt maar één keer per verandering uitgerekend',
    ],
  },
  {
    versie: '0.47.1',
    datum: '2026-10-21',
    opgelost: ['Een kantoor, toilet of tuinhuis heet in een zin "het kantoor", niet "de kantoor"'],
  },
  {
    versie: '0.47.0',
    datum: '2026-10-21',
    nieuw: ['Staat er een nieuwe versie klaar, dan zegt Meldingen het. Een tik toont wat er nieuw is, met een knop Bijwerken'],
  },
  {
    versie: '0.46.1',
    datum: '2026-10-21',
    opgelost: ['Bij Comfort sleep je de temperatuur met het bolletje; een tik op de balk of ergens anders verschuift niets meer'],
  },
  {
    versie: '0.46.0',
    datum: '2026-10-21',
    nieuw: [
      'Twaalf favorieten, vier per pagina: schuif met de vinger. Screens en het zonnescherm kunnen er ook bij, en elke lamp heeft het icoon en de naam van zijn kamer',
      'Rookmelders, zoals de Nest Protect: ziet er een rook, koolmonoxide of hitte, dan staat het op elk scherm, en bij Meldingen waar en wanneer. Bij Onderhoud de batterij, de laatste test en wanneer vervangen',
      'De helderheid van het always-on display kies je zelf, overdag en in de avondstand',
      'De gevel opmeten op de kaart, bij Zon en aansluiting › Aanpassen',
    ],
    beter: [
      'Zeg "oké, bedankt" of "dat was het" en de assistent sluit af; alleen ruis telt niet meer als vraag',
      'De rondjes op Thuis volgen meteen wie er thuis is',
    ],
    opgelost: [
      'Het beeld bij aanbellen bleef soms zwart',
      'De wand toonde na een tijd "401: Unauthorized"',
      'Het scherm bleef ’s ochtends soms gedimd',
      'De radiator van een zolderkamer stak door het dak',
    ],
  },
  {
    versie: '0.45.0',
    datum: '2026-10-18',
    nieuw: ['Op Thuis een rondje per bewoner: wie thuis is licht op, en wie gevolgd wordt heeft een ring. Een tik en je kiest wiens comfort geldt'],
    beter: ['De grote kaart "Comfort van ..." is weg, en de wand begroet alleen wie thuis is'],
  },
  {
    versie: '0.44.0',
    datum: '2026-10-18',
    nieuw: ['Het always-on display heeft een dagstand en een avondstand, elk met een schakelaar en de tijden erbij'],
    beter: ['Favorieten kies je per kamer: de lampen eerst, de scènes ingeklapt eronder'],
    opgelost: ['In de winter begint de dagstand nu op tijd, niet pas bij zonsopkomst', 'De keuze voor de thermostaat bij Inrichten past weer'],
  },
  {
    versie: '0.43.0',
    datum: '2026-10-18',
    nieuw: [
      'Weergave bij Functies: dit scherm, het always-on display met een schakelaar, en wanneer het scherm uitgaat',
      'Buiten eigen soorten en zones, zoals achtertuin, carport, border en tuinhuis',
      'De Nest als thermostaat van de cv-ketel; een radiator gaat daarmee aan',
      'Licht en screens per kamer bij Functies, met een schakelaar om er een uit de app te halen',
      'Een tik op Automatisch legt de standen van het huis uit',
    ],
    beter: [
      'Op de wand zoveel kaarten als je wilt: de kolom schuift, met alleen een greep',
      'De droger staat tegen de muur, met de echte eindtijd',
      'Meten met en de regeling staan bij Verwarmen en koelen',
      'Inrichten blijft staan waar je was, en voegt ook een radiator toe',
      'Wie je bent staat bij Bewoners; het deel Inloggen is weg',
      '"Van je panelen" in plaats van "van je dak", en het percentage zelf gebruikt bij Opbrengst',
    ],
    opgelost: [
      'De droger zei nog "draait" terwijl hij al klaar was',
      'Apparaten op zon zijn weer uit te zetten',
      'Onderhoud bij de meldingen ziet nu ook een lege batterij',
      'De uitleg bij "Wat doet de regeling ermee?" liep over de volgende keuze',
    ],
  },
  {
    versie: '0.42.0',
    datum: '2026-10-18',
    nieuw: [
      'Een scherm aan de wand stel je in vanaf elk apparaat: volledig scherm en luisteren naar "Hé huis"',
      'Kamers verplaats je in het inrichten met pijltjes, of door ze in het huis te slepen',
      'Buiten een garage en een carport, en een tuinhuis dat je in het huis aantikt',
      'Op de wand pijltjes per kaart en "+ Kaart", ook voor Favorieten',
      'De droger op het always-on scherm, en "De droger draait" op Thuis',
    ],
    beter: [
      'Inrichten: apparaten los van verwarmen en koelen, alles per kamer in de stap zelf, buiten één lijst, bewoners om aan te tikken',
      'De assistent zegt één keer dat hij het niet begrijpt, met voorbeelden, en stopt daarna bij ruis; "app" klinkt als "ep"',
      'Panelen precies zoals ze liggen, op beide kanten',
    ],
    opgelost: [
      'Het weer van vandaag gaf de zon van morgen',
      'Huis en knoppen vielen op een breed scherm buiten beeld; de vraagbalk op de wand liep over',
      'Bewegingsgolven en de airco op zolder stonden buiten het huis',
      'Prijzen vielen half buiten hun vak',
    ],
  },
  {
    versie: '0.41.0',
    datum: '2026-10-18',
    beter: [
      'Always-on alleen op het scherm aan de wand: overdag de klok, het huis en het weer, na zonsondergang gedimd',
      "'s Nachts en als niemand thuis is gaat het scherm uit; beweging zet het weer aan, een tik of \"Hé huis\" opent de app",
      'In te stellen hoe lang het scherm aan blijft zonder beweging: 1, 5, 15 of 30 minuten',
    ],
  },
  {
    versie: '0.40.0',
    datum: '2026-10-18',
    nieuw: [
      'De wand als niemand kijkt: van bedtijd tot de ochtend een gedimde klok en een rustig huis, overdag na een paar minuten de klok, het huis en het weer',
      'Een tik, de bewegingsmelder, de deurbel of "Hé huis" wekt de wand',
      'Weergave: kies eenvoudig of uitgebreid, grotere letters en minder beweging, onderaan Thuis of achter het tandwiel',
    ],
  },
  {
    versie: '0.39.0',
    datum: '2026-10-18',
    beter: [
      'Instellingen op de telefoon: de onderdelen van een groep staan onder elkaar, niet meer in een rij om opzij te schuiven; een onderdeel opent als eigen scherm',
      'Onderaan elk onderdeel Vorige en Volgende, en wat nog mist staat bovenaan',
      'Op de wand grotere regels, en alles past zonder scrollen; de uitleg staat achter Waarvoor is dit?',
    ],
  },
  {
    versie: '0.38.0',
    datum: '2026-10-18',
    nieuw: [
      'Thuis aanpassen: schuif de kaarten op je telefoon in je eigen volgorde, verberg wat je niet nodig hebt en zet het weer van morgen erbij',
      'Favorieten: vier scènes of lampen met één tik op Thuis',
      'De wand past de hoofdgebruiker aan met het potlood bovenin, voor iedereen in huis',
    ],
  },
  {
    versie: '0.37.0',
    datum: '2026-10-18',
    nieuw: ['Smart Climate staat in Home Assistant bij iedereen in de zijbalk, niet alleen bij beheerders'],
    beter: [
      'Ook in Home Assistant stelt alleen een beheerder het huis, de energie en de functies in; een gast kijkt mee',
      'Bij Inloggen staat in Home Assistant wie je bent, en of je bewoner of beheerder bent',
    ],
  },
  {
    versie: '0.36.0',
    datum: '2026-10-18',
    nieuw: ['Smart Climate kan weer als losse app op je telefoon, met een eigen icoon: via een eigen poort van de add-on en Tailscale'],
  },
  {
    versie: '0.35.0',
    datum: '2026-10-18',
    nieuw: [
      'Op de telefoon staat de Assistent op Thuis altijd in beeld, boven de tabs; de microfoon ernaast luistert meteen',
      'Hoe voelt het nu?, Vandaag en het apparaat dat draait staan nu ook op de telefoon',
    ],
    beter: ['Thuis op de telefoon is rustiger: de knoppen bovenin op één regel, de stand naast de begroeting en de kamers in één kaart'],
  },
  {
    versie: '0.34.4',
    datum: '2026-10-18',
    beter: [
      'Op de telefoon ziet Smart Climate in Home Assistant er altijd uit als de app: met de statusbalk erboven, op elke pagina',
      'In de app van Home Assistant heeft de statusbalk de kleur van Smart Climate in plaats van grijs',
      'Bij wat er gevonden is in Inrichten staat waarom verwarmen en koelen geen × hebben',
    ],
    opgelost: ['Op de telefoon schuift elke pagina mee, waar je je vinger ook neerzet; in Inrichten ging dat alleen naast de kaart', 'De lucht loopt op de telefoon door tot onderaan de pagina'],
  },
  {
    versie: '0.34.3',
    datum: '2026-10-18',
    beter: [
      'Naar Home Assistant laat je in Smart Climate, met de zijbalk van Home Assistant erbij; dezelfde knop zet volledig scherm weer aan',
      'Op de telefoon staat die knop rechtsboven, naast het tandwiel',
    ],
  },
  {
    versie: '0.34.2',
    datum: '2026-10-18',
    opgelost: ['Volledig scherm op de telefoon is weer het hele scherm, zonder grijze balk bovenin'],
  },
  {
    versie: '0.34.1',
    datum: '2026-10-17',
    opgelost: [
      '"Hé huis" en de microfoon werken nu ook in Home Assistant',
      'Volledig scherm op de telefoon laat de statusbalk en de camera vrij, en de terugknop gaat een pagina terug',
      "Tussen twee pagina's in Home Assistant zie je de lucht, geen zwart scherm",
    ],
  },
  {
    versie: '0.34.0',
    datum: '2026-10-17',
    nieuw: [
      'Inrichten: kamers samenvoegen tot één ruimte met zones, zoals keuken en zithoek',
      'Inrichten: per deel aan of uit wat er rond je huis is, van oprit tot tuinhuis',
      'Inrichten: tik op een getal op het startscherm voor de lijst, en haal weg wat er niet bij hoort',
      'Prijzen: eerst je soort contract, met gas en wat je vanaf 2027 voor teruglevering krijgt en betaalt',
    ],
    beter: [
      'Inrichten heeft overal Terug en Volgende, en Volgende bewaart wat er staat',
      'De stappen bovenaan zeggen wat je al nagelopen hebt en wat al klaarstond',
      'Panelen: ook "geen panelen", en het aantal per kant van het dak',
      'Een los apparaat krijgt een kamer voorgesteld uit zijn naam',
      'Comfort voor het hele huis laat kamers met een eigen waarde zoals ze zijn',
      'Bij de eerste inlog zegt "Klopt iets niet?" waar je het verandert',
    ],
    opgelost: [
      '"Waar staan 1 dit apparaat?" is nu "Waar staat dit apparaat?"',
      'Het startscherm telt Buiten niet meer als etage',
      'Na het terugzetten van een back-up laadt de pagina vanzelf opnieuw',
    ],
  },
  {
    versie: '0.33.0',
    datum: '2026-10-17',
    nieuw: [
      'Smart Climate meet zelf hoe je panelen liggen: de richting, de helling en het vermogen, uit een heldere dag. Je bevestigt het bij Inrichten of Energie',
      'Bij panelen op twee kanten één vraag: wanneer schijnt de zon op de voorkant?',
    ],
    beter: [
      'Een nieuw huis heeft meteen de zon, het weer met opbrengst en de verwachting, eerst met een schatting',
      'De omvormer haalt Smart Climate uit Home Assistant; die hoef je niet op te zoeken',
    ],
  },
  {
    versie: '0.32.1',
    datum: '2026-10-17',
    beter: [
      'Onder de kop over één kamer staat hoe warm het er is en wat het doel is, in plaats van nog eens hetzelfde',
      'Een back-up terugzetten in Home Assistant neemt ook de configuratie mee, met je panelen',
    ],
    opgelost: ['Vandaag op Thuis toont de hele dag, ook op de eerste dag: wat er nog niet gemeten is, komt uit Home Assistant'],
  },
  {
    versie: '0.32.0',
    datum: '2026-10-17',
    nieuw: [
      'Volledig scherm in Home Assistant, per apparaat: zonder de zijbalk en de balken eromheen, bij Bewoners en toegang › Dit scherm',
      'Een knop boven de bel brengt je terug naar Home Assistant',
    ],
    opgelost: ['De muziek van de film blijft overal binnen de grens, ook bij de hardste tel'],
  },
  {
    versie: '0.31.0',
    datum: '2026-10-17',
    nieuw: [
      'Een welkom voor een leeg huis: je huis groeit uit wat Home Assistant kent, en met één knop ga je inrichten',
      'Een back-up van een eerdere installatie zet je meteen in het welkom terug',
    ],
    beter: [
      'De add-on opent de app, niet de cijfers',
      'Vragen bij het inrichten alleen waar Smart Climate echt niet kan kiezen, met de namen uit Home Assistant',
      'Wie voor het eerst via Home Assistant opent, wordt herkend als bewoner',
    ],
  },
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
    versie: '0.29.0',
    datum: '2026-10-17',
    nieuw: [
      'Praten met je stem: de wand luistert naar "Hé huis", met een laag over de pagina, een zacht tikje, en het antwoord hardop',
      'Na het antwoord luistert het huis nog vijf seconden, zodat je zonder "Hé huis" verder kunt praten',
      'Bij de Assistent een microfoonknop: tikken, praten, en het huis stopt vanzelf als je stil bent',
      'Bij Functies › Praten met je huis kies je de spraakassistent uit Home Assistant, en of dit scherm luistert',
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
    beter: ['Toch die van de hoofdgebruiker: het comfort terugzetten met één tik, tot er iemand thuiskomt of weggaat'],
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
      'Een kamer kan meedoen met de regeling van een andere kamer, zoals een slaapkamer met de airco in de kamer ernaast',
      'Vraag de assistent naar het weer van morgen, en wat je apparaten deze maand kostten',
    ],
    beter: [
      'De assistent antwoordt korter en warmer, en spreekt kilowattuur, tijden en "airco" uit zoals je ze zegt',
      'Vandaag: een airco die met de zon mee aan en uit gaat, is één regel',
    ],
    opgelost: [
      'Na een tik op Thuis praat de assistent meteen hardop',
      'Een kamer met een eigen regeling heeft zijn comfort weer terug',
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
