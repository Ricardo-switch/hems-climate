/*
 * Energie (besluit 130, schets Wand-Instellingen-Energie): je panelen, je
 * aansluiting, je meters, wat je betaalt en je verwarming, in één groep.
 * Hier kwamen Zon en aansluiting (besluiten 103, 117, 122) en Meters en prijzen
 * (102, 110, 116) samen: het contract stond bij het een en de prijzen bij het
 * ander. Twee deuren in de dienst, één pagina; wat je verandert, wordt meteen
 * bewaard. Bewaren vraagt een beheerder.
 */
'use strict';

const { $$, esc, haal, nl } = app;

let zon = null;
/** Het huis (besluit 167): de thermostaten, voor wie de ketel aanzet. */
let huisData = null;
/** De aansluiting: wat de dienst zegt (`api/aansluiting`), en de antwoorden zoals ze nu zijn. */
let aInfo = null;
let a = null;
/** De meters en prijzen (`api/energie`). */
let eInfo = null;
let e = null;
/** Normaal en dal gekozen; los van de prijs, want die kan nog leeg zijn. */
let dubbel = false;
/** Een eigen hoofdzekering invullen; zolang die niet compleet is, staat hij hier. */
let zelf = null;
/** Aanpassen van hoe de panelen liggen (besluit 157, panelen.js). */
const ligStaat = { aanpassen: false, concept: null, na: () => teken() };

const leeg = () => ({ versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } });
/** Tarief 1 van een slimme meter is het daltarief (zelfde regel als de dienst, tarief.ts). */
const raadDal = (id) => /(?:tarief|tariff|tarif)[ _-]?1(?![0-9])|_t1(?![0-9a-z])|\blaag\b|\blow\b|dal[ _-]?tarief|(?:^|[^a-z])dal(?:[^a-z]|$)/i.test(id);

/** Vult aan wat een oudere instelling nog niet had, zodat het scherm één vorm kent. */
function aanvullen(c) {
  const p = c.prijzen;
  p.stroomDal ??= null;
  p.dalUren ??= 'nl';
  p.dalEigen ??= { van: 23, tot: 7, weekend: true };
  p.salderen ??= true;
  p.vanaf2027 ??= { vergoeding: null, kosten: null };
  p.vast ??= [];
  p.contractStart ??= null;
  if (p.vastPerMaand != null && !p.vast.length) p.vast.push({ naam: 'Vaste kosten', bedrag: p.vastPerMaand, per: 'maand', soort: 'stroom' });
  p.vastPerMaand = null;
  c.net.dal ??= [...c.net.afname, ...c.net.teruglevering].filter(raadDal);
  return c;
}

async function laadAlles() {
  const [ai, ei, z, h] = await Promise.allSettled([haal('api/aansluiting'), haal('api/energie'), haal('api/zon'), haal('api/huis')]);
  if (z.status === 'fulfilled') zon = z.value;
  // De thermostaten uit het huis (besluit 167): welke de ketel stuurt.
  if (h.status === 'fulfilled') huisData = h.value;
  if (ai.status === 'fulfilled') {
    aInfo = ai.value;
    const x = aInfo.antwoorden;
    a = {
      panelen: { ligging: x?.panelen.ligging ?? null, aantal: x?.panelen.aantal ?? null, voorkant: x?.panelen.voorkant ?? null, achterkant: x?.panelen.achterkant ?? null },
      zekering: x?.zekering ?? null,
      tarief: x?.tarief ?? null,
      verwarming: { soort: x?.verwarming?.soort ?? null, aanvoerC: x?.verwarming?.aanvoerC ?? null, thermostaat: x?.verwarming?.thermostaat ?? null },
      voorkantZon: x?.voorkantZon ?? null,
      dak: x?.dak ?? null,
      opZon: { ...(x?.opZon ?? {}) },
      // Apparaten uit de configuratie die van zon zijn gehaald (besluit 167): gaan mee.
      opZonUit: [...(x?.opZonUit ?? [])],
    };
  }
  if (ei.status === 'fulfilled') {
    eInfo = ei.value;
    e = aanvullen(JSON.parse(JSON.stringify(eInfo.instellingen ?? eInfo.voorstel ?? leeg())));
    dubbel = e.prijzen.stroomDal != null;
  }
  teken();
}

/* ------------------------------------------------------------ hulpjes */

const gelijk = (x, y) => JSON.stringify(x) === JSON.stringify(y);

/** Een rij keuzes waarvan er één aan staat; de waarde staat als JSON op de knop. */
function keuzes(label, sleutel, opties, huidig, uit = false) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${gelijk(w, huidig)}" ${uit ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
}
function bedragVeld(label, pad, waarde, hint = '', min = '0', leegIsFout = false) {
  return `<label class="veldnaam">${esc(label)}<input class="invoer${leegIsFout && waarde == null ? ' leeg' : ''}" type="number" inputmode="decimal" step="any" ${min === '' ? '' : `min="${min}"`} data-prijs="${esc(pad)}" value="${waarde ?? ''}" placeholder="${esc(hint)}"></label>`;
}
const kop = (t, rechts = '') => `<div class="kopregel"><h2 class="kop-2">${esc(t)}</h2>${rechts}</div>`;
const blok = (titel, inhoud) => `<div class="deelvraag">${titel ? `<h3 class="kop-3">${esc(titel)}</h3>` : ''}${inhoud}</div>`;
/** Op de wand twee kolommen naast elkaar, zodat een deel zonder scrollen past (besluit 163); op de telefoon onder elkaar. */
const kolommen = (links, rechts) => `<div class="kolommen"><div>${links}</div><div>${rechts}</div></div>`;
const naamVan = (id) => eInfo?.meters?.find((m) => m.id === id)?.naam ?? id;

/* ------------------------------------------------------------ de delen */

function zekeringNu() {
  return a?.zekering && a.zekering !== 'weetniet' ? a.zekering : aInfo?.configuratie?.zekering ?? null;
}

function delen() {
  const p = e?.prijzen;
  const panelenOk = a?.panelen.ligging || (aInfo?.configuratie?.panelen ?? []).length;
  const z = zekeringNu();
  const prijsMist = e && (p.stroom == null || (e.gas && p.gas == null));
  return [
    { id: 'panelen', titel: 'Zonnepanelen', zin: ligging.kort(aInfo?.ligging) ?? (a?.panelen.aantal ? `${a.panelen.aantal} panelen` : panelenOk ? `${aInfo.configuratie.panelen.length} vlakken` : 'nog kiezen'), stand: !aInfo ? null : panelenOk ? 'goed' : 'mist' },
    { id: 'aansluiting', titel: 'Aansluiting', zin: z ? `${z.fasen} × ${z.ampere} A` : 'hoofdzekering kiezen', stand: !aInfo ? null : z ? 'goed' : 'mist' },
    { id: 'meters', titel: 'Meters', zin: e ? [e.net.afname.length ? 'stroom' : null, e.gas ? 'gas' : null, e.apparaten.length ? `${e.apparaten.length} apparaten` : null].filter(Boolean).join(', ') || 'nog kiezen' : '…', stand: !e ? null : e.net.afname.length ? 'goed' : 'mist' },
    { id: 'prijzen', titel: 'Contract en prijzen', zin: !e ? '…' : p.stroom == null ? 'stroomprijs ontbreekt' : `stroom € ${nl(p.stroom, 2)} per kWh`, stand: !e ? null : prijsMist ? 'mist' : 'goed' },
    { id: 'verwarming', titel: 'Verwarming', zin: a?.verwarming.soort ? { cv: 'cv-ketel', warmtepomp: 'warmtepomp', hybride: 'hybride warmtepomp', stadsverwarming: 'stadsverwarming', weetniet: 'weet ik niet' }[a.verwarming.soort] + (a.verwarming.aanvoerC ? `, aanvoer ${a.verwarming.aanvoerC}°` : '') : 'nog kiezen', stand: !aInfo ? null : a.verwarming.soort ? 'goed' : 'leeg' },
  ];
}

/* Zonnepanelen */

function zijaanzicht(kant) {
  const op = (s) => kant === 'beide' || kant === s;
  const dak = (s) => (op(s) ? 'var(--zon)' : 'rgba(255,255,255,0.10)');
  const plat = kant === 'plat';
  return `<div class="zijaanzicht"><svg viewBox="0 0 220 124" role="img" aria-label="Het huis van opzij${kant && kant !== 'weetniet' && kant !== 'geen' ? `, met de panelen ${plat ? 'op het platte dak' : kant === 'beide' ? 'aan beide kanten' : `aan de ${kant}`}` : ''}">
    <rect x="40" y="62" width="140" height="44" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>
    ${plat
      ? '<rect x="36" y="56" width="148" height="7" rx="2" fill="rgba(255,255,255,0.18)"/><rect x="62" y="46" width="96" height="9" rx="2" fill="var(--zon)"/>'
      : `<polygon points="30,64 110,18 110,64" fill="${dak('voorkant')}" opacity="0.9"/><polygon points="110,18 190,64 110,64" fill="${dak('achterkant')}" opacity="0.9"/><polyline points="30,64 110,18 190,64" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`}
    <rect x="60" y="78" width="18" height="28" rx="2" fill="rgba(255,255,255,0.14)"/>
    <line x1="10" y1="106" x2="210" y2="106" stroke="rgba(255,255,255,0.25)"/>
    <text x="52" y="120" fill="#7f8e9c" font-size="10">voorkant</text><text x="142" y="120" fill="#7f8e9c" font-size="10">achterkant</text>
  </svg></div>`;
}

function aantal(label, sleutel) {
  return `<label class="veldnaam">${esc(label)}<input class="invoer" type="number" inputmode="numeric" min="1" max="200" step="1" data-aantal="${sleutel}" value="${a.panelen[sleutel] ?? ''}"></label>`;
}

function elke(s) {
  if (s == null) return null;
  if (s < 90) return 'elke minuut';
  if (s < 5400) return `eens per ${Math.round(s / 60)} minuten`;
  return `eens per ${Math.round(s / 3600)} uur`;
}

function panelenVorm() {
  const kant = a.panelen.ligging;
  const aantallen = kant === 'beide' ? `<div class="twee">${aantal('Aantal aan de voorkant', 'voorkant')}${aantal('Aantal aan de achterkant', 'achterkant')}</div>` : kant && kant !== 'weetniet' && kant !== 'geen' ? aantal('Aantal panelen', 'aantal') : '';
  // Hoe ze liggen (besluit 157): gemeten, bevestigd of aangepast, uit panelen.js.
  const lig = ligging.kaart(aInfo.ligging, a, ligStaat);
  const liggingBlok = kant === 'geen' ? '' : blok('', `<div class="kopregel"><h3 class="kop-3">${esc(lig.kop)}</h3></div><p class="uitleg">${esc(lig.uitleg)}</p>${lig.inhoud}${lig.knoppen ? `<div class="lig-knoppen">${lig.knoppen}</div>` : ''}`);
  const z = aInfo.zonnesensor;
  const chip = !z ? null : z.snelGenoeg == null ? ['', 'Wordt gemeten'] : z.snelGenoeg ? ['goed', 'Snel genoeg'] : ['traag', 'Traag'];
  const sensor = z
    ? blok('', `<div class="kopregel"><h3 class="kop-3">Zonnesensor</h3><span class="label-chip ${chip[0]}">${chip[1]}</span></div>
      <p class="uitleg">${esc(z.intervalS == null ? 'Hoe vaak de sensor een nieuwe waarde geeft, meet de app overdag, als de panelen leveren.' : z.snelGenoeg ? `${z.merk ? `${z.merk}: ` : ''}nieuwe waarde ${elke(z.intervalS)}. Snel genoeg om op wisselende bewolking te reageren.` : `Nieuwe waarde ${elke(z.intervalS)}. Met een lokale koppeling reageert de regeling binnen een minuut op bewolking.`)}</p>
      ${z.snelGenoeg === false && z.weg ? `<p class="mini">Lokale koppeling: ${esc(z.weg)}</p>` : ''}`)
    : '';
  return `${kop('Zonnepanelen')}
    ${kolommen(blok('Op welke kant van het dak liggen ze?', `${zijaanzicht(kant)}
      ${keuzes('Kant van het dak', 'ligging', [['voorkant', 'Voorkant'], ['achterkant', 'Achterkant'], ['beide', 'Beide kanten'], ['plat', 'Plat dak'], ['weetniet', 'Weet ik niet'], ['geen', 'Geen panelen']], kant)}
      ${aantallen}${aantallen ? '<p class="mini">Met het aantal weet Smart Climate wat een paneel levert.</p>' : ''}`), `${liggingBlok}${sensor}`)}`;
}

/* Aansluiting */

const GANGBAAR = [
  { fasen: 1, ampere: 25 },
  { fasen: 1, ampere: 35 },
  { fasen: 1, ampere: 40 },
  { fasen: 3, ampere: 25 },
  { fasen: 3, ampere: 35 },
  { fasen: 3, ampere: 40 },
  { fasen: 3, ampere: 50 },
];

function aansluitingVorm() {
  const uitConfig = aInfo.configuratie.zekering;
  const huidig = a.zekering ?? uitConfig;
  const anders = huidig && huidig !== 'weetniet' && !GANGBAAR.some((z) => gelijk(z, huidig));
  const fasen = aInfo.gevonden.fasen.length;
  const een = fasen === 1 ? 'één fase' : `${fasen} fasen`;
  const noot = a.zekering == null && uitConfig
    ? `Nu ${uitConfig.fasen} × ${uitConfig.ampere} A, uit de configuratie van het huis. Klopt dat, tik hem dan aan.`
    : fasen === 0
      ? 'Er is geen stroommeting per fase gevonden. De waarde wordt bewaard, maar de regeling gebruikt hem pas met zo’n meting.'
      : a.zekering?.fasen === 3 && fasen < 3
        ? `De meter meet nu ${een}. Met drie fasen rekent de regeling pas als de meter drie fasen meet.`
        : 'Staat op de hoofdschakelaar in de meterkast, of in de app van je netbeheerder.';
  return `${kop('Aansluiting')}
    ${zekeringNu() ? '' : '<div class="melding"><span class="stip" style="background: var(--gloed)"></span>Zonder hoofdzekering let het huis er niet op dat alles samen nooit meer vraagt dan je aansluiting aankan.</div>'}
    ${blok('Hoofdzekering', `<p class="uitleg">De regeling zet nooit zoveel tegelijk aan dat de hoofdzekering eruit gaat.</p>
      ${keuzes('Hoofdzekering', 'zekering', [...GANGBAAR.map((z) => [z, `${z.fasen} × ${z.ampere} A`]), ...(anders ? [[huidig, `${huidig.fasen} × ${huidig.ampere} A`]] : []), ['anders', 'Anders…'], ['weetniet', 'Weet ik niet']], zelf != null ? 'anders' : huidig)}
      ${zelf != null ? `<div class="twee"><label class="veldnaam">Fasen<select class="invoer" data-zekering="fasen"><option value="1" ${zelf.fasen === 1 ? 'selected' : ''}>1 fase</option><option value="3" ${zelf.fasen === 3 ? 'selected' : ''}>3 fasen</option></select></label><label class="veldnaam">Ampère per fase<input class="invoer" type="number" inputmode="numeric" min="6" max="250" step="1" data-zekering="ampere" value="${zelf.ampere ?? ''}"></label></div>` : ''}
      <p class="mini">${esc(noot)}</p>`)}`;
}

/* Meters */

function inGebruik() {
  return new Set([...e.net.afname, ...e.net.teruglevering, ...e.zon, ...(e.gas ? [e.gas] : []), ...e.apparaten.map((x) => x.id)]);
}

function meterKeuze(label, plek, rol, soort, leegTekst = 'Meter erbij…') {
  const bezet = inGebruik();
  const vrij = (eInfo.meters ?? []).filter((m) => m.soort === soort && !bezet.has(m.id));
  if (!vrij.length) return '';
  const past = vrij.filter((m) => m.rol === rol);
  const rest = vrij.filter((m) => m.rol !== rol);
  const opt = (m) => `<option value="${esc(m.id)}">${esc(m.naam)}</option>`;
  const lijst = past.length && rest.length ? `<optgroup label="Past hierbij">${past.map(opt).join('')}</optgroup><optgroup label="Andere meters">${rest.map(opt).join('')}</optgroup>` : vrij.map(opt).join('');
  return `<select class="invoer" aria-label="${esc(label)}" data-meer="${plek}"><option value="">${esc(leegTekst)}</option>${lijst}</select>`;
}

function rol(titel, plek, ids, rolNaam, soort, een = false) {
  const tarief = (plek === 'afname' || plek === 'teruglevering') && dubbel;
  const dal = new Set(e.net.dal ?? []);
  const chips = ids.length
    ? ids.map((id) => `<span class="meterchip"><button type="button" data-weg="${plek}" data-id="${esc(id)}" aria-label="${esc(naamVan(id))} weghalen">${esc(naamVan(id))}<span aria-hidden="true">×</span></button>${tarief ? `<button type="button" class="tariefknop" data-tarief="${esc(id)}" aria-label="Telt ${esc(naamVan(id))} dal of normaal?">${dal.has(id) ? 'dal' : 'normaal'}</button>` : ''}</span>`).join('')
    : '<span class="mini">geen</span>';
  return `<div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 0">
    <b style="font-size: 14px">${esc(titel)}</b>
    <div class="meterchips">${chips}</div>
    ${!een || !ids.length ? meterKeuze(`${titel}: meter erbij`, plek, rolNaam, soort) : ''}
  </div>`;
}

function metersVorm() {
  const v = eInfo.voorstel;
  const wat = v ? [
    v.net.afname.length ? 'stroom van het net' : null,
    v.net.teruglevering.length ? 'teruglevering' : null,
    v.zon.length ? 'zonnepanelen' : null,
    v.gas ? 'gas' : null,
    v.apparaten.length ? `${v.apparaten.length === 1 ? 'één apparaat' : `${v.apparaten.length} apparaten`}` : null,
  ].filter(Boolean) : [];
  const lijst = wat.length > 1 ? `${wat.slice(0, -1).join(', ')} en ${wat.at(-1)}` : wat[0];
  const uitHa = v
    ? blok('Uit Home Assistant', `<p class="uitleg">In je Energie-dashboard staan ${esc(lijst ?? 'nog geen meters')}. Overnemen zet ze hieronder goed.</p><button type="button" class="knop" data-overnemen style="align-self: start">Meters overnemen</button>`)
    : blok('Uit Home Assistant', `<p class="uitleg">${esc(eInfo.fout ?? 'Het Energie-dashboard van Home Assistant is niet ingericht. Kies je meters hieronder zelf.')}</p>`);
  const rijen = e.apparaten.map((x, i) => `<div class="regelrij"><div class="l"><input class="invoer" data-apparaatnaam="${i}" value="${esc(x.naam)}" maxlength="40" aria-label="Naam van ${esc(naamVan(x.id))}"><span>${esc(naamVan(x.id))}</span></div><button type="button" class="knop" data-apparaat-weg="${i}" aria-label="${esc(x.naam)} weghalen">Weg</button></div>`).join('');
  const apparatenBlok = blok('Apparaten met een eigen meter', `${rijen || '<p class="uitleg">Nog geen. Een apparaat met een eigen meter staat in Opbrengst apart.</p>'}${meterKeuze('Apparaat erbij', 'apparaat', 'apparaat', 'energy', 'Apparaat erbij…')}`);
  return `${kop('Meters')}
    ${e.net.afname.length ? '' : '<div class="melding"><span class="stip" style="background: var(--gloed)"></span>Zonder stroommeter weet Opbrengst niet wat je huis gebruikt.</div>'}
    ${kolommen(`${uitHa}${apparatenBlok}`, blok('Welke meter telt wat', `${rol('Stroom van het net', 'afname', e.net.afname, 'afname', 'energy')}${rol('Teruglevering', 'teruglevering', e.net.teruglevering, 'teruglevering', 'energy')}${rol('Zonnepanelen', 'zon', e.zon, 'zon', 'energy')}${rol('Gas', 'gas', e.gas ? [e.gas] : [], 'gas', 'volume', true)}${dubbel ? '<p class="mini">Tik op normaal of dal om te zeggen welk tarief een meter telt. Bij een slimme meter is tarief 1 het daltarief.</p>' : ''}`))}`;
}

/* Contract en prijzen */

/** Eigen daltijden (besluit 178): van welk uur tot welk uur, en het weekend. */
function eigenDal(d) {
  const uren = (sleutel, huidig) => `<select class="invoer" data-daleigen="${sleutel}" aria-label="${sleutel === 'van' ? 'Dal vanaf' : 'Dal tot'}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === huidig ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>`;
  return `<div class="twee"><label class="veldnaam">Vanaf${uren('van', d.van)}</label><label class="veldnaam">Tot${uren('tot', d.tot)}</label></div>
    ${keuzes('Weekend', 'dalWeekend', [[true, 'Weekend helemaal dal'], [false, 'Weekend als doordeweeks']], d.weekend)}
    <p class="mini">Met eigen tijden tellen de Nederlandse feestdagen niet als dal.</p>`;
}

const VOORSTELLEN = [
  { naam: 'Vaste leveringskosten stroom', per: 'dag', soort: 'stroom' },
  { naam: 'Netbeheer stroom', per: 'dag', soort: 'stroom' },
  { naam: 'Vermindering energiebelasting', per: 'dag', soort: 'stroom' },
  { naam: 'Terugleverkosten', per: 'dag', soort: 'stroom' },
  { naam: 'Vaste leveringskosten gas', per: 'dag', soort: 'gas' },
  { naam: 'Netbeheer gas', per: 'dag', soort: 'gas' },
];

function prijzenVorm() {
  const p = e.prijzen;
  const perMeter = () => {
    const dal = new Set(e.net.dal ?? []);
    return e.net.afname.some((id) => dal.has(id)) && e.net.afname.some((id) => !dal.has(id));
  };
  const dalTijden = !dubbel ? '' : perMeter()
    ? '<p class="mini">Je meter telt normaal en dal apart; dat gebruikt de app.</p>'
    : `<span class="veldnaam">Wanneer geldt het daltarief?</span>${keuzes('Daltarief', 'dalUren', [['nl', '23 tot 7 uur en weekend'], ['zuid', '21 tot 7 uur en weekend (Brabant, Limburg)'], ['eigen', 'Eigen tijden']], p.dalUren)}${p.dalUren === 'eigen' ? eigenDal(p.dalEigen) : ''}`;
  const opt = (lijst, huidig) => lijst.map(([w, t]) => `<option value="${w}" ${w === huidig ? 'selected' : ''}>${t}</option>`).join('');
  const posten = p.vast.map((v, i) => `<div class="vastrij">
      <input class="invoer" data-vast="naam" data-i="${i}" value="${esc(v.naam)}" maxlength="40" aria-label="Naam van de post">
      <div class="vastregel">
        <input class="invoer${v.bedrag == null ? ' leeg' : ''}" type="number" inputmode="decimal" step="any" data-vast="bedrag" data-i="${i}" value="${v.bedrag ?? ''}" aria-label="Bedrag van ${esc(v.naam)} in euro">
        <select class="invoer" data-vast="per" data-i="${i}" aria-label="Per">${opt([['dag', 'per dag'], ['maand', 'per maand'], ['jaar', 'per jaar']], v.per)}</select>
        <select class="invoer" data-vast="soort" data-i="${i}" aria-label="Stroom of gas">${opt([['stroom', 'stroom'], ['gas', 'gas']], v.soort)}</select>
        <button type="button" class="knop" data-vast-weg="${i}" aria-label="${esc(v.naam)} weghalen">×</button>
      </div>
    </div>`).join('');
  const erbij = VOORSTELLEN.filter((x) => !p.vast.some((v) => v.naam.toLowerCase() === x.naam.toLowerCase()));
  const mist = p.stroom == null ? 'Zonder stroomprijs rekent Opbrengst alleen in kWh. Vul hem in zoals hij op je contract staat, met btw.' : e.gas && p.gas == null ? 'Je hebt een gasmeter; zonder gasprijs telt het gas niet mee in je kosten.' : '';
  return `${kop('Contract en prijzen')}
    ${mist ? `<div class="melding"><span class="stip" style="background: var(--gloed)"></span>${esc(mist)}</div>` : ''}
    ${kolommen(`${blok('Soort contract', `${keuzes('Soort contract', 'contract', [['vast', 'Vaste prijs'], ['dynamisch', 'Per uur (dynamisch)'], ['weetniet', 'Weet ik niet']], a?.tarief ?? null, !a)}
      <p class="mini">Bij een dynamisch contract verschilt de prijs per uur. Dan kan het huis koelen en wassen als stroom goedkoop is.</p>
      <label class="veldnaam">Startdatum contract<input class="invoer" type="date" data-contract value="${esc(p.contractStart ?? '')}" min="2000-01-01" max="2100-12-31"></label>
      <p class="mini">Het jaar in Opbrengst loopt vanaf deze dag, zoals je jaarafrekening. Leeg is vanaf 1 januari.</p>`)}${blok('Stroom', `${keuzes('Tarief', 'stroomtarief', [['enkel', 'Eén tarief'], ['dubbel', 'Normaal en dal']], dubbel ? 'dubbel' : 'enkel')}
      <div class="${dubbel ? 'twee' : ''}">${bedragVeld(dubbel ? 'Normaal, € per kWh' : '€ per kWh', 'stroom', p.stroom, '0,27', '0', true)}${dubbel ? bedragVeld('Dal, € per kWh', 'stroomDal', p.stroomDal, '0,25', '0', true) : ''}</div>
      <p class="mini">De totaalprijs, met energiebelasting en btw. Op je contract heet die vaak "Totaal elektriciteit".</p>${dalTijden}`)}${e.gas ? blok('Gas', `${bedragVeld('€ per m³', 'gas', p.gas, '1,36', '0', true)}<p class="mini">Ook hier de totaalprijs, met belasting en btw.</p>`) : ''}`, `${blok('Teruglevering', `${keuzes('Salderen', 'salderen', [[true, 'Salderen tot 2027'], [false, 'Geen salderen']], p.salderen)}
      ${p.salderen ? `<p class="uitleg">Tot 2027 wordt er in Nederland gesaldeerd: wat je teruglevert, telt tegen je eigen stroomprijs.</p>
      ${bedragVeld('Vergoeding boven je verbruik, € per kWh', 'teruglevering', p.teruglevering, '0,15')}` : '<p class="uitleg">Wat je teruglevert, telt tegen de vergoeding hieronder, min de kosten.</p>'}
      <span class="veldnaam" style="margin-top: 4px">${p.salderen ? 'Vanaf 2027, als het salderen stopt' : 'Wat je krijgt en betaalt voor teruglevering'}</span>
      <div class="twee">${bedragVeld('Je krijgt, € per kWh', 'vanaf2027.vergoeding', p.vanaf2027.vergoeding, '0,07')}${bedragVeld('Je betaalt, € per kWh', 'vanaf2027.kosten', p.vanaf2027.kosten, '0,06')}</div>`)}${blok('Vaste kosten', `${posten || '<p class="uitleg">Nog geen vaste posten.</p>'}
      <div class="meterchips">${erbij.map((x) => `<button type="button" data-vast-erbij="${esc(x.naam)}">+ ${esc(x.naam)}</button>`).join('')}<button type="button" data-vast-erbij="">+ Andere post</button></div>
      <p class="mini">Zoals op je contract: per dag, maand of jaar, met btw. Een aftrek, zoals de vermindering energiebelasting, telt de app als min.</p>`)}`)}`;
}

/* Verwarming */

/**
 * De thermostaat die de ketel stuurt (besluit 167), zoals een Nest. Niets
 * gekozen: het voorstel uit Home Assistant. De radiatoren gaan daarmee aan.
 */
function thermostaatKeuze(v) {
  const lijst = huismodel.thermostaten(huisData);
  const voorstel = lijst[0];
  const nu = v.thermostaat ?? '';
  const opties = [['', voorstel ? `Uit Home Assistant: ${voorstel.naam} (${voorstel.kamer})` : 'Geen gevonden in Home Assistant'], ...lijst.map((x) => [x.sleutel, `${x.naam} (${x.kamer})`]), ['geen', 'Geen thermostaat']];
  return `<label class="veldnaam">Thermostaat die de ketel aanzet<select class="invoer" data-thermostaat>${opties.map(([w, t]) => `<option value="${esc(w)}" ${w === nu ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <p class="mini">Zoals een Nest of Honeywell: die zet de ketel aan, en de radiatoren in de kamers gaan mee. Een radiator voeg je per kamer toe bij Kamers en indeling.</p>`;
}

function verwarmingVorm() {
  const v = a.verwarming;
  return `${kop('Verwarming')}
    ${blok('Waar komt de warmte vandaan?', `${keuzes('Verwarming', 'verwarming', [['cv', 'Cv-ketel'], ['warmtepomp', 'Warmtepomp'], ['hybride', 'Hybride'], ['stadsverwarming', 'Stadsverwarming'], ['weetniet', 'Weet ik niet']], v.soort)}
      <label class="veldnaam">Aanvoertemperatuur op de ketel, °C<input class="invoer" type="number" inputmode="numeric" min="25" max="90" step="1" data-aanvoer value="${v.aanvoerC ?? ''}" placeholder="bijvoorbeeld 60"></label>
      <p class="mini">Staat op de ketel of in de app van je ketel. Weet je het niet, laat het dan leeg.</p>
      ${v.soort === 'stadsverwarming' ? '' : thermostaatKeuze(v)}`)}`;
}

/* Ernaast */

const NAAST = {
  panelen: ['Waarvoor dit nodig is', ['De verwachting van de zon voor vandaag en morgen', 'Wanneer de airco’s op zon kunnen draaien'], 'Waar vind je het?', 'Kijk op het dak, of in de app van je omvormer: daar staat hoeveel panelen er zijn. Het vermogen per paneel staat op de factuur van de installateur, of op een sticker achter op een paneel.'],
  aansluiting: ['Waarvoor dit nodig is', ['Nooit zoveel tegelijk aan dat de zekering eruit gaat', 'Hoeveel airco’s en apparaten samen mogen draaien'], 'Waar vind je het?', 'Op de hoofdschakelaar in de meterkast: bijvoorbeeld "1 × 35 A" of "3 × 25 A".'],
  meters: ['Waarvoor dit nodig is', ['Opbrengst: wat je huis gebruikt en teruglevert', 'Wat elk apparaat met een eigen meter kost'], 'Waar vind je het?', 'In Home Assistant, bij Instellingen › Dashboards › Energie.'],
  prijzen: ['Waarvoor dit nodig is', ['Opbrengst: wat je betaalde en bespaarde', 'Wat een thuisbatterij jou zou opleveren', 'Met een dynamisch contract: koelen en wassen als stroom goedkoop is'], 'Waar vind je het?', 'Op je contract of jaarafrekening, bij de leveringskosten: per kWh en per m³, met btw.'],
  verwarming: ['Waarvoor dit nodig is', ['Hoe snel een kamer opwarmt: met een lagere aanvoer gaat verwarmen langzamer', 'Later: de cv per kamer, met radiatorknoppen'], 'Waar vind je het?', 'Op het scherm van de ketel, of in de app van je ketel of warmtepomp.'],
};

function naast(id) {
  const [kopje, lijst, waarKop, waar] = NAAST[id] ?? NAAST.panelen;
  // De ligging van de panelen gaat meteen in (besluit 157); de zekering na een start.
  const later = aInfo?.volgendeStart && id === 'aansluiting' ? '<div class="glas"><h3>Wanneer het ingaat</h3><p style="margin: 0">De zekering gaat in na de volgende start van Smart Climate.</p></div>' : '';
  return `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="glas"><h3>${esc(waarKop)}</h3><p style="margin: 0">${esc(waar)}</p></div>${later}`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!aInfo && !eInfo) return;
  // Niet onder de vinger opnieuw opbouwen.
  if (document.activeElement?.matches('input:not([type="date"]):not([type="range"])')) return;
  const nu = groep.tekenDelen(delen());
  const wacht = '<p class="klein">Even laden…</p>';
  const vorm = {
    panelen: () => (a ? panelenVorm() : wacht),
    aansluiting: () => (a ? aansluitingVorm() : wacht),
    meters: () => (e ? metersVorm() : wacht),
    prijzen: () => (e ? prijzenVorm() : wacht),
    verwarming: () => (a ? verwarmingVorm() : wacht),
  }[nu]?.() ?? wacht;
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(nu)));
}

/* ------------------------------------------------------------ bewaren */

function bewaarAansluiting() {
  groep.bewaarStraks(async () => {
    const opZon = Object.fromEntries(Object.entries(a.opZon).filter(([, v]) => typeof v === 'boolean'));
    const uit = await groep.stuur('api/aansluiting', { panelen: a.panelen, zekering: a.zekering, tarief: a.tarief, verwarming: a.verwarming, voorkantZon: a.voorkantZon, dak: a.dak, opZon, opZonUit: a.opZonUit });
    if (uit?.ok) {
      aInfo = uit.antwoord;
      // Het dak zoals de dienst het bewaarde: "klopt" en "aanpassen" worden een gewoon dak.
      a.dak = aInfo.antwoorden?.dak ?? null;
      teken();
    }
    return uit;
  });
}

function bewaarEnergie() {
  if (dubbel && e.prijzen.stroomDal == null) return groep.zegBewaard('fout', 'Vul het daltarief in, of kies één tarief');
  const leegBedrag = e.prijzen.vast.find((v) => v.bedrag == null);
  if (leegBedrag) return groep.zegBewaard('fout', `Vul bij "${leegBedrag.naam}" een bedrag in`);
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/energie', { ...e, bron: e.bron ?? 'zelf' });
    if (uit?.ok) {
      eInfo = { ...eInfo, instellingen: uit.antwoord };
      teken();
    }
    return uit;
  });
}

/* ------------------------------------------------------------ doen */

function zetMeters(plek, ids) {
  if (plek === 'afname') e.net.afname = ids;
  else if (plek === 'teruglevering') e.net.teruglevering = ids;
  else if (plek === 'zon') e.zon = ids;
  else if (plek === 'gas') e.gas = ids[0] ?? null;
}
function leesMeters(plek) {
  if (plek === 'afname') return e.net.afname;
  if (plek === 'teruglevering') return e.net.teruglevering;
  if (plek === 'zon') return e.zon;
  return e.gas ? [e.gas] : [];
}
function netDalBij() {
  const net = new Set([...e.net.afname, ...e.net.teruglevering]);
  e.net.dal = (e.net.dal ?? []).filter((id) => net.has(id));
}

document.addEventListener('click', (ev) => {
  const knop = ev.target.closest('button');
  if (!knop || knop.disabled) return;
  // Hoe de panelen liggen (besluit 157).
  if (a && Object.keys(knop.dataset).some((k) => k.startsWith('lig'))) {
    const wat = ligging.klik(knop, aInfo?.ligging, a, ligStaat);
    if (wat) teken();
    if (wat === 'bewaar') bewaarAansluiting();
    return;
  }
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    const s = knop.dataset.kies;
    // De aansluiting.
    if (a && ['ligging', 'zekering', 'contract', 'verwarming'].includes(s)) {
      if (s === 'ligging') a.panelen.ligging = w;
      else if (s === 'zekering') {
        if (w === 'anders') {
          zelf = { fasen: a.zekering?.fasen ?? 1, ampere: a.zekering?.ampere ?? null };
          return teken();
        }
        zelf = null;
        a.zekering = w;
      } else if (s === 'contract') a.tarief = w;
      else if (s === 'verwarming') a.verwarming.soort = w;
      teken();
      return bewaarAansluiting();
    }
    // De prijzen.
    if (e && s === 'stroomtarief') {
      dubbel = w === 'dubbel';
      if (!dubbel) e.prijzen.stroomDal = null;
    } else if (e && s === 'dalUren') e.prijzen.dalUren = w;
    else if (e && s === 'salderen') e.prijzen.salderen = w;
    else if (e && s === 'dalWeekend') e.prijzen.dalEigen = { ...e.prijzen.dalEigen, weekend: w };
    else return;
    teken();
    return bewaarEnergie();
  }
  if (!e) return;
  const p = e.prijzen;
  if (knop.dataset.weg) {
    zetMeters(knop.dataset.weg, leesMeters(knop.dataset.weg).filter((x) => x !== knop.dataset.id));
    netDalBij();
  } else if (knop.dataset.tarief) {
    const dal = new Set(e.net.dal ?? []);
    if (dal.has(knop.dataset.tarief)) dal.delete(knop.dataset.tarief);
    else dal.add(knop.dataset.tarief);
    e.net.dal = [...dal];
  } else if (knop.dataset.apparaatWeg != null) {
    e.apparaten.splice(Number(knop.dataset.apparaatWeg), 1);
  } else if (knop.dataset.vastWeg != null) {
    p.vast.splice(Number(knop.dataset.vastWeg), 1);
  } else if (knop.dataset.vastErbij != null) {
    const v = VOORSTELLEN.find((x) => x.naam === knop.dataset.vastErbij);
    p.vast.push({ naam: v?.naam ?? 'Vaste post', bedrag: null, per: v?.per ?? 'dag', soort: v?.soort ?? 'stroom' });
    teken();
    // Meteen het bedrag invullen; bewaard wordt pas als er een bedrag staat.
    requestAnimationFrame(() => document.querySelector(`${app.zicht()} [data-vast="bedrag"][data-i="${p.vast.length - 1}"]`)?.focus());
    return;
  } else if (knop.hasAttribute('data-overnemen')) {
    const v = JSON.parse(JSON.stringify(eInfo.voorstel));
    e = aanvullen({ ...v, prijzen: { ...p, stroom: p.stroom ?? v.prijzen.stroom, gas: p.gas ?? v.prijzen.gas, teruglevering: p.teruglevering ?? v.prijzen.teruglevering } });
  } else return;
  teken();
  bewaarEnergie();
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (ligging.verander(t, ligStaat)) return teken();
  // De aansluiting.
  const z = t.closest('[data-zekering]');
  if (z && zelf && a) {
    zelf[z.dataset.zekering] = z.value === '' ? null : Math.round(Number(z.value));
    if (zelf.fasen && zelf.ampere >= 6 && zelf.ampere <= 250) {
      a.zekering = { fasen: zelf.fasen, ampere: zelf.ampere };
      bewaarAansluiting();
    }
    return;
  }
  if (t.matches('[data-thermostaat]') && a) {
    a.verwarming.thermostaat = t.value || null;
    teken();
    return bewaarAansluiting();
  }
  if (t.matches('[data-aanvoer]') && a) {
    const n = Math.round(Number(t.value));
    a.verwarming.aanvoerC = t.value === '' || !Number.isFinite(n) ? null : Math.min(90, Math.max(25, n));
    if (a.verwarming.aanvoerC != null) t.value = String(a.verwarming.aanvoerC);
    return bewaarAansluiting();
  }
  if (t.dataset.aantal && a) {
    a.panelen[t.dataset.aantal] = t.value === '' ? null : Math.round(Number(t.value));
    return bewaarAansluiting();
  }
  // De meters en prijzen.
  if (!e) return;
  const p = e.prijzen;
  if (t.dataset.meer) {
    if (!t.value) return;
    if (t.dataset.meer === 'apparaat') e.apparaten.push({ id: t.value, naam: naamVan(t.value).slice(0, 40) });
    else {
      zetMeters(t.dataset.meer, [...leesMeters(t.dataset.meer), t.value]);
      if ((t.dataset.meer === 'afname' || t.dataset.meer === 'teruglevering') && raadDal(t.value)) e.net.dal = [...(e.net.dal ?? []), t.value];
    }
    teken();
  } else if (t.dataset.prijs) {
    const v = t.value === '' ? null : Number(t.value);
    const [x, y] = t.dataset.prijs.split('.');
    if (y) p[x][y] = v;
    else p[x] = v;
    t.classList.toggle('leeg', v == null && t.classList.contains('leeg'));
  } else if (t.dataset.daleigen) {
    // Eigen daltijden (besluit 178): van en tot verschillend, anders blijft het zoals het was.
    const d = { ...p.dalEigen, [t.dataset.daleigen]: Number(t.value) };
    if (d.van === d.tot) {
      t.value = String(p.dalEigen[t.dataset.daleigen]);
      return;
    }
    p.dalEigen = d;
  } else if (t.hasAttribute('data-contract')) {
    p.contractStart = /^\d{4}-\d{2}-\d{2}$/.test(t.value) ? t.value : null;
  } else if (t.dataset.vast) {
    const post = p.vast[Number(t.dataset.i)];
    if (!post) return;
    if (t.dataset.vast === 'bedrag') {
      let v = t.value === '' ? null : Number(t.value);
      // Een vermindering of korting is een aftrek, ook als hij zonder min is ingevuld.
      if (v != null && v > 0 && /vermindering|korting|teruggave/i.test(post.naam)) v = -v;
      post.bedrag = v;
      if (v != null && String(v) !== t.value) t.value = String(v);
    } else if (t.dataset.vast === 'naam') post.naam = t.value.trim() || post.naam;
    else post[t.dataset.vast] = t.value;
  } else if (t.dataset.apparaatnaam != null) {
    const x = e.apparaten[Number(t.dataset.apparaatnaam)];
    if (x) x.naam = t.value.trim() || x.naam;
  } else return;
  bewaarEnergie();
});

// Na het invullen van een veld de delen links bijwerken (de stip en de zin).
document.addEventListener('focusout', () => setTimeout(teken, 0));

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laadAlles();
