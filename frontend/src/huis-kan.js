/*
 * Wat je huis kan (besluit 130, schets Wand-Huis-kan). Alles wat Smart Climate
 * voor je doet, per onderwerp, en hoe het ervoor staat: werkt, kijkt mee, leert
 * nog, staat uit, vul in, of wat er nodig is. Links het huis met aanwijzers, en
 * wat er het meeste bij zou opleveren, gerekend met je eigen meters. Een tik
 * opent het blad: wat het is, wat het nu doet, hoe het werkt en wanneer.
 * Wat er staat, rekent stand.js uit; deze pagina zet het neer.
 */
'use strict';

const { $$, esc, haal } = app;

const d = { site: null, huis: null, functies: null, energie: null, aansluiting: null, state: null, divergence: null, opbrengst: null, zon: null };
/** Laat alleen deze stand zien, of alles. */
let filter = null;

async function laadAlles() {
  const deuren = { site: 'api/site', huis: 'api/huis', functies: 'api/functies', energie: 'api/energie', aansluiting: 'api/aansluiting', state: 'api/state', divergence: 'api/divergence', opbrengst: 'api/opbrengst?soort=maand', zon: 'api/zon' };
  const r = await Promise.allSettled(Object.values(deuren).map((p) => haal(p)));
  Object.keys(deuren).forEach((k, i) => {
    if (r[i].status === 'fulfilled') d[k] = r[i].value;
  });
  teken();
}

const GROEPEN = [['comfort', 'Comfort'], ['zon', 'Zon en kosten'], ['gemak', 'Gemak'], ['overzicht', 'Overzicht']];
const STANDEN = [['werkt', 'Werkt'], ['kijkt', 'Kijkt mee'], ['leert', 'Leert nog'], ['mis', 'Vul in'], ['uit', 'Staat uit'], ['nodig', 'Iets nodig']];
const STIP = { werkt: 'var(--mint)', kijkt: 'var(--ijs)', leert: 'var(--ijs)', mis: 'var(--gloed)', uit: 'var(--gedempt)', nodig: 'transparent; box-shadow: inset 0 0 0 1.5px var(--zon)' };
const gekozen = () => decodeURIComponent(location.hash.slice(1));

/* ------------------------------------------------------------ tekenen */

function legenda(lijst) {
  return STANDEN.map(([s, t]) => {
    const n = lijst.filter((x) => x.stand === s).length;
    return n ? `<button type="button" data-filter="${s}" aria-pressed="${filter === s}"><span class="stip" style="background: ${STIP[s]}"></span>${esc(t)} <b>${n}</b></button>` : '';
  }).join('');
}

function vakken(lijst) {
  return GROEPEN.map(([g, titel]) => {
    const rijen = lijst.filter((x) => x.groep === g).map((x) => `<button type="button" class="regel${gekozen() === x.id ? ' gekozen' : ''}${filter && x.stand !== filter ? ' weg' : ''}" data-open="${x.id}"><div><b>${esc(x.titel)}</b><span class="nu${x.let ? ' let' : ''}">${esc(x.nu)}</span></div><span class="stand ${x.stand}">${esc(x.label)}</span></button>`).join('');
    return `<div class="glas vak"><h3>${esc(titel)}</h3>${rijen}</div>`;
  }).join('');
}

/**
 * Haal er meer uit (besluit 132): de drie beste ideeën, de grootste winst
 * eerst. Een bedrag alleen als je meters het uitrekenen; anders wat het doet.
 */
function meer() {
  const lijst = stand.ideeen(d).slice(0, 3);
  if (!lijst.length) return '';
  const regel = (x) => `<a class="idee" href="${x.id === 'batterij' ? '#batterij' : x.href}"${x.id === 'batterij' ? ' data-open="batterij"' : ''}><div><b>${esc(x.titel)}</b><span>${esc(x.zin)}</span></div><div class="wint${x.euro != null ? '' : ' zacht'}">${x.euro != null ? `± € ${x.euro}<small>${esc(x.wint)}</small>` : esc(x.wint)}</div></a>`;
  return `<div class="glas meer"><span class="wanneer">Haal er meer uit</span>${lijst.map(regel).join('')}</div>`;
}

function blad(x) {
  const som = x.som
    ? `<div class="som"><h4>Wat het jou zou opleveren</h4><div class="getal">± € ${x.som.euro} <small>per maand, vanaf 2027</small></div>
        <p class="mini" style="margin: 8px 0 0">In ${esc(x.som.maand)} ging er ${x.som.terugKwh} kWh naar het net. Een batterij had daarvan zo'n ${x.som.kwh} kWh 's avonds zelf gebruikt. Zolang er gesaldeerd wordt, levert dat nog weinig op. Een schatting uit je eigen cijfers, geen belofte.</p></div>`
    : '';
  // Wat er nodig is, koop je zelf; dan is er geen knop, behalve naar wat het nu oplevert.
  const ga = x.stand === 'mis' ? 'Invullen' : x.stand === 'uit' ? 'Aanzetten' : x.stand === 'nodig' ? (x.som ? 'Naar Opbrengst' : null) : 'Bekijken';
  // Waar het werkt (besluit 132): per kamer, en wat er nog kan als idee, niet als tekort.
  const waar = x.waar?.length
    ? `<div><h4>Waar het werkt</h4><div class="waar">${x.waar.map((k) => `<div class="kamerkaart"><b>${esc(k.naam)}</b><span>${esc(k.wat)}</span></div>`).join('')}</div></div>`
    : `<div class="nu"><span class="stand ${x.stand}">Nu</span>${esc(x.nu)}</div>`;
  const idee = x.idee ? `<a class="kanook" href="${x.idee.href}"><span class="wanneer">Idee</span><b>${esc(x.idee.titel)}</b><p>${esc(x.idee.zin)}, ${esc(x.idee.wint)}.</p><span class="knop">${x.idee.soort === 'aan' ? 'Zet aan' : 'Bekijk'}</span></a>` : '';
  return `<div class="bovenaan"><div><span class="stand ${x.stand}">${esc(x.label)}</span><h2 class="kop-2" style="margin-top: 10px">${esc(x.titel)}</h2><p class="lead" style="margin-top: 4px; max-width: 52ch">${esc(x.wat)}</p>${x.extra ? `<p class="mini" style="margin: 6px 0 0">${esc(x.extra)}</p>` : ''}</div><button type="button" class="sluit" data-sluit aria-label="Sluiten">×</button></div>
    ${waar}
    ${idee}
    ${som}
    <div class="twee"><div><h4>Zo werkt het</h4><ul class="lijst">${x.zo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div><div><h4>Wanneer het werkt</h4><ul class="lijst">${x.wanneer.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>
    ${ga ? `<div class="onder"><a href="${x.href}">${ga}</a></div>` : ''}`;
}

/** Het huis, met aanwijzers naar wat het doet en wat erbij kan. */
function huisModel(lijst) {
  const per = (id) => lijst.find((x) => x.id === id);
  // De tekening uit huismodel, net als op Thuis (5S).
  const t = huismodel.tekening(d.huis, { zon: d.zon, kamer: (r) => ({ ...huismodel.kamerModel(r, d.state), stil: true, temp: null, zin: null }) });
  const { etages } = t;
  const piekW = t.piekW;
  const KORT = { opzon: 'Op zon', temperatuur: 'Comfort', batterij: 'Batterij', auto: 'Auto op zon' };
  const label = (bij, id, dx, dy) => {
    const x = per(id);
    return x ? { bij, titel: KORT[id] ?? x.titel, toon: { werkt: 'mint', kijkt: 'ijs', leert: 'ijs', mis: 'gloed', uit: 'zacht', nodig: 'zon' }[x.stand], regels: [x.label.toLowerCase()], dx, dy } : null;
  };
  const kamer = etages[0]?.kamers?.[0]?.naam;
  return {
    beschrijving: 'Het huis, met wat Smart Climate erin doet.',
    tijd: 'dag',
    zon: { stand: 0.62, hoogte: 0.8, aandeel: 0.6, panelen: t.panelen },
    voordeur: t.voordeur,
    wolken: 0.2,
    etages,
    buitenunit: per('opzon') ? { aan: false } : null,
    net: true,
    spook: ['batterij', 'auto'],
    labels: [
      piekW > 0 ? label('panelen', 'opzon', -120, -90) : null,
      kamer ? label(`kamer:${kamer}`, 'temperatuur', -40, 96) : null,
      label('batterij', 'batterij', -26, 84),
      label('auto', 'auto', -8, -70),
    ].filter(Boolean),
  };
}

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const lijst = stand.kan(d);
  $$('[data-legenda]').forEach((el) => (el.innerHTML = legenda(lijst)));
  $$('[data-vakken]').forEach((el) => (el.innerHTML = vakken(lijst)));
  $$('[data-meer]').forEach((el) => (el.innerHTML = meer()));
  const x = lijst.find((y) => y.id === gekozen());
  $$('[data-blad]').forEach((el) => {
    el.hidden = !x;
    if (x) el.innerHTML = blad(x);
  });
  $$('[data-achter]').forEach((el) => (el.hidden = !x));
  if (!d.huis) return;
  const tel = app.telStand();
  const podium = document.getElementById(tel ? 'podium-tel' : 'podium-wand');
  // Op de telefoon zonder aanwijzers: daar is het huis te smal voor kaartjes ernaast.
  const model = huisModel(lijst);
  if (tel) model.labels = [];
  huis.teken(podium, model, { breedte: podium.clientWidth || 440, hoogte: tel ? 300 : podium.clientHeight || 470, marge: tel ? 0.03 : 0.08, schuifX: tel ? 0 : 14, schuifY: 0 });
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  const f = e.target.closest('[data-filter]');
  if (open) location.hash = open.dataset.open;
  else if (e.target.closest('[data-sluit], [data-achter]')) history.replaceState(null, '', location.pathname), teken();
  else if (f) {
    filter = filter === f.dataset.filter ? null : f.dataset.filter;
    teken();
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gekozen()) {
    history.replaceState(null, '', location.pathname);
    teken();
  }
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
