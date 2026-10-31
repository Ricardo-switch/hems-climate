# Universeel: wat nog op dit huis leunt

SunArc is gebouwd in één huis. Voor de add-on (besluiten 53, 77, 91)
moet alles wat per huis verschilt een instelling zijn die de app wegschrijft,
met een voorstel uit Home Assistant (besluit 109). Dit is de stand na een
grondige controle van de code op 8 oktober 2026, bijgewerkt op 21 oktober
(besluit 172): wat al instelbaar is, wat is rechtgezet, en wat er nog ligt.

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

1. ~~**Meer buitenruimtes in de tekening.**~~ Gedaan op 9 oktober (besluit
   113): oprit, tuin, terras, voortuin en balkon hebben elk hun plek. De lamp van
   de camera op de oprit wordt nog aan de naam herkend.
2. ~~**Meer functies in de app.**~~ Gedaan op 9 oktober (besluit 111): licht
   bedienen en de weerbron staan bij Functies.
3. ~~**De tekening van het huis.**~~ Gedaan op 9 oktober (besluit 111): liggen
   de panelen op beide kanten, dan staan ze in de tekening op beide dakvlakken;
   welke etage onder het schuine dak ligt, kies je in de indeling.
4. ~~**De etages.**~~ Gedaan op 9 oktober (besluit 112): etages voeg je vrij
   toe in de indeling, met de vaste namen (3e tot begane grond, kelder) als
   voorstel. Een kelder of trapkast blijft bij de begane grond (besluit 119,
   aangevuld 14 oktober); er komt geen tekening onder de grond. Wat voor kamer
   elke kamer is, kies je ook in de indeling (besluit 119).
5. **De klimaatapparaten herkennen.** Het grootste stuk. Elke koppeling in Home
   Assistant geeft andere standen, grenzen en wel of geen vermogensmeting. De
   ontdekking (41) doet een voorstel; een wizard moet het per apparaat laten
   nakijken, en eerlijk zeggen wat niet wordt ondersteund.
6. ~~**Regels per land.**~~ Gedaan op 21 oktober (besluit 178): eigen daluren en
   geen salderen. (De hoofdzekering kent sinds 9 oktober de gangbare
   maten, 1 × 25 tot 3 × 50 A, en een eigen waarde.)
   De prijzen volgen sinds besluit 110 een Nederlands contract (normaal en dal,
   salderen tot 2027, vaste posten); de daltijden en het salderen zijn
   Nederlandse regels en worden een instelling per land.
7. **Taal.** Alles is Nederlands, ook de woordenlijst waarmee de assistent
   kamers en apparaten herkent. Tweetalig staat in besluit 86; het komt later,
   eerst Engels en dan Duits (besluit 172).
8. ~~**Onderzoeksgereedschap apart.**~~ Gedaan op 9 oktober: de lijst met
   entiteiten en personen van dit huis staat in `tools/export-history.ts`, en
   de replay-scripts die dit huis bij naam noemen in `backend/tools/onderzoek/`.
   Daarmee zitten ze niet in de dienst en niet in de add-on.
9. ~~**De wizard.**~~ Gedaan op 9 oktober (besluit 114): Inrichten zet de
   stappen op een rij en loopt langs de schermen die er al zijn. De stap Klimaat
   groeit mee met punt 5.
10. ~~**Het wekwoord "Hé huis"**~~ Gedaan op 21 oktober (besluit 177): het gaat
    mee in de add-on, die het in de map van openWakeWord zet.
11. **Assist van Home Assistant** vraagt SunArc via YAML. Het adres staat
    sinds besluit 177 in de app, zonder NAS; een eigen koppeling zonder YAML
    volgt (besluit 91).
12. ~~**Apparaten op zon**~~ Gedaan op 21 oktober (besluit 178): ook LG ThinQ,
    SmartThings van Samsung en Miele, met hun eigen woorden.
13. ~~**De terugblik**~~ Gedaan op 21 oktober (besluit 177): zonder
    YAML-voorganger vergelijkt hij met "de apparaten zelf".
14. ~~**Wat er nieuw is**~~ Gedaan op 21 oktober (besluit 177): zonder namen
    en kamers van dit huis.
15. ~~**De tijdzone**~~ Gedaan op 21 oktober (besluit 177): zonder configuratie
    die van de dienst, in de add-on die van Home Assistant.
16. ~~**De kamerwoorden.**~~ Gedaan op 21 oktober (besluit 172): één lijst met
    het goede lidwoord, in de dienst en de app.

## Bewust zo, en geen probleem

- De Hue-scènes: de app leest de groep uit Hue, en scènes van Home Assistant
  zelf werken ook.
- Uitstelbare apparaten worden herkend aan wat op afstand kan starten; de naam
  (droger, wasmachine, vaatwasser) is alleen een voorstel.
- De NAS-uitrol (`deploy.sh`, de sparse checkout, Tailscale) hoort bij deze
  installatie; de add-on heeft een eigen route.
- Het blok `migration` in de configuratie hoort bij een huis met een
  voorganger in YAML, en is al optioneel.
