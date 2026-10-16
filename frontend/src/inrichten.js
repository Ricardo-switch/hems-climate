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
 * bij Instellingen (indeling, comfort, aansluiting, energie). Overslaan kan
 * altijd: wat nog openstaat, staat bij Klaar, en alles is later te openen.
 */
'use strict';

const { $$, esc, haal, deur, nl } = app;

const d = { huis: null, ind: null, comfort: null, aans: null, energie: null, zon: null, functies: null, sessie: null };

async function laad() {
  const namen = ['huis', 'ind', 'comfort', 'aans', 'energie', 'zon', 'functies', 'sessie'];
  const uit = await Promise.allSettled(['api/huis', 'api/indeling', 'api/comfort', 'api/aansluiting', 'api/energie', 'api/zon', 'api/functies', 'api/sessie'].map((p) => haal(p)));
  uit.forEach((r, i) => {
    if (r.status === 'fulfilled') d[namen[i]] = r.value;
  });
  teken();
}

/* ------------------------------------------------------------ de stappen */

/** Zes hoofdstukken, elk met kleine stappen (besluit 144). */
const HOOFDSTUKKEN = [
  ['Je huis', [['huis', 'Kamers en etages'], ['buiten', 'Buiten']]],
  ['Apparaten', [['apparaten', 'Per kamer'], ['meten', 'Meten met']]],
  ['Klimaat', [['warmte', 'Wat elk apparaat doet'], ['comfort', 'Comfort']]],
  ['Energie', [['zon', 'Panelen'], ['zekering', 'Zekering'], ['prijzen', 'Prijzen en meters']]],
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
const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
const sleutel = (a) => a.actuatorId ?? a.id;
const energieNu = () => d.energie?.instellingen ?? d.energie?.voorstel ?? null;

/** Of een stap gedaan is, aan wat de dienst nu zegt. */
function gedaan(id) {
  if (id === 'huis') return d.huis?.indeling === 'eigen';
  if (id === 'apparaten') return d.huis != null && (d.huis.zonderRuimte ?? []).length === 0;
  if (id === 'warmte') return binnen().some((r) => klimaatIn(r).some((a) => a.klimaat?.rol && a.klimaat.rol !== 'kijken'));
  if (id === 'comfort') return (d.comfort?.kamers ?? []).some((k) => k.uitApp);
  if (id === 'buiten') return buitenKamers().every((k) => k.buiten != null);
  if (id === 'meten') return binnen().filter((r) => r.zoneId).every((r) => (r.meetMet ?? []).length > 0);
  if (id === 'zon') return d.aans?.antwoorden?.panelen?.ligging != null;
  if (id === 'zekering') return d.aans?.antwoorden?.zekering != null;
  if (id === 'prijzen') return d.energie?.instellingen?.prijzen?.stroom != null;
  if (id === 'functies') return d.functies?.instellingen != null;
  if (id === 'wand') return d.sessie != null && (d.sessie.toegang !== 'sessions' || d.sessie.ingelogd);
  if (id === 'klaar') return STAPPEN.every(([x]) => gedaan(x));
  return false;
}

function stapNu() {
  const h = decodeURIComponent(location.hash.slice(1));
  return ALLE.includes(h) ? h : 'welkom';
}
const naar = (id) => (location.hash = id);
const volgende = (id) => ALLE[Math.min(ALLE.length - 1, ALLE.indexOf(id) + 1)];

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
async function bewaarIndeling(next) {
  const uit = await stuur('api/indeling', next);
  if (!uit) return false;
  d.ind = { ...d.ind, indeling: uit };
  d.huis = await haal('api/huis').catch(() => d.huis);
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
  const { etages, oprit, tuin, terras, balkon, voortuin } = t;
  const metZon = i >= ALLE.indexOf('zon');
  return {
    beschrijving: 'Je huis, zoals Smart Climate het nu kent.',
    tijd: app.tijdVanDeDag(d.zon),
    wolken: 0.3,
    zon: { stand: d.zon?.dag?.fractie ?? 0.4, hoogte: d.zon?.dag?.hoogteDeel ?? 0.6, aandeel: metZon ? 0.6 : 0.2, panelen: metZon ? t.panelen : 0 },
    etages,
    voordeur: t.voordeur,
    buitenunit: i >= ALLE.indexOf('apparaten') && t.buitenunit ? { ...t.buitenunit, aan: false } : null,
    net: true,
    oprit,
    tuin,
    terras,
    balkon,
    voortuin,
    stromen: [],
    labels: [],
  };
}

/* ------------------------------------------------------------ de vragen */

const knop = (attrs, tekst, aan = false, klasse = '') => `<button type="button" class="chip${aan ? ' aan' : ''}${klasse ? ` ${klasse}` : ''}" ${attrs} aria-pressed="${aan}">${esc(tekst)}</button>`;
const rij = (kop, inhoud, extra = '') => `<div class="rij"><b>${esc(kop)}</b><div class="chips">${inhoud}</div>${extra}</div>`;
const meervoud = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;
/** "a, b en c". */
const lijstje = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} en ${xs.at(-1)}` : xs.join(''));

function welkom() {
  const etages = (d.huis?.etages ?? []).filter((e) => e.ruimtes?.length).length;
  const ruimtes = (d.huis?.etages ?? []).reduce((t, e) => t + (e.ruimtes?.length ?? 0), 0);
  const apparaten = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).reduce((t, r) => t + (r.apparaten?.length ?? 0), 0) + (d.huis?.zonderRuimte?.length ?? 0);
  const klimaat = binnen().flatMap(klimaatIn).length;
  return {
    waar: 'Welkom',
    kop: 'Laten we je huis neerzetten',
    groot: true,
    uitleg: 'Smart Climate vond je Home Assistant. Wat het daar al weet, staat klaar; jij kijkt of het klopt. Het duurt een minuut of vijf.',
    inhoud: d.huis
      ? `<div class="cijfers"><div><b>${etages}</b><span>${etages === 1 ? 'etage' : 'etages'}</span></div><div><b>${ruimtes}</b><span>ruimtes</span></div><div><b>${apparaten}</b><span>apparaten</span></div><div><b>${klimaat}</b><span>om te verwarmen of koelen</span></div></div>
         <div class="noot">Er verandert niets in Home Assistant. Smart Climate kijkt eerst mee en zegt wat het zou doen.</div>`
      : '<p class="zacht">Even het huis lezen uit Home Assistant…</p>',
    links: '',
    rechts: '<a class="knop knop-licht" href="#huis">Begin</a>',
  };
}

let open = null; // de kamer of etage waaraan iets verandert
function huisStap() {
  const c = concept();
  const etages = d.ind?.etages ?? [];
  const naamVan = (e) => c?.etages?.[e.id] ?? e.standaardNaam;
  const rijen = etages.map((e) => {
    const kamers = (c?.kamers ?? []).filter((k) => k.etage === e.id);
    const chips = kamers.map((k) => knop(`data-kamer="${esc(k.id)}"`, k.naam, open === k.id)).join('') + knop(`data-nieuw="${esc(e.id)}"`, '+', open === `nieuw:${e.id}`, 'plus');
    let bewerk = '';
    const k = kamers.find((x) => x.id === open);
    if (k) {
      bewerk = `<div class="bewerk"><input class="veld" data-naam="${esc(k.id)}" value="${esc(k.naam)}" aria-label="Naam van de kamer" maxlength="40"><select class="veld" data-etage="${esc(k.id)}" aria-label="Etage">${etages.map((x) => `<option value="${esc(x.id)}" ${x.id === k.etage ? 'selected' : ''}>${esc(naamVan(x))}</option>`).join('')}</select></div>`;
    } else if (open === `nieuw:${e.id}`) {
      bewerk = `<div class="bewerk"><input class="veld" data-nieuwnaam="${esc(e.id)}" placeholder="Naam, bijvoorbeeld Kantoor" aria-label="Naam van de nieuwe kamer" maxlength="40"><button type="button" class="chip aan" data-voegtoe="${esc(e.id)}">Toevoegen</button></div>`;
    }
    return rij(naamVan(e), chips, bewerk);
  });
  return {
    waar: waarVan('huis'),
    kop: 'Klopt je huis?',
    uitleg: 'De ruimtes uit Home Assistant, per etage. Tik op een kamer om hem te hernoemen of te verplaatsen.',
    inhoud: `<div class="rijen">${rijen.join('')}</div><div class="noot">Een open keuken en zithoek zijn één kamer. Een deur ertussen maakt twee kamers.</div>`,
    links: '<a class="zachtknop" href="#welkom">Terug</a>',
    rechts: '<button type="button" class="knop knop-licht" data-klopt>Klopt</button>',
  };
}

function apparatenStap() {
  const los = d.huis?.zonderRuimte ?? [];
  const kamers = (d.huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).map((r) => ({ r, e })));
  const opties = (voorstel) => `<option value="">Kies een kamer…</option>${kamers.map(({ r }) => `<option value="${esc(r.id)}" ${r.id === voorstel ? 'selected' : ''}>${esc(r.naam)}</option>`).join('')}<option value="-">Niet tonen</option>`;
  const ingedeeld = kamers.reduce((t, { r }) => t + (r.apparaten?.length ?? 0), 0);
  const inhoud = los.length
    ? `<div class="rijen">${los.slice(0, 40).map((a) => `<div class="rij"><b>${esc(a.naam)}</b><div class="chips"><select class="veld" data-plek="${esc(a.id)}" aria-label="Kamer voor ${esc(a.naam)}">${opties(a.voorstelKamer)}</select></div></div>`).join('')}</div>`
    : '<div class="noot">Alles heeft een plek. Komt er iets nieuws bij in Home Assistant, dan staat het bij de bel.</div>';
  return {
    waar: waarVan('apparaten'),
    kop: los.length ? `Waar staan ${meervoud(los.length, 'dit apparaat', 'deze apparaten')}?` : 'Alles heeft een plek',
    uitleg: `${meervoud(ingedeeld, 'apparaat staat', 'apparaten staan')} al in een kamer, uit de ruimtes van Home Assistant.${los.length ? ' Wat nog los staat, zet je hier neer.' : ''}`,
    inhoud,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#meten">Volgende</a>',
  };
}

/* Buiten (besluit 109): wat elke buitenruimte is, en wat erbij hoort in de tekening. */
const buitenKamers = () => (concept()?.kamers ?? []).filter((k) => k.etage === 'buiten');
const BUITEN_SOORTEN = [['oprit', 'Oprit'], ['tuin', 'Tuin'], ['voortuin', 'Voortuin'], ['terras', 'Terras'], ['balkon', 'Balkon']];
function buitenNu(k) {
  const r = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((x) => x.id === k.id);
  return k.buiten ?? r?.buiten ?? huismodel.soortBuiten(k);
}
function buitenStap() {
  const kamers = buitenKamers();
  const gevonden = (d.huis?.etages ?? []).filter((e) => e.id === 'buiten').flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
  const wat = [gevonden.some((a) => a.soort === 'camera') ? 'camera' : null, gevonden.some((a) => a.soort === 'screen') ? 'zonnescherm' : null, gevonden.some((a) => a.soort === 'licht') ? 'buitenlampen' : null].filter(Boolean);
  const rijen = kamers.map((k) => {
    const b = buitenNu(k);
    const extra = b.soort === 'oprit' ? knop(`data-bauto="${esc(k.id)}"`, 'Auto', !!b.auto) : b.soort === 'tuin' ? knop(`data-btuinhuis="${esc(k.id)}"`, 'Tuinhuis', !!b.tuinhuis) : '';
    return rij(k.naam, BUITEN_SOORTEN.map(([w, t]) => knop(`data-bsoort="${esc(k.id)}" data-waarde="${w}"`, t, b.soort === w)).join('') + extra);
  });
  return {
    waar: waarVan('buiten'),
    kop: 'Wat ligt er rond je huis?',
    uitleg: kamers.length ? 'Zo komt het in de tekening: de oprit met de auto, de tuin met het tuinhuis.' : 'Er staat nog geen buitenruimte in je huis. Een tuin of oprit voeg je toe bij Indeling, op de etage Buiten.',
    inhoud: `${kamers.length ? `<div class="rijen">${rijen.join('')}</div>` : ''}${wat.length ? `<div class="noot">Gevonden buiten: ${esc(wat.join(', '))}. Die komen in de tekening.</div>` : ''}`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#apparaten">Volgende</a>',
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
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#warmte">Volgende</a>',
  };
}

/* De regeling per kamer (besluit 138): dezelfde drie keuzes als bij Indeling. */
const ROLLEN = [['houdt', 'Houdt op temperatuur', 'Houdt'], ['zon', 'Helpt op zon', 'Zon'], ['kijken', 'Alleen kijken', 'Kijkt']];
const rolVan = (k, r, key) => (k?.rollen ? (k.rollen[key] ?? 'kijken') : (klimaatIn(r).find((a) => sleutel(a) === key)?.klimaat?.rol ?? 'kijken'));
let toevoegenIn = null;
function warmteStap() {
  const c = concept();
  const elders = binnen().flatMap((r) => klimaatIn(r).map((a) => ({ a, r })));
  const los = (d.huis?.zonderRuimte ?? []).filter((x) => x.soort === 'klimaat');
  const rijen = binnen().map((r) => {
    const k = c?.kamers.find((x) => x.id === r.id);
    // Drie knoppen naast elkaar, zoals de schets: houdt, zon, kijkt (besluit 146).
    const toestellen = klimaatIn(r).map((a) => {
      const nuRol = rolVan(k, r, sleutel(a));
      const knoppen = ROLLEN.map(([w, t, kort]) => `<button type="button" class="${w === 'zon' ? 'zon' : ''}" data-rolwaarde="${w}" aria-pressed="${w === nuRol}" title="${t}">${kort}</button>`).join('');
      return `<div class="toestel">${esc(a.naam)}<div class="seg" role="group" aria-label="Wat de regeling met ${esc(a.naam)} doet" data-rol="${esc(sleutel(a))}" data-rolkamer="${esc(r.id)}">${knoppen}</div></div>`;
    }).join('');
    const bronnen = (r.bronnen ?? []).filter((b) => !b.apparaat).map((b) => `<span class="chip gevonden">${esc(huismodel.bronNaam(b))}</span>`).join('');
    const keuze = toevoegenIn === r.id
      ? `<select class="veld" data-toevoegen="${esc(r.id)}" aria-label="Apparaat uit Home Assistant"><option value="">Kies uit Home Assistant…</option>${[...los.map((x) => ({ key: x.id, naam: x.naam, waar: 'nog los' })), ...elders.filter((x) => x.r.id !== r.id).map((x) => ({ key: sleutel(x.a), naam: x.a.naam, waar: x.r.naam }))].map((x) => `<option value="${esc(x.key)}">${esc(x.naam)} (${esc(x.waar)})</option>`).join('')}</select>`
      : knop(`data-erbij="${esc(r.id)}"`, '+ Iets toevoegen', false, 'plus');
    // Zonder eigen apparaat: meedoen met een kamer die wel regelt (besluit 142).
    const regelaars = binnen().filter((x) => x.id !== r.id && x.zoneId);
    const mee = !toestellen && regelaars.length ? `<select class="veld" data-meedoen="${esc(r.id)}" aria-label="Doet ${esc(r.naam)} mee met een andere kamer?"><option value="">Doet niet mee</option>${regelaars.map((x) => `<option value="${esc(x.id)}" ${k?.meedoenMet === x.id ? 'selected' : ''}>Doet mee met ${esc(x.naam)}</option>`).join('')}</select>` : '';
    const inhoud = `<div class="kolom" style="width: 100%">${toestellen}${bronnen ? `<div class="chips">${bronnen}</div>` : ''}${mee}${!toestellen && !bronnen && !mee ? '<span class="zacht">niets, dat is goed</span>' : ''}<div class="chips">${keuze}</div></div>`;
    return `<div class="rij"><b>${esc(r.naam)}</b>${inhoud}</div>`;
  });
  return {
    waar: waarVan('warmte'),
    kop: 'Wat verwarmt en koelt er?',
    uitleg: 'Per kamer wat er hangt, en wat de regeling ermee doet. Een kamer zonder eigen apparaat kan meedoen met een kamer ernaast.',
    inhoud: `<div class="rijen">${rijen.join('') || '<p class="zacht">Nog geen kamers.</p>'}</div>`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#comfort">Volgende</a>',
  };
}

/** Wat de meeste kamers zeggen, of een gewone waarde. */
function meest(lijst, anders) {
  const tel = new Map();
  for (const v of lijst) if (v != null) tel.set(v, (tel.get(v) ?? 0) + 1);
  return [...tel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? anders;
}
let comfortKeuze = null;
function comfortNu() {
  if (comfortKeuze) return comfortKeuze;
  const kamers = d.comfort?.kamers ?? [];
  const warm = meest(kamers.filter((k) => k.kanVerwarmen).map((k) => k.modi.dag.heat), 20);
  const koel = meest(kamers.filter((k) => k.kanKoelen).map((k) => k.modi.dag.cool), 24);
  const nachtHeat = meest(kamers.filter((k) => k.kanVerwarmen).map((k) => k.modi.nacht.heat), null);
  const nacht = kamers.every((k) => k.modi.nacht.heat == null && k.modi.nacht.cool == null) ? 'uit' : nachtHeat === warm ? 'zelfde' : 'koeler';
  return { warm, koel: Math.max(koel, warm + 1), nacht, dag: d.comfort?.dagdelen?.dag ?? 7, avond: d.comfort?.dagdelen?.nacht ?? 22 };
}
function comfortStap() {
  if (!d.comfort?.kamers?.length) {
    return { waar: waarVan('comfort'), kop: 'Hoe warm wil je het?', uitleg: 'Comfort komt zodra er een kamer meedoet in de regeling, bij Verwarmen en koelen.', inhoud: '', links: '<a class="zachtknop" href="#warmte">Terug</a>', rechts: '<a class="knop knop-licht" href="#zon">Volgende</a>' };
  }
  const c = comfortNu();
  const uur = (u) => `${String(u).padStart(2, '0')}:00`;
  const kanKoelen = d.comfort.kamers.some((k) => k.kanKoelen);
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
      </div>`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#zon">Volgende</a>',
  };
}
async function bewaarComfort() {
  const c = comfortNu();
  const kamers = Object.fromEntries(d.comfort.kamers.map((k) => {
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

const LIGGING = [['voorkant', 'Voorkant'], ['achterkant', 'Achterkant'], ['beide', 'Beide kanten'], ['plat', 'Plat dak'], ['weetniet', 'Weet ik niet']];
const VERWARMING = [['cv', 'Cv-ketel'], ['warmtepomp', 'Warmtepomp'], ['stadsverwarming', 'Stadsverwarming']];
function antwoorden() {
  const x = d.aans?.antwoorden;
  return {
    panelen: { ligging: x?.panelen?.ligging ?? null, aantal: x?.panelen?.aantal ?? null, voorkant: x?.panelen?.voorkant ?? null, achterkant: x?.panelen?.achterkant ?? null },
    zekering: x?.zekering ?? null,
    tarief: x?.tarief ?? null,
    verwarming: { soort: x?.verwarming?.soort ?? null, aanvoerC: x?.verwarming?.aanvoerC ?? null },
    opZon: { ...(x?.opZon ?? {}) },
  };
}
function zonStap() {
  const a = antwoorden();
  const e = energieNu();
  const piekW = (d.zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
  const aantal = a.panelen.aantal ?? (piekW > 0 ? Math.round(piekW / 400) : 0);
  return {
    waar: waarVan('zon'),
    kop: 'Je panelen en je verwarming',
    uitleg: 'Wat Smart Climate al vond, staat er. Weet je iets niet, dan kan het later; het huis werkt toch.',
    inhoud: `<div class="rijen">
        ${rij('Panelen', `${piekW > 0 ? `<span class="chip gevonden">✓ ${aantal ? `${aantal} panelen, ` : ''}${nl(piekW / 1000)} kWp</span>` : '<span class="zacht">geen gevonden</span>'}<select class="veld" data-ligging aria-label="Waar de panelen liggen" style="width: auto"><option value="">Waar liggen ze?</option>${LIGGING.map(([w, t]) => `<option value="${w}" ${a.panelen.ligging === w ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${rij('Verwarming', VERWARMING.map(([w, t]) => knop(`data-verwarming="${w}"`, t, a.verwarming.soort === w)).join(''))}
      </div>`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#zekering">Volgende</a>',
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
    uitleg: 'Het staat op de hoofdschakelaar in de meterkast. Zo zet het huis nooit meer aan dan je zekering aankan.',
    inhoud: `<div class="chips">${knop('data-fasen="1"', '1 fase', zek?.fasen === 1)}${knop('data-fasen="3"', '3 fasen', zek?.fasen === 3)}${knop('data-zekering="weetniet"', 'weet ik niet', a.zekering === 'weetniet')}</div>
      <label class="invul"><span>Hoofdzekering</span>${keuze}</label>`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#prijzen">Volgende</a>',
  };
}

function prijzenStap() {
  const e = energieNu();
  const meters = [e?.net?.afname?.length ? 'stroom van het net' : null, e?.zon?.length ? 'zonnepanelen' : null, e?.gas ? 'gas' : null, e?.apparaten?.length ? `${e.apparaten.length} ${e.apparaten.length === 1 ? 'apparaat' : 'apparaten'}` : null].filter(Boolean);
  const p = e?.prijzen ?? {};
  const veld = (sleutel, label, waarde, voorbeeld) => `<label class="invul"><span>${esc(label)}</span><span class="waarde">€<input inputmode="decimal" data-prijs="${sleutel}" value="${waarde != null ? String(waarde).replace('.', ',') : ''}" placeholder="${voorbeeld}" aria-label="${esc(label)} per kWh"></span></label>`;
  const overnemen = d.energie?.voorstel && !d.energie?.instellingen ? '<button type="button" class="chip aan" data-overnemen>Overnemen uit Home Assistant</button>' : '';
  return {
    waar: waarVan('prijzen'),
    kop: 'Wat betaal je per kWh?',
    uitleg: 'Van je contract of je jaarafrekening. Zo rekent Opbrengst in euro\'s, en weet het huis wanneer zon het meest waard is.',
    inhoud: `<div>
        ${veld('stroom', 'Stroom normaal', p.stroom, '0,27')}
        ${veld('stroomDal', 'Stroom dal', p.stroomDal, '0,25')}
        <div class="invul"><span>Terug, gesaldeerd</span><span class="waarde">zelfde prijs</span></div>
      </div>
      <div class="noot">${meters.length ? `Uit je Energie-dashboard: ${esc(lijstje(meters))}.${d.energie?.instellingen ? ' Overgenomen.' : ''}` : 'Nog geen meter gevonden in je Energie-dashboard.'} Eén tarief? Laat dal leeg; de rest kan later bij Energie.</div>
      ${overnemen ? `<div class="chips">${overnemen}</div>` : ''}`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#functies">Volgende</a>',
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
          ${f.schermMogelijk ? rij('Screens', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']].map(([w, t]) => knop(`data-fscherm="${w}"`, t, c.schermen?.bedienen === w)).join('')) : ''}
          ${cams.length ? rij("Camera's", [[true, 'In de app'], [false, 'Niet tonen']].map(([w, t]) => knop(`data-fcam="${w}"`, t, c.cameras?.aan === w)).join('') + `<span class="zacht">${esc(cams.map((x) => x.naam).join(', '))}</span>`) : ''}
        </div>`
      : '<p class="zacht">Even lezen uit Home Assistant…</p>',
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#wand">Volgende</a>',
  };
}
async function bewaarFuncties(c) {
  const uit = await stuur('api/functies', c);
  if (uit) {
    d.functies = await haal('api/functies').catch(() => d.functies);
    teken();
  }
}
/** Wat je op de wand kunt, uit de keuzes bij Licht en camera's. */
function wandRijen() {
  const c = functiesNu();
  if (!c) return '';
  const cams = (d.functies?.gevonden?.cameras ?? []).map((x) => x.naam);
  const rijen = [
    d.functies?.lichtMogelijk || d.functies?.schermMogelijk ? ['Licht en screens', c.licht?.bedienen === false && c.schermen?.bedienen === false ? 'alleen kijken' : 'bedienen in de app'] : null,
    cams.length ? ['Camera’s', c.cameras?.aan ? cams.join(', ') : 'niet in de app'] : null,
  ].filter(Boolean);
  return rijen.length ? `<div>${rijen.map(([k, v]) => `<div class="waarderij">${esc(k)}<span>${esc(v)}</span></div>`).join('')}</div>` : '';
}
function wandStap() {
  const s = d.sessie;
  const terug = encodeURIComponent(`${location.pathname}#wand`);
  const nodig = s?.toegang === 'sessions';
  return {
    waar: waarVan('wand'),
    kop: nodig && !s.ingelogd ? 'Log de wand één keer in' : 'De wand is klaar',
    uitleg: !s ? 'Even kijken…' : !nodig ? 'Deze weergave vraagt geen inlog: wie hem kan openen, kan ook bedienen.' : s.ingelogd ? `Ingelogd als ${s.naam ?? 'bewoner'}. Licht, screens en de deurbel werken vanaf hier.` : 'Kijken kan zonder. Licht, screens en de deurbel bedienen vraagt je account van Home Assistant, één keer op dit scherm.',
    inhoud: `${wandRijen()}${nodig && !s.ingelogd ? `<a class="knop knop-licht" href="auth/login?terug=${terug}" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Inloggen met Home Assistant</a>` : ''}`,
    links: '<button type="button" class="zachtknop" data-later>Later</button>',
    rechts: '<a class="knop knop-licht" href="#klaar">Volgende</a>',
  };
}
async function bewaarAansluiting(a) {
  const opZon = Object.fromEntries(Object.entries(a.opZon).filter(([, v]) => typeof v === 'boolean'));
  const uit = await stuur('api/aansluiting', { panelen: a.panelen, zekering: a.zekering, tarief: a.tarief, verwarming: a.verwarming, opZon });
  if (uit) {
    d.aans = uit;
    teken();
  }
}
async function bewaarPrijs(waarde, sleutel = 'stroom') {
  const e = JSON.parse(JSON.stringify(energieNu() ?? { versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } }));
  e.prijzen[sleutel] = waarde;
  const uit = await stuur('api/energie', { ...e, bron: e.bron ?? 'zelf' });
  if (uit) {
    d.energie = { ...d.energie, instellingen: uit };
    teken();
  }
}

function klaarStap() {
  const open = STAPPEN.filter(([id]) => !gedaan(id));
  const later = open.length
    ? `<div class="noot later">Nog ${meervoud(open.length, 'ding', 'dingen')} voor later: ${open.map(([id, t]) => `<a href="#${id}">${esc(t.toLowerCase())}</a>`).join(', ')}. Ook later te openen bij Instellingen, onder Inrichten.</div>`
    : '';
  return {
    waar: 'Klaar',
    kop: 'Je huis staat erin',
    groot: true,
    uitleg: 'Smart Climate kijkt vanaf nu mee. Dit is wat het kan:',
    inhoud: `<button type="button" class="filmkaart" data-film aria-label="Speel de film af: een dag in je huis, 45 seconden"><span class="speel" aria-hidden="true"></span><span>Een dag in je huis · 45 seconden</span></button>
      <div class="noot">Daarna laten we je de app zien, in twaalf stops van een paar tellen. Overslaan kan altijd; terugkijken bij het vraagteken op Thuis.</div>${later}`,
    links: '<a class="zachtknop" href="thuis.html#rondleiding">Overslaan</a>',
    rechts: '<button type="button" class="knop knop-licht" data-film>Speel af</button>',
  };
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const nu = stapNu();
  $$('[data-stappen]').forEach((el) => {
    // Zes kaarten: vijf hoofdstukken en Klaar, met een balkje per stap en wat erin zit (besluit 146).
    const alle = [...HOOFDSTUKKEN, ['Klaar', [['klaar', 'De film · de rondleiding']]]];
    el.innerHTML = alle.map(([titel, stappen], i) => {
      const hier = stappen.some(([id]) => id === nu);
      const klaar = stappen.every(([id]) => gedaan(id));
      const stipjes = stappen.map(([id]) => `<i class="${id === nu ? 'nu' : gedaan(id) ? 'al' : ''}"></i>`).join('');
      const sub = stappen.map(([, t], j) => (j ? t.toLowerCase() : t)).join(' · ');
      return `<a class="stap${hier ? ' nu' : ''}${klaar ? ' klaar' : ''}" href="#${stappen[0][0]}" ${hier ? 'aria-current="step"' : ''}><span class="n" aria-hidden="true">${klaar && !hier ? '✓' : i + 1}</span><span class="kort">${esc(titel)}</span><span class="naam">${i + 1}. ${esc(titel)}</span><span class="stipjes" aria-hidden="true">${stipjes}</span><span class="sub">${esc(sub)}</span></a>`;
    }).join('');
  });
  const v = { welkom, huis: huisStap, buiten: buitenStap, apparaten: apparatenStap, meten: metenStap, warmte: warmteStap, comfort: comfortStap, zon: zonStap, zekering: zekeringStap, prijzen: prijzenStap, functies: functiesStap, wand: wandStap, klaar: klaarStap }[nu]();
  const actief = document.activeElement;
  // Niet onder de vinger opnieuw opbouwen terwijl iemand typt.
  if (actief && actief.matches?.('[data-kaart] input[type="text"], [data-kaart] input:not([type])') && actief.closest('[data-kaart]')) return;
  $$('[data-kaart]').forEach((el) => {
    el.innerHTML = `<span class="waar">${esc(v.waar)}</span>
      <h1 class="${v.groot ? 'kop-1' : 'kop-2'}" style="${v.groot ? 'font-size: 44px; line-height: 1.05' : ''}">${esc(v.kop)}</h1>
      <p class="uitleg">${esc(v.uitleg)}</p>
      ${v.inhoud}
      <span class="melding-inr${melding.fout ? ' fout' : ''}" data-melding>${esc(melding.tekst)}</span>
      <div class="voet">${v.links || '<span></span>'}${v.rechts}</div>`;
  });
  const m = model(nu);
  if (!app.telStand()) huis.teken(document.querySelector('[data-podium="wand"]'), m, { breedte: 700, hoogte: 640, marge: 0.04, zoom: 1, schuifY: 10 });
  else huis.teken(document.querySelector('[data-podium="tel"]'), m, { breedte: 360, hoogte: 220, marge: 0.04, zoom: 1 });
}
const teken = app.gebundeld(tekenNu);

/* ------------------------------------------------------------ doen */

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.hasAttribute('data-film')) {
    // Het filmpje (besluit 139), en daarna de rondleiding op Thuis.
    void film.speel({ opEinde: () => (location.href = 'thuis.html#rondleiding') });
    return;
  }
  if (t.hasAttribute('data-later')) {
    naar(volgende(stapNu()));
    return;
  }
  if (t.hasAttribute('data-klopt')) {
    // Het voorstel uit Home Assistant wordt de eigen indeling.
    if (d.huis?.indeling !== 'eigen' && !(await bewaarIndeling(concept()))) return;
    naar('buiten');
    return;
  }
  if (t.dataset.kamer) {
    open = open === t.dataset.kamer ? null : t.dataset.kamer;
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
    if (await bewaarIndeling(next)) zeg(`${naam} toegevoegd.`);
    return;
  }
  if (t.dataset.erbij) {
    toevoegenIn = t.dataset.erbij;
    teken();
    return;
  }
  if (t.dataset.nacht) {
    comfortKeuze = { ...comfortNu(), nacht: t.dataset.nacht };
    await bewaarComfort();
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
    const w = t.dataset.zekering;
    a.zekering = w === 'weetniet' ? 'weetniet' : JSON.parse(w);
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.verwarming) {
    const a = antwoorden();
    a.verwarming = { ...a.verwarming, soort: t.dataset.verwarming };
    await bewaarAansluiting(a);
    return;
  }
  if (t.dataset.bsoort || t.dataset.bauto || t.dataset.btuinhuis) {
    // Wat een buitenruimte is, en wat erbij hoort (besluit 109).
    const next = concept();
    const k = next?.kamers.find((x) => x.id === (t.dataset.bsoort ?? t.dataset.bauto ?? t.dataset.btuinhuis));
    if (!k) return;
    const b = { ...buitenNu(k) };
    if (t.dataset.bsoort) b.soort = t.dataset.waarde;
    if (t.dataset.bauto) b.auto = !b.auto;
    if (t.dataset.btuinhuis) b.tuinhuis = !b.tuinhuis;
    k.buiten = { soort: b.soort, auto: !!b.auto, tuinhuis: !!b.tuinhuis };
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
  if (t.hasAttribute('data-overnemen')) {
    const v = JSON.parse(JSON.stringify(d.energie.voorstel));
    const uit = await stuur('api/energie', { ...v, bron: v.bron ?? 'dashboard' });
    if (uit) {
      d.energie = { ...d.energie, instellingen: uit };
      teken();
    }
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
  const t = e.target;
  if (t.dataset.naam) {
    const v = t.value.trim();
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.naam);
    if (!k || !v || v === k.naam) return;
    k.naam = v;
    t.blur();
    await bewaarIndeling(next);
  } else if (t.dataset.etage) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === t.dataset.etage);
    if (!k) return;
    k.etage = t.value;
    await bewaarIndeling(next);
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
  } else if (t.hasAttribute('data-ligging')) {
    const a = antwoorden();
    a.panelen = { ...a.panelen, ligging: t.value || null };
    await bewaarAansluiting(a);
  } else if (t.hasAttribute('data-prijs')) {
    const v = t.value.trim().replace(',', '.');
    const n = v === '' ? null : Number(v);
    if (n != null && !(n >= 0 && n < 2)) return zeg('Een prijs per kWh, zoals 0,25', true);
    t.blur();
    await bewaarPrijs(n, t.dataset.prijs || 'stroom');
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
  else if (e.target.matches?.('[data-naam], [data-prijs]')) e.target.blur();
});

addEventListener('standwissel', teken);
addEventListener('hashchange', () => {
  open = null;
  toevoegenIn = null;
  zeg('');
  teken();
});

app.start('instellingen');
void laad();
