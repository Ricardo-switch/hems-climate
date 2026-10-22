"""Smart Climate toevoegen (besluit 184): ontdekt via de add-on, of met de hand.

Ontdekt: de add-on meldt zich bij de Supervisor met zijn adres en de sleutel;
Home Assistant toont "Nieuw apparaat gevonden" en je klikt op Toevoegen. Met
de hand (Smart Climate niet als add-on): het adres en de sleutel uit de app,
bij Instellingen › Bewoners en toegang › Sleutel voor de assistent.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import SmartClimateApi, SmartClimateFout
from .const import CONF_ADRES, CONF_SLEUTEL, DOMAIN

try:
    from homeassistant.helpers.service_info.hassio import HassioServiceInfo
except ImportError:  # Een oudere Home Assistant.
    from homeassistant.components.hassio import HassioServiceInfo  # type: ignore[no-redef]


def _netjes(adres: str) -> str:
    adres = adres.strip().rstrip("/")
    # Wie het adres van de vragen plakt, zoals de app het toont: zonder /api/vraag.
    adres = adres.removesuffix("/api/vraag")
    return adres if adres.startswith(("http://", "https://")) else f"http://{adres}"


class SmartClimateFlow(ConfigFlow, domain=DOMAIN):
    """Eén Smart Climate per Home Assistant."""

    VERSION = 1

    def __init__(self) -> None:
        self._ontdekt: dict[str, str] | None = None

    async def _probeer(self, adres: str, sleutel: str) -> str | None:
        try:
            await SmartClimateApi(async_get_clientsession(self.hass), adres, sleutel).info()
        except SmartClimateFout as fout:
            return "sleutel" if "sleutel" in str(fout) else "niet_bereikbaar"
        return None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        fouten: dict[str, str] = {}
        if user_input is not None:
            data = {CONF_ADRES: _netjes(user_input[CONF_ADRES]), CONF_SLEUTEL: user_input[CONF_SLEUTEL].strip().removeprefix("Bearer ").strip()}
            fout = await self._probeer(data[CONF_ADRES], data[CONF_SLEUTEL])
            if fout is None:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured(updates=data)
                return self.async_create_entry(title="Smart Climate", data=data)
            fouten["base"] = fout
        schema = vol.Schema({vol.Required(CONF_ADRES): str, vol.Required(CONF_SLEUTEL): str})
        return self.async_show_form(step_id="user", data_schema=schema, errors=fouten)

    async def async_step_hassio(self, discovery_info: HassioServiceInfo) -> ConfigFlowResult:
        """De add-on meldde zich aan, met zijn adres en de sleutel."""
        c = discovery_info.config
        data = {CONF_ADRES: f"http://{c['host']}:{c['port']}", CONF_SLEUTEL: str(c["sleutel"])}
        await self.async_set_unique_id(DOMAIN)
        # Staat hij er al, dan alleen het adres en de sleutel bij (na een herinstallatie van de add-on).
        self._abort_if_unique_id_configured(updates=data)
        self._ontdekt = data
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        assert self._ontdekt is not None
        if user_input is not None:
            fout = await self._probeer(self._ontdekt[CONF_ADRES], self._ontdekt[CONF_SLEUTEL])
            if fout is not None:
                return self.async_abort(reason=fout)
            return self.async_create_entry(title="Smart Climate", data=self._ontdekt)
        return self.async_show_form(step_id="hassio_confirm")
