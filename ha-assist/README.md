# Assist vraagt Smart Climate

Fase 1 van de assistent (ONTWERP §7): je stelt een vraag aan Assist van Home
Assistant, getypt of hardop. Assist geeft hem door aan de dienst op de NAS en
spreekt het antwoord uit. **Alles leest alleen.** Home Assistant schakelt
hier niets, en de dienst ook niet. Een opdracht als "koel de zolder naar 21"
krijgt als antwoord wat Smart Climate zou doen, en dat hij nog niet mag
schakelen.

## Wat je kunt vragen

| Zin (voorbeelden) | Vraag aan de dienst |
| --- | --- |
| "Wat doe je nu?" | `v=nu` |
| "Waarom draait de zolder?", "Waarom koelt de woonkamer niet?" | `v=waarom&kamer=…` |
| "Wat ga je straks doen?" | `v=straks` |
| "Hoeveel zon vandaag?" | `v=zon` |
| "Koel de zolder naar 21", "Verwarm de woonkamer naar 21", "Mag de zolder uit?" | `v=doe&kamer=…&wens=…` |

Je kunt het ook zonder Assist proberen, in de browser:
`http://192.168.67.65:8099/api/vraag?v=waarom&kamer=zolder`, of met `&taal=en`
voor Engels.

## Installeren

1. Kopieer `custom_sentences/nl/smart_climate.yaml` naar de map
   `custom_sentences/nl/` in je Home Assistant-configuratie. Maak die map aan
   als hij er nog niet is.
2. Plak de inhoud van `configuration-assistent.yaml` onderaan
   `configuration.yaml`. Je configuratie heeft nog geen `rest_command:` of
   `intent_script:`, dus er botst niets.
3. Controleer de configuratie (Ontwikkelhulpmiddelen → YAML → Configuratie
   controleren) en herstart Home Assistant.
4. Probeer het eerst getypt: open Assist en typ "wat doe je nu".

## Snapt hij een zin niet?

Assist herkent alleen zinnen die op een patroon in `smart_climate.yaml`
passen. Twee hulpmiddelen:

- **Ontwikkelhulpmiddelen → Assist:** typ een zin en zie welke intentie hij
  herkent, en met welke kamer. Zo zie je zonder iets te vragen of een zin
  werkt.
- **Na een wijziging in de zinnen** hoef je niet te herstarten: voer
  `conversation.reload` uit (Ontwikkelhulpmiddelen → Acties).

Een zin die hij niet snapt, kan er gewoon bij. Geef hem door, dan zet ik hem
in het bestand.

## Eerst controleren

Dit is nog niet op jouw Home Assistant getest. Let bij de eerste keer op deze
drie dingen:

- **Komt er een antwoord?** Antwoordt Assist met "Smart Climate geeft nu geen
  antwoord", dan bereikt de Pi de NAS niet, of gaf de dienst een fout. Open de
  link hierboven in de browser om te kijken wat de dienst zegt.
- **Herkent Assist de zin als vraag aan Smart Climate?** Een zin die Home
  Assistant zelf ook kent, wordt soms als eigen opdracht uitgevoerd. Dan
  schakelt Assist echt, buiten de arbiter om. Daarom staat "zet de zolder uit"
  er bewust niet in. Typ elke opdrachtzin één keer terwijl je de airco in de
  gaten houdt. Gaat er iets aan of uit, haal die zin dan weg uit
  `smart_climate.yaml`.
- **Werkt het antwoord van de dienst in de uitgesproken zin?** Dat gaat via
  `action_response` in `intent_script`. Hoort of leest je een lege zin, laat
  het me weten.

## Wat er later verandert

Deze twee bestanden zijn er voor de test in dit huis. In het product doet een
eigen integratie van Smart Climate dit, zonder YAML in je configuratie
(besluit 91).

In stap B (ONTWERP §7, fase 2) gaat de opdrachtzin naar een route die echt
schakelt, via de arbiter, met de vraag tot hoe laat. De zinnen blijven
hetzelfde.
