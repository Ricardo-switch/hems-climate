# syntax=docker/dockerfile:1
#
# Twee fasen: bouwen met de volledige toolchain, draaien met zo min mogelijk.
#
# De kern heeft geen enkele runtime-afhankelijkheid — TypeScript, vitest en tsx
# zijn allemaal alleen nodig om te bouwen en te testen. De draaifase kopieert
# daarom alleen de gecompileerde `dist` en niets uit `node_modules`. Dat scheelt
# honderden megabytes en, belangrijker, alles wat daarin ooit een kwetsbaarheid
# kan krijgen.

# De bouwcontext is de projectwortel en niet `backend/`, want de weergave wordt
# hier ook gebouwd en die staat in `frontend/`. Vandaar het pad in elke COPY.
#
#   docker build -f backend/Dockerfile .

# ---------- de weergave bouwen ----------
#
# Aparte fase, en met opzet als eerste: Tailwind en zijn afhankelijkheden komen
# zo nooit in de buurt van de draaifase. Wat er uit komt is drie bestanden.
FROM node:22-alpine AS web

WORKDIR /web

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/build.js ./
COPY frontend/src ./src
# De tekenmotor van ontwerp 2: de schets is de code (besluit 104). Hij staat in
# frontend/ en niet in design/, want de NAS checkt design/ niet uit.
COPY frontend/kit ./kit

# Naar een vaste map, los van de mappenstructuur van het project: de backend
# hoeft niet te weten waar de bron stond.
ENV HEMS_WEB_OUT=/web/dist
RUN npm run build

# ---------- bouwen ----------
FROM node:22-alpine AS build

WORKDIR /build

# Eerst alleen de manifesten, zodat het installeren opnieuw gebruikt kan worden
# zolang de afhankelijkheden niet wijzigen.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
COPY backend/test ./test
# De tests importeren gereedschap uit tools/, en de typecheck neemt het mee.
COPY backend/tools ./tools

# Typecontrole en compilatie. Beide hebben alleen de TypeScript-compiler nodig
# en geen platformspecifieke binaries.
#
# De testsuite draait hier bewust niet standaard mee. Vitest leunt op esbuild en
# rollup, en die hebben binaries per processorarchitectuur; een lockfile die op
# Windows is gemaakt kan op een NAS met een andere architectuur struikelen over
# een optionele afhankelijkheid die er niet in staat. Dat zou een bouwfout geven
# die niets met deze code te maken heeft. De tests horen te draaien waar je
# ontwikkelt en in CI.
#
# Wil je ze toch in het image: docker build --build-arg RUN_TESTS=true
ARG RUN_TESTS=false
RUN npm run typecheck  && if [ "$RUN_TESTS" = "true" ]; then npm test; fi  && npm run build

# ---------- draaien ----------
FROM node:22-alpine AS runtime

# Tijdzonegegevens. Zonder tzdata kent Alpine alleen UTC, en dan valt de
# dagindeling terug op de proceszone — precies de fout die deze stap anders
# stilzwijgend zou introduceren.
RUN apk add --no-cache tzdata

WORKDIR /app

COPY --from=build /build/dist ./dist
COPY backend/package.json ./

# De gebouwde weergave. `defaultWebDir` zoekt hem naast `dist`, dus dit pad
# hoort bij die functie — verplaats je er één, verplaats dan allebei.
COPY --from=web /web/dist ./web

# Het wekwoord "Hé huis", dat de dienst zelf hoort (besluit 208). Alleen de
# ONNX-bestanden: de .tflite is voor de openWakeWord-add-on van Home Assistant.
COPY addon/wekwoord/*.onnx ./wekwoord/

# Waar de gemonteerde mappen terechtkomen. `config/sites` zit onder /app zodat
# het opzoeken vanaf de werkmap hem vindt zonder extra instelling.
RUN mkdir -p /app/config/sites /logs

ENV NODE_ENV=production \
    SHADOW_LOG_DIR=/logs

# De read-only weergave. Staat standaard uit: zonder HEMS_WEB_PORT luistert deze
# dienst nergens op en verbindt hij alleen uitgaand met Home Assistant. De
# compose zet de poort; dat is een keuze die je daar maakt en ziet staan.
EXPOSE 8080

# De bewaking in de applicatie sluit zichzelf af wanneer er te lang geen besluit
# meer genomen is; het herstartbeleid van compose start hem dan opnieuw. Deze
# healthcheck is er voor de zichtbaarheid in de containerbeheerder: hij kijkt of
# er de afgelopen vijf minuten nog naar het besluitenlogboek is geschreven.
HEALTHCHECK --interval=2m --timeout=10s --start-period=90s --retries=2 \
  CMD node -e "const fs=require('fs');const d='/logs';const f=fs.readdirSync(d).filter(n=>n.startsWith('decisions-'));if(!f.length)process.exit(1);const newest=Math.max(...f.map(n=>fs.statSync(d+'/'+n).mtimeMs));process.exit(Date.now()-newest<5*60*1000?0:1)"

# Welke code dit is, voor /api/health (besluit 54). Helemaal achteraan: deze
# waarden verschillen per uitrol, en alles erboven blijft zo uit de cache komen.
# Zonder bouwargumenten staat er `onbekend`, en dat zegt de dienst dan ook.
ARG HEMS_COMMIT=onbekend
ARG HEMS_GEBOUWD=
ENV HEMS_COMMIT=$HEMS_COMMIT     HEMS_GEBOUWD=$HEMS_GEBOUWD

CMD ["node", "dist/main.js"]
