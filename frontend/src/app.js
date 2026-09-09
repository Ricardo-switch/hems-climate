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
