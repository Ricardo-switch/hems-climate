/*
 * Meters en prijzen, in ontwerp 2 (besluiten 102 en 104). Overnemen uit het
 * Energie-dashboard van Home Assistant, of zelf kiezen uit de meters die Home
 * Assistant bijhoudt, en de prijzen. Opbrengst rekent ermee. Bewaren vraagt
 * een beheerder.
 */
'use strict';

const { $$, esc, haal, deur } = app;

let info = null;
let concept = null;
let zon = null;
let melding = '';
let meldingFout = false;

const leeg = () => ({ versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } });

async function laad() {
  const [e, z] = await Promise.allSettled([haal('api/energie'), haal('api/zon')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (e.status === 'fulfilled') {
    info = e.value;
    concept = JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel ?? leeg()));
  } else {
    zeg('Niet beschikbaar: geen verbinding met Smart Climate, of Home Assistant is nog niet gelezen.', true);
  }
  teken();
}

function zeg(tekst, fout = false) {
  melding = tekst;
  meldingFout = fout;
  $$('[data-melding]').forEach((el) => {
    el.textContent = tekst;
    el.classList.toggle('fout', fout);
  });
}

const naamVan = (id) => info?.meters?.find((m) => m.id === id)?.naam ?? id;

/* ------------------------------------------------------------ tekenen */

function uitHa() {
  const v = info.voorstel;
  if (!v) return `<section class="glas vraag"><h2 class="kop-3">Uit Home Assistant</h2><p class="uitleg">${esc(info.fout ?? 'Het Energie-dashboard van Home Assistant is niet ingericht. Kies hiernaast zelf je meters.')}</p></section>`;
  const wat = [
    v.net.afname.length ? `${v.net.afname.length === 1 ? 'een meter' : `${v.net.afname.length} meters`} van het net` : null,
    v.net.teruglevering.length ? 'teruglevering' : null,
    v.zon.length ? 'zonnepanelen' : null,
    v.gas ? 'gas' : null,
    v.apparaten.length ? `${v.apparaten.length} apparaten` : null,
  ].filter(Boolean);
  const dp = info.dashboardPrijzen ?? [];
  const zonderPrijs = v.prijzen.stroom == null && v.prijzen.gas == null;
  const waarom = !zonderPrijs
    ? ''
    : dp.some((x) => x.kostenIsMeter)
      ? ' Bij de kosten staat de meter zelf als kostensensor, zodat Home Assistant elke kWh en m³ als een euro telt. Vul je prijzen hier in; in Home Assistant pas je het aan bij Energie.'
      : dp.some((x) => x.kostenMeter)
        ? ' Het houdt de kosten bij met een eigen kostensensor; die prijs is niet over te nemen. Vul hem hier in.'
        : dp.some((x) => x.prijsEntiteit)
          ? ' De prijs komt uit een entiteit die nu geen getal heeft. Vul hem hier in.'
          : ' Er staan geen prijzen in. Vul ze hier in.';
  return `<section class="glas vraag">
    <h2 class="kop-3">Uit Home Assistant</h2>
    <p class="uitleg">Je Energie-dashboard heeft ${esc(wat.join(', ') || 'nog niets')}${zonderPrijs ? '' : ', met prijzen'}.${esc(waarom)}</p>
    <button type="button" class="knop" data-overnemen style="align-self: start">Overnemen</button>
  </section>`;
}

function prijzen() {
  const p = concept.prijzen;
  const veld = (label, sleutel, hint) => `<label class="veldnaam">${esc(label)}<input class="invoer" type="number" inputmode="decimal" step="0.001" min="0" data-prijs="${sleutel}" value="${p[sleutel] ?? ''}" placeholder="${esc(hint)}"></label>`;
  return `<section class="glas vraag">
    <h2 class="kop-3">Prijzen</h2>
    <div class="twee">${veld('Stroom, € per kWh', 'stroom', '0,25')}${veld('Teruglevering, € per kWh', 'teruglevering', 'leeg: gesaldeerd')}${veld('Gas, € per m³', 'gas', '1,30')}${veld('Vaste kosten, € per maand', 'vastPerMaand', '')}</div>
    <p class="mini">Zonder vergoeding voor teruglevering rekent Opbrengst met de stroomprijs: tot 2027 wordt er gesaldeerd.</p>
  </section>`;
}

/** Alles wat al een rol heeft, staat niet nog eens in een andere lijst. */
function inGebruik() {
  return new Set([...concept.net.afname, ...concept.net.teruglevering, ...concept.zon, ...(concept.gas ? [concept.gas] : []), ...concept.apparaten.map((a) => a.id)]);
}

/**
 * Een keuzelijst met eerst de meters die bij deze rol passen (de dienst raadt
 * de rol), en daaronder de andere van dezelfde soort, voor als het raden misgaat.
 */
function meterKeuze(label, plek, rol, soort) {
  const bezet = inGebruik();
  const vrij = (info.meters ?? []).filter((m) => m.soort === soort && !bezet.has(m.id));
  if (!vrij.length) return '';
  const past = vrij.filter((m) => m.rol === rol);
  const rest = vrij.filter((m) => m.rol !== rol);
  const opt = (m) => `<option value="${esc(m.id)}">${esc(m.naam)}</option>`;
  const lijst = past.length && rest.length ? `<optgroup label="Past hierbij">${past.map(opt).join('')}</optgroup><optgroup label="Andere meters">${rest.map(opt).join('')}</optgroup>` : vrij.map(opt).join('');
  return `<select class="invoer" aria-label="${esc(label)}" data-meer="${plek}"><option value="">Meter erbij…</option>${lijst}</select>`;
}

function rol(titel, plek, ids, rolNaam, soort, een = false) {
  const chips = ids.length ? ids.map((id) => `<button type="button" data-weg="${plek}" data-id="${esc(id)}" aria-label="${esc(naamVan(id))} weghalen">${esc(naamVan(id))}<span aria-hidden="true">×</span></button>`).join('') : '<span class="mini">geen</span>';
  return `<div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 0">
    <b style="font-size: 14px">${esc(titel)}</b>
    <div class="meterchips">${chips}</div>
    ${!een || !ids.length ? meterKeuze(`${titel}: meter erbij`, plek, rolNaam, soort) : ''}
  </div>`;
}

function meters() {
  const c = concept;
  return `<section class="glas vraag">
    <h2 class="kop-3">Meters</h2>
    ${rol('Stroom van het net', 'afname', c.net.afname, 'afname', 'energy')}
    ${rol('Teruglevering', 'teruglevering', c.net.teruglevering, 'teruglevering', 'energy')}
    ${rol('Zonnepanelen', 'zon', c.zon, 'zon', 'energy')}
    ${rol('Gas', 'gas', c.gas ? [c.gas] : [], 'gas', 'volume', true)}
  </section>`;
}

function apparaten() {
  const rijen = concept.apparaten
    .map((a, i) => `<div class="regelrij"><div class="l"><input class="invoer" data-apparaatnaam="${i}" value="${esc(a.naam)}" maxlength="40" aria-label="Naam van ${esc(naamVan(a.id))}"><span>${esc(naamVan(a.id))}</span></div><button type="button" class="knop" data-apparaat-weg="${i}" aria-label="${esc(a.naam)} weghalen">Weg</button></div>`)
    .join('');
  return `<section class="glas vraag">
    <h2 class="kop-3">Apparaten met een eigen meter</h2>
    ${rijen || '<p class="uitleg">Nog geen. Een apparaat met een eigen meter staat in Opbrengst apart.</p>'}
    ${meterKeuze('Apparaat erbij', 'apparaat', 'apparaat', 'energy').replace('Meter erbij…', 'Apparaat erbij…')}
  </section>`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  if (document.activeElement?.matches('input')) return;
  const kolommen = { 1: uitHa() + prijzen(), 2: meters(), 3: apparaten() };
  $$('[data-kolom]').forEach((el) => (el.innerHTML = kolommen[el.dataset.kolom]));
  if (melding) zeg(melding, meldingFout);
}

/* ------------------------------------------------------------ doen */

function zet(plek, ids) {
  if (plek === 'afname') concept.net.afname = ids;
  else if (plek === 'teruglevering') concept.net.teruglevering = ids;
  else if (plek === 'zon') concept.zon = ids;
  else if (plek === 'gas') concept.gas = ids[0] ?? null;
}
function lees(plek) {
  if (plek === 'afname') return concept.net.afname;
  if (plek === 'teruglevering') return concept.net.teruglevering;
  if (plek === 'zon') return concept.zon;
  return concept.gas ? [concept.gas] : [];
}

document.addEventListener('click', async (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  if (knop.dataset.weg) {
    zet(knop.dataset.weg, lees(knop.dataset.weg).filter((x) => x !== knop.dataset.id));
    zeg('Nog niet bewaard.');
    teken();
  } else if (knop.dataset.apparaatWeg != null) {
    concept.apparaten.splice(Number(knop.dataset.apparaatWeg), 1);
    zeg('Nog niet bewaard.');
    teken();
  } else if (knop.hasAttribute('data-overnemen')) {
    concept = JSON.parse(JSON.stringify(info.voorstel));
    zeg('Overgenomen. Kijk het na en bewaar.');
    teken();
  } else if (knop.hasAttribute('data-opslaan')) {
    await bewaar();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (!concept) return;
  if (t.dataset.meer) {
    if (!t.value) return;
    if (t.dataset.meer === 'apparaat') concept.apparaten.push({ id: t.value, naam: naamVan(t.value).slice(0, 40) });
    else zet(t.dataset.meer, [...lees(t.dataset.meer), t.value]);
    zeg('Nog niet bewaard.');
    teken();
  } else if (t.dataset.prijs) {
    concept.prijzen[t.dataset.prijs] = t.value === '' ? null : Number(t.value);
    zeg('Nog niet bewaard.');
  } else if (t.dataset.apparaatnaam != null) {
    const a = concept.apparaten[Number(t.dataset.apparaatnaam)];
    if (a) a.naam = t.value.trim() || a.naam;
    zeg('Nog niet bewaard.');
  }
});

async function bewaar() {
  document.activeElement?.blur?.();
  zeg('Even…');
  try {
    const res = await deur('api/energie', { ...concept, bron: concept.bron ?? 'zelf' });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return zeg('Alleen de beheerder kan dit bewaren.', true);
    if (!res.ok) return zeg(uit.fout ?? 'Niet bewaard.', true);
    info = { ...info, instellingen: uit };
    zeg('Bewaard. Opbrengst rekent er nu mee.');
    teken();
  } catch {
    zeg('Niet bewaard: geen verbinding met Smart Climate.', true);
  }
}

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
void laad();
