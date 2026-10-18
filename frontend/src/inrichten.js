/*
 * Inrichten in één keer (besluit 139 en 144, schets Wand-Inrichten-Compleet).
 * Zes hoofdstukken op één pagina, zonder menu, met kleine stappen erin: je huis
 * en buiten, de apparaten en waarmee een kamer meet, wat elk apparaat doet en
 * comfort, de panelen, de zekering en de prijzen, licht en camera's en de wand,
 * en dan de film. Na Inrichten is de app af. Links groeit het huis mee, rechts
 * staat één vraag. Wat Home Assistant al weet, staat klaar; de bewoner kijkt of
 * het klopt.
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

const d = { huis: null, ind: null, comfort: null, aans: null, energie: null, zon: null, functies: null, sessie: null, bewoners: null };

async function laad() {
  const namen = ['huis', 'ind', 'comfort', 'aans', 'energie', 'zon', 'functies', 'sessie', 'bewoners'];
  const uit = await Promise.allSettled(['api/huis', 'api/indeling', 'api/comfort', 'api/aansluiting', 'api/energie', 'api/zon', 'api/functies', 'api/sessie', 'api/bewoners'].map((p) => haal(p)));
  uit.forEach((r, i) => {
    if (r.status === 'fulfilled') d[namen[i]] = r.value;
  });
  teken();
}

/* ------------------------------------------------------------ de stappen */

/** Zes hoofdstukken, elk met kleine stappen (besluit 144). */
const HOOFDSTUKKEN = [
  ['Je huis', [['huis', 'Kamers en etages'], ['buiten', 'Buiten'], ['bewoners', 'Wie woont hier']]],
  ['Apparaten', [['apparaten', 'Per kamer'], ['meten', 'Meten met']]],
  ['Klimaat', [['warmte', 'Wat elk apparaat doet'], ['comfort', 'Comfort']]],
  ['Energie', [['zon', 'Panelen'], ['ligging', 'Hoe ze liggen'], ['zekering', 'Zekering'], ['prijzen', 'Prijzen en meters']]],
  ['Gemak', [['functies', "Licht en camera's"], ['wand', 'De wand']]],
];
const STAPPEN = HOOFDSTUKKEN.flatMap(([, stappen]) => stappen);
const ALLE = ['welkom', ...STAPPEN.map(([id]) => id), 'klaar'];
/** "Hoofdstuk 2 · Meten met". */
function waarVan(id) {
  const h = HOOFDSTUKKEN.findIndex(([, st]) => st.some(([x]) => x === id));
  const stap = STAPPEN.find(([x]) => x === id);
  return h < 0 ? '' : `${h + 1}. ${HOOFDSTUKKEN[h][0]} · ${stap[1]}`;
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
  if (id === 'huis') return d.huis?.indeling === 'eigen';
  if (id === 'apparaten') return d.huis != null && (d.huis.zonderRuimte ?? []).length === 0;
  if (id === 'warmte') return binnen().some((r) => klimaatIn(r).some((a) => a.klimaat?.rol && a.klimaat.rol !== 'kijken'));
  if (id === 'comfort') return (d.comfort?.kamers ?? []).some((k) => k.uitApp);
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
  zeg('Bewaren…');
  let res;
  try {
    res = await deur(pad, body);
  } catch {
    zeg('Niet bewaard: geen verbinding met Smart Climate', true);
    return null;
  }
  if (res === null) return null;
  const uit = await res.json().catch(() => ({}));
  if (!res.ok) {
    zeg(res.status === 403 ? 'Alleen de beheerder kan dit bewaren' : (uit.fout ?? 'Niet bewaard'), true);
    return null;
  }
  zeg('Bewaard');
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

/** Het huis zoals het nu is, voor links: elke stap laat meer zien. */
function model(stap) {
  const i = ALLE.indexOf(stap);
  // De tekening uit huismodel, net als op Thuis (5S); elke stap laat meer zien.
  const a = antwoorden();
  const t = huismodel.tekening(d.huis, {
    zon: d.zon,
    kamer: (r) => {
      const k = huismodel.kamerModel(r, null);
      // Pas vanaf de apparaten staan ze erin; bij comfort en verder de temperatuur.
      if (i < ALLE.indexOf('apparaten')) k.apparaten = [];
      if (i < ALLE.indexOf('comfort')) k.temp = null;
      if (stap === 'comfort' && r.zoneId) k.stand = 'goed';
      return k;
    },
  });
  const { etages, oprit, tuin, terras, balkon, voortuin, garage } = t;
  const metZon = i >= ALLE.indexOf('zon');
  // Zoals op Thuis (besluit 166): het aantal dat je opgaf, per kant bij beide kanten.
  const opDak = metZon ? huismodel.panelenOpDak(a.panelen, t.piekW) : { panelen: 0, panelenLinks: 0 };
  return {
    beschrijving: 'Je huis, zoals Smart Climate het nu kent.',
    tijd: app.tijdVanDeDag(d.zon),
    wolken: 0.3,
    zon: { stand: d.zon?.dag?.fractie ?? 0.4, hoogte: d.zon?.dag?.hoogteDeel ?? 0.6, aandeel: metZon ? 0.6 : 0.2, ...opDak },
    etages,
    voordeur: t.voordeur,
    buitenunit: i >= ALLE.indexOf('apparaten') && t.buitenunit ? { ...t.buitenunit, aan: false } : null,
    net: true,
    oprit,
    tuin,
    terras,
    balkon,
    voortuin,
    garage,
    stromen: [],
    // Hoe ze liggen (besluit 157): op de panelen, zoals de schets.
    labels: stap === 'ligging' && d.aans?.ligging?.nu ? [{ bij: 'panelen', titel: d.aans.ligging.nu.richting, toon: 'zon', regels: [`${Math.round(d.aans.ligging.nu.hellingDeg / 5) * 5}° · ${(d.aans.ligging.nu.peakW / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kWp`], dx: -40, dy: -60 }] : [],
  };
}

/* ------------------------------------------------------------ de vragen */

const knop = (attrs, tekst, aan = false, klasse = '') => `<button type="button" class="chip${aan ? ' aan' : ''}${klasse ? ` ${klasse}` : ''}" ${attrs} aria-pressed="${aan}">${esc(tekst)}</button>`;
const rij = (kop, inhoud, extra = '') => `<div class="rij"><b>${esc(kop)}</b><div class="chips">${inhoud}</div>${extra}</div>`;
const meervoud = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;
/** "a, b en c". */
const lijstje = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} en ${xs.at(-1)}` : xs.join(''));
const schakel = (attr, tekst, aan, uit = false) => `<button type="button" class="schakelrij" role="switch" aria-checked="${aan}" ${attr} ${uit ? 'disabled' : ''}><span>${esc(tekst)}</span><i aria-hidden="true"></i></button>`;

/* Het startscherm (besluit 158): de getallen tikken open tot een lijst. */
let lijst = null; // 'etages', 'kamers', 'apparaten', 'klimaat' of null
function tellingen() {
  const etages = (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten' && (e.ruimtes ?? []).some((r) => !huismodel.isBuiten(e, r))).length;
  // Apparaten en wat verwarmt of koelt apart (besluit 166): niets telt twee keer.
  const apparaten = [...(d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []), ...(d.huis?.zonderRuimte ?? [])].filter((a) => a.soort !== 'klimaat').length;
  return { etages, kamers: binnen().length, buiten: buitenRuimtes().length, apparaten, klimaat: binnen().flatMap(klimaatIn).length };
}
function welkom() {
  if (lijst) return welkomLijst();
  const n = tellingen();
  const vak = (soort, getal, tekst) => `<button type="button" class="vak" data-lijst="${soort}"><b>${getal}</b><span>${esc(tekst)}</span><i aria-hidden="true">›</i></button>`;
  return {
    waar: 'Welkom',
    kop: 'Laten we je huis neerzetten',
    groot: true,
    uitleg: 'Smart Climate vond je Home Assistant. Wat het daar al weet, staat klaar; jij kijkt of het klopt. Het duurt ongeveer tien minuten.',
    inhoud: d.huis
      ? `<div class="cijfers">${vak('etages', n.etages, `${n.etages === 1 ? 'etage' : 'etages'}${n.buiten ? ', en buiten' : ''}`)}${vak('kamers', n.kamers, `${n.kamers === 1 ? 'kamer' : 'kamers'}${n.buiten ? `, en ${n.buiten} buiten` : ''}`)}${vak('apparaten', n.apparaten, 'apparaten')}${vak('klimaat', n.klimaat, 'om te verwarmen of koelen')}</div>
         <div class="noot">Tik op een getal voor de lijst. Bovenaan is groen nagelopen; omlijnd komt al uit Home Assistant.</div>`
      : '<p class="zacht">Even het huis lezen uit Home Assistant…</p>',
    voet: ['', '<a class="knop knop-licht" href="#huis">Begin</a>'],
  };
}
/**
 * Een apparaat dat je weghaalt, staat daarna bij Indeling onder Verborgen. Wat
 * verwarmt of koelt, staat in een eigen lijst (besluit 166): dat hoort bij de
 * regeling, en heeft geen ×.
 */
const wegChip = (a) => `<button type="button" class="chip weg" data-verberg="${esc(a.id)}" aria-label="${esc(a.naam)} weghalen">${esc(a.naam)}<span aria-hidden="true">×</span></button>`;
const geenKlimaat = (lijst) => (lijst ?? []).filter((a) => a.soort !== 'klimaat');
function welkomLijst() {
  const n = tellingen();
  const perEtage = (d.huis?.etages ?? []).filter((e) => (e.ruimtes ?? []).length);
  let kop = '';
  let uitleg = '';
  let rijen = [];
  if (lijst === 'etages' || lijst === 'kamers') {
    kop = lijst === 'etages' ? meervoud(n.etages, 'etage', 'etages') : meervoud(n.kamers, 'kamer', 'kamers');
    uitleg = 'Zoals Home Assistant ze kent. Namen, etages en zones verander je in de volgende stap.';
    rijen = perEtage.map((e) => rij(e.naam, (e.ruimtes ?? []).map((r) => `<span class="chip stil">${esc(r.naam)}</span>`).join('')));
  } else if (lijst === 'apparaten') {
    kop = meervoud(n.apparaten, 'apparaat', 'apparaten');
    uitleg = 'Per kamer, zonder wat verwarmt of koelt: dat staat bij het getal ernaast. Tik op × om iets weg te halen; in Home Assistant blijft het staan.';
    rijen = perEtage.flatMap((e) => (e.ruimtes ?? []).filter((r) => geenKlimaat(r.apparaten).length).map((r) => rij(r.naam, geenKlimaat(r.apparaten).map(wegChip).join(''))));
    if (geenKlimaat(d.huis?.zonderRuimte).length) rijen.push(rij('Nog zonder kamer', geenKlimaat(d.huis.zonderRuimte).map(wegChip).join('')));
  } else {
    kop = `${n.klimaat} om te verwarmen of koelen`;
    uitleg = 'Wat de regeling met elk apparaat doet, kies je bij Klimaat.';
    rijen = binnen().filter((r) => klimaatIn(r).length).map((r) => rij(r.naam, klimaatIn(r).map((a) => `<span class="chip stil">${esc(a.naam)}</span>`).join('')));
  }
  return {
    waar: 'Welkom · wat er gevonden is',
    kop,
    uitleg,
    inhoud: `<div class="rijen">${rijen.join('') || '<p class="zacht">Niets gevonden.</p>'}</div>`,
    voet: ['<button type="button" class="zachtknop" data-lijst="">Terug</button>', '<a class="knop knop-licht" href="#huis">Begin</a>'],
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
  const soorten = [['', voorstel && soortNaam(voorstel) ? `Uit de naam: ${soortNaam(voorstel)}` : 'Uit de naam'], ...huismodel.KAMER_SOORTEN];
  const zoneSoorten = [['', 'Soort'], ...huismodel.ZONE_SOORTEN];
  const zones = (k.zones ?? []).map((z) => `<div class="zonerij"><input class="veld" data-zonenaam="${esc(z.id)}" value="${esc(z.naam)}" maxlength="40" aria-label="Naam van zone ${esc(z.naam)}"><select class="veld" data-zonesoort="${esc(z.id)}" aria-label="Soort van zone ${esc(z.naam)}">${zoneSoorten.map(([v, t]) => `<option value="${v}" ${v === (z.soort ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><button type="button" class="chip" data-zoneweg="${esc(z.id)}" aria-label="Zone ${esc(z.naam)} weghalen">×</button></div>`).join('');
  const buren = (c?.kamers ?? []).filter((x) => x.id !== k.id && x.etage === k.etage);
  // Links of rechts op de etage (besluit 166); slepen in het huis kan ook.
  const opEtage = (c?.kamers ?? []).filter((x) => x.etage === k.etage);
  const plek = opEtage.findIndex((x) => x.id === k.id);
  const schuif = opEtage.length > 1 ? `<div class="veldlabel breed"><span>Plek op de etage, of sleep de kamer in het huis</span><div class="chips"><button type="button" class="chip" data-schuifkamer="-1" ${plek <= 0 ? 'disabled' : ''}>← Naar links</button><button type="button" class="chip" data-schuifkamer="1" ${plek >= opEtage.length - 1 ? 'disabled' : ''}>Naar rechts →</button></div></div>` : '';
  return `<div class="bewerk">
    <label class="veldlabel"><span>Naam</span><input class="veld" data-naam="${esc(k.id)}" value="${esc(k.naam)}" maxlength="40"></label>
    <label class="veldlabel"><span>Etage</span><select class="veld" data-etage="${esc(k.id)}">${etages.map((x) => `<option value="${esc(x.id)}" ${x.id === k.etage ? 'selected' : ''}>${esc(naamVan(x))}</option>`).join('')}</select></label>
    ${k.etage === 'buiten' ? '' : schuif}
    ${k.etage === 'buiten' ? '' : `<label class="veldlabel breed"><span>Soort kamer</span><select class="veld" data-soort="${esc(k.id)}">${soorten.map(([v, t]) => `<option value="${v}" ${v === (k.soort ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`}
    ${k.etage === 'buiten' ? '' : `<div class="veldlabel breed"><span>Zones, voor één open ruimte met meer delen, zoals keuken en zithoek</span>${zones}<input class="veld" data-nieuwezone placeholder="+ Zone toevoegen" aria-label="Nieuwe zone" maxlength="40"></div>`}
    ${buren.length ? `<label class="veldlabel"><span>Eén ruimte met</span><select class="veld" data-samen="${esc(k.id)}"><option value="">Samenvoegen met…</option>${buren.map((x) => `<option value="${esc(x.id)}">${esc(x.naam)}</option>`).join('')}</select></label>` : ''}
    <div class="veldlabel"><span>&nbsp;</span><button type="button" class="chip gevaar" data-kamerweg="${esc(k.id)}">${weghalen === k.id ? 'Tik nog eens om weg te halen' : 'Kamer weghalen'}</button></div>
  </div>`;
}
function huisStap() {
  const c = concept();
  const etages = d.ind?.etages ?? [];
  const naamVan = (e) => c?.etages?.[e.id] ?? e.standaardNaam;
  const rijen = etages.filter((e) => e.id !== 'buiten').map((e) => {
    const kamers = (c?.kamers ?? []).filter((k) => k.etage === e.id);
    const chips = kamers.map((k) => knop(`data-kamer="${esc(k.id)}"`, k.naam, open === k.id)).join('') + knop(`data-nieuw="${esc(e.id)}"`, '+ Kamer', open === `nieuw:${e.id}`, 'plus');
    let bewerk = '';
    const k = kamers.find((x) => x.id === open);
    if (k) bewerk = bewerkKamer(k, etages, naamVan, c);
    else if (open === `nieuw:${e.id}`) {
      bewerk = `<div class="bewerk"><input class="veld" data-nieuwnaam="${esc(e.id)}" placeholder="Naam, bijvoorbeeld Kantoor" aria-label="Naam van de nieuwe kamer" maxlength="40"><button type="button" class="chip aan" data-voegtoe="${esc(e.id)}">Toevoegen</button></div>`;
    }
    return rij(naamVan(e), chips, bewerk);
  });
  return {
    waar: waarVan('huis'),
    kop: 'Klopt je huis?',
    uitleg: 'De kamers uit Home Assistant, per etage. Tik op een kamer om de naam, de etage of de zones te veranderen. In het huis sleep je een kamer naar een andere plek.',
    // De tip alleen zolang er geen kamer open staat: dan krijgt die de ruimte.
    inhoud: `<div class="rijen">${rijen.join('')}</div>${open ? '' : '<div class="noot">Een deur ertussen maakt twee kamers. Open, zoals keuken en zithoek, is één ruimte met zones: voeg de kamers samen.</div>'}`,
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
  if (!k || !b) return 'Die kamer is er niet meer.';
  if (k.regelzone && b.regelzone) return `${k.naam} en ${b.naam} hebben elk een eigen regeling. Voeg ze samen bij Instellingen › Indeling.`;
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
/** [deel, naam, soort van een ruimte die erbij hoort]; auto en carport horen bij de oprit. */
const RONDOM = [
  ['oprit', 'Oprit', 'oprit'], ['auto', 'Auto op de oprit', null], ['carport', 'Carport', null], ['garage', 'Garage, los van het huis', 'garage'],
  ['voortuin', 'Voortuin', 'voortuin'], ['tuin', 'Achtertuin', 'tuin'], ['terras', 'Terras', 'terras'], ['balkon', 'Balkon', 'balkon'], ['tuinhuis', 'Tuinhuis of schuur', 'tuinhuis'],
];
const OP_OPRIT = new Set(['auto', 'carport']);
function buitenNu(k) {
  const r = buitenRuimtes().find((x) => x.id === k.id);
  return k.buiten ?? r?.buiten ?? huismodel.soortBuiten(k);
}
function buitenStap() {
  const rond = huismodel.rondNu(d.huis);
  const kamers = buitenKamers();
  const delen = RONDOM.map(([w, t, soort]) => {
    const aan = !!rond[w] && (!OP_OPRIT.has(w) || !!rond.oprit);
    const gekoppeld = soort ? kamers.find((k) => buitenNu(k).soort === soort) : null;
    const keuze = aan && soort && kamers.length
      ? `<label class="koppel"><span>Ruimte</span><select class="veld" data-bkoppel="${soort}" aria-label="Ruimte uit Home Assistant bij ${esc(t)}">${gekoppeld ? '' : '<option value="">geen</option>'}${kamers.map((k) => `<option value="${esc(k.id)}" ${k.id === gekoppeld?.id ? 'selected' : ''}>${esc(k.naam)}</option>`).join('')}</select></label>`
      : '';
    return `<div class="deel">${schakel(`data-rond="${w}"`, t, aan, OP_OPRIT.has(w) && !rond.oprit)}${keuze}</div>`;
  });
  // Ruimtes die bij geen deel horen dat aan staat: die tekent het huis nergens.
  const los = kamers.filter((k) => !RONDOM.some(([w, , s]) => s && rond[w] && buitenNu(k).soort === s));
  return {
    waar: waarVan('buiten'),
    kop: 'Wat is er rond je huis?',
    uitleg: kamers.length ? 'Zet aan wat er is. Bij Ruimte kies je de ruimte uit Home Assistant met de lampen en camera van dat deel.' : 'Zet aan wat er is. Zo tekent het huis je buitenkant.',
    inhoud: `<div class="rijen"><div class="rondom">${delen.join('')}</div></div>${los.length ? `<div class="noot">${esc(lijstje(los.map((k) => k.naam)))} ${los.length === 1 ? 'hoort' : 'horen'} nog bij geen deel. Kies ${los.length === 1 ? 'hem' : 'ze'} bij Ruimte.</div>` : ''}`,
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
    ? `<div class="veldlabel breed"><span>Thuis volgens</span><span class="zacht" style="padding: 0">${esc(x.aanwezigheidNaam ?? '')} in Home Assistant, gekoppeld aan het account</span></div>`
    : `<label class="veldlabel breed"><span>Thuis volgens</span><select class="veld" data-bbron="${esc(x.id)}" ${kan ? '' : 'disabled'}><option value="">Geen: het huis weet het niet</option>${(x.kiesbaar ?? []).map((y) => `<option value="${esc(y.id)}" ${y.id === x.aanwezigheid ? 'selected' : ''}>${esc(y.naam)} · ${y.soort === 'persoon' ? 'persoon' : 'sensor'}</option>`).join('')}</select></label>`;
  const volgorde = b?.ik?.magBeheren && lijst.length > 1
    ? `<div class="veldlabel breed"><span>Plek in de volgorde: wie eerst thuis is, bepaalt het comfort</span><div class="chips"><button type="button" class="chip" data-bvolg="-1" ${i === 0 ? 'disabled' : ''}>↑ Hoger</button><button type="button" class="chip" data-bvolg="1" ${i === lijst.length - 1 ? 'disabled' : ''}>↓ Lager</button>${x.hoofd ? '' : '<button type="button" class="chip" data-bhoofd>Hoofdgebruiker maken</button>'}</div></div>`
    : '';
  const comfort = x.hoofd
    ? `<div class="veldlabel breed"><span>Comfort</span><span class="zacht" style="padding: 0">Het comfort van het huis; dat stel je in bij Klimaat › Comfort.</span></div>`
    : `<div class="veldlabel breed"><span>Comfort</span><div class="chips">${knop('data-bcomfort="eigen"', 'Eigen temperaturen', x.comfort === 'eigen')}${knop('data-bcomfort="volgt"', `Volgt ${hoofd?.naam ?? 'de hoofdgebruiker'}`, x.comfort !== 'eigen')}${x.comfort === 'eigen' ? `<a class="chip plus" href="comfort.html?bewoner=${encodeURIComponent(x.id)}">Temperaturen instellen ›</a>` : ''}</div></div>`;
  return `<div class="bewerk" style="grid-column: 1 / -1">
    <label class="veldlabel breed"><span>Zo noemt het huis ${x.ik ? 'je' : esc(x.naam)}</span><input class="veld" data-bnaam="${esc(x.id)}" value="${esc(x.naam)}" maxlength="40" ${kan ? '' : 'disabled'}></label>
    ${thuis}${volgorde}${comfort}
  </div>`;
}
function bewonersStap() {
  const b = d.bewoners;
  const lijst = b?.bewoners ?? [];
  const rijen = lijst.map((x, i) => {
    const open = x.id === openBewoner;
    const wat = x.hoofd ? 'hoofdgebruiker' : x.comfort === 'eigen' ? 'eigen comfort' : `volgt ${lijst[0]?.naam ?? 'de hoofdgebruiker'}`;
    return `<button type="button" class="waarderij bewonerrij${open ? ' open' : ''}" data-bewoner="${esc(x.id)}" aria-expanded="${open}"><span>${i + 1}. ${esc(x.naam)}${x.ik ? ' (jij)' : ''}</span><span>${esc(wat)} ›</span></button>${open ? bewonerBewerk(x, i, lijst) : ''}`;
  }).join('');
  return {
    waar: waarVan('bewoners'),
    kop: 'Wie woont hier?',
    uitleg: 'Wie één keer inlogt, staat erbij. De eerste die thuis is, bepaalt het comfort. Tik op iemand om het in te stellen.',
    inhoud: `<div class="rijen">${rijen || '<p class="zacht" style="padding: 0">Nog niemand.</p>'}</div>
      ${openBewoner ? '' : `<div class="erbij"><div class="qr" aria-label="QR-code naar de app">${qrVan(appAdres())}</div><span class="zacht" style="padding: 0">Laat de anderen deze code scannen en één keer inloggen met Home Assistant.</span></div>`}`,
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
  const opties = (voorstel, leeg = 'Kies een kamer…') => `<option value="">${leeg}</option>${kamers.map(({ r }) => `<option value="${esc(r.id)}" ${r.id === voorstel ? 'selected' : ''}>${esc(r.naam)}</option>`).join('')}<option value="-">Niet tonen</option>`;
  const losRijen = los.map((a) => `<div class="rij breed"><b>${esc(a.naam)}</b><select class="veld" data-plek="${esc(a.id)}" aria-label="Kamer voor ${esc(a.naam)}">${opties(a.voorstelKamer)}</select></div>`).join('');
  const perKamer = kamers.filter(({ r }) => geenKlimaat(r.apparaten).length).map(({ r }) => {
    const apps = geenKlimaat(r.apparaten);
    const open = apps.find((a) => a.id === openApparaat);
    const chips = apps.map((a) => knop(`data-apparaat="${esc(a.id)}"`, a.naam, a.id === openApparaat)).join('');
    const bewerk = open
      ? `<div class="bewerk"><label class="veldlabel breed"><span>Naar een andere kamer</span><select class="veld" data-verplaats="${esc(sleutel(open))}" aria-label="Kamer voor ${esc(open.naam)}">${opties(null, `Blijft in ${r.naam}`).replace('<option value="-">Niet tonen</option>', '')}</select></label><div class="veldlabel breed"><button type="button" class="chip gevaar" data-verberg="${esc(open.id)}">Weghalen uit de app</button></div></div>`
      : '';
    return rij(r.naam, chips, bewerk);
  }).join('');
  const ingedeeld = kamers.reduce((t, { r }) => t + geenKlimaat(r.apparaten).length, 0);
  return {
    waar: waarVan('apparaten'),
    kop: los.length === 0 ? 'Klopt waar alles staat?' : los.length === 1 ? 'Waar staat dit apparaat?' : `Waar staan deze ${los.length} apparaten?`,
    uitleg: `${meervoud(ingedeeld, 'apparaat staat', 'apparaten staan')} al in een kamer, uit Home Assistant. Tik er een aan om hem te verplaatsen of weg te halen. Wat verwarmt of koelt, komt bij Klimaat.`,
    inhoud: `<div class="rijen">${losRijen ? `${losRijen}${los.some((a) => a.voorstelKamer) ? '<p class="zacht" style="padding: 4px 0 8px">Een kamer die al gekozen staat, komt uit de naam. Volgende neemt hem over.</p>' : ''}` : ''}${perKamer}</div>`,
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
    const nu = r.meetMet?.length ? `<span class="zacht">${chips ? 'nu: ' : 'meet met '}${esc(r.meetMet.join(' en '))}</span>` : '';
    return rij(r.naam, chips + (nu || (chips ? '' : '<span class="zacht">geen thermometer in deze kamer</span>')));
  });
  return {
    waar: waarVan('meten'),
    kop: 'Welke thermometer telt per kamer?',
    uitleg: 'Kies er één of meer; een kamer met twee rekent met het gemiddelde. Niets gekozen is ook goed: dan meet de kamer zoals hij nu doet.',
    inhoud: `<div class="rijen">${rijen.join('') || '<p class="zacht">Nog geen kamer om te meten.</p>'}</div>`,
  };
}

/* De regeling per kamer (besluit 138): dezelfde drie keuzes als bij Indeling. */
const ROLLEN = [['houdt', 'Houdt de kamer op temperatuur', 'Op temperatuur'], ['zon', 'Helpt als er zon over is', 'Op zon'], ['kijken', 'Kijkt alleen mee', 'Kijkt mee']];
const rolVan = (k, r, key) => (k?.rollen ? (k.rollen[key] ?? 'kijken') : (klimaatIn(r).find((a) => sleutel(a) === key)?.klimaat?.rol ?? 'kijken'));
/* Waar de warmte vandaan komt (besluit 122); hoort bij Klimaat (besluit 158). */
const VERWARMING = [['cv', 'Cv-ketel'], ['warmtepomp', 'Warmtepomp'], ['hybride', 'Hybride'], ['stadsverwarming', 'Stadsverwarming'], ['weetniet', 'Weet ik niet']];
let toevoegenIn = null;
/*
 * Iets toevoegen (besluit 167): hetzelfde als bij Kamers en indeling. Eerst wat
 * er hangt, dan hoe het aangaat. Een radiator op de cv gaat aan met de
 * thermostaat van de ketel (zoals een Nest), een slimme radiatorknop, of met
 * de hand. Een airco of thermostaat uit Home Assistant kies je uit de lijst.
 */
let toevoeg = null;
const TOEVOEG_SOORT = [['radiator', 'Radiator'], ['vloer', 'Vloerverwarming'], ['paneel', 'Infraroodpaneel'], ['kachel', 'Elektrische kachel'], ['ha', 'Airco of thermostaat']];
function toevoegVorm(r, los, elders) {
  const v = toevoeg ?? { soort: null, aan: null, apparaat: null };
  const cv = v.soort === 'radiator' || v.soort === 'vloer';
  const ketel = huismodel.cvThermostaat(d.huis, antwoorden().verwarming);
  const toestellen = binnen().flatMap((x) => klimaatIn(x).map((a) => ({ a, r: x })));
  const uitHA = `<select class="veld" data-toevoegen="${esc(r.id)}" aria-label="Apparaat uit Home Assistant"><option value="">Kies uit Home Assistant…</option>${[...los.map((x) => ({ key: x.id, naam: x.naam, waar: 'nog los' })), ...elders.filter((x) => x.r.id !== r.id).map((x) => ({ key: sleutel(x.a), naam: x.a.naam, waar: x.r.naam }))].map((x) => `<option value="${esc(x.key)}">${esc(x.naam)} (${esc(x.waar)})</option>`).join('')}</select>`;
  const aanOpties = cv
    ? [['thermostaat', ketel ? `Met de thermostaat van de cv (${ketel.naam})` : 'Met de thermostaat van de cv'], ...(v.soort === 'radiator' ? [['knop', 'Met een slimme radiatorknop']] : []), ['hand', 'Met de hand']]
    : [['thermostaat', 'Met een thermostaat'], ['stekker', 'Met een slimme stekker of module'], ['hand', 'Met de hand']];
  const kiesbaar = v.aan === 'knop' ? toestellen.filter((x) => x.a.radiatorknop) : toestellen;
  const welke = v.soort && v.soort !== 'ha' && v.aan && v.aan !== 'hand' && !(cv && v.aan === 'thermostaat')
    ? `<select class="veld" data-toevoeg-apparaat aria-label="Welk apparaat"><option value="">${v.aan === 'knop' ? 'Welke radiatorknop?' : 'Welk apparaat?'}</option>${kiesbaar.map((x) => `<option value="${esc(sleutel(x.a))}" ${sleutel(x.a) === v.apparaat ? 'selected' : ''}>${esc(x.a.naam)} (${esc(x.r.naam)})</option>`).join('')}</select>`
    : '';
  const klaar = v.soort && v.soort !== 'ha' && v.aan && (v.aan === 'hand' || (cv && v.aan === 'thermostaat') || v.apparaat);
  return `<div class="kolom toevoeg" style="width: 100%">
    <span class="zacht">Wat hangt er?</span>
    <div class="chips">${TOEVOEG_SOORT.map(([w, t]) => knop(`data-toevoeg-soort="${w}"`, t, v.soort === w)).join('')}</div>
    ${v.soort === 'ha' ? uitHA : ''}
    ${v.soort && v.soort !== 'ha' ? `<span class="zacht">Hoe gaat het aan?</span><div class="chips">${aanOpties.map(([w, t]) => knop(`data-toevoeg-aan="${w}"`, t, v.aan === w)).join('')}</div>${welke}` : ''}
    <div class="chips">${knop('data-toevoeg-annuleer', 'Annuleren')}${v.soort !== 'ha' ? `<button type="button" class="chip aan" data-toevoeg-bewaar ${klaar ? '' : 'disabled'}>Toevoegen</button>` : ''}</div>
    ${v.soort === 'paneel' || v.soort === 'kachel' ? '<span class="zacht">Het vermogen en of hij op zon mag, kies je later bij Kamers en indeling.</span>' : ''}
  </div>`;
}
function warmteStap() {
  const c = concept();
  const a = antwoorden();
  const elders = binnen().flatMap((r) => klimaatIn(r).map((x) => ({ a: x, r })));
  const los = (d.huis?.zonderRuimte ?? []).filter((x) => x.soort === 'klimaat');
  const rijen = binnen().map((r) => {
    const k = c?.kamers.find((x) => x.id === r.id);
    // Drie knoppen naast elkaar, zoals de schets: op temperatuur, op zon, kijkt mee (besluit 146).
    const toestellen = klimaatIn(r).map((x) => {
      const nuRol = rolVan(k, r, sleutel(x));
      const knoppen = ROLLEN.map(([w, t, kort]) => `<button type="button" class="${w === 'zon' ? 'zon' : ''}" data-rolwaarde="${w}" aria-pressed="${w === nuRol}" title="${t}">${kort}</button>`).join('');
      const ketel = huismodel.cvThermostaat(d.huis, a.verwarming)?.sleutel === sleutel(x);
      return `<div class="toestel">${esc(x.naam)}${ketel ? '<span class="zacht"> · zet de ketel aan</span>' : ''}<div class="seg" role="group" aria-label="Wat de regeling met ${esc(x.naam)} doet" data-rol="${esc(sleutel(x))}" data-rolkamer="${esc(r.id)}">${knoppen}</div></div>`;
    }).join('');
    const bronnen = (r.bronnen ?? []).filter((b) => !b.apparaat).map((b) => `<span class="chip gevonden">${esc(huismodel.bronNaam(b))}</span>`).join('');
    const keuze = toevoegenIn === r.id ? toevoegVorm(r, los, elders) : knop(`data-erbij="${esc(r.id)}"`, '+ Iets toevoegen', false, 'plus');
    // Zonder eigen apparaat: meedoen met een kamer die wel regelt (besluit 142).
    const regelaars = binnen().filter((x) => x.id !== r.id && x.zoneId);
    const mee = !toestellen && regelaars.length ? `<select class="veld" data-meedoen="${esc(r.id)}" aria-label="Doet ${esc(r.naam)} mee met een andere kamer?"><option value="">Doet niet mee</option>${regelaars.map((x) => `<option value="${esc(x.id)}" ${k?.meedoenMet === x.id ? 'selected' : ''}>Doet mee met ${esc(x.naam)}</option>`).join('')}</select>` : '';
    const inhoud = `<div class="kolom" style="width: 100%">${toestellen}${bronnen ? `<div class="chips">${bronnen}</div>` : ''}${mee}${!toestellen && !bronnen && !mee ? '<span class="zacht">niets, dat is goed</span>' : ''}<div class="chips">${keuze}</div></div>`;
    return `<div class="rij"><b>${esc(r.naam)}</b>${inhoud}</div>`;
  });
  // De thermostaat die de ketel aanzet (besluit 167), zoals een Nest: niets gekozen is het voorstel uit Home Assistant.
  const lijst = huismodel.thermostaten(d.huis);
  const thermoOpties = [['', lijst[0] ? `Thermostaat: ${lijst[0].naam}` : 'Geen thermostaat gevonden'], ...lijst.map((x) => [x.sleutel, `Thermostaat: ${x.naam} (${x.kamer})`]), ['geen', 'Geen thermostaat']];
  const thermo = a.verwarming.soort === 'stadsverwarming' || !lijst.length ? '' : `<select class="veld" data-inr-thermostaat aria-label="Thermostaat die de ketel aanzet" style="margin-top: 6px">${thermoOpties.map(([w, t]) => `<option value="${esc(w)}" ${w === (a.verwarming.thermostaat ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const verwarming = rij('Verwarming', VERWARMING.map(([w, t]) => knop(`data-verwarming="${w}"`, t, a.verwarming.soort === w)).join(''), thermo);
  return {
    waar: waarVan('warmte'),
    kop: 'Wat verwarmt en koelt er?',
    uitleg: 'Je verwarming, en per kamer wat er hangt en wat de regeling ermee doet. Een kamer zonder eigen apparaat kan meedoen met een kamer ernaast.',
    inhoud: `<div class="rijen">${verwarming}${rijen.join('') || '<p class="zacht">Nog geen kamers.</p>'}</div>`,
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
    return { waar: waarVan('comfort'), kop: 'Hoe warm wil je het?', uitleg: 'Comfort komt zodra er een kamer meedoet in de regeling, bij Wat elk apparaat doet.', inhoud: '' };
  }
  const c = comfortNu();
  const uur = (u) => `${String(u).padStart(2, '0')}:00`;
  const kanKoelen = d.comfort.kamers.some((k) => k.kanKoelen);
  const eigen = eigenKamers();
  return {
    waar: waarVan('comfort'),
    kop: 'Hoe warm wil je het?',
    uitleg: 'Eén keer voor het hele huis. Per kamer en per dagdeel kan later bij Comfort.',
    inhoud: `<div class="kolom">
        <label class="schuif warm">Verwarmen onder<b>${nl(c.warm)}°</b><input type="range" min="14" max="24" step="0.5" value="${c.warm}" data-comfort="warm" aria-label="Verwarmen onder"></label>
        ${kanKoelen ? `<label class="schuif">Koelen boven<b>${nl(c.koel)}°</b><input type="range" min="18" max="28" step="0.5" value="${c.koel}" data-comfort="koel" aria-label="Koelen boven"></label>` : ''}
      </div>
      <div class="rijen">
        ${rij("'s Nachts", [['koeler', '2° koeler'], ['zelfde', 'Hetzelfde'], ['uit', 'Uit']].map(([w, t]) => knop(`data-nacht="${w}"`, t, c.nacht === w)).join(''))}
        ${rij('De dag', `<select class="veld" data-dagvan aria-label="De dag begint om" style="width: auto">${[5, 6, 7, 8, 9].map((u) => `<option value="${u}" ${u === c.dag ? 'selected' : ''}>van ${uur(u)}</option>`).join('')}</select><select class="veld" data-dagtot aria-label="De nacht begint om" style="width: auto">${[20, 21, 22, 23].map((u) => `<option value="${u}" ${u === c.avond ? 'selected' : ''}>tot ${uur(u)}</option>`).join('')}</select>`)}
      </div>
      ${eigen.length ? `<div class="noot">${esc(lijstje(eigen.map((k) => k.naam)))} ${eigen.length === 1 ? 'heeft' : 'hebben'} een eigen waarde en ${eigen.length === 1 ? 'blijft' : 'blijven'} zo.<div class="chips" style="margin-top: 8px">${knop('data-ookeigen', 'Ook gelijk zetten', ookEigen)}</div></div>` : ''}`,
  };
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
const DAKKANT = [['voorkant', 'Voorkant'], ['achterkant', 'Achterkant'], ['beide', 'Beide kanten'], ['plat', 'Plat dak'], ['weetniet', 'Weet ik niet']];
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
  };
}
let panelenJa = false;
function zonStap() {
  const a = antwoorden();
  const piekW = (d.zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
  const meter = (energieNu()?.zon ?? []).length > 0;
  const geen = a.panelen.ligging === 'geen';
  const ja = !geen && (a.panelen.ligging != null || panelenJa);
  const gevonden = piekW > 0 ? `<span class="chip gevonden">✓ ${nl(piekW / 1000)} kWp gevonden</span>` : meter ? '<span class="chip gevonden">✓ Opbrengstmeter gevonden</span>' : '';
  const veld = (sleutel, label, waarde) => `<label class="invul"><span>${esc(label)}</span><span class="waarde"><input inputmode="numeric" data-aantal="${sleutel}" value="${waarde ?? ''}" placeholder="invullen" aria-label="${esc(label)}"></span></label>`;
  const aantallen = !ja || !a.panelen.ligging
    ? ''
    : a.panelen.ligging === 'beide'
      ? `<span class="vraagje">Aantal panelen</span><div class="paar">${veld('voorkant', 'Voorkant', a.panelen.voorkant)}${veld('achterkant', 'Achterkant', a.panelen.achterkant)}</div>`
      : veld('aantal', 'Aantal panelen', a.panelen.aantal);
  return {
    waar: waarVan('zon'),
    kop: 'Je zonnepanelen',
    uitleg: 'Wat Smart Climate al vond, staat er. Weet je iets niet, ga dan gewoon door; het huis werkt toch.',
    inhoud: `<div class="rijen">
        ${rij('Panelen', `${knop('data-panelen="ja"', 'Ja', ja)}${knop('data-panelen="geen"', 'Geen panelen', geen)}${gevonden}`)}
        ${ja ? rij('Kant van het dak', DAKKANT.map(([w, t]) => knop(`data-dakkant="${w}"`, t, a.panelen.ligging === w)).join('')) : ''}
      </div>
      ${aantallen}${aantallen ? '<p class="zacht" style="padding: 0; margin: 0">Het aantal is niet verplicht.</p>' : ''}`,
  };
}

/*
 * Hoe de panelen liggen (besluit 157, schets Wand-Inrichten-Panelen): de kaart
 * komt uit panelen.js. Onderaan zijn knoppen: Aanpassen en Klopt bij een
 * voorstel, Terug en Bewaar bij aanpassen, en anders Aanpassen naast Volgende.
 */
const ligStaat = { aanpassen: false, concept: null };
function liggingStap() {
  // De antwoorden zoals de stap ze kent, ook als er nog niets bewaard is (besluit 166).
  const k = ligging.kaart(d.aans?.ligging, antwoorden(), ligStaat);
  const rechts = `<span class="rechts lig-knoppen">${k.knoppen}${k.volgende ? '<button type="button" class="knop knop-licht" data-volgende>Volgende</button>' : ''}</span>`;
  return {
    waar: waarVan('ligging'),
    kop: k.kop,
    uitleg: k.uitleg,
    inhoud: `<div class="rijen">${k.inhoud}</div>`,
    voet: [ligStaat.aanpassen ? '' : '<button type="button" class="zachtknop" data-terug>Terug</button>', rechts],
  };
}

/* De zekering zoals de schets: eerst de fasen, dan de ampère in een vak (besluit 146). */
const AMPERES = [16, 20, 25, 35, 40, 50, 63, 80];
function zekeringStap() {
  const a = antwoorden();
  const zek = a.zekering && a.zekering !== 'weetniet' ? a.zekering : null;
  const ampere = zek?.ampere ?? null;
  const lijst = ampere != null && !AMPERES.includes(ampere) ? [...AMPERES, ampere].sort((x, y) => x - y) : AMPERES;
  const keuze = `<select class="veld" data-ampere aria-label="Hoofdzekering in ampère" ${zek ? '' : 'disabled'}>${zek ? '' : '<option value="">kies eerst de fasen</option>'}${lijst.map((x) => `<option value="${x}" ${x === ampere ? 'selected' : ''}>${x} A</option>`).join('')}</select>`;
  return {
    waar: waarVan('zekering'),
    kop: 'Hoe zwaar is je aansluiting?',
    uitleg: 'Het staat op de hoofdschakelaar in de meterkast. Zo weet het huis hoeveel er tegelijk aan kan zonder dat de zekering eruit gaat.',
    inhoud: `<div class="chips">${knop('data-fasen="1"', '1 fase', zek?.fasen === 1)}${knop('data-fasen="3"', '3 fasen', zek?.fasen === 3)}${knop('data-zekering="weetniet"', 'Weet ik niet', a.zekering === 'weetniet')}</div>
      <label class="invul"><span>Hoofdzekering</span>${keuze}</label>`,
  };
}

/*
 * De prijzen (besluit 158): eerst het soort contract, dan alleen de velden die
 * daarbij horen, met gas en wat je vanaf 2027 voor teruglevering krijgt en
 * betaalt. Het salderen stopt op 1 januari 2027.
 */
const CONTRACT = [['enkel', 'Eén tarief'], ['dagnacht', 'Dag en nacht'], ['dynamisch', 'Dynamisch']];
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
  const meters = [e?.net?.afname?.length ? 'het net' : null, e?.zon?.length ? 'de panelen' : null, e?.gas ? 'gas' : null].filter(Boolean);
  const p = e?.prijzen ?? {};
  const contract = contractNu();
  const veld = (sleutel, label, waarde, eenheid = 'kWh') => `<label class="invul"><span>${esc(label)}</span><span class="waarde">€<input inputmode="decimal" data-prijs="${sleutel}" data-eenheid="${eenheid}" value="${waarde != null ? String(waarde).replace('.', ',') : ''}" placeholder="invullen" aria-label="${esc(label)} per ${eenheid}"></span></label>`;
  // Twee vakken naast elkaar, zodat alles op de kaart past: stroom (en dal), dan gas.
  const gas = e?.gas ? veld('gas', 'Gas per m³', p.gas, 'm³') : '';
  const stroom = contract === 'dagnacht'
    ? `<div class="paar">${veld('stroom', 'Stroom normaal', p.stroom)}${veld('stroomDal', 'Stroom dal', p.stroomDal)}</div>${gas}`
    : `<div class="paar">${veld('stroom', contract === 'dynamisch' ? 'Stroom gemiddeld' : 'Stroom', p.stroom)}${gas}</div>`;
  const velden = contract
    ? `${stroom}
       <span class="vraagje">Terugleveren vanaf 2027, per kWh</span><div class="paar">${veld('vanaf2027.vergoeding', 'Je krijgt', p.vanaf2027?.vergoeding)}${veld('vanaf2027.kosten', 'Je betaalt', p.vanaf2027?.kosten)}</div>`
    : '';
  return {
    waar: waarVan('prijzen'),
    kop: 'Wat betaal je?',
    uitleg: `Van je contract of je jaarafrekening.${meters.length ? ` De meters van ${lijstje(meters)} staan al klaar.` : ''}`,
    inhoud: `<div class="chips">${CONTRACT.map(([w, t]) => knop(`data-contract="${w}"`, t, contract === w)).join('')}</div>
      ${velden ? `<div class="rijen kolom">${velden}</div>` : ''}
      <div class="noot">Tot 2027 telt teruglevering tegen je verbruik weg. Vaste kosten zet je bij Instellingen › Energie.</div>`,
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
  return c;
};
function functiesStap() {
  const c = functiesNu();
  const f = d.functies;
  const cams = f?.gevonden?.cameras ?? [];
  return {
    waar: waarVan('functies'),
    kop: "Licht en camera's",
    uitleg: 'Wat je in de app mag bedienen, en of de camera\'s in het huis staan. Smart Climate raakt je lampen alleen aan als jij erop tikt.',
    inhoud: c
      ? `<div class="rijen">
          ${f.lichtMogelijk ? rij('Licht', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']].map(([w, t]) => knop(`data-flicht="${w}"`, t, c.licht?.bedienen === w)).join('')) : ''}
          ${f.schermMogelijk ? rij('Zonneschermen', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']].map(([w, t]) => knop(`data-fscherm="${w}"`, t, c.schermen?.bedienen === w)).join('')) : ''}
          ${cams.length ? rij("Camera's", [[true, 'In de app'], [false, 'Niet tonen']].map(([w, t]) => knop(`data-fcam="${w}"`, t, c.cameras?.aan === w)).join('') + `<span class="zacht">${esc(cams.map((x) => x.naam).join(', '))}</span>`) : ''}
        </div>`
      : '<p class="zacht">Even lezen uit Home Assistant…</p>',
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
  return `<div class="waarderij">${esc(s.naam)}<span>${s.ik ? 'dit scherm' : 'scherm'}</span></div>
    <div class="rondom" style="margin-bottom: 8px">
      ${schakel(`data-sopt="volledig" data-scherm="${esc(s.id)}"`, 'Volledig scherm', o.volledig === true, !mag)}
      ${schakel(`data-sopt="luisteren" data-scherm="${esc(s.id)}"`, 'Luistert naar "Hé huis"', o.luisteren === true, !mag)}
    </div>`;
}
function wandStap() {
  const schermen = d.bewoners?.schermen ?? [];
  const inlog = d.sessie?.toegang === 'sessions';
  return {
    waar: waarVan('wand'),
    kop: schermen.length ? 'De wand staat erin' : 'Zet de wand erbij',
    uitleg: schermen.length ? 'Kies per scherm hoe het werkt; de tablet neemt het over, ook als je dit op de pc doet.' : `Pak de tablet aan de muur en open Smart Climate${inlog ? ', of scan de code' : ' via Home Assistant'}. ${inlog ? 'Log één keer in met een account van Home Assistant en kies' : 'Kies bij de eerste keer'} "Dit is een scherm".`,
    inhoud: `${inlog ? `<div class="erbij"><div class="qr" aria-label="QR-code naar de app">${qrVan(appAdres())}</div><span class="zacht" style="padding: 0">Een scherm telt niet als bewoner. Het begroet wie er thuis is.</span></div>` : ''}
      ${schermen.length ? `<div class="rijen">${schermen.map(schermRij).join('')}</div>` : '<div class="noot">Nog geen scherm. Het kan ook later: de tablet vraagt het zelf bij de eerste keer.</div>'}`,
  };
}
async function bewaarAansluiting(a) {
  const opZon = Object.fromEntries(Object.entries(a.opZon).filter(([, v]) => typeof v === 'boolean'));
  const uit = await stuur('api/aansluiting', { panelen: a.panelen, zekering: a.zekering, tarief: a.tarief, verwarming: a.verwarming, voorkantZon: a.voorkantZon, dak: a.dak, opZon, opZonUit: a.opZonUit });
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

function klaarStap() {
  const open = STAPPEN.filter(([id]) => !nagelopen.has(id));
  const later = open.length
    ? `<div class="noot later">Nog niet nagelopen: ${open.map(([id, t]) => `<a href="#${id}">${esc(t.toLowerCase())}</a>`).join(', ')}. Ook later te openen bij Instellingen, onder Inrichten.</div>`
    : '';
  return {
    waar: 'Klaar',
    kop: 'Je huis staat erin',
    groot: true,
    uitleg: 'Smart Climate kijkt vanaf nu mee. Dit is wat het kan:',
    inhoud: `<button type="button" class="filmkaart" data-film aria-label="Speel de film af: een dag in je huis, 45 seconden"><span class="speel" aria-hidden="true"></span><span>Een dag in je huis · 45 seconden</span></button>
      <div class="noot">Daarna laten we je de app zien, in twaalf stops van een paar tellen. Overslaan kan altijd; terugkijken bij het vraagteken op Thuis.</div>${later}`,
    voet: [`<a class="zachtknop" href="#${vorige('klaar')}">Terug</a>`, '<span class="rechts"><a class="zachtknop" href="thuis.html#rondleiding">Overslaan</a><button type="button" class="knop knop-licht" data-film>Speel af</button></span>'],
  };
}

/*
 * Wat Volgende bewaart (besluit 158): wat in beeld staat, ook als de bewoner
 * niets aanraakte. Waar wat in beeld staat al geldt (meten, de regeling,
 * comfort, de zekering), hoeft er niets bewaard te worden. Lukt het niet, dan
 * blijft de stap staan en zegt de melding waarom.
 */
const BEVESTIG = {
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
function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const nu = stapNu();
  $$('[data-stappen]').forEach((el) => {
    // Zes kaarten: vijf hoofdstukken en Klaar, met een balkje per stap en wat erin zit (besluit 146).
    const alle = [...HOOFDSTUKKEN, ['Klaar', [['klaar', 'De film · de rondleiding']]]];
    el.innerHTML = alle.map(([titel, stappen], i) => {
      const hier = stappen.some(([id]) => id === nu);
      const klaar = titel !== 'Klaar' && stappen.every(([id]) => nagelopen.has(id));
      // Drie standen (besluit 158): nagelopen is groen, al ingevuld uit Home Assistant omlijnd.
      const stipjes = stappen.map(([id]) => `<i class="${id === nu ? 'nu' : nagelopen.has(id) ? 'al' : gedaan(id) ? 'half' : ''}"></i>`).join('');
      const sub = stappen.map(([, t], j) => (j ? t.toLowerCase() : t)).join(' · ');
      return `<a class="stap${hier ? ' nu' : ''}${klaar ? ' klaar' : ''}" href="#${stappen[0][0]}" ${hier ? 'aria-current="step"' : ''}><span class="n" aria-hidden="true">${klaar && !hier ? '✓' : i + 1}</span><span class="kort">${esc(titel)}</span><span class="naam">${i + 1}. ${esc(titel)}</span><span class="stipjes" aria-hidden="true">${stipjes}</span><span class="sub">${esc(sub)}</span></a>`;
    }).join('');
  });
  const v = { welkom, huis: huisStap, buiten: buitenStap, bewoners: bewonersStap, apparaten: apparatenStap, meten: metenStap, warmte: warmteStap, comfort: comfortStap, zon: zonStap, ligging: liggingStap, zekering: zekeringStap, prijzen: prijzenStap, functies: functiesStap, wand: wandStap, klaar: klaarStap }[nu]();
  // Onderaan overal hetzelfde (besluit 158): Terug en Volgende, tenzij de stap iets anders zegt.
  const [links, rechts] = v.voet ?? [`<button type="button" class="zachtknop" data-terug>Terug</button>`, '<button type="button" class="knop knop-licht" data-volgende>Volgende</button>'];
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
  // Zo groot als het vak echt is (besluit 166): op een breder scherm is het vak breder.
  const vak = document.querySelector('[data-podium="wand"]');
  // Bij Klopt je huis? zijn de kamers in het huis aan te tikken en te slepen (besluit 166).
  if (!app.telStand()) huis.teken(vak, m, { breedte: vak.clientWidth || 700, hoogte: vak.clientHeight || 640, marge: 0.04, zoom: 1, schuifY: 10, tik: nu === 'huis' });
  else huis.teken(document.querySelector('[data-podium="tel"]'), m, { breedte: 360, hoogte: 220, marge: 0.04, zoom: 1 });
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
      await bewaarIndeling(next, `${naam} staat op een nieuwe plek.`);
    }
  };
  document.addEventListener('pointerup', los);
  document.addEventListener('pointercancel', los);
}

/* ------------------------------------------------------------ doen */

let bezig = false;
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.hasAttribute('data-film')) {
    // Het filmpje (besluit 139), en daarna de rondleiding op Thuis.
    void film.speel({ opEinde: () => (location.href = 'thuis.html#rondleiding') });
    return;
  }
  if (t.hasAttribute('data-terug')) {
    naar(vorige(stapNu()));
    return;
  }
  if (t.hasAttribute('data-volgende')) {
    // Volgende bewaart wat er staat (besluit 158); twee keer tikken bewaart één keer.
    if (bezig) return;
    const nu = stapNu();
    bezig = true;
    t.disabled = true;
    try {
      if (BEVESTIG[nu] && !(await BEVESTIG[nu]())) return;
      markeer(nu);
      naar(volgende(nu));
    } finally {
      bezig = false;
      t.disabled = false;
    }
    return;
  }
  // Hoe de panelen liggen (besluit 157); Klopt telt als nagelopen en gaat door.
  if (Object.keys(t.dataset).some((k) => k.startsWith('lig'))) {
    const a = antwoorden();
    const klopt = t.hasAttribute('data-lig-klopt');
    const wat = ligging.klik(t, d.aans?.ligging, a, ligStaat);
    if (wat === 'bewaar') await bewaarAansluiting(a);
    else if (wat === 'teken') teken();
    if (klopt && d.aans?.ligging?.stand === 'bevestigd') {
      markeer('ligging');
      naar(volgende('ligging'));
    }
    return;
  }
  if (t.dataset.lijst !== undefined) {
    lijst = t.dataset.lijst || null;
    teken();
    return;
  }
  if (t.dataset.sopt) {
    const s = (d.bewoners?.schermen ?? []).find((x) => x.id === t.dataset.scherm);
    if (!s) return;
    const aan = !(s.opties?.[t.dataset.sopt] === true);
    await stuurBewoner({ actie: 'schermOpties', id: s.id, opties: { [t.dataset.sopt]: aan } }, aan ? `${s.naam}: aan. De tablet neemt het over.` : `${s.naam}: uit, vanaf de volgende pagina.`);
    return;
  }
  if (t.dataset.bewoner) {
    openBewoner = openBewoner === t.dataset.bewoner ? null : t.dataset.bewoner;
    teken();
    return;
  }
  if (t.dataset.bvolg && openBewoner) {
    const v = (d.bewoners?.bewoners ?? []).map((x) => x.id);
    const i = v.indexOf(openBewoner);
    const j = i + Number(t.dataset.bvolg);
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    await stuurBewoner({ actie: 'volgorde', volgorde: v });
    return;
  }
  if (t.hasAttribute('data-bhoofd') && openBewoner) {
    await stuurBewoner({ actie: 'hoofd', id: openBewoner });
    return;
  }
  if (t.dataset.bcomfort && openBewoner) {
    await stuurBewoner({ actie: 'comfort', id: openBewoner, comfort: t.dataset.bcomfort });
    return;
  }
  if (t.dataset.apparaat) {
    openApparaat = openApparaat === t.dataset.apparaat ? null : t.dataset.apparaat;
    teken();
    return;
  }
  if (t.dataset.verberg) {
    const next = concept();
    if (!next) return;
    const id = t.dataset.verberg;
    const naam = [...(d.huis?.zonderRuimte ?? []), ...(d.huis?.etages ?? []).flatMap((x) => x.ruimtes ?? []).flatMap((r) => r.apparaten ?? [])].find((a) => a.id === id)?.naam ?? 'Het apparaat';
    next.verborgen = [...new Set([...(next.verborgen ?? []), id])];
    openApparaat = null;
    await bewaarIndeling(next, `${naam} weggehaald.`);
    return;
  }
  if (t.dataset.kamer) {
    open = open === t.dataset.kamer ? null : t.dataset.kamer;
    weghalen = null;
    teken();
    return;
  }
  if (t.dataset.nieuw) {
    open = `nieuw:${t.dataset.nieuw}`;
    teken();
    setTimeout(() => document.querySelector(`${app.zicht()} [data-nieuwnaam]`)?.focus(), 50);
    return;
  }
  if (t.dataset.voegtoe) {
    const naam = document.querySelector(`${app.zicht()} [data-nieuwnaam]`)?.value.trim();
    if (!naam) return;
    const next = concept();
    const id = idVan(naam, new Set(next.kamers.map((k) => k.id)));
    next.kamers.push({ id, naam, etage: t.dataset.voegtoe, zones: [], regelzone: null, haGebied: null });
    open = null;
    await bewaarIndeling(next, `${naam} toegevoegd.`);
    return;
  }
  if (t.dataset.kamerweg) {
    // Twee tikken: de eerste vraagt het nog eens.
    if (weghalen !== t.dataset.kamerweg) {
      weghalen = t.dataset.kamerweg;
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
    await bewaarIndeling(next, `${k.naam} weggehaald.`);
    return;
  }
  if (t.dataset.schuifkamer) {
    const next = concept();
    if (next && verplaatsKamer(next, open, { stap: Number(t.dataset.schuifkamer) })) await bewaarIndeling(next);
    return;
  }
  if (t.dataset.zoneweg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === open);
    const z = k?.zones.find((x) => x.id === t.dataset.zoneweg);
    if (!z) return;
    k.zones = k.zones.filter((x) => x.id !== z.id);
    for (const a of Object.values(next.apparaten)) if (a.kamer === k.id && a.zone === z.id) a.zone = null;
    await bewaarIndeling(next, `Zone ${z.naam} weggehaald.`);
    return;
  }
  if (t.dataset.erbij) {
    toevoegenIn = t.dataset.erbij;
    toevoeg = null;
    teken();
    return;
  }
  // Iets toevoegen (besluit 167): wat er hangt, hoe het aangaat, en bewaren.
  if (t.dataset.toevoegSoort) {
    toevoeg = { soort: t.dataset.toevoegSoort, aan: null, apparaat: null };
    teken();
    return;
  }
  if (t.dataset.toevoegAan && toevoeg) {
    toevoeg = { ...toevoeg, aan: t.dataset.toevoegAan, apparaat: null };
    teken();
    return;
  }
  if (t.hasAttribute('data-toevoeg-annuleer')) {
    toevoegenIn = null;
    toevoeg = null;
    teken();
    return;
  }
  if (t.hasAttribute('data-toevoeg-bewaar') && toevoeg && toevoegenIn) {
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
    await bewaarIndeling(next, `${huismodel.bronNaam(b)} toegevoegd bij ${k.naam}.`);
    return;
  }
  if (t.dataset.nacht) {
    comfortKeuze = { ...comfortNu(), nacht: t.dataset.nacht };
    await bewaarComfort();
    return;
  }
  if (t.hasAttribute('data-ookeigen')) {
    ookEigen = !ookEigen;
    if (ookEigen) await bewaarComfort();
    else teken();
    return;
  }
  if (t.dataset.rolwaarde) {
    // Wat de regeling met een apparaat doet (besluit 138), met de knoppen van de schets.
    const seg = t.closest('[data-rol]');
    const next = concept();
    const k = next?.kamers.find((x) => x.id === seg.dataset.rolkamer);
    const r = binnen().find((x) => x.id === seg.dataset.rolkamer);
    if (!k || !r) return;
    const rollen = Object.fromEntries(klimaatIn(r).map((a) => [sleutel(a), rolVan(k, r, sleutel(a))]));
    k.rollen = { ...(k.rollen ?? {}), ...rollen, [seg.dataset.rol]: t.dataset.rolwaarde };
    await bewaarIndeling(next);
    return;
  }
  if (t.dataset.fasen) {
    const a = antwoorden();
    const fasen = Number(t.dataset.fasen);
    const oud = a.zekering && a.zekering !== 'weetniet' ? a.zekering.ampere : null;
    a.zekering = { fasen, ampere: oud ?? (fasen === 1 ? 35 : 25) };
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.zekering) {
    const a = antwoorden();
    a.zekering = 'weetniet';
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.verwarming) {
    const a = antwoorden();
    a.verwarming = { ...a.verwarming, soort: t.dataset.verwarming };
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.panelen) {
    const a = antwoorden();
    if (t.dataset.panelen === 'geen') {
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
  if (t.dataset.dakkant) {
    const a = antwoorden();
    a.panelen = { ...a.panelen, ligging: t.dataset.dakkant };
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.contract) {
    // Het soort contract (besluit 158): één tarief laat het daltarief vallen.
    contractKeuze = t.dataset.contract;
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
  if (t.dataset.rond) {
    // Wat er rond het huis is (besluit 158): elk deel apart aan of uit.
    const next = concept();
    if (!next) return;
    const rond = { ...(next.rond ?? huismodel.rondNu(d.huis)) };
    const w = t.dataset.rond;
    rond[w] = !rond[w];
    if (w === 'oprit' && !rond.oprit) {
      rond.auto = false;
      rond.carport = false;
    }
    next.rond = rond;
    await bewaarIndeling(next);
    return;
  }
  if (t.dataset.meet) {
    // Meten met (besluit 123): een thermometer aan of uit voor deze kamer.
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.meetkamer);
    if (!k) return;
    const lijst = new Set(k.meten ?? []);
    if (lijst.has(t.dataset.meet)) lijst.delete(t.dataset.meet);
    else lijst.add(t.dataset.meet);
    if (lijst.size) k.meten = [...lijst].slice(0, 6);
    else delete k.meten;
    await bewaarIndeling(next);
    return;
  }
  if (t.dataset.flicht || t.dataset.fscherm || t.dataset.fcam) {
    const c = functiesNu();
    if (!c) return;
    if (t.dataset.flicht) c.licht = { ...c.licht, bedienen: t.dataset.flicht === 'true' };
    if (t.dataset.fscherm) c.schermen = { ...c.schermen, bedienen: t.dataset.fscherm === 'true' };
    if (t.dataset.fcam) c.cameras = { ...c.cameras, aan: t.dataset.fcam === 'true' };
    await bewaarFuncties(c);
  }
});

document.addEventListener('change', async (e) => {
  if (ligging.verander(e.target, ligStaat)) return teken();
  const t = e.target;
  const kamerNu = (next) => next?.kamers.find((x) => x.id === open);
  if (t.dataset.naam) {
    const v = t.value.trim();
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.naam);
    if (!k || !v || v === k.naam) return;
    k.naam = v;
    t.blur();
    await bewaarIndeling(next, 'Naam bewaard.');
  } else if (t.dataset.etage) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.etage);
    if (!k) return;
    k.etage = t.value;
    if (t.value === 'buiten') open = null;
    await bewaarIndeling(next, `${k.naam} staat nu op ${t.selectedOptions[0]?.textContent ?? 'een andere etage'}.`);
  } else if (t.dataset.soort) {
    // Wat voor kamer (besluit 119); leeg is weer het voorstel uit de naam.
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.soort);
    if (!k) return;
    if (t.value) k.soort = t.value;
    else delete k.soort;
    await bewaarIndeling(next, 'Soort bewaard.');
  } else if (t.dataset.zonenaam) {
    const next = concept();
    const z = kamerNu(next)?.zones.find((x) => x.id === t.dataset.zonenaam);
    const v = t.value.trim();
    if (!z || !v || z.naam === v) return;
    z.naam = v;
    await bewaarIndeling(next, `Zone heet nu ${v}.`);
  } else if (t.dataset.zonesoort) {
    const next = concept();
    const z = kamerNu(next)?.zones.find((x) => x.id === t.dataset.zonesoort);
    if (!z) return;
    if (t.value) z.soort = t.value;
    else delete z.soort;
    await bewaarIndeling(next, `Zone ${z.naam} bewaard.`);
  } else if (t.hasAttribute('data-nieuwezone')) {
    const next = concept();
    const k = kamerNu(next);
    const v = t.value.trim();
    if (!k || !v) return;
    const bezet = new Set(next.kamers.flatMap((x) => x.zones.map((z) => z.id)));
    // De eerste zone: de kamer zelf wordt het eerste deel, zodat er twee zijn.
    if (!k.zones.length) {
      const eigen = { id: idVan(k.naam, bezet), naam: k.naam };
      bezet.add(eigen.id);
      k.zones.push(eigen);
    }
    k.zones.push({ id: idVan(v, bezet), naam: v });
    await bewaarIndeling(next, `Zone ${v} toegevoegd.`);
  } else if (t.dataset.samen) {
    if (!t.value) return;
    const next = concept();
    const doel = next.kamers.find((x) => x.id === t.value)?.naam;
    const fout = samenvoegen(next, t.dataset.samen, t.value);
    if (fout) {
      t.value = '';
      zeg(fout, true);
      return;
    }
    await bewaarIndeling(next, `${doel} is nu een zone van ${next.kamers.find((x) => x.id === t.dataset.samen)?.naam}.`);
  } else if (t.dataset.bnaam) {
    const naam = t.value.trim();
    const x = (d.bewoners?.bewoners ?? []).find((y) => y.id === t.dataset.bnaam);
    if (naam && x && naam !== x.naam) await stuurBewoner({ actie: 'naam', id: x.id, naam });
  } else if (t.dataset.bbron !== undefined) {
    await stuurBewoner({ actie: 'aanwezigheid', id: t.dataset.bbron, bron: t.value || null });
  } else if (t.dataset.verplaats) {
    // Een apparaat naar een andere kamer (besluit 166).
    const next = concept();
    const doel = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((r) => r.id === t.value);
    if (!next || !doel) return;
    next.apparaten[t.dataset.verplaats] = { ...(next.apparaten[t.dataset.verplaats] ?? {}), kamer: doel.id, zone: null };
    openApparaat = null;
    await bewaarIndeling(next, `Staat nu in ${doel.naam}.`);
  } else if (t.dataset.bkoppel) {
    // Welke ruimte uit Home Assistant bij een deel buiten hoort (besluit 166).
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.value);
    if (!k) return;
    const b = buitenNu(k);
    k.buiten = { soort: t.dataset.bkoppel, auto: !!b.auto, tuinhuis: !!b.tuinhuis };
    await bewaarIndeling(next, `${k.naam} hoort nu bij ${RONDOM.find(([, , s]) => s === t.dataset.bkoppel)?.[1].toLowerCase() ?? t.dataset.bkoppel}.`);
  } else if (t.dataset.plek) {
    const next = concept();
    if (!next || !t.value) return;
    if (t.value === '-') next.verborgen = [...new Set([...(next.verborgen ?? []), t.dataset.plek])];
    else next.apparaten[t.dataset.plek] = { ...(next.apparaten[t.dataset.plek] ?? {}), kamer: t.value, zone: null };
    await bewaarIndeling(next);
  } else if (t.hasAttribute('data-ampere') && t.value) {
    const a = antwoorden();
    if (!a.zekering || a.zekering === 'weetniet') return;
    a.zekering = { ...a.zekering, ampere: Number(t.value) };
    await bewaarAansluiting(a);
  } else if (t.hasAttribute('data-inr-thermostaat')) {
    const a = antwoorden();
    a.verwarming = { ...a.verwarming, thermostaat: t.value || null };
    await bewaarAansluiting(a);
  } else if (t.hasAttribute('data-toevoeg-apparaat') && toevoeg) {
    toevoeg = { ...toevoeg, apparaat: t.value || null };
    teken();
  } else if (t.dataset.toevoegen) {

    const key = t.value;
    if (!key) return;
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.toevoegen);
    const r = binnen().find((x) => x.id === t.dataset.toevoegen);
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
  } else if (t.dataset.comfort) {
    const c = { ...comfortNu() };
    c[t.dataset.comfort] = Number(t.value);
    // Tussen verwarmen en koelen minstens een graad.
    if (t.dataset.comfort === 'warm' && c.koel < c.warm + 1) c.koel = c.warm + 1;
    if (t.dataset.comfort === 'koel' && c.warm > c.koel - 1) c.warm = c.koel - 1;
    comfortKeuze = c;
    await bewaarComfort();
  } else if (t.hasAttribute('data-dagvan') || t.hasAttribute('data-dagtot')) {
    comfortKeuze = { ...comfortNu(), [t.hasAttribute('data-dagvan') ? 'dag' : 'avond']: Number(t.value) };
    await bewaarComfort();
  } else if (t.dataset.aantal) {
    const v = t.value.trim();
    const n = v === '' ? null : Number(v);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 200)) return zeg('Een aantal van 1 tot 200', true);
    t.blur();
    const a = antwoorden();
    a.panelen = { ...a.panelen, [t.dataset.aantal]: n };
    await bewaarAansluiting(a);
  } else if (t.dataset.prijs) {
    const v = t.value.trim().replace(',', '.');
    const n = v === '' ? null : Number(v);
    const max = t.dataset.eenheid === 'm³' ? 5 : 2;
    if (n != null && !(n >= 0 && n < max)) return zeg(t.dataset.eenheid === 'm³' ? 'Een prijs per m³, zoals 1,35' : 'Een prijs per kWh, zoals 0,25', true);
    t.blur();
    await bewaarPrijzen({ [t.dataset.prijs]: n });
  } else if (t.dataset.meedoen) {
    // Meedoen met een andere kamer (besluit 142).
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.meedoen);
    if (!k) return;
    delete k.meedoenMet;
    if (t.value) {
      k.meedoenMet = t.value;
      k.regelzone = null;
    }
    await bewaarIndeling(next);
  }
});

// De schuif laat het getal meteen zien; bewaren gebeurt bij loslaten.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset?.comfort) return;
  const b = t.closest('.schuif')?.querySelector('b');
  if (b) b.textContent = `${nl(Number(t.value))}°`;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.matches?.('[data-nieuwnaam]')) document.querySelector(`${app.zicht()} [data-voegtoe]`)?.click();
  else if (e.target.matches?.('[data-naam], [data-bnaam], [data-prijs], [data-aantal], [data-zonenaam], [data-nieuwezone]')) e.target.blur();
});

addEventListener('standwissel', teken);
addEventListener('hashchange', () => {
  open = null;
  weghalen = null;
  ligStaat.aanpassen = false;
  toevoegenIn = null;
  if (stapNu() !== 'welkom') lijst = null;
  zeg('');
  teken();
});

app.start('instellingen');
void laad();
