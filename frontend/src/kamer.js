/*
 * Kamer, in ontwerp 2 (besluit 104; schetsen Wand-Kamer, Wand-Bedienen, Lamp).
 * Links de etage van dichtbij, met de gekozen kamer; rechts een blad met wat er
 * in de kamer is. Een tik op een apparaat opent zijn eigen blad.
 *
 * Wat werkt en wat niet, eerlijk: lampen, scènes en schermen bedien je echt
 * (besluiten 97, 100 en 121). Klimaat schakelt SunArc tot stap B niet;
 * dat blad zegt wat het huis zou doen, in de woorden van de assistent (75).
 * De regeling doet niets met de schermen.
 *
 * Het adres is `kamer.html#<kamer>` of `kamer.html#<kamer>/<apparaat>`.
 */
'use strict';

const { $$, nl, esc, klokVan, wanneer, haal, deur, bijnaOp } = app;
// De teksten staan in kit/teksten.*.js (besluit 185).
const { t } = taal;
/** Een scherm dat al beweegt, als vaste code uit api/huis (besluit 185). */
const BEWEEGT = /^(gaat-open|gaat-dicht)$/;

let state = null;
let huisData = null;
let zon = null;
let vandaag = null;
/** Per apparaat het doel dat de bewoner met − en + koos, tot hij weggaat. */
const doelen = new Map();
/** Per apparaat het laatste antwoord. */
const gezegd = new Map();
/** Wit of kleur, per lamp. */
const lampModus = new Map();
/** Waar terwijl iemand het kleurenwiel sleept: dan het blad niet opnieuw opbouwen. */
let bezig = false;
/**
 * Wat de bewoner net koos, tot Home Assistant het doorgeeft (besluit 128). Een
 * lamp meldt zich pas na een tel of twee als aan; zonder dit sprong de schakelaar
 * even terug naar uit. Een lamp wacht hooguit acht tellen, een screen twee minuten.
 */
const gewenst = new Map();
function wens(id, w) {
  gewenst.set(id, { ...w, tot: Date.now() + (w.positiePct != null ? 120_000 : 8_000) });
  // Meteen ook in wat er nu staat: anders tekent de volgende ronde de oude stand.
  huisData = metWens(huisData);
}
function metWens(h) {
  if (!h || gewenst.size === 0) return h;
  const nu = Date.now();
  for (const e of h.etages ?? []) for (const k of e.ruimtes ?? []) for (const d of k.apparaten ?? []) {
    const w = gewenst.get(d.id);
    if (!w) continue;
    // Al aangepast: alleen een verse stand van de dienst zegt of het klaar is.
    if (d.gewenst) continue;
    const klaar = w.aan != null ? d.aan === w.aan : d.positiePct != null && Math.abs(d.positiePct - w.positiePct) <= 3;
    if (klaar || nu > w.tot) {
      gewenst.delete(d.id);
      continue;
    }
    d.gewenst = true;
    if (w.aan != null) {
      d.aan = w.aan;
      d.stand = t(w.aan ? 'kamer.gaatAan' : 'kamer.gaatUit');
    } else {
      // Het doek op de gekozen stand (besluit 129): anders sprong hij terug naar open
      // tot Home Assistant de nieuwe stand meldde.
      const z = d.scherm?.zonnescherm === true;
      d.aan = z ? w.positiePct > 0 : w.positiePct < 100;
      const was = d.positiePct;
      d.positiePct = w.positiePct;
      if (BEWEEGT.test(d.standCode ?? '')) continue;
      d.stand = z
        ? t(w.positiePct >= (was ?? 0) ? 'eigen.scherm.uitvouwen' : 'eigen.scherm.inklappen')
        : w.positiePct >= 100 ? t('eigen.scherm.open') : w.positiePct <= 0 ? t('eigen.scherm.dicht') : t('kamer.gaatNaar', { pct: 100 - w.positiePct });
    }
  }
  return h;
}

async function laadAlles() {
  // Het blad van een klimaatapparaat (besluit 238): met de hand, ook vanuit het huis.
  const [s, h, z, v] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/vandaag'), hand.laad()]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = metWens(h.value);
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  teken();
}

async function laadHuis() {
  try {
    huisData = metWens(await haal('api/huis'));
  } catch {
    // De volgende keer.
  }
  teken();
}

/* --------------------------------------------------------- het adres */

function adres() {
  const [kamer = '', apparaat = ''] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { kamer, apparaat };
}

function ga(kamerId, apparaatId) {
  location.hash = apparaatId ? `${encodeURIComponent(kamerId)}/${encodeURIComponent(apparaatId)}` : encodeURIComponent(kamerId);
}

function vind() {
  const etages = huisData?.etages ?? [];
  const { kamer: wie, apparaat } = adres();
  // Op de naam van de kamer, of van zijn regeling (#woonkamer, terwijl de kamer `beneden` heet).
  for (const soort of ['id', 'zoneId']) {
    for (const etage of etages) {
      for (const kamer of etage.ruimtes ?? []) if (wie && kamer[soort] === wie) return { etage, kamer, apparaat: kamer.apparaten.find((d) => d.id === apparaat) ?? null };
    }
  }
  // Geen of een onbekende kamer: de eerste met een regeling, van beneden af (eerst was dat de zolder).
  const eerste = [...etages].reverse().flatMap((e) => (e.ruimtes ?? []).map((k) => ({ etage: e, kamer: k }))).sort((a, b) => Number(!!b.kamer.zoneId) - Number(!!a.kamer.zoneId) || Number(a.etage.id === 'buiten') - Number(b.etage.id === 'buiten'))[0];
  return eerste ? { ...eerste, apparaat: null } : null;
}

/* ------------------------------------------------------------ iconen */

const ICOON = {
  licht: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  screen: '<rect x="3" y="3.5" width="18" height="3.5" rx="1"/><path d="M5 7v10h14V7M5 10.5h14M5 14h14"/>',
  airco: '<rect x="2.5" y="5" width="19" height="8" rx="2"/><path d="M6 10h12M8 16.5c-.5 1-.5 2 0 3M12 16v3.5M16 16.5c.5 1 .5 2 0 3"/>',
  thermostaat: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  meter: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9.5V17"/>',
  apparaat: '<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h2"/>',
  camera: '<rect x="2.5" y="6.5" width="14" height="11" rx="2.5"/><path d="M16.5 10.5l5-3v9l-5-3z"/>',
  rookmelder: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2"/>',
  beweging: '<circle cx="13" cy="4.5" r="1.8"/><path d="M9.5 21l2-6 3 3v3M8 12.5l2.5-4.5 3 1 2.5 3.5 2.5.5M11 9.5l-1.5 5"/>',
};
// Een bewegingsmelder is een melder, ook als hij de temperatuur meet; die staat ernaast als tekst.
const soortVan = (d) => (d.soort === 'klimaat' ? (d.klimaat?.kanKoelen ? 'airco' : 'thermostaat') : d.soort === 'meter' && d.meting?.beweging ? 'beweging' : d.soort);
const icoon = (d) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOON[soortVan(d)] ?? ICOON.thermostaat}</svg>`;

const graden = (c) => (c == null ? '' : `${nl(c)}°`);
function meting(m) {
  if (!m) return '';
  return [m.temperatuurC == null ? null : graden(m.temperatuurC), m.vochtPct == null ? null : `${Math.round(m.vochtPct)}%`].filter(Boolean).join(', ');
}
/** De batterij erbij, als het apparaat er een heeft (besluit 122). */
const accu = (d) => (d.batterijPct == null ? '' : ` · ${t('kamer.batterij', { pct: d.batterijPct })}`);

function standTekst(d) {
  return standZonderAccu(d) + accu(d);
}
function standZonderAccu(d) {
  if (d.soort === 'meter') return meting(d.meting);
  if (d.soort === 'klimaat') {
    const m = d.meting?.temperatuurC;
    return m == null ? d.stand : t('kamer.standMet', { stand: d.stand, graden: graden(m) });
  }
  return d.stand;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  if (!huisData) return;
  app.luchtVan(zon, state?.bewoner?.stromen?.zonKw ?? 0);
  const plek = vind();
  if (!plek) return;
  const { etage, kamer, apparaat } = plek;

  $$('[data-pad]').forEach((el) => (el.innerHTML = `<a href="thuis.html">${esc(t('kamer.huis'))}</a><span aria-hidden="true">›</span><a href="#" data-etage="${esc(etage.id)}">${esc(etage.naam)}</a><span aria-hidden="true">›</span><b>${esc(kamer.naam)}</b>`));
  $$('[data-temp]').forEach((el) => {
    el.textContent = graden(kamer.temperatuurC);
    // Zonder thermometer geen lege plek voor de naam (opgelost 15 oktober).
    el.hidden = kamer.temperatuurC == null;
  });
  $$('[data-naam]').forEach((el) => (el.textContent = kamer.naam));
  $$('[data-zin]').forEach((el) => (el.textContent = kamer.status?.zin ?? (kamer.lampenAan ? t('kamer.lampenAan', { n: kamer.lampenAan }) : '')));
  document.title = `${kamer.naam} · SunArc`;

  // Naast elkaar van beneden naar boven, buiten achteraan (besluit 131).
  const etages = huismodel.etagesNaast(huisData.etages).filter((e) => (e.ruimtes ?? []).length);
  $$('[data-etages]').forEach((el) => {
    el.innerHTML = etages.map((e) => `<button type="button" data-etage="${esc(e.id)}" aria-pressed="${e.id === etage.id}">${esc(e.naam)}</button>`).join('');
  });

  tekenPodium(etage, kamer);
  for (const blad of $$('[data-blad]')) {
    // Niet opnieuw opbouwen onder de vinger: een schuif of het kleurenwiel.
    if (bezig || (blad.contains(document.activeElement) && document.activeElement.matches('input'))) continue;
    // Een lopend camerabeeld niet afbreken bij elke verversing: het oude vak terugzetten.
    const lopend = new Map([...blad.querySelectorAll('[data-camera][data-gestart]')].map((b) => [b.dataset.camera, b]));
    blad.innerHTML = apparaat ? apparaatBlad(kamer, apparaat) : kamerBlad(kamer);
    // Met de hand in het blad van de kamer, alleen in het zichtbare blad (wand of telefoon).
    if (blad.closest(app.zicht())) blad.querySelectorAll('[data-handplek]').forEach((el) => hand.inPlek(el, el.dataset.handplek));
    // Van een melding over een batterij: die regel in beeld, even opgelicht.
    const naar = adres().apparaat;
    if (!apparaat && naar.startsWith('batterij-') && blad.closest(app.zicht())) {
      const r = blad.querySelector(`#${CSS.escape(naar)}`);
      if (r && !r.dataset.gezien) {
        r.classList.add('oplicht');
        r.scrollIntoView({ block: 'nearest' });
      }
    }
    for (const beeld of blad.querySelectorAll('[data-camera]')) {
      const oud = lopend.get(beeld.dataset.camera);
      if (oud) {
        beeld.replaceWith(oud);
        lopend.delete(beeld.dataset.camera);
      }
      // Alleen het zichtbare blad haalt beeld op: niet twee streams voor de wand en de telefoon.
      else if (blad.closest(app.zicht())) void startCamera(beeld);
    }
    // Een beeld dat weg is, stoppen: een losgelaten plaatje blijft anders doorladen.
    for (const oud of lopend.values()) stopBeeld(oud);
  }
  // Vanaf een favoriet of een melding naar een apparaat (21 oktober 2026): op de telefoon
  // staat het blad onder de tekening, dus daar meteen naartoe, één keer.
  if (apparaat && naarApparaat === apparaat.id && app.telStand()) {
    naarApparaat = null;
    document.querySelector('#tel [data-blad]')?.scrollIntoView({ block: 'start' });
  }
}
/** Het apparaat uit het adres waarmee de pagina opende; daar gaat de telefoon één keer naartoe. */
let naarApparaat = adres().apparaat || null;

function tekenPodium(etage, kamer) {
  // De laagste etage met kamers binnen is de begane grond. Is de gekozen ruimte buiten, dan
  // toont de pagina die begane grond met de oprit en de tuin eromheen; kies je een kamer
  // binnen, dan zoomt hij in op de etage zelf, zonder buiten.
  const alle = huisData.etages ?? [];
  // De begane grond; zonder, de laagste etage binnen die geen kelder is (besluit 112).
  const binnenEtage = (e) => (e.ruimtes ?? []).some((r) => !huismodel.isBuiten(e, r));
  const laagste = alle.find((e) => e.id === 'bg' && binnenEtage(e)) ?? [...alle].reverse().find((e) => e.id !== 'kelder' && binnenEtage(e)) ?? [...alle].reverse().find(binnenEtage) ?? etage;
  const toon = huismodel.isBuiten(etage, kamer) ? laagste : etage;
  const binnen = toon.ruimtes.filter((r) => !huismodel.isBuiten(toon, r));
  const buitenRuimtes = huismodel.isBuiten(etage, kamer) ? alle.flatMap((e) => (e.ruimtes ?? []).filter((r) => huismodel.isBuiten(e, r))) : [];
  // Met wat er rond het huis is (besluit 193): zoals Thuis, anders ontbraken de garage en de carport uit Inrichten.
  const buitenDelen = huismodel.isBuiten(etage, kamer) ? huismodel.buiten(buitenRuimtes, huisData.rond ?? null) : {};
  for (const b of Object.values(buitenDelen)) if (b) b.gekozen = b.id === kamer.id;
  const maand = new Date().getMonth() + 1;
  const zonKw = state?.bewoner?.stromen?.zonKw ?? 0;
  const helder = zon?.heldereLuchtW ?? 0;
  const model = {
    beschrijving: t(Object.values(buitenDelen).some(Boolean) ? 'kamer.beschrijvingBuiten' : 'kamer.beschrijving', { etage: toon.naam, kamer: kamer.naam }),
    tijd: app.tijdVanDeDag(zon),
    seizoen: maand >= 11 || maand <= 2 ? 'winter' : 'zomer',
    wolken: zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : 0.3) : 0.3,
    zonderDak: true,
    // Een trap in de hal alleen als er een etage boven deze is (besluit 119).
    etages: [{ naam: toon.naam, erBoven: alle.slice(0, alle.indexOf(toon)).some(binnenEtage), kamers: binnen.map((r) => ({ ...huismodel.kamerModel(r, state), gekozen: r.id === kamer.id })) }],
    // De etages eronder en erboven, vaag (25 oktober 2026): een verdieping staat dan niet op het gras. De kelder blijft zoals hij was.
    lagen: toon.id === 'kelder' ? null : { onder: alle.slice(alle.indexOf(toon) + 1).filter((e) => e.id !== 'kelder' && binnenEtage(e)).length, boven: alle.slice(0, alle.indexOf(toon)).filter(binnenEtage).length },
    ...Object.fromEntries(Object.entries(buitenDelen).filter(([, v]) => v)),
  };
  // Met de oprit en de tuin erbij is het beeld breder: dan minder inzoomen, en wat naar links.
  const buitenErbij = Object.values(buitenDelen).some(Boolean);
  const wandPodium = document.getElementById('podium-wand');
  if (!app.telStand()) huis.teken(wandPodium, model, { breedte: wandPodium.clientWidth || 800, hoogte: 560, zoom: buitenErbij ? 0.92 : 1.2, schuifX: buitenErbij ? -30 : 0, schuifY: -10, tik: true, meubels: true });
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: 390, hoogte: 280, marge: 0.03, tik: true });
}

/* --------------------------------------------------------- het kamerblad */

function kamerBlad(k) {
  const apps = k.apparaten ?? [];
  const klimaat = apps.filter((d) => d.soort === 'klimaat' || d.soort === 'screen' || d.soort === 'apparaat');
  const lampen = apps.filter((d) => d.soort === 'licht');
  const cameras = apps.filter((d) => d.soort === 'camera');
  // Rookmelders (21 oktober 2026): wat ze zien, met de batterij.
  const melders = apps.filter((d) => d.soort === 'rookmelder');
  // Sensoren (15 oktober 2026): wat ze meten, of ze beweging zien, en hun batterij.
  const meters = apps.filter((d) => d.soort === 'meter');
  const bedienen = huisData.lichtBedienen === true;
  const rij = (d) => `<button type="button" class="rij${d.aan ? ' aan' : ''}" data-open="${esc(d.id)}">${icoon(d)}<span class="naam"><b>${esc(d.naam)}</b><span>${esc(standTekst(d))}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  const lamp = (d) => `
    <div class="rij${d.aan ? ' aan' : ''}" style="cursor: default">
      <span class="gloei" style="background: ${d.aan ? huismodel.kleurVanLicht(d) : '#3a4656'}; ${d.aan ? `box-shadow: 0 0 12px ${huismodel.kleurVanLicht(d)}` : ''}"></span>
      <button type="button" class="naam" data-open="${esc(d.id)}" style="background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer"><b>${esc(d.naam)}</b><span>${esc(d.stand + accu(d))}</span></button>
      <button type="button" class="schakel" role="switch" aria-checked="${d.aan}" aria-label="${esc(d.naam)}" data-schakel="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></button>
    </div>`;
  /*
   * Schakelaars en sensoren met een batterij (15 oktober 2026): in Home Assistant
   * een apparaat apart, zoals de verlichtingsschakelaar. Een schakelaar staat bij
   * Licht, een sensor onder Sensoren; bijna leeg is oranje. Een melding wijst er
   * met #kamer/batterij-<id> naartoe.
   */
  const gezienAccu = new Set(apps.filter((d) => d.batterijPct != null).map((d) => d.naam));
  const batt = (huisData?.batterijen ?? []).filter((b) => b.kamerId === k.id && !gezienAccu.has(b.naam));
  const isSchakelaar = (b) => /schakel|switch|dimmer|knop|tap|button|afstandsbediening|remote/i.test(b.naam);
  const schakelaars = batt.filter(isSchakelaar);
  const sensoren = batt.filter((b) => !isSchakelaar(b));
  const battRij = (b) => `<div class="rij batt${bijnaOp(b.pct, 'batterij', huisData) ? ' leeg' : ''}" id="batterij-${esc(b.id)}" style="cursor: default"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M21.5 11v2"/><rect x="5" y="9.5" width="${Math.max(1, Math.round((Math.min(100, b.pct) / 100) * 12))}" height="5" rx="1" fill="currentColor" stroke="none"/></svg><span class="naam"><b>${esc(b.naam)}</b><span>${esc(t(bijnaOp(b.pct, 'batterij', huisData) ? 'kamer.batterijLeeg' : 'kamer.batterij', { pct: nl(b.pct, 0) }))}</span></span></div>`;
  const meterRij = (d) => {
    const m = d.meting ?? {};
    const b = m.beweging;
    const delen = [m.temperatuurC != null ? `${nl(m.temperatuurC)}°` : null, m.vochtPct != null ? t('kamer.vocht', { pct: Math.round(m.vochtPct) }) : null, b && !b.nu && b.sindsMs ? t('kamer.bewegingOm', { wanneer: wanneer(b.sindsMs) }) : null, d.batterijPct != null ? t('kamer.batterij', { pct: d.batterijPct }) : null].filter(Boolean);
    const leeg = bijnaOp(d.batterijPct, 'batterij', huisData);
    return `<div class="rij meterrij${leeg ? ' batt leeg' : ''}" style="cursor: default">${b?.nu ? '<span class="beweegt" aria-hidden="true"><i></i></span>' : icoon(d)}<span class="naam"><b>${esc(d.naam)}</b><span>${b?.nu ? `<em class="nu">${esc(t('kamer.bewegingNu'))}</em> · ` : ''}${esc(delen.join(' · '))}</span></span></div>`;
  };
  // De samenvatting kent alleen klimaat; een draaiende droger hoort er ook bij.
  const draait = apps.filter((d) => d.soort === 'apparaat' && d.aan).map((d) => t('kamer.draait', { naam: d.naam }));
  const klimaatZin = k.samenvatting?.klimaat ?? '';
  // Draait er geen klimaat, dan zegt de samenvatting "Er draait niets": niet naast de droger.
  const onder = draait.length ? [k.samenvatting?.draait === 0 ? '' : klimaatZin, ...draait].filter(Boolean).join('. ') : klimaatZin;
  const delen = [
    `<div class="bladkop"><div><h2 class="kop-2">${esc(k.naam)}</h2><p class="klein" style="margin: 4px 0 0">${esc(onder)}</p></div></div>`,
    klimaat.length ? `<div><h3 class="kop-3" style="margin-bottom: 4px">${esc(t(klimaat.some((d) => d.soort === 'klimaat') ? 'kamer.klimaat' : 'nav.apparaten'))}</h3>${klimaat.map(rij).join('')}</div>` : '',
    lampen.length || schakelaars.length
      ? `<div><div class="groepkop"><h3 class="kop-3">${esc(t('kamer.licht'))}</h3>${bedienen && lampen.some((d) => d.aan) ? `<button type="button" class="pil" data-alles-uit style="height: 30px; font-size: 13px; border: 0; color: inherit; cursor: pointer">${esc(t('kamer.allesUit'))}</button>` : ''}</div>${lampen.map(lamp).join('')}${schakelaars.map(battRij).join('')}${bedienen || !lampen.length ? '' : `<p class="mini" style="margin: 6px 0 0">${esc(t('kamer.lichtUit'))}</p>`}</div>`
      : '',
    meters.length || sensoren.length ? `<div><h3 class="kop-3" style="margin-bottom: 4px">${esc(t('kamer.sensoren'))}</h3>${meters.map(meterRij).join('')}${sensoren.map(battRij).join('')}</div>` : '',
    melders.length ? `<div><h3 class="kop-3" style="margin-bottom: 4px">${esc(t('kamer.veiligheid'))}</h3>${melders.map((d) => `<button type="button" class="rij${d.aan ? ' alarm' : ''}" data-open="${esc(d.id)}">${icoon(d)}<span class="naam"><b>${esc(d.naam)}</b><span>${esc(standTekst(d))}</span></span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>` : '',
    cameras.length ? `<div><h3 class="kop-3" style="margin-bottom: 8px">${esc(t('kamer.cameras', { n: cameras.length }))}</h3>${cameras.map((c) => `<div style="margin-bottom: 10px">${cameraBox(c)}</div>`).join('')}</div>` : '',
    // Hoe voelt het hier (besluit 134): dezelfde knoppen als op Thuis.
    // Ook in een kamer die meedoet (besluit 142): het gevoel telt voor die regeling.
    (k.zoneId ?? k.meedoenMet?.zoneId) ? `<div><h3 class="kop-3" style="margin-bottom: 4px">${esc(t('kamer.gevoel'))}</h3><div class="gevoelblok">${gevoel.html({ zoneId: k.zoneId ?? k.meedoenMet.zoneId, state, kort: true })}</div></div>` : '',
    // Geen meters (besluit 129): welke sensoren meten kies je bij Indeling, en het gemiddelde staat bovenaan.
    `<p class="mini regel-fout" data-fout style="margin: 0"></p>`,
  ];
  return delen.join('');
}

/** Lampen waarvan de bewoner alle scènes wil zien. */
const alleScenes = new Set();

/*
 * De scènes bij een lamp (besluit 100): alleen die van zijn eigen Hue-groep,
 * uit het hele huis. Zit hij in meer groepen (het tuinhuis en de hele
 * achtertuin), dan per naam één: die van de kleinste groep, want die zet het
 * minst om de lamp heen. Een lamp zonder kleur krijgt alleen de witte scènes.
 * Hoort hij bij geen groep met scènes, dan de scènes van de kamer zonder groep.
 */
function scenesBij(k, d) {
  const laag = (x) => String(x ?? '').trim().toLowerCase();
  const eigen = (sc) => sc.groep && (laag(d.haNaam) === laag(sc.groep) || (d.groepen ?? []).some((g) => laag(g) === laag(sc.groep)));
  const lampen = (huisData.etages ?? []).flatMap((e) => e.ruimtes.flatMap((r) => r.apparaten ?? [])).filter((x) => x.soort === 'licht');
  const grootte = (groep) => lampen.filter((x) => laag(x.haNaam) === laag(groep) || (x.groepen ?? []).some((g) => laag(g) === laag(groep))).length || 99;
  const uitHuis = new Map((huisData.etages ?? []).flatMap((e) => e.ruimtes.flatMap((r) => r.scenes ?? [])).map((sc) => [sc.id, sc]));
  let lijst = [...uitHuis.values()].filter(eigen);
  if (!lijst.length) lijst = (k.scenes ?? []).filter((sc) => !sc.groep);
  if (!d.licht?.kleur) lijst = lijst.filter((sc) => sc.wit);
  const perNaam = new Map();
  for (const sc of lijst) {
    const al = perNaam.get(laag(sc.naam));
    const beter = !al || grootte(sc.groep) < grootte(al.groep) || (grootte(sc.groep) === grootte(al.groep) && (sc.gebruiktMs ?? 0) > (al.gebruiktMs ?? 0));
    if (beter) perNaam.set(laag(sc.naam), sc);
  }
  return [...perNaam.values()];
}

function scenesVan(d, alles) {
  alles = [...alles].sort((a, b) => (b.gebruiktMs ?? 0) - (a.gebruiktMs ?? 0) || a.naam.localeCompare(b.naam, taal.locale));
  if (!alles.length) return '';
  const open = alleScenes.has(d.id);
  const lijst = open ? alles : alles.slice(0, 6);
  const knop = (sc) => {
    const achter = sc.plaatje
      ? `background-image: url('${esc(sc.plaatje)}')`
      : sc.kleuren?.length
        ? `background: linear-gradient(160deg, ${sc.kleuren.map(esc).join(', ')}, #3a2a18)`
        : 'background: linear-gradient(160deg, #3a4656, #1d2633)';
    return `<button type="button" class="scene" data-scene="${esc(sc.id)}" aria-pressed="${!!sc.actief && d.aan !== false}" style="${achter}" ${huisData.lichtBedienen ? '' : 'disabled'}><span>${esc(sc.naam)}</span></button>`;
  };
  const meer = alles.length > 6 ? `<button type="button" class="pil" data-meer-scenes style="border: 0; color: inherit; cursor: pointer; margin-top: 8px">${esc(open ? t('kamer.minderScenes') : t('kamer.alleScenes', { n: alles.length }))}</button>` : '';
  return `<div><div class="groepkop"><h3 class="kop-3">${esc(t('eigen.filter.scenes'))}</h3><span class="mini">${esc(t('kamer.uitHue'))}</span></div><div class="scenes">${lijst.map(knop).join('')}</div>${meer}</div>`;
}

/* ----------------------------------------------------- de apparaatbladen */

function apparaatBlad(k, d) {
  const terug = `<button type="button" class="terug" data-terug>‹ ${esc(k.naam)}</button>`;
  const soort = soortVan(d);
  let inhoud;
  const metHand = (soort === 'airco' || soort === 'thermostaat') ? hand.bij(d) : null;
  if (metHand) inhoud = handBlad(k, d, metHand, soort);
  else if (soort === 'airco') inhoud = aircoBlad(k, d);
  else if (soort === 'thermostaat') inhoud = nestBlad(k, d);
  else if (soort === 'screen') inhoud = screenBlad(k, d);
  else if (soort === 'licht') inhoud = lampBlad(k, d);
  else if (soort === 'camera') inhoud = cameraBlad(d);
  else if (soort === 'rookmelder') inhoud = rookmelderBlad(d);
  else if (soort === 'apparaat') inhoud = `${kopVan(d, 'zon-t')}<p class="klein" style="margin: 0">${esc(t('kamer.opZon'))}</p><a class="pil" href="apparaten.html" style="align-self: start">${esc(t('kamer.naarApparaten'))}</a>`;
  else inhoud = `${kopVan(d, '')}<p class="klein" style="margin: 0">${esc(t(d.meetKamer ? 'kamer.meterRegelt' : 'kamer.meterInfo'))}</p>`;
  return `${terug}${inhoud}`;
}

/** Een rookmelder (21 oktober 2026): alleen lezen; afzetten op de melder of in de app van het merk. */
function rookmelderBlad(d) {
  const r = d.rookmelder ?? {};
  const datum = (s) => (s ? taal.datum(new Date(`${s}T12:00:00`), { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  const feiten = [
    [t('kamer.melder.batterij'), d.batterijPct != null ? (r.batterijProbleem ? t('kamer.melder.pctVervangen', { pct: d.batterijPct }) : `${d.batterijPct}%`) : r.batterijProbleem ? t('kamer.melder.vervangen') : null],
    [t('kamer.melder.test'), datum(r.getestOp)],
    [t('kamer.melder.voor'), datum(r.vervangenVoor)],
  ].filter(([, w]) => w != null);
  return `${kopVan(d, r.gevaar ? 'alarm-t' : '')}
    ${feiten.map(([k, w]) => `<div class="feit"><b>${esc(k)}</b><span>${esc(w)}</span></div>`).join('')}
    <p class="mini" style="margin: 0">${esc(t('kamer.melder.uitleg'))}</p>`;
}

const kopVan = (d, toon, rechts = '') => `<div class="bladkop"><div><h2 class="kop-2">${esc(d.naam)}</h2><p class="klein ${toon}" style="margin: 4px 0 0">${esc(standTekst(d))}</p></div>${rechts}</div>`;

/** De strook van vandaag voor een klimaatapparaat: wanneer het draaide, en licht wanneer SunArc het zou doen. */
function strookVandaag(d, kleur) {
  const a = (vandaag?.apparaten ?? []).find((x) => x.actuatorId === d.actuatorId);
  if (!vandaag || !a) return '';
  const t0 = vandaag.vanMs;
  const pct = (ms) => Math.max(0, Math.min(100, ((ms - t0) / 86_400_000) * 100));
  const blok = (s, licht) => `<i style="left: ${pct(s.vanMs).toFixed(2)}%; width: ${Math.max(0.8, pct(s.totMs) - pct(s.vanMs)).toFixed(2)}%; background: ${kleur}; ${licht ? 'opacity: 0.32' : ''}"></i>`;
  const tijden = a.huidig.slice(-3).map((s) => `${klokVan(s.vanMs)}–${klokVan(s.totMs)}`);
  const zin = a.huidig.length ? t('kamer.draaide', { tijden: tijden.join(', ') }) : t('kamer.draaideNiet');
  return `<div><b style="font-size: 14px">${esc(t('thuis.kaart.vandaag'))}</b><p class="mini" style="margin: 2px 0 8px">${esc(zin)}</p><div class="strook">${a.smartClimate.map((s) => blok(s, true)).join('')}${a.huidig.map((s) => blok(s, false)).join('')}<span class="nu" style="left: ${pct(Date.now()).toFixed(2)}%"></span></div><div class="uren"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div><p class="mini" style="margin: 6px 0 0">${esc(t('kamer.strookUitleg'))}</p></div>`;
}

const MEEKIJKEN = t('kamer.meekijken');
/** Telt de tekeningen, voor een eigen naam per verloop. */
let tekeningNr = 0;

/**
 * Een klimaatapparaat dat met de hand kan (besluit 238): hetzelfde blad als bij
 * Apparaten, met de draaiknop, hoe lang en tot het doel. Zonder (de brug staat
 * uit bij Functies, of op de NAS) blijft het blad van meekijken.
 */
function handBlad(k, d, a, soort) {
  return `${kopVan(d, d.aan ? (soort === 'airco' && !/warm/.test(d.stand) ? 'ijs-t' : 'gloed-t') : '')}
    ${a.actief ? `<p class="klein" style="margin: -6px 0 0; color: var(--zon-t); font-weight: 600">${esc(huismodel.metHoofdletter(hand.nuZin(a)))}</p>` : ''}
    <div data-handplek="${esc(a.id)}"></div>
    ${filterRegel(d)}
    ${knopRegel(d)}
    ${strookVandaag(d, soort === 'airco' ? '#6FD3FF' : '#FF7A4D')}`;
}

function aircoBlad(k, d) {
  const doel = doelen.get(d.id) ?? d.klimaat?.doelC ?? 22;
  const nu = d.meting?.temperatuurC ?? k.temperatuurC;
  const warm = /verwarm|warm/.test(d.stand);
  const kleur = warm ? '#FF7A4D' : '#6FD3FF';
  // De schaal van 16 tot 30, 270 graden rond, met de opening onderaan.
  const hoek = (c) => ((135 + ((Math.max(16, Math.min(30, c)) - 16) / 14) * 270) * Math.PI) / 180;
  const pt = (c, r) => [150 + r * Math.cos(hoek(c)), 150 + r * Math.sin(hoek(c))];
  const [sx, sy] = pt(16, 118);
  const [ex, ey] = pt(30, 118);
  const [dx, dy] = pt(doel, 118);
  const groot = hoek(doel) - hoek(16) > Math.PI ? 1 : 0;
  const nuStreep = nu == null ? '' : (() => {
    const [a1, b1] = pt(nu, 104);
    const [a2, b2] = pt(nu, 132);
    return `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="#F7B548" stroke-width="3" stroke-linecap="round"/>`;
  })();
  const lucht = d.aan ? `<g stroke="${kleur}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.8"><path class="sc-lucht" d="M110 206 q 6 14 0 26"/><path class="sc-lucht" style="animation-delay: .3s" d="M150 206 q 6 14 0 26"/><path class="sc-lucht" style="animation-delay: .6s" d="M190 206 q 6 14 0 26"/></g>` : '';
  // Een eigen naam per tekening: de wand en de telefoon staan allebei in de pagina, en een verborgen verloop tekent niet (ronde 5).
  const n = ++tekeningNr;
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="${esc(nu == null ? t('kamer.doelLabel', { doel: nl(doel) }) : t('kamer.doelNuLabel', { doel: nl(doel), nu: nl(nu) }))}">
    <defs><linearGradient id="ring-${n}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${kleur}"/><stop offset="1" stop-color="#8F86FF"/></linearGradient>
      <radialGradient id="koud-${n}"><stop offset="0" stop-color="${kleur}" stop-opacity="${d.aan ? 0.28 : 0.1}"/><stop offset="1" stop-color="${kleur}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="150" cy="150" r="140" fill="url(#koud-${n})"/>
    <path d="M ${sx} ${sy} A 118 118 0 1 1 ${ex} ${ey}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="16" stroke-linecap="round"/>
    <path d="M ${sx} ${sy} A 118 118 0 ${groot} 1 ${dx} ${dy}" fill="none" stroke="url(#ring-${n})" stroke-width="16" stroke-linecap="round"/>
    <circle cx="${dx}" cy="${dy}" r="13" fill="#EEF3F7"/>
    ${nuStreep}
    <g font-family="Figtree" font-size="11" fill="#7F8E9C"><text x="54" y="262" text-anchor="middle">16°</text><text x="246" y="262" text-anchor="middle">30°</text></g>
    <text x="150" y="146" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="58" fill="#EEF3F7">${nl(doel)}°</text>
    <text x="150" y="172" text-anchor="middle" font-family="Figtree" font-size="13" fill="#B8C4CF">${esc(nu == null ? t('kamer.doel') : t('kamer.doelHetIs', { graden: nl(nu) }))}</text>
    ${lucht}
  </svg>`;
  const kan = d.klimaat ?? { kanKoelen: true, kanVerwarmen: true };
  const keuzes = [kan.kanKoelen ? 'koelen' : null, kan.kanVerwarmen ? 'verwarmen' : null, kan.kanDrogen ? 'drogen' : null, 'uit'].filter(Boolean);
  return `${kopVan(d, warm ? 'gloed-t' : d.aan ? 'ijs-t' : '')}
    <div class="beeld">${svg}</div>
    ${doelRij()}
    ${k.zoneId ? `<div class="keuze" role="group" aria-label="${esc(t('kamer.watZou'))}">${keuzes.map((w) => `<button type="button" data-wens="${w}">${esc(t(`kamer.wens.${w}`))}</button>`).join('')}</div>` : `<p class="mini" style="margin: 0">${esc(t('kamer.geenRegeling'))}</p>`}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span data-gezegd>${esc(gezegd.get(d.id) ?? MEEKIJKEN)}</span></div>
    ${filterRegel(d)}
    ${strookVandaag(d, kleur)}`;
}

/** De knoppen − en + voor het doel. */
const doelRij = () => `<div class="doelrij"><button type="button" class="rond" data-doel="-0.5" aria-label="${esc(t('kamer.kouder'))}">−</button><span class="mini">${esc(t('kamer.doel'))}</span><button type="button" class="rond" data-doel="0.5" aria-label="${esc(t('kamer.warmer'))}">+</button></div>`;

/** Hoe lang het filter nog meegaat (besluit 129); onder de drempel schoonmaken (149). */
function filterRegel(d) {
  const f = d.klimaat?.filter;
  if (!f) return '';
  const leeg = bijnaOp(f.pct, 'filter', huisData);
  const wat = f.pct != null ? t('kamer.filter.over', { pct: nl(f.pct, 0) }) : t('kamer.filter.uren', { n: f.uren, uren: nl(f.uren, 0) });
  return `<div class="feit"><span>${esc(t('kamer.filter.kop'))}</span><b style="${leeg ? 'color: var(--gloed-t)' : ''}">${esc(leeg ? t('kamer.filter.schoonmaken', { wat }) : wat)}</b></div>`;
}

/*
 * Een radiatorknop (besluit 126): hoe hij gekoppeld is, en de klep. Via ZHA zegt
 * de app wat Zigbee2MQTT erbij geeft.
 */
function knopRegel(d) {
  const knop = d.radiatorknop;
  if (!knop) return '';
  const klep = knop.klepPct != null ? `<div class="feit"><span>${esc(t('kamer.knop.klep'))}</span><b>${esc(t('kamer.knop.open', { pct: nl(knop.klepPct, 0) }))}</b></div>` : '';
  const via = t(knop.koppeling === 'zha' ? 'kamer.knop.zha' : knop.koppeling === 'zigbee2mqtt' ? 'kamer.knop.z2m' : 'kamer.knop.anders');
  return `${klep}<p class="mini" style="margin: 0">${esc(`${via} ${t('kamer.knop.later')}`)}</p>`;
}

function nestBlad(k, d) {
  const doel = doelen.get(d.id) ?? d.klimaat?.doelC ?? 20;
  const nu = d.meting?.temperatuurC ?? k.temperatuurC;
  const brandt = /verwarmt/.test(d.klimaat?.actieCode ?? d.standCode ?? '');
  const tikken = [];
  for (let i = 0; i < 60; i++) {
    const a = ((-225 + (i / 59) * 270) * Math.PI) / 180;
    const r2 = i % 5 === 0 ? 80 : 85;
    const aan = 10 + (i / 59) * 20 <= doel;
    tikken.push(`<line x1="${(150 + Math.cos(a) * 92).toFixed(1)}" y1="${(145 + Math.sin(a) * 92).toFixed(1)}" x2="${(150 + Math.cos(a) * r2).toFixed(1)}" y2="${(145 + Math.sin(a) * r2).toFixed(1)}" stroke="${aan ? '#FF7A4D' : 'rgba(255,255,255,0.25)'}"/>`);
  }
  const n = ++tekeningNr;
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="${esc(`${t('kamer.thermostaat')}: ${nu == null ? t('kamer.doelLabel', { doel: nl(doel) }) : t('kamer.doelNuLabel', { doel: nl(doel), nu: nl(nu) })}${brandt ? `, ${t('kamer.verwarmt')}` : ''}`)}">
    <defs><radialGradient id="schijf-${n}" cx="0.45" cy="0.4"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0e141c"/></radialGradient>
      <radialGradient id="gloed-${n}"><stop offset="0.6" stop-color="#FF7A4D" stop-opacity="${brandt ? 0.45 : 0}"/><stop offset="1" stop-color="#FF7A4D" stop-opacity="0"/></radialGradient></defs>
    <circle cx="150" cy="145" r="140" fill="url(#gloed-${n})"/>
    <circle cx="150" cy="145" r="112" fill="#c9d2db"/>
    <circle cx="150" cy="145" r="104" fill="url(#schijf-${n})"/>
    <g stroke-width="3" stroke-linecap="round">${tikken.join('')}</g>
    <text x="150" y="150" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="56" fill="#EEF3F7">${nl(doel, Number.isInteger(doel) ? 0 : 1)}</text>
    <text x="150" y="176" text-anchor="middle" font-family="Figtree" font-size="13" fill="${brandt ? '#FFB090' : '#B8C4CF'}">${esc(t(brandt ? 'kamer.verwarmt' : d.radiatorknop && d.stand !== 'uit' ? 'kamer.klaar' : 'kamer.uit'))}${nu == null ? '' : `, ${esc(t('kamer.nu', { graden: nl(nu) }))}`}</text>
  </svg>`;
  return `${kopVan(d, brandt ? 'gloed-t' : '')}
    <div class="beeld">${svg}</div>
    ${doelRij()}
    ${k.zoneId ? `<div class="keuze" role="group" aria-label="${esc(t('kamer.watZou'))}"><button type="button" data-wens="verwarmen">${esc(t('kamer.wens.verwarmen'))}</button><button type="button" data-wens="uit">${esc(t('kamer.wens.uit'))}</button></div>` : ''}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span data-gezegd>${esc(gezegd.get(d.id) ?? MEEKIJKEN)}</span></div>
    ${knopRegel(d)}
    ${strookVandaag(d, '#FF7A4D')}`;
}

/*
 * Het screen (besluit 121, schets Wand-Bedienen): het raam met het doek op zijn
 * stand. Bij een screen dat zijn stand terugmeldt en er een kan kiezen (Somfy
 * io), sleep je de greep omhoog of omlaag, of kies je Open, Half of Dicht. Een
 * scherm zonder terugmelding (Somfy RTS) heeft alleen Open, Stop en Dicht.
 */
const DOEK = { boven: 46, hoogte: 214 };

/** Zet het doek op een stand (0 is open, 1 is dicht), in een getekend raam. */
function zetDoek(svg, dicht) {
  const h = Math.round(DOEK.hoogte * dicht);
  const doek = svg.querySelector('[data-doek]');
  if (doek) {
    doek.setAttribute('height', String(h));
    doek.style.display = h > 0 ? '' : 'none';
  }
  svg.querySelector('[data-lat]')?.setAttribute('y', String(42 + h));
  svg.querySelector('[data-greep]')?.setAttribute('transform', `translate(0 ${h})`);
  const lijn = svg.querySelector('[data-standlijn]');
  if (lijn) {
    lijn.setAttribute('y2', String(DOEK.boven + h));
    lijn.style.display = h > 0 ? '' : 'none';
  }
  const tekst = svg.querySelector('[data-standtekst]');
  if (tekst) {
    tekst.setAttribute('y', String(Math.min(250, 72 + h)));
    tekst.textContent = h > 0 ? `${Math.round(dicht * 100)}%` : t('kamer.scherm.open');
  }
}

/**
 * Een zonnescherm (besluit 128): open is uitgevouwen, en het doek in de tekening
 * is hoe ver hij uit is. Bij een screen is het doek hoe ver hij dicht is.
 */
const naarHa = (d, doekPct) => (d.scherm?.zonnescherm ? doekPct : 100 - doekPct);

/** Wat er in de tekening staat. */
function standWoord(d, terug, laatste, dicht) {
  const z = d.scherm?.zonnescherm === true;
  if (!terug) return laatste ? t(z ? (laatste === 'open' ? 'kamer.scherm.uitgevouwen' : 'kamer.scherm.ingeklapt') : `kamer.scherm.${laatste}`) : t('kamer.scherm.onbekend');
  if (dicht <= 0) return t(z ? 'kamer.scherm.ingeklapt' : 'kamer.scherm.open');
  return z && dicht >= 1 ? t('kamer.scherm.uitgevouwen') : `${Math.round(dicht * 100)}%`;
}

function screenBlad(k, d) {
  // Somfy RTS meldt zijn stand niet terug (besluit 121): dan de laatste opdracht, als die er is (128).
  const terug = d.scherm?.terugmelding !== false;
  const zonnescherm = d.scherm?.zonnescherm === true;
  const laatste = terug ? null : d.scherm?.laatste ?? null;
  const sleep = terug && d.scherm?.standKiezen === true;
  const bedienen = huisData.schermenBedienen === true;
  const pos = d.positiePct ?? (zonnescherm ? (d.aan ? 100 : 0) : d.aan ? 0 : 100);
  const dicht = terug ? naarHa(d, pos) / 100 : laatste ? ((laatste === 'open') === zonnescherm ? 1 : 0) : 0;
  const doekH = Math.round(DOEK.hoogte * dicht);
  // Zon op dit scherm: alleen op de gevel waar het hangt (besluit 145); weet het huis die niet, dan niets.
  const gevel = d.scherm?.gevel ? (zon?.gevels ?? []).find((g) => g.id === d.scherm.gevel.id) : null;
  const zonNu = gevel?.inDeZon ? [gevel.naam.toLowerCase()] : [];
  const n = ++tekeningNr;
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="${esc(t('kamer.scherm.label', { pct: Math.round(dicht * 100) }))}" ${sleep && bedienen ? `data-schermsleep="${esc(d.id)}" style="touch-action: none; cursor: ns-resize"` : ''}>
    <defs><linearGradient id="raamlucht-${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d8fc0"/><stop offset="1" stop-color="#9cc1e0"/></linearGradient>
      <pattern id="doek-${n}" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="6" fill="#3d4a5a"/><rect width="8" height="1.2" fill="#4c5b6d"/></pattern>
      <linearGradient id="straal-${n}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.55"/><stop offset="1" stop-color="#F7B548" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="300" height="290" rx="16" fill="#26313f"/>
    ${zonNu.length ? `<polygon points="300,0 300,120 120,290 40,290" fill="url(#straal-${n})" opacity="0.6"/><circle cx="282" cy="22" r="14" fill="#FFD27A"/>` : ''}
    <rect x="46" y="26" width="208" height="20" rx="5" fill="#4a5768"/>
    <rect x="56" y="46" width="188" height="214" rx="4" fill="url(#raamlucht-${n})" stroke="#6b7a8c" stroke-width="6"/>
    <line x1="150" y1="46" x2="150" y2="260" stroke="#6b7a8c" stroke-width="5"/>
    <rect x="64" y="160" width="76" height="92" fill="#ffffff" opacity="0.12"/>
    <rect data-doek x="52" y="46" width="196" height="${doekH}" fill="url(#doek-${n})" ${doekH > 0 ? '' : 'style="display: none"'}/>
    <rect data-lat x="48" y="${42 + doekH}" width="204" height="9" rx="4" fill="#5b6a7c"/>
    ${sleep && bedienen ? `<g data-greep transform="translate(0 ${doekH})"><rect x="126" y="38" width="48" height="17" rx="8.5" fill="#EEF3F7"/><line x1="138" y1="46.5" x2="162" y2="46.5" stroke="#0b1424" stroke-width="2" stroke-linecap="round"/></g>` : ''}
    <line x1="270" y1="46" x2="270" y2="260" stroke="#ffffff" stroke-opacity="0.15" stroke-width="4" stroke-linecap="round"/>
    <line data-standlijn x1="270" y1="46" x2="270" y2="${46 + doekH}" stroke="#EEF3F7" stroke-width="4" stroke-linecap="round" ${doekH > 0 && terug ? '' : 'style="display: none"'}/>
    <text data-standtekst x="262" y="${Math.min(250, 72 + doekH)}" text-anchor="end" font-family="Bricolage Grotesque" font-weight="600" font-size="20" fill="#EEF3F7">${esc(standWoord(d, terug, laatste, dicht))}</text>
  </svg>`;
  const pil = zonNu.length ? `<span class="pil zon-t" style="height: 30px; font-size: 12.5px"><span class="stip" style="background: var(--zon)"></span>${esc(t('kamer.scherm.zonOp', { gevel: zonNu[0] }))}</span>` : '';
  // Open, Half, de stand van nu en Dicht; zonder stand kiezen Open, Stop en Dicht.
  const nu = Math.round(dicht * 100);
  const k_ = (s) => t(`kamer.scherm.${s}`);
  const [OPEN, DICHT] = zonnescherm ? [k_('ingeklapt'), k_('uitgevouwen')] : [k_('openKnop'), k_('dichtKnop')];
  const keuzes = sleep
    ? [['stand:0', OPEN, nu === 0], ['stand:50', k_('half'), nu === 50], ...(nu !== 0 && nu !== 50 && nu !== 100 ? [[`stand:${nu}`, `${nu}%`, true]] : []), ['stand:100', DICHT, nu === 100]]
    : zonnescherm
      ? [['open', k_('uitvouwen'), laatste === 'open'], ['stop', k_('stop'), false], ['dicht', k_('inklappen'), laatste === 'dicht']]
      : [['open', k_('openKnop'), laatste === 'open'], ['stop', k_('stop'), false], ['dicht', k_('dichtKnop'), laatste === 'dicht']];
  const knoppen = `<div class="keuze" style="grid-template-columns: repeat(${keuzes.length}, 1fr)" role="group" aria-label="${esc(t('kamer.scherm.bedienen', { naam: d.naam }))}">${keuzes.map(([a, tekst, aan]) => `<button type="button" data-scherm="${a}" aria-pressed="${aan}" ${bedienen ? '' : 'disabled'}>${esc(tekst)}</button>`).join('')}</div>`;
  const uitleg = !terug
    ? t(zonnescherm ? 'kamer.scherm.rtsZonnescherm' : 'kamer.scherm.rts')
    : t(sleep ? 'kamer.scherm.sleep' : 'kamer.scherm.zelf');
  return `${kopVan(d, '', pil)}
    <div class="beeld">${svg}</div>
    ${bedienen ? knoppen : ''}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span>${esc(bedienen ? uitleg : t('kamer.scherm.uit'))}</span></div>
    <p class="mini" data-fout style="margin: 0; color: var(--gloed-t)"></p>`;
}

/*
 * De camera (besluit 106): het live beeld, via de dienst bij Home Assistant
 * opgehaald. Kijken vraagt de inlog; zonder staat er de weg ernaartoe.
 */
function cameraBox(d) {
  return `<div class="camerabeeld" data-camera="${esc(d.id)}" data-cameranaam="${esc(d.naam)}"><p class="mini">${esc(t('kamer.camera.laden'))}</p></div>`;
}

function cameraBlad(d) {
  return `${kopVan(d, '')}
    ${cameraBox(d)}
    <p class="mini" style="margin: 0">${esc(t('kamer.camera.uitleg'))}</p>`;
}

/** Het live beeld stoppen: de stroom loopt door tot het plaatje geen bron meer heeft. */
function stopBeeld(box) {
  for (const img of box.querySelectorAll('img')) img.removeAttribute('src');
}

async function startCamera(box) {
  const id = box.dataset.camera;
  const naam = box.dataset.cameranaam;
  try {
    const res = await fetch(`api/camera?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!box.isConnected) return;
    if (res.status === 401) {
      const terug = encodeURIComponent(location.pathname + location.hash);
      box.innerHTML = `<p class="klein" style="margin: 0 0 12px">${esc(t('kamer.camera.inloggen'))}</p><a class="pil" href="auth/login?terug=${terug}">${esc(t('kamer.camera.inlogKnop'))}</a>`;
      return;
    }
    if (!res.ok) {
      const uit = await res.json().catch(() => ({}));
      box.innerHTML = `<p class="klein" style="margin: 0">${esc(uit.fout ?? uit.wachten ?? t('kamer.camera.geenBeeld'))}</p>`;
      return;
    }
    // Eerst het plaatje, dan live erover: zo staat er meteen iets.
    const blob = await res.blob();
    // Weg terwijl het plaatje laadde (een ander blad): dan ook geen live beeld starten.
    if (!box.isConnected) return;
    const plaatje = URL.createObjectURL(blob);
    box.dataset.gestart = '1';
    box.innerHTML = `<img alt="${esc(t('basis.bel.liveVan', { naam }))}" src="${plaatje}"><span class="live"><span class="stip"></span>${esc(naam)}</span><button type="button" class="vol" data-vol aria-label="${esc(t('kamer.camera.vol'))}">⤢</button>`;
    const img = box.querySelector('img');
    const live = new Image();
    live.alt = img.alt;
    live.onload = () => {
      if (box.isConnected) img.replaceWith(live);
      else live.src = '';
    };
    live.onerror = () => box.querySelector('.live')?.replaceChildren(t('kamer.camera.plaatje'));
    live.src = `api/camera?id=${encodeURIComponent(id)}&live=1`;
  } catch {
    if (box.isConnected) box.innerHTML = `<p class="klein" style="margin: 0">${esc(t('kamer.geenVerbinding'))}</p>`;
  }
}

function lampBlad(k, d) {
  const bedienen = huisData.lichtBedienen === true;
  const l = d.licht ?? {};
  const modus = lampModus.get(d.id) ?? (l.tint ? 'kleur' : 'wit');
  const wit = l.wit;
  const delen = [
    kopVan(d, d.aan ? 'zon-t' : '', `<button type="button" class="schakel" role="switch" aria-checked="${d.aan}" aria-label="${esc(d.naam)}" data-schakel="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></button>`),
  ];
  if (d.dimbaar) delen.push(`<div><div class="feit" style="margin-bottom: 8px"><b>${esc(t('kamer.lamp.helderheid'))}</b><span data-helder-tekst>${d.aan ? `${d.helderheidPct ?? 100}%` : esc(t('eigen.lamp.uit'))}</span></div><input class="schuif${d.aan ? '' : ' uit'}" type="range" min="1" max="100" step="1" value="${d.aan ? (d.helderheidPct ?? 100) : 1}" aria-label="${esc(t('kamer.lamp.helderheidVan', { naam: d.naam }))}" data-helder="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></div>`);
  if (wit && l.kleur) delen.push(`<div class="keuze" role="group" aria-label="${esc(t('kamer.lamp.witOfKleur'))}" style="grid-template-columns: 1fr 1fr"><button type="button" data-modus="wit" aria-pressed="${modus === 'wit'}">${esc(t('kamer.lamp.wit'))}</button><button type="button" data-modus="kleur" aria-pressed="${modus === 'kleur'}">${esc(t('kamer.lamp.kleur'))}</button></div>`);
  if (wit && (modus === 'wit' || !l.kleur)) {
    delen.push(`<div><div class="feit" style="margin-bottom: 8px"><b>${esc(t('kamer.lamp.wit'))}</b><span>${esc(t('kamer.lamp.warmKoel'))}</span></div><input class="schuif wit" type="range" min="${wit.minK}" max="${wit.maxK}" step="50" value="${l.kelvin ?? Math.max(wit.minK, Math.min(wit.maxK, 2700))}" aria-label="${esc(t('kamer.lamp.witVan', { naam: d.naam }))}" data-kelvin="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></div>`);
  } else if (!wit && d.kleurtemp) {
    delen.push(`<div class="keuze" role="group" aria-label="${esc(t('kamer.lamp.kleurWit'))}" style="grid-template-columns: repeat(3, 1fr)"><button type="button" data-kleur="warm">${esc(t('kamer.lamp.warm'))}</button><button type="button" data-kleur="neutraal">${esc(t('kamer.lamp.neutraal'))}</button><button type="button" data-kleur="koel">${esc(t('kamer.lamp.koel'))}</button></div>`);
  }
  if (l.kleur && modus === 'kleur') {
    const [h, s] = l.tint ?? [30, 80];
    const a = (h * Math.PI) / 180;
    const r = (Math.min(100, s) / 100) * 110;
    delen.push(`<div class="wiel" role="slider" aria-label="${esc(t('kamer.lamp.kleurVan', { naam: d.naam }))}" aria-valuetext="${esc(t('kamer.lamp.tint', { tint: Math.round(h), verzadiging: Math.round(s) }))}" data-wiel="${esc(d.id)}"><i style="left: ${(110 + Math.cos(a) * r).toFixed(1)}px; top: ${(110 + Math.sin(a) * r).toFixed(1)}px; background: hsl(${Math.round(h)} ${Math.round(s)}% 60%)"></i></div>`);
  }
  if (!bedienen) delen.push(`<p class="mini" style="margin: 0">${esc(t('kamer.lichtUit'))}</p>`);
  delen.push(scenesVan(d, scenesBij(k, d)), `<p class="mini" data-fout style="margin: 0"></p>`);
  return delen.join('');
}

/* ----------------------------------------------------------- bedienen */

async function licht(body, door = 'api/licht') {
  try {
    const res = await deur(door, body);
    if (res === null) return;
    if (!res.ok) {
      const uit = await res.json().catch(() => ({}));
      $$('[data-fout]').forEach((el) => (el.textContent = uit.fout ?? uit.wachten ?? t('kamer.mislukt')));
      return;
    }
    // Even wachten tot Home Assistant de nieuwe stand doorgeeft; tot dan staat er wat je koos.
    for (const ms of [800, 2500, 6000]) setTimeout(() => void laadHuis(), ms);
  } catch {
    $$('[data-fout]').forEach((el) => (el.textContent = t('kamer.geenVerbinding')));
  }
}

async function vraag(kamer, d, wens) {
  const doel = doelen.get(d.id) ?? d.klimaat?.doelC;
  // In de taal van de app (besluit 185): de assistent antwoordt dan ook zo.
  const params = new URLSearchParams({ v: 'doe', kamer: kamer.zoneId, wens, taal: taal.code });
  if (wens !== 'uit' && doel != null) params.set('temperatuur', String(doel));
  gezegd.set(d.id, t('kamer.kijken'));
  $$('[data-gezegd]').forEach((el) => (el.textContent = t('kamer.kijken')));
  try {
    const res = await fetch(`api/vraag?${params}`);
    const uit = await res.json();
    gezegd.set(d.id, res.ok ? uit.antwoord : uit.fout ?? t('kamer.geenAntwoord'));
  } catch {
    gezegd.set(d.id, t('kamer.geenVerbinding'));
  }
  $$('[data-gezegd]').forEach((el) => (el.textContent = gezegd.get(d.id)));
}

function koppel(blad) {
  blad.addEventListener('click', (e) => {
    const vak = e.target.closest('.camerabeeld[data-gestart]');
    if (vak && (e.target.closest('[data-vol]') || e.target.closest('img'))) {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void vak.requestFullscreen?.().catch(() => {});
      return;
    }
    const plek = vind();
    if (!plek) return;
    const { kamer, apparaat } = plek;
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.open) ga(kamer.id, t.dataset.open);
    else if (t.hasAttribute('data-terug')) ga(kamer.id);
    else if (t.dataset.schakel) {
      const d = kamer.apparaten.find((x) => x.id === t.dataset.schakel);
      const aan = !d?.aan;
      t.setAttribute('aria-checked', String(aan));
      wens(t.dataset.schakel, { aan });
      void licht({ doel: 'lamp', id: t.dataset.schakel, aan });
    } else if (t.hasAttribute('data-alles-uit')) {
      for (const d of kamer.apparaten) if (d.soort === 'licht' && d.aan) wens(d.id, { aan: false });
      void licht({ doel: 'kamer', id: kamer.id, aan: false });
    }
    else if (t.hasAttribute('data-meer-scenes')) {
      if (alleScenes.has(apparaat?.id)) alleScenes.delete(apparaat?.id);
      else alleScenes.add(apparaat?.id);
      teken();
    }
    else if (t.dataset.scene) {
      $$(`[data-scene]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === t.dataset.scene)));
      void licht({ id: t.dataset.scene }, 'api/scene');
    } else if (t.dataset.doel && apparaat) {
      const nu = doelen.get(apparaat.id) ?? apparaat.klimaat?.doelC ?? (soortVan(apparaat) === 'airco' ? 22 : 20);
      const [min, max] = soortVan(apparaat) === 'airco' ? [16, 30] : [10, 30];
      doelen.set(apparaat.id, Math.max(min, Math.min(max, nu + Number(t.dataset.doel))));
      gezegd.delete(apparaat.id);
      teken();
    } else if (t.dataset.wens && apparaat) {
      $$('[data-wens]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wens === t.dataset.wens)));
      void vraag(kamer, apparaat, t.dataset.wens);
    } else if (t.dataset.modus && apparaat) {
      lampModus.set(apparaat.id, t.dataset.modus);
      teken();
    } else if (t.dataset.kleur && apparaat) {
      wens(apparaat.id, { aan: true });
      void licht({ doel: 'lamp', id: apparaat.id, aan: true, kleur: t.dataset.kleur });
    }
    // Een scherm open, dicht of stoppen (besluit 121).
    else if (t.dataset.scherm && apparaat) {
      const [actie, pct] = t.dataset.scherm.split(':');
      if (actie === 'stand') {
        $$('[data-scherm]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        $$('[data-schermsleep]').forEach((svg) => zetDoek(svg, Number(pct) / 100));
        wens(apparaat.id, { positiePct: naarHa(apparaat, Number(pct)) });
        void licht({ id: apparaat.id, actie: 'stand', standPct: naarHa(apparaat, Number(pct)) }, 'api/scherm');
      } else void licht({ id: apparaat.id, actie }, 'api/scherm');
    }
  });
  blad.addEventListener('input', (e) => {
    if (e.target.dataset.helder != null) {
      $$('[data-helder-tekst]').forEach((el) => (el.textContent = `${e.target.value}%`));
      e.target.classList.remove('uit');
    }
  });
  blad.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.helder || t.dataset.kelvin) wens(t.dataset.helder || t.dataset.kelvin, { aan: true });
    if (t.dataset.helder) void licht({ doel: 'lamp', id: t.dataset.helder, aan: true, helderheidPct: Number(t.value) });
    else if (t.dataset.kelvin) void licht({ doel: 'lamp', id: t.dataset.kelvin, aan: true, kelvin: Number(t.value) });
    t.blur();
  });
  // Het screen: de greep slepen zet het doek, loslaten stuurt de stand (besluit 121).
  blad.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest('[data-schermsleep]');
    if (!svg || !huisData.schermenBedienen) return;
    e.preventDefault();
    bezig = true;
    svg.setPointerCapture(e.pointerId);
    const zet = (ev) => {
      const r = svg.getBoundingClientRect();
      const y = ((ev.clientY - r.top) / r.height) * 290;
      const dicht = Math.round(Math.max(0, Math.min(1, (y - DOEK.boven) / DOEK.hoogte)) * 20) / 20;
      zetDoek(svg, dicht);
      return dicht;
    };
    let laatste = zet(e);
    const beweeg = (ev) => (laatste = zet(ev));
    const klaar = (sturen) => () => {
      svg.removeEventListener('pointermove', beweeg);
      bezig = false;
      if (!sturen) return;
      $$('[data-scherm]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scherm === `stand:${Math.round(laatste * 100)}`)));
      const d = vind()?.apparaat;
      const standPct = d ? naarHa(d, Math.round(laatste * 100)) : Math.round(100 - laatste * 100);
      wens(svg.dataset.schermsleep, { positiePct: standPct });
      void licht({ id: svg.dataset.schermsleep, actie: 'stand', standPct }, 'api/scherm');
    };
    svg.addEventListener('pointermove', beweeg);
    svg.addEventListener('pointerup', klaar(true), { once: true });
    svg.addEventListener('pointercancel', klaar(false), { once: true });
  });
  // Het kleurenwiel: slepen zet de stip, loslaten stuurt de kleur.
  blad.addEventListener('pointerdown', (e) => {
    const wiel = e.target.closest('[data-wiel]');
    if (!wiel || !huisData.lichtBedienen) return;
    bezig = true;
    wiel.setPointerCapture(e.pointerId);
    const zet = (ev) => {
      const r = wiel.getBoundingClientRect();
      const schaal = r.width / 220;
      const x = (ev.clientX - r.left) / schaal - 110;
      // Het wiel loopt met de klok mee (rood rechts, geel onder): y naar beneden.
      const y = (ev.clientY - r.top) / schaal - 110;
      const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const s = Math.min(100, (Math.hypot(x, y) / 110) * 100);
      const stip = wiel.querySelector('i');
      const a = (h * Math.PI) / 180;
      stip.style.left = `${110 + Math.cos(a) * (s / 100) * 110}px`;
      stip.style.top = `${110 + Math.sin(a) * (s / 100) * 110}px`;
      stip.style.background = `hsl(${Math.round(h)} ${Math.round(s)}% 60%)`;
      return [Math.round(h), Math.round(s)];
    };
    let laatste = zet(e);
    const beweeg = (ev) => (laatste = zet(ev));
    const los = () => {
      wiel.removeEventListener('pointermove', beweeg);
      bezig = false;
      wens(wiel.dataset.wiel, { aan: true });
      void licht({ doel: 'lamp', id: wiel.dataset.wiel, aan: true, tint: laatste });
    };
    wiel.addEventListener('pointermove', beweeg);
    wiel.addEventListener('pointerup', los, { once: true });
    wiel.addEventListener('pointercancel', () => {
      wiel.removeEventListener('pointermove', beweeg);
      bezig = false;
    }, { once: true });
  });
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('thuis');
$$('[data-blad]').forEach(koppel);
// Een andere kamer op de etage, of een andere etage.
for (const id of ['podium-wand', 'podium-tel']) {
  const podium = document.getElementById(id);
  const kies = (e) => {
    const k = e.target.closest('[data-kamer]');
    if (k) ga(k.dataset.kamer);
  };
  podium.addEventListener('click', kies);
  podium.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), kies(e)));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-etage]');
  if (!b) return;
  e.preventDefault();
  const etage = huisData?.etages.find((x) => x.id === b.dataset.etage);
  const eerste = etage?.ruimtes.find((r) => r.zoneId) ?? etage?.ruimtes[0];
  if (eerste) ga(eerste.id);
});
addEventListener('hashchange', () => {
  teken();
  if (app.telStand()) scrollTo({ top: 0, behavior: 'smooth' });
});
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
// In het voorbeeldhuis verschuift de klok (besluit 237): dan meteen vers.
addEventListener('voorbeeldklok', () => void laadAlles());
// Lampen, screens en beweging live (21 oktober 2026); een meting hooguit om de vijf tellen, zoals eerst.
app.bijVerandering('huis', laadHuis, { rustig: 5_000 });
app.live((nieuw) => {
  state = nieuw;
  teken();
});

// Een antwoord of voorstel bij Hoe voelt het: het blad opnieuw tekenen (besluit 134).
gevoel.bij(() => teken());

// Met de hand gezet of terug (besluit 238): het huis en het blad opnieuw.
addEventListener('handveranderd', () => void laadAlles());
