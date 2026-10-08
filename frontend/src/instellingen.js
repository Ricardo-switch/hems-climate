/*
 * Instellingen, in ontwerp 2 (besluit 104; schetsen Instellingen en
 * Wand-Leren). Achter het tandwiel: wat er goed is per kamer, wie stuurt,
 * wat het huis al weet, en hoe het huis is ingericht.
 *
 * Eerlijk over leren: wat er staat, heeft het huis echt geleerd (de zon op je
 * panelen, het verband tussen zonkans en opbrengst). Hoe snel een kamer
 * opwarmt en afkoelt komt met het thermisch model (D), en staat er als "nog
 * niet". Klimaat kijkt mee tot het bewijs er is (besluit 64).
 */
'use strict';

const { $$, nl, esc, haal } = app;

let site = null;
let vandaag = null;
let zon = null;
let weer = null;
let terugblik = null;
let sessie = null;
let aansluiting = null;
let huisData = null;

async function laadAlles() {
  const r = await Promise.allSettled([haal('api/site'), haal('api/vandaag'), haal('api/zon'), haal('api/weer'), haal('api/divergence'), haal('api/sessie'), haal('api/aansluiting'), haal('api/huis')]);
  const [s, v, z, w, d, se, a, h] = r.map((x) => (x.status === 'fulfilled' ? x.value : null));
  site = s ?? site;
  vandaag = v ?? vandaag;
  zon = z ?? zon;
  weer = w ?? weer;
  terugblik = d ?? terugblik;
  sessie = se ?? sessie;
  aansluiting = a ?? aansluiting;
  huisData = h ?? huisData;
  teken();
}

/* ------------------------------------------------------------ de kaarten */

function comfort() {
  const zones = vandaag?.zones ?? [];
  if (!zones.length) return '<h2 class="kop-3">Comfort per kamer</h2><p class="mini" style="margin: 8px 0">Nog niet bekend.</p>';
  const lo = 14;
  const hi = 28;
  const pct = (c) => ((Math.max(lo, Math.min(hi, c)) - lo) / (hi - lo)) * 100;
  const rij = (z) => {
    const van = z.goed.vanC;
    const tot = z.goed.totC;
    const zin = van != null && tot != null ? `nooit kouder dan ${nl(van, 0)}°, nooit warmer dan ${nl(tot, 0)}°` : van != null ? `nooit kouder dan ${nl(van, 0)}°` : tot != null ? `nooit warmer dan ${nl(tot, 0)}°` : 'geen grenzen ingesteld';
    const band = van != null && tot != null ? `<span class="band" aria-hidden="true"><i style="left: ${pct(van).toFixed(0)}%; right: ${(100 - pct(tot)).toFixed(0)}%"></i></span>` : '';
    return `<div class="rij"><div class="l"><b>${esc(z.naam)}</b><span>${esc(zin)}</span></div>${band}</div>`;
  };
  return `<h2 class="kop-3">Comfort per kamer</h2>${zones.map(rij).join('')}<p class="mini" style="margin: 4px 0 6px">Overdag. Aanpassen gaat nu nog in de configuratie.</p>`;
}

const FASEN = [['leren', 'Leren'], ['kijken', 'Meekijken'], ['regelen', 'Regelen']];
const fase = (nu) => `<span class="fase" role="img" aria-label="${FASEN.find(([k]) => k === nu)[1]}">${FASEN.map(([k, l]) => `<i class="${k === nu ? k : ''}">${l}</i>`).join('')}</span>`;

function stuurt() {
  const winter = terugblik?.dataset?.seizoenen?.find((s) => s.seizoen === 'winter');
  const sinds = terugblik?.dataset?.vanMs ? new Date(terugblik.dataset.vanMs).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : null;
  const klimaat = (site?.actuators ?? []).map(
    (a) => `<div class="rij"><div class="l"><b>${esc(a.name)}</b><span>Kijkt mee${sinds ? ` sinds ${esc(sinds)}` : ''}; schakelt nog niets</span></div>${fase('kijken')}</div>`,
  );
  const uitstel = (huisData?.etages ?? []).flatMap((e) => e.ruimtes).flatMap((r) => r.apparaten).filter((d) => d.soort === 'apparaat');
  const andere = [
    ...uitstel.map((d) => `<div class="rij"><div class="l"><b>${esc(d.naam)}</b><span>Kijkt mee: zegt wanneer hij op zon zou starten</span></div>${fase('kijken')}</div>`),
    `<div class="rij"><div class="l"><b>Lampen en scènes</b><span>Bedien je zelf in de app; Smart Climate regelt ze niet</span></div></div>`,
  ];
  const bewijs = winter
    ? `<div class="bewijs"><span class="mini">Winterdagen: ${nl(winter.dagen, 0)} van ${winter.doel}</span><span class="balkje"><i style="width: ${Math.min(100, (winter.dagen / winter.doel) * 100).toFixed(0)}%"></i></span></div>
       <p class="mini" style="margin: 0 0 8px">Klimaat gaat pas regelen na ${winter.doel} winterdagen meekijken waarin het minstens zo goed zou doen als nu. Jij beslist, en terug kan altijd.</p>`
    : '';
  return `<h2 class="kop-3">Wie stuurt</h2>${klimaat.join('')}${bewijs}${andere.join('')}`;
}

function weet() {
  const stip = (n) => `<span class="stip5" aria-label="${n} van 5">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'ja' : ''}"></i>`).join('')}</span>`;
  const rijen = [];
  const hl = zon?.heldereLucht;
  if (hl) {
    const n = hl.bron === 'geleerd' ? Math.min(5, Math.ceil(hl.dagen / 6)) : 0;
    rijen.push(`<div class="weet"><span>Wat je panelen halen bij heldere lucht</span><span>${hl.bron === 'geleerd' ? `<b>${hl.dagen} dagen</b>` : '<span class="uit">geschat</span>'}${stip(n)}</span></div>`);
  }
  if (weer?.geleerd) {
    const g = weer.geleerd;
    const n = Math.min(5, Math.ceil(g.dagen / 3));
    rijen.push(`<div class="weet"><span>Hoe zonkans en opbrengst samenhangen</span><span>${g.dagen ? `<b>${g.dagen} ${g.dagen === 1 ? 'dag' : 'dagen'}</b>` : '<span class="uit">vanaf morgen</span>'}${stip(n)}</span></div>`);
  }
  const t = weer?.terugblik ?? [];
  if (t.length) {
    const fout = t.reduce((s, d) => s + Math.abs(d.werkelijkKwh - d.verwachtKwh), 0) / t.length;
    rijen.push(`<div class="weet"><span>Hoe goed de verwachting van de zon klopte</span><span><b>${nl(fout)} kWh ernaast</b></span></div>${klopte(t)}`);
  } else {
    rijen.push(`<div class="weet"><span>Hoe goed de verwachting van de zon klopte</span><span class="uit">vanaf morgen</span></div>`);
  }
  rijen.push(`<div class="weet"><span>Hoe snel elke kamer opwarmt en afkoelt</span><span class="uit">nog niet${stip(0)}</span></div>`);
  const ds = terugblik?.dataset;
  if (ds) rijen.push(`<div class="weet"><span>Gemeten</span><span><b>${nl(ds.dagenOpgenomen, 0)} dagen</b></span></div>`);
  return `<div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">Wat het huis al weet</h2><span class="mini">hoe zeker</span></div>${rijen.join('')}
    <p class="mini" style="margin: 4px 0 8px">Hoe snel kamers opwarmen en afkoelen leert het huis met het thermisch model; dan komt er ook een plan per kamer.</p>`;
}

/** Per dag wat de dag ervoor werd verwacht (streepje), en wat er kwam (balk). */
function klopte(dagen) {
  const schaal = Math.max(1, ...dagen.map((d) => Math.max(d.verwachtKwh, d.werkelijkKwh)));
  const pct = (kwh) => `${Math.min(100, (kwh / schaal) * 100).toFixed(1)}%`;
  const fmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  return `<div class="klopte">${dagen
    .slice(0, 7)
    .map((d) => `<div class="terugrij"><span>${fmt.format(new Date(`${d.datum}T12:00:00Z`))}</span><i aria-hidden="true"><b style="width: ${pct(d.werkelijkKwh)}"></b><em style="left: ${pct(d.verwachtKwh)}"></em></i><span>${nl(d.werkelijkKwh)} <small>van ${nl(d.verwachtKwh)}</small></span></div>`)
    .join('')}<p class="mini" style="margin: 4px 0 0">De balk is wat er kwam, het streepje wat de dag ervoor werd verwacht.</p></div>`;
}

function jeHuis() {
  const etages = (huisData?.etages ?? []).filter((e) => e.ruimtes?.length);
  const kamers = etages.reduce((t, e) => t + e.ruimtes.length, 0);
  const apparaten = etages.reduce((t, e) => t + e.ruimtes.reduce((u, r) => u + r.apparaten.length, 0), 0);
  const nogInTeDelen = huisData?.zonderRuimte?.length ?? 0;
  const conf = aansluiting?.configuratie;
  const zonZin = conf ? [conf.panelen?.length ? `${conf.panelen.length} ${conf.panelen.length === 1 ? 'vlak' : 'vlakken'} panelen` : null, conf.zekering ? `${conf.zekering.fasen} × ${conf.zekering.ampere} A` : null].filter(Boolean).join(', ') : '';
  const link = (href, titel, zin) => `<a class="rij" href="${href}"><div class="l"><b>${titel}</b><span>${esc(zin)}</span></div><span class="pijl" aria-hidden="true">›</span></a>`;
  return `<h2 class="kop-3">Je huis</h2>
    ${link('huis-kan.html', 'Wat je huis kan', 'Wat er met je huis kan, en wat er nog bij kan')}
    ${link('indeling.html', 'Kamers en indeling', `${etages.length} etages, ${kamers} kamers, ${apparaten} apparaten${nogInTeDelen ? `, ${nogInTeDelen} nog in te delen` : ''}`)}
    ${link('aansluiting.html', 'Zon en aansluiting', zonZin || 'Je panelen, je zekering en je contract')}
    ${link('meters.html', 'Meters en prijzen', 'Voor Opbrengst')}
    ${link('functies.html', 'Camera’s en deurbel', 'Welke camera’s, en wat er gebeurt als er wordt aangebeld')}`;
}

function inlog() {
  if (!sessie || sessie.toegang !== 'sessions') return '<p class="mini" style="margin: 10px 0">Deze weergave vraagt geen inlog.</p>';
  if (sessie.ingelogd) return `<p class="mini inlog" style="margin: 10px 0">Ingelogd als ${esc(sessie.naam ?? '')}${sessie.rol ? `, ${esc(sessie.rol)}` : ''}. <button type="button" data-uitloggen>Uitloggen</button></p>`;
  return `<p class="mini inlog" style="margin: 10px 0">Niet ingelogd. Kijken kan zo; bedienen en de camera vragen je Home Assistant-account. <a href="auth/login?terug=${encodeURIComponent(location.pathname)}" style="color: var(--ijs); font-weight: 700">Inloggen</a></p>`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  $$('[data-comfort]').forEach((el) => (el.innerHTML = comfort()));
  $$('[data-stuurt]').forEach((el) => (el.innerHTML = stuurt()));
  $$('[data-weet]').forEach((el) => (el.innerHTML = weet()));
  $$('[data-huis]').forEach((el) => (el.innerHTML = jeHuis()));
  $$('[data-inlog]').forEach((el) => (el.innerHTML = inlog()));
  // Op de telefoon staat de kop boven de kaart.
  $$('#tel .kaart > h2:first-child, #tel .kaart > div:first-child > h2').forEach((h) => (h.hidden = true));
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-uitloggen]')) return;
  await fetch('auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  sessie = await haal('api/sessie').catch(() => sessie);
  teken();
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
