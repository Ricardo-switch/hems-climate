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
- **Buitenruimtes:** het tuinhuis, de overstek en de auto op de oprit hingen aan
  de naam van de ruimte en de lampen. Nu kies je in de indeling per
  buitenruimte wat het is (oprit, tuin, terras, balkon) en of er een auto of een
  tuinhuis bij hoort. Welke lamp het tuinhuis verlicht: een lamp in een zone die
  zo heet. Zonder keuze doet de dienst een voorstel uit de naam.

## Wat er nog ligt, op volgorde

1. **Meer buitenruimtes in de tekening.** Er past één oprit en één tuin,
   terras of balkon. Een tweede buitenruimte staat in de lijsten, niet in de
   tekening. De lamp van de camera op de oprit wordt nog aan de naam herkend
   ("camera", "schijnwerper").
2. ~~**Meer functies in de app.**~~ Gedaan op 9 oktober (besluit 111): licht
   bedienen en de weerbron staan bij Functies.
3. ~~**De tekening van het huis.**~~ Gedaan op 9 oktober (besluit 111): liggen
   de panelen op beide kanten, dan staan ze in de tekening op beide dakvlakken;
   welke etage onder het schuine dak ligt, kies je in de indeling.
4. **De etages.** Vier vaste etages (besluit 95): tweede verdieping, eerste,
   begane grond, buiten. Een kelder, een appartement op één laag of een huis met
   meer lagen past daar niet in. Besluit 95 moet daarvoor herzien.
5. **De klimaatapparaten herkennen.** Het grootste stuk. Elke koppeling in Home
   Assistant geeft andere standen, grenzen en wel of geen vermogensmeting. De
   ontdekking (41) doet een voorstel; een wizard moet het per apparaat laten
   nakijken, en eerlijk zeggen wat niet wordt ondersteund.
6. **Regels per land.** (De hoofdzekering kent sinds 9 oktober de gangbare
   maten, 1 × 25 tot 3 × 50 A, en een eigen waarde.)
   De prijzen volgen sinds besluit 110 een Nederlands contract (normaal en dal,
   salderen tot 2027, vaste posten); de daltijden en het salderen zijn
   Nederlandse regels en worden een instelling per land.
7. **Taal.** Alles is Nederlands, ook de woordenlijst waarmee de assistent
   kamers en apparaten herkent. Tweetalig staat in besluit 86, en is nog niet
   gebouwd.
8. ~~**Onderzoeksgereedschap apart.**~~ Gedaan op 9 oktober: de lijst met
   entiteiten en personen van dit huis staat in `tools/export-history.ts`, en
   de replay-scripts die dit huis bij naam noemen in `backend/tools/onderzoek/`.
   Daarmee zitten ze niet in de dienst en niet in de add-on.
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
