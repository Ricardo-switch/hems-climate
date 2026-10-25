/*
 * Inrichten in één keer (besluit 139, 144 en 190, schets Wand-Inrichten-3).
 * Acht hoofdstukken op één pagina, zonder menu, met kleine stappen erin: je huis
 * (wat voor huis, de kamers, de apparaten), buiten, wie er woont, klimaat (wat
 * elk apparaat doet, meten, comfort, afwezig en vakantie), energie (zekering,
 * panelen, hoe ze liggen, op zon, prijzen), gemak, je schermen, en klaar (wat
 * er in Home Assistant klaar moet staan, en de film). Na Inrichten is de app af.
 * Links groeit het huis mee op zijn eiland, rechts staat één vraag. Wat Home
 * Assistant al weet, staat klaar; de bewoner kijkt of het klopt.
 *
 * Elke keuze gaat meteen naar de dienst, langs dezelfde deuren als de pagina's
 * bij Instellingen (indeling, comfort, aansluiting, energie). Onderaan staat
 * overal hetzelfde (besluit 158): links Terug, rechts Volgende. Volgende bewaart
 * wat er in beeld staat, ook als je niets aanraakte, en de stap telt dan als
 * nagelopen. Wat nog niet is nagelopen, staat bij Klaar, en alles is later te
 * openen.
 */
'use strict';

const { $$, esc, haal, deur, nl } = app;

const d = { huis: null, ind: null, comfort: null, aans: null, energie: null, zon: null, functies: null, sessie: null, bewoners: null, klaar: null, voork: null };

async function laad() {
  const namen = ['huis', 'ind', 'comfort', 'aans', 'energie', 'zon', 'functies', 'sessie', 'bewoners', 'klaar', 'voork'];
  const uit = await Promise.allSettled(['api/huis', 'api/indeling', 'api/comfort', 'api/aansluiting', 'api/energie', 'api/zon', 'api/functies', 'api/sessie', 'api/bewoners', 'api/klaarzetten', 'api/voorkeuren'].map((p) => haal(p)));
  uit.forEach((r, i) => {
    if (r.status === 'fulfilled') d[namen[i]] = r.value;
  });
  teken();
}

/* ------------------------------------------------------------ de stappen */

/** Acht hoofdstukken, elk met kleine stappen (besluit 144 en 190, schets Wand-Inrichten-3). */
const HOOFDSTUKKEN = [
  ['huis', ['woning', 'huis', 'apparaten']],
  ['buiten', ['buiten']],
  ['bewoners', ['bewoners']],
  ['klimaat', ['warmte', 'apparaat', 'meten', 'comfort', 'afwezig']],
  ['energie', ['zekering', 'zon', 'ligging', 'opzon', 'prijzen']],
  ['gemak', ['functies']],
  ['schermen', ['wand']],
  ['klaar', ['ha', 'klaar']],
].map(([h, stappen]) => [t(`inr.h.${h}`), stappen.map((s) => [s, t(`inr.stap.${s}`)])]);
const STAPPEN = HOOFDSTUKKEN.flatMap(([, stappen]) => stappen);
const ALLE = ['welkom', ...STAPPEN.map(([id]) => id)];
/** "4. Klimaat · Comfort"; een hoofdstuk met één stap heet alleen zo. */
function waarVan(id) {
  const h = HOOFDSTUKKEN.findIndex(([, st]) => st.some(([x]) => x === id));
  const stap = STAPPEN.find(([x]) => x === id);
  if (h < 0) return '';
  return HOOFDSTUKKEN[h][1].length === 1 ? `${h + 1}. ${HOOFDSTUKKEN[h][0]}` : `${h + 1}. ${HOOFDSTUKKEN[h][0]} · ${stap[1]}`;
}

const binnen = () => (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => (e.ruimtes ?? []).filter((r) => !huismodel.isBuiten(e, r)));
const buitenRuimtes = () => (d.huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).filter((r) => huismodel.isBuiten(e, r)));
const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
const sleutel = (a) => a.actuatorId ?? a.id;
const energieNu = () => d.energie?.instellingen ?? d.energie?.voorstel ?? null;

/**
 * Of een stap al ingevuld is, aan wat de dienst nu zegt. Dat kan uit Home
 * Assistant komen; nagelopen is het pas als de bewoner er op Volgende drukte.
 */
function gedaan(id) {
  if (id === 'woning') return d.ind?.indeling?.woning != null;
  if (id === 'huis') return d.huis?.indeling === 'eigen';
  if (id === 'apparaten') return d.huis != null && (d.huis.zonderRuimte ?? []).length === 0;
  if (id === 'warmte') return binnen().some((r) => klimaatIn(r).some((a) => a.klimaat?.rol && a.klimaat.rol !== 'kijken'));
  // Wat elk apparaat kan (besluit 197): geen open vraag meer.
  if (id === 'apparaat') return kanToestellen().length > 0 && !kanToestellen().some(({ a }) => kanVraagOpen(a));
  if (id === 'comfort' || id === 'afwezig') return (d.comfort?.kamers ?? []).some((k) => k.uitApp);
  // Op zon (besluit 167): iets mag al op zon. Klaarzetten: niets mist meer in Home Assistant.
  if (id === 'opzon') return Object.values(d.aans?.antwoorden?.opZon ?? {}).some(Boolean) || (d.aans?.configuratie?.apparaten ?? []).length > 0;
  if (id === 'ha') return (d.klaar?.punten ?? []).length > 0 && d.klaar.punten.every((p) => p.stand !== 'mist');
  if (id === 'buiten') return d.huis?.rond != null;
  if (id === 'meten') return binnen().filter((r) => r.zoneId).every((r) => (r.meetMet ?? []).length > 0);
  if (id === 'zon') return d.aans?.antwoorden?.panelen?.ligging != null;
  // Hoe ze liggen (besluit 157): bevestigd, met de hand ingesteld, of geen panelen.
  if (id === 'ligging') return ['bevestigd', 'configuratie'].includes(d.aans?.ligging?.stand) || d.aans?.antwoorden?.panelen?.ligging === 'geen';
  if (id === 'zekering') return d.aans?.antwoorden?.zekering != null;
  if (id === 'prijzen') return d.energie?.instellingen?.prijzen?.stroom != null;
  if (id === 'functies') return d.functies?.instellingen != null;
  if (id === 'wand') return (d.bewoners?.schermen ?? []).length > 0;
  if (id === 'bewoners') return (d.bewoners?.bewoners ?? []).length > 0;
  return false;
}

/*
 * Nagelopen (besluit 158): de stappen waar de bewoner op Volgende drukte. Dat
 * hoort bij dit apparaat, zoals de rondleiding; wie op een ander apparaat
 * verder gaat, ziet wat al ingevuld is als omlijnd.
 */
const NAGELOPEN = 'sc-inrichten-bevestigd';
const nagelopen = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(NAGELOPEN) ?? '[]'));
  } catch {
    return new Set();
  }
})();
function markeer(id) {
  nagelopen.add(id);
  try {
    localStorage.setItem(NAGELOPEN, JSON.stringify([...nagelopen]));
  } catch {
    // Zonder opslag telt het alleen op deze pagina.
  }
}

function stapNu() {
  const h = decodeURIComponent(location.hash.slice(1));
  return ALLE.includes(h) ? h : 'welkom';
}
const naar = (id) => (location.hash = id);
const volgende = (id) => ALLE[Math.min(ALLE.length - 1, ALLE.indexOf(id) + 1)];
const vorige = (id) => ALLE[Math.max(0, ALLE.indexOf(id) - 1)];

/* ------------------------------------------------------------ opslaan */

let melding = { tekst: '', fout: false };
function zeg(tekst, fout = false) {
  melding = { tekst, fout };
  $$('[data-melding]').forEach((el) => {
    el.textContent = tekst;
    el.classList.toggle('fout', fout);
  });
}

/** Een deur van de dienst: het antwoord, of null als het niet lukte (de reden staat dan in beeld). */
async function stuur(pad, body) {
  zeg(t('groep.bewaren'));
  let res;
  try {
    res = await deur(pad, body);
  } catch {
    zeg(t('groep.geenVerbinding'), true);
    return null;
  }
  if (res === null) return null;
  const uit = await res.json().catch(() => ({}));
  if (!res.ok) {
    zeg(res.status === 403 ? t('groep.beheerder') : (uit.fout ?? t('groep.nietBewaard')), true);
    return null;
  }
  zeg(t('groep.bewaard'));
  return uit;
}

/** De indeling om te veranderen: de eigen, of het voorstel uit Home Assistant. */
const concept = () => JSON.parse(JSON.stringify(d.ind?.indeling ?? d.ind?.voorstel ?? null));
async function bewaarIndeling(next, tekst = '') {
  const uit = await stuur('api/indeling', next);
  if (!uit) return false;
  d.ind = { ...d.ind, indeling: uit };
  d.huis = await haal('api/huis').catch(() => d.huis);
  if (tekst) zeg(tekst);
  teken();
  return true;
}

function idVan(naam, bezet) {
  const basis = naam.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'kamer';
  let id = basis;
  for (let i = 2; bezet.has(id); i++) id = `${basis}-${i}`;
  return id;
}

/* ------------------------------------------------------------ het huis */

/**
 * Het huis zoals het nu is, voor links (besluit 190): het eiland van Thuis, dat
 * per hoofdstuk iets krijgt. Eerst de vorm, bij de kamers de namen, dan de
 * apparaten, buiten, de temperatuur, de panelen; bij Klaar is het avond.
 */
function model(stap) {
  const i = ALLE.indexOf(stap);
  // Bij het grote welkom (besluit 200) staat alles er al wat Home Assistant weet: de namen, de apparaten, buiten en de panelen.
  const groot = stap === 'welkom' && !lijst;
  const na = (id) => groot || i >= ALLE.indexOf(id);
  // De tekening uit huismodel, net als op Thuis (5S), met de kelder in de grond.
  const a = antwoorden();
  const tek = huismodel.tekening(d.huis, {
    zon: d.zon,
    kamer: (r) => {
      const k = huismodel.kamerModel(r, null);
      if (!na('huis')) k.stil = true;
      if (!na('apparaten')) k.apparaten = [];
      if (!na('comfort') || groot) k.temp = null;
      // Bij Wat elk apparaat kan: de kamer van het apparaat dat open staat.
      if (stap === 'apparaat' && kanToestellen().find(({ a }) => sleutel(a) === kanOpen)?.r.id === r.id) k.gekozen = true;
      if (stap === 'comfort' && r.zoneId) k.stand = 'goed';
      return k;
    },
  });
  const metZon = na('zon');
  const buiten = na('buiten');
  // Wat de bewoner net koos, ook voordat de dienst het terugzegt.
  const woning = concept()?.woning ?? tek.woning ?? 'vrijstaand';
  // Zoals op Thuis (besluit 166): het aantal dat je opgaf, per kant bij beide kanten; en op de garage, carport of het tuinhuis.
  const opDak = metZon ? huismodel.panelenOpDak(a.panelen, tek.piekW) : { panelen: 0, panelenLinks: 0 };
  const elders = metZon ? a.elders : {};
  return {
    beschrijving: t('inr.beschrijving'),
    tijd: stap === 'ha' || stap === 'klaar' ? 'nacht' : groot ? 'ochtend' : app.tijdVanDeDag(d.zon),
    wolken: 0.3,
    zon: { stand: d.zon?.dag?.fractie ?? 0.4, hoogte: d.zon?.dag?.hoogteDeel ?? 0.6, aandeel: metZon ? 0.6 : 0.2, opRechts: huismodel.zonOpRechts(d.aans?.ligging, a.panelen) ?? undefined, ...opDak },
    // Het huis zelf, zoals elke pagina het tekent (besluit 191); buiten pas vanaf de stap Buiten.
    ...huismodel.huisDelen(tek, elders),
    ...(buiten ? {} : { oprit: null, tuin: null, terras: null, balkon: null, voortuin: null, garage: null }),
    woning,
    ...(woning === 'appartement' ? { gebouw: { onder: 2, boven: 1 } } : {}),
    buitenunit: na('apparaten') && tek.buitenunit ? { ...tek.buitenunit, aan: false } : null,
    net: true,
    stromen: [],
    // Hoe ze liggen (besluit 157): op de panelen, zoals de schets.
    labels: stap === 'ligging' && d.aans?.ligging?.nu ? [{ bij: 'panelen', titel: d.aans.ligging.nu.richting, toon: 'zon', regels: [`${Math.round(d.aans.ligging.nu.hellingDeg / 5) * 5}° · ${(d.aans.ligging.nu.peakW / 1000).toLocaleString(taal.locale, { maximumFractionDigits: 1 })} kWp`], dx: -40, dy: -60 }] : [],
  };
}

/* ------------------------------------------------------------ de vragen */

const knop = (attrs, tekst, aan = false, klasse = '') => `<button type="button" class="chip${aan ? ' aan' : ''}${klasse ? ` ${klasse}` : ''}" ${attrs} aria-pressed="${aan}">${esc(tekst)}</button>`;
const rij = (kop, inhoud, extra = '') => `<div class="rij"><b>${esc(kop)}</b><div class="chips">${inhoud}</div>${extra}</div>`;
/** "a, b en c". */
const lijstje = (xs) => huismodel.opsomming(xs);
const schakel = (attr, tekst, aan, uit = false) => `<button type="button" class="schakelrij" role="switch" aria-checked="${aan}" ${attr} ${uit ? 'disabled' : ''}><span>${esc(tekst)}</span><i aria-hidden="true"></i></button>`;

/*
 * De bouwstenen van Inrichten 3.0 (besluit 190, schets Wand-Inrichten-3): een
 * regel met een icoon, een naam met een zin eronder en rechts een waarde of
 * schakelaar; eronder mag nog iets, zoals een keuze.
 */
const S = (pad) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;
const IK = {
  huis: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', oprit: '<path d="M5 21l3-18M19 21L16 3M12 6v2M12 11v2M12 16v2"/>',
  auto: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/>', laadpaal: '<rect x="6" y="3" width="9" height="18" rx="2"/><path d="M15 8h2a2 2 0 0 1 2 2v5"/><path d="M11 8l-2 4h3l-2 4"/>',
  carport: '<path d="M3 8h18M5 8v12M19 8v12"/>', garage: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M6 20v-8h12v8"/>', tuin: '<path d="M12 21v-8M8 13c0-4 4-8 4-8s4 4 4 8a4 4 0 0 1-8 0z"/>',
  tuinhuis: '<path d="M4 9h16M5 9v11h14V9M3 9l2-3h14l2 3"/><path d="M10 20v-5h4v5"/>', schuur: '<path d="M4 11l8-6 8 6v9H4z"/><path d="M10 20v-5h4v5"/>',
  terras: '<path d="M3 17h18M6 17v4M18 17v4M5 13h14l-1-5H6z"/>', jacuzzi: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M8 8c0-1.5 1-2 1-3M12 8c0-1.5 1-2 1-3M16 8c0-1.5 1-2 1-3"/>',
  balkon: '<path d="M4 12h16v8H4zM8 12v8M12 12v8M16 12v8M6 4h12v8"/>', thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  droger: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="4"/>', vaat: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 8h14M9 13h6"/>',
  boiler: '<rect x="7" y="2.5" width="10" height="19" rx="5"/><path d="M10 15h4"/>', accu: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M10 2h4M12 9l-2 4h4l-2 4"/>',
  lamp: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>', screen: '<rect x="4" y="4" width="16" height="4" rx="1"/><path d="M6 8v9h12V8"/>', camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>',
  praat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z"/>', zon: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>', stekker: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  meter: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>', koffer: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M4 12h16"/>', tel: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
};
/** Een regel; `tag: 'button'` maakt hem aan te tikken. Zin en rechts zijn al tekst of HTML. */
function regel({ ik: icoon, titel, zin = '', rechts = '', toon = '', klasse = '', attrs = '', onder = '', tag = 'div' }) {
  return `<${tag} ${tag === 'button' ? 'type="button" ' : ''}class="regel ${klasse}" ${attrs}><span class="ik">${S(IK[icoon] ?? IK.huis)}</span><span class="tekst"><b>${esc(titel)}</b>${zin ? `<span>${esc(zin)}</span>` : ''}</span><span class="rechts ${toon}">${rechts}</span>${onder ? `<span class="onder">${onder}</span>` : ''}</${tag}>`;
}
/** De schakelaar rechts in een regel. */
const schakelaar = (attr, naam, aan, uit = false) => `<button type="button" class="schakel" role="switch" aria-checked="${aan}" aria-label="${esc(naam)}" ${attr} ${uit ? 'disabled' : ''}></button>`;
const tip = (tekst) => `<div class="tip">${esc(tekst)}</div>`;

/* Het startscherm (besluit 158): de getallen tikken open tot een lijst. */
let lijst = null; // 'etages', 'kamers', 'apparaten', 'klimaat' of null
function tellingen() {
  const etages = (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten' && (e.ruimtes ?? []).some((r) => !huismodel.isBuiten(e, r))).length;
  // Apparaten en wat verwarmt of koelt apart (besluit 166): niets telt twee keer.
  const apparaten = [...(d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []), ...(d.huis?.zonderRuimte ?? [])].filter((a) => a.soort !== 'klimaat').length;
  const p = antwoorden().panelen;
  const panelen = p.ligging === 'beide' ? (p.voorkant ?? 0) + (p.achterkant ?? 0) : (p.aantal ?? 0);
  return { etages, kamers: binnen().length, buiten: buitenRuimtes().length, apparaten, klimaat: binnen().flatMap(klimaatIn).length, panelen, cameras: (d.functies?.gevonden?.cameras ?? []).length };
}
/* Het startscherm (besluit 190): zes getallen, de eerste vier tikken open tot een lijst. */
function welkom() {
  if (lijst) return welkomLijst();
  const n = tellingen();
  const vak = (soort, getal, tekst) => (soort
    ? `<button type="button" class="teller" data-lijst="${soort}"><b>${getal}</b><span>${esc(tekst)}</span></button>`
    : `<div class="teller"><b>${getal}</b><span>${esc(tekst)}</span></div>`);
  const tellers = [
    vak('etages', n.etages, t(n.buiten ? 'inr.tel.etagesBuiten' : 'inr.tel.etages', { n: n.etages })),
    vak('kamers', n.kamers, n.buiten ? t('inr.tel.kamersBuiten', { n: n.kamers, buiten: n.buiten }) : t('inr.tel.kamers', { n: n.kamers })),
    vak('apparaten', n.apparaten, t('inr.tel.apparaten', { n: n.apparaten })),
    vak('klimaat', n.klimaat, t('inr.tel.klimaat')),
    ...(n.panelen ? [vak(null, n.panelen, t('inr.tel.panelen', { n: n.panelen }))] : []),
    ...(n.cameras ? [vak(null, n.cameras, t('inr.tel.cameras', { n: n.cameras }))] : []),
  ];
  return {
    waar: t('inr.welkom'),
    kop: t('inr.welkomKop'),
    groot: true,
    uitleg: t('inr.welkomZin'),
    inhoud: d.huis
      ? `<div class="tellen">${tellers.join('')}</div>${tip(t('inr.welkomNoot'))}`
      : `<p class="zacht">${esc(t('inr.huisLezen'))}</p>`,
    voet: ['', `<a class="knop knop-licht" href="#woning">${esc(t('inr.begin'))}</a>`],
  };
}
/*
 * Groot welkom (besluit 200, schets Wand-Inrichten-Welkom): het eerste wat een
 * nieuwe bewoner ziet, over het hele scherm en nog zonder de stappen; die
 * komen na Begin. Het huis bouwt zich op uit wat Home Assistant al weet, etage
 * na etage, dan buiten en de panelen. Wat er gevonden is, hangt op de wand als
 * labels aan het huis zelf en staat op de telefoon als een rij getallen; een
 * tik geeft de lijst, zoals eerst bij de getallen.
 */
let opbouw = null; // hoeveel etages er al staan tijdens het opbouwen
let opgebouwd = false;
const stilGewenst = () => document.documentElement.classList.contains('sc-stil') || (matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
const PIJL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const WK_IK = {
  etages: '<path d="M3 10l9-6 9 6M5 9v10h14V9"/>', kamers: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  apparaten: '<rect x="3" y="6" width="18" height="10" rx="2"/><path d="M8 20h8M12 16v4"/>', klimaat: IK.thermo, panelen: IK.zon, cameras: IK.camera,
};
function welkomSkelet(tel) {
  const belofte = (ik, kleur, b, zin) => `<li><span class="wk-ik" style="color: ${kleur}">${S(IK[ik])}</span><div><b>${esc(t(b))}</b><span>${esc(t(zin))}</span></div></li>`;
  const beloftes = `<ul class="wk-beloof">${belofte('thermo', 'var(--gloed)', 'inr.wk.b1', 'inr.wk.b1z')}${belofte('zon', 'var(--zon)', 'inr.wk.b2', 'inr.wk.b2z')}${belofte('praat', 'var(--violet)', 'inr.wk.b3', 'inr.wk.b3z')}</ul>`;
  const woorden = `<span class="wk-hallo" data-wk-hallo></span><h1 class="wk-kop">${esc(t('inr.wk.kop1'))} <em>${esc(t('inr.wk.kop2'))}</em></h1><p class="wk-zin">${esc(t('inr.wk.zin'))} <b>${esc(t('inr.wk.klopt'))}</b></p>${beloftes}`;
  const begin = `<a class="knop knop-licht wk-begin" href="#woning">${esc(t('inr.begin'))}${PIJL}</a>`;
  const terug = `<a class="wk-terug" href="toegang.html">${esc(t('inr.wk.backup'))}</a>`;
  if (tel) {
    return `<span class="wk-merk"><i aria-hidden="true"></i>Smart Climate</span><div class="wk-podium" data-wk-podium aria-hidden="true"></div><div class="wk-getallen" data-wk-getallen></div>
      <div class="wk-tekst">${woorden}</div>
      <div class="wk-doen">${begin}<div class="wk-onder"><span>${esc(t('inr.telStappen', { n: STAPPEN.length }))}</span>${terug}</div></div>`;
  }
  return `<div class="wk-podium" data-wk-podium aria-hidden="true"></div><svg class="wk-lijn" data-wk-lijn aria-hidden="true"></svg><div class="wk-labels" data-wk-labels></div>
    <div class="wk-links"><span class="wk-merk"><i aria-hidden="true"></i>Smart Climate</span><div class="wk-midden">${woorden}<div class="wk-doen">${begin}${terug}</div></div><span class="wk-voet">${esc(t('inr.wk.voet', { n: STAPPEN.length }))}</span></div>
    <div class="glas wk-zoekt" data-wk-zoekt aria-live="polite"><i aria-hidden="true"></i><span></span></div>`;
}
/** Wat er gevonden is, met hoeveel er tijdens het opbouwen al staat. */
function welkomGetallen(n, m, zoveel, klaar) {
  const staan = m.etages.slice(0, zoveel);
  const etages = klaar ? n.etages : Math.min(n.etages, staan.length);
  const kamers = klaar ? n.kamers : staan.reduce((s, e) => s + e.kamers.length, 0);
  return [
    { soort: 'etages', getal: etages, tekst: t(klaar && n.buiten ? 'inr.tel.etagesBuiten' : 'inr.tel.etages', { n: etages }) },
    { soort: 'kamers', getal: kamers, tekst: klaar && n.buiten ? t('inr.tel.kamersBuiten', { n: kamers, buiten: n.buiten }) : t('inr.tel.kamers', { n: kamers }) },
    klaar && { soort: 'apparaten', getal: n.apparaten, tekst: t('inr.tel.apparaten', { n: n.apparaten }) },
    klaar && n.klimaat > 0 && { soort: 'klimaat', getal: n.klimaat, tekst: t('inr.tel.klimaat') },
    klaar && n.panelen > 0 && { soort: 'panelen', getal: n.panelen, tekst: t('inr.tel.panelen', { n: n.panelen }), vast: true },
    klaar && n.cameras > 0 && { soort: 'cameras', getal: n.cameras, tekst: t('inr.tel.cameras', { n: n.cameras }), vast: true },
  ].filter((x) => x && (x.getal > 0 || x.soort === 'etages'));
}
function tekenWelkom(m) {
  const tel = app.telStand();
  const box = document.querySelector(`${tel ? '#tel' : '#wand'} [data-welkom]`);
  if (!box) return;
  if (!box.dataset.klaar) {
    box.innerHTML = welkomSkelet(tel);
    box.dataset.klaar = '1';
  }
  const ik = (d.bewoners?.bewoners ?? []).find((x) => x.ik)?.naam;
  box.querySelector('[data-wk-hallo]').textContent = ik ? t('inr.wk.hallo', { naam: ik }) : t('inr.wk.halloLeeg');
  const alle = m.etages ?? [];
  // Eén keer per bezoek bouwt het huis zich op, etage na etage; met minder beweging staat het er meteen.
  if (d.huis && alle.length && !opgebouwd && opbouw == null) {
    opgebouwd = true;
    if (!stilGewenst()) {
      opbouw = 1;
      const klok = setInterval(() => {
        opbouw += 1;
        if (opbouw > alle.length) {
          opbouw = null;
          clearInterval(klok);
        }
        teken();
      }, 1100);
    }
  }
  const zoveel = opbouw ?? alle.length + 1;
  const klaar = !!d.huis && zoveel > alle.length;
  const mm = klaar ? m : { ...m, etages: alle.slice(0, zoveel), zon: { ...m.zon, panelen: 0, panelenLinks: 0 }, oprit: null, tuin: null, terras: null, balkon: null, voortuin: null, garage: null, buitenunit: null };
  const podium = box.querySelector('[data-wk-podium]');
  const getallen = welkomGetallen(tellingen(), m, zoveel, klaar);
  const vak = (x) => `<span class="wk-ik">${S(WK_IK[x.soort])}</span><b>${x.getal}</b><span>${esc(x.tekst)}</span>`;
  if (tel) {
    huis.teken(podium, { ...mm, etages: mm.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: podium.clientWidth || 410, hoogte: podium.clientHeight || 300, marge: 0.04 });
    box.querySelector('[data-wk-getallen]').innerHTML = d.huis
      ? getallen.map((x) => (x.vast ? `<span class="glas wk-getal">${vak(x)}</span>` : `<button type="button" class="glas wk-getal" data-lijst="${x.soort}">${vak(x)}</button>`)).join('')
      : `<span class="wk-lezen">${esc(t('inr.huisLezen'))}</span>`;
    return;
  }
  huis.teken(podium, mm, { breedte: podium.clientWidth || 900, hoogte: podium.clientHeight || 760, marge: 0.1, meubels: true, tik: true });
  const zoekt = box.querySelector('[data-wk-zoekt]');
  zoekt.classList.toggle('klaar', klaar);
  zoekt.querySelector('span').textContent = t(klaar ? 'inr.wk.gevonden' : 'inr.huisLezen');
  // De labels aan het huis: elk met een puntje op zijn plek in de tekening.
  const br = box.getBoundingClientRect();
  const sch = br.width / (box.offsetWidth || br.width) || 1;
  const plek = (k) => {
    const el = k && podium.querySelector(`.sc-tik[data-kamer="${CSS.escape(String(k.id ?? k.naam))}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const v = { l: (r.left - br.left) / sch, t: (r.top - br.top) / sch, r: (r.right - br.left) / sch, b: (r.bottom - br.top) / sch };
    return { ...v, x: (v.l + v.r) / 2, y: (v.t + v.b) / 2 };
  };
  const staan = mm.etages;
  const onder = plek(staan[0]?.kamers[0]);
  const midden = plek((staan[1] ?? staan[0])?.kamers.at(-1));
  const boven = plek(staan.at(-1)?.kamers.at(-1));
  const klimaatKamer = binnen().find((r) => klimaatIn(r).length);
  const warm = plek(staan.flatMap((e) => e.kamers).find((k) => k.id === klimaatKamer?.id)) ?? onder;
  // Het hele huis, voor waar de labels komen: rechts ervan onder elkaar, en twee eronder.
  const alleVakken = staan.flatMap((e) => e.kamers).map(plek).filter(Boolean);
  const hb = alleVakken.length ? { l: Math.min(...alleVakken.map((v) => v.l)), t: Math.min(...alleVakken.map((v) => v.t)), r: Math.max(...alleVakken.map((v) => v.r)), b: Math.max(...alleVakken.map((v) => v.b)) } : null;
  podium.querySelectorAll('.sc-tik').forEach((x) => x.remove());
  const waar = {
    panelen: boven && { punt: [boven.r - 30, boven.t + 30], kant: 'rechts' },
    apparaten: boven && { punt: [boven.x, boven.y], kant: 'rechts' },
    kamers: midden && { punt: [midden.x, midden.y], kant: 'rechts' },
    klimaat: warm && { punt: [warm.x, warm.y + 10], kant: 'rechts' },
    etages: onder && { punt: [onder.l + 14, onder.y], kant: 'onder' },
    cameras: onder && { punt: [onder.l + 8, onder.b - 10], kant: 'onder' },
  };
  const labels = getallen.filter((x) => waar[x.soort]);
  const laag = box.querySelector('[data-wk-labels]');
  laag.innerHTML = labels.map((x, i) => {
    const w = waar[x.soort];
    const attr = `class="glas wk-label" style="animation-delay: ${(i * 0.12).toFixed(2)}s"`;
    return x.vast ? `<span ${attr}>${vak(x)}</span>` : `<button type="button" ${attr} data-lijst="${x.soort}">${vak(x)}</button>`;
  }).join('');
  // Binnen het scherm, en niet over de woorden links.
  const W = box.offsetWidth, H = box.offsetHeight;
  const links = (box.querySelector('.wk-links')?.offsetLeft ?? 0) + (box.querySelector('.wk-links')?.offsetWidth ?? 0) + 16;
  const els = [...laag.children];
  // Rechts van boven naar onder zoals het huis: de panelen bij het dak, wat verwarmt onderaan.
  const VOLG = ['panelen', 'apparaten', 'kamers', 'klimaat'];
  const rechts = els.filter((el, i) => waar[labels[i].soort].kant === 'rechts').sort((a, b) => VOLG.indexOf(labels[els.indexOf(a)].soort) - VOLG.indexOf(labels[els.indexOf(b)].soort));
  let onderX = Math.max(links, hb?.l ?? links);
  els.forEach((el, i) => {
    const w = waar[labels[i].soort];
    const half = el.offsetWidth / 2, hoog = el.offsetHeight / 2;
    if (!hb) return;
    if (w.kant === 'rechts') {
      const j = rechts.indexOf(el);
      const van = hb.t - 30, tot = hb.b + 10;
      w.x = Math.min(W - half - 16, hb.r + 30 + half);
      w.y = rechts.length > 1 ? van + (j * (tot - van)) / (rechts.length - 1) : (van + tot) / 2;
    } else {
      w.x = onderX + half;
      w.y = Math.min(H - 110, hb.b + 130);
      onderX += el.offsetWidth + 16;
    }
    w.x = Math.max(links + half, Math.min(W - half - 16, w.x));
    w.y = Math.max(hoog + 16, Math.min(H - hoog - 80, w.y));
    el.style.left = `${Math.round(w.x)}px`;
    el.style.top = `${Math.round(w.y)}px`;
  });
  const lijn = box.querySelector('[data-wk-lijn]');
  lijn.setAttribute('viewBox', `0 0 ${W} ${H}`);
  lijn.innerHTML = labels.map((x) => {
    const w = waar[x.soort];
    return `<line x1="${Math.round(w.x)}" y1="${Math.round(w.y)}" x2="${Math.round(w.punt[0])}" y2="${Math.round(w.punt[1])}" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-dasharray="3 4"/><circle cx="${Math.round(w.punt[0])}" cy="${Math.round(w.punt[1])}" r="4.5" fill="#EEF3F7"/><circle cx="${Math.round(w.punt[0])}" cy="${Math.round(w.punt[1])}" r="10" fill="none" stroke="rgba(255,255,255,0.25)"/>`;
  }).join('');
}

/**
 * Een apparaat dat je weghaalt, staat daarna bij Indeling onder Verborgen. Wat
 * verwarmt of koelt, staat in een eigen lijst (besluit 166): dat hoort bij de
 * regeling, en heeft geen ×.
 */
const wegChip = (a) => `<button type="button" class="chip weg" data-verberg="${esc(a.id)}" aria-label="${esc(t('energie.weghalen', { naam: a.naam }))}">${esc(a.naam)}<span aria-hidden="true">×</span></button>`;
const geenKlimaat = (lijst) => (lijst ?? []).filter((a) => a.soort !== 'klimaat');
function welkomLijst() {
  const n = tellingen();
  const perEtage = (d.huis?.etages ?? []).filter((e) => (e.ruimtes ?? []).length);
  let kop = '';
  let uitleg = '';
  let rijen = [];
  if (lijst === 'etages' || lijst === 'kamers') {
    kop = lijst === 'etages' ? t('instellingen.etages', { n: n.etages }) : t('instellingen.kamers', { n: n.kamers });
    uitleg = t('inr.lijst.kamers');
    rijen = perEtage.map((e) => rij(e.naam, (e.ruimtes ?? []).map((r) => `<span class="chip stil">${esc(r.naam)}</span>`).join('')));
  } else if (lijst === 'apparaten') {
    kop = t('instellingen.apparaten', { n: n.apparaten });
    uitleg = t('inr.lijst.apparaten');
    rijen = perEtage.flatMap((e) => (e.ruimtes ?? []).filter((r) => geenKlimaat(r.apparaten).length).map((r) => rij(r.naam, geenKlimaat(r.apparaten).map(wegChip).join(''))));
    if (geenKlimaat(d.huis?.zonderRuimte).length) rijen.push(rij(t('inr.zonderKamer'), geenKlimaat(d.huis.zonderRuimte).map(wegChip).join('')));
  } else {
    kop = t('inr.lijst.klimaatKop', { n: n.klimaat });
    uitleg = t('inr.lijst.klimaat');
    rijen = binnen().filter((r) => klimaatIn(r).length).map((r) => rij(r.naam, klimaatIn(r).map((a) => `<span class="chip stil">${esc(a.naam)}</span>`).join('')));
  }
  return {
    waar: t('inr.gevonden'),
    kop,
    uitleg,
    inhoud: `<div class="rijen">${rijen.join('') || `<p class="zacht">${esc(t('inr.nietsGevonden'))}</p>`}</div>`,
    voet: [`<button type="button" class="zachtknop" data-lijst="">${esc(t('panelen.terug'))}</button>`, `<a class="knop knop-licht" href="#woning">${esc(t('inr.begin'))}</a>`],
  };
}

/*
 * Klopt je huis? (besluit 158): per etage de kamers. Een kamer aantikken geeft
 * zijn naam, etage en soort, de zones voor een open ruimte, samenvoegen met
 * een andere kamer, en weghalen. Buiten heeft een eigen stap.
 */
let open = null; // de kamer of etage waaraan iets verandert
let weghalen = null; // de kamer die nog één tik nodig heeft om weg te gaan
function bewerkKamer(k, etages, naamVan, c) {
  const r = binnen().find((x) => x.id === k.id);
  const voorstel = r && !r.soortGekozen ? r.soort : null;
  const soortNaam = (w) => huismodel.KAMER_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const soorten = [['', voorstel && soortNaam(voorstel) ? t('indeling.uitNaam', { naam: soortNaam(voorstel) }) : t('inr.uitNaam')], ...huismodel.KAMER_SOORTEN];
  const zoneSoorten = [['', t('inr.soort')], ...huismodel.ZONE_SOORTEN];
  const zones = (k.zones ?? []).map((z) => `<div class="zonerij"><input class="veld" data-zonenaam="${esc(z.id)}" value="${esc(z.naam)}" maxlength="40" aria-label="${esc(t('indeling.zone.naam', { naam: z.naam }))}"><select class="veld" data-zonesoort="${esc(z.id)}" aria-label="${esc(t('indeling.zone.soort', { naam: z.naam }))}">${zoneSoorten.map(([v, x]) => `<option value="${v}" ${v === (z.soort ?? '') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><button type="button" class="chip" data-zoneweg="${esc(z.id)}" aria-label="${esc(t('indeling.zone.weg', { naam: z.naam }))}">×</button></div>`).join('');
  const buren = (c?.kamers ?? []).filter((x) => x.id !== k.id && x.etage === k.etage);
  // Links of rechts op de etage (besluit 166); slepen in het huis kan ook.
  const opEtage = (c?.kamers ?? []).filter((x) => x.etage === k.etage);
  const plek = opEtage.findIndex((x) => x.id === k.id);
  const schuif = opEtage.length > 1 ? `<div class="veldlabel breed"><span>${esc(t('inr.plek'))}</span><div class="chips"><button type="button" class="chip" data-schuifkamer="-1" ${plek <= 0 ? 'disabled' : ''}>${esc(t('inr.links'))}</button><button type="button" class="chip" data-schuifkamer="1" ${plek >= opEtage.length - 1 ? 'disabled' : ''}>${esc(t('inr.rechts'))}</button></div></div>` : '';
  return `<div class="bewerk">
    <label class="veldlabel"><span>${esc(t('indeling.naam'))}</span><input class="veld" data-naam="${esc(k.id)}" value="${esc(k.naam)}" maxlength="40"></label>
    <label class="veldlabel"><span>${esc(t('indeling.etageLabel'))}</span><select class="veld" data-etage="${esc(k.id)}">${etages.map((x) => `<option value="${esc(x.id)}" ${x.id === k.etage ? 'selected' : ''}>${esc(naamVan(x))}</option>`).join('')}</select></label>
    ${k.etage === 'buiten' ? '' : schuif}
    ${k.etage === 'buiten' ? '' : `<label class="veldlabel breed"><span>${esc(t('indeling.soortKamer'))}</span><select class="veld" data-soort="${esc(k.id)}">${soorten.map(([v, x]) => `<option value="${v}" ${v === (k.soort ?? '') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`}
    ${k.etage === 'buiten' ? '' : `<div class="veldlabel breed"><span>${esc(t('inr.zones'))}</span>${zones}<input class="veld" data-nieuwezone placeholder="${esc(t('inr.zoneErbij'))}" aria-label="${esc(t('indeling.nieuweZone'))}" maxlength="40"></div>`}
    ${buren.length ? `<label class="veldlabel"><span>${esc(t('inr.eenRuimte'))}</span><select class="veld" data-samen="${esc(k.id)}"><option value="">${esc(t('inr.samenvoegen'))}</option>${buren.map((x) => `<option value="${esc(x.id)}">${esc(x.naam)}</option>`).join('')}</select></label>` : ''}
    <div class="veldlabel"><span>&nbsp;</span><button type="button" class="chip gevaar" data-kamerweg="${esc(k.id)}">${esc(t(weghalen === k.id ? 'inr.nogEens' : 'indeling.kamerWeg'))}</button></div>
  </div>`;
}
/*
 * Wat voor huis het is (besluit 190): vijf soorten, elk met een klein huisje
 * erin, dan of er een kelder is en wat voor dak. De tekening links doet mee.
 */
const WONINGEN = ['vrijstaand', 'rij', 'hoek', 'tweekap', 'appartement'];
const woningNu = () => concept()?.woning ?? d.huis?.woning ?? 'vrijstaand';
function dakNu() {
  const c = concept();
  if (c?.dak === 'geen') return 'plat';
  if (c?.dak) return 'schuin';
  return d.huis?.dakEtage ? 'schuin' : 'plat';
}
function woningStap() {
  const c = concept();
  const nu = woningNu();
  const tegels = WONINGEN.map((w) => `<button type="button" class="tegel${w === nu ? ' aan' : ''}" data-woning="${w}" aria-pressed="${w === nu}"><span class="mini" data-mini="${w}" aria-hidden="true"></span><b>${esc(t(`inr.woning.${w}`))}</b></button>`).join('');
  const kelder = (c?.kamers ?? []).some((k) => k.etage === 'kelder');
  const dak = dakNu();
  // Een appartement heeft geen eigen kelder of dak om te tekenen.
  const rijen = nu === 'appartement'
    ? ''
    : `${rij(t('inr.kelderVraag'), `${knop('data-kelder="ja"', t('inr.kelderJa'), kelder)}${knop('data-kelder="nee"', t('functies.nee'), !kelder)}`)}
       ${rij(t('inr.dakVraag'), `${knop('data-dak="schuin"', t('inr.dak.schuin'), dak === 'schuin')}${knop('data-dak="plat"', t('inr.dak.plat'), dak === 'plat')}`)}`;
  return {
    waar: waarVan('woning'),
    kop: t('inr.woningKop'),
    uitleg: t('inr.woningZin'),
    inhoud: `<div class="tegels">${tegels}</div><div class="rijen">${rijen}</div>`,
  };
}
/** De kleine huisjes bij Wat voor huis, zoals de schets: alleen de vorm. */
function tekenMini(el) {
  const w = el.dataset.mini;
  // Vrijstaand is breder, zoals de schets; een rijtjeshuis of hoekhuis is één kamer breed.
  const laag = () => ({ naam: '', kamers: Array.from({ length: w === 'vrijstaand' ? 2 : 1 }, () => ({ naam: '', gewicht: 1, stil: true, apparaten: [] })) });
  const m = w === 'appartement'
    ? { woning: w, gebouw: { onder: 2, boven: 1 }, etages: [laag()] }
    : { woning: w, etages: [laag(), laag(), { dak: true, kamers: [] }], voordeur: {} };
  huis.teken(el, { tijd: app.tijdVanDeDag(d.zon), ...m }, { breedte: el.clientWidth || 120, hoogte: el.clientHeight || 84, marge: 0.12, wereld: false });
}

/*
 * Klopt de indeling? (besluit 190): per etage een regel per kamer, met wat
 * er staat. Een kamer aantikken opent hem eronder; onderaan + Kamer, met de
 * etage erbij.
 */
function huisStap() {
  const c = concept();
  const etages = (d.ind?.etages ?? []).filter((e) => e.id !== 'buiten');
  const naamVan = (e) => c?.etages?.[e.id] ?? e.standaardNaam;
  const soortNaam = (w) => huismodel.KAMER_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const delen = etages.map((e) => {
    const kamers = (c?.kamers ?? []).filter((k) => k.etage === e.id);
    if (!kamers.length) return '';
    return `<div class="etagekop">${esc(naamVan(e))}</div>${kamers.map((k) => {
      const r = binnen().find((x) => x.id === k.id);
      const n = (r?.apparaten ?? []).length;
      // De soort alleen als die iets toevoegt: "Slaapkamer · Slaapkamer" zegt niets.
      const soort = soortNaam(k.soort ?? r?.soort);
      const zin = k.zones?.length ? t('inr.metZones', { namen: lijstje(k.zones.map((z) => z.naam)) }) : soort.toLowerCase() === k.naam.toLowerCase() ? '' : soort;
      return regel({ tag: 'button', ik: 'huis', titel: k.naam, zin, rechts: n ? esc(t('inr.nApparaten', { n })) : '', klasse: open === k.id ? 'open' : '', attrs: `data-kamer="${esc(k.id)}" aria-expanded="${open === k.id}"` }) + (open === k.id ? bewerkKamer(k, d.ind?.etages ?? [], naamVan, c) : '');
    }).join('')}`;
  }).join('');
  const nieuw = open === 'nieuw'
    ? `<div class="bewerk"><input class="veld" data-nieuwnaam placeholder="${esc(t('inr.kantoor'))}" aria-label="${esc(t('inr.nieuweNaam'))}" maxlength="40"><select class="veld" data-nieuwetage aria-label="${esc(t('indeling.etageLabel'))}">${etages.map((e) => `<option value="${esc(e.id)}" ${e.id === 'bg' ? 'selected' : ''}>${esc(naamVan(e))}</option>`).join('')}</select><button type="button" class="chip aan" data-voegtoe>${esc(t('indeling.toevoegen'))}</button></div>`
    : `<div class="chips">${knop('data-nieuw', t('inr.plusKamer'), false, 'plus')}</div>`;
  return {
    waar: waarVan('huis'),
    kop: t('inr.huisKop'),
    uitleg: t('inr.huisZin'),
    // De tip alleen zolang er geen kamer open staat: dan krijgt die de ruimte.
    inhoud: `<div class="rijen lijst">${delen}${nieuw}</div>${open ? '' : tip(t('inr.huisNoot'))}`,
  };
}
/*
 * Twee kamers worden één ruimte (besluit 158): de tweede wordt een zone van de
 * eerste, met zijn apparaten. Een eigen regeling kan maar één kamer hebben.
 */
/**
 * Een kamer naar een andere plek (besluit 166): op de plek van `doelId`, op
 * diens etage; zonder doel één plek naar links (-1) of rechts (1). De volgorde
 * van de kamers is de volgorde in het huis, van links naar rechts.
 */
function verplaatsKamer(next, id, { doelId = null, stap = 0 } = {}) {
  const i = next.kamers.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const k = next.kamers[i];
  if (doelId) {
    const doel = next.kamers.find((x) => x.id === doelId);
    if (!doel || doel.id === id || doel.etage === 'buiten') return false;
    const zelfde = doel.etage === k.etage;
    const doelVoor = next.kamers.indexOf(doel);
    next.kamers.splice(i, 1);
    const j = next.kamers.indexOf(doel);
    // Op dezelfde etage van links naar rechts: erachter; anders ervoor.
    next.kamers.splice(zelfde && i <= doelVoor ? j + 1 : j, 0, k);
    if (!zelfde) {
      k.etage = doel.etage;
      delete k.meedoenMet;
    }
    return true;
  }
  const buren = next.kamers.filter((x) => x.etage === k.etage);
  const b = buren[buren.indexOf(k) + stap];
  if (!b) return false;
  const j = next.kamers.indexOf(b);
  [next.kamers[i], next.kamers[j]] = [next.kamers[j], next.kamers[i]];
  return true;
}

function samenvoegen(next, hoofdId, anderId) {
  const k = next.kamers.find((x) => x.id === hoofdId);
  const b = next.kamers.find((x) => x.id === anderId);
  if (!k || !b) return t('inr.nietMeer');
  if (k.regelzone && b.regelzone) return t('inr.tweeRegelingen', { a: k.naam, b: b.naam });
  const bezet = new Set(k.zones.map((z) => z.id));
  if (!k.zones.length) {
    const eigen = { id: idVan(k.naam, bezet), naam: k.naam, ...(k.soort ? { soort: k.soort } : {}) };
    bezet.add(eigen.id);
    k.zones.push(eigen);
    // Wat al in de kamer stond, komt in zijn eigen deel.
    const r = binnen().find((x) => x.id === k.id);
    for (const a of r?.apparaten ?? []) next.apparaten[sleutel(a)] = { ...(next.apparaten[sleutel(a)] ?? {}), kamer: k.id, zone: eigen.id };
  }
  const deel = { id: idVan(b.naam, bezet), naam: b.naam, ...(b.soort ? { soort: b.soort } : {}) };
  k.zones.push(deel);
  const rb = binnen().find((x) => x.id === b.id);
  for (const a of rb?.apparaten ?? []) next.apparaten[sleutel(a)] = { ...(next.apparaten[sleutel(a)] ?? {}), kamer: k.id, zone: deel.id };
  for (const [id, a] of Object.entries(next.apparaten)) if (a.kamer === b.id) next.apparaten[id] = { ...a, kamer: k.id, zone: deel.id };
  if (b.regelzone) k.regelzone = b.regelzone;
  if (b.rollen) k.rollen = { ...(k.rollen ?? {}), ...b.rollen };
  if (b.meten) k.meten = [...new Set([...(k.meten ?? []), ...b.meten])].slice(0, 6);
  for (const x of next.kamers) if (x.meedoenMet === b.id) x.meedoenMet = k.id;
  delete k.meedoenMet;
  next.kamers = next.kamers.filter((x) => x.id !== b.id);
  return null;
}

/*
 * Buiten (besluiten 109, 158 en 166): één lijst met wat er rond het huis is,
 * elk deel aan of uit; zo tekent het huis zijn buitenkant. Onder een deel dat
 * aan staat, welke ruimte uit Home Assistant erbij hoort: daar komen zijn
 * lampen en camera vandaan. Het losse blok met ruimtes is weg.
 */
const buitenKamers = () => (concept()?.kamers ?? []).filter((k) => k.etage === 'buiten');
/**
 * [deel, naam, soort van een ruimte die erbij hoort]; auto en carport horen bij
 * de oprit. Hetzelfde lijstje als Kamers en indeling › Buiten (besluit 193),
 * waar een ruimte nu ook bij de carport kan horen.
 */
const RONDOM = huismodel.rondom();
const { OP_OPRIT } = huismodel;
function buitenNu(k) {
  const r = buitenRuimtes().find((x) => x.id === k.id);
  return k.buiten ?? r?.buiten ?? huismodel.soortBuiten(k);
}
function buitenStap() {
  const rond = huismodel.rondNu(d.huis);
  const kamers = buitenKamers();
  // De jacuzzi (besluit 186): gevonden in Home Assistant, of alleen getekend.
  const jacuzzi = (d.aans?.gevonden?.apparaten ?? []).find((x) => x.soort === 'jacuzzi');
  const delen = RONDOM.map(([w, naam, soort, icoon]) => {
    const aan = !!rond[w] && (!OP_OPRIT.has(w) || !!rond.oprit);
    const gekoppeld = soort ? kamers.find((k) => buitenNu(k).soort === soort) : null;
    const keuze = aan && soort && kamers.length
      ? `<label class="koppel"><span>${esc(t('inr.ruimte'))}</span><select class="veld" data-bkoppel="${soort}" aria-label="${esc(t('inr.ruimteBij', { naam }))}">${gekoppeld ? '' : `<option value="">${esc(t('energie.geen'))}</option>`}${kamers.map((k) => `<option value="${esc(k.id)}" ${k.id === gekoppeld?.id ? 'selected' : ''}>${esc(k.naam)}</option>`).join('')}</select></label>`
      : '';
    // In de tuin: het tuinhuis met plat dak, of het schuurtje met puntdak (24 oktober 2026).
    const soortKeuze = w === 'tuinhuis' && aan ? `<span class="chips">${knop('data-schuur="0"', t('inr.tuinhuis'), !rond.schuur)}${knop('data-schuur="1"', t('inr.schuurtje'), !!rond.schuur)}</span>` : '';
    const zin = w === 'jacuzzi' ? (jacuzzi ? jacuzzi.naam : t('inr.nietInHA')) : '';
    return regel({ ik: w === 'tuinhuis' && rond.schuur ? 'schuur' : icoon, titel: naam, zin, rechts: schakelaar(`data-rond="${w}"`, naam, aan, OP_OPRIT.has(w) && !rond.oprit), onder: soortKeuze + keuze });
  });
  // Ruimtes die bij geen deel horen dat aan staat: die tekent het huis nergens.
  const los = kamers.filter((k) => !RONDOM.some(([w, , s]) => s && rond[w] && buitenNu(k).soort === s));
  return {
    waar: waarVan('buiten'),
    kop: t('inr.buitenKop'),
    uitleg: t(kamers.length ? 'inr.buitenRuimte' : 'inr.buitenZin'),
    inhoud: `<div class="rijen lijst">${delen.join('')}</div>${los.length ? tip(t('inr.losBuiten', { n: los.length, namen: lijstje(los.map((k) => k.naam)) })) : ''}`,
  };
}

/*
 * Wie woont hier (besluit 147): wie al ingelogd is, en een code om anderen
 * één keer te laten inloggen. Een bewoner komt er alleen zo bij; de app haalt
 * niet iedereen uit Home Assistant.
 */
const appAdres = () => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}inloggen.html`;
function qrVan(adres) {
  try {
    const q = window.qrcode(0, 'M');
    q.addData(adres);
    q.make();
    return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  } catch {
    return '';
  }
}
/*
 * Een bewoner aantikken (besluit 166): de naam, waarmee het huis ziet of
 * diegene thuis is, de plek in de volgorde en het comfort; dezelfde deur als
 * Instellingen › Bewoners (`api/bewoners`).
 */
let openBewoner = null;
function bewonerBewerk(x, i, lijst) {
  const b = d.bewoners;
  const kan = b?.ik?.magBeheren || x.ik;
  const hoofd = lijst[0];
  const thuis = x.gekoppeld
    ? `<div class="veldlabel breed"><span>${esc(t('bewoners.thuisVolgens'))}</span><span class="zacht" style="padding: 0">${esc(t('inr.gekoppeld', { naam: x.aanwezigheidNaam ?? '' }))}</span></div>`
    : `<label class="veldlabel breed"><span>${esc(t('bewoners.thuisVolgens'))}</span><select class="veld" data-bbron="${esc(x.id)}" ${kan ? '' : 'disabled'}><option value="">${esc(t('bewoners.geenSensor'))}</option>${(x.kiesbaar ?? []).map((y) => `<option value="${esc(y.id)}" ${y.id === x.aanwezigheid ? 'selected' : ''}>${esc(y.naam)} · ${esc(t(y.soort === 'persoon' ? 'inr.persoon' : 'bewoners.sensor'))}</option>`).join('')}</select></label>`;
  const volgorde = b?.ik?.magBeheren && lijst.length > 1
    ? `<div class="veldlabel breed"><span>${esc(t('inr.volgorde'))}</span><div class="chips"><button type="button" class="chip" data-bvolg="-1" ${i === 0 ? 'disabled' : ''}>${esc(t('inr.hoger'))}</button><button type="button" class="chip" data-bvolg="1" ${i === lijst.length - 1 ? 'disabled' : ''}>${esc(t('inr.lager'))}</button>${x.hoofd ? '' : `<button type="button" class="chip" data-bhoofd>${esc(t('bewoners.maakHoofd'))}</button>`}</div></div>`
    : '';
  const comfort = x.hoofd
    ? `<div class="veldlabel breed"><span>${esc(t('bewoners.comfort'))}</span><span class="zacht" style="padding: 0">${esc(t('inr.comfortHuis'))}</span></div>`
    : `<div class="veldlabel breed"><span>${esc(t('bewoners.comfort'))}</span><div class="chips">${knop('data-bcomfort="eigen"', t('inr.eigenTemp'), x.comfort === 'eigen')}${knop('data-bcomfort="volgt"', t('bewoners.volgtKnop', { naam: hoofd?.naam ?? t('jij.deHoofdgebruiker') }), x.comfort !== 'eigen')}${x.comfort === 'eigen' ? `<a class="chip plus" href="comfort.html?bewoner=${encodeURIComponent(x.id)}">${esc(t('inr.tempInstellen'))}</a>` : ''}</div></div>`;
  return `<div class="bewerk" style="grid-column: 1 / -1">
    <label class="veldlabel breed"><span>${esc(t(x.ik ? 'bewoners.noemt.ik' : 'bewoners.noemt.ander', { naam: x.naam }))}</span><input class="veld" data-bnaam="${esc(x.id)}" value="${esc(x.naam)}" maxlength="40" ${kan ? '' : 'disabled'}></label>
    ${thuis}${volgorde}${comfort}
  </div>`;
}
function bewonersStap() {
  const b = d.bewoners;
  const lijst = b?.bewoners ?? [];
  // Ieder met zijn kleur (besluit 181) en waarmee het huis ziet of hij thuis is (besluit 190, schets Wand-Inrichten-3).
  const rijen = lijst.map((x, i) => {
    const open = x.id === openBewoner;
    const wat = x.hoofd ? t('toegang.hoofdgebruiker') : x.comfort === 'eigen' ? t('toegang.eigenComfort') : t('jij.volgt', { naam: lijst[0]?.naam ?? t('jij.deHoofdgebruiker') });
    const bron = x.gekoppeld ? x.aanwezigheidNaam : (x.kiesbaar ?? []).find((y) => y.id === x.aanwezigheid)?.naam;
    const zin = bron ? `${wat} · ${t('inr.thuisMet', { naam: bron })}` : wat;
    return `<button type="button" class="bewoner${open ? ' open' : ''}" data-bewoner="${esc(x.id)}" aria-expanded="${open}"><span class="gezicht" data-kleur="${esc(app.kleurVan(x.id))}" aria-hidden="true">${esc((x.naam || '?').slice(0, 1).toUpperCase())}</span><span class="tekst"><b>${esc(x.naam)}${x.ik ? esc(t('toegang.jij')) : ''}</b><span>${esc(zin)}</span></span><span class="rechts" aria-hidden="true">›</span></button>${open ? bewonerBewerk(x, i, lijst) : ''}`;
  }).join('');
  return {
    waar: waarVan('bewoners'),
    kop: t('inr.bewonersKop'),
    uitleg: t('inr.bewonersZin'),
    inhoud: `<div class="rijen lijst">${rijen || `<p class="zacht" style="padding: 0">${esc(t('toegang.nogNiemand'))}</p>`}</div>
      ${openBewoner ? '' : `<div class="erbij"><div class="qr" role="img" aria-label="${esc(t('bewoners.qr'))}">${qrVan(appAdres())}</div><span class="zacht" style="padding: 0">${esc(t('inr.scannen'))}</span></div>`}`,
  };
}
async function stuurBewoner(body, tekst) {
  if (!(await stuur('api/bewoners', body))) return;
  d.bewoners = await haal('api/bewoners').catch(() => d.bewoners);
  if (tekst) zeg(tekst);
  teken();
}

/*
 * Apparaten per kamer (besluit 166): alles in de stap zelf, zonder uitstap.
 * Bovenaan wat nog los staat, met een kamer erbij; daaronder per kamer wat er
 * staat. Een apparaat aantikken geeft verplaatsen en weghalen. Wat verwarmt of
 * koelt, staat bij Klimaat.
 */
let openApparaat = null;
function apparatenStap() {
  const los = d.huis?.zonderRuimte ?? [];
  const kamers = (d.huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).map((r) => ({ r, e })));
  const nietTonen = `<option value="-">${esc(t('functies.nietTonen'))}</option>`;
  const opties = (voorstel, leeg = t('indeling.kiesKamer')) => `<option value="">${esc(leeg)}</option>${kamers.map(({ r }) => `<option value="${esc(r.id)}" ${r.id === voorstel ? 'selected' : ''}>${esc(r.naam)}</option>`).join('')}${nietTonen}`;
  const losRijen = los.map((a) => `<div class="rij breed"><b>${esc(a.naam)}</b><select class="veld" data-plek="${esc(a.id)}" aria-label="${esc(t('inr.kamerVoor', { naam: a.naam }))}">${opties(a.voorstelKamer)}</select></div>`).join('');
  const perKamer = kamers.filter(({ r }) => geenKlimaat(r.apparaten).length).map(({ r }) => {
    const apps = geenKlimaat(r.apparaten);
    const open = apps.find((a) => a.id === openApparaat);
    const chips = apps.map((a) => knop(`data-apparaat="${esc(a.id)}"`, a.naam, a.id === openApparaat)).join('');
    const bewerk = open
      ? `<div class="bewerk"><label class="veldlabel breed"><span>${esc(t('inr.andereKamer'))}</span><select class="veld" data-verplaats="${esc(sleutel(open))}" aria-label="${esc(t('inr.kamerVoor', { naam: open.naam }))}">${opties(null, t('inr.blijftIn', { naam: r.naam })).replace(nietTonen, '')}</select></label><div class="veldlabel breed"><button type="button" class="chip gevaar" data-verberg="${esc(open.id)}">${esc(t('inr.uitApp'))}</button></div></div>`
      : '';
    return rij(r.naam, chips, bewerk);
  }).join('');
  const ingedeeld = kamers.reduce((som, { r }) => som + geenKlimaat(r.apparaten).length, 0);
  return {
    waar: waarVan('apparaten'),
    kop: los.length === 0 ? t('inr.app.klopt') : t('inr.app.waar', { n: los.length }),
    uitleg: t('inr.app.zin', { n: ingedeeld }),
    inhoud: `<div class="rijen">${losRijen ? `${losRijen}${los.some((a) => a.voorstelKamer) ? `<p class="zacht" style="padding: 4px 0 8px">${esc(t('inr.app.uitNaam'))}</p>` : ''}` : ''}${perKamer}</div>`,
  };
}

/* Meten met (besluit 123): per kamer met een regeling, welke thermometers tellen. */
function metenStap() {
  const c = concept();
  const bronnen = (d.huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((x) => x.meting?.temperatuurC != null).map((x) => ({ id: x.id, naam: x.naam, kamerId: r.id, c: x.meting.temperatuurC }))));
  const kamers = binnen().filter((r) => r.zoneId || r.meedoenMet || bronnen.some((b) => b.kamerId === r.id));
  const rijen = kamers.map((r) => {
    const k = c?.kamers.find((x) => x.id === r.id);
    const gekozen = new Set(k?.meten ?? []);
    const hier = bronnen.filter((b) => b.kamerId === r.id);
    const chips = hier.map((b) => knop(`data-meet="${esc(b.id)}" data-meetkamer="${esc(r.id)}"`, `${b.naam} · ${nl(b.c)}°`, gekozen.has(b.id))).join('');
    // Zonder eigen thermometer in de kamer: alleen waarmee hij nu meet.
    const nu = r.meetMet?.length ? `<span class="zacht">${esc(t(chips ? 'inr.meet.nu' : 'inr.meet.met', { namen: lijstje(r.meetMet) }))}</span>` : '';
    return rij(r.naam, chips + (nu || (chips ? '' : `<span class="zacht">${esc(t('inr.meet.geen'))}</span>`)));
  });
  return {
    waar: waarVan('meten'),
    kop: t('inr.meet.kop'),
    uitleg: t('inr.meet.zin'),
    inhoud: `<div class="rijen">${rijen.join('') || `<p class="zacht">${esc(t('inr.meet.nogGeen'))}</p>`}</div>`,
  };
}

/* De regeling per kamer (besluit 138): dezelfde drie keuzes als bij Indeling. */
const ROLLEN = ['houdt', 'zon', 'kijken'].map((r) => [r, t(`inr.rol.${r}`), t(`inr.rol.${r}Kort`)]);
const rolVan = (k, r, key) => (k?.rollen ? (k.rollen[key] ?? 'kijken') : (klimaatIn(r).find((a) => sleutel(a) === key)?.klimaat?.rol ?? 'kijken'));
/* Waar de warmte vandaan komt (besluit 122); hoort bij Klimaat (besluit 158). */
const VERWARMING = [...['cv', 'warmtepomp', 'hybride', 'stadsverwarming'].map((x) => [x, t(`energie.bron.${x}`)]), ['weetniet', t('energie.weetNiet')]];
let toevoegenIn = null;
/*
 * Iets toevoegen (besluit 167): hetzelfde als bij Kamers en indeling. Eerst wat
 * er hangt, dan hoe het aangaat. Een radiator op de cv gaat aan met de
 * thermostaat van de ketel (zoals een Nest), een slimme radiatorknop, of met
 * de hand. Een airco of thermostaat uit Home Assistant kies je uit de lijst.
 */
let toevoeg = null;
const TOEVOEG_SOORT = [...['radiator', 'vloer', 'paneel', 'kachel'].map((b) => [b, huismodel.metHoofdletter(t(`bron.${b}`))]), ['ha', t('inr.aircoThermo')]];
function toevoegVorm(r, los, elders) {
  const v = toevoeg ?? { soort: null, aan: null, apparaat: null };
  const cv = v.soort === 'radiator' || v.soort === 'vloer';
  const ketel = huismodel.cvThermostaat(d.huis, antwoorden().verwarming);
  const toestellen = binnen().flatMap((x) => klimaatIn(x).map((a) => ({ a, r: x })));
  const uitHA = `<select class="veld" data-toevoegen="${esc(r.id)}" aria-label="${esc(t('inr.uitHA'))}"><option value="">${esc(t('inr.kiesUitHA'))}</option>${[...los.map((x) => ({ key: x.id, naam: x.naam, waar: t('inr.nogLos') })), ...elders.filter((x) => x.r.id !== r.id).map((x) => ({ key: sleutel(x.a), naam: x.a.naam, waar: x.r.naam }))].map((x) => `<option value="${esc(x.key)}">${esc(t('energie.naamKamer', { naam: x.naam, kamer: x.waar }))}</option>`).join('')}</select>`;
  const aanOpties = cv
    ? [['thermostaat', ketel ? t('indeling.cvThermoNaam', { naam: ketel.naam }) : t('indeling.cvThermo')], ...(v.soort === 'radiator' ? [['knop', t('indeling.aan.knop')]] : []), ['hand', t('indeling.aan.hand')]]
    : ['thermostaat', 'stekker', 'hand'].map((w) => [w, t(`indeling.aan.${w}`)]);
  const kiesbaar = v.aan === 'knop' ? toestellen.filter((x) => x.a.radiatorknop) : toestellen;
  const welke = v.soort && v.soort !== 'ha' && v.aan && v.aan !== 'hand' && !(cv && v.aan === 'thermostaat')
    ? `<select class="veld" data-toevoeg-apparaat aria-label="${esc(t('inr.welkApparaat'))}"><option value="">${esc(t(v.aan === 'knop' ? 'inr.welkeKnop' : 'inr.welkApparaatVraag'))}</option>${kiesbaar.map((x) => `<option value="${esc(sleutel(x.a))}" ${sleutel(x.a) === v.apparaat ? 'selected' : ''}>${esc(t('energie.naamKamer', { naam: x.a.naam, kamer: x.r.naam }))}</option>`).join('')}</select>`
    : '';
  const klaar = v.soort && v.soort !== 'ha' && v.aan && (v.aan === 'hand' || (cv && v.aan === 'thermostaat') || v.apparaat);
  return `<div class="kolom toevoeg" style="width: 100%">
    <span class="zacht">${esc(t('inr.watHangt'))}</span>
    <div class="chips">${TOEVOEG_SOORT.map(([w, x]) => knop(`data-toevoeg-soort="${w}"`, x, v.soort === w)).join('')}</div>
    ${v.soort === 'ha' ? uitHA : ''}
    ${v.soort && v.soort !== 'ha' ? `<span class="zacht">${esc(t('indeling.hoeAan'))}</span><div class="chips">${aanOpties.map(([w, x]) => knop(`data-toevoeg-aan="${w}"`, x, v.aan === w)).join('')}</div>${welke}` : ''}
    <div class="chips">${knop('data-toevoeg-annuleer', t('indeling.annuleren'))}${v.soort !== 'ha' ? `<button type="button" class="chip aan" data-toevoeg-bewaar ${klaar ? '' : 'disabled'}>${esc(t('indeling.toevoegen'))}</button>` : ''}</div>
    ${v.soort === 'paneel' || v.soort === 'kachel' ? `<span class="zacht">${esc(t('inr.vermogenLater'))}</span>` : ''}
  </div>`;
}
/*
 * Een huis zonder slimme verwarming (besluit 190): de app regelt dan niet de
 * temperatuur, maar doet de rest wel. Vanzelf als er niets is om te verwarmen
 * of koelen; anders met "Geen slimme regeling" bij de verwarming.
 */
let zonderKlimaat = null;
const geenKlimaatToestel = () => binnen().flatMap(klimaatIn).length === 0 && !(d.huis?.zonderRuimte ?? []).some((x) => x.soort === 'klimaat');
function zonderKlimaatStap() {
  const f = d.functies;
  const r = (icoon, sleutel, ja) => regel({ ik: icoon, titel: t(`inr.zk.${sleutel}`), zin: t(`inr.zk.${sleutel}Zin`), rechts: esc(t(ja ? 'inr.zk.werkt' : 'inr.zk.nietGevonden')), toon: ja ? 'mint' : '' });
  return {
    waar: `${HOOFDSTUKKEN.findIndex(([, st]) => st.some(([x]) => x === 'warmte')) + 1}. ${t('inr.h.klimaat')}`,
    kop: t('inr.zk.kop'),
    uitleg: t('inr.zk.zin'),
    inhoud: `<div class="rijen lijst">
        ${r('lamp', 'licht', !!f?.lichtMogelijk)}
        ${r('screen', 'schermen', !!f?.schermMogelijk)}
        ${r('zon', 'zon', true)}
        ${r('camera', 'cameras', (f?.gevonden?.cameras ?? []).length > 0)}
        ${r('praat', 'assistent', true)}
        ${regel({ ik: 'thermo', titel: t('inr.zk.comfort'), zin: t('inr.zk.comfortZin'), rechts: esc(t('inr.zk.erbij')), toon: 'zon', klasse: 'uit' })}
      </div>${tip(t('inr.zk.tip'))}`,
    ...(geenKlimaatToestel() ? {} : { voet: [`<button type="button" class="zachtknop" data-zonderklimaat="0">${esc(t('panelen.terug'))}</button>`, volgendeKnoppen()] }),
  };
}
function warmteStap() {
  if (zonderKlimaat ?? geenKlimaatToestel()) return zonderKlimaatStap();
  const c = concept();
  const a = antwoorden();
  const elders = binnen().flatMap((r) => klimaatIn(r).map((x) => ({ a: x, r })));
  const los = (d.huis?.zonderRuimte ?? []).filter((x) => x.soort === 'klimaat');
  const rijen = binnen().map((r) => {
    const k = c?.kamers.find((x) => x.id === r.id);
    // Drie knoppen naast elkaar, zoals de schets: op temperatuur, op zon, kijkt mee (besluit 146).
    const toestellen = klimaatIn(r).map((x) => {
      const nuRol = rolVan(k, r, sleutel(x));
      const knoppen = ROLLEN.map(([w, lang, kort]) => `<button type="button" class="${w === 'zon' ? 'zon' : ''}" data-rolwaarde="${w}" aria-pressed="${w === nuRol}" title="${esc(lang)}">${esc(kort)}</button>`).join('');
      const ketel = huismodel.cvThermostaat(d.huis, a.verwarming)?.sleutel === sleutel(x);
      return `<div class="toestel">${esc(x.naam)}${ketel ? `<span class="zacht"> · ${esc(t('inr.zetKetel'))}</span>` : ''}<div class="seg" role="group" aria-label="${esc(t('inr.watMet', { naam: x.naam }))}" data-rol="${esc(sleutel(x))}" data-rolkamer="${esc(r.id)}">${knoppen}</div></div>`;
    }).join('');
    const bronnen = (r.bronnen ?? []).filter((b) => !b.apparaat).map((b) => `<span class="chip gevonden">${esc(huismodel.bronNaam(b))}</span>`).join('');
    const keuze = toevoegenIn === r.id ? toevoegVorm(r, los, elders) : knop(`data-erbij="${esc(r.id)}"`, t('indeling.plusIets'), false, 'plus');
    // Zonder eigen apparaat: meedoen met een kamer die wel regelt (besluit 142).
    const regelaars = binnen().filter((x) => x.id !== r.id && x.zoneId);
    const mee = !toestellen && regelaars.length ? `<select class="veld" data-meedoen="${esc(r.id)}" aria-label="${esc(t('inr.meedoenVraag', { naam: r.naam }))}"><option value="">${esc(t('inr.nietMee'))}</option>${regelaars.map((x) => `<option value="${esc(x.id)}" ${k?.meedoenMet === x.id ? 'selected' : ''}>${esc(t('indeling.doetMee', { naam: x.naam }))}</option>`).join('')}</select>` : '';
    const inhoud = `<div class="kolom" style="width: 100%">${toestellen}${bronnen ? `<div class="chips">${bronnen}</div>` : ''}${mee}${!toestellen && !bronnen && !mee ? `<span class="zacht">${esc(t('inr.nietsGoed'))}</span>` : ''}<div class="chips">${keuze}</div></div>`;
    return `<div class="rij"><b>${esc(r.naam)}</b>${inhoud}</div>`;
  });
  // De thermostaat die de ketel aanzet (besluit 167), zoals een Nest: niets gekozen is het voorstel uit Home Assistant.
  const lijst = huismodel.thermostaten(d.huis);
  const thermoOpties = [['', lijst[0] ? t('inr.thermo', { naam: lijst[0].naam }) : t('inr.geenThermo')], ...lijst.map((x) => [x.sleutel, t('inr.thermoKamer', { naam: x.naam, kamer: x.kamer })]), ['geen', t('energie.geenThermostaat')]];
  const thermo = a.verwarming.soort === 'stadsverwarming' || !lijst.length ? '' : `<select class="veld" data-inr-thermostaat aria-label="${esc(t('energie.thermostaatKetel'))}" style="width: 100%">${thermoOpties.map(([w, x]) => `<option value="${esc(w)}" ${w === (a.verwarming.thermostaat ?? '') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  // De thermostaat onder de knoppen, over de hele breedte: in de smalle kolom ernaast viel de tekst weg.
  const verwarming = `<div class="rij"><b>${esc(t('energie.verwarming'))}</b><div class="kolom" style="width: 100%"><div class="chips">${VERWARMING.map(([w, x]) => knop(`data-verwarming="${w}"`, x, a.verwarming.soort === w)).join('')}<button type="button" class="chip" data-zonderklimaat="1">${esc(t('inr.zk.knop'))}</button></div>${thermo}</div></div>`;
  return {
    waar: waarVan('warmte'),
    kop: t('inr.warmteKop'),
    uitleg: t('inr.warmteZin'),
    inhoud: `<div class="rijen">${verwarming}${rijen.join('') || `<p class="zacht">${esc(t('inr.geenKamers'))}</p>`}</div>`,
  };
}

/*
 * Wat elk apparaat kan (besluit 197, schets Wand-Inrichten-Klimaat): per
 * klimaatapparaat wat Home Assistant ervan zegt en wat de koppeling betekent.
 * Groen werkt; een halve stip werkt met een omweg, en de zin zegt welke; een
 * vraagteken vraagt iets dat Home Assistant niet weet; een streep kan dat
 * apparaat niet. Links de lijst, rechts het apparaat dat open staat; op de
 * telefoon klapt het open in de lijst. Een bereik dat niet kan kloppen (onder
 * 4° of boven 35°) wordt een voorstel dat de bewoner aanpast; een open vraag
 * staat bij Nog te doen.
 */
// Wat kan kloppen: 4° is de vorstbeveiliging van een radiatorknop; daaronder of boven 35° niet.
const BEREIK = [4, 35];
const IR = new Set(['smartir', 'broadlink', 'ir', 'irblaster', 'tuya_ir']);
const KOPPELING = { lg_thinq: 'LG ThinQ', smartthinq_sensors: 'SmartThinQ', nest: 'Google Nest', zha: 'ZHA', mqtt: 'Zigbee2MQTT', tuya: 'Tuya', smartir: t('inr.kan.ir'), broadlink: t('inr.kan.ir'), daikin: 'Daikin', midea_ac_lan: 'Midea', tado: 'tado°', netatmo: 'Netatmo', honeywell: 'Honeywell', generic_thermostat: t('inr.kan.generiek') };
const koppelingNaam = (k) => (k ? KOPPELING[k] ?? k : t('inr.kan.onbekend'));
/** De tip per koppeling; de LG's staan er vaak twee keer in. */
const TIP = { lg_thinq: 'lg', smartthinq_sensors: 'lg', nest: 'nest', tuya: 'tuya', smartir: 'ir', broadlink: 'ir' };
let kanOpen = null;
const kanToestellen = () => binnen().flatMap((r) => klimaatIn(r).map((a) => ({ a, r })));
const kanKeus = (a) => concept()?.apparaten?.[sleutel(a)] ?? {};
/** Een voorstel binnen wat een kamer kan zijn, als Home Assistant iets opgeeft wat niet kan kloppen. */
function kanBereik(a) {
  const h = a.klimaat?.ha ?? {};
  const eigen = kanKeus(a).bereik;
  if (eigen) return { min: eigen[0], max: eigen[1], fout: false, eigen: true, ha: [h.minC, h.maxC] };
  const fout = (h.minC != null && h.minC < BEREIK[0]) || (h.maxC != null && h.maxC > BEREIK[1]);
  if (!fout) return { min: h.minC, max: h.maxC, fout: false, eigen: false, ha: [h.minC, h.maxC] };
  const koel = a.klimaat?.kanKoelen;
  return { min: Math.max(h.minC ?? 0, koel ? 16 : 10), max: Math.min(h.maxC ?? 99, koel ? 30 : 25), fout: true, eigen: false, ha: [h.minC, h.maxC] };
}
const isKetel = (a) => huismodel.isKetelKoppeling(a) || huismodel.cvThermostaat(d.huis, antwoorden().verwarming)?.sleutel === sleutel(a);
/** Of een thermostaat moet zeggen wat hij verwarmt: niet de airco, niet de radiatorknop of de ketel, en zonder stroommeter. */
const vraagtWarmte = (a) => !a.klimaat?.kanKoelen && !a.radiatorknop && a.klimaat?.kanVerwarmen && a.klimaat?.vermogenW === undefined && !a.klimaat?.energieMeter && !isKetel(a);
const kanVraagOpen = (a) => vraagtWarmte(a) && !kanKeus(a).warmte;

/** Wat een apparaat kan, als punten, met de tip en hoe het ervoor staat. */
function kanVan(a, r) {
  const k = a.klimaat ?? {};
  const h = k.ha ?? {};
  const ir = IR.has(h.koppeling);
  const airco = !!k.kanKoelen;
  const meter = k.vermogenW !== undefined || !!k.energieMeter;
  const warmte = kanKeus(a).warmte;
  const p = [];
  const punt = (soort, titel, zin, extra = '') => p.push({ soort, titel, zin, extra });
  const graden = (x) => (x == null ? '?' : nl(x, Number.isInteger(x) ? 0 : 1));
  const b = kanBereik(a);
  // Wat hij kan, en van hoe laag tot hoe hoog.
  const wat = airco && k.kanVerwarmen ? t('inr.kan.koelWarm') : airco ? t('inr.kan.koel') : t('inr.kan.warm');
  const bereikZin = b.min != null && b.max != null ? t('inr.kan.vanTot', { min: graden(b.min), max: graden(b.max) }) : t('inr.kan.geenBereik');
  if (b.fout || b.eigen) {
    const opties = (w) => Array.from({ length: BEREIK[1] - BEREIK[0] + 1 }, (_, i) => BEREIK[0] + i).map((x) => `<option value="${x}" ${x === w ? 'selected' : ''}>${x}°</option>`).join('');
    const kiezen = `<div class="chips"><select class="veld klein" data-kan-bereik="${esc(sleutel(a))}" data-kant="min" aria-label="${esc(t('inr.kan.laagst'))}">${opties(b.min)}</select><select class="veld klein" data-kan-bereik="${esc(sleutel(a))}" data-kant="max" aria-label="${esc(t('inr.kan.hoogst'))}">${opties(b.max)}</select></div>`;
    // Wat hij kan en het bereik in één regel, zodat de rest in beeld blijft.
    punt('om', `${wat} · ${t('inr.kan.geeftOp', { min: graden(b.ha[0]), max: graden(b.ha[1]) })}`, t(b.eigen ? 'inr.kan.houdtEigen' : 'inr.kan.kanNiet', { min: graden(b.min), max: graden(b.max) }), kiezen);
  } else punt('ok', wat, `${bereikZin}${k.kanDrogen ? t('inr.kan.drogen') : ''}${a.radiatorknop ? t('inr.kan.cvWater') : ''}`);
  // "Verwarmen en koelen" bij een thermostaat die alleen verwarmt.
  if (!airco && (h.standen ?? []).includes('heat_cool') && !(h.standen ?? []).includes('cool')) punt('om', t('inr.kan.ookKoelen'), t('inr.kan.ookKoelenZin'));
  // Zegt hij wat hij doet?
  if (ir) punt('nee', t('inr.kan.irNiets'), t('inr.kan.irNietsZin'));
  else if (h.zegtActie) punt('ok', t('inr.kan.zegt'), k.actie ? t('inr.kan.zegtNu', { actie: k.actie }) : t('inr.kan.zegtZin'));
  else if (meter) punt('om', t('inr.kan.zegtNiet'), t('inr.kan.zegtNietMeter'));
  else punt('om', airco ? t('inr.kan.zegtNiet') : t('inr.kan.stooktNiet'), t('inr.kan.zegtNietTemp'));
  // De stroom.
  if (meter) punt('ok', t('inr.kan.meter'), k.vermogenW != null ? t('inr.kan.meterNu', { w: Math.round(k.vermogenW) }) : t('inr.kan.meterZin'));
  else if (a.radiatorknop || warmte === 'cv' || isKetel(a)) punt('nee', t('inr.kan.meterNiet'), t('inr.kan.meterNietCv'));
  else if (airco) punt('om', t('inr.kan.geenMeter'), t('inr.kan.geenMeterAirco'));
  else if (warmte === 'elektrisch') punt('om', t('inr.kan.geenMeter'), t('inr.kan.geenMeterElektrisch'));
  // Filter en batterij.
  if (k.filter) punt('ok', t('inr.kan.filter'), k.filter.uren != null ? t('inr.kan.filterUren', { n: Math.round(k.filter.uren) }) : t('inr.kan.filterPct', { pct: Math.round(k.filter.pct) }));
  if (a.batterijPct != null) punt(app.bijnaOp(a.batterijPct, 'batterij', d.huis) ? 'om' : 'ok', t('inr.kan.batterij'), t('inr.kan.batterijZin', { pct: Math.round(a.batterijPct) }));
  // Meet hij de kamer?
  const temp = a.meting?.temperatuurC;
  if (temp == null) punt('om', t('inr.kan.meetNiet'), t('inr.kan.meetNietZin', { kamer: r.naam }), `<div class="chips"><a class="chip" href="#meten">${esc(t('inr.kan.naarMeten'))}</a></div>`);
  else if (a.radiatorknop) punt('om', t('inr.kan.meetRadiator'), t('inr.kan.meetRadiatorZin', { c: graden(temp) }));
  else punt('ok', t('inr.kan.meet'), t('inr.kan.meetZin', { c: graden(temp) }));
  // Wat verwarmt hij? Alleen als hij het niet zegt.
  if (vraagtWarmte(a)) {
    const chips = ['cv', 'elektrisch', 'weetniet'].map((w) => knop(`data-kan-warmte="${esc(sleutel(a))}" data-waarde="${w}"`, t(`inr.kan.warmte.${w}`), warmte === w)).join('');
    punt(warmte ? 'ok' : 'vraag', t('inr.kan.watWarmt'), t('inr.kan.watWarmtZin'), `<div class="chips">${chips}</div>`);
  }
  // De tip: een tweede koppeling, of wat bij deze koppeling hoort.
  const tweede = h.tweede ? t('inr.kan.tweemaal', { een: koppelingNaam(h.koppeling), twee: koppelingNaam(h.tweede.koppeling) }) : '';
  const soort = ir ? 'ir' : a.radiatorknop ? 'knop' : TIP[h.koppeling] ?? null;
  const weet = [tweede, soort ? t(`inr.kan.tip.${soort}`) : ''].filter(Boolean).join(' ');
  const omwegen = p.filter((x) => x.soort === 'om').length;
  const vragen = p.filter((x) => x.soort === 'vraag').length;
  const rol = rolVan(concept()?.kamers.find((x) => x.id === r.id), r, sleutel(a));
  const stand = ir ? ['beperkt', t('inr.kan.st.ir')] : vragen ? ['om', t(vragen === 1 ? 'inr.kan.st.vraag' : 'inr.kan.st.vragen', { n: vragen })] : rol === 'kijken' ? ['mee', t('inr.kan.st.mee')] : omwegen ? ['ok', t(omwegen === 1 ? 'inr.kan.st.omweg' : 'inr.kan.st.omwegen', { n: omwegen })] : ['ok', t('inr.kan.st.helemaal')];
  return { punten: p, weet, stand, rol, ir, vragen };
}

function kanStap() {
  const lijst = kanToestellen();
  if (!lijst.length) return { waar: waarVan('apparaat'), kop: t('inr.kan.kop'), uitleg: t('inr.kan.zin'), inhoud: `<p class="zacht">${esc(t('inr.kan.geen'))}</p>` };
  if (!lijst.some((x) => sleutel(x.a) === kanOpen)) kanOpen = sleutel(lijst[0].a);
  const al = lijst.map((x) => ({ ...x, kan: kanVan(x.a, x.r) }));
  const los = ({ a, r, kan }) => {
    const punten = kan.punten.map((x) => `<div class="kpunt ${x.soort}"><i aria-hidden="true">${x.soort === 'ok' ? '✓' : x.soort === 'vraag' ? '?' : x.soort === 'nee' ? '–' : ''}</i><span><b>${esc(x.titel)}</b>${x.zin ? `<small>${esc(x.zin)}</small>` : ''}${x.extra}</span></div>`).join('');
    const knoppen = ROLLEN.map(([w, lang, kort]) => `<button type="button" class="${w === 'zon' ? 'zon' : ''}" data-rolwaarde="${w}" aria-pressed="${w === kan.rol}" title="${esc(lang)}">${esc(kort)}</button>`).join('');
    return `<div class="klos" data-klos="${esc(sleutel(a))}">
      <div class="kkop"><b>${esc(a.naam)}</b><span>${esc(a.radiatorknop ? t('inr.kan.knopVia', { via: koppelingNaam(a.klimaat?.ha?.koppeling) }) : koppelingNaam(a.klimaat?.ha?.koppeling))}</span></div>
      <div class="kpunten">${punten}</div>
      ${kan.weet ? `<div class="kweet"><b>${esc(t('inr.kan.goedOmTeWeten'))}</b> ${esc(kan.weet)}</div>` : ''}
      <div class="krol"><b>${esc(t('inr.kan.watDoetHij'))}</b><div class="seg" role="group" aria-label="${esc(t('inr.watMet', { naam: a.naam }))}" data-rol="${esc(sleutel(a))}" data-rolkamer="${esc(r.id)}">${knoppen}</div></div>
    </div>`;
  };
  const rij = (x) => {
    const open = sleutel(x.a) === kanOpen;
    const koel = !!x.a.klimaat?.kanKoelen;
    return `<button type="button" class="kapp${open ? ' open' : ''}" data-kan-open="${esc(sleutel(x.a))}" aria-expanded="${open}"><span class="kik ${koel ? 'koel' : 'warm'}" aria-hidden="true">${koel ? '❄' : '♨'}</span><span><b>${esc(x.a.naam)}</b><small>${esc(x.r.naam)} · <span class="kst ${x.kan.stand[0]}">${esc(x.kan.stand[1])}</span></small></span></button>${app.telStand() && open ? los(x) : ''}`;
  };
  // Samen in één zin: hoeveel er werken, meekijken, een vraag hebben of niets terugzeggen.
  const tel = (f) => al.filter(f).length;
  const delen = [
    t('inr.kan.samen.ok', { n: tel((x) => !x.kan.ir && !x.kan.vragen && x.kan.rol !== 'kijken') }),
    tel((x) => !x.kan.ir && !x.kan.vragen && x.kan.rol === 'kijken') ? t('inr.kan.samen.mee', { n: tel((x) => !x.kan.ir && !x.kan.vragen && x.kan.rol === 'kijken') }) : '',
    tel((x) => x.kan.vragen) ? t('inr.kan.samen.vraag', { n: tel((x) => x.kan.vragen) }) : '',
    tel((x) => x.kan.ir) ? t('inr.kan.samen.ir', { n: tel((x) => x.kan.ir) }) : '',
  ].filter(Boolean);
  const samen = `${t('inr.kan.samen.n', { n: al.length })} ${lijstje(delen)}.`;
  const lijstHtml = `<div class="klijst">${al.map(rij).join('')}<button type="button" class="kmist" data-kan-mist>${esc(t('inr.kan.mist'))}</button><p class="ksamen">${esc(samen)}</p></div>`;
  const open = al.find((x) => sleutel(x.a) === kanOpen);
  return {
    waar: waarVan('apparaat'),
    kop: t('inr.kan.kop'),
    uitleg: t('inr.kan.zin'),
    inhoud: app.telStand() ? lijstHtml : `<div class="kanstap">${lijstHtml}${open ? los(open) : ''}</div>`,
  };
}

/** Wat de meeste kamers zeggen, of een gewone waarde. */
function meest(lijst, anders) {
  const tel = new Map();
  for (const v of lijst) if (v != null) tel.set(v, (tel.get(v) ?? 0) + 1);
  return [...tel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? anders;
}
/*
 * Comfort voor het hele huis (besluit 158): het geldt voor de kamers die
 * dezelfde waarde hebben als de meeste. Een kamer die de bewoner zelf anders
 * zette, blijft zo, tenzij hij kiest dat die mee moet.
 */
let comfortKeuze = null;
let ookEigen = false;
function comfortBasis() {
  const kamers = d.comfort?.kamers ?? [];
  const warm = meest(kamers.filter((k) => k.kanVerwarmen).map((k) => k.modi.dag.heat), 20);
  const koel = meest(kamers.filter((k) => k.kanKoelen).map((k) => k.modi.dag.cool), 24);
  const nachtHeat = meest(kamers.filter((k) => k.kanVerwarmen).map((k) => k.modi.nacht.heat), null);
  const nacht = kamers.every((k) => k.modi.nacht.heat == null && k.modi.nacht.cool == null) ? 'uit' : nachtHeat === warm ? 'zelfde' : 'koeler';
  return { warm, koel: Math.max(koel, warm + 1), nacht, dag: d.comfort?.dagdelen?.dag ?? 7, avond: d.comfort?.dagdelen?.nacht ?? 22 };
}
const comfortNu = () => comfortKeuze ?? comfortBasis();
/** De kamers die de bewoner zelf anders zette dan de rest. */
function eigenKamers() {
  const b = comfortBasis();
  return (d.comfort?.kamers ?? []).filter((k) => k.uitApp && ((k.kanVerwarmen && k.modi.dag.heat !== b.warm) || (k.kanKoelen && k.modi.dag.cool !== b.koel)));
}
function comfortStap() {
  if (!d.comfort?.kamers?.length) {
    return { waar: waarVan('comfort'), kop: t('inr.comfortKop'), uitleg: t('inr.comfortLater'), inhoud: '' };
  }
  const c = comfortNu();
  const uur = (u) => `${String(u).padStart(2, '0')}:00`;
  const kanKoelen = d.comfort.kamers.some((k) => k.kanKoelen);
  const eigen = eigenKamers();
  return {
    waar: waarVan('comfort'),
    kop: t('inr.comfortKop'),
    uitleg: t('inr.comfortZin'),
    inhoud: `<div class="kolom">
        <label class="schuif warm">${esc(t('inr.verwarmenOnder'))}<b>${nl(c.warm)}°</b><input type="range" min="14" max="24" step="0.5" value="${c.warm}" data-comfort="warm" aria-label="${esc(t('inr.verwarmenOnder'))}"></label>
        ${kanKoelen ? `<label class="schuif">${esc(t('inr.koelenBoven'))}<b>${nl(c.koel)}°</b><input type="range" min="18" max="28" step="0.5" value="${c.koel}" data-comfort="koel" aria-label="${esc(t('inr.koelenBoven'))}"></label>` : ''}
      </div>
      <div class="rijen">
        ${rij(t('comfort.naam.nacht'), ['koeler', 'zelfde', 'uit'].map((w) => knop(`data-nacht="${w}"`, t(`inr.nacht.${w}`), c.nacht === w)).join(''))}
        ${rij(t('inr.deDag'), `<select class="veld" data-dagvan aria-label="${esc(t('inr.dagBegint'))}" style="width: auto">${[5, 6, 7, 8, 9].map((u) => `<option value="${u}" ${u === c.dag ? 'selected' : ''}>${esc(t('inr.van', { uur: uur(u) }))}</option>`).join('')}</select><select class="veld" data-dagtot aria-label="${esc(t('inr.nachtBegint'))}" style="width: auto">${[20, 21, 22, 23].map((u) => `<option value="${u}" ${u === c.avond ? 'selected' : ''}>${esc(t('inr.tot', { uur: uur(u) }))}</option>`).join('')}</select>`)}
      </div>
      ${eigen.length ? `<div class="noot">${esc(t('inr.eigenWaarde', { n: eigen.length, namen: lijstje(eigen.map((k) => k.naam)) }))}<div class="chips" style="margin-top: 8px">${knop('data-ookeigen', t('inr.ookGelijk'), ookEigen)}</div></div>` : ''}
      <div class="rijen">${dagdelenRaster()}</div>`,
  };
}
/** Per kamer wat het wordt, overdag en 's nachts, en vanaf wanneer hij koelt (besluit 190, schets Wand-Inrichten-3). */
function dagdelenRaster() {
  const kamers = d.comfort?.kamers ?? [];
  const koelen = kamers.some((k) => k.kanKoelen);
  const cel = (v, klasse) => `<span class="${v == null ? '' : klasse}">${v == null ? '–' : `${nl(v)}°`}</span>`;
  const kop = `<small></small><small>${esc(t('comfort.naam.dag'))}</small><small>${esc(t('comfort.naam.nacht'))}</small>${koelen ? `<small>${esc(t('inr.koelenVanaf'))}</small>` : ''}`;
  const rijen = kamers.map((k) => `<b>${esc(k.naam)}</b>${cel(k.kanVerwarmen ? k.modi.dag.heat : null, 'warm')}${cel(k.kanVerwarmen ? k.modi.nacht.heat : null, 'nacht')}${koelen ? cel(k.kanKoelen ? k.modi.dag.cool : null, 'koel') : ''}`).join('');
  return `<div class="dagdelen${koelen ? ' drie' : ''}">${kop}${rijen}</div>`;
}

/*
 * Afwezig en vakantie (besluit 190): voor het hele huis, zoals comfort. Het
 * huis ziet aan de bewoners dat niemand thuis is; vakantie zet je zelf aan.
 */
let afwezigKeuze = null;
function afwezigBasis() {
  const kamers = d.comfort?.kamers ?? [];
  const w = (m, s, anders) => meest(kamers.filter((k) => (s === 'heat' ? k.kanVerwarmen : k.kanKoelen)).map((k) => k.modi[m]?.[s]), anders);
  return { afwezig: { heat: w('afwezig', 'heat', 16), cool: w('afwezig', 'cool', 26) }, vakantie: { heat: w('vakantie', 'heat', 12), cool: w('vakantie', 'cool', 28) } };
}
function afwezigStap() {
  if (!d.comfort?.kamers?.length) return { waar: waarVan('afwezig'), kop: t('inr.afw.kop'), uitleg: t('inr.comfortLater'), inhoud: '' };
  const b = afwezigKeuze ?? afwezigBasis();
  const warm = d.comfort.kamers.some((k) => k.kanVerwarmen);
  const koelen = d.comfort.kamers.some((k) => k.kanKoelen);
  const stapper = (m, s) => `<span class="stapper"><button type="button" data-afw="${m}:${s}:-0.5" aria-label="${esc(t('comfort.lager'))}">−</button><b>${nl(b[m][s])}°</b><button type="button" data-afw="${m}:${s}:0.5" aria-label="${esc(t('comfort.hoger'))}">+</button></span>`;
  const rijen = [
    warm ? regel({ ik: 'huis', titel: t('inr.afw.weg'), zin: t('inr.afw.wegZin'), rechts: stapper('afwezig', 'heat') }) : '',
    koelen ? regel({ ik: 'huis', titel: t('inr.afw.wegKoel'), zin: t('inr.afw.koelZin'), rechts: stapper('afwezig', 'cool') }) : '',
    warm ? regel({ ik: 'koffer', titel: t('inr.afw.vakantie'), zin: t('inr.afw.vakantieZin'), rechts: stapper('vakantie', 'heat') }) : '',
    koelen ? regel({ ik: 'koffer', titel: t('inr.afw.vakantieKoel'), zin: t('inr.afw.koelZin'), rechts: stapper('vakantie', 'cool') }) : '',
  ];
  return {
    waar: waarVan('afwezig'),
    kop: t('inr.afw.kop'),
    uitleg: t('inr.afw.zin'),
    inhoud: `<div class="rijen lijst">${rijen.join('')}</div>${tip(t('inr.afw.tip'))}`,
  };
}
async function bewaarAfwezig() {
  const b = afwezigKeuze ?? afwezigBasis();
  const kamers = Object.fromEntries(d.comfort.kamers.map((k) => {
    const paar = (m) => ({ heat: k.kanVerwarmen ? b[m].heat : null, cool: k.kanKoelen ? b[m].cool : null });
    return [k.id, { modi: { ...k.modi, afwezig: paar('afwezig'), vakantie: paar('vakantie') }, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }];
  }));
  const body = { kamers, dagdelen: { ...(d.comfort.dagdelen ?? {}) }, ...(d.comfort.voorrang ? { voorrang: { koelen: d.comfort.voorrang.koelen, verwarmen: d.comfort.voorrang.verwarmen } } : {}) };
  const uit = await stuur('api/comfort', body);
  if (uit) {
    d.comfort = uit;
    afwezigKeuze = null;
  }
  teken();
}
async function bewaarComfort() {
  const c = comfortNu();
  const houd = new Set(ookEigen ? [] : eigenKamers().map((k) => k.id));
  const kamers = Object.fromEntries(d.comfort.kamers.map((k) => {
    if (houd.has(k.id)) return [k.id, { modi: k.modi, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }];
    const heat = k.kanVerwarmen ? c.warm : null;
    const cool = k.kanKoelen ? c.koel : null;
    const nacht = c.nacht === 'uit' ? { heat: null, cool: null } : c.nacht === 'zelfde' ? { heat, cool } : { heat: heat == null ? null : heat - 2, cool: cool == null ? null : Math.max(cool - 2, (heat ?? 0) - 1) };
    return [k.id, { modi: { ...k.modi, dag: { heat, cool }, nacht }, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }];
  }));
  const body = { kamers, dagdelen: { ...(d.comfort.dagdelen ?? {}), dag: c.dag, nacht: c.avond }, ...(d.comfort.voorrang ? { voorrang: { koelen: d.comfort.voorrang.koelen, verwarmen: d.comfort.voorrang.verwarmen } } : {}) };
  const uit = await stuur('api/comfort', body);
  if (uit) {
    d.comfort = uit;
    comfortKeuze = null;
    teken();
  }
}

/* De panelen (besluit 158): eerst of ze er zijn, dan de kant van het dak, dan hoeveel. */
const DAKKANT = ['voorkant', 'achterkant', 'beide', 'plat', 'weetniet'].map((k) => [k, t(`energie.kant.${k}`)]);
function antwoorden() {
  const x = d.aans?.antwoorden;
  return {
    panelen: { ligging: x?.panelen?.ligging ?? null, aantal: x?.panelen?.aantal ?? null, voorkant: x?.panelen?.voorkant ?? null, achterkant: x?.panelen?.achterkant ?? null },
    zekering: x?.zekering ?? null,
    tarief: x?.tarief ?? null,
    verwarming: { soort: x?.verwarming?.soort ?? null, aanvoerC: x?.verwarming?.aanvoerC ?? null, thermostaat: x?.verwarming?.thermostaat ?? null },
    // Hoe de panelen liggen (besluit 157): bewaart de stap daarna, hier gaat het alleen mee.
    voorkantZon: x?.voorkantZon ?? null,
    dak: x?.dak ?? null,
    opZon: { ...(x?.opZon ?? {}) },
    // Apparaten uit de configuratie die van zon zijn gehaald (besluit 167): gaan mee.
    opZonUit: [...(x?.opZonUit ?? [])],
    // Panelen op de garage, carport of het tuinhuis (besluit 187): gaan mee, anders vallen ze weg.
    elders: { ...(x?.elders ?? {}) },
  };
}
let panelenJa = false;
function zonStap() {
  const a = antwoorden();
  const piekW = (d.zon?.panelen ?? []).reduce((som, p) => som + (p.wattpiek ?? 0), 0);
  const meter = (energieNu()?.zon ?? []).length > 0;
  const geen = a.panelen.ligging === 'geen';
  const ja = !geen && (a.panelen.ligging != null || panelenJa);
  const gevonden = piekW > 0 ? `<span class="chip gevonden">${esc(t('inr.kwpGevonden', { kwp: nl(piekW / 1000) }))}</span>` : meter ? `<span class="chip gevonden">${esc(t('inr.meterGevonden'))}</span>` : '';
  const veld = (sleutel, label, waarde) => `<label class="invul"><span>${esc(label)}</span><span class="waarde"><input inputmode="numeric" data-aantal="${sleutel}" value="${waarde ?? ''}" placeholder="${esc(t('inr.invullen'))}" aria-label="${esc(label)}"></span></label>`;
  const aantallen = !ja || !a.panelen.ligging
    ? ''
    : a.panelen.ligging === 'beide'
      ? `<span class="vraagje">${esc(t('energie.aantal'))}</span><div class="paar">${veld('voorkant', t('energie.kant.voorkant'), a.panelen.voorkant)}${veld('achterkant', t('energie.kant.achterkant'), a.panelen.achterkant)}</div>`
      : veld('aantal', t('energie.aantal'), a.panelen.aantal);
  // Ook op een ander dak (besluit 187, 190): de garage, carport of het tuinhuis, als die er zijn.
  const rond = huismodel.rondNu(d.huis);
  const plekken = [['garage', t('soort.buiten.garage'), 'garage'], ['carport', t('soort.buiten.carport'), 'carport'], ['tuinhuis', rond.schuur ? t('inr.schuurtje') : t('inr.tuinhuis'), rond.schuur ? 'schuur' : 'tuinhuis']].filter(([w]) => rond[w]);
  const elders = ja && plekken.length
    ? `<span class="vraagje">${esc(t('inr.zon.elders'))}</span><div class="lijst">${plekken.map(([w, naam, icoon]) => regel({ ik: icoon, titel: naam, rechts: `<label class="getal"><input inputmode="numeric" data-elders="${w}" value="${a.elders[w] ?? ''}" placeholder="0" aria-label="${esc(t('inr.zon.eldersAantal', { naam }))}"></label>` })).join('')}</div>`
    : '';
  return {
    waar: waarVan('zon'),
    kop: t('inr.zonKop'),
    uitleg: t('inr.zonZin'),
    inhoud: `<div class="rijen">
        ${rij(t('instellingen.panelen'), `${knop('data-panelen="ja"', t('functies.ja'), ja)}${knop('data-panelen="geen"', t('energie.kant.geen'), geen)}${gevonden}`)}
        ${ja ? rij(t('energie.kantDak'), DAKKANT.map(([w, x]) => knop(`data-dakkant="${w}"`, x, a.panelen.ligging === w)).join('')) : ''}
      </div>
      ${aantallen}${elders}${aantallen ? `<p class="zacht" style="padding: 0; margin: 0">${esc(t('inr.nietVerplicht'))}</p>` : ''}`,
  };
}

/*
 * Wat mag er op zon? (besluit 167 en 190): elk apparaat dat kan wachten tot er
 * zon over is, met een schakelaar, ook de boiler en de jacuzzi. Eerst kijkt
 * het mee (de schrijfgrens). Onderaan de aansluiting zoals gevonden.
 */
const OPZON_IK = { droger: 'droger', wasmachine: 'droger', vaatwasser: 'vaat', boiler: 'boiler', jacuzzi: 'jacuzzi', auto: 'laadpaal', laadpaal: 'laadpaal' };
function opzonStap() {
  const x = d.aans;
  if (!x) return { waar: waarVan('opzon'), kop: t('inr.opzon.kop'), uitleg: t('inr.opzon.zin'), inhoud: `<p class="zacht">${esc(t('inr.lezen'))}</p>` };
  const a = antwoorden();
  const vast = new Set((x.configuratie?.apparaten ?? []).map((y) => y.id));
  // Het icoon bij de soort, of anders bij de naam.
  const icoon = (y) => OPZON_IK[y.soort] ?? (/droog|droger|dryer|was/i.test(y.naam) ? 'droger' : /vaat|dish/i.test(y.naam) ? 'vaat' : 'stekker');
  const een = (y, aan, attr) => regel({ ik: icoon(y), titel: y.naam, zin: t(aan ? 'regeling.startZon' : 'regeling.startNiet'), rechts: schakelaar(attr, t('regeling.naamOpZon', { naam: y.naam }), aan) });
  const rijen = [
    ...(x.configuratie?.apparaten ?? []).map((y) => een(y, !a.opZonUit.includes(y.id), `data-opzon-vast="${esc(y.id)}"`)),
    ...(x.gevonden?.apparaten ?? []).filter((y) => !vast.has(y.id)).map((y) => een(y, a.opZon[y.id] === true, `data-opzon="${esc(y.id)}"`)),
  ];
  const meer = regel({ tag: 'a', attrs: 'href="huis-kan.html"', ik: 'accu', titel: t('inr.opzon.meer'), zin: t('inr.opzon.meerZin'), rechts: '›', klasse: 'uit' });
  const zek = a.zekering && a.zekering !== 'weetniet' ? `${a.zekering.fasen} × ${a.zekering.ampere} A` : null;
  const p1 = (energieNu()?.net?.afname ?? []).length > 0;
  const aansluiting = zek || p1 ? rij(t('inr.jeAansluiting'), `${zek ? `<span class="chip gevonden">${esc(zek)}</span>` : ''}${p1 ? `<span class="chip gevonden">${esc(t('inr.slimmeMeter'))}</span>` : ''}`) : '';
  return {
    waar: waarVan('opzon'),
    kop: t('inr.opzon.kop'),
    uitleg: t('inr.opzon.zin'),
    inhoud: `<div class="rijen lijst">${rijen.join('') || `<p class="zacht">${esc(t('regeling.geenApparaten'))}</p>`}${meer}</div>${aansluiting}`,
  };
}

/*
 * Hoe de panelen liggen (besluit 157, schets Wand-Inrichten-Panelen): de kaart
 * komt uit panelen.js. Onderaan zijn knoppen: Aanpassen en Klopt bij een
 * voorstel, Terug en Bewaar bij aanpassen, en anders Aanpassen naast Volgende.
 */
const ligStaat = { aanpassen: false, concept: null, na: () => teken() };
function liggingStap() {
  // De antwoorden zoals de stap ze kent, ook als er nog niets bewaard is (besluit 166).
  const k = ligging.kaart(d.aans?.ligging, antwoorden(), ligStaat);
  const rechts = `<span class="rechts lig-knoppen">${k.knoppen}${k.volgende ? `<button type="button" class="knop knop-licht" data-volgende>${esc(t('inr.volgende'))}</button>` : ''}</span>`;
  return {
    waar: waarVan('ligging'),
    kop: k.kop,
    uitleg: k.uitleg,
    inhoud: `<div class="rijen">${k.inhoud}</div>`,
    voet: [ligStaat.aanpassen ? '' : `<button type="button" class="zachtknop" data-terug>${esc(t('panelen.terug'))}</button>`, rechts],
  };
}

/* De zekering zoals de schets: eerst de fasen, dan de ampère in een vak (besluit 146). */
const AMPERES = [16, 20, 25, 35, 40, 50, 63, 80];
function zekeringStap() {
  const a = antwoorden();
  const zek = a.zekering && a.zekering !== 'weetniet' ? a.zekering : null;
  const ampere = zek?.ampere ?? null;
  const lijst = ampere != null && !AMPERES.includes(ampere) ? [...AMPERES, ampere].sort((x, y) => x - y) : AMPERES;
  const keuze = `<select class="veld" data-ampere aria-label="${esc(t('inr.zekAmpere'))}" ${zek ? '' : 'disabled'}>${zek ? '' : `<option value="">${esc(t('inr.eerstFasen'))}</option>`}${lijst.map((x) => `<option value="${x}" ${x === ampere ? 'selected' : ''}>${x} A</option>`).join('')}</select>`;
  return {
    waar: waarVan('zekering'),
    kop: t('inr.zekKop'),
    uitleg: t('inr.zekZin'),
    inhoud: `<div class="chips">${knop('data-fasen="1"', t('energie.eenFase'), zek?.fasen === 1)}${knop('data-fasen="3"', t('energie.drieFasen'), zek?.fasen === 3)}${knop('data-zekering="weetniet"', t('energie.weetNiet'), a.zekering === 'weetniet')}</div>
      <label class="invul"><span>${esc(t('instellingen.zekering'))}</span>${keuze}</label>`,
  };
}

/*
 * De prijzen (besluit 158): eerst het soort contract, dan alleen de velden die
 * daarbij horen, met gas en wat je vanaf 2027 voor teruglevering krijgt en
 * betaalt. Het salderen stopt op 1 januari 2027.
 */
const CONTRACT = ['enkel', 'dagnacht', 'dynamisch'].map((c) => [c, t(`inr.contract.${c}`)]);
let contractKeuze = null;
function contractNu() {
  if (contractKeuze) return contractKeuze;
  const a = antwoorden();
  const p = energieNu()?.prijzen ?? {};
  if (a.tarief === 'dynamisch') return 'dynamisch';
  if (p.stroomDal != null) return 'dagnacht';
  if (a.tarief === 'vast' || p.stroom != null) return 'enkel';
  return null;
}
function prijzenStap() {
  const e = energieNu();
  const meters = [e?.net?.afname?.length ? t('inr.meter.net') : null, e?.zon?.length ? t('inr.meter.panelen') : null, e?.gas ? t('energie.gas') : null].filter(Boolean);
  const p = e?.prijzen ?? {};
  const contract = contractNu();
  const veld = (sleutel, label, waarde, eenheid = 'kWh') => `<label class="invul"><span>${esc(label)}</span><span class="waarde">€<input inputmode="decimal" data-prijs="${sleutel}" data-eenheid="${eenheid}" value="${waarde != null ? nl(waarde, String(waarde).split('.')[1]?.length ?? 0) : ''}" placeholder="${esc(t('inr.invullen'))}" aria-label="${esc(t('inr.perEenheid', { label, eenheid }))}"></span></label>`;
  // Twee vakken naast elkaar, zodat alles op de kaart past: stroom (en dal), dan gas.
  const gas = e?.gas ? veld('gas', t('inr.gasM3'), p.gas, 'm³') : '';
  const stroom = contract === 'dagnacht'
    ? `<div class="paar">${veld('stroom', t('inr.stroomNormaal'), p.stroom)}${veld('stroomDal', t('inr.stroomDal'), p.stroomDal)}</div>${gas}`
    : `<div class="paar">${veld('stroom', t(contract === 'dynamisch' ? 'inr.stroomGemiddeld' : 'energie.stroomKop'), p.stroom)}${gas}</div>`;
  const velden = contract
    ? `${stroom}
       <span class="vraagje">${esc(t('inr.terug2027'))}</span><div class="paar">${veld('vanaf2027.vergoeding', t('inr.jeKrijgt'), p.vanaf2027?.vergoeding)}${veld('vanaf2027.kosten', t('inr.jeBetaalt'), p.vanaf2027?.kosten)}</div>`
    : '';
  return {
    waar: waarVan('prijzen'),
    kop: t('inr.prijsKop'),
    uitleg: meters.length ? t('inr.prijsMeters', { meters: lijstje(meters) }) : t('inr.prijsZin'),
    inhoud: `<div class="chips">${CONTRACT.map(([w, x]) => knop(`data-contract="${w}"`, x, contract === w)).join('')}</div>
      ${velden ? `<div class="rijen kolom">${velden}</div>` : ''}
      <div class="noot">${esc(t('inr.prijsNoot'))}</div>`,
  };
}

/* Gemak: licht en camera's in de app (besluit 130), en de wand die één keer inlogt. */
const functiesNu = () => {
  const f = d.functies;
  if (!f) return null;
  const c = JSON.parse(JSON.stringify(f.instellingen ?? f.voorstel));
  c.licht ??= f.voorstel.licht;
  c.schermen ??= f.voorstel.schermen ?? { bedienen: true };
  c.weer ??= f.voorstel.weer;
  c.praten ??= f.voorstel.praten ?? { taalmodel: null, bedienen: true, spraak: null };
  return c;
};
function functiesStap() {
  const c = functiesNu();
  const f = d.functies;
  const cams = f?.gevonden?.cameras ?? [];
  // Elk deel met een schakelaar (besluit 190): aan is bedienen in de app, uit alleen kijken.
  const een = (icoon, titel, attr, aan, zinAan, zinUit) => regel({ ik: icoon, titel, zin: aan ? zinAan : zinUit, rechts: schakelaar(`${attr}="${!aan}"`, titel, aan) });
  return {
    waar: waarVan('functies'),
    kop: t('inr.gemakKop'),
    uitleg: t('inr.functiesZin'),
    inhoud: c
      ? `<div class="rijen lijst">
          ${f.lichtMogelijk ? een('lamp', t('inr.licht'), 'data-flicht', c.licht?.bedienen === true, t('functies.bedienen'), t('functies.kijken')) : ''}
          ${f.schermMogelijk ? een('screen', t('inr.zonneschermen'), 'data-fscherm', c.schermen?.bedienen === true, t('functies.bedienen'), t('functies.kijken')) : ''}
          ${cams.length ? een('camera', t('functies.cameras'), 'data-fcam', c.cameras?.aan === true, lijstje(cams.map((x) => x.naam)), t('functies.nietTonen')) : ''}
          ${een('praat', t('inr.assistent'), 'data-fpraat', c.praten?.bedienen !== false, t('inr.assistentAan'), t('inr.assistentUit'))}
        </div>${tip(t('inr.gemakTip'))}`
      : `<p class="zacht">${esc(t('inr.lezen'))}</p>`,
  };
}
async function bewaarFuncties(c) {
  const uit = await stuur('api/functies', c);
  if (!uit) return false;
  d.functies = await haal('api/functies').catch(() => d.functies);
  teken();
  return true;
}
/*
 * De wand (besluit 158): dat doe je op de tablet zelf, niet hier. Wie hier
 * inricht, ziet hoe, met een code om te scannen, en welke schermen er al zijn.
 */
/*
 * Per scherm (besluit 166): het hele scherm en luisteren naar "Hé huis". De
 * dienst bewaart het, de tablet neemt het over; zo zet je het ook vanaf de pc.
 */
function schermRij(s) {
  const mag = d.bewoners?.ik?.magBeheren || s.ik;
  const o = s.opties ?? {};
  return `<div class="waarderij">${esc(s.naam)}<span>${esc(t(s.ik ? 'inr.ditScherm' : 'inr.scherm'))}</span></div>
    <div class="rondom" style="margin-bottom: 8px">
      ${schakel(`data-sopt="volledig" data-scherm="${esc(s.id)}"`, t('bewoners.volledig'), o.volledig === true, !mag)}
      ${schakel(`data-sopt="luisteren" data-scherm="${esc(s.id)}"`, t('bewoners.luistert'), o.luisteren === true, !mag)}
    </div>`;
}
/*
 * De wand (besluit 158, 166 en 190): hoe hij eruitziet, in het klein, met de
 * kaarten om aan of uit te zetten; 's nachts uit en de taal. Dezelfde indeling
 * als op je telefoon (niet dubbel). Daaronder elk scherm.
 */
const WAND_KAARTEN = ['favorieten', 'vandaag', 'apparaat', 'gevoel', 'morgen', 'auto', 'batterij', 'maand', 'deurbel', 'boiler', 'sluip'];
function wandStap() {
  const schermen = d.bewoners?.schermen ?? [];
  const inlog = d.sessie?.toegang === 'sessions';
  const v = d.voork;
  const kaarten = v?.wand?.kaarten ?? [];
  const breed = new Set(v?.wand?.breed ?? []);
  const wandje = `<div class="wandje" aria-hidden="true"><span class="huisvak" data-mini="wand"></span><span class="kaartjes">${kaarten.slice(0, 8).map((k) => `<i class="${breed.has(k) ? 'breed' : ''}"></i>`).join('')}</span></div>`;
  const n = v?.wand?.niemand;
  const taal = v?.tel?.taal ?? 'auto';
  const instellen = v
    ? `${wandje}
       ${rij(t('inr.kaarten'), WAND_KAARTEN.map((k) => knop(`data-wkaart="${k}"`, t(`inr.kaart.${k}`), kaarten.includes(k))).join(''))}
       ${n ? rij(t('inr.alsNiemand'), knop('data-wnacht', t('inr.nachtsUit', { van: n.van, tot: n.tot }), n.nacht === true)) : ''}
       ${v.scherm ? '' : rij(t('jij.taal.kop'), ['auto', 'nl', 'en'].map((x) => knop(`data-wtaal="${x}"`, t(`jij.taal.${x}`), taal === x)).join(''))}`
    : '';
  return {
    waar: waarVan('wand'),
    kop: t('inr.wandKop'),
    uitleg: t(schermen.length ? 'inr.wandPerScherm' : inlog ? 'inr.wandInlog' : 'inr.wandHA'),
    inhoud: `<div class="rijen">${instellen}
        ${schermen.length ? schermen.map(schermRij).join('') : ''}
        ${!schermen.length && inlog ? `<div class="erbij"><div class="qr" role="img" aria-label="${esc(t('bewoners.qr'))}">${qrVan(appAdres())}</div><span class="zacht" style="padding: 0">${esc(t('inr.geenBewoner'))}</span></div>` : ''}
      </div>`,
  };
}
async function bewaarVoorkeur(body) {
  const uit = await stuur('api/voorkeuren', body);
  if (uit) d.voork = uit;
  teken();
  return uit;
}

/*
 * Staat alles klaar? (besluit 179 en 190): wat Smart Climate in Home Assistant
 * gebruikt, zoals bij Wat je huis kan. Oranje mist nog; in Home Assistant
 * opent een tik dat scherm.
 */
const KLAAR_STIP = { klaar: 'var(--mint)', mist: 'var(--gloed)', optioneel: 'var(--gedempt)' };
function haStap() {
  const punten = d.klaar?.punten ?? [];
  const inHA = app.inHA();
  const rijen = punten.map((p) => `<div class="klaarregel"><i style="background: ${KLAAR_STIP[p.stand] ?? 'var(--gedempt)'}"></i><span class="tekst"><b>${esc(p.titel)}</b><span>${esc(p.zin)}</span>${!inHA && p.waar && p.stand !== 'klaar' ? `<small>${esc(p.waar)}</small>` : ''}</span>${inHA && p.pad && p.stand !== 'klaar' ? `<button type="button" class="chip" data-ha-pad="${esc(p.pad)}" aria-label="${esc(t('kan.klaar.openIn', { titel: p.titel }))}">${esc(t('kan.klaar.open'))}</button>` : '<span></span>'}</div>`).join('');
  return {
    waar: waarVan('ha'),
    kop: t('inr.ha.kop'),
    uitleg: t(inHA ? 'inr.ha.zin' : 'inr.ha.zinBuiten'),
    inhoud: `<div class="rijen lijst klaarlijst">${rijen || `<p class="zacht">${esc(t('inr.lezen'))}</p>`}</div>${tip(t('inr.ha.tip'))}`,
  };
}
async function bewaarAansluiting(a) {
  const opZon = Object.fromEntries(Object.entries(a.opZon).filter(([, v]) => typeof v === 'boolean'));
  const uit = await stuur('api/aansluiting', { panelen: a.panelen, zekering: a.zekering, tarief: a.tarief, verwarming: a.verwarming, voorkantZon: a.voorkantZon, dak: a.dak, elders: a.elders, opZon, opZonUit: a.opZonUit });
  if (uit) {
    d.aans = uit;
    teken();
  }
  return !!uit;
}
/** Een prijs bewaren; `sleutel` mag een pad zijn, zoals "vanaf2027.kosten". */
async function bewaarPrijzen(wijzig) {
  const e = JSON.parse(JSON.stringify(energieNu() ?? { versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } }));
  e.prijzen.vanaf2027 ??= { vergoeding: null, kosten: null };
  for (const [sleutel, waarde] of Object.entries(wijzig)) {
    const [a, b] = sleutel.split('.');
    if (b) e.prijzen[a][b] = waarde;
    else e.prijzen[a] = waarde;
  }
  const uit = await stuur('api/energie', { ...e, bron: e.bron ?? 'zelf' });
  if (uit) {
    d.energie = { ...d.energie, instellingen: uit };
    teken();
  }
  return !!uit;
}

/*
 * Klaar (besluit 190): wat nog te doen is (niet nagelopen, of wat in Home
 * Assistant mist), Wat je huis kan, en de film.
 */
function klaarStap() {
  const open = STAPPEN.filter(([id]) => id !== 'klaar' && !nagelopen.has(id));
  const mist = (d.klaar?.punten ?? []).filter((p) => p.stand === 'mist');
  // Een open vraag bij Wat elk apparaat kan (besluit 197): je mocht door, en hij staat hier.
  const vragen = kanToestellen().filter(({ a }) => kanVraagOpen(a)).map(({ a }) => t('inr.kan.nogVraag', { naam: a.naam }));
  const n = open.length + mist.length + vragen.length;
  const nogTeDoen = n
    ? regel({ tag: 'a', attrs: `href="#${open[0]?.[0] ?? (vragen.length ? 'apparaat' : 'ha')}"`, ik: 'huis', titel: t('inr.nogTeDoen'), zin: lijstje([...open.map(([, naam]) => naam.toLowerCase()), ...vragen, ...mist.map((p) => p.titel.toLowerCase())]), rechts: String(n), toon: 'zon' })
    : regel({ ik: 'zon', titel: t('inr.allesNagelopen'), zin: t('inr.allesNagelopenZin'), rechts: '✓', toon: 'mint' });
  const kan = regel({ tag: 'a', attrs: 'href="huis-kan.html"', ik: 'meter', titel: t('inr.kanTitel'), zin: t('inr.kanZin'), rechts: '›' });
  return {
    waar: t('inr.klaar'),
    kop: t('inr.klaarKop'),
    groot: true,
    uitleg: t('inr.klaarZin'),
    inhoud: `<div class="lijst">${nogTeDoen}${kan}</div>
      <button type="button" class="filmkaart" data-film aria-label="${esc(t('inr.filmLabel'))}"><span class="speel" aria-hidden="true"></span><span>${esc(t('inr.film'))}</span></button>
      ${tip(t('inr.daarna'))}`,
    voet: [`<a class="zachtknop" href="#${vorige('klaar')}">${esc(t('panelen.terug'))}</a>`, `<span class="rechts"><a class="zachtknop" href="thuis.html#rondleiding">${esc(t('rond.overslaan'))}</a><button type="button" class="knop knop-licht" data-film>${esc(t('inr.speelAf'))}</button></span>`],
  };
}

/*
 * Wat Volgende bewaart (besluit 158): wat in beeld staat, ook als de bewoner
 * niets aanraakte. Waar wat in beeld staat al geldt (meten, de regeling,
 * comfort, de zekering), hoeft er niets bewaard te worden. Lukt het niet, dan
 * blijft de stap staan en zegt de melding waarom.
 */
const BEVESTIG = {
  async woning() {
    const next = concept();
    if (!next || d.ind?.indeling?.woning) return true;
    next.woning = woningNu();
    return bewaarIndeling(next);
  },
  async huis() {
    return d.huis?.indeling === 'eigen' || bewaarIndeling(concept());
  },
  async buiten() {
    const next = concept();
    if (!next) return true;
    let anders = !d.huis?.rond;
    next.rond ??= huismodel.rondNu(d.huis);
    for (const k of next.kamers.filter((x) => x.etage === 'buiten' && !x.buiten)) {
      const b = buitenNu(k);
      k.buiten = { soort: b.soort, auto: !!b.auto, tuinhuis: !!b.tuinhuis };
      anders = true;
    }
    return !anders || bewaarIndeling(next);
  },
  async apparaten() {
    const next = concept();
    if (!next) return true;
    let anders = false;
    for (const el of document.querySelectorAll(`${app.zicht()} [data-plek]`)) {
      if (!el.value) continue;
      if (el.value === '-') next.verborgen = [...new Set([...(next.verborgen ?? []), el.dataset.plek])];
      else next.apparaten[el.dataset.plek] = { ...(next.apparaten[el.dataset.plek] ?? {}), kamer: el.value, zone: null };
      anders = true;
    }
    return !anders || bewaarIndeling(next);
  },
  // Wat elk apparaat kan (besluit 197): een voorgesteld bereik geldt pas als het bewaard is.
  async apparaat() {
    const next = concept();
    if (!next) return true;
    let anders = false;
    for (const { a, r } of kanToestellen()) {
      const b = kanBereik(a);
      if (!b.fout) continue;
      next.apparaten[sleutel(a)] = { ...(next.apparaten[sleutel(a)] ?? { kamer: r.id, zone: null }), bereik: [b.min, b.max] };
      anders = true;
    }
    return !anders || bewaarIndeling(next);
  },
  async prijzen() {
    if (d.energie?.instellingen || !d.energie?.voorstel) return true;
    const v = JSON.parse(JSON.stringify(d.energie.voorstel));
    const uit = await stuur('api/energie', { ...v, bron: v.bron ?? 'zelf' });
    if (uit) d.energie = { ...d.energie, instellingen: uit };
    return !!uit;
  },
  async functies() {
    return d.functies?.instellingen != null || !d.functies || bewaarFuncties(functiesNu());
  },
};

/* ------------------------------------------------------------ tekenen */

/** Lijsten die verder gaan dan de kaart, lopen zichtbaar uit (besluit 158). */
function markeerMeer() {
  $$('[data-kaart] .rijen').forEach((el) => {
    const zet = () => el.classList.toggle('meer', el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    el.onscroll = zet;
    zet();
  });
}

/** Welke stap er het laatst getekend is: binnen dezelfde stap blijft de lijst waar hij was. */
let getekend = null;
/** Onderaan (besluit 158 en 190): Terug, en rechts Later en Volgende. Later gaat door zonder te bewaren. */
const terugKnop = () => `<button type="button" class="zachtknop" data-terug>${esc(t('panelen.terug'))}</button>`;
const volgendeKnoppen = () => `<span class="rechts"><button type="button" class="zachtknop" data-later>${esc(t('inr.later'))}</button><button type="button" class="knop knop-licht" data-volgende>${esc(t('inr.volgende'))}</button></span>`;
/** De wand in het klein bij De wand: dit huis, zoals het nu getekend is. */
function tekenWandje(el, m) {
  huis.teken(el, { ...m, labels: [], etages: m.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: el.clientWidth || 200, hoogte: el.clientHeight || 120, marge: 0.06 });
}
function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const nu = stapNu();
  $$('[data-stappen]').forEach((el) => {
    // Acht hoofdstukken (besluit 190): de naam en een streepje per stap.
    el.innerHTML = HOOFDSTUKKEN.map(([titel, stappen], i) => {
      const hier = stappen.some(([id]) => id === nu);
      const klaar = stappen.every(([id]) => id === 'klaar' || nagelopen.has(id));
      // Drie standen (besluit 158): nagelopen is groen, al ingevuld uit Home Assistant omlijnd.
      const stipjes = stappen.map(([id]) => `<i class="${id === nu ? 'nu' : nagelopen.has(id) ? 'al' : gedaan(id) ? 'half' : ''}"></i>`).join('');
      const sub = stappen.map(([, naam], j) => (j ? naam.toLowerCase() : naam)).join(' · ');
      return `<a class="stap${hier ? ' nu' : ''}${klaar ? ' klaar' : ''}" href="#${stappen[0][0]}" ${hier ? 'aria-current="step"' : ''}><span class="n" aria-hidden="true">${klaar && !hier ? '✓' : i + 1}</span><span class="kort">${esc(titel)}</span><span class="naam">${i + 1}. ${esc(titel)}</span><span class="stipjes" aria-hidden="true">${stipjes}</span><span class="sub">${esc(sub)}</span></a>`;
    }).join('');
  });
  // Op de telefoon (schets Tel-Inrichten-3): bovenin het hoofdstuk en hoe ver je bent, een streepje per stap.
  const h = HOOFDSTUKKEN.findIndex(([, st]) => st.some(([x]) => x === nu));
  const i = STAPPEN.findIndex(([x]) => x === nu);
  $$('[data-telwaar]').forEach((el) => {
    el.innerHTML = h < 0 ? `<b>${esc(t('inr.welkom'))}</b><span>${esc(t('inr.telStappen', { n: STAPPEN.length }))}</span>` : `<b>${h + 1}. ${esc(HOOFDSTUKKEN[h][0])}</b><span>${esc(t('inr.stapVan', { i: i + 1, n: STAPPEN.length }))}</span>`;
  });
  $$('[data-voortgang]').forEach((el) => {
    el.innerHTML = STAPPEN.map(([id]) => `<i class="${id === nu ? 'nu' : nagelopen.has(id) ? 'al' : gedaan(id) ? 'half' : ''}"></i>`).join('');
  });
  const v = { welkom, woning: woningStap, huis: huisStap, buiten: buitenStap, bewoners: bewonersStap, apparaten: apparatenStap, meten: metenStap, warmte: warmteStap, apparaat: kanStap, comfort: comfortStap, afwezig: afwezigStap, zon: zonStap, ligging: liggingStap, zekering: zekeringStap, opzon: opzonStap, prijzen: prijzenStap, functies: functiesStap, wand: wandStap, ha: haStap, klaar: klaarStap }[nu]();
  // Onderaan overal hetzelfde (besluit 158): Terug, Later en Volgende, tenzij de stap iets anders zegt.
  const [links, rechts] = v.voet ?? [terugKnop(), volgendeKnoppen()];
  const actief = document.activeElement;
  // Niet onder de vinger opnieuw opbouwen terwijl iemand typt.
  if (actief && actief.matches?.('[data-kaart] input[type="text"], [data-kaart] input:not([type])') && actief.closest('[data-kaart]')) return;
  // Waar je was in de lijst blijft staan als er iets verandert (besluit 167): eerst sprong hij steeds naar boven.
  const zelfde = getekend === nu;
  getekend = nu;
  $$('[data-kaart]').forEach((el) => {
    const was = zelfde ? el.querySelector('.rijen')?.scrollTop ?? 0 : 0;
    el.innerHTML = `<span class="waar">${esc(v.waar)}</span>
      <h1 class="${v.groot ? 'kop-1' : 'kop-2'}" style="${v.groot ? 'font-size: 40px; line-height: 1.05' : ''}">${esc(v.kop)}</h1>
      <p class="uitleg">${esc(v.uitleg)}</p>
      ${v.inhoud}
      <span class="melding-inr${melding.fout ? ' fout' : ''}" data-melding>${esc(melding.tekst)}</span>
      <div class="voet">${links || '<span></span>'}${rechts}</div>`;
    const rijen = el.querySelector('.rijen');
    if (rijen && was) rijen.scrollTop = was;
  });
  markeerMeer();
  // Een kamer die open gaat, schuift in beeld.
  document.querySelector(`${app.zicht()} [data-kaart] .bewerk`)?.scrollIntoView({ block: 'nearest' });
  const m = model(nu);
  // Het grote welkom (besluit 200) over het hele scherm, zonder de stappen.
  const groot = nu === 'welkom' && !lijst;
  document.body.classList.toggle('inr-groot', groot);
  if (groot) {
    tekenWelkom(m);
    return;
  }
  // Wat elk apparaat kan (besluit 197): lijst en details naast elkaar, dus een bredere kaart.
  document.querySelector('#wand .veldje')?.classList.toggle('breed', nu === 'apparaat');
  // De kleine huisjes bij Wat voor huis, en de wand in het klein.
  document.querySelectorAll(`${app.zicht()} [data-kaart] [data-mini]`).forEach((el) => (el.dataset.mini === 'wand' ? tekenWandje(el, m) : tekenMini(el)));
  // Zo groot als het vak echt is (besluit 166): op een breder scherm is het vak breder. Het eiland van Thuis (besluit 190).
  const vak = document.querySelector('[data-podium="wand"]');
  // Bij Klopt je huis? zijn de kamers in het huis aan te tikken en te slepen (besluit 166).
  if (!app.telStand()) huis.teken(vak, m, { breedte: vak.clientWidth || 700, hoogte: vak.clientHeight || 640, meubels: true, marge: 0.04, zoom: 1, schuifY: 10, tik: nu === 'huis' });
  // Op de telefoon zonder namen in het kleine huis, zoals op Thuis.
  else huis.teken(document.querySelector('[data-podium="tel"]'), { ...m, etages: m.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: 390, hoogte: 250, marge: 0.03, zoom: 1 });
}
const teken = app.gebundeld(tekenNu);

/*
 * Slepen in het huis (besluit 166): bij Klopt je huis? pak je een kamer in de
 * tekening en laat je hem los op een andere kamer; hij neemt die plek in, ook
 * op een andere etage. Een tik zonder slepen opent de kamer in de lijst.
 */
{
  const vak = document.querySelector('[data-podium="wand"]');
  let sleep = null;
  const kamerOnder = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-podium="wand"] [data-kamer]') ?? null;
  const markeer = (el) => {
    vak.querySelectorAll('.sc-doel').forEach((x) => x.classList.remove('sc-doel'));
    el?.classList.add('sc-doel');
  };
  vak?.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-kamer]');
    if (stapNu() !== 'huis' || !el || !binnen().some((r) => r.id === el.dataset.kamer)) return;
    e.preventDefault();
    sleep = { id: el.dataset.kamer, x: e.clientX, y: e.clientY, bezig: false };
    el.classList.add('sc-gepakt');
  });
  document.addEventListener('pointermove', (e) => {
    if (!sleep) return;
    if (!sleep.bezig && Math.hypot(e.clientX - sleep.x, e.clientY - sleep.y) > 10) sleep.bezig = true;
    if (!sleep.bezig) return;
    const doel = kamerOnder(e.clientX, e.clientY);
    markeer(doel && doel.dataset.kamer !== sleep.id && binnen().some((r) => r.id === doel.dataset.kamer) ? doel : null);
  });
  const los = async (e) => {
    if (!sleep) return;
    const { id, bezig: gesleept } = sleep;
    sleep = null;
    vak.querySelectorAll('.sc-gepakt').forEach((x) => x.classList.remove('sc-gepakt'));
    markeer(null);
    if (!gesleept) {
      open = open === id ? null : id;
      weghalen = null;
      teken();
      return;
    }
    const doel = e.type === 'pointerup' ? kamerOnder(e.clientX, e.clientY)?.dataset.kamer : null;
    const next = concept();
    if (!doel || !next) return;
    const naam = next.kamers.find((x) => x.id === id)?.naam;
    if (verplaatsKamer(next, id, { doelId: doel })) {
      open = id;
      await bewaarIndeling(next, t('inr.nieuwePlek', { naam }));
    }
  };
  document.addEventListener('pointerup', los);
  document.addEventListener('pointercancel', los);
}

/* ------------------------------------------------------------ doen */

let bezig = false;
document.addEventListener('click', async (e) => {
  const el = e.target.closest('button, a');
  if (!el) return;
  if (el.hasAttribute('data-film')) {
    // Het filmpje (besluit 139), en daarna de rondleiding op Thuis.
    void film.speel({ opEinde: () => (location.href = 'thuis.html#rondleiding') });
    return;
  }
  if (el.hasAttribute('data-terug')) {
    naar(vorige(stapNu()));
    return;
  }
  if (el.hasAttribute('data-volgende')) {
    // Volgende bewaart wat er staat (besluit 158); twee keer tikken bewaart één keer.
    if (bezig) return;
    const nu = stapNu();
    bezig = true;
    el.disabled = true;
    try {
      if (BEVESTIG[nu] && !(await BEVESTIG[nu]())) return;
      markeer(nu);
      naar(volgende(nu));
    } finally {
      bezig = false;
      el.disabled = false;
    }
    return;
  }
  if (el.hasAttribute('data-later')) {
    // Later (besluit 190): door zonder te bewaren; de stap staat dan bij Nog te doen.
    naar(volgende(stapNu()));
    return;
  }
  if (el.dataset.woning || el.dataset.dak || el.dataset.schuur) {
    // Wat voor huis, en welk dak (besluit 190); in de tuin het tuinhuis of het schuurtje.
    const next = concept();
    if (!next) return;
    if (el.dataset.woning) next.woning = el.dataset.woning;
    if (el.dataset.dak) {
      const boven = (d.huis?.etages ?? []).find((e) => e.id !== 'buiten' && e.id !== 'kelder' && (e.ruimtes ?? []).length);
      if (el.dataset.dak === 'plat') next.dak = 'geen';
      else if (d.huis?.dakEtage || boven) next.dak = d.huis?.dakEtage ?? boven.id;
    }
    if (el.dataset.schuur) next.rond = { ...(next.rond ?? huismodel.rondNu(d.huis)), schuur: el.dataset.schuur === '1' };
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.kelder) {
    // Een kelder (besluit 190): erbij als kamer op de etage Kelder; weg kan alleen als er niets in staat.
    const next = concept();
    if (!next) return;
    const kelder = next.kamers.filter((k) => k.etage === 'kelder');
    if (el.dataset.kelder === 'ja') {
      if (kelder.length) return;
      const naam = t('inr.kelderNaam');
      next.kamers.push({ id: idVan(naam, new Set(next.kamers.map((k) => k.id))), naam, etage: 'kelder', soort: 'kelder', zones: [], regelzone: null, haGebied: null });
      await bewaarIndeling(next, t('indeling.toegevoegd', { naam }));
      return;
    }
    if (!kelder.length) return;
    const vol = kelder.some((k) => (binnen().find((r) => r.id === k.id)?.apparaten ?? []).length > 0 || Object.values(next.apparaten).some((a) => a.kamer === k.id));
    if (vol) return zeg(t('inr.kelderVol'), true);
    next.kamers = next.kamers.filter((k) => k.etage !== 'kelder');
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.zonderklimaat) {
    zonderKlimaat = el.dataset.zonderklimaat === '1';
    teken();
    return;
  }
  if (el.dataset.afw) {
    // Afwezig en vakantie (besluit 190): een halve graad per tik, met een graad tussen verwarmen en koelen.
    const [m, s, stap] = el.dataset.afw.split(':');
    const b = JSON.parse(JSON.stringify(afwezigKeuze ?? afwezigBasis()));
    const grens = s === 'heat' ? [5, 28] : [16, 32];
    b[m][s] = Math.min(grens[1], Math.max(grens[0], b[m][s] + Number(stap)));
    if (s === 'heat' && b[m].cool < b[m].heat + 1) b[m].cool = b[m].heat + 1;
    if (s === 'cool' && b[m].heat > b[m].cool - 1) b[m].heat = b[m].cool - 1;
    afwezigKeuze = b;
    await bewaarAfwezig();
    return;
  }
  if (el.dataset.opzon || el.dataset.opzonVast) {
    // Op zon (besluit 167): aan start hij als er zon over is.
    const a = antwoorden();
    const aan = el.getAttribute('aria-checked') !== 'true';
    if (el.dataset.opzon) a.opZon[el.dataset.opzon] = aan;
    else a.opZonUit = aan ? a.opZonUit.filter((x) => x !== el.dataset.opzonVast) : [...new Set([...a.opZonUit, el.dataset.opzonVast])];
    await bewaarAansluiting(a);
    return;
  }
  if (el.dataset.wkaart) {
    // De kaarten op de wand (besluit 190): dezelfde indeling als op je telefoon.
    const nu = d.voork?.wand?.kaarten ?? [];
    const k = el.dataset.wkaart;
    const kaarten = nu.includes(k) ? nu.filter((x) => x !== k) : [...nu, k];
    if (kaarten.length) await bewaarVoorkeur({ plek: 'wand', kaarten });
    return;
  }
  if (el.hasAttribute('data-wnacht')) {
    await bewaarVoorkeur({ plek: 'wand', niemand: { nacht: d.voork?.wand?.niemand?.nacht !== true } });
    return;
  }
  if (el.dataset.wtaal) {
    // Een andere taal laadt de pagina opnieuw (taal.js).
    const uit = await bewaarVoorkeur({ plek: 'tel', taal: el.dataset.wtaal });
    if (uit) taal.zetKeuze(uit.tel.taal, { scherm: uit.scherm === true });
    return;
  }
  if (el.dataset.haPad) {
    app.naarHAScherm(el.dataset.haPad);
    return;
  }
  // Hoe de panelen liggen (besluit 157); Klopt telt als nagelopen en gaat door.
  if (Object.keys(el.dataset).some((k) => k.startsWith('lig'))) {
    const a = antwoorden();
    const klopt = el.hasAttribute('data-lig-klopt');
    const wat = ligging.klik(el, d.aans?.ligging, a, ligStaat);
    if (wat === 'bewaar') await bewaarAansluiting(a);
    else if (wat === 'teken') teken();
    if (klopt && d.aans?.ligging?.stand === 'bevestigd') {
      markeer('ligging');
      naar(volgende('ligging'));
    }
    return;
  }
  if (el.dataset.lijst !== undefined) {
    lijst = el.dataset.lijst || null;
    teken();
    return;
  }
  if (el.dataset.sopt) {
    const s = (d.bewoners?.schermen ?? []).find((x) => x.id === el.dataset.scherm);
    if (!s) return;
    const aan = !(s.opties?.[el.dataset.sopt] === true);
    await stuurBewoner({ actie: 'schermOpties', id: s.id, opties: { [el.dataset.sopt]: aan } }, t(aan ? 'inr.schermAan' : 'inr.schermUit', { naam: s.naam }));
    return;
  }
  if (el.dataset.bewoner) {
    openBewoner = openBewoner === el.dataset.bewoner ? null : el.dataset.bewoner;
    teken();
    return;
  }
  if (el.dataset.bvolg && openBewoner) {
    const v = (d.bewoners?.bewoners ?? []).map((x) => x.id);
    const i = v.indexOf(openBewoner);
    const j = i + Number(el.dataset.bvolg);
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    await stuurBewoner({ actie: 'volgorde', volgorde: v });
    return;
  }
  if (el.hasAttribute('data-bhoofd') && openBewoner) {
    await stuurBewoner({ actie: 'hoofd', id: openBewoner });
    return;
  }
  if (el.dataset.bcomfort && openBewoner) {
    await stuurBewoner({ actie: 'comfort', id: openBewoner, comfort: el.dataset.bcomfort });
    return;
  }
  if (el.dataset.apparaat) {
    openApparaat = openApparaat === el.dataset.apparaat ? null : el.dataset.apparaat;
    teken();
    return;
  }
  if (el.dataset.verberg) {
    const next = concept();
    if (!next) return;
    const id = el.dataset.verberg;
    const naam = [...(d.huis?.zonderRuimte ?? []), ...(d.huis?.etages ?? []).flatMap((x) => x.ruimtes ?? []).flatMap((r) => r.apparaten ?? [])].find((a) => a.id === id)?.naam ?? t('indeling.hetApparaat');
    next.verborgen = [...new Set([...(next.verborgen ?? []), id])];
    openApparaat = null;
    await bewaarIndeling(next, t('indeling.naamWeg', { naam }));
    return;
  }
  if (el.dataset.kamer) {
    open = open === el.dataset.kamer ? null : el.dataset.kamer;
    weghalen = null;
    teken();
    return;
  }
  if (el.hasAttribute('data-nieuw')) {
    open = 'nieuw';
    teken();
    setTimeout(() => document.querySelector(`${app.zicht()} [data-nieuwnaam]`)?.focus(), 50);
    return;
  }
  if (el.hasAttribute('data-voegtoe')) {
    const naam = document.querySelector(`${app.zicht()} [data-nieuwnaam]`)?.value.trim();
    if (!naam) return;
    const next = concept();
    const id = idVan(naam, new Set(next.kamers.map((k) => k.id)));
    next.kamers.push({ id, naam, etage: document.querySelector(`${app.zicht()} [data-nieuwetage]`)?.value || 'bg', zones: [], regelzone: null, haGebied: null });
    open = null;
    await bewaarIndeling(next, t('indeling.toegevoegd', { naam }));
    return;
  }
  if (el.dataset.kamerweg) {
    // Twee tikken: de eerste vraagt het nog eens.
    if (weghalen !== el.dataset.kamerweg) {
      weghalen = el.dataset.kamerweg;
      teken();
      return;
    }
    const next = concept();
    const k = next.kamers.find((x) => x.id === weghalen);
    if (!k) return;
    next.kamers = next.kamers.filter((x) => x.id !== k.id);
    // Wat in deze kamer stond, gaat naar "nog in te delen", net als bij Indeling.
    for (const [id, a] of Object.entries(next.apparaten)) if (a.kamer === k.id) delete next.apparaten[id];
    for (const x of next.kamers) if (x.meedoenMet === k.id) delete x.meedoenMet;
    open = null;
    weghalen = null;
    await bewaarIndeling(next, t('indeling.naamWeg', { naam: k.naam }));
    return;
  }
  if (el.dataset.schuifkamer) {
    const next = concept();
    if (next && verplaatsKamer(next, open, { stap: Number(el.dataset.schuifkamer) })) await bewaarIndeling(next);
    return;
  }
  if (el.dataset.zoneweg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === open);
    const z = k?.zones.find((x) => x.id === el.dataset.zoneweg);
    if (!z) return;
    k.zones = k.zones.filter((x) => x.id !== z.id);
    for (const a of Object.values(next.apparaten)) if (a.kamer === k.id && a.zone === z.id) a.zone = null;
    await bewaarIndeling(next, t('indeling.zoneWeg', { naam: z.naam }));
    return;
  }
  if (el.dataset.erbij) {
    toevoegenIn = el.dataset.erbij;
    toevoeg = null;
    teken();
    return;
  }
  // Iets toevoegen (besluit 167): wat er hangt, hoe het aangaat, en bewaren.
  if (el.dataset.toevoegSoort) {
    toevoeg = { soort: el.dataset.toevoegSoort, aan: null, apparaat: null };
    teken();
    return;
  }
  if (el.dataset.toevoegAan && toevoeg) {
    toevoeg = { ...toevoeg, aan: el.dataset.toevoegAan, apparaat: null };
    teken();
    return;
  }
  if (el.hasAttribute('data-toevoeg-annuleer')) {
    toevoegenIn = null;
    toevoeg = null;
    teken();
    return;
  }
  if (el.hasAttribute('data-toevoeg-bewaar') && toevoeg && toevoegenIn) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === toevoegenIn);
    if (!k) return;
    const v = toevoeg;
    const cv = v.soort === 'radiator' || v.soort === 'vloer';
    const ketel = huismodel.cvThermostaat(d.huis, antwoorden().verwarming);
    const soorten = [v.soort];
    const bezet = new Set((k.bronnen ?? []).map((x) => x.id));
    let id = v.soort;
    for (let i = 2; bezet.has(id); i++) id = `${v.soort}-${i}`;
    const b = { id, soorten, aan: v.aan };
    if (cv && v.aan === 'thermostaat') {
      if (ketel) b.apparaat = ketel.sleutel;
    } else if (v.aan !== 'hand' && v.apparaat) b.apparaat = v.apparaat;
    k.bronnen = [...(k.bronnen ?? []), b];
    toevoegenIn = null;
    toevoeg = null;
    await bewaarIndeling(next, t('inr.toegevoegdBij', { naam: huismodel.bronNaam(b), kamer: k.naam }));
    return;
  }
  if (el.dataset.nacht) {
    comfortKeuze = { ...comfortNu(), nacht: el.dataset.nacht };
    await bewaarComfort();
    return;
  }
  if (el.hasAttribute('data-ookeigen')) {
    ookEigen = !ookEigen;
    if (ookEigen) await bewaarComfort();
    else teken();
    return;
  }
  if (el.dataset.kanOpen) {
    // Wat elk apparaat kan: een ander apparaat open; op de telefoon dicht als het al open was.
    kanOpen = app.telStand() && kanOpen === el.dataset.kanOpen ? null : el.dataset.kanOpen;
    teken();
    return;
  }
  if (el.hasAttribute('data-kan-mist')) {
    // Iets toevoegen kan bij Verwarmen en koelen, per kamer.
    naar('warmte');
    return;
  }
  if (el.dataset.kanWarmte) {
    const key = el.dataset.kanWarmte;
    const x = kanToestellen().find(({ a }) => sleutel(a) === key);
    const next = concept();
    if (!x || !next) return;
    next.apparaten[key] = { ...(next.apparaten[key] ?? { kamer: x.r.id, zone: null }), warmte: el.dataset.waarde };
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.rolwaarde) {
    // Wat de regeling met een apparaat doet (besluit 138), met de knoppen van de schets.
    const seg = el.closest('[data-rol]');
    const next = concept();
    const k = next?.kamers.find((x) => x.id === seg.dataset.rolkamer);
    const r = binnen().find((x) => x.id === seg.dataset.rolkamer);
    if (!k || !r) return;
    const rollen = Object.fromEntries(klimaatIn(r).map((a) => [sleutel(a), rolVan(k, r, sleutel(a))]));
    k.rollen = { ...(k.rollen ?? {}), ...rollen, [seg.dataset.rol]: el.dataset.rolwaarde };
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.fasen) {
    const a = antwoorden();
    const fasen = Number(el.dataset.fasen);
    const oud = a.zekering && a.zekering !== 'weetniet' ? a.zekering.ampere : null;
    a.zekering = { fasen, ampere: oud ?? (fasen === 1 ? 35 : 25) };
    await bewaarAansluiting(a);
    return;
  }
  if (el.dataset.zekering) {
    const a = antwoorden();
    a.zekering = 'weetniet';
    await bewaarAansluiting(a);
    return;
  }
  if (el.dataset.verwarming) {
    const a = antwoorden();
    a.verwarming = { ...a.verwarming, soort: el.dataset.verwarming };
    await bewaarAansluiting(a);
    return;
  }
  if (el.dataset.panelen) {
    const a = antwoorden();
    if (el.dataset.panelen === 'geen') {
      panelenJa = false;
      a.panelen = { ligging: 'geen', aantal: null, voorkant: null, achterkant: null };
      await bewaarAansluiting(a);
    } else {
      panelenJa = true;
      // Van "geen" terug naar ja: de kant is weer open.
      if (a.panelen.ligging === 'geen') {
        a.panelen = { ...a.panelen, ligging: null };
        await bewaarAansluiting(a);
      } else teken();
    }
    return;
  }
  if (el.dataset.dakkant) {
    const a = antwoorden();
    a.panelen = { ...a.panelen, ligging: el.dataset.dakkant };
    await bewaarAansluiting(a);
    return;
  }
  if (el.dataset.contract) {
    // Het soort contract (besluit 158): één tarief laat het daltarief vallen.
    contractKeuze = el.dataset.contract;
    const a = antwoorden();
    const tarief = contractKeuze === 'dynamisch' ? 'dynamisch' : 'vast';
    if (a.tarief !== tarief) {
      a.tarief = tarief;
      await bewaarAansluiting(a);
    }
    if (contractKeuze !== 'dagnacht' && energieNu()?.prijzen?.stroomDal != null) await bewaarPrijzen({ stroomDal: null });
    else teken();
    return;
  }
  if (el.dataset.rond) {
    // Wat er rond het huis is (besluit 158): elk deel apart aan of uit.
    const next = concept();
    if (!next) return;
    const rond = { ...(next.rond ?? huismodel.rondNu(d.huis)) };
    const w = el.dataset.rond;
    rond[w] = !rond[w];
    if (w === 'oprit' && !rond.oprit) {
      rond.auto = false;
      rond.carport = false;
    }
    next.rond = rond;
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.meet) {
    // Meten met (besluit 123): een thermometer aan of uit voor deze kamer.
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.meetkamer);
    if (!k) return;
    const lijst = new Set(k.meten ?? []);
    if (lijst.has(el.dataset.meet)) lijst.delete(el.dataset.meet);
    else lijst.add(el.dataset.meet);
    if (lijst.size) k.meten = [...lijst].slice(0, 6);
    else delete k.meten;
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.flicht || el.dataset.fscherm || el.dataset.fcam || el.dataset.fpraat) {
    const c = functiesNu();
    if (!c) return;
    if (el.dataset.flicht) c.licht = { ...c.licht, bedienen: el.dataset.flicht === 'true' };
    if (el.dataset.fscherm) c.schermen = { ...c.schermen, bedienen: el.dataset.fscherm === 'true' };
    if (el.dataset.fcam) c.cameras = { ...c.cameras, aan: el.dataset.fcam === 'true' };
    if (el.dataset.fpraat) c.praten = { ...c.praten, bedienen: el.dataset.fpraat === 'true' };
    await bewaarFuncties(c);
  }
});

document.addEventListener('change', async (e) => {
  if (ligging.verander(e.target, ligStaat)) return teken();
  const el = e.target;
  const kamerNu = (next) => next?.kamers.find((x) => x.id === open);
  if (el.dataset.kanBereik) {
    // Wat elk apparaat kan: het bereik dat de regeling aanhoudt; de laagste blijft onder de hoogste.
    const key = el.dataset.kanBereik;
    const x = kanToestellen().find(({ a }) => sleutel(a) === key);
    const next = concept();
    if (!x || !next) return;
    const b = kanBereik(x.a);
    let [lo, hi] = [b.min, b.max];
    if (el.dataset.kant === 'min') lo = Number(el.value);
    else hi = Number(el.value);
    if (lo >= hi) return void zeg(t('inr.kan.laagOnderHoog'), true);
    next.apparaten[key] = { ...(next.apparaten[key] ?? { kamer: x.r.id, zone: null }), bereik: [lo, hi] };
    await bewaarIndeling(next);
    return;
  }
  if (el.dataset.naam) {
    const v = el.value.trim();
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.naam);
    if (!k || !v || v === k.naam) return;
    k.naam = v;
    el.blur();
    await bewaarIndeling(next, t('indeling.naamBewaard'));
  } else if (el.dataset.etage) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.etage);
    if (!k) return;
    k.etage = el.value;
    if (el.value === 'buiten') open = null;
    await bewaarIndeling(next, t('indeling.staatOp', { naam: k.naam, etage: el.selectedOptions[0]?.textContent ?? t('inr.andereEtage') }));
  } else if (el.dataset.soort) {
    // Wat voor kamer (besluit 119); leeg is weer het voorstel uit de naam.
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.soort);
    if (!k) return;
    if (el.value) k.soort = el.value;
    else delete k.soort;
    await bewaarIndeling(next, t('indeling.soortBewaard'));
  } else if (el.dataset.zonenaam) {
    const next = concept();
    const z = kamerNu(next)?.zones.find((x) => x.id === el.dataset.zonenaam);
    const v = el.value.trim();
    if (!z || !v || z.naam === v) return;
    z.naam = v;
    await bewaarIndeling(next, t('indeling.zoneHeet', { naam: v }));
  } else if (el.dataset.zonesoort) {
    const next = concept();
    const z = kamerNu(next)?.zones.find((x) => x.id === el.dataset.zonesoort);
    if (!z) return;
    if (el.value) z.soort = el.value;
    else delete z.soort;
    await bewaarIndeling(next, t('indeling.zoneBewaard', { naam: z.naam }));
  } else if (el.hasAttribute('data-nieuwezone')) {
    const next = concept();
    const k = kamerNu(next);
    const v = el.value.trim();
    if (!k || !v) return;
    const bezet = new Set(next.kamers.flatMap((x) => x.zones.map((z) => z.id)));
    // De eerste zone: de kamer zelf wordt het eerste deel, zodat er twee zijn.
    if (!k.zones.length) {
      const eigen = { id: idVan(k.naam, bezet), naam: k.naam };
      bezet.add(eigen.id);
      k.zones.push(eigen);
    }
    k.zones.push({ id: idVan(v, bezet), naam: v });
    await bewaarIndeling(next, t('indeling.zoneErbij', { naam: v }));
  } else if (el.dataset.samen) {
    if (!el.value) return;
    const next = concept();
    const doel = next.kamers.find((x) => x.id === el.value)?.naam;
    const fout = samenvoegen(next, el.dataset.samen, el.value);
    if (fout) {
      el.value = '';
      zeg(fout, true);
      return;
    }
    await bewaarIndeling(next, t('inr.zoneVan', { naam: doel, kamer: next.kamers.find((x) => x.id === el.dataset.samen)?.naam ?? '' }));
  } else if (el.dataset.bnaam) {
    const naam = el.value.trim();
    const x = (d.bewoners?.bewoners ?? []).find((y) => y.id === el.dataset.bnaam);
    if (naam && x && naam !== x.naam) await stuurBewoner({ actie: 'naam', id: x.id, naam });
  } else if (el.dataset.bbron !== undefined) {
    await stuurBewoner({ actie: 'aanwezigheid', id: el.dataset.bbron, bron: el.value || null });
  } else if (el.dataset.verplaats) {
    // Een apparaat naar een andere kamer (besluit 166).
    const next = concept();
    const doel = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((r) => r.id === el.value);
    if (!next || !doel) return;
    next.apparaten[el.dataset.verplaats] = { ...(next.apparaten[el.dataset.verplaats] ?? {}), kamer: doel.id, zone: null };
    openApparaat = null;
    await bewaarIndeling(next, t('inr.staatIn', { naam: doel.naam }));
  } else if (el.dataset.bkoppel) {
    // Welke ruimte uit Home Assistant bij een deel buiten hoort (besluit 166).
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.value);
    if (!k) return;
    const b = buitenNu(k);
    k.buiten = { soort: el.dataset.bkoppel, auto: !!b.auto, tuinhuis: !!b.tuinhuis };
    next.rond = huismodel.rondMet(next.rond, el.dataset.bkoppel);
    await bewaarIndeling(next, t('inr.hoortBij', { naam: k.naam, deel: RONDOM.find(([, , s]) => s === el.dataset.bkoppel)?.[1].toLowerCase() ?? el.dataset.bkoppel }));
  } else if (el.dataset.plek) {
    const next = concept();
    if (!next || !el.value) return;
    if (el.value === '-') next.verborgen = [...new Set([...(next.verborgen ?? []), el.dataset.plek])];
    else next.apparaten[el.dataset.plek] = { ...(next.apparaten[el.dataset.plek] ?? {}), kamer: el.value, zone: null };
    await bewaarIndeling(next);
  } else if (el.hasAttribute('data-ampere') && el.value) {
    const a = antwoorden();
    if (!a.zekering || a.zekering === 'weetniet') return;
    a.zekering = { ...a.zekering, ampere: Number(el.value) };
    await bewaarAansluiting(a);
  } else if (el.hasAttribute('data-inr-thermostaat')) {
    const a = antwoorden();
    a.verwarming = { ...a.verwarming, thermostaat: el.value || null };
    await bewaarAansluiting(a);
  } else if (el.hasAttribute('data-toevoeg-apparaat') && toevoeg) {
    toevoeg = { ...toevoeg, apparaat: el.value || null };
    teken();
  } else if (el.dataset.toevoegen) {

    const key = el.value;
    if (!key) return;
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.toevoegen);
    const r = binnen().find((x) => x.id === el.dataset.toevoegen);
    if (!k || !r) return;
    // Een airco helpt op zon; de eerste verwarming houdt de kamer op temperatuur, een tweede kijkt mee.
    const toestel = binnen().flatMap(klimaatIn).find((a) => sleutel(a) === key);
    const rollen = Object.fromEntries(klimaatIn(r).map((a) => [sleutel(a), rolVan(k, r, sleutel(a))]));
    const rol = toestel?.klimaat?.kanKoelen ? 'zon' : Object.values(rollen).includes('houdt') ? 'kijken' : 'houdt';
    for (const x of next.kamers) if (x.id !== k.id && x.rollen && key in x.rollen) delete x.rollen[key];
    k.rollen = { ...(k.rollen ?? {}), ...rollen, [key]: rol };
    next.apparaten[key] = { ...(next.apparaten[key] ?? {}), kamer: k.id, zone: null };
    toevoegenIn = null;
    await bewaarIndeling(next);
  } else if (el.dataset.comfort) {
    const c = { ...comfortNu() };
    c[el.dataset.comfort] = Number(el.value);
    // Tussen verwarmen en koelen minstens een graad.
    if (el.dataset.comfort === 'warm' && c.koel < c.warm + 1) c.koel = c.warm + 1;
    if (el.dataset.comfort === 'koel' && c.warm > c.koel - 1) c.warm = c.koel - 1;
    comfortKeuze = c;
    await bewaarComfort();
  } else if (el.hasAttribute('data-dagvan') || el.hasAttribute('data-dagtot')) {
    comfortKeuze = { ...comfortNu(), [el.hasAttribute('data-dagvan') ? 'dag' : 'avond']: Number(el.value) };
    await bewaarComfort();
  } else if (el.dataset.elders) {
    // Panelen op een ander dak (besluit 187); leeg of 0 is geen.
    const v = el.value.trim();
    const n = v === '' ? 0 : Number(v);
    if (!(Number.isInteger(n) && n >= 0 && n <= 200)) return zeg(t('inr.aantal200'), true);
    el.blur();
    const a = antwoorden();
    if (n) a.elders[el.dataset.elders] = n;
    else delete a.elders[el.dataset.elders];
    await bewaarAansluiting(a);
  } else if (el.dataset.aantal) {
    const v = el.value.trim();
    const n = v === '' ? null : Number(v);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 200)) return zeg(t('inr.aantal200'), true);
    el.blur();
    const a = antwoorden();
    a.panelen = { ...a.panelen, [el.dataset.aantal]: n };
    await bewaarAansluiting(a);
  } else if (el.dataset.prijs) {
    const v = el.value.trim().replace(',', '.');
    const n = v === '' ? null : Number(v);
    const max = el.dataset.eenheid === 'm³' ? 5 : 2;
    if (n != null && !(n >= 0 && n < max)) return zeg(el.dataset.eenheid === 'm³' ? t('inr.prijsM3', { voorbeeld: nl(1.35, 2) }) : t('inr.prijsKwh', { voorbeeld: nl(0.25, 2) }), true);
    el.blur();
    await bewaarPrijzen({ [el.dataset.prijs]: n });
  } else if (el.dataset.meedoen) {
    // Meedoen met een andere kamer (besluit 142).
    const next = concept();
    const k = next?.kamers.find((x) => x.id === el.dataset.meedoen);
    if (!k) return;
    delete k.meedoenMet;
    if (el.value) {
      k.meedoenMet = el.value;
      k.regelzone = null;
    }
    await bewaarIndeling(next);
  }
});

// De schuif laat het getal meteen zien; bewaren gebeurt bij loslaten.
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset?.comfort) return;
  const b = el.closest('.schuif')?.querySelector('b');
  if (b) b.textContent = `${nl(Number(el.value))}°`;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.matches?.('[data-nieuwnaam]')) document.querySelector(`${app.zicht()} [data-voegtoe]`)?.click();
  else if (e.target.matches?.('[data-naam], [data-bnaam], [data-prijs], [data-aantal], [data-elders], [data-zonenaam], [data-nieuwezone]')) e.target.blur();
});

addEventListener('standwissel', teken);
addEventListener('hashchange', () => {
  open = null;
  weghalen = null;
  ligStaat.aanpassen = false;
  toevoegenIn = null;
  afwezigKeuze = null;
  if (stapNu() !== 'welkom') lijst = null;
  zeg('');
  teken();
  // Klaarzetten: opnieuw kijken, want de bewoner kan net in Home Assistant iets hebben gedaan.
  if (stapNu() === 'ha' || stapNu() === 'klaar') {
    haal('api/klaarzetten').then((x) => {
      d.klaar = x;
      teken();
    }).catch(() => {});
  }
});

app.start('instellingen');
void laad();
