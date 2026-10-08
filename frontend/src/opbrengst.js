/*
 * Opbrengst, in ontwerp 2 (besluit 104; schetsen Wand-Opbrengst en Opbrengst).
 * De dienst rekent alles uit (`api/opbrengst`, besluit 102); deze pagina tekent
 * het: wat er van je eigen dak kwam, de kosten, de sankey op schaal, per
 * apparaat en per dag.
 *
 * Eerlijk: "wat Smart Climate scheelde" staat er pas als het huis zelf
 * schakelt (stap B); in de schaduw valt er niets te schelen. Een lopende
 * periode heet niet "76% minder" dan een volle: de vorige staat er als getal.
 */
'use strict';

const { $$, nl, esc, haal } = app;

const keuze = { soort: 'maand', datum: null };
let data = null;
let melding = null;
let zon = null;

const getal = (n) => nl(n, Math.abs(n) >= 100 ? 0 : 1);
/** Een meternaam zoals de bewoner hem zegt: "Airco woonkamer", niet "Airconditioning woonkamer". */
const kort = (naam) => String(naam).replace(/^airconditioning\b/i, 'Airco').replace(/\s+(energie|energy|verbruik|kwh)$/i, '');
const euro = (n) => `€ ${nl(n, 2)}`;
const ZON = '#F7B548';
const NET = '#9AAABB';
const TERUG = '#6EE7B7';
const KLEUREN = ['#6FD3FF', '#8FD9FF', '#FFB088', '#C4BCFF', '#9EE6FF', '#FFD08A'];

async function laad() {
  const q = new URLSearchParams({ soort: keuze.soort, ...(keuze.datum ? { datum: keuze.datum } : {}) });
  try {
    const res = await fetch(`api/opbrengst?${q}`, { cache: 'no-store' });
    const body = await res.json();
    if (res.status === 409) {
      data = null;
      melding = 'meters';
    } else if (!res.ok) {
      data = null;
      melding = body.fout ?? body.wachten ?? 'De opbrengst is nu niet beschikbaar.';
    } else {
      data = body;
      melding = null;
    }
  } catch {
    data = null;
    melding = 'Geen verbinding met Smart Climate.';
  }
  teken();
}

/* ------------------------------------------------------------ de delen */

function titel(r) {
  if (r.heeft.zon && r.stroom.eigenZonPct != null) return `${r.stroom.eigenZonPct}% van je stroom kwam van je eigen dak`;
  return `Je gebruikte ${getal(r.stroom.verbruikKwh)} kWh stroom`;
}

function periode(r) {
  const p = r.periode;
  const vorige = r.stroom.vorigeKwh != null ? `<span class="mini" style="margin-left: 6px">${esc(p.vorigeNaam)}: ${getal(r.stroom.vorigeKwh)} kWh gebruikt</span>` : '';
  return `<button type="button" aria-label="Eerder" data-naar="${esc(p.vorige)}">‹</button><span class="kop-3" style="font-size: 17px">${esc(p.label)}</span><button type="button" aria-label="Later" ${p.volgende ? `data-naar="${esc(p.volgende)}"` : 'disabled'}>›</button>${vorige}`;
}

function cijfers(r, klein = false) {
  const s = r.stroom;
  const k = r.kosten;
  const stroom = `<div class="cijfer"><div class="mini">Stroom gebruikt</div><div class="getal">${getal(s.verbruikKwh)}<small>kWh</small></div><div class="klein">${r.heeft.zon ? `${getal(s.vanNetKwh)} van het net, de rest van je dak` : 'van het net'}</div></div>`;
  const vast = k.regels.find((x) => /vast/i.test(x.naam));
  const kosten = k.totaal == null ? '' : `<div class="cijfer"><div class="mini">Kosten</div><div class="getal">${euro(k.totaal)}</div><div class="klein">${k.vorige != null ? `${esc(r.periode.vorigeNaam)} ${euro(k.vorige)}` : ''}${vast?.euro == null ? `${k.vorige != null ? ', ' : ''}zonder vaste kosten` : ''}</div></div>`;
  const gas = r.gas ? `<div class="cijfer"><div class="mini">Gas</div><div class="getal">${getal(r.gas.m3)}<small>m³</small></div><div class="klein">${r.gas.vorigeM3 != null ? `${esc(r.periode.vorigeNaam)} ${getal(r.gas.vorigeM3)} m³` : ''}</div></div>` : '';
  if (klein) {
    const blok = (naam, waarde, onder) => `<div class="glas-klein"><span class="mini">${naam}</span><span class="getal">${waarde}</span><span class="mini">${onder}</span></div>`;
    return `<div class="drie">${blok('Stroom', getal(s.verbruikKwh), 'kWh')}${k.totaal == null ? '' : blok('Kosten', `€ ${nl(k.totaal, 0)}`, k.vorige != null ? `${esc(r.periode.vorigeNaam.slice(0, 4))}. € ${nl(k.vorige, 0)}` : '')}${r.gas ? blok('Gas', getal(r.gas.m3), 'm³') : ''}</div>`;
  }
  return `${stroom}${kosten}${gas}`;
}

function panelen(r) {
  if (!r.zon) return '';
  const z = r.zon;
  const zelf = z.opgewektKwh > 0 ? (z.zelfKwh / z.opgewektKwh) * 100 : 0;
  return `<section class="glas kaart">
    <div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">Je panelen</h2><span class="getal zon-t" style="font-size: 22px">${getal(z.opgewektKwh)} kWh</span></div>
    <div class="verdeel" style="height: 10px; margin-top: 12px"><i style="width: ${zelf.toFixed(1)}%; background: var(--zon)"></i><i style="width: ${(100 - zelf).toFixed(1)}%; background: var(--mint)"></i></div>
    <div class="klein" style="margin-top: 8px; display: flex; justify-content: space-between"><span>${getal(z.zelfKwh)} zelf gebruikt</span><span>${getal(z.terugKwh)} naar het net</span></div>
    ${z.besteDag ? `<p class="mini" style="margin: 8px 0 0">Beste dag: ${esc(z.besteDag.label)}, ${getal(z.besteDag.kwh)} kWh</p>` : ''}
  </section>`;
}

function sankeyVan(r, breedte, hoogte, links, rechts) {
  const stroom = r.stromen.filter((s) => s.van !== 'gas' && s.kwh > 0.05);
  if (!stroom.length) return '<p class="klein">In deze periode is er nog niets gemeten.</p>';
  const namen = new Map(r.apparaten.map((a) => [a.id, a.rest ? 'Rest van het huis' : kort(a.naam)]));
  const doelen = [...new Set(stroom.map((s) => s.naar))].map((id, i) => ({
    id,
    naam: id === 'terug' ? 'Naar het net' : namen.get(id) ?? id,
    kleur: id === 'terug' ? TERUG : id === 'rest' ? NET : KLEUREN[i % KLEUREN.length],
  }));
  const bronnen = [
    ...(stroom.some((s) => s.van === 'zon') ? [{ id: 'zon', naam: 'Zon', kleur: ZON }] : []),
    ...(stroom.some((s) => s.van === 'net') ? [{ id: 'net', naam: 'Net', kleur: NET }] : []),
  ];
  return sankey.svg({ breedte, hoogte, links, rechts, bronnen, doelen, stromen: stroom, beschrijving: 'Waar je stroom heen ging: van de zon en het net naar de apparaten, de rest van het huis en terug naar het net.' });
}

function perApparaat(r) {
  const lijst = r.apparaten.filter((a) => a.kwh >= 0.05 || a.rest);
  if (!lijst.length) return '<h2 class="kop-3">Per apparaat</h2><p class="mini" style="margin: 6px 0 0">Geen apparaten met een eigen meter.</p>';
  const rij = (a) => {
    const zonPct = a.kwh > 0 ? (a.zonKwh / a.kwh) * 100 : 0;
    return `<div class="rij"><div class="boven"><b>${esc(a.rest ? 'Rest van het huis' : kort(a.naam))}</b><span>${getal(a.kwh)} kWh${a.kosten != null ? `, ${euro(a.kosten)}` : ''}</span></div><div class="verdeel"><i style="width: ${zonPct.toFixed(1)}%; background: var(--zon)"></i><i style="width: ${(100 - zonPct).toFixed(1)}%; background: ${NET}"></i></div></div>`;
  };
  return `<h2 class="kop-3" style="margin-bottom: 4px">Per apparaat</h2>${lijst.map(rij).join('')}
    <p class="mini legenda"><span><span class="stip" style="background: var(--zon)"></span>zon</span><span><span class="stip" style="background: ${NET}"></span>net</span></p>`;
}

function perDag(r) {
  const b = r.perBucket;
  if (!b.length) return '';
  const max = Math.max(0.1, ...b.map((x) => x.zonKwh + x.netKwh));
  const naam = { dag: 'Per uur', week: 'Per dag', maand: 'Per dag', jaar: 'Per maand' }[r.periode.soort];
  const staven = b.map((x) => `<div title="${esc(x.label)}: ${getal(x.zonKwh)} kWh zon, ${getal(x.netKwh)} kWh net"><i class="zon" style="height: ${((x.zonKwh / max) * 100).toFixed(1)}%"></i><i class="net" style="height: ${((x.netKwh / max) * 100).toFixed(1)}%"></i></div>`).join('');
  const as = [b[0].label, b[Math.floor(b.length / 2)].label, b[b.length - 1].label];
  return `<h2 class="kop-3">${naam}</h2><div class="staven" role="img" aria-label="${naam} wat je gebruikte: van de zon en van het net">${staven}</div><div class="asje"><span>${esc(as[0])}</span><span>${esc(as[1])}</span><span>${esc(as[2])}</span></div>`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const soorten = [['dag', 'Dag'], ['week', 'Week'], ['maand', 'Maand'], ['jaar', 'Jaar']];
  $$('[data-wissel]').forEach((el) => (el.innerHTML = soorten.map(([k, l]) => `<button type="button" data-soort="${k}" aria-pressed="${k === keuze.soort}">${l}</button>`).join('')));

  if (!data) {
    const tekst = melding === 'meters'
      ? `<section class="glas kaart"><h2 class="kop-3">Eerst je meters</h2><p class="klein" style="margin: 8px 0 12px">Om terug te kijken moet Smart Climate weten welke meters je huis heeft en wat stroom en gas kosten.</p><a class="pil" href="nieuw.html#energie">Meters en prijzen instellen</a></section>`
      : `<p class="klein">${esc(melding ?? 'Even laden…')}</p>`;
    $$('[data-titel]').forEach((el) => (el.textContent = melding === 'meters' ? 'Opbrengst' : melding ? 'Opbrengst' : 'Even laden'));
    document.querySelector('[data-links]').innerHTML = tekst;
    document.querySelector('[data-telinhoud]').innerHTML = tekst;
    ['[data-sankey]', '[data-apparaten]', '[data-perdag]'].forEach((s) => (document.querySelector(s).innerHTML = ''));
    $$('[data-periode]').forEach((el) => (el.innerHTML = ''));
    return;
  }
  const r = data;
  $$('[data-titel]').forEach((el) => (el.textContent = titel(r)));
  $$('[data-periode]').forEach((el) => (el.innerHTML = periode(r)));
  document.querySelector('[data-links]').innerHTML = `${cijfers(r)}${panelen(r)}`;
  document.querySelector('[data-sankey]').innerHTML = sankeyVan(r, 500, 540, 70, 230);
  document.querySelector('[data-apparaten]').innerHTML = perApparaat(r);
  document.querySelector('[data-perdag]').innerHTML = perDag(r);
  document.querySelector('[data-telinhoud]').innerHTML = `${cijfers(r, true)}${panelen(r)}
    <section class="glas kaart"><h2 class="kop-3">Waar je stroom heen ging</h2><div style="margin-top: 10px">${sankeyVan(r, 326, 330, 52, 200)}</div></section>
    <section class="glas kaart">${perApparaat(r)}</section>
    <section class="glas kaart">${perDag(r)}</section>`;
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('opbrengst');
document.addEventListener('click', (e) => {
  const soort = e.target.closest('[data-soort]');
  if (soort) {
    keuze.soort = soort.dataset.soort;
    keuze.datum = null;
    void laad();
    return;
  }
  const naar = e.target.closest('[data-naar]');
  if (naar) {
    keuze.datum = naar.dataset.naar;
    void laad();
  }
});
void laad();
haal('api/zon').then((z) => ((zon = z), teken())).catch(() => {});
setInterval(() => void laad(), 5 * 60_000);
