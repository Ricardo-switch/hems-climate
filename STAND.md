# Zo staat het nu

Het [besluitenlog](DECISIONS.md) is een geschiedenis: nieuwste onderaan, met wat
afviel en wat het kostte. Dit is de doorsnede: per onderwerp hoe het nu werkt,
in een paar regels, met de besluiten erbij. Wie het waarom zoekt, klikt door.

*Bijhouden:* verandert een besluit iets hieraan, pas dan ook deze pagina aan en
draai `npm run decisions:index` in `backend/`. Die zet de links onderaan. Een
test eist dat elk besluit dat nog geldt hier genoemd wordt, en dat elke
verwijzing bestaat.

*Stand: 21 oktober 2026.*

## Waar het project staat

- **Nu: meekijken.** Smart Climate draait op de NAS naast de oude YAML-regeling,
  beslist elke ronde en legt vast wat hij zou doen. Klimaat en screens schakelt
  hij niet ([15], [28], [73]).
- **Ernaast, nu al:** C, kamers en zones, en de app (F) groeien in de
  proefomgeving ([96], [94]). B wordt na de winter bewezen, dus dat werk gaat niet
  verloren.
- **Daarna, in deze volgorde:** B echt schakelen, pas bij 30 winterdagen en
  100% functiedekking ([64]), met een bewijsrapport; E tarieven en prognoses;
  D het thermisch model ([46]); de app af ([71]); G de assistent ([44]); H een
  product voor meer huizen ([34]).
- **De app is af** (21 oktober 2026): nu opruimen, sneller maken, apparaten
  op zon in de voorrang, en wat nog op dit huis leunt een instelling maken. Nog
  te bouwen: een lichte versie met een kleur per bewoner, vier kaarten voor
  Thuis, meldingen op de telefoon en een eigen koppeling voor Assist. Talen
  later: Engels, dan Duits ([172]). Sneller: scripts met een stempel bewaart de
  browser, buiten Ingress gaat alles ingepakt, en het huis wordt één keer per
  verandering uitgerekend ([173]). Het huis en wie er thuis is komen live: de
  dienst zegt het als er iets veranderde ([174]). Op je startscherm met het
  eigen icoon, en de favorieten met hun zone en een greep ([175]). Het wekwoord
  gaat mee in de add-on, Assist vindt de add-on zonder NAS-adres, en meldingen
  komen live ([177]). Eigen daluren en geen salderen voor een huis buiten
  Nederland, LG, Samsung en Miele op zon, en het typeplaatje voor de
  hoofdzekering ([178]).
- **Wat het huis verandert:** eind 2026 drie fasen van 25 A in plaats van één
  van 35 A ([78]); deze winter de ventilatie, een breukpunt voor het thermisch
  model. Open vragen staan in
  [Wat nog een besluit wacht](DECISIONS.md#wat-nog-een-besluit-wacht).

## Visie en principes

- **Waarom opnieuw:** de YAML-regeling werkte grotendeels, maar was niet na te
  gaan ([1]). Een fout faalt daarom luid; alleen de failsafe valt terug ([7]).
- **De schaduw blijft,** ook na de overstap: elk nieuw huis begint met
  meekijken ([28]), en doorloopt leren, meekijken en regelen, met de bewoner
  vanaf dag één ([73]).
- **Twee applicaties:** het instrumentenpaneel en de bewonersapp ([29]). De
  schetsen in `design/app2/` (ontwerp 2) zijn de maatstaf voor de app, en de
  schets is de code: de app gebruikt dezelfde tekenmotor voor het huis ([71],
  [104]).
- **Elke opstelling werkt:** de regeling doet wat de opstelling toelaat en zegt
  wat ze daardoor niet kan ([70]). Geavanceerde functies volgen uit wat het huis
  heeft; ingrijpende vragen een bewuste keuze ([78]).
- **Leren:** het huis leert wat het ís (afkoelen, vermogen, zon), niet wat het
  moet doen ([46]). Dat vervangt het eerdere nee tegen een model per huis
  ([14]).
- **De assistent** is een vierde voorsteller, geen baas ([44]). Een opdracht
  wordt een ingreep met een eindtijd ([75]). In de add-on komt hij via een eigen
  integratie, zonder YAML ([91]).
- **Zonwering is klimaat;** licht regelt Smart Climate niet, maar de app heeft
  een knop voor lampen ([92], [97]).
- **Op termijn:** een kastje met een verborgen Home Assistant en een dunne agent
  ([34]). Stap C loopt naast de schaduw en B ([96]).

## Kern en regeling

- **Een pure kern:** `decide()` doet geen I/O en leest geen klok; tijd en
  tijdzone zijn invoer ([2], [6]).
- **Strategieën stellen voor, één arbiter beslist** ([4]). Afbouwen is aan de
  arbiter: draaiend naar standby, na de stabilisatie uit ([5]).
- **Het budget:** een pot vermogen in plaats van een vlag ([3]). Starten vraagt
  meer dan doordraaien ([51]); hooguit één start per beslissing ([68]). Sinds
  7 oktober ook een stroombudget per fase tegen de hoofdzekering, in de schaduw
  ([78]).
- **Terugwinbaar** rekent met wat de apparaten echt opnemen ([49b]), niet met
  wat de schaduw veronderstelt ([49]).
- **Timers:** de schaduw houdt zijn eigen stabilisatietimer bij ([60]); parkeren
  start hem ook ([61]). Modus en timers horen bij de dienst ([39]) en overleven
  een herstart ([62]).
- **Alleen wat ons aangaat:** 92% van de wijzigingen in Home Assistant wordt
  genegeerd ([16]).
- **Handen af:** `handmatig` trekt de regeling terug ([8]), gelezen uit beide
  knoppen ([8b]). Wie zelf één apparaat bedient, wordt herkend en met rust
  gelaten ([74]).
- **Comfort** mag koelen boven een plafond, ook op netstroom ([50]). Een zone
  met meer kamers koelt op de warmste en verwarmt op de koudste ([81]); bij twee
  meters in één kamer kiest de bewoner ([95]).
- **Bij zon over:** eerst comfort, dan de batterij, dan de auto. Laadpaal en
  batterij stuurt Smart Climate niet zelf ([85]). Wat er na comfort over is,
  gaat in de volgorde van de lijst Op zon: kamers die op zon voorkoelen of
  opwarmen en apparaten zoals de droger door elkaar ([176]).
- **De zonnesensor:** elk merk omvormer werkt; de app meet hoe snel de sensor is
  ([89]).
- **Sturen:** alleen wat afwijkt. Slimmere timing moet eerst in de replay winnen
  ([90]); de eerste kandidaat, meteen uit als de zon de dag niet meer draagt,
  won nipt en gaat na de start van B in de regeling.
- **Uitstelbare apparaten:** de droger staat in de schaduw. Elke beslissing zegt
  of hij nu op zon zou starten, met de airco's voor; echt starten hoort bij B
  ([98]). Voor hoe laat hij klaar moet zijn, kies je per keer ([101]).
- **Terugkijken:** Opbrengst rekent per dag, week, maand of jaar met de meters
  en prijzen die de app bewaart, overgenomen uit het Energie-dashboard of zelf
  ingesteld; de cijfers komen uit de statistiek van Home Assistant ([102]).

## Configuratie en onboarding

- **JSON, met de hand gevalideerd** ([9], [10]). Het schema weigert alleen
  zonder tijdzone, zone of apparaat ([40]).
- **Alles wat per woning verschilt, staat in de configuratie,** niet in code
  ([31], [32]). Een meetwaarde mag in een attribuut zitten ([43]).
- **De ontdekking** stelt een configuratie voor uit Home Assistant, en besluit
  niet ([41]).
- **Home Assistant levert de apparaten, de app de kamers** ([72]). De opbouw is
  etage, kamer, zone: een deur maakt een kamer, open ruimte een zone ([95]).
  Etages voeg je vrij toe, met de vaste namen als voorstel ([112]).
- **De zon en je aansluiting vraagt de app:** panelen, hoofdzekering,
  stroomcontract en apparaten op zon. De regeling vult er bij het starten de
  configuratie mee aan waar die zwijgt; wat de configuratie noemt, gaat voor
  ([103]).

## Meten, data en analyse

- **Het logboek is zelfvoorzienend** ([11]). Afwijkingen worden episodes ([12]).
  Elke bewering komt uit een harness, met de beperkingen erbij ([13]).
- **De dataset:** de dienst legt de ruwe historie zelf vast ([52]), ook wat
  alleen het thermisch model nodig heeft (`recordOnly`, [65]). De
  buitentemperatuur ([30]) en de gaten daarna ([30b]) gaan mee. De opbrengst van
  de panelen is de instralingsmeter ([47]).
- **Bewaren:** export als tar.gz ([48]); ouder dan een week gecomprimeerd
  ([58]); twee jaar ruw, daarna samengevat ([83]). Bij elk besluit is na te gaan
  welke versie het nam ([66]). De export is voor onderzoek: alleen de
  hoofdgebruiker, zonder namen en ligging, met de instellingen en alle
  entiteiten en waar Smart Climate ze gebruikt ([151]).
- **Back-up en opnieuw beginnen:** een klein bestand met instellingen, wat het
  huis leerde en de configuratie; terugzetten start de dienst opnieuw. Opnieuw
  beginnen maakt eerst een back-up. Allebei alleen de hoofdgebruiker ([151]).
- **De datasetmeter** telt tijd en dekking, en beide moeten 100% halen ([27b]).
  Het eerste getal was te vriendelijk ([27]).
- **Ligging en panelen** meet de app zelf; de bewoner bevestigt. Dit huis: oost
  en west, 6 + 6 panelen, 4.680 Wp op een omvormer van 3.000 W, de lichtsensor
  onder de dakgoot ([93]).
- **Een nieuw huis** krijgt de ligging uit tien dagen opbrengst in de
  statistiek van Home Assistant, de omvormer uit zijn typenummer, en de
  voorkant uit "wanneer schijnt de zon erop?". Tot er een heldere dag is een
  schatting, daarna een melding. Wat de bewoner bevestigt, gaat voor het
  bestand ([157]).

## Weergave

- **Twee weergaven:** `index.html` voor de cijfers, en de app. De app wordt per
  tab herbouwd in ontwerp 2 ([104]): Thuis (`thuis.html`), Vandaag
  (`vandaag.html`), Apparaten (`apparaten.html`), Opbrengst (`opbrengst.html`),
  de Assistent (`assistent.html`), Kamer met de bladen per apparaat
  (`kamer.html`), Instellingen (`instellingen.html`), Wat je huis kan
  (`huis-kan.html`), Kamers en indeling (`indeling.html`), Zon en aansluiting
  (`aansluiting.html`) en Meters en prijzen (`meters.html`). De proef
  `nieuw.html` is weg. Zonder verbinding toont elke pagina de laatste stand,
  grijs ([82]). De app blijft dun: alles komt
  kant-en-klaar uit de dienst ([94], [76]).
- **Gebouwd met Tailwind,** met een bouwstap ([24]). De terugblik is een andere
  waarheid dan de live stand ([26]) en gaat verder waar hij was ([63]).
- **Voor de bewoner:** nooit een entity-ID ([45]); alleen een oorzaak die
  gemeten is ([88]); toegankelijk en tweetalig ([86]); donker, later ook licht
  en met een eigen accentkleur ([87]).
- **Het weer** van vandaag en vijf dagen komt van Buienradar uit Home Assistant,
  met wat de panelen dan leveren: de geleerde heldere lucht maal de zonkans,
  bijgesteld met de eigen opbrengst. Alleen om te tonen ([105]).
- **Camera's** zijn te bekijken in Kamer, alleen lezen en alleen met inlog
  ([106]). Bij aanbellen toont elke open pagina het beeld van de deurbel
  ([107]).
- **Als app op de telefoon** schermvullend via https in het eigen tailnet, met
  Tailscale serve en nooit Funnel ([108]). In de add-on via een eigen poort
  naast Ingress, alleen via een dienst in Tailscale en met een eigen inlog via
  Home Assistant ([160]).
- **Wat per huis verschilt, is een instelling** die de app wegschrijft, met een
  voorstel uit Home Assistant. Camera's en de deurbel eerst; de rest staat in
  `docs/universeel.md` ([109]).
- **Prijzen zoals op het contract:** normaal en dal (de meter zegt welk tarief),
  salderen tot 2027 en daarna een vergoeding min kosten, en vaste posten per dag,
  maand of jaar ([110]).
- **Licht bedienen en de weerbron** stel je in bij Functies; `HEMS_LIGHTS` blijft
  de grens van de installatie, en het weer komt van Buienradar of van elke
  weerentiteit van Home Assistant ([111]), alleen van een weerdienst ([113]).
- **Buitenruimtes** hebben elk hun plek in de tekening: oprit, tuin, terras,
  voortuin en balkon ([113]).
- **Inrichten** zet de schermen per huis op een rij, met een balk naar de
  volgende stap ([114]).
- **De assistent** leest ook een vraag in eigen woorden, over het huis en over
  de app, met een woordzoeker ([115]).
- **Het jaar in Opbrengst** begint op de startdatum van het contract ([116]).
- **De hoofdzekering** stel je in de app in, en die gaat voor de configuratie
  ([117]).
- **Uitrollen** gaat na de winter via een eigen add-on-bibliotheek op GitHub;
  HACS alleen voor de integratie ([118]).
- **Kamers hebben een soort,** te kiezen bij Indeling, met een voorstel uit de
  naam; ingezoomd staat de inrichting erin ([119]). Een kelder of trapkast
  blijft bij de begane grond.
- **Een liggende telefoon** toont de tabletweergave ([120]).
- **Schermen** bedien je in de app; RTS zonder terugmelding alleen open, dicht
  en stop, en alleen io mag later in de regeling ([121]).
- **Batterijen** staan bij het apparaat, met een melding onder de 10%; de
  verwarming en haar aanvoertemperatuur vul je in bij Zon en aansluiting
  ([122]).
- **Meten met:** per kamer kies je zelf de sensoren; de regeling rekent met het
  gemiddelde, en `sensoren.ndjson` houdt bij welke telden ([123]).
- **Op de tablet** schuiven volle vakken met de vinger, verschuift het
  toetsenbord niets, en zegt een kamer in de schaduw "zou" ([124]).
- **Het screen** sleep je zoals in de schets; **Opbrengst** onthoudt wat al
  uitgerekend is ([125]).
- **Radiatorknoppen** en ander klimaat buiten de configuratie staan in het huis
  en in het logboek; via ZHA zegt de app wat Zigbee2MQTT erbij geeft ([126]).
- **Open-Meteo** geeft weer zonder Home Assistant en de verwachting per uur
  wordt bewaard; de **batterijlijst** opent op Thuis ([127]).
- **Wat je koos blijft staan** tot Home Assistant het doorgeeft; het
  **zonnescherm** toont de laatste opdracht; het **weer per uur** staat onder
  Vandaag ([128]).
- **Airco's** krijgen drogen en hun filter, met een melding onder 10%; gekleurd
  licht is te zien in het huis ([129]).
- **Instellingen** staan in zes groepen met één opbouw, en wat mist staat
  bovenaan; **Comfort** zet je in de app, en de regeling neemt het meteen over;
  **Wat je huis kan** toont per functie hoe het ervoor staat ([130]).
- **Versie 0.9.0**, met wat er nieuw is; elke kamer heet overal zoals in
  Indeling; Comfort heeft een schakelaar per dagdeel; de batterijen zijn altijd
  te zien ([131]).
- **Per kamer** staat bij Indeling wat er warmt en koelt; een elektrische bron
  mag op zon opwarmen, en Wat je huis kan zegt in welke kamers iets werkt
  ([132]).
- **Comfort** zegt per dagdeel wanneer het aan- en uitgaat, wat er op zon
  gebeurt, en per kamer of koelen van het net mag ([133]).
- **Voorrang** geldt per richting, koelen en verwarmen; **Hoe voelt het** geeft
  een antwoord en een voorstel ([134]); sinds [147] vraagt ook dat een inlog.
- **Vrijgeven:** het werk gaat naar `beta`; de CI zet `stable` voor de NAS
  vooruit, en naar `main` gaat het alleen met een pull request dat de bewoner
  samenvoegt. De repository is openbaar en opgeschoond: geen export van Home
  Assistant en geen configuratie van een echte woning in git ([152]).
- **De add-on** komt kant-en-klaar van GitHub, voor de Pi en voor amd64; zijn
  versie is die van de app, en Home Assistant werkt bij als die op `main`
  omhooggaat ([153]).
- **In de add-on** opent de app, en een leeg huis begint met een welkom: het
  huis groeit uit Home Assistant, één knop naar Inrichten, of een back-up
  terugzetten. Alleen een verplichte keuze zonder voorstel wordt een vraag
  ([154]).
- **Volledig scherm** kies je per apparaat bij Bewoners en toegang › Dit
  scherm: Home Assistant verbergt dan zelf zijn zijbalk en kopbalk, en een
  knop boven de bel brengt je terug ([155]).
- **Vandaag** vult wat het eigen logboek nog niet heeft aan uit de statistiek
  van Home Assistant; een back-up zet in de add-on ook de configuratie terug
  ([156]).
- **Inrichten** heeft onderaan overal Terug en Volgende, en Volgende bewaart
  wat er in beeld staat; de balkjes zeggen wat nagelopen is en wat al klaar
  stond. Kamers samenvoegen tot één ruimte met zones, elk deel rond het huis
  apart, geen panelen of het aantal per kant, eerst het contract en dan de
  prijzen met teruglevering vanaf 2027 ([158]).
- **Thuis op de telefoon** heeft de Assistent altijd in beeld, in een
  vraagbalk boven de tabs; de microfoon ernaast luistert meteen. Bovenin één
  regel knoppen, de kamers in één kaart, en daaronder Straks, het apparaat,
  Hoe voelt het en Vandaag, net als op de wand ([159]).
- **Thuis naar eigen smaak:** op de telefoon kies en schuif je zelf de kaarten
  en vier favorieten met één tik, bewaard bij je account; de wand heeft vier
  vakken, die de hoofdgebruiker aanpast, en Straks schuift er vanzelf bij
  ([162]). Per account kies je eenvoudig of uitgebreid, grotere letters en
  minder beweging ([164]).
- **Het scherm aan de wand** (bij Bewoners een scherm) is als niemand kijkt
  een always-on display: overdag de dagstand, na zonsondergang gedimd. 's Nachts
  en als niemand thuis is gaat het uit na een tijd zonder beweging; beweging
  zet het weer aan, een tik of "Hé huis" opent de app ([164], [165]). Draait
  de droger, dan staat hij erop, en zegt Thuis dat hij draait ([166]).
- **Negentien punten van de bewoner** ([166]): de assistent zegt "niet
  begrepen" één keer en stopt daarna stil bij ruis, noemt hardop voorbeelden,
  zegt "ep" en kent het weer van vandaag. Het huis tekent golven op de vloer,
  de airco onder het dak binnen het dak, precies zoveel panelen per kant, een
  tuinhuis om op te tikken, een garage en een carport. Inrichten past op elk
  scherm, scheidt apparaten en klimaat, verplaatst apparaten en kamers (ook
  door te slepen in het huis), heeft buiten één lijst met delen en bewoners om
  aan te tikken. Een scherm stel je in vanaf elk apparaat, en de wand heeft
  pijltjes en "+ Kaart".
- **Achttien punten van de bewoner** ([167]): de droger zegt "klaar" als het
  drogen klaar is, ook als de trommel nog tegen kreuken draait, met de echte
  eindtijd uit de resterende tijd; hij staat tegen de achtermuur. De kaarten op
  de wand schuiven, zoveel als je wilt, met alleen een greep. Weergave (dit
  scherm, always-on, scherm uit) staat bij Functies, wie je bent bij Bewoners.
  Buiten heeft eigen soorten en zones, Meten met en de regeling staan bij
  Verwarmen en koelen, en de Nest is de thermostaat van de cv-ketel. Apparaten
  op zon gaan uit met een schakelaar, Licht en screens staat per kamer bij
  Functies, "Automatisch" legt de standen uit, en Onderhoud zegt wat bijna op
  is. "Van je dak" heet nu "van je panelen".
- **Favorieten** kies je per kamer, de lampen eerst en de scènes ingeklapt
  eronder; het always-on display heeft een dagstand (vanaf het einde van de
  nacht tot zonsondergang) en een avondstand, elk met een schakelaar ([168]).
- **Wie er thuis is:** op Thuis een rondje per bewoner (op de wand bovenin, op
  de telefoon naast de begroeting); thuis licht op, meteen zoals Home Assistant
  het ziet, en wie gevolgd wordt heeft een ring. Een tik opent het blad om te
  kiezen wiens comfort geldt ([169], [170]).
- **Favorieten, rookmelders en de gevel** ([170]): twaalf favorieten, vier per
  pagina, ook screens, elk met het icoon van zijn kamer; vasthouden opent de
  kamer. Een rookmelder (zoals de Nest Protect) staat in zijn kamer; ziet hij
  rook, koolmonoxide of hitte, dan toont elk scherm een alarm, en staat het bij
  Meldingen. De wand heeft een vaste helderheid per stand. De gevel meet je op
  aan de omtrek van het huis in OpenStreetMap, na een tik. De assistent sluit
  af op "oké, bedankt" en negeert ruis; het beeld bij aanbellen begint met een
  plaatje, en de wand houdt zijn toegang via Home Assistant zelf vast.
- **Bijwerken vanuit de app:** in de add-on zegt Meldingen dat er een nieuwe
  versie klaarstaat; een tik geeft wat er nieuw is (uit `addon/CHANGELOG.md`,
  via Home Assistant) en voor de beheerder een knop Bijwerken ([171]). Ook op
  het always-on display van de wand, met een tik naar Bijwerken.
- **Een groep instellingen** toont zijn delen als lijst met een icoon, wat
  mist bovenaan. Op de telefoon opent een deel als eigen scherm met terug naar
  de lijst, en onderaan Vorige en Volgende; op de wand past elk deel zonder
  scrollen en zit de uitleg achter *Waarvoor is dit?* ([163]).
- **Meldingen** staan achter de bel in het menu, met Onderhoud en na een update
  wat er nieuw is ([136]). Wanneer een batterij of filter een melding geeft,
  kies je bij Functies › Meldingen; standaard onder de 10% ([149]).
- **Verwacht naast echt:** bij Vandaag, Thuis en Opbrengst staat de
  zonverwachting naast wat er kwam, en bij Gisteren hoe het de afgelopen twee
  weken klopte ([137]).
- **De regeling per kamer** staat in de app: bij Indeling per apparaat of het
  de kamer op temperatuur houdt, op zon helpt of alleen kijkt; een nieuw
  apparaat doet meteen mee ([138]).
- **Inrichten** gebeurt op één pagina: links het huis dat meegroeit, rechts
  één vraag per stap, alles meteen bewaard ([139]). Vijf hoofdstukken met
  kleine stappen, van buiten tot de wand; daarna een film van twintig tellen
  met je eigen cijfers en een rondleiding langs alle tabbladen ([144]). Zes
  hoofdstukkaarten zoals de schets, en de film is een dag in je huis van 45
  seconden, met muziek die opbouwt naar een drop ([146]).
  Een zone heeft een soort, zoals zithoek of keuken; kamers en zones schuiven
  naar links of rechts. Een scherm hangt aan een gevel, en zegt alleen zon als
  die op zijn gevel staat ([145]).
- **Vandaag** is de dag in de tijd; **Apparaten** is het nu, per apparaat een
  kaart met wat het doet, vraagt en vandaag op zon deed ([140]).
- **De assistent** is een gesprek: het huis begroet je, leest zijn antwoord
  voor met Piper uit Home Assistant, en vraagt of het nog iets kan doen
  ([141]). Hij zegt eerst het antwoord, kort en warm, spreekt eenheden en
  tijden uit zoals je ze zegt, en kent ook morgen en wat iets kost ([142]).
  Met een taalmodel uit Home Assistant (een AI-taak, standaard uit) zegt hij
  het vaste antwoord in eigen woorden; elk getal moet kloppen, anders het vaste
  antwoord. Lampen, scènes en schermen bedien je met een zin, via dezelfde
  deuren als de knoppen; een garagedeur is geen scherm meer ([148]).
  Met je stem: de wand luistert naar "Hé huis" (een eigen getraind wekwoord),
  de telefoon met een microfoonknop; Home Assistant hoort en schrijft uit, in
  huis, en de tekst gaat daarna als een getypte zin verder ([150]).
- **Een kamer doet mee** met de regeling van een andere kamer, zoals een
  slaapkamer met de airco in de wasruimte ([142]).
- **Comfort per bewoner:** wie hier woont staat op volgorde; de eerste die
  thuis is, bepaalt het comfort, na tien minuten rust. Bewoners komen erbij
  door één keer in te loggen; de wand is een scherm. De hele app vraagt een
  inlog; de assistent van Home Assistant heeft een sleutel ([147]). Een scherm
  krijgt bij Bewoners een andere naam, of gaat weg ([149]). Een account zonder
  persoon in Home Assistant is een gast; alleen de hoofdgebruiker maakt er een
  bewoner van, en een gast verandert geen instellingen ([151]).
- **Comfort uit de app gaat voor** de helpers van het oude systeem; het huis
  heeft een voordeur, de meterkast, de camera, de tuin en de buitenunits zoals
  ze zijn ([143]).
- **Meldingen** alleen voor wat de regeling raakt ([79]). Zonder verbinding toont
  de tablet de laatste stand, gemarkeerd ([82]).

## Veiligheid

- **De schaduw schrijft niet naar Home Assistant,** en dat is een grens in de
  code ([15]). Er zijn zes smalle deuren, elk getest: de onboarding achter
  Ingress ([42]), gevoel ([84]), indeling ([96]) en "klaar voor" bij de droger
  ([101]) naar eigen bestanden, lampen aan en uit ([97]) en de scènes van de
  eigen ruimtes ([100]). De eigen add-on bijwerken mag alleen met
  `update.install` op zijn eigen update ([171]). Klimaat en screens blijven
  dicht tot B.
- **De weergave luistert,** maar alleen om te lezen ([23]). De hele app vraagt
  een inlog met je Home Assistant-account, ook kijken ([147]); de dienst
  antwoordt alleen op bekende hostnamen ([99]).
- **Licht in kleur en wit gaat door de deur van de lampen; Hue-scènes van de
  eigen ruimtes krijgen een eigen smalle deur** ([100]).
- **De ruwe export van Home Assistant** hoort niet in git ([38]).
- **In de add-on** opent de app via Ingress; een eigen link pas met een eigen
  inlog ([77]). Iedereen in huis bedient, één beheert ([80]). Het paneel staat
  bij iedereen met een account in de zijbalk; beheerder is ook achter Ingress
  wie dat in Home Assistant is, en een gast blijft een gast ([161]).

## Uitrol en beheer

- **De NAS draait,** de add-on wacht tot B ([53]). De Pi kan het aan, gemeten
  ([17b]), anders dan eerst gevreesd ([17]). De add-on is dezelfde dienst
  ([36]), platgeslagen voor de Supervisor ([37]).
- **`deploy.sh`** weet wat er draait ([19]), staat buiten `src/` ([20]), behandelt
  het compose-bestand als bouwinstructie ([25]), vraagt het nieuwe image of het
  de configuratie snapt ([33]), haalt alleen op wat de server draait ([35]), en
  kent de valkuilen van de Taakplanner ([22]).
- **De configuratie** blijft op de NAS buiten git ([21]). Een bewaking tegen
  vastlopen ([18]) en een mail als de opname stilvalt ([67]).
- **Echt schakelen** pas met een complete winter en alle functies ([64]).

## Kwaliteitsbewaking

- **De CI staat vóór de NAS:** alleen groen schuift `stable` op ([54]), na
  een push naar `beta` ([152]). De
  pagina en `deploy.sh` worden ook getest ([69]); een mislukte paginatest laat
  een trace achter.
- **Regels voor elke toestand** over duizenden gegenereerde standen ([56]), een
  linter met een handvol regels ([57]), en de opstart als één zuivere functie
  ([55]).
- **Namen in het Engels,** de rest in het Nederlands ([59]).

<!-- links:begin -->
[1]: DECISIONS.md#1-weg-van-yaml-niet-omdat-het-niet-werkte
[2]: DECISIONS.md#2-een-pure-kern
[3]: DECISIONS.md#3-een-vermogensbudget-in-plaats-van-een-vlag
[4]: DECISIONS.md#4-strategieën-stellen-voor-één-arbiter-beslist
[5]: DECISIONS.md#5-afwezigheid-van-vraag-is-niet-de-taak-van-een-strategie
[6]: DECISIONS.md#6-tijd-is-invoer-ook-buiten-de-kern
[7]: DECISIONS.md#7-een-fout-hoort-luid-te-falen
[8]: DECISIONS.md#8-handmatig-is-een-modus-waarin-de-regeling-zich-terugtrekt
[8b]: DECISIONS.md#8b-de-knop-staat-op-twee-plekken-de-vertaling-keek-er-maar-naar-één
[9]: DECISIONS.md#9-configuratie-als-json-niet-yaml-niet-meteen-een-database
[10]: DECISIONS.md#10-validatie-met-de-hand-zonder-bibliotheek
[11]: DECISIONS.md#11-het-logboek-is-zelfvoorzienend
[12]: DECISIONS.md#12-episodes-geen-percentages
[13]: DECISIONS.md#13-meten-en-de-beperkingen-erbij-vermelden
[14]: DECISIONS.md#14-geen-rc-model-per-huis
[15]: DECISIONS.md#15-schaduwmodus-schrijft-niet-structureel
[16]: DECISIONS.md#16-filteren-op-wat-ons-aangaat
[17]: DECISIONS.md#17-op-de-nas-niet-op-de-pi
[17b]: DECISIONS.md#17b-gemeten-en-de-vrees-blijkt-ongegrond
[18]: DECISIONS.md#18-een-bewaking-tegen-vastlopen
[19]: DECISIONS.md#19-het-uitrolscript-weet-wat-er-draait
[20]: DECISIONS.md#20-het-uitrolscript-staat-buiten-src
[21]: DECISIONS.md#21-de-configuratie-blijft-buiten-git-op-de-nas
[22]: DECISIONS.md#22-de-taakplanner-is-een-andere-omgeving-dan-een-shell
[23]: DECISIONS.md#23-de-schaduwdienst-gaat-luisteren-maar-alleen-om-te-lezen
[24]: DECISIONS.md#24-tailwind-met-een-bouwstap-niet-via-een-cdn
[25]: DECISIONS.md#25-het-compose-bestand-is-een-bouwinstructie-geen-voorkeur
[26]: DECISIONS.md#26-de-terugblik-hoort-bij-de-weergave-maar-is-een-andere-waarheid
[27]: DECISIONS.md#27-de-datasetmeter-meet-dekking-niet-duur
[27b]: DECISIONS.md#27b-het-eerste-getal-was-te-vriendelijk
[28]: DECISIONS.md#28-de-schaduwmodus-is-geen-steiger
[29]: DECISIONS.md#29-twee-applicaties-en-dat-is-geen-tussenoplossing
[30]: DECISIONS.md#30-buitentemperatuur-naar-voren-gehaald
[30b]: DECISIONS.md#30b-en-toen-zochten-we-naar-het-volgende-gat
[31]: DECISIONS.md#31-de-vertaling-had-een-tweede-configuratie-in-zich
[32]: DECISIONS.md#32-wat-in-code-stond-kon-niet-per-woning-verschillen
[33]: DECISIONS.md#33-de-uitrol-vraagt-het-nieuwe-image-of-het-de-oude-configuratie-snapt
[34]: DECISIONS.md#34-hybride-saas--verborgen-ha-met-een-dunne-agent
[35]: DECISIONS.md#35-een-server-draagt-alleen-wat-hij-draait
[36]: DECISIONS.md#36-de-add-on-is-dezelfde-dienst-niet-een-tweede
[37]: DECISIONS.md#37-de-add-on-wordt-platgeslagen-voordat-de-supervisor-hem-bouwt
[38]: DECISIONS.md#38-de-ruwe-ha-export-hoort-niet-in-versiebeheer
[39]: DECISIONS.md#39-de-modus-en-de-timers-horen-bij-de-dienst-niet-bij-home-assistant
[40]: DECISIONS.md#40-het-schema-weigert-alleen-nog-op-wat-er-echt-niet-zonder-kan
[41]: DECISIONS.md#41-de-ontdekking-stelt-voor-en-besluit-niet
[42]: DECISIONS.md#42-de-weergave-mag-schrijven-waar-home-assistant-de-deur-bewaakt
[43]: DECISIONS.md#43-een-meetwaarde-mag-in-een-attribuut-zitten
[44]: DECISIONS.md#44-de-assistent-is-een-vierde-voorsteller-geen-baas
[45]: DECISIONS.md#45-een-bewoner-ziet-nooit-een-entity-id
[46]: DECISIONS.md#46-het-huis-leert-wat-het-ís-niet-wat-het-moet-doen
[47]: DECISIONS.md#47-de-opbrengst-van-de-panelen-is-de-instralingsmeter
[48]: DECISIONS.md#48-de-dataset-komt-er-met-een-knop-uit-als-targz
[49]: DECISIONS.md#49-de-schaduw-meet-zijn-eigen-geschiedenis
[49b]: DECISIONS.md#49b-de-veronderstelling-blijft-bij-de-meter-en-bij-de-bewoner
[50]: DECISIONS.md#50-comfort-mag-koelen-boven-een-plafond-ook-op-netstroom
[51]: DECISIONS.md#51-starten-vraagt-meer-dan-draaien
[52]: DECISIONS.md#52-de-dienst-legt-de-ruwe-historie-zelf-vast
[53]: DECISIONS.md#53-de-nas-is-de-primaire-omgeving-de-add-on-wacht-tot-stap-b
[54]: DECISIONS.md#54-een-machine-kijkt-mee
[55]: DECISIONS.md#55-de-opstart-is-één-zuivere-functie
[56]: DECISIONS.md#56-regels-die-voor-elke-toestand-gelden
[57]: DECISIONS.md#57-een-linter-met-een-handvol-regels
[58]: DECISIONS.md#58-dagen-ouder-dan-een-week-worden-gecomprimeerd
[59]: DECISIONS.md#59-namen-in-het-engels-de-rest-in-het-nederlands
[60]: DECISIONS.md#60-de-schaduw-gebruikt-zijn-eigen-stabilisatietimer
[61]: DECISIONS.md#61-parkeren-start-de-stabilisatie
[62]: DECISIONS.md#62-de-eigen-stand-overleeft-een-herstart
[63]: DECISIONS.md#63-de-terugblik-gaat-verder-waar-hij-was
[64]: DECISIONS.md#64-echt-schakelen-pas-met-een-complete-winter-en-alle-functies
[65]: DECISIONS.md#65-wat-het-thermisch-model-nodig-heeft-wordt-nu-al-vastgelegd
[66]: DECISIONS.md#66-bij-elk-besluit-is-na-te-gaan-welke-versie-het-nam
[67]: DECISIONS.md#67-een-mail-als-de-opname-stilvalt
[68]: DECISIONS.md#68-hooguit-één-start-per-beslissing
[69]: DECISIONS.md#69-ook-de-pagina-en-deploysh-worden-getest
[70]: DECISIONS.md#70-elke-opstelling-werkt-de-regeling-doet-wat-de-opstelling-toelaat
[71]: DECISIONS.md#71-de-schetsen-van-de-app-zijn-de-maatstaf
[72]: DECISIONS.md#72-kamers-en-zones-horen-bij-de-app-home-assistant-levert-de-apparaten
[73]: DECISIONS.md#73-elk-huis-doorloopt-drie-fasen-en-de-bewoner-doet-vanaf-dag-één-mee
[74]: DECISIONS.md#74-wie-zelf-ingrijpt-wordt-herkend-en-met-rust-gelaten
[75]: DECISIONS.md#75-een-opdracht-aan-de-assistent-wordt-een-ingreep-met-een-eindtijd
[76]: DECISIONS.md#76-de-testpagina-is-een-prototype-de-echte-app-krijgt-een-bewonerscontract
[77]: DECISIONS.md#77-de-add-on-opent-via-home-assistant-een-eigen-link-pas-met-een-eigen-inlog
[78]: DECISIONS.md#78-geavanceerde-functies-volgen-uit-wat-het-huis-heeft-ingrijpende-vragen-een-bewuste-keuze
[79]: DECISIONS.md#79-wat-een-pushmelding-krijgt-en-wat-in-de-app-blijft
[80]: DECISIONS.md#80-iedereen-in-huis-bedient-één-beheert
[81]: DECISIONS.md#81-een-zone-met-meer-sensoren-koelt-op-de-warmste-en-verwarmt-op-de-koudste
[82]: DECISIONS.md#82-zonder-verbinding-toont-de-tablet-de-laatste-stand-gemarkeerd
[83]: DECISIONS.md#83-ruwe-data-twee-jaar-daarna-samengevat
[84]: DECISIONS.md#84-gevoel-en-toelichting-mogen-deze-winter-via-de-testpagina-naar-een-eigen-bestand
[85]: DECISIONS.md#85-bij-zon-over-eerst-comfort-dan-de-batterij-dan-de-auto
[86]: DECISIONS.md#86-de-app-is-vanaf-het-begin-toegankelijk-en-tweetalig
[87]: DECISIONS.md#87-donker-met-later-een-lichte-versie-en-een-eigen-accentkleur
[88]: DECISIONS.md#88-de-app-noemt-alleen-een-oorzaak-die-gemeten-is
[89]: DECISIONS.md#89-elke-omvormer-werkt-de-app-meet-hoe-snel-de-zonnesensor-is-en-wijst-de-lokale-weg
[90]: DECISIONS.md#90-alleen-sturen-wat-afwijkt-slimmere-timing-moet-eerst-in-de-replay-winnen
[91]: DECISIONS.md#91-de-add-on-krijgt-een-eigen-integratie-de-bewoner-plakt-geen-yaml
[92]: DECISIONS.md#92-zonwering-hoort-bij-het-klimaat-verlichting-regelt-smart-climate-niet
[93]: DECISIONS.md#93-hoe-het-huis-en-de-panelen-liggen-meet-de-app-zelf-de-bewoner-bevestigt
[94]: DECISIONS.md#94-de-schaduwweergave-is-voor-de-cijfers-de-proefomgeving-voor-de-app
[95]: DECISIONS.md#95-etage-kamer-en-zone-een-vaste-opbouw-in-de-app-herkend-uit-home-assistant
[96]: DECISIONS.md#96-stap-c-loopt-naast-de-schaduw-en-b-indelen-kan-al-in-de-proefomgeving
[97]: DECISIONS.md#97-lampen-aan-en-uit-vanuit-de-app-alles-groepen-zijn-geen-lamp
[98]: DECISIONS.md#98-uitstelbare-apparaten-de-droger-draait-op-zon-via-de-arbiter
[99]: DECISIONS.md#99-bedienen-vraagt-een-inlog-met-je-home-assistant-account-kijken-blijft-open
[100]: DECISIONS.md#100-licht-in-kleur-en-wit-en-de-scènes-van-hue-aanvulling-op-97
[101]: DECISIONS.md#101-klaar-voor-bij-de-droger-is-per-keer-te-kiezen
[102]: DECISIONS.md#102-opbrengst-meters-en-prijzen-in-de-app-de-cijfers-uit-home-assistant
[103]: DECISIONS.md#103-de-zon-en-je-aansluiting-de-app-vraagt-de-regeling-vult-aan-waar-de-configuratie-zwijgt
[104]: DECISIONS.md#104-ontwerp-2-is-de-maatstaf-en-de-schets-is-de-code
[105]: DECISIONS.md#105-het-weer-van-de-komende-dagen-met-wat-de-panelen-dan-leveren
[106]: DECISIONS.md#106-de-cameras-bekijken-in-de-app-alleen-lezen-en-alleen-met-inlog
[107]: DECISIONS.md#107-aanbellen-het-beeld-van-de-deurbel-meteen-op-het-scherm
[108]: DECISIONS.md#108-https-in-het-tailnet-met-tailscale-serve
[109]: DECISIONS.md#109-wat-van-dit-huis-is-wordt-een-instelling-cameras-en-de-deurbel-eerst
[110]: DECISIONS.md#110-prijzen-zoals-op-het-contract-normaal-en-dal-salderen-vaste-posten
[111]: DECISIONS.md#111-licht-bedienen-en-de-weerbron-zijn-een-functie
[112]: DECISIONS.md#112-etages-vrij-toevoegen-met-de-vaste-namen-als-voorstel
[113]: DECISIONS.md#113-meer-buitenruimtes-in-de-tekening-en-alleen-weer-van-weerdiensten
[114]: DECISIONS.md#114-inrichten-een-wizard-over-de-schermen-die-er-al-zijn
[115]: DECISIONS.md#115-de-assistent-leest-een-vraag-in-eigen-woorden-met-een-woordzoeker
[116]: DECISIONS.md#116-het-jaar-van-opbrengst-begint-op-de-startdatum-van-het-contract
[117]: DECISIONS.md#117-de-hoofdzekering-stel-je-in-de-app-in-die-gaat-voor-de-configuratie
[118]: DECISIONS.md#118-uitrollen-via-een-eigen-add-on-bibliotheek-op-github
[119]: DECISIONS.md#119-kamers-krijgen-een-soort-ingezoomd-staat-de-inrichting-erin
[120]: DECISIONS.md#120-een-liggende-telefoon-toont-de-tabletweergave
[121]: DECISIONS.md#121-schermen-bedien-je-in-de-app-alleen-somfy-io-mag-later-in-de-regeling
[122]: DECISIONS.md#122-batterijen-bij-het-apparaat-en-de-verwarming-met-haar-aanvoertemperatuur
[123]: DECISIONS.md#123-meten-met-per-kamer-zelf-de-sensoren-kiezen
[124]: DECISIONS.md#124-op-de-tablet-volle-vakken-schuiven-het-toetsenbord-verschuift-niets-en-zou-in-de-schaduw
[125]: DECISIONS.md#125-het-screen-zoals-de-schets-en-opbrengst-onthoudt-wat-al-uitgerekend-is
[126]: DECISIONS.md#126-radiatorknoppen-en-ander-klimaat-buiten-de-configuratie-zien-en-vastleggen
[127]: DECISIONS.md#127-het-weer-van-open-meteo-de-batterijlijst-en-een-apparaat-via-twee-koppelingen
[128]: DECISIONS.md#128-wat-je-koos-blijft-staan-het-zonnescherm-het-weer-per-uur-en-een-bredere-wand
[129]: DECISIONS.md#129-drogen-en-het-filter-van-de-airco-gekleurd-licht-en-wat-er-nog-wegviel
[130]: DECISIONS.md#130-instellingen-in-zes-groepen-en-comfort-zet-je-in-de-app
[131]: DECISIONS.md#131-versie-090-één-naam-per-kamer-en-wat-na-een-grondige-test-niet-klopte
[132]: DECISIONS.md#132-verwarmen-en-koelen-per-kamer-op-zon-en-waar-het-werkt
[133]: DECISIONS.md#133-comfort-zegt-wanneer-en-waarmee-aan-en-uit-zon-en-net
[134]: DECISIONS.md#134-voorrang-per-richting-en-hoe-voelt-het-met-een-antwoord
[136]: DECISIONS.md#136-meldingen-in-de-app
[137]: DECISIONS.md#137-verwacht-naast-echt-of-de-zonverwachting-klopte
[138]: DECISIONS.md#138-de-regeling-per-kamer-in-de-app
[139]: DECISIONS.md#139-inrichten-in-één-keer-het-filmpje-en-de-rondleiding
[140]: DECISIONS.md#140-vandaag-is-de-tijd-apparaten-is-het-nu
[141]: DECISIONS.md#141-de-assistent-als-gesprek-met-een-stem
[142]: DECISIONS.md#142-een-kwaliteitsronde-een-kamer-doet-mee-met-een-andere-en-de-assistent-klinkt-als-een-mens
[143]: DECISIONS.md#143-comfort-uit-de-app-gaat-voor-de-oude-helpers-en-het-huis-zoals-het-is
[144]: DECISIONS.md#144-na-inrichten-is-de-app-af-een-film-van-twintig-tellen-en-een-rondleiding-langs-alles
[145]: DECISIONS.md#145-een-zone-heeft-een-soort-en-kamers-en-zones-schuiven
[146]: DECISIONS.md#146-inrichten-zoals-de-schets-en-de-film-als-een-dag-in-je-huis
[147]: DECISIONS.md#147-comfort-per-bewoner-en-inloggen-voor-de-hele-app
[148]: DECISIONS.md#148-de-assistent-zegt-het-in-eigen-woorden-en-bedient-licht-en-schermen-met-een-zin
[149]: DECISIONS.md#149-wanneer-een-batterij-of-filter-een-melding-geeft-een-scherm-beheren-en-een-eigen-comfort-dat-weer-lukt
[150]: DECISIONS.md#150-praten-met-je-stem-de-microfoon-en-hé-huis-op-de-wand
[151]: DECISIONS.md#151-een-gast-zonder-persoon-een-back-up-opnieuw-beginnen-en-een-export-voor-onderzoek
[152]: DECISIONS.md#152-openbaar-en-het-werk-gaat-via-beta
[153]: DECISIONS.md#153-de-add-on-komt-kant-en-klaar-van-github
[154]: DECISIONS.md#154-de-add-on-opent-de-app-en-een-leeg-huis-begint-met-een-welkom
[155]: DECISIONS.md#155-volledig-scherm-in-home-assistant-per-apparaat
[156]: DECISIONS.md#156-de-eerste-dag-uit-home-assistant-en-een-back-up-met-zijn-configuratie
[157]: DECISIONS.md#157-hoe-de-panelen-liggen-gemeten-uit-tien-dagen-opbrengst-de-bewoner-bevestigt
[158]: DECISIONS.md#158-inrichten-overal-terug-en-volgende-en-wat-de-bewoner-tegenkwam
[159]: DECISIONS.md#159-thuis-op-de-telefoon-de-assistent-altijd-in-beeld
[160]: DECISIONS.md#160-smart-climate-los-op-de-telefoon-een-eigen-poort-in-de-add-on-via-tailscale
[161]: DECISIONS.md#161-het-paneel-voor-iedereen-en-achter-ingress-de-rol-uit-home-assistant
[162]: DECISIONS.md#162-thuis-naar-eigen-smaak-kaarten-en-favorieten-per-account-en-voor-de-wand
[163]: DECISIONS.md#163-een-groep-instellingen-de-delen-onder-elkaar-een-deel-als-eigen-scherm
[164]: DECISIONS.md#164-de-wand-als-niemand-kijkt-en-de-weergave-per-account
[165]: DECISIONS.md#165-het-scherm-aan-de-wand-always-on-overdag-en-s-avonds-s-nachts-uit
[166]: DECISIONS.md#166-negentien-punten-van-de-bewoner-assistent-huis-inrichten-en-de-wand
[167]: DECISIONS.md#167-achttien-punten-van-de-bewoner-de-wand-de-droger-instellingen-en-inrichten
[168]: DECISIONS.md#168-favorieten-per-kamer-en-de-dagstand-en-avondstand-van-de-wand
[169]: DECISIONS.md#169-wie-er-thuis-is-en-wiens-comfort-geldt-rondjes-en-een-blad
[170]: DECISIONS.md#170-favorieten-met-paginas-rookmelders-de-gevel-op-de-kaart-en-wat-de-wand-liet-liggen
[171]: DECISIONS.md#171-bijwerken-vanuit-de-app-een-melding-wat-er-nieuw-is-en-een-knop
[172]: DECISIONS.md#172-de-app-is-af-opruimen-wat-er-nog-komt-en-talen-later
[173]: DECISIONS.md#173-sneller-bewaren-inpakken-en-het-huis-één-keer-uitrekenen
[174]: DECISIONS.md#174-het-huis-en-wie-er-thuis-is-live
[175]: DECISIONS.md#175-op-je-startscherm-en-de-favorieten-zoals-de-kaart
[176]: DECISIONS.md#176-apparaten-op-zon-in-de-voorrang-een-lijst-op-zon
[177]: DECISIONS.md#177-universeel-deel-1-het-wekwoord-mee-assist-zonder-nas-en-meldingen-live
[178]: DECISIONS.md#178-universeel-deel-2-regels-per-land-meer-merken-en-het-typeplaatje
<!-- links:einde -->
