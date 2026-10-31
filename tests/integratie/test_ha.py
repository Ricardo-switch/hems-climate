"""De integratie SunArc in een echte Home Assistant (besluit 184).

Toevoegen met de hand en ontdekt via de add-on, het eigen zinnenbestand, een
vraag van Assist, en weer weg. SunArc zelf is nagebootst.
"""

import json
from pathlib import Path

import pytest

from homeassistant import config_entries
from homeassistant.setup import async_setup_component
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import intent

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.smart_climate.const import DOMAIN

try:
    from homeassistant.helpers.service_info.hassio import HassioServiceInfo
except ImportError:  # Een oudere Home Assistant.
    from homeassistant.components.hassio import HassioServiceInfo

ADRES = "http://abcd1234-hems-climate:8099"
SLEUTEL = "een-lange-sleutel-voor-de-assistent"
# De echte zinnen zoals de dienst ze maakt (backend/test/zinnen.test.ts houdt dit voorbeeld bij).
ZINNEN = json.loads((Path(__file__).parent / "zinnen_voorbeeld.json").read_text(encoding="utf-8"))
ZINNEN_EN = json.loads((Path(__file__).parent / "zinnen_voorbeeld_en.json").read_text(encoding="utf-8"))
INFO = {"naam": "SunArc", "versie": "0.58.0", "talen": ["nl", "en"], "kamers": [{"id": "zolder", "naam": "Zolder", "woorden": ["hobbykamer"]}], "zinnen": {"nl": ZINNEN, "en": ZINNEN_EN}}


@pytest.fixture(autouse=True)
async def opruimen(hass: HomeAssistant):
    """Na elke test de integratie afsluiten, met zijn timer: anders blijft die hangen.

    Eerst wachten tot wat nog loopt klaar is, zoals het herladen na een nieuwe
    sleutel; anders weigert Home Assistant het afsluiten (22 oktober 2026, één
    keer in de CI).
    """
    yield
    await hass.async_block_till_done()
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state.recoverable:
            await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()


@pytest.fixture(autouse=True)
async def basis(hass: HomeAssistant) -> None:
    """Het gesprekdeel van Home Assistant heeft de basis nodig, zoals in een echte installatie, met een configuration.yaml."""
    configuratie = Path(hass.config.path("configuration.yaml"))
    if not configuratie.exists():
        await hass.async_add_executor_job(configuratie.write_text, "", "utf-8")
    assert await async_setup_component(hass, "homeassistant", {})


def _zinnen(hass: HomeAssistant) -> Path:
    return Path(hass.config.path("custom_sentences", "nl", "smart_climate.yaml"))


async def test_met_de_hand_toevoegen_met_adres_en_sleutel(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{ADRES}/api/assist", json=INFO)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    # Het adres zoals de app het toonde, met /api/vraag erachter, en de sleutel met "Bearer" ervoor: dat mag.
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adres": f"{ADRES}/api/vraag", "sleutel": f"Bearer {SLEUTEL}"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"adres": ADRES, "sleutel": SLEUTEL}
    assert aioclient_mock.mock_calls[-1][3]["Authorization"] == f"Bearer {SLEUTEL}"


async def test_met_de_hand_een_verkeerde_sleutel(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{ADRES}/api/assist", status=401)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"adres": ADRES, "sleutel": "fout"})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "sleutel"}


async def test_ontdekt_via_de_add_on_met_een_klik(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{ADRES}/api/assist", json=INFO)
    ontdekt = HassioServiceInfo(config={"host": "abcd1234-hems-climate", "port": 8099, "sleutel": SLEUTEL}, name="SunArc", slug="abcd1234_hems_climate", uuid="1234")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_HASSIO}, data=ontdekt)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "hassio_confirm"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"adres": ADRES, "sleutel": SLEUTEL}
    # Meldt de add-on zich opnieuw (een nieuwe sleutel), dan geen tweede, wel de nieuwe sleutel.
    nieuw = HassioServiceInfo(config={"host": "abcd1234-hems-climate", "port": 8099, "sleutel": "nieuwe-sleutel"}, name="SunArc", slug="abcd1234_hems_climate", uuid="1234")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_HASSIO}, data=nieuw)
    assert result["type"] is FlowResultType.ABORT
    # Home Assistant laadt de integratie dan opnieuw: wachten tot dat klaar is.
    await hass.async_block_till_done()
    assert hass.config_entries.async_entries(DOMAIN)[0].data["sleutel"] == "nieuwe-sleutel"


async def test_zinnen_vraag_en_weer_weg(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{ADRES}/api/assist", json=INFO)
    aioclient_mock.get(f"{ADRES}/api/vraag", json={"vraag": "waarom", "antwoord": "De zolder wacht op meer zon.", "gesproken": "De zolder wacht op meer zon."})
    entry = MockConfigEntry(domain=DOMAIN, data={"adres": ADRES, "sleutel": SLEUTEL}, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    # Het eigen zinnenbestand, met de kamers van dit huis.
    inhoud = await hass.async_add_executor_job(_zinnen(hass).read_text, "utf-8")
    assert inhoud.startswith("# SunArc: de zinnen voor Assist.")
    assert '"in": "(zolder|hobbykamer boven)"' in inhoud

    # Een vraag van Assist: door naar SunArc, met de kamer als zone en de sleutel.
    antwoord = await intent.async_handle(hass, "test", "SmartClimateVraag", {"vraag": {"value": "waarom"}, "kamer": {"value": "zolder"}}, language="nl")
    assert antwoord.speech["plain"]["speech"] == "De zolder wacht op meer zon."
    vraag = aioclient_mock.mock_calls[-1]
    assert str(vraag[1]).startswith(f"{ADRES}/api/vraag")
    assert "kamer=zolder" in str(vraag[1]) and "v=waarom" in str(vraag[1]) and "taal=nl" in str(vraag[1])

    # Antwoordt SunArc niet, dan zegt Assist dat.
    aioclient_mock.clear_requests()
    aioclient_mock.get(f"{ADRES}/api/vraag", status=500)
    antwoord = await intent.async_handle(hass, "test", "SmartClimateVraag", {"vraag": {"value": "nu"}}, language="nl")
    assert antwoord.speech["plain"]["speech"] == "SunArc geeft nu geen antwoord."

    # Weg met de integratie, weg met zijn zinnen.
    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert not await hass.async_add_executor_job(_zinnen(hass).exists)


async def test_assist_herkent_een_gesproken_zin_met_de_echte_zinnen(hass: HomeAssistant, aioclient_mock) -> None:
    aioclient_mock.get(f"{ADRES}/api/assist", json=INFO)
    aioclient_mock.get(f"{ADRES}/api/vraag", json={"vraag": "waarom", "antwoord": "De zolder wacht op meer zon."})
    entry = MockConfigEntry(domain=DOMAIN, data={"adres": ADRES, "sleutel": SLEUTEL}, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    async def zeg(zin: str) -> str:
        uit = await hass.services.async_call("conversation", "process", {"text": zin, "language": "nl"}, blocking=True, return_response=True)
        return uit["response"]["speech"]["plain"]["speech"]

    assert await zeg("Waarom draait de zolder?") == "De zolder wacht op meer zon."
    vraag = str(aioclient_mock.mock_calls[-1][1])
    assert "v=waarom" in vraag and "kamer=zolder" in vraag
    # Een andere naam voor dezelfde kamer, en een opdracht met een temperatuur: wat SunArc zou doen.
    await zeg("koel de keuken naar 21 graden")
    vraag = str(aioclient_mock.mock_calls[-1][1])
    assert "v=doe" in vraag and "wens=koelen" in vraag and "kamer=woonkamer" in vraag and "temperatuur=21" in vraag
    await zeg("wat doe je nu")
    assert "v=nu" in str(aioclient_mock.mock_calls[-1][1])


async def test_assist_herkent_een_engelse_zin(hass: HomeAssistant, aioclient_mock) -> None:
    """Assist in het Engels (besluit 185): het Engelse bestand, en de vraag gaat met taal=en naar SunArc."""
    aioclient_mock.get(f"{ADRES}/api/assist", json=INFO)
    aioclient_mock.get(f"{ADRES}/api/vraag", json={"vraag": "waarom", "antwoord": "The attic is waiting for more sun."})
    entry = MockConfigEntry(domain=DOMAIN, data={"adres": ADRES, "sleutel": SLEUTEL}, unique_id=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert await hass.async_add_executor_job(Path(hass.config.path("custom_sentences", "en", "smart_climate.yaml")).exists)

    async def zeg(zin: str) -> str:
        uit = await hass.services.async_call("conversation", "process", {"text": zin, "language": "en"}, blocking=True, return_response=True)
        return uit["response"]["speech"]["plain"]["speech"]

    assert await zeg("Why is the zolder cooling?") == "The attic is waiting for more sun."
    vraag = str(aioclient_mock.mock_calls[-1][1])
    assert "v=waarom" in vraag and "kamer=zolder" in vraag and "taal=en" in vraag
    await zeg("cool the keuken to 21 degrees")
    vraag = str(aioclient_mock.mock_calls[-1][1])
    assert "v=doe" in vraag and "wens=koelen" in vraag and "kamer=woonkamer" in vraag and "temperatuur=21" in vraag
    await zeg("what are you doing right now")
    assert "v=nu" in str(aioclient_mock.mock_calls[-1][1])
