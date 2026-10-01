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

# Dit script leunt op bash: arrays en herestrings.
#
# De Synology Taakplanner start scripts als `sh /pad/deploy.sh`. Op DSM ís
# /bin/sh bash, maar bash die onder de naam "sh" wordt aangeroepen schakelt over
# naar POSIX-modus. `BASH_VERSION` is dan gewoon gezet — controleren daarop hielp
# dus niet — terwijl een deel van de syntaxis niet meer geldig is. Je krijgt een
# syntaxisfout op een regel die niets met de fout te maken heeft. De shebang
# helpt evenmin: die wordt bij `sh script` genegeerd.
#
# Daarom starten we onszelf altijd één keer opnieuw met een échte bash, tenzij
# dat al gebeurd is. Alles bóven deze regel moet in gewone sh leesbaar blijven.
if [ -z "${DEPLOY_UNDER_BASH:-}" ]; then
  DEPLOY_UNDER_BASH=1
  export DEPLOY_UNDER_BASH
  for candidate in /bin/bash /usr/bin/bash /usr/local/bin/bash /opt/bin/bash; do
    if [ -x "$candidate" ]; then
      exec "$candidate" "$0" "$@"
    fi
  done
  echo "FOUT: dit script heeft bash nodig, en die is niet gevonden." >&2
  exit 1
fi

# De rest van dit script staat tussen accolades, met een exit erin.
#
# Bash leest een script tijdens het uitvoeren stukje voor stukje van schijf.
# Wie het overschrijft terwijl er een run loopt — op 30 september 2026 om 23:05
# gebeurde precies dat — laat die run verder lezen in de nieuwe versie, vanaf
# de oude positie: halve regels en variabelen die nooit gezet zijn. Een blok
# tussen accolades leest bash helemaal in voordat hij begint, en door de exit
# erin komt hij daarna niet meer terug in het bestand. Kopiëren mag dus altijd.
#
# De inhoud is bewust niet ingesprongen: dat zou elke regel van dit script
# veranderen voor een wijziging van twee regels.
{
set -euo pipefail

# De wortel van de installatie. Overschrijfbaar zodat dit script na te spelen
# is in een wegwerpmap; op de NAS blijft het gewoon dit pad. Een uitrolscript
# dat je niet kunt uitproberen, probeer je uit op de draaiende dienst — en dat
# heeft hier al een keer een herstartlus opgeleverd.
ROOT="${HEMS_DEPLOY_ROOT:-/volume1/docker/hems-climate}"
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
#
# Hier stond eerst `exec > >(tee ...)`. Die procesvervanging bleek twee keer
# een probleem: ze bestaat niet in POSIX-modus, en de tee liep los van het
# script waardoor de laatste regel kon verdwijnen. Een gewone pijp heeft geen
# van beide bezwaren, maar kan geen bestaande uitvoer omleiden — daarom start
# het script zichzelf nog één keer, nu met zijn uitvoer door tee.
#
# Handmatig of gepland stellen we hier vast, in de buitenste aanroep: alleen
# daar hangt er nog een terminal aan de uitvoer. Zonder dit onderscheid zien een
# handmatige en een geplande run er in het logboek identiek uit.
if [ -z "${DEPLOY_LOGGING:-}" ]; then
  if [ -t 1 ]; then
    RUNMODE="handmatig"
  else
    RUNMODE="gepland"
  fi
  export RUNMODE
  export DEPLOY_LOGGING=1

  set +e
  "$0" "$@" 2>&1 | tee -a "$LOGFILE"
  status=${PIPESTATUS[0]}
  set -e
  exit "$status"
fi

RUNMODE="${RUNMODE:-onbekend}"

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

# ---------------------------------------------------------- alleen dit ------

# Wat een server draait, en niets meer.
#
# De repository bevat ook `HA export/` (3,1 MB entity-registers en dashboards),
# `legacy_code/` en `ha-fixes/`. Dat is naslag voor het ontwikkelen; op een
# machine die alleen de dienst draait heeft het niets te zoeken. Het kost geen
# noemenswaardige schijfruimte, maar het is wel huishouding van een klant op een
# server — en zodra dit bij iemand anders draait is dat geen smaakkwestie meer.
#
# Cone-modus houdt de bestanden in de wortel altijd, en dat is hier geen detail:
# `.dockerignore` moet naast de bouwcontext staan, anders gaat alsnog de hele
# map de docker-daemon in.
#
# Idempotent: staat het al goed, dan doet dit niets.
SPARSE_MAPPEN="backend frontend config deploy"
if [ "$("$GIT" config --get core.sparseCheckout || echo false)" != "true" ]; then
  log "Werkmap beperken tot wat de dienst nodig heeft..."
  "$GIT" sparse-checkout init --cone
  # shellcheck disable=SC2086
  "$GIT" sparse-checkout set $SPARSE_MAPPEN
  log "  behouden: $SPARSE_MAPPEN (plus de bestanden in de wortel)"
fi

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
log "Start ($RUNMODE) — tak $BRANCH in $SRC"

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
  if "$GIT" merge-base --is-ancestor "$BEFORE" "$REMOTE"; then
    "$GIT" log --oneline "$BEFORE..$REMOTE" | sed 's/^/    /'
    # Alleen fast-forward: samenvoegen zou een merge-commit op de NAS maken, en
    # daar hoort geen geschiedenis te ontstaan.
    "$GIT" merge --ff-only --quiet "origin/$BRANCH"
  else
    # De geschiedenis is herschreven; wat hier staat is geen voorouder meer van
    # wat er op origin staat. `merge --ff-only` faalt dan met "refusing to merge
    # unrelated histories", en de uitrol staat stil tot iemand het met de hand
    # rechtzet.
    #
    # Terugzetten is hier het goede antwoord en geen noodgreep: deze werkmap is
    # een spiegel van origin en geen plek waar werk ontstaat. Eigen wijzigingen
    # zijn een paar regels hierboven al geweigerd, dus er valt niets te
    # verliezen. En een reset maakt geen commit, dus het uitgangspunt blijft
    # staan dat er op de NAS geen geschiedenis bijkomt.
    log "  De geschiedenis is herschreven — $(echo "$BEFORE" | cut -c1-8) is geen"
    log "  voorouder van $(echo "$REMOTE" | cut -c1-8). Terugzetten in plaats van"
    log "  samenvoegen. Terug naar de oude stand kan met:"
    log "    cd $SRC && $GIT reset --hard $BEFORE"
    "$GIT" log --oneline -n 5 "$REMOTE" | sed 's/^/    /'
    "$GIT" reset --hard --quiet "origin/$BRANCH"
  fi
fi

AFTER="$("$GIT" rev-parse HEAD)"

# Bestaat de container eigenlijk nog?
#
# Zonder deze vraag betekent "de commit is niet veranderd" ook "er valt niets
# te doen" — óók wanneer de container is verdwenen. Dan blijft hij weg tot
# iemand toevallig kijkt en `--force` draait. Dat kan gebeuren wanneer
# Container Manager hem opruimt, of wanneer een `docker system prune` te ruim
# was.
#
# Let op het verschil tussen wég en gestópt. Een container die er niet meer is
# hoort terug te komen; een container die iemand bewust heeft stopgezet niet.
# Daarom staat er in het compose-bestand `unless-stopped` en niet `always`, en
# daarom kijken we hier alleen naar afwezigheid. Een crash hoeft dit script
# sowieso niet op te lossen: dat doet `unless-stopped` al.
#
# `docker inspect` en niet `docker ps`: die laatste geeft niets terug voor een
# gestopte container, en dan zou "gestopt" niet van "weg" te onderscheiden zijn.
CONTAINER_STATE="$("$DOCKER" inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo 'weg')"
if [ "$CONTAINER_STATE" = 'weg' ]; then
  log "$CONTAINER bestaat niet meer; opnieuw aanmaken."
  NEEDS_RECREATE_FORCED=1
else
  NEEDS_RECREATE_FORCED=0
  if [ "$CONTAINER_STATE" != 'running' ]; then
    log "$CONTAINER staat op '$CONTAINER_STATE' en wordt met rust gelaten."
    log "  Bewust stopgezet blijft stopgezet. Weer aan: ${COMPOSE[*]} up -d"
  fi
fi

# --------------------------------------------- loopt de opname nog? -------
#
# Besluit 67. Valt de opname stil — de NAS kwijt aan Home Assistant, een dienst
# die hangt of in een herstartlus zit — dan merkte niemand dat tot iemand de
# pagina opende. Een week winter die ontbreekt, komt niet terug. Dit script
# draait toch elke vijf minuten, dus kijkt het hier: hoe oud is het nieuwste
# beslislogboek?
#
# Is dat ouder dan een half uur, dan eindigt deze run met een foutcode. De
# Taakplanner van DSM stuurt dan een mail, als "Verzend uitvoeringsgegevens per
# e-mail" op "alleen bij abnormale beëindiging" staat. Eén keer per storing per
# drie uur, anders komt er elke vijf minuten een. Een container die bewust is
# stopgezet, geeft geen melding: dan weet je het al.
RECORDING_STALE=0
ALERTFILE="$ROOT/.recording-alert"
check_recording() {
  [ "$CONTAINER_STATE" = 'running' ] || return 0
  local newest age_min since_alert
  newest="$(ls -t "$ROOT"/logs/decisions-*.ndjson 2>/dev/null | head -n 1 || true)"
  [ -n "$newest" ] || return 0
  age_min=$(( ( $(date +%s) - $(stat -c %Y "$newest") ) / 60 ))
  if [ "$age_min" -lt 30 ]; then
    if [ -f "$ALERTFILE" ]; then
      log "De opname loopt weer: laatste besluit $age_min min geleden."
      rm -f "$ALERTFILE"
    fi
    return 0
  fi
  log "LET OP: al $age_min minuten geen besluit in het logboek ($(basename "$newest"))."
  log "  Kijk op /api/health en in: docker logs --tail 40 $CONTAINER"
  if [ -f "$ALERTFILE" ]; then
    since_alert=$(( ( $(date +%s) - $(stat -c %Y "$ALERTFILE") ) / 60 ))
    if [ "$since_alert" -lt 180 ]; then
      log "  Al gemeld $since_alert min geleden; de volgende melding hooguit over drie uur."
      return 0
    fi
  fi
  RECORDING_STALE=1
}
check_recording

if [ "$AFTER" = "$DEPLOYED" ] && [ "$FORCE" -eq 0 ] && [ "$NEEDS_RECREATE_FORCED" -eq 0 ]; then
  log "Draait al op $(echo "$AFTER" | cut -c1-8). Niets te doen."
  # Een foutcode hier is de melding: zie check_recording. Pas nu als gemeld
  # markeren; een run die gaat uitrollen, eindigt gewoon en meldt dus niets.
  if [ "$RECORDING_STALE" -eq 1 ]; then
    touch "$ALERTFILE"
    exit 1
  fi
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
  # het script, en "geen wijziging" is geen fout maar een uitkomst.
  #
  # `frontend/` telt sinds fase 5 mee: die wordt in hetzelfde image gebouwd, dus
  # een gewijzigde pagina zonder herbouw is een pagina die niet verandert. Dat
  # is precies het soort stilte waar dit script vanaf moest.
  if grep -qE '^(backend|frontend)/' <<< "$CHANGED"; then
    NEEDS_BUILD=1
  fi
  if grep -q '^deploy/docker-compose\.yml$' <<< "$CHANGED"; then
    NEEDS_RECREATE=1
  fi
fi

if [ "$NEEDS_RECREATE_FORCED" -eq 1 ]; then
  NEEDS_RECREATE=1
fi

if [ "$NEEDS_BUILD" -eq 0 ] && [ "$NEEDS_RECREATE" -eq 0 ]; then
  log "Wijzigingen raken de draaiende dienst niet. Klaar."
  # Wel vastleggen, anders rekent elke volgende run dezelfde diff opnieuw uit.
  echo "$AFTER" > "$STATEFILE"
  exit 0
fi

cd "$ROOT"

# Het compose-bestand is een handmatige kopie uit `deploy/`, net als dit script
# (besluit 20). Anders dan de configuratie is het geen voorkeur maar een
# bouwinstructie: het bepaalt de build-context. Loopt het uit de pas met de
# Dockerfile in git, dan bouw je een nieuwe Dockerfile tegen een oude context,
# en dat mislukt met acht regels "not found" die niets over de oorzaak zeggen.
#
# Dat is precies één keer gebeurd, op 9 september 2026, bij de overstap naar
# een context in de projectwortel. Vandaar: stoppen, niet waarschuwen. Een
# mismatch hier maakt de rest van deze run betekenisloos.
# Vergelijken op inhoud en niet op bytes: een kopie die via Windows is gegaan
# draagt CRLF mee, en daar kan Docker prima mee overweg. Zou dit script daarop
# stoppen, dan blokkeert het een uitrol om een verschil dat niet bestaat — en
# een diff die identieke regels toont is het ergste soort foutmelding.
compose_gelijk() {
  # \015 is de octale schrijfwijze van CR. Een echte CR in dit script zetten
  # zou werken en onleesbaar zijn, en precies zo'n onzichtbaar teken is hier
  # al eens misgegaan (besluit 22, punt 4).
  [ -f "$1" ] && [ -f "$2" ] && cmp -s <(tr -d '\015' < "$1") <(tr -d '\015' < "$2")
}

if [ -f "$SRC/deploy/docker-compose.yml" ] &&
   ! compose_gelijk "$SRC/deploy/docker-compose.yml" "$ROOT/docker-compose.yml"; then
  log "GESTOPT: $ROOT/docker-compose.yml wijkt af van de versie in git."
  log ""
  log "  Het compose-bestand bepaalt onder meer de build-context, dus bouwen"
  log "  met een verouderde kopie levert een mislukking op die niet naar de"
  log "  oorzaak wijst. De draaiende container is niet aangeraakt."
  log ""
  log "  Neem de nieuwe versie over en draai deze taak opnieuw:"
  log "    cp $SRC/deploy/docker-compose.yml $ROOT/docker-compose.yml"
  log ""
  log "  Verschillen (links: wat er draait, rechts: git):"
  # `diff` geeft 1 terug zodra er een verschil is, en met `set -o pipefail`
  # zou dat de pijplijn laten mislukken voordat we bij `exit 1` zijn. Vandaar
  # eerst opvangen; dan bepalen wij wanneer we stoppen en met welke code.
  # Ook de diff op genormaliseerde tekst, anders toont hij 78 identieke regels
  # als 78 verschillen en wijst hij nergens naar.
  COMPOSE_DIFF="$(diff <(tr -d '\015' < "$ROOT/docker-compose.yml") <(tr -d '\015' < "$SRC/deploy/docker-compose.yml") 2>&1 || true)"
  printf '%s
' "$COMPOSE_DIFF" | head -40 | sed 's/^/    /'
  exit 1
fi

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

# De draaiende configuratie toetsen tegen het nieuwe image.
#
# Anders dan het compose-bestand mág de configuratie afwijken van git: hij hoort
# bij deze installatie (besluit 21). Maar een schemawijziging kan hem ongeldig
# maken, en dan start de dienst niet meer op — met `restart: unless-stopped`
# levert dat een herstartlus op in plaats van een foutmelding.
#
# Dat is op 10 september 2026 gebeurd toen `mode`, `timers` en `sun` verplicht
# werden. Vandaar: eerst vragen of het nieuwe image met de oude configuratie
# overweg kan, en pas omwisselen als het antwoord ja is. Zie besluit 33.
controleer_configuratie() {
  [ "$NEEDS_BUILD" -eq 1 ] || return 0
  log "Configuratie nakijken tegen het nieuwe image..."
  if "$DOCKER" run --rm     -v "$ROOT/config:/app/config:ro"     "$IMAGE:latest" node dist/main.js --check-config; then
    return 0
  fi
  log ""
  log "GESTOPT: het nieuwe image kan de draaiende configuratie niet lezen."
  log "  De draaiende container is niet aangeraakt en blijft op de oude versie."
  log ""
  log "  De configuratie hoort bij deze installatie en gaat niet met git mee."
  log "  Is de versie in git de goede, neem hem dan over en draai opnieuw:"
  log "    cp $SRC/config/sites/*.json $ROOT/config/sites/"
  exit 1
}

if [ "$NEEDS_BUILD" -eq 1 ]; then
  # De huidige versie eerst wegzetten, zodat terugvallen mogelijk blijft.
  if "$DOCKER" image inspect "$IMAGE:latest" >/dev/null 2>&1; then
    "$DOCKER" tag "$IMAGE:latest" "$IMAGE:vorige"
    log "Huidige image bewaard als $IMAGE:vorige"
  fi

  log "Bouwen…"
  # Eerst bouwen, dan pas omwisselen. Mislukt dit, dan draait de oude container
  # gewoon door en is er niets gebeurd.
  # De commit en de bouwtijd gaan het image in, zodat /api/health kan zeggen
  # wat er draait (besluit 54). Op de commandoregel en niet in het
  # compose-bestand: dat laatste moet je op de NAS met de hand bijwerken, en
  # tot dan zou deploy.sh stoppen met uitrollen.
  VERSIE_COMMIT="$("$GIT" -C "$SRC" rev-parse --short HEAD)"
  VERSIE_GEBOUWD="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! "${COMPOSE[@]}" build       --build-arg HEMS_COMMIT="$VERSIE_COMMIT"       --build-arg HEMS_GEBOUWD="$VERSIE_GEBOUWD"; then
    log "FOUT: bouwen mislukt. De draaiende container is niet aangeraakt."
    exit 1
  fi
  log "Bouwen gelukt."
  # Ná het bouwen en vóór het omwisselen: het image moet bestaan om ermee te
  # kunnen toetsen, en de oude container moet nog draaien als het misgaat.
  controleer_configuratie
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

# Einde van het blok: hierna leest bash dit bestand niet meer.
exit
}
