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

1. **Instellingen → Add-ons → Add-on store**, rechtsboven de drie puntjes →
   **Repositories**, en voeg toe:
   `https://github.com/Ricardo-switch/hems-climate`
2. Installeer *Smart Climate OS — schaduwmodus*. De eerste keer bouwen duurt op
   een Raspberry Pi een paar minuten.
3. **Zet je configuratie neer** vóór de eerste start. De add-on heeft een eigen
   map onder `/addon_configs/`, bereikbaar met de bestandseditor of de
   Samba-add-on. Maak daarin een map `sites` en zet er je installatiebestand in:

   ```
   sites/mijn-huis.json
   ```

   Zonder dat bestand stopt de add-on met een melding in plaats van in een
   herstartlus te belanden — dat laatste is één keer gebeurd en dat is niet
   grappig (besluit 33).
4. Starten. In het logboek staat wat hij leest en waar hij schrijft.

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
