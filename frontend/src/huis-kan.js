/*
 * Wat je huis kan (besluit 130, schets Wand-Huis-kan). Alles wat SunArc
 * voor je doet, per onderwerp, en hoe het ervoor staat: werkt, kijkt mee, leert
 * nog, staat uit, vul in, of wat er nodig is. Links het huis met aanwijzers, en
 * wat er het meeste bij zou opleveren, gerekend met je eigen meters. Een tik
 * opent het blad: wat het is, wat het nu doet, hoe het werkt en wanneer.
 * Wat er staat, rekent stand.js uit; deze pagina zet het neer.
 */
'use strict';

const { $$, esc, haal } = app;

const d = { site: null, huis: null, functies: null, energie: null, aansluiting: null, state: null, divergence: null, opbrengst: null, accu: null, thermisch: null, zon: null, klaar: null };
/** Laat alleen deze stand zien, of alles. */
let filter = null;

async function laadAlles() {
  const deuren = { site: 'api/site', huis: 'api/huis', functies: 'api/functies', energie: 'api/energie', aansluiting: 'api/aansluiting', state: 'api/state', divergence: 'api/divergence', opbrengst: 'api/opbrengst?soort=maand', accu: 'api/accu', thermisch: 'api/thermisch', zon: 'api/zon', klaar: 'api/klaarzetten', sluip: 'api/sluipverbruik' };
  const r = await Promise.allSettled(Object.values(deuren).map((p) => haal(p)));
  Object.keys(deuren).forEach((k, i) => {
    if (r[i].status === 'fulfilled') d[k] = r[i].value;
  });
  teken();
}

/** Zes groepen (besluit 187): wat het huis eerst leert staat apart, en de kosten ook. */
const GROEPEN = ['comfort', 'leert', 'zon', 'kosten', 'gemak', 'overzicht'].map((g) => [g, t(`kan.groep.${g}`)]);
const STANDEN = ['werkt', 'kijkt', 'leert', 'mis', 'uit', 'nodig'].map((s) => [s, t(`kan.stand.${s}`)]);
const STIP = { werkt: 'var(--mint)', kijkt: 'var(--ijs)', leert: 'var(--violet)', mis: 'var(--gloed)', uit: 'var(--gedempt)', nodig: 'transparent; box-shadow: inset 0 0 0 1.5px var(--zon)' };
const gekozen = () => decodeURIComponent(location.hash.slice(1));

/* ------------------------------------------------------------ tekenen */

function legenda(lijst) {
  return STANDEN.map(([s, naam]) => {
    const n = lijst.filter((x) => x.stand === s).length;
    return n ? `<button type="button" data-filter="${s}" aria-pressed="${filter === s}"><span class="stip" style="background: ${STIP[s]}"></span>${esc(naam)} <b>${n}</b></button>` : '';
  }).join('');
}

function vakken(lijst) {
  return GROEPEN.map(([g, titel]) => {
    const rijen = lijst.filter((x) => x.groep === g).map((x) => `<button type="button" class="regel${gekozen() === x.id ? ' gekozen' : ''}${filter && x.stand !== filter ? ' weg' : ''}" data-open="${x.id}"><div><b>${esc(x.titel)}</b><span class="nu${x.let ? ' let' : ''}">${esc(x.nu)}</span></div><span class="stand ${x.stand}">${esc(x.label)}</span></button>`).join('');
    return rijen ? `<div class="glas vak${g === 'leert' ? ' leren' : ''}"><h3>${esc(titel)}</h3>${rijen}</div>` : '';
  }).join('');
}

/**
 * Haal er meer uit (besluit 132): de drie beste ideeën, de grootste winst
 * eerst. Een bedrag alleen als je meters het uitrekenen; anders wat het doet.
 */
function meer() {
  const lijst = stand.ideeen(d).slice(0, 3);
  if (!lijst.length) return '';
  const regel = (x) => `<a class="idee" href="${x.id === 'batterij' ? '#batterij' : x.href}"${x.id === 'batterij' ? ' data-open="batterij"' : ''}><div><b>${esc(x.titel)}</b><span>${esc(x.zin)}</span></div><div class="wint${x.euro != null ? '' : ' zacht'}">${x.euro != null ? `± € ${x.euro}<small>${esc(x.wint)}</small>` : esc(x.wint)}</div></a>`;
  return `<div class="glas meer"><span class="wanneer">${esc(t('kan.meer'))}</span>${lijst.map(regel).join('')}</div>`;
}

/**
 * Wanneer de accu bijsprong (besluit 230): per uur van de dag wat hij gemiddeld
 * leverde. Een staaf per uur, de hoogste vol; zes, twaalf en zes uur eronder.
 */
function bijspringen(uren) {
  const top = Math.max(...uren, 0.1);
  const staven = uren.map((k, h) => `<i style="height: ${Math.max(k > 0 ? 6 : 2, Math.round((k / top) * 100))}%"${k > 0 ? ' class="aan"' : ''} title="${String(h).padStart(2, '0')}:00 · ${app.nl(k)} kWh"></i>`).join('');
  return `<div class="uren" role="img" aria-label="${esc(t('kan.accu.urenUitleg'))}">${staven}</div><div class="assen"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>`;
}

/**
 * Hoe je huis warmte vasthoudt (besluit 231): een dag zonder verwarming per
 * kamer (Newton, met de tijdconstante uit je eigen nachten), twee getallen voor
 * de eerste kamer die het zeker weet, en per kamer wat het weet met vier
 * streepjes voor hoe zeker.
 */
const KLEUREN = ['var(--zon)', 'var(--ijs)', 'var(--violet)', 'var(--mint)'];
function thermischBlok(r) {
  const zones = r.zones.filter((z) => z.k != null).slice(0, 4);
  const W = 520, H = 112, L = 34, R = 128, T = 8, B = 18, BUITEN = 5, START = 20;
  const temp = (z, u) => BUITEN + (START - BUITEN) * Math.exp(-u * z.k);
  const laagste = Math.floor(Math.min(...zones.map((z) => temp(z, 24))));
  const x = (u) => L + (u / 24) * (W - L - R);
  const y = (c) => T + ((START - c) / (START - laagste)) * (H - T - B);
  let svg = '';
  for (let c = START; c >= laagste; c--) svg += `<line x1="${L}" x2="${W - R}" y1="${y(c)}" y2="${y(c)}"/><text x="${L - 8}" y="${y(c) + 4}" text-anchor="end">${c}°</text>`;
  svg += [[0, '23:00'], [8, '07:00'], [16, '15:00'], [24, '23:00']].map(([u, tijd]) => `<text x="${x(u)}" y="${H - 3}" text-anchor="${u === 0 ? 'start' : u === 24 ? 'end' : 'middle'}">${tijd}</text>`).join('');
  // De namen naast de lijnen, zonder dat ze op elkaar vallen.
  const eind = zones.map((z, i) => ({ z, i, y: y(temp(z, 24)) })).sort((a, b) => a.y - b.y);
  eind.forEach((e, n) => { if (n > 0) e.y = Math.max(e.y, eind[n - 1].y + 13); });
  for (const e of eind) {
    const kleur = KLEUREN[e.i];
    svg += `<path d="${Array.from({ length: 25 }, (_, u) => `${u ? 'L' : 'M'}${x(u).toFixed(1)},${y(temp(e.z, u)).toFixed(1)}`).join(' ')}" stroke="${kleur}" class="lijn"/><circle cx="${x(24)}" cy="${y(temp(e.z, 24))}" r="3.5" fill="${kleur}"/><text x="${x(24) + 9}" y="${e.y + 4}" class="naam" fill="${kleur}">${esc(e.z.naam)} ${app.nl(temp(e.z, 24))}°</text>`;
  }
  const eerste = zones.find((z) => z.zeker.afkoelen >= 2) ?? zones[0];
  const half = Math.round(((Math.LN2 * eerste.tauUur) / 24) * 2) / 2;
  const streepjes = (n) => `<span class="zeker" aria-label="${esc(t('kan.thermisch.zeker', { n }))}">${[1, 2, 3, 4].map((i) => `<i${i <= n ? ' class="ja"' : ''}></i>`).join('')}</span>`;
  const teken = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${app.nl(Math.abs(v), d)}°`;
  // Een apparaat heet zonder de naam van zijn kamer: "Airco", niet "Airco woonkamer".
  const kort = (a, z) => {
    const i = a.naam.toLowerCase().indexOf(z.naam.toLowerCase());
    return (i < 0 ? a.naam : `${a.naam.slice(0, i)} ${a.naam.slice(i + z.naam.length)}`.replace(/\s+/g, ' ').trim()) || a.naam;
  };
  const regel = (label, waarde, n, nog) => `<div class="weet"><span title="${esc(label)}">${esc(label)}</span>${nog ? `<b class="nog">${esc(waarde)}</b>` : `<b>${esc(waarde)}</b>`}${streepjes(n)}</div>`;
  const kamers = zones.map((z, i) => `<div><h5><i style="background: ${KLEUREN[i]}"></i>${esc(z.naam)}</h5>
      ${regel(t('kan.thermisch.afkoelen'), `${teken(z.k * 10, 2).replace('+', '')}`, z.zeker.afkoelen)}
      ${regel(t('kan.thermisch.zon'), z.zonPerKw == null ? t('kan.thermisch.nogNiet') : teken(z.zonPerKw, 1), z.zeker.zon, z.zonPerKw == null)}
      ${z.apparaten.map((a) => regel(t(`kan.thermisch.${a.stand}`, { naam: kort(a, z) }), a.perUur != null ? teken(a.perUur, 1) : t(a.kwartieren >= 8 ? 'kan.thermisch.onduidelijk' : 'kan.thermisch.nogNiet'), a.zeker, a.perUur == null)).join('')}</div>`).join('');
  return `<div class="thermisch">
      <div class="bovenin">
        <div class="grafiek"><h4>${esc(t('kan.thermisch.dag', { buiten: BUITEN }))}</h4><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('kan.thermisch.dagUitleg'))}">${svg}</svg></div>
        <div class="vast"><div><div class="getal">${teken(-eerste.k * 10 * 8, 1)}<small>${esc(t('kan.thermisch.inEenNacht'))}</small></div><p>${esc(t('kan.thermisch.nachtZin', { kamer: eerste.naam.toLowerCase() }))}</p></div>
          <div><div class="getal klein">± ${app.nl(half, half % 1 ? 1 : 0)} ${esc(t(half === 1 ? 'kan.thermisch.dag1' : 'kan.thermisch.dagen'))}</div><p>${esc(t('kan.thermisch.halfZin', { kamer: eerste.naam.toLowerCase() }))}</p></div></div>
      </div>
      <div class="kamers" style="--n: ${zones.length}">${kamers}</div>
    </div>`;
}

function blad(x) {
  const a = x.som;
  const maat = (k) => app.nl(k, k % 1 ? 1 : 0);
  // Een heel jaar heet zo; korter gemeten, dan het aantal dagen.
  const zin = a
    ? [
        t(a.dagen >= 360 ? 'kan.accu.zinJaar' : 'kan.accu.zin', { dagen: a.dagen, net: app.nl(a.vanNetKwh, 0), gedekt: app.nl(a.gedektKwh, 0), tekort: app.nl(a.tekortKwh, 0), kwh: maat(a.kwh) }),
        a.legeDagen ? t('kan.accu.leeg', { n: a.legeDagen, dagen: a.dagen }) : '',
        a.groter ? (a.groter.meerKwh >= 1 ? t('kan.accu.groter', { kwh: maat(a.groter.kwh), meer: app.nl(a.groter.meerKwh, 0) }) : t('kan.accu.groterNiet')) : '',
        t('kan.accu.schatting'),
      ].filter(Boolean).join(' ')
    : '';
  const som = a
    ? `<div class="som"><div class="somtop"><div><h4>${esc(t('kan.accu.past'))}</h4><div class="getal">${maat(a.kwh)} <small>kWh</small></div></div><div><h4>${esc(t('kan.opleveren'))}</h4><div class="getal">± € ${a.euro} <small>${esc(t('kan.perMaand'))}</small></div></div></div>
        <p class="mini" style="margin: 8px 0 0">${esc(zin)}</p>
        <h4 style="margin-top: 12px">${esc(t('kan.accu.wanneer'))}</h4>${bijspringen(a.uren)}</div>`
    : '';
  // Wat er nodig is, koop je zelf; dan is er geen knop, behalve naar wat het nu oplevert.
  const ga = x.ga ?? (x.stand === 'mis' ? t('kan.ga.mis') : x.stand === 'uit' ? t('kan.ga.uit') : x.stand === 'nodig' ? (x.som ? t('kan.ga.opbrengst') : null) : t('kan.ga.bekijken'));
  // Waar het werkt (besluit 132): per kamer, en wat er nog kan als idee, niet als tekort.
  const waar = x.waar?.length
    ? `<div><h4>${esc(t('kan.waar'))}</h4><div class="waar">${x.waar.map((k) => `<div class="kamerkaart"><b>${esc(k.naam)}</b><span>${esc(k.wat)}</span></div>`).join('')}</div></div>`
    : x.som || x.thermisch ? '' : `<div class="nu"><span class="stand ${x.stand}">${esc(t('kan.nu'))}</span>${esc(x.nu)}</div>`;
  const idee = x.idee ? `<a class="kanook" href="${x.idee.href}"><span class="wanneer">${esc(t('kan.idee'))}</span><b>${esc(x.idee.titel)}</b><p>${esc(x.idee.zin)}, ${esc(x.idee.wint)}.</p><span class="knop">${esc(t(x.idee.soort === 'aan' ? 'kan.zetAan' : 'kan.bekijk'))}</span></a>` : '';
  return `<div class="bovenaan"><div><span class="stand ${x.stand}">${esc(x.label)}</span><h2 class="kop-2" style="margin-top: 10px">${esc(x.titel)}</h2><p class="lead" style="margin-top: 4px; max-width: 52ch">${esc(x.wat)}</p>${x.extra ? `<p class="mini" style="margin: 6px 0 0">${esc(x.extra)}</p>` : ''}</div><button type="button" class="sluit" data-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    ${waar}
    ${idee}
    ${som}
    ${x.thermisch ? thermischBlok(x.thermisch) : ''}
    <div class="twee"><div><h4>${esc(t('kan.zoWerkt'))}</h4><ul class="lijst">${x.zo.map((z) => `<li>${esc(z)}</li>`).join('')}</ul></div><div><h4>${esc(x.wanneerKop ?? t('kan.wanneerWerkt'))}</h4><ul class="lijst">${x.wanneer.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>
    ${ga ? `<div class="onder"><a href="${x.gaHref ?? x.href}">${esc(ga)}</a></div>` : ''}`;
}

/*
 * Klaarzetten in Home Assistant (besluit 179): wat SunArc er gebruikt,
 * per groep, en of het er staat. Groen staat klaar, oranje mist voor de
 * regeling, grijs maakt een functie mogelijk. Een tik opent dat scherm van
 * Home Assistant; buiten Home Assistant staat erbij waar het is.
 */
const KLAAR_GROEPEN = ['basis', 'klimaat', 'energie', 'bewoners', 'gemak', 'praten', 'wand'].map((g) => [g, t(`kan.klaar.${g}`)]);
const KLAAR_STIP = { klaar: 'var(--mint)', mist: 'var(--gloed)', optioneel: 'var(--gedempt)' };
const klaarPunten = () => d.klaar?.punten ?? [];

function klaarKnop() {
  const punten = klaarPunten();
  if (!punten.length) return '';
  const mist = punten.filter((p) => p.stand === 'mist').length;
  return `<button type="button" class="klaarknop" data-open="klaarzetten"><span class="stip" style="background: ${mist ? 'var(--gloed)' : 'var(--mint)'}"></span>${esc(t('kan.klaar.inHA'))} <b>${esc(mist ? t('instellingen.mist', { n: mist }) : t('kan.klaar.klaar'))}</b></button>`;
}

function klaarBlad() {
  const punten = klaarPunten();
  const inHA = app.inHA();
  const regel = (p) => `<div class="klaarregel ${p.stand}"><span class="stip" style="background: ${KLAAR_STIP[p.stand]}"></span><div><b>${esc(p.titel)}</b><span>${esc(p.zin)}</span>${!inHA && p.waar && p.stand !== 'klaar' ? `<small>${esc(p.waar)}</small>` : ''}</div>${inHA && p.pad ? `<button type="button" class="knop" data-ha-pad="${esc(p.pad)}" aria-label="${esc(t('kan.klaar.openIn', { titel: p.titel }))}">${esc(t('kan.klaar.open'))}</button>` : ''}</div>`;
  const groepen = KLAAR_GROEPEN.map(([g, titel]) => {
    const hier = punten.filter((p) => p.groep === g);
    return hier.length ? `<div class="klaargroep"><h4>${esc(titel)}</h4>${hier.map(regel).join('')}</div>` : '';
  }).join('');
  return `<div class="bovenaan"><div><h2 class="kop-2">${esc(t('kan.klaar.kop'))}</h2><p class="lead" style="margin-top: 4px; max-width: 52ch">${esc(t('kan.klaar.lead'))}</p></div><button type="button" class="sluit" data-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    ${groepen}`;
}

/** Hoe ver je huis is: de kleine zonnewaaier als knop naar die pagina. */
function voortgangKnop() {
  const v = stand.voortgang(d);
  if (!v.onderwerpen.length) return '';
  return `<a class="voortgangknop" href="voortgang.html"><svg viewBox="0 0 190 110" aria-hidden="true" data-mini></svg><span><b>${esc(t('voortgang.knop'))}</b><span class="zin">${esc(t('voortgang.knopZin', { pct: v.totaal, n: v.tel('werkt'), totaal: v.onderwerpen.length }))}</span></span><span class="pct">${v.totaal}%</span><span class="pijl" aria-hidden="true">›</span></a>`;
}

/** Het huis, met aanwijzers naar wat het doet en wat erbij kan. */
function huisModel(lijst) {
  const per = (id) => lijst.find((x) => x.id === id);
  // De tekening uit huismodel, net als op Thuis (5S).
  const tek = huismodel.tekening(d.huis, { zon: d.zon, kamer: (r) => ({ ...huismodel.kamerModel(r, d.state), stil: true, temp: null, zin: null }) });
  const { etages } = tek;
  const piekW = tek.piekW;
  const label = (bij, id, dx, dy) => {
    const x = per(id);
    return x ? { bij, titel: t(`kan.kort.${id}`), toon: { werkt: 'mint', kijkt: 'ijs', leert: 'violet', mis: 'gloed', uit: 'zacht', nodig: 'zon' }[x.stand], regels: [x.label.toLowerCase()], dx, dy } : null;
  };
  const kamer = etages[0]?.kamers?.[0]?.naam;
  return {
    beschrijving: t('kan.beschrijving'),
    tijd: 'dag',
    zon: { stand: 0.62, hoogte: 0.8, aandeel: 0.6, ...huismodel.panelenOpDak(d.aansluiting?.antwoorden?.panelen, piekW) },
    wolken: 0.2,
    // Het huis zelf, zoals elke pagina het tekent (besluit 191): de kelder, de tuin met de jacuzzi en de garage.
    ...huismodel.huisDelen(tek, d.aansluiting?.antwoorden?.elders),
    buitenunit: per('opzon') ? { aan: false } : null,
    net: true,
    spook: ['batterij', 'auto'],
    labels: [
      piekW > 0 ? label('panelen', per('ligging') ? 'ligging' : 'opzon', 40, -60) : null,
      label('boiler', 'boiler', -60, 70),
      kamer ? label(`kamer:${kamer}`, 'temperatuur', 0, 40) : null,
      label('batterij', 'batterij', -60, 150),
      label('auto', 'auto', 30, -120),
    ].filter(Boolean),
  };
}

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const lijst = stand.kan(d);
  $$('[data-legenda]').forEach((el) => (el.innerHTML = legenda(lijst)));
  $$('[data-vakken]').forEach((el) => (el.innerHTML = vakken(lijst)));
  $$('[data-meer]').forEach((el) => (el.innerHTML = meer()));
  $$('[data-klaarknop]').forEach((el) => (el.innerHTML = klaarKnop()));
  $$('[data-voortgangknop]').forEach((el) => (el.innerHTML = voortgangKnop()));
  const v = stand.voortgang(d);
  $$('[data-mini]').forEach((svg) => waaier.teken(svg, { groepen: v.groepen, cx: 95, cy: 104, r0: 32, R: 92, groei: false, knoppen: false }));
  const klaarOpen = gekozen() === 'klaarzetten' && klaarPunten().length > 0;
  const x = klaarOpen ? null : lijst.find((y) => y.id === gekozen());
  $$('[data-blad]').forEach((el) => {
    el.hidden = !x && !klaarOpen;
    if (klaarOpen) el.innerHTML = klaarBlad();
    else if (x) el.innerHTML = blad(x);
  });
  $$('[data-achter]').forEach((el) => (el.hidden = !x && !klaarOpen));
  if (!d.huis) return;
  const tel = app.telStand();
  const podium = document.getElementById(tel ? 'podium-tel' : 'podium-wand');
  // Op de telefoon zonder aanwijzers: daar is het huis te smal voor kaartjes ernaast.
  const model = huisModel(lijst);
  if (tel) model.labels = [];
  huis.teken(podium, model, { breedte: podium.clientWidth || 440, hoogte: tel ? 300 : podium.clientHeight || 470, marge: tel ? 0.03 : 0.04, schuifY: tel ? 0 : 20 });
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  const f = e.target.closest('[data-filter]');
  const ha = e.target.closest('[data-ha-pad]');
  if (ha) app.naarHAScherm(ha.dataset.haPad);
  else if (open) location.hash = open.dataset.open;
  else if (e.target.closest('[data-sluit], [data-achter]')) history.replaceState(null, '', location.pathname), teken();
  else if (f) {
    filter = filter === f.dataset.filter ? null : f.dataset.filter;
    teken();
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gekozen()) {
    history.replaceState(null, '', location.pathname);
    teken();
  }
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
