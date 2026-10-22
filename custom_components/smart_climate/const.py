"""Vaste waarden van de integratie Smart Climate (besluit 184)."""

DOMAIN = "smart_climate"

#: Het adres van Smart Climate, zoals ``http://abcd1234-hems-climate:8099``.
CONF_ADRES = "adres"
#: De sleutel voor de vragen (Instellingen › Bewoners en toegang › Sleutel voor de assistent).
CONF_SLEUTEL = "sleutel"

#: Zo vaak kijkt de integratie of de kamers veranderden, voor de zinnen.
KAMERS_ELKE_MINUTEN = 30

#: Wat Assist zegt als Smart Climate niet antwoordt.
GEEN_ANTWOORD = {"nl": "Smart Climate geeft nu geen antwoord.", "en": "Smart Climate is not answering right now."}
