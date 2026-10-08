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
  const klokVan = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  /* Waar de tabs staan: tot ze in ontwerp 2 zijn, in de proefomgeving. */
  const LINKS = {
    thuis: 'thuis.html',
    vandaag: 'vandaag.html',
    apparaten: 'apparaten.html',
    opbrengst: 'opbrengst.html',
    assistent: 'assistent.html',
    instellingen: 'instellingen.html',
  };

  function telStand() {
    return innerWidth < 900 || innerHeight > innerWidth;
  }

  /** De stand en de schaal, op <html>; het script in de <head> deed dit al vóór de eerste weergave. */
  function schaal() {
    const d = document.documentElement;
    d.classList.toggle('tel-stand', telStand());
    // Een breder scherm dan 16:10 (een tablet zonder de balken van het systeem):
    // de wand groeit mee in de breedte, de hoogte blijft 800. Zo vult hij het scherm.
    const breed = Math.min(1700, Math.max(1280, Math.round((800 * innerWidth) / innerHeight)));
    d.style.setProperty('--wandbreedte', `${breed}px`);
    d.style.setProperty('--wandschaal', String(Math.min(innerWidth / breed, innerHeight / 800)));
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
    // Zonder bron stopt de stroom; alleen weghalen laat hem soms doorlopen.
    const laag = document.querySelector('.aanbel');
    laag?.querySelectorAll('img').forEach((img) => img.removeAttribute('src'));
    laag?.remove();
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

  /** Zet de navigatie, de stand en de klok voor een tab. */
  function start(tab) {
    const balk = document.getElementById('balk');
    const tabs = document.getElementById('tabs');
    if (balk) nav.balk(balk, tab, LINKS);
    if (tabs) nav.tabs(tabs, tab, LINKS);
    $$('[data-tandwiel]').forEach((a) => {
      a.innerHTML = nav.svg('instellingen');
      a.setAttribute('href', LINKS.instellingen);
    });
    // De live-stroom, ook voor de deurbel op een pagina zonder live gegevens.
    stroom();
    // Om de app te installeren; dat kan alleen over HTTPS (of met een uitzondering in Chrome).
    if ('serviceWorker' in navigator && global.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    addEventListener('keydown', (e) => e.key === 'Escape' && sluitBel());
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
  }

  global.app = { $$, nl, zet, esc, klokVan, LINKS, telStand, schaal, haal, deur, tijdVanDeDag, lucht, luchtVan, klok, live, start, verwachting, gebundeld, zicht, aanbellen, offline, online };
})(window);
