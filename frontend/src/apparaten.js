/*
 * Apparaten, in ontwerp 2 (besluit 104; schets Wand-Apparaten). Wat op zon kan
 * draaien: per apparaat wat het doet, een strook van de dag, en "klaar voor"
 * (besluit 101). De zinnen en de keuzes komen kant-en-klaar van de dienst
 * (besluit 94); de pagina zet ze neer en rekent alleen de resterende tijd uit.
 *
 * Eerlijk over wat er is (besluit 104): een batterij of een auto staat hier pas
 * als het huis er een heeft. De tijd kiezen gaat naar de dienst, nooit naar
 * Home Assistant.
 */
'use strict';

const { $$, nl, esc, klokVan, haal, deur } = app;

let state = null;
let vandaag = null;
let zon = null;
let aansluiting = null;
/** Het antwoord op de laatste keuze per apparaat, tot het volgende besluit het overneemt. */
const gezegd = new Map();

async function laadAlles() {
  const [s, v, z, a] = await Promise.allSettled([haal('api/state'), haal('api/vandaag'), haal('api/zon'), haal('api/aansluiting')]);
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

const duurTekst = (min) => (min >= 60 ? `${Math.floor(min / 60)}u${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(min))}m`);

/* ----------------------------------------------------------- de strook */

/** De strook van 06 tot 24 uur: wanneer hij draaide, en wanneer Smart Climate hem zou starten. */
function strook(spans, rest) {
  if (!vandaag) return '';
  const t0 = vandaag.vanMs + 6 * 3_600_000;
  const t1 = vandaag.vanMs + 24 * 3_600_000;
  const pct = (t) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
  const blok = (van, tot, stijl) => {
    const l = pct(van);
    const w = Math.max(1.2, pct(tot) - l);
    return `<i style="left: ${l.toFixed(2)}%; width: ${w.toFixed(2)}%; ${stijl}"></i>`;
  };
  const delen = [
    ...(spans?.zouStarten ?? []).map((s) => blok(s.vanMs, s.totMs, 'background: var(--zon); opacity: 0.35')),
    ...(spans?.draaide ?? []).map((s) => blok(s.vanMs, s.totMs, 'background: var(--zon)')),
    rest ? blok(rest.van, rest.tot, 'background: repeating-linear-gradient(45deg, rgba(247,181,72,0.6) 0 3px, transparent 3px 6px)') : '',
  ].join('');
  return `<div><div class="strook">${delen}<span class="nu" style="left: ${pct(Date.now()).toFixed(2)}%"></span></div><div class="uren"><span>06</span><span>12</span><span>18</span><span>24</span></div></div>`;
}

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
  return { start: laatste.vanMs, klaar: d.duurMin ? laatste.vanMs + d.duurMin * 60_000 : null };
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
  if (d.stand === 'running') {
    toon = 'zon-t';
    if (start != null && d.duurMin) {
      const gelopen = (nu - start) / 60_000;
      const over = Math.max(0, d.duurMin - gelopen);
      const klaar = start + d.duurMin * 60_000;
      boven = ring({ deel: Math.min(1, gelopen / d.duurMin), tekst: duurTekst(over), label: `${d.naam}, nog ${Math.round(over)} minuten` });
      toon = 'zon-t';
      zin = `Begon ${klokVan(start)}.${zouOm != null && zouOm < start ? ` Smart Climate zou hem om ${klokVan(zouOm)} gestart hebben, met zon over.` : ''}`;
      rest = over > 0 ? { van: nu, tot: klaar } : null;
      d = { ...d, kop: `${d.kop}, klaar rond ${klokVan(klaar)}` };
    } else {
      boven = ring({ deel: 1, label: `${d.naam} draait` });
    }
  } else if (d.stand === 'would_start') {
    toon = 'zon-t';
    boven = ring({ gestippeld: true, binnen: true, deel: 0.08 });
  } else if (d.stand === 'waiting') {
    boven = ring({ gestippeld: true, binnen: true });
  } else {
    boven = ring({ gestippeld: true });
  }
  const leeg = d.stand === 'not_ready' || d.stand === 'unknown';
  const metStrook = (spans?.draaide?.length || spans?.zouStarten?.length || rest) && !leeg;

  const el = document.createElement('section');
  el.className = `glas app${leeg ? ' niet' : ''}`;
  el.innerHTML = `
    <div class="boven">${boven}<div><b>${esc(d.naam)}</b><span class="klein ${toon}">${esc(d.kop)}</span></div></div>
    ${metStrook ? strook(spans, rest) : ''}
    <p class="mini zin">${esc(zin)}</p>`;

  if (d.kanKiezen) {
    const opties = [{ tekst: 'Geen haast', waarde: null }, ...d.keuzes];
    const blok = document.createElement('div');
    blok.innerHTML = `<div class="mini" style="margin-bottom: 6px">Klaar voor</div><div class="keuze" role="group" aria-label="Klaar voor, ${esc(d.naam)}"></div><p class="mini gezegd" aria-live="polite" style="margin: 8px 0 0">${esc(gezegd.get(d.id) ?? '')}</p>`;
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
  antwoord.textContent = 'Even…';
  try {
    const res = await deur('api/uitstel', { id: d.id, klaarVoor: optie.waarde });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    const tekst = !res.ok
      ? uit.fout ?? 'Niet gelukt.'
      : optie.waarde
        ? `Genoteerd: klaar voor ${optie.tekst}.`
        : `Geen haast: hij begint op zon${d.uiterlijk ? `, en uiterlijk om ${d.uiterlijk}` : ''}.`;
    if (res.ok) [...groep.children].forEach((b) => b.setAttribute('aria-pressed', String(b === knop)));
    gezegd.set(d.id, tekst);
    antwoord.textContent = tekst;
  } catch {
    antwoord.textContent = 'Geen verbinding met Smart Climate.';
  }
}

/** Een apparaat dat de dienst vond maar dat (nog) niet op zon staat. */
function nietOpZon(a) {
  const el = document.createElement('a');
  el.className = 'glas app niet';
  el.href = 'nieuw.html#aansluiting';
  el.innerHTML = `
    <div class="boven">${ring({ gestippeld: true })}<div><b>${esc(a.naam)}</b><span class="klein">Niet op zon</span></div></div>
    <p class="mini zin">Zet hem op zon bij Zon en aansluiting. Dan wacht hij op zonnestroom als hij klaarstaat.</p>`;
  return el;
}

function toevoegen() {
  const el = document.createElement('a');
  el.className = 'glas app niet';
  el.href = 'nieuw.html#aansluiting';
  el.innerHTML = `
    <div class="boven"><svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 20v24M20 32h24" stroke="#7F8E9C" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="4 6"/></svg><div><b>Apparaat toevoegen</b><span class="klein">Wasmachine, vaatwasser, boiler</span></div></div>
    <p class="mini zin">Alles wat Home Assistant op afstand kan starten en kan wachten op zon. Kies het bij Zon en aansluiting.</p>`;
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
    kop = 'Geen zon';
    onder = 'De panelen leveren nu niets';
  } else if (overKw < 0.05) {
    kop = 'Geen zon over';
    onder = `${nl(zonKw)} kW zon gaat naar het huis`;
  } else {
    kop = `${nl(overKw)} kW over`;
    onder = `van ${nl(zonKw)} kW zon${(s.aircoKw ?? 0) > 0.05 ? ", na de airco's" : ''}`;
  }
  $$('[data-zonchip]').forEach((el) => (el.innerHTML = `${zonKw < 0.05 ? MAAN : ZON}<div><div class="kop-3">${esc(kop)}</div><div class="mini">${esc(onder)}</div></div>`));
}

/** Waar de zon nu heen gaat: airco's, de rest van het huis, terug naar het net. */
function tekenVerdeling() {
  const s = state?.bewoner?.stromen ?? {};
  const delen = [
    ["De airco's", s.aircoKw ?? 0, 'var(--ijs)'],
    ['De rest van het huis', s.huisKw ?? 0, '#B8C4CF'],
    ['Terug naar het net', Math.max(0, -(s.netKw ?? 0)), 'var(--mint)'],
  ].filter(([, kw]) => kw >= 0.05);
  const totaal = delen.reduce((t, [, kw]) => t + kw, 0);
  const vanNet = Math.max(0, s.netKw ?? 0);
  const titel = (s.zonKw ?? 0) >= 0.05 ? 'Waar de stroom nu heen gaat' : 'Wat het huis nu gebruikt';
  const balk = totaal > 0 ? delen.map(([, kw, kleur]) => `<i style="width: ${((kw / totaal) * 100).toFixed(1)}%; background: ${kleur}"></i>`).join('') : '';
  const legenda = [
    ...delen.map(([naam, kw, kleur]) => `<span><span class="stip" style="background: ${kleur}"></span>${esc(naam)} <b>${nl(kw)} kW</b></span>`),
    vanNet >= 0.05 ? `<span><span class="stip" style="background: var(--gloed)"></span>Van het net <b>${nl(vanNet)} kW</b></span>` : '',
  ].join('');
  $$('[data-verdeling]').forEach((el) => (el.innerHTML = `<h2 class="kop-3">${titel}</h2><div class="balkje" aria-hidden="true">${balk}</div><div class="legenda">${legenda}</div>`));
}

/* ---------------------------------------------- de dag van de apparaten */

const NAAM = (id) => state?.bewoner?.apparaten?.find((a) => a.actuatorId === id)?.naam ?? state?.bewoner?.uitstelbaar?.find((d) => d.id === id)?.naam ?? String(id).replace(/^ac-/, 'Airco ').replace(/[-_]+/g, ' ');

/**
 * De zon van vandaag met daaronder per apparaat wanneer het draaide, en licht
 * wanneer Smart Climate het zou doen. Zo is te zien of het op zon gebeurde.
 */
function tekenDag() {
  const kw = vandaag?.kwartieren ?? [];
  const banen = [
    ...(vandaag?.uitstelbaar ?? []).map((u) => {
      const d = state?.bewoner?.uitstelbaar?.find((x) => x.id === u.id);
      const loop = d ? looptijd(d) : null;
      return { naam: NAAM(u.id), echt: u.draaide, zou: u.zouStarten, rest: loop?.klaar && loop.klaar > Date.now() ? { vanMs: Date.now(), totMs: loop.klaar } : null, kleur: '#F7B548' };
    }),
    ...(vandaag?.apparaten ?? []).filter((a) => a.huidig.length || a.smartClimate.length).map((a) => ({ naam: NAAM(a.actuatorId), echt: a.huidig, zou: a.smartClimate, kleur: '#6FD3FF' })),
  ];
  for (const box of $$('[data-dag]')) {
    const tel = box.closest('#tel') != null;
    if (!kw.length) {
      box.innerHTML = `<h2 class="kop-3">Vandaag</h2><p class="mini" style="margin: 6px 0 0">Nog geen metingen van vandaag.</p>`;
      continue;
    }
    const B = tel ? 326 : 1150;
    const links = tel ? 0 : 150;
    const baan = tel ? 30 : 24;
    // Op de wand vult de dag de ruimte die de rest overlaat: 800 hoog, min de
    // kop, de kaarten, de verdeling, de tussenruimtes en de randen van main.
    const main = box.parentElement;
    const anderen = [...main.children].filter((c) => c !== box).reduce((t, c) => t + c.offsetHeight, 0);
    const ruimte = tel ? 0 : 800 - 42 - anderen - 16 * (main.children.length - 1);
    const vrij = ruimte - 28 - 40 - banen.length * baan - 52;
    const zonH = tel ? 70 : Math.max(70, Math.min(200, vrij));
    const t0 = vandaag.vanMs + 6 * 3_600_000;
    const t1 = vandaag.vanMs + 24 * 3_600_000;
    const x = (t) => links + Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) * (B - links);
    const max = Math.max(1500, ...kw.map((q) => q.zonW ?? 0), ...(zon?.kwartieren ?? []).map((q) => q.heldereLuchtW ?? 0));
    const y = (w) => 8 + zonH - (w / max) * zonH;
    const binnen = kw.filter((q) => q.tMs >= t0 - 15 * 60_000);
    const lijn = binnen.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.zonW ?? 0).toFixed(1)}`).join(' ');
    const vlak = binnen.length ? `${lijn} L ${x(binnen[binnen.length - 1].tMs).toFixed(1)} ${y(0)} L ${x(binnen[0].tMs).toFixed(1)} ${y(0)} Z` : '';
    const helder = (zon?.kwartieren ?? []).filter((q) => q.tMs >= t0).map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.heldereLuchtW ?? 0).toFixed(1)}`).join(' ');
    const top = y(0) + 14;
    const rijen = banen
      .map((b, i) => {
        const yy = top + i * baan + (tel ? 16 : 0);
        const blok = (s, licht) => `<rect x="${x(s.vanMs).toFixed(1)}" y="${yy}" width="${Math.max(3, x(s.totMs) - x(s.vanMs)).toFixed(1)}" height="10" rx="5" fill="${b.kleur}" ${licht ? 'opacity="0.32"' : ''}/>`;
        const naam = tel ? `<text x="0" y="${yy - 5}">${esc(b.naam)}</text>` : `<text x="0" y="${yy + 9}">${esc(b.naam)}</text>`;
        const rest = b.rest ? `<rect x="${x(b.rest.vanMs).toFixed(1)}" y="${yy}" width="${Math.max(3, x(b.rest.totMs) - x(b.rest.vanMs)).toFixed(1)}" height="10" rx="5" fill="url(#dagrest)"/>` : '';
        return `${naam}<rect x="${links}" y="${yy}" width="${B - links}" height="10" rx="5" fill="rgba(255,255,255,0.05)"/>${b.zou.map((s) => blok(s, true)).join('')}${b.echt.map((s) => blok(s, false)).join('')}${rest}`;
      })
      .join('');
    const hoog = top + banen.length * baan + (tel ? 16 : 0) + 18;
    const uren = [6, 9, 12, 15, 18, 21, 24].filter((u) => !tel || u % 6 === 0).map((u) => `<text x="${x(vandaag.vanMs + u * 3_600_000).toFixed(1)}" y="${hoog - 4}" text-anchor="${u === 24 ? 'end' : u === 6 ? 'start' : 'middle'}">${String(u).padStart(2, '0')}</text>`).join('');
    const nuX = x(Date.now());
    box.innerHTML = `
      <div class="dagkop"><h2 class="kop-3">Vandaag</h2><span class="mini legenda-dag"><span><i class="vlak"></i>draaide</span><span><i class="vlak zou"></i>zou Smart Climate doen</span><span><i class="streep"></i>zon bij heldere lucht</span></span></div>
      <svg viewBox="0 0 ${B} ${hoog}" width="100%" role="img" aria-label="De zon van vandaag, en wanneer de apparaten draaiden">
        <defs><linearGradient id="dagzon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.5"/><stop offset="1" stop-color="#F7B548" stop-opacity="0.02"/></linearGradient><pattern id="dagrest" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#F7B548" opacity="0.6"/></pattern></defs>
        ${helder ? `<path d="${helder}" fill="none" stroke="#F7B548" stroke-opacity="0.4" stroke-dasharray="2 4"/>` : ''}
        ${vlak ? `<path d="${vlak}" fill="url(#dagzon)"/><path d="${lijn}" fill="none" stroke="#F7B548" stroke-width="2"/>` : ''}
        ${tel ? '' : `<text x="0" y="${y(0) - 4}" class="as">Zon</text>`}
        <line x1="${nuX}" y1="4" x2="${nuX}" y2="${hoog - 16}" stroke="#EEF3F7" stroke-opacity="0.55"/>
        <g font-family="Figtree" font-size="${tel ? 12 : 13}" fill="#B8C4CF">${rijen}</g>
        <g font-family="Figtree" font-size="11" fill="#7F8E9C">${uren}</g>
      </svg>`;
  }
}

/* ------------------------------------------------------------ tekenen */

function teken() {
  app.schaal();
  if (!state) return;
  app.luchtVan(zon, state.bewoner?.stromen?.zonKw ?? 0);
  tekenZonchip();
  tekenVerdeling();

  const lijst = state.bewoner?.uitstelbaar ?? [];
  const opZon = new Set(lijst.map((d) => d.id));
  const gevonden = (aansluiting?.gevonden?.apparaten ?? []).filter((a) => !opZon.has(a.id));
  for (const box of $$('[data-apparaten]')) {
    // Een knop met focus niet onder de vinger weghalen.
    if (box.contains(document.activeElement) && document.activeElement !== document.body) continue;
    box.replaceChildren(...lijst.map(kaart), ...gevonden.map(nietOpZon), toevoegen());
    box.classList.toggle('vol', box.childElementCount > 3);
  }
  // Na de kaarten: op de wand krijgt de dag de ruimte die zij overlaten.
  tekenDag();
}

/* -------------------------------------------------------------- starten */

app.start('apparaten');
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  teken();
});
