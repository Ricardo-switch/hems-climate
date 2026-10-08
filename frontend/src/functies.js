/*
 * Camera's en deurbel, in ontwerp 2 (besluiten 104 en 109). Welke camera's de
 * app toont en met welk beeld, en welke melder de deurbel is, bij welke camera.
 * De dienst doet een voorstel uit wat Home Assistant heeft; wat je hier kiest,
 * legt hij vast in een eigen bestand. Opslaan vraagt een beheerder.
 */
'use strict';

const { $$, esc, haal, deur } = app;

let info = null;
let concept = null;
let zon = null;
let melding = '';
let meldingFout = false;

async function laad() {
  const [f, z] = await Promise.allSettled([haal('api/functies'), haal('api/zon')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (f.status === 'fulfilled') {
    info = f.value;
    concept = JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel));
    if (!info.instellingen) zeg('Dit is het voorstel uit Home Assistant. Opslaan legt het vast.');
  } else {
    zeg('Niet beschikbaar: geen verbinding met Smart Climate, of Home Assistant is nog niet gelezen.', true);
  }
  teken();
}

function zeg(tekst, fout = false) {
  melding = tekst;
  meldingFout = fout;
  $$('[data-melding]').forEach((el) => {
    el.textContent = tekst;
    el.classList.toggle('fout', fout);
  });
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
  return `<section class="glas vraag">
    <div class="kopregel"><h2 class="kop-3">Camera's</h2></div>
    ${keuzes("Camera's in de app", 'camerasAan', [[true, 'Aan'], [false, 'Uit']], aan)}
    ${lijst.length ? rijen : '<p class="uitleg">Geen camera’s gevonden in Home Assistant.</p>'}
    <p class="mini">Vloeiend is lichter voor de tablet; scherp heeft meer detail. Kijken vraagt de inlog met je Home Assistant-account.</p>
  </section>`;
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
  return `<section class="glas vraag">
    <h2 class="kop-3">Deurbel</h2>
    ${keuzes('Deurbel', 'belAan', [[true, 'Aan'], [false, 'Uit']], d.aan, !melders.length)}
    ${melders.length ? '' : '<p class="uitleg">Geen deurbel gevonden in Home Assistant. Een deurbel met een melder (Reolink, Ring, Nest, UniFi en andere) verschijnt hier vanzelf.</p>'}
    <label class="veldnaam">Melder die afgaat als er wordt aangebeld<select class="invoer" data-veld="melder" ${uit ? 'disabled' : ''}>${melderOpties}</select></label>
    <label class="veldnaam">Beeld dat dan verschijnt<select class="invoer" data-veld="camera" ${uit ? 'disabled' : ''}>${opt(beelden, d.camera, 'Kies een camera…')}</select></label>
    <span class="veldnaam">Scherm aanzetten</span>
    ${keuzes('Scherm aanzetten', 'schermAan', [[true, 'Ja'], [false, 'Nee']], d.schermAan, uit)}
    <span class="veldnaam">Hoe lang het beeld blijft staan</span>
    ${keuzes('Hoe lang', 'seconden', [[60, '1 minuut'], [120, '2 minuten'], [300, '5 minuten']], d.seconden, uit)}
  </section>`;
}

function uitleg() {
  return `<section class="glas vraag">
    <h2 class="kop-3">Zo werkt het</h2>
    <p class="uitleg">Wordt er aangebeld, dan toont elke open pagina meteen het beeld van de deurbel, tot je het sluit of de tijd om is.</p>
    <p class="uitleg">Het scherm aanzetten kan alleen in Fully Kiosk Browser, zoals op een tablet aan de muur. In een gewone browser verschijnt het beeld als de pagina open staat.</p>
    <p class="uitleg">Smart Climate kijkt alleen: er gaat niets naar de camera's of de deurbel.</p>
  </section>`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  const kolommen = { 1: cameras(), 2: deurbel(), 3: uitleg() };
  $$('[data-kolom]').forEach((el) => (el.innerHTML = kolommen[el.dataset.kolom]));
  if (melding) zeg(melding, meldingFout);
}

/* ------------------------------------------------------------ doen */

document.addEventListener('click', async (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
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
    else if (s === 'seconden') concept.deurbel.seconden = w;
    else if (s.startsWith('camera:')) {
      // Per camera één beeld: het andere beeld van dezelfde camera gaat eruit.
      const c = info.gevonden.cameras[Number(s.slice(7))];
      const anders = new Set(c.beelden.map((b) => b.id));
      concept.cameras.lijst = concept.cameras.lijst.filter((id) => !anders.has(id));
      if (w) concept.cameras.lijst.push(w);
    }
    zeg('Nog niet opgeslagen.');
    teken();
  } else if (knop.hasAttribute('data-opslaan')) {
    await opslaan();
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
  zeg('Nog niet opgeslagen.');
  teken();
});

async function opslaan() {
  zeg('Even…');
  try {
    const res = await deur('api/functies', concept);
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return zeg('Alleen de beheerder kan dit opslaan.', true);
    if (!res.ok) return zeg(uit.fout ?? 'Niet opgeslagen.', true);
    info = uit;
    concept = JSON.parse(JSON.stringify(uit.instellingen));
    zeg('Opgeslagen.');
    teken();
  } catch {
    zeg('Niet opgeslagen: geen verbinding met Smart Climate.', true);
  }
}

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
void laad();
