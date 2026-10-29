# Het wekwoord "Hé huis"

`he_huis.tflite` is het wekwoord van de wand (besluit 150), op 17 oktober 2026
getraind met openWakeWord en de Nederlandse stemmen van Piper; er zit geen
opname van een bewoner in. De add-on zet het bij het starten in
`/share/openwakeword`, waar de openWakeWord-add-on eigen wekwoorden zoekt, als
het daar nog niet staat (besluit 177). Herstart daarna één keer de
openWakeWord-add-on; dan staat "he_huis" bij Instellingen › Spraakassistenten.

Sinds besluit 208 hoort de dienst het wekwoord ook zelf, met een gevoeligheid
per scherm. Die ONNX-bestanden staan in `backend/wekwoord/` (de NAS checkt
`addon/` niet uit); zie de LEESMIJ daar. Alleen de `.tflite` gaat naar
`/share/openwakeword`.
