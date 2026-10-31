/*
 * Opbrengst, in ontwerp 2 (besluit 104; schetsen Wand-Opbrengst en Opbrengst).
 * De dienst rekent alles uit (`api/opbrengst`, besluit 102); deze pagina tekent
 * het: wat er van je eigen dak kwam, de kosten, de sankey op schaal, per
 * apparaat en per dag.
 *
 * Eerlijk: "wat SunArc scheelde" staat er pas als het huis zelf
 * schakelt (stap B); in de schaduw valt er niets te schelen. Een lopende
 * periode heet niet "76% minder" dan een volle: de vorige staat er als getal.
 */
'use strict';

const { $$, nl, esc, haal, zet } = app;
// De teksten staan in kit/teksten.*.js (besluit 185). De namen van de periodes komen nog van de dienst.
const { t } = taal;

const keuze = { soort: 'maand', datum: null };
let data = null;
let melding = null;
let zon = null;

const getal = (n) => nl(n, Math.abs(n) >= 100 ? 0 : 1);
/** Een meternaam zoals de bewoner hem zegt: "Airco woonkamer", niet "Airconditioning woonkamer". */
const kort = (naam) => String(naam).replace(/^airconditioning\b/i, t('vandaag.airco')).replace(/\s+(energie|energy|verbruik|kwh)$/i, '');
const euro = (n) => `€ ${nl(n, 2)}`;
const ZON = '#F7B548';
const NET = '#9AAABB';
const TERUG = '#6EE7B7';
const KLEUREN = ['#6FD3FF', '#8FD9FF', '#FFB088', '#C4BCFF', '#9EE6FF', '#FFD08A'];

/** Het sluipverbruik (besluit 192): een kaart naar zijn eigen scherm, met vannacht erop. */
let sluip = null;
const sluipIngang = () => (sluip
  ? `<a class="glas kaart sluipingang" href="sluipverbruik.html"><div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px"><h2 class="kop-3">${esc(t('sluip.titel'))}</h2><span class="getal" style="font-size: 22px${sluip.hoog ? '; color: var(--gloed-t)' : ''}">${nl(sluip.vannacht.w, 0)} W</span></div><p class="klein" style="margin: 6px 0 0">${esc(sluip.hoog ? t('sluip.ingangHoog', { boven: nl(sluip.bovenW, 0) }) : sluip.vaak ? t('sluip.ingangVaak', { n: sluip.vaak.nachten, meer: nl(sluip.vaak.meerW, 0) }) : t('sluip.ingangGewoon', { gewoon: nl(sluip.gewoonW, 0) }))} ›</p></a>`
  : '');

async function laad() {
  const q = new URLSearchParams({ soort: keuze.soort, ...(keuze.datum ? { datum: keuze.datum } : {}) });
  try {
    const res = await fetch(`api/opbrengst?${q}`, { cache: 'no-store', headers: { 'x-taal': taal.code } });
    const body = await res.json();
    if (res.status === 409) {
      data = null;
      melding = 'meters';
    } else if (!res.ok) {
      data = null;
      melding = body.fout ?? body.wachten ?? t('opbrengst.nietBeschikbaar');
    } else {
      data = body;
      melding = null;
    }
  } catch {
    data = null;
    melding = t('kamer.geenVerbinding');
  }
  teken();
}

/* ------------------------------------------------------------ de delen */

/** Panelen zonder slimme meter (besluit 196): zelf gebruikt en terug zijn geschat. */
const geschatLabel = () => `<span class="geschat">${esc(t('opbrengst.geschat'))}</span>`;

function titel(r) {
  if (r.geschat && r.zon) return t('opbrengst.panelenLeverden', { kwh: getal(r.zon.opgewektKwh) });
  if (r.heeft.zon && r.stroom.eigenZonPct != null) return t('opbrengst.eigenPanelen', { pct: r.stroom.eigenZonPct });
  return t('opbrengst.gebruikte', { kwh: getal(r.stroom.verbruikKwh) });
}

/** "2025-02-05" wordt "5 februari 2025", in de taal van de app. */
const datumNl = (iso) => taal.datum(new Date(`${iso}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function periode(r) {
  const p = r.periode;
  // Begint de meting later dan de periode, dan zegt de regel dat eerst.
  const vorige = r.dekking
    ? `<span class="mini" style="margin-left: 6px" data-dekking>${esc(t('opbrengst.gemetenVanaf', { datum: datumNl(r.dekking.vanaf), dagen: r.dekking.dagen, van: r.dekking.vanDagen }))}</span>`
    : r.geschat ? `<span class="mini" style="margin-left: 6px">${esc(t('opbrengst.zelfGeschat'))}</span>`
    : r.stroom.vorigeKwh != null ? `<span class="mini" style="margin-left: 6px">${esc(t('opbrengst.vorigeGebruikt', { naam: p.vorigeNaam, kwh: getal(r.stroom.vorigeKwh) }))}</span>` : '';
  return `<button type="button" aria-label="${esc(t('vandaag.eerder'))}" data-naar="${esc(p.vorige)}">‹</button><span class="kop-3" style="font-size: 17px">${esc(p.label)}</span><button type="button" aria-label="${esc(t('vandaag.later'))}" ${p.volgende ? `data-naar="${esc(p.volgende)}"` : 'disabled'}>›</button>${vorige}`;
}

/** Panelen zonder slimme meter (besluit 196): opgewekt is gemeten, zelf gebruikt en bespaard geschat. */
function cijfersGeschat(r, klein) {
  const z = r.zon;
  const bespaard = z.bespaardEuro == null ? null : `± ${euro(z.bespaardEuro)}`;
  const gas = r.gas ? `<div class="cijfer"><div class="mini">${esc(t('opbrengst.gas'))}</div><div class="getal">${getal(r.gas.m3)}<small>m³</small></div></div>` : '';
  if (klein) {
    const blok = (naam, waarde, onder) => `<div class="glas-klein"><span class="mini">${naam}</span><span class="getal">${waarde}</span><span class="mini">${onder}</span></div>`;
    return `<div class="drie">${blok(esc(t('opbrengst.opgewekt')), getal(z.opgewektKwh), 'kWh')}${blok(esc(t('opbrengst.zelfGebruikt')), `± ${getal(z.zelfKwh)}`, `kWh, ${esc(t('opbrengst.geschat'))}`)}${bespaard ? blok(esc(t('opbrengst.bespaard')), `± € ${nl(z.bespaardEuro, 0)}`, esc(t('opbrengst.geschat'))) : ''}</div>`;
  }
  return `<div class="cijfer"><div class="mini">${esc(t('opbrengst.opgewekt'))}</div><div class="getal">${getal(z.opgewektKwh)}<small>kWh</small></div><div class="klein">${esc(t('opbrengst.gemetenOmvormer'))}</div></div>
    <div class="cijfer"><div class="mini">${esc(t('opbrengst.zelfGebruikt'))}</div><div class="getal">± ${getal(z.zelfKwh)}<small>kWh</small></div><div class="klein">${geschatLabel()}</div></div>
    ${bespaard ? `<div class="cijfer"><div class="mini">${esc(t('opbrengst.bespaard'))}</div><div class="getal">${bespaard}</div><div class="klein">${esc(t('opbrengst.bespaardOnder'))}</div></div>` : ''}${gas}`;
}

/** Een kaart die een slimme meter aanraadt, of panelen (besluit 196). */
function erbijKaart(r) {
  if (r.geschat) return `<section class="glas kaart meterkaart"><h2 class="kop-3">${esc(t('opbrengst.meter.titel'))}</h2><p class="klein" style="margin: 6px 0 12px">${esc(t('opbrengst.meter.zin'))}</p><a class="pil" href="energie.html#meters">${esc(t('opbrengst.meter.knop'))}</a></section>`;
  if (!r.heeft.zon) return `<section class="glas kaart"><h2 class="kop-3">${esc(t('opbrengst.panelenErbij.titel'))}</h2><p class="klein" style="margin: 6px 0 12px">${esc(t('opbrengst.panelenErbij.zin'))}</p><a class="pil" href="huis-kan.html">${esc(t('opbrengst.panelenErbij.knop'))}</a></section>`;
  return '';
}

function cijfers(r, klein = false) {
  if (r.geschat && r.zon) return cijfersGeschat(r, klein);
  const s = r.stroom;
  const k = r.kosten;
  const stroom = `<div class="cijfer"><div class="mini">${esc(t('opbrengst.stroomGebruikt'))}</div><div class="getal">${getal(s.verbruikKwh)}<small>kWh</small></div><div class="klein">${esc(r.heeft.zon ? t('opbrengst.vanNetRest', { kwh: getal(s.vanNetKwh) }) : t('opbrengst.vanNet'))}</div></div>`;
  const vast = k.regels.find((x) => x.soort === 'vast');
  const kostenOnder = [r.dekking ? t('opbrengst.gemetenDagen', { n: r.dekking.dagen }) : k.vorige != null ? `${r.periode.vorigeNaam} ${euro(k.vorige)}` : '', vast?.euro == null ? t('opbrengst.zonderVast') : ''].filter(Boolean).join(', ');
  const kosten = k.totaal == null ? '' : `<div class="cijfer"><div class="mini">${esc(t('opbrengst.kosten'))}</div><div class="getal">${euro(k.totaal)}</div><div class="klein">${esc(kostenOnder)}</div></div>`;
  const gas = r.gas ? `<div class="cijfer"><div class="mini">${esc(t('opbrengst.gas'))}</div><div class="getal">${getal(r.gas.m3)}<small>m³</small></div><div class="klein">${r.gas.vorigeM3 != null ? `${esc(r.periode.vorigeNaam)} ${getal(r.gas.vorigeM3)} m³` : ''}</div></div>` : '';
  if (klein) {
    const blok = (naam, waarde, onder) => `<div class="glas-klein"><span class="mini">${naam}</span><span class="getal">${waarde}</span><span class="mini">${onder}</span></div>`;
    return `<div class="drie">${blok(esc(t('opbrengst.stroom')), getal(s.verbruikKwh), 'kWh')}${k.totaal == null ? '' : blok(esc(t('opbrengst.kosten')), `€ ${nl(k.totaal, 0)}`, k.vorige != null ? `${esc(/^\d/.test(r.periode.vorigeNaam) ? r.periode.vorigeNaam : `${r.periode.vorigeNaam.slice(0, 4)}.`)} € ${nl(k.vorige, 0)}` : '')}${r.gas ? blok(esc(t('opbrengst.gas')), getal(r.gas.m3), 'm³') : ''}</div>`;
  }
  return `${stroom}${kosten}${gas}`;
}

function panelen(r) {
  if (!r.zon || r.geschat) return '';
  const z = r.zon;
  const zelf = z.opgewektKwh > 0 ? (z.zelfKwh / z.opgewektKwh) * 100 : 0;
  return `<section class="glas kaart">
    <div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">${esc(t('opbrengst.panelen'))}</h2><span class="getal zon-t" style="font-size: 22px">${getal(z.opgewektKwh)} kWh</span></div>
    <div class="verdeel" style="height: 10px; margin-top: 12px"><i style="width: ${zelf.toFixed(1)}%; background: var(--zon)"></i><i style="width: ${(100 - zelf).toFixed(1)}%; background: var(--mint)"></i></div>
    <div class="klein" style="margin-top: 8px; display: flex; justify-content: space-between"><span>${z.opgewektKwh > 0 ? taal.html('opbrengst.zelfPct', { kwh: getal(z.zelfKwh), pct: Math.round(zelf) }) : esc(t('opbrengst.zelf', { kwh: getal(z.zelfKwh) }))}</span><span>${esc(t('opbrengst.naarNet', { kwh: getal(z.terugKwh) }))}</span></div>
    ${z.besteDag ? `<p class="mini" style="margin: 8px 0 0">${esc(t('opbrengst.besteDag', { dag: z.besteDag.label, kwh: getal(z.besteDag.kwh) }))}</p>` : ''}
    ${verwachtRegel(r.verwacht, r.periode.soort)}
  </section>`;
}

/**
 * Verwacht naast echt (besluit 137): wat de dag ervoor werd verwacht, opgeteld
 * over de dagen van de periode waarvan het bewaard is.
 */
function verwachtRegel(v, soort) {
  if (!v || !(v.verwachtKwh > 0)) return '';
  const p = Math.round(((v.werkelijkKwh - v.verwachtKwh) / v.verwachtKwh) * 100);
  const af = p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : t('opbrengst.precies');
  const zin = t(soort === 'dag' ? 'opbrengst.verwachtDag' : 'opbrengst.verwachtDagen', { verwacht: getal(v.verwachtKwh), echt: getal(v.werkelijkKwh), af, n: v.dagen });
  return `<p class="mini" style="margin: 6px 0 0">${esc(zin)}</p>`;
}

function sankeyVan(r, breedte, hoogte, links, rechts, vul = false) {
  const stroom = r.stromen.filter((s) => s.van !== 'gas' && s.kwh > 0.05);
  if (!stroom.length) return `<p class="klein">${esc(t('opbrengst.nietsGemeten'))}</p>`;
  const namen = new Map(r.apparaten.map((a) => [a.id, a.rest ? t('opbrengst.rest') : kort(a.naam)]));
  const doelen = [...new Set(stroom.map((s) => s.naar))].map((id, i) => ({
    id,
    naam: id === 'terug' ? (r.geschat ? t('opbrengst.naarHetNetGeschat') : t('opbrengst.naarHetNet')) : namen.get(id) ?? id,
    kleur: id === 'terug' ? TERUG : id === 'rest' ? NET : KLEUREN[i % KLEUREN.length],
  }));
  const bronnen = [
    ...(stroom.some((s) => s.van === 'zon') ? [{ id: 'zon', naam: t('vandaag.zon'), kleur: ZON }] : []),
    ...(stroom.some((s) => s.van === 'net') ? [{ id: 'net', naam: t('opbrengst.net'), kleur: NET }] : []),
  ];
  const schema = sankey.svg({ breedte, hoogte, links, rechts, vul, bronnen, doelen, stromen: stroom, beschrijving: t('opbrengst.sankey') });
  // Zonder meter (besluit 196): zeggen hoe het geschat is.
  return r.geschat ? `${schema}<p class="mini" style="margin: 14px 0 0">${esc(t('opbrengst.geschatUitleg'))}</p>` : schema;
}

function perApparaat(r) {
  // Zonder meter (besluit 196) is van de rest van het huis alleen de zon bekend: die staat in het schema, niet hier.
  const lijst = r.apparaten.filter((a) => (a.kwh >= 0.05 || a.rest) && !(a.rest && r.geschat));
  if (!lijst.length) return `<h2 class="kop-3">${esc(t('opbrengst.perApparaat'))}</h2><p class="mini" style="margin: 6px 0 0">${esc(t('opbrengst.geenMeters'))}</p>`;
  const rij = (a) => {
    const zonPct = a.kwh > 0 ? (a.zonKwh / a.kwh) * 100 : 0;
    return `<div class="rij"><div class="boven"><b>${esc(a.rest ? t('opbrengst.rest') : kort(a.naam))}</b><span>${getal(a.kwh)} kWh${a.kosten != null ? `, ${euro(a.kosten)}` : ''}</span></div><div class="verdeel"><i style="width: ${zonPct.toFixed(1)}%; background: var(--zon)"></i><i style="width: ${(100 - zonPct).toFixed(1)}%; background: ${NET}"></i></div></div>`;
  };
  return `<h2 class="kop-3" style="margin-bottom: 4px">${esc(t('opbrengst.perApparaat'))}</h2>${lijst.map(rij).join('')}
    <p class="mini legenda">${legendaZonNet(r)}</p>`;
}

/*
 * De grafiek: deze periode (per uur, dag of maand), of vergelijken met de
 * periodes ervoor en hetzelfde een jaar eerder. Een tik op een staaf zegt
 * wat erin zit.
 */
const grafiek = { blik: 'periode', maat: 'stroom', gekozen: null };
/** Wat je vergelijkt, met zijn eenheid; de naam in teksten.*.js (opbrengst.maat.*). */
const MATEN = { stroom: 'kWh', zon: 'kWh', gas: 'm³', kosten: '€' };
/** Zonder panelen (besluit 196) alleen het net. */
const legendaZonNet = (r) => `${r?.heeft?.zon === false ? '' : `<span><span class="stip" style="background: var(--zon)"></span>${esc(t('opbrengst.zonKlein'))}</span>`}<span><span class="stip" style="background: ${NET}"></span>${esc(t('opbrengst.netKlein'))}</span>`;
const waarde = (n, eenheid) => (n == null ? '–' : eenheid === '€' ? euro(n) : `${getal(n)} ${eenheid}`);

function staven(r) {
  if (grafiek.blik === 'periode') {
    const b = r.perBucket;
    const max = Math.max(0.1, ...b.map((x) => x.zonKwh + x.netKwh));
    return {
      titel: t(`opbrengst.per.${r.periode.soort}`),
      as: b.map((x) => x.label),
      html: b.map((x, i) => `<button type="button" class="staaf" data-staaf="${i}" aria-pressed="${grafiek.gekozen === i}" aria-label="${esc(t('opbrengst.staaf', { label: x.label, zon: getal(x.zonKwh), net: getal(x.netKwh) }))}"><i class="net" style="height: ${((x.netKwh / max) * 100).toFixed(1)}%"></i><i class="zon" style="height: ${((x.zonKwh / max) * 100).toFixed(1)}%"></i></button>`),
      detail: (i) => t('opbrengst.staafDetail', { label: b[i].label, zon: getal(b[i].zonKwh), net: getal(b[i].netKwh) }),
      legenda: legendaZonNet(r),
    };
  }
  const reeks = r.vergelijk[grafiek.maat] ?? [];
  const naam = t(`opbrengst.maat.${grafiek.maat}`);
  const eenheid = MATEN[grafiek.maat];
  const metEerder = (p) => (p.jaarEerder != null ? t('opbrengst.metEerder', { label: p.label, nu: waarde(p.nu, eenheid), eerder: waarde(p.jaarEerder, eenheid) }) : `${p.label}: ${waarde(p.nu, eenheid)}`);
  const max = Math.max(0.1, ...reeks.map((p) => Math.max(p.nu ?? 0, p.jaarEerder ?? 0)));
  const kleur = { stroom: '#6FD3FF', zon: ZON, gas: '#FF8A4C', kosten: '#C4BCFF' }[grafiek.maat];
  return {
    titel: t('opbrengst.vergeleken', { naam }),
    as: reeks.map((p) => p.label),
    html: reeks.map((p, i) => `<button type="button" class="staaf" data-staaf="${i}" aria-pressed="${grafiek.gekozen === i}" aria-label="${esc(metEerder(p))}">${p.jaarEerder != null ? `<i class="eerder" style="height: ${((p.jaarEerder / max) * 100).toFixed(1)}%"></i>` : ''}<i style="height: ${(((p.nu ?? 0) / max) * 100).toFixed(1)}%; background: ${kleur}"></i></button>`),
    detail: (i) => metEerder(reeks[i]),
    legenda: `<span><span class="stip" style="background: ${kleur}"></span>${esc(t(r.periode.soort === 'jaar' ? 'opbrengst.perJaar' : 'opbrengst.dezePeriodes'))}</span>${reeks.some((p) => p.jaarEerder != null) ? `<span><span class="stip" style="background: rgb(var(--wit) / 0.25)"></span>${esc(t('opbrengst.jaarEerder'))}</span>` : ''}`,
  };
}

function perDag(r) {
  const g = staven(r);
  if (!g.as.length) return '';
  const as = [g.as[0], g.as[Math.floor(g.as.length / 2)], g.as[g.as.length - 1]];
  const gekozen = grafiek.gekozen != null && grafiek.gekozen < g.as.length ? grafiek.gekozen : null;
  const maten = grafiek.blik === 'vergelijk'
    ? `<div class="maten" role="group" aria-label="${esc(t('opbrengst.watVergelijken'))}">${Object.keys(MATEN)
        .filter((k) => (k !== 'gas' || r.heeft.gas) && (k !== 'zon' || r.heeft.zon) && (k !== 'kosten' || r.heeft.prijzen))
        .map((k) => `<button type="button" data-maat="${k}" aria-pressed="${k === grafiek.maat}">${esc(t(`opbrengst.maat.${k}`))}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="grafiekkop"><h2 class="kop-3">${esc(g.titel)}</h2><div class="blik" role="group" aria-label="${esc(t('opbrengst.grafiek'))}"><button type="button" data-blik="periode" aria-pressed="${grafiek.blik === 'periode'}">${esc(t('opbrengst.dezePeriode'))}</button><button type="button" data-blik="vergelijk" aria-pressed="${grafiek.blik === 'vergelijk'}">${esc(t('opbrengst.vergelijken'))}</button></div></div>
    ${maten}
    <div class="staven">${g.html.join('')}</div>
    <div class="asje"><span>${esc(as[0])}</span><span>${esc(as[1])}</span><span>${esc(as[2])}</span></div>
    <p class="mini detail" aria-live="polite">${esc(gekozen != null ? g.detail(gekozen) : t('opbrengst.tikStaaf'))}</p>
    <p class="mini legenda">${g.legenda}</p>`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const soorten = ['dag', 'week', 'maand', 'jaar'];
  $$('[data-wissel]').forEach((el) => (el.innerHTML = soorten.map((k) => `<button type="button" data-soort="${k}" aria-pressed="${k === keuze.soort}">${esc(t(`opbrengst.soort.${k}`))}</button>`).join('')));

  if (!data) {
    const tekst = melding === 'meters'
      ? `<section class="glas kaart"><h2 class="kop-3">${esc(t('opbrengst.eerstMeters'))}</h2><p class="klein" style="margin: 8px 0 12px">${esc(t('opbrengst.metersUitleg'))}</p><a class="pil" href="energie.html#meters">${esc(t('opbrengst.metersInstellen'))}</a></section>`
      : `<p class="klein">${esc(melding ?? t('kamer.camera.laden'))}</p>`;
    $$('[data-titel]').forEach((el) => (el.textContent = melding ? t('nav.opbrengst') : t('algemeen.laden')));
    document.querySelector('[data-links]').innerHTML = tekst + sluipIngang();
    document.querySelector('[data-telinhoud]').innerHTML = tekst + sluipIngang();
    ['[data-sankey]', '[data-apparaten]', '[data-perdag]'].forEach((s) => (document.querySelector(s).innerHTML = ''));
    $$('[data-periode]').forEach((el) => (el.innerHTML = ''));
    return;
  }
  const r = data;
  $$('[data-titel]').forEach((el) => (el.textContent = titel(r)));
  $$('[data-periode]').forEach((el) => (el.innerHTML = periode(r)));
  document.querySelector('[data-links]').innerHTML = `${cijfers(r)}${panelen(r)}${sluipIngang()}${erbijKaart(r)}`;
  document.querySelector('[data-sankey]').innerHTML = sankeyVan(r, 500, 540, 70, 230);
  zet('[data-waarheen]', t(r.geschat ? 'opbrengst.waarHeenZon' : 'opbrengst.waarHeen'));
  document.querySelector('[data-apparaten]').innerHTML = perApparaat(r);
  document.querySelector('[data-perdag]').innerHTML = perDag(r);
  document.querySelector('[data-telinhoud]').innerHTML = `${cijfers(r, true)}${panelen(r)}${sluipIngang()}${erbijKaart(r)}
    <section class="glas kaart"><h2 class="kop-3">${esc(t(r.geschat ? 'opbrengst.waarHeenZon' : 'opbrengst.waarHeen'))}</h2><div style="margin-top: 10px">${sankeyVan(r, 380, 340, 0, 200, true)}</div></section>
    <section class="glas kaart">${perApparaat(r)}</section>
    <section class="glas kaart">${perDag(r)}</section>`;
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('opbrengst');
document.addEventListener('click', (e) => {
  const staaf = e.target.closest('[data-staaf]');
  if (staaf) {
    grafiek.gekozen = Number(staaf.dataset.staaf);
    teken();
    return;
  }
  const blik = e.target.closest('[data-blik]');
  if (blik) {
    grafiek.blik = blik.dataset.blik;
    grafiek.gekozen = null;
    teken();
    return;
  }
  const maat = e.target.closest('[data-maat]');
  if (maat) {
    grafiek.maat = maat.dataset.maat;
    grafiek.gekozen = null;
    teken();
    return;
  }
  const soort = e.target.closest('[data-soort]');
  if (soort) {
    keuze.soort = soort.dataset.soort;
    keuze.datum = null;
    grafiek.gekozen = null;
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
haal('api/sluipverbruik').then((s) => ((sluip = s), teken())).catch(() => {});
setInterval(() => void laad(), 5 * 60_000);
