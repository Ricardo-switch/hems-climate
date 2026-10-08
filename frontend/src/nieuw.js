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
  const id = NAV.some(([n]) => n === want) || ['huis', 'apparaten', 'energie', 'aansluiting'].includes(want) ? want : 'thuis';
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== id;
  const menu = id === 'huis' || id === 'apparaten' ? 'thuis' : id === 'energie' ? 'opbrengst' : id === 'aansluiting' ? 'bediening' : id;
  for (const a of document.querySelectorAll('.navitem')) {
    if (a.dataset.target === menu) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (id === 'huis') {
    // Meteen tekenen wat er al is (of "even laden"), dan verversen.
    renderHouse();
    void loadHouse(true);
  }
  if (id === 'opbrengst') {
    void loadYield();
    void loadReview();
  }
  if (id === 'energie') void loadEnergy();
  if (id === 'aansluiting') void loadConnection();
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
  // De droger en zijn soortgenoten hebben een eigen scherm (besluit 101).
  if (b.uitstelbaar?.length) lines.push(el('a', { class: 'small naar-apparaten', href: '#apparaten', text: 'Apparaten op zon ›' }));
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
    if (!res.ok) return;
    review = await res.json();
    renderReview();
    renderNoticed();
  } catch {
    // Zonder meekijkcijfers blijft die kaart weg.
  }
}

function renderReview() {
  const r = review;
  const days = Math.max(1, Math.round((r.totMs - r.vanMs) / 86_400_000));
  $('o-scheelde').hidden = false;
  const legacyKwh = r.legacyGridWh / 1000;
  const avoid = r.avoidableGridWh / 1000;
  // Eén zin, zoals op de wand (Wand-Opbrengst); de balken eronder alleen op de telefoon.
  $('o-periode').textContent = `${nl(avoid)} kWh minder van het net voor de airco's, in ${days} dagen meekijken naast je huidige regeling.`;
  const ours = Math.max(0, legacyKwh - avoid);
  const pct = legacyKwh > 0 ? Math.round((avoid / legacyKwh) * 100) : 0;
  $('o-hero').replaceChildren(
    el('div', { class: 'big k-cool', text: legacyKwh > 0 ? `−${pct}%` : '—' }),
    el('div', { style: 'font-size: 16px; font-weight: 600', text: "netstroom voor de airco's" }),
    el('div', { class: 'small muted', text: `${nl(avoid)} van de ${nl(legacyKwh)} kWh had Smart Climate vermeden` }),
    barRow('Huidige regeling', legacyKwh, 100, 'rgba(169,186,194,0.45)'),
    barRow('Smart Climate', ours, legacyKwh > 0 ? (ours / legacyKwh) * 100 : 0, null),
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

/* ------------------------------------------------------- terugkijken */

/*
 * Opbrengst om terug te kijken (besluit 102, schetsen `Opbrengst-terug` en
 * `Wand-Opbrengst`). De dienst rekent alles uit (`api/opbrengst`); deze pagina
 * tekent het: de getallen, de zon, de sankey op schaal, per apparaat, per dag,
 * vergelijken en kosten. De meters en prijzen staan bij Instellingen.
 */
const yieldView = { soort: 'maand', datum: null, sankey: 'stroom', metric: 'stroom' };
let yieldData = null;

const ZON_C = '#F5B342';
const NET_C = '#A9BAC2';
const GAS_C = '#FF8A4C';
const TERUG_C = '#6FDCA6';
const DEVICE_C = ['#5CC8FF', '#8FD9FF', '#FFB088', '#F5C66E', '#C4BCFF', '#9EE6FF', '#FFD08A'];
/** 414 of 13,8: hele getallen vanaf honderd, anders één decimaal. */
const num = (n) => nl(n, Math.abs(n) >= 100 ? 0 : 1);
const euro = (n) => `€ ${nl(n, 2)}`;
const kwh = (n) => `${num(n)} kWh`;

async function loadYield() {
  const q = new URLSearchParams({ soort: yieldView.soort, ...(yieldView.datum ? { datum: yieldView.datum } : {}) });
  $('o-terug').setAttribute('aria-busy', 'true');
  try {
    const res = await fetch(`api/opbrengst?${q}`);
    const body = await res.json();
    if (res.status === 409) {
      yieldData = null;
      $('o-terug').replaceChildren(
        el(
          'div',
          { class: 'card' },
          el('b', { text: 'Eerst je meters' }),
          el('p', { class: 'small', style: 'color: var(--soft)', text: 'Om terug te kijken moet Smart Climate weten welke meters je huis heeft en wat stroom en gas kosten. Neem het over uit Home Assistant, of stel het zelf in.' }),
          el('a', { class: 'knop', href: '#energie', text: 'Meters en prijzen instellen' }),
        ),
      );
      return;
    }
    if (!res.ok) {
      $('o-terug').replaceChildren(el('p', { class: 'small muted', text: body.fout ?? body.wachten ?? 'De terugblik is nu niet beschikbaar.' }));
      return;
    }
    yieldData = body;
    renderYield();
  } catch {
    $('o-terug').replaceChildren(el('p', { class: 'small muted', text: 'Geen verbinding met Smart Climate.' }));
  } finally {
    $('o-terug').removeAttribute('aria-busy');
  }
}

function seg(options, current, onPick, label) {
  const g = el('div', { class: 'seg pick', role: 'group', 'aria-label': label, style: `grid-template-columns: repeat(${options.length}, minmax(max-content, 1fr))` });
  for (const [value, text] of options) {
    const b = el('button', { type: 'button', text, 'aria-pressed': String(value === current) });
    b.addEventListener('click', () => onPick(value));
    g.append(b);
  }
  return g;
}

function renderYield() {
  const r = yieldData;
  const parts = [];
  parts.push(
    seg(
      [
        ['dag', 'Dag'],
        ['week', 'Week'],
        ['maand', 'Maand'],
        ['jaar', 'Jaar'],
      ],
      r.periode.soort,
      (v) => {
        yieldView.soort = v;
        yieldView.datum = null;
        void loadYield();
      },
      'Periode',
    ),
  );
  const step = (datum, label) => {
    const b = el('button', { type: 'button', class: 'rond', 'aria-label': label, text: label.startsWith('Vorige') ? '‹' : '›' });
    if (!datum) b.disabled = true;
    else
      b.addEventListener('click', () => {
        yieldView.datum = datum;
        void loadYield();
      });
    return b;
  };
  parts.push(el('div', { class: 'o-nav' }, step(r.periode.vorige, 'Vorige periode'), el('b', { text: r.periode.label }), step(r.periode.volgende, 'Volgende periode')));

  // Drie getallen, met de periode ervoor eronder.
  const prevName = r.periode.vorigeNaam;
  const tiles = [];
  if (r.heeft.net) tiles.push(kpiTile('Stroom', num(r.stroom.verbruikKwh), 'kWh', r.stroom.eigenZonPct != null ? `${r.stroom.eigenZonPct}% eigen zon` : r.stroom.vorigeKwh != null ? `${prevName}: ${num(r.stroom.vorigeKwh)}` : '', 'var(--warm)'));
  if (r.gas) tiles.push(kpiTile('Gas', num(r.gas.m3), 'm³', r.gas.vorigeM3 != null ? `${prevName}: ${num(r.gas.vorigeM3)}` : '', 'var(--heat)'));
  if (r.kosten.totaal != null) tiles.push(kpiTile('Kosten', euro(r.kosten.totaal), '', r.kosten.vorige != null ? `${prevName}: ${euro(r.kosten.vorige)}` : '', 'var(--ink)'));
  if (tiles.length) parts.push(el('div', { class: 'o-kpis', style: `grid-template-columns: repeat(${tiles.length}, minmax(0, 1fr))` }, ...tiles));

  const sun = r.zon ? sunCard(r) : null;
  const sankey = sankeyCard(r);
  const devices = devicesCard(r);
  const buckets = bucketsCard(r);
  const compare = compareCard(r);
  const cost = costCard(r);
  const view = document.querySelector('[data-view="opbrengst"]');
  if (WIDE.matches) {
    // Op de wand (Wand-Opbrengst): links de periode en de getallen, in het
    // midden waar het heen ging en vergelijken, rechts per apparaat en per dag.
    // Wat Smart Climate scheelde schuift mee naar links.
    view.classList.add('breed');
    $('o-terug').replaceChildren(
      el(
        'div',
        { class: 'o-breed' },
        el('div', { class: 'o-kolom' }, ...parts, ...[sun, $('o-scheelde'), $('o-comfort')].filter(Boolean), el('a', { class: 'knop', href: '#energie', text: 'Meters en prijzen' })),
        el('div', { class: 'o-kolom' }, sankey, compare),
        el('div', { class: 'o-kolom' }, devices, buckets, cost),
      ),
    );
  } else {
    view.classList.remove('breed');
    // Terug op hun eigen plek onder de terugblik.
    $('o-terug').after($('o-scheelde'), $('o-comfort'));
    $('o-terug').replaceChildren(...parts, ...[sun, sankey, devices, buckets, compare, cost].filter(Boolean));
  }
  // De sankey op de breedte die hij echt krijgt: dan zijn de letters overal even groot.
  drawSankey(sankey, r);
}

/** Liggend en breed genoeg: de wand. Wisselt het, dan opnieuw opbouwen. */
const WIDE = matchMedia('(orientation: landscape) and (min-width: 900px)');
WIDE.addEventListener('change', () => yieldData && renderYield());
let sankeyResize = null;
window.addEventListener('resize', () => {
  clearTimeout(sankeyResize);
  sankeyResize = setTimeout(() => {
    const card = document.querySelector('#o-terug .o-sankey-kaart');
    if (yieldData && card) drawSankey(card, yieldData);
  }, 200);
});

function kpiTile(label, value, unit, sub, color) {
  return el(
    'div',
    { class: 'card o-kpi' },
    el('span', { class: 'o-label', style: `color: ${color}`, text: label.toUpperCase() }),
    el('span', { class: 'o-big' }, value, unit ? el('small', { text: ` ${unit}` }) : null),
    sub ? el('span', { class: 'tiny', text: sub }) : null,
  );
}

function splitBar(parts, height = 10) {
  const sum = parts.reduce((a, [v]) => a + v, 0) || 1;
  return el('div', { class: 'o-split', style: `height: ${height}px`, 'aria-hidden': 'true' }, ...parts.map(([v, c]) => el('span', { style: `width: ${(v / sum) * 100}%; background: ${c}` })));
}

function sunCard(r) {
  const z = r.zon;
  const line = (c, text, pct) => el('div', { class: 'tussen small' }, el('span', { class: 'o-key' }, el('i', { style: `background: ${c}` }), text), el('span', { class: 'muted', text: pct == null ? '' : `${pct}%` }));
  return el(
    'div',
    { class: 'card' },
    el('div', { class: 'tussen' }, el('h2', { text: 'Je zonnepanelen' }), z.vorigeKwh != null ? el('small', { class: 'muted', text: `${r.periode.vorigeNaam}: ${kwh(z.vorigeKwh)}` }) : null),
    el('div', { class: 'o-big' }, num(z.opgewektKwh), el('small', { text: ' kWh opgewekt' })),
    splitBar([
      [z.zelfKwh, ZON_C],
      [z.terugKwh, TERUG_C],
    ]),
    line(ZON_C, `${kwh(z.zelfKwh)} zelf gebruikt`, z.zelfPct),
    line(TERUG_C, `${kwh(z.terugKwh)} naar het net`, z.zelfPct == null ? null : 100 - z.zelfPct),
    el(
      'div',
      { class: 'o-duo' },
      r.stroom.eigenZonPct != null ? el('div', {}, el('span', { class: 'tiny', text: 'Zelfvoorzienend' }), el('b', { text: `${r.stroom.eigenZonPct}%` }), el('span', { class: 'tiny', text: 'van je stroom kwam van je dak' })) : null,
      z.besteDag ? el('div', {}, el('span', { class: 'tiny', text: 'Beste dag' }), el('b', { text: kwh(z.besteDag.kwh) }), el('span', { class: 'tiny', text: z.besteDag.label })) : null,
    ),
  );
}

/** De kaart van de sankey; de tekening zelf volgt als hij zijn breedte heeft. */
function sankeyCard(r) {
  const withGas = yieldView.sankey === 'alles' && r.gas;
  const card = el('div', { class: 'card o-sankey-kaart' }, el('h2', { text: withGas ? 'Waar je energie heen ging' : 'Waar je stroom heen ging' }));
  if (r.gas) {
    card.append(
      seg(
        [
          ['stroom', 'Stroom'],
          ['alles', 'Stroom en gas'],
        ],
        yieldView.sankey,
        (v) => {
          yieldView.sankey = v;
          renderYield();
        },
        'Wat de tekening toont',
      ),
    );
  }
  card.append(el('div', { class: 'o-sankey' }), el('span', { class: 'tiny', text: withGas ? 'Alles in kWh: 1 m³ gas is ongeveer 9,8 kWh warmte.' : 'De breedte is de hoeveelheid.' }));
  return card;
}

/**
 * De sankey op schaal: links de bronnen, rechts waar het heen ging. Getekend
 * in pixels van de kaart zelf, zodat de tekst niet meegroeit met een brede kolom.
 */
function drawSankey(card, r) {
  const holder = card.querySelector('.o-sankey');
  if (!holder) return;
  const withGas = yieldView.sankey === 'alles' && r.gas;
  const flows = r.stromen.filter((f) => withGas || f.van !== 'gas');
  const value = (pred) => flows.filter(pred).reduce((a, f) => a + f.kwh, 0);
  const sources = [
    ['zon', 'Zon', ZON_C],
    ['net', 'Net', NET_C],
    ['gas', 'Gas', GAS_C],
  ]
    .map(([id, naam, c]) => ({ id, naam, c, v: value((f) => f.van === id) }))
    .filter((s) => s.v > 0);
  const targets = [
    ...r.apparaten.map((a, i) => ({ id: a.id, naam: a.naam, c: a.rest ? '#8FA3AD' : DEVICE_C[i % DEVICE_C.length] })),
    { id: 'terug', naam: 'Teruggeleverd', c: TERUG_C },
    { id: 'cv', naam: 'Cv en warm water', c: GAS_C },
  ]
    .map((t) => ({ ...t, v: value((f) => f.naar === t.id) }))
    .filter((t) => t.v > 0);
  const total = sources.reduce((a, s) => a + s.v, 0);
  if (total <= 0) {
    holder.replaceChildren(el('p', { class: 'small muted', text: 'In deze periode is er nog niets gemeten.' }));
    return;
  }
  const W = Math.max(280, Math.round(holder.clientWidth || 320));
  const H = Math.max(240, Math.min(420, 40 + targets.length * 40));
  const gap = 8;
  // Elk doel minstens een regel hoog, zodat kleine stromen hun naam houden.
  const minH = 14;
  const k = (H - 10 - gap * (targets.length - 1) - minH * targets.length) / total;
  const sx = 64;
  const tx = W - 182;
  const nw = 9;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${withGas ? 'Energie' : 'Stroom'}: ${sources.map((x) => `${x.naam} ${num(x.v)} kWh`).join(', ')}, naar ${targets.map((t) => `${t.naam} ${num(t.v)}`).join(', ')}` });
  const sgap = sources.length > 1 ? (H - 10 - total * k) / (sources.length - 1) : 0;
  const sy = {};
  let y = 5;
  for (const x of sources) {
    sy[x.id] = { top: y, run: y };
    y += x.v * k + sgap;
  }
  const ty = {};
  y = 5;
  for (const t of targets) {
    ty[t.id] = { top: y, run: y };
    y += Math.max(minH, t.v * k) + gap;
  }
  for (const t of targets) {
    for (const src of ['zon', 'net', 'gas']) {
      const f = flows.find((x) => x.van === src && x.naar === t.id);
      if (!f || !sy[src]) continue;
      const h = f.kwh * k;
      const a0 = sy[src].run;
      const b0 = ty[t.id].run;
      const m = (sx + nw + tx) / 2;
      svg.append(s('path', { d: `M${sx + nw},${a0} C${m},${a0} ${m},${b0} ${tx},${b0} L${tx},${b0 + h} C${m},${b0 + h} ${m},${a0 + h} ${sx + nw},${a0 + h} Z`, fill: sources.find((x) => x.id === src).c, 'fill-opacity': 0.42 }));
      sy[src].run += h;
      ty[t.id].run += h;
    }
  }
  for (const x of sources) {
    const h = x.v * k;
    svg.append(s('rect', { x: sx, y: sy[x.id].top, width: nw, height: h, rx: 2, fill: x.c }));
    svg.append(s('text', { x: sx - 6, y: sy[x.id].top + h / 2 - 2, 'text-anchor': 'end', 'font-size': 13, 'font-weight': 700, fill: '#EAF2F5' }, x.naam));
    svg.append(s('text', { x: sx - 6, y: sy[x.id].top + h / 2 + 13, 'text-anchor': 'end', 'font-size': 12, fill: '#A9BAC2' }, x.id === 'gas' ? `${num(r.gas.m3)} m³` : kwh(x.v)));
  }
  for (const t of targets) {
    const h = t.v * k;
    const cy = ty[t.id].top + h / 2;
    svg.append(s('rect', { x: tx, y: ty[t.id].top, width: nw, height: Math.max(1, h), rx: 2, fill: t.c }));
    const label = s('text', { x: tx + nw + 7, y: cy + 4, 'font-size': 12, fill: '#EAF2F5' });
    // Een lange naam uit Home Assistant past niet naast de tekening: dan ingekort.
    const naam = t.naam.length > 18 ? `${t.naam.slice(0, 17)}…` : t.naam;
    label.append(s('tspan', { 'font-weight': 700 }, naam), s('tspan', { fill: '#A9BAC2' }, ` ${num(t.v)}`));
    svg.append(label);
  }
  holder.replaceChildren(svg);
}

function devicesCard(r) {
  const peak = Math.max(...r.apparaten.map((a) => a.kwh), 0.1);
  return el(
    'div',
    { class: 'card rows' },
    el('div', { class: 'tussen' }, el('h2', { text: 'Per apparaat' }), el('small', { class: 'muted', text: r.heeft.prijzen ? 'kosten van het net' : '' })),
    ...r.apparaten.map((a) =>
      el(
        'div',
        { class: 'o-dev' },
        el('div', { class: 'tussen small' }, el('b', {}, a.naam, a.rest ? el('span', { class: 'muted', style: 'font-weight: 400', text: ' · geen eigen meter' }) : null), el('span', {}, el('b', { text: num(a.kwh) }), ` kWh${a.kosten != null ? ` · ${euro(a.kosten)}` : ''}`)),
        el('div', { class: 'o-split', style: 'height: 8px', 'aria-hidden': 'true' }, el('span', { style: `width: ${(a.zonKwh / peak) * 100}%; background: ${ZON_C}` }), el('span', { style: `width: ${(a.netKwh / peak) * 100}%; background: ${NET_C}` })),
        el('span', { class: 'tiny', text: r.heeft.zon ? `${kwh(a.zonKwh)} eigen zon · ${kwh(a.netKwh)} van het net` : `${kwh(a.netKwh)} van het net` }),
      ),
    ),
  );
}

function bucketsCard(r) {
  const title = { dag: 'Per uur', week: 'Per dag', maand: 'Per dag', jaar: 'Per maand' }[r.periode.soort];
  const list = r.perBucket;
  const W = 320;
  const H = 120;
  const base = H - 16;
  const peak = Math.max(...list.map((b) => b.zonKwh + b.netKwh), 0.1);
  const gasPeak = Math.max(...list.map((b) => b.gasM3), 0.001);
  const bw = W / list.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `${title}: eigen zon en van het net${r.gas ? ', en gas als lijn' : ''}` });
  svg.append(s('line', { x1: 0, y1: base, x2: W, y2: base, stroke: 'rgba(255,255,255,0.14)' }));
  list.forEach((b, i) => {
    const hz = (b.zonKwh / peak) * (base - 6);
    const hn = (b.netKwh / peak) * (base - 6);
    const x = i * bw + 1;
    svg.append(s('rect', { x, y: base - hz, width: Math.max(1, bw - 2), height: hz, rx: 1.5, fill: ZON_C, 'fill-opacity': 0.85 }));
    svg.append(s('rect', { x, y: base - hz - hn, width: Math.max(1, bw - 2), height: hn, rx: 1.5, fill: NET_C, 'fill-opacity': 0.7 }));
  });
  if (r.gas && list.some((b) => b.gasM3 > 0)) {
    svg.append(s('polyline', { points: list.map((b, i) => `${i * bw + bw / 2},${base - (b.gasM3 / gasPeak) * (base - 10)}`).join(' '), fill: 'none', stroke: GAS_C, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  }
  const every = Math.max(1, Math.ceil(list.length / 6));
  list.forEach((b, i) => {
    if (i % every === 0) svg.append(s('text', { x: i * bw + bw / 2, y: H - 3, 'text-anchor': 'middle', 'font-size': 10, fill: '#6E828C' }, b.label));
  });
  return el(
    'div',
    { class: 'card' },
    el('h2', { text: title }),
    svg,
    el('div', { class: 'legend', style: 'justify-content: flex-start' }, ...[[ZON_C, 'eigen zon'], [NET_C, 'van het net'], ...(r.gas ? [[GAS_C, 'gas']] : [])].map(([c, t]) => el('span', {}, el('i', { style: `background: ${c}` }), t))),
  );
}

function compareCard(r) {
  const metrics = [
    ['stroom', 'Stroom'],
    ...(r.heeft.zon ? [['zon', 'Zon']] : []),
    ...(r.gas ? [['gas', 'Gas']] : []),
    ...(r.heeft.prijzen ? [['kosten', 'Kosten']] : []),
  ];
  if (!metrics.some(([m]) => m === yieldView.metric)) yieldView.metric = 'stroom';
  const m = yieldView.metric;
  const series = r.vergelijk[m];
  const unit = m === 'gas' ? 'm³' : m === 'kosten' ? '' : 'kWh';
  const show = (v) => (m === 'kosten' ? euro(v) : `${num(v)} ${unit}`);
  const W = 320;
  const H = 140;
  const base = H - 16;
  const peak = Math.max(...series.flatMap((p) => [p.nu ?? 0, p.jaarEerder ?? 0]), 0.1);
  const slot = W / series.length;
  const bw = Math.min(11, slot / 2 - 2);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `${metrics.find(([x]) => x === m)[1]} per periode${r.periode.soort === 'jaar' ? '' : ', met dezelfde periode een jaar eerder ernaast'}` });
  svg.append(s('line', { x1: 0, y1: base, x2: W, y2: base, stroke: 'rgba(255,255,255,0.14)' }));
  series.forEach((p, i) => {
    const cx = i * slot + slot / 2;
    const last = i === series.length - 1;
    if (p.jaarEerder != null) {
      const h = (Math.max(0, p.jaarEerder) / peak) * (base - 18);
      svg.append(s('rect', { x: cx - bw - 1, y: base - h, width: bw, height: h, rx: 2, fill: 'none', stroke: 'rgba(201,214,220,0.45)', 'stroke-dasharray': '3 2' }));
    }
    if (p.nu != null) {
      const h = (Math.max(0, p.nu) / peak) * (base - 18);
      svg.append(s('rect', { x: cx + 1, y: base - h, width: bw, height: h, rx: 2, fill: '#8FD9FF', 'fill-opacity': last ? 1 : 0.45 }));
    }
    svg.append(s('text', { x: cx, y: H - 3, 'text-anchor': 'middle', 'font-size': 10, fill: last ? '#EAF2F5' : '#6E828C', 'font-weight': last ? 700 : 400 }, p.label));
  });
  const d = r.verschil[m];
  const good = (pct) => (m === 'zon' ? pct >= 0 : pct <= 0);
  const box = (label, x) =>
    x
      ? el('div', {}, el('span', { class: 'tiny', text: label }), el('b', { style: `color: ${good(x.pct) ? 'var(--good)' : 'var(--heat-t)'}`, text: `${x.pct > 0 ? '+' : x.pct < 0 ? '−' : ''}${Math.abs(x.pct)}%` }), el('span', { class: 'tiny', text: `${show(series.at(-1).nu)} tegen ${show(x.dan)}` }))
      : null;
  return el(
    'div',
    { class: 'card' },
    el('div', { class: 'tussen' }, el('h2', { text: 'Vergelijken' }), el('small', { class: 'muted', text: r.periode.soort === 'jaar' ? 'per jaar' : 'stippel is een jaar eerder' })),
    seg(
      metrics,
      m,
      (v) => {
        yieldView.metric = v;
        renderYield();
      },
      'Wat te vergelijken',
    ),
    svg,
    el('div', { class: 'o-duo' }, box(`Tegen ${r.periode.vorigeNaam}`, d.vorige), box('Tegen een jaar eerder', d.jaar)),
  );
}

function costCard(r) {
  if (!r.heeft.prijzen) {
    return el('div', { class: 'card' }, el('h2', { text: 'Kosten' }), el('p', { class: 'small muted', text: 'Vul bij Instellingen je prijzen in, dan staat hier wat het kostte.' }), el('a', { class: 'knop', href: '#energie', text: 'Prijzen invullen' }));
  }
  return el(
    'div',
    { class: 'card rows' },
    el('h2', { text: 'Kosten' }),
    ...r.kosten.regels.map((x) => el('div', { class: 'row' }, el('div', { class: 'l' }, el('b', { text: x.naam }), el('span', { text: x.uitleg })), el('b', { text: x.euro == null ? '—' : x.euro < 0 ? `− ${euro(-x.euro)}` : euro(x.euro) }))),
    el('div', { class: 'tussen', style: 'padding: 12px 0 6px' }, el('b', { text: 'Totaal zonder vaste kosten' }), el('span', { class: 'o-big', text: r.kosten.totaal == null ? '—' : euro(r.kosten.totaal) })),
  );
}

/* ------------------------------------------------------- instellingen: meters en prijzen */

/*
 * Meters en prijzen (besluit 102). Overnemen uit het Energie-dashboard van Home
 * Assistant, of zelf kiezen uit de meters die Home Assistant bijhoudt. Bewaren
 * vraagt een beheerder; wie dat niet is, kijkt mee.
 */
let energyInfo = null;
let energyDraft = null;

async function loadEnergy() {
  $('e-inhoud').replaceChildren(el('p', { class: 'small muted', text: 'Even laden…' }));
  try {
    const res = await fetch('api/energie');
    energyInfo = await res.json();
    if (!res.ok) {
      $('e-inhoud').replaceChildren(el('p', { class: 'small muted', text: energyInfo.fout ?? energyInfo.wachten ?? 'Niet beschikbaar.' }));
      return;
    }
    energyDraft = JSON.parse(JSON.stringify(energyInfo.instellingen ?? energyInfo.voorstel ?? emptyEnergy()));
    renderEnergy();
  } catch {
    $('e-inhoud').replaceChildren(el('p', { class: 'small muted', text: 'Geen verbinding met Smart Climate.' }));
  }
}

const emptyEnergy = () => ({ versie: 1, bron: 'zelf', net: { afname: [], teruglevering: [] }, zon: [], gas: null, apparaten: [], prijzen: { stroom: null, teruglevering: null, gas: null, vastPerMaand: null } });

function renderEnergy() {
  const info = energyInfo;
  const d = energyDraft;
  const meters = info.meters ?? [];
  const nameOf = (id) => meters.find((m) => m.id === id)?.naam ?? id;
  const parts = [];

  // Overnemen uit Home Assistant.
  const v = info.voorstel;
  const ha = el('div', { class: 'card' }, el('h2', { text: 'Uit Home Assistant' }));
  if (v) {
    const count = [v.net.afname.length ? `${v.net.afname.length} meter${v.net.afname.length > 1 ? 's' : ''} van het net` : null, v.net.teruglevering.length ? 'teruglevering' : null, v.zon.length ? 'zonnepanelen' : null, v.gas ? 'gas' : null, v.apparaten.length ? `${v.apparaten.length} apparaten` : null].filter(Boolean);
    // Zonder prijzen: zeggen waarom, zodat de bewoner weet wat hij zelf invult.
    const dp = info.dashboardPrijzen ?? [];
    const noPrice = v.prijzen.stroom == null && v.prijzen.gas == null;
    const why = !noPrice
      ? ''
      : dp.some((x) => x.kostenIsMeter)
        ? ' Bij de kosten staat de meter zelf als kostensensor, waardoor Home Assistant elke kWh en m³ als een euro telt. Vul hieronder je prijzen in; in Home Assistant pas je het aan bij Energie.'
        : dp.some((x) => x.kostenMeter)
        ? ' Het houdt de kosten bij met een eigen kostensensor; die prijs kan ik niet overnemen, vul hem hieronder in.'
        : dp.some((x) => x.prijsEntiteit)
          ? ' De prijs komt uit een entiteit die nu geen getal heeft; vul hem hieronder in.'
          : ' Er staan geen prijzen in; vul ze hieronder in.';
    ha.append(
      el('p', { class: 'small', style: 'color: var(--soft)', text: `Je Energie-dashboard heeft ${count.join(', ')}${noPrice ? '' : ', met prijzen'}.${why}` }),
      button('Overnemen', () => {
        energyDraft = JSON.parse(JSON.stringify(v));
        renderEnergy();
        energySay('Overgenomen. Kijk het na en bewaar.');
      }),
    );
  } else {
    ha.append(el('p', { class: 'small muted', text: info.fout ?? 'Het Energie-dashboard van Home Assistant is niet ingericht. Kies hieronder zelf je meters.' }));
  }
  parts.push(ha);

  // Zelf kiezen: per soort de gekozen meters, met erbij zetten en weghalen.
  // Wat al een rol heeft, staat niet nog eens in een andere lijst.
  const used = new Set([...d.net.afname, ...d.net.teruglevering, ...d.zon, ...(d.gas ? [d.gas] : []), ...d.apparaten.map((a) => a.id)]);
  /**
   * Een keuzelijst met eerst de meters die bij deze rol passen (de dienst raadt
   * de rol), en daaronder de andere van dezelfde soort, voor als het raden misgaat.
   */
  const meterSelect = (label, placeholder, rol, soort, onPick) => {
    const free = meters.filter((m) => m.soort === soort && !used.has(m.id));
    const fit = free.filter((m) => m.rol === rol);
    const other = free.filter((m) => m.rol !== rol);
    if (!free.length) return null;
    const opt = (m) => el('option', { value: m.id, text: m.naam });
    const sel = el(
      'select',
      { class: 'veld', 'aria-label': label },
      el('option', { value: '', text: placeholder }),
      ...(fit.length && other.length ? [el('optgroup', { label: 'Past hierbij' }, ...fit.map(opt)), el('optgroup', { label: 'Andere meters' }, ...other.map(opt))] : free.map(opt)),
    );
    sel.addEventListener('change', () => sel.value && onPick(sel.value));
    return sel;
  };
  const pick = (title, ids, rol, soort, onChange, single = false) => {
    const box = el('div', { class: 'stack', style: 'gap: 6px' }, el('b', { class: 'small', text: title }));
    const chips = el('div', { class: 'o-chips' });
    for (const id of ids) {
      const x = el('button', { type: 'button', class: 'chip plain', 'aria-label': `${nameOf(id)} weghalen`, text: `${nameOf(id)} ×` });
      x.addEventListener('click', () => onChange(ids.filter((i) => i !== id)));
      chips.append(x);
    }
    if (!ids.length) chips.append(el('span', { class: 'tiny', text: 'geen' }));
    box.append(chips);
    const sel = !single || !ids.length ? meterSelect(`${title}: meter erbij`, 'meter erbij…', rol, soort, (id) => onChange([...ids, id])) : null;
    if (sel) box.append(sel);
    return box;
  };
  const redraw = () => renderEnergy();
  parts.push(
    el(
      'div',
      { class: 'card' },
      el('h2', { text: 'Meters' }),
      pick('Stroom van het net', d.net.afname, 'afname', 'energy', (ids) => ((d.net.afname = ids), redraw())),
      pick('Teruglevering', d.net.teruglevering, 'teruglevering', 'energy', (ids) => ((d.net.teruglevering = ids), redraw())),
      pick('Zonnepanelen', d.zon, 'zon', 'energy', (ids) => ((d.zon = ids), redraw())),
      pick('Gas', d.gas ? [d.gas] : [], 'gas', 'volume', (ids) => ((d.gas = ids[0] ?? null), redraw()), true),
    ),
  );

  // Apparaten met een eigen meter, met een eigen naam.
  const devs = el('div', { class: 'card' }, el('h2', { text: 'Apparaten met een eigen meter' }));
  d.apparaten.forEach((a, i) => {
    const name = el('input', { class: 'veld', type: 'text', value: a.naam, maxlength: '40', 'aria-label': `Naam van ${nameOf(a.id)}` });
    name.addEventListener('change', () => (a.naam = name.value.trim() || a.naam));
    const del = el('button', { type: 'button', class: 'knop', text: 'Weg', 'aria-label': `${a.naam} weghalen` });
    del.addEventListener('click', () => {
      d.apparaten.splice(i, 1);
      redraw();
    });
    devs.append(el('div', { class: 'rij' }, name, del), el('span', { class: 'tiny', text: nameOf(a.id) }));
  });
  const addDevice = meterSelect('Apparaat erbij', 'apparaat erbij…', 'apparaat', 'energy', (id) => {
    d.apparaten.push({ id, naam: nameOf(id).slice(0, 40) });
    redraw();
  });
  if (addDevice) {
    devs.append(addDevice);
  }
  parts.push(devs);

  // Prijzen.
  const price = (label, key, hint) => {
    const i = el('input', { class: 'veld', type: 'number', inputmode: 'decimal', step: '0.001', min: '0', value: d.prijzen[key] ?? '', placeholder: hint, 'aria-label': label });
    i.addEventListener('change', () => (d.prijzen[key] = i.value === '' ? null : Number(i.value)));
    return el('label', { class: 'stack', style: 'gap: 4px' }, el('span', { class: 'small', text: label }), i);
  };
  parts.push(
    el(
      'div',
      { class: 'card' },
      el('h2', { text: 'Prijzen' }),
      el('div', { class: 'o-prijzen' }, price('Stroom, € per kWh', 'stroom', '0,25'), price('Teruglevering, € per kWh', 'teruglevering', 'leeg: gesaldeerd'), price('Gas, € per m³', 'gas', '1,30'), price('Vaste kosten, € per maand', 'vastPerMaand', '')),
      el('p', { class: 'tiny', text: 'Zonder vergoeding voor teruglevering rekent Opbrengst met de stroomprijs: tot 2027 wordt er gesaldeerd.' }),
    ),
  );

  const save = button('Bewaren', async () => {
    energySay('Even…');
    try {
      const res = await postDoor('api/energie', { ...d, bron: d.bron ?? 'zelf' });
      const out = await res.json();
      if (res.status === 403) return energySay('Alleen een beheerder in Home Assistant kan dit bewaren.');
      if (!res.ok) return energySay(out.fout ?? 'Niet bewaard.');
      energyInfo = { ...energyInfo, instellingen: out };
      energySay('Bewaard. Opbrengst rekent er nu mee.');
      yieldData = null;
    } catch {
      energySay('Geen verbinding met Smart Climate.');
    }
  });
  parts.push(el('div', { class: 'knoppen' }, save, el('a', { class: 'knop', href: '#opbrengst', text: 'Naar Opbrengst' })), el('p', { class: 'small', id: 'e-zin', 'aria-live': 'polite', text: '' }));
  $('e-inhoud').replaceChildren(...parts);
}

function energySay(text) {
  const p = $('e-zin');
  if (p) p.textContent = text;
}

/* ------------------------------------------------------- de zon en je aansluiting */

/*
 * De zon en je aansluiting (besluit 103, schets Onboarding-Zon). Een paar vragen
 * die de app niet uit Home Assistant haalt. De pagina stuurt alleen antwoorden;
 * welke meters en apparaten erbij horen, zoekt de dienst zelf. Bewaren vraagt
 * een beheerder. De regeling neemt het mee bij de volgende start, en alleen waar
 * de configuratie van het huis het niet al vastlegt.
 */
let connInfo = null;
let connDraft = null;

async function loadConnection() {
  $('z-inhoud').replaceChildren(el('p', { class: 'small muted', text: 'Even laden…' }));
  try {
    const res = await fetch('api/aansluiting');
    const out = await res.json();
    if (!res.ok) {
      $('z-inhoud').replaceChildren(el('p', { class: 'small muted', text: out.fout ?? out.wachten ?? 'Niet beschikbaar.' }));
      return;
    }
    connInfo = out;
    const a = out.antwoorden;
    connDraft = {
      panelen: { ligging: a?.panelen.ligging ?? null, aantal: a?.panelen.aantal ?? null, voorkant: a?.panelen.voorkant ?? null, achterkant: a?.panelen.achterkant ?? null },
      zekering: a?.zekering ?? null,
      tarief: a?.tarief ?? null,
      opZon: { ...(a?.opZon ?? {}) },
    };
    renderConnection();
  } catch {
    $('z-inhoud').replaceChildren(el('p', { class: 'small muted', text: 'Geen verbinding met Smart Climate.' }));
  }
}

/** Een rij keuzes waarvan er één aan staat. */
function choices(label, options, current, onPick, disabled = false) {
  const box = el('div', { class: 'seg z-keuzes', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const b = el('button', { type: 'button', 'aria-pressed': String(JSON.stringify(value) === JSON.stringify(current)), text });
    b.disabled = disabled;
    b.addEventListener('click', () => onPick(value));
    box.append(b);
  }
  return box;
}

/** Het huis van opzij, met de panelen op de kant die je kiest. */
function panelHouse(side) {
  const on = (s) => side === 'beide' || side === s;
  const roof = (s) => (on(s) ? 'var(--warm)' : 'rgba(255,255,255,0.10)');
  const svg = `<svg viewBox="0 0 220 120" role="img" aria-label="Het huis van opzij">
    <rect x="40" y="62" width="140" height="44" rx="3" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)"/>
    ${side === 'plat'
      ? `<rect x="36" y="56" width="148" height="7" rx="2" fill="rgba(255,255,255,0.18)"/><rect x="62" y="46" width="96" height="9" rx="2" fill="var(--warm)"/>`
      : `<polygon points="30,64 110,18 110,64" fill="${roof('voorkant')}" opacity="0.9"/><polygon points="110,18 190,64 110,64" fill="${roof('achterkant')}" opacity="0.9"/>
         <polyline points="30,64 110,18 190,64" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`}
    <rect x="60" y="78" width="18" height="28" rx="2" fill="rgba(255,255,255,0.14)"/>
    <line x1="10" y1="106" x2="210" y2="106" stroke="rgba(255,255,255,0.25)"/>
    <text x="52" y="118" fill="var(--muted)" font-size="10">voorkant</text>
    <text x="142" y="118" fill="var(--muted)" font-size="10">achterkant</text>
  </svg>`;
  const box = el('div', { class: 'z-huis' });
  box.innerHTML = svg;
  return box;
}

function everyText(s) {
  if (s == null) return null;
  if (s < 90) return 'elke minuut';
  if (s < 5400) return `eens per ${Math.round(s / 60)} minuten`;
  return `eens per ${Math.round(s / 3600)} uur`;
}

function renderConnection() {
  const info = connInfo;
  const d = connDraft;
  const redraw = () => renderConnection();
  const parts = [];
  const conf = info.configuratie;

  // Een getal of leeg, voor het aantal panelen.
  const countField = (label, key) => {
    const i = el('input', { class: 'veld z-aantal', type: 'number', inputmode: 'numeric', min: '1', max: '200', step: '1', value: d.panelen[key] ?? '', 'aria-label': label });
    i.addEventListener('change', () => (d.panelen[key] = i.value === '' ? null : Math.round(Number(i.value))));
    return el('label', { class: 'stack', style: 'gap: 4px' }, el('span', { class: 'small', text: label }), i);
  };

  // Zonnepanelen (besluit 93): de kant en het aantal; richting en helling meet de app.
  const side = d.panelen.ligging;
  const counts =
    side === 'beide'
      ? el('div', { class: 'z-aantallen' }, countField('Aantal aan de voorkant', 'voorkant'), countField('Aantal aan de achterkant', 'achterkant'))
      : side && side !== 'weetniet'
        ? countField('Aantal panelen', 'aantal')
        : null;
  parts.push(
    el(
      'div',
      { class: 'card stack' },
      el('h2', { text: 'Zonnepanelen' }),
      el('p', { class: 'small', style: 'color: var(--soft)', text: 'Op welke kant van het dak liggen ze?' }),
      panelHouse(side),
      choices(
        'Kant van het dak',
        [['voorkant', 'Voorkant'], ['achterkant', 'Achterkant'], ['beide', 'Beide kanten'], ['plat', 'Plat dak'], ['weetniet', 'Weet ik niet']],
        side,
        (v) => ((d.panelen.ligging = v), redraw()),
      ),
      counts,
      counts ? el('p', { class: 'tiny', text: 'Het aantal is niet verplicht.' }) : null,
      el('p', { class: 'small muted', text: 'Richting en hellingshoek bepaalt de app zelf, uit de opbrengst van de eerste zonnige dagen. Daarna kun je het controleren.' }),
      conf.panelen.length ? el('p', { class: 'tiny', text: `Nu ingesteld: ${conf.panelen.join(' en ')}.` }) : null,
    ),
  );

  // Hoe snel de zonnesensor is (besluit 89).
  const z = info.zonnesensor;
  if (z) {
    const every = everyText(z.intervalS);
    const chip = z.snelGenoeg == null ? ['', 'Wordt gemeten'] : z.snelGenoeg ? ['good', 'Snel genoeg'] : ['bad', 'Traag'];
    const text =
      z.intervalS == null
        ? 'Hoe vaak de sensor een nieuwe waarde geeft, wordt overdag gemeten, als de panelen leveren.'
        : z.snelGenoeg
          ? `${z.merk ? `${z.merk}: ` : ''}nieuwe waarde ${every}. Snel genoeg om op wisselende bewolking te reageren.`
          : `Nieuwe waarde ${every}. Met een lokale koppeling reageert de regeling binnen een minuut op bewolking.`;
    parts.push(
      el(
        'div',
        { class: 'card stack' },
        el('div', { class: 'tussen' }, el('h2', { text: 'Zonnesensor' }), el('span', { class: `chip ${chip[0]}`.trim(), text: chip[1] })),
        el('p', { class: 'small', style: 'color: var(--soft)', text }),
        z.snelGenoeg === false && z.weg ? el('p', { class: 'tiny', text: `Lokale koppeling: ${z.weg}` }) : null,
      ),
    );
  }

  // De hoofdzekering (besluit 78): met de stroom per fase het tweede budget.
  const fixedFuse = conf.zekering;
  const fuse = fixedFuse ?? d.zekering;
  const one = info.gevonden.fasen.length === 1 ? 'één fase' : `${info.gevonden.fasen.length} fasen`;
  const fuseNote = fixedFuse
    ? 'Ingesteld in de configuratie van het huis; die waarde geldt.'
    : info.gevonden.fasen.length === 0
      ? 'Er is geen stroommeting per fase gevonden. De waarde wordt opgeslagen, maar de regeling gebruikt hem pas met zo’n meting.'
      : d.zekering?.fasen === 3 && info.gevonden.fasen.length < 3
        ? `De meter meet nu ${one}. Met 3 × 25 A rekent de regeling pas als de meter drie fasen meet.`
        : 'Staat op de hoofdschakelaar in de meterkast, of in de app van je netbeheerder.';
  parts.push(
    el(
      'div',
      { class: 'card stack' },
      el('div', { class: 'tussen' }, el('h2', { text: 'Hoofdzekering' }), fixedFuse ? el('span', { class: 'chip', text: 'Ingesteld' }) : null),
      el('p', { class: 'small', style: 'color: var(--soft)', text: 'Hiermee zorgt de regeling dat er nooit zoveel tegelijk aanstaat dat de hoofdzekering eruit gaat.' }),
      choices(
        'Hoofdzekering',
        [[{ fasen: 1, ampere: 25 }, '1 × 25 A'], [{ fasen: 1, ampere: 35 }, '1 × 35 A'], [{ fasen: 3, ampere: 25 }, '3 × 25 A'], ['weetniet', 'Weet ik niet']],
        fuse,
        (v) => ((d.zekering = v), redraw()),
        fixedFuse != null,
      ),
      el('p', { class: 'tiny', text: fuseNote }),
    ),
  );

  // Het stroomcontract: vast of dynamisch (later stap E).
  parts.push(
    el(
      'div',
      { class: 'card stack' },
      el('h2', { text: 'Stroomcontract' }),
      choices('Stroomcontract', [['vast', 'Vast'], ['dynamisch', 'Dynamisch'], ['weetniet', 'Weet ik niet']], d.tarief, (v) => ((d.tarief = v), redraw())),
      el('p', { class: 'small muted', text: 'Bij een dynamisch contract verschilt de prijs per uur. Later kan de regeling daar rekening mee houden.' }),
      el('a', { class: 'linkknop', href: '#energie', text: 'Prijzen instellen bij Meters en prijzen' }),
    ),
  );

  // Apparaten op zon (besluit 98): wat op afstand kan starten.
  const fixed = new Set(conf.apparaten.map((a) => a.id));
  const configured = (naam) =>
    el('div', { class: 'row' }, el('div', { class: 'l' }, el('b', { text: naam }), el('span', { text: 'Start bij zonne-overschot. Ingesteld in de configuratie.' })), el('span', { class: 'chip good', text: 'Aan' }));
  const devs = el('div', { class: 'card stack' }, el('h2', { text: 'Apparaten op zon' }));
  for (const a of info.gevonden.apparaten) {
    if (fixed.has(a.id)) {
      devs.append(configured(a.naam));
      continue;
    }
    devs.append(
      el('div', { class: 'stack', style: 'gap: 8px' },
        el('b', { text: a.naam }),
        el('p', { class: 'small', style: 'color: var(--soft)', text: 'Kan op afstand starten. Automatisch starten bij zonne-overschot? Hoe laat hij klaar moet zijn, kies je per keer.' }),
        choices(`${a.naam} op zon`, [[true, 'Ja'], [false, 'Nee']], d.opZon[a.id] ?? null, (v) => ((d.opZon[a.id] = v), redraw())),
      ),
    );
  }
  for (const a of conf.apparaten) {
    if (!info.gevonden.apparaten.some((x) => x.id === a.id)) devs.append(configured(a.naam));
  }
  if (!info.gevonden.apparaten.length && !conf.apparaten.length) {
    devs.append(el('p', { class: 'small muted', text: 'Geen apparaten gevonden die op afstand kunnen starten.' }));
  }
  devs.append(el('p', { class: 'tiny', text: 'Werkt alleen als "op afstand starten" op het apparaat aanstaat. Zolang Smart Climate meekijkt, wordt er nog niets echt gestart.' }));
  parts.push(devs);

  // Wat de regeling ervan gebruikt.
  const r = info.inDeRegeling;
  const status = [
    ...r.toegevoegd.map((t) => `In gebruik: ${t}.`),
    ...r.overgeslagen.map((t) => `Niet gebruikt: ${t}.`),
    info.volgendeStart ? 'Wijzigingen gelden na de volgende herstart van Smart Climate.' : null,
  ].filter(Boolean);
  if (status.length) parts.push(el('div', { class: 'note' }, ...status.map((t) => el('p', { class: 'small', text: t }))));

  const save = button('Opslaan', async () => {
    connSay('Even…');
    try {
      const opZon = Object.fromEntries(Object.entries(d.opZon).filter(([, v]) => typeof v === 'boolean'));
      const res = await postDoor('api/aansluiting', { panelen: d.panelen, zekering: d.zekering, tarief: d.tarief, opZon });
      const out = await res.json();
      if (res.status === 403) return connSay('Alleen een beheerder in Home Assistant kan dit opslaan.');
      if (!res.ok) return connSay(out.fout ?? 'Niet opgeslagen.');
      connInfo = out;
      renderConnection();
      connSay(out.volgendeStart ? 'Opgeslagen. Gaat in na de volgende herstart.' : 'Opgeslagen.');
    } catch {
      connSay('Geen verbinding met Smart Climate.');
    }
  });
  parts.push(el('div', { class: 'knoppen' }, save, el('a', { class: 'knop', href: '#bediening', text: 'Naar Bediening' })), el('p', { class: 'small', id: 'z-zin', 'aria-live': 'polite', text: '' }));
  $('z-inhoud').replaceChildren(...parts);
}

function connSay(text) {
  const p = $('z-zin');
  if (p) p.textContent = text;
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
  if (ok) markOnline();
  else markLost();
}

/*
 * Zonder verbinding (besluit 82): het scherm blijft staan met de laatste stand,
 * grijs, met sinds wanneer en dat de regeling gewoon doorloopt; bedienen kan pas
 * weer als de verbinding terug is. Een korte onderbreking, zoals bij een uitrol,
 * telt nog niet: pas na vijftien seconden.
 */
const OFFLINE_AFTER_MS = 15_000;
let lostAt = null;
let offlineTimer = null;

function markLost() {
  if (lostAt != null) return;
  lostAt = Date.now();
  offlineTimer = setTimeout(() => showOffline(lostAt), OFFLINE_AFTER_MS);
}

function showOffline(sinceMs) {
  document.body.classList.add('offline');
  $('offline-tijd').textContent = hhmm(sinceMs);
  $('offline').hidden = false;
}

function markOnline() {
  clearTimeout(offlineTimer);
  lostAt = null;
  document.body.classList.remove('offline');
  $('offline').hidden = true;
}

function render(snap) {
  latest = snap;
  remember(snap);
  if (snap.commands?.length) void loadToday(true);
  renderHome(snap);
  renderLog();
  renderControls(snap);
  renderDeferrables(snap);
}

/* ------------------------------------------------------- apparaten op zon */

/*
 * Apparaten op zon (schets Apparaten, besluiten 98 en 101). Per apparaat wat
 * het nu doet, in de woorden van de dienst, en "klaar voor": de bewoner kiest
 * per keer hoe laat hij klaar moet zijn. Die tijd gaat naar de dienst
 * (`api/uitstel`), nooit naar Home Assistant; de keuzes en de zinnen komen
 * kant-en-klaar mee (besluit 94).
 */
const DRUM =
  '<rect x="6" y="5" width="28" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="22" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
/** Het antwoord op de laatste keuze per apparaat, tot het volgende besluit het overneemt. */
const deferrableSaid = new Map();

function renderDeferrables(snap) {
  const list = snap.bewoner?.uitstelbaar ?? [];
  if (!list.length) {
    $('ap-lijst').replaceChildren(el('p', { class: 'small muted', text: 'Er staat geen apparaat als uitstelbaar in de configuratie.' }));
    return;
  }
  $('ap-lijst').replaceChildren(...list.map(deferrableCard));
}

function deferrableCard(d) {
  const kind = d.stand === 'running' || d.stand === 'would_start' ? 'ok' : d.stand === 'waiting' ? 'wait' : 'idle';
  const icon = s('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true', class: `k-${kind}` });
  icon.innerHTML = DRUM;
  const duur = d.duurMin ? `${Math.floor(d.duurMin / 60)} u ${String(d.duurMin % 60).padStart(2, '0')} min` : '';
  const card = el(
    'div',
    { class: `card apparaat${d.kanKiezen ? ' klaar' : ''}${d.stand === 'not_ready' ? ' leeg' : ''}` },
    el('div', { class: 'kop' }, icon, el('div', { class: 'wie' }, el('b', { text: d.naam }), el('span', { class: `small k-${kind}`, text: d.kop })), duur ? el('span', { class: 'small muted', text: duur }) : null),
    el('p', { class: 'small', style: 'color: var(--soft)', text: d.zin }),
  );
  if (d.kanKiezen) {
    const said = el('p', { class: 'small muted', 'aria-live': 'polite', text: deferrableSaid.get(d.id) ?? '' });
    const choose = async (klaarVoor, label) => {
      said.textContent = 'Even…';
      try {
        const res = await postDoor('api/uitstel', { id: d.id, klaarVoor });
        const out = await res.json();
        const text = res.ok ? (klaarVoor ? `Genoteerd: klaar voor ${label}. Ik reken het zo door.` : 'Geen tijd meer: ik begin op zon, en uiterlijk op de vaste tijd.') : (out.fout ?? 'Niet gelukt.');
        deferrableSaid.set(d.id, text);
        said.textContent = text;
      } catch {
        said.textContent = 'Geen verbinding met Smart Climate.';
      }
    };
    const options = [{ tekst: 'Geen haast', waarde: null }, ...d.keuzes];
    const seg = el('div', { class: 'seg pick', role: 'group', 'aria-label': `Klaar voor, ${d.naam}`, style: `grid-template-columns: repeat(${options.length}, minmax(max-content, 1fr))` });
    for (const o of options) {
      const pressed = o.waarde == null ? d.klaarVoor == null : d.klaarVoor === o.waarde;
      const b = el('button', { type: 'button', text: o.tekst, 'aria-pressed': String(pressed) });
      b.addEventListener('click', () => void choose(o.waarde, o.tekst));
      seg.append(b);
    }
    const own = el('input', { class: 'veld', type: 'time', step: '300', 'aria-label': `Een eigen tijd voor ${d.naam}`, value: d.klaarVoor && !d.keuzes.some((k) => k.waarde === d.klaarVoor) ? d.klaarVoor : '' });
    own.addEventListener('change', () => {
      if (/^\d\d:\d\d$/.test(own.value)) void choose(own.value, own.value);
    });
    card.append(
      el('div', { class: 'small', style: 'font-weight: 600', text: 'Klaar voor' }),
      seg,
      el('div', { class: 'tijdkeuze' }, el('span', { class: 'small muted', text: 'of om' }), own),
      said,
    );
  }
  return card;
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
  // Bovenin, naast de verbinding: wie niet is ingelogd, ziet waar het kan.
  $('inlog-chip').hidden = !(session?.toegang === 'sessions' && !session.ingelogd);
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
  apparaat: '<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h2"/>',
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

/**
 * Het kleurenwiel: schuif over het wiel, en bij loslaten gaat de kleur naar de
 * lamp. De hoek is de tint (rood rechts, met de klok mee), de afstand tot het
 * midden de verzadiging: in het midden bijna wit, aan de rand vol. Met de
 * pijltjes kan het ook: links en rechts de tint, op en neer de verzadiging,
 * Enter zet hem.
 */
function colourWheel(d, kan, live, onPick) {
  let cur = kan.tint ? [kan.tint[0], kan.tint[1]] : [30, 80];
  const dot = el('span', { class: 'wieldot', 'aria-hidden': 'true' });
  const wheel = el('div', { class: 'kleurwiel', tabindex: live ? '0' : '-1', role: 'slider', 'aria-label': `Kleur van ${d.naam}`, 'aria-valuemin': '0', 'aria-valuemax': '360' }, dot);
  if (!live) wheel.setAttribute('aria-disabled', 'true');
  const place = () => {
    const a = (cur[0] * Math.PI) / 180;
    const r = (cur[1] / 100) * 50;
    dot.style.left = `${50 + Math.cos(a) * r}%`;
    dot.style.top = `${50 + Math.sin(a) * r}%`;
    dot.style.background = hsCss(cur[0], cur[1]);
    wheel.setAttribute('aria-valuenow', String(cur[0]));
    wheel.setAttribute('aria-valuetext', `tint ${cur[0]} graden, verzadiging ${cur[1]} procent`);
  };
  const fromPoint = (ev) => {
    const b = wheel.getBoundingClientRect();
    const dx = ev.clientX - (b.left + b.width / 2);
    const dy = ev.clientY - (b.top + b.height / 2);
    // Afgerond kan 359,7 graden 360 worden: dat is weer 0.
    const h = Math.round((((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360) % 360;
    cur = [h, Math.round(Math.min(1, Math.hypot(dx, dy) / (b.width / 2)) * 100)];
    place();
  };
  let dragging = false;
  wheel.addEventListener('pointerdown', (ev) => {
    if (!live) return;
    dragging = true;
    wheel.setPointerCapture?.(ev.pointerId);
    fromPoint(ev);
    ev.preventDefault();
  });
  wheel.addEventListener('pointermove', (ev) => {
    if (dragging) fromPoint(ev);
  });
  wheel.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    void onPick([cur[0], cur[1]]);
  });
  wheel.addEventListener('pointercancel', () => {
    dragging = false;
  });
  wheel.addEventListener('keydown', (ev) => {
    if (!live) return;
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[ev.key];
    if (step) {
      cur = [(cur[0] + step[0] + 360) % 360, Math.max(0, Math.min(100, cur[1] + step[1]))];
      place();
      ev.preventDefault();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      void onPick([cur[0], cur[1]]);
      ev.preventDefault();
    }
  });
  place();
  return el('div', { class: 'wielvak' }, wheel);
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
    return [colourWheel(d, kan, live, (tint) => send({ tint }, `${d.naam} in de gekozen kleur.`)), swatches];
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
/** Welke scènelijsten helemaal open staan, per lamp en groep. */
const scenesOpen = new Set();
const SCENES_SHOWN = 6;

/** Het bolletje van een scène: zijn kleuren, of een zacht verloop als die nog onbekend zijn. */
function sceneDot(sc) {
  if (sc.plaatje) return el('img', { class: 'scene-dot scene-pic', src: sc.plaatje, alt: '', loading: 'lazy' });
  const c = sc.kleuren ?? [];
  const bg = c.length === 0 ? 'linear-gradient(135deg, var(--warm), var(--violet))' : c.length === 1 ? c[0] : `conic-gradient(from 210deg, ${[...c, c[0]].join(', ')})`;
  return el('i', { class: 'scene-dot', 'aria-hidden': 'true', style: `background: ${bg}` });
}

/*
 * De scènes bij een lamp (besluit 100): die van zijn eigen Hue-groep, zodat
 * "Energie" van de border en van het tuinhuis niet naast elkaar staan. Hoort de
 * lamp bij geen groep met scènes, dan die van de ruimte, per groep. De laatst
 * gebruikte eerst, zes per groep, de rest achter "Alle scènes".
 */
function roomScenes(room, d, say, live) {
  const lower = (x) => x.trim().toLowerCase();
  const inGroup = (sc) => sc.groep && (lower(d.haNaam) === lower(sc.groep) || d.groepen.some((g) => lower(g) === lower(sc.groep)));
  const mine = room.scenes.filter(inGroup);
  const list = mine.length ? mine : room.scenes;
  const groups = [...new Set(list.map((sc) => sc.groep ?? ''))];
  const sections = groups.map((groep) => {
    const all = list.filter((sc) => (sc.groep ?? '') === groep);
    const key = `${d.id}|${groep}`;
    const open = scenesOpen.has(key);
    const grid = el(
      'div',
      { class: 'scenes' },
      ...(open ? all : all.slice(0, SCENES_SHOWN)).map((sc) => {
        // In een eigen span, zodat een lange naam uit Hue afbreekt in plaats van uit te steken.
        const b = el('button', { type: 'button', 'aria-pressed': String(sc.actief) }, sceneDot(sc), el('span', { text: sc.naam }));
        b.disabled = !live;
        b.addEventListener('click', async () => {
          say('Even…');
          const fout = await switchLights({ id: sc.id }, 'api/scene');
          say(fout ?? `Scène ${sc.naam}${sc.groep ? ` in ${sc.groep}` : ''}.`);
        });
        return b;
      }),
    );
    const more =
      all.length > SCENES_SHOWN
        ? el('button', { type: 'button', class: 'linkknop', text: open ? 'Minder scènes' : `Alle scènes (${all.length})` })
        : null;
    more?.addEventListener('click', () => {
      if (open) scenesOpen.delete(key);
      else scenesOpen.add(key);
      // Het blad opnieuw tekenen; het antwoord op de laatste knop blijft staan.
      openDevice(room, d);
    });
    return el('div', { class: 'stack', style: 'gap: 8px', 'data-groep': groep }, groups.length > 1 ? el('span', { class: 'small muted', text: groep || room.naam }) : null, grid, more);
  });
  const title = mine.length && groups.length === 1 ? `Scènes van ${groups[0]}` : `Scènes in de ${room.naam.toLowerCase()}`;
  return el(
    'section',
    { class: 'scenebox stack' },
    el('div', { class: 'tussen' }, el('b', { text: title }), el('span', { class: 'small muted', text: 'uit Hue' })),
    ...sections,
    el('p', { class: 'small muted', text: 'Een scène zet alle lampen van zijn groep in één keer. Je maakt en verandert ze in de Hue-app; hier kies je ze. De kleuren leert de app als je een scène gebruikt.' }),
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
  // Uitstelbare apparaten (besluit 98), zoals de droger.
  for (const d of list.filter((x) => x.soort === 'apparaat')) rows.push(deviceLink(room, d));
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
    if (room.scenes?.length) $('hu-blad-extra').append(roomScenes(room, d, say, live));
    hint(live ? 'Licht gaat rechtstreeks via Home Assistant; Smart Climate regelt het niet.' : 'Licht bedienen staat uit voor deze weergave; het kan via Home Assistant.');
  } else if (d.soort === 'apparaat') {
    hint('Op zon: Smart Climate kiest het moment, starten doe je op het apparaat zelf. Klaar voor kiezen staat bij Apparaten.');
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
  $('inlog-chip').addEventListener('click', (ev) => {
    ev.preventDefault();
    location.href = loginHref();
  });
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
