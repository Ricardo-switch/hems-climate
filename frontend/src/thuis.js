/*
 * Thuis, in ontwerp 2 (besluit 104). De schets is de code: het huis komt uit
 * kit/huis.js, dezelfde tekenmotor als in design/app2. Deze pagina zet alleen
 * de gegevens van de dienst om naar de beschrijving van het huis; uitrekenen
 * doet de dienst (besluit 94).
 *
 * De wand is altijd 1280 × 800 en wordt als geheel naar het scherm geschaald,
 * zodat er nooit gescrold hoeft te worden. Op een telefoon (smal of staand)
 * staat dezelfde inhoud onder elkaar.
 */
'use strict';

const { $$, nl, zet, esc, haal, deur, tijdVanDeDag, lucht } = app;

let state = null;
let huisData = null;
let zon = null;
let vandaag = null;
let weer = null;
let gekozenZone = null;

/* ------------------------------------------------------- de gegevens */

async function laadAlles() {
  const [s, h, z, v, w] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/vandaag'), haal('api/weer')]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  if (w.status === 'fulfilled') weer = w.value;
  teken();
}

/* --------------------------------------- van de dienst naar het huis */

const { ACTIEF, BUITEN, kleurVanLicht, zoneNaam } = huismodel;
const kamerModel = (r) => huismodel.kamerModel(r, state);

function huisModel() {
  const s = state?.bewoner?.stromen ?? {};
  const zonKw = s.zonKw ?? 0;
  const netKw = s.netKw ?? 0;
  const etagesBovenEerst = huisData?.etages ?? [];
  // Wat buiten ligt (de tuin, de oprit), haalt de app uit het huis en zet het ernaast.
  const buitenRuimtes = [];
  const etages = [];
  for (const e of [...etagesBovenEerst].reverse()) {
    const binnen = [];
    for (const r of e.ruimtes ?? []) {
      if (e.id === 'buiten' || BUITEN.test(r.naam) || BUITEN.test(r.id)) buitenRuimtes.push(r);
      else binnen.push(r);
    }
    if (binnen.length) etages.push({ naam: e.naam, id: e.id, kamers: binnen.map(kamerModel) });
  }
  // De bovenste etage ligt onder het dak als het huis drie lagen heeft, of als hij zo heet.
  const top = etages[etages.length - 1];
  if (top && (etages.length >= 3 || /zolder|dak/i.test(top.naam))) top.dak = true;

  const alles = etagesBovenEerst.flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
  const aircos = alles.filter((a) => a.soort === 'klimaat' && a.klimaat?.kanKoelen);
  const tijd = tijdVanDeDag(zon);
  const helder = zon?.heldereLuchtW ?? 0;
  const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : tijd === 'nacht' ? 0 : 0.3;
  const piekW = (zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
  const maand = new Date().getMonth() + 1;

  // Buiten: de oprit met de auto en de schijnwerper, de tuin met het tuinhuis.
  let oprit = null;
  let tuin = null;
  for (const r of buitenRuimtes) {
    const lampen = (r.apparaten ?? []).filter((a) => a.soort === 'licht');
    if (/oprit|carport/i.test(r.naam)) {
      const cam = lampen.find((a) => /camera|schijnwerper/i.test(a.id + a.naam));
      oprit = { auto: {}, camera: cam ? { aan: cam.aan } : null };
    } else {
      const huisje = lampen.filter((a) => /tuinhuis/i.test(a.id + a.naam));
      const overstek = huisje.find((a) => /overstek/i.test(a.id + a.naam));
      const binnenlamp = huisje.find((a) => a !== overstek);
      const scherm = (r.apparaten ?? []).find((a) => a.soort === 'screen');
      tuin = {
        tuinhuisAan: !!binnenlamp?.aan,
        overstekAan: !!overstek?.aan,
        overstekKleur: overstek ? kleurVanLicht(overstek) : undefined,
        lampen: lampen.filter((a) => !huisje.includes(a)).slice(0, 3).map((a) => ({ aan: a.aan, kleur: kleurVanLicht(a) })),
        zonnescherm: scherm ? { dicht: scherm.positiePct == null ? 0 : 1 - scherm.positiePct / 100 } : null,
      };
    }
  }

  const stromen = [];
  const koelend = etages.flatMap((e) => e.kamers).find((k) => k.apparaten.some((a) => a.soort === 'airco' && a.aan));
  if (zonKw > 0.05) stromen.push({ van: 'zon', naar: koelend ? `kamer:${koelend.naam}` : 'huis', sterkte: Math.min(1, zonKw / 3) });
  if (netKw < -0.05) stromen.push({ van: 'zon', naar: 'net', sterkte: Math.min(1, -netKw / 3) });
  if (netKw > 0.05) stromen.push({ van: 'net', naar: 'huis', sterkte: Math.min(1, netKw / 3) });

  const labels = [];
  if (zonKw > 0.05) labels.push({ bij: 'panelen', titel: `${nl(zonKw)} kW`, groot: true, toon: 'zon', regels: ['je panelen, nu'], dx: 64, dy: -70 });
  labels.push({ bij: 'net', titel: netKw > 0.05 ? `${nl(netKw)} kW van het net` : netKw < -0.05 ? `${nl(-netKw)} kW terug` : 'Niets van het net', toon: netKw > 0.05 ? 'net' : 'mint', dx: -30, dy: 34 });

  return {
    beschrijving: `${state?.bewoner?.kop?.titel ?? 'Het huis'}. ${state?.bewoner?.kop?.zin ?? ''}`,
    tijd,
    seizoen: maand >= 11 || maand <= 2 ? 'winter' : 'zomer',
    wolken,
    zon: zon?.dag ? { stand: zon.dag.fractie, hoogte: zon.dag.hoogteDeel, aandeel: Math.min(1, (zonKw * 1000) / Math.max(helder, 1500)), panelen: Math.round(piekW / 390) || 12 } : { aandeel: 0 },
    etages,
    buitenunit: aircos.length ? { aan: aircos.some((a) => a.aan || ACTIEF.includes(a.klimaat?.actie)) } : null,
    net: true,
    oprit,
    tuin,
    stromen,
    labels,
  };
}

/* ------------------------------------------------------------ tekenen */

function teken() {
  app.schaal();
  if (!state || !huisData) return;

  const e = state.explanation ?? {};
  const kop = state.bewoner?.kop ?? {};
  zet('[data-kop]', kop.titel ?? 'Het huis');
  zet('[data-zin]', kop.zin ?? '');
  tekenWeerknop(e.outdoorTemperatureC);
  const modus = e.modeSource === 'schedule' ? 'Automatisch' : { dag: 'Dag', nacht: 'Nacht', afwezig: 'Afwezig', vakantie: 'Vakantie', handmatig: 'Handmatig' }[e.mode] ?? 'Automatisch';
  $$('[data-modus]').forEach((el) => (el.innerHTML = `${esc(modus)} <span aria-hidden="true" style="color: var(--gedempt)">▾</span>`));

  const model = huisModel();
  lucht(model.tijd, model.seizoen, model.wolken);
  huis.teken(document.getElementById('podium-wand'), model, { breedte: 860, hoogte: 612, schuifX: 18, schuifY: 20, tik: true });
  huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((et) => ({ ...et, kamers: et.kamers.map((k) => ({ ...k, stil: true })) })), labels: model.labels.filter((l) => l.bij === 'panelen').map((l) => ({ ...l, dx: -40, dy: -84 })) }, { breedte: 390, hoogte: 360, marge: 0.03, schuifY: 14 });

  tekenVandaag();
  tekenStraks();
  tekenGevoel();
  tekenKamersTel();
}

function tekenVandaag() {
  const box = document.querySelector('[data-dag]');
  if (!vandaag?.kwartieren?.length) {
    box.innerHTML = '<p class="mini">Nog geen metingen van vandaag.</p>';
    return;
  }
  const B = 312;
  const t0 = vandaag.vanMs;
  const t1 = t0 + 24 * 3600_000;
  const x = (t) => 8 + ((t - t0) / (t1 - t0)) * (B - 16);
  const kw = vandaag.kwartieren;
  const lijn2 = app.verwachting(zon, weer);
  const max = Math.max(1500, ...kw.map((q) => q.zonW ?? 0), ...lijn2.punten.map((q) => q.w));
  const y = (w) => 86 - (w / max) * 72;
  const lijn = kw.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.zonW ?? 0).toFixed(1)}`).join(' ');
  const laatste = kw[kw.length - 1];
  const vlak = `${lijn} L ${x(laatste.tMs).toFixed(1)} 86 L ${x(kw[0].tMs).toFixed(1)} 86 Z`;
  const helder = lijn2.punten.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.w).toFixed(1)}`).join(' ');
  const nuX = x(Date.now());
  const namen = { 'ac-woonkamer': 'Airco woonkamer', 'ac-zolder': 'Airco zolder' };
  const banen = (vandaag.apparaten ?? []).filter((a) => /^ac-/.test(a.actuatorId)).slice(0, 3);
  const banenSvg = banen
    .map((a, i) => {
      const yy = 104 + i * 15;
      const naam = namen[a.actuatorId] ?? a.actuatorId;
      const stukken = (a.smartClimate ?? []).map((s) => `<rect x="${x(s.vanMs).toFixed(1)}" y="${yy - 7}" width="${Math.max(3, x(s.totMs) - x(s.vanMs)).toFixed(1)}" height="7" rx="3.5" fill="#6FD3FF"/>`).join('');
      return `<text x="8" y="${yy}">${esc(naam)}</text>${stukken}`;
    })
    .join('');
  const uren = [6, 12, 18, 22].map((u) => `<text x="${x(t0 + u * 3600_000).toFixed(1)}" y="${104 + banen.length * 15 + 12}" text-anchor="middle">${String(u).padStart(2, '0')}</text>`).join('');
  const hoog = 104 + banen.length * 15 + 16;
  box.innerHTML = `<svg viewBox="0 0 ${B} ${hoog}" width="${B}" height="${hoog}" aria-label="De zon van vandaag, en wanneer de airco's draaiden">
    <defs><linearGradient id="zonvlak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.55"/><stop offset="1" stop-color="#F7B548" stop-opacity="0.02"/></linearGradient></defs>
    ${helder ? `<path d="${helder}" fill="none" stroke="#F7B548" stroke-opacity="0.35" stroke-dasharray="2 4"/>` : ''}
    <path d="${vlak}" fill="url(#zonvlak)"/><path d="${lijn}" fill="none" stroke="#F7B548" stroke-width="2"/>
    <line x1="${nuX}" y1="14" x2="${nuX}" y2="${hoog - 14}" stroke="#EEF3F7" stroke-opacity="0.6"/>
    <text x="${nuX}" y="10" fill="#B8C4CF" font-size="10" text-anchor="middle" font-family="Figtree">nu</text>
    <g font-family="Figtree" font-size="10.5" fill="#7F8E9C">${banenSvg}${uren}</g>
  </svg>`;
  const kwh = (vandaag.zonWh ?? 0) / 1000;
  const verwacht = weer?.vandaag?.verwachtKwh;
  zet('[data-opgewekt]', verwacht != null && verwacht > kwh + 0.05 ? `${nl(kwh)} kWh, verwacht ${nl(verwacht)}` : `${nl(kwh)} kWh opgewekt`);
  const terug = (vandaag.netTerugWh ?? 0) / 1000;
  const uitleg = `De stippellijn is de ${lijn2.naam}${lijn2.naam === 'verwachting' ? ' van vandaag, uit het weer en wat je panelen leerden' : ''}.`;
  zet('[data-dag-zin]', kwh > 0.05 ? `${nl(Math.max(0, Math.min(100, ((kwh - terug) / kwh) * 100)), 0)}% zelf gebruikt. ${uitleg}` : uitleg);
}

/*
 * Straks: wat het huis gaat doen zodra het kan. Uit de besluiten die nu op zon
 * wachten; het plan voor de middag komt met het thermisch model (D).
 */
function tekenStraks() {
  const wacht = (state.rejected ?? []).find((r) => r.blockedBy === 'insufficient_power_budget' && r.intent?.budgetW > 0);
  const kaarten = $$('[data-straks]');
  if (!wacht) {
    kaarten.forEach((k) => (k.hidden = true));
    return;
  }
  const actie = wacht.intent.action === 'heat' ? 'warmen' : 'koelen';
  zet('[data-straks-kop]', `De ${zoneNaam(wacht.intent.zoneId)} gaat ${actie} bij ${nl(wacht.intent.budgetW / 1000)} kW zon`);
  const over = Math.max(0, state.explanation?.budget?.availableW ?? 0);
  zet('[data-straks-zin]', `${over >= 50 ? `Nu is er ${nl(over / 1000)} kW over.` : 'Nu is er geen zon over.'} Zodra er genoeg is, begint hij vanzelf.`);
  kaarten.forEach((k) => (k.hidden = false));
}

const GEVOEL = [
  ['te_koud', 'Te koud', 'rgba(111,211,255,0.14)', '#a9e6ff'],
  ['goed', 'Goed', 'rgba(110,231,183,0.14)', 'var(--mint)'],
  ['te_warm', 'Te warm', 'rgba(255,122,77,0.14)', '#ffb090'],
];

function tekenGevoel() {
  const zones = huisData.etages.flatMap((e) => e.ruimtes).filter((r) => r.zoneId && r.temperatuurC != null);
  if (!zones.length) return;
  gekozenZone ??= zones.find((r) => r.zoneId === 'woonkamer')?.zoneId ?? zones[0].zoneId;
  const kamer = zones.find((r) => r.zoneId === gekozenZone) ?? zones[0];
  zet('[data-gevoel-kop]', `Hoe voelt het in de ${zoneNaam(kamer.zoneId)}?`);
  const box = document.querySelector('[data-gevoel]');
  if (box.childElementCount) return;
  for (const [sleutel, tekst, achter, kleur] of GEVOEL) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tekst;
    b.style.background = achter;
    b.style.color = kleur;
    b.addEventListener('click', async () => {
      $$('[data-gevoel] button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const res = await deur('api/gevoel', { zoneId: gekozenZone, gevoel: sleutel }).catch(() => undefined);
      if (res === null) return;
      zet('[data-gevoel-zin]', res?.ok ? 'Genoteerd. Het huis leert ervan wat jij prettig vindt.' : 'Niet gelukt; probeer het zo nog eens.');
    });
    box.append(b);
  }
}

function tekenKamersTel() {
  const box = document.querySelector('[data-kamers]');
  const kleur = { koelt: 'var(--ijs)', warmt: 'var(--gloed)', wacht: 'var(--zon)', goed: 'var(--mint)' };
  const kamers = huisData.etages.flatMap((e) => e.ruimtes).filter((r) => r.zoneId && r.temperatuurC != null);
  box.innerHTML = kamers
    .map((r) => {
      const stand = huismodel.standVan(r.zoneId, state);
      const kort = state.bewoner?.kamers?.find((x) => x.zoneId === r.zoneId)?.kort ?? '';
      return `<a class="glas kamer" href="kamer.html#${encodeURIComponent(r.id)}"><span class="stip" style="width: 10px; height: 10px; background: ${kleur[stand] ?? 'var(--gedempt)'}"></span><span class="naam"><b>${esc(r.naam)}</b><span style="color: ${kleur[stand] ?? 'var(--zacht)'}">${esc(kort)}</span></span><span class="getal">${nl(r.temperatuurC)}°</span></a>`;
    })
    .join('');
}

/* ------------------------------------------------------------- het weer */

/*
 * Het weer (besluit 105): de knop met de temperatuur opent vandaag en de vijf
 * dagen van Buienradar, met wat de panelen dan leveren. Dat rekent de dienst
 * uit met wat de panelen op heldere dagen haalden; de pagina zet het neer.
 */
const WOLK = '<path d="M10 25h15a6 6 0 0 0 .6-12A8 8 0 0 0 10.4 15 5 5 0 0 0 10 25z" fill="#B8C4CF"/>';
const WEER_ICOON = {
  zon: '<circle cx="18" cy="18" r="7" fill="#F7B548"/><g stroke="#F7B548" stroke-width="2.2" stroke-linecap="round"><path d="M18 4v3M18 29v3M4 18h3M29 18h3M8 8l2 2M26 26l2 2M8 28l2-2M26 10l2-2"/></g>',
  half: '<circle cx="13" cy="13" r="6" fill="#F7B548"/><g stroke="#F7B548" stroke-width="2" stroke-linecap="round"><path d="M13 3v2M3 13h2M6 6l1.5 1.5M20 6l-1.5 1.5"/></g><path d="M12 29h14a5.5 5.5 0 0 0 .5-11A7.5 7.5 0 0 0 12.4 20 4.5 4.5 0 0 0 12 29z" fill="#B8C4CF"/>',
  bewolkt: WOLK,
  regen: `${WOLK}<g stroke="#6FD3FF" stroke-width="2" stroke-linecap="round"><path d="M13 28l-1.5 4M19 28l-1.5 4M25 28l-1.5 4"/></g>`,
  onweer: `${WOLK}<path d="M19 26l-4 6h4l-2 4 6-7h-4l2-3z" fill="#F7B548"/>`,
  sneeuw: `${WOLK}<g fill="#EEF3F7"><circle cx="13" cy="30" r="1.6"/><circle cx="19" cy="32" r="1.6"/><circle cx="25" cy="30" r="1.6"/></g>`,
  mist: '<g stroke="#B8C4CF" stroke-width="2.2" stroke-linecap="round"><path d="M6 13h24M9 19h22M6 25h20"/></g>',
};
const weerIcoon = (soort) => `<svg viewBox="0 0 36 36" aria-hidden="true">${WEER_ICOON[soort] ?? WEER_ICOON.bewolkt}</svg>`;

function tekenWeerknop(buitenC) {
  const icoon = weer?.vandaag?.soort ? weerIcoon(weer.vandaag.soort) : '';
  for (const knop of $$('[data-buiten]')) {
    const tel = knop.closest('#tel') != null;
    const tekst = buitenC == null ? (weer ? 'Het weer' : '') : tel ? `${nl(buitenC, 0)}°` : `${nl(buitenC)}° buiten`;
    knop.innerHTML = `${icoon}${esc(tekst)}`;
    knop.hidden = !tekst;
    knop.disabled = weer == null;
    knop.setAttribute('aria-label', weer ? `${tekst}, het weer van de komende dagen` : tekst);
  }
  // Niet opnieuw opbouwen terwijl het open is: dan verspringt de focus.
  if (weer && $$('[data-weer]').every((b) => b.hidden)) tekenWeer();
}

const DAGNAAM = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: 'UTC' });
const DATUM = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function tekenWeer() {
  const v = weer.vandaag;
  const schaal = Math.max(1, v.heldereLuchtKwh, ...weer.dagen.map((d) => d.heldereLuchtKwh));
  const balk = (kwh) => `<i><b style="width: ${Math.min(100, (kwh / schaal) * 100).toFixed(1)}%"></b></i>`;
  const vandaagKwh = v.verwachtKwh ?? v.opgewektKwh;
  const rijen = [
    `<div class="rij">
      <div class="dag">Vandaag<span>${esc(v.tekst ?? '')}</span></div>${weerIcoon(v.soort)}
      <div class="temp"><span>${state?.explanation?.outdoorTemperatureC == null ? '' : `<b>${nl(state.explanation.outdoorTemperatureC)}°</b> nu`}</span><span>${v.zonkansPct == null ? '' : `${v.zonkansPct}% zon`}</span></div>
      <div class="opbrengst">${balk(vandaagKwh)}<span>${v.verwachtKwh != null ? `${nl(v.verwachtKwh)} kWh` : `${nl(v.opgewektKwh)} kWh tot nu`}</span></div>
    </div>`,
    ...weer.dagen.map((d, i) => {
      const datum = new Date(`${d.datum}T12:00:00Z`);
      const naam = i === 0 ? 'Morgen' : DAGNAAM.format(datum).replace(/^./, (c) => c.toUpperCase());
      return `<div class="rij">
        <div class="dag">${naam}<span>${DATUM.format(datum)}</span></div>${weerIcoon(d.soort)}
        <div class="temp"><span><b>${d.maxC == null ? '–' : `${nl(d.maxC, 0)}°`}</b> ${d.minC == null ? '' : `/ ${nl(d.minC, 0)}°`}</span><span>${d.regenkansPct == null ? '' : `${d.regenkansPct}% regen`}</span></div>
        <div class="opbrengst">${balk(d.verwachtKwh ?? 0)}<span>${d.verwachtKwh == null ? '' : `${nl(d.verwachtKwh)} kWh`}</span></div>
      </div>`;
    }),
  ].join('');
  const geleerd = weer.geleerd?.dagen ? ` Bijgesteld met ${weer.geleerd.dagen === 1 ? 'één dag' : `${weer.geleerd.dagen} dagen`} van je eigen panelen.` : '';
  for (const blad of $$('[data-weer]')) {
    blad.innerHTML = `
      <div class="weerkop"><h2 class="kop-3">Het weer</h2><button class="sluit" type="button" aria-label="Sluiten">×</button></div>
      ${rijen}
      <p class="mini voet">Van Buienradar. De balk is wat je panelen naar verwachting leveren: wat ze op een heldere dag halen, maal het deel bij de zonkans.${geleerd}</p>`;
    blad.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
}

function openWeer(knop) {
  const blad = document.getElementById(knop.getAttribute('aria-controls'));
  if (!blad || !weer) return;
  blad.hidden = false;
  if (blad.id === 'weer-tel') document.querySelector('[data-weer-achter]').hidden = false;
  knop.setAttribute('aria-expanded', 'true');
  blad.querySelector('.sluit')?.focus();
}

function sluitWeer() {
  $$('[data-weer], [data-weer-achter]').forEach((el) => (el.hidden = true));
  $$('[data-buiten]').forEach((k) => k.setAttribute('aria-expanded', 'false'));
}

/* -------------------------------------------------------------- starten */

app.start('thuis');
$$('[data-buiten]').forEach((k) => k.addEventListener('click', () => openWeer(k)));
document.querySelector('[data-weer-achter]').addEventListener('click', sluitWeer);
addEventListener('keydown', (e) => e.key === 'Escape' && sluitWeer());
$$('[data-uitleg]').forEach((b) => b.addEventListener('click', () => (location.href = 'nieuw.html#huis')));
// Een tik op een kamer in het huis opent die kamer.
const openKamer = (e) => {
  const k = e.target.closest('[data-kamer]');
  if (k) location.href = `kamer.html#${encodeURIComponent(k.dataset.kamer)}`;
};
const podium = document.getElementById('podium-wand');
podium.addEventListener('click', openKamer);
podium.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openKamer(e)));
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  teken();
});
