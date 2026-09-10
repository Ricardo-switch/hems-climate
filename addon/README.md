# Smart Climate OS — schaduwmodus (Home Assistant add-on)

Laat de arbiter meedenken naast je bestaande regeling en legt elk besluit vast,
zonder iets te schakelen.

Dit is dezelfde dienst die op de NAS draait, in de vorm die Home Assistant
verwacht. Zie besluit 34 in `DECISIONS.md` voor waarom die vorm er komt.

## Wat de Supervisor gratis oplost

Drie dingen die we anders zelf hadden moeten bouwen:

- **Geen token meer.** `SUPERVISOR_TOKEN` staat in de omgeving en Home Assistant
  is bereikbaar op `ws://supervisor/core/websocket`. Geen long-lived token dat je
  moet plakken, dat verloopt, of dat in een `.env` belandt.
- **Authenticatie voor de weergave.** Met Ingress zit de pagina achter de inlog
  van Home Assistant zelf. Dat schrapt het openstaande punt uit besluit 23 — de
  weergave had geen enkele beveiliging, wat thuis verdedigbaar was en bij iemand
  anders niet.
- **Meerdere architecturen, herstartbeleid en logboekbeheer.**

## Installeren

Twee routes. Welke je kunt nemen hangt af van één ding: of deze repository
openbaar is.

### Nu: als lokale add-on

Zolang de repository privé is, kan Home Assistant hem niet als add-on-bron
toevoegen — de Supervisor haalt add-on-bronnen met een gewone `git clone` op en
heeft nergens een plek voor inloggegevens.

De Supervisor bouwt een add-on bovendien met de map van de add-on zélf als
bouwcontext: hij koppelt alleen die map aan en draait daar `docker buildx build
.`. Onze code staat een niveau hoger, in `backend/` en `frontend/`. Daarom
wordt de boom eerst platgeslagen:

```powershell
powershell -ExecutionPolicy Bypass -File addon\stage.ps1 \
  -Share \\homeassistant\addons\hems-climate
```

Dat zet een map van een halve megabyte klaar met `config.yaml`, `Dockerfile`,
`run.sh` en de bronbestanden ernaast, en kopieert hem naar de add-on-share.
Zonder `-Share` blijft het resultaat in `dist-addon/` staan en kopieer je het
zelf.

Daarna in Home Assistant: **Instellingen → Add-ons → Add-on store**, rechtsboven
de drie puntjes → **Vernieuwen**. Hij verschijnt onder *Local add-ons*.

Bijwerken is hetzelfde commando nog een keer, gevolgd door **Herbouwen** op de
add-on-pagina.

### Later: als add-on-bron

Zodra de repository openbaar is (of in een eigen, openbare add-on-repository
staat), gaat het zoals gebruikelijk: **Repositories** → de URL van deze
repository toevoegen. `repository.yaml` in de wortel staat daar al klaar voor.
Dan vervalt `stage.ps1` niet — de Supervisor heeft dezelfde platte vorm nodig,
dus de add-on krijgt dan een eigen repository waarin die vorm de vorm *is*.

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

## Wat hij níét doet

Schakelen. `HaClient` wordt zonder schrijfrechten aangemaakt en `callService`
werpt vóórdat er iets de socket op gaat (besluit 15). Een test draait een
volledige sessie tegen een nagebootste Home Assistant en controleert dat er geen
enkele `call_service` aankomt.

## De weergave

Via het zijpaneel, of Ingress vanuit de add-on-pagina. Twee tabbladen: de
huidige stand en de terugblik over de logboeken. Daarboven een datasetmeter die
laat zien hoe compleet de opname is — dagen per seizoen, en welke modi,
strategieën en richtingen ooit zijn afgegaan (besluit 27).

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
