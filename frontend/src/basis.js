/*
 * Wat elke tab van ontwerp 2 deelt (besluit 104): de wand van 1280 × 800 die
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
    vandaag: 'nieuw.html#waarom',
    apparaten: 'apparaten.html',
    opbrengst: 'nieuw.html#opbrengst',
    assistent: 'nieuw.html#assistent',
    instellingen: 'nieuw.html#bediening',
  };

  function telStand() {
    return innerWidth < 900 || innerHeight > innerWidth;
  }

  function schaal() {
    const tel = telStand();
    document.body.classList.toggle('tel-stand', tel);
    const wand = document.getElementById('wand');
    if (!tel && wand) {
      const s = Math.min(innerWidth / 1280, innerHeight / 800);
      wand.style.transform = `translate(-50%, -50%) scale(${s})`;
    }
  }

  async function haal(pad) {
    const res = await fetch(pad, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${pad}: ${res.status}`);
    return res.json();
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

  /** De live-stroom van besluiten; zonder valt de tab terug op verversen per minuut. */
  function live(opState) {
    try {
      const bron = new EventSource('api/events');
      bron.onmessage = (ev) => {
        try {
          opState(JSON.parse(ev.data));
        } catch {
          // Een half bericht: de volgende komt zo.
        }
      };
    } catch {
      // Geen EventSource: het verversen per minuut doet het werk.
    }
  }

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
    addEventListener('resize', schaal);
    schaal();
    klok();
    setInterval(klok, 10_000);
  }

  global.app = { $$, nl, zet, esc, klokVan, LINKS, telStand, schaal, haal, deur, tijdVanDeDag, lucht, luchtVan, klok, live, start };
})(window);
