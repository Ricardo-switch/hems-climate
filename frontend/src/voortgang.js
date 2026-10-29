/*
 * Hoe ver je huis is (schets Wand-Voortgang en Tel-Voortgang). De zonnewaaier:
 * elke straal is iets dat het huis uit Home Assistant doet, en hoe ver het is
 * van gevonden tot werkt. Rechts wat er samen werkt en wanneer het klimaat
 * zelf regelt (besluit 64), onderaan de weg erheen op schaal van de tijd. Een
 * tik op een straal opent het blad. Wat er staat, rekent stand.js uit.
 */
'use strict';

const { $$, esc, haal } = app;

const d = { site: null, huis: null, functies: null, energie: null, aansluiting: null, state: null, divergence: null, opbrengst: null, zon: null, sluip: null };

async function laadAlles() {
  const deuren = { site: 'api/site', huis: 'api/huis', functies: 'api/functies', energie: 'api/energie', aansluiting: 'api/aansluiting', state: 'api/state', divergence: 'api/divergence', opbrengst: 'api/opbrengst?soort=maand', zon: 'api/zon', sluip: 'api/sluipverbruik' };
  const r = await Promise.allSettled(Object.values(deuren).map((p) => haal(p)));
  Object.keys(deuren).forEach((k, i) => {
    if (r[i].status === 'fulfilled') d[k] = r[i].value;
  });
  teken();
}

const DAG = 86_400_000;
const TREDEN = ['gevonden', 'geleerd', 'kijkt', 'werkt'];
const KLEUR = { ...waaier.KLEUR, uit: 'var(--gedempt)', mis: 'var(--gedempt)' };
/** Dezelfde kleuren als tekst: in het lichte thema donkerder, zodat een getal leesbaar blijft. */
const TEKST = { werkt: 'var(--mint-t)', kijkt: 'var(--ijs-t)', leert: 'var(--violet-t)', uit: 'var(--gedempt)', mis: 'var(--gedempt)' };
const gekozen = () => decodeURIComponent(location.hash.slice(1));
const datum = (ms) => taal.datum(ms, { day: 'numeric', month: 'long' });
const pct = (n) => `${Math.round(n)}%`;
/** Hoe vol tree i (0..3) is, bij voortgang p. */
const vol = (p, i) => Math.max(0, Math.min(1, p * 4 - i));

/* ------------------------------------------------------------ tekenen */

function legenda(v) {
  return ['werkt', 'kijkt', 'leert'].map((s) => (v.tel(s) ? `<span><span class="stip" style="background: ${KLEUR[s]}"></span>${esc(t(`kan.stand.${s}`))} <b>${v.tel(s)}</b></span>` : '')).join('');
}

function tellers(v) {
  const namen = (s) => v.onderwerpen.filter((x) => x.stand === s).map((x) => x.kort.toLowerCase()).join(', ');
  const rij = (n, kleur, titel, zin) => (n ? `<div class="telrij"><span class="getal" style="color: ${kleur}">${n}</span><div><b>${esc(titel)}</b><span>${esc(zin)}</span></div></div>` : '');
  const anders = v.tel('uit') + v.tel('mis');
  return (
    rij(v.tel('werkt'), TEKST.werkt, t('voortgang.werkt'), namen('werkt')) +
    rij(v.tel('kijkt'), TEKST.kijkt, t('voortgang.kijkt'), t('voortgang.kijktZin')) +
    rij(v.tel('leert'), TEKST.leert, t('voortgang.leert'), namen('leert')) +
    rij(anders, 'var(--gedempt)', t('voortgang.uit'), [namen('uit'), namen('mis')].filter(Boolean).join(', '))
  );
}

/** Wanneer het klimaat zelf regelt: de twee assen van de datasetmeter, de winter en samen. */
function zelf(v) {
  const g = v.gereedheid;
  const as = (naam, breed, getal, kleur, samen = false) =>
    `<div class="as${samen ? ' samen-as' : ''}">${samen ? `<b>${esc(naam)}</b>` : `<span>${esc(naam)}</span>`}<div class="balkje"><i style="width: ${Math.min(100, breed)}%${kleur ? `; background: ${kleur}` : ''}"></i></div><span class="getal">${getal}</span></div>`;
  const w = v.winter;
  return `<h3>${esc(t('voortgang.zelf.kop'))}</h3><p>${esc(t(g.totaal >= 100 ? 'voortgang.zelf.klaarZin' : 'voortgang.zelf.zin'))}</p>
    ${as(t('voortgang.as.tijd'), g.tijd, pct(g.tijd))}
    ${as(t('voortgang.as.dekking'), g.dekking, pct(g.dekking), 'var(--mint)')}
    ${w ? as(t('voortgang.as.winter'), (w.dagen / w.doel) * 100, `${Math.floor(w.dagen)}/${w.doel}`, '#cfe9ff') : ''}
    ${as(t('voortgang.as.samen'), g.totaal, pct(g.totaal), 'linear-gradient(90deg, var(--ijs), var(--mint))', true)}`;
}

/**
 * De mijlpalen op de weg naar zelf regelen. De winter telt van december tot en
 * met februari; het moment met genoeg winterdagen is op zijn vroegst, want ook
 * elke stand moet gezien zijn.
 */
function mijlpalen(v) {
  const ds = v.dataset;
  const g = v.gereedheid;
  const nu = Date.now();
  const doel = v.winter?.doel ?? 30;
  const rest = Math.max(0, Math.ceil(doel - (v.winter?.dagen ?? 0)));
  const jaar = new Date(nu).getFullYear();
  const maand = new Date(nu).getMonth();
  const inWinter = maand === 11 || maand <= 1;
  // Het begin en eind van deze of de volgende winter.
  const begin = inWinter ? new Date(maand === 11 ? jaar : jaar - 1, 11, 1).getTime() : new Date(jaar, 11, 1).getTime();
  const eind = new Date(new Date(begin).getFullYear() + 1, 2, 1).getTime();
  let genoeg = null;
  if (rest > 0) {
    const start = Math.max(nu, begin);
    genoeg = start + rest * DAG;
    // Past het niet meer in deze winter, dan de rest in de volgende.
    if (genoeg > eind) genoeg = new Date(new Date(eind).getFullYear(), 11, 1).getTime() + (rest - Math.round((eind - start) / DAG)) * DAG;
  }
  const klaar = g.totaal >= 100;
  const zelfMs = klaar ? nu : (genoeg ?? nu) + 10 * DAG;
  const standen = g.dekking >= 100 ? t('voortgang.weg.standen') : t('voortgang.weg.standenPct', { pct: g.dekking });
  return {
    van: ds.vanMs - 6 * DAG,
    tot: zelfMs + 12 * DAG,
    winter: { van: begin, tot: eind },
    nu,
    genoeg,
    lijst: [
      { ms: ds.vanMs, soort: 'klaar', titel: t('voortgang.weg.begin'), zin: datum(ds.vanMs) },
      { ms: nu, soort: 'nu', titel: t('voortgang.weg.nu'), zin: `${t('voortgang.weg.dagen', { n: Math.round(ds.dagenOpgenomen) })}, ${standen}` },
      !inWinter && begin > nu ? { ms: begin, soort: 'winter', titel: t('voortgang.weg.winter'), zin: t('voortgang.weg.winterZin', { datum: datum(begin) }), alleenTel: true } : null,
      { ms: genoeg ?? nu, soort: genoeg ? '' : 'klaar', titel: t('voortgang.weg.genoeg', { n: doel }), zin: genoeg ? t('voortgang.weg.vroegst', { datum: datum(genoeg) }) : t('voortgang.weg.gehaald') },
      { ms: zelfMs, soort: 'doel', titel: t('voortgang.weg.zelf'), zin: t('voortgang.weg.ja') },
    ].filter(Boolean),
  };
}

/** Op de wand een lijn op schaal; mijlpalen die elkaar raken gaan om en om boven en onder. */
function tijdlijn(m) {
  const x = (ms) => Math.max(0, Math.min(100, ((ms - m.van) / (m.tot - m.van)) * 100));
  let vorige = -100;
  let boven = false;
  const mijlen = m.lijst.filter((p) => !p.alleenTel).map((p) => {
    boven = x(p.ms) - vorige < 16 ? !boven : false;
    vorige = x(p.ms);
    return `<div class="mijl ${p.soort}${boven ? ' boven' : ''}" style="left: ${x(p.ms).toFixed(2)}%"><span class="pin">${p.soort === 'klaar' ? '✓' : ''}</span><b>${esc(p.titel)}</b><small>${esc(p.zin)}</small></div>`;
  });
  return `<div class="lijn"></div>
    <div class="winterband" style="left: ${x(m.winter.van)}%; width: ${x(m.winter.tot) - x(m.winter.van)}%"></div>
    <div class="gedaan" style="width: ${x(m.nu)}%"></div>
    ${mijlen.join('')}`;
}

/** Op de telefoon van boven naar beneden, zonder schaal. */
function stappen(m) {
  return m.lijst.map((p) => `<div class="stap ${p.soort}"><span class="pin">${p.soort === 'klaar' ? '✓' : ''}</span><div><b>${esc(p.titel)}</b><small>${esc(p.zin)}</small></div></div>`).join('');
}

const vier = (x) => [0, 1, 2, 3].map((i) => `<i><u style="width: ${vol(x.p, i) * 100}%; background: ${KLEUR[x.stand]}"></u></i>`).join('');

function lijst(v, keuze) {
  return v.groepen
    .filter((g) => g.onderwerpen.length)
    .map((g) => `<h4>${esc(g.naam)}</h4>${g.onderwerpen.map((x) => `<button type="button" class="rij${x.id === keuze ? ' gekozen' : ''}" data-open="${x.id}"><span class="stip" style="background: ${KLEUR[x.stand]}"></span><b>${esc(x.titel)}</b><small>${esc(x.nu ?? '')}</small><span class="vier" aria-label="${esc(x.label)}">${vier(x)}</span></button>`).join('')}`)
    .join('');
}

/** Het blad van één onderwerp: de vier treden, wat het al weet en wat nog komt. */
function blad(x, v, m) {
  const ladder = TREDEN.map((tr, i) => {
    const n = vol(x.p, i);
    return `<div class="trede${n >= 1 ? ' klaar' : n > 0 ? ' bezig' : ''}" style="${n > 0 ? `color: ${KLEUR[x.stand]}` : ''}"><span>${esc(t(`voortgang.trede.${tr}`))}${n >= 1 ? ' ✓' : ''}</span><i style="width: ${n * 100}%"></i></div>`;
  }).join('');
  const weet = [x.nu, x.extra].filter(Boolean);
  if (x.id === 'optijd' && v.dataset && v.gereedheid) {
    weet.push(t('voortgang.weg.dagen', { n: Math.round(v.dataset.dagenOpgenomen) }));
    weet.push(v.gereedheid.dekking >= 100 ? t('voortgang.weg.standen') : t('voortgang.weg.standenPct', { pct: v.gereedheid.dekking }));
  }
  const komt = [];
  let balk = '';
  if (x.id === 'optijd' && v.winter) {
    komt.push(t('voortgang.komt.optijd', { n: Math.floor(v.winter.dagen), doel: v.winter.doel }));
    if (m?.genoeg) komt.push(t('voortgang.weg.vroegst', { datum: datum(m.genoeg) }));
    balk = `<div class="as" style="margin-top: 6px"><span>${esc(t('voortgang.as.winter'))}</span><div class="balkje"><i style="width: ${Math.min(100, (v.winter.dagen / v.winter.doel) * 100)}%; background: ${KLEUR.leert}"></i></div><span class="getal">${Math.floor(v.winter.dagen)}/${v.winter.doel}</span></div>`;
  } else if (x.id === 'ligging' && x.stand === 'leert') komt.push(t('voortgang.komt.ligging'));
  else if (x.stand === 'kijkt') komt.push(t('voortgang.komt.kijkt'));
  else if (x.stand === 'mis') komt.push(t('voortgang.komt.mis'));
  else if (x.stand === 'uit') komt.push(t('voortgang.komt.uit'));
  const ga = x.stand === 'mis' ? t('kan.ga.mis') : x.stand === 'uit' ? t('kan.ga.uit') : t('kan.ga.bekijken');
  return `<div class="bovenaan"><div><span class="stand ${x.stand}">${esc(x.label)}</span><h2>${esc(x.titel)}</h2><p class="wat">${esc(x.wat)}</p></div><button type="button" class="sluit" data-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
    <div><h4>${esc(t('voortgang.hoeVer'))}</h4><div class="ladder">${ladder}</div></div>
    ${weet.length ? `<div><h4>${esc(t('voortgang.weet'))}</h4><ul class="lijstje">${weet.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    ${komt.length ? `<div><h4>${esc(t('voortgang.komt'))}</h4><ul class="lijstje komt">${komt.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>${balk}</div>` : ''}
    <div class="onder"><a class="hoofd" href="${x.href}">${esc(ga)}</a><a href="huis-kan.html#${encodeURIComponent(x.id)}">${esc(t('voortgang.meer'))}</a></div>`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const v = stand.voortgang(d);
  const tel = app.telStand();
  const keuze = v.onderwerpen.find((x) => x.id === gekozen()) ?? null;
  // Zonder slimme regeling of nog zonder meekijken is er geen weg naar zelf regelen.
  const metWeg = !!(v.dataset && v.gereedheid && (d.site?.zones ?? []).length);
  const m = metWeg ? mijlpalen(v) : null;

  $$('[data-legenda]').forEach((el) => (el.innerHTML = legenda(v)));
  $$('[data-tellers]').forEach((el) => (el.innerHTML = tellers(v)));
  $$('[data-zelf]').forEach((el) => {
    el.hidden = !metWeg;
    if (metWeg) el.innerHTML = zelf(v);
  });
  $$('[data-weg]').forEach((el) => (el.hidden = !metWeg));
  if (m) {
    $$('[data-tijdlijn]').forEach((el) => (el.innerHTML = tijdlijn(m)));
    $$('[data-stappen]').forEach((el) => (el.innerHTML = stappen(m)));
  }
  $$('[data-lijst]').forEach((el) => (el.innerHTML = lijst(v, keuze?.id)));
  $$('[data-samen]').forEach((el) => (el.hidden = !!keuze));
  $$('[data-paneel-blad]').forEach((el) => (el.hidden = !keuze));
  $$('[data-blad]').forEach((el) => {
    el.hidden = !keuze;
    if (keuze) el.innerHTML = blad(keuze, v, m);
  });
  $$('[data-achter]').forEach((el) => (el.hidden = !keuze));

  const svg = document.querySelector(tel ? '[data-waaier="tel"]' : '[data-waaier="groot"]');
  svg.setAttribute('aria-label', t('voortgang.beschrijving', { pct: v.totaal }));
  const maat = tel
    ? { cx: 195, cy: 204, r0: 62, R: 178 }
    : { cx: 370, cy: 392, r0: 88, R: 238, namen: true, groepnamen: true, horizon: 140, ringen: TREDEN.map((tr) => t(`voortgang.ring.${tr}`)) };
  waaier.teken(svg, { groepen: v.groepen, ...maat, getal: `${v.totaal}%`, onder: t('voortgang.zo'), gekozen: keuze?.id ?? null });
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
const sluit = () => {
  history.replaceState(null, '', location.pathname);
  teken();
};
document.addEventListener('click', (e) => {
  const straal = e.target.closest('[data-straal], [data-open]');
  if (straal) {
    const id = straal.dataset.straal ?? straal.dataset.open;
    if (id === gekozen()) sluit();
    else location.hash = id;
  } else if (e.target.closest('[data-sluit], [data-achter]')) sluit();
});
addEventListener('keydown', (e) => {
  const straal = e.target.closest?.('[data-straal]');
  if (straal && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    location.hash = straal.dataset.straal;
  } else if (e.key === 'Escape' && gekozen()) sluit();
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
