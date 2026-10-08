# Ontwerp 2: het huis in zijn eigen lucht

Een nieuwe ronde schetsen voor de bewonersapp, na de vergelijking van de
schetsen met de proefomgeving op 8 oktober 2026. De vorige set staat in
`../app/`. Ontwerp 2 is een voorstel; of het de maatstaf van besluit 71 wordt,
beslist de bewoner.

Te bekijken als overzicht op claude.ai (privé): <https://claude.ai/artifact/19gvuet85uv5fsxLGQnSYH>

## Wat er anders is

- **Het huis in 3D.** Een opengewerkt poppenhuis, schuin van voren, getekend
  door `kit/huis.js` (SVG, geen 3D-motor: licht genoeg voor de tablet). Het
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
- **De indeling** pas je aan in het huis zelf (een bewerkstand op de etage);
  Instellingen › Kamers en indeling opent dezelfde bewerkstand.

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
| `Wand-Leren` (leren, meekijken, regelen per apparaat) | |
| `Wand-Uitleg` (de rondleiding de eerste keer) | |

Voorbeeldgetallen. Schermafdrukken in `screens/`, opnieuw te maken met
`node render.cjs Wand-Thuis.html:1280:800 Thuis.html:390:844:vol`.
