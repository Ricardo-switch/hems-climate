/*
 * Thuis, in ontwerp 2 (besluit 104). De schets is de code: het huis komt uit
 * kit/huis.js, dezelfde tekenmotor als in design/app2. Deze pagina zet alleen
 * de gegevens van de dienst om naar de beschrijving van het huis; uitrekenen
 * doet de dienst (besluit 94).
 *
 * De wand is 800 hoog (1280 breed, of breder op een breed scherm) en wordt als geheel naar het scherm geschaald,
 * zodat er nooit gescrold hoeft te worden. Op een telefoon (staand, of heel smal)
 * staat dezelfde inhoud onder elkaar.
 */
'use strict';

const { $$, nl, zet, esc, haal, deur, tijdVanDeDag, lucht } = app;

let state = null;
let huisData = null;
let zon = null;
let vandaag = null;
let weer = null;
/** De antwoorden bij Zon en aansluiting: hoeveel panelen er liggen. */
let aansluiting = null;
let gekozenZone = null;

/* ------------------------------------------------------- de gegevens */

let eersteKeer = true;

async function laadAlles() {
  const [s, h, z, v, w, a] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/vandaag'), haal('api/weer'), haal('api/aansluiting')]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  if (w.status === 'fulfilled') weer = w.value;
  if (a.status === 'fulfilled') aansluiting = a.value;
  teken();
  // Met #batterijen meteen de lijst, ook als niets bijna leeg is (besluit 131).
  if (eersteKeer && location.hash === '#batterijen') {
    history.replaceState(null, '', location.pathname);
    openWeer(document.querySelector(app.telStand() ? '#tel [data-buiten]' : '#wand [data-buiten]'), 'batterij');
  } else if (eersteKeer && huisData && !gezien()) setTimeout(startRondleiding, 600);
  // De eerste keer de rondleiding, zodra het huis er staat.
  eersteKeer = false;
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
  // Onder het schuine dak: zoals de indeling zegt (besluit 111); een oudere dienst raadt het hier.
  if (top && (huisData.dakEtage !== undefined ? top.id === huisData.dakEtage : etages.length >= 3 || /zolder|dak/i.test(top.naam))) top.dak = true;

  const alles = etagesBovenEerst.flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
  const aircos = alles.filter((a) => a.soort === 'klimaat' && a.klimaat?.kanKoelen);
  const tijd = tijdVanDeDag(zon);
  const helder = zon?.heldereLuchtW ?? 0;
  const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : tijd === 'nacht' ? 0 : 0.3;
  const piekW = (zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
  const maand = new Date().getMonth() + 1;

  // Buiten: de oprit met de auto en de camera, de tuin met het tuinhuis.
  const { oprit, tuin, terras, balkon, voortuin } = huismodel.buiten(buitenRuimtes);

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
    zon: zon?.dag ? { stand: zon.dag.fractie, hoogte: zon.dag.hoogteDeel, aandeel: Math.min(1, (zonKw * 1000) / Math.max(helder, 1500)), ...panelenOpDak(piekW) } : { aandeel: 0, ...panelenOpDak(piekW) },
    etages,
    buitenunit: aircos.length ? { aan: aircos.some((a) => a.aan || ACTIEF.includes(a.klimaat?.actie)) } : null,
    net: true,
    oprit,
    tuin,
    terras,
    balkon,
    voortuin,
    stromen,
    labels,
  };
}

/**
 * Hoeveel panelen het dak toont: wat de bewoner bij Zon en aansluiting
 * invulde, anders geschat uit de wattpiek (een paneel van rond de 400 Wp).
 * Zonder panelen in de configuratie: geen panelen op het dak.
 */
function aantalPanelen(piekW) {
  const p = aansluiting?.antwoorden?.panelen;
  const gezegd = p ? (p.ligging === 'beide' ? (p.voorkant ?? 0) + (p.achterkant ?? 0) : (p.aantal ?? 0)) : 0;
  if (gezegd > 0) return gezegd;
  return piekW > 0 ? Math.max(1, Math.round(piekW / 400)) : 0;
}

/**
 * Hoe de panelen over het dak liggen (besluit 111): op beide kanten verdeeld,
 * zoals de bewoner opgaf of half om half; anders alles op het zichtbare vlak.
 */
function panelenOpDak(piekW) {
  const totaal = aantalPanelen(piekW);
  const p = aansluiting?.antwoorden?.panelen;
  if (p?.ligging !== 'beide' || totaal === 0) return { panelen: totaal, panelenLinks: 0 };
  const voor = p.voorkant ?? Math.ceil(totaal / 2);
  const achter = p.achterkant ?? totaal - voor;
  return { panelen: voor || Math.ceil(totaal / 2), panelenLinks: achter };
}

/** Het klimaatapparaat bij een actuator, zoals het huis het noemt. */
function apparaatVan(actuatorId) {
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) for (const d of r.apparaten ?? []) if (d.actuatorId === actuatorId) return d;
  return null;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  if (!state || !huisData) return;

  const e = state.explanation ?? {};
  const kop = state.bewoner?.kop ?? {};
  zet('[data-kop]', kop.titel ?? 'Het huis');
  zet('[data-zin]', kop.zin ?? '');
  tekenWeerknop();
  const modus = e.modeSource === 'schedule' ? 'Automatisch' : { dag: 'Dag', nacht: 'Nacht', afwezig: 'Afwezig', vakantie: 'Vakantie', handmatig: 'Handmatig' }[e.mode] ?? 'Automatisch';
  $$('[data-modus]').forEach((el) => (el.innerHTML = `${esc(modus)} <span aria-hidden="true" style="color: var(--gedempt)">▾</span>`));
  // Op de telefoon alleen een stand die afwijkt (besluit 136): anders past de bel er niet naast.
  $$('#tel [data-modus]').forEach((el) => (el.hidden = modus === 'Automatisch'));

  const model = huisModel();
  lucht(model.tijd, model.seizoen, model.wolken);
  // Een nieuw huis (nog het voorstel uit Home Assistant): de weg naar Inrichten (besluit 114).
  $$('[data-inrichten]').forEach((el) => (el.hidden = huisData?.indeling !== 'voorstel'));
  // Een batterij onder de 10% (besluit 122): de leegste; een tik opent de lijst (besluit 127).
  const leeg = (huisData?.batterijen ?? []).filter((b) => b.pct < 10);
  $$('[data-batterij]').forEach((el) => {
    el.hidden = leeg.length === 0;
    if (!leeg.length) return;
    const b = leeg[0];
    el.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="M5 10v4"/></svg><span>${leeg.length === 1 ? `Batterij bijna leeg: ${esc(b.naam)}, ${b.pct}%` : `${leeg.length} batterijen bijna leeg, ${esc(b.naam)} ${b.pct}%`}</span>`;
  });
  if (blad === 'batterij' && $$('[data-weer]').some((x) => !x.hidden)) tekenBatterijen();
  // Een airco-filter onder de 10% (besluit 129): net als een batterij, met een tik naar de airco.
  const vol = huisData?.filters ?? [];
  $$('[data-filter]').forEach((el) => {
    el.hidden = vol.length === 0;
    if (!vol.length) return;
    const f = vol[0];
    el.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 12h10M7 15h10"/></svg><span>Filter schoonmaken: ${esc(f.naam)}, ${f.pct}%</span>`;
    el.href = `kamer.html#${encodeURIComponent(f.kamerId)}/${encodeURIComponent(f.id)}`;
  });
  const wandPodium = document.getElementById('podium-wand');
  if (!app.telStand()) huis.teken(wandPodium, model, { breedte: wandPodium.clientWidth || 860, hoogte: 612, schuifX: 18, schuifY: 20, tik: true });
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((et) => ({ ...et, kamers: et.kamers.map((k) => ({ ...k, stil: true })) })), labels: model.labels.filter((l) => l.bij === 'panelen').map((l) => ({ ...l, dx: -40, dy: -84 })) }, { breedte: 390, hoogte: 360, marge: 0.03, schuifY: 14, tik: true });

  tekenVandaag();
  tekenStraks();
  tekenApparaat();
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
  // De apparaten die op zon kunnen koelen of verwarmen: de airco's en warmtepompen.
  const banen = (vandaag.apparaten ?? []).filter((a) => apparaatVan(a.actuatorId)?.klimaat?.kanKoelen).slice(0, 3);
  const banenSvg = banen
    .map((a, i) => {
      const yy = 104 + i * 15;
      const naam = apparaatVan(a.actuatorId)?.naam ?? a.actuatorId;
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
/** Een uitstelbaar apparaat dat draait of klaarstaat, als kaart: met de eindtijd (besluit 98). */
function tekenApparaat() {
  const kaart = document.querySelector('[data-apparaatkaart]');
  const d = (state?.bewoner?.uitstelbaar ?? []).find((x) => x.stand === 'running') ?? (state?.bewoner?.uitstelbaar ?? []).find((x) => x.stand === 'waiting' || x.stand === 'would_start');
  if (!d) {
    kaart.hidden = true;
    return;
  }
  const s = (vandaag?.uitstelbaar ?? []).find((u) => u.id === d.id)?.draaide?.at(-1);
  const loopt = d.stand === 'running' && s && Date.now() - s.totMs < 5 * 60_000;
  const klaar = loopt && d.duurMin ? s.vanMs + d.duurMin * 60_000 : null;
  const deel = klaar ? Math.min(1, (Date.now() - s.vanMs) / (d.duurMin * 60_000)) : d.stand === 'running' ? 1 : 0;
  const rest = klaar ? Math.max(0, Math.round((klaar - Date.now()) / 60_000)) : null;
  const R = 2 * Math.PI * 24;
  const ring = `<svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="5" ${d.stand === 'running' ? '' : 'stroke-dasharray="3 5"'}/>${deel > 0 ? `<circle cx="28" cy="28" r="24" fill="none" stroke="#F7B548" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(deel * R).toFixed(1)} ${R.toFixed(1)}" transform="rotate(-90 28 28)"/>` : ''}${rest != null ? `<text x="28" y="33" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="13" fill="#EEF3F7">${rest >= 60 ? `${Math.floor(rest / 60)}u${String(rest % 60).padStart(2, '0')}` : `${rest}m`}</text>` : ''}</svg>`;
  const zin = klaar ? `Draait, klaar rond ${new Date(klaar).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : d.kop;
  kaart.innerHTML = `${ring}<span><b>${esc(d.naam)}</b><span class="klein zon-t">${esc(zin)}</span></span>`;
  kaart.hidden = false;
}

function tekenStraks() {
  const wacht = (state.rejected ?? []).find((r) => r.blockedBy === 'insufficient_power_budget' && r.intent?.budgetW > 0);
  const kaarten = $$('[data-straks]');
  if (!wacht) {
    kaarten.forEach((k) => (k.hidden = true));
    return;
  }
  const actie = wacht.intent.action === 'heat' ? 'warmen' : 'koelen';
  zet('[data-straks-kop]', `${huismodel.metHoofdletter(zoneNaam(wacht.intent.zoneId, huisData))} gaat ${actie} bij ${nl(wacht.intent.budgetW / 1000)} kW zon`);
  const over = Math.max(0, state.explanation?.budget?.availableW ?? 0);
  zet('[data-straks-zin]', `${over >= 50 ? `Nu is er ${nl(over / 1000)} kW over.` : 'Nu is er geen zon over.'} Zodra er genoeg is, begint hij vanzelf.`);
  kaarten.forEach((k) => (k.hidden = false));
}

/*
 * Hoe voelt het? (besluit 134): de kaart komt uit gevoel.js. Kiezen welke
 * kamer kan met de knoppen erboven; de eerste keer de kamer met een regeling
 * op de laagste etage, meestal waar je woont.
 */
function tekenGevoel() {
  const zones = huisData.etages.flatMap((e) => e.ruimtes).filter((r) => r.zoneId && r.temperatuurC != null);
  if (!zones.length) return;
  gekozenZone ??= ([...huisData.etages].reverse().flatMap((e) => e.ruimtes).find((r) => r.zoneId && r.temperatuurC != null) ?? zones[0]).zoneId;
  const kamer = zones.find((r) => r.zoneId === gekozenZone) ?? zones[0];
  zet('[data-gevoel-kop]', 'Hoe voelt het nu?');
  $$('[data-gevoel-uitleg]').forEach((el) => (el.hidden = true));
  const html = gevoel.html({ zoneId: kamer.zoneId, kamers: zones.map((r) => ({ zoneId: r.zoneId, naam: r.naam, c: r.temperatuurC })), state });
  $$('[data-gevoel]').forEach((el) => {
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  });
}
gevoel.bij(() => teken());
addEventListener('gevoelzone', (e) => {
  gekozenZone = e.detail;
  teken();
});

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
  // Een heldere nacht (besluit 128): een maan, met een wolk erbij als het half bewolkt is.
  nacht: '<path d="M22 7a10 10 0 1 0 8 15A9 9 0 0 1 22 7z" fill="#DDE6F0"/>',
  nachthalf: '<path d="M18 5a8 8 0 1 0 7 12A7 7 0 0 1 18 5z" fill="#DDE6F0"/><path d="M12 29h14a5.5 5.5 0 0 0 .5-11A7.5 7.5 0 0 0 12.4 20 4.5 4.5 0 0 0 12 29z" fill="#B8C4CF"/>',
};
const weerIcoon = (soort) => `<svg viewBox="0 0 36 36" aria-hidden="true">${WEER_ICOON[soort] ?? WEER_ICOON.bewolkt}</svg>`;
/** Een uur 's nachts: de maan in plaats van de zon. */
const uurIcoon = (u) => weerIcoon(u.nacht && u.soort === 'zon' ? 'nacht' : u.nacht && u.soort === 'half' ? 'nachthalf' : u.soort);
const UUR = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });

/** De buitentemperatuur: van de eigen sensor, of anders van de weerbron (besluit 128). */
const buitenNu = () => state?.explanation?.outdoorTemperatureC ?? weer?.vandaag?.buitenC ?? null;

function tekenWeerknop() {
  const buitenC = buitenNu();
  const icoon = weer?.vandaag?.soort ? weerIcoon(weer.vandaag.soort) : '';
  for (const knop of $$('[data-buiten]')) {
    const tel = knop.closest('#tel') != null;
    // Zonder temperatuur het weer in woorden, zoals "Zonnig".
    const tekst = buitenC == null ? (weer ? (weer.vandaag?.tekst ?? 'Het weer') : '') : tel ? `${nl(buitenC, 0)}°` : `${nl(buitenC)}° buiten`;
    knop.innerHTML = `${icoon}${esc(tekst)}`;
    knop.hidden = !tekst;
    knop.disabled = weer == null;
    knop.setAttribute('aria-label', weer ? `${tekst}, het weer van de komende dagen` : tekst);
  }
  // Niet opnieuw opbouwen terwijl het open is: dan verspringt de focus.
  if (weer && $$('[data-weer]').every((b) => b.hidden)) tekenWeer();
}

/** Wat het blad nu toont: het weer of de batterijen (besluit 127). */
let blad = 'weer';

/**
 * De batterijen in huis (besluit 127): elk klein apparaat met een batterij, de
 * leegste eerst, met een tik naar zijn kamer. Telefoons, een thuisbatterij en
 * een auto staan er niet in; dat doet de dienst.
 */
function tekenBatterijen() {
  blad = 'batterij';
  const lijst = huisData?.batterijen ?? [];
  const rijen = lijst.map((b) => {
    const tag = b.kamerId ? 'a' : 'div';
    const href = b.kamerId ? ` href="kamer.html#${encodeURIComponent(b.kamerId)}"` : '';
    return `<${tag} class="accu${b.pct < 10 ? ' leeg' : ''}"${href}>
      <b>${esc(b.naam)}</b><span class="pct">${b.pct}%</span>
      <span>${esc(b.kamer ?? 'Nog in geen kamer')}</span>
      <i><b style="width: ${Math.max(2, Math.min(100, b.pct))}%"></b></i>
    </${tag}>`;
  }).join('');
  for (const el of $$('[data-weer]')) {
    el.setAttribute('aria-label', 'Batterijen');
    el.innerHTML = `
      <div class="weerkop"><h2 class="kop-3">Batterijen</h2><button class="sluit" type="button" aria-label="Sluiten">×</button></div>
      ${rijen || '<p class="mini">Geen apparaten met een batterij gevonden.</p>'}
      <p class="mini voet">Onder de 10% staat een batterij op het startscherm. Telefoons, een thuisbatterij en een auto staan hier niet bij.</p>`;
    el.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
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
      <div class="temp"><span>${buitenNu() == null ? '' : `<b>${nl(buitenNu())}°</b> nu`}</span><span>${v.zonkansPct == null ? '' : `${v.zonkansPct}% zon`}</span></div>
      <div class="opbrengst">${balk(vandaagKwh)}<span>${v.verwachtKwh != null ? `${nl(v.verwachtKwh)} kWh` : `${nl(v.opgewektKwh)} kWh tot nu`}</span></div>
    </div>${urenStrook(v.uren ?? [])}`,
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
  const g = weer.geleerd ?? { dagen: 0 };
  const geleerd = g.lijn
    ? ` Het verband tussen zonkans en opbrengst komt uit ${g.dagen} dagen van je eigen panelen.`
    : g.dagen
      ? ` Bijgesteld met ${g.dagen === 1 ? 'één dag' : `${g.dagen} dagen`} van je eigen panelen.`
      : '';
  blad = 'weer';
  for (const blad of $$('[data-weer]')) {
    blad.setAttribute('aria-label', 'Het weer');
    blad.innerHTML = `
      <div class="weerkop"><h2 class="kop-3">Het weer</h2><button class="sluit" type="button" aria-label="Sluiten">×</button></div>
      ${rijen}
      <p class="mini voet">Van ${esc(weer.bron ?? 'Buienradar')}. De balk is wat je panelen naar verwachting leveren: wat ze op een heldere dag halen, maal het deel bij de zonkans.${geleerd}</p>`;
    blad.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
}

/**
 * Het weer per uur, de komende 24 uur (besluit 128): een strook om opzij te
 * vegen, met de regenkans als die er toe doet.
 */
function urenStrook(uren) {
  if (!uren.length) return '';
  const cellen = uren.map((u, i) => `<div class="uur"><span>${i === 0 ? 'Nu' : esc(UUR.format(new Date(u.tMs)))}</span>${uurIcoon(u)}<b>${u.buitenC == null ? '–' : `${nl(u.buitenC, 0)}°`}</b><span class="kans">${u.regenkansPct != null && u.regenkansPct >= 30 ? `${u.regenkansPct}%` : ''}</span></div>`).join('');
  return `<div class="uren" role="list" aria-label="Het weer per uur">${cellen}</div>`;
}

function openWeer(knop, soort = 'weer') {
  const blad = document.getElementById(knop.getAttribute('aria-controls'));
  if (!blad || (soort === 'weer' && !weer)) return;
  // Nog eens op de knop: weer dicht.
  if (!blad.hidden) {
    sluitWeer();
    return;
  }
  if (soort === 'batterij') tekenBatterijen();
  else tekenWeer();
  blad.hidden = false;
  if (blad.id === 'weer-tel') document.querySelector('[data-weer-achter]').hidden = false;
  knop.setAttribute('aria-expanded', 'true');
  blad.querySelector('.sluit')?.focus();
}

function sluitWeer() {
  $$('[data-weer], [data-weer-achter]').forEach((el) => (el.hidden = true));
  $$('[data-buiten], [data-batterij]').forEach((k) => k.setAttribute('aria-expanded', 'false'));
}

/* -------------------------------------------------------- de rondleiding */

/*
 * De rondleiding (schets Wand-Uitleg): de eerste keer vanzelf, daarna achter
 * "Zo werkt het huis". Het huis licht op boven een donker vlak; een ring wijst
 * aan, een ballon vertelt. Of hij gezien is, onthoudt alleen deze browser.
 */
const GEZIEN = 'sc-rondleiding-gezien';
const STAPPEN = [
  {
    kop: 'Dit is je huis',
    tekst: 'Alles wat er nu gebeurt, staat erin: wat er koelt of verwarmt, de zon op het dak, de lampen die branden. De kleur van een kamer zegt wat hij doet.',
    kaart: ['Huis', 'Wat er nu gebeurt, alle stromen'],
  },
  {
    kop: 'Tik op een kamer',
    tekst: 'Dan zie je de etage van dichtbij en alles wat erin is: de lampen, de screens, de airco of de thermostaat.',
    kaart: ['Etage', 'De kamers, de lampen, de screens'],
  },
  {
    kop: 'Tik op een apparaat',
    tekst: 'Lampen en scènes bedien je meteen. Bij klimaat en screens zegt het huis wat het zou doen; zelf schakelen doet het pas na het meekijken.',
    kaart: ['Kamer en apparaat', 'Tik op een apparaat om het te bedienen'],
  },
];
let stap = -1;

function gezien() {
  try {
    return localStorage.getItem(GEZIEN) === '1';
  } catch {
    return true;
  }
}

/** De plek van tikvlakken op de wand, in de maat van de wand (800 hoog). */
function plekOpWand(vlakken) {
  const wand = document.getElementById('wand');
  const w = wand.getBoundingClientRect();
  const s = w.height / 800;
  const r = vlakken.map((v) => v.getBoundingClientRect());
  if (!r.length || !s) return null;
  const links = Math.min(...r.map((x) => x.left));
  const rechts = Math.max(...r.map((x) => x.right));
  const boven = Math.min(...r.map((x) => x.top));
  const onder = Math.max(...r.map((x) => x.bottom));
  return { x: ((links + rechts) / 2 - w.left) / s, y: ((boven + onder) / 2 - w.top) / s };
}

function startRondleiding() {
  stap = 0;
  document.body.classList.add('rondleiding');
  $$('[data-rond]').forEach((el) => (el.hidden = false));
  tekenStappenkaarten();
  toonStap();
}

function stopRondleiding() {
  stap = -1;
  document.body.classList.remove('rondleiding');
  $$('[data-rond], [data-tik], [data-stappen]').forEach((el) => (el.hidden = true));
  $$('.ballon').forEach((b) => b.remove());
  try {
    localStorage.setItem(GEZIEN, '1');
  } catch {
    // Dan de volgende keer opnieuw; dat is niet erg.
  }
  document.querySelector(app.telStand() ? '#tel [data-uitleg]' : '#wand [data-uitleg]')?.focus();
}

function volgende() {
  if (stap >= STAPPEN.length - 1) stopRondleiding();
  else {
    stap += 1;
    toonStap();
  }
}

function toonStap() {
  const s = STAPPEN[stap];
  const laatste = stap === STAPPEN.length - 1;
  const stippen = STAPPEN.map((_, i) => `<i class="${i === stap ? 'aan' : ''}"></i>`).join('');
  const knoppen = `${laatste ? '' : '<button type="button" class="overslaan" data-overslaan>Overslaan</button>'}<button type="button" data-volgende>${laatste ? 'Klaar' : 'Volgende'}</button>`;
  for (const plek of ['wand', 'tel']) {
    const ouder = plek === 'wand' ? document.querySelector('#wand main') : document.getElementById('tel');
    let ballon = ouder.querySelector('.ballon');
    if (!ballon) {
      ballon = document.createElement('div');
      ballon.className = 'ballon';
      ballon.setAttribute('role', 'dialog');
      ballon.addEventListener('click', (e) => {
        if (e.target.closest('[data-overslaan]')) stopRondleiding();
        else if (e.target.closest('[data-volgende]')) volgende();
      });
      ouder.append(ballon);
    }
    ballon.setAttribute('aria-label', `Uitleg, stap ${stap + 1} van ${STAPPEN.length}`);
    ballon.innerHTML = `<h2>${esc(s.kop)}</h2><p>${esc(s.tekst)}</p><div class="onder"><span class="stippen" aria-hidden="true">${stippen}</span><span>${knoppen}</span></div>`;
  }
  // Op de wand: de ring op het huis, daarna op de kamer met een regeling.
  const vlakken = [...document.querySelectorAll('#podium-wand .sc-tik')];
  // De kamer met een regeling op de laagste etage: meestal de woonkamer.
  const zoneKamer = [...(huisData?.etages ?? [])].reverse().flatMap((e) => e.ruimtes).find((r) => r.zoneId && vlakken.some((v) => v.dataset.kamer === r.id))?.id;
  const kamer = vlakken.find((v) => v.dataset.kamer === zoneKamer) ?? vlakken[0];
  const doel = plekOpWand(stap === 0 ? vlakken : kamer ? [kamer] : []) ?? { x: 430, y: 420 };
  const tik = document.querySelector('[data-tik]');
  tik.hidden = false;
  tik.style.left = `${doel.x}px`;
  tik.style.top = `${doel.y}px`;
  const ballon = document.querySelector('#wand .ballon');
  const rechts = doel.x + 50 + 330 < 1250;
  ballon.className = `ballon ${rechts ? 'rechts' : 'links'}`;
  ballon.style.left = `${rechts ? doel.x + 50 : doel.x - 50 - 330}px`;
  ballon.style.top = `${Math.max(90, Math.min(470, doel.y - 56))}px`;
  $$('.stap').forEach((el, i) => el.classList.toggle('nu', i === stap));
  document.querySelector(`${app.telStand() ? '#tel' : '#wand'} .ballon [data-volgende]`)?.focus();
}

/** De drie stappen onderaan, elk met een klein huis: het hele huis, een etage, een kamer. */
function tekenStappenkaarten() {
  const box = document.querySelector('[data-stappen]');
  box.hidden = false;
  box.innerHTML = STAPPEN.map((s, i) => `<div class="stap${i === 0 ? ' nu' : ''}"><div class="mini-huis" data-mini="${i}"></div><div><b>${esc(s.kaart[0])}</b><span class="mini">${esc(s.kaart[1])}</span></div></div>`).join('');
  if (!huisData) return;
  const model = huisModel();
  const stil = (k) => ({ ...k, stil: true });
  const etage = model.etages.find((e) => e.kamers.some((k) => k.stand)) ?? model.etages[0];
  const kamer = etage?.kamers.find((k) => k.stand) ?? etage?.kamers[0];
  const mini = { breedte: 92, hoogte: 70, marge: 0.02 };
  huis.teken(box.querySelector('[data-mini="0"]'), { tijd: model.tijd, etages: model.etages.map((e) => ({ ...e, kamers: e.kamers.map(stil) })), zon: { aandeel: model.zon.aandeel ?? 0 } }, mini);
  if (etage) huis.teken(box.querySelector('[data-mini="1"]'), { tijd: model.tijd, zonderDak: true, etages: [{ kamers: etage.kamers.map(stil) }] }, mini);
  if (kamer) huis.teken(box.querySelector('[data-mini="2"]'), { tijd: model.tijd, zonderDak: true, etages: [{ kamers: [stil(kamer)] }] }, mini);
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('thuis');
$$('[data-buiten]').forEach((k) => k.addEventListener('click', () => openWeer(k)));
$$('[data-batterij]').forEach((k) => k.addEventListener('click', () => openWeer(k, 'batterij')));
document.querySelector('[data-weer-achter]').addEventListener('click', sluitWeer);
// Tikken naast het blad sluit het ook, net als Escape.
document.addEventListener('pointerdown', (e) => {
  const open = $$('[data-weer]').some((b) => !b.hidden);
  if (open && !e.target.closest('[data-weer], [data-buiten], [data-batterij]')) sluitWeer();
});
// Op de telefoon: het blad naar beneden vegen.
const telBlad = document.getElementById('weer-tel');
let veegVan = null;
telBlad.addEventListener('touchstart', (e) => (veegVan = telBlad.scrollTop <= 0 ? e.touches[0].clientY : null), { passive: true });
telBlad.addEventListener('touchmove', (e) => {
  if (veegVan == null) return;
  const dy = Math.max(0, e.touches[0].clientY - veegVan);
  telBlad.style.transform = `translateY(${dy}px)`;
}, { passive: true });
telBlad.addEventListener('touchend', (e) => {
  const dy = veegVan == null ? 0 : e.changedTouches[0].clientY - veegVan;
  telBlad.style.transform = '';
  veegVan = null;
  if (dy > 70) sluitWeer();
});
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  sluitWeer();
  if (stap >= 0) stopRondleiding();
});
$$('[data-uitleg]').forEach((b) => b.addEventListener('click', startRondleiding));
// Een tik op een kamer in het huis opent die kamer.
const openKamer = (e) => {
  const k = e.target.closest('[data-kamer]');
  if (k) location.href = `kamer.html#${encodeURIComponent(k.dataset.kamer)}`;
};
for (const podium of [document.getElementById('podium-wand'), document.getElementById('podium-tel')]) {
  podium.addEventListener('click', openKamer);
  podium.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openKamer(e)));
}
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  teken();
});
