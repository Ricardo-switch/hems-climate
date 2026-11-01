# SunArc (Home Assistant add-on)

Klimaat en zon in één app. SunArc kijkt mee met je verwarming, airco's
en zonnepanelen, legt elk besluit vast en laat zien wat het huis zou doen.
Klimaat en screens schakelt hij nog niet; lampen, scènes en schermen bedien je
wel vanuit de app (besluiten 97, 100 en 121).

Dit is dezelfde dienst die op de NAS draait, in de vorm die Home Assistant
verwacht. Zie besluit 34 in `DECISIONS.md` voor waarom die vorm er is.

## Wat de Supervisor gratis oplost

- **Geen token.** `SUPERVISOR_TOKEN` staat in de omgeving en Home Assistant is
  bereikbaar op `ws://supervisor/core/websocket`.
- **Inloggen.** Met Ingress zit de app achter de inlog van Home Assistant zelf;
  de dienst weet wie er kijkt en vraagt geen eigen inlog (besluit 147).
- **Meerdere architecturen, herstartbeleid en logboekbeheer.**

## Installeren

1. **Instellingen → Add-ons → Add-on store**, rechtsboven de drie puntjes →
   **Repositories**, en voeg toe:
   `https://github.com/Ricardo-switch/SunARC-HA-APP`
2. Kies **SunArc** en **Installeren**. De Pi bouwt niets: GitHub heeft
   het image al klaargezet voor aarch64 (Raspberry Pi) en amd64.
3. **Starten**, en zet **In zijbalk tonen** aan.

**Bijwerken** gaat zoals bij elke add-on: Home Assistant meldt een update zodra
er een nieuwe versie op `main` staat. Zet op de add-on-pagina **Automatisch
bijwerken** aan als dat vanzelf moet. Naar `main` gaat alleen wat via `beta` is
getest (besluit 152).

### Zelf bouwen, als lokale add-on

Om een versie te proberen die nog niet op `main` staat. De Supervisor bouwt een
lokale add-on met de map van de add-on zélf als bouwcontext, en onze code staat
een niveau hoger. Daarom wordt de boom eerst platgeslagen:

```powershell
powershell -ExecutionPolicy Bypass -File addon\stage.ps1 -Share \\homeassistant\addons\hems-climate
```

Dat zet `config.yaml`, `Dockerfile`, `run.sh` en de bronbestanden klaar, zonder
de regel `image:`, zodat de Supervisor bouwt in plaats van ophaalt. Daarna:
**Add-on store** → drie puntjes → **Vernieuwen**; hij staat onder *Local
add-ons*. Bijwerken is hetzelfde commando, gevolgd door **Herbouwen**.

### De eerste start

Gewoon starten. Er hoeft nog niets klaar te staan.

Open **SunArc** in de zijbalk. Een leeg huis begint met een welkom: de
add-on leest Home Assistant uit (etages, ruimtes, apparaten, sensoren) en zet
het huis neer. Eén knop gaat naar **Inrichten**, waar je per stap nakijkt wat
hij vond; je kunt ook een back-up terugzetten (besluit 154). Tot de
configuratie er staat, regelt hij niets en schrijft hij geen logboek (besluit
42).

Bij de eerste start zet de add-on ook het wekwoord **Hé huis** klaar in
`/share/openwakeword` (besluit 177). Herstart daarna één keer de
openWakeWord-add-on; dan staat `he_huis` bij Instellingen › Spraakassistenten.

Wil je Assist van Home Assistant zelf vragen aan SunArc laten stellen,
installeer dan de integratie SunArc: via HACS, of met de knop in de app
bij Instellingen › Bewoners en toegang › Sleutel voor de assistent (besluit
184). De add-on meldt zich daarna vanzelf aan; geen YAML. Daarvoor mag de
add-on in de configuratie van Home Assistant schrijven, en dat doet hij alleen
na die tik, in `custom_components/smart_climate`.

Wil je het bestand liever zelf schrijven, dan kan dat ook: de add-on heeft een
eigen map onder `/addon_configs/`, bereikbaar met de bestandseditor of de
Samba-add-on. Maak daarin een map `sites` en zet er je installatiebestand in:

```
sites/mijn-huis.json
```

Een bestand dat er wél staat maar niet deugt, is nog steeds een reden om te
stoppen — dat moet je repareren, en stilzwijgend doorstarten zou de fout
verbergen tot hij 's nachts opduikt (besluit 33). Er wordt ook nooit over een
bestaande configuratie heen geschreven.

## Waar dingen staan

| | Pad | Waarom daar |
| --- | --- | --- |
| Configuratie | `/config/sites/*.json` (add-on-map) | Hoort bij de installatie, niet bij de code (besluit 21) |
| Beslislogboek | `/share/hems/shadow/` | In `share` zodat je er met Samba bij kunt om het op te halen |

Eén configuratiebestand is vanzelfsprekend. Staan er meer, dan noemt de add-on
ze op en vraagt hij welke.

## Instellingen

| Optie | Standaard | Wat het doet |
| --- | --- | --- |
| `hartslag_seconden` | 30 | Hoe vaak er sowieso opnieuw wordt gerekend |
| `min_interval_seconden` | 15 | Ondergrens tussen twee evaluaties (besluit 16) |
| `bewaking_minuten` | 10 | Afsluiten na zoveel minuten zonder besluit, zodat de Supervisor herstart (besluit 18) |
| `licht_bedienen` | aan | Lampen, scènes en schermen vanuit de app (besluit 97) |
| `ha_adres` | leeg | Waar je telefoon Home Assistant opent, voor het inloggen op de eigen poort (besluit 160) |

## Wat hij níét doet

Klimaat en screens schakelen. Schrijven naar Home Assistant kan alleen voor
lampen, scènes en schermen voor de bewoner (besluiten 97, 100 en 121); al het
andere weigert `HaClient` vóórdat er iets de socket op gaat (besluit 15).

## De app

Via het zijpaneel, of **Webinterface openen** op de add-on-pagina. De app opent
op Thuis; de cijfers en de datasetmeter staan op `index.html`.

### Met één tik vanaf het startscherm

In de app van Home Assistant op Android kun je een snelkoppeling maken die
meteen SunArc opent:

1. Open SunArc in Home Assistant in een browser. Het adres eindigt op
   iets als `/a1b2c3d4_hems_climate`; dat laatste stuk, met de `/`, is het pad.
2. In de app van Home Assistant: **Instellingen › Companion-app ›
   Snelkoppelingen beheren**, en maak een **vastgezette** snelkoppeling: naam
   *SunArc*, soort *Dashboard*, het pad uit stap 1, en een icoon naar
   keuze (bijvoorbeeld `mdi:weather-sunset`, de zon op de horizon).
3. Zet hem op je startscherm.

### Als losse app, via Tailscale (besluit 160)

Zoals de app vroeger vanaf de NAS: met een eigen icoon en zonder Home Assistant
eromheen. Dit vraagt de Tailscale-add-on op dezelfde Home Assistant. De app
komt alleen in je eigen tailnet; Funnel of een portforward is niet nodig en
hoort er niet bij (besluit 108).

1. **SunArc › Configuratie.** Vul bij *ha_adres* het adres in waarop je
   telefoon Home Assistant opent, bijvoorbeeld
   `https://homeassistant.<tailnet>.ts.net` of `http://100.x.y.z:8123`. Vul
   onder *Netwerk* bij `8100/tcp` de poort `8100` in. Opslaan en herstarten. In
   het logboek staat dan "Eigen poort 8100 open, alleen via Tailscale."
2. **In de beheerpagina van Tailscale** (login.tailscale.com):
   - bij *Access controls* een tag, bijvoorbeeld `tag:homeassistant`, met
     jezelf als eigenaar (`tagOwners`);
   - bij *Services* een dienst `smartclimate`, op poort `tcp:443`;
   - bij *Access controls › Policies* een regel van `autogroup:member` naar
     `svc:smartclimate`, op `tcp:443`, zodat je telefoon de dienst mag openen.
3. **Tailscale-add-on › Configuratie:**

   ```yaml
   advertise_tags:
     - tag:homeassistant
   services:
     - name: svc:smartclimate
       target: http://127.0.0.1:8100
       protocol: https
       port: 443
   ```

   Opslaan en herstarten.
4. **Terug bij Services** in de beheerpagina: keur de Pi goed als host voor
   `smartclimate`.
5. **Op je telefoon,** in Chrome: open `https://smartclimate.<tailnet>.ts.net`,
   log in via Home Assistant, en kies in het menu **App installeren**.

Opent het adres niet, werk dan Tailscale op je telefoon bij. Het adres van de
Pi met `:8100` geeft bewust alleen "Open SunArc via het adres in
Tailscale".

## Prestaties

Gemeten op een Raspberry Pi 5 met HAOS 18.2, over een nagebouwd logboek van 180
dagen (385 MB, 1,1 miljoen momenten):

```
analyse per kwartier   21,5 s op één van vier kernen  (2,67% bezetting)
piekgeheugen           110 MB
reactietijd van HA     0,002 s in rust én tijdens de analyse
```

Zie besluit 17b. De meting is te herhalen met
`node /app/dist/main.js --benchmark <map>`.
