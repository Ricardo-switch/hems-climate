"""SunArc in Home Assistant (besluit 184): Assist vraagt SunArc, zonder YAML.

De add-on meldt zich aan ("Nieuw apparaat gevonden: SunArc"); met één
klik staat de integratie erin. Dan:

- registreert hij de vraag voor Assist in code (``SmartClimateVraag``), in
  plaats van een ``intent_script`` en ``rest_command`` in de configuratie;
- schrijft hij één eigen bestand met de zinnen in ``custom_sentences/<taal>/``,
  zoals SunArc het maakt (met de kamers van dit huis), en werkt het bij
  als het verandert. Bij verwijderen haalt hij het weer weg.

Alles leest alleen: Home Assistant schakelt hier niets, en SunArc ook
niet. Een opdracht krijgt als antwoord wat SunArc zou doen.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import intent
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval

from .api import SmartClimateApi, SmartClimateFout
from .const import CONF_ADRES, CONF_SLEUTEL, DOMAIN, GEEN_ANTWOORD, KAMERS_ELKE_MINUTEN
from .zinnen import BESTAND, INTENTIE, talen

_LOGGER = logging.getLogger(__name__)


def _zinnenpad(hass: HomeAssistant, taal: str) -> Path:
    return Path(hass.config.path("custom_sentences", taal, BESTAND))


def _schrijf(pad: Path, inhoud: str) -> bool:
    """Schrijf het bestand als het anders is; True als er iets veranderde."""
    if pad.exists() and pad.read_text(encoding="utf-8") == inhoud:
        return False
    pad.parent.mkdir(parents=True, exist_ok=True)
    pad.write_text(inhoud, encoding="utf-8")
    return True


async def _zinnen_bij(hass: HomeAssistant, api: SmartClimateApi) -> None:
    """De zinnen zoals SunArc ze nu maakt; Assist leest ze opnieuw als er iets veranderde."""
    try:
        info = await api.info()
    except SmartClimateFout as fout:
        _LOGGER.debug("De zinnen ophalen lukte niet: %s", fout)
        return
    veranderd = False
    for taal, inhoud in talen(info).items():
        veranderd |= await hass.async_add_executor_job(_schrijf, _zinnenpad(hass, taal), inhoud)
    if veranderd:
        await _herlaad(hass)


async def _herlaad(hass: HomeAssistant) -> None:
    """Assist leest de zinnen opnieuw. Lukt dat niet, dan bij de volgende start; het opzetten gaat door."""
    try:
        await hass.services.async_call("conversation", "reload", {}, blocking=True)
    except Exception as fout:  # noqa: BLE001
        _LOGGER.warning("Assist kon de zinnen niet opnieuw lezen: %s", fout)


class VraagHandler(intent.IntentHandler):
    """Een vraag van Assist aan SunArc; het antwoord om uit te spreken."""

    intent_type = INTENTIE
    description = "Vraagt SunArc wat het huis doet, waarom, wat straks komt, of wat het zou doen."
    slot_schema = {
        vol.Required("vraag"): cv.string,
        vol.Optional("kamer"): cv.string,
        vol.Optional("wens"): cv.string,
        vol.Optional("temperatuur"): vol.Coerce(int),
    }

    async def async_handle(self, intent_obj: intent.Intent) -> intent.IntentResponse:
        slots = self.async_validate_slots(intent_obj.slots)
        waarde = lambda naam: slots.get(naam, {}).get("value")  # noqa: E731
        taal = "en" if (intent_obj.language or "nl").startswith("en") else "nl"
        api: SmartClimateApi | None = intent_obj.hass.data.get(DOMAIN)
        zin = GEEN_ANTWOORD[taal]
        if api is not None:
            try:
                zin = await api.vraag(str(waarde("vraag")), taal, waarde("kamer") or None, waarde("wens") or None, waarde("temperatuur"))
            except SmartClimateFout as fout:
                _LOGGER.warning("SunArc antwoordde niet: %s", fout)
        antwoord = intent_obj.create_response()
        antwoord.async_set_speech(zin or GEEN_ANTWOORD[taal])
        return antwoord


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    api = SmartClimateApi(async_get_clientsession(hass), entry.data[CONF_ADRES], entry.data[CONF_SLEUTEL])
    try:
        await api.info()
    except SmartClimateFout as fout:
        raise ConfigEntryNotReady(str(fout)) from fout
    hass.data[DOMAIN] = api
    intent.async_register(hass, VraagHandler())
    await _zinnen_bij(hass, api)

    async def elke_keer(_: Any) -> None:
        await _zinnen_bij(hass, api)

    entry.async_on_unload(async_track_time_interval(hass, elke_keer, timedelta(minutes=KAMERS_ELKE_MINUTEN)))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.pop(DOMAIN, None)
    if hasattr(intent, "async_remove"):
        intent.async_remove(hass, INTENTIE)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Weg met de integratie, weg met zijn zinnen."""

    def weg() -> bool:
        weggehaald = False
        for pad in Path(hass.config.path("custom_sentences")).glob(f"*/{BESTAND}"):
            pad.unlink()
            weggehaald = True
        return weggehaald

    if await hass.async_add_executor_job(weg):
        await _herlaad(hass)
