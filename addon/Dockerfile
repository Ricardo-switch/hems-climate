# De add-on, gebouwd op de basisafbeelding van Home Assistant.
#
# Twee fasen, net als bij de compose-uitrol: bouwen met de volledige toolchain,
# draaien met zo min mogelijk. Het verschil zit in de draaifase — die staat hier
# op de HA-basis in plaats van op kaal Alpine, omdat de Supervisor daar `bashio`
# en het opstartmechanisme in verwacht.
#
# De bouwcontext is de map van de add-on zelf, en niets daarbuiten. Dat is geen
# keuze: de Supervisor koppelt alleen die map aan (read-only op /addon) en draait
# daar `docker buildx build .`. Wat er niet in staat, bestaat tijdens het bouwen
# niet.
#
# Daarom wordt de boom eerst platgeslagen door addon/stage.ps1: dat zet de
# bestanden van de add-on bovenin en `backend/` en `frontend/` ernaast. De COPY's
# hieronder gaan uit van die vorm.
#
#   powershell -File addon/stage.ps1   -> dist-addon/
#   docker build dist-addon

ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest

# ---------- de weergave bouwen ----------
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/build.js ./
COPY frontend/src ./src
# De tekenmotor van ontwerp 2 (besluit 104), net als in backend/Dockerfile.
COPY frontend/kit ./kit
ENV HEMS_WEB_OUT=/web/dist
RUN npm run build

# ---------- de backend bouwen ----------
FROM node:22-alpine AS build

WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
COPY backend/test ./test
# De tests importeren gereedschap uit tools/, en de typecheck neemt het mee.
COPY backend/tools ./tools
RUN npm run typecheck && npm run build

# ---------- draaien ----------
FROM ${BUILD_FROM}

# Wat de Supervisor op een add-on-image verwacht. De workflow op GitHub geeft
# beide mee; bij een lokale bouw blijven ze leeg, en dat geeft niet.
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL \
  io.hass.type="addon" \
  io.hass.name="Smart Climate" \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.version="${BUILD_VERSION}" \
  org.opencontainers.image.version="${BUILD_VERSION}" \
  org.opencontainers.image.source="https://github.com/Ricardo-switch/hems-climate"

# Node zit niet in de HA-basis. Alleen de runtime; de toolchain bleef in de
# bouwfasen hierboven.
RUN apk add --no-cache nodejs tzdata

WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=web /web/dist ./web
COPY backend/package.json ./

COPY run.sh /run.sh
RUN chmod a+x /run.sh

ENV NODE_ENV=production

# Welke code dit is, voor /api/health, net als op de NAS (besluit 54).
# Helemaal achteraan, zodat alles erboven uit de cache kan komen.
ARG HEMS_COMMIT=onbekend
ARG HEMS_GEBOUWD=
ENV HEMS_COMMIT=$HEMS_COMMIT HEMS_GEBOUWD=$HEMS_GEBOUWD

CMD ["/run.sh"]
