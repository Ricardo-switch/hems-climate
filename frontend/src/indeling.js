/*
 * Kamers en indeling, in ontwerp 2 (besluit 104; schets Wand-Indeling). Links
 * de etages, in het midden die etage zonder dak, rechts een blad met wat je
 * koos, onderin wat nog nergens staat. Een apparaat sleep je naar een kamer, of
 * je tikt erop en kiest de kamer.
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
const cvThermo = () => huismodel.cvThermostaat(huisData, verwarming);
let huisData = null;
let zon = null;
let state = null;
/** Wat er gekozen is: een etage, en daarin een kamer of een apparaat, of een ander blad. */
const keuze = { etage: null, kamer: null, apparaat: null, blad: 'etage' };
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
  if (a.status === 'fulfilled') verwarming = a.value?.antwoorden?.verwarming ?? null;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (s.status === 'fulfilled') state = s.value;
  if (!keuze.etage) beginKeuze();
  teken();
}

async function laadHuis() {
  try {
    huisData = await haal('api/huis');
  } catch {
    // De laatste stand blijft.
  }
}

/** Waar de pagina begint: de kamer uit het adres, of de begane grond. */
function beginKeuze() {
  const d = concept();
  if (!d) return;
  const [wie, tab] = decodeURIComponent(location.hash.slice(1)).split('/');
  const kamer = d.kamers.find((k) => k.id === wie);
  if (tab === 'warmte') keuze.tab = 'warmte';
  keuze.etage = kamer?.etage ?? (d.kamers.some((k) => k.etage === 'bg') ? 'bg' : (d.kamers[0]?.etage ?? 'bg'));
  if (kamer) Object.assign(keuze, { kamer: kamer.id, blad: 'kamer' });
}

/* ------------------------------------------------------------ de indeling */

/** De indeling om te bewerken: de eigen, of anders het voorstel uit Home Assistant. */
function concept() {
  const basis = info?.indeling ?? info?.voorstel;
  return basis ? JSON.parse(JSON.stringify(basis)) : null;
}

/** Bewaren, met wat er gebeurde als melding; de vorige indeling gaat op de stapel voor "Ongedaan maken". */
async function bewaar(next, gedaan) {
  const nu = info?.indeling ?? info?.voorstel;
  const uit = await stuur(next);
  if (uit && nu) vorige.push(JSON.parse(JSON.stringify(nu)));
  if (uit) zeg(gedaan);
  teken();
  return uit;
}

async function ongedaan() {
  const terug = vorige.pop();
  if (!terug) return;
  if (await stuur(terug)) zeg('Teruggezet.');
  else vorige.push(terug);
  teken();
}

async function stuur(next) {
  try {
    const res = await deur('api/indeling', next);
    if (res === null) return false;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      zeg(res.status === 403 ? 'Alleen de beheerder mag de indeling veranderen.' : (body.fout ?? 'Niet bewaard.'), true);
      return false;
    }
    info = { ...info, indeling: body };
    // De etages kunnen veranderd zijn (besluit 112): de lijst opnieuw ophalen.
    const [vers] = await Promise.allSettled([haal('api/indeling'), laadHuis()]);
    if (vers.status === 'fulfilled') info = vers.value;
    return true;
  } catch {
    zeg('Niet bewaard: geen verbinding met Smart Climate.', true);
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
  const t = toestelVan(id);
  const next = concept();
  if (!next || !t) return false;
  next.apparaten[id] = { ...(next.apparaten[id] ?? {}), kamer, zone };
  next.verborgen = (next.verborgen ?? []).filter((x) => x !== id);
  const k = next.kamers.find((x) => x.id === kamer);
  return bewaar(next, `${t.naam} staat nu in ${k?.naam ?? 'de kamer'}.`);
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const d = concept();
  if (!d || !info) {
    $$('[data-blad]').forEach((el) => (el.innerHTML = '<p class="klein">Even laden… Zonder verbinding met Home Assistant kent de app de apparaten nog niet.</p>'));
    return;
  }
  tekenEtages(d);
  tekenPodium(d);
  // Niet opnieuw opbouwen terwijl iemand typt.
  for (const el of $$('[data-blad]')) if (!(el.contains(document.activeElement) && document.activeElement.matches('input'))) el.innerHTML = blad(d);
  $$('[data-bak]').forEach((el) => {
    el.innerHTML = bak();
    el.classList.toggle('leeg', !(huisData?.zonderRuimte ?? []).length);
  });
  $$('[data-ongedaan]').forEach((b) => (b.disabled = vorige.length === 0));
  if (melding) zeg(melding, meldingFout);
  else zeg(huisData?.indeling === 'voorstel' ? 'Dit komt uit Home Assistant. Je eerste wijziging legt het vast.' : 'Verandert niets in Home Assistant');
}

function tekenEtages(d) {
  $$('[data-etages]').forEach((el) => {
    // Op de telefoon staan ze naast elkaar: dan van beneden naar boven (besluit 131).
    el.innerHTML = (el.closest('#tel') ? huismodel.etagesNaast(info.etages) : info.etages)
      .map(({ id }) => {
        const kamers = d.kamers.filter((k) => k.etage === id);
        const n = kamers.reduce((t, k) => t + apparatenIn(k.id).length, 0);
        const wat = kamers.length ? `${kamers.length === 1 ? '1 kamer' : `${kamers.length} kamers`}, ${n === 1 ? '1 apparaat' : `${n} apparaten`}` : 'nog leeg';
        return `<button type="button" class="etage" data-etage="${esc(id)}" aria-pressed="${id === keuze.etage && keuze.blad !== 'nieuweEtage'}"><b>${esc(etageNaam(d, id))}</b><span>${wat}</span></button>`;
      })
      .join('') + `<button type="button" class="etage nieuw" data-etage-erbij aria-pressed="${keuze.blad === 'nieuweEtage'}">+ Etage toevoegen</button>`;
  });
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
    <div class="bladkop"><h2 class="kop-2">Etage toevoegen</h2></div>
    ${vast.length ? `<div><span class="label">Een van de vaste etages</span><div class="chips">${vast.map((s) => `<button type="button" class="chip" data-etage-vast="${esc(s.id)}">${esc(s.naam)}</button>`).join('')}</div></div>` : ''}
    <div><label class="label" for="nieuweetage">Of een eigen naam</label><input class="veld" id="nieuweetage" data-nieuwe-etage placeholder="Bijvoorbeeld Vliering" maxlength="40"></div>
    <div class="rijknoppen"><button type="button" class="knop" data-etage-eigen="boven">Bovenaan</button><button type="button" class="knop" data-etage-eigen="onder">Onderaan</button></div>
    <p class="mini" style="margin: 0">De volgorde zet je daarna bij de etage zelf, met hoger en lager.</p>`;
}

async function etageErbij(id, naam, waar) {
  const next = concept();
  const volgorde = volgordeVan(next);
  next.volgorde = waar === 'boven' ? [id, ...volgorde] : waar === 'onder' ? [...volgorde, id] : opZijnPlek(volgorde, id);
  if (naam) next.etages[id] = naam;
  if (await bewaar(next, `${naam || etageNaam(next, id)} toegevoegd.`)) kies({ etage: id, kamer: null, apparaat: null, blad: 'etage' });
}

function tekenPodium(d) {
  const alleBuiten = (k) => k.etage === 'buiten' || huismodel.isBuiten({ id: k.etage }, k);
  const ruimte = (k) => ruimteVan(k.id) ?? { id: k.id, naam: k.naam, apparaten: [], zones: k.zones };
  // Buiten tekent de begane grond met de oprit en de tuin eromheen, zoals de kamer dat doet.
  const etage = keuze.etage === 'buiten' ? (volgordeVan(d).includes('bg') ? 'bg' : volgordeVan(d).filter((x) => x !== 'kelder').at(-1) ?? 'bg') : keuze.etage;
  const binnen = d.kamers.filter((k) => k.etage === etage && !alleBuiten(k));
  // Buiten toont de begane grond met wat eromheen ligt; de begane grond zelf, ingezoomd, zonder.
  const metBuiten = keuze.etage === 'buiten';
  const buitenDelen = metBuiten ? huismodel.buiten(d.kamers.filter(alleBuiten).map(ruimte)) : {};
  for (const b of Object.values(buitenDelen)) if (b) b.gekozen = b.id === keuze.kamer || b.id === sleepDoel;
  // Bij het indelen alleen de naam en de temperatuur: geen zin over wat de kamer doet.
  const kamers = binnen.map((k) => ({ ...huismodel.kamerModel(ruimte(k), state), zin: null, stand: null, naam: k.naam, zones: k.zones.length > 1 ? k.zones.map((z) => z.naam) : undefined, gekozen: k.id === keuze.kamer && k.id !== sleepDoel, doel: k.id === sleepDoel }));
  kamers.push({ id: '__nieuw', naam: 'Kamer toevoegen', gewicht: 0.7, nieuw: true });
  const model = {
    beschrijving: `${etageNaam(d, keuze.etage)} om in te delen, zonder dak. Tik op een kamer om hem te kiezen; sleep een apparaat erheen om het te verplaatsen.`,
    tijd: 'dag',
    zonderDak: true,
    etages: [{ naam: etageNaam(d, etage), kamers }],
    ...Object.fromEntries(Object.entries(buitenDelen).filter(([, v]) => v)),
  };
  const breed = Object.values(buitenDelen).some(Boolean);
  if (!app.telStand()) huis.teken(document.getElementById('podium-wand'), model, { breedte: 580, hoogte: 560, marge: 0.02, zoom: breed ? 1.12 : 1.05, schuifX: breed ? 30 : 10, schuifY: breed ? -20 : 0, tik: true });
  else huis.teken(document.getElementById('podium-tel'), model, { breedte: 390, hoogte: 260, marge: 0.03, zoom: breed ? 1.1 : 1, tik: true });
}

/* ------------------------------------------------------------ het blad */

function blad(d) {
  const k = d.kamers.find((x) => x.id === keuze.kamer);
  if (keuze.blad === 'apparaat' && keuze.apparaat) return apparaatBlad(d, toestelVan(keuze.apparaat));
  if (keuze.blad === 'verbergen' && keuze.apparaat) return verbergBlad(toestelVan(keuze.apparaat));
  if (keuze.blad === 'verborgen') return verborgenBlad(d);
  if (keuze.blad === 'weghalen' && k) return weghaalBlad(k);
  if (keuze.blad === 'kamer' && k) return keuze.tab === 'warmte' && !alleBuitenEtage(k) ? warmteBlad(d, k) : kamerBlad(d, k);
  if (keuze.blad === 'nieuweEtage') return nieuweEtageBlad(d);
  return etageBlad(d);
}

function etageBlad(d) {
  const id = keuze.etage;
  const standaard = info.etages.find((e) => e.id === id)?.standaardNaam ?? id;
  const kamers = d.kamers.filter((k) => k.etage === id);
  return `
    <div class="bladkop"><h2 class="kop-2">${esc(etageNaam(d, id))}</h2><span class="mini">etage</span></div>
    <div><label class="label" for="etagenaam-${id}">Naam van de etage</label><input class="veld" id="etagenaam-${id}" data-actie="etagenaam" value="${esc(d.etages[id] ?? '')}" placeholder="${esc(standaard)}" maxlength="40"></div>
    ${id === 'buiten' ? '' : `<div><span class="label">Onder het schuine dak?</span><div class="chips" role="group" aria-label="Onder het schuine dak">${[[true, 'Ja'], [false, 'Nee']].map(([w, t]) => `<button type="button" class="chip" data-dak="${w}" aria-pressed="${(huisData?.dakEtage === id) === w}">${t}</button>`).join('')}</div></div>`}
    <div><span class="label">Kamers</span>${kamers.length ? kamers.map((k) => `<button type="button" class="kamerrij" data-kamer="${esc(k.id)}">${esc(k.naam)}<span>${apparatenIn(k.id).length} ›</span></button>`).join('') : '<p class="klein" style="margin: 0">Nog geen kamers op deze etage.</p>'}</div>
    <div><label class="label" for="nieuwekamer-${id}">Nieuwe kamer</label><div style="display: flex; gap: 8px"><input class="veld" id="nieuwekamer-${id}" data-nieuwe-kamer placeholder="Bijvoorbeeld Hal en trap" maxlength="40"><button type="button" class="knop" data-kamer-toevoegen>Toevoegen</button></div></div>
    <p class="mini" style="margin: 0">Een deur ertussen maakt een eigen kamer. Open, zoals keuken en zithoek, maak je een zone in dezelfde kamer.</p>
    ${id === 'buiten' ? '' : etageSchuiven(d, id, kamers.length)}`;
}

/** Hoger, lager, of weg als hij leeg is (besluit 112). Buiten blijft altijd. */
function etageSchuiven(d, id, kamers) {
  const v = volgordeVan(d);
  const i = v.indexOf(id);
  return `<div class="rijknoppen">
    <button type="button" class="knop" data-etage-schuif="-1" ${i <= 0 ? 'disabled' : ''}>Hoger</button>
    <button type="button" class="knop" data-etage-schuif="1" ${i === -1 || i >= v.length - 1 ? 'disabled' : ''}>Lager</button>
    ${kamers === 0 && v.length > 1 ? '<button type="button" class="knop gevaar" data-etage-weg>Etage weghalen</button>' : ''}
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
  const regel = [['', 'Niet geregeld'], ...vrij.map((z) => [`zone:${z.id}`, z.id === k.regelzone ? 'Eigen regeling' : `Geregeld als ${z.naam}`]), ...andere.map((x) => [`kamer:${x.id}`, `Doet mee met ${x.naam}`])];
  const regelNu = k.meedoenMet ? `kamer:${k.meedoenMet}` : k.regelzone ? `zone:${k.regelzone}` : '';
  return `<div><label class="label" for="regel-${esc(k.id)}">Regeling</label><select class="veld" id="regel-${esc(k.id)}" data-actie="regeling">${regel.map(([v, t]) => `<option value="${esc(v)}" ${v === regelNu ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
}

function kamerBlad(d, k) {
  const etages = info.etages.map((e) => [e.id, etageNaam(d, e.id)]);
  const zoneNaam = (z) => k.zones.find((x) => x.id === z)?.naam;
  const apps = apparatenIn(k.id);
  const erbij = [...(huisData?.zonderRuimte ?? []).map((x) => [x.id, `${x.naam} (nog in te delen)`]), ...(huisData?.verborgen ?? []).map((x) => [x.id, `${x.naam} (verborgen)`])];
  const opties = (lijst, waarde) => lijst.map(([v, t]) => `<option value="${esc(v)}" ${v === waarde ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `
    <button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, k.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)}</h2><span class="mini">gekozen</span></div>
    ${kamerTabs(k)}
    <div><label class="label" for="kamernaam-${esc(k.id)}">Naam</label><input class="veld" id="kamernaam-${esc(k.id)}" data-actie="kamernaam" value="${esc(k.naam)}" maxlength="40"></div>
    ${buitenKeuze(k)}
    ${soortKeuze(k)}
    ${zonesKeuze(k)}
    <div>
      <span class="label">${apps.length ? 'Apparaten, sleep om te verplaatsen' : 'Apparaten'}</span>
      ${apps.length ? apps.map((a) => `<button type="button" class="app" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}"><span class="greep" aria-hidden="true">⋮⋮</span><span class="l"><b>${esc(a.naam)}</b><span>${esc(zoneNaam(a.zone) ?? soortTekst(a))}</span></span></button>`).join('') : '<p class="klein" style="margin: 0">Nog niets in deze kamer. Sleep een apparaat van onderen hierheen, of kies er een.</p>'}
    </div>
    ${erbij.length ? `<div><label class="label" for="erbij-${esc(k.id)}">Apparaat toevoegen</label><select class="veld" id="erbij-${esc(k.id)}" data-actie="erbij"><option value="">Kies een apparaat…</option>${opties(erbij, '')}</select></div>` : ''}
    <div><label class="label" for="etage-${esc(k.id)}">Etage</label><select class="veld" id="etage-${esc(k.id)}" data-actie="kameretage">${opties(etages, k.etage)}</select></div>
    ${plekKeuze(d, k)}
    <button type="button" class="knop gevaar" data-naar-weghalen style="margin-top: auto">Kamer weghalen</button>`;
}

/* ------------------------------------------------- verwarmen en koelen (besluit 132) */

/*
 * Per kamer wat er warmt en koelt (schets Wand-Indeling-Warmte). Wat Home
 * Assistant al weet, staat er als "gevonden": een airco, een radiatorknop, een
 * thermostaat. Wat de bewoner toevoegt, gaat met de indeling mee. Een
 * elektrische bron die slim aangaat, krijgt een vermogen en mag op zon; wat
 * met de hand gaat, krijgt een idee in plaats van een tekort.
 */
const BRON_KEUZE = [['radiator', 'Radiator'], ['vloer', 'Vloerverwarming'], ['paneel', 'Infraroodpaneel'], ['kachel', 'Elektrische kachel'], ['airco', 'Airco']];
const AAN_KEUZE = [['thermostaat', 'Met een thermostaat'], ['knop', 'Met een slimme radiatorknop'], ['stekker', 'Met een slimme stekker of module'], ['hand', 'Met de hand']];
/** Het formulier van een bron, of null. */
let bronVorm = null;

function kamerTabs(k) {
  if (alleBuitenEtage(k)) return '';
  const tab = keuze.tab === 'warmte' ? 'warmte' : 'kamer';
  return `<div class="kamertabs" role="tablist" aria-label="Kamer"><button type="button" role="tab" data-kamertab="kamer" aria-selected="${tab === 'kamer'}">Kamer</button><button type="button" role="tab" data-kamertab="warmte" aria-selected="${tab === 'warmte'}">Verwarmen en koelen</button></div>`;
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
const ROL_KEUZE = [
  ['houdt', 'Houdt op temperatuur', 'Warmt of koelt tot het doel bij Comfort, ook van het net.'],
  ['zon', 'Helpt op zon', 'Springt bij als er eigen zon over is. Van het net alleen als Comfort dat zegt.'],
  ['kijken', 'Alleen kijken', 'Het huis volgt hem, maar regelt hem niet.'],
];
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
  return `<div class="rolrij"><label for="${esc(id)}">De regeling</label><select class="veld rolkeuze" id="${esc(id)}" data-rol="${esc(sleutel)}">${ROL_KEUZE.map(([w, t]) => `<option value="${w}" ${w === rol ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>${rol === 'zon' ? '<p class="rolzin">Op eigen zon springt hij bij. Van het net alleen als Comfort dat zegt.</p>' : ''}`;
}
function rolKeuzes(gekozen) {
  return `<div class="keuzes" role="radiogroup" aria-label="Wat de regeling ermee doet">${ROL_KEUZE.map(([w, t, u]) => `<button type="button" class="keuze${w === gekozen ? ' aan' : ''}" role="radio" aria-checked="${w === gekozen}" data-bron-rol="${w}"><i></i><span><b>${esc(t)}</b><span>${esc(u)}</span></span></button>`).join('')}</div>`;
}

function bronKaart(kop, wat, ikoon, koel, rechts, regels = '', attrs = '') {
  return `<div class="bron"${attrs}><div class="boven"><span class="ikoon${koel ? ' koel' : ''}">${ikoon}</span><div><b>${esc(kop)}</b><span class="wat">${esc(wat)}</span></div>${rechts}</div>${regels}</div>`;
}

function warmteBlad(d, k) {
  const kop = `<button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, k.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)}</h2><span class="mini">${ruimteVan(k.id)?.temperatuurC != null ? `${nl(ruimteVan(k.id).temperatuurC)}°` : 'geen meter'}</span></div>
    ${kamerTabs(k)}`;
  if (bronVorm) return kop + bronFormulier(k);
  const r = ruimteVan(k.id);
  // Meten met en de regeling staan hier, bij verwarmen en koelen (besluit 167); eerst bij Kamer.
  const meetRij = `${metenKeuze(k)}${regelingKeuze(d, k)}`;

  const bronnen = k.bronnen ?? [];
  const vast = new Set(bronnen.map((b) => b.apparaat).filter(Boolean));
  const gevonden = (r?.apparaten ?? []).filter((a) => a.soort === 'klimaat' && !vast.has(a.actuatorId ?? a.id));
  const slim = '<span class="stand slim">Slim</span>';
  const kaarten = [];
  for (const a of gevonden) {
    const sleutel = a.actuatorId ?? a.id;
    const via = `<div class="regelt">via <b>${esc(a.naam)}</b>${a.klimaat?.filter?.pct != null ? `<span class="mini">filter ${a.klimaat.filter.pct}%</span>` : ''}${a.radiatorknop?.klepPct != null ? `<span class="mini">klep ${a.radiatorknop.klepPct}%</span>` : ''}</div>`;
    const rol = rolRegel(k, sleutel);
    if (a.klimaat?.kanKoelen) kaarten.push(bronKaart('Airco', [a.klimaat.kanVerwarmen ? 'koelt, verwarmt' : 'koelt', a.klimaat.kanDrogen ? 'droogt' : null].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' en $1'), ICOON_KOEL, true, slim, via + rol));
    else if (a.radiatorknop) kaarten.push(bronKaart('Radiator met een slimme knop', 'op de cv', ICOON_RADIATOR, false, slim, via + rol));
    // De thermostaat van de ketel (besluit 167): de radiatoren gaan mee; wat eraan hangt, vraagt hij niet.
    else if (cvThermo()?.sleutel === sleutel) kaarten.push(bronKaart('Thermostaat van de cv-ketel', 'zet de ketel aan; de radiatoren gaan mee', ICOON_THERMO, false, slim, via + rol));
    else kaarten.push(bronKaart('Thermostaat', 'gevonden in Home Assistant', ICOON_THERMO, false, slim, `${via}${rol}<button type="button" class="vraagknop" data-bron-nieuw="${esc(sleutel)}">Wat hangt eraan?</button>`));
  }
  for (const b of bronnen) {
    const elektrisch = b.soorten.some((x) => huismodel.ELEKTRISCH.has(x));
    const wat = b.aan === 'hand' ? 'gaat aan met de hand' : [elektrisch ? 'elektrisch' : b.soorten.includes('airco') ? null : 'op de cv', b.soorten.length > 1 ? 'gaan samen aan' : null].filter(Boolean).join(', ') || AAN_KEUZE.find(([v]) => v === b.aan)?.[1].toLowerCase();
    const rechts = b.aan === 'hand' ? '<span class="stand hand">Met de hand</span>' : b.vermogenW ? `<span class="w">${b.vermogenW} W</span>` : slim;
    const ikoon = b.soorten.includes('airco') ? ICOON_KOEL : b.soorten.includes('radiator') ? ICOON_RADIATOR : ICOON_WARM;
    let regels = '';
    if (b.apparaat) regels += `<div class="regelt">via <b>${esc(toestelNaam(b.apparaat))}</b>${b.aan !== 'hand' && b.vermogenW ? slim : ''}</div>`;
    if (b.apparaat && klimaatToestellen().some((x) => x.sleutel === b.apparaat && x.kamer.id === k.id)) regels += rolRegel(k, b.apparaat);
    // Op zon (besluit 132): alleen elektrisch, met vermogen, en een apparaat van de regeling in deze kamer.
    const vanRegeling = !!b.apparaat && !!r?.zoneId && (r?.apparaten ?? []).some((a) => a.soort === 'klimaat' && a.actuatorId === b.apparaat);
    if (huismodel.isElektrischSlim(b) && b.vermogenW && vanRegeling) regels += `<div class="opzon">Mag opwarmen op zon<button type="button" class="schakel" role="switch" aria-checked="${!!b.opZon}" aria-label="Mag opwarmen op zon" data-bron-zon="${esc(b.id)}"></button></div>`;
    if (b.aan === 'hand' && elektrisch) regels += '<div class="idee"><b>Idee: maak hem slim</b>Met een slimme stekker of een module achter de schakelaar kan hij opwarmen op zon. Dan hoort hij bij de regeling.</div>';
    kaarten.push(bronKaart(huismodel.bronNaam(b), wat, ikoon, b.soorten.includes('airco'), rechts, regels, ` data-bron-open="${esc(b.id)}" role="button" tabindex="0"`));
  }
  const leeg = !kaarten.length ? '<p class="klein" style="margin: 0">Nog niets. Hangt er een radiator, vloerverwarming, een paneel of een airco? Voeg het toe; met de hand is ook goed.</p>' : '';
  const doetMee = Object.values(rollenNu(k)).some((x) => x !== 'kijken');
  // Meedoen met een andere kamer (besluit 142): dat zegt de kaart, in plaats van "doet nog niet mee".
  const met = k.meedoenMet ? concept()?.kamers.find((x) => x.id === k.meedoenMet) : null;
  const nietMee = met
    ? `<div class="uitleg"><b>Doet mee met ${esc(met.naam)}.</b>De regeling daar houdt deze kamer mee op temperatuur. Een thermometer hier telt mee.</div>`
    : kaarten.length && !doetMee ? '<div class="uitleg"><b>Deze kamer doet nog niet mee in de regeling.</b>Kies bij een apparaat Houdt op temperatuur of Helpt op zon, of laat hem meedoen met een andere kamer.</div>' : '';
  return `${kop}${meetRij}${kaarten.join('')}${leeg}${nietMee}
    <button type="button" class="plus" data-bron-nieuw="">+ Iets toevoegen</button>
    <p class="mini" style="margin: 0">Het huis rekent elektrische warmte mee voor je zekering, en ziet zo waarom een kamer opwarmt.</p>`;
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
    ? [['thermostaat', ketel ? `Met de thermostaat van de cv (${ketel.naam})` : 'Met de thermostaat van de cv'], ...(v.soorten.has('radiator') ? [['knop', 'Met een slimme radiatorknop']] : []), ['hand', 'Met de hand']]
    : AAN_KEUZE.filter(([w]) => w !== 'knop');
  const toestellen = klimaatToestellen();
  // Een radiatorknop kies je uit de knoppen; met de thermostaat van de ketel hoeft er niets gekozen.
  const kiesbaar = v.aan === 'knop' ? toestellen.filter((x) => x.a.radiatorknop) : toestellen;
  const welke = v.aan && v.aan !== 'hand' && !(cv && v.aan === 'thermostaat')
    ? `<div class="vraag"><label class="label" for="bron-apparaat">${v.aan === 'knop' ? 'Welke radiatorknop?' : 'Welk apparaat?'} Uit Home Assistant.</label><select class="veld" id="bron-apparaat" data-bron-apparaat><option value="">Kies…</option>${kiesbaar.map((x) => `<option value="${esc(x.sleutel)}" ${x.sleutel === v.apparaat ? 'selected' : ''}>${esc(x.a.naam)} (${esc(x.kamer.naam)})</option>`).join('')}</select></div>`
    : '';
  // Wat de regeling ermee doet, alleen voor een apparaat dat in deze kamer komt; de thermostaat van de ketel blijft waar hij hangt.
  const rol = v.apparaat && v.aan && v.aan !== 'hand' && v.apparaat !== ketel?.sleutel && toestellen.some((x) => x.sleutel === v.apparaat)
    ? `<div class="vraag"><span class="label">Wat doet de regeling ermee?</span>${rolKeuzes(v.rol ?? rolVoorstel(k, v.apparaat))}</div>`
    : '';
  const vermogen = elektrisch && v.aan && v.aan !== 'hand'
    ? `<div class="vraag"><label class="label" for="bron-w">${v.soorten.size > 1 ? 'Samen hoeveel' : 'Hoeveel'} vermogen? Het staat op het typeplaatje.</label><div class="invoer"><input id="bron-w" inputmode="numeric" data-bron-w value="${v.vermogenW ?? ''}" placeholder="bijvoorbeeld 800"><span>watt</span></div><span class="mini">Zo weet het huis wanneer er genoeg zon voor is.</span></div>`
    : '';
  return `<div class="bladkop" style="margin-top: 4px"><h3 class="kop-3" style="margin: 0">${v.id ? 'Aanpassen' : 'Iets toevoegen'}</h3></div>
    <div class="vraag"><span class="label">Wat hangt er? Kies er meer als ze samen aangaan.</span><div class="chips">${BRON_KEUZE.map(([w, t]) => chip('bron-soort', w, t, v.soorten.has(w))).join('')}</div></div>
    ${vloer ? `<div class="vraag"><span class="label">De vloerverwarming is</span><div class="chips">${chip('bron-vloer', 'water', 'Op water, van de cv', v.vloer !== 'elektrisch')}${chip('bron-vloer', 'elektrisch', 'Elektrisch', v.vloer === 'elektrisch')}</div></div>` : ''}
    ${v.soorten.size ? `<div class="vraag"><span class="label">Hoe gaat het aan?</span><div class="chips">${aanOpties.map(([w, t]) => chip('bron-aan', w, t, v.aan === w)).join('')}</div></div>` : ''}
    ${welke}
    ${vermogen}
    ${rol}
    <div class="knoppenrij" style="margin-top: auto">${v.id ? '<button type="button" class="knop gevaar" data-bron-weg>Weghalen</button>' : ''}<button type="button" class="knop" data-bron-annuleer>Annuleren</button><button type="button" class="knop knop-licht" data-bron-bewaar ${v.soorten.size && v.aan ? '' : 'disabled'}>${v.id ? 'Bewaren' : 'Toevoegen'}</button></div>`;
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

async function bronKlik(t) {
  const next = concept();
  const k = next?.kamers.find((x) => x.id === keuze.kamer);
  if (!k) return false;
  if (t.dataset.kamertab) {
    bronVorm = null;
    kies({ tab: t.dataset.kamertab });
  } else if (t.dataset.bronNieuw !== undefined) {
    const a = t.dataset.bronNieuw;
    bronVorm = { id: null, soorten: new Set(), vloer: 'elektrisch', aan: a ? 'thermostaat' : null, apparaat: a || null, vermogenW: null, rol: null };
    teken();
  } else if (t.dataset.bronOpen) {
    const b = (k.bronnen ?? []).find((x) => x.id === t.dataset.bronOpen);
    if (!b) return true;
    bronVorm = { id: b.id, soorten: new Set(b.soorten.map((x) => (x === 'vloer-elektrisch' ? 'vloer' : x))), vloer: b.soorten.includes('vloer-elektrisch') ? 'elektrisch' : 'water', aan: b.aan, apparaat: b.apparaat ?? null, vermogenW: b.vermogenW ?? null, opZon: !!b.opZon };
    teken();
  } else if (t.dataset.bronSoort) {
    const w = t.dataset.bronSoort;
    if (bronVorm.soorten.has(w)) bronVorm.soorten.delete(w);
    else bronVorm.soorten.add(w);
    if (bronVorm.aan === 'knop' && !bronVorm.soorten.has('radiator')) bronVorm.aan = null;
    teken();
  } else if (t.dataset.bronVloer) {
    bronVorm.vloer = t.dataset.bronVloer;
    teken();
  } else if (t.dataset.bronAan) {
    bronVorm.vermogenW = Number(document.querySelector(`${app.zicht()} [data-bron-w]`)?.value) || bronVorm.vermogenW;
    bronVorm.aan = t.dataset.bronAan;
    teken();
  } else if (t.dataset.bronRol) {
    bronVorm.vermogenW = Number(document.querySelector(`${app.zicht()} [data-bron-w]`)?.value) || bronVorm.vermogenW;
    bronVorm.rol = t.dataset.bronRol;
    teken();
  } else if (t.hasAttribute('data-bron-annuleer')) {
    bronVorm = null;
    teken();
  } else if (t.hasAttribute('data-bron-bewaar')) {
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
    if (await bewaar(next, `${naam} bewaard.`)) bronVorm = null;
    teken();
  } else if (t.hasAttribute('data-bron-weg')) {
    const id = bronVorm?.id;
    k.bronnen = (k.bronnen ?? []).filter((x) => x.id !== id);
    if (!k.bronnen.length) delete k.bronnen;
    if (await bewaar(next, 'Weggehaald.')) bronVorm = null;
    teken();
  } else if (t.dataset.bronZon) {
    const b = (k.bronnen ?? []).find((x) => x.id === t.dataset.bronZon);
    if (!b) return true;
    b.opZon = !b.opZon;
    if (!b.opZon) delete b.opZon;
    await bewaar(next, b.opZon ? 'Mag opwarmen op zon. Het huis rekent er meteen mee.' : 'Niet meer op zon.');
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
    return huismodel.isBuiten({ id: k.etage }, k) ? '<p class="mini" style="margin: 0">Dit klinkt als buiten. Zet hem onderaan op de etage Buiten; dan kies je wat het is.</p>' : '';
  }
  const b = buitenNu(k);
  const naam = (w) => BUITEN_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const voorstel = huismodel.buitenUitNaam(k.naam);
  const nu = k.buiten?.soort ?? '';
  const opties = [['', voorstel ? `Uit de naam: ${naam(voorstel)}` : 'Uit de naam: niets herkend'], ...BUITEN_SOORTEN];
  const auto = b.soort === 'oprit' || b.soort === 'carport'
    ? `<div><span class="label">In de tekening</span><div class="chips" role="group" aria-label="Wat erbij hoort"><button type="button" class="chip${b.auto ? '' : ' uitchip'}" data-buiten="auto" data-waarde="${!b.auto}" aria-pressed="${!!b.auto}">Auto op de oprit</button></div></div>`
    : '';
  return `<div><label class="label" for="buiten-${esc(k.id)}">Wat is het?</label><select class="veld" id="buiten-${esc(k.id)}" data-actie="buitensoort">${opties.map(([v, t]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>${auto}`;
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
  const graad = (c) => `${String(Math.round(c * 10) / 10).replace('.', ',')}°`;
  const chip = (b) => `<button type="button" class="chip${gekozen.has(b.id) ? '' : ' uitchip'}" data-meten="${esc(b.id)}" aria-pressed="${gekozen.has(b.id)}">${esc(b.naam)}${b.kamerId !== k.id ? ` (${esc(b.kamer)})` : ''} · ${graad(b.c)}</button>`;
  const uitleg = !gekozen.size
    ? k.regelzone ? 'Niets gekozen: de regeling meet zoals ingesteld.' : 'Niets gekozen: de app neemt een meter in de kamer.'
    : k.regelzone ? 'Het gemiddelde telt meteen voor de regeling.' : 'De temperatuur in de app is het gemiddelde.';
  return `<div><span class="label">Meten met</span>
    <div class="chips" role="group" aria-label="Meten met">${hier.length ? hier.map(chip).join('') : '<span class="mini">Geen thermometer in deze kamer.</span>'}</div>
    ${elders.length ? `<select class="veld" data-actie="meten-erbij" aria-label="Sensor uit een andere kamer" style="margin-top: 6px"><option value="">Sensor uit een andere kamer…</option>${elders.map((b) => `<option value="${esc(b.id)}">${esc(b.naam)} (${esc(b.kamer)}) · ${graad(b.c)}</option>`).join('')}</select>` : ''}
    <p class="mini" style="margin: 6px 0 0">${uitleg}</p></div>`;
}

function soortKeuze(k) {
  if (k.etage === 'buiten' || huismodel.isBuiten({ id: k.etage }, k)) return '';
  const r = ruimteVan(k.id);
  const voorstel = r && !r.soortGekozen ? r.soort : null;
  const naam = (w) => KAMER_SOORTEN.find(([x]) => x === w)?.[1] ?? '';
  const nu = k.soort ?? '';
  const icoon = huis.KAMER_ICOON?.[k.soort ?? voorstel ?? 'kamer'];
  const opties = [['', voorstel ? `Uit de naam: ${naam(voorstel)}` : 'Uit de naam: niets herkend'], ...KAMER_SOORTEN];
  return `<div><label class="label soortlabel" for="soort-${esc(k.id)}">${icoon ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icoon}</svg>` : ''}Soort kamer</label><select class="veld" id="soort-${esc(k.id)}" data-actie="soort">${opties.map(([v, t]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
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
  const pijl = (z, i, stap, teken, wat) => `<button type="button" class="knop klein-knop" data-zone-schuif="${stap}" data-zone="${esc(z.id)}" aria-label="Zone ${esc(z.naam)} ${wat}" ${i + stap < 0 || i + stap >= k.zones.length ? 'disabled' : ''}>${teken}</button>`;
  const rijen = k.zones.map((z, i) => {
    const voorstel = buiten ? huismodel.buitenZoneUitNaam(z.naam) : huis.soortVan?.(z.naam);
    const opties = [['', voorstel && naam(voorstel) ? `Uit de naam: ${naam(voorstel)}` : 'Uit de naam: niets herkend'], ...LIJST];
    return `<div class="zonerij${k.zones.length > 1 ? '' : ' enkel'}">
      <input class="veld" data-zone-naam="${esc(z.id)}" value="${esc(z.naam)}" maxlength="40" aria-label="Naam van zone ${esc(z.naam)}">
      <select class="veld" data-zone-soort="${esc(z.id)}" aria-label="Soort van zone ${esc(z.naam)}">${opties.map(([v, t]) => `<option value="${esc(v)}" ${v === (z.soort ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      ${k.zones.length > 1 ? pijl(z, i, -1, '‹', 'naar links') + pijl(z, i, 1, '›', 'naar rechts') : ''}
      <button type="button" class="knop klein-knop" data-zone-weg="${esc(z.id)}" aria-label="Zone ${esc(z.naam)} weghalen">×</button>
    </div>`;
  });
  return `<div><span class="label">Zones, voor als één kamer meer delen heeft, van links naar rechts</span>${rijen.join('')}<div class="chips"><input class="chip plus" data-nieuwe-zone placeholder="+ Zone" aria-label="Nieuwe zone" maxlength="40" style="width: 110px"></div></div>`;
}
/* De plek van een kamer op zijn etage, van links naar rechts zoals in de tekening. */
function plekKeuze(d, k) {
  const buren = d.kamers.filter((x) => x.etage === k.etage);
  if (buren.length < 2) return '';
  const i = buren.findIndex((x) => x.id === k.id);
  return `<div><span class="label">Plek op de etage: ${i + 1} van ${buren.length}, van links</span><div class="knoppenrij">
    <button type="button" class="knop" data-kamer-schuif="-1" ${i <= 0 ? 'disabled' : ''}>‹ Naar links</button>
    <button type="button" class="knop" data-kamer-schuif="1" ${i >= buren.length - 1 ? 'disabled' : ''}>Naar rechts ›</button>
  </div></div>`;
}

const SOORT = { licht: 'lamp', klimaat: 'klimaat', screen: 'screen', meter: 'meter', apparaat: 'apparaat', camera: 'camera' };
const soortTekst = (a) => (a.soort === 'meter' && a.meting?.beweging ? 'bewegingsmelder' : SOORT[a.soort] ?? a.soort);

function apparaatBlad(d, t) {
  if (!t) return etageBlad(d);
  const kamerId = t.kamer ?? t.voorstelKamer ?? keuze.kamer ?? '';
  const kamers = d.kamers.map((k) => `<option value="${esc(k.id)}" ${k.id === kamerId ? 'selected' : ''}>${esc(k.naam)} (${esc(etageNaam(d, k.etage))})</option>`).join('');
  const k = d.kamers.find((x) => x.id === kamerId);
  const zones = (k?.zones ?? []).map((z) => `<option value="${esc(z.id)}" ${z.id === t.zone ? 'selected' : ''}>${esc(z.naam)}</option>`).join('');
  const waar = t.waar === 'los' ? (t.voorstelKamer ? `Nog in te delen. Voorstel: ${esc(d.kamers.find((x) => x.id === t.voorstelKamer)?.naam ?? '')}.` : 'Nog in te delen.') : t.waar === 'verborgen' ? 'Verborgen.' : '';
  const ha = t.haNaam && t.haNaam !== t.naam ? `In Home Assistant: ${esc(t.haNaam)}.` : '';
  return `
    <button type="button" class="terug" data-terug-apparaat>‹ ${t.kamer ? esc(d.kamers.find((x) => x.id === t.kamer)?.naam ?? 'Terug') : 'Terug'}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(t.naam)}</h2><span class="mini">${esc(soortTekst(t))}</span></div>
    ${waar || ha ? `<p class="klein" style="margin: 0">${[waar, ha].filter(Boolean).join(' ')}</p>` : ''}
    <div><label class="label" for="appnaam">Naam, overal in de app en voor de assistent</label><input class="veld" id="appnaam" data-app-naam value="${esc(t.naam)}" placeholder="${esc(t.haNaam ?? t.naam)}" maxlength="60"></div>
    <div><label class="label" for="appkamer">Kamer</label><select class="veld" id="appkamer" data-app-kamer>${kamerId ? '' : '<option value="" selected>Kies een kamer…</option>'}${kamers}</select></div>
    <div data-zonevak ${zones ? '' : 'hidden'}><label class="label" for="appzone">Zone</label><select class="veld" id="appzone" data-app-zone><option value="">Geen zone</option>${zones}</select></div>
    ${gevelKeuze(t)}
    <div class="rijknoppen"><button type="button" class="knop knop-licht" data-app-bewaar="${esc(t.id)}">Bewaren</button>${t.waar === 'verborgen' ? '' : `<button type="button" class="knop" data-naar-verbergen>Verbergen…</button>`}</div>`;
}

/*
 * De gevel van een scherm (besluit 145): zo weet de app of de zon op dit scherm
 * staat. Zonder keuze een voorstel uit de naam; weet het huis het niet, dan
 * zegt de app niets over zon op het scherm.
 */
function gevelKeuze(t) {
  const gevels = zon?.gevels ?? [];
  if (t.soort !== 'screen' || !gevels.length) return '';
  const g = t.scherm?.gevel;
  const nu = g?.gekozen ? g.id : '';
  const opties = [['', g && !g.gekozen ? `Uit de naam: ${g.naam}` : 'Weet ik niet'], ...gevels.map((x) => [x.id, x.naam])];
  return `<div><label class="label" for="appgevel">Aan welke gevel hangt hij?</label><select class="veld" id="appgevel" data-app-gevel>${opties.map(([v, n]) => `<option value="${esc(v)}" ${v === nu ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><span class="mini">Zo weet de app wanneer de zon op dit ${t.scherm?.zonnescherm ? 'zonnescherm' : 'screen'} staat.</span></div>`;
}

function verbergBlad(t) {
  if (!t) return '';
  return `
    <button type="button" class="terug" data-terug-verbergen>‹ ${esc(t.naam)}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(t.naam)} verbergen?</h2></div>
    <p class="klein" style="margin: 0">Verborgen staat in geen kamer, telt nergens mee en gaat niet mee met "Alle lampen uit". Terughalen kan onderin, bij Verborgen. Wil je hem alleen ergens anders hebben, verplaats hem dan.</p>
    <div class="rijknoppen"><button type="button" class="knop gevaar" data-verberg="${esc(t.id)}">Ja, verbergen</button><button type="button" class="knop" data-terug-verbergen>Annuleren</button></div>`;
}

function verborgenBlad(d) {
  const weg = huisData?.verborgen ?? [];
  return `
    <button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, keuze.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">Verborgen</h2><span class="mini">${weg.length}</span></div>
    <p class="klein" style="margin: 0">Staat in geen kamer en telt nergens mee. Tik erop om het een plek te geven.</p>
    <div>${weg.length ? weg.map((a) => `<button type="button" class="app" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}"><span class="greep" aria-hidden="true">⋮⋮</span><span class="l"><b>${esc(a.naam)}</b><span>${esc(soortTekst(a))}</span></span></button>`).join('') : '<p class="klein" style="margin: 0">Niets verborgen.</p>'}</div>`;
}

function weghaalBlad(k) {
  const n = apparatenIn(k.id).length;
  return `
    <button type="button" class="terug" data-kamer="${esc(k.id)}">‹ ${esc(k.naam)}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)} weghalen?</h2></div>
    <p class="klein" style="margin: 0">${n ? `${n === 1 ? 'Het apparaat' : `De ${n} apparaten`} in deze kamer ${n === 1 ? 'gaat' : 'gaan'} naar "Nog in te delen".` : 'Er staat niets in deze kamer.'} Met "Ongedaan maken" komt alles terug.</p>
    <div class="rijknoppen"><button type="button" class="knop gevaar" data-kamer-weg="${esc(k.id)}">Ja, weghalen</button><button type="button" class="knop" data-kamer="${esc(k.id)}">Annuleren</button></div>`;
}

/* ------------------------------------------------------------ onderin */

function bak() {
  const los = huisData?.zonderRuimte ?? [];
  const weg = huisData?.verborgen ?? [];
  const voorstel = los.filter((x) => x.voorstelKamer);
  const verborgenChip = weg.length ? `<button type="button" class="chip" data-naar-verborgen>Verborgen (${weg.length})</button>` : '';
  if (!los.length) {
    return `<div class="uitleg"><b>Alles heeft een plek</b><div class="klein">Komt er iets nieuws bij in Home Assistant, dan staat het hier.</div></div><div class="chips">${verborgenChip}</div>`;
  }
  return `
    <span class="getal zon-t" style="font-size: 30px">${los.length}</span>
    <div class="uitleg"><b>Nog in te delen</b><div class="klein">Sleep het naar een kamer, of tik erop en kies de kamer.</div></div>
    <div class="chips">${voorstel.length > 1 ? `<button type="button" class="chip plus" data-voorstellen>Voorstellen overnemen (${voorstel.length})</button>` : ''}${los.map((a) => `<button type="button" class="chip zon" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}">${esc(a.naam)}</button>`).join('')}${verborgenChip}</div>`;
}

/* ------------------------------------------------------------ doen */

function kies(wat) {
  if ('kamer' in wat && wat.kamer !== keuze.kamer) bronVorm = null;
  Object.assign(keuze, wat);
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
  const t = e.target.closest('button, [data-kamer], [data-bron-open]');
  if (!t || t.disabled) return;
  const d = concept();
  if (!d) return;
  // Een knop in een bronkaart gaat voor de kaart zelf.
  if (t.matches('[data-bron-open]') && e.target.closest('button')) return;
  if (await bronKlik(t)) return;
  if (t.dataset.etage) kies({ etage: t.dataset.etage, kamer: null, apparaat: null, blad: 'etage' });
  else if (t.dataset.kamer) kiesKamer(t.dataset.kamer);
  else if (t.dataset.app) kies({ apparaat: t.dataset.app, blad: 'apparaat' });
  else if (t.hasAttribute('data-naar-etage')) kies({ kamer: null, apparaat: null, blad: 'etage' });
  else if (t.hasAttribute('data-naar-weghalen')) kies({ blad: 'weghalen' });
  else if (t.hasAttribute('data-naar-verborgen')) kies({ apparaat: null, blad: 'verborgen' });
  else if (t.hasAttribute('data-naar-verbergen')) kies({ blad: 'verbergen' });
  else if (t.hasAttribute('data-terug-verbergen')) kies({ blad: 'apparaat' });
  else if (t.hasAttribute('data-terug-apparaat')) kies({ apparaat: null, blad: keuze.kamer ? 'kamer' : 'etage' });
  else if (t.hasAttribute('data-ongedaan')) await ongedaan();
  else if (t.hasAttribute('data-kamer-toevoegen')) {
    const veld = t.parentElement.querySelector('[data-nieuwe-kamer]');
    await kamerErbij(veld?.value.trim() ?? '');
  } else if (t.dataset.zoneSchuif) {
    // Een zone een plek naar links of rechts in de kamer (besluit 145).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const i = k.zones.findIndex((x) => x.id === t.dataset.zone);
    const j = i + Number(t.dataset.zoneSchuif);
    if (i < 0 || j < 0 || j >= k.zones.length) return;
    const zones = [...k.zones];
    [zones[i], zones[j]] = [zones[j], zones[i]];
    k.zones = zones;
    await bewaar(next, `Zone ${zones[j].naam} naar ${j < i ? 'links' : 'rechts'}.`);
  } else if (t.dataset.kamerSchuif) {
    // Een kamer een plek naar links of rechts op zijn etage: wisselen met de buurkamer (besluit 145).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const buren = next.kamers.filter((x) => x.etage === k.etage);
    const buur = buren[buren.findIndex((x) => x.id === k.id) + Number(t.dataset.kamerSchuif)];
    if (!buur) return;
    const a = next.kamers.indexOf(k);
    const b = next.kamers.indexOf(buur);
    [next.kamers[a], next.kamers[b]] = [next.kamers[b], next.kamers[a]];
    await bewaar(next, `${k.naam} staat nu ${Number(t.dataset.kamerSchuif) < 0 ? 'links' : 'rechts'} van ${buur.naam}.`);
  } else if (t.dataset.zoneWeg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    const z = k.zones.find((x) => x.id === t.dataset.zoneWeg);
    k.zones = k.zones.filter((x) => x.id !== z.id);
    for (const a of Object.values(next.apparaten)) if (a.kamer === k.id && a.zone === z.id) a.zone = null;
    await bewaar(next, `Zone ${z.naam} weggehaald.`);
  } else if (t.dataset.kamerWeg) {
    const next = concept();
    const k = next.kamers.find((x) => x.id === t.dataset.kamerWeg);
    next.kamers = next.kamers.filter((x) => x.id !== k.id);
    // Wat in deze kamer stond, gaat naar "nog in te delen".
    for (const [id, a] of Object.entries(next.apparaten)) if (a.kamer === k.id) delete next.apparaten[id];
    if (await bewaar(next, `${k.naam} weggehaald.`)) kies({ kamer: null, blad: 'etage' });
  } else if (t.dataset.appBewaar) {
    const vak = t.closest('[data-blad]');
    const id = t.dataset.appBewaar;
    const dev = toestelVan(id);
    const kamer = vak.querySelector('[data-app-kamer]').value;
    if (!kamer) {
      zeg('Kies eerst een kamer.', true);
      return;
    }
    const naam = vak.querySelector('[data-app-naam]').value.trim();
    const next = concept();
    const gevel = vak.querySelector('[data-app-gevel]')?.value || null;
    next.apparaten[id] = { ...(naam && naam !== (dev.haNaam ?? dev.naam) ? { naam } : {}), kamer, zone: vak.querySelector('[data-app-zone]').value || null, ...(gevel ? { gevel } : {}) };
    next.verborgen = (next.verborgen ?? []).filter((x) => x !== id);
    if (await bewaar(next, `${naam || dev.naam} bewaard.`)) kies({ kamer, apparaat: null, blad: 'kamer', etage: next.kamers.find((x) => x.id === kamer)?.etage ?? keuze.etage });
  } else if (t.dataset.verberg) {
    const next = concept();
    const dev = toestelVan(t.dataset.verberg);
    next.verborgen = [...new Set([...(next.verborgen ?? []), t.dataset.verberg])];
    delete next.apparaten[t.dataset.verberg];
    if (await bewaar(next, `${dev?.naam ?? 'Het apparaat'} is verborgen.`)) kies({ apparaat: null, blad: keuze.kamer ? 'kamer' : 'etage' });
  } else if (t.hasAttribute('data-etage-erbij')) {
    kies({ kamer: null, apparaat: null, blad: 'nieuweEtage' });
  } else if (t.dataset.etageVast) {
    await etageErbij(t.dataset.etageVast, null, null);
  } else if (t.dataset.etageEigen) {
    const naam = t.closest('[data-blad]').querySelector('[data-nieuwe-etage]')?.value.trim() ?? '';
    if (!naam) return zeg('Geef de etage eerst een naam.', true);
    const bezet = new Set([...volgordeVan(concept()), 'buiten', ...(info.standaard ?? []).map((s) => s.id)]);
    await etageErbij(idVan(naam, bezet), naam, t.dataset.etageEigen);
  } else if (t.dataset.etageSchuif) {
    const next = concept();
    const v = volgordeVan(next);
    const i = v.indexOf(keuze.etage);
    const j = i + Number(t.dataset.etageSchuif);
    if (i < 0 || j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    next.volgorde = v;
    await bewaar(next, `${etageNaam(next, keuze.etage)} ${Number(t.dataset.etageSchuif) < 0 ? 'hoger' : 'lager'} gezet.`);
  } else if (t.hasAttribute('data-etage-weg')) {
    const next = concept();
    const naam = etageNaam(next, keuze.etage);
    next.volgorde = volgordeVan(next).filter((x) => x !== keuze.etage);
    delete next.etages[keuze.etage];
    if (next.dak === keuze.etage) delete next.dak;
    if (await bewaar(next, `${naam} weggehaald.`)) kies({ etage: next.volgorde[next.volgorde.length - 1] ?? 'bg', blad: 'etage' });
  } else if (t.dataset.dak) {
    // Welke etage onder het schuine dak ligt (besluit 111).
    const next = concept();
    if (t.dataset.dak === 'true') next.dak = keuze.etage;
    else if (huisData?.dakEtage === keuze.etage || next.dak === keuze.etage) next.dak = 'geen';
    else return;
    await bewaar(next, t.dataset.dak === 'true' ? `${etageNaam(next, keuze.etage)} ligt onder het dak.` : 'Geen schuin dak boven deze etage.');
  } else if (t.dataset.meten) {
    // Meten met (besluit 123): een sensor aan of uit voor deze kamer.
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    const lijst = new Set(k.meten ?? []);
    if (lijst.has(t.dataset.meten)) lijst.delete(t.dataset.meten);
    else lijst.add(t.dataset.meten);
    if (lijst.size) k.meten = [...lijst].slice(0, 6);
    else delete k.meten;
    await bewaar(next, 'Meten met bewaard.');
  } else if (t.dataset.buiten) {
    // Wat een buitenruimte is (besluit 109).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    const b = { soort: 'tuin', auto: false, tuinhuis: false, ...buitenNu(k) };
    b[t.dataset.buiten] = t.dataset.waarde === 'true';
    k.buiten = { soort: b.soort, auto: !!b.auto, tuinhuis: !!b.tuinhuis };

    await bewaar(next, `${k.naam} bewaard.`);
  } else if (t.hasAttribute('data-voorstellen')) {
    const next = concept();
    const lijst = (huisData?.zonderRuimte ?? []).filter((x) => x.voorstelKamer);
    for (const a of lijst) next.apparaten[a.id] = { ...(next.apparaten[a.id] ?? {}), kamer: a.voorstelKamer, zone: null };
    await bewaar(next, `${lijst.length} apparaten ingedeeld.`);
  }
});

async function kamerErbij(naam) {
  if (!naam) {
    zeg('Geef de kamer eerst een naam.', true);
    return;
  }
  const next = concept();
  const id = idVan(naam, new Set(next.kamers.map((x) => x.id)));
  next.kamers.push({ id, naam, etage: keuze.etage, zones: [], regelzone: null, haGebied: null });
  if (await bewaar(next, `${naam} toegevoegd.`)) kies({ kamer: id, blad: 'kamer' });
}

document.addEventListener('change', async (e) => {
  const t = e.target;
  // Het apparaat van een bron: pas bewaard bij Toevoegen (besluit 132).
  if (t.hasAttribute('data-bron-apparaat') && bronVorm) {
    bronVorm.apparaat = t.value || null;
    return;
  }
  if (t.hasAttribute('data-bron-w') && bronVorm) {
    bronVorm.vermogenW = Number(t.value.replace(/\D/g, '')) || null;
    return;
  }
  if (t.dataset.rol) {
    const next = concept();
    const k = next?.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    k.rollen = { ...rollenNu(k), [t.dataset.rol]: t.value };
    const naam = toestelNaam(t.dataset.rol);
    await bewaar(next, t.value === 'houdt' ? `${naam} houdt de kamer op temperatuur.` : t.value === 'zon' ? `${naam} helpt op zon.` : `${naam} kijkt alleen mee.`);
    return;
  }
  const next = concept();
  if (!next) return;
  const k = next.kamers.find((x) => x.id === keuze.kamer);
  const v = t.value.trim();
  if (t.dataset.actie === 'etagenaam') {
    const standaard = info.etages.find((x) => x.id === keuze.etage)?.standaardNaam;
    if (!v || v === standaard) delete next.etages[keuze.etage];
    else next.etages[keuze.etage] = v;
    await bewaar(next, 'Naam van de etage bewaard.');
  } else if (t.dataset.actie === 'kamernaam' && k) {
    if (!v) return;
    k.naam = v;
    await bewaar(next, 'Naam bewaard.');
  } else if (t.dataset.actie === 'regeling' && k) {
    // Een eigen regeling, of meedoen met die van een andere kamer (besluit 142). Eerst
    // verhuisde "Geregeld als" de regeling van een andere kamer; nu deel je hem.
    const [soort, wie] = v.split(':');
    delete k.meedoenMet;
    k.regelzone = soort === 'zone' ? wie : null;
    if (soort === 'kamer') k.meedoenMet = wie;
    // Wie met deze kamer meedeed, en hij heeft geen regeling meer: niet meer meedoen.
    if (soort !== 'zone') for (const x of next.kamers) if (x.meedoenMet === k.id) delete x.meedoenMet;
    const doel = next.kamers.find((x) => x.id === wie);
    await bewaar(next, soort === 'kamer' && doel ? `${k.naam} doet mee met ${doel.naam}.` : 'Regeling bewaard.');
  } else if (t.dataset.actie === 'meten-erbij' && k && v) {
    // Een sensor uit een andere kamer erbij (besluit 123).
    k.meten = [...new Set([...(k.meten ?? []), v])].slice(0, 6);
    await bewaar(next, 'Meten met bewaard.');
  } else if (t.dataset.actie === 'buitensoort' && k) {
    // Wat een buitenruimte is (besluit 167); leeg is weer het voorstel uit de naam.
    if (v) k.buiten = { soort: v, auto: v === 'oprit' || v === 'carport' ? (k.buiten?.auto ?? true) : false, tuinhuis: false };
    else delete k.buiten;
    await bewaar(next, `${k.naam} bewaard.`);
  } else if (t.dataset.actie === 'soort' && k) {
    // Wat voor kamer (besluit 119); leeg is weer het voorstel uit de naam.
    if (v) k.soort = v;
    else delete k.soort;
    await bewaar(next, 'Soort bewaard.');
  } else if (t.dataset.actie === 'kameretage' && k) {
    k.etage = v;
    if (await bewaar(next, `${k.naam} staat nu op ${etageNaam(next, v)}.`)) kies({ etage: v });
  } else if (t.dataset.actie === 'erbij' && k && v) {
    await plaats(v, k.id, null);
  } else if (t.hasAttribute('data-app-kamer')) {
    // De zones van de gekozen kamer.
    const vak = t.closest('[data-blad]');
    const kamer = next.kamers.find((x) => x.id === v);
    const zones = vak.querySelector('[data-zonevak]');
    zones.hidden = !(kamer?.zones ?? []).length;
    zones.querySelector('select').innerHTML = `<option value="">Geen zone</option>${(kamer?.zones ?? []).map((z) => `<option value="${esc(z.id)}">${esc(z.naam)}</option>`).join('')}`;
  } else if (t.dataset.zoneSoort && k) {
    // Wat voor deel van de kamer (besluit 145); leeg is weer het voorstel uit de naam.
    const z = k.zones.find((x) => x.id === t.dataset.zoneSoort);
    if (!z) return;
    if (v) z.soort = v;
    else delete z.soort;
    await bewaar(next, `Zone ${z.naam} bewaard.`);
  } else if (t.dataset.zoneNaam && k && v) {
    const z = k.zones.find((x) => x.id === t.dataset.zoneNaam);
    if (!z || z.naam === v) return;
    z.naam = v;
    await bewaar(next, `Zone heet nu ${v}.`);
  } else if (t.hasAttribute('data-nieuwe-zone') && k && v) {
    k.zones.push({ id: idVan(v, new Set(k.zones.map((z) => z.id))), naam: v });
    await bewaar(next, `Zone ${v} toegevoegd.`);
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
  // Boven een andere etage blijven hangen: die etage tonen.
  const etage = onder?.closest('[data-etage]')?.dataset.etage ?? null;
  if (etage !== sleep.etageOnder) {
    sleep.etageOnder = etage;
    clearTimeout(sleep.etageTimer);
    $$('.etage.doel').forEach((x) => x.classList.remove('doel'));
    if (etage && etage !== keuze.etage) {
      onder.closest('[data-etage]').classList.add('doel');
      sleep.etageTimer = setTimeout(() => {
        keuze.etage = etage;
        const d = concept();
        if (d) {
          tekenEtages(d);
          tekenPodium(d);
        }
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
// Een kamer in het adres (`indeling.html#tuin`), ook als de pagina al open staat.
addEventListener('hashchange', () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id && info) kiesKamer(id);
});
// Wat er nieuw is in Home Assistant, af en toe opnieuw; niet onder de vinger.
setInterval(async () => {
  if (sleep || document.activeElement?.matches('input, select')) return;
  await laadHuis();
  teken();
}, 60_000);
