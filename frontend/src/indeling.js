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

const { $$, esc, haal, deur } = app;

let info = null;
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
  const [i, h, z, s] = await Promise.allSettled([haal('api/indeling'), haal('api/huis'), haal('api/zon'), haal('api/state')]);
  if (i.status === 'fulfilled') info = i.value;
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
  const wie = decodeURIComponent(location.hash.slice(1));
  const kamer = d.kamers.find((k) => k.id === wie);
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
    el.innerHTML = info.etages
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
  if (keuze.blad === 'kamer' && k) return kamerBlad(d, k);
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

function kamerBlad(d, k) {
  const regel = [['', 'Niet geregeld'], ...info.regelzones.map((z) => [z.id, `Geregeld als ${z.naam}`])];
  const etages = info.etages.map((e) => [e.id, etageNaam(d, e.id)]);
  const zoneNaam = (z) => k.zones.find((x) => x.id === z)?.naam;
  const apps = apparatenIn(k.id);
  const erbij = [...(huisData?.zonderRuimte ?? []).map((x) => [x.id, `${x.naam} (nog in te delen)`]), ...(huisData?.verborgen ?? []).map((x) => [x.id, `${x.naam} (verborgen)`])];
  const opties = (lijst, waarde) => lijst.map(([v, t]) => `<option value="${esc(v)}" ${v === waarde ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `
    <button type="button" class="terug" data-naar-etage>‹ ${esc(etageNaam(d, k.etage))}</button>
    <div class="bladkop"><h2 class="kop-2">${esc(k.naam)}</h2><span class="mini">gekozen</span></div>
    <div><label class="label" for="kamernaam-${esc(k.id)}">Naam</label><input class="veld" id="kamernaam-${esc(k.id)}" data-actie="kamernaam" value="${esc(k.naam)}" maxlength="40"></div>
    ${buitenKeuze(k)}
    ${k.etage === 'buiten' ? '' : `<div><label class="label" for="regel-${esc(k.id)}">Regeling</label><select class="veld" id="regel-${esc(k.id)}" data-actie="regeling">${opties(regel, k.regelzone ?? '')}</select></div>`}
    <div><span class="label">Zones, voor als één kamer twee delen heeft</span><div class="chips">${k.zones.map((z) => `<button type="button" class="chip" data-zone-weg="${esc(z.id)}" aria-label="Zone ${esc(z.naam)} weghalen">${esc(z.naam)}<span class="weg" aria-hidden="true">×</span></button>`).join('')}<input class="chip plus" data-nieuwe-zone placeholder="+ Zone" aria-label="Nieuwe zone" maxlength="40" style="width: 110px"></div></div>
    <div>
      <span class="label">${apps.length ? 'Apparaten, sleep om te verplaatsen' : 'Apparaten'}</span>
      ${apps.length ? apps.map((a) => `<button type="button" class="app" data-app="${esc(a.id)}" data-naam="${esc(a.naam)}"><span class="greep" aria-hidden="true">⋮⋮</span><span class="l"><b>${esc(a.naam)}</b><span>${esc(zoneNaam(a.zone) ?? soortTekst(a))}</span></span></button>`).join('') : '<p class="klein" style="margin: 0">Nog niets in deze kamer. Sleep een apparaat van onderen hierheen, of kies er een.</p>'}
    </div>
    ${erbij.length ? `<div><label class="label" for="erbij-${esc(k.id)}">Apparaat toevoegen</label><select class="veld" id="erbij-${esc(k.id)}" data-actie="erbij"><option value="">Kies een apparaat…</option>${opties(erbij, '')}</select></div>` : ''}
    <div><label class="label" for="etage-${esc(k.id)}">Etage</label><select class="veld" id="etage-${esc(k.id)}" data-actie="kameretage">${opties(etages, k.etage)}</select></div>
    <button type="button" class="knop gevaar" data-naar-weghalen style="margin-top: auto">Kamer weghalen</button>`;
}

/*
 * Een buitenruimte (besluit 109): wat het is, en wat erbij hoort in de
 * tekening. Alleen op de etage Buiten; staat hij nog op een etage binnen, dan
 * zegt het blad hoe hij daar komt.
 */
const BUITEN_SOORTEN = [['oprit', 'Oprit'], ['tuin', 'Tuin'], ['voortuin', 'Voortuin'], ['terras', 'Terras'], ['balkon', 'Balkon']];
function buitenNu(k) {
  return k.buiten ?? ruimteVan(k.id)?.buiten ?? huismodel.soortBuiten(k);
}
function buitenKeuze(k) {
  if (k.etage !== 'buiten') {
    return huismodel.isBuiten({ id: k.etage }, k) ? '<p class="mini" style="margin: 0">Dit klinkt als buiten. Zet hem onderaan op de etage Buiten; dan kies je wat het is.</p>' : '';
  }
  const b = buitenNu(k);
  const knop = (sleutel, w, t, aan) => `<button type="button" class="chip${aan ? '' : ' uitchip'}" data-buiten="${sleutel}" data-waarde="${esc(String(w))}" aria-pressed="${aan}">${esc(t)}</button>`;
  return `<div><span class="label">Wat is het?</span><div class="chips" role="group" aria-label="Soort buitenruimte">${BUITEN_SOORTEN.map(([w, t]) => knop('soort', w, t, b.soort === w)).join('')}</div></div>
    <div><span class="label">In de tekening</span><div class="chips" role="group" aria-label="Wat erbij hoort">${b.soort === 'oprit' ? knop('auto', !b.auto, 'Auto op de oprit', b.auto) : b.soort === 'tuin' ? knop('tuinhuis', !b.tuinhuis, 'Tuinhuis of schuur', b.tuinhuis) : '<span class="mini">Niets om te kiezen.</span>'}</div></div>`;
}

const SOORT = { licht: 'lamp', klimaat: 'klimaat', screen: 'screen', meter: 'meter', apparaat: 'apparaat', camera: 'camera' };
const soortTekst = (a) => SOORT[a.soort] ?? a.soort;

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
    <div class="rijknoppen"><button type="button" class="knop knop-licht" data-app-bewaar="${esc(t.id)}">Bewaren</button>${t.waar === 'verborgen' ? '' : `<button type="button" class="knop" data-naar-verbergen>Verbergen…</button>`}</div>`;
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
  const t = e.target.closest('button, [data-kamer]');
  if (!t || t.disabled) return;
  const d = concept();
  if (!d) return;
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
    next.apparaten[id] = { ...(naam && naam !== (dev.haNaam ?? dev.naam) ? { naam } : {}), kamer, zone: vak.querySelector('[data-app-zone]').value || null };
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
  } else if (t.dataset.buiten) {
    // Wat een buitenruimte is (besluit 109).
    const next = concept();
    const k = next.kamers.find((x) => x.id === keuze.kamer);
    if (!k) return;
    const b = { ...buitenNu(k) };
    if (t.dataset.buiten === 'soort') {
      b.soort = t.dataset.waarde;
      if (b.soort === 'oprit') b.tuinhuis = false;
      else b.auto = false;
    } else b[t.dataset.buiten] = t.dataset.waarde === 'true';
    k.buiten = b;
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
    // Elk regelgebied hoort bij hooguit één kamer.
    for (const x of next.kamers) if (v && x.regelzone === v) x.regelzone = null;
    k.regelzone = v || null;
    await bewaar(next, 'Regeling bewaard.');
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
  } else if (t.hasAttribute('data-nieuwe-zone') && k && v) {
    k.zones.push({ id: idVan(v, new Set(k.zones.map((z) => z.id))), naam: v });
    await bewaar(next, `Zone ${v} toegevoegd.`);
  }
});

// Enter in "Nieuwe kamer" voegt hem toe.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-nieuwe-kamer]')) void kamerErbij(e.target.value.trim());
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
