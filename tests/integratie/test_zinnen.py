"""Het zinnenbestand voor Assist (besluit 184): wat Smart Climate geeft, met een kop erboven.

Draaien: ``python -m unittest discover -s tests/integratie -p "test_zinnen.py"``.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "custom_components" / "smart_climate"))

import zinnen  # noqa: E402

GEGEVENS = {"language": "nl", "intents": {zinnen.INTENTIE: {"data": [{"sentences": ["wat doe je nu"], "slots": {"vraag": "nu"}}]}}, "lists": {"kamer": {"values": [{"in": "(zolder|hobbykamer)", "out": "zolder"}]}}}


class ZinnenTest(unittest.TestCase):
    def test_het_bestand_is_te_lezen_met_een_kop_erboven(self):
        inhoud = zinnen.tekst(GEGEVENS)
        self.assertTrue(inhoud.startswith("# Smart Climate: de zinnen voor Assist."))
        self.assertEqual(json.loads("\n".join(r for r in inhoud.splitlines() if not r.startswith("#"))), GEGEVENS)

    def test_per_taal_wat_smart_climate_gaf(self):
        uit = zinnen.talen({"zinnen": {"nl": GEGEVENS, "en": {"language": "en"}, "../etc": GEGEVENS}})
        # Engels zonder zinnen, en een rare taalnaam, slaan we over.
        self.assertEqual(list(uit), ["nl"])
        self.assertEqual(zinnen.talen({}), {})

    def test_weigert_iets_wat_geen_zinnen_zijn(self):
        with self.assertRaises(ValueError):
            zinnen.tekst({"language": "nl"})


if __name__ == "__main__":
    unittest.main()
