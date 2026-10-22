"""Vragen aan Smart Climate (besluit 184): de kamers voor de zinnen, en een vraag van Assist.

Alles leest alleen. Een opdracht als "koel de zolder naar 21" krijgt als
antwoord wat Smart Climate zou doen; er gaat niets naar de airco.
"""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp


class SmartClimateFout(Exception):
    """Smart Climate antwoordt niet, of weigert de sleutel."""


class SmartClimateApi:
    """Een klein loket naar ``/api/assist`` en ``/api/vraag``, met de sleutel."""

    def __init__(self, sessie: aiohttp.ClientSession, adres: str, sleutel: str) -> None:
        self._sessie = sessie
        self._adres = adres.rstrip("/")
        self._sleutel = sleutel

    @property
    def adres(self) -> str:
        return self._adres

    async def _haal(self, pad: str, vraag: dict[str, str]) -> dict[str, Any]:
        try:
            async with asyncio.timeout(10):
                async with self._sessie.get(f"{self._adres}{pad}", params=vraag, headers={"Authorization": f"Bearer {self._sleutel}"}) as antwoord:
                    if antwoord.status == 401:
                        raise SmartClimateFout("de sleutel klopt niet")
                    if antwoord.status != 200:
                        raise SmartClimateFout(f"Smart Climate gaf {antwoord.status}")
                    return await antwoord.json()
        except (aiohttp.ClientError, TimeoutError) as fout:
            raise SmartClimateFout(f"Smart Climate is niet te bereiken: {fout}") from fout

    async def info(self) -> dict[str, Any]:
        """De naam, de versie en de kamers met hun woorden."""
        return await self._haal("/api/assist", {})

    async def vraag(self, soort: str, taal: str, kamer: str | None = None, wens: str | None = None, temperatuur: int | None = None) -> str:
        """Een vraag van Assist; het antwoord om uit te spreken."""
        vraag = {"v": soort, "taal": taal}
        if kamer:
            vraag["kamer"] = kamer
        if wens:
            vraag["wens"] = wens
        if temperatuur is not None:
            vraag["temperatuur"] = str(temperatuur)
        antwoord = await self._haal("/api/vraag", vraag)
        # Het antwoord zoals de app het toont; Assist laat het zien en spreekt het uit.
        return str(antwoord.get("antwoord") or "")
