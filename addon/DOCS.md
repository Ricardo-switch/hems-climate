# SunArc

Klimaat en zon in één app. SunArc tekent je huis uit wat Home Assistant
al weet, kijkt mee met je verwarming, airco's en zonnepanelen, en zegt bij elk
besluit waarom. Lampen, scènes en schermen bedien je vanuit de app.

**Wat het nu doet:** SunArc kijkt mee. Het beslist wat het huis zou doen
en legt dat vast, maar schakelt je verwarming en airco's nog niet. Echt regelen
komt pas na een winter meekijken. Wel kun je een airco of thermostaat zelf
**met de hand** zetten, met een eindtijd, en start SunArc witgoed dat op zon
wacht.

## Wat je nodig hebt

- Home Assistant OS of Supervised, op een Raspberry Pi 4 of 5 of een pc
  (64 bit).
- Je apparaten al in Home Assistant: thermostaat, airco's, en het liefst een
  slimme meter (P1) en je omvormer. Hoe meer Home Assistant weet, hoe meer
  SunArc laat zien. Zonder meter of panelen werkt de app ook, met minder
  cijfers.
- Alles blijft in je eigen huis. Alleen het weerbericht wordt opgehaald.

## Beginnen

1. **Installeren** en **Starten**, en zet **In zijbalk tonen** aan.
2. Open **SunArc** in de zijbalk. Je huis staat er al: de etages, kamers
   en apparaten uit Home Assistant.
3. Wil je eerst rondkijken? Kies **Eerst rondkijken in een voorbeeldhuis**.
   Dat is een verzonnen huis met alles erin, met een dag om door te spelen
   (schuif de tijd, zomer of winter, of speel de dag af). Elke knop werkt
   daar, maar alleen in het voorbeeld: je eigen huis merkt er niets van.
4. Kies **Richt je huis in**. In acht korte hoofdstukken kijk je na wat
   SunArc vond: je huis, buiten, wie er woont, klimaat, energie (zekering,
   panelen, prijzen), gemak, je schermen, en klaar. Reken op ongeveer tien
   minuten. Wat je overslaat, staat daarna bij **Instellingen › Mist nog**;
   de app werkt al.

## Wat je ziet

- **Thuis:** je huis als tekening, met wat er nu gebeurt.
- **Vandaag:** de zon, het weer en wat er draait, van uur tot uur.
- **Te doen:** je lijsten, en wat er gepland staat of met de hand loopt.
- **Apparaten:** elk apparaat met zijn stand. Een tik opent zijn blad:
  warmer of koeler, hoe lang, en bij witgoed hoe laat het klaar moet zijn.
- **Opbrengst:** wat je panelen opleverden en wat je stroom kostte.
- **Assistent:** vraag het huis wat er gebeurt, en waarom.

Het vraagteken bovenin start een korte rondleiding.

## Op je telefoon en aan de wand

Open SunArc in de app van Home Assistant, via de zijbalk. Je logt in met
je eigen account; elke bewoner heeft zo zijn eigen comfort, kaarten en
agenda's. Een tablet aan de wand richt je in bij **Je schermen**.

De app is er in het Nederlands en het Engels. **Automatisch** volgt de taal
van je telefoon of browser.

## "Hé huis"

SunArc zet bij de eerste start het wekwoord **Hé huis** klaar. Om met je
stem te praten heb je in Home Assistant de add-ons Whisper, Piper en
openWakeWord nodig, en een spraakassistent. In de app helpt **Instellingen ›
Assistent › Stem en luisteren** je daarbij.

## Assist van Home Assistant

Wil je ook via Assist vragen stellen ("waarom draait de zolder?"), zet dan de
integratie SunArc erbij: in de app bij **Instellingen › Bewoners en
toegang › Sleutel voor de assistent**, met één knop. Herstart daarna Home
Assistant en kies **Toevoegen** bij "Nieuw apparaat gevonden".

Iets op je lijst zetten ("zet melk op de boodschappenlijst") doet de
assistent van SunArc in de app. Via Assist gaat dat het best met de eigen
lijsten van Home Assistant: zet in je spraakassistent **Opdrachten bij
voorkeur lokaal afhandelen** aan.

## Instellingen van de add-on

- **Lampen, scènes en schermen bedienen**: aan is bedienen vanuit de app, uit
  is alleen kijken.
- **Adres van Home Assistant op je telefoon**: alleen voor SunArc als
  losse app via Tailscale. Laat het anders leeg.
- De drie technische getallen staan onder "ongebruikte opties". Leeg laten is
  goed.

## Als iets niet werkt

- **De app blijft leeg of zegt dat hij wacht op Home Assistant:** kijk bij
  het tabblad **Logboek** van de add-on. Daar staat in gewone woorden wat er
  mist. Herstarten van de add-on helpt vaak na een update van Home
  Assistant.
- **Een apparaat ontbreekt of staat in de verkeerde kamer:** zet het in Home
  Assistant in de goede ruimte, of pas het aan bij **Richt je huis in › Je
  huis**.
- **Een vraag of een fout:** meld hem op
  [GitHub](https://github.com/Ricardo-switch/SunARC-HA-APP/issues), het
  liefst met wat er in het logboek staat.

Een nieuwe versie zie je bij de add-ons van Home Assistant. In de app staat
daarna wat er nieuw is.

## Rechten, en waarom

Home Assistant toont bij een add-on welke rechten hij vraagt. SunArc vraagt
er zo weinig mogelijk (beveiligingscijfer 8, het hoogste):

- **Ingress:** de app zit achter de inlog van Home Assistant. De eigen poort
  voor Tailscale staat dicht tot je hem zelf opent.
- **Toegang tot Home Assistant:** om je huis te lezen. Home Assistant kent
  geen variant die alleen leest. SunArc schrijft alleen via smalle deuren:
  lampen, scènes, schermen, meldingen, je lijsten, de startknop van witgoed
  dat op zon wacht, en het klimaat met de hand,
  altijd met een eindtijd. De regeling zelf schrijft niets tot het echte
  regelen begint.
- **De configuratie van Home Assistant (schrijven):** alleen voor de
  integratie SunArc, na jouw tik, in `custom_components/smart_climate`.
- **`share` (schrijven):** het beslislogboek in `/share/hems`, en het
  wekwoord in `/share/openwakeword`.
- **Een eigen AppArmor-profiel:** de dienst mag alleen in deze mappen
  schrijven. Het staat nog in de leerstand: het meldt wat erbuiten valt en
  houdt nog niets tegen.

De add-on staat als **experimenteel**: SunArc kijkt mee en regelt je
verwarming en airco's nog niet zelf.

## In English

SunArc shows your home, climate and solar in one app, built from what Home
Assistant already knows, and explains every decision. For now it watches
along: it decides what the house would do but does not yet switch your
heating or air conditioning (you can set them by hand, with an end time).

1. **Install**, **Start**, and turn on **Show in sidebar**.
2. Open **SunArc** from the sidebar. Want to look around first? Choose
   **Look around an example home**: every button works there, only in the
   example.
3. Choose **Set up your home**: eight short chapters, about ten minutes.

The app speaks Dutch and English; **Automatic** follows your phone or
browser. Questions or bugs:
[GitHub](https://github.com/Ricardo-switch/SunARC-HA-APP/issues).

Meer: [github.com/Ricardo-switch/SunARC-HA-APP](https://github.com/Ricardo-switch/SunARC-HA-APP).
