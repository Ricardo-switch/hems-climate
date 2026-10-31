/*
 * Apparaten, in ontwerp 2 (besluit 104; schets Wand-Apparaten-Nu, besluit 140).
 * Het nu, naast Vandaag dat de tijd is: per apparaat een kaart met wat het
 * doet, wat het nu vraagt, wat het vandaag gebruikte en welk deel op eigen
 * zon, of hoe lang het aan stond als er geen meter is. Wat iets doet, staat
 * bovenaan. Een uitstelbaar apparaat kiest hier "klaar voor" (besluit 101), een
 * jacuzzi "klaar om" (besluit 186). De zinnen en de keuzes komen kant-en-klaar van de dienst
 * (besluit 94); de pagina zet ze neer en rekent alleen de resterende tijd uit.
 *
 * Eerlijk over wat er is (besluit 104): een batterij of een auto staat hier pas
 * als het huis er een heeft. De tijd kiezen gaat naar de dienst, nooit naar
 * Home Assistant.
 */
'use strict';

const { $$, nl, esc, klokVan, haal, deur } = app;
// De teksten staan in kit/teksten.*.js (besluit 185).
const { t } = taal;

let state = null;
let vandaag = null;
let zon = null;
let aansluiting = null;
let huisData = null;
let opbrengst = null;
/** Het antwoord op de laatste keuze per apparaat, tot het volgende besluit het overneemt. */
const gezegd = new Map();

async function laadAlles() {
  const [s, v, z, a, h, o] = await Promise.allSettled([haal('api/state'), haal('api/vandaag'), haal('api/zon'), haal('api/aansluiting'), haal('api/huis'), haal('api/opbrengst?soort=dag')]);
  if (h.status === 'fulfilled') huisData = h.value;
  if (o.status === 'fulfilled') opbrengst = o.value;
  if (s.status === 'fulfilled') state = s.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (a.status === 'fulfilled') aansluiting = a.value;
  teken();
}

/* ------------------------------------------------------------ de ring */

const RING = 2 * Math.PI * 27;

function ring({ deel = 0, kleur = '#F7B548', tekst = '', label, gestippeld = false, binnen = false }) {
  const spoor = gestippeld
    ? `<circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="4 6"/>`
    : `<circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>`;
  const boog = deel > 0 ? `<circle cx="32" cy="32" r="27" fill="none" stroke="${kleur}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(deel * RING).toFixed(1)} ${RING.toFixed(1)}" transform="rotate(-90 32 32)"/>` : '';
  const kern = binnen ? `<circle cx="32" cy="32" r="11" fill="none" stroke="#B8C4CF" stroke-width="3"/>` : '';
  const woord = tekst ? `<text x="32" y="37" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="15" fill="#EEF3F7">${esc(tekst)}</text>` : '';
  return `<svg class="ring" viewBox="0 0 64 64" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${spoor}${boog}${kern}${woord}</svg>`;
}

const duurTekst = (min) => (min >= 60 ? t('thuis.apparaat.uren', { u: Math.floor(min / 60), m: String(Math.round(min % 60)).padStart(2, '0') }) : t('thuis.apparaat.minuten', { m: Math.max(1, Math.round(min)) }));

/* ------------------------------------------------------- een apparaat */

/**
 * Wanneer een draaiend apparaat begon en klaar is. Draait hij nog, dan is de
 * laatste strook van vandaag open: zijn begin is de start. Klaar is de start
 * plus de duur van het programma, zoals het apparaat die meldt.
 */
function looptijd(d) {
  const spans = (vandaag?.uitstelbaar ?? []).find((u) => u.id === d.id);
  const laatste = spans?.draaide?.[spans.draaide.length - 1];
  const open = d.stand === 'running' && laatste && Date.now() - laatste.totMs < 5 * 60_000 && laatste.vanMs > (vandaag?.vanMs ?? 0);
  if (!open) return null;
  // De resterende tijd van het apparaat gaat voor de duur van het programma (besluit 167).
  return { start: laatste.vanMs, klaar: d.restMin != null ? Date.now() + d.restMin * 60_000 : d.duurMin ? laatste.vanMs + d.duurMin * 60_000 : null };
}

function kaart(d) {
  const spans = (vandaag?.uitstelbaar ?? []).find((u) => u.id === d.id);
  const nu = Date.now();
  const start = looptijd(d)?.start ?? null;
  const zouOm = spans?.zouStarten?.[0]?.vanMs;

  let boven;
  let toon = '';
  let zin = d.zin;
  let rest = null;
  if (d.stand === 'running' && d.klaarSindsMs != null) {
    // Klaar met drogen; de trommel draait nog tegen kreuken (besluit 167). Dat zegt de kop van de dienst.
    toon = 'mint-t';
    boven = ring({ deel: 1, kleur: '#6EE7B7', tekst: '✓', label: t('vandaag.isKlaar', { naam: d.naam }) });
  } else if (d.stand === 'running') {
    toon = 'zon-t';
    const klaarOm = looptijd(d)?.klaar ?? null;
    if (start != null && klaarOm != null) {
      const gelopen = (nu - start) / 60_000;
      const over = Math.max(0, (klaarOm - nu) / 60_000);
      const klaar = klaarOm;
      boven = ring({ deel: Math.min(1, gelopen / Math.max(1, gelopen + over)), tekst: duurTekst(over), label: t('apparaten.nogMinuten', { naam: d.naam, n: Math.round(over) }) });
      toon = 'zon-t';
      zin = `${t('apparaten.begon', { klok: klokVan(start) })}${zouOm != null && zouOm < start ? ` ${t('apparaten.zou', { klok: klokVan(zouOm) })}` : ''}`;
      rest = over > 0 ? { van: nu, tot: klaar } : null;
      d = { ...d, kop: t('apparaten.klaarRond', { kop: d.kop, klok: klokVan(klaar) }) };
    } else {
      boven = ring({ deel: 1, label: t('kamer.draait', { naam: d.naam }) });
    }
  } else if (d.stand === 'would_start') {
    toon = 'zon-t';
    boven = ring({ gestippeld: true, binnen: true, deel: 0.08 });
  } else if (d.stand === 'waiting') {
    boven = ring({ gestippeld: true, binnen: true });
  } else {
    boven = ring({ gestippeld: true });
  }
  void rest;
  const draaide = (spans?.draaide ?? []).reduce((som, x) => som + (x.totMs - x.vanMs), 0);
  // Draait hij, dan zette de bewoner hem aan: SunArc start nog niets zelf (de schaduw,
  // besluit 64). Dan niet "Start op zon", dat las alsof de zon hem startte (25 oktober 2026).
  const label = d.stand === 'running' && !d.doorSmartClimate ? `<span class="label">${esc(t('apparaten.zelfGestart'))}</span>` : `<span class="label zon">${esc(t('apparaten.startOpZon'))}</span>`;
  const el = document.createElement('section');
  el.className = 'glas app';
  el.dataset.actief = String(d.stand === 'running' || d.stand === 'would_start' || d.stand === 'waiting');
  el.innerHTML = `
    <div class="boven">${boven}<div><b>${esc(d.naam)}</b><span class="klein ${toon}">${esc(d.kop)}</span></div></div>
    <p class="mini zin">${esc(zin)}</p>
    <div class="labels">${label}</div>
    <div class="vandaag"><span>${esc(t('thuis.kaart.vandaag'))}</span><b>${esc(draaide > 0 ? t('apparaten.gedraaid', { duur: uren(draaide) }) : t('apparaten.nietGedraaid'))}</b></div>`;

  if (d.kanKiezen) {
    const opties = [{ tekst: t('apparaten.geenHaast'), waarde: null }, ...d.keuzes];
    const blok = document.createElement('div');
    blok.innerHTML = `<div class="mini" style="margin-bottom: 6px">${esc(t('apparaten.klaarVoor'))}</div><div class="keuze" role="group" aria-label="${esc(t('apparaten.klaarVoorVan', { naam: d.naam }))}"></div><p class="mini gezegd" aria-live="polite" style="margin: 8px 0 0">${esc(gezegd.get(d.id) ?? '')}</p>`;
    const groep = blok.querySelector('.keuze');
    const antwoord = blok.querySelector('.gezegd');
    for (const o of opties) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.tekst;
      b.setAttribute('aria-pressed', String(o.waarde == null ? d.klaarVoor == null : d.klaarVoor === o.waarde));
      b.addEventListener('click', () => void kies(d, o, groep, b, antwoord));
      groep.append(b);
    }
    el.append(blok);
  }
  return el;
}

async function kies(d, optie, groep, knop, antwoord) {
  antwoord.textContent = t('apparaten.even');
  try {
    const res = await deur('api/uitstel', { id: d.id, klaarVoor: optie.waarde });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    const tekst = !res.ok
      ? uit.fout ?? t('kamer.mislukt')
      : optie.waarde
        ? t('apparaten.genoteerd', { tekst: optie.tekst })
        : t(d.uiterlijk ? 'apparaten.geenHaastUiterlijk' : 'apparaten.geenHaastZin', { klok: d.uiterlijk });
    if (res.ok) [...groep.children].forEach((b) => b.setAttribute('aria-pressed', String(b === knop)));
    gezegd.set(d.id, tekst);
    antwoord.textContent = tekst;
  } catch {
    antwoord.textContent = t('kamer.geenVerbinding');
  }
}

/* ------------------------------------------- de boiler en de jacuzzi */

let tankNr = 0;
/** De tank van de boiler, gevuld tot de temperatuur, met een streep bij het doel op zon (besluit 186). */
function tank(b) {
  const deel = b.temperatuurC == null ? 0.5 : Math.max(0.08, Math.min(1, (b.temperatuurC - 20) / Math.max(1, b.zonC - 20)));
  const hoog = Math.round(52 * deel);
  // Een eigen naam per tekening: wand en telefoon staan allebei in de pagina, en een verborgen verloop tekent niet.
  const id = `tank-${b.id}-${++tankNr}`;
  const tekst = b.temperatuurC == null ? '' : `<text x="32" y="44" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="13" fill="#fff">${esc(nl(b.temperatuurC, 0))}°</text>`;
  const label = b.temperatuurC == null ? b.naam : t('apparaten.tank', { naam: b.naam, temp: nl(b.temperatuurC, 0) });
  return `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="${esc(label)}"><defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4d86c9"/><stop offset="0.55" stop-color="#ff9a6b"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient><clipPath id="${id}-v"><rect x="18" y="6" width="28" height="52" rx="12"/></clipPath></defs><rect x="18" y="6" width="28" height="52" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/><g clip-path="url(#${id}-v)"><rect x="18" y="${58 - hoog}" width="28" height="${hoog}" fill="url(#${id})"/></g>${b.bron === 'zon' ? '<path d="M14 13h36" stroke="#F7B548" stroke-width="1.5" stroke-dasharray="3 3"/>' : ''}${tekst}</svg>`;
}

function bufferKaart(b) {
  const kleur = b.bron === 'zon' ? '#F7B548' : b.bron === 'net' ? '#ff9a6b' : '#6EE7B7';
  const toon = b.bron === 'zon' ? 'zon-t' : b.bron === 'net' ? 'gloed-t' : b.stand === 'full' ? 'mint-t' : '';
  const deel = b.temperatuurC == null ? 0 : Math.max(0, Math.min(1, (b.temperatuurC - 20) / Math.max(1, b.zonC - 20)));
  const boven = b.soort === 'boiler' ? tank(b) : ring({ deel, kleur, tekst: b.temperatuurC == null ? '' : `${nl(b.temperatuurC, 0)}°`, label: b.temperatuurC == null ? b.naam : t('apparaten.tank', { naam: b.naam, temp: nl(b.temperatuurC, 0) }) });
  const el = document.createElement('section');
  el.className = 'glas app';
  el.dataset.actief = String(b.stand === 'would_heat' || b.stookt);
  el.innerHTML = `
    <div class="boven">${boven}<div><b>${esc(b.naam)}</b><span class="klein ${toon}">${esc(b.kop)}</span></div></div>
    <p class="mini zin">${esc(b.zin)}</p>
    <div class="labels"><span class="label zon">${esc(t('apparaten.warmteOpZon'))}</span></div>`;
  if (b.keuzes.length > 0) {
    const opties = [{ tekst: t('apparaten.geenHaast'), waarde: null }, ...b.keuzes];
    const blok = document.createElement('div');
    blok.innerHTML = `<div class="mini" style="margin-bottom: 6px">${esc(t('apparaten.klaarOm'))}</div><div class="keuze" role="group" aria-label="${esc(t('apparaten.klaarOmVan', { naam: b.naam }))}"></div><p class="mini gezegd" aria-live="polite" style="margin: 8px 0 0">${esc(gezegd.get(b.id) ?? '')}</p>`;
    const groep = blok.querySelector('.keuze');
    const antwoord = blok.querySelector('.gezegd');
    for (const o of opties) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.textContent = o.tekst;
      knop.setAttribute('aria-pressed', String(o.waarde == null ? b.klaarOm == null : b.klaarOm?.atMs === o.waarde));
      knop.addEventListener('click', () => void kiesKlaarOm(b, o, groep, knop, antwoord));
      groep.append(knop);
    }
    el.append(blok);
  }
  return el;
}

async function kiesKlaarOm(b, optie, groep, knop, antwoord) {
  antwoord.textContent = t('apparaten.even');
  try {
    const res = await deur('api/klaarom', { id: b.id, klaarOm: optie.waarde });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    const tekst = !res.ok
      ? uit.fout ?? t('kamer.mislukt')
      : optie.waarde
        ? t('apparaten.klaarOmGenoteerd', { tekst: optie.tekst, doel: uit.klaarOm?.targetC ?? b.zonC })
        : t('apparaten.klaarOmWeg', { min: b.ondergrensC });
    if (res.ok) [...groep.children].forEach((x) => x.setAttribute('aria-pressed', String(x === knop)));
    gezegd.set(b.id, tekst);
    antwoord.textContent = tekst;
  } catch {
    antwoord.textContent = t('kamer.geenVerbinding');
  }
}

/* ------------------------------------------------------- het klimaat */

const uren = (ms) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? t('vandaag.minuten', { n: Math.max(1, min) }) : t('apparaten.uren', { uren: nl(min / 60) });
};
/** De rol van een klimaatapparaat: houdt, zon of kijken (teksten.*.js). */
const ROL = (rol) => t(`apparaten.rol.${rol}`);
const IK = {
  airco: '<svg viewBox="0 0 24 24" fill="none" stroke="#a9e6ff" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="8" rx="2"/><path d="M6 10h12M8 16.5c-.5 1-.5 2 0 3M12 16v3.5M16 16.5c.5 1 .5 2 0 3"/></svg>',
  warm: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb090" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/></svg>',
};

/** Elk klimaatapparaat in een kamer, met zijn kamer. */
const klimaat = () => (huisData?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat').map((a) => ({ a, r }))));

/**
 * Een klimaatapparaat nu: wat het doet (uit wat de dienst zegt, of wat Home
 * Assistant meldt), wat het vraagt, en wat het vandaag deed.
 */
function klimaatKaart({ a, r }) {
  const id = a.actuatorId ?? a.id;
  const bew = state?.bewoner?.apparaten?.find((x) => x.actuatorId === id);
  const wacht = (state?.rejected ?? []).find((x) => x.blockedBy === 'insufficient_power_budget' && x.intent?.actuatorId === id && x.intent?.budgetW > 0);
  const code = a.klimaat?.actieCode ?? '';
  const doet = /^(koelt|verwarmt|verwarmt-voor|droogt|ventileert)$/.test(code);
  const stand = bew?.soort === 'wait' ? [t('apparaten.wachtZon'), 'var(--zon)'] : doet ? [huismodel.metHoofdletter(a.klimaat.actie), code === 'koelt' ? 'var(--ijs)' : 'var(--gloed)'] : [huismodel.metHoofdletter(a.stand ?? t('apparaten.onbekend')), 'var(--mint)'];
  // Niet twee keer hetzelfde (29 oktober 2026): de zin begon met de stand ("Verwarmen naar 20° · onder het doel"),
  // en een stand die het doel al noemt ("Automatisch naar 18°") kreeg "Doel 18°." eronder. Een radiatorknop noemt het ook al.
  const doel = a.klimaat?.doelC != null ? `${nl(a.klimaat.doelC, Number.isInteger(a.klimaat.doelC) ? 0 : 1)}°` : null;
  const standLaag = stand[0].toLowerCase();
  const rest = bew?.tekst?.toLowerCase().startsWith(standLaag) ? bew.tekst.slice(standLaag.length).replace(/^[\s·,.;:–-]+/, '') : bew?.tekst;
  // Twee doelen bij één thermostaat (30 oktober 2026): bovenaan wat het apparaat zelf zegt ("Automatisch naar 18°"),
  // eronder wat SunArc zou doen. Doet het apparaat het niet zelf, dan zegt de zin van wie hij is.
  const vanSC = rest && !doet && bew?.soort !== 'wait' ? t('apparaten.zouKiezen', { wat: rest }) : rest ? `${huismodel.metHoofdletter(rest)}.` : '';
  const zin = bew?.tekst
    ? [vanSC, wacht ? t('apparaten.begintBij', { kw: nl(wacht.intent.budgetW / 1000) }) : ''].filter(Boolean).join(' ')
    : doel && !standLaag.includes(doel) && !(a.radiatorknop && a.standCode !== 'uit' && a.standCode !== 'geen-verbinding') ? t('vandaag.doel', { doel }) : '';
  const kw = a.klimaat?.vermogenW != null ? `${nl(a.klimaat.vermogenW / 1000)}<span>${esc(t('apparaten.kwNu'))}</span>` : `–<span>${esc(t('apparaten.geenMeter'))}</span>`;
  // Vandaag: uit de kWh-meter van het apparaat (Opbrengst), anders hoe lang het aan stond.
  const meter = (opbrengst?.apparaten ?? []).find((m) => m.id === a.klimaat?.energieMeter);
  const aan = (vandaag?.apparaten ?? []).find((x) => x.actuatorId === id)?.huidig ?? [];
  const aanMs = aan.reduce((som, x) => som + (x.totMs - x.vanMs), 0);
  const zonPct = meter && meter.kwh > 0 ? Math.round((meter.zonKwh / meter.kwh) * 100) : 0;
  const vandaagKop = `<span>${esc(t('thuis.kaart.vandaag'))}</span>`;
  const dag = meter
    ? `<div class="vandaag">${vandaagKop}<b>${esc(t('apparaten.eigenZon', { kwh: nl(meter.kwh), pct: zonPct }))}</b></div><div class="verdeel"><i style="width: ${zonPct}%; background: var(--zon)"></i><i style="width: ${100 - zonPct}%; background: #8796a8"></i></div>`
    : `<div class="vandaag">${vandaagKop}<b>${esc(aanMs > 0 ? t('apparaten.aan', { duur: uren(aanMs) }) : t('apparaten.nietAan'))}</b></div>`;
  const labels = [a.klimaat?.rol ? `<span class="label${a.klimaat.rol === 'zon' ? ' zon' : ''}">${esc(ROL(a.klimaat.rol))}</span>` : '', a.klimaat?.filter?.pct != null ? `<span class="label">${esc(t('apparaten.filter', { pct: a.klimaat.filter.pct }))}</span>` : ''].join('');
  const el = document.createElement('a');
  el.className = 'glas app';
  el.href = `kamer.html#${encodeURIComponent(r.id)}/${encodeURIComponent(a.id)}`;
  el.dataset.actief = String(doet || bew?.soort === 'wait');
  el.innerHTML = `
    <div class="kopje"><span class="ik${a.klimaat?.kanKoelen ? '' : ' warm'}">${a.klimaat?.kanKoelen ? IK.airco : IK.warm}</span><div><b>${esc(a.naam)}</b><span class="mini">${esc(r.naam)}</span></div><div class="kw">${kw}</div></div>
    <div class="stand"><i style="background: ${stand[1]}"></i>${esc(stand[0])}</div>
    ${zin ? `<p class="mini zin">${esc(zin)}</p>` : ''}
    ${labels ? `<div class="labels">${labels}</div>` : ''}
    ${dag}`;
  return el;
}

/*
 * De auto en de thuisbatterij (besluit 182): hoe vol, wat ze doen en met
 * hoeveel. Alleen lezen; een tik op de kaart op Thuis komt hier uit
 * (apparaten.html#auto, #batterij).
 */
const LADING_IK = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/></svg>',
  batterij: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M10 2h4M9 14h6M9 10h6"/></svg>',
};
function ladingKaart(soort, o) {
  const w = o.vermogenW;
  const kw = w != null && Math.abs(w) >= 50 ? `${nl(Math.abs(w) / 1000)}<span>${esc(t(soort === 'batterij' && w < 0 ? 'apparaten.kwNaarHuis' : 'apparaten.kwLaden'))}</span>` : '–<span>kW</span>';
  const [sleutel, kleur] =
    soort === 'auto'
      ? o.laadt ? ['thuis.lading.laadt', 'var(--mint)'] : o.aangesloten === true ? ['thuis.lading.aangesloten', 'var(--net)'] : o.aangesloten === false ? ['thuis.lading.nietAangesloten', 'var(--net)'] : ['apparaten.onbekend', 'var(--net)']
      : o.stand === 'laadt' ? ['thuis.lading.laadt', 'var(--zon)'] : o.stand === 'levert' ? ['apparaten.levert', 'var(--violet)'] : o.stand === 'rust' ? ['thuis.lading.rust', 'var(--net)'] : ['apparaten.onbekend', 'var(--net)'];
  const tekst = t(sleutel);
  const pct = o.pct == null ? null : Math.max(0, Math.min(100, o.pct));
  const zin = soort === 'auto'
    ? [o.bereikKm != null ? t('apparaten.bereik', { km: nl(o.bereikKm, 0) }) : '', o.pct == null ? t('apparaten.laadpaal') : ''].filter(Boolean).join(' ')
    : t('apparaten.batterijKijkt');
  const el = document.createElement('div');
  el.className = 'glas app';
  el.dataset.lading = soort;
  el.dataset.actief = String(soort === 'auto' ? !!o.laadt : o.stand === 'laadt' || o.stand === 'levert');
  el.innerHTML = `
    <div class="kopje"><span class="ik">${LADING_IK[soort]}</span><div><b>${esc(o.naam)}</b><span class="mini">${esc(t(soort === 'auto' ? 'thuis.kaart.auto' : 'apparaten.thuisbatterij'))}</span></div><div class="kw">${kw}</div></div>
    <div class="stand"><i style="background: ${kleur}"></i>${esc(tekst)}</div>
    <div class="vandaag"><span>${esc(t('apparaten.lading'))}</span><b>${pct == null ? esc(t('apparaten.onbekendKlein')) : `${nl(pct, 0)}%`}</b></div>
    <div class="verdeel"><i style="width: ${pct ?? 0}%; background: ${kleur}"></i></div>
    ${zin ? `<p class="mini zin">${esc(zin)}</p>` : ''}`;
  return el;
}

/** Een apparaat dat de dienst vond maar dat (nog) niet op zon staat. */
function nietOpZon(a) {
  const el = document.createElement('a');
  el.className = 'glas app niet';
  el.href = 'regeling.html#opzon';
  el.innerHTML = `
    <div class="boven">${ring({ gestippeld: true })}<div><b>${esc(a.naam)}</b><span class="klein">${esc(t('apparaten.nietOpZon'))}</span></div></div>
    <p class="mini zin">${esc(t('apparaten.zetOpZon'))}</p>`;
  return el;
}

function toevoegen() {
  const el = document.createElement('a');
  el.className = 'glas app niet';
  el.href = 'regeling.html#opzon';
  el.innerHTML = `
    <div class="boven"><svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 20v24M20 32h24" stroke="#7F8E9C" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="4 6"/></svg><div><b>${esc(t('apparaten.toevoegen'))}</b><span class="klein">${esc(t('apparaten.toevoegenWat'))}</span></div></div>
    <p class="mini zin">${esc(t('apparaten.toevoegenWaar'))}</p>`;
  return el;
}

/* ------------------------------------------------------------- de zon */

const ZON = '<svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="9" fill="#F7B548"/><g stroke="#F7B548" stroke-width="2.4" stroke-linecap="round"><path d="M20 3v4M20 33v4M3 20h4M33 20h4M8 8l3 3M29 29l3 3M8 32l3-3M29 11l3-3"/></g></svg>';
const MAAN = '<svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><path d="M26 8a13 13 0 1 0 6 20A11 11 0 0 1 26 8z" fill="#B8C4CF"/></svg>';

function tekenZonchip() {
  const s = state?.bewoner?.stromen ?? {};
  const zonKw = s.zonKw ?? 0;
  const overKw = Math.max(0, (state?.explanation?.budget?.surplusW ?? 0) / 1000);
  let kop;
  let onder;
  if (zonKw < 0.05) {
    kop = t('apparaten.geenZon');
    onder = t('apparaten.leverenNiets');
  } else if (overKw < 0.05) {
    kop = t('apparaten.geenZonOver');
    onder = t('apparaten.naarHuis', { kw: nl(zonKw) });
  } else {
    kop = t('apparaten.over', { kw: nl(overKw) });
    onder = t((s.aircoKw ?? 0) > 0.05 ? 'apparaten.vanZonAirco' : 'apparaten.vanZon', { kw: nl(zonKw) });
  }
  $$('[data-zonchip]').forEach((el) => (el.innerHTML = `${zonKw < 0.05 ? MAAN : ZON}<div><div class="kop-3">${esc(kop)}</div><div class="mini">${esc(onder)}</div></div>`));
}

/** Waar de zon nu heen gaat: airco's, de rest van het huis, terug naar het net. */
function tekenVerdeling() {
  const s = state?.bewoner?.stromen ?? {};
  const delen = [
    [t('apparaten.deAircos'), s.aircoKw ?? 0, 'var(--ijs)'],
    [t('apparaten.restHuis'), s.huisKw ?? 0, '#B8C4CF'],
    [t('apparaten.terugNet'), Math.max(0, -(s.netKw ?? 0)), 'var(--mint)'],
  ].filter(([, kw]) => kw >= 0.05);
  const totaal = delen.reduce((som, [, kw]) => som + kw, 0);
  const vanNet = Math.max(0, s.netKw ?? 0);
  const titel = t((s.zonKw ?? 0) >= 0.05 ? 'apparaten.waarHeen' : 'apparaten.watGebruikt');
  const balk = totaal > 0 ? delen.map(([, kw, kleur]) => `<i style="width: ${((kw / totaal) * 100).toFixed(1)}%; background: ${kleur}"></i>`).join('') : '';
  const legenda = [
    ...delen.map(([naam, kw, kleur]) => `<span><span class="stip" style="background: ${kleur}"></span>${esc(naam)} <b>${nl(kw)} kW</b></span>`),
    vanNet >= 0.05 ? `<span><span class="stip" style="background: var(--gloed)"></span>${esc(t('apparaten.vanNet'))} <b>${nl(vanNet)} kW</b></span>` : '',
  ].join('');
  $$('[data-verdeling]').forEach((el) => (el.innerHTML = `<h2 class="kop-3">${esc(titel)}</h2><div class="balkje" aria-hidden="true">${balk}</div><div class="legenda">${legenda}</div>`));
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  if (!state) return;
  app.luchtVan(zon, state.bewoner?.stromen?.zonKw ?? 0);
  tekenZonchip();
  tekenVerdeling();

  const lijst = state.bewoner?.uitstelbaar ?? [];
  const buffers = state.bewoner?.warmtebuffers ?? [];
  const opZon = new Set([...lijst, ...buffers].map((d) => d.id));
  const gevonden = (aansluiting?.gevonden?.apparaten ?? []).filter((a) => !opZon.has(a.id));
  for (const box of $$('[data-apparaten]')) {
    // Een knop met focus niet onder de vinger weghalen.
    if (box.contains(document.activeElement) && document.activeElement !== document.body) continue;
    // Wat nu iets doet eerst (besluit 140); verder de volgorde van het huis.
    const opslag = huisData?.opslag ?? {};
    const kaarten = [...klimaat().map(klimaatKaart), ...lijst.map(kaart), ...buffers.map(bufferKaart), ...(opslag.auto ? [ladingKaart('auto', opslag.auto)] : []), ...(opslag.batterij ? [ladingKaart('batterij', opslag.batterij)] : [])];
    const voor = kaarten.filter((k) => k.dataset.actief === 'true');
    const na = kaarten.filter((k) => k.dataset.actief !== 'true');
    box.replaceChildren(...voor, ...na, ...gevonden.map(nietOpZon), toevoegen());
  }
  // Van Thuis met #auto of #batterij: naar die kaart (besluit 182), één keer.
  const doel = location.hash.slice(1);
  if ((doel === 'auto' || doel === 'batterij') && !naarKaart) {
    const k = document.querySelector(`${app.telStand() ? '#tel' : '#wand'} [data-lading="${doel}"]`);
    if (k) {
      naarKaart = true;
      k.scrollIntoView({ block: 'center' });
    }
  }
}
let naarKaart = false;

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('apparaten');
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  teken();
});
