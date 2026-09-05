# syntax=docker/dockerfile:1
#
# Twee fasen: bouwen met de volledige toolchain, draaien met zo min mogelijk.
#
# De kern heeft geen enkele runtime-afhankelijkheid — TypeScript, vitest en tsx
# zijn allemaal alleen nodig om te bouwen en te testen. De draaifase kopieert
# daarom alleen de gecompileerde `dist` en niets uit `node_modules`. Dat scheelt
# honderden megabytes en, belangrijker, alles wat daarin ooit een kwetsbaarheid
# kan krijgen.

# ---------- bouwen ----------
FROM node:22-alpine AS build

WORKDIR /build

# Eerst alleen de manifesten, zodat het installeren opnieuw gebruikt kan worden
# zolang de afhankelijkheden niet wijzigen.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY test ./test

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
COPY package.json ./

# Waar de gemonteerde mappen terechtkomen. `config/sites` zit onder /app zodat
# het opzoeken vanaf de werkmap hem vindt zonder extra instelling.
RUN mkdir -p /app/config/sites /logs

ENV NODE_ENV=production \
    SHADOW_LOG_DIR=/logs

# Geen poorten: deze dienst luistert nergens op. Hij verbindt alleen uitgaand
# met Home Assistant.

# De bewaking in de applicatie sluit zichzelf af wanneer er te lang geen besluit
# meer genomen is; het herstartbeleid van compose start hem dan opnieuw. Deze
# healthcheck is er voor de zichtbaarheid in de containerbeheerder: hij kijkt of
# er de afgelopen vijf minuten nog naar het besluitenlogboek is geschreven.
HEALTHCHECK --interval=2m --timeout=10s --start-period=90s --retries=2 \
  CMD node -e "const fs=require('fs');const d='/logs';const f=fs.readdirSync(d).filter(n=>n.startsWith('decisions-'));if(!f.length)process.exit(1);const newest=Math.max(...f.map(n=>fs.statSync(d+'/'+n).mtimeMs));process.exit(Date.now()-newest<5*60*1000?0:1)"

CMD ["node", "dist/main.js"]
