# Besluitenlogboek

Waarom dit project is zoals het is. De code vertelt het *wat*; dit document
vertelt het *waarom*, inclusief de alternatieven die zijn afgevallen en wat een
besluit heeft gekost.

Nieuwste onderaan. Voeg een besluit toe zodra je merkt dat je een keuze
verdedigt die niet uit de code blijkt.

---

## 1. Weg van YAML, niet omdat het niet werkte

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

`decide(state, config, now) -> Decision` doet geen I/O, leest geen klok en kent
geen netwerk. Timers zijn invoer; een timerstart komt als commando terug.

*Afgewezen:* een controller die zelf sensoren uitleest en diensten aanroept. Dat
is korter, maar dan kun je hem alleen valideren in een echt huis, in echte tijd,
in één seizoen per jaar.

*Gevolg:* de replay-harness en de divergentietool zijn mogelijk. Een wijziging in
de regellogica wordt in seconden getoetst in plaats van in seizoenen.

## 3. Een vermogensbudget in plaats van een vlag

Het overschot is een pot die leegloopt. Elk voorstel draagt een `budgetW`: een
draaiend apparaat rekent zijn gemeten opname, een stilstaand apparaat zijn
schatting. Zo kost bijschakelen alleen het verschil — precies wat de
oorspronkelijke drempellogica bedoelde.

*Afgewezen:* de vlag herstellen die in de YAML-versie kapot was. Dat lost dat ene
geval op en laat de vorm intact die de fout mogelijk maakte.

*Gevolg:* dubbelstarten kán niet meer. Het is geen regel die je kunt vergeten,
maar een middel dat op raakt.

## 4. Strategieën stellen voor, één arbiter beslist

In de YAML-versie zat de voorrang tussen strategieën impliciet in de volgorde van
`choose`-blokken. Nu levert elke strategie `Intent[]` met een prioriteit, en één
arbiter lost conflicten op.

*Gevolg:* een nieuwe strategie raakt geen bestaande. En er is één plek waar
"wie wint" wordt beslist, in plaats van een volgorde die je uit vierhonderd
regels moet afleiden.

## 5. Afwezigheid van vraag is niet de taak van een strategie

`pvSurplus` stelde aanvankelijk `standby` voor zodra er niets te bufferen viel.
Live bleek dat twee uitgeschakelde airco's aanzette om vervolgens niets te doen —
standby betekent immers *aan*, met een onbereikbaar setpoint.

*Besluit:* strategieën drukken alleen vraag uit. Het afbouwen doet de arbiter,
die als enige weet wat een apparaat nú doet: draaiend gaat naar standby,
geparkeerd gaat na de stabilisatieperiode uit, uit blijft uit.

*Gevolg:* loste meteen iets op wat nog niet was opgemerkt — een geparkeerde airco
bleef in `nacht` en `vakantie` eeuwig in standby staan.

## 6. Tijd is invoer, ook buiten de kern

De schaduwrunner las eerst `Date.now()`. Een test faalde daardoor omdat het
toevallig 22:45 was en het huis in nachtmodus stond.

*Besluit:* de klok is injecteerbaar, ook in de laag om de kern heen.

Later bleek hetzelfde principe op een tweede manier te ontbreken: het veld
`timezone` in de configuratie werd nergens gebruikt. De code las de tijdzone van
het *proces*. Op een laptop in Nederland valt dat samen met het huis; in een
container draait Node in UTC, en dan begint voorverwarmen twee uur te laat
zonder één foutmelding.

## 7. Een fout hoort luid te falen

Een setpoint buiten het bereik van een apparaat wordt afgewezen, niet
stilzwijgend begrensd. Een onbekende tijdzone wordt geweigerd bij het inlezen.
Een ontbrekende configuratie stopt het opstarten.

*Reden:* stil terugvallen op iets redelijks is precies hoe de YAML-fouten
jarenlang konden blijven bestaan.

*Uitzondering:* de failsafe. Valt een kritiek meetpunt weg, dan gaan de
assist-apparaten uit maar blijft de hoofdverwarming draaien. Een CV uitzetten
omdat een zoldersensor wegvalt is gevaarlijker dan hem te laten lopen.

## 8. `handmatig` is een modus waarin de regeling zich terugtrekt

Toen `handmatig` als stand aan de helper werd toegevoegd, lag het voor de hand
hem op `dag` te laten lijken. Dat zou fout zijn: het is geen
temperatuurregime maar een instructie — *laat staan wat er staat*.

*Besluit:* in `handmatig` stelt de arbiter niets voor, stuurt hij geen setpoint,
start hij niets en schakelt hij ook niets af. Dat laatste is het verschil met
`nacht`, waar "niets te doen" juist betekent dat de boel uit mag.

*Uitzondering:* de failsafe wint hiervan. Een storing is geen voorkeur.

### 8b. De knop staat op twee plekken, de vertaling keek er maar naar één

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

Vierhonderd afwijkende minuten zeggen niet of dat vierhonderd losse hikjes waren
of drie lange middagen.

*Besluit:* aaneengesloten afwijkingen worden samengevoegd tot episodes, met de
reden die de arbiter zelf opgaf en wat het oude systeem er op dat moment over
zei. Daarboven een tijdlijn van één teken per kwartier, want patronen zie je in
een plaatje en niet in een tabel.

## 13. Meten, en de beperkingen erbij vermelden

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

Om de bufferband van de zolder te onderbouwen zou een thermisch model helpen.

*Afgewezen:* dat is over-fitten op één woning, en dit moet een product worden.

*Gevolg:* `bufferBandC` is een knop op ervaring, en dat staat ook zo in de
documentatie in plaats van dat het voor gemeten doorgaat. De sweep die we bouwden
kan de vraag niet beantwoorden — in open lus is het effect van de band per
definitie onzichtbaar — en dat is een uitkomst, geen mislukking.

## 15. Schaduwmodus schrijft niet, structureel

`HaClient` wordt zonder `allowWrites` aangemaakt, en `callService` werpt dán al
voordat er iets de socket op gaat.

*Reden:* dit is geen afspraak maar een grens. De code kijkt mee bij de
verwarming van een bewoond huis. Een test draait een volledige sessie tegen een
nagebootste Home Assistant en controleert dat er geen enkele `call_service`
aankomt.

## 16. Filteren op wat ons aangaat

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

Een dienst die maanden draait faalt zelden met een knal; hij blijft hangen. Een
websocket die dood is zonder dat de sluiting doorkwam, en het proces leeft
verder terwijl de opname stilstaat — dat merk je pas als je de dataset opent.

*Besluit:* geen besluit meer in tien minuten betekent afsluiten met een
foutcode, waarna `restart: unless-stopped` het oppakt.

## 19. Het uitrolscript weet wat er draait

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

*Reden:* anders kan een `git pull` het script wijzigen terwijl het draait.

*Kosten:* een nieuwe versie moet je zelf overnemen. Het script meldt wanneer dat
aan de orde is.

## 21. De configuratie blijft buiten git op de NAS

`config/sites/*.json` staat wél in de repository, maar wordt op de NAS niet
automatisch overgezet.

*Reden:* de configuratie hoort bij de installatie, niet bij de code. Dat is
meteen de vorm die nodig is zodra er een tweede huis bij komt.

*Kosten:* handwerk bij een wijziging. Het uitrolscript meldt wanneer de versie in
git afwijkt van wat er draait.

## 22. De Taakplanner is een andere omgeving dan een shell

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

## Wat nog een besluit wacht

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
- **De weergave kent geen authenticatie.** Zie besluit 23. Verdedigbaar op een
  thuisnetwerk, onhoudbaar zodra dit bij iemand anders draait. Fase 6c.
- **De terugblik spreekt over "het oude systeem".** Voor een woning zonder
  YAML-voorganger vergelijkt de schaduwmodus de arbiter met wat de thermostaten
  uit zichzelf deden (besluit 28). Dezelfde machinerie, andere vraag, verkeerde
  woorden. Uit te zoeken bij 6c.
- **De dagdoelen van de datasetmeter zijn op dit huis geijkt** — dertig
  winterdagen, en de seizoenen van Nederland. Zie besluit 27.
- **De terugblik rekent alles opnieuw door.** Elk kwartier de hele opname, ook
  het deel dat niet meer verandert. Dat is nu 120 ms en over een winter een
  seconde of vier; pas als dat gaat knellen is een tussenstand per dag de
  moeite. Nu zou het een cache zijn die kan verlopen zonder dat iemand het
  merkt — en dat is precies wat besluit 11 wilde vermijden.
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
