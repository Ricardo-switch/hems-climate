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

const { $$, nl, zet, esc, haal, deur, tijdVanDeDag, lucht, bijnaOp } = app;

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
  const t = huismodel.tekening(huisData, { kamer: kamerModel, zon });
  const { etages, oprit, tuin, terras, balkon, voortuin, garage } = t;
  const tijd = tijdVanDeDag(zon);
  const helder = zon?.heldereLuchtW ?? 0;
  const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : tijd === 'nacht' ? 0 : 0.3;
  const piekW = t.piekW;
  // Hoe de panelen liggen, zoals bij Inrichten (besluit 166): per kant bij beide kanten.
  const opDak = huismodel.panelenOpDak(aansluiting?.antwoorden?.panelen, piekW);
  const maand = new Date().getMonth() + 1;

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
    zon: zon?.dag ? { stand: zon.dag.fractie, hoogte: zon.dag.hoogteDeel, aandeel: Math.min(1, (zonKw * 1000) / Math.max(helder, 1500)), ...opDak } : { aandeel: 0, ...opDak },
    etages,
    buitenunit: t.buitenunit,
    voordeur: t.voordeur,
    net: true,
    oprit,
    tuin,
    terras,
    balkon,
    voortuin,
    garage,
    stromen,
    labels,
  };
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
  // De begroeting (15 oktober 2026), naar de tijd van de dag, met wie je bent (besluit 147).
  const uur = new Date().getHours();
  const groet = uur < 6 ? 'Goedenacht' : uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
  // Ieder in zijn eigen kleur (besluit 181).
  const namen = huismodel.groetWie(bewoners);
  $$('[data-groet]').forEach((el) => (el.innerHTML = namen.length ? `${esc(groet)}, ${namen.map((n) => `<b data-kleur="${esc(app.kleurVan(n.id))}">${esc(n.naam)}</b>`).reduce((t, n, i, a) => (i === 0 ? n : `${t}${i === a.length - 1 ? ' en ' : ', '}${n}`), '')}` : esc(groet)));
  tekenGeldt();
  tekenOnderhoud();
  if (blad === 'batterij' && $$('[data-weer]').some((x) => !x.hidden)) tekenBatterijen();
  const wandPodium = document.getElementById('podium-wand');
  if (!app.telStand()) huis.teken(wandPodium, model, { breedte: wandPodium.clientWidth || 860, hoogte: 612, schuifX: 18, schuifY: 20, tik: true });
  // Eenvoudig (besluit 164): geen getallen op het huis.
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((et) => ({ ...et, kamers: et.kamers.map((k) => ({ ...k, stil: true })) })), labels: app.weergave().eenvoudig ? [] : model.labels.filter((l) => l.bij === 'panelen').map((l) => ({ ...l, dx: -40, dy: -84 })) }, { breedte: 390, hoogte: 330, marge: 0.03, schuifY: 14, tik: true });

  tekenVandaag();
  tekenStraks();
  tekenApparaat();
  tekenGevoel();
  tekenKamersTel();
  tekenMorgen();
  tekenLading();
  tekenMaand();
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
  const leeg = (huisData?.batterijen ?? []).filter((b) => bijnaOp(b.pct, 'batterij', huisData)).map((b) => ({ tekst: `${b.kamer ?? b.naam}: batterij ${b.pct}%`, lang: `Batterij bijna leeg: ${b.naam}, ${b.pct}%`, href: b.kamerId ? `kamer.html#${encodeURIComponent(b.kamerId)}/${encodeURIComponent(`batterij-${b.id}`)}` : null }));
  const vol = (huisData?.filters ?? []).map((f) => ({ tekst: `${f.naam}: filter ${f.pct}%`, lang: `Filter schoonmaken: ${f.naam}, ${f.pct}%`, href: `kamer.html#${encodeURIComponent(f.kamerId)}/${encodeURIComponent(f.id)}` }));
  return [...leeg, ...vol];
}
function tekenOnderhoud() {
  const lijst = onderhoudLijst();
  if (!lijst.length) onderhoudOpen = false;
  const eerste = lijst[0];
  const bekijk = lijst.length === 1 && eerste.href ? `<a href="${esc(eerste.href)}">Bekijk</a>` : '<button type="button" data-onderhoud-alles>Bekijk</button>';
  $$('[data-onderhoud]').forEach((el) => {
    el.hidden = lijst.length === 0;
    if (!lijst.length) return;
    el.innerHTML = `<button type="button" class="pil onderhoudknop" data-onderhoud-knop aria-expanded="${onderhoudOpen}" aria-label="Onderhoud: ${lijst.length} ${lijst.length === 1 ? 'ding' : 'dingen'} te doen"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>${lijst.length > 1 ? `<b>${lijst.length}</b>` : ''}</button>${onderhoudOpen ? `<span class="pil onderhoudtekst" title="${esc(lijst.map((x) => x.lang).join(', '))}"><span>${esc(lijst.length === 1 ? eerste.tekst : `${eerste.tekst} +${lijst.length - 1}`)}</span>${bekijk}</span>` : ''}`;
  });
}

/** Vandaag staat op de wand rechts, en op de telefoon onderaan (besluit 159). */
function tekenVandaag() {
  const boxen = $$('[data-dag]');
  if (!vandaag?.kwartieren?.length) {
    boxen.forEach((box) => (box.innerHTML = '<p class="mini">Nog geen metingen van vandaag.</p>'));
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
  // Elk een eigen verloop: een verloop in de verborgen weergave tekent niet.
  boxen.forEach((box, i) => (box.innerHTML = `<svg viewBox="0 0 ${B} ${hoog}" width="${B}" height="${hoog}" aria-label="De zon van vandaag, en wanneer de airco's draaiden">
    <defs><linearGradient id="zonvlak-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.55"/><stop offset="1" stop-color="#F7B548" stop-opacity="0.02"/></linearGradient></defs>
    ${helder ? `<path d="${helder}" fill="none" stroke="#F7B548" stroke-opacity="0.35" stroke-dasharray="2 4"/>` : ''}
    <path d="${vlak}" fill="url(#zonvlak-${i})"/><path d="${lijn}" fill="none" stroke="#F7B548" stroke-width="2"/>
    <line x1="${nuX}" y1="14" x2="${nuX}" y2="${hoog - 14}" stroke="#EEF3F7" stroke-opacity="0.6"/>
    <text x="${nuX}" y="10" fill="#B8C4CF" font-size="10" text-anchor="middle" font-family="Figtree">nu</text>
    <g font-family="Figtree" font-size="10.5" fill="#7F8E9C">${banenSvg}${uren}</g>
  </svg>`));
  const kwh = (vandaag.zonWh ?? 0) / 1000;
  // Naast wat de dag ervoor werd verwacht (besluit 137); anders wat er nog komt.
  const vooraf = weer?.vandaag?.verwachtVoorafKwh;
  const verwacht = weer?.vandaag?.verwachtKwh;
  zet('[data-opgewekt]', vooraf != null ? `${nl(kwh)} kWh, verwacht ${nl(vooraf)}` : verwacht != null && verwacht > kwh + 0.05 ? `${nl(kwh)} kWh, verwacht ${nl(verwacht)}` : `${nl(kwh)} kWh opgewekt`);
  const terug = (vandaag.netTerugWh ?? 0) / 1000;
  const uitleg = `Gestippeld: de ${lijn2.naam}.`;
  zet('[data-dag-zin]', kwh > 0.05 ? `${nl(Math.max(0, Math.min(100, ((kwh - terug) / kwh) * 100)), 0)}% zelf gebruikt. ${uitleg}` : uitleg);
  // Eenvoudig (besluit 164, schets Thuis-Tel-Eigen #eenvoudig): de dag in één zin.
  const zelf = kwh > 0.05 ? (kwh - terug) / kwh : 0;
  $$('[data-dag-eenvoudig]').forEach((el) => (el.innerHTML = kwh > 0.05 ? `Je panelen gaven al <b>${nl(kwh)} kWh</b>. ${zelf >= 0.9 ? 'Bijna alles gebruikte het huis zelf.' : zelf >= 0.5 ? 'Het meeste gebruikte het huis zelf.' : 'Het meeste ging naar het net.'}` : 'Je panelen gaven vandaag nog niets.'));
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
  const klok = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
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
    : rest != null ? `<text x="28" y="33" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="13" fill="#EEF3F7">${rest >= 60 ? `${Math.floor(rest / 60)}u${String(rest % 60).padStart(2, '0')}` : `${rest}m`}</text>` : '';
  const ring = `<svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="5" ${d.stand === 'running' ? '' : 'stroke-dasharray="3 5"'}/>${deel > 0 ? `<circle cx="28" cy="28" r="24" fill="none" stroke="${kleur}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(deel * R).toFixed(1)} ${R.toFixed(1)}" transform="rotate(-90 28 28)"/>` : ''}${binnen}</svg>`;
  const zin = klaar ? `Klaar sinds ${klok(klaar)}, draait nog tegen kreuken` : eind ? `Draait, klaar rond ${klok(eind)}` : d.kop;
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
  const actie = wacht.intent.action === 'heat' ? 'verwarmen' : 'koelen';
  zet('[data-straks-kop]', `${huismodel.metHoofdletter(zoneNaam(wacht.intent.zoneId, huisData))} gaat ${actie} bij ${nl(wacht.intent.budgetW / 1000)} kW zon`);
  const over = Math.max(0, state.explanation?.budget?.availableW ?? 0);
  zet('[data-straks-zin]', `${over >= 50 ? `Nu is er ${nl(over / 1000)} kW over.` : 'Nu is er geen zon over.'} Zodra er genoeg is, begint hij vanzelf.`);
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
const klokVan = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
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
    ? `${lijst.map((b) => `${b.naam} ${thuis.has(b.id) ? 'thuis' : 'weg'}`).join(', ')}.${g ? ` Het comfort van ${g.naam} geldt.` : ''} Tik om te kiezen.`
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
  const graad = (c) => (c == null ? '–' : `${String(c).replace('.', ',')}°`);
  // Waarom het nu deze is, in één zin.
  const hoofd = lijst[0];
  const weg = lijst.filter((b) => !thuis.has(b.id));
  const nu = g?.waarom === 'niemand'
    ? `Niemand is thuis; dan geldt het comfort van ${g.naam}.`
    : `Nu ${g?.naam ?? hoofd?.naam ?? ''}.${weg.length && g && g.id !== hoofd?.id ? ` ${weg.map((b) => `${b.naam} is weg${b.thuisSindsMs ? ` sinds ${klokVan(b.thuisSindsMs)}` : ''}`).join(', ')}.` : ''}`;
  const rij = (id, gezichtHtml, naam, onder, rechts, aan) => `<button type="button" class="wiekeuze${aan ? ' aan' : ''}" role="radio" aria-checked="${aan}" data-wie-kies="${esc(id)}" ${gast ? 'disabled' : ''}><span class="rond" aria-hidden="true"></span>${gezichtHtml}<span><b>${esc(naam)}</b><small>${onder}</small></span><span class="temp">${rechts}</span></button>`;
  const rijen = lijst.map((b) => {
    const t = wieTemps.get(b.id);
    const isThuis = thuis.has(b.id);
    const onder = isThuis ? '<span class="thuis-t">thuis</span>' : esc(`weg${b.thuisSindsMs ? ` sinds ${klokVan(b.thuisSindsMs)}` : ''}`);
    const rechts = t ? [t.dag != null ? `<b>${graad(t.dag)}</b> overdag` : '', t.nacht != null ? `<b>${graad(t.nacht)}</b> 's nachts` : ''].filter(Boolean).join('<br>') : '';
    return rij(b.id, `<span class="gezicht${isThuis ? '' : ' afwezig'}" data-kleur="${esc(app.kleurVan(b.id))}" aria-hidden="true">${esc(b.naam.charAt(0).toUpperCase())}</span>`, b.naam, onder, rechts, gekozen === b.id);
  }).join('');
  el.dataset.blad = 'wie';
  el.setAttribute('aria-label', 'Wiens comfort geldt?');
  el.innerHTML = `<div class="bladkop"><h2 class="kop-2">Wiens comfort geldt?</h2><button type="button" class="knop knop-licht" data-blad-dicht>Klaar</button></div>
    <div role="radiogroup" aria-label="Wiens comfort geldt">
      ${rij('', '<span class="gezicht vanzelf" aria-hidden="true">⟳</span>', 'Vanzelf: wie thuis is', esc(nu), '', gekozen == null)}
      ${rijen}
    </div>
    <p class="mini" style="margin: 12px 0 0">${gast ? 'Als gast kijk je mee; kiezen doet een bewoner.' : 'Kies je iemand, dan geldt dat tot er iemand thuiskomt of weggaat.'}${wieTemps.size ? ` De temperaturen zijn van ${esc([...wieTemps.values()].find(Boolean)?.kamer ?? 'de eerste kamer')}.` : ''}</p>`;
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
  const t = e.target.closest('[data-wie-kies]');
  if (!t || t.disabled) return;
  const id = t.dataset.wieKies || null;
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
      return `<a href="kamer.html#${encodeURIComponent(r.id)}"><span class="stip" style="width: 10px; height: 10px; background: ${kleur[stand] ?? 'var(--gedempt)'}"></span><span><b>${esc(r.naam)}</b><small style="color: ${app.tekstKleur(kleur[stand] ?? 'var(--zacht)')}">${esc(kort)}</small></span><span class="getal">${nl(r.temperatuurC)}°</span><span class="pijl" aria-hidden="true">›</span></a>`;
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
let deurbel = null;
let deurbelBeeld = null;
let deurbelOp = 0;
const staatErin = (id) => $$(`[data-kaart="${id}"]`).some((el) => !el.hasAttribute('data-uit'));
const kw = (w) => `${nl(Math.abs(w) / 1000, 1)} kW`;
const kaartKop = (id, titel, pijl = true) => `<div class="kaartkop"><span class="ik">${eigen.icoon(id)}</span><h2 class="kop-3">${esc(titel)}</h2>${pijl ? '<span class="pijl" aria-hidden="true">›</span>' : ''}</div>`;
const lading = (pct, kleur, zin, zinKleur) =>
  `<div class="lading"><span class="getal">${pct == null ? '–' : `${nl(pct, 0)}%`}</span><div class="laadbalk"><i style="width: ${Math.max(0, Math.min(100, pct ?? 0))}%; background: ${kleur}"></i></div><small style="color: ${zinKleur}">${esc(zin)}</small></div>`;

async function kaartGegevens() {
  const nu = Date.now();
  // Deze maand: hooguit elke tien minuten; het is een rekensom over de hele maand.
  if (staatErin('maand') && nu - maandOp > 10 * 60_000) {
    maandOp = nu;
    try {
      const res = await fetch('api/opbrengst?soort=maand', { cache: 'no-store' });
      maand = res.status === 409 ? { meters: false } : res.ok ? await res.json() : null;
    } catch {
      // De volgende keer.
    }
  }
  try {
    deurbel = await haal('api/deurbel');
  } catch {
    deurbel = null;
  }
  // Het beeld van de deurbel: hooguit elke minuut een nieuw plaatje.
  if (deurbel?.aan && staatErin('deurbel') && nu - deurbelOp > 60_000) {
    deurbelOp = nu;
    // Geeft het gekozen beeld niets, dan een ander beeld van dezelfde camera, zoals bij aanbellen.
    let res = null;
    for (const id of [deurbel.camera, ...(deurbel.reserve ?? [])]) {
      res = await fetch(`api/camera?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
      if (res?.ok) break;
    }
    if (res?.ok) {
      if (deurbelBeeld) URL.revokeObjectURL(deurbelBeeld);
      deurbelBeeld = URL.createObjectURL(await res.blob());
    }
  }
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
  const autoZin = !a ? '' : a.laadt ? `Laadt${a.vermogenW ? `, ${kw(a.vermogenW)}` : ''}` : a.aangesloten === true ? 'Aangesloten, laadt niet' : a.aangesloten === false ? 'Niet aangesloten' : '';
  const bereik = a?.bereikKm != null ? `${autoZin ? ' · ' : ''}${nl(a.bereikKm, 0)} km` : '';
  zetKaart('[data-auto]', 'auto', a ? `${kaartKop('auto', a.naam)}${lading(a.pct, a.laadt ? 'var(--mint)' : 'var(--net)', autoZin + bereik, a.laadt ? 'var(--mint-t)' : 'var(--zacht)')}` : '', !!a);
  const b = huisData?.opslag?.batterij ?? null;
  const st = b?.stand;
  const bZin = st === 'laadt' ? `Laadt, ${kw(b.vermogenW)}` : st === 'levert' ? `Levert ${kw(b.vermogenW)} aan het huis` : st === 'rust' ? 'Rust' : '';
  const bKleur = st === 'laadt' ? 'var(--zon)' : st === 'levert' ? 'var(--violet)' : 'var(--net)';
  zetKaart('[data-batterij]', 'batterij', b ? `${kaartKop('batterij', b.naam)}${lading(b.pct, bKleur, bZin, app.tekstKleur(st === 'rust' || !st ? 'var(--zacht)' : bKleur))}` : '', !!b);
}

function tekenMaand() {
  const m = maand;
  const naam = new Date().toLocaleDateString('nl-NL', { month: 'long' });
  const titel = `${naam.charAt(0).toUpperCase()}${naam.slice(1)}, tot nu`;
  let html = '';
  if (m?.meters === false) html = `${kaartKop('maand', titel)}<p class="klein" style="margin: 8px 0 0">Kies eerst je meters, dan staat hier wat je opwekte, zelf gebruikte en wat het kostte.</p>`;
  else if (m?.stroom) {
    const eerste = m.zon ? `<div><b class="zon-t">${nl(m.zon.opgewektKwh, 0)}</b><span>kWh opgewekt</span></div>` : `<div><b>${nl(m.stroom.verbruikKwh, 0)}</b><span>kWh gebruikt</span></div>`;
    const tweede = m.zon?.zelfPct != null ? `<div><b>${nl(m.zon.zelfPct, 0)}%</b><span>zelf gebruikt</span></div>` : `<div><b>${nl(m.stroom.vanNetKwh, 0)}</b><span>kWh van het net</span></div>`;
    const kosten = m.kosten?.totaal;
    const derde = kosten != null
      ? `<div><b>€ ${nl(kosten, 0)}</b><span>gekost${m.kosten.vorige != null ? `, ${esc(m.periode?.vorigeNaam ?? 'ervoor')} € ${nl(m.kosten.vorige, 0)}` : ''}</span></div>`
      : '<div><b>–</b><span>kosten: vul je prijzen in</span></div>';
    html = `${kaartKop('maand', titel)}<div class="maanddrie">${eerste}${tweede}${derde}</div>`;
  }
  zetKaart('[data-maand]', 'maand', html, true);
}

function tekenDeurbel() {
  const d = deurbel?.aan ? deurbel : null;
  let wanneer = 'Nog niet aangebeld';
  if (d?.laatsteMs) {
    const t = new Date(d.laatsteMs);
    const vandaag = new Date().toDateString() === t.toDateString();
    wanneer = vandaag ? `Aangebeld om ${klokVan(d.laatsteMs)}` : `Laatst aangebeld ${t.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  }
  const beeld = deurbelBeeld ? `<img alt="Het laatste beeld van ${esc(d?.naam ?? 'de deurbel')}" src="${deurbelBeeld}">` : '';
  zetKaart('[data-deurbelkaart]', 'deurbel', d ? `${kaartKop('deurbel', 'De deurbel')}<div class="deurbelbeeld">${beeld}<span class="wanneer">${esc(wanneer)}</span></div>` : '', !!d);
}

// Een tik op de deurbel: het live beeld groot, zoals bij aanbellen.
document.addEventListener('click', (e) => {
  const k = e.target.closest('[data-deurbelkaart]');
  if (!k || document.body.classList.contains('aanpassen') || !deurbel?.aan) return;
  app.aanbellen({ camera: deurbel.camera, reserve: deurbel.reserve, naam: deurbel.naam, titel: 'De deurbel', schermAan: false, seconden: 120 });
});

/* ------------------------------------------------------------- het weer */

/** Het weer van morgen (besluit 162): een kaart om te kiezen; een tik opent het weer. */
function tekenMorgen() {
  const d = weer?.dagen?.[0];
  $$('[data-morgen]').forEach((el) => {
    el.hidden = !d;
    if (!d) return;
    const html = `${weerIcoon(d.soort)}<b>Morgen</b><span class="graden">${d.maxC == null ? '–' : `${nl(d.maxC, 0)}°`}${d.minC == null ? '' : `<small> / ${nl(d.minC, 0)}°</small>`}</span><span class="mini">${[d.regenkansPct != null ? `${d.regenkansPct}% regen` : '', d.verwachtKwh != null ? `${nl(d.verwachtKwh)} kWh van je panelen` : ''].filter(Boolean).join(', ')}</span>`;
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
    return `<${tag} class="accu${bijnaOp(b.pct, 'batterij', huisData) ? ' leeg' : ''}"${href}>
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
      <p class="mini voet">${esc(huisData?.drempels?.batterij === null ? 'Batterijen geven geen melding.' : `Onder de ${huisData?.drempels?.batterij ?? 10}% staat een batterij op het startscherm.`)} <a href="functies.html#meldingen">Wanneer ›</a> Telefoons, een thuisbatterij en een auto staan hier niet bij.</p>`;
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
  $$('[data-buiten]').forEach((k) => k.setAttribute('aria-expanded', 'false'));
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
// Een andere weergave (besluit 164): opnieuw tekenen, met of zonder getallen op het huis.
addEventListener('weergave', teken);
addEventListener('sc-kleuren', teken);
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
const STANDEN = [
  ['automatisch', 'Automatisch', (d) => `Volgt de dagdelen bij Comfort${d ? `: voorverwarmen vanaf ${d.voorverwarmen}:00, overdag vanaf ${d.dag}:00, de nacht vanaf ${d.nacht}:00` : ''}. Is niemand thuis, dan Afwezig.`],
  ['voorverwarmen', 'Voorverwarmen', () => 'Vroeg in de ochtend: op tijd warm voor de dag begint.'],
  ['dag', 'Dag', () => 'De temperaturen voor overdag, zoals bij Comfort.'],
  ['nacht', 'Nacht', () => 'De temperaturen voor de nacht. Brandt er nog licht, dan blijft het nog even Dag.'],
  ['afwezig', 'Afwezig', () => 'Niemand thuis: een zuinigere temperatuur.'],
  ['vakantie', 'Vakantie', () => 'Langer weg: zo zuinig mogelijk, tot je terug bent.'],
  ['handmatig', 'Handmatig', () => 'Het huis regelt niets: je bedient alles zelf.'],
];
let dagdelen = null;
async function openModus() {
  const el = document.querySelector('[data-kiesblad]');
  if (!el || !state) return;
  if (!dagdelen) dagdelen = (await haal('api/comfort').catch(() => null))?.dagdelen ?? null;
  const e = state.explanation ?? {};
  const auto = e.modeSource === 'schedule';
  const nu = auto ? 'automatisch' : e.mode;
  const naam = (id) => STANDEN.find(([x]) => x === id)?.[1] ?? id;
  // Wat er nu geldt, en wanneer de klok de stand verandert.
  const uur = new Date().getHours();
  const volgende = dagdelen && auto ? [['voorverwarmen', dagdelen.voorverwarmen], ['dag', dagdelen.dag], ['nacht', dagdelen.nacht]].sort((a, b) => ((a[1] - uur + 24) % 24 || 24) - ((b[1] - uur + 24) % 24 || 24))[0] : null;
  const zin = auto
    ? `Nu <b>${esc(naam(e.mode))}</b>, uit de dagdelen.${volgende && e.mode !== 'afwezig' ? ` Om ${volgende[1]}:00 ${esc(naam(volgende[0]).toLowerCase())}.` : ''}`
    : `Nu <b>${esc(naam(e.mode))}</b>, gekozen in Home Assistant.`;
  el.dataset.blad = 'modus';
  el.setAttribute('aria-label', 'De stand van het huis');
  el.innerHTML = `<div class="bladkop"><h2 class="kop-2">De stand van het huis</h2><button type="button" class="knop knop-licht" data-blad-dicht>Klaar</button></div>
    <p class="klein" style="margin: 0 0 4px">${zin}</p>
    ${STANDEN.map(([id, t, uitleg]) => `<div class="modusrij${id === nu ? ' nu' : ''}" ${id === nu ? 'aria-current="true"' : ''}><b>${esc(t)}${id === nu ? '<span class="mini"> · nu</span>' : ''}</b><span>${esc(uitleg(dagdelen))}</span></div>`).join('')}
    <p class="mini" style="margin: 10px 0 0">Kiezen kan hier nog niet. De stand stuurt nu je verwarming via Home Assistant, en Smart Climate kijkt alleen mee. Tot het huis zelf regelt, zet je hem in Home Assistant.</p>`;
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
  if (open && !e.target.closest('[data-weer], [data-buiten], [data-onderhoud]')) sluitWeer();
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
