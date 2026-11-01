\# Overzicht Klimaat Helpers (UI \& YAML)



\*\*Belangrijke notitie voor de architectuur:\*\* 

De andere bijgevoegde tekstbestanden in deze map (zoals `Invoer Variabelen.txt` en `Logica Helpers.txt`) bevatten de gedetailleerde YAML-configuratie van \*sommige\* van deze helpers. Echter, veel van de onderstaande helpers zijn destijds via de Home Assistant UI aangemaakt en ontbreken daardoor in de ruwe YAML-bestanden. Beschouw deze lijst als de complete en leidende 'bron van waarheid' (Source of Truth) voor alle variabelen die in de huidige State Machine bestaan.



De nieuwe Node.js backend dient deze statussen over te nemen, uit te lezen of aan te sturen.



\## 1. Booleans (Schakelaars \& Interne Statussen)

Deze bepalen de huidige modus van het huis en de failsafes.

\* `input\_boolean.zomer\_modus\_actief` (Zomer modus visueel dashboard)

\* `input\_boolean.airco\_toestaan` (Hoofdschakelaar Airco Assist)

\* `input\_boolean.status\_airco\_assist\_actief` (Interne status)

\* `input\_boolean.airco\_assist\_start\_pending` (Startvertraging actief)

\* `input\_boolean.gratis\_pv\_verwarmen` (Hoofdregie PV verwarmen)

\* `input\_boolean.pv\_verwarmen\_actief` (Interne status PV verwarmen)

\* `input\_boolean.status\_pv\_actief` (Systeemstatus PV regeling)

\* `input\_boolean.voorverwarmen\_aan` (Schakelaar huis opwarmen voor 08:00)

\* `input\_boolean.status\_voorverwarmen\_actief` (Interne status)

\* `input\_boolean.status\_nest\_regeling\_actief` (Nest regeling actief)

\* `input\_boolean.failsafe\_klimaat\_melding\_actief` (Rate-limit voor failsafe notificaties)



\## 2. Selects (Strategie \& Modus)

Dropdowns voor het bepalen van het gedrag. De Node.js state machine moet exact deze waarden (strings) gebruiken bij het updaten van de status.

\* `input\_select.koel\_strategie`

\* `input\_select.verwarming\_modus` (Automatisch, Handmatig, Vakantie)

\* `input\_select.verwarming\_modus\_actief` (Mogelijke exacte statussen: `dag`, `voorverwarmen`, `koelen`, `nacht`, `afwezig`, `vakantie`)



\## 3. Numbers (Setpoints \& Drempelwaarden)

De harde doeltemperaturen en vermogensgrenzen.

\* `input\_number.temp\_airco\_woonkamer` \& `input\_number.temp\_airco\_woonkamer\_standaard` (Verwarmen)

\* `input\_number.temp\_airco\_woonkamer\_koelen` \& `input\_number.temp\_airco\_woonkamer\_koelen\_standaard` (Koelen)

\* `input\_number.temp\_airco\_zolder` \& `input\_number.temp\_airco\_zolder\_standaard` (Verwarmen)

\* `input\_number.temp\_airco\_zolder\_koelen` \& `input\_number.temp\_airco\_zolder\_koelen\_standaard` (Koelen)

\* `input\_number.temp\_nest\_dag` \& `input\_number.temp\_nest\_dag\_standaard`

\* `input\_number.temp\_nest\_eco` \& `input\_number.temp\_nest\_eco\_standaard`

\* `input\_number.temp\_nest\_voorwarm` \& `input\_number.temp\_nest\_voorwarm\_standaard`

\* `input\_number.badkamer\_heat\_off\_temp\_dag` \& `input\_number.badkamer\_heat\_off\_temp\_dag\_standaard`

\* `input\_number.pv\_klimaat\_start\_overschot\_w`

\* `input\_number.pv\_klimaat\_stop\_import\_w`

\* `input\_number.airco\_assist\_delta\_min` (Minimale warmtevraag setpoint - current)

\* `input\_number.airco\_assist\_min\_on\_min` (Minimum-aan-tijd in minuten)

\* `input\_number.airco\_assist\_start\_na\_min` (Minuten continu Nest-heating vóór start)



\## 4. Timers (Vertragingen ter preventie van pendelen)

\* `timer.airco\_assist\_min\_on` (Minimum-aan-tijd airco assist)

\* `timer.airco\_assist\_start\_delay` (Timer airco vertraging)

\* `timer.pv\_stabilisatie` (Voorkomt klapperen bij wisselende bewolking)

\* `timer.verwarming\_handmatig` (Timer voor handmatige overrides)



\## 5. Templates \& Sensoren (Data Ingestion)

Sensoren die de frontend voeden of data combineren. In de nieuwe architectuur berekent Node.js deze waarden idealiter zelf, in plaats van dit door Home Assistant te laten doen.

\* `sensor.verwarming\_modus\_index` \& `sensor.verwarming\_modus\_naam`

\* `sensor.airco\_assist\_reden` \& `sensor.verwarming\_uitleg` (Dashboard teksten)

\* `binary\_sensor.airco\_temps\_tijdelijk\_aangepast`

\* `binary\_sensor.setpoints\_afwijkend\_van\_standaard`

\* `binary\_sensor.dashboard\_toon\_koel\_sliders`

