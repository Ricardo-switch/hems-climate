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

---

## Wat nog een besluit wacht

- **Buitentemperatuur.** `sensor.temperatuur` wordt nergens gebruikt en niet
  vastgelegd in het beslislogboek. Voor de huidige strategieën is dat terecht,
  maar fase 7 heeft hem nodig — en de winterdataset legt hem nu niet vast.
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
  thuisnetwerk, onhoudbaar zodra dit bij iemand anders draait. Fase 6.
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
