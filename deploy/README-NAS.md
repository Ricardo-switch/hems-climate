# Schaduwmodus op de Synology NAS

De pc mag uit. De NAS staat toch aan, en de winterdataset loopt door.

## Mappen aanmaken

Via File Station of SSH, onder de gedeelde map `docker`:

```
/volume1/docker/hems-climate/
├── .env                  ← HA_URL en HA_TOKEN
├── docker-compose.yml    ← uit deze map
├── config/
│   └── sites/
│       └── huis-cornelissen.json
├── logs/                 ← hier komt de dataset
└── src/                  ← de projectmap (backend/ en config/)
```

De NAS bouwt het image zelf uit `src/`. Dat is met opzet: zo hoef je je niets
aan te trekken van het verschil tussen de processor van je pc en die van je NAS.

De build-context is sinds fase 5 de projectwortel en niet `src/backend`, want de
webweergave in `frontend/` wordt in hetzelfde image gebouwd. Daar hoort de
`.dockerignore` in de wortel bij; die in `backend/` doet niets meer.

## Bestanden neerzetten

1. **`src/`** — kopieer de hele projectmap (in elk geval `backend/`). De
   `.dockerignore` zorgt dat `node_modules`, `dist`, `data` en `.env` niet
   meegaan in de build.
2. **`config/sites/huis-cornelissen.json`** — kopieer de map `config/sites` uit
   het project over, met dezelfde indeling. De container mount `config` op
   `config`, dus wat je hier neerzet ziet er precies zo uit als in de repo.
3. **`docker-compose.yml`** — kopieer uit `deploy/`. **Ook bij een update**:
   dit bestand wordt niet automatisch overgezet, net zomin als `deploy.sh`
   (besluit 20). Het bepaalt onder meer de build-context, dus een verouderde
   kopie laat een nieuwe Dockerfile tegen een oude context bouwen. Sinds
   9 september 2026 stopt `deploy.sh` daarop met een melding en het commando
   dat je nodig hebt, in plaats van een bouwfout die niet naar de oorzaak
   wijst.
4. **`.env`** — nieuw aanmaken, met dezelfde twee regels als op je pc:

```
HA_URL=ws://192.168.67.52:8123
HA_TOKEN=eyJ...
```

Maak hiervoor een **apart token** aan in Home Assistant, met een naam als
"HEMS shadow NAS". Dan kun je later precies dit token intrekken zonder dat je
laptop ermee ophoudt, en zie je in HA welke van de twee actief is.

## Starten

**Container Manager** → *Project* → *Aanmaken*

- Projectnaam: `hems-climate`
- Pad: `/volume1/docker/hems-climate`
- Bron: het bestaande `docker-compose.yml`

Bouwen duurt de eerste keer een paar minuten. Daarna verschijnt de container en
staat er in het logboek:

```
verbonden — 1672 entiteiten in Home Assistant, 31 daarvan volgen we, 0 ontbreken
```

Zie je dat niet, kijk dan in het containerlogboek: fouten in de configuratie of
in het token worden bij het opstarten met naam en toenaam gemeld.

## Bijwerken

`deploy.sh` in de Taakplanner haalt de code op en bouwt opnieuw. Drie bestanden
horen daar niet bij en neem je zelf over wanneer ze in git wijzigen:

```sh
cp /volume1/docker/hems-climate/src/deploy/docker-compose.yml /volume1/docker/hems-climate/docker-compose.yml
```

en `deploy.sh` zelf. Het script meldt in beide gevallen dat er iets te doen is.

**Het derde is de configuratie.** `config/sites/*.json` hoort bij de installatie
en gaat ook niet met git mee. Wijzigt het schema, dan kan de oude versie
ongeldig worden — de dienst start dan niet meer op en komt met
`restart: unless-stopped` in een herstartlus terecht. Sinds 10 september 2026
toetst `deploy.sh` de draaiende configuratie tegen het nieuwe image vóórdat hij
omwisselt, en stopt hij met de melding welk bestand je moet overnemen
(besluit 33):

```sh
sudo cp /volume1/docker/hems-climate/src/config/sites/*.json /volume1/docker/hems-climate/config/sites/
```

Zelf nakijken kan ook, zonder iets te wijzigen:

```sh
sudo docker run --rm -v /volume1/docker/hems-climate/config:/app/config:ro hems-climate/shadow:latest node dist/main.js --check-config
```

## De webweergave

Sinds fase 5 luistert de dienst op poort 8080: `http://<nas>:8080/`. Read-only —
er is geen route die iets wijzigt. Er is ook **geen authenticatie**, en dit
proces houdt het HA-token vast, dus zet hier nooit een portforward of een
reverse proxy naar buiten op.

De poort staat standaard op **8099**. Welke poorten vrij zijn verschilt per NAS,
dus dat is een keuze van deze installatie en geen codekeuze — hij komt daarom
uit `.env`, net als het token:

```
# Alleen nodig als 8099 al bezet is.
HEMS_WEB_PORT_NAS=8099
# Alleen vanaf de NAS zelf bereikbaar in plaats van vanaf je hele netwerk.
HEMS_WEB_BIND=127.0.0.1
```

Zo hoef je geen bestand uit git aan te passen om de poort te verzetten, en
klaagt de compose-controle in `deploy.sh` er niet over.

Welke poorten al bezet zijn zie je in DSM onder *Aanmeldingsportaal → Reverse
Proxy*, en met `netstat -tlnp` over SSH. Botst het toch, dan mislukt het
omwisselen met "port is already allocated" en blijft de oude container draaien.

Helemaal uitzetten kan door `HEMS_WEB_PORT` en het `ports`-blok weg te laten.
Dan luistert de dienst nergens op, zoals vóór fase 5.

### Niet achter de reverse proxy

DSM's reverse proxy publiceert op `*.synology.me`, dus buiten je huis. Deze
pagina hoort daar niet bij: er is geen inlog, geen sessie en geen rate limit, en
het proces erachter houdt een token met volledige toegang tot je Home Assistant.
Home Assistant zelf staat daar terecht wel achter — dat heeft een inlog.

## Wat er is ingebouwd voor het onbewaakt draaien

**Herstarten bij een crash of na een herstart van de NAS.** `unless-stopped`, dus
niet nadat jij hem bewust hebt stopgezet.

**Een bewaking tegen vastlopen.** Het echte risico bij maanden draaien is niet
een crash maar een proces dat blijft leven terwijl er niets meer gebeurt: een
websocket die dood is zonder dat de sluiting doorkwam. Neemt de dienst tien
minuten lang geen enkel besluit meer, dan sluit hij zichzelf af met een
foutcode, en start Docker hem opnieuw. In te stellen met
`SHADOW_WATCHDOG_MINUTES`; nul zet het uit.

**Een healthcheck voor de zichtbaarheid.** Kijkt of er de afgelopen vijf minuten
naar het besluitenlogboek is geschreven. Container Manager kleurt de container
dan groen of rood — handig om in één oogopslag te zien of het loopt.

**Begrensde logboeken.** Het containerlogboek gaat naar maximaal 5 × 10 MB. Het
besluitenlogboek in `logs/` is per dag en ongeveer 1 MB — over een winter dus
ruim onder de 200 MB.

**Geen poorten.** De dienst luistert nergens op en verbindt alleen uitgaand met
Home Assistant. Er is niets bereikbaar van buiten.

## De dataset ophalen

`logs/decisions-JJJJ-MM-DD.ndjson`, één bestand per dag. Bereikbaar via File
Station of je netwerkschijf. Voor de divergentietool kopieer je ze naar
`backend/data/shadow/` op je pc.

## Twee instanties tegelijk

Draait de schaduwmodus op je pc nog, stop hem dan (`shadow stop`). Twee
instanties belasten Home Assistant dubbel en leveren twee datasets op die je
straks uit elkaar moet houden. Voor ontwikkelen op je pc is dat prima —
gebruik dan alleen even een andere `SHADOW_LOG_DIR`.

## Als het bouwen mislukt

De meest waarschijnlijke oorzaak is `npm ci` dat struikelt over een
platformspecifieke afhankelijkheid, omdat de `package-lock.json` op Windows is
gemaakt. Vervang in dat geval in de `Dockerfile` de regel `RUN npm ci` door
`RUN npm install --no-audit --no-fund`. Dat lost de afhankelijkheden opnieuw op
voor de architectuur van de NAS.

De testsuite draait bewust niet mee in de build, juist om dit soort
architectuurgedoe buiten de deur te houden. Wil je het toch:
`--build-arg RUN_TESTS=true`.

## Prestatiemeting voor de Raspberry Pi

Voordat de dienst als HA-add-on naast Home Assistant gaat draaien (besluit 34)
moet vaststaan dat de Pi de analyse aankan. Die draait elk kwartier over de hele
opname, en een winter is een andere som dan de vijf dagen waarop hij nu wordt
gemeten.

**Waarom niet wachten tot maart:** dan is de add-on al gebouwd. Daarom een
nagebouwd logboek van winterformaat.

### 1. Testset maken (op je werkstation, één keer)

```sh
cd backend && npx tsx tools/make-winter.ts 180 data/bench
```

Dit herhaalt de bestaande dagen met verschoven tijdstempels tot 180 dagen. De
uitkomsten van de analyse zijn daarmee onzin — het meet doorvoer, geen gedrag.
Realistisch zijn het aantal momenten, de verhouding volledige/korte records en
de recordgrootte, en dat is wat het rekenwerk bepaalt.

### 2. Nulmeting op je werkstation

```sh
node dist/main.js --benchmark data/bench
```

Gemeten op een x64-werkstation, NVMe, Node 24:

```
invoer      180 dagbestanden, 375 MB, 1.119.000 momenten
wandtijd    6.480 ms       piekgeheugen  181,6 MB rss
processor   6.828 ms       event loop    1 ms vertraging
bezetting   0,76% van één kern, elk kwartier
```

### 3. Dezelfde set naar de Pi, en dezelfde meting

Kopieer `data/bench` naar de Pi — niet opnieuw genereren, want dan meet je twee
verschillende invoeren tegen elkaar.

```sh
sudo docker run --rm -v /pad/naar/bench:/bench:ro hems-climate/shadow:latest   node dist/main.js --benchmark /bench
```

De meting geeft zelf aan of hij de grenzen haalt: wandtijd onder 60 s (vier keer
speling op een kwartiercyclus), piekgeheugen onder 256 MB (de `mem_limit`), en
vertraging van de event loop onder 1 s.

**Let op het geheugen.** Op het werkstation zit de piek op 181,6 MB tegen een
limiet van 256 MB. Dat is minder speling dan de andere twee grenzen, en het is
het enige getal dat niet langzaam maar hard faalt: er overheen betekent dat de
kernel het proces afschiet.

### 4. Wat de benchmark níét meet: of HA er last van heeft

Dit is de eigenlijke vraag van besluit 17, en die kun je alleen op de doelmachine
beantwoorden. Meet de reactietijd van HA vóór en tíjdens de analyse:

```sh
# In een tweede sessie, terwijl de benchmark loopt:
while true; do
  curl -s -o /dev/null -w '%{time_total}
'     -H "Authorization: Bearer $HA_TOKEN"     http://localhost:8123/api/
  sleep 1
done
```

Draai dat eerst een minuut zonder de benchmark voor een basislijn, en dan
opnieuw terwijl hij loopt. Loopt de reactietijd van HA meer dan een factor twee
op, dan belast de analyse de machine die niet mag omvallen — precies waar
besluit 17 bang voor was.

### Als de Pi het niet trekt

De uitweg staat al als openstaand punt in `DECISIONS.md`: een tussenstand per
dag bewaren in plaats van elke keer de hele opname doorrekenen. Dat is bewust
uitgesteld omdat het een tweede waarheid introduceert die kan verlopen. Faalt
deze meting op de doelmachine, dan is dat het moment waarop die prijs de moeite
waard wordt.
