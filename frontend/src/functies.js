/*
 * Functies (besluiten 109, 111 en 130). Welke camera's de app toont en met
 * welk beeld, welke melder de deurbel is, of je licht en screens bedient in de
 * app, en waar het weer vandaan komt. Praten met je huis (besluit 148): welk
 * taalmodel uit Home Assistant de assistent laat praten in eigen woorden, en of
 * hij met een zin mag bedienen. Meldingen (besluit 149): wanneer een batterij of
 * een airco-filter een melding geeft. In de opbouw van elke groep (130): links
 * de delen, wat je kiest wordt meteen bewaard. Bewaren vraagt een beheerder.
 * De dienst doet een voorstel uit wat Home Assistant heeft.
 */
'use strict';

const { $$, esc, haal } = app;

let info = null;
let concept = null;
let zon = null;
/** Het laatste proefantwoord van het taalmodel (besluit 148): vast naast eigen woorden. */
let proef = null;

async function laad() {
  const [f, z] = await Promise.allSettled([haal('api/functies'), haal('api/zon')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (f.status === 'fulfilled') {
    info = f.value;
    concept = JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel));
    concept.weer ??= info.voorstel.weer;
    concept.licht ??= info.voorstel.licht;
    concept.schermen ??= info.voorstel.schermen ?? { bedienen: true };
    concept.praten ??= info.voorstel.praten ?? { taalmodel: null, bedienen: true };
    concept.meldingen ??= info.voorstel.meldingen ?? { batterij: 10, filter: 10 };
  }
  teken();
}

/* ------------------------------------------------------------ tekenen */

function keuzes(label, sleutel, opties, huidig, uit = false) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${JSON.stringify(w) === JSON.stringify(huidig)}" ${uit ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
}

/** Het beeld dat van deze camera in de lijst staat, of null als hij niet getoond wordt. */
const gekozenBeeld = (c) => c.beelden.find((b) => concept.cameras.lijst.includes(b.id))?.id ?? null;

function cameras() {
  const lijst = info.gevonden.cameras;
  const aan = concept.cameras.aan;
  const rijen = lijst
    .map((c, i) => {
      const beeld = gekozenBeeld(c);
      const opties = [[null, 'Niet tonen'], ...c.beelden.map((b) => [b.id, b.naam.charAt(0).toUpperCase() + b.naam.slice(1)])];
      return `<div class="regelrij" style="flex-direction: column; align-items: stretch"><div class="l"><b>${esc(c.naam)}</b><span>${beeld ? 'In de app, in de kamer waar hij staat' : 'Niet in de app'}</span></div>${keuzes(`Beeld van ${c.naam}`, `camera:${i}`, opties, beeld, !aan)}</div>`;
    })
    .join('');
  return `<h2 class="kop-2">Camera's</h2>
    ${keuzes("Camera's in de app", 'camerasAan', [[true, 'Aan'], [false, 'Uit']], aan)}
    <div>${lijst.length ? rijen : '<p class="uitleg">Geen camera’s gevonden in Home Assistant.</p>'}</div>
    <p class="mini">Vloeiend is lichter voor de tablet; scherp heeft meer detail. Kijken vraagt de inlog met je Home Assistant-account.</p>`;
}

function deurbel() {
  const d = concept.deurbel;
  const melders = info.gevonden.melders;
  const beelden = info.gevonden.cameras.flatMap((c) => c.beelden.map((b) => ({ id: b.id, naam: c.beelden.length > 1 ? `${c.naam}, ${b.naam}` : c.naam })));
  const opt = (lijst, huidig, leeg) => `<option value="">${esc(leeg)}</option>${lijst.map((x) => `<option value="${esc(x.id)}" ${x.id === huidig ? 'selected' : ''}>${esc(x.naam)}</option>`).join('')}`;
  const zeker = melders.filter((m) => m.zeker);
  const misschien = melders.filter((m) => !m.zeker);
  const melderOpties = `<option value="">Kies de melder…</option>${zeker.length ? `<optgroup label="Een deurbel">${zeker.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}${misschien.length ? `<optgroup label="Heet als een deurbel">${misschien.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}`;
  const uit = !d.aan;
  return `<h2 class="kop-2">Deurbel</h2>
    ${keuzes('Deurbel', 'belAan', [[true, 'Aan'], [false, 'Uit']], d.aan, !melders.length)}
    ${melders.length ? '' : '<p class="uitleg">Geen deurbel gevonden in Home Assistant. Een deurbel met een melder (Reolink, Ring, Nest, UniFi en andere) verschijnt hier vanzelf.</p>'}
    <label class="veldnaam">Melder die afgaat als er wordt aangebeld<select class="invoer" data-veld="melder" ${uit ? 'disabled' : ''}>${melderOpties}</select></label>
    <label class="veldnaam">Beeld dat dan verschijnt<select class="invoer" data-veld="camera" ${uit ? 'disabled' : ''}>${opt(beelden, d.camera, 'Kies een camera…')}</select></label>
    <span class="veldnaam">Het scherm van de tablet aanzetten</span>
    ${keuzes('Scherm aanzetten', 'schermAan', [[true, 'Ja'], [false, 'Nee']], d.schermAan, uit)}
    <span class="veldnaam">Hoe lang het beeld blijft staan</span>
    ${keuzes('Hoe lang', 'seconden', [[60, '1 minuut'], [120, '2 minuten'], [300, '5 minuten']], d.seconden, uit)}`;
}

function licht() {
  const mag = info.lichtMogelijk === true;
  const schermMag = info.schermMogelijk === true;
  // Alleen wat deze installatie toestaat (besluit 130): een knop die niets kan, staat er niet.
  return `<h2 class="kop-2">Licht en screens</h2>
    ${mag ? `<span class="veldnaam">Licht en scènes</span>${keuzes('Licht bedienen', 'lichtAan', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']], concept.licht.bedienen)}` : ''}
    ${schermMag ? `<span class="veldnaam">Screens en zonnescherm</span>${keuzes('Schermen bedienen', 'schermenAan', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']], concept.schermen.bedienen)}` : ''}
    <p class="mini">${mag || schermMag ? 'Met je inlog. Bedienen doe je in het huis, bij de kamer.' : 'Deze installatie staat bedienen in de app niet toe; je ziet wel wat er aan staat. Wie Smart Climate installeerde, kan het aanzetten.'}</p>`;
}

/** Praten met je huis (besluit 148, schets Wand-Instellingen-Praten). */
function praten() {
  const modellen = info.gevonden.taalmodellen ?? [];
  const p = concept.praten;
  const bedienKan = info.lichtMogelijk === true || info.schermMogelijk === true;
  const proefHtml = !p.taalmodel
    ? ''
    : proef === 'bezig'
      ? '<p class="mini">Even proberen…</p>'
      : proef
        ? `<div class="proef"><div><span>Vast antwoord</span>${esc(proef.vast)}</div><div class="eigen"><span>In eigen woorden</span>${proef.eigen ? esc(proef.eigen) : 'Lukte niet; dan hoor je het vaste antwoord.'}</div></div>
          ${proef.snel && proef.ms != null ? `<p class="mini">Antwoord na ${esc((proef.ms / 1000).toFixed(1).replace('.', ','))} seconden.</p>` : ''}
          ${proef.reden ? `<p class="uitleg" style="color: var(--zon)">${esc(proef.reden)}</p>` : ''}`
        : '';
  return `<h2 class="kop-2">Antwoorden in eigen woorden</h2>
    ${modellen.length ? keuzes('Taalmodel', 'taalmodel', [[null, 'Uit'], ...modellen.map((m) => [m.id, m.naam])], p.taalmodel) : '<p class="uitleg">Geen AI-taak gevonden in Home Assistant. Voeg er een toe, zoals Google Gemini bij Apparaten en diensten; dan staat hij hier.</p>'}
    <p class="mini">De assistent zegt het vaste antwoord op zijn eigen manier, met een taalmodel uit Home Assistant. Klopt een getal niet, of duurt het langer dan 5 seconden, dan hoor je het vaste antwoord.</p>
    ${p.taalmodel ? `<div><button type="button" class="knop knop-licht" data-proef>${proef && proef !== 'bezig' ? 'Nog een keer proberen' : 'Proberen'}</button></div>` : ''}
    ${proefHtml}
    <div class="buiten"><div><b class="wel">Gaat naar het taalmodel</b><span>Je vraag als tekst, het vaste antwoord met de getallen, en de namen van kamers, lampen en schermen</span></div><div><b class="niet">Blijft in huis</b><span>Je stem, camerabeelden, en wie er thuis is</span></div></div>
    ${bedienKan ? `<h2 class="kop-2" style="margin-top: 8px">Bedienen met de assistent</h2>
    ${keuzes('Bedienen met de assistent', 'pratenBedienen', [[true, 'Aan'], [false, 'Uit']], p.bedienen)}
    <p class="mini">Zeg wat je wilt, zoals "doe het licht beneden wat zachter" of "screen dicht". Het gebeurt meteen, en het huis zegt wat het deed. Lampen en scènes${info.schermMogelijk ? ', screens en het zonnescherm' : ''}, zoals bij Licht en screens. Een garagedeur, poort of deur nooit; airco's en cv pas als Smart Climate mag regelen.</p>` : ''}`;
}

function weer() {
  const bronnen = info.gevonden.weerbronnen ?? [];
  // Open-Meteo voorop (besluit 130): werkt voor elk huis. De rest onder "Andere bron".
  const meteo = bronnen.find((b) => b.id === 'open-meteo');
  const andere = bronnen.filter((b) => b.id !== 'open-meteo');
  const anderGekozen = concept.weer.bron !== 'open-meteo';
  return `<h2 class="kop-2">Weer</h2>
    ${meteo ? keuzes('Weerbron', 'weerBron', [['open-meteo', 'Open-Meteo, via internet']], concept.weer.bron) : ''}
    <p class="mini">Voor het weer van vandaag en de komende dagen, en wat je panelen dan leveren.</p>
    <details ${anderGekozen ? 'open' : ''}><summary class="mini" style="cursor: pointer; font-weight: 700; color: var(--zacht)">Andere bron</summary>
      <div style="margin-top: 8px">${keuzes('Andere weerbron', 'weerBron', [...andere.map((b) => [b.id, b.naam]), [null, 'Geen']], concept.weer.bron)}</div>
    </details>
    <span class="veldnaam">De verwachting per uur bewaren</span>
    ${keuzes('Verwachting per uur', 'weerUren', [[true, 'Bewaren'], [false, 'Niet bewaren']], concept.weer.uren !== false)}
    <p class="mini">Elk uur de verwachting voor twee dagen: buitentemperatuur, zon en wind. Daarmee leert het huis later de temperatuur in je kamers vooruit te rekenen. Alleen de ligging op ongeveer tien kilometer gaat naar Open-Meteo.</p>`;
}

/** Meldingen (besluit 149): onder welk percentage een batterij of filter een melding geeft. */
const DREMPELS = [[null, 'Nooit'], [5, '5%'], [10, '10%'], [20, '20%'], [30, '30%']];
function meldingen() {
  const m = concept.meldingen;
  return `<h2 class="kop-2">Meldingen</h2>
    <span class="veldnaam">Een batterij is bijna leeg onder</span>
    ${keuzes('Batterij bijna leeg onder', 'drempelBatterij', DREMPELS, m.batterij)}
    <span class="veldnaam">Een filter van een airco is bijna vol onder</span>
    ${keuzes('Filter bijna vol onder', 'drempelFilter', DREMPELS, m.filter)}
    <p class="mini">Dan staat het bij de bel en op Thuis. Bij Onderhoud zie je altijd alle batterijen en filters.</p>`;
}

const NAAST = {
  cameras: ['Zo werkt het', ['De camera staat in de kamer waar hij hangt, bij Thuis', 'Smart Climate kijkt alleen: er gaat niets naar de camera']],
  deurbel: ['Zo werkt de deurbel', ['Wordt er aangebeld, dan toont elke open pagina meteen het beeld', 'Tot je het sluit, of de tijd om is', 'Het scherm aanzetten kan alleen in Fully Kiosk Browser']],
  licht: ['Zo werkt het', ['Bedienen doe je in het huis: tik op een kamer, dan op de lamp of het screen', 'De regeling raakt je lampen en screens niet aan']],
  praten: ['Zo werkt het', ['Het vaste antwoord blijft de basis: het taalmodel zegt het alleen anders', 'Elk getal moet kloppen met wat het huis meet, anders hoor je het vaste antwoord', '"Stop" stopt een scherm dat beweegt', 'Is het gratis gebruik op, dan werkt bedienen gewoon door']],
  meldingen: ['Zo werkt het', ['Een melding komt bij de bel en op Thuis, met een tik naar het apparaat', 'Is het weer goed, dan schuift de melding naar Eerder', 'Een sensor op 20% doet het vaak nog maanden']],
  weer: ['Waarvoor dit nodig is', ['Het weer van vandaag en de komende dagen', 'Wat je panelen dan naar verwachting leveren', 'Later: de temperatuur per kamer vooruit rekenen']],
};

function delen() {
  if (!info || !concept) return [];
  const f = concept;
  const beelden = f.cameras.aan ? f.cameras.lijst.length : 0;
  const weerNaam = (info.gevonden.weerbronnen ?? []).find((b) => b.id === f.weer.bron)?.naam?.replace(' (via internet)', '') ?? 'geen';
  return [
    { id: 'cameras', titel: "Camera's", zin: f.cameras.aan ? `${beelden} in de app` : 'uit', stand: 'goed' },
    { id: 'deurbel', titel: 'Deurbel', zin: f.deurbel.aan ? `beeld ${f.deurbel.seconden / 60 >= 1 ? `${f.deurbel.seconden / 60} min` : `${f.deurbel.seconden} s`}` : 'uit', stand: f.deurbel.aan && (!f.deurbel.melder || !f.deurbel.camera) ? 'mist' : 'goed' },
    { id: 'licht', titel: 'Licht en screens', zin: info.lichtMogelijk || info.schermMogelijk ? (f.licht.bedienen ? 'bedienen in de app' : 'alleen kijken') : 'alleen kijken', stand: 'goed' },
    { id: 'weer', titel: 'Weer', zin: weerNaam, stand: f.weer.bron ? 'goed' : 'leeg' },
    { id: 'meldingen', titel: 'Meldingen', zin: drempelZin(f.meldingen), stand: 'goed' },
    { id: 'praten', titel: 'Praten met je huis', zin: f.praten.taalmodel ? (info.gevonden.taalmodellen ?? []).find((m) => m.id === f.praten.taalmodel)?.naam ?? 'eigen woorden' : 'vaste zinnen', stand: 'goed' },
  ];
}

function drempelZin(m) {
  const t = (v) => (v == null ? 'nooit' : `onder ${v}%`);
  return m.batterij === m.filter ? t(m.batterij) : `batterij ${t(m.batterij)}, filter ${t(m.filter)}`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  const nu = groep.tekenDelen(delen());
  const vorm = { cameras, deurbel, licht, weer, praten, meldingen }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const [kopje, lijst] = NAAST[nu] ?? NAAST.cameras;
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`));
}

function bewaar() {
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/functies', concept);
    if (uit?.ok) info = uit.antwoord;
    return uit;
  });
}

/* ------------------------------------------------------------ doen */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  // Proberen (besluit 148): één vraag aan het gekozen taalmodel, er verandert niets.
  if (knop.hasAttribute('data-proef') && concept.praten.taalmodel) {
    proef = 'bezig';
    teken();
    void haal(`api/praten/proef?model=${encodeURIComponent(concept.praten.taalmodel)}`).then(
      (r) => ((proef = r), teken()),
      () => ((proef = { vast: 'Het taalmodel gaf geen antwoord.', eigen: null }), teken()),
    );
    return;
  }
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    const s = knop.dataset.kies;
    if (s === 'camerasAan') concept.cameras.aan = w;
    else if (s === 'belAan') {
      concept.deurbel.aan = w;
      // Aanzetten zonder keuze: de eerste deurbel, met zijn eigen camera.
      if (w && !concept.deurbel.melder) {
        const m = info.gevonden.melders[0];
        concept.deurbel.melder = m?.id ?? null;
        concept.deurbel.camera ??= m?.camera ?? null;
      }
    } else if (s === 'schermAan') concept.deurbel.schermAan = w;
    else if (s === 'lichtAan') concept.licht.bedienen = w;
    else if (s === 'schermenAan') concept.schermen.bedienen = w;
    else if (s === 'weerBron') concept.weer.bron = w;
    else if (s === 'weerUren') concept.weer.uren = w;
    else if (s === 'taalmodel') {
      concept.praten.taalmodel = w;
      proef = null;
    } else if (s === 'pratenBedienen') concept.praten.bedienen = w;
    else if (s === 'seconden') concept.deurbel.seconden = w;
    else if (s === 'drempelBatterij') concept.meldingen.batterij = w;
    else if (s === 'drempelFilter') concept.meldingen.filter = w;
    else if (s.startsWith('camera:')) {
      // Per camera één beeld: het andere beeld van dezelfde camera gaat eruit.
      const c = info.gevonden.cameras[Number(s.slice(7))];
      const anders = new Set(c.beelden.map((b) => b.id));
      concept.cameras.lijst = concept.cameras.lijst.filter((id) => !anders.has(id));
      if (w) concept.cameras.lijst.push(w);
    }
    teken();
    // Een deurbel aan zonder melder of beeld kan de dienst niet bewaren: eerst kiezen.
    if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', 'Kies de melder en het beeld van de deurbel');
    bewaar();
  }
});

document.addEventListener('change', (e) => {
  const veld = e.target.closest('[data-veld]');
  if (!veld || !concept) return;
  const v = veld.value || null;
  if (veld.dataset.veld === 'melder') {
    concept.deurbel.melder = v;
    // Een melder met een eigen camera neemt die mee, als er nog geen beeld gekozen is.
    const m = info.gevonden.melders.find((x) => x.id === v);
    if (m?.camera && !concept.deurbel.camera) concept.deurbel.camera = m.camera;
  } else if (veld.dataset.veld === 'camera') concept.deurbel.camera = v;
  teken();
  if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', 'Kies de melder en het beeld van de deurbel');
  bewaar();
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laad();
