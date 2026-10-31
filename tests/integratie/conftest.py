"""De integratie SunArc in een echte Home Assistant (besluit 184).

Draaien in een Linux-omgeving met ``pytest-homeassistant-custom-component``,
vanuit de map van de repository: ``pytest tests/integratie``. De CI doet dat;
op Windows bouwt een van de onderdelen niet, gebruik dan Docker.
"""

import pytest


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Laat Home Assistant de integratie in custom_components/ laden."""
    yield
