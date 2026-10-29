/*
 * Kamers en indeling, in ontwerp 2 (besluit 104), als groep zoals Energie
 * (besluit 193, schets Wand-Indeling-Groep): links de delen, de etages, Buiten,
 * wat nog geen plek heeft en wat verborgen is; rechts het gekozen deel. Een
 * etage is die etage zonder dak met een blad met wat je koos, en eronder de
 * strook met wat nog nergens staat. Een apparaat sleep je naar een kamer, of je
 * tikt erop en kiest de kamer. Op de telefoon eerst de lijst; een deel opent
 * als eigen scherm.
 *
 * Alles gaat door de deur van de indeling (besluit 96): één eigen bestand op
 * de NAS, nooit naar Home Assistant. Elke wijziging bewaart meteen;
 * "Ongedaan maken" zet de vorige indeling terug.
 */
'use strict';

const { $$, esc, haal, deur, nl } = app;

let info = null;
/** De verwarming uit Energie (besluit 167): soort, aanvoer en de thermostaat van de ketel. */
let verwarming = null;
/** De aansluiting (`api/aansluiting`): de jacuzzi uit Home Assistant en de panelen op een ander dak, voor Buiten. */
let aans = null;
const cvThermo = () => huismodel.cvThermostaat(huisData, verwarming);
let huisData = null;
let zon = null;
let state = null;
/**
 * Wat er gekozen is: het deel uit het adres (een etage, `los`, `verborgen` of
 * `nieuw`), de etage, en daarin een kamer of een apparaat, of een ander blad.
 */
const keuze = { deel: null, etage: null, kamer: null, apparaat: null, blad: 'etage' };
/** De indelingen van voor elke wijziging, voor "Ongedaan maken". */
const vorige = [];
let melding = '';
let meldingFout = false;
/** Waar een gesleept apparaat nu boven hangt: de kamer gloeit. */
let sleepDoel = null;

async function laadAlles() {
  const [i, h, z, s, a] = await Promise.allSettled([haal('api/indeling'), haal('api/huis'), haal('api/zon'), haal('api/state'), haal('api/aansluiting')]);
  if (i.status === 'fulfilled') info = i.value;
  // De verwarming (besluit 167): welke thermostaat de ketel aanzet.
  if (a.status === 'fulfilled') {
    aans = a.value;
    verwarming = a.value?.antwoorden?.verwarming ?? null;
  }
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (s.status === 'fulfilled') state = s.value;
  // Op de wand staat er meteen een deel open: de begane grond. De telefoon begint met de lijst.
  const d = concept();
  if (d && !location.hash && !app.telStand()) history.replaceState(null, '', opAdres(d.kamers.some((k) => k.etage === 'bg') ? 'bg' : (d.kamers[0]?.etage ?? 'bg')));
  teken();
}

async function laadHuis() {
  try {
    huisData = await haal('api/huis');
  } catch {
    // De laatste stand blijft.
  }
}

/* ------------------------------------------------------------ de delen (besluit 193) */

/** Delen die geen etage zijn. Een eigen etage krijgt nooit zo'n naam (`etageEigen`). */
const DEEL_VAST = ['los', 'verborgen', 'nieuw'];
/** Wat voor deel: een etage, Buiten, of een van de vaste. */
const deelSoort = (id) => (DEEL_VAST.includes(id) ? id : id === 'buiten' ? 'buiten' : 'etage');
const opAdres = (id) => `${location.pathname}${location.search}#${encodeURIComponent(id)}`;

/**
 * Een kamer in het adres, zoals Regeling en Wat je huis kan ernaar linken
 * (`indeling.html#woonkamer/warmte`): open zijn etage met de kamer gekozen, en
 * zet het adres op die etage. Heet een etage net zo, dan gaat de etage voor.
 */
function adresOmzetten(d) {
  const [wie, tab] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!wie) return;
  const kamer = d.kamers.find((k) => k.id === wie);
  const isDeel = DEEL_VAST.includes(wie) || info.etages.some((e) => e.id === wie);
  if (!kamer || (isDeel && tab === undefined)) return;
  const etage = alleBuitenEtage(kamer) ? 'buiten' : kamer.etage;
  bronVorm = null;
  Object.assign(keuze, { deel: etage, etage, kamer: kamer.id, apparaat: null, blad: 'kamer', tab: tab === 'warmte' ? 'warmte' : 'kamer' });
  history.replaceState(null, '', opAdres(etage));
}

/** Een ander deel gekozen (in de lijst, of Vorige en Volgende): opnieuw beginnen in dat deel. */
function volgDeel(nu) {
  keuze.deel = nu;
  bronVorm = null;
  const soort = deelSoort(nu);
  if (soort === 'etage' || soort === 'buiten') Object.assign(keuze, { etage: nu, kamer: null, apparaat: null, blad: 'etage' });
  else Object.assign(keuze, { kamer: null, apparaat: null, blad: soort === 'nieuw' ? 'nieuweEtage' : 'apparaat' });
}

/** Wat er rond het huis is (besluit 158): zoals de indeling het zegt, of uit de buitenruimtes. */
const rondVan = (d) => d?.rond ?? huismodel.rondNu(huisData);

/** Hoe Buiten ervoor staat, in een paar woorden: wat er rond het huis aan staat. */
function buitenZin(d) {
  const rond = rondVan(d);
  const naam = { oprit: t('huis.buiten.oprit'), carport: t('soort.buiten.carport'), garage: t('huis.buiten.garage'), voortuin: t('huis.buiten.voortuin'), tuin: t('huis.buiten.tuin'), tuinhuis: t(rond.schuur ? 'inr.schuurtje' : 'inr.tuinhuis'), terras: t('huis.buiten.terras'), balkon: t('huis.buiten.balkon'), jacuzzi: t('inr.jacuzzi') };
  const aan = Object.keys(naam).filter((w) => rond[w] && (!huismodel.OP_OPRIT.has(w) || rond.oprit)).map((w) => naam[w].toLowerCase());
  return aan.length ? aan.join(', ') : null;
}

/** Een icoon per etage: het dak, de begane grond met de voordeur, de trap omhoog of omlaag. */
function etageIcoon(d, id) {
  if (id === 'buiten') return 'buiten';
  if (id === 'kelder') return 'kelder';
  if (huisData?.dakEtage === id || /zolder|vliering|attic/i.test(etageNaam(d, id))) return 'dak';
  return id === 'bg' ? 'deur' : 'trap';
}

/** De delen voor groep.js: de etages van boven naar beneden met Buiten, een etage erbij, en de apparaten zonder plek. */
function delen(d) {
  const los = huisData?.zonderRuimte ?? [];
  const weg = huisData?.verborgen ?? [];
  const etages = info.etages.map(({ id }) => {
    if (id === 'buiten') {
      const zin = buitenZin(d);
      return { id, titel: etageNaam(d, id), zin: zin ?? t('indeling.nogLeeg'), stand: zin ? 'goed' : 'leeg', icoon: 'buiten' };
    }
    const kamers = d.kamers.filter((k) => k.etage === id);
    const n = kamers.reduce((som, k) => som + apparatenIn(k.id).length, 0);
    return { id, titel: etageNaam(d, id), zin: kamers.length ? `${t('instellingen.kamers', { n: kamers.length })}, ${t('instellingen.apparaten', { n })}` : t('indeling.nogLeeg'), stand: kamers.length ? 'goed' : 'leeg', icoon: etageIcoon(d, id) };
  });
  return [
    { kop: t('indeling.etages') },
    ...etages,
    { id: 'nieuw', titel: t('indeling.etageErbij'), erbij: true },
    { kop: t('indeling.deel.apparaten') },
    { id: 'los', titel: t('indeling.nogInDelen'), zin: t('indeling.deel.losZin', { n: los.length }), stand: los.length ? 'mist' : 'goed', icoon: 'los' },
    { id: 'verborgen', titel: t('instellingen.verborgen'), zin: weg.length ? t('instellingen.apparaten', { n: weg.length }) : t('indeling.deel.nietsVerborgen'), icoon: 'verborgen' },
  ];
}

/** Per deel hoeveel punten er bij "Waarvoor is dit?" staan (indeling.naast.<soort>.<n>). */
const NAAST = { etage: 2, buiten: 2, los: 2, verborgen: 1, nieuw: 1 };
function naast(soort) {
  const lijst = Array.from({ length: NAAST[soort] }, (_, i) => t(`indeling.naast.${soort}.${i + 1}`));
  return `<div class="glas"><h3>${esc(t('energie.waarvoor'))}</h3><ul>${lijst.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="glas"><h3>${esc(t('indeling.naast.weten'))}</h3><p style="margin: 0">${esc(t(`indeling.naast.${soort}.weten`))}</p></div>`;
}

/* ------------------------------------------------------------ de indeling */

/** De indeling om te bewerken: de eigen, of anders het voorstel uit Home Assistant. */
function concept() {
  const basis = info?.indeling ?? info?.voorstel;
  return basis ? JSON.parse(JSON.stringify(basis)) : null;
}

/**
 * De bewaarronde die nog loopt (23 oktober 2026). Een wijziging bouwt op de
 * indeling die de pagina kent; kwam een tweede tik voordat de vorige ronde
 * terug was, dan bouwde die op een oude indeling en ging de eerste wijziging
 * verloren. Elke tik en elke keuze wacht daarom eerst op `naBewaren()`.
 */
let lopend = Promise.resolve();
async function naBewaren() {
  let l;
  do {
    l = lopend;
    await l;
  } while (l !== lopend);
}
function inDeRij(werk) {
  const klaar = werk();
  lopend = klaar.then(() => undefined, () => undefined);
  return klaar;
}

/** Bewaren, met wat er gebeurde als melding; de vorige indeling gaat op de stapel voor "Ongedaan maken". */
function bewaar(next, gedaan) {
  return inDeRij(async () => {
    const nu = info?.indeling ?? info?.voorstel;
    const uit = await stuur(next);
    if (uit && nu) vorige.push(JSON.parse(JSON.stringify(nu)));
    if (uit) zeg(gedaan);
    teken();
    return uit;
  });
}

function ongedaan() {
  return inDeRij(async () => {
    const terug = vorige.pop();
    if (!terug) return;
    if (await stuur(terug)) zeg(t('indeling.teruggezet'));
    else vorige.push(terug);
    teken();
  });
}

async function stuur(next) {
  try {
    const res = await deur('api/indeling', next);
    if (res === null) return false;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      zeg(res.status === 403 ? t('indeling.beheerder') : (body.fout ?? t('indeling.nietBewaard')), true);
      return false;
    }
    info = { ...info, indeling: body };
    // De etages kunnen veranderd zijn (besluit 112): de lijst opnieuw ophalen.
    const [vers] = await Promise.allSettled([haal('api/indeling'), laadHuis()]);
    if (vers.status === 'fulfilled') info = vers.value;
    return true;
  } catch {
    zeg(t('indeling.geenVerbinding'), true);
    return false;
  }
}

function zeg(tekst, fout = false) {
  melding = tekst;
  meldingFout = fout;
  $$('[data-status]').forEach((el) => {
    el.textContent = tekst;
    el.classList.toggle('fout', fout);
  });
}

/** Een id uit een naam, zoals de dienst ze aanneemt. */
function idVan(tekst, bezet) {
  const basis =
    tekst
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'kamer';
  let id = basis;
  for (let i = 2; bezet.has(id); i++) id = `${basis}-${i}`;
  return id;
}

const etageNaam = (d, id) => d?.etages?.[id] ?? info?.etages.find((e) => e.id === id)?.standaardNaam ?? id;

/** De ruimte zoals het huis hem toont, met zijn apparaten. */
function ruimteVan(id) {
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) if (r.id === id) return r;
  return null;
}
const apparatenIn = (id) => ruimteVan(id)?.apparaten ?? [];

/** Een apparaat, waar het ook staat: in een kamer, nog in te delen, of verborgen. */
function toestelVan(id) {
  for (const e of huisData?.etages ?? []) {
    for (const r of e.ruimtes ?? []) {
      const d = (r.apparaten ?? []).find((x) => x.id === id);
      if (d) return { ...d, kamer: r.id, waar: 'kamer' };
    }
  }
  const los = (huisData?.zonderRuimte ?? []).find((x) => x.id === id);
  if (los) return { ...los, kamer: null, zone: null, waar: 'los' };
  const weg = (huisData?.verborgen ?? []).find((x) => x.id === id);
  return weg ? { ...weg, kamer: null, zone: null, waar: 'verborgen' } : null;
}

async function plaats(id, kamer, zone = null) {
  const toestel = toestelVan(id);
  const next = concept();
  if (!next || !toestel) return false;
  next.apparaten[id] = { ...(next.apparaten[id] ?? {}), kamer, zone };
  next.verborgen = (next.verborgen ?? []).filter((x) => x !== id);
  const k = next.kamers.find((x) => x.id === kamer);
  return bewaar(next, t('indeling.staatNu', { naam: toestel.naam, kamer: k?.naam ?? t('indeling.deKamer') }));
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const d = concept();
  if (!d || !info) {
    $$('[data-blad]').forEach((el) => (el.innerHTML = `<p class="klein">${esc(t('indeling.laden'))}</p>`));
    return;
  }
  adresOmzetten(d);
  const lijst = delen(d);
  const nu = groep.tekenDelen(lijst);
  if (nu !== keuze.deel) volgDeel(nu);
  const soort = deelSoort(nu);
  const deel = lijst.find((x) => x.id === nu);
  $$('[data-deelkop]').forEach((el) => (el.textContent = soort === 'nieuw' ? t('indeling.etageToevoegen') : (deel?.titel ?? '')));
  $$('[data-deelzin]').forEach((el) => (el.textContent = deel?.erbij ? '' : (deel?.zin ?? '')));
  $$('[data-binnen]').forEach((el) => {
    el.classList.toggle('lijstdeel', soort === 'los' || soort === 'verborgen');
    el.classList.toggle('alleenblad', soort === 'nieuw');
  });
  if (soort === 'etage' || soort === 'buiten') tekenPodium(d);
  $$('[data-lijst]').forEach((el) => (el.innerHTML = soort === 'los' || soort === 'verborgen' ? lijstVan(d, soort) : ''));
  // Niet opnieuw opbouwen terwijl iemand typt.
  for (const el of $$('[data-blad]')) if (!(el.contains(document.activeElement) && document.activeElement.matches('input'))) el.innerHTML = blad(d);
  $$('[data-bak]').forEach((el) => {
    el.innerHTML = bak();
    el.classList.toggle('leeg', !(huisData?.zonderRuimte ?? []).length);
  });
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(soort)));
  $$('[data-ongedaan]').forEach((b) => (b.disabled = vorige.length === 0));
  if (melding) zeg(melding, meldingFout);
  else zeg(t(huisData?.indeling === 'voorstel' ? 'indeling.voorstel' : 'indeling.nietsInHA'));
}

/* ------------------------------------------------------------ de etages (besluit 112) */

/** De etages binnen, van boven naar beneden, zoals de indeling ze nu heeft. */
function volgordeVan(d) {
  return d.volgorde?.length ? [...d.volgorde] : info.etages.map((e) => e.id).filter((id) => id !== 'buiten');
}

/** Een vaste etage op zijn plek: de kelder onderaan, de derde verdieping bovenaan. */
function opZijnPlek(volgorde, id) {
  const plek = (x) => (info.standaard ?? []).findIndex((s) => s.id === x);
  const mijn = plek(id);
  const voor = volgorde.findIndex((x) => plek(x) > mijn && plek(x) !== -1);
  const uit = [...volgorde];
  uit.splice(voor === -1 ? uit.length : voor, 0, id);
  return uit;
}

function nieuweEtageBlad(d) {
  const nu = new Set(volgordeVan(d));
  const vast = (info.standaard ?? []).filter((s) => !nu.has(s.id));
  return `
    ${vast.length ? `<div><span class="label">${esc(t('indeling.vasteEtages'))}</span><div class="chips">${vast.map((s) => `<button type="button" class="chip" data-etage-vast="${esc(s.id)}">${esc(s.naam)}</button>`).join('')}</div></div>` : ''}
    <div><label class="label" for="nieuweetage">${esc(t('indeling.eigenNaam'))}</label><input class="veld" id="nieuweetage" data-nieuwe-etage placeholder="${esc(t('indeling.vliering'))}" maxlength="40"></div>
    <div class="rijknoppen"><button type="button" class="knop" data-etage-eigen="boven">${esc(t('indeling.bovenaan'))}</button><button type="button" class="knop" data-etage-eigen="onder">${esc(t('indeling.onderaan'))}</button></div>
    <p class="mini" style="margin: 0">${esc(t('indeling.volgordeDaarna'))}</p>`;
}

async function etageErbij(id, naam, waar) {
  const next = concept();
  const volgorde = volgordeVan(next);
  next.volgorde = waar === 'boven' ? [id, ...volgorde] : waar === 'onder' ? [...volgorde, id] : opZijnPlek(volgorde, id);
  if (naam) next.etages[id] = naam;
  if (await bewaar(next, t('indeling.toegevoegd', { naam: naam || etageNaam(next, id) }))) kies({ etage: id, kamer: null, apparaat: null, blad: 'etage' });
}

function tekenPodium(d) {
  const el = document.getElementById(app.telStand() ? 'podium-tel' : 'podium-wand');
  const maat = { breedte: el.clientWidth || (app.telStand() ? 370 : 470), hoogte: el.clientHeight || (app.telStand() ? 260 : 430) };
  if (keuze.etage === 'buiten') return tekenBuiten(el, maat);
  const ruimte = (k) => ruimteVan(k.id) ?? { id: k.id, naam: k.naam, apparaten: [], zones: k.zones };
  const binnen = d.kamers.filter((k) => k.etage === keuze.etage && !alleBuitenEtage(k));
  // Bij het indelen alleen de naam en de temperatuur: geen zin over wat de kamer doet.
  const kamers = binnen.map((k) => ({ ...huismodel.kamerModel(ruimte(k), state), zin: null, stand: null, naam: k.naam, zones: k.zones.length > 1 ? k.zones.map((z) => z.naam) : undefined, gekozen: k.id === keuze.kamer && k.id !== sleepDoel, doel: k.id === sleepDoel }));
  kamers.push({ id: '__nieuw', naam: t('huis.kamerToevoegen'), gewicht: 0.7, nieuw: true });
  const model = {
    beschrijving: t('indeling.beschrijving', { etage: etageNaam(d, keuze.etage) }),
    tijd: 'dag',
    zonderDak: true,
    etages: [{ naam: etageNaam(d, keuze.etage), kamers }],
  };
  huis.teken(el, model, { ...maat, marge: app.telStand() ? 0.03 : 0.02, zoom: app.telStand() ? 1 : 1.05, tik: true });
}

/**
 * Buiten (besluit 193): het huis met zijn dak, zoals Thuis het tekent, met wat
 * er rond het huis is. Een deel dat een ruimte is, tik je aan of sleep je een
 * apparaat naartoe.
 */
function tekenBuiten(el, maat) {
  if (!huisData) return;
  const tek = huismodel.tekening(huisData, { kamer: (r) => ({ ...huismodel.kamerModel(r, state), zin: null, stand: null, stil: true }) });
  const buiten = huismodel.huisDelen(tek, aans?.antwoorden?.elders);
  for (const w of ['oprit', 'tuin', 'terras', 'balkon', 'voortuin', 'garage']) if (buiten[w]) buiten[w] = { ...buiten[w], gekozen: !!buiten[w].id && (buiten[w].id === keuze.kamer || buiten[w].id === sleepDoel) };
  if (buiten.tuin?.tuinhuisId) buiten.tuin.tuinhuisGekozen = buiten.tuin.tuinhuisId === keuze.kamer || buiten.tuin.tuinhuisId === sleepDoel;
  huis.teken(el, { beschrijving: t('indeling.beschrijvingBuiten'), tijd: 'dag', ...buiten, labels: [] }, { ...maat, marge: 0.04, tik: true });
}

/* ------------------------------------------------------------ het blad */

function blad(d) {
  const soort = deelSoort(keuze.deel);
  if (soort === 'nieuw') return nieuweEtageBlad(d);
  // Nog in te delen en Verborgen (besluit 193): het gekozen apparaat uit de lijst, of het bovenste.
  if (soort === 'los' || soort === 'verborgen') {
    const id = lijstKeuze(soort);
    if (!id) return soort === 'los' ? `<div class="uitleg"><b>${esc(t('indeling.allesPlek'))}</b>${esc(t('indeling.ietsNieuws'))}</div>` : `<p class="klein" style="margin: 0">${esc(t('indeling.nietsVerborgen'))}</p>`;
    return keuze.blad === 'verbergen' ? verbergBlad(toestelVan(id)) : apparaatBlad(d, toestelVan(id), true);
  }
  const k = d.kamers.find((x) => x.id === keuze.kamer);
  if (keuze.blad === 'apparaat' && keuze.apparaat) return apparaatBlad(d, toestelVan(keuze.apparaat));
  if (keuze.blad === 'verbergen' && keuze.apparaat) return verbergBlad(toestelVan(keuze.apparaat));
  if (keuze.blad === 'weghalen' && k) return weghaalBlad(k);
  if (keuze.blad === 'kamer' && k) return keuze.tab === 'warmte' && !alleBuitenEtage(k) ? warmteBlad(d, k) : kamerBlad(d, k);
  return keuze.etage === 'buiten' ? rondBlad(d) : etageBlad(d);
}

/** Het apparaat dat in de lijst gekozen is, of het bovenste. */
function lijstKeuze(soort) {
  const lijst = soort === 'los' ? (huisData?.zonderRuimte ?? []) : (huisData?.verborgen ?? []);
  return lijst.some((x) => x.id === keuze.apparaat) ? keuze.apparaat : (lijst[0]?.id ?? null);
}

/** De lijst bij Nog in te delen en Verborgen, op de plek van de tekening. */
function lijstVan(d, soort) {
  const lijst = soort === 'los' ? (huisData?.zonderRuimte ?? []) : (huisData?.verborgen ?? []);
  const gekozen = lijstKeuze(soort);
  const voorstel = soort === 'los' ? lijst.filter((x) => x.voorstelKamer) : [];
  const kamerNaam = (id) => d.kamers.find((k) => k.id === id)?.naam;
  if (!lijst.length) return '';
  const kop = `<div class="lijstkop"><p class="klein" style="margin: 0">${esc(t(soort === 'los' ? 'indeling.deel.losTip' : 'indeling.verborgenZin'))}</p>${voorstel.length > 1 ? `<button type="button" class="chip plus" data-voorstellen>${esc(t('indeling.voorstellen', { n: voorstel.length }))}</button>` : ''}</div>`;
  const rij = (a) => {
    const wat = [soortTekst(a), a.voorstelKamer && kamerNaam(a.voorstelKamer) ? t('indeling.deel.voorstel', { naam: kamerNaam(a.voorstelKamer) }) : null].filter(Boolean).join(' · ');
    return `<button type="button" class="app" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}" aria-pressed="${a.id === gekozen}"><span class="greep" aria-hidden="true">⋮⋮</span><span class="l"><b>${esc(a.naam)}</b><span>${esc(wat)}</span></span><span class="pijl" aria-hidden="true">›</span></button>`;
  };
  return `${kop}<div class="applijst">${lijst.map(rij).join('')}</div>`;
}

/*
 * Buiten (besluiten 158 en 193): wat er rond het huis is, elk deel aan of uit,
 * met de ruimte uit Home Assistant die erbij hoort. Hetzelfde lijstje als
 * Inrichten › Buiten; daaronder de buitenruimtes zelf.
 */
const S_BUITEN = (pad) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;
const IK_BUITEN = {
  oprit: '<path d="M5 21l3-18M19 21L16 3M12 6v2M12 11v2M12 16v2"/>', auto: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/>',
  carport: '<path d="M3 8h18M5 8v12M19 8v12"/>', garage: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M6 20v-8h12v8"/>', tuin: '<path d="M12 21v-8M8 13c0-4 4-8 4-8s4 4 4 8a4 4 0 0 1-8 0z"/>',
  tuinhuis: '<path d="M4 9h16M5 9v11h14V9M3 9l2-3h14l2 3"/><path d="M10 20v-5h4v5"/>', schuur: '<path d="M4 11l8-6 8 6v9H4z"/><path d="M10 20v-5h4v5"/>',
  terras: '<path d="M3 17h18M6 17v4M18 17v4M5 13h14l-1-5H6z"/>', balkon: '<path d="M4 12h16v8H4zM8 12v8M12 12v8M16 12v8M6 4h12v8"/>',
  jacuzzi: '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M8 8c0-1.5 1-2 1-3M12 8c0-1.5 1-2 1-3M16 8c0-1.5 1-2 1-3"/>',
};
function rondBlad(d) {
  const rond = rondVan(d);
  const kamers = d.kamers.filter(alleBuitenEtage);
  const jacuzzi = (aans?.gevonden?.apparaten ?? []).find((x) => x.soort === 'jacuzzi');
  const rijen = huismodel.rondom().map(([w, naam, soort, icoon]) => {
    const opOprit = huismodel.OP_OPRIT.has(w);
    const aan = !!rond[w] && (!opOprit || !!rond.oprit);
    // Aanvinken is genoeg (28 oktober 2026): het deel komt op zijn vaste plek. Hoort er een ruimte
    // uit Home Assistant bij, dan staat daar een knopje naar zijn lampen en zones.
    const gekoppeld = soort ? kamers.find((k) => buitenNu(k).soort === soort) : null;
    const koppel = aan && gekoppeld ? `<button type="button" class="chip" data-kamer="${esc(gekoppeld.id)}">${esc(t('indeling.deel.lampenEnZones', { naam: gekoppeld.naam }))} ›</button>` : '';
    // In de tuin: het tuinhuis met plat dak, of het schuurtje met puntdak (24 oktober 2026).
    const huisje = w === 'tuinhuis' && aan ? `<button type="button" class="chip" data-schuur="0" aria-pressed="${!rond.schuur}">${esc(t('inr.tuinhuis'))}</button><button type="button" class="chip" data-schuur="1" aria-pressed="${!!rond.schuur}">${esc(t('inr.schuurtje'))}</button>` : '';
    const zin = w === 'jacuzzi' ? (jacuzzi ? jacuzzi.naam : t('inr.nietInHA')) : '';
    return `<div class="rondrij${opOprit || w === 'tuinhuis' ? ' in' : ''}"><i>${S_BUITEN(IK_BUITEN[w === 'tuinhuis' && rond.schuur ? 'schuur' : icoon])}</i><div><b>${esc(naam)}</b>${zin ? `<span class="zin">${esc(zin)}</span>` : ''}</div><button type="button" class="schakel" role="switch" aria-checked="${aan}" aria-label="${esc(naam)}" data-rond="${w}" ${opOprit && !rond.oprit ? 'disabled' : ''}></button>${huisje || koppel ? `<div class="onder">${huisje}${koppel}</div>` : ''}</div>`;
  });
  // Een ruimte buiten die bij geen deel hoort: die tekent het huis nergens, dus hier om hem te openen.
  const los = kamers.filter((k) => !huismodel.rondom().some(([w, , s]) => s && rond[w] && buitenNu(k).soort === s));
  return `
    <div class="bladkop"><h2 class="kop-2">${esc(t('inr.buitenKop'))}</h2></div>
    <p class="klein" style="margin: 0">${esc(t('inr.buitenZin'))}</p>
    <div>${rijen.join('')}</div>
    ${los.length ? `<div><span class="label">${esc(t('indeling.deel.ookBuiten'))}</span><div class="chips">${los.map((k) => `<button type="button" class="chip" data-kamer="${esc(k.id)}">${esc(k.naam)} ›</button>`).join('')}</div></div>` : ''}`;
}

function etageBlad(d) {
  const id = keuze.etage;
  const standaard = info.etages.find((e) => e.id === id)?.standaardNaam ?? id;
  const kamers = d.kamers.filter((k) => k.etage === id);
  return `
    <div><label class="label" for="etagenaam-${id}">${esc(t('indeling.etageNaam'))}</label><input class="veld" id="etagenaam-${id}" data-actie="etagenaam" value="${esc(d.etages[id] ?? '')}" placeholder="${esc(standaard)}" maxlength="40"></div>
    ${id === 'buiten' ? '' : `<div><span class="label">${esc(t('indeling.schuinDak'))}</span><div class="chips" role="group" aria-label="${esc(t('indeling.schuinDakLabel'))}">${[[true, t('functies.ja')], [false, t('functies.nee')]].map(([w, x]) => `<button type="button" class="chip" data-dak="${w}" aria-pressed="${(huisData?.dakEtage === id) === w}">${esc(x)}</button>`).join('')}</div></div>`}
    <div><span class="label">${esc(t('comfort.kamers'))}</span>${kamers.length ? kamers.map((k) => `<button type="button" class="kamerrij" data-kamer="${esc(k.id)}">${esc(k.naam)}<span>${apparatenIn(k.id).length} ›</span></button>`).join('') : `<p class="klein" style="margin: 0">${esc(t('indeling.geenKamers'))}</p>`}</div>
    <div><label class="label" for="nieuwekamer-${id}">${esc(t('indeling.nieuweKamer'))}</label><div style="display: flex; gap: 8px"><input class="veld" id="nieuwekamer-${id}" data-nieuwe-kamer placeholder="${esc(t('indeling.halTrap'))}" maxlength="40"><button type="button" class="knop" data-kamer-toevoegen>${esc(t('indeling.toevoegen'))}</button></div></div>
    <p class="mini" style="margin: 0">${esc(t('indeling.deur'))}</p>
    ${id === 'buiten' ? '' : etageSchuiven(d, id, kamers.length)}`;
}

/** Hoger, lager, of weg als hij leeg is (besluit 112). Buiten blijft altijd. */
function etageSchuiven(d, id, kamers) {
  const v = volgordeVan(d);
  const i = v.indexOf(id);
  return `<div class="rijknoppen">
    <button type="button" class="knop" data-etage-schuif="-1" ${i <= 0 ? 'disabled' : ''}>${esc(t('comfort.hoger'))}</button>
    <button type="button" class="knop" data-etage-schuif="1" ${i === -1 || i >= v.length - 1 ? 'disabled' : ''}>${esc(t('comfort.lager'))}</button>
    ${kamers === 0 && v.length > 1 ? `<button type="button" class="knop gevaar" data-etage-weg>${esc(t('indeling.etageWeg'))}</button>` : ''}
  </div>`;
}

/**
 * De regeling van een kamer (besluit 142): de eigen regeling, een zone die nog
 * geen kamer heeft, of meedoen met een kamer die er een heeft. Staat bij
 * Verwarmen en koelen (besluit 167), samen met Meten met.
 */
function regelingKeuze(d, k) {
  if (k.etage === 'buiten') return '';
  const vrij = info.regelzones.filter((z) => !d.kamers.some((x) => x.id !== k.id && x.regelzone === z.id));
  const andere = d.kamers.filter((x) => x.id !== k.id && x.etage !== 'buiten' && !x.meedoenMet && (x.regelzone || Object.values(x.rollen ?? {}).some((r) => r !== 'kijken')));
  const regel = [['', t('indeling.nietGeregeld')], ...vrij.map((z) => [`zone:${z.id}`, z.id === k.regelzone ? t('indeling.eigenRegeling') : t('indeling.geregeldAls', { naam: z.naam })]), ...andere.map((x) => [`kamer:${x.id}`, t('indeling.doetMee', { naam: x.naam })])];
  const regelNu = k.meedoenMet ? `kamer:${k.meedoenMet}` : k.regelzone ? `zone:${k.regelzone}` : '';
  return `<div><label class="label" for="regel-${esc(k.id)}">${esc(t('groep.regeling'))}</label><select class="veld" id="regel-${esc(k.id)}" data-actie="regeling">${regel.map(([v, x]) => `<option value="${esc(v)}" ${v === regelNu ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`;
}

function kamerBlad(d, k) {
  const etages = info.etages.map((e) => [e.id, etageNaam(d, e.id)]);
  const zoneNaam = (z) => k.zones.find((x) => x.id === z)?.naam;
  const apps = apparatenIn(k.id);
  const erbij = [...(huisData?.zonderRuimte ?? []).map((x) => [x.id, t('indeling.nogInTeDelen', { naam: x.naam })]), ...(huisData?.verborgen ?? []).map((x) => [x.id, t('indeling.verborgenNaam', { naam: x.naam })])];
  const opties = (lijst, waarde) => lijst.map(([v, x]) => `<option value="${esc(v)}" ${v === waarde ? 'selected' : ''}>${esc(x)}</option>`).join('');
  return `
    <button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, k.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)}</h2><span class="mini">${esc(t('indeling.gekozen'))}</span></div>
    ${kamerTabs(k)}
    <div><label class="label" for="kamernaam-${esc(k.id)}">${esc(t('indeling.naam'))}</label><input class="veld" id="kamernaam-${esc(k.id)}" data-actie="kamernaam" value="${esc(k.naam)}" maxlength="40"></div>
    ${buitenKeuze(k)}
    ${soortKeuze(k)}
    ${zonesKeuze(k)}
    <div>
      <span class="label">${esc(t(apps.length ? 'indeling.apparatenSleep' : 'indeling.apparaten'))}</span>
      ${apps.length ? apps.map((a) => `<button type="button" class="app" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}"><span class="greep" aria-hidden="true">⋮⋮</span><span class="l"><b>${esc(a.naam)}</b><span>${esc(zoneNaam(a.zone) ?? soortTekst(a))}</span></span></button>`).join('') : `<p class="klein" style="margin: 0">${esc(t('indeling.nogNiets'))}</p>`}
    </div>
    ${erbij.length ? `<div><label class="label" for="erbij-${esc(k.id)}">${esc(t('indeling.apparaatErbij'))}</label><select class="veld" id="erbij-${esc(k.id)}" data-actie="erbij"><option value="">${esc(t('indeling.kiesApparaat'))}</option>${opties(erbij, '')}</select></div>` : ''}
    <div><label class="label" for="etage-${esc(k.id)}">${esc(t('indeling.etageLabel'))}</label><select class="veld" id="etage-${esc(k.id)}" data-actie="kameretage">${opties(etages, k.etage)}</select></div>
    ${plekKeuze(d, k)}
    <button type="button" class="knop gevaar" data-naar-weghalen style="margin-top: auto">${esc(t(k.etage === 'buiten' ? 'indeling.deelWeg' : 'indeling.kamerWeg'))}</button>`;
}

/* ------------------------------------------------- verwarmen en koelen (besluit 132) */

/*
 * Per kamer wat er warmt en koelt (schets Wand-Indeling-Warmte). Wat Home
 * Assistant al weet, staat er als "gevonden": een airco, een radiatorknop, een
 * thermostaat. Wat de bewoner toevoegt, gaat met de indeling mee. Een
 * elektrische bron die slim aangaat, krijgt een vermogen en mag op zon; wat
 * met de hand gaat, krijgt een idee in plaats van een tekort.
 */
const BRON_KEUZE = ['radiator', 'vloer', 'paneel', 'kachel', 'airco'].map((b) => [b, huismodel.metHoofdletter(t(`bron.${b}`))]);
const AAN_KEUZE = ['thermostaat', 'knop', 'stekker', 'hand'].map((a) => [a, t(`indeling.aan.${a}`)]);
/** Het formulier van een bron, of null. */
let bronVorm = null;

function kamerTabs(k) {
  if (alleBuitenEtage(k)) return '';
  const tab = keuze.tab === 'warmte' ? 'warmte' : 'kamer';
  return `<div class="kamertabs" role="tablist" aria-label="${esc(t('comfort.kamer'))}"><button type="button" role="tab" data-kamertab="kamer" aria-selected="${tab === 'kamer'}">${esc(t('comfort.kamer'))}</button><button type="button" role="tab" data-kamertab="warmte" aria-selected="${tab === 'warmte'}">${esc(t('indeling.warmte'))}</button></div>`;
}

/** De klimaatapparaten die het huis kent, met de sleutel waarmee een bron ernaar wijst. */
function klimaatToestellen() {
  return (huisData?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat').map((a) => ({ sleutel: a.actuatorId ?? a.id, a, kamer: r }))));
}
const toestelNaam = (sleutel) => klimaatToestellen().find((x) => x.sleutel === sleutel)?.a.naam ?? (huisData?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []).find((a) => a.id === sleutel)?.naam ?? sleutel;

const ICOON_WARM = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb090" stroke-width="1.8" stroke-linecap="round"><path d="M3 19h18M6 15c1.5-1.5 1.5-3 0-4.5S4.5 7.5 6 6M12 15c1.5-1.5 1.5-3 0-4.5S10.5 7.5 12 6M18 15c1.5-1.5 1.5-3 0-4.5S16.5 7.5 18 6"/></svg>';
const ICOON_RADIATOR = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb090" stroke-width="1.8" stroke-linecap="round"><path d="M6 4v16M10 4v16M14 4v16M18 4v16M4 8h16M4 16h16"/></svg>';
const ICOON_KOEL = '<svg viewBox="0 0 24 24" fill="none" stroke="#a9e6ff" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18c0-1.5 1-2 1-3M12 19c0-1.5 1-2 1-3M17 18c0-1.5 1-2 1-3"/></svg>';
const ICOON_THERMO = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb090" stroke-width="1.8" stroke-linecap="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>';

/*
 * De regeling per kamer (besluit 138, schets Wand-Indeling-Regeling): per
 * klimaatapparaat wat de regeling ermee doet. Wat de kamer nog niet vastlegde,
 * staat zoals de dienst het nu regelt.
 */
const ROL_KEUZE = ['houdt', 'zon', 'kijken'].map((r) => [r, t(`indeling.rol.${r}`), t(`indeling.rol.${r}Zin`)]);
function rolVan(k, sleutel) {
  if (k.rollen) return k.rollen[sleutel] ?? 'kijken';
  return klimaatToestellen().find((x) => x.sleutel === sleutel)?.a.klimaat?.rol ?? 'kijken';
}
/** Alle klimaatapparaten in de kamer met hun rol, zoals ze nu staan. */
function rollenNu(k) {
  const rollen = {};
  for (const a of (ruimteVan(k.id)?.apparaten ?? []).filter((x) => x.soort === 'klimaat')) rollen[a.actuatorId ?? a.id] = rolVan(k, a.actuatorId ?? a.id);
  for (const [s, r] of Object.entries(k.rollen ?? {})) if (!(s in rollen)) rollen[s] = r;
  return rollen;
}
/** Wat de app voorstelt voor een apparaat dat erbij komt: een airco helpt op zon, de eerste verwarming houdt de kamer warm. */
function rolVoorstel(k, sleutel) {
  const a = klimaatToestellen().find((x) => x.sleutel === sleutel)?.a;
  if (a?.klimaat?.kanKoelen) return 'zon';
  const alHoudt = Object.entries(rollenNu(k)).some(([s, r]) => s !== sleutel && r === 'houdt');
  return alHoudt ? 'kijken' : 'houdt';
}
function rolRegel(k, sleutel) {
  const rol = rolVan(k, sleutel);
  const id = `rol-${sleutel.replace(/[^a-z0-9_-]/gi, '-')}`;
  return `<div class="rolrij"><label for="${esc(id)}">${esc(t('indeling.deRegeling'))}</label><select class="veld rolkeuze" id="${esc(id)}" data-rol="${esc(sleutel)}">${ROL_KEUZE.map(([w, x]) => `<option value="${w}" ${w === rol ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>${rol === 'zon' ? `<p class="rolzin">${esc(t('indeling.rolZon'))}</p>` : ''}`;
}
function rolKeuzes(gekozen) {
  return `<div class="keuzes" role="radiogroup" aria-label="${esc(t('indeling.watRegeling'))}">${ROL_KEUZE.map(([w, x, u]) => `<button type="button" class="keuze${w === gekozen ? ' aan' : ''}" role="radio" aria-checked="${w === gekozen}" data-bron-rol="${w}"><i></i><span><b>${esc(x)}</b><span>${esc(u)}</span></span></button>`).join('')}</div>`;
}

function bronKaart(kop, wat, ikoon, koel, rechts, regels = '', attrs = '') {
  return `<div class="bron"${attrs}><div class="boven"><span class="ikoon${koel ? ' koel' : ''}">${ikoon}</span><div><b>${esc(kop)}</b><span class="wat">${esc(wat)}</span></div>${rechts}</div>${regels}</div>`;
}

function warmteBlad(d, k) {
  const kop = `<button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, k.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)}</h2><span class="mini">${ruimteVan(k.id)?.temperatuurC != null ? `${nl(ruimteVan(k.id).temperatuurC)}°` : esc(t('indeling.geenMeter'))}</span></div>
    ${kamerTabs(k)}`;
  if (bronVorm) return kop + bronFormulier(k);
  const r = ruimteVan(k.id);
  // Meten met en de regeling staan hier, bij verwarmen en koelen (besluit 167); eerst bij Kamer.
  const meetRij = `${metenKeuze(k)}${regelingKeuze(d, k)}`;

  const bronnen = k.bronnen ?? [];
  const vast = new Set(bronnen.map((b) => b.apparaat).filter(Boolean));
  const gevonden = (r?.apparaten ?? []).filter((a) => a.soort === 'klimaat' && !vast.has(a.actuatorId ?? a.id));
  const slim = `<span class="stand slim">${esc(t('indeling.slim'))}</span>`;
  const via = (naam) => `${esc(t('indeling.via'))} <b>${esc(naam)}</b>`;
  const kaarten = [];
  for (const a of gevonden) {
    const sleutel = a.actuatorId ?? a.id;
    const viaRegel = `<div class="regelt">${via(a.naam)}${a.klimaat?.filter?.pct != null ? `<span class="mini">${esc(t('indeling.filterPct', { pct: a.klimaat.filter.pct }))}</span>` : ''}${a.radiatorknop?.klepPct != null ? `<span class="mini">${esc(t('indeling.klepPct', { pct: a.radiatorknop.klepPct }))}</span>` : ''}</div>`;
    const rol = rolRegel(k, sleutel);
    if (a.klimaat?.kanKoelen) kaarten.push(bronKaart(t('indeling.airco'), huismodel.opsomming([t('indeling.koelt'), a.klimaat.kanVerwarmen ? t('indeling.verwarmt') : null, a.klimaat.kanDrogen ? t('indeling.droogt') : null].filter(Boolean)), ICOON_KOEL, true, slim, viaRegel + rol));
    else if (a.radiatorknop) kaarten.push(bronKaart(t('indeling.knopRadiator'), t('indeling.opCv'), ICOON_RADIATOR, false, slim, viaRegel + rol));
    // De thermostaat van de ketel (besluit 167): de radiatoren gaan mee; wat eraan hangt, vraagt hij niet.
    else if (cvThermo()?.sleutel === sleutel) kaarten.push(bronKaart(t('indeling.cvThermostaat'), t('indeling.cvThermostaatZin'), ICOON_THERMO, false, slim, viaRegel + rol));
    else kaarten.push(bronKaart(t('kan.thermostaat').replace(/^./, (c) => c.toUpperCase()), t('indeling.gevondenHA'), ICOON_THERMO, false, slim, `${viaRegel}${rol}<button type="button" class="vraagknop" data-bron-nieuw="${esc(sleutel)}">${esc(t('indeling.watHangt'))}</button>`));
  }
  for (const b of bronnen) {
    const elektrisch = b.soorten.some((x) => huismodel.ELEKTRISCH.has(x));
    const wat = b.aan === 'hand' ? t('indeling.metHand') : [elektrisch ? t('indeling.elektrisch') : b.soorten.includes('airco') ? null : t('indeling.opCv'), b.soorten.length > 1 ? t('indeling.samenAan') : null].filter(Boolean).join(', ') || AAN_KEUZE.find(([v]) => v === b.aan)?.[1].toLowerCase();
    const rechts = b.aan === 'hand' ? `<span class="stand hand">${esc(t('indeling.aan.hand'))}</span>` : b.vermogenW ? `<span class="w">${b.vermogenW} W</span>` : slim;
    const ikoon = b.soorten.includes('airco') ? ICOON_KOEL : b.soorten.includes('radiator') ? ICOON_RADIATOR : ICOON_WARM;
    let regels = '';
    if (b.apparaat) regels += `<div class="regelt">${via(toestelNaam(b.apparaat))}${b.aan !== 'hand' && b.vermogenW ? slim : ''}</div>`;
    if (b.apparaat && klimaatToestellen().some((x) => x.sleutel === b.apparaat && x.kamer.id === k.id)) regels += rolRegel(k, b.apparaat);
    // Op zon (besluit 132): alleen elektrisch, met vermogen, en een apparaat van de regeling in deze kamer.
    const vanRegeling = !!b.apparaat && !!r?.zoneId && (r?.apparaten ?? []).some((a) => a.soort === 'klimaat' && a.actuatorId === b.apparaat);
    if (huismodel.isElektrischSlim(b) && b.vermogenW && vanRegeling) regels += `<div class="opzon">${esc(t('indeling.magZon'))}<button type="button" class="schakel" role="switch" aria-checked="${!!b.opZon}" aria-label="${esc(t('indeling.magZon'))}" data-bron-zon="${esc(b.id)}"></button></div>`;
    if (b.aan === 'hand' && elektrisch) regels += `<div class="idee"><b>${esc(t('indeling.maakSlim'))}</b>${esc(t('indeling.maakSlimZin'))}</div>`;
    kaarten.push(bronKaart(huismodel.bronNaam(b), wat, ikoon, b.soorten.includes('airco'), rechts, regels, ` data-bron-open="${esc(b.id)}" role="button" tabindex="0"`));
  }
  const leeg = !kaarten.length ? `<p class="klein" style="margin: 0">${esc(t('indeling.nogNietsWarm'))}</p>` : '';
  const doetMee = Object.values(rollenNu(k)).some((x) => x !== 'kijken');
  // Meedoen met een andere kamer (besluit 142): dat zegt de kaart, in plaats van "doet nog niet mee".
  const met = k.meedoenMet ? concept()?.kamers.find((x) => x.id === k.meedoenMet) : null;
  const nietMee = met
    ? `<div class="uitleg"><b>${esc(t('indeling.doetMeePunt', { naam: met.naam }))}</b>${esc(t('indeling.doetMeeZin'))}</div>`
    : kaarten.length && !doetMee ? `<div class="uitleg"><b>${esc(t('indeling.nietMee'))}</b>${esc(t('indeling.nietMeeZin'))}</div>` : '';
  return `${kop}${meetRij}${kaarten.join('')}${leeg}${nietMee}
    <button type="button" class="plus" data-bron-nieuw="">${esc(t('indeling.plusIets'))}</button>
    <p class="mini" style="margin: 0">${esc(t('indeling.zekeringMee'))}</p>`;
}

function bronFormulier(k) {
  const v = bronVorm;
  const chip = (attr, waarde, tekst, aan) => `<button type="button" class="chip${aan ? ' aan' : ''}" data-${attr}="${esc(waarde)}" aria-pressed="${aan}">${esc(tekst)}</button>`;
  const vloer = v.soorten.has('vloer');
  const elektrisch = v.soorten.has('paneel') || v.soorten.has('kachel') || (vloer && v.vloer === 'elektrisch');
  // Op de cv (besluit 167): een radiator of vloerverwarming op water gaat aan met de
  // thermostaat van de ketel, een slimme radiatorknop of met de hand.
  const cv = !elektrisch && !v.soorten.has('airco') && (v.soorten.has('radiator') || vloer);
  const ketel = cvThermo();
  const aanOpties = cv
    ? [['thermostaat', ketel ? t('indeling.cvThermoNaam', { naam: ketel.naam }) : t('indeling.cvThermo')], ...(v.soorten.has('radiator') ? [['knop', t('indeling.aan.knop')]] : []), ['hand', t('indeling.aan.hand')]]
    : AAN_KEUZE.filter(([w]) => w !== 'knop');
  const toestellen = klimaatToestellen();
  // Een radiatorknop kies je uit de knoppen; met de thermostaat van de ketel hoeft er niets gekozen.
  const kiesbaar = v.aan === 'knop' ? toestellen.filter((x) => x.a.radiatorknop) : toestellen;
  const welke = v.aan && v.aan !== 'hand' && !(cv && v.aan === 'thermostaat')
    ? `<div class="vraag"><label class="label" for="bron-apparaat">${esc(t(v.aan === 'knop' ? 'indeling.welkeKnop' : 'indeling.welkApparaat'))}</label><select class="veld" id="bron-apparaat" data-bron-apparaat><option value="">${esc(t('indeling.kies'))}</option>${kiesbaar.map((x) => `<option value="${esc(x.sleutel)}" ${x.sleutel === v.apparaat ? 'selected' : ''}>${esc(t('energie.naamKamer', { naam: x.a.naam, kamer: x.kamer.naam }))}</option>`).join('')}</select></div>`
    : '';
  // Wat de regeling ermee doet, alleen voor een apparaat dat in deze kamer komt; de thermostaat van de ketel blijft waar hij hangt.
  const rol = v.apparaat && v.aan && v.aan !== 'hand' && v.apparaat !== ketel?.sleutel && toestellen.some((x) => x.sleutel === v.apparaat)
    ? `<div class="vraag"><span class="label">${esc(t('indeling.watDoet'))}</span>${rolKeuzes(v.rol ?? rolVoorstel(k, v.apparaat))}</div>`
    : '';
  const vermogen = elektrisch && v.aan && v.aan !== 'hand'
    ? `<div class="vraag"><label class="label" for="bron-w">${esc(t(v.soorten.size > 1 ? 'indeling.samenVermogen' : 'indeling.vermogen'))}</label><div class="invoer"><input id="bron-w" inputmode="numeric" data-bron-w value="${v.vermogenW ?? ''}" placeholder="${esc(t('indeling.bv800'))}"><span>${esc(t('indeling.watt'))}</span></div><span class="mini">${esc(t('indeling.genoegZon'))}</span></div>`
    : '';
  return `<div class="bladkop" style="margin-top: 4px"><h3 class="kop-3" style="margin: 0">${esc(t(v.id ? 'panelen.aanpassen' : 'indeling.ietsToevoegen'))}</h3></div>
    <div class="vraag"><span class="label">${esc(t('indeling.watHangtEr'))}</span><div class="chips">${BRON_KEUZE.map(([w, x]) => chip('bron-soort', w, x, v.soorten.has(w))).join('')}</div></div>
    ${vloer ? `<div class="vraag"><span class="label">${esc(t('indeling.vloerIs'))}</span><div class="chips">${chip('bron-vloer', 'water', t('indeling.opWater'), v.vloer !== 'elektrisch')}${chip('bron-vloer', 'elektrisch', huismodel.metHoofdletter(t('indeling.elektrisch')), v.vloer === 'elektrisch')}</div></div>` : ''}
    ${v.soorten.size ? `<div class="vraag"><span class="label">${esc(t('indeling.hoeAan'))}</span><div class="chips">${aanOpties.map(([w, x]) => chip('bron-aan', w, x, v.aan === w)).join('')}</div></div>` : ''}
    ${welke}
    ${vermogen}
    ${rol}
    <div class="knoppenrij" style="margin-top: auto">${v.id ? `<button type="button" class="knop gevaar" data-bron-weg>${esc(t('bewoners.weghalen'))}</button>` : ''}<button type="button" class="knop" data-bron-annuleer>${esc(t('indeling.annuleren'))}</button><button type="button" class="knop knop-licht" data-bron-bewaar ${v.soorten.size && v.aan ? '' : 'disabled'}>${esc(t(v.id ? 'indeling.bewaren' : 'indeling.toevoegen'))}</button></div>`;
}

/** Het formulier naar een bron zoals de dienst hem bewaart. */
function bronUitVorm(k) {
  const v = bronVorm;
  const soorten = [...v.soorten].map((x) => (x === 'vloer' && v.vloer === 'elektrisch' ? 'vloer-elektrisch' : x));
  const w = Number(String(document.querySelector(`${app.zicht()} [data-bron-w]`)?.value ?? v.vermogenW ?? '').replace(/\D/g, ''));
  const b = { id: v.id ?? idVan(soorten.join('-'), new Set((k.bronnen ?? []).map((x) => x.id))), soorten, aan: v.aan };
  // Op de cv met de thermostaat van de ketel (besluit 167): die is het apparaat.
  const cv = !soorten.some((x) => huismodel.ELEKTRISCH.has(x)) && !soorten.includes('airco') && (soorten.includes('radiator') || soorten.includes('vloer'));
  const ketel = cvThermo();
  if (cv && v.aan === 'thermostaat') {
    if (ketel) b.apparaat = ketel.sleutel;
  } else if (v.aan !== 'hand' && v.apparaat) b.apparaat = v.apparaat;
  if (huismodel.isElektrischSlim(b) && w >= 50) b.vermogenW = Math.round(w);
  if (v.opZon && b.vermogenW) b.opZon = true;
  return b;
}

async function bronKlik(knop) {
  const next = concept();
  const k = next?.kamers.find((x) => x.id === keuze.kamer);
  if (!k) return false;
  if (knop.dataset.kamertab) {
    bronVorm = null;
    kies({ tab: knop.dataset.kamertab });
  } else if (knop.dataset.bronNieuw !== undefined) {
    const a = knop.dataset.bronNieuw;
    bronVorm = { id: null, soorten: new Set(), vloer: 'elektrisch', aan: a ? 'thermostaat' : null, apparaat: a || null, vermogenW: null, rol: null };
    teken();
  } else if (knop.dataset.bronOpen) {
    const b = (k.bronnen ?? []).find((x) => x.id === knop.dataset.bronOpen);
    if (!b) return true;
    bronVorm = { id: b.id, soorten: new Set(b.soorten.map((x) => (x === 'vloer-elektrisch' ? 'vloer' : x))), vloer: b.soorten.includes('vloer-elektrisch') ? 'elektrisch' : 'water', aan: b.aan, apparaat: b.apparaat ?? null, vermogenW: b.vermogenW ?? null, opZon: !!b.opZon };
    teken();
  } else if (knop.dataset.bronSoort) {
    const w = knop.dataset.bronSoort;
    if (bronVorm.soorten.has(w)) bronVorm.soorten.delete(w);
    else bronVorm.soorten.add(w);
    if (bronVorm.aan === 'knop' && !bronVorm.soorten.has('radiator')) bronVorm.aan = null;
    teken();
  } else if (knop.dataset.bronVloer) {
    bronVorm.vloer = knop.dataset.bronVloer;
    teken();
  } else if (knop.dataset.bronAan) {
    bronVorm.vermogenW = Number(document.querySelector(`${app.zicht()} [data-bron-w]`)?.value) || bronVorm.vermogenW;
    bronVorm.aan = knop.dataset.bronAan;
    teken();
  } else if (knop.dataset.bronRol) {
    bronVorm.vermogenW = Number(document.querySelector(`${app.zicht()} [data-bron-w]`)?.value) || bronVorm.vermogenW;
    bronVorm.rol = knop.dataset.bronRol;
    teken();
  } else if (knop.hasAttribute('data-bron-annuleer')) {
    bronVorm = null;
    teken();
  } else if (knop.hasAttribute('data-bron-bewaar')) {
    const b = bronUitVorm(k);
    k.bronnen = [...(k.bronnen ?? []).filter((x) => x.id !== b.id), b];
    // Een klimaatapparaat (besluit 138): het komt in deze kamer, met wat de regeling ermee doet.
    // De thermostaat van de ketel blijft waar hij hangt (besluit 167): hij zet alleen de ketel aan.
    if (b.apparaat && b.apparaat !== cvThermo()?.sleutel && klimaatToestellen().some((x) => x.sleutel === b.apparaat)) {

      const rol = bronVorm.rol ?? rolVoorstel(k, b.apparaat);
      for (const x of next.kamers) if (x.id !== k.id && x.rollen && b.apparaat in x.rollen) delete x.rollen[b.apparaat];
      k.rollen = { ...rollenNu(k), [b.apparaat]: rol };
      next.apparaten[b.apparaat] = { ...(next.apparaten[b.apparaat] ?? {}), kamer: k.id, zone: next.apparaten[b.apparaat]?.kamer === k.id ? (next.apparaten[b.apparaat].zone ?? null) : null };
    }
    const naam = huismodel.bronNaam(b);
    if (await bewaar(next, t('indeling.bewaard', { naam }))) bronVorm = null;
    teken();
  } else if (knop.hasAttribute('data-bron-weg')) {
    const id = bronVorm?.id;
    k.bronnen = (k.bronnen ?? []).filter((x) => x.id !== id);
    if (!k.bronnen.length) delete k.bronnen;
    if (await bewaar(next, t('indeling.weggehaald'))) bronVorm = null;
    teken();
  } else if (knop.dataset.bronZon) {
    const b = (k.bronnen ?? []).find((x) => x.id === knop.dataset.bronZon);
    if (!b) return true;
    b.opZon = !b.opZon;
    if (!b.opZon) delete b.opZon;
    await bewaar(next, t(b.opZon ? 'indeling.zonAan' : 'indeling.zonUit'));
  } else return false;
  return true;
}

/*
 * Een buitenruimte (besluiten 109 en 167): wat het is, uit een eigen lijst
 * zoals Soort kamer binnen, met een voorstel uit de naam. Een tuinhuis in de
 * tuin komt uit de zones: een zone Tuinhuis tekent het huisje. Alleen bij een
 * oprit of carport nog "Auto op de oprit". Alleen op de etage Buiten; staat hij
 * nog op een etage binnen, dan zegt het blad hoe hij daar komt.
 */
const { BUITEN_SOORTEN, BUITEN_ZONES } = huismodel;
function buitenNu(k) {
  return k.buiten ?? ruimteVan(k.id)?.buiten ?? huismodel.soortBuiten(k);
}
function buitenKeuze(k) {
  if (k.etage !== 'buiten') {
    return huismodel.isBuiten({ id: k.etage }, k) ? `<p class="mini" style="margin: 0">${esc(t('indeling.klinktBuiten'))}</p>` : '';
  }
  const b = buitenNu(k);
  const naam = (w) => BUITEN_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const voorstel = huismodel.buitenUitNaam(k.naam);
  const nu = k.buiten?.soort ?? '';
  const opties = [['', voorstel ? t('indeling.uitNaam', { naam: naam(voorstel) }) : t('indeling.nietsHerkend')], ...BUITEN_SOORTEN];
  const auto = b.soort === 'oprit' || b.soort === 'carport'
    ? `<div><span class="label">${esc(t('indeling.inTekening'))}</span><div class="chips" role="group" aria-label="${esc(t('indeling.watErbij'))}"><button type="button" class="chip${b.auto ? '' : ' uitchip'}" data-buiten="auto" data-waarde="${!b.auto}" aria-pressed="${!!b.auto}">${esc(t('indeling.autoOprit'))}</button></div></div>`
    : '';
  return `<div><label class="label" for="buiten-${esc(k.id)}">${esc(t('indeling.watIsHet'))}</label><select class="veld" id="buiten-${esc(k.id)}" data-actie="buitensoort">${opties.map(([v, x]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>${auto}`;
}

/*
 * Wat voor kamer het is (besluit 119): bepaalt de inrichting als je inzoomt.
 * Zonder keuze een voorstel uit de naam; de keuze gaat voor.
 */
const { KAMER_SOORTEN, ZONE_SOORTEN } = huismodel;
/*
 * Meten met (besluit 123): één of meer sensoren, waarvan het gemiddelde de
 * temperatuur van de kamer is. Eerst wat in de kamer staat; een sensor uit een
 * andere kamer kan erbij.
 */
function temperatuurBronnen() {
  return (huisData?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((d) => d.meting?.temperatuurC != null).map((d) => ({ id: d.id, naam: d.naam, kamerId: r.id, kamer: r.naam, c: d.meting.temperatuurC }))));
}
function metenKeuze(k) {
  if (k.etage === 'buiten' || huismodel.isBuiten({ id: k.etage }, k)) return '';
  const bronnen = temperatuurBronnen();
  const gekozen = new Set(k.meten ?? []);
  const hier = bronnen.filter((b) => b.kamerId === k.id || gekozen.has(b.id));
  const elders = bronnen.filter((b) => b.kamerId !== k.id && !gekozen.has(b.id));
  const graad = (c) => `${nl(Math.round(c * 10) / 10, Number.isInteger(Math.round(c * 10) / 10) ? 0 : 1)}°`;
  const chip = (b) => `<button type="button" class="chip${gekozen.has(b.id) ? '' : ' uitchip'}" data-meten="${esc(b.id)}" aria-pressed="${gekozen.has(b.id)}">${esc(b.naam)}${b.kamerId !== k.id ? ` (${esc(b.kamer)})` : ''} · ${graad(b.c)}</button>`;
  const uitleg = t(!gekozen.size ? (k.regelzone ? 'indeling.meten.zoals' : 'indeling.meten.app') : k.regelzone ? 'indeling.meten.telt' : 'indeling.meten.gemiddelde');
  return `<div><span class="label">${esc(t('zoek.meten'))}</span>
    <div class="chips" role="group" aria-label="${esc(t('zoek.meten'))}">${hier.length ? hier.map(chip).join('') : `<span class="mini">${esc(t('indeling.geenThermometer'))}</span>`}</div>
    ${elders.length ? `<select class="veld" data-actie="meten-erbij" aria-label="${esc(t('indeling.sensorElders'))}" style="margin-top: 6px"><option value="">${esc(t('indeling.sensorElders'))}…</option>${elders.map((b) => `<option value="${esc(b.id)}">${esc(b.naam)} (${esc(b.kamer)}) · ${graad(b.c)}</option>`).join('')}</select>` : ''}
    <p class="mini" style="margin: 6px 0 0">${esc(uitleg)}</p></div>`;
}

function soortKeuze(k) {
  if (k.etage === 'buiten' || huismodel.isBuiten({ id: k.etage }, k)) return '';
  const r = ruimteVan(k.id);
  const voorstel = r && !r.soortGekozen ? r.soort : null;
  const naam = (w) => KAMER_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const nu = k.soort ?? '';
  const icoon = huis.KAMER_ICOON?.[k.soort ?? voorstel ?? 'kamer'];
  const opties = [['', voorstel ? t('indeling.uitNaam', { naam: naam(voorstel) }) : t('indeling.nietsHerkend')], ...KAMER_SOORTEN];
  return `<div><label class="label soortlabel" for="soort-${esc(k.id)}">${icoon ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icoon}</svg>` : ''}${esc(t('indeling.soortKamer'))}</label><select class="veld" id="soort-${esc(k.id)}" data-actie="soort">${opties.map(([v, x]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`;
}

/*
 * Zones (besluit 145): de delen van een kamer, van links naar rechts zoals in
 * de tekening. Elk deel heeft een soort, zoals keuken of zithoek; die bepaalt
 * de inrichting van dat deel. Zonder keuze een voorstel uit de naam.
 */
function zonesKeuze(k) {
  // Buiten een eigen lijst: gazon, border, tuinhuis (besluit 167).
  const buiten = k.etage === 'buiten';
  const LIJST = buiten ? BUITEN_ZONES : ZONE_SOORTEN;
  const naam = (w) => LIJST.find(([x]) => x === w)?.[1] ?? '';
  const pijl = (z, i, stap, teken, wat) => `<button type="button" class="knop klein-knop" data-zone-schuif="${stap}" data-zone="${esc(z.id)}" aria-label="${esc(t(`indeling.zone.${wat}`, { naam: z.naam }))}" ${i + stap < 0 || i + stap >= k.zones.length ? 'disabled' : ''}>${teken}</button>`;
  const rijen = k.zones.map((z, i) => {
    const voorstel = buiten ? huismodel.buitenZoneUitNaam(z.naam) : huis.soortVan?.(z.naam);
    const opties = [['', voorstel && naam(voorstel) ? t('indeling.uitNaam', { naam: naam(voorstel) }) : t('indeling.nietsHerkend')], ...LIJST];
    return `<div class="zonerij${k.zones.length > 1 ? '' : ' enkel'}">
      <input class="veld" data-zone-naam="${esc(z.id)}" value="${esc(z.naam)}" maxlength="40" aria-label="${esc(t('indeling.zone.naam', { naam: z.naam }))}">
      <select class="veld" data-zone-soort="${esc(z.id)}" aria-label="${esc(t('indeling.zone.soort', { naam: z.naam }))}">${opties.map(([v, x]) => `<option value="${esc(v)}" ${v === (z.soort ?? '') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      ${k.zones.length > 1 && !buiten ? pijl(z, i, -1, '‹', 'links') + pijl(z, i, 1, '›', 'rechts') : ''}
      <button type="button" class="knop klein-knop" data-zone-weg="${esc(z.id)}" aria-label="${esc(t('indeling.zone.weg', { naam: z.naam }))}">×</button>
    </div>`;
  });
  // Hoe een lamp in een zone komt (28 oktober 2026): dat was niet te vinden.
  const uitleg = k.zones.length ? `<p class="mini" style="margin: 6px 0 0">${esc(t('indeling.zoneLampUitleg'))}</p>` : '';
  return `<div><span class="label">${esc(t(buiten ? 'indeling.zonesBuiten' : 'indeling.zones'))}</span>${rijen.join('')}<div class="chips"><input class="chip plus" data-nieuwe-zone placeholder="${esc(t('indeling.plusZone'))}" aria-label="${esc(t('indeling.nieuweZone'))}" maxlength="40" style="width: 110px"></div>${uitleg}</div>`;
}
/* De plek van een kamer op zijn etage, van links naar rechts zoals in de tekening. Buiten heeft elk deel een vaste plek (besluit 206). */
function plekKeuze(d, k) {
  const buren = d.kamers.filter((x) => x.etage === k.etage);
  if (buren.length < 2 || k.etage === 'buiten') return '';
  const i = buren.findIndex((x) => x.id === k.id);
  return `<div><span class="label">${esc(t('indeling.plek', { i: i + 1, n: buren.length }))}</span><div class="knoppenrij">
    <button type="button" class="knop" data-kamer-schuif="-1" ${i <= 0 ? 'disabled' : ''}>${esc(t('indeling.naarLinks'))}</button>
    <button type="button" class="knop" data-kamer-schuif="1" ${i >= buren.length - 1 ? 'disabled' : ''}>${esc(t('indeling.naarRechts'))}</button>
  </div></div>`;
}

const SOORTEN = ['licht', 'klimaat', 'screen', 'meter', 'apparaat', 'camera', 'rookmelder'];
const soortTekst = (a) => (a.soort === 'meter' && a.meting?.beweging ? t('indeling.soort.beweging') : a.soort === 'screen' && a.scherm?.zonnescherm ? t('indeling.soort.zonnescherm') : SOORTEN.includes(a.soort) ? t(`indeling.soort.${a.soort}`) : a.soort);

function apparaatBlad(d, dev, inLijst = false) {
  if (!dev) return etageBlad(d);
  const kamerId = dev.kamer ?? dev.voorstelKamer ?? keuze.kamer ?? '';
  const kamers = d.kamers.map((k) => `<option value="${esc(k.id)}" ${k.id === kamerId ? 'selected' : ''}>${esc(k.naam)} (${esc(etageNaam(d, k.etage))})</option>`).join('');
  const k = d.kamers.find((x) => x.id === kamerId);
  const zones = (k?.zones ?? []).map((z) => `<option value="${esc(z.id)}" ${z.id === dev.zone ? 'selected' : ''}>${esc(z.naam)}</option>`).join('');
  const waar = dev.waar === 'los' ? (dev.voorstelKamer ? t('indeling.losVoorstel', { naam: d.kamers.find((x) => x.id === dev.voorstelKamer)?.naam ?? '' }) : t('indeling.los')) : dev.waar === 'verborgen' ? t('indeling.verborgenPunt') : '';
  const ha = dev.haNaam && dev.haNaam !== dev.naam ? t('indeling.inHA', { naam: dev.haNaam }) : '';
  const terug = t('panelen.terug');
  // In de lijst van Nog in te delen of Verborgen staat de lijst er al naast: geen Terug.
  return `
    ${inLijst ? '' : `<button type="button" class="terug" data-terug-apparaat>‹ ${esc(dev.kamer ? d.kamers.find((x) => x.id === dev.kamer)?.naam ?? terug : terug)}</button>`}
    <div class="bladkop"><h2 class="kop-2">${esc(dev.naam)}</h2><span class="mini">${esc(soortTekst(dev))}</span></div>
    ${waar || ha ? `<p class="klein" style="margin: 0">${esc([waar, ha].filter(Boolean).join(' '))}</p>` : ''}
    <div><label class="label" for="appnaam">${esc(t('indeling.appNaam'))}</label><input class="veld" id="appnaam" data-app-naam value="${esc(dev.naam)}" placeholder="${esc(dev.haNaam ?? dev.naam)}" maxlength="60"></div>
    <div><label class="label" for="appkamer">${esc(t('comfort.kamer'))}</label><select class="veld" id="appkamer" data-app-kamer>${kamerId ? '' : `<option value="" selected>${esc(t('indeling.kiesKamer'))}</option>`}${kamers}</select></div>
    <div data-zonevak ${zones ? '' : 'hidden'}><label class="label" for="appzone">${esc(t('indeling.zone'))}</label><select class="veld" id="appzone" data-app-zone><option value="">${esc(t('indeling.geenZone'))}</option>${zones}</select></div>
    ${gevelKeuze(dev)}
    <div class="rijknoppen"><button type="button" class="knop knop-licht" data-app-bewaar="${esc(dev.id)}">${esc(t('indeling.bewaren'))}</button>${dev.waar === 'verborgen' ? '' : `<button type="button" class="knop" data-naar-verbergen>${esc(t('indeling.verbergen'))}</button>`}</div>`;
}

/*
 * De gevel van een scherm (besluit 145): zo weet de app of de zon op dit scherm
 * staat. Zonder keuze een voorstel uit de naam; weet het huis het niet, dan
 * zegt de app niets over zon op het scherm.
 */
function gevelKeuze(dev) {
  const gevels = zon?.gevels ?? [];
  if (dev.soort !== 'screen' || !gevels.length) return '';
  const g = dev.scherm?.gevel;
  const nu = g?.gekozen ? g.id : '';
  const opties = [['', g && !g.gekozen ? t('indeling.uitNaam', { naam: g.naam }) : t('energie.weetNiet')], ...gevels.map((x) => [x.id, x.naam])];
  return `<div><label class="label" for="appgevel">${esc(t('indeling.gevel'))}</label><select class="veld" id="appgevel" data-app-gevel>${opties.map(([v, n]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><span class="mini">${esc(t(dev.scherm?.zonnescherm ? 'indeling.gevelZonnescherm' : 'indeling.gevelScreen'))}</span></div>`;
}

function verbergBlad(dev) {
  if (!dev) return '';
  return `
    <button type="button" class="terug" data-terug-verbergen>‹ ${esc(dev.naam)}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(t('indeling.verbergVraag', { naam: dev.naam }))}</h2></div>
    <p class="klein" style="margin: 0">${esc(t('indeling.verbergZin'))}</p>
    <div class="rijknoppen"><button type="button" class="knop gevaar" data-verberg="${esc(dev.id)}">${esc(t('indeling.jaVerbergen'))}</button><button type="button" class="knop" data-terug-verbergen>${esc(t('indeling.annuleren'))}</button></div>`;
}

function weghaalBlad(k) {
  const n = apparatenIn(k.id).length;
  return `
    <button type="button" class="terug" data-kamer="${esc(k.id)}">‹ ${esc(k.naam)}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(t('indeling.weghalenVraag', { naam: k.naam }))}</h2></div>
    <p class="klein" style="margin: 0">${esc(n ? t('indeling.gaatNaarLos', { n }) : t('indeling.staatNiets'))} ${esc(t('indeling.komtTerug'))}</p>
    <div class="rijknoppen"><button type="button" class="knop gevaar" data-kamer-weg="${esc(k.id)}">${esc(t('indeling.jaWeghalen'))}</button><button type="button" class="knop" data-kamer="${esc(k.id)}">${esc(t('indeling.annuleren'))}</button></div>`;
}

/* ------------------------------------------------------------ onderin */

function bak() {
  const los = huisData?.zonderRuimte ?? [];
  const weg = huisData?.verborgen ?? [];
  const voorstel = los.filter((x) => x.voorstelKamer);
  const verborgenChip = weg.length ? `<a class="chip" href="#verborgen">${esc(t('indeling.verborgenN', { n: weg.length }))}</a>` : '';
  if (!los.length) {
    return `<div class="uitleg"><b>${esc(t('indeling.allesPlek'))}</b><div class="klein">${esc(t('indeling.ietsNieuws'))}</div></div><div class="chips">${verborgenChip}</div>`;
  }
  return `
    <span class="getal zon-t" style="font-size: 30px">${los.length}</span>
    <div class="uitleg"><b>${esc(t('indeling.nogInDelen'))}</b><div class="klein">${esc(t('indeling.sleepHet'))}</div></div>
    <div class="chips">${voorstel.length > 1 ? `<button type="button" class="chip plus" data-voorstellen>${esc(t('indeling.voorstellen', { n: voorstel.length }))}</button>` : ''}${los.map((a) => `<button type="button" class="chip zon" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}">${esc(a.naam)}</button>`).join('')}${verborgenChip}</div>`;
}
/* ------------------------------------------------------------ doen */

function kies(wat) {
  if ('kamer' in wat && wat.kamer !== keuze.kamer) bronVorm = null;
  Object.assign(keuze, wat);
  // Naar een andere etage (een kamer verhuisd, een etage erbij): het deel gaat mee, zonder stap terug.
  if (wat.etage && wat.etage !== keuze.deel && ['etage', 'buiten', 'nieuw'].includes(deelSoort(keuze.deel))) {
    keuze.deel = wat.etage;
    history.replaceState(null, '', opAdres(wat.etage));
  }
  teken();
}

/** Een kamer kiezen; staat hij op een andere etage, dan gaat die mee. */
function kiesKamer(id) {
  const d = concept();
  if (id === '__nieuw') {
    kies({ kamer: null, apparaat: null, blad: 'etage' });
    requestAnimationFrame(() => document.querySelector(`${app.zicht()} [data-nieuwe-kamer]`)?.focus());
    return;
  }
  const k = d?.kamers.find((x) => x.id === id);
  if (!k) return;
  kies({ etage: alleBuitenEtage(k) && keuze.etage === 'buiten' ? 'buiten' : k.etage, kamer: id, apparaat: null, blad: 'kamer' });
}
const alleBuitenEtage = (k) => k.etage === 'buiten' || huismodel.isBuiten({ id: k.etage }, k);

let netGesleept = false;
document.addEventListener('click', async (e) => {
  if (netGesleept) {
    netGesleept = false;
    return;
  }
  const el = e.target.closest('button, [data-kamer], [data-bron-open]');
  if (!el || el.disabled) return;
  await naBewaren();
  const d = concept();
  if (!d) return;
  // Een knop in een bronkaart gaat voor de kaart zelf.
  if (el.matches('[data-bron-open]') && e.target.closest('button')) return;
  if (await bronKlik(el)) return;
  if (el.dataset.kamer) kiesKamer(el.dataset.kamer);
  else if (el.dataset.app) {
    kies({ apparaat: el.dataset.app, blad: 'apparaat' });
    // Op de telefoon staat het blad onder de lijst: daarheen.
    if (app.telStand() && el.closest('[data-lijst]')) requestAnimationFrame(() => document.querySelector('#tel [data-blad]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  else if (el.hasAttribute('data-naar-etage')) kies({ kamer: null, apparaat: null, blad: 'etage' });
  else if (el.hasAttribute('data-naar-weghalen')) kies({ blad: 'weghalen' });
  else if (el.hasAttribute('data-naar-verbergen')) kies({ blad: 'verbergen' });
  else if (el.hasAttribute('data-terug-verbergen')) kies({ blad: 'apparaat' });
  else if (el.hasAttribute('data-terug-apparaat')) kies({ apparaat: null, blad: keuze.kamer ? 'kamer' : 'etage' });
  else if (el.hasAttribute('data-ongedaan')) await ongedaan();
  else if (el.hasAttribute('data-kamer-toevoegen')) {
    const veld = el.parentElement.querySelector('[data-nieuwe-kamer]');
    await kamerErbij(veld?.value.trim() ?? '');
  } else if (el.dataset.zoneSchuif) {
    // Een zone een plek naar links of rechts in de kamer (besluit 145).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const i = k.zones.findIndex((x) => x.id === el.dataset.zone);
    const j = i + Number(el.dataset.zoneSchuif);
    if (i < 0 || j < 0 || j >= k.zones.length) return;
    const zones = [...k.zones];
    [zones[i], zones[j]] = [zones[j], zones[i]];
    k.zones = zones;
    await bewaar(next, t(j < i ? 'indeling.zoneLinks' : 'indeling.zoneRechts', { naam: zones[j].naam }));
  } else if (el.dataset.kamerSchuif) {
    // Een kamer een plek naar links of rechts op zijn etage: wisselen met de buurkamer (besluit 145).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const buren = next.kamers.filter((x) => x.etage === k.etage);
    const buur = buren[buren.findIndex((x) => x.id === k.id) + Number(el.dataset.kamerSchuif)];
    if (!buur) return;
    const a = next.kamers.indexOf(k);
    const b = next.kamers.indexOf(buur);
    [next.kamers[a], next.kamers[b]] = [next.kamers[b], next.kamers[a]];
    await bewaar(next, t(Number(el.dataset.kamerSchuif) < 0 ? 'indeling.kamerLinks' : 'indeling.kamerRechts', { naam: k.naam, buur: buur.naam }));
  } else if (el.dataset.zoneWeg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const z = k.zones.find((x) => x.id === el.dataset.zoneWeg);
    k.zones = k.zones.filter((x) => x.id !== z.id);
    for (const a of Object.values(next.apparaten)) if (a.kamer === k.id && a.zone === z.id) a.zone = null;
    await bewaar(next, t('indeling.zoneWeg', { naam: z.naam }));
  } else if (el.dataset.kamerWeg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === el.dataset.kamerWeg);
    next.kamers = next.kamers.filter((x) => x.id !== k.id);
    // Wat in deze kamer stond, gaat naar "nog in te delen".
    for (const [id, a] of Object.entries(next.apparaten)) if (a.kamer === k.id) delete next.apparaten[id];
    if (await bewaar(next, t('indeling.naamWeg', { naam: k.naam }))) kies({ kamer: null, blad: 'etage' });
  } else if (el.dataset.appBewaar) {
    const vak = el.closest('[data-blad]');
    const id = el.dataset.appBewaar;
    const dev = toestelVan(id);
    const kamer = vak.querySelector('[data-app-kamer]').value;
    if (!kamer) {
      zeg(t('indeling.eerstKamer'), true);
      return;
    }
    const naam = vak.querySelector('[data-app-naam]').value.trim();
    const next = concept();
    const gevel = vak.querySelector('[data-app-gevel]')?.value || null;
    next.apparaten[id] = { ...(naam && naam !== (dev.haNaam ?? dev.naam) ? { naam } : {}), kamer, zone: vak.querySelector('[data-app-zone]').value || null, ...(gevel ? { gevel } : {}) };
    next.verborgen = (next.verborgen ?? []).filter((x) => x !== id);
    // Uit de lijst van Nog in te delen of Verborgen: daar blijven, met het volgende apparaat.
    const inLijst = ['los', 'verborgen'].includes(deelSoort(keuze.deel));
    if (await bewaar(next, t('indeling.bewaard', { naam: naam || dev.naam }))) kies(inLijst ? { apparaat: null } : { kamer, apparaat: null, blad: 'kamer', etage: next.kamers.find((x) => x.id === kamer)?.etage ?? keuze.etage });
  } else if (el.dataset.verberg) {
    const next = concept();
    const dev = toestelVan(el.dataset.verberg);
    next.verborgen = [...new Set([...(next.verborgen ?? []), el.dataset.verberg])];
    delete next.apparaten[el.dataset.verberg];
    const inLijst = ['los', 'verborgen'].includes(deelSoort(keuze.deel));
    if (await bewaar(next, t('indeling.isVerborgen', { naam: dev?.naam ?? t('indeling.hetApparaat') }))) kies(inLijst ? { apparaat: null, blad: 'apparaat' } : { apparaat: null, blad: keuze.kamer ? 'kamer' : 'etage' });
  } else if (el.dataset.etageVast) {
    await etageErbij(el.dataset.etageVast, null, null);
  } else if (el.dataset.etageEigen) {
    const naam = el.closest('[data-blad]').querySelector('[data-nieuwe-etage]')?.value.trim() ?? '';
    if (!naam) return zeg(t('indeling.etageEerstNaam'), true);
    const bezet = new Set([...volgordeVan(concept()), 'buiten', ...DEEL_VAST, ...(info.standaard ?? []).map((s) => s.id)]);
    await etageErbij(idVan(naam, bezet), naam, el.dataset.etageEigen);
  } else if (el.dataset.etageSchuif) {
    const next = concept();
    const v = volgordeVan(next);
    const i = v.indexOf(keuze.etage);
    const j = i + Number(el.dataset.etageSchuif);
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    next.volgorde = v;
    await bewaar(next, t(Number(el.dataset.etageSchuif) < 0 ? 'indeling.etageHoger' : 'indeling.etageLager', { naam: etageNaam(next, keuze.etage) }));
  } else if (el.hasAttribute('data-etage-weg')) {
    const next = concept();
    const naam = etageNaam(next, keuze.etage);
    next.volgorde = volgordeVan(next).filter((x) => x !== keuze.etage);
    delete next.etages[keuze.etage];
    if (next.dak === keuze.etage) delete next.dak;
    if (await bewaar(next, t('indeling.naamWeg', { naam }))) kies({ etage: next.volgorde[next.volgorde.length - 1] ?? 'bg', blad: 'etage' });
  } else if (el.dataset.dak) {
    // Welke etage onder het schuine dak ligt (besluit 111).
    const next = concept();
    if (el.dataset.dak === 'true') next.dak = keuze.etage;
    else if (huisData?.dakEtage === keuze.etage || next.dak === keuze.etage) next.dak = 'geen';
    else return;
    await bewaar(next, el.dataset.dak === 'true' ? t('indeling.onderDak', { naam: etageNaam(next, keuze.etage) }) : t('indeling.geenDak'));
  } else if (el.dataset.meten) {
    // Meten met (besluit 123): een sensor aan of uit voor deze kamer.
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    const lijst = new Set(k.meten ?? []);
    if (lijst.has(el.dataset.meten)) lijst.delete(el.dataset.meten);
    else lijst.add(el.dataset.meten);
    if (lijst.size) k.meten = [...lijst].slice(0, 6);
    else delete k.meten;
    await bewaar(next, t('indeling.metenBewaard'));
  } else if (el.dataset.buiten) {
    // Wat een buitenruimte is (besluit 109).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    const b = { soort: 'tuin', auto: false, tuinhuis: false, ...buitenNu(k) };
    b[el.dataset.buiten] = el.dataset.waarde === 'true';
    k.buiten = { soort: b.soort, auto: !!b.auto, tuinhuis: !!b.tuinhuis };
    // Ook bij wat er rond het huis is (besluit 193): anders liet de tekening de auto weg.
    if (next.rond && el.dataset.buiten === 'auto') next.rond = { ...next.rond, oprit: true, auto: !!b.auto };
    await bewaar(next, t('indeling.bewaard', { naam: k.naam }));
  } else if (el.dataset.rond) {
    // Wat er rond het huis is (besluiten 158 en 193): elk deel apart aan of uit, net als bij Inrichten.
    const next = concept();
    const rond = { ...rondVan(next) };
    const w = el.dataset.rond;
    rond[w] = !rond[w];
    if (w === 'oprit' && !rond.oprit) {
      rond.auto = false;
      rond.carport = false;
    }
    next.rond = rond;
    await bewaar(next, t(rond[w] ? 'indeling.deel.rondAan' : 'indeling.deel.rondUit', { naam: el.getAttribute('aria-label') ?? w }));
  } else if (el.dataset.schuur) {
    const next = concept();
    next.rond = { ...rondVan(next), schuur: el.dataset.schuur === '1' };
    await bewaar(next, t('indeling.bewaard', { naam: t(next.rond.schuur ? 'inr.schuurtje' : 'inr.tuinhuis') }));
  } else if (el.hasAttribute('data-voorstellen')) {
    const next = concept();
    const lijst = (huisData?.zonderRuimte ?? []).filter((x) => x.voorstelKamer);
    for (const a of lijst) next.apparaten[a.id] = { ...(next.apparaten[a.id] ?? {}), kamer: a.voorstelKamer, zone: null };
    await bewaar(next, t('indeling.ingedeeld', { n: lijst.length }));
  }
});

async function kamerErbij(naam) {
  if (!naam) {
    zeg(t('indeling.kamerEerstNaam'), true);
    return;
  }
  const next = concept();
  const id = idVan(naam, new Set(next.kamers.map((x) => x.id)));
  next.kamers.push({ id, naam, etage: keuze.etage, zones: [], regelzone: null, haGebied: null });
  // Een garage of carport buiten: ook aan bij wat er rond het huis is (besluit 193).
  if (keuze.etage === 'buiten') next.rond = huismodel.rondMet(next.rond, huismodel.buitenUitNaam(naam));
  if (await bewaar(next, t('indeling.toegevoegd', { naam }))) kies({ kamer: id, blad: 'kamer' });
}

document.addEventListener('change', async (e) => {
  const el = e.target;
  await naBewaren();
  // Het apparaat van een bron: pas bewaard bij Toevoegen (besluit 132).
  if (el.hasAttribute('data-bron-apparaat') && bronVorm) {
    bronVorm.apparaat = el.value || null;
    return;
  }
  if (el.hasAttribute('data-bron-w') && bronVorm) {
    bronVorm.vermogenW = Number(el.value.replace(/\D/g, '')) || null;
    return;
  }
  if (el.dataset.rol) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    k.rollen = { ...rollenNu(k), [el.dataset.rol]: el.value };
    const naam = toestelNaam(el.dataset.rol);
    await bewaar(next, t(['houdt', 'zon'].includes(el.value) ? `indeling.rolGezet.${el.value}` : 'indeling.rolGezet.kijken', { naam }));
    return;
  }
  const next = concept();
  if (!next) return;
  const k = next.kamers.find((x) => x.id === keuze.kamer);
  const v = el.value.trim();
  if (el.dataset.actie === 'etagenaam') {
    const standaard = info.etages.find((x) => x.id === keuze.etage)?.standaardNaam;
    if (!v || v === standaard) delete next.etages[keuze.etage];
    else next.etages[keuze.etage] = v;
    await bewaar(next, t('indeling.etageNaamBewaard'));
  } else if (el.dataset.actie === 'kamernaam' && k) {
    if (!v) return;
    k.naam = v;
    await bewaar(next, t('indeling.naamBewaard'));
  } else if (el.dataset.actie === 'regeling' && k) {
    // Een eigen regeling, of meedoen met die van een andere kamer (besluit 142). Eerst
    // verhuisde "Geregeld als" de regeling van een andere kamer; nu deel je hem.
    const [soort, wie] = v.split(':');
    delete k.meedoenMet;
    k.regelzone = soort === 'zone' ? wie : null;
    if (soort === 'kamer') k.meedoenMet = wie;
    // Wie met deze kamer meedeed, en hij heeft geen regeling meer: niet meer meedoen.
    if (soort !== 'zone') for (const x of next.kamers) if (x.meedoenMet === k.id) delete x.meedoenMet;
    const doel = next.kamers.find((x) => x.id === wie);
    await bewaar(next, soort === 'kamer' && doel ? t('indeling.doetMeeMet', { naam: k.naam, met: doel.naam }) : t('indeling.regelingBewaard'));
  } else if (el.dataset.actie === 'meten-erbij' && k && v) {
    // Een sensor uit een andere kamer erbij (besluit 123).
    k.meten = [...new Set([...(k.meten ?? []), v])].slice(0, 6);
    await bewaar(next, t('indeling.metenBewaard'));
  } else if (el.dataset.actie === 'buitensoort' && k) {
    // Wat een buitenruimte is (besluit 167); leeg is weer het voorstel uit de naam.
    if (v) k.buiten = { soort: v, auto: v === 'oprit' || v === 'carport' ? (k.buiten?.auto ?? true) : false, tuinhuis: false };
    else delete k.buiten;
    // Een garage of carport: ook aan bij wat er rond het huis is, anders tekent Thuis hem niet (besluit 193).
    next.rond = huismodel.rondMet(next.rond, v || huismodel.buitenUitNaam(k.naam));
    await bewaar(next, t('indeling.bewaard', { naam: k.naam }));
  } else if (el.dataset.actie === 'soort' && k) {
    // Wat voor kamer (besluit 119); leeg is weer het voorstel uit de naam.
    if (v) k.soort = v;
    else delete k.soort;
    await bewaar(next, t('indeling.soortBewaard'));
  } else if (el.dataset.actie === 'kameretage' && k) {
    k.etage = v;
    if (v === 'buiten') next.rond = huismodel.rondMet(next.rond, huismodel.soortBuiten(k).soort);
    if (await bewaar(next, t('indeling.staatOp', { naam: k.naam, etage: etageNaam(next, v) }))) kies({ etage: v });
  } else if (el.dataset.actie === 'erbij' && k && v) {
    await plaats(v, k.id, null);
  } else if (el.hasAttribute('data-app-kamer')) {
    // De zones van de gekozen kamer.
    const vak = el.closest('[data-blad]');
    const kamer = next.kamers.find((x) => x.id === v);
    const zones = vak.querySelector('[data-zonevak]');
    zones.hidden = !(kamer?.zones ?? []).length;
    zones.querySelector('select').innerHTML = `<option value="">${esc(t('indeling.geenZone'))}</option>${(kamer?.zones ?? []).map((z) => `<option value="${esc(z.id)}">${esc(z.naam)}</option>`).join('')}`;
  } else if (el.dataset.zoneSoort && k) {
    // Wat voor deel van de kamer (besluit 145); leeg is weer het voorstel uit de naam.
    const z = k.zones.find((x) => x.id === el.dataset.zoneSoort);
    if (!z) return;
    if (v) z.soort = v;
    else delete z.soort;
    // Een tuinhuis in de tuin (besluit 193): ook aan bij wat er rond het huis is.
    if (k.etage === 'buiten' && v === 'tuinhuis') next.rond = huismodel.rondMet(next.rond, 'tuinhuis');
    await bewaar(next, t('indeling.zoneBewaard', { naam: z.naam }));
  } else if (el.dataset.zoneNaam && k && v) {
    const z = k.zones.find((x) => x.id === el.dataset.zoneNaam);
    if (!z || z.naam === v) return;
    z.naam = v;
    await bewaar(next, t('indeling.zoneHeet', { naam: v }));
  } else if (el.hasAttribute('data-nieuwe-zone') && k && v) {
    k.zones.push({ id: idVan(v, new Set(k.zones.map((z) => z.id))), naam: v });
    if (k.etage === 'buiten' && huismodel.buitenZoneUitNaam(v) === 'tuinhuis') next.rond = huismodel.rondMet(next.rond, 'tuinhuis');
    await bewaar(next, t('indeling.zoneErbij', { naam: v }));
  }
});

// Enter in "Nieuwe kamer" voegt hem toe.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-nieuwe-kamer]')) void kamerErbij(e.target.value.trim());
  // Een bronkaart opent met Enter of spatie, net als een knop.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-bron-open]')) {
    e.preventDefault();
    e.target.click();
  }
});

/* ------------------------------------------------------------ slepen */

/*
 * Een apparaat slepen naar een kamer in het huis, of naar een kamer in het
 * blad. Boven een etage blijven hangen, wisselt de etage. Tikken zonder te
 * slepen opent het apparaat, met de kamer om te kiezen.
 */
let sleep = null;
document.addEventListener('pointerdown', (e) => {
  const bron = e.target.closest('[data-app]');
  if (!bron || e.button !== 0) return;
  sleep = { bron, id: bron.dataset.app, naam: bron.dataset.naam ?? '', x: e.clientX, y: e.clientY, kaart: null, etageTimer: null, etageOnder: null };
});
document.addEventListener('pointermove', (e) => {
  if (!sleep) return;
  if (!sleep.kaart) {
    if (Math.hypot(e.clientX - sleep.x, e.clientY - sleep.y) < 8) return;
    sleep.kaart = document.createElement('div');
    sleep.kaart.className = 'sleep';
    sleep.kaart.setAttribute('aria-hidden', 'true');
    sleep.kaart.innerHTML = `<i></i>${esc(sleep.naam)}`;
    document.body.append(sleep.kaart);
    sleep.bron.classList.add('sleept');
  }
  e.preventDefault();
  sleep.kaart.style.left = `${e.clientX}px`;
  sleep.kaart.style.top = `${e.clientY}px`;
  const onder = document.elementFromPoint(e.clientX, e.clientY);
  const kamer = onder?.closest('.sc-tik[data-kamer], .kamerrij[data-kamer]')?.dataset.kamer ?? null;
  const doel = kamer === '__nieuw' ? null : kamer;
  if (doel !== sleepDoel) {
    sleepDoel = doel;
    const d = concept();
    if (d) tekenPodium(d);
  }
  // Boven een andere etage in de lijst blijven hangen: die etage tonen (besluit 193).
  const regel = onder?.closest('[data-delen] .deel');
  const id = regel ? decodeURIComponent((regel.getAttribute('href') ?? '').slice(1)) : null;
  const etage = id && info?.etages.some((x) => x.id === id) ? id : null;
  if (etage !== sleep.etageOnder) {
    sleep.etageOnder = etage;
    clearTimeout(sleep.etageTimer);
    $$('.deel.doel').forEach((x) => x.classList.remove('doel'));
    if (etage && etage !== keuze.deel) {
      regel.classList.add('doel');
      sleep.etageTimer = setTimeout(() => {
        history.replaceState(null, '', opAdres(etage));
        teken();
      }, 600);
    }
  }
});
function eindeSleep() {
  if (!sleep) return null;
  const s = sleep;
  sleep = null;
  clearTimeout(s.etageTimer);
  s.kaart?.remove();
  s.bron.classList.remove('sleept');
  const doel = sleepDoel;
  sleepDoel = null;
  return s.kaart ? { id: s.id, doel } : null;
}
document.addEventListener('pointerup', async () => {
  const uit = eindeSleep();
  if (!uit) return;
  // Na slepen geen tik.
  netGesleept = true;
  setTimeout(() => (netGesleept = false), 0);
  teken();
  if (!uit.doel) return;
  await naBewaren();
  const k = concept()?.kamers.find((x) => x.id === uit.doel);
  // Na het neerzetten de kamer tonen, met het apparaat erin.
  if ((await plaats(uit.id, uit.doel, null)) && k) kies({ etage: alleBuitenEtage(k) && keuze.etage === 'buiten' ? 'buiten' : k.etage, kamer: k.id, blad: 'kamer', apparaat: null });
});
document.addEventListener('pointercancel', () => {
  eindeSleep();
  teken();
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
void laadAlles();
// Een ander deel, of een kamer in het adres (`indeling.html#tuin`), ook als de pagina al open staat.
addEventListener('hashchange', teken);
// Wat er nieuw is in Home Assistant, af en toe opnieuw; niet onder de vinger.
setInterval(async () => {
  if (sleep || document.activeElement?.matches('input, select')) return;
  await laadHuis();
  teken();
}, 60_000);
