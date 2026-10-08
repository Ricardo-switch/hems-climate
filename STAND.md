# Zo staat het nu

Het [besluitenlog](DECISIONS.md) is een geschiedenis: nieuwste onderaan, met wat
afviel en wat het kostte. Dit is de doorsnede: per onderwerp hoe het nu werkt,
in een paar regels, met de besluiten erbij. Wie het waarom zoekt, klikt door.

*Bijhouden:* verandert een besluit iets hieraan, pas dan ook deze pagina aan en
draai `npm run decisions:index` in `backend/`. Die zet de links onderaan. Een
test eist dat elk besluit dat nog geldt hier genoemd wordt, en dat elke
verwijzing bestaat.

*Stand: 7 oktober 2026.*

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
  batterij stuurt Smart Climate niet zelf ([85]).
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
  welke versie het nam ([66]).
- **De datasetmeter** telt tijd en dekking, en beide moeten 100% halen ([27b]).
  Het eerste getal was te vriendelijk ([27]).
- **Ligging en panelen** meet de app zelf; de bewoner bevestigt. Dit huis: oost
  en west, 6 + 6 panelen, 4.680 Wp op een omvormer van 3.000 W, de lichtsensor
  onder de dakgoot ([93]).

## Weergave

- **Twee weergaven:** `index.html` voor de cijfers, en de app. De app wordt per
  tab herbouwd in ontwerp 2 ([104]): Thuis (`thuis.html`), Vandaag
  (`vandaag.html`), Apparaten (`apparaten.html`) en Kamer met de bladen per
  apparaat (`kamer.html`) staan er; de andere tabs wijzen nog naar `nieuw.html`, de
  proef, die verdwijnt als alles over is. De app blijft dun: alles komt
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
  ([106]).
- **Meldingen** alleen voor wat de regeling raakt ([79]). Zonder verbinding toont
  de tablet de laatste stand, gemarkeerd ([82]).

## Veiligheid

- **De schaduw schrijft niet naar Home Assistant,** en dat is een grens in de
  code ([15]). Er zijn zes smalle deuren, elk getest: de onboarding achter
  Ingress ([42]), gevoel ([84]), indeling ([96]) en "klaar voor" bij de droger
  ([101]) naar eigen bestanden, lampen aan en uit ([97]) en de scènes van de
  eigen ruimtes ([100]). Klimaat en screens blijven dicht tot B.
- **De weergave luistert,** maar alleen om te lezen ([23]). Kijken blijft open
  op het thuisnetwerk en in het tailnet; bedienen vraagt een inlog met je
  Home Assistant-account, en de dienst antwoordt alleen op bekende hostnamen
  ([99]).
- **Licht in kleur en wit gaat door de deur van de lampen; Hue-scènes van de
  eigen ruimtes krijgen een eigen smalle deur** ([100]).
- **De ruwe export van Home Assistant** hoort niet in git ([38]).
- **In de add-on** opent de app via Ingress; een eigen link pas met een eigen
  inlog ([77]). Iedereen in huis bedient, één beheert ([80]).

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

- **De CI staat vóór de NAS:** alleen groen schuift `stable` op ([54]). De
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
<!-- links:einde -->
