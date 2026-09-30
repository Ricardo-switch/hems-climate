# Project: Smart Climate OS (met HEMS-roadmap)

*Bijgewerkt 5 september 2026.*

## 1. De visie

Een onafhankelijk, voorspellend besturingssysteem voor autonoom klimaatbeheer,
dat later doorgroeit naar een volwaardig Home Energy Management System. Home
Assistant is uitsluitend de hardwarelaag; de logica, de voorspelling en de
interface draaien in een losse Node.js-stack.

Die visie staat nog steeds. Wat er sinds de eerste versie van dit document bij
is gekomen, is het inzicht dat **de moeilijkheid niet in de regellogica zit maar
in het aantoonbaar maken ervan**. Het YAML-systeem dat we vervangen werkte
grotendeels; wat ontbrak was de mogelijkheid om te zien of het klopte. Vier van
de zes fouten die we vonden waren jarenlang onzichtbaar geweest.

## 2. De architectuur

**Kern (`backend/src/core`).** Eén pure functie:

```ts
decide(state, config, now) -> Decision
```

Geen I/O, geen klok, geen netwerk. Gelijke invoer geeft gelijke uitvoer. Timers
zijn invoer en komen als commando terug. Dat is wat de replay-harness en de
divergentietool mogelijk maakt.

De kern kent geen entity-ID's, geen kamernamen en geen bewonersnamen. Een zone
heeft een temperatuurbron, actuatoren, setpoints per modus en een prioriteit;
een actuator heeft capaciteiten, vermogen en timing. Wat huisspecifiek is, staat
in configuratie.

**Het vermogensbudget.** Strategieën stellen voor, een arbiter beslist. Elk
voorstel draagt een `budgetW`; het overschot is een pot die leegloopt. Een
draaiend apparaat rekent zijn gemeten opname, een stilstaand apparaat zijn
schatting — zo kost bijschakelen alleen het verschil. Dit verving de vlag
`zolder_started_now` uit de YAML-versie, die daar door een scopingfout niet
werkte. Die vlag is in de draaiende installatie inmiddels met een losse helper
gerepareerd; het budget vervangt hem alsnog, omdat het de vórm wegneemt die de
fout mogelijk maakte (DECISIONS.md, besluit 1 en 3).

**Adapterlaag (`backend/src/adapters/homeassistant`).** WebSocket-client,
schaduwmodus, en één gedeelde vertaling van HA naar het domeinmodel die zowel de
live-adapter als de replay-harness gebruiken. Twee losse vertalingen zouden
uiteenlopen, en dat is precies de bugklasse waar dit project vandaan komt.

**Configuratie als data (`config/sites/*.json`).** Gevalideerd bij het opstarten,
met controle op samenhang: verwijst een zone naar een apparaat dat niet bestaat,
eisen twee zones hetzelfde apparaat op, is een doeltemperatuur onbereikbaar. De
parser stopt niet bij de eerste fout maar levert de hele lijst met pad.

**Twee applicaties, niet één.** Wat hier staat is de *machinekamer*: de kern, de
schaduwmodus, de harnassen en een technische monitor. Het dashboard waar een
bewoner naar kijkt wordt een aparte applicatie (fase 8), met een eigen
ontwerptaal en een eigen tempo. Ze delen één ding: het `Explanation`-contract.
Zie besluit 29.

**De schaduwmodus blijft, ook na de overstap.** Hij is geen steiger die je
afbreekt zodra het gebouw staat, maar het instrument waarmee elke volgende
woning begint: eerst een tijd meekijken en een gedragsbasislijn opbouwen, dan
pas sturen. Zie besluit 28.

**Weergave (`frontend/`).** Read-only. Eén HTML-pagina, vanilla JS, Tailwind die
lokaal wordt gebouwd tot ~10 kB CSS — geen framework, geen CDN. Ze leest
`Explanation` en herberekent niets: elk getal en elke reden komt uit het besluit
van de kern, en het enige wat hier gebeurt is vertalen naar Nederlands.

De schaduwdienst serveert haar zelf, over `/api/state` (de stand nu),
`/api/events` (een SSE-stroom van elk volgend besluit) en `/api/divergence` (de
terugblik over de logboeken). Read-only is een grens: alles wat geen GET of HEAD
is krijgt 405 vóór de routering. Zie besluit 23.

Die terugblik draait dezelfde `analyse()` als `npm run divergence` in de
terminal — één analyse, twee vensters — elk kwartier, met de uitkomst in het
geheugen. Zie besluit 26.

De pagina heeft twee tabbladen, **Nu** en **Terugblik**, met daarboven een
datasetmeter die altijd zichtbaar blijft: dagen per seizoen tegen een doel, en
welke modi, strategieën en richtingen ooit zijn afgegaan. Die checklist komt uit
de gesloten unions van de kern, dus een nieuwe modus verschijnt er vanzelf in.
Zie besluit 27.

## 3. Ontwerpprincipes

De oorspronkelijke drie staan overeind. Wat we er in de praktijk bij hebben
geleerd:

- **Geen logica in de frontend.** Het oude dashboard bevatte ~500 regels JS die
  de state machine dupliceerden. Die zijn de bron van divergentie.
- **Afwezigheid van vraag is niet de taak van een strategie.** Strategieën
  drukken vraag uit; de arbiter regelt het afbouwen, omdat alleen die weet wat
  een apparaat nú doet.
- **Tijd is invoer.** Zowel in de kern als in de laag eromheen. Een test die
  afhangt van het uur waarop hij draait, toetst niets.
- **Een fout hoort luid te falen, niet stil terug te vallen.** Een setpoint
  buiten bereik wordt afgewezen, niet begrensd.
- **Wat je niet kunt meten, weet je niet.** Elke bewering over besparing in dit
  project komt uit een harness, met de beperkingen erbij vermeld.

## 4. Roadmap

### Het fundament

| Fase | Wat | Status |
| --- | --- | --- |
| 0 | Brondata herstellen en de state machine vastleggen | **klaar** |
| 1 | Pure kern + replay-harness op eigen historie | **klaar** |
| 2 | HA-adapter in schaduwmodus | **klaar**, draait op de NAS |
| 3 | Configuratie als data | **klaar** |
| 4 | Divergentietool | **klaar**, wacht op winterdata |
| 5 | Read-only webweergave | **klaar**, met exportknop (besluit 48) |
| 6 | Bindingen uit de configuratie, add-on en onboarding | **klaar** |

De eerdere nummering is hier samengevoegd: configuratie als data en de
divergentietool bleken beide voorwaarden voor de frontend, niet erna.

### De weg vooruit

Na fase 6 bleek de oude nummering niet meer te kloppen met het werk. Er kwamen
stappen bij die er niet in stonden — echt schakelen, de assistent — en fase 7
bleek twee dingen die op elkaar wachten. De stappen hieronder hebben daarom
letters. "Fase 7" en "fase 8" blijven bestaan onder hun oude naam, want zo
staan ze in `DECISIONS.md` en in de code.

| | Wat | Waarom | Kan beginnen |
| --- | --- | --- | --- |
| **A** | **De schaduw eerlijk.** Eigen apparaatstand (besluit 49 en 49b, **klaar**), comfortplafond (besluit 50, **klaar**), startdrempel (besluit 51, **klaar**), de ruwe historie zelf vastleggen in plaats van op de recorder te vertrouwen (besluit 52, **klaar**) | Zonder dit meet de schaduw de verkeerde dingen, of gaat data verloren | **klaar** |
| **B** | **Echt schakelen.** De actuator-laag aan, eerst voor één apparaat. Een eigen stand die een herstart overleeft (`OwnState` heeft nog geen opslag), een weg terug naar het oude systeem, en de schaduwvergelijking die doorloopt | Het moment waarop het oude systeem uit kan | na A |
| **C** | **Universeel.** Een bewuste tabel met standaardwaarden, een inlog op de weergave (besluit 23), een terugblik die niet uitgaat van "het oude systeem" (besluit 28), een datasetmeter die niet op dit huis geijkt is (besluit 27) | Voorwaarde voor een tweede woning | los van B |
| **D** | **Het thermisch model** — de eerste helft van fase 7. Leert per zone hoe snel ze opwarmt en afkoelt en wat de zon doet. Voorverwarmen wordt uitgerekend in plaats van een vast uur, en de replay rekent eindelijk ook de temperatuur door | Het lerende deel (besluit 46), en de enige manier om comfortwinst te meten | na een winter: voorjaar 2027 |
| **E** | **Vooruitkijken** — de tweede helft van fase 7. PV-prognose, weer, dynamische tarieven: plannen over uren in plaats van per moment | Van reageren naar optimaliseren | na D |
| **F** | **Het bewonersdashboard** — fase 8. Live stroom en klimaat in mensentaal, zonder entity-ID's (besluit 45) | Wat een bewoner ziet | na B, beter na D |
| **G** | **De assistent** (besluit 44). Vragen in taal of met spraak, lokaal. Een vierde voorsteller, geen baas | Het gesprek met het huis | na F |
| **H** | **Product** (besluit 34). Meerdere woningen, updates op afstand, ondersteuning | Van dit huis naar andere huizen | na C en F |

Twee dingen bepalen het tempo. **D is aan het seizoen gebonden**: een winter
laat zich niet versnellen, en elke winterdag die nu wordt opgenomen is er één
die later niet opnieuw hoeft. **B is het moment van overdracht**: alles vóór B
mag mislukken zonder dat iemand het koud krijgt, alles erna niet.

### Fase 6, uitgesplitst

Fase 6 heette "onboarding voor andermans huis", maar dat bleek de laatste stap
en niet de eerste. Ervoor liggen twee dingen die dit huis vandaag al raken:

| | Wat | Waarom nu |
| --- | --- | --- |
| 6a | `mapping.ts` leest de bindingen uit `SiteConfig` — **klaar** | De configuratie en de code bevatten nu dezelfde vijf tabellen, met de hand gelijkgehouden. Niets bewaakt dat. |
| 6b | Timers, standby-afspraak, modusbron en legacy-helpers naar de configuratie — **klaar** | Wat in code staat kan niet per woning verschillen — en de modusbron was de oorzaak van de 151 minuten uit besluit 8b. |
| 6c | De add-on: dezelfde dienst in de vorm die HA verwacht | **klaar** — Supervisor-token, Ingress, opties. Zie besluit 36. |
| 6d | De onboarding: ontdekking uit de HA-registers en een wizard in de weergave | **klaar** — stelt voor en besluit niet (besluit 41), schrijft alleen achter Ingress (besluit 42). |

**Buitentemperatuur is naar voren gehaald.** `sensor.temperatuur` stond in fase 7
en wordt nu meteen vastgelegd. Reden: elke winterdag die zonder hem wordt
opgenomen is een winterdag die je voor fase 7 opnieuw moet doen. De regeling
gebruikt hem nog niet; hij gaat alleen mee het logboek in. Zie besluit 30.

## 5. Waar we nu staan

De schaduwmodus draait onbewaakt op de Synology, verbonden met Home Assistant,
en schrijft elk besluit weg. Hij schakelt niets: `HaClient` werpt bij elke
`callService` zolang schrijven uit staat, en een test bewijst dat er in een
volledige sessie geen enkele dienst wordt aangeroepen.

Wat gemeten is op tien dagen eigen historie:

- 91,7% van alle HA-events gaat ons niet aan en wordt genegeerd; de slimme meter
  is 88% van wat overblijft, vandaar een ondergrens van 15 seconden tussen
  evaluaties
- 15 uur waarin het oude systeem een airco liet draaien terwijl het huis
  netstroom kocht, goed voor 3,73 kWh
- het beslislogboek is ~1 MB per dag

Wat de eerste maand schaduw liet zien (26 dagen, 209.995 momenten, tot 30
september 2026):

- de arbiter is het 95,4% (woonkamer) en 93,2% (zolder) van de tijd eens met het
  oude systeem, zonder gaten in de opname
- de draaitijden bleken in de schaduwmodus zonder werk: ze lazen de
  geschiedenis van het echte apparaat, en dat bewoog niet. Sinds besluit 49 meet
  de schaduw zijn eigen schakelingen, en valt geen enkele rit meer onder de
  ingestelde ondergrens — tegen 21–57% daarvoor
- er bestond geen comfortpad voor koelen; de woonkamer zat 96,6% van de tijd
  boven zijn doel. Sinds besluit 50 geldt een plafond van 26 °C
- de netstroom die de draaitijd kost, is na de correcties van besluit 49b
  ongeveer 2 kWh per tien dagen. Een eerste meting gaf 22 kWh, maar dat bleek
  een fout in de schaduw zelf: het budget rekende met een ander huis dan de
  meter, en in handmatig bleef een veronderstelde airco "koelen"
- de ingestelde startdrempel van 1000 W werd door niets afgedwongen; sinds
  besluit 51 wel

Nog niet aangetoond: of de arbiter het in de praktijk beter doet, en hoeveel
koeler of warmer het huis ervan wordt. Het eerste vraagt winterdata, het tweede
het thermisch model — en die winterdata wordt nu opgebouwd.

## 6. Repository en infrastructuur

Monorepo op `github.com/Ricardo-switch/hems-climate` (privé).

```
backend/        Node.js: kern, adapters, replay, divergentie, webserver
frontend/       De read-only weergave; bouwt naar backend/web
addon/          De Home Assistant-add-on: manifest, Dockerfile, opstartscript
config/sites/   Configuratie per installatie
deploy/         Dockerfile-omgeving, compose, uitrolscript
ha-fixes/       Reparaties aan het YAML-systeem, klaar om over te nemen
legacy_code/    Het YAML-systeem dat vervangen wordt
HA export/      Referentie: helpers, entity-register, dashboards
```

**Bouwen.** De Dockerfile heeft sinds fase 5 drie fasen: de weergave, de
backend, en de draaifase die alleen `dist` en `web` overhoudt. De bouwcontext is
daarom de projectwortel en niet `backend/` — met de `.dockerignore` die daarbij
hoort in de wortel, want Docker leest die naast de context.

**Uitrol.** De NAS haalt de code uit git via `deploy/deploy.sh`, ingepland in de
Synology Taakplanner. Het script bouwt alleen wanneer er iets in `backend/`
wijzigde, bouwt éérst en wisselt pas daarna om, en houdt in `.deployed` bij welke
commit er werkelijk draait — anders wordt een mislukte uitrol nooit opnieuw
geprobeerd.

**De Taakplanner is een andere omgeving dan een shell.** Dat heeft dit project
vier keer laten struikelen, en het is de moeite waard om te onthouden:

1. Geen `PATH` naar docker en git — die worden expliciet gezocht.
2. Geen `HOME=/root` — de SSH-sleutel wordt expliciet meegegeven.
3. Aangeroepen als `sh script`, waardoor bash in POSIX-modus draait en een deel
   van de syntaxis wegvalt — het script start zichzelf opnieuw met een echte
   bash.
4. Regeleindes — `.gitattributes` legt LF vast voor alles wat op Linux draait.

Toets een wijziging in het uitrolscript altijd via *Uitvoeren* in de Taakplanner,
niet vanaf de commandoregel. Alleen zo draai je in dezelfde omgeving.

**Wat buiten git blijft:** het HA-token (`.env`), de logboeken, en
`config/sites/*.json` op de NAS. Dat laatste hoort bij de installatie, niet bij
de code — en het is meteen de vorm die nodig is zodra er een tweede huis bij komt.
Het uitrolscript zet de configuratie dus níet over; het meldt alleen dat hij van
git verschilt. Een configuratiewijziging (zoals het comfortplafond) is pas
actief nadat je hem zelf naar `$ROOT/config/sites/` kopieert.

**De replay-data legt de dienst zelf vast** (besluit 52): elke gevolgde
wijziging in `history-JJJJ-MM-DD.ndjson` naast het beslislogboek, ongeveer 2 MB
per dag. `backend/tools/stitch-history.ts` maakt er een replay-dataset van; de
exportknop neemt hem mee. Daarvóór kwam de replay-data uit de recorder van Home
Assistant, en die ruimt op: op de standaard van tien dagen was half september
al weg voordat hij werd geëxporteerd. De recorder bewaart sinds 30 september
2026 zestig dagen en blijft het vangnet voor gaten, via
`backend/tools/export-history.ts`.

## 7. Waarom het zo is

Dit document beschrijft de huidige stand. Waaróm er zo gekozen is — welke
alternatieven zijn afgevallen en wat een besluit heeft gekost — staat in
[DECISIONS.md](DECISIONS.md). Dat is het document dat je over een half jaar
nodig hebt, want de code vertelt het wat en niet het waarom.

## 8. Volgende stap

Stap A is klaar. Eerst pushen — de NAS haalt `main` elke vijf minuten zelf op —
zodat de winterdataset vanaf nu
met de eerlijke schaduw én met de ruwe historie wordt opgebouwd. Daarna B —
echt schakelen — met één apparaat.

C kan ernaast, maar is pas nodig bij een tweede woning. D wacht op de winter.

De winterdataset is sinds 9 september 2026 gebaseerd op een vertaling die de
handmatige stand kent (besluit 8b); alles daarvóór niet. De buitentemperatuur
staat erin sinds de uitrol van fase 6a/6b, de opbrengst van de panelen sinds
besluit 47. Beslissingen van de schaduw volgen besluit 49 tot en met 52 pas
vanaf het moment dat die op de NAS zijn uitgerold — en voor besluit 50 ook de
configuratie gekopieerd.
