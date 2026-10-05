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

const BLOCK = {
  min_run_not_elapsed: 'moet eerst zijn minimale draaitijd halen',
  min_rest_not_elapsed: 'moet nog even rusten',
  stabilisation_active: 'wacht tot het verbruik stabiel is',
  settling_after_switch: 'komt tot rust na een wissel',
  insufficient_power_budget: 'te weinig zon over',
  start_threshold_not_met: 'net te weinig zon om te starten',
  capability_missing: 'het apparaat kan dit niet',
  setpoint_out_of_range: 'doel buiten bereik van het apparaat',
  superseded_by_higher_priority: 'een andere kamer ging voor',
  no_change_needed: 'niets te veranderen',
  resident_override: 'jij hebt het overgenomen',
};

const REASON = {
  zone_below_setpoint: 'onder het doel',
  zone_above_setpoint: 'boven het doel',
  zone_satisfied: 'op temperatuur',
  buffering_free_energy: 'gratis zonnestroom opslaan als koelte of warmte',
  surplus_available: 'er is zon over',
  surplus_insufficient: 'te weinig zon over',
  importing_from_grid: 'het huis haalt stroom van het net',
  outside_active_hours: 'buiten de actieve uren',
  mode_excludes_action: 'past niet bij deze modus',
  nobody_home: 'niemand thuis',
  failsafe_unreliable_input: 'een meting is onbetrouwbaar',
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
  if (id === 'huis') void loadHouse(true);
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
  const e = snap.explanation;
  const pz = e.perZone.find((z) => z.zoneId === zoneId);
  if (e.failsafe?.active) return { kind: 'bad', text: 'Storing: veilig gezet' };
  const ids = actuatorsOf(zoneId);
  // Overgenomen door de bewoner (besluit 74): dat gaat voor alles behalve een storing.
  const taken = (e.overrides ?? []).find((o) => ids.includes(o.actuatorId));
  if (taken) {
    return { kind: 'wait', text: taken.untilMs == null ? 'Jij hebt het overgenomen' : `Jij hebt het tot ${hhmm(taken.untilMs)}` };
  }
  const accepted = snap.accepted.filter((i) => ids.includes(i.actuatorId));
  const running = accepted.find((i) => i.action === 'cool' || i.action === 'heat');
  if (running) {
    const onSun = running.strategyId === 'pv-surplus';
    const word = running.action === 'cool' ? 'Koelt' : 'Verwarmt';
    return { kind: running.action, text: onSun ? `${word} op zon` : word, actuatorId: running.actuatorId };
  }
  if (accepted.some((i) => i.action === 'standby')) return { kind: 'wait', text: 'Geparkeerd, klaar om te hervatten' };
  const wanting = pz?.demand && pz.demand !== 'none';
  const blocked = snap.rejected.find((r) => r.intent.zoneId === zoneId);
  if (blocked && wanting) {
    const why = blocked.blockedBy === 'insufficient_power_budget' ? 'Wacht op meer zon' : `Wacht: ${BLOCK[blocked.blockedBy] ?? 'nog niet'}`;
    return { kind: 'wait', text: why };
  }
  if (pz?.temperatureC == null) return { kind: 'bad', text: 'Geen meting' };
  if (pz.reason === 'zone_satisfied') return pz.targetC == null ? { kind: 'idle', text: 'Niets te doen' } : { kind: 'ok', text: 'Op temperatuur' };
  if (wanting) return { kind: 'idle', text: `Niets te doen: ${REASON[pz.reason] ?? pz.reason}` };
  return { kind: 'idle', text: 'Niets te doen' };
}

/** Wat het echte apparaat in deze kamer doet, voor de vergelijking. */
function zoneReal(snap, zoneId) {
  const parts = actuatorsOf(zoneId)
    .map((id) => ({ id, o: parseObserved(snap.observed?.[id]) }))
    .filter(({ o }) => o.action !== 'off' && o.action !== 'onbekend');
  if (parts.length === 0) return 'uit';
  return parts.map(({ id }) => `${actuatorName(id)} ${describeObserved(snap.observed[id])}`).join(', ');
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
  const svg = s('svg', { viewBox: '0 0 520 500', role: 'img' });
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
  const grid = e.budget.gridPowerW;
  const hour = new Date(snap.atMs).getHours();
  const sunny = solar != null && solar > 30;
  // Een zwakke zon tekenen we ook zwak: 100 W is geen stralende middag.
  const strength = sunny ? Math.min(1, 0.35 + solar / 1500) : 0;
  if (sunny) {
    svg.append(s('circle', { cx: 452, cy: 66, r: 30 + 30 * strength, fill: 'url(#nSun)', opacity: strength }));
    svg.append(s('circle', { cx: 452, cy: 66, r: 20, fill: '#F5B342', filter: 'url(#nGlow)', opacity: 0.45 + 0.55 * strength }));
    svg.append(s('text', { x: 452, y: 122, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 700, fill: '#F5C66E' }, kw(solar)));
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
    const inRoof = n >= 2 && i === n - 1;
    const unitCool = (z.actuatorIds ?? []).some(canCool);
    const running = st.kind === 'cool' || st.kind === 'heat';
    if (inRoof) {
      svg.append(s('polygon', { points: '124,206 270,84 416,206', fill: `url(#nF-${st.kind})` }));
      svg.append(s('text', { x: 270, y: 124, 'text-anchor': 'middle', 'font-size': 18, fill: '#C9D6DC' }, z.name));
      svg.append(s('text', { x: 270, y: 154, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 600, fill: '#fff' }, deg(temp(z.id))));
      svg.append(s('text', { x: 270, y: 174, 'text-anchor': 'middle', 'font-size': 15, fill: TEXT[st.kind] }, short(st.text)));
      if (unitCool) {
        // Dezelfde airco als beneden, alleen kleiner: met luchtstroom als hij draait.
        svg.append(s('rect', { x: 244, y: 180, width: 52, height: 9, rx: 3, fill: running ? '#DDF3FF' : 'rgba(255,255,255,0.4)', filter: running ? 'url(#nGlow)' : '' }));
        if (running) {
          svg.append(s('path', { d: 'M254,193 q5,6 0,12 M270,193 q5,6 0,12 M286,193 q5,6 0,12', fill: 'none', stroke: st.kind === 'cool' ? '#8FD9FF' : '#FFB088', 'stroke-width': 2, 'stroke-linecap': 'round' }));
          if (sunny) flows.push({ path: 'M372,150 C392,166 330,180 296,184' });
        }
      }
    } else {
      const top = 470 - (i + 1) * floorH;
      svg.append(s('rect', { x: 114, y: top + 4, width: 312, height: floorH - 8, fill: `url(#nF-${st.kind})` }));
      if (i > 0 || n >= 2) svg.append(s('line', { x1: 110, y1: top, x2: 430, y2: top, stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1.5 }));
      const big = floorH >= 110;
      svg.append(s('text', { x: 132, y: top + (big ? 36 : 28), 'font-size': big ? 20 : 17, fill: '#C9D6DC' }, z.name));
      svg.append(s('text', { x: 132, y: top + (big ? 84 : 62), 'font-size': big ? 46 : 32, 'font-weight': 600, fill: '#fff' }, deg(temp(z.id))));
      svg.append(s('text', { x: 132, y: top + (big ? 112 : 84), 'font-size': big ? 17 : 15, fill: TEXT[st.kind] }, short(st.text)));
      if (unitCool) {
        const uy = top + 12;
        svg.append(s('rect', { x: 340, y: uy, width: 64, height: 12, rx: 4, fill: running ? '#DDF3FF' : 'rgba(255,255,255,0.35)', filter: running ? 'url(#nGlow)' : '' }));
        if (running) {
          svg.append(s('path', { d: `M350,${uy + 20} q6,8 0,16 M372,${uy + 20} q6,8 0,16 M394,${uy + 20} q6,8 0,16`, fill: 'none', stroke: st.kind === 'cool' ? '#8FD9FF' : '#FFB088', 'stroke-width': 2, 'stroke-linecap': 'round' }));
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
  const climateW = e.budget.allocatedW ?? 0;
  const useW = Math.max(0, (solar ?? 0) + grid);
  const toHouse = flows.length === 0 && sunny && n >= 2;
  if (toHouse) flows.push({ path: 'M372,150 C452,196 462,330 432,396' });
  for (const f of flows) {
    svg.append(s('path', { d: f.path, fill: 'none', stroke: 'url(#nFlow)', 'stroke-width': 8, 'stroke-opacity': 0.18, 'stroke-linecap': 'round' }));
    svg.append(s('path', { class: 'flow', d: f.path, fill: 'none', stroke: toHouse ? '#F5B342' : 'url(#nFlow)', 'stroke-width': 3.5, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', filter: 'url(#nGlow)' }));
  }
  if (flows.length > 0) {
    const toHouseW = Math.min(solar ?? 0, useW);
    // In de schaduw is wat naar de airco's gaat een plan van Smart Climate, geen meting.
    const units = flows.length > 1 ? "airco's" : 'airco';
    const big = toHouse ? kw(toHouseW) : climateW > 0 ? `≈ ${kw(climateW)}` : null;
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
  if (Math.abs(grid) >= 20) {
    const exporting = grid < 0;
    svg.append(s('path', { class: 'flow', d: exporting ? 'M430,446 C452,446 466,436 484,418' : 'M484,418 C466,436 452,446 430,446', fill: 'none', stroke: exporting ? '#6FDCA6' : '#A9BAC2', 'stroke-width': 3.5, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', filter: 'url(#nGlow)' }));
    if (Math.abs(grid) >= 50) {
      svg.append(s('text', { x: 516, y: 496, 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: exporting ? '#6FDCA6' : '#C9D6DC' }, exporting ? `${kw(grid)} terug` : `${kw(grid)} van het net`));
    }
  }

  const names = zones.map((z) => z.name).join(', ');
  svg.setAttribute('aria-label', `Doorsnede van het huis met ${names}`);
  $('huis').replaceChildren(svg);

  const climate = e.budget.reclaimableW ?? 0;
  const house = Math.max(0, (solar ?? 0) + grid - climate);
  $('legenda').replaceChildren(
    ...[
      ['#F5B342', `Zon ${solar == null ? '—' : kw(solar)}`],
      // Gemeten: wat de airco's echt opnemen, ook als je huidige regeling ze stuurt.
      ['#5CC8FF', `${site?.migrating ? 'Airco gemeten' : 'Airco'} ${kw(climate)}`],
      ['#8FA3AD', `Huis ${kw(house)}`],
      ...(facadeLine() ? [['#F5C66E', facadeLine()]] : []),
    ].map(([c, t]) => el('span', {}, el('i', { style: `background: ${c}` }), t)),
  );
}

/** "woonkamer", "zolder" → "woonkamer en de zolder". */
function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', de ')} en de ${names[names.length - 1]}`;
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
  const active = statuses.filter(({ st }) => st.kind === 'cool' || st.kind === 'heat');
  const waiting = statuses.filter(({ st }) => st.kind === 'wait');
  const solar = e.solarProductionW;

  $('h-eyebrow').textContent = `Nu · ${MODE[e.mode] ?? e.mode}${e.modeSource === 'override' ? ' (gekozen)' : ''}`;
  if (e.failsafe?.active) {
    $('h-titel').textContent = 'Er is een storing';
    $('h-zin').textContent = 'Een meting is onbetrouwbaar; Smart Climate zet de hulpapparaten veilig uit.';
  } else if (active.length > 0) {
    $('h-titel').textContent = active.length === 1 ? `De ${active[0].z.name.toLowerCase()} wordt ${active[0].st.kind === 'cool' ? 'gekoeld' : 'verwarmd'}` : 'Het huis wordt geregeld';
    $('h-zin').textContent = active.map(({ z, st }) => `${z.name}: ${st.text.toLowerCase()}.`).join(' ') + (waiting.length ? ` ${waiting.map(({ z, st }) => `${z.name}: ${st.text.toLowerCase()}.`).join(' ')}` : '');
  } else if (waiting.length > 0) {
    const onSun = waiting.every(({ st }) => st.text === 'Wacht op meer zon');
    const names = joinNames(waiting.map(({ z }) => z.name.toLowerCase()));
    $('h-titel').textContent = onSun ? 'Het huis wacht op zon' : 'Er wacht iets';
    $('h-zin').textContent = onSun
      ? `De ${names} ${waiting.length > 1 ? 'willen' : 'wil'} koelen zodra er genoeg zon over is.`
      : waiting.map(({ z, st }) => `${z.name}: ${st.text.toLowerCase()}.`).join(' ');
  } else {
    $('h-titel').textContent = 'Er draait niets';
    $('h-zin').textContent = solar != null && solar > 30 ? 'Geen kamer heeft iets nodig.' : 'Geen zon, en geen kamer heeft iets nodig.';
  }

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
  const lines = [];
  const quiet = [];
  for (const a of site?.actuators ?? []) {
    const acc = snap.accepted.find((i) => i.actuatorId === a.id);
    const rej = snap.rejected.find((r) => r.intent.actuatorId === a.id);
    let text;
    let kind = 'idle';
    if (acc && (acc.action === 'cool' || acc.action === 'heat')) {
      kind = acc.action;
      text = `${ACTION[acc.action]}${acc.setpointC != null ? ` naar ${nl(acc.setpointC)}°` : ''} · ${REASON[acc.reason] ?? acc.reason}`;
    } else if (rej) {
      kind = 'wait';
      text = `zou ${ACTION[rej.intent.action] ?? rej.intent.action}, maar ${BLOCK[rej.blockedBy] ?? rej.blockedBy}`;
    } else {
      quiet.push(a.name);
      continue;
    }
    lines.push(el('div', { style: 'display: flex; gap: 10px; align-items: flex-start' }, el('span', { class: `dot k-${kind}`, style: 'margin-top: 5px' }), el('div', {}, el('b', { text: a.name }), el('div', { class: 'muted', text }))));
  }
  if (quiet.length) {
    lines.push(el('div', { style: 'display: flex; gap: 10px; align-items: flex-start' }, el('span', { class: 'dot k-idle', style: 'margin-top: 5px' }), el('div', { class: 'muted', text: `${quiet.join(', ')}: niets te doen` })));
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

function describeCommand(c) {
  const who = actuatorName(c.actuatorId);
  if (c.kind === 'setAction') return `${who}: ${ACTION[c.action] ?? c.action}`;
  if (c.kind === 'setSetpoint') return `${who}: doel ${nl(c.setpointC)}°`;
  if (c.kind === 'startTimer') return c.timerId === 'stabilisation' ? `Stabiliseren, ${Math.round(c.durationS / 60)} minuten` : `Timer ${c.timerId}`;
  return c.kind;
}

function remember(snap) {
  if (!snap.commands?.length) return;
  const reasons = snap.accepted
    .filter((i) => snap.commands.some((c) => c.actuatorId === i.actuatorId))
    .map((i) => `${actuatorName(i.actuatorId)}: ${REASON[i.reason] ?? i.reason}`);
  const entry = { t: snap.atMs, what: snap.commands.map(describeCommand), why: reasons };
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
    const fromDay = today.besluiten.map((b) => ({
      t: b.tMs,
      what: b.opdrachten.map(describeCommand),
      why: b.redenen.map((r) => `${actuatorName(r.actuatorId)}: ${REASON[r.reden] ?? r.reden ?? ACTION[r.actie] ?? r.actie}`),
    }));
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
  const winter = r.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
  $('o-tegels').replaceChildren(
    el('div', { class: 'card', style: 'gap: 4px' }, el('div', { style: 'font-size: 24px; font-weight: 600', text: `${r.episodesTotaal}` }), el('div', { class: 'small muted', text: 'keer dat Smart Climate het anders zou doen' })),
    el('div', { class: 'card', style: 'gap: 4px' }, el('div', { style: 'font-size: 24px; font-weight: 600', text: winter ? `${nl(winter.dagen, 0)} / ${winter.doel}` : '—' }), el('div', { class: 'small muted', text: 'winterdagen in de dataset' })),
  );
  const seasons = r.dataset?.seizoenen ?? [];
  $('o-dataset').replaceChildren(
    el('div', { class: 'head' }, el('h2', { text: 'De dataset' }), el('small', { text: `${nl(r.dataset?.dagenOpgenomen ?? 0)} dagen opgenomen` })),
    ...seasons.map((x) =>
      el(
        'div',
        { class: 'stack', style: 'gap: 4px' },
        el('div', { class: 'small', style: 'display: flex; justify-content: space-between' }, el('span', { text: x.seizoen }), el('span', { class: 'muted', text: `${nl(x.dagen, 0)} van ${x.doel}` })),
        el('div', { class: 'bar' }, el('div', { style: `width: ${Math.min(100, (x.dagen / x.doel) * 100)}%` })),
      ),
    ),
  );
  $('o-voet').textContent = `Gemeten in schaduwmodus: wat Smart Climate zou hebben gedaan. Berekend om ${hhmm(r.berekendOpMs)}, uit ${r.bestanden} dagbestanden.`;
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
  seg.style.gridTemplateColumns = `repeat(${modes.length}, minmax(0, 1fr))`;
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
    const res = await fetch('api/gevoel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
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
  seg.style.gridTemplateColumns = `repeat(${zones.length}, minmax(0, 1fr))`;
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

/* ------------------------------------------------------- huis */

/*
 * Het huis als navigatie (ONTWERP §4, besluit 94): huis, etage, ruimte. Namen,
 * standen en zinnen komen kant-en-klaar uit /api/huis; deze pagina kiest alleen
 * welk niveau ze toont. Bedienen zegt wat Smart Climate zou doen.
 */
let house = null;
let houseAt = 0;

async function loadHouse(force = false) {
  if (!force && Date.now() - houseAt < 20_000) return;
  houseAt = Date.now();
  await loadLayoutInfo();
  try {
    const res = await fetch('api/huis');
    house = res.ok ? await res.json() : null;
  } catch {
    house = null;
  }
  renderHouse();
}

const floorKey = (f) => f.id ?? 'geen';
const lampen = (n) => `${n} ${n === 1 ? 'lamp' : 'lampen'} aan`;

function houseRoute() {
  const [, level = null, key = null] = (location.hash || '').slice(1).split('/');
  return { level, key: key == null ? null : decodeURIComponent(key) };
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

let houseRouteShown = '';

function renderHouse() {
  // Een ander niveau sluit het blad; dezelfde plek opnieuw tekenen niet.
  if (location.hash !== houseRouteShown) {
    $('hu-blad').hidden = true;
    houseRouteShown = location.hash;
  }
  if (!house) {
    back('#thuis', 'Thuis');
    crumb([['Huis']]);
    $('hu-titel').textContent = 'Het huis';
    $('hu-zin').textContent = 'De etages en ruimtes komen van Home Assistant zodra die verbonden is.';
    $('hu-lijst').replaceChildren();
    return;
  }
  const { level, key } = houseRoute();
  const floors = house.etages;
  let floor = level === 'etage' ? floors.find((f) => floorKey(f) === key) : null;
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
    renderFloor(floor, floors.length > 1);
    return;
  }

  back('#thuis', 'Thuis');
  crumb([['Huis']]);
  $('hu-titel').textContent = 'Het huis';
  $('hu-zin').textContent = house.lampenAan ? `${lampen(house.lampenAan)}.` : 'Er brandt geen licht.';
  if (editing) {
    $('hu-lijst').replaceChildren(...editBar(), ...editHouseLevel());
    return;
  }
  $('hu-lijst').replaceChildren(
    ...editBar(),
    ...floors.map((f) =>
      el(
        'a',
        { class: 'room', href: `#huis/etage/${encodeURIComponent(floorKey(f))}` },
        el(
          'div',
          { style: 'display: flex; flex-direction: column; gap: 2px; min-width: 0' },
          el('span', { class: 'name', text: f.naam }),
          el('span', { class: 'status', text: f.ruimtes.map((r) => (r.temperatuurC == null ? r.naam : `${r.naam} ${deg(r.temperatuurC)}`)).join(' · ') }),
          el('span', { class: 'real', text: f.lampenAan ? lampen(f.lampenAan) : 'geen licht aan' }),
        ),
        el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }),
      ),
    ),
    ...homelessNote(),
  );
}

/** Wat in Home Assistant in geen ruimte staat, kan het huis niet tonen; zeg dat. */
function homelessNote() {
  const list = house?.zonderRuimte ?? [];
  if (!list.length) return [];
  const lamps = list.filter((d) => d.soort === 'licht').length;
  const screens = list.filter((d) => d.soort === 'screen').length;
  const climate = list.filter((d) => d.soort === 'klimaat').length;
  const what = [
    lamps ? `${lamps} ${lamps === 1 ? 'lamp' : 'lampen'}` : null,
    screens ? `${screens} ${screens === 1 ? 'screen' : 'screens'}` : null,
    climate ? `${climate} klimaatapparaat${climate === 1 ? '' : 'en'}` : null,
  ].filter(Boolean);
  const names = list.slice(0, 6).map((d) => d.naam).join(', ') + (list.length > 6 ? ', …' : '');
  return [
    el(
      'div',
      { class: 'note' },
      `${what.join(' en ')} ${list.length === 1 ? 'staat' : 'staan'} in Home Assistant in geen ruimte, dus het huis kan ze niet tonen: ${names}. Zet ze in Home Assistant in een ruimte; dan verschijnen ze hier vanzelf.`,
    ),
  ];
}

function renderFloor(floor, many) {
  if (many) back('#huis', 'Huis');
  else back('#thuis', 'Thuis');
  crumb(many ? [['Huis', '#huis'], [floor.naam]] : [[floor.naam]]);
  $('hu-titel').textContent = floor.naam;
  $('hu-zin').textContent = floor.lampenAan ? `${lampen(floor.lampenAan)}.` : 'Er brandt hier geen licht.';
  if (editing) {
    $('hu-lijst').replaceChildren(...editBar(), ...editFloorLevel(floor.id));
    return;
  }
  $('hu-lijst').replaceChildren(
    ...editBar(),
    ...floor.ruimtes.map((r) => {
      const screens = [...new Set(r.apparaten.filter((d) => d.soort === 'screen').map((d) => d.stand))];
      const bits = [r.lampenAan ? lampen(r.lampenAan) : null, screens.length ? `screens ${screens.join(', ')}` : null].filter(Boolean);
      return el(
        'a',
        { class: 'room', href: `#huis/ruimte/${encodeURIComponent(r.id)}` },
        el('span', { class: `dot glow k-${r.status?.soort ?? 'idle'}` }),
        el(
          'div',
          { style: 'display: flex; flex-direction: column; gap: 2px; min-width: 0' },
          el('span', { class: 'name', text: r.naam }),
          r.status ? el('span', { class: `status k-${r.status.soort}`, text: r.status.zin }) : null,
          bits.length ? el('span', { class: 'real', text: bits.join(' · ') }) : null,
        ),
        el('span', { class: 'temp', text: r.temperatuurC == null ? '' : deg(r.temperatuurC) }),
      );
    }),
  );
}

const GROUPS = [
  ['klimaat', 'KLIMAAT'],
  ['screen', 'ZONWERING'],
  ['licht', 'VERLICHTING'],
];

function renderRoom(floor, room) {
  const many = house.etages.length > 1;
  const up = `#huis/etage/${encodeURIComponent(floorKey(floor))}`;
  back(up, floor.naam);
  crumb([...(many ? [['Huis', '#huis']] : []), [floor.naam, up], [room.naam]]);
  $('hu-titel').textContent = room.temperatuurC == null ? room.naam : `${room.naam} · ${deg(room.temperatuurC)}`;
  $('hu-zin').textContent = room.status?.zin ?? '';
  const parts = [...editBar(), ...(editing ? editRoomLevel(room.id) : [])];
  const zoneName = (id) => room.zones.find((z) => z.id === id)?.naam;
  for (const [kind, label] of GROUPS) {
    const list = room.apparaten.filter((d) => d.soort === kind);
    if (!list.length) continue;
    parts.push(el('div', { class: 'groep', text: label }));
    parts.push(
      el(
        'div',
        { class: 'tegels' },
        ...list.map((d) => {
          const b = el(
            'button',
            { type: 'button', class: 'tegel', 'aria-pressed': 'false' },
            el('b', { text: d.naam }),
            el('span', { class: d.aan ? `aan-${d.soort}` : 'uit', text: d.stand }),
            d.zone && zoneName(d.zone) ? el('span', { class: 'small muted', text: zoneName(d.zone) }) : null,
          );
          b.addEventListener('click', () => {
            for (const t of document.querySelectorAll('#hu-lijst .tegel')) t.setAttribute('aria-pressed', String(t === b));
            if (editing) editDevice(room, d);
            else openDevice(room, d);
          });
          return b;
        }),
      ),
    );
  }
  if (!room.apparaten.length) parts.push(el('p', { class: 'small muted', text: 'Hier staat niets dat Smart Climate kent.' }));
  $('hu-lijst').replaceChildren(...parts);
}

/*
 * Bedienen in de proefomgeving (besluit 94): de knoppen werken, en zeggen wat
 * er zou gebeuren. Klimaat vraagt het de assistent; screens en licht hebben een
 * vaste zin, want daar beslist Smart Climate (nog) niets.
 */
function openDevice(room, d) {
  $('hu-blad').hidden = false;
  $('hu-blad-naam').textContent = d.naam;
  $('hu-blad-stand').textContent = d.stand;
  $('hu-blad-zin').textContent = '';
  const say = (text) => {
    $('hu-blad-zin').textContent = text;
  };
  const buttons = [];
  if (d.soort === 'klimaat' && room.zoneId) {
    for (const [label, wens] of [
      ['Koelen', 'koelen'],
      ['Verwarmen', 'verwarmen'],
      ['Uit', 'uit'],
    ]) {
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
  } else if (d.soort === 'licht') {
    for (const label of ['Aan', 'Uit']) {
      buttons.push([label, () => say('Licht bedien je straks hier, rechtstreeks via Home Assistant. In deze proef nog niet.')]);
    }
  }
  $('hu-blad-knoppen').replaceChildren(
    ...buttons.map(([label, fn]) => {
      const b = el('button', { type: 'button', text: label });
      b.addEventListener('click', () => void fn());
      return b;
    }),
  );
  $('hu-blad').scrollIntoView({ block: 'nearest' });
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

async function loadLayoutInfo() {
  try {
    const res = await fetch('api/indeling');
    layoutInfo = res.ok ? await res.json() : null;
  } catch {
    layoutInfo = null;
  }
}

/** De indeling om te bewerken: de eigen, of anders het voorstel uit Home Assistant. */
function draft() {
  const base = layoutInfo?.indeling ?? layoutInfo?.voorstel;
  return base ? JSON.parse(JSON.stringify(base)) : null;
}

async function saveLayout(next, what) {
  try {
    const res = await fetch('api/indeling', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
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
      el('span', { class: 'small muted', id: 'hu-bewerk-status', 'aria-live': 'polite' }),
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
    parts.push(el('div', { class: 'groep', text: 'NOG IN TE DELEN' }));
    const rooms = [['', 'Kies een kamer…'], ...d.kamers.map((k) => [k.id, `${k.naam} (${floorName(d, k.etage)})`])];
    for (const dev of homeless) {
      parts.push(
        el(
          'div',
          { class: 'rij' },
          el('span', { style: 'flex: 1; min-width: 0' }, el('b', { text: dev.naam }), dev.voorstel ? el('span', { class: 'small muted', text: ` · in Home Assistant: ${dev.voorstel}` }) : null),
          select(rooms, '', `Kamer voor ${dev.naam}`, async (kamer) => {
            if (!kamer) return;
            const next = draft();
            next.apparaten[dev.id] = { ...(next.apparaten[dev.id] ?? {}), kamer, zone: null };
            await saveLayout(next, `${dev.naam}`);
          }),
        ),
      );
    }
  }
  return parts;
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
  return parts;
}

/** Een apparaat hernoemen en verplaatsen, in het blad onder de tegels. */
function editDevice(room, dev) {
  const d = draft();
  if (!d) return;
  $('hu-blad').hidden = false;
  $('hu-blad-naam').textContent = dev.naam;
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
