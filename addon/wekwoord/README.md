# Het wekwoord "Hé huis"

`he_huis.tflite` is het wekwoord van de wand (besluit 150), op 17 oktober 2026
getraind met openWakeWord en de Nederlandse stemmen van Piper; er zit geen
opname van een bewoner in. De add-on zet het bij het starten in
`/share/openwakeword`, waar de openWakeWord-add-on eigen wekwoorden zoekt, als
het daar nog niet staat (besluit 177). Herstart daarna één keer de
openWakeWord-add-on; dan staat "he_huis" bij Instellingen › Spraakassistenten.

Sinds besluit 208 hoort de dienst het wekwoord zelf, met een gevoeligheid per
scherm. Daarvoor staan hier drie ONNX-bestanden, die de dienst met zijn eigen
kleine rekenaar leest (`backend/src/web/onnx.ts`, zonder bibliotheek):

- `he_huis.onnx`: hetzelfde wekwoord als `he_huis.tflite`, uit dezelfde training.
- `melspectrogram.onnx` en `embedding_model.onnx`: de twee voorstappen van
  [openWakeWord](https://github.com/dscripka/openWakeWord) (David Scripka),
  ongewijzigd uit `openwakeword/resources/models`. Het tweede is het
  spraakmodel van Google (`speech_embedding`) waar openWakeWord op traint.
  openWakeWord geeft zijn meegeleverde modellen uit onder
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); de
  code onder Apache 2.0. Dezelfde bestanden zitten in de openWakeWord-add-on
  van Home Assistant.

Alleen de `.tflite` gaat naar `/share/openwakeword`; de `.onnx`-bestanden
blijven in de add-on (`/app/wekwoord`) en, op de NAS, in het image.
