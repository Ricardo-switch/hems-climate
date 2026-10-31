# @hems/backend — de kern

De beslissingslogica van SunArc OS. Deze map bevat geen Home
Assistant-code: de kern kent geen entity-ID's, geen kamernamen en geen
bewonersnamen. Een adapter vertaalt `DeviceRef` naar wat zijn platform gebruikt.

## Het contract

```ts
decide({ config, state, strategies }) -> Decision
```

Puur. Gelijke invoer geeft gelijke uitvoer. Er wordt niets gelezen dat niet in
`state` staat, en niets geschreven dat niet in `Decision.commands` terugkomt —
timers inbegrepen. Dat is wat de replay-harness van fase 1 mogelijk maakt:
opgenomen historie erin, besluiten eruit, vergelijken met wat het YAML-systeem
destijds werkelijk deed.

## Indeling

| Bestand | Rol |
| --- | --- |
| `core/model.ts` | Configuratie: `Zone`, `Actuator`, `SiteConfig`. Alles wat huisspecifiek is. |
| `core/state.ts` | Waargenomen toestand. `Reading<T>` draagt ook de reden van afwezigheid. |
| `core/context.ts` | Afgeleide grootheden, één keer per ronde. Modus, vraag per zone, vermogensbudget. |
| `core/decision.ts` | `Intent`, `Command`, `Decision`, `Explanation`. |
| `core/strategy.ts` | De plugin-interface en het register. |
| `core/arbiter.ts` | Van voorstellen naar commando's. Verdeelt het vermogensbudget. |
| `core/decide.ts` | Het instappunt, inclusief failsafe. |
| `config/schema.ts` | Validatie van JSON naar `SiteConfig`, met leesbare fouten. |
| `config/load.ts` | Waar de configuratie vandaan komt: bestand kiezen, lezen, valideren. |

## Waarom een budget en geen vlag

De YAML-versie hield het gelijktijdig starten van twee airco's tegen met een
variabele `zolder_started_now`. Door een scopingfout in Home Assistant stond die
altijd op `false`, waardoor beide units op hetzelfde overschot konden starten.

Hier bestaat die vlag niet. Er is een pot:

```
availableW = teruglevering + importtolerantie + wat draaiende apparaten teruggeven
```

Elk voorstel draagt een `budgetW`. Een draaiend apparaat rekent zijn gemeten
opname, een stilstaand apparaat zijn schatting — zo kost bijschakelen alleen het
verschil, precies zoals de oorspronkelijke drempellogica bedoelde. De arbiter
loopt de voorstellen af op voorrang en deelt uit tot de pot leeg is. Wie niets
meer krijgt en toch draait, wordt in de afschakelronde teruggezet naar standby.

## Commando's

Zes soorten, meer niet: `setAction`, `setSetpoint`, `startTimer`, `cancelTimer`.
De adapter vertaalt ze en meer hoeft hij niet te weten.

## Draaien

```bash
npm install
npm run typecheck
npm test
```

## De replay-harness

```bash
npm run export:history -- pad/naar/home-assistant_v2.db
npm run replay
```

De exporter trekt ~50 entiteiten uit de recorder naar gzip-NDJSON: 10 dagen is
2,2 MB, dus ongeveer 80 MB per jaar op volledige resolutie. Draai hem
nachtelijk, dan mag de recorder zelf kort bewaren.

De harness loopt het venster per minuut af en laat de arbiter beslissen op de
toestand zoals die werkelijk was.

**Wat het is en niet is.** Dit is een schaduwvergelijking, geen gesloten
simulatie. Op elk moment krijgt de arbiter de echte toestand van dat moment. We
rekenen niet door hoe de temperatuur zich ontwikkeld zou hebben als hij het
stuur had gehad — na de eerste afwijking wordt dat fictie, en dan vergelijk je
je eigen aannames in plaats van twee regelaars.

Twee meetvalkuilen die er al in zaten en waar de code nu expliciet omheen loopt:

- **Toerekening van netstroom.** Het netvermogen bevat het airco-verbruik al.
  Een huis dat 532 W teruglevert terwijl de airco's 596 W trekken draait
  volledig op zon; daar valt niets aan het net toe te rekenen. Alleen echte
  import boven de tolerantie telt, en hoogstens tot wat de airco's zelf opnemen.
- **Wat "teruggeschakeld" betekent.** Niet "geen aanvaard draaivoorstel", maar
  "er gaat een commando uit dat het apparaat stopt". Houdt de minimale
  draaitijd het afschakelen tegen, dan blijft het apparaat draaien, en dat hoort
  niet als winst geteld te worden.

## Divergentietool

```bash
..\sync-logs.bat          # logboeken van de NAS halen
npm run divergence         # rapport in de terminal
npm run divergence -- --dagen 7
npm run divergence -- --json
```

**Geen verbinding met Home Assistant nodig.** De schaduwmodus legt vast wat de
apparaten deden op het moment dat de arbiter besliste, dus het logboek is
zelfvoorzienend: geen token, geen netwerk, geen bewaartermijn van de recorder,
en dezelfde invoer geeft altijd hetzelfde rapport. Wat de vergelijking nodig
heeft, staat in het `migration`-blok van de configuratie; dat blok haal je weg
zodra de overstap gemaakt is.

De weergave heeft drie lagen, van grof naar fijn:

1. **Een tijdlijn per dag**, één teken per kwartier. Patronen zie je hier
   meteen — "elke middag mis" ziet er heel anders uit dan "af en toe een hikje".
2. **Episodes**: aaneengesloten afwijkingen, langste eerst, met de reden die de
   arbiter zelf opgaf en wat het oude systeem er op dat moment over zei. Losse
   minuten tellen is zinloos; vierhonderd afwijkende minuten zeggen niet of dat
   vierhonderd hikjes waren of drie lange middagen.
3. **Totalen**, onderaan, want een percentage zonder de twee lagen erboven zegt
   te weinig.

Eén punt waar de lezer subtiel is: in schaduwmodus worden de commando's van de
arbiter nooit uitgevoerd, dus zijn wens blijft gelden tot hij van gedachten
verandert. Een kort record betekent "het besluit is niet gewijzigd", niet "er is
geen besluit". Zonder dat voort te dragen zou elke afwijking na één minuut
lijken op te lossen.

## Grenzen van de open-lus vergelijking

`npm run sweep` rekent de bufferband van de zolder door voor vijf waarden. De
uitkomst laat meteen zien waar deze aanpak ophoudt: elke band vanaf 0,5 °C geeft
exact hetzelfde resultaat. Dat komt doordat de band vooral bepaalt hoe lang een
apparaat *doorgaat* nadat het setpoint bereikt is, en de reconstructie speelt de
werkelijke temperaturen af in plaats van door te rekenen wat er met de zolder
zou zijn gebeurd. Wat de band stuurt, is in open lus dus onzichtbaar.

Zo'n vraag beantwoorden vraagt een van beide:

- een eenvoudig RC-model van elke zone, gefit op de historie, zodat de replay
  gesloten kan draaien;
- of een A/B-proef in productie, met de band als enige verschil.

Tot die tijd is `bufferBandC` een knop op ervaring, geen gemeten waarde.

## Configuratie

De installatie staat als data in `config/sites/*.json`, niet in code. Het pad
wordt omhoog gezocht vanaf de huidige map, dus `npm run shadow` werkt zowel
vanuit `backend/` als vanuit de wortel. Staat er precies één bestand, dan is dat
hem; zijn het er meer, dan kies je met `HEMS_SITE=<naam>` of `HEMS_CONFIG=<pad>`.

```bash
npm run config:check          # valideren zonder iets te starten
```

**Waarom JSON en niet YAML.** De configuratie komt straks uit een
onboarding-wizard en gaat over een API; dan is JSON het natuurlijke formaat.
YAML zou bovendien ironisch zijn: we migreren er juist vanaf, en het lokt
precies de sjabloonlogica uit die de vorige generatie onleesbaar maakte.

**Waarom nog geen database.** Er is één configuratie, en een database
beantwoordt op dit moment geen enkele vraag. Maar de vorm is er klaar voor: een
document met een `id` en een `schemaVersion`. `schema.ts` kent alleen `unknown`
in en `SiteConfig` uit — die weet niets van bestanden. Postgres of een API wordt
later een nieuwe bron in `load.ts`, geen herschrijving.

**De foutmeldingen zijn hier het product.** De parser stopt niet bij de eerste
fout maar levert de hele lijst, met pad. Naast de vorm wordt de samenhang
gecontroleerd: verwijst een zone naar een apparaat dat niet bestaat, eisen twee
zones hetzelfde apparaat op, is een doeltemperatuur voor geen van de apparaten
in de zone haalbaar, hervat het systeem op een hogere drempel dan waarop het
mag starten. Dat laatste soort fout is syntactisch prima JSON en functioneel
een storing om drie uur 's nachts.

```
De configuratie in config/sites/huis.json klopt niet (2 problemen):
  zones[0].actuatorIds[1]: zone "woonkamer" verwijst naar actuator "ketels",
    die niet bestaat. Bedoelde je "ketel"?
  power.resumeSurplusW: hervatten bij 2000 W terwijl starten pas bij 1000 W mag,
    is tegenstrijdig; hervatten hoort de lagere drempel te zijn
```

Bewust zonder validatiebibliotheek: de verwijzingscontroles moeten sowieso met
de hand, de meldingen zijn domeinspecifiek, en een dienst die in een container
bij mensen thuis draait heeft baat bij een korte lijst afhankelijkheden. Die
afweging raakt alleen `schema.ts` en is dus omkeerbaar.

## Schaduwmodus

De adapter verbindt met Home Assistant, laat de arbiter meebeslissen op de echte
toestand, en schrijft zijn commando's naar het log in plaats van naar het huis.

```bash
cp .env.example .env      # vul HA_URL en HA_TOKEN in

shadow start              # bouwt zo nodig, start losgekoppeld, logt naar bestand
shadow status             # draait hij, en wat heeft hij vandaag gedaan
shadow logs               # laatste regels van de console-uitvoer
shadow restart
shadow stop
```

`shadow.bat` roept `scripts/shadow.ps1` aan met `ExecutionPolicy Bypass`, dus er
hoeft niets aan de systeeminstellingen te veranderen. Ook beschikbaar als
`npm run shadow:start` en zo. Wil je hem in de voorgrond met live uitvoer —
handig tijdens het ontwikkelen — dan is dat nog steeds `npm run shadow`.

Twee bestanden zijn bedoeld om te dubbelklikken:

- **`shadow.bat`** zonder argument toont de status en houdt het venster open.
- **`shadow-watch.bat`** opent een live meelezer op het logboek. Dat venster
  sluiten of Ctrl+C drukken stopt alleen het kijken, niet de opname — daarom
  draait de dienst zelf losgekoppeld en niet in een zichtbaar venster. Eén per
  ongeluk weggeklikt venster zou anders je hele winteropname beëindigen.

Het script draait de gebouwde `dist/main.js` rechtstreeks met node, niet via
tsx of npx. Die wrappers starten een kindproces, en dan wijst het PID-bestand
naar de wrapper; stoppen laat dan een verweesd proces achter dat doorlogt. Om
dezelfde reden waarschuwt `start` wanneer er al een instantie draait die niet
van dit script komt: twee instanties schrijven in hetzelfde logboek.

**Dit is geen dienst.** Sluit je af of gaat de pc in slaapstand, dan stopt de
opname. Voor een winter aan data zonder gaten hoort dit in een container op iets
dat altijd aan staat.

Het token maak je onderaan je HA-profielpagina, onder "Langlopende
toegangstokens". Het geeft volledige toegang tot Home Assistant, dus behandel
het als een wachtwoord; `.env` staat in `.gitignore`.

**Schrijven is structureel uit, niet als afspraak.** `HaClient` wordt zonder
`allowWrites` aangemaakt, en `callService` werpt dan voordat er iets de socket
op gaat. Dat is met opzet een harde grens: deze code kijkt mee bij de
verwarming van een bewoond huis. Een test bewijst dat er in een volledige
schaduwsessie geen enkele `call_service` bij Home Assistant aankomt.

### Wat er niet doorheen komt

Home Assistant stuurt een `state_changed` voor alles wat er in huis beweegt.
Gemeten op tien dagen echte historie van deze woning: 2.149.449 wijzigingen over
1666 entiteiten, waarvan er **31 over klimaat gaan**. De adapter negeert de rest
volledig — geen opslag, geen herberekening, geen logregel. Dat scheelt 91,7%.

Dat alleen was niet genoeg. Binnen wat overblijft is de slimme meter in zijn
eentje 88%, met een melding elke vijf seconden. Daarop telkens opnieuw beslissen
heeft geen zin: de regeling werkt met stabilisatietimers van vijf minuten en
minimale draaitijden van een kwartier, en het YAML-systeem dat hieraan voorafging
draaide eens per drie minuten. Daarom geldt er een ondergrens van vijftien
seconden tussen twee evaluaties (`SHADOW_MIN_INTERVAL_SECONDS`). Een wijziging
die binnen dat venster valt wordt verschoven, niet weggegooid.

Samen brengt dat het tempo van bijna 9000 events per uur terug naar hooguit 240
evaluaties, en het logboek van ~17 MB per dag naar ongeveer 1 MB.

Wat je krijgt:

- op de console alleen de momenten waarop het besluit *verandert*, met het
  vermogensbudget, wat er gestuurd zou zijn, en wat er geblokkeerd werd;
- in `data/shadow/decisions-JJJJ-MM-DD.ndjson` het besluit: voluit wanneer er
  iets verandert, en anders een korte regel met alleen tijd, modus, budget en de
  temperatuur per zone. `zones` en `accepted` zijn samen tweederde van een
  volledig record en staan juist stil zolang er niets gebeurt;
- bij verbinden een lijst van geconfigureerde meetpunten die HA niet kent —
  de snelste manier om een typefout in de configuratie te vinden.

### Dezelfde vertaling voor live en historie

`adapters/homeassistant/mapping.ts` is de enige plek met entity-ID's erin. Zowel
de live-store als de replay-cursor leveren de `EntitySource`-interface, dus
schaduwmodus en harness lopen door precies dezelfde vertaling. Twee losse
implementaties zouden vroeg of laat uiteenlopen, en dat is de bugklasse waar
dit project vandaan komt.

## Nog te doen

- Handmatige override met vervaltimer, als vervanger van de nachtelijke reset.
- `bufferBandC: 0` schakelt pv-surplus nu stilzwijgend uit voor die zone. Dat
  hoort een eigen vlag te zijn in plaats van een bijwerking van de waarde nul.
- Vergelijking van het schaduwlogboek met wat het YAML-systeem in dezelfde
  minuut deed — nu nog handwerk, hoort een script te worden.
