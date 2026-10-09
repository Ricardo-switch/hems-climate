/*
 * Meters en prijzen, in ontwerp 2 (besluiten 102, 104 en 110). Overnemen uit
 * het Energie-dashboard van Home Assistant, of zelf kiezen uit de meters die
 * Home Assistant bijhoudt, en de prijzen zoals ze op het contract staan:
 * normaal en dal, teruglevering nu en vanaf 2027, gas, en de vaste posten per
 * dag, maand of jaar. Opbrengst rekent ermee. Bewaren vraagt een beheerder.
 */
'use strict';

const { $$, esc, haal, deur } = app;

let info = null;
let concept = null;
let zon = null;
let melding = '';
let meldingFout = false;
/** Normaal en dal gekozen; los van de prijs, want die kan nog leeg zijn. */
let dubbel = false;

const leeg = () => ({ versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } });

/** Tarief 1 van een slimme meter is het daltarief (zelfde regel als de dienst, tarief.ts). */
const raadDal = (id) => /(?:tarief|tariff|tarif)[ _-]?1(?![0-9])|_t1(?![0-9a-z])|\blaag\b|\blow\b|dal[ _-]?tarief|(?:^|[^a-z])dal(?:[^a-z]|$)/i.test(id);

/** Vult aan wat een oudere instelling nog niet had, zodat het scherm één vorm kent. */
function aanvullen(c) {
  const p = c.prijzen;
  p.stroomDal ??= null;
  p.dalUren ??= 'nl';
  p.vanaf2027 ??= { vergoeding: null, kosten: null };
  p.vast ??= [];
  // De oude vaste kosten per maand worden een post.
  if (p.vastPerMaand != null && !p.vast.length) p.vast.push({ naam: 'Vaste kosten', bedrag: p.vastPerMaand, per: 'maand', soort: 'stroom' });
  p.vastPerMaand = null;
  c.net.dal ??= [...c.net.afname, ...c.net.teruglevering].filter(raadDal);
  return c;
}

async function laad() {
  const [e, z] = await Promise.allSettled([haal('api/energie'), haal('api/zon')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (e.status === 'fulfilled') {
    info = e.value;
    concept = aanvullen(JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel ?? leeg())));
    dubbel = concept.prijzen.stroomDal != null;
  } else {
    zeg('Niet beschikbaar: geen verbinding met Smart Climate, of Home Assistant is nog niet gelezen.', true);
  }
  teken();
}

function zeg(tekst, fout = false) {
  melding = tekst;
  meldingFout = fout;
  $$('[data-melding]').forEach((el) => {
    el.textContent = tekst;
    el.classList.toggle('fout', fout);
  });
}

const naamVan = (id) => info?.meters?.find((m) => m.id === id)?.naam ?? id;

function keuzes(label, sleutel, opties, huidig) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${JSON.stringify(w) === JSON.stringify(huidig)}">${esc(t)}</button>`).join('')}</div>`;
}

/** Een bedrag in euro, met zoveel decimalen als het contract geeft. */
function bedragVeld(label, pad, waarde, hint = '', min = '0') {
  return `<label class="veldnaam">${esc(label)}<input class="invoer" type="number" inputmode="decimal" step="any" ${min === '' ? '' : `min="${min}"`} data-prijs="${esc(pad)}" value="${waarde ?? ''}" placeholder="${esc(hint)}"></label>`;
}

/** Telt het net per tarief? Dan zegt de meter wat dal is. */
function perMeter() {
  const dal = new Set(concept.net.dal ?? []);
  return concept.net.afname.some((id) => dal.has(id)) && concept.net.afname.some((id) => !dal.has(id));
}

/* ------------------------------------------------------------ tekenen */

function uitHa() {
  const v = info.voorstel;
  if (!v) return `<section class="glas vraag"><h2 class="kop-3">Uit Home Assistant</h2><p class="uitleg">${esc(info.fout ?? 'Het Energie-dashboard van Home Assistant is niet ingericht. Kies je meters hieronder zelf.')}</p></section>`;
  const wat = [
    v.net.afname.length ? `${v.net.afname.length === 1 ? 'een meter' : `${v.net.afname.length} meters`} van het net` : null,
    v.net.teruglevering.length ? 'teruglevering' : null,
    v.zon.length ? 'zonnepanelen' : null,
    v.gas ? 'gas' : null,
    v.apparaten.length ? `${v.apparaten.length} apparaten` : null,
  ].filter(Boolean);
  return `<section class="glas vraag">
    <h2 class="kop-3">Uit Home Assistant</h2>
    <p class="uitleg">Je Energie-dashboard heeft ${esc(wat.join(', ') || 'nog niets')}. Overnemen zet de meters goed; de prijzen vul je hier in, zoals op je contract.</p>
    <button type="button" class="knop" data-overnemen style="align-self: start">Meters overnemen</button>
  </section>`;
}

function stroom() {
  const p = concept.prijzen;
  const dalTijden = !dubbel
    ? ''
    : perMeter()
      ? '<p class="mini">Je meter telt normaal en dal apart; dat gebruikt de app.</p>'
      : `<span class="veldnaam">Wanneer geldt het daltarief?</span>${keuzes('Daltarief', 'dalUren', [['nl', '23 tot 7 uur en weekend'], ['zuid', '21 tot 7 uur en weekend (Brabant, Limburg)']], p.dalUren)}`;
  return `<section class="glas vraag">
    <h2 class="kop-3">Stroom</h2>
    ${keuzes('Tarief', 'tarief', [['enkel', 'Eén tarief'], ['dubbel', 'Normaal en dal']], dubbel ? 'dubbel' : 'enkel')}
    <div class="${dubbel ? 'twee' : ''}">${bedragVeld(dubbel ? 'Normaal, € per kWh' : '€ per kWh', 'stroom', p.stroom, '0,27142')}${dubbel ? bedragVeld('Dal, € per kWh', 'stroomDal', p.stroomDal, '0,269') : ''}</div>
    <p class="mini">De totaalprijs, met energiebelasting en btw. Op je contract heet die vaak "Totaal elektriciteit".</p>
    ${dalTijden}
  </section>`;
}

function gas() {
  return `<section class="glas vraag">
    <h2 class="kop-3">Gas</h2>
    ${bedragVeld('€ per m³', 'gas', concept.prijzen.gas, '1,36568')}
    <p class="mini">Ook hier de totaalprijs, met belasting en btw.</p>
  </section>`;
}

function teruglevering() {
  const p = concept.prijzen;
  return `<section class="glas vraag">
    <h2 class="kop-3">Teruglevering</h2>
    <p class="uitleg">Tot 2027 wordt er gesaldeerd: wat je teruglevert, telt tegen je eigen stroomprijs.</p>
    ${bedragVeld('Vergoeding boven je verbruik, € per kWh', 'teruglevering', p.teruglevering, '0,15')}
    <p class="mini">Voor wat je over een heel jaar meer teruglevert dan je verbruikt.</p>
    <span class="veldnaam" style="margin-top: 4px">Vanaf 2027, als het salderen stopt</span>
    <div class="twee">${bedragVeld('Vergoeding, € per kWh', 'vanaf2027.vergoeding', p.vanaf2027.vergoeding, '0,06635')}${bedragVeld('Terugleverkosten, € per kWh', 'vanaf2027.kosten', p.vanaf2027.kosten, '0,06385')}</div>
  </section>`;
}

/** Vaste posten die bijna elk contract heeft, om met één tik toe te voegen. */
const VOORSTELLEN = [
  { naam: 'Vaste leveringskosten stroom', per: 'dag', soort: 'stroom' },
  { naam: 'Netbeheer stroom', per: 'dag', soort: 'stroom' },
  { naam: 'Vermindering energiebelasting', per: 'dag', soort: 'stroom' },
  { naam: 'Terugleverkosten', per: 'dag', soort: 'stroom' },
  { naam: 'Vaste leveringskosten gas', per: 'dag', soort: 'gas' },
  { naam: 'Netbeheer gas', per: 'dag', soort: 'gas' },
];

function vasteKosten() {
  const posten = concept.prijzen.vast;
  const opt = (lijst, huidig) => lijst.map(([w, t]) => `<option value="${w}" ${w === huidig ? 'selected' : ''}>${t}</option>`).join('');
  const rijen = posten
    .map(
      (v, i) => `<div class="vastrij">
        <input class="invoer" data-vast="naam" data-i="${i}" value="${esc(v.naam)}" maxlength="40" aria-label="Naam van de post">
        <div class="vastregel">
          <input class="invoer" type="number" inputmode="decimal" step="any" data-vast="bedrag" data-i="${i}" value="${v.bedrag ?? ''}" aria-label="Bedrag van ${esc(v.naam)} in euro">
          <select class="invoer" data-vast="per" data-i="${i}" aria-label="Per">${opt([['dag', 'per dag'], ['maand', 'per maand'], ['jaar', 'per jaar']], v.per)}</select>
          <select class="invoer" data-vast="soort" data-i="${i}" aria-label="Stroom of gas">${opt([['stroom', 'stroom'], ['gas', 'gas']], v.soort)}</select>
          <button type="button" class="knop" data-vast-weg="${i}" aria-label="${esc(v.naam)} weghalen">×</button>
        </div>
      </div>`,
    )
    .join('');
  const erbij = VOORSTELLEN.filter((x) => !posten.some((v) => v.naam.toLowerCase() === x.naam.toLowerCase()));
  return `<section class="glas vraag">
    <h2 class="kop-3">Vaste kosten</h2>
    ${rijen || '<p class="uitleg">Nog geen vaste posten.</p>'}
    <div class="meterchips">${erbij.map((x) => `<button type="button" data-vast-erbij="${esc(x.naam)}">+ ${esc(x.naam)}</button>`).join('')}<button type="button" data-vast-erbij="">+ Andere post</button></div>
    <p class="mini">Zoals op je contract: per dag, maand of jaar, met btw. Een aftrek, zoals de vermindering energiebelasting, telt de app als min.</p>
  </section>`;
}

/** Alles wat al een rol heeft, staat niet nog eens in een andere lijst. */
function inGebruik() {
  return new Set([...concept.net.afname, ...concept.net.teruglevering, ...concept.zon, ...(concept.gas ? [concept.gas] : []), ...concept.apparaten.map((a) => a.id)]);
}

/**
 * Een keuzelijst met eerst de meters die bij deze rol passen (de dienst raadt
 * de rol), en daaronder de andere van dezelfde soort, voor als het raden misgaat.
 */
function meterKeuze(label, plek, rol, soort, leegTekst = 'Meter erbij…') {
  const bezet = inGebruik();
  const vrij = (info.meters ?? []).filter((m) => m.soort === soort && !bezet.has(m.id));
  if (!vrij.length) return '';
  const past = vrij.filter((m) => m.rol === rol);
  const rest = vrij.filter((m) => m.rol !== rol);
  const opt = (m) => `<option value="${esc(m.id)}">${esc(m.naam)}</option>`;
  const lijst = past.length && rest.length ? `<optgroup label="Past hierbij">${past.map(opt).join('')}</optgroup><optgroup label="Andere meters">${rest.map(opt).join('')}</optgroup>` : vrij.map(opt).join('');
  return `<select class="invoer" aria-label="${esc(label)}" data-meer="${plek}"><option value="">${esc(leegTekst)}</option>${lijst}</select>`;
}

function rol(titel, plek, ids, rolNaam, soort, een = false) {
  // Bij normaal en dal: per meter van het net welk tarief hij telt.
  const tarief = (plek === 'afname' || plek === 'teruglevering') && dubbel;
  const dal = new Set(concept.net.dal ?? []);
  const chips = ids.length
    ? ids
        .map(
          (id) =>
            `<span class="meterchip"><button type="button" data-weg="${plek}" data-id="${esc(id)}" aria-label="${esc(naamVan(id))} weghalen">${esc(naamVan(id))}<span aria-hidden="true">×</span></button>${tarief ? `<button type="button" class="tariefknop" data-tarief="${esc(id)}" aria-label="Telt ${esc(naamVan(id))} dal of normaal?">${dal.has(id) ? 'dal' : 'normaal'}</button>` : ''}</span>`,
        )
        .join('')
    : '<span class="mini">geen</span>';
  return `<div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 0">
    <b style="font-size: 14px">${esc(titel)}</b>
    <div class="meterchips">${chips}</div>
    ${!een || !ids.length ? meterKeuze(`${titel}: meter erbij`, plek, rolNaam, soort) : ''}
  </div>`;
}

function meters() {
  const c = concept;
  return `<section class="glas vraag">
    <h2 class="kop-3">Meters</h2>
    ${rol('Stroom van het net', 'afname', c.net.afname, 'afname', 'energy')}
    ${rol('Teruglevering', 'teruglevering', c.net.teruglevering, 'teruglevering', 'energy')}
    ${rol('Zonnepanelen', 'zon', c.zon, 'zon', 'energy')}
    ${rol('Gas', 'gas', c.gas ? [c.gas] : [], 'gas', 'volume', true)}
    ${dubbel ? '<p class="mini">Tik op normaal of dal om te zeggen welk tarief een meter telt. Bij een slimme meter is tarief 1 het daltarief.</p>' : ''}
  </section>`;
}

function apparaten() {
  const rijen = concept.apparaten
    .map((a, i) => `<div class="regelrij"><div class="l"><input class="invoer" data-apparaatnaam="${i}" value="${esc(a.naam)}" maxlength="40" aria-label="Naam van ${esc(naamVan(a.id))}"><span>${esc(naamVan(a.id))}</span></div><button type="button" class="knop" data-apparaat-weg="${i}" aria-label="${esc(a.naam)} weghalen">Weg</button></div>`)
    .join('');
  return `<section class="glas vraag">
    <h2 class="kop-3">Apparaten met een eigen meter</h2>
    ${rijen || '<p class="uitleg">Nog geen. Een apparaat met een eigen meter staat in Opbrengst apart.</p>'}
    ${meterKeuze('Apparaat erbij', 'apparaat', 'apparaat', 'energy', 'Apparaat erbij…')}
  </section>`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  if (document.activeElement?.matches('input')) return;
  const kolommen = { 1: uitHa() + stroom() + gas(), 2: teruglevering() + vasteKosten(), 3: meters() + apparaten() };
  $$('[data-kolom]').forEach((el) => (el.innerHTML = kolommen[el.dataset.kolom]));
  if (melding) zeg(melding, meldingFout);
}

/* ------------------------------------------------------------ doen */

function zet(plek, ids) {
  if (plek === 'afname') concept.net.afname = ids;
  else if (plek === 'teruglevering') concept.net.teruglevering = ids;
  else if (plek === 'zon') concept.zon = ids;
  else if (plek === 'gas') concept.gas = ids[0] ?? null;
}
function lees(plek) {
  if (plek === 'afname') return concept.net.afname;
  if (plek === 'teruglevering') return concept.net.teruglevering;
  if (plek === 'zon') return concept.zon;
  return concept.gas ? [concept.gas] : [];
}
/** Het daltarief van de meters bijhouden: alleen meters die bij het net staan. */
function netDalBij() {
  const net = new Set([...concept.net.afname, ...concept.net.teruglevering]);
  concept.net.dal = (concept.net.dal ?? []).filter((id) => net.has(id));
}

const veranderd = () => zeg('Nog niet bewaard.');

document.addEventListener('click', async (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  const p = concept.prijzen;
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    if (knop.dataset.kies === 'tarief') {
      dubbel = w === 'dubbel';
      if (!dubbel) p.stroomDal = null;
    }
    else if (knop.dataset.kies === 'dalUren') p.dalUren = w;
    veranderd();
    teken();
  } else if (knop.dataset.weg) {
    zet(knop.dataset.weg, lees(knop.dataset.weg).filter((x) => x !== knop.dataset.id));
    netDalBij();
    veranderd();
    teken();
  } else if (knop.dataset.tarief) {
    const id = knop.dataset.tarief;
    const dal = new Set(concept.net.dal ?? []);
    if (dal.has(id)) dal.delete(id);
    else dal.add(id);
    concept.net.dal = [...dal];
    veranderd();
    teken();
  } else if (knop.dataset.apparaatWeg != null) {
    concept.apparaten.splice(Number(knop.dataset.apparaatWeg), 1);
    veranderd();
    teken();
  } else if (knop.dataset.vastWeg != null) {
    p.vast.splice(Number(knop.dataset.vastWeg), 1);
    veranderd();
    teken();
  } else if (knop.dataset.vastErbij != null) {
    const v = VOORSTELLEN.find((x) => x.naam === knop.dataset.vastErbij);
    p.vast.push({ naam: v?.naam ?? 'Vaste post', bedrag: null, per: v?.per ?? 'dag', soort: v?.soort ?? 'stroom' });
    veranderd();
    teken();
    // Meteen het bedrag invullen.
    requestAnimationFrame(() => document.querySelector(`${app.zicht()} [data-vast="bedrag"][data-i="${p.vast.length - 1}"]`)?.focus());
  } else if (knop.hasAttribute('data-overnemen')) {
    // De meters uit Home Assistant; de prijzen die je hier invulde blijven.
    const v = JSON.parse(JSON.stringify(info.voorstel));
    concept = aanvullen({ ...v, prijzen: { ...concept.prijzen, stroom: concept.prijzen.stroom ?? v.prijzen.stroom, gas: concept.prijzen.gas ?? v.prijzen.gas, teruglevering: concept.prijzen.teruglevering ?? v.prijzen.teruglevering } });
    zeg('Meters overgenomen. Kijk het na en bewaar.');
    teken();
  } else if (knop.hasAttribute('data-opslaan')) {
    await bewaar();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (!concept) return;
  const p = concept.prijzen;
  if (t.dataset.meer) {
    if (!t.value) return;
    if (t.dataset.meer === 'apparaat') concept.apparaten.push({ id: t.value, naam: naamVan(t.value).slice(0, 40) });
    else {
      zet(t.dataset.meer, [...lees(t.dataset.meer), t.value]);
      // Een nieuwe meter van het net: raden welk tarief hij telt.
      if ((t.dataset.meer === 'afname' || t.dataset.meer === 'teruglevering') && raadDal(t.value)) concept.net.dal = [...(concept.net.dal ?? []), t.value];
    }
    veranderd();
    teken();
  } else if (t.dataset.prijs) {
    const v = t.value === '' ? null : Number(t.value);
    const [a, b] = t.dataset.prijs.split('.');
    if (b) p[a][b] = v;
    else p[a] = v;
    veranderd();
  } else if (t.dataset.vast) {
    const post = p.vast[Number(t.dataset.i)];
    if (!post) return;
    const veld = t.dataset.vast;
    if (veld === 'bedrag') {
      let v = t.value === '' ? null : Number(t.value);
      // Een vermindering of korting is een aftrek, ook als hij zonder min is ingevuld.
      if (v != null && v > 0 && /vermindering|korting|teruggave/i.test(post.naam)) v = -v;
      post.bedrag = v;
      if (v != null && String(v) !== t.value) t.value = String(v);
    } else if (veld === 'naam') post.naam = t.value.trim() || post.naam;
    else post[veld] = t.value;
    veranderd();
  } else if (t.dataset.apparaatnaam != null) {
    const a = concept.apparaten[Number(t.dataset.apparaatnaam)];
    if (a) a.naam = t.value.trim() || a.naam;
    veranderd();
  }
});

async function bewaar() {
  document.activeElement?.blur?.();
  if (dubbel && concept.prijzen.stroomDal == null) return zeg('Vul het daltarief in, of kies één tarief.', true);
  const leegBedrag = concept.prijzen.vast.find((v) => v.bedrag == null);
  if (leegBedrag) return zeg(`Vul bij "${leegBedrag.naam}" een bedrag in, of haal de post weg.`, true);
  zeg('Even…');
  try {
    const res = await deur('api/energie', { ...concept, bron: concept.bron ?? 'zelf' });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return zeg('Alleen de beheerder kan dit bewaren.', true);
    if (!res.ok) return zeg(uit.fout ?? 'Niet bewaard.', true);
    info = { ...info, instellingen: uit };
    concept = aanvullen(JSON.parse(JSON.stringify(uit)));
    dubbel = concept.prijzen.stroomDal != null;
    zeg('Bewaard. Opbrengst rekent er nu mee.');
    teken();
  } catch {
    zeg('Niet bewaard: geen verbinding met Smart Climate.', true);
  }
}

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
void laad();
