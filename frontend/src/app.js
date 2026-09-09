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

const MODUS = {
  dag: 'Dag',
  nacht: 'Nacht',
  voorverwarmen: 'Voorverwarmen',
  afwezig: 'Afwezig',
  vakantie: 'Vakantie',
  handmatig: 'Handmatig',
};

const MODUS_TOELICHTING = {
  handmatig: 'De bewoner heeft overgenomen. De arbiter blijft overal vanaf.',
  nacht: 'Niets te doen betekent hier: de assist-apparaten mogen uit.',
  vakantie: 'Alleen vorstbescherming; de assist-apparaten blijven uit.',
};

const REDEN = {
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

const GEBLOKKEERD = {
  min_run_not_elapsed: 'minimale draaitijd nog niet om',
  min_rest_not_elapsed: 'minimale rusttijd nog niet om',
  stabilisation_active: 'stabiliseert nog',
  settling_after_switch: 'komt tot rust na een wissel',
  insufficient_power_budget: 'te weinig budget',
  capability_missing: 'apparaat kan dit niet',
  setpoint_out_of_range: 'setpoint buiten bereik',
  superseded_by_higher_priority: 'een hogere prioriteit ging voor',
  no_change_needed: 'geen wijziging nodig',
};

const ACTIE = { heat: 'verwarmen', cool: 'koelen', standby: 'standby', off: 'uit' };

const VRAAG_STIJL = {
  heat: { rand: 'border-warm/40', tekst: 'text-warm', label: 'verwarmen' },
  cool: { rand: 'border-koel/40', tekst: 'text-koel', label: 'koelen' },
  none: { rand: 'border-rand', tekst: 'text-rust', label: 'geen vraag' },
};

/* -------------------------------------------------------------- opmaken */

const watt = (w) => `${Math.round(w).toLocaleString('nl-NL')} W`;
const graden = (c) => (c == null ? '—' : `${c.toFixed(1)} °C`);

const klok = (ms) =>
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

const naamVanZone = (id) => site?.zones.find((z) => z.id === id)?.name ?? id;
const naamVanActuator = (id) => site?.actuators.find((a) => a.id === id)?.name ?? id;

function tekenModus(e) {
  $('modus').textContent = MODUS[e.mode] ?? e.mode;
  $('modus-bron').textContent =
    e.modeSource === 'override' ? 'handmatig gekozen' : 'volgens het dagritme';
  const extra = MODUS_TOELICHTING[e.mode];
  $('bezet').textContent = extra ?? (e.occupied ? 'Er is iemand thuis.' : 'Niemand thuis.');
}

function tekenBudget(b) {
  $('budget-toegewezen').textContent = watt(b.allocatedW);
  $('budget-beschikbaar').textContent = watt(b.availableW);
  $('budget-overschot').textContent = watt(b.surplusW);

  const net = $('budget-net');
  net.textContent = watt(Math.abs(b.gridPowerW));
  // Teruglevering is de goede kant op; import kost geld. Dat verschil hoort
  // zichtbaar te zijn zonder het getal te hoeven lezen.
  net.className = `meting text-lg font-medium ${b.gridPowerW < 0 ? 'text-goed' : 'text-warm'}`;

  const deel = b.availableW > 0 ? Math.min(100, (b.allocatedW / b.availableW) * 100) : 0;
  $('budget-balk').style.width = `${deel}%`;
  $('budget-uitleg').textContent =
    b.gridPowerW < 0
      ? `Het huis levert ${watt(-b.gridPowerW)} terug.`
      : `Het huis koopt ${watt(b.gridPowerW)}.`;
}

function tekenBuiten(e) {
  // Waarneming en geen invoer: hij wordt vastgelegd voor fase 7, de arbiter
  // gebruikt hem niet. Daarom klein en terzijde.
  $('buiten').textContent =
    e.outdoorTemperatureC == null
      ? ''
      : `buiten ${graden(e.outdoorTemperatureC)} · wordt vastgelegd, nog niet gebruikt`;
}

function tekenZones(perZone) {
  const doel = $('zones');
  doel.replaceChildren();

  for (const z of perZone) {
    const stijl = VRAAG_STIJL[z.demand] ?? VRAAG_STIJL.none;
    const kaart = el('div', `bg-paneel rounded-lg border p-4 ${stijl.rand}`);

    kaart.append(el('div', 'text-zacht text-xs uppercase tracking-wide', naamVanZone(z.zoneId)));

    const rij = el('div', 'mt-1 flex items-baseline gap-2');
    rij.append(el('span', 'meting text-2xl font-semibold', graden(z.temperatureC)));
    if (z.targetC != null) {
      rij.append(el('span', 'text-zacht meting text-sm', `doel ${graden(z.targetC)}`));
    }
    kaart.append(rij);

    kaart.append(el('div', `mt-2 text-sm font-medium ${stijl.tekst}`, stijl.label));
    kaart.append(el('div', 'text-zacht mt-0.5 text-xs', REDEN[z.reason] ?? z.reason));
    doel.append(kaart);
  }
}

/**
 * Wat er zou gebeuren, per apparaat.
 *
 * Naast elkaar: wat het apparaat nú doet volgens Home Assistant, en wat de
 * arbiter zou sturen. Dat tweede is leeg wanneer hij niets zou wijzigen, en
 * dat is een uitkomst en geen gat.
 */
function tekenApparaten(snapshot) {
  const doel = $('apparaten');
  doel.replaceChildren();

  const gewenst = new Map();
  for (const c of snapshot.commands) {
    if (c.kind === 'setAction') gewenst.set(c.actuatorId, ACTIE[c.action] ?? c.action);
    if (c.kind === 'setSetpoint') {
      const eerder = gewenst.get(c.actuatorId);
      const setpoint = `${c.setpointC.toFixed(1)} °C`;
      gewenst.set(c.actuatorId, eerder ? `${eerder} op ${setpoint}` : `setpoint ${setpoint}`);
    }
  }

  const ids = site ? site.actuators.map((a) => a.id) : Object.keys(snapshot.observed);
  for (const id of ids) {
    const rij = el('div', 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3');
    rij.append(el('span', 'font-medium', naamVanActuator(id)));

    const rechts = el('div', 'flex items-baseline gap-3 text-sm');
    rechts.append(el('span', 'text-zacht meting', `nu: ${snapshot.observed[id] ?? 'onbekend'}`));

    const wens = gewenst.get(id);
    rechts.append(
      wens
        ? el('span', 'text-zon font-medium', `zou sturen: ${wens}`)
        : el('span', 'text-rust', 'zou niets wijzigen'),
    );
    rij.append(rechts);
    doel.append(rij);
  }

  $('geen-commando').textContent =
    snapshot.commands.length === 0
      ? 'De arbiter zou op dit moment niets sturen.'
      : `${snapshot.commands.length} commando${snapshot.commands.length === 1 ? '' : "'s"} — die gaan naar het logboek, niet naar Home Assistant.`;
}

function tekenGeblokkeerd(rejected) {
  // `no_change_needed` is geen blokkade maar de normale gang van zaken; die
  // elke keer tonen maakt de lijst betekenisloos.
  const echt = rejected.filter((r) => r.blockedBy !== 'no_change_needed');
  $('geblokkeerd-sectie').hidden = echt.length === 0;

  const doel = $('geblokkeerd');
  doel.replaceChildren();
  for (const r of echt) {
    const rij = el('li', 'flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2 text-sm');
    rij.append(
      el(
        'span',
        '',
        `${naamVanActuator(r.intent.actuatorId)} — ${ACTIE[r.intent.action] ?? r.intent.action}`,
      ),
    );
    rij.append(el('span', 'text-zacht', GEBLOKKEERD[r.blockedBy] ?? r.blockedBy));
    doel.append(rij);
  }
}

function tekenFailsafe(failsafe) {
  $('failsafe').hidden = !failsafe.active;
  const lijst = $('failsafe-lijst');
  lijst.replaceChildren();
  for (const id of failsafe.unreliable) lijst.append(el('li', 'text-zacht', id));
}

function tekenOud(legacy) {
  const sectie = $('oud-sectie');
  sectie.hidden = legacy == null;
  if (legacy == null) return;
  // De uitleg van het oude systeem is HTML met <br> en &emsp;. Als tekst tonen
  // en zelf de regels breken: nooit vreemde opmaak in onze pagina inbrengen.
  const plat = legacy
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&emsp;/g, '  ')
    .replace(/&nbsp;/g, ' ');
  const node = $('oud');
  node.replaceChildren();
  node.append(el('pre', 'whitespace-pre-wrap font-sans', plat.trim()));
}

function teken(snapshot) {
  tekenModus(snapshot.explanation);
  tekenBudget(snapshot.explanation.budget);
  tekenBuiten(snapshot.explanation);
  tekenZones(snapshot.explanation.perZone);
  tekenApparaten(snapshot);
  tekenGeblokkeerd(snapshot.rejected);
  tekenFailsafe(snapshot.explanation.failsafe);
  tekenOud(snapshot.legacy);

  $('besluit-tijd').textContent = `besluit van ${klok(snapshot.atMs)} · ${snapshot.trigger}`;

  // Vanaf hier is er iets te zien. De wachtregel mag weg en blijft weg: een
  // volgend besluit maakt het niet leger.
  $('wachten').hidden = true;
  $('inhoud').hidden = false;
}

/* -------------------------------------------------------------- verbinden */

function toonVerbinding(tekst, klasse) {
  const node = $('verbinding');
  node.textContent = tekst;
  node.className = `text-sm ${klasse}`;
}

async function haalSite() {
  try {
    site = await (await fetch('api/site')).json();
    $('installatie').textContent =
      `Installatie ${site.id} · ${site.zones.length} zones · ${site.actuators.length} apparaten` +
      (site.migrating ? ' · vergelijking met het oude systeem loopt' : '');
  } catch {
    // Namen zijn een verfraaiing; zonder de site tonen we gewoon de id's.
  }
}

function volg() {
  const bron = new EventSource('api/events');

  bron.onopen = () => toonVerbinding('verbonden', 'text-goed');
  bron.onmessage = (event) => {
    toonVerbinding('verbonden', 'text-goed');
    teken(JSON.parse(event.data));
  };
  // EventSource herverbindt zelf. Dat hoeven we niet na te bouwen; we moeten
  // het alleen eerlijk tonen, anders staat er een stand die niet meer leeft.
  bron.onerror = () => toonVerbinding('verbinding kwijt — opnieuw proberen…', 'text-alarm');
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
const VAK = {
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

const pct = (deel, geheel) =>
  geheel === 0 ? '—' : `${((deel / geheel) * 100).toFixed(1)}%`;

const tijdvak = (i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`;

/**
 * Eén dagrij als SVG.
 *
 * Aaneengesloten gelijke tijdvakken worden één rechthoek. Een winter is 180
 * dagen van 96 vakjes; als losse elementen zijn dat er zeventienduizend, en dan
 * wordt de pagina traag om iets te tonen dat vrijwel altijd uit lange gelijke
 * stukken bestaat. Samengevoegd blijven het er een paar honderd.
 */
function dagRij(states) {
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
    let eind = i;
    while (eind + 1 < 96 && states[eind + 1] === code) eind++;
    const vak = VAK[code] ?? VAK[' '];

    if (vak.kleur !== 'transparent') {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(i));
      r.setAttribute('y', '0');
      // 0,12 lucht houdt de blokken los zonder een gat te suggereren.
      r.setAttribute('width', String(eind - i + 1 - 0.12));
      r.setAttribute('height', '10');
      r.setAttribute('fill', vak.kleur);
      r.setAttribute('rx', '1');
      r.dataset.uitleg = `${tijdvak(i)}–${tijdvak(Math.min(eind + 1, 96))} · ${vak.naam}`;
      svg.append(r);
    }
    i = eind + 1;
  }
  return svg;
}

function tekenTijdlijn(dagen) {
  const doel = $('tijdlijn');
  doel.replaceChildren();

  // Uurmarkering boven de rijen, anders weet je niet waar de middag ligt.
  const kop = el('div', 'text-zacht mb-1 flex text-[10px]');
  kop.append(el('div', 'w-20 shrink-0'));
  const schaal = el('div', 'relative h-3 flex-1');
  for (let u = 0; u < 24; u += 3) {
    const m = el('span', 'meting absolute', `${String(u).padStart(2, '0')}u`);
    m.style.left = `${(u / 24) * 100}%`;
    schaal.append(m);
  }
  kop.append(schaal);
  doel.append(kop);

  const rijen = el('div', 'space-y-[3px]');
  for (const { day, states } of dagen) {
    const rij = el('div', 'flex items-center gap-2');
    rij.append(el('div', 'text-zacht meting w-20 shrink-0 text-[11px]', day));
    const houder = el('div', 'min-w-0 flex-1');
    houder.append(dagRij(states));
    rij.append(houder);
    rijen.append(rij);
  }
  doel.append(rijen);

  // Legenda: identiteit mag nooit alleen aan kleur hangen.
  const legenda = $('tijdlijn-legenda');
  legenda.replaceChildren();
  for (const code of ['·', '=', '+', '!', 'X']) {
    const vak = VAK[code];
    const item = el('span', 'flex items-center gap-1.5');
    const blok = el('span', 'inline-block h-3 w-3 rounded-sm');
    blok.style.background = vak.kleur;
    item.append(blok, el('span', 'text-zacht', vak.naam));
    legenda.append(item);
  }

  // Aanwijzen geeft het tijdvak. Zonder dit is een blokje van drie pixels
  // mooi maar onleesbaar.
  const tip = $('tijdlijn-tip');
  doel.addEventListener('pointermove', (e) => {
    tip.textContent = e.target?.dataset?.uitleg ?? '';
  });
  doel.addEventListener('pointerleave', () => {
    tip.textContent = '';
  });
}

function tekenBalken(tallies) {
  const doel = $('balken');
  doel.replaceChildren();

  const SEGMENTEN = [
    ['agree', '=', 'eens'],
    ['stricter', '!', 'ik zou stoppen'],
    ['looser', '+', 'ik zou draaien'],
  ];

  for (const t of tallies) {
    const totaal = t.agree + t.stricter + t.looser;
    if (totaal === 0) continue;
    const rij = el('div');

    const kop = el('div', 'mb-1 flex items-baseline justify-between gap-2 text-sm');
    kop.append(el('span', 'font-medium', naamVanActuator(t.actuatorId)));
    kop.append(el('span', 'text-zacht meting text-xs', `${pct(t.agree, totaal)} eens`));
    rij.append(kop);

    // Gestapeld, met 2px lucht ertussen zodat de segmenten niet in elkaar
    // overlopen.
    const balk = el('div', 'flex h-3 gap-[2px] overflow-hidden rounded-full');
    for (const [sleutel, code, naam] of SEGMENTEN) {
      const n = t[sleutel];
      if (n === 0) continue;
      const deel = el('div', 'h-full first:rounded-l-full last:rounded-r-full');
      deel.style.width = `${(n / totaal) * 100}%`;
      deel.style.background = VAK[code].kleur;
      deel.title = `${naam}: ${n.toLocaleString('nl-NL')} momenten`;
      balk.append(deel);
    }
    rij.append(balk);

    // De cijfers erbij, want een balk alleen laat je schatten.
    const onder = el('div', 'text-zacht meting mt-1 flex flex-wrap gap-x-4 text-xs');
    for (const [sleutel, , naam] of SEGMENTEN) {
      onder.append(el('span', '', `${t[sleutel].toLocaleString('nl-NL')} ${naam}`));
    }
    rij.append(onder);

    doel.append(rij);
  }
}

function tekenEpisodes(r) {
  const doel = $('episodes');
  doel.replaceChildren();

  for (const e of r.episodes) {
    const li = el('li', 'px-4 py-3');
    const kop = el('div', 'flex flex-wrap items-baseline justify-between gap-x-4 text-sm');
    const dag = new Date(e.fromMs).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
    kop.append(
      el('span', 'font-medium', `${dag} ${klok(e.fromMs).slice(0, 5)}–${klok(e.toMs).slice(0, 5)}`),
    );
    kop.append(
      el('span', 'text-zacht meting', `${e.minutes} min · ${naamVanActuator(e.actuatorId)}`),
    );
    li.append(kop);

    const strenger = e.direction === 'strenger';
    li.append(
      el(
        'div',
        `mt-0.5 text-xs ${strenger ? 'text-strenger' : 'text-ruimer'}`,
        (strenger ? 'oud draaide, ik zou stoppen' : 'oud stond uit, ik zou draaien') +
          (e.mode && e.mode !== 'onbekend' ? ` · modus ${e.mode}` : ''),
      ),
    );
    if (e.blockedBy) {
      li.append(
        el(
          'div',
          'text-zacht mt-0.5 text-xs',
          `mijn reden: ${GEBLOKKEERD[e.blockedBy] ?? e.blockedBy}`,
        ),
      );
    }
    doel.append(li);
  }

  const rest = r.episodesTotaal - r.episodes.length;
  $('episodes-rest').textContent =
    rest > 0 ? `… en nog ${rest} kortere.` : `${r.episodesTotaal} afwijkingen in totaal.`;
  $('episodes-blok').hidden = r.episodesTotaal === 0;
}

function tekenTerugblik(r) {
  const eens = r.tallies.reduce((n, t) => n + t.agree, 0);
  const totaal = r.tallies.reduce((n, t) => n + t.agree + t.stricter + t.looser, 0);
  const dagen = (r.totMs - r.vanMs) / 86400000;

  $('stat-eens').textContent = pct(eens, totaal);
  $('stat-eens-sub').textContent = `over ${dagen.toFixed(1)} dagen · ${r.momenten.toLocaleString('nl-NL')} momenten`;

  $('stat-stroom').textContent = kwh(r.legacyGridWh);
  $('stat-vermeden').textContent = kwh(r.avoidableGridWh);
  $('stat-vermeden-sub').textContent = `${pct(r.avoidableGridWh, r.legacyGridWh)} van wat het oude systeem besteedde`;

  tekenTijdlijn(r.dagen);
  tekenPatronen(r.patronen ?? []);
  tekenBalken(r.tallies);
  tekenEpisodes(r);
  tekenDataset(r.dataset);

  const oud = Math.round((Date.now() - r.berekendOpMs) / 60000);
  $('terugblik-vers').textContent =
    `berekend ${oud <= 1 ? 'zojuist' : `${oud} min geleden`} · ${r.duurMs} ms over ${r.bestanden} dagbestanden`;

  $('terugblik-inhoud').hidden = false;
}

async function haalTerugblik() {
  try {
    const res = await fetch('api/divergence');
    if (res.ok) {
      tekenTerugblik(await res.json());
      return;
    }
    // 503 betekent "staat uit" of "nog niet gerekend". Bij het eerste hoort de
    // sectie te verdwijnen, bij het tweede hoort er iets te staan.
    const { wachten } = await res.json();
    $('terugblik-vers').textContent =
      wachten === 'nog niet doorgerekend'
        ? 'de logboeken worden nog doorgerekend…'
        : 'de logboekanalyse staat uit op deze installatie.';
  } catch (fout) {
    // Geen terugblik is geen reden om de live stand te verbergen — maar
    // stilzwijgend niets tonen is erger dan een lege sectie. Een fout hoort
    // ergens te landen waar je hem kunt vinden (besluit 7).
    console.error('[terugblik] tekenen mislukt', fout);
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
];

function kiesTab(actiefId) {
  for (const [tabId, paneelId] of TABS) {
    const actief = tabId === actiefId;
    $(tabId).setAttribute('aria-selected', String(actief));
    $(paneelId).hidden = !actief;
  }
  try {
    localStorage.setItem('hems-tab', actiefId);
  } catch {
    // Een browser die opslag weigert is geen reden om de tab niet te wisselen.
  }
}

function tabsAanzetten() {
  for (const [tabId] of TABS) {
    $(tabId).addEventListener('click', () => kiesTab(tabId));
  }
  // Pijltjes horen bij een tablist; anders kom je er met het toetsenbord niet uit.
  for (const [i, [tabId]] of TABS.entries()) {
    $(tabId).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const volgende = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      kiesTab(volgende);
      $(volgende).focus();
    });
  }
  let onthouden = null;
  try {
    onthouden = localStorage.getItem('hems-tab');
  } catch {
    onthouden = null;
  }
  kiesTab(TABS.some(([id]) => id === onthouden) ? onthouden : 'tab-live');
}

/* ---------------------------------------------------------- dataset ---- */

const SEIZOEN_NAAM = {
  winter: 'Winter',
  lente: 'Lente',
  zomer: 'Zomer',
  herfst: 'Herfst',
};

/** Wat een ontbrekend onderdeel betekent, in gewone taal. */
const WAAROM = {
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

const NAAM = {
  modi: 'Modi',
  strategieen: 'Strategieën',
  richtingen: 'Richtingen',
  zoneRedenen: 'Redenen per zone',
  blokkades: 'Blokkades',
};

function seizoenKaart(s) {
  const kaart = el('div');
  const kop = el('div', 'flex items-baseline justify-between gap-2');
  kop.append(el('span', 'text-xs font-medium', SEIZOEN_NAAM[s.seizoen] ?? s.seizoen));
  const dagen = s.dagen >= 10 ? Math.round(s.dagen) : Math.round(s.dagen * 10) / 10;
  kop.append(
    el('span', 'text-zacht meting text-xs', `${dagen.toLocaleString('nl-NL')}/${s.doel}`),
  );
  kaart.append(kop);

  const spoor = el('div', 'bg-grond mt-1 h-1.5 overflow-hidden rounded-full');
  const vulling = el('div', 'h-full rounded-full transition-all duration-500');
  const deel = Math.min(1, s.doel === 0 ? 1 : s.dagen / s.doel);
  vulling.style.width = `${deel * 100}%`;
  // Vol is groen, onderweg is blauw, leeg blijft leeg. Kleur alleen als
  // versterking: het getal ernaast zegt hetzelfde.
  vulling.style.background = deel >= 1 ? 'var(--color-eens)' : 'var(--color-ruimer)';
  spoor.append(vulling);
  kaart.append(spoor);
  return kaart;
}

/** Chips voor wat nog nooit is langsgekomen. */
function tekenGaten(d) {
  const doel = $('dataset-gaten');
  doel.replaceChildren();

  // Alleen de functionele dekking: modi, strategieën en richtingen. Precies
  // waar het percentage hierboven mee rekent, en precies wat je zelf kunt
  // uitlokken door de knop om te zetten of te wachten op het seizoen.
  //
  // De reden- en blokkadecodes horen niet in deze rij: sommige daarvan hóren
  // zeldzaam te zijn (`setpoint_out_of_range` is een fout), en twaalf chips
  // waarvan de helft ruis is, leest niemand. Die staan in de uitklap.
  const ontbreekt = [d.modi, d.strategieen, d.richtingen].flatMap((lijst) =>
    lijst.filter((x) => x.deel < 1),
  );

  if (ontbreekt.length === 0 && d.ontbrekendeInvoer.length === 0) {
    doel.append(
      el('p', 'text-eens text-xs', 'Elk onderdeel van de regeling is minstens één keer afgegaan.'),
    );
    return;
  }

  doel.append(
    el(
      'h3',
      'text-zacht mb-2 text-xs font-medium tracking-wide uppercase',
      'Nog niet afgegaan',
    ),
  );

  const rij = el('div', 'flex flex-wrap gap-2');
  for (const x of ontbreekt) {
    const chip = el(
      'span',
      'border-rand bg-grond text-zacht rounded-full border px-2.5 py-1 text-xs',
    );
    // Half betekent: één dag gezien. Dat is waargenomen en niet aangetoond,
    // dus een eigen teken — anders lijkt het óf af óf nooit gebeurd.
    const half = x.deel === 0.5;
    chip.append(el('span', half ? 'text-zon' : 'text-strenger', half ? '◑ ' : '○ '));
    chip.append(document.createTextNode(x.id));
    const waarom = half
      ? `één dag gezien; twee losse dagen nodig om mee te tellen`
      : WAAROM[x.id];
    if (waarom) chip.title = waarom;
    rij.append(chip);
    // De uitleg erbij, want "heat" zegt op zichzelf niets. Bij drie chips past
    // dat; bij twaalf zou het een muur worden — vandaar de inperking hierboven.
    if (waarom && ontbreekt.length <= 4) {
      rij.append(el('span', 'text-zacht w-full text-xs sm:w-auto sm:pt-1.5', waarom));
    }
  }
  doel.append(rij);

  // Ontbrekende invoer is een andere klasse: die komt niet vanzelf goed door
  // langer te wachten. Daarom apart en met de reden erbij.
  for (const inv of d.ontbrekendeInvoer) {
    doel.append(
      el(
        'p',
        'text-strenger mt-2 text-xs',
        `Wordt niet vastgelegd: ${inv.id} — ${inv.waarvoor}`,
      ),
    );
  }
}

function dekkingsTabel(titel, lijst) {
  const blok = el('div');
  blok.append(
    el('h4', 'text-zacht mb-1 text-xs font-medium tracking-wide uppercase', titel),
  );
  const ul = el('ul', 'space-y-0.5');
  for (const x of lijst) {
    const li = el('li', 'flex items-baseline justify-between gap-2 text-xs');
    const teken = x.deel === 1 ? '● ' : x.deel === 0.5 ? '◑ ' : '○ ';
    const kleur = x.deel === 1 ? 'text-eens' : x.deel === 0.5 ? 'text-zon' : 'text-strenger';
    const naam = el('span', x.deel > 0 ? '' : 'text-zacht');
    naam.append(el('span', kleur, teken));
    naam.append(document.createTextNode(x.id));
    li.append(naam);
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
  blok.append(ul);
  return blok;
}

function tekenDataset(d) {
  if (d == null) return;

  // Eén getal is te weinig: het komt uit twee assen die allebei noodzakelijk
  // zijn, en zonder die twee erbij leest 22% als "bijna een kwart klaar"
  // terwijl er geen enkele winterdag in zit.
  $('dataset-pct').textContent = `${d.gereedheid.totaal}%`;
  $('dataset-balk').style.width = `${d.gereedheid.totaal}%`;
  $('dataset-assen').textContent =
    `tijd ${d.gereedheid.tijd}% · functiedekking ${d.gereedheid.dekking}%`;

  const van = new Date(d.vanMs).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const tot = new Date(d.totMs).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  $('dataset-spanne').textContent = `${van} – ${tot}`;

  const gaten =
    d.gatendagen.length === 0
      ? 'geen gaten'
      : `${d.gatendagen.length} ${d.gatendagen.length === 1 ? 'dag' : 'dagen'} zonder opname`;
  // Echte dagen, niet aangeraakte kalenderdagen: een opname die om vijf uur
  // 's middags begint levert die dag geen dag op.
  const aangeraakt =
    d.kalenderdagenAangeraakt > Math.ceil(d.dagenOpgenomen)
      ? ` (over ${d.kalenderdagenAangeraakt} kalenderdagen)`
      : '';
  $('dataset-samenvatting').textContent =
    `${d.dagenOpgenomen.toLocaleString('nl-NL')} dagen opgenomen${aangeraakt} · ${gaten} · ` +
    `${d.momenten.toLocaleString('nl-NL')} momenten`;

  const seizoenen = $('dataset-seizoenen');
  seizoenen.replaceChildren();
  for (const s of d.seizoenen) seizoenen.append(seizoenKaart(s));

  tekenGaten(d);

  const tabellen = $('dataset-tabellen');
  tabellen.replaceChildren();
  for (const sleutel of ['modi', 'strategieen', 'richtingen', 'zoneRedenen', 'blokkades']) {
    tabellen.append(dekkingsTabel(NAAM[sleutel] ?? sleutel, d[sleutel]));
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
function tekenPatronen(patronen) {
  const doel = $('patronen');
  doel.replaceChildren();
  $('patronen-blok').hidden = patronen.length === 0;

  for (const p of patronen) {
    const tr = el('tr');

    const wat = el('td', 'px-4 py-2 align-top');
    const strenger = p.direction === 'strenger';
    const titel = el('div', 'flex items-baseline gap-2');
    const stip = el('span', 'inline-block h-2 w-2 shrink-0 rounded-full');
    stip.style.background = strenger ? 'var(--color-strenger)' : 'var(--color-ruimer)';
    titel.append(stip);
    titel.append(
      el(
        'span',
        'font-medium',
        `${naamVanActuator(p.actuatorId)} — ${strenger ? 'ik zou stoppen' : 'ik zou draaien'}`,
      ),
    );
    wat.append(titel);
    const detail = [
      p.mode && p.mode !== 'onbekend' ? `modus ${p.mode}` : null,
      p.blockedBy ? GEBLOKKEERD[p.blockedBy] ?? p.blockedBy : null,
    ].filter(Boolean);
    if (detail.length > 0) {
      wat.append(el('div', 'text-zacht mt-0.5 pl-4 text-xs', detail.join(' · ')));
    }
    tr.append(wat);

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
    doel.append(tr);
  }
}

/* --------------------------------------------------------------- starten */

tabsAanzetten();
await haalSite();

// Eerst de huidige stand, zodat de pagina niet leeg blijft als er net geen
// besluit langskomt. Bij dertig seconden hartslag is dat lang genoeg om voor
// kapot door te gaan.
try {
  const res = await fetch('api/state');
  if (res.ok) teken(await res.json());
  else toonVerbinding('wacht op het eerste besluit…', 'text-zacht');
} catch {
  toonVerbinding('geen verbinding met de dienst', 'text-alarm');
}

volg();

// De analyse draait op de dienst elk kwartier; vaker ophalen heeft geen zin.
// Wel meteen bij het openen, want daar komt iemand voor.
await haalTerugblik();
setInterval(haalTerugblik, 15 * 60_000);
