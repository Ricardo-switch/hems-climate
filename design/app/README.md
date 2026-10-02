# De bewonersapp: de maatstaf

Schetsen van hoe Smart Climate eruitziet voor wie erin woont: zeven
telefoonschermen en zes schermen voor een tablet aan de muur. Besluit 71 maakt
ze de maatstaf voor stap F (het bewonersdashboard) en G (de assistent): wat
gebouwd wordt, wordt hiernaast gelegd.

Ook te bekijken als canvas op claude.ai (privé, alleen voor de eigenaar):
<https://claude.ai/artifact/Wc7WrUvPW885wq7ZMWtjkw>

Hoe het samenhangt, wat vastligt en wat nog open is: [ONTWERP.md](ONTWERP.md).

## Wat er staat

| Scherm | Bestand | Waarover |
| --- | --- | --- |
| Telefoon · Thuis | `Main.dc.html` | Hoe het huis er nu voor staat |
| Telefoon · Waarom | `Waarom.dc.html` | Elk besluit van vandaag, met de reden |
| Telefoon · Opbrengst | `Opbrengst.dc.html` | Wat het oplevert, gemeten in schaduwmodus |
| Telefoon · Assistent | `Assistent.dc.html` | Uitleg, en een opdracht met een voorstel voor later en de vraag tot hoe laat (besluit 75) |
| Telefoon · Bediening | `Bediening.dc.html` | Modus, comfort per kamer, wie stuurt, gekoppeld |
| Wand · Thuis | `Wand-Thuis.dc.html` | Het huis als doorsnede, met de stroom van zon naar airco |
| Wand · Assistent | `Wand-Assistent.dc.html` | Een gesproken vraag, beantwoord met een grafiek |
| Wand · Plan | `Wand-Plan.dc.html` | Vooruitkijken; kan pas na het thermisch model (D) |
| Wand · Thuis met echte data | `Wand-Thuis-echt.dc.html` | Hetzelfde scherm, gevuld met het logboek van 1 oktober 2026, 23:01 |
| Wand · Leren | `Wand-Leren.dc.html` | De eerste week in een nieuw huis, zonder oud systeem, met wat de bewoner kan doen |
| Telefoon · Onboarding | `Onboarding.dc.html` | Stap 2 van 4: klopt wat uit Home Assistant kwam? |
| Telefoon · Kamers | `Kamers.dc.html` | Kamers per etage, apparaten aanpassen, verplaatsen of uit de regeling halen, en een voorstel uit Home Assistant |
| Wand · Kamer | `Wand-Kamer.dc.html` | Eén kamer zelf bedienen, en wat er gebeurt als de bewoner het overneemt (besluit 74) |

`screens/` heeft van elk scherm een screenshot, en `Wand-aan-de-muur.png`
laat het Thuis-scherm zien op een tablet aan de muur.

## Welke getallen echt zijn

Alleen `Wand-Thuis-echt` is volledig echt: elk getal komt uit het logboek van
de NAS. In de andere schermen klopt de redenering met de besluiten van 1
oktober (de woonkamer start om 12:07, de zolder wacht op stabilisatie, het oude
systeem zette de zolder om 12:11 aan), maar zijn de bedragen, percentages en
voorspellingen voorbeelden. `Wand-Leren` gaat over een verzonnen huis.

## Bekijken en opnieuw maken

De bestanden openen gewoon in een browser. `support.js` hoort bij de
canvasomgeving op claude.ai en ontbreekt hier; dat geeft niets.

Screenshots opnieuw maken, vanuit deze map, met de Playwright uit `backend/`
(lokaal Edge, zoals de page-test):

```bash
node render.cjs Wand-Thuis.dc.html:1280:800 Main.dc.html:390:844
node render.cjs Wand-aan-de-muur.html:1600:1000
```

`Wand-aan-de-muur.html` gebruikt `screens/Wand-Thuis.png`; maak die dus eerst.
