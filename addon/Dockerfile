# De add-on, gebouwd op de basisafbeelding van Home Assistant.
#
# Twee fasen, net als bij de compose-uitrol: bouwen met de volledige toolchain,
# draaien met zo min mogelijk. Het verschil zit in de draaifase — die staat hier
# op de HA-basis in plaats van op kaal Alpine, omdat de Supervisor daar `bashio`
# en het opstartmechanisme in verwacht.
#
# De bouwcontext is de projectwortel, net als bij backend/Dockerfile:
#
#   docker build -f addon/Dockerfile .

ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base:latest

# ---------- de weergave bouwen ----------
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/build.js ./
COPY frontend/src ./src
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
RUN npm run typecheck && npm run build

# ---------- draaien ----------
FROM ${BUILD_FROM}

# Node zit niet in de HA-basis. Alleen de runtime; de toolchain bleef in de
# bouwfasen hierboven.
RUN apk add --no-cache nodejs tzdata

WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=web /web/dist ./web
COPY backend/package.json ./

COPY addon/run.sh /run.sh
RUN chmod a+x /run.sh

ENV NODE_ENV=production

CMD ["/run.sh"]
