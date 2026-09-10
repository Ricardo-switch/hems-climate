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

| Fase | Wat | Status |
| --- | --- | --- |
| 0 | Brondata herstellen en de state machine vastleggen | **klaar** |
| 1 | Pure kern + replay-harness op eigen historie | **klaar** |
| 2 | HA-adapter in schaduwmodus | **klaar**, draait op de NAS |
| 3 | Configuratie als data | **klaar** |
| 4 | Divergentietool | **klaar**, wacht op winterdata |
| 5 | Read-only webweergave | **klaar** |
| 6 | Bindingen uit de configuratie, en onboarding | **bezig** |
| 7 | Vooruitkijken: PV-prognose, weer, dynamische tarieven | later |
| 8 | Het bewonersdashboard, als eigen applicatie | later |

De eerdere nummering is hier samengevoegd: configuratie als data en de
divergentietool bleken beide voorwaarden voor de frontend, niet erna.

### Fase 6, uitgesplitst

Fase 6 heette "onboarding voor andermans huis", maar dat bleek de laatste stap
en niet de eerste. Ervoor liggen twee dingen die dit huis vandaag al raken:

| | Wat | Waarom nu |
| --- | --- | --- |
| 6a | `mapping.ts` leest de bindingen uit `SiteConfig` — **klaar** | De configuratie en de code bevatten nu dezelfde vijf tabellen, met de hand gelijkgehouden. Niets bewaakt dat. |
| 6b | Timers, standby-afspraak, modusbron en legacy-helpers naar de configuratie — **klaar** | Wat in code staat kan niet per woning verschillen — en de modusbron was de oorzaak van de 151 minuten uit besluit 8b. |
| 6c | De add-on: dezelfde dienst in de vorm die HA verwacht | **klaar** — Supervisor-token, Ingress, opties. Zie besluit 36. |
| 6d | De onboarding-wizard zelf | Pas zinvol als 6a t/m 6c staan; anders is elke tweede woning een codewijziging. |

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

Nog niet aangetoond: of de arbiter het in de praktijk beter doet. Daarvoor is
winterdata nodig, en dat is precies wat er nu wordt opgebouwd.

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

## 7. Waarom het zo is

Dit document beschrijft de huidige stand. Waaróm er zo gekozen is — welke
alternatieven zijn afgevallen en wat een besluit heeft gekost — staat in
[DECISIONS.md](DECISIONS.md). Dat is het document dat je over een half jaar
nodig hebt, want de code vertelt het wat en niet het waarom.

## 8. Volgende stap

Fase 6a en 6b, plus de buitentemperatuur uit fase 7. Alle drie om dezelfde
reden: ze raken de kwaliteit van de winterdataset die nu wordt opgebouwd, en die
kun je niet met terugwerkende kracht repareren.

Daarna 6c (de wizard) of fase 7 (vooruitkijken). Die volgorde is nog niet
bepaald; fase 8 — het bewonersdashboard — komt daar hoe dan ook na.

De winterdataset is sinds 9 september 2026 gebaseerd op een vertaling die de
handmatige stand kent (besluit 8b); alles daarvóór niet. Vanaf de uitrol van
fase 6a/6b staat ook de buitentemperatuur erin.
