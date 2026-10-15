/*
 * Regeling (besluit 130): wie wat regelt, en welke apparaten op zon mogen
 * starten. Wat hier stond bij "Wie stuurt" op de oude Instellingen, en de
 * apparaten op zon van Zon en aansluiting.
 *
 * Eerlijk over de stand: klimaat kijkt mee tot het bewijs er is (besluit 64);
 * dan staat er "Kijkt mee", met hoe ver het is. Lampen en scènes bedien je zelf.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let site = null;
let terugblik = null;
let huisData = null;
let aInfo = null;
let opZon = {};
let zon = null;

async function laadAlles() {
  const [s, d, h, a, z] = await Promise.allSettled([haal('api/site'), haal('api/divergence'), haal('api/huis'), haal('api/aansluiting'), haal('api/zon')]);
  if (s.status === 'fulfilled') site = s.value;
  if (d.status === 'fulfilled') terugblik = d.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (a.status === 'fulfilled') {
    aInfo = a.value;
    opZon = { ...(aInfo.antwoorden?.opZon ?? {}) };
  }
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

/* ------------------------------------------------------------ de delen */

const klimaat = () => site?.actuators ?? [];
const uitstelbaar = () => (huisData?.etages ?? []).flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).filter((x) => x.soort === 'apparaat');

function delen() {
  const opZonAan = Object.values(opZon).filter(Boolean).length + (aInfo?.configuratie?.apparaten?.length ?? 0);
  return [
    { id: 'klimaat', titel: 'Klimaat', zin: huisData ? `${kamersMee().length} ${kamersMee().length === 1 ? 'kamer' : 'kamers'}, kijkt mee` : klimaat().length ? `${klimaat().length} apparaten, kijkt mee` : '…', stand: site ? 'goed' : null },
    { id: 'opzon', titel: 'Apparaten op zon', zin: aInfo ? (opZonAan ? `${opZonAan} op zon` : 'geen') : '…', stand: aInfo ? 'goed' : null },
    { id: 'licht', titel: 'Licht en screens', zin: 'bedien je zelf', stand: 'goed' },
  ];
}

const FASEN = [['leren', 'Leren'], ['kijken', 'Kijkt mee'], ['regelen', 'Regelt']];
const fase = (nu) => `<span class="fase" role="img" aria-label="${FASEN.find(([k]) => k === nu)[1]}">${FASEN.map(([k, l]) => `<i class="${k === nu ? k : ''}">${l}</i>`).join('')}</span>`;

/*
 * Per kamer wat er regelt (besluit 138). Vastleggen gebeurt bij de kamer, in
 * Indeling bij Verwarmen en koelen; hier het overzicht, met een tik erheen.
 */
const ROL_ZIN = { houdt: 'houdt op temperatuur', zon: 'helpt op zon' };
const binnenKamers = () => (huisData?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => e.ruimtes ?? []);
const actiefIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat' && a.klimaat?.rol && a.klimaat.rol !== 'kijken').sort((a, b) => (a.klimaat.rol === b.klimaat.rol ? 0 : a.klimaat.rol === 'houdt' ? -1 : 1));
const kamersMee = () => binnenKamers().filter((r) => actiefIn(r).length);
const naarKamer = (r) => `indeling.html#${encodeURIComponent(r.id)}/warmte`;

function klimaatVorm() {
  const winter = terugblik?.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
  const van = terugblik?.dataset?.vanMs ?? terugblik?.vanMs;
  const sinds = van ? new Date(van).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : null;
  const rijen = huisData
    ? kamersMee().map((r) => `<a class="regelrij kamerrij" href="${naarKamer(r)}"><div class="l"><b>${esc(r.naam)}</b><span>${esc(actiefIn(r).map((a) => `${a.naam} ${ROL_ZIN[a.klimaat.rol]}`).join(', '))}</span></div><span class="pijl" aria-hidden="true">›</span></a>`).join('')
    : '';
  const nietMee = binnenKamers().filter((r) => !actiefIn(r).length);
  const rest = nietMee.length
    ? `<p class="klein" style="margin: 0">Doen nog niet mee: ${nietMee.map((r) => `<a href="${naarKamer(r)}">${esc(r.naam)}</a>`).join(', ')}. Kies bij de kamer wat er regelt.</p>`
    : '';
  const stand = `<div class="regelrij"><div class="l"><b>Kijkt mee${sinds ? ` sinds ${esc(sinds)}` : ''}</b><span>Zegt wat het zou doen, en schakelt nog niets</span></div>${fase('kijken')}</div>`;
  const bewijs = winter
    ? `<div class="bewijs"><span class="mini">Winterdagen: ${nl(winter.dagen, 0)} van ${winter.doel}</span><span class="balkje"><i style="width: ${Math.min(100, (winter.dagen / winter.doel) * 100).toFixed(0)}%"></i></span></div>
       <p class="mini" style="margin: 0">Klimaat gaat pas zelf regelen na ${winter.doel} winterdagen meekijken waarin het minstens zo goed zou doen als nu. Jij beslist, en terug kan altijd.</p>`
    : '';
  return `<h2 class="kop-2">Klimaat</h2>
    <p class="klein" style="margin: 0">Per kamer wat er regelt. Tik op een kamer om het te veranderen.</p>
    ${stand}
    <div>${rijen || '<p class="klein">Nog geen kamer doet mee.</p>'}</div>
    ${rest}
    ${bewijs}`;
}

const keuzes = (label, sleutel, opties, huidig) => `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${JSON.stringify(w) === JSON.stringify(huidig)}">${esc(t)}</button>`).join('')}</div>`;

function opZonVorm() {
  if (!aInfo) return '<p class="klein">Even laden…</p>';
  const vast = new Set(aInfo.configuratie.apparaten.map((x) => x.id));
  const ingesteld = (naam) => `<div class="regelrij"><div class="l"><b>${esc(naam)}</b><span>Start bij zonne-overschot. Ingesteld in de configuratie.</span></div><span class="label-chip goed">Aan</span></div>`;
  const rijen = [];
  for (const x of aInfo.gevonden.apparaten) {
    if (vast.has(x.id)) {
      rijen.push(ingesteld(x.naam));
      continue;
    }
    rijen.push(`<div class="regelrij" style="flex-direction: column; align-items: stretch"><div class="l"><b>${esc(x.naam)}</b><span>Kan op afstand starten. Automatisch starten bij zonne-overschot?</span></div>${keuzes(`${x.naam} op zon`, `opZon:${x.id}`, [[true, 'Ja'], [false, 'Nee']], opZon[x.id] ?? null)}</div>`);
  }
  for (const x of aInfo.configuratie.apparaten) if (!aInfo.gevonden.apparaten.some((y) => y.id === x.id)) rijen.push(ingesteld(x.naam));
  const nu = uitstelbaar().map((x) => `<div class="regelrij"><div class="l"><b>${esc(x.naam)}</b><span>${esc(x.stand)}</span></div></div>`).join('');
  return `<h2 class="kop-2">Apparaten op zon</h2>
    <p class="klein" style="margin: 0">Een wasmachine, droger of vaatwasser die op afstand kan starten, wacht op zon. Hoe laat hij klaar moet zijn, kies je per keer bij het apparaat.</p>
    <div>${rijen.length ? rijen.join('') : '<p class="klein">Geen apparaten gevonden die op afstand kunnen starten.</p>'}</div>
    ${nu ? `<h3 class="kop-3" style="margin: 6px 0 0">Nu</h3><div>${nu}</div>` : ''}
    <p class="mini" style="margin: 0">Werkt alleen als "op afstand starten" op het apparaat aanstaat. Zolang Smart Climate meekijkt, start er nog niets echt.</p>`;
}

function lichtVorm() {
  return `<h2 class="kop-2">Licht en screens</h2>
    <p class="klein" style="margin: 0">Lampen, scènes en screens bedien je zelf, in het huis: tik op een kamer en dan op de lamp of het screen. Smart Climate regelt ze niet.</p>
    <p class="klein" style="margin: 0">Of je ze in de app kunt bedienen, zet je bij <a href="functies.html#licht" style="color: var(--ijs); font-weight: 700">Functies</a>.</p>`;
}

const NAAST = {
  klimaat: ['Zo werkt het', ['Kijkt mee: het huis zegt wat het zou doen, en jij ziet of dat klopt', 'Regelt: het huis zet je airco’s en de cv zelf', 'Terug naar meekijken kan altijd']],
  opzon: ['Waarvoor dit nodig is', ['De droger draait op je eigen zon in plaats van op stroom van het net', 'Hij is toch klaar op de tijd die jij kiest']],
  licht: ['Zo werkt het', ['Bedienen doe je in het huis, bij de kamer', 'De regeling raakt je lampen en screens niet aan']],
};

function naast(id) {
  const [kopje, lijst] = NAAST[id] ?? NAAST.klimaat;
  const later = aInfo?.volgendeStart && id === 'opzon' ? '<div class="glas"><h3>Wanneer het ingaat</h3><p style="margin: 0">Na de volgende start van Smart Climate.</p></div>' : '';
  return `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>${later}`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { klimaat: klimaatVorm, opzon: opZonVorm, licht: lichtVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(nu)));
}

/* ------------------------------------------------------------ bewaren */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('[data-kies]');
  if (!knop || !aInfo || !knop.dataset.kies.startsWith('opZon:')) return;
  opZon[knop.dataset.kies.slice(6)] = JSON.parse(knop.dataset.waarde);
  teken();
  // De aansluiting bewaart alles samen: de rest zoals het was.
  const x = aInfo.antwoorden ?? {};
  const body = {
    panelen: x.panelen ?? { ligging: null, aantal: null, voorkant: null, achterkant: null },
    zekering: x.zekering ?? null,
    tarief: x.tarief ?? null,
    verwarming: x.verwarming ?? { soort: null, aanvoerC: null },
    opZon: Object.fromEntries(Object.entries(opZon).filter(([, v]) => typeof v === 'boolean')),
  };
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/aansluiting', body);
    if (uit?.ok) {
      aInfo = uit.antwoord;
      teken();
    }
    return uit;
  });
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laadAlles();
