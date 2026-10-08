# Universeel: wat nog op dit huis leunt

Smart Climate is gebouwd in één huis. Voor de add-on (besluiten 53, 77, 91)
moet alles wat per huis verschilt een instelling zijn die de app wegschrijft,
met een voorstel uit Home Assistant (besluit 109). Dit is de stand na een
grondige controle van de code op 8 oktober 2026: wat al instelbaar is, wat in
deze ronde is rechtgezet, en wat er nog ligt, op volgorde.

## Al instelbaar

**In de configuratie van het huis** (`config/sites/<huis>.json`, besluiten 9,
40, 41): de zones en hun doelen, de klimaatapparaten, het vermogen en de
drempels, het dagschema, wie er thuis is, de modusschakelaar, de timers, de
zon en de panelen, de buitentemperatuur, de opbrengstsensor, uitstelbare
apparaten zoals de droger, de fasen en de marge, de gevels, en wat alleen
vastgelegd wordt. De ontdekking (`--discover`) en de eerste-keerpagina doen
hier een voorstel voor.

**In de app, als eigen bestand naast de dataset:**

| Bestand | Scherm | Besluit |
| --- | --- | --- |
| `indeling.json` | Kamers en indeling | 96 |
| `aansluiting.json` | Zon en aansluiting | 103 |
| `energie.json` | Meters en prijzen | 102 |
| `functies.json` | Camera's en deurbel | 109 |
| `gevoel.ndjson` | Hoe voelt het? (Thuis) | 84 |
| `uitstel` | Klaar voor (Apparaten) | 101 |

## Rechtgezet in deze ronde (besluit 109)

- **Camera's:** de app toonde elke camera met het Reolink-beeld "sub". Nu kies
  je per camera of hij in de app staat en met welk beeld.
- **Deurbel:** alleen een Reolink-bezoekersmelder telde. Nu herkent de dienst
  ook een gebeurtenis met de klasse deurbel (Ring, Nest en andere) en, als
  kandidaat, wat zo heet. Je kiest de melder, de camera, of het scherm aangaat,
  en hoe lang het beeld blijft.
- **Thuis:** de namen "Airco woonkamer" en "Airco zolder" stonden vast in de
  code, en alleen apparaten met een id die met `ac-` begint telden. Nu komen
  namen en soort uit het huis.
- **Thuis, Hoe voelt het:** begon altijd bij de zone `woonkamer`. Nu bij de
  kamer met een regeling op de laagste etage.
- **Het dak:** toonde twaalf panelen, ook zonder panelen. Nu het aantal uit Zon
  en aansluiting, of een schatting uit de wattpiek; zonder panelen geen.
- **Vandaag:** kleur en zin hingen aan `ac-` en `nest` in de id. Nu aan wat het
  apparaat kan.

## Wat er nog ligt, op volgorde

1. **Buitenruimtes in de tekening.** Er past één oprit en één tuin. Het
   tuinhuis, de overstek en de schijnwerper worden op naam van de lampen
   herkend, en er staat altijd een auto op de oprit. Wordt: per buitenruimte een
   soort in de indeling (oprit, tuin, terras, balkon), met "auto" en "tuinhuis"
   als keuze.
2. **Meer functies in de app.** Licht bedienen staat nu aan of uit in `.env`
   (`HEMS_LIGHTS`); dat wordt een functie, met `.env` als bovengrens. Het weer
   komt alleen van Buienradar; dat wordt een keuze uit elke weer-entiteit in
   Home Assistant.
3. **De tekening van het huis.** Panelen liggen altijd op het rechter dakvlak;
   de ligging uit Zon en aansluiting (voorkant, achterkant, beide, plat) moet
   meetellen. Het dak wordt herkend aan de naam "zolder" of aan drie lagen; dat
   wordt een keuze bij de etage.
4. **De etages.** Vier vaste etages (besluit 95): tweede verdieping, eerste,
   begane grond, buiten. Een kelder, een appartement op één laag of een huis met
   meer lagen past daar niet in. Besluit 95 moet daarvoor herzien.
5. **De klimaatapparaten herkennen.** Het grootste stuk. Elke koppeling in Home
   Assistant geeft andere standen, grenzen en wel of geen vermogensmeting. De
   ontdekking (41) doet een voorstel; een wizard moet het per apparaat laten
   nakijken, en eerlijk zeggen wat niet wordt ondersteund.
6. **Aansluiting en regels.** De hoofdzekering kent alleen 1 × 25, 1 × 35 en
   3 × 25 A; daar horen ook 1 × 40, 3 × 35, 3 × 40 en een eigen waarde bij.
   Salderen tot 2027 en prijzen in euro zijn Nederlandse regels; die worden een
   instelling per land.
7. **Taal.** Alles is Nederlands, ook de woordenlijst waarmee de assistent
   kamers en apparaten herkent. Tweetalig staat in besluit 86, en is nog niet
   gebouwd.
8. **Onderzoeksgereedschap apart.** `tools/export-history.ts` en de
   replay-scripts (`backend/src/replay/decision-*.ts`, `compare.ts`,
   `sweep.ts`) noemen entiteiten en personen van dit huis bij naam. Ze horen
   niet in de app of de add-on; ze gaan naar een eigen map, buiten het image.
9. **De wizard.** Als 1 tot en met 6 er zijn, zet de wizard de schermen achter
   elkaar: gevonden apparaten, je huis, zon en aansluiting, meters en prijzen,
   camera's en deurbel, comfort per kamer. Samen met de add-on en de integratie
   (53, 77, 91).

## Bewust zo, en geen probleem

- De Hue-scènes: de app leest de groep uit Hue, en scènes van Home Assistant
  zelf werken ook.
- Uitstelbare apparaten worden herkend aan wat op afstand kan starten; de naam
  (droger, wasmachine, vaatwasser) is alleen een voorstel.
- De NAS-uitrol (`deploy.sh`, de sparse checkout, Tailscale) hoort bij deze
  installatie; de add-on heeft een eigen route.
- Het blok `migration` in de configuratie hoort bij een huis met een
  voorganger in YAML, en is al optioneel.
