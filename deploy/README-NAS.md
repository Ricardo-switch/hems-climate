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
│       └── mijn-huis.json
├── logs/                 ← hier komt de dataset
└── src/                  ← de projectmap (backend/ en config/)
```

De NAS bouwt het image zelf uit `src/`. Dat is met opzet: zo hoef je je niets
aan te trekken van het verschil tussen de processor van je pc en die van je NAS.

De build-context is sinds fase 5 de projectwortel en niet `src/backend`, want de
webweergave in `frontend/` wordt in hetzelfde image gebouwd.

In `src/` staat trouwens niet de hele repository: `deploy.sh` beperkt de werkmap
met sparse-checkout tot `backend`, `frontend`, `config` en `deploy`, plus de
bestanden in de wortel. `HA export/`, `legacy_code/` en `ha-fixes/` zijn naslag
voor het ontwikkelen en horen niet op een server (besluit 35). Een bestaande
volle kloon ruimt zichzelf op bij de eerstvolgende uitrol. Daar hoort de
`.dockerignore` in de wortel bij; die in `backend/` doet niets meer.

## Bestanden neerzetten

1. **`src/`** — kopieer de hele projectmap (in elk geval `backend/`). De
   `.dockerignore` zorgt dat `node_modules`, `dist`, `data` en `.env` niet
   meegaan in de build.
2. **`config/sites/mijn-huis.json`** — de configuratie van je woning. Die staat
   niet in de repository, want die is openbaar; zet hem hier zelf neer, of laat
   de app hem maken (besluit 42). De container mount `config` op `config`, met
   `sites` eronder.
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

Via SSH, als root:

```sh
/volume1/docker/hems-climate/deploy.sh --force
```

Bouwen duurt de eerste keer een paar minuten. Daarna staat er in het logboek:

```
verbonden — 1672 entiteiten in Home Assistant, 31 daarvan volgen we, 0 ontbreken
```

Zie je dat niet, kijk dan in het containerlogboek: fouten in de configuratie of
in het token worden bij het opstarten met naam en toenaam gemeld.

### Geen project in Container Manager

Het is verleidelijk om de stack als *Project* in Container Manager aan te
maken: dat geeft een knopje en een overzicht. Doe het niet.

Container Manager houdt van een project zijn eigen administratie bij van welke
containers erbij horen. `deploy.sh` vervangt de container buiten die
administratie om, en dan wijst de UI naar een container-ID dat Docker niet meer
kent: een groene stip zonder statistieken, en knoppen die niets doen. Een
herstart van het pakket lost dat niet op, want de administratie zelf klopt niet
meer.

Twee eigenaren van één container is er één te veel. De container blijft
gewoon zichtbaar onder **Container** in Container Manager — die lijst komt
rechtstreeks uit Docker en klopt dus altijd.

## Bijwerken

`deploy.sh` in de Taakplanner haalt de code op en bouwt opnieuw. Het volgt de
tak die in `src/` is uitgecheckt, en dat hoort `stable` te zijn: die schuift pas
mee wanneer de CI op GitHub alles groen heeft (besluit 54). Eenmalig overzetten:

```sh
sudo -H git -C /volume1/docker/hems-climate/src fetch origin stable
sudo -H git -C /volume1/docker/hems-climate/src checkout stable
```

Met `sudo -H`, want de werkmap is van root en git haalt op met de SSH-sleutel
van root. Zonder `-H` houdt sudo je eigen thuismap aan, en dan vindt git
root's `safe.directory` en sleutel niet: "dubious ownership" of een geweigerde
sleutel.

Staat hij nog op `main`, dan komt elke push ongetoetst binnen vijf minuten live.
Welke commit er draait, zie je op `/api/health` onder `versie`. Drie bestanden
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

### Inloggen (besluit 99)

Kijken kan zonder inlog. Bedienen (lampen, gevoel, de indeling) vraagt een
inlog met je **Home Assistant-account**: de app stuurt je naar het inlogscherm
van je eigen Home Assistant en neemt je daarna terug. Een beheerder in Home
Assistant is beheerder in de app. De tablet aan de muur logt één keer in en
blijft dat; uitloggen kan bij Bediening.

Standaard gaat de browser naar het adres in `HA_URL`. Bereik je Home Assistant
onderweg onder een andere naam (bijvoorbeeld de naam in je tailnet), zet die
dan in `.env`:

```
# Waar de browser Home Assistant bereikt om in te loggen.
HEMS_HA_LOGIN_URL=http://homeassistant.tail1234.ts.net:8123
```

De dienst antwoordt alleen op een IP-adres, `localhost`, een naam zonder punt,
of een naam op `.local`, `.lan`, `.home.arpa` of `.ts.net`. Open je de app
onder een andere naam, voeg die dan toe, met komma's ertussen:

```
HEMS_HOSTS=klimaat.thuis.nl
```

`HEMS_OPEN=1` zet alles open zoals vóór dit besluit, met een waarschuwing in
het logboek. Niet doen buiten een test.

### Plaatjes bij de Hue-scènes (besluit 100)

De app toont bij een scène het plaatje uit `logs/scene-plaatjes/` met zijn naam;
zonder plaatje een bolletje in de kleuren van de scène. Smart Climate levert de
plaatjes niet mee: ze zijn van Philips Hue. Wie ze voor eigen gebruik wil, haalt
bijvoorbeeld de verzameling van github.com/mattmon/hue-scene-icons op de NAS:

```
cd /tmp && git clone --depth 1 https://github.com/mattmon/hue-scene-icons   && mkdir -p /volume1/docker/hems-climate/logs/scene-plaatjes   && cp hue-scene-icons/icons/*.png /volume1/docker/hems-climate/logs/scene-plaatjes/   && rm -rf hue-scene-icons
```

Die heten Engels (`bright.png`); de app vertaalt de Nederlandse namen uit de
Hue-app ("Helder"). Een eigen plaatje met de Nederlandse naam in kleine letters
(`helder.png`, `arctische_dageraad.png`) gaat voor. De map wordt elke tien
minuten opnieuw gelezen.

### Als app op de telefoon: https in je tailnet (besluit 108)

Chrome installeert de app alleen schermvullend over https. Binnen je eigen
tailnet kan dat met **Tailscale serve** (nooit `tailscale funnel`: dat zet het
adres op internet).

1. In de beheerpagina van Tailscale, onder *DNS*: zet **MagicDNS** aan, en
   daaronder **HTTPS Certificates**.
2. Op de NAS, via SSH:

   ```
   sudo tailscale serve --bg --https=443 http://127.0.0.1:8099
   ```

   Lukt poort 443 niet, gebruik dan `--https=8443`; het adres krijgt dan
   `:8443` erachter.
3. Controleer met `sudo tailscale serve status`. Daar hoort "(tailnet only)"
   bij te staan, en het adres, zoals `https://nas.tail1234.ts.net`.
4. Open dat adres op de telefoon (met Tailscale aan), log één keer in, en kies
   in het menu van Chrome *App installeren*.

Uitzetten: `sudo tailscale serve --https=443 off`. De app op het gewone adres
blijft gewoon werken.

### Niet achter de reverse proxy

DSM's reverse proxy publiceert op `*.synology.me`, dus buiten je huis. Deze
pagina hoort daar niet bij: bedienen vraagt een inlog (besluit 99), maar kijken
is open, zonder grens op het tempo, en het proces erachter houdt een token met
volledige toegang tot je Home Assistant.
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

**Een mail als de opname stilvalt** (besluit 67). `deploy.sh` kijkt bij elke
run hoe oud het nieuwste beslislogboek is. Staat er al een half uur geen besluit
in, dan eindigt de run met een foutcode. Per storing komt er hooguit één melding
per drie uur. Een container die je zelf hebt stopgezet, geeft geen melding. De
mail zelf komt van DSM, en die zet je één keer aan:

1. **Configuratiescherm → Melding → E-mail**: zorg dat DSM mail kan versturen,
   en verstuur een testbericht.
2. **Configuratiescherm → Taakplanner** → de taak van `deploy.sh` → **Bewerken →
   Taakinstellingen**: vink **Verzend uitvoeringsgegevens per e-mail** aan, en
   daaronder **Alleen verzenden wanneer het script abnormaal wordt beëindigd**.

Zonder dat tweede vinkje krijg je elke vijf minuten een mail.

**Begrensde logboeken.** Het containerlogboek gaat naar maximaal 5 × 10 MB. Het
beslislogboek en de ruwe historie in `logs/` schrijven samen ongeveer 5 MB per
dag. Dagen ouder dan een week worden gecomprimeerd (besluit 58), dus een winter
blijft ruim onder de 200 MB.

**Alleen de weergave luistert.** Op poort 8099, zonder inlog en alleen lezen;
zie hieronder. Verder verbindt de dienst alleen uitgaand met Home Assistant.

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

### Uitkomst, gemeten op 10 september 2026

Op een Raspberry Pi 5 met HAOS 18.2, met dezelfde 180 dagen:

```
wandtijd    21.529 ms      piekgeheugen  110,4 MB rss
processor   24.037 ms      event loop    9 ms vertraging
bezetting   2,67% van één kern, elk kwartier

HA in rust    mediaan 0,002 s   hoogste 0,002 s
HA belast     mediaan 0,002 s   hoogste 0,003 s
```

Alle grenzen gehaald, en geen meetbaar effect op Home Assistant. Besluit 17 is
daarmee omgedraaid; zie besluit 17b. De stappen hieronder blijven staan om de
meting te kunnen herhalen na een zware wijziging.

Het piekgeheugen is op de Pi láger dan op het werkstation (110 tegen 182 MB): V8
reserveert op Windows royaler. Dat was uitgerekend het getal om in de gaten te
houden, want het is het enige dat hard faalt in plaats van langzaam — eroverheen
schiet de kernel het proces af.

### 3. Meten op de Pi

Op HAOS gaat dit anders dan op de NAS. Vier dingen die misgingen voordat het
liep, zodat je ze niet opnieuw hoeft te ontdekken:

- **Je hebt `docker` nodig.** Installeer de add-on *Advanced SSH & Web Terminal*
  en zet **Protection mode uit**. Controleer met `docker ps`.
- **Het image van de NAS draait niet op de Pi.** Dat is x86, de Pi is ARM.
  Bouw opnieuw: `docker build -f backend/Dockerfile -t hems-bench:arm .`
- **`scp` naar DSM faalt** met `subsystem request failed on channel 0`, omdat
  SFTP daar uitstaat. Gebruik tar over ssh:
  `ssh gebruiker@nas "tar -C /pad -cf - ." | tar -C /doel -xf -`
- **`-v /addon_configs/...` werkt niet.** Dat pad bestaat binnen de add-on, niet
  op de host waar de docker-daemon draait; je krijgt
  `mkdir /addon_configs: read-only file system`. Gebruik `--volumes-from` met de
  SSH-add-on, dan kloppen de paden vanzelf.

```sh
SSHC=$(docker ps --format '{{.Names}}' | grep -i ssh | head -1)
docker run --rm --volumes-from "$SSHC" hems-bench:arm node dist/main.js --make-winter 180 /addon_configs/hems/logs /addon_configs/hems/bench
docker run --rm --volumes-from "$SSHC" hems-bench:arm node dist/main.js --benchmark /addon_configs/hems/bench
```

### 4. Wat de benchmark níet meet: of HA er last van heeft

Dat is de eigenlijke vraag van besluit 17, en die kun je alleen op de doelmachine
beantwoorden.

Vanuit een add-on is HA bereikbaar op `http://homeassistant:8123`; het LAN-IP van
de host loopt in een time-out. `manifest.json` heeft geen token nodig.

```sh
cat > /tmp/meet.sh <<'EOF'
#!/bin/sh
HA=http://homeassistant:8123/manifest.json
n=${1:-20}
i=0
while [ $i -lt $n ]; do
  curl -s -o /dev/null -w '%{time_total}\n' -m 5 "$HA"
  sleep 1
  i=$((i+1))
done
EOF
chmod +x /tmp/meet.sh

/tmp/meet.sh 20 > /tmp/ha-rust.txt

docker run --rm --volumes-from "$SSHC" hems-bench:arm node dist/main.js --benchmark /addon_configs/hems/bench > /dev/null &
/tmp/meet.sh 40 > /tmp/ha-belast.txt
```

De `-m 5` is geen franje: zonder tijdslimiet blijft `curl` bij een onbereikbaar
adres minutenlang hangen en líjkt de meting vastgelopen.

Vergelijken:

```sh
sort -n /tmp/ha-rust.txt | awk '{a[NR]=$1} END {printf "rust   %.3fs mediaan, %.3fs hoogste\n", a[int(NR/2)+1], a[NR]}'
sort -n /tmp/ha-belast.txt | awk '{a[NR]=$1} END {printf "belast %.3fs mediaan, %.3fs hoogste\n", a[int(NR/2)+1], a[NR]}'
```

Loopt de mediaan meer dan een factor twee op, dan belast de analyse de machine
die niet mag omvallen. Bij de meting van 10 september bewoog hij niet.

### Als de Pi het niet trekt

De uitweg staat al als openstaand punt in `DECISIONS.md`: een tussenstand per
dag bewaren in plaats van elke keer de hele opname doorrekenen. Dat is bewust
uitgesteld omdat het een tweede waarheid introduceert die kan verlopen. Faalt
deze meting op de doelmachine, dan is dat het moment waarop die prijs de moeite
waard wordt.
