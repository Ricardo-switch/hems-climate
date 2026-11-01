/*
 * Vast en gepland (besluit 234, schetsen Wand-Gepland en Tel-Gepland). Wat het
 * huis vanzelf doet: een keer ("om half acht de screens dicht") of steeds
 * ("elke werkdag tien minuten voor zonsondergang"). Bovenaan de dag als boog,
 * net als het logo: de zon van opkomst tot ondergang, en elke opdracht van
 * vandaag op zijn moment. Eronder de lijst met een schakelaar om te pauzeren.
 * Een tik opent Aanpassen: wanneer (een tijd of de zon met minuten), hoe vaak,
 * en overslaan als niemand thuis is. De dienst rekent het volgende moment uit.
 */
'use strict';

const { esc, haal, deur, telStand } = app;
const { klok } = taal;

let data = null;
let zon = null;
/** De opdracht die open staat, met wat je erin veranderde; null zonder. */
let open = null;
/** Herhalen staat open in Aanpassen. */
let herhaalOpen = false;
let fout = '';

const IK = {
  scherm: '<rect x="4" y="4" width="16" height="4" rx="1"/><path d="M6 8v11h12V8M6 13h12"/>',
  scene: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  licht: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
};
const icoon = (g) => {
  const pad = g.opdracht?.stappen?.[0]?.pad ?? '';
  const d = pad === 'api/scherm' ? IK.scherm : pad === 'api/scene' ? IK.scene : IK.licht;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
};

const dagStart = (ms) => new Date(ms).setHours(0, 0, 0, 0);
const dagenVan = (ms) => Math.round((dagStart(ms) - dagStart(Date.now())) / 86_400_000);
const uurVan = (ms) => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60; };
const herhaalVan = (g) => g.opdracht?.herhaal ?? { soort: 'een' };
const momentVan = (g) => g.opdracht?.moment ?? (g.opdracht?.zon ? { soort: 'zon', zon: g.opdracht.zon, minuten: 0 } : { soort: 'tijd', uur: new Date(g.ms).getHours(), minuut: new Date(g.ms).getMinutes() });
const isVast = (g) => herhaalVan(g).soort !== 'een';
const aan = (g) => g.opdracht?.aan !== false;

/** "vandaag", "morgen", "di". */
function dagWoord(ms) {
  const n = dagenVan(ms);
  if (n === 0) return t('gp.vandaag');
  if (n === 1) return t('gp.morgen');
  return new Intl.DateTimeFormat(taal.code === 'en' ? 'en-GB' : 'nl-NL', { weekday: 'short' }).format(ms).replace('.', '');
}

/** "Elke dag", "Werkdagen", "Ma, wo en vr". */
function herhaalNaam(h) {
  if (h.soort !== 'dagen') return t(`gp.h.${h.soort}`);
  const namen = (h.dagen ?? []).map((d) => t(`gp.d${d}`));
  return namen.length <= 1 ? (namen[0] ?? '') : t('gp.enLijst', { lijst: namen.slice(0, -1).join(', '), laatste: namen.at(-1) });
}

/** "10 min voor zonsondergang", "bij zonsopkomst"; leeg bij een tijd. */
function zonNaam(m) {
  if (m.soort !== 'zon') return '';
  if (m.minuten === 0) return t(`gp.zon.${m.zon}`);
  return t(m.minuten < 0 ? `gp.zon.${m.zon}Voor` : `gp.zon.${m.zon}Na`, { n: Math.abs(m.minuten) });
}

/** De tweede regel: hoe vaak, en bij de zon wanneer, in zonkleur. */
function hoe(g) {
  const h = herhaalVan(g);
  const vaak = h.soort === 'een' ? (g.naam ? t('gp.eenVoor', { naam: g.naam }) : t('gp.h.een')) : herhaalNaam(h);
  const z = zonNaam(momentVan(g));
  return `${esc(vaak)}${z ? `, <em>${esc(z)}</em>` : ''}`;
}

function regel(g, gedaan = false) {
  const klein = gedaan ? t('gp.gedaan') : !aan(g) ? t('gp.gepauzeerd') : dagWoord(g.ms);
  const ms = gedaan ? g.opdracht.laatstMs : g.ms;
  const cls = ['gp-regel', gedaan ? 'gedaan' : '', !aan(g) ? 'uit' : '', open?.id === g.id ? 'gekozen' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" data-gp-open="${esc(g.id)}" role="button" tabindex="0">${icoon(g)}<div class="uur">${esc(klok(ms))}<small>${esc(klein)}</small></div><div><b>${esc(g.tekst)}</b><span class="hoe">${hoe(g)}</span></div><button type="button" class="schakelaar" role="switch" aria-checked="${aan(g)}" aria-label="${esc(t('gp.aanLabel', { wat: g.tekst }))}" data-gp-aan="${esc(g.id)}"></button></div>`;
}

/* ------------------------------------------------------------ de boog */

function boog(lijst, tel) {
  const W = tel ? 358 : 1180;
  const H = tel ? 190 : 270;
  const L = tel ? 12 : 40;
  const R = tel ? 12 : 40;
  const HOR = tel ? 150 : 216;
  const TOP = tel ? 50 : 66;
  const op = zon?.dag?.opMs != null ? uurVan(zon.dag.opMs) : 7.5;
  const onder = zon?.dag?.onderMs != null ? uurVan(zon.dag.onderMs) : 17;
  const nu = uurVan(Date.now());
  const x = (u) => L + (u / 24) * (W - L - R);
  const y = (u) => (u <= op || u >= onder ? HOR : HOR - (HOR - TOP) * Math.sin((Math.PI * (u - op)) / (onder - op)));
  const pad = (van, tot) => Array.from({ length: 61 }, (_, i) => { const u = van + (i / 60) * (tot - van); return `${i ? 'L' : 'M'}${x(u).toFixed(1)},${y(u).toFixed(1)}`; }).join(' ');
  const id = tel ? 'tel' : 'wand';
  let s = `<defs><linearGradient id="gp-boog-${id}" x1="0" x2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="0.5" stop-color="#f7b548"/><stop offset="1" stop-color="#8f86ff"/></linearGradient><radialGradient id="gp-gloed-${id}"><stop offset="0" stop-color="#f7b548" stop-opacity="0.55"/><stop offset="1" stop-color="#f7b548" stop-opacity="0"/></radialGradient></defs>`;
  s += `<line x1="${x(0)}" x2="${x(24)}" y1="${HOR}" y2="${HOR}" stroke="rgb(255 255 255 / 0.14)"/>`;
  for (const u of [0, 6, 12, 18, 24]) s += `<text x="${x(u)}" y="${HOR + (tel ? 20 : 26)}" text-anchor="${u === 0 ? 'start' : u === 24 ? 'end' : 'middle'}" font-size="${tel ? 11 : 13}" fill="var(--gedempt)">${tel ? u : `${String(u).padStart(2, '0')}:00`}</text>`;
  const dik = tel ? 4 : 5;
  s += `<path d="${pad(0, op)}" stroke="rgb(143 134 255 / 0.45)" stroke-width="${dik - 2}" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>`;
  s += `<path d="${pad(onder, 24)}" stroke="rgb(143 134 255 / 0.65)" stroke-width="${dik - 2}" stroke-dasharray="2 7" stroke-linecap="round" fill="none"/>`;
  s += `<path d="${pad(op, Math.min(Math.max(nu, op), onder))}" stroke="url(#gp-boog-${id})" stroke-opacity="0.35" stroke-width="${dik}" stroke-linecap="round" fill="none"/>`;
  if (nu < onder) s += `<path d="${pad(Math.max(nu, op), onder)}" stroke="url(#gp-boog-${id})" stroke-width="${dik}" stroke-linecap="round" fill="none"/>`;
  // De zon, of 's nachts een maantje op de horizon.
  const r = tel ? 8 : 13;
  if (nu > op && nu < onder) s += `<circle cx="${x(nu)}" cy="${y(nu)}" r="${r * 3}" fill="url(#gp-gloed-${id})"/><circle cx="${x(nu)}" cy="${y(nu)}" r="${r}" fill="#ffd27a"/>`;
  else s += `<circle cx="${x(nu)}" cy="${HOR}" r="${r - 3}" fill="#c9c3ff"/>`;
  // "nu" boven de zon, of eronder als er vlakbij een opdracht staat.
  const dichtbij = lijst.some((o) => Math.abs(uurVan(o.ms) - nu) < 1.5);
  const zonY = nu > op && nu < onder ? y(nu) : HOR;
  if (!tel) s += `<text x="${x(nu)}" y="${dichtbij ? zonY + r + 18 : zonY - r - 10}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffd27a">${esc(t('gp.nu'))}</text>`;
  // De opdrachten van vandaag; de eerstvolgende met zijn naam op de telefoon.
  const eerstvolgende = lijst.find((o) => !o.gedaan && o.ms >= Date.now());
  for (const o of lijst) {
    const u = uurVan(o.ms);
    const px = x(u);
    const py = y(u);
    const kleur = o.gedaan ? 'rgb(170 185 200 / 0.55)' : o.gekozen ? '#ffffff' : '#e8eef5';
    s += `<circle cx="${px}" cy="${py}" r="${o.gekozen ? (tel ? 6 : 8) : tel ? 5 : 6}" fill="${o.gedaan || !o.aan ? '#5b6b7c' : '#0b1424'}" stroke="${kleur}" stroke-width="${tel ? 2 : 2.5}"/>`;
    if (tel && o !== eerstvolgende) continue;
    const dag = u > op && u < onder;
    const stijgt = u < (op + onder) / 2;
    const tx = dag ? px + (stijgt ? -14 : 14) : px;
    const ty = dag ? py - 4 : py - (tel ? 14 : 40);
    const anker = dag ? (stijgt ? 'end' : 'start') : 'middle';
    if (!dag && !tel) s += `<line x1="${px}" x2="${px}" y1="${py}" y2="${py - 32}" stroke="${kleur}" stroke-opacity="0.35"/>`;
    s += `<text class="t" x="${tx}" y="${tel ? ty : ty - 16}" text-anchor="${anker}" fill="${kleur}"${tel ? ' style="font-size: 12px"' : ''}>${esc(klok(o.ms))}${o.gedaan ? ' ✓' : ''}</text>`;
    if (!tel) s += `<text class="w" x="${tx}" y="${ty + 2}" text-anchor="${anker}" fill="${o.gedaan ? 'rgb(170 185 200 / 0.55)' : 'rgb(205 215 225 / 0.9)'}">${esc(o.wat)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('gp.boogUitleg'))}">${s}</svg>`;
}

/* ------------------------------------------------------------ Aanpassen */

function stapperTekst(m) {
  if (m.minuten === 0) return t('gp.precies');
  return t(m.minuten < 0 ? 'gp.minErvoor' : 'gp.minErna', { n: Math.abs(m.minuten) });
}

/** Wanneer het ongeveer is: de zon van vandaag met de minuten erbij, of de tijd. */
function voorproef(m) {
  if (m.soort === 'tijd') return '';
  const zonMs = m.zon === 'op' ? zon?.dag?.opMs : zon?.dag?.onderMs;
  if (zonMs == null) return '';
  const ms = zonMs + m.minuten * 60_000;
  return ms > Date.now() ? t('gp.vandaagOm', { klok: klok(ms) }) : t('gp.morgenRond', { klok: klok(ms + 86_400_000) });
}

function blad(g) {
  const m = open.moment;
  const h = open.herhaal;
  const seg = [['tijd', t('gp.tijd')], ['op', t('gp.op')], ['onder', t('gp.onder')]]
    .map(([k, naam]) => `<button type="button" class="chip" data-gp-wanneer="${k}" aria-pressed="${(k === 'tijd' ? m.soort === 'tijd' : m.soort === 'zon' && m.zon === k)}">${esc(naam)}</button>`).join('');
  const tijd = `${String(m.uur ?? 7).padStart(2, '0')}:${String(m.minuut ?? 0).padStart(2, '0')}`;
  const wanneer = m.soort === 'tijd'
    ? `<input class="gp-tijd" type="time" value="${tijd}" data-gp-tijd aria-label="${esc(t('gp.tijd'))}">`
    : `<div class="gp-stapper"><button type="button" data-gp-min="-5" aria-label="${esc(t('gp.eerder'))}">−</button><b>${esc(stapperTekst(m))}</b><button type="button" data-gp-min="5" aria-label="${esc(t('gp.later'))}">+</button></div><div class="gp-zo">${esc(voorproef(m))}</div>`;
  const keuzes = ['een', 'dag', 'werkdagen', 'weekend', 'dagen'].map((s) => `<button type="button" data-gp-herhaal="${s}" aria-pressed="${h.soort === s}"><span>${esc(t(s === 'dagen' ? 'gp.kiesDagen' : `gp.h.${s}`))}</span></button>`).join('');
  const dagen = h.soort === 'dagen' ? `<div class="gp-dagen">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button type="button" data-gp-dag="${d}" aria-pressed="${(h.dagen ?? []).includes(d)}">${esc(t(`gp.d${d}`))}</button>`).join('')}</div>` : '';
  return `<div class="boven"><h2>${esc(g.tekst)}</h2><button class="schakelaar" type="button" role="switch" aria-checked="${open.aan}" aria-label="${esc(t('gp.aan'))}" data-gp-blad-aan></button><button class="sluit" type="button" data-gp-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    <div class="gp-kolom">
      <div class="gp-vraag"><span>${esc(t('gp.wat'))}</span><div class="gp-waarde"><b>${esc(g.tekst)}</b></div></div>
      <div class="gp-vraag"><span>${esc(t('gp.wanneer'))}</span><div class="chips seg">${seg}</div>${wanneer}</div>
    </div>
    <div class="gp-kolom">
      <div class="gp-vraag" ${herhaalOpen ? 'hidden' : ''}><span>${esc(t('gp.herhalen'))}</span><button type="button" class="gp-waarde" data-gp-herhalen><b>${esc(herhaalNaam(h))}</b><i>›</i></button></div>
      <div class="gp-vraag" ${herhaalOpen ? '' : 'hidden'}><span>${esc(t('gp.herhalen'))}</span><div class="gp-keus">${keuzes}</div>${dagen}</div>
      <div class="gp-rij" ${herhaalOpen ? 'hidden' : ''}><span>${esc(t('gp.overslaan'))}<small>${esc(t('gp.overslaanZin'))}</small></span><button class="schakelaar" type="button" role="switch" aria-checked="${open.overslaanWeg}" aria-label="${esc(t('gp.overslaan'))}" data-gp-weg></button></div>
      ${fout ? `<div class="gp-fout">${esc(fout)}</div>` : ''}
      <div class="gp-onder" ${herhaalOpen ? 'hidden' : ''}><button class="weg" type="button" data-gp-weghalen>${esc(t('gp.weghalen'))}</button><button class="bewaar" type="button" data-gp-bewaar>${esc(t('gp.bewaar'))}</button></div>
    </div>`;
}

/* ------------------------------------------------------------ tekenen */

function teken() {
  app.schaal?.();
  const tel = telStand();
  const kop = `<a class="terugje" href="tedoen.html">${esc(t('gp.terug'))}</a>
    <div class="gp-kop"><div><h1 class="kop-1">${esc(t('gp.kop'))}</h1><p class="lead">${esc(t('gp.lead'))} <q>${esc(t('gp.voorbeeld'))}</q>.</p></div><a class="gp-nieuw" href="assistent.html#typ">${esc(t('gp.nieuw'))}</a></div>`;
  let html;
  if (!data) html = `${kop}<p class="mini">${esc(t('algemeen.laden'))}</p>`;
  else if (!data.aan) html = `${kop}<section class="glas gp-lijst"><p class="gp-leeg">${esc(t('tedoen.uit'))}</p></section>`;
  else {
    const alle = data.gepland ?? [];
    const vandaag = alle.filter((g) => dagenVan(g.ms) <= 0);
    const later = alle.filter((g) => dagenVan(g.ms) > 0);
    // Wat vandaag al gebeurde: een vaste opdracht die vandaag zijn beurt had.
    const gedaan = alle.filter((g) => g.opdracht?.laatstMs && dagenVan(g.opdracht.laatstMs) === 0 && dagenVan(g.ms) > 0);
    const opBoog = [
      ...vandaag.map((g) => ({ ms: g.ms, wat: g.tekst, aan: aan(g), gekozen: open?.id === g.id })),
      ...gedaan.map((g) => ({ ms: g.opdracht.laatstMs, wat: g.tekst, aan: true, gedaan: true })),
    ].sort((a, b) => a.ms - b.ms);
    const op = zon?.dag?.opMs != null ? klok(zon.dag.opMs) : null;
    const onder = zon?.dag?.onderMs != null ? klok(zon.dag.onderMs) : null;
    const dag = `<section class="glas gp-dag"><h2>${esc(t('gp.vandaag.kop'))}${op && onder ? `<span>${esc(t('gp.zonOpOnder', { op, onder }))}</span>` : ''}</h2>${boog(opBoog, tel)}</section>`;
    const leeg = !alle.length ? `<p class="gp-leeg">${esc(t('gp.leeg'))}</p>` : '';
    const links = `<section class="glas gp-lijst"><h3>${esc(t('gp.vandaagNog'))}</h3>${leeg}${vandaag.map((g) => regel(g)).join('')}${gedaan.map((g) => regel(g, true)).join('')}${!leeg && !vandaag.length && !gedaan.length ? `<p class="gp-leeg">${esc(t('gp.nietsMeer'))}</p>` : ''}</section>`;
    const rechts = `<section class="glas gp-lijst"><h3>${esc(t('gp.komend'))}</h3>${later.map((g) => regel(g)).join('') || `<p class="gp-leeg">${esc(t('gp.nietsKomend'))}</p>`}<p class="tip">${esc(t('gp.tip'))}</p></section>`;
    const g = open ? alle.find((x) => x.id === open.id) : null;
    const bladHtml = g ? `${tel ? '<div class="gp-achter" data-gp-sluit></div>' : ''}<aside class="glas gp-blad" role="dialog" aria-label="${esc(g.tekst)}">${blad(g)}</aside>` : '';
    html = `${kop}${dag}<div class="gp-veld">${links}${rechts}${tel ? '' : bladHtml}</div>${tel ? bladHtml : ''}`;
  }
  document.querySelector(tel ? '#tel [data-gp]' : '#wand [data-gp]').innerHTML = html;
  document.querySelector(tel ? '#wand [data-gp]' : '#tel [data-gp]').innerHTML = '';
}

async function laad() {
  const [d, z] = await Promise.allSettled([haal('api/te-doen'), haal('api/zon')]);
  if (d.status === 'fulfilled') data = d.value;
  if (z.status === 'fulfilled') zon = z.value;
  // Een opdracht die niet meer bestaat, sluit vanzelf.
  if (open && !(data?.gepland ?? []).some((g) => g.id === open.id)) open = null;
  teken();
}

/* ------------------------------------------------------------ doen */

async function stuur(body) {
  const res = await deur('api/te-doen', body);
  if (!res) return false;
  if (!res.ok) {
    fout = (await res.json().catch(() => null))?.fout ?? t('gp.lukteNiet');
    teken();
    return false;
  }
  fout = '';
  return true;
}

function openen(id) {
  const g = (data?.gepland ?? []).find((x) => x.id === id);
  if (!g) return;
  const m = momentVan(g);
  open = { id, aan: aan(g), overslaanWeg: g.opdracht?.overslaanWeg === true, moment: { ...m }, herhaal: { ...herhaalVan(g), dagen: [...(herhaalVan(g).dagen ?? [])] } };
  herhaalOpen = false;
  fout = '';
  teken();
}

document.addEventListener('click', async (e) => {
  const el = (s) => e.target.closest(s);
  let x;
  if ((x = el('[data-gp-aan]'))) {
    e.stopPropagation();
    const g = data.gepland.find((y) => y.id === x.dataset.gpAan);
    if (g && (await stuur({ actie: 'aanpassen', id: g.id, aan: !aan(g) }))) await laad();
    return;
  }
  if ((x = el('[data-gp-open]'))) return openen(x.dataset.gpOpen);
  if (!open) return;
  if (el('[data-gp-sluit]')) {
    open = null;
    return teken();
  }
  if (el('[data-gp-blad-aan]')) open.aan = !open.aan;
  else if (el('[data-gp-weg]')) open.overslaanWeg = !open.overslaanWeg;
  else if ((x = el('[data-gp-wanneer]'))) {
    const k = x.dataset.gpWanneer;
    if (k === 'tijd' && open.moment.soort !== 'tijd') open.moment = { soort: 'tijd', uur: 7, minuut: 0 };
    else if (k !== 'tijd') open.moment = { soort: 'zon', zon: k, minuten: open.moment.soort === 'zon' ? open.moment.minuten : 0 };
  } else if ((x = el('[data-gp-min]'))) open.moment.minuten = Math.max(-180, Math.min(180, open.moment.minuten + Number(x.dataset.gpMin)));
  else if (el('[data-gp-herhalen]')) herhaalOpen = true;
  else if ((x = el('[data-gp-herhaal]'))) {
    const s = x.dataset.gpHerhaal;
    open.herhaal = s === 'dagen' ? { soort: 'dagen', dagen: open.herhaal.dagen?.length ? open.herhaal.dagen : [new Date().getDay() || 7] } : { soort: s };
    // Een keuze klapt de lijst dicht; bij Kies dagen blijft hij open voor de dagen.
    if (s !== 'dagen') herhaalOpen = false;
  } else if ((x = el('[data-gp-dag]'))) {
    const d = Number(x.dataset.gpDag);
    const dagen = new Set(open.herhaal.dagen ?? []);
    if (dagen.has(d)) dagen.delete(d);
    else dagen.add(d);
    open.herhaal = { soort: 'dagen', dagen: [...dagen].sort((a, b) => a - b) };
    if (dagen.size) herhaalOpen = false;
  } else if (el('[data-gp-weghalen]')) {
    if (await stuur({ actie: 'annuleer', id: open.id })) {
      open = null;
      await laad();
    }
    return;
  } else if (el('[data-gp-bewaar]')) {
    const { id, aan: a, overslaanWeg, moment, herhaal } = open;
    if (await stuur({ actie: 'aanpassen', id, aan: a, overslaanWeg, moment, herhaal: herhaal.soort === 'dagen' ? herhaal : { soort: herhaal.soort } })) {
      open = null;
      await laad();
    }
    return;
  } else return;
  teken();
});

document.addEventListener('change', (e) => {
  const tijd = e.target.closest?.('[data-gp-tijd]');
  if (!tijd || !open) return;
  const [u, m] = tijd.value.split(':').map(Number);
  if (Number.isInteger(u) && Number.isInteger(m)) open.moment = { soort: 'tijd', uur: u, minuut: m };
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open) {
    open = null;
    teken();
  } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-gp-open]')) {
    e.preventDefault();
    openen(e.target.dataset.gpOpen);
  }
});

app.start('tedoen');
addEventListener('resize', () => teken());
void laad();
setInterval(() => void laad(), 60_000);
