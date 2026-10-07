# De bewonersapp: de maatstaf

Schetsen van hoe Smart Climate eruitziet voor wie erin woont: dertien
telefoonschermen en twaalf schermen voor een tablet aan de muur, waarvan drie
voor de winter en drie voor het inzoomen. Bijgewerkt op 7 oktober 2026 met wat
er sindsdien gebouwd of besloten is: de zon op zijn boog over het huis, licht
met kleur en scènes, de apparaten op zon, "Hoe voelt het?" en de hoofdzekering. Besluit 71 maakt
ze de maatstaf voor stap F (het bewonersdashboard) en G (de assistent): wat
gebouwd wordt, wordt hiernaast gelegd.

Ook te bekijken als canvas op claude.ai (privé, alleen voor de eigenaar):
<https://claude.ai/artifact/Wc7WrUvPW885wq7ZMWtjkw>

Hoe het samenhangt, wat vastligt en wat nog open is: [ONTWERP.md](ONTWERP.md).

De proefomgeving staat naast de schaduwpagina: `nieuw.html` op de NAS (bron
in `frontend/src/nieuw.html` en `nieuw.js`), op dezelfde live gegevens. Hij
wordt de app en blijft dun: alles wat hij toont, komt uit de dienst (besluit
94).

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
| Wand · Thuis, Plan en Kamer in de winter | `Wand-Thuis-winter.dc.html`, `Wand-Plan-winter.dc.html`, `Wand-Kamer-winter.dc.html` | Een koude dag: cv en radiatoren, de airco als warmtepomp op zon, voorverwarmen; voorbeeldgetallen, gemarkeerd op het scherm |
| Het huis als navigatie | `Wand-Inzoomen.dc.html`, `Wand-Etage.dc.html`, `Wand-Ruimte.dc.html`, `Etage.dc.html`, `Ruimte.dc.html` | Inzoomen van huis naar etage naar ruimte, met lampen en screens erin; een apparaat aantikken om het te bedienen (ONTWERP §4) |
| Telefoon · Lamp | `Lamp.dc.html`, `Lamp-wit.dc.html` | Een lamp bedienen: helderheid, wit van warm tot koel, kleur, en de Hue-scènes van de ruimte (ONTWERP §4) |
| Telefoon · Apparaten op zon | `Apparaten.dc.html` | Wasmachine, droger en vaatwasser: wanneer ze op zon beginnen, en klaar voor welke tijd (besluit 98) |
| Telefoon · Onboarding stap 3 | `Onboarding-Zon.dc.html` | De panelen, de zonnesensor, de hoofdzekering en de apparaten op zon |

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
