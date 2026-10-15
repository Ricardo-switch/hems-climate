/*
 * Comfort (besluit 130, schets Wand-Instellingen-Comfort): per kamer hoe warm
 * of koel, per dagdeel, en de uren van de dagdelen. Per dagdeel een balk:
 * onder de oranje greep warmt het huis op, boven de blauwe koelt het, daartussen
 * is het goed. Slepen of met de pijltjes; wat je loslaat, wordt meteen bewaard
 * en de regeling rekent er direct mee.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let comfort = null;
let state = null;
let zon = null;
/** Welke regels hun uitleg tonen (besluit 133): "kamer:dagdeel:soort". */
const open = new Set();
/** De kamer die Afwezig en vakantie laat zien. */
let afwezigKamer = null;
/** Dagdelen waarin het huis niet op zon laadt, zoals in pv-surplus. */
const ZONLOOS = new Set(['nacht', 'vakantie']);

/** De schaal van de balk, in graden. */
const MIN = 10;
const MAX = 30;
const pct = (c) => ((Math.max(MIN, Math.min(MAX, c)) - MIN) / (MAX - MIN)) * 100;
const graden = (c) => `${nl(c, Number.isInteger(c) ? 0 : 1)}°`;
const MODI = ['dag', 'nacht', 'afwezig', 'vakantie'];
/** Een nieuw doel als je verwarmen of koelen aanzet in een dagdeel. */
const NIEUW = { heat: { dag: 20, nacht: 17, afwezig: 16, vakantie: 12 }, cool: { dag: 24, nacht: 24, afwezig: 26, vakantie: 28 } };

async function laadAlles() {
  const [c, s, z] = await Promise.allSettled([haal('api/comfort'), haal('api/state'), haal('api/zon')]);
  if (c.status === 'fulfilled') comfort = c.value;
  if (s.status === 'fulfilled') state = s.value;
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

/* ------------------------------------------------------------ de delen */

function samenvatting(k) {
  const d = k.modi.dag;
  const n = k.modi.nacht;
  const getal = (c) => nl(c, Number.isInteger(c) ? 0 : 1);
  const dag = d.heat != null && d.cool != null ? `overdag ${getal(d.heat)} tot ${graden(d.cool)}` : d.heat != null ? `overdag ${graden(d.heat)}` : d.cool != null ? `overdag tot ${graden(d.cool)}` : 'overdag niets';
  return n.heat != null && n.heat !== d.heat ? `${dag}, 's nachts ${graden(n.heat)}` : dag;
}

function delen() {
  if (!comfort) return [];
  const leeg = (k) => MODI.every((m) => k.modi[m].heat == null && k.modi[m].cool == null);
  const d = comfort.dagdelen;
  return [
    { kop: 'Kamers' },
    ...comfort.kamers.map((k) => ({ id: k.id, titel: k.naam, zin: samenvatting(k), stand: leeg(k) ? 'leeg' : 'goed' })),
    { kop: 'Het hele huis' },
    { id: 'dagdelen', titel: 'Dagdelen', zin: `dag ${d.dag}:00, nacht ${d.nacht}:00`, stand: 'goed' },
    { id: 'afwezig', titel: 'Afwezig en vakantie', zin: 'per kamer, vanzelf of zelf', stand: 'goed' },
  ];
}

/* ------------------------------------------------------------ een kamer */

function wanneer(m) {
  const d = comfort.dagdelen;
  return { dag: `${d.dag}:00 tot ${d.nacht}:00`, nacht: `${d.nacht}:00 tot ${d.voorverwarmen}:00`, afwezig: 'als niemand thuis is', vakantie: 'als jij het aanzet' }[m];
}
const NAAM = { dag: 'Overdag', nacht: "'s Nachts", afwezig: 'Afwezig', vakantie: 'Vakantie' };

/** Tot waar het op zon mag, per soort, of null (besluit 133). */
function zonGrens(k, m, soort) {
  const p = k.modi[m];
  if (ZONLOOS.has(m) || !(k.opZonC > 0)) return null;
  if (soort === 'heat' && p.heat != null && k.opZon?.verwarmen) return p.heat + k.opZonC;
  if (soort === 'cool' && p.cool != null && k.opZon?.koelen) return p.cool - k.opZonC;
  return null;
}

function schaal(k, m) {
  const p = k.modi[m];
  const zw = zonGrens(k, m, 'heat');
  const zk = zonGrens(k, m, 'cool');
  const zonStuk = (a, b) => `<div class="zonband" style="left: ${pct(Math.min(a, b)).toFixed(2)}%; width: ${Math.abs(pct(b) - pct(a)).toFixed(2)}%"></div>`;
  const zonStip = [zw, zk].filter((x) => x != null).map((x) => `<span class="zonstip" style="left: ${pct(x).toFixed(2)}%" title="op zon"></span>`).join('');
  const goed = p.heat != null && p.cool != null ? [pct(p.heat), pct(p.cool)] : p.heat != null ? [pct(p.heat), 100] : p.cool != null ? [0, pct(p.cool)] : null;
  const greep = (soort, c) => `<button type="button" class="greep" role="slider" aria-label="${soort === 'heat' ? 'Verwarmen onder' : 'Koelen boven'}, ${NAAM[m].toLowerCase()}" aria-valuemin="${MIN}" aria-valuemax="${MAX}" aria-valuenow="${c}" aria-valuetext="${graden(c)}" data-greep="${soort}" style="left: ${pct(c).toFixed(2)}%"><i style="background: ${soort === 'heat' ? 'var(--gloed)' : 'var(--ijs)'}"></i></button>`;
  const maten = [MIN, ...(p.heat != null ? [p.heat] : []), ...(p.cool != null ? [p.cool] : []), MAX];
  return `<div class="schaal" data-schaal="${m}">
    <div class="baan"></div>
    ${goed ? `<div class="goed" style="left: ${goed[0].toFixed(2)}%; width: ${(goed[1] - goed[0]).toFixed(2)}%"></div>` : ''}
    ${zw != null ? zonStuk(p.heat, zw) : ''}${zk != null ? zonStuk(zk, p.cool) : ''}${zonStip}
    ${p.heat != null ? greep('heat', p.heat) : ''}${p.cool != null ? greep('cool', p.cool) : ''}
    ${maten.map((c) => `<span class="maat" style="left: ${pct(c).toFixed(2)}%">${graden(c)}</span>`).join('')}
    ${p.heat == null && p.cool == null ? '<span class="niets">doet niets</span>' : ''}
  </div>`;
}

/**
 * Per dagdeel een regel voor verwarmen en een voor koelen (besluit 133, schets
 * Wand-Comfort-Regels): rechts een schakelaar. Wanneer het aan- en uitgaat en
 * wat op zon gebeurt, staat eronder na een tik op de regel.
 */
function regels(k, m) {
  const p = k.modi[m];
  const regel = (soort) => {
    const kan = soort === 'heat' ? k.kanVerwarmen : k.kanKoelen;
    if (!kan) return '';
    const v = p[soort];
    const aan = v != null;
    const sleutel = `${k.id}:${m}:${soort}`;
    const h = k.hysterese ?? { aan: 0.3, uit: 0.2 };
    const zg = zonGrens(k, m, soort);
    let uitleg;
    if (soort === 'heat') {
      uitleg = aan ? `Aan onder ${graden(v - h.aan)}, uit bij ${graden(v + h.uit)}.${zg != null ? ` <span class="z">Op zon tot ${graden(zg)}.</span>` : ''}` : 'Zet hem aan voor een temperatuur.';
    } else {
      const net = k.koeltVanNet ? (aan ? `Aan boven ${graden(v + h.aan)}, uit bij ${graden(v - h.uit)}.` : '') : k.nooitWarmerC != null ? `Van het net pas boven ${graden(k.nooitWarmerC)}.` : 'Van het net niet.';
      uitleg = aan ? `${zg != null ? `<span class="z">Op zon al vanaf ${graden(zg)}.</span> ` : ''}${net}` : `Zonder koelen, ${k.nooitWarmerC != null && !k.koeltVanNet ? `behalve boven ${graden(k.nooitWarmerC)}.` : 'ook niet van het net.'}`;
    }
    const kleur = soort === 'heat' ? 'var(--gloed)' : 'var(--ijs)';
    const wat = soort === 'heat' ? 'Verwarmen' : 'Koelen';
    const label = aan ? `${wat} <em>${soort === 'heat' ? 'onder' : 'boven'}</em> <b>${graden(v)}</b>` : `${wat} uit`;
    return `<div class="regel${aan ? '' : ' uit'}${open.has(sleutel) ? ' open' : ''}">
      <button type="button" class="wat" data-uitleg="${esc(sleutel)}" aria-expanded="${open.has(sleutel)}"><i style="background: ${aan ? kleur : 'var(--gedempt)'}"></i>${label}</button>
      <button type="button" class="schakel ${soort}" role="switch" aria-checked="${aan}" aria-label="${wat}, ${NAAM[m].toLowerCase()}" ${aan ? `data-uit="${soort}"` : `data-aan="${soort}"`}></button>
      ${open.has(sleutel) ? `<small>${uitleg}</small>` : ''}
    </div>`;
  };
  return `<div class="regels">${regel('heat')}${regel('cool')}</div>`;
}

/** Een dagdeel: de naam, de balk en de twee regels. */
function band(k, m) {
  return `<div class="band" data-modus="${m}"><div class="naam"><b>${NAAM[m]}</b><span>${esc(wanneer(m))}</span></div>${schaal(k, m)}${regels(k, m)}</div>`;
}

/** Zon en net, per kamer (besluit 133): hoeveel verder op zon, en of koelen van het net mag. */
function zonEnNet(k) {
  const zon = k.opZon?.verwarmen || k.opZon?.koelen
    ? `<div class="blok"><span class="label"><span class="stip" style="background: var(--zon)"></span>Op zon mag het</span>
        <div class="keuze" role="group" aria-label="Op zon mag het">${[[0, 'Niet'], [0.5, '½°'], [1, '1°'], [2, '2°']].map(([v, t]) => `<button type="button" data-opzon="${v}" aria-pressed="${k.opZonC === v}">${t}</button>`).join('')}</div>
        <p class="uitleg">verder dan je doel${k.opZon.koelen && k.opZon.verwarmen ? ', koeler of warmer' : k.opZon.koelen ? ', koeler' : ', warmer'}. Zo bewaart de kamer de zon van de middag voor later.</p></div>`
    : '';
  const net = k.kanKoelen && !k.koeltVanNet
    ? `<div class="blok"><span class="label"><span class="stip" style="background: var(--ijs)"></span>Koelen van het net</span>
        ${k.nooitWarmerC != null
          ? `<div class="stapper"><button type="button" data-plafond="-0.5" aria-label="Lager">−</button><b>boven ${graden(k.nooitWarmerC)}</b><button type="button" data-plafond="0.5" aria-label="Hoger">+</button><button type="button" class="geen" data-plafond="geen">Nooit</button></div>`
          : '<div class="keuze" role="group" aria-label="Koelen van het net"><button type="button" aria-pressed="true">Nooit</button><button type="button" data-plafond="aan" aria-pressed="false">Boven een temperatuur</button></div>'}
        <p class="uitleg">${k.nooitWarmerC != null ? 'Zonder zon koelt de airco alleen als het warmer wordt dan dit.' : 'Zonder zon koelt de airco niet.'}</p></div>`
    : '';
  return zon || net ? `<div class="zonnet">${zon}${net}</div>` : '';
}

function kamerVorm(k) {
  const pz = state?.explanation?.perZone?.find((z) => z.zoneId === k.id);
  const nu = pz?.temperatureC;
  // Overdag en 's nachts; afwezig en vakantie hebben hun eigen deel (besluit 133).
  const banden = ['dag', 'nacht'].map((m) => band(k, m)).join('');
  const voorrang = `<div><span class="label">Voorrang bij weinig zon</span><div class="keuze" role="group" aria-label="Voorrang">${[[1, 'Eerst'], [2, 'Daarna'], [3, 'Laatst']].map(([v, t]) => `<button type="button" data-voorrang="${v}" aria-pressed="${k.voorrang === v}">${t}</button>`).join('')}</div><p class="uitleg">Is er zon voor één apparaat, dan gaat de kamer met voorrang eerst.</p></div>`;
  return `<div class="bovenrij"><h2 class="kop-2">${esc(k.naam)}</h2>${nu != null ? `<span class="nu-temp">nu <b>${graden(Math.round(nu * 10) / 10)}</b></span>` : ''}</div>
    ${banden}
    ${zonEnNet(k)}
    <div class="rij2">${voorrang}</div>`;
}

function dagbalk() {
  const d = comfort.dagdelen;
  const stuk = (van, tot, kleur) => (tot > van ? `<i style="flex: ${tot - van}; background: ${kleur}"></i>` : '');
  const nacht = 'rgba(143, 134, 255, 0.35)';
  return `<div class="dag" aria-hidden="true">${stuk(0, d.voorverwarmen, nacht)}${stuk(d.voorverwarmen, d.dag, 'rgba(255, 122, 77, 0.35)')}${stuk(d.dag, d.nacht, 'rgba(110, 231, 183, 0.35)')}${stuk(d.nacht, 24, nacht)}</div>
    <div class="dagmaat">${[0, d.voorverwarmen, d.dag, d.nacht].map((u) => `<span style="left: ${((u / 24) * 100).toFixed(1)}%">${u}</span>`).join('')}</div>
    <div class="daglegenda"><span><i style="background: rgba(255, 122, 77, 0.7)"></i>voorverwarmen</span><span><i style="background: rgba(110, 231, 183, 0.7)"></i>overdag</span><span><i style="background: rgba(143, 134, 255, 0.7)"></i>nacht</span></div>`;
}

function dagdelenVorm() {
  const d = comfort.dagdelen;
  const uur = (sleutel, titel) => `<div><span class="label" style="font-size: 14.5px; font-weight: 600; display: block; margin-bottom: 6px">${titel}</span><div class="stapper"><button type="button" data-uur="${sleutel}:-1" aria-label="Eerder">−</button><b>${d[sleutel]}:00</b><button type="button" data-uur="${sleutel}:1" aria-label="Later">+</button></div></div>`;
  return `<h2 class="kop-2">Dagdelen</h2>
    <p class="klein" style="margin: 0">Voor het hele huis. 's Ochtends warmt het huis voor tot de temperatuur van overdag; 's nachts geldt de nachttemperatuur van elke kamer.</p>
    <div class="uren">${uur('voorverwarmen', 'Voorverwarmen vanaf')}${uur('dag', 'Overdag vanaf')}${uur('nacht', 'Nacht vanaf')}</div>
    ${dagbalk()}`;
}

function afwezigVorm() {
  const k = comfort.kamers.find((x) => x.id === afwezigKamer) ?? comfort.kamers[0];
  if (!k) return '<h2 class="kop-2">Afwezig en vakantie</h2>';
  afwezigKamer = k.id;
  return `<h2 class="kop-2">Afwezig en vakantie</h2>
    <p class="klein" style="margin: 0">Afwezig gaat vanzelf als niemand thuis is. Vakantie zet je zelf, op Thuis bij de stand bovenin.</p>
    <div class="kamerkeuze" role="group" aria-label="Kamer">${comfort.kamers.map((x) => `<button type="button" data-afwezig-kamer="${esc(x.id)}" aria-pressed="${x.id === k.id}">${esc(x.naam)}</button>`).join('')}</div>
    ${band(k, 'afwezig')}${band(k, 'vakantie')}`;
}

function naast(id) {
  const k = comfort.kamers.find((x) => x.id === id);
  const kort = k ? state?.bewoner?.kamers?.find((x) => x.zoneId === k.id)?.kort : null;
  return `${kort ? `<div class="glas"><h3>Nu</h3><p style="margin: 0">${esc(kort)}</p></div>` : ''}
    <div class="glas"><h3>Zo gebruikt het huis dit</h3>
      <p style="margin: 0 0 10px">Tussen de twee grepen is het goed: dan doet het huis niets. Het gele stuk is waar het op zon naartoe mag. Tik op een regel om te zien wanneer het aan- en uitgaat.</p>
      ${dagbalk()}
    </div>`;
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!comfort) return;
  // Niet onder de vinger opnieuw opbouwen.
  if (sleept) return;
  const nu = groep.tekenDelen(delen());
  const k = comfort.kamers.find((x) => x.id === nu);
  const vorm = k ? kamerVorm(k) : nu === 'dagdelen' ? dagdelenVorm() : afwezigVorm();
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(nu)));
}

/* ------------------------------------------------------------ bewaren */

function bewaar() {
  const body = {
    kamers: Object.fromEntries(comfort.kamers.map((k) => [k.id, { modi: k.modi, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }])),
    dagdelen: comfort.dagdelen,
  };
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/comfort', body);
    if (uit?.ok) {
      comfort = uit.antwoord;
      teken();
    } else if (uit && !uit.ok) {
      // Niet aangenomen: terug naar wat de dienst heeft.
      void laadAlles();
    }
    return uit;
  });
}

/** De kamer die nu getoond wordt: de gekozen kamer, of bij Afwezig en vakantie die daar. */
const huidig = () => {
  const nu = groep.actief(delen());
  return comfort?.kamers.find((x) => x.id === (nu === 'afwezig' ? afwezigKamer : nu));
};

/** Een greep op een nieuwe waarde, met minstens een graad tussen verwarmen en koelen. */
function zet(k, m, soort, c) {
  const p = { ...k.modi[m] };
  const [lo, hi] = soort === 'heat' ? [Math.max(MIN, comfort.bereik.verwarmen.min), Math.min(MAX, comfort.bereik.verwarmen.max)] : [Math.max(MIN, comfort.bereik.koelen.min), Math.min(MAX, comfort.bereik.koelen.max)];
  let v = Math.round(Math.max(lo, Math.min(hi, c)) * 2) / 2;
  if (soort === 'heat' && p.cool != null) v = Math.min(v, p.cool - 1);
  if (soort === 'cool' && p.heat != null) v = Math.max(v, p.heat + 1);
  p[soort] = v;
  k.modi = { ...k.modi, [m]: p };
}

/** Werkt de balk bij zonder alles opnieuw te tekenen, tijdens het slepen. */
function balkBij(rij, k, m) {
  const tmp = document.createElement('div');
  tmp.innerHTML = schaal(k, m) + regels(k, m);
  rij.querySelector('.schaal').replaceWith(tmp.querySelector('.schaal'));
  rij.querySelector('.regels').replaceWith(tmp.querySelector('.regels'));
}

let sleept = false;

document.addEventListener('pointerdown', (e) => {
  const greep = e.target.closest('[data-greep]');
  const k = huidig();
  if (!greep || !k) return;
  e.preventDefault();
  const rij = greep.closest('[data-modus]');
  const m = rij.dataset.modus;
  const soort = greep.dataset.greep;
  sleept = true;
  const waarde = (ev) => {
    // Elke keer opnieuw zoeken: tijdens het slepen wordt de balk vervangen.
    const r = rij.querySelector('.schaal').getBoundingClientRect();
    return MIN + ((ev.clientX - r.left) / r.width) * (MAX - MIN);
  };
  const beweeg = (ev) => {
    zet(k, m, soort, waarde(ev));
    balkBij(rij, k, m);
  };
  const los = () => {
    removeEventListener('pointermove', beweeg);
    sleept = false;
    bewaar();
    teken();
  };
  addEventListener('pointermove', beweeg);
  addEventListener('pointerup', los, { once: true });
  addEventListener('pointercancel', los, { once: true });
});

document.addEventListener('keydown', (e) => {
  const greep = e.target.closest?.('[data-greep]');
  const k = huidig();
  if (!greep || !k || !['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const m = greep.closest('[data-modus]').dataset.modus;
  const soort = greep.dataset.greep;
  zet(k, m, soort, k.modi[m][soort] + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.5 : 0.5));
  teken();
  bewaar();
  $$(`[data-modus="${m}"] [data-greep="${soort}"]`).forEach((g) => g.closest('#wand, #tel')?.offsetParent && g.focus());
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || !comfort) return;
  const k = huidig();
  const rij = t.closest('[data-modus]');
  if (t.dataset.uitleg) {
    // Alleen tonen of verbergen; niets te bewaren.
    if (open.has(t.dataset.uitleg)) open.delete(t.dataset.uitleg);
    else open.add(t.dataset.uitleg);
    return teken();
  }
  if (t.dataset.afwezigKamer) {
    afwezigKamer = t.dataset.afwezigKamer;
    return teken();
  }
  if (k && t.dataset.opzon != null) {
    k.opZonC = Number(t.dataset.opzon);
  } else if (k && rij && (t.dataset.aan || t.dataset.uit)) {
    const m = rij.dataset.modus;
    if (t.dataset.aan) zet(k, m, t.dataset.aan, NIEUW[t.dataset.aan][m]);
    else k.modi = { ...k.modi, [m]: { ...k.modi[m], [t.dataset.uit]: null } };
  } else if (k && t.dataset.plafond) {
    const v = t.dataset.plafond;
    const { min, max } = comfort.bereik.plafond;
    if (v === 'geen') k.nooitWarmerC = null;
    else if (v === 'aan') k.nooitWarmerC = Math.max(min, (k.modi.dag.cool ?? 24) + 2);
    else k.nooitWarmerC = Math.max(min, Math.min(max, (k.nooitWarmerC ?? 26) + Number(v)));
  } else if (k && t.dataset.voorrang) {
    k.voorrang = Number(t.dataset.voorrang);
  } else if (t.dataset.uur) {
    const [sleutel, stap] = t.dataset.uur.split(':');
    const d = { ...comfort.dagdelen, [sleutel]: Math.max(0, Math.min(23, comfort.dagdelen[sleutel] + Number(stap))) };
    if (!(d.voorverwarmen < d.dag && d.dag < d.nacht)) return groep.zegBewaard('fout', 'Voorverwarmen begint voor de dag, en de dag voor de nacht');
    comfort.dagdelen = d;
  } else return;
  teken();
  bewaar();
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laadAlles();
setInterval(() => {
  // De temperatuur van nu bijhouden, niet wat je aan het kiezen bent.
  void haal('api/state').then((s) => {
    state = s;
    teken();
  }).catch(() => {});
}, 60_000);
