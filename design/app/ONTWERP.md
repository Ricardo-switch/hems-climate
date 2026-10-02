# Het ontwerp van de bewonersapp

Eén plek waar de app is doorgedacht vóórdat hij gebouwd wordt: wat de bewoner
ziet, wat hij kan doen, en waar het op rust. De besluiten zelf staan in
`DECISIONS.md`; dit document verbindt ze en vult de gaten ertussen. De schetsen
staan ernaast in deze map (besluit 71).

Bij elk onderdeel staat hoe vast het is:

- **Vast** — er is een besluit; afwijken vraagt een nieuw besluit.
- **Voorstel** — doordacht, maar het detail volgt bij het bouwen.
- **Open** — nog niet doordacht; staat onderaan bij de vragen.

Bijgewerkt op 2 oktober 2026, na de brainstorms van 1 en 2 oktober (besluiten 71 tot en met 74).

---

## 1. Voor wie, en op welk scherm

De app is voor wie in het huis woont, niet voor wie het installeert. Geen
entity-ID's, geen jargon (45). Twee vormen, met dezelfde inhoud, dezelfde ontwerptaal en een andere taak
(**vast**, 71):

| | Telefoon | Tablet aan de muur |
| --- | --- | --- |
| Taak | Bijsturen en nalezen, ook van buiten | Laten zien wat er nu gebeurt, en vragen stellen |
| Uiterlijk | Donker, dezelfde ontwerptaal als de wand | Donker: hij staat altijd aan en mag 's avonds de kamer niet verlichten |
| Indeling | Vijf tabs onderin | Smalle balk links, één groot scherm |
| Assistent | Typen, of de microfoonknop | Spreken ("Hé huis") of tikken |
| Zelf bedienen | Bediening, per kamer | Een kamer aantikken op Thuis; de modus van het huis altijd onderin |

Het gekleurde blokje linksboven op de wand is een plaatshouder voor het logo;
het doet niets.

### Waar de app opent

**Vast** (77). In de add-on via Home Assistant: een menu-item, achter de inlog
van Home Assistant, in elke browser en in de app van Home Assistant. Een eigen
link zonder Home Assistant eromheen komt pas met een eigen inlog (stap C); dan
ook als kioskstand voor de wand. Tot die tijd: een eigen gebruiker voor de
tablet en een kioskbrowser die rechtstreeks naar de add-on-pagina gaat.

### Waar de app zijn gegevens vandaan haalt

**Vast** (76). Uit een bewonerscontract van de dienst: status per kamer in
woorden, de kop, de stromen, het dagoverzicht, wat opviel. Uitgerekend en
getest in de dienst; de app toont alleen. `/api/vandaag` is het eerste stuk.

## 2. De regels achter elk scherm

**Vast** (71). Ook voor schermen die nog niet getekend zijn:

1. Elk getal is te herleiden tot het logboek. Berekend of voorspeld staat erbij,
   met hoe zeker het is.
2. Bij elk besluit een reden, in gewone taal. Weet het systeem iets niet, dan
   zegt het dat.
3. De assistent stelt voor; de regeling beslist (44).
4. Het scherm weet in welke fase het huis zit (73).
5. Eerst de lelijke momenten ontwerpen: nacht, geen zon, een sensor die
   wegvalt, één airco.
6. Elk scherm in beide seizoenen. De schetsen leunen nu op koelen, omdat de
   echte data van september en oktober over koelen gaat; de winter is waar het
   gas, de warmtepomp en het voorverwarmen zitten (§10).

## 3. De drie fasen

**Vast** (73). Per apparaat kan de fase verschillen; de bewoner beslist wanneer
het een stap verder gaat, en terug kan altijd.

| | Leren | Meekijken | Regelen |
| --- | --- | --- | --- |
| Wat het systeem doet | Meet, stuurt niets | Beslist in de schaduw en legt dat naast wat er gebeurde | Stuurt |
| Waarmee vergeleken | Niets | Een vorige regeling, of "zoals jullie het zelf deden" (28) | Een berekening van "zonder Smart Climate", gelabeld als berekend (D) |
| Thuisscherm | `Wand-Leren` | `Wand-Thuis`, met de grijze lijn | `Wand-Thuis`, zonder grijze lijn |
| Door naar de volgende | Als de bewoner wil; het scherm toont wat er nog nodig is | Bij voldoende bewijs; in dit huis besluit 64 | — |

**Leren is geen wachttijd.** De vaste regels werken zonder geleerd model. Op het
Leren-scherm staat daarom "Nu al beginnen, met de basisregels" (**vast**, 73).

### Wat de bewoner kan doen tijdens het leren

**Vast** in opzet (73), **voorstel** in vorm:

| Wat | Hoe op het scherm | Waarom |
| --- | --- | --- |
| Gewoon leven | Niets te doen | De basis voor het meekijken |
| Nakijken wat er gevonden is | Lijst "Wat ik vond", met aanpassen en toevoegen | Kamers en apparaten kloppen (72) |
| Zeggen hoe het voelt | Op de wand altijd zichtbaar: te koud · goed · te warm | Sensoren meten temperatuur, niet gevoel |
| Een moment toelichten | Het systeem vraagt bij een sprong die het niet verklaart: "De woonkamer liep 2 °C op. Weet je waarom?" | Zonder dit leert het model koken als opwarming |
| Meehelpen met een proef | Een kaart: "Zet morgen om 14:00 de airco een uur aan, dan meet ik hoe snel het afkoelt" | Eén middag in plaats van een week; het systeem stuurt zelf niets |
| Vooraf kiezen | Dezelfde instellingen als later (§6) | Geen verrassing bij de overstap |

### Als de bewoner zelf ingrijpt

**Vast** (74), en een voorwaarde voor stap B. Het oude systeem zet een apparaat
dat de bewoner bedient na een paar minuten terug; dat gebeurt hier niet.

- De regeling herkent per apparaat dat de bewoner ingreep: het staat anders dan
  zij het zette, zonder eigen opdracht onderweg. Ook een ingreep via de app.
- Alleen dat apparaat valt buiten de regeling; de rest regelt door, met het
  verbruik ervan in het budget.
- Het duurt tot een natuurlijk eindpunt: een uur, tot vanavond, of tot de
  bewoner het teruggeeft. Zonder keuze tot het volgende dagdeel.
- Het scherm zegt wie het overnam, wanneer en tot wanneer, met "Geef terug"
  (`Wand-Kamer`). Daar staat ook wat de regeling zelf zou doen.
- Steeds weer hetzelfde ingrijpen wordt een voorstel van de assistent.
- De failsafe wint. De modus Handmatig blijft bestaan voor het hele huis.

## 4. Kamers, zones en apparaten

**Vast** (72).

- Home Assistant levert de **apparaten**. De app bewaart de **kamers en zones**,
  in de eigen configuratie.
- Een **kamer** is wat de bewoner ziet. Een **zone** is wat de regeling stuurt:
  de kamers die één apparaat bedient. Een kamer zonder apparaat wordt gemeten,
  niet geregeld.
- Na de installatie neemt de app nooit stil iets over uit Home Assistant. Nieuw
  apparaat: een voorstel. Verdwenen apparaat: een melding, en doorwerken met
  minder (70).

### De onboarding

**Voorstel**, bovenop wat er al is (41, 42). Vier stappen, telefoon of laptop:

1. **Verbinden.** Home Assistant herkennen; achter Ingress gaat dat vanzelf.
2. **Klopt dit?** De gebieden uit Home Assistant als kamers, met per kamer de
   gevonden apparaten en sensoren. Twijfelgevallen als vraag, met de reden
   (`Onboarding.dc.html`).
3. **Zones.** Welke kamers één apparaat delen. Meestal is dat al goed:
   één airco per kamer is één zone.
4. **Wat mag het straks?** De keuzes uit §6, met verstandige standaarden. Dan
   begint het leren.

### Het scherm Kamers

**Voorstel** (`Kamers.dc.html`). Na de installatie:

- kamers per etage, met per kamer de sensor, de apparaten en de zone; om te
  schakelen naar een weergave per zone;
- een kamer toevoegen, hernoemen, naar een andere etage of zone verplaatsen, of
  weghalen; een etage toevoegen als Home Assistant er geen heeft;
- een apparaat aantikken: aanpassen (naam, rol, vermogen, bereik, stille uren),
  naar een andere kamer verplaatsen, of uit de regeling halen. Uit de regeling
  is niet weg: het blijft in Home Assistant en wordt nog gemeten (72);
- bovenaan de voorstellen uit de vergelijking met Home Assistant.

De etages komen uit Home Assistant (sinds 2024) of van de bewoner. De doorsnede
op het Thuis-scherm van de wand wordt eruit opgebouwd: etages boven elkaar,
kamers ernaast. Zo hoeft niemand per huis een tekening te maken (72).

Schrijven vraagt de inlog (23, stap C). Tot dan werkt dit alleen achter Ingress.

## 5. De schermen

| Scherm | Vorm | Fase | Wat het toont | Hangt af van | Schets |
| --- | --- | --- | --- | --- | --- |
| Thuis | telefoon, wand | meekijken, regelen | Nu: kamers, stroom, wat er draait en waarom | — | `Main`, `Wand-Thuis` |
| Kamer | wand (en telefoon) | alle | Eén kamer bedienen: doel, koelen of verwarmen, hoe lang; wie het overnam | 74, inlog voor schrijven | `Wand-Kamer` |
| Leren | wand (en telefoon) | leren | Wat gevonden is, wat geleerd is, hoe zeker, wat nog nodig is | — | `Wand-Leren` |
| Waarom | telefoon | alle | Elk besluit van vandaag met de reden | — | `Waarom` |
| Opbrengst | telefoon | meekijken, regelen | Netstroom, kosten, ritten; comfort pas met D | D voor comfort | `Opbrengst` |
| Plan | wand | regelen | Wat het vanmiddag en vanavond van plan is | D en E | `Wand-Plan` |
| Assistent | telefoon, wand | alle | Uitleg en voorstellen | G | `Assistent`, `Wand-Assistent` |
| Bediening | telefoon | alle | Modus, comfort, wie stuurt, keuzes, gekoppeld | inlog voor schrijven | `Bediening` |
| Kamers | telefoon | alle | Kamers, zones, apparaten, voorstellen | 72, inlog | `Kamers` |
| Onboarding | telefoon | vóór leren | De vier stappen van §4 | 41, 42 | `Onboarding` |

## 6. Wat de bewoner kan instellen

| Instelling | Stand | Bron |
| --- | --- | --- |
| Modus: automatisch, afwezig, vakantie, handmatig | vast | bestaat; 39 |
| Comfort per kamer: nooit kouder dan, nooit warmer dan | vast | 50 |
| Wie stuurt, per apparaat | vast | 53, 73 |
| Zelf ingrijpen per apparaat, en hoe lang | vast | 74 |
| Koelen op netstroom boven het plafond, of alleen op zon | open | wacht op een besluit; gevonden in de data van 1 oktober |
| Stille uren per kamer | voorstel | 72 |
| Welke kamer voorgaat bij weinig zon | vast | prioriteit per zone |
| Gekoppeld: laadpaal, batterij, tarief | voorstel | koppelen via evcc en Predbat, niet zelf bouwen |

## 7. De assistent

**Vast** in rol (44), **voorstel** in vorm:

- Hij legt uit en stelt voor. Een voorstel kan eerst een week meekijken.
- Een opdracht ("zet de zolder op 21", "doe de airco aan") voert hij uit als
  ingreep van de bewoner (75). Daarna vraagt hij altijd tot hoe laat, en als het
  later duidelijk beter kan, zegt hij dat erbij: "Nu kost het 0,3 kW van het
  net. Om 15:00 is er zon over. Nu, of om 15:00?" Eén voorstel, de bewoner
  kiest. Wat niet meteen kan, zegt hij met de reden.
- Zijn bronnen zijn het besluitenlog, de configuratie en wat de bewoner heeft
  toegelicht. Wat daar niet in staat, weet hij niet, en dat zegt hij.
- Hij vraagt zelf om toelichting bij wat hij niet kan verklaren (§3).
- Spreken op de wand: waarschijnlijk via Assist van Home Assistant. **Open**:
  of het wekwoord betrouwbaar genoeg werkt op een tablet.

## 8. Data die de app toevoegt

**Vast** (73), formaat **voorstel**:

| Wat | Waar | Gevoeligheid |
| --- | --- | --- |
| Gevoel (te koud, goed, te warm) | Per dag naast het logboek, met tijd en kamer | Als aanwezigheid |
| Toelichting bij een moment | Idem | Als aanwezigheid |
| Keuzes en kamers | In de configuratie (72) | Laag |
| Antwoorden op voorstellen van de assistent | In het logboek, als besluit van de bewoner | Laag |

Alles gaat mee in de export. Het thermisch model gebruikt gevoel en
toelichting als invoer (D).

## 9. Volgorde

1. **Nu tot het voorjaar:** de schaduw verzamelt de winter. Naast de
   schaduwpagina staat een prototype in deze ontwerptaal, op live data en alleen
   lezen: `nieuw.html` (Thuis, Waarom, Opbrengst, Bediening; portret en
   landschap). Het is niet de basis van F (76). Open vraag: gevoel en toelichting deze winter al vastleggen.
2. **Stap B:** echt schakelen in dit huis. Vooraf: herkennen dat de bewoner
   zelf ingrijpt (74). De Bediening krijgt "wie stuurt", de wand het scherm Kamer.
3. **Stap C:** het model met kamers (72), de inlog, voorbeeldhuizen (70). Pas
   daarna Kamers en de onboarding als schermen.
4. **Stap D:** het thermisch model; daarmee Opbrengst-comfort, de zekerheid
   op het Leren-scherm, en Plan.
5. **Stap E:** weer en tarieven; Plan wordt compleet.
6. **Stap F:** de schermen, naast de schetsen gelegd.
7. **Stap G:** de assistent.

## 10. Nog niet doordacht

Dit moet beantwoord zijn vóór F gebouwd wordt:

- **De winter in de schetsen.** Thuis, Plan en Kamer bestaan alleen als
  koeldag. Er horen wintervarianten bij: de cv en de airco als warmtepomp,
  verwarmen op zon, voorverwarmen met het thermisch model. Die zijn pas echt in
  te vullen met de winterdata, maar de opbouw kan eerder.

- **Meldingen.** Wanneer stuurt de app iets naar de telefoon, en wanneer juist
  niet? Een voorstel, een sensor die wegvalt, het vangnet dat ingrijpt.
- **Meerdere bewoners.** Mag iedereen het comfort aanpassen? Wie beslist over
  de fase? Tellen alle gevoelstikken even zwaar?
- **Een zone met twee sensoren.** Telt de warmste, het gemiddelde, of die waar
  het apparaat hangt? De schets `Kamers` laat de warmste zien; dat is een
  voorbeeld, geen keuze.
- **De tablet zonder verbinding.** Wat toont hij als de NAS of Home Assistant
  even weg is?
- **Bewaartermijn.** Hoe lang blijven gevoel, toelichting en aanwezigheid
  bewaard?
- **Toegankelijkheid en taal.** Contrast op de donkere wand, grote tekst,
  later andere talen dan Nederlands.
- **De zonnesensor.** Nu eens per kwartier, uit de cloud van SolarEdge. Een
  lokale sensor (Modbus van de omvormer of een kWh-meter op de groep) maakt de
  stromen op het scherm en de instraling in de dataset echt live. Zie "Wat nog
  een besluit wacht" in het besluitenlog.
- **Uiterlijk en naam.** Telefoon en wand zijn allebei donker. Mag de bewoner
  zelf een lichte versie kiezen, of een accentkleur? En het logo en de naam van de app; nu een plaatshouder.
- **Het plafond op netstroom** (§6): per huis een instelling, maar met welke
  standaard?
