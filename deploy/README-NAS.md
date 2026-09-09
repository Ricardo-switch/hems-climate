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

`deploy.sh` in de Taakplanner haalt de code op en bouwt opnieuw. Twee bestanden
horen daar niet bij en neem je zelf over wanneer ze in git wijzigen:

```sh
cp /volume1/docker/hems-climate/src/deploy/docker-compose.yml    /volume1/docker/hems-climate/docker-compose.yml
```

en `deploy.sh` zelf. Het script meldt in beide gevallen dat er iets te doen is.

## De webweergave

Sinds fase 5 luistert de dienst op poort 8080: `http://<nas>:8080/`. Read-only —
er is geen route die iets wijzigt. Er is ook **geen authenticatie**, en dit
proces houdt het HA-token vast, dus zet hier nooit een portforward of een
reverse proxy naar buiten op.

Is 8080 op je NAS al bezet, dan mislukt het omwisselen met "port is already
allocated". Kies dan links een andere poort in `docker-compose.yml`
(`"8081:8080"`); de rechterkant hoort bij `HEMS_WEB_PORT` en blijft 8080.

Helemaal uitzetten kan door `HEMS_WEB_PORT` en het `ports`-blok weg te laten.
Dan luistert de dienst nergens op, zoals vóór fase 5.

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
