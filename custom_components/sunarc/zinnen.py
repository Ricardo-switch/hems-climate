"""Het zinnenbestand voor Assist (besluit 184).

Assist herkent alleen zinnen uit een bestand in ``custom_sentences/<taal>/``.
De integratie schrijft daar één eigen bestand, ``sunarc.yaml``, en
houdt het bij. Wat erin staat, maakt SunArc zelf (``/api/assist``):
de zinnen en de kamers van dit huis. Zo komt een nieuwe zin met een gewone
update van de add-on, en hoeft de integratie bijna nooit bij.

Zonder Home Assistant te importeren, zodat het los te toetsen is.
"""

from __future__ import annotations

import json
from typing import Any

INTENTIE = "SmartClimateVraag"
BESTAND = "sunarc.yaml"
#: Het bestand van de integratie onder haar oude naam (smart_climate); weg bij het opzetten.
OUD_BESTAND = "smart_climate.yaml"

KOP = """# SunArc: de zinnen voor Assist.
# Dit bestand is van de integratie SunArc: die maakt het, werkt het bij
# met de kamers van je huis, en haalt het weg als je de integratie verwijdert.
# Wijzigen heeft geen zin; een zin die mist, kan er in SunArc bij.
"""


def tekst(gegevens: dict[str, Any]) -> str:
    """Het bestand: een kop met uitleg, en de zinnen. JSON is ook YAML, en zo staat er nooit een fout in."""
    if not isinstance(gegevens, dict) or "intents" not in gegevens:
        raise ValueError("geen zinnen van SunArc")
    return KOP + json.dumps(gegevens, ensure_ascii=False, indent=2) + "\n"


def talen(info: dict[str, Any]) -> dict[str, str]:
    """Per taal het bestand, uit wat SunArc gaf; een taal zonder zinnen slaan we over."""
    uit: dict[str, str] = {}
    for taal, gegevens in (info.get("zinnen") or {}).items():
        if isinstance(taal, str) and taal.isalpha() and len(taal) <= 3:
            try:
                uit[taal] = tekst(gegevens)
            except ValueError:
                continue
    return uit
