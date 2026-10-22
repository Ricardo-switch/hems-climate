/*
 * Welkom in een leeg huis (besluit 154, schets Wand-Welkom en Welkom-Tel).
 *
 * De add-on opent hier zolang er geen configuratie is. Terwijl je leest, groeit
 * het huis uit wat Home Assistant kent (`api/onboarding`, met het huis erbij).
 * Daarna:
 *
 * - "Richt je huis in": twijfelt de ontdekking ergens over, dan één vraag
 *   tegelijk; dan bewaart de dienst de configuratie en start opnieuw, en gaat
 *   het verder in Inrichten.
 * - "Ik heb een back-up": een back-up terugzetten (besluit 151), bijvoorbeeld
 *   die van de NAS; daarna opent Thuis.
 */
'use strict';

const { esc, haal } = app;

let voorstel = null;
/** 'welkom', een vraag (getal), of 'bezig'. */
let stap = 'welkom';
const antwoorden = {};
let fout = '';
let bezigTekst = '';

const ICOON = {
  comfort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>',
  zon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  licht: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
};

/**
 * Alleen vragen wat nodig is (besluit 154): waar de ontdekking zelf iets koos,
 * of het antwoord leeg mag blijven, neemt het welkom dat over. Inrichten laat
 * het later veranderen (Meten met, Zon en aansluiting).
 */
const vragen = () => (voorstel?.keuzes ?? []).filter((k) => k.huidig == null && !k.magLeeg);

/** De naam uit Home Assistant, nooit een entity-ID (besluit 45). */
function naamVan(id) {
  const naam = voorstel?.namen?.[id];
  if (naam) return naam;
  const kaal = String(id).replace(/^[a-z_]+\./, '').replace(/_/g, ' ');
  return kaal.charAt(0).toUpperCase() + kaal.slice(1);
}

function welkom() {
  return `<h1 class="groot">${esc(t('begin.welkom'))} <em>${esc(t('begin.thuis'))}</em></h1>
    <p class="lead">${esc(t('begin.lead'))}</p>
    <ul class="kan">
      <li><span class="ik" style="color: var(--gloed-t)">${ICOON.comfort}</span><div><b>${esc(t('begin.comfort'))}</b><span>${esc(t('begin.comfortZin'))}</span></div></li>
      <li><span class="ik" style="color: var(--zon-t)">${ICOON.zon}</span><div><b>${esc(t('begin.zon'))}</b><span>${esc(t('begin.zonZin'))}</span></div></li>
      <li><span class="ik" style="color: var(--ijs-t)">${ICOON.licht}</span><div><b>${esc(t('begin.bedienen'))}</b><span>${esc(t('begin.bedienenZin'))}</span></div></li>
    </ul>
    <span class="fout" role="alert">${esc(fout)}</span>
    <div class="doen">
      <button type="button" class="knop knop-licht" data-inrichten${voorstel ? '' : ' disabled'}>${esc(t('begin.inrichten'))}</button>
      <button type="button" class="zacht onderlijn" data-backup>${esc(t('begin.backup'))}</button>
    </div>`;
}

function vraag(i) {
  const v = vragen()[i];
  const gekozen = antwoorden[v.id];
  const opties = [...v.opties.map((o) => [o, naamVan(o)]), ...(v.magLeeg ? [[null, t('begin.geenVanDeze')]] : [])];
  return `<span class="stapje">${esc(t('begin.nogVragen', { n: vragen().length - i }))}</span>
    <h1 class="vraagkop">${esc(v.vraag)}</h1>
    ${v.toelichting ? `<p class="lead">${esc(v.toelichting)}</p>` : ''}
    <div class="opties" role="group" aria-label="${esc(v.vraag)}">
      ${opties.map(([waarde, label]) => `<button type="button" class="optie" data-optie="${esc(waarde ?? '')}" aria-pressed="${String(gekozen === waarde)}"><i aria-hidden="true"></i>${esc(label)}</button>`).join('')}
    </div>
    <span class="fout" role="alert">${esc(fout)}</span>
    <div class="doen">
      <button type="button" class="knop knop-licht" data-verder>${esc(t(i === vragen().length - 1 ? 'algemeen.klaar' : 'begin.verder'))}</button>
      <button type="button" class="zacht" data-terug>${esc(t('panelen.terug'))}</button>
    </div>`;
}

function bezig() {
  return `<div class="draait" aria-hidden="true"></div>
    <h1 class="vraagkop">${esc(bezigTekst)}</h1>
    <p class="lead">${esc(t('begin.tellen'))}</p>
    <span class="fout" role="alert">${esc(fout)}</span>`;
}

function tekenLinks() {
  const html = stap === 'welkom' ? welkom() : stap === 'bezig' ? bezig() : vraag(stap);
  document.querySelectorAll('[data-links]').forEach((el) => (el.innerHTML = html));
  const voet = stap === 'welkom' ? t('begin.voet') : '';
  document.querySelectorAll('[data-voet]').forEach((el) => (el.textContent = voet));
}

/* ------------------------------------------------------------- het huis */

/** De tijd van de dag uit de klok: er is nog geen zon van de dienst. */
function tijdNu() {
  const u = new Date().getHours() + new Date().getMinutes() / 60;
  const tijd = u < 6 || u >= 21.5 ? 'nacht' : u < 9.5 ? 'ochtend' : u < 18 ? 'dag' : 'avond';
  const stand = Math.min(1, Math.max(0, (u - 6) / 15.5));
  return { tijd, stand };
}

/** Hoe ver het huis gegroeid is: 0 tot het aantal etages. */
let gegroeid = 0;
let tekening = null;

/** Geteld zoals Inrichten het telt, zodat het volgende scherm hetzelfde zegt (besluit 154). */
function tellers(deel) {
  const huisNu = voorstel.huis;
  const etages = (huisNu.etages ?? []).filter((e) => e.ruimtes?.length).length;
  const ruimtes = (huisNu.etages ?? []).reduce((n, e) => n + (e.ruimtes?.length ?? 0), 0);
  const apparaten = (huisNu.etages ?? []).flatMap((e) => e.ruimtes ?? []).reduce((n, r) => n + (r.apparaten?.length ?? 0), 0) + (huisNu.zonderRuimte?.length ?? 0);
  const tel = (n) => Math.round(n * deel);
  return `<span class="bezig"><i aria-hidden="true"></i><span>${esc(t('begin.gevonden'))}</span></span>
    <span class="tellers"><span><b>${tel(etages)}</b>${esc(t('inr.tel.etages', { n: etages }))}</span><span><b>${tel(ruimtes)}</b>${esc(t('begin.ruimtes', { n: ruimtes }))}</span><span><b>${tel(apparaten)}</b>${esc(t('inr.tel.apparaten', { n: apparaten }))}</span></span>`;
}

function tekenHuis() {
  const podium = document.querySelector(app.telStand() ? '#tel [data-podium]' : '#wand [data-podium]');
  const { tijd, stand } = tijdNu();
  const maand = new Date().getMonth() + 1;
  app.lucht(tijd, maand >= 11 || maand <= 2 ? 'winter' : 'zomer', 0.2);
  if (!voorstel?.huis || !tekening) {
    document.querySelectorAll('[data-gevonden]').forEach((el) => (el.innerHTML = `<span class="bezig"><i aria-hidden="true"></i><span>${esc(t('begin.zoekt'))}</span></span>`));
    return;
  }
  const alle = tekening.etages;
  const n = Math.min(gegroeid, alle.length);
  const etages = alle.slice(0, n).map((e, i) => ({ ...e, dak: i === alle.length - 1 ? e.dak : false }));
  const zon = tijd === 'nacht' ? { aandeel: 0, panelen: tekening.panelen } : { stand, hoogte: Math.sin(Math.PI * stand) * 0.9, aandeel: 0.3, panelen: tekening.panelen };
  const tel = app.telStand();
  huis.teken(podium, { tijd, zon, etages, voordeur: tekening.voordeur, buitenunit: n === alle.length ? tekening.buitenunit : null, net: true }, {
    breedte: podium.clientWidth || (tel ? 390 : 660),
    hoogte: tel ? 300 : podium.clientHeight || 640,
    marge: tel ? 0.04 : 0.06,
  });
  const klaar = n >= alle.length;
  document.querySelectorAll('[data-gevonden]').forEach((el) => {
    el.classList.toggle('zoekt', !klaar);
    el.innerHTML = tellers(alle.length ? n / alle.length : 1);
  });
}

/** Het huis bouwt etage voor etage op, zoals tijdens het zoeken (besluit 154). */
function groei() {
  const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const totaal = tekening?.etages.length ?? 0;
  if (stil || totaal === 0) {
    gegroeid = totaal;
    tekenHuis();
    return;
  }
  gegroeid = 0;
  const klok = setInterval(() => {
    gegroeid += 1;
    tekenHuis();
    if (gegroeid >= totaal) clearInterval(klok);
  }, 900);
}

/* ------------------------------------------------------------- de dienst */

async function laad(poging = 0) {
  try {
    voorstel = await haal('api/onboarding');
  } catch {
    voorstel = null;
  }
  // Er staat al een configuratie: de dienst start daar zo mee, dan door.
  if (voorstel?.bestaande?.length) {
    bezigTekst = t('begin.klaarzetten');
    stap = 'bezig';
    tekenLinks();
    void wachtOpHerstart('inrichten.html');
    return;
  }
  // Net gestart: Home Assistant is er nog niet, of het huis nog niet gelezen.
  if (!voorstel?.huis && poging < 40) {
    tekenLinks();
    tekenHuis();
    setTimeout(() => void laad(poging + 1), 3000);
    return;
  }
  // Wat de ontdekking koos, ook bij de vragen die niet gesteld worden.
  for (const v of voorstel?.keuzes ?? []) if (!(v.id in antwoorden)) antwoorden[v.id] = v.huidig;
  tekening = voorstel?.huis ? huismodel.tekening(voorstel.huis, { kamer: (r) => ({ ...huismodel.kamerModel(r, null), temp: null, zin: null, stand: null }) }) : null;
  tekenLinks();
  groei();
}

/** Wacht tot Smart Climate weer antwoordt na opnieuw starten, en gaat dan verder. */
async function wachtOpHerstart(naar) {
  const begin = Date.now();
  await new Promise((ok) => setTimeout(ok, 5000));
  while (Date.now() - begin < 180_000) {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      if (r.ok) {
        location.href = naar;
        return;
      }
    } catch {
      // Nog niet terug.
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  fout = t('toegang.nogNiet');
  tekenLinks();
}

async function stuur(pad, body) {
  const r = await fetch(pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const uit = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(uit.reden || uit.fout || t('toegang.lukteNiet'));
  return uit;
}

async function bewaar() {
  bezigTekst = t('begin.klaarzetten');
  stap = 'bezig';
  fout = '';
  tekenLinks();
  try {
    await stuur('api/onboarding', { antwoorden });
    void wachtOpHerstart('inrichten.html');
  } catch (err) {
    fout = err.message;
    stap = vragen().length ? vragen().length - 1 : 'welkom';
    tekenLinks();
  }
}

/* ------------------------------------------------------------- bediening */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled) return;
  fout = '';
  if (knop.hasAttribute('data-inrichten')) {
    if (vragen().length) {
      stap = 0;
      tekenLinks();
    } else void bewaar();
  } else if (knop.hasAttribute('data-backup')) {
    document.querySelector('[data-backup-bestand]').click();
  } else if (knop.hasAttribute('data-optie')) {
    const v = vragen()[stap];
    antwoorden[v.id] = knop.dataset.optie === '' ? null : knop.dataset.optie;
    tekenLinks();
  } else if (knop.hasAttribute('data-verder')) {
    if (stap < vragen().length - 1) {
      stap += 1;
      tekenLinks();
    } else void bewaar();
  } else if (knop.hasAttribute('data-terug')) {
    stap = stap === 0 ? 'welkom' : stap - 1;
    tekenLinks();
  }
});

document.addEventListener('change', async (e) => {
  const veld = e.target.closest('[data-backup-bestand]');
  const bestand = veld?.files?.[0];
  if (!bestand) return;
  veld.value = '';
  try {
    const backup = JSON.parse(await bestand.text());
    if (backup?.soort !== 'smart-climate-back-up') throw new Error(t('toegang.geenBackup'));
    bezigTekst = t('begin.terugzetten');
    stap = 'bezig';
    tekenLinks();
    await stuur('api/back-up', backup);
    void wachtOpHerstart('thuis.html');
  } catch (err) {
    stap = 'welkom';
    fout = err instanceof SyntaxError ? t('toegang.nietTeLezen') : err.message;
    tekenLinks();
  }
});

let stand = app.telStand();
addEventListener('resize', () => {
  app.schaal();
  if (app.telStand() !== stand) {
    stand = app.telStand();
    tekenHuis();
  }
});

app.schaal();
tekenLinks();
tekenHuis();
void laad();
