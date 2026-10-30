# Besluitenlogboek

Waarom dit project is zoals het is. De code vertelt het *wat*; dit document
vertelt het *waarom*, inclusief de alternatieven die zijn afgevallen en wat een
besluit heeft gekost.

Nieuwste onderaan. Voeg een besluit toe zodra je merkt dat je een keuze
verdedigt die niet uit de code blijkt. Zet onder de kop een regel met onderwerp
en status, zoals bij de andere, en draai `npm run decisions:index` in
`backend/`. Wordt een besluit later gecorrigeerd of vervangen, pas dan zijn
status aan: wie via een zoekopdracht op een oud besluit belandt, hoort meteen te
zien dat het niet meer zo werkt. Een test in de CI bewaakt beide.

Hoe het nu staat, per onderwerp en zonder de geschiedenis: [STAND.md](STAND.md).
Verandert een besluit daar iets aan, werk die pagina dan mee bij.


<!-- index:begin -->

## Index

Per onderwerp. Een besluit dat later is gecorrigeerd of vervangen, staat er
toch in: het waarom blijft gelden voor wie het oude gedrag tegenkomt.
Gemaakt met `npm run decisions:index`; een test bewaakt dat hij klopt.

**Visie en principes**

- [1. Weg van YAML, niet omdat het niet werkte](#1-weg-van-yaml-niet-omdat-het-niet-werkte)
- [7. Een fout hoort luid te falen](#7-een-fout-hoort-luid-te-falen)
- [28. De schaduwmodus is geen steiger](#28-de-schaduwmodus-is-geen-steiger)
- [29. Twee applicaties, en dat is geen tussenoplossing](#29-twee-applicaties-en-dat-is-geen-tussenoplossing)
- [34. Hybride SaaS — verborgen HA met een dunne agent](#34-hybride-saas--verborgen-ha-met-een-dunne-agent)
- [44. De assistent is een vierde voorsteller, geen baas](#44-de-assistent-is-een-vierde-voorsteller-geen-baas)
- [46. Het huis leert wat het ís, niet wat het moet doen](#46-het-huis-leert-wat-het-ís-niet-wat-het-moet-doen)
- [70. Elke opstelling werkt; de regeling doet wat de opstelling toelaat](#70-elke-opstelling-werkt-de-regeling-doet-wat-de-opstelling-toelaat)
- [71. De schetsen van de app zijn de maatstaf](#71-de-schetsen-van-de-app-zijn-de-maatstaf) — *aangevuld door 104*
- [73. Elk huis doorloopt drie fasen, en de bewoner doet vanaf dag één mee](#73-elk-huis-doorloopt-drie-fasen-en-de-bewoner-doet-vanaf-dag-één-mee)
- [75. Een opdracht aan de assistent wordt een ingreep met een eindtijd](#75-een-opdracht-aan-de-assistent-wordt-een-ingreep-met-een-eindtijd)
- [78. Geavanceerde functies volgen uit wat het huis heeft; ingrijpende vragen een bewuste keuze](#78-geavanceerde-functies-volgen-uit-wat-het-huis-heeft-ingrijpende-vragen-een-bewuste-keuze)
- [91. De add-on krijgt een eigen integratie; de bewoner plakt geen YAML](#91-de-add-on-krijgt-een-eigen-integratie-de-bewoner-plakt-geen-yaml) — *aangevuld door 184*
- [92. Zonwering hoort bij het klimaat; verlichting regelt Smart Climate niet](#92-zonwering-hoort-bij-het-klimaat-verlichting-regelt-smart-climate-niet) — *aangevuld door 97*
- [96. Stap C loopt naast de schaduw en B; indelen kan al in de proefomgeving](#96-stap-c-loopt-naast-de-schaduw-en-b-indelen-kan-al-in-de-proefomgeving)
- [104. Ontwerp 2 is de maatstaf, en de schets is de code](#104-ontwerp-2-is-de-maatstaf-en-de-schets-is-de-code)
- [172. De app is af: opruimen, wat er nog komt, en talen later](#172-de-app-is-af-opruimen-wat-er-nog-komt-en-talen-later)
- [184. De integratie Smart Climate: Assist zonder YAML](#184-de-integratie-smart-climate-assist-zonder-yaml)
- [210. De klimaatbrug: tot stap B via de knoppen van het oude systeem](#210-de-klimaatbrug-tot-stap-b-via-de-knoppen-van-het-oude-systeem)

**Kern en regeling**

- [2. Een pure kern](#2-een-pure-kern)
- [3. Een vermogensbudget in plaats van een vlag](#3-een-vermogensbudget-in-plaats-van-een-vlag)
- [4. Strategieën stellen voor, één arbiter beslist](#4-strategieën-stellen-voor-één-arbiter-beslist)
- [5. Afwezigheid van vraag is niet de taak van een strategie](#5-afwezigheid-van-vraag-is-niet-de-taak-van-een-strategie)
- [6. Tijd is invoer, ook buiten de kern](#6-tijd-is-invoer-ook-buiten-de-kern)
- [8. `handmatig` is een modus waarin de regeling zich terugtrekt](#8-handmatig-is-een-modus-waarin-de-regeling-zich-terugtrekt) — *aangevuld door 8b*
- [8b. De knop staat op twee plekken, de vertaling keek er maar naar één](#8b-de-knop-staat-op-twee-plekken-de-vertaling-keek-er-maar-naar-één)
- [16. Filteren op wat ons aangaat](#16-filteren-op-wat-ons-aangaat)
- [39. De modus en de timers horen bij de dienst, niet bij Home Assistant](#39-de-modus-en-de-timers-horen-bij-de-dienst-niet-bij-home-assistant)
- [49. De schaduw meet zijn eigen geschiedenis](#49-de-schaduw-meet-zijn-eigen-geschiedenis) — *gecorrigeerd door 49b*
- [49b. De veronderstelling blijft bij de meter en bij de bewoner](#49b-de-veronderstelling-blijft-bij-de-meter-en-bij-de-bewoner)
- [50. Comfort mag koelen boven een plafond, ook op netstroom](#50-comfort-mag-koelen-boven-een-plafond-ook-op-netstroom)
- [51. Starten vraagt meer dan draaien](#51-starten-vraagt-meer-dan-draaien)
- [60. De schaduw gebruikt zijn eigen stabilisatietimer](#60-de-schaduw-gebruikt-zijn-eigen-stabilisatietimer)
- [61. Parkeren start de stabilisatie](#61-parkeren-start-de-stabilisatie)
- [62. De eigen stand overleeft een herstart](#62-de-eigen-stand-overleeft-een-herstart)
- [68. Hooguit één start per beslissing](#68-hooguit-één-start-per-beslissing)
- [74. Wie zelf ingrijpt, wordt herkend en met rust gelaten](#74-wie-zelf-ingrijpt-wordt-herkend-en-met-rust-gelaten)
- [81. Een zone met meer sensoren koelt op de warmste en verwarmt op de koudste](#81-een-zone-met-meer-sensoren-koelt-op-de-warmste-en-verwarmt-op-de-koudste) — *aangevuld door 95*
- [85. Bij zon over: eerst comfort, dan de batterij, dan de auto](#85-bij-zon-over-eerst-comfort-dan-de-batterij-dan-de-auto)
- [89. Elke omvormer werkt; de app meet hoe snel de zonnesensor is en wijst de lokale weg](#89-elke-omvormer-werkt-de-app-meet-hoe-snel-de-zonnesensor-is-en-wijst-de-lokale-weg)
- [90. Alleen sturen wat afwijkt; slimmere timing moet eerst in de replay winnen](#90-alleen-sturen-wat-afwijkt-slimmere-timing-moet-eerst-in-de-replay-winnen)
- [98. Uitstelbare apparaten: de droger draait op zon, via de arbiter](#98-uitstelbare-apparaten-de-droger-draait-op-zon-via-de-arbiter) — *aangevuld door 101*
- [101. "Klaar voor" bij de droger is per keer te kiezen](#101-klaar-voor-bij-de-droger-is-per-keer-te-kiezen)
- [132. Verwarmen en koelen per kamer, op zon, en waar het werkt](#132-verwarmen-en-koelen-per-kamer-op-zon-en-waar-het-werkt)
- [134. Voorrang per richting, en Hoe voelt het met een antwoord](#134-voorrang-per-richting-en-hoe-voelt-het-met-een-antwoord)
- [138. De regeling per kamer in de app](#138-de-regeling-per-kamer-in-de-app)
- [176. Apparaten op zon in de voorrang: een lijst Op zon](#176-apparaten-op-zon-in-de-voorrang-een-lijst-op-zon)
- [186. Warmte bewaren: de boiler en de jacuzzi op zon](#186-warmte-bewaren-de-boiler-en-de-jacuzzi-op-zon)
- [194. Een huis zonder slimme regeling: de app draait ook zonder zones](#194-een-huis-zonder-slimme-regeling-de-app-draait-ook-zonder-zones)

**Configuratie en onboarding**

- [9. Configuratie als JSON, niet YAML, niet meteen een database](#9-configuratie-als-json-niet-yaml-niet-meteen-een-database)
- [10. Validatie met de hand, zonder bibliotheek](#10-validatie-met-de-hand-zonder-bibliotheek)
- [31. De vertaling had een tweede configuratie in zich](#31-de-vertaling-had-een-tweede-configuratie-in-zich)
- [32. Wat in code stond kon niet per woning verschillen](#32-wat-in-code-stond-kon-niet-per-woning-verschillen)
- [40. Het schema weigert alleen nog op wat er echt niet zonder kan](#40-het-schema-weigert-alleen-nog-op-wat-er-echt-niet-zonder-kan)
- [41. De ontdekking stelt voor en besluit niet](#41-de-ontdekking-stelt-voor-en-besluit-niet)
- [43. Een meetwaarde mag in een attribuut zitten](#43-een-meetwaarde-mag-in-een-attribuut-zitten)
- [72. Kamers en zones horen bij de app; Home Assistant levert de apparaten](#72-kamers-en-zones-horen-bij-de-app-home-assistant-levert-de-apparaten) — *aangevuld door 95*
- [95. Etage, kamer en zone: een vaste opbouw in de app, herkend uit Home Assistant](#95-etage-kamer-en-zone-een-vaste-opbouw-in-de-app-herkend-uit-home-assistant) — *aangevuld door 112*
- [103. De zon en je aansluiting: de app vraagt, de regeling vult aan waar de configuratie zwijgt](#103-de-zon-en-je-aansluiting-de-app-vraagt-de-regeling-vult-aan-waar-de-configuratie-zwijgt) — *aangevuld door 117*
- [109. Wat van dit huis is, wordt een instelling; camera's en de deurbel eerst](#109-wat-van-dit-huis-is-wordt-een-instelling-cameras-en-de-deurbel-eerst)
- [110. Prijzen zoals op het contract: normaal en dal, salderen, vaste posten](#110-prijzen-zoals-op-het-contract-normaal-en-dal-salderen-vaste-posten)
- [111. Licht bedienen en de weerbron zijn een functie](#111-licht-bedienen-en-de-weerbron-zijn-een-functie)
- [112. Etages vrij toevoegen, met de vaste namen als voorstel](#112-etages-vrij-toevoegen-met-de-vaste-namen-als-voorstel)
- [114. Inrichten: een wizard over de schermen die er al zijn](#114-inrichten-een-wizard-over-de-schermen-die-er-al-zijn)
- [117. De hoofdzekering stel je in de app in; die gaat voor de configuratie](#117-de-hoofdzekering-stel-je-in-de-app-in-die-gaat-voor-de-configuratie)
- [122. Batterijen bij het apparaat, en de verwarming met haar aanvoertemperatuur](#122-batterijen-bij-het-apparaat-en-de-verwarming-met-haar-aanvoertemperatuur)
- [123. Meten met: per kamer zelf de sensoren kiezen](#123-meten-met-per-kamer-zelf-de-sensoren-kiezen)
- [139. Inrichten in één keer, het filmpje en de rondleiding](#139-inrichten-in-één-keer-het-filmpje-en-de-rondleiding)
- [143. Comfort uit de app gaat voor de oude helpers, en het huis zoals het is](#143-comfort-uit-de-app-gaat-voor-de-oude-helpers-en-het-huis-zoals-het-is)
- [144. Na Inrichten is de app af, een film van twintig tellen, en een rondleiding langs alles](#144-na-inrichten-is-de-app-af-een-film-van-twintig-tellen-en-een-rondleiding-langs-alles)
- [145. Een zone heeft een soort, en kamers en zones schuiven](#145-een-zone-heeft-een-soort-en-kamers-en-zones-schuiven)
- [146. Inrichten zoals de schets, en de film als een dag in je huis](#146-inrichten-zoals-de-schets-en-de-film-als-een-dag-in-je-huis)
- [147. Comfort per bewoner, en inloggen voor de hele app](#147-comfort-per-bewoner-en-inloggen-voor-de-hele-app)
- [178. Universeel, deel 2: regels per land, meer merken, en het typeplaatje](#178-universeel-deel-2-regels-per-land-meer-merken-en-het-typeplaatje)
- [179. Klaarzetten in Home Assistant, bij Wat je huis kan](#179-klaarzetten-in-home-assistant-bij-wat-je-huis-kan)
- [197. Wat elk apparaat kan: de klimaatstap per merk in Inrichten](#197-wat-elk-apparaat-kan-de-klimaatstap-per-merk-in-inrichten)
- [202. Klaarzetten voor iedereen: de assistent met één knop, volledig scherm, een eigen account voor de wand](#202-klaarzetten-voor-iedereen-de-assistent-met-één-knop-volledig-scherm-een-eigen-account-voor-de-wand)
- [203. De stem: van het apparaat zelf, of helemaal in huis](#203-de-stem-van-het-apparaat-zelf-of-helemaal-in-huis)
- [204. De standaard voor een nieuw huis, en terug naar standaard](#204-de-standaard-voor-een-nieuw-huis-en-terug-naar-standaard)

**Meten, data en analyse**

- [11. Het logboek is zelfvoorzienend](#11-het-logboek-is-zelfvoorzienend)
- [12. Episodes, geen percentages](#12-episodes-geen-percentages)
- [13. Meten, en de beperkingen erbij vermelden](#13-meten-en-de-beperkingen-erbij-vermelden)
- [14. Geen RC-model per huis](#14-geen-rc-model-per-huis) — *deels vervangen door 46*
- [27. De datasetmeter meet dekking, niet duur](#27-de-datasetmeter-meet-dekking-niet-duur) — *gecorrigeerd door 27b*
- [27b. Het eerste getal was te vriendelijk](#27b-het-eerste-getal-was-te-vriendelijk)
- [30. Buitentemperatuur naar voren gehaald](#30-buitentemperatuur-naar-voren-gehaald) — *aangevuld door 30b*
- [30b. En toen zochten we naar het volgende gat](#30b-en-toen-zochten-we-naar-het-volgende-gat)
- [47. De opbrengst van de panelen is de instralingsmeter](#47-de-opbrengst-van-de-panelen-is-de-instralingsmeter)
- [48. De dataset komt er met een knop uit, als tar.gz](#48-de-dataset-komt-er-met-een-knop-uit-als-targz)
- [52. De dienst legt de ruwe historie zelf vast](#52-de-dienst-legt-de-ruwe-historie-zelf-vast)
- [58. Dagen ouder dan een week worden gecomprimeerd](#58-dagen-ouder-dan-een-week-worden-gecomprimeerd)
- [65. Wat het thermisch model nodig heeft, wordt nu al vastgelegd](#65-wat-het-thermisch-model-nodig-heeft-wordt-nu-al-vastgelegd)
- [66. Bij elk besluit is na te gaan welke versie het nam](#66-bij-elk-besluit-is-na-te-gaan-welke-versie-het-nam)
- [83. Ruwe data twee jaar, daarna samengevat](#83-ruwe-data-twee-jaar-daarna-samengevat)
- [93. Hoe het huis en de panelen liggen, meet de app zelf; de bewoner bevestigt](#93-hoe-het-huis-en-de-panelen-liggen-meet-de-app-zelf-de-bewoner-bevestigt)
- [126. Radiatorknoppen en ander klimaat buiten de configuratie: zien en vastleggen](#126-radiatorknoppen-en-ander-klimaat-buiten-de-configuratie-zien-en-vastleggen)
- [127. Het weer van Open-Meteo, de batterijlijst, en een apparaat via twee koppelingen](#127-het-weer-van-open-meteo-de-batterijlijst-en-een-apparaat-via-twee-koppelingen)
- [157. Hoe de panelen liggen, gemeten uit tien dagen opbrengst; de bewoner bevestigt](#157-hoe-de-panelen-liggen-gemeten-uit-tien-dagen-opbrengst-de-bewoner-bevestigt)

**Weergave**

- [24. Tailwind met een bouwstap, niet via een CDN](#24-tailwind-met-een-bouwstap-niet-via-een-cdn)
- [26. De terugblik hoort bij de weergave, maar is een andere waarheid](#26-de-terugblik-hoort-bij-de-weergave-maar-is-een-andere-waarheid)
- [45. Een bewoner ziet nooit een entity-ID](#45-een-bewoner-ziet-nooit-een-entity-id)
- [63. De terugblik gaat verder waar hij was](#63-de-terugblik-gaat-verder-waar-hij-was)
- [76. De testpagina is een prototype; de echte app krijgt een bewonerscontract](#76-de-testpagina-is-een-prototype-de-echte-app-krijgt-een-bewonerscontract) — *aangevuld door 94*
- [79. Wat een pushmelding krijgt, en wat in de app blijft](#79-wat-een-pushmelding-krijgt-en-wat-in-de-app-blijft) — *aangevuld door 183*
- [82. Zonder verbinding toont de tablet de laatste stand, gemarkeerd](#82-zonder-verbinding-toont-de-tablet-de-laatste-stand-gemarkeerd)
- [86. De app is vanaf het begin toegankelijk en tweetalig](#86-de-app-is-vanaf-het-begin-toegankelijk-en-tweetalig)
- [87. Donker, met later een lichte versie en een eigen accentkleur](#87-donker-met-later-een-lichte-versie-en-een-eigen-accentkleur) — *aangevuld door 181*
- [88. De app noemt alleen een oorzaak die gemeten is](#88-de-app-noemt-alleen-een-oorzaak-die-gemeten-is)
- [94. De schaduwweergave is voor de cijfers, de proefomgeving voor de app](#94-de-schaduwweergave-is-voor-de-cijfers-de-proefomgeving-voor-de-app)
- [102. Opbrengst: meters en prijzen in de app, de cijfers uit Home Assistant](#102-opbrengst-meters-en-prijzen-in-de-app-de-cijfers-uit-home-assistant)
- [105. Het weer van de komende dagen, met wat de panelen dan leveren](#105-het-weer-van-de-komende-dagen-met-wat-de-panelen-dan-leveren)
- [107. Aanbellen: het beeld van de deurbel meteen op het scherm](#107-aanbellen-het-beeld-van-de-deurbel-meteen-op-het-scherm)
- [108. Https in het tailnet, met Tailscale serve](#108-https-in-het-tailnet-met-tailscale-serve) — *aangevuld door 160*
- [113. Meer buitenruimtes in de tekening, en alleen weer van weerdiensten](#113-meer-buitenruimtes-in-de-tekening-en-alleen-weer-van-weerdiensten)
- [115. De assistent leest een vraag in eigen woorden, met een woordzoeker](#115-de-assistent-leest-een-vraag-in-eigen-woorden-met-een-woordzoeker)
- [116. Het jaar van Opbrengst begint op de startdatum van het contract](#116-het-jaar-van-opbrengst-begint-op-de-startdatum-van-het-contract)
- [119. Kamers krijgen een soort; ingezoomd staat de inrichting erin](#119-kamers-krijgen-een-soort-ingezoomd-staat-de-inrichting-erin)
- [120. Een liggende telefoon toont de tabletweergave](#120-een-liggende-telefoon-toont-de-tabletweergave)
- [124. Op de tablet: volle vakken schuiven, het toetsenbord verschuift niets, en "zou" in de schaduw](#124-op-de-tablet-volle-vakken-schuiven-het-toetsenbord-verschuift-niets-en-zou-in-de-schaduw)
- [125. Het screen zoals de schets, en Opbrengst onthoudt wat al uitgerekend is](#125-het-screen-zoals-de-schets-en-opbrengst-onthoudt-wat-al-uitgerekend-is)
- [128. Wat je koos blijft staan, het zonnescherm, het weer per uur en een bredere wand](#128-wat-je-koos-blijft-staan-het-zonnescherm-het-weer-per-uur-en-een-bredere-wand)
- [129. Drogen en het filter van de airco, gekleurd licht, en wat er nog wegviel](#129-drogen-en-het-filter-van-de-airco-gekleurd-licht-en-wat-er-nog-wegviel)
- [130. Instellingen in zes groepen, en comfort zet je in de app](#130-instellingen-in-zes-groepen-en-comfort-zet-je-in-de-app)
- [131. Versie 0.9.0, één naam per kamer, en wat na een grondige test niet klopte](#131-versie-090-één-naam-per-kamer-en-wat-na-een-grondige-test-niet-klopte)
- [133. Comfort zegt wanneer en waarmee: aan en uit, zon en net](#133-comfort-zegt-wanneer-en-waarmee-aan-en-uit-zon-en-net)
- [136. Meldingen in de app](#136-meldingen-in-de-app)
- [137. Verwacht naast echt: of de zonverwachting klopte](#137-verwacht-naast-echt-of-de-zonverwachting-klopte)
- [140. Vandaag is de tijd, Apparaten is het nu](#140-vandaag-is-de-tijd-apparaten-is-het-nu)
- [141. De assistent als gesprek, met een stem](#141-de-assistent-als-gesprek-met-een-stem)
- [142. Een kwaliteitsronde: een kamer doet mee met een andere, en de assistent klinkt als een mens](#142-een-kwaliteitsronde-een-kamer-doet-mee-met-een-andere-en-de-assistent-klinkt-als-een-mens)
- [148. De assistent zegt het in eigen woorden, en bedient licht en schermen met een zin](#148-de-assistent-zegt-het-in-eigen-woorden-en-bedient-licht-en-schermen-met-een-zin)
- [149. Wanneer een batterij of filter een melding geeft, een scherm beheren, en een eigen comfort dat weer lukt](#149-wanneer-een-batterij-of-filter-een-melding-geeft-een-scherm-beheren-en-een-eigen-comfort-dat-weer-lukt)
- [150. Praten met je stem: de microfoon, en "Hé huis" op de wand](#150-praten-met-je-stem-de-microfoon-en-hé-huis-op-de-wand)
- [154. De add-on opent de app, en een leeg huis begint met een welkom](#154-de-add-on-opent-de-app-en-een-leeg-huis-begint-met-een-welkom)
- [155. Volledig scherm in Home Assistant, per apparaat](#155-volledig-scherm-in-home-assistant-per-apparaat)
- [156. De eerste dag uit Home Assistant, en een back-up met zijn configuratie](#156-de-eerste-dag-uit-home-assistant-en-een-back-up-met-zijn-configuratie)
- [158. Inrichten: overal Terug en Volgende, en wat de bewoner tegenkwam](#158-inrichten-overal-terug-en-volgende-en-wat-de-bewoner-tegenkwam)
- [159. Thuis op de telefoon: de Assistent altijd in beeld](#159-thuis-op-de-telefoon-de-assistent-altijd-in-beeld)
- [160. Smart Climate los op de telefoon: een eigen poort in de add-on, via Tailscale](#160-smart-climate-los-op-de-telefoon-een-eigen-poort-in-de-add-on-via-tailscale)
- [161. Het paneel voor iedereen, en achter Ingress de rol uit Home Assistant](#161-het-paneel-voor-iedereen-en-achter-ingress-de-rol-uit-home-assistant)
- [162. Thuis naar eigen smaak: kaarten en favorieten, per account en voor de wand](#162-thuis-naar-eigen-smaak-kaarten-en-favorieten-per-account-en-voor-de-wand) — *deels vervangen door 181*
- [163. Een groep instellingen: de delen onder elkaar, een deel als eigen scherm](#163-een-groep-instellingen-de-delen-onder-elkaar-een-deel-als-eigen-scherm)
- [164. De wand als niemand kijkt, en de weergave per account](#164-de-wand-als-niemand-kijkt-en-de-weergave-per-account) — *aangevuld door 165*
- [165. Het scherm aan de wand: always-on overdag en 's avonds, 's nachts uit](#165-het-scherm-aan-de-wand-always-on-overdag-en-s-avonds-s-nachts-uit)
- [166. Negentien punten van de bewoner: assistent, huis, inrichten en de wand](#166-negentien-punten-van-de-bewoner-assistent-huis-inrichten-en-de-wand)
- [167. Achttien punten van de bewoner: de wand, de droger, instellingen en inrichten](#167-achttien-punten-van-de-bewoner-de-wand-de-droger-instellingen-en-inrichten)
- [168. Favorieten per kamer, en de dagstand en avondstand van de wand](#168-favorieten-per-kamer-en-de-dagstand-en-avondstand-van-de-wand)
- [169. Wie er thuis is en wiens comfort geldt: rondjes en een blad](#169-wie-er-thuis-is-en-wiens-comfort-geldt-rondjes-en-een-blad)
- [170. Favorieten met pagina's, rookmelders, de gevel op de kaart en wat de wand liet liggen](#170-favorieten-met-paginas-rookmelders-de-gevel-op-de-kaart-en-wat-de-wand-liet-liggen)
- [171. Bijwerken vanuit de app: een melding, wat er nieuw is en een knop](#171-bijwerken-vanuit-de-app-een-melding-wat-er-nieuw-is-en-een-knop)
- [173. Sneller: bewaren, inpakken, en het huis één keer uitrekenen](#173-sneller-bewaren-inpakken-en-het-huis-één-keer-uitrekenen)
- [174. Het huis en wie er thuis is, live](#174-het-huis-en-wie-er-thuis-is-live)
- [175. Op je startscherm, en de favorieten zoals de kaart](#175-op-je-startscherm-en-de-favorieten-zoals-de-kaart)
- [181. Een profiel per bewoner: licht of donker, een eigen kleur, en de wand volgt wie er geldt](#181-een-profiel-per-bewoner-licht-of-donker-een-eigen-kleur-en-de-wand-volgt-wie-er-geldt)
- [182. Vier kaarten voor Thuis: de auto, de batterij, deze maand en de deurbel](#182-vier-kaarten-voor-thuis-de-auto-de-batterij-deze-maand-en-de-deurbel)
- [183. Meldingen op de telefoon, via de app van Home Assistant](#183-meldingen-op-de-telefoon-via-de-app-van-home-assistant)
- [185. Meertalig: het fundament, met Thuis als proef](#185-meertalig-het-fundament-met-thuis-als-proef)
- [187. Huis 3.0: het huis als eiland, kaarten smal of breed, en de panelen op elk dak](#187-huis-30-het-huis-als-eiland-kaarten-smal-of-breed-en-de-panelen-op-elk-dak)
- [188. In de schaduw zegt de app wat er echt gebeurt, als het klopt](#188-in-de-schaduw-zegt-de-app-wat-er-echt-gebeurt-als-het-klopt)
- [189. De kaarten op de wand als tegel, en een kaart Boiler](#189-de-kaarten-op-de-wand-als-tegel-en-een-kaart-boiler)
- [190. Inrichten 3.0: acht hoofdstukken, en het huis groeit mee op zijn eiland](#190-inrichten-30-acht-hoofdstukken-en-het-huis-groeit-mee-op-zijn-eiland)
- [191. Huis 3.0 overal: het eiland is de standaard van de tekening](#191-huis-30-overal-het-eiland-is-de-standaard-van-de-tekening)
- [192. Sluipverbruik: elke nacht gemeten, een eigen scherm onder Opbrengst, en een melding als het opvalt](#192-sluipverbruik-elke-nacht-gemeten-een-eigen-scherm-onder-opbrengst-en-een-melding-als-het-opvalt)
- [193. Kamers en indeling als groep, en één lijstje voor wat er rond het huis is](#193-kamers-en-indeling-als-groep-en-één-lijstje-voor-wat-er-rond-het-huis-is)
- [195. Wat beweegt in een eigen laag: het huis weer licht genoeg voor een tablet aan de wand](#195-wat-beweegt-in-een-eigen-laag-het-huis-weer-licht-genoeg-voor-een-tablet-aan-de-wand)
- [196. Een huis zonder slimme meter of zonder panelen](#196-een-huis-zonder-slimme-meter-of-zonder-panelen)
- [198. Wat de wand zegt, de zon op zijn plek, de deurbel meteen, en feestdagen in het huis](#198-wat-de-wand-zegt-de-zon-op-zijn-plek-de-deurbel-meteen-en-feestdagen-in-het-huis)
- [199. De wand neemt alle persoonlijke instellingen over van wie hij volgt](#199-de-wand-neemt-alle-persoonlijke-instellingen-over-van-wie-hij-volgt)
- [200. De film als trailer, en een groot welkom bij Inrichten](#200-de-film-als-trailer-en-een-groot-welkom-bij-inrichten)
- [201. De kaart Camera's: zoveel camera's als je wilt, met wat ze zien](#201-de-kaart-cameras-zoveel-cameras-als-je-wilt-met-wat-ze-zien)
- [205. Het dak volgt het huis, en de ring van de zon](#205-het-dak-volgt-het-huis-en-de-ring-van-de-zon)
- [206. Buiten op Thuis: de tuin in zones, een blad per deel, en alles buiten uit](#206-buiten-op-thuis-de-tuin-in-zones-een-blad-per-deel-en-alles-buiten-uit)
- [207. Sluipverbruik dat vaak terugkomt, de wand in Fully Kiosk, en een QA-ronde](#207-sluipverbruik-dat-vaak-terugkomt-de-wand-in-fully-kiosk-en-een-qa-ronde)
- [208. Luisteren in de dienst: het wekwoord met een schuif, en wachten tot je klaar bent](#208-luisteren-in-de-dienst-het-wekwoord-met-een-schuif-en-wachten-tot-je-klaar-bent)
- [209. Een assistent die meedenkt: een gevoel wordt een opdracht, licht dat bij het moment past, en doorvragen](#209-een-assistent-die-meedenkt-een-gevoel-wordt-een-opdracht-licht-dat-bij-het-moment-past-en-doorvragen)
- [211. Sneller verstaan, de screens samen, en het venster dicht na een opdracht](#211-sneller-verstaan-de-screens-samen-en-het-venster-dicht-na-een-opdracht)
- [212. De stem kiezen, en stem en luisteren op één plek](#212-de-stem-kiezen-en-stem-en-luisteren-op-één-plek)
- [213. Het brein: een gesprek, meer in één zin, en doe maar terug](#213-het-brein-een-gesprek-meer-in-één-zin-en-doe-maar-terug)
- [214. Hoe ver je huis is: de zonnewaaier](#214-hoe-ver-je-huis-is-de-zonnewaaier)
- [215. Sneller verstaan: het einde van je zin bij geluid, en rechtzetten op klank](#215-sneller-verstaan-het-einde-van-je-zin-bij-geluid-en-rechtzetten-op-klank)

**Veiligheid**

- [15. Schaduwmodus schrijft niet, structureel](#15-schaduwmodus-schrijft-niet-structureel) — *aangevuld door 97*
- [23. De schaduwdienst gaat luisteren, maar alleen om te lezen](#23-de-schaduwdienst-gaat-luisteren-maar-alleen-om-te-lezen) — *deels vervangen door 42*
- [38. De ruwe HA-export hoort niet in versiebeheer](#38-de-ruwe-ha-export-hoort-niet-in-versiebeheer)
- [42. De weergave mag schrijven waar Home Assistant de deur bewaakt](#42-de-weergave-mag-schrijven-waar-home-assistant-de-deur-bewaakt) — *aangevuld door 97*
- [77. De add-on opent via Home Assistant; een eigen link pas met een eigen inlog](#77-de-add-on-opent-via-home-assistant-een-eigen-link-pas-met-een-eigen-inlog)
- [80. Iedereen in huis bedient; één beheert](#80-iedereen-in-huis-bedient-één-beheert)
- [84. Gevoel en toelichting mogen deze winter via de testpagina, naar een eigen bestand](#84-gevoel-en-toelichting-mogen-deze-winter-via-de-testpagina-naar-een-eigen-bestand)
- [97. Lampen aan en uit vanuit de app; "alles"-groepen zijn geen lamp](#97-lampen-aan-en-uit-vanuit-de-app-alles-groepen-zijn-geen-lamp) — *aangevuld door 100*
- [99. Bedienen vraagt een inlog, met je Home Assistant-account; kijken blijft open](#99-bedienen-vraagt-een-inlog-met-je-home-assistant-account-kijken-blijft-open)
- [100. Licht in kleur en wit, en de scènes van Hue (aanvulling op 97)](#100-licht-in-kleur-en-wit-en-de-scènes-van-hue-aanvulling-op-97)
- [106. De camera's bekijken in de app, alleen lezen en alleen met inlog](#106-de-cameras-bekijken-in-de-app-alleen-lezen-en-alleen-met-inlog)
- [121. Schermen bedien je in de app; alleen Somfy io mag later in de regeling](#121-schermen-bedien-je-in-de-app-alleen-somfy-io-mag-later-in-de-regeling)
- [151. Een gast zonder persoon, een back-up, opnieuw beginnen, en een export voor onderzoek](#151-een-gast-zonder-persoon-een-back-up-opnieuw-beginnen-en-een-export-voor-onderzoek)

**Uitrol en beheer**

- [17. Op de NAS, niet op de Pi](#17-op-de-nas-niet-op-de-pi) — *gecorrigeerd door 17b*
- [17b. Gemeten, en de vrees blijkt ongegrond](#17b-gemeten-en-de-vrees-blijkt-ongegrond)
- [18. Een bewaking tegen vastlopen](#18-een-bewaking-tegen-vastlopen)
- [19. Het uitrolscript weet wat er draait](#19-het-uitrolscript-weet-wat-er-draait)
- [20. Het uitrolscript staat buiten `src/`](#20-het-uitrolscript-staat-buiten-src)
- [21. De configuratie blijft buiten git op de NAS](#21-de-configuratie-blijft-buiten-git-op-de-nas)
- [22. De Taakplanner is een andere omgeving dan een shell](#22-de-taakplanner-is-een-andere-omgeving-dan-een-shell)
- [25. Het compose-bestand is een bouwinstructie, geen voorkeur](#25-het-compose-bestand-is-een-bouwinstructie-geen-voorkeur)
- [33. De uitrol vraagt het nieuwe image of het de oude configuratie snapt](#33-de-uitrol-vraagt-het-nieuwe-image-of-het-de-oude-configuratie-snapt)
- [35. Een server draagt alleen wat hij draait](#35-een-server-draagt-alleen-wat-hij-draait)
- [36. De add-on is dezelfde dienst, niet een tweede](#36-de-add-on-is-dezelfde-dienst-niet-een-tweede)
- [37. De add-on wordt platgeslagen voordat de Supervisor hem bouwt](#37-de-add-on-wordt-platgeslagen-voordat-de-supervisor-hem-bouwt) — *aangevuld door 118*
- [53. De NAS is de primaire omgeving; de add-on wacht tot stap B](#53-de-nas-is-de-primaire-omgeving-de-add-on-wacht-tot-stap-b)
- [64. Echt schakelen pas met een complete winter en alle functies](#64-echt-schakelen-pas-met-een-complete-winter-en-alle-functies)
- [67. Een mail als de opname stilvalt](#67-een-mail-als-de-opname-stilvalt)
- [118. Uitrollen via een eigen add-on-bibliotheek op GitHub](#118-uitrollen-via-een-eigen-add-on-bibliotheek-op-github)
- [135. Tot 1 november vrijgeven op de eigen pc](#135-tot-1-november-vrijgeven-op-de-eigen-pc) — *vervangen door 152*
- [152. Openbaar, en het werk gaat via beta](#152-openbaar-en-het-werk-gaat-via-beta)
- [153. De add-on komt kant-en-klaar van GitHub](#153-de-add-on-komt-kant-en-klaar-van-github)
- [177. Universeel, deel 1: het wekwoord mee, Assist zonder NAS, en meldingen live](#177-universeel-deel-1-het-wekwoord-mee-assist-zonder-nas-en-meldingen-live)

**Kwaliteitsbewaking**

- [54. Een machine kijkt mee](#54-een-machine-kijkt-mee) — *aangevuld door 152*
- [55. De opstart is één zuivere functie](#55-de-opstart-is-één-zuivere-functie)
- [56. Regels die voor elke toestand gelden](#56-regels-die-voor-elke-toestand-gelden)
- [57. Een linter met een handvol regels](#57-een-linter-met-een-handvol-regels)
- [59. Namen in het Engels, de rest in het Nederlands](#59-namen-in-het-engels-de-rest-in-het-nederlands)
- [69. Ook de pagina en deploy.sh worden getest](#69-ook-de-pagina-en-deploysh-worden-getest)
- [180. De twee grootste bestanden opgeknipt, zonder dat er iets verandert](#180-de-twee-grootste-bestanden-opgeknipt-zonder-dat-er-iets-verandert)

Wat nog open staat: [Wat nog een besluit wacht](#wat-nog-een-besluit-wacht).

<!-- index:einde -->

---

## 1. Weg van YAML, niet omdat het niet werkte

*Onderwerp: visie en principes · Status: geldig*

Het YAML-systeem regelde het huis grotendeels naar behoren. Wat ontbrak was de
mogelijkheid om vast te stellen óf het klopte. Van de zeven fouten die we bij het
doorlezen vonden, waren er vier jarenlang onzichtbaar geweest:

- `zolder_started_now` stond door een scopingfout altijd op `false`, waardoor
  beide airco's op hetzelfde overschot konden starten
- `'Uit '` had een spatie, waardoor de winterschakeling en de nachtelijke reset
  stilzwijgend niets deden
- `handmatig` bestond niet als optie, waardoor de runner afbrak
- `pv_hard_stop` betekende in de controller iets anders dan in de sensor die het
  dashboard voedde

Geen van deze fouten gaf ooit een melding. Dat is de eigenlijke reden voor de
overstap: niet betere logica, maar **aantoonbare** logica.

*Nagekeken in de HA-export van 1 september 2026.* Twee van de vier zijn in de
draaiende installatie inmiddels gerepareerd, en het lijstje hierboven beschreef
ze te stellig als open:

- **`zolder_started_now` is opgelost, en niet zoals hier stond.** De scopingfout
  was echt — in `legacy_code/Scripts/alias Klimaat controller - apply.txt` staat
  `zolder_started_now: false` als scriptvariabele, en de `- variables:
  zolder_started_now: true` binnen de geneste `then:` valt buiten het bereik van
  de zustertak die hem uitleest, dus die zag altijd `false`. Maar dat is de
  *oude* kopie. In de export staat er een echte helper,
  `input_boolean.zolder_started_now` ("zolder nu gestart"), plus
  `input_boolean.woonkamer_started_now`. `scripts.yaml` zet hem aan na het
  starten van de zolder, leest hem uit in de voorwaarde van de woonkamer, en
  zet beide aan het einde van het script weer uit. De vlag werkt dus. Zie wel het
  openstaande punt over het opruimen van die vlaggen, onderaan.
- **`handmatig` bestaat wél als optie.** `input_select.verwarming_modus` heeft
  in de export de standen `automatisch, dag, nacht, voorverwarmen, afwezig,
  koelen, vakantie, handmatig`.

`legacy_code/` in deze repository is een momentopname van vóór die reparaties.
Bij twijfel is `automatic_backup_*/homeassistant/data/` de waarheid, niet
`legacy_code/`.

Dat verandert niets aan de conclusie. Beide fouten hebben jaren stil bestaan en
zijn met de hand gevonden, niet door het systeem gemeld. Besluit 3 blijft ook
staan: het budget vervangt de vlag, in plaats van erop te vertrouwen dat hij
blijft werken.

## 2. Een pure kern

*Onderwerp: kern en regeling · Status: geldig*

`decide(state, config, now) -> Decision` doet geen I/O, leest geen klok en kent
geen netwerk. Timers zijn invoer; een timerstart komt als commando terug.

*Afgewezen:* een controller die zelf sensoren uitleest en diensten aanroept. Dat
is korter, maar dan kun je hem alleen valideren in een echt huis, in echte tijd,
in één seizoen per jaar.

*Gevolg:* de replay-harness en de divergentietool zijn mogelijk. Een wijziging in
de regellogica wordt in seconden getoetst in plaats van in seizoenen.

## 3. Een vermogensbudget in plaats van een vlag

*Onderwerp: kern en regeling · Status: geldig*

Het overschot is een pot die leegloopt. Elk voorstel draagt een `budgetW`: een
draaiend apparaat rekent zijn gemeten opname, een stilstaand apparaat zijn
schatting. Zo kost bijschakelen alleen het verschil — precies wat de
oorspronkelijke drempellogica bedoelde.

*Afgewezen:* de vlag herstellen die in de YAML-versie kapot was. Dat lost dat ene
geval op en laat de vorm intact die de fout mogelijk maakte.

*Gevolg:* dubbelstarten kán niet meer. Het is geen regel die je kunt vergeten,
maar een middel dat op raakt.

## 4. Strategieën stellen voor, één arbiter beslist

*Onderwerp: kern en regeling · Status: geldig*

In de YAML-versie zat de voorrang tussen strategieën impliciet in de volgorde van
`choose`-blokken. Nu levert elke strategie `Intent[]` met een prioriteit, en één
arbiter lost conflicten op.

*Gevolg:* een nieuwe strategie raakt geen bestaande. En er is één plek waar
"wie wint" wordt beslist, in plaats van een volgorde die je uit vierhonderd
regels moet afleiden.

## 5. Afwezigheid van vraag is niet de taak van een strategie

*Onderwerp: kern en regeling · Status: geldig*

`pvSurplus` stelde aanvankelijk `standby` voor zodra er niets te bufferen viel.
Live bleek dat twee uitgeschakelde airco's aanzette om vervolgens niets te doen —
standby betekent immers *aan*, met een onbereikbaar setpoint.

*Besluit:* strategieën drukken alleen vraag uit. Het afbouwen doet de arbiter,
die als enige weet wat een apparaat nú doet: draaiend gaat naar standby,
geparkeerd gaat na de stabilisatieperiode uit, uit blijft uit.

*Gevolg:* loste meteen iets op wat nog niet was opgemerkt — een geparkeerde airco
bleef in `nacht` en `vakantie` eeuwig in standby staan.

## 6. Tijd is invoer, ook buiten de kern

*Onderwerp: kern en regeling · Status: geldig*

De schaduwrunner las eerst `Date.now()`. Een test faalde daardoor omdat het
toevallig 22:45 was en het huis in nachtmodus stond.

*Besluit:* de klok is injecteerbaar, ook in de laag om de kern heen.

Later bleek hetzelfde principe op een tweede manier te ontbreken: het veld
`timezone` in de configuratie werd nergens gebruikt. De code las de tijdzone van
het *proces*. Op een laptop in Nederland valt dat samen met het huis; in een
container draait Node in UTC, en dan begint voorverwarmen twee uur te laat
zonder één foutmelding.

## 7. Een fout hoort luid te falen

*Onderwerp: visie en principes · Status: geldig*

Een setpoint buiten het bereik van een apparaat wordt afgewezen, niet
stilzwijgend begrensd. Een onbekende tijdzone wordt geweigerd bij het inlezen.
Een ontbrekende configuratie stopt het opstarten.

*Reden:* stil terugvallen op iets redelijks is precies hoe de YAML-fouten
jarenlang konden blijven bestaan.

*Uitzondering:* de failsafe. Valt een kritiek meetpunt weg, dan gaan de
assist-apparaten uit maar blijft de hoofdverwarming draaien. Een CV uitzetten
omdat een zoldersensor wegvalt is gevaarlijker dan hem te laten lopen.

## 8. `handmatig` is een modus waarin de regeling zich terugtrekt

*Onderwerp: kern en regeling · Status: aangevuld door 8b*

Toen `handmatig` als stand aan de helper werd toegevoegd, lag het voor de hand
hem op `dag` te laten lijken. Dat zou fout zijn: het is geen
temperatuurregime maar een instructie — *laat staan wat er staat*.

*Besluit:* in `handmatig` stelt de arbiter niets voor, stuurt hij geen setpoint,
start hij niets en schakelt hij ook niets af. Dat laatste is het verschil met
`nacht`, waar "niets te doen" juist betekent dat de boel uit mag.

*Uitzondering:* de failsafe wint hiervan. Een storing is geen voorkeur.

### 8b. De knop staat op twee plekken, de vertaling keek er maar naar één

*Onderwerp: kern en regeling · Status: geldig*

De kern deed het goede in `handmatig` — de arbiter stelde niets voor, stuurde
niets en schakelde niets af, en `test/arbiter.test.ts` bewaakte dat. Alleen
bereikte de stand hem nooit. `mapping.ts` las uitsluitend
`input_select.verwarming_modus`, en dat is niet de knop waar de bewoner op
drukt om de zolderairco met de hand aan te zetten.

Dat is `input_select.koel_strategie`, met de standen
`Pv koelen, Automatisch koelen, Handmatig koelen, uit`. In het oude systeem is
dat geen dashboardversiering maar de schakelaar die de PV-koelregeling stilzet:

```
handmatig_koelen_actief: {{ is_state('input_select.koel_strategie', 'Handmatig koelen') }}
choose → conditions: {{ pv_koelen_heeft_regie and not handmatig_koelen_actief }}
```

en het afbouwblok is met datzelfde `not handmatig_koelen_actief` afgeschermd.
Onder 'Handmatig koelen' start het oude systeem dus niets en schakelt het ook
niets af. Dat is woord voor woord wat `handmatig` hierboven betekent.

*Gevonden door:* de divergentietool, niet door een test. Op 6 september 2026
stond er één episode van **151 minuten** bovenaan, `ac-zolder`, "oud draaide, ik
zou stoppen, modus dag" — met eronder de uitleg van het oude systeem:
`Handmatig koelen actief: · ❄️ Zolder (Koelen)`. De arbiter dacht `dag` omdat
`verwarming_modus` op `automatisch` stond; de bewoner had de knop ernaast
omgezet.

*Besluit:* `mapping.ts` leest beide knoppen, en 'Handmatig koelen' wint van de
modus-keuze — het oude systeem liet die stand ook boven alles gaan, tot en met
vakantie.

*Kosten:* onze `handmatig` geldt voor de héle woning, terwijl in het oude
systeem alleen de koelregeling zich terugtrok en de Nest zijn modus bleef
volgen. De arbiter laat de Nest daarmee met rust waar het oude systeem hem nog
stuurde. Dat is de veilige kant — hij zet niets uit, en de failsafe blijft
winnen — maar het is een benadering. Een `handmatig` per apparaatgroep is het
echte antwoord; die staat op de lijst hieronder.

*Wat het rapport erover zei was fout, en flink:* met de 151 minuten meegeteld
claimde de divergentietool dat de arbiter **88,7%** van de netstroom naar de
airco's zou hebben vermeden. Zonder die episode is het **8,1%**. De hele
"besparing" was op één na een keuze van de bewoner. Een rapport dat de bewoner
overrulet en dat als winst opschrijft, is erger dan geen rapport.

*En het zat niet alleen in de divergentietool.* De replay-harness deelt dezelfde
`mapping.ts` — dat is het hele punt van die gedeelde vertaling — dus dezelfde
fout stond in het replay-rapport over 25 augustus tot 4 september. In dat venster
stond de koelstrategie 950 minuten op 'Handmatig koelen', verdeeld over vier
periodes. Opnieuw gedraaid met de fix:

| | vóór | na |
| --- | --- | --- |
| netstroom die het oude systeem besteedde | 3,73 kWh | 3,73 kWh |
| daarvan zou de arbiter hebben vermeden | 3,57 kWh (95,7%) | 0,98 kWh (26,1%) |
| ac-zolder, "ik zou stoppen" | 629 ticks | 90 ticks |

De 3,73 kWh klopte — dat is wat het oude systeem uitgaf, en dat staat los van
wie er gelijk had. Wat niet klopte was de claim eromheen. Twee onafhankelijke
harnessen wezen dezelfde kant op, en dat leek bevestiging; het was twee keer
dezelfde vertaalfout.

*Les:* twee harnessen die dezelfde vertaallaag delen, geven geen twee metingen.
Ze geven één meting, twee keer opgeschreven. Dat is precies wat we wilden
(besluit: één vertaling, nooit twee) — maar het betekent dat een fout in die laag
nergens tegenspraak oplevert. Alleen de uitleg van het oude systeem zelf, die we
als referentie meeschrijven, viel er uit de toon: `Handmatig koelen actief`.

*Gevolg voor de tool:* een moment in een hands-off stand is geen vergelijking.
`divergence/read.ts` geeft daar de waarneming terug als "wat de arbiter wil",
zodat er geen episode ontstaat en er niets vermijdbaar heet. Logboeken van vóór
deze fix schreven `dag`, dus daar wordt de stand teruggelezen uit de uitleg van
het oude systeem: `Handmatig koelen actief` is de eerste tak van de sjabloon van
`sensor.airco_assist_reden` en verschijnt precies dan, en alleen dan. Die
terugleesregel mag weg zodra er geen logboeken van vóór september 2026 meer
meegaan.

## 9. Configuratie als JSON, niet YAML, niet meteen een database

*Onderwerp: configuratie en onboarding · Status: geldig*

De configuratie komt straks uit een onboarding-wizard en gaat over een API; dan
is JSON het natuurlijke formaat.

*Afgewezen — YAML:* ironisch in een project dat er juist vanaf migreert, en het
lokt de sjabloonlogica uit die de vorige generatie onleesbaar maakte.

*Afgewezen — database:* er is één configuratie, en een database beantwoordt op
dit moment geen enkele vraag. Wel is de vorm er klaar voor: een document met een
`id` en een `schemaVersion`, en een parser die alleen `unknown` in en
`SiteConfig` uit kent. Postgres wordt later een nieuwe bron in `load.ts`, geen
herschrijving.

## 10. Validatie met de hand, zonder bibliotheek

*Onderwerp: configuratie en onboarding · Status: geldig*

*Afgewezen:* zod of vergelijkbaar.

*Redenen:* de foutmeldingen zijn hier het product, en die zijn domeinspecifiek
("zone verwijst naar actuator die niet bestaat — bedoelde je …?"). De
verwijzingscontroles moet je sowieso zelf schrijven. En een dienst die in een
container bij mensen thuis draait heeft baat bij weinig afhankelijkheden.

*Gevolg:* omkeerbaar — het raakt alleen `schema.ts`.

*Bijvangst:* de validator wees bij de eerste run de eigen configuratie af, omdat
vakantie de woonkamer op 12 °C zet en de airco pas bij 16 °C begint. Dat was te
streng: een zone mág apparaten met verschillende bereiken hebben. De regel is nu
"fout als géén enkel apparaat het doel kan halen".

## 11. Het logboek is zelfvoorzienend

*Onderwerp: meten, data en analyse · Status: geldig*

Het lag voor de hand de historische standen van het oude systeem via de
HA-API op te halen wanneer we gaan vergelijken.

*Besluit:* nee — de schaduwmodus heeft die waarheid al in handen op het moment
dat hij beslist, dus schrijft hij haar mee.

*Gevolg:* de divergentietool heeft geen token nodig, geen netwerk, en geen last
van de bewaartermijn van de recorder. Dezelfde invoer geeft altijd hetzelfde
rapport.

Wat de vergelijking site-specifiek maakt, staat in een optioneel
`migration`-blok in de configuratie. Dat haal je weg zodra de overstap gemaakt
is, en dan verdwijnt de vergelijking vanzelf.

## 12. Episodes, geen percentages

*Onderwerp: meten, data en analyse · Status: geldig*

Vierhonderd afwijkende minuten zeggen niet of dat vierhonderd losse hikjes waren
of drie lange middagen.

*Besluit:* aaneengesloten afwijkingen worden samengevoegd tot episodes, met de
reden die de arbiter zelf opgaf en wat het oude systeem er op dat moment over
zei. Daarboven een tijdlijn van één teken per kwartier, want patronen zie je in
een plaatje en niet in een tabel.

## 13. Meten, en de beperkingen erbij vermelden

*Onderwerp: meten, data en analyse · Status: geldig*

Elke bewering over besparing komt uit een harness. De replay is een
**schaduwvergelijking, geen gesloten simulatie**: de arbiter krijgt op elk
historisch moment de echte toestand, maar we rekenen niet door hoe de
temperatuur zich ontwikkeld zou hebben als hij had gestuurd. Na de eerste
afwijking zou dat je eigen aannames vergelijken in plaats van twee regelaars.

Diezelfde discipline vond twee fouten in de metingen zelf:

- toerekening van netstroom klopte niet — het netvermogen bevat het
  airco-verbruik al, dus een huis dat 532 W teruglevert terwijl de airco's
  596 W trekken draait volledig op zon
- "teruggeschakeld" mocht niet betekenen "geen aanvaard voorstel", want als de
  minimale draaitijd het afschakelen tegenhoudt blijft het apparaat gewoon aan

En één fout in de arbiter: `availableW` gebruikte het afgekapte overschot in
plaats van het netvermogen, waardoor import niet meetelde. Precies het lek dat de
kern zou dichten.

## 14. Geen RC-model per huis

*Onderwerp: meten, data en analyse · Status: deels vervangen door 46*

Om de bufferband van de zolder te onderbouwen zou een thermisch model helpen.

*Afgewezen:* dat is over-fitten op één woning, en dit moet een product worden.

*Gevolg:* `bufferBandC` is een knop op ervaring, en dat staat ook zo in de
documentatie in plaats van dat het voor gemeten doorgaat. De sweep die we bouwden
kan de vraag niet beantwoorden — in open lus is het effect van de band per
definitie onzichtbaar — en dat is een uitkomst, geen mislukking.

## 15. Schaduwmodus schrijft niet, structureel

*Onderwerp: veiligheid · Status: aangevuld door 97*

`HaClient` wordt zonder `allowWrites` aangemaakt, en `callService` werpt dán al
voordat er iets de socket op gaat. (Sinds 97 met één smalle uitzondering voor
lampen aan en uit, `allowLights`; klimaat en screens blijven hierachter.)

*Reden:* dit is geen afspraak maar een grens. De code kijkt mee bij de
verwarming van een bewoond huis. Een test draait een volledige sessie tegen een
nagebootste Home Assistant en controleert dat er geen enkele `call_service`
aankomt.

## 16. Filteren op wat ons aangaat

*Onderwerp: kern en regeling · Status: geldig*

Gemeten op tien dagen eigen historie: 2.149.449 wijzigingen over 1666
entiteiten, waarvan er 31 over klimaat gaan. De rest wordt volledig genegeerd —
91,7%.

Dat alleen was niet genoeg: binnen wat overblijft is de slimme meter in zijn
eentje 88%, met een melding elke vijf seconden. De regeling werkt met
stabilisatietimers van vijf minuten en minimale draaitijden van een kwartier, en
het YAML-systeem draaide eens per drie minuten. Vandaar een ondergrens van
vijftien seconden tussen evaluaties, waarbij een wijziging binnen dat venster
wordt verschoven en niet weggegooid.

Een drift-test leest de broncode van `mapping.ts`, haalt er elke entity-ID uit en
eist dat de filter ze kent. Anders valt een nieuw uitgelezen meetpunt
stilzwijgend buiten de filter.

## 17. Op de NAS, niet op de Pi

*Onderwerp: uitrol en beheer · Status: gecorrigeerd door 17b*

Home Assistant draait als HAOS: een afgesloten appliance waarvan de
Docker-daemon van de Supervisor is. Eigen containers ernaast worden genegeerd of
bij een opruimronde verwijderd.

*Afgewezen — HA add-on:* elegant (de Supervisor levert dan zelfs het token), maar
het belast de machine die niet mag omvallen en maakt elke wijziging trager.
Bewaard voor fase 6, want het is wél de manier om andere HA-gebruikers te
bedienen.

*Gekozen:* de Synology. Staat los van de kritieke machine, is 24/7 aan, en de
werkwijze was al bekend.

### 17b. Gemeten, en de vrees blijkt ongegrond

*Onderwerp: uitrol en beheer · Status: geldig*

De aanname onder "het belast de machine die niet mag omvallen" was nooit
nagerekend. Voor besluit 34 moest dat alsnog, want daar staat de add-on wél op
de Pi. Gemeten op 10 september 2026, op een Raspberry Pi 5 met HAOS 18.2 en HA
Core 2026.9.1, met een nagebouwd logboek van winterformaat:

| | Pi 5 (arm64) | werkstation (x64) |
| --- | --- | --- |
| invoer | 180 dagen, 385 MB, 1.141.710 momenten | idem |
| wandtijd | 21.529 ms | 6.480 ms |
| processortijd | 24.037 ms | 6.828 ms |
| piekgeheugen | **110,4 MB** | 181,6 MB |
| vertraging event loop | 9 ms | 1 ms |
| bezetting | 2,67% van één kern per kwartier | 0,76% |

En de vraag waar het werkelijk om ging — de reactietijd van Home Assistant, in
rust en tijdens de analyse:

```
rust     mediaan 0,002 s   hoogste 0,002 s   (20 metingen)
belast   mediaan 0,002 s   hoogste 0,003 s   (40 metingen)
```

Geen verschil. Van de 900 seconden in een kwartier gebruikt de analyse er 24 op
één van de vier kernen.

*Verrassing in de meting:* het piekgeheugen is op de Pi **lager** dan op het
werkstation, 110 tegen 182 MB. V8 reserveert op Windows royaler. Uitgerekend dat
getal was de zorg, want het is het enige dat hard faalt in plaats van langzaam —
eroverheen schiet de kernel het proces af. Tegen de `mem_limit` van 256 MB is dit
comfortabel.

*Gevolg:* besluit 17 gaat om. De add-on op de Pi is geen risico voor de machine
die niet mag omvallen, en fase 6c kan die kant op.

*Wat de meting niet zegt.* De probe is `manifest.json` — die toetst of HA's
HTTP-laag reageert, niet of een zware sjabloon trager rendert. Op zichzelf zou
dat te mager zijn; samen met 2,67% bezetting op één van vier kernen draagt de
conclusie wel.

*En wat er nog wél voor pleit om te wachten:* het tweede bezwaar uit besluit 17
staat nog overeind — elke wijziging op de Pi is trager te testen dan op de NAS.
Dat is een reden om de add-on pas te bouwen als de rest af is, niet om hem niet
te bouwen.

## 18. Een bewaking tegen vastlopen

*Onderwerp: uitrol en beheer · Status: geldig*

Een dienst die maanden draait faalt zelden met een knal; hij blijft hangen. Een
websocket die dood is zonder dat de sluiting doorkwam, en het proces leeft
verder terwijl de opname stilstaat — dat merk je pas als je de dataset opent.

*Besluit:* geen besluit meer in tien minuten betekent afsluiten met een
foutcode, waarna `restart: unless-stopped` het oppakt.

## 19. Het uitrolscript weet wat er draait

*Onderwerp: uitrol en beheer · Status: geldig*

Mislukt het bouwen, dan staat de werkmap al op de nieuwe commit. Zonder
onderscheid zou de volgende run concluderen dat HEAD gelijk is aan origin en dat
er dus niets te doen valt — en zou de mislukte uitrol nooit meer worden
geprobeerd.

*Besluit:* `.deployed` bevat de commit die werkelijk is neergezet, en daar wordt
tegen vergeleken.

Verder: eerst bouwen dan omwisselen (mislukt het bouwen, dan is er niets
gebeurd), alleen bouwen bij een wijziging in `backend/`, en weigeren zodra er
lokale wijzigingen in `src/` staan in plaats van ze te overschrijven.

## 20. Het uitrolscript staat buiten `src/`

*Onderwerp: uitrol en beheer · Status: geldig*

*Reden:* anders kan een `git pull` het script wijzigen terwijl het draait.

*Kosten:* een nieuwe versie moet je zelf overnemen. Het script meldt wanneer dat
aan de orde is.

## 21. De configuratie blijft buiten git op de NAS

*Onderwerp: uitrol en beheer · Status: geldig*

`config/sites/*.json` staat wél in de repository, maar wordt op de NAS niet
automatisch overgezet.

*Reden:* de configuratie hoort bij de installatie, niet bij de code. Dat is
meteen de vorm die nodig is zodra er een tweede huis bij komt.

*Kosten:* handwerk bij een wijziging. Het uitrolscript meldt wanneer de versie in
git afwijkt van wat er draait.

## 22. De Taakplanner is een andere omgeving dan een shell

*Onderwerp: uitrol en beheer · Status: geldig*

Dit heeft vier keer een uitrol laten mislukken, elke keer met een foutmelding die
niets met de oorzaak te maken had:

1. **Geen PATH** naar docker en git — die worden nu expliciet gezocht.
2. **Geen `HOME=/root`**, waardoor ssh de sleutel niet vond — die wordt nu
   expliciet meegegeven via `GIT_SSH_COMMAND`.
3. **Aangeroepen als `sh script`.** Op DSM ís `/bin/sh` bash, maar bash die onder
   die naam draait schakelt naar POSIX-modus. `BASH_VERSION` is dan gewoon gezet,
   dus controleren daarop hielp niet, terwijl procesvervanging wegviel. Het
   script start zichzelf nu altijd eenmaal opnieuw met een échte bash, en gebruikt
   voor het logboek een gewone pijp in plaats van procesvervanging.
4. **Regeleindes.** `.gitattributes` legt LF vast voor alles wat op Linux draait.

*Les:* toets een wijziging in het uitrolscript altijd via *Uitvoeren* in de
Taakplanner. Vanaf de commandoregel bewijst het niets.

## 23. De schaduwdienst gaat luisteren, maar alleen om te lezen

*Onderwerp: veiligheid · Status: deels vervangen door 42*

Tot fase 5 stond er in `docker-compose.yml`: *deze dienst luistert nergens op en
verbindt alleen uitgaand met Home Assistant.* Dat was een eigenschap, geen
toevalligheid — het proces houdt het HA-token vast en draait maanden onbewaakt.

*Afgewezen — een tweede dienst die het logboek volgt.* Houdt de schaduwdienst
volledig dicht, en dat is echt iets waard. Maar het levert een tweede container,
een tweede uitrol, en een weergave die de laatste *geschreven* regel toont in
plaats van het laatste *besluit*. En juist het verschil daartussen is
interessant: het logboek slaat een ongewijzigd besluit over (besluit 11), dus
een pagina die daaruit leest staat stil zolang de arbiter het eens blijft met
zichzelf. Dat ziet er precies zo uit als kapot.

*Afgewezen — een statisch rapport uit de divergentietool.* Geen nieuwe
netwerkoppervlakte, maar dan kijk je naar de stand van de laatste keer dat je
het script draaide. Voor een dashboard is dat geen dashboard.

*Gekozen:* de weergave zit in de schaduwdienst, en read-only is er een grens en
geen afspraak. Net als bij `HaClient` zonder `allowWrites`:

- alles wat geen GET of HEAD is krijgt 405, **vóór** de routering — een nieuwe
  route kan die controle dus niet per ongeluk omzeilen
- er is geen route die iets wijzigt, ook niet als je hem zou willen
- het pad naar een bestand wordt genormaliseerd en tegen de wortel gecontroleerd,
  want `.env` ligt precies één map boven de gebouwde frontend
- `HEMS_WEB_PORT` weglaten zet het geheel uit, en dat is de standaard: luisteren
  is een keuze die je in de compose maakt en ziet staan

*Kosten:* er is geen authenticatie. Op een thuisnetwerk is dat verdedigbaar —
Home Assistant zelf staat daar ook — maar het staat als waarschuwing in de
compose: hier hoort nooit een reverse proxy naar buiten op. Het verschil met
Home Assistant is dat díe een inlog heeft; deze pagina niet. Fase 6 heeft er een
antwoord voor nodig zodra dit bij iemand anders komt te draaien.

*Nagekomen:* de poort stond eerst hard op 8080, en dat bleek op de eigen NAS al
bezet door SABnzbd. Welke poorten vrij zijn is een eigenschap van de
installatie en niet van de code, dus hij komt nu uit `.env` — met 8099 als
standaard. Anders zou het verzetten van een poort een wijziging in een
git-bestand vragen, en daarmee een melding van de compose-controle uit besluit
25 over een verschil dat helemaal geen drift is.

*Gevolg:* de weergave krijgt élk besluit, ook wanneer er niets wijzigde. Dat is
het omgekeerde van wat het logboek doet, en met opzet: een logboek dat de winter
haalt en een dashboard dat leeft, stellen tegengestelde eisen aan hetzelfde
besluit.

## 24. Tailwind met een bouwstap, niet via een CDN

*Onderwerp: weergave · Status: geldig*

*Afgewezen — de play-CDN.* Geen bouwstap, maar dan heeft een pagina die je juist
lokaal wilt kunnen openen internet nodig om er goed uit te zien. Een dashboard in
de meterkast dat bij een haperende verbinding als kale HTML verschijnt, is precies
op het verkeerde moment onleesbaar.

*Afgewezen — handgeschreven CSS.* Zou kunnen, en zou minder bewegende delen
geven. Maar dit wordt een product met meer schermen dan dit ene, en dan is een
schaal die al bestaat meer waard dan de honderd regels die we nu uitsparen.

*Gekozen:* Tailwind, lokaal gebouwd. De uitvoer is één CSS-bestand van ~10 kB,
en Tailwind zelf komt nergens in de buurt van de draaifase: het gebeurt in een
eigen bouwfase in de Dockerfile en wat eruit komt zijn drie bestanden.

*Kosten, en dit is de echte:* de bouwcontext moest van `backend/` naar de
projectwortel, want `frontend/` moet mee. Daarmee verhuisde ook de
`.dockerignore` — Docker leest die naast de *context*, niet naast de Dockerfile,
dus `backend/.dockerignore` doet daar niets meer. Zonder een nieuwe in de wortel
gaat de hele repository de daemon in, HA-backup van een gigabyte incluis.

*En:* `deploy.sh` bouwde alleen bij een wijziging in `backend/`. Nu ook bij
`frontend/` — anders is een gewijzigde pagina een pagina die niet verandert, en
dat is weer precies het soort stilte waar dit project vanaf moest.

## 25. Het compose-bestand is een bouwinstructie, geen voorkeur

*Onderwerp: uitrol en beheer · Status: geldig*

`docker-compose.yml` staat op de NAS naast `src/` en wordt met de hand
overgenomen, net als `deploy.sh` (besluit 20) en de configuratie (besluit 21).
Voor die twee is dat goed: het zijn keuzes van deze installatie.

Voor compose bleek het iets anders. Fase 5 verplaatste de build-context van
`backend/` naar de projectwortel, want `frontend/` moet mee. De Dockerfile ging
met git mee naar de NAS; het compose-bestand niet. Resultaat: een nieuwe
Dockerfile die tegen de oude context bouwde, en acht regels
`"/backend/package.json": not found` die niets over de oorzaak zeggen. De
Taakplanner mailde dat elke vijf minuten.

`deploy.sh` had de wijziging netjes gezien — `deploy/docker-compose.yml` stond
in de lijst met gewijzigde bestanden — en bouwde vrolijk verder met de oude
kopie. Het script controleerde alleen of `$ROOT/docker-compose.yml` *bestaat*.

*Besluit:* het script vergelijkt de draaiende kopie met die in git en **stopt**
wanneer ze verschillen, met de diff en het `cp`-commando erbij. Stoppen en niet
waarschuwen, want anders dan bij de configuratie maakt een mismatch hier de rest
van de run betekenisloos: het compose-bestand bepaalt waar de build naar kijkt.

*Waarom niet automatisch kopiëren:* dan zou een `git pull` de poortbinding en de
mounts van een draaiende installatie kunnen wijzigen zonder dat iemand ernaar
keek. Dat is precies waarom besluit 20 en 21 bestaan. De juiste vorm is niet
"doe het voor me" maar "weiger tot het klopt".

*Les, en die is breder:* dit script kende de wijziging al. Het gebruikte hem
alleen om te besluiten *dat* er werk was, niet om te controleren *of* het werk
kon slagen. Een detectie die geen controle wordt, is een gemiste kans die je pas
ziet als hij misgaat.

*Nawee, dezelfde dag:* de eerste versie van deze controle vergeleek bytes, en
blokkeerde daarop meteen een uitrol waar niets mis mee was. De kopie op de NAS
had CRLF, de versie in git LF — `.gitattributes` legt LF vast voor alles wat op
Linux draait (besluit 22, punt 4). `diff` toonde toen 78 identieke regels als 78
verschillen, en dat is het ergste soort foutmelding: hij wijst nergens naar.

De controle vergelijkt nu genormaliseerde tekst. Docker leest CRLF in YAML
prima, dus een uitrol tegenhouden op een verschil dat voor de bouw niet bestaat
is strenger dan streng — het is fout. Een bewaking die vals alarm slaat, leert
mensen hem te negeren, en dan bewaakt hij niets meer.

## 26. De terugblik hoort bij de weergave, maar is een andere waarheid

*Onderwerp: weergave · Status: geldig*

De pagina toonde het besluit van dit moment. Wat ontbrak was wat de
divergentietool in de terminal al gaf: de tijdlijn, de verhoudingen en de
stroom.

*Besluit:* dezelfde `analyse()` draait in de dienst en levert `/api/divergence`.
Eén analyse, twee vensters — de terminal en de pagina kunnen niet uiteenlopen,
en dat is gecontroleerd door de cijfers naast elkaar te leggen. Ook de opbouw
van de tijdlijn is gedeeld: `bucketsPerDay()` en één tabel met tekencodes, in
plaats van twee keer dezelfde logica.

*Gescheiden gehouden van de live stand,* want het tempo verschilt met een factor
dertig: de arbiter beslist elke dertig seconden, deze analyse draait elk
kwartier — de grootte van één tijdvak. Daarom een eigen sectie met een eigen
"berekend op". Een cijfer zonder houdbaarheidsdatum naast een live stand zetten
suggereert dat ze even vers zijn.

*Waarom een cache en niet per verzoek.* Gemeten op eigen logboeken: 280.000
momenten per seconde, dus 120 ms voor vijf dagen en zo'n vier seconden voor een
winter. Dat is te veel om bij elke paginaweergave te doen voor een uitkomst die
per kwartier hoogstens één tijdvak opschuift.

*Waarom geen worker thread.* Dat was de aanname; de meting sprak hem tegen. De
analyse leest via een async generator over een bestandsstroom, dus hij geeft de
event loop voortdurend terug — gemeten op **0 ms** grootste vertraging tijdens
een volledige run. Machinerie die een probleem oplost dat er niet is, is
machinerie die je later moet onderhouden.

*De tijdlijn is samengevoegd, niet uitgeschreven.* Een winter is 180 dagen van
96 tijdvakken: zeventienduizend elementen om iets te tonen dat vrijwel altijd
uit lange gelijke stukken bestaat. Aaneengesloten gelijke tijdvakken worden één
rechthoek — op de eigen logboeken 72 in plaats van 480, en dat wordt gunstiger
naarmate er meer stille nachten bij komen.

*De kleuren zijn doorgerekend, niet gekozen.* De tekstkleuren van de pagina
zitten op OKLCH L 0,72-0,82, want ze moeten leesbaar zijn op donker. Voor
gevulde vlakken naast elkaar geldt een andere eis, en die viel buiten de band.
De vier vlakkleuren zijn opnieuw gestapt tot ze alle controles haalden: OKLab
dE >= 9 bij deuteranopie, L binnen 0,48-0,67, contrast >= 3:1 op de achtergrond.
Daarbovenop draagt niets identiteit via kleur alleen — er is altijd een legenda,
en de balken tonen de aantallen erbij.

## 27. De datasetmeter meet dekking, niet duur

*Onderwerp: meten, data en analyse · Status: gecorrigeerd door 27b*

"Hoever zijn we" is een verleidelijk simpele vraag. Het antwoord "vijf dagen"
klopt en zegt niets: vijf dagen september bevatten geen enkel
verwarmingscommando, geen vakantiestand en geen failsafe. Een teller die alleen
dagen telt zou op weg naar een winter geruststellend oplopen terwijl de helft
van de regeling nog nooit is afgegaan.

*Besluit:* de meter telt twee dingen, even zwaar. **Tijd** — dagen per seizoen,
tegen een doel. En **dekking** — is elke modus, elke strategie en elke richting
ooit langsgekomen. Beide halen honderd procent, of het is niet compleet.

*De lijst komt uit de kern.* `MODES`, `ACTIONS`, `REASON_CODES` en `BLOCK_CODES`
zijn gesloten unions, en die zijn hier de checklist. Voegt iemand later een
modus toe, dan verschijnt die vanzelf als openstaand punt in plaats van dat de
meter stilletjes achterblijft — dezelfde reden dat die unions gesloten zijn.

*Wat de meter meteen liet zien,* op de eigen opname van vijf dagen: 44%. Geen
`heat`-commando, geen `heat-assist`, geen `vakantie`. Dat wisten we uit
DECISIONS.md, maar niet als getal, en niet zonder ernaar te zoeken.

*En één ding dat langer wachten niet oplost:* `sensor.temperatuur` wordt niet in
het beslislogboek meegeschreven. De winterdataset die nu wordt opgebouwd is
straks compleet op alles behalve de buitentemperatuur die fase 7 nodig heeft.
Dat staat als aparte waarschuwing in de meter, want het is een andere klasse
probleem dan "nog niet voorgekomen".

*De dagdoelen zijn een oordeel.* Dertig winterdagen, veertien per ander
seizoen. Dat is ervaring en geen meting, net als `bufferBandC` (besluit 14), en
het staat zo in de broncode zodat je erover kunt twisten in plaats van dat het
voor gemeten doorgaat.

### 27b. Het eerste getal was te vriendelijk

*Onderwerp: meten, data en analyse · Status: geldig*

De meter gaf 44% op vijf zomerdagen zonder één verwarmingscommando. Dat voelde
te snel, en dat was het ook — om vier redenen tegelijk, die elk op zichzelf klein
lijken en samen het getal verdubbelden.

**1. Rekenkundig middelen behandelt noodzakelijke voorwaarden als
uitwisselbaar.** 8,9% tijd en 78,6% dekking werd 44%, alsof veel functiedekking
een tekort aan seizoenen kan goedmaken. Dat kan niet: zonder winter valt er over
verwarmen niets aan te tonen, hoeveel zomerdagen je er ook tegenaan gooit. Nu het
meetkundig gemiddelde — nul zodra één as nul is, nooit ver boven de zwakste as,
en het blijft op beide assen bewegen (anders dan het minimum, waarbij
vooruitgang in dekking onzichtbaar zou blijven).

**2. Een vinkje kostte één waarneming.** `handmatig` stond op groen op grond van
één moment van de 33.144. Nu telt iets pas mee als het op **twee verschillende
dagen** voorkwam; één dag geeft een half punt. Eén dag kan toeval zijn of een
handmatige test, op twee losse dagen heeft de regeling het uit zichzelf gedaan.

**3. `arbiter:wind-down` telde als strategie.** Dat is er geen — het is de
arbiter die afbouwt (besluit 5). De opvangregel voor onbekende id's gaf hem een
gratis punt in teller én noemer: 3/4 in plaats van 2/3. Alles met het voorvoegsel
`arbiter:` blijft nu buiten die lijst.

**4. Halve dagen telden als hele.** De opname begon 5 september om 17:11 en
eindigde midden op de 9e: vijf aangeraakte kalenderdagen, 3,9 dagen opname.
Geteld wordt nu het aandeel uren per dag waarin een besluit staat — bestand tegen
een gat, en tegen twee losse records rond middernacht.

*Uitkomst:* dezelfde opname staat nu op **22%**, met tijd 7% en dekking 73%
zichtbaar naast het getal. Dat laatste is het echte antwoord: één getal kan deze
vraag niet dragen, en dan hoort de weergave de twee assen te tonen in plaats van
te doen alsof.

*Les:* een voortgangsmeter die te snel oploopt is erger dan geen meter. Hij
beantwoordt de vraag waarvoor hij bestaat — "kunnen we al iets zeggen?" — met
ja terwijl het antwoord nee is. Acht tests leggen de rekensom nu vast, inclusief
een die eist dat volle functiedekking ontbrekende seizoenen niet goedmaakt.

*Terzijde — en niet de minste vondst:* de weergave laadde na een uitrol de
nieuwe HTML met de oude JavaScript. `app.js` en `app.css` dragen geen hash in
hun naam en werden met `max-age=3600` geserveerd, dus een browser hield ze een
uur vast. Dat mislukt op de lastigst vindbare manier: een pagina die half werkt,
zonder één foutmelding. Nu `no-cache` met `last-modified` (navragen mag,
opnieuw versturen hoeft niet) én een hash van de inhoud in de URL, zodat een
browser die de oude versie al vasthield hem niet meer kan gebruiken. Drie tests
bewaken het.

## 28. De schaduwmodus is geen steiger

*Onderwerp: visie en principes · Status: geldig*

De schaduwmodus is gebouwd om de overstap te kunnen verantwoorden: laat de
arbiter meedenken naast het YAML-systeem, en kijk waar ze uiteenlopen. De
vanzelfsprekende aanname was dat hij daarna weg kan.

*Besluit:* nee. De schaduwmodus en de divergentietool blijven als permanent,
losstaand mechanisme, ook nadat dit huis is overgezet.

*Reden:* wat hij hier deed — een gedragsbasislijn opbouwen voordat er iets
verandert — is precies wat elke vólgende woning nodig heeft. Een nieuw huis
begint met meekijken: wat doet de bestaande regeling, hoeveel koopt het huis in,
wat zou de arbiter anders doen. Pas als dat er staat mag hij sturen.

*Gevolg voor het ontwerp:* de schaduwmodus mag niet groeien naar iets dat alleen
naast een YAML-systeem werkt. Het `migration`-blok is daarom optioneel (besluit
11), en voor een huis zonder voorganger vergelijkt hij de arbiter met wat de
thermostaten uit zichzelf deden. Dat is een andere vraag met dezelfde machinerie
— maar de woorden in de weergave gaan nu nog uit van "het oude systeem", en dat
klopt daar niet. Staat op de lijst.

*Gevolg voor de naam:* "schaduwmodus" beschrijft straks niet meer wat het is.
Het is de onboarding- en verantwoordingsmotor. De naam blijft voorlopig; een
hernoeming raakt tientallen bestanden en lost niets op.

## 29. Twee applicaties, en dat is geen tussenoplossing

*Onderwerp: visie en principes · Status: geldig*

De weergave uit fase 5 is een technische monitor: dicht op de kern, alles wat de
arbiter denkt, in de taal van de arbiter. Bruikbaar voor wie het systeem bouwt.

*Besluit:* het bewonersdashboard wordt daar geen uitbouw van, maar een eigen
applicatie (fase 8) met een eigen ontwerptaal — een premium, rustige interface,
in de geest van de Luminar-energiekaart en de interface uit Iron Man. Die
ambitie staat hier zwart op wit zodat hij niet ongemerkt verwatert tot "de
monitor met een ander kleurtje".

*Waarom niet één applicatie die meegroeit:* de twee hebben tegengestelde eisen.
De monitor moet álles tonen en mag lelijk zijn; het dashboard moet weinig tonen
en moet mooi zijn. Eén codebase die beide doet wordt geen van beide, en de
verleiding om "even" een technisch veld toe te voegen is dan onweerstaanbaar.

*Wat ze delen is precies één ding:* het `Explanation`-contract. Beide lezen wat
de kern al heeft besloten en rekenen niets zelf uit. Dat is dezelfde regel die
het oude dashboard overtrad met vijfhonderd regels JavaScript, en de reden dat
er twee applicaties mógen zijn zonder dat ze uit elkaar lopen.

*Kosten:* de monitor blijft bestaan en moet onderhouden worden. Dat is bewust —
zie besluit 28: hij is straks het onboarding-instrument, niet een overblijfsel.

## 30. Buitentemperatuur naar voren gehaald

*Onderwerp: meten, data en analyse · Status: aangevuld door 30b*

`sensor.temperatuur` stond als openstaand punt: de huidige strategieën gebruiken
hem niet, dus hij ging het beslislogboek niet in. Voor fase 7 — vooruitkijken op
weer en prognose — is hij onmisbaar.

*Besluit:* meteen vastleggen, ver vóór fase 7, en zonder dat de regeling er iets
mee doet.

*Reden:* een ontbrekend meetpunt in een logboek is niet met terugwerkende kracht
te repareren. Elke winterdag die nu zonder buitentemperatuur wordt opgenomen, is
een winterdag die fase 7 opnieuw moet afwachten — en op een winter per jaar is
dat geen detail maar een jaar vertraging.

*Wat het niet is:* een strategie die hem gebruikt. Hij gaat als waarneming mee in
`Explanation` en dus in het logboek. De arbiter neemt er geen besluit op, en de
datasetmeter telt hem als invoer en niet als functie.

*Prijs:* het logboek wordt iets groter, en `Explanation` krijgt een veld dat
voorlopig alleen gelezen wordt door de dataset. Dat is de goedkoopste helft van
een jaar wachten.

### 30b. En toen zochten we naar het volgende gat

*Onderwerp: meten, data en analyse · Status: geldig*

De buitentemperatuur was gevonden doordat hij als openstaand punt in dit document
stond. De vraag daarna was of er méér zulke gaten waren — want elk gat dat je
pas in maart ontdekt, kost een winter.

*Aanpak:* niet nadenken maar meten. Een audit die `buildSystemState` draait met
een bron die bijhoudt welke entiteiten worden aangeraakt, en dat afzet tegen wat
de eventfilter volgt. Alles in de filter dat niemand uitleest is per definitie
een gat: het kost herberekeningen en levert niets.

*Uitkomst:* één treffer, en een pijnlijke. `sensor.beneden_luchtvochtigheid`
stond in de configuratie, `zone.humidity` bestond in het model, `SystemState`
had er een veld voor, en de filter volgde hem — dus elke verandering lokte een
volledige herberekening uit. Alleen las `buildSystemState` hem nooit uit, en
kwam hij nergens in het logboek terecht. Erger dan de buitentemperatuur: die
kostte tenminste niets.

*Besluit:* dezelfde behandeling. Waarneming, geen invoer, wél in het logboek —
ook op korte records, want het verloop is de hele waarde.

*En de bewaking erbij,* want dit hoort niet nog een keer te kunnen: een test
draait die audit en eist dat elke gevolgde entiteit ook werkelijk wordt
uitgelezen. Wat alleen voor het logboek wordt bijgehouden is uitgezonderd; dat
is een bewuste categorie.

*Les:* "staat in de configuratie" betekende niet "wordt gebruikt", en "zit in de
filter" betekende niet "wordt gelezen". Tussen die twee zat een gat waar je
alleen in valt door het na te meten.

## 31. De vertaling had een tweede configuratie in zich

*Onderwerp: configuratie en onboarding · Status: geldig*

`mapping.ts` heette "de enige plek waar entity-ID's voorkomen". Dat klopte, en
was tegelijk het probleem: er stonden er víjf tabellen vol — zonetemperaturen,
actuatorbindingen, vermogenssensoren, de slimme meter en de bewoners — terwijl
`SiteConfig` diezelfde vijf dingen ook al bevatte.

Ze stonden identiek in. Met de hand gelijkgehouden, en niets bewaakte dat. Wie
de zoldersensor in `huis-cornelissen.json` wijzigde, kreeg een arbiter die
stilzwijgend de oude bleef uitlezen — en `relevantEntities()` voegde beide toe,
dus zelfs de eventfilter merkte er niets van.

*Dat is niet alleen fase-6-werk.* Het was een openstaande fout in de draaiende
installatie, van precies de klasse waar dit project voor bestaat: twee plekken
die moeten kloppen, zonder dat iets het controleert.

*Besluit:* de vertaling leest de bindingen uit `SiteConfig`. De tabellen zijn
weg.

*Bewezen in plaats van aangenomen.* Acht tests wijzigen elk een stuk van de
configuratie en eisen dat de vertaling meebeweegt — een andere zoldersensor, een
extra zone, een andere slimme meter, andere bewoners. Ze faalden allemaal tegen
de oude code, met het bewijs erbij: de vertaling las 99 waar de configuratie 21,5
zei. En de replay-harness gaf na de verbouwing over 14.476 ticks bit-identieke
uitkomsten, dus er is geen besluit veranderd.

*De drift-test is van vorm veranderd.* Die las de broncode van `mapping.ts`, haalde
er elke entity-ID uit en eiste dat de filter ze kende. Met de tabellen weg is dat
een bewaking op steeds minder; de sterkere garantie is nu dat de filter een
*andere* configuratie volgt. Beide staan er: de oude voor wat er nog letterlijk
in de code staat, de nieuwe voor wat de configuratie aandraagt.

*Bijvangst:* de standby-afspraak (verwarmen ≤ 18, koelen ≥ 25) stond als vaste
waarde in de code voor precies de twee assist-airco's. Model én schema
ondersteunden `capabilities.standby` allang — alleen de configuratie zette hem
niet. Nu wel, en daarmee is het een eigenschap van het apparaat in plaats van een
conventie in de vertaling.

## 32. Wat in code stond kon niet per woning verschillen

*Onderwerp: configuratie en onboarding · Status: geldig*

Na besluit 31 stonden er nog vier groepen entity-ID's in `mapping.ts`: negen
legacy setpoint-helpers, de zon, twee timers, en de twee keuzelijsten waaruit de
modus komt.

Die laatste zijn het pijnlijkst. Het waren uitgerekend
`input_select.verwarming_modus` en `input_select.koel_strategie` die de 151
minuten uit besluit 8b veroorzaakten — doordat de code er maar één van kende.
Een tweede knop toevoegen was toen een codewijziging. Nu is het een regel in de
configuratie, en kunnen het er drie zijn.

*Besluit:* alles naar `SiteConfig`.

- `mode` — de keuzelijst, welke waarde "automatisch" betekent, de vertaaltabel
  van standen naar modi, en een lijst `handsOffWhen` van knoppen die "handen af"
  betekenen ongeacht de modus.
- `timers` en `sun` — gewoon verwijzingen.
- `migration.setpoints` — de helpers van het oude systeem, per zone en per
  modus. Ze horen bij `migration` en niet bij de kern, want zodra de overstap
  gemaakt is bestaan ze niet meer.

*Bijvangst die groter is dan hij lijkt.* Die negen helpers hadden elk een
hardgecodeerde terugvalwaarde — 20, 22, 19, 16, 18, 22,5 — die de setpoints uit
de configuratie herhaalden. Wéér twee plekken die moesten kloppen zonder dat
iets het controleerde. De terugval is nu de configuratie zelf: valt een helper
weg, dan is "wat de configuratie zegt" het juiste antwoord, en een los getal in
de vertaling was dat nooit.

*Een waarschuwing erbij.* Het schema klaagt wanneer geen enkele stand naar
`handmatig` vertaalt én er geen `handsOffWhen` is: dan kan de bewoner de
regeling nergens loslaten. Waarschuwing en geen fout — een woning zonder die
knop mag bestaan.

*Bewijs.* De drift-test is omgedraaid. Hij eiste dat elk hardgecodeerd ID in de
filter zat; nu eist hij dat er **geen enkel** entity-ID meer in `mapping.ts`
staat. Dat is de sterkere garantie: wat er niet is kan niet afwijken. En de
replay-harness gaf ook na deze verbouwing over 14.476 ticks bit-identieke
uitkomsten.

*Wat dit waard is:* een tweede woning is vanaf hier een tweede JSON-bestand, en
geen codewijziging. Dat was de hele belofte van fase 6.

## 33. De uitrol vraagt het nieuwe image of het de oude configuratie snapt

*Onderwerp: uitrol en beheer · Status: geldig*

Fase 6b maakte `mode`, `timers` en `sun` verplicht in het schema. De
configuratie op de NAS gaat niet met git mee — die hoort bij de installatie
(besluit 21) — dus die had die velden niet. De dienst stopte bij het opstarten
met exitcode 1, `restart: unless-stopped` startte hem opnieuw, en zo verder.

Wat je zag was "de container blijft onverwachts stoppen". Wat er stond was een
keurige foutmelding met drie regels die precies zeiden wat er ontbrak — maar die
scrolde weg in een herstartlus.

*Dit is de tweede keer.* Besluit 25 ging over hetzelfde patroon bij
`docker-compose.yml`, met de les: "een detectie die geen controle wordt, is een
gemiste kans die je pas ziet als hij misgaat." `deploy.sh` wáárschuwde al dat de
configuratie afweek van git. Het gebruikte die kennis alleen niet.

*Waarom het hier niet mag zoals bij compose.* Daar is elk verschil fout, dus
stopt het script erop. Hier mág de configuratie afwijken: dat is de bedoeling.
Weigeren op "anders dan git" zou een correcte installatie blokkeren.

*Besluit:* de uitrol vraagt het nínuwe image of het de drááiende configuratie
kan lezen, en wisselt pas om als het antwoord ja is. `main.js --check-config`
laadt en valideert de configuratie en stopt — zonder Home Assistant, zonder
netwerk, in een wegwerpcontainer op hetzelfde image dat straks gaat draaien.

Dat toetst precies de goede vraag. Niet "is dit hetzelfde bestand als in git",
maar "kan de versie die zó gaat draaien hiermee overweg". Mislukt het, dan
blijft de oude container staan en zegt het script welk bestand je moet
overnemen.

*Volgorde is niet vrijblijvend:* ná het bouwen — het image moet bestaan om
ermee te kunnen toetsen — en vóór het omwisselen, want de oude container moet
nog draaien als het misgaat.

*Wat er nóg open ligt:* dit vangt een ongeldige configuratie. Het vangt niet dat
de configuratie geldig is maar naar entiteiten wijst die niet meer bestaan. Daar
is de failsafe voor, en die meldt het — maar pas als de dienst al draait.

## 34. Hybride SaaS — verborgen HA met een dunne agent

*Onderwerp: visie en principes · Status: geldig*

> **Langetermijnvisie.** Dit besluit stuurt wat we nú bouwen, maar er wordt
> voorlopig niets van geïmplementeerd. Het staat hier zodat de add-on van fase 6c
> de goede vorm krijgt, en niet omdat er aan een cloud wordt begonnen.

Het eindproduct is niet lokaal en niet cloud, maar allebei: een klein kastje bij
de klant met daarop Home Assistant als ónzichtbare driverlaag, onze agent
erbovenop, en een tabletapp aan de muur.

*Waarom niet puur cloud.* Doorgerekend op de eigen installatie: zeven van de
negen apparaten zijn in principe vanuit een server bereikbaar — Nest, LG ThinQ,
Tuya, SolarEdge, Buienradar. Twee niet, en juist de belangrijkste van die twee
is de P1-meter.

Het hele vermogensbudget hangt aan het netvermogen (besluit 13: het netvermogen
bévat het airco-verbruik al), hij staat in `criticalInputs`, en hij meldt zich
elke vijf seconden — in zijn eentje 88% van al het verkeer dat we doorlaten
(besluit 16). Datzelfde getal via een cloud op minuutbasis ophalen betekent
regelen op een gemiddelde in plaats van op wat er nú gebeurt. Dat is een ander
product.

*Waarom niet puur lokaal-zonder-HA.* Elke fabrikant heeft zijn eigen OAuth, rate
limits en voorwaarden. Voor één huis zijn dat er al vier. Die koppelingen zelf
onderhouden is een permanente kostenpost; de HA-gemeenschap doet het gratis en
voor duizenden apparaten. Dát is de waarde van HA in deze stack — niet het gemak,
maar dat "alle apparaten koppelen" zonder zo'n gemeenschap onbetaalbaar is.

*Waarom een tablet niet volstaat.* Een tablet is de bediening, niet de motor. Het
brein moet draaien als het scherm in slaapstand staat, in een la ligt of is
meegenomen.

*Gevolg voor wat we nu bouwen — en dit is de reden dat dit besluit nu al
opgeschreven wordt:* de add-on uit fase 6c **is** versie 1.0 van die agent. Zijn
drie taken zijn dezelfde in beide werelden:

1. **Filteren.** Gemeten: 213.808 gebeurtenissen per dag per huis, waarvan er
   34.920 overblijven. Op duizend huizen scheelt dat 2,1 tegen 13 GB per dag.
   Filteren hoort lokaal, altijd.
2. **Verbinden.** Lokaal met HA, straks eventueel uitgaand met een server.
3. **Veilig terugvallen.** Nu triviaal omdat de schaduwmodus toch niets stuurt.
   Zodra hij wél stuurt, moet er een lokale dodemansknop zijn voor een huis dat
   zijn brein kwijt is: een thermostaat houdt zijn setpoint, maar een airco die
   op `cool` stond blijft koelen.

Bouwen we de add-on zo, dan is de cloudstap later een verplaatsing van
`decide()` — mogelijk gemaakt door besluit 2, de pure kern — en geen
herschrijving. Dan kan het brein per klant links of rechts van de verbinding
draaien.

*Dit draait besluit 17 om,* en die meting ligt er inmiddels: op een Pi 5 kost de
winteranalyse 21,5 s per kwartier op één van vier kernen, met 110 MB piek en geen
meetbaar effect op de reactietijd van Home Assistant. Zie besluit 17b.

*Wat de AVG hiervan vindt.* `occupancy` legt vast wie wanneer thuis is. Zolang
dat op het kastje van de klant blijft is dat zijn eigen data. Zodra er een server
bij komt is het verwerking van persoonsgegevens, met alles wat daarbij hoort.
Een reden te meer om het brein zo lang mogelijk lokaal te houden.

*Harde eis voor de weergave, vastgelegd op verzoek:* achter Ingress moet de
pagina net zo snel aanvoelen als nu. Bij het opschrijven hiervan is dat geen
belofte maar een eigenschap: de frontend gebruikt uitsluitend relatieve paden
(`fetch('api/state')`, niet `/api/state`), wat precies is wat Ingress nodig
heeft, en de hele pagina weegt 59 kB. Het enige echte risico is de SSE-stroom
door de proxy; daarvoor staat `x-accel-buffering: no` al in de kop.

## 35. Een server draagt alleen wat hij draait

*Onderwerp: uitrol en beheer · Status: geldig*

De NAS kloonde de hele repository. Daar zit `HA export/` bij — 3,1 MB
entity-registers en dashboards, driekwart van alles — plus `legacy_code/` en
`ha-fixes/`. Naslag voor het ontwikkelen, op een machine die alleen de dienst
draait.

*Het is geen schijfprobleem.* 3,3 MB. De reden om het toch te doen is een
andere: het is de huishouding van een woning op een server die er niets mee doet.
Nu is dat de eigen NAS en een smaakkwestie. Zodra dit als kastje bij iemand
anders staat (besluit 34) is het dat niet meer, en dan is het goedkoper om de
gewoonte nu te hebben dan hem later in te voeren.

*Besluit:* `deploy.sh` zet sparse-checkout op `backend frontend config deploy`.
Werkmap van 4,2 MB naar 833 kB.

*Waarom cone-modus.* Die houdt de bestanden in de wortel altijd, en dat is hier
geen bijvangst maar een eis: `.dockerignore` moét naast de bouwcontext staan,
anders gaat alsnog de hele map de docker-daemon in — precies de fout uit
besluit 24, maar dan andersom.

*Idempotent en zelfmigrerend.* Staat het al goed, dan doet het script niets. Een
bestaande volle kloon ruimt zichzelf op bij de eerstvolgende uitrol; dat is
getest, net als dat een `fetch` + `merge --ff-only` erna gewoon doorloopt.

*Wat dit niet doet:* de geschiedenis blijft in `.git` staan (1,2 MB). Sparse
checkout haalt bestanden uit de wérkmap, niet uit de objectopslag. Een
`--filter=blob:none`-kloon zou dat wel doen, maar vereist een verse kloon en
maakt het uitchecken netwerkafhankelijk. Voor 1,2 MB is dat de verkeerde ruil.

## 36. De add-on is dezelfde dienst, niet een tweede

*Onderwerp: uitrol en beheer · Status: geldig*

De add-on had een eigen opstartpad kunnen krijgen: eigen configuratielezer,
eigen verbindingslogica, eigen manier om instellingen te vinden. Dat is de
gewone manier waarop een tweede uitrolvorm ontstaat, en het is ook de manier
waarop hij langzaam uit de pas gaat lopen met de eerste.

*Besluit:* `addon/run.sh` vertaalt en niets meer. Het leest de add-on-opties met
`bashio` en zet ze om naar precies de omgevingsvariabelen die de dienst al kende
van de NAS — `SHADOW_TICK_SECONDS`, `SHADOW_LOG_DIR`, `HEMS_WEB_PORT`. Daarna
`exec node dist/main.js`. Er draait één binary, met één opstartpad.

*Zelfs het zoeken van de configuratie is niet nagebouwd.* De lader zoekt vanaf
de werkmap omhoog naar `config/sites`; door in het script naar `/` te gaan vindt
hij `/config/sites` vanzelf. Daarmee blijft al zijn gedrag intact: één bestand is
vanzelfsprekend, meerdere geeft een fout die ze opsomt. Dat nabouwen zou een
tweede plek zijn die kan afwijken.

*Wat de Supervisor wegneemt.* `SUPERVISOR_TOKEN` staat in de omgeving en Home
Assistant zit op `ws://supervisor/core/websocket`. Geen long-lived token meer —
en daarmee ook niet de klasse problemen eromheen. `main.ts` herkent dat vanzelf;
wie `HA_URL` en `HA_TOKEN` zélf zet krijgt die nog steeds, zodat de NAS-uitrol
blijft werken zolang die draait.

*Ingress schrapt besluit 23's openstaande punt.* De weergave had geen inlog.
Achter Ingress zit hij achter die van Home Assistant. Er is bewust géén `ports:`
in het manifest: met een poort erbij zou hij daarbuiten óók bereikbaar zijn, en
dan is er niets gewonnen. Dat dit werkt zonder de frontend aan te passen is geen
toeval maar wel geluk: de pagina gebruikte al uitsluitend relatieve paden, en dat
is precies wat Ingress vereist.

*Eén ding is wél gedupliceerd, met reden.* Het script draait
`main.js --check-config` vóór de echte start. Op de NAS doet `deploy.sh` dat
vlak voor het omwisselen (besluit 33); hier kan dat niet, want de Supervisor
start ons gewoon. Zonder die controle levert een onleesbare configuratie een
herstartlus op waarin de foutmelding wegscrolt — precies wat er op 10 september
gebeurde.

*Terugval bij een hikkende Supervisor.* `bashio::config` haalt de instellingen
over de API. Is die even weg, dan start de add-on met de standaardwaarden en een
waarschuwing, in plaats van niet te starten. Drie instelbare getallen zijn geen
reden om de opname stil te leggen — en het maakt de add-on buiten Home Assistant
te draaien, en dus te testen.

---

## 37. De add-on wordt platgeslagen voordat de Supervisor hem bouwt

*Onderwerp: uitrol en beheer · Status: aangevuld door 118*

De add-on stond in `addon/`, met `COPY backend/...` en `COPY frontend/...` naar
een niveau hoger. Dat werkt bij een handmatige `docker build` vanuit de
projectwortel, en het werkt niet bij de Supervisor.

*Wat de Supervisor doet* (nagekeken in `supervisor/apps/build.py`, niet
aangenomen): hij koppelt uitsluitend de map van de add-on aan, read-only op
`/addon`, zet zijn werkmap daar en draait `docker buildx build .`. Alles
daarbuiten bestaat tijdens het bouwen niet. Er is geen instelling om dat te
verruimen; `build.yaml` kent alleen basisafbeelding, argumenten en labels.

*Besluit:* `addon/stage.ps1` slaat de boom plat tot de vorm die de Supervisor
wél kan bouwen — de bestanden van de add-on bovenin, `backend/` en `frontend/`
ernaast, 58 bestanden en een halve megabyte. De Dockerfile gaat uit van die
vorm en van geen andere. Eén Dockerfile, en het is degene die werkelijk
gebruikt wordt.

*Waarom geen tweede Dockerfile voor de handmatige bouw.* Dat is precies de
constructie uit besluit 36 die we daar afwezen: twee paden die uit de pas gaan
lopen, waarbij het pad dat je zelden gebruikt degene is die het eerst breekt.

*De winkelroute is dicht zolang de repository privé is.* Add-on-bronnen worden
met een gewone `git clone` opgehaald; er is geen plek voor inloggegevens.
Openbaar maken lost het bouwprobleem bovendien niet op — de context blijft de
add-on-map. Wat het wél zou vragen is een eigen, kleine, openbare repository
waarvan de wortel de platte add-on ís. Dat is waar `stage.ps1` naartoe werkt.
Tot dan: lokale add-on onder `/addons/`.

---

## 38. De ruwe HA-export hoort niet in versiebeheer

*Onderwerp: veiligheid · Status: geldig*

`HA export/core.config_entries` stond in de repository. Dat bestand is de bron
van waarheid over welke integraties er zijn — waarvoor het hier ook stond — maar
het bevat de gegevens waarmee die integraties inloggen: 63 werkende geheimen,
waaronder refresh-tokens van Google, een GitHub-token van HACS, en sleutels van
Home Connect, Hue, HomeWizard, SolarEdge, Tuya, Synology en Reolink.

Een refresh-token verloopt niet vanzelf. Wie het bestand heeft, houdt toegang.

*Besluit:* de ruwe export gaat niet in versiebeheer, ook niet in een privé
repository. Wat het onderzoek nodig had — welke integraties er zijn en hoe hun
gegevens zijn opgebouwd — staat in `core.config_entries.gemaskeerd.json`: per
domein het aantal koppelingen en de namen van de velden, met alle waarden
vervangen. Ook namen van installaties en apparaten zijn weg, want een titel als
`gateway-2326-9560-4553.local` is zelf een identificatie.

*Uit de geschiedenis, niet alleen uit de laatste commit.* Een bestand
verwijderen laat het staan in elke oudere commit. De geschiedenis is herschreven
en er is met een steekproef van vijf geheimen gecontroleerd dat ze in geen enkel
object meer voorkomen.

*Wat dit niet oplost.* GitHub ruimt onbereikbare objecten niet meteen op; een
oude commit kan nog even op zijn eigen hash opvraagbaar zijn. De repository is
nooit openbaar geweest, dus dit is opruimen en geen incident — maar het is de
reden dat de tokens hoe dan ook vervangen horen te worden.

*De rest is nagekeken.* Alle andere gevolgde bestanden zijn doorzocht op
token-patronen. Geen treffers. `secrets.yaml` is het lege voorbeeldbestand dat
Home Assistant zelf aanmaakt.

---

## 39. De modus en de timers horen bij de dienst, niet bij Home Assistant

*Onderwerp: kern en regeling · Status: geldig*

Om de add-on te laten starten moest een woning een `input_select` met zeven
standen hebben en twee `timer.`-entiteiten. Bij dit huis bestonden die, omdat de
oude YAML ze had aangemaakt. Bij iemand anders bestaan ze niet — en ze zelf
aanmaken zou schrijven naar Home Assistant zijn, wat besluit 15 verbiedt. De
dienst weigerde dus te starten bij precies de installatie waarvoor hij bedoeld
is.

*Besluit:* `mode` en `timers` in de configuratie worden optioneel. Ontbreken ze,
dan houdt de dienst ze zelf bij (`adapters/own-state.ts`). Staan ze er wel, dan
wint Home Assistant — per timer afzonderlijk, zodat een woning die alleen de
stabilisatietimer daar heeft staan niet ineens ook de andere daar moet hebben.

*Dit raakt de kern niet, en dat is geen toeval.* `state.ts` zei het al: timers
zijn invoer, geen bijwerking. De kern vraagt met een commando om een timer en
leest alleen `endsAtMs`. Tot nu toe beantwoordde het oude systeem die vraag door
zijn eigen `timer.pv_stabilisatie` te starten; nu kan de dienst het zelf. Aan
`decide()` is geen regel veranderd, en de replay over de volledige opname is
bit-identiek — byte voor byte hetzelfde rapport.

*Waarom niet de helpers aanmaken via de API.* Dat kan technisch: de add-on heeft
`homeassistant_api`. Maar dan is "de schaduwmodus schrijft niets" niet langer
een eigenschap maar een gewoonte met een uitzondering, en uitzonderingen op die
regel zijn precies wat je niet wilt in een dienst die straks wél gaat schakelen.
De interne stand kost minder en houdt de belofte heel.

*Wat er nog niet is: opslag.* Een herstart wist de stand. Voor de
stabilisatietimer is dat onbelangrijk — die loopt minuten. Voor de modus telt
het pas wanneer de dienst werkelijk schakelt; in de schaduwmodus is "terug naar
automatisch" ongevaarlijk. Zodra er geschakeld wordt hoort hier een bestandje
bij.

*`timers.manualOverride` is nu ook optioneel.* Bij het nakijken bleek dat niets
in de kern hem uitleest — hij wordt alleen meegedragen. Hem eisen was een eis
zonder doel. Het veld blijft bestaan omdat de detectie van "de bewoner heeft
zelf iets gedaan" er straks op landt; die informatie komt nu nog van het oude
systeem, dat de timer zelf startte.

*Er zit nog geen knop op.* `ShadowRunner.setMode()` bestaat, maar er is geen
HTTP-eindpunt. De weergave is read-only (besluit 23) en dat veranderen is een
eigen besluit — het komt aan de orde bij de onboarding, die de eerste keer is
dat de pagina iets terugschrijft.

---

## 40. Het schema weigert alleen nog op wat er echt niet zonder kan

*Onderwerp: configuratie en onboarding · Status: geldig*

Om te starten moest een woning 158 waarden aanleveren met 34 entity-ID's.
Bijna alles was verplicht, en dat leek verdedigbaar: hoe explicieter de
configuratie, hoe minder verrassingen. Maar de meeste van die waarden zijn
keuzes waar een nieuwe gebruiker nog geen mening over heeft — een schakelband,
een thermische massa, drie draaitijden, een setpoint per modus per zone. Dat is
geen configuratie meer maar een examen, en je slaagt er pas voor nadat je het
systeem al kent.

*Besluit:* er blijven drie levensaders over. Een **tijdzone**, want zonder die
verschuift de hele dagindeling zonder dat iemand het merkt. Minstens één
**zone**, want anders is er niets om te regelen. Minstens één **apparaat**,
want anders is er niets om mee te regelen. Het kleinste geldige bestand is
daarmee twaalf regels.

*De regel waarmee de rest is afgewogen:* een standaardwaarde mag, zolang fout
zijn ongevaarlijk of behoudend is. Een verkeerd geraden schakelband kost
comfort. Een verkeerd geraden `canHeat` laat de regeling verwarmen met een
apparaat dat dat niet kan. Die tweede soort blijft verplicht — net als de
thermometer van een zone, en het vermogen van een assist-apparaat.

*Dat laatste is niet willekeurig.* Comfort en heat-assist vragen `budgetW: 0`
en worden nooit door het vermogensbudget tegengehouden. `pv-surplus` verdeelt
juist wél, en een apparaat dat nul watt claimt past altijd — hoe weinig er ook
over is. Daar is raden niet ongevaarlijk maar precies het probleem. Vandaar:
`estimatedW` mag ontbreken bij een `primary`, niet bij een `assist`.

*Koelen wordt nooit verzonnen.* De standaard-setpoints regelen alleen
verwarmen. Een koeldrempel raden zou een airco kunnen laten draaien op een
getal dat wij hebben bedacht.

*Degraderen in plaats van stilvallen.* Zonder netmeting wordt `pv-surplus`
werkelijk uit de lijst gehaald, met een melding. Hem laten staan zou hem laten
rekenen met een gridPowerW van nul: elke ronde een budget van vijftig watt,
waar niets op start. Dat is geen werkende regeling maar een stille — en stil
mislukken is wat dit project overal probeert te vermijden.

*Een leeg huis is een bewoond huis.* `some()` op een lege lijst geeft false, en
dat betekende: geen `person.`-entiteiten ingesteld, dus altijd afwezig, dus
altijd de zuinige setpoints. Een installatie die zichzelf stilzwijgend koud
houdt. Wanneer we het niet weten raden we nu de comfortabele kant.

*Wat het niet is: soepeler worden over fouten.* Een veld dat er wél staat maar
niet deugt, is nog steeds een fout. Ontbreken en verkeerd zijn is niet
hetzelfde.

*De draaiende opname merkt er niets van.* `huis-cornelissen.json` vult alles
zelf in, dus geen enkele terugval treedt in werking. De replay over de volledige
geschiedenis levert opnieuw byte voor byte hetzelfde rapport.

---

## 41. De ontdekking stelt voor en besluit niet

*Onderwerp: configuratie en onboarding · Status: geldig*

Na besluit 40 is het kleinste geldige bestand twaalf regels. Maar in die twaalf
regels staan entity-ID's, en die vind je alleen door in de
ontwikkelaarshulpmiddelen van Home Assistant te graven. De drempel was verlaagd,
niet weggehaald.

*Besluit:* `--discover` leest de registers en stelt een configuratie voor. Elke
keuze komt terug met de reden en de alternatieven, en wat geraden is heet
geraden. Het schrijft nooit over een bestaand bestand heen.

*Alleen lezen, en dat is afgedwongen.* `HaClient.query` kent een witte lijst met
vier opdrachten: de drie registers en `get_config`. Alles daarbuiten werpt, net
als `callService` zonder schrijfrechten (besluit 15). Een uitzondering op die
regel zou weinig waard maken dat de regel bestaat.

*Twee dingen die dit ontwerp bepaalden komen uit echte data, niet uit de
documentatie.* In de gemeten woning hadden 3 van de 2.507 entiteiten een eigen
`area_id`; de rest erft het gebied van zijn apparaat. En zonder filter op
`entity_category` wordt de schijftemperatuur van een NAS een
woonkamerthermostaat — van de 36 temperatuursensoren daar was de meerderheid
diagnostisch.

*Niet kiezen is soms het antwoord.* De eerste versie viel voor de
buitentemperatuur terug op "een thermometer die aan geen enkel gebied hangt".
Op de echte installatie leverde dat achttien kandidaten op, en de eerste was
een Formule 1-sensor. Het veld is optioneel; een verkeerde keuze kost meer dan
geen keuze. Nu worden de kandidaten getoond en kiest de bewoner.

*Het voorstel wordt door het eigen schema getoetst.* Dat is een test, en die
test vond meteen een fout in besluit 40: de standaard-setpoints waren vaste
getallen, terwijl haalbaarheid van het apparaat afhangt. Vakantie op 12 °C is
onmogelijk voor een airco die bij 16 begint, en de samenhangscontrole wees het
voorstel terecht af. Nu worden alleen de *ingevulde* setpoints binnen bereik
geschoven; wat de bewoner zelf opschrijft blijft staan en mag gerust een fout
opleveren.

*Kan een zone niet verwarmen, dan verdwijnen de ingevulde verwarmingsdoelen* —
en er komt geen koeldoel voor in de plaats. De zone doet dan niets, en dat is
eerlijker dan een getal verzinnen waarop een airco gaat draaien.

*Wat het nog niet kan.* Een klimaatapparaat met een ingebouwde thermometer maar
zonder losse sensor levert geen zone op. Op de gemeten woning kostte dat de
badkamer. Dat vraagt een verwijzing naar een attribuut in plaats van naar een
entiteit, en dat is een modelwijziging — een eigen besluit waard, wanneer
blijkt dat het knelt.

---

## 42. De weergave mag schrijven waar Home Assistant de deur bewaakt

*Onderwerp: veiligheid · Status: aangevuld door 97*

Besluit 23 legde vast dat de weergave alleen leest, en besluit 29 maakte daar
een muur van: alles wat geen GET of HEAD is krijgt 405, vóór de routering, zodat
een nieuwe route die grens niet per ongeluk kan omzeilen. Dat was geen
overdrijving. Deze dienst houdt een token met volledige toegang tot Home
Assistant vast, en de pagina had geen enkele inlog.

Maar een onboarding die niets kan wegschrijven is een folder.

*Besluit:* er komt precies één deur in die muur, op één pad, en hij bestaat
alleen wanneer de dienst weet dat er een inlog vóór zit. Achter Ingress is dat
zo: Home Assistant heeft de bezoeker dan al vastgesteld, en het manifest
publiceert bewust geen `ports:` — er is geen route van het netwerk naar die
poort omheen.

*De schakelaar staat in `main.ts` en niet in de server.* De server weet niet
waar hij draait; `main.ts` wel. Zonder Supervisor wordt de onboarding niet
aangemaakt, en dan bestaat de route niet — ook niet ongebruikt.

*Er is één uitzondering, en die is expliciet.* `HEMS_ONBOARDING=1` zet hem ook
buiten de add-on aan, met een waarschuwing bij het starten. Dat is dezelfde
vorm als `HEMS_WEB_PORT`: luisteren is een keuze die je maakt. Zonder die
schakelaar zou de deur alleen achter Ingress bestaan en dus nergens uit te
proberen zijn — en een deur die je niet kunt testen, test je op de draaiende
dienst.

*Ontbreken is geen fout meer.* Een verse installatie heeft geen configuratie,
en dat is de normale toestand van iemand die net begint. De add-on start nu, en
regelt niets tot er iets is ingesteld. Wat er staat maar niet deugt blijft wél
een opstartfout: dat moet gerepareerd worden, niet overschreven (besluit 33).
`ConfigError` heeft daarvoor een `soort` gekregen, zodat dat onderscheid in de
code staat en niet in een tekstvergelijking.

*De pagina stuurt geen configuratie.* Ze stuurt antwoorden op vragen die de
dienst heeft gesteld. Wat een antwoord betekent — een veld zetten, een zone een
andere thermometer geven, een dubbel apparaat eruit halen inclusief de
verwijzingen ernaar — staat in `discovery.ts`, op één plek, met tests. Zou de
pagina de JSON zelf samenstellen, dan moest de vorm ervan op twee plekken
kloppen, en dat is precies wat besluit 29 uit `mapping.ts` heeft gesloopt.

*Vier sloten op het schrijven zelf.* Een antwoord dat niet in de aangeboden
keuzelijst stond wordt genegeerd. Het resultaat gaat door het gewone schema
voordat er iets op schijf komt. Een bestaand bestand wordt nooit overschreven.
En er wordt niets geschreven zolang er überhaupt een configuratie staat.

*Dat vierde slot ontbrak, en dat kostte diezelfde avond de add-on.* Het derde
keek alleen of het bestand dat wíj zouden schrijven al bestond. Naast
`huis-cornelissen.json` verscheen daardoor `mijn-huis.json`, de lader weigerde
te kiezen tussen twee configuraties — terecht — en de dienst startte niet meer
op. Het bestaande bestand was keurig beschermd; de installatie niet.

De onboarding is er voor een lege installatie. Wie er al een heeft en opnieuw
wil beginnen, zet het oude bestand zelf opzij: één handeling, en zichtbaar. De
weergave zegt dit nu vóórdat er iets te klikken valt en verbergt de knop, want
een knop die altijd weigert is erger dan geen knop.

*Gemeten aan de echte woning.* Het voorstel komt uit op drie zones en vijf
apparaten, met vijf open vragen: de buitentemperatuur, de netmeting, welke
thermometer voor de zolder geldt, en twee keer welke van twee integraties
hetzelfde apparaat aanstuurt. Na beantwoorden blijven er drie apparaten over en
komt het bestand door `--check-config` heen.

---

## 43. Een meetwaarde mag in een attribuut zitten

*Onderwerp: configuratie en onboarding · Status: geldig*

Besluit 41 noemde het als bekende beperking: een kamer met een thermostaat of
airco die zijn eigen temperatuur meet, maar zonder losse `sensor.`-entiteit,
kon geen zone worden. Bij de gemeten woning kostte dat de badkamer. En het is
geen randgeval — een apparaat met een ingebouwde thermometer maakt daar lang
niet altijd een aparte entiteit voor aan.

*Besluit:* `Zone.temperature` en `Zone.humidity` zijn een `Meetpunt` geworden:
een verwijzing die optioneel een attribuut noemt.

```json
"temperature": "sensor.woonkamer_temperatuur"
"temperature": { "id": "climate.thermostaat_badkamer",
                 "attribute": "current_temperature" }
```

*Dit kostte bijna niets, en dat is geen toeval.* Beide adapters — de live-
adapter en de replay-harness — konden attributen al lezen; `EntitySource` had
`attrNumber` van het begin af aan, omdat het setpoint van een klimaatapparaat
ook een attribuut is. Wat ontbrak was een manier om het op te schrijven. De
kern merkt er niets van: die krijgt een getal.

*Een losse sensor gaat altijd voor.* De thermometer in het apparaat zit bij de
uitblaas of tegen het plafond en leest daardoor anders dan de kamer. Bruikbaar,
maar tweede keus — en de ontdekking zegt dat er ook bij, in plaats van het
verschil te verzwijgen.

*Luchtvochtigheid langs dezelfde weg.* Die is waarneming en geen invoer
(besluit 30), dus een minder nauwkeurige bron verandert daar geen regelgedrag.

*Gemeten aan de echte woning.* Het voorstel gaat van drie naar vier zones, en
in de schaduwmodus leest de badkamer 22,5 °C via `current_temperature`. De
korte vorm blijft een gewone tekst, zodat een bestand er niet ingewikkelder
uitziet dan het is.

---

## 44. De assistent is een vierde voorsteller, geen baas

*Onderwerp: visie en principes · Status: geldig*

Het doel is een assistent waaraan je kunt vragen waarom het koud is, en die je
kunt zeggen dat de airco wel wat warmer mag — desnoods met spraak. De
verleiding is om zo'n model rechtstreeks aan de apparaten te knopen. Dat is
precies wat hier niet gebeurt.

*Besluit:* het systeem kent al `Intent` — strategieën stellen voor, de arbiter
beslist. Een assistent wordt daar een voorsteller bij. Hij leest het
`Explanation`-object en zet een verzoek om in een intentie. **Hij roept nooit
zelf een dienst aan.** Dezelfde muur als besluit 15 en 42: geen afspraak maar
een grens in de code.

*Wat dat gratis oplevert.* Het vermogensbudget, de draaitijden, de failsafe en
de handen-af-knop blijven onverkort gelden voor een verzoek van de bewoner.
En een afwijzing is al in woorden beschikbaar: `blockedBy:
surplus_insufficient` is "kan nu niet, er komt te weinig van het dak". Een
assistent die alleen "oké" of "dat lukt niet" kan zeggen is een speeltje; deze
kan zeggen waarom, omdat de arbiter dat toch al opschrijft.

*Er is minder taalmodel nodig dan het lijkt.* Drie verschillende taken:
zinsherkenning ("zet de woonkamer een graadje warmer") kan Home Assistant
Assist lokaal en deterministisch; uitleg in woorden is een sjabloon over het
`Explanation`-object en is daarmee altijd waar; alleen open vragen ("was het
gisteren duurder?") vragen werkelijk een model. De eerste twee geven het
grootste deel van het gevoel, exact en gratis.

*De getallen komen uit de data, alleen de zinnen uit het model.* Een assistent
die zegt dat de zolder 24 graden is terwijl het er 19 is, sloopt het
vertrouwen sneller dan een saaie tabel het opbouwt.

*Hardware, nuchter.* Whisper en Piper draaien prima op een Pi 5; een taalmodel
niet comfortabel. Spraak lokaal, het model elders — en de regeling moet blijven
werken wanneer dat model wegvalt. Dat laatste is geen detail maar een eis.

*Waarom dit uniek is, en waarom niet.* Een taalmodel aan een thermostaat knopen
kan iedereen. Het verschil is dat dit model iets echts te vertellen heeft;
bijna elk ander systeem moet een reden verzinnen omdat er geen besluit ligt dat
zichzelf uitlegt.

---

## 45. Een bewoner ziet nooit een entity-ID

*Onderwerp: weergave · Status: geldig*

De weergave die er nu staat is een instrumentenpaneel voor één gebruiker die
weet wat een arbiter is. Dat blijkt overal: `budget 1106/1972 W`,
`geblokkeerd: ac-zolder cool — stabilisation_active`, en een onboarding die
`climate.air_conditioning_woonkamer_2` in een keuzelijst zet.

Die laatste is het scherpste voorbeeld, want het is zelfgemaakt: de naam *Airco
woonkamer* en het gebied *Woonkamer* staan gewoon in het register. De
ontdekking leest ze en gooit ze in de weergave weg.

*Besluit:* in een bewonersweergave komen geen entity-ID's, geen blokkadecodes
en geen domeintermen voor. Namen komen uit Home Assistant — `friendly_name` en
de gebiedsnaam — en codes worden vertaald. Die vertaling bestaat al voor de
blokkaderedenen in `app.js`; die lijn trekken we door.

*Twee publieken, dezelfde gegevens.* Het instrumentenpaneel blijft bestaan, met
watts en codes en entity-ID's, want dat is wat je nodig hebt om te zien wat de
arbiter denkt. Daarnaast komt een bewonersweergave op precies dezelfde
`Explanation`. Geen tweede waarheid, wel een tweede taal.

*Waarom nu vastgelegd en niet straks gebouwd.* Het bewonersdashboard heeft pas
zin wanneer de dienst werkelijk schakelt — een mooie interface waarin je niets
kunt veranderen is een screensaver. Maar zonder deze regel groeit alles wat we
tussentijds bouwen verder de verkeerde kant op, en "dat maken we later mooi"
is hoe het nooit gebeurt.

---

## 46. Het huis leert wat het ís, niet wat het moet doen

*Onderwerp: visie en principes · Status: geldig*

Er zit leren in dit systeem, en er zit bewust geen leren in. Het onderscheid
loopt precies langs de grens tussen wereldbeeld en beleid.

*Wordt uit data geleerd:* hoe snel elke kamer afkoelt per graad verschil met
buiten, wat een apparaat werkelijk levert in graden per uur, hoe lang
voorverwarmen duurt bij dit weer, hoeveel zon er vanmiddag komt. Dat is het
wereldbeeld — wat het huis ís.

*Blijft vaste logica:* wanneer een zone om warmte vraagt, hoe overschot bij
schaarste wordt verdeeld, dat handmatig altijd wint, dat een assist-apparaat
wijkt voor comfort. Dat is beleid — wat het huis moet doen.

*Waarom die grens er is.* `decide(toestand, configuratie, tijd)` is zuiver:
dezelfde invoer geeft over een jaar hetzelfde antwoord. Dat is wat het mogelijk
maakte om na drie ingrijpende verbouwingen te zeggen dat de replay over 14.476
ticks byte voor byte identiek was. Een beleid dat zichzelf bijstelt maakt die
zin onmogelijk — en belangrijker: dan is "waarom staat de airco aan?" niet meer
te beantwoorden met een reden, alleen met "omdat het model dat vond".

*Voorspellingen mogen wél uit een model komen.* Zon, prijzen, aanwezigheid. Die
gaan als invoer de arbiter in en staan als getal in het logboek. Is de
voorspelling fout, dan is het besluit nog steeds navolgbaar: er stond gewoon
iets verkeerds in.

*En er is een praktische kant.* Eén huis, een handvol apparaten, een paar
seizoenen. Dat is te weinig data om gedrag uit te leren, en veel te weinig om
op te mogen experimenteren. Een regeling die verkent is een huis dat op dinsdag
koud is.

---

## 47. De opbrengst van de panelen is de instralingsmeter

*Onderwerp: meten, data en analyse · Status: geldig*

Het thermische model van fase 7 heeft drie termen: warmteverlies naar buiten,
wat een apparaat levert, en hoeveel de zon een kamer opwarmt. Voor die derde
stond er alleen `sun.sun` in het logboek — boven of onder de horizon. Dat is te
grof: een heldere februarimiddag en een grijze zijn allebei "boven".

*Besluit:* `solarProduction` komt in de configuratie en de gemeten waarde gaat
mee het beslislogboek in, als `zonW`. Een woning met panelen heeft daarmee de
beste instralingsmeter die er is al in huis staan — betere data dan een
weerdienst, want hij meet wat er op dít dak valt.

*Zelfde behandeling als de buitentemperatuur (besluit 30).* Waarneming, geen
invoer. De regeling leest hem niet, en de test die dat bewaakt is uitgebreid
zodat hij nu beide velden dekt in plaats van alleen de temperatuur.

*Waarom nu en niet in maart.* Precies de les van vorige week: een kolom die je
niet opneemt is een winter die je niet terugkrijgt. Toen ontbrak de
buitentemperatuur, nu deze. Het kost een halve dag en het scheelt een jaar
wachten.

*De ontdekking stelt hem voor,* met de eis dat de sensor in watt meet — een
omvormer die in kW rapporteert kan ook, maar dan klopt de eenheid in het
logboek niet meer met de rest. Bij deze woning wordt dat
`sensor.solaredge_huidig_vermogen`.

*De datasetmeter telt hem mee.* Zolang de kolom leeg blijft, staat hij bij de
ontbrekende invoer. Anders zou de meter volledigheid melden die er niet is.

---

## 48. De dataset komt er met een knop uit, als tar.gz

*Onderwerp: meten, data en analyse · Status: geldig*

De opname van de NAS halen ging via de Samba-share, met een PowerShell-script
dat het pad hardgecodeerd had. Dat werkt zolang je thuis bent met de juiste
schijf gekoppeld. De weergave staat er al; een knop erbij is minder werk dan
dat script onderhouden.

*Besluit:* `/api/export` levert alle dagbestanden als één gzipte tar.

*Waarom tar en niet één samengevoegd NDJSON.* Dat plakt prima aan elkaar, maar
dan is de dagindeling weg — en `findLogFiles` zoekt juist naar
`decisions-JJJJ-MM-DD.ndjson`. Een export die je niet in de divergentietool kunt
terugzetten is een archief en geen dataset. Uitgepakt krijg je een map die je
rechtstreeks aan `--benchmark` of de analyse kunt voeren.

*Met de hand geschreven, geen pakket.* Een ustar-kop is 512 bytes met velden op
vaste posities; minder code dan de afhankelijkheid waard is voor een dienst die
maanden onbewaakt draait. `zlib` zit al in Node. De test pakt het archief uit
met de `tar` van het systeem en legt de inhoud naast het origineel — een
verkeerde checksum of een vergeten vulblok levert een bestand op dat er prima
uitziet en dat niets opent.

*Streamend, niet in het geheugen.* De opname is 50 MB en wordt een winter lang
groter. Alles eerst inlezen zou de dienst die de opname máákt kunnen omleggen.

*Wat dit wél verandert aan besluit 23.* De weergave heeft geen inlog, en dit
maakt de volledige opname downloadbaar voor wie op het netwerk zit. Dat is meer
dan de pagina al toonde: per minuut, maanden terug, inclusief wanneer er niemand
thuis was. Geen wachtwoorden en geen tokens, maar wel het gedrag van een
huishouden. Achter Ingress is dat geen punt; op de NAS is het een reden te meer
om er geen portforward op te zetten.

*De knop verschijnt alleen wanneer er iets te halen valt,* met het aantal dagen
en de omvang erbij. Het verschil tussen 3 MB en 300 MB bepaalt of je erop klikt
terwijl je op je telefoon zit.

---

## 49. De schaduw meet zijn eigen geschiedenis

*Onderwerp: kern en regeling · Status: gecorrigeerd door 49b*

`minutesSinceChange` leest `ActuatorState.lastChangeMs`, en de vertaling vulde
dat met `source.changedAt(climateEntity)` — de laatste schakeling van het échte
apparaat. In de schaduwmodus stuurt de arbiter niets (besluit 15), dus staat dat
apparaat waar het oude systeem het zette, meestal al uren. Daardoor was de
verstreken tijd vrijwel altijd groot en bleven `minRunMinutes` en
`minRestMinutes` zonder werk. Hetzelfde gold voor `currentZoneAction` in
`context.ts`, dat dezelfde stand leest om te bepalen of een zone al aan het
koelen was: ook de hysterese keek naar het oude systeem.

Over het augustusvenster was 57% van de ritten van `ac-zolder` korter dan de
ingestelde ondergrens van 15 minuten, over het septembervenster 50%. Niet omdat
de grens verkeerd stond, maar omdat hij de verkeerde geschiedenis las.

*Besluit:* de schaduw houdt een eigen boekhouding van wat de apparaten zouden
doen, gevuld met precies de commando's die de arbiter gaf
(`adapters/shadow-actuators.ts`). De vertaling legt die over de stand uit Home
Assistant. Weglaten geeft het oude gedrag, en dát is het juiste zodra de
actuator-laag werkelijk schakelt: dan ís het echte apparaat het antwoord.

*Niet hetzelfde als `OwnState`.* Die houdt bij wat de dienst bezit omdat Home
Assistant het niet heeft — modus en timers (besluit 39). Dit houdt bij wat er
niet is. Eigendom tegenover veronderstelling, dus aparte modules.

*Wat er meetbaar aan verandert.* Over beide vensters is nu 0% van de ritten
korter dan de ondergrens, tegen 21–57% ervoor. De mediane rit van `ac-zolder`
gaat van 10,0 naar 23,0 minuten (augustus) en van 12,5 naar 23,5 (september).
`min_run_not_elapsed` gaat van 31 naar 266 keer in september, `min_rest_not_-
elapsed` van 203 naar 697. De grenzen dóen nu iets, en dat is aantoonbaar in
plaats van aannemelijk.

*Het aantal wisselingen is tussen de twee opstellingen niet vergelijkbaar,* en
dat is geen detail. Zonder eigen stand staat het apparaat altijd `off`, en
`windDownIntent` laat een uitgeschakeld apparaat met rust — de afbouwketen
(koelen → standby → uit) was daardoor onbereikbaar en werd nooit geteld. De
oude cijfers zijn dus geen ondergrens voor het geklapper, ze zijn een
halfgelopen toestandsmachine. Het aantal ritten is de maat die wel vergelijkt.

*De gemeten vermogens blijven gemeten, met één regel erbij.* Wijkt de
veronderstelde stand af van de echte, dan meet die sensor een ander apparaat en
is de waarde onbruikbaar in plaats van verkeerd. Beide lezers —
`reclaimableW` en `claimW` — vallen dan terug op `estimatedW`, precies waar die
schatting voor is. Zonder die regel telt `reclaimableW` de gemeten 0 W van een
echt apparaat dat uit staat, terwijl het veronderstelde apparaat draait en dus
wél terug te winnen is.

*Wat dit blootlegt en nog geen besluit heeft.* Met werkende grenzen draait de
arbiter zijn airco's in het septembervenster 1.610 minuten terwijl het huis
netstroom invoert en het echte apparaat stilstond — ruwweg 22 kWh in 10,6 dagen,
als bovengrens. Slechts 266 van die momenten zijn `min_run_not_elapsed`; het
merendeel komt doordat het budget een draaiend apparaat aanvaardt, want zijn
eigen opname staat in `reclaimableW` en er is 50 W tolerantie. Dat is
`reclaimableW` die doet wat hij moet — niet uitschakelen voor een korte dip —
maar het betekent wel dat "wij koelen alleen op eigen stroom" niet houdbaar is
zoals het nu staat. Hoort bij besluit 50 over de comfortvloer voor koelen.

*Achteraf: dit getal was grotendeels een fout in de schaduw zelf.* Zie 49b
hieronder. Na de correctie blijft er ruwweg 2 kWh per tien dagen over.

*Wat er niet in zit.* `producing` blijft het echte apparaat: of een apparaat
werkelijk warmte levert is natuurkunde, en die rekenen we niet door zolang er
geen thermisch model is. Dit raakt alleen heat-assist. De temperatuur blijft
ook de gemeten temperatuur — dit is een schaduwvergelijking en geen gesloten
simulatie. Daardoor is het bovenstaande een bovengrens: onder echte regeling was
de zone eerder koud en de vraag eerder weg.

*De replay blijft bit-identiek* (938 bytes, sha256 `81a74044…`), want die geeft
geen eigen stand mee. `tools/onderzoek/decision-49.ts` rekent het verschil door over
beide vensters.

### 49b. De veronderstelling blijft bij de meter en bij de bewoner

*Onderwerp: kern en regeling · Status: geldig*

De 22 kWh hierboven klopte niet, en de fout zat in de boekhouding van 49
zelf. Op twee plekken liet de veronderstelde stand zich los van wat er werkelijk
gebeurde.

*Het budget rekende met een ander huis dan de meter.* Beschikbaar is
`−net + terugwinbaar + tolerantie`. Het netvermogen is gemeten aan het échte
huis, maar terugwinbaar volgde de veronderstelde apparaten. Draaide onze airco
en de echte niet, dan telde hij voor 750 W als terugwinbaar terwijl de meter
hem nooit zag. Bij 30 W invoer zag de arbiter 770 W ruimte waar er 20 was, en
bleef hij draaien waar hij onder echte regeling zou afbouwen.

*Besluit:* de adapter geeft wat de échte apparaten opnemen apart mee
(`PowerState.observedDrawW`), en de kern rekent terugwinbaar daarmee. Dan valt
de veronderstelling precies weg uit de ruimte: `−net + echt verbruik +
tolerantie` is de basislast van het huis, ongeacht welk apparaat er in welke
versie draait. Het logboek blijft daarmee de werkelijkheid — gemeten net,
werkelijk verbruik — en dat moest ook: de weergave toont `gridPowerW` als de
P1-meter, en de divergentie-analyse rekent netstroom aan het oude systeem toe
met `reclaimableW` als "wat er echt draaide". Met de boekhouding van 49 op de
NAS zou die analyse de veronderstelde apparaten zijn gaan tellen. Zonder
schaduw geeft de adapter het veld niet mee en rekent de kern zoals altijd.

*In handmatig bleef de veronderstelling hangen.* Dan geeft de arbiter bewust
geen commando's (besluit 8), dus hield de boekhouding zijn laatste opdracht
vast — terwijl de bewoner het echte apparaat allang anders had gezet. In het
septembervenster: 589 minuten een veronderstelde woonkamer-airco die "koelde"
terwijl hij uit stond.

*Besluit:* zolang de bewoner stuurt, laat de boekhouding los en geldt het echte
apparaat (`SchaduwApparaten.volg`). Onder echte regeling pakt de arbiter het na
handmatig ook op vanaf de stand waarin de bewoner het achterliet. Behalve bij de
failsafe: die stuurt ook in handmatig de assist-apparaten uit, en die commando's
gelden.

*En het meetscript maakte dezelfde fout.* `decision-49.ts` onthield het laatst
gegeven commando als stand. Na handmatig hoeft de arbiter niets te sturen — het
echte apparaat staat al uit — en dan telde het script een airco die koelde. Het
meet nu de stand waarmee de arbiter de minuut ingaat.

*Wat er overblijft* aan draaien tijdens invoer, met het echte apparaat stil, als
bovengrens:

| | augustus | september |
| --- | --- | --- |
| besluit 49 zoals vastgelegd | 5,3 kWh | 22,1 kWh |
| met 49b | 2,0 kWh | 2,0 kWh |
| met 49b en 51 | 1,8 kWh | 1,9 kWh |

Dat is ongeveer 0,2 kWh per dag: de prijs van `minRunMinutes`. Een apparaat dat
start en een kwartier moet blijven draaien, draait soms door een wolk heen. Dat
is waar de draaitijd voor bestaat, dus hier hoort geen apart besluit over een
"dip-grens" bij — de vraag uit besluit 49 is beantwoord.

---

## 50. Comfort mag koelen boven een plafond, ook op netstroom

*Onderwerp: kern en regeling · Status: geldig*

Comfort stelt alleen voor voor `primary`-apparaten, en in dit huis kan geen
enkele primary koelen: de Nest en de badkamerthermostaat verwarmen alleen. De
airco's zijn `assist`, en assist draait uitsluitend op overschot. Er bestond dus
geen comfortpad voor koelen. De zolder heeft zelfs helemaal geen primary. Op
een bewolkte dag van 28 graden koelt er niets, hoe warm het ook wordt. In het
septemberlogboek zat de woonkamer 96,6% van de tijd meer dan een halve graad
boven zijn doel — geen storing, een ontbrekend pad.

*Besluit:* een zone kan een `comfortMaxC` krijgen. Boven dat plafond, met de
gewone hysterese van de zone, stelt comfort koelen voor op het eerste apparaat
in de zone dat kan koelen — met `budgetW: 0`, dus onblokkeerbaar.

*Een plafond en geen doel.* Hij koelt tót het plafond, niet door naar het
koeldoel. "Het mag niet warmer worden dan dit" is iets anders dan "het moet hier
naartoe", en dat verschil is het grootste deel van de rekening. Naar het
koeldoel laden blijft het werk van pv-overschot, op eigen stroom.

*Alleen waar geen primary kan koelen.* Kan die het wel, dan verdedigt het
koeldoel al een strengere grens en voegt een plafond niets toe behalve een
tweede voorstel dat afgewezen wordt.

*Geen standaardwaarde.* Koelen op netstroom is een keuze met een prijs, en die
maakt de bewoner, niet het schema. Weglaten geeft het gedrag van vóór dit
besluit. Een plafond onder het koeldoel levert een waarschuwing: dan is de dure
regel strenger dan de zuinige en koelt hij altijd op netstroom.

*Wat de hoogte kost, over beide vensters* (`tools/onderzoek/decision-50.ts`, met
besluit 49 aan). De betrouwbare kolom is hoe lang de zone boven het plafond zat,
want die hangt niet af van wat koelen met de temperatuur doet:

| plafond | woonkamer aug | woonkamer sep | zolder aug | zolder sep |
| --- | --- | --- | --- | --- |
| 26 °C | 5% | 1% | 5% | 2% |
| 25 °C | 34% | 7% | 14% | 11% |
| 24 °C | 90% | 51% | 45% | 37% |
| 23 °C | 99% | 97% | 83% | 83% |

De netstroom die het script erbij geeft is alleen bij 26 °C bruikbaar als orde
van grootte — bovengrens 17 kWh in tien augustusdagen, 7 in september. Lager
wordt het getal onzin: de reconstructie speelt de gemeten temperatuur af, dus de
airco koelt de kamer nooit en draait door zolang de ongekoelde meting boven het
plafond staat. Een plafond van 24 lijkt dan 200 kWh te kosten; in werkelijkheid
zou de kamer binnen een kwartier onder de grens zijn. De echte prijs is pas te
berekenen met het thermisch model.

*Voor dit huis: 26 °C, op de woonkamer en de zolder.* Een vangnet en geen
regeling: het wordt nooit 28 terwijl er niets gebeurt, en het raakt maar 1–5%
van de tijd. Daaronder blijft koelen het werk van de zon. De badkamer krijgt er
geen; daar staat geen apparaat dat kan koelen.

*Wat het aan de replay verandert.* De replay-harness leest dezelfde
configuratie, dus zijn referentie verschuift: 939 bytes, sha256 `6fdeb5e2…`.
Met het plafond uit het bestand gehaald geeft dezelfde code nog steeds
`81a74044…` — het verschil komt alleen uit de waarde, niet uit de code. Over het
augustusvenster zou de arbiter 294 minuten extra koelen in de woonkamer en 694
op de zolder waar het oude systeem stil bleef (`arbiterLooser` van 153 naar 447
en van 731 naar 1.425). Dat is precies het gat dat dit besluit dicht: op
netstroom, boven 26 graden, wanneer de zon het niet deed.

`decision-49.ts` meet zonder plafond, zodat de getallen van besluit 49 uit dat
script te blijven halen zijn.


*Bevestigd, 2 oktober 2026.* Op 1 oktober zou de schaduw 's avonds anderhalf
uur op netstroom hebben gekoeld, toen de woonkamer naar 26,8 °C liep; het oude
systeem deed niets. De bewoner koos ervoor dat zo te houden: comfort weegt mee,
niet alleen zonnestroom, en dat maakt de regeling begrijpelijker. Een bewoner
denkt in "het is hier te warm", niet in watt. In de app wordt het een
instelling per huis onder "Wat mag het", standaard aan.
---

## 51. Starten vraagt meer dan draaien

*Onderwerp: kern en regeling · Status: geldig*

`power.startSurplusW` (1000 W) en `power.resumeSurplusW` (600 W) stonden in de
configuratie, werden ingelezen en gecontroleerd, en stonden in het model
beschreven als "overschot waarboven een apparaat mag starten". Geen strategie
en de arbiter zelf lazen ze. De arbiter startte een airco zodra zijn schatting in
het budget paste — de woonkamer bij ongeveer 850 W, de zolder bij 700. Precies
het soort stilte waar dit project om begonnen is: een instelling die er staat en
niets doet.

*Besluit:* een apparaat dat niet draait start pas wanneer er minstens
`startSurplusW` vrij is, geteld zonder de tolerantie van `stopImportW` — die is
er voor een apparaat dat al draait, niet om een start mee te halen. Een
geparkeerd apparaat (standby) valt onder `resumeSurplusW`: dat is kortstondig
uitvallen, geen koude start. Een draaiend apparaat merkt er niets van. De
afwijzing heeft een eigen code, `start_threshold_not_met`, zodat de weergave
"wacht op genoeg zon om te starten" kan zeggen in plaats van "te weinig budget".

*Wat het doet, eerlijk gezegd: weinig aan de netstroom.* Het haalt ongeveer
0,1 kWh per tien dagen weg (zie de tabel bij 49b); dat verschil maakte 49b. Wat
het wel doet is minder starts op de rand — in september 642 keer tegengehouden
— en de arbiter dichter bij het oude systeem, dat dezelfde drempel had. Over
het augustusvenster stijgt de overeenstemming van 13.803 naar 13.867 minuten
(woonkamer) en van 12.962 naar 13.211 (zolder), en zakken de momenten waarop de
arbiter ruimer is dan het oude systeem.

*De replay* krijgt een nieuwe referentie: 939 bytes, sha256 `e2c178fd…`. Het
verschil met `6fdeb5e2…` komt uit de drempel; 49b raakt de replay niet, want
die geeft geen eigen stand mee.

---

## 52. De dienst legt de ruwe historie zelf vast

*Onderwerp: meten, data en analyse · Status: geldig*

De replay leest een dataset met elke toestandswijziging van de entiteiten die de
regeling leest. Die kwam uit de recorder van Home Assistant, met de hand
geëxporteerd via `tools/export-history.ts`. De recorder ruimt op: op de
standaard van tien dagen was 5 tot 19 september al weg toen we op 30 september
exporteerden. Het beslislogboek over die dagen is er nog, maar daarmee kun je
niet opnieuw beslissen met een andere instelling — daar ontbreken de
apparaatstanden, de timers en de zon in.

Het plan was de export 's nachts te laten draaien. Maar de database staat op de
Pi en het logboek op de NAS: dat vraagt een geplande taak, een Samba-koppeling
en een wachtwoord op de NAS, voor een kopie van iets wat de schaduwdienst al
live binnenkrijgt — gefilterd op precies de entiteiten uit de configuratie.

*Besluit:* de schaduwdienst schrijft elke gevolgde wijziging weg in
`history-JJJJ-MM-DD.ndjson`, naast het beslislogboek, in het datasetformaat
(`adapters/homeassistant/history.ts`). Bij elk (her)verbinden legt hij de
volledige stand vast, zodat de replay weet waar hij begint.
`tools/stitch-history.ts` maakt er een replay-bestand van in hetzelfde formaat
als de recorder-export, dus elk meetscript leest het zonder aanpassing. De
exportknop neemt de historie mee.

*Waarom dit en niet een nachtelijke export.* Geen bewaartermijn om voor te
blijven, geen tweede systeem dat kan uitvallen, geen wachtwoord op een tweede
machine. En de lijst entiteiten klopt per definitie: de store volgt dezelfde
lijst als de vertaling leest, dus wat in de configuratie komt, komt in de
historie. De recorder-export blijft bestaan voor wat hiervoor lag.

*Het bestand volgt de dag van ontvangst, niet van de meting.* Een sensor die
drie dagen niet veranderde, heeft bij het verbinden een tijdstempel van drie
dagen terug. Die rij in het bestand van die dag zetten zou een afgesloten dag
openbreken. `loadHistory` sorteert per entiteit, dus de volgorde in het bestand
doet er niet toe.

*Het venster begint waar de dataset compleet is,* niet bij de vroegste tijd. De
momentopname bij het verbinden draagt de tijden van Home Assistant; een persoon
die een week thuis is heeft een rij van een week terug. Vanaf die tijd afspelen
zou een week failsafe geven, want de netmeter is dan nog onbekend.

*Wat het kost.* Gemeten op het septembervenster: 34.444 rijen en 2,1 MB per
dag, 0,77 GB per jaar ongecomprimeerd. 91% daarvan zijn drie vermogenssensoren
die om de paar seconden melden. In de export gaat het door gzip.

*Wat er niet in zit: de gaten.* Ligt de dienst eruit, dan mist de historie wat
er in die tijd gebeurde; bij het herverbinden komt alleen de stand op dat moment
binnen. Daarvoor blijft de recorder het vangnet, sinds 30 september 2026 met een
bewaartermijn van zestig dagen.

---

## 53. De NAS is de primaire omgeving; de add-on wacht tot stap B

*Onderwerp: uitrol en beheer · Status: geldig*

Er draaiden twee schaduwdiensten. De NAS volgt `main` en schrijft het
logboek waar alle analyses op rusten. De add-on op de Pi was een proef: kan de
dienst in de vorm die Home Assistant verwacht (besluit 36). Dat kon, maar hij
draaide sinds 10 september een verouderde versie, met een eigen logboek waar
niemand naar keek. Geen kwaad, wel verwarring: welke schaduw beslist er nu?

*Besluit:* de NAS is de enige draaiende schaduw. De add-on is op 30 september
2026 stilgezet, met "starten bij opstarten" uit. Hij blijft in de repository.

*Waarom niet weggooien.* De Pi zelf blijft sowieso nodig: daar draait Home
Assistant. En bij echt schakelen (stap B) is de add-on de betere plek om te
regelen. Een regelaar naast Home Assistant hangt van één machine af; vanaf de
NAS hangt het klimaat ook af van de NAS en het netwerk ertussen, en stopt de
regeling bij elke herstart voor een update. De add-on heeft daarbij het
Supervisor-token en de inlog van Home Assistant. En bij een tweede woning is de
add-on de vorm waarin het er komt; niet iedereen heeft een NAS.

*De verdeling op termijn:* de Pi regelt, de NAS onthoudt — logboek, historie,
analyse en export, want daar staat de opslag. Tot stap B doet de NAS allebei.

*Wat daarmee wacht:* de herkomstcontrole op de schrijfdeur en het vastzetten
van Node in de add-on (punt 6 en 7 uit het kwaliteitsrapport). Die horen bij het
moment dat de add-on weer aangaat.

---

## 54. Een machine kijkt mee

*Onderwerp: kwaliteitsbewaking · Status: aangevuld door 152*

Het kwaliteitsrapport van 30 september 2026 gaf "testen en bewaking" een 6. Het
patroon: wat misging werd gevonden door iemand die ging kijken, niet door iets
dat altijd kijkt. De startdrempel deed weken niets (51), de draaitijden
bewaakten in de schaduw niets (49), en de belangrijkste regressiebewaking —
de bit-identieke replay — draaide met de hand op één pc tegen een dataset
buiten git. Intussen rolt de NAS elke push naar `main` binnen vijf minuten uit.

*Besluit:* vijf dingen, samen het vangnet.

*1. Een CI-poort vóór de NAS.* GitHub Actions draait bij elke push typecheck,
tests en beide builds, in UTC zoals de container. Pas als alles groen is,
schuift de tak `stable` mee; de NAS volgt `stable`. `deploy.sh` hoefde daarvoor
niet te veranderen: het volgt al de tak die op de NAS is uitgecheckt. `stable`
schuift alleen vooruit; een herschreven geschiedenis laat de CI falen en is dan
een beslissing voor een mens.

*2. De replay als vaste test.* Eén dag — 26 augustus, met zowel overschot als
invoer — staat in git (`test/fixtures`), 135 kB. Hij wordt minuut voor minuut
afgespeeld zoals de NAS beslist, met de schaduwboekhouding van 49b. Het
verwachte resultaat is geen hash maar een leesbare samenvatting: elk commando
met zijn tijd, de blokkades en de aanvaarde voorstellen. Verandert het gedrag
bewust, dan maakt `npm run replay:record` hem opnieuw en is de diff in de
commit het verslag van wat er anders beslist wordt. Aanwezigheid staat in de
uitsnede de hele dag op thuis: wanneer er iemand thuis was, hoort niet in git.

De eerste run vond meteen iets: om 10:03 werd de zolder geparkeerd en om 10:04
stond hij uit, terwijl parkeren de stabilisatietijd hoort te duren. Zie
besluit 61.

*3. Een stiltetest.* Elk veld van de configuratie wordt ergens gelezen, of
staat met een reden op een lijst — en die lijst wordt zelf ook bewaakt. Doorgeven
telt niet als lezen: `configFrom` en de abonnementslijsten noemen velden zonder
er iets mee te doen, en zonder die uitzondering had de test besluit 51 alleen
via het broertje `resumeSurplusW` gevonden. Nagegaan tegen de arbiter van vóór
51: hij vindt nu beide velden. Op de lijst staan `thermalMass` (fase 7),
`adapter` (de naad voor andere platformen) en `manualOverride` (een timer die
wordt bijgehouden maar door niets gelezen).

*4. Een versie in `/api/health`.* De commit en de bouwtijd gaan als
bouwargumenten het image in. Op de commandoregel van `deploy.sh` en niet in het
compose-bestand: dat laatste moet op de NAS met de hand worden bijgewerkt, en
tot dan stopt `deploy.sh` met uitrollen. Een image zonder argumenten zegt
`onbekend`, en dat is ook een antwoord.

*5. Tests die niet op de klok wachten.* Drie tests leunden op vaste wachttijden
en vielen onder belasting om; één daarvan (de snelheidsbegrenzer) faalde in
ongeveer een op de drie runs. Alle wachttijden zijn vervangen door wachten op
een voorwaarde: tot er beslist is, tot de events verwerkt zijn, tot het record op
schijf staat.

*Wat het niet vangt.* Een ontwerpfout zoals die in besluit 49 slaagde voor al zijn
tests. De vaste replay legt gedrag vast; hij oordeelt er niet over. Daarvoor
blijft de meetdiscipline nodig: een kopgetal uitsplitsen naar oorzaak voordat
het in dit logboek komt.

*Aanvulling, dezelfde avond: de CI bouwt ook het image.* Om 23:46 kwam er een
commit op `stable` die in de repository klopte maar op de NAS niet te bouwen
was: een test importeerde uit `tools/`, en de Dockerfile kopieerde die map niet.
De poort deed wat hij moest — de NAS draaide door op de vorige versie, want
`deploy.sh` bouwt eerst en wisselt pas daarna om — maar de CI had het moeten
vangen. Nu bouwt een tweede taak het image met dezelfde Dockerfile en context
als de NAS, en schuift `stable` pas mee als ook dat lukt. De add-on-image zit
er nog niet bij: die wordt uit een platgeslagen map gebouwd (besluit 37), en
staat stil tot stap B.

---

## 55. De opstart is één zuivere functie

*Onderwerp: kwaliteitsbewaking · Status: geldig*

`main.ts` las de omgeving verspreid uit, tussen `process.exit`-aanroepen door,
en was daardoor niet te testen. Juist daar zitten de schakelaars die ertoe
doen: add-on of niet, luistert de weergave, mag de pagina configuratie
wegschrijven. De voorwaarde voor die schrijfdeur (besluit 42) stond er twee
keer in, en niets bewaakte dat ze gelijk bleven.

*Besluit:* `src/startup.ts` leidt alles af uit de omgeving in één zuivere
functie; `main.ts` voert het alleen nog uit. De schrijfdeur staat er één keer
in, met tests: open in de add-on, dicht op de NAS, dicht zodra iemand de add-on
naar een eigen Home Assistant wijst, open buiten Ingress alleen op
`HEMS_ONBOARDING=1` en dan met waarschuwing, en nooit zonder weergave.

*En instellingen die niet kloppen vallen nu op.* Een hartslag van "30s" werd
stil 30, en nul ging door — een hartslag zonder pauze. Nu weigert de dienst te
starten met een zin die zegt wat er mis is. Nul blijft toegestaan waar het iets
betekent: geen minimale pauze, of de bewaking uit.

---

## 56. Regels die voor elke toestand gelden

*Onderwerp: kwaliteitsbewaking · Status: geldig*

De tests beschreven gevallen die iemand bedacht. `test/invariants.test.ts`
genereert er 3.000 — temperaturen, netstanden, apparaatstanden, draaitijden,
modi, timers, haperende sensoren — en eist dat een paar regels altijd houden:
nooit meer toegewezen dan beschikbaar, per apparaat hooguit één
schakelcommando, nooit een stand die het apparaat niet kan, geen stop binnen de
draaitijd, geen start binnen de rusttijd of onder de startdrempel, setpoints
binnen bereik, niets in handmatig, geen airco aan bij de failsafe, en zelfde
toestand, zelfde besluit.

*Een eigen generator en geen bibliotheek:* met een vast startgetal is elke run
exact herhaalbaar, en een overtreding noemt het geval en het startgetal.

*Een generator die alleen saaie gevallen maakt, bewijst niets.* Een aparte test
telt of er genoeg starts, stops, budget- en draaitijdblokkades en failsafes
langskomen. Die vond meteen een fout in de generator zelf: de laatste schakeling
lag bijna altijd uren terug, dus de draaitijd werd nauwelijks op de proef
gesteld. Nagegaan door de draaitijd en de startdrempel tijdelijk uit de arbiter
te halen: gevangen bij geval 2 en geval 249.

---

## 57. Een linter met een handvol regels

*Onderwerp: kwaliteitsbewaking · Status: geldig*

ESLint met typescript-eslint, als dev-afhankelijkheid; het image houdt nul
runtime-afhankelijkheden. Geen stijlgids — de compiler staat al op zijn
strengst — maar de regels voor beloften (`no-floating-promises`,
`no-misused-promises`, `await-thenable`) en ongebruikte variabelen. Deze dienst
vuurt veel af zonder te wachten, en een vergeten `await` is een stille fout. De
CI draait hem na de typecheck.

De eerste run vond één ding, een ongebruikte import. Wie de code schreef, ging
dus al zorgvuldig met beloften om; de linter houdt dat zo. En `tsconfig.json`
neemt nu ook `tools/` mee: de gereedschappen werden nooit op typefouten
gecontroleerd. Ze bleken schoon.

---

## 58. Dagen ouder dan een week worden gecomprimeerd

*Onderwerp: meten, data en analyse · Status: geldig*

Logboek en historie schrijven samen ongeveer 5 MB per dag, rond 1,8 GB per
jaar. NDJSON comprimeert ruwweg dertig keer. De schaduwdienst comprimeert
daarom één keer per dag, en meteen na het opstarten, elk dagbestand van meer dan
een week oud. De recente week blijft gewoon leesbaar. Weggooien doet hij niets:
de dataset is het product van dit project.

*Eerst de lezers.* Elke plek die logboeken leest — divergentie, terugblik,
benchmark, `stitch-history`, `makeWinter` — gaat via `findLogFiles`,
`findHistoryFiles` en `regelsVan` in `divergence/read.ts`, die beide vormen
kennen. Ook `sync-start-divergence.ps1` haalt de `.gz` op. Anders waren de oude
dagen ongemerkt uit elke analyse verdwenen. Een test legt vast dat elke lezer
vóór en na het comprimeren precies hetzelfde ziet.

*Onderbreken mag.* Eerst een tijdelijk bestand, dan een atomaire rename, dan
pas de gewone weg. Staan beide er, dan telt de `.gz` en ruimt de volgende
ronde de gewone op. Een dag raakt nooit weg en telt nooit dubbel.

*Eén keer gezien, en later gevonden:* de integratietest faalde af en toe onder
de last van de volledige suite. Op 1 oktober zat de oorzaak in de test zelf. Hij
wachtte tot de `.gz` er stond en controleerde dan meteen dat het gewone bestand
weg was. Maar de dienst hernoemt eerst en haalt pas daarna weg, en daartussen
staan beide er even. De test wacht nu op allebei. De dienst deed het goed.

*Erbij, geen besluit maar een reparatie:* `deploy.sh` staat voortaan tussen
accolades met een `exit` erin, zodat overschrijven tijdens een run geen halve
regels meer uitvoert. Zie de commit van 30 september.

---

## 59. Namen in het Engels, de rest in het Nederlands

*Onderwerp: kwaliteitsbewaking · Status: geldig*

De code sprak twee talen door elkaar. De kern heette `decide`, `arbitrate` en
`SiteConfig`; wat er later bij kwam heette `SchaduwApparaten`, `leesOpstart` en
`comprimeerOudeDagen`. Wie een naam zocht, moest eerst raden in welke taal.

*Besluit:* namen in de code zijn Engels: typen, functies, velden, variabelen en
bestandsnamen. Commentaar, meldingen, de weergave, de documentatie en dit
logboek blijven Nederlands.

*Wat Nederlands blijft, omdat het gegevens zijn en geen namen:* de sleutels in
bestanden op schijf en in de API naar de weergave (`buitenC` en `zonW` in het
beslislogboek; `dekking`, `seizoen`, `patronen`, `bestanden` en `versie` in de
antwoorden), en waarden die uit Home Assistant of de configuratie komen
(`handmatig`, `strenger`, `ontbreekt`). Die hernoemen zou oude logboeken
onleesbaar maken of de pagina breken, en dat alleen voor een naam. De typen die
ze beschrijven, hebben wel een Engelse naam.

*Hoe:* ruim duizend declaraties in de backend en de weergave. Niet met
zoeken-en-vervangen, maar via de taaldienst van TypeScript, die elke verwijzing
kent. Daarna een controle die voor elke naam in de code nagaat of hij na het
hernoemen naar dezelfde declaratie wijst als ervoor. Zo kan een nieuwe naam
nooit stil een andere overschaduwen. Die controle ving vijftien botsingen
voordat er iets geschreven was. De golden replay (besluit 53) gaf daarna byte
voor byte hetzelfde.

*Wat het testpakket ving:* acht tests lazen een API-antwoord met een eigen
typebeschrijving, en daarin waren de sleutels mee hernoemd. De dienst stuurde
nog `versie`, de test zocht `version`. Hersteld in de tests; de dienst zelf was
goed.

*Oudere besluiten noemen de oude namen.* Die zijn niet herschreven. Alleen
bestandspaden en commando's zijn bijgewerkt, want die zijn om te volgen. De
belangrijkste vertalingen:

| Was | Is |
| --- | --- |
| `SchaduwApparaten`, `.volg()` | `ShadowActuators`, `.follow()` |
| `leesOpstart`, `src/opstart.ts` | `readStartup`, `src/startup.ts` |
| `comprimeerOudeDagen`, `adapters/archief.ts` | `compressOldDays`, `adapters/archive.ts` |
| `Historieschrijver`, `naarRij`, `historieGereed()` | `HistoryWriter`, `toRow`, `historySettled()` |
| `regelsVan`, `dagbestanden` | `linesOf`, `dayFiles` |
| `stikHistorie`, `schrijfDataset` | `stitchHistory`, `writeDataset` |
| `speelAf`, `Samenvatting` | `playBack`, `Summary` |
| `bovenComfortplafond`, `bovenPlafond` | `aboveComfortCeiling`, `aboveCeiling` |
| `versieUitOmgeving`, `Versie` | `versionFromEnv`, `Version` |
| `ontdek`, `pasKeuzesToe`, `Voorstel`, `Keuze` | `discover`, `applyChoices`, `Proposal`, `Choice` |
| `src/replay/besluit49.ts`, `besluit50.ts` | `tools/onderzoek/decision-49.ts`, `decision-50.ts` |
| `npm run besluiten:index`, `npm run replay:vastleggen` | `npm run decisions:index`, `npm run replay:record` |

---

## 60. De schaduw gebruikt zijn eigen stabilisatietimer

*Onderwerp: kern en regeling · Status: geldig*

De configuratie van dit huis noemde `timer.pv_stabilisatie` als bron van de
stabilisatietimer. Dat is de timer van het YAML-systeem, en die loopt alleen
wanneer dát systeem iets start of parkeert. Startte de arbiter iets, dan liep er
niets; startte het oude systeem iets, dan werd de arbiter tegengehouden zonder
dat hij zelf iets had gedaan. Besluit 39 liet dit bewust zo, om de schaduw met
het oude systeem te laten vergelijken. Besluit 49 trok voor de draaitijden de
tegenovergestelde conclusie, en die geldt hier net zo: de schaduw hoort zijn
eigen geschiedenis te meten, niet een stukje van zijn voorganger.

*Besluit:* `timers.stabilisation` gaat uit de configuratie van dit huis. De
dienst houdt de timer zelf bij, zoals besluit 39 al mogelijk maakte.
`timers.manualOverride` blijft uit Home Assistant komen. Daarvoor moest het
schema per timer optioneel worden: het eiste de stabilisatietimer zodra er een
`timers`-blok stond, terwijl besluit 39 "per timer afzonderlijk" beloofde.

*Gemeten* (`tools/onderzoek/decision-60.ts`, beide vensters, met alles zoals het op
de NAS draait):

| | augustus | september |
| --- | --- | --- |
| tegengehouden door de stabilisatietimer | 1.548 → 257 | 765 → 180 |
| starts, woonkamer + zolder | 123 → 160 | 95 → 102 |
| oude systeem zelf, ter vergelijking | 177 | 76 |
| tweede start 1–4 minuten na een eerste | 7 → 0 | 5 → 0 |

De timer van het oude systeem hield de arbiter dus vooral tegen op momenten dat
hij zelf niets had gestart. Zonder die koppeling start hij vaker, en is hij het
vaker oneens met het oude systeem. Dat is geen verslechtering: het is wat de
arbiter werkelijk zou doen, en dat zag de schaduw tot nu toe niet. Wat
overblijft onder "binnen vijf minuten" zijn twee airco's die in dezelfde minuut
starten, omdat het overschot ze allebei dekt (besluit 3).

*De vaste replay* (besluit 54) gaat van 113 naar 159 commando's op 26 augustus.
De replay-gereedschappen houden de eigen timer nu bij, zoals de NAS. Alleen de
meetscripts van besluit 49 en 50 lezen bewust nog de oude timer, zodat hun
getallen in dit logboek reproduceerbaar blijven.

*Wat dit níét oploste:* parkeren duurde ook met de eigen timer één minuut. Zie
besluit 61.

---

## 61. Parkeren start de stabilisatie

*Onderwerp: kern en regeling · Status: geldig*

Besluit 5 zegt: geparkeerd gaat na de stabilisatieperiode uit. De arbiter
startte die periode alleen wanneer hij iets aanzette. Een airco die werd
geparkeerd zonder dat er net iets was gestart, ging dus de minuut erna al uit,
en dan is de parkeerstand zinloos. Met de timer van het oude systeem viel dat
soms weg, omdat dat systeem op hetzelfde moment parkeerde. Met de eigen timer
(besluit 60) werd het zichtbaar: mediaan één minuut.

Het oude systeem doet het anders, en terecht. Bij parkeren zet het het setpoint
op 25 °C (of 18 °C bij verwarmen) én start het `timer.pv_stabilisatie`. Pas als
die is afgelopen, gaat de airco uit.

*Besluit:* de arbiter start de stabilisatietimer ook wanneer hij een draaiend
apparaat parkeert. Dezelfde reden als bij een start: parkeren verandert de
opname, en pas na de stabilisatie is de meting weer een basis voor de volgende
beslissing. Is de periode voorbij, dan hervat het apparaat op `resumeSurplusW`
als er weer zon is, of gaat het uit. Uitzetten na het parkeren start geen nieuwe
timer.

*Gemeten,* bovenop besluit 60: parkeren duurt nu mediaan vijf minuten, in beide
vensters en voor beide airco's. De vaste replay gaat van 159 naar 161 commando's.

*Gevonden doordat de test het niet toetste.* De bestaande test "zet een
geparkeerd apparaat pas uit als de rustperiode voorbij is" gaf de timer van
buitenaf mee. Of parkeren hem zelf startte, vroeg niemand. Nu wel, en die test
faalt zonder deze wijziging.

---

## 62. De eigen stand overleeft een herstart

*Onderwerp: kern en regeling · Status: geldig*

Wat de dienst zelf bijhoudt, zat alleen in het geheugen: de modus en de timers
(besluit 39) en de veronderstelde stand van de apparaten (besluit 49). Besluit
39 noemde dat voor de schaduw onschuldig. Dat was het niet meer sinds de NAS
zelf uitrolt (besluit 54): elke push herstart de dienst. Op 1 oktober waren dat
voor de middag drie uitrollen en één handmatige herstart. Na elke herstart begon de schaduw opnieuw vanaf het échte
apparaat, en mat hij een paar minuten de geschiedenis van het oude systeem. Een
lopende stabilisatie was weg, net als het moment waarop een veronderstelde rit
begon. Onder echte regeling wordt dat een fout die je voelt: een herstart
midden in een rit laat de minimale draaitijd vervallen.

*Besluit:* de dienst bewaart die stand in `own-state.json` in de logmap, zodat
hij in de back-up meegaat. Hij schrijft bij elke wijziging, en minstens elke vijf
minuten, zodat het tijdstip in het bestand zegt hoe vers het is. Eerst een
tijdelijk bestand, dan een atomaire rename. Bij het starten, vóór het eerste
besluit, neemt hij de stand terug:

- **modus en timers altijd.** Een verlopen timer is gewoon niet actief, en een
  gekozen modus is een keuze van de bewoner.
- **de veronderstelde apparaatstand alleen als hij hooguit een half uur oud
  is.** Een uitrol duurt minuten. Lag de dienst langer stil, dan heeft de
  arbiter in die tijd niets bestuurd, en is het echte apparaat het eerlijker
  beginpunt.

Een onleesbaar bestand is nooit een reden om niet te starten: dan begint de
dienst zoals vroeger, en zegt hij waarom.

*Waarom niet in Home Assistant:* dat zou schrijven zijn (besluit 15), en het
bestand hoort bij de dienst, niet bij de woning.

*Getoetst* met een dienst die stopt en een nieuwe die een minuut later start:
die start de zolder niet opnieuw en houdt de woonkamer tegen op de timer van
zijn voorganger. Zonder het terugnemen faalt die test.

*Eén keer gezien, en later gevonden:* op 2 oktober liep een van deze tests
onder de volledige suite tegen zijn tijdslimiet. De oorzaak zat niet in de
eigen stand en niet in een klok. De nagebootste Home Assistant kreeg van
Windows een willekeurige vrije poort, en die reeks begint hier bij 1024. Daar
zitten poorten tussen die de Fetch-standaard blokkeert, zoals 5060 en 6666.
Node's ingebouwde WebSocket weigert die zonder te verbinden, en de client
probeerde het na 1, 2 en 4 seconden opnieuw, op dezelfde poort. De testservers
openen nu een nieuwe als ze zo'n poort krijgen (`test/ports.ts`), ook die van
de weergavetests, die om dezelfde reden af en toe faalden. De dienst deed het
goed.

---

## 63. De terugblik gaat verder waar hij was

*Onderwerp: weergave · Status: geldig*

De terugblik las elk kwartier de hele opname opnieuw. Besluit 26 schatte dat
op vier seconden na een winter. Op de NAS was het na 26 dagen al 35 seconden,
na het comprimeren 16,6 (besluit 58). Na een winter zouden dat minuten van elk
kwartier worden. Maar een afgesloten dag verandert niet meer.

*Besluit:* na de laatste afgesloten dag bewaart de dienst de doorlopende stand
van de terugblik, en leest elke ronde alleen wat daarna kwam. Afgesloten is een
dag tien minuten na middernacht UTC, want zo heten de dagbestanden. De
tussenstand staat in het geheugen én in `review-checkpoint.bin` in de logmap,
zodat ook de eerste ronde na een uitrol snel is.

*Een tussenstand, geen uitkomst.* Besluit 26 wilde geen vooraf berekende
uitkomst bewaren, omdat die stil kan verouderen. Dat blijft zo: de uitkomst
wordt elke ronde berekend. Wat bewaard wordt, is de volledige doorlopende stand
van de lezer, de analyse en de datasetmeter. Die dragen dingen over dagen heen
mee: een afwijking die over middernacht doorloopt, of wat een kort record
weglaat. Daarom is voortzetten precies hetzelfde als opnieuw rekenen. De
analyse en de datasetmeter zijn daarvoor optellingen geworden (`Analyser`,
`DatasetCounter`); hun rekenregels zijn niet veranderd.

*Wanneer hij vervalt:* als een afgesloten dag anders is dan toen. Comprimeren
telt niet: dat verandert naam en grootte, niet de inhoud. Ook een andere versie
van de tussenstand of andere instellingen laten hem vervallen. Dan rekent de
terugblik één keer alles opnieuw: dat kost tijd, maar is nooit fout.

*Getoetst* met een generator over zes dagen, met afwijkingen over middernacht:
stap voor stap, na een herstart en na comprimeren gelijk aan in één keer. En op
de echte logboeken van 27 dagen (217.581 momenten): alles opnieuw 751 ms, verder
na een herstart 18 ms, dezelfde uitkomst. Gemeten op een pc; de NAS is ruim
twintig keer trager. Zonder de meegedragen stand van de lezer falen drie van de
zes tests.

De pagina toont erbij hoeveel dagbestanden er die ronde echt gelezen zijn.

---

## 64. Echt schakelen pas met een complete winter en alle functies

*Onderwerp: uitrol en beheer · Status: geldig*

Stap B, de overdracht, had geen moment. De voorbereiding kon al, maar wanneer
de arbiter werkelijk iets mag aanzetten, was nooit besloten.

*Besluit:* er wordt pas geschakeld als de datasetmeter twee dingen laat zien.

- **Een winter:** 30 winterdagen. De meter telt december tot en met februari als
  winter.
- **Alle functies:** functiedekking 100%. Elke modus, elke strategie en elke
  richting moet op minstens twee losse dagen zijn voorgekomen.

Op 1 oktober 2026 stond de winter op 0 van 30. De dekking was 85%: alles was
langsgekomen behalve verwarmen (`heat`) en `heat-assist`. Het vroegste moment
is daarmee rond eind december 2026.

*Waarom niet eerder:* verwarmen is in de schaduw nog nooit afgegaan. Gaat het nu
live, dan draait een pad dat we nooit hebben zien werken, in het seizoen waarin
een fout het meest voelbaar is. En zolang het oude systeem regelt, levert elke
winterdag een vergelijking op. Die eindigt voor een apparaat zodra de arbiter
het overneemt.

*Wat niet in de eis zit:* lente en zomer. Het totaalcijfer van de meter rekent
die wel mee, en staat op dat moment dus nog onder de 100%. Dat is bewust. Koelen
is het best bekende deel van de regeling, en een volle seizoenscyclus afwachten
zou de overdracht tot de zomer van 2027 uitstellen.

*Tot die tijd:* de schaduw meet. De weg terug en de add-on horen bij het
schakelen zelf en komen een paar weken ervoor. Dan heeft de dodemansknop al
meegedraaid voordat iemand erop vertrouwt.

---

## 65. Wat het thermisch model nodig heeft, wordt nu al vastgelegd

*Onderwerp: meten, data en analyse · Status: geldig*

De replay kan elk besluit later opnieuw nemen, want de ruwe invoer wordt
vastgelegd (besluit 52). Wat hij niet kan terughalen, is invoer die nooit is
vastgelegd. Het gasverbruik ontbrak, terwijl de gasmeter in Home Assistant
staat (`sensor.gas_meter_gas`, via de HomeWizard P1). In de winter is gas de
grootste warmtebron in huis. Het thermisch model (stap D, besluit 46) moet weten
hoeveel warmte er in een kamer ging. Zonder gas ziet het alleen dát de Nest
stookt (`hvac_action`), niet hoeveel.

*Besluit:* een configuratieveld `recordOnly` voor entiteiten die de dienst
volgt en in de ruwe historie vastlegt, zonder dat de regeling ze leest. Een
wijziging is ook geen aanleiding om opnieuw te beslissen. Voor dit huis: de
gasmeter, en de binnen- en buitentemperatuur en luchtvochtigheid van de
ventilatie-unit (`sensor.cve_silent_*`), omdat ventilatie in de winter ook
warmte kost.

*Waarom nu:* het stookseizoen is nog niet begonnen. Elke stookdag zonder
gasmeting is een dag waarop het model de warmte-invoer moet raden. Home
Assistant bewaart voor een meter als deze meestal ook uurtotalen op lange
termijn, maar fijner dan per uur, en in onze eigen dataset, krijg je het alleen
door het zelf vast te leggen.

*Waarom niet in het beslislogboek,* zoals de buitentemperatuur (besluit 30): die
staat daar omdat de terugblik hem bij een besluit toont. Gas en ventilatie zijn
invoer voor een model dat nog niet bestaat. De ruwe historie is daar de plek
voor, en het beslislogboek blijft over beslissen gaan.

De stiltetest kent `recordOnly` als bewuste uitzondering: niets in de regeling
leest het, en dat is de bedoeling.

*Op 1 oktober gecontroleerd:* de gasmeter wordt vastgelegd. De ventilatie-unit
is in Home Assistant gekoppeld, maar nog niet in huis geïnstalleerd. Zijn
entiteiten bestaan dus nog niet; zie het open punt over de ventilatie.

---

## 66. Bij elk besluit is na te gaan welke versie het nam

*Onderwerp: meten, data en analyse · Status: geldig*

Het beslislogboek zei wat er besloten werd, niet door welke code en met welke
instellingen. Op 30 september en 1 oktober veranderden arbiter en configuratie
samen acht keer (besluit 49 tot 63). Verandert er deze winter iets, dan bestaat
de winterdataset uit stukken van verschillende versies. Die waren alleen uit het
uitroljournaal van de NAS te reconstrueren, en een gekopieerde configuratie
helemaal niet.

*Besluit:* bij elke start schrijft de dienst één regel in `runs.ndjson` in de
logmap, vóór het eerste besluit: het tijdstip, de commit, de bouwtijd, en een
vingerafdruk van de configuratie (twaalf tekens SHA-256 over de gelezen
configuratie). Een start is het enige moment waarop code en configuratie kunnen
veranderen, want ze worden alleen dan gelezen. Het bestand gaat mee in de
export. De terugblik markeert op de tijdlijn de dagen waarop de versie of de
configuratie veranderde. Een herstart met dezelfde versie telt niet.

*Achteraf aangevuld:* de zes uitrollen die het uitroljournaal nog kende (vanaf
1 oktober 00:26), met `source: "deploy.log"` en de configuratie op
"onbekend" (`tools/runs-from-deploy-log.ts`). Wat daarvoor gebeurde, staat in
dit logboek met datum, niet in het bestand.

*Mislukt het schrijven,* dan beslist de dienst toch. Zonder herkomst is de
dataset minder waard, zonder dienst is er geen dataset.

---

## 67. Een mail als de opname stilvalt

*Onderwerp: uitrol en beheer · Status: geldig*

Valt de opname stil, dan merkte niemand het tot iemand de pagina opende. Dat
gebeurt bijvoorbeeld als de NAS de verbinding met Home Assistant kwijtraakt, of
als de dienst in een herstartlus zit. De healthcheck van Docker kleurde de
container rood, maar alleen in Container Manager, en daar kijkt niemand
dagelijks. Van een week winter die ontbreekt, is de ruwe invoer alleen terug te
halen zolang de recorder van Home Assistant hem nog heeft. Dat is bij de
standaardinstelling tien dagen. De besluiten van die week zijn er nooit
geweest, en de winter laat zich niet overdoen.

*Besluit:* `deploy.sh` draait toch elke vijf minuten, en kijkt daarbij hoe oud
het nieuwste beslislogboek is. Is dat ouder dan een half uur, dan eindigt de
run met een foutcode. De Taakplanner van DSM stuurt dan een mail, als dat in de
taak aanstaat (zie `README-NAS.md`). De melding komt hooguit één keer per drie
uur per storing, en niet voor een container die bewust is stopgezet. Komt de
opname terug, dan zegt het journaal dat ook.

*Waarom niet in de dienst zelf:* de dienst is juist wat er stilvalt. De controle
moet van buiten komen, en het script dat de NAS al elke vijf minuten draait, is
het eenvoudigste buiten dat er is.

*Waarom een half uur:* de dienst beslist elke dertig seconden, en een uitrol
legt hem een paar minuten stil. Een half uur is ruim boven elke uitrol, en
ruim onder wat een winternacht kost.

Uitgeprobeerd in een wegwerpmap met een logboek van verschillende ouderdom:
vers, een half uur stil, al gemeld, na drie uur opnieuw, hersteld, en bewust
gestopt.

---

## 68. Hooguit één start per beslissing

*Onderwerp: kern en regeling · Status: geldig*

Dekte het overschot beide airco's, dan startte de arbiter ze in dezelfde
beslissing. Besluit 3 staat dat toe: het budget telt de schatting van allebei
mee, en de startdrempel van besluit 51 geldt voor elk. Maar dan wordt er op twee
schattingen gestart. De stabilisatie bestaat juist om eerst te meten wat de
eerste airco werkelijk trekt, en pas daarna over de volgende te beslissen
(besluit 61). Het oude systeem verbiedt een tweede start in dezelfde ronde, met
`zolder_started_now`.

*Besluit:* hooguit één start op het budget per beslissing. Een tweede voorstel
dat zou starten, krijgt `stabilisation_active` met als toelichting "er is deze
ronde al iets gestart", en komt na de stabilisatie opnieuw aan de beurt.
Hervatten uit standby telt ook als start. Wat niet op het budget start, valt
erbuiten, zoals comfort met een primair apparaat.

*Gemeten* (`tools/onderzoek/decision-60.ts`, met en zonder deze regel). Alleen de
zolder in het augustusvenster verandert; in september kwam het niet voor.

| Zolder, augustus | Was | Nu |
| --- | --- | --- |
| twee starts in dezelfde minuut | 8 | 0 |
| starts | 73 | 69 |
| "ik zou draaien", minuten | 1.785 | 1.738 |
| netstroom tijdens draaien (bovengrens) | 11,06 kWh | 10,89 kWh |

Een klein effect, maar het maakt de regeling consequent: wie na een start vijf
minuten wacht, hoort niet in dezelfde minuut nog iets te starten. De vaste
replay van 26 augustus gaat van 161 naar 151 commando's. De zolder start daar om
13:38 in plaats van tegelijk met de woonkamer om 13:32.

*Bewaakt* door een test, en door een nieuwe regel bij de invarianten (besluit
56): nooit meer dan één start op het budget per beslissing. Zonder deze
wijziging falen ze alle drie.

---

## 69. Ook de pagina en deploy.sh worden getest

*Onderwerp: kwaliteitsbewaking · Status: geldig*

Twee onderdelen vielen buiten de tests. De weergave is 1.144 regels JavaScript,
die de sleutels van de API letterlijk leest. Bij het hernoemen van besluit 59
bleek hoe dun de grens is: acht tests zochten al `version` waar de dienst
`versie` stuurde. En `deploy.sh` draait op de NAS en wordt met de hand
gekopieerd. Een fout erin merk je pas als de uitrol of de melding van besluit 67
het niet meer doet.

*Besluit:* twee taken in de CI, allebei vóór `stable`.

- **De pagina in een browser.** De echte pagina tegen de echte webserver, in
  headless Chromium via Playwright (`test/page.test.ts`). Met een echt besluit
  van de arbiter over 26 augustus, en een terugblik over drie dagen logboek met
  twee versies. De test eist: geen fout in de pagina, geen andere mislukte
  aanvraag dan de onboarding die buiten de add-on uitstaat, en modus, zones,
  budget, tijdlijn, versiemarkeringen en exportknop gevuld. Zonder
  `HEMS_PAGE_TEST=1` slaat hij zichzelf over, zodat de rest van de suite geen
  browser nodig heeft. Lokaal kan hij draaien met de Edge die er al staat.
- **`deploy.sh` nakijken.** ShellCheck vanaf "warning" op alle shellscripts, en
  `deploy/test-deploy.sh`, dat de syntaxis controleert en de melding van besluit
  67 in acht situaties naspeelt.

Playwright is een ontwikkelafhankelijkheid. Het image op de NAS blijft zonder
afhankelijkheden, en de browser komt alleen op de CI-runner.

*Getoetst door ze stuk te maken:* laat de pagina `versions` lezen in plaats van
`versies`, en de test faalt. Zet de drempel van de melding op 3.000 minuten, en
het testscript faalt. ShellCheck vond drie keer dezelfde stille fout in het
opstartscript van de add-on (`export X="$(…)"` slikt de foutcode in); die is
gesplitst.

---

## 70. Elke opstelling werkt; de regeling doet wat de opstelling toelaat

*Onderwerp: visie en principes · Status: geldig*

Een tweede huis heeft andere apparaten dan dit huis: misschien één airco, geen
ventilatie, geen zonnepanelen, of een warmtepomp in plaats van een Nest. Het
systeem mag zo'n huis niet weigeren, en de bewoner moet ook niet eerst iets
hoeven aanschaffen.

*Besluit:* elke combinatie van apparaten en sensoren wordt geaccepteerd. Het
systeem leidt uit de configuratie af wat het kan. Ontbreekt er iets, dan regelt
het minder slim of anders, maar het regelt. En het zegt erbij wat het daardoor
niet kan, en waarom. Dat principe zat al in de code voor een ontbrekende
netmeter; vanaf nu geldt het voor alles.

| Ontbreekt of anders | Wat de regeling dan doet | Stand op 1 oktober 2026 |
| --- | --- | --- |
| Slimme meter (netvermogen) | Geen zonnestrategie; comfort en heat-assist werken door | werkt, met een waarschuwing |
| Zon boven de horizon | Zonnestrategie zonder nachtbeveiliging | werkt, met een waarschuwing |
| Buitentemperatuur, zonne-opbrengst | Regelt gewoon; de dataset is minder compleet voor het model | werkt, met een waarschuwing |
| Modusknop of timers in Home Assistant | De dienst houdt ze zelf bij (besluit 39) | werkt |
| Ventilatie, gasmeter | Wordt niet vastgelegd; het model mist die invoer | werkt |
| Geen oud systeem ernaast | De terugblik vergelijkt met wat de thermostaten zelf deden (besluit 28) | werkt, maar de pagina spreekt nog over "het oude systeem" |
| Eén airco als enige apparaat | Moet zowel comfort houden als zonnestroom gebruiken | ontbreekt: elk apparaat heeft nu één rol, hoofd- of hulpapparaat |
| Alleen koelen, of alleen verwarmen | De datasetmeter en besluit 64 tellen alleen functies die het huis heeft | ontbreekt: de meter eist nu ook verwarmen en heat-assist |
| Warmtepomp via een SG-Ready-schakelaar | Stuurt via een schakelaar in plaats van een thermostaat | ontbreekt: een apparaat moet nu een `climate`-entiteit zijn |

*Hoe het bewaakt wordt:* met voorbeeldhuizen in de tests. Een set
configuraties (één airco; alleen koelen; geen zonnepanelen; geen meter; een
warmtepomp) gaat door de beslissing en door de invarianten van besluit 56. Een
opstelling die vastloopt of stil niets doet, laat de test falen.

*Wanneer:* de drie gaten horen bij stap C, vóór het tweede huis. Ze veranderen
niets aan dit huis, dus ze mogen ook eerder, zonder de winterdata te raken.

---

## 71. De schetsen van de app zijn de maatstaf

*Onderwerp: visie en principes · Status: aangevuld door 104*

Op 1 oktober 2026 zijn de schermen van de bewonersapp geschetst: vijf voor de
telefoon, vijf voor een tablet aan de muur. Ze staan in `design/app/`, met
screenshots. Een van de wandschermen is gevuld met het echte logboek van die
avond, om te zien of het ontwerp ook overeind blijft zonder zon en met rommelige
data. Dat doet het, al is het 's avonds een stuk rustiger.

*Besluit:* deze schetsen zijn de maatstaf voor stap F en G. Wat gebouwd wordt,
wordt ernaast gelegd; wijkt het af, dan is dat een keuze en geen toeval. De
regels die erachter zitten, gelden ook voor schermen die nog niet getekend zijn:

- **Elk getal is te herleiden.** Een getal op het scherm komt uit het logboek.
  Is het berekend of voorspeld, dan staat dat erbij, en ook hoe zeker het is.
- **Bij elk besluit een reden, in gewone taal.** Zonder entity-ID's (45). Weet
  het systeem iets niet, zoals waarom een kamer opliep, dan zegt het dat.
- **De assistent stelt voor; de regeling beslist (44).** Een voorstel kan eerst
  een week meekijken voordat het geldt.
- **Het scherm weet in welke fase het huis zit.** Leren, meekijken of regelen.
  "Je huidige regeling" staat er alleen zolang er een vorige regeling is; in een
  huis zonder is het "zoals jullie het zelf deden" (28, 70).
- **Eerst de lelijke momenten.** Nacht, geen zon, een sensor die wegvalt, één
  airco. Ziet een scherm er dan nog goed uit, dan valt het eindproduct niet
  tegen.
- **Eén ontwerptaal voor telefoon en wand.** Donker, met glazen kaarten, dezelfde
  letters, kleuren en de bol van de assistent; de telefoon houdt zijn eigen
  indeling in portret. Een tablet die altijd aanstaat, mag 's avonds de kamer niet
  verlichten, en de telefoon volgt dezelfde taal zodat het één product is.
  (Eerst stond hier "licht op de telefoon"; op 2 oktober 2026 rechtgetrokken naar
  de wand. Of de bewoner zelf licht kan kiezen, staat in `design/app/ONTWERP.md`
  bij de open vragen.)

*Wat het niet is:* een belofte over getallen. De besparingen, de zekerheid van
de voorspelling en het plan voor de middag zijn voorbeelden; ze worden pas echt
met het thermisch model (D) en de vooruitblik (E).

*Hoe het bewaakt wordt:* zodra F gebouwd wordt, krijgt de page-test (69)
screenshots die naast deze worden gelegd, met het echte logboek als invoer.

---

## 72. Kamers en zones horen bij de app; Home Assistant levert de apparaten

*Onderwerp: configuratie en onboarding · Status: aangevuld door 95*

De ontdekking leest de gebieden van Home Assistant en stelt per gebied een zone
voor (besluit 41); de onboarding laat dat bevestigen en schrijft het naar
`config/sites/` (besluit 42). De vraag was of kamers en zones in de app thuishoren
of in Home Assistant.

*Besluit:* elk zijn eigen waarheid, en nooit twee keer dezelfde.

- **Home Assistant is de bron voor de apparaten:** welke er zijn, wat ze meten
  en wat ze kunnen.
- **De app is de bron voor de kamers en zones:** hoe ze heten, welke apparaten
  en sensoren erbij horen, wat comfortabel is, welke voorgaat bij weinig zon,
  en wanneer het stil moet zijn. Dat staat in de eigen configuratie, niet in
  Home Assistant. Een gebied in Home Assistant ordent zijn menu; een zone is iets
  wat geregeld wordt, en daar heeft Home Assistant geen plek voor.
- **Een kamer is iets anders dan een zone.** Een kamer is wat de bewoner ziet:
  een naam, misschien een sensor. Een zone is wat de regeling stuurt: één of
  meer kamers die hetzelfde apparaat bedient. Keuken en woonkamer met één airco
  zijn twee kamers en één zone. Een slaapkamer met alleen een sensor is een
  kamer zonder zone: gemeten, niet geregeld (70).
- **Importeren, en daarna nooit stil overnemen.** Bij de installatie stelt de
  ontdekking kamers en zones voor uit de gebieden; de bewoner bevestigt of past
  aan. Daarna vergelijkt de dienst bij elke start. Een nieuw apparaat wordt een
  voorstel ("nieuwe airco in de slaapkamer, toevoegen?"). Een verdwenen
  entiteit wordt een melding, en de regeling werkt door met wat er nog is (70).
  Een gebied dat in Home Assistant een andere naam krijgt, verandert niets: de
  app houdt zijn eigen naam.
- **Aanpassen kan altijd,** in een scherm Kamers, niet alleen bij de installatie.
  Een kamer toevoegen, hernoemen, verplaatsen naar een andere etage of zone, of
  weghalen. Een apparaat toevoegen, naar een andere kamer verplaatsen, aanpassen
  (naam, rol, vermogen, bereik, stille uren) of uit de regeling halen. Uit de
  regeling halen is iets anders dan verdwijnen: het apparaat blijft in Home
  Assistant en wordt nog gemeten, maar Smart Climate stuurt het niet meer.
- **Wat er verandert in Home Assistant, ziet de dienst zelf** (aangevuld
  2 oktober 2026). Hij luistert naar de meldingen van Home Assistant als er een
  apparaat bijkomt, verdwijnt of naar een ander gebied gaat, net zoals hij nu
  naar metingen luistert en ook alleen lezend, en vergelijkt bij elke start.
  Per soort volgt een voorstel, nooit een stille wijziging:

  | Nieuw in Home Assistant | Voorstel |
  | --- | --- |
  | Thermometer in een kamer zonder meting | meten in die kamer |
  | Betere thermometer in een kamer met meting | deze gebruiken in plaats van de oude |
  | Raam- of deursensor | een functie (78): de airco in die kamer pauzeren als het raam openstaat; en mee in de dataset |
  | Airco of warmtepomp | toevoegen aan een kamer, met wat hij kan; daarna eerst leren of meekijken (73) |
  | Iets wat er niet toe doet (41) | overslaan, zichtbaar bij "niet gebruikt" |
  | Een apparaat dat de regeling gebruikte, verdwijnt | geen voorstel maar een melding, en doorregelen met wat er is (70) |

  Twee niveaus voor meldingen. Iets nieuws is niet dringend: een voorstel in de
  app, bovenaan Kamers en op Thuis, zonder pushmelding. Iets wat de regeling
  raakt (een verdwenen sensor, een airco die niet meer reageert, de failsafe)
  krijgt wel een pushmelding: de bewoner moet weten dat de regeling iets anders
  doet dan hij verwacht. Een bevestigd voorstel verandert de configuratie, en
  dat legt `runs.ndjson` vanzelf vast (66).
- **Een apparaat toevoegen zijn twee stappen** (aangevuld 2 oktober 2026).
  Het apparaat in Home Assistant krijgen (een integratie van het merk, een
  Zigbee-sensor aanmelden, inloggen bij de cloud van de fabrikant) blijft werk
  van Home Assistant: dat kent honderden merken, en de inloggegevens horen daar.
  Het apparaat in Smart Climate opnemen (kamer, zone, rol, grenzen) gebeurt in
  de app. De app maakt de eerste stap kort met de vaste links van Home Assistant
  ("my links"), die meteen het koppelscherm van het gekozen merk of het
  Zigbee-scherm openen; daarna ziet de dienst het nieuwe apparaat en volgt het
  voorstel om het aan een kamer toe te voegen. Later, voor een product waarin
  Home Assistant onzichtbaar is (34), kan de app de koppelschermen van Home
  Assistant ook zelf starten en invullen. Dat is schrijven naar Home Assistant
  en vraagt een eigen besluit: alleen een korte, geteste lijst integraties
  (klimaat, P1-meter, omvormers), inloggegevens rechtstreeks naar Home
  Assistant zonder dat de app ze bewaart, en pas met een eigen inlog (23, 77).
- **Kamers horen bij een etage.** Home Assistant kent sinds 2024 etages, met
  gebieden erin. De ontdekking neemt ze over; de bewoner kan ze aanpassen of zelf
  aanmaken als Home Assistant ze niet heeft. De app toont kamers per etage, en de
  doorsnede op de wand wordt eruit opgebouwd: etages boven elkaar, kamers
  ernaast. Zo hoeft niemand per huis een tekening te maken.

*Wat het vraagt:* een modelwijziging. Naast `zones` komen `rooms` en `floors`
in het schema; de kern blijft alleen zones kennen, en kamers en etages dienen de
uitleg en de weergave. De witte lijst van `HaClient.query` (41) krijgt het
etageregister erbij, nog steeds alleen lezen. En schrijven vanuit de app vraagt
de inlog op de weergave (23, stap C). Tot dan kan het alleen achter Ingress (42).

*Wanneer:* het model bij stap C, het scherm bij F. Niets hiervan raakt de
winterdata van dit huis.

---

## 73. Elk huis doorloopt drie fasen, en de bewoner doet vanaf dag één mee

*Onderwerp: visie en principes · Status: geldig*

In dit huis kijkt Smart Climate mee naast een YAML-systeem. In een nieuw huis is
er geen voorganger, en dan moet de app iets anders zeggen en vragen.

*Besluit:*

- **Drie fasen: leren, meekijken, regelen.** Leren: het systeem meet en stuurt
  niets. Meekijken: het legt zijn besluiten naast wat er werkelijk gebeurde,
  door een vorige regeling of door de bewoners zelf (28). Regelen: het stuurt.
  De fase kan per apparaat verschillen, en de bewoner beslist wanneer het een
  stap verder gaat. Terug kan altijd. De fase bepaalt de woorden op het scherm
  (71): "je huidige regeling" alleen waar er een is, anders "zoals jullie het
  zelf deden".
- **Leren is geen wachttijd.** De regeling van nu werkt met vaste regels en
  heeft geen geleerd model nodig. Wie meteen wil, kan beginnen met de
  basisregels; het leren maakt het daarna slimmer (D). Meekijken is er voor het
  vertrouwen en het bewijs, niet omdat het anders niet werkt.
- **Wat de bewoner tijdens het leren doet, is data.** Gewoon gebruik is de
  basis voor het meekijken. Daarnaast kan de bewoner:
  - zeggen hoe het voelt: te koud, goed of te warm, met één tik op de wand;
  - een moment toelichten dat sensoren niet zien, zoals koken, een open raam,
    gasten of vakantie. Het systeem vraagt het zelf bij een sprong die het niet
    kan verklaren, zoals de 2 °C in de woonkamer op de avond van 1 oktober;
  - meehelpen met een proef: de bewoner zet een apparaat aan, het systeem meet.
    Ook dan stuurt het systeem zelf niets;
  - vooraf kiezen wat het straks mag: koelen op netstroom boven het plafond,
    stille uren. Dat zijn dezelfde instellingen als later.
- **Gevoel en context horen bij de dataset.** Ze worden per dag naast het
  logboek bewaard, met tijd en kamer, gaan mee in de export, en zijn invoer voor
  het thermisch model. Ze zijn zo gevoelig als de aanwezigheid. Het precieze
  formaat volgt bij het bouwen.

*Hoe het bewaakt wordt:* een test die de pagina in elke fase rendert en faalt
op woorden die bij een andere fase horen.

*Wanneer:* de schermen bij F, het gebruik van gevoel en context bij D. Dit huis
legt ze deze winter al vast, via de testpagina (besluit 84).

---

## 74. Wie zelf ingrijpt, wordt herkend en met rust gelaten

*Onderwerp: kern en regeling · Status: geldig*

Het oude systeem zet een apparaat dat de bewoner zelf bedient na een paar
minuten terug in zijn eigen stand. De nieuwe regeling kent alleen "handen af"
voor het hele huis (8, 8b), en gaat daarna verder vanaf de stand waarin de
bewoner het apparaat achterliet (49b). Zelf merken dat iemand de
afstandsbediening of de thermostaat gebruikt, kan hij niet: `manualOverride` in
het model is een lege plek die de kern niet uitleest. Onder echte regeling zou
hij dus precies doen wat het oude systeem nu doet.

*Besluit:*

- **Herkennen, per apparaat.** Staat een apparaat anders dan de regeling het
  zette (aan of uit, stand, setpoint), en is er geen eigen opdracht onderweg,
  dan heeft de bewoner ingegrepen. Een ingreep via de app telt net zo.
- **Alleen dat apparaat valt buiten de regeling.** De rest regelt door. Het
  verbruik van het overgenomen apparaat telt mee in het budget, zoals het
  werkelijke verbruik dat nu al doet (49b).
- **Geen vaste minuten, maar een natuurlijk eindpunt.** De bewoner kiest hoe
  lang: een uur, tot vanavond, of tot hij het teruggeeft. Kiest hij niets, dan
  duurt het tot het volgende dagdeel van het dagritme. Zet hij het apparaat zelf
  uit of geeft hij het terug, dan is het meteen voorbij. Daarna gaat de regeling
  verder vanaf zijn stand (49b).
- **Het scherm zegt het.** Wie het overnam, wanneer en tot wanneer, met een
  knop "Geef terug".
- **Herhaald ingrijpen is een signaal.** Zet de bewoner hetzelfde apparaat een
  week lang steeds op dezelfde manier, dan stelt de assistent voor de instelling
  aan te passen (44, 73). Hij past zelf niets aan.
- **De failsafe wint,** net als bij handen af (8).
- **Handen af voor het hele huis blijft bestaan,** als de modus Handmatig.

*Wat het vraagt.* De adapter moet weten welke opdracht hij zelf het laatst gaf
en wanneer, om een eigen wijziging te scheiden van die van de bewoner. Een
apparaat dat een opdracht traag of afgerond uitvoert, mag geen ingreep lijken;
daarvoor komt er een marge in tijd en waarde. En een apparaat dat een opdracht
niet uitvoert, is geen ingreep maar een storing: de bewoner verandert iets, een
storing laat het staan. Bij twijfel tussen ingreep en geen ingreep wint de
ingreep. Een apparaat ten onrechte met rust laten is zichtbaar en onschuldig;
de bewoner overrulen is precies wat hier wordt opgelost.

*Hoe het bewaakt wordt:* tests in de kern en de adapter. Na een ingreep gaan er
geen commando's naar dat apparaat tot het eindpunt; de andere apparaten regelen
door; de failsafe stuurt wel; een eigen opdracht telt niet als ingreep, ook niet
als het apparaat er een minuut over doet.

*Wanneer:* het is een voorwaarde voor stap B. Zonder dit gaat het echte
schakelen niet aan.

*Stand op 2 oktober 2026: de regels zijn gebouwd, het aansluiten niet.*
- In de kern: `SystemState.residentOverrides`. Een overgenomen apparaat krijgt
  geen opdrachten en wordt niet afgebouwd (blokkade `resident_override`); de
  failsafe gaat voor. Zijn verbruik telt niet als terugwinbare ruimte. De
  uitleg krijgt `overrides`, maar alleen als er iets overgenomen is, zodat het
  logboek en de vaste replay zonder ingrepen niets veranderen.
- In `core/override.ts`: tot wanneer een ingreep duurt (een uur, vanavond, tot
  hij wordt teruggegeven, of het volgende dagdeel; in de tijdzone van het huis)
  en hoe een afwijking wordt beoordeeld (gelijk, onderweg, storing, ingreep).
- In `adapters/override-detector.ts`: de herkenner die de laatste opdracht per
  apparaat onthoudt, ingrepen begint en beëindigt (eindtijd, zelf uitgezet,
  teruggegeven) en zijn stand kan bewaren.
- Bewaakt door tests in de kern en voor de herkenner, en door een invariant
  over 3.000 gegenereerde toestanden: een overgenomen apparaat krijgt nooit een
  opdracht, behalve van de failsafe. Die invariant faalt aantoonbaar als de
  controle uit de arbiter wordt gehaald.

Nog te doen bij stap B: de herkenner aansluiten op de actuator-laag (opdrachten
vastleggen als ze uitgaan, waarnemingen erlangs halen), zijn stand meenemen in
`own-state.json` (62), en een deur in de app om over te nemen en terug te geven
(75), die pas met een inlog kan (23, 77). In de schaduwmodus geeft de adapter
`observedDrawW` mee; bij echt schakelen hoort het verbruik van overgenomen
apparaten daar niet in.

---

## 75. Een opdracht aan de assistent wordt een ingreep met een eindtijd

*Onderwerp: visie en principes · Status: geldig*

"Zet de zolder op 21" is geen vraag maar een opdracht van de bewoner. Besluit 44
zegt dat de assistent nooit zelf een dienst aanroept, maar een verzoek omzet in
een intentie voor de arbiter. Besluit 74 zegt dat een ingreep van de bewoner met
rust wordt gelaten tot een eindpunt. Dit besluit legt vast hoe die twee op
elkaar passen.

*Besluit:*

- **Een opdracht via de assistent of de app is een ingreep van de bewoner**
  (74), met de assistent als vertaler. Ze gaat als intentie naar de arbiter
  (44). Over dat apparaat beslist de bewoner; de arbiter bewaakt alleen wat de
  bewoner niet ziet: de failsafe, en de rusttijd die de compressor beschermt.
  Kan iets niet meteen, dan zegt de assistent waarom ("over drie minuten, de
  airco moet eerst rusten").
- **Daarna altijd de vraag tot hoe laat.** Een uur, tot vanavond, of tot ik
  het teruggeef. Met spraak kort: "Tot vanavond, goed?" Zonder antwoord geldt
  het volgende dagdeel (74).
- **Een voorstel voor later, als dat beter is.** Kost het nu netstroom en komt
  er binnen afzienbare tijd zon over, dan zegt de assistent dat erbij, met de
  keuze: "Nu kost het 0,3 kW van het net. Om 15:00 is er zon over. Nu, of om
  15:00?" Eén voorstel, zonder aandringen; de bewoner kiest. Zonder prognose
  (E) baseert hij het op het verloop van vandaag, en als hij niets beters weet,
  zegt hij niets.
- **Hij bevestigt wat er werkelijk gebeurde,** uit het besluit van de arbiter
  en niet uit wat hij dacht te doen (44).

*Wanneer:* met de assistent (G). De knoppen in de app (F) volgen dezelfde
stappen: opdracht, tot hoe laat, en het voorstel voor later als dat er is.

---

## 76. De testpagina is een prototype; de echte app krijgt een bewonerscontract

*Onderwerp: weergave · Status: aangevuld door 94*

Sinds 2 oktober 2026 staat `nieuw.html` naast de schaduwpagina: de ontwerptaal van
besluit 71 op live gegevens. Om snel te kunnen kijken leest hij interne vormen
letterlijk (het `Explanation`-object, redencodes, waarnemingen als `cool@22`) en
rekent hij zelf uit wat een kamer doet, welke kop erboven staat en welke stroom
er loopt. Dat gaat in tegen de regel dat er geen logica in de frontend hoort. Voor
een prototype is dat te verdedigen, voor het product niet. Verandert het besluit
met stap B, D of E, dan breekt de pagina. En de wand, de telefoon en straks de
assistent zouden elk hun eigen uitleg hebben.

*Besluit:*

- **`nieuw.html` blijft een prototype.** Hij is er om rond te kijken en ideeën te
  toetsen, leest alleen, en is niet de basis van stap F. Hij wordt niet verder
  uitgebouwd dan nodig is om iets te toetsen.
- **De echte app krijgt een bewonerscontract van de dienst:** per kamer de status
  in woorden en de soort, de kop van het moment, de stromen in kW, het
  dagoverzicht, wat er opviel. Uitgerekend en getest in de dienst; de app toont
  alleen. Interne vormen veranderen dan achter dat contract, niet in de app.
- **Dezelfde teksten voeden de assistent** (44): één uitleg, op elk scherm gelijk.
- **`/api/vandaag` is het eerste stuk ervan,** en blijft.

*Hoe het bewaakt wordt:* contracttests in de dienst, zoals de sleutels die de
page-test sinds besluit 69 bewaakt.

*Wanneer:* bij stap F. Tot dan alleen kleine aanpassingen aan het prototype.

---

## 77. De add-on opent via Home Assistant; een eigen link pas met een eigen inlog

*Onderwerp: veiligheid · Status: geldig*

De vraag was of de add-on straks een eigen link geeft die elke browser opent,
zonder Home Assistant eromheen.

*Besluit:*

- **De add-on draait naast Home Assistant, op hetzelfde apparaat.** Bij dit huis
  is dat de Pi. Op telefoon, tablet of pc is alleen een browser nodig.
- **Hij opent via Ingress,** achter de inlog van Home Assistant: een menu-item
  "Smart Climate", in elke browser waarin Home Assistant opent en in de app van
  Home Assistant. Geen `ports:` in `addon/config.yaml`, zoals nu (23).
- **Een eigen link** (bijvoorbeeld `http://homeassistant.local:8099`) komt pas
  als de weergave een eigen inlog heeft (stap C). Dan als optie, voor een tablet
  aan de muur in kioskstand.
- **Tot dan, voor de wand:** een eigen gebruiker in Home Assistant voor de
  tablet, één keer inloggen, en een kioskbrowser die rechtstreeks naar de pagina
  van de add-on gaat. De inlog van Home Assistant blijft de deur.
- **Wie Home Assistant zonder add-ons draait** (Container of Core), gebruikt het
  Docker-image, zoals de NAS.

*Wanneer:* de add-on gaat weer aan bij stap B (53).

---

## 78. Geavanceerde functies volgen uit wat het huis heeft; ingrijpende vragen een bewuste keuze

*Onderwerp: visie en principes · Status: geldig*

Op 2 oktober 2026 kwam de omvormer van dit huis lokaal binnen via Modbus. Dat
maakt functies mogelijk die verder gaan dan klimaat: nul-op-de-meter, niet
terugleveren bij een negatieve prijs, en beveiliging tegen overbelasting. Niet
iedereen heeft zo'n koppeling, en wie hem heeft, heeft er een handeling met
gevolgen voor gedaan.

*Besluit:*

- **Wat een huis kan, volgt uit wat het heeft (70),** niet uit een schakelaar
  voor gevorderden:

  | Functie | Wat ervoor nodig is |
  | --- | --- |
  | Koelen en verwarmen op zon | P1-meter |
  | Beveiliging tegen overbelasting | P1-meter met stroom per fase, en de waarde van de hoofdzekering |
  | Negatieve prijs opvangen door zelf te verbruiken | Dynamisch tarief (stap E) |
  | Negatieve prijs opvangen door de omvormer te begrenzen | Dynamisch tarief en besturing van de omvormer |
  | Nul-op-de-meter | Besturing van de omvormer |

- **Overbelasting is een tweede budget naast vermogen.** De arbiter start geen
  apparaat dat de stroom op een fase boven de hoofdzekering zou brengen. Een
  P1-meter met stroom per fase is genoeg; Modbus is er niet voor nodig. De
  waarde van de hoofdzekering vraagt de onboarding.
- **Eerst verbruiken, dan pas begrenzen.** Een negatieve prijs vangt de
  regeling eerst op met wat hij al doet: koelte of warmte opslaan, een boiler,
  een laadpaal (via evcc). Begrenzen van de omvormer is de laag erbovenop, voor
  wie die besturing heeft.
- **Ingrijpende functies vragen drie dingen.** Ingrijpend is alles wat de
  omvormer of het net begrenst, of draaiende apparaten afschakelt.
  1. De bewoner zet ze bewust aan; niets daarvan staat vanzelf aan.
  2. Eerst meekijken, per functie, zoals nu met de airco's.
  3. Een veilige terugval: valt de verbinding weg, dan gaat de omvormer terug
     naar 100%. Een omvormer die op een begrenzing blijft hangen, kost stil
     opbrengst.

  Schrijven naar de omvormer is een nieuwe soort apparaat. De witte lijst van
  `HaClient` (15) krijgt die pas met een eigen besluit.
- **De app laat zien wat het huis kan.** Per functie: beschikbaar of niet, wat
  hij oplevert, en wat ervoor nodig is, met hoeveel moeite: "zelf te doen",
  "geavanceerd" of "installateur nodig". Een gewone gebruiker ziet wat kan; wie
  meer wil, ziet de volgende stap.
- **Bij drie fasen** krijgt elke fase een eigen budget. Op welke fase een
  apparaat zit, leert de regeling uit de sprong in de stroom wanneer het
  aangaat; de bewoner hoeft het niet op te zoeken.

*Voor dit huis:* één fase, hoofdzekering 1 × 35 A (volgens Liander, 2 oktober
2026). Komt in de configuratie zodra het schema er een veld voor heeft.

*Wanneer:* het budget voor overbelasting kan na stap B, als de regeling echt
start en stopt. De stroom per fase kan nu al mee de dataset in (65), net als de
spanning: wat je niet vastlegt, krijg je niet terug. Begrenzen van de omvormer
komt na stap E.

*Aangevuld 6 en 7 oktober 2026: het stroombudget is gebouwd in de schaduwmodus.*
Op 6 oktober koos de bewoner ervoor het niet na B te bouwen maar nu, in de
schaduw: er wordt niets geschakeld, maar het logboek zegt wanneer de arbiter een
start zou tegenhouden, en de dataset telt hoe vaak. Hoe het werkt:

- **De configuratie** kent `grid`: per fase de stroommeter, eventueel de
  spanning, en de zekering in ampère, plus een marge (standaard 2 A). Zonder
  `grid` blijft alles zoals het was. Voor dit huis: één fase, `L1`, 1 × 35 A met
  `sensor.p1_meter_current_phase_1` en `sensor.p1_meter_voltage_phase_1`, die
  daarmee van `recordOnly` naar echte invoer gingen.
- **Een start** wordt afgewezen met `insufficient_current_budget` als de stroom
  op een fase plus wat het apparaat vraagt (geschat vermogen ÷ spanning) boven
  de zekering min de marge komt. Zolang niet bekend is op welke fase een
  apparaat zit, telt het op elke fase.
- **De richting.** Bij één fase volgt die uit het netvermogen: bij teruglevering
  maakt een start de stroom door de zekering juist kleiner. Bij drie fasen geeft
  de P1-meter per fase geen richting, en komt de extra stroom bovenop: voor een
  zekering is voorzichtig de goede kant. Een eerste versie telde ook bij één fase
  altijd bovenop, en zou zo juist bij de meeste zon een start tegenhouden; een
  test ving het.
- **Een ontbrekende meting** is geen reden om stil te staan: dan schat de arbiter
  de stroom uit het netvermogen (`bron: geschat`). Ontbreken beide, dan start
  hij niets, en zegt waarom.
- **Nooit tegengehouden:** afbouwen, parkeren, bijstellen, en de failsafe.
- **Uitleg en logboek:** `Explanation.phases` (stroom, grens, bron), een zin
  voor de assistent en de pagina, en in elk logrecord `fasen`, met
  `stroomGeweigerd` als een start daarop sneuvelde.
- **Bewaakt** door unit-tests (één fase, drie fasen, teruglevering, ontbrekende
  meting, afbouwen), een regel voor duizenden gegenereerde toestanden die
  faalt als de controle uit staat, en een schaduwtest die het logboek leest.
  De vaste replay van 26 augustus blijft gelijk: die heeft geen stroommeting,
  en de schatting uit het netvermogen komt daar nergens bij de grens.

Nog niet: leren op welke fase een apparaat zit (deel 2 van dit besluit), de
hoofdzekering vragen in de onboarding, en draaiende apparaten afschakelen bij
overbelasting; dat laatste is ingrijpend en vraagt een bewuste keuze.

*Voor dit huis, vooruit:* er loopt een aanvraag voor drie fasen, 3 × 25 A,
die eind 2026 gerealiseerd wordt (volgens de bewoner, 7 oktober 2026). Dan
krijgt `grid` drie fasen met de P1-sensoren per fase, en wordt het budget per
fase hier ook in de praktijk getest; tot dan alleen met tests.

---

## 79. Wat een pushmelding krijgt, en wat in de app blijft

*Onderwerp: weergave · Status: aangevuld door 183*

Een app die te vaak meldt, wordt uitgezet; een app die het belangrijke niet
meldt, wordt niet vertrouwd. Op 2 oktober 2026 koos de bewoner per soort.

*Besluit:*

| Wat | Hoe |
| --- | --- |
| Iets nieuws in Home Assistant (72) | alleen in de app, als voorstel bovenaan Kamers en op Thuis |
| Iets wat de regeling raakt: een verdwenen sensor, een airco die niet reageert, de failsafe (72) | pushmelding |
| Een voorstel van de assistent (44, 74) | alleen in de app, bij "Opgevallen"; een voorstel heeft geen haast |
| Opgevallen sluipverbruik | één pushmelding de ochtend erna, alleen als de nacht duidelijk boven de laagste nachten van het huis ligt |
| Een ingreep die afloopt (74) | een pushmelding een kwartier vooraf, met "Nog een uur" en "Laat maar"; alleen bij een ingreep met een eindtijd |

*Nachtrust:* tussen 23:00 en 07:00 alleen wat dringend is, dus wat de regeling
raakt. De rest wacht tot 07:00.

*Wat ervoor nodig is:* een manier om de telefoon te bereiken. In de add-on is
dat de app van Home Assistant (een melding via de notify-dienst), en dat is
schrijven naar Home Assistant: het hoort bij de inlog en het besluit over
schrijven (23, 77). De niveaus en de nachtrust worden later per bewoner
instelbaar; dit zijn de standaarden.

---

## 80. Iedereen in huis bedient; één beheert

*Onderwerp: veiligheid · Status: geldig*

Een huis heeft meer dan één bewoner, en niet iedereen hoeft alles te kunnen.
Gekozen op 2 oktober 2026.

*Besluit:* twee rollen.

- **Bewoner:** een kamer bijsturen, een apparaat overnemen en teruggeven (74,
  75), de modus kiezen, zeggen hoe het voelt en een moment toelichten (73).
- **Beheerder:** daarnaast de comfortgrenzen, de kamers en zones (72), wat de
  regeling mag (zoals koelen op netstroom, 50), ingrijpende functies (78) en
  de fase: leren, meekijken of regelen (73).

In de add-on volgt de rol uit Home Assistant: een beheerder daar is beheerder
hier, de rest is bewoner. Alle gevoelstikken tellen even zwaar; het model
middelt over wie er thuis is.

*Wanneer:* met de inlog (23, 77).

---

## 81. Een zone met meer sensoren koelt op de warmste en verwarmt op de koudste

*Onderwerp: kern en regeling · Status: aangevuld door 95*

Met kamers en zones uit elkaar (72) kan één zone meer kamers met elk een
thermometer hebben, zoals keuken en woonkamer op één airco. Gekozen op 2
oktober 2026.

*Besluit:* bij koelen telt de warmste kamer, bij verwarmen de koudste. Niemand
in de zone krijgt het te warm of te koud; dat kost iets meer dan regelen op een
gemiddelde, en dat is de afspraak. De hysterese (de schakelbanden) geldt op die
kamer. De app laat zien op welke kamer de zone op dat moment regelt.

*Wanneer:* met het model voor kamers (72, stap C). Tot dan heeft elke zone één
thermometer en verandert er niets.

*Aanvulling, dezelfde dag: twee meters in één ruimte.* De regel hierboven is
voor aparte kamers. Hangen er twee meters in dezelfde ruimte, zoals in dit huis
de Nest aan de keukenkant en de screenschakelaar in de zithoek, dan zou "de
warmste telt" bij koelen op de keukenkant regelen, ook als er gekookt wordt.
Daarom wijst de bewoner per ruimte aan welke meter telt: de plek waar je zit.
De andere meet mee, voor de dataset en het thermisch model (D), maar stuurt
niet. Wijst niemand iets aan, dan telt de meter die de ruimte als eerste kreeg.
De app laat beide zien, met het verschil.

Een thermostaat die zelf de ketel regelt, zoals de Nest, blijft op zijn eigen
meting stoken. Telt een andere meter, dan zet Smart Climate de Nest zoveel hoger
of lager als het verschil dat het thermisch model tussen de twee meters kent.
Daarvoor moet dat verschil eerst gemeten zijn. In dit huis schrijft de
schakelaar sinds 2 oktober mee (`recordOnly`). De woonkamer blijft op de Nest
regelen tot de vergelijking er ligt, en tot het moment van echt schakelen (64),
want het oude systeem regelt ook op de Nest.

---

## 82. Zonder verbinding toont de tablet de laatste stand, gemarkeerd

*Onderwerp: weergave · Status: geldig*

Een tablet aan de muur verliest weleens de verbinding: de wifi, een herstart
van de NAS, een update van Home Assistant. Gekozen op 2 oktober 2026.

*Besluit:* het scherm blijft staan met de laatste waarden, grijs gemaakt, met
"Geen verbinding sinds 14:02". De regeling draait niet op de tablet maar in de
dienst, en dat staat erbij: "De regeling loopt gewoon door." Bedienen kan niet
tot de verbinding terug is; de knoppen zijn dan uitgeschakeld en zeggen
waarom. De tablet herstelt de verbinding zelf.

Is niet de verbinding weg maar de dienst zelf, dan zegt het scherm dat ook, met
wat het vangnet doet: "Smart Climate reageert niet; je huidige regeling heeft
het overgenomen" (het teken van leven uit stap B).

*Gebouwd op 7 oktober 2026, het eerste deel.* Valt de stroom van besluiten
langer dan vijftien seconden weg, dan wordt de app grijs met de laatste stand,
met bovenaan "Geen verbinding sinds 14:02" en dat de regeling op de NAS gewoon
doorloopt; knoppen en velden doen dan niets. Een korte onderbreking, zoals bij
een uitrol, telt niet. De browser maakt de verbinding zelf opnieuw. Het tweede
deel, de dienst zelf die niet reageert met het vangnet erbij, volgt met stap B.

---

## 83. Ruwe data twee jaar, daarna samengevat

*Onderwerp: meten, data en analyse · Status: geldig*

Gevoel, toelichting en aanwezigheid zijn persoonlijke gegevens; het logboek en
de ruwe historie bewaren ze nu onbeperkt. Het thermisch model heeft wel een
paar winters nodig. Gekozen op 2 oktober 2026.

*Besluit:* ruwe gegevens, per minuut en met wie er thuis was, blijven twee jaar
bewaard. Daarna worden ze samengevat per uur en zonder aanwezigheid; de
samenvatting blijft. Het thermisch model leert in die twee jaar en houdt zijn
geleerde getallen. Exporteren (48) en alles verwijderen kan de beheerder
altijd.

*Wanneer:* het eerste moment waarop iets ouder dan twee jaar is, is september
2028; het samenvatten hoort uiterlijk dan te bestaan. Tot dan blijft alles
staan, ook in de back-up.

---

## 84. Gevoel en toelichting mogen deze winter via de testpagina, naar een eigen bestand

*Onderwerp: veiligheid · Status: geldig*

Besluit 73 maakt gevoel ("te koud, goed, te warm") en toelichting ("we kookten")
tot data voor het thermisch model. Zonder ze deze winter vast te leggen, leert
het model een winter lang zonder. De weergave op de NAS leest alleen (42), en
een inlog is er nog niet (23). Op 2 oktober 2026 koos de bewoner bewust voor
een uitzondering: de testpagina mag ze afgeven.

*Besluit:* een tweede, smalle deur: `POST /api/gevoel`.

- **Naar een eigen bestand, nooit naar Home Assistant.** `gevoel.ndjson` in de
  logmap, regel per regel. Besluit 15 blijft staan: `HaClient` schrijft niets.
- **Alleen vaste woorden voor een bestaande zone.** Gevoel: `te_koud`, `goed`,
  `te_warm`. Toelichting: `koken`, `raam_open`, `gasten`, `douche`,
  `zon_door_raam`, `weet_niet`. Geen vrije tekst, en wat er verder in een
  verzoek staat, komt niet in het bestand.
- **Een grens op het tempo:** dertig per tien minuten voor het hele huis, en de
  grens op de grootte die de server al had.
- **Dezelfde schakelaar als de onboarding:** de route bestaat alleen als `main.ts`
  het logboek meegeeft, en dat doet hij alleen als er gelogd wordt. Elke andere
  route en methode blijft achter de muur; tests bewijzen beide.
- **Het hoort bij de dataset:** de export neemt het bestand mee (48), en het
  thermisch model leest het (D).

*Het risico, bewust genomen:* iedereen op het thuisnetwerk of in het tailnet kan
een tik afgeven. Het ergste dat dat oplevert, is ruis in de dataset, en die is
eruit te filteren. Het huis is alleen daar bereikbaar (besluit 23, aantekening
van 1 oktober). Bij een product buiten dit huis gaat deze deur achter de inlog
(77, 80).

---

## 85. Bij zon over: eerst comfort, dan de batterij, dan de auto

*Onderwerp: kern en regeling · Status: geldig*

Zodra er een laadpaal en een thuisbatterij bij komen (via evcc en Predbat),
vragen drie verbruikers om dezelfde zonnestroom. Gekozen op 2 oktober 2026.

*Besluit:* de volgorde is comfort (de airco's, de verwarming op zon), dan de
batterij (voor de avond), dan de auto. Met één uitzondering die de bewoner zet:
"auto vol om 7:00" geeft de auto voorrang tot hij genoeg heeft voor dat
tijdstip. Smart Climate stuurt laadpaal en batterij niet zelf, maar ziet ze in
het budget en geeft evcc en Predbat door hoeveel er over is.

*Wanneer:* met de koppeling van laadpaal en batterij; niet voor dit huis
nodig zolang die er niet zijn.

---

## 86. De app is vanaf het begin toegankelijk en tweetalig

*Onderwerp: weergave · Status: geldig*

Achteraf toegankelijk maken is duurder dan het meteen doen. Gekozen op 2
oktober 2026.

*Besluit:*

- **Grote tekst en contrast.** De app volgt de tekstgrootte van de telefoon, en
  alle tekst haalt het contrast van WCAG AA, ook op de donkere wand.
- **Bedienbaar zonder kijken.** Alles werkt met een schermlezer (VoiceOver,
  TalkBack): echte knoppen met namen, en elke tekening heeft een beschrijving
  die zegt wat er gebeurt, niet alleen wat er staat.
- **Engels naast Nederlands.** Alle teksten komen uit één plek en zijn
  vertaalbaar; Engels is de tweede taal. Dat geldt ook voor de uitleg uit het
  bewonerscontract (76) en voor de assistent.

*Hoe het bewaakt wordt:* een toegankelijkheidscontrole in de page-test (69)
zodra stap F gebouwd wordt.

---

## 87. Donker, met later een lichte versie en een eigen accentkleur

*Onderwerp: weergave · Status: aangevuld door 181*

Gekozen op 2 oktober 2026, als aanvulling op besluit 71.

*Besluit:* alles begint in de donkere ontwerptaal. Op de telefoon komt een
lichte versie als keuze zodra de app staat; de wand blijft donker. En de
bewoner kan een accentkleur kiezen voor de app: het menu, de knoppen, het logo.

*Wat de accentkleur niet raakt:* de kleuren die iets betekenen. Blauw is
koelen, oranje verwarmen, amber wachten, groen goed. Die blijven overal gelijk,
anders zegt een kleur op de ene telefoon iets anders dan op de andere. En de
kiezer biedt alleen kleuren die het contrast van besluit 86 halen.

---

## 88. De app noemt alleen een oorzaak die gemeten is

*Onderwerp: weergave · Status: geldig*

Op 3 oktober 2026 bevestigde een proef dat ongeveer 140 W 's nachts bij de pc
hoorde: de pc ging uit en de nacht kwam op 165 W. Maar de P1-meter ziet het hele
huis, niet de pc. Een kaart die "je pc stond aan" zegt, gokt. Bij de volgende
keer kan het net zo goed een kachel, een lader of een vergeten lamp zijn. Gekozen
door de bewoner op 3 oktober 2026.

*Besluit:* wat de app zegt, is gemeten. Een oorzaak noemt hij alleen als een
meter hem aantoont.

- **Zonder eigen meter: het wat, het wanneer en het hoeveel.** "Vannacht 140 W
  meer dan je laagste nachten, van 23:10 tot 07:30. Staat er iets aan?" Geen
  apparaat, ook niet met "waarschijnlijk" ervoor.
- **Met een eigen meter: het apparaat bij naam.** Een slimme stekker of een
  energiesensor die in de app aan een apparaat gekoppeld is (72), en die het
  verschil ook echt meet. Dan mag het: "Je pc verbruikte vannacht 140 W."
- **Wat de bewoner zelf zegt, blijft van de bewoner.** Antwoordt hij op de vraag
  "dat was de pc", dan onthoudt de app dat als zijn toelichting (73, 84), en
  toont hij het zo: "Jij zei: de pc." Komt hetzelfde patroon terug, dan mag de app
  vragen "Weer de pc?", maar hij stelt het niet vast.
- **Dit geldt voor alles wat opvalt,** niet alleen voor het sluipverbruik: een
  kamer die sneller afkoelt (een raam?), een airco die meer vraagt dan anders. De
  app beschrijft het patroon en vraagt; de redenen die de regeling zelf geeft
  (het `Explanation`-object) zijn wel gemeten en blijven zoals ze zijn.

*Hoe het bewaakt wordt:* in het bewonerscontract (76) heeft een melding over iets
dat opviel alleen een veld voor een apparaat als er een meter van dat apparaat
achter staat; een contracttest bewijst dat het zonder meter leeg blijft.

---

## 89. Elke omvormer werkt; de app meet hoe snel de zonnesensor is en wijst de lokale weg

*Onderwerp: kern en regeling · Status: geldig*

Op 3 oktober 2026 lag de vergelijking er: de Modbus-sensor van de SolarEdge
geeft elke 61 seconden een waarde, de cloud elke 15 minuten, als momentopname.
De waarden komen overeen (mediaan −10 W), maar bij wisselend weer zit de cloud
honderden watts naast wat er op dat moment binnenkomt. Andere merken hebben
hetzelfde verschil, met een andere weg naar lokaal. Een Growatt bijvoorbeeld
heeft Modbus op een RS485-aansluiting, niet via het netwerk, en de standaard
WiFi-stick praat alleen met de cloud. Gekozen op 4 oktober 2026.

*Besluit:*

- **De regeling is niet aan een merk gebonden.** `solarProduction` is een gewone
  sensor in W. Elk merk werkt, via de cloud of lokaal.
- **De app meet zelf hoe vaak de zonnesensor een nieuwe waarde geeft,** overdag,
  bij de onboarding en daarna doorlopend. Dat is een meting, geen aanname over
  het merk (88).
- **Is dat trager dan eens per twee minuten, dan zegt hij het,** met wat het
  kost: "Je zonnesensor geeft eens per 15 minuten een waarde. Met een lokale
  koppeling zie ik een wolk binnen een minuut, in plaats van na een kwartier."
  Eén keer bij de onboarding en bij "Wat je huis kan" (78), geen pushmelding
  (79).
- **Met de lokale weg voor dat merk,** en de moeite die erbij hoort, op de
  schaal van besluit 78:

  | Merk | Lokale weg | Moeite |
  | --- | --- | --- |
  | SolarEdge | Modbus TCP aanzetten in SetApp, met de integratie SolarEdge Modbus Multi | geavanceerd, soms de installateur |
  | Growatt | RS485 naar het netwerk (bijvoorbeeld een Elfin EW11) of een USB-stick aan Home Assistant; of de WiFi-stick met andere firmware | geavanceerd |
  | Elk merk | Een kWh-meter op de groep van de panelen, naast de P1-meter | zelf te doen of installateur |

  De tabel groeit met de huizen die erbij komen. Wat er voor een merk staat,
  is nagegaan, niet aangenomen; wat nog niet is nagegaan, krijgt alleen de
  kWh-meter als weg.
- **Het merk leidt de app af uit Home Assistant** (de integratie van de sensor).
  Weet hij het niet, dan vraagt hij het, en zonder antwoord noemt hij de
  kWh-meter.
- **Een andere zonnesensor is een breukpunt in de dataset.** De app zet de
  nieuwe eerst naast de oude (65), vergelijkt een paar dagen, en legt de datum
  van de overstap vast, zoals in dit huis.

*Wat dit niet regelt:* het begrenzen van de omvormer. Dat blijft bij besluit
78, met een eigen besluit voor het schrijven. Per merk moet dan nagegaan worden
of een vermogensgrens via Modbus in geheugen terechtkomt dat slijt bij vaak
schrijven; dan mag de regeling hem niet elke minuut bijstellen.

*Wanneer:* de meting en de melding bij de onboarding (stap F). De meting kan
eerder in de dienst, als deel van het bewonerscontract (76).

*Voor dit huis: omgezet op 4 oktober 2026.* Tot dan kwam `solarProduction` uit de
cloudkoppeling van SolarEdge (`sensor.solaredge_huidig_vermogen`), die precies
elke 15 minuten bijwerkt. Sinds 2 oktober 10:11 liep de Modbus-sensor mee in
`recordOnly`. Na drie dagen (een wisselende op 2 oktober, twee rustiger en
zonniger) was de uitkomst: elke 61 seconden een waarde, nooit onbeschikbaar,
's avonds netjes 0, en per dag 2 tot 3% onder de cloud, wat past bij een
momentopname per kwartier. Sindsdien is `solarProduction`
`sensor.solaredge_i1_ac_power`; de cloudsensor schrijft mee in `recordOnly`, net
als de stroom en spanning op fase 1 van de P1-meter (78). Het breukpunt in de
kolom `zonW` is de herstart van de dienst op 4 oktober, na deze wijziging. De
besluiten merken het niet: de regeling rekent het budget op de P1-meter (47),
en het oude systeem gebruikt de cloudsensor alleen voor de weergave
(`sensor.zonnepanelen_vermogen_w` in `pv_overschot.yaml`).

---

## 90. Alleen sturen wat afwijkt; slimmere timing moet eerst in de replay winnen

*Onderwerp: kern en regeling · Status: geldig*

Het oude systeem laat de airco's vaak piepen. Als het ingrijpt, stuurt het
altijd `set_hvac_mode: cool` én `set_temperature`, ook als alleen de temperatuur
anders is. En de PV-logica stuurt opnieuw zolang een airco "niet actief koelt",
ook als hij gewoon zijn temperatuur heeft gehaald en de compressor terugschakelt.
De kern doet dat al anders: `commandsFor` in de arbiter stuurt een stand alleen
als die afwijkt, een setpoint alleen buiten de tolerantie, en niets als alles al
goed staat. Gekozen op 5 oktober 2026.

*Besluit, deel 1: sturen in stap B.* De dienst die echt stuurt:

- **Leest de stand opnieuw vlak voor hij stuurt,** niet de momentopname van de
  beslissing. Wat dan al goed staat, gaat niet de deur uit.
- **Stuurt stand en temperatuur samen** als het apparaat uit staat en de
  koppeling dat in één opdracht kan. Per koppeling na te gaan; voor de
  LG-airco's van dit huis eerst testen hoeveel piepjes dat geeft.
- **Controleert na het sturen of het aankwam,** met de wachttijd van de
  detector (74). Kwam het niet aan, dan is dat een storing en geen reden om te
  blijven herhalen.
- **Heeft een piepbudget:** per apparaat hooguit een paar opdrachten per uur,
  en een setpoint alleen in hele stappen bijgesteld. Goed voor de oren en voor
  het apparaat.

*Besluit, deel 2: de timing blijft tot B gelijk aan het oude systeem.*
Stabilisatie (5 minuten, ook na parkeren, 61), minimale draaitijd, rusttijd,
standby op 25/18 en één start per beslissing (68). In de schaduw moeten de regels
gelijk zijn, anders vergelijk je twee regelingen. Slimmer kan wel, en dit zijn de
kandidaten:

1. **Stabiliseren op meting:** klaar zodra het vermogen van het apparaat een
   minuut stabiel is, met de 5 minuten als maximum.
2. **Parkeren of uit, op wat er nog komt.** Zie hieronder.
3. **De compressor beschermen met starts per uur,** met de minimale draaitijd
   als ondergrens.
4. **Het piepbudget van deel 1** ook als regel in de arbiter, zodat de replay
   het kan tellen.

Een kandidaat gaat pas in de regeling als hij in de replay op de eigen dataset
wint: minder starts en minder opdrachten, bij hetzelfde comfort en niet meer
netstroom. Pas na de start van B, zodat de vergelijking deze winter zuiver
blijft.

*Parkeren of uit: op de stand van de zon, niet op de klok of de zonsondergang.*
De kern kent nu alleen "zon boven de horizon" (`sun.sun`): de strategie voor
zonnestroom stopt als de zon onder is. De dagdelen (nacht, voorverwarmen, dag)
volgen de klok, en dat blijft zo, want die gaan over het ritme van de bewoners.
Maar voor zonnestroom is de zonsondergang te laat: op 2 oktober leverden de
panelen om 18:00 nog 260 W, en de zon ging om 19:05 onder. Wanneer er niet
genoeg meer komt, hangt af van de ligging van de panelen, van schaduw en van
het seizoen. Daarom:

- **De stand van de zon wordt uitgerekend** uit de tijd en de ligging van het
  huis (hoogte en richting van de zon). Dat is zuiver, dus in de kern, en
  hoeft niet uit Home Assistant te komen. De ligging hoeft maar op één
  decimaal (ongeveer 10 km): genoeg voor de zon, niet genoeg om het huis te
  vinden.
- **Het huis leert wat zijn panelen bij elke zonnestand hooguit leveren,** uit
  de eigen dataset: het hoogste van de afgelopen weken bij die stand. Dat is de
  opbrengst bij een heldere hemel, voor dit dak.
- **Bij een dip vergelijkt de regeling met dat plafond.** Kan er bij deze
  zonnestand nog genoeg komen voor het apparaat, dan is het een wolk: parkeren.
  Kan dat niet meer, dan is de zonnige dag voorbij: meteen uit, geen standby
  die eindigt in een tweede schakeling.
- **Met E (prognose) en D (hoe snel de kamer opwarmt)** wordt het beter: of de
  wolk lang duurt, en of de kamer de dip kan opvangen.

Dit is kandidaat 2 en moet dus ook eerst in de replay winnen.

*Wanneer:* deel 1 bij stap B. De kandidaten daarna, elk na een replay. Het
plafond per zonnestand kan nu al worden uitgerekend uit de dataset; daarvoor
is sinds 4 oktober de zonnestroom per minuut er (89).

*Aangevuld 7 oktober 2026: kandidaat 2 gemeten.* Het plafond per zonnestand
wordt nu geleerd (aanvulling bij 93), en `tools/onderzoek/decision-90.ts` speelt
dezelfde minuten af met en zonder de kandidaat. Het plafond komt telkens uit
de andere dagen, nooit uit de dag die wordt afgespeeld. Venster 20 tot 30
september (15.262 minuten; de zon uit het beslislogboek, want dat venster kent
geen zonnesensor):

| | starts | hervat | parkeren | opdrachten | standby (min) | draaien (min) |
| --- | --- | --- | --- | --- | --- | --- |
| woonkamer, zoals nu | 43 | 13 | 54 | 268 | 292 | 2.165 |
| woonkamer, verbruik van nu | 52 | 1 | 9 | 147 | 48 | 2.138 |
| woonkamer, laagste van het uur | 43 | 13 | 51 | 262 | 277 | 2.165 |
| zolder, zoals nu | 36 | 12 | 48 | 227 | 269 | 1.570 |
| zolder, verbruik van nu | 37 | 8 | 18 | 140 | 110 | 1.489 |
| zolder, laagste van het uur | 36 | 12 | 45 | 220 | 254 | 1.570 |

- **Met het verbruik van dit moment verliest hij.** Veel minder opdrachten,
  maar meer koude starts, en van de 69 keer meteen uit hervatte de huidige
  regeling er 34 binnen een kwartier. Koken of een wasmachine laat de dag
  voorbij lijken terwijl de zon er nog is.
- **Met het laagste verbruik van het afgelopen uur wint hij, nipt:** minder
  opdrachten en minder standby, evenveel starts, draaiminuten en netstroom. Van
  de 6 keer meteen uit hervatte de huidige regeling er één. De winst is klein
  omdat de meeste parkeerbeurten echte wolken zijn, en dan is parkeren goed.

Dus: kandidaat 2 gaat met het laagste verbruik van het uur in de regeling,
volgens deel 2 pas na de start van B, en na een tweede meting op een venster
met meer einde-van-de-dag-momenten (het voorjaar). Kandidaat 1 (stabiliseren
op meting) vraagt het vermogen van een airco die de arbiter zelf bestuurt; dat
bestaat pas bij B. Kandidaten 3 en 4 zijn grenzen op starts en opdrachten per
uur; die kan de replay nu al tellen, en dat is de volgende meting.

*Aangevuld 7 oktober 2026: kandidaten 3 en 4 gemeten.* `tools/onderzoek/decision-90-limits.ts`
telt per airco en per klokuur de starts en opdrachten, en speelt dezelfde
minuten af met een grens erin. Een start of een nieuw setpoint boven de grens
vervalt; afbouwen nooit. Augustus (14.476 minuten), woonkamer:

| | starts | opdrachten | draaien (min) | netstroom (kWh) |
| --- | --- | --- | --- | --- |
| zoals nu | 84 | 391 | 3.092 | 10,76 |
| hooguit 2 starts per uur | 79 | 372 | 2.983 | 10,57 |
| hooguit 3 starts per uur | 84 | 391 | 3.092 | 10,76 |
| hooguit 4 opdrachten per uur | 46 | 227 | 1.951 | 8,70 |
| hooguit 6 opdrachten per uur | 63 | 301 | 2.608 | 9,75 |

De zolder en het septembervenster laten hetzelfde beeld zien.

- **Kandidaat 3 doet bij 3 starts per uur niets:** de regeling komt daar nooit
  boven, door de stabilisatie (61) en één start per beslissing (68). Bij 2 per
  uur vallen er een paar starts weg, maar ook ruim 100 minuten draaien. Dat is
  minder comfort, dus geen winst. Hij mag als vangnet in de regeling, op 3: dan
  verandert er niets, en beschermt hij de compressor als iets anders misgaat.
- **Kandidaat 4 verliest.** De regeling geeft vaak drie of meer opdrachten per
  uur, want één keer starten, parkeren en uitzetten is al vijf opdrachten (stand
  en setpoint bij starten en parkeren). Een harde grens van 4 of 6 per uur kost
  16 tot 37% van de draaitijd. Minder gepiep moet daarom uit deel 1 komen: stand
  en temperatuur samen sturen, en niets sturen wat al goed staat. Dat hoort bij
  de actuator-laag van B, niet bij de arbiter.

---

## 91. De add-on krijgt een eigen integratie; de bewoner plakt geen YAML

*Onderwerp: visie en principes · Status: aangevuld door 184*

Fase 1 van de assistent (ONTWERP §7) werkt in dit huis met twee bestanden die
de bewoner zelf in Home Assistant zet: zinnen in `custom_sentences/nl/` en een
`rest_command` met `intent_script` in `configuration.yaml` (`ha-assist/`).
Voor een test is dat goed. Voor een product niet: een bewoner hoort geen YAML
te plakken, net zoals hij nooit een entity-ID ziet (45). Gekozen op 5 oktober
2026.

*Besluit:* naast de add-on komt een eigen integratie van Smart Climate.

- **Installeren is: add-on, integratie, één klik.** De add-on meldt zich aan
  bij Home Assistant. Die toont "Nieuw apparaat gevonden: Smart Climate", en
  met één klik staat de integratie erin. Zolang de integratie niet in Home
  Assistant zelf zit, installeert de bewoner hem eerst via HACS.
- **De integratie registreert de vragen voor Assist in code.** Geen
  `intent_script` en geen `rest_command` in de configuratie van de bewoner.
  Kan de integratie de zinnen niet zonder bestand aanbieden, dan schrijft hij
  één eigen bestand in `custom_sentences/`. Dat bestand is van de integratie:
  hij maakt het, werkt het bij en haalt het weg bij verwijderen.
- **Niet: de add-on schrijft in de configuratie van de bewoner.** Dat kan
  technisch, maar het botst met wat er al staat, vraagt een herstart en is
  slecht terug te draaien.
- **Niet: een eigen gespreksagent.** Dan gaat ook "doe het licht aan" eerst
  langs Smart Climate. Dat is te breed voor een klimaatregeling.
- **De integratie is ook de weg voor stap B.** Een opdracht die echt schakelt,
  loopt door Home Assistant met diens inlog, in plaats van een losse sleutel
  (77, 80). En de stand per kamer kan als sensor beschikbaar komen, voor wie
  hem in een eigen dashboard of automatisering wil.

*Nog uit te zoeken:* of een integratie zinnen voor Assist kan aanbieden zonder
bestand, via hetzelfde mechanisme als de zin-triggers van automatiseringen.

*Voor dit huis:* tot die integratie er is, blijven de bestanden in
`ha-assist/` de manier om de assistent te testen.

*Wanneer:* bij het product (H), samen met de add-on (53, 77).

---

## 92. Zonwering hoort bij het klimaat; verlichting regelt Smart Climate niet

*Onderwerp: visie en principes · Status: aangevuld door 97*

Na de laatste fase kwam de vraag of slimme verlichting in de app hoort.
Gekozen op 5 oktober 2026.

*Besluit, deel 1: zonwering wordt een klimaatapparaat.* Een screen die op tijd
dichtgaat, houdt warmte buiten die een airco anders weer moet wegkoelen, vaak
goedkoper dan koelen, ook op zon. In de winter andersom: open laten is gratis
verwarmen. Het past op wat er al ligt:

- **De stand van de zon** wordt al uitgerekend (90), en de toelichting "zon door
  het raam" wordt al vastgelegd (84).
- **Het thermisch model (D)** leert hoeveel zon er door elk raam binnenkomt, en
  dus wat een screen scheelt.
- **In de arbiter** is een screen een apparaat dat geen vermogen vraagt, met
  dezelfde regels voor de bewoner die zelf ingrijpt (74). Wie de screen zelf
  bedient, wordt met rust gelaten.
- **Een eigen meting gaat voor een aanname (88).** Somfy-screens melden wie ze
  vergrendelde (de bewoner, wind, een andere bediening). Dan kan de app zeggen
  dat de wind hem ophaalde, in plaats van te raden.

*Voor dit huis:* de screens hangen aan de voorkant, in de woonzone op de
begane grond, en krijgen de ochtendzon (volgens de bewoner, 5 oktober 2026). Ze
zitten via Somfy (Overkiz) in Home Assistant: `cover.screen`,
`cover.zonnescherm` en `cover.io_2243641_1`, met een eigen zonnesensor op de
screen (`sensor.screen_screen_luminance` in lux en
`sensor.screen_screen_sun_energy` in W). Die meet de zon op de gevel, los van
de ligging van de panelen. Sinds 5 oktober schrijven ze mee in `recordOnly`
(65), met de stand van de screen (`current_position`) in de historie. Wie hem
vergrendelde (`sensor.screen_priority_lock_originator`) en het doel van de
beweging (`sensor.screen_target_closure`) staan in Home Assistant standaard
uit; de bewoner zette ze op 5 oktober aan.

*Besluit, deel 2: verlichting regelt Smart Climate niet.* Bij licht valt weinig
energie te winnen; LED vraagt weinig, dus het budget, de zon en de tarieven
doen er nauwelijks toe. Home Assistant doet het al goed (automatiseringen,
Adaptive Lighting), en Assist begrijpt "doe het licht aan" zelf. Daarom:

- **Licht blijft invoer.** De avondstand loopt door zolang er licht brandt
  (`eveningExtensionLights`).
- **De app mag licht tonen en bedienen,** via Home Assistant: welke lampen aan
  zijn, met een knop, in het huis waarop je inzoomt (ONTWERP §4, "Het huis is
  de navigatie"). Dan hoeft de bewoner niet uit de app, zonder dat Smart
  Climate het licht regelt.
- **Spraak over licht** blijft bij Assist van Home Assistant (91).

*Wanneer:* zonwering na D, als het thermisch model laat zien wat een screen
scheelt. Licht tonen en bedienen kan met de schermen (F). Vastleggen doet de
dienst nu al. *Aangevuld 5 oktober 2026:* licht bedienen kan al in de proef, met
een eigen smalle deur (97).

---

## 93. Hoe het huis en de panelen liggen, meet de app zelf; de bewoner bevestigt

*Onderwerp: meten, data en analyse · Status: geldig*

Een plattegrond met een kompas, een zonneprognose, het maximum per zonnestand
(90) en het thermisch model hebben allemaal nodig hoe het huis en de panelen
liggen. Een bewoner weet dat zelden precies, en hoort het niet op te zoeken:
geen kompasrichting, geen helling, geen wattpiek, geen omvormertype. Gekozen
op 5 oktober 2026, op voorstel van de bewoner.

*Besluit:*

- **Twee vragen in de onboarding, met een tekening van het huis.** "Waar
  liggen je panelen?" (dak aan de voorkant, aan de achterkant, beide kanten,
  plat dak, weet ik niet) en "Hoeveel ongeveer?" (mag leeg). De ligging van het
  huis komt uit Home Assistant, op één decimaal (90).
- **De richting en helling van de panelen meet de app,** door de opbrengst per
  minuut te vergelijken met de stand van de zon. Het moment van de piek zegt de
  richting, de vorm van de dagcurve en later het verschil tussen de seizoenen
  de helling. Alleen de heldere momenten tellen (de bovenkant van de metingen).
  Een brede, platte curve wijst op twee vlakken, zoals oost en west, en dan
  zoekt hij er twee.
- **Het vermogen ook:** de wattpiek, en of de omvormer de piek afkapt. Een
  afgekapte piek telt niet mee voor de richting.
- **De richting van de gevels** volgt uit een zonnesensor op die gevel, zoals
  die van de screen (92). Een gevel staat rechtop, dus de piek zegt de richting
  meteen. Met de antwoorden van de bewoner (de panelen liggen aan de
  achterkant) geeft dat het kompas van het hele huis, en de twee metingen
  controleren elkaar.
- **De bewoner bevestigt,** in gewone woorden: "Je panelen liggen ongeveer op
  het zuiden, helling rond 35°, samen zo'n 2,4 kWp. Klopt dat?" Met een knop om
  het te verbeteren. Wat hij verbetert, wint van de meting; wat de meting later
  anders ziet, wordt een vraag en geen stille wijziging.
- **Zekerheid hoort erbij.** Na een paar heldere dagen is de richting
  betrouwbaar, de helling en het vermogen na een paar weken. Tot dan zegt de
  app "ongeveer" en hoeveel heldere dagen hij nog nodig heeft.

*De eerste poging in dit huis (5 oktober, drie dagen per minuut):* met één vlak
kwam er "ongeveer het zuiden" uit, met de piek rond het middaguur. Dat was
fout. De bewoner zei daarna: zes panelen ongeveer op het oosten, zes ongeveer op
het westen. Een dak op oost en west geeft samen precies zo'n brede curve met de
piek rond het middaguur, en 1.084 W om 09:25 was de oostkant. Met twee vlakken
tegenover elkaar past het acht keer beter: het oostvlak rond 95 tot 100° (oost,
iets naar het zuiden), het westvlak rond 275 tot 280°, helling rond 45 tot 50°.
Het vermogen komt grof uit op zo'n 5 kWp, ongeveer 410 Wp per paneel; dat is nog
onzeker, want het hangt af van het model voor een heldere hemel. De voorgevel
krijgt de ochtendzon, dus het oostvlak ligt waarschijnlijk aan de voorkant.
Volgens de bewoner is het werkelijk 4.680 Wp (390 Wp per paneel), met een
omvormer van 3.000 W: de schatting zat 7% te hoog, na drie bewolkte dagen. Met
een omvormer van 3.000 W op 4.680 Wp kapt hij op heldere zomerdagen rond het
middaguur af. Bij oost-west gebeurt dat minder, want de twee vlakken pieken op
verschillende tijden. De meting moet die afgekapte uren dus herkennen en niet
gebruiken voor richting en helling.

Wat dit leert voor de app: één vraag ("waar liggen je panelen?") voorkomt een
verkeerde fit, en de meting moet twee vlakken altijd proberen en de bewoner
laten kiezen als ze allebei passen. Opnieuw na een paar heldere dagen, samen
met de gevel uit de zonnesensor van de screen.

*Waar het naartoe gaat: de voorspelling (E met D).* Met de ligging wordt het
weerbericht een voorspelling voor dit huis:

- **Zonnestroom:** de voorspelde instraling (bewolking, of direct de instraling
  op een schuin vlak) op het vlak van de panelen, maal het gemeten vermogen, en
  bijgesteld met wat het huis zelf leerde: het maximum per zonnestand, en hoe
  vaak de voorspelling er voor dit dak naast zat.
- **Warmte door de ramen:** dezelfde instraling op elke gevel, met de stand van
  de screens. Dat is invoer voor het thermisch model.
- **Samen:** het thermisch model rekent met de voorspelde buitentemperatuur, de
  zon op de gevels en wat de regeling van plan is, hoe warm elke kamer wordt.
  Daar komt het plan van `Wand-Plan` uit: "om 10:30 de screens dicht", "tussen
  12:00 en 14:00 voorkoelen op zon".
- **Eerst bewezen in de replay:** de voorspelling naast wat er werkelijk
  gebeurde, over een winter. De app laat zien hoe vaak hij ernaast zat ("Hoe
  zeker ben ik?").

*Welk weerbericht* is een besluit voor E. Home Assistant heeft er al twee
(`weather.home` van Met.no en `weather.buienradar`), met bewolking en
temperatuur per uur, maar geen instraling. Een dienst als Open-Meteo levert de
instraling op een schuin vlak voor een opgegeven helling en richting, en bewaart
oude voorspellingen, zodat de replay ook achteraf kan toetsen. Dat vraagt een
verbinding naar buiten, met alleen de afgeronde ligging.

*Wanneer:* de vragen bij de onboarding (F), de meting zodra er een paar heldere
weken zijn, de voorspelling met E en D.

*Gebouwd op 5 oktober 2026: de zoninval.* De stand van de zon en de hoek op een
vlak in `core/sun.ts` (zuiver, getoetst aan het middaguur en de equinox), de
gevels en dakvlakken als optioneel blok `geometry` in de configuratie, met per
richting waar hij vandaan komt (`bewoner`, `gemeten`, `schatting`), en
`/api/zon` met de gevel in de zon en de panelen bij een heldere lucht. De
ligging van het huis vraagt de dienst bij het verbinden aan Home Assistant
(`get_config`), rondt af op één decimaal en houdt hem alleen in het geheugen.
De assistent zegt bij "hoeveel zon vandaag?" op welke gevel de zon staat, en de
testpagina tekent de heldere lucht als stippellijn in Vandaag. Voor dit huis
staan de gevels en dakvlakken als `schatting`: de voorgevel op 97°, de
achtergevel op 277°, de dakvlakken op 97° en 277° met een helling van 47° en
elk 2.340 Wp, en een omvormer van 3.000 W. De toets volgt met de zonnesensor op
de screen: als de voorgevel op het oosten kijkt, valt de zon er rond 13:40 af.

*De toets, 5 tot 7 oktober 2026:* de zonnesensor op de screen verloor de directe
zon al rond 10:15, bij een zonnehoogte van zo'n 20°, terwijl de panelen helder
doorleverden. Volgens de bewoner hangt de sensor onder de dakgoot: zodra de zon
hoger staat, valt hij in de schaduw. De sensor zegt dus iets over zon op het
raam onder de goot, niet over de richting van de gevel. De voorgevel blijft op
97° (oost), afgeleid van het oostdak en de ochtendzon, als `schatting`. Voor de
app volgt eruit: een gevel meten uit een zonnesensor kan alleen als die vrij op
de gevel hangt, en dat vraagt de app eerst ("hangt hij onder een goot of
overstek?") voordat hij de richting eruit afleidt.

*Aangevuld 7 oktober 2026: de lijn voor een heldere lucht is geleerd.* Naast
de echte opbrengst van 26 dagen (10 september tot 6 oktober) bleek het model met
zijn vaste 0,85 zo'n 20 tot 40% te laag: op de helderste kwartieren haalden de
panelen 5 tot 25% méér dan het model zonder enig verlies, en bij een lage zon in
het westen bijna de helft meer. Het model telt het verstrooide licht bij een
lage zon te zuinig. De lijn heet nu geleerd:

- **Per afgesloten dag de zon per kwartier,** uit het beslislogboek, bewaard in
  `zon-kwartieren.json` in de logmap. Gewone wattages, zonder de ligging van het
  huis; die blijft alleen in het geheugen.
- **Per vak van de hemel** (15° richting, 5° hoogte) een factor op het model: de
  op één na beste dag, zodat één wolkenrand die de zon even versterkt niet als
  maximum telt. Pas na vijf dagen in een vak; daarbuiten het midden van de
  geleerde vakken. Afgekapt door de omvormer telt niet mee.
- **Lager dan het midden pas na vijftien dagen:** echte schaduw komt elke dag
  terug, een reeks bewolkte dagen niet. In één najaar schuift de zon sneller
  door de vakken, dus schaduw herkennen gaat langzaam. Dat is de voorzichtige
  kant: tot dan blijft de lijn op het midden.
- **Waar de lijn vandaan komt, staat in de schaduwweergave,** bij de dataset:
  "zonplafond geleerd uit 26 dagen · factor 0,99 op het model", of "nog
  geschat". De app tekent alleen de lijn: voor een bewoner voegt de herkomst
  niets toe (de bewoner, 7 oktober). Een nieuw huis begint bij de schatting.

Uitkomst voor dit huis: het midden is 0,99 in plaats van 0,85, met per vak
0,89 tot 1,47. Onder 5° hoogte blijft het model het zwakst; dat vak leert pas
wat als de zon er op heldere dagen genoeg langskomt.

---

## 94. De schaduwweergave is voor de cijfers, de proefomgeving voor de app

*Onderwerp: weergave · Status: geldig*

Besluit 76 noemde `nieuw.html` een prototype dat niet de basis van stap F is,
omdat hij zelf logica bevatte. In de praktijk werd hij iets anders. Op 5 oktober
2026 bracht hij, samen met de assistent in Assist, in een paar uur zes dingen
boven die geen test vond: zinsbouw, een doel van 20° bij een kamer van 22,3°,
een getal dat drie keer terugkwam. De bewoner zei het zo: de schaduwweergave is
voor de dataset en de cijfers; de proefomgeving is om de app nu al op kwaliteit
en gebruiksgemak te testen, zodat niet alles pas na de winter boven komt.
Gekozen op 5 oktober 2026.

*Besluit:*

- **Twee weergaven, twee taken.** `index.html` is de schaduwweergave: cijfers,
  de vergelijking met het oude systeem, de dataset. `nieuw.html` is de
  proefomgeving: de app in de ontwerptaal van besluit 71, op echte data, voor
  kwaliteit en gebruiksgemak.
- **De proefomgeving wordt de app, en blijft daarom dun.** Alles wat hij laat
  zien, komt kant-en-klaar uit de dienst: zinnen, getallen, de stand per kamer,
  de zoninval. Zoals `/api/vraag` en `/api/zon` al doen. Wat de pagina nu nog
  zelf uitrekent (de stand per kamer, de stromen, de kop) verhuist stap voor
  stap naar het bewonerscontract (76). Dan is wat getest wordt ook wat er
  straks staat, en hoeft stap F niet opnieuw te bouwen.
- **Bedienen wordt ook nu al getest.** Knoppen werken in de proefomgeving en
  zeggen wat Smart Climate zou doen, net als de assistent in fase 1 (ONTWERP
  §7): kamer, wens, tot hoe laat, en het voorstel voor later. Er gaat niets naar
  Home Assistant. Zo wordt het gebruiksgemak van bedienen getest, en ziet de
  schaduw welke opdrachten de deur uit zouden gaan.
- **In stap B gaat dan één knop om:** van "zou ik doen" naar "doe ik". Wat
  daaronder zit (de opdrachtroute, de detector van 74, opnieuw lezen en
  controleren, het piepbudget van 90) wordt in B gebouwd, maar zoveel mogelijk
  eerst in de schaduw beproefd.
- **Ook in de proefomgeving geldt besluit 88:** wat er staat, is gemeten of
  komt uit een besluit. Voorbeeldgetallen horen alleen in schetsen.

*Aangevuld 7 oktober 2026:* de stand per kamer komt uit de dienst. `/api/state`
en de besluitenstroom geven naast het onbewerkte besluit `bewoner.kamers`: per
kamer de soort, de korte stand voor de kaart ("Wacht op meer zon"), de zin van
de assistent en wat het echte apparaat doet (`residentRooms`). De pagina rekent
die niet meer zelf uit. Nog op de pagina: de kop van Thuis, de stromen in de
tekening en de tijdlijn van Waarom; die volgen.

*Later op 7 oktober: de rest van Thuis en Waarom ook.* Naast `kamers` geeft
`bewoner` nu de kop (`kop`: boven, titel, zin), de stromen in kW
(`stromen`), wat Smart Climate per apparaat zou doen (`apparaten`, en `rust`
voor de apparaten zonder iets te doen) en de woorden bij een besluit
(`besluit`: wat en waarom). `/api/vandaag` geeft bij elk besluit van vandaag
dezelfde woorden (`wat`, `waarom`). De stromen zijn zo afgerond dat ze
optellen: zon plus net is wat het huis gebruikt, en dat is de airco plus de
rest. Los afgerond zei de tekening eerder "zon 0,6, huis 0,4, 0,1 terug". Een
test eist dat dit in duizenden gegenereerde toestanden klopt. Op de pagina
staan nu geen woordenlijsten voor redenen en blokkades meer.

*Wat dit verandert aan 76:* de testpagina is niet langer alleen een prototype
dat niet verder groeit; hij is de proefomgeving die de app wordt, onder de
regel dat hij niets zelf uitrekent. Het bewonerscontract en de contracttests
blijven zoals 76 ze vastlegde.

*Gebouwd op 5 oktober 2026: het huis als navigatie.* `/api/huis` bouwt uit de
registers van Home Assistant de etages, de ruimtes met hun zone en de apparaten
erin: klimaat uit de configuratie, zonwering (één per apparaat), lampen zonder
groepen, elk met de stand in woorden. Daarvoor mag de client ook het
etageregister lezen (`config/floor_registry/list`); de leeslijst van besluit 15
blijft een lijst van leesopdrachten. Kent Home Assistant geen etages, dan is het
één etage "Huis". De proefomgeving zoomt in van huis naar etage naar ruimte
(`#huis`), de kamers op Thuis zijn aan te tikken, en elk apparaat opent een blad
met knoppen die zeggen wat er zou gebeuren: klimaat via de assistent, screens en
licht met een vaste zin. De paginatest loopt die weg door.

---

## 95. Etage, kamer en zone: een vaste opbouw in de app, herkend uit Home Assistant

*Onderwerp: configuratie en onboarding · Status: aangevuld door 112*

Op 5 oktober 2026 las de dienst voor het eerst het huis uit Home Assistant
(`/api/huis`). Het klopte maar half. De Nest hing in een gebied "Beneden" zonder
etage, de airco in "Woonkamer" op de begane grond, dus één kamer stond er twee
keer. Het merendeel van de lampen en beide screens hingen in geen enkel gebied.
Gebieden komen in Home Assistant uit allerlei koppelingen, zoals Hue, en zijn
daardoor vaak versnipperd. De bewoner trok de conclusie: een vaste opbouw in de
app, die Home Assistant als voorstel gebruikt maar er niet van afhangt.

*Besluit:*

- **Een vaste set etages:** begane grond en eerste verdieping, en als het huis
  ze heeft een tweede verdieping en "Buiten" (tuin, oprit, een zonnescherm aan
  de achterkant). Elke etage is te hernoemen, bijvoorbeeld "Beneden" of
  "Zolder". Meer soorten zijn niet nodig, en een vaste set maakt de tekening van
  het huis eenvoudig (de doorsnede: etages boven elkaar).
- **De opbouw is etage, kamer, zone,** met deze betekenis:
  - een **kamer** is wat de bewoner ziet en wat Smart Climate regelt: een naam,
    een temperatuur, apparaten;
  - een **zone** is een deel van een kamer, als die er een heeft: de keuken en
    de zithoek in één woonkamer, elk met hun eigen sensoren en apparaten op hun
    plek. Hangen er twee meters in één kamer, dan kiest de bewoner welke zone
    telt (aanvulling op 81);
  - twee ruimtes die één apparaat delen, zoals een keuken en een woonkamer met
    één airco, worden één kamer met twee zones.
  - **de regel voor de bewoner: een deur ertussen maakt een eigen kamer, open
    maakt een zone** (aangevuld 5 oktober 2026). Achter een deur mengt de lucht
    niet vanzelf: een airco in de woonkamer koelt de hal nauwelijks. Open, zoals
    keuken en zithoek, is dezelfde lucht op een andere plek. In dit huis is de
    hal met de trap daarom een eigen kamer op de begane grond, zonder regeling
    (70), en de woonkamer één kamer met de zones keuken en woonzone. Dit is ook
    de uitleg in de onboarding, zodat niemand hoeft te weten wat een zone is;
  - **regelen gebeurt per kamer.** Heeft een open ruimte twee eigen apparaten,
    elk met een eigen meter in hun eigen zone, dan kan de bewoner later kiezen
    voor "regel per zone". In dit huis is dat niet nodig: de woonkamer regelt
    als één kamer, met de meter die de bewoner kiest (81).

  Dit vervangt de betekenis van "zone" in besluit 72, waar een zone één of meer
  kamers was. In de code heet wat de regeling stuurt nog `zone` (het
  regelgebied); dat blijft intern, en de bewoner ziet het woord alleen in de
  betekenis hierboven.
- **Herkennen, voorstellen, en dan van de app.** Bij de installatie stelt de app
  de opbouw voor uit Home Assistant: etages en gebieden waar ze er zijn, en
  anders uit namen (een gebied "Zolder", een lampgroep `bg_alles`). De bewoner
  bevestigt of past aan. Daarna is de opbouw van de app en verandert er niets
  stil (72).
- **Wat nergens hoort, is een taak, geen gat.** Apparaten zonder gebied in Home
  Assistant komen bij "nog in te delen", met een voorstel waar het waarschijnlijk
  hoort ("Woonkamer 2" in de woonkamer). De bewoner deelt ze in met een tik.
- **Apparaten zijn te verplaatsen en te hernoemen,** net als kamers, zones en
  etages, in het scherm Kamers en vanuit het huis (ONTWERP §4).
- **De naam in de app is de naam overal:** in de app, op de wand, in de
  assistent, en straks in de zinnen van Assist, die de integratie uit die namen
  opbouwt (91). De naam uit Home Assistant is alleen het voorstel bij de
  installatie.

*Wat het vraagt:* in het schema `floors`, `rooms` en per apparaat een eigen naam
en plek; de kern blijft alleen regelgebieden kennen. En schrijven vanuit de
app: in het product onder de inlog (77, 80), voor de proef in dit huis met een
smalle deur zoals bij het gevoel (84), die een eigen besluit vraagt.

*Wanneer:* de opbouw en het bewerken met stap C (het model met kamers, 72). Tot
dan toont de proefomgeving het huis zoals Home Assistant het kent, en noemt hij
wat in geen gebied staat.

---

## 96. Stap C loopt naast de schaduw en B; indelen kan al in de proefomgeving

*Onderwerp: visie en principes · Status: geldig*

Stap C (het model met etages, kamers en zones, 72 en 95) stond na B, en B wacht
op een complete winter (64). Maar de opbouw van het huis hangt niet af van echt
schakelen, en de proefomgeving (94) laat juist nu zien wat er aan de opbouw uit
Home Assistant ontbreekt. Gekozen door de bewoner op 5 oktober 2026.

*Besluit:*

- **C loopt parallel** aan de schaduw (nu) en aan B (echt schakelen). Wat C
  oplevert, wordt in de proefomgeving getest zodra het er is, net als de
  assistent en het huis.
- **Indelen kan al in de proefomgeving,** via een derde smalle deur, met
  dezelfde voorzorgen als het gevoel (84):
  - naar een eigen bestand naast de dataset (`indeling.json`), nooit naar Home
    Assistant en nooit over de configuratie van het huis heen;
  - alleen wat bij de indeling hoort: de namen van de etages, de kamers met hun
    etage en zones, en per apparaat een eigen naam en een plek (kamer, zone);
  - streng gecontroleerd: alleen de vaste etages (95), alleen apparaten die
    Home Assistant kent, en een grens op het tempo en de grootte;
  - de route bestaat alleen als `main.ts` hem meegeeft, en dat doet hij alleen
    als er gelogd wordt. Elke andere route en methode blijft achter de muur;
    tests bewijzen beide.
- **Het huis gebruikt de indeling waar die er is,** en vult de rest aan uit Home
  Assistant als voorstel. Zo wordt de indeling stap voor stap van de app (95).
- **Het risico, bewust genomen:** iedereen op het thuisnetwerk of in het tailnet
  kan de indeling veranderen. Het ergste dat dat oplevert, is een verkeerde naam
  of plek; de regeling leest de indeling niet, en het bestand staat in de
  dagelijkse back-up. In het product gaat deze deur achter de inlog (77, 80).
- **Wat C verder vraagt** (de inlog, voorbeeldhuizen, en de indeling als deel
  van de configuratie zodat de regeling er ook mee werkt), volgt in deze stap,
  in deze volgorde: eerst de indeling in de proef, dan de inlog, dan het schema.

*Gebouwd op 5 oktober 2026: de indeling in de proef.* `GET`/`POST
/api/indeling` met `indeling.json` in de logmap (en in de export). Het huis gaat
altijd uit van een indeling: de eigen, of anders een voorstel uit Home Assistant
(`proposeLayout`), zodat er één weg door de code is en het voorstel precies is
wat de eerste wijziging vastlegt. Een apparaat zonder eigen plek staat in de
kamer die uit zijn gebied kwam; zonder gebied, of als die kamer weg is, bij "nog
in te delen". In de proefomgeving: "Indeling bewerken" op elk niveau, etages en
kamers hernoemen, kamers toevoegen, verhuizen en weghalen, zones aanmaken, het
regelgebied kiezen, en apparaten hernoemen en verplaatsen. Tijdens het bewerken
ververst het huis niet, zodat een veld niet leeg raakt. De paginatest loopt het
door: een etage hernoemen, een lamp indelen, een kamer toevoegen.

*Aangevuld 5 oktober 2026: lampen in groepen, en wat Home Assistant niet meer
kent.* De bewoner zette in Home Assistant de losse lampen uit die al in een groep
zaten (een Hue-zone of -kamer, of een groep van Home Assistant). Daarna gaf elk
bewaren "onbekend apparaat": de vastgelegde indeling noemde die lampen nog, en de
deur weigerde de hele indeling. Ook verdwenen de groepen uit het huis, want alleen
een groep met *verborgen* peren telde als één lamp. Nu:

- **Een groep waarvan de lampen verborgen of uitgezet zijn, is zelf de lamp** (een
  armatuur). Per peer telt de kleinste groep waar hij in zit, zodat een Hue-zone
  voor de Hue-kamer gaat en "BG alles" of "Alles" nooit als lamp telt. Een
  uitgezette groep van Home Assistant is geen peer. Een uitgezette lamp heeft geen
  toestand; noemt een Hue-groep zijn lampen alleen bij naam, dan komt die naam uit
  de registers (entiteit of apparaat).
- **"Alleen apparaten die Home Assistant kent" betekent: wat hij niet meer kent,
  valt weg,** in plaats van het bewaren te blokkeren. Een oude indeling mag een
  nieuwe nooit tegenhouden. De kamer en zone van een uitgezette lamp gaan naar de
  groep die hem nu toont, als die nog geen eigen plek had; de eigen naam van de
  lamp niet, want die hoorde bij de losse lamp. Het huis doet hetzelfde bij het
  tekenen, zodat de groep meteen staat waar zijn lampen stonden.
- **Bewust geaccepteerd:** zit een uitgezette lamp alleen in een Hue-kamer waarin
  ook zichtbare lampen staan, dan staat die Hue-kamer als lamp naast die lampen.
  De bewoner lost dat op met een eigen Hue-zone voor de uitgezette lampen.

*Aangevuld 7 oktober 2026: ook de app (F) loopt al mee.* De proefomgeving wordt
de app (94), en wat C oplevert, groeit daar al in: het huis als navigatie, het
indelen, de lampen, de assistent die uitlegt. F begint dus niet pas na D, maar
loopt nu mee en wordt na B afgemaakt. De reden van de bewoner: B wordt na de
winter bewezen, dus werk aan de app is nu geen verloren tijd, en wat de winter
aan gebruik oplevert, maakt de app beter.

## 97. Lampen aan en uit vanuit de app; "alles"-groepen zijn geen lamp

*Onderwerp: veiligheid · Status: aangevuld door 100*

Op 5 oktober 2026 werkte de indeling weer (96), maar twee dingen bleven. De
groepen "Etage 2 alles" en "Achtertuin alles" stonden als lamp in het huis: een
uitgezette lamp zat alleen nog in zo'n groep, en de kleinste groep werd dan de
armatuur. En de knoppen bij een lamp zeiden alleen "in deze proef nog niet",
terwijl de bewoner per etage en voor het hele huis alles in één keer uit wil
kunnen zetten. Besluit 92 stond licht bedienen al toe; alleen het moment lag
bij de schermen (F). De bewoner koos ervoor om het nu te doen, alleen voor
licht.

*Besluit:*

- **De app zet lampen aan en uit,** rechtstreeks via Home Assistant. Smart
  Climate regelt het licht nog steeds niet (92): dit is een knop van de bewoner,
  geen besluit van de arbiter. Per lamp aan, uit, gedimd en fel; per kamer, per
  etage en voor het hele huis "alle lampen uit". Een hele etage of het huis gaat
  nooit in één keer *aan*: dat is zelden de bedoeling, en 's nachts een
  vervelende vergissing.
- **De schrijfgrens van 15 blijft structureel, met één smalle uitzondering.**
  `HaClient` krijgt naast `allowWrites` een eigen `allowLights`. Daarmee gaat
  precies `light.turn_on` en `light.turn_off` door, en alleen met
  `light.`-entiteiten als doel: geen gebied, apparaat of label, want daar kan van
  alles onder hangen. Klimaat, screens en elke andere dienst blijven werpen;
  `allowWrites` blijft uit. Een test bewijst beide.
- **Alleen wat het huis toont.** De dienst bepaalt welke lampen een doel raakt
  (`lampsFor`): de lampen in die kamer, op die etage of in het huis, volgens de
  indeling. Wat de bewoner verborg of wat in geen kamer staat, raakt hij nooit.
  De pagina zegt alleen het doel, en rekent niets uit (76).
- **De vierde smalle deur in de muur** (na 42, 84 en 96): `POST /api/licht`,
  alleen als `main.ts` hem meegeeft, met een grens op het tempo. Achter Ingress
  staat hij standaard aan (de add-on-optie `licht_bedienen`), want daar staat de
  inlog van Home Assistant voor. Elders alleen met `HEMS_LIGHTS=1`, met een
  waarschuwing bij het starten.
- **Het risico, bewust genomen:** op de NAS heeft de weergave geen inlog, dus
  iedereen op het thuisnetwerk of in het tailnet kan dan de lampen schakelen. Het
  ergste is een lamp die aan of uit gaat; geen klimaat, geen screens. In het
  product gaat deze deur achter de inlog (77, 80).
- **Een "alles"-groep is een overzicht, geen lamp.** Een groep waarvan de naam
  "alles" zegt, of die zelf groepen bevat, wordt nooit een armatuur (96). Alles
  uit op een etage of in het huis doet de app zelf, met de lampen uit de
  indeling; zo volgt het de indeling ook als de groepen in Home Assistant
  achterlopen. Een uitgezette lamp die alleen in zo'n groep zit, kan het huis
  niet tonen. *Aangevuld 5 oktober 2026:* de pagina zei dat eerst in een
  melding, maar de bewoner had zijn lampen al zoals hij ze wilde en kon er niets
  mee; de melding is weg (de dienst noemt ze nog in `onvindbaar`). "Alles uit"
  staat nu ook per etage op het huis, en op elke kamer, etage en het huis
  altijd, ook als er niets brandt.
- **Verbergen.** In de bewerkstand kan elk apparaat verborgen worden: het
  staat dan in geen kamer, telt nergens mee en wordt nooit geschakeld. Het staat
  in de indeling (`verborgen`) en is in de bewerkstand terug te halen.
  *Aangevuld 5 oktober 2026:* "Niet tonen" bleek verwarrend: het haalde een lamp
  ongemerkt uit zijn kamer. Een apparaat in een kamer vraagt nu eerst
  bevestiging, met wat verbergen doet en hoe het terugkomt. Terughalen kan op
  een plek naar keuze, ook vanuit de kamer zelf ("Toevoegen aan deze kamer").
  Bij het indelen is een plek nu een kamer of meteen een zone erin.

*Aangevuld 7 oktober 2026: alleen de eigen pagina door de deuren.* De
QA-ronde vond dat alle vier de deuren een verzoek aannamen van elke website.
Een site die iemand in huis opent, kon een POST als gewone tekst sturen (dan
vraagt de browser niets vooraf) en zo de lampen schakelen, de indeling
overschrijven of gevoel in de dataset zetten. Dat de NAS geen inlog heeft, is
bewust voor wie er zelf bij kan, maar zo kon ook een vreemde site erbij, via de
browser van iemand in huis. Nu, voor elke deur op één plek achter de 405-muur:

- **Alleen JSON.** Een vreemde site kan dat niet sturen zonder eerst toestemming
  te vragen, en die vraag beantwoordt de dienst niet. Anders 415.
- **Een Origin moet de dienst zelf zijn**, of de host waarvoor Ingress het
  doorgaf (`x-forwarded-host`). Anders 403. Zonder Origin (een script, curl) mag
  het: dat is geen browser van een ander.

Tests bewijzen beide, en falen als de controle uit staat. Wat open blijft is
DNS-rebinding: een site die zijn eigen naam naar het adres van de NAS laat
wijzen, is voor de browser "dezelfde" herkomst. Daartegen helpt een lijst met
toegestane hostnamen; die hoort bij de inlog van stap C.

---

## 98. Uitstelbare apparaten: de droger draait op zon, via de arbiter

*Onderwerp: kern en regeling · Status: aangevuld door 101*

De bewoner wil dat slimme grootverbruikers (wasmachine, droger, vaatwasser) op
zon draaien zodra ze klaarstaan om op afstand gestart te worden. In dit huis is
er één: een Bosch-warmtepompdroger (WTX87M) via Home Connect. Het oude systeem
doet dat al met een automatisering: start bij meer dan 600 W overschot gedurende
een minuut en een verwachting van meer dan 600 W in het komende uur
(`sensor.power_production_next_hour`, Forecast.Solar), anders uiterlijk om 15:00,
alleen als "start op afstand" aanstaat, en beveiligd tegen twee keer starten.
Gekozen op 7 oktober 2026.

*Besluit:* Smart Climate neemt dat over als een eigen soort apparaat in de
arbiter, eerst in de schaduw.

- **Een uitstelbaar apparaat** draait één programma en stopt dan; het is niet
  halverwege te pauzeren. In de configuratie: de startknop, de sensor "start op
  afstand toegestaan", de status en de resterende tijd, en een geschat vermogen.
- **Eén budget.** De droger en de airco's delen het vermogensbudget en het
  stroombudget (78), met hooguit één start per beslissing (68). Zo starten ze
  niet samen op hetzelfde overschot, zoals de losse automatisering nu kan.
- **Na de start houdt hij zijn deel vast** tot het programma klaar is: hij
  kan niet terug, dus het budget rekent hem als draaiend. Hoe lang en hoeveel,
  leert de dienst uit de programmaduur die Home Connect meldt en uit wat de
  meter ziet.
- **Een eindtijd van de bewoner** in plaats van vast 15:00: "klaar voor 18:00",
  per keer, vanuit de app of de assistent. Komt er niet genoeg zon, dan start hij
  op tijd om die eindtijd te halen, ook op netstroom.
- **De machine houdt de veiligheid.** Smart Climate start alleen als de machine
  "start op afstand toegestaan" meldt: de bewoner koos een programma, sloot de
  deur en zette op afstand starten aan. Gaat de deur open of de machine uit, dan
  vervalt de aanvraag, zoals de automatisering nu ook doet.
- **Een prognose** helpt kiezen tussen nu en straks; Home Assistant heeft er al
  een (Forecast.Solar, `sensor.power_production_next_hour`). Dat sluit aan op E.
- **Schrijven is een nieuwe deur,** net als licht (97): alleen de startknop van
  een apparaat dat in de configuratie als uitstelbaar staat, en alleen als
  "start op afstand" aanstaat. Een eigen besluit en een test die bewijst dat de
  rest blijft werpen, vóór het aangaat.
- **Eerst in de schaduw:** de dienst zegt wanneer hij zou starten, naast wanneer
  de oude automatisering startte, en de proefomgeving toont het als "dit zou ik
  nu doen" (94). Zo is te zien of Smart Climate een beter moment kiest voordat
  hij iets indrukt.

*Voor dit huis:* de droger komt via twee koppelingen binnen. De bron wordt
Home Connect Alt (via HACS): die heeft een echte startknop (`start_pause`), die
de oude automatisering al gebruikt, en levert de geschatte totale duur, de
resterende tijd en de bedrijfsstatus apart. De officiële koppeling heeft
mooiere namen, maar start alleen door een programma te kiezen
(`select.droger_actieve_programma`), en dat is meer dan op de knop drukken. De
lange namen doen er niet toe: de app gebruikt zijn eigen naam (95). Valt Alt
ooit weg, dan is de officiële koppeling de terugval; het uitstelbare apparaat
kent daarom twee manieren van starten, een knop of een programma kiezen. Sinds
7 oktober schrijven de status, "start op afstand", de deur, het programma, de
duur, de resterende tijd, de voortgang en het startteken van de oude
automatisering (`input_boolean.droger_auto_gestart`) mee in `recordOnly`. Zo
laat de dataset zien wanneer de droger klaarstond en wanneer het oude systeem
hem startte. De oude automatisering blijft draaien tot stap B.

*Wanneer:* de schaduwversie kan nu, naast het werk aan de kern. Echt starten
hoort bij B, met de schrijfdeur.

*Aangevuld 7 oktober 2026: gebouwd in de schaduw.* De configuratie kent
`deferrables`: per apparaat "start op afstand", de bedrijfsstatus, een geschat
vermogen (600 W, de drempel van de oude automatisering) en de uiterlijke
starttijd (15:00). Die twee sensoren gingen daarmee van `recordOnly` naar echte
invoer. Elke beslissing zegt per apparaat wat het nu zou doen (`deferrables` in
de uitleg, `uitstel` in het logboek):

- **zou starten** als het overschot na de airco's het draagt, gerekend zoals de
  arbiter een start rekent, of na de uiterlijke starttijd ook zonder zon;
- **wacht** als er te weinig zon is, als er deze ronde al een airco startte of
  de stabilisatie loopt (68), als de hoofdzekering het niet draagt (78, ook na
  15:00), in de failsafe, of in handmatig;
- **niet klaar** zonder "start op afstand", of als het programma klaar is;
  **draait** als het programma loopt.

De kern geeft geen opdracht voor de droger; een test en de invarianten bewaken
dat, net als dat hij nooit zou starten zonder "start op afstand". Thuis toont
het bij "Wat ik nu zou doen": "zou nu starten: er is genoeg zon over", of "wacht
op zon, uiterlijk tot 15:00". Nog na te gaan: welke waarden Home Connect Alt
voor de bedrijfsstatus geeft. De herkenning is ruim ("Run", "Finished", ook in
de lange vorm), en de dataset legt de echte waarden vast zodra de droger draait.
Nog niet: de prognose voor het komende uur (E), en een eindtijd die de bewoner
per keer kiest.

---

## 99. Bedienen vraagt een inlog, met je Home Assistant-account; kijken blijft open

*Onderwerp: veiligheid · Status: geldig*

Stap C begint met de inlog. Er waren vier schrijfdeuren (42, 84, 96, 97) en er
komen er meer (100, 101). Op de NAS kon tot nu toe iedereen op het thuisnetwerk
of in het tailnet ze gebruiken, en voor een tweede woning kan dat niet. Gekozen
door de bewoner op 7 oktober 2026, uit drie opties: een koppelcode per
apparaat, één wachtwoord voor het huis, of het account van Home Assistant.

*Besluit:*

- **Inloggen gaat via Home Assistant.** De app stuurt je naar het inlogscherm
  van je eigen Home Assistant; die stuurt je terug met een code, en de dienst
  vraagt Home Assistant wie je bent. Het token van Home Assistant gooit hij
  daarna weg: de dienst bewaart geen wachtwoord en geen token van de bewoner,
  alleen een eigen sessie.
- **De rol volgt uit Home Assistant** (80): een beheerder daar is beheerder
  hier; ieder ander is bewoner.
- **Alleen bedienen vraagt een inlog.** Kijken blijft open op het thuisnetwerk
  en in het tailnet, zoals nu. Lampen, scènes, gevoel en "klaar voor" vragen een
  bewoner; de indeling en de onboarding een beheerder.
- **Een sessie blijft lang geldig,** zodat de tablet aan de muur één keer
  inlogt. Een cookie dat alleen de eigen pagina meekrijgt (`HttpOnly`,
  `SameSite=Strict`); in het bestand staat alleen een vingerafdruk, niet de
  sessie zelf. Uitloggen kan altijd.
- **Alleen bekende hostnamen.** De dienst antwoordt alleen op een IP-adres,
  `localhost`, een naam zonder punt, en namen op `.local`, `.lan`,
  `.home.arpa` of `.ts.net`, plus wat de beheerder erbij zet. Dat sluit
  DNS-rebinding uit, het punt dat na 97 open bleef.
- **Achter Ingress** (de add-on) heeft Home Assistant de bezoeker al
  vastgesteld; daar is geen tweede inlog.

*Wanneer:* nu, als eerste stap van C.

*Gebouwd op 7 oktober 2026.* `web/auth.ts` en de routes `/auth/login`,
`/auth/callback`, `/auth/logout` en `/api/sessie`. De toegang is verplicht bij
het starten van de webserver (`sessions`, `ingress` of `open`), zodat een
nieuwe opstelling er niet per ongeluk zonder komt. De paginatest draait met de
echte inlog en een sessie in de browser; webtests lopen de hele inlog door
(naar Home Assistant en terug, een terugweg naar een andere site, uitloggen,
een onbekende hostnaam), en een nep-Home Assistant bewijst dat het token na het
inloggen wordt weggegooid. Op de NAS: `HEMS_HA_LOGIN_URL` als Home Assistant
onderweg onder een andere naam bereikbaar is, `HEMS_HOSTS` voor een eigen
hostnaam (`deploy/README-NAS.md`).

---

## 100. Licht in kleur en wit, en de scènes van Hue (aanvulling op 97)

*Onderwerp: veiligheid · Status: geldig*

De bewoner wil een lamp ook in kleur of in een tint wit zetten, en de scènes
uit Hue kiezen (schetsen `Lamp` en `Lamp-wit`). Gekozen op 7 oktober 2026.

*Besluit:*

- **Kleur en wit gaan door de deur van 97,** `light.turn_on`, met twee vaste
  velden erbij: `color_temp_kelvin` (binnen wat de lamp kan) en `hs_color`
  (tint 0–360, verzadiging 0–100). Geen andere velden.
- **Scènes krijgen een eigen, even smalle deur:** alleen `scene.turn_on`, alleen
  voor een `scene.`-entiteit die bij een ruimte in de indeling hoort (via de
  Hue-kamer of -zone waar hij bij hoort). Een scène van een ruimte die er niet
  is, `hue.activate_scene` en elke andere dienst blijven werpen; een test
  bewijst het.
- **Wat een lamp kan, zegt Home Assistant** (`supported_color_modes`, het bereik
  in kelvin). Een lamp zonder kleur krijgt geen tab Kleur.
- **Welke scène actief is,** zegt Hue niet. "Gekozen" is de laatst aangezette
  in die ruimte.
- Zoals bij 97: dit is een knop van de bewoner, geen besluit van Smart Climate,
  en hij vraagt een inlog (99).

*Gebouwd op 7 oktober 2026.* De client laat met `allowScenes` alleen
`scene.turn_on` op één `scene.`-entiteit zonder velden door, en bij het licht
alleen de velden helderheid, kelvin en kleur (ook geen `flash` of `effect`).
Het huis zegt per lamp wat hij kan (`licht`: het bereik in kelvin, of hij kleur
kan, en de stand van nu) en per ruimte de scènes: een Hue-scène via de naam van
zijn Hue-kamer (de groep van een lamp, een Hue-groep die zelf als armatuur in de
ruimte staat, of de naam van de ruimte), een scène uit Home Assistant via de
meeste van zijn lampen. `POST /api/scene` zet alleen een scène die zo bij een
ruimte staat; de rest krijgt 404. In de app staan wit en kleur als tabs in het
blad van de lamp, met de scènes van de ruimte eronder; de paginatest kiest
blauw, daglicht en een scène, en kijkt wat er naar Home Assistant zou gaan.
Scènes staan aan met dezelfde schakelaar als het licht (`HEMS_LIGHTS=1` of
Ingress).

*Aangevuld 7 oktober 2026, na de eerste dag op de NAS:* er stond nog geen
enkele scène, omdat de dienst de stand van `scene.`-entiteiten niet bijhield.
Nu wel, en een scène die niet via zijn Hue-kamer bij een ruimte past, hangt
aan het gebied van het Hue-apparaat waar hij bij hoort (192 scènes in dit
huis). Kleur kiest de bewoner nu op een kleurenwiel: de hoek is de tint, de
afstand tot het midden de verzadiging; bij loslaten gaat de kleur naar de lamp.
De vaste kleuren blijven eronder als snelkeuze.

*Aangevuld 7 oktober 2026, 's avonds:* een ruimte als de achtertuin heeft in
Hue meerdere kamers en zones (achtertuin, tuinhuis, border), elk met zijn eigen
"Energie" en "Lezen": 58 scènes, veel dubbel. Een lamp toont nu alleen de
scènes van zijn eigen Hue-groep, de laatst gebruikte eerst, zes per groep met
"Alle scènes" erachter; actief is per groep. De plaatjes uit de Hue-app geeft
Home Assistant niet door. In plaats daarvan krijgt een scène een bolletje in
zijn eigen kleuren: zes tellen na het aanzetten kijkt de dienst naar de lampen
van zijn groep en onthoudt hun kleur (`scene-kleuren.json`, alleen lezen). Tot
dan hebben de standaardscènes van Hue vaste kleuren bij hun naam. Wie de plaatjes
van de Hue-app zelf heeft, zet ze in `logs/scene-plaatjes/`; de app toont ze op
de naam van de scène, met een tabel van de Nederlandse naar de Engelse namen
van de bekende verzameling. Smart Climate levert ze niet mee: ze zijn van
Philips Hue (`deploy/README-NAS.md`).

*Aanvulling 8 oktober 2026.* De scènes staan niet meer in het blad van de kamer,
maar pas bij een lamp: alleen die van zijn eigen Hue-groep, uit het hele huis.
Zit een lamp in meer groepen (het tuinhuis en de hele achtertuin), dan staat
elke naam er één keer, die van de kleinste groep. Een lamp zonder kleur krijgt
alleen de witte scènes: de witte standaardscènes, en een eigen scène waarvan de
lampen wit lieten zien. Een scène uit de galerij van Hue telt als kleur.

---

## 101. "Klaar voor" bij de droger is per keer te kiezen

*Onderwerp: kern en regeling · Status: geldig*

Besluit 98 wilde een eindtijd van de bewoner in plaats van vast 15:00. Gekozen
op 7 oktober 2026: per keer, in de app (schets `Apparaten`), niet als vaste
instelling.

*Besluit:*

- **Een vijfde smalle deur** bewaart alleen de eindtijd: per uitstelbaar
  apparaat een tijd van vandaag of morgen, in een eigen bestand naast de dataset
  (`uitstel.json`). Nooit naar Home Assistant.
- **De kern rekent ermee:** de uiterlijke start is de eindtijd min de duur van
  het programma (die Home Connect meldt); zonder eindtijd geldt `latestStart`
  uit de configuratie. Is het programma klaar of gaat de deur open, dan vervalt
  de eindtijd.
- Vraagt een inlog als bewoner (99).

*Gebouwd op 7 oktober 2026.* `POST /api/uitstel` met `{ id, klaarVoor: "18:00" }`
(of `null`) bewaart de eindtijd in `uitstel.json`, alleen als het apparaat
klaarstaat; de tijd is de eerstvolgende keer dat het zo laat is, vandaag of
morgen, in de tijdzone van het huis. De dienst beslist daarna meteen opnieuw.
De duur komt uit `programDuration` in de configuratie (Home Connect meldt
"2:48"); is die onbekend, dan rekent de kern met drie uur. De hoofdzekering
gaat ook dan voor (78). De app heeft een scherm Apparaten (vanaf Thuis, "Wat ik
nu zou doen"): wat de droger doet, hoe lang het programma duurt, en "klaar
voor" met de tijden die nog te halen zijn, of een eigen tijd. "Nu starten" uit
de schets komt pas met B.

*De droger draaide op 7 oktober voor het eerst met de dataset erbij*, en dat
liet twee dingen zien die de kern van 98 nog niet wist:

- **Hij zegt het in het Nederlands:** "Klaar" bij aanzetten, "Loopt" tijdens
  het programma, een tel "Afgerond" en dan weer "Klaar". "Loopt" kende de kern
  niet, dus bleef hij "zou starten" zeggen terwijl de droger draaide. "Klaar"
  betekent gereed, niet afgelopen.
- **"Start op afstand" blijft na het programma aanstaan.** Daardoor bleef de
  kern de hele middag "zou starten" zeggen: onder B had hij de lege droger
  opnieuw aangezet. De oude automatisering voorkomt dat met
  `input_boolean.droger_auto_gestart`. Nu: wisselde de status ná het
  klaarzetten (met een minuut speling) weer naar "Klaar", dan heeft er sindsdien
  een programma gedraaid, en is het apparaat "klaar, het programma is
  afgelopen" tot de bewoner opnieuw klaarzet. Dat leest de kern uit wanneer
  beide meetpunten in Home Assistant wisselden, zonder eigen geheugen; een
  haperende koppeling valt zo aan de veilige kant (niet starten). Met dezelfde
  data van die dag zegt de kern nu: 15:20 zou starten (na 15:00, zoals de oude
  automatisering), 15:51 draait, 15:55 klaar, en daarna niets meer.

---

## 102. Opbrengst: meters en prijzen in de app, de cijfers uit Home Assistant

*Onderwerp: weergave · Status: geldig*

De bewoner wil terugkijken: per dag, week, maand of jaar wat het huis gebruikte,
waar het vandaan kwam, wat het kostte, per apparaat, en vergelijken met eerder
(schetsen `Opbrengst-terug` en `Wand-Opbrengst`). Gekozen op 7 oktober 2026.

*Besluit:*

- **De app bewaart de meters en de prijzen** (`energie.json` naast de dataset),
  te beheren via Instellingen bij Opbrengst. Wie Home Assistant al heeft
  ingericht, neemt het Energie-dashboard in één keer over; wie nieuw is, kiest
  de meters uit een lijst en vult de prijzen in. Daarna is de app de bron, ook
  als het dashboard later verandert. Bewaren vraagt een beheerder (99).
- **De cijfers komen uit de statistiek van Home Assistant**
  (`recorder/statistics_during_period`), in kWh en m³, dus ook van vóór Smart
  Climate. Alleen lezen: de client kent drie nieuwe leesopdrachten
  (`energy/get_prefs`, `recorder/list_statistic_ids`,
  `recorder/statistics_during_period`), en alleen de laatste twee krijgen
  velden mee.
- **Zelf gebruikt** is opgewekt min teruggeleverd, per uur; verbruik is van het
  net plus zelf gebruikt. **Per apparaat** telt het aandeel eigen zon van elk
  uur: een schatting, maar dezelfde regel voor elk apparaat. Wat de apparaten
  met een eigen meter niet verklaren, is "rest van het huis".
- **Kosten** met de prijzen uit de app; teruglevering tegen de stroomprijs
  zolang er gesaldeerd wordt, tenzij er een eigen vergoeding staat. Vanaf 2027
  vraagt dat een vergoeding, en met E de prijs per uur.
- **Vergelijken:** twaalf periodes tot en met deze, met dezelfde een jaar
  eerder ernaast; bij een jaar de jaren zelf.

*Gebouwd op 7 oktober 2026.* De dienst: `GET /api/energie` (wat er staat, het
voorstel uit Home Assistant en de meters om uit te kiezen), `POST /api/energie`
en `GET /api/opbrengst?soort=maand&datum=2026-09-01`, met de verschillen tegen
de periode ervoor en een jaar eerder erbij. De app: Opbrengst met de drie
getallen, de zonnepanelen, de sankey (stroom, of stroom en gas in kWh), per
apparaat, per uur, dag of maand, vergelijken en kosten, met "Wat Smart Climate
had gescheeld" onderaan; en een scherm Meters en prijzen achter Instellingen,
met "Overnemen" uit Home Assistant en zelf kiezen. Zonder meters zegt
Opbrengst eerst waar je ze instelt. De oude cijfers van het meekijken (−% voor
de airco's) staan nu in die onderste kaart.

*Wat het dashboard van dit huis liet zien (7 oktober):* Home Assistant gebruikt
de nieuwe opbouw, met een netbron per tarief (afname en teruglevering samen)
en de prijs van teruglevering in velden met `_export`; het overnemen leest
beide opbouwen. En bij de kosten staat de meter zelf als kostensensor
(`stat_cost` is de kWh-meter), waardoor Home Assistant elke kWh en m³ als een
euro telt. Dat neemt Smart Climate niet over: Meters en prijzen zegt het, en
vraagt de prijzen. `GET /api/energie` geeft het dashboard ook letterlijk terug
(`dashboard`), om zoiets na te gaan.

---

## 103. De zon en je aansluiting: de app vraagt, de regeling vult aan waar de configuratie zwijgt

*Onderwerp: configuratie en onboarding · Status: aangevuld door 117*

Een paar dingen haalt de app niet uit Home Assistant: waar de panelen liggen
(93), hoe zwaar de hoofdzekering is (78), welk stroomcontract je hebt, en of
een apparaat dat op afstand kan starten op zon mag beginnen (98). De schets
`Onboarding-Zon` vraagt ze op één scherm. De onboarding van besluit 41 schrijft
alleen bij een lege installatie, dus voor een huis dat al draait deed hij
hiermee niets. Gekozen door de bewoner op 7 oktober 2026.

*Besluit:*

- **De antwoorden staan in de app** (`aansluiting.json` naast de dataset, en in
  de export), te beheren via Bediening › Je huis › Zon en aansluiting.
  Bewaren vraagt een beheerder (99).
- **De regeling leest mee waar de configuratie zwijgt.** Zonder `grid` worden
  de zekering en de gevonden stroommeters het stroombudget (78); een apparaat
  op zon dat de configuratie niet noemt, wordt uitstelbaar, met "uiterlijk om
  15:00 beginnen" (98). Wat de configuratie wel noemt, gaat altijd voor, en de
  app zegt dat erbij ("uit je configuratie").
- **Bij het starten, door het eigen schema.** De dienst vult de configuratie
  aan voordat de regeling begint, en alleen als het resultaat door
  `parseSiteConfig` komt; anders draait hij zoals het bestand zegt, en zegt hij
  waarom. Een nieuw antwoord gaat in bij de volgende start, en de app zegt dat
  ook. Elk besluit blijft zo na te gaan: de vingerafdruk van de configuratie
  (66) is die van de aangevulde.
- **De pagina stuurt alleen antwoorden.** Welke stroommeters en apparaten erbij
  horen, zoekt de dienst zelf in Home Assistant, zoals bij de onboarding (42);
  de pagina krijgt en noemt nooit een entiteit (45). Een fase telt alleen met
  één duidelijke meter, liefst die van het net: een verkeerde meter kost meer
  dan geen meter (41). Kies je drie fasen terwijl de meter er één geeft, dan
  bewaart de app het, maar rekent de regeling er nog niet mee, en zegt de app
  waarom.
- **Apparaten herkent de dienst aan "op afstand starten toegestaan"**, met de
  bedrijfsstatus en de duur van het programma van hetzelfde apparaat. De soort
  komt uit de naam of de modelcode (bij Bosch en Siemens is WT een droger, WA of
  WG een wasmachine); het vermogen is een schatting per soort (droger 700 W,
  vaatwasser 1.800 W, wasmachine 2.000 W, voor het opwarmen).
- **Hoe snel de zonnesensor is, meet de dienst** (89): de mediaan tussen twee
  nieuwe waarden, overdag, vanaf zes metingen. Trager dan eens per twee minuten
  zegt de app, met de lokale weg voor het merk.
- **De ligging van de panelen** (voorkant, achterkant, beide, plat, weet ik niet,
  en het aantal; bij beide kanten per kant) gaat nog niet naar de regeling: die is voor de meting
  van besluit 93, die de bewoner daarna laat bevestigen.
- **Het stroomcontract** (vast, dynamisch, weet ik niet) wordt bewaard voor E;
  wat stroom en gas kosten, blijft bij Meters en prijzen (102).
- **Gewone teksten.** Het scherm spreekt niet als "ik", maar zegt kort wat iets
  is en wat de regeling ermee doet (op verzoek van de bewoner, 8 oktober 2026).

*Gebouwd op 7 oktober 2026.* `GET`/`POST /api/aansluiting` (alleen met een
logmap en een configuratie; elke andere route blijft achter de muur, en bewaren
vraagt een beheerder), `web/aansluiting.ts` met de herkenning, het bewaren, het
aanvullen en het overzicht voor de pagina, en in `main.ts` het aanvullen bij
het starten en de meting van de zonnesensor. In de app: het scherm met het huis
van opzij (de panelen kleuren mee met je keuze), de zonnesensor, de
hoofdzekering, het stroomcontract en de apparaten op zon; liggend in twee
kolommen. Getoetst met het echte configuratiebestand: zonder `grid` en
`deferrables` vult het aan tot een configuratie die het schema aanneemt, en met
blijft hij gelijk.

*Voor dit huis:* de zekering (1 × 35 A) en de droger staan al in de
configuratie; het scherm toont ze als "uit je configuratie". Als eind 2026 de
drie fasen komen, kan `grid` uit de configuratie, en zet de bewoner 3 × 25 A in
de app; de dienst vindt dan zelf de drie stroommeters van de P1-meter.

---

## 104. Ontwerp 2 is de maatstaf, en de schets is de code

*Onderwerp: visie en principes · Status: geldig*

Op 8 oktober 2026 lag de app op de NAS naast de schetsen van besluit 71, en het
verschil was groot. De schetsen toonden het mooiste moment (12:09, volle zon),
de app moest elk moment tonen en had de lege momenten nooit ontworpen. Het huis
was klein gemaakt en in een kader gezet, er was per besluit een kaartje
bijgekomen en nooit een weggehaald, en wat bij het meekijken hoort ("je huidige
regeling", "besluit 08:06") stond tussen wat de bewoner moet zien. En de
schetsen waren getekende plaatjes: de app moest ze opnieuw bouwen, en onderweg
ging verloren wat ze goed maakte. Gekozen door de bewoner op 8 oktober 2026.

*Besluit:*

- **Ontwerp 2 (`design/app2/`) is de maatstaf** voor de app, in plaats van de
  schetsen van besluit 71. De regels van 71 blijven gelden: elk getal is te
  herleiden, bij elk besluit een reden, eerst de lelijke momenten.
- **De schets is de code.** Het huis, de stijlbasis, de sankey en de navigatie
  staan in `frontend/kit/` (eerst `design/app2/kit/`; de NAS checkt `design/`
  niet uit), en de schetsen en de app gebruiken diezelfde bestanden, de app met
  de echte gegevens. Het huis in de app is dus letterlijk het huis uit de schets.
- **Het huis in 3D, in de lucht van het moment.** Een opengewerkt huis dat zich
  opbouwt uit wat het huis heeft (de indeling, panelen, buitenunit, batterij,
  laadpaal met auto); wat er niet is, staat er niet. De achtergrond is de lucht
  van dat moment: dag, avond, nacht, bewolkt, winter. Het vermogen staat bij de
  panelen, niet bij de zon.
- **Vijf tabs:** Thuis, Vandaag, Apparaten, Opbrengst, Assistent. Bedienen
  gebeurt in het huis (etage, kamer, apparaat), de modus staat bovenin Thuis,
  en instellen zit achter het tandwiel, ook de indeling (de bewerkstand). Vandaag
  is Waarom en Plan samen.
- **De wand scrolt nooit.** De tablet draait schermvullend (kiosk). De
  wandschermen zijn gebouwd op de maat van de schetsen, 1280 × 800, en worden
  als geheel gelijkmatig naar het scherm geschaald: zo past alles altijd, en is
  het pixel voor pixel de schets. De telefoon mag langer zijn en schaalt mee.
- **Geen concessies aan het beeld; wel eerlijk over de data.** Wat er nog niet
  is, wordt niet nagemaakt: het plan en de voorstellen komen met het thermisch
  model (D), batterij en auto alleen als ze er zijn, en klimaat en screens
  bedienen tot stap B als "zo zou ik het doen". De lampen en scènes werken echt.
- **Elke stap wordt naast de schets gelegd.** De paginatest maakt van de echte
  app schermafdrukken op de maten van de schetsen; een stap is pas klaar als ze
  overeenkomen.

*Volgorde:* de bouwstenen en Thuis op de wand en de telefoon; de navigatie en
Apparaten; Kamer met de bladen voor screen, airco, thermostaat en lamp, en de
rondleiding; Vandaag en Opbrengst; Instellingen, de indeling, Leren en Wat je
huis kan.

*Aanvulling 8 oktober 2026.* De indeling staat in `indeling.html` (schets
Wand-Indeling): de etages links, de etage zonder dak in het midden, een blad
met de gekozen kamer of het gekozen apparaat rechts, en onderin wat nog
nergens staat. Een apparaat sleep je naar een kamer in het huis of in het blad,
of je tikt erop en kiest de kamer. Elke wijziging gaat meteen door dezelfde
deur als voorheen (besluit 96); "Ongedaan maken" zet de vorige indeling terug.
Etages toevoegen kan niet: de vier etages liggen vast (besluit 95).

*Aanvulling 8 oktober 2026, later.* Zon en aansluiting (`aansluiting.html`) en
Meters en prijzen (`meters.html`) staan nu ook in ontwerp 2. Daarmee stond alles
uit de proef van besluit 71 in de app, en is `nieuw.html` weggehaald. Wie na het
inloggen geen terugweg heeft, komt op `thuis.html`. Zonder verbinding (besluit
82) toont elke pagina de laatste stand grijs, met sinds wanneer.

*Aanvulling 8 oktober 2026, 's avonds.* De wand is 800 hoog en minstens 1280
breed. Is het scherm breder dan 16:10, zoals een tablet waar de balken van het
systeem van de hoogte afgaan (de Tab A9+: 1280 × 728), dan groeit de wand mee
in de breedte, tot 1700, en vult hij het scherm. Smaller dan 16:10 blijft hij
1280 breed en past hij op de breedte.

---

## 105. Het weer van de komende dagen, met wat de panelen dan leveren

*Onderwerp: weergave · Status: geldig*

Op 8 oktober 2026 vond de bewoner dat de voorspelling op Thuis "totaal niet
klopt". Er was geen voorspelling: de stippellijn bij Vandaag is wat de panelen
bij een heldere lucht zouden leveren, een bovengrens. Op een bewolkte dag ligt
die ver boven wat er komt, en dan leest hij als een voorspelling die mislukt.
Home Assistant heeft Buienradar al, met per dag een verwachting voor vijf dagen.
De bewoner vroeg of die samen met wat het huis weet bruikbaar is, en of het weer
van vandaag aan te tikken is. Gekozen op 8 oktober 2026.

*Besluit:*

- **De dienst leest de verwachting van Buienradar** uit Home Assistant: per dag
  de hoogste en laagste temperatuur, de kans op regen en op zon, en de soort
  weer; en het weer van nu. Herkend aan de vaste `translation_key`
  (`sunchance_1d`), niet aan de naam en nooit aan de `unique_id`, want daar zet
  Buienradar de ligging van het huis in (besluit 93). `_1d` is morgen: de feed
  begint bij de volgende dag.
- **Wat de panelen leveren, komt van het huis.** Per dag de opbrengst bij een
  heldere lucht zoals het huis die van zijn eigen panelen leerde (besluit 93),
  maal een deel bij de zonkans. Dat deel begint als schatting (een vijfde bij
  0 %, negen tiende bij 100 %) en schuift mee met wat de panelen werkelijk
  haalden: elke tien minuten bewaart de dienst de zonkans van morgen
  (`weer-verwachting.json`, in de export), en na die dag ligt hij naast de echte
  opbrengst. Na vijf dagen weegt het geleerde even zwaar als de schatting.
- **Vandaag** is wat er al was, plus de rest van de dag naar hoe hij tot nu toe
  verliep en wat gisteren voor vandaag werd verwacht; hoe later op de dag, hoe
  zwaarder het eerste weegt. Is er voor vandaag nog niets verwacht, dan telt het
  weer van nu. Per kwartier wordt dat de stippellijn bij de zon van vandaag, op
  Thuis en Apparaten: een echte verwachting in plaats van het gunstigste geval.
  Alleen zonder weer staat er nog de zon bij een heldere lucht, met die naam.
- **Nakijken en beter worden.** Elke tien minuten bewaart de dienst wat hij
  voor morgen verwacht, in kWh en per kwartier; de laatste stand voor
  middernacht telt. Na die dag staat in het weerblad "Hoe goed het klopte":
  verwacht naast werkelijk, met de gemiddelde afwijking, en op Vandaag legt
  Gisteren de verwachte lijn naast wat er kwam. Met tien of meer dagen met
  genoeg verschil in zonkans leert het huis het hele verband tussen zonkans en
  opbrengst, in plaats van alleen een factor op de schatting; hoe meer dagen,
  hoe zwaarder dat weegt.
- **Op Thuis** opent de knop met de buitentemperatuur het weer: vandaag en de
  vijf dagen erna, elk met een balk voor de opbrengst. De kaart Vandaag noemt
  naast wat er is opgewekt wat er verwacht wordt.
- **Alleen om te tonen.** De regeling gebruikt het weer niet; dat komt met de
  tarieven en de prognoses (E).

---

## 106. De camera's bekijken in de app, alleen lezen en alleen met inlog

*Onderwerp: veiligheid · Status: geldig*

Op 8 oktober 2026 vroeg de bewoner of de camera op de oprit in de app te
bekijken is, met de vloeiende stream. Home Assistant heeft twee Reolink-camera's
(de oprit en de deurbel), elk met een vloeiende en een heldere stream, en
dezelfde camera's nog eens via de Synology-NAS. Gekozen op 8 oktober 2026.

*Besluit:*

- **Een camera is een apparaat in het huis,** in de kamer van zijn apparaat in
  Home Assistant, of waar de bewoner hem indeelt. Per camera één: de vloeiende
  stream (Reolink `sub`), licht genoeg voor de tablet; een tweede integratie
  met dezelfde camera telt niet dubbel, het buienradarplaatje is geen camera.
- **Alleen lezen.** De dienst haalt het beeld op bij Home Assistant
  (`camera_proxy` voor één plaatje, `camera_proxy_stream` voor live) met zijn
  eigen token, en geeft het door. Het token komt nooit bij de pagina. Er gaat
  niets naar een camera toe; de schrijfgrens van besluit 97 blijft gelijk.
- **Kijken vraagt de inlog van besluit 99,** ook al is de rest van de weergave
  open op het thuisnetwerk en in het tailnet: het beeld van de oprit en de
  voordeur is privé. Alleen camera's die het huis toont, en hooguit vier live
  beelden tegelijk. Het beeld wordt nergens bewaard.

---

## 107. Aanbellen: het beeld van de deurbel meteen op het scherm

*Onderwerp: weergave · Status: geldig*

Op 8 oktober 2026 vroeg de bewoner om bij aanbellen het scherm aan te zetten
en het beeld van de deurbel direct te tonen. De Reolink-deurbel meldt een
bezoeker met een eigen melder (`visitor`) op hetzelfde apparaat als de camera.
Gekozen op 8 oktober 2026.

*Besluit:*

- **Gaat de bezoekersmelder van een deurbel aan,** dan stuurt de dienst over
  de live-stroom een melding "aanbellen" met welke camera, naar elke open
  pagina. Die toont het live beeld schermvullend, tot iemand het sluit of na
  twee minuten.
- **Het beeld vraagt de inlog van besluit 106,** ook bij aanbellen: zonder
  inlog staat er de weg ernaartoe. De tablet aan de wand moet dus ingelogd
  zijn om het beeld te tonen.
- **Het scherm aanzetten** kan een webpagina niet. In Fully Kiosk Browser wel,
  via zijn eigen JavaScript (`fully.turnScreenOn`); draait de app daarin, dan
  gaat het scherm aan. In een gewone browser niet.
- **Alleen lezen,** zoals bij 106: de dienst leest de melder en het beeld, en
  stuurt niets naar de deurbel.

---

## 108. Https in het tailnet, met Tailscale serve

*Onderwerp: weergave · Status: aangevuld door 160*

Op 8 oktober 2026 stond de app geïnstalleerd op de telefoon, maar met de
adresbalk erboven. Chrome laat een geïnstalleerde app alleen schermvullend
draaien over https, en de NAS geeft de app over gewone http (besluit 23). De
uitzondering in `chrome://flags` maakt installeren mogelijk, niet de balk weg.
Een reverse proxy was uitgesloten (besluiten 23 en 99), omdat die op de NAS de
app naar buiten zet. Gekozen op 8 oktober 2026.

*Besluit:*

- **Tailscale serve, nooit Funnel.** De NAS geeft de app binnen het eigen
  tailnet ook over https, onder zijn naam daar (`<nas>.<tailnet>.ts.net`), met
  een echt certificaat van Tailscale. Alleen apparaten in het tailnet kunnen
  erbij; van buiten is er niets bijgekomen. Funnel, dat het adres op internet
  zet, blijft uitgesloten.
- **Serve wijst alleen naar de dienst** op de NAS zelf (`http://127.0.0.1:8099`).
  Geen andere poort, geen andere dienst, geen portforward.
- **De dienst hoeft er niets voor te veranderen.** Hij antwoordt al op een naam
  op `.ts.net`, leest https uit wat Tailscale meegeeft (`X-Forwarded-Proto`),
  geeft Home Assistant dat adres bij het inloggen, en zet het cookie dan
  `Secure`. Een test legt dat vast.
- **Inloggen gaat per adres.** Wie de app via het https-adres opent, logt daar
  één keer opnieuw in; een sessie op het gewone adres telt daar niet.
- **Het gewone adres blijft,** voor de tablet aan de wand en voor wie thuis
  zonder Tailscale kijkt.

*Kosten:* het certificaat komt in de openbare certificaatlogboeken, met de naam
van de NAS en van het tailnet erin. Bereikbaar is het daardoor niet, maar de
namen zijn niet meer geheim. Wie dat niet wil, geeft de NAS in Tailscale eerst
een nietszeggende naam.

---

## 109. Wat van dit huis is, wordt een instelling; camera's en de deurbel eerst

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 8 oktober 2026 vroeg de bewoner om na te gaan wat er in de code op dit huis
is toegesneden, met het oog op de add-on voor anderen (53, 77, 91). De
regeling zelf staat al in de configuratie van het huis (9, 40, 41): zones,
apparaten, vermogen, schema, zekering en zon. Wat op dit huis leunde, zat in de
weergave en in wat de dienst vanzelf koos: elke camera met het beeld dat
Reolink "sub" noemt, een deurbel die alleen een Reolink-melder kon zijn, vaste
namen van de airco's in Thuis, "woonkamer" als eerste kamer, twaalf panelen op
het dak ook zonder panelen. Gekozen op 8 oktober 2026.

*Besluit:*

- **Wat per huis verschilt, legt de app vast als instelling,** niet de code.
  Zoals de indeling (96) en de aansluiting (103): de dienst doet een voorstel
  uit wat Home Assistant heeft, de bewoner past het aan, en de app schrijft het
  weg in een eigen bestand naast de dataset. Zonder bestand geldt het voorstel.
  Nooit naar Home Assistant.
- **Camera's en de deurbel zijn een functie** (`functies.json`, Instellingen ›
  Camera's en deurbel): welke camera's de app toont en met welk beeld, en welke
  melder de deurbel is, bij welke camera, of het scherm aangaat en hoe lang het
  beeld blijft staan. Een deurbel herkent de dienst van verschillende merken:
  de bezoekersmelder van Reolink, een gebeurtenis met de klasse deurbel (Ring,
  Nest en andere), en als kandidaat wat alleen zo heet. Een gebeurtenis belt bij
  een nieuw tijdstip, niet als hij terugkomt na een storing. Opslaan vraagt een
  beheerder; alleen camera's en melders die Home Assistant kent, komen erin.
- **De weergave noemt niets bij naam wat uit het huis komt.** Namen van
  apparaten komen uit het huis (`/api/huis`), de eerste kamer is die met een
  regeling op de laagste etage, en het dak toont het aantal panelen dat de
  bewoner opgaf, of een schatting uit de wattpiek; zonder panelen geen panelen.
- **Een buitenruimte heeft een soort** in de indeling: oprit, tuin, terras of
  balkon, met een auto of een tuinhuis erbij. Alleen op de etage Buiten. Zonder
  keuze doet de dienst een voorstel uit de naam, en de tekening volgt het.
- **Wat nog op dit huis leunt,** en in welke volgorde het een instelling wordt,
  staat in `docs/universeel.md`.

---

## 110. Prijzen zoals op het contract: normaal en dal, salderen, vaste posten

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 9 oktober 2026 liet de bewoner zijn contract en jaarafrekening zien: een
normaal- en een daltarief, vaste kosten per dag en per jaar (levering,
netbeheer, de vermindering energiebelasting als aftrek, terugleverkosten), een
vergoeding voor wat boven het verbruik wordt teruggeleverd, en andere bedragen
vanaf 2027. De app kende één prijs per kWh en vaste kosten per maand. Gekozen
op 9 oktober 2026.

*Besluit:*

- **De prijzen zoals het contract ze noemt** (`tarief.ts`): de totaalprijs per
  kWh (met belasting en btw), normaal en dal of één tarief; gas per m³; en
  vaste posten met een naam, een bedrag, per dag, maand of jaar, voor stroom of
  gas. Een vermindering of korting telt als aftrek.
- **Welke kWh dal is, zegt bij voorkeur de meter:** tarief 1 van de slimme meter
  is het daltarief, tarief 2 normaal. De dienst raadt het aan de naam, de
  bewoner kan het per meter omzetten. Telt het net niet per tarief, dan gelden
  de tijden: op werkdagen van 23 tot 7 uur (in Noord-Brabant en Limburg vanaf
  21 uur), en het weekend en de feestdagen.
- **Teruglevering tot 2027:** salderen tegen het eigen tarief. Wat over een heel
  jaar meer terugging dan er verbruikt werd, krijgt de vergoeding "boven
  verbruik"; in een kortere periode is dat niet te weten en telt alles als
  gesaldeerd. **Vanaf 1 januari 2027:** een vergoeding min terugleverkosten per
  kWh, zonder salderen.
- **De kosten in Opbrengst tellen de vaste posten mee,** over de dagen die al
  voorbij zijn, net als de jaarafrekening. Per apparaat rekent Opbrengst met
  wat een kWh van het net in die periode gemiddeld kostte.
- **Wat een oudere instelling had, blijft gelden:** de vaste kosten per maand
  worden in het scherm een post.

*Nog niet:* een korting op de leveringskosten (zoals 7,5 % Thuisvoordeel), en
een dynamisch contract met een prijs per uur (stap E).

---

## 111. Licht bedienen en de weerbron zijn een functie

*Onderwerp: configuratie en onboarding · Status: geldig*

Tweede stap uit `docs/universeel.md` (besluit 109). Licht bedienen stond aan
of uit in `.env` op de NAS (`HEMS_LIGHTS`, besluit 97), en het weer kwam alleen
van Buienradar (besluit 105). Gekozen op 9 oktober 2026.

*Besluit:*

- **Licht en scènes bedienen** staat bij Instellingen › Functies aan of uit.
  `HEMS_LIGHTS` blijft de grens van de installatie: zonder die kan de app niets
  aanzetten, alleen zeggen dat het niet mag. Staat het in de app uit, dan
  weigeren de deuren van licht en scènes, en tonen de bladen geen schakelaars.
- **De weerbron is een keuze:** Buienradar als die er is, of elke weerentiteit
  van Home Assistant (zoals Met.no, standaard in elke installatie). Van een
  weerentiteit volgt de dienst de dagverwachting via `weather/subscribe_forecast`,
  een abonnement dat alleen leest, net als de toestanden. De zonkans is dan 100
  min de bewolking, of een schatting uit de toestand als de bron geen bewolking
  geeft.
- **Een ouder bestand** zonder deze keuzes krijgt het voorstel: Buienradar als
  die er is, en licht aan.
- **De tekening volgt het huis:** liggen de panelen op beide kanten (Zon en
  aansluiting), dan staan ze op beide dakvlakken; het open vlak toont ze als
  omtrek, zodat de zolder zichtbaar blijft. Welke etage onder het schuine dak
  ligt, kies je in de indeling (`dak`); zonder keuze raadt de dienst het aan de
  naam of aan drie lagen.

---

## 112. Etages vrij toevoegen, met de vaste namen als voorstel

*Onderwerp: configuratie en onboarding · Status: geldig*

Besluit 95 legde vier etages vast: tweede verdieping, eerste, begane grond en
buiten. Een kelder, een appartement op één laag of een huis met meer lagen
paste daar niet in (`docs/universeel.md`, punt 4). Gekozen door de bewoner op
9 oktober 2026: vrij toevoegen, met de vaste namen.

*Besluit:*

- **De indeling heeft een eigen volgorde van etages** (`volgorde`, van boven
  naar beneden). Een etage heeft een id en een naam. De vaste etages zijn het
  voorstel: 3e verdieping, 2e, 1e, begane grond en kelder; een eigen etage, zoals
  een vliering, mag ook. Buiten is er altijd en staat los van de volgorde.
- **Zonder eigen volgorde** blijft het zoals het was: de gewone drie etages,
  met een kelder erbij als een kamer daar staat. Een bestaande indeling hoeft
  niets.
- **Uit Home Assistant** wordt een etage onder de grond de kelder.
- **In de indeling** voeg je een etage toe (een vaste op zijn plek, een eigen
  bovenaan of onderaan), zet je hem hoger of lager, en haal je een lege etage
  weg.
- **Waar de oprit en de tuin bij horen,** blijft de begane grond; zonder, de
  laagste etage die geen kelder is.

*Nog niet:* de tekening zet een kelder als laagste laag op de grond, niet eronder.

---

## 113. Meer buitenruimtes in de tekening, en alleen weer van weerdiensten

*Onderwerp: weergave · Status: geldig*

Punt 1 uit `docs/universeel.md`: de tekening had plek voor één oprit en één
tuin. En in de keuze voor het weer stond Buienradar twee keer (de sensoren en
de eigen weerentiteit), en het weer van een Formule 1-circuit. Gekozen op 9
oktober 2026.

*Besluit:*

- **Elke soort buitenruimte heeft een eigen plek:** de oprit links met de auto,
  de tuin rechtsachter met het tuinhuis, een terras rechts naast het huis (tegels,
  een tafel met stoelen), een voortuin voor het huis (gras met een haag), en een
  balkon aan de zijgevel op de eerste verdieping. Een tweede tuin wordt de
  voortuin. Brandt er een lamp in de ruimte, dan gloeit die plek. Elke plek is aan
  te tikken. Een balkon staat alleen in de tekening van het hele huis, want
  ingezoomd op de begane grond is er geen eerste verdieping.
- **Voortuin is een soort** in de indeling, naast oprit, tuin, terras en balkon.
- **Weerbronnen zijn alleen weerdiensten** (Met.no, KNMI, OpenWeatherMap en
  andere): een weerentiteit van een andere koppeling staat niet in de keuze.
  Buienradar staat er één keer, met zijn vijf dagen uit de sensoren.

---

## 114. Inrichten: een wizard over de schermen die er al zijn

*Onderwerp: configuratie en onboarding · Status: geldig*

Punt 9 uit `docs/universeel.md`, naar voren gehaald door de bewoner op 9
oktober 2026. Een nieuwe gebruiker moest zelf uitzoeken welke schermen er
waren en in welke volgorde.

*Besluit:*

- **Inrichten** (`inrichten.html`) zet de stappen op een rij: welkom, je huis,
  klimaat, zon en aansluiting, meters en prijzen, functies, klaar. Elke stap
  ziet aan de dienst of hij gedaan is (een eigen indeling, antwoorden, prijzen,
  vastgelegde functies) en zegt in een paar regels wat er al is.
- **Geen tweede scherm per onderwerp:** een stap opent de pagina die er al is,
  met `?inrichten=<stap>`. Daar staat dan een balk terug naar het overzicht en
  door naar de volgende stap. De wizard schrijft zelf niets.
- **De ingang:** bij Instellingen bovenaan Je huis, en op Thuis een knop
  Inrichten zolang het huis nog het voorstel uit Home Assistant is.
- **Klimaat** toont nog alleen wat de configuratie heeft; het nakijken per
  apparaat komt met punt 5 (de klimaatapparaten herkennen).

---

## 115. De assistent leest een vraag in eigen woorden, met een woordzoeker

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 9 oktober 2026: een invulveld is makkelijker dan
alleen vaste knoppen, en het moet ook vragen over de app begrijpen, zoals hoe
je de indeling aanpast of waar je de prijzen invult.

*Besluit:*

- **Een woordzoeker, geen taalmodel** (`web/woordzoeker.ts`). Hij maakt de
  tekst gewoon (kleine letters, zonder accenten en leestekens), zoekt woorden
  en kamernamen, en kiest het onderwerp met de meeste treffers. Sterke woorden
  ("prijzen", "indeling", "deurbel") tellen dubbel; "waar" of "hoe" geeft een
  vraag over de app voorrang.
- **Over het huis** wordt het een van de vaste vragen (nu, waarom met de kamer,
  straks, zon, of een wens voor een kamer), met precies hetzelfde antwoord als
  de knoppen. De regel van besluit 88 blijft: elk getal heeft zijn bron. Een
  wens als "koel de zolder" schakelt niets, zoals eerder.
- **Over de app** komt er een kort antwoord met een knop naar de pagina:
  indeling, meters en prijzen, zon en aansluiting, functies, inrichten,
  inloggen, opbrengst, vandaag, apparaten, bedienen en het meekijken.
- **Niets herkend:** een paar voorbeelden om op te tikken.
- **In de dienst:** `api/vraag?v=vrij&tekst=…`, hooguit 200 tekens. De tekst
  wordt niet bewaard en niet gelogd.
- **Op de pagina:** het veld staat in de balk onder de Assistent, boven de vaste
  vragen; op de telefoon bovenaan. Vanaf Thuis opent "Tik om iets te vragen"
  de Assistent met de cursor in het veld (`#typ`).

---

## 116. Het jaar van Opbrengst begint op de startdatum van het contract

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 9 oktober 2026: een energiecontract loopt zelden
van 1 januari, en de jaarafrekening ook niet. Een jaar dat op 1 januari begint,
past daar niet op.

*Besluit:*

- **Startdatum contract** staat bij Meters en prijzen, bij de vaste kosten.
  Leeg is 1 januari, zoals eerder.
- **Het jaar in Opbrengst** loopt van die dag tot dezelfde dag een jaar later,
  en heet dan "15 maart 2026 – 14 maart 2027"; in de vergelijking "2026/27".
  De grafiek begint bij de maand van de startdatum. Een maand die het jaar in
  tweeën deelt, is één staaf.
- **De jaarafrekening rekent mee:** wat je over een heel jaar meer teruglevert
  dan je verbruikt, telt over het contractjaar.
- Een startdatum op 29 februari begint elk jaar op 1 maart.

*Aangevuld 9 oktober 2026: wat er niet gemeten is.* Naast de jaarafrekening
over 18 november 2024 tot en met 17 november 2025 (€ 1.999,91) gaf de app
€ 1.116,58. Het verschil zat niet in de prijzen: de historie in Home Assistant
begint pas in februari 2025, dus de koudste drie maanden ontbraken (ruim 1.000
kWh van het net en zo'n 450 m³ gas). Met het verbruik van de afrekening en de
prijzen uit de app komt het uit op ongeveer € 2.013; het restje is het verschil
tussen de prijzen van 2025 en van nu. Daarom:

- **Opbrengst zegt het als de meting later begint dan de periode:** "Gemeten
  vanaf 5 februari 2025: 286 van de 365 dagen".
- **De vaste kosten tellen dan alleen over de gemeten dagen,** zodat het totaal
  bij het verbruik past in plaats van een jaar vaste kosten op een half jaar
  verbruik.
- De app rekent met de prijzen van nu, ook voor een eerder jaar. Prijzen per
  contractjaar bewaren is niet gekozen: de jaarafrekening is daar de bron voor.

---

## 117. De hoofdzekering stel je in de app in; die gaat voor de configuratie

*Onderwerp: configuratie en onboarding · Status: geldig*

Gezien door de bewoner op 9 oktober 2026: Inrichten zei "hoofdzekering nog niet
ingevuld", bij Zon en aansluiting stond hij op "Ingesteld" maar was hij niet te
kiezen, omdat de configuratie van het huis hem al noemde en die voorging
(besluit 103). Voor een app die op elk huis moet werken, hoort de keuze in de
app.

*Besluit:*

- **De zekering uit de app gaat voor.** Noemt de configuratie de stroommeters
  per fase al, dan blijven die meters en komt alleen de zekering uit de app.
  Anders gebruikt de dienst de stroommeters die hij zelf vond, zoals eerder.
- **Op de pagina** staat de waarde uit de configuratie voorgekozen, met de
  zin dat hij daar vandaan komt. Tik je hem aan en sla je op, dan is hij
  ingesteld; "Ingesteld" staat er alleen bij een keuze in de app.
- **Inrichten** noemt de zekering uit de configuratie, met "nakijken", in
  plaats van "nog niet ingevuld".
- Zoals elk antwoord van deze pagina gaat hij in bij de volgende herstart.
- Apparaten op zon blijven zoals ze waren: de configuratie gaat voor.

---

## 118. Uitrollen via een eigen add-on-bibliotheek op GitHub

*Onderwerp: uitrol en beheer · Status: geldig*

Gevraagd door de bewoner op 9 oktober 2026: kan de hele app, dienst en
pagina's, via HACS, zodat bijwerken via GitHub vanzelf gaat? Vastgelegd als
plan voor na de winter, als de dataset klaar is. Er wordt nu niets gebouwd.

*Waarom niet HACS voor de app:* HACS installeert alleen wat ín Home Assistant
draait: integraties in Python en kaarten voor het dashboard. Smart Climate is
een eigen dienst met een eigen opslag; die kan HACS niet draaien.

*Besluit:*

- **De app komt als add-on uit een eigen, openbare add-on-bibliotheek op
  GitHub.** De bewoner voegt bij de add-on-winkel één keer het adres toe en
  installeert Smart Climate. Elke nieuwe versie verschijnt in Home Assistant
  als "update beschikbaar".
- **Kant-en-klare images, geen bouw door de Supervisor.** GitHub bouwt bij een
  nieuwe versie de image voor amd64 en aarch64 en zet hem in het eigen
  pakketregister. De add-on noemt die image, dus de Supervisor hoeft niets te
  bouwen. Daarmee vervalt het platslaan van besluit 37 voor de winkel.
- **Alleen wat groen is.** Een versie komt in de bibliotheek pas als de CI
  groen is, zoals de NAS nu alleen stable volgt.
- **De instellingen staan in de map van de add-on** (indeling, aansluiting,
  meters en prijzen, functies), en gaan mee in de back-ups van Home Assistant.
- **HACS alleen voor de integratie** van besluit 91: de vragen voor Assist en
  de stand per kamer als sensoren. Die zit niet in Home Assistant zelf, dus tot
  dan via HACS.
- **Zonder Supervisor** (Home Assistant in Docker of los) draait dezelfde image
  met een docker compose-bestand, zoals nu op de NAS.

*De broncode wordt openbaar* (de bewoner, 9 oktober 2026): Home Assistant is
open source, en Smart Climate wordt het ook. Voor het openbaar maken:

- **Een schone start.** De geschiedenis van deze repository bevat dit huis: de
  configuratie met namen en entiteiten, het logboek met besluiten over dit
  huis, en exports uit Home Assistant die nooit gecommit mochten worden. De
  openbare repository begint daarom met een schone geschiedenis, of deze wordt
  eerst nagelopen en opgeschoond.
- **Dit huis wordt een voorbeeld.** De configuratie van dit huis gaat eruit of
  wordt een voorbeeldhuis zonder echte namen; alles wat per huis verschilt, staat
  in de instellingen van de app (`docs/universeel.md`).
- **Een licentie kiezen.** Home Assistant gebruikt Apache 2.0.

*Nog te kiezen:* de licentie, en de naam van de bibliotheek.

*Wanneer:* bij het product (H), na de winter, als het moment van echt schakelen
er is (besluit 64) en de add-on weer de plek wordt om te regelen (53).

---

## 119. Kamers krijgen een soort; ingezoomd staat de inrichting erin

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026: de kamers wat opleuken, met een
standaard inrichting per soort kamer en de apparaten er nog in. Het startscherm
werd daarvan te druk; ingezoomd viel het goed. De zorg was het universele stuk:
een andere naam voor een kamer, een kelder, een overloop, een kinderkamer.

*Besluit:*

- **Elke kamer binnen heeft een soort:** woonkamer, woonkamer met open keuken,
  keuken, eetkamer, slaapkamer, kinderkamer, logeerkamer, badkamer, toilet,
  hal of overloop, werkkamer, wasruimte, berging of zolder, of leeg. De soort
  staat in de indeling (`soort`) en is te kiezen bij Indeling. Zonder keuze
  doet de dienst een voorstel uit de naam, de zones, de etage en wat er staat
  (`roomTypeFromNames`): een kamer met een keuken en een zithoek als zones is
  een woonkamer met open keuken, een kelder een berging, een kamer met een
  droger een wasruimte. Zegt niets iets, dan geen voorstel. Inrichten noemt
  de kamers waarvan de soort niet uit de naam volgt.
- **Het startscherm blijft zoals het was.** De meubels en een icoon bij de naam
  staan alleen ingezoomd (Kamer), en op de telefoon nergens.
- **De apparaten blijven te zien.** Een meubel blijft weg bij het raam (behalve
  een aanrecht, wastafel, bureau of trap ervoor), de airco, de cv en het
  witgoed, past onder het schuine dak, staat niet onder een te laag hangende
  lamp, en houdt afstand van de muur van de buurkamer. Heeft het grootste
  meubel de achterwand nodig, dan hangt de radiator aan de zijmuur. Witgoed
  maakt een kamer een wasruimte, tenzij hij leeg is gekozen.
- **Een trap alleen met een etage erboven.** Ingezoomd geeft de pagina dat mee,
  want dan staat er maar één etage in de tekening.
- **Getoetst:** een proef in de paginatests richt elke soort in, in drie
  breedtes, met en zonder radiator, airco, cv, lampen en witgoed, op een
  gewone etage en onder het dak. De tekening geeft elk meubel en apparaat als
  blok, en geen meubel mag door een apparaat, een ander meubel, een muur of het
  dak.

*Aangevuld 14 oktober 2026: een kelder blijft bij de begane grond.* Gekozen
door de bewoner: een kelder of trapkast hoort bij de begane grond, er komt geen
tekening onder de grond. Een gebied dat Home Assistant onder de grond zet,
staat in het voorstel op de begane grond; een trapkast of meterkast is een
smalle berging. Wie toch een eigen etage Kelder maakt, ziet die als onderste
etage.

---

## 120. Een liggende telefoon toont de tabletweergave

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026. Tot nu toe kreeg elk scherm
smaller dan 900 punten de telefoonweergave, ook een liggende telefoon.

*Besluit:*

- **De telefoonweergave alleen staand,** of op een heel smal scherm (smaller
  dan 560 punten). Een liggende telefoon krijgt de wand van de tablet, verkleind
  tot hij past. Draai je hem rechtop, dan wisselt de pagina meteen.
- **De wand blijft naast de inkeping** van een liggende telefoon: de schaal en
  het midden rekenen met de vrije ruimte (safe-area).
- De regel staat in `basis.js` en in het script in de `<head>` van elke pagina.

---

## 121. Schermen bedien je in de app; alleen Somfy io mag later in de regeling

*Onderwerp: veiligheid · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026. De screens zijn Somfy io: ze
melden hun stand terug. Het zonnescherm is Somfy RTS: het krijgt een opdracht,
maar zegt nooit waar het is; in de app stond het daarom op "onbekend". De
bewoner wil ze in de app kunnen bedienen; de oude regeling doet er niets mee.

*Besluit:*

- **Een vijfde smalle deur, voor de bewoner:** `cover.open_cover`,
  `close_cover`, `stop_cover` en `set_cover_position` met alleen een stand,
  op precies één `cover.`-entiteit (`allowCovers` in de client, `/api/scherm`
  achter de inlog als bewoner). Geen kanteling, geen groep, geen gebied, een
  grens op het tempo, en alleen schermen die het huis toont. Een test bewijst
  dat klimaat en elke andere dienst blijven werpen.
- **Aan of uit:** de installatie volgt licht bedienen, tenzij `HEMS_SCREENS`
  het anders zegt; bij Functies zet de bewoner het aan of uit.
- **Terugmelding:** de dienst ziet aan Home Assistant of een scherm zijn stand
  terugmeldt (`assumed_state`, of geen stand en geen open of dicht). Zonder
  terugmelding (RTS) zegt de app "zonder terugmelding", tekent hij geen stand
  en biedt hij alleen open, dicht en stop.
- **De regeling doet niets met de schermen** en leest hun stand niet als
  zeker. Komen schermen later in de regeling (stap B), dan alleen schermen met
  terugmelding, zoals Somfy io: RTS is daar te onbetrouwbaar voor.

---

## 122. Batterijen bij het apparaat, en de verwarming met haar aanvoertemperatuur

*Onderwerp: configuratie en onboarding · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, als voorbereiding op de
radiatorknoppen van Sonoff (Zigbee) en een slimme cv-regeling.

*Besluit:*

- **Batterijen:** de dienst zoekt per apparaat in Home Assistant de sensor met
  de klasse batterij en een percentage, en neemt de laagste. Bij elk apparaat
  in een kamer staat "batterij 62%". Het huis geeft ook de lijst van alle
  batterijen, de leegste eerst, met de kamer.
- **Onder de 10%** meldt het startscherm het met een pil: de leegste, of hoeveel
  het er zijn, met een tik naar de kamer.
- **De verwarming** staat bij Zon en aansluiting: cv-ketel, warmtepomp,
  stadsverwarming of weet ik niet, en de aanvoertemperatuur op de ketel (25 tot
  90 °C, leeg als je hem niet weet). Het thermisch model gebruikt het later:
  een lagere aanvoer warmt een kamer langzamer op.

---

## 123. Meten met: per kamer zelf de sensoren kiezen

*Onderwerp: configuratie en onboarding · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026: per kamer zelf één of meer
sensoren kiezen die de regeling gebruikt. Tot nu toe stond de sensor per zone
vast in de configuratie van dit huis; voor een app die op elk huis moet werken,
hoort die keuze in de app. Het is ook de voorbereiding op de radiatorknoppen.

*Besluit:*

- **Bij Indeling, per kamer: "Meten met".** Eerst de thermometers en
  klimaatapparaten in de kamer, en een sensor uit een andere kamer kan erbij;
  hooguit zes. De keuze staat in de indeling (`meten`).
- **Meer sensoren: het gemiddelde van wat meldt.** Een sensor die wegvalt, telt
  niet mee; meldt er geen enkele, dan is de temperatuur onbekend. Een
  klimaatapparaat meet met zijn eigen thermometer (`current_temperature`).
- **In een kamer met een regeling** vult de dienst bij het starten de
  configuratie aan (`temperatures`, de eerste ook als `temperature`), zoals de
  antwoorden over de aansluiting (103). Een nieuwe keuze gaat dus in bij de
  volgende start. **In een kamer zonder regeling** toont de app meteen het
  gemiddelde.
- **De dataset weet het.** Bij elke start waarbij de sensoren per zone anders
  zijn dan de vorige keer, schrijft de dienst ze met de tijd in
  `sensoren.ndjson` naast de dataset. Zo weet de analyse vanaf wanneer welke
  sensor telde.
- **De radiatorknop** (Sonoff via Zigbee) komt hier straks als bron bij. Hij
  hangt naast de radiator en meet vaak te warm; daarom kiest de app hem niet
  vanzelf.

*Hersteld op 15 oktober 2026 (versie 0.14.2):* bij Meten met een
apparaat van de regeling kiezen, zoals de Nest of de airco, telde niet: de
indeling bewaart het onder zijn eigen naam ("nest") en de regeling zocht een
sensor met die naam. Nu meet de regeling met de entiteit erachter, toont het
huis het gemiddelde, en neemt de regeling een andere sensor meteen over: met
de stand van nu volgt ze andere entiteiten zonder herstart, en het logboek
krijgt hun beginstand.

---

## 124. Op de tablet: volle vakken schuiven, het toetsenbord verschuift niets, en "zou" in de schaduw

*Onderwerp: weergave · Status: geldig*

Gezien door de bewoner op de Tab A9+ aan de muur (Fully Kiosk), 14 oktober
2026: rechts op Thuis stond meer dan er paste en dat kon niet schuiven; bij
Instellingen viel Functies buiten beeld; als het schermtoetsenbord kwam of
ging, zoomde de wand in of uit; en de badkamer heette "verwarmt" terwijl de
thermostaat uit stond.

*Besluit:*

- **De wand schuift nooit, een vol vak wel.** De kolom rechts op Thuis, de
  kolommen bij Instellingen, links en rechts bij Opbrengst en het raster bij
  Apparaten schuiven binnen hun vak, ook met een vinger in een kiosk-browser
  (`overflow-y: auto`, `touch-action: pan-y`, het schuiven blijft in het vak).
- **Het schermtoetsenbord is geen nieuwe stand.** Komt het in beeld (zelfde
  breedte, minder hoog, en je typt), dan houdt de wand zijn maat en schuift hij
  alleen omhoog tot het veld zichtbaar is. Gaat het weg, dan staat alles weer
  op zijn plek. In het script in de `<head>` en in `basis.js`.
- **In de schaduw zegt een kamer "zou".** De korte stand per kamer en de kop
  op Thuis zeiden "Verwarmt" en "De zolder wordt gekoeld" als Smart Climate dat
  zou doen. Tijdens de schaduw is dat nu "Zou verwarmen" en "De zolder zou
  koelen"; "verwarmt" alleen als het apparaat het echt doet, zodra het huis zelf
  schakelt.
- **Batterijen:** de dienst houdt nu ook de standen van batterijsensoren bij;
  zonder die standen bleef de lijst van besluit 122 leeg.

---

## 125. Het screen zoals de schets, en Opbrengst onthoudt wat al uitgerekend is

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026.

*Besluit:*

- **Het screen zoals in de schets Wand-Bedienen.** Bij een screen dat zijn stand
  terugmeldt en er een kan kiezen (Somfy io) sleep je de greep onder aan het
  doek omhoog of omlaag; loslaten stuurt de stand. Daaronder Open, Half, de
  stand van nu en Dicht. Een scherm zonder terugmelding (Somfy RTS) houdt Open,
  Stop en Dicht, zonder greep.
- **Opbrengst onthoudt per periode.** De sleutel is het begin van de periode,
  dus elke datum in hetzelfde jaar vindt hetzelfde. Een afgelopen periode
  verandert niet meer en blijft tot de meters of prijzen veranderen. De lopende
  periode komt meteen uit wat er is, en wordt op de achtergrond opnieuw
  uitgerekend als hij ouder is dan twee minuten. Na de eerste vraag rekent de
  dienst dag, week, maand en jaar van vandaag alvast uit. Hooguit honderd
  periodes, de oudste eruit.

---

## 126. Radiatorknoppen en ander klimaat buiten de configuratie: zien en vastleggen

*Onderwerp: meten, data en analyse · Status: geldig*

De bewoner koppelde op 14 oktober 2026 de eerste van zes Sonoff-radiatorknoppen
(TRVZB, Zigbee) aan Home Assistant. Het huis toonde alleen de klimaatapparaten
uit de configuratie; de knop stond nergens, en het logboek volgde hem niet.

*Besluit:*

- **Elk klimaatapparaat staat in het huis,** ook als de configuratie het niet
  noemt: met wat het meet, het doel, en wat het echt doet. Een knop staat
  altijd op verwarmen; "verwarmt" en "draait" alleen als hij werkelijk brandt
  (`hvac_action`), anders "staat klaar". Alleen kijken: klimaat bedient Smart
  Climate pas in stap B. Zo staat de knop ook in "Meten met" (123).
- **Een radiatorknop** herkent de dienst aan het type in Home Assistant (TRV,
  thermostatic, radiator), of aan een merk van knoppen bij een apparaat dat
  alleen kan verwarmen. Hij toont hoe hij gekoppeld is: via ZHA zegt de app wat
  Zigbee2MQTT erbij geeft (de klepstand, en later de temperatuur van de kamer
  naar de knop). Meldt hij hoe ver de klep open staat, dan staat dat erbij.
- **Het logboek volgt elk klimaatapparaat** (`climate.*`), met gemeten en
  ingestelde temperatuur en `hvac_action`, voor het thermisch model (D). Het is
  geen aanleiding om opnieuw te beslissen.

---

## 127. Het weer van Open-Meteo, de batterijlijst, en een apparaat via twee koppelingen

*Onderwerp: meten, data en analyse · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026.

*Besluit:*

- **Open-Meteo, zonder Home Assistant.** Elk uur bewaart de dienst de
  verwachting per uur voor twee dagen (buitentemperatuur, vocht, bewolking,
  zon, wind, regenkans) in `weer-uren.ndjson`, voor het thermisch model (D).
  Open-Meteo is ook een weerbron om uit te kiezen, en het voorstel als Home
  Assistant geen weer heeft. Alleen de ligging op één decimaal gaat de deur uit
  (besluit 90), nooit in een logregel. Bij Functies kan het bewaren uit.
- **De batterijlijst** opent met een tik op de pil op Thuis. Alleen kleine
  apparaten in huis, ook knoppen die de app verder niet gebruikt (Hue). Geen
  telefoons of tablets (`mobile_app`, `fully_kiosk`), en geen thuisbatterij,
  omvormer of auto: herkend aan `energy_storage`, `distance`,
  `battery_charging`, vermogen én energie samen, of het merk.
- **Eén apparaat via twee koppelingen** (zoals LG ThinQ en SmartThinQ) staat één
  keer in het huis: dezelfde naam, of dezelfde ruimte en hetzelfde type.

---

## 128. Wat je koos blijft staan, het zonnescherm, het weer per uur en een bredere wand

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026.

*Besluit:*

- **Wat je koos blijft staan** tot Home Assistant het doorgeeft: een lamp
  hooguit acht tellen, een screen twee minuten. Een lamp meldt zich pas na een
  tel of twee als aan; zonder dit sprong de schakelaar even terug.
- **Een scherm zonder terugmelding** (Somfy RTS) toont de laatste opdracht, uit
  de app of uit Home Assistant, met "volgens de laatste opdracht" erbij. Na stop
  of een herstart is die weg, en een afstandsbediening hoort niemand. Een
  zonnescherm (`awning`) vouw je uit en klap je in.
- **Het weer per uur** van Open-Meteo (127) staat onder Vandaag in het weerblad,
  de komende 24 uur, 's nachts met een maan. Geeft de eigen buitensensor niets,
  dan komt de buitentemperatuur van Open-Meteo, en anders het weer in woorden.
- **Een bredere wand dan 1280** (een liggende telefoon): een derde van wat erbij
  komt gaat naar de rechterkolom of het blad, de rest naar het huis, dat in het
  midden van zijn vak staat.
- **Schuifbalken** zijn smal, in de kleur van de app, en alleen te zien als je
  over het vak beweegt of erin werkt.
- **De airco aan de achterwand** hangt verder van de rechtermuur, zodat hij in
  beeld niet over de hoek met de volgende kamer valt.

---

## 129. Drogen en het filter van de airco, gekleurd licht, en wat er nog wegviel

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026.

*Besluit:*

- **Drogen** staat bij een airco die het kan (`dry` in Home Assistant), naast
  koelen en verwarmen. Net als die twee zegt de assistent wat het huis zou doen;
  drogen heeft geen doel.
- **Het filter** van een airco staat in zijn blad: in procenten, of in uren als
  de koppeling alleen dat geeft, ook van een tweede koppeling van hetzelfde
  apparaat (SmartThinQ naast LG ThinQ). Onder 10% staat er net als bij een
  batterij een melding op Thuis, met een tik naar de airco. Een filter is geen
  batterij.
- **Een gekleurde lamp** heeft in het huis een kap in zijn kleur en een sterkere
  gloed; 's avonds kleurt de kamer mee.
- **Een screen dat je sleept** blijft staan waar je het losliet, tot Home
  Assistant de nieuwe stand meldt; voorheen sprong het in de app terug naar open.
- **Meters** staan niet meer in het blad van een kamer: welke sensoren meten kies
  je bij Indeling (123), en het gemiddelde staat bovenaan.
- **Vandaag op Thuis** opent de dag, **Straks** opent de assistent met de uitleg,
  en de bol onderin vraagt de assistent wat het huis nu doet.
- **Boven en onder** houdt de wand vrij van de balken van het systeem; op een
  liggende telefoon viel de onderkant weg achter de balk met de veegstreep.
- **De tijdlijn van Vandaag** volgt de breedte van zijn vak en houdt zijn hoogte;
  op een bredere wand groeide hij anders mee in de hoogte en vielen Eerder en
  Later onderin van het scherm.

---

## 130. Instellingen in zes groepen, en comfort zet je in de app

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, met de schetsen
`Wand-Instellingen`, `Wand-Instellingen-Energie` en `Wand-Instellingen-Comfort`
in `design/app2`. Alles achter het tandwiel was moeilijk te vinden, omdat er
veel later bij kwam.

*Besluit:*

- **Comfort zet de bewoner in de app,** in `comfort.json` naast de dataset: per
  kamer verwarmen onder en koelen boven, per dagdeel (dag, nacht, afwezig,
  vakantie), nooit warmer dan, en voorrang; en de uren van de dagdelen.
  Voorverwarmen volgt de dag. Net als 103 en 123 over de configuratie gelegd en
  door het eigen schema; wat de app zegt, gaat voor. Anders dan die twee gaat
  het meteen in: de regeling neemt het over zolang ze dezelfde entiteiten volgt
  (`ShadowRunner.setConfig`). Er gaat niets naar Home Assistant. De deur
  `/api/comfort` vraagt een bewoner.
- **Camera's:** heeft een camera eigen beelden van zijn merk, dan geen beeld
  via een tweede koppeling zoals de Synology; dat gaf hier geen beeld.
- **Instellingen in zes groepen:** Je huis, Comfort, Energie, Regeling,
  Functies, en App en toegang. Bovenaan wat er nog mist, met een knop er direct
  naartoe (een stroomprijs, een zekering, apparaten zonder kamer), en een
  zoekveld. Elke groep heeft één opbouw: links de delen met hun stand, in het
  midden het gekozen deel, rechts waarvoor het nodig is en waar je het vindt.
  Wat je verandert, wordt meteen bewaard; er is geen opslaan-knop meer.
- **Energie** voegt Zon en aansluiting en Meters en prijzen samen: het contract
  en de prijzen stonden op twee pagina's. De oude adressen sturen door.
  Apparaten op zon staan bij **Regeling**, met wie wat regelt. Inloggen, je
  gegevens en de versie staan bij **App en toegang**.
- **Weg of verplaatst:** "Wat het huis al weet" (nu Leert nog bij Wat je huis
  kan), Comfort per kamer als alleen-lezen lijst, het weer van Buienradar als
  eerste keuze (Open-Meteo voorop, de rest onder "Andere bron"), en knoppen
  voor licht en screens die de installatie niet toestaat.
- **Wat je huis kan** toont elke functie, voor elk huis, met een stand: Werkt,
  Kijkt mee (tot het zelf regelt, besluit 64), Leert nog, Vul in (een instelling
  mist), Staat uit, of wat er nodig is (een batterij, een laadpaal, een ander
  contract). Een tik geeft het blad: wat het is, wat het nu doet, hoe en
  wanneer het werkt. "Haal er meer uit" rekent met de eigen meters, zoals wat
  een thuisbatterij vanaf 2027 oplevert; een schatting, geen belofte. Er staat
  niets in over wat er in Smart Climate nog moet komen.

---

## 131. Versie 0.9.0, één naam per kamer, en wat na een grondige test niet klopte

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, na een grondige test, met de
schetsen `Wand-Huis-kan`, `Wand-Indeling-Warmte`, `Wand-Instellingen-Comfort`,
`Wand-Meldingen`, `Wand-Gevoel`, `Wand-Inrichten`, `Wand-Film` en
`Wand-Rondleiding` in `design/app2`. Die schetsen horen bij dit besluit en de
volgende (verwarmen en koelen per kamer, voorrang per seizoen, meldingen,
inrichten in één keer); dit besluit is het eerste deel: wat nu niet klopt.

*Besluit:*

- **Een versienummer:** 0.9.0. Het eerste getal gaat omhoog bij een grote stap
  (1.0 is de dag dat het huis zelf regelt, besluit 64), het tweede bij iets
  nieuws, het derde bij een reparatie. De bron is `backend/src/version.ts`, met
  per versie wat er nieuw is in gewone taal; een test houdt de nummers van de
  dienst en de weergave gelijk. `/api/health` en het nieuwe `/api/versie`
  geven het nummer, en of Smart Climate als add-on draait of op een eigen
  server. App en toegang toont het met "Wat is er nieuw". Elke versie krijgt
  in git een markering `v<nummer>`.
- **Eén naam per kamer:** wat de app laat zien, heet zoals in de indeling. Een
  zone krijgt de naam van de kamer die hem regelt, een apparaat de naam die de
  bewoner het in Indeling gaf, en de zones staan in de volgorde van het huis
  (`withLayoutNames`). Alleen voor de app; de regeling rekent met de id's. In
  een zin krijgt een gewoon kamerwoord "de" ("de zolder"), een eigen naam niet
  ("Beneden"); een apparaat houdt "de" ("de Nest").
- **De etages:** naast elkaar van beneden naar boven, buiten achteraan; onder
  elkaar zoals het huis staat, de zolder boven.
- **De airco in de tekening** op ware grootte (zo'n 90 bij 30 centimeter), hoog
  onder het plafond en nooit voor het raam. Past hij niet naast het raam, dan
  hangt hij aan de zijmuur. Een test bewaakt het raam.
- **Comfort:** per dagdeel een schakelaar voor verwarmen en een voor koelen. Het
  kruisje om uit te zetten werkte wel, maar viel niet op.
- **Batterijen en filters** zijn altijd te bekijken, ook als niets bijna leeg
  is: `thuis.html#batterijen`, vanuit Wat je huis kan en het zoekveld. Bijna
  leeg staat daar in zacht oranje, niet als fout.
- **Grafieken:** een label bij het laatste punt staat links als het rechts
  buiten de grafiek valt (bij de assistent), en de verwachting in Vandaag ook.
- **Teksten voor elk huis:** geen NAS, geen omgevingsvariabelen, geen manier
  van uitrollen in de app. Een test leest de pagina's en bewaakt het.
- **Kleiner:** een apparaat zonder verbinding heet "geen verbinding" in plaats
  van "onbekend", een uitstelbaar apparaat dat nog niets meldde "meldt nog
  niets"; Inrichten telt welkom en klaar niet meer mee als stap.
- **Niet veranderd:** de zin op Thuis eindigt met een punt; op een scherm met
  weinig pixels leek die op een komma, tegen de g van "nodig" aan.

---

## 132. Verwarmen en koelen per kamer, op zon, en waar het werkt

*Onderwerp: kern en regeling · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, met de schetsen
`Wand-Indeling-Warmte` en `Wand-Huis-kan` in `design/app2`. Een kamer met een
radiator, elektrische vloerverwarming of een infraroodpaneel was nergens in te
stellen, en Wat je huis kan zei "werkt" bij iets dat in één van zes kamers
werkte.

*Besluit:*

- **Per kamer, bij Indeling, onder Verwarmen en koelen:** wat er hangt
  (radiator, vloerverwarming op water of elektrisch, infraroodpaneel,
  elektrische kachel, airco; meer tegelijk als ze samen aangaan), hoe het
  aangaat (thermostaat, slimme radiatorknop, slimme stekker of module, met de
  hand), en welk apparaat het schakelt. Een vermogen alleen bij elektrisch dat
  slim aangaat; met de hand heeft een vermogen of aansluiting geen zin, daar
  staat een idee. Wat Home Assistant al kent (airco, radiatorknop, thermostaat),
  staat er als gevonden; een thermostaat vraagt wat eraan hangt. Bewaard in de
  indeling (`bronnen` per kamer); een apparaat dat het huis niet meer kent,
  valt weg, zodat bewaren blijft werken.
- **Op zon:** een elektrische bron met een vermogen, geschakeld door een
  apparaat van de regeling in die kamer, mag opwarmen op zon als de bewoner
  dat aanzet. Over de configuratie gelegd (`withHeatSources`): het apparaat
  krijgt `onSurplus` en zijn vermogen, de zone buffert 1 graad boven het doel.
  In de kern mag `pv-surplus` een primary met `onSurplus` doorladen zoals een
  assist, en zet comfort hem niet uit als de kamer tevreden is (anders kwam de
  zon er nooit aan); wil niemand hem, dan bouwt de arbiter hem af. Zonder de
  vlag verandert er niets, en een test houdt dat vast. Een primary met
  `onSurplus` moet een vermogen hebben, net als een assist. De regeling neemt
  het meteen over na het bewaren van de indeling. Er gaat niets naar Home
  Assistant; het blijft meekijken tot stap B.
- **Wat je huis kan zegt waar het werkt:** "in Beneden en Zolder", niet hoeveel
  er ontbreekt; meer dan drie kamers wordt "in 5 kamers". Het blad toont per
  kamer wat er werkt, en een idee als er iets bij kan. Geen tellers, geen rood.
- **Haal er meer uit:** de drie beste ideeën, de grootste winst eerst: wat het
  huis al kan maar uit staat (een bron op zon), dan wat je meters uitrekenen
  (een thuisbatterij), dan wat te koop is (een slimme stekker, sensoren in
  kamers zonder meting). Een bedrag alleen als de eigen meters het uitrekenen.
- **De tekening:** een thermostaat met vloerverwarming eraan tekent de vloer,
  niet een radiator.
- **Versie 0.10.0.**
- **Zoeken bij Instellingen** (0.10.1) zoekt op losse woorden, het begin of een
  deel van een woord, zonder accenten en meervoud, en vindt ook de kamers en
  apparaten van het huis en alles uit Wat je huis kan. "Batterij" vond eerst
  niets.

---

## 133. Comfort zegt wanneer en waarmee: aan en uit, zon en net

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 15 oktober 2026, met de schetsen
`Wand-Comfort-Regels` en `Comfort-Tel` in `design/app2`. De schakelaars waren
niet mooi, en nergens stond wanneer verwarmen of koelen stopt, of dat het op
zon of van het net gebeurt.

*Besluit:*

- **Per dagdeel twee regels,** verwarmen en koelen, met een kleinere
  schakelaar rechts. Wanneer het aan- en uitgaat staat er pas na een tik op
  de regel: verwarmen aan onder doel min `onDelta`, uit bij doel plus
  `offDelta` (de hysterese van de zone, besluit 39); op zon tot doel plus de
  buffer; koelen op zon al vanaf doel min de buffer, van het net pas boven
  nooit warmer dan. 's Nachts en op vakantie niet op zon, net als in
  `pv-surplus`. De woorden noemen geen cv: het apparaat verschilt per huis.
- **Op de balk** een geel gestreept stuk met een zonnetje: tot waar het op zon
  mag.
- **Zon en net, per kamer:** "Op zon mag het" niet, een halve, een of twee
  graden verder dan het doel (de buffer van de zone, `opZonC` in
  `comfort.json`); alleen als er een apparaat is dat op zon mag. "Koelen van
  het net": nooit, of boven een temperatuur; dat is het oude nooit warmer dan,
  in woorden die zeggen wat het doet. Verwarmen doet het hoofdapparaat altijd.
- **Per kamer alleen overdag en 's nachts;** afwezig en vakantie hebben hun
  eigen deel met een keuze per kamer. Zo past een kamer op de wand zonder te
  scrollen.
- **De volgorde verschuift:** voorrang per seizoen, Klaar om en Hoe voelt het
  worden besluit 134.
- **Versie 0.11.0.**
- **Wat is er nieuw** (0.11.1): per versie verdeeld in nieuw, beter en opgelost;
  alleen de nieuwste staat open, de rest is ingeklapt, en de app laat hooguit
  tien versies terug zien.
- **Een nieuwe versie laadt vanzelf** (0.11.2): een app op de telefoon bleef
  open staan met de pagina van toen, en zocht daarom nog met het oude zoeken.
  Elke pagina kijkt bij openen en elke tien minuten welke versie draait; is
  die anders, dan laadt hij opnieuw, nooit terwijl je typt.

---

## 134. Voorrang per richting, en Hoe voelt het met een antwoord

*Onderwerp: kern en regeling · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, met de schetsen
`Wand-Instellingen-Comfort` (#voorrang) en `Wand-Gevoel` in `design/app2`.
Voorrang was één getal per kamer, voor koelen en verwarmen samen. En "Hoe
voelt de woonkamer nu" deed niets zichtbaars: zonder inlog stuurde de knop
naar het inloggen, met inlog verscheen er alleen "Genoteerd".

*Besluit:*

- **Voorrang per richting:** een zone kan `priorityByAction` hebben, een
  voorrang bij verwarmen en een bij koelen; weg is `priority`. De arbiter
  ordent een voorstel op de voorrang van zijn richting (`zonePriorityFor`).
  Zonder het veld verandert er niets. In de app is Voorrang een eigen deel van
  Comfort met twee lijsten, elk met omhoog en omlaag, en een voorstel: koelen
  hoog in huis eerst, verwarmen laag in huis eerst. Alleen kamers die het
  kunnen. Bewaard in `comfort.json` als `voorrang`, de plek in de lijst wordt
  de voorrang. De keuze per kamer (eerst, daarna, laatst) is weg uit de app.
- **Hoe voelt het mag zonder inlog** (`/api/gevoel` vraagt geen bewoner meer):
  het verandert niets aan het huis, en het wandscherm is waar je het tikt. Het
  blijft een eigen bestand met vaste woorden en een grens op het tempo (84).
  Een voorstel overnemen in Comfort vraagt wel een inlog.
- **Bij elke tik** bewaart de dienst de temperatuur van de zone en het dagdeel
  van dat moment (`c`, `dagdeel`), niet wat de pagina stuurt. `/api/gevoel`
  geeft tot acht weken terug.
- **Na een tik een antwoord:** wat het huis noteerde en wat het nu doet. Drie
  keer hetzelfde in twee weken, in hetzelfde dagdeel (overdag of 's nachts),
  geeft een voorstel voor Comfort: een halve graad warmer of koeler, met
  "Ja" en "Nee, alleen nu".
- **Wat het huis leerde,** vanaf acht tikken met een temperatuur waarvan drie
  goed: elke tik als stip op de temperatuur van toen, en tussen welke
  temperaturen het goed voelde.
- **Kiezen welke kamer** op Thuis, en dezelfde knoppen op de kamerpagina.
- **Klaar om** (een kamer koel om 22:00) wacht op het thermisch model (stap D):
  hoe vroeg het moet beginnen, is wat dat model leert. De schets ligt klaar.
- **Versie 0.12.0.**

---

## 135. Tot 1 november vrijgeven op de eigen pc

*Onderwerp: uitrol en beheer · Status: vervangen door 152*

Op 15 oktober 2026 waren de minuten van GitHub Actions voor deze maand op;
vanaf 1 november zijn ze er weer. Zonder CI schoof `stable` niet meer mee en
kreeg de NAS niets nieuws (besluit 54).

*Besluit:*

- **Tot 1 november draait de CI alleen met de hand** (`workflow_dispatch`).
  Een push naar main kost dan geen minuten.
- **Vrijgeven met `tools/vrijgeven.sh`** op de eigen pc: dezelfde stappen als
  de CI, in dezelfde volgorde (typecheck, lint, tests, build, de weergave, de
  pagina in een browser, deploy.sh), plus de index van de besluiten. Het image
  zoals de NAS het bouwt, met alleen de mappen van de NAS: met Docker als die
  draait, anders zonder (typecheck en build in een kopie met alleen die
  mappen, met de pakketten van hier gekoppeld, niets gedownload). ShellCheck
  alleen als `deploy/` of `addon/` veranderde; staat hij er dan niet, dan geen
  vrijgave. Pas als alles goed is, schuift `stable` vooruit, alleen vooruit.
- **Vanaf 1 november** weer bij elke push via GitHub: de trigger `push` terug
  in `ci.yml`. Het script blijft voor als het nog eens nodig is.

---

## 136. Meldingen in de app

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 14 oktober 2026, met de schets `Wand-Meldingen` in
`design/app2`. Er was geen plek waar de app zei dat er iets nieuws was, of
dat iets niet meer werkte. Besluit 79 zegt wat later een pushmelding krijgt;
dit is de lijst in de app zelf.

*Besluit:*

- **Een bel in het menu,** boven het tandwiel, op elke pagina; op de telefoon
  op Thuis naast het tandwiel. Een getal als er iets aandacht vraagt. Een tik
  opent een blad over de pagina: Vraagt aandacht, Eerder, en onderaan
  Onderhoud.
- **Wat een melding krijgt:** een apparaat dat in geen kamer staat (na tien
  minuten, met "Zet in een kamer" en "Negeer"); een apparaat in een kamer dat
  een uur onbereikbaar is, en "weer goed" als het terug is; een batterij of
  airco-filter onder de 10%; een slimme meter die een half uur niets levert.
  Ter informatie, niet in het getal: een nieuwe versie, en 10, 20 en 30
  winterdagen meegekeken.
- **Tegen te veel:** een wachttijd per soort; wat binnen een etmaal terugkomt,
  opent hetzelfde bericht weer; wat vanzelf goed komt, gaat naar Eerder en
  verdwijnt na een week; is bijna alles tegelijk weg, dan is Home Assistant
  zelf weg en komt er geen melding per apparaat.
- **Onderhoud:** alle batterijen, de leegste eerst, en de filters van de
  airco's, altijd te bekijken.
- **Wat is er nieuw:** na een update één keer een pop-up met de punten van de
  nieuwe versie (besluit 133). De eerste keer ooit niet: dan is alles nieuw.
- **Opslag:** `meldingen.json` naast de dataset, elke minuut bijgewerkt. Lezen
  kan iedereen; "Negeer" vraagt een bewoner. Er gaat niets naar Home
  Assistant. Een melding op de telefoon blijft voor later, met een eigen
  besluit over schrijven (79).
- **Versie 0.13.0.**
- **Aangevuld op 15 oktober 2026 (versie 0.14.1),** na de eerste dag gebruik:
  elke melding heeft een kruisje om hem weg te halen. Wat nog speelt, komt
  dan niet terug tot het voorbij is; wat al voorbij is, gaat uit de lijst. Dat
  vervangt "Negeer". Een melding is ook later aan te tikken: een versie opent
  weer wat er nieuw was, de rest gaat naar het apparaat. Onderhoud kleurt geel
  als er iets bijna op is, in plaats van altijd een groen vinkje. De knop van
  de pop-up heet "Oké". In de instellingen staat alleen nog een bolletje waar
  iets ontbreekt; groen voor "staat goed" viel weg, omdat het overal stond en
  niets zei.

---

## 137. Verwacht naast echt: of de zonverwachting klopte

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 15 oktober 2026, met de schets
`Wand-Vandaag-Verwacht` in `design/app2`. Nergens was terug te vinden of de
verwachte opbrengst van de panelen klopte. De dienst bewaarde het al sinds
besluit 105: per dag wat de dag ervoor werd verwacht.

*Besluit:*

- **Vandaag, bij Gisteren:** boven de grafiek wat er opgewekt is naast wat de
  dag ervoor werd verwacht, hoeveel het afweek ("+41%") en welk deel zelf
  gebruikt werd; gestippeld de verwachte lijn. Rechts "Zo klopte de
  verwachting": per dag van de afgelopen twee weken een paar balken,
  gestippeld verwacht en vol opgewekt, met hoeveel het gemiddeld ernaast zat
  en hoe het huis de verwachting daardoor bijstelt. Op de telefoon hetzelfde
  blok onder de zon.
- **Vandaag zelf:** wat er tot nu toe is, naast wat de dag ervoor voor
  vandaag werd verwacht. **Morgen:** de verwachting en de kans op zon.
- **Thuis:** in de kaart Vandaag het opgewekte naast de verwachting van de
  dag ervoor.
- **Opbrengst:** bij Je panelen verwacht naast opgewekt, opgeteld over de
  dagen van de periode waarvan een verwachting bewaard is, met hoeveel dagen
  dat zijn. Per dag, week, maand en jaar.
- **Eerlijk tellen:** alleen afgesloten dagen, en alleen dagen zonder gaten in
  het logboek; vandaag telt pas mee als hij om is.
- **Opslag:** niets nieuws. `weer-verwachting.json` bewaarde de verwachting
  al, ruim een jaar. Er gaat niets naar Home Assistant.
- **Versie 0.14.0.**

---

## 138. De regeling per kamer in de app

*Onderwerp: kern en regeling · Status: geldig*

Gevraagd in het plan van 14 oktober 2026 en akkoord op 15 oktober, met de
schets `Wand-Indeling-Regeling` in `design/app2`. Welk apparaat welke kamer
regelt, stond alleen in het vaste bestand. Een nieuwe gebruiker kon het in de
app nergens instellen, en de regeling nam een nieuw apparaat pas na een
herstart over. Dit is het fundament onder Inrichten en onder een openbare
versie.

*Besluit:*

- **Waar:** in Indeling, bij de kamer, bij Verwarmen en koelen. Per
  klimaatapparaat een regel "De regeling" met drie keuzes: **Houdt op
  temperatuur** (warmt of koelt tot het doel bij Comfort, ook van het net),
  **Helpt op zon** (springt bij als er eigen zon over is; van het net alleen
  als Comfort dat zegt) en **Alleen kijken** (het huis volgt het, maar regelt
  het niet). Bovenaan staat waarmee de kamer meet, met een tik naar Meten met.
- **Iets toevoegen** uit Home Assistant zet het apparaat in de kamer, met de
  drie keuzes en hun uitleg. De app stelt voor: een airco helpt op zon, de
  eerste verwarming houdt de kamer op temperatuur, een tweede regelaar in
  dezelfde kamer kijkt alleen (twee regelaars kunnen elkaar tegenwerken).
- **Wat de app zelf invult:** wat het apparaat kan en tussen welke graden,
  uit Home Assistant; de stroommeter van hetzelfde apparaat als die er is;
  anders voor een airco 1000 W. Hoe snel het aan en uit mag, krijgt een
  veilige waarde per soort (een airco 15 minuten aan, 5 rust) en staat niet
  in de app. Zonder eigen sensor meet een kamer met het apparaat zelf.
- **Een kamer die voor het eerst meedoet** krijgt een eigen zone met veilige
  doelen; Comfort zet daarna de temperaturen. Doelen die geen apparaat meer
  kan halen, schuiven binnen het bereik, zodat bewaren altijd lukt.
- **De overstap:** bij de eerste start zet de dienst wat het bestand per zone
  zegt eenmalig om in rollen bij de kamer (de Nest houdt op temperatuur, de
  airco's helpen op zon, de thermostaat van de badkamer houdt op
  temperatuur). Daarna is de app de plek; het bestand houdt wat de app nog
  niet kent.
- **Meteen:** de regeling neemt een nieuw apparaat of een andere sensor over
  zonder herstart. Ze volgt dan andere entiteiten, en het logboek krijgt hun
  beginstand voor de replay.
- **Overzicht:** bij Instellingen › Regeling › Klimaat per kamer wat er
  regelt, en welke kamers nog niet meedoen, met een tik naar de kamer.
- **Grens:** alles kijkt mee tot stap B (besluit 64). Er gaat niets naar Home
  Assistant.
- **Versie 0.15.0.**

---

## 139. Inrichten in één keer, het filmpje en de rondleiding

*Onderwerp: configuratie en onboarding · Status: geldig*

Gevraagd in het plan van 14 oktober 2026, met de schetsen `Wand-Inrichten`,
`Wand-Film` en `Wand-Rondleiding` in `design/app2`; akkoord met "Ook later te
openen", "Met de echte cijfers", "Met geluid" en "Iedereen de eerste keer".
Inrichten (besluit 114) stuurde je naar zes pagina's met een balk ertussen; dat
voelde als instellingen, niet als je huis neerzetten.

*Besluit:*

- **Eén pagina, over het hele scherm, zonder menu.** Bovenaan vijf stappen
  (Je huis, Apparaten, Verwarmen en koelen, Comfort, Zon en energie), links
  het huis dat meegroeit, rechts één vraag. Een stap met een vinkje is af,
  gezien aan wat de dienst zegt, niet aan wat er geklikt is.
- **Wat Home Assistant al weet, staat klaar.** Je huis: de ruimtes per
  etage, om te hernoemen, te verplaatsen of aan te vullen; "Klopt" maakt het
  voorstel de eigen indeling. Apparaten: wat nog los staat, met de kamer die
  Home Assistant voorstelt. Verwarmen en koelen: per kamer de apparaten met de
  drie keuzes van besluit 138, en iets toevoegen uit Home Assistant. Comfort:
  één keer voor het hele huis (verwarmen onder, koelen boven, de nacht, de
  dag). Zon en energie: de panelen, de hoofdzekering, de meters, de
  stroomprijs en de verwarming.
- **Meteen bewaard,** langs dezelfde deuren als bij Instellingen. Er komt in
  de dienst niets nieuws bij.
- **Overslaan kan altijd.** Bij Klaar staat wat nog openstaat, met een tik
  erheen; Inrichten blijft te openen bij Instellingen.
- De balk tussen de pagina's van besluit 114 is weg.
- **Versie 0.16.0.**
- **Het filmpje (versie 0.17.0):** bij Klaar, en daarna te openen. Geen
  videobestand: het eigen huis, getekend door de app, in vier beelden van
  samen een minuut (de nacht, de middag met zon, de avond, elke dag een
  beetje slimmer). De cijfers zijn echt: hoeveel kamers en apparaten, wat het
  dak gisteren leverde, hoe vaak het huis vandaag zei waarom, en hoeveel
  winterdagen er al zijn. Het geluid maakt de browser zelf, een zacht akkoord
  per beeld; uit te zetten, en de keuze blijft. Pauzeren en overslaan kan
  altijd; wie minder beweging wil, krijgt de beelden zonder beweging.
- **Gewone woorden (15 oktober):** "verwarmen" in plaats van "warmen", en een
  test die het bewaakt. Gewone kamernamen krijgen weer "de" ("de badkamer"):
  een onzichtbaar stuurteken in de regel daarvoor hield dat sinds besluit 131
  tegen.
- **De rondleiding (versie 0.18.0):** zeven stops op de echte pagina's (Thuis
  vier keer, Vandaag, Opbrengst, en de bel en het tandwiel), dan Klaar, met
  het filmpje nog eens als je wilt. Het scherm wordt donker en licht op waar
  het om gaat; de kaart staat ernaast, op de telefoon over de breedte. Na het
  filmpje of Overslaan bij Inrichten, en de eerste keer op Thuis, komt hij
  vanzelf; daarna achter het vraagteken op Thuis. Overslaan en Escape kunnen
  altijd. Waar hij is, onthoudt het tabblad, zodat hij over de pagina's
  loopt; of hij gezien is, onthoudt de browser. Hij vervangt de rondleiding
  van drie stappen op Thuis.

---

## 140. Vandaag is de tijd, Apparaten is het nu

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 15 oktober 2026, met de schets
`Wand-Apparaten-Nu` in `design/app2`. Vandaag en Apparaten leken op elkaar:
allebei de zon van de dag met daaronder per apparaat wanneer het draaide.

*Besluit:*

- **Vandaag is de tijd:** het verhaal van de dag. De zon, de temperatuur van
  elke kamer met een regeling (eerst stonden er hooguit twee), wanneer iets
  draaide en waarom, en bij Gisteren of de verwachting klopte.
- **Apparaten is het nu:** per apparaat een kaart. Wat het nu doet, wat het
  nu vraagt in kW, wat het vandaag gebruikte en welk deel op eigen zon. Een
  apparaat zonder stroommeter zegt hoe lang het vandaag aan stond, geen
  geschatte kWh. De rol bij de regeling en het filter staan erbij. Wat nu
  iets doet, staat bovenaan. Een tik opent het apparaat in zijn kamer.
- **De grafiek van de dag op Apparaten is weg;** die staat bij Vandaag. De
  verdeling van de stroom van nu blijft onderaan.
- **Het verbruik per apparaat** komt van de kWh-meter van hetzelfde apparaat
  in Home Assistant, dezelfde als bij Opbrengst; het vermogen van nu van de
  stroommeter erbij.
- **Batterijen bij de kamer (versie 0.18.1):** een schakelaar of sensor met
  een batterij is in Home Assistant een apparaat apart. De kamer toont hem nu,
  een schakelaar bij Licht en een sensor onder Sensoren, oranje als hij bijna
  leeg is; een melding brengt je er met een tik heen en licht hem op.
- **Versie 0.19.0.**
- **Thuis, aangevuld op 15 oktober (versie 0.19.1):** een begroeting naar de
  tijd van de dag boven de kop. Onderhoud staat bovenin als een sleutel, alleen
  als er een batterij of filter bijna op is; een tik klapt hem open met wat er
  te doen is en Bekijk. De vraagbalk van de assistent staat alleen nog onder
  het huis, zodat de kaarten rechts tot onderaan lopen. Het getal bij de bel
  telt alleen wat je nog niet zag: open je de meldingen, dan verdwijnt het; de
  melding zelf blijft staan tot hij opgelost of weggehaald is.

---

## 141. De assistent als gesprek, met een stem

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 15 oktober 2026, met de schets
`Wand-Assistent-Gesprek` in `design/app2`: de pagina waar de visie ligt, met
het gevoel van een assistent die er is, maar lokaal en alleen uit de eigen
gegevens. Dit is het begin; "Hé huis" komt later.

*Besluit:*

- **Het huis praat zelf,** in de ik-vorm (de assistent mag "ik" zeggen). Het
  begroet je naar de tijd van de dag en vraagt waarmee het kan helpen; na een
  antwoord vraagt het of het nog iets kan doen, met drie vervolgvragen die bij
  dat antwoord horen en "Nee, dank je".
- **Vragen die nu ergens over gaan,** uit wat het huis meet: een kamer die op
  zon wacht ("Waarom wacht de wasruimte?", met "0,5 van de 0,8 kW zon"), een
  kamer die koelt of verwarmt, de zon, de dag en de temperatuur. Geen vaste
  lijst meer met "Waarom de beneden?".
- **Twee nieuwe vragen:** "Wat deed je vandaag?" (hoe vaak het huis iets
  besloot, wat het zou laten draaien, wat echt aan stond, wat het dak
  leverde) en "Hoe warm is het overal?". De zon en straks noemen nu ook wat
  er volgens het weer nog komt. "Waarom wacht…" zegt nu ook wat er op zon nog
  zou gebeuren en waarom dat niet kan. Elk getal heeft nog steeds een bron
  (besluit 88); de test daarvan dekt de nieuwe vragen.
- **De stem is Piper,** lokaal in Home Assistant. De dienst vraagt Home
  Assistant om het geluid van een zin (`/api/tts_get_url`) en geeft het door
  (`/api/stem`). Dat is geen schakelen: er verandert niets in het huis en er
  gaat niets naar buiten. Een stem uit de cloud kiest de app nooit. Zonder
  Piper: een Nederlandse stem van het apparaat zelf, en anders alleen tekst.
  Hardop kan pas na een tik; dat bepaalt de browser. Voorlezen staat aan en
  is uit te zetten.
- **Het effect:** de bol krijgt stralen die meeslaan op de echte stem; de
  woorden komen mee terwijl het huis praat, getallen in zonnekleur; de kamer
  waar het over gaat licht op in het huis, bij de zon de panelen. Tikken
  stopt het praten. Wie minder beweging wil, krijgt geen stralen.
- **Eén antwoord tegelijk,** groot; eerdere vragen staan klein bovenaan om
  terug te halen.
- **Luisteren** ("Hé huis") komt pas met Whisper en een wekwoord in Home
  Assistant. De luisterfunctie van de browser stuurt je stem naar buiten;
  die gebruikt de app niet. De microfoon staat er pas als hij iets doet
  (besluit 142).
- **Versie 0.20.0.**
- **Beweging (versie 0.20.1):** een bewegingsmelder hoort bij de meter van
  hetzelfde apparaat. De kamer toont onder Sensoren wat hij meet, zijn
  batterij, en "Beweging, nu" met een zachte golf, of wanneer hij het laatst
  iets zag; in het huis dijen twee ringen uit over de vloer van die kamer.
  De kamer kijkt elke vijf seconden, Thuis elke vijftien, alleen als de
  pagina in beeld is. Alleen kijken: er wordt niets geschakeld.
- **Nederlands (versie 0.20.2):** zonder taal koos Piper zijn eerste stem, en
  die was Engels. De dienst vraagt Home Assistant nu welke talen en stemmen
  Piper heeft (`tts/engine/list` en `tts/engine/voices`, twee leesvragen op de
  vaste lijst) en geeft Nederlands en een Nederlandse stem mee. Heeft Piper
  geen Nederlands, dan spreekt het apparaat zelf, en anders alleen tekst.

## 142. Een kwaliteitsronde: een kamer doet mee met een andere, en de assistent klinkt als een mens

*Onderwerp: weergave · Status: geldig*

Op 15 oktober 2026 vroeg de bewoner om een grondige controle van de hele app:
dode en dubbele code, teksten die als een machine klinken, elk scherm op de
wand en de telefoon, en hoe goed de voorspellingen zijn. Het rapport staat als
pagina bij de bewoner. Vijf punten had hij zelf al gevonden; die zitten erin.

*Besluit:*

- **Meedoen met een andere kamer.** "Geregeld als" bij een kamer verhuisde de
  regeling van een andere kamer, in plaats van ze te delen. Zo nam de
  slaapkamer op zolder de zone van de wasruimte over; de wasruimte kreeg een
  nieuwe zone (`zolder-2`) met het standaardcomfort (20 tot 24° in plaats van
  18 tot 22,5°), de lijn op Vandaag stopte, en de dienst weigerde daarna elke
  wijziging in de indeling, want de slaapkamer wees naar een zone die er niet
  meer was. Nu kiest een kamer "Doet mee met …" (`meedoenMet` in de
  indeling): de regeling van die kamer houdt hem mee op temperatuur, een
  thermometer in de kamer telt mee in het gemiddelde, en de kamer toont de
  stand en de temperatuur van die regeling. Een zone die er niet meer is, valt
  los in plaats van alles te blokkeren. Het herstel draait de oude schade
  terug: de kamer met de apparaten krijgt zijn oude zone en comfort terug, en
  de andere doet mee. De dienst doet dat bij het starten één keer met wat er
  al bewaard staat.
- **De assistent klinkt als een mens.** Eerst het antwoord, dan hooguit twee
  zinnen met wat er speelt, warm en met de cijfers die het huis heeft. "Ik
  kijk nog alleen mee" zegt hij alleen als je vraagt wat hij doet; "In
  werkelijkheid staat…" is "Nu staat…". Zon noemt de verwachting van
  vanochtend en hoeveel je zelf gebruikte; 's avonds wat morgen van je dak
  komt.
- **Uitspraak:** wat Piper krijgt, gaat eerst door uitspraakregels
  (`uitspraak.ts`): kilowattuur en kilowatt voluit, een tijd zoals je hem
  zegt ("kwart voor twee"), graden, procent, euro en cent, en "airco" zoals
  het klinkt. Op het scherm blijft "13:45" staan. Het antwoord krijgt de
  gesproken versie mee, voor de stem van het apparaat.
- **Geluid na een tik op Thuis:** een vraag uit het adres probeert meteen te
  spreken. Weigert de browser, dan staat er "Tik om te horen". Web Audio
  (voor de stralen) gaat alleen mee als de browser hem al toestaat; anders
  zou die het geluid inslikken.
- **Twee nieuwe vragen:** het weer en de zon van morgen, en wat de apparaten
  met een eigen meter deze maand kostten (alleen wat van het net kwam).
  "Gaat het morgen regenen?" ging eerst over de nachtstand. "Hoe" alleen
  maakt een vraag niet meer tot een vraag over de app: "hoe wordt het weer"
  gaat over het huis.
- **Opbrengst telt op:** liep de zonnemeter in een uur achter op de meter van
  het net, dan viel dat verschil weg en was zelf gebruikt te hoog (125 kWh
  opgewekt, maar 127 in het stroomschema). Het tekort schuift nu door naar
  het volgende uur.
- **Vandaag:** aan, wachten, aan van hetzelfde apparaat binnen een half uur is
  één regel ("verwarmde met de zon mee, 2 keer gestart"); een tik toont de
  losse momenten. Na zonsondergang staat er dat de zon onder is, met de
  verwachting voor morgen. Bij Morgen staat wanneer de meeste zon komt.
- **Geen beloftes op het scherm:** de zinnen over het thermisch model, de
  microfoon die niets deed, en "de app bepaalt de richting van de panelen
  zelf" zijn weg of eerlijk gemaakt.
- **Kleine fouten:** een afgeknipte zin bij Apparaten, het doel dat er twee
  keer stond, de naam van een kamer zonder thermometer die scheef stond, de
  maan die op de telefoon over de tekst viel, "beeld 60 tellen", "Ingelogd:
  niet ingelogd", en een onduidelijke zin bij de meters.
- **Opruimen (5S):** weg zijn twee lege doorverwijspagina's, een ongebruikt
  bestand in de configuratie en vier ongebruikte stijlregels. Eén keer in
  plaats van twee: een state lezen (live en bij het terugspelen), "wanneer
  was dat", en de apparaten van een kamer opzoeken. Een tekstcontrole die
  door een onzichtbaar teken nooit iets vond, werkt weer. Het huis tekenen
  staat nog op vijf plekken; dat wordt één bij het nieuwe huis.
- **Versie 0.21.0.**

## 143. Comfort uit de app gaat voor de oude helpers, en het huis zoals het is

*Onderwerp: configuratie en onboarding · Status: geldig*

Bij de kwaliteitsronde (besluit 142) bleek dat de regeling beneden rekende met
20 tot 22° en in de wasruimte met 20°, terwijl Comfort in de app 18 tot 22,5°
liet zien. Tijdens het meekijken leest de regeling de doelen live uit de
helpers van het oude systeem (`migration.setpoints`, besluit 31), en die
wonnen van de app. Daar was nooit over besloten. De bewoner koos op
16 oktober 2026: de app wint.

*Besluit:*

- **Comfort uit de app gaat voor.** Een kamer met comfort uit de app rekent
  met dat comfort; de helpers van het oude systeem tellen alleen nog voor een
  kamer die in de app niet is ingesteld. De vergelijking met de oude regeling
  is voor die kamers daardoor iets minder een-op-een; dat weegt minder dan dat
  wat je instelt ook geldt.
- **Het huis zoals het is** (schets `Wand-Huis-Nieuw`): een voordeur in de
  hal, half open, met de deurbel ernaast die oplicht bij beweging; het pad
  loopt naar de deur. De meterkast hangt in de hal naast de deur, en de kabel
  van het net komt aan de straat het perceel in. De camera van de oprit staat
  op een paal naast het huis, met een warme bundel als de schijnwerper aan is
  en een koele met een ring als hij beweging ziet. De buitenunits staan op
  ware grootte tegen de zijgevel, één per airco, de tweede op een steun, los
  van het zonnescherm. De tuin is gras, met een terras onder het zonnescherm
  en de border als lage lampjes in hun kleur. Witgoed staat op ware grootte,
  en de naam van een kamer past binnen zijn muren.
- **Eén opbouw van de tekening** (`huismodel.tekening`) voor Thuis, de
  assistent, Inrichten en Wat je huis kan; de film volgt bij de nieuwe film.
- **De kosten noemen het apparaat** zoals de app het noemt, niet zijn meter.
- **De stem van het apparaat** die meteen faalt, stopt het antwoord niet meer:
  dan komen de woorden in leestempo.
- **De download van je gegevens** heeft nu ook het weer per uur zoals het
  verwacht werd, en de zon per kwartier, zonder ligging: om de zonverwachting
  per uur na te rekenen (rapport, besluit 142).
- **Versie 0.22.0.**

## 144. Na Inrichten is de app af, een film van twintig tellen, en een rondleiding langs alles

*Onderwerp: configuratie en onboarding · Status: geldig*

Het kwaliteitsrapport (besluit 142) vond dat Inrichten stappen oversloeg, dat
de film traag was en vooral liet zien wat er in het huis staat, en dat de
rondleiding alleen op Thuis, Vandaag en Opbrengst kwam. Schetsen:
`Wand-Inrichten-Compleet` en `Wand-Film-Trailer` in `design/app2`.

*Besluit:*

- **Inrichten in hoofdstukken.** Bovenaan staan de hoofdstukken, met per
  hoofdstuk stipjes voor de kleine stappen, zodat de balk rustig blijft: je
  huis (kamers, buiten), apparaten (per kamer, meten met), klimaat (wat elk
  apparaat doet, comfort), energie (panelen, zekering, prijzen en meters) en
  gemak (licht en camera's, de wand). Daarna Klaar met de film. Nieuw zijn
  buiten (wat elke buitenruimte is, met de auto en het tuinhuis, besluit 109),
  meten met (besluit 123), meedoen met een andere kamer bij een kamer zonder
  eigen apparaat (besluit 142), de zekering als eigen stap, het daltarief en
  de meters overnemen uit het Energie-dashboard, licht, screens en camera's
  (besluit 130), en de wand die één keer inlogt. Elke stap staat al ingevuld
  met wat Home Assistant weet, gaat langs dezelfde deuren als Instellingen,
  en kan later.
- **De film is een trailer:** zeven beelden van drie tellen op een beat van
  120 per minuut uit de browser zelf, samen zo'n twintig seconden. Elk beeld
  één ding dat de app echt doet, met een groot getal uit je eigen huis:
  gisteren van je dak, je kamers en apparaten, je dak op zijn best, de zon van
  morgen, hoe warm een kamer nu is, de assistent, en hoeveel van je stroom van
  je eigen dak kwam. Een beeld zonder zijn cijfer valt weg; er staat nooit een
  getal dat niet uit het huis komt, en geen belofte die de app nog niet
  waarmaakt. Het huis komt uit dezelfde opbouw als Thuis
  (`huismodel.tekening`, besluit 143).
- **De rondleiding** loopt in twaalf stops langs alle tabbladen en een kamer:
  Thuis, een kamer van dichtbij, hoe voelt het, Vandaag met gisteren en
  morgen, Apparaten, Opbrengst, de assistent, de bel, het tandwiel en Wat je
  huis kan.
- **Een sensor zonder naam** in Home Assistant heet bij "meet met" naar zijn
  entiteit ("Beneden temperatuur"), niet `sensor.beneden_temperatuur`.
- **Versie 0.23.0.**

## 145. Een zone heeft een soort, en kamers en zones schuiven

*Onderwerp: configuratie en onboarding · Status: geldig*

De bewoner vond op 16 oktober 2026 bij Indeling dat een nieuwe zone geen soort
kreeg (een zithoek of keuken was niet te kiezen), dat kamers en zones niet te
verplaatsen waren, en dat een bewegingsmelder het icoon van een thermometer had.
En dat de screens aan de voorgevel (ochtendzon) en het zonnescherm aan de
achtergevel allebei "Zon op deze gevel" zeiden: de app wist niet aan welke
gevel een scherm hangt, en toonde het zodra de zon op een gevel stond.

*Besluit:*

- **Een zone heeft een soort** (`soort` in de zone, dezelfde lijst als een
  kamer, besluit 119), zoals zithoek, keuken of eethoek. Zonder keuze een
  voorstel uit de naam. De soort bepaalt de inrichting van dat deel in de
  tekening; heeft de kamer zelf geen gekozen soort, dan gaat de tekening per
  zone. Een keuken en een zithoek samen maken de kamer een woonkamer met open
  keuken, ook als hun namen dat niet zeggen.
- **Schuiven:** een zone gaat met pijlen een plek naar links of rechts in de
  kamer, en een kamer een plek naar links of rechts op zijn etage. De volgorde
  in de indeling is de volgorde in de tekening. Per zone kan ook de naam
  veranderen.
- **Een bewegingsmelder** heeft een eigen icoon en heet bij Indeling
  "bewegingsmelder", ook als hij de temperatuur meet. Die temperatuur staat
  ernaast als tekst, en de melder blijft te kiezen bij "meet met"
  (besluit 123).
- **Een scherm hangt aan een gevel** (`gevel` bij het apparaat in de
  indeling, op het id uit `geometry.facades`). Gekozen bij Indeling; anders
  een voorstel uit de naam ("achter", "terras", "voor"), en een zonnescherm
  hangt meestal aan de achterkant. Bij het scherm staat "Zon op de voorgevel"
  alleen als de zon op díe gevel staat. Weet het huis de gevel niet, dan zegt
  de app niets over zon op het scherm, in plaats van te gokken.
- **Gevel** zegt de stem met een lange e ("voorgeevel"), niet als het
  voorvoegsel ge-.
- **Versie 0.23.1.**

## 146. Inrichten zoals de schets, en de film als een dag in je huis

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 16 oktober 2026 vond de bewoner dat Inrichten niet op de schets
`Wand-Inrichten-Compleet` leek, en dat de film van besluit 144 te snel ging,
geen intro en afsluiting had, en muziek die nergens op sloeg. Hij koos: de
balk en de kaart zoals de schets, met het huis links; een film van zo'n 45
seconden; een dag in je huis als verhaal; en muziek die de app zelf speelt.

*Besluit:*

- **Inrichten:** zes hoofdstukkaarten over de hele breedte, met een balkje per
  stap en wat erin zit, ook Klaar. Wat elk apparaat doet, kies je met drie
  knoppen naast elkaar (Houdt, Zon, Kijkt; zon in zijn kleur). De zekering is
  eerst 1 of 3 fasen en dan de ampère in een vak. De prijzen staan in vakken
  ("Stroom normaal … € 0,27"), met de meters in één zin eronder. De wand toont
  wat je er kunt: licht en screens, en welke camera's.
- **De film is een dag in je huis**, op 112 tellen per minuut, alles op de
  maat. Intro (vier maten): donker, de zon komt op, het huis verschijnt, met
  Smart Climate en "Dit is je huis". Dan zes beelden van twee maten (ruim vier
  seconden), van de ochtend tot de avond, die langzaam inzoomen. Het slot (vijf
  maten): de lampen gaan aan, het wordt nacht, het getal van je eigen dak, het
  logo en Begin. Het laatste beeld blijft staan tot je tikt.
- **De muziek** speelt de browser zelf, in D groot op I, V, vi, IV: een pad
  die opengaat in de intro; een opbouw met bas, kick en arpeggio; een maat
  aanloop met stijgende ruis en een roffel; een drop op het beeld van je dak
  met pompende akkoorden, een bas op de tegentel en een melodie; en een slot
  op G, A, D dat uitklinkt. Alles door een compressor. Een test neemt de
  muziek op zonder luidspreker en eist dat de opbouw voller is dan de intro en
  de drop het voluit, zonder te kraken. Als laatste schakel een zachte
  begrenzer: tot 0,8 ongemoeid, nooit boven 0,95 (versie 0.24.1; de ruis kon
  net boven het maximum uitkomen).
- **Versie 0.24.0.**

## 147. Comfort per bewoner, en inloggen voor de hele app

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 16 oktober 2026 vroeg de bewoner om comfort per gebruiker die thuis is,
een instelbare hoofdgebruiker, begroeten met een eigen naam, en inloggen voor
de hele app in plaats van alleen voor bedienen. Na een plan met vier keuzes en
de schetsen `Wand-Bewoners`, `Wand-Eerste-inlog`, `Wand-Thuis-Bewoners` en
`Wand-Inloggen` koos hij: een vaste volgorde; vanzelf wisselen, met een
melding; comfort voor het hele huis; een eigen account voor de wand; en
bewoners pas na een eerste inlog, niet alles uit Home Assistant.

*Besluit:*

- **Bewoners** (`bewoners.json` naast de dataset): wie hier woont, op
  volgorde; de eerste is de hoofdgebruiker. Een bewoner komt er alleen bij door
  één keer in te loggen. Heeft het account een persoon in Home Assistant, dan
  wordt hij meteen bewoner, met die persoon als aanwezigheid als de
  configuratie hem volgt. Zonder persoon vraagt de app: woon je hier, of is dit
  een scherm? Een scherm, zoals de wand, is geen bewoner. Gasten zonder account
  tellen alleen als "iemand thuis". De naam is de voornaam uit Home Assistant
  en in de app te veranderen; er gaat niets naar Home Assistant.
- **Welk comfort geldt, in de kern** (`chooseProfile`): de configuratie krijgt
  `profiles` op volgorde, elk met zijn aanwezigheid en eigen doelen per zone.
  De eerste op de lijst die thuis is, bepaalt; is er niemand thuis, dan de
  hoofdgebruiker. Wie net thuiskwam of wegging, telt de eerste tien minuten nog
  zoals ervoor (de meting draagt nu sinds wanneer, niet "nu"). Zuiver, dus de
  schaduw en het terugspelen rekenen hetzelfde; de uitleg van elk besluit zegt
  welk profiel gold en waarom, en welke profielen thuis waren, maar niet wie
  er per uur thuis was.
- **Comfort per bewoner:** het comfort van het huis is van de hoofdgebruiker.
  Een nieuwe bewoner volgt hem, tot hij zelf iets verandert; dan krijgt hij een
  eigen comfort, met alleen de doelen en het plafond per kamer. Voorrang, op
  zon en de dagdelen blijven van het huis. Wordt een ander hoofdgebruiker, dan
  neemt de oude zijn comfort mee en brengt de nieuwe het zijne in. Aan jezelf
  mag je alles; de hoofdgebruiker en een beheerder ook aan een ander.
- **Vanzelf, met een melding:** wisselt het comfort, dan staat het één keer bij
  de bel, en op Thuis staat "Comfort van Noor" met de reden. "Toch die van
  Ricardo" houdt dat comfort vast tot er iemand thuiskomt of weggaat
  (`profileHold`); daarna ruimt de dienst het op, zodat het later niet vanzelf
  terugkomt.
- **Begroeten:** op je telefoon met je eigen naam, op een scherm met wie er
  thuis is ("Goedenavond, Noor en Matts"); de assistent net zo. Bij "Wat doe
  je nu?" zegt hij wiens comfort geldt, als het niet dat van de hoofdgebruiker
  is.
- **Inloggen voor de hele app:** elke pagina en elke vraag aan de dienst vraagt
  een inlog (besluit 99 gold alleen voor bedienen). Zonder inlog gaat een
  pagina naar `inloggen.html`: een huis als silhouet, zonder namen of getallen,
  en één knop naar Home Assistant. Open blijven het inloggen zelf, of de dienst
  draait (`/api/health`, voor de NAS) en opmaak en script. De assistent van
  Home Assistant vraagt `/api/vraag` met een eigen sleutel
  (`sleutel-assistent.txt` in de logmap), die een beheerder ziet bij
  Instellingen › Bewoners en toegang. Achter Ingress verandert er niets.
- **Waar het staat:** Instellingen › Bewoners en toegang › Bewoners, Comfort
  met wiens comfort het is, en bij Inrichten de stap "Wie woont hier?" met een
  QR-code om anderen te laten inloggen.
- **Later:** kamers met een eigenaar (een slaapkamer volgt zijn bewoner).
- **Versie 0.25.0.**
- **Een gast** (16 oktober 2026, op verzoek): iemand die in de app inlogde, zet
  de hoofdgebruiker of een beheerder op "gast". Een gast staat niet in de
  volgorde en telt nooit mee voor het comfort; hij kijkt mee, en bedient licht,
  scènes en screens alleen als zijn aanwezigheid zegt dat hij thuis is. Van een
  gast wordt niets bewaard: geen comfort, geen gevoel, geen instellingen, en
  zijn gegevens downloaden kan hij niet. Ook als hij in Home Assistant beheerder
  is. De dienst toetst het zelf, niet alleen de pagina. Gasten staan bij
  Bewoners onder Schermen en gasten, en de wand begroet ze als ze thuis zijn.
- **Reparatie (0.26.0):** na het inloggen bij Home Assistant stond je weer bij
  het inloggen. Het cookie is `SameSite=Strict`, en een doorverwijzing die
  begint op de site van Home Assistant neemt het niet mee. Nu geeft de
  terugkeer een kleine pagina die zelf verder gaat, vanaf deze site; een
  browsertest met een nagemaakt Home Assistant op een andere site (localhost
  tegen 127.0.0.1) bewaakt het. Wie vóór 0.25.0 al ingelogd was, krijgt bij de
  eerste pagina alsnog "wie ben je?". Een account met een persoon in Home
  Assistant kan op het welkom ook "Dit is een scherm" kiezen, en blijft dat. Bij
  Bewoners staan alleen accounts die in de app inlogden, niet de
  aanwezigheidsbronnen uit Home Assistant. Gast en reparatie samen: versie
  0.26.0.
- **Thuis volgens (0.27.0):** je eigen persoon in Home Assistant staat vast
  als "<naam> in Home Assistant, gekoppeld aan je account", zonder keuzelijst.
  Zonder persoon kies je onder "Welke sensor ziet of je thuis bent?" een
  sensor of persoon. Personen van een ander account, en bronnen die al bij een
  andere bewoner horen, staan er niet in; de dienst weigert ze ook.

*Aangevuld 23 oktober 2026: niet elke keer opnieuw inloggen.* Met de app los
op de telefoon (besluit 160) moest de bewoner na elk sluiten opnieuw inloggen
bij Home Assistant. De sessie zelf bleef geldig; maar Android opent een app
vanaf het startscherm alsof je van buiten komt, en dan gaat het cookie met
`SameSite=Strict` niet mee. De dienst stuurde je dan naar het inloggen. Nu
vraagt de inlogpagina eerst zelf of je al ingelogd bent: een vraag vanaf de
eigen pagina neemt het cookie wel mee, en dan gaat hij meteen door naar waar je
heen wilde (hooguit één keer per tien tellen, zodat hij nooit blijft springen).
Het cookie blijft strikt. Een browsertest bootst het na: ingelogd, en de app
geopend vanaf een andere site. Versie 0.59.9.

---

## 148. De assistent zegt het in eigen woorden, en bedient licht en schermen met een zin

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 16 oktober 2026: de vaste zinnen van de assistent
klinken houterig, en met een taalmodel komt het huis menselijker over. Hij
wilde er ook lampen en screens mee bedienen. Na de schetsen
`Wand-Assistent-Bedienen` en `Wand-Instellingen-Praten` koos hij: Gemini,
gratis, via Home Assistant; alles gaat meteen, ook schermen; het huis zegt wat
het deed, en "stop" stopt een scherm; bij een vage zin ("het is hier zo fel")
mag het huis ook meteen iets doen; het mag zelf een vervolg voorstellen; en de
kaartjes met wat er veranderde blijven.

*Besluit:*

- **Het taalmodel staat in Home Assistant, niet in de app.** De dienst vraagt
  een AI-taak van Home Assistant (`ai_task.generate_data`) om een tekst. Welk
  model dat is, en de sleutel ervan, kiest de bewoner in Home Assistant; de app
  heeft geen eigen sleutel en noemt geen merk. Zo kan een ander huis net zo
  goed een lokaal model kiezen. Het is een **zesde smalle deur** in de client
  (`allowAiTask`): alleen die ene dienst, met alleen een taaknaam, een
  opdracht, een AI-taak-entiteit en eventueel de velden van het antwoord. Er
  verandert niets in het huis; alles daarbuiten blijft werpen (besluit 15).
- **Standaard uit.** Bij Instellingen › Functies › Praten met je huis kiest de
  bewoner een AI-taak. Daar staat ook wat er naar het model gaat (de vraag als
  tekst, het vaste antwoord met zijn getallen, de namen van kamers, lampen en
  schermen) en wat niet (de stem, camerabeelden, wie er thuis is).
- **Het vaste antwoord blijft de basis.** Het model zegt het alleen anders.
  Elk getal in de nieuwe zin moet letterlijk een feit uit het vaste antwoord
  zijn (besluit 88), getallen in woorden die er niet stonden zijn niet
  toegestaan, en het blijft kort (hooguit drie zinnen). Klopt dat niet, duurt
  het langer dan vijf seconden, of is het gratis gebruik op, dan komt het
  vaste antwoord. De controle draait bij elk antwoord, niet alleen in een test.
- **Bedienen met een zin, via dezelfde deuren als de knoppen** (97, 100,
  121). De woordzoeker herkent een opdracht zelf ("licht beneden uit", "doe
  het screen dicht", "plafonnière op 40%", "stop"); alleen wat hij niet
  begrijpt, gaat naar het model, en dat kiest uit de lijst van wat de app mag
  bedienen of uit de vaste vragen. Het model roept zelf niets aan. De dienst
  toetst de keuze en geeft de pagina de opdracht; de pagina stuurt die naar
  `/api/licht`, `/api/scene` of `/api/scherm`, met dezelfde inlog, dezelfde
  regels voor een gast en dezelfde grens op het tempo. "Aan" voor een hele
  etage of het huis kan ook nu niet.
- **Alles gaat meteen.** Het huis zegt wat het deed, met een kaartje per
  apparaat ("40%, plafonnière, was 80%"). Terwijl een scherm beweegt, staan er
  twee knoppen: **Stil** stopt het praten, **Stop het screen** het scherm, en
  "stop" zeggen of typen doet dat ook.
- **Nooit met de assistent:** klimaat (tot stap B zegt hij wat hij zou doen),
  en een garagedeur, poort of deur. Die laatste zijn ook geen scherm meer in
  het huis: tot nu toe kwam elke `cover.` als scherm in de app, ook
  `cover.garagedeur`, en kon die met de schermknoppen open.
- **Via de sleutel van de assistent van Home Assistant** (147) bedient de
  dienst niets: Home Assistant heeft zijn eigen manier om lampen te schakelen.
  De eigen woorden krijgt die vraag wel.
- **Spraak** (de microfoon met Whisper in Home Assistant) is een volgende
  stap. Tot dan typ je de zin.
- **Versie 0.27.0.**
- **Reparatie (0.27.1):** "Proberen" lukte nooit. De app werkte, maar
  gemini-3.8-flash deed er 9 tot 15 seconden over, waar de assistent er drie
  wachtte, en het gratis gebruik van dat model is 20 vragen per dag. De
  assistent wacht nu vijf seconden; een snel model (flash-lite) antwoordt in
  een à twee. "Proberen" wacht tot dertig seconden, en zegt hoe lang het model
  erover deed en waarom het niet lukte. Zegt het model dat het gebruik op is,
  of dat het het te druk heeft, dan vraagt de assistent het een tijd niet:
  tot het moment dat het model noemt (hooguit een dag), twee minuten bij
  "te druk". Tot dan komt het vaste antwoord meteen, zonder te wachten.

---

## 149. Wanneer een batterij of filter een melding geeft, een scherm beheren, en een eigen comfort dat weer lukt

*Onderwerp: weergave · Status: geldig*

Gemeld door de bewoner op 16 oktober 2026, na een dag met twee bewoners: er
was geen instelling voor wanneer filters en batterijen een melding geven; een
scherm dat eenmaal was ingesteld, kon je niet meer beheren; en Noor, de
tweede bewoner, kreeg een foutmelding als ze een eigen comfort koos. Er is geen
schets voor; het volgt de opbouw van Functies en Bewoners zoals ze er al
waren.

*Besluit:*

- **Wanneer een melding** (aanvulling op besluit 136): bij Instellingen ›
  Functies › Meldingen kies je per soort, batterij en airco-filter, onder
  welk percentage er een melding komt: 5, 10, 20 of 30%, of nooit. Zonder
  keuze 10%, zoals het was. Het staat in `functies.json` (`meldingen`), net
  als de andere functies, en bewaren vraagt een beheerder. De dienst geeft de
  drempels mee in het huis (`drempels`), zodat de bel, Thuis, de kamer en
  Onderhoud dezelfde grens gebruiken; Onderhoud zegt welke grens geldt en
  linkt ernaartoe. Onderhoud toont nog steeds altijd alle batterijen en
  filters.
- **Een scherm beheren** (aanvulling op besluit 147): bij Bewoners › Schermen
  en gasten is een scherm aan te tikken. Je geeft het een andere naam (de
  naam uit Home Assistant blijft erbij staan), of haalt het weg. Weghalen maakt
  er geen bewoner van: bij de volgende pagina vraagt dat account opnieuw "woon
  je hier, of is dit een scherm?". Dat mag de hoofdgebruiker, een beheerder,
  en het scherm zelf. De dienst toetst het, niet alleen de pagina.
- **Een eigen comfort dat weer lukt** (reparatie op besluit 147): wie "Eigen"
  koos, kreeg een kopie van het comfort van het huis, met elke kamer die daar
  ooit in stond. Ging een kamer sindsdien uit de regeling (besluit 138), dan
  weigerde de controle het hele profiel: "die zone bestaat niet". Nu krijgt
  de regeling alleen de kamers die ze nu heeft; de rest blijft bewaard, voor
  als de kamer terugkomt. Dat de fout bij Noor precies deze was, is
  nagespeeld en niet op de NAS gezien; het is de enige weg die we vonden
  waarop "Eigen" kon mislukken.
- **Versie 0.28.0.**

---

## 150. Praten met je stem: de microfoon, en "Hé huis" op de wand

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 16 oktober 2026: een microfoonknop en een
wekwoord, "Hé huis". Het wekwoord is op 17 oktober op zijn eigen pc getraind
met openWakeWord en de Nederlandse Piper-stemmen (de generator van
openWakeWord en alle mls-stemmen brabbelden; nathalie, rdh, alex, pim en
ronnie zijn goed). Na de schetsen `Wand-Luisteren`, `Assistent-Tel-Microfoon`
en `Wand-Instellingen-Luisteren` koos hij: alleen de wand luistert altijd, de
telefoon met een tik; een laag over Thuis in plaats van naar de Assistent;
een zacht tikje als het huis luistert; na het antwoord nog vijf seconden
luisteren zonder wekwoord; de laag sluit acht seconden nadat het huis klaar is
met praten; de tablet krijgt https via Tailscale.

*Besluit:*

- **Home Assistant luistert en schrijft uit, en doet verder niets.** De dienst
  start in Home Assistant een spraakopdracht (`assist_pipeline/run`) die altijd
  na het uitschrijven stopt (`end_stage: stt`): het wekwoord (openWakeWord) en
  spraak naar tekst (Whisper) draaien in huis, de gespreksagent en het
  schakelen van Home Assistant komen er nooit aan te pas. Dat is een **zevende
  smalle deur** in de client (`allowListen`): alleen die opdracht, alleen tot
  tekst, en het geluid erbij. De tekst gaat daarna dezelfde weg als een
  getypte zin (besluit 148), met dezelfde deuren en regels.
- **Het geluid loopt via de dienst.** De pagina neemt de microfoon op (16 kHz,
  mono) en stuurt het over een websocket naar de dienst (`/api/luister`); de
  dienst geeft het door aan Home Assistant. Zo heeft de tablet nooit de
  sleutel van Home Assistant. De websocket is een kleine eigen server in Node,
  zonder nieuwe afhankelijkheid, met de inlog van de app en alleen vanaf de
  eigen pagina (Origin).
- **Het wekwoord kiest de bewoner in Home Assistant.** Welk wekwoord en welke
  spraak-naar-tekst er gelden, hoort bij een spraakassistent van Home
  Assistant; die meegeven kan niet. Bij Functies › Praten met je huis kiest de
  bewoner die assistent. Ook de gevoeligheid stelt hij in bij de
  openWakeWord-add-on; de knoppen daarvoor uit de schets vervallen.
- **Welk scherm luistert, staat op dat scherm zelf:** "Dit scherm luistert"
  bij Functies, bewaard in die browser. Een telefoon luistert nooit vanzelf;
  daar tik je op de microfoon. Zonder https zegt het scherm dat de microfoon
  niet kan, en waarom.
- **Je stem gaat niet naar buiten en wordt niet bewaard.** Alleen de tekst gaat
  verder; die naar een taalmodel als de bewoner dat koos (besluit 148).
- **Spraak gaat via Home Assistant, ook op de telefoon.** De spraakherkenning
  van de browser zelf blijft uit (besluit 141): die stuurt je stem naar buiten.
- **Versie 0.29.0.**

---

## 151. Een gast zonder persoon, een back-up, opnieuw beginnen, en een export voor onderzoek

*Onderwerp: veiligheid · Status: geldig*

Gevraagd door de bewoner op 17 oktober 2026. Er was geen back-up en geen
manier om terug te zetten. Opnieuw beginnen met een leeg huis kon niet. Een
account zonder persoon in Home Assistant kon zichzelf bewoner maken. De export
moet blijven, maar dient ergens anders voor: Ricardo laat een proefhuis van
iemand anders erin kijken om de app te verbeteren. Daar hoort genoeg in te
staan, ook de apparaten en wat Smart Climate ermee doet. De keuzes zijn van de
bewoner; er is geen schets.

*Besluit:*

- **Een account zonder persoon in Home Assistant wordt een gast** (aanvulling
  op besluit 147). Na de eerste inlog staat hij bij Bewoners › Schermen en
  gasten, zonder plek in de volgorde. Alleen de hoofdgebruiker maakt er een
  bewoner van, of weer een gast, ook niet een beheerder in Home Assistant. Zelf
  kiezen kan alleen "Dit is een scherm", zodat de wand zichzelf blijft
  inrichten. Het allereerste account kiest wel zelf: er is dan nog geen
  hoofdgebruiker. De dienst toetst het, niet alleen de pagina.
- **Een gast verandert geen instellingen.** De dienst weigerde dat al (besluit
  147). Nu laat de app het ook zien: Instellingen toont een gast alleen
  Bewoners en toegang (inloggen en de versie) en Wat je huis kan. Een andere
  instellingenpagina gaat terug naar Instellingen.
- **De back-up is klein.** Bij Bewoners en toegang › Je gegevens downloadt de
  hoofdgebruiker één JSON-bestand. Daarin staan wat in de app is ingesteld
  (indeling, aansluiting, bewoners, comfort, energie, functies, meldingen), wat
  het huis leerde (de zon per kwartier en de kleuren van scènes) en de
  configuratie. Het logboek zit er niet in: als add-on gaat het al mee in de
  back-up van Home Assistant, en op de NAS in Hyper Backup.
- **Terugzetten** vervangt wat in de back-up staat en laat de rest staan. Een
  configuratie zet het alleen neer als er nog geen is. Eerst bewaart de dienst
  wat er nu staat, in `back-ups/` naast het logboek; daar blijven de laatste
  tien. Daarna stopt de dienst met code 75 en start opnieuw. De add-on doet dat
  met een lus in `run.sh`, de NAS met `restart: unless-stopped`. Zo leest de
  dienst alles opnieuw in, in de vaste volgorde.
- **Opnieuw beginnen** kan alleen de hoofdgebruiker, ingelogd en na een tweede
  bevestiging. Eerst komt er een back-up, op het apparaat en in `back-ups/`.
  Dan gaat weg wat de dienst maakte: instellingen, wat het huis leerde, en het
  logboek. De back-ups, de sessies, de sleutel voor de assistent en de
  scèneplaatjes blijven staan. De configuratie gaat alleen weg als de app hem
  ook maakte, dus als de onboarding aanstaat, zoals in de add-on. Op de NAS is
  het een bestand van de beheerder, en dat blijft staan. Zolang er niemand
  woont, mag een beheerder in Home Assistant dit ook, anders kan niemand een
  back-up op een nieuw huis zetten.
- **De export is voor onderzoek, en alleen voor de hoofdgebruiker** (wijziging
  op besluit 48 en 83: daar mocht de beheerder het). In `analyse/` komen erbij:
  `instellingen.json` met de configuratie en alles uit de app, en
  `entiteiten.json` met elke entiteit uit Home Assistant. Per entiteit staan
  daar apparaat, merk, model, ruimte, etage, soort, eenheid en stand, en onder
  `gebruikt` waar Smart Climate hem gebruikt, als pad, zoals
  `configuratie.zones[0].sensors[1]`. Een `LEESMIJ.md` zegt wat erin zit.
- **Zonder namen en zonder ligging.** In elk bestand van de export, ook in het
  logboek, worden bewoners "Bewoner 1", "Bewoner 2" (in een entiteit of id
  `bewoner_1`). Dat geldt ook voor personen in Home Assistant die geen bewoner
  zijn. Een naam wordt alleen vervangen als heel woord, en pas vanaf drie
  letters. `latitude` en `longitude` worden overal `null`. Daarvoor pakt de
  export elke dag uit, en die staat daarna uitgepakt in het archief. Hij is
  dus trager dan voorheen, maar het archief zelf blijft gecomprimeerd.
- **Wat groeit.** Het logboek is ongeveer 5 MB per dag. Ingepakt na een week
  (besluit 58) blijft daar zo'n 60 MB per jaar van over, en na twee jaar
  vat besluit 83 het samen per uur. Bij Je gegevens staat hoe groot het nu is.
  De map `bench` op de NAS (ongeveer 560 MB) was een eenmalige proef uit
  besluit 34 en groeit niet. Niets leest hem: hij mag weg.
- **Versie 0.30.0.**

---

## 152. Openbaar, en het werk gaat via beta

*Onderwerp: uitrol en beheer · Status: geldig*

Op 17 oktober 2026 zette de bewoner de repository openbaar, voor de
add-on-bibliotheek uit besluit 118. Daarmee kwamen ook de export van Home
Assistant met de precieze ligging van het huis en de configuratie van deze
woning op straat. De app gaat later als add-on naar de Pi, die `main` volgt;
daar mag alleen komen wat de bewoner heeft goedgekeurd. De schaduw op de NAS
blijft de proeftuin.

*Besluit:*

- **Opgeschoond, de hele geschiedenis.** `HA export/` en
  `config/sites/huis-cornelissen.json` zijn uit elke commit gehaald, en de
  privé-mailadressen in de commits zijn het noreply-adres van GitHub geworden.
  Beide mappen staan in `.gitignore`. De tests rekenen met een naamloos
  voorbeeldhuis, `backend/test/fixtures/voorbeeld-huis.json`. De configuratie
  van een echte woning staat op de NAS en in de add-on, nooit in git ([21]).
- **Het werk gaat naar `beta`.** Een push daarheen draait de CI, en als alles
  groen is schuift `stable` mee. De NAS volgt `stable`, zoals in besluit 54;
  daar verandert niets.
- **Naar `main` alleen met toestemming:** een pull request van `beta` naar
  `main`, dat de bewoner samenvoegt. De CI draait ook daarop. `main` is
  beveiligd: geen push zonder pull request, en nooit geforceerd.
- **De CI draait weer bij elke push** (in plaats van besluit 135): een
  openbare repository kost geen minuten. `tools/vrijgeven.sh` blijft voor als
  de CI het niet kan, en werkt nu vanaf `beta`.
- **Wat niet weg is:** de pull requests 1 tot en met 8 houden de oude commits
  op GitHub bereikbaar via een directe link. Alleen GitHub Support kan die
  opruimen. Een oude kloon of oude werkmap mag nooit meer gepusht worden.

---

## 153. De add-on komt kant-en-klaar van GitHub

*Onderwerp: uitrol en beheer · Status: geldig*

Op 17 oktober 2026 koos de bewoner de eerste stap naar de app op de Pi: de
add-on installeerbaar maken uit de openbare repository, zodat hij de app via
Ingress op zijn tablet kan proberen voordat de app verder verandert. Daarbij
bleek dat de add-on al maanden niet meer te bouwen was: de tekenmotor uit
besluit 104 (`frontend/kit`) zat wel in het image van de NAS, niet in dat van
de add-on.

*Besluit:*

- **GitHub bouwt de images,** voor aarch64 (de Pi) en amd64, elk op een eigen
  machine van die soort (`.github/workflows/addon.yml`). De Pi bouwt niets;
  `image:` in `addon/config.yaml` wijst naar
  `ghcr.io/ricardo-switch/{arch}-hems-climate`. armv7 valt af.
- **Op een pull request naar `main`** wordt alleen gebouwd, als proef. **Na het
  samenvoegen** wordt gebouwd en verstuurd, en alleen een versie die er nog
  niet is: een versienummer wijst altijd naar dezelfde code.
- **De versie van de add-on is de versie van de app.** Een test houdt `version`
  in `config.yaml` gelijk aan `VERSIE`. Home Assistant ziet een update zodra
  dat nummer op `main` omhooggaat; automatisch bijwerken is een schakelaar op
  de add-on-pagina.
- **Twee Dockerfiles, dezelfde bronnen.** Een test eist dat `addon/Dockerfile`
  dezelfde mappen kopieert als `backend/Dockerfile`, dat `stage.ps1` ze
  allemaal klaarzet, en dat manifest, `build.yaml` en de workflow dezelfde
  soorten noemen.
- **Een lokale add-on blijft kunnen:** `stage.ps1` haalt de regel `image:` uit
  de kopie, zodat de Supervisor zelf bouwt.
- **De add-on heet Smart Climate,** niet meer "schaduwmodus".
- **Verschil met de NAS:** de basis van Home Assistant (Alpine 3.24) draait
  Node 24, de NAS en de tests Node 22. Gemeten op 17 oktober: het image start,
  verbindt met Home Assistant en beslist.

---

## 154. De add-on opent de app, en een leeg huis begint met een welkom

*Onderwerp: weergave · Status: geldig*

Op 17 oktober 2026 installeerde de bewoner de add-on op de Pi. Twee dingen
vielen op: hij opende in de cijferpagina, de oude schaduwweergave, en via de
app kwam je in een lege app. De keuzes zijn van de bewoner, met de schetsen
`Wand-Welkom` en `Welkom-Tel` in `design/app2/`.

*Besluit:*

- **In de add-on is de app de voordeur.** Het begin van de add-on opent Thuis;
  de cijferpagina (`index.html`) blijft alleen voor wie hem direct opent. Op de
  NAS blijft het begin de cijfers.
- **Een leeg huis begint met een welkom** (`begin.html`), over het hele scherm
  en zonder menu. Zolang er geen configuratie is, gaat elke pagina van de app
  daarheen. Links "Welkom thuis." met wat Smart Climate doet en één knop,
  "Richt je huis in"; rechts groeit het huis etage voor etage uit wat Home
  Assistant kent, met een teller die telt zoals Inrichten (etages, ruimtes,
  apparaten). De lucht en de zon volgen de klok; zonder beweging als het
  apparaat daarom vraagt.
- **Ontdekken gaat vanzelf.** Waar de ontdekking zelf iets koos, of een
  antwoord leeg mag blijven, neemt het welkom dat over; alleen een verplichte
  keuze zonder voorstel wordt een vraag, één tegelijk, met de namen uit Home
  Assistant (besluit 45). Inrichten laat het later veranderen. Na het opslaan
  start de dienst opnieuw (besluit 151) en gaat het verder in Inrichten.
- **"Ik heb een back-up"** zet een back-up terug, bijvoorbeeld die van de NAS;
  daarna opent Thuis.
- **Achter Ingress altijd relatieve adressen,** want de app staat daar onder
  een pad van Home Assistant. Wie voor het eerst via Home Assistant komt,
  krijgt ook daar eerst "wie ben je?" (besluit 147).
- **Versie 0.31.0.**

---

## 155. Volledig scherm in Home Assistant, per apparaat

*Onderwerp: weergave · Status: geldig*

Op 17 oktober 2026 vroeg de bewoner hoe de zijbalk van Home Assistant weg kan,
zoals de kioskmodus van HACS dat doet, met een weg terug naar Home Assistant.
Die kioskmodus werkt alleen op dashboards, niet op het paneel van een app.

*Besluit:*

- **Home Assistant doet het zelf.** Het paneel van een app luistert naar een
  bericht uit de app: `home-assistant/subscribe-properties` met `kioskMode`.
  Dan verbergt Home Assistant de zijbalk en de kopbalk, en zet ze weer terug
  als je het paneel verlaat. Een andere pagina van de app laat de stand staan.
  Nagelezen in `src/panels/app/ha-panel-app.ts` van de frontend.
- **Ook de balken van de browser weg:** bij de eerste tik vraagt de app het
  hele scherm, op het document van Home Assistant om de app heen. Dat blijft
  staan als de app een andere pagina laadt.
- **Per apparaat,** bij Bewoners en toegang › Dit scherm, alleen als de app in
  Home Assistant draait. De keuze staat in de browser van dat apparaat: aan op
  de wand, uit op de telefoon.
- **Terug naar Home Assistant** met een knop boven de bel, en bij Dit scherm.
  Het hele scherm gaat uit, de kioskstand ook, en Home Assistant opent zijn
  dashboard (`home-assistant/navigate`).
- **Getest met een nagemaakte Home Assistant** om de app heen, die de
  berichten opschrijft. Op de Pi zelf nog na te lopen.
- **Versie 0.32.0.** Daarbij: de begrenzer van de filmmuziek houdt de piek
  onder 0,92.

*Aanvulling (17 oktober 2026, versie 0.34.1).* In Home Assistant vielen
twee dingen op:

- **Op de telefoon liep het hele scherm over de camera bovenin,** en de
  terugknop van Android zette het weer uit (de app van Home Assistant). Op een
  telefoon vraagt de app daarom alleen nog de kioskstand van Home Assistant,
  zonder de zijbalk en de kopbalk. De statusbalk met de camera blijft, en de
  terugknop gaat gewoon een pagina terug. De wand houdt het hele scherm; zet
  Android het daar uit, dan vraagt de app het weer bij de volgende tik.
- **Op de tablet gaf een andere pagina even zwart.** Tot die er staat is het
  vak van het paneel leeg, en via Home Assistant duurt dat langer dan op de
  NAS. Het vak krijgt nu de lucht van dat moment als achtergrond.

Daarbij, ook alleen in Home Assistant: **"Hé huis" hoorde niets, en de
microfoon brak na een tel af.** De microfoon zocht de dienst op `/api/luister`,
met een / vooraan. Achter Ingress is dat Home Assistant zelf, dat de
verbinding meteen sloot. Nu staat hij naast de pagina, zoals alle andere
vragen aan de dienst, en een test houdt de weergave vrij van zulke paden.

*Aanvulling (18 oktober 2026, versie 0.34.2).* De camera bovenin op de
telefoon kwam niet door de app: in de app van Home Assistant stond zelf
volledig scherm aan, met een schaal van 75%. Zonder het hele scherm van de
browser bleef er een grote grijze balk bovenin over. De telefoon vraagt dus
weer het hele scherm, net als de wand en net als in versie 0.34.0.

*Aanvulling (18 oktober 2026, versie 0.34.3).* **Naar Home Assistant** opende
het standaarddashboard, en dat was niet het dashboard dat de bewoner gebruikt.
Rechtop op de telefoon stond de knop er niet, want daar is geen balk. Nu:

- **Je blijft in de app.** Het volledige scherm en de kioskstand gaan uit, de
  zijbalk en de kopbalk van Home Assistant komen terug, en je kiest daar zelf
  je dashboard.
- **Dezelfde knop zet het weer aan.** Tot dan laat een andere pagina van de
  app het zo. Dat onthoudt de app bij het vak van het paneel; open je de app
  later opnieuw (een nieuw vak), dan is het volledige scherm er weer.
- **Op de telefoon** staat de knop rechtsboven op Thuis en Apparaten, naast
  het tandwiel. Op de wand blijft hij boven de bel.

*Aanvulling (18 oktober 2026, versie 0.34.4).* De PR van 0.34.3 was al
samengevoegd voor de twee punten hieronder erbij kwamen; ze staan in 0.34.4.
Op de telefoon begon de app daardoor met een grijze statusbalk, en verdween
die bij een andere pagina weer.

- **Een telefoon krijgt nooit het hele scherm van de browser,** ook liggend
  niet; alleen de kioskstand. Met het hele scherm schoof de statusbalk na de
  terugknop over de pagina, en was hij er op de ene pagina wel en op de andere
  niet. Nu ziet de app er in Home Assistant uit als de geïnstalleerde app van
  de NAS: de statusbalk erboven, de pagina eronder. Een telefoon is een scherm
  met een kortste kant onder 600. Het volledige scherm in de instellingen van
  de app van Home Assistant zelf hoort daarvoor uit te staan.
- **De statusbalk in de kleur van de app,** niet grijs. De app van Home
  Assistant kleurt de statusbalk en de balk onderin naar het thema
  (`--app-header-background-color` en `--primary-background-color`), en leest
  die opnieuw bij het bericht `theme-update`; nagelezen in `WebViewAction.kt`
  van de Android-app en `themes-mixin.ts` van de frontend. Zolang Smart
  Climate volledig scherm heeft, zet de app die twee op `#0b1424`, de kleur
  van de app op de NAS. Bij Naar Home Assistant, en als je het paneel
  verlaat, komt het thema terug; dat terugzetten leeft bij Home Assistant,
  want de pagina van de app is dan al weg.
- **Op de telefoon schuift de pagina mee, waar je de vinger ook neerzet.** In
  Inrichten was de lijst een eigen schuifvak dat het schuiven vasthield
  (`overscroll-behavior: contain`). Op de wand heeft dat vak een vaste hoogte;
  op de telefoon is het even hoog als de lijst, dus viel er niets te schuiven,
  maar het hield de vinger wel vast. Alleen vegen naast de kaart werkte. Op de
  telefoon is het nu geen schuifvak meer. De uren in het weerblad hielden een
  veeg omhoog ook tegen (`touch-action: pan-x`). Een paginatest veegt op de
  telefoon op elke pagina op drie hoogtes, met een echte vinger via Chrome.
- **Wat verwarmt of koelt heeft geen ×** bij wat er gevonden is: dat hoort bij
  de regeling. De uitleg zegt het nu.

---

## 156. De eerste dag uit Home Assistant, en een back-up met zijn configuratie

*Onderwerp: weergave · Status: geldig*

Op 17 oktober 2026, de eerste middag van de add-on op de Pi, zag de bewoner op
Thuis "0,2 kWh opgewekt", een zon die om vijf uur begon en geen verwachting.
Onder de kop "De badkamer zou verwarmen" stond nog eens "Badkamer: zou
verwarmen."

*Besluit:*

- **Vandaag vult aan uit Home Assistant.** Het eigen logboek begint pas als
  Smart Climate draait. Een kwartier zonder eigen meting komt uit de
  statistiek van Home Assistant: het gemiddelde vermogen van de panelen en het
  net per vijf minuten, met dezelfde leesvraag als Opbrengst (besluit 102).
  Dat telt mee in wat er opgewekt is, van het net kwam en terugging. Gemeten
  op 17 oktober: 6,77 kWh tegen 6,98 kWh op de energiemeter van de panelen.
- **Onder de kop over één kamer de getallen:** "Het is er 19,5°, het doel is
  20°.", en "Dat kan op eigen zon." als dat zo is.
- **Een back-up vervangt in de add-on de configuratie** (aanvulling op besluit
  151). Daar maakte de app hem zelf, uit de ontdekking; die van de back-up kwam
  er niet in als er al een stond, en daarmee bleven bijvoorbeeld de panelen
  weg. Op de NAS is de configuratie van de beheerder, en die blijft.
- **Wat het aan het licht bracht:** de ligging van de panelen (richting,
  helling, vermogen) staat alleen in een configuratie die met de hand is
  geschreven. Een nieuw huis zonder die regels heeft geen Zon, geen
  verwachting en geen gestippelde lijn. Opgelost in besluit 157.
- **Versie 0.32.1.**

---

## 157. Hoe de panelen liggen, gemeten uit tien dagen opbrengst; de bewoner bevestigt

*Onderwerp: meten, data en analyse · Status: geldig*

Besluit 156 bracht het aan het licht: de ligging van de panelen (richting,
helling, vermogen) stond alleen in een configuratie die met de hand was
geschreven. Een nieuw huis via de add-on kreeg hem nooit, en had dus geen Zon,
geen weer met opbrengst en geen verwachting op Thuis en Vandaag. Besluit 93 zei
al dat de app het zelf meet en de bewoner bevestigt; dat bestond nog niet.
Gekozen op 17 oktober 2026 door de bewoner, uit vragen, zelf afleiden of
allebei, met de schets `Wand-Inrichten-Panelen` (en `Panelen-Tel`).

*Besluit:*

- **Meten uit de statistiek van Home Assistant.** De opbrengst van de
  afgelopen tien dagen, per vijf minuten (zo lang bewaart Home Assistant die
  standaard), om de drie uur opnieuw. Per tijdstip van de dag telt de hoogste
  dag: één heldere dag in tien is genoeg. Elke richting en helling gaat langs,
  per graad, met één vlak of twee tegenover elkaar, naar de kant van het dak
  uit Inrichten. Het vlak waarvan de vorm van de dag het best past, wint; het
  midden van de hoogte geeft het vermogen. Het aantal panelen houdt dat tussen
  250 en 550 Wp per paneel. Past niets goed, past minder dan 60% van de
  bovenkant, of beslaat het minder dan vijf uur van de dag, dan is er geen
  heldere dag geweest en geen meting.
- **De omvormer uit zijn typenummer** in Home Assistant: "SE3000H" is
  3.000 W. Ook Growatt, Huawei, SMA, Fronius en GoodWe. Wat er afgekapt is,
  telt niet mee voor de richting.
- **De bewoner bevestigt,** in Inrichten (Energie › Hoe ze liggen) en bij
  Instellingen › Energie › Zonnepanelen: de ligging in woorden ("Oost en
  west", "Rond 50°, een steil dak", "Samen zo'n 5 kWp"), met de lijn van de
  helderste dag, gemeten naast wat bij die ligging hoort. Dan "Klopt" of
  "Aanpassen": de voorkant op een kompas, de helling, de wattpiek per paneel
  en de omvormer.
- **De voorkant:** bij panelen op twee kanten met evenveel panelen ziet de
  meting niet welke kant voor is. Dan één vraag: "wanneer schijnt de zon op de
  voorkant?" (bij oost en west alleen ochtend of avond). Daaruit volgen de
  gevels, voor de screens.
- **Zonder heldere dag een schatting:** de kant van het dak, de voorkant, een
  gewoon dak van 40° en 400 Wp per paneel. Zon, het weer en de verwachting
  werken meteen. Komt er een meting, dan staat er een melding bij de bel tot
  de bewoner kijkt.
- **Wat geldt:** wat de bewoner bevestigde, dan de configuratie, dan de
  meting, dan de schatting. Wat de bewoner bevestigt, gaat dus voor het
  bestand, zoals de zekering (117); op de NAS verandert er niets tot dan. Een
  bevestigd dak vervalt als de kant of het aantal panelen verandert, en een
  latere meting verandert het niet ("opnieuw meten" kan).
- **Zonder herstart:** de regeling leest de ligging niet (93), dus de dienst
  legt hem over wat de app en de assistent lezen.
- **Bewaard bij de antwoorden** (`aansluiting.json`): `voorkantZon` en `dak`,
  zonder plaats. De ligging van het huis blijft alleen in het geheugen (90).
- **Versie 0.33.0.**

*Getoetst op dit huis, 17 oktober 2026 (twaalf dagen per vijf minuten):*

| Dagen | Richting | Helling | Vermogen |
| --- | --- | --- | --- |
| Alle twaalf | 93° en 273° | 52° | 5,3 kWp |
| 9 tot 13 oktober, één heldere dag | 93° en 273° | 53° | 5,1 kWp |
| 14 en 15 oktober | 90° en 270° | 50° | 4,8 kWp |
| 9, 11 en 13 oktober, bewolkt | geen meting | | |
| Werkelijk (besluit 93) | 97° en 277° | 47° | 4,68 kWp |

De richting zit binnen vijf graden, de helling binnen zes, het vermogen 3 tot
13% te hoog: binnen "zo'n". Zonder het aantal panelen kwam er op één dag
"noorden, 60°, 44 kWp" uit; daarom de grens per paneel. Met de op één na
hoogste dag per tijdstip (zoals de geleerde lijn, 93) vond hij met één heldere
dag in tien niets, want dan is de op één na hoogste bewolkt.

*Wat het nog liet zien:* elke heldere dag zakt de opbrengst tussen 16:40 en
16:50 van zo'n 1.200 naar 200 W, terwijl de zon nog op het westdak staat:
schaduw, van een buurhuis of een boom. De meting laat die momenten weg; de
geleerde lijn neemt de schaduw na vijftien dagen mee (93).

*Wat afviel:* alleen vragen (de bewoner weet richting en helling zelden, 93);
de ligging op een kaart (dan gaat de ligging naar een kaartdienst buiten het
huis, 90); de instellingen van Forecast.Solar overnemen (die zijn alleen te
lezen door een flow in Home Assistant te starten, en dat is schrijven);
uurwaarden (te grof voor de vorm van de dag).

*Nog niet:* wat een latere meting anders ziet dan een bevestigd dak, wordt
volgens besluit 93 een vraag. Dat komt als er een tweede seizoen is om mee te
vergelijken.

---

## 158. Inrichten: overal Terug en Volgende, en wat de bewoner tegenkwam

*Onderwerp: weergave · Status: geldig*

Op 17 oktober 2026 richtte de bewoner zijn huis zelf in via de add-on, en
schreef op wat hem tegenzat: het welkom had alleen "Later" en "Klopt", de
stappen stonden al groen voordat hij er was geweest, de getallen op het
startscherm deden niets, verplaatsen leek niet te kunnen, keuken en
woonkamer waren twee kamers zonder zones, buiten kon per ruimte maar één ding
zijn, "Waar staan 1 dit apparaat?", soms wel en soms geen Terug, het aantal
panelen werd niet gevraagd, en de prijzen gingen uit van een dal- en
normaaltarief. Een check van de code vond meer: Volgende bewaarde niets van
wat er voorgesteld stond, comfort voor het hele huis overschreef elke kamer,
een huis zonder panelen kon de stap niet afmaken, en "Buiten" telde als etage.

*Besluit:*

- **Onderaan overal hetzelfde:** links Terug, rechts Volgende. Volgende
  bewaart wat er in beeld staat, ook als je niets aanraakte: het voorstel uit
  Home Assistant voor de kamers, een kamer voor een los apparaat (ook het
  voorstel uit zijn naam), wat er buiten is, de prijzen uit het
  Energie-dashboard en licht en camera's. "Later" is weg: wie iets overslaat,
  drukt op Volgende en houdt het voorstel.
- **De balkjes in drie standen:** groen is nagelopen (de bewoner drukte hier
  op Volgende, onthouden op het apparaat zoals de rondleiding), omlijnd staat
  al klaar uit Home Assistant, grijs is nog open. Klaar noemt wat nog niet is
  nagelopen.
- **Het startscherm telt eerlijk en tikt open:** etages zonder Buiten, kamers
  met het aantal buiten erbij. Een getal opent de lijst; een apparaat dat er
  niet bij hoort, haal je daar met × weg (behalve wat verwarmt of koelt).
- **Welkom bij de eerste inlog: "Klopt iets niet?"** zegt per regel waar je het
  verandert: de hoofdgebruiker bij Bewoners, de persoon die aan je account hangt
  in Home Assistant zelf, een andere sensor bij Bewoners.
- **Klopt je huis?** Een kamer aantikken geeft velden met hun naam erboven
  (Naam, Etage, Soort kamer), zones met hun soort, samenvoegen met een kamer
  op dezelfde etage en weghalen (met een tweede tik). Samenvoegen maakt van de
  tweede kamer een zone van de eerste, met zijn apparaten; twee kamers met elk
  een eigen regeling voeg je samen bij Indeling. Buiten staat hier niet meer.
- **Wat er rond het huis is,** elk deel apart aan of uit: oprit, auto, voortuin,
  achtertuin, terras, balkon en tuinhuis. Dat staat in de indeling als `rond`
  en gaat voor de ruimtes; een deel zonder ruimte wordt getekend zonder lampen.
  Een ruimte buiten zegt nog bij welk deel zijn lampen en camera horen, en kan
  nu ook het tuinhuis zijn: zijn lampen verlichten het tuinhuis.
- **Een kamer uit de naam van het apparaat:** "Bewegingssensor entree" krijgt
  de Entree voorgesteld, als heel woord en de langste kamernaam eerst.
- **De panelen:** eerst "Ja" of "Geen panelen" (nieuw: `ligging: geen`), dan de
  kant van het dak, dan het aantal, per kant bij beide kanten. De ligging zelf
  (richting, helling, vermogen) is besluit 157.
- **De verwarming staat bij Klimaat,** met Hybride erbij.
- **De prijzen:** eerst het contract (één tarief, dag en nacht, dynamisch), dan
  alleen de velden die erbij horen, met gas en wat je vanaf 2027 voor
  teruglevering krijgt en betaalt. Een leeg vak zegt "invullen" en lijkt niet
  meer op een getal.
- **Comfort voor het hele huis** zet alleen de kamers die de waarde van de
  meeste hebben; een kamer die de bewoner zelf anders zette, blijft, tenzij hij
  "Ook gelijk zetten" kiest.
- **De wand** zet je op de tablet zelf: de stap zegt hoe, met een code om te
  scannen, en welke schermen er al zijn. De knop die dít apparaat inlogde, is
  weg.
- **Lijsten die langer zijn dan de kaart** vervagen aan de onderkant, zodat je
  ziet dat er meer is.
- **Teksten:** "Waar staat dit apparaat?", "Zonneschermen" in plaats van
  "Screens", ongeveer tien minuten (zoals het welkom zegt), en de zekering
  zegt wat het huis ermee doet zonder te beloven dat het al schakelt.

---

## 159. Thuis op de telefoon: de Assistent altijd in beeld

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 zei de bewoner: "op het beginscherm portretmodus zit de
assistant nu laag verborgen onder de kamers". Op een telefoon van 390 × 844
zag je bij openen de kop, het huis en twee kamers; de vraag aan de Assistent
stond pas na de Straks-kaart, ver onder de tabs. Bovenin liepen de knoppen
over twee regels zodra de stand niet Automatisch was (zoals Afwezig). En wat
de wand rechts heeft, Vandaag, het apparaat dat draait en Hoe voelt het, stond
op de telefoon niet.

Drie schetsen (`design/app2/Thuis-Tel.html`): A een vraagbalk die altijd boven
de tabs staat, B de Assistent onder de kop met snelle vragen, C een ronde knop
rechtsonder. De bewoner koos A, met de kamers in één kaart, alles van de wand
erbij en een microfoon die meteen luistert.

*Besluit:*

- **De vraagbalk staat altijd boven de tabs,** ook als je schuift: de bol en
  "Vraag iets over je huis" openen de Assistent met het typveld
  (`assistent.html#typ`), de microfoon rechts opent hem en luistert meteen
  (`assistent.html#praat`). De microfoon staat er alleen waar hij kan (over
  https, besluit 150). Houdt de browser het geluid zonder tik tegen, dan zegt
  de Assistent "Tik op de microfoon om te praten." De tab Assistent blijft.
- **Bovenin één regel:** de klok, het weer, ?, de bel, (Naar Home Assistant)
  en het tandwiel. De stand, als die afwijkt, staat rechts naast de
  begroeting.
- **De kamers in één kaart,** een regel per kamer met de kleur van wat hij
  doet, de temperatuur en een pijl naar de kamer.
- **Daaronder, in deze volgorde:** Straks, het apparaat dat draait of
  klaarstaat, Hoe voelt het nu? en Vandaag (de zon van vandaag, met een tik
  naar de tab). Het huis is iets lager (330 in plaats van 360), zodat de
  kamers eerder in beeld komen.
- **De wand blijft zoals hij is.** Een paginatest loopt de telefoon na: de
  balk in beeld en boven de tabs, ook onderaan; de knoppen op één regel; de
  kamers in één kaart; de volgorde; en de microfoon die meteen luistert.

---

## 160. Smart Climate los op de telefoon: een eigen poort in de add-on, via Tailscale

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 zei de bewoner dat hij de app mist die hij vanaf de NAS in
Chrome had geïnstalleerd: in Home Assistant voelt Smart Climate als een
onderdeel dat je eerst in de zijbalk opzoekt. Uitgezocht en voorgelegd: (1)
het paneel als startpagina van Home Assistant, (2) een snelkoppeling in de app
van Home Assistant, en (3) een eigen poort, zodat de app weer los te
installeren is. De bewoner koos de snelkoppeling nu en de eigen poort erbij;
Home Assistant blijft openen zoals het opent, en de eigen poort antwoordt
alleen via Tailscale.

Wat het uitzoeken liet zien (nagelezen in de bron van Home Assistant):

- **Het paneel staat niet in de keuzelijst** bij Profiel › Dashboard. Die toont
  alleen dashboards en de vaste panelen van Home Assistant
  (`ha-pick-dashboard-row.ts`). Het paneel van een add-on heet naar de
  volledige naam van de add-on (`<code>_hems_climate`, `addon_panel.py`), en
  Home Assistant opent elke paneelnaam die als standaard is opgeslagen: voor
  een account (`frontend/set_user_data`) of, als oude terugval, per apparaat
  (`defaultPanel` in de browser). Dat kan de app zelf zetten, maar de bewoner
  wil het niet.
- **Een snelkoppeling kan zonder code:** in de app van Home Assistant op
  Android maak je een vastgezette snelkoppeling met het pad van het paneel
  (`/<code>_hems_climate`), een eigen naam en een eigen icoon. Die opent Home
  Assistant meteen op Smart Climate, met eerst het laadscherm van Home
  Assistant.
- **Het paneel staat alleen bij beheerders.** `panel_admin` staat standaard
  aan; bewoners zonder beheerdersrechten zien Smart Climate niet in de zijbalk.
  Dat blijft hier zo, en wacht een eigen besluit (dat werd besluit 161).

*Besluit:*

- **Een eigen poort naast Ingress,** `8100/tcp` in `addon/config.yaml`.
  Standaard dicht: wie hem wil, vult in het tabblad Netwerk van de add-on een
  poort in. Ingress verandert niet.
- **Alleen via Tailscale.** De dienst antwoordt op die poort alleen op wat
  Tailscale over https doorgeeft, op een naam op `.ts.net`
  (`viaTailscale`); het adres van de Pi met het poortnummer krijgt "Open Smart
  Climate via het adres in Tailscale". Een slot is dat niet, want iemand op
  het thuisnetwerk kan die koppen zelf meesturen; het slot is het inloggen.
- **Inloggen via Home Assistant,** zoals op de NAS (besluiten 99 en 147), met
  een sessie per adres. De koppen van Ingress tellen op de eigen poort niet:
  elk verzoek daar krijgt de toegang van de eigen poort, en een test bewijst
  dat. De browser gaat naar het adres dat de bewoner bij `ha_adres` invult (waar
  zijn telefoon Home Assistant opent); de dienst zelf vraagt Home Assistant op
  `http://homeassistant:8123`, in het netwerk van de add-ons. Zonder `ha_adres`
  blijft de poort dicht, met een regel in het logboek.
- **Https met een dienst in Tailscale** (Tailscale Services), in de
  Tailscale-add-on op de Pi: `svc:smartclimate` wijst naar
  `http://127.0.0.1:8100`, over https op poort 443. Zo heet de app
  `smartclimate.<tailnet>.ts.net`, met een echt certificaat. Dit vult besluit
  108 aan: daar mocht serve alleen naar de dienst op de NAS; nu ook naar de
  eigen poort van de add-on op de Pi. De rest van 108 blijft: alleen in het
  tailnet, nooit Funnel, nooit een portforward.
- **Dezelfde app.** Manifest en service worker staan er al; over https biedt
  Chrome het installeren aan, met het eigen icoon en zonder Home Assistant
  eromheen. De stand van volledig scherm en de kioskstand (besluit 155) gelden
  alleen in Home Assistant en staan op de eigen poort uit.
- **Versie 0.36.0.**

*Kosten:* de Pi krijgt in Tailscale een tag, omdat een dienst in Tailscale dat
vraagt. Een apparaat met een tag hoort daarna bij het tailnet en niet meer bij
een persoon; met de standaardregels van Tailscale maakt dat voor de toegang
niets uit, met eigen regels wel. De naam `smartclimate` komt, net als in 108,
in de openbare certificaatlogboeken. Op de Pi zelf nog na te lopen: of de
Tailscale-add-on de poort op `127.0.0.1` bereikt, en of de telefoon de app
installeert.

---

## 161. Het paneel voor iedereen, en achter Ingress de rol uit Home Assistant

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 bleek dat het paneel van de add-on alleen bij beheerders in
de zijbalk van Home Assistant staat: `panel_admin` ontbrak in
`addon/config.yaml`, en staat dan aan. Bewoners zonder beheerdersrechten en het
account van de wand (besluit 147, 151) kwamen er niet in. Daarnaast gaf
`ingressVisitor` iedereen achter Ingress de rol beheerder, zodat de controle per
deur (besluit 99) en de regels voor een gast (besluit 147, 151) daar niet
golden.

Wat het uitzoeken liet zien (nagelezen in de bron van de Supervisor en Home
Assistant):

- **`panel_admin` verstopt niet alleen.** Met `panel_admin` aan weigert de
  Supervisor Ingress voor wie geen beheerder is (`api/ingress.py`); zonder
  kwamen Noor en de wand er dus helemaal niet in.
- **Ingress zegt wie, niet wat.** De Supervisor geeft `X-Remote-User-Id`,
  `-Name` en `-Display-Name` mee, en haalt die koppen eerst weg als de browser
  ze zelf meestuurt. Of iemand beheerder is, geeft hij niet mee.
- **De dienst kan het zelf vragen.** `config/auth/list` op de websocket geeft
  per account de groepen (`system-admin`) en of het de eigenaar is. Die vraag
  vraagt een beheerder, en de Supervisor is er een: de add-on mag hem stellen.

De bewoner koos uit de voorgelegde opties steeds de aanbevolen.

*Besluit:*

- **`panel_admin: false`.** Iedereen met een account in Home Assistant ziet
  Smart Climate in de zijbalk: bewoners, gasten met een account en de wand. Wat
  iemand mag, bepaalt de app.
- **Beheerder is wie dat in Home Assistant is,** ook achter Ingress, net als
  bij inloggen op de NAS en op de eigen poort (besluit 99, 160). De dienst
  vraagt de accounts op (`config/auth/list`, nu op de lijst van leesopdrachten
  van `HaClient`) en onthoudt ze een minuut. Beheerder: in de groep
  beheerders of eigenaar, en niet uitgeschakeld. De rol per deur
  (`DOOR_ROLES`) geldt daarmee ook achter Ingress.
- **Bij twijfel bewoner.** Antwoordt Home Assistant niet, dan is niemand
  beheerder; na vijftien seconden vraagt de dienst het opnieuw. Licht,
  scènes, screens en comfort werken dan gewoon; het huis, de energie en de
  functies instellen even niet.
- **Een gast is overal een gast.** Kijken, en licht, scènes en screens alleen
  als hij thuis is (besluit 147, 151), nu ook achter Ingress; zijn gegevens
  downloaden kan hij er ook niet meer.
- **In de app** staat bij Inloggen achter Ingress "Ingelogd via Home Assistant
  als …, bewoner" (of beheerder), in plaats van "geen inlog nodig".
- **Versie 0.37.0.**

*Kosten:* de wand en elke bewoner die in Home Assistant geen beheerder is,
kunnen achter Ingress het huis, de energie, de functies en de onboarding niet
meer instellen; dat kon tot nu toe wel. Wie dat wil, maakt het account in Home
Assistant beheerder. Een nieuwe beheerder telt na hooguit een minuut. De app
laat de knoppen voor instellen nog gewoon zien; een bewoner krijgt bij bewaren
"dit mag alleen de beheerder", zoals op de NAS.

---

## 162. Thuis naar eigen smaak: kaarten en favorieten, per account en voor de wand

*Onderwerp: weergave · Status: deels vervangen door 181*

Op 18 oktober 2026 vroeg de bewoner: "we zouden het misschien
personaliseerbaar kunnen maken", voor telefoon en tablet. Uit twaalf ideeën
koos hij er vier om te schetsen: kaarten kiezen en schuiven, favorieten met
één tik, een nachtstand en rust op de wand, en eenvoudig of uitgebreid
(`design/app2/Thuis-Tel-Eigen.html`, `Wand-Thuis-Eigen.html`,
`Wand-Nacht.html`). Hij koos: bewaard bij je account, aanpassen op Thuis zelf,
de wand alleen door de hoofdgebruiker, hooguit vier favorieten, Straks dat op
de wand vanzelf bovenin bijschuift, en eerst kaarten en favorieten bouwen.

*Besluit:*

- **Bewaard bij je account** (`voorkeuren.json` naast de dataset, mee in de
  back-up): op de telefoon welke kaarten Thuis heeft en in welke volgorde, en
  je favorieten. Zonder inlog (de NAS op het thuisnetwerk) is er één keuze voor
  iedereen. Er gaat niets naar Home Assistant.
- **Aanpassen op Thuis zelf:** onderaan *Thuis aanpassen*. Elke kaart krijgt
  een greep (*Schuif*, ook met de pijltjes) en een oog om hem te verbergen;
  een kaart doet dan zelf niets. *+ Kaart* zet een verborgen kaart terug, of
  het weer van morgen erbij. Een gekozen kaart die nu niets te zeggen heeft
  (Straks, het apparaat) staat in de bewerkstand als vak met wat er komt.
  Schuif je aan de rand, dan schuift de pagina mee.
- **Favorieten:** een kaart met hooguit vier tegels, scènes en lampen uit de
  indeling. Een tik schakelt via dezelfde deuren als in een kamer
  (`/api/licht`, `/api/scene`, besluiten 97 en 100); de lamp toont meteen wat
  je koos, tot Home Assistant het bevestigt. Staat licht bedienen uit, dan
  zijn de tegels grijs. Nieuw op Thuis staat Favorieten onder de kamers, eerst
  met een knop Kiezen.
- **De wand is van iedereen:** één indeling voor het hele huis, die de
  hoofdgebruiker of een beheerder aanpast met het potlood bovenin. Vier vakken,
  want de wand schuift nooit; Vandaag vraagt er twee. Wat niet past, kan pas
  als er plek is. Straks staat niet in de lijst: dat schuift er bovenin bij als
  het huis op zon wacht, en de onderste kaart wijkt dan even. Zonder keuze
  staan er Vandaag, Hoe voelt het en het apparaat: wijkt er een, dan het
  apparaat, zodat je altijd kunt zeggen hoe het voelt. De wand heeft zijn
  eigen favorieten.
- **Nog niet:** de nachtstand en rust op de wand, en eenvoudig of uitgebreid
  met grotere letters en minder beweging. Die staan in de schetsen en volgen
  in een volgende stap; net als de auto, de batterij, deze maand en de
  deurbel als kaart.

---

## 163. Een groep instellingen: de delen onder elkaar, een deel als eigen scherm

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 zei de bewoner: "de schuifbalken bovenin bij instellingen
op de telefoon zijn niet handig". Een aanvulling op besluit 130. In elke groep
achter het tandwiel (Comfort, Energie, Regeling, Functies, Bewoners en toegang) stonden de delen op de
telefoon in een rij die je opzij moest vegen, met de rechterkant half uit
beeld. Hij vroeg ook te kijken of het op de tablet makkelijker kon. Op de
wand waren de regels links klein om op te tikken, nam een kolom met uitleg
rechts veel plek, en liepen Zonnepanelen, Meters en Contract en prijzen
onderaan door. Schetsen: `design/app2/Instellingen-Tel-Groep.html` en
`Wand-Instellingen-Groep.html`.

*Besluit:*

- **De delen als lijst**, zoals de instellingen van een telefoon: per deel een
  regel met een icoon, de naam en hoe het ervoor staat. Wat mist staat
  bovenaan (binnen zijn kopje) en in oranje. Bovenin staat in één oogopslag
  hoeveel er mist en hoeveel klaar is.
- **Op de telefoon eerst alleen de lijst.** Een deel opent als eigen scherm
  (`energie.html#aansluiting`), met *‹ Energie* terug naar de lijst. Kwam je
  uit de lijst, dan is dat gewoon een stap terug; kwam je rechtstreeks op een
  deel, dan vervangt de lijst het adres.
- **Onderaan Vorige en Volgende**, op de telefoon en op de wand, in de
  volgorde van de lijst. Ze vervangen het adres: terug gaat naar de lijst en
  niet langs elk deel.
- **Op de wand geen kolom met uitleg meer.** *Waarvoor dit nodig is* en *Waar
  vind je het?* zitten achter de knop *Waarvoor is dit?* onderaan, naast Vorige
  en Volgende; bovenin botste een knop met wat een deel daar zelf toont (de
  temperatuur bij Comfort). Het gekozen deel krijgt de hele breedte; Energie
  zet Zonnepanelen, Meters en Contract en prijzen in twee kolommen. Zo past elk
  deel zonder scrollen; alleen de lijst met versies mag in zijn vak schuiven.
  Een paginatest houdt dat zo.
- **Comfort:** hoe het nu gaat in een kamer staat bovenin het kamervak, naast
  de naam, en niet meer in de kolom ernaast. Daar komt ook wat het huis
  leerde, als dat er komt.
- **Je huis** (de indeling) heeft zijn eigen opbouw en blijft zoals hij is.

---

## 164. De wand als niemand kijkt, en de weergave per account

*Onderwerp: weergave · Status: aangevuld door 165*

De tweede stap van besluit 162, op 18 oktober 2026. De bewoner had de
nachtstand, rust overdag en eenvoudig of uitgebreid al gezien in de schetsen
(`design/app2/Wand-Nacht.html` met `#rust` en `#kiezen`, en
`Thuis-Tel-Eigen.html#weergave` en `#eenvoudig`), en vroeg om een soort
always-on display voor de wand. Hij koos: eigen tijden voor de nacht en ook als
iemand het huis op Nacht zet; één bewegingsmelder kiezen; het scherm donker
kleuren en in Fully Kiosk ook de echte helderheid omlaag; eenvoudig en grotere
letters op de telefoon, op de wand alleen minder beweging; instellen bij het
potlood op de wand; en Weergave achter het tandwiel en onderaan Thuis.

*Besluit:*

- **De nachtstand:** van bedtijd tot de ochtend (standaard 23:00 tot 07:00),
  of als iemand het huis zelf op Nacht zet. De Nacht van de dagdelen telt niet:
  die begint al om 22:00. Na een minuut zonder iemand aan het scherm staan er de
  klok, gedimd, en een donker huis zonder getallen, zonder zon of stromen; met
  *Alles rustig* (of welke kamer koelt of warmt) en de temperatuur van twee
  kamers, de slaapkamer eerst, en het weer van morgen. Na wekken komt hij
  terug na weer een minuut zonder iemand.
- **Rust overdag:** na 2, 5 (standaard) of 15 minuten, of uit. Groot de klok,
  de kop van Thuis en het weer van nu en morgen, met het huis zonder getallen.
- **Wekken:** een tik (die doet verder niets), de muis, de bewegingsmelder die
  de hoofdgebruiker koos, aanbellen en "Hé huis". De melder bewaakt de dienst:
  gaat hij aan, dan stuurt de live-stroom `wekken`. Een open bewerkstand,
  "Hé huis", de deurbel, de film en een veld waarin je typt houden de wand
  wakker.
- **Alleen op de wand.** De telefoon rust nooit. Op een pagina om naar te kijken
  (Vandaag, Apparaten, Opbrengst, de Assistent, een kamer) gaat de wand na
  dezelfde tijd terug naar Thuis en rust daar meteen; waar je iets instelt, laat
  hij je met rust.
- **De helderheid:** de app kan het scherm alleen donkerder kleuren. Draait de
  wand in Fully Kiosk, dan gaat 's nachts ook de echte helderheid omlaag en bij
  wekken terug naar wat hij was.
- **Instellen:** bij het potlood op de wand, *Als niemand kijkt*, alleen voor
  de hoofdgebruiker of een beheerder, voor de hele wand. Bewaard in
  `voorkeuren.json` (`wand.niemand`), net als de kaarten.
- **Weergave per account,** op elk scherm waar je inlogt (`weergave` bij je
  account): *eenvoudig* (geen getallen op het huis, Vandaag in één zin, geen
  *Thuis aanpassen*), *grotere letters* (de tekst een maat groter) en *minder
  beweging* (geen lopende stromen, geen ademende bol, geen overgangen). Eenvoudig
  en grotere letters gelden in de telefoonstand: de wand schuift nooit, dus daar
  alleen minder beweging. Te kiezen onderaan Thuis (*Weergave*, ook in eenvoudig)
  en achter het tandwiel. De pagina onthoudt het ook zelf, zodat hij meteen
  goed staat; de dienst heeft het laatste woord.

*Wat afviel:* de Nacht van de dagdelen als bedtijd (dan al om 22:00); elke
melder in huis laten wekken (een gang 's nachts is geen kijker); grotere
letters op de wand (past niet zonder schuiven); de hele pagina vergroten (dan
past het huis niet meer).

---

## 165. Het scherm aan de wand: always-on overdag en 's avonds, 's nachts uit

*Onderwerp: weergave · Status: geldig*

Een aanvulling op besluit 164, dezelfde dag. De bewoner zag wat er in te
stellen was en zei: "alleen voor het scherm aan de wand. telefoon of laptop
hebben hier niks aan", en wilde een dagstand, een avondstand na zonsondergang
en een nachtstand die uit is. Hij koos: het display als always-on, met
instelbaar hoe lang het aan blijft zonder beweging (1, 5, 15 of 30 minuten);
beweging zet het weer aan, een tik of "Hé huis" opent de app; ook uit als er
niemand thuis is. De schets `design/app2/Wand-Nacht.html` kreeg `#uit` en een
nieuw paneel.

*Besluit:*

- **Alleen het scherm aan de wand:** het account dat bij Bewoners een scherm is
  (besluit 149). Een telefoon, een laptop of een bewoner op een breed scherm
  doet nooit mee. Zonder inlog (de NAS op het thuisnetwerk) is er geen scherm,
  dus ook geen always-on.
- **Always-on** na 2, 5 (standaard) of 15 minuten zonder iemand aan het scherm,
  of uit: zolang de zon op is de dagstand (de rust uit besluit 164), na
  zonsondergang de avondstand (wat in besluit 164 de nachtstand was: de klok
  gedimd, een donker huis, alles rustig en het weer van morgen). In Fully Kiosk
  gaat de helderheid 's avonds omlaag.
- **De nachtstand is uit:** van bedtijd tot de ochtend (standaard 23:00 tot
  07:00), of als iemand het huis op Nacht zet, gaat het scherm uit na de tijd
  zonder beweging (standaard 5 minuten). Zwart, en in Fully Kiosk echt uit.
- **Uit als niemand thuis is** (standaard aan): volgens de aanwezigheid van de
  bewoners, of als het huis op Afwezig of Vakantie staat. Komt er iemand
  thuis, of wordt het ochtend, dan komt het display terug.
- **Beweging** van de gekozen melder zet het display aan, niet de app; na de
  tijd zonder beweging gaat het weer uit. Zonder melder telt alleen een tik.
  **Een tik, "Hé huis" en aanbellen** openen de app.

*Wat afviel:* een schakelaar "dit scherm is de wand" in de browser (het scherm
bij Bewoners zegt het al); het scherm ook overdag uit na een tijd zonder
beweging (dan is het geen always-on meer); een tweede wachttijd voor de nacht.

---

## 166. Negentien punten van de bewoner: assistent, huis, inrichten en de wand

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 liep de bewoner de app op de tablet, de pc en de telefoon
na en kwam met negentien punten: tekst die buiten de vraagbalk viel, een
assistent die bleef zeggen dat hij het niet begreep, "app" uitgesproken als
"ap", het weer van morgen bij een vraag over vandaag, bewegingsgolven buiten
het huis, een huis en knoppen die op 16:9 buiten beeld vielen, panelen en een
airco op zolder die niet klopten, een inrichten dat op punten onduidelijk was,
en Thuis op de wand dat niet aan te passen was. Tussendoor: de droger hoort ook
op het always-on display (besluit 165), en "Er draait niets" terwijl de droger
draait. Hij koos uit voorstellen: schermen per scherm instellen vanaf elk
apparaat, kamers verplaatsen met slepen én pijltjes, buiten één lijst met
delen, de stap Apparaten helemaal in de stap zelf, en op de wand pijltjes en
"+ Kaart".

*Besluit:*

- **De assistent** zegt "niet begrepen" of "niet verstaan" één keer per
  gesprek; hoort hij daarna weer alleen ruis, dan stopt hij stil. Hardop noemt
  hij bij "niet begrepen" zelf twee voorbeelden (op het scherm zijn het
  knoppen). "App" klinkt als "ep". Het weer zonder "morgen" erbij gaat over
  vandaag: een eigen vraag `weer`, met het weer van de rest van de dag en wat er
  vandaag van het dak komt, niet de verwachting van morgen.
- **Het huis:** bewegingsgolven midden op de vloer van de kamer en niet groter
  dan de kamer (ze stonden halverwege de achtermuur, onder het dak boven de
  nok). De airco onder het dak hangt tegen de linkermuur als die hoog genoeg is,
  anders op de achtermuur net links van de nok; de droger staat er niet onder,
  en past de naam van de kamer er niet naast, dan staat die laag aan de
  voorkant. Precies zoveel panelen als er liggen, in rijen; bij beide kanten de
  voorkant rechts en de achterkant links, op Thuis en bij Inrichten hetzelfde
  (`huismodel.panelenOpDak`). Een tuinhuis dat een eigen ruimte is, is apart
  aan te tikken. Een losse garage achter de oprit en een carport boven de auto
  horen erbij.
- **Beeld:** de vraagbalk op de wand blijft één regel. In Inrichten vult het
  huis zijn vak op elk schermformaat en blijft Volgende altijd in beeld; de
  prijzen hebben plek voor vijf cijfers achter de komma.
- **De droger:** draait er een programma en heeft geen kamer iets nodig, dan
  zegt de kop op Thuis "De droger draait" in plaats van "Er draait niets". Op
  het always-on display staat de droger met zijn ring en eindtijd, overdag als
  tegel naast het weer en 's avonds als regel.
- **Inrichten:** apparaten en wat verwarmt of koelt zijn gescheiden; het getal
  apparaten telt het klimaat niet meer mee, en de lijst heeft overal een ×. De
  stap Apparaten toont alles per kamer; een apparaat aantikken geeft
  verplaatsen en weghalen, zonder uitstap. Een kamer verplaats je met ← en → in
  het vak, of door hem in het huis te slepen naar een andere kamer, ook op een
  andere etage. Buiten is één lijst met delen (met garage en carport); onder een
  deel dat aan staat kies je welke ruimte uit Home Assistant erbij hoort. De
  soorten binnen kregen bijkeuken, kelder en garage. Een bewoner aantikken geeft
  de naam, thuis volgens, de plek in de volgorde en het comfort.
- **Een scherm per scherm instellen:** het hele scherm en luisteren naar
  "Hé huis" bewaart de dienst per scherm (`opties` bij Bewoners), in te
  stellen bij Inrichten › De wand en bij Bewoners, vanaf elk apparaat. De
  tablet neemt het over bij de volgende pagina; niets gekozen is zoals de tablet
  het zelf had.
- **Thuis op de wand:** per kaart ▲ en ▼, want tikken werkt op elke tablet en
  slepen niet altijd, en bovenin "+ Kaart". Past een kaart niet, dan wijkt de
  onderste, en het blad zegt welke; zo komt ook Favorieten op de wand.

*Wat afviel:* een losse knop "Bekijk alle apparaten" die het inrichten verliet;
de garage alleen als soort binnen (een losse garage staat buiten); het
always-on display zijn eigen droger laten tekenen (het neemt de kaart van
Thuis over, zodat er één plek is die weet wanneer hij klaar is); slepen als
enige manier op de wand.

---

## 167. Achttien punten van de bewoner: de wand, de droger, instellingen en inrichten

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 kwam de bewoner met zeventien punten en screenshots, en
daarna een achttiende: de droger zei "Draait, klaar rond 15:55" met 0 minuten
op de ring, terwijl hij allang klaar was. De rest: de droger stond midden in de
kamer; de kaarten op de wand konden niet schuiven, zodat er nooit meer dan vier
vakken pasten; "Als niemand kijkt" stond bij het potlood, Dit scherm bij
Bewoners en toegang, en de tijden waren onduidelijk; Inloggen zei alleen wie je
was; buiten had dezelfde soorten als binnen; Meten met en de regeling stonden
bij Kamer en niet bij Verwarmen en koelen; "van je dak" en "verwacht, de dag
ervoor"; Inrichten sprong naar boven bij elke keuze en kon geen radiator
toevoegen; de Nest werd behandeld als iets waar iets aan hangt; Apparaten op
zon waren niet uit te zetten; Licht en screens was leeg; "Automatisch" deed
niets; en Onderhoud zei "Alle batterijen en filters" terwijl Thuis een lege
batterij liet zien. Hij koos uit voorstellen: Weergave in drie delen, wie je
bent bovenaan Bewoners, het percentage zelf gebruikt erbij in Je panelen, buiten
een lijst zoals binnen, de Nest als thermostaat van de ketel, alles over licht
en screens bij Functies, bij Automatisch alleen uitleg, en de droger "klaar"
tot de deur opengaat.

*Besluit:*

- **De droger:** de dienst leest ook de resterende tijd (of de eindtijd) en de
  voortgang van het programma (`remainingTime`, `programProgress`). Bij Home
  Connect Alt volgen die vanzelf uit de duursensor, met dezelfde naam ervoor;
  voor een nieuw apparaat vindt de app ze bij hetzelfde apparaat in Home
  Assistant. Is de resterende tijd 0 of de voortgang 100%, terwijl de status
  nog "Loopt" zegt, dan is het drogen klaar en draait de trommel tegen kreuken:
  de uitleg krijgt `doneSinceMs`, Thuis zegt "De droger is klaar", de kaart
  "Klaar sinds 15:40, draait nog tegen kreuken" met een groene ring, tot de
  status verandert (de deur open, of de kreukbescherming klaar). Zonder die
  sensoren telt de start plus de duur, met tien minuten speling. In een pauze
  of een uitgestelde start is hij nooit klaar. De regeling verandert niet: het
  programma loopt, dus de droger start niet opnieuw.
- **De droger in de tekening** staat tegen de achtermuur, rechts van het raam,
  en niet midden in de kamer; helemaal rechts valt de achterwand achter de muur
  ernaast.
- **De wand:** de kaartenkolom schuift zelf, zoveel kaarten als je wilt; de
  dienst houdt de wand niet meer binnen vier vakken. Staat er meer onder de
  rand, dan loopt de onderste kaart zacht weg. Bij het aanpassen alleen de greep
  als icoon en het oog; de woorden "Schuif" en "1 vak" en de pijltjes ▲ ▼ van
  besluit 166 zijn weg. Sleep je naar de rand, dan schuift de kolom mee.
- **Weergave bij Functies,** onder een eigen kopje, in drie delen: Dit scherm
  (volledig scherm, alleen in Home Assistant), Always-on display (een
  schakelaar; uit is de rest grijs; verschijnt na 2, 5 of 15 minuten zonder
  aanraken) en Scherm uit ('s nachts van–tot, als niemand thuis is, na 1, 5, 15
  of 30 minuten zonder beweging, en wekken door beweging). Elk deel zegt in één
  zin wat de tijden doen. Het paneel bij het potlood en Dit scherm bij Bewoners
  en toegang zijn weg.
- **Inloggen** is geen eigen deel meer: bovenaan Bewoners staat "Je bent
  Ricardo, beheerder", met Uitloggen alleen als de app zelf om de inlog vraagt.
- **Buiten** heeft een eigen lijst zoals Soort kamer, met een voorstel uit de
  naam: achtertuin, voortuin, zijtuin, oprit, carport, terras, balkon,
  dakterras, tuinhuis of schuur, en een losse garage. De zones buiten hebben ook
  een eigen lijst: gazon, border, terras, tuinhuis of schuur, moestuin, vijver,
  pad, speelplek, oprit en carport. Een zone Tuinhuis tekent het huisje in de
  tuin; "In de tekening" heeft alleen nog "Auto op de oprit".
- **Verwarmen en koelen** heeft Meten met en de regeling van de kamer; het
  tabblad Kamer niet meer.
- **De thermostaat van de cv-ketel:** bij Energie › Verwarming (en bij
  Inrichten) kies je welke thermostaat de ketel aanzet; niets gekozen is het
  voorstel uit Home Assistant, een thermostaat die verwarmt, niet koelt en geen
  radiatorknop is (de Nest). In zijn kamer heet hij "Thermostaat van de
  cv-ketel", zonder "Wat hangt eraan?". Een radiator of vloerverwarming op water
  gaat aan "met de thermostaat van de cv", een slimme radiatorknop of met de
  hand; dan hoeft er geen apparaat gekozen te worden, en de thermostaat blijft
  in zijn eigen kamer. Inrichten heeft hetzelfde formulier om iets toe te
  voegen, en blijft staan waar je was in de lijst.
- **Apparaten op zon** hebben elk een schakelaar, ook de droger uit de
  configuratie (`opZonUit` in de antwoorden haalt hem eruit bij de volgende
  start).
- **Licht en screens** staat alleen nog bij Functies: bedienen of alleen kijken,
  per kamer de lampen, scènes en screens met een schakelaar om er een uit de
  app te halen (dat is verbergen in de indeling), en bij een screen of hij zijn
  stand terugmeldt. Het deel bij Regeling is weg.
- **De stand van het huis:** een tik op "Automatisch" opent een blad met de
  standen, wat ze doen, wat er nu geldt en wanneer de klok verandert. Kiezen
  kan nog niet: de stand stuurt via Home Assistant de verwarming, en dat is
  klimaat (besluit 15).
- **Onderhoud** bij de meldingen kijkt naar dezelfde batterijen en filters als
  de sleutel op Thuis, met een geel stipje en wat er bijna op is.
- **Teksten:** "van je dak" is overal "van je panelen"; "verwacht, de dag
  ervoor" is "verwacht vandaag". Je panelen bij Opbrengst noemt ook het
  percentage dat je zelf gebruikte.

*Wat afviel:* de stand van het huis nu al kiezen (dat is een schrijfdeur naar
het klimaat, pas in stap B); een vierde deel Leesbaarheid bij Weergave (die
staat onderaan Thuis); de kaarten op de wand in vakken houden met een maximum;
de droger meteen van Thuis halen als het drogen klaar is.

## 168. Favorieten per kamer, en de dagstand en avondstand van de wand

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026, op de tablet aan de wand: het blad om favorieten te kiezen
begon met een lange lijst scènes (sommige dubbel), en de lampen kwamen pas
daaronder. Bij het always-on display miste hij de keuze tussen de dagstand en
de avondstand, en wanneer elk ingaat. En bij Inrichten viel de tekst van de
thermostaat weg in de smalle kolom. Hij koos uit voorstellen: per kamer met de
lampen eerst, en vaste tijden met een schakelaar per stand.

*Besluit:*

- **Favorieten kiezen** gaat per kamer, in de volgorde van het huis: eerst de
  lampen, daaronder ingeklapt "Scènes (n)" met de scènes van die kamer, elke
  naam één keer. Een kamer waar je een scène koos, staat open. Hooguit vier,
  zoals besluit 162.
- **Dagstand en avondstand:** de dagstand geldt vanaf het einde van Scherm uit
  (zonder nacht: vanaf zonsopkomst) tot zonsondergang, de avondstand van
  zonsondergang tot het begin van Scherm uit. Eerst volgde de dagstand de zon,
  zodat het in de winter na 07:00 nog avond was. Elk heeft een schakelaar bij
  Functies › Always-on display, met de tijden en de zonsondergang van vandaag;
  zet je er een uit, dan neemt de andere zijn tijd over, en de laatste blijft
  aan (`dag` en `avond` in de voorkeuren van de wand).
- **Inrichten:** de thermostaat van de ketel staat onder de knoppen van
  Verwarming, over de hele breedte.

*Wat afviel:* alleen lampen als favoriet (een scène met één tik blijft handig);
de tijden alleen als uitleg zonder schakelaars.

## 169. Wie er thuis is en wiens comfort geldt: rondjes en een blad

*Onderwerp: weergave · Status: geldig*

Op 18 oktober 2026 stond op Thuis een grote kaart "Comfort van Noor" met een
gele rand: "Ricardo is weg sinds 21:16. Noor staat daarna." en één knop
"Toch die van Ricardo". De bewoner vond dat het een goede herziening nodig had:
de kaart was te groot en klonk als een waarschuwing, de tekst was vaag, de wand
begroette Ricardo terwijl hij weg was, en terugwisselen kon alleen naar de
hoofdgebruiker. Hij koos uit schetsen (Wand-Thuis-Wie, Thuis-Tel-Wie): rondjes,
altijd en rustig, zonder tekst; op de wand bovenin voor de pillen (achter de
begroeting stonden de namen dubbel), op de telefoon rechts van de begroeting;
en een blad om te kiezen.

*Besluit:*

- **Een rondje per bewoner**, met zijn eerste letter: wie thuis is, licht op in
  zijn kleur; wie weg is, blijft grijs; wie gevolgd wordt, heeft een witte ring
  met een klein thermometertje. Thuis is zoals de regeling het ziet, met de rust
  van tien minuten (besluit 147); de begroeting op de wand noemt dezelfde
  mensen. De telefoon begroet wie hem vasthoudt.
- **Een tik opent het blad** "Wiens comfort geldt?": bovenaan "Vanzelf: wie
  thuis is", met wie het nu is en wie er weg is; daaronder elke bewoner, thuis
  of weg, met zijn temperatuur overdag en 's nachts in de eerste kamer die
  verwarmt. Kies je iemand, dan geldt dat tot er iemand thuiskomt of weggaat,
  zoals "toch die van" uit besluit 147. Iedere bewoner en de wand mogen kiezen;
  een gast ziet het blad, maar kiest niet (de dienst weigert het ook).
- **De kaart is weg.**

*Wat afviel:* de rondjes achter de begroeting (de namen dubbel); in de zijbalk
of boven de kaarten; een korte regel "Comfort van Noor" erbij; direct op een
rondje tikken om te wisselen; alleen de hoofdgebruiker laten kiezen.

## 170. Favorieten met pagina's, rookmelders, de gevel op de kaart en wat de wand liet liggen

*Onderwerp: weergave · Status: geldig*

Op 21 oktober 2026, met de app op de Pi en de wand in Home Assistant, een
ronde van de bewoner. Vier vakken favorieten waren te weinig, screens konden
er niet in, en drie plafonnières waren niet uit elkaar te houden. De
avondstand was te donker en bleef soms 's ochtends hangen. De app rekende de
voorgevel op 97°, een kompas binnen tegen de gevel zei 77°. Hij heeft drie
Nest Protects. De assistent ging door op "noise" en kende geen "oké,
bedankt". En drie fouten: de rondjes op Thuis liepen achter op Bewoners, het
beeld bij aanbellen bleef zwart terwijl dezelfde camera in Kamer meteen beeld
gaf, en de wand stond na een tijd op "401: Unauthorized". Hij koos uit de
schetsen Wand-Favorieten en Wand-Rook.

*Besluit:*

- **Favorieten:** twaalf, vier per pagina, met de vinger opzij en stipjes
  eronder. Lampen, scènes en ook screens en het zonnescherm. Elke lamp en elk
  scherm heeft het icoon van zijn kamer klein op zijn eigen icoon, en de naam
  van de kamer in de regel eronder. Een tik schakelt (een scherm gaat open of
  dicht, zonder terugmelding van de laatste opdracht uit, en weet niemand hoe
  hij staat, dan dicht); vasthouden opent het blad in de kamer. Het kiesblad
  heeft bovenaan wat je koos, op volgorde, om te verslepen; daaronder per kamer
  met zijn icoon, en een filter Alles, Lampen, Scènes, Screens.
- **Rookmelders** zijn een eigen soort apparaat: elk apparaat in Home
  Assistant met een sensor voor rook of koolmonoxide (klasse `smoke`,
  `carbon_monoxide`, en `heat` erbij). Ze staan in hun kamer uit Home
  Assistant en schuiven bij Indeling, met een blad met de batterij, de laatste
  test en de datum om te vervangen. Ziet er een rook, koolmonoxide of hitte,
  dan toont elke open pagina een rood alarm, zoals aanbellen (besluit 107):
  waar, sinds wanneer, wat de andere melders zien, en "bel 112". Sluiten houdt
  het weg tot een melder iets nieuws ziet; ziet niemand meer iets, dan gaat het
  vanzelf weg. Bij Meldingen staat waar en wanneer, en daarna onder Eerder;
  ook een batterij die op is en een melder die binnen drie maanden vervangen
  moet. Smart Climate leest alleen: afzetten doe je op de melder.
- **De helderheid van de wand** is vast per stand: overdag (ook in de app) 50,
  75 of 100%, in de avondstand 10, 20, 30 of 50%; standaard 100 en 20.
  Eerst zette de avondstand Fully Kiosk op 12 van 255 en onthield de pagina de
  oude helderheid; laadde de wand 's nachts een andere pagina, dan bleef het
  scherm de ochtend erna gedimd. Met Fully Kiosk dimt de app niet meer extra.
- **De gevel op de kaart:** bij Aanpassen meet een knop de gevels op aan de
  omtrek van het huis in OpenStreetMap (in Nederland uit de BAG). Alleen na een
  tik van de beheerder; de ligging van het huis gaat dan eenmalig naar
  OpenStreetMap, en de omtrek blijft een dag bewaard. Van de vier richtingen
  van het huis wint die het dichtst bij wat er nu staat. Hier: de muren staan
  op 2°, 92°, 182° en 272°, de meting uit de opbrengst gaf 89 tot 93°, ook
  zonder de lage ochtendzon. Het kompas binnen zat er 15° naast, door het staal
  in de muur.
- **De assistent:** "oké, bedankt", "dat was het", "nee, dank je" of
  "welterusten" sluit het gesprek met een kort antwoord, zonder verder te
  luisteren. Wat alleen geluid is ("(noise)", "[Muziek]", of wat Whisper bij
  stilte verzint, zoals "Ondertiteld door de Amara.org-gemeenschap"), telt als
  niets gezegd.
- **De rondjes op Thuis** volgen Home Assistant meteen, en Thuis haalt de
  bewoners elke vijftien tellen. Het comfort wisselt nog steeds pas na tien
  minuten rust (besluit 147); dat laat de ring zien. Dit verandert besluit 169,
  waar de rondjes de rust van de regeling volgden.
- **Het beeld bij aanbellen** komt zoals in Kamer: eerst een plaatje, dan live
  eroverheen. Geeft het gekozen beeld geen plaatje (hier het scherpe beeld van
  de deurbel: fout 500 en een lege stroom), dan het volgende beeld van dezelfde
  camera; komt live niet binnen vijf tellen, dan elke seconde een nieuw plaatje.
- **De 401 op de wand:** in Home Assistant loopt de app via ingress, met een
  sessie die verloopt als de tablet slaapt. Dan gaf Home Assistant zelf 401,
  ging de app naar de inlogpagina, en weigerde Home Assistant ook die. Nu houdt
  de app de sessie elke minuut zelf vast (zoals Home Assistant), vernieuwt hij
  hem bij zo'n 401 en vraagt hij het opnieuw, ook voor de live-stroom. Een 401
  van de dienst zelf gaat nog naar het inloggen.
- **De schuiven bij Comfort** (versie 0.46.1): alleen het bolletje slepen
  verandert de temperatuur, vanaf waar je het pakte. Eerst kwam er tijdens het
  slepen een nieuw bolletje onder de vinger; op de tablet kwamen bewegen en
  loslaten dan niet meer aan, bleef het slepen aan staan, en sprong het
  bolletje naar elke volgende tik op de balk of de pagina.
- **De zolder:** een radiator onder het schuine dak zoekt op de achtermuur een
  plek waar hij rechtop past, en is anders kleiner; eerst stak hij bij een
  kamer tegen de buitenmuur door het dak.

*Wat afviel:* acht of zestien favorieten; een tik die altijd eerst het blad
opent; een pushbericht via Home Assistant bij rook (een nieuwe schrijfdeur);
alleen een regel bij Meldingen; de kompasmeting invullen; de ligging uit de
opbrengst bijstellen met de ochtendzon weggelaten (het verschil was 1°).

## 171. Bijwerken vanuit de app: een melding, wat er nieuw is en een knop

*Onderwerp: weergave · Status: geldig*

Op 21 oktober 2026 vroeg de bewoner of de app zelf kan zeggen dat er een
update is: een melding, en bij een tik een venster met de vernieuwingen en een
knop om bij te werken. Tot nu toe stond een update alleen in Home Assistant,
bij Instellingen › Updates, en kwam "Wat is er nieuw" pas na het bijwerken
(besluit 136).

*Besluit:*

- **Waar de app het ziet:** in de add-on heeft Home Assistant voor Smart
  Climate een `update.`-entiteit (titel "Smart Climate"), met de versie die er
  is en de nieuwste. Staat die aan, dan komt er bij Meldingen "Versie 0.47.0
  staat klaar"; na het bijwerken staat hij onder Eerder. Alleen in de add-on:
  de NAS rolt zichzelf uit (besluit 152) en ziet de update van de Pi niet.
- **Wat er nieuw is** komt uit `addon/CHANGELOG.md`, dat `npm run changelog`
  maakt uit `NIEUW` in version.ts; een test houdt ze gelijk. De Supervisor
  leest het bestand van GitHub en Home Assistant geeft het als releasenotes
  van de nieuwste versie (`update/release_notes`, alleen lezen). Zo kent de app
  wat er in een versie staat die hij zelf nog niet heeft. Het venster toont
  elke versie na die van nu; Home Assistant laat dezelfde tekst zien.
- **Bijwerken** is een nieuwe smalle schrijfdeur: `update.install` op precies
  de eigen update-entiteit, zonder velden; de client laat verder niets door.
  Alleen de beheerder ziet de knop, en de dienst toetst het ook. Daarna start
  de add-on opnieuw; de pagina kijkt elke vijf tellen en laadt vanzelf als de
  nieuwe versie draait. Met automatisch bijwerken aan in Home Assistant (zoals
  op de Pi) komt een update meestal vanzelf, en verdwijnt de melding weer.

*Wat afviel:* bijwerken vanuit de pagina met de inlog van Home Assistant (dan
werkt het niet in de losse app op de telefoon); wat er nieuw is van GitHub
halen (een vreemde site voor elke kijker); de melding ook op de NAS.

*Aangevuld 21 oktober 2026: ook op de wand als niemand kijkt.* De bewoner zag
de melding op de telefoon, maar niet op de wand. De melding is voor iedereen
dezelfde, en de knop Bijwerken krijgt elk account dat in Home Assistant
beheerder is, ook dat van de tablet. Maar de wand staat meestal in het
always-on display (besluit 165), en daar is de bel niet te zien. Nu staat een
nieuwe versie ook op het display, overdag als tegel naast het weer en
's avonds als regel; een tik erop wekt de wand en opent meteen wat er nieuw is,
met Bijwerken. Versie 0.48.1.

---

## 172. De app is af: opruimen, wat er nog komt, en talen later

*Onderwerp: visie en principes · Status: geldig*

Op 21 oktober 2026 zei de bewoner dat de app functioneel af is, en vroeg om een
rapport: wat in de besluiten nog open staat, wat nog op dit huis leunt, hoe de
app sneller en stabieler kan, wat een nieuwe gebruiker in Home Assistant moet
klaarzetten, en of apparaten op zon in de voorrang kunnen. Daaruit volgde een
stappenplan; dit zijn de keuzes die hij erbij maakte.

*Besluit:*

- **Talen komen later, in deze volgorde: Engels, dan Duits.** Besluit 86 blijft
  staan, maar wordt nu nog niet gebouwd. Wat nu verandert, maakt het straks
  goedkoper: teksten en woordenlijsten op één plek.
- **Wat uit de besluiten nog komt:** een lichte versie en een eigen accentkleur
  (87), en die kleur **per bewoner**: de app toont de kleur van wie er thuis is
  en wiens comfort geldt; de vier kaarten voor Thuis, de auto, de batterij,
  deze maand en de deurbel (162); een melding op de telefoon via de app van
  Home Assistant (79); en een eigen koppeling, zodat Assist van Home Assistant
  Smart Climate kan vragen zonder dat je YAML plakt (91).
- **Apparaten op zon in de voorrang:** een derde lijst *Op zon* bij Comfort ›
  Voorrang, met de kamers die op zon opwarmen of koelen en de apparaten op zon
  in één volgorde. Comfort gaat altijd voor (85). Gebouwd in besluit 176.
- **Opruimen, zonder dat de bewoner iets merkt:**
  - de gewone kamerwoorden en hun lidwoord staan op één plek
    (`kamerwoorden.ts`, en dezelfde lijst in `basis.js`, met een test die ze
    gelijk houdt). Eerst stonden ze vijf keer in de code, net anders, en zei de
    app "de kantoor" en "in de tuinhuis";
  - de versiestempels achter de scripts komen uit de pagina's zelf, niet uit
    een lijst met de hand; die vergat de microfoon op Assistent en het
    huismodel bij Energie. Nu merk je dat nog niet, want de app vraagt elk
    bestand opnieuw na; zodra de browser ze mag bewaren wel;
  - de schetsen van ontwerp 1 (29 MB) zijn uit de repository; `ONTWERP.md`
    blijft. Home Assistant haalt de repository op bij het toevoegen van de
    add-on;
  - de naam van een huisgenoot en een kind in de tests en het commentaar is
    vervangen door een verzonnen naam. De echte namen van entiteiten in het
    gereedschap voor dit huis en in het oude systeem blijven: die moeten
    kloppen met Home Assistant.
- **Versie 0.47.1.**

*Wat afviel:* de schermafbeeldingen van ontwerp 2 (110 MB) uit de repository
halen; die blijven, als maatstaf naast de schetsen (104). Talen meteen
bouwen.

---

## 173. Sneller: bewaren, inpakken, en het huis één keer uitrekenen

*Onderwerp: weergave · Status: geldig*

Stap 2 uit het stappenplan van besluit 172, op 21 oktober 2026. Gemeten op
de pc met een nagebootst huis van 3.000 entiteiten: het huis uitrekenen kost
7 ms per keer (op de Pi ruwweg drie keer zoveel), het antwoord is 118 kB, en
Thuis vraagt het elke 15 tellen, Kamer elke 5, per open scherm. Een pagina
laadt 8 tot 12 scripts en opmaak (Thuis 393 kB), en vroeg elk daarvan bij elk
bezoek opnieuw na.

*Besluit:*

- **Wat een versiestempel heeft, mag de browser bewaren.** Een script of
  opmaak met `?v=` in het adres (frontend/build.js, besluit 172) krijgt
  `immutable` en een jaar; verandert het bestand, dan verandert het adres. Een
  pagina zelf blijft altijd navragen. Zo kost een tab openen één vraag voor de
  pagina in plaats van tien tot twaalf, en achter Ingress gaat elke vraag door
  Home Assistant.
- **Inpakken buiten Ingress.** Scripts, opmaak, pagina's en antwoorden vanaf
  1 kB gaan ingepakt (brotli, anders gzip) als de browser dat kan. Thuis wordt
  ongeveer een kwart, het huis ongeveer een tiende. Achter Ingress niet: daar
  pakt de Supervisor het weer uit en pakt Home Assistant zelf in. De ingepakte
  bestanden bewaart de dienst tot ze veranderen.
- **Het huis één keer uitrekenen per verandering.** Elke verandering in Home
  Assistant die het huis raakt telt een versie op; zolang die versie, de
  registers, de configuratie, het laatste besluit, de indeling, de functies en
  de aansluiting gelijk zijn, geeft de dienst het bewaarde huis, hooguit tien
  tellen lang (de kleuren van scènes en de meting van de ligging veranderen
  zonder dat de dienst het ziet).
- **Niet gedaan, en waarom:** het opzoeken van de rookmelders bij elke
  verandering kost 0,2 ms en blijft zoals het is. De film en de rondleiding pas
  laden als je ze opent scheelt na het bewaren alleen nog het inlezen, een paar
  milliseconden.
- **Versie 0.48.0.**

*Wat afviel:* de bestandsnamen zelf een hash geven (`thuis.3f2a.js`): het
stempel achter het adres doet hetzelfde zonder dat elke verwijzing verandert.

---

## 174. Het huis en wie er thuis is, live

*Onderwerp: weergave · Status: geldig*

Stap 3 uit het stappenplan van besluit 172, op 21 oktober 2026. Thuis vroeg
het huis en wie er thuis is elke 15 tellen op, Kamer het huis elke 5, per open
scherm en ook 's nachts als er niets veranderde. Een lamp die je in Home
Assistant aanzette, zag je pas na een paar tellen.

*Besluit:*

- **De dienst zegt het als er iets veranderde,** over de live-verbinding die
  er al was voor de besluiten, de deurbel en het rookalarm (`event: huis` en
  `event: bewoners`). De pagina haalt het daarna zelf op, ingepakt waar dat
  kan (besluit 173); de live-verbinding zelf wordt niet ingepakt, dus daar gaat
  alleen een vingerafdruk over.
- **Meteen wat je bedient of ziet bewegen:** lampen, schermen, scènes,
  klimaat, camera's, beweging, rookmelders, en wie er thuis komt of weggaat,
  binnen een derde tel. **Rustig wat verschuift:** een temperatuur, verbruik of
  batterij na twee tellen, en de pagina telt dat hooguit eens per 15 tellen
  (Thuis) of 5 (Kamer), zoals ze het eerst zelf vroeg. Na elk besluit ook
  rustig, want de stand van de kamers hangt eraan.
- **Alleen als het huis echt anders is:** de dienst rekent het huis uit
  (besluit 173 bewaart het) en vergelijkt een vingerafdruk; gelijk is geen
  bericht. Zonder open pagina doet hij niets.
- **Alleen in beeld:** een pagina op de achtergrond haalt niets op, en haalt
  het in zodra ze weer in beeld is. Valt de verbinding weg en komt ze terug,
  dan haalt de pagina het huis en de bewoners meteen opnieuw.
- **De terugval blijft:** Thuis en Kamer laden elke minuut alles opnieuw,
  zoals ze al deden, voor als de live-verbinding er niet is.
- **Gevonden onderweg:** zonder besluit om mee te sturen (een verse
  installatie) ging de live-verbinding pas bij de eerste ping open, na 25
  tellen; de pagina toonde dan na 15 tellen "geen verbinding". Nu gaat ze
  meteen open.
- **Versie 0.49.0.**

*Wat afviel:* het hele huis over de live-verbinding sturen (ruim 100 kB,
niet ingepakt, bij elke meting); alleen wat veranderde sturen en de pagina het
laten samenvoegen (elke soort apparaat een eigen regel in de app, voor weinig
winst na het inpakken).

---

## 175. Op je startscherm, en de favorieten zoals de kaart

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 21 oktober 2026, tussen de stappen van besluit 172
door: een snelkoppeling op het startscherm van Android met het icoon van de
app; bij de favorieten de zone in plaats van de etage, vasthouden naar de lamp
zelf, en de gekozen favorieten als tegels met een greep; en twee dingen op
Bewoners.

*Besluit:*

- **Op je startscherm** staat bij Functies › Weergave. Met het eigen icoon kan
  alleen als Chrome de app installeert: over https en buiten Home Assistant.
  Kan dat (`beforeinstallprompt`), dan een knop die het vraagt. In de app van
  Home Assistant kan het niet; staat de eigen poort open (besluit 160), dan een
  knop die Smart Climate in Chrome opent, met het adres om te kopiëren;
  anders de vijf stappen om de eigen poort via Tailscale te openen, met het
  adres van dit huis erin (uit dat van Home Assistant: een adres op `ts.net`
  geeft `smartclimate.<tailnet>.ts.net`). Daaronder de snelkoppeling van Home
  Assistant zelf, met een icoon van Home Assistant. De dienst zegt bij
  `/api/startscherm` of de eigen poort er is en op welk adres hij gebruikt is.
  Tailscale mag daarom in de teksten van de app; de tekstcontrole van besluit
  131 verbiedt het niet meer.
- **Een favoriet noemt zijn zone:** staat een lamp of scherm in een zone van een
  open ruimte, dan die zone en zijn icoon; anders stond bij elke plafonnière
  van een samengevoegde begane grond de naam van die ruimte.
- **Vasthouden opent het apparaat:** dat deed het adres al, maar op de telefoon
  staat het blad onder de tekening; nu gaat de pagina er één keer naartoe.
- **De gekozen favorieten** staan bovenin het kiesblad als dezelfde tegels als
  op de kaart, met hun plek en een greep. Slepen kan alleen aan de greep, zodat
  het blad onder de vinger blijft scrollen; met de pijltjes één plek opzij of
  een rij op en neer.
- **Bewoners op de telefoon:** thuis of weg en "geldt nu" onder de naam; ernaast
  bleef er voor de naam één woord per regel over.
- **Iemand erbij in de add-on:** de QR-code wijst naar Smart Climate in Home
  Assistant, niet naar het adres binnen Home Assistant dat alleen werkt voor
  wie er al is. Elk vak op Bewoners tekent apart; lukt er een niet, dan zegt
  dat vak wat er misging. Waarom de vakken op de Pi leeg bleven, is nog niet
  gevonden: op de NAS en in de test staan ze er.
- **Versie 0.50.0.**

*Aangevuld 21 oktober 2026.* Op de Pi staan de vakken er met 0.50.0 wel; de
QR-code kwam pas na even. Op de telefoon viel bij Volgende het begin van een
lange titel weg ("leutel voor de assistent"): de titel mocht niet afbreken en
stond rechts uitgelijnd. Nu breekt hij af, en de paginatest meet waar de tekst
begint. Versie 0.50.1.

*Aangevuld 23 oktober 2026.* Op de Pi nagelopen: de eigen poort via de dienst
`svc:smartclimate` in de Tailscale-add-on werkt, en de app staat met het eigen
icoon op de telefoon. In Tailscale hoorde er naast de tag en de dienst ook een
toegangsregel bij (`autogroup:member` naar `svc:smartclimate` op `tcp:443`);
die staat nu in de README van de add-on. De knop Open in Chrome had zijn tekst
niet in het midden: een link met de knopstijl centreert nu altijd, zoals een
echte knop. En met de app van de NAS en die van de Pi naast elkaar stonden er
twee gelijke iconen: een eigen server (de NAS, die beta volgt) geeft nu een
eigen manifest, "Smart Climate beta", met een label BETA op het icoon
(`frontend/tools/beta-icoon.py`). Versie 0.59.8.

---

## 176. Apparaten op zon in de voorrang: een lijst Op zon

*Onderwerp: kern en regeling · Status: geldig*

Stap 4 uit het stappenplan van besluit 172, op 21 oktober 2026. De bewoner
koos een derde lijst bij Comfort › Voorrang, en niet een schakelaar per
apparaat. Tot nu toe kreeg een apparaat op zon, zoals de droger, alleen wat de
kamers overlieten (besluiten 85 en 98).

*Besluit:*

- **Comfort gaat altijd voor.** Comfort en bijspringen besluiten eerst, zoals
  altijd. De lijst Op zon ordent alleen wat er daarna over is: de kamers die op
  zon opwarmen of koelen, en de apparaten op zon, in één volgorde.
- **In de configuratie** heet dat `sunOrder`: een lijst van
  `{ kind: "zone" | "deferrable", id }`. Wat er niet in staat, komt achteraan:
  eerst de zones op hun voorrang per richting, dan de apparaten. Zonder
  `sunOrder` rekent de regeling precies zoals eerst.
- **In de arbiter** vraagt een apparaat dat op zon wacht zijn deel op zijn plek
  in die volgorde, net als een start: het past als het vrije overschot (min
  `stopImportW`) zijn geschatte vermogen draagt, en er deze ronde nog niets
  startte (besluit 68) en de stabilisatie niet loopt. Krijgt het zijn deel, dan
  telt dat als de start van deze ronde: een airco daarna wacht een ronde. In de
  schaduw start het apparaat niets en begint er geen stabilisatie; de droger
  zegt alleen "zou nu starten". Wat er vóór het overschot al vaststaat (draait,
  niet klaar, de hoofdzekering, klaar voor), blijft zoals in besluit 98 en 101.
- **In de app** staat Op zon als derde lijst bij Voorrang, alleen als er een
  apparaat op zon is, met omhoog en omlaag. Hij gaat pas naar de regeling als
  de bewoner hem verandert; zolang staat er de gewone volgorde. Bewaard in
  `comfort.json` als `voorrang.zon`, met `soort` kamer of apparaat.
- **Eerlijk erbij:** een apparaat dat draait, gaat niet terug. Staat de droger
  boven de zolder, dan krijgt de zolder die middag minder zon om voor te koelen.
  Dat staat onder de lijst.
- **Bewaakt** met een test van de volgorde (de droger vóór en na de zolder, te
  weinig zon, comfort dat voorgaat), een regel over 3.000 gegenereerde
  toestanden dat comfort met of zonder volgorde precies hetzelfde besluit en de
  droger nooit een opdracht krijgt (de droger kreeg zijn deel in 141 ervan), de
  configuratie, het comfortbestand en de pagina.
- **Versie 0.51.0.**

*Wat afviel:* een schakelaar per apparaat ("gaat voor de kamers op zon"),
eenvoudiger maar met minder keus; de droger ook vóór comfort laten gaan.

---

## 177. Universeel, deel 1: het wekwoord mee, Assist zonder NAS, en meldingen live

*Onderwerp: uitrol en beheer · Status: geldig*

Stap 5 uit het stappenplan van besluit 172, op 21 oktober 2026, met een punt
van de bewoner erbij: een melding zoals een nieuwe versie kwam pas als je van
tab wisselde.

*Besluit:*

- **Het wekwoord "Hé huis" gaat mee in de add-on** (`addon/wekwoord/`,
  207 kB, getraind op Piper-stemmen, zonder opname van een bewoner). Bij het
  starten zet `run.sh` het in `/share/openwakeword`, waar de
  openWakeWord-add-on eigen wekwoorden zoekt, alleen als het daar nog niet
  staat: een eigen getraind wekwoord met dezelfde naam blijft. Daarna één keer
  de openWakeWord-add-on herstarten; dat zegt het logboek en Functies › Praten.
- **Assist zonder het adres van de NAS:** bij Sleutel voor de assistent staat
  nu ook het adres waar Home Assistant zijn vraag stelt. In de add-on is dat de
  naam van de add-on in het netwerk van Home Assistant (`http://<naam>:8099`);
  anders het adres waarop de beheerder de app opent. `ha-assist/` noemt geen
  NAS meer. De eigen koppeling zonder YAML (besluit 91) blijft een volgende
  stap.
- **Meldingen live:** verandert de lijst (een nieuwe versie, een lege batterij,
  of iemand haalt er een weg), dan zegt de dienst het over de live-verbinding
  (`event: meldingen`), en de bel en de open lijst werken meteen bij. Een
  nieuwe versie in Home Assistant zet meteen een ronde in gang, niet pas na
  een minuut.
- **De terugblik zegt met wie hij vergelijkt** (besluit 73): met een regeling in
  YAML "het oude systeem", anders "de apparaten zelf".
- **Geen namen uit dit huis:** "wat is nieuw" noemt de hoofdgebruiker en een
  kamer ernaast in plaats van een naam en de wasruimte van dit huis; zonder
  configuratie valt het weer terug op de tijdzone van de dienst (in de add-on
  die van Home Assistant) in plaats van Amsterdam.
- **Nog niet in dit deel:** regels per land (salderen, daluren), meer merken voor
  apparaten op zon, en het vermogen van het typeplaatje (de badkamer).
- **Versie 0.52.0.**

---

## 178. Universeel, deel 2: regels per land, meer merken, en het typeplaatje

*Onderwerp: configuratie en onboarding · Status: geldig*

De rest van stap 5 uit het stappenplan van besluit 172, op 21 oktober 2026.

*Besluit:*

- **Regels per land, bij Meters en prijzen:**
  - **Daluren:** naast "23 tot 7" en "21 tot 7 (Brabant, Limburg)" ook *eigen
    tijden*: van welk hele uur tot welk, over middernacht of binnen een dag, en
    of het weekend helemaal dal is. Met eigen tijden tellen de Nederlandse
    feestdagen niet als dal (`dalUren: 'eigen'`, `dalEigen`).
  - **Salderen:** "tot 2027", zoals in Nederland, of "geen salderen"
    (`salderen: false`): dan telt alles wat teruggaat meteen tegen de
    vergoeding min de kosten, en vraagt het scherm geen vergoeding boven je
    verbruik. Zonder keuze blijft het Nederlands.
- **Meer merken voor apparaten op zon** dan Home Connect, met de namen van hun
  koppeling in Home Assistant: LG ThinQ (`remote_control_enabled`,
  `current_status`, `remaining_time`), SmartThings van Samsung
  (`remote_control`, `..._machine_state`, `completion_time`) en Miele
  (`mobile_start`, `status`, `remaining_time`). De regeling kent hun woorden:
  `in_use`, `running`, `waiting_to_start`, `paused` en de fasen van een
  programma als bezig; `end` en `program_ended` als klaar; `programmed`,
  `initial`, `standby`, `stop` en `idle` als klaarstaan. Een sensor die alleen
  `status` heet, telt alleen als niets anders past, en nooit die van de deur of
  de batterij.
- **Het typeplaatje** (het open punt over de badkamer): een apparaat kan
  `power.ratedW` hebben, wat het werkelijk trekt. De hoofdzekering (besluit 78)
  rekent daarmee bij een start; het budget blijft `estimatedW`. De app vult het
  in uit het vermogen van een slimme elektrische bron bij Indeling, ook als die
  niet op zon mag: de badkamer houdt 0 W voor het budget en krijgt 1.150 W voor
  de zekering.
- **Terugwinbaar** telt alleen wat de regeling zelf terugschakelt: een
  bijspringer, of een apparaat dat op zon mag. Wat comfort aanhoudt, zoals de
  badkamer, is geen ruimte voor een ander. In dit huis verandert er niets: daar
  zijn dat al alleen de airco's; de replay blijft gelijk.
- **Versie 0.53.0.**

---

## 179. Klaarzetten in Home Assistant, bij Wat je huis kan

*Onderwerp: configuratie en onboarding · Status: geldig*

Stap 6 uit het stappenplan van besluit 172, op 21 oktober 2026. Wat een nieuwe
gebruiker in Home Assistant moet klaarzetten, stond alleen in het rapport van
die dag. Nu zegt de app het zelf.

*Besluit:*

- **Een knop bij Wat je huis kan:** "In Home Assistant", met hoeveel er mist.
  Een tik opent het blad met de lijst, in zeven groepen: de basis (locatie en
  tijdzone, etages en ruimtes), klimaat (thermostaten en airco's, temperatuur
  per kamer), zon en energie (slimme meter, omvormer, Energie-dashboard,
  apparaten op zon), bewoners (een persoon per bewoner met een account, de app
  van Home Assistant voor thuis of weg), gemak (lampen, schermen, camera's en
  deurbel, rookmelders, weer), praten (spraakassistent, wekwoord, taalmodel) en
  de wand en je telefoon (bewegingsmelder, en in de add-on de eigen poort).
- **Drie standen:** klaar (groen), mist voor de regeling (oranje), of maakt een
  functie mogelijk (grijs). Alleen wat de regeling nodig heeft, telt als mist.
- **Waar het staat:** in Home Assistant opent een knop dat scherm van Home
  Assistant (het paneel verandert het adres van Home Assistant zelf en zegt het
  met `location-changed`; het volledige scherm gaat eerst uit). Buiten Home
  Assistant staat erbij waar je het vindt, zoals Instellingen › Personen.
- **Alleen tellen** (besluit 45): de dienst (`/api/klaarzetten`,
  `klaarzetten.ts`) telt etages, ruimtes, apparaten zonder ruimte, personen
  met een account en een telefoon, thermometers in een ruimte, en wat de app
  al vond; een zin noemt nooit een entiteit. Het omvormerpunt zegt het ook als
  de sensor trager is dan eens per twee minuten (besluit 89).
- **Versie 0.54.0.**

---

## 180. De twee grootste bestanden opgeknipt, zonder dat er iets verandert

*Onderwerp: kwaliteitsbewaking · Status: geldig*

Stap 7 uit het stappenplan van besluit 172, op 21 oktober 2026.
`backend/src/web/server.ts` was 2.578 regels en `backend/src/main.ts` 1.733.
Elke wijziging aan de app liep door die twee, en wie er iets in zocht,
scrolde door alles heen; een fout in het ene deel kon een ander deel raken
omdat ze dezelfde toestand deelden.

*Besluit:* knippen langs de naden waar geen gedeelde toestand overheen loopt,
en verder niets veranderen.

- **`web/http.ts`:** wat de webserver over HTTP zelf weet: de soort van een
  bestand, of een verzoek van de eigen pagina komt, een JSON-verzoek lezen met
  een dak, inpakken (besluit 173), een antwoord in JSON, en een bestand uit de
  weergave met zijn versiestempel.
- **`web/live.ts`:** de live-verbinding als eigen klasse (`LiveStroom`): de
  besluiten, aanbellen, het rookalarm, de wand wekken, en dat het huis, de
  bewoners of de meldingen veranderden (besluiten 174 en 177). De webserver
  geeft elke vraag één op één door, en levert het besluit en het huis aan.
- **`web/server-opties.ts`:** wat de dienst aan de webserver meegeeft, en de
  versie. `server.ts` geeft ze ongewijzigd door, dus wie ze daar importeert,
  merkt niets.
- **`env.ts` en `web/inhuis.ts`:** uit `main.ts` het lezen van `.env`, wat er
  mis is aan een token, en welke veranderingen in Home Assistant het huis
  raken en meteen of rustig live gaan. Die twee laatste waren niet te toetsen
  zolang ze in `main.ts` stonden; nu wel (`test/inhuis.test.ts`).
- **Hoe nagegaan dat er niets veranderde:** typecheck, lint, alle tests en de
  54 paginatests in de browser groen; en elke regel die uit de twee bestanden
  verdween, staat letterlijk in een van de nieuwe, op de imports en drie
  bedoelde verschillen na (`#subscribe` heet `abonneer`, en de live-verbinding
  vraagt het besluit en het huis aan de webserver in plaats van er zelf bij te
  kunnen).
- **Wat het oplevert:** `server.ts` is 1.943 regels, `main.ts` 1.663. Een
  volgende wijziging aan de live-verbinding of aan het inpakken raakt alleen
  dat bestand, en is apart te toetsen. Geen nieuwe versie: voor de bewoner
  verandert er niets.

*Wat afviel:* de duizend regels van de routes in `server.ts` per onderwerp in
eigen bestanden zetten. Die delen de toestand van de webserver (de toegang,
de opties, de caches); daarvoor moet eerst een gedeelde context komen, en dat
is meer verbouwen dan opknippen. En `main.ts` verder uit elkaar: het is één
script dat alles aan elkaar knoopt, met veel gedeelde stand.

*Aangevuld 23 oktober 2026: de routes toch per onderwerp.* Op verzoek van de
bewoner. Eerst de gedeelde context die hierboven ontbrak: `web/diensten.ts`
(de opties, de toegang, wie er kijkt, de live-verbinding en de caches). De
routes staan nu in negen bestanden onder `web/routes/`: camera, inloggen,
beheer, energie, bewoners, opbrengst, stand, assistent en huis. Elk krijgt de
context mee als `d` en zegt of het een verzoek afhandelde; `server.ts` houdt
de toegangsregels (hostnamen, inloggen, de 405-muur, de eigen pagina, een gast)
en vraagt de onderwerpen op volgorde. Hun paden overlappen niet. Nagegaan zoals
hierboven: typecheck, lint, alle tests en de 62 paginatests groen, en elke
regel die uit `server.ts` verdween staat letterlijk terug, op de bedoelde
omzettingen na (`this.#` wordt `d`, een private methode een functie met `d`
vooraan, en de deurbel heet `bel` omdat `d` de context is). `server.ts` is
473 regels.

Uit `main.ts` alleen wat op zichzelf staat, als functie met zijn invoer
expliciet, en daardoor nu getoetst: wat de bel elke minuut opbouwt
(`web/meldingen-bron.ts`), wie een melding op de telefoon krijgt en de
proefmelding (`push.ts`), de weerbron (`web/weerbron.ts`), de historie uit
de statistiek (`web/historie.ts`) en de configuratie met alles wat de app
erover legt (`web/config-uit-app.ts`). Het aan elkaar knopen blijft in
`main.ts` (1.728 regels): geen test laat dat script starten, dus daar alleen
wat zonder gedeelde stand kan. `--check-config` loopt erna nog zoals ervoor.
Geen nieuwe versie: voor de bewoner verandert er niets.

## 181. Een profiel per bewoner: licht of donker, een eigen kleur, en de wand volgt wie er geldt

*Onderwerp: weergave · Status: geldig*

Stap 10 uit het stappenplan van besluit 172, het eerste punt: de lichte versie
en de eigen kleur van besluit 87, per bewoner. Op 21 oktober 2026 koos de
bewoner na de schetsen `Thuis-Tel-Licht`, `Instellingen-Tel-Jij` en
`Wand-Thuis-Profiel`: alles licht, ook de lucht; drie keuzes voor het thema; op
de telefoon je eigen kleur en op de wand die van wiens comfort geldt; de kleur
op het menu, de keuzes, de hoofdknoppen en je naam, maar niet op het logo. Hij
zei erbij: een bewoner heeft zo een eigen profiel (comfort, thema en kleur, de
kaarten en favorieten), en wie thuis is, of de hoofdgebruiker als er meer
thuis zijn, ziet op de wand zijn eigen profiel.

*Besluit:*

- **Het thema, op je eigen apparaten:** donker (zoals het was en de
  standaard), licht, of zoals je telefoon. Ook als je telefoon of tablet ligt
  en de brede indeling toont; eerst bleef die donker, en dan stonden de lichte
  balken van Home Assistant om een donkere pagina. Een scherm, zoals de wand,
  blijft altijd donker. Licht is
  alles: een lichte lucht van hetzelfde moment, lichte kaarten en tabs,
  donkere tekst. Het huis houdt zijn eigen kleuren; de grond, de wolken en de
  maan worden lichter.
- **Zes eigen kleuren, elk een andere tint:** lucht (de standaard, zoals de
  app altijd was), framboos, zeegroen, violet, koper en grafiet. Elk met een
  tint voor donker en een voor licht die het contrast van WCAG AA haalt
  (besluit 86). Nooit het blauw, oranje, amber of groen van de betekenis: die
  zeggen wat het huis doet (87). Wie nog niets koos, krijgt er een op zijn plek
  in de volgorde: de hoofdgebruiker lucht, de tweede framboos, de derde
  zeegroen. Eerst waren het lucht, roze, violet, paars, indigo en zilver; de
  bewoner vond dat te veel paars en roze. De kleur staat op het menu, op wat gekozen is, op de
  hoofdknoppen en op je naam in de begroeting; op de wand ieder die thuis is in
  zijn eigen kleur, ook in de rondjes van wie er thuis is. Die rondjes hadden
  een vaste rij met amber en groen; nu de kleur van de bewoner.
- **De wand volgt het profiel dat geldt:** de kleur, de kaarten en de
  favorieten van wiens comfort geldt (147), en bij niemand thuis die van de
  hoofdgebruiker. Eén indeling per bewoner: de wand toont de kaarten en
  favorieten van zijn telefoon, zonder de kamers en Straks, die de wand zelf
  al laat zien. Pas je ze op de wand aan, dan verandert de telefoon mee; de
  bewerkbalk zegt van wie je aanpast. Eerst kreeg ieder een eigen indeling
  voor de wand naast die van zijn telefoon; de bewoner vond dat twee keer zo
  veel instelwerk. Van de wand zelf blijven: de nachtstand en de rust (164,
  165), eenvoudig of uitgebreid, en minder beweging. Zonder bewoners blijft de
  wand van het huis. Dat verandert besluit 162, waar de wand van iedereen was.
- **Jij, bovenaan Instellingen** (`jij.html`): alles van één bewoner op één
  plek. Het thema en de kleur kies je daar, in een blad; grotere letters en
  minder beweging zet je er aan; de rest wijst naar waar het al stond (de
  weergave op Thuis, je comfort, je naam en hoe het huis weet dat je thuis bent
  bij Bewoners, je gegevens). Kaarten en Favorieten openen elk meteen het
  aanpassen op Thuis. Een scherm ziet alleen hoe de app eruitziet, een
  gast heeft geen profiel. De losse regel Weergave op Instellingen is daarin
  opgegaan.
- **Waar het staat:** bij de voorkeuren per account (`voorkeuren.json`,
  `thema` en `kleur`); de dienst weet uit de bewoners wie op welke plek
  staat en wiens comfort geldt. Een klein script in de `<head>` van elke pagina
  zet het thema en de kleur vóór de eerste weergave, uit wat de pagina de
  vorige keer onthield; de dienst heeft het laatste woord.
- **De kleurlaag:** `kit/kit.css` heeft nu tokens die het lichte thema
  omdraait (`--wit` voor glas en lijnen, `--nacht` voor wat zweeft, `--tegen`
  voor tekst op een vlak in de tekstkleur, en de betekeniskleuren als tekst).
  De vaste kleuren in de pagina's zijn daarnaar omgezet; op de wand verandert
  er niets. Een paginatest zet elke pagina licht en meet het contrast van alle
  tekst; het bolletje met een getal bij de bel haalde maar 2,6:1 (wit op
  oranje) en heeft nu donkere tekst, ook in het donker.
- **Het huis in het licht:** elke donkere kleur van het huis gaat een tint
  omhoog, tot leisteen, licht genoeg om geen zwarte vlek te zijn en donker
  genoeg voor de witte namen op de muren. De labels op het huis zijn witte
  kaartjes met donkere tekst; de ring tussen de bollen van wie er thuis is, is
  licht.
- **Versie 0.55.0;** na het nalopen door de bewoner (één indeling, andere
  kleuren, een lichter huis) versie 0.55.1; liggend ook licht, Kaarten en
  Favorieten apart bij Jij, en favorieten die niet meer terugsprongen naar de
  eerste pagina in 0.55.2.

*Wat afviel:* het logo in je kleur (de bewoner wilde dat niet). De wand licht:
die hangt aan de muur en wordt 's avonds bekeken (87). En een eigen indeling
voor de wand naast die van de telefoon (zie hierboven).

## 182. Vier kaarten voor Thuis: de auto, de batterij, deze maand en de deurbel

*Onderwerp: weergave · Status: geldig*

Stap 10 uit het stappenplan van besluit 172, het tweede punt: de vier kaarten
die besluit 162 voor later liet. Op 21 oktober 2026 koos de bewoner na de
schets `Thuis-Tel-Kaarten`: alle vier nu, ook de auto en de batterij, die dit
huis niet heeft; deze maand met opgewekt, zelf gebruikt en wat het kostte; en
een tik op de auto of de batterij naar Apparaten.

*Besluit:*

- **Vier kaarten om te kiezen,** bij Thuis aanpassen, op de telefoon en op de
  wand; niet standaard. Wat het huis niet heeft, staat er niet en wordt ook
  niet aangeboden bij Kaart toevoegen.
- **De auto:** hoe vol (een balk en een percentage), of hij laadt en met
  hoeveel kW, of hij aangesloten is, en het bereik. Een tik opent Apparaten,
  bij de kaart van de auto.
- **De batterij:** hoe vol, en of hij laadt, het huis voedt of rust, met het
  vermogen. Ook bij Apparaten een eigen kaart. Smart Climate kijkt alleen; hij
  stuurt de batterij niet.
- **Deze maand:** opgewekt (of zonder panelen: gebruikt), welk deel zelf
  gebruikt, en wat het kostte naast de maand ervoor, uit Opbrengst; een tik
  opent Opbrengst. Zonder meters een zin met wat er nodig is.
- **De deurbel:** het laatste beeld, hooguit elke minuut ververst, en wanneer
  er het laatst werd aangebeld. Een tik opent het live beeld groot, zoals bij
  aanbellen; geeft het gekozen beeld niets, dan een ander beeld van dezelfde
  camera (`/api/deurbel`).
- **Herkennen in Home Assistant** (`web/opslag.ts`): Home Assistant kent geen
  vaste soort voor een thuisbatterij of een auto, dus per apparaat, op wat het
  meet en wie het levert. Een auto heeft een actieradius of komt van een
  koppeling voor auto's (Tesla, Volkswagen, Kia, ...); een laadpaal komt van
  een koppeling voor laadpalen (Easee, Zaptec, Wallbox, ...) en is de auto als
  die zelf niet in Home Assistant staat; een thuisbatterij heeft een lading in
  procenten en slaat energie op, of komt van een koppeling of een type voor
  thuisbatterijen (Powerwall, Sessy, Marstek, Huawei LUNA, ...). Laden of
  leveren volgt uit het vermogen; een paar merken tellen omgekeerd. Weet de
  app het niet zeker, dan zegt hij alleen het percentage. Getoetst met
  nagebootste apparaten; dit huis heeft ze niet, dus nog nergens echt gezien.
- **Versie 0.56.0.**

*Wat afviel:* "vol rond 16:30" bij de auto: dat vraagt de capaciteit van de
accu, en die zegt lang niet elke koppeling. En de batterij of de auto sturen:
dat is schrijven, en hoort bij stap B.

## 183. Meldingen op de telefoon, via de app van Home Assistant

*Onderwerp: weergave · Status: geldig*

Stap 10 uit het stappenplan van besluit 172, het derde punt: de pushmelding
van besluit 79. Op 22 oktober 2026 koos de bewoner na de schets
`Instellingen-Tel-Meldingen`: vier soorten naar de telefoon; komt iets vanzelf
goed, dan verdwijnt de melding stil; en het dringende staat meteen aan.

*Besluit:*

- **Wat naar de telefoon gaat,** per bewoner te kiezen bij Jij › Meldingen op
  je telefoon:
  - **rook en koolmonoxide** en **als de regeling hapert** (een apparaat in
    een kamer dat al een uur niet reageert, een meter die niets levert):
    dringend, altijd, ook 's nachts; standaard aan;
  - **een batterij of filter bijna op** en **een nieuwe versie**: overdag;
    wat in de nachtrust opkomt, komt na de nachtrust als het dan nog speelt;
    standaard uit.
  De rest blijft bij de bel in de app (136), zoals besluit 79 al zei.
- **Weer goed:** de melding op de telefoon wordt stil vervangen door "weer
  goed", met hetzelfde label en zonder geluid. Wat langer dan een dag speelt,
  gaat niet meer op de telefoon als je het aanzet: geen stapel oude meldingen.
- **De nachtrust** is per bewoner in te stellen, standaard 23:00 tot 07:00.
- **De telefoon:** de app van Home Assistant op een telefoon (`mobile_app`).
  Hangt die aan de persoon van je account, dan is het de jouwe; anders kies je
  er een. Een proefmelding laat zien of het aankomt. Een tik op een melding
  opent Smart Climate in de app van Home Assistant: het paneel op `/<slug>`
  van de add-on. Eerst was dat `/hassio/ingress/<slug>`, en dat gaf een 404
  (0.58.1).
- **Een zevende smalle deur** in de client (`allowNotify`, `isNotifyCall`):
  precies `notify.mobile_app_…`, zonder doel, met alleen een titel, een tekst
  en de vaste velden van zo'n melding (een label, waar een tik heen gaat, hoe
  dringend). Een andere notify-dienst, een doel, of knoppen in de melding
  blijven werpen, net als klimaat (besluit 15); een test bewijst het.
- **Alleen vanuit de add-on.** De schaduw op de NAS kijkt mee en blijft stil;
  anders kwam elke melding dubbel. Wat er verstuurd is, staat in een eigen
  bestand (`push.json`) naast de dataset.
- **Versie 0.57.0.**

*Wat afviel:* knoppen in de melding (zoals "Nog een uur" bij een ingreep die
afloopt, uit besluit 79): die ingreep bestaat nog niet, en een knop die iets
doet is weer een deur. Het sluipverbruik van de nacht ervoor als melding: de
bel kent het nog niet. Beide kunnen later in hetzelfde scherm.

## 184. De integratie Smart Climate: Assist zonder YAML

*Onderwerp: visie en principes · Status: geldig*

Stap 10 uit het stappenplan van besluit 172, het laatste punt: de eigen
integratie van besluit 91. Op 22 oktober 2026 koos de bewoner, na uitleg over
waarom (geen YAML voor een ander huis, zinnen die verouderen, de weg voor stap
B) en over HACS: alleen Assist, nog geen sensoren; de zinnen uit de add-on, zodat
een verbetering met een gewone update komt; en zowel HACS als een knop in de
app, zodat niemand HACS nodig heeft. Hij vatte het samen: dit is zodat mensen
niets met de hand in de YAML hoeven te doen, zoals hij moest.

*Besluit:*

- **Een integratie in `custom_components/smart_climate`,** in deze
  repository. Hij registreert de vraag voor Assist in code
  (`SmartClimateVraag`, met de soort vraag als vaste waarde: nu, waarom,
  straks, zon, doe) in plaats van `intent_script` en `rest_command`, en stelt
  hem aan Smart Climate met de sleutel. Alles leest alleen; een opdracht
  krijgt als antwoord wat Smart Climate zou doen.
- **De zinnen komen uit de add-on** (`/api/assist`, `zinnen.ts`): de zinnen
  en de kamers van dit huis, met de namen van de kamers in de indeling die bij
  een zone horen ("keuken" bij de woonkamer). De integratie schrijft ze in één
  eigen bestand in `custom_sentences/<taal>/`, werkt het elk half uur bij als
  het verandert, en haalt het weg bij verwijderen. Een nieuwe zin komt zo met
  een update van de add-on; de integratie zelf verandert zelden.
- **Toevoegen met één klik:** de add-on meldt zich bij de Supervisor aan met
  zijn adres en de sleutel (`discovery`), en Home Assistant toont "Nieuw
  apparaat gevonden: Smart Climate". Zonder add-on vul je het adres en de
  sleutel uit de app in.
- **Installeren via HACS, of met een knop in de app** (Sleutel voor de
  assistent): de add-on kopieert dan alleen `custom_components/smart_climate`
  naar de configuratie van Home Assistant, met een merkje, en werkt hem bij
  met elke update van de add-on. Staat hij er via HACS (zonder merkje), dan
  blijft de add-on eraf. Daarvoor mag de add-on in de configuratie van Home
  Assistant schrijven (`homeassistant_config:rw`), en dat doet hij alleen na
  die tik. Na neerzetten of een nieuwe versie herstart de bewoner Home
  Assistant zelf; de app zegt het, en ziet aan de geladen versie of het
  gebeurd is.
- **Een eigen versie, los van de app** (0.58.1): de integratie begint op 1.0.0
  en gaat alleen omhoog als zijn code verandert; een test bewaakt dat met een
  vingerafdruk. Voor HACS komt er bij zo'n versie een GitHub-release. Zo vraagt
  een update van de app geen herstart van Home Assistant; eerst had de
  integratie het nummer van de app, en zagen HACS en de knop bij elke update
  een nieuwe versie. De app legt de stappen in HACS uit, en dat het eenmalig
  is.
- **Reparatie (0.58.2):** bij het installeren herstartte Home Assistant een paar
  keer, en daarna bleef de app hangen. Een vraag aan Home Assistant zonder
  verbinding ging stil verloren en kreeg nooit antwoord; de lijst van
  beheerders achter Ingress (besluit 161) wachtte daarop, en daarmee elke
  pagina, ook nadat de verbinding terug was. Nu faalt zo'n vraag meteen, krijgt
  elke vraag een grens van 20 seconden, wordt een verbinding die niet binnen
  20 seconden staat opnieuw geprobeerd, en geldt de vorige lijst van beheerders
  zolang er geen nieuwe is. En `manifest/get` mag (lezen), zodat de app ziet
  welke versie van de integratie geladen is.
- **`ha-assist/` is weg.** Wie Assist met de YAML had ingericht, haalt na het
  installeren `rest_command`, `intent_script` en de sleutel in `secrets.yaml`
  weg; het zinnenbestand wordt vanzelf overschreven.
- **Getoetst in een echte Home Assistant** (2026.10, met
  `pytest-homeassistant-custom-component`, ook in de CI): toevoegen met de hand
  en ontdekt via de add-on, het zinnenbestand, een vraag, verwijderen, en
  gesproken zinnen ("waarom draait de zolder?", "koel de keuken naar 21
  graden") die met de goede kamer bij Smart Climate uitkomen.
- **Versie 0.58.0.**

*Wat afviel:* sensoren per kamer voor eigen dashboards (later, als iemand ze
wil). Een eigen gespreksagent: dan gaat ook "doe het licht aan" eerst langs
Smart Climate (91). En de add-on die de integratie ongevraagd neerzet: dat
schrijft zonder dat de bewoner erom vroeg.

## 185. Meertalig: het fundament, met Thuis als proef

*Onderwerp: weergave · Status: geldig*

Stap 8 uit het stappenplan van besluit 172, de uitwerking van "Engels naast
Nederlands" uit besluit 86. Op 22 oktober 2026 koos de bewoner uit opties: de
taal uit je account van Home Assistant, bij Jij te wijzigen; de wand volgt het
account waarmee hij in Home Assistant zit; een sleutel en een bestand per taal;
en Engels in Britse stijl. Tussendoor vroeg hij of er meteen rekening werd
gehouden met meervouden: ja, met de regels per taal.

*Besluit:*

- **Alle teksten op één plek, per taal:** `frontend/kit/teksten.nl.js` en
  `teksten.en.js`, een sleutel per tekst (`thuis.weer.kop`). De code vraagt ze
  met `t('…')`, de HTML met `data-t="…"` (de tekst), `data-t-html` (met
  `**vet**`) of `data-t-aria-label="…"` (een attribuut). `{naam}` vult zich
  met wat de code meegeeft. In `kit/`, naast de tekenmotor: zo nemen de
  schetsen van ontwerp 2 ze ook mee.
- **Meervoud met de regels van de taal:** een tekst als
  `{ one: '1 lamp aan', other: '{n} lampen aan' }` kiest zijn vorm met
  `Intl.PluralRules`, met `zero` voor een eigen zin bij nul. Een taal met meer
  vormen, zoals later Duits of een andere, past erin zonder dat de code
  verandert.
- **Welke taal:** wat de bewoner bij Jij koos (Automatisch, Nederlands,
  English; per account bewaard in de voorkeuren en op de telefoon onthouden),
  anders de taal van zijn account in Home Assistant (binnen Home Assistant
  leest de app die van het paneel eromheen), anders die van de browser. De
  wand en elk ander scherm hebben geen profiel en volgen hun eigen account.
  Een andere keuze laadt de pagina opnieuw.
- **Engels is nog een proef:** Automatisch kiest alleen een taal die de hele
  app spreekt. Tot stap 9 klaar is, is dat Nederlands; Engels kies je zelf bij
  Jij. Anders zag iemand met een Engels account op de andere pagina's een
  mengtaal.
- **Getallen, tijden en datums in die taal:** `taal.getal`, `taal.klok`,
  `taal.datum`. Engels in Britse stijl: 22:00, 20.5° en Thursday 22 October;
  temperaturen blijven in °C.
- **De dienst praat mee:** de app stuurt de taal mee (`x-taal`, en `?taal=`
  bij de live-stroom), en de uitleg die al tweetalig was (de kop van Thuis, de
  kamers, het apparaat) komt in die taal. Niet Accept-Language: die zet de
  browser, en dan zou de uitleg wisselen met de taal van de telefoon.
- **Thuis als proef:** de pagina, de kaarten, het weer, de bladen, Hoe voelt
  het, het menu en de tekst in de tekening. Kamernamen blijven zoals de
  bewoner ze noemde; in het Engels zonder Nederlands lidwoord.
- **Bewaakt:** een test houdt de twee bestanden gelijk (sleutels, `{plekken}`,
  meervoudsvormen), kijkt of elke gevraagde sleutel bestaat, en vindt losse
  Nederlandse tekst in de bestanden die al omgezet zijn; die lijst groeit met
  stap 9. Een paginatest zet Thuis in het Engels, met de
  toegankelijkheidscontrole van besluit 86 (axe, WCAG 2 A en AA). Die vond
  meteen iets: de tekening van het huis heette voor een schermlezer een
  plaatje, met aantikbare kamers erin die zo niet te bereiken waren; nu is het
  een groep.
- **Versie 0.59.0.**
- **Stap 9, eerste deel (0.59.1):** wat op elke pagina staat (`basis.js`: geen
  verbinding, het rookalarm, aanbellen, de meldingen en Onderhoud, wat er
  nieuw is en bijwerken), en de rest van Thuis: Aanpassen en de favorieten, de
  rondleiding en de wand als niemand kijkt. `npm run teksten` toont per bestand
  wat er nog om te zetten is; de taaltest gebruikt dezelfde herkenning. De
  proefomgeving op de NAS (`index.html`, `app.js`) blijft
  Nederlands: die is voor de ontwikkelaar.
- **Stap 9, tweede deel (0.59.2):** Kamer, Vandaag, Apparaten, Opbrengst en
  de Assistent, met de microfoon en "Hé huis" (het wekwoord zelf blijft
  Nederlands). Wat de app aan de assistent vraagt, gaat in de taal van de app
  (`?taal=`), zodat het antwoord in die taal komt. Piper spreekt hier alleen
  Nederlands; in een andere taal leest de assistent voor met de stem van het
  apparaat. De paginatest zet al deze pagina's in het Engels, met de
  toegankelijkheidscontrole op elk. Woorden die de dienst nog in het
  Nederlands geeft en die de app herkent (een scherm dat beweegt, "Er draait
  niets"), staan als vaste patronen in de code tot de dienst meertalig is.
- **Stap 9, derde deel (0.59.3):** Instellingen en de pagina's erachter: Jij
  (ook de meldingen op je telefoon), Comfort, Regeling, Energie met hoe de
  panelen liggen (`panelen.js`), Functies, Bewoners en toegang, en Bewoners;
  ook de opbouw die ze delen (`groep.js`: vorige en volgende, "Bewaard"). Van
  `stand.js` staan wat er nog mist en het zoeken in beide talen; het zoeken
  vindt een instelling op de woorden van de taal van de app. Wat je huis kan
  (`stand.kan`) volgt in deel 4, met Inrichten en Indeling. Een paar uitleggen
  met vet of code (de stappen voor het startscherm en voor HACS) hebben hun
  HTML in de tekst; wat erin komt, wordt ontsnapt. Namen die bewaard worden,
  zoals de vaste posten bij Contract en prijzen, krijgen de taal van wie ze
  aanmaakt. De herkenning van losse Nederlandse tekst kent nu meer woorden
  (ook "hoofdmenu", "instellingen", "terug"), en de taaltest vindt een
  sleutel in elke ternary, niet alleen voor Thuis. De paginatest zet ook deze
  acht pagina's in het Engels met de toegankelijkheidscontrole; die vond dat
  de QR-code bij Bewoners een label had zonder rol (nu een afbeelding). Met
  `HEMS_PAGE_SHOTS=<map>` maakt hij per pagina een afdruk, om te zien of de
  Engelse zinnen passen.
- **Stap 9, vierde deel (0.59.4):** Wat je huis kan (heel `stand.js` en
  `huis-kan.*`), `huismodel.js` (de soorten kamers, delen en buitenruimtes,
  en de bronnen van warmte), Kamers en indeling, Inrichten, het begin bij een
  leeg huis, het welkom bij de eerste inlog en de film. Een buitenruimte wordt
  ook aan een Engelse naam herkend. Wat de dienst als stand van een airco geeft
  (`huismodel.ACTIEF`), staat als vast patroon tot de dienst meertalig is. De
  hulpscripts om om te zetten staan in `backend/tools/omzetten`, met een
  LEESMIJ over waar het staat, zodat een andere sessie verder kan. De
  paginatest zet ook deze pagina's en de film in het Engels.

- **Stap 9, vijfde deel (0.59.5):** wat de dienst zelf zegt. De stand van een
  apparaat, wat een klimaatapparaat doet, de samenvatting en de status van een
  kamer die meedoet (`api/huis`, per taal bewaard), met een vaste code ernaast
  (`standCode`, `klimaat.actieCode`). De app let op die code in plaats van op
  het woord, zodat de vaste patronen (`huismodel.ACTIEF`, `BEWEEGT` in
  `kamer.js`, "Er draait niets") vervallen. Ook het weer, Opbrengst (de
  periodes, de vakken, de vergelijking en de kostenregels, elke regel met een
  vaste soort; per taal bewaard), de besluiten bij Vandaag (opnieuw in woorden
  uit de bewaarde opdrachten; de app haalt de actie en het doel uit de
  opdracht), de ligging van de panelen, Klaarzetten (met de plekken zoals de
  Engelse Home Assistant ze noemt), de vragen bij het begin en de
  standaardnamen van de etages. Meldingen maakt de dienst in beide talen en
  bewaart de Engelse woorden ernaast: de bel krijgt de taal van de app, een
  melding op de telefoon de taal die de bewoner bij Jij koos (Automatisch is
  daar Nederlands, zolang Engels een proef is). Een melding van vóór 0.59.5
  blijft Nederlands. Wat er nieuw is heeft per versie ook Engelse regels; een
  test eist ze bij elke versie die de app laat zien. Wat een opgeslagen naam
  is (een kamer, een vaste post, een apparaat) blijft zoals de bewoner hem
  noemde.

- **Stap 9, zesde deel (0.59.6):** de assistent. De woordzoeker en bedienen met
  een zin verstaan Engels, met Engelse kaartjes en een Engels vervolg dat de
  woordzoeker zelf weer verstaat. De dienst maakt de zinnen voor Assist ook in
  het Engels (`custom_sentences/en`); de integratie hoefde daarvoor niet te
  veranderen, en de test in een echte Home Assistant vraagt het nu ook in het
  Engels. Piper zoekt per taal een stem (Engels: Brits eerst) en zegt een
  Engelse zin met Engelse eenheden (`uitspraak(tekst, 'en')`); zonder Engelse
  stem leest de app voor met de stem van het apparaat. Het wekwoord blijft
  "Hé huis".

- **Engels is geen proef meer (0.59.7):** op 23 oktober 2026 koos de bewoner
  ervoor dat Automatisch ook Engels kiest, nu de app, de dienst en de assistent
  het spreken (`'en'` in `HEEL`, `frontend/kit/taal.js`). Een melding op de
  telefoon volgt bij Automatisch de taal waarin de app van dat account het
  laatst opende (`VoorkeurenStore.zagTaal`): de dienst kent de taal van het
  account in Home Assistant niet, de app wel. Dat wordt niet bewaard; na een
  herstart is het Nederlands tot de app weer opent. De paginatest opent zijn
  vensters in het Nederlands, tenzij een test anders vraagt.

- **De laatste restjes (0.59.11):** op 23 oktober 2026 koos de bewoner beide
  talen in één bestand voor de notities bij een update: `addon/CHANGELOG.md`
  zet per versie eerst het Nederlands en dan onder *English* het Engels
  (**New**, **Improved**, **Fixed**). Home Assistant toont het hele bestand;
  de app leest het deel in de taal van wie kijkt, en het Nederlands bij een
  versie zonder Engels. Ook wat het begin zegt als bewaren niet lukt, staat nu
  in beide talen.

## 186. Warmte bewaren: de boiler en de jacuzzi op zon

*Onderwerp: kern en regeling · Status: geldig*

Het eerste deel van de makeover voor het grote publiek, op 23 oktober 2026.
Het volgende proefhuis heeft een Intex-jacuzzi op wifi. De bewoner koos uit
opties en een schets (`design/app2/Wand-Apparaten-Warmte.html`): warm houden
plus "klaar om" bij de jacuzzi, vier soorten boiler herkennen maar alleen de
eigen soort laten zien, zonder zon van het net in de goedkoopste uren, en in de
lijst Op zon standaard helemaal achteraan.

*Besluit:*

- **Een nieuwe soort naast de droger:** een warmtebuffer (`heatStores` in de
  configuratie, `core/warmtebuffer.ts`). Een droger draait één programma en
  stopt; een buffer mag aan zolang er zon is en uit als die wegvalt. Hij heeft
  een ondergrens (`minC`), een doel op zon (`sunC`), een snelheid in graden per
  uur, en bij een boiler eens per week een temperatuur tegen legionella.
- **Wat hij zou doen,** in deze volgorde: onder de ondergrens altijd bijwarmen;
  "klaar om" uiterlijk zo laat dat hij het met zijn snelheid haalt (met een
  half uur speling), en eerder in de goedkoopste uren, maar hooguit vier uur
  vóór die uiterlijke start, anders koelt het water weer af; tegen legionella
  een dag over de week in de goedkoopste uren; een boiler zonder temperatuur
  (aan een stekker) elke dag een keer vol; verder op zon tot het doel.
- **Op zon zoals de droger:** hooguit één start per beslissing (besluit 68),
  de hoofdzekering gaat voor (78), comfort gaat voor (85). Een buffer die al
  stookt mag door met de tolerantie van een draaiend apparaat (51), zonder de
  afkapping op nul van het budget, want zijn eigen verbruik komt er weer bij;
  doorgaan is geen start. In de volgorde op zon (176) heet hij `heatStore` en
  staat hij zonder keuze achter de kamers en de apparaten met een eindtijd.
- **De goedkoopste uren** zijn voorlopig de daluren van het contract, als het
  een daltarief heeft (`cheapWindows`, uit de dienst). Dynamische prijzen komen
  met stap E. Zonder goedkopere uren gebeurt wat van het net moet zo laat als
  het kan.
- **Herkennen** (`web/buffers-vinden.ts`): een jacuzzi aan zijn naam of de
  koppeling Intex Spa, als thermostaat of, via Tuya Local, als boiler; een
  `water_heater` als boiler met temperatuur (een warmtepompboiler trekt 0,5 kW
  en warmt 6° per uur, een elektrische 2 kW en 10°); een schakelaar die boiler
  heet, met de meter van hetzelfde apparaat; een regelaar als AC·THOR. Ze komen
  in de lijst van de zon en je aansluiting, naast de droger.
- **Wat de dienst onthoudt** staat in `warmtebuffers.json` naast de dataset:
  klaar om, wanneer de boiler warm genoeg was tegen legionella, en wanneer een
  boiler aan een stekker vol was. Een zesde smalle deur (`/api/klaarom`); er
  gaat niets naar Home Assistant.
- **In de app:** een kaart op Apparaten (de boiler als tank, de jacuzzi als
  ring met de temperatuur) met een kop en een zin uit de dienst, bij de
  jacuzzi de keuzes voor klaar om; een rij op Vandaag; een plek in het huis en
  de indeling; en een plek in de lijst Op zon.
- **Eerst in de schaduw:** elke beslissing zegt wat hij zou doen, en het
  logboek legt het vast (`warmte`). Echt schakelen hoort bij stap B, net als bij
  de droger.
- **Wat de Intex niet zegt:** of hij echt stookt. De koppeling meldt
  "verwarmen" zodra hij aan staat. Met een slimme stekker met meting ziet het
  huis het wel, en die neemt de app mee als hij bij hetzelfde apparaat hoort.
- **Versie 0.60.0.**

*Wat afviel:* de boiler en de jacuzzi als uitstelbaar apparaat met een
programma (ze hebben er geen); alleen op zon, nooit van het net (dan raakt de
boiler leeg); alle vier de soorten boiler in het instelblad tonen (verwarrend:
alleen die van de bewoner).

---

## 187. Huis 3.0: het huis als eiland, kaarten smal of breed, en de panelen op elk dak

*Onderwerp: weergave · Status: geldig*

Het tweede deel van de makeover voor het grote publiek, op 23 en 24 oktober
2026. De bewoner koos uit schetsen (`design/app2/Wand-Thuis-3.html`,
`Tel-Huis-3.html`, `Wand-Huis-3.html`, `Wand-Energie-Panelen-3.html` en
`Wand-Huis-kan-3.html`), in vier rondes met punten tussendoor: een eindbeeld
met wow, geen kleine uitbreiding van het oude huis, geen doorzichtige buren,
weinig tekst en niets dubbel.

*Besluit:*

- **Het huis staat op een eiland** (`kit/huis.js`, `opts.wereld`): het perceel
  zweeft, dun, met de voorkant als doorsnede door huis en grond. De kelder ligt
  opengewerkt in een nis, de kabel van het net loopt onder de grond naar de
  meterkast. Bomen, een haag, een lantaarn, de tuin met vaste plekken (tuinhuis
  achter, jacuzzi op een vlonder, terras, pad met lampjes, border) en een schaduw
  met de zon. Op de wand en de telefoon van Thuis, bij Zonnepanelen en bij Wat je
  huis kan; de andere pagina's houden voorlopig het oude huis.
- **Het weer en de seizoenen** op het huis: vallende regen en sneeuw uit het weer
  van nu, kale bomen in de winter en oranje in de herfst (oktober en november).
- **Elke stroom een eigen kleur:** van de zon goud, terug naar het net groen,
  van het net violet, uit de batterij blauw. Het label van het net heeft de kleur
  van zijn lijn.
- **De kelder gaat onder de grond.** Wat Home Assistant onder de begane grond
  zet, komt in de etage `kelder` (eerst bleef een kelder bij de begane grond,
  besluit 119). In de tekening van huis 3.0 ligt hij onder de grond
  (`kelderOnder`); Inrichten en de indeling houden hem als gewone etage.
- **De boiler is geen droger.** Een boiler of jacuzzi (besluit 186) krijgt bij
  het huis een veld `warmte` (soort, temperatuur, doel, grenzen, op zon). De
  boiler staat als ronde tank in de kamer die bij het inrichten gekozen is, geen
  vaste plek; de jacuzzi in de tuin, en zonder tuin komt er een.
- **Panelen op elk dak:** naast het huis ook op de garage, de carport of het
  tuinhuis (`elders` in de antwoorden van de aansluiting, een aantal per plek).
  Ze staan in de tekening en in de lijst; de meting van de ligging blijft over
  de panelen op het huis gaan.
- **Energie › Zonnepanelen opnieuw:** het huis met de gemeten ligging op het dak
  en per dakvlak een label met de richting in graden en de helling; een lijst
  "Waar liggen ze?" met per dak het aantal (plus en min) en "Ook panelen op"
  voor de andere daken; "Wat Smart Climate meet" met de richting in graden vanaf
  het noorden (met een kompasje), de helling, het vermogen en de omvormer.
  Klopt het voorstel, dan staan Klopt en Aanpassen naast de kop. Zelf aanpassen
  opent wat er al was: de kant, het aantal en Aanpassen. Het kompas op het eiland
  draait zo dat de getekende dakvlakken naar hun gemeten richting wijzen.
- **De kaarten op de wand in twee kolommen,** elk smal of breed (`breed` in de
  voorkeuren, bij wiens indeling het is, besluit 181). Standaard breed:
  Favorieten, Vandaag en Hoe voelt het. In de bewerkstand per kaart Smal en
  Breed; slepen gaat ook opzij.
- **Op de telefoon één bovenbalk:** op Thuis, Vandaag, Apparaten, Opbrengst en
  Assistent de hulp, de bel en het tandwiel, alle drie 36 px, rechtsboven. De
  hulp start de rondleiding bij deze tab. Onder het huis op Thuis een regel met
  de zon, het huis en het net, in de kleuren van de lijnen.
- **Wat je huis kan in zes groepen:** Comfort, Wat het huis eerst leert (op tijd
  warm of koel, wat jij prettig vindt, de ligging van de panelen), Op zon (met de
  boiler en de jacuzzi), Kosten, Gemak en Overzicht.
- **Alles wissen bij de meldingen:** wat nog speelt, laat de app niet meer zien
  tot het voorbij is; wat voorbij is gaat uit de lijst (`{ alles: true }` op
  `/api/meldingen`).
- **Versie 0.61.0.**

*Wat afviel:* de buren tekenen, ook doorzichtig; een groot eiland met veel grond
eronder; de kaarten in één kolom zonder keuze; een vaste plek voor de boiler
zonder kelder; nieuwe iconen alleen op de panelenpagina (dat kan later, en dan
overal tegelijk).

*Nog te doen:* Inrichten opnieuw in stappen (met de klimaatschetsen per merk), de
andere pagina's op het eiland, een huis zonder slimme regeling, P1-meter of
panelen, en de film.

---

## 188. In de schaduw zegt de app wat er echt gebeurt, als het klopt

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026, bij het nalopen van versie 0.61.0 op beta. Thuis zei
"Badkamer: zou verwarmen" terwijl de oude regeling de badkamer al echt
verwarmde. Dat klopt niet met wat de bewoner in huis ziet.

*Besluit:*

- **Doet het echte apparaat al wat het besluit wil,** dan zegt de kamer ook in
  de schaduw "Verwarmt" of "Koelt" (met "op zon" als dat zo is), en niet "Zou
  verwarmen". Het besluit vergelijkt zijn actie met wat het apparaat in Home
  Assistant werkelijk doet (`observed`, zoals `heat@21`); de kamer krijgt een
  veld `klopt`.
- **De kop volgt:** één kamer "De badkamer wordt verwarmd"; meer kamers die
  allemaal kloppen en hetzelfde doen "De badkamer en beneden worden verwarmd".
  Wijkt er één af, dan blijft het "zou" (besluit 124).
- **De lange zin van de assistent** blijft zeggen wat Smart Climate zou doen:
  daar gaat het om het besluit, niet om wat er al gebeurt.
- **Ook in deze versie:** de lucht op de wand loopt door achter het huis (het
  eiland tekende zijn eigen lucht in een vak, dat ophield); op de telefoon onder
  het huis drie vakjes, zon, huis en net, elk met een icoon in de kleur van zijn
  lijn, zonder pijl; bij Wat je huis kan staan de labels van de auto en de
  batterij vrij van het menu en de vakken.
- **Versie 0.61.1.**

*Wat afviel:* "zou" houden tot het huis zelf regelt (dat zegt iets wat niet
klopt met wat je ziet); de pijlen tussen zon, huis en net (een pijl naar links
zei niets).

---

## 189. De kaarten op de wand als tegel, en een kaart Boiler

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026. In versie 0.61.0 kwam smal of breed (besluit 187), maar een
smalle kaart was de oude kaart in een smaller vak: de grafiek van Vandaag liep
eruit. De bewoner verwachtte de kaarten uit de schets (`Wand-Thuis-3.html`).

*Besluit:*

- **Een smalle kaart op de wand is een tegel,** zoals in de schets: een kleine
  kop met het icoon, een groot getal, een zin, en rechtsboven een beeldje. De
  auto met een ring, de batterij met een staaf, deze maand met balkjes van de
  laatste dagen, de boiler met een tank, morgen met het weer, Vandaag met een
  kleine lijn van de zon, en de deurbel met het beeld als achtergrond.
- **Breed, en op de telefoon,** blijft de kaart zoals hij was: daar is ruimte
  voor meer (`.kvol` naast `.ktegel`).
- **Favorieten, Hoe voelt het en het apparaat** blijven kaarten om op te tikken;
  smal passen ze zich aan (de uitleg van Hoe voelt het valt dan weg).
- **Alles blijft binnen zijn kaart:** een smalle kaart snijdt af wat niet past,
  en elke rij in de kolom is zo hoog als zijn inhoud, zodat een volle kolom een
  kaart niet platdrukt; de kolom schuift zelf (besluit 167).
- **Een kaart Boiler** (`boiler` bij de kaarten): de boiler, of anders de
  jacuzzi (besluit 186), met hoe warm hij is en of hij op zon opwarmt; om te
  kiezen, alleen als het huis er een heeft.
- **Het kompas** staat niet op Thuis (24 oktober 2026, 0.62.1): het hoort bij
  Zonnepanelen, bij de ligging.
- **Het tuinhuis** (0.62.2) heeft een plat dak met een overstek op twee palen,
  een vlonder en een glazen pui, met de lamp onder het overstek. Heet het een
  schuur, berging of shed, dan is het het houten schuurtje met puntdak
  (`tuinhuisSoort`).
- **Versie 0.62.0.**

*Wat afviel:* de tegel ook op de telefoon (daar staan de kaarten onder elkaar,
op de hele breedte); een tegel voor Favorieten en Hoe voelt het (dan moet je
eerst tikken om iets te doen).

## 190. Inrichten 3.0: acht hoofdstukken, en het huis groeit mee op zijn eiland

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026, voor de makeover naar het grote publiek. Inrichten had zes
hoofdstukken (besluit 144) en tekende het oude perceel; wat het huis nu kan
(huis 3.0, besluit 187; de boiler en de jacuzzi, besluit 186) kwam er niet in
voorbij. De schets is `Wand-Inrichten-3.html` met `Tel-Inrichten-3.html`;
gekozen door de bewoner: het huis groeit mee, deze volgorde, op de telefoon
dezelfde stappen, en erbij afwezig en vakantie, een huis zonder slimme
regeling en klaarzetten in Home Assistant.

*Besluit:*

- **Acht hoofdstukken,** bovenin als een pad met een streepje per stap: Je huis
  (wat voor huis, kamers, per kamer), Buiten, Wie woont hier, Klimaat (wat elk
  apparaat doet, meten met, comfort, afwezig en vakantie), Energie (zekering,
  panelen, hoe ze liggen, op zon, prijzen), Gemak, Je schermen, en Klaar
  (klaarzetten en de film).
- **Links het eiland van Thuis** (`wereld`, zonder eigen lucht, met de kelder
  in de grond en meubels in de kamers). Het groeit mee: eerst de vorm, bij de
  kamers de namen, dan de apparaten, buiten, de temperatuur, de panelen; bij
  Klaarzetten en Klaar is het avond.
- **Wat voor huis** is nieuw: vrijstaand, rijtjeshuis, hoekhuis,
  twee-onder-een-kap of appartement (`woning` in de indeling; weg is
  vrijstaand), elk met een klein huis erin; een kelder (een kamer op de etage
  Kelder) en schuin of plat dak (`dak`). Een appartement tekent het gebouw van
  drie lagen.
- **Buiten** krijgt de jacuzzi en de keus tussen het tuinhuis en het schuurtje
  (`rond.jacuzzi`, `rond.schuur`; een oudere indeling heeft ze niet).
- **Afwezig en vakantie:** voor het hele huis hoe warm het blijft als niemand
  thuis is, en met de vakantiestand; koelen erbij als het huis kan koelen. Per
  kamer anders blijft bij Comfort.
- **Op zon:** elk apparaat dat kan wachten, ook de boiler en de jacuzzi, met
  een schakelaar (dezelfde antwoorden als bij Regeling, besluit 167).
- **Zonder slimme verwarming** laat Klimaat zien wat de app wel doet (licht,
  schermen, op zon, camera's, de assistent); vanzelf als er niets is om te
  verwarmen of koelen, en anders met "Geen slimme regeling".
- **Klaarzetten** toont wat de app in Home Assistant gebruikt, zoals bij Wat je
  huis kan (besluit 179); in Home Assistant opent een tik dat scherm.
- **De wand** in het klein, met de kaarten om aan of uit te zetten, 's nachts
  uit en de taal; dezelfde indeling als op de telefoon.
- **Klaar** zegt wat nog te doen is (niet nagelopen, of wat in Home Assistant
  mist), met Wat je huis kan en de film.
- **Onderaan Terug, Later en Volgende.** Later gaat door zonder te bewaren; de
  stap staat dan bij Nog te doen.
- **De regels uit de schets:** een icoon, een naam met een zin en rechts een
  waarde of schakelaar. Op de telefoon bovenin het hoofdstuk en een streepje per
  stap, het huis klein zonder namen, en de knoppen vast onderaan.
- **De panelen op een ander dak** gaan mee als Inrichten of Regeling de
  aansluiting bewaart; eerst vielen ze dan weg.
- **Het tuinhuis** heeft twee spots onder het overstek die omlaag schijnen,
  elk in de kleur van zijn lamp.
- **Versie 0.63.0.**

*Wat afviel:* comfort per bewoner per dagdeel in Inrichten (dat staat bij
Comfort per bewoner, besluit 147); "licht als je weg bent" en "op tijd terug"
bij afwezig (de app kan dat nog niet); buren naast een rijtjeshuis (besluit
187: geen buren tekenen); de klimaatstap per merk (schets
Wand-Inrichten-Klimaat, nog niet gebouwd).

## 191. Huis 3.0 overal: het eiland is de standaard van de tekening

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026. De tekening van het huis is één stuk code (`kit/huis.js`),
maar elke pagina zei zelf of het het eiland van huis 3.0 wilde. Thuis,
Zonnepanelen, Wat je huis kan en Inrichten deden dat; Kamer, Indeling, de
assistent, het begin, de film, het inlogscherm en het always-on display niet.
Daardoor stond het nieuwe ontwerp niet overal. De bewoner vroeg om één gedeelde
aanroep.

*Besluit:*

- **Het eiland is de standaard** van `huis.teken`, zonder eigen lucht (de pagina
  heeft die al). Een pagina die het oude perceel wil, zegt `wereld: false`; dat
  doen alleen de kleine huisjes bij Wat voor huis. Een nieuw ontwerp van de
  tekening staat zo vanzelf op elke pagina.
- **Eén etage zonder dak** (Kamer, Indeling) staat ook op het eiland; eerst
  sloeg de motor het daar over.
- **Het huis zelf komt uit één plek** (`huismodel.huisDelen`): de etages, de
  kelder, wat voor huis, de voordeur, de buitenunit en wat er buiten is, met de
  panelen op een ander dak. Een pagina zet er alleen overheen wat bij haar
  hoort: de assistent laat buiten weg (naast de bol is het vak smal), het begin
  laat buiten pas zien als alle etages er staan, Zonnepanelen zet de auto weg
  voor het kompas.
- **De kelder ligt standaard in de grond** (`kelderOnder` is weg als keuze die
  je moet maken; `kelderOnder: false` maakt hem weer een etage).
- **Versie 0.63.1.**

*Wat afviel:* een tweede functie naast `huis.teken` (dan kan een pagina nog
steeds de oude aanroepen); de panelen elders bij de assistent en de film (die
halen de aansluiting niet op).

---

## 192. Sluipverbruik: elke nacht gemeten, een eigen scherm onder Opbrengst, en een melding als het opvalt

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026. Het sluipverbruik zat nog niet in de app: besluit 79 koos
al een melding de ochtend erna, besluit 88 hoe de app het zegt, maar de meting
zelf, de geschiedenis en het gemiddelde ontbraken. De nachten van dit huis
lieten zien waarom het telt: tot 14 oktober rond 185 W, sinds 15 oktober elke
nacht 300 à 360 W. Gekozen door de bewoner (schets `Wand-Sluipverbruik.html`
en `Tel-Sluipverbruik.html`): op Opbrengst, een kaart op Thuis, een melding de
ochtend erna, en bij de assistent en Wat je huis kan; een vaste marge van 50 W;
terug tot de eerste nacht van de meter.

*Besluit:*

- **De meting:** per nacht het laagste uurgemiddelde van de slimme meter
  tussen 01:00 en 05:00, uit de uurstatistiek van Home Assistant (alleen
  lezen). Die gaat terug tot de eerste dag van de meter; bij dit huis februari
  2025. Een nacht telt pas na 05:00, en niet met minder dan twee uren of met
  stroom terug naar het net (zoals met een thuisbatterij).
- **Je gewone nacht** is het gemiddelde van de vijf laagste van de laatste 30
  nachten. Een nacht **50 W of meer** daarboven valt op, in oranje.
- **Een eigen scherm onder Opbrengst** (`sluipverbruik.html`), met een kaart op
  Opbrengst ernaartoe; de rest van Opbrengst blijft zoals het was. Links
  vannacht, het gemiddelde van 30 nachten (met dezelfde maand een jaar eerder)
  en wat het een jaar lang is, in kWh en met je stroomprijs in euro's (bij een
  contract met dag en nacht het daltarief voor zijn deel van de uren); bij een
  hoge nacht wat het scheelt als het weer gewoon wordt. In het midden elke nacht
  (30 per keer, terug te bladeren) of elke maand. Rechts wat opviel, de melding
  en hoe de app meet.
- **Geen oorzaak zonder meter** (besluit 88): de app zegt het wat, het wanneer en
  het hoeveel. De bewoner kan zeggen wat het is ("Jij zei: de pc") of dat hij
  het niet weet; dat hoort bij die reeks hoge nachten (`sluipverbruik.json`,
  een eigen smalle deur, besluit 42).
- **De melding:** één melding per reeks hoge nachten bij de bel ("Al 10 nachten
  meer dan gewoon"), en op de telefoon de ochtend erna, na de nachtrust (een
  eigen keus `sluip` bij Jij, standaard aan). Een gewone nacht maakt hem stil
  "weer gewoon".
- **Een kaart Sluipverbruik** voor Thuis (`sluip`): smal een tegel met vannacht
  en staafjes van de laatste nachten, breed 30 nachten.
- **De assistent** weet het ("Wat is mijn sluipverbruik?"), en **Wat je huis
  kan** heeft het bij Kosten.
- **Versie 0.66.0.**

*Wat afviel:* een eigen drempel per bewoner (eerst de vaste 50 W); het
sluipverbruik per uur van de nacht (de uurstatistiek zegt het laagste uur, niet
wanneer iets aanging); een huis met een thuisbatterij (daar zegt het net 's
nachts niet wat het huis gebruikt).

---

## 193. Kamers en indeling als groep, en één lijstje voor wat er rond het huis is

*Onderwerp: weergave · Status: geldig*

Op 24 oktober 2026. Kamers en indeling had zijn eigen opbouw: links de etages
als knoppen, in het midden het huis, rechts een blad en onderin een strook. Op
de telefoon stonden de etages als rij om opzij te schuiven. De andere groepen
achter het tandwiel (besluiten 130 en 163) hebben één opbouw; de bewoner vroeg
dezelfde voor Kamers en indeling. Daarbij meldde hij dat een garage of carport
die hij buiten toevoegde niet leek te werken. Dat klopte: er waren twee
lijstjes die elkaar overschreven. Wat er rond het huis is (besluit 158, bij
Inrichten › Buiten) won zodra het er was, en Kamers en indeling keek er niet
naar.

*Besluit:*

- **Kamers en indeling is een groep zoals Energie** (`groep.js`). De delen zijn
  de etages van boven naar beneden met Buiten, een stippelregel om een etage
  toe te voegen, en onder Apparaten Nog in te delen (oranje als er iets mist)
  en Verborgen. Op de telefoon eerst de lijst; een deel opent als eigen scherm
  met terug naar de lijst. Op de wand staan de lijst en het deel naast elkaar,
  met onderaan *Waarvoor is dit?* en Vorige en Volgende.
- **Een etage** is de tekening zonder dak met het blad ernaast, en eronder de
  strook met wat nog in te delen is. Slepen, ongedaan maken, zones, het blad
  per kamer en Verwarmen en koelen blijven zoals ze waren. Sleep je een
  apparaat boven een etage in de lijst, dan opent die etage.
- **Buiten** is het huis met zijn dak, zoals Thuis het tekent, met hetzelfde
  lijstje als Inrichten › Buiten (`huismodel.rondom`): elk deel aan of uit,
  met de ruimte uit Home Assistant die erbij hoort. Een ruimte die een carport
  is, hoort nu ook ergens bij.
- **Eén lijstje rond het huis.** Kies je bij Kamers en indeling een soort
  (garage, carport, terras), een auto op de oprit of een zone Tuinhuis, of
  maak je buiten een ruimte die zo heet, dan staat dat deel ook aan bij wat er
  rond het huis is (`huismodel.rondMet`). Kamer en Kamers en indeling tekenen
  buiten met dat lijstje, net als Thuis.
- **De garage en de carport staan ook in een tekening zonder dak**, en de
  garage is daar aan te tikken.
- **Het adres blijft werken:** `indeling.html#woonkamer/warmte` opent de etage
  van de kamer met de kamer gekozen; het adres wordt dan die etage.
- **Versie 0.65.0.** Besluit 192 en versie 0.64.0 zijn voor het sluipverbruik.

*Wat afviel:* de etages als knoppen naast de groep; een eigen lijstje rond het
huis bij Kamers en indeling (dan zijn er weer twee); een tweede oprit, terras
of garage tekenen, de buitenzones zoals moestuin of vijver in de tekening, en
een balkon bij één etage: dat komt later.

---

## 194. Een huis zonder slimme regeling: de app draait ook zonder zones

*Onderwerp: kern en regeling · Status: geldig*

Op 25 oktober 2026, voor de makeover naar het grote publiek. De configuratie
eiste minstens één zone en één klimaatapparaat; zonder slimme verwarming of
airco startte de dienst niet, terwijl licht, schermen, energie, op zon,
het sluipverbruik en de assistent daar niets mee te maken hebben. De bewoner
koos eerder (makeover, 23 oktober): **werkt zonder klimaat**, en klimaat staat
bij Wat je huis kan als iets dat erbij kan. Dit is de basis; een huis zonder
slimme meter of zonder panelen volgt na zijn schets.

*Besluit:*

- **Zones en klimaatapparaten zijn niet meer verplicht.** Zonder `zones` en
  `actuators` (of met lege lijsten) is de configuratie geldig; de regeling
  draait en heeft dan niets te regelen. Een zone die naar een apparaat wijst dat
  er niet is, blijft een fout.
- **Het begin** zegt het niet meer als blokkade: zonder gebied met een
  klimaatapparaat en een thermometer doet de app licht, schermen, energie en op
  zon, en kan comfort per kamer later erbij.
- **Wat de app zegt:** op Thuis "Geen zon, en er hoeft niets te draaien" in
  plaats van "geen kamer heeft iets nodig"; de assistent zegt "Het is rustig: er
  draait niets."
- **Comfort** toont dan alleen "Comfort per kamer kan erbij", met wat het
  oplevert. **Wat je huis kan** zet Op temperatuur, Verwarmen per kamer, Afwezig
  en vakantie en Op tijd warm of koel op "Airco of thermostaat nodig" (eerst
  stonden de laatste drie op "kijkt mee" of "leert nog").
- **Versie 0.67.0.**

*Wat afviel:* de klimaatstap van Inrichten aanpassen aan een huis met wel
apparaten in Home Assistant maar zonder zones (dat komt met de klimaatstap per
merk); een eigen keus "geen slimme regeling" bewaren (een huis zonder zones is
dat al).

---

## 195. Wat beweegt in een eigen laag: het huis weer licht genoeg voor een tablet aan de wand

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026. Op de Galaxy Tab A7 Lite aan de wand (Fully Kiosk) werd
Thuis erg traag: bij Aanpassen schoof de kolom niet mee en reageerde niets meer
tot een herstart. De bewoner dacht aan de regen en vroeg eerst na te gaan waar
het aan lag, voordat er een lichte stand kwam. Gemeten in Edge op het formaat van
de tablet: de processor was het niet (ook tien keer vertraagd 1 tot 6% bezig,
een tik wachtte 2 tot 20 ms, opnieuw tekenen 150 tot 200 ms), en het geheugen
liep niet op (150 keer opnieuw tekenen: evenveel knopen en luisteraars). Wel het
schilderen: 60 keer per seconde de hele tekening, 316 ms schilderwerk per seconde
op een pc. De oorzaak waren de bewegende stroomlijnen: elke beweging in de
tekening laat de browser alles eronder opnieuw schilderen, en sinds huis 3.0
(besluit 187) is dat het eiland, de bomen, de verlopen en een vervaagde gloed om
die lijnen. De regen, het glas achter de kaarten en het masker van de kolom
maakten bijna geen verschil.

*Besluit:*

- **Wat beweegt, staat in een eigen laag.** `huis.teken` zet de stroom, een
  draaiende ventilator, damp, regen, sneeuw en vuurvliegjes (en wat met SMIL
  beweegt) in een tweede, doorzichtige tekening boven het huis, met de groepen
  eromheen. Het huis eronder staat stil en wordt één keer geschilderd. Gemeten:
  van 316 naar 15 ms per seconde, met regen van 307 naar 12. Het geldt op elke
  pagina met het huis.
- **De gloed om de stroom staat stil**; alleen de stipjes erop bewegen.
- **Geen lichte stand.** Met de oorzaak weg is die niet nodig; Minder beweging
  bij Weergave blijft er voor wie geen beweging wil.
- **De verdiepingen niet meer op het gras** (kamerweergave): bij een verdieping
  hoger zakt het eiland één etage, staat de etage eronder er vaag onder en loopt
  naar het gras weg, en staat erboven de omtrek van de volgende etage of het dak.
  De begane grond blijft op het gras, de kelder zoals hij was.
- **Kleiner:** in de grafiek Vandaag staat elk apparaat op een eigen regel met
  de baan eronder (een blokje vroeg op de dag liep door de naam); op de wand
  staan bij Aanpassen de knoppen van een smalle kaart in de kaart (ze vielen half
  weg), en een kaart die opnieuw gevuld wordt, houdt zijn knoppen.
- **Versie 0.67.1.** In 0.67.2 opgelost: het vak van de tekening gaat de laag
  dragen (`position: relative`), en daarmee telde op de telefoon een `top: 96px`
  uit de regel voor de wand mee; het huis zakte onder de stroombalk. Zo'n vak
  krijgt nu ook `inset: auto`.

*Wat afviel:* een lichte stand die zware delen uitzet (de oorzaak bleek één
ding, en dat is nu weg); de stroom stilzetten op een oudere tablet.

---

## 196. Een huis zonder slimme meter of zonder panelen

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026, voor de makeover naar het grote publiek, na besluit 194 (een
huis zonder slimme regeling). Zonder slimme meter (P1) gaf de app "0 kW van het
net" en telde Opbrengst alle opgewekte stroom als zelf gebruikt; zonder panelen
stond er een zongrafiek zonder zon en heette de tab Opbrengst. Gekozen door de
bewoner (schets `Wand-Huis-Zonder.html`, "1 en 2 pakken we weer op").

*Besluit:*

- **Wat het huis heeft**, staat in `api/site`: `meter` (een netmeter in de
  configuratie) en `zonMeter` (de opbrengst van de panelen). Elke pagina leest
  het één keer en onthoudt het, zodat de navigatie het meteen goed zegt.
- **Zonder panelen** heet de tab **Verbruik**, met de kop "Je gebruikte …
  kWh stroom" en een kaart "Panelen erbij?" naar Wat je huis kan. De kaart
  Vandaag op Thuis zegt wat het huis vandaag gebruikte en kostte, met de
  **daluren van vandaag** eronder (`api/goedkoop`, uit het contract; op de dag
  van de klokwissel 23 of 25 uur). Bij Wat je huis kan staan op zon en
  apparaten op zon op "Zonnepanelen nodig".
- **Zonder slimme meter** schat de app: per uur gaat de zon eerst naar de
  apparaten met een eigen meter en wat een gewoon huis overdag gebruikt
  (`BASIS_ZONDER_METER_W`, 400 W), de rest naar het net. Liever te zuinig dan
  te mooi: bij het huis van de bewoner schatte dit oktober 47% zelf gebruikt,
  met de meter was het 63%; over het contractjaar 53% tegen 55%. Een jaar
  rekent dan per uur, niet per dag.
  - **Thuis:** bij de panelen "± 0,6 kW over, geschat", geen label en geen
    lijn van het net, op de telefoon zon en "over, geschat". Geen deel "zelf
    gebruikt" bij Vandaag. De kaart Sluipverbruik zegt dat het erbij kan met
    een slimme meter en wijst naar de meters.
  - **Opbrengst:** "Je panelen leverden … kWh"; opgewekt (gemeten), zelf
    gebruikt en bespaard met "±" en een label geschat; het schema "Waar je
    zonnestroom heen ging" alleen met de zon, naar het net "(geschat)", met hoe
    het geschat is; een kaart "Precies weten?" naar de meters.
  - **Wat je huis kan:** op zon, apparaten op zon en het sluipverbruik op
    "Slimme meter nodig"; Opbrengst werkt, met zelf gebruikt geschat. Instellingen
    vraagt niet meer om een meter van het net als het huis er geen heeft.
- **De regeling zelf** verandert niet: zonder netmeter viel op zon al weg
  (degraderen in de configuratie); de schatting is alleen om te tonen.
- **Versie 0.68.0.**

*Wat afviel:* "Wat Smart Climate scheelde" op Verbruik (in de schaduw valt er
niets te schelen, stap B); een eigen kaart Goedkope uren (de kaart Vandaag doet
het, zonder een nieuwe keuze); dynamische tarieven (de app kent alleen
dag en nacht); op zon sturen op de schatting.

---

## 197. Wat elk apparaat kan: de klimaatstap per merk in Inrichten

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 25 oktober 2026, na besluit 196. De schets `Wand-Inrichten-Klimaat.html`
lag er sinds 23 oktober, met de keuzes van de bewoner: lijst links en details
rechts (op de telefoon één lijst die openklapt); met een open vraag mag je door,
en die staat bij Nog te doen; wat Home Assistant zegt plus een vaste tip per
koppeling, in beide talen; een bereik dat niet kan kloppen wordt een voorstel
dat de bewoner aanpast. Gelezen uit dit huis: de LG's staan er twee keer in
(LG ThinQ 7° tot 35°, SmartThinQ 16° tot 30°) en zeggen niet wat ze doen; de
Tuya in de badkamer geeft 0° tot 80° en "heat_cool" op; de radiatorknop en de
Nest zeggen wel wat ze doen.

*Besluit:*

- **Een nieuwe stap in Klimaat**, na Verwarmen en koelen (zo heet de stap
  ervoor nu): **Wat elk apparaat kan**.
- **De dienst geeft per klimaatapparaat `ha`**: de koppeling (het platform),
  het bereik, de standen, of het `hvac_action` geeft, en een tweede koppeling
  van hetzelfde apparaat.
- **Per apparaat punten**, elk werkt (✓), werkt met een omweg (halve stip, de
  zin zegt welke), een vraag (?), of kan niet (–):
  - wat het kan, met het bereik en of het droogt;
  - of het zegt wat het doet, of hoe Smart Climate het anders ziet (de
    stroommeter, of de temperatuur, een paar minuten later); infrarood zegt
    niets terug;
  - de stroommeter, of waarom die niet nodig is (de cv);
  - het filter, de batterij, en of het de kamer meet (een radiatorknop vlak bij
    de radiator);
  - "Zegt dat hij ook koelt" bij een thermostaat met alleen "heat_cool".
- **Een bereik onder 4° of boven 35°** kan niet kloppen: Smart Climate stelt 10°
  tot 25° voor (16° tot 30° bij een airco), de bewoner kiest anders. Volgende
  bewaart het voorstel. Het bereik staat in de indeling (`apparaten[].bereik`)
  en geldt in de regeling (`setpointRange`, de stand-by erbinnen).
- **De vraag "Wat verwarmt hij?"** bij een thermostaat zonder stroommeter die
  niet de ketel aanzet: de cv-ketel, elektrisch of weet ik niet
  (`apparaten[].warmte`). Open staat hij bij Nog te doen.
- **Een tip per koppeling**: LG (de cloud, een paar seconden), Nest (zijn eigen
  schema), Tuya (de cloud), infrarood, en een radiatorknop (stookt alleen als
  de ketel brandt); en wie er twee keer in staat, zegt via welke het stuurt.
- **De rol** (op temperatuur, op zon, kijkt mee) staat er ook, dezelfde als bij
  Verwarmen en koelen.
- **De thermostaat van de ketel**: in het voorstel gaat een thermostaat van een
  ketelkoppeling (Nest, tado, Netatmo, Honeywell en zo) voor; eerst was het de
  eerste in het huis, hier de badkamer.
- **Versie 0.69.0.**

*Wat afviel:* zelf kiezen via welke van twee koppelingen gestuurd wordt (dat
volgt de configuratie); een wattage per airco zonder meter kiezen (eerst 0,8 kW
zoals de regeling rekent); meer merken met een eigen tip (wat Home Assistant
zegt, staat er al).

---

## 198. Wat de wand zegt, de zon op zijn plek, de deurbel meteen, en feestdagen in het huis

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026, na een dag met de tablet aan de wand. De bewoner zag:
- "De woonkamer wordt verwarmd" terwijl het oude systeem niets deed;
- "Het huis wacht op zon" terwijl de zon die dag niet meer kwam;
- een tuinhuis dat niet aan te tikken was;
- een zon die precies andersom liep;
- een droger met "Start op zon" die hij zelf had gestart;
- een deurbel die bij aanbellen niet liet zien wie er stond.

En hij vroeg om het seizoen en het weer in het huis aan of uit te zetten, en om
feestdagen.

*Besluit:*

- **Verwarmt alleen als hij stookt.** Een kamer "wordt verwarmd" (besluit 188)
  als het echte apparaat in die stand staat én, als het dat zegt
  (`hvac_action`), ook echt stookt of koelt. Een Nest op "verwarmen naar 20°"
  die stil staat: dan "zou verwarmen". De dienst bewaart wat een apparaat zegt
  dat het doet apart (`observedAction`); het logboek blijft zoals het was.
- **Wacht op zon, met de zon erbij.** De dienst rekent uit de ligging waar de
  zon staat: op, nog niet op, of vandaag niet meer genoeg ('s middags lager dan
  10°). Dan "Nog geen zon" of "Vandaag geen zon meer", en per kamer "Op zon
  zodra hij op is" of "Morgen weer op zon". De zin zegt koelen of verwarmen
  naar wat de kamer wil; eerst stond er altijd koelen.
- **Tuin en tuinhuis aan te tikken**: het vak van de tuin is zo groot als het
  gras op het eiland, dat van het tuinhuis ligt op het huisje zelf (eerst op
  een vaste plek ernaast).
- **De zon aan de kant van het oosten.** In de tekening ligt rechts de richting
  van het kompas min 90°; daar komt de zon op als daar het oosten ligt
  (`zon.opRechts`, anders het kompas). De schaduw valt van de zon af; eerst viel
  hij naar de zon toe.
- **De droger**: draait hij, dan "Zelf gestart" in plaats van "Start op zon";
  Smart Climate start nog niets zelf.
- **De deurbel meteen live**: het vloeiende beeld start tegelijk met het
  plaatje, met voorrang (aanbellen telt niet mee in de grens van vier live
  beelden), opnieuw als het wegvalt of het scherm net aangaat; tot dan na
  anderhalve tel elke seconde een vers plaatje (eerst na vijf).
- **Bij Weergave, onder "In het huis"**: Seizoenen, Het weer en Feestdagen,
  standaard aan, per account. Uit is een gewone groene dag zonder regen.
- **Feestdagen**, stil getekend, alleen bij het hele huis: een pompoen bij de
  deur met Halloween (24 oktober tot 1 november, 's avonds met een kaarsje),
  lichtjes langs de gevel met Kerst (6 december tot 6 januari), vuurwerk met
  Oud en Nieuw (31 december vanaf 18:00), eieren in het gras met Pasen (Goede
  Vrijdag tot tweede paasdag).
- **Versie 0.70.0.**

*Wat afviel:*
- Rekenen met de verwachting voor de rest van de dag (een bewolkte middag). Eerst
  de stand van de zon zelf.
- Feestdagen per land, zoals Koningsdag. Eerst wat overal gevierd wordt.
- Bewegende lichtjes; die kosten een oude tablet schilderwerk (besluit 195).

---

## 199. De wand neemt alle persoonlijke instellingen over van wie hij volgt

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026, na 0.70.0. Twee dingen die de bewoner zag:
- **De drie nieuwe schakelaars** (seizoenen, weer, feestdagen) stonden bij Jij los
  in de lijst. Ze horen bij Weergave, onder een kopje Huis.
- **De wand volgt van wie hij is** (besluit 181) al wel voor de kaarten, de
  favorieten en de kleur. Voor de weergave, het thema en de taal nam hij die
  van zijn eigen schermaccount. Hij moet alles overnemen van wie hij op dat
  moment volgt.

*Besluit:*

- **Bij Jij** staan seizoenen, weer en feestdagen niet meer los; ze staan bij
  Weergave, onder **Huis**, met eenvoudig of uitgebreid, grotere letters en
  minder beweging.
- **De wand neemt alles over** van wie hij volgt: de dienst geeft bij `wand`
  ook `persoon` (de weergave, het thema en de taal van diens account), en een
  scherm aan de wand gebruikt die, naast de kaarten, de favorieten en de kleur.
  Wisselt wiens comfort geldt, dan wisselt de wand mee (binnen een minuut).
- **Weergave op de wand** laat zien wat geldt, met "De wand volgt de weergave
  van Noor": veranderen gaat bij Jij op de telefoon van die bewoner.
- **Versie 0.71.0.**

*Wat afviel:* de weergave op de wand zelf veranderen voor iemand anders (dat is
diens keuze, op diens telefoon); grotere letters op de wand (die schuift nooit,
besluit 164).

---

## 200. De film als trailer, en een groot welkom bij Inrichten

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026, met de schetsen Wand-Film-3 en Wand- en
Tel-Inrichten-Welkom. De bewoner koos voor de film een trailer met wow. Wat
stoorde: het huis stond stil (klein rechts, steeds op dezelfde plek) en het
einde was saai. Eerder gevraagd (16 en 23 oktober): een mooie intro en
afsluiting, niet te snel, muziek die opbouwt, en stukken uit de app zoals de
etages, de apparaten en de assistent die praat. Voor wie nieuw is, koos hij een
groot welkom bij Inrichten; de film komt na Inrichten, zoals nu.

*Besluit:*

- **De film is een trailer** van acht shots op de maat (112 per minuut, twee
  maten per shot, het slot vier), zo'n veertig seconden. Een camera beweegt
  over het getekende huis, over het hele scherm:
  1. de opkomst, van nacht naar ochtend;
  2. je huis, met het aantal kamers en apparaten;
  3. een etage op hoogte, de andere vaag eromheen, zoals Kamer;
  4. je dak, met wat de panelen gisteren gaven;
  5. de apparaten, als kaarten uit de app naast de zolder, met wat ze nu doen;
  6. de assistent die praat: een vraag aan "Hé huis", en het antwoord loopt
     woord voor woord mee (de temperatuur van een kamer, en de zon van morgen);
  7. de drop, met wat deze maand van je eigen dak kwam;
  8. het slot: het logo, "Je huis kijkt mee", en Naar je huis of Nog een keer.
- **Alleen echte cijfers**: een shot zonder zijn cijfer valt weg. De muziek
  blijft dezelfde en volgt de shots: de drop valt op het getal van de maand.
- **Minder beweging** (bij de browser of bij Weergave): dezelfde shots, zonder
  vliegen en zonder meelopende woorden.
- **Groot welkom**: het eerste wat Inrichten laat zien, over het hele scherm
  en nog zonder de stappen. Links "Welkom thuis", drie beloftes, Begin en "Ik
  heb een back-up" (naar Toegang). Rechts bouwt het huis zich op uit wat Home
  Assistant al weet, etage na etage, dan buiten en de panelen. Op de wand hangt
  wat er gevonden is als labels aan het huis; op de telefoon staat het als een
  rij getallen onder het huis. Een tik geeft de lijst, zoals eerst.
- **Versie 0.72.0.**

*Wat afviel:*
- Een echte video: die moet geladen worden en kent je huis niet.
- Wat de assistent echt zou antwoorden: in de film staat alleen wat vaststaat.
- De film meteen na het welkom: eerst inrichten, dan de film als beloning.

---

## 201. De kaart Camera's: zoveel camera's als je wilt, met wat ze zien

*Onderwerp: weergave · Status: geldig*

Op 25 oktober 2026, met de schets Wand-Cameras. De bewoner wilde de kaart
Deurbel uitgebreider: een kaart Camera's waarop je zoveel camera's kiest als je
wilt, geschikt naar de maat van de kaart, en een tik maakt het beeld groter.
De deurbel zegt nog steeds wanneer er het laatst werd aangebeld; een camera
wanneer hij het laatst beweging zag, of dat er nu iets beweegt. Zijn camera's
herkennen ook personen, voertuigen en dieren: dat moest erin.

*Besluit:*

- **De kaart Deurbel wordt de kaart Camera's.** In de code blijft hij
  `deurbel` heten, zodat ieders indeling blijft staan.
- **Zoveel als je wilt**: bij Kies op de kaart zet je camera's aan of uit; wat
  je erbij zet komt achteraan. De keuze hoort bij je indeling, voor telefoon en
  wand samen (zoals de favorieten); zonder keuze staan ze er allemaal, de
  deurbel voorop.
- **Geschikt naar de maat**: breed één beeld groot, twee naast elkaar, drie met
  de eerste breed, vier en meer twee aan twee. Smal één beeld; de andere
  wisselen elke zes tellen, met een stipje per camera.
- **Wat beweegt, gaat voor**: dat beeld komt vooraan met een gloeiende rand en
  "Persoon, nu", en zijn plaatje ververst elke tien tellen (anders elke
  minuut). Bovenaan de kaart staat dan bijvoorbeeld "Persoon bij Camera oprit".
- **Per beeld een regel**: bij de deurbel wanneer er werd aangebeld; bij een
  camera wat hij nu ziet, of wanneer het laatst ("Beweging om 17:16", "Persoon,
  zondag 25 oktober"); zonder melders alleen de naam.
- **De melders zoekt de dienst zelf**: bewegingsmelders op hetzelfde apparaat
  als de camera, en uit hun sleutel of naam wat ze herkennen: een persoon, een
  voertuig of een dier. Een persoon gaat voor een dier, voor een voertuig, voor
  gewone beweging. Wanneer het laatst komt uit de historie van Home Assistant
  (`history/history_during_period`, lezen; de laatste twee dagen) en daarna
  uit wat de dienst ziet (`api/cameras`).
- **Een tik maakt het groot**: live, met de andere camera's eronder om te
  wisselen; na twee minuten dicht. Alleen de deurbel heeft voorrang in de grens
  van vier live beelden.
- **Versie 0.73.0.**

*Wat afviel:* beweging live op de kaart zelf (kost een oude tablet te veel); de
melder per camera zelf kiezen (de dienst vindt hem op het apparaat); een
melding op de telefoon bij een persoon (kan later bij Meldingen).


*Aanvulling (25 oktober 2026, versie 0.73.1):* de bel meldde een nieuw apparaat,
maar niet als er een verdween. Nu onthoudt hij welke apparaten het huis kent;
is er een tien minuten weg uit Home Assistant, dan staat er "Weg uit Home
Assistant: …", met de kamer waar het stond. Wat je zelf verbergt bij Indeling
telt niet, en is meer dan de helft tegelijk weg, dan is het huis even niet te
lezen en telt het ook niet. Komt het apparaat terug, dan gaat de melding stil
weg; na dertig dagen vergeet de bel het. Alleen bij de bel, niet op de
telefoon.

---

## 202. Klaarzetten voor iedereen: de assistent met één knop, volledig scherm, een eigen account voor de wand

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 25 oktober 2026, met de schets Wand-Inrichten-Klaarzetten. De bewoner vond
de app functioneel af, maar zag waar mensen afhaken: het klaarzetten in Home
Assistant. De integratie vroeg na het neerzetten nog om Home Assistant te
herstarten en bij "Nieuw apparaat gevonden" op Toevoegen te tikken; de app
voelde in de app van Home Assistant niet als een eigen app; en nergens stond
dat een tablet aan de muur het beste een eigen account krijgt.

*Besluit:*

- **De assistent gaat aan bij Klaar, terwijl de film speelt.** De add-on zet
  de integratie neer (besluit 184), herstart Home Assistant als hij die versie
  nog niet geladen heeft, en voegt de integratie zelf toe met het adres en de
  sleutel van de add-on. Bij Inrichten is daar geen eigen knop voor: het
  begint als je bij Klaar op Speel af tikt, zodra de film zijn cijfers heeft
  (daarna speelt hij zonder verbinding). Na de film wacht de rondleiding met
  de drie stappen in beeld tot Home Assistant terug is; Overslaan doet
  hetzelfde zonder film. Klaarzetten zegt alleen dat het bij Klaar gebeurt.
  Bij Instellingen › Toegang staat de knop "Zet de assistent aan". Lukt het
  niet, dan staat er waarom, met Probeer opnieuw.
- **Dit verruimt de schrijfgrens, maar smal.** Naast licht, scènes en
  schermen mag de add-on nu twee dingen: Home Assistant herstarten
  (`homeassistant/restart`) en de eigen integratie toevoegen
  (`config/config_entries/flow`, alleen `smart_climate`). Allebei alleen na
  een tik van de beheerder (Speel af of Overslaan bij Klaar, of de knop bij
  Toegang), alleen in de add-on (via de Supervisor), en niet via HaClient. Geen
  andere integraties, geen add-ons installeren.
- **De stand blijft in de dienst** (`api/integratie` geeft `aanzetten` mee),
  zodat een pagina die tijdens het herstarten opnieuw laadt, ziet waar het is.
- **Volledig scherm staat standaard aan** in de app van Home Assistant; uit
  is een keuze per apparaat bij Functies › Dit scherm. De rondleiding heeft
  daar een extra stop die de knop terug naar Home Assistant aanwijst (in de
  zijbalk boven de bel, op de telefoon naast het tandwiel). De knop wordt
  opnieuw gezet als de navigatie opnieuw getekend wordt.
- **Een eigen stap "Een eigen account voor de wand"** in Inrichten, vóór Hoe
  ziet de wand eruit: waarom (de wand is een scherm, geen bewoner; geen
  beheerder; uitloggen op je telefoon raakt de wand niet), de drie stappen en
  een knop naar Personen. Is er al een scherm, dan staat er wie. Zonder inlog
  (lokaal) alleen een korte zin.
- **Versie 0.74.0.**

*Wat afviel:* de add-on zelf add-ons laten installeren voor de stem (dan wordt
hij manager en zakt zijn veiligheidsscore; voor "helemaal in huis" opent een
knop de pagina van de add-on, dat komt in 0.75.0); herstarten zonder te vragen;
een eigen app in de Play Store (later, als de rest staat).

*Aanvulling (28 oktober 2026, versie 0.75.0):* de app los op je startscherm
(via de eigen poort in Tailscale, besluit 160) blijft te moeilijk voor de
meeste mensen. Functies › Op je startscherm staat daarom onder een nieuw
kopje **Gevorderd**; de gewone weg is de app van Home Assistant, met volledig
scherm. Dat een add-on de startpagina van die app wordt, kan in Home
Assistant niet; de app kan wel de laatst geopende pagina onthouden.

---

## 203. De stem: van het apparaat zelf, of helemaal in huis

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 25 oktober 2026, met de schets Wand-Inrichten-Klaarzetten (#stem); gebouwd
op 28 oktober. De bewoner zag dat de stem met Piper, Whisper en het wekwoord
niet voor iedereen weggelegd is: drie add-ons installeren, ze koppelen en een
spraakassistent maken. Zijn keuze: standaard de stem van het apparaat zelf,
zonder installatie (B), en voor gevorderden helemaal in huis met één knop (A).
De add-ons installeert de bewoner zelf (de add-on wordt geen manager), en
verstaan via de browser staat aan, met eerlijke uitleg.

*Besluit:*

- **Waar de stem vandaan komt** is een keuze bij Functies › Praten en in een
  nieuwe stap van Inrichten, "Hoe praat je huis?" (hoofdstuk Klaar, na
  Klaarzetten): **Met dit apparaat** of **Helemaal in huis**. Wat bij een keuze
  hoort, staat alleen onder de gekozen kaart; zo past het op de wand.
- **Met dit apparaat**: de telefoon of tablet leest voor met zijn eigen stem
  (alleen een stem die op het apparaat zelf draait), en zonder die stem Piper
  als die er is. Verstaan gaat via de browser zelf (Chrome, Safari), als dat aan
  staat; de tekst zegt dat Chrome het daarvoor naar Google stuurt en Safari naar
  Apple. Kan de browser het niet (de app van Home Assistant, Fully Kiosk), of
  staat het uit, dan verstaat Home Assistant het, als Whisper erin staat.
- **Helemaal in huis**: Piper leest voor, Whisper verstaat, en "Hé huis" op de
  wand gaat via openWakeWord, zoals het was (besluit 150). Alleen bij deze keuze
  staan de spraakassistent en "dit scherm luistert" bij Functies › Praten.
- **De drie add-ons op een rij** (alleen in de add-on, voor de beheerder):
  per add-on Staat erin, Gevonden (Home Assistant zag hem, nog niet bevestigd)
  of Installeer, dat zijn pagina in Home Assistant opent. Staan Whisper en
  Piper erin of zijn ze gevonden, dan maakt **Maak de spraakassistent** de
  rest: wat Home Assistant van de drie vond bevestigen, een spraakassistent
  "Smart Climate" maken in de taal van de app (met "Hé huis" als dat wekwoord
  er al is), en die kiezen met de stem helemaal in huis.
- **De schrijfgrens wordt weer iets ruimer, en blijft smal.** Na die tik van
  de beheerder mag de add-on via de Supervisor (niet via HaClient) twee dingen:
  een gevonden Wyoming-add-on bevestigen (`config/config_entries/flow`, alleen
  stromen van `wyoming`) en één spraakassistent maken
  (`assist_pipeline/pipeline/create`). Een bestaande "Smart Climate" blijft
  zoals hij is; Home Assistant zijn eigen voorkeur verandert niet. Lezen komt
  erbij: `config_entries/flow/progress` en `wake_word/info`.
- **De standaard**: wie de stem nog niet koos, krijgt helemaal in huis als Home
  Assistant al een spraakassistent heeft die verstaat (wie Whisper al had,
  houdt het); anders het apparaat.
- **Versie 0.75.0.**

*Wat afviel:* de add-ons zelf installeren (dan wordt de add-on manager en zakt
zijn veiligheidsscore); verstaan via de browser standaard uit (dan werkt praten
niet meteen); een stem die online praat voor het voorlezen; "Hé huis" in de
browser zelf (eerst meten of de Tab A7 het aankan).

---

## 204. De standaard voor een nieuw huis, en terug naar standaard

*Onderwerp: configuratie en onboarding · Status: geldig*

Op 28 oktober 2026. De bewoner wilde dat een nieuwe gebruiker niet zijn
instellingen voorgeschoteld krijgt, en dat je op een paar plekken terug kunt
naar de standaard. Nagelopen: het bestand van zijn huis (meter, Nest, zekering,
panelen) zit niet in de add-on; een nieuwe installatie begint leeg en leest wat
Home Assistant heeft. Wel stonden de standaarden op meer plekken, en net
verschillend: een nieuwe kamer kreeg voorverwarmen 19°, de basisregels 20°;
Inrichten liet de dag om 7:00 beginnen, de basisregels om 8:00.

*Besluit:*

- **Eén standaard, zuinig** (`backend/src/config/standaard.ts`): verwarmen tot
  20° overdag, 16° 's nachts, voorverwarmen 19°, weg 15°, vakantie 12°; koelen
  vanaf 25°, standaard alleen overdag (weg 27°, vakantie 28° als je het
  aanzet); "nooit warmer dan" twee graden boven koelen. De dag van 7:00 tot
  22:00, voorverwarmen vanaf 6:00. De basisregels, een kamer die er via de app
  bij komt, Inrichten en Comfort lezen hem allemaal hier; `api/comfort` geeft
  hem mee.
- **Binnen wat de apparaten kunnen.** Comfort geeft per kamer mee van welke
  tot welke stand de apparaten kunnen (`haalbaar`). Terug naar standaard en
  Inrichten blijven daarbinnen: een thermostaat die bij 16° begint, krijgt 16°
  voor weg. Eerst weigerde de dienst dan het hele comfort.
- **Terug naar standaard** op vier plekken:
  - bij een kamer in Comfort, klein in de kopregel, als hij afwijkt;
  - Comfort › Terug naar standaard: alle kamers en (bij de hoofdgebruiker) de
    dagdelen, pas na "zeker?";
  - bij elk onderdeel van Functies dat een voorstel heeft (camera's, deurbel,
    licht, weer, meldingen, praten), rechtsboven, als het afwijkt;
  - bij Jij: het uiterlijk (thema, de kleur van je plek, de weergave) en de
    kaarten op Thuis. Je favorieten blijven staan.
- **Wat op het eerste huis is afgesteld, blijft**, met uitleg in de code: op
  zon een graad verder, hulp bij opwarmen na vijf minuten en een halve graad,
  400 W zonder meter. Redelijk voor een gemiddeld huis.
- **Een huis met eigen waarden merkt niets**: dit vult alleen aan wat er nog
  niet is. Het huis van de bewoner heeft zijn tijden en temperaturen in zijn
  eigen bestand.
- **Versie 0.76.0.**

*Wat afviel:* de gangbare set (20/17/20/16/12, koelen vanaf 24°); de dag om
8:00; de waarden van het eerste huis voorzichtiger maken.

---

## 205. Het dak volgt het huis, en de ring van de zon

*Onderwerp: weergave · Status: geldig*

Op 28 oktober 2026. Bij het huis van de bewoner ligt de nok langs de straat:
de voorgevel kijkt naar het oosten (93°), en de zon valt 's ochtends op de
voorgevel en het dakvlak aan de voorkant. De tekening had het poppenhuis met
de nok van voor naar achter, dus de panelen lagen opzij en het kompas draaide
met een dakvlak in plaats van met het huis. Ook was het dak steiler dan het
gemeten dak (51°), en stond de zon als een stip op een boog.

*Besluit:*

- **Het dak zoals het huis ligt.** `api/huis` geeft `ligging` mee: waar de
  voorgevel kijkt, hoe de nok loopt en hoe steil het dak is. De nok loopt
  langs de straat, tenzij elk schuin vlak opzij kijkt; dan haaks. Langs de
  straat tekent het huis een glazen dakvlak aan de voorkant met de panelen
  erop, en de zolder erachter met een schuine achterwand; haaks blijft het
  poppenhuis. De helling is het gemiddelde van de schuine vlakken.
- **Zelf kiezen** bij Zonnepanelen › Zelf aanpassen: "De nok", langs of haaks
  op de straat. Haaks draait de vlakken een kwart, zodat de opbrengst klopt
  met de tekening.
- **Het kompas draait met de voorgevel**, op elke pagina met het huis.
- **De echte zon.** `api/zon` geeft de baan van vandaag mee, elke tien
  minuten van net voor opkomst tot net na ondergang. Bij Zonnepanelen staat de
  zon op zijn echte plek, met een ring rond het huis: een stip per uur en de
  tijd van opkomst en ondergang bij de uiteinden. De straal valt op het dakvlak
  dat de zon het best raakt; bij een dak opzij loopt de ring er niet doorheen.
  De schaduw valt aan de andere kant.
- **Niet op Thuis en niet op de telefoon.** Op Thuis liep de ring door de kop,
  de stromen en de labels; daar staat de zon zoals eerst op zijn boog, maar nu
  aan de goede kant. Op de telefoon is het te krap.
- **Uit te zetten** bij Jij › Weergave: "De baan van de zon". Uit staat
  alleen de zon zelf.
- **Versie 0.77.0.**

*Wat afviel:* een platte ring onder het huis (raakte de tekst en de labels);
de ring ook op Thuis; het dak altijd op de gemeten helling zonder grens (een
plat dak tekent toch schuin, met de panelen erop zoals eerst).

---

## 206. Buiten op Thuis: de tuin in zones, een blad per deel, en alles buiten uit

*Onderwerp: weergave · Status: geldig*

Op 28 oktober 2026, uit de schets Wand-Huis-Ligging. De bewoner heeft in de
achtertuin een border met gekleurde spots, en een tuinhuis met licht binnen en
gekleurde spots onder het overstek. Op Thuis kon je alleen het tuinhuis
aantikken; de oprit en de garage openden de kamer, en je ging weg van Thuis.

*Besluit:*

- **De tuin in zones, elk op een vaste plek**: het terras tegen het huis, het
  gazon in het midden, de border langs de rand, het tuinhuis achterin. Het
  overstek van het tuinhuis is een eigen soort zone. Een lamp in de border
  staat in de border, in de kleur van zijn lamp; het terras en het overstek
  lichten op als hun lampen branden. Elke zone is aan te tikken.
- **Een blad per deel, en je blijft op Thuis.** Een tik op de oprit, de garage,
  de tuin of een zone opent een blad naast het huis (op de telefoon onderin), en
  dat deel licht op in de tekening. Erin: de lampen met een schakelaar, alle
  lampen aan of uit, en wat er nog meer is: de auto aan de lader, een camera,
  de garagedeur, en de andere zones.
- **De garagedeur alleen bekijken.** `api/huis` geeft `toegang`: garagedeuren,
  poorten en deuren met open of dicht. De app opent of sluit ze nooit (besluit
  148).
- **Alles buiten**: een knop Buiten in de kopregel van de wand, met hoeveel
  lampen er branden. Per deel aan of uit, voor het huis en in de tuin, en
  "Alles buiten uit" in één keer. `api/licht` kent daarvoor `zone`
  (`kamer::zone`) en `buiten`; buiten gaat alleen uit. Alleen lampen, binnen de
  schrijfgrens van besluit 97.
- **Erbij in deze versie**: de helling van het dak kun je precies invullen bij
  Zonnepanelen › Zelf aanpassen (de bewoner mat 44°); de helderheid van het
  always-on display is een schuif van 0 tot 100, standaard 75 overdag en 25 in
  de avondstand.
- **De baan van de zon (besluit 205) doet overal iets**: uit haalt ook de
  stippelboog op Thuis weg, op de wand en op de telefoon. De bewoner zette hem
  uit op zijn telefoon en zag niets veranderen, want de ring staat alleen bij
  Zonnepanelen op de wand.
- **Versie 0.78.0.**

*Nagekomen, versie 0.78.1* (dezelfde avond, na proberen op het eigen huis):

- **De schakelaar slaat meteen om**, en het huis kleurt meteen mee. Eerst
  wachtte hij tot Home Assistant de lamp aan meldde; een groep Hue-lampen doet
  er een paar tellen over.
- **Licht buiten is te zien.** Een lamp van de border kleurt zijn stuk border
  over de hele lengte; één lamp in Home Assistant is vaak een groep
  wandlampen. Het licht van binnen valt uit het tuinhuis over de vlonder en het
  gras, en de spots onder het overstek geven een plas in hun kleur. Eerst was
  het een stip, en zag de bewoner niets gebeuren.
- **Een lamp in een zone** zet je bij Kamers en indeling: tik op de lamp en
  kies de zone. Dat staat er nu bij de zones, en het blad buiten heeft een link
  naar de zones en lampen van dat deel.
- **Wat is er rond je huis?: alleen aanvinken.** Het deel komt op zijn vaste
  plek. De keuzelijst met de ruimte uit Home Assistant, het lijstje ruimtes en
  het veld voor een nieuwe ruimte zijn weg; bij een deel dat aan staat een
  knopje naar zijn lampen en zones. Een ruimte die bij geen deel hoort, staat
  er nog om te openen. Bij Inrichten net zo.

*Wat afviel:* een eigen pagina Buiten (je verlaat Thuis, en de schets liet het
blad ernaast zien); de knop Buiten ook op de telefoon (de bovenbalk liep vol;
een tik op een deel buiten opent het blad ook); de garagedeur bedienen.

---

## 207. Sluipverbruik dat vaak terugkomt, de wand in Fully Kiosk, en een QA-ronde

*Onderwerp: weergave · Status: geldig*

Op 29 oktober 2026, na een QA-ronde op het eigen huis. Drie dingen vielen op:
de wand bleef 's nachts licht en leeg, bij Sluipverbruik stond "Vannacht
gewoon" terwijl 16 van de 30 nachten opvielen, en buiten stonden nog knoppen
voor links en rechts die sinds besluit 206 niets meer doen.

*Besluit:*

- **Vaak meer dan gewoon.** Valt een op de vier van de laatste 30 nachten op,
  niet per se op rij, dan zegt `api/sluipverbruik` dat in `vaak`: hoeveel
  nachten, hoeveel watt de middelste hoge nacht erboven ligt (een uitschieter
  telt dan niet zwaar), en sinds wanneer (de maanden terug zolang er een op de
  vier opviel). Hier wisselde het huis sinds augustus tussen 190 en 340 W. De
  app zet er een eigen kaart voor neer, met dezelfde vraag wat het is. Het
  antwoord geldt voor het patroon, over de reeksen heen; daarna geeft de bel er
  niet elke ochtend opnieuw een melding over. Je gewone nacht blijft het
  gemiddelde van de vijf laagste: die klopt als het huis zonder het extra.
- **Een staaf aantikken** bij Sluipverbruik toont die nacht of maand: hoeveel
  watt, en hoeveel boven of onder je gewone nacht, of tegen dezelfde maand een
  jaar eerder. Alles uit wat de dienst al geeft.
- **De wand in Fully Kiosk.** De melder `fully` is de camera van de wand zelf.
  Fully voert zijn gebeurtenissen (`onMotion`, `screenOn`) uit in de bovenste
  pagina, en in Home Assistant is dat niet de app (Ingress); een
  BroadcastChannel brengt ze erheen. Zet Fully het scherm zelf aan, dan toont de
  app de klok in plaats van een zwarte pagina. Bij Functies › Scherm uit zegt
  de wand of hij Fully ziet en of de camera meekijkt. Zonder melder staat er
  niet meer dat beweging het scherm aanzet.
- **Buiten een vaste plek, ook in het blad.** Geen Naar links en Naar rechts
  voor een deel buiten, geen pijltjes bij de zones van de tuin, en Weghalen in
  plaats van Kamer weghalen.
- **Opgeruimd.** Wat de app nergens gebruikte (teksten, CSS, drie stukken in
  de dienst) is weg; pagina's halen niets meer op wat ze niet gebruiken, en
  hetzelfde verzoek tegelijk gaat één keer.
- **Versie 0.79.0.**

*Wat afviel:* je gewone nacht als mediaan van de 30 nachten (dan wordt het
extra van de helft van de nachten gewoon, en zegt de app er niets meer over); de
camera alleen via de Fully-integratie van Home Assistant (die staat hier niet,
en de app hoort het zo zonder omweg).

*Nagekomen, versie 0.79.1* (dezelfde dag, de rest van de QA-ronde):

- **De film:** de kaarten bij Je apparaten gaven de temperatuur onder een
  andere naam door dan het rondje las, dus het rondje bleef leeg. En in het
  lichte thema waren de namen donker op een donkere kaart: de film heeft nu
  zijn eigen donkere kleuren.
- **De assistent** kent een kamer ook bij een gewone andere naam ("living
  room", "huiskamer", "attic"), als er maar één kamer bij past; eerst ging het
  antwoord dan over een andere kamer. Een onbekende kamer of nog geen besluit
  zegt hij letterlijk (`letterlijk` in het antwoord), zonder het
  sfeerzinnetje dat het model erachter zette.
- **Een kamer met alleen een airco op zon** wacht op zon, en zo zegt de
  assistent het ook (al in 0.79.0).
- **Nagelopen zonder fout:** alle stappen van Inrichten, de overige pagina's in
  het Nederlands en het Engels, het lichte thema, en opslaan met de hand. De
  regeling naast de oude YAML over drie dagen: de airco in de woonkamer was
  het altijd eens; die op de zolder zou vijf keer, hooguit een kwartier, zon
  gebruiken die de oude regeling liet liggen; de failsafe ging op 28 oktober
  twee uur aan door de temperatuursensor van de Hue-bewegingsmelder op zolder.

*Nagekomen, versie 0.79.2* (dezelfde dag, wat de assistent nog niet kon):

- **Aan zonder meer.** "Zet de airco aan" gaf de stand van nu, want "aan"
  zei niet of hij moest koelen of verwarmen. Nu is `aan` een wens: koelen of
  verwarmen naar wat de kamer nodig heeft (onder of boven het doel, anders de
  buitentemperatuur). Zonder kamer kiest hij de enige kamer die het kan, of
  vraagt welke. Een opdracht zonder kamer moet over klimaat gaan (airco,
  verwarming); licht en schermen blijven van de opdrachten (besluit 148).
- **Drie vragen erbij:** `thuis` (uit de aanwezigheid; op naam alleen met
  bewoners, na de rust van tien minuten), `terug` (vandaag uit het
  dagoverzicht, de maand uit Opbrengst) en `draait` (de apparaten die op zon
  wachten; een ander apparaat zegt hij dat hij niet ziet).
- **Wat de stroom kost** noemt eerst het hele huis deze maand, uit de regels
  van Opbrengst: stroom met de teruglevering ervan af, gas, en met de vaste
  kosten erbij. Daarna de apparaten met een eigen meter.
- **De borderverlichting** gloeit alleen in de border zelf en zachter; eerst
  straalde hij over de rand van de tuin.
- **Nagezocht zonder fout:** de zon van 760 W tegen 1.240 W terug op 27
  oktober. De zonnesensor meet eens per minuut, de slimme meter vaker; om
  12:36 ging er zo'n 2,7 kW uit terwijl de zon doorbrak. De regeling kijkt naar
  de slimme meter.

*Nagekomen, versie 0.79.3:* de ring van de zon (besluit 205) staat ook op het
always-on display overdag. Daar staan geen labels, stromen of kop op het huis,
en het huis staat rechts van de klok en de tekst; de reden om hem op Thuis weg
te laten geldt hier niet. 's Avonds niet (de zon is onder), en uit bij
Weergave zoals overal.

---

## 208. Luisteren in de dienst: het wekwoord met een schuif, en wachten tot je klaar bent

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 29 oktober 2026, als eerste stap van een
assistent die echt meedenkt: de wand reageerde regelmatig uit zichzelf op
"Hé huis", de gevoeligheid wilde hij zelf instellen, en het huis antwoordde
soms al voordat hij uitgesproken was. Beide hadden dezelfde oorzaak: de app
had het luisteren niet in de hand. Het wekwoord en het einde van de spraak
bepaalde Home Assistant (besluit 150), en de drempel van openWakeWord staat in
de add-on, waar de app niet bij mag (de rol *manager*, eerder afgewezen).

*Besluit:*

- **De dienst hoort het wekwoord zelf.** Het geluid van de wand liep al langs
  de dienst (besluit 150). Nu gaat het daar eerst door hetzelfde model als in
  de openWakeWord-add-on (`he_huis.onnx`, uit de training van besluit 150),
  met de twee voorstappen van openWakeWord (`melspectrogram.onnx`,
  `embedding_model.onnx`), stap voor stap zoals `openwakeword/utils.py`.
  Pas na het wekwoord start de dienst in Home Assistant een spraakopdracht,
  vanaf het uitschrijven (`start_stage: stt`). Zo heeft de spraakassistent
  ook geen wekwoord meer nodig.
- **Zonder bibliotheek** (`web/onnx.ts`). Het image houdt nul
  runtime-afhankelijkheden (besluit 57); een ONNX-runtime is tientallen
  megabytes en native code die op Alpine niet draait. De rekenaar kent alleen
  de 25 bewerkingen van deze drie modellen en weigert elke andere bij het
  laden. Elke stap van 80 ms zijn maar 8 van de 76 rijen nieuw; de lagen
  zonder rand in de tijd rekenen alleen die (`runSchuivend`), met dezelfde
  uitkomst (getoetst tot 1e-5). Eén stap kost op een Ryzen 7600X 7,4 ms; op
  de Pi naar schatting drie keer zoveel, niet gemeten.
- **Getoetst op de opnames van de training** (`tools/wekwoord-toets.ts`): van
  40 opnames met het wekwoord 95% gehoord, van 40 die erop lijken geen enkele
  (de training zelf: 93%). De kenmerken uit de training geven 0,97 voor een
  duidelijk "Hé huis" en 0,001 voor iets anders; die staan in de test.
- **De gevoeligheid per scherm**, in vijf standen bij Functies › Praten, van
  heel streng (0,85, twee stappen achter elkaar) tot heel gevoelig (0,3).
  Normaal is 0,5, zoals de add-on. Bewaard in die browser, net als "Dit scherm
  luistert"; de pagina geeft het mee aan `/api/luister`.
- **Wachten tot je klaar bent.** De dienst stuurt `no_vad` mee, zodat Home
  Assistant niet zelf stopt na 0,7 seconde stilte, en zegt zelf wanneer het
  geluid op is (`web/spraakeinde.ts`): luidheid per 10 ms tegen een
  achtergrond die meeloopt, praten pas na 150 ms (een tik is geen zin), klaar
  na de wachttijd van het scherm: Vlot 0,7 s, Normaal 1,2 s, Rustig 1,8 s.
  Ook als Home Assistant het wekwoord hoort, en op de telefoon.
- **Wakker zonder vraag is stil.** Komt er na het wekwoord binnen vijf
  seconden geen woord, dan was het waarschijnlijk niet voor het huis: de laag
  sluit zonder "niet verstaan". Functies › Praten zegt hoe vaak het huis
  vandaag wakker werd en hoe vaak zonder vraag, en raadt bij vaak een stand
  strenger aan. Alleen tijd, kans en of er een vraag kwam, in het geheugen;
  nooit geluid (`/api/luister-stand`).
- **Een halve zin wacht op de rest.** Eindigt wat Whisper uitschreef op een
  woord waar geen zin op eindigt ("de", "en", "in", "zet"), dan luistert de
  wand door zonder wekwoord en plakt het vervolg erachter, hooguit twee keer.
  Niet op "aan", "uit", "het" of "dan": daar eindigt een opdracht juist op.
- **Een veiligheidsklep.** Rekent het wekwoord gemiddeld meer dan 60% van de
  tijd die het geluid duurt, dan hoort Home Assistant het weer, tot de dienst
  herstart; Functies zegt dat. Zonder de modellen, of als de gekozen
  spraakassistent een ander wekwoord heeft, ook.
- **De modellen** staan in `backend/wekwoord/` (de NAS checkt `addon/` niet
  uit) en gaan mee in de add-on en het image van de NAS; alleen de `.tflite`
  uit `addon/wekwoord/` gaat naar `/share/openwakeword`. De twee voorstappen
  zijn van openWakeWord (CC BY-NC-SA 4.0), ongewijzigd; zie de LEESMIJ daar.
- **Versie 0.80.0.**

---

## 209. Een assistent die meedenkt: een gevoel wordt een opdracht, licht dat bij het moment past, en doorvragen

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 29 oktober 2026, stap 1 en 2 van het plan voor
een assistent die echt meedenkt: hij moet snappen dat "het is koud in de
woonkamer" verwarmen betekent en "het is donker in de keuken" licht, dat
licht meteen comfortabel is voor het dagdeel en het weer, alle kamers, zones
en apparaten kennen, doorvragen als er twee screens zijn ("klein of groot?"),
en 's avonds bij "zet de zithoek aan" vragen of de sfeerverlichting aan moet.

*Besluit:*

- **Een gevoel is een opdracht.** "Het is donker in de keuken" zet het licht
  daar aan, of feller als het al aan was; "het is hier zo fel" dimt het, in de
  enige kamer waar licht brandt of na de vraag welke. "Het is koud in de
  woonkamer", "ik heb het warm op zolder" en "het mag wat warmer" worden een
  wens om te verwarmen of te koelen (`gevoelWens`); die gaat de weg van
  besluit 75, en tot stap B zegt het huis wat het zou doen. Een vraag blijft
  een vraag: "waarom is het koud?" en "is het donker in de keuken?" niet. Een
  plek die de woordzoeker niet kent ("op de trap") laat hij aan het taalmodel.
- **Licht dat bij het moment past** (`web/lichtrecept.ts`). Gaat licht aan
  zonder getal en was het uit, dan kiest de dienst helderheid en wit uit de
  klok, de stand van de zon en het weer: overdag en bij grijs weer 100%
  neutraal, in de schemer 80% warm, 's avonds 70% warm, na tienen 45%, 's
  nachts (23:30 tot 6:00) 20%. Een lamp die al aan staat houdt zijn stand; een
  getal of tint die je noemt gaat voor. Het getal staat bij de feiten (besluit
  88), en de zin zegt waarom: "op 70%, warm voor de avond".
- **De delen van een kamer.** De zones uit de Indeling (besluit 95, 206) met
  eigen lampen zijn te bedienen bij naam ("zet de zithoek aan"), via de deur
  die de app al had (`doel: zone`), ook voor het taalmodel.
- **Doorvragen met korte keuzes.** Zijn er twee screens, of geen kamer
  genoemd, dan vraagt het huis welke, met het woord dat het verschil maakt
  ("klein of groot?", `onderscheid`), en geeft het keuzes mee: elk een label
  en de hele zin die het huis dan zelf verstaat. Op de pagina zijn het
  knoppen; de pagina stuurt ze mee met je volgende zin (`opties`), zodat "de
  grote", "de eerste", "ja" of "nee" begrepen worden (`kiesUit`). De dienst
  onthoudt niets: de gekozen zin gaat gewoon opnieuw door de woordzoeker, met
  dezelfde deuren en regels.
- **'s Avonds de sfeerverlichting.** Gaat het licht van een kamer of zone aan
  terwijl het uit was, 's avonds of later, dan vraagt het huis "Wil je de
  sfeerverlichting?" als er in die zone of kamer een sfeerlamp staat naast
  ander licht (sfeer, gezellig of avond in de naam), of bij een hele kamer een
  scène met zo'n naam. Ja zet alleen de sfeerlamp aan (of de scène), "Nee,
  gewoon licht" alles. Eén voorstel, zonder aandringen; overdag niet, en niet
  in een zone zonder sfeerlamp, zoals de keuken van een woonkeuken.
- **Gevonden op de wand (0.80.0):** "Kan je de lamp in de keuken aanzetten?"
  werd "Welk licht bedoel je?". In de Indeling is de keuken hier een zone van
  de woonkamer (een woonkeuken), en de assistent kende alleen kamers. Met de
  zones gaat het nu goed; de test bootst deze indeling na.
- **Wat het taalmodel straks mag zien.** Voor het brein (stap 3 van het plan)
  koos de bewoner: alles wat de assistent nodig heeft, ook of er iemand thuis
  is. Dat verruimt besluit 148 zodra het brein er is; in deze versie gaat er
  nog niets extra's naar het model, behalve de namen van de zones.
- **Versie 0.81.0.**

---

## 210. De klimaatbrug: tot stap B via de knoppen van het oude systeem

*Onderwerp: visie en principes · Status: geldig*

Gevraagd door de bewoner op 29 oktober 2026: "het is koud in de woonkamer"
moet echt warmer worden, niet alleen "dan zou ik". Klimaat bleef tot nu toe
dicht tot stap B (besluit 15, 64), en dat blijft voor de regeling van de app
zo. Uit drie wegen (wachten op B; een eigen deur naar de thermostaat, die het
oude systeem binnen drie minuten terugzet; of de knoppen van het oude
systeem) koos hij de knoppen. Voor de winterdataset maakt het niets uit: het
is een ingreep van een bewoner, zoals een draai aan de knop in Home
Assistant, en het oude systeem blijft de baas. Zo zie je alvast hoe de app de
apparaten bedient.

*Besluit:*

- **Een achtste smalle deur** in de client (`allowKnoppen`, `isKnopCall`):
  alleen `input_number.set_value` met een getal op
  `input_number.temp_nest_dag` of `input_number.temp_airco_woonkamer_koelen`,
  en `input_select.select_option` met de optie `dag` op
  `input_select.verwarming_modus`. Een thermostaat of airco zelf (`climate.`)
  komt hier nooit doorheen; een test bewijst dat. De deur is open als de
  brug aan staat, of als er nog iets terug moet.
- **Alleen in de add-on**, net als meldingen (besluit 183): de NAS kijkt mee en
  blijft eraf, anders ging een opdracht twee keer.
- **Standaard uit**, aan te zetten bij Functies › Praten, en alleen te zien als
  de knoppen van het oude systeem er zijn. Alleen voor dit huis: de knoppen
  staan in zijn YAML. Bij stap B verdwijnt de brug.
- **Wat hij doet** (`web/klimaatbrug.ts`), met de vier standaarden van de
  bewoner: verwarmen in de kamer van de Nest zet de dagtemperatuur een graad
  hoger, of op de genoemde temperatuur, binnen het bereik van de knop. 's
  Nachts, afwezig of bij voorverwarmen zet hij eerst de modus op dag; de timer
  van het oude systeem zet die na twee uur terug op automatisch. De zolder doet
  niet mee: daar verwarmt de airco alleen met zon of als hulp. Koelen gaat via
  de koelknop van de woonkamer, alleen als de koelstrategie aan staat. Bij
  vakantie of koelen in de regeling verwarmt hij niet.
- **Tot hoe laat** (besluit 75): wat je zegt ("een uur", "twee uur"), anders het
  eind van het dagdeel, 22:00, of 's nachts twee uur. Dan zet de brug de knop
  terug op zijn standaard (`…_standaard`), maar alleen als hij nog staat waar
  de brug hem zette: wie hem intussen zelf verzette, wint. Wat terug moet staat
  in `klimaatbrug.json` in de logmap, zodat een herstart het niet vergeet.
- **Via dezelfde weg als licht** (besluit 148): de assistent geeft een opdracht
  terug, de pagina stuurt die naar `/api/klimaat`, en de deur rekent opnieuw
  en toetst alles. Een gast mag het niet. Het antwoord zegt wat er gebeurt en
  tot wanneer, met elk getal als feit: "Ik zet de woonkamer op 21°, tot 22:00.
  Daarna weer 20°."
- **Versie 0.82.0.**

---

## 211. Sneller verstaan, de screens samen, en het venster dicht na een opdracht

*Onderwerp: weergave · Status: geldig*

Getest door de bewoner op de wand, 29 oktober 2026. Wat goed ging: "het is
koud in de woonkamer" en "het is donker in de keuken" deden wat ze moesten,
en "Hé huis" werkte snel. Wat niet: na je zin duurde het 20 tot 25 seconden
voordat de tekst in beeld kwam; "kan je de screens naar beneden doen?" vroeg
welke, "allebei" werkte niet, en een tik op "groot" werd een vraag over de
app; en na een opdracht bleef het venster luisteren zonder iets te doen.

*Besluit:*

- **De app kiest zelf hoe hij verstaat** (`web/verstaan.ts`). De spraakassistent
  die hier gekozen was, schreef uit met Google AI: in de logboeken van Home
  Assistant 32 tot 46 seconden per ronde, en 22 seconden voor een opname van
  2,2 seconden, waar Whisper in huis er 1,6 over deed. Nu neemt de dienst je
  zin na het wekwoord zelf op tot je klaar bent (besluit 208) en vraagt een
  spraak-naar-tekst in huis rechtstreeks om tekst (`/api/stt/<entiteit>`):
  Whisper eerst, dan een andere die geen cloud is. Er verandert niets in het
  huis. Zonder spraak-naar-tekst in huis gaat het via de spraakassistent,
  zoals eerst. De dienst schrijft per ronde in zijn logboek hoe lang het
  duurde.
- **Getoetst:** tien zinnen zoals de bewoner ze zegt, uitgesproken door drie stemmen
  (Piper en twee van Google), door beide uitgeschreven. Whisper (model "auto"
  in de add-on, op de Pi het kleinste): 7 van 30 foutloos, 28% woordfouten,
  1,8 s per zin. Google AI: 20 van 30, 16% woordfouten, 26 s per zin (soms 70
  tot 96 s, drie keer een fout). Whisper maakt er vooral bijna-goede woorden
  van ("wonkamer", "slabkamer", "zoldeer", "zette"). Daarom zet de dienst een
  woord dat heel dicht bij een naam uit het huis ligt recht (`verbeter`: één
  letter vanaf zes letters, twee vanaf negen, dezelfde eerste letter, zodat
  "wandkamer" nooit de badkamer wordt). Daarmee 15 van 30 foutloos, en een
  deel van de rest doet toch het goede. Een groter Whisper-model kiest de
  bewoner in de add-on; de app verandert geen andere add-ons. Met
  `small-int8` (dezelfde avond door de bewoner gezet): 20 van 30 foutloos, 8%
  woordfouten, 7 s per zin; na rechtzetten 25 van 30. Dat is beter dan Google
  AI, en bijna vier keer zo snel. Een s of z en een f of v tellen bij het
  rechtzetten als dezelfde beginletter ("solder" is de zolder).
- **Meer screens tegelijk.** Meervoud of "allebei" ("de screens", "alle
  screens", "beide") doet ze allemaal: de eerste als opdracht, de rest erachter
  (`meer`), elk door dezelfde deur. Bij één screen zonder kamer vraagt het huis
  welke, met "allebei" erbij, en de keuzes houden de richting vast ("Screen
  groot dicht"): eerst viel "naar beneden" eruit en werd het "Screen groot kan
  je doen".
- **Het venster sluit na een opdracht of antwoord**, twee en een halve seconde
  nadat het huis klaar is met praten. Alleen bij een vraag terug of als het je
  niet begreep, luistert het nog vijf seconden zonder wekwoord; "nee" of "oké
  bedankt" sluit het, zoals eerder.
- **Versie 0.83.0.**

---

## 212. De stem kiezen, en stem en luisteren op één plek

*Onderwerp: weergave · Status: geldig*

Gevraagd door de bewoner op 29 oktober 2026, na de schets
`Wand-Instellingen-Stem`: de stem kiezen in de app, vrouw of man, met per stem
een voorbeeld; weg met wat de app uit openWakeWord haalde (het wekwoord is
altijd "Hé huis") en met "Waar de stem vandaan komt": de app regelt dat zelf,
zodat het voor iedereen meteen werkt, tenzij je een stem uit de cloud kiest.
Google Cloud staat in zijn Home Assistant, met de Chirp 3 HD-stemmen in het
Nederlands.

*Besluit:*

- **Een eigen onderdeel bij Functies: Stem en luisteren.** Links de stem van je
  huis, rechts het luisteren ("Hé huis", hoe gevoelig, de wachttijd, of dit
  scherm luistert, en hoe de app verstaat). De keuze van de spraakassistent
  en "Met dit apparaat / Helemaal in huis" staan er niet meer: de app hoort het
  wekwoord zelf (besluit 208), verstaat met Whisper in huis als dat er is
  (besluit 211), en luistert anders zoals eerst.
- **De stem kies je uit een korte lijst** (`web/stemmen.ts`, `/api/stemmen`):
  van Google Chirp 3 HD zes vrouwen- en zes mannenstemmen, met een paar woorden
  over hoe ze klinken; van Piper de stemmen die niet brabbelen (Nathalie, Pim,
  Ronnie, Rdh; niet mls); en altijd "Dit apparaat", dat zonder iets erbij
  werkt. Alleen wat Home Assistant echt heeft, staat erin.
- **Eerst horen:** ▶ speelt een voorbeeldzin met die stem
  (`/api/stem?keuze=…`), ook vóór het kiezen; een tik op de kaart kiest hem en
  laat hem meteen horen. Bewaard bij Functies (`praten.stemKeuze`), voor het
  hele huis.
- **Een stem uit de cloud alleen als de bewoner hem kiest.** Besluit 141 zei dat
  de app nooit vanzelf een stem uit de cloud kiest; dat blijft zo. Vanzelf is
  het Piper als die er is, anders het apparaat. Kiest de bewoner Google, dan
  gaat alleen de tekst van het antwoord naar Google, niet zijn stem (tot een
  miljoen tekens per maand gratis); dat staat erbij.
- **Wie spreekt:** de dienst zegt de pagina welke stem spreekt (`spreek`), los
  van hoe hij luistert (`bron`). Kiest de bewoner het apparaat, dan spreekt
  ook de wand met de stem van de tablet; eerst bleef die dan stil.
- **Versie 0.84.0.**

---

## 213. Het brein: een gesprek, meer in één zin, en doe maar terug

*Onderwerp: weergave · Status: geldig*

Stap 3 van het plan voor een J.A.R.V.I.S.-gevoel (29 oktober 2026). De
bewoner koos eerst het gratis Gemini Flash-Lite via de AI-taak van Home
Assistant, met een teller bij Functies; het model mag alles zien wat het
nodig heeft, ook wie er thuis is. Tot nu toe was elke zin los, koos het model
hooguit één ding, en kon niets terug.

*Besluit:*

- **Een gesprek per scherm** (`web/brein.ts`, `Gesprekken`): de pagina stuurt
  een eigen id mee (`gesprek`), de dienst onthoudt de laatste zes beurten tien
  minuten lang. Het model ziet ze, zodat "en in de keuken ook" of "nog wat
  zachter" weet waar het over gaat.
- **Doe maar terug, zonder model.** Bij elke opdracht onthoudt de dienst hoe
  het was, uit de stand vóór de opdracht (`terugVan`): elke lamp zoals hij
  stond, een scherm naar zijn stand (of de andere kant op als hij die niet
  meldt), en bij de klimaatbrug de knop terug naar de standaard
  (`/api/klimaat` met `terug`, `KlimaatBrug.terugNu`). "Doe maar terug",
  "maak dat ongedaan" of "zet het terug zoals het was" stuurt dat door
  dezelfde deuren, één keer.
- **Meer in één zin:** "screens dicht en de lamp aan" leest de woordzoeker per
  deel (`herkenDelen`), alleen als hij álle delen begrijpt; anders de hele
  zin de gewone weg.
- **Het plan van het model** (`denk`): wat de woordzoeker niet begrijpt, gaat
  naar het model met de situatie: de klok, wat het huis doet, hoe warm het
  is, wie er thuis is, wat er draait, het weer, en vandaag en gisteren uit het
  logboek (`dagRegels`). Het model kiest een plan van hooguit vier stappen
  (licht, scène, scherm, klimaat via de brug), een vaste vraag, of een
  antwoord uit alleen die feiten. Elke stap gaat door dezelfde bouwers als de
  woordzoeker; elk getal in een zin moet een feit zijn (besluit 88). Woorden
  als "sluiten" of "dimmen 30%" vertaalt de dienst naar zijn eigen acties,
  want zo antwoordde Flash-Lite in de proef. Het model raakt zelf niets aan.
- **Wachten:** tien seconden op een plan (`DENK_MS`), vijf op eigen woorden.
  Een proef op 29 oktober: Flash-Lite deed er 8 tot 10 seconden over, ook een
  kale "zeg hallo" 13 tot 18; de AI-taak staat in Home Assistant op
  "Thinking level: auto". De opdracht mag nu 12.000 tekens zijn (was 6.000).
- **De teller** (`Teller`, `taalmodel-teller.json`, `/api/praten/teller`):
  per dag hoeveel vragen er naar het model gingen, de fouten, de gemiddelde en
  langste tijd, veertien dagen bewaard. Bij Functies › Praten, met een
  waarschuwing als het gemiddeld langer duurt dan de assistent wacht.
- **Te traag, dan geen eigen woorden** (`Teller.eigenWoordenNu`): duurden de
  laatste antwoorden van het model meestal langer dan de assistent wacht (vijf
  seconden), dan vraagt hij geen eigen woorden meer en zegt hij meteen het
  vaste antwoord; anders wachtte elk antwoord voor niets. Eens per tien
  minuten toch één keer, en het brein meet mee: wordt het model sneller, dan
  komen de eigen woorden vanzelf terug. Functies zegt het erbij (versie
  0.86.1).
- **Functies › Praten opnieuw ingedeeld** (30 oktober 2026, versie 0.87.0),
  zoals Stem en luisteren: links het brein (het model als kaart, vandaag in
  drie getallen, de week in staafjes, proberen, wat er naar buiten gaat),
  rechts wat de assistent mag bedienen met zinnen om te proberen. Samen met
  Stem en luisteren op één pagina past niet zonder scrollen; daarom twee
  pagina's naast elkaar in de lijst. Gemeten op 29
  oktober na het wisselen naar `gemini-flash-lite-latest`: een plan 6,6 tot
  9,5 seconden, "zeg hallo" 8 tot 12; het netwerk (onder 0,1 s) en de Pi
  waren het niet.
- **Wat naar het model gaat** staat bij Functies: je vraag als tekst, de
  laatste zinnen van het gesprek, hoe het huis ervoor staat (ook of er iemand
  thuis is) en de namen. Je stem en camerabeelden niet.
- Erbij, uit de wandtest: een getal met een komma klinkt als "21 komma 5"
  (`uitspraak`), en "Dit apparaat" spreekt ook in Fully Kiosk, dat in de
  webweergave geen spraak heeft (`app.zegMetApparaat`).
- **Versie 0.85.0.**

---

## 214. Hoe ver je huis is: de zonnewaaier

*Onderwerp: weergave · Status: geldig*

De bewoner vroeg op 29 oktober 2026 om een totale voortgangsmeter achter Wat
je huis kan: wat het huis kan, wat het al doet en hoe ver het leren is. Alleen
wat er uit Home Assistant komt; de ideeën en wat er nog bij kan blijven op Wat
je huis kan. Uit de schetsen `Wand-Voortgang` (met de visgraat ernaast) en
`Tel-Voortgang` koos hij de zonnewaaier.

*Besluit:*

- **Een eigen pagina** (`voortgang.html`): het huis komt op als een zon boven
  de horizon. Elke straal is een onderwerp uit `stand.kan`, in zes groepen;
  hoe verder hij reikt, hoe verder het is. Vier ringen: gevonden, geleerd,
  kijkt mee, werkt. De tekening staat in de kit (`kit/waaier.js`, stijl in
  `kit.css`), zodat de schetsen en de app dezelfde code gebruiken (besluit
  104).
- **Het getal in de zon telt alles mee** (`stand.voortgang`): werkt is 100%,
  kijkt mee 75% plus een kwart van de datasetmeter (`gereedheid.totaal`,
  besluit 64), leert 25 tot 50%. Op tijd warm leert met de seizoenen
  (`gereedheid.tijd`). Wat meekijkt groeit gestreept naar de buitenste ring.
- **Wat er nog bij kan staat er niet in** (stand `nodig`); wat uit staat of een
  instelling mist, krijgt een korte grijze straal op de eerste ring.
- **Rechts** wat er samen werkt en wanneer het klimaat zelf regelt: seizoenen,
  elke stand, de winterdagen en samen. **Onderaan** de weg erheen op schaal
  van de tijd; het moment met genoeg winterdagen is een schatting vanaf 1
  december en heet "op zijn vroegst". Zonder slimme regeling of zonder
  meekijken staan die twee er niet.
- **Een tik** op een straal opent het blad: de vier treden, wat het al weet en
  wat nog komt, met de knop naar de instelling. Op de telefoon staan de namen
  niet bij de stralen maar in de lijst eronder, met vier streepjes per
  onderwerp.
- **Twee ingangen:** de kleine waaier op de kaart Wat je huis kan bij
  Instellingen, en een knop op Wat je huis kan naast In Home Assistant. Zoeken
  op "voortgang" vindt hem ook. Een gast mag hem zien.
- **Leert nog is violet**, ook op Wat je huis kan en Instellingen, zodat het
  te onderscheiden is van kijkt mee.
- **De stralen groeien alleen de eerste keer**; een tik of nieuwe cijfers
  tekenen ze meteen, en een kleine waaier groeit nooit.
- **Versie 0.86.0.**

---

## 215. Sneller verstaan: het einde van je zin bij geluid, en rechtzetten op klank

*Onderwerp: weergave · Status: geldig*

Gemeld door de bewoner op 30 oktober 2026: met geluid in de kamer bleef het
huis lang denken dat er nog gepraat werd, en dat kostte tijd. Het einde van je
zin (besluit 208) volgde een achtergrondniveau dat alleen meeliep als er níet
gepraat werd; geluid dat telkens even boven die achtergrond kwam, zoals
tv-dialoog met stiltes ertussen, telde als praten. Dan luisterde het huis door
tot de grens van vijftien seconden.

*Besluit:*

- **Je eigen stem is de maat** (`Spraakeinde`): zodra je praat, onthoudt het
  huis hoe luid jij praat (het luidste van een twintigste seconde, zodat een
  tik niet telt). Wat 16 dB of meer zachter is, telt niet meer als praten; wat
  12 dB of meer zachter is, gaat mee in de achtergrond, ook terwijl je praat.
  Een zacht woord aan het eind ("… aan") telt nog wel.
- **Twee seconden zonder woord van jou**, en je zin is klaar, ook als de kamer
  blijft rommelen; de bewoner koos twee seconden. Bij de wachttijd Rustig
  (1,8 s) blijft dat twee seconden.
- Toetsen met nagebootste tv en geroezemoes; die met geroezemoes faalde met
  de oude manier.
- **Rechtzetten op klank** (`klank`, `verbeter`): een lamp bedienen duurde
  ruim tien seconden, waarvan Whisper small-int8 er zes. Gemeten op 30
  oktober met dezelfde 30 zinnen (drie stemmen): small-int8 6,1 s per zin en
  de app begreep er 27 hetzelfde uit; base-int8 2,1 s, maar 20. Wat base
  fout schreef, klonk wel goed ("sitoek", "zetuk", "koot", "koken",
  "womkamer", "Set de"). Nu zet het huis een woord ook op klank recht naar
  een naam uit het huis ("th" is t, "oe" u, "ou" o, s z, f v, geen h; gelijk,
  of één klank anders bij een naam van vijf klanken), en "set" aan het begin
  is zet. Daarmee begrijpt de app bij base-int8 er ook 27. Gewone woorden die
  op een naam lijken ("zonder", "kijken", "komen") zet het nooit recht; dat
  is nagegaan met alle 1444 woorden uit de teksten van de app. Een naam die
  nog een id is ("light.hal") geeft geen woord. De bewoner zette de
  Whisper-add-on op base-int8.
- **Versie 0.87.1.**

---

## Wat nog een besluit wacht

- **De ventilatie wordt deze winter geïnstalleerd, en dat verandert het huis.**
  Een centrale kast met afzuiging in wc, badkamer, zolder en woonkamer, één
  vochtsensor in de kast, geen kleppen per ruimte en geen warmteterugwinning.
  Afzuigen zonder terugwinning voert de hele winter verwarmde lucht af, dus het
  huis verliest daarna anders warmte dan ervoor. Voor het thermisch model (stap
  D) is de installatiedag een breukpunt. Op die dag: de datum hier vastleggen, en
  nagaan of de entiteiten in `recordOnly` (besluit 65) zo heten als in Home
  Assistant. Ze zijn al gekoppeld, maar bestonden op 1 oktober 2026 nog niet; de
  dienst legt ze vanzelf vast zodra ze er zijn. De stand of het debiet van de
  ventilator is daarbij belangrijker dan de temperaturen in de kast: daaruit
  volgt hoeveel lucht er naar buiten gaat. Later komen er misschien
  CO₂-sensoren bij, voor de luchtkwaliteit; die horen dan ook in `recordOnly`.

- **De badkamer verwarmt elektrisch; voor het budget is 0 W toch juist.**
  Volgens de bewoner (2 oktober 2026): het hele huis heeft radiatoren op de cv,
  met water van 60 °C, geregeld door de Nest beneden. De badkamer niet: daar
  schakelt `climate.thermostaat_badkamer` elektrische vloerverwarming (450 W)
  en een infraroodpaneel in het plafond (700 W) tegelijk, samen 1.150 W.

  De configuratie geeft de badkamer `estimatedW: 0`, en dat blijft zo. Twee
  redenen. Comfort vraagt geen budget (`budgetW: 0`), maar `reclaimableW` telt
  het verbruik van elk draaiend apparaat als terug te winnen: met 1.150 W zou de
  regeling denken dat die ruimte vrij is voor een airco, terwijl de badkamer
  voor comfort nooit uitgaat. En de thermostaat meldt niet of hij werkelijk
  stookt (geen `hvac_action`): op "verwarmen" bij een warme badkamer trekt hij
  niets, maar zou er wel 1.150 W gerekend worden. Voor het budget hoort het
  verbruik van de badkamer bij de basislast, en daar staat het nu ook.

  Waar de 1.150 W wel voor nodig is: de beveiliging tegen overbelasting (78)
  en het thermisch model (D). Sinds besluit 178 is dat `power.ratedW`, los van
  `estimatedW`, en telt `reclaimableW` alleen wat de regeling terugschakelt.
  Voor het thermisch model blijft het hieronder gelden. Wanneer de badkamer echt stookt, leert het model uit de
  sprongen van ongeveer 1,15 kW in de P1-meter. Verder voor het model: een
  infraroodpaneel verwarmt vooral mensen en oppervlakken, niet de lucht, dus
  de thermostaat ziet die warmte later en minder dan de bewoner hem voelt. En
  radiatoren op 60 °C zijn hogetemperatuurverwarming: snel, maar een
  warmtepomp zou er later minder zuinig mee zijn.
- **Buitentemperatuur wordt vastgelegd, maar nog niet gebruikt.** Sinds
  10 september 2026 gaat `sensor.temperatuur` mee in `Explanation` en dus het
  logboek in (besluit 30). Een test bewaakt dat niets in `core/` hem leest;
  zodra een strategie dat wel wil, hoort daar een besluit bij.
- **`bufferBandC`** staat op 1,0 zonder onderbouwing. Zie besluit 14.
- **Heat-assist** mist de startvertraging niet meer, maar is nooit in de praktijk
  afgegaan: de Nest rapporteerde in het augustusvenster nooit `heating`.
- **`Automatisch koelen` is nog niet vertaald.** Onder die stand valt
  `pv_koelen_heeft_regie` ook weg — die eist `Pv koelen` — en draait het oude
  systeem `script.koelen_apply_per_ruimte`: koelen op setpoint met hysterese,
  zonder naar het PV-budget te kijken. Dat is géén overname door de bewoner maar
  een tweede automaat, dus `handmatig` is er het verkeerde antwoord voor en het
  is bewust niet toegevoegd. In de schaduwlogboeken van 5 tot 7 september komt
  de stand niet voor, dus er is nog niets om aan te meten. Zodra hij wel valt:
  verwacht divergentie in de richting "ik zou stoppen", en dan is de vraag of de
  arbiter die regeling moet nabootsen of vervangen.
- **`handmatig` is grofkorrelig.** Zie besluit 8b: de stand geldt bij ons voor de
  hele woning, in het oude systeem alleen voor de koelregeling.
  Besluit 74 maakt ingrijpen per apparaat mogelijk; de stand voor het hele huis
  blijft daarnaast bestaan.
- **De dagdoelen van de datasetmeter zijn op dit huis geijkt** — dertig
  winterdagen, en de seizoenen van Nederland. Zie besluit 27.
- **De start-vlaggen worden alleen aan het einde opgeruimd.**
  `script.klimaat_controller_apply` zet `input_boolean.zolder_started_now` en
  `..._woonkamer_started_now` aan tijdens de run en pas als laatste stap weer
  uit. Het script staat op `mode: queued`, dus een normale run maakt dat altijd
  af — het gat is kleiner dan het lijkt. Maar breekt een run af (een
  `climate.`-aanroep die faalt zonder `continue_on_error`, of een herstart van
  HA op het verkeerde moment), dan blijft de vlag `on` en blokkeert hij bij de
  vólgende run de woonkamer, stilzwijgend. Een `turn_off` van beide aan het
  *begin* van het script sluit dat af. Dit raakt alleen het oude systeem; de
  arbiter heeft de vlag niet nodig (besluit 3).
