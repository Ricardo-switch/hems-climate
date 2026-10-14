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

function schaal(k, m) {
  const p = k.modi[m];
  const goed = p.heat != null && p.cool != null ? [pct(p.heat), pct(p.cool)] : p.heat != null ? [pct(p.heat), 100] : p.cool != null ? [0, pct(p.cool)] : null;
  const greep = (soort, c) => `<button type="button" class="greep" role="slider" aria-label="${soort === 'heat' ? 'Verwarmen onder' : 'Koelen boven'}, ${NAAM[m].toLowerCase()}" aria-valuemin="${MIN}" aria-valuemax="${MAX}" aria-valuenow="${c}" aria-valuetext="${graden(c)}" data-greep="${soort}" style="left: ${pct(c).toFixed(2)}%"><i style="background: ${soort === 'heat' ? 'var(--gloed)' : 'var(--ijs)'}"></i></button>`;
  const maten = [MIN, ...(p.heat != null ? [p.heat] : []), ...(p.cool != null ? [p.cool] : []), MAX];
  return `<div class="schaal" data-schaal="${m}">
    <div class="baan"></div>
    ${goed ? `<div class="goed" style="left: ${goed[0].toFixed(2)}%; width: ${(goed[1] - goed[0]).toFixed(2)}%"></div>` : ''}
    ${p.heat != null ? greep('heat', p.heat) : ''}${p.cool != null ? greep('cool', p.cool) : ''}
    ${maten.map((c) => `<span class="maat" style="left: ${pct(c).toFixed(2)}%">${graden(c)}</span>`).join('')}
    ${p.heat == null && p.cool == null ? '<span class="niets">doet niets</span>' : ''}
  </div>`;
}

function waarden(k, m) {
  const p = k.modi[m];
  const regel = (soort, woord) => {
    const v = p[soort];
    const kan = soort === 'heat' ? k.kanVerwarmen : k.kanKoelen;
    if (v != null) return `<span>${woord} <b>${graden(v)}</b><button type="button" class="weg" data-uit="${soort}" aria-label="${woord} uitzetten">×</button></span>`;
    return kan ? `<span><button type="button" data-aan="${soort}">${soort === 'heat' ? 'Verwarmen aanzetten' : 'Koelen aanzetten'}</button></span>` : '';
  };
  return `<div class="waarden">${regel('heat', 'verwarmen onder')}${regel('cool', 'koelen boven')}</div>`;
}

function kamerVorm(k) {
  const pz = state?.explanation?.perZone?.find((z) => z.zoneId === k.id);
  const nu = pz?.temperatureC;
  const banden = MODI.map((m) => `<div class="band" data-modus="${m}"><div class="naam"><b>${NAAM[m]}</b><span>${esc(wanneer(m))}</span></div>${schaal(k, m)}${waarden(k, m)}</div>`).join('');
  const plafond = k.kanKoelen
    ? `<div><span class="label">Nooit warmer dan</span><div class="stapper">${k.nooitWarmerC != null ? `<button type="button" data-plafond="-0.5" aria-label="Lager">−</button><b>${graden(k.nooitWarmerC)}</b><button type="button" data-plafond="0.5" aria-label="Hoger">+</button><button type="button" class="geen" data-plafond="geen">Geen</button>` : `<b>geen</b><button type="button" class="geen" data-plafond="aan">Instellen</button>`}</div><p class="uitleg">${k.nooitWarmerC != null ? 'Dan koelt de airco ook zonder zon, met stroom van het net.' : 'Zonder grens koelt de airco alleen als er zon over is.'}</p></div>`
    : '';
  const voorrang = `<div><span class="label">Voorrang bij weinig zon</span><div class="keuze" role="group" aria-label="Voorrang">${[[1, 'Eerst'], [2, 'Daarna'], [3, 'Laatst']].map(([v, t]) => `<button type="button" data-voorrang="${v}" aria-pressed="${k.voorrang === v}">${t}</button>`).join('')}</div><p class="uitleg">Is er zon voor één apparaat, dan gaat de kamer met voorrang eerst.</p></div>`;
  return `<div class="bovenrij"><h2 class="kop-2">${esc(k.naam)}</h2>${nu != null ? `<span class="nu-temp">nu <b>${graden(Math.round(nu * 10) / 10)}</b></span>` : ''}</div>
    ${banden}
    <div class="rij2">${plafond}${voorrang}</div>`;
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
  const rij = (k) => {
    const a = k.modi.afwezig;
    const v = k.modi.vakantie;
    const zin = (p) => (p.heat != null && p.cool != null ? `${graden(p.heat)} tot ${graden(p.cool)}` : p.heat != null ? `niet onder ${graden(p.heat)}` : p.cool != null ? `niet boven ${graden(p.cool)}` : 'niets');
    return `<a href="#${encodeURIComponent(k.id)}"><b>${esc(k.naam)}</b><span>afwezig ${esc(zin(a))}, vakantie ${esc(zin(v))}</span></a>`;
  };
  return `<h2 class="kop-2">Afwezig en vakantie</h2>
    <p class="klein" style="margin: 0">Afwezig gaat vanzelf als niemand thuis is. Vakantie zet je zelf, op Thuis bij de stand bovenin. Wat het huis dan aanhoudt, staat per kamer:</p>
    <div class="kamerlijst">${comfort.kamers.map(rij).join('')}</div>`;
}

function naast(id) {
  const k = comfort.kamers.find((x) => x.id === id);
  const kort = k ? state?.bewoner?.kamers?.find((x) => x.zoneId === k.id)?.kort : null;
  return `${kort ? `<div class="glas"><h3>Nu</h3><p style="margin: 0">${esc(kort)}</p></div>` : ''}
    <div class="glas"><h3>Zo gebruikt het huis dit</h3>
      <p style="margin: 0 0 10px">Tussen de twee grepen is het goed: dan doet het huis niets. Is er zon over, dan mag een airco al eerder koelen of verwarmen, zolang het goed blijft.</p>
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
    kamers: Object.fromEntries(comfort.kamers.map((k) => [k.id, { modi: k.modi, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang }])),
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

const huidig = () => comfort?.kamers.find((x) => x.id === groep.actief(delen()));

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
  tmp.innerHTML = schaal(k, m) + waarden(k, m);
  rij.querySelector('.schaal').replaceWith(tmp.querySelector('.schaal'));
  rij.querySelector('.waarden').replaceWith(tmp.querySelector('.waarden'));
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
  if (k && rij && (t.dataset.aan || t.dataset.uit)) {
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
