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
/** Wiens comfort (besluit 147): uit het adres, anders dat van wie er kijkt. */
const vanBewoner = new URLSearchParams(location.search).get('bewoner');
const deur = `api/comfort${vanBewoner ? `?bewoner=${encodeURIComponent(vanBewoner)}` : ''}`;
/** Voorrang en de dagdelen zijn van het huis: alleen bij het comfort van de hoofdgebruiker. */
const vanHetHuis = () => !comfort?.van || comfort.van.hoofd;
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
  const [c, s, z] = await Promise.allSettled([haal(deur), haal('api/state'), haal('api/zon')]);
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
  const dag = d.heat != null && d.cool != null ? t('comfort.overdag.van', { van: getal(d.heat), tot: graden(d.cool) }) : d.heat != null ? t('comfort.overdag.graden', { graden: graden(d.heat) }) : d.cool != null ? t('comfort.overdag.tot', { tot: graden(d.cool) }) : t('comfort.overdag.niets');
  return n.heat != null && n.heat !== d.heat ? t('comfort.snachts', { dag, graden: graden(n.heat) }) : dag;
}

function delen() {
  if (!comfort) return [];
  const leeg = (k) => MODI.every((m) => k.modi[m].heat == null && k.modi[m].cool == null);
  const d = comfort.dagdelen;
  // Een huis zonder slimme regeling (besluit 194): comfort per kamer kan erbij, meer niet.
  if (!comfort.kamers.length) return [{ id: 'erbij', titel: t('comfort.erbij.titel'), zin: t('comfort.erbij.kort'), stand: 'leeg' }];
  return [
    { kop: t('comfort.kamers') },
    ...comfort.kamers.map((k) => ({ id: k.id, titel: k.naam, zin: samenvatting(k), stand: leeg(k) ? 'leeg' : 'goed' })),
    { kop: t('comfort.heleHuis') },
    ...(vanHetHuis() ? [{ id: 'dagdelen', titel: t('instellingen.dagdelen'), zin: t('comfort.dagdelenZin', { dag: d.dag, nacht: d.nacht }), stand: 'goed' }] : []),
    ...(vanHetHuis() && (comfort.voorrang?.koelen?.length > 1 || comfort.voorrang?.verwarmen?.length > 1 || zonLijst()) ? [{ id: 'voorrang', titel: t('comfort.voorrang'), zin: voorrangZin(), stand: 'goed' }] : []),
    { id: 'afwezig', titel: t('comfort.afwezig'), zin: t('comfort.afwezigZin'), stand: 'goed' },
  ];
}

/* ------------------------------------------------------------ een kamer */

function wanneer(m) {
  const d = comfort.dagdelen;
  const uren = (a, b) => t('instellingen.van', { van: `${a}:00`, tot: `${b}:00` });
  return { dag: uren(d.dag, d.nacht), nacht: uren(d.nacht, d.voorverwarmen), afwezig: t('comfort.wanneer.afwezig'), vakantie: t('comfort.wanneer.vakantie') }[m];
}
const NAAM = Object.fromEntries(MODI.map((m) => [m, t(`comfort.naam.${m}`)]));

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
  const zonStip = [zw, zk].filter((x) => x != null).map((x) => `<span class="zonstip" style="left: ${pct(x).toFixed(2)}%" title="${esc(t('comfort.opZon'))}"></span>`).join('');
  const goed = p.heat != null && p.cool != null ? [pct(p.heat), pct(p.cool)] : p.heat != null ? [pct(p.heat), 100] : p.cool != null ? [0, pct(p.cool)] : null;
  const greep = (soort, c) => `<button type="button" class="greep" role="slider" aria-label="${esc(t(soort === 'heat' ? 'comfort.verwarmenOnder' : 'comfort.koelenBoven', { dagdeel: NAAM[m].toLowerCase() }))}" aria-valuemin="${MIN}" aria-valuemax="${MAX}" aria-valuenow="${c}" aria-valuetext="${graden(c)}" data-greep="${soort}" style="left: ${pct(c).toFixed(2)}%"><i style="background: ${soort === 'heat' ? 'var(--gloed)' : 'var(--ijs)'}"></i></button>`;
  const maten = [MIN, ...(p.heat != null ? [p.heat] : []), ...(p.cool != null ? [p.cool] : []), MAX];
  return `<div class="schaal" data-schaal="${m}">
    <div class="baan"></div>
    ${goed ? `<div class="goed" style="left: ${goed[0].toFixed(2)}%; width: ${(goed[1] - goed[0]).toFixed(2)}%"></div>` : ''}
    ${zw != null ? zonStuk(p.heat, zw) : ''}${zk != null ? zonStuk(zk, p.cool) : ''}${zonStip}
    ${p.heat != null ? greep('heat', p.heat) : ''}${p.cool != null ? greep('cool', p.cool) : ''}
    ${maten.map((c) => `<span class="maat" style="left: ${pct(c).toFixed(2)}%">${graden(c)}</span>`).join('')}
    ${p.heat == null && p.cool == null ? `<span class="niets">${esc(t('comfort.doetNiets'))}</span>` : ''}
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
      uitleg = aan ? `${esc(t('comfort.heat.aan', { aan: graden(v - h.aan), uit: graden(v + h.uit) }))}${zg != null ? ` <span class="z">${esc(t('comfort.heat.zon', { graden: graden(zg) }))}</span>` : ''}` : esc(t('comfort.heat.uit'));
    } else {
      const net = k.koeltVanNet ? (aan ? t('comfort.cool.aan', { aan: graden(v + h.aan), uit: graden(v - h.uit) }) : '') : k.nooitWarmerC != null ? t('comfort.cool.netBoven', { graden: graden(k.nooitWarmerC) }) : t('comfort.cool.netNiet');
      uitleg = aan ? `${zg != null ? `<span class="z">${esc(t('comfort.cool.zon', { graden: graden(zg) }))}</span> ` : ''}${esc(net)}` : esc(k.nooitWarmerC != null && !k.koeltVanNet ? t('comfort.cool.zonder', { graden: graden(k.nooitWarmerC) }) : t('comfort.cool.zonderNet'));
    }
    const kleur = soort === 'heat' ? 'var(--gloed)' : 'var(--ijs)';
    const wat = t(soort === 'heat' ? 'comfort.verwarmen' : 'comfort.koelen');
    const label = aan ? `${esc(wat)} <em>${esc(t(soort === 'heat' ? 'comfort.onder' : 'comfort.boven'))}</em> <b>${graden(v)}</b>` : esc(t('comfort.wordUit', { wat }));
    return `<div class="regel${aan ? '' : ' uit'}${open.has(sleutel) ? ' open' : ''}">
      <button type="button" class="wat" data-uitleg="${esc(sleutel)}" aria-expanded="${open.has(sleutel)}"><i style="background: ${aan ? kleur : 'var(--gedempt)'}"></i>${label}</button>
      <button type="button" class="schakel ${soort}" role="switch" aria-checked="${aan}" aria-label="${esc(wat)}, ${esc(NAAM[m].toLowerCase())}" ${aan ? `data-uit="${soort}"` : `data-aan="${soort}"`}></button>
      ${open.has(sleutel) ? `<small>${uitleg}</small>` : ''}
    </div>`;
  };
  return `<div class="regels">${regel('heat')}${regel('cool')}</div>`;
}

/** Een dagdeel: de naam, de balk en de twee regels. */
function band(k, m) {
  return `<div class="band" data-modus="${m}"><div class="naam"><b>${esc(NAAM[m])}</b><span>${esc(wanneer(m))}</span></div>${schaal(k, m)}${regels(k, m)}</div>`;
}

/** Zon en net, per kamer (besluit 133): hoeveel verder op zon, en of koelen van het net mag. */
function zonEnNet(k) {
  const zon = k.opZon?.verwarmen || k.opZon?.koelen
    ? `<div class="blok"><span class="label"><span class="stip" style="background: var(--zon)"></span>${esc(t('comfort.opZonMag'))}</span>
        <div class="keuze" role="group" aria-label="${esc(t('comfort.opZonMag'))}">${[[0, t('comfort.niet')], [0.5, '½°'], [1, '1°'], [2, '2°']].map(([v, x]) => `<button type="button" data-opzon="${v}" aria-pressed="${k.opZonC === v}">${esc(x)}</button>`).join('')}</div>
        <p class="uitleg">${esc(t(k.opZon.koelen && k.opZon.verwarmen ? 'comfort.verder.beide' : k.opZon.koelen ? 'comfort.verder.koeler' : 'comfort.verder.warmer'))}</p></div>`
    : '';
  const net = k.kanKoelen && !k.koeltVanNet
    ? `<div class="blok"><span class="label"><span class="stip" style="background: var(--ijs)"></span>${esc(t('comfort.koelenNet'))}</span>
        ${k.nooitWarmerC != null
          ? `<div class="stapper"><button type="button" data-plafond="-0.5" aria-label="${esc(t('comfort.lager'))}">−</button><b>${esc(t('comfort.bovenGraden', { graden: graden(k.nooitWarmerC) }))}</b><button type="button" data-plafond="0.5" aria-label="${esc(t('comfort.hoger'))}">+</button><button type="button" class="geen" data-plafond="geen">${esc(t('comfort.nooit'))}</button></div>`
          : `<div class="keuze" role="group" aria-label="${esc(t('comfort.koelenNet'))}"><button type="button" aria-pressed="true">${esc(t('comfort.nooit'))}</button><button type="button" data-plafond="aan" aria-pressed="false">${esc(t('comfort.bovenTemp'))}</button></div>`}
        <p class="uitleg">${esc(t(k.nooitWarmerC != null ? 'comfort.netUitleg' : 'comfort.netNooit'))}</p></div>`
    : '';
  return zon || net ? `<div class="zonnet">${zon}${net}</div>` : '';
}

function kamerVorm(k) {
  const pz = state?.explanation?.perZone?.find((z) => z.zoneId === k.id);
  const nu = pz?.temperatureC;
  // Overdag en 's nachts; afwezig en vakantie hebben hun eigen deel (besluit 133).
  const banden = ['dag', 'nacht'].map((m) => band(k, m)).join('');
  // Hoe het nu gaat, bovenin het kamervak (besluit 163): daar komt ook wat het huis leerde.
  const kort = state?.bewoner?.kamers?.find((x) => x.zoneId === k.id)?.kort;
  return `<div class="bovenrij"><h2 class="kop-2">${esc(k.naam)}</h2>${kort ? `<span class="nukort">${esc(kort)}</span>` : ''}${nu != null ? `<span class="nu-temp">${esc(t('thuis.nuKlein'))} <b>${graden(Math.round(nu * 10) / 10)}</b></span>` : ''}</div>
    ${banden}
    ${zonEnNet(k)}
`;
}

function dagbalk() {
  const d = comfort.dagdelen;
  const stuk = (van, tot, kleur) => (tot > van ? `<i style="flex: ${tot - van}; background: ${kleur}"></i>` : '');
  const nacht = 'rgba(143, 134, 255, 0.35)';
  return `<div class="dag" aria-hidden="true">${stuk(0, d.voorverwarmen, nacht)}${stuk(d.voorverwarmen, d.dag, 'rgba(255, 122, 77, 0.35)')}${stuk(d.dag, d.nacht, 'rgba(110, 231, 183, 0.35)')}${stuk(d.nacht, 24, nacht)}</div>
    <div class="dagmaat">${[0, d.voorverwarmen, d.dag, d.nacht].map((u) => `<span style="left: ${((u / 24) * 100).toFixed(1)}%">${u}</span>`).join('')}</div>
    <div class="daglegenda"><span><i style="background: rgba(255, 122, 77, 0.7)"></i>${esc(t('comfort.legenda.voorverwarmen'))}</span><span><i style="background: rgba(110, 231, 183, 0.7)"></i>${esc(t('comfort.legenda.dag'))}</span><span><i style="background: rgba(143, 134, 255, 0.7)"></i>${esc(t('comfort.legenda.nacht'))}</span></div>`;
}

function dagdelenVorm() {
  const d = comfort.dagdelen;
  const uur = (sleutel) => `<div><span class="label" style="font-size: 14.5px; font-weight: 600; display: block; margin-bottom: 6px">${esc(t(`comfort.vanaf.${sleutel}`))}</span><div class="stapper"><button type="button" data-uur="${sleutel}:-1" aria-label="${esc(t('comfort.eerder'))}">−</button><b>${d[sleutel]}:00</b><button type="button" data-uur="${sleutel}:1" aria-label="${esc(t('comfort.later'))}">+</button></div></div>`;
  return `<h2 class="kop-2">${esc(t('instellingen.dagdelen'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('comfort.dagdelenUitleg'))}</p>
    <div class="uren">${uur('voorverwarmen')}${uur('dag')}${uur('nacht')}</div>
    ${dagbalk()}`;
}

/** Zonder slimme regeling (besluit 194): wat comfort per kamer zou doen, en hoe het erbij komt. */
function erbijVorm() {
  return `<h2 class="kop-2">${esc(t('comfort.erbij.titel'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('comfort.erbij.zin'))}</p>
    <div><a class="knop knop-licht" href="huis-kan.html#temperatuur">${esc(t('comfort.erbij.knop'))}</a></div>`;
}

function afwezigVorm() {
  const k = comfort.kamers.find((x) => x.id === afwezigKamer) ?? comfort.kamers[0];
  if (!k) return `<h2 class="kop-2">${esc(t('comfort.afwezig'))}</h2>`;
  afwezigKamer = k.id;
  return `<h2 class="kop-2">${esc(t('comfort.afwezig'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('comfort.afwezigUitleg'))}</p>
    <div class="kamerkeuze" role="group" aria-label="${esc(t('comfort.kamer'))}">${comfort.kamers.map((x) => `<button type="button" data-afwezig-kamer="${esc(x.id)}" aria-pressed="${x.id === k.id}">${esc(x.naam)}</button>`).join('')}</div>
    ${band(k, 'afwezig')}${band(k, 'vakantie')}`;
}

/* ------------------------------------------------- voorrang (besluit 134) */

const naamVan = (id) => comfort.kamers.find((k) => k.id === id)?.naam ?? id;
/*
 * Op zon (besluit 176): de kamers die op zon opwarmen of koelen en de
 * apparaten op zon, in één volgorde. Alleen als er een apparaat op zon is;
 * anders zeggen de twee lijsten erboven al alles.
 */
// Een boiler of jacuzzi (besluit 186) staat erin als een apparaat.
const zonNaam = (z) => (z.soort !== 'kamer' ? comfort.apparatenOpZon?.find((a) => a.id === z.id)?.naam ?? z.id : naamVan(z.id));
const zonLijst = () => (comfort.apparatenOpZon?.length && comfort.voorrang?.zon?.length > 1 ? comfort.voorrang.zon : null);
/** Zoals de regeling het doet zonder keuze: eerst de kamers, dan de apparaten, dan boiler en jacuzzi. */
const zonGewoon = () => {
  const zon = comfort.voorrang?.zon ?? [];
  const plek = (z) => comfort.kamers.findIndex((k) => k.id === z.id);
  return [...zon.filter((z) => z.soort === 'kamer').sort((a, b) => plek(a) - plek(b)), ...zon.filter((z) => z.soort === 'apparaat'), ...zon.filter((z) => z.soort === 'buffer')];
};
/** Of de bewoner de lijst Op zon aanraakte: pas dan gaat hij mee naar de regeling. */
let zonGekozen = false;
function voorrangZin() {
  const k = comfort.voorrang?.koelen?.[0];
  const w = comfort.voorrang?.verwarmen?.[0];
  const z = zonLijst()?.[0];
  return [
    k ? t('comfort.vr.koelen', { naam: naamVan(k).toLowerCase() }) : null,
    w && !k ? t('comfort.vr.verwarmen', { naam: naamVan(w).toLowerCase() }) : null,
    z != null && z.soort !== 'kamer' ? t('comfort.vr.zon', { naam: zonNaam(z).toLowerCase() }) : null,
  ].filter(Boolean).join(', ');
}
/** Een voorstel om mee te beginnen: koelen hoog in huis eerst, verwarmen laag in huis eerst. */
function voorrangVoorstel() {
  // De kamers staan in de volgorde van het huis, de zolder boven (besluit 131).
  const op = comfort.kamers.map((k) => k.id);
  return {
    koelen: op.filter((id) => comfort.voorrang.koelen.includes(id)),
    verwarmen: [...op].reverse().filter((id) => comfort.voorrang.verwarmen.includes(id)),
  };
}

function voorrangVorm() {
  const v = comfort.voorrang;
  const schuif = (sleutel, naam, i, n) => `<span class="schuif"><button type="button" data-schuif="${sleutel}:-1" aria-label="${esc(t('comfort.naamHoger', { naam }))}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-schuif="${sleutel}:1" aria-label="${esc(t('comfort.naamLager', { naam }))}" ${i === n - 1 ? 'disabled' : ''}>↓</button></span>`;
  const lijst = (richting, titel, kleur) => {
    const ids = v[richting] ?? [];
    const niet = comfort.kamers.filter((k) => !ids.includes(k.id)).map((k) => k.naam);
    return `<div class="rang"><h3><span class="stip" style="background: ${kleur}"></span>${esc(titel)}</h3>
      ${ids.map((id, i) => `<div class="r"><i>${i + 1}</i><b>${esc(naamVan(id))}</b>${schuif(`${richting}:${esc(id)}`, naamVan(id), i, ids.length)}</div>`).join('')}
      ${niet.length ? `<p class="niet">${esc(t(`comfort.kanNiet.${richting}`, { n: niet.length, namen: niet.join(` ${t('algemeen.en')} `) }))}</p>` : ''}</div>`;
  };
  const zon = zonLijst();
  const zonRang = zon
    ? `<div class="rang"><h3><span class="stip" style="background: var(--zon)"></span>${esc(t('comfort.opZonKop'))}</h3>
      ${zon.map((z, i) => `<div class="r"><i>${i + 1}</i><b>${esc(zonNaam(z))}<small>${esc(t(`comfort.soort.${z.soort === 'kamer' ? 'kamer' : 'apparaat'}`))}</small></b>${schuif(`zon:${i}`, zonNaam(z), i, zon.length)}</div>`).join('')}
      <p class="niet">${esc(t('comfort.zonNiet'))}</p></div>`
    : '';
  const voorstel = voorrangVoorstel();
  const anders = JSON.stringify(voorstel) !== JSON.stringify({ koelen: v.koelen, verwarmen: v.verwarmen });
  return `<h2 class="kop-2">${esc(t('comfort.voorrang'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('comfort.voorrangUitleg'))}${zon ? ` ${esc(t('comfort.voorrangZon'))}` : ''}</p>
    <div class="lijsten${zon ? ' drie' : ''}">${v.koelen.length ? lijst('koelen', t('comfort.alsKoelt'), 'var(--ijs)') : ''}${v.verwarmen.length ? lijst('verwarmen', t('comfort.alsWarmt'), 'var(--gloed)') : ''}${zonRang}</div>
    ${anders ? `<div class="voorstelrij"><span class="mini">${esc(t('comfort.voorstel'))}</span><button type="button" class="knop" data-voorrang-voorstel>${esc(t('comfort.neemOver'))}</button></div>` : ''}`;
}

function naast(id) {
  if (id === 'voorrang') {
    const opZon = zonLijst() ? `<div class="glas"><h3>${esc(t('comfort.opZonKop'))}</h3><p style="margin: 0">${esc(t('comfort.naast.opZon'))}</p></div>` : '';
    return `${opZon}<div class="glas"><h3>${esc(t('comfort.naast.tweeKop'))}</h3><p style="margin: 0">${esc(t('comfort.naast.twee'))}</p></div>
      <div class="glas"><h3>${esc(t('comfort.naast.telKop'))}</h3><p style="margin: 0">${esc(t('comfort.naast.tel'))}</p></div>`;
  }
  return `<div class="glas"><h3>${esc(t('comfort.naast.zoKop'))}</h3>
      <p style="margin: 0 0 10px">${esc(t('comfort.naast.zo'))}</p>
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
  tekenWie();
  const nu = groep.tekenDelen(delen());
  const k = comfort.kamers.find((x) => x.id === nu);
  const vorm = k ? kamerVorm(k) : nu === 'erbij' ? erbijVorm() : nu === 'dagdelen' ? dagdelenVorm() : nu === 'voorrang' ? voorrangVorm() : afwezigVorm();
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  $$('[data-naast]').forEach((el) => (el.innerHTML = naast(nu)));
}

/*
 * Wiens comfort (besluit 147): jouw comfort, of dat van een ander als je de
 * hoofdgebruiker bent. Wie volgt, ziet dat van de hoofdgebruiker; iets
 * veranderen maakt het een eigen comfort.
 */
function tekenWie() {
  const v = comfort?.van;
  if (!v) return;
  const titel = (v.hoofd && !vanBewoner) || (vanBewoner && v.id !== vanBewoner) ? t('groep.comfort') : t('comfort.titelVan', { naam: v.naam });
  const lead = !v.magAanpassen
    ? t('comfort.lead.niet', { naam: v.naam })
    : v.hoofd
      ? t('comfort.lead.hoofd')
      : v.volgt
        ? t('comfort.lead.volgt', { naam: v.hoofdNaam })
        : t('comfort.lead.eigen', { naam: v.naam });
  const kies = v.bewoners.length > 1
    ? `<select class="veld wiekies" data-wie aria-label="${esc(t('comfort.wiens'))}">${v.bewoners.map((b) => `<option value="${esc(b.id)}" ${b.id === v.id ? 'selected' : ''}>${esc(b.id === v.bewoners[0].id ? t('comfort.hoofd', { naam: b.naam }) : b.naam)}</option>`).join('')}</select>`
    : '';
  $$('[data-titel]').forEach((el) => (el.textContent = titel));
  $$('[data-lead]').forEach((el) => (el.textContent = lead));
  $$('[data-wiekies]').forEach((el) => (el.innerHTML = kies));
}
document.addEventListener('change', (e) => {
  const el = e.target.closest?.('[data-wie]');
  if (el) location.href = `comfort.html?bewoner=${encodeURIComponent(el.value)}`;
});

/* ------------------------------------------------------------ bewaren */

function bewaar() {
  const body = {
    kamers: Object.fromEntries(comfort.kamers.map((k) => [k.id, { modi: k.modi, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }])),
    dagdelen: comfort.dagdelen,
    ...(comfort.voorrang
      ? {
          voorrang: {
            koelen: comfort.voorrang.koelen,
            verwarmen: comfort.voorrang.verwarmen,
            // Op zon alleen als de bewoner hem koos (besluit 176); anders blijft het zoals het was.
            ...(zonLijst() && (zonGekozen || JSON.stringify(comfort.voorrang.zon) !== JSON.stringify(zonGewoon())) ? { zon: comfort.voorrang.zon } : {}),
          },
        }
      : {}),
  };
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur(deur, body);
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

/**
 * Werkt de balk bij tijdens het slepen, zonder de grepen te vervangen (21
 * oktober 2026). Eerst kwam er een nieuwe greep onder de vinger; op een
 * aanraakscherm kwamen bewegen en loslaten dan niet meer aan, bleef het slepen
 * aan staan, en sprong de greep naar elke volgende tik op de pagina.
 */
function balkBij(rij, k, m) {
  const tmp = document.createElement('div');
  tmp.innerHTML = schaal(k, m) + regels(k, m);
  const oud = rij.querySelector('.schaal');
  const nieuw = tmp.querySelector('.schaal');
  const grepen = [...oud.querySelectorAll(':scope > .greep')];
  for (const g of grepen) {
    const n = nieuw.querySelector(`:scope > .greep[data-greep="${g.dataset.greep}"]`);
    if (!n) continue;
    g.style.left = n.style.left;
    for (const a of ['aria-valuenow', 'aria-valuetext']) g.setAttribute(a, n.getAttribute(a));
  }
  // De rest (de groene strook, de zon, de getallen) opnieuw, voor de grepen.
  for (const n of [...oud.childNodes]) if (!grepen.includes(n)) n.remove();
  for (const n of [...nieuw.childNodes]) if (!n.classList?.contains('greep')) oud.insertBefore(n, grepen[0] ?? null);
  rij.querySelector('.regels').replaceWith(tmp.querySelector('.regels'));
}

let sleept = false;

/*
 * Alleen het bolletje slepen verandert de temperatuur (21 oktober 2026): het
 * houdt de vinger vast tot je loslaat, en schuift mee vanaf waar je het pakte,
 * zonder naar het midden van je vinger te springen. Een tik op de balk of
 * ergens anders doet niets.
 */
document.addEventListener('pointerdown', (e) => {
  const greep = e.target.closest('[data-greep]');
  const k = huidig();
  if (!greep || !k || sleept || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const rij = greep.closest('[data-modus]');
  const m = rij.dataset.modus;
  const soort = greep.dataset.greep;
  const id = e.pointerId;
  const vanX = e.clientX;
  const vanC = k.modi[m][soort];
  const breed = rij.querySelector('.schaal').getBoundingClientRect().width || 1;
  sleept = true;
  greep.classList.add('pakt');
  try {
    greep.setPointerCapture(id);
  } catch {
    // Zonder vastpakken luistert het venster mee.
  }
  let laatst = vanC;
  const beweeg = (ev) => {
    if (ev.pointerId !== id) return;
    const c = vanC + ((ev.clientX - vanX) / breed) * (MAX - MIN);
    zet(k, m, soort, c);
    if (k.modi[m][soort] === laatst) return;
    laatst = k.modi[m][soort];
    balkBij(rij, k, m);
  };
  const los = (ev) => {
    if (ev.pointerId !== id || !sleept) return;
    for (const doel of [greep, window]) {
      doel.removeEventListener('pointermove', beweeg);
      doel.removeEventListener('pointerup', los);
      doel.removeEventListener('pointercancel', los);
    }
    greep.removeEventListener('lostpointercapture', los);
    greep.classList.remove('pakt');
    sleept = false;
    if (laatst !== vanC) bewaar();
    teken();
  };
  for (const doel of [greep, window]) {
    doel.addEventListener('pointermove', beweeg);
    doel.addEventListener('pointerup', los);
    doel.addEventListener('pointercancel', los);
  }
  greep.addEventListener('lostpointercapture', los);
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
  const knop = e.target.closest('button');
  if (!knop || !comfort) return;
  const k = huidig();
  const rij = knop.closest('[data-modus]');
  if (knop.dataset.uitleg) {
    // Alleen tonen of verbergen; niets te bewaren.
    if (open.has(knop.dataset.uitleg)) open.delete(knop.dataset.uitleg);
    else open.add(knop.dataset.uitleg);
    return teken();
  }
  if (knop.dataset.afwezigKamer) {
    afwezigKamer = knop.dataset.afwezigKamer;
    return teken();
  }
  if (k && knop.dataset.opzon != null) {
    k.opZonC = Number(knop.dataset.opzon);
  } else if (k && rij && (knop.dataset.aan || knop.dataset.uit)) {
    const m = rij.dataset.modus;
    if (knop.dataset.aan) zet(k, m, knop.dataset.aan, NIEUW[knop.dataset.aan][m]);
    else k.modi = { ...k.modi, [m]: { ...k.modi[m], [knop.dataset.uit]: null } };
  } else if (k && knop.dataset.plafond) {
    const v = knop.dataset.plafond;
    const { min, max } = comfort.bereik.plafond;
    if (v === 'geen') k.nooitWarmerC = null;
    else if (v === 'aan') k.nooitWarmerC = Math.max(min, (k.modi.dag.cool ?? 24) + 2);
    else k.nooitWarmerC = Math.max(min, Math.min(max, (k.nooitWarmerC ?? 26) + Number(v)));
  } else if (knop.dataset.schuif) {
    // Een kamer hoger of lager in de lijst (besluit 134).
    const [richting, id, stap] = knop.dataset.schuif.split(':');
    const l = [...comfort.voorrang[richting]];
    // Op zon (besluit 176) op zijn plek in de lijst: een kamer en een apparaat kunnen dezelfde id hebben.
    if (richting === 'zon') zonGekozen = true;
    const i = richting === 'zon' ? Number(id) : l.indexOf(id);
    const j = i + Number(stap);
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    comfort.voorrang = { ...comfort.voorrang, [richting]: l };
  } else if (knop.hasAttribute('data-voorrang-voorstel')) {
    comfort.voorrang = { ...comfort.voorrang, ...voorrangVoorstel() };
  } else if (knop.dataset.uur) {
    const [sleutel, stap] = knop.dataset.uur.split(':');
    const d = { ...comfort.dagdelen, [sleutel]: Math.max(0, Math.min(23, comfort.dagdelen[sleutel] + Number(stap))) };
    if (!(d.voorverwarmen < d.dag && d.dag < d.nacht)) return groep.zegBewaard('fout', t('comfort.uren'));
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
