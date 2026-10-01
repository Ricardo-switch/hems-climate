#!/usr/bin/env bash
#
# Tests voor deploy.sh (besluit 69).
#
#   bash deploy/test-deploy.sh
#
# deploy.sh draait op de NAS en wordt met de hand gekopieerd (besluit 20). Een
# fout erin merk je pas als de uitrol of de melding stilvalt. Dit script draait
# in de CI en controleert twee dingen:
#
# 1. De syntaxis van het hele script.
# 2. De melding als de opname stilvalt (besluit 67): het blok
#    `check_recording` wordt los uitgevoerd in een wegwerpmap, met een
#    logboek van verschillende ouderdom.
#
# ShellCheck draait apart in de CI, op hetzelfde script.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/deploy.sh"
failed=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ok    $name"
  else
    echo "  FOUT  $name: verwacht '$expected', kreeg '$actual'"
    failed=1
  fi
}

echo "deploy.sh"
if bash -n "$SCRIPT"; then
  echo "  ok    syntaxis"
else
  echo "  FOUT  syntaxis"
  exit 1
fi

# ------------------------------------------- de melding bij stilvallen ----

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/logs"
LOGFILE="$T/logs/decisions-2026-10-01.ndjson"

# Het blok van `RECORDING_STALE=0` tot en met de aanroep `check_recording`,
# met een stille `log` en de map hierboven als installatie. Na afloop zeggen
# wat deploy.sh op dat moment zou doen.
{
  echo 'set -euo pipefail'
  echo 'log() { :; }'
  echo "ROOT='$T'"
  echo 'CONTAINER=hems-shadow'
  sed -n '/^RECORDING_STALE=0$/,/^check_recording$/p' "$SCRIPT"
  echo 'if [ "$RECORDING_STALE" -eq 1 ]; then touch "$ALERTFILE"; echo mail; else echo stil; fi'
} > "$T/harness.sh"

if ! grep -q '^check_recording() {' "$T/harness.sh"; then
  echo "  FOUT  check_recording niet gevonden; is het blok in deploy.sh verplaatst?"
  exit 1
fi

run() {
  CONTAINER_STATE="$1" bash "$T/harness.sh"
}

echo "de melding bij stilvallen (besluit 67)"
check "geen logboek: geen melding" stil "$(run running)"

touch "$LOGFILE"
check "vers logboek: geen melding" stil "$(run running)"

touch -d '45 minutes ago' "$LOGFILE"
check "45 minuten stil: melding" mail "$(run running)"
check "vijf minuten later nog stil: niet opnieuw" stil "$(run running)"

touch -d '4 hours ago' "$T/.recording-alert"
check "na drie uur nog stil: opnieuw" mail "$(run running)"

touch "$LOGFILE"
check "weer vers: geen melding" stil "$(run running)"
if [ -e "$T/.recording-alert" ]; then
  check "markering opgeruimd" weg aanwezig
else
  check "markering opgeruimd" weg weg
fi

touch -d '2 hours ago' "$LOGFILE"
check "bewust gestopt: geen melding" stil "$(run exited)"

exit "$failed"
