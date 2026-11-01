# SunArc

Klimaat en zon in één app. SunArc tekent je huis uit wat Home Assistant
al weet, kijkt mee met je verwarming, airco's en zonnepanelen, en zegt bij elk
besluit waarom. Lampen, scènes en schermen bedien je vanuit de app.

**Wat het nu doet:** SunArc kijkt mee. Het beslist wat het huis zou doen
en legt dat vast, maar schakelt je verwarming en airco's nog niet. Echt regelen
komt pas na een winter meekijken.

## Beginnen

1. **Starten**, en zet **In zijbalk tonen** aan.
2. Open **SunArc** in de zijbalk. Je huis staat er al: de etages, kamers
   en apparaten uit Home Assistant.
3. Kies **Richt je huis in**. In acht korte hoofdstukken kijk je na wat Smart
   Climate vond: de kamers, wat er verwarmt en koelt, je panelen, je prijzen.
   Wat je overslaat, staat daarna bij **Instellingen › Mist nog**. Reken op
   ongeveer tien minuten.

Alles blijft in je eigen huis. Alleen het weerbericht wordt opgehaald.

## Op je telefoon

Open SunArc in de app van Home Assistant, via de zijbalk. Je logt in met
je eigen account; elke bewoner heeft zo zijn eigen comfort, kaarten en
agenda's.

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

## Instellingen van de add-on

- **Lampen, scènes en schermen bedienen**: aan is bedienen vanuit de app, uit
  is alleen kijken.
- **Adres van Home Assistant op je telefoon**: alleen voor SunArc als
  losse app via Tailscale. Laat het anders leeg.
- De drie technische getallen staan onder "ongebruikte opties". Leeg laten is
  goed.

## Rechten, en waarom

Home Assistant toont bij een add-on welke rechten hij vraagt. SunArc vraagt
er zo weinig mogelijk (beveiligingscijfer 8, het hoogste):

- **Ingress:** de app zit achter de inlog van Home Assistant. De eigen poort
  voor Tailscale staat dicht tot je hem zelf opent.
- **Toegang tot Home Assistant:** om je huis te lezen. Home Assistant kent
  geen variant die alleen leest. SunArc schrijft alleen via smalle deuren:
  lampen, scènes, schermen, meldingen, je lijsten, en het klimaat met de hand,
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

Meer: [github.com/Ricardo-switch/hems-climate](https://github.com/Ricardo-switch/hems-climate).
