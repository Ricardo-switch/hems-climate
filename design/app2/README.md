# Ontwerp 2: het huis in zijn eigen lucht

Een nieuwe ronde schetsen voor de bewonersapp, na de vergelijking van de
schetsen met de proefomgeving op 8 oktober 2026. De vorige set staat in
`../app/`. Ontwerp 2 is een voorstel; of het de maatstaf van besluit 71 wordt,
beslist de bewoner.

Te bekijken als overzicht op claude.ai (privé): <https://claude.ai/artifact/19gvuet85uv5fsxLGQnSYH>

## Wat er anders is

- **Het huis in 3D.** Een opengewerkt poppenhuis, schuin van voren, getekend
  door `frontend/kit/huis.js` (SVG, geen 3D-motor: licht genoeg voor de tablet). Het
  bouwt zich op uit een beschrijving: etages en kamers uit de indeling, en
  alleen wat het huis heeft: panelen, buitenunit, batterij, laadpaal met auto.
  Wat er nog niet is, kan gestippeld staan (`spook`).
- **De lucht van het moment.** De achtergrond is dag, avond, nacht, bewolkt of
  winter. Zo ziet ook een moment zonder zon er levend uit.
- **Getallen op het huis.** Labels wijzen naar de panelen, de batterij, de
  auto. Het vermogen staat bij de panelen, niet bij de zon.
- **Kamers kleuren naar wat er gebeurt:** ijs koelt, gloed verwarmt, amber
  wacht op zon, mint is goed; 's avonds de kleur van de lampen die branden.
- **Vijf tabs:** Thuis, Vandaag, Apparaten, Opbrengst, Assistent. Bedienen doe
  je in het huis (etage, kamer, apparaat). De modus staat bovenin op Thuis.
  Instellen zit achter het tandwiel. Vandaag is Waarom en Plan samen.
- **De uitleg van het huis** de eerste keer als rondleiding over het echte
  huis, daarna achter "Zo werkt het huis".
- **De indeling** zit achter het tandwiel (Instellingen › Kamers en
  indeling): een bewerkstand op het huis zelf, waar je apparaten naar een kamer
  sleept, zones maakt en kamers en etages toevoegt. Komt er een apparaat bij in
  Home Assistant, dan staat er op Thuis één regel die ernaar wijst.

## Schermen

| Wand (1280 × 800) | Telefoon (390 breed) |
| --- | --- |
| `Wand-Thuis` zomermiddag, `Wand-Thuis-avond`, `Wand-Thuis-winter` | `Thuis` |
| `Wand-Vandaag` | `Vandaag` |
| `Wand-Apparaten` | `Apparaten` |
| `Wand-Kamer`, `Wand-Bedienen` (screen, airco, thermostaat) | `Lamp` |
| `Wand-Opbrengst` | `Opbrengst` |
| `Wand-Huis-groeit` (wat je huis kan) | `Instellingen`, `Onboarding-Zon` |
| `Wand-Assistent` | |
| `Wand-Indeling` (kamers en indeling, de bewerkstand) | |
| `Wand-Indeling-Groep` (Kamers en indeling als groep zoals Energie: `#buiten` met wat er rond het huis is, `#los`; besluit 193) | `Tel-Indeling-Groep` (de lijst, `#deel`, `#buiten`) |
| `Wand-Leren` (leren, meekijken, regelen per apparaat) | |
| `Wand-Uitleg` (de rondleiding de eerste keer) | |
| `Wand-Inrichten-Panelen` (hoe de panelen liggen: voorstel, `#aanpassen`, `#wachten`; besluit 157) | `Panelen-Tel` |
| `Wand-Inrichten-Klimaat` (wat elk apparaat kan, per koppeling; `#badkamer`, `#keuken`, `#ir`; schets, nog niet besloten) | |
| `Wand-Sluipverbruik` (Opbrengst › Sluipverbruik: `#maanden`, en `#kaarten` met de tegel, de melding, de assistent en Wat je huis kan; schets, nog niet besloten) | `Tel-Sluipverbruik` |
| `Wand-Thuis` blijft | `Thuis-Tel` (Thuis opnieuw: de Assistent altijd boven de tabs; besluit 159) |
| `Wand-Thuis-Eigen` (de wand naar eigen smaak: `#aanpassen`, `#kiezen`), `Wand-Nacht` (avondstand, dagstand `#rust`, uit `#uit`, `#kiezen`; besluiten 164 en 165) | `Thuis-Tel-Eigen` (favorieten, `#aanpassen`, `#toevoegen`, `#favorieten`, `#weergave`, `#eenvoudig`) |
| `Wand-Thuis-3` (huis 3.0: het eiland met `#dag`, `#avond`, `#nacht`, `#winter`, `#regen`, en `#aanpassen` met smal of breed), `Wand-Huis-3` (de woningtypes `#rij`, `#hoek`, `#tweekap`, `#appartement`, `#minder`, `#zoom`), `Wand-Energie-Panelen-3` (`#gemeten`, `#leert`, `#garage`, `#zelf`), `Wand-Huis-kan-3` (zes groepen, `#ligging`); besluit 187 | `Tel-Huis-3` (één bovenbalk en het net onder het huis; `#avond`, `#balk`) |
| `Wand-Favorieten` (twaalf favorieten, vier per pagina, met het icoon van de kamer; `#kiezen` het kiesblad met de volgorde en een filter), `Wand-Rook` (het alarm bij rook; `#onderhoud` de rookmelders bij Onderhoud; besluit 170) | |
| `Wand-Instellingen-Groep` (een groep op de wand: grote regels links, wat mist bovenaan, het deel zonder scrollen, uitleg achter "Waarvoor is dit?"; `#hulp`) | `Instellingen-Tel-Groep` (een groep instellingen: de delen onder elkaar in plaats van een rij om opzij te schuiven; `#deel`, `#comfort`, `#nu`) |
| | `Instellingen-Tel-Meldingen` (Jij › Meldingen op je telefoon; `#melding` het slotscherm, `#geen` zonder telefoon; besluit 183) |
| | `Thuis-Tel-Kaarten` (de auto, de batterij, deze maand en de deurbel als kaart; `#licht`, `#anders` andere standen; besluit 182) |
| `Wand-Thuis-Profiel` (de wand in de kleur, met de kaarten en favorieten, van wiens comfort geldt; ieder die thuis is in zijn eigen kleur; besluit 181) | `Thuis-Tel-Licht` (Thuis in het lichte thema, met violet), `Instellingen-Tel-Jij` (Jij: alles van één bewoner; `#thema` het blad Thema en kleur, `#donker` hetzelfde in het donker) |

Voorbeeldgetallen. Schermafdrukken in `screens/`, opnieuw te maken met
`node render.cjs Wand-Thuis.html:1280:800 Thuis.html:390:844:vol`.

De tekenmotor en de stijlbasis staan in `frontend/kit/` en niet hier: de app
gebruikt precies die bestanden (besluit 104), en de NAS checkt `design/` niet
uit. De schetsen laden ze via `../../frontend/kit/`. Voor het overzicht op
claude.ai gaan ze mee als `kit/…`, met de verwijzingen in een kopie herschreven.
