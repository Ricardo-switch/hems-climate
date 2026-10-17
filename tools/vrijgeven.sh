#!/usr/bin/env bash
# Vrijgeven op de eigen pc (besluit 135).
#
# De CI op GitHub kost minuten, en die waren op tot 1 november 2026. Dit script doet hier wat de CI
# deed, in dezelfde volgorde, en zet daarna `stable` vooruit; de NAS volgt
# `stable` (besluit 54). Faalt er iets, dan blijft `stable` waar hij was.
#
#   1. main is gepusht, de werkmap is schoon, stable ligt erachter
#   2. de dienst: typecheck, lint, tests, build (in UTC, zoals de NAS)
#   3. de weergave: build
#   4. de pagina in een browser
#   5. de index van de besluiten is bij
#   6. deploy.sh: syntaxis en de melding bij stilvallen; ShellCheck als
#      deploy/ veranderde
#   7. het image zoals de NAS het bouwt, met alleen de mappen van de NAS:
#      met Docker als die draait, anders zonder (typecheck en build in een
#      kopie met alleen die mappen)
#   8. stable naar deze commit, alleen vooruit
#
# Gebruik: bash tools/vrijgeven.sh   (vanuit de map van het project)

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
stap() { printf '\n== %s\n' "$*"; }
stop() { printf '\nNIET VRIJGEGEVEN: %s\n' "$*" >&2; exit 1; }

stap "1. main, schoon, gepusht"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || stop "niet op main"
[ -z "$(git status --porcelain --untracked-files=no)" ] || stop "er staan wijzigingen die niet gecommit zijn"
git fetch -q origin main stable
HEAD_SHA=$(git rev-parse HEAD)
[ "$HEAD_SHA" = "$(git rev-parse origin/main)" ] || stop "main is niet gepusht, of loopt achter op GitHub"
git merge-base --is-ancestor origin/stable HEAD || stop "stable is niet een voorganger van deze commit; dat beslist een mens"
if [ "$(git rev-parse origin/stable)" = "$HEAD_SHA" ]; then echo "stable staat al op deze commit"; exit 0; fi
echo "van $(git rev-parse --short origin/stable) naar $(git rev-parse --short HEAD)"

export TZ=UTC

stap "2. de dienst: typecheck, lint, tests, build"
(cd backend && npm run --silent typecheck && npm run --silent lint && npx vitest run && npm run --silent build)

stap "3. de weergave: build"
(cd frontend && npm run --silent build)

stap "4. de pagina in een browser"
(cd backend && HEMS_PAGE_TEST=1 npx vitest run test/page.test.ts)

stap "5. de index van de besluiten"
(cd backend && npm run --silent decisions:index)
[ -z "$(git status --porcelain --untracked-files=no)" ] || stop "de index van de besluiten was niet bij; draai npm run decisions:index en commit"

stap "6. deploy.sh"
bash deploy/test-deploy.sh >/dev/null && echo "syntaxis en melding: goed"
if ! git diff --quiet origin/stable HEAD -- deploy addon; then
  if command -v shellcheck >/dev/null; then
    shellcheck -S warning deploy/deploy.sh deploy/test-deploy.sh addon/run.sh
  else
    stop "deploy/ of addon/ veranderde en ShellCheck staat niet op deze pc"
  fi
else
  echo "deploy/ en addon/ niet veranderd: geen ShellCheck nodig"
fi

stap "7. het image, met alleen de mappen van de NAS"
MAPPEN=$(sed -n 's/^SPARSE_MAPPEN="\(.*\)"/\1/p' deploy/deploy.sh)
[ -n "$MAPPEN" ] || stop "SPARSE_MAPPEN niet gevonden in deploy.sh"
# Een map die niet in git staat, laat de NAS gewoon leeg; `git archive` weigert
# hem. Sinds de repository openbaar is, staat `config` er niet meer in.
MAPPEN=$(for m in $MAPPEN; do git cat-file -e "HEAD:$m" 2>/dev/null && echo "$m"; done)
echo "mappen: $MAPPEN"
if docker info >/dev/null 2>&1; then
  # shellcheck disable=SC2086
  git archive --format=tar HEAD $MAPPEN | docker build -q -f backend/Dockerfile --build-arg HEMS_COMMIT="${HEAD_SHA:0:7}" -t hems-climate/shadow:lokaal - >/dev/null
  echo "docker build: goed"
else
  echo "Docker draait niet: zonder Docker, zoals de Dockerfile het doet"
  TMP=$(mktemp -d)
  # Eerst de koppelingen los (alleen de koppeling, nooit wat erachter zit), dan de kopie weg.
  ontkoppel() { for d in "$TMP/frontend/node_modules" "$TMP/backend/node_modules"; do
    if command -v cmd >/dev/null; then MSYS_NO_PATHCONV=1 cmd /c rmdir "$(cygpath -w "$d")" 2>/dev/null || true; else rm -f "$d"; fi
  done; }
  trap 'ontkoppel; rm -rf "$TMP"' EXIT
  # shellcheck disable=SC2086
  git archive --format=tar HEAD $MAPPEN | tar -x -C "$TMP"
  # De pakketten van hier lenen, niets downloaden.
  koppel() { if command -v cmd >/dev/null; then MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "$2")" "$(cygpath -w "$1")" >/dev/null; else ln -s "$1" "$2"; fi; }
  koppel "$PWD/frontend/node_modules" "$TMP/frontend/node_modules"
  koppel "$PWD/backend/node_modules" "$TMP/backend/node_modules"
  (cd "$TMP/frontend" && npm run --silent build >/dev/null)
  (cd "$TMP/backend" && npm run --silent typecheck && npm run --silent build)
  echo "typecheck en build met alleen de mappen van de NAS: goed"
fi

stap "8. stable naar deze commit"
git push origin "HEAD:refs/heads/stable"
echo "Vrijgegeven: $(git rev-parse --short HEAD). De NAS haalt hem binnen vijf minuten op."
