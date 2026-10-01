/**
 * De weergave.
 *
 * Één regel bepaalt alles hieronder: **hier wordt niets uitgerekend.** Elk
 * getal en elke reden komt uit het `Explanation`-object dat de kern heeft
 * meegegeven. Wat hier wel gebeurt is vertalen — een reasoncode naar een
 * Nederlandse zin — en dat is presentatie, geen logica.
 *
 * Dat onderscheid is de reden dat dit bestand bestaat in plaats van het oude
 * dashboard: dat had ~500 regels JS die de state machine dupliceerden, en liep
 * daardoor uiteen met de regeling die het heette te tonen.
 */

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- vertalen */

const MODE_LABEL = {
  dag: 'Dag',
  nacht: 'Nacht',
  voorverwarmen: 'Voorverwarmen',
  afwezig: 'Afwezig',
  vakantie: 'Vakantie',
  handmatig: 'Handmatig',
};

const MODE_NOTE = {
  handmatig: 'De bewoner heeft overgenomen. De arbiter blijft overal vanaf.',
  nacht: 'Niets te doen betekent hier: de assist-apparaten mogen uit.',
  vakantie: 'Alleen vorstbescherming; de assist-apparaten blijven uit.',
};

const REASON_LABEL = {
  zone_below_setpoint: 'onder het setpoint',
  zone_above_setpoint: 'boven het setpoint',
  zone_satisfied: 'op temperatuur',
  buffering_free_energy: 'buffert gratis stroom',
  surplus_available: 'er is overschot',
  surplus_insufficient: 'te weinig overschot',
  importing_from_grid: 'het huis koopt stroom',
  outside_active_hours: 'buiten de actieve uren',
  mode_excludes_action: 'past niet bij deze modus',
  nobody_home: 'niemand thuis',
  failsafe_unreliable_input: 'meetpunt onbetrouwbaar',
};

const BLOCK_LABEL = {
  min_run_not_elapsed: 'minimale draaitijd nog niet om',
  min_rest_not_elapsed: 'minimale rusttijd nog niet om',
  stabilisation_active: 'stabiliseert nog',
  settling_after_switch: 'komt tot rust na een wissel',
  insufficient_power_budget: 'te weinig budget',
  start_threshold_not_met: 'wacht op genoeg zon om te starten',
  capability_missing: 'apparaat kan dit niet',
  setpoint_out_of_range: 'setpoint buiten bereik',
  superseded_by_higher_priority: 'een hogere prioriteit ging voor',
  no_change_needed: 'geen wijziging nodig',
};

const ACTION_LABEL = { heat: 'verwarmen', cool: 'koelen', standby: 'standby', off: 'uit' };

const QUESTION_STYLE = {
  heat: { rand: 'border-warm/40', tekst: 'text-warm', label: 'verwarmen' },
  cool: { rand: 'border-koel/40', tekst: 'text-koel', label: 'koelen' },
  none: { rand: 'border-rand', tekst: 'text-rust', label: 'geen vraag' },
};

/* -------------------------------------------------------------- opmaken */

const watt = (w) => `${Math.round(w).toLocaleString('nl-NL')} W`;
const degrees = (c) => (c == null ? '—' : `${c.toFixed(1)} °C`);

const clock = (ms) =>
  new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Losse elementen bouwen is korter dan innerHTML, en kan niets injecteren. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------- tekenen */

let site = null;

const zoneName = (id) => site?.zones.find((z) => z.id === id)?.name ?? id;
const actuatorName = (id) => site?.actuators.find((a) => a.id === id)?.name ?? id;

function renderMode(e) {
  $('modus').textContent = MODE_LABEL[e.mode] ?? e.mode;
  $('modus-bron').textContent =
    e.modeSource === 'override' ? 'handmatig gekozen' : 'volgens het dagritme';
  const extra = MODE_NOTE[e.mode];
  $('bezet').textContent = extra ?? (e.occupied ? 'Er is iemand thuis.' : 'Niemand thuis.');
}

function renderBudget(b, panelsW) {
  /*
   * De stroom zoals hij loopt: panelen → huis → net.
   *
   * Het verbruik van het huis staat nergens als sensor; het volgt uit de twee
   * die er wél zijn. Levert het dak 1.200 W en gaat er 368 W het net op, dan
   * verbruikt het huis 832 W. Koopt het huis 430 W bij nul opbrengst, dan
   * verbruikt het 430 W. Beide gevallen zijn dezelfde optelsom.
   */
  const knowsPanels = panelsW != null;
  $('tegel-panelen').hidden = !knowsPanels;
  $('tegel-verbruik').hidden = !knowsPanels;
  if (knowsPanels) {
    $('budget-panelen').textContent = watt(panelsW);
    $('budget-verbruik').textContent = watt(Math.max(0, panelsW + b.gridPowerW));
  }

  const net = $('budget-net');
  net.textContent = watt(Math.abs(b.gridPowerW));
  // Teruglevering is de goede kant op; import kost geld. Dat verschil hoort
  // zichtbaar te zijn zonder het getal te hoeven lezen.
  net.className = `meting text-lg font-medium ${b.gridPowerW < 0 ? 'text-goed' : 'text-warm'}`;

  // Wat de arbiter daarvan mag uitgeven: de teruglevering, plus wat zijn eigen
  // apparaten nu al trekken (die kopen zichzelf elke ronde opnieuw), plus de
  // kleine import die we goedkoper vinden dan een herstart.
  $('budget-beschikbaar').textContent = watt(b.availableW);
  $('budget-toegewezen').textContent = watt(b.allocatedW);

  const share = b.availableW > 0 ? Math.min(100, (b.allocatedW / b.availableW) * 100) : 0;
  $('budget-balk').style.width = `${share}%`;
  $('budget-uitleg').textContent =
    b.gridPowerW < 0
      ? `Het huis levert ${watt(-b.gridPowerW)} terug; dat is het overschot waar de arbiter mee rekent.`
      : `Het huis koopt ${watt(b.gridPowerW)}; er is geen overschot.`;
}

function renderOutdoor(e) {
  // Waarnemingen en geen invoer: ze worden vastgelegd voor fase 7, de arbiter
  // gebruikt ze niet. Daarom klein en terzijde.
  $('buiten').textContent =
    e.outdoorTemperatureC == null
      ? ''
      : `buiten ${degrees(e.outdoorTemperatureC)} · wordt vastgelegd, nog niet gebruikt`;
}

function renderZones(perZone) {
  const target = $('zones');
  target.replaceChildren();

  for (const z of perZone) {
    const style = QUESTION_STYLE[z.demand] ?? QUESTION_STYLE.none;
    const card = el('div', `bg-paneel rounded-lg border p-4 ${style.rand}`);

    card.append(el('div', 'text-zacht text-xs uppercase tracking-wide', zoneName(z.zoneId)));

    const row = el('div', 'mt-1 flex items-baseline gap-2');
    row.append(el('span', 'meting text-2xl font-semibold', degrees(z.temperatureC)));
    if (z.targetC != null) {
      row.append(el('span', 'text-zacht meting text-sm', `doel ${degrees(z.targetC)}`));
    }
    card.append(row);

    card.append(el('div', `mt-2 text-sm font-medium ${style.tekst}`, style.label));
    card.append(el('div', 'text-zacht mt-0.5 text-xs', REASON_LABEL[z.reason] ?? z.reason));
    target.append(card);
  }
}

/**
 * Wat er zou gebeuren, per apparaat.
 *
 * Naast elkaar: wat het apparaat nú doet volgens Home Assistant, en wat de
 * arbiter zou sturen. Dat tweede is leeg wanneer hij niets zou wijzigen, en
 * dat is een uitkomst en geen gat.
 */
function renderActuators(snapshot) {
  const target = $('apparaten');
  target.replaceChildren();

  const wanted = new Map();
  for (const c of snapshot.commands) {
    if (c.kind === 'setAction') wanted.set(c.actuatorId, ACTION_LABEL[c.action] ?? c.action);
    if (c.kind === 'setSetpoint') {
      const earlier = wanted.get(c.actuatorId);
      const setpoint = `${c.setpointC.toFixed(1)} °C`;
      wanted.set(c.actuatorId, earlier ? `${earlier} op ${setpoint}` : `setpoint ${setpoint}`);
    }
  }

  const ids = site ? site.actuators.map((a) => a.id) : Object.keys(snapshot.observed);
  for (const id of ids) {
    const row = el('div', 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3');
    row.append(el('span', 'font-medium', actuatorName(id)));

    const right = el('div', 'flex items-baseline gap-3 text-sm');
    right.append(el('span', 'text-zacht meting', `nu: ${snapshot.observed[id] ?? 'onbekend'}`));

    const wish = wanted.get(id);
    right.append(
      wish
        ? el('span', 'text-zon font-medium', `zou sturen: ${wish}`)
        : el('span', 'text-rust', 'zou niets wijzigen'),
    );
    row.append(right);
    target.append(row);
  }

  $('geen-commando').textContent =
    snapshot.commands.length === 0
      ? 'De arbiter zou op dit moment niets sturen.'
      : `${snapshot.commands.length} commando${snapshot.commands.length === 1 ? '' : "'s"} — die gaan naar het logboek, niet naar Home Assistant.`;
}

function renderBlocked(rejected) {
  // `no_change_needed` is geen blokkade maar de normale gang van zaken; die
  // elke keer tonen maakt de lijst betekenisloos.
  const real = rejected.filter((r) => r.blockedBy !== 'no_change_needed');
  $('geblokkeerd-sectie').hidden = real.length === 0;

  const target = $('geblokkeerd');
  target.replaceChildren();
  for (const r of real) {
    const row = el('li', 'flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2 text-sm');
    row.append(
      el(
        'span',
        '',
        `${actuatorName(r.intent.actuatorId)} — ${ACTION_LABEL[r.intent.action] ?? r.intent.action}`,
      ),
    );
    row.append(el('span', 'text-zacht', BLOCK_LABEL[r.blockedBy] ?? r.blockedBy));
    target.append(row);
  }
}

function renderFailsafe(failsafe) {
  $('failsafe').hidden = !failsafe.active;
  const list = $('failsafe-lijst');
  list.replaceChildren();
  for (const id of failsafe.unreliable) list.append(el('li', 'text-zacht', id));
}

function renderLegacy(legacy) {
  const section = $('oud-sectie');
  section.hidden = legacy == null;
  if (legacy == null) return;
  // De uitleg van het oude systeem is HTML met <br> en &emsp;. Als tekst tonen
  // en zelf de regels breken: nooit vreemde opmaak in onze pagina inbrengen.
  const flat = legacy
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&emsp;/g, '  ')
    .replace(/&nbsp;/g, ' ');
  const node = $('oud');
  node.replaceChildren();
  node.append(el('pre', 'whitespace-pre-wrap font-sans', flat.trim()));
}

function render(snapshot) {
  renderMode(snapshot.explanation);
  renderBudget(snapshot.explanation.budget, snapshot.explanation.solarProductionW);
  renderOutdoor(snapshot.explanation);
  renderZones(snapshot.explanation.perZone);
  renderActuators(snapshot);
  renderBlocked(snapshot.rejected);
  renderFailsafe(snapshot.explanation.failsafe);
  renderLegacy(snapshot.legacy);

  $('besluit-tijd').textContent = `besluit van ${clock(snapshot.atMs)} · ${snapshot.trigger}`;

  // Vanaf hier is er iets te zien. De wachtregel mag weg en blijft weg: een
  // volgend besluit maakt het niet leger.
  $('wachten').hidden = true;
  $('inhoud').hidden = false;
}

/* -------------------------------------------------------------- verbinden */

function showConnection(text, cssClass) {
  const node = $('verbinding');
  node.textContent = text;
  node.className = `text-sm ${cssClass}`;
}

async function loadSite() {
  try {
    site = await (await fetch('api/site')).json();
    $('installatie').textContent =
      `Installatie ${site.id} · ${site.zones.length} zones · ${site.actuators.length} apparaten` +
      (site.migrating ? ' · vergelijking met het oude systeem loopt' : '');
  } catch {
    // Namen zijn een verfraaiing; zonder de site tonen we gewoon de id's.
  }
}

function follow() {
  const source = new EventSource('api/events');

  source.onopen = () => showConnection('verbonden', 'text-goed');
  source.onmessage = (event) => {
    showConnection('verbonden', 'text-goed');
    render(JSON.parse(event.data));
  };
  // EventSource herverbindt zelf. Dat hoeven we niet na te bouwen; we moeten
  // het alleen eerlijk tonen, anders staat er een stand die niet meer leeft.
  source.onerror = () => showConnection('verbinding kwijt — opnieuw proberen…', 'text-alarm');
}

/* ------------------------------------------------------- terugblik ------ */

/*
 * De terugblik komt uit de logboeken en niet uit het besluit van dit moment.
 * Dat is een andere waarheid met een ander tempo: de arbiter beslist elke
 * dertig seconden, deze analyse draait elk kwartier. Vandaar een eigen sectie
 * met een eigen "berekend op" — een cijfer zonder houdbaarheidsdatum naast een
 * live stand zetten is misleidend.
 */

/** Tekencode uit het rapport naar naam en kleur. Eén plek. */
const CELL = {
  ' ': { naam: 'geen opname', kleur: 'transparent' },
  '·': { naam: 'beide uit', kleur: 'var(--color-beide-uit)' },
  '=': { naam: 'eens, draait', kleur: 'var(--color-eens)' },
  '+': { naam: 'ik zou draaien', kleur: 'var(--color-ruimer)' },
  '!': { naam: 'ik zou stoppen', kleur: 'var(--color-strenger)' },
  X: { naam: 'failsafe', kleur: 'var(--color-storing)' },
};

const kwh = (wh) =>
  `${(wh / 1000).toLocaleString('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kWh`;

const pct = (share, whole) =>
  whole === 0 ? '—' : `${((share / whole) * 100).toFixed(1)}%`;

const timeSlot = (i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;

/**
 * Eén dagrij als SVG.
 *
 * Aaneengesloten gelijke tijdvakken worden één rechthoek. Een winter is 180
 * dagen van 96 vakjes; als losse elementen zijn dat er zeventienduizend, en dan
 * wordt de pagina traag om iets te tonen dat vrijwel altijd uit lange gelijke
 * stukken bestaat. Samengevoegd blijven het er een paar honderd.
 */
function dayRow(states) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 96 10');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('height', '14');
  svg.style.display = 'block';
  svg.style.width = '100%';

  let i = 0;
  while (i < 96) {
    const code = states[i];
    let end = i;
    while (end + 1 < 96 && states[end + 1] === code) end++;
    const cell = CELL[code] ?? CELL[' '];

    if (cell.kleur !== 'transparent') {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(i));
      r.setAttribute('y', '0');
      // 0,12 lucht houdt de blokken los zonder een gat te suggereren.
      r.setAttribute('width', String(end - i + 1 - 0.12));
      r.setAttribute('height', '10');
      r.setAttribute('fill', cell.kleur);
      r.setAttribute('rx', '1');
      r.dataset.uitleg = `${timeSlot(i)}–${timeSlot(Math.min(end + 1, 96))} · ${cell.naam}`;
      svg.append(r);
    }
    i = end + 1;
  }
  return svg;
}

/**
 * Per dag de starts waarop de versie of de configuratie veranderde (besluit 66).
 * Een herstart met dezelfde versie en configuratie is geen markering waard.
 */
function versionChangesPerDay(versions) {
  const out = new Map();
  let previous = null;
  for (const v of versions ?? []) {
    const changed = previous == null || v.commit !== previous.commit || v.config !== previous.config;
    previous = v;
    if (!changed) continue;
    const d = new Date(v.tMs);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!out.has(day)) out.set(day, []);
    out.get(day).push(v);
  }
  return out;
}

function renderTimeline(days, versions) {
  const changes = versionChangesPerDay(versions);
  const target = $('tijdlijn');
  target.replaceChildren();

  // Uurmarkering boven de rijen, anders weet je niet waar de middag ligt.
  const heading = el('div', 'text-zacht mb-1 flex text-[10px]');
  heading.append(el('div', 'w-20 shrink-0'));
  const scale = el('div', 'relative h-3 flex-1');
  for (let u = 0; u < 24; u += 3) {
    const m = el('span', 'meting absolute', `${String(u).padStart(2, '0')}u`);
    m.style.left = `${(u / 24) * 100}%`;
    scale.append(m);
  }
  heading.append(scale);
  target.append(heading);

  const rows = el('div', 'space-y-[3px]');
  for (const { day, states } of days) {
    const row = el('div', 'flex items-center gap-2');
    row.append(el('div', 'text-zacht meting w-20 shrink-0 text-[11px]', day));
    const holder = el('div', 'min-w-0 flex-1');
    holder.append(dayRow(states));
    row.append(holder);
    // Vanaf hier besliste een andere versie of configuratie.
    const started = changes.get(day) ?? [];
    const mark = el('div', 'text-zacht meting w-16 shrink-0 truncate text-[10px]');
    if (started.length > 0) {
      const last = started[started.length - 1];
      mark.textContent = `▲ ${last.commit}`;
      mark.title = started
        .map((v) => {
          const time = new Date(v.tMs).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
          return `${time} versie ${v.commit}, configuratie ${v.config}${v.bron ? ` (uit ${v.bron})` : ''}`;
        })
        .join('\n');
    }
    row.append(mark);
    rows.append(row);
  }
  target.append(rows);

  // Legenda: identiteit mag nooit alleen aan kleur hangen.
  const legend = $('tijdlijn-legenda');
  legend.replaceChildren();
  for (const code of ['·', '=', '+', '!', 'X']) {
    const cell = CELL[code];
    const item = el('span', 'flex items-center gap-1.5');
    const block = el('span', 'inline-block h-3 w-3 rounded-sm');
    block.style.background = cell.kleur;
    item.append(block, el('span', 'text-zacht', cell.naam));
    legend.append(item);
  }

  // Aanwijzen geeft het tijdvak. Zonder dit is een blokje van drie pixels
  // mooi maar onleesbaar.
  const tip = $('tijdlijn-tip');
  target.addEventListener('pointermove', (e) => {
    tip.textContent = e.target?.dataset?.uitleg ?? '';
  });
  target.addEventListener('pointerleave', () => {
    tip.textContent = '';
  });
}

function renderBars(tallies) {
  const target = $('balken');
  target.replaceChildren();

  const SEGMENTS = [
    ['agree', '=', 'eens'],
    ['stricter', '!', 'ik zou stoppen'],
    ['looser', '+', 'ik zou draaien'],
  ];

  for (const t of tallies) {
    const total = t.agree + t.stricter + t.looser;
    if (total === 0) continue;
    const row = el('div');

    const heading = el('div', 'mb-1 flex items-baseline justify-between gap-2 text-sm');
    heading.append(el('span', 'font-medium', actuatorName(t.actuatorId)));
    heading.append(el('span', 'text-zacht meting text-xs', `${pct(t.agree, total)} eens`));
    row.append(heading);

    // Gestapeld, met 2px lucht ertussen zodat de segmenten niet in elkaar
    // overlopen.
    const bar = el('div', 'flex h-3 gap-[2px] overflow-hidden rounded-full');
    for (const [key, code, name] of SEGMENTS) {
      const n = t[key];
      if (n === 0) continue;
      const share = el('div', 'h-full first:rounded-l-full last:rounded-r-full');
      share.style.width = `${(n / total) * 100}%`;
      share.style.background = CELL[code].kleur;
      share.title = `${name}: ${n.toLocaleString('nl-NL')} momenten`;
      bar.append(share);
    }
    row.append(bar);

    // De cijfers erbij, want een balk alleen laat je schatten.
    const below = el('div', 'text-zacht meting mt-1 flex flex-wrap gap-x-4 text-xs');
    for (const [key, , name] of SEGMENTS) {
      below.append(el('span', '', `${t[key].toLocaleString('nl-NL')} ${name}`));
    }
    row.append(below);

    target.append(row);
  }
}

function renderEpisodes(r) {
  const target = $('episodes');
  target.replaceChildren();

  for (const e of r.episodes) {
    const li = el('li', 'px-4 py-3');
    const heading = el('div', 'flex flex-wrap items-baseline justify-between gap-x-4 text-sm');
    const day = new Date(e.fromMs).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
    heading.append(
      el('span', 'font-medium', `${day} ${clock(e.fromMs).slice(0, 5)}–${clock(e.toMs).slice(0, 5)}`),
    );
    heading.append(
      el('span', 'text-zacht meting', `${e.minutes} min · ${actuatorName(e.actuatorId)}`),
    );
    li.append(heading);

    const stricter = e.direction === 'strenger';
    li.append(
      el(
        'div',
        `mt-0.5 text-xs ${stricter ? 'text-strenger' : 'text-ruimer'}`,
        (stricter ? 'oud draaide, ik zou stoppen' : 'oud stond uit, ik zou draaien') +
          (e.mode && e.mode !== 'onbekend' ? ` · modus ${e.mode}` : ''),
      ),
    );
    if (e.blockedBy) {
      li.append(
        el(
          'div',
          'text-zacht mt-0.5 text-xs',
          `mijn reden: ${BLOCK_LABEL[e.blockedBy] ?? e.blockedBy}`,
        ),
      );
    }
    target.append(li);
  }

  const rest = r.episodesTotaal - r.episodes.length;
  $('episodes-rest').textContent =
    rest > 0 ? `… en nog ${rest} kortere.` : `${r.episodesTotaal} afwijkingen in totaal.`;
  $('episodes-blok').hidden = r.episodesTotaal === 0;
}

function renderReview(r) {
  const agreed = r.tallies.reduce((n, t) => n + t.agree, 0);
  const total = r.tallies.reduce((n, t) => n + t.agree + t.stricter + t.looser, 0);
  const days = (r.totMs - r.vanMs) / 86400000;

  $('stat-eens').textContent = pct(agreed, total);
  $('stat-eens-sub').textContent = `over ${days.toFixed(1)} dagen · ${r.momenten.toLocaleString('nl-NL')} momenten`;

  $('stat-stroom').textContent = kwh(r.legacyGridWh);
  $('stat-vermeden').textContent = kwh(r.avoidableGridWh);
  $('stat-vermeden-sub').textContent = `${pct(r.avoidableGridWh, r.legacyGridWh)} van wat het oude systeem besteedde`;

  renderTimeline(r.dagen, r.versies);
  renderPatterns(r.patronen ?? []);
  renderBars(r.tallies);
  renderEpisodes(r);
  renderDataset(r.dataset);

  const ageMinutes = Math.round((Date.now() - r.berekendOpMs) / 60000);
  $('terugblik-vers').textContent =
    `berekend ${ageMinutes <= 1 ? 'zojuist' : `${ageMinutes} min geleden`} · ${r.duurMs} ms over ${r.bestanden} dagbestanden` +
    // Sinds besluit 63 zit de rest in de tussenstand; ontbreekt het veld, dan
    // komt het antwoord van een oudere dienst.
    (r.opnieuwGelezen != null && r.opnieuwGelezen < r.bestanden
      ? `, waarvan ${r.opnieuwGelezen} gelezen`
      : '');

  $('terugblik-inhoud').hidden = false;
}

async function loadReview() {
  try {
    const res = await fetch('api/divergence');
    if (res.ok) {
      renderReview(await res.json());
      return;
    }
    // 503 betekent "staat uit" of "nog niet gerekend". Bij het eerste hoort de
    // sectie te verdwijnen, bij het tweede hoort er iets te staan.
    const { wachten: waiting } = await res.json();
    $('terugblik-vers').textContent =
      waiting === 'nog niet doorgerekend'
        ? 'de logboeken worden nog doorgerekend…'
        : 'de logboekanalyse staat uit op deze installatie.';
  } catch (error) {
    // Geen terugblik is geen reden om de live stand te verbergen — maar
    // stilzwijgend niets tonen is erger dan een lege sectie. Een fout hoort
    // ergens te landen waar je hem kunt vinden (besluit 7).
    console.error('[terugblik] tekenen mislukt', error);
    $('terugblik-vers').textContent = 'de terugblik kon niet worden getoond.';
  }
}

/* ------------------------------------------------------------- tabs ---- */

/*
 * Twee panelen, één zichtbaar.
 *
 * De keuze wordt onthouden. Wie het dashboard openhoudt om de terugblik te
 * volgen, wil na een herlaadbeurt niet elke keer terug naar "Nu" — en wie
 * alleen de huidige stand wil zien, wil geen tabel van vijf dagen.
 */
const TABS = [
  ['tab-live', 'paneel-live'],
  ['tab-terugblik', 'paneel-terugblik'],
  ['tab-installatie', 'paneel-installatie'],
];

/** Welke tabs er werkelijk zijn. De installatie bestaat lang niet altijd. */
const visibleTabs = () => TABS.filter(([tabId]) => !$(tabId).hidden);

function selectTab(activeId) {
  for (const [tabId, panelId] of TABS) {
    const active = tabId === activeId;
    $(tabId).setAttribute('aria-selected', String(active));
    $(panelId).hidden = !active;
  }
  try {
    localStorage.setItem('hems-tab', activeId);
  } catch {
    // Een browser die opslag weigert is geen reden om de tab niet te wisselen.
  }
}

function enableTabs() {
  for (const [tabId] of TABS) {
    $(tabId).addEventListener('click', () => selectTab(tabId));
    // Pijltjes horen bij een tablist; anders kom je er met het toetsenbord
    // niet uit. Over de zichtbare tabs, want een verborgen tab overslaan is
    // wat je verwacht.
    $(tabId).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const list = visibleTabs();
      const i = list.findIndex(([id]) => id === tabId);
      if (i < 0) return;
      const next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length][0];
      selectTab(next);
      $(next).focus();
    });
  }
  let remembered = null;
  try {
    remembered = localStorage.getItem('hems-tab');
  } catch {
    remembered = null;
  }
  selectTab(visibleTabs().some(([id]) => id === remembered) ? remembered : 'tab-live');
}

/* ---------------------------------------------------------- dataset ---- */

const SEASON_NAME = {
  winter: 'Winter',
  lente: 'Lente',
  zomer: 'Zomer',
  herfst: 'Herfst',
};

/** Wat een ontbrekend onderdeel betekent, in gewone taal. */
const WHY = {
  vakantie: 'de vakantiestand is nog nooit aangezet',
  'heat-assist': 'heat-assist is nog nooit afgegaan — de Nest meldde nooit dat hij brandt',
  heat: 'er is nog nooit een verwarmingscommando uitgegaan',
  zone_below_setpoint: 'een zone is nog nooit ónder zijn doel geweest',
  buffering_free_energy: 'er is nog nooit gebufferd op gratis stroom',
  nobody_home: 'de regeling heeft nog nooit op een leeg huis gereageerd',
  failsafe_unreliable_input: 'de failsafe is nog nooit afgegaan',
  outside_active_hours: 'de vensterbegrenzing is nog nooit geraakt',
  mode_excludes_action: 'een modus heeft nog nooit iets uitgesloten',
  importing_from_grid: 'er is nog nooit afgeschaald op inkoop',
  surplus_insufficient: 'te weinig overschot is nog nooit als reden opgegeven',
  surplus_available: 'overschot is nog nooit als reden opgegeven',
  zone_above_setpoint: 'een zone is nog nooit boven zijn doel geweest',
  zone_satisfied: 'een zone is nog nooit op temperatuur geweest',
};

const COVERAGE_TITLE = {
  modi: 'Modi',
  strategieen: 'Strategieën',
  richtingen: 'Richtingen',
  zoneRedenen: 'Redenen per zone',
  blokkades: 'Blokkades',
};

function seasonCard(s) {
  const card = el('div');
  const heading = el('div', 'flex items-baseline justify-between gap-2');
  heading.append(el('span', 'text-xs font-medium', SEASON_NAME[s.seizoen] ?? s.seizoen));
  const days = s.dagen >= 10 ? Math.round(s.dagen) : Math.round(s.dagen * 10) / 10;
  heading.append(
    el('span', 'text-zacht meting text-xs', `${days.toLocaleString('nl-NL')}/${s.doel}`),
  );
  card.append(heading);

  const track = el('div', 'bg-grond mt-1 h-1.5 overflow-hidden rounded-full');
  const fill = el('div', 'h-full rounded-full transition-all duration-500');
  const share = Math.min(1, s.doel === 0 ? 1 : s.dagen / s.doel);
  fill.style.width = `${share * 100}%`;
  // Vol is groen, onderweg is blauw, leeg blijft leeg. Kleur alleen als
  // versterking: het getal ernaast zegt hetzelfde.
  fill.style.background = share >= 1 ? 'var(--color-eens)' : 'var(--color-ruimer)';
  track.append(fill);
  card.append(track);
  return card;
}

/** Chips voor wat nog nooit is langsgekomen. */
function renderGaps(d) {
  const target = $('dataset-gaten');
  target.replaceChildren();

  // Alleen de functionele dekking: modi, strategieën en richtingen. Precies
  // waar het percentage hierboven mee rekent, en precies wat je zelf kunt
  // uitlokken door de knop om te zetten of te wachten op het seizoen.
  //
  // De reden- en blokkadecodes horen niet in deze rij: sommige daarvan hóren
  // zeldzaam te zijn (`setpoint_out_of_range` is een fout), en twaalf chips
  // waarvan de helft ruis is, leest niemand. Die staan in de uitklap.
  const missing = [d.modi, d.strategieen, d.richtingen].flatMap((list) =>
    list.filter((x) => x.deel < 1),
  );

  if (missing.length === 0 && d.ontbrekendeInvoer.length === 0) {
    target.append(
      el('p', 'text-eens text-xs', 'Elk onderdeel van de regeling is minstens één keer afgegaan.'),
    );
    return;
  }

  target.append(
    el(
      'h3',
      'text-zacht mb-2 text-xs font-medium tracking-wide uppercase',
      'Nog niet afgegaan',
    ),
  );

  const row = el('div', 'flex flex-wrap gap-2');
  for (const x of missing) {
    const chip = el(
      'span',
      'border-rand bg-grond text-zacht rounded-full border px-2.5 py-1 text-xs',
    );
    // Half betekent: één dag gezien. Dat is waargenomen en niet aangetoond,
    // dus een eigen teken — anders lijkt het óf af óf nooit gebeurd.
    const halfShare = x.deel === 0.5;
    chip.append(el('span', halfShare ? 'text-zon' : 'text-strenger', halfShare ? '◑ ' : '○ '));
    chip.append(document.createTextNode(x.id));
    const why = halfShare
      ? `één dag gezien; twee losse dagen nodig om mee te tellen`
      : WHY[x.id];
    if (why) chip.title = why;
    row.append(chip);
    // De uitleg erbij, want "heat" zegt op zichzelf niets. Bij drie chips past
    // dat; bij twaalf zou het een muur worden — vandaar de inperking hierboven.
    if (why && missing.length <= 4) {
      row.append(el('span', 'text-zacht w-full text-xs sm:w-auto sm:pt-1.5', why));
    }
  }
  target.append(row);

  // Ontbrekende invoer is een andere klasse: die komt niet vanzelf goed door
  // langer te wachten. Daarom apart en met de reden erbij.
  for (const inv of d.ontbrekendeInvoer) {
    target.append(
      el(
        'p',
        'text-strenger mt-2 text-xs',
        `Wordt niet vastgelegd: ${inv.id} — ${inv.waarvoor}`,
      ),
    );
  }
}

function coverageTable(title, list) {
  const block = el('div');
  block.append(
    el('h4', 'text-zacht mb-1 text-xs font-medium tracking-wide uppercase', title),
  );
  const ul = el('ul', 'space-y-0.5');
  for (const x of list) {
    const li = el('li', 'flex items-baseline justify-between gap-2 text-xs');
    const render = x.deel === 1 ? '● ' : x.deel === 0.5 ? '◑ ' : '○ ';
    const color = x.deel === 1 ? 'text-eens' : x.deel === 0.5 ? 'text-zon' : 'text-strenger';
    const name = el('span', x.deel > 0 ? '' : 'text-zacht');
    name.append(el('span', color, render));
    name.append(document.createTextNode(x.id));
    li.append(name);
    // De dagen zijn wat telt; het aantal momenten staat erachter als maat voor
    // hoe vaak het speelde.
    li.append(
      el(
        'span',
        'text-zacht meting',
        x.dagen === 0
          ? '—'
          : `${x.dagen} ${x.dagen === 1 ? 'dag' : 'dagen'} · ${x.gezien.toLocaleString('nl-NL')}×`,
      ),
    );
    ul.append(li);
  }
  block.append(ul);
  return block;
}

function renderDataset(d) {
  if (d == null) return;

  // Eén getal is te weinig: het komt uit twee assen die allebei noodzakelijk
  // zijn, en zonder die twee erbij leest 22% als "bijna een kwart klaar"
  // terwijl er geen enkele winterdag in zit.
  $('dataset-pct').textContent = `${d.gereedheid.totaal}%`;
  $('dataset-balk').style.width = `${d.gereedheid.totaal}%`;
  $('dataset-assen').textContent =
    `tijd ${d.gereedheid.tijd}% · functiedekking ${d.gereedheid.dekking}%`;

  const from = new Date(d.vanMs).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const until = new Date(d.totMs).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  $('dataset-spanne').textContent = `${from} – ${until}`;

  const gaps =
    d.gatendagen.length === 0
      ? 'geen gaten'
      : `${d.gatendagen.length} ${d.gatendagen.length === 1 ? 'dag' : 'dagen'} zonder opname`;
  // Echte dagen, niet aangeraakte kalenderdagen: een opname die om vijf uur
  // 's middags begint levert die dag geen dag op.
  const touched =
    d.kalenderdagenAangeraakt > Math.ceil(d.dagenOpgenomen)
      ? ` (over ${d.kalenderdagenAangeraakt} kalenderdagen)`
      : '';
  $('dataset-samenvatting').textContent =
    `${d.dagenOpgenomen.toLocaleString('nl-NL')} dagen opgenomen${touched} · ${gaps} · ` +
    `${d.momenten.toLocaleString('nl-NL')} momenten`;

  const seasons = $('dataset-seizoenen');
  seasons.replaceChildren();
  for (const s of d.seizoenen) seasons.append(seasonCard(s));

  renderGaps(d);

  const tables = $('dataset-tabellen');
  tables.replaceChildren();
  for (const key of ['modi', 'strategieen', 'richtingen', 'zoneRedenen', 'blokkades']) {
    tables.append(coverageTable(COVERAGE_TITLE[key] ?? key, d[key]));
  }

  $('dataset').hidden = false;
}

/* --------------------------------------------------------- patronen ---- */

/**
 * Terugkerende afwijkingen.
 *
 * Losse episodes vertellen wat er die middag gebeurde; deze tabel vertelt waar
 * het stelselmatig misgaat. Gesorteerd op totale tijd en niet op aantal: twintig
 * hikjes van twee minuten wegen minder dan drie middagen van een uur.
 */
function renderPatterns(patterns) {
  const target = $('patronen');
  target.replaceChildren();
  $('patronen-blok').hidden = patterns.length === 0;

  for (const p of patterns) {
    const tr = el('tr');

    const what = el('td', 'px-4 py-2 align-top');
    const stricter = p.direction === 'strenger';
    const title = el('div', 'flex items-baseline gap-2');
    const dot = el('span', 'inline-block h-2 w-2 shrink-0 rounded-full');
    dot.style.background = stricter ? 'var(--color-strenger)' : 'var(--color-ruimer)';
    title.append(dot);
    title.append(
      el(
        'span',
        'font-medium',
        `${actuatorName(p.actuatorId)} — ${stricter ? 'ik zou stoppen' : 'ik zou draaien'}`,
      ),
    );
    what.append(title);
    const detail = [
      p.mode && p.mode !== 'onbekend' ? `modus ${p.mode}` : null,
      p.blockedBy ? BLOCK_LABEL[p.blockedBy] ?? p.blockedBy : null,
    ].filter(Boolean);
    if (detail.length > 0) {
      what.append(el('div', 'text-zacht mt-0.5 pl-4 text-xs', detail.join(' · ')));
    }
    tr.append(what);

    tr.append(el('td', 'meting px-2 py-2 text-right align-top', String(p.keren)));
    tr.append(el('td', 'meting px-2 py-2 text-right align-top', `${p.minuten} min`));
    tr.append(
      el('td', 'meting text-zacht px-2 py-2 text-right align-top', `${p.langsteMinuten} min`),
    );
    tr.append(
      el(
        'td',
        'meting px-4 py-2 text-right align-top',
        p.wh > 1 ? kwh(p.wh) : '—',
      ),
    );
    target.append(tr);
  }
}

/* --------------------------------------------------------------- starten */

enableTabs();
await loadSite();

// Eerst de huidige stand, zodat de pagina niet leeg blijft als er net geen
// besluit langskomt. Bij dertig seconden hartslag is dat lang genoeg om voor
// kapot door te gaan.
try {
  const res = await fetch('api/state');
  if (res.ok) render(await res.json());
  else showConnection('wacht op het eerste besluit…', 'text-zacht');
} catch {
  showConnection('geen verbinding met de dienst', 'text-alarm');
}

follow();

// De analyse draait op de dienst elk kwartier; vaker ophalen heeft geen zin.
// Wel meteen bij het openen, want daar komt iemand voor.
await loadReview();
setInterval(loadReview, 15 * 60_000);

/* ------------------------------------------------------ installatie ---- */

/*
 * De onboarding.
 *
 * Bestaat alleen wanneer de dienst hem aanbiedt, en dat doet hij alleen
 * achter Ingress (besluit 42). Op de NAS geeft `api/onboarding` een 503 en
 * blijft de tab weg — dat is geen fout maar de normale toestand daar.
 *
 * De pagina stelt de configuratie niet samen. Ze toont vragen die de dienst
 * heeft gesteld en stuurt de antwoorden terug; wat die betekenen staat in
 * `discovery.ts`. Anders zou de vorm van de configuratie op twee plekken
 * moeten kloppen.
 */

const BRANDS = {
  gevonden: ['gevonden', 'text-goed'],
  geraden: ['geraden', 'text-strenger'],
  overgeslagen: ['overgeslagen', 'text-zacht'],
  ontbreekt: ['ontbreekt', 'text-zacht'],
};

let proposalChoices = [];

function renderChoices(choices) {
  const target = $('onboarding-keuzes');
  target.replaceChildren();
  if (choices.length === 0) {
    target.append(
      el('p', 'text-zacht text-sm', 'Er is niets waar de ontdekking over twijfelt.'),
    );
    return;
  }

  for (const choice of choices) {
    const card = el('div', 'border-rand rounded-md border p-3');
    card.append(el('p', 'text-sm font-medium', choice.vraag));
    if (choice.toelichting) {
      card.append(el('p', 'text-zacht mt-1 text-xs', choice.toelichting));
    }

    const select = el('select', 'meting mt-2 w-full rounded-md border border-rand bg-grond p-2 text-sm');
    select.id = `keuze-${choice.id}`;
    if (choice.magLeeg) {
      const empty = el('option', null, 'geen van deze');
      empty.value = '';
      select.append(empty);
    }
    for (const option of choice.opties) {
      const o = el('option', null, option);
      o.value = option;
      if (option === choice.huidig) o.selected = true;
      select.append(o);
    }
    card.append(select);
    target.append(card);
  }
}

/** Eerst wat aandacht vraagt, dan wat klaar is. Zelfde volgorde als in de terminal. */
const ORDER = ['ontbreekt', 'geraden', 'gevonden', 'overgeslagen'];

function renderFindings(findings) {
  const target = $('onboarding-bevindingen');
  target.replaceChildren();
  const list = el('ul', 'grid gap-2 text-sm');
  const sorted = [...findings].sort(
    (a, b) => ORDER.indexOf(a.soort) - ORDER.indexOf(b.soort),
  );
  for (const b of sorted) {
    const [label, color] = BRANDS[b.soort] ?? ['?', 'text-zacht'];
    const line = el('li', 'flex gap-3');
    line.append(el('span', `${color} meting w-28 shrink-0 text-xs uppercase`, label));
    const right = el('div', 'min-w-0');
    right.append(el('p', null, b.tekst));
    if (b.alternatieven?.length) {
      right.append(
        el(
          'p',
          'text-zacht meting mt-0.5 text-xs break-all',
          `ook mogelijk: ${b.alternatieven.slice(0, 6).join(', ')}` +
            (b.alternatieven.length > 6 ? ` … en nog ${b.alternatieven.length - 6}` : ''),
        ),
      );
    }
    right.append(el('p', 'text-zacht meting text-xs', b.pad));
    line.append(right);
    list.append(line);
  }
  target.append(list);
}

function showOutcome(text, color) {
  const target = $('onboarding-uitkomst');
  target.replaceChildren(el('p', color, text));
  target.hidden = false;
}

async function saveInstallation() {
  const button = $('onboarding-bewaar');
  button.disabled = true;
  const answers = {};
  for (const choice of proposalChoices) {
    const value = $(`keuze-${choice.id}`).value;
    answers[choice.id] = value === '' ? null : value;
  }

  try {
    const res = await fetch('api/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ antwoorden: answers }),
    });
    const body = await res.json();
    if (body.ok) {
      showOutcome(
        `Geschreven naar ${body.pad}. Herstart de add-on om hem in gebruik te nemen.`,
        'text-goed',
      );
      button.hidden = true;
      return;
    }
    const target = $('onboarding-uitkomst');
    target.replaceChildren(el('p', 'text-alarm', body.reden ?? 'Opslaan mislukt.'));
    for (const p of body.problemen ?? []) {
      target.append(el('p', 'text-zacht meting mt-1 text-xs', p));
    }
    target.hidden = false;
  } catch (error) {
    showOutcome(`Opslaan mislukt: ${error}`, 'text-alarm');
  } finally {
    button.disabled = false;
  }
}

async function loadOnboarding() {
  let res;
  try {
    res = await fetch('api/onboarding');
  } catch {
    return; // geen dienst; de tab blijft weg
  }
  // 503 betekent: deze opstelling kent geen onboarding. Dat is de NAS, en daar
  // hoort geen tab te verschijnen die niets kan.
  if (!res.ok) return;

  $('tab-installatie').hidden = false;
  let proposal;
  try {
    proposal = await res.json();
  } catch (error) {
    $('onboarding-laden').hidden = true;
    $('onboarding-fout').textContent = `Het voorstel is niet te lezen: ${error}`;
    $('onboarding-fout').hidden = false;
    return;
  }

  proposalChoices = proposal.keuzes ?? [];
  renderChoices(proposalChoices);
  renderFindings(proposal.bevindingen ?? []);
  $('onboarding-laden').hidden = true;
  $('onboarding-inhoud').hidden = false;

  /*
   * Staat er al een configuratie, dan is er niets in te stellen.
   *
   * Het voorstel blijft staan — je mag zien wat de ontdekking van je huis
   * maakt — maar de knop verdwijnt. Hij zou toch weigeren, en een knop die
   * altijd weigert is erger dan geen knop.
   *
   * De aanleiding: de eerste versie schreef vrolijk een tweede bestand naast
   * het bestaande, waarna de dienst niet meer wist welke gold en niet meer
   * startte.
   */
  const existing = proposal.bestaande ?? [];
  if (existing.length > 0) {
    $('onboarding-bewaar').hidden = true;
    showOutcome(
      `Er staat al een configuratie (${existing.join(', ')}), dus hier valt niets ` +
        'in te stellen. Wil je opnieuw beginnen, verplaats dat bestand dan eerst.',
      'text-zacht',
    );
    return;
  }

  $('onboarding-bewaar').addEventListener('click', () => void saveInstallation());
}

await loadOnboarding();

/* ---------------------------------------------------------- exporteren ---- */

/*
 * De exportknop.
 *
 * Verschijnt alleen wanneer er werkelijk iets te halen valt: geen logboek
 * betekent een 503 van de dienst, en dan hoort er geen knop te staan die een
 * leeg bestand oplevert.
 *
 * De omvang staat erbij omdat het verschil tussen 3 MB en 300 MB bepaalt of je
 * hierop klikt terwijl je op je telefoon aan de andere kant van het land zit.
 */
function megabytes(bytes) {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.round(bytes / 1e6)} MB`;
}

async function loadExport() {
  let res;
  try {
    res = await fetch('api/export/info');
  } catch {
    return;
  }
  if (!res.ok) return;

  let info;
  try {
    info = await res.json();
  } catch {
    return;
  }
  if (!info.bestanden) return;

  const button = $('dataset-export');
  button.textContent = `Exporteren · ${info.bestanden} dagen, ${megabytes(info.bytes)}`;
  button.title = `${info.eerste} tot en met ${info.laatste}, als tar.gz`;
  button.hidden = false;
}

await loadExport();
// Elk kwartier bijwerken, in hetzelfde ritme als de analyse: de opname groeit
// door en een knop die een oude omvang toont is een knop die liegt.
setInterval(loadExport, 15 * 60_000);
