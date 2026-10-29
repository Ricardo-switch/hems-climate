/*
 * Functies (besluiten 109, 111 en 130). Welke camera's de app toont en met
 * welk beeld, welke melder de deurbel is, of je licht en screens bedient in de
 * app, en waar het weer vandaan komt. Praten met je huis (besluit 148): welk
 * taalmodel uit Home Assistant de assistent laat praten in eigen woorden, en of
 * hij met een zin mag bedienen. Meldingen (besluit 149): wanneer een batterij of
 * een airco-filter een melding geeft. In de opbouw van elke groep (130): links
 * de delen, wat je kiest wordt meteen bewaard. Bewaren vraagt een beheerder.
 * De dienst doet een voorstel uit wat Home Assistant heeft.
 *
 * Onder Weergave (besluit 167): dit scherm (volledig scherm, per apparaat),
 * het always-on display van de wand, en wanneer het scherm uitgaat. Dat stond
 * eerst bij het potlood op Thuis ("Als niemand kijkt") en bij Bewoners en
 * toegang. Licht en screens heeft per kamer de lampen, scènes en screens, met
 * een schakelaar om er een uit de app te halen.
 */
'use strict';

const { $$, esc, haal } = app;

let info = null;
let concept = null;
let zon = null;
/** Het laatste proefantwoord van het taalmodel (besluit 148): vast naast eigen woorden. */
let proef = null;
/** De voorkeuren (besluit 164): wat de wand doet als niemand kijkt, en of jij dat mag veranderen. */
let voorkeur = null;
/** Het huis en de indeling: de lampen, scènes en screens per kamer, en de bewegingsmelders. */
let huisData = null;
let indeling = null;
/** Op je startscherm: of de eigen poort in Tailscale openstaat, en op welk adres. */
let startscherm = null;
/** Hoe de schermen luisteren (besluit 208): wie het wekwoord hoort, en hoe vaak het huis vandaag wakker werd. */
let luisterStand = null;

async function laad() {
  const [f, z, v, h, i, st] = await Promise.allSettled([haal('api/functies'), haal('api/zon'), haal('api/voorkeuren'), haal('api/huis'), haal('api/indeling'), haal('api/startscherm'), haal('api/luister-stand').then((x) => (luisterStand = x))]);
  if (st.status === 'fulfilled') startscherm = st.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') voorkeur = v.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (i.status === 'fulfilled') indeling = i.value;
  if (f.status === 'fulfilled') {
    info = f.value;
    concept = JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel));
    concept.weer ??= info.voorstel.weer;
    concept.licht ??= info.voorstel.licht;
    concept.schermen ??= info.voorstel.schermen ?? { bedienen: true };
    concept.praten ??= info.voorstel.praten ?? { taalmodel: null, bedienen: true };
    concept.praten.spraak ??= null;
    concept.meldingen ??= info.voorstel.meldingen ?? { batterij: 10, filter: 10 };
  }
  teken();
}

/* ------------------------------------------------------------ tekenen */

function keuzes(label, sleutel, opties, huidig, uit = false) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, x]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${JSON.stringify(w) === JSON.stringify(huidig)}" ${uit ? 'disabled' : ''}>${esc(x)}</button>`).join('')}</div>`;
}
const aanUit = () => [[true, t('functies.aan')], [false, t('functies.uit')]];
/** Een uitleg met eigen HTML uit de teksten (<b>, <i>, <code>): wat erin komt, wordt ontsnapt. */
const metHtml = (sleutel, p = {}) => t(sleutel, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, esc(v)])));

/** Het beeld dat van deze camera in de lijst staat, of null als hij niet getoond wordt. */
const gekozenBeeld = (c) => c.beelden.find((b) => concept.cameras.lijst.includes(b.id))?.id ?? null;

function cameras() {
  const lijst = info.gevonden.cameras;
  const aan = concept.cameras.aan;
  const rijen = lijst
    .map((c, i) => {
      const beeld = gekozenBeeld(c);
      const opties = [[null, t('functies.nietTonen')], ...c.beelden.map((b) => [b.id, b.naam.charAt(0).toUpperCase() + b.naam.slice(1)])];
      return `<div class="regelrij" style="flex-direction: column; align-items: stretch"><div class="l"><b>${esc(c.naam)}</b><span>${esc(t(beeld ? 'functies.inKamer' : 'functies.nietInApp'))}</span></div>${keuzes(t('functies.beeldVan', { naam: c.naam }), `camera:${i}`, opties, beeld, !aan)}</div>`;
    })
    .join('');
  return `<h2 class="kop-2">${esc(t('functies.cameras'))}</h2>
    ${keuzes(t('functies.camerasInApp'), 'camerasAan', aanUit(), aan)}
    <div>${lijst.length ? rijen : `<p class="uitleg">${esc(t('functies.geenCameras'))}</p>`}</div>
    <p class="mini">${esc(t('functies.vloeiend'))}</p>`;
}

function deurbel() {
  const d = concept.deurbel;
  const melders = info.gevonden.melders;
  const beelden = info.gevonden.cameras.flatMap((c) => c.beelden.map((b) => ({ id: b.id, naam: c.beelden.length > 1 ? `${c.naam}, ${b.naam}` : c.naam })));
  const opt = (lijst, huidig, leeg) => `<option value="">${esc(leeg)}</option>${lijst.map((x) => `<option value="${esc(x.id)}" ${x.id === huidig ? 'selected' : ''}>${esc(x.naam)}</option>`).join('')}`;
  const zeker = melders.filter((m) => m.zeker);
  const misschien = melders.filter((m) => !m.zeker);
  const melderOpties = `<option value="">${esc(t('functies.kiesMelder'))}</option>${zeker.length ? `<optgroup label="${esc(t('functies.eenDeurbel'))}">${zeker.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}${misschien.length ? `<optgroup label="${esc(t('functies.heetDeurbel'))}">${misschien.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}`;
  const uit = !d.aan;
  return `<h2 class="kop-2">${esc(t('functies.deurbel'))}</h2>
    ${keuzes(t('functies.deurbel'), 'belAan', aanUit(), d.aan, !melders.length)}
    ${melders.length ? '' : `<p class="uitleg">${esc(t('functies.geenDeurbel'))}</p>`}
    <label class="veldnaam">${esc(t('functies.melder'))}<select class="invoer" data-veld="melder" ${uit ? 'disabled' : ''}>${melderOpties}</select></label>
    <label class="veldnaam">${esc(t('functies.beeld'))}<select class="invoer" data-veld="camera" ${uit ? 'disabled' : ''}>${opt(beelden, d.camera, t('functies.kiesCamera'))}</select></label>
    <span class="veldnaam">${esc(t('functies.schermAan'))}</span>
    ${keuzes(t('functies.schermAanLabel'), 'schermAan', [[true, t('functies.ja')], [false, t('functies.nee')]], d.schermAan, uit)}
    <span class="veldnaam">${esc(t('functies.hoeLang'))}</span>
    ${keuzes(t('functies.hoeLangLabel'), 'seconden', [60, 120, 300].map((s) => [s, t('functies.minuut', { n: s / 60 })]), d.seconden, uit)}`;
}

/*
 * Licht en screens (besluit 167): bedienen in de app of alleen kijken, en per
 * kamer de lampen, scènes en screens, met een schakelaar om er een uit de app
 * te halen (dat is verbergen, zoals bij Kamers en indeling). Bij een screen of
 * hij zijn stand terugmeldt: alleen zo'n screen mag later in de regeling.
 * Smart Climate regelt licht en screens niet; dat doe je zelf.
 */
function lichtPerKamer() {
  const lay = indeling?.indeling ?? indeling?.voorstel;
  const weg = new Set(lay?.verborgen ?? []);
  const kamers = [];
  for (const e of huisData?.etages ?? []) {
    for (const r of e.ruimtes ?? []) {
      const dingen = (r.apparaten ?? []).filter((d) => d.soort === 'licht' || d.soort === 'screen');
      kamers.push({ id: r.id, naam: r.naam, dingen, scenes: r.scenes ?? [] });
    }
  }
  // Wat verborgen is, staat bij de kamer waar het stond.
  for (const v of huisData?.verborgen ?? []) {
    if (v.soort !== 'licht' && v.soort !== 'screen') continue;
    const k = kamers.find((x) => x.id === lay?.apparaten?.[v.id]?.kamer);
    if (k) k.dingen.push({ ...v, verborgen: true });
  }
  return kamers.filter((k) => k.dingen.length || k.scenes.length).map((k) => ({ ...k, dingen: k.dingen.map((d) => ({ ...d, verborgen: d.verborgen || weg.has(d.id) })) }));
}

function licht() {
  const mag = info.lichtMogelijk === true;
  const schermMag = info.schermMogelijk === true;
  const kamers = lichtPerKamer();
  const bedienen = () => [[true, t('functies.bedienen')], [false, t('functies.kijken')]];
  // Per kamer een knopje per lamp en screen: aan staat hij in de app. Compact, zodat het op de wand past.
  const knopje = (d) => {
    const terug = d.soort === 'screen' ? t(d.scherm?.terugmelding ? 'functies.meldtTerug' : d.scherm?.terugmelding === false ? 'functies.geenTerug' : 'functies.screen') : '';
    return `<button type="button" data-in-app="${esc(d.id)}" aria-pressed="${!d.verborgen}" aria-label="${esc(t('functies.inApp', { naam: d.naam }))}">${esc(d.naam)}${terug ? `<small> · ${esc(terug)}</small>` : ''}</button>`;
  };
  const lijst = kamers
    .map((k) => `<div class="lichtkamer"><b>${esc(k.naam)}</b>${k.dingen.length ? `<div class="keuzes">${k.dingen.map(knopje).join('')}</div>` : ''}${k.scenes.length ? `<span class="mini">${esc(t('functies.scenes', { namen: k.scenes.map((x) => x.naam).join(', ') }))}</span>` : ''}</div>`)
    .join('');
  // Alleen wat deze installatie toestaat (besluit 130): een knop die niets kan, staat er niet.
  return `<h2 class="kop-2">${esc(t('functies.licht'))}</h2>
    ${mag ? `<span class="veldnaam">${esc(t('functies.lichtScenes'))}</span>${keuzes(t('functies.lichtBedienen'), 'lichtAan', bedienen(), concept.licht.bedienen)}` : ''}
    ${schermMag ? `<span class="veldnaam">${esc(t('functies.screens'))}</span>${keuzes(t('functies.schermenBedienen'), 'schermenAan', bedienen(), concept.schermen.bedienen)}` : ''}
    <p class="mini">${esc(t(mag || schermMag ? 'functies.bedienenHuis' : 'functies.nietToegestaan'))}</p>
    ${lijst ? `<h3 class="kop-3" style="margin: 8px 0 0">${esc(t('functies.inDeApp'))}</h3><p class="mini">${esc(t('functies.tikUit'))}${kamers.some((k) => k.dingen.some((d) => d.soort === 'screen')) ? ` ${esc(t('functies.somfy'))}` : ''}</p><div class="lichtkamers">${lijst}</div>` : ''}`;
}

/* ------------------------------------------------------------ weergave */

const NIEMAND = { nacht: true, van: '23:00', tot: '07:00', rustMin: 5, aanMin: 5, weg: true, dag: true, avond: true, helderDag: 75, helderAvond: 25, melder: null };
const niemandNu = () => ({ ...NIEMAND, ...voorkeur?.wand?.niemand });
const magWand = () => !!voorkeur?.wand?.magAanpassen;
const schakel = (aan, data, label, uit = false) => `<button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="${esc(label)}" ${data} ${uit ? 'disabled' : ''}></button>`;
const nkKeuzes = (label, attr, opties, huidig, uit = false) => `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, x]) => `<button type="button" data-${attr}="${w}" aria-pressed="${w === huidig}" ${uit ? 'disabled' : ''}>${esc(x)}</button>`).join('')}</div>`;
const minuten = (lijst) => lijst.map((n) => [n, t('algemeen.minuten', { n })]);
/** Een schuif voor de helderheid, van 0 tot 100 (besluit 206); het getal ernaast loopt mee. */
const nkSchuif = (label, attr, waarde, uit = false) =>
  `<div class="nk-helder"><input class="nk-schuif" type="range" min="0" max="100" step="1" value="${waarde}" data-${attr} aria-label="${esc(label)}" ${uit ? 'disabled' : ''}><b data-nk-pct>${waarde}%</b></div>`;
const alleenHoofd = () => (magWand() ? '' : `<p class="uitleg" style="color: var(--zon-t)">${esc(t('functies.alleenHoofd'))}</p>`);
const voorDeWand = () => `<p class="mini">${esc(t('functies.voorDeWand'))}</p>`;

/** Dit scherm (besluit 155): volledig scherm, per apparaat; alleen als de app in Home Assistant draait. */
function scherm() {
  const aan = app.volledigGekozen();
  return `<h2 class="kop-2">${esc(t('functies.ditScherm'))}</h2>
    <div class="regelrij"><div class="l"><b>${esc(t('functies.volledig'))}</b><span>${esc(t('functies.volledigZin'))}</span></div><button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="${esc(t('functies.volledig'))}" data-volledig></button></div>
    <p class="mini">${esc(t('functies.volledigUitleg'))}</p>
    <div><button type="button" class="knop" data-naar-ha>${esc(t('basis.naarHA'))}</button></div>`;
}

/*
 * Op je startscherm (21 oktober 2026). Met het eigen icoon kan alleen als
 * Chrome de app installeert: over https en buiten Home Assistant, dus via de
 * eigen poort in Tailscale (besluit 160). In de app van Home Assistant wijst
 * dit de weg daarheen; staat de eigen poort nog dicht, dan de stappen, met de
 * adressen van dit huis erin.
 */
const android = /android/i.test(navigator.userAgent);
const apple = /iphone|ipad/i.test(navigator.userAgent);
/** Het adres van Home Assistant zoals deze telefoon het opent, als de app erin draait. */
function haAdres() {
  try {
    return window.top.location.origin;
  } catch {
    return null;
  }
}
/** Waar Smart Climate in Tailscale staat: het adres dat al gebruikt is, of een voorstel uit dat van Home Assistant. */
function tailscaleAdres() {
  if (startscherm?.adres) return startscherm.adres;
  const tailnet = /\.([a-z0-9-]+\.ts\.net)(?::\d+)?$/i.exec(haAdres() ?? '')?.[1];
  return tailnet ? `https://smartclimate.${tailnet}` : null;
}
function startschermZin() {
  if (app.geinstalleerd()) return t('functies.st.staatErop');
  if (app.kanInstalleren()) return t('functies.st.kanNu');
  return t(app.inHA() ? (startscherm?.eigenPoort ? 'functies.st.viaChrome' : 'functies.st.eerstInstellen') : 'functies.st.viaBrowser');
}
function startschermVorm() {
  const kop = `<h2 class="kop-2">${esc(t('functies.st.kop'))}</h2>`;
  if (app.geinstalleerd()) return `${kop}<p class="uitleg">${esc(t('functies.st.geinstalleerd'))}</p>`;
  if (app.kanInstalleren()) {
    return `${kop}<p class="uitleg">${esc(t('functies.st.kan'))}</p>
      <div><button type="button" class="knop knop-licht" data-installeer>${esc(t('functies.st.zet'))}</button></div>`;
  }
  const adres = tailscaleAdres();
  if (app.inHA()) {
    if (startscherm?.eigenPoort && adres) {
      const host = adres.replace(/^https:\/\//, '');
      const open = android ? `intent://${host}/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(adres)};end` : adres;
      return `${kop}<p class="uitleg">${metHtml('functies.st.inHA')}</p>
        <p class="mini">${metHtml('functies.st.adres', { adres })}</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap"><a class="knop knop-licht" href="${esc(open)}" target="_blank" rel="noopener">${esc(t('functies.st.openChrome'))}</a><button type="button" class="knop" data-kopieer-adres="${esc(adres)}">${esc(t('functies.st.kopieer'))}</button></div>`;
    }
    const ha = haAdres() ?? 'http://homeassistant.local:8123';
    const naam = adres ?? `https://smartclimate.${t('functies.st.tailnet')}.ts.net`;
    return `${kop}<p class="uitleg">${esc(t('functies.st.waarom'))}</p>
      <ol style="margin: 0; padding-left: 20px; display: grid; gap: 8px">
        <li>${metHtml('functies.st.stap1', { ha })}</li>
        <li>${metHtml('functies.st.stap2')}</li>
        <li>${metHtml('functies.st.stap3')}</li>
        <li>${metHtml('functies.st.stap4')}</li>
        <li>${metHtml('functies.st.stap5', { naam })}</li>
      </ol>
      <p class="mini">${esc(t('functies.st.zonder'))}</p>`;
  }
  if (apple) return `${kop}<p class="uitleg">${metHtml('functies.st.safari')}</p>`;
  if (!window.isSecureContext) return `${kop}<p class="uitleg">${t('functies.st.https', { adres: adres ? `<b>${esc(adres)}</b>` : esc(t('functies.st.hetAdres')) })}</p>`;
  return `${kop}<p class="uitleg">${metHtml(android ? 'functies.st.chrome' : 'functies.st.chromeBalk')}</p>`;
}

/** Het always-on display (besluiten 164 en 165): na hoeveel minuten zonder aanraken, en of hij er is. */
function aod() {
  const n = niemandNu();
  const mag = magWand();
  const aan = n.rustMin > 0;
  const zin = aan ? t('functies.aod.zin', { n: n.rustMin }) : t('functies.aod.blijft');
  // De dagstand en de avondstand (besluit 168): wanneer elk geldt, met de zonsondergang van vandaag.
  const onder = zon?.dag?.onderMs != null ? t('functies.aod.onderOm', { klok: taal.klok(zon.dag.onderMs) }) : t('functies.aod.onder');
  const dagVan = n.nacht ? n.tot : zon?.dag?.opMs != null ? t('functies.aod.opOm', { klok: taal.klok(zon.dag.opMs) }) : t('functies.aod.op');
  const avondTot = n.nacht ? n.van : dagVan;
  const dagZin = !n.avond ? t('functies.aod.dagAltijd') : !n.dag ? t('functies.aod.dagUit') : t('functies.aod.vanTot', { van: dagVan, tot: onder });
  const avondZin = !n.dag ? t('functies.aod.avondAltijd') : !n.avond ? t('functies.aod.avondUit') : t('functies.aod.vanTot', { van: onder, tot: avondTot });
  return `<h2 class="kop-2">${esc(t('functies.aod.kop'))}</h2>
    <p class="klein" style="margin: 0" data-nk-zin>${esc(zin)}</p>
    <div class="regelrij"><div class="l"><b>${esc(t('functies.aod.kop'))}</b><span>${esc(t('functies.aod.regel'))}</span></div>${schakel(aan, 'data-nk-aod', t('functies.aod.kop'), !mag)}</div>
    <div class="${aan ? '' : 'uitgezet'}" data-nk-onder><span class="veldnaam">${esc(t('functies.aod.na'))}</span>${nkKeuzes(t('functies.aod.naLabel'), 'nk-rust', minuten([2, 5, 15]), n.rustMin, !mag || !aan)}</div>
    <div class="${aan ? '' : 'uitgezet'}">
      <div class="regelrij"><div class="l"><b>${esc(t('functies.aod.dagstand'))}</b><span data-nk-dagzin>${esc(t('functies.aod.dagZin', { wanneer: dagZin }))}</span></div>${schakel(n.dag, 'data-nk-dag', t('functies.aod.dagstand'), !mag || !aan || (n.dag && !n.avond))}</div>
      <div><span class="veldnaam">${esc(t('functies.aod.helderDag'))}</span>${nkSchuif(t('functies.aod.helderDagLabel'), 'nk-helder-dag', n.helderDag, !mag)}</div>
      <div class="regelrij"><div class="l"><b>${esc(t('functies.aod.avondstand'))}</b><span data-nk-avondzin>${esc(t('functies.aod.avondZin', { wanneer: avondZin }))}</span></div>${schakel(n.avond, 'data-nk-avond', t('functies.aod.avondstand'), !mag || !aan || (n.avond && !n.dag))}</div>
      <div class="${n.avond ? '' : 'uitgezet'}"><span class="veldnaam">${esc(t('functies.aod.helderAvond'))}</span>${nkSchuif(t('functies.aod.helderAvond'), 'nk-helder-avond', n.helderAvond, !mag || !aan || !n.avond)}</div>
    </div>
    ${n.nacht ? `<p class="mini">${esc(t('functies.aod.daarna', { van: n.van, tot: n.tot }))}</p>` : ''}
    ${alleenHoofd()}${voorDeWand()}
    <p class="mini">${esc(t('functies.aod.terug'))}</p>`;
}

/** Wanneer het scherm uitgaat (besluit 165): 's nachts, als niemand thuis is, na zoveel minuten zonder beweging. */
function schermUit() {
  const n = niemandNu();
  const mag = magWand();
  const ergens = n.nacht || n.weg;
  const melders = bewegingsmelders();
  const wanneer = n.nacht && n.weg ? t('functies.uit.beide', { van: n.van, tot: n.tot }) : n.nacht ? t('functies.uit.nacht', { van: n.van, tot: n.tot }) : n.weg ? t('functies.uit.weg') : null;
  const zin = wanneer
    ? [t('functies.uit.zin', { wanneer, n: n.aanMin }), n.melder ? t('functies.uit.beweging') : null, t('functies.uit.tik')].filter(Boolean).join(' ')
    : t('functies.uit.nooit');
  // De camera van de wand zelf, via Fully Kiosk (29 oktober 2026), en de melders uit het huis.
  const opties = `<option value="fully" ${n.melder === 'fully' ? 'selected' : ''}>${esc(t('functies.uit.camera'))}</option>${melders.map((m) => `<option value="${esc(m.id)}" ${m.id === n.melder ? 'selected' : ''}>${esc(t('functies.uit.melder', { kamer: m.kamer, naam: m.naam }))}</option>`).join('')}`;
  return `<h2 class="kop-2">${esc(t('functies.uit.kop'))}</h2>
    <p class="klein" style="margin: 0" data-nk-zin>${esc(zin)}</p>
    <div class="regelrij"><div class="l"><b>${esc(t('functies.uit.snachts'))}</b><span>${esc(t('functies.uit.snachtsZin'))}</span></div>${schakel(n.nacht, 'data-nk-nacht', t('functies.uit.snachtsLabel'), !mag)}</div>
    <div class="twee ${n.nacht ? '' : 'uitgezet'}"><label class="veldnaam">${esc(t('functies.uit.vanaf'))}<input class="invoer" type="time" step="900" value="${esc(n.van)}" data-nk-van ${mag && n.nacht ? '' : 'disabled'}></label><label class="veldnaam">${esc(t('functies.uit.tot'))}<input class="invoer" type="time" step="900" value="${esc(n.tot)}" data-nk-tot ${mag && n.nacht ? '' : 'disabled'}></label></div>
    <div class="regelrij"><div class="l"><b>${esc(t('functies.uit.niemand'))}</b><span>${esc(t('functies.uit.niemandZin'))}</span></div>${schakel(n.weg, 'data-nk-weg', t('functies.uit.niemand'), !mag)}</div>
    <div class="${ergens ? '' : 'uitgezet'}"><span class="veldnaam">${esc(t('functies.uit.na'))}</span>${nkKeuzes(t('functies.uit.naLabel'), 'nk-aan', minuten([1, 5, 15, 30]), n.aanMin, !mag || !ergens)}</div>
    <div class="regelrij"><div class="l"><b>${esc(t('functies.uit.wekken'))}</b><span>${esc(t('functies.uit.wekkenZin'))}</span></div>${schakel(!!n.melder, 'data-nk-beweging', t('functies.uit.wekken'), !mag)}</div>
    ${n.melder ? `<label class="veldnaam">${esc(t('functies.uit.welke'))}<select class="invoer" data-nk-melder ${mag ? '' : 'disabled'}>${opties}</select></label>` : ''}
    ${fullyHier(n)}
    ${alleenHoofd()}${voorDeWand()}
    <p class="mini">${esc(t('functies.uit.fully'))}</p>`;
}

/**
 * Wat Fully Kiosk op dit scherm doet (29 oktober 2026): ziet de app Fully, en
 * kijkt de camera mee. Alleen op het scherm zelf te zien; op een telefoon
 * zegt het niets, behalve dat je het op de wand ziet.
 */
function fullyHier(n) {
  let f = null;
  try {
    f = window.fully ?? null;
  } catch {
    // Geen Fully.
  }
  if (!f) return n.melder === 'fully' ? `<p class="uitleg">${esc(t('functies.uit.fullyNiet'))}</p>` : '';
  let camera = null;
  try {
    camera = f.isMotionDetectionRunning?.() ?? null;
  } catch {
    // Een oudere Fully.
  }
  const sleutel = n.melder !== 'fully' ? 'functies.uit.fullyGezien' : camera === false ? 'functies.uit.fullyCameraUit' : 'functies.uit.fullyCamera';
  return `<p class="uitleg" style="color: ${n.melder === 'fully' && camera === false ? 'var(--zon-t)' : 'var(--mint-t)'}">${esc(t(sleutel))}</p>`;
}

/** De bewegingsmelders in het huis, met hun kamer. */
function bewegingsmelders() {
  const uit = [];
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) for (const d of r.apparaten ?? []) {
    const id = d.meting?.beweging?.id;
    if (id && !uit.some((m) => m.id === id)) uit.push({ id, naam: d.naam, kamer: r.naam });
  }
  return uit;
}

/** Wat de wand doet als niemand kijkt, bewaard bij de voorkeuren van de wand. Alles samen, zodat snel tikken niets kwijtraakt. */
function bewaarNiemand(wat) {
  const nieuw = { ...niemandNu(), ...wat };
  voorkeur = { ...voorkeur, wand: { ...voorkeur?.wand, niemand: nieuw } };
  teken();
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/voorkeuren', { plek: 'wand', niemand: nieuw });
    if (uit?.ok) voorkeur = uit.antwoord;
    return uit;
  }, 300);
}

/** Een lamp of screen uit de app halen, of terug (besluit 167): verbergen in de indeling. */
async function inApp(id, aan) {
  const lay = JSON.parse(JSON.stringify(indeling?.indeling ?? indeling?.voorstel ?? null));
  if (!lay) return;
  lay.verborgen = aan ? (lay.verborgen ?? []).filter((x) => x !== id) : [...new Set([...(lay.verborgen ?? []), id])];
  // Zichtbaar zolang de dienst bewaart; daarna het huis opnieuw.
  indeling = { ...indeling, indeling: lay };
  teken();
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/indeling', lay);
    if (uit?.ok) {
      const [h, i] = await Promise.allSettled([haal('api/huis'), haal('api/indeling')]);
      if (h.status === 'fulfilled') huisData = h.value;
      if (i.status === 'fulfilled') indeling = i.value;
      teken();
    }
    return uit;
  }, 200);
}

/** Praten met je huis (besluit 148, schets Wand-Instellingen-Praten). */
function praten() {
  const modellen = info.gevonden.taalmodellen ?? [];
  const p = concept.praten;
  const bedienKan = info.lichtMogelijk === true || info.schermMogelijk === true;
  const proefHtml = !p.taalmodel
    ? ''
    : proef === 'bezig'
      ? `<p class="mini">${esc(t('functies.praten.proberen'))}</p>`
      : proef
        ? `<div class="proef"><div><span>${esc(t('functies.praten.vast'))}</span>${esc(proef.vast)}</div><div class="eigen"><span>${esc(t('functies.praten.eigen'))}</span>${esc(proef.eigen ?? t('functies.praten.lukteNiet'))}</div></div>
          ${proef.snel && proef.ms != null ? `<p class="mini">${esc(t('functies.praten.na', { s: taal.getal(proef.ms / 1000, 1) }))}</p>` : ''}
          ${proef.reden ? `<p class="uitleg" style="color: var(--zon-t)">${esc(proef.reden)}</p>` : ''}`
        : '';
  return `<h2 class="kop-2">${esc(t('functies.praten.kop'))}</h2>
    ${modellen.length ? keuzes(t('functies.praten.taalmodel'), 'taalmodel', [[null, t('functies.uit')], ...modellen.map((m) => [m.id, m.naam])], p.taalmodel) : `<p class="uitleg">${esc(t('functies.praten.geenAI'))}</p>`}
    <p class="mini">${esc(t('functies.praten.uitleg'))}</p>
    ${p.taalmodel ? `<div><button type="button" class="knop knop-licht" data-proef>${esc(t(proef && proef !== 'bezig' ? 'functies.praten.nogEens' : 'functies.praten.probeer'))}</button></div>` : ''}
    ${proefHtml}
    <div class="buiten"><div><b class="wel">${esc(t('functies.praten.gaatNaar'))}</b><span>${esc(t('functies.praten.gaatNaarZin'))}</span></div><div><b class="niet">${esc(t('functies.praten.blijft'))}</b><span>${esc(t('functies.praten.blijftZin'))}</span></div></div>
    ${bedienKan ? `<h2 class="kop-2" style="margin-top: 8px">${esc(t('functies.praten.bedienen'))}</h2>
    ${keuzes(t('functies.praten.bedienen'), 'pratenBedienen', aanUit(), p.bedienen)}
    <p class="mini">${esc(t('functies.praten.zeg', { wat: t(info.schermMogelijk ? 'functies.praten.lampenSchermen' : 'functies.praten.lampen') }))}</p>` : ''}
    ${info.gevonden.klimaatBrug ? `<h2 class="kop-2" style="margin-top: 8px">${esc(t('functies.praten.klimaat'))}</h2>
    ${keuzes(t('functies.praten.klimaat'), 'pratenKlimaat', aanUit(), p.klimaat === true)}
    <p class="mini">${esc(t('functies.praten.klimaatZin'))}</p>` : ''}
    ${luisteren()}`;
}

/** Het wekwoord zoals je het zegt: "he_huis" is "Hé huis". */
const wekwoordNaam = (w) => (w === 'he_huis' ? t('functies.heHuis') : w.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

/** Luisteren (besluit 150, schets Wand-Instellingen-Luisteren): de spraakassistent, en of dit scherm luistert. */
function luisteren() {
  const lijst = info.gevonden.spraakassistenten ?? [];
  const p = concept.praten;
  const gekozen = lijst.find((x) => x.id === p.spraak) ?? lijst.find((x) => x.voorkeur) ?? null;
  let hier = false;
  try {
    hier = localStorage.getItem('sc-luisteren') === 'aan';
  } catch {
    hier = false;
  }
  const https = window.isSecureContext;
  const opties = [[null, gekozen && !p.spraak ? t('functies.luister.vanHANaam', { naam: gekozen.naam }) : t('functies.luister.vanHA')], ...lijst.map((x) => [x.id, x.wekwoord ? `${x.naam} · ${wekwoordNaam(x.wekwoord)}` : x.naam])];
  // Hoort de dienst "Hé huis" zelf (besluit 208), dan hoeft de spraakassistent geen wekwoord.
  const zelf = luisterStand?.zelf === true;
  const melding = !lijst.length
    ? t('functies.luister.geen')
    : !gekozen?.spraakNaarTekst
      ? t('functies.luister.geenSpraak')
      : !gekozen.wekwoord && !zelf
        ? t('functies.luister.geenWekwoord')
        : '';
  // Waar de stem vandaan komt (besluit 203): het apparaat zelf, met verstaan via de browser;
  // of helemaal in huis, en alleen dan de spraakassistent en "Hé huis" op dit scherm.
  const stemHuis = p.stem === 'huis';
  // De kop en de keuze op één regel (op een smal scherm eronder): zo past Praten op de wand.
  const kop = `<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-top: 8px"><h2 class="kop-2" style="margin: 0">${esc(t('functies.stem.kop'))}</h2>
    ${keuzes(t('functies.stem.kop'), 'stemBron', [['apparaat', t('inr.stem.apparaat')], ['huis', t('inr.stem.huis')]], stemHuis ? 'huis' : 'apparaat')}</div>`;
  if (!stemHuis) {
    return `${kop}
    <p class="mini">${esc(t('inr.stem.apparaatZin'))}</p>
    <span class="veldnaam">${esc(t('inr.stem.verstaanLabel'))}</span>${keuzes(t('inr.stem.verstaanLabel'), 'stemVerstaan', aanUit(), p.verstaan !== false)}
    <p class="mini">${esc(t('functies.stem.verstaanZin'))}</p>`;
  }
  return `${kop}
    <span class="veldnaam">${esc(t('functies.luister.assistent'))}</span>
    ${lijst.length ? keuzes(t('functies.luister.assistentLabel'), 'spraak', opties, p.spraak) : ''}
    ${zelf ? `<p class="mini">${metHtml('functies.luister.zelf')}</p>` : gekozen?.wekwoord ? `<p class="mini">${metHtml('functies.luister.wekwoord', { woord: wekwoordNaam(gekozen.wekwoord) })}</p>` : ''}
    ${luisterStand?.traag ? `<p class="uitleg" style="color: var(--zon-t)">${esc(t('functies.luister.traag'))}</p>` : ''}
    ${melding ? `<p class="uitleg" style="color: var(--zon-t)">${esc(melding)}</p>` : ''}
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px"><span class="veldnaam">${esc(t('functies.luister.hier'))}</span>
    <div class="keuzes" role="group" aria-label="${esc(t('functies.luister.hierLabel'))}"><button type="button" data-hier="aan" aria-pressed="${hier}" ${https ? '' : 'disabled'}>${esc(t('functies.aan'))}</button><button type="button" data-hier="uit" aria-pressed="${!hier}">${esc(t('functies.uit'))}</button></div></div>
    ${https ? '' : `<p class="uitleg" style="color: var(--zon-t)">${esc(t('functies.luister.https'))}</p>`}
    ${hier && https ? schuiven(zelf) : ''}`;
}

/** Hoe dit scherm luistert (besluit 208): de gevoeligheid van "Hé huis" en de wachttijd na je laatste woord. */
function schuiven(zelf) {
  const lees = (k, std) => {
    try {
      return localStorage.getItem(k) ?? std;
    } catch {
      return std;
    }
  };
  const g = Number(lees('sc-gevoeligheid', '3'));
  const w = lees('sc-wachttijd', 'normaal');
  const v = luisterStand?.vandaag;
  // Vaak wakker zonder vraag: dan is hij waarschijnlijk te gevoelig.
  const vaakVals = v && v.zonderVraag >= 3 && v.zonderVraag * 2 >= v.wakker;
  const gevoel = zelf
    ? `<label class="schuif">${esc(t('functies.luister.gevoelig'))}<b data-gevoelig-naam>${esc(t(`functies.luister.stand${g}`))}</b><input type="range" min="1" max="5" step="1" value="${g}" data-gevoelig aria-label="${esc(t('functies.luister.gevoelig'))}"></label>
    <div style="display: flex; justify-content: space-between" class="mini"><span>${esc(t('functies.luister.strenger'))}</span><span>${esc(t('functies.luister.gevoeliger'))}</span></div>
    ${v ? `<p class="mini">${esc(t(v.wakker === 1 ? 'functies.luister.vandaagEen' : 'functies.luister.vandaag', { n: v.wakker, vals: v.zonderVraag }))}</p>` : ''}
    ${vaakVals && g > 1 ? `<p class="uitleg" style="color: var(--zon-t)">${esc(t('functies.luister.teVaak'))}</p>` : ''}`
    : '';
  return `${gevoel}
    <span class="veldnaam">${esc(t('functies.luister.wachttijd'))}</span>
    ${keuzes(t('functies.luister.wachttijd'), 'wachttijd', [['vlot', t('functies.luister.vlot')], ['normaal', t('functies.luister.normaal')], ['rustig', t('functies.luister.rustig')]], w)}
    <p class="mini">${esc(t('functies.luister.wachttijdZin'))}</p>`;
}

function weer() {
  const bronnen = info.gevonden.weerbronnen ?? [];
  // Open-Meteo voorop (besluit 130): werkt voor elk huis. De rest onder "Andere bron".
  const meteo = bronnen.find((b) => b.id === 'open-meteo');
  const andere = bronnen.filter((b) => b.id !== 'open-meteo');
  const anderGekozen = concept.weer.bron !== 'open-meteo';
  return `<h2 class="kop-2">${esc(t('functies.weer.kop'))}</h2>
    ${meteo ? keuzes(t('functies.weer.bron'), 'weerBron', [['open-meteo', t('functies.weer.meteo')]], concept.weer.bron) : ''}
    <p class="mini">${esc(t('functies.weer.waarvoor'))}</p>
    <details ${anderGekozen ? 'open' : ''}><summary class="mini" style="cursor: pointer; font-weight: 700; color: var(--zacht)">${esc(t('functies.weer.andere'))}</summary>
      <div style="margin-top: 8px">${keuzes(t('functies.weer.andereLabel'), 'weerBron', [...andere.map((b) => [b.id, b.naam]), [null, t('functies.weer.geen')]], concept.weer.bron)}</div>
    </details>
    <span class="veldnaam">${esc(t('functies.weer.perUur'))}</span>
    ${keuzes(t('functies.weer.perUurLabel'), 'weerUren', [[true, t('functies.weer.bewaren')], [false, t('functies.weer.nietBewaren')]], concept.weer.uren !== false)}
    <p class="mini">${esc(t('functies.weer.uitleg'))}</p>`;
}

/** Meldingen (besluit 149): onder welk percentage een batterij of filter een melding geeft. */
const DREMPELS = () => [[null, t('functies.nooit')], [5, '5%'], [10, '10%'], [20, '20%'], [30, '30%']];
function meldingen() {
  const m = concept.meldingen;
  return `<h2 class="kop-2">${esc(t('functies.meld.kop'))}</h2>
    <span class="veldnaam">${esc(t('functies.meld.batterij'))}</span>
    ${keuzes(t('functies.meld.batterijLabel'), 'drempelBatterij', DREMPELS(), m.batterij)}
    <span class="veldnaam">${esc(t('functies.meld.filter'))}</span>
    ${keuzes(t('functies.meld.filterLabel'), 'drempelFilter', DREMPELS(), m.filter)}
    <p class="mini">${esc(t('functies.meld.uitleg'))}</p>`;
}

/** Per deel het kopje ernaast en hoeveel punten (functies.naast.<deel>.<n>). */
const NAAST = {
  cameras: ['functies.zoWerkt', 2],
  deurbel: ['functies.naast.deurbel', 3],
  licht: ['functies.zoWerkt', 3],
  startscherm: ['functies.zoWerkt', 3],
  scherm: ['functies.naast.scherm', 3],
  aod: ['functies.zoWerkt', 3],
  uit: ['functies.zoWerkt', 3],
  praten: ['functies.zoWerkt', 8],
  meldingen: ['functies.zoWerkt', 3],
  weer: ['functies.naast.weer', 3],
};

function delen() {
  if (!info || !concept) return [];
  const f = concept;
  const beelden = f.cameras.aan ? f.cameras.lijst.length : 0;
  const weerNaam = (info.gevonden.weerbronnen ?? []).find((b) => b.id === f.weer.bron)?.naam?.replace(' (via internet)', '') ?? t('instellingen.geen');
  const n = niemandNu();
  const s = f.deurbel.seconden;
  return [
    { id: 'cameras', titel: t('functies.cameras'), zin: f.cameras.aan ? t('functies.deel.inApp', { n: beelden }) : t('functies.deel.uit'), stand: 'goed' },
    { id: 'deurbel', titel: t('functies.deurbel'), zin: f.deurbel.aan ? t('instellingen.beeld', { duur: s >= 60 ? t('algemeen.minuten', { n: s / 60 }) : t('instellingen.seconden', { n: s }) }) : t('functies.deel.uit'), stand: f.deurbel.aan && (!f.deurbel.melder || !f.deurbel.camera) ? 'mist' : 'goed' },
    { id: 'licht', titel: t('functies.licht'), zin: t((info.lichtMogelijk || info.schermMogelijk) && f.licht.bedienen ? 'instellingen.bedienen' : 'instellingen.alleenKijken'), stand: 'goed' },
    { id: 'weer', titel: t('functies.weer.kop'), zin: weerNaam, stand: f.weer.bron ? 'goed' : 'leeg' },
    { id: 'meldingen', titel: t('functies.meld.kop'), zin: drempelZin(f.meldingen), stand: 'goed' },
    { id: 'praten', titel: t('functies.deel.praten'), zin: f.praten.taalmodel ? (info.gevonden.taalmodellen ?? []).find((m) => m.id === f.praten.taalmodel)?.naam ?? t('functies.deel.eigen') : t('functies.deel.vast'), stand: 'goed' },
    // Weergave (besluit 167): dit scherm, het always-on display en wanneer het scherm uitgaat.
    { kop: t('functies.deel.weergave') },
    ...(app.inHA() ? [{ id: 'scherm', titel: t('functies.ditScherm'), zin: t(app.volledigGekozen() ? 'functies.deel.volledig' : 'functies.deel.zijbalk'), stand: 'goed' }] : []),
    { id: 'aod', titel: t('functies.aod.kop'), zin: n.rustMin > 0 ? t('functies.deel.aodAan', { n: n.rustMin }) : t('functies.deel.uit'), stand: 'goed' },
    { id: 'uit', titel: t('functies.uit.kop'), zin: n.nacht ? `${n.van}–${n.tot}` : t(n.weg ? 'functies.deel.niemand' : 'functies.deel.nooit'), stand: 'goed' },
    // Gevorderd (28 oktober 2026): de app los op je startscherm kan alleen via de eigen poort
    // in Tailscale, en dat is voor de meeste mensen te moeilijk. De app van Home Assistant is de weg.
    { kop: t('functies.deel.gevorderd') },
    { id: 'startscherm', titel: t('functies.st.kop'), zin: startschermZin(), stand: app.geinstalleerd() ? 'goed' : 'leeg' },
  ];
}

function drempelZin(m) {
  const z = (v) => (v == null ? t('functies.drempel.nooit') : t('functies.drempel.onder', { pct: v }));
  return m.batterij === m.filter ? z(m.batterij) : t('functies.drempel.apart', { batterij: z(m.batterij), filter: z(m.filter) });
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  const nu = groep.tekenDelen(delen());
  const vorm = { cameras, deurbel, licht, weer, praten, meldingen, scherm, startscherm: startschermVorm, aod, uit: schermUit }[nu]?.() ?? '';
  // Terug naar standaard (besluit 204): rechtsboven, alleen als dit deel afwijkt van wat de app voorstelt.
  const terug = afwijkend(nu) ? `<button type="button" class="knop stdknop" data-standaard-deel="${esc(nu)}">${esc(t('functies.std'))}</button>` : '';
  $$('[data-vorm]').forEach((el) => {
    el.innerHTML = terug + vorm;
    el.classList.toggle('metstd', !!terug);
  });
  const deel = NAAST[nu] ? nu : 'cameras';
  const [kopje, aantal] = NAAST[deel];
  const lijst = Array.from({ length: aantal }, (_, i) => t(`functies.naast.${deel}.${i + 1}`));
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(t(kopje))}</h3><ul>${lijst.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`));
}
/** Welke instellingen bij een deel horen (besluit 204), om ze terug te zetten naar het voorstel. */
const STANDAARD_DEEL = { cameras: ['cameras'], deurbel: ['deurbel'], licht: ['licht', 'schermen'], weer: ['weer'], meldingen: ['meldingen'], praten: ['praten'] };
function afwijkend(deel) {
  const sleutels = STANDAARD_DEEL[deel];
  return !!sleutels && sleutels.some((s) => info.voorstel?.[s] != null && JSON.stringify(concept[s]) !== JSON.stringify({ ...info.voorstel[s], ...vulAan(s, concept[s], info.voorstel[s]) }));
}
/** Velden die het voorstel niet noemt maar het concept wel (zoals een lege lijst): die tellen niet als afwijking. */
function vulAan(s, nu, voorstel) {
  return Object.fromEntries(Object.keys(nu ?? {}).filter((k) => !(k in voorstel)).map((k) => [k, nu[k]]));
}

function bewaar() {
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/functies', concept);
    if (uit?.ok) info = uit.antwoord;
    return uit;
  });
}

/* ------------------------------------------------------------ doen */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  // Op je startscherm (21 oktober 2026): Chrome vraagt het zelf.
  if (knop.hasAttribute('data-installeer')) {
    void app.installeer().then((ja) => {
      teken();
      if (ja) groep.zegBewaard('ok', t('functies.gezet'));
    });
    return;
  }
  // Terug naar standaard (besluit 204): dit deel weer zoals de app het voorstelt.
  if (knop.dataset.standaardDeel) {
    for (const s of STANDAARD_DEEL[knop.dataset.standaardDeel] ?? []) if (info.voorstel?.[s] != null) concept[s] = JSON.parse(JSON.stringify(info.voorstel[s]));
    teken();
    bewaar();
    return;
  }
  if (knop.dataset.kopieerAdres) {
    void navigator.clipboard?.writeText(knop.dataset.kopieerAdres).then(
      () => groep.zegBewaard('ok', t('functies.klembord')),
      () => groep.zegBewaard('fout', t('functies.kopieerMis')),
    );
    return;
  }
  // Weergave (besluit 167): dit scherm, het always-on display, scherm uit.
  if (knop.hasAttribute('data-volledig')) {
    app.zetVolledig(knop.getAttribute('aria-checked') !== 'true');
    return teken();
  }
  const n = niemandNu();
  if (knop.hasAttribute('data-nk-aod')) return bewaarNiemand({ rustMin: n.rustMin > 0 ? 0 : 5 });
  if (knop.dataset.nkRust) return bewaarNiemand({ rustMin: Number(knop.dataset.nkRust) });
  // Dagstand of avondstand uit: de andere neemt het over; de laatste blijft aan (besluit 168).
  if (knop.hasAttribute('data-nk-dag')) return bewaarNiemand({ dag: !n.dag });
  if (knop.hasAttribute('data-nk-avond')) return bewaarNiemand({ avond: !n.avond });

  if (knop.hasAttribute('data-nk-nacht')) return bewaarNiemand({ nacht: !n.nacht });
  if (knop.hasAttribute('data-nk-weg')) return bewaarNiemand({ weg: !n.weg });
  if (knop.dataset.nkAan) return bewaarNiemand({ aanMin: Number(knop.dataset.nkAan) });
  // Aanzetten: op de wand in Fully de eigen camera, anders de eerste melder uit het huis.
  if (knop.hasAttribute('data-nk-beweging')) return bewaarNiemand({ melder: n.melder ? null : window.fully || !bewegingsmelders().length ? 'fully' : bewegingsmelders()[0].id });
  if (knop.dataset.inApp) return void inApp(knop.dataset.inApp, knop.getAttribute('aria-pressed') !== 'true');
  // Dit scherm luistert (besluit 150): alleen in deze browser, niet bij de dienst.
  if (knop.dataset.hier) {
    try {
      localStorage.setItem('sc-luisteren', knop.dataset.hier);
    } catch {
      // Dan niet.
    }
    // Aan: meteen beginnen, zonder de pagina te verversen.
    if (knop.dataset.hier === 'aan' && !window.luisteren) {
      const sc = document.createElement('script');
      sc.src = 'luisteren.js';
      document.head.appendChild(sc);
    }
    teken();
    return groep.zegBewaard('ok', t(knop.dataset.hier === 'aan' ? 'functies.luistertNu' : 'functies.luistertNiet'));
  }
  // Proberen (besluit 148): één vraag aan het gekozen taalmodel, er verandert niets.
  if (knop.hasAttribute('data-proef') && concept.praten.taalmodel) {
    proef = 'bezig';
    teken();
    void haal(`api/praten/proef?model=${encodeURIComponent(concept.praten.taalmodel)}`).then(
      (r) => ((proef = r), teken()),
      () => ((proef = { vast: t('functies.praten.geenAntwoord'), eigen: null }), teken()),
    );
    return;
  }
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    const s = knop.dataset.kies;
    // De wachttijd hoort bij dit scherm (besluit 208), niet bij de dienst.
    if (s === 'wachttijd') return bewaarHier('sc-wachttijd', w, t('functies.luister.bewaard'));
    if (s === 'camerasAan') concept.cameras.aan = w;
    else if (s === 'belAan') {
      concept.deurbel.aan = w;
      // Aanzetten zonder keuze: de eerste deurbel, met zijn eigen camera.
      if (w && !concept.deurbel.melder) {
        const m = info.gevonden.melders[0];
        concept.deurbel.melder = m?.id ?? null;
        concept.deurbel.camera ??= m?.camera ?? null;
      }
    } else if (s === 'schermAan') concept.deurbel.schermAan = w;
    else if (s === 'lichtAan') concept.licht.bedienen = w;
    else if (s === 'schermenAan') concept.schermen.bedienen = w;
    else if (s === 'weerBron') concept.weer.bron = w;
    else if (s === 'weerUren') concept.weer.uren = w;
    else if (s === 'taalmodel') {
      concept.praten.taalmodel = w;
      proef = null;
    } else if (s === 'pratenBedienen') concept.praten.bedienen = w;
    // De klimaatbrug (besluit 210): de knoppen van je eigen regeling, tot stap B.
    else if (s === 'pratenKlimaat') concept.praten.klimaat = w;
    else if (s === 'spraak') concept.praten.spraak = w;
    else if (s === 'stemBron') concept.praten.stem = w;
    else if (s === 'stemVerstaan') concept.praten.verstaan = w;
    else if (s === 'seconden') concept.deurbel.seconden = w;
    else if (s === 'drempelBatterij') concept.meldingen.batterij = w;
    else if (s === 'drempelFilter') concept.meldingen.filter = w;
    else if (s.startsWith('camera:')) {
      // Per camera één beeld: het andere beeld van dezelfde camera gaat eruit.
      const c = info.gevonden.cameras[Number(s.slice(7))];
      const anders = new Set(c.beelden.map((b) => b.id));
      concept.cameras.lijst = concept.cameras.lijst.filter((id) => !anders.has(id));
      if (w) concept.cameras.lijst.push(w);
    }
    teken();
    // Een deurbel aan zonder melder of beeld kan de dienst niet bewaren: eerst kiezen.
    if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', t('functies.kiesDeurbel'));
    bewaar();
  }
});

// De helderheid: het getal loopt mee met de schuif, bewaard bij loslaten (besluit 206).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches?.('.nk-schuif')) el.parentElement.querySelector('[data-nk-pct]').textContent = `${el.value}%`;
  if (el.matches?.('[data-gevoelig]')) el.parentElement.querySelector('[data-gevoelig-naam]').textContent = t(`functies.luister.stand${el.value}`);
});

/** Een schuif van dit scherm (besluit 208): alleen in deze browser, en meteen in gebruik. */
function bewaarHier(sleutel, waarde, zin) {
  try {
    localStorage.setItem(sleutel, waarde);
  } catch {
    // Dan alleen voor nu.
  }
  window.luisteren?.opnieuw?.();
  teken();
  groep.zegBewaard('ok', zin);
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches?.('[data-gevoelig]')) return bewaarHier('sc-gevoeligheid', String(el.value), t('functies.luister.bewaard'));
  if (el.matches?.('[data-nk-helder-dag]')) return bewaarNiemand({ helderDag: Math.round(Number(el.value)) });
  if (el.matches?.('[data-nk-helder-avond]')) return bewaarNiemand({ helderAvond: Math.round(Number(el.value)) });
  if (el.matches?.('[data-nk-melder]')) return bewaarNiemand({ melder: el.value });
  if (el.matches?.('[data-nk-van], [data-nk-tot]') && /^\d\d:\d\d$/.test(el.value)) return bewaarNiemand({ [el.matches('[data-nk-van]') ? 'van' : 'tot']: el.value });
  const veld = e.target.closest('[data-veld]');

  if (!veld || !concept) return;
  const v = veld.value || null;
  if (veld.dataset.veld === 'melder') {
    concept.deurbel.melder = v;
    // Een melder met een eigen camera neemt die mee, als er nog geen beeld gekozen is.
    const m = info.gevonden.melders.find((x) => x.id === v);
    if (m?.camera && !concept.deurbel.camera) concept.deurbel.camera = m.camera;
  } else if (veld.dataset.veld === 'camera') concept.deurbel.camera = v;
  teken();
  if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', t('functies.kiesDeurbel'));
  bewaar();
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laad();

// Chrome biedt het installeren aan, of het is gebeurd: Op je startscherm opnieuw tekenen.
addEventListener('sc-installeer', () => teken());
