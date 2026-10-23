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

const d = { site: null, huis: null, functies: null, energie: null, aansluiting: null, state: null, divergence: null, opbrengst: null, zon: null, klaar: null };
/** Laat alleen deze stand zien, of alles. */
let filter = null;

async function laadAlles() {
  const deuren = { site: 'api/site', huis: 'api/huis', functies: 'api/functies', energie: 'api/energie', aansluiting: 'api/aansluiting', state: 'api/state', divergence: 'api/divergence', opbrengst: 'api/opbrengst?soort=maand', zon: 'api/zon', klaar: 'api/klaarzetten' };
  const r = await Promise.allSettled(Object.values(deuren).map((p) => haal(p)));
  Object.keys(deuren).forEach((k, i) => {
    if (r[i].status === 'fulfilled') d[k] = r[i].value;
  });
  teken();
}

/** Zes groepen (besluit 187): wat het huis eerst leert staat apart, en de kosten ook. */
const GROEPEN = ['comfort', 'leert', 'zon', 'kosten', 'gemak', 'overzicht'].map((g) => [g, t(`kan.groep.${g}`)]);
const STANDEN = ['werkt', 'kijkt', 'leert', 'mis', 'uit', 'nodig'].map((s) => [s, t(`kan.stand.${s}`)]);
const STIP = { werkt: 'var(--mint)', kijkt: 'var(--ijs)', leert: 'var(--ijs)', mis: 'var(--gloed)', uit: 'var(--gedempt)', nodig: 'transparent; box-shadow: inset 0 0 0 1.5px var(--zon)' };
const gekozen = () => decodeURIComponent(location.hash.slice(1));

/* ------------------------------------------------------------ tekenen */

function legenda(lijst) {
  return STANDEN.map(([s, naam]) => {
    const n = lijst.filter((x) => x.stand === s).length;
    return n ? `<button type="button" data-filter="${s}" aria-pressed="${filter === s}"><span class="stip" style="background: ${STIP[s]}"></span>${esc(naam)} <b>${n}</b></button>` : '';
  }).join('');
}

function vakken(lijst) {
  return GROEPEN.map(([g, titel]) => {
    const rijen = lijst.filter((x) => x.groep === g).map((x) => `<button type="button" class="regel${gekozen() === x.id ? ' gekozen' : ''}${filter && x.stand !== filter ? ' weg' : ''}" data-open="${x.id}"><div><b>${esc(x.titel)}</b><span class="nu${x.let ? ' let' : ''}">${esc(x.nu)}</span></div><span class="stand ${x.stand}">${esc(x.label)}</span></button>`).join('');
    return rijen ? `<div class="glas vak${g === 'leert' ? ' leren' : ''}"><h3>${esc(titel)}</h3>${rijen}</div>` : '';
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
  return `<div class="glas meer"><span class="wanneer">${esc(t('kan.meer'))}</span>${lijst.map(regel).join('')}</div>`;
}

function blad(x) {
  const som = x.som
    ? `<div class="som"><h4>${esc(t('kan.opleveren'))}</h4><div class="getal">± € ${x.som.euro} <small>${esc(t('kan.perMaand'))}</small></div>
        <p class="mini" style="margin: 8px 0 0">${esc(t('kan.somZin', { maand: x.som.maand, terug: x.som.terugKwh, kwh: x.som.kwh }))}</p></div>`
    : '';
  // Wat er nodig is, koop je zelf; dan is er geen knop, behalve naar wat het nu oplevert.
  const ga = x.stand === 'mis' ? t('kan.ga.mis') : x.stand === 'uit' ? t('kan.ga.uit') : x.stand === 'nodig' ? (x.som ? t('kan.ga.opbrengst') : null) : t('kan.ga.bekijken');
  // Waar het werkt (besluit 132): per kamer, en wat er nog kan als idee, niet als tekort.
  const waar = x.waar?.length
    ? `<div><h4>${esc(t('kan.waar'))}</h4><div class="waar">${x.waar.map((k) => `<div class="kamerkaart"><b>${esc(k.naam)}</b><span>${esc(k.wat)}</span></div>`).join('')}</div></div>`
    : `<div class="nu"><span class="stand ${x.stand}">${esc(t('kan.nu'))}</span>${esc(x.nu)}</div>`;
  const idee = x.idee ? `<a class="kanook" href="${x.idee.href}"><span class="wanneer">${esc(t('kan.idee'))}</span><b>${esc(x.idee.titel)}</b><p>${esc(x.idee.zin)}, ${esc(x.idee.wint)}.</p><span class="knop">${esc(t(x.idee.soort === 'aan' ? 'kan.zetAan' : 'kan.bekijk'))}</span></a>` : '';
  return `<div class="bovenaan"><div><span class="stand ${x.stand}">${esc(x.label)}</span><h2 class="kop-2" style="margin-top: 10px">${esc(x.titel)}</h2><p class="lead" style="margin-top: 4px; max-width: 52ch">${esc(x.wat)}</p>${x.extra ? `<p class="mini" style="margin: 6px 0 0">${esc(x.extra)}</p>` : ''}</div><button type="button" class="sluit" data-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    ${waar}
    ${idee}
    ${som}
    <div class="twee"><div><h4>${esc(t('kan.zoWerkt'))}</h4><ul class="lijst">${x.zo.map((z) => `<li>${esc(z)}</li>`).join('')}</ul></div><div><h4>${esc(t('kan.wanneerWerkt'))}</h4><ul class="lijst">${x.wanneer.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>
    ${ga ? `<div class="onder"><a href="${x.href}">${esc(ga)}</a></div>` : ''}`;
}

/*
 * Klaarzetten in Home Assistant (besluit 179): wat Smart Climate er gebruikt,
 * per groep, en of het er staat. Groen staat klaar, oranje mist voor de
 * regeling, grijs maakt een functie mogelijk. Een tik opent dat scherm van
 * Home Assistant; buiten Home Assistant staat erbij waar het is.
 */
const KLAAR_GROEPEN = ['basis', 'klimaat', 'energie', 'bewoners', 'gemak', 'praten', 'wand'].map((g) => [g, t(`kan.klaar.${g}`)]);
const KLAAR_STIP = { klaar: 'var(--mint)', mist: 'var(--gloed)', optioneel: 'var(--gedempt)' };
const klaarPunten = () => d.klaar?.punten ?? [];

function klaarKnop() {
  const punten = klaarPunten();
  if (!punten.length) return '';
  const mist = punten.filter((p) => p.stand === 'mist').length;
  return `<button type="button" class="klaarknop" data-open="klaarzetten"><span class="stip" style="background: ${mist ? 'var(--gloed)' : 'var(--mint)'}"></span>${esc(t('kan.klaar.inHA'))} <b>${esc(mist ? t('instellingen.mist', { n: mist }) : t('kan.klaar.klaar'))}</b></button>`;
}

function klaarBlad() {
  const punten = klaarPunten();
  const inHA = app.inHA();
  const regel = (p) => `<div class="klaarregel ${p.stand}"><span class="stip" style="background: ${KLAAR_STIP[p.stand]}"></span><div><b>${esc(p.titel)}</b><span>${esc(p.zin)}</span>${!inHA && p.waar && p.stand !== 'klaar' ? `<small>${esc(p.waar)}</small>` : ''}</div>${inHA && p.pad ? `<button type="button" class="knop" data-ha-pad="${esc(p.pad)}" aria-label="${esc(t('kan.klaar.openIn', { titel: p.titel }))}">${esc(t('kan.klaar.open'))}</button>` : ''}</div>`;
  const groepen = KLAAR_GROEPEN.map(([g, titel]) => {
    const hier = punten.filter((p) => p.groep === g);
    return hier.length ? `<div class="klaargroep"><h4>${esc(titel)}</h4>${hier.map(regel).join('')}</div>` : '';
  }).join('');
  return `<div class="bovenaan"><div><h2 class="kop-2">${esc(t('kan.klaar.kop'))}</h2><p class="lead" style="margin-top: 4px; max-width: 52ch">${esc(t('kan.klaar.lead'))}</p></div><button type="button" class="sluit" data-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    ${groepen}`;
}

/** Het huis, met aanwijzers naar wat het doet en wat erbij kan. */
function huisModel(lijst) {
  const per = (id) => lijst.find((x) => x.id === id);
  // De tekening uit huismodel, net als op Thuis (5S).
  const tek = huismodel.tekening(d.huis, { zon: d.zon, kelderOnder: true, kamer: (r) => ({ ...huismodel.kamerModel(r, d.state), stil: true, temp: null, zin: null }) });
  const { etages } = tek;
  const piekW = tek.piekW;
  const label = (bij, id, dx, dy) => {
    const x = per(id);
    return x ? { bij, titel: t(`kan.kort.${id}`), toon: { werkt: 'mint', kijkt: 'ijs', leert: 'ijs', mis: 'gloed', uit: 'zacht', nodig: 'zon' }[x.stand], regels: [x.label.toLowerCase()], dx, dy } : null;
  };
  const kamer = etages[0]?.kamers?.[0]?.naam;
  return {
    beschrijving: t('kan.beschrijving'),
    tijd: 'dag',
    zon: { stand: 0.62, hoogte: 0.8, aandeel: 0.6, ...huismodel.panelenOpDak(d.aansluiting?.antwoorden?.panelen, piekW) },
    voordeur: tek.voordeur,
    wolken: 0.2,
    etages,
    // Huis 3.0 (besluit 187): de kelder, de tuin met de jacuzzi en de garage erbij.
    ...(tek.kelder ? { kelder: tek.kelder } : {}),
    tuin: tek.tuin,
    garage: tek.garage,
    oprit: tek.oprit,
    buitenunit: per('opzon') ? { aan: false } : null,
    net: true,
    spook: ['batterij', 'auto'],
    labels: [
      piekW > 0 ? label('panelen', per('ligging') ? 'ligging' : 'opzon', 40, -60) : null,
      label('boiler', 'boiler', -60, 70),
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
  $$('[data-klaarknop]').forEach((el) => (el.innerHTML = klaarKnop()));
  const klaarOpen = gekozen() === 'klaarzetten' && klaarPunten().length > 0;
  const x = klaarOpen ? null : lijst.find((y) => y.id === gekozen());
  $$('[data-blad]').forEach((el) => {
    el.hidden = !x && !klaarOpen;
    if (klaarOpen) el.innerHTML = klaarBlad();
    else if (x) el.innerHTML = blad(x);
  });
  $$('[data-achter]').forEach((el) => (el.hidden = !x && !klaarOpen));
  if (!d.huis) return;
  const tel = app.telStand();
  const podium = document.getElementById(tel ? 'podium-tel' : 'podium-wand');
  // Op de telefoon zonder aanwijzers: daar is het huis te smal voor kaartjes ernaast.
  const model = huisModel(lijst);
  if (tel) model.labels = [];
  huis.teken(podium, model, { breedte: podium.clientWidth || 440, hoogte: tel ? 300 : podium.clientHeight || 470, marge: tel ? 0.03 : 0.04, schuifY: tel ? 0 : 20, wereld: true, eigenLucht: false });
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
  const ha = e.target.closest('[data-ha-pad]');
  if (ha) app.naarHAScherm(ha.dataset.haPad);
  else if (open) location.hash = open.dataset.open;
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
