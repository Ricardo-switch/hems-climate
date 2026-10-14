/*
 * App en toegang (besluit 130): wie er ingelogd is, je gegevens, en welke
 * versie er draait. Wat los onderaan de oude Instellingen stond.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let sessie = null;
let gegevens = null;
let health = null;
let zon = null;

async function laadAlles() {
  const [s, g, h, z] = await Promise.allSettled([haal('api/sessie'), haal('api/export/info'), haal('api/health'), haal('api/zon')]);
  if (s.status === 'fulfilled') sessie = s.value;
  if (g.status === 'fulfilled') gegevens = g.value;
  if (h.status === 'fulfilled') health = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

function delen() {
  const inlog = !sessie ? '…' : sessie.toegang !== 'sessions' ? 'geen inlog nodig' : sessie.ingelogd ? `${sessie.naam ?? 'ingelogd'}${sessie.rol ? `, ${sessie.rol}` : ''}` : 'niet ingelogd';
  return [
    { id: 'inloggen', titel: 'Inloggen', zin: inlog, stand: sessie ? 'goed' : null },
    { id: 'gegevens', titel: 'Je gegevens', zin: gegevens?.bestanden != null ? `${gegevens.bestanden} dagen bewaard` : '…', stand: gegevens ? 'goed' : null },
    { id: 'versie', titel: 'Versie', zin: health?.versie?.commit ?? '…', stand: health ? 'goed' : null },
  ];
}

function inloggenVorm() {
  const s = sessie;
  if (!s) return '<p class="klein">Even laden…</p>';
  if (s.toegang !== 'sessions') return '<h2 class="kop-2">Inloggen</h2><p class="klein" style="margin: 0">Deze weergave vraagt geen inlog: wie hem kan openen, kan ook bedienen.</p>';
  const terug = encodeURIComponent(location.pathname);
  return `<h2 class="kop-2">Inloggen</h2>
    ${s.ingelogd
      ? `<p class="klein" style="margin: 0">Ingelogd als <b>${esc(s.naam ?? '')}</b>${s.rol ? `, ${esc(s.rol)}` : ''}.</p><button type="button" class="knop" data-uitloggen style="align-self: start">Uitloggen</button>`
      : `<p class="klein" style="margin: 0">Niet ingelogd. Kijken kan zo; bedienen en de camera vragen je Home Assistant-account.</p><a class="knop knop-licht" href="auth/login?terug=${terug}" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Inloggen</a>`}
    <p class="mini" style="margin: 0">Een bewoner bedient licht, screens en comfort. Een beheerder in Home Assistant stelt ook je huis, je energie en de functies in.</p>`;
}

function gegevensVorm() {
  const g = gegevens;
  const mb = g?.bytes != null ? nl(g.bytes / 1_000_000, 0) : null;
  return `<h2 class="kop-2">Je gegevens</h2>
    <p class="klein" style="margin: 0">Wat het huis meet en besluit, staat op je eigen NAS, één bestand per dag. ${g?.bestanden != null ? `Nu ${g.bestanden} dagen${mb ? `, samen ${mb} MB` : ''}.` : ''}</p>
    ${g?.bestanden ? '<a class="knop knop-licht" href="api/export" download style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Alles downloaden</a>' : ''}
    <p class="mini" style="margin: 0">Er gaat niets naar buiten. Alleen het weer vraagt de dienst op bij Open-Meteo, met je ligging op ongeveer tien kilometer.</p>`;
}

function versieVorm() {
  const v = health?.versie;
  const gebouwd = v?.gebouwd ? new Date(v.gebouwd).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  return `<h2 class="kop-2">Versie</h2>
    <p class="klein" style="margin: 0">${v ? `Versie <b>${esc(v.commit)}</b>${gebouwd ? `, van ${esc(gebouwd)}` : ''}.` : 'Onbekend.'}</p>
    <p class="mini" style="margin: 0">Een nieuwe versie komt vanzelf: de NAS haalt hem op zodra hij klaar en getest is.</p>`;
}

const NAAST = {
  inloggen: ['Waarom inloggen', ['Kijken kan iedereen op je eigen netwerk', 'Bedienen vraagt je Home Assistant-account', 'De tablet aan de muur logt één keer in']],
  gegevens: ['Waarvoor je gegevens zijn', ['Terugkijken bij Vandaag en Opbrengst', 'Het bewijs dat het huis het goed zou doen, voordat het zelf regelt', 'Later: het thermisch model, dat leert hoe elke kamer opwarmt']],
  versie: ['Zo blijft het bij', ['Elke versie wordt eerst getest', 'Daarna haalt de NAS hem vanzelf op']],
};

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { inloggen: inloggenVorm, gegevens: gegevensVorm, versie: versieVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const [kopje, lijst] = NAAST[nu] ?? NAAST.inloggen;
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`));
}

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-uitloggen]')) return;
  await fetch('auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  sessie = await haal('api/sessie').catch(() => sessie);
  teken();
});
void laadAlles();
