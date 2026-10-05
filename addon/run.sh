#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
#
# Van de opties van de add-on naar de omgeving die `main.js` verwacht.
#
# Dit scriptje is met opzet dun. Alles wat het doet is vertalen: `bashio` leest
# wat de gebruiker in de add-on-instellingen heeft gezet, en zet het om naar de
# omgevingsvariabelen die de dienst al kende van de NAS-uitrol. Daardoor draait
# er precies dezelfde code op beide plekken, en is er geen tweede opstartpad dat
# apart kan breken.
#
# Wat hier níet gebeurt: een token regelen. `SUPERVISOR_TOKEN` staat al in de
# omgeving en `main.js` herkent hem (besluit 34).

set -euo pipefail

CONFIG_DIR=/config
LOG_DIR=/share/hems/shadow

bashio::log.info "Smart Climate OS — schaduwmodus"

# De configuratie hoort bij de installatie, niet bij de code (besluit 21).
#
# Staat er nog niets, dan is dat sinds fase 6e stap 4 geen fout meer maar de
# normale toestand van een verse installatie: de dienst start, regelt niets, en
# toont in het paneel wat er in huis is gevonden (besluit 42).
#
# Wat wél een fout blijft, is een configuratie die er staat maar niet deugt.
# Daar hoort de controle verderop bij; zonder die controle levert een
# schemawijziging een herstartlus op waarin de melding wegscrolt (besluit 33).
HEEFT_CONFIG=1
if ! compgen -G "${CONFIG_DIR}/sites/*.json" > /dev/null; then
  HEEFT_CONFIG=0
  bashio::log.info "Nog geen configuratie in ${CONFIG_DIR}/sites/"
  bashio::log.info "Open het paneel Smart Climate; daar staat wat er in huis is"
  bashio::log.info "gevonden en kun je het bevestigen."
fi

mkdir -p "${LOG_DIR}"

export SHADOW_LOG_DIR="${LOG_DIR}"

# De opties uit de add-on-instellingen, met terugval.
#
# `bashio::config` haalt ze bij de Supervisor. Is die even niet bereikbaar, dan
# is stoppen het verkeerde antwoord: de opname is het product, en drie
# instelbare getallen zijn geen reden om hem stil te leggen. Bovendien maakt dit
# de add-on buiten Home Assistant te draaien, en dus te testen.
if bashio::supervisor.ping 2> /dev/null; then
  # Toewijzen en exporteren apart: `export X="$(...)"` slikt de foutcode van
  # het commando tussen de haakjes in (ShellCheck SC2155).
  SHADOW_TICK_SECONDS="$(bashio::config 'hartslag_seconden')"
  SHADOW_MIN_INTERVAL_SECONDS="$(bashio::config 'min_interval_seconden')"
  SHADOW_WATCHDOG_MINUTES="$(bashio::config 'bewaking_minuten')"
  export SHADOW_TICK_SECONDS SHADOW_MIN_INTERVAL_SECONDS SHADOW_WATCHDOG_MINUTES
  # Licht bedienen (besluit 97). Achter Ingress staat het in de dienst standaard
  # aan; uitzetten in de instellingen maakt er HEMS_LIGHTS=0 van.
  if bashio::config.true 'licht_bedienen'; then
    export HEMS_LIGHTS=1
  else
    export HEMS_LIGHTS=0
  fi
else
  bashio::log.warning "Supervisor niet bereikbaar; standaardinstellingen gebruikt."
  export SHADOW_TICK_SECONDS=30
  export SHADOW_MIN_INTERVAL_SECONDS=15
  export SHADOW_WATCHDOG_MINUTES=10
fi

# Ingress geeft ons een eigen poort binnen de add-on; naar buiten is er niets
# open. De poort hier moet gelijk zijn aan `ingress_port` in config.yaml.
export HEMS_WEB_PORT=8099
export HEMS_WEB_HOST=0.0.0.0

# De tijdzone van Home Assistant overnemen. De regeling leest de hare uit de
# configuratie (besluit 6), maar tijdstempels in het logboek worden er
# leesbaarder van.
if bashio::supervisor.ping 2> /dev/null; then
  TZ_HA="$(bashio::info.timezone 2> /dev/null || true)"
  if [ -n "${TZ_HA:-}" ] && [ "${TZ_HA}" != "null" ]; then
    export TZ="${TZ_HA}"
    bashio::log.info "Tijdzone van Home Assistant overgenomen: ${TZ}"
  fi
fi

# De configuratielader zoekt vanaf de werkmap omhoog naar `config/sites`. Door
# hier naar / te gaan vindt hij /config/sites vanzelf — en houden we al zijn
# gedrag: één bestand is vanzelfsprekend, meerdere geeft een nette fout die ze
# opsomt. Dat nabouwen zou een tweede plek zijn die kan afwijken.
cd /

bashio::log.info "Configuratie uit ${CONFIG_DIR}/sites"
bashio::log.info "Logboek naar    ${SHADOW_LOG_DIR}"

# Eerst nakijken of het image de aanwezige configuratie kan lezen. Bij de
# NAS-uitrol doet `deploy.sh` dat vóór het omwisselen (besluit 33); hier kan dat
# niet, want de Supervisor start ons gewoon. Dan maar zelf, één keer, met een
# leesbare fout in plaats van een herstartlus.
if [ "${HEEFT_CONFIG}" -eq 1 ] && ! node /app/dist/main.js --check-config; then
  bashio::log.fatal "De configuratie is niet bruikbaar; zie de fouten hierboven."
  bashio::exit.nok
fi

exec node /app/dist/main.js
