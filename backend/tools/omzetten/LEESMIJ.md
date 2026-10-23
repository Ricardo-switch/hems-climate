# De app omzetten naar meer talen (besluit 185, stap 9)

Hoe het werkt staat in [besluit 185](../../../DECISIONS.md#185-meertalig-het-fundament-met-thuis-als-proef). Dit is de
werkplaats: waar het omzetten staat, en hoe je een pagina omzet.

## Waar het staat

- **Klaar:** Thuis en wat op elke pagina staat (0.59.1), de vijf tabbladen en
  de assistent (0.59.2), Instellingen en de pagina's erachter (0.59.3), Wat je
  huis kan, Indeling, Inrichten, het begin, het welkom en de film (0.59.4).
  Alles wat af is, staat in `OMGEZET` in `backend/test/taal.test.ts`.
- **Deel 5, wat de dienst zegt (0.59.5):** de stand van apparaten (`api/huis`,
  met `standCode` en `klimaat.actieCode`), het weer, de meldingen (ook op de
  telefoon), Opbrengst, de besluiten bij Vandaag, de ligging van de panelen,
  Klaarzetten, de vragen bij het begin, de standaardnamen van de etages, de
  rol bij Bewoners en toegang, en wat er nieuw is (`en` in `NIEUW`). De app
  let nergens meer op een Nederlands woord van de dienst.
- **Nog Nederlands, klein:** een foutmelding bij het begin (`onboarding.save`),
  `addon/CHANGELOG.md` (de notities bij een update in Home Assistant), en een
  paar namen die de dienst als terugval geeft ("je zonnesensor").
- **Deel 6, de assistent (0.59.6):** Engels verstaan (`woordzoeker.ts`,
  `opdracht.ts`), Engelse zinnen voor Assist (`zinnenVoor('en', …)`), en Piper
  per taal (`Stem.taalVoor`, `uitspraak(tekst, lang)`).
- **Daarna:** `'en'` in `HEEL` in `frontend/kit/taal.js`, zodat Automatisch
  Engels kiest. De uitleg bij Jij (`jij.taal.uitleg`, `jij.taal.enUitleg`)
  dan bijwerken. Duits later ([172]).

## Hoe de dienst een taal spreekt (deel 5)

- `taalVan()` in `backend/src/web/server.ts` leest `?taal=` of de kop `x-taal`;
  de app stuurt die mee met `haal()` en `stuur()` (`basis.js`). Een eigen
  `fetch` moet de kop zelf meegeven.
- Woorden staan per bestand in een tabel `WOORDEN` (of `NAMEN`) met `nl` en
  `en`. Wat bewaard wordt en duur is om te maken (het huis, Opbrengst), wordt
  per taal bewaard; wat goedkoop is, wordt per verzoek vertaald
  (`weatherInLang`, `todayInLang`, `keuzesInTaal`, `nieuwInTaal`).
- Meldingen staan in een bestand: de dienst maakt ze in beide talen (`en` op
  de melding) en `inTaal()` kiest. Voor de telefoon geldt de keuze bij Jij
  (`VoorkeurenStore.taal`): Automatisch is daar Nederlands. Als `'en'` in
  `HEEL` komt, hoort Automatisch daar de taal van het account in Home
  Assistant te worden.
- Elke versie in `NIEUW` krijgt `en` met evenveel regels; de test in
  `web.test.ts` eist het voor de versies die de app laat zien.

## Wat er nog kan

1. Klaar sinds 0.59.7: `'en'` staat in `HEEL`, dus Automatisch kiest Engels
   bij een Engels account of een Engelse browser; een melding op de telefoon
   volgt bij Automatisch de taal waarin de app het laatst opende
   (`VoorkeurenStore.zagTaal`). Een nieuwe taal komt pas in `HEEL` als de hele
   app, de dienst en de assistent hem spreken.
2. Een nieuwe zin voor de assistent: zet hem in beide talen in de woordzoeker
   of `opdracht.ts`, met een test per taal (`woordzoeker.test.ts`,
   `praten.test.ts`); een nieuwe zin voor Assist in beide lijsten in
   `zinnen.ts`, en `HEMS_ZINNEN_SCHRIJF=1` schrijft de voorbeelden voor de test
   in Home Assistant.
3. Duits later ([172]): een derde kolom in elke `WOORDEN`-tabel en een
   `teksten.de.js`.

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
