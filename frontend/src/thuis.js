/*
 * Thuis, in ontwerp 2 (besluit 104). De schets is de code: het huis komt uit
 * kit/huis.js, dezelfde tekenmotor als in design/app2. Deze pagina zet alleen
 * de gegevens van de dienst om naar de beschrijving van het huis; uitrekenen
 * doet de dienst (besluit 94).
 *
 * De wand is 800 hoog (1280 breed, of breder op een breed scherm) en wordt als geheel naar het scherm geschaald,
 * zodat er nooit gescrold hoeft te worden. Op een telefoon (staand, of heel smal)
 * staat dezelfde inhoud onder elkaar (besluit 159, schets Thuis-Tel), met de
 * Assistent in een vraagbalk die altijd boven de tabs staat.
 */
'use strict';

const { $$, zet, esc, haal, deur, tijdVanDeDag, lucht, bijnaOp } = app;
// De teksten staan in kit/teksten.*.js (besluit 185); getallen en tijden in de taal van de app.
const { t, getal, klok, opmaak } = taal;
const vet = taal.html;

let state = null;
let huisData = null;
let zon = null;
let vandaag = null;
let weer = null;
/** De antwoorden bij Zon en aansluiting: hoeveel panelen er liggen. */
let aansluiting = null;
let gekozenZone = null;
/** Wie hier woont en wiens comfort geldt (besluit 147); null zonder bewoners. */
let bewoners = null;

/* ------------------------------------------------------- de gegevens */

let eersteKeer = true;

async function laadAlles() {
  const [s, h, z, v, w, a, b] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/vandaag'), haal('api/weer'), haal('api/aansluiting'), haal('api/bewoners'), eigen.laad()]);
  if (b.status === 'fulfilled') bewoners = b.value;
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  if (w.status === 'fulfilled') weer = w.value;
  if (a.status === 'fulfilled') aansluiting = a.value;
  // De kaarten van besluit 182: alleen ophalen wat er gekozen is.
  await kaartGegevens();
  teken();
  if (eersteKeer) eigen.vanInstellingen();
  // Met #batterijen meteen de lijst, ook als niets bijna leeg is (besluit 131).
  if (eersteKeer && location.hash === '#batterijen') {
    history.replaceState(null, '', location.pathname);
    openWeer(document.querySelector(app.telStand() ? '#tel [data-buiten]' : '#wand [data-buiten]'), 'batterij');
  }
  eersteKeer = false;
}

/* --------------------------------------- van de dienst naar het huis */

const { kleurVanLicht, zoneNaam } = huismodel;
const kamerModel = (r) => huismodel.kamerModel(r, state);

function huisModel() {
  const s = state?.bewoner?.stromen ?? {};
  const zonKw = s.zonKw ?? 0;
  const netKw = s.netKw ?? 0;
  // De tekening zelf komt uit huismodel, net als op de andere pagina's (5S).
  // Huis 3.0 (besluit 187): de kelder onder de grond, op een eiland met het weer van nu.
  const tek = huismodel.tekening(huisData, { kamer: kamerModel, zon });
  const { etages } = tek;
  const tijd = tijdVanDeDag(zon);
  const helder = zon?.heldereLuchtW ?? 0;
  const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : tijd === 'nacht' ? 0 : 0.3;
  const piekW = tek.piekW;
  // Hoe de panelen liggen, zoals bij Inrichten (besluit 166): per kant bij beide kanten.
  const opDak = huismodel.panelenOpDak(aansluiting?.antwoorden?.panelen, piekW);
  const maand = new Date().getMonth() + 1;
  const elders = aansluiting?.antwoorden?.elders ?? {};
  const nuWeer = weer?.vandaag?.soort;

  const stromen = [];
  const koelend = etages.flatMap((e) => e.kamers).find((k) => k.apparaten.some((a) => a.soort === 'airco' && a.aan));
  if (zonKw > 0.05) stromen.push({ van: 'zon', naar: koelend ? `kamer:${koelend.naam}` : 'huis', sterkte: Math.min(1, zonKw / 3) });
  if (netKw < -0.05) stromen.push({ van: 'zon', naar: 'net', sterkte: Math.min(1, -netKw / 3) });
  if (netKw > 0.05) stromen.push({ van: 'net', naar: 'huis', sterkte: Math.min(1, netKw / 3) });

  const labels = [];
  // Zonder slimme meter (besluit 196): bij de panelen wat er geschat over is, en geen label bij het net.
  const over = s.geschat && zonKw > 0.05 ? [t('thuis.label.overGeschat', { kw: getal(s.overKw ?? 0) })] : [];
  if (zonKw > 0.05) labels.push({ bij: 'panelen', titel: `${getal(zonKw)} kW`, groot: true, toon: 'zon', regels: [t('thuis.label.panelen'), ...over], dx: 64, dy: -70 });
  // Van het net in violet, terug in groen: dezelfde kleur als de lijn (besluit 187).
  if (!s.geschat) labels.push({ bij: 'net', titel: netKw > 0.05 ? t('thuis.label.vanNet', { kw: getal(netKw) }) : netKw < -0.05 ? t('thuis.label.terug', { kw: getal(-netKw) }) : t('thuis.label.nietsNet'), toon: netKw > 0.05 ? 'violet' : 'mint', dx: 40, dy: 64 });

  return {
    beschrijving: `${state?.bewoner?.kop?.titel ?? t('thuis.hetHuis')}. ${state?.bewoner?.kop?.zin ?? ''}`,
    tijd,
    // De seizoenen (besluit 187): kale bomen in de winter, oranje in de herfst.
    seizoen: maand === 12 || maand <= 2 ? 'winter' : maand >= 10 ? 'herfst' : 'zomer',
    weer: nuWeer === 'regen' || nuWeer === 'onweer' ? 'regen' : nuWeer === 'sneeuw' ? 'sneeuw' : undefined,
    wolken,
    // De zon op zijn boog, aan de kant van het oosten. De ring van de dag staat bij Zonnepanelen (besluit 205):
    // op Thuis liep hij door de kop, de stromen en de labels.
    zon: zon?.dag ? { stand: zon.dag.fractie, hoogte: zon.dag.hoogteDeel, aandeel: Math.min(1, (zonKw * 1000) / Math.max(helder, 1500)), opRechts: huismodel.zonOpRechts(aansluiting?.ligging, aansluiting?.antwoorden?.panelen) ?? undefined, ...opDak } : { aandeel: 0, ...opDak },
    // Het huis zelf, zoals elke pagina het tekent (besluit 191), met de panelen op een ander dak (besluit 187).
    // Geen kompas op Thuis (24 oktober 2026): dat hoort bij Zonnepanelen.
    ...gekozenBuiten(huismodel.huisDelen(tek, elders)),
    net: true,
    stromen,
    labels,
  };
}

/**
 * Het deel buiten waarvan het blad open is, licht op in het huis (besluit 206):
 * een zone in de tuin op zijn plek, en de oprit, de garage of een ander deel
 * met een stippellijn eromheen.
 */
function gekozenBuiten(delen) {
  const k = buitenKeuze;
  if (!k || k.alles) return delen;
  const uit = { ...delen };
  for (const naam of ['oprit', 'tuin', 'terras', 'voortuin', 'garage', 'balkon']) {
    const deel = uit[naam];
    if (!deel || deel.id !== k.kamer) continue;
    const zone = naam === 'tuin' && k.zone ? Object.entries(deel.zones ?? {}).find(([, z]) => z.id === k.zone)?.[0] : null;
    uit[naam] = zone ? { ...deel, zone } : { ...deel, gekozen: true };
  }
  if (uit.tuin && uit.tuin.tuinhuisId === k.kamer) uit.tuin = { ...uit.tuin, tuinhuisGekozen: true };
  return uit;
}

/**
 * Op de telefoon onder het huis (besluit 187): van de zon, naar het huis, en
 * van of naar het net, in de kleur van de lijnen. Op de wand staat het net als
 * label bij het huis.
 */
function tekenStromenTel() {
  const el = document.querySelector('#tel [data-stromen]');
  if (!el) return;
  const s = state?.bewoner?.stromen;
  if (!s) return void (el.hidden = true);
  // Drie vakjes zonder pijlen (24 oktober 2026: een pijl naar links zei niets): de zon, het huis en het net, elk met een icoon in de kleur van zijn lijn.
  const ik = (pad) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;
  const ZON = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>';
  const HUIS = '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>';
  const NET = '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';
  const vak = (pad, kleur, kw, woord) => `<div class="${kleur}"><i>${ik(pad)}</i><b>${esc(kw)}</b><span>${esc(woord)}</span></div>`;
  const netKw = s.netKw ?? 0;
  const delen = [];
  // De zon alleen als het huis panelen heeft; 's nachts gewoon 0.
  if (s.zonKw != null) delen.push(vak(ZON, 'zon-t', `${getal(s.zonKw)} kW`, t('thuis.stromen.zon')));
  // Zonder slimme meter (besluit 196): wat er geschat over is, en geen net.
  if (s.geschat) {
    if (s.overKw != null) delen.push(vak(HUIS, '', `± ${getal(s.overKw)} kW`, t('thuis.stromen.overGeschat')));
    el.innerHTML = delen.join('');
    el.hidden = !delen.length;
    return;
  }
  if (s.verbruikKw != null) delen.push(vak(HUIS, '', `${getal(s.verbruikKw)} kW`, t('thuis.stromen.huis')));
  delen.push(netKw > 0.05
    ? vak(NET, 'violet-t', `${getal(netKw)} kW`, t('thuis.stromen.vanNet'))
    : netKw < -0.05
      ? vak(NET, 'mint-t', `${getal(-netKw)} kW`, t('thuis.stromen.terug'))
      : vak(NET, '', '0 kW', t('thuis.stromen.net')));
  el.innerHTML = delen.join('');
  el.hidden = false;
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
  zet('[data-kop]', kop.titel ?? t('thuis.hetHuis'));
  zet('[data-zin]', kop.zin ?? '');
  tekenWeerknop();
  const modus = e.modeSource === 'schedule' ? 'automatisch' : ['dag', 'nacht', 'afwezig', 'vakantie', 'handmatig'].includes(e.mode) ? e.mode : 'automatisch';
  $$('[data-modus]').forEach((el) => (el.innerHTML = `${esc(t(`thuis.stand.${modus}`))} <span aria-hidden="true" style="color: var(--gedempt)">▾</span>`));
  // Op de telefoon alleen een stand die afwijkt (besluit 136): anders past de bel er niet naast.
  $$('#tel [data-modus]').forEach((el) => (el.hidden = modus === 'automatisch'));

  const model = huisModel();
  lucht(model.tijd, model.seizoen, model.wolken);
  // Een nieuw huis (nog het voorstel uit Home Assistant): de weg naar Inrichten (besluit 114).
  $$('[data-inrichten]').forEach((el) => (el.hidden = huisData?.indeling !== 'voorstel'));
  // De begroeting (15 oktober 2026), naar de tijd van de dag, met wie je bent (besluit 147).
  const uur = new Date().getHours();
  const groet = t(`thuis.groet.${uur < 6 ? 'nacht' : uur < 12 ? 'morgen' : uur < 18 ? 'middag' : 'avond'}`);
  // Ieder in zijn eigen kleur (besluit 181).
  const namen = huismodel.groetWie(bewoners);
  $$('[data-groet]').forEach((el) => (el.innerHTML = namen.length ? `${esc(groet)}, ${namen.map((n) => `<b data-kleur="${esc(app.kleurVan(n.id))}">${esc(n.naam)}</b>`).reduce((acc, n, i, a) => (i === 0 ? n : `${acc}${i === a.length - 1 ? ` ${esc(t('algemeen.en'))} ` : ', '}${n}`), '')}` : esc(groet)));
  tekenGeldt();
  tekenOnderhoud();
  if (blad === 'batterij' && $$('[data-weer]').some((x) => !x.hidden)) tekenBatterijen();
  if (blad === 'buiten' && buitenKeuze && $$('[data-weer]').some((x) => !x.hidden)) tekenBuiten();
  // De knop Buiten (besluit 206): alleen als er iets buiten is, met hoeveel lampen er branden.
  const buitenAan = buitenBlad.aantalAan(huisData);
  $$('[data-alles-buiten]').forEach((k) => {
    k.hidden = !buitenBlad.heeftBuiten(huisData);
    k.querySelector('[data-alles-buiten-aantal]').textContent = buitenAan ? String(buitenAan) : '';
  });
  const wandPodium = document.getElementById('podium-wand');
  if (!app.telStand()) huis.teken(wandPodium, model, { breedte: wandPodium.clientWidth || 860, hoogte: 612, marge: 0.04, schuifX: 10, schuifY: 10, tik: true });
  // Eenvoudig (besluit 164): geen getallen op het huis.
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((et) => ({ ...et, kamers: et.kamers.map((k) => ({ ...k, stil: true })) })), labels: app.weergave().eenvoudig ? [] : model.labels.filter((l) => l.bij === 'panelen').map((l) => ({ ...l, dx: -40, dy: -84 })) }, { breedte: 390, hoogte: 330, marge: 0.03, schuifY: -6, tik: true });
  tekenStromenTel();

  tekenVandaag();
  tekenStraks();
  tekenApparaat();
  tekenGevoel();
  tekenKamersTel();
  tekenMorgen();
  tekenLading();
  tekenMaand();
  tekenSluip();
  tekenDeurbel();
  // Thuis naar eigen smaak (besluit 162): favorieten, en de kaarten op hun plek.
  eigen.tekenFavorieten(huisData);
  eigen.na();
  // De wand als niemand kijkt (besluit 164): de stand van het huis bij, en opnieuw tekenen als hij rust.
  niemand.ververs();
  // De microfoon in de vraagbalk alleen waar hij kan: over https (besluit 150).
  $$('#tel [data-mic]').forEach((el) => (el.hidden = !(window.isSecureContext && navigator.mediaDevices?.getUserMedia)));
}

/*
 * Onderhoud (15 oktober 2026): een batterij onder de 10% (besluit 122) of een
 * airco-filter dat bijna vol is (besluit 129). Ingeklapt een sleutel met een
 * getal; een tik klapt hem open met wat er te doen is en Bekijk. Niets te doen:
 * niets te zien.
 */
let onderhoudOpen = false;
function onderhoudLijst() {
  const leeg = (huisData?.batterijen ?? []).filter((b) => bijnaOp(b.pct, 'batterij', huisData)).map((b) => ({ tekst: t('thuis.onderhoud.batterij', { wie: b.kamer ?? b.naam, pct: b.pct }), lang: t('thuis.onderhoud.batterijLang', { naam: b.naam, pct: b.pct }), href: b.kamerId ? `kamer.html#${encodeURIComponent(b.kamerId)}/${encodeURIComponent(`batterij-${b.id}`)}` : null }));
  const vol = (huisData?.filters ?? []).map((f) => ({ tekst: t('thuis.onderhoud.filter', { naam: f.naam, pct: f.pct }), lang: t('thuis.onderhoud.filterLang', { naam: f.naam, pct: f.pct }), href: `kamer.html#${encodeURIComponent(f.kamerId)}/${encodeURIComponent(f.id)}` }));
  return [...leeg, ...vol];
}
function tekenOnderhoud() {
  const lijst = onderhoudLijst();
  if (!lijst.length) onderhoudOpen = false;
  const eerste = lijst[0];
  const bekijk = lijst.length === 1 && eerste.href ? `<a href="${esc(eerste.href)}">${esc(t('thuis.bekijk'))}</a>` : `<button type="button" data-onderhoud-alles>${esc(t('thuis.bekijk'))}</button>`;
  $$('[data-onderhoud]').forEach((el) => {
    el.hidden = lijst.length === 0;
    if (!lijst.length) return;
    el.innerHTML = `<button type="button" class="pil onderhoudknop" data-onderhoud-knop aria-expanded="${onderhoudOpen}" aria-label="${esc(t('thuis.onderhoud.label', { n: lijst.length }))}"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>${lijst.length > 1 ? `<b>${lijst.length}</b>` : ''}</button>${onderhoudOpen ? `<span class="pil onderhoudtekst" title="${esc(lijst.map((x) => x.lang).join(', '))}"><span>${esc(lijst.length === 1 ? eerste.tekst : `${eerste.tekst} +${lijst.length - 1}`)}</span>${bekijk}</span>` : ''}`;
  });
}

/** Vandaag staat op de wand rechts, en op de telefoon onderaan (besluit 159). */
/*
 * Een huis zonder panelen (besluit 196, schets Wand-Huis-Zonder): de kaart
 * Vandaag zegt wat het huis vandaag gebruikte en kostte, met de goedkope uren
 * van het contract eronder.
 */
let verbruikDag = null;
let goedkoop = null;
function tekenVerbruikVandaag() {
  const s = verbruikDag?.stroom;
  const euroNu = verbruikDag?.kosten?.totaal;
  const dal = goedkoop?.dal ?? [];
  const nuUur = goedkoop ? Math.floor((Date.now() - goedkoop.dagStartMs) / 3_600_000) : -1;
  const strook = dal.length
    ? `<div class="dalstrook" role="img" aria-label="${esc(t('thuis.goedkoop.label'))}">${dal.map((d, i) => `<i class="${d ? 'dal' : ''}${i === nuUur ? ' nu' : ''}"></i>`).join('')}</div><div class="dalas"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`
    : '';
  // De daluren als tekst: het eerste blok van vandaag dat nog komt, of het eerste.
  const blokken = [];
  dal.forEach((d, i) => {
    if (!d) return;
    const laatst = blokken.at(-1);
    if (laatst && laatst.tot === i) laatst.tot = i + 1;
    else blokken.push({ van: i, tot: i + 1 });
  });
  // Op de klok, niet geteld: een dag met de klokwissel heeft 23 of 25 uur.
  const uur = (h) => app.klokVan(goedkoop.dagStartMs + h * 3_600_000);
  const blok = blokken.find((b) => b.tot > nuUur) ?? blokken[0];
  const prijzen = { dal: goedkoop?.dalPrijs != null ? `€ ${getal(goedkoop.dalPrijs, 2)}` : '', normaal: goedkoop?.normaal != null ? `€ ${getal(goedkoop.normaal, 2)}` : '' };
  const zin = !dal.length ? t('thuis.goedkoop.geen') : !blokken.length ? t('thuis.goedkoop.vandaagNiet') : t(blok.van <= nuUur ? 'thuis.goedkoop.nu' : 'thuis.goedkoop.vanaf', { van: uur(blok.van), tot: uur(blok.tot), ...prijzen });
  const cijfer = (naam, waarde) => `<div class="dagcijfer"><span class="mini">${esc(naam)}</span><b class="getal">${waarde}</b></div>`;
  $$('[data-dag]').forEach((box) => (box.innerHTML = `<div class="dagcijfers">${cijfer(t('thuis.verbruik.gebruikt'), s ? `${getal(s.verbruikKwh)} <small>kWh</small>` : '–')}${euroNu != null ? cijfer(t('thuis.verbruik.kosten'), `€ ${getal(euroNu, 2)}`) : ''}</div>${strook}`));
  zet('[data-opgewekt]', '');
  zet('[data-dag-zin]', zin);
  $$('[data-vandaag-tegel]').forEach((el) => (el.outerHTML = tegel({ id: 'vandaag', naam: t('thuis.kaart.vandaag'), waarde: s ? `${getal(s.verbruikKwh)} <small>kWh</small>` : '–', zin: euroNu != null ? t('thuis.verbruik.tegel', { euro: getal(euroNu, 2) }) : '' }).replace('class="ktegel', 'data-vandaag-tegel class="ktegel')));
  $$('[data-dag-eenvoudig]').forEach((el) => (el.innerHTML = s ? `${vet('thuis.verbruik.eenvoudig', { kwh: getal(s.verbruikKwh) })} ${esc(zin)}` : esc(zin)));
}

function tekenVandaag() {
  if (app.huisSoort()?.zon === false) return tekenVerbruikVandaag();
  const boxen = $$('[data-dag]');
  if (!vandaag?.kwartieren?.length) {
    boxen.forEach((box) => (box.innerHTML = `<p class="mini">${esc(t('thuis.vandaag.geen'))}</p>`));
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
  // Per apparaat de naam op een eigen regel en de baan eronder: een blokje vroeg op de dag liep anders door de naam.
  const BAAN = 24;
  const banenSvg = banen
    .map((a, i) => {
      const yy = 102 + i * BAAN;
      const naam = apparaatVan(a.actuatorId)?.naam ?? a.actuatorId;
      const stukken = (a.smartClimate ?? []).map((s) => `<rect x="${x(s.vanMs).toFixed(1)}" y="${yy + 5}" width="${Math.max(3, x(s.totMs) - x(s.vanMs)).toFixed(1)}" height="7" rx="3.5" fill="#6FD3FF"/>`).join('');
      return `<text x="8" y="${yy}">${esc(naam)}</text><rect x="8" y="${yy + 5}" width="${B - 16}" height="7" rx="3.5" fill="#ffffff" fill-opacity="0.05"/>${stukken}`;
    })
    .join('');
  const uren = [6, 12, 18, 22].map((u) => `<text x="${x(t0 + u * 3600_000).toFixed(1)}" y="${104 + banen.length * BAAN}" text-anchor="middle">${String(u).padStart(2, '0')}</text>`).join('');
  const hoog = 110 + banen.length * BAAN;
  // Elk een eigen verloop: een verloop in de verborgen weergave tekent niet.
  boxen.forEach((box, i) => (box.innerHTML = `<svg viewBox="0 0 ${B} ${hoog}" width="${B}" height="${hoog}" aria-label="${esc(t('thuis.vandaag.grafiek'))}">
    <defs><linearGradient id="zonvlak-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.55"/><stop offset="1" stop-color="#F7B548" stop-opacity="0.02"/></linearGradient></defs>
    ${helder ? `<path d="${helder}" fill="none" stroke="#F7B548" stroke-opacity="0.35" stroke-dasharray="2 4"/>` : ''}
    <path d="${vlak}" fill="url(#zonvlak-${i})"/><path d="${lijn}" fill="none" stroke="#F7B548" stroke-width="2"/>
    <line x1="${nuX}" y1="14" x2="${nuX}" y2="${hoog - 14}" stroke="#EEF3F7" stroke-opacity="0.6"/>
    <text x="${nuX}" y="10" fill="#B8C4CF" font-size="10" text-anchor="middle" font-family="Figtree">${esc(t('thuis.nuKlein'))}</text>
    <g font-family="Figtree" font-size="10.5" fill="#7F8E9C">${banenSvg}${uren}</g>
  </svg>`));
  const kwh = (vandaag.zonWh ?? 0) / 1000;
  // Naast wat de dag ervoor werd verwacht (besluit 137); anders wat er nog komt.
  const vooraf = weer?.vandaag?.verwachtVoorafKwh;
  const verwacht = weer?.vandaag?.verwachtKwh;
  zet('[data-opgewekt]', vooraf != null ? t('thuis.vandaag.verwacht', { kwh: getal(kwh), verwacht: getal(vooraf) }) : verwacht != null && verwacht > kwh + 0.05 ? t('thuis.vandaag.verwacht', { kwh: getal(kwh), verwacht: getal(verwacht) }) : t('thuis.vandaag.opgewekt', { kwh: getal(kwh) }));
  const terug = (vandaag.netTerugWh ?? 0) / 1000;
  // De tegel (besluit 189): de zon van vandaag als kleine lijn, het getal eronder.
  const kx = (tt) => ((tt - t0) / (t1 - t0)) * 260;
  const ky = (w) => 42 - (w / max) * 38;
  const kLijn = kw.map((q, i) => `${i ? 'L' : 'M'} ${kx(q.tMs).toFixed(1)} ${ky(q.zonW ?? 0).toFixed(1)}`).join(' ');
  const kHelder = lijn2.punten.map((q, i) => `${i ? 'L' : 'M'} ${kx(q.tMs).toFixed(1)} ${ky(q.w).toFixed(1)}`).join(' ');
  const grafiek = `<svg class="grafiek" viewBox="0 0 260 44" preserveAspectRatio="none" aria-hidden="true">${kHelder ? `<path d="${kHelder}" fill="none" stroke="#F7B548" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>` : ''}<path d="${kLijn} L ${kx(laatste.tMs).toFixed(1)} 42 L 0 42 Z" fill="rgb(247 181 72 / 0.22)"/><path d="${kLijn}" fill="none" stroke="#F7B548" stroke-width="2" vector-effect="non-scaling-stroke"/><line x1="${kx(Date.now()).toFixed(1)}" y1="0" x2="${kx(Date.now()).toFixed(1)}" y2="44" stroke="rgb(255 255 255 / 0.5)" vector-effect="non-scaling-stroke"/></svg>`;
  $$('[data-vandaag-tegel]').forEach((el) => (el.outerHTML = tegel({ id: 'vandaag', naam: t('thuis.kaart.vandaag'), waarde: `${getal(kwh)} <small>kWh</small>`, zin: kwh > 0.05 && app.huisSoort()?.meter !== false ? t('thuis.tegel.zelf', { pct: getal(Math.max(0, Math.min(100, ((kwh - terug) / kwh) * 100)), 0) }) : '', beeld: grafiek, klasse: 'metgrafiek' }).replace('class="ktegel', 'data-vandaag-tegel class="ktegel')));
  const uitleg = t('thuis.vandaag.gestippeld', { lijn: lijn2.naam });
  // Zonder slimme meter (besluit 196) weet het huis niet wat er terugging: dan geen deel zelf gebruikt.
  const metMeter = app.huisSoort()?.meter !== false;
  zet('[data-dag-zin]', kwh > 0.05 && metMeter ? `${t('thuis.vandaag.zelf', { pct: getal(Math.max(0, Math.min(100, ((kwh - terug) / kwh) * 100)), 0) })} ${uitleg}` : uitleg);
  // Eenvoudig (besluit 164, schets Thuis-Tel-Eigen #eenvoudig): de dag in één zin.
  const zelf = kwh > 0.05 ? (kwh - terug) / kwh : 0;
  $$('[data-dag-eenvoudig]').forEach((el) => (el.innerHTML = kwh > 0.05 ? `${vet('thuis.vandaag.eenvoudig', { kwh: getal(kwh) })} ${esc(t(zelf >= 0.9 ? 'thuis.vandaag.bijnaAlles' : zelf >= 0.5 ? 'thuis.vandaag.meeste' : 'thuis.vandaag.naarNet'))}` : esc(t('thuis.vandaag.niets'))));
}

/*
 * Straks: wat het huis gaat doen zodra het kan. Uit de besluiten die nu op zon
 * wachten; het plan voor de middag komt met het thermisch model (D).
 */
/** Een uitstelbaar apparaat dat draait of klaarstaat, als kaart: met de eindtijd (besluit 98). */
function tekenApparaat() {
  const kaarten = $$('[data-apparaatkaart]');
  const inhoud = (k) => k.querySelector('[data-apparaat-inhoud]');
  const d = (state?.bewoner?.uitstelbaar ?? []).find((x) => x.stand === 'running') ?? (state?.bewoner?.uitstelbaar ?? []).find((x) => x.stand === 'waiting' || x.stand === 'would_start');
  if (!d) {
    kaarten.forEach((k) => (k.hidden = true));
    return;
  }
  const s = (vandaag?.uitstelbaar ?? []).find((u) => u.id === d.id)?.draaide?.at(-1);
  const nu = Date.now();
  // Klaar met drogen, ook al draait de trommel nog tegen kreuken (besluit 167): dat zegt de dienst.
  const klaar = d.stand === 'running' ? d.klaarSindsMs ?? null : null;
  const loopt = d.stand === 'running' && !klaar && s && nu - s.totMs < 5 * 60_000;
  // De eindtijd: wat het apparaat zegt dat er nog over is, anders de start plus de duur.
  const eind = d.stand === 'running' && !klaar ? (d.restMin != null ? nu + d.restMin * 60_000 : loopt && d.duurMin ? s.vanMs + d.duurMin * 60_000 : null) : null;
  const deel = klaar ? 1 : eind && s ? Math.max(0, Math.min(1, (nu - s.vanMs) / Math.max(60_000, eind - s.vanMs))) : d.stand === 'running' ? 1 : 0;
  const rest = eind ? Math.max(0, Math.round((eind - nu) / 60_000)) : null;
  const R = 2 * Math.PI * 24;
  const kleur = klaar ? '#6EE7B7' : '#F7B548';
  const binnen = klaar
    ? '<path d="M19 28.5l6 6 12-13" fill="none" stroke="#6EE7B7" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
    : rest != null ? `<text x="28" y="33" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="13" fill="#EEF3F7">${esc(rest >= 60 ? t('thuis.apparaat.uren', { u: Math.floor(rest / 60), m: String(rest % 60).padStart(2, '0') }) : t('thuis.apparaat.minuten', { m: rest }))}</text>` : '';
  const ring = `<svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="5" ${d.stand === 'running' ? '' : 'stroke-dasharray="3 5"'}/>${deel > 0 ? `<circle cx="28" cy="28" r="24" fill="none" stroke="${kleur}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(deel * R).toFixed(1)} ${R.toFixed(1)}" transform="rotate(-90 28 28)"/>` : ''}${binnen}</svg>`;
  const zin = klaar ? t('thuis.apparaat.kreuken', { klok: klok(klaar) }) : eind ? t('thuis.apparaat.klaarRond', { klok: klok(eind) }) : d.kop;
  kaarten.forEach((k) => {
    inhoud(k).innerHTML = `${ring}<span><b>${esc(d.naam)}</b><span class="klein ${klaar ? 'mint-t' : 'zon-t'}">${esc(zin)}</span></span>`;
    k.hidden = false;
  });
}

function tekenStraks() {
  const wacht = (state.rejected ?? []).find((r) => r.blockedBy === 'insufficient_power_budget' && r.intent?.budgetW > 0);
  const kaarten = $$('[data-straks]');
  if (!wacht) {
    kaarten.forEach((k) => (k.hidden = true));
    return;
  }
  const zone = huismodel.metHoofdletter(zoneNaam(wacht.intent.zoneId, huisData));
  zet('[data-straks-kop]', t(wacht.intent.action === 'heat' ? 'thuis.straks.warm' : 'thuis.straks.koel', { zone, kw: getal(wacht.intent.budgetW / 1000) }));
  const over = Math.max(0, state.explanation?.budget?.availableW ?? 0);
  zet('[data-straks-zin]', `${over >= 50 ? t('thuis.straks.over', { kw: getal(over / 1000) }) : t('thuis.straks.geenZon')} ${t('thuis.straks.vanzelf')}`);
  kaarten.forEach((k) => (k.hidden = false));
}

/*
 * Wie er thuis is en wiens comfort geldt (besluit 169, schetsen Wand-Thuis-Wie
 * en Thuis-Tel-Wie): een rondje per bewoner, op de wand bovenin voor de pillen
 * en op de telefoon rechts van de begroeting. Wie thuis is, licht op in zijn
 * kleur; wie weg is, blijft grijs; wie gevolgd wordt, heeft een witte ring met
 * een klein thermometertje. Een tik opent een blad met iedereen, thuis of weg
 * en zijn temperaturen; daar kies je wiens comfort geldt, tot er iemand
 * thuiskomt of weggaat. Een gast kijkt alleen. Eerst stond er een grote kaart
 * "Comfort van Noor" met één knop terug naar de hoofdgebruiker. De kleur is
 * die van de bewoner zelf (besluit 181); eerst een vaste rij, met amber en
 * groen erin, die iets anders betekenen.
 */
const klokVan = klok;
/**
 * Wie er thuis is: meteen zoals Home Assistant het ziet, net als bij Bewoners
 * (21 oktober 2026). Eerst volgden de rondjes de regeling, die pas na tien
 * minuten rust wisselt; dan stond iemand bij Bewoners al thuis en hier nog
 * weg. Het comfort wisselt nog steeds pas na die tien minuten (besluit 147);
 * dat laat de ring zien.
 */
function wieThuis() {
  return new Set((bewoners?.bewoners ?? []).filter((b) => b.thuis).map((b) => b.id));
}
function gezicht(b) {
  const thuis = wieThuis().has(b.id);
  const geldt = bewoners?.geldt?.id === b.id;
  return `<i data-kleur="${esc(app.kleurVan(b.id))}" class="${thuis ? '' : 'afwezig'}${geldt ? ' geldt' : ''}">${esc(b.naam.charAt(0).toUpperCase())}</i>`;
}
function tekenGeldt() {
  const lijst = bewoners?.bewoners ?? [];
  const g = bewoners?.geldt;
  const thuis = wieThuis();
  const label = lijst.length
    ? `${lijst.map((b) => t(thuis.has(b.id) ? 'thuis.wie.isThuis' : 'thuis.wie.isWeg', { naam: b.naam })).join(', ')}.${g ? ` ${t('thuis.wie.geldt', { naam: g.naam })}` : ''} ${t('thuis.wie.tik')}`
    : '';
  $$('[data-wie]').forEach((el) => {
    el.hidden = lijst.length === 0;
    if (!lijst.length) return;
    el.setAttribute('aria-label', label);
    el.innerHTML = `<span class="gezichten" aria-hidden="true">${lijst.map(gezicht).join('')}</span><span class="pijl" aria-hidden="true">▾</span>`;
  });
  const blad = document.querySelector('[data-kiesblad]');
  if (blad && !blad.hidden && blad.dataset.blad === 'wie') void tekenWieBlad();
}

/** De temperaturen per bewoner: overdag en 's nachts, in de eerste kamer die verwarmt. */
const wieTemps = new Map();
async function haalTemps() {
  await Promise.all((bewoners?.bewoners ?? []).map(async (b) => {
    if (wieTemps.has(b.id)) return;
    try {
      const c = await haal(`api/comfort?bewoner=${encodeURIComponent(b.id)}`);
      const k = (c?.kamers ?? []).find((x) => x.kanVerwarmen) ?? c?.kamers?.[0];
      wieTemps.set(b.id, k ? { kamer: k.naam, dag: k.modi?.dag?.heat ?? null, nacht: k.modi?.nacht?.heat ?? null } : null);
    } catch {
      wieTemps.set(b.id, null);
    }
  }));
}

async function tekenWieBlad() {
  const el = document.querySelector('[data-kiesblad]');
  if (!el || !bewoners) return;
  const lijst = bewoners.bewoners ?? [];
  const g = bewoners.geldt;
  const thuis = wieThuis();
  const gast = bewoners.ik?.soort === 'gast';
  const gekozen = g?.waarom === 'gekozen' ? g.id : null;
  const graad = (c) => (c == null ? '–' : `${getal(c, Number.isInteger(c) ? 0 : 1)}°`);
  // Waarom het nu deze is, in één zin.
  const hoofd = lijst[0];
  const weg = lijst.filter((b) => !thuis.has(b.id));
  const isWeg = (b) => (b.thuisSindsMs ? t('thuis.wie.wegSinds', { naam: b.naam, klok: klokVan(b.thuisSindsMs) }) : t('thuis.wie.weg', { naam: b.naam }));
  const nu = g?.waarom === 'niemand'
    ? t('thuis.wie.niemand', { naam: g.naam })
    : `${t('thuis.wie.nu', { naam: g?.naam ?? hoofd?.naam ?? '' })}${weg.length && g && g.id !== hoofd?.id ? ` ${weg.map(isWeg).join(', ')}.` : ''}`;
  const rij = (id, gezichtHtml, naam, onder, rechts, aan) => `<button type="button" class="wiekeuze${aan ? ' aan' : ''}" role="radio" aria-checked="${aan}" data-wie-kies="${esc(id)}" ${gast ? 'disabled' : ''}><span class="rond" aria-hidden="true"></span>${gezichtHtml}<span><b>${esc(naam)}</b><small>${onder}</small></span><span class="temp">${rechts}</span></button>`;
  const rijen = lijst.map((b) => {
    const temps = wieTemps.get(b.id);
    const isThuis = thuis.has(b.id);
    const onder = isThuis ? `<span class="thuis-t">${esc(t('thuis.wie.thuis'))}</span>` : esc(b.thuisSindsMs ? t('thuis.wie.wegSindsKort', { klok: klokVan(b.thuisSindsMs) }) : t('thuis.wie.wegKort'));
    const rechts = temps ? [temps.dag != null ? vet('thuis.wie.overdag', { graden: graad(temps.dag) }) : '', temps.nacht != null ? vet('thuis.wie.snachts', { graden: graad(temps.nacht) }) : ''].filter(Boolean).join('<br>') : '';
    return rij(b.id, `<span class="gezicht${isThuis ? '' : ' afwezig'}" data-kleur="${esc(app.kleurVan(b.id))}" aria-hidden="true">${esc(b.naam.charAt(0).toUpperCase())}</span>`, b.naam, onder, rechts, gekozen === b.id);
  }).join('');
  el.dataset.blad = 'wie';
  el.setAttribute('aria-label', t('thuis.wie.kop'));
  el.innerHTML = `<div class="bladkop"><h2 class="kop-2">${esc(t('thuis.wie.kop'))}</h2><button type="button" class="knop knop-licht" data-blad-dicht>${esc(t('algemeen.klaar'))}</button></div>
    <div role="radiogroup" aria-label="${esc(t('thuis.wie.kop'))}">
      ${rij('', '<span class="gezicht vanzelf" aria-hidden="true">⟳</span>', t('thuis.wie.vanzelf'), esc(nu), '', gekozen == null)}
      ${rijen}
    </div>
    <p class="mini" style="margin: 12px 0 0">${esc(t(gast ? 'thuis.wie.gast' : 'thuis.wie.totDat'))}${wieTemps.size ? ` ${esc(t('thuis.wie.temperaturenVan', { kamer: [...wieTemps.values()].find(Boolean)?.kamer ?? t('thuis.wie.eersteKamer') }))}` : ''}</p>`;
}

async function openWie() {
  const el = document.querySelector('[data-kiesblad]');
  if (!el || !bewoners?.bewoners?.length) return;
  await tekenWieBlad();
  document.querySelector('[data-kies-achter]').hidden = false;
  el.hidden = false;
  el.querySelector('button')?.focus();
  // De temperaturen erbij zodra ze er zijn.
  await haalTemps();
  if (el.dataset.blad === 'wie' && !el.hidden) await tekenWieBlad();
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-wie]') && !eigen.bewerkt) return void openWie();
  const knop = e.target.closest('[data-wie-kies]');
  if (!knop || knop.disabled) return;
  const id = knop.dataset.wieKies || null;
  const res = await deur('api/bewoners', { actie: 'vasthouden', id });
  if (res?.ok) {
    bewoners = await res.json();
    tekenGeldt();
    // De regeling neemt het meteen over; Thuis tekent opnieuw met wat er nu geldt.
    void tekenWieBlad();
  }
});


/*
 * Hoe voelt het? (besluit 134): de kaart komt uit gevoel.js. Kiezen welke
 * kamer kan met de knoppen erboven; de eerste keer de kamer met een regeling
 * op de laagste etage, meestal waar je woont.
 */
function tekenGevoel() {
  const zones = huisData.etages.flatMap((e) => e.ruimtes).filter((r) => r.zoneId && r.temperatuurC != null);
  // Op de telefoon geen lege kaart zonder kamers.
  $$('#tel [data-gevoel-kaart]').forEach((el) => (el.hidden = !zones.length));
  if (!zones.length) return;
  gekozenZone ??= ([...huisData.etages].reverse().flatMap((e) => e.ruimtes).find((r) => r.zoneId && r.temperatuurC != null) ?? zones[0]).zoneId;
  const kamer = zones.find((r) => r.zoneId === gekozenZone) ?? zones[0];
  zet('[data-gevoel-kop]', t('thuis.gevoel.kop'));
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

/** De kamers op de telefoon: één kaart, een regel per kamer (besluit 159). */
function tekenKamersTel() {
  const box = document.querySelector('[data-kamers]');
  const kleur = { koelt: 'var(--ijs)', warmt: 'var(--gloed)', wacht: 'var(--zon)', goed: 'var(--mint)' };
  const kamers = huisData.etages.flatMap((e) => e.ruimtes).filter((r) => r.zoneId && r.temperatuurC != null);
  box.closest('[data-kaart]').hidden = !kamers.length;
  box.innerHTML = kamers
    .map((r) => {
      const stand = huismodel.standVan(r.zoneId, state);
      const kort = state.bewoner?.kamers?.find((x) => x.zoneId === r.zoneId)?.kort ?? '';
      return `<a href="kamer.html#${encodeURIComponent(r.id)}"><span class="stip" style="width: 10px; height: 10px; background: ${kleur[stand] ?? 'var(--gedempt)'}"></span><span><b>${esc(r.naam)}</b><small style="color: ${app.tekstKleur(kleur[stand] ?? 'var(--zacht)')}">${esc(kort)}</small></span><span class="getal">${getal(r.temperatuurC)}°</span><span class="pijl" aria-hidden="true">›</span></a>`;
    })
    .join('');
}

/* ---------------------------- de auto, de batterij, de maand, de deurbel */

/*
 * Vier kaarten om te kiezen (besluit 182, schets Thuis-Tel-Kaarten): de auto
 * en de thuisbatterij uit het huis, deze maand uit Opbrengst, en de deurbel
 * met zijn laatste beeld. Wat het huis niet heeft, staat er niet, en wordt
 * ook niet aangeboden bij Kaart toevoegen.
 */
let maand = null;
let maandOp = 0;
/*
 * De kaart Camera's (besluit 201, schets Wand-Cameras): eerst de kaart Deurbel
 * (besluit 182); zijn id blijft `deurbel`, zodat ieders indeling blijft staan.
 * Per camera een plaatje, hooguit elke minuut, en elke tien tellen bij een
 * camera die nu beweging ziet.
 */
let cameras = null;
const camBeeld = new Map();
const camOp = new Map();
/** Alle camera's die het huis toont, de deurbel voorop: zo staat de kaart zonder keuze, en zo begint het kiesblad. */
const camerasAlle = () => [...(cameras?.aan ? cameras.cameras : [])].sort((a, b) => Number(b.deurbel) - Number(a.deurbel));
eigen.metCameras(camerasAlle);
/** Het sluipverbruik (besluit 192): hooguit elk half uur; de dienst haalt het uit Home Assistant. */
let sluip = null;
let sluipOp = 0;
let verbruikOp = 0;
const staatErin = (id) => $$(`[data-kaart="${id}"]`).some((el) => !el.hasAttribute('data-uit'));
const kw = (w) => `${getal(Math.abs(w) / 1000, 1)} kW`;

/*
 * De tegel van een smalle kaart op de wand (besluit 189, schets Wand-Thuis-3):
 * een kleine kop met het icoon, een groot getal, een zin, en rechtsboven een
 * beeldje. De kaart zelf (.kvol) blijft voor breed en voor de telefoon.
 */
const tegel = ({ id, naam, waarde, zin = '', toon = '', beeld = '', klasse = '' }) =>
  `<div class="ktegel${klasse ? ` ${klasse}` : ''}"><span class="tnaam">${eigen.icoon(id)}<span>${esc(naam)}</span></span>${beeld}<span class="twaarde">${waarde}</span><span class="tzin"${toon ? ` style="color: ${toon}"` : ''}>${esc(zin)}</span></div>`;
const vol = (html) => `<div class="kvol">${html}</div>`;
function ring(pct, kleur) {
  const o = 2 * Math.PI * 17;
  const p = Math.max(0, Math.min(1, (pct ?? 0) / 100));
  return `<svg class="beeld" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="rgb(255 255 255 / 0.1)" stroke-width="5"/><circle cx="22" cy="22" r="17" fill="none" stroke="${kleur}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(p * o).toFixed(1)} ${o.toFixed(1)}" transform="rotate(-90 22 22)"/></svg>`;
}
function staaf(pct, kleur) {
  const p = Math.max(0, Math.min(1, (pct ?? 0) / 100));
  return `<svg class="beeld" width="22" height="46" viewBox="0 0 22 46" aria-hidden="true"><rect x="1" y="3" width="20" height="42" rx="5" fill="none" stroke="rgb(255 255 255 / 0.2)" stroke-width="1.5"/><rect x="7" y="0" width="8" height="3" rx="1" fill="rgb(255 255 255 / 0.3)"/><rect x="4" y="${(42 - 36 * p).toFixed(0)}" width="14" height="${(36 * p).toFixed(0)}" rx="3" fill="${kleur}"/></svg>`;
}
function balkjes(waarden) {
  const max = Math.max(...waarden, 0.001);
  return `<svg class="beeld" style="top: 8px" width="54" height="26" viewBox="0 0 54 26" aria-hidden="true">${waarden.map((w, i) => `<rect x="${i * 6}" y="${(26 - Math.max(2, (w / max) * 24)).toFixed(0)}" width="4" height="${Math.max(2, (w / max) * 24).toFixed(0)}" rx="1.5" fill="${i === waarden.length - 1 ? 'var(--zon)' : 'rgb(255 255 255 / 0.25)'}"/>`).join('')}</svg>`;
}
function tank(pct, id) {
  const p = Math.max(0.05, Math.min(1, pct));
  return `<svg class="beeld" width="26" height="46" viewBox="0 0 26 46" aria-hidden="true"><defs><linearGradient id="tank-${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4d86c9"/><stop offset="0.6" stop-color="#ff9a6b"/><stop offset="1" stop-color="#ff6a3d"/></linearGradient><clipPath id="tankvorm-${id}"><rect x="1" y="1" width="24" height="44" rx="11"/></clipPath></defs><rect x="1" y="1" width="24" height="44" rx="11" fill="rgb(255 255 255 / 0.08)" stroke="rgb(255 255 255 / 0.2)"/><rect clip-path="url(#tankvorm-${id})" x="1" y="${(45 - 44 * p).toFixed(0)}" width="24" height="44" fill="url(#tank-${id})"/></svg>`;
}
const kaartKop = (id, titel, pijl = true) => `<div class="kaartkop"><span class="ik">${eigen.icoon(id)}</span><h2 class="kop-3">${esc(titel)}</h2>${pijl ? '<span class="pijl" aria-hidden="true">›</span>' : ''}</div>`;
const lading = (pct, kleur, zin, zinKleur) =>
  `<div class="lading"><span class="getal">${pct == null ? '–' : `${getal(pct, 0)}%`}</span><div class="laadbalk"><i style="width: ${Math.max(0, Math.min(100, pct ?? 0))}%; background: ${kleur}"></i></div><small style="color: ${zinKleur}">${esc(zin)}</small></div>`;

async function kaartGegevens() {
  const nu = Date.now();
  // Deze maand: hooguit elke tien minuten; het is een rekensom over de hele maand.
  if (staatErin('maand') && nu - maandOp > 10 * 60_000) {
    maandOp = nu;
    try {
      const res = await fetch('api/opbrengst?soort=maand', { cache: 'no-store', headers: { 'x-taal': taal.code } });
      maand = res.status === 409 ? { meters: false } : res.ok ? await res.json() : null;
    } catch {
      // De volgende keer.
    }
  }
  try {
    cameras = await haal('api/cameras');
  } catch {
    cameras = null;
  }
  // Zonder panelen (besluit 196): wat het huis vandaag gebruikte, en de goedkope uren; hooguit elke tien minuten.
  if (app.huisSoort()?.zon === false && staatErin('vandaag') && nu - verbruikOp > 10 * 60_000) {
    verbruikOp = nu;
    const [v, g] = await Promise.allSettled([fetch('api/opbrengst?soort=dag', { cache: 'no-store', headers: { 'x-taal': taal.code } }).then((r) => (r.ok ? r.json() : null)), haal('api/goedkoop')]);
    if (v.status === 'fulfilled') verbruikDag = v.value;
    if (g.status === 'fulfilled') goedkoop = g.value;
  }
  // Ook als de kaart er niet staat: anders weet Kaart toevoegen niet of dit huis hem heeft.
  if (nu - sluipOp > 30 * 60_000) {
    sluipOp = nu;
    try {
      const res = await fetch('api/sluipverbruik', { cache: 'no-store' });
      sluip = res.ok ? await res.json() : null;
    } catch {
      // De volgende keer.
    }
  }
  // De plaatjes van de gekozen camera's: hooguit elke minuut, bij beweging elke tien tellen.
  if (cameras?.aan && staatErin('deurbel')) await Promise.all(camerasGekozen().map((c) => camPlaatje(c, nu)));
}

/** Een vers plaatje van een camera; geeft het beeld niets, dan een ander beeld van dezelfde camera, zoals bij aanbellen. */
async function camPlaatje(c, nu) {
  if (nu - (camOp.get(c.id) ?? 0) < (c.nu ? 10_000 : 60_000)) return;
  camOp.set(c.id, nu);
  let res = null;
  for (const id of [c.id, ...(c.reserve ?? [])]) {
    res = await fetch(`api/camera?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) return;
  const oud = camBeeld.get(c.id);
  camBeeld.set(c.id, URL.createObjectURL(await res.blob()));
  if (oud) URL.revokeObjectURL(oud);
}

/**
 * De camera's op de kaart: wat je koos, in jouw volgorde, of anders alle met de
 * deurbel voorop. Wat nu beweging ziet, gaat voor (besluit 201).
 */
function camerasGekozen() {
  const alle = camerasAlle();
  const keuze = eigen.cameras(app.telStand() ? 'tel' : 'wand');
  const lijst = keuze ? keuze.map((id) => alle.find((c) => c.id === id)).filter(Boolean) : alle;
  return [...lijst.filter((c) => c.nu), ...lijst.filter((c) => !c.nu)];
}

function zetKaart(sel, id, html, hier) {
  $$(sel).forEach((el) => {
    // Wat dit huis niet heeft, bieden we ook niet aan bij Kaart toevoegen.
    el.toggleAttribute('data-niet-hier', !hier);
    el.hidden = !html;
    if (html && el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  });
}

function tekenLading() {
  const a = huisData?.opslag?.auto ?? null;
  const autoZin = !a ? '' : a.laadt ? (a.vermogenW ? t('thuis.lading.laadtMet', { kw: kw(a.vermogenW) }) : t('thuis.lading.laadt')) : a.aangesloten === true ? t('thuis.lading.aangesloten') : a.aangesloten === false ? t('thuis.lading.nietAangesloten') : '';
  const bereik = a?.bereikKm != null ? `${autoZin ? ' · ' : ''}${getal(a.bereikKm, 0)} km` : '';
  zetKaart('[data-auto]', 'auto', a ? `${vol(`${kaartKop('auto', a.naam)}${lading(a.pct, a.laadt ? 'var(--mint)' : 'var(--net)', autoZin + bereik, a.laadt ? 'var(--mint-t)' : 'var(--zacht)')}`)}${tegel({ id: 'auto', naam: a.naam, waarde: a.pct == null ? '–' : `${getal(a.pct, 0)}%`, zin: autoZin + bereik, toon: a.laadt ? 'var(--mint-t)' : '', beeld: ring(a.pct, a.laadt ? 'var(--mint)' : 'var(--net)') })}` : '', !!a);
  const b = huisData?.opslag?.batterij ?? null;
  const st = b?.stand;
  const bZin = st === 'laadt' ? t('thuis.lading.laadtMet', { kw: kw(b.vermogenW) }) : st === 'levert' ? t('thuis.lading.levert', { kw: kw(b.vermogenW) }) : st === 'rust' ? t('thuis.lading.rust') : '';
  const bKleur = st === 'laadt' ? 'var(--zon)' : st === 'levert' ? 'var(--violet)' : 'var(--net)';
  zetKaart('[data-batterij]', 'batterij', b ? `${vol(`${kaartKop('batterij', b.naam)}${lading(b.pct, bKleur, bZin, app.tekstKleur(st === 'rust' || !st ? 'var(--zacht)' : bKleur))}`)}${tegel({ id: 'batterij', naam: b.naam, waarde: b.pct == null ? '–' : `${getal(b.pct, 0)}%`, zin: bZin, toon: st === 'rust' || !st ? '' : app.tekstKleur(bKleur), beeld: staaf(b.pct, st === 'levert' ? 'var(--violet)' : 'var(--mint)') })}` : '', !!b);
  tekenBoiler();
}

/** Het sluipverbruik (besluit 192): vannacht, hoeveel boven je gewone nacht, en de laatste nachten. */
function tekenSluip() {
  const s = sluip;
  // Zonder slimme meter (besluit 196): het sluipverbruik kan erbij, met een meter.
  // Zonder meter wijst de kaart naar de meters, anders naar het eigen scherm.
  const zonderMeter = !s && app.huisSoort()?.meter === false;
  $$('[data-sluip]').forEach((el) => el.setAttribute('href', zonderMeter ? 'energie.html#meters' : 'sluipverbruik.html'));
  if (zonderMeter) {
    const naam = t('thuis.kaart.sluip');
    return zetKaart('[data-sluip]', 'sluip', `${vol(`${kaartKop('sluip', naam, false)}<p class="klein" style="margin: 6px 0 10px">${esc(t('thuis.sluip.metMeter'))}</p><span class="pil">${esc(t('thuis.sluip.meterKnop'))}</span>`)}${tegel({ id: 'sluip', naam, waarde: '–', zin: t('thuis.sluip.kanErbij') })}`, true);
  }
  if (!s) return zetKaart('[data-sluip]', 'sluip', '', false);
  const naam = t('thuis.kaart.sluip');
  const zin = s.hoog ? t('thuis.sluip.boven', { boven: getal(s.bovenW, 0) }) : t('thuis.sluip.gewoon', { gewoon: getal(s.gewoonW, 0) });
  const toon = s.hoog ? 'var(--gloed-t)' : '';
  const staven = (n, max) => s.nachten.slice(-n).map((x) => `<i class="${x.hoog ? 'hoog' : ''}" style="height: ${Math.max(6, Math.round((x.w / max) * 100))}%"></i>`).join('');
  const max = Math.max(...s.nachten.slice(-30).map((x) => x.w), s.gewoonW + 50);
  const beeld = `<span class="beeld sluipstaven" style="top: 10px; width: 64px; height: 26px; gap: 2px" aria-hidden="true">${staven(14, max)}</span>`;
  zetKaart('[data-sluip]', 'sluip', `${vol(`${kaartKop('sluip', naam)}<div class="sluipnu"><span class="getal" style="font-size: 30px">${getal(s.vannacht.w, 0)} <small>W</small></span><small style="color: ${toon || 'var(--zacht)'}">${esc(zin)} · ${esc(t('thuis.sluip.gemiddeld', { w: getal(s.gemiddeldW, 0) }))}</small></div><div class="sluipstaven" aria-hidden="true">${staven(30, max)}</div>`)}${tegel({ id: 'sluip', naam, waarde: `${getal(s.vannacht.w, 0)} <small>W</small>`, zin, toon, beeld })}`, true);
}

function tekenMaand() {
  const m = maand;
  const naam = taal.datum(Date.now(), { month: 'long' });
  const titel = t('thuis.maand.titel', { maand: `${naam.charAt(0).toUpperCase()}${naam.slice(1)}` });
  let html = '';
  if (m?.meters === false) html = `${vol(`${kaartKop('maand', titel)}<p class="klein" style="margin: 8px 0 0">${esc(t('thuis.maand.meters'))}</p>`)}${tegel({ id: 'maand', naam: `${naam.charAt(0).toUpperCase()}${naam.slice(1)}`, waarde: '–', zin: t('thuis.tegel.meters') })}`;
  else if (m?.stroom) {
    const eerste = m.zon ? `<div><b class="zon-t">${getal(m.zon.opgewektKwh, 0)}</b><span>${esc(t('thuis.maand.opgewekt'))}</span></div>` : `<div><b>${getal(m.stroom.verbruikKwh, 0)}</b><span>${esc(t('thuis.maand.gebruikt'))}</span></div>`;
    const tweede = m.zon?.zelfPct != null ? `<div><b>${getal(m.zon.zelfPct, 0)}%</b><span>${esc(t('thuis.maand.zelf'))}</span></div>` : `<div><b>${getal(m.stroom.vanNetKwh, 0)}</b><span>${esc(t('thuis.maand.vanNet'))}</span></div>`;
    const kosten = m.kosten?.totaal;
    const derde = kosten != null
      ? `<div><b>€ ${getal(kosten, 0)}</b><span>${esc(m.kosten.vorige != null ? t('thuis.maand.gekostVorige', { vorige: m.periode?.vorigeNaam ?? t('thuis.maand.ervoor'), euro: getal(m.kosten.vorige, 0) }) : t('thuis.maand.gekost'))}</span></div>`
      : `<div><b>–</b><span>${esc(t('thuis.maand.prijzen'))}</span></div>`;
    html = vol(`${kaartKop('maand', titel)}<div class="maanddrie">${eerste}${tweede}${derde}</div>`);
    // De tegel: wat er deze maand opgewekt (of gebruikt) is, met de laatste dagen als balkjes.
    const dagen = (m.perBucket ?? []).slice(-9).map((d) => (m.zon ? d.zonKwh : d.netKwh + d.zonKwh));
    html += tegel({
      id: 'maand',
      naam: `${naam.charAt(0).toUpperCase()}${naam.slice(1)}`,
      waarde: `${getal(m.zon ? m.zon.opgewektKwh : m.stroom.verbruikKwh, 0)} <small>kWh</small>`,
      zin: m.zon?.zelfPct != null ? t('thuis.tegel.zelf', { pct: getal(m.zon.zelfPct, 0) }) : kosten != null ? `€ ${getal(kosten, 0)}` : t(m.zon ? 'thuis.maand.opgewekt' : 'thuis.maand.gebruikt'),
      beeld: dagen.length > 1 ? balkjes(dagen) : '',
    });
  }
  zetKaart('[data-maand]', 'maand', html, true);
}

/** Wat er onder een beeld staat: wat het nu ziet, bij de deurbel wanneer er werd aangebeld, anders wanneer het laatst. */
function camZin(c) {
  const dag = (ms) => taal.datum(new Date(ms), { weekday: 'long', day: 'numeric', month: 'long' });
  const vandaag = (ms) => new Date().toDateString() === new Date(ms).toDateString();
  if (c.nu) return t('thuis.cam.nu', { wat: t(`thuis.cam.soort.${c.nu}`) });
  if (c.deurbel) return c.aangebeldMs ? (vandaag(c.aangebeldMs) ? t('thuis.deurbel.om', { klok: klokVan(c.aangebeldMs) }) : t('thuis.deurbel.laatst', { dag: dag(c.aangebeldMs) })) : t('thuis.deurbel.nooit');
  if (!c.melders) return '';
  if (!c.laatsteMs) return t('thuis.cam.geen');
  const wat = t(`thuis.cam.soort.${c.laatsteSoort ?? 'beweging'}`);
  return vandaag(c.laatsteMs) ? t('thuis.cam.om', { wat, klok: klokVan(c.laatsteMs) }) : t('thuis.cam.laatst', { wat, dag: dag(c.laatsteMs) });
}
/** Hoe de beelden liggen: één groot, twee naast elkaar, drie met de eerste breed, vier en meer twee aan twee. */
const camSchik = (n) => (n <= 1 ? 'n1' : n === 2 ? 'n2' : n === 3 ? 'n3' : 'n4');
function camVak(c, i) {
  const src = camBeeld.get(c.id);
  const zin = camZin(c);
  return `<button type="button" class="cambeeld${c.nu ? ' nu' : ''}${c.deurbel ? ' bel' : ''}" data-cam="${i}" aria-label="${esc(t('thuis.cam.groot', { naam: c.naam }))}">${src ? `<img alt="" src="${src}">` : ''}<span class="camnaam">${eigen.icoon(c.deurbel ? 'bel' : 'camera')}${esc(c.naam)}</span>${zin ? `<span class="camzin"><i></i>${esc(zin)}</span>` : ''}</button>`;
}
function tekenDeurbel() {
  const lijst = camerasGekozen();
  const hier = !!cameras?.aan;
  let html = '';
  if (hier) {
    const beweegt = lijst.find((c) => c.nu);
    const rechts = beweegt ? `<span class="kaartrechts camnu">${esc(t('thuis.cam.bij', { wat: t(`thuis.cam.soort.${beweegt.nu}`), naam: beweegt.naam }))}</span>` : '';
    const kies = eigen.magKiezen(app.telStand() ? 'tel' : 'wand') ? `<button type="button" class="camkies" data-cam-kies>${esc(t('thuis.cam.kies'))}</button>` : '';
    const vakken = lijst.length ? `<div class="cambeelden ${camSchik(lijst.length)}">${lijst.map(camVak).join('')}</div>` : `<p class="mini">${esc(t('thuis.cam.leeg'))}</p>`;
    html = vol(`<div class="camkop">${kaartKop('deurbel', t('thuis.cam.kop'), false)}${rechts}${kies}</div>${vakken}`);
    // Smal (besluit 201): één beeld, de andere wisselen; wat beweegt blijft staan. Een stipje per camera.
    const eerste = lijst[0];
    const tegels = lijst.map((c, i) => {
      const src = camBeeld.get(c.id);
      return `<div class="camtegel${i === 0 ? ' aan' : ''}" data-camtegel="${i}">${src ? `<img alt="" src="${src}">` : ''}</div>`;
    }).join('');
    if (eerste) html += `<div class="ktegel foto cam" role="button" tabindex="0" aria-label="${esc(t('thuis.cam.groot', { naam: eerste.naam }))}" data-cam="0" data-cam-wissel="${lijst.length > 1 && !eerste.nu ? '1' : '0'}">${tegels}<span class="tnaam" data-camtnaam>${eigen.icoon(eerste.deurbel ? 'bel' : 'camera')}<span>${esc(eerste.naam)}</span></span><span class="tzin" data-camtzin>${esc(camZin(eerste))}</span>${lijst.length > 1 ? `<span class="camstip" aria-hidden="true">${lijst.map((c, i) => `<i class="${i === 0 ? 'aan' : ''}${c.nu ? ' nu' : ''}"></i>`).join('')}</span>` : ''}</div>`;
  }
  zetKaart('[data-deurbelkaart]', 'deurbel', html, hier);
}

// Smal: elke zes tellen het volgende beeld, met zijn naam en zijn regel.
setInterval(() => {
  const lijst = camerasGekozen();
  for (const k of document.querySelectorAll('[data-cam-wissel="1"]')) {
    if (!k.getClientRects().length || lijst.length < 2) continue;
    const i = (Number(k.dataset.cam) + 1) % lijst.length;
    const c = lijst[i];
    k.dataset.cam = String(i);
    k.querySelectorAll('[data-camtegel]').forEach((x) => x.classList.toggle('aan', Number(x.dataset.camtegel) === i));
    k.querySelectorAll('.camstip i').forEach((x, j) => x.classList.toggle('aan', j === i));
    k.querySelector('[data-camtnaam]').innerHTML = `${eigen.icoon(c.deurbel ? 'bel' : 'camera')}<span>${esc(c.naam)}</span>`;
    k.setAttribute('aria-label', t('thuis.cam.groot', { naam: c.naam }));
    k.querySelector('[data-camtzin]').textContent = camZin(c);
  }
}, 6_000);

// Een tik op een beeld: groot en live, met de andere camera's eronder om te wisselen (besluit 201).
document.addEventListener('click', (e) => {
  const vak = e.target.closest('[data-deurbelkaart] [data-cam]');
  if (!vak || document.body.classList.contains('aanpassen') || e.target.closest('[data-cam-kies]')) return;
  const lijst = camerasGekozen();
  const c = lijst[Number(vak.dataset.cam)] ?? lijst[0];
  if (!c) return;
  const andere = lijst.map((x) => ({ camera: x.id, reserve: x.reserve, naam: x.naam, zin: camZin(x), plaatje: camBeeld.get(x.id) ?? null, voorrang: x.deurbel }));
  app.aanbellen({ camera: c.id, reserve: c.reserve, naam: c.naam, zin: camZin(c), titel: t('thuis.cam.kop'), schermAan: false, seconden: 120, voorrang: c.deurbel, andere });
});

/* ------------------------------------------------------------- het weer */

/** De boiler of de jacuzzi (besluit 189): hoe warm, en of hij op zon opwarmt; een tik opent Apparaten. */
function tekenBoiler() {
  const alles = (huisData?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
  const x = alles.find((a) => a.warmte?.soort === 'boiler') ?? alles.find((a) => a.warmte?.soort === 'jacuzzi');
  const w = x?.warmte;
  const vol = !w ? 0 : w.tempC == null ? 0.5 : Math.max(0.05, Math.min(1, (w.tempC - (w.minC - 10)) / Math.max(1, w.zonC - (w.minC - 10))));
  const zin = !w ? '' : w.tempC == null ? t('thuis.boiler.onbekend') : x.aan ? `${t(w.opZon ? 'thuis.boiler.opZon' : 'thuis.boiler.warmt')}${w.doelC != null ? `, ${t('thuis.boiler.naar', { doel: w.doelC })}` : ''}` : t('thuis.boiler.rust');
  const waarde = w?.tempC == null ? '–' : `${getal(w.tempC, 0)}°`;
  const toon = x?.aan ? (w.opZon ? 'var(--zon-t)' : 'var(--gloed-t)') : '';
  zetKaart('[data-boiler]', 'boiler', x
    ? `<div class="kvol">${kaartKop('boiler', x.naam)}<div class="lading"><span class="getal">${waarde}</span><div class="laadbalk"><i style="width: ${(vol * 100).toFixed(0)}%; background: linear-gradient(90deg, #4d86c9, #ff9a6b)"></i></div><small style="color: ${toon || 'var(--zacht)'}">${esc(zin)}</small></div></div>${tegel({ id: 'boiler', naam: x.naam, waarde, zin, toon, beeld: tank(vol, 'kaart') })}`
    : '', !!x);
}

/** Het weer van morgen (besluit 162): een kaart om te kiezen; een tik opent het weer. */
function tekenMorgen() {
  const d = weer?.dagen?.[0];
  $$('[data-morgen]').forEach((el) => {
    el.hidden = !d;
    if (!d) return;
    const kort = d.verwachtKwh != null ? t('thuis.tegel.vanPanelen', { kwh: getal(d.verwachtKwh) }) : d.regenkansPct != null ? t('thuis.tegel.regen', { pct: d.regenkansPct }) : '';
    const html = `<div class="kvol morgen">${weerIcoon(d.soort)}<b>${esc(t('thuis.weer.morgen'))}</b><span class="graden">${d.maxC == null ? '–' : `${getal(d.maxC, 0)}°`}${d.minC == null ? '' : `<small> / ${getal(d.minC, 0)}°</small>`}</span><span class="mini">${esc([d.regenkansPct != null ? t('thuis.weer.regen', { pct: d.regenkansPct }) : '', d.verwachtKwh != null ? t('thuis.weer.vanPanelen', { kwh: getal(d.verwachtKwh) }) : ''].filter(Boolean).join(', '))}</span></div>${tegel({ id: 'morgen', naam: t('thuis.weer.morgen'), waarde: `${d.maxC == null ? '–' : `${getal(d.maxC, 0)}°`}${d.minC == null ? '' : ` <small>/ ${getal(d.minC, 0)}°</small>`}`, zin: kort, beeld: `<span class="beeld" style="top: 14px">${weerIcoon(d.soort)}</span>` })}`;
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  });
}

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
const UUR = opmaak({ hour: '2-digit', minute: '2-digit', hour12: false });

/** De buitentemperatuur: van de eigen sensor, of anders van de weerbron (besluit 128). */
const buitenNu = () => state?.explanation?.outdoorTemperatureC ?? weer?.vandaag?.buitenC ?? null;

function tekenWeerknop() {
  const buitenC = buitenNu();
  const icoon = weer?.vandaag?.soort ? weerIcoon(weer.vandaag.soort) : '';
  for (const knop of $$('[data-buiten]')) {
    const tel = knop.closest('#tel') != null;
    // Zonder temperatuur het weer in woorden, zoals "Zonnig".
    const tekst = buitenC == null ? (weer ? (weer.vandaag?.tekst ?? t('thuis.weer.kop')) : '') : tel ? `${getal(buitenC, 0)}°` : t('thuis.weer.buiten', { graden: getal(buitenC) });
    knop.innerHTML = `${icoon}${esc(tekst)}`;
    knop.hidden = !tekst;
    knop.disabled = weer == null;
    knop.setAttribute('aria-label', weer ? t('thuis.weer.knop', { tekst }) : tekst);
  }
  // Niet opnieuw opbouwen terwijl het open is: dan verspringt de focus.
  if (weer && $$('[data-weer]').every((b) => b.hidden)) tekenWeer();
}

/** Wat het blad nu toont: het weer of de batterijen (besluit 127). */
let blad = 'weer';
/** Welk deel buiten open staat (besluit 206): `{ kamer, zone }`, `{ alles: true }`, of null. */
let buitenKeuze = null;

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
    return `<${tag} class="accu${bijnaOp(b.pct, 'batterij', huisData) ? ' leeg' : ''}"${href}>
      <b>${esc(b.naam)}</b><span class="pct">${b.pct}%</span>
      <span>${esc(b.kamer ?? t('thuis.batterijen.geenKamer'))}</span>
      <i><b style="width: ${Math.max(2, Math.min(100, b.pct))}%"></b></i>
    </${tag}>`;
  }).join('');
  for (const el of $$('[data-weer]')) {
    el.setAttribute('aria-label', t('thuis.batterijen.kop'));
    el.innerHTML = `
      <div class="weerkop"><h2 class="kop-3">${esc(t('thuis.batterijen.kop'))}</h2><button class="sluit" type="button" aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
      ${rijen || `<p class="mini">${esc(t('thuis.batterijen.geen'))}</p>`}
      <p class="mini voet">${esc(huisData?.drempels?.batterij === null ? t('thuis.batterijen.geenMelding') : t('thuis.batterijen.onder', { pct: huisData?.drempels?.batterij ?? 10 }))} <a href="functies.html#meldingen">${esc(t('thuis.batterijen.wanneer'))}</a> ${esc(t('thuis.batterijen.nietBij'))}</p>`;
    el.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
}

const DAGNAAM = opmaak({ weekday: 'long', timeZone: 'UTC' });
const DATUM = opmaak({ day: 'numeric', month: 'short', timeZone: 'UTC' });

function tekenWeer() {
  const v = weer.vandaag;
  const schaal = Math.max(1, v.heldereLuchtKwh, ...weer.dagen.map((d) => d.heldereLuchtKwh));
  const balk = (kwh) => `<i><b style="width: ${Math.min(100, (kwh / schaal) * 100).toFixed(1)}%"></b></i>`;
  const vandaagKwh = v.verwachtKwh ?? v.opgewektKwh;
  const rijen = [
    `<div class="rij">
      <div class="dag">${esc(t('thuis.weer.vandaag'))}<span>${esc(v.tekst ?? '')}</span></div>${weerIcoon(v.soort)}
      <div class="temp"><span>${buitenNu() == null ? '' : vet('thuis.weer.nu', { graden: getal(buitenNu()) })}</span><span>${v.zonkansPct == null ? '' : esc(t('thuis.weer.zon', { pct: v.zonkansPct }))}</span></div>
      <div class="opbrengst">${balk(vandaagKwh)}<span>${v.verwachtKwh != null ? `${getal(v.verwachtKwh)} kWh` : esc(t('thuis.weer.totNu', { kwh: getal(v.opgewektKwh) }))}</span></div>
    </div>${urenStrook(v.uren ?? [])}`,
    ...weer.dagen.map((d, i) => {
      const datum = new Date(`${d.datum}T12:00:00Z`);
      const naam = i === 0 ? esc(t('thuis.weer.morgen')) : DAGNAAM.format(datum).replace(/^./, (c) => c.toUpperCase());
      return `<div class="rij">
        <div class="dag">${naam}<span>${DATUM.format(datum)}</span></div>${weerIcoon(d.soort)}
        <div class="temp"><span><b>${d.maxC == null ? '–' : `${getal(d.maxC, 0)}°`}</b> ${d.minC == null ? '' : `/ ${getal(d.minC, 0)}°`}</span><span>${d.regenkansPct == null ? '' : esc(t('thuis.weer.regen', { pct: d.regenkansPct }))}</span></div>
        <div class="opbrengst">${balk(d.verwachtKwh ?? 0)}<span>${d.verwachtKwh == null ? '' : `${getal(d.verwachtKwh)} kWh`}</span></div>
      </div>`;
    }),
  ].join('');
  const g = weer.geleerd ?? { dagen: 0 };
  const geleerd = g.lijn ? ` ${t('thuis.weer.verband', { n: g.dagen })}` : g.dagen ? ` ${t('thuis.weer.bijgesteld', { n: g.dagen })}` : '';
  blad = 'weer';
  for (const blad of $$('[data-weer]')) {
    blad.setAttribute('aria-label', t('thuis.weer.kop'));
    blad.innerHTML = `
      <div class="weerkop"><h2 class="kop-3">${esc(t('thuis.weer.kop'))}</h2><button class="sluit" type="button" aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
      ${rijen}
      <p class="mini voet">${esc(t('thuis.weer.voet', { bron: weer.bron ?? 'Buienradar' }))}${esc(geleerd)}</p>`;
    blad.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
}

/**
 * Het weer per uur, de komende 24 uur (besluit 128): een strook om opzij te
 * vegen, met de regenkans als die er toe doet.
 */
function urenStrook(uren) {
  if (!uren.length) return '';
  const cellen = uren.map((u, i) => `<div class="uur"><span>${esc(i === 0 ? t('thuis.weer.nuKop') : UUR.format(new Date(u.tMs)))}</span>${uurIcoon(u)}<b>${u.buitenC == null ? '–' : `${getal(u.buitenC, 0)}°`}</b><span class="kans">${u.regenkansPct != null && u.regenkansPct >= 30 ? `${u.regenkansPct}%` : ''}</span></div>`).join('');
  return `<div class="uren" role="list" aria-label="${esc(t('thuis.weer.perUur'))}">${cellen}</div>`;
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
  $$('[data-buiten], [data-alles-buiten]').forEach((k) => k.setAttribute('aria-expanded', 'false'));
  // Het deel buiten licht niet meer op.
  if (buitenKeuze) {
    buitenKeuze = null;
    teken();
  }
}

/** Het blad van buiten (besluit 206), op de plek van het weer: op de wand naast het huis, op de telefoon onderin. */
function tekenBuiten() {
  const inhoud = buitenBlad.html(buitenKeuze, huisData);
  if (inhoud == null) return void sluitWeer();
  for (const el of $$('[data-weer]')) {
    el.setAttribute('aria-label', t('buiten.alles'));
    el.innerHTML = inhoud;
    el.querySelector('.sluit').addEventListener('click', sluitWeer);
  }
}
function openBuiten(keuze) {
  const blad0 = document.getElementById(app.telStand() ? 'weer-tel' : 'weer-wand');
  blad = 'buiten';
  buitenKeuze = keuze;
  tekenBuiten();
  if (!buitenKeuze) return;
  blad0.hidden = false;
  if (blad0.id === 'weer-tel') document.querySelector('[data-weer-achter]').hidden = false;
  $$('[data-alles-buiten]').forEach((k) => k.setAttribute('aria-expanded', String(!!keuze.alles)));
  teken();
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
// Een andere weergave (besluit 164): opnieuw tekenen, met of zonder getallen op het huis.
addEventListener('weergave', teken);
addEventListener('sc-kleuren', teken);
// Weet de pagina pas na het laden of het huis panelen en een meter heeft (besluit 196): de gegevens erbij en opnieuw.
addEventListener('huissoort', () => void kaartGegevens().then(teken));
// De wand als niemand kijkt (besluit 164): het huis, de stand en het weer van deze pagina.
niemand.bij({ model: () => (state && huisData ? huisModel() : null), state: () => state, huis: () => huisData, weer: () => weer, zon: () => zon });
// Na een keuze of een tik op een favoriet: opnieuw tekenen, en zo nodig het huis opnieuw lezen.
eigen.bij(async (huisOok) => {
  if (huisOok) {
    try {
      huisData = await haal('api/huis');
    } catch {
      // De volgende keer.
    }
  }
  // Net een kaart erbij gezet: meteen zijn gegevens, niet pas over een minuut.
  await kaartGegevens();
  teken();
});

app.start('thuis');
$$('[data-buiten]').forEach((k) => k.addEventListener('click', () => openWeer(k)));

/*
 * De stand van het huis (besluit 167): een tik op "Automatisch" zegt welke
 * standen er zijn, wat ze doen, en wat er nu geldt. Kiezen komt in stap B: de
 * stand stuurt nu via Home Assistant de verwarming, en daar schrijft Smart
 * Climate niet aan.
 */
const STANDEN = ['automatisch', 'voorverwarmen', 'dag', 'nacht', 'afwezig', 'vakantie', 'handmatig'];
/** Wat een stand doet; bij Automatisch met de uren van de dagdelen, als die er zijn. */
const standUitleg = (id, d) => (id === 'automatisch' && d ? t('thuis.standUitleg.automatischUren', { voorverwarmen: d.voorverwarmen, dag: d.dag, nacht: d.nacht }) : t(`thuis.standUitleg.${id}`));
let dagdelen = null;
async function openModus() {
  const el = document.querySelector('[data-kiesblad]');
  if (!el || !state) return;
  if (!dagdelen) dagdelen = (await haal('api/comfort').catch(() => null))?.dagdelen ?? null;
  const e = state.explanation ?? {};
  const auto = e.modeSource === 'schedule';
  const nu = auto ? 'automatisch' : e.mode;
  const naam = (id) => (STANDEN.includes(id) ? t(`thuis.stand.${id}`) : id);
  // Wat er nu geldt, en wanneer de klok de stand verandert.
  const uur = new Date().getHours();
  const volgende = dagdelen && auto ? [['voorverwarmen', dagdelen.voorverwarmen], ['dag', dagdelen.dag], ['nacht', dagdelen.nacht]].sort((a, b) => ((a[1] - uur + 24) % 24 || 24) - ((b[1] - uur + 24) % 24 || 24))[0] : null;
  const zin = auto
    ? `${vet('thuis.modus.nuAuto', { stand: naam(e.mode) })}${volgende && e.mode !== 'afwezig' ? ` ${esc(t('thuis.modus.om', { uur: volgende[1], stand: naam(volgende[0]).toLowerCase() }))}` : ''}`
    : vet('thuis.modus.nuHA', { stand: naam(e.mode) });
  el.dataset.blad = 'modus';
  el.setAttribute('aria-label', t('thuis.modus.kop'));
  el.innerHTML = `<div class="bladkop"><h2 class="kop-2">${esc(t('thuis.modus.kop'))}</h2><button type="button" class="knop knop-licht" data-blad-dicht>${esc(t('algemeen.klaar'))}</button></div>
    <p class="klein" style="margin: 0 0 4px">${zin}</p>
    ${STANDEN.map((id) => `<div class="modusrij${id === nu ? ' nu' : ''}" ${id === nu ? 'aria-current="true"' : ''}><b>${esc(naam(id))}${id === nu ? `<span class="mini"> · ${esc(t('thuis.nuKlein'))}</span>` : ''}</b><span>${esc(standUitleg(id, dagdelen))}</span></div>`).join('')}
    <p class="mini" style="margin: 10px 0 0">${esc(t('thuis.modus.nogNiet'))}</p>`;
  document.querySelector('[data-kies-achter]').hidden = false;
  el.hidden = false;
  el.querySelector('button')?.focus();
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-modus]') && !eigen.bewerkt) void openModus();
});

// Onderhoud: openklappen, en bij meer dan één de lijst met batterijen en filters.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-onderhoud-knop]')) {
    onderhoudOpen = !onderhoudOpen;
    tekenOnderhoud();
  } else if (e.target.closest('[data-onderhoud-alles]')) {
    openWeer(document.querySelector(`${app.zicht()} [data-buiten]`), 'batterij');
  }
});
document.querySelector('[data-weer-achter]').addEventListener('click', sluitWeer);
// Het weer van morgen opent het weer, behalve tijdens het aanpassen.
document.addEventListener('click', (e) => {
  const kaart = e.target.closest('[data-morgen]');
  if (kaart && !eigen.bewerkt) openWeer(document.querySelector(`${app.zicht()} [data-buiten]`));
});
// Tikken naast het blad sluit het ook, net als Escape.
document.addEventListener('pointerdown', (e) => {
  const open = $$('[data-weer]').some((b) => !b.hidden);
  // Een tik op een ander deel buiten opent dat deel, dus niet eerst dicht.
  if (open && !e.target.closest('[data-weer], [data-buiten], [data-onderhoud], [data-alles-buiten], .podium .sc-tik')) sluitWeer();
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
});
// De rondleiding (besluit 139): de eerste keer vanzelf (rondleiding.js), daarna achter het vraagteken.
$$('[data-uitleg]').forEach((b) => b.addEventListener('click', () => rondleiding.start()));
// Een tik op een kamer in het huis opent die kamer.
// Een deel buiten opent zijn blad, en je blijft op Thuis (besluit 206).
const openKamer = (e) => {
  const k = e.target.closest('[data-kamer]');
  if (!k) return;
  if (buitenBlad.isBuiten(huisData, k.dataset.kamer)) openBuiten({ kamer: k.dataset.kamer, zone: k.dataset.zone ?? null });
  else location.href = `kamer.html#${encodeURIComponent(k.dataset.kamer)}`;
};
// In het blad: een lamp, een zone of een deel schakelen, of een ander deel openen.
document.addEventListener('click', async (e) => {
  const knop = e.target.closest('[data-weer] [data-bb-open], [data-weer] [data-bb-lamp], [data-weer] [data-bb-zone], [data-weer] [data-bb-kamer], [data-weer] [data-bb-buiten]');
  if (!knop || blad !== 'buiten') return;
  const uit = await buitenBlad.tik(knop, huisData, async () => {
    try {
      huisData = await haal('api/huis');
    } catch {
      // De volgende keer.
    }
    teken();
  });
  if (uit && uit !== true) openBuiten(uit);
  else if (uit === true) teken();
});
$$('[data-alles-buiten]').forEach((k) => k.addEventListener('click', () => (buitenKeuze?.alles ? sluitWeer() : openBuiten({ alles: true }))));
for (const podium of [document.getElementById('podium-wand'), document.getElementById('podium-tel')]) {
  podium.addEventListener('click', openKamer);
  podium.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openKamer(e)));
}
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
// Beweging en lampen in het huis (15 oktober 2026) en wie er thuis is: live, zodra
// de dienst zegt dat er iets veranderde (21 oktober 2026).
app.bijVerandering('huis', async () => {
  huisData = await haal('api/huis');
  teken();
});
app.bijVerandering('bewoners', async () => {
  bewoners = await haal('api/bewoners');
  teken();
});
app.live((nieuw) => {
  state = nieuw;
  teken();
});
