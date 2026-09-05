#!/bin/bash
#
# Haalt de nieuwste code op en zet die op de NAS neer.
#
# Bedoeld voor de Synology Taakplanner. Veilig om elk kwartier te draaien: hij
# doet niets wanneer er niets veranderd is, en weigert wanneer hij iets zou
# moeten overschrijven.
#
#   ./deploy.sh              normaal
#   ./deploy.sh --force      herbouwen ook zonder wijzigingen
#   ./deploy.sh --dry-run    alleen tonen wat er zou gebeuren
#
# Over "zonder downtime": die is er niet, en die hoeft er niet te zijn. Eén
# container die herbouwd wordt betekent een onderbreking. Wat dit script wel
# doet, is éérst bouwen en pas daarna omwisselen — dan duurt de onderbreking
# seconden in plaats van de hele bouwtijd. Mislukt het bouwen, dan blijft de
# draaiende container ongemoeid.

set -euo pipefail

ROOT="/volume1/docker/hems-climate"
SRC="$ROOT/src"
LOGFILE="$ROOT/deploy.log"
LOCKDIR="$ROOT/.deploy.lock"
# Welke versie er daadwerkelijk draait. Zie de uitleg bij het gebruik hieronder.
STATEFILE="$ROOT/.deployed"
CONTAINER="hems-shadow"
IMAGE="hems-climate/shadow"
# De SSH-sleutel waarmee de NAS bij GitHub mag. Zie de uitleg hieronder.
GIT_SSH_KEY="${GIT_SSH_KEY:-/root/.ssh/id_ed25519}"

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Onbekende optie: $arg" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- logboek ----

log() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if [ ! -d "$ROOT" ]; then
  echo "FOUT: $ROOT bestaat niet." >&2
  exit 1
fi

# Alles wat dit script zegt gaat naar het scherm én naar het logboek, zodat de
# uitvoer van de Taakplanner en het bestand hetzelfde verhaal vertellen.
exec > >(tee -a "$LOGFILE") 2>&1

# Logboek kort houden: de laatste 2000 regels volstaan.
trim_log() {
  local lines
  lines="$(wc -l < "$LOGFILE" 2>/dev/null | tr -d ' ')"
  if [ -f "$LOGFILE" ] && [ "${lines:-0}" -gt 2000 ]; then
    tail -n 1000 "$LOGFILE" > "$LOGFILE.tmp" && mv "$LOGFILE.tmp" "$LOGFILE"
  fi
}

# ------------------------------------------------------------------ slot ----

# mkdir is atomair op elk bestandssysteem; flock is dat ook maar zit niet
# gegarandeerd op DSM. Zonder slot zouden twee taken die elkaar overlappen
# tegelijk gaan bouwen.
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  # Een slot dat ouder is dan een uur komt van een afgebroken run.
  if [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    log "Oud slot gevonden (>60 min); dat was een afgebroken run. Opgeruimd."
    rm -rf "$LOCKDIR"
    mkdir "$LOCKDIR"
  else
    log "Er draait al een uitrol. Deze keer overgeslagen."
    exit 0
  fi
fi
cleanup() {
  rm -rf "$LOCKDIR"
  trim_log
}
trap cleanup EXIT

# ------------------------------------------------------------ programma's ----

# De Taakplanner draait met een kale omgeving: geen PATH naar docker of git.
# Daarom expliciet zoeken en luid falen in plaats van "command not found".
find_bin() {
  local name="$1"
  shift
  local candidate found
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  # Laatste kans: staat het toevallig wel in PATH?
  if found="$(command -v "$name" 2>/dev/null)"; then
    echo "$found"
    return 0
  fi
  return 1
}

GIT="$(find_bin git /usr/bin/git /usr/local/bin/git /opt/bin/git)" || {
  log "FOUT: git niet gevonden."
  log "  Installeer het pakket Git Server via het Pakketcentrum."
  exit 1
}

DOCKER="$(find_bin docker /usr/local/bin/docker /usr/bin/docker)" || {
  log "FOUT: docker niet gevonden."
  log "  Draait Container Manager?"
  exit 1
}

# De Taakplanner draait niet in een gewone loginshell. HOME kan daardoor ergens
# anders wijzen dan /root, en dan zoekt ssh de sleutel op de verkeerde plek —
# met een "Permission denied (publickey)" die niets met GitHub te maken heeft.
# Daarom de sleutel expliciet meegeven in plaats van erop vertrouwen dat ssh hem
# vanzelf vindt.
if [ -f "$GIT_SSH_KEY" ]; then
  export GIT_SSH_COMMAND="ssh -i $GIT_SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi

# Compose v2 zit in docker zelf; oudere DSM heeft een los docker-compose.
if "$DOCKER" compose version >/dev/null 2>&1; then
  COMPOSE=("$DOCKER" compose)
elif COMPOSE_BIN="$(find_bin docker-compose /usr/local/bin/docker-compose)"; then
  COMPOSE=("$COMPOSE_BIN")
else
  log "FOUT: geen docker compose gevonden."
  exit 1
fi

# --------------------------------------------------------------- controle ----

[ -d "$SRC/.git" ] || {
  log "FOUT: $SRC is geen git-werkmap."
  log "  Haal de repository eerst binnen:"
  log "    cd $ROOT && $GIT clone <url> src"
  exit 1
}

[ -f "$ROOT/docker-compose.yml" ] || {
  log "FOUT: $ROOT/docker-compose.yml ontbreekt."
  exit 1
}

# Root die git draait op een map van een andere eigenaar krijgt anders
# "detected dubious ownership" en stopt ermee.
if ! "$GIT" config --global --get-all safe.directory 2>/dev/null | grep -qx "$SRC"; then
  "$GIT" config --global --add safe.directory "$SRC"
fi

cd "$SRC"

# Lokale wijzigingen niet stilzwijgend weggooien. Wie op de NAS iets heeft
# aangepast hoort dat te horen, niet kwijt te raken.
if [ -n "$("$GIT" status --porcelain)" ]; then
  log "GESTOPT: er staan lokale wijzigingen in $SRC."
  "$GIT" status --short | sed 's/^/    /'
  log "  Deze uitrol overschrijft niets. Zet ze terug of leg ze vast, en"
  log "  draai daarna opnieuw:"
  log "    cd $SRC && $GIT checkout -- .     # weggooien"
  exit 1
fi

BRANCH="$("$GIT" rev-parse --abbrev-ref HEAD)"
log "Tak $BRANCH in $SRC"

# ------------------------------------------------------------- ophalen ------

"$GIT" fetch --quiet origin "$BRANCH"

BEFORE="$("$GIT" rev-parse HEAD)"
REMOTE="$("$GIT" rev-parse "origin/$BRANCH")"

# Wat er drááit is iets anders dan wat er is opgehaald.
#
# Zonder dit onderscheid ontstaat een stille val: mislukt het bouwen, dan staat
# de werkmap al op de nieuwe commit, en concludeert de volgende run dat HEAD
# gelijk is aan origin en er dus niets te doen valt. De mislukte uitrol wordt
# dan nooit meer geprobeerd. Daarom onthouden we welke commit er werkelijk is
# neergezet, en vergelijken we daarmee.
DEPLOYED="$(cat "$STATEFILE" 2>/dev/null || true)"

if [ "$DRY_RUN" -eq 1 ]; then
  log "PROEFDRAAI — er wordt niets gewijzigd."
  log "  draait nu : ${DEPLOYED:0:8}${DEPLOYED:+ }${DEPLOYED:-onbekend}"
  log "  werkmap   : $(echo "$BEFORE" | cut -c1-8)"
  log "  origin    : $(echo "$REMOTE" | cut -c1-8)"
  if [ "$BEFORE" != "$REMOTE" ]; then
    log "  op te halen:"
    "$GIT" log --oneline "$BEFORE..$REMOTE" | sed 's/^/      /'
  fi
  if [ -n "$DEPLOYED" ] && [ "$DEPLOYED" != "$REMOTE" ]; then
    log "  gewijzigd sinds de draaiende versie:"
    "$GIT" diff --name-only "$DEPLOYED" "$REMOTE" 2>/dev/null | sed 's/^/      /' || true
  fi
  exit 0
fi

if [ "$BEFORE" != "$REMOTE" ]; then
  log "Ophalen: $(echo "$BEFORE" | cut -c1-8) naar $(echo "$REMOTE" | cut -c1-8)"
  "$GIT" log --oneline "$BEFORE..$REMOTE" | sed 's/^/    /'
  # Alleen fast-forward: samenvoegen zou een merge-commit op de NAS maken, en
  # daar hoort geen geschiedenis te ontstaan.
  "$GIT" merge --ff-only --quiet "origin/$BRANCH"
fi

AFTER="$("$GIT" rev-parse HEAD)"

if [ "$AFTER" = "$DEPLOYED" ] && [ "$FORCE" -eq 0 ]; then
  log "Draait al op $(echo "$AFTER" | cut -c1-8). Niets te doen."
  exit 0
fi

# ------------------------------------------------- wat er nodig is doen -----

# Niet elke wijziging vraagt hetzelfde werk. De code zit in het image en vraagt
# een herbouw; het compose-bestand vraagt alleen opnieuw aanmaken. Een gewijzigd
# README raakt de draaiende dienst niet.
NEEDS_BUILD=0
NEEDS_RECREATE=0

if [ "$FORCE" -eq 1 ]; then
  NEEDS_BUILD=1
  log "Herbouw afgedwongen met --force."
elif [ -z "$DEPLOYED" ]; then
  # Nog nooit via dit script uitgerold: uitgaan van het ergste.
  NEEDS_BUILD=1
  log "Nog geen eerdere uitrol vastgelegd; volledig bouwen."
elif ! "$GIT" cat-file -e "$DEPLOYED^{commit}" 2>/dev/null; then
  # De onthouden commit bestaat niet meer, bijvoorbeeld na een geherschreven
  # geschiedenis. Dan valt er niets te vergelijken.
  NEEDS_BUILD=1
  log "De vorige uitrol ($(echo "$DEPLOYED" | cut -c1-8)) zit niet meer in de geschiedenis; volledig bouwen."
else
  CHANGED="$("$GIT" diff --name-only "$DEPLOYED" "$AFTER")"
  log "Gewijzigd sinds de draaiende versie:"
  echo "$CHANGED" | sed 's/^/    /'
  # Bewust `if` en geen `a && b`: met set -e stapt een mislukte AND-lijst uit
  # het script, en "geen backend-wijziging" is geen fout maar een uitkomst.
  if grep -q '^backend/' <<< "$CHANGED"; then
    NEEDS_BUILD=1
  fi
  if grep -q '^deploy/docker-compose\.yml$' <<< "$CHANGED"; then
    NEEDS_RECREATE=1
  fi
fi

if [ "$NEEDS_BUILD" -eq 0 ] && [ "$NEEDS_RECREATE" -eq 0 ]; then
  log "Wijzigingen raken de draaiende dienst niet. Klaar."
  # Wel vastleggen, anders rekent elke volgende run dezelfde diff opnieuw uit.
  echo "$AFTER" > "$STATEFILE"
  exit 0
fi

cd "$ROOT"

# De configuratie is niet van de code maar van deze installatie, en wordt
# daarom niet automatisch overgezet. Wel melden wanneer git iets anders bevat
# dan wat er draait — dan weet je dat er iets te doen is.
if [ -d "$SRC/config/sites" ]; then
  for f in "$SRC"/config/sites/*.json; do
    [ -e "$f" ] || continue
    live="$ROOT/config/sites/$(basename "$f")"
    if [ -f "$live" ] && ! cmp -s "$f" "$live"; then
      log "LET OP: $(basename "$f") verschilt van de versie in git."
      log "  De configuratie hoort bij deze installatie en wordt niet"
      log "  overgezet. Kopieer hem zelf als dat de bedoeling is."
    fi
  done
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
  # De huidige versie eerst wegzetten, zodat terugvallen mogelijk blijft.
  if "$DOCKER" image inspect "$IMAGE:latest" >/dev/null 2>&1; then
    "$DOCKER" tag "$IMAGE:latest" "$IMAGE:vorige"
    log "Huidige image bewaard als $IMAGE:vorige"
  fi

  log "Bouwen…"
  # Eerst bouwen, dan pas omwisselen. Mislukt dit, dan draait de oude container
  # gewoon door en is er niets gebeurd.
  if ! "${COMPOSE[@]}" build; then
    log "FOUT: bouwen mislukt. De draaiende container is niet aangeraakt."
    exit 1
  fi
  log "Bouwen gelukt."
fi

log "Container omwisselen…"
"${COMPOSE[@]}" up -d

# ------------------------------------------------------------ nakijken ------

sleep 10

STATE="$("$DOCKER" inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo 'weg')"
if [ "$STATE" != "running" ]; then
  log "FOUT: $CONTAINER draait niet (status: $STATE)."
  log "  Laatste regels uit de container:"
  "$DOCKER" logs --tail 25 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
  log ""
  log "  Terugvallen op de vorige versie:"
  log "    $DOCKER tag $IMAGE:vorige $IMAGE:latest && cd $ROOT && ${COMPOSE[*]} up -d"
  exit 1
fi

# Wacht tot de dienst zichzelf gezond meldt. De healthcheck kijkt of er naar het
# besluitenlogboek geschreven wordt; hij heeft een startperiode nodig.
HEALTH="geen"
for _ in $(seq 1 12); do
  HEALTH="$("$DOCKER" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}geen{{end}}' "$CONTAINER" 2>/dev/null || echo 'geen')"
  [ "$HEALTH" = "healthy" ] && break
  [ "$HEALTH" = "geen" ] && break
  sleep 10
done

# Pas hier vastleggen: nu weten we dat deze versie ook echt draait.
echo "$AFTER" > "$STATEFILE"

# Dit script draait vanuit de wortel en niet uit src/, zodat een pull het niet
# onder je voeten kan wijzigen. De keerzijde is dat een nieuwe versie niet
# vanzelf wordt overgenomen; dat melden we dan maar.
if [ -f "$SRC/deploy/deploy.sh" ] && ! cmp -s "$SRC/deploy/deploy.sh" "$0"; then
  log ""
  log "LET OP: er staat een nieuwere versie van dit script in de repository."
  log "  Overnemen doe je zelf, zodat een pull nooit het draaiende script raakt:"
  log "    cp $SRC/deploy/deploy.sh $ROOT/deploy.sh && chmod +x $ROOT/deploy.sh"
fi

log "Klaar op $(echo "$AFTER" | cut -c1-8) — container $STATE, gezondheid $HEALTH"

# Kort tonen wat de dienst zelf bij het opstarten zei; daar staat of hij
# verbonden is en of de configuratie klopt.
"$DOCKER" logs --tail 6 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
