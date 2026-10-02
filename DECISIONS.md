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
- [71. De schetsen van de app zijn de maatstaf](#71-de-schetsen-van-de-app-zijn-de-maatstaf)
- [73. Elk huis doorloopt drie fasen, en de bewoner doet vanaf dag één mee](#73-elk-huis-doorloopt-drie-fasen-en-de-bewoner-doet-vanaf-dag-één-mee)
- [75. Een opdracht aan de assistent wordt een ingreep met een eindtijd](#75-een-opdracht-aan-de-assistent-wordt-een-ingreep-met-een-eindtijd)

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

**Configuratie en onboarding**

- [9. Configuratie als JSON, niet YAML, niet meteen een database](#9-configuratie-als-json-niet-yaml-niet-meteen-een-database)
- [10. Validatie met de hand, zonder bibliotheek](#10-validatie-met-de-hand-zonder-bibliotheek)
- [31. De vertaling had een tweede configuratie in zich](#31-de-vertaling-had-een-tweede-configuratie-in-zich)
- [32. Wat in code stond kon niet per woning verschillen](#32-wat-in-code-stond-kon-niet-per-woning-verschillen)
- [40. Het schema weigert alleen nog op wat er echt niet zonder kan](#40-het-schema-weigert-alleen-nog-op-wat-er-echt-niet-zonder-kan)
- [41. De ontdekking stelt voor en besluit niet](#41-de-ontdekking-stelt-voor-en-besluit-niet)
- [43. Een meetwaarde mag in een attribuut zitten](#43-een-meetwaarde-mag-in-een-attribuut-zitten)
- [72. Kamers en zones horen bij de app; Home Assistant levert de apparaten](#72-kamers-en-zones-horen-bij-de-app-home-assistant-levert-de-apparaten)

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

**Weergave**

- [24. Tailwind met een bouwstap, niet via een CDN](#24-tailwind-met-een-bouwstap-niet-via-een-cdn)
- [26. De terugblik hoort bij de weergave, maar is een andere waarheid](#26-de-terugblik-hoort-bij-de-weergave-maar-is-een-andere-waarheid)
- [45. Een bewoner ziet nooit een entity-ID](#45-een-bewoner-ziet-nooit-een-entity-id)
- [63. De terugblik gaat verder waar hij was](#63-de-terugblik-gaat-verder-waar-hij-was)
- [76. De testpagina is een prototype; de echte app krijgt een bewonerscontract](#76-de-testpagina-is-een-prototype-de-echte-app-krijgt-een-bewonerscontract)

**Veiligheid**

- [15. Schaduwmodus schrijft niet, structureel](#15-schaduwmodus-schrijft-niet-structureel)
- [23. De schaduwdienst gaat luisteren, maar alleen om te lezen](#23-de-schaduwdienst-gaat-luisteren-maar-alleen-om-te-lezen) — *deels vervangen door 42*
- [38. De ruwe HA-export hoort niet in versiebeheer](#38-de-ruwe-ha-export-hoort-niet-in-versiebeheer)
- [42. De weergave mag schrijven waar Home Assistant de deur bewaakt](#42-de-weergave-mag-schrijven-waar-home-assistant-de-deur-bewaakt)
- [77. De add-on opent via Home Assistant; een eigen link pas met een eigen inlog](#77-de-add-on-opent-via-home-assistant-een-eigen-link-pas-met-een-eigen-inlog)

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
- [37. De add-on wordt platgeslagen voordat de Supervisor hem bouwt](#37-de-add-on-wordt-platgeslagen-voordat-de-supervisor-hem-bouwt)
- [53. De NAS is de primaire omgeving; de add-on wacht tot stap B](#53-de-nas-is-de-primaire-omgeving-de-add-on-wacht-tot-stap-b)
- [64. Echt schakelen pas met een complete winter en alle functies](#64-echt-schakelen-pas-met-een-complete-winter-en-alle-functies)
- [67. Een mail als de opname stilvalt](#67-een-mail-als-de-opname-stilvalt)

**Kwaliteitsbewaking**

- [54. Een machine kijkt mee](#54-een-machine-kijkt-mee)
- [55. De opstart is één zuivere functie](#55-de-opstart-is-één-zuivere-functie)
- [56. Regels die voor elke toestand gelden](#56-regels-die-voor-elke-toestand-gelden)
- [57. Een linter met een handvol regels](#57-een-linter-met-een-handvol-regels)
- [59. Namen in het Engels, de rest in het Nederlands](#59-namen-in-het-engels-de-rest-in-het-nederlands)
- [69. Ook de pagina en deploy.sh worden getest](#69-ook-de-pagina-en-deploysh-worden-getest)

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

*Onderwerp: veiligheid · Status: geldig*

`HaClient` wordt zonder `allowWrites` aangemaakt, en `callService` werpt dán al
voordat er iets de socket op gaat.

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

*Onderwerp: uitrol en beheer · Status: geldig*

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

*Onderwerp: veiligheid · Status: geldig*

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
geen eigen stand mee. `src/replay/decision-49.ts` rekent het verschil door over
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

*Wat de hoogte kost, over beide vensters* (`src/replay/decision-50.ts`, met
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

*Onderwerp: kwaliteitsbewaking · Status: geldig*

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
| `src/replay/besluit49.ts`, `besluit50.ts` | `src/replay/decision-49.ts`, `decision-50.ts` |
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

*Gemeten* (`src/replay/decision-60.ts`, beide vensters, met alles zoals het op
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

*Gemeten* (`src/replay/decision-60.ts`, met en zonder deze regel). Alleen de
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

*Onderwerp: visie en principes · Status: geldig*

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

*Onderwerp: configuratie en onboarding · Status: geldig*

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

*Wanneer:* de schermen bij F, het gebruik van gevoel en context bij D. Of dit
huis ze deze winter al vastlegt, is een eigen vraag: het vraagt schrijven
vanaf de pagina op de NAS, en dat is met besluit 42 bewust afgesloten.

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

*Onderwerp: weergave · Status: geldig*

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

- **Koelen op netstroom boven het comfortplafond.** Op 1 oktober 2026 liep de
  woonkamer tussen 17:50 en 18:25 op van 24,8 naar 26,8 °C. De schaduw had dan
  op het plafond van 26 °C (besluit 50) gekoeld: de woonkamer van 18:05 tot
  19:43, de zolder van 18:21 tot 20:41, met weinig of geen zon, dus vooral op
  netstroom. Het oude systeem koelt alleen op zon en deed niets. Wat de
  woonkamer deed oplopen, staat niet in de data; in dezelfde minuten liep er
  wel 0,29 m³ gas door de meter. De vraag aan de bewoner: wil hij boven 26 °C
  ook op netstroom koelen, of alleen op zon? Het antwoord kan per huis
  verschillen, en hoort dus een instelling te worden.
- **De zonne-opbrengst komt eens per kwartier.** `sensor.solaredge_huidig_vermogen`
  komt uit de cloudkoppeling van SolarEdge (api-sleutel en site-id) en werkt
  precies elke 15 minuten bij; de API van SolarEdge staat niet veel vaker toe.
  De regeling leest hem niet (47), dus de besluiten merken het niet. De
  weergave wel: een zon die een kwartier stilstaat naast een net dat elke paar
  seconden beweegt, en een "huis" (zon plus net) dat daardoor niet klopt. En de
  dataset voor het thermisch model krijgt de instraling per kwartier in plaats
  van per minuut. Twee lokale alternatieven, allebei met updates per seconden:
  Modbus TCP van de omvormer (moet op de omvormer worden aangezet, bij nieuwere
  omvormers soms door de installateur; via een HACS-integratie; vaak maar één
  verbinding tegelijk), of een HomeWizard kWh-meter op de groep van de panelen,
  naast de P1-meter die er al is. Bij de overstap: de nieuwe sensor eerst in
  `recordOnly` (65) naast de oude, een paar dagen vergelijken, dan
  `solarProduction` omzetten, en de datum vastleggen, want het is een
  breukpunt in de kolom `zonW`.
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
- **De weergave kent geen authenticatie.** Zie besluit 23. Verdedigbaar op een
  thuisnetwerk, onhoudbaar zodra dit bij iemand anders draait. Fase 6c. Voor dit
  huis bewust zo gelaten (1 oktober 2026): de NAS is alleen bereikbaar op het
  thuisnetwerk en via Tailscale, en daarmee ook onderweg te openen.
- **De terugblik spreekt over "het oude systeem".** Voor een woning zonder
  YAML-voorganger vergelijkt de schaduwmodus de arbiter met wat de thermostaten
  uit zichzelf deden (besluit 28). Dezelfde machinerie, andere vraag, verkeerde
  woorden. Uit te zoeken bij 6c. De richting staat sinds besluit 73: de fase
  bepaalt de woorden.
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
