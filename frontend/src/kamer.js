/*
 * Kamer, in ontwerp 2 (besluit 104; schetsen Wand-Kamer, Wand-Bedienen, Lamp).
 * Links de etage van dichtbij, met de gekozen kamer; rechts een blad met wat er
 * in de kamer is. Een tik op een apparaat opent zijn eigen blad.
 *
 * Wat werkt en wat niet, eerlijk: lampen, scènes en schermen bedien je echt
 * (besluiten 97, 100 en 121). Klimaat schakelt Smart Climate tot stap B niet;
 * dat blad zegt wat het huis zou doen, in de woorden van de assistent (75).
 * De regeling doet niets met de schermen.
 *
 * Het adres is `kamer.html#<kamer>` of `kamer.html#<kamer>/<apparaat>`.
 */
'use strict';

const { $$, nl, esc, klokVan, haal, deur } = app;

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

async function laadAlles() {
  const [s, h, z, v] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/vandaag')]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  teken();
}

async function laadHuis() {
  try {
    huisData = await haal('api/huis');
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
  for (const etage of etages) {
    for (const kamer of etage.ruimtes ?? []) if (kamer.id === wie) return { etage, kamer, apparaat: kamer.apparaten.find((d) => d.id === apparaat) ?? null };
  }
  // Geen of een onbekende kamer: de eerste met een regeling.
  const eerste = etages.flatMap((e) => (e.ruimtes ?? []).map((k) => ({ etage: e, kamer: k }))).sort((a, b) => Number(!!b.kamer.zoneId) - Number(!!a.kamer.zoneId))[0];
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
};
const soortVan = (d) => (d.soort === 'klimaat' ? (d.klimaat?.kanKoelen ? 'airco' : 'thermostaat') : d.soort);
const icoon = (d) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOON[soortVan(d)] ?? ICOON.thermostaat}</svg>`;

const graden = (c) => (c == null ? '' : `${nl(c)}°`);
function meting(m) {
  if (!m) return '';
  return [m.temperatuurC == null ? null : graden(m.temperatuurC), m.vochtPct == null ? null : `${Math.round(m.vochtPct)}%`].filter(Boolean).join(', ');
}
/** De batterij erbij, als het apparaat er een heeft (besluit 122). */
const accu = (d) => (d.batterijPct == null ? '' : ` · batterij ${d.batterijPct}%`);

function standTekst(d) {
  return standZonderAccu(d) + accu(d);
}
function standZonderAccu(d) {
  if (d.soort === 'meter') return meting(d.meting);
  if (d.soort === 'klimaat') {
    const m = d.meting?.temperatuurC;
    return m == null ? d.stand : `${d.stand}, het is er ${graden(m)}`;
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

  $$('[data-pad]').forEach((el) => (el.innerHTML = `<a href="thuis.html">Huis</a><span aria-hidden="true">›</span><a href="#" data-etage="${esc(etage.id)}">${esc(etage.naam)}</a><span aria-hidden="true">›</span><b>${esc(kamer.naam)}</b>`));
  $$('[data-temp]').forEach((el) => (el.textContent = graden(kamer.temperatuurC)));
  $$('[data-naam]').forEach((el) => (el.textContent = kamer.naam));
  $$('[data-zin]').forEach((el) => (el.textContent = kamer.status?.zin ?? (kamer.lampenAan ? `${kamer.lampenAan === 1 ? 'Eén lamp' : `${kamer.lampenAan} lampen`} aan.` : '')));
  document.title = `${kamer.naam} · Smart Climate`;

  const etages = (huisData.etages ?? []).filter((e) => (e.ruimtes ?? []).length);
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
}

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
  const buitenDelen = huismodel.buiten(buitenRuimtes);
  for (const b of Object.values(buitenDelen)) if (b) b.gekozen = b.id === kamer.id;
  const maand = new Date().getMonth() + 1;
  const zonKw = state?.bewoner?.stromen?.zonKw ?? 0;
  const helder = zon?.heldereLuchtW ?? 0;
  const model = {
    beschrijving: `${toon.naam} van dichtbij, zonder dak${Object.values(buitenDelen).some(Boolean) ? ', met wat er buiten bij hoort' : ''}. ${kamer.naam} is gekozen.`,
    tijd: app.tijdVanDeDag(zon),
    seizoen: maand >= 11 || maand <= 2 ? 'winter' : 'zomer',
    wolken: zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : 0.3) : 0.3,
    zonderDak: true,
    // Een trap in de hal alleen als er een etage boven deze is (besluit 119).
    etages: [{ naam: toon.naam, erBoven: alle.slice(0, alle.indexOf(toon)).some(binnenEtage), kamers: binnen.map((r) => ({ ...huismodel.kamerModel(r, state), gekozen: r.id === kamer.id })) }],
    ...Object.fromEntries(Object.entries(buitenDelen).filter(([, v]) => v)),
  };
  // Met de oprit en de tuin erbij is het beeld breder: dan minder inzoomen, en wat naar links.
  const buitenErbij = Object.values(buitenDelen).some(Boolean);
  if (!app.telStand()) huis.teken(document.getElementById('podium-wand'), model, { breedte: 800, hoogte: 560, zoom: buitenErbij ? 0.92 : 1.2, schuifX: buitenErbij ? -30 : 0, schuifY: -10, tik: true, meubels: true });
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: model.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: 390, hoogte: 280, marge: 0.03, tik: true });
}

/* --------------------------------------------------------- het kamerblad */

function kamerBlad(k) {
  const apps = k.apparaten ?? [];
  const klimaat = apps.filter((d) => d.soort === 'klimaat' || d.soort === 'screen' || d.soort === 'apparaat');
  const lampen = apps.filter((d) => d.soort === 'licht');
  const meters = apps.filter((d) => d.soort === 'meter');
  const cameras = apps.filter((d) => d.soort === 'camera');
  const bedienen = huisData.lichtBedienen === true;
  const rij = (d) => `<button type="button" class="rij${d.aan ? ' aan' : ''}" data-open="${esc(d.id)}">${icoon(d)}<span class="naam"><b>${esc(d.naam)}</b><span>${esc(standTekst(d))}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  const lamp = (d) => `
    <div class="rij${d.aan ? ' aan' : ''}" style="cursor: default">
      <span class="gloei" style="background: ${d.aan ? huismodel.kleurVanLicht(d) : '#3a4656'}; ${d.aan ? `box-shadow: 0 0 12px ${huismodel.kleurVanLicht(d)}` : ''}"></span>
      <button type="button" class="naam" data-open="${esc(d.id)}" style="background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: 0; cursor: pointer"><b>${esc(d.naam)}</b><span>${esc(d.stand + accu(d))}</span></button>
      <button type="button" class="schakel" role="switch" aria-checked="${d.aan}" aria-label="${esc(d.naam)}" data-schakel="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></button>
    </div>`;
  // De samenvatting kent alleen klimaat; een draaiende droger hoort er ook bij.
  const draait = apps.filter((d) => d.soort === 'apparaat' && d.aan).map((d) => `${d.naam} draait`);
  const klimaatZin = k.samenvatting?.klimaat ?? '';
  const onder = draait.length ? [klimaatZin === 'Er draait niets' ? '' : klimaatZin, ...draait].filter(Boolean).join('. ') : klimaatZin;
  const delen = [
    `<div class="bladkop"><div><h2 class="kop-2">${esc(k.naam)}</h2><p class="klein" style="margin: 4px 0 0">${esc(onder)}</p></div></div>`,
    klimaat.length ? `<div><h3 class="kop-3" style="margin-bottom: 4px">${klimaat.some((d) => d.soort === 'klimaat') ? 'Klimaat' : 'Apparaten'}</h3>${klimaat.map(rij).join('')}</div>` : '',
    lampen.length
      ? `<div><div class="groepkop"><h3 class="kop-3">Licht</h3>${bedienen && lampen.some((d) => d.aan) ? '<button type="button" class="pil" data-alles-uit style="height: 30px; font-size: 13px; border: 0; color: inherit; cursor: pointer">Alles uit</button>' : ''}</div>${lampen.map(lamp).join('')}${bedienen ? '' : '<p class="mini" style="margin: 6px 0 0">Licht bedienen staat uit voor deze weergave; het kan via Home Assistant.</p>'}</div>`
      : '',
    cameras.length ? `<div><h3 class="kop-3" style="margin-bottom: 8px">${cameras.length === 1 ? 'Camera' : 'Camera’s'}</h3>${cameras.map((c) => `<div style="margin-bottom: 10px">${cameraBox(c)}</div>`).join('')}</div>` : '',
    meters.length ? `<div><h3 class="kop-3" style="margin-bottom: 4px">Meters</h3>${meters.map(rij).join('')}</div>` : '',
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
  alles = [...alles].sort((a, b) => (b.gebruiktMs ?? 0) - (a.gebruiktMs ?? 0) || a.naam.localeCompare(b.naam, 'nl'));
  if (!alles.length) return '';
  const open = alleScenes.has(d.id);
  const lijst = open ? alles : alles.slice(0, 6);
  const knop = (sc) => {
    const achter = sc.plaatje
      ? `background-image: url('${esc(sc.plaatje)}')`
      : sc.kleuren?.length
        ? `background: linear-gradient(160deg, ${sc.kleuren.map(esc).join(', ')}, #3a2a18)`
        : 'background: linear-gradient(160deg, #3a4656, #1d2633)';
    return `<button type="button" class="scene" data-scene="${esc(sc.id)}" aria-pressed="${!!sc.actief}" style="${achter}" ${huisData.lichtBedienen ? '' : 'disabled'}><span>${esc(sc.naam)}</span></button>`;
  };
  const meer = alles.length > 6 ? `<button type="button" class="pil" data-meer-scenes style="border: 0; color: inherit; cursor: pointer; margin-top: 8px">${open ? 'Minder scènes' : `Alle ${alles.length} scènes`}</button>` : '';
  return `<div><div class="groepkop"><h3 class="kop-3">Scènes</h3><span class="mini">uit Hue</span></div><div class="scenes">${lijst.map(knop).join('')}</div>${meer}</div>`;
}

/* ----------------------------------------------------- de apparaatbladen */

function apparaatBlad(k, d) {
  const terug = `<button type="button" class="terug" data-terug>‹ ${esc(k.naam)}</button>`;
  const soort = soortVan(d);
  let inhoud;
  if (soort === 'airco') inhoud = aircoBlad(k, d);
  else if (soort === 'thermostaat') inhoud = nestBlad(k, d);
  else if (soort === 'screen') inhoud = screenBlad(k, d);
  else if (soort === 'licht') inhoud = lampBlad(k, d);
  else if (soort === 'camera') inhoud = cameraBlad(d);
  else if (soort === 'apparaat') inhoud = `${kopVan(d, 'zon-t')}<p class="klein" style="margin: 0">Op zon: Smart Climate kiest het moment, starten doe je op het apparaat zelf.</p><a class="pil" href="apparaten.html" style="align-self: start">Naar Apparaten</a>`;
  else inhoud = `${kopVan(d, '')}<p class="klein" style="margin: 0">${d.meetKamer ? 'Deze meter geeft de temperatuur waarop Smart Climate deze kamer regelt.' : 'Alleen informatie; aan een meter valt niets te bedienen.'}</p>`;
  return `${terug}${inhoud}`;
}

const kopVan = (d, toon, rechts = '') => `<div class="bladkop"><div><h2 class="kop-2">${esc(d.naam)}</h2><p class="klein ${toon}" style="margin: 4px 0 0">${esc(standTekst(d))}</p></div>${rechts}</div>`;

/** De strook van vandaag voor een klimaatapparaat: wanneer het draaide, en licht wanneer Smart Climate het zou doen. */
function strookVandaag(d, kleur) {
  const a = (vandaag?.apparaten ?? []).find((x) => x.actuatorId === d.actuatorId);
  if (!vandaag || !a) return '';
  const t0 = vandaag.vanMs;
  const pct = (t) => Math.max(0, Math.min(100, ((t - t0) / 86_400_000) * 100));
  const blok = (s, licht) => `<i style="left: ${pct(s.vanMs).toFixed(2)}%; width: ${Math.max(0.8, pct(s.totMs) - pct(s.vanMs)).toFixed(2)}%; background: ${kleur}; ${licht ? 'opacity: 0.32' : ''}"></i>`;
  const tijden = a.huidig.slice(-3).map((s) => `${klokVan(s.vanMs)}–${klokVan(s.totMs)}`);
  const zin = a.huidig.length ? `Draaide vandaag ${tijden.join(', ')}.` : 'Draaide vandaag nog niet.';
  return `<div><b style="font-size: 14px">Vandaag</b><p class="mini" style="margin: 2px 0 8px">${esc(zin)}</p><div class="strook">${a.smartClimate.map((s) => blok(s, true)).join('')}${a.huidig.map((s) => blok(s, false)).join('')}<span class="nu" style="left: ${pct(Date.now()).toFixed(2)}%"></span></div><div class="uren"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div><p class="mini" style="margin: 6px 0 0">Vol: wat het apparaat deed. Licht: wat Smart Climate zou doen.</p></div>`;
}

const MEEKIJKEN = 'Smart Climate kijkt nog mee en schakelt dit apparaat nog niet zelf. Kies een stand: hier staat dan wat het huis zou doen.';

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
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="Doel ${nl(doel)} graden${nu == null ? '' : `, nu ${nl(nu)} graden`}">
    <defs><linearGradient id="ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${kleur}"/><stop offset="1" stop-color="#8F86FF"/></linearGradient>
      <radialGradient id="koud"><stop offset="0" stop-color="${kleur}" stop-opacity="${d.aan ? 0.28 : 0.1}"/><stop offset="1" stop-color="${kleur}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="150" cy="150" r="140" fill="url(#koud)"/>
    <path d="M ${sx} ${sy} A 118 118 0 1 1 ${ex} ${ey}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="16" stroke-linecap="round"/>
    <path d="M ${sx} ${sy} A 118 118 0 ${groot} 1 ${dx} ${dy}" fill="none" stroke="url(#ring)" stroke-width="16" stroke-linecap="round"/>
    <circle cx="${dx}" cy="${dy}" r="13" fill="#EEF3F7"/>
    ${nuStreep}
    <g font-family="Figtree" font-size="11" fill="#7F8E9C"><text x="54" y="262" text-anchor="middle">16°</text><text x="246" y="262" text-anchor="middle">30°</text></g>
    <text x="150" y="146" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="58" fill="#EEF3F7">${nl(doel)}°</text>
    <text x="150" y="172" text-anchor="middle" font-family="Figtree" font-size="13" fill="#B8C4CF">${nu == null ? 'doel' : `doel, het is er ${nl(nu)}°`}</text>
    ${lucht}
  </svg>`;
  const kan = d.klimaat ?? { kanKoelen: true, kanVerwarmen: true };
  const keuzes = [kan.kanKoelen ? ['Koelen', 'koelen'] : null, kan.kanVerwarmen ? ['Verwarmen', 'verwarmen'] : null, ['Uit', 'uit']].filter(Boolean);
  return `${kopVan(d, warm ? 'gloed-t' : d.aan ? 'ijs-t' : '')}
    <div class="beeld">${svg}</div>
    <div class="doelrij"><button type="button" class="rond" data-doel="-0.5" aria-label="Kouder">−</button><span class="mini">doel</span><button type="button" class="rond" data-doel="0.5" aria-label="Warmer">+</button></div>
    ${k.zoneId ? `<div class="keuze" role="group" aria-label="Wat zou het huis doen">${keuzes.map(([l, w]) => `<button type="button" data-wens="${w}">${l}</button>`).join('')}</div>` : '<p class="mini" style="margin: 0">Deze kamer heeft geen regeling; Smart Climate stuurt dit apparaat hier niet.</p>'}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span data-gezegd>${esc(gezegd.get(d.id) ?? MEEKIJKEN)}</span></div>
    ${strookVandaag(d, kleur)}`;
}

function nestBlad(k, d) {
  const doel = doelen.get(d.id) ?? d.klimaat?.doelC ?? 20;
  const nu = d.meting?.temperatuurC ?? k.temperatuurC;
  const brandt = /verwarmt|warmt/.test(d.klimaat?.actie ?? d.stand);
  const tikken = [];
  for (let i = 0; i < 60; i++) {
    const a = ((-225 + (i / 59) * 270) * Math.PI) / 180;
    const r2 = i % 5 === 0 ? 80 : 85;
    const aan = 10 + (i / 59) * 20 <= doel;
    tikken.push(`<line x1="${(150 + Math.cos(a) * 92).toFixed(1)}" y1="${(145 + Math.sin(a) * 92).toFixed(1)}" x2="${(150 + Math.cos(a) * r2).toFixed(1)}" y2="${(145 + Math.sin(a) * r2).toFixed(1)}" stroke="${aan ? '#FF7A4D' : 'rgba(255,255,255,0.25)'}"/>`);
  }
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="Thermostaat: doel ${nl(doel)} graden${nu == null ? '' : `, nu ${nl(nu)} graden`}${brandt ? ', verwarmt' : ''}">
    <defs><radialGradient id="schijf" cx="0.45" cy="0.4"><stop offset="0" stop-color="#2a3442"/><stop offset="1" stop-color="#0e141c"/></radialGradient>
      <radialGradient id="gloed"><stop offset="0.6" stop-color="#FF7A4D" stop-opacity="${brandt ? 0.45 : 0}"/><stop offset="1" stop-color="#FF7A4D" stop-opacity="0"/></radialGradient></defs>
    <circle cx="150" cy="145" r="140" fill="url(#gloed)"/>
    <circle cx="150" cy="145" r="112" fill="#c9d2db"/>
    <circle cx="150" cy="145" r="104" fill="url(#schijf)"/>
    <g stroke-width="3" stroke-linecap="round">${tikken.join('')}</g>
    <text x="150" y="150" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="600" font-size="56" fill="#EEF3F7">${nl(doel, Number.isInteger(doel) ? 0 : 1)}</text>
    <text x="150" y="176" text-anchor="middle" font-family="Figtree" font-size="13" fill="${brandt ? '#FFB090' : '#B8C4CF'}">${brandt ? 'verwarmt' : 'staat uit'}${nu == null ? '' : `, nu ${nl(nu)}°`}</text>
  </svg>`;
  return `${kopVan(d, brandt ? 'gloed-t' : '')}
    <div class="beeld">${svg}</div>
    <div class="doelrij"><button type="button" class="rond" data-doel="-0.5" aria-label="Kouder">−</button><span class="mini">doel</span><button type="button" class="rond" data-doel="0.5" aria-label="Warmer">+</button></div>
    ${k.zoneId ? `<div class="keuze" role="group" aria-label="Wat zou het huis doen"><button type="button" data-wens="verwarmen">Verwarmen</button><button type="button" data-wens="uit">Uit</button></div>` : ''}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span data-gezegd>${esc(gezegd.get(d.id) ?? MEEKIJKEN)}</span></div>
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
    tekst.textContent = h > 0 ? `${Math.round(dicht * 100)}%` : 'open';
  }
}

function screenBlad(k, d) {
  // Somfy RTS meldt zijn stand niet terug (besluit 121): dan geen stand in de tekening.
  const terug = d.scherm?.terugmelding !== false;
  const sleep = terug && d.scherm?.standKiezen === true;
  const bedienen = huisData.schermenBedienen === true;
  const open = terug ? d.positiePct ?? (d.aan ? 0 : 100) : 100;
  const dicht = 1 - open / 100;
  const doekH = Math.round(DOEK.hoogte * dicht);
  const zonNu = (zon?.gevels ?? []).filter((g) => g.inDeZon).map((g) => g.naam.toLowerCase());
  const svg = `<svg viewBox="0 0 300 290" role="img" aria-label="Het raam met de screen ${Math.round(dicht * 100)} procent dicht" ${sleep && bedienen ? `data-schermsleep="${esc(d.id)}" style="touch-action: none; cursor: ns-resize"` : ''}>
    <defs><linearGradient id="raamlucht" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d8fc0"/><stop offset="1" stop-color="#9cc1e0"/></linearGradient>
      <pattern id="doek" width="8" height="6" patternUnits="userSpaceOnUse"><rect width="8" height="6" fill="#3d4a5a"/><rect width="8" height="1.2" fill="#4c5b6d"/></pattern>
      <linearGradient id="straal" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.55"/><stop offset="1" stop-color="#F7B548" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="300" height="290" rx="16" fill="#26313f"/>
    ${zonNu.length ? '<polygon points="300,0 300,120 120,290 40,290" fill="url(#straal)" opacity="0.6"/><circle cx="282" cy="22" r="14" fill="#FFD27A"/>' : ''}
    <rect x="46" y="26" width="208" height="20" rx="5" fill="#4a5768"/>
    <rect x="56" y="46" width="188" height="214" rx="4" fill="url(#raamlucht)" stroke="#6b7a8c" stroke-width="6"/>
    <line x1="150" y1="46" x2="150" y2="260" stroke="#6b7a8c" stroke-width="5"/>
    <rect x="64" y="160" width="76" height="92" fill="#ffffff" opacity="0.12"/>
    <rect data-doek x="52" y="46" width="196" height="${doekH}" fill="url(#doek)" ${doekH > 0 ? '' : 'style="display: none"'}/>
    <rect data-lat x="48" y="${42 + doekH}" width="204" height="9" rx="4" fill="#5b6a7c"/>
    ${sleep && bedienen ? `<g data-greep transform="translate(0 ${doekH})"><rect x="126" y="38" width="48" height="17" rx="8.5" fill="#EEF3F7"/><line x1="138" y1="46.5" x2="162" y2="46.5" stroke="#0b1424" stroke-width="2" stroke-linecap="round"/></g>` : ''}
    <line x1="270" y1="46" x2="270" y2="260" stroke="#ffffff" stroke-opacity="0.15" stroke-width="4" stroke-linecap="round"/>
    <line data-standlijn x1="270" y1="46" x2="270" y2="${46 + doekH}" stroke="#EEF3F7" stroke-width="4" stroke-linecap="round" ${doekH > 0 && terug ? '' : 'style="display: none"'}/>
    <text data-standtekst x="262" y="${Math.min(250, 72 + doekH)}" text-anchor="end" font-family="Bricolage Grotesque" font-weight="600" font-size="20" fill="#EEF3F7">${!terug ? 'stand onbekend' : doekH > 0 ? `${Math.round(dicht * 100)}%` : 'open'}</text>
  </svg>`;
  const pil = zonNu.length ? `<span class="pil zon-t" style="height: 30px; font-size: 12.5px"><span class="stip" style="background: var(--zon)"></span>Zon op deze gevel</span>` : '';
  // Open, Half, de stand van nu en Dicht; zonder stand kiezen Open, Stop en Dicht.
  const nu = Math.round(dicht * 100);
  const keuzes = sleep
    ? [['stand:0', 'Open', nu === 0], ['stand:50', 'Half', nu === 50], ...(nu !== 0 && nu !== 50 && nu !== 100 ? [[`stand:${nu}`, `${nu}%`, true]] : []), ['stand:100', 'Dicht', nu === 100]]
    : [['open', 'Open', false], ['stop', 'Stop', false], ['dicht', 'Dicht', false]];
  const knoppen = `<div class="keuze" style="grid-template-columns: repeat(${keuzes.length}, 1fr)" role="group" aria-label="${esc(d.naam)} bedienen">${keuzes.map(([a, t, aan]) => `<button type="button" data-scherm="${a}" aria-pressed="${aan}" ${bedienen ? '' : 'disabled'}>${t}</button>`).join('')}</div>`;
  const uitleg = !terug
    ? 'Dit scherm meldt zijn stand niet terug (Somfy RTS). Open, dicht en stop werken; waar hij staat, weet de app niet. Daarom gaat hij ook later niet mee in de regeling.'
    : sleep
      ? 'Sleep de greep omhoog of omlaag, of kies een stand. De regeling doet er niets mee.'
      : 'Je bedient het scherm hier zelf. De regeling doet er niets mee.';
  return `${kopVan(d, '', pil)}
    <div class="beeld">${svg}</div>
    ${bedienen ? knoppen : ''}
    <div class="regel"><span class="bol" style="width: 18px; height: 18px; margin-top: 1px; flex: none"></span><span>${bedienen ? uitleg : 'Schermen bedienen staat uit. Zet het aan bij Functies.'}</span></div>
    <p class="mini" data-fout style="margin: 0; color: var(--gloed)"></p>`;
}

/*
 * De camera (besluit 106): het live beeld, via de dienst bij Home Assistant
 * opgehaald. Kijken vraagt de inlog; zonder staat er de weg ernaartoe.
 */
function cameraBox(d) {
  return `<div class="camerabeeld" data-camera="${esc(d.id)}" data-cameranaam="${esc(d.naam)}"><p class="mini">Even laden…</p></div>`;
}

function cameraBlad(d) {
  return `${kopVan(d, '')}
    ${cameraBox(d)}
    <p class="mini" style="margin: 0">Tik op het beeld om het schermvullend te zien. Alleen kijken: het beeld komt via Home Assistant en wordt nergens bewaard.</p>`;
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
      box.innerHTML = `<p class="klein" style="margin: 0 0 12px">Camerabeelden zijn alleen te zien als je bent ingelogd met je Home Assistant-account.</p><a class="pil" href="auth/login?terug=${terug}">Inloggen om te kijken</a>`;
      return;
    }
    if (!res.ok) {
      const uit = await res.json().catch(() => ({}));
      box.innerHTML = `<p class="klein" style="margin: 0">${esc(uit.fout ?? uit.wachten ?? 'De camera geeft nu geen beeld.')}</p>`;
      return;
    }
    // Eerst het plaatje, dan live erover: zo staat er meteen iets.
    const plaatje = URL.createObjectURL(await res.blob());
    box.dataset.gestart = '1';
    box.innerHTML = `<img alt="Live beeld van ${esc(naam)}" src="${plaatje}"><span class="live"><span class="stip"></span>${esc(naam)}</span><button type="button" class="vol" data-vol aria-label="Schermvullend">⤢</button>`;
    const img = box.querySelector('img');
    const live = new Image();
    live.alt = img.alt;
    live.onload = () => {
      if (box.isConnected) img.replaceWith(live);
      else live.src = '';
    };
    live.onerror = () => box.querySelector('.live')?.replaceChildren('Plaatje');
    live.src = `api/camera?id=${encodeURIComponent(id)}&live=1`;
  } catch {
    if (box.isConnected) box.innerHTML = '<p class="klein" style="margin: 0">Geen verbinding met Smart Climate.</p>';
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
  if (d.dimbaar) delen.push(`<div><div class="feit" style="margin-bottom: 8px"><b>Helderheid</b><span data-helder-tekst>${d.aan ? `${d.helderheidPct ?? 100}%` : 'uit'}</span></div><input class="schuif" type="range" min="1" max="100" step="1" value="${d.helderheidPct ?? 100}" aria-label="Helderheid van ${esc(d.naam)}" data-helder="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></div>`);
  if (wit && l.kleur) delen.push(`<div class="keuze" role="group" aria-label="Wit of kleur" style="grid-template-columns: 1fr 1fr"><button type="button" data-modus="wit" aria-pressed="${modus === 'wit'}">Wit</button><button type="button" data-modus="kleur" aria-pressed="${modus === 'kleur'}">Kleur</button></div>`);
  if (wit && (modus === 'wit' || !l.kleur)) {
    delen.push(`<div><div class="feit" style="margin-bottom: 8px"><b>Wit</b><span>warm tot koel</span></div><input class="schuif wit" type="range" min="${wit.minK}" max="${wit.maxK}" step="50" value="${l.kelvin ?? Math.max(wit.minK, Math.min(wit.maxK, 2700))}" aria-label="Kleur wit van ${esc(d.naam)}" data-kelvin="${esc(d.id)}" ${bedienen ? '' : 'disabled'}></div>`);
  } else if (!wit && d.kleurtemp) {
    delen.push(`<div class="keuze" role="group" aria-label="Kleur wit" style="grid-template-columns: repeat(3, 1fr)"><button type="button" data-kleur="warm">Warm</button><button type="button" data-kleur="neutraal">Neutraal</button><button type="button" data-kleur="koel">Koel</button></div>`);
  }
  if (l.kleur && modus === 'kleur') {
    const [h, s] = l.tint ?? [30, 80];
    const a = (h * Math.PI) / 180;
    const r = (Math.min(100, s) / 100) * 110;
    delen.push(`<div class="wiel" role="slider" aria-label="Kleur van ${esc(d.naam)}" aria-valuetext="tint ${Math.round(h)}, verzadiging ${Math.round(s)}" data-wiel="${esc(d.id)}"><i style="left: ${(110 + Math.cos(a) * r).toFixed(1)}px; top: ${(110 + Math.sin(a) * r).toFixed(1)}px; background: hsl(${Math.round(h)} ${Math.round(s)}% 60%)"></i></div>`);
  }
  if (!bedienen) delen.push('<p class="mini" style="margin: 0">Licht bedienen staat uit voor deze weergave; het kan via Home Assistant.</p>');
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
      $$('[data-fout]').forEach((el) => (el.textContent = uit.fout ?? uit.wachten ?? 'Niet gelukt.'));
      return;
    }
    // Even wachten tot Home Assistant de nieuwe stand doorgeeft.
    setTimeout(() => void laadHuis(), 800);
  } catch {
    $$('[data-fout]').forEach((el) => (el.textContent = 'Geen verbinding met Smart Climate.'));
  }
}

async function vraag(kamer, d, wens) {
  const doel = doelen.get(d.id) ?? d.klimaat?.doelC;
  const params = new URLSearchParams({ v: 'doe', kamer: kamer.zoneId, wens });
  if (wens !== 'uit' && doel != null) params.set('temperatuur', String(doel));
  gezegd.set(d.id, 'Even kijken…');
  $$('[data-gezegd]').forEach((el) => (el.textContent = 'Even kijken…'));
  try {
    const res = await fetch(`api/vraag?${params}`);
    const uit = await res.json();
    gezegd.set(d.id, res.ok ? uit.antwoord : uit.fout ?? 'Geen antwoord.');
  } catch {
    gezegd.set(d.id, 'Geen verbinding met Smart Climate.');
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
      t.setAttribute('aria-checked', String(!d?.aan));
      void licht({ doel: 'lamp', id: t.dataset.schakel, aan: !d?.aan });
    } else if (t.hasAttribute('data-alles-uit')) void licht({ doel: 'kamer', id: kamer.id, aan: false });
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
    } else if (t.dataset.kleur && apparaat) void licht({ doel: 'lamp', id: apparaat.id, aan: true, kleur: t.dataset.kleur });
    // Een scherm open, dicht of stoppen (besluit 121).
    else if (t.dataset.scherm && apparaat) {
      const [actie, pct] = t.dataset.scherm.split(':');
      if (actie === 'stand') {
        $$('[data-scherm]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        $$('[data-schermsleep]').forEach((svg) => zetDoek(svg, Number(pct) / 100));
        void licht({ id: apparaat.id, actie: 'stand', standPct: 100 - Number(pct) }, 'api/scherm');
      } else void licht({ id: apparaat.id, actie }, 'api/scherm');
    }
  });
  blad.addEventListener('input', (e) => {
    if (e.target.dataset.helder != null) $$('[data-helder-tekst]').forEach((el) => (el.textContent = `${e.target.value}%`));
  });
  blad.addEventListener('change', (e) => {
    const t = e.target;
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
      void licht({ id: svg.dataset.schermsleep, actie: 'stand', standPct: Math.round(100 - laatste * 100) }, 'api/scherm');
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
app.live((nieuw) => {
  state = nieuw;
  teken();
});
