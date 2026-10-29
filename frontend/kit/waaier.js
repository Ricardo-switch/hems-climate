/*
 * De zonnewaaier (schets Wand-Voortgang): het huis komt op als een zon boven
 * de horizon. Elke straal is iets dat het huis doet; hoe verder hij reikt, hoe
 * verder het is. Vier ringen: gevonden, geleerd, kijkt mee, werkt. Wat
 * meekijkt, groeit gestreept naar de buitenste ring.
 *
 * waaier.teken(svg, {
 *   groepen: [{ id, naam, onderwerpen: [{ id, kort, titel, stand, p }] }],
 *   cx, cy, r0, R,          // het midden op de horizon, de zon en de buitenste ring
 *   namen, groepnamen,      // de namen bij de stralen en langs de ring
 *   ringen,                 // de namen van de vier ringen op de horizon, of null
 *   getal, onder,           // in de zon
 *   gekozen,                // de straal die oplicht
 *   groei,                  // false: de stralen staan meteen, zoals in een kleine waaier op een kaart
 *   knoppen,                // false: de stralen zijn geen knoppen, de waaier is een plaatje
 * })
 * waaier.voortgang(stand, deel, klaar) geeft 0..1: werkt is 1, kijkt mee 0,75
 * plus een kwart van hoe klaar het huis is om over te nemen, leert 0,25 tot 0,5.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const KLEUR = { werkt: 'var(--mint)', kijkt: 'var(--ijs)', leert: 'var(--violet)' };
  let teller = 0;

  function voortgang(stand, deel, klaar) {
    if (stand === 'werkt') return 1;
    if (stand === 'kijkt') return 0.75 + 0.25 * Math.max(0, Math.min(1, klaar ?? 0));
    return 0.25 + 0.25 * Math.max(0, Math.min(1, deel ?? 0));
  }

  const el = (naam, attr, ouder) => {
    const e = document.createElementNS(NS, naam);
    for (const [k, v] of Object.entries(attr ?? {})) e.setAttribute(k, v);
    if (ouder) ouder.appendChild(e);
    return e;
  };
  const punt = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy - r * Math.sin(deg * Math.PI / 180)];
  /** Een stuk van een ring, van hoek a1 tot a2 (graden, linksom vanaf rechts). */
  const sector = (cx, cy, r1, r2, a1, a2) => {
    const [x1, y1] = punt(cx, cy, r2, a1);
    const [x2, y2] = punt(cx, cy, r2, a2);
    const [x3, y3] = punt(cx, cy, r1, a2);
    const [x4, y4] = punt(cx, cy, r1, a1);
    return `M${x1} ${y1}A${r2} ${r2} 0 0 0 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 1 ${x4} ${y4}Z`;
  };
  const boog = (cx, cy, r, a1, a2) => {
    const [x1, y1] = punt(cx, cy, r, a1);
    const [x2, y2] = punt(cx, cy, r, a2);
    return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  function teken(svg, o) {
    const { cx, cy, r0, R } = o;
    const id = `w${++teller}`;
    svg.innerHTML = '';
    // De stralen groeien alleen de eerste keer; daarna (een tik, nieuwe cijfers) staan ze meteen. Met groei: false nooit.
    svg.classList.toggle('stil', o.groei === false || svg.classList.contains('waaier'));
    svg.classList.add('waaier');
    // Met knoppen is het een groep stralen om op te tikken; zonder (een kleine waaier op een kaart) een plaatje.
    const knoppen = o.knoppen !== false;
    svg.setAttribute('role', knoppen ? 'group' : 'img');
    svg.classList.toggle('gekozen-iets', !!o.gekozen);
    const defs = el('defs', {}, svg);
    const zon = el('radialGradient', { id: `${id}zon`, cx: '50%', cy: '100%', r: '100%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffe7ad' }, zon);
    el('stop', { offset: '0.6', 'stop-color': '#f7b548' }, zon);
    el('stop', { offset: '1', 'stop-color': '#e58a3a' }, zon);
    const gloed = el('radialGradient', { id: `${id}gloed`, cx: '50%', cy: '100%', r: '50%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#f7b548', 'stop-opacity': '0.28' }, gloed);
    el('stop', { offset: '1', 'stop-color': '#f7b548', 'stop-opacity': '0' }, gloed);
    const streep = el('pattern', { id: `${id}streep`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 6, height: 6, fill: 'rgba(111, 211, 255, 0.22)' }, streep);
    el('rect', { width: 3, height: 6, fill: 'rgba(111, 211, 255, 0.75)' }, streep);

    el('rect', { x: cx - R * 1.5, y: cy - R * 1.2, width: R * 3, height: R * 1.2, fill: `url(#${id}gloed)` }, svg);
    const straal = (p) => r0 + p * (R - r0);
    for (let i = 0; i < 4; i++) {
      const r = straal((i + 1) / 4);
      el('path', { d: boog(cx, cy, r, 180, 0), class: `ring${i === 3 ? ' buiten' : ''}` }, svg);
      if (o.ringen) {
        const y = cy + (i % 2 ? 32 : 18);
        el('line', { x1: cx + r, y1: cy + 3, x2: cx + r, y2: y - 10, class: 'ringstreep' }, svg);
        el('text', { x: cx + r, y, 'text-anchor': 'middle', class: `ringnaam${i === 3 ? ' buiten' : ''}` }, svg).textContent = o.ringen[i];
      }
    }
    const uit = o.horizon ?? 6;
    el('line', { x1: cx - R - uit, y1: cy, x2: cx + R + uit, y2: cy, class: 'horizon' }, svg);

    // De hoeken: de groepen met een kier ertussen.
    const groot = !!o.namen;
    const rand = groot ? 9 : 4;
    const kier = groot ? 6.5 : 4;
    const tussen = groot ? 1.4 : 0.8;
    const groepen = o.groepen.filter((g) => g.onderwerpen.length);
    const n = groepen.reduce((t, g) => t + g.onderwerpen.length, 0);
    const per = (180 - 2 * rand - (groepen.length - 1) * kier) / Math.max(1, n);
    let a = 180 - rand;
    for (const g of groepen) {
      const begin = a;
      for (const x of g.onderwerpen) {
        const a1 = a - tussen / 2;
        const a2 = a - per + tussen / 2;
        const midden = (a1 + a2) / 2;
        const groep = el('g', { class: `straal${x.id === o.gekozen ? ' gekozen' : ''}`, ...(knoppen ? { 'data-straal': x.id, role: 'button', tabindex: 0, 'aria-label': x.titel ?? x.kort } : {}) }, svg);
        el('path', { d: sector(cx, cy, r0 + 4, R, a1, a2), class: 'spoor' }, groep);
        const vul = el('g', { class: 'vul', style: `transform-origin: ${cx}px ${cy}px; animation-delay: ${Math.round((180 - a) * 4)}ms` }, groep);
        if (x.stand === 'kijkt') {
          el('path', { d: sector(cx, cy, r0 + 4, straal(0.75), a1, a2), fill: KLEUR.kijkt, opacity: 0.88 }, vul);
          if (x.p > 0.75) el('path', { d: sector(cx, cy, straal(0.75), straal(x.p), a1, a2), fill: `url(#${id}streep)` }, vul);
        } else {
          el('path', { d: sector(cx, cy, r0 + 4, straal(x.p), a1, a2), fill: KLEUR[x.stand] ?? 'var(--gedempt)', opacity: 0.9 }, vul);
        }
        el('path', { d: boog(cx, cy, straal(x.p), a1, a2), class: 'tip', 'stroke-width': groot ? 2 : 1 }, vul);
        if (o.namen) {
          const [lx, ly] = punt(cx, cy, R + 24, midden);
          const links = midden > 90;
          el('text', { x: lx, y: ly, 'text-anchor': links ? 'end' : 'start', 'dominant-baseline': 'middle', transform: `rotate(${links ? 180 - midden : -midden} ${lx} ${ly})` }, groep).textContent = x.kort;
        }
        a -= per;
      }
      if (o.groepnamen) {
        const pad = `${id}g${g.id}`;
        el('path', { id: pad, d: boog(cx, cy, R + 11, begin, a), fill: 'none' }, svg);
        const t = el('text', { class: 'groepnaam', 'text-anchor': 'middle' }, svg);
        el('textPath', { href: `#${pad}`, startOffset: '50%' }, t).textContent = g.naam;
      }
      a -= kier;
    }

    el('path', { d: `${boog(cx, cy, r0, 180, 0)}Z`, fill: `url(#${id}zon)` }, svg);
    if (o.getal != null) {
      const groot2 = r0 >= 60;
      el('text', { x: cx, y: cy - (groot2 ? r0 * 0.36 : r0 * 0.22), 'text-anchor': 'middle', class: 'zongetal', 'font-size': groot2 ? Math.round(r0 * 0.5) : Math.round(r0 * 0.5) }, svg).textContent = o.getal;
      if (o.onder && groot2) el('text', { x: cx, y: cy - r0 * 0.13, 'text-anchor': 'middle', class: 'zononder', 'font-size': 11.5 }, svg).textContent = o.onder;
    }
  }

  global.waaier = { teken, voortgang, KLEUR };
})(typeof window !== 'undefined' ? window : globalThis);
