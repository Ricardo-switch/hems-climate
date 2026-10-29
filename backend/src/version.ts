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

export const VERSIE = '0.82.0';

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
    versie: '0.82.0',
    datum: '2026-10-29',
    nieuw: [
      '"Het is koud in de woonkamer" maakt het nu echt warmer: de assistent zet de dagtemperatuur van je eigen regeling een graad hoger, tot 22:00, en daarna weer terug. Aan te zetten bij Functies › Praten',
    ],
    beter: ['\'s Nachts zet de assistent de verwarming eerst weer aan; je eigen timer zet hem na twee uur terug'],
    en: {
      nieuw: [
        '"It is cold in the living room" now really makes it warmer: the assistant raises the day temperature of your own control by one degree until 22:00, then sets it back. Turn it on under Features › Talking to your house',
      ],
      beter: ['At night the assistant first turns the heating back on; your own timer sets it back after two hours'],
    },
  },
  {
    versie: '0.81.0',
    datum: '2026-10-29',
    nieuw: [
      'Zeg wat je voelt: "het is donker in de keuken" doet het licht aan, "het is hier zo fel" dimt het, en "het is koud in de woonkamer" begrijpt het huis als verwarmen',
      'Licht dat bij het moment past: overdag helder, \'s avonds warm, \'s nachts zacht',
      '\'s Avonds vraagt het huis of je de sfeerverlichting wilt',
    ],
    beter: [
      'Zijn er twee screens of meer kamers, dan vraagt het huis welke ("klein of groot?") en begrijpt het "de grote"; tikken op een keuze kan ook',
      'De assistent kent de delen van een kamer, zoals de zithoek',
    ],
    en: {
      nieuw: [
        'Say how it feels: "it is dark in the kitchen" turns the light on, "it is too bright here" dims it, and "it is cold in the living room" is understood as heating',
        'Light that suits the moment: bright during the day, warm in the evening, soft at night',
        'In the evening the house asks whether you would like the mood lighting',
      ],
      beter: [
        'With two screens or several rooms, the house asks which one ("small or large?") and understands "the large one"; you can also tap a choice',
        'The assistant knows the parts of a room, such as the seating area',
      ],
    },
  },
  {
    versie: '0.80.0',
    datum: '2026-10-29',
    nieuw: [
      'Stel per scherm in hoe gevoelig "Hé huis" is: de app hoort het wekwoord nu zelf, en Functies › Praten zegt hoe vaak het huis vandaag wakker werd',
      'Kies hoe lang het huis wacht na je laatste woord: Vlot, Normaal of Rustig',
    ],
    beter: [
      'Hoort het huis "Hé huis" maar komt er geen vraag, dan sluit het stil, zonder "niet verstaan"',
      'Een halve zin ("zet de lamp in de …") wacht op de rest, in plaats van meteen te antwoorden',
    ],
    opgelost: ['Het huis antwoordde soms al voordat je uitgesproken was'],
    en: {
      nieuw: [
        'Set per screen how sensitive "Hé huis" is: the app now hears the wake word itself, and Features › Talking to your house shows how often the house woke up today',
        'Choose how long the house waits after your last word: Quick, Normal or Relaxed',
      ],
      beter: [
        'If the house hears "Hé huis" but no question follows, it closes quietly instead of saying it did not understand',
        'Half a sentence ("turn on the …") waits for the rest instead of being answered straight away',
      ],
      opgelost: ['The house sometimes answered before you had finished speaking'],
    },
  },
  {
    versie: '0.79.3',
    datum: '2026-10-29',
    nieuw: ['Het always-on display toont overdag de baan van de zon rond het huis, met een stip per uur'],
    en: {
      nieuw: ['The always-on display shows the path of the sun around the house during the day, with a dot for each hour'],
    },
  },
  {
    versie: '0.79.2',
    datum: '2026-10-29',
    nieuw: [
      'Vraag de assistent of er iemand thuis is, hoeveel er vandaag terugging naar het net, of de droger nog draait',
    ],
    beter: [
      'Wat kost de stroom? noemt eerst het hele huis deze maand, met het gas en de vaste kosten, en dan de apparaten met een meter',
      'De borderverlichting gloeit zachter, alleen in de border zelf',
    ],
    opgelost: [
      'Zet de airco aan zegt wat hij zou doen en dat schakelen nog niet mag, in plaats van hoe het nu staat; zonder kamer vraagt hij welke',
    ],
    en: {
      nieuw: [
        'Ask the assistant whether anyone is home, how much went back to the grid today, or whether the dryer is still running',
      ],
      beter: [
        'What does electricity cost? first gives the whole house this month, with gas and the fixed costs, then the devices with a meter',
        'The border lights glow more softly, only in the border itself',
      ],
      opgelost: [
        'Turn on the air conditioner says what it would do and that it may not switch yet, instead of how things are now; without a room it asks which',
      ],
    },
  },
  {
    versie: '0.79.1',
    datum: '2026-10-29',
    opgelost: [
      'De film toont bij Je apparaten weer de temperatuur in het rondje, en is ook in het lichte thema goed te lezen',
      'De assistent kent de woonkamer ook als huiskamer of living room en de zolder als attic, en zegt een onbekende kamer zonder sfeerzinnetje erachter',
    ],
    en: {
      opgelost: [
        'The film shows the temperature in the ring at Your devices again, and is easy to read in the light theme too',
        'The assistant also knows the living room and the attic by those names, and says an unknown room without a friendly sentence after it',
      ],
    },
  },
  {
    versie: '0.79.0',
    datum: '2026-10-29',
    nieuw: [
      'Sluipverbruik: tik op een staaf voor die nacht of maand, met hoeveel het boven of onder je gewone nacht lag',
      'Sluipverbruik ziet het ook als het vaak meer is maar niet elke nacht, zoals hier sinds augustus; wat je zegt dat het is, blijft gelden',
      'De wand in Fully Kiosk: de camera van de wand wekt het scherm, en bij Functies › Scherm uit zie je of het werkt',
    ],
    beter: [
      'Buiten heeft elk deel en elke zone een vaste plek: geen Naar links en Naar rechts meer, en Weghalen in plaats van Kamer weghalen',
      'Een lamp die uit is, toont de helderheid niet meer vol, en geen scène als gekozen',
      'Apparaten zegt het niet meer twee keer: geen "Verwarmen naar 20°" onder "Verwarmen naar 20°"',
      'Hoe voelt het nu? begint bij de kamer beneden, en de pagina’s laden sneller doordat ze niets dubbel ophalen',
    ],
    opgelost: [
      'Zet Fully Kiosk het scherm aan, dan staat de klok erop in plaats van een zwarte pagina; zonder bewegingsmelder staat er niet meer dat beweging het scherm aanzet',
      'Waarom een kamer met alleen een airco op zon wacht: omdat die alleen op zon verwarmt of koelt, niet "omdat het er kouder is dan het doel"',
      'Een kamer opent ook op de naam van zijn regeling, en anders de kamer beneden in plaats van de zolder',
    ],
    en: {
      nieuw: [
        'Standby use: tap a bar for that night or month, with how far it was above or below your usual night',
        'Standby use also notices when it is often higher but not every night, as here since August; what you say it is keeps counting',
        'The wall screen in Fully Kiosk: the camera of the wall screen wakes it, and Features › Screen off shows whether it works',
      ],
      beter: [
        'Outside, each part and each zone has a fixed place: no more To the left and To the right, and Remove instead of Remove room',
        'A light that is off no longer shows full brightness, nor a scene as chosen',
        'Devices no longer says things twice: no "Heating to 20°" under "Heating to 20°"',
        'How does it feel? starts with the room downstairs, and pages load faster because nothing is fetched twice',
      ],
      opgelost: [
        'When Fully Kiosk turns the screen on, the clock shows instead of a black page; without a motion sensor it no longer says movement turns the screen on',
        'Why a room with only an air conditioner on sun waits: because it only heats or cools on sun, not "because it is colder than the target"',
        'A room also opens by the name of its zone, and otherwise the room downstairs instead of the attic',
      ],
    },
  },
  {
    versie: '0.78.1',
    datum: '2026-10-28',
    beter: [
      'Licht buiten is goed te zien: de border kleurt over de hele lengte mee, het tuinhuis straalt naar buiten en de spots onder het overstek geven een plas licht',
      'Wat is er rond je huis?: alleen aanvinken, het komt op zijn vaste plek; bij elk deel een knop naar zijn lampen en zones',
      'Bij de zones staat hoe je een lamp in een zone zet, en het blad buiten heeft er een link naar',
    ],
    opgelost: [
      'Een lamp buiten schakelen slaat meteen om, ook in het huis; eerst wachtte de schakelaar op de lamp',
    ],
    en: {
      beter: [
        'Outdoor light is easy to see: the border lights up along its whole length, the shed glows outward and the canopy spots cast a pool of light',
        'What is around your house?: just tick it, it goes in its fixed place; for each part a button to its lights and zones',
        'The zones explain how to put a light in a zone, and the outdoor sheet links to it',
      ],
      opgelost: [
        'Switching an outdoor light flips at once, in the house too; before, the switch waited for the light',
      ],
    },
  },
  {
    versie: '0.78.0',
    datum: '2026-10-28',
    nieuw: [
      'Buiten op Thuis: een tik op de oprit, de garage of een zone in de tuin opent een blad met de lampen, en je blijft op Thuis',
      'Alles buiten: elk deel aan of uit, en alles buiten uit in één keer, met de knop Buiten op de wand',
      'De tuin in zones: de border, het terras, het gazon en het tuinhuis met zijn overstek, elk aan te tikken',
    ],
    beter: [
      'De lampen in de border staan op hun plek in hun eigen kleur; het terras en het overstek lichten op',
      'Bij de oprit de auto aan de lader, en de garagedeur open of dicht (alleen bekijken)',
      'De helderheid van het always-on display met een schuif van 0 tot 100, standaard 75 overdag en 25 in de avond',
      'De helling van het dak vul je precies in bij Zonnepanelen › Zelf aanpassen',
    ],
    opgelost: [
      'De baan van de zon uit bij Weergave haalt nu ook de stippelboog op Thuis weg; eerst veranderde daar niets',
    ],
    en: {
      nieuw: [
        'Outside on Home: tap the driveway, the garage or a garden zone to open a sheet with its lights, and you stay on Home',
        'Everything outside: each part on or off, and everything outside off at once, with the Outside button on the wall',
        'The garden in zones: the border, the patio, the lawn and the shed with its canopy, each one tappable',
      ],
      beter: [
        'The border lights are drawn where they are, in their own colour; the patio and the canopy light up',
        'At the driveway the car on the charger, and the garage door open or closed (view only)',
        'The brightness of the always-on display with a slider from 0 to 100, by default 75 by day and 25 in the evening',
        'Enter the exact roof pitch in Solar panels › Adjust yourself',
      ],
      opgelost: [
        'Turning off the path of the sun in Display now also removes the dotted arc on Home; before, nothing changed there',
      ],
    },
  },
  {
    versie: '0.77.0',
    datum: '2026-10-28',
    nieuw: [
      'Bij Zonnepanelen staat de echte zon, met een ring van de dag rond het huis: elk uur een stip, en de tijd van opkomst en ondergang',
      'Zonnepanelen › Zelf aanpassen: kies of de nok langs of haaks op de straat loopt',
      'Jij › Weergave: de baan van de zon aan of uit',
    ],
    beter: [
      'Het dak volgt je huis: met de nok langs de straat liggen de panelen op de voorkant, en het dak is zo steil als gemeten',
      'Het kompas draait met de voorgevel, en op Thuis staat de zon aan de goede kant',
    ],
    en: {
      nieuw: [
        'Solar panels shows the real sun, with a ring of the day around the house: a dot every hour, and the time of sunrise and sunset',
        'Solar panels › Adjust yourself: choose whether the ridge runs along or at right angles to the street',
        'You › Display: the path of the sun on or off',
      ],
      beter: [
        'The roof follows your house: with the ridge along the street the panels are on the front, and the roof is as steep as measured',
        'The compass turns with the front of the house, and on Home the sun is on the right side',
      ],
    },
  },
  {
    versie: '0.76.0',
    datum: '2026-10-28',
    nieuw: [
      'Terug naar standaard: bij een kamer en voor het hele huis in Comfort, bij elk onderdeel van Functies, en bij Jij voor het uiterlijk en de kaarten',
    ],
    beter: [
      'Een nieuw huis begint zuinig: 20° overdag, 16° \'s nachts, weg 15°, koelen vanaf 25°, de dag vanaf 7:00',
      'Comfort en Inrichten blijven binnen wat de apparaten van een kamer kunnen; eerst werd het hele comfort dan geweigerd',
    ],
    en: {
      nieuw: [
        'Back to default: for a room and for the whole house in Comfort, for every part of Features, and in You for the look and the cards',
      ],
      beter: [
        'A new house starts economical: 20° during the day, 16° at night, away 15°, cooling from 25°, the day from 7:00',
        'Comfort and Set up stay within what the devices in a room can do; before, the whole comfort was refused',
      ],
    },
  },
  {
    versie: '0.75.0',
    datum: '2026-10-28',
    nieuw: [
      'Praten werkt meteen met de stem van je telefoon of tablet: hij leest voor en verstaat je via de browser, zonder iets te installeren',
      'Helemaal in huis: Inrichten zet Whisper, Piper en openWakeWord op een rij, en één knop maakt de spraakassistent',
      'Inrichten heeft een stap Hoe praat je huis?, en Functies › Praten de keuze waar de stem vandaan komt',
    ],
    beter: [
      'Op je startscherm staat bij Functies onder Gevorderd: de app van Home Assistant is de gewone weg',
    ],
    opgelost: [
      'Op de telefoon kun je bij een kamer vanuit elke etage naar elke andere; de lucht van het huis lag over de knoppen',
      'Bij sluipverbruik op de telefoon staat het hele getal op de as, ook boven de 1.000 W',
      'Inrichten op de telefoon: geen welkom meer onder elke stap, en Terug, Later en Volgende blijven onderin',
    ],
    en: {
      nieuw: [
        'Talking works right away with the voice of your phone or tablet: it reads aloud and understands you through the browser, with nothing to install',
        'Entirely at home: Set up lists Whisper, Piper and openWakeWord, and one button makes the voice assistant',
        'Set up has a step How does your house talk?, and Features › Talking the choice where the voice comes from',
      ],
      beter: [
        'On your home screen is now under Advanced in Features: the Home Assistant app is the usual way',
      ],
      opgelost: [
        'On the phone you can go from every floor to every other floor in a room; the sky of the house lay over the buttons',
        'Standby use on the phone shows the whole number on the axis, also above 1,000 W',
        'Set up on the phone: no welcome below every step any more, and Back, Later and Next stay at the bottom',
      ],
    },
  },
  {
    versie: '0.74.0',
    datum: '2026-10-28',
    nieuw: [
      'De assistent gaat vanzelf aan bij Inrichten › Klaar, terwijl de film speelt: de koppeling erin, Home Assistant herstart, Smart Climate toegevoegd; daarna begint de rondleiding. Bij Toegang met één knop',
      'Inrichten heeft een stap Een eigen account voor de wand: waarom, en hoe je het maakt',
    ],
    beter: [
      'In de app van Home Assistant staat Smart Climate meteen over het hele scherm; de rondleiding wijst de knop terug naar Home Assistant aan',
    ],
    en: {
      nieuw: [
        'The assistant turns on by itself at Set up › Done, while the film plays: the integration goes in, Home Assistant restarts, Smart Climate is added; then the tour begins. In Access with one button',
        'Set up has a step Its own account for the wall: why, and how to make it',
      ],
      beter: [
        'In the Home Assistant app, Smart Climate now opens full screen; the tour points out the button back to Home Assistant',
      ],
    },
  },
  {
    versie: '0.73.1',
    datum: '2026-10-25',
    nieuw: [
      'Bij de bel een melding als een apparaat uit Home Assistant verdwijnt, net als bij een nieuw apparaat; wat je zelf verbergt telt niet, en komt het terug, dan gaat de melding weg',
    ],
    en: {
      nieuw: [
        'The bell now also tells you when a device disappears from Home Assistant, just like a new device; what you hide yourself does not count, and if it comes back the notification goes away',
      ],
    },
  },
  {
    versie: '0.73.0',
    datum: '2026-10-25',
    nieuw: [
      'De kaart Deurbel is de kaart Camera’s: kies zoveel camera’s als je wilt, ze schikken zich naar de maat van de kaart, en een tik maakt het beeld groot en live, met de andere camera’s eronder',
      'Bij elk beeld wat de camera nu ziet (een persoon, een voertuig, een dier of beweging) of wanneer het laatst; bij de deurbel wanneer er werd aangebeld',
    ],
    en: {
      nieuw: [
        'The Doorbell card is now the Cameras card: choose as many cameras as you like, they arrange themselves to the size of the card, and a tap makes the picture large and live, with the other cameras below',
        'With each picture what the camera sees now (a person, a vehicle, an animal or motion) or when it last did; with the doorbell when someone rang',
      ],
    },
  },
  {
    versie: '0.72.1',
    datum: '2026-10-25',
    opgelost: [
      'Bij Inrichten › Je schermen blijft de kleine wand met het huis binnen zijn kader, ook met veel kaarten',
    ],
    en: {
      opgelost: [
        'In Setup › Your screens the small wall with the house stays inside its frame, also with many cards',
      ],
    },
  },
  {
    versie: '0.72.0',
    datum: '2026-10-25',
    nieuw: [
      'De film is een trailer: een camera vliegt over je huis, door de etages en naar het dak, de apparaten en de assistent komen voorbij, en hij eindigt met Naar je huis of Nog een keer',
      'Inrichten begint met een groot welkom: je huis bouwt zich op uit Home Assistant, met wat er gevonden is als labels eraan',
    ],
    opgelost: [
      'Gewoner Nederlands bij verwarmen: een kamer wordt verwarmd, de zolder wordt warm',
    ],
    en: {
      nieuw: [
        'The film is a trailer: a camera flies over your house, through the floors and to the roof, the devices and the assistant pass by, and it ends with To your house or Play again',
        'Setup starts with a big welcome: your house builds itself up from Home Assistant, with what was found as labels on it',
      ],
      opgelost: [
        'Clearer wording when a room is being heated',
      ],
    },
  },
  {
    versie: '0.71.0',
    datum: '2026-10-25',
    beter: [
      'De wand neemt de weergave, het thema en de taal over van wie hij volgt, net als de kaarten en de kleur',
      'Seizoenen, het weer en feestdagen staan bij Weergave, onder Huis',
    ],
    en: {
      beter: [
        'The wall takes the display, theme and language of the person it follows, like the cards and the colour',
        'Seasons, the weather and holidays are in Display, under House',
      ],
    },
  },
  {
    versie: '0.70.0',
    datum: '2026-10-25',
    nieuw: [
      'Bij Weergave: seizoenen, het weer en feestdagen in het huis aan of uit, met een pompoen met Halloween, lichtjes met Kerst, vuurwerk met Oud en Nieuw en eieren met Pasen',
    ],
    beter: [
      'Bij aanbellen staat het live beeld van de deurbel er meteen, ook als er al schermen meekijken of het scherm net aangaat',
      'Is de zon onder of komt hij vandaag niet meer, dan zegt het huis dat, in plaats van dat het op zon wacht',
    ],
    opgelost: [
      'Een kamer heet alleen nog verwarmd als het apparaat echt stookt, niet als het alleen op verwarmen staat',
      'De zon komt in het huis op aan de kant van het oosten, en de schaduw valt van de zon af',
      'De tuin en het tuinhuis zijn in het huis aan te tikken',
      'Een droger die je zelf startte, heet zo, en niet Start op zon',
    ],
    en: {
      nieuw: [
        'In Display: seasons, the weather and holidays in the house on or off, with a pumpkin at Halloween, lights at Christmas, fireworks at New Year and eggs at Easter',
      ],
      beter: [
        'When someone rings, the live doorbell picture is there right away, also when other screens are watching or the screen has just turned on',
        'When the sun is down or will not come back today, the house says so instead of waiting for sun',
      ],
      opgelost: [
        'A room is only called heated when the device really heats, not when it is just set to heat',
        'The sun rises in the house on the east side, and the shadow falls away from the sun',
        'The garden and the shed can be tapped in the house',
        'A dryer you started yourself says so, not Start on sun',
      ],
    },
  },
  {
    versie: '0.69.0',
    datum: '2026-10-25',
    nieuw: [
      'Inrichten zegt per airco en thermostaat wat hij kan: wat Home Assistant zegt, met een tip per merk, een voorstel als het bereik niet kan kloppen, en een vraag als hij iets niet zegt',
    ],
    beter: [
      'Als thermostaat van de ketel stelt de app eerst een Nest, tado of Netatmo voor',
    ],
    en: {
      nieuw: [
        'Setup shows for each air conditioner and thermostat what it can do: what Home Assistant says, with a tip per brand, a suggestion when the range cannot be right, and a question when it does not say something',
      ],
      beter: [
        'As the boiler thermostat the app now suggests a Nest, tado or Netatmo first',
      ],
    },
  },
  {
    versie: '0.68.0',
    datum: '2026-10-25',
    nieuw: [
      'Een huis zonder panelen: de tab heet Verbruik, en de kaart Vandaag zegt wat het huis gebruikte en kostte, met de daluren van vandaag',
      'Een huis zonder slimme meter: de app schat wat je panelen over hebben en wat je zelf gebruikte, en zegt het erbij',
    ],
    beter: [
      'Wat je huis kan zegt wat er zonder slimme meter of zonder panelen bij kan',
    ],
    en: {
      nieuw: [
        'A house without solar panels: the tab is called Usage, and the Today card shows what the house used and cost, with the off-peak hours of today',
        'A house without a smart meter: the app estimates what your panels have spare and what you used yourself, and says so',
      ],
      beter: [
        'What your house can do says what can be added without a smart meter or solar panels',
      ],
    },
  },
  {
    versie: '0.67.2',
    datum: '2026-10-25',
    opgelost: [
      'Op de telefoon staat het huis op Thuis weer boven de stroombalk; sinds 0.67.1 zakte het eronder',
    ],
    en: {
      opgelost: [
        'On the phone the house on Home sits above the power bar again; since 0.67.1 it slid underneath',
      ],
    },
  },
  {
    versie: '0.67.1',
    datum: '2026-10-25',
    beter: [
      'Een verdieping staat in de kamer op hoogte, met de verdieping eronder en erboven vaag erbij',
    ],
    opgelost: [
      'Thuis loopt weer vlot op een oudere tablet aan de wand: wat beweegt in het huis, kost het beeld eronder geen schilderwerk meer',
      'In de grafiek Vandaag loopt een blokje van de airco niet meer door de naam',
      'Bij Aanpassen op de wand staan de knoppen van een smalle kaart weer heel in beeld, ook bij Sluipverbruik',
    ],
    en: {
      beter: [
        'A floor sits at its height in the room view, with the floors below and above faintly shown',
      ],
      opgelost: [
        'Home runs smoothly again on an older tablet on the wall: what moves in the house no longer repaints the picture underneath',
        'In the Today chart an air conditioning block no longer runs through its name',
        'When customising the wall, the buttons of a narrow card are fully visible again, Standby use included',
      ],
    },
  },
  {
    versie: '0.67.0',
    datum: '2026-10-25',
    nieuw: [
      'De app werkt ook in een huis zonder slimme verwarming of airco: licht, schermen, energie, op zon en de assistent, en comfort per kamer kan erbij',
    ],
    opgelost: [
      'De test van het sluipverbruik hangt niet meer af van hoe laat hij draait',
    ],
    en: {
      nieuw: [
        'The app also works in a house without smart heating or air conditioning: lights, blinds, energy, on sun and the assistant, and comfort per room can be added',
      ],
      opgelost: [
        'The standby use test no longer depends on the time it runs',
      ],
    },
  },
  {
    versie: '0.66.0',
    datum: '2026-10-25',
    nieuw: [
      'Sluipverbruik: wat je huis elke nacht gebruikt als er niets draait, met een eigen scherm onder Opbrengst, elke nacht en elke maand sinds je meter',
      'Een melding de ochtend erna als een nacht 50 W of meer boven je gewone nacht lag, en een kaart Sluipverbruik voor Thuis',
    ],
    beter: [
      'De assistent weet je sluipverbruik, en Wat je huis kan heeft het bij Kosten',
    ],
    en: {
      nieuw: [
        'Standby use: what your house uses every night when nothing runs, with its own screen under Energy, every night and every month since your meter',
        'A notification the morning after when a night was 50 W or more above your usual night, and a Standby use card for Home',
      ],
      beter: [
        'The assistant knows your standby use, and What your house can do lists it under Costs',
      ],
    },
  },
  {
    versie: '0.65.0',
    datum: '2026-10-24',
    nieuw: [
      'Kamers en indeling werkt zoals Energie: op de telefoon eerst de lijst met etages, Buiten en wat nog in te delen is; op de wand de lijst en het gekozen deel naast elkaar',
      'Bij Buiten zet je aan wat er rond het huis is, met hetzelfde lijstje als bij Inrichten',
    ],
    opgelost: [
      'Een garage of carport die je buiten toevoegt, staat nu ook in de tekening, ook bij Kamers en indeling en bij een kamer',
      'Een ruimte die een carport is, kun je bij Inrichten nu aan de carport koppelen',
    ],
    en: {
      nieuw: [
        'Rooms and layout works like Energy: on the phone first the list of floors, Outside and what is still to arrange; on the wall the list and the chosen part side by side',
        'At Outside you turn on what is around the house, with the same list as in Set up',
      ],
      opgelost: [
        'A garage or carport you add outside now shows in the drawing, also in Rooms and layout and for a room',
        'An area that is a carport can now be linked to the carport in Set up',
      ],
    },
  },
  {
    versie: '0.63.1',
    datum: '2026-10-24',
    beter: [
      'Het huis staat nu overal op zijn eiland: ook bij een kamer, Kamers en indeling, de assistent, het begin, de film, het inlogscherm en het always-on display',
    ],
    en: {
      beter: [
        'The house now stands on its island everywhere: also for a room, Rooms and layout, the assistant, the start, the film, the sign-in screen and the always-on display',
      ],
    },
  },
  {
    versie: '0.63.0',
    datum: '2026-10-24',
    nieuw: [
      'Inrichten in acht hoofdstukken, met het huis op zijn eiland dat bij elke stap iets krijgt',
      'Bij Inrichten: wat voor huis het is, afwezig en vakantie, wat er op zon mag, en wat er in Home Assistant klaar moet staan',
    ],
    beter: [
      'Het tuinhuis heeft twee spots onder het overstek die omlaag schijnen, elk in de kleur van zijn lamp',
      'Buiten bij Inrichten kent de jacuzzi en het schuurtje; de wand zie je in het klein, met de kaarten om te kiezen',
    ],
    opgelost: [
      'Panelen op de garage, carport of het tuinhuis vielen weg als je Op zon bij Regeling of Inrichten veranderde',
    ],
    en: {
      nieuw: [
        'Set up in eight chapters, with the house on its island gaining something at every step',
        'In Set up: what kind of house it is, away and holiday, what may run on sun, and what has to be ready in Home Assistant',
      ],
      beter: [
        'The garden house has two spots under the overhang shining down, each in the colour of its lamp',
        'Outside in Set up knows the hot tub and the shed; you see the wall screen in miniature, with the cards to choose',
      ],
      opgelost: [
        'Panels on the garage, carport or garden house were dropped when you changed On sun in Control or Set up',
      ],
    },
  },
  {
    versie: '0.62.2',
    datum: '2026-10-24',
    beter: [
      'Het tuinhuis heeft een plat dak met een overstek op twee palen, een vlonder en een glazen pui; heet het een schuur of berging, dan blijft het het houten schuurtje met puntdak',
    ],
    en: {
      beter: [
        'The garden house has a flat roof with an overhang on two posts, a deck and a glass front; when it is called a shed, it stays the wooden shed with a pitched roof',
      ],
    },
  },
  {
    versie: '0.62.1',
    datum: '2026-10-24',
    beter: [
      'Het kompas staat niet meer op Thuis; bij Zonnepanelen wel, bij de ligging',
    ],
    en: {
      beter: [
        'The compass is no longer on Home; it stays on Solar panels, with how they lie',
      ],
    },
  },
  {
    versie: '0.62.0',
    datum: '2026-10-24',
    nieuw: [
      'Een kaart Boiler: hoe warm de boiler of jacuzzi is, en of hij op zon opwarmt',
    ],
    beter: [
      'Een smalle kaart op de wand is een tegel met een groot getal en een beeldje: een ring voor de auto, een staaf voor de batterij, balkjes voor de maand',
    ],
    opgelost: [
      'In een smalle kaart blijft alles binnen de kaart, ook de grafiek van Vandaag',
    ],
    en: {
      nieuw: [
        'A water heater card: how warm the water heater or hot tub is, and whether it heats on sun',
      ],
      beter: [
        'A narrow card on the wall is a tile with a large number and a small picture: a ring for the car, a bar for the battery, bars for the month',
      ],
      opgelost: [
        'In a narrow card everything stays inside the card, including the chart of Today',
      ],
    },
  },
  {
    versie: '0.61.1',
    datum: '2026-10-24',
    beter: [
      'Doet de oude regeling al wat Smart Climate wil, dan zegt Thuis "De badkamer wordt verwarmd" in plaats van "zou verwarmen"',
      'Op de telefoon staan zon, huis en net onder het huis als drie vakjes, zonder pijl',
    ],
    opgelost: [
      'Op de wand loopt de lucht weer door achter het huis',
      'Bij Wat je huis kan valt het label van de auto niet meer over het menu',
    ],
    en: {
      beter: [
        'When the old system already does what Smart Climate wants, Home says "The bathroom is being heated" instead of "would heat"',
        'On the phone sun, home and grid sit below the house as three tiles, without an arrow',
      ],
      opgelost: [
        'On the wall the sky runs on behind the house again',
        'On What your home can do the car label no longer falls over the menu',
      ],
    },
  },
  {
    versie: '0.61.0',
    datum: '2026-10-24',
    nieuw: [
      'Het huis staat nu op een eigen stukje grond, met de kelder eronder, het weer van nu en de seizoenen: regen en sneeuw vallen, de bomen kleuren mee',
      'Panelen kunnen ook op de garage, de carport of het tuinhuis liggen, elk met hun eigen aantal',
      'Bij Meldingen wis je alles in één keer',
    ],
    beter: [
      'Zonnepanelen laat het huis zien met hoe de panelen liggen, in graden vanaf het noorden, met per dak het aantal',
      'De kaarten op de wand staan in twee kolommen; elke kaart kies je smal of breed',
      'Elke stroom op het huis heeft zijn eigen kleur: zon goud, terug naar het net groen, van het net violet',
      'Op de telefoon staan de hulp, de bel en het tandwiel op elke tab op dezelfde plek, en onder het huis zie je wat er van of naar het net gaat',
      'Wat je huis kan staat in zes groepen, met de boiler, de jacuzzi en wat het huis eerst leert',
    ],
    opgelost: [
      'Een boiler stond in het huis als droger getekend; nu als boiler',
    ],
    en: {
      nieuw: [
        'The house now stands on its own patch of ground, with the basement below, the weather of now and the seasons: rain and snow fall, the trees change colour',
        'Panels can also lie on the garage, the carport or the garden shed, each with its own number',
        'Under Notifications you clear everything at once',
      ],
      beter: [
        'Solar panels shows the house with how the panels lie, in degrees from north, with the number per roof',
        'The cards on the wall stand in two columns; you choose each card narrow or wide',
        'Every flow on the house has its own colour: sun gold, back to the grid green, from the grid violet',
        'On the phone help, the bell and the gear sit in the same place on every tab, and below the house you see what goes from or to the grid',
        'What your home can do is in six groups, with the water heater, the hot tub and what the house learns first',
      ],
      opgelost: [
        'A water heater was drawn in the house as a dryer; now as a water heater',
      ],
    },
  },
  {
    versie: '0.60.0',
    datum: '2026-10-23',
    nieuw: [
      'Een boiler of jacuzzi kan op zon: hij warmt op met wat er over is, houdt een ondergrens vast en is zonder zon op tijd warm in de daluren',
      'Bij de jacuzzi kies je klaar om: vanavond, morgen of later, en hij is dan op badtemperatuur',
    ],
    opgelost: [
      'Op de telefoon loopt de tekst van de assistent weer mee terwijl hij praat, ook als de browser niet zegt bij welk woord hij is',
    ],
    en: {
      nieuw: [
        'A water heater or hot tub can run on sun: it heats up with what is spare, keeps a minimum and is warm in time during off-peak hours without sun',
        'For the hot tub you choose a ready time: tonight, tomorrow or later, and it will be at bath temperature by then',
      ],
      opgelost: [
        'On the phone the text of the assistant follows along again while it speaks, even when the browser does not say which word it is at',
      ],
    },
  },
  {
    versie: '0.59.11',
    datum: '2026-10-23',
    beter: [
      'Wat er nieuw is bij een update staat in Home Assistant nu in het Nederlands en het Engels; de app toont het in jouw taal',
      'Lukt het bewaren bij het begin niet, dan zegt de app waarom in jouw taal',
    ],
    en: {
      beter: [
        'What is new in an update is now in Dutch and English in Home Assistant; the app shows it in your language',
        'If saving at the start does not work, the app says why in your language',
      ],
    },
  },
  {
    versie: '0.59.10',
    datum: '2026-10-23',
    opgelost: [
      'Bij Kamers en indeling gaat een wijziging niet meer verloren als je snel achter elkaar iets verandert',
    ],
    en: {
      opgelost: [
        'In Rooms and layout a change is no longer lost when you change things quickly one after another',
      ],
    },
  },
  {
    versie: '0.59.9',
    datum: '2026-10-23',
    opgelost: [
      'De app op je startscherm vraagt niet meer na elk sluiten opnieuw om in te loggen bij Home Assistant',
    ],
    en: {
      opgelost: [
        'The app on your home screen no longer asks you to sign in to Home Assistant again every time you close it',
      ],
    },
  },
  {
    versie: '0.59.8',
    datum: '2026-10-23',
    beter: [
      'Smart Climate op een eigen server, zoals een beta, heeft een eigen naam en een icoon met BETA erop, zodat hij op je startscherm niet lijkt op de add-on',
    ],
    opgelost: [
      'De knop Open in Chrome bij Op je startscherm heeft zijn tekst weer netjes in het midden',
    ],
    en: {
      beter: [
        'Smart Climate on its own server, such as a beta, has its own name and an icon with BETA on it, so on your home screen it no longer looks like the add-on',
      ],
      opgelost: [
        'The Open in Chrome button under On your home screen has its text neatly centred again',
      ],
    },
  },
  {
    versie: '0.59.7',
    datum: '2026-10-23',
    nieuw: [
      'Automatisch kiest Engels bij een Engels account of een Engelse browser; Engels is geen proef meer',
    ],
    beter: [
      'Bij Automatisch komt een melding op je telefoon in de taal waarin je de app het laatst opende',
    ],
    en: {
      nieuw: [
        'Automatic chooses English for an English account or browser; English is no longer a trial',
      ],
      beter: [
        'With Automatic, a notification on your phone comes in the language you last opened the app in',
      ],
    },
  },
  {
    versie: '0.59.6',
    datum: '2026-10-23',
    beter: [
      'De assistent verstaat Engels: vragen over je huis en de app, en het licht, de schermen en scènes bedienen',
      'Assist in Home Assistant kent de vragen aan Smart Climate nu ook in het Engels',
      'Piper leest voor in het Engels als Home Assistant een Engelse stem heeft, met eenheden zoals je ze zegt',
    ],
    en: {
      beter: [
        'The assistant understands English: questions about your house and the app, and controlling lights, screens and scenes',
        'Assist in Home Assistant now knows the questions for Smart Climate in English too',
        'Piper reads aloud in English if Home Assistant has an English voice, with units as you say them',
      ],
    },
  },
  {
    versie: '0.59.5',
    datum: '2026-10-22',
    beter: [
      'In het Engels nu ook wat de dienst zelf zegt: de stand van je apparaten, het weer, de meldingen, Opbrengst, de besluiten bij Vandaag, de ligging van je panelen, Klaarzetten en de vragen bij het begin',
      'Een melding op je telefoon komt in de taal die je bij Jij koos',
      'Wat er nieuw is staat er ook in het Engels',
    ],
    opgelost: [
      'Bij Bewoners en toegang staat je rol in de taal van de app',
    ],
    en: {
      beter: [
        'In English now too: what the service says itself, such as the state of your devices, the weather, the notifications, Energy, the decisions in Today, how your panels lie, Getting Home Assistant ready and the questions at the start',
        'A notification on your phone comes in the language you chose in You',
        'What is new is in English too',
      ],
      opgelost: [
        'Residents and access shows your role in the language of the app',
      ],
    },
  },
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
