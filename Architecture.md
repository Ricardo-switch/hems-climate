# Project: Smart Climate OS (met HEMS-roadmap)

*Bijgewerkt 1 oktober 2026.*

Dit document is de kaart van hoe het nu is: welke onderdelen er zijn, hoe een
besluit tot stand komt, en waar wat draait. Het waarom — welke alternatieven
afvielen en wat een keuze kostte — staat in [DECISIONS.md](DECISIONS.md), en
daar verwijst deze kaart naar.

**Afspraak:** elke commit die de structuur of de werking verandert, werkt deze
kaart in dezelfde commit bij. Een machine kan proza niet op juistheid
controleren; daarom is dit een afspraak en geen test. Het besluitenlog heeft wel
een test (besluit 54 en de index).

**Taal:** namen in de code zijn Engels, al het andere is Nederlands, ook dit
document. Sleutels in bestanden en in de API blijven zoals ze zijn, omdat oude
logboeken leesbaar moeten blijven (besluit 59).

## 1. De visie

Een onafhankelijk, voorspellend besturingssysteem voor autonoom klimaatbeheer,
dat later doorgroeit naar een volwaardig Home Energy Management System. Home
Assistant is uitsluitend de hardwarelaag; de logica, de voorspelling en de
interface draaien in een losse Node.js-stack.

Wat er sinds de eerste versie bij is gekomen, is het inzicht dat **de
moeilijkheid niet in de regellogica zit maar in het aantoonbaar maken ervan**.
Het YAML-systeem dat we vervangen werkte grotendeels; wat ontbrak was de
mogelijkheid om te zien of het klopte. En dezelfde soort fout — iets wat er
staat en niets doet — kwam in dit project zelf ook terug, tot een machine er
systematisch naar ging kijken (besluit 54).

## 2. Hoe een besluit tot stand komt

```
Home Assistant ──websocket──▶ EntityStore ──▶ buildSystemState ──▶ decide()
   (alleen lezen)             (filter, 16)     (vertaling, één)      (pure kern)
                                                     ▲                    │
                          OwnState (modus, timers) ──┤                    ▼
                 ShadowActuators (eigen stand, 49) ──┘              Decision
                                                                         │
                ┌─────────────────────┬──────────────────────┬──────────┘
                ▼                     ▼                      ▼
         beslislogboek          weergave (SSE)        ShadowActuators.follow
      decisions-*.ndjson                              OwnState.apply
```

**De kern (`backend/src/core`).** Eén pure functie,
`decide({ config, state, strategies })`. Geen I/O, geen klok — de tijd zit in
de toestand — en geen netwerk. Gelijke invoer geeft gelijke uitvoer; een test
met duizenden gegenereerde toestanden bewaakt dat en een handvol andere regels
(besluit 56). De kern kent geen entity-ID's en geen kamernamen: wat
huisspecifiek is, staat in configuratie.

Drie strategieën stellen voor, één arbiter beslist (besluit 4):

- **comfort** houdt elke zone op het doel van de geldende modus, met het
  hoofdapparaat. Vraagt geen vermogensbudget: comfort sneuvelt niet omdat de zon
  niet schijnt. Waar geen hoofdapparaat kan koelen, verdedigt comfort een
  plafond — voor dit huis 26 °C — desnoods op netstroom (besluit 50).
- **pv-overschot** laadt het gebouw op met stroom die anders het net op gaat,
  binnen een bufferband voorbij het doel. Betaalt uit het budget.
- **heat-assist** laat de warmtepomp bijspringen als de ketel al een tijd stookt
  en de zone achterblijft.

De **arbiter** verdeelt een budget: overschot plus wat de bestuurde apparaten nu
werkelijk opnemen plus een kleine tolerantie (besluit 3, 49b). Hij toetst per
apparaat de minimale draai- en rusttijd, de stabilisatie na een start of een
parkeerbeurt (besluit 61), het settelen na een wissel, en of er genoeg marge is
om te *starten* in plaats van alleen door te draaien (besluit 51). Per
beslissing start hij hooguit één apparaat op het budget (besluit 68). Wat niemand meer wil, bouwt hij af: eerst
naar standby, na de stabilisatie uit (besluit 5).

Elk besluit draagt een **`Explanation`**: modus, budget, per zone temperatuur,
doel en vraag, plus buitentemperatuur en zonne-opbrengst als waarneming. Dat
contract delen het logboek, de weergave, de analyse en straks het
bewonersdashboard (besluit 29).

**De schaduwdienst (`backend/src/adapters/homeassistant`).** `HaClient`
verbindt met Home Assistant en weigert elke `callService` zolang schrijven uit
staat; `query()` kent alleen een lijst leesopdrachten (besluit 15). De
`EntityStore` volgt alleen de entiteiten uit de configuratie. Eén vertaling
(`mapping.ts`) maakt er een toestand van, voor de live dienst én de replay.
`ShadowRunner` beslist bij elke relevante wijziging en elke hartslag, met een
ondergrens tussen evaluaties en een bewaking die afsluit als hij vastloopt
(besluit 18).

Omdat de schaduw niet schakelt, houdt hij zelf bij wat hij gedaan zou hebben:

- **`OwnState`** — modus en timers, die de dienst bezit (besluit 39). Voor dit
  huis komt de stabilisatietimer hier vandaan en niet van het oude systeem
  (besluit 60).
- **`ShadowActuators`** — de stand die de arbiter de apparaten zou geven, zodat
  draaitijden en hysterese zijn eigen geschiedenis meten (besluit 49). Het
  budget rekent met wat de meter werkelijk zag, en zolang de bewoner stuurt laat
  de boekhouding los (besluit 49b).

**De opstart (`backend/src/startup.ts`).** Eén zuivere functie leidt uit de
omgeving af hoe de dienst draait: add-on of niet, de weergave, de schrijfdeur,
de tijden (besluit 55). `main.ts` voert het alleen uit.

**Configuratie als data (`config/sites/*.json`).** Gevalideerd bij het
opstarten, met samenhangscontroles; alleen wat echt niet kan ontbreken is een
fout, de rest valt veilig terug (besluit 40). De ontdekking stelt uit de
registers van Home Assistant een configuratie voor en besluit niet (besluit 41).
Een stiltetest eist dat elk veld ergens gelezen wordt of met een reden op een
lijst staat (besluit 54).

**De weergave (`frontend/`).** Eén pagina, vanilla JS, Tailwind lokaal gebouwd.
Ze leest `Explanation` en herberekent niets. De schaduwdienst serveert haar zelf:

| Route | Wat |
| --- | --- |
| `/api/state`, `/api/events` | het laatste besluit, en een stroom van elk volgend |
| `/api/divergence` | de terugblik over de logboeken, elk kwartier bijgewerkt vanaf de tussenstand (besluit 26, 63) |
| `/api/site` | namen en apparaten per zone, voor de weergave |
| `/api/health` | leeft hij, wanneer besliste hij, en welke versie (besluit 54) |
| `/api/export`, `/api/export/info` | de hele dataset als tar.gz (besluit 48) |
| `POST /api/onboarding` | de enige deur die schrijft, alleen achter Ingress (besluit 42) |

Alles wat geen GET of HEAD is, krijgt 405 vóór de routering — behalve die ene
deur, en die bestaat alleen als `startup.ts` hem opent.

**De data.** Naast elkaar in de logmap:

- `decisions-JJJJ-MM-DD.ndjson` — elk besluit; volledig als het verandert, kort
  als het gelijk blijft (besluit 11).
- `history-JJJJ-MM-DD.ndjson` — elke wijziging van de gevolgde entiteiten, de
  ruwe historie waarmee je later opnieuw kunt beslissen (besluit 52). Daarin ook
  wat alleen voor later wordt vastgelegd, zoals gas en ventilatie
  (`recordOnly`, besluit 65).
- Dagen ouder dan een week worden `.ndjson.gz` (besluit 58). Alle lezers gaan
  via `divergence/read.ts`, die beide vormen kent.
- `runs.ndjson` — één regel per start: welke commit en welke configuratie
  vanaf dan beslisten (besluit 66). Gaat mee in de export.
- `own-state.json` — de eigen stand van de dienst (modus, timers, de
  veronderstelde apparaatstand), zodat een herstart hem niet wist (besluit 62).
- `review-checkpoint.bin` — de tussenstand van de terugblik na de laatste
  afgesloten dag (besluit 63). Weggooien mag: dan rekent hij één keer alles
  opnieuw.

**De harnassen (`backend/src/replay`, `backend/src/divergence`).** De replay
speelt opgenomen historie minuut voor minuut af en vraagt wat de arbiter zou
doen; het is een schaduwvergelijking, geen gesloten simulatie, dus
temperatuurgevolgen zijn niet te zien. Eén dag staat als vaste test in git
(besluit 54). De divergentietool zet het logboek af tegen wat het oude systeem
deed.

**Twee applicaties, niet één.** Wat hier staat is de *machinekamer*. Het
dashboard voor een bewoner wordt een aparte applicatie (fase 8), met alleen het
`Explanation`-contract gemeen (besluit 29). **De schaduwmodus blijft** ook na de
overstap: hij is het instrument waarmee elke volgende woning begint (besluit 28).

## 3. Ontwerpprincipes

- **Geen logica in de frontend.** Het oude dashboard dupliceerde de state
  machine in ~500 regels JS; dat was een bron van divergentie.
- **Afwezigheid van vraag is niet de taak van een strategie.** Strategieën
  drukken vraag uit; de arbiter bouwt af, want alleen die weet wat een apparaat
  nú doet.
- **Tijd is invoer.** In de kern en in de laag eromheen. Een test die afhangt van
  het uur waarop hij draait, toetst niets; tests wachten op een voorwaarde, niet
  op de klok.
- **Een fout hoort luid te falen, niet stil terug te vallen.** Een setpoint
  buiten bereik wordt afgewezen, een hartslag van "30s" laat de dienst weigeren
  te starten.
- **Wat je niet kunt meten, weet je niet.** Elke bewering over besparing komt uit
  een harness, met de beperkingen erbij — en een kopgetal wordt eerst naar
  oorzaak uitgesplitst voordat het in het besluitenlog komt (besluit 49b).
- **Een machine kijkt mee.** Wat mis kan gaan, hoort een test te vinden, niet
  iemand die toevallig gaat kijken (besluit 54).

## 4. Roadmap

Fase 0 tot en met 6 zijn af: kern en replay, de schaduwmodus op de NAS,
configuratie als data, de divergentietool, de weergave met export, en de add-on
met onboarding. De nummering daarna volgt letters, omdat er stappen bij kwamen
die er niet in stonden; "fase 7" en "fase 8" houden hun naam, want zo staan ze
in het besluitenlog en in de code.

| | Wat | Waarom | Stand |
| --- | --- | --- | --- |
| **A** | **De schaduw eerlijk.** Eigen apparaatstand (49, 49b), comfortplafond (50), startdrempel (51), de ruwe historie zelf vastleggen (52) | Zonder dit meet de schaduw de verkeerde dingen, of gaat data verloren | **klaar** |
| — | **Het vangnet.** CI vóór de NAS, vaste replay, stiltetest, versie in health (54), opstart (55), invarianten (56), linter (57), compressie (58), index op het besluitenlog | Het kwaliteitsrapport van 30 september | **klaar** |
| **B** | **Echt schakelen.** De actuator-laag aan, eerst voor één apparaat. Vooraf: een weg terug, de add-on weer aan als plek om te regelen (53), en herkennen dat de bewoner zelf ingrijpt (74) | Het moment waarop het oude systeem uit kan | na een winter en alle functies (64); de weg terug een paar weken ervoor |
| **C** | **Universeel.** Elke opstelling werkt, ook met één airco, alleen koelen of een warmtepomp via SG-Ready (70); een bewuste tabel met standaardwaarden, een inlog op de weergave (23), een terugblik die niet uitgaat van "het oude systeem" (28), een datasetmeter die alleen telt wat het huis kan (27, 70) | Voorwaarde voor een tweede woning | los van B |
| **D** | **Het thermisch model** — de eerste helft van fase 7. Leert per zone hoe snel ze opwarmt en afkoelt en wat de zon doet; voorverwarmen wordt uitgerekend, en de replay rekent ook de temperatuur door | Het lerende deel (46), en de enige manier om comfortwinst te meten | na een winter: voorjaar 2027 |
| **E** | **Vooruitkijken** — de tweede helft van fase 7. PV-prognose, weer, dynamische tarieven | Van reageren naar optimaliseren | na D |
| **F** | **Het bewonersdashboard** — fase 8. Live stroom en klimaat in mensentaal, zonder entity-ID's (45), op de telefoon en op een tablet aan de muur. De schetsen in `design/app/` zijn de maatstaf (71); hoe het samenhangt staat in `design/app/ONTWERP.md`, met kamers en zones (72) en de drie fasen (73) | Wat een bewoner ziet | na B, beter na D |
| **G** | **De assistent** (44). Vragen in taal of met spraak, lokaal. Een vierde voorsteller, geen baas | Het gesprek met het huis | na F |
| **H** | **Product** (34). Meerdere woningen, updates op afstand, ondersteuning | Van dit huis naar andere huizen | na C en F |

Twee dingen bepalen het tempo. **D is aan het seizoen gebonden**: een winter
laat zich niet versnellen. **B is het moment van overdracht**: alles vóór B mag
mislukken zonder dat iemand het koud krijgt, alles erna niet.

## 5. Waar we nu staan

De schaduwmodus draait onbewaakt op de Synology, verbonden met Home Assistant op
de Pi, en schrijft elk besluit en elke wijziging weg. Hij schakelt niets.

Wat de eerste maand liet zien (26 dagen, ruim 210.000 momenten, tot 30
september 2026):

- de arbiter is het 95,4% (woonkamer) en 93,2% (zolder) van de tijd eens met het
  oude systeem, zonder gaten in de opname
- de draaitijden bewaakten in de schaduwmodus niets, omdat ze de geschiedenis
  van het echte apparaat lazen; sinds besluit 49 meten ze de eigen schakelingen
- er bestond geen comfortpad voor koelen; de woonkamer zat 96,6% van de tijd
  boven zijn doel. Sinds besluit 50 geldt een plafond van 26 °C
- de netstroom die de minimale draaitijd kost, is ongeveer 2 kWh per tien dagen
  (besluit 49b; een eerste meting van 22 kWh bleek een fout in de schaduw zelf)
- de ingestelde startdrempel van 1000 W werd door niets afgedwongen; sinds
  besluit 51 wel

De kwaliteitsbewaking: 282 tests in 17 bestanden, typecheck op de strengste
stand, een linter, en een CI die bij elke push draait en pas dan de NAS laat
uitrollen. De vaste replay en de invarianten bewaken het gedrag van de kern,
de stiltetest de configuratie, de indextest het besluitenlog.

Nog niet aangetoond: of de arbiter het in de praktijk beter doet, en hoeveel
koeler of warmer het huis ervan wordt. Het eerste vraagt winterdata, het tweede
het thermisch model — en die winterdata wordt nu opgebouwd.

## 6. Repository en infrastructuur

Monorepo op `github.com/Ricardo-switch/hems-climate` (privé).

```
.github/        De CI: typecheck, lint, tests, builds en het image, en de tak stable
backend/        Node.js: kern, adapters, replay, divergentie, webserver
  src/            de dienst
  test/           de tests, met fixtures/ voor de vaste replay
  tools/          gereedschap: recorder-export, historie samenvoegen, index
frontend/       De weergave; bouwt naar backend/web
design/app/     De schetsen en het ontwerp van de bewonersapp, de maatstaf voor F en G (71)
addon/          De Home Assistant-add-on (staat stil sinds besluit 53)
config/sites/   Configuratie per installatie
deploy/         Compose, uitrolscript, handleiding voor de NAS
ha-fixes/       Reparaties aan het YAML-systeem, klaar om over te nemen
legacy_code/    Het YAML-systeem dat vervangen wordt
HA export/      Referentie: helpers, entity-register, dashboards
```

**Bouwen.** De Dockerfile heeft drie fasen: de weergave, de backend, en de
draaifase die alleen `dist` en `web` overhoudt. De bouwcontext is de
projectwortel, met de `.dockerignore` daar. De commit en de bouwtijd gaan als
bouwargumenten het image in (besluit 54). In het image komen nul
runtime-afhankelijkheden; de linter en de testgereedschappen blijven in de
bouwfase.

**Uitrol.** De NAS draait elke vijf minuten `deploy.sh` vanuit de Synology
Taakplanner. Het script volgt de tak die op de NAS is uitgecheckt: `stable`. Die
schuift pas mee wanneer de CI groen is — inclusief het bouwen van het image met
dezelfde Dockerfile en context als de NAS; een push naar `main` die faalt, komt
dus nooit op de NAS (besluit 54). Het script bouwt alleen wanneer er iets in
`backend/` wijzigde, bouwt éérst en wisselt pas daarna om, toetst de draaiende
configuratie tegen het nieuwe image (besluit 33), en houdt in `.deployed` bij
welke commit er werkelijk draait. Welke commit dat is, zegt de dienst zelf in
`/api/health`.

**Eén draaiende schaduw.** Alleen de NAS (besluit 53). De add-on op de Pi staat
stil en komt terug bij stap B, als de plek waar geregeld wordt.

**De Taakplanner is een andere omgeving dan een shell** (besluit 22):

1. Geen `PATH` naar docker en git — die worden expliciet gezocht.
2. Geen `HOME=/root` — de SSH-sleutel wordt expliciet meegegeven.
3. Aangeroepen als `sh script`, waardoor bash in POSIX-modus draait — het
   script start zichzelf opnieuw met een echte bash.
4. Regeleindes — `.gitattributes` legt LF vast voor alles wat op Linux draait.
5. Overschrijven tijdens een run — bash leest een script tijdens het uitvoeren
   van schijf. Sinds 30 september staat het script in git tussen accolades met
   een `exit` erin, zodat een lopende run zijn eigen versie afmaakt. Op de NAS
   geldt dat vanaf de eerste kopie van die versie; kopieer die ene keer nog vlak
   na een regel "Niets te doen" in het journaal.

Toets een wijziging in het uitrolscript via *Uitvoeren* in de Taakplanner, niet
vanaf de commandoregel. Git-opdrachten op de NAS gaan met `sudo -H`: de werkmap
en de SSH-sleutel zijn van root.

**Wat buiten git blijft, en dus met de hand naar de NAS gaat:** het HA-token
(`.env`), `docker-compose.yml`, `deploy.sh` zelf (besluit 20) en
`config/sites/*.json` (besluit 21). Het uitrolscript meldt wanneer een ervan van
git verschilt, maar zet ze niet over. Een configuratiewijziging is pas actief
nadat je hem zelf kopieert en de container herstart.

**De data blijft ook buiten git.** De logboeken en de historie staan op de NAS;
`/api/export` haalt ze op. De recorder van Home Assistant bewaart sinds
30 september 2026 zestig dagen en is het vangnet voor gaten in de eigen
historie, via `backend/tools/export-history.ts`.

## 7. Waarom het zo is

Dit document beschrijft de huidige stand. Waaróm er zo gekozen is, staat in
[DECISIONS.md](DECISIONS.md), met een index per onderwerp bovenaan. Dat is het
document dat je over een half jaar nodig hebt, want de code vertelt het wat en
niet het waarom.

## 8. Volgende stap

Stap A, het vangnet en de afspraak over de taal van de namen (besluit 59) zijn
klaar.

Nu: de schaduw laten meten. De stabilisatie loopt sinds besluit 60 en 61 op de
eigen timer, en de eigen stand overleeft sinds besluit 62 een herstart.
Werkelijk geschakeld wordt pas als de datasetmeter dertig winterdagen en honderd
procent functiedekking toont (besluit 64), op zijn vroegst eind december 2026.
De weg terug (één schakelaar die bepaalt wie stuurt, en een dodemansknop in Home
Assistant) en de add-on horen bij die stap. Ze komen een paar weken ervoor, zodat
het teken van leven al heeft meegedraaid voordat iemand erop vertrouwt. C kan ernaast, maar is pas
nodig bij een tweede woning. D wacht op de winter.
