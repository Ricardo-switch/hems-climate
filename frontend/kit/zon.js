/*
 * De zon als stem van de assistent (besluit 224, schets design/app2/Logo.html):
 * de hele zon met twintig stralen rondom, in mint, ijs en violet. De bovenste
 * helft is het teken van SunArc. De stralen bewegen per moment anders:
 *
 *   rust       ademen langzaam
 *   luistert   volgen het geluid van de microfoon
 *   denkt      een golf draait rond
 *   praat      springen op de stem (de echte niveaus als die er zijn); de zon gloeit mee
 *
 * zon.leef(svg, { stand, niveau, niveaus }) tekent in een <svg viewBox="0 0 120 120">
 * en houdt hem in beweging zolang hij in de pagina staat. Met Minder beweging
 * (html.sc-stil) of de instelling van het toestel staan de stralen stil en licht
 * alleen de zon op.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const KLEUREN = ['#6ee7b7', '#6fd3ff', '#8f86ff'];
  const N = 20;
  const RUST = [0.56, 0.82, 0.68, 0.94, 1, 0.86, 0.66, 0.8, 0.54];
  let teller = 0;

  const el = (naam, attr, ouder) => {
    const e = document.createElementNS(NS, naam);
    for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
    if (ouder) ouder.appendChild(e);
    return e;
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function meng(t) {
    const d = t * (KLEUREN.length - 1);
    const i = Math.min(KLEUREN.length - 2, Math.floor(d));
    const a = hex(KLEUREN[i]);
    const b = hex(KLEUREN[i + 1]);
    return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * (d - i))).join(' ')})`;
  }

  /** Tekent de zon en geeft terug hoe je de stralen zet: lengtes 0..1 en een gloed 0..1. */
  function teken(svg) {
    const id = `zon${++teller}`;
    const c = 60;
    const zon = 19;
    const r0 = 26;
    const R = 58;
    const dik = 4.6;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 120 120');
    const defs = el('defs', {}, svg);
    const gg = el('radialGradient', { id: `${id}g` }, defs);
    el('stop', { offset: '0', 'stop-color': '#f7b548', 'stop-opacity': '0.34' }, gg);
    el('stop', { offset: '1', 'stop-color': '#f7b548', 'stop-opacity': '0' }, gg);
    el('circle', { cx: c, cy: c, r: 58, fill: `url(#${id}g)` }, svg);
    const zg = el('radialGradient', { id: `${id}z`, cx: '42%', cy: '38%', r: '70%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffe7ad' }, zg);
    el('stop', { offset: '0.5', 'stop-color': '#f7b548' }, zg);
    el('stop', { offset: '1', 'stop-color': '#e58a3a' }, zg);
    const stralen = [];
    for (let i = 0; i < N; i++) {
      // Links mint, boven en onder ijs, rechts violet: gespiegeld, zodat de bovenkant het teken is.
      const a = ((180 - (360 / N) * i) * Math.PI) / 180;
      const kleur = meng((1 + Math.cos(a)) / 2);
      const gr = el('linearGradient', { id: `${id}s${i}`, gradientUnits: 'userSpaceOnUse' }, defs);
      el('stop', { offset: '0', 'stop-color': kleur, 'stop-opacity': '0.5' }, gr);
      el('stop', { offset: '1', 'stop-color': kleur }, gr);
      const lijn = el('line', { stroke: `url(#${id}s${i})`, 'stroke-width': dik, 'stroke-linecap': 'round' }, svg);
      stralen.push({ a, gr, lijn });
    }
    const bol = el('circle', { cx: c, cy: c, r: zon, fill: `url(#${id}z)` }, svg);
    return function zet(lengtes, gloei = 0) {
      stralen.forEach((s, i) => {
        const l = Math.max(0.1, Math.min(1, lengtes[i] ?? 0.5));
        const r1 = r0 + dik / 2;
        const r2 = r1 + l * (R - r1 - dik / 2);
        const p = { x1: c + r1 * Math.cos(s.a), y1: c - r1 * Math.sin(s.a), x2: c + r2 * Math.cos(s.a), y2: c - r2 * Math.sin(s.a) };
        for (const e of [s.lijn, s.gr]) for (const [k, w] of Object.entries(p)) e.setAttribute(k, w.toFixed(2));
      });
      bol.setAttribute('r', (zon * (1 + gloei * 0.06)).toFixed(2));
      bol.style.filter = gloei ? `brightness(${(1 + gloei * 0.18).toFixed(3)})` : '';
    };
  }

  const ruis = (t, z) => (Math.sin(t * 1.7 + z) + Math.sin(t * 2.9 + z * 1.3) + Math.sin(t * 4.3 + z * 0.7)) / 3;
  const rondje = (d) => Math.min(Math.abs(d), N - Math.abs(d));
  const rust = (i) => RUST[i % RUST.length];

  /** De lengte van straal i op tijd t, per stand. `niveau` is 0..1, `niveaus` de echte stem als die er is. */
  function lengte(stand, t, i, niveau, niveaus) {
    if (stand === 'luistert') {
      const stem = Math.max(0.15, Math.min(1, niveau));
      return 0.25 + stem * (0.5 + 0.4 * ruis(t * 6, i * 2.3));
    }
    if (stand === 'denkt') return 0.3 + 0.65 * Math.exp(-(rondje(i - ((t * 7) % N)) ** 2) / 4);
    if (stand === 'praat') {
      if (niveaus?.length) return 0.22 + 0.78 * (niveaus[Math.floor((i / N) * niveaus.length)] ?? 0);
      const greep = Math.max(0, Math.sin(t * 8.5)) ** 0.6 * (0.6 + 0.4 * Math.max(0, ruis(t, 3)));
      return 0.25 + greep * (0.55 + 0.35 * ruis(t * 5, i * 1.7));
    }
    return rust(i) * (0.88 + 0.1 * Math.sin(t * 1.1 + i * 0.9));
  }

  const levend = new Set();
  let raf = 0;
  const stilGezet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('sc-stil');

  function ronde(ms) {
    const t = ms / 1000;
    const stil = stilGezet();
    let zichtbaar = 0;
    for (const z of levend) {
      if (!z.svg.isConnected) {
        levend.delete(z);
        continue;
      }
      // Een dicht venster (display: none) tekent niets; de wand rekent dan niet mee.
      if (!z.svg.getClientRects().length) continue;
      zichtbaar++;
      const stand = z.stand() ?? 'rust';
      const gloei = stand === 'praat' ? (stil ? 0.5 : Math.max(0, Math.sin(t * 8.5))) : stand === 'luistert' ? (stil ? 0.3 : Math.min(1, z.niveau())) : 0;
      if (stil) {
        if (z.was !== stand) z.zet(Array.from({ length: N }, (_, i) => rust(i)), gloei);
      } else {
        const niveaus = z.niveaus();
        z.zet(Array.from({ length: N }, (_, i) => lengte(stand, t, i, z.niveau(), niveaus)), gloei);
      }
      z.was = stand;
    }
    if (!levend.size) raf = 0;
    // Niets in beeld: rustig kijken of er weer iets opengaat, niet zestig keer per tel.
    else if (!zichtbaar) raf = setTimeout(() => (raf = requestAnimationFrame(ronde)), 400);
    else raf = requestAnimationFrame(ronde);
  }

  /** Tekent de zon in `svg` en laat hem meeleven met `stand()`, `niveau()` en `niveaus()`. */
  function leef(svg, bron = {}) {
    const z = { svg, zet: teken(svg), was: null, stand: bron.stand ?? (() => 'rust'), niveau: bron.niveau ?? (() => 0), niveaus: bron.niveaus ?? (() => null) };
    z.zet(Array.from({ length: N }, (_, i) => rust(i)));
    levend.add(z);
    if (!raf) raf = requestAnimationFrame(ronde);
    return z;
  }

  global.zon = { teken, leef };
})(window);
