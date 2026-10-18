/*
 * Wat elke tab van ontwerp 2 deelt (besluit 104): de wand van 800 hoog (en 1280 of breder) die
 * als geheel naar het scherm schaalt, de navigatie, de lucht van het moment,
 * de klok, ophalen, de deuren met de inlog (besluit 99) en de live-stroom.
 *
 * Een tab is een eigen pagina met een #wand en een #tel; deze basis zet de
 * stand en de navigatie, de tab tekent zijn eigen inhoud.
 */
'use strict';

(function (global) {
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const nl = (n, d = 1) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const zet = (sel, text) => $$(sel).forEach((e) => (e.textContent = text));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /**
   * Bijna op (besluit 149): onder de drempel die de bewoner koos bij Functies,
   * per soort ('batterij' of 'filter'). Zonder huis 10%; null is nooit.
   */
  const bijnaOp = (pct, soort, huis) => {
    const d = huis?.drempels?.[soort];
    return pct != null && (d === undefined ? pct < 10 : d != null && pct < d);
  };
  const klokVan = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  /**
   * Wanneer iets was: de klok vandaag, "gisteren" met de klok, of de datum.
   * Kort (voor een melding): binnen het uur in minuten, en gisteren zonder klok.
   */
  function wanneer(ms, { kort = false } = {}) {
    const min = Math.round((Date.now() - ms) / 60_000);
    if (kort && min < 60) return `${Math.max(1, min)} min`;
    const d = new Date(ms);
    const vandaag = new Date();
    if (d.toDateString() === vandaag.toDateString()) return klokVan(ms);
    const gisteren = new Date(vandaag.getTime() - 86_400_000);
    if (d.toDateString() === gisteren.toDateString()) return kort ? 'gisteren' : `gisteren ${klokVan(ms)}`;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  }

  /* Waar de tabs staan: tot ze in ontwerp 2 zijn, in de proefomgeving. */
  const LINKS = {
    thuis: 'thuis.html',
    vandaag: 'vandaag.html',
    apparaten: 'apparaten.html',
    opbrengst: 'opbrengst.html',
    assistent: 'assistent.html',
    instellingen: 'instellingen.html',
  };

  /**
   * De telefoonweergave alleen staand, of op een heel smal scherm. Een telefoon
   * die ligt, krijgt de wand van de tablet, verkleind tot hij past. Dezelfde
   * regel staat in het script in de <head> van elke pagina.
   */
  function telStand() {
    return innerHeight > innerWidth || innerWidth < 560;
  }

  /** De stand en de schaal, op <html>; het script in de <head> deed dit al vóór de eerste weergave. */
  /** Een onzichtbaar vak om de inkeping van een telefoon te meten (safe-area). */
  let peil = null;
  function inzet() {
    if (!peil) {
      peil = document.createElement('div');
      peil.setAttribute('aria-hidden', 'true');
      peil.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.documentElement.append(peil);
    }
    const s = getComputedStyle(peil);
    // Boven en onder ook (besluit 129): op een liggende telefoon tekent de browser
    // tot onder de balk met de veegstreep, en daar viel de onderkant van de wand weg.
    return { l: parseFloat(s.paddingLeft) || 0, r: parseFloat(s.paddingRight) || 0, t: parseFloat(s.paddingTop) || 0, b: parseFloat(s.paddingBottom) || 0 };
  }

  /**
   * Het schermtoetsenbord (besluit 124): komt het in beeld, dan wordt het scherm
   * even hoog als wat erboven overblijft. Dat is geen nieuwe stand: de wand
   * houdt zijn maat, en schuift alleen omhoog tot het veld waarin je typt
   * zichtbaar is. Gaat het toetsenbord weg, dan staat alles weer op zijn plek.
   */
  let maat = { w: 0, h: 0 };
  const typt = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
  function toetsenbord() {
    const d = document.documentElement;
    const veld = document.activeElement;
    if (telStand() || !typt() || !veld?.closest?.('#wand')) {
      d.style.setProperty('--toetsschuif', '0px');
      return;
    }
    const zicht = global.visualViewport?.height ?? innerHeight;
    const r = veld.getBoundingClientRect();
    const nu = parseFloat(getComputedStyle(d).getPropertyValue('--toetsschuif')) || 0;
    const nodig = Math.max(0, r.bottom + nu + 12 - zicht);
    d.style.setProperty('--toetsschuif', `${Math.round(nodig)}px`);
  }

  function schaal() {
    const d = document.documentElement;
    // Een toetsenbord: zelfde breedte, minder hoog, en je typt. Dan niets herschalen.
    if (maat.w === innerWidth && innerHeight < maat.h && typt()) {
      toetsenbord();
      return;
    }
    maat = { w: innerWidth, h: innerHeight };
    d.style.setProperty('--toetsschuif', '0px');
    d.classList.toggle('tel-stand', telStand());
    // Een liggende telefoon heeft een inkeping aan de zijkant: de wand blijft ernaast.
    const { l, r, t, b } = inzet();
    const vrij = innerWidth - l - r;
    const hoog = innerHeight - t - b;
    // Een breder scherm dan 16:10 (een tablet zonder de balken van het systeem):
    // de wand groeit mee in de breedte, de hoogte blijft 800. Zo vult hij het scherm.
    const breed = Math.min(1700, Math.max(1280, Math.round((800 * vrij) / hoog)));
    d.style.setProperty('--wandbreedte', `${breed}px`);
    d.style.setProperty('--wandschaal', String(Math.min(vrij / breed, hoog / 800)));
    d.style.setProperty('--wandmidden', `${(l - r) / 2}px`);
    d.style.setProperty('--wandmiddenY', `${(t - b) / 2}px`);
  }

  async function haal(pad) {
    let res;
    try {
      res = await fetch(pad, { cache: 'no-store' });
    } catch (fout) {
      // Geen antwoord van de NAS: de laatste stand blijft, grijs (besluit 82).
      offline();
      throw fout;
    }
    online();
    // Niet (meer) ingelogd (besluit 147): naar het inloggen, met de weg terug naar deze pagina.
    if (res.status === 401) {
      location.href = `inloggen.html?terug=${encodeURIComponent(location.pathname + location.hash)}`;
      throw new Error(`${pad}: log eerst in`);
    }
    if (!res.ok) throw new Error(`${pad}: ${res.status}`);
    return res.json();
  }

  /*
   * Zonder verbinding (besluit 82): de pagina houdt de laatste stand, grijs, met
   * sinds wanneer. De regeling draait op de NAS gewoon door; alleen deze pagina
   * hoort niets meer. Komt er weer antwoord, dan is het weg.
   */
  let wegSinds = null;
  function offline(sinds = Date.now()) {
    if (wegSinds != null) return;
    wegSinds = sinds;
    document.body.classList.add('offline');
    const balk = document.createElement('div');
    balk.className = 'geenverbinding';
    balk.setAttribute('role', 'status');
    balk.textContent = `Geen verbinding met Smart Climate sinds ${klokVan(sinds)}. De regeling loopt gewoon door; dit is de laatste stand.`;
    document.body.append(balk);
  }
  function online() {
    if (wegSinds == null) return;
    wegSinds = null;
    document.body.classList.remove('offline');
    document.querySelector('.geenverbinding')?.remove();
  }

  /**
   * Een deur van de dienst (POST). Zonder inlog stuurt de dienst 401; dan naar
   * de inlog van Home Assistant, en daarna terug naar deze plek (besluit 99).
   */
  async function deur(pad, body) {
    const res = await fetch(pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401) {
      location.href = `auth/login?terug=${encodeURIComponent(location.pathname + location.hash)}`;
      return null;
    }
    return res;
  }

  /** Dag, ochtend, avond of nacht, uit de zon van de dienst (`api/zon`). */
  function tijdVanDeDag(zon) {
    const d = zon?.dag;
    if (!zon?.zon?.boven) {
      const na = d?.onderMs != null ? Date.now() - d.onderMs : Infinity;
      const voor = d?.opMs != null ? d.opMs - Date.now() : Infinity;
      if ((na > 0 && na < 60 * 60_000) || (voor > 0 && voor < 45 * 60_000)) return na < Infinity && na > 0 ? 'avond' : 'ochtend';
      return 'nacht';
    }
    if (d?.fractie < 0.1) return 'ochtend';
    if (d?.fractie > 0.9) return 'avond';
    return 'dag';
  }

  function lucht(tijd, seizoen, wolken) {
    const b = document.body.classList;
    for (const c of [...b]) if (c.startsWith('lucht-')) b.remove(c);
    b.add(seizoen === 'winter' && tijd !== 'nacht' ? 'lucht-winter' : tijd === 'nacht' ? 'lucht-nacht' : tijd === 'avond' ? 'lucht-avond' : tijd === 'ochtend' ? 'lucht-ochtend' : wolken > 0.6 ? 'lucht-bewolkt' : 'lucht-dag');
    luchtAchterVak();
  }

  /**
   * In Home Assistant laadt een andere pagina in het vak van het paneel, en
   * tot die er staat is het vak leeg: zwart op de tablet, langer dan op de
   * NAS omdat alles via Home Assistant komt. Het vak krijgt de lucht van nu
   * als achtergrond, zodat je die ziet in plaats van zwart.
   */
  function luchtAchterVak() {
    try {
      const vak = inHA() ? global.frameElement : null;
      if (!vak) return;
      vak.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
      vak.style.backgroundImage = getComputedStyle(document.body, '::before').backgroundImage;
    } catch {
      // Een vak van een andere herkomst: dan niets.
    }
  }

  /** De lucht van nu, voor een tab zonder huis: uit de zon en wat de panelen leveren. */
  function luchtVan(zon, zonKw) {
    const helder = zon?.heldereLuchtW ?? 0;
    const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : 0.3;
    const maand = new Date().getMonth() + 1;
    lucht(tijdVanDeDag(zon), maand >= 11 || maand <= 2 ? 'winter' : 'zomer', wolken);
  }

  function klok() {
    const nu = new Date();
    zet('[data-tijd]', klokVan(nu));
    zet('[data-datum]', nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  /**
   * De stippellijn bij de zon van vandaag (besluit 105): de verwachting uit het
   * weer en wat de panelen leerden, en zonder weer de zon bij een heldere lucht.
   */
  function verwachting(zon, weer) {
    const kw = weer?.vandaag?.kwartieren ?? [];
    if (kw.length) return { punten: kw.map((q) => ({ tMs: q.tMs, w: q.verwachtW })), naam: 'verwachting' };
    return { punten: (zon?.kwartieren ?? []).map((q) => ({ tMs: q.tMs, w: q.heldereLuchtW ?? 0 })), naam: 'zon bij heldere lucht' };
  }

  /** Eén live-stroom per pagina: de besluiten, en de deurbel (besluit 107). */
  let bron = null;
  function stroom() {
    if (bron) return bron;
    try {
      bron = new EventSource('api/events');
      // Valt de stroom weg en komt hij niet snel terug, dan zonder verbinding.
      let wacht = null;
      bron.addEventListener('error', () => {
        const toen = Date.now();
        clearTimeout(wacht);
        wacht = setTimeout(() => bron.readyState !== EventSource.OPEN && offline(toen), 15_000);
      });
      bron.addEventListener('open', () => {
        clearTimeout(wacht);
        online();
      });
      bron.addEventListener('aanbellen', (ev) => {
        try {
          aanbellen(JSON.parse(ev.data));
        } catch {
          // Een half bericht.
        }
      });
    } catch {
      // Geen EventSource: het verversen per minuut doet het werk.
    }
    return bron;
  }

  /** De live-stroom van besluiten; zonder valt de tab terug op verversen per minuut. */
  function live(opState) {
    const b = stroom();
    if (!b) return;
    b.onmessage = (ev) => {
      try {
        opState(JSON.parse(ev.data));
      } catch {
        // Een half bericht: de volgende komt zo.
      }
    };
  }

  /*
   * Er wordt aangebeld (besluit 107): het beeld van de deurbel schermvullend,
   * op elke pagina, en na de ingestelde tijd weer weg (besluit 109). In Fully Kiosk Browser gaat
   * ook het scherm aan; een gewone browser kan dat niet.
   */
  let belTimer = null;
  function aanbellen(m) {
    // Het scherm aan, als dat zo is ingesteld (besluit 109); kan alleen in Fully Kiosk.
    if (m.schermAan !== false) {
      try {
        global.fully?.turnScreenOn?.();
        global.fully?.bringToForeground?.();
      } catch {
        // Geen Fully Kiosk.
      }
    }
    let laag = document.querySelector('.aanbel');
    if (!laag) {
      laag = document.createElement('div');
      laag.className = 'aanbel';
      laag.setAttribute('role', 'dialog');
      laag.setAttribute('aria-label', 'Er wordt aangebeld');
      laag.addEventListener('click', (e) => {
        if (e.target.closest('[data-bel-dicht]')) sluitBel();
      });
      document.body.append(laag);
    }
    const id = encodeURIComponent(m.camera);
    // Belt er opnieuw iemand terwijl het beeld er staat: eerst het oude beeld stoppen.
    stopBeelden(laag);
    laag.innerHTML = `<div class="aanbel-kop"><span class="bol adem" style="width: 34px; height: 34px"></span><div><b>Er wordt aangebeld</b><span>${esc(m.naam ?? 'Deurbel')}, ${klokVan(m.tMs ?? Date.now())}</span></div><button type="button" class="knop" data-bel-dicht>Sluiten</button></div>
      <div class="aanbel-beeld"><img alt="Live beeld van ${esc(m.naam ?? 'de deurbel')}" src="api/camera?id=${id}&live=1"></div>`;
    laag.querySelector('img').addEventListener('error', async () => {
      const res = await fetch(`api/camera?id=${id}`).catch(() => null);
      const vak = laag.querySelector('.aanbel-beeld');
      vak.innerHTML = res?.status === 401
        ? `<p>Het beeld is alleen te zien als je bent ingelogd met je Home Assistant-account. <a href="auth/login?terug=${encodeURIComponent(location.pathname + location.hash)}">Inloggen</a></p>`
        : '<p>De deurbel geeft nu geen beeld.</p>';
    });
    laag.querySelector('[data-bel-dicht]').focus();
    clearTimeout(belTimer);
    belTimer = setTimeout(sluitBel, Math.max(30, Math.min(600, Number(m.seconden) || 120)) * 1000);
  }
  function sluitBel() {
    clearTimeout(belTimer);
    const laag = document.querySelector('.aanbel');
    if (laag) stopBeelden(laag);
    laag?.remove();
  }
  /** Zonder bron stopt de stroom; alleen weghalen laat hem soms doorlopen. */
  function stopBeelden(laag) {
    laag.querySelectorAll('img').forEach((img) => img.removeAttribute('src'));
  }

  /**
   * Tekenen, gebundeld: hoe vaak er ook om gevraagd wordt (een klik, de
   * live-stroom, een verversing), hooguit één keer per beeld. Zonder dit liep
   * de pagina vast bij snel klikken: elke klik tekende het hele huis opnieuw.
   */
  function gebundeld(fn) {
    let gepland = false;
    return () => {
      if (gepland) return;
      gepland = true;
      requestAnimationFrame(() => {
        gepland = false;
        fn();
      });
    };
  }

  /** Welke stand er te zien is: '#wand' of '#tel'. Alleen die wordt getekend. */
  const zicht = () => (telStand() ? '#tel' : '#wand');

  /**
   * Een gast verandert geen instellingen (besluit 151). De dienst weigert het
   * al; hier ziet hij het ook: een instellingenpagina gaat terug naar
   * Instellingen, die hem alleen Bewoners en toegang laat zien (om uit te
   * loggen) en Wat je huis kan.
   */
  async function gastGrens() {
    const pagina = location.pathname.split('/').pop() || '';
    if (['instellingen.html', 'toegang.html', 'huis-kan.html'].includes(pagina)) return;
    const ik = await haal('api/bewoners').then((b) => b.ik, () => null);
    if (ik?.soort === 'gast') location.replace('instellingen.html');
  }

  /*
   * Volledig scherm in Home Assistant (besluit 155), per apparaat.
   *
   * Achter Ingress staat de app in een paneel van Home Assistant, met de
   * zijbalk en een kopbalk eromheen. Home Assistant kent zelf een kioskstand
   * voor een app: die vraagt de app met een bericht (`subscribe-properties`
   * met `kioskMode`), en het paneel zet hem zelf weer uit als je het verlaat.
   * Een andere pagina van de app laat hem staan. Voor de balken van de
   * browser zelf vraagt de app het hele scherm, op het document van Home
   * Assistant: dat blijft staan als de app een andere pagina laadt. Dat mag
   * alleen na een tik, dus bij de eerste.
   *
   * De keuze staat in dit apparaat (localStorage): de wand wel, de telefoon niet.
   */
  const VOLLEDIG = 'sc-volledig-scherm';
  const inHA = () => global.parent !== global && /^\/api\/hassio_ingress\//.test(location.pathname);
  function volledigGekozen() {
    try {
      return localStorage.getItem(VOLLEDIG) === '1';
    } catch {
      return false;
    }
  }
  /*
   * Naar Home Assistant zet het volledige scherm even uit: je blijft in de app,
   * met de zijbalk en de kopbalk van Home Assistant, en kiest daar zelf waar je
   * heen gaat. Dat geldt voor dit paneel; de volgende keer dat je de app opent
   * (een nieuw vak), of met dezelfde knop, is het er weer. Het onthouden staat
   * bij Home Assistant, want het vak laadt bij elke pagina opnieuw.
   */
  const PAUZE = '__scVolledigPauze';
  function gepauzeerd() {
    try {
      return !!global.frameElement && global.parent[PAUZE] === global.frameElement;
    } catch {
      return false;
    }
  }
  const volledigNu = () => inHA() && volledigGekozen() && !gepauzeerd();
  /** Een bericht aan het paneel van Home Assistant om de app heen; alleen naar dezelfde herkomst. */
  const aanHA = (bericht) => global.parent.postMessage(bericht, location.origin);
  /** Het document van Home Assistant, als het mag; anders null. */
  function haDocument() {
    try {
      return global.parent.document;
    } catch {
      return null;
    }
  }
  /**
   * Een telefoon krijgt nooit het hele scherm van de browser, alleen de
   * kioskstand: dan ziet hij eruit als de app van de NAS, met de statusbalk
   * erboven. Met het hele scherm schoof de statusbalk na de terugknop over de
   * pagina, of was hij er op de ene pagina wel en op de andere niet. Een
   * telefoon is een scherm met een kortste kant onder 600, ook liggend.
   */
  const isTelefoon = () => Math.min(global.screen?.width ?? 0, global.screen?.height ?? 0) < 600;
  function heelScherm(e) {
    // De eerste tik is Naar Home Assistant: dan juist niet.
    if (e?.target?.closest?.('[data-naar-ha]') || isTelefoon()) return;
    const doc = haDocument();
    if (doc && volledigNu() && !doc.fullscreenElement) doc.documentElement.requestFullscreen?.().catch(() => {});
  }
  /** Bij de eerste tik het hele scherm, en na de terugknop van Android weer bij de volgende. */
  const opTik = () => addEventListener('click', heelScherm, { once: true, capture: true });
  function volledig() {
    if (!inHA() || !volledigGekozen()) return;
    const doc = haDocument();
    const weer = () => {
      if (!doc.fullscreenElement && volledigNu()) opTik();
    };
    doc?.addEventListener('fullscreenchange', weer);
    // Het document van Home Assistant blijft; de luisteraar gaat mee met deze pagina.
    addEventListener('pagehide', () => doc?.removeEventListener('fullscreenchange', weer));
    // Een telefoon die het hele scherm nog had van een eerdere versie: weer met statusbalk.
    if (isTelefoon() && doc?.fullscreenElement) doc.exitFullscreen().catch(() => {});
    if (!volledigNu()) return;
    aanHA({ type: 'home-assistant/subscribe-properties', kioskMode: true });
    opTik();
  }
  /** Het hele scherm en de balken van Home Assistant uit, of weer aan. */
  function balkenVanHA(terug) {
    if (terug) {
      aanHA({ type: 'home-assistant/unsubscribe-properties' });
      const doc = haDocument();
      if (doc?.fullscreenElement) doc.exitFullscreen().catch(() => {});
    } else {
      aanHA({ type: 'home-assistant/subscribe-properties', kioskMode: true });
      heelScherm();
    }
  }
  /** Aan of uit op dit apparaat, en meteen zo. */
  function zetVolledig(aan) {
    try {
      if (aan) localStorage.setItem(VOLLEDIG, '1');
      else localStorage.removeItem(VOLLEDIG);
    } catch {
      // Geen opslag (privévenster): dan alleen voor nu.
    }
    if (!inHA()) return;
    pauze(false);
    knoppenNaarHA();
    balkenVanHA(!aan);
  }
  function pauze(aan) {
    try {
      if (aan) global.parent[PAUZE] = global.frameElement;
      else if (gepauzeerd()) delete global.parent[PAUZE];
    } catch {
      // Een vak van een andere herkomst.
    }
  }
  /** Naar Home Assistant: het volledige scherm uit, en de balken van Home Assistant terug. */
  function naarHA() {
    pauze(true);
    balkenVanHA(true);
    knoppenNaarHA();
  }
  /** Weer volledig scherm, met dezelfde knop. */
  function weerVolledig() {
    pauze(false);
    balkenVanHA(false);
    knoppenNaarHA();
  }
  /**
   * De knop naar Home Assistant: op de wand boven de bel, op de telefoon naast
   * het tandwiel. Staat het volledige scherm even uit, dan zet dezelfde knop
   * het weer aan.
   */
  function knoppenNaarHA() {
    $$('[data-naar-ha-knop]').forEach((k) => k.remove());
    if (!inHA() || !volledigGekozen()) return;
    const uit = gepauzeerd();
    const wat = uit ? 'data-weer-volledig aria-label="Volledig scherm" title="Volledig scherm"' : 'data-naar-ha aria-label="Naar Home Assistant" title="Naar Home Assistant"';
    const icoon = uit ? VOLLEDIG_ICOON : NAAR_HA;
    document.getElementById('balk')?.querySelector('[data-meldbel]')?.insertAdjacentHTML('beforebegin', `<button type="button" class="meldbel naarha" data-naar-ha-knop ${wat}>${icoon}</button>`);
    $$('#tel [data-tandwiel]').forEach((t) => {
      const naast = t.parentElement.querySelector(':scope > [data-meldbel]') ?? t;
      naast.insertAdjacentHTML('beforebegin', `<button type="button" class="pil naarha" data-naar-ha-knop ${wat}>${icoon}</button>`);
    });
  }
  const NAAR_HA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5"/><path d="M14 15.5h7M18 12.5l3 3-3 3"/></svg>';
  const VOLLEDIG_ICOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-naar-ha]')) naarHA();
    else if (e.target.closest?.('[data-weer-volledig]')) weerVolledig();
  });

  /** Zet de navigatie, de stand en de klok voor een tab. */
  function start(tab) {
    const balk = document.getElementById('balk');
    const tabs = document.getElementById('tabs');
    if (balk) nav.balk(balk, tab, LINKS);
    if (tabs) nav.tabs(tabs, tab, LINKS);
    // Volledig scherm in Home Assistant (besluit 155): de weg terug staat boven de bel.
    knoppenNaarHA();
    luchtAchterVak();
    $$('[data-tandwiel]').forEach((a) => {
      a.innerHTML = nav.svg('instellingen');
      a.setAttribute('href', LINKS.instellingen);
    });
    // De live-stroom, ook voor de deurbel op een pagina zonder live gegevens.
    stroom();
    // Om de app te installeren; dat kan alleen over HTTPS (of met een uitzondering in Chrome).
    if ('serviceWorker' in navigator && global.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    addEventListener('keydown', (e) => e.key === 'Escape' && sluitBel());
    // Het toetsenbord gaat weg als het veld de focus verliest: dan weer op zijn plek.
    global.visualViewport?.addEventListener('resize', toetsenbord);
    document.addEventListener('focusin', () => setTimeout(toetsenbord, 350));
    document.addEventListener('focusout', () => setTimeout(() => {
      if (!typt()) schaal();
    }, 50));
    // Wisselt de stand (de tablet draait), dan tekent de pagina de andere opnieuw.
    let stand = telStand();
    addEventListener('resize', () => {
      schaal();
      if (telStand() !== stand) {
        stand = telStand();
        dispatchEvent(new Event('standwissel'));
      }
    });
    schaal();
    klok();
    setInterval(klok, 10_000);
    nieuweVersie();
    meldingenStart();
    luisterStart();
    if (tab === 'instellingen') void gastGrens();
  }

  /**
   * "Hé huis" (besluit 150): op een scherm waar luisteren aan staat, laadt elke pagina het
   * luisteren erbij. Op een telefoon nooit vanzelf; daar tik je op de microfoon.
   */
  function luisterStart() {
    let aan = false;
    try {
      aan = localStorage.getItem('sc-luisteren') === 'aan';
    } catch {
      aan = false;
    }
    if (!aan || telStand() || global.luisteren || !global.isSecureContext) return;
    const s = document.createElement('script');
    s.src = 'luisteren.js';
    document.head.appendChild(s);
  }

  /* ------------------------------------------------- meldingen (besluit 136) */

  /*
   * De bel in het menu (schets Wand-Meldingen): een getal als er iets aandacht
   * vraagt, een blad met Vraagt aandacht, Eerder en Onderhoud. Elke twee
   * minuten bij, en als je de app weer opent. Na een update één keer "Wat is
   * er nieuw", als pop-up.
   */
  let meld = { actief: [], eerder: [] };
  let meldZicht = 'lijst';
  const MELDICOON = {
    nieuw: ['blauw', '<path d="M12 5v14M5 12h14"/>'],
    stil: ['rood', '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>'],
    batterij: ['geel', '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M5 10v4"/>'],
    filter: ['geel', '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'],
    meter: ['rood', '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
    versie: ['paars', '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>'],
    mijlpaal: ['blauw', '<path d="M4 18c3-8 6-10 8-10s4 3 8 0"/>'],
    // Wiens comfort geldt (besluit 147): een persoon.
    comfort: ['geel', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'],
    // De panelen zijn gemeten (besluit 157): een zon.
    panelen: ['geel', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    goed: ['groen', '<path d="M5 12l5 5 9-10"/>'],
    onderhoud: ['grijs', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
  };
  const meldIcoon = (soort) => {
    const [kleur, pad] = MELDICOON[soort] ?? MELDICOON.nieuw;
    return `<span class="ik ${kleur}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg></span>`;
  };
  const wanneerMeld = (ms) => wanneer(ms, { kort: true });

  /*
   * Elke melding is aan te tikken en weg te halen (aangevuld 15 oktober): een
   * versie opent weer wat er nieuw was, de rest gaat naar het apparaat.
   */
  const weg = (m) => `<button type="button" class="meldweg" data-meld-weg="${esc(m.id)}" aria-label="${esc(`Verwijder: ${m.titel}`)}">×</button>`;
  const doel = (m) => (m.soort === 'versie' ? `data-meld-versie="${esc(m.id.replace(/^versie:/, ''))}"` : m.actie ? `data-meld-href="${esc(m.actie.href)}"` : '');
  function meldLijst() {
    const kaart = (m) => `<div class="melding" ${doel(m)}>${meldIcoon(m.soort)}<b>${esc(m.titel)}</b>${weg(m)}<p>${esc(m.tekst)}</p>
      <div class="acties">${m.actie ? `<a class="licht" href="${esc(m.actie.href)}">${esc(m.actie.label)}</a>` : ''}<span class="tijd">${esc(wanneerMeld(m.sindsMs))}</span></div></div>`;
    const oud = (m) => `<div class="melding oud" ${doel(m)}>${meldIcoon(m.soort === 'versie' || m.soort === 'mijlpaal' ? m.soort : 'goed')}<b>${esc(m.titel)}</b>${weg(m)}<p>${esc(m.tekst)}</p></div>`;
    const aandacht = meld.actief.length
      ? `<h3>Vraagt aandacht</h3>${meld.actief.map(kaart).join('')}`
      : '<div class="stil"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><b>Alles werkt</b>Komt er iets nieuws bij, of reageert iets niet meer, dan staat het hier.</div>';
    const eerder = meld.eerder.length ? `<h3>Eerder</h3>${meld.eerder.slice(0, 5).map(oud).join('')}` : '';
    return `<div class="kop"><h2 class="kop-2">Meldingen</h2><button type="button" class="sluit" data-meld-sluit aria-label="Sluiten">×</button></div>
      ${aandacht}${eerder}
      ${onderhoudKnop()}`;
  }

  /** De knop naar Onderhoud: geel met wat bijna op is, anders gewoon. */
  function onderhoudKnop() {
    const op = meld.actief.filter((m) => m.soort === 'batterij' || m.soort === 'filter');
    const zin = !op.length ? 'Alle batterijen en filters' : op.length === 1 ? (op[0].soort === 'batterij' ? 'Een batterij is bijna leeg' : 'Een filter is bijna vol') : `${op.length} batterijen of filters bijna op`;
    return `<button type="button" class="onderhoud" data-meld-onderhoud>${meldIcoon(op.length ? op[0].soort : 'onderhoud')}<span><b>Onderhoud</b><span>${esc(zin)}</span></span><span class="pijl" aria-hidden="true">›</span></button>`;
  }

  /** Wanneer er een melding komt, in een zin (besluit 149). */
  function drempelZin(d) {
    const b = d ? d.batterij : 10;
    const f = d ? d.filter : 10;
    if (b == null && f == null) return 'Batterijen en filters geven geen melding.';
    if (b === f) return `Onder de ${b}% komt er een melding.`;
    const deel = (pct, wat) => (pct == null ? `${wat} nooit` : `${wat} onder de ${pct}%`);
    return `Een melding: ${deel(b, 'een batterij')}, ${deel(f, 'een filter')}.`;
  }

  async function meldOnderhoud() {
    let huis = null;
    try {
      huis = await haal('api/huis');
    } catch {
      // Dan een lege lijst.
    }
    const balk = (pct, soort) => `<div class="meter"><i style="width: ${Math.max(2, pct)}%; background: ${bijnaOp(pct, soort, huis) ? 'var(--gloed)' : pct < 40 ? 'var(--zon)' : 'var(--mint)'}"></i></div>`;
    const regel = (naam, onder, pct, soort) => `<div class="regel"><div><b>${esc(naam)}</b><span>${esc(onder ?? '')}</span></div>${balk(pct, soort)}<span class="pct">${pct}%</span></div>`;
    const batt = huis?.batterijen ?? [];
    const filters = (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.klimaat?.filter?.pct != null).map((a) => ({ naam: a.naam, kamer: r.naam, pct: a.klimaat.filter.pct }))));
    return `<div class="kop"><div><button type="button" class="terugmeld" data-meld-terug>‹ Meldingen</button><h2 class="kop-2" style="margin: 2px 0 0">Onderhoud</h2></div><button type="button" class="sluit" data-meld-sluit aria-label="Sluiten">×</button></div>
      <h3>Batterijen, de leegste eerst</h3>
      ${batt.length ? batt.map((b) => regel(b.naam, b.kamer, b.pct, 'batterij')).join('') : '<p class="mini" style="margin: 0">Geen apparaten met een batterij gevonden.</p>'}
      ${filters.length ? `<h3>Filters van de airco's</h3>${filters.map((f) => regel(f.naam, f.kamer, f.pct, 'filter')).join('')}` : ''}
      <p class="mini" style="margin: auto 0 0">${esc(drempelZin(huis?.drempels))} <a href="functies.html#meldingen">Wanneer een melding ›</a> Telefoons, een thuisbatterij en een auto staan hier niet bij.</p>`;
  }

  /*
   * Gelezen (15 oktober 2026): wat je in het blad zag, telt niet meer mee in het
   * getal bij de bel. De melding blijft staan tot hij is opgelost of weg is.
   * Onthouden in deze browser.
   */
  const GELEZEN = 'sc-meldingen-gelezen';
  const gelezen = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(GELEZEN) ?? '[]'));
    } catch {
      return new Set();
    }
  };
  function markeerGelezen() {
    try {
      localStorage.setItem(GELEZEN, JSON.stringify(meld.actief.map((m) => m.id)));
    } catch {
      // Dan telt hij de volgende keer nog mee.
    }
    meldGetal();
  }
  function meldGetal() {
    const al = gelezen();
    const n = meld.actief.filter((m) => !al.has(m.id)).length;
    $$('[data-meldaantal]').forEach((b) => {
      b.hidden = n === 0;
      b.textContent = n > 9 ? '9+' : String(n);
    });
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-label', n ? `Meldingen, ${n} ${n === 1 ? 'vraagt' : 'vragen'} aandacht` : 'Meldingen'));
  }

  async function meldLaad() {
    try {
      meld = await haal('api/meldingen');
    } catch {
      return;
    }
    meldGetal();
    const blad = document.querySelector('[data-meldblad]');
    if (blad && !blad.hidden && meldZicht === 'lijst') blad.innerHTML = meldLijst();
  }

  function meldBlad() {
    let blad = document.querySelector('[data-meldblad]');
    if (!blad) {
      document.body.insertAdjacentHTML('beforeend', '<div class="meldachter" data-meld-achter hidden></div><aside class="glas meldblad" role="dialog" aria-label="Meldingen" data-meldblad hidden></aside>');
      blad = document.querySelector('[data-meldblad]');
    }
    return blad;
  }
  async function meldOpen(zicht = 'lijst') {
    const blad = meldBlad();
    meldZicht = zicht;
    blad.innerHTML = zicht === 'lijst' ? meldLijst() : await meldOnderhoud();
    blad.hidden = false;
    if (zicht === 'lijst') markeerGelezen();
    document.querySelector('[data-meld-achter]').hidden = false;
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    blad.querySelector('[data-meld-sluit]')?.focus();
  }
  function meldDicht() {
    $$('[data-meldblad], [data-meld-achter]').forEach((el) => (el.hidden = true));
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  /** Na een update één keer: wat is er nieuw (besluit 136). De eerste keer ooit niet: dan is alles nieuw. */
  const VERSIE_GEZIEN = 'sc-versie-gezien';
  async function watIsErNieuw(welke = null) {
    let v;
    try {
      v = await haal('api/versie');
    } catch {
      return;
    }
    let n;
    if (welke) {
      // Opnieuw geopend vanuit Meldingen.
      n = (v.nieuw ?? []).find((x) => x.versie === welke);
      if (!n) {
        location.href = 'toegang.html#versie';
        return;
      }
    } else {
      let gezien = null;
      try {
        gezien = localStorage.getItem(VERSIE_GEZIEN);
        localStorage.setItem(VERSIE_GEZIEN, v.nummer);
      } catch {
        return;
      }
      n = v.nieuw?.[0];
      if (gezien == null || gezien === v.nummer || !n || n.versie !== v.nummer) return;
    }
    const SOORT = [['nieuw', 'Nieuw'], ['beter', 'Beter'], ['opgelost', 'Opgelost']];
    const delen = SOORT.filter(([k]) => (n[k] ?? []).length).map(([k, t]) => `<div class="soort ${k}"><span class="label">${t}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="meldachter" data-nieuw-achter></div><div class="glas nieuwpop" role="dialog" aria-modal="true" aria-labelledby="nieuwkop" data-nieuwpop>
      <span class="mini">${welke ? esc(new Date(`${n.datum}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })) : 'Bijgewerkt'}</span><h2 class="kop-2" id="nieuwkop" style="margin: 2px 0 0">Wat is er nieuw in ${esc(n.versie)}</h2>${delen}
      <div class="knoppen"><a class="knop" href="toegang.html#versie">Alle versies</a><button type="button" class="knop knop-licht" data-nieuw-dicht>Oké</button></div></div>`);
    document.querySelector('[data-nieuw-dicht]').focus();
  }

  function meldingenStart() {
    $$('[data-meldicoon]').forEach((b) => b.insertAdjacentHTML('afterbegin', nav.svg('meldingen')));
    void meldLaad();
    setInterval(() => void meldLaad(), 2 * 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void meldLaad());
    setTimeout(() => void watIsErNieuw(), 1200);
    document.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-meldbel], [data-meld-sluit], [data-meld-achter], [data-meld-onderhoud], [data-meld-terug], [data-meld-weg], [data-nieuw-dicht], [data-nieuw-achter], a, [data-meld-versie], [data-meld-href]');
      if (!t || (t.matches('a') && !t.closest('[data-meldblad]'))) return;
      if (t.matches('a')) return meldDicht();
      if (t.matches('[data-nieuw-dicht], [data-nieuw-achter]')) {
        $$('[data-nieuwpop], [data-nieuw-achter]').forEach((el) => el.remove());
      } else if (t.matches('[data-meldbel]')) {
        if (document.querySelector('[data-meldblad]:not([hidden])')) meldDicht();
        else await meldOpen('lijst');
      } else if (t.matches('[data-meld-sluit], [data-meld-achter]')) meldDicht();
      else if (t.matches('[data-meld-onderhoud]')) await meldOpen('onderhoud');
      else if (t.matches('[data-meld-terug]')) await meldOpen('lijst');
      else if (t.dataset.meldWeg) {
        t.closest('.melding')?.classList.add('gaat');
        const res = await deur('api/meldingen', { verwijder: t.dataset.meldWeg }).catch(() => null);
        if (res?.ok) meld = await res.json();
        meldGetal();
        await meldOpen('lijst');
      } else if (t.dataset.meldVersie) {
        meldDicht();
        await watIsErNieuw(t.dataset.meldVersie);
      } else if (t.dataset.meldHref) {
        location.href = t.dataset.meldHref;
      }
    });
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-nieuwpop]')) $$('[data-nieuwpop], [data-nieuw-achter]').forEach((el) => el.remove());
      else meldDicht();
    });
  }

  /*
   * Een nieuwe versie op de server (besluit 133): de app op een telefoon of
   * tablet blijft vaak open staan met de pagina van toen. Is er intussen een
   * andere versie, dan laadt de pagina opnieuw: als je de app weer opent, of
   * hooguit elke tien minuten, en nooit terwijl je typt.
   */
  let draaitNu = null;
  async function versieNu() {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      const h = await r.json();
      return h?.versie?.commit && h.versie.commit !== 'onbekend' ? h.versie.commit : null;
    } catch {
      return null;
    }
  }
  async function kijkVersie() {
    const v = await versieNu();
    if (!v) return;
    if (draaitNu == null) draaitNu = v;
    else if (v !== draaitNu && !typt() && !document.querySelector('dialog[open]')) location.reload();
  }
  function nieuweVersie() {
    void kijkVersie();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void kijkVersie());
    setInterval(() => void kijkVersie(), 10 * 60_000);
  }

  // Op elke pagina, ook die zonder menu (inrichten, het welkom).
  volledig();

  global.app = { $$, nl, zet, esc, bijnaOp, klokVan, wanneer, LINKS, telStand, schaal, haal, deur, tijdVanDeDag, lucht, luchtVan, klok, live, start, verwachting, gebundeld, zicht, aanbellen, offline, online, inHA, volledigGekozen, zetVolledig, naarHA };
})(window);
