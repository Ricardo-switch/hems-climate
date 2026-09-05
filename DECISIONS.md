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

---

## Wat nog een besluit wacht

- **Buitentemperatuur.** `sensor.temperatuur` wordt nergens gebruikt en niet
  vastgelegd in het beslislogboek. Voor de huidige strategieën is dat terecht,
  maar fase 7 heeft hem nodig — en de winterdataset legt hem nu niet vast.
- **`bufferBandC`** staat op 1,0 zonder onderbouwing. Zie besluit 14.
- **Heat-assist** mist de startvertraging niet meer, maar is nooit in de praktijk
  afgegaan: de Nest rapporteerde in het augustusvenster nooit `heating`.
