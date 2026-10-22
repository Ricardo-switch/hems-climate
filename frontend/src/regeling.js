/*
 * Regeling (besluit 130): wie wat regelt, en welke apparaten op zon mogen
 * starten. Wat hier stond bij "Wie stuurt" op de oude Instellingen, en de
 * apparaten op zon van Zon en aansluiting.
 *
 * Eerlijk over de stand: klimaat kijkt mee tot het bewijs er is (besluit 64);
 * dan staat er "Kijkt mee", met hoe ver het is. Licht en screens regelt het huis
 * niet: die staan bij Functies (besluit 167).
 */
'use strict';

const { $$, nl, esc, haal } = app;

let site = null;
let terugblik = null;
let huisData = null;
let aInfo = null;
let opZon = {};
/** Apparaten uit de configuratie die de bewoner van zon haalde (besluit 167). */
let opZonUit = [];
let zon = null;

async function laadAlles() {
  const [s, d, h, a, z] = await Promise.allSettled([haal('api/site'), haal('api/divergence'), haal('api/huis'), haal('api/aansluiting'), haal('api/zon')]);
  if (s.status === 'fulfilled') site = s.value;
  if (d.status === 'fulfilled') terugblik = d.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (a.status === 'fulfilled') {
    aInfo = a.value;
    opZon = { ...(aInfo.antwoorden?.opZon ?? {}) };
    opZonUit = [...(aInfo.antwoorden?.opZonUit ?? [])];
  }
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

/* ------------------------------------------------------------ de delen */

const klimaat = () => site?.actuators ?? [];
const uitstelbaar = () => (huisData?.etages ?? []).flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).filter((x) => x.soort === 'apparaat');

function delen() {
  const opZonAan = Object.values(opZon).filter(Boolean).length + (aInfo?.configuratie?.apparaten ?? []).filter((x) => !opZonUit.includes(x.id)).length;
  return [
    { id: 'klimaat', titel: t('regeling.klimaat'), zin: huisData ? t('regeling.kamersMee', { n: kamersMee().length }) : klimaat().length ? t('regeling.apparatenMee', { n: klimaat().length }) : '…', stand: site ? 'goed' : null },
    { id: 'opzon', titel: t('instellingen.opZon'), zin: aInfo ? (opZonAan ? t('regeling.nOpZon', { n: opZonAan }) : t('instellingen.geen')) : '…', stand: aInfo ? 'goed' : null },
  ];
}

const FASEN = ['leren', 'kijken', 'regelen'].map((k) => [k, t(`regeling.fase.${k}`)]);
const fase = (nu) => `<span class="fase" role="img" aria-label="${FASEN.find(([k]) => k === nu)[1]}">${FASEN.map(([k, l]) => `<i class="${k === nu ? k : ''}">${l}</i>`).join('')}</span>`;

/*
 * Per kamer wat er regelt (besluit 138). Vastleggen gebeurt bij de kamer, in
 * Indeling bij Verwarmen en koelen; hier het overzicht, met een tik erheen.
 */
const ROL_ZIN = { houdt: 'regeling.rol.houdt', zon: 'regeling.rol.zon' };
const binnenKamers = () => (huisData?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => e.ruimtes ?? []);
const actiefIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat' && a.klimaat?.rol && a.klimaat.rol !== 'kijken').sort((a, b) => (a.klimaat.rol === b.klimaat.rol ? 0 : a.klimaat.rol === 'houdt' ? -1 : 1));
const kamersMee = () => binnenKamers().filter((r) => actiefIn(r).length);
const naarKamer = (r) => `indeling.html#${encodeURIComponent(r.id)}/warmte`;

function klimaatVorm() {
  const winter = terugblik?.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
  const van = terugblik?.dataset?.vanMs ?? terugblik?.vanMs;
  const sinds = van ? taal.datum(van, { day: 'numeric', month: 'long' }) : null;
  const rijen = huisData
    ? kamersMee().map((r) => {
        // Kamers die meedoen met deze (besluit 142), erbij genoemd.
        const mee = binnenKamers().filter((x) => x.meedoenMet?.kamerId === r.id).map((x) => x.naam);
        const wat = actiefIn(r).map((a) => t(ROL_ZIN[a.klimaat.rol], { naam: a.naam })).join(', ');
        return `<a class="regelrij kamerrij" href="${naarKamer(r)}"><div class="l"><b>${esc([r.naam, ...mee].join(` ${t('algemeen.en')} `))}</b><span>${esc(wat)}</span></div><span class="pijl" aria-hidden="true">›</span></a>`;
      }).join('')
    : '';
  const nietMee = binnenKamers().filter((r) => !actiefIn(r).length && !r.meedoenMet);
  const rest = nietMee.length
    ? `<p class="klein" style="margin: 0">${esc(t('regeling.nietMee'))} ${nietMee.map((r) => `<a href="${naarKamer(r)}">${esc(r.naam)}</a>`).join(', ')}. ${esc(t('regeling.kiesBijKamer'))}</p>`
    : '';
  const stand = `<div class="regelrij"><div class="l"><b>${esc(sinds ? t('regeling.kijktSinds', { datum: sinds }) : t('regeling.fase.kijken'))}</b><span>${esc(t('regeling.zegtWat'))}</span></div>${fase('kijken')}</div>`;
  const bewijs = winter
    ? `<div class="bewijs"><span class="mini">${esc(t('regeling.winterdagen', { n: nl(winter.dagen, 0), doel: winter.doel }))}</span><span class="balkje"><i style="width: ${Math.min(100, (winter.dagen / winter.doel) * 100).toFixed(0)}%"></i></span></div>
       <p class="mini" style="margin: 0">${esc(t('regeling.pasZelf', { doel: winter.doel }))}</p>`
    : '';
  return `<h2 class="kop-2">${esc(t('regeling.klimaat'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('regeling.perKamer'))}</p>
    ${stand}
    <div>${rijen || `<p class="klein">${esc(t('regeling.geenKamer'))}</p>`}</div>
    ${rest}
    ${bewijs}`;
}


/** Een schakelaar per apparaat (besluit 167): aan start hij op zon, uit niet. Ook voor wat de configuratie noemt. */
function opZonRij(naam, aan, data) {
  return `<div class="regelrij"><div class="l"><b>${esc(naam)}</b><span>${esc(t(aan ? 'regeling.startZon' : 'regeling.startNiet'))}</span></div><button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="${esc(t('regeling.naamOpZon', { naam }))}" ${data}></button></div>`;
}

function opZonVorm() {
  if (!aInfo) return `<p class="klein">${esc(t('algemeen.laden'))}…</p>`;
  const vast = new Set(aInfo.configuratie.apparaten.map((x) => x.id));
  const rijen = [];
  for (const x of aInfo.configuratie.apparaten) rijen.push(opZonRij(x.naam, !opZonUit.includes(x.id), `data-opzon-vast="${esc(x.id)}"`));
  for (const x of aInfo.gevonden.apparaten) if (!vast.has(x.id)) rijen.push(opZonRij(x.naam, opZon[x.id] === true, `data-opzon="${esc(x.id)}"`));
  const nu = uitstelbaar().map((x) => `<div class="regelrij"><div class="l"><b>${esc(x.naam)}</b><span>${esc(x.stand)}</span></div></div>`).join('');
  return `<h2 class="kop-2">${esc(t('instellingen.opZon'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('regeling.opZonUitleg'))}</p>
    <div>${rijen.length ? rijen.join('') : `<p class="klein">${esc(t('regeling.geenApparaten'))}</p>`}</div>
    ${nu ? `<h3 class="kop-3" style="margin: 6px 0 0">${esc(t('regeling.nu'))}</h3><div>${nu}</div>` : ''}
    <p class="mini" style="margin: 0">${esc(t('regeling.opAfstand'))}</p>`;
}

/** Per deel een kopje en drie of twee punten (regeling.naast.*). */
const NAAST = { klimaat: 3, opzon: 2 };

function naast(id) {
  const deel = NAAST[id] ? id : 'klimaat';
  const lijst = Array.from({ length: NAAST[deel] }, (_, i) => t(`regeling.naast.${deel}.${i + 1}`));
  const later = aInfo?.volgendeStart && id === 'opzon' ? `<div class="glas"><h3>${esc(t('regeling.ingaat'))}</h3><p style="margin: 0">${esc(t('regeling.ingaatZin'))}</p></div>` : '';
  return `<div class="glas"><h3>${esc(t(`regeling.naast.${deel}`))}</h3><ul>${lijst.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>${later}`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { klimaat: klimaatVorm, opzon: opZonVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(nu)));
}

/* ------------------------------------------------------------ bewaren */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('[data-opzon], [data-opzon-vast]');
  if (!knop || !aInfo) return;
  const aan = knop.getAttribute('aria-checked') !== 'true';
  if (knop.dataset.opzon) opZon[knop.dataset.opzon] = aan;
  else {
    const id = knop.dataset.opzonVast;
    opZonUit = aan ? opZonUit.filter((x) => x !== id) : [...new Set([...opZonUit, id])];
  }
  teken();
  // De aansluiting bewaart alles samen: de rest zoals het was, ook hoe de panelen liggen.
  const x = aInfo.antwoorden ?? {};
  const body = {
    panelen: x.panelen ?? { ligging: null, aantal: null, voorkant: null, achterkant: null },
    zekering: x.zekering ?? null,
    tarief: x.tarief ?? null,
    verwarming: x.verwarming ?? { soort: null, aanvoerC: null },
    voorkantZon: x.voorkantZon ?? null,
    dak: x.dak ?? null,
    opZon: Object.fromEntries(Object.entries(opZon).filter(([, v]) => typeof v === 'boolean')),
    opZonUit,
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
