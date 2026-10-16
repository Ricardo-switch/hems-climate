/*
 * Bewoners en toegang (besluit 130 en 147): wie hier woont, wie er ingelogd
 * is, de sleutel voor de assistent van Home Assistant, je gegevens, en welke
 * versie er draait.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let sessie = null;
let gegevens = null;
let health = null;
let zon = null;
let bewoners = null;
let sleutel = null;

async function laadAlles() {
  const [s, g, h, z, b, k] = await Promise.allSettled([haal('api/sessie'), haal('api/export/info'), haal('api/versie'), haal('api/zon'), haal('api/bewoners'), fetch('api/sleutel', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))]);
  if (s.status === 'fulfilled') sessie = s.value;
  if (b.status === 'fulfilled') bewoners = b.value;
  if (k.status === 'fulfilled') sleutel = k.value?.sleutel ?? null;
  if (g.status === 'fulfilled') gegevens = g.value;
  if (h.status === 'fulfilled') health = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

function delen() {
  const inlog = !sessie ? '…' : sessie.toegang !== 'sessions' ? 'geen inlog nodig' : sessie.ingelogd ? `${sessie.naam ?? 'ingelogd'}${sessie.rol ? `, ${sessie.rol}` : ''}` : 'niet ingelogd';
  const namen = bewoners ? bewoners.bewoners.map((b) => b.naam).join(', ') || 'nog niemand' : '…';
  return [
    { id: 'bewoners', titel: 'Bewoners', zin: namen, stand: bewoners ? 'goed' : null },
    { id: 'inloggen', titel: 'Inloggen', zin: inlog, stand: sessie ? 'goed' : null },
    ...(sleutel ? [{ id: 'assistent', titel: 'Sleutel voor de assistent', zin: 'voor Home Assistant', stand: 'goed' }] : []),
    { id: 'gegevens', titel: 'Je gegevens', zin: gegevens?.bestanden != null ? `${gegevens.bestanden} dagen bewaard` : '…', stand: gegevens ? 'goed' : null },
    { id: 'versie', titel: 'Versie', zin: health?.nummer ? `${health.nummer}, wat is er nieuw` : '…', stand: health ? 'goed' : null },
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
      : `<p class="klein" style="margin: 0">Niet ingelogd.</p><a class="knop knop-licht" href="auth/login?terug=${terug}" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Inloggen</a>`}
    <p class="mini" style="margin: 0">De hele app vraagt een inlog met je account van Home Assistant. Een bewoner bedient licht, screens en zijn comfort. Een beheerder in Home Assistant stelt ook je huis, je energie en de functies in.</p>`;
}

/** Bewoners (besluit 147): kort wie hier woont, en de weg naar de pagina. */
function bewonersVorm() {
  const b = bewoners;
  if (!b) return '<h2 class="kop-2">Bewoners</h2><p class="klein" style="margin: 0">Even laden…</p>';
  const rijen = b.bewoners.map((x) => `<div class="rij-b">${esc(x.naam)}${x.ik ? ' (jij)' : ''}<span>${x.hoofd ? 'hoofdgebruiker' : x.comfort === 'eigen' ? 'eigen comfort' : 'volgt de hoofdgebruiker'}${x.thuis == null ? '' : x.thuis ? ', thuis' : ', weg'}</span></div>`).join('');
  return `<h2 class="kop-2">Bewoners</h2>
    <p class="klein" style="margin: 0">Wie hier woont, op volgorde. De eerste die thuis is, bepaalt het comfort. Iemand erbij: laat diegene één keer inloggen.</p>
    <div>${rijen || '<p class="klein" style="margin: 0">Nog niemand.</p>'}</div>
    <a class="knop knop-licht" href="bewoners.html" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Naar Bewoners</a>`;
}

/** De sleutel voor de assistent van Home Assistant (besluit 147), alleen voor een beheerder. */
function assistentVorm() {
  return `<h2 class="kop-2">Sleutel voor de assistent</h2>
    <p class="klein" style="margin: 0">De assistent in Home Assistant stelt zijn vragen zonder dat er iemand inlogt. Daarvoor heeft hij deze sleutel nodig.</p>
    <p class="klein" style="margin: 0">Zet deze regel in Home Assistant in secrets.yaml:</p>
    <div class="sleutel" data-sleutel>smart_climate_sleutel: "Bearer ${esc(sleutel ?? '')}"</div>
    <p class="mini" style="margin: 0">De rest-opdracht van de assistent stuurt hem mee (zie ha-assist in de handleiding). Deel hem met niemand anders.</p>`;
}

function gegevensVorm() {
  const g = gegevens;
  const mb = g?.bytes != null ? nl(g.bytes / 1_000_000, 0) : null;
  return `<h2 class="kop-2">Je gegevens</h2>
    <p class="klein" style="margin: 0">Wat het huis meet en besluit, blijft bij jou thuis, op de plek waar Smart Climate draait: één bestand per dag. ${g?.bestanden != null ? `Nu ${g.bestanden} dagen${mb ? `, samen ${mb} MB` : ''}.` : ''}</p>
    ${g?.bestanden ? '<a class="knop knop-licht" href="api/export" download style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Alles downloaden</a>' : ''}
    <p class="mini" style="margin: 0">Er gaat niets naar buiten. Alleen het weer vraagt de dienst op bij Open-Meteo, met je ligging op ongeveer tien kilometer.</p>`;
}

/** De versie en wat er nieuw is (besluit 131). */
function versieVorm() {
  const v = health;
  if (!v?.nummer) return '<h2 class="kop-2">Versie</h2><p class="klein" style="margin: 0">Onbekend.</p>';
  const gebouwd = v.gebouwd ? new Date(v.gebouwd).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const dag = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  // De nieuwste open, de rest ingeklapt, hooguit tien terug; per versie nieuw, beter en opgelost (besluit 133).
  const SOORTEN = [['nieuw', 'Nieuw'], ['beter', 'Beter'], ['opgelost', 'Opgelost']];
  const inhoud = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, t]) => `<div class="soort ${k}"><span class="label">${t}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('');
  const kort = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, t]) => `${n[k].length} ${t.toLowerCase()}`).join(', ');
  const nieuw = (v.nieuw ?? []).slice(0, 10).map((n, i) => `<details class="nieuw"${i === 0 ? ' open' : ''}><summary><b>Versie ${esc(n.versie)}</b><span class="mini">${esc(dag(n.datum))}${i === 0 || !kort(n) ? '' : ` · ${esc(kort(n))}`}</span></summary>${inhoud(n)}</details>`).join('');
  const komt = v.installatie === 'add-on'
    ? 'Een nieuwe versie zie je in Home Assistant, bij Add-ons. Daar werk je hem bij.'
    : 'Een nieuwe versie komt op de server waar Smart Climate draait. Werkt die vanzelf bij, dan hoef je niets te doen.';
  return `<h2 class="kop-2">Versie ${esc(v.nummer)}</h2>
    <p class="klein" style="margin: 0">${gebouwd ? `Gebouwd op ${esc(gebouwd)}. ` : ''}${esc(komt)}</p>
    ${nieuw ? `<h3 class="kop-3" style="margin: 6px 0 0">Wat is er nieuw</h3>${nieuw}` : ''}
    <p class="mini" style="margin: 0">Bouw ${esc(v.commit)}</p>`;
}

const NAAST = {
  bewoners: ['Waarom bewoners', ['Het comfort van wie thuis is, geldt', 'Het huis begroet je met je naam', 'Wat je tikt, telt voor jouw comfort']],
  inloggen: ['Waarom inloggen', ['Je huis is van jou: de hele app vraagt een inlog', 'De tablet aan de muur logt één keer in', 'Zo weet het huis wie er kijkt']],
  assistent: ['Waarom een sleutel', ['De assistent vraagt zonder mens erachter', 'Alleen met de sleutel komt hij binnen', 'Alleen een beheerder ziet hem']],
  gegevens: ['Waarvoor je gegevens zijn', ['Terugkijken bij Vandaag en Opbrengst', 'Het bewijs dat het huis het goed zou doen, voordat het zelf regelt', 'Later: het thermisch model, dat leert hoe elke kamer opwarmt']],
  versie: ['Hoe de nummers werken', ['Het derde getal gaat omhoog bij een reparatie', 'Het tweede bij iets nieuws', 'Versie 1.0 is de dag dat het huis zelf regelt', 'Elke versie wordt eerst getest']],
};

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { bewoners: bewonersVorm, inloggen: inloggenVorm, assistent: assistentVorm, gegevens: gegevensVorm, versie: versieVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const [kopje, lijst] = NAAST[nu] ?? NAAST.bewoners;
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
