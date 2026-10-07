/*
 * De nieuwe weergave, als test naast index.html (besluit 71).
 *
 * Dezelfde bronnen als de schaduwpagina: `api/site` voor de namen, `api/events`
 * voor het live besluit, `api/divergence` voor de terugblik. Niets hier
 * schrijft; de server laat dat ook niet toe (besluit 42).
 *
 * Alle tekst gaat via textContent, nooit via innerHTML: de uitleg van het oude
 * systeem komt uit Home Assistant en bevat zelf HTML.
 */

'use strict';

/* ------------------------------------------------------------ vertaling */

const MODE = {
  dag: 'Dag',
  nacht: 'Nacht',
  voorverwarmen: 'Voorverwarmen',
  afwezig: 'Afwezig',
  vakantie: 'Vakantie',
  handmatig: 'Handmatig',
};

const ACTION = { cool: 'koelen', heat: 'verwarmen', standby: 'geparkeerd', off: 'uit' };

/* --------------------------------------------------------------- hulp */

const $ = (id) => document.getElementById(id);

/** Maakt een element; tekst altijd als tekst. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  return node;
}

const nl = (n, digits = 1) =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const kw = (w) => `${nl(Math.abs(w) / 1000)} kW`;
const deg = (c) => (c == null ? '—' : `${nl(c)}°`);
const hhmm = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

/** "cool@22.5" → { action: 'cool', setpoint: 22.5 }. */
function parseObserved(value) {
  if (value == null) return { action: 'onbekend', setpoint: null };
  const [action, sp] = String(value).split('@');
  return { action, setpoint: sp == null ? null : Number(sp) };
}

function describeObserved(value) {
  const o = parseObserved(value);
  if (o.action === 'onbekend' || o.action === 'unavailable') return 'onbekend';
  const word = ACTION[o.action] ?? o.action;
  if (o.action === 'off' || o.setpoint == null) return word;
  return `${word} naar ${nl(o.setpoint)}°`;
}

/** De uitleg van het oude systeem zonder HTML, als platte tekst. */
function plainLegacy(text) {
  if (!text) return null;
  const doc = new DOMParser().parseFromString(text.replace(/<br\s*\/?>/gi, ' · '), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').replace(/(·\s*)+/g, '· ').trim();
}

/* --------------------------------------------------------------- staat */

let site = null;
let latest = null;
let review = null;
const LOG_KEY = 'nieuw.tijdlijn';
let log = [];
try {
  log = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]');
} catch {
  log = [];
}

const zoneName = (id) => site?.zones.find((z) => z.id === id)?.name ?? id;
const actuatorName = (id) => site?.actuators.find((a) => a.id === id)?.name ?? id;
const actuatorsOf = (zoneId) => site?.zones.find((z) => z.id === zoneId)?.actuatorIds ?? [];
const canCool = (id) => site?.actuators.find((a) => a.id === id)?.capabilities?.canCool === true;

/* ------------------------------------------------------- navigatie */

const NAV = [
  ['thuis', 'Thuis', '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>'],
  ['waarom', 'Waarom', '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'],
  ['opbrengst', 'Opbrengst', '<path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/>'],
  ['assistent', 'Assistent', '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>'],
  [
    'bediening',
    'Bediening',
    '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  ],
];

function buildNav() {
  for (const holder of document.querySelectorAll('[data-nav]')) {
    for (const [id, label, icon] of NAV) {
      const svg = s('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.8,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      });
      // Vaste, eigen iconen; geen gegevens van buiten.
      svg.innerHTML = icon;
      const a = el('a', { class: 'navitem', href: `#${id}`, 'data-target': id }, el('span', { class: 'pill' }, svg), label);
      holder.append(a);
    }
  }
}

function showView() {
  const want = (location.hash || '#thuis').slice(1).split('/')[0];
  // Het huis staat niet in het menu: je komt er door op het huis te tikken.
  const id = NAV.some(([n]) => n === want) || want === 'huis' ? want : 'thuis';
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== id;
  const menu = id === 'huis' ? 'thuis' : id;
  for (const a of document.querySelectorAll('.navitem')) {
    if (a.dataset.target === menu) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (id === 'huis') {
    // Meteen tekenen wat er al is (of "even laden"), dan verversen.
    renderHouse();
    void loadHouse(true);
  }
  if (id === 'opbrengst') void loadReview();
  if (id === 'waarom' || id === 'thuis') void loadToday();
}

/* ------------------------------------------------------- klok */

function tick() {
  const now = new Date();
  $('tijd').textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  $('datum').textContent = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ------------------------------------------------- wat de kamer doet */

/**
 * Wat Smart Climate voor deze kamer zou doen, in één regel en een soort.
 * Soorten: cool, heat, wait, ok, idle, bad.
 */
function zoneStatus(snap, zoneId) {
  // De stand per kamer komt kant-en-klaar uit de dienst (besluit 94).
  const room = snap.bewoner?.kamers?.find((k) => k.zoneId === zoneId);
  if (room) return { kind: room.soort, text: room.kort, actuatorId: room.actuatorId ?? undefined };
  return { kind: 'idle', text: '…' };
}

/** Wat het echte apparaat in deze kamer doet, voor de vergelijking; ook uit de dienst. */
function zoneReal(snap, zoneId) {
  return snap.bewoner?.kamers?.find((k) => k.zoneId === zoneId)?.echt ?? '…';
}

/* -------------------------------------------------------- het huis */

const FILL = {
  cool: ['#5CC8FF', 0.42],
  heat: ['#FF8A4C', 0.36],
  wait: ['#F5B342', 0.3],
  ok: ['#6FDCA6', 0.28],
  idle: ['#FFFFFF', 0.06],
  bad: ['#FF8A4C', 0.2],
};
const TEXT = { cool: '#8FD9FF', heat: '#FFB088', wait: '#F5C66E', ok: '#6FDCA6', idle: '#A9BAC2', bad: '#FFB088' };

/**
 * De doorsnede, opgebouwd uit de zones.
 *
 * Etages kent de configuratie nog niet (besluit 72); tot dan staat elke zone op
 * een eigen verdieping, in de volgorde van de configuratie van onder naar boven,
 * en de bovenste onder het dak.
 */
function drawHouse(snap) {
  const e = snap.explanation;
  const zones = site?.zones ?? e.perZone.map((z) => ({ id: z.zoneId, name: z.zoneId, actuatorIds: [] }));
  const n = zones.length;
  // Een groep en geen plaatje: de verdiepingen erin zijn links.
  const svg = s('svg', { viewBox: '0 0 520 500', role: 'group' });
  const defs = s('defs');
  defs.innerHTML =
    '<radialGradient id="nSun"><stop offset="0" stop-color="#F5B342" stop-opacity="0.75"/><stop offset="1" stop-color="#F5B342" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="nFlow" gradientUnits="userSpaceOnUse" x1="372" y1="150" x2="400" y2="360"><stop offset="0" stop-color="#F5B342"/><stop offset="1" stop-color="#5CC8FF"/></linearGradient>' +
    '<filter id="nGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    Object.entries(FILL)
      .map(
        ([k, [c, o]]) =>
          `<linearGradient id="nF-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="${o / 6}"/></linearGradient>`,
      )
      .join('');
  svg.append(defs);

  const solar = e.solarProductionW;
  // De getallen in de tekening komen uit de dienst, zo afgerond dat ze optellen (besluit 94).
  const fl = snap.bewoner?.stromen ?? { zonKw: null, netKw: 0, verbruikKw: null, aircoKw: 0, huisKw: null, geplandKw: 0 };
  const hour = new Date(snap.atMs).getHours();
  const sunny = solar != null && solar > 30;
  // Een zwakke zon tekenen we ook zwak: 100 W is geen stralende middag.
  const strength = sunny ? Math.min(1, 0.35 + solar / 1500) : 0;
  /*
   * Waar de zon op de boog van de dag staat (besluit 93 en 94): de dienst rekent
   * het uit, de pagina zet hem neer. De voorkant is rechts, waar het oostdak
   * getekend wordt: komt de zon aan de voorkant op, dan loopt hij van rechts
   * laag, over het huis, naar links laag. Zonder ligging blijft hij rechtsboven.
   */
  const arc = sunInfo?.dag;
  let sx = 452;
  let sy = 66;
  if (arc?.fractie != null) {
    const f = arc.opVoorkant === false ? 1 - arc.fractie : arc.fractie;
    sx = 490 - f * 460;
    sy = 196 - arc.hoogteDeel * 172;
  }
  // Het getal naast de zon als hij hoog staat (anders botst het met het dak), erboven als hij laag staat.
  const label = sy < 110
    ? { x: sx < 270 ? sx + 30 : sx - 30, y: sy + 8, 'text-anchor': sx < 270 ? 'start' : 'end' }
    : { x: Math.min(470, Math.max(50, sx)), y: sy - 34, 'text-anchor': 'middle' };
  if (sunny) {
    svg.append(s('circle', { cx: sx, cy: sy, r: 30 + 30 * strength, fill: 'url(#nSun)', opacity: strength }));
    svg.append(s('circle', { cx: sx, cy: sy, r: 20, fill: '#F5B342', filter: 'url(#nGlow)', opacity: 0.45 + 0.55 * strength }));
    svg.append(s('text', { ...label, 'font-size': 24, 'font-weight': 700, fill: '#F5C66E' }, kw((fl.zonKw ?? 0) * 1000)));
  } else if (arc?.fractie != null) {
    // Overdag maar weinig zon: een bleke zon op zijn plek.
    svg.append(s('circle', { cx: sx, cy: sy, r: 16, fill: 'rgba(255,255,255,0.25)' }));
    svg.append(s('text', { ...label, 'font-size': 18, fill: '#A9BAC2' }, solar == null ? 'geen zonmeting' : 'bewolkt'));
  } else if (hour >= 19 || hour < 7) {
    const mask = s('mask', { id: 'nMoon' });
    mask.append(s('rect', { x: 400, y: 20, width: 110, height: 110, fill: '#fff' }));
    mask.append(s('circle', { cx: 462, cy: 58, r: 15, fill: '#000' }));
    svg.append(mask);
    svg.append(s('circle', { cx: 452, cy: 66, r: 17, fill: '#C9D6DC', mask: 'url(#nMoon)', filter: 'url(#nGlow)' }));
  } else {
    svg.append(s('circle', { cx: 452, cy: 66, r: 16, fill: 'rgba(255,255,255,0.25)' }));
    svg.append(s('text', { x: 452, y: 112, 'text-anchor': 'middle', 'font-size': 18, fill: '#A9BAC2' }, solar == null ? 'geen zonmeting' : 'bewolkt'));
  }

  svg.append(s('line', { x1: 20, y1: 470, x2: 500, y2: 470, stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 1.5 }));

  // Verdiepingen: alles behalve de bovenste in de doos, de bovenste onder het dak.
  const boxTop = n >= 2 ? 210 : 330;
  const floors = Math.max(1, n - 1);
  const floorH = (470 - boxTop) / (n >= 2 ? floors : 1);
  const status = new Map(zones.map((z) => [z.id, zoneStatus(snap, z.id)]));
  const temp = (id) => e.perZone.find((p) => p.zoneId === id)?.temperatureC ?? null;
  // Elke airco die Smart Climate op zon laat draaien, krijgt zijn eigen stroom.
  const flows = [];

  zones.forEach((z, i) => {
    const st = status.get(z.id);
    // Elke verdieping is een link naar zijn etage in het huis, met terug naar Thuis.
    const link = s('a', { href: `#huis/etagevan/${encodeURIComponent(z.id)}`, class: 'verdieping-link', 'aria-label': `${z.name}: naar de etage` });
    svg.append(link);
    const inRoof = n >= 2 && i === n - 1;
    const unitCool = (z.actuatorIds ?? []).some(canCool);
    const running = st.kind === 'cool' || st.kind === 'heat';
    if (inRoof) {
      link.append(s('polygon', { points: '124,206 270,84 416,206', fill: `url(#nF-${st.kind})` }));
      link.append(s('text', { x: 270, y: 124, 'text-anchor': 'middle', 'font-size': 18, fill: '#C9D6DC' }, z.name));
      link.append(s('text', { x: 270, y: 154, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 600, fill: '#fff' }, deg(temp(z.id))));
      link.append(s('text', { x: 270, y: 174, 'text-anchor': 'middle', 'font-size': 15, fill: TEXT[st.kind] }, short(st.text)));
      if (unitCool) {
        // Dezelfde airco als beneden, alleen kleiner: met luchtstroom als hij draait.
        link.append(s('rect', { x: 244, y: 180, width: 52, height: 9, rx: 3, fill: running ? '#DDF3FF' : 'rgba(255,255,255,0.4)', filter: running ? 'url(#nGlow)' : '' }));
        if (running) {
          link.append(s('path', { d: 'M254,193 q5,6 0,12 M270,193 q5,6 0,12 M286,193 q5,6 0,12', fill: 'none', stroke: st.kind === 'cool' ? '#8FD9FF' : '#FFB088', 'stroke-width': 2, 'stroke-linecap': 'round' }));
          if (sunny) flows.push({ path: 'M372,150 C392,166 330,180 296,184' });
        }
      }
    } else {
      const top = 470 - (i + 1) * floorH;
      link.append(s('rect', { x: 114, y: top + 4, width: 312, height: floorH - 8, fill: `url(#nF-${st.kind})` }));
      if (i > 0 || n >= 2) link.append(s('line', { x1: 110, y1: top, x2: 430, y2: top, stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1.5 }));
      const big = floorH >= 110;
      link.append(s('text', { x: 132, y: top + (big ? 36 : 28), 'font-size': big ? 20 : 17, fill: '#C9D6DC' }, z.name));
      link.append(s('text', { x: 132, y: top + (big ? 84 : 62), 'font-size': big ? 46 : 32, 'font-weight': 600, fill: '#fff' }, deg(temp(z.id))));
      link.append(s('text', { x: 132, y: top + (big ? 112 : 84), 'font-size': big ? 17 : 15, fill: TEXT[st.kind] }, short(st.text)));
      if (unitCool) {
        const uy = top + 12;
        link.append(s('rect', { x: 340, y: uy, width: 64, height: 12, rx: 4, fill: running ? '#DDF3FF' : 'rgba(255,255,255,0.35)', filter: running ? 'url(#nGlow)' : '' }));
        if (running) {
          link.append(s('path', { d: `M350,${uy + 20} q6,8 0,16 M372,${uy + 20} q6,8 0,16 M394,${uy + 20} q6,8 0,16`, fill: 'none', stroke: st.kind === 'cool' ? '#8FD9FF' : '#FFB088', 'stroke-width': 2, 'stroke-linecap': 'round' }));
          if (sunny) flows.push({ path: `M372,150 C452,196 456,${uy - 26} 404,${uy}` });
        }
      }
    }
  });

  if (n >= 2) svg.append(s('path', { d: 'M100,214 L270,70 L440,214', fill: 'none', stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  svg.append(s('rect', { x: 110, y: boxTop, width: 320, height: 470 - boxTop, fill: 'none', stroke: 'rgba(255,255,255,0.24)', 'stroke-width': 1.5 }));

  if (solar != null && n >= 2) {
    // Twee dakvlakken (oost en west, besluit 93): op elke kant panelen, en elk
    // licht op naar wat het bij een heldere lucht nu zou vangen. Uit de dienst.
    const planes = sunInfo?.panelen ?? [];
    const lit = (i) => sunny && (planes.length < 2 || (planes[i]?.heldereLuchtW ?? 0) > 50);
    const slopes = planes.length >= 2 ? [['rotate(40.3)', -15, 0], ['rotate(139.7)', 5, 1]] : [['rotate(40.3)', -15, 0]];
    for (const [rot, y, i] of slopes) {
      const on = lit(i);
      const g = s('g', { transform: `translate(270,70) ${rot}`, filter: on ? 'url(#nGlow)' : '' });
      for (const x of [30, 66, 102, 138, 174]) {
        g.append(s('rect', { x, y, width: 32, height: 10, rx: 2, fill: on ? '#24496A' : '#1A2733', stroke: on ? '#F5B342' : 'rgba(255,255,255,0.25)', 'stroke-opacity': 0.8 }));
      }
      svg.append(g);
    }
  }

  // Zon naar de airco die Smart Climate zou laten draaien, of anders naar het huis.
  const toHouse = flows.length === 0 && sunny && n >= 2;
  if (toHouse) flows.push({ path: 'M372,150 C452,196 462,330 432,396' });
  for (const f of flows) {
    svg.append(s('path', { d: f.path, fill: 'none', stroke: 'url(#nFlow)', 'stroke-width': 8, 'stroke-opacity': 0.18, 'stroke-linecap': 'round' }));
    svg.append(s('path', { class: 'flow', d: f.path, fill: 'none', stroke: toHouse ? '#F5B342' : 'url(#nFlow)', 'stroke-width': 3.5, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', filter: 'url(#nGlow)' }));
  }
  if (flows.length > 0) {
    const toHouseW = Math.min(fl.zonKw ?? 0, fl.verbruikKw ?? 0) * 1000;
    // In de schaduw is wat naar de airco's gaat een plan van Smart Climate, geen meting.
    const units = flows.length > 1 ? "airco's" : 'airco';
    const big = toHouse ? kw(toHouseW) : fl.geplandKw > 0 ? `≈ ${kw(fl.geplandKw * 1000)}` : null;
    const small = toHouse ? 'naar het huis' : site?.migrating ? `gepland voor ${units}` : `naar ${units}`;
    if (big) {
      // Een donkere rand om de letters houdt ze leesbaar boven de stippellijn.
      const halo = { stroke: '#0A141C', 'stroke-width': 5, 'paint-order': 'stroke', 'stroke-linejoin': 'round' };
      svg.append(s('text', { x: 516, y: 262, 'text-anchor': 'end', 'font-size': 20, 'font-weight': 700, fill: toHouse ? '#F5C66E' : '#8FD9FF', ...halo }, big));
      svg.append(s('text', { x: 516, y: 282, 'text-anchor': 'end', 'font-size': 14, fill: '#A9BAC2', ...halo }, small));
    }
  }

  // Het net: een mast, en een stroom erheen of ervandaan.
  svg.append(s('path', { d: 'M478,470 L490,404 L502,470 M482,446 L498,446 M486,424 L494,424 M472,408 L508,408', fill: 'none', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
  // Het net, afgerond zoals de rest: wat hier staat, telt op met de zon en het huis.
  if (fl.netKw !== 0) {
    const exporting = fl.netKw < 0;
    svg.append(s('path', { class: 'flow', d: exporting ? 'M430,446 C452,446 466,436 484,418' : 'M484,418 C466,436 452,446 430,446', fill: 'none', stroke: exporting ? '#6FDCA6' : '#A9BAC2', 'stroke-width': 3.5, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', filter: 'url(#nGlow)' }));
    svg.append(s('text', { x: 516, y: 496, 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: exporting ? '#6FDCA6' : '#C9D6DC' }, exporting ? `${kw(fl.netKw * 1000)} terug` : `${kw(fl.netKw * 1000)} van het net`));
  }

  const names = zones.map((z) => z.name).join(', ');
  svg.setAttribute('aria-label', `Doorsnede van het huis met ${names}`);
  $('huis').replaceChildren(svg);

  $('legenda').replaceChildren(
    ...[
      ['#F5B342', `Zon ${fl.zonKw == null ? '—' : kw(fl.zonKw * 1000)}`],
      // Gemeten: wat de airco's echt opnemen, ook als je huidige regeling ze stuurt.
      ['#5CC8FF', `${site?.migrating ? 'Airco gemeten' : 'Airco'} ${kw(fl.aircoKw * 1000)}`],
      ['#8FA3AD', `Huis ${fl.huisKw == null ? '—' : kw(fl.huisKw * 1000)}`],
      ...(facadeLine() ? [['#F5C66E', facadeLine()]] : []),
    ].map(([c, t]) => el('span', {}, el('i', { style: `background: ${c}` }), t)),
  );
}

/** Kort genoeg voor in de tekening. */
function short(text) {
  return text.length > 24 ? `${text.slice(0, 23)}…` : text.toLowerCase();
}

/* ------------------------------------------------------- Thuis */

function renderHome(snap) {
  const e = snap.explanation;
  const zones = site?.zones ?? e.perZone.map((z) => ({ id: z.zoneId, name: z.zoneId }));
  const statuses = zones.map((z) => ({ z, st: zoneStatus(snap, z.id) }));
  const b = snap.bewoner ?? {};

  // De kop, de lijst en de stromen komen uit de dienst (besluit 94).
  $('h-eyebrow').textContent = b.kop?.boven ?? '';
  $('h-titel').textContent = b.kop?.titel ?? '';
  $('h-zin').textContent = b.kop?.zin ?? '';

  $('h-rooms').replaceChildren(
    ...statuses.map(({ z, st }) => {
      const pz = e.perZone.find((p) => p.zoneId === z.id);
      const extra = pz?.humidityPct != null ? ` · ${pz.humidityPct}% vocht` : '';
      const real = site?.migrating ? `Je huidige regeling: ${zoneReal(snap, z.id)}` : null;
      // Aantikken zoomt in op de ruimte van deze zone (ONTWERP §4).
      return el(
        'a',
        { class: 'room', href: `#huis/zone/${encodeURIComponent(z.id)}` },
        el('span', { class: `dot glow k-${st.kind}` }),
        el('div', { style: 'display: flex; flex-direction: column; gap: 2px; min-width: 0' }, el('span', { class: 'name', text: z.name }), el('span', { class: `status k-${st.kind}`, text: st.text + extra }), real ? el('span', { class: 'real', text: real }) : null),
        el('span', { class: 'temp', text: deg(pz?.temperatureC ?? null) }),
      );
    }),
  );

  // Wat Smart Climate per apparaat zou doen, met de reden. Wat niets te doen
  // heeft, komt samen op één regel; anders wint de lijst het van het huis.
  const lines = (b.apparaten ?? []).map((d) =>
    el('div', { style: 'display: flex; gap: 10px; align-items: flex-start' }, el('span', { class: `dot k-${d.soort}`, style: 'margin-top: 5px' }), el('div', {}, el('b', { text: d.naam }), el('div', { class: 'muted', text: d.tekst }))),
  );
  if (b.rust) {
    lines.push(el('div', { style: 'display: flex; gap: 10px; align-items: flex-start' }, el('span', { class: 'dot k-idle', style: 'margin-top: 5px' }), el('div', { class: 'muted', text: b.rust })));
  }
  $('nu-lijst').replaceChildren(...lines);
  $('besluit-tijd').textContent = `besluit ${hhmm(snap.atMs)}`;

  const legacy = plainLegacy(snap.legacy);
  $('h-ai').hidden = !site?.migrating || !legacy;
  $('oud').textContent = legacy ?? '';

  $('buiten').textContent = e.outdoorTemperatureC == null ? '' : `${nl(e.outdoorTemperatureC)}° buiten`;
  drawHouse(snap);
}

/* ------------------------------------------------------- Vandaag */

let today = null;
let todayAt = 0;

async function loadToday(force = false) {
  if (!force && Date.now() - todayAt < 60_000) return;
  todayAt = Date.now();
  // De zoninval (besluit 93): kant-en-klaar uit de dienst; zonder ligging blijft hij weg.
  try {
    const res = await fetch('api/zon');
    sunInfo = res.ok ? await res.json() : null;
  } catch {
    sunInfo = null;
  }
  try {
    const res = await fetch('api/vandaag');
    if (!res.ok) return;
    today = await res.json();
    renderToday();
    renderLog();
  } catch {
    // Zonder dagoverzicht blijven de live kaarten gewoon werken.
  }
}

let sunInfo = null;

/** "Zon op de voorgevel", of niets als de ligging onbekend is of de zon onder is. */
function facadeLine() {
  if (!sunInfo?.zon?.boven) return null;
  const lit = sunInfo.gevels.filter((g) => g.inDeZon).map((g) => g.naam.toLowerCase());
  return lit.length ? `Zon op de ${lit.join(' en de ')}` : 'Zon op geen gevel';
}

/** De zon van vandaag, met per apparaat wanneer het draaide. */
function renderToday() {
  const t = today;
  if (!t) return;
  const DAY = 86_400_000;
  const X = (ms) => 10 + ((ms - t.vanMs) / DAY) * 280;
  const clear = sunInfo?.kwartieren ?? [];
  const peak = Math.max(1500, ...t.kwartieren.map((k) => k.zonW ?? 0), ...clear.map((k) => k.heldereLuchtW));
  const Y = (w) => 104 - (w / peak) * 90;
  const lanes = t.apparaten.filter((a) => a.smartClimate.length || a.huidig.length || canCool(a.actuatorId));
  // Elke baan een eigen regel voor de naam, zodat een balk hem niet bedekt.
  const height = 118 + lanes.length * 26 + 18;
  const svg = s('svg', { viewBox: `0 0 300 ${height}`, role: 'img', 'aria-label': 'Zon van vandaag en wanneer de apparaten draaiden' });
  const defs = s('defs');
  defs.innerHTML = '<linearGradient id="vSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5B342" stop-opacity="0.55"/><stop offset="1" stop-color="#F5B342" stop-opacity="0.04"/></linearGradient>';
  svg.append(defs);

  const pts = t.kwartieren.filter((k) => k.zonW != null).map((k) => [X(k.tMs + 450_000), Y(k.zonW)]);
  if (pts.length > 1) {
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    svg.append(s('path', { d: `${line} L${pts.at(-1)[0].toFixed(1)},104 L${pts[0][0].toFixed(1)},104 Z`, fill: 'url(#vSun)' }));
    svg.append(s('path', { d: line, fill: 'none', stroke: '#F5B342', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
  }
  // Wat de panelen bij een heldere lucht zouden leveren: de bovenkant van de dag.
  const cpts = clear.filter((k) => k.heldereLuchtW > 0).map((k) => [X(k.tMs + 450_000), Y(k.heldereLuchtW)]);
  if (cpts.length > 1) {
    svg.append(s('path', { d: cpts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '), fill: 'none', stroke: '#F5C66E', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.8 }));
  }
  svg.append(s('line', { x1: 10, y1: 104, x2: 290, y2: 104, stroke: 'rgba(255,255,255,0.12)' }));
  const nowX = X(Date.now());
  svg.append(s('line', { x1: nowX, y1: 12, x2: nowX, y2: height - 18, stroke: '#fff', 'stroke-opacity': 0.6 }));
  svg.append(s('text', { x: nowX, y: 9, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#fff' }, 'nu'));

  lanes.forEach((a, i) => {
    const y = 128 + i * 26;
    svg.append(s('text', { x: 10, y: y - 3, 'font-size': 10, fill: '#8FA3AD' }, actuatorName(a.actuatorId)));
    for (const sp of a.smartClimate) {
      svg.append(s('rect', { x: X(sp.vanMs), y: y - 1, width: Math.max(2, X(sp.totMs) - X(sp.vanMs)), height: 8, rx: 3, fill: sp.actie === 'heat' ? '#FF8A4C' : '#5CC8FF' }));
    }
    for (const sp of a.huidig) {
      svg.append(s('rect', { x: X(sp.vanMs), y: y + 9, width: Math.max(2, X(sp.totMs) - X(sp.vanMs)), height: 3, rx: 1.5, fill: '#A9BAC2' }));
    }
  });
  for (const [h, anchor] of [[0, 'start'], [6, 'middle'], [12, 'middle'], [18, 'middle'], [24, 'end']]) {
    svg.append(s('text', { x: X(t.vanMs + h * 3_600_000), y: height - 4, 'text-anchor': anchor, 'font-size': 10, fill: '#6E828C' }, String(h).padStart(2, '0')));
  }
  $('v-grafiek').replaceChildren(svg);
  const top = t.kwartieren.reduce((m, k) => ((k.zonW ?? 0) > (m?.zonW ?? -1) ? k : m), null);
  $('v-piek').textContent = top && top.zonW > 0 ? `piek ${kw(top.zonW)} om ${hhmm(top.tMs + 450_000)}` : 'nog geen zon';
  $('v-helder').hidden = cpts.length < 2;
  $('h-vandaag').hidden = false;

  // Wat de zon vandaag opleverde.
  const zon = t.zonWh / 1000;
  const self = t.zonWh > 0 ? Math.max(0, Math.min(1, (t.zonWh - t.netTerugWh) / t.zonWh)) : 0;
  $('h-kpi').replaceChildren(
    el('div', { class: 'small', style: 'color: var(--soft)', text: 'Vandaag tot nu toe' }),
    el('div', { style: 'display: flex; align-items: baseline; gap: 10px' }, el('b', { text: nl(zon) }), el('span', { class: 'small', style: 'color: var(--soft)', text: t.zonWh > 0 ? `kWh zon, daarvan ${Math.round(self * 100)}% zelf gebruikt` : 'kWh zon' })),
    el('div', { class: 'bar' }, el('div', { style: `width: ${Math.round(self * 100)}%` })),
    el('div', { class: 'tiny', text: `${nl(t.netAfWh / 1000)} kWh van het net · ${nl(t.netTerugWh / 1000)} kWh terug` }),
  );
  $('h-kpi').hidden = false;
}

/* ------------------------------------------------------- Opgevallen */

const BECAUSE = {
  insufficient_power_budget: 'er te weinig zon over was',
  start_threshold_not_met: 'er net te weinig zon was om te starten',
  stabilisation_active: 'het verbruik nog niet stabiel was',
  min_rest_not_elapsed: 'hij eerst moest rusten',
  min_run_not_elapsed: 'hij zijn minimale draaitijd nog niet had',
  insufficient_current_budget: 'de hoofdzekering dan te zwaar belast zou worden',
};

function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} uur ${m} min` : `${m} min`;
}

/** Het patroon met de meeste netstroom, anders het zwaarste. */
function renderNoticed() {
  const list = review?.patronen ?? [];
  if (!list.length || !site?.migrating) return;
  const p = [...list].sort((a, b) => b.wh - a.wh)[0];
  const name = actuatorName(p.actuatorId);
  const mode = (MODE[p.mode] ?? p.mode).toLowerCase();
  if (p.direction === 'strenger') {
    $('og-titel').textContent = `${name}: ik zou vaker stoppen`;
    $('og-tekst').textContent =
      `${p.keren} keer liet je huidige regeling de ${name.toLowerCase()} draaien terwijl ik zou stoppen` +
      `${p.blockedBy && BECAUSE[p.blockedBy] ? `, omdat ${BECAUSE[p.blockedBy]}` : ''} (modus ${mode}). ` +
      `Samen ${duration(p.minuten)}${p.wh > 0 ? ` en ${nl(p.wh / 1000)} kWh van het net` : ''}.`;
  } else {
    $('og-titel').textContent = `${name}: ik zou vaker draaien`;
    $('og-tekst').textContent = `${p.keren} keer zou ik de ${name.toLowerCase()} laten draaien waar je huidige regeling niets deed (modus ${mode}), samen ${duration(p.minuten)}.`;
  }
  $('h-opgevallen').hidden = false;
}

/* ------------------------------------------------------- Waarom */

function remember(snap) {
  const words = snap.bewoner?.besluit;
  if (!snap.commands?.length || !words) return;
  const entry = { t: snap.atMs, what: words.wat, why: words.waarom };
  if (log.some((x) => x.t === entry.t)) return;
  log.unshift(entry);
  log = log.slice(0, 100);
  try {
    sessionStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // Zonder opslag werkt de lijst gewoon tot de pagina sluit.
  }
}

function renderLog() {
  const box = $('tijdlijn');
  if (today) {
    const fromDay = today.besluiten.map((b) => ({ t: b.tMs, what: b.wat ?? [], why: b.waarom ?? [] }));
    const newer = log.filter((x) => x.t > (today.besluiten[0]?.tMs ?? today.totMs));
    const all = [...newer, ...fromDay];
    $('w-lead').textContent = 'Wat Smart Climate vandaag besloot, met de reden. Nieuwste bovenaan.';
    const item = (x) => el('div', { class: 'event' }, el('time', { text: hhmm(x.t) }), el('div', {}, el('b', { text: x.what.join(' · ') }), x.why.length ? el('p', { text: x.why.join(' · ') }) : null));
    if (all.length) {
      box.replaceChildren(...all.map(item));
      return;
    }
    box.replaceChildren(el('div', { class: 'event' }, el('time', { text: '—' }), el('div', {}, el('b', { text: 'Vandaag nog niets veranderd' }), el('p', { text: 'Zodra Smart Climate iets anders zou doen, verschijnt het hier met de reden.' }))));
    return;
  }
  if (log.length === 0) {
    box.replaceChildren(el('div', { class: 'event' }, el('time', { text: '—' }), el('div', {}, el('b', { text: 'Nog niets veranderd' }), el('p', { text: 'Zodra Smart Climate iets anders zou doen, verschijnt het hier met de reden.' }))));
    return;
  }
  box.replaceChildren(...log.map((x) => el('div', { class: 'event' }, el('time', { text: hhmm(x.t) }), el('div', {}, el('b', { text: x.what.join(' · ') }), x.why.length ? el('p', { text: x.why.join(' · ') }) : null))));
}

/* ------------------------------------------------------- Opbrengst */

async function loadReview() {
  try {
    const res = await fetch('api/divergence');
    if (!res.ok) {
      $('o-periode').textContent = 'De terugblik is nog niet doorgerekend.';
      return;
    }
    review = await res.json();
    renderReview();
    renderNoticed();
  } catch {
    $('o-periode').textContent = 'De terugblik is nu niet bereikbaar.';
  }
}

function renderReview() {
  const r = review;
  const days = Math.max(1, Math.round((r.totMs - r.vanMs) / 86_400_000));
  $('o-periode').textContent = `${days} dagen meekijken naast je huidige regeling.`;
  const legacyKwh = r.legacyGridWh / 1000;
  const avoid = r.avoidableGridWh / 1000;
  const ours = Math.max(0, legacyKwh - avoid);
  const pct = legacyKwh > 0 ? Math.round((avoid / legacyKwh) * 100) : 0;
  $('o-hero').replaceChildren(
    el('div', { class: 'big k-cool', text: legacyKwh > 0 ? `−${pct}%` : '—' }),
    el('div', { style: 'font-size: 16px; font-weight: 600', text: "netstroom voor de airco's" }),
    el('div', { class: 'small muted', text: `${nl(avoid)} van de ${nl(legacyKwh)} kWh had Smart Climate vermeden` }),
    barRow('Huidige regeling', legacyKwh, 100, 'rgba(169,186,194,0.45)'),
    barRow('Smart Climate', ours, legacyKwh > 0 ? (ours / legacyKwh) * 100 : 0, null),
  );
  // De dataset (seizoenen, winterdagen) is een cijfer over de opname, en staat
  // in de schaduwweergave; hier alleen wat de bewoner er iets aan heeft.
  $('o-tegels').replaceChildren(
    el('div', { class: 'card', style: 'gap: 4px' }, el('div', { style: 'font-size: 24px; font-weight: 600', text: `${r.episodesTotaal}` }), el('div', { class: 'small muted', text: 'keer dat Smart Climate het anders zou doen' })),
  );
  $('o-voet').textContent = `Gemeten terwijl Smart Climate meekeek: wat hij zou hebben gedaan. Bijgewerkt om ${hhmm(r.berekendOpMs)}.`;
}

function barRow(label, kwh, pct, color) {
  return el(
    'div',
    { class: 'stack', style: 'gap: 4px' },
    el('div', { class: 'small', style: 'display: flex; justify-content: space-between' }, el('b', { text: label }), el('span', { text: `${nl(kwh)} kWh` })),
    el('div', { class: 'bar', style: 'height: 12px' }, el('div', { style: `width: ${Math.max(0, Math.min(100, pct))}%${color ? `; background: ${color}` : ''}` })),
  );
}

/* ------------------------------------------------------- Bediening */

function renderControls(snap) {
  const e = snap.explanation;
  const modes = ['dag', 'nacht', 'afwezig', 'vakantie', 'handmatig'];
  const seg = $('b-modus');
  // Minstens zo breed als het woord: "Handmatig" paste niet in een vijfde.
  seg.style.gridTemplateColumns = `repeat(${modes.length}, minmax(max-content, 1fr))`;
  seg.replaceChildren(...modes.map((m) => el('button', { type: 'button', 'aria-pressed': String(m === e.mode), disabled: '', text: MODE[m] })));
  $('b-modus-noot').textContent =
    e.modeSource === 'override' ? 'Deze modus is met de hand gekozen.' : `Volgt het dagritme${e.occupied ? ', er is iemand thuis' : ', er is niemand thuis'}.`;

  $('b-doelen').replaceChildren(
    ...(site?.zones ?? []).map((z) => {
      const pz = e.perZone.find((p) => p.zoneId === z.id);
      return el('div', { class: 'row' }, el('div', { class: 'l' }, el('b', { text: z.name }), el('span', { text: `nu ${deg(pz?.temperatureC ?? null)}` })), el('b', { text: pz?.targetC == null ? 'geen doel' : `doel ${nl(pz.targetC)}°` }));
    }),
  );

  $('b-wie').replaceChildren(
    ...(site?.actuators ?? []).map((a) =>
      el(
        'div',
        { class: 'row' },
        el('div', { class: 'l' }, el('b', { text: a.name }), el('span', { text: site.migrating ? `Je huidige regeling stuurt · ${describeObserved(snap.observed?.[a.id])}` : 'Smart Climate stuurt' })),
        el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!site.migrating), 'aria-label': `Smart Climate stuurt ${a.name}`, disabled: '' }, el('span')),
      ),
    ),
  );
}

/* ------------------------------------------------------- gevoel */

/*
 * Gevoel en toelichting (besluit 84). De enige knoppen op deze pagina die iets
 * vastleggen, en alleen in een eigen bestand naast het logboek. Is de deur er
 * niet, dan blijft de kaart weg.
 */
const FEELINGS = [
  ['te_koud', 'Te koud', 'cool'],
  ['goed', 'Goed', 'ok'],
  ['te_warm', 'Te warm', 'heat'],
];
const NOTES = [
  ['koken', 'We koken'],
  ['raam_open', 'Raam open'],
  ['gasten', 'Gasten'],
  ['douche', 'Douche'],
  ['zon_door_raam', 'Zon door het raam'],
  ['weet_niet', 'Weet ik niet'],
];
const feedbackLabel = (r) =>
  r.gevoel ? FEELINGS.find(([k]) => k === r.gevoel)?.[1] : NOTES.find(([k]) => k === r.toelichting)?.[1];
let feedbackZone = null;

function feedbackStatus(r) {
  $('g-status').textContent = r ? `laatst ${hhmm(r.t)}: ${zoneName(r.zoneId)}, ${feedbackLabel(r)?.toLowerCase()}` : '';
}

async function sendFeedback(body) {
  try {
    const res = await postDoor('api/gevoel', body);
    const answer = await res.json();
    if (res.ok) feedbackStatus(answer);
    else $('g-status').textContent = answer.fout ?? 'niet gelukt';
  } catch {
    $('g-status').textContent = 'niet gelukt; geen verbinding';
  }
}

async function setupFeedback() {
  let list;
  try {
    const res = await fetch('api/gevoel');
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return;
  }
  const zones = site?.zones ?? [];
  if (!zones.length) return;
  feedbackZone = zones[0].id;
  const seg = $('g-zones');
  seg.style.gridTemplateColumns = `repeat(${zones.length}, minmax(max-content, 1fr))`;
  const pick = (id) => {
    feedbackZone = id;
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.zone === id));
  };
  seg.replaceChildren(
    ...zones.map((z) => {
      const b = el('button', { type: 'button', 'data-zone': z.id, 'aria-pressed': 'false', text: z.name });
      b.addEventListener('click', () => pick(z.id));
      return b;
    }),
  );
  pick(feedbackZone);
  $('g-voel').replaceChildren(
    ...FEELINGS.map(([key, label, kind]) => {
      const b = el('button', { type: 'button', class: `fb ${kind}`, text: label });
      b.addEventListener('click', () => void sendFeedback({ zoneId: feedbackZone, gevoel: key }));
      return b;
    }),
  );
  $('g-notes').replaceChildren(
    ...NOTES.map(([key, label]) => {
      const b = el('button', { type: 'button', class: 'fb note', text: label });
      b.addEventListener('click', () => void sendFeedback({ zoneId: feedbackZone, toelichting: key }));
      return b;
    }),
  );
  feedbackStatus(list[0]);
  $('h-gevoel').hidden = false;
}

/* ------------------------------------------------------- verbinding */

function connection(ok, text) {
  const chip = $('verbinding');
  chip.className = `chip ${ok ? 'good' : 'bad'}`;
  chip.lastElementChild.textContent = text;
}

function render(snap) {
  latest = snap;
  remember(snap);
  if (snap.commands?.length) void loadToday(true);
  renderHome(snap);
  renderLog();
  renderControls(snap);
}

/* ------------------------------------------------------- inloggen */

/*
 * Bedienen vraagt een inlog met je Home Assistant-account (besluit 99); kijken
 * niet. Wie zonder inlog op een knop tikt, gaat naar het inlogscherm van Home
 * Assistant en komt daarna terug op dezelfde plek.
 */
let session = null;

async function loadSession() {
  try {
    session = await (await fetch('api/sessie')).json();
  } catch {
    session = null;
  }
  renderSession();
}

function loginHref() {
  return `auth/login?terug=${encodeURIComponent(location.pathname + location.hash)}`;
}

/** Een POST naar een deur. Zonder inlog: naar het inlogscherm, en geen antwoord. */
async function postDoor(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) {
    location.href = loginHref();
    return new Promise(() => {});
  }
  return res;
}

function renderSession() {
  const box = $('b-account');
  if (!box) return;
  if (!session || session.toegang !== 'sessions') {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (session.ingelogd) {
    const out = button('Uitloggen', async () => {
      await fetch(session.uitlog, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await loadSession();
    });
    box.replaceChildren(el('span', { text: `Ingelogd als ${session.naam} · ${session.rol}` }), out);
  } else {
    box.replaceChildren(el('span', { text: 'Je kijkt mee. Log in met je Home Assistant-account om te bedienen.' }), el('a', { class: 'knop', href: loginHref(), text: 'Inloggen' }));
  }
}

/* ------------------------------------------------------- huis */

/*
 * Het huis als navigatie (ONTWERP §4, besluit 94): huis, etage, ruimte. Namen,
 * standen en zinnen komen kant-en-klaar uit /api/huis; deze pagina kiest alleen
 * welk niveau ze toont. Bedienen zegt wat Smart Climate zou doen.
 */
let house = null;
let houseAt = 0;
let houseTried = false;
// Of er in een veld van het indelen getypt wordt dat nog niet bewaard is. Een
// verversing die dan binnenkomt, bijvoorbeeld het laden bij het openen van het
// huis, tekent niet opnieuw: anders is wat je typte weg voor het bewaren (de CI
// ving dat, 7 oktober).
let typing = false;
for (const [type, value] of [
  ['input', true],
  ['change', false],
  ['focusout', false],
]) {
  document.addEventListener(type, (ev) => {
    if (editing && ev.target instanceof HTMLInputElement && ev.target.closest('#hu-lijst, #hu-blad')) typing = value;
  });
}

async function loadHouse(force = false) {
  if (!force && Date.now() - houseAt < 20_000) return;
  houseAt = Date.now();
  await loadLayoutInfo();
  let fresh = null;
  try {
    const res = await fetch('api/huis');
    fresh = res.ok ? await res.json() : null;
  } catch {
    // Geen verbinding: hieronder blijft de laatste stand staan.
  }
  // Een verversing die mislukt, bijvoorbeeld terwijl de dienst net opnieuw
  // start, wist het huis niet: de laatste stand blijft staan (besluit 82).
  if (fresh || !house) house = fresh;
  houseTried = true;
  if (!(editing && typing)) renderHouse();
}

const floorKey = (f) => f.id ?? 'geen';
const lampen = (n) => `${n} ${n === 1 ? 'lamp' : 'lampen'} aan`;

/*
 * Licht bedienen (besluit 97): rechtstreeks via Home Assistant, en alleen de
 * lampen die het huis toont. Welke dat zijn, beslist de dienst; deze pagina zegt
 * alleen het doel. Daarna even wachten tot Home Assistant de nieuwe stand
 * doorgeeft, en het huis opnieuw tekenen.
 */
async function switchLights(body, door = 'api/licht') {
  try {
    const res = await postDoor(door, body);
    const out = await res.json();
    if (!res.ok) return out.fout ?? out.wachten ?? 'Niet gelukt.';
    // Niet tijdens het indelen: dan ververst het huis nooit vanzelf, anders raakt
    // een veld waarin je typt zijn inhoud kwijt.
    setTimeout(() => {
      if (!editing) void loadHouse(true);
    }, 800);
    return null;
  } catch {
    return 'Geen verbinding met Smart Climate.';
  }
}

/** Hoeveel lampen er in deze kamers staan. */
const lampTotal = (rooms) => rooms.reduce((n, r) => n + r.apparaten.filter((d) => d.soort === 'licht').length, 0);

/**
 * "Alle lampen uit" voor een kamer, een etage of het huis. De app doet dat zelf,
 * met de lampen uit de indeling; een groep in Home Assistant is niet nodig. De
 * knop staat er altijd als er lampen zijn, en zegt het als er niets brandt.
 */
function allOff(body, on, total) {
  if (!house?.lichtBedienen || !total || editing) return [];
  const status = el('span', { class: 'small muted', 'aria-live': 'polite', text: on ? '' : 'Er brandt niets.' });
  const b = button('Alle lampen uit', async () => {
    status.textContent = 'Even…';
    const fout = await switchLights({ ...body, aan: false });
    status.textContent = fout ?? 'Gaat uit.';
  });
  if (!on) b.disabled = true;
  return [el('div', { class: 'knoppen' }, b, status)];
}

function houseRoute() {
  const [, level = null, key = null, sel = null] = (location.hash || '').slice(1).split('/');
  return {
    level,
    key: key == null ? null : decodeURIComponent(key),
    sel: sel == null ? null : decodeURIComponent(sel),
  };
}

function crumb(parts) {
  const out = [];
  parts.forEach(([label, href], i) => {
    if (i) out.push(el('span', { 'aria-hidden': 'true', text: '›' }));
    out.push(href ? el('a', { href, text: label, style: 'color: inherit; text-decoration: none' }) : el('b', { text: label }));
  });
  $('hu-pad').replaceChildren(...out);
}

function back(href, label) {
  $('hu-terug').href = href;
  $('hu-terug').textContent = `‹ ${label}`;
}

/** Kop van een niveau: titel, temperatuur rechts, een zin en de chips. */
function heading(title, { temp = null, zin = '', soort = null, samenvatting = null } = {}) {
  $('hu-titel').textContent = title;
  $('hu-temp').textContent = temp == null ? '' : deg(temp);
  $('hu-zin').textContent = zin;
  $('hu-zin').className = soort ? `lead k-${soort}` : 'lead';
  $('hu-chips').replaceChildren(...(editing ? [] : chips(samenvatting)));
}

/* Vaste, eigen iconen per soort; geen gegevens van buiten. */
const ICON = {
  licht: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  screen: '<rect x="3" y="3.5" width="18" height="3.5" rx="1"/><path d="M5 7v10h14V7M5 10.5h14M5 14h14"/>',
  airco: '<rect x="2.5" y="5" width="19" height="8" rx="2"/><path d="M6 10h12M8 16.5c-.5 1-.5 2 0 3M12 16v3.5M16 16.5c.5 1 .5 2 0 3"/>',
  thermostaat: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  meter: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9.5V17"/>',
};

/** "21,4° · 55%": wat een meter of klimaatapparaat meet. */
function readingText(m) {
  if (!m) return '';
  const parts = [m.temperatuurC == null ? null : deg(m.temperatuurC), m.vochtPct == null ? null : `${Math.round(m.vochtPct)}%`];
  return parts.filter(Boolean).join(' · ');
}

/** De stand van een apparaat, met voor klimaat erbij wat het meet. */
function standText(d) {
  const meet = d.soort === 'klimaat' ? readingText(d.meting) : '';
  return meet ? `${d.stand} · ${meet}` : d.stand;
}

function icon(d, klein = false) {
  // Een airco kan koelen; wat alleen verwarmt, is een thermostaat (de Nest, de badkamer).
  const kind = d.soort === 'klimaat' ? (d.klimaat?.kanKoelen ? 'airco' : 'thermostaat') : d.soort;
  const svg = s('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    class: `icoon${klein ? ' klein' : ''}${d.aan ? ` aan-${d.soort}` : ''}`,
  });
  svg.innerHTML = ICON[kind] ?? ICON.thermostaat;
  return svg;
}

/** "2 lampen aan", "Screens 60% dicht", "Er draait niets": uit de dienst. */
function chips(sum) {
  if (!sum) return [];
  const out = [el('span', { class: `chip ${sum.lampenAan ? 'licht' : 'plain'}`, text: sum.lampenAan ? lampen(sum.lampenAan) : 'Geen licht aan' })];
  if (sum.screens) out.push(el('span', { class: 'chip screen', text: `Screens ${sum.screens}` }));
  out.push(el('span', { class: `chip ${sum.draait ? 'klimaat' : 'good'}`, text: sum.klimaat }));
  return out;
}

/**
 * Een schakelaar voor een lamp (besluit 97). Hij springt meteen om; lukt het
 * niet, dan terug, met de reden. Zonder licht bedienen staat hij uit.
 */
function lampSwitch(d, say) {
  const sw = el(
    'button',
    { type: 'button', class: 'switch live', role: 'switch', 'aria-checked': String(d.aan), 'aria-label': `${d.naam} aan of uit` },
    el('span'),
  );
  if (!house?.lichtBedienen) sw.disabled = true;
  sw.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const aan = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(aan));
    const fout = await switchLights({ doel: 'lamp', id: d.id, aan });
    if (fout) sw.setAttribute('aria-checked', String(!aan));
    say(fout ?? `${d.naam} gaat ${aan ? 'aan' : 'uit'}.`);
  });
  return sw;
}

/*
 * Wit en kleur (besluit 100, `Lamp`, `Lamp-wit`): twee tabs, alleen wat de lamp
 * kan. Wit is een schuif van warm tot daglicht met drie vaste standen; kleur zijn
 * acht vaste kleuren en het rad voor elke andere. De dienst houdt kelvin binnen
 * het bereik van de lamp.
 */
const WHITES = [
  ['Warm', 2700, 'warm wit'],
  ['Neutraal', 4000, 'neutraal wit'],
  ['Daglicht', 6500, 'daglicht'],
];
const COLOURS = [
  ['rood', 0, 85],
  ['oranje', 30, 90],
  ['geel', 52, 85],
  ['groen', 140, 65],
  ['turkoois', 180, 70],
  ['blauw', 220, 75],
  ['paars', 270, 65],
  ['roze', 320, 65],
];
/** Welke tab per lamp open stond, zodat een verversing hem niet terugzet. */
const lampTab = new Map();

const whiteWord = (k) => (k < 3300 ? 'warm wit' : k < 5000 ? 'neutraal wit' : 'daglicht');

/** Tint en verzadiging (zoals Home Assistant ze geeft) als CSS-kleur, op volle helderheid. */
function hsCss(h, sat) {
  const sv = sat / 100;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - sv * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `rgb(${f(5)}, ${f(3)}, ${f(1)})`;
}

/** "#ff8800" naar tint en verzadiging. */
function hexHs(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), max === 0 ? 0 : Math.round((d / max) * 100)];
}

/** De naam van een vaste kleur dicht bij deze tint, of null. */
function colourName(tint) {
  if (!tint) return null;
  const near = COLOURS.find(([, h, s]) => Math.min(Math.abs(h - tint[0]), 360 - Math.abs(h - tint[0])) <= 12 && Math.abs(s - tint[1]) <= 20);
  return near?.[0] ?? null;
}

function lampColour(d, say, live) {
  const kan = d.licht;
  const tabs = [kan.wit ? 'wit' : null, kan.kleur ? 'kleur' : null].filter(Boolean);
  let tab = lampTab.get(d.id) ?? (kan.tint && kan.kleur ? 'kleur' : tabs[0]);
  if (!tabs.includes(tab)) tab = tabs[0];
  const box = el('div', { class: 'stack lampkleur' });
  const send = async (body, done) => {
    say('Even…');
    const fout = await switchLights({ doel: 'lamp', id: d.id, aan: true, ...body });
    say(fout ?? done);
  };

  const wit = () => {
    const { minK, maxK } = kan.wit;
    const now = kan.kelvin ?? Math.min(maxK, Math.max(minK, 2700));
    const slider = el('input', { type: 'range', class: 'dimmer wit-schuif', min: String(minK), max: String(maxK), step: '50', value: String(now), 'aria-label': `Wit van ${d.naam}, van warm tot daglicht` });
    slider.disabled = !live;
    slider.addEventListener('change', () => void send({ kelvin: Number(slider.value) }, `${d.naam} op ${whiteWord(Number(slider.value))}.`));
    const presets = el('div', { class: 'knoppen drie' });
    for (const [label, k, word] of WHITES) {
      const b = el('button', { type: 'button', text: label, 'aria-pressed': String(kan.kelvin != null && whiteWord(kan.kelvin) === word) });
      b.disabled = !live;
      b.addEventListener('click', () => void send({ kelvin: Math.min(maxK, Math.max(minK, k)) }, `${d.naam} ${word}.`));
      presets.append(b);
    }
    return [slider, el('div', { class: 'tussen small muted' }, el('span', { text: 'Warm, geel' }), el('span', { text: 'Daglicht, koel' })), presets];
  };

  const kleur = () => {
    const name = colourName(kan.tint);
    const swatches = el(
      'div',
      { class: 'stalen' },
      ...COLOURS.map(([naam, h, sat]) => {
        const b = el('button', { type: 'button', style: `--staal: ${hsCss(h, sat)}`, 'aria-label': naam, title: naam, 'aria-pressed': String(name === naam) });
        b.disabled = !live;
        b.addEventListener('click', () => void send({ tint: [h, sat] }, `${d.naam} ${naam}.`));
        return b;
      }),
    );
    const pick = el('input', { type: 'color', value: '#ff9a3c', 'aria-label': `Een andere kleur voor ${d.naam}` });
    pick.disabled = !live;
    pick.addEventListener('change', () => void send({ tint: hexHs(pick.value) }, `${d.naam} in de gekozen kleur.`));
    return [el('div', { class: 'kleuren' }, el('label', { class: 'kleurrad', title: 'Elke andere kleur' }, pick), swatches)];
  };

  const draw = () => {
    const parts = [];
    if (tabs.length > 1) {
      const seg = el('div', { class: 'seg pick', role: 'group', 'aria-label': 'Wit of kleur', style: 'grid-template-columns: 1fr 1fr' });
      for (const t of tabs) {
        const b = el('button', { type: 'button', text: t === 'wit' ? 'Wit' : 'Kleur', 'aria-pressed': String(t === tab) });
        b.addEventListener('click', () => {
          tab = t;
          lampTab.set(d.id, t);
          draw();
        });
        seg.append(b);
      }
      parts.push(seg);
    }
    parts.push(...(tab === 'kleur' ? kleur() : wit()));
    box.replaceChildren(...parts);
  };
  draw();
  return box;
}

/** De scènes van de ruimte, uit Hue (besluit 100): één tik zet alle lampen ervan. */
function roomScenes(room, say, live) {
  const grid = el(
    'div',
    { class: 'scenes' },
    ...room.scenes.map((sc) => {
      const b = el('button', { type: 'button', text: sc.naam, 'aria-pressed': String(sc.actief) });
      b.disabled = !live;
      b.addEventListener('click', async () => {
        say('Even…');
        const fout = await switchLights({ id: sc.id }, 'api/scene');
        say(fout ?? `Scène ${sc.naam} in de ${room.naam.toLowerCase()}.`);
      });
      return b;
    }),
  );
  return el(
    'section',
    { class: 'scenebox stack' },
    el('div', { class: 'tussen' }, el('b', { text: `Scènes in de ${room.naam.toLowerCase()}` }), el('span', { class: 'small muted', text: 'uit Hue' })),
    grid,
    el('p', { class: 'small muted', text: `Een scène zet alle lampen van de ${room.naam.toLowerCase()} in één keer. Je maakt en verandert ze in de Hue-app; hier kies je ze.` }),
  );
}

const KIND_ORDER = { licht: 0, screen: 1, klimaat: 2, meter: 3 };
const byKind = (list) => [...list].sort((a, b) => KIND_ORDER[a.soort] - KIND_ORDER[b.soort]);

/** Een apparaat dat in de kamer verder gaat: een rij met een pijltje. */
function deviceLink(room, d, naam = d.naam, stand = standText(d)) {
  return el(
    'a',
    { class: 'apparaatrij', href: `#huis/ruimte/${encodeURIComponent(room.id)}/${encodeURIComponent(d.id)}` },
    icon(d),
    el('div', { class: 'l' }, el('b', { text: naam }), el('span', { class: d.aan ? `aan-${d.soort}` : 'uit', text: stand })),
    el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }),
  );
}

/**
 * De rijen van een kamer op de etage (ONTWERP §4). Lampen met een schakelaar;
 * zijn het er veel, dan alleen wat aan is, en de rest in één rij naar de kamer.
 * Screens samen in één rij, klimaat per apparaat.
 */
function deviceRows(room, list) {
  const rows = [];
  const lamps = list.filter((d) => d.soort === 'licht');
  const shown = lamps.length <= 4 ? lamps : lamps.filter((d) => d.aan);
  for (const d of shown) {
    const stand = el('span', { class: d.aan ? 'aan-licht' : 'uit', text: d.stand });
    rows.push(
      el(
        'div',
        { class: 'apparaatrij' },
        icon(d),
        el('div', { class: 'l' }, el('b', { text: d.naam }), stand),
        lampSwitch(d, (text) => {
          stand.textContent = text;
        }),
      ),
    );
  }
  const rest = lamps.length - shown.length;
  if (rest > 0) {
    rows.push(
      el(
        'a',
        { class: 'apparaatrij', href: `#huis/ruimte/${encodeURIComponent(room.id)}` },
        icon({ soort: 'licht', aan: false }),
        el('div', { class: 'l' }, el('b', { text: `${rest} ${rest === 1 ? 'lamp' : 'lampen'} uit` }), el('span', { class: 'uit', text: 'in de kamer' })),
        el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }),
      ),
    );
  }
  const screens = list.filter((d) => d.soort === 'screen');
  if (screens.length === 1) rows.push(deviceLink(room, screens[0]));
  else if (screens.length > 1) {
    const stands = [...new Set(screens.map((d) => d.stand))];
    const any = screens.find((d) => d.aan) ?? screens[0];
    rows.push(deviceLink(room, any, 'Screens', stands.length === 1 ? stands[0] : stands.join(', ')));
  }
  for (const d of list.filter((x) => x.soort === 'klimaat')) rows.push(deviceLink(room, d));
  // Meters zijn informatie: temperatuur en luchtvochtigheid.
  for (const d of list.filter((x) => x.soort === 'meter')) rows.push(deviceLink(room, d));
  return rows;
}

/** Per zone een kopje, als de kamer zones heeft; anders alles onder elkaar. */
function byZone(room, render) {
  if (!room.zones.length) return render(room.apparaten);
  const out = [];
  for (const z of room.zones) {
    const list = room.apparaten.filter((d) => d.zone === z.id);
    if (!list.length) continue;
    out.push(el('div', { class: 'zonelabel', text: z.naam }), ...render(list));
  }
  const loose = room.apparaten.filter((d) => !d.zone || !room.zones.some((z) => z.id === d.zone));
  if (loose.length) out.push(el('div', { class: 'zonelabel', text: out.length ? 'Verder in de kamer' : room.naam }), ...render(loose));
  return out;
}

function roomCard(r) {
  const lampsOn = r.samenvatting?.lampenAan ?? r.lampenAan;
  const sub = r.status
    ? el('span', { class: `status k-${r.status.soort}`, text: r.status.zin })
    : el('span', { class: 'status muted', text: r.apparaten.length ? (lampsOn ? lampen(lampsOn) : 'geen licht aan') : 'hier staat niets' });
  return el(
    'div',
    { class: 'card kamerkaart' },
    el(
      'a',
      { class: 'room kop', href: `#huis/ruimte/${encodeURIComponent(r.id)}` },
      el('div', { style: 'display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1' }, el('span', { class: 'name', text: r.naam }), sub),
      el(
        'span',
        { style: 'display: flex; flex-direction: column; align-items: flex-end; margin-left: auto' },
        el('span', { class: 'temp', text: r.temperatuurC == null ? '' : deg(r.temperatuurC) }),
        r.vochtPct == null ? null : el('span', { class: 'small muted', text: `${Math.round(r.vochtPct)}% vocht` }),
      ),
      el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }),
    ),
    ...byZone(r, (list) => deviceRows(r, byKind(list))),
  );
}

let houseRouteShown = '';
// Het apparaat waarvan het blad open is; blijft gekozen als het huis opnieuw tekent.
let selectedDevice = null;

function renderHouse() {
  // Een ander niveau sluit het blad; dezelfde plek opnieuw tekenen niet.
  if (location.hash !== houseRouteShown) {
    $('hu-blad').hidden = true;
    houseRouteShown = location.hash;
    selectedDevice = houseRoute().sel;
  }
  if (!house) {
    back('#thuis', 'Thuis');
    crumb([['Huis']]);
    heading('Het huis', { zin: houseTried ? 'De etages en ruimtes komen van Home Assistant zodra die verbonden is.' : 'Even laden…' });
    $('hu-lijst').replaceChildren();
    return;
  }
  const { level, key } = houseRoute();
  const floors = house.etages;
  let floor = level === 'etage' ? floors.find((f) => floorKey(f) === key) : null;
  // Een etage zonder kamers bestaat wel: daar voeg je de eerste kamer toe.
  if (level === 'etage' && !floor && layoutInfo?.etages.some((e) => e.id === key)) {
    const d = draft();
    floor = { id: key, naam: d ? floorName(d, key) : key, lampenAan: 0, samenvatting: null, ruimtes: [] };
  }
  // Vanaf de doorsnede op Thuis: de etage waar dat regelgebied ligt, met terug naar Thuis.
  const fromHome = level === 'etagevan';
  if (fromHome) floor = floors.find((f) => f.ruimtes.some((r) => r.zoneId === key)) ?? null;
  let room = null;
  if (level === 'ruimte' || level === 'zone') {
    for (const f of floors) {
      const r = f.ruimtes.find((x) => (level === 'zone' ? x.zoneId === key : x.id === key));
      if (r) {
        floor = f;
        room = r;
      }
    }
  }
  // Is er maar één etage, dan sla je het huisniveau over.
  if (!floor && !room && floors.length === 1 && !editing) floor = floors[0];

  if (room) {
    renderRoom(floor, room);
    return;
  }
  if (floor) {
    renderFloor(floor, floors.length > 1, fromHome);
    return;
  }

  back('#thuis', 'Thuis');
  crumb([['Huis']]);
  heading('Het huis', { zin: houseTip(), samenvatting: house.samenvatting });
  if (editing) {
    $('hu-lijst').replaceChildren(...editBar(), ...editHouseLevel());
    return;
  }
  $('hu-lijst').replaceChildren(
    ...editBar(),
    doorsnede(floors),
    ...allOff({ doel: 'huis' }, house.lampenAan, lampTotal(floors.flatMap((f) => f.ruimtes))),
    ...homelessNote(),
  );
}

/*
 * De tip uit ONTWERP §4: één keer, op het echte huis, tot je het doet. Onthouden
 * in deze browser; lukt dat niet, dan staat hij er gewoon elke keer.
 */
const TIP_KEY = 'nieuw.huis.ingezoomd';
function houseTip() {
  try {
    if (localStorage.getItem(TIP_KEY)) return '';
  } catch {
    // Geen opslag: dan de tip.
  }
  return 'Tik op een etage om in te zoomen, en op een apparaat om het te bedienen.';
}
function tipDone() {
  try {
    localStorage.setItem(TIP_KEY, '1');
  } catch {
    // Geen opslag; de tip komt terug, en dat is niet erg.
  }
}

/**
 * De doorsnede (ONTWERP §4, `Wand-Inzoomen` stap 1): de etages boven elkaar,
 * de bovenste onder het dak, buiten eronder. Elke etage is een link, met wat er
 * brandt; een schermlezer krijgt dezelfde volgorde als lijst.
 */
function doorsnede(floors) {
  const byId = new Map(floors.map((f) => [f.id, f]));
  const line = (f) =>
    f.ruimtes.length
      ? f.ruimtes.map((r) => (r.temperatuurC == null ? r.naam : `${r.naam} ${deg(r.temperatuurC)}`)).join(' · ')
      : 'nog geen kamers';
  const link = (f) =>
    el(
      'a',
      { class: 'room verdieping-link', href: `#huis/etage/${encodeURIComponent(floorKey(f))}` },
      el('span', { class: 'naam', text: f.naam }),
      el(
        'span',
        { class: 'lampen' },
        f.lampenAan ? icon({ soort: 'licht', aan: true }, true) : null,
        f.lampenAan ? lampen(f.lampenAan) : 'geen licht aan',
      ),
      el('span', { class: 'mini', text: line(f) }),
    );
  // Alles uit op deze etage: de app doet het zelf, met de lampen uit de indeling.
  const off = (f) => {
    if (!house?.lichtBedienen || !f.lampenAan) return null;
    const b = button('Alles uit', async () => {
      b.disabled = true;
      b.textContent = 'Gaat uit…';
      const fout = await switchLights({ doel: 'etage', id: f.id, aan: false });
      if (fout) {
        b.disabled = false;
        b.textContent = 'Alles uit';
        b.title = fout;
      }
    });
    b.setAttribute('aria-label', `Alle lampen uit op ${f.naam}`);
    return b;
  };
  const roofSvg = (lit) => {
    const svg = s('svg', { viewBox: '0 0 100 50', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.append(
      s('polygon', {
        points: '1,49.5 50,1 99,49.5',
        fill: lit ? 'rgba(255,224,138,0.10)' : 'rgba(255,255,255,0.03)',
        stroke: 'rgba(255,255,255,0.3)',
        'stroke-width': 1.5,
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    return svg;
  };
  const floorBox = (f, cls) => el('div', { class: `verdieping ${cls}${f.lampenAan ? ' licht' : ''}` }, link(f), off(f));
  const box = el('div', { class: 'huisje' });
  const top = byId.get('e2');
  if (top) {
    const roof = floorBox(top, 'dak');
    roof.prepend(roofSvg(top.lampenAan > 0));
    box.append(roof);
  } else {
    box.append(el('div', { class: 'dak', 'aria-hidden': 'true' }, roofSvg(false)));
  }
  let first = true;
  for (const id of ['e1', 'bg']) {
    const f = byId.get(id);
    if (!f) continue;
    box.append(floorBox(f, first ? 'eerste' : ''));
    first = false;
  }
  const out = byId.get('buiten');
  if (out) box.append(floorBox(out, 'buiten'));
  return el('nav', { class: 'doorsnede', 'aria-label': 'De etages van het huis' }, box);
}

/** Wat nog in geen kamer staat: zeg het kort, met een knop om het meteen in te delen. */
function homelessNote() {
  const list = house?.zonderRuimte ?? [];
  if (!list.length) return [];
  const names = list.slice(0, 6).map((d) => d.naam).join(', ') + (list.length > 6 ? ', …' : '');
  const n = list.length;
  return [
    el(
      'div',
      { class: 'note', style: 'display: flex; flex-wrap: wrap; align-items: center; gap: 10px' },
      el('span', { style: 'flex: 1 1 220px', text: `${n} ${n === 1 ? 'apparaat staat' : 'apparaten staan'} nog in geen kamer: ${names}.` }),
      button('Nu indelen', () => {
        editing = true;
        editStatus('');
        renderHouse();
      }),
    ),
  ];
}

/*
 * De basisplattegrond van een etage (`Wand-Etage`), uit de indeling alleen: elke
 * kamer een vlak, groter naarmate hij meer zones en apparaten heeft; een kamer
 * zonder apparaten, zoals een hal, een smalle strook. Zones liggen gestippeld
 * gescheiden in hun kamer, de apparaten staan erin. Waar een kamer werkelijk
 * ligt en waar in de kamer een lamp hangt, weet de app nog niet; dat volgt.
 */
function planWeight(r) {
  if (!r.apparaten.length) return 0.7;
  return 1 + Math.max(0, r.zones.length - 1) * 0.8 + Math.min(r.apparaten.length, 8) * 0.08;
}

function planDevice(room, d) {
  return el(
    'a',
    {
      class: `plan-apparaat${d.aan ? ` aan-${d.soort}` : ''}`,
      href: `#huis/ruimte/${encodeURIComponent(room.id)}/${encodeURIComponent(d.id)}`,
      'aria-label': `${d.naam}: ${standText(d)}`,
    },
    icon(d),
    el('span', { text: d.naam }),
    el('span', { text: standText(d) }),
  );
}

function plattegrond(floor) {
  const rooms = floor.ruimtes.map((r) => {
    const w = planWeight(r);
    const sections = [];
    if (r.zones.length) {
      for (const z of r.zones) sections.push({ naam: z.naam, list: r.apparaten.filter((d) => d.zone === z.id) });
      const loose = r.apparaten.filter((d) => !r.zones.some((z) => z.id === d.zone));
      if (loose.length) sections.push({ naam: 'Verder', list: loose });
    } else {
      sections.push({ naam: null, list: r.apparaten });
    }
    const soort = r.status?.soort;
    return el(
      'div',
      {
        class: `plan-kamer${soort ? ` s-${soort}` : ''}${r.apparaten.length ? '' : ' leeg'}`,
        style: `flex: ${w} 1 ${Math.round(150 * w)}px`,
      },
      el(
        'a',
        { class: 'plan-kop', href: `#huis/ruimte/${encodeURIComponent(r.id)}` },
        el('b', { text: r.naam }),
        el('span', { class: `t${soort ? ` k-${soort}` : ''}`, text: r.temperatuurC == null ? '' : deg(r.temperatuurC) }),
      ),
      ...sections.map((sec) =>
        el(
          'div',
          { class: 'plan-zone' },
          sec.naam ? el('div', { class: 'zonelabel', text: sec.naam }) : null,
          el('div', { class: 'plan-apparaten' }, ...byKind(sec.list).map((d) => planDevice(r, d))),
        ),
      ),
    );
  });
  return el('nav', { class: 'plattegrond', 'aria-label': `Plattegrond van ${floor.naam}` }, ...rooms);
}

/** De etage (`Etage`, `Wand-Etage`): per kamer een kaart met wat erin staat. */
function renderFloor(floor, many, fromHome = false) {
  tipDone();
  if (many && !fromHome) back('#huis', 'Huis');
  else back('#thuis', 'Thuis');
  crumb(many ? [['Huis', '#huis'], [floor.naam]] : [[floor.naam]]);
  heading(floor.naam, { samenvatting: floor.samenvatting });
  if (editing) {
    $('hu-lijst').replaceChildren(...editBar(), ...editFloorLevel(floor.id));
    return;
  }
  if (!floor.ruimtes.length) {
    $('hu-lijst').replaceChildren(
      ...editBar(),
      el('div', { class: 'note' }, 'Op deze etage staan nog geen kamers. Kies "Indeling bewerken" en voeg er een toe; daarna zet je er lampen en andere apparaten in.'),
    );
    return;
  }
  // Buiten is geen gebouw: daar alleen de kaarten.
  const plan = floor.id !== 'buiten' && floor.ruimtes.length > 0;
  $('hu-lijst').replaceChildren(
    ...editBar(),
    ...allOff({ doel: 'etage', id: floor.id }, floor.lampenAan, lampTotal(floor.ruimtes)),
    el(
      'div',
      { class: `etage-raster${plan ? ' met-plan' : ''}` },
      plan ? plattegrond(floor) : null,
      el('div', { class: 'kamers' }, ...floor.ruimtes.map(roomCard)),
    ),
  );
}

/** De kamer (`Ruimte`, `Wand-Ruimte`): elk apparaat een tegel, het blad ernaast of eronder. */
function renderRoom(floor, room) {
  tipDone();
  const many = house.etages.length > 1;
  const up = `#huis/etage/${encodeURIComponent(floorKey(floor))}`;
  back(up, floor.naam);
  crumb([...(many ? [['Huis', '#huis']] : []), [floor.naam, up], [room.naam]]);
  heading(room.naam, { temp: room.temperatuurC, zin: room.status?.zin ?? '', soort: room.status?.soort ?? null });
  // Luchtvochtigheid als informatie, en waar de temperatuur vandaan komt als dat geen regeling is.
  if (!editing) {
    $('hu-chips').replaceChildren(
      ...[
        room.vochtPct == null ? null : el('span', { class: 'chip klimaat', text: `Luchtvochtigheid ${Math.round(room.vochtPct)}%` }),
        room.gemetenDoor ? el('span', { class: 'chip plain', text: `gemeten door ${room.gemetenDoor}` }) : null,
      ].filter(Boolean),
    );
  }
  const parts = [...editBar(), ...(editing ? editRoomLevel(room.id) : allOff({ doel: 'kamer', id: room.id }, room.lampenAan, lampTotal([room])))];
  const tiles = (list) => [
    el(
      'div',
      { class: 'tegels' },
      ...byKind(list).map((d) => {
        const b = el(
          'button',
          { type: 'button', class: 'tegel', 'aria-pressed': String(d.id === selectedDevice) },
          icon(d),
          el('b', { text: d.naam }),
          el('span', { class: d.aan ? `aan-${d.soort}` : 'uit', text: d.stand }),
          d.soort === 'klimaat' && d.meting ? el('span', { class: 'small muted', text: readingText(d.meting) }) : null,
        );
        b.addEventListener('click', () => {
          for (const t of document.querySelectorAll('#hu-lijst .tegel')) t.setAttribute('aria-pressed', String(t === b));
          selectedDevice = d.id;
          if (editing) editDevice(room, d);
          else openDevice(room, d);
        });
        return b;
      }),
    ),
  ];
  parts.push(...byZone(room, tiles));
  if (!room.apparaten.length) parts.push(el('p', { class: 'small muted', text: 'Hier staat niets dat Smart Climate kent.' }));
  $('hu-lijst').replaceChildren(...parts);
  // Het gekozen apparaat houdt zijn blad, met de stand van nu.
  const chosen = room.apparaten.find((d) => d.id === selectedDevice);
  if (chosen && !editing) openDevice(room, chosen);
}

/** "Meet 19,5° en 61% luchtvochtigheid." */
function meterLine(d) {
  const m = d.meting ?? {};
  const parts = [m.temperatuurC == null ? null : deg(m.temperatuurC), m.vochtPct == null ? null : `${Math.round(m.vochtPct)}% luchtvochtigheid`];
  return parts.some(Boolean) ? `Meet ${parts.filter(Boolean).join(' en ')}.` : 'Geeft nu geen meting.';
}

/** "Meet 22,4° en 55% · doel 22° · koelt nu." */
function climateLine(d) {
  const bits = [];
  const meet = readingText(d.meting);
  if (meet) bits.push(`Meet ${meet}`);
  if (d.klimaat?.doelC != null) bits.push(`doel ${deg(d.klimaat.doelC)}`);
  if (d.klimaat?.actie) bits.push(`${d.klimaat.actie} nu`);
  const can = d.klimaat ? [d.klimaat.kanVerwarmen ? 'verwarmen' : null, d.klimaat.kanKoelen ? 'koelen' : null].filter(Boolean) : [];
  const kan = can.length ? ` Kan ${can.join(' en ')}.` : '';
  return bits.length ? `${bits.join(' · ')}.${kan}` : kan.trim();
}

/** Voor welk apparaat het blad nu open staat, en of om te bedienen of in te delen. */
let bladFor = null;

/** Het blad leeg maken, voor bedienen of voor indelen. */
function resetBlad(d) {
  $('hu-blad').hidden = false;
  $('hu-blad-naam').textContent = d.naam;
  $('hu-blad-stand').textContent = d.stand;
  $('hu-blad-stand').className = d.aan ? `aan-${d.soort}` : '';
  $('hu-blad-zin').textContent = '';
  $('hu-blad-schakel').replaceChildren();
  $('hu-blad-extra').replaceChildren();
  $('hu-blad-knoppen').className = 'knoppen';
}

/*
 * Bedienen (ONTWERP §4). Licht schakelt echt, als de dienst dat mag (besluit
 * 97): aan en uit, dimmen, warm of koel; Smart Climate regelt het niet, het is
 * een knop. Klimaat vraagt het de assistent, en screens zeggen wat er zou
 * gebeuren: dat schrijft pas in stap B.
 */
function openDevice(room, d) {
  const wasHidden = $('hu-blad').hidden;
  // Ververst het huis terwijl dit blad open staat, dan blijft het antwoord op de
  // laatste knop staan: anders wist het verversen na een lamp het meteen weer.
  const kept = !wasHidden && bladFor === `bedien:${d.id}` ? $('hu-blad-zin').textContent : '';
  resetBlad(d);
  bladFor = `bedien:${d.id}`;
  const say = (text) => {
    $('hu-blad-zin').textContent = text;
  };
  if (kept) say(kept);
  // De vaste uitleg alleen als er geen antwoord op een knop staat.
  const hint = (text) => {
    if (!kept) say(text);
  };
  const buttons = [];
  if (d.soort === 'licht') {
    const live = Boolean(house?.lichtBedienen);
    $('hu-blad-schakel').replaceChildren(lampSwitch(d, say));
    if (d.dimbaar) {
      const dim = el('input', {
        type: 'range',
        class: 'dimmer',
        min: '1',
        max: '100',
        step: '1',
        value: String(d.helderheidPct ?? 100),
        'aria-label': `Helderheid van ${d.naam}`,
      });
      dim.disabled = !live;
      const pct = el('span', { class: 'muted', text: `${dim.value}%` });
      dim.addEventListener('input', () => {
        pct.textContent = `${dim.value}%`;
      });
      dim.addEventListener('change', async () => {
        say('Even…');
        const fout = await switchLights({ doel: 'lamp', id: d.id, aan: true, helderheidPct: Number(dim.value) });
        say(fout ?? `${d.naam} op ${dim.value}%.`);
      });
      $('hu-blad-extra').append(el('div', { class: 'tussen' }, el('b', { text: 'Helderheid' }), pct), dim);
    }
    if (d.licht?.wit || d.licht?.kleur) {
      $('hu-blad-extra').append(lampColour(d, say, live));
    } else if (d.kleurtemp) {
      $('hu-blad-knoppen').className = 'knoppen drie';
      for (const [label, kleur] of [
        ['Warm', 'warm'],
        ['Neutraal', 'neutraal'],
        ['Koel', 'koel'],
      ]) {
        buttons.push([
          label,
          async () => {
            say('Even…');
            const fout = await switchLights({ doel: 'lamp', id: d.id, aan: true, kleur });
            say(fout ?? `${d.naam} ${label.toLowerCase()} wit.`);
          },
          !live,
        ]);
      }
    }
    if (room.scenes?.length) $('hu-blad-extra').append(roomScenes(room, say, live));
    hint(live ? 'Licht gaat rechtstreeks via Home Assistant; Smart Climate regelt het niet.' : 'Licht bedienen staat uit voor deze weergave; het kan via Home Assistant.');
  } else if (d.soort === 'meter') {
    $('hu-blad-extra').append(el('p', { class: 'small', text: meterLine(d) }));
    hint(
      d.meetKamer
        ? 'Deze meter levert de temperatuur waar Smart Climate deze kamer op regelt.'
        : 'Alleen informatie; aan een meter valt niets te bedienen.',
    );
  } else if (d.soort === 'klimaat') {
    $('hu-blad-extra').append(el('p', { class: 'small', text: climateLine(d) }));
    // Alleen wat het apparaat kan: de Nest verwarmt, maar koelt niet.
    const can = d.klimaat ?? { kanKoelen: true, kanVerwarmen: true };
    const wishes = [
      can.kanKoelen ? ['Koelen', 'koelen'] : null,
      can.kanVerwarmen ? ['Verwarmen', 'verwarmen'] : null,
      ['Uit', 'uit'],
    ].filter(Boolean);
    $('hu-blad-knoppen').className = wishes.length === 3 ? 'knoppen drie' : 'knoppen';
    if (!room.zoneId) hint('Deze kamer heeft geen regeling; Smart Climate stuurt dit apparaat hier niet.');
    for (const [label, wens] of room.zoneId ? wishes : []) {
      buttons.push([
        label,
        async () => {
          say('Even kijken…');
          try {
            const res = await fetch(`api/vraag?v=doe&kamer=${encodeURIComponent(room.zoneId)}&wens=${wens}`);
            const body = await res.json();
            say(res.ok ? body.antwoord : (body.fout ?? 'Geen antwoord.'));
          } catch {
            say('Geen verbinding met Smart Climate.');
          }
        },
      ]);
    }
  } else if (d.soort === 'screen') {
    for (const [label, what] of [
      ['Open', 'openen'],
      ['Stop', 'stoppen'],
      ['Dicht', 'sluiten'],
    ]) {
      buttons.push([label, () => say(`Dan zou ik de ${d.naam.toLowerCase()} ${what}. Maar ik kijk nog alleen mee en mag nog niet schakelen.`)]);
    }
    $('hu-blad-knoppen').className = 'knoppen drie';
  }
  $('hu-blad-knoppen').replaceChildren(
    ...buttons.map(([label, fn, off]) => {
      const b = el('button', { type: 'button', text: label });
      if (off) b.disabled = true;
      b.addEventListener('click', () => void fn());
      return b;
    }),
  );
  // Alleen bij openen naar het blad schuiven, niet bij elke verversing.
  if (wasHidden) $('hu-blad').scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------- indeling */

/*
 * Indelen in de proefomgeving (besluiten 95 en 96): etages en kamers hernoemen,
 * kamers en zones aanmaken, apparaten hernoemen en verplaatsen. Elke wijziging
 * gaat meteen naar de dienst, die hem toetst en bewaart; het huis tekent daarna
 * opnieuw uit wat de dienst teruggeeft. Deze pagina rekent het huis niet zelf.
 */
let layoutInfo = null;
let editing = false;
// De laatste melding van het bewaren; het huis tekent daarna opnieuw, en de
// melding hoort dat te overleven.
let editMessage = '';

async function loadLayoutInfo() {
  let fresh = null;
  try {
    const res = await fetch('api/indeling');
    fresh = res.ok ? await res.json() : null;
  } catch {
    // Zoals bij het huis: de laatste stand blijft.
  }
  if (fresh || !layoutInfo) layoutInfo = fresh;
}

/** De indeling om te bewerken: de eigen, of anders het voorstel uit Home Assistant. */
function draft() {
  const base = layoutInfo?.indeling ?? layoutInfo?.voorstel;
  return base ? JSON.parse(JSON.stringify(base)) : null;
}

async function saveLayout(next, what) {
  try {
    const res = await postDoor('api/indeling', next);
    const body = await res.json();
    if (!res.ok) {
      editStatus(body.fout ?? 'niet bewaard');
      return false;
    }
    layoutInfo = { ...layoutInfo, indeling: body };
    editStatus(`${what} bewaard`);
    await loadHouse(true);
    return true;
  } catch {
    editStatus('niet bewaard; geen verbinding');
    return false;
  }
}

function editStatus(text) {
  editMessage = text;
  const el2 = $('hu-bewerk-status');
  if (el2) el2.textContent = text;
}

/** Een id uit een naam, zoals de dienst ze accepteert. */
function slugId(text, taken) {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'kamer';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

function input(value, placeholder, label, onSave) {
  const i = el('input', { class: 'veld', type: 'text', value: value ?? '', placeholder: placeholder ?? '', 'aria-label': label, maxlength: '60' });
  i.addEventListener('change', () => void onSave(i.value.trim()));
  return i;
}

function select(options, value, label, onSave) {
  const s2 = el('select', { class: 'veld', 'aria-label': label });
  for (const [v, t] of options) {
    const o = el('option', { value: v, text: t });
    if (v === value) o.selected = true;
    s2.append(o);
  }
  s2.addEventListener('change', () => void onSave(s2.value));
  return s2;
}

function button(text, onClick, cls = '') {
  const b = el('button', { type: 'button', class: `knop ${cls}`.trim(), text });
  b.addEventListener('click', () => void onClick());
  return b;
}

/** De knop boven het huis, en de uitleg als het nog een voorstel is. */
function editBar() {
  if (!layoutInfo) return [];
  const out = [];
  if (house?.indeling === 'voorstel') {
    out.push(
      el('div', { class: 'note' }, 'Dit is wat Home Assistant van je huis weet. Pas het aan; je eerste wijziging legt de indeling vast, en daarna verandert er niets meer vanzelf.'),
    );
  }
  out.push(
    el(
      'div',
      { class: 'knoppen' },
      button(editing ? 'Klaar met indelen' : 'Indeling bewerken', () => {
        editing = !editing;
        editStatus('');
        renderHouse();
      }),
      el('span', { class: 'small muted', id: 'hu-bewerk-status', 'aria-live': 'polite', text: editMessage }),
    ),
  );
  return out;
}

function floorName(d, id) {
  return d.etages[id] ?? layoutInfo.etages.find((e) => e.id === id)?.standaardNaam ?? id;
}

/** Huisniveau in de bewerkstand: de etages hernoemen, en indelen wat nergens hoort. */
function editHouseLevel() {
  const d = draft();
  if (!d) return [];
  const parts = [el('div', { class: 'groep', text: 'ETAGES' })];
  for (const { id, standaardNaam } of layoutInfo.etages) {
    parts.push(
      el(
        'div',
        { class: 'rij' },
        input(d.etages[id] ?? '', standaardNaam, `Naam van ${standaardNaam}`, async (v) => {
          const next = draft();
          if (v === '' || v === standaardNaam) delete next.etages[id];
          else next.etages[id] = v;
          await saveLayout(next, 'Etage');
        }),
        el('a', { class: 'small', href: `#huis/etage/${id}`, text: 'kamers ›' }),
      ),
    );
  }
  const homeless = house?.zonderRuimte ?? [];
  if (homeless.length) {
    parts.push(el('div', { class: 'groep', text: `NOG IN TE DELEN (${homeless.length})` }));
    // De groepen in Home Assistant zeggen vaak waar een lamp hoort; de dienst stelt de kamer voor.
    const proposed = homeless.filter((dev) => dev.voorstelKamer);
    if (proposed.length) {
      parts.push(
        el(
          'div',
          { class: 'rij' },
          button(`Alle voorstellen overnemen (${proposed.length})`, async () => {
            const next = draft();
            for (const dev of proposed) next.apparaten[dev.id] = { ...(next.apparaten[dev.id] ?? {}), kamer: dev.voorstelKamer, zone: null };
            await saveLayout(next, `${proposed.length} apparaten`);
          }),
        ),
      );
    }
    const roomName = (id) => d.kamers.find((k) => k.id === id)?.naam;
    for (const dev of homeless) {
      const rooms = [['', dev.voorstelKamer ? `Voorstel: ${roomName(dev.voorstelKamer)}…` : 'Kies een kamer of zone…'], ...placeOptions(d)];
      const where = [
        dev.groepen?.length ? `in ${dev.groepen.join(', ')}` : null,
        dev.voorstel ? `in Home Assistant: ${dev.voorstel}` : null,
      ].filter(Boolean);
      parts.push(
        el(
          'div',
          { class: 'rij' },
          el(
            'span',
            { style: 'flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column' },
            el('b', { text: dev.naam }),
            el('span', { class: 'small muted', text: where.length ? where.join(' · ') : 'geen groep of gebied in Home Assistant' }),
          ),
          select(rooms, '', `Kamer voor ${dev.naam}`, (v) => placeDevice(dev, v)),
          button('Verbergen', () => hideDevice(dev)),
        ),
      );
    }
  }
  // Wat de bewoner verborg: terug op een plek naar keuze, of zoals Home Assistant het indeelt.
  const hidden = house?.verborgen ?? [];
  if (hidden.length) {
    parts.push(el('div', { class: 'groep', text: `VERBORGEN (${hidden.length})` }));
    parts.push(el('p', { class: 'tiny', text: 'Verborgen staat in geen kamer, telt nergens mee en gaat niet mee met "Alle lampen uit".' }));
    for (const dev of hidden) {
      parts.push(
        el(
          'div',
          { class: 'rij' },
          el('b', { style: 'flex: 1 1 200px; min-width: 0', text: dev.naam }),
          select([['', 'Terugzetten in…'], ...placeOptions(d)], '', `Plek voor ${dev.naam}`, (v) => placeDevice(dev, v)),
          button('Weer tonen', async () => {
            const next = draft();
            next.verborgen = (next.verborgen ?? []).filter((id) => id !== dev.id);
            await saveLayout(next, `${dev.naam} terug;`);
          }),
        ),
      );
    }
  }
  return parts;
}

/** Een apparaat uit de app halen: het staat dan in geen kamer en telt nergens mee. */
async function hideDevice(dev) {
  const next = draft();
  next.verborgen = [...new Set([...(next.verborgen ?? []), dev.id])];
  delete next.apparaten[dev.id];
  await saveLayout(next, `${dev.naam} verborgen;`);
}

/** Elke kamer, en elke zone erin, als één keuze: "Woonkamer › Keuken (Begane grond)". */
function placeOptions(d) {
  return d.kamers.flatMap((k) => {
    const floor = floorName(d, k.etage);
    return [[k.id, `${k.naam} (${floor})`], ...k.zones.map((z) => [`${k.id}|${z.id}`, `${k.naam} › ${z.naam} (${floor})`])];
  });
}

/** Een apparaat op een plek uit `placeOptions` zetten; was het verborgen, dan is het dat niet meer. */
async function placeDevice(dev, value) {
  if (!value) return;
  const [kamer, zone = null] = value.split('|');
  const next = draft();
  next.apparaten[dev.id] = { ...(next.apparaten[dev.id] ?? {}), kamer, zone };
  next.verborgen = (next.verborgen ?? []).filter((id) => id !== dev.id);
  await saveLayout(next, dev.naam);
}

/** Etageniveau in de bewerkstand: kamers hernoemen, verhuizen, weghalen en toevoegen. */
function editFloorLevel(floorId) {
  const d = draft();
  if (!d) return [];
  const parts = [];
  const etages = layoutInfo.etages.map((e) => [e.id, floorName(d, e.id)]);
  for (const k of d.kamers.filter((x) => x.etage === floorId)) {
    parts.push(
      el(
        'div',
        { class: 'rij' },
        input(k.naam, 'Naam', `Naam van ${k.naam}`, async (v) => {
          if (!v) return;
          const next = draft();
          next.kamers.find((x) => x.id === k.id).naam = v;
          await saveLayout(next, 'Kamer');
        }),
        select(etages, k.etage, `Etage van ${k.naam}`, async (v) => {
          const next = draft();
          next.kamers.find((x) => x.id === k.id).etage = v;
          await saveLayout(next, 'Kamer');
        }),
        button('Weg', async () => {
          const next = draft();
          next.kamers = next.kamers.filter((x) => x.id !== k.id);
          // Wat in deze kamer stond, gaat naar "nog in te delen".
          for (const [id, a] of Object.entries(next.apparaten)) if (a.kamer === k.id) delete next.apparaten[id];
          await saveLayout(next, 'Kamer weggehaald;');
        }),
      ),
    );
  }
  const name = el('input', { class: 'veld', type: 'text', placeholder: 'Nieuwe kamer, bijvoorbeeld Hal en trap', 'aria-label': 'Naam van een nieuwe kamer', maxlength: '40' });
  parts.push(
    el(
      'div',
      { class: 'rij' },
      name,
      button('Kamer toevoegen', async () => {
        const v = name.value.trim();
        if (!v) return;
        const next = draft();
        next.kamers.push({ id: slugId(v, new Set(next.kamers.map((x) => x.id))), naam: v, etage: floorId, zones: [], regelzone: null, haGebied: null });
        await saveLayout(next, 'Kamer');
      }),
    ),
  );
  parts.push(el('p', { class: 'tiny', text: 'Een deur ertussen maakt een eigen kamer; open, zoals keuken en zithoek, maakt een zone in dezelfde kamer.' }));
  return parts;
}

/** Kamerniveau in de bewerkstand: naam, regeling en zones. */
function editRoomLevel(roomId) {
  const d = draft();
  const k = d?.kamers.find((x) => x.id === roomId);
  if (!k) return [];
  const regel = [['', 'Niet geregeld'], ...layoutInfo.regelzones.map((z) => [z.id, `Geregeld als ${z.naam}`])];
  const parts = [
    el(
      'div',
      { class: 'rij' },
      input(k.naam, 'Naam', 'Naam van de kamer', async (v) => {
        if (!v) return;
        const next = draft();
        next.kamers.find((x) => x.id === roomId).naam = v;
        await saveLayout(next, 'Kamer');
      }),
      select(regel, k.regelzone ?? '', 'Regeling van de kamer', async (v) => {
        const next = draft();
        for (const x of next.kamers) if (v && x.regelzone === v) x.regelzone = null;
        next.kamers.find((x) => x.id === roomId).regelzone = v || null;
        await saveLayout(next, 'Regeling');
      }),
    ),
    el('div', { class: 'groep', text: 'ZONES IN DEZE KAMER' }),
  ];
  for (const z of k.zones) {
    parts.push(
      el(
        'div',
        { class: 'rij' },
        input(z.naam, 'Naam', `Naam van zone ${z.naam}`, async (v) => {
          if (!v) return;
          const next = draft();
          next.kamers.find((x) => x.id === roomId).zones.find((y) => y.id === z.id).naam = v;
          await saveLayout(next, 'Zone');
        }),
        button('Weg', async () => {
          const next = draft();
          const room = next.kamers.find((x) => x.id === roomId);
          room.zones = room.zones.filter((y) => y.id !== z.id);
          for (const a of Object.values(next.apparaten)) if (a.kamer === roomId && a.zone === z.id) a.zone = null;
          await saveLayout(next, 'Zone weggehaald;');
        }),
      ),
    );
  }
  const name = el('input', { class: 'veld', type: 'text', placeholder: 'Nieuwe zone, bijvoorbeeld Keuken', 'aria-label': 'Naam van een nieuwe zone', maxlength: '40' });
  parts.push(
    el(
      'div',
      { class: 'rij' },
      name,
      button('Zone toevoegen', async () => {
        const v = name.value.trim();
        if (!v) return;
        const next = draft();
        const room = next.kamers.find((x) => x.id === roomId);
        room.zones.push({ id: slugId(v, new Set(room.zones.map((y) => y.id))), naam: v });
        await saveLayout(next, 'Zone');
      }),
    ),
  );
  if (!k.zones.length) parts.push(el('p', { class: 'tiny', text: 'Geen zones: de kamer is één geheel. Voeg ze alleen toe als de kamer open delen heeft.' }));

  // Wat nog nergens staat, of verborgen is, kan hier meteen in de kamer of een zone.
  const candidates = [
    ...(house?.zonderRuimte ?? []).map((x) => ({ ...x, label: `${x.naam} (nog in te delen)` })),
    ...(house?.verborgen ?? []).map((x) => ({ ...x, label: `${x.naam} (verborgen)` })),
  ];
  if (candidates.length) {
    parts.push(el('div', { class: 'groep', text: 'TOEVOEGEN AAN DEZE KAMER' }));
    const which = select([['', 'Kies een apparaat…'], ...candidates.map((x) => [x.id, x.label])], '', 'Apparaat om toe te voegen', () => {});
    const where = select(
      [[roomId, k.zones.length ? 'Geen zone' : k.naam], ...k.zones.map((z) => [`${roomId}|${z.id}`, z.naam])],
      roomId,
      'Zone voor het apparaat',
      () => {},
    );
    parts.push(
      el(
        'div',
        { class: 'rij' },
        which,
        k.zones.length ? where : null,
        button('Toevoegen', async () => {
          const dev = candidates.find((x) => x.id === which.value);
          if (dev) await placeDevice(dev, where.value);
        }),
      ),
    );
  }
  return parts;
}

/** Een apparaat hernoemen en verplaatsen, in het blad onder de tegels. */
function editDevice(room, dev) {
  const d = draft();
  if (!d) return;
  resetBlad(dev);
  bladFor = `indeel:${dev.id}`;
  $('hu-blad-stand').className = '';
  $('hu-blad-stand').textContent = dev.naam === dev.haNaam ? '' : `in Home Assistant: ${dev.haNaam}`;
  $('hu-blad-zin').textContent = 'De naam hier is de naam overal: in de app, op de wand en voor de assistent.';
  const current = d.apparaten[dev.id] ?? { kamer: room.id, zone: dev.zone ?? null };
  const name = el('input', { class: 'veld', type: 'text', value: dev.naam, placeholder: dev.haNaam, 'aria-label': `Naam van ${dev.naam}`, maxlength: '60' });
  const rooms = d.kamers.map((k) => [k.id, `${k.naam} (${floorName(d, k.etage)})`]);
  const roomSel = select(rooms, current.kamer, `Kamer van ${dev.naam}`, () => fillZones());
  const zoneSel = el('select', { class: 'veld', 'aria-label': `Zone van ${dev.naam}` });
  const fillZones = () => {
    const k = d.kamers.find((x) => x.id === roomSel.value);
    zoneSel.replaceChildren(el('option', { value: '', text: 'Geen zone' }), ...(k?.zones ?? []).map((z) => el('option', { value: z.id, text: z.naam })));
    zoneSel.value = k?.zones.some((z) => z.id === current.zone) ? current.zone : '';
  };
  fillZones();
  $('hu-blad-knoppen').replaceChildren(
    name,
    roomSel,
    zoneSel,
    button('Bewaren', async () => {
      const next = draft();
      const v = name.value.trim();
      next.apparaten[dev.id] = {
        ...(v && v !== dev.haNaam ? { naam: v } : {}),
        kamer: roomSel.value,
        zone: zoneSel.value || null,
      };
      await saveLayout(next, dev.naam);
    }),
    button('Verbergen…', () => confirmHide(room, dev)),
  );
}

/** Eerst zeggen wat verbergen doet; pas dan verbergen. */
function confirmHide(room, dev) {
  $('hu-blad-zin').textContent =
    `Verbergen haalt ${dev.naam} uit de app: hij staat dan in geen kamer, telt nergens mee en gaat niet mee met "Alle lampen uit". ` +
    'Terughalen kan hier via "Toevoegen aan deze kamer", of op het huis onder "Verborgen". Wil je hem alleen naar een andere kamer of zone, kies dan Annuleren en verplaats hem.';
  $('hu-blad-knoppen').replaceChildren(
    button('Ja, verbergen', async () => {
      $('hu-blad').hidden = true;
      selectedDevice = null;
      await hideDevice(dev);
    }),
    button('Annuleren', () => editDevice(room, dev)),
  );
}

/* ------------------------------------------------------- assistent */

/*
 * De assistent die uitlegt (ONTWERP §7, fase 1). Vaste vragen; de antwoorden
 * komen kant-en-klaar uit de dienst (`/api/vraag`), deze pagina rekent niets uit.
 */
function assistantQuestions() {
  const zones = site?.zones ?? [];
  return [
    ['Wat doe je nu?', 'v=nu'],
    ...zones.map((z) => [`Waarom de ${z.name.toLowerCase()}?`, `v=waarom&kamer=${encodeURIComponent(z.id)}`]),
    ['Wat ga je straks doen?', 'v=straks'],
    ['Hoeveel zon vandaag?', 'v=zon'],
  ];
}

async function askAssistant(label, query) {
  const log = $('a-gesprek');
  const reply = el('div', { class: 'bel hij', text: 'Even kijken…' });
  log.append(el('div', { class: 'bel ik', text: label }), reply);
  // Hooguit de laatste zes vragen met hun antwoord.
  while (log.children.length > 12) log.firstElementChild.remove();
  try {
    const res = await fetch(`api/vraag?${query}`);
    const body = await res.json();
    reply.textContent = res.ok ? body.antwoord : (body.fout ?? body.wachten ?? 'Geen antwoord.');
  } catch {
    reply.textContent = 'Geen verbinding met Smart Climate.';
  }
  reply.scrollIntoView({ block: 'nearest' });
}

function setupAssistant() {
  $('a-vragen').replaceChildren(
    ...assistantQuestions().map(([label, query]) => {
      const b = el('button', { type: 'button', text: label });
      b.addEventListener('click', () => void askAssistant(label, query));
      return b;
    }),
  );
}

async function start() {
  buildNav();
  void loadSession();
  showView();
  window.addEventListener('hashchange', showView);
  tick();
  setInterval(tick, 10_000);
  renderLog();
  try {
    site = await (await fetch('api/site')).json();
    if (site.migrating) {
      $('fase').hidden = false;
      $('fase').textContent = 'Meekijken';
    }
  } catch {
    // Zonder namen tonen we de id's.
  }
  try {
    const res = await fetch('api/state');
    if (res.ok) render(await res.json());
  } catch {
    // De stroom hieronder vult het zo aan.
  }
  void loadToday(true);
  void loadReview();
  void setupFeedback();
  setupAssistant();
  setInterval(() => void loadToday(), 5 * 60_000);
  // Lampen en screens veranderen vaker; ververs het huis zolang je ernaar kijkt.
  setInterval(() => {
    // Niet tijdens het indelen: verversen zou een veld wissen waarin je typt.
    if (!editing && !document.querySelector('[data-view="huis"]').hidden) void loadHouse(true);
  }, 30_000);
  const source = new EventSource('api/events');
  source.onopen = () => connection(true, 'Verbonden');
  source.onmessage = (event) => {
    connection(true, 'Verbonden');
    render(JSON.parse(event.data));
  };
  source.onerror = () => connection(false, 'Verbinding kwijt…');
}

void start();
