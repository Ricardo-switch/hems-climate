# Het wekwoord dat de dienst zelf hoort

Sinds besluit 208 hoort de dienst "Hé huis" zelf, met een gevoeligheid per
scherm. Daarvoor staan hier drie ONNX-bestanden, die de dienst met zijn eigen
kleine rekenaar leest (`src/web/onnx.ts`, zonder bibliotheek). Ze gaan mee in
het image van de NAS en in de add-on (`/app/wekwoord`), naast `dist/`.

- `he_huis.onnx`: hetzelfde wekwoord als `addon/wekwoord/he_huis.tflite`, uit
  dezelfde training van 17 oktober 2026 (besluit 150), zonder opname van een
  bewoner.
- `melspectrogram.onnx` en `embedding_model.onnx`: de twee voorstappen van
  [openWakeWord](https://github.com/dscripka/openWakeWord) (David Scripka),
  ongewijzigd uit `openwakeword/resources/models`. Het tweede is het
  spraakmodel van Google (`speech_embedding`) waar openWakeWord op traint.
  openWakeWord geeft zijn meegeleverde modellen uit onder
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); de
  code onder Apache 2.0. Dezelfde bestanden zitten in de openWakeWord-add-on
  van Home Assistant.

Toetsen op opnames: `npx tsx tools/wekwoord-toets.ts wekwoord <positief> <negatief>`.
