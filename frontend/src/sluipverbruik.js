/*
 * Sluipverbruik (besluit 192, schets Wand-Sluipverbruik en Tel-Sluipverbruik).
 * Wat het huis 's nachts gebruikt als er niets draait, uit de nachten van de
 * slimme meter. Alles komt kant-en-klaar uit de dienst (`api/sluipverbruik`);
 * de pagina kiest alleen welke nachten in beeld staan en tekent ze.
 *
 * Zonder eigen meter per apparaat noemt de app geen oorzaak (besluit 88): de
 * bewoner kan zelf zeggen wat het is, of dat hij het niet weet.
 */
'use strict';

const { $$, nl, esc, haal, deur } = app;
const { t } = taal;

let r = null;
let fout = null;
let zon = null;
let voork = null;
/** Nachten of maanden, en hoeveel vensters van 30 nachten terug. */
const keuze = { blik: 'nachten', terug: 0 };
/** De bewoner typt wat het is (besluit 88). */
let zeggen = false;

const VENSTER = 30;
const GRENS = 50;
const W = (w) => `${Math.round(w)}`;
const euro = (n) => `€ ${nl(n, 0)}`;
const kwh = (n) => nl(n, 0);
const datum = (dag, jaar = false) => new Date(`${dag}T12:00:00Z`).toLocaleDateString(taal.locale, { day: 'numeric', month: 'long', ...(jaar ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const maandNaam = (m, jaar = true) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(taal.locale, { month: 'long', ...(jaar ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const maandKort = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(taal.locale, { month: 'short', timeZone: 'UTC' }).replace('.', '');

async function laad() {
  try {
    const res = await fetch('api/sluipverbruik', { cache: 'no-store', headers: { 'x-taal': taal.code } });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      r = body;
      fout = null;
    } else fout = body.wachten ?? body.fout ?? t('sluip.nogNiet');
  } catch {
    fout = t('groep.geenVerbinding');
  }
  teken();
}

/** De nachten in beeld: 30, het laatste venster eerst. */
function venster() {
  const alle = r.nachten;
  const eind = Math.max(VENSTER, alle.length - keuze.terug * VENSTER);
  return alle.slice(Math.max(0, eind - VENSTER), eind);
}

/** Staafjes met de lijn van je gewone nacht en de grens van de melding. */
function staven(rijen, { breedte, hoogte, label, lijnen = true, klein = false }) {
  const rand = 6;
  const b = 24;
  const top = 10;
  const hoogste = Math.max(...rijen.map((x) => x.w), r.gewoonW + GRENS);
  const max = Math.max(100, Math.ceil((hoogste + 10) / 100) * 100);
  // De as zo breed als zijn langste getal (28 oktober 2026): bij 1.200 viel de 1 op de telefoon weg.
  const l = Math.max(klein ? 30 : 38, nl(max, 0).length * 6.6 + 12);
  const w = (breedte - l - rand) / rijen.length;
  const y = (v) => top + (1 - v / max) * (hoogte - top - b);
  let s = '';
  const stap = max > 400 ? 200 : 100;
  for (let v = 0; v <= max; v += stap) s += `<line x1="${l}" x2="${breedte - rand}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,0.07)"/><text x="${l - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#8291a6">${nl(v, 0)}</text>`;
  rijen.forEach((x, i) => {
    const xs = l + i * w + w * 0.16;
    s += `<rect x="${xs.toFixed(1)}" y="${y(x.w).toFixed(1)}" width="${(w * 0.68).toFixed(1)}" height="${Math.max(0, y(0) - y(x.w)).toFixed(1)}" rx="3" fill="${x.hoog ? '#ff7a4d' : 'rgba(111,211,255,0.55)'}"><title>${esc(x.titel)}</title></rect>`;
    const tekst = label(x, i);
    if (tekst) {
      const anker = i === 0 ? 'start' : i === rijen.length - 1 ? 'end' : 'middle';
      const xt = anker === 'start' ? l + i * w : anker === 'end' ? l + (i + 1) * w : xs + w * 0.34;
      s += `<text x="${xt.toFixed(1)}" y="${hoogte - 7}" text-anchor="${anker}" font-size="11" fill="#8291a6">${esc(tekst)}</text>`;
    }
  });
  if (lijnen) {
    s += `<line x1="${l}" x2="${breedte - rand}" y1="${y(r.gewoonW).toFixed(1)}" y2="${y(r.gewoonW).toFixed(1)}" stroke="#6ee7b7" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    s += `<line x1="${l}" x2="${breedte - rand}" y1="${y(r.gewoonW + GRENS).toFixed(1)}" y2="${y(r.gewoonW + GRENS).toFixed(1)}" stroke="#ff7a4d" stroke-width="1.2" stroke-dasharray="2 4" opacity="0.8"/>`;
  }
  return `<svg viewBox="0 0 ${breedte} ${hoogte}" role="img" aria-label="${esc(t(keuze.blik === 'nachten' ? 'sluip.perNacht' : 'sluip.perMaand'))}">${s}</svg>`;
}

/** De nachten of de maanden als staafjes, met de titel van elk staafje. */
function grafiek(breedte, hoogte, klein = false) {
  if (keuze.blik === 'maanden') {
    const rijen = r.maanden.map((m) => ({ ...m, titel: `${maandNaam(m.maand)}: ${W(m.w)} W` }));
    const elke = Math.max(1, Math.ceil(rijen.length / (klein ? 4 : 7)));
    return staven(rijen, { breedte, hoogte, klein, label: (m, i) => (i % elke === 0 || i === rijen.length - 1 ? `${maandKort(m.maand)}${m.maand.endsWith('-01') || i === 0 ? ` ’${m.maand.slice(2, 4)}` : ''}` : '') });
  }
  const rijen = venster().map((n) => ({ ...n, titel: `${datum(n.dag)}: ${W(n.w)} W` }));
  const elke = klein ? 10 : 5;
  return staven(rijen, { breedte, hoogte, klein, label: (n, i) => (i % elke === 0 || i === rijen.length - 1 ? new Date(`${n.dag}T12:00:00Z`).toLocaleDateString(taal.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '') : '') });
}

/** Sinds welke maand het steeds hoger lag dan een jaar eerder, en hoeveel; null als dat niet zo is. */
function hogerDanVorigJaar() {
  const m = r.maanden;
  const vorig = (x) => m.find((y) => y.maand === `${Number(x.maand.slice(0, 4)) - 1}${x.maand.slice(4)}`);
  const verschillen = [];
  for (let i = m.length - 1; i >= 0; i--) {
    const v = vorig(m[i]);
    if (!v || m[i].w - v.w < GRENS) break;
    verschillen.unshift({ maand: m[i].maand, meer: m[i].w - v.w });
  }
  return verschillen.length >= 2 ? { sinds: verschillen[0].maand, min: Math.min(...verschillen.map((x) => x.meer)), max: Math.max(...verschillen.map((x) => x.meer)) } : null;
}

function titel() {
  if (fout || !r) return t('sluip.titel');
  if (keuze.blik === 'maanden') {
    const h = hogerDanVorigJaar();
    return h ? t('sluip.hogerSinds', { maand: maandNaam(h.sinds, false) }) : t('sluip.perMaandSinds', { maand: maandNaam(r.maanden[0].maand) });
  }
  return t('sluip.vannachtTitel', { w: W(r.vannacht.w) });
}

function links() {
  const boven = r.bovenW;
  const onder = r.hoog ? t('sluip.boven', { boven: `<b>${W(boven)} W</b>`, gewoon: W(r.gewoonW) }) : t('sluip.rond', { gewoon: W(r.gewoonW) });
  const vorig = r.vorigJaar ? t('sluip.vorigJaar', { maand: maandNaam(r.vorigJaar.maand, false), w: W(r.vorigJaar.w) }) : '';
  const jaar = r.perJaarEuro != null ? t('sluip.perJaarEuro', { euro: euro(r.perJaarEuro) }) : t('sluip.zonderPrijs');
  const scheelt = r.scheelt
    ? `<section class="glas kaart"><h2 class="kop-3">${esc(t('sluip.weerNaar', { w: W(r.gewoonW) }))}</h2><p class="klein" style="margin: 6px 0 0">${r.scheelt.euro != null ? t('sluip.scheeltEuro', { kwh: `<b class="getal" style="font-size: 18px">${kwh(r.scheelt.kwh)} kWh</b>`, euro: `<b class="getal" style="font-size: 18px">${euro(r.scheelt.euro)}</b>` }) : t('sluip.scheeltKwh', { kwh: `<b class="getal" style="font-size: 18px">${kwh(r.scheelt.kwh)} kWh</b>` })}</p></section>`
    : '';
  return `<div class="cijfer"><div class="mini">${esc(t('sluip.vannacht'))}</div><div class="getal">${W(r.vannacht.w)}<small>W</small></div><div class="klein">${onder}</div></div>
    <div class="cijfer"><div class="mini">${esc(t('sluip.gemiddeld30'))}</div><div class="getal">${W(r.gemiddeldW)}<small>W</small></div><div class="klein">${esc(vorig)}</div></div>
    <div class="cijfer"><div class="mini">${esc(t('sluip.zoEenJaar'))}</div><div class="getal">${kwh(r.perJaarKwh)}<small>kWh</small></div><div class="klein">${esc(jaar)}</div></div>
    ${scheelt}`;
}

function legenda() {
  return `<div class="legenda">
    <span><i class="blok" style="background: rgba(111,211,255,0.55)"></i>${esc(t('sluip.leg.gewoon'))}</span>
    <span><i class="blok" style="background: #ff7a4d"></i>${esc(t('sluip.leg.hoog', { grens: GRENS }))}</span>
    <span><i style="color: #6ee7b7"></i>${esc(t('sluip.leg.lijn', { w: W(r.gewoonW) }))}</span>
    <span><i style="color: #ff7a4d"></i>${esc(t('sluip.leg.melding'))}</span>
  </div>`;
}

function midden() {
  const nachten = keuze.blik === 'nachten';
  const v = nachten ? venster() : null;
  const kanTerug = nachten && r.nachten.length > (keuze.terug + 1) * VENSTER;
  const kop = nachten
    ? `<span class="blader"><button type="button" data-terug-venster ${kanTerug ? '' : 'disabled'} aria-label="${esc(t('sluip.eerder'))}">‹</button><span class="mini">${esc(`${datum(v[0].dag)} – ${datum(v[v.length - 1].dag)}`)}</span><button type="button" data-vooruit-venster ${keuze.terug > 0 ? '' : 'disabled'} aria-label="${esc(t('sluip.later'))}">›</button></span>`
    : `<span class="mini">${esc(t('sluip.gemiddeldPerNacht'))}</span>`;
  const h = nachten ? null : hogerDanVorigJaar();
  const onder = nachten
    ? `<span class="klein">${t('sluip.laagsteOoit', { w: `<b>${W(r.laagste.w)} W</b>`, maand: esc(maandNaam(r.laagste.dag.slice(0, 7))) })}</span><span class="klein">${esc(t('sluip.opvallendIn30', { n: r.hoogIn30 }))}</span>`
    : `<span class="klein">${esc(h ? t('sluip.meerDanVorigJaar', { maand: maandNaam(h.sinds, false), min: h.min, max: h.max }) : t('sluip.laagsteMaand', { maand: maandNaam(laagsteMaand().maand), w: W(laagsteMaand().w) }))}${h ? ` ${esc(t('sluip.laagsteMaandKort', { maand: maandNaam(laagsteMaand().maand), w: W(laagsteMaand().w) }))}` : ''}</span>`;
  return `<section class="glas kaart grafiekkaart">
      <div class="grafiekkop"><h2 class="kop-2">${esc(t(nachten ? 'sluip.elkeNacht' : 'sluip.perMaandKop', { maand: maandNaam(r.maanden[0].maand) }))}</h2>${kop}</div>
      <div class="grafiek">${grafiek(560, 500)}</div>
      ${legenda()}
    </section>
    <section class="glas kaart onderregel">${onder}</section>`;
}
const laagsteMaand = () => r.maanden.reduce((a, b) => (b.w < a.w ? b : a));

/** Wat opviel (besluit 88): het wat en het hoeveel, en wat de bewoner zelf zegt. */
function opvallend() {
  if (!r.reeks) {
    return `<section class="glas kaart opvallend gewoon"><div class="mini">${esc(t('sluip.gewoonKop'))}</div><h3>${esc(t('sluip.gewoonTitel'))}</h3><p class="klein" style="margin: 0">${esc(t(r.hoogIn30 ? 'sluip.gewoonZin' : 'sluip.gewoonRustig', { n: r.hoogIn30 }))}</p></section>`;
  }
  const sinds = r.reeks.nachten > 1 ? t('sluip.sindsTitel', { datum: datum(r.reeks.sinds), boven: Math.round(r.bovenW / 10) * 10 }) : t('sluip.vannachtMeer', { boven: W(r.bovenW) });
  const zin = r.reeks.nachten > 1 ? t('sluip.opRij', { n: r.reeks.nachten }) : t('sluip.staatIetsAan');
  const tl = r.toelichting;
  let onder;
  if (zeggen) {
    onder = `<div class="zeg"><input data-zeg-tekst maxlength="80" placeholder="${esc(t('sluip.zegVoorbeeld'))}" aria-label="${esc(t('sluip.watIsHet'))}" value="${esc(tl?.tekst ?? '')}"><button type="button" class="knop knop-licht" data-zeg-bewaar>${esc(t('sluip.bewaar'))}</button></div>`;
  } else if (tl?.tekst) {
    onder = `<p class="klein" style="margin: 10px 0 0">${esc(t('sluip.jijZei', { tekst: tl.tekst }))}</p><div class="knoppen"><button type="button" class="knop" data-zeg>${esc(t('sluip.anders'))}</button></div>`;
  } else if (tl?.weetNiet) {
    onder = `<p class="klein" style="margin: 10px 0 0">${esc(t('sluip.inDeGaten'))}</p><div class="knoppen"><button type="button" class="knop" data-zeg>${esc(t('sluip.ikWeetHet'))}</button></div>`;
  } else {
    onder = `<div class="knoppen"><button type="button" class="knop knop-licht" data-zeg>${esc(t('sluip.ikWeetHet'))}</button><button type="button" class="knop" data-weet-niet>${esc(t('sluip.weetNiet'))}</button></div>`;
  }
  return `<section class="glas kaart opvallend opgevallen"><div class="mini">${esc(t('sluip.opgevallen'))}</div><h3>${esc(sinds)}</h3><p class="klein" style="margin: 0">${esc(zin)}</p>${onder}</section>`;
}

/** De melding op je telefoon (besluit 79): per account, zoals bij Jij. */
function melding() {
  const m = voork?.tel?.meldingen;
  if (!m) return '';
  const aan = m.sluip !== false;
  return `<section class="glas kaart"><div class="regelrij"><div><b>${esc(t('sluip.meldingKop'))}</b><span>${esc(t('sluip.meldingZin', { grens: GRENS }))}</span></div><button type="button" class="schakel" role="switch" aria-checked="${aan}" aria-label="${esc(t('sluip.meldingKop'))}" data-sluip-melding></button></div></section>`;
}

function rechts() {
  return `${opvallend()}${melding()}
    <section class="glas kaart"><h2 class="kop-3">${esc(t('sluip.zoMeet'))}</h2><p class="uitleg">${esc(t('sluip.zoMeetZin'))}</p></section>`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  $$('[data-wissel]').forEach((el) => (el.innerHTML = ['nachten', 'maanden'].map((k) => `<button type="button" data-blik="${k}" aria-pressed="${k === keuze.blik}">${esc(t(`sluip.blik.${k}`))}</button>`).join('')));
  $$('[data-titel]').forEach((el) => (el.textContent = titel()));
  const wand = document.querySelector('#wand');
  const tel = document.querySelector('[data-telinhoud]');
  if (fout || !r) {
    const leeg = `<section class="glas kaart"><h2 class="kop-3">${esc(t('sluip.nogNietKop'))}</h2><p class="klein" style="margin: 8px 0 0">${esc(fout ?? t('algemeen.laden'))}</p></section>`;
    wand.querySelector('[data-links]').innerHTML = leeg;
    wand.querySelector('[data-midden]').innerHTML = '';
    wand.querySelector('[data-rechts]').innerHTML = '';
    tel.innerHTML = leeg;
    return;
  }
  // Niet onder de vinger opnieuw opbouwen terwijl iemand typt.
  if (document.activeElement?.matches?.('[data-zeg-tekst]')) return;
  wand.querySelector('[data-links]').innerHTML = links();
  wand.querySelector('[data-midden]').innerHTML = midden();
  wand.querySelector('[data-rechts]').innerHTML = rechts();
  const vier = `<div class="vier">
      <div><b>${W(r.gemiddeldW)}<small>W</small></b><span>${esc(t('sluip.gemiddeld30Kort'))}</span></div>
      <div><b>${kwh(r.perJaarKwh)}<small>kWh</small></b><span>${esc(r.perJaarEuro != null ? t('sluip.zoEenJaarEuro', { euro: euro(r.perJaarEuro) }) : t('sluip.zoEenJaar'))}</span></div>
      ${r.scheelt?.euro != null ? `<div><b>${euro(r.scheelt.euro)}</b><span>${esc(t('sluip.minderBij', { w: W(r.gewoonW) }))}</span></div>` : r.vorigJaar ? `<div><b>${W(r.vorigJaar.w)}<small>W</small></b><span>${esc(t('sluip.vorigJaarKort', { maand: maandNaam(r.vorigJaar.maand) }))}</span></div>` : ''}
      <div><b>${W(r.laagste.w)}<small>W</small></b><span>${esc(t('sluip.laagsteKort', { maand: maandNaam(r.laagste.dag.slice(0, 7)) }))}</span></div>
    </div>`;
  tel.innerHTML = `<p class="zin">${r.hoog ? t('sluip.boven', { boven: `<b>${W(r.bovenW)} W</b>`, gewoon: W(r.gewoonW) }) : esc(t('sluip.rond', { gewoon: W(r.gewoonW) }))}</p>
    ${opvallend()}
    <section class="glas kaart"><div class="wissel" role="group" aria-label="${esc(t('sluip.weergave'))}">${['nachten', 'maanden'].map((k) => `<button type="button" data-blik="${k}" aria-pressed="${k === keuze.blik}">${esc(t(`sluip.blik.${k}`))}</button>`).join('')}</div><div class="grafiek">${grafiek(330, 200, true)}</div></section>
    ${vier}
    ${melding()}
    <p class="mini" style="margin: 4px 2px 0">${esc(t('sluip.zoMeetKort'))}</p>`;
}

const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

async function zeg(body) {
  const res = await deur('api/sluipverbruik', { sinds: r.reeks.sinds, ...body }).catch(() => null);
  if (res?.ok) r = await res.json();
  zeggen = false;
  teken();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  if (el.dataset.blik) {
    keuze.blik = el.dataset.blik;
    teken();
  } else if (el.hasAttribute('data-terug-venster')) {
    keuze.terug++;
    teken();
  } else if (el.hasAttribute('data-vooruit-venster')) {
    keuze.terug = Math.max(0, keuze.terug - 1);
    teken();
  } else if (el.hasAttribute('data-zeg')) {
    zeggen = true;
    teken();
    setTimeout(() => document.querySelector(`${app.zicht()} [data-zeg-tekst]`)?.focus(), 30);
  } else if (el.hasAttribute('data-zeg-bewaar')) {
    const tekst = document.querySelector(`${app.zicht()} [data-zeg-tekst]`)?.value.trim();
    if (tekst) await zeg({ tekst });
    else {
      zeggen = false;
      teken();
    }
  } else if (el.hasAttribute('data-weet-niet')) {
    await zeg({ weetNiet: true });
  } else if (el.hasAttribute('data-sluip-melding')) {
    const aan = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(aan));
    const res = await deur('api/voorkeuren', { plek: 'tel', meldingen: { sluip: aan } }).catch(() => null);
    if (res?.ok) voork = await res.json();
    teken();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-zeg-tekst]')) document.querySelector(`${app.zicht()} [data-zeg-bewaar]`)?.click();
  if (e.key === 'Escape' && zeggen) {
    zeggen = false;
    teken();
  }
});

app.start('opbrengst');
void laad();
haal('api/voorkeuren').then((v) => ((voork = v), teken())).catch(() => {});
haal('api/zon').then((z) => ((zon = z), teken())).catch(() => {});
setInterval(() => void laad(), 30 * 60_000);
