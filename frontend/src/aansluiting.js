/*
 * Zon en aansluiting, in ontwerp 2 (besluiten 103 en 104; schets
 * Onboarding-Zon). Een paar vragen die de app niet uit Home Assistant haalt:
 * waar de panelen liggen, de hoofdzekering, het contract, en welke apparaten op
 * zon mogen starten. De pagina stuurt alleen antwoorden; welke meters erbij
 * horen, zoekt de dienst zelf. Opslaan vraagt een beheerder.
 */
'use strict';

const { $$, esc, haal, deur } = app;

let info = null;
let concept = null;
let zon = null;
let melding = '';
let meldingFout = false;

async function laad() {
  const [a, z] = await Promise.allSettled([haal('api/aansluiting'), haal('api/zon')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (a.status === 'fulfilled') {
    info = a.value;
    const x = info.antwoorden;
    concept = {
      panelen: { ligging: x?.panelen.ligging ?? null, aantal: x?.panelen.aantal ?? null, voorkant: x?.panelen.voorkant ?? null, achterkant: x?.panelen.achterkant ?? null },
      zekering: x?.zekering ?? null,
      tarief: x?.tarief ?? null,
      verwarming: { soort: x?.verwarming?.soort ?? null, aanvoerC: x?.verwarming?.aanvoerC ?? null },
      opZon: { ...(x?.opZon ?? {}) },
    };
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

/* ------------------------------------------------------------ tekenen */

const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Een rij keuzes waarvan er één aan staat; de waarde staat als JSON op de knop. */
function keuzes(label, sleutel, opties, huidig, uit = false) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${sleutel}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${gelijk(w, huidig)}" ${uit ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
}

/** Het huis van opzij, met de panelen op de kant die je kiest. */
function zijaanzicht(kant) {
  const op = (s) => kant === 'beide' || kant === s;
  const dak = (s) => (op(s) ? 'var(--zon)' : 'rgba(255,255,255,0.10)');
  const plat = kant === 'plat';
  return `<div class="zijaanzicht"><svg viewBox="0 0 220 124" role="img" aria-label="Het huis van opzij${kant && kant !== 'weetniet' ? `, met de panelen ${plat ? 'op het platte dak' : kant === 'beide' ? 'aan beide kanten' : `aan de ${kant}`}` : ''}">
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
  return `<label class="veldnaam">${esc(label)}<input class="invoer" type="number" inputmode="numeric" min="1" max="200" step="1" data-aantal="${sleutel}" value="${concept.panelen[sleutel] ?? ''}"></label>`;
}

function panelen() {
  const kant = concept.panelen.ligging;
  const aantallen = kant === 'beide' ? `<div class="twee">${aantal('Aantal aan de voorkant', 'voorkant')}${aantal('Aantal aan de achterkant', 'achterkant')}</div>` : kant && kant !== 'weetniet' ? aantal('Aantal panelen', 'aantal') : '';
  const nu = info.configuratie.panelen.length ? `<p class="mini">Nu ingesteld: ${esc(info.configuratie.panelen.join(' en '))}.</p>` : '';
  return `<section class="glas vraag">
    <h2 class="kop-3">Op welke kant van het dak liggen je panelen?</h2>
    ${zijaanzicht(kant)}
    ${keuzes('Kant van het dak', 'ligging', [['voorkant', 'Voorkant'], ['achterkant', 'Achterkant'], ['beide', 'Beide kanten'], ['plat', 'Plat dak'], ['weetniet', 'Weet ik niet']], kant)}
    ${aantallen}${aantallen ? '<p class="mini">Het aantal is niet verplicht.</p>' : ''}
    <p class="uitleg">Richting en hellingshoek bepaalt de app zelf, uit de opbrengst van de eerste zonnige dagen.</p>
    ${nu}
  </section>`;
}

function elke(s) {
  if (s == null) return null;
  if (s < 90) return 'elke minuut';
  if (s < 5400) return `eens per ${Math.round(s / 60)} minuten`;
  return `eens per ${Math.round(s / 3600)} uur`;
}

function zonnesensor() {
  const z = info.zonnesensor;
  if (!z) return '';
  const chip = z.snelGenoeg == null ? ['', 'Wordt gemeten'] : z.snelGenoeg ? ['goed', 'Snel genoeg'] : ['traag', 'Traag'];
  const tekst =
    z.intervalS == null
      ? 'Hoe vaak de sensor een nieuwe waarde geeft, meet de app overdag, als de panelen leveren.'
      : z.snelGenoeg
        ? `${z.merk ? `${z.merk}: ` : ''}nieuwe waarde ${elke(z.intervalS)}. Snel genoeg om op wisselende bewolking te reageren.`
        : `Nieuwe waarde ${elke(z.intervalS)}. Met een lokale koppeling reageert de regeling binnen een minuut op bewolking.`;
  return `<section class="glas vraag">
    <div class="kopregel"><h2 class="kop-3">Zonnesensor</h2><span class="label-chip ${chip[0]}">${chip[1]}</span></div>
    <p class="uitleg">${esc(tekst)}</p>
    ${z.snelGenoeg === false && z.weg ? `<p class="mini">Lokale koppeling: ${esc(z.weg)}</p>` : ''}
  </section>`;
}

/** De gangbare hoofdzekeringen in Nederland; een andere kan via Anders. */
const GANGBAAR = [
  { fasen: 1, ampere: 25 },
  { fasen: 1, ampere: 35 },
  { fasen: 1, ampere: 40 },
  { fasen: 3, ampere: 25 },
  { fasen: 3, ampere: 35 },
  { fasen: 3, ampere: 40 },
  { fasen: 3, ampere: 50 },
];
/** Een eigen waarde invullen; zolang die niet compleet is, staat hij hier. */
let zelf = null;

function zekering() {
  // Wat je hier kiest, gaat voor de configuratie (besluit 117); die is alleen
  // het begin.
  const uitConfig = info.configuratie.zekering;
  const huidigeKeuze = concept.zekering ?? uitConfig;
  const anders = huidigeKeuze && huidigeKeuze !== 'weetniet' && !GANGBAAR.some((z) => gelijk(z, huidigeKeuze));
  const anderZichtbaar = zelf != null;
  const fasen = info.gevonden.fasen.length;
  const een = fasen === 1 ? 'één fase' : `${fasen} fasen`;
  const huidig = huidigeKeuze;
  const noot = concept.zekering == null && uitConfig
    ? `Nu ${uitConfig.fasen} × ${uitConfig.ampere} A, uit de configuratie van het huis. Klopt dat, tik hem dan aan en sla op.`
    : fasen === 0
      ? 'Er is geen stroommeting per fase gevonden. De waarde wordt bewaard, maar de regeling gebruikt hem pas met zo’n meting.'
      : concept.zekering?.fasen === 3 && fasen < 3
        ? `De meter meet nu ${een}. Met drie fasen rekent de regeling pas als de meter drie fasen meet.`
        : 'Staat op de hoofdschakelaar in de meterkast, of in de app van je netbeheerder.';
  return `<section class="glas vraag">
    <div class="kopregel"><h2 class="kop-3">Hoofdzekering</h2>${concept.zekering != null && concept.zekering !== 'weetniet' ? '<span class="label-chip">Ingesteld</span>' : ''}</div>
    <p class="uitleg">De regeling zet nooit zoveel tegelijk aan dat de hoofdzekering eruit gaat.</p>
    ${keuzes('Hoofdzekering', 'zekering', [...GANGBAAR.map((z) => [z, `${z.fasen} × ${z.ampere} A`]), ...(anders ? [[huidig, `${huidig.fasen} × ${huidig.ampere} A`]] : []), ['anders', 'Anders…'], ['weetniet', 'Weet ik niet']], anderZichtbaar ? 'anders' : huidig)}
    ${anderZichtbaar ? `<div class="twee"><label class="veldnaam">Fasen<select class="invoer" data-zekering="fasen"><option value="1" ${zelf.fasen === 1 ? 'selected' : ''}>1 fase</option><option value="3" ${zelf.fasen === 3 ? 'selected' : ''}>3 fasen</option></select></label><label class="veldnaam">Ampère per fase<input class="invoer" type="number" inputmode="numeric" min="6" max="250" step="1" data-zekering="ampere" value="${zelf.ampere ?? ''}"></label></div>` : ''}
    <p class="mini">${esc(noot)}</p>
  </section>`;
}

function contract() {
  return `<section class="glas vraag">
    <h2 class="kop-3">Stroomcontract</h2>
    ${keuzes('Stroomcontract', 'tarief', [['vast', 'Vast'], ['dynamisch', 'Dynamisch'], ['weetniet', 'Weet ik niet']], concept.tarief)}
    <p class="uitleg">Bij een dynamisch contract verschilt de prijs per uur. Later kan de regeling daar rekening mee houden.</p>
    <a class="mini" href="meters.html" style="color: var(--ijs); font-weight: 700">Prijzen invullen bij Meters en prijzen</a>
  </section>`;
}

/*
 * De verwarming (besluit 122): wat het is, en de aanvoertemperatuur op de ketel.
 * Het thermisch model rekent ermee: een lagere aanvoer warmt langzamer op.
 */
function verwarming() {
  const v = concept.verwarming;
  return `<section class="glas vraag">
    <h2 class="kop-3">Verwarming</h2>
    ${keuzes('Verwarming', 'verwarming', [['cv', 'Cv-ketel'], ['warmtepomp', 'Warmtepomp'], ['stadsverwarming', 'Stadsverwarming'], ['weetniet', 'Weet ik niet']], v.soort)}
    <label class="veldnaam">Aanvoertemperatuur op de ketel, °C<input class="invoer" type="number" inputmode="numeric" min="25" max="90" step="1" data-aanvoer value="${v.aanvoerC ?? ''}" placeholder="bijvoorbeeld 60"></label>
    <p class="mini">Staat op de ketel of in de app van je ketel. Weet je het niet, laat het dan leeg.</p>
  </section>`;
}

function opZon() {
  const vast = new Set(info.configuratie.apparaten.map((a) => a.id));
  const ingesteld = (naam) => `<div class="regelrij"><div class="l"><b>${esc(naam)}</b><span>Start bij zonne-overschot. Ingesteld in de configuratie.</span></div><span class="label-chip goed">Aan</span></div>`;
  const rijen = [];
  for (const a of info.gevonden.apparaten) {
    if (vast.has(a.id)) {
      rijen.push(ingesteld(a.naam));
      continue;
    }
    rijen.push(`<div class="regelrij" style="flex-direction: column; align-items: stretch"><div class="l"><b>${esc(a.naam)}</b><span>Kan op afstand starten. Automatisch starten bij zonne-overschot?</span></div>${keuzes(`${a.naam} op zon`, `opZon:${a.id}`, [[true, 'Ja'], [false, 'Nee']], concept.opZon[a.id] ?? null)}</div>`);
  }
  for (const a of info.configuratie.apparaten) if (!info.gevonden.apparaten.some((x) => x.id === a.id)) rijen.push(ingesteld(a.naam));
  return `<section class="glas vraag">
    <h2 class="kop-3">Apparaten op zon</h2>
    ${rijen.length ? rijen.join('') : '<p class="uitleg">Geen apparaten gevonden die op afstand kunnen starten.</p>'}
    <p class="mini">Werkt alleen als "op afstand starten" op het apparaat aanstaat. Hoe laat hij klaar moet zijn, kies je per keer. Zolang Smart Climate meekijkt, start er nog niets echt.</p>
  </section>`;
}

function inGebruik() {
  const r = info.inDeRegeling;
  const regels = [...r.toegevoegd.map((t) => `In gebruik: ${t}.`), ...r.overgeslagen.map((t) => `Niet gebruikt: ${t}.`), info.volgendeStart ? 'Wijzigingen gelden na de volgende herstart van Smart Climate.' : null].filter(Boolean);
  return regels.length ? `<div class="notitie">${regels.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '';
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  // Niet onder de vinger opnieuw opbouwen.
  if (document.activeElement?.matches('input')) return;
  const kolommen = { 1: panelen() + zonnesensor(), 2: zekering() + contract() + verwarming(), 3: opZon() + inGebruik() };
  $$('[data-kolom]').forEach((el) => (el.innerHTML = kolommen[el.dataset.kolom]));
  if (melding) zeg(melding, meldingFout);
}

/* ------------------------------------------------------------ doen */

document.addEventListener('click', async (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    const s = knop.dataset.kies;
    if (s === 'ligging') concept.panelen.ligging = w;
    else if (s === 'zekering') {
      if (w === 'anders') zelf = { fasen: concept.zekering?.fasen ?? 1, ampere: concept.zekering?.ampere ?? null };
      else {
        zelf = null;
        concept.zekering = w;
      }
    }
    else if (s === 'tarief') concept.tarief = w;
    else if (s === 'verwarming') concept.verwarming.soort = w;
    else if (s.startsWith('opZon:')) concept.opZon[s.slice(6)] = w;
    zeg('Nog niet opgeslagen.');
    teken();
  } else if (knop.hasAttribute('data-opslaan')) {
    await opslaan();
  }
});

document.addEventListener('change', (e) => {
  // Een eigen hoofdzekering: compleet als er fasen en ampère zijn.
  const z = e.target.closest('[data-zekering]');
  if (z && zelf && concept) {
    zelf[z.dataset.zekering] = z.value === '' ? null : Math.round(Number(z.value));
    if (zelf.fasen && zelf.ampere >= 6 && zelf.ampere <= 250) concept.zekering = { fasen: zelf.fasen, ampere: zelf.ampere };
    zeg('Nog niet opgeslagen.');
    return;
  }
  // De aanvoertemperatuur: een heel getal, of leeg als je het niet weet.
  const aanvoer = e.target.closest('[data-aanvoer]');
  if (aanvoer && concept) {
    const n = Math.round(Number(aanvoer.value));
    concept.verwarming.aanvoerC = aanvoer.value === '' || !Number.isFinite(n) ? null : Math.min(90, Math.max(25, n));
    if (concept.verwarming.aanvoerC != null) aanvoer.value = String(concept.verwarming.aanvoerC);
    zeg('Nog niet opgeslagen.');
    return;
  }
  const veld = e.target.closest('[data-aantal]');
  if (!veld || !concept) return;
  concept.panelen[veld.dataset.aantal] = veld.value === '' ? null : Math.round(Number(veld.value));
  zeg('Nog niet opgeslagen.');
});

async function opslaan() {
  // Een aantal dat nog in het veld staat, telt ook.
  document.activeElement?.blur?.();
  zeg('Even…');
  try {
    const opZon = Object.fromEntries(Object.entries(concept.opZon).filter(([, v]) => typeof v === 'boolean'));
    const res = await deur('api/aansluiting', { panelen: concept.panelen, zekering: concept.zekering, tarief: concept.tarief, verwarming: concept.verwarming, opZon });
    if (res === null) return;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return zeg('Alleen de beheerder kan dit opslaan.', true);
    if (!res.ok) return zeg(uit.fout ?? 'Niet opgeslagen.', true);
    info = uit;
    zeg(uit.volgendeStart ? 'Opgeslagen. Gaat in na de volgende herstart.' : 'Opgeslagen.');
    teken();
  } catch {
    zeg('Niet opgeslagen: geen verbinding met Smart Climate.', true);
  }
}

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
void laad();
