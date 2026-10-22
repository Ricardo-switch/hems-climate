# De app omzetten naar meer talen (besluit 185, stap 9)

Hoe het werkt staat in [besluit 185](../../../DECISIONS.md#185-meertalig-het-fundament-met-thuis-als-proef). Dit is de
werkplaats: waar het omzetten staat, en hoe je een pagina omzet.

## Waar het staat

- **Klaar:** Thuis en wat op elke pagina staat (0.59.1), de vijf tabbladen en
  de assistent (0.59.2), Instellingen en de pagina's erachter (0.59.3).
- **Deel 4, bezig:** af zijn Wat je huis kan (`huis-kan.*`, heel `stand.js`),
  `huismodel.js` en Indeling (`indeling.*`). Nog te doen: Inrichten
  (`inrichten.*`, ruim 1500 regels), het begin (`begin.*`, `welkom.*`,
  `film.js`). Wat af is, staat in `OMGEZET` in
  `backend/test/taal.test.ts`; er komt pas een versie als deel 4 af is.
- **Deel 5:** wat de dienst in woorden geeft: de stand van apparaten in
  `house.ts`, het weer, de meldingen, de namen van periodes, de ligging van de
  panelen, de namen van camerabeelden, en wat er nieuw is (`NIEUW` in
  `version.ts`). Daarna `huismodel.ACTIEF` en de vaste patronen in `kamer.js`
  (`BEWEEGT`) naar codes.
- **Deel 6:** de assistent: Engels verstaan, Engelse zinnen voor Assist
  (`zinnen.ts`), een Engelse Piper-stem.
- **Daarna:** `'en'` in `HEEL` in `frontend/kit/taal.js`, zodat Automatisch
  Engels kiest. De uitleg bij Jij (`jij.taal.uitleg`, `jij.taal.enUitleg`)
  dan bijwerken. Duits later ([172]).

## Een pagina omzetten

1. Kijk wat er staat: `npm run teksten -- --alles --toon ../frontend/src/<pagina>.js`
   (in `backend/`). Lees het bestand ook zelf: losse woorden zonder een
   "Nederlands" woord ziet het hulpje niet altijd.
2. Schrijf de sleutels in beide talen naar twee bestanden en zet ze vóór het
   anker in de tekstbestanden:
   `python backend/tools/omzetten/voeg.py frontend/kit/teksten.nl.js nl.txt "  // Hoe voelt het (gevoel.js)"`
   en hetzelfde voor `teksten.en.js` met `"  // How does it feel (gevoel.js)"`.
   Engels is Brits; een meervoud is `{ one, other }` met `n`.
3. Vervang de teksten in de code met `vervang.py` (blokken `@@OUD`, `@@NIEUW`,
   `@@EIND`; elk oud stuk past precies één keer), of een groot stuk met
   `stuk.py` (van de regel die met het begin begint tot die met het eind
   begint).
4. In de HTML: `data-t="sleutel"` en `data-t-aria-label="sleutel"`, met het
   element zelf leeg. Een tekst met eigen HTML (`<b>`) mag; wat erin komt,
   ontsnap je eerst.
5. Zet het bestand in `OMGEZET` in `backend/test/taal.test.ts`, en de pagina in
   de paginatest "toont Thuis in het Engels" (`backend/test/page.test.ts`),
   met de toegankelijkheidscontrole. `HEMS_PAGE_SHOTS=<map>` maakt per pagina
   een afdruk.
6. De checks (in `backend/`: `npm run typecheck`, `npm run lint`, `TZ=UTC npx vitest run`; in `frontend/` `npm run build`, dan `HEMS_PAGE_TEST=1 TZ=UTC npx vitest run test/page.test.ts`), een versie (`VERSIE` en `NIEUW` in `version.ts`, de package-nummers, `addon/config.yaml`, `npm run changelog`), commit en push naar beta; main alleen via een PR die Ricardo samenvoegt.

Lange tekst niet via een heredoc in de shell (die breekt op aanhalingstekens):
schrijf hem naar een bestand en geef dat aan het script.

[172]: ../../../DECISIONS.md#172-de-app-is-af-opruimen-wat-er-nog-komt-en-talen-later
