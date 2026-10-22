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
  if (p.vastPerMaand != null && !p.vast.length) p.vast.push({ naam: t('energie.vasteKosten'), bedrag: p.vastPerMaand, per: 'maand', soort: 'stroom' });
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
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, x]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${gelijk(w, huidig)}" ${uit ? 'disabled' : ''}>${esc(x)}</button>`).join('')}</div>`;
}
function bedragVeld(label, pad, waarde, hint = '', min = '0', leegIsFout = false) {
  return `<label class="veldnaam">${esc(label)}<input class="invoer${leegIsFout && waarde == null ? ' leeg' : ''}" type="number" inputmode="decimal" step="any" ${min === '' ? '' : `min="${min}"`} data-prijs="${esc(pad)}" value="${waarde ?? ''}" placeholder="${esc(hint)}"></label>`;
}
const kop = (titel, rechts = '') => `<div class="kopregel"><h2 class="kop-2">${esc(titel)}</h2>${rechts}</div>`;
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
  const soort = a?.verwarming.soort ? t(`energie.soort.${a.verwarming.soort}`) : null;
  return [
    { id: 'panelen', titel: t('energie.zonnepanelen'), zin: ligging.kort(aInfo?.ligging) ?? (a?.panelen.aantal ? t('energie.nPanelen', { n: a.panelen.aantal }) : panelenOk ? t('instellingen.vlakken', { n: aInfo.configuratie.panelen.length }) : t('instellingen.nogKiezen')), stand: !aInfo ? null : panelenOk ? 'goed' : 'mist' },
    { id: 'aansluiting', titel: t('energie.aansluiting'), zin: z ? `${z.fasen} × ${z.ampere} A` : t('energie.zekeringKiezen'), stand: !aInfo ? null : z ? 'goed' : 'mist' },
    { id: 'meters', titel: t('energie.meters'), zin: e ? [e.net.afname.length ? t('energie.stroom') : null, e.gas ? t('energie.gas') : null, e.apparaten.length ? t('energie.nApparaten', { n: e.apparaten.length }) : null].filter(Boolean).join(', ') || t('instellingen.nogKiezen') : '…', stand: !e ? null : e.net.afname.length ? 'goed' : 'mist' },
    { id: 'prijzen', titel: t('energie.prijzen'), zin: !e ? '…' : p.stroom == null ? t('energie.prijsMist') : t('energie.prijsPerKwh', { prijs: nl(p.stroom, 2) }), stand: !e ? null : prijsMist ? 'mist' : 'goed' },
    { id: 'verwarming', titel: t('energie.verwarming'), zin: soort ? (a.verwarming.aanvoerC ? t('energie.aanvoer', { soort, c: a.verwarming.aanvoerC }) : soort) : t('instellingen.nogKiezen'), stand: !aInfo ? null : a.verwarming.soort ? 'goed' : 'leeg' },
  ];
}

/* Zonnepanelen */

function zijaanzicht(kant) {
  const op = (s) => kant === 'beide' || kant === s;
  const dak = (s) => (op(s) ? 'var(--zon)' : 'rgba(255,255,255,0.10)');
  const plat = kant === 'plat';
  const label = ['plat', 'beide', 'voorkant', 'achterkant'].includes(kant) ? t(`energie.zij.${kant}`) : t('energie.zijaanzicht');
  return `<div class="zijaanzicht"><svg viewBox="0 0 220 124" role="img" aria-label="${esc(label)}">
    <rect x="40" y="62" width="140" height="44" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>
    ${plat
      ? '<rect x="36" y="56" width="148" height="7" rx="2" fill="rgba(255,255,255,0.18)"/><rect x="62" y="46" width="96" height="9" rx="2" fill="var(--zon)"/>'
      : `<polygon points="30,64 110,18 110,64" fill="${dak('voorkant')}" opacity="0.9"/><polygon points="110,18 190,64 110,64" fill="${dak('achterkant')}" opacity="0.9"/><polyline points="30,64 110,18 190,64" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`}
    <rect x="60" y="78" width="18" height="28" rx="2" fill="rgba(255,255,255,0.14)"/>
    <line x1="10" y1="106" x2="210" y2="106" stroke="rgba(255,255,255,0.25)"/>
    <text x="52" y="120" fill="#7f8e9c" font-size="10">${esc(t('energie.voorkant'))}</text><text x="142" y="120" fill="#7f8e9c" font-size="10">${esc(t('energie.achterkant'))}</text>
  </svg></div>`;
}

function aantal(label, sleutel) {
  return `<label class="veldnaam">${esc(label)}<input class="invoer" type="number" inputmode="numeric" min="1" max="200" step="1" data-aantal="${sleutel}" value="${a.panelen[sleutel] ?? ''}"></label>`;
}

function elke(s) {
  if (s == null) return null;
  if (s < 90) return t('energie.elkeMinuut');
  if (s < 5400) return t('energie.elkeMinuten', { n: Math.round(s / 60) });
  return t('energie.elkUur', { n: Math.round(s / 3600) });
}

function panelenVorm() {
  const kant = a.panelen.ligging;
  const aantallen = kant === 'beide' ? `<div class="twee">${aantal(t('energie.aantalVoor'), 'voorkant')}${aantal(t('energie.aantalAchter'), 'achterkant')}</div>` : kant && kant !== 'weetniet' && kant !== 'geen' ? aantal(t('energie.aantal'), 'aantal') : '';
  // Hoe ze liggen (besluit 157): gemeten, bevestigd of aangepast, uit panelen.js.
  const lig = ligging.kaart(aInfo.ligging, a, ligStaat);
  const liggingBlok = kant === 'geen' ? '' : blok('', `<div class="kopregel"><h3 class="kop-3">${esc(lig.kop)}</h3></div><p class="uitleg">${esc(lig.uitleg)}</p>${lig.inhoud}${lig.knoppen ? `<div class="lig-knoppen">${lig.knoppen}</div>` : ''}`);
  const z = aInfo.zonnesensor;
  const chip = !z ? null : z.snelGenoeg == null ? ['', t('energie.sensor.gemeten')] : z.snelGenoeg ? ['goed', t('energie.sensor.snel')] : ['traag', t('energie.sensor.traag')];
  const sensorZin = !z ? '' : z.intervalS == null ? t('energie.sensor.meet') : z.snelGenoeg ? (z.merk ? t('energie.sensor.snelMerk', { merk: z.merk, elke: elke(z.intervalS) }) : t('energie.sensor.snelZin', { elke: elke(z.intervalS) })) : t('energie.sensor.traagZin', { elke: elke(z.intervalS) });
  const sensor = z
    ? blok('', `<div class="kopregel"><h3 class="kop-3">${esc(t('energie.sensor.kop'))}</h3><span class="label-chip ${chip[0]}">${esc(chip[1])}</span></div>
      <p class="uitleg">${esc(sensorZin)}</p>
      ${z.snelGenoeg === false && z.weg ? `<p class="mini">${esc(t('energie.sensor.lokaal', { weg: z.weg }))}</p>` : ''}`)
    : '';
  const kanten = ['voorkant', 'achterkant', 'beide', 'plat', 'weetniet', 'geen'].map((k) => [k, t(`energie.kant.${k}`)]);
  return `${kop(t('energie.zonnepanelen'))}
    ${kolommen(blok(t('energie.welkeKant'), `${zijaanzicht(kant)}
      ${keuzes(t('energie.kantDak'), 'ligging', kanten, kant)}
      ${aantallen}${aantallen ? `<p class="mini">${esc(t('energie.metAantal'))}</p>` : ''}`), `${liggingBlok}${sensor}`)}`;
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
  const noot = a.zekering == null && uitConfig
    ? t('energie.uitConfig', { fasen: uitConfig.fasen, ampere: uitConfig.ampere })
    : fasen === 0
      ? t('energie.geenFase')
      : a.zekering?.fasen === 3 && fasen < 3
        ? t('energie.meetFasen', { fasen: t('energie.fase', { n: fasen }) })
        : t('energie.waarZekering');
  return `${kop(t('energie.aansluiting'))}
    ${zekeringNu() ? '' : `<div class="melding"><span class="stip" style="background: var(--gloed)"></span>${esc(t('energie.zonderZekering'))}</div>`}
    ${blok(t('instellingen.zekering'), `<p class="uitleg">${esc(t('energie.zekeringUitleg'))}</p>
      ${keuzes(t('instellingen.zekering'), 'zekering', [...GANGBAAR.map((z) => [z, `${z.fasen} × ${z.ampere} A`]), ...(anders ? [[huidig, `${huidig.fasen} × ${huidig.ampere} A`]] : []), ['anders', t('energie.anders')], ['weetniet', t('energie.weetNiet')]], zelf != null ? 'anders' : huidig)}
      ${zelf != null ? `<div class="twee"><label class="veldnaam">${esc(t('energie.fasen'))}<select class="invoer" data-zekering="fasen"><option value="1" ${zelf.fasen === 1 ? 'selected' : ''}>${esc(t('energie.eenFase'))}</option><option value="3" ${zelf.fasen === 3 ? 'selected' : ''}>${esc(t('energie.drieFasen'))}</option></select></label><label class="veldnaam">${esc(t('energie.ampere'))}<input class="invoer" type="number" inputmode="numeric" min="6" max="250" step="1" data-zekering="ampere" value="${zelf.ampere ?? ''}"></label></div>` : ''}
      <p class="mini">${esc(noot)}</p>`)}`;
}

/* Meters */

function inGebruik() {
  return new Set([...e.net.afname, ...e.net.teruglevering, ...e.zon, ...(e.gas ? [e.gas] : []), ...e.apparaten.map((x) => x.id)]);
}

function meterKeuze(label, plek, rol, soort, leegTekst = t('energie.meterErbij')) {
  const bezet = inGebruik();
  const vrij = (eInfo.meters ?? []).filter((m) => m.soort === soort && !bezet.has(m.id));
  if (!vrij.length) return '';
  const past = vrij.filter((m) => m.rol === rol);
  const rest = vrij.filter((m) => m.rol !== rol);
  const opt = (m) => `<option value="${esc(m.id)}">${esc(m.naam)}</option>`;
  const lijst = past.length && rest.length ? `<optgroup label="${esc(t('energie.pastHierbij'))}">${past.map(opt).join('')}</optgroup><optgroup label="${esc(t('energie.andereMeters'))}">${rest.map(opt).join('')}</optgroup>` : vrij.map(opt).join('');
  return `<select class="invoer" aria-label="${esc(label)}" data-meer="${plek}"><option value="">${esc(leegTekst)}</option>${lijst}</select>`;
}

function rol(plek, ids, rolNaam, soort, een = false) {
  const titel = t(`energie.rol.${plek}`);
  const tarief = (plek === 'afname' || plek === 'teruglevering') && dubbel;
  const dal = new Set(e.net.dal ?? []);
  const chips = ids.length
    ? ids.map((id) => `<span class="meterchip"><button type="button" data-weg="${plek}" data-id="${esc(id)}" aria-label="${esc(t('energie.weghalen', { naam: naamVan(id) }))}">${esc(naamVan(id))}<span aria-hidden="true">×</span></button>${tarief ? `<button type="button" class="tariefknop" data-tarief="${esc(id)}" aria-label="${esc(t('energie.dalOfNormaal', { naam: naamVan(id) }))}">${esc(t(dal.has(id) ? 'energie.dal' : 'energie.normaal'))}</button>` : ''}</span>`).join('')
    : `<span class="mini">${esc(t('energie.geen'))}</span>`;
  return `<div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 0">
    <b style="font-size: 14px">${esc(titel)}</b>
    <div class="meterchips">${chips}</div>
    ${!een || !ids.length ? meterKeuze(t('energie.erbijLabel', { titel }), plek, rolNaam, soort) : ''}
  </div>`;
}

function metersVorm() {
  const v = eInfo.voorstel;
  const wat = v ? [
    v.net.afname.length ? t('energie.wat.afname') : null,
    v.net.teruglevering.length ? t('energie.wat.teruglevering') : null,
    v.zon.length ? t('energie.wat.zon') : null,
    v.gas ? t('energie.wat.gas') : null,
    v.apparaten.length ? t('energie.wat.apparaten', { n: v.apparaten.length }) : null,
  ].filter(Boolean) : [];
  const lijst = wat.length > 1 ? `${wat.slice(0, -1).join(', ')} ${t('algemeen.en')} ${wat.at(-1)}` : wat[0];
  const uitHa = v
    ? blok(t('energie.uitHA'), `<p class="uitleg">${esc(t('energie.inDashboard', { lijst: lijst ?? t('energie.geenMeters') }))}</p><button type="button" class="knop" data-overnemen style="align-self: start">${esc(t('energie.overnemen'))}</button>`)
    : blok(t('energie.uitHA'), `<p class="uitleg">${esc(eInfo.fout ?? t('energie.geenDashboard'))}</p>`);
  const rijen = e.apparaten.map((x, i) => `<div class="regelrij"><div class="l"><input class="invoer" data-apparaatnaam="${i}" value="${esc(x.naam)}" maxlength="40" aria-label="${esc(t('energie.naamVan', { naam: naamVan(x.id) }))}"><span>${esc(naamVan(x.id))}</span></div><button type="button" class="knop" data-apparaat-weg="${i}" aria-label="${esc(t('energie.weghalen', { naam: x.naam }))}">${esc(t('energie.weg'))}</button></div>`).join('');
  const apparatenBlok = blok(t('energie.eigenMeter'), `${rijen || `<p class="uitleg">${esc(t('energie.nogGeenApparaat'))}</p>`}${meterKeuze(t('energie.apparaatErbij'), 'apparaat', 'apparaat', 'energy', t('energie.apparaatErbijLeeg'))}`);
  return `${kop(t('energie.meters'))}
    ${e.net.afname.length ? '' : `<div class="melding"><span class="stip" style="background: var(--gloed)"></span>${esc(t('stand.metersZin'))}</div>`}
    ${kolommen(`${uitHa}${apparatenBlok}`, blok(t('energie.welkeMeter'), `${rol('afname', e.net.afname, 'afname', 'energy')}${rol('teruglevering', e.net.teruglevering, 'teruglevering', 'energy')}${rol('zon', e.zon, 'zon', 'energy')}${rol('gas', e.gas ? [e.gas] : [], 'gas', 'volume', true)}${dubbel ? `<p class="mini">${esc(t('energie.tikDal'))}</p>` : ''}`))}`;
}

/* Contract en prijzen */

/** Eigen daltijden (besluit 178): van welk uur tot welk uur, en het weekend. */
function eigenDal(d) {
  const uren = (sleutel, huidig) => `<select class="invoer" data-daleigen="${sleutel}" aria-label="${esc(t(sleutel === 'van' ? 'energie.dalVanaf' : 'energie.dalTot'))}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === huidig ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select>`;
  return `<div class="twee"><label class="veldnaam">${esc(t('energie.vanaf'))}${uren('van', d.van)}</label><label class="veldnaam">${esc(t('energie.tot'))}${uren('tot', d.tot)}</label></div>
    ${keuzes(t('energie.weekend'), 'dalWeekend', [[true, t('energie.weekendDal')], [false, t('energie.weekendGewoon')]], d.weekend)}
    <p class="mini">${esc(t('energie.feestdagen'))}</p>`;
}

/** Posten om mee te beginnen, in de taal van de app; de naam wordt bewaard zoals hij er dan staat. */
const VOORSTELLEN = [
  { naam: 'leveringStroom', per: 'dag', soort: 'stroom' },
  { naam: 'netStroom', per: 'dag', soort: 'stroom' },
  { naam: 'vermindering', per: 'dag', soort: 'stroom' },
  { naam: 'terugleverkosten', per: 'dag', soort: 'stroom' },
  { naam: 'leveringGas', per: 'dag', soort: 'gas' },
  { naam: 'netGas', per: 'dag', soort: 'gas' },
].map((x) => ({ ...x, naam: t(`energie.post.${x.naam}`) }));

function prijzenVorm() {
  const p = e.prijzen;
  const perMeter = () => {
    const dal = new Set(e.net.dal ?? []);
    return e.net.afname.some((id) => dal.has(id)) && e.net.afname.some((id) => !dal.has(id));
  };
  const dalTijden = !dubbel ? '' : perMeter()
    ? `<p class="mini">${esc(t('energie.meterApart'))}</p>`
    : `<span class="veldnaam">${esc(t('energie.wanneerDal'))}</span>${keuzes(t('energie.daltarief'), 'dalUren', ['nl', 'zuid', 'eigen'].map((x) => [x, t(`energie.dal.${x}`)]), p.dalUren)}${p.dalUren === 'eigen' ? eigenDal(p.dalEigen) : ''}`;
  const opt = (lijst, huidig) => lijst.map(([w, x]) => `<option value="${w}" ${w === huidig ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const posten = p.vast.map((v, i) => `<div class="vastrij">
      <input class="invoer" data-vast="naam" data-i="${i}" value="${esc(v.naam)}" maxlength="40" aria-label="${esc(t('energie.naamPost'))}">
      <div class="vastregel">
        <input class="invoer${v.bedrag == null ? ' leeg' : ''}" type="number" inputmode="decimal" step="any" data-vast="bedrag" data-i="${i}" value="${v.bedrag ?? ''}" aria-label="${esc(t('energie.bedragVan', { naam: v.naam }))}">
        <select class="invoer" data-vast="per" data-i="${i}" aria-label="${esc(t('energie.per'))}">${opt(['dag', 'maand', 'jaar'].map((x) => [x, t(`energie.per.${x}`)]), v.per)}</select>
        <select class="invoer" data-vast="soort" data-i="${i}" aria-label="${esc(t('energie.stroomOfGas'))}">${opt([['stroom', t('energie.stroom')], ['gas', t('energie.gas')]], v.soort)}</select>
        <button type="button" class="knop" data-vast-weg="${i}" aria-label="${esc(t('energie.weghalen', { naam: v.naam }))}">×</button>
      </div>
    </div>`).join('');
  const erbij = VOORSTELLEN.filter((x) => !p.vast.some((v) => v.naam.toLowerCase() === x.naam.toLowerCase()));
  const mist = p.stroom == null ? t('energie.mistStroom') : e.gas && p.gas == null ? t('energie.mistGas') : '';
  return `${kop(t('energie.prijzen'))}
    ${mist ? `<div class="melding"><span class="stip" style="background: var(--gloed)"></span>${esc(mist)}</div>` : ''}
    ${kolommen(`${blok(t('energie.soortContract'), `${keuzes(t('energie.soortContract'), 'contract', [['vast', t('energie.contract.vast')], ['dynamisch', t('energie.contract.dynamisch')], ['weetniet', t('energie.weetNiet')]], a?.tarief ?? null, !a)}
      <p class="mini">${esc(t('energie.dynamischUitleg'))}</p>
      <label class="veldnaam">${esc(t('energie.contractStart'))}<input class="invoer" type="date" data-contract value="${esc(p.contractStart ?? '')}" min="2000-01-01" max="2100-12-31"></label>
      <p class="mini">${esc(t('energie.contractUitleg'))}</p>`)}${blok(t('energie.stroomKop'), `${keuzes(t('energie.tarief'), 'stroomtarief', [['enkel', t('energie.enkel')], ['dubbel', t('energie.dubbel')]], dubbel ? 'dubbel' : 'enkel')}
      <div class="${dubbel ? 'twee' : ''}">${bedragVeld(t(dubbel ? 'energie.normaalKwh' : 'energie.perKwh'), 'stroom', p.stroom, nl(0.27, 2), '0', true)}${dubbel ? bedragVeld(t('energie.dalKwh'), 'stroomDal', p.stroomDal, nl(0.25, 2), '0', true) : ''}</div>
      <p class="mini">${esc(t('energie.totaalprijs'))}</p>${dalTijden}`)}${e.gas ? blok(t('energie.gasKop'), `${bedragVeld(t('energie.perM3'), 'gas', p.gas, nl(1.36, 2), '0', true)}<p class="mini">${esc(t('energie.gasTotaal'))}</p>`) : ''}`, `${blok(t('energie.teruglevering'), `${keuzes(t('energie.salderen'), 'salderen', [[true, t('energie.salderenTot')], [false, t('energie.geenSalderen')]], p.salderen)}
      ${p.salderen ? `<p class="uitleg">${esc(t('energie.salderenUitleg'))}</p>
      ${bedragVeld(t('energie.vergoedingBoven'), 'teruglevering', p.teruglevering, nl(0.15, 2))}` : `<p class="uitleg">${esc(t('energie.zonderSalderen'))}</p>`}
      <span class="veldnaam" style="margin-top: 4px">${esc(t(p.salderen ? 'energie.vanaf2027' : 'energie.krijgenBetalen'))}</span>
      <div class="twee">${bedragVeld(t('energie.jeKrijgt'), 'vanaf2027.vergoeding', p.vanaf2027.vergoeding, nl(0.07, 2))}${bedragVeld(t('energie.jeBetaalt'), 'vanaf2027.kosten', p.vanaf2027.kosten, nl(0.06, 2))}</div>`)}${blok(t('energie.vasteKosten'), `${posten || `<p class="uitleg">${esc(t('energie.geenPosten'))}</p>`}
      <div class="meterchips">${erbij.map((x) => `<button type="button" data-vast-erbij="${esc(x.naam)}">+ ${esc(x.naam)}</button>`).join('')}<button type="button" data-vast-erbij="">${esc(t('energie.anderePost'))}</button></div>
      <p class="mini">${esc(t('energie.postUitleg'))}</p>`)}`)}`;
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
  const opties = [['', voorstel ? t('energie.thermostaatUitHA', { naam: voorstel.naam, kamer: voorstel.kamer }) : t('energie.geenThermostaatHA')], ...lijst.map((x) => [x.sleutel, t('energie.naamKamer', { naam: x.naam, kamer: x.kamer })]), ['geen', t('energie.geenThermostaat')]];
  return `<label class="veldnaam">${esc(t('energie.thermostaatKetel'))}<select class="invoer" data-thermostaat>${opties.map(([w, x]) => `<option value="${esc(w)}" ${w === nu ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <p class="mini">${esc(t('energie.thermostaatUitleg'))}</p>`;
}

function verwarmingVorm() {
  const v = a.verwarming;
  return `${kop(t('energie.verwarming'))}
    ${blok(t('energie.waarWarmte'), `${keuzes(t('energie.verwarming'), 'verwarming', [...['cv', 'warmtepomp', 'hybride', 'stadsverwarming'].map((x) => [x, t(`energie.bron.${x}`)]), ['weetniet', t('energie.weetNiet')]], v.soort)}
      <label class="veldnaam">${esc(t('energie.aanvoerLabel'))}<input class="invoer" type="number" inputmode="numeric" min="25" max="90" step="1" data-aanvoer value="${v.aanvoerC ?? ''}" placeholder="${esc(t('energie.bijvoorbeeld60'))}"></label>
      <p class="mini">${esc(t('energie.aanvoerUitleg'))}</p>
      ${v.soort === 'stadsverwarming' ? '' : thermostaatKeuze(v)}`)}`;
}

/* Ernaast */

/** Per deel hoeveel punten er bij "Waarvoor dit nodig is" staan (energie.naast.<deel>.<n>). */
const NAAST = { panelen: 2, aansluiting: 2, meters: 2, prijzen: 3, verwarming: 2 };

function naast(id) {
  const deel = NAAST[id] ? id : 'panelen';
  const lijst = Array.from({ length: NAAST[deel] }, (_, i) => t(`energie.naast.${deel}.${i + 1}`));
  // De ligging van de panelen gaat meteen in (besluit 157); de zekering na een start.
  const later = aInfo?.volgendeStart && id === 'aansluiting' ? `<div class="glas"><h3>${esc(t('regeling.ingaat'))}</h3><p style="margin: 0">${esc(t('energie.zekeringLater'))}</p></div>` : '';
  return `<div class="glas"><h3>${esc(t('energie.waarvoor'))}</h3><ul>${lijst.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="glas"><h3>${esc(t('energie.waarVind'))}</h3><p style="margin: 0">${esc(t(`energie.naast.${deel}.waar`))}</p></div>${later}`;
}
/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!aInfo && !eInfo) return;
  // Niet onder de vinger opnieuw opbouwen.
  if (document.activeElement?.matches('input:not([type="date"]):not([type="range"])')) return;
  const nu = groep.tekenDelen(delen());
  const wacht = `<p class="klein">${esc(t('algemeen.laden'))}…</p>`;
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
  if (dubbel && e.prijzen.stroomDal == null) return groep.zegBewaard('fout', t('energie.vulDal'));
  const leegBedrag = e.prijzen.vast.find((v) => v.bedrag == null);
  if (leegBedrag) return groep.zegBewaard('fout', t('energie.vulBedrag', { naam: leegBedrag.naam }));
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
    p.vast.push({ naam: v?.naam ?? t('energie.post.vast'), bedrag: null, per: v?.per ?? 'dag', soort: v?.soort ?? 'stroom' });
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
      if (v != null && v > 0 && /vermindering|korting|teruggave|reduction|discount|rebate/i.test(post.naam)) v = -v;
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
