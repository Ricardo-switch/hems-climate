# Smart Climate (Home Assistant add-on)

Klimaat en zon in één app. Smart Climate kijkt mee met je verwarming, airco's
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
   `https://github.com/Ricardo-switch/hems-climate`
2. Kies **Smart Climate** en **Installeren**. De Pi bouwt niets: GitHub heeft
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

De add-on leest Home Assistant uit — gebieden, apparaten, sensoren — en toont
in het paneel **Smart Climate** onder het tabblad *Installatie* wat hij heeft
gevonden. Wat hij zeker weet staat er als bevinding; waar hij twijfelt staat
een vraag met een keuzelijst. Eén klik op *Zo instellen* schrijft de
configuratie weg, en na een herstart begint de opname.

Tot dat moment regelt hij niets en schrijft hij geen logboek. Dat is geen fout
maar de normale toestand van een verse installatie (besluit 42).

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

## Wat hij níét doet

Klimaat en screens schakelen. Schrijven naar Home Assistant kan alleen voor
lampen, scènes en schermen voor de bewoner (besluiten 97, 100 en 121); al het
andere weigert `HaClient` vóórdat er iets de socket op gaat (besluit 15).

## De app

Via het zijpaneel, of **Webinterface openen** op de add-on-pagina. De app opent
op Thuis; de cijfers en de datasetmeter staan op `index.html`.

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
