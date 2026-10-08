/*
 * Smart Climate, ontwerp 2: het huis in 3D.
 *
 * Tekent het huis als een opengewerkt poppenhuis, schuin van voren (een
 * axonometrie, geen echte 3D-motor: licht genoeg voor een tablet aan de muur).
 * Het huis bouwt zich op uit een beschrijving: de etages en kamers uit de
 * indeling, en alleen wat het huis heeft: panelen, een buitenunit, een
 * batterij, een laadpaal met auto. Komt er iets bij, dan groeit het huis.
 *
 * Energie is licht dat over draden loopt, met een kleur per bron. Het vermogen
 * staat bij de panelen, niet bij de zon: de zon is alleen het licht.
 *
 * Gebruik: huis.teken(element, model, { breedte, hoogte }).
 */
(function (global) {
  'use strict';

  const KLEUR = {
    zon: '#F7B548',
    ijs: '#6FD3FF',
    gloed: '#FF7A4D',
    mint: '#6EE7B7',
    net: '#9AAABB',
    violet: '#8F86FF',
    tekst: '#EEF3F7',
    zacht: '#B8C4CF',
    gedempt: '#7F8E9C',
  };

  // Afmetingen in eenheden van het huis.
  const FH = 1.3; // hoogte van een etage
  const D = 1.5; // diepte van het huis
  const R = 1.15; // hoogte van het dak
  const KAMER = 1.7; // breedte per gewicht van een kamer
  // De kijkhoek: schuin van rechtsvoor, de voorkant bijna recht, de zijgevel
  // wijkt naar achteren. y loopt van achter (0) naar voor (D).
  const AX = 0.97; // breedte, naar rechts
  const AY = 0.13; // en iets omlaag
  const BX = 0.4; // diepte, naar rechtsachter
  const BY = 0.46; // en omhoog
  const proj = (x, y, z) => [x * AX + (D - y) * BX, x * AY - (D - y) * BY - z];

  let uid = 0;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ------------------------------------------------------------ de opbouw */

  function opbouw(model) {
    const etages = model.etages ?? [];
    const breedtes = etages.map((e) => (e.dak ? 0 : e.kamers.reduce((s, k) => s + (k.gewicht ?? 1), 0)));
    const W = Math.max(3.4, ...breedtes.map((b) => b * KAMER));
    const gewoon = etages.filter((e) => !e.dak);
    const Ht = gewoon.length * FH; // hoogte tot de dakvoet
    const heeftDak = true;
    return { etages, W, Ht, heeftDak };
  }

  /** Alle punten die in beeld moeten, om de schaal te bepalen. */
  function omtrek(model, g, opts = {}) {
    const { W, Ht } = g;
    const pts = [
      [0, 0, Ht + (model.zonderDak ? 0.1 : R + 0.1)],
      [W, 0, Ht],
      [W, D, 0],
      [0, D, 0],
      [-0.4, D + 0.6, 0],
      [W + 0.8, D + 0.6, 0],
      [W + 0.6, -0.2, 0],
    ];
    if (model.auto || spook(model, 'auto') || opts.ruimte) pts.push([-2.7, D + 0.7, 0], [-2.7, D - 1.8, 0.9]);
    if (opts.ruimte) pts.push([-0.9, D + 1.4, 0], [g.W / 2, D / 2, g.Ht + R + 1.6]);
    if (model.net) pts.push([-0.9, D + 1.4, 0]);
    if (model.zon) pts.push([W / 2, D / 2, Ht + R + 1.6]);
    return pts;
  }

  function spook(model, wat) {
    return (model.spook ?? []).includes(wat);
  }

  /* -------------------------------------------------------------- tekenen */

  function teken(el, model, opts = {}) {
    el.innerHTML = svg(model, opts);
  }

  function svg(model, opts = {}) {
    const id = `h${++uid}`;
    const breed = opts.breedte ?? 760;
    const hoog = opts.hoogte ?? 560;
    const g = opbouw(model);
    const { W, Ht } = g;

    // Schaal en oorsprong zo dat alles past, met marge.
    const raw = omtrek(model, g, opts).map(([x, y, z]) => proj(x, y, z));
    const minX = Math.min(...raw.map((p) => p[0]));
    const maxX = Math.max(...raw.map((p) => p[0]));
    const minY = Math.min(...raw.map((p) => p[1]));
    const maxY = Math.max(...raw.map((p) => p[1]));
    const marge = opts.marge ?? 0.08;
    const k = Math.min((breed * (1 - 2 * marge)) / (maxX - minX), (hoog * (1 - 2 * marge)) / (maxY - minY)) * (opts.zoom ?? 1);
    const ox = breed / 2 - ((minX + maxX) / 2) * k + (opts.schuifX ?? 0);
    const oy = hoog / 2 - ((minY + maxY) / 2) * k + (opts.schuifY ?? 0);
    const P = (x, y, z = 0) => {
      const [a, b] = proj(x, y, z);
      return [ox + a * k, oy + b * k];
    };
    const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const poly = (pts3, attrs) => `<polygon points="${pts3.map((p) => pt(P(...p))).join(' ')}" ${attrs}/>`;
    const line = (pts3, attrs) => `<polyline points="${pts3.map((p) => pt(P(...p))).join(' ')}" fill="none" ${attrs}/>`;

    const tijd = model.tijd ?? 'dag';
    const nacht = tijd === 'nacht';
    const schemer = tijd === 'avond' || tijd === 'ochtend';
    const winter = model.seizoen === 'winter';
    const zonKracht = model.zon?.aandeel ?? 0;

    const defs = [];
    const lucht = [];
    const grond = [];
    const huis = [];
    const buiten = [];
    const stromen = [];
    const labels = [];
    const kamers = [];
    // Waar apparaten staan, voor de labels.
    const plek = {};

    /* ---- verlopen ---- */
    defs.push(`
      <linearGradient id="${id}-muur" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${nacht ? '#1b2639' : winter ? '#2a3546' : '#2b3a4c'}"/>
        <stop offset="1" stop-color="${nacht ? '#121a28' : winter ? '#1e2836' : '#1d2836'}"/>
      </linearGradient>
      <linearGradient id="${id}-rand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${KLEUR.zon}" stop-opacity="${(0.16 * zonKracht).toFixed(2)}"/><stop offset="1" stop-color="${KLEUR.zon}" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-dak" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${nacht ? '#172133' : '#26344a'}"/>
        <stop offset="1" stop-color="${nacht ? '#0f1726' : '#1a2536'}"/>
      </linearGradient>
      <linearGradient id="${id}-paneel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${zonKracht > 0 ? '#3b5c86' : '#1f3049'}"/>
        <stop offset="1" stop-color="${zonKracht > 0 ? '#1d3354' : '#152238'}"/>
      </linearGradient>
      <linearGradient id="${id}-glans" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${KLEUR.zon}" stop-opacity="0"/>
        <stop offset="0.5" stop-color="${KLEUR.zon}" stop-opacity="${(0.55 * zonKracht).toFixed(2)}"/>
        <stop offset="1" stop-color="${KLEUR.zon}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${id}-vloer" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#363e4b"/><stop offset="1" stop-color="#262d38"/></linearGradient>
      ${[['lamp', '#FFB765', 0.5], ['koelt', KLEUR.ijs, 0.62], ['wacht', KLEUR.zon, 0.42], ['goed', KLEUR.mint, 0.34], ['warmt', KLEUR.gloed, 0.6], ['rust', '#9fb3c8', 0.1]]
        .map(([st, c, o]) => `<linearGradient id="${id}-w-${st}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="${(o * 0.5).toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="${o}"/></linearGradient>`)
        .join('')}
      <linearGradient id="${id}-hoek" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-gras" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${winter ? '#2b3a4a' : nacht ? '#0f1a1a' : '#1b2c27'}"/><stop offset="1" stop-color="${winter ? '#1f2b38' : nacht ? '#0b1414' : '#14211e'}"/></linearGradient>
      <radialGradient id="${id}-zon"><stop offset="0" stop-color="#FFE7A8"/><stop offset="0.35" stop-color="${KLEUR.zon}"/><stop offset="1" stop-color="${KLEUR.zon}" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-licht"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-koel"><stop offset="0" stop-color="${KLEUR.ijs}" stop-opacity="0.45"/><stop offset="1" stop-color="${KLEUR.ijs}" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-warm"><stop offset="0" stop-color="${KLEUR.gloed}" stop-opacity="0.45"/><stop offset="1" stop-color="${KLEUR.gloed}" stop-opacity="0"/></radialGradient>
      <filter id="${id}-zacht" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(k * 0.12).toFixed(1)}"/></filter>
      <filter id="${id}-gloed" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(k * 0.05).toFixed(1)}"/></filter>
    `);

    /* ---- lucht: zon, maan, sterren, wolken (achter het huis) ---- */
    const mid = P(W / 2, D / 2, Ht + R * 0.6);
    const boog = k * Math.max(W, 4.2) * 0.95;
    if (model.zon?.stand != null && !nacht) {
      const f = model.zon.stand; // 0 opkomst links, 1 ondergang rechts
      const h = model.zon.hoogte ?? Math.sin(Math.PI * f);
      const sx = mid[0] + (f - 0.5) * 2 * boog;
      const sy = mid[1] - h * boog * 0.62 + boog * 0.12;
      lucht.push(`<path d="M ${mid[0] - boog} ${mid[1] + boog * 0.12} A ${boog} ${boog * 0.74} 0 0 1 ${mid[0] + boog} ${mid[1] + boog * 0.12}" fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 7"/>`);
      const r = k * 0.22;
      lucht.push(`<circle cx="${sx}" cy="${sy}" r="${r * 3.2}" fill="url(#${id}-zon)" opacity="${(0.22 + 0.3 * (1 - (model.wolken ?? 0))).toFixed(2)}"/>`);
      lucht.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="#FFD27A" opacity="${(1 - 0.55 * (model.wolken ?? 0)).toFixed(2)}"/>`);
    }
    if (nacht) {
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 46; i++) {
        lucht.push(`<circle cx="${(rnd() * breed).toFixed(0)}" cy="${(rnd() * hoog * 0.5).toFixed(0)}" r="${(0.5 + rnd() * 1.1).toFixed(1)}" fill="#fff" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"/>`);
      }
      const mx = mid[0] + boog * 0.5;
      const my = mid[1] - boog * 0.55;
      lucht.push(`<circle cx="${mx}" cy="${my}" r="${k * 0.42}" fill="#E8EEF8" opacity="0.08"/><circle cx="${mx}" cy="${my}" r="${k * 0.2}" fill="#E9EEF6"/><circle cx="${mx + k * 0.08}" cy="${my - k * 0.05}" r="${k * 0.18}" fill="#101a2b"/>`);
    }
    if (model.wolken) {
      const n = Math.round(2 + model.wolken * 3);
      for (let i = 0; i < n; i++) {
        const cx = mid[0] + (i / Math.max(1, n - 1) - 0.5) * boog * 1.7;
        const cy = mid[1] - boog * (0.35 + 0.18 * ((i * 37) % 3) / 2);
        const s = k * (0.7 + ((i * 53) % 5) * 0.12);
        lucht.push(`<g opacity="${(0.25 + 0.35 * model.wolken).toFixed(2)}" filter="url(#${id}-zacht)"><ellipse cx="${cx}" cy="${cy}" rx="${s * 1.5}" ry="${s * 0.42}" fill="${winter ? '#9fb0c2' : '#8a9bb0'}"/><ellipse cx="${cx + s * 0.4}" cy="${cy - s * 0.25}" rx="${s * 0.8}" ry="${s * 0.45}" fill="${winter ? '#aebdcc' : '#94a5b9'}"/></g>`);
      }
    }

    /* ---- grond: het perceel, de oprit ---- */
    const gx0 = model.auto || spook(model, 'auto') || opts.ruimte ? -3.0 : -1.4;
    const gx1 = W + 1.3;
    grond.push(poly([[gx0, -0.6, 0], [gx1, -0.6, 0], [gx1, D + 1.9, 0], [gx0, D + 1.9, 0]], `fill="url(#${id}-gras)"`));
    // De rand van het perceel, als een dikke plaat.
    grond.push(poly([[gx0, D + 1.9, 0], [gx1, D + 1.9, 0], [gx1, D + 1.9, -0.18], [gx0, D + 1.9, -0.18]], `fill="#0b1219"`));
    grond.push(poly([[gx1, -0.6, 0], [gx1, D + 1.9, 0], [gx1, D + 1.9, -0.18], [gx1, -0.6, -0.18]], `fill="#080e14"`));
    // Een pad van tegels naar de voordeur.
    for (let i = 0; i < 4; i++) {
      const y0 = D + 0.35 + i * 0.36;
      grond.push(poly([[0.5, y0, 0.004], [1.0, y0, 0.004], [1.0, y0 + 0.26, 0.004], [0.5, y0 + 0.26, 0.004]], `fill="#ffffff" opacity="0.05"`));
    }
    if (model.auto || spook(model, 'auto')) {
      grond.push(poly([[-2.75, -0.4, 0.005], [-1.2, -0.4, 0.005], [-1.2, D + 1.7, 0.005], [-2.75, D + 1.7, 0.005]], `fill="#1d2933"`));
    }
    // Schaduw onder het huis.
    grond.push(`<g filter="url(#${id}-zacht)" opacity="0.6">${poly([[0.1, 0.1, 0], [W + 0.25, 0.1, 0], [W + 0.25, D + 0.25, 0], [0.1, D + 0.25, 0]], 'fill="#05090d"')}</g>`);

    /* ---- het huis, etage voor etage, van onder naar boven ---- */
    let z0 = 0;
    const gewoon = g.etages.filter((e) => !e.dak);
    const dakEtage = g.etages.find((e) => e.dak);
    for (const etage of gewoon) {
      const z1 = z0 + FH;
      const totaal = etage.kamers.reduce((s, k2) => s + (k2.gewicht ?? 1), 0);
      let x0 = 0;
      for (const kamer of etage.kamers) {
        const x1 = x0 + (W * (kamer.gewicht ?? 1)) / totaal;
        tekenKamer(kamer, x0, x1, z0, z1, false);
        x0 = x1;
      }
      // De vloer als doorsnede: een strook aan de voorkant.
      huis.push(poly([[0, D, z0], [W, D, z0], [W, D, z0 - 0.09], [0, D, z0 - 0.09]], `fill="#3c4a5b"`));
      z0 = z1;
    }

    const dak = !model.zonderDak;
    const zt = z0;
    if (dak) {
    // Het dak, met de zolder erin als die er is.
    const zolder = dakEtage?.kamers?.[0];
    // Achtergevel van de zolder (driehoek).
    huis.push(poly([[0, 0, zt], [W, 0, zt], [W / 2, 0, zt + R]], `fill="${kleurAchter(zolder)}"`));
    if (zolder) {
      huis.push(poly([[0, 0, zt], [W, 0, zt], [W, D, zt], [0, D, zt]], `fill="#1a2330"`));
      sfeer(zolder, 0.3 * W, 0.7 * W, zt, zt + R * 0.8);
      for (const app of zolder.apparaten ?? []) apparaat(app, W * 0.3, W * 0.7, zt, zt + R * 0.85, true);
      kamers.push({ id: zolder.id, naam: zolder.naam, xm: W / 2, z0: zt, z1: zt + R });
      kamerLabel(zolder, W / 2, zt + R * 0.62, true);
    }
    huis.push(poly([[0, D, zt], [W, D, zt], [W, D, zt - 0.09], [0, D, zt - 0.09]], `fill="#3c4a5b"`));

    }

    // De rechtergevel, per etage, met ramen.
    z0 = 0;
    for (const etage of gewoon) {
      const z1 = z0 + FH;
      huis.push(poly([[W, 0, z0], [W, D, z0], [W, D, z1], [W, 0, z1]], `fill="url(#${id}-muur)"`));
      if (zonKracht > 0) huis.push(poly([[W, 0, z0], [W, D, z0], [W, D, z1], [W, 0, z1]], `fill="url(#${id}-rand)"`));
      const laatste = etage.kamers[etage.kamers.length - 1];
      const brandt = nacht || schemer ? (laatste?.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan) : false;
      const ramen = 2;
      for (let i = 0; i < ramen; i++) {
        const y0 = 0.22 + i * (D - 0.3) / ramen;
        const y1 = y0 + (D - 0.3) / ramen - 0.22;
        const ra = [[W + 0.001, y0, z0 + 0.35], [W + 0.001, y1, z0 + 0.35], [W + 0.001, y1, z1 - 0.28], [W + 0.001, y0, z1 - 0.28]];
        huis.push(poly(ra, `fill="${brandt ? '#F4C27E' : nacht ? '#0f1a2a' : '#1b3047'}" ${brandt ? `opacity="0.9"` : ''} stroke="#4a5a6c" stroke-width="1"`));
        if (brandt) huis.push(`<g filter="url(#${id}-zacht)" opacity="0.5">${poly(ra, 'fill="#FFB765"')}</g>`);
        if (!brandt && !nacht) huis.push(poly([ra[0], [W + 0.001, (y0 + y1) / 2, z0 + 0.35], [W + 0.001, y0 + 0.05, z1 - 0.28]], 'fill="#ffffff" opacity="0.05"'));
        // Een screen voor het raam, als die er is.
        const screen = (laatste?.apparaten ?? []).find((a) => a.soort === 'screen');
        if (screen && i === 0) {
          const dicht = screen.dicht ?? 0;
          const zb = z1 - 0.28 - dicht * (z1 - 0.63);
          huis.push(poly([[W + 0.02, y0 - 0.03, z1 - 0.25], [W + 0.02, y1 + 0.03, z1 - 0.25], [W + 0.02, y1 + 0.03, zb], [W + 0.02, y0 - 0.03, zb]], `fill="#3a4757" opacity="0.92"`));
          for (let s = 1; s < 6; s++) {
            const zz = z1 - 0.25 - (s / 6) * (z1 - 0.25 - zb);
            huis.push(line([[W + 0.021, y0 - 0.03, zz], [W + 0.021, y1 + 0.03, zz]], 'stroke="#536376" stroke-width="0.8"'));
          }
        }
      }
      z0 = z1;
    }
    if (dak) {
    // Rechter dakvlak met panelen.
    huis.push(poly([[W / 2, -0.08, zt + R], [W + 0.14, -0.08, zt - 0.08], [W + 0.14, D + 0.08, zt - 0.08], [W / 2, D + 0.08, zt + R]], `fill="url(#${id}-dak)"`));
    if (model.zon || spook(model, 'panelen')) {
      const rijen = 2;
      const kol = Math.max(3, Math.min(6, Math.round((model.zon?.panelen ?? 6) / rijen)));
      for (let r = 0; r < rijen; r++) {
        for (let c = 0; c < kol; c++) {
          const u0 = 0.12 + r * 0.42;
          const u1 = u0 + 0.38;
          const v0 = 0.12 + c * ((D - 0.24) / kol);
          const v1 = v0 + (D - 0.24) / kol - 0.06;
          const q = (u, v) => [W - u * (W / 2) + 0.02, v, zt + u * R + 0.02];
          const pts = [q(u0, v0), q(u0, v1), q(u1, v1), q(u1, v0)];
          if (spook(model, 'panelen')) huis.push(poly(pts, `fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.5" stroke-dasharray="3 3"`));
          else huis.push(poly(pts, `fill="url(#${id}-paneel)" stroke="#5b7aa0" stroke-opacity="0.6" stroke-width="0.8"`));
        }
      }
      if (zonKracht > 0) {
        // Het licht dat de panelen vangen, als een glans over het dakvlak.
        const q = (u, v) => [W - u * (W / 2) + 0.03, v, zt + u * R + 0.03];
        huis.push(`<g class="sc-glans">${poly([q(0.1, 0.05), q(0.1, D - 0.05), q(0.92, D - 0.05), q(0.92, 0.05)], `fill="url(#${id}-glans)"`)}</g>`);
      }
    }
    }
    // De doorsnede: de omtrek van het huis aan de voorkant, als een snijlijn.
    if (dak) {
      huis.push(line([[0, D, 0], [0, D, zt], [W / 2, D, zt + R], [W, D, zt], [W, D, 0]], `stroke="#C9D6E2" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"`));
      huis.push(line([[W / 2, D, zt + R], [W / 2, 0, zt + R]], `stroke="#C9D6E2" stroke-opacity="0.25" stroke-width="1.2"`));
    } else {
      huis.push(line([[0, D, 0], [0, D, zt], [W, D, zt], [W, D, 0]], `stroke="#C9D6E2" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"`));
      huis.push(line([[0, D, zt], [0, 0, zt], [W, 0, zt], [W, D, zt]], `stroke="#C9D6E2" stroke-opacity="0.3" stroke-width="1.4" stroke-linejoin="round"`));
    }
    // Schoorsteen of afvoer van de cv, als die er is.
    if (model.cv && dak) {
      const cx = W * 0.32;
      const zz = zt + R * (cx / (W / 2)) - 0.1;
      huis.push(poly([[cx, 0.4, zz], [cx + 0.18, 0.4, zz], [cx + 0.18, 0.4, zz + 0.55], [cx, 0.4, zz + 0.55]], 'fill="#3a4656"'));
      if (model.cv.aan) {
        for (let i = 0; i < 3; i++) {
          const p = P(cx + 0.09, 0.4, zz + 0.7 + i * 0.28);
          huis.push(`<circle class="sc-damp" style="animation-delay:${i * 0.8}s" cx="${p[0]}" cy="${p[1]}" r="${k * (0.09 + i * 0.04)}" fill="#cfd8e2" opacity="0.18"/>`);
        }
      }
    }

    /* ---- buiten: buitenunit, batterij, laadpaal en auto, het net ---- */
    if (model.buitenunit) bouwBuitenunit(model.buitenunit, W, 0.25);
    if (model.batterij || spook(model, 'batterij')) bouwBatterij(model.batterij, spook(model, 'batterij'));
    if (model.auto || spook(model, 'auto')) bouwAuto(model.auto, spook(model, 'auto'));
    if (model.net) bouwNet();

    /* ---- stromen ---- */
    const hub = [W + 0.25, D + 0.35, 0.02];
    const voetPaneel = [W + 0.12, D - 0.2, zt - 0.05];
    for (const s of model.stromen ?? []) {
      const kleur = s.van === 'zon' ? KLEUR.zon : s.van === 'batterij' ? KLEUR.mint : s.van === 'net' ? KLEUR.net : KLEUR.zon;
      const pad = route(s.van, s.naar);
      if (!pad) continue;
      const d = pad.map((p) => pt(P(...p))).join(' ');
      const dik = 1.6 + 2.2 * (s.sterkte ?? 0.5);
      stromen.push(`<polyline points="${d}" fill="none" stroke="${kleur}" stroke-opacity="0.18" stroke-width="${dik + 3}" stroke-linejoin="round" stroke-linecap="round"/>`);
      stromen.push(`<polyline class="sc-stroom" style="animation-duration:${(2.6 - 1.6 * (s.sterkte ?? 0.5)).toFixed(2)}s" points="${d}" fill="none" stroke="${kleur}" stroke-width="${dik}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 11"/>`);
    }
    function route(van, naar) {
      const pts = [];
      const kamerPunt = (wie) => {
        const k2 = vindKamer(wie);
        return k2 ? [k2.xm, D + 0.02, k2.z0 + 0.03] : [W * 0.5, D + 0.02, 0.03];
      };
      if (van === 'zon') pts.push(voetPaneel, [W + 0.12, D + 0.02, zt - 0.05], [W + 0.12, D + 0.02, 0.05], hub);
      else if (van === 'batterij') pts.push([W + 0.2, D - 0.45, 0.4], [W + 0.2, D - 0.45, 0.02], hub);
      else if (van === 'net') pts.push([-0.6, D + 1.1, 0.02], [-0.6, D + 0.6, 0.02], [W + 0.25, D + 0.6, 0.02], hub);
      else if (van === 'auto') pts.push([-0.95, D + 0.1, 0.4], [-0.95, D + 0.35, 0.02], hub);
      if (naar === 'batterij') pts.push([W + 0.2, D - 0.45, 0.02], [W + 0.2, D - 0.45, 0.4]);
      else if (naar === 'auto') pts.push([W + 0.25, D + 0.35, 0.02], [-0.95, D + 0.35, 0.02], [-0.95, D + 0.1, 0.4]);
      else if (naar === 'net') pts.push([W + 0.25, D + 0.6, 0.02], [-0.6, D + 0.6, 0.02], [-0.6, D + 1.1, 0.02]);
      else if (naar?.startsWith('kamer:')) {
        const kp = kamerPunt(naar.slice(6));
        pts.push([W + 0.02, D + 0.02, 0.03], [kp[0], D + 0.02, 0.03]);
        if (kp[2] > 0.1) pts.push([kp[0], D + 0.02, kp[2]]);
      } else if (naar === 'huis') pts.push([W + 0.02, D + 0.02, 0.03], [W * 0.55, D + 0.02, 0.03]);
      return pts.length > 1 ? pts : null;
    }

    /* ---- labels: getallen op het huis ---- */
    const anker = {
      panelen: [W * 0.76, D * 0.55, zt + R * 0.48],
      batterij: [W + 0.32, D - 0.47, 1.0],
      auto: [-1.95, D - 1.0, 0.86],
      laadpaal: [-0.95, D + 0.1, 0.75],
      net: [-0.6, D + 1.25, 0.55],
      buitenunit: [W + 0.55, 0.6, 0.55],
    };
    const zoek = (bij) => {
      if (Array.isArray(bij)) return bij;
      if (anker[bij]) return anker[bij];
      if (plek[bij]) return plek[bij];
      if (bij.startsWith('kamer:')) {
        const k2 = vindKamer(bij.slice(6));
        if (k2) return [k2.xm, D, (k2.z0 + Math.min(k2.z1, k2.z0 + FH)) / 2];
      }
      return [W / 2, D / 2, 0];
    };
    for (const l of model.labels ?? []) {
      const a = P(...zoek(l.bij));
      const fs = l.groot ? 26 : 14;
      const regels = [l.titel, ...(l.regels ?? [])].filter(Boolean);
      const breedte = Math.max(...regels.map((r, i) => r.length * (i === 0 && l.groot ? fs * 0.56 : (i === 0 ? 14 : 12.5) * 0.53))) + 24;
      const hoogte = (l.groot ? 34 : 22) + (regels.length - 1) * 17 + 10;
      const lx = a[0] + (l.dx ?? 40);
      const ly = a[1] + (l.dy ?? -40);
      const bx = l.dx < 0 ? lx - breedte : lx;
      const by = ly - hoogte / 2;
      const kleur = KLEUR[l.toon] ?? KLEUR.zacht;
      labels.push(`<g class="sc-label">
        <polyline points="${a[0]},${a[1]} ${lx},${ly}" fill="none" stroke="${kleur}" stroke-opacity="0.55" stroke-width="1"/>
        <circle cx="${a[0]}" cy="${a[1]}" r="3" fill="${kleur}"/>
        <rect x="${bx}" y="${by}" width="${breedte}" height="${hoogte}" rx="12" fill="#0E1828" fill-opacity="0.78" stroke="${kleur}" stroke-opacity="0.35"/>
        ${regels
          .map((r, i) =>
            i === 0
              ? `<text x="${bx + 12}" y="${by + (l.groot ? 30 : 19)}" fill="${l.groot ? kleur : KLEUR.tekst}" font-family="Bricolage Grotesque, Figtree, sans-serif" font-weight="600" font-size="${l.groot ? fs : 14}">${esc(r)}</text>`
              : `<text x="${bx + 12}" y="${by + (l.groot ? 30 : 19) + i * 17}" fill="${i === 1 ? kleur : KLEUR.zacht}" font-family="Figtree, sans-serif" font-size="12.5" font-weight="${i === 1 ? 600 : 500}">${esc(r)}</text>`,
          )
          .join('')}
      </g>`);
    }

    /* ---- kamers ---- */
    function vindKamer(wie) {
      return kamers.find((x) => x.id === wie || x.naam === wie);
    }
    function kleurAchter(kamer) {
      if (!kamer) return '#202b3a';
      const st = kamer.stand;
      if (st === 'koelt') return '#21496a';
      if (st === 'warmt') return '#5a3324';
      if (st === 'wacht') return '#4a3d22';
      if (st === 'goed') return '#22443d';
      return nacht ? '#1a2331' : '#2e3b4e';
    }
    function sfeer(kamer, x0, x1, z0, z1) {
      const xm = (x0 + x1) / 2;
      const c = P(xm, 0.1, (z0 + z1) / 2);
      const r = k * (x1 - x0) * 0.55;
      if (kamer.stand === 'koelt') huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${r}" ry="${r * 0.6}" fill="url(#${id}-koel)"/>`);
      if (kamer.stand === 'warmt') huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${r}" ry="${r * 0.6}" fill="url(#${id}-warm)"/>`);
    }
    function tekenKamer(kamer, x0, x1, z0, z1) {
      const xm = (x0 + x1) / 2;
      kamers.push({ id: kamer.id, naam: kamer.naam, xm, z0, z1 });
      const donker = nacht && !(kamer.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
      // Linkerwand (de tussenmuur of de buitenmuur), achterwand, vloer.
      huis.push(poly([[x0, 0, z0], [x0, D, z0], [x0, D, z1], [x0, 0, z1]], `fill="${donker ? '#121a26' : '#3a4a60'}"`));
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], `fill="${donker ? '#141c29' : '#33425a'}"`));
      const lampAan = (kamer.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
      const tint = (nacht || schemer) && lampAan ? 'lamp' : kamer.stand ?? 'rust';
      if (!donker) huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], `fill="url(#${id}-w-${tint})"`));
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, D, z0], [x0, D, z0]], `fill="${donker ? '#0f151f' : `url(#${id}-vloer)`}"`));
      // Donkere hoeken waar muur en vloer elkaar raken.
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z0 + 0.32], [x0, 0, z0 + 0.32]], `fill="url(#${id}-hoek)"`));
      huis.push(poly([[x0, 0, z0], [x0, D, z0], [x0, D, z0 + 0.25], [x0, 0, z0 + 0.25]], `fill="url(#${id}-hoek)"`));

      // Een raam in de achtermuur, met de lucht erachter.
      if (x1 - x0 > 1.15 && !kamer.geenRaam) {
        const rx0 = x0 + 0.28;
        const rx1 = Math.min(x0 + 0.95, x1 - 1.05 > x0 + 0.95 ? x0 + 0.95 : x1 - 0.25);
        const raam = [[rx0, 0.005, z0 + 0.42], [rx1, 0.005, z0 + 0.42], [rx1, 0.005, z1 - 0.28], [rx0, 0.005, z1 - 0.28]];
        huis.push(poly(raam, `fill="${nacht ? '#0a1222' : winter ? '#7f93a8' : '#4d7eac'}" stroke="#55657a" stroke-width="1.5"`));
        if (!nacht) huis.push(poly([raam[0], [rx0 + (rx1 - rx0) * 0.45, 0.005, z0 + 0.42], [rx0, 0.005, z1 - 0.45]], 'fill="#ffffff" opacity="0.12"'));
        huis.push(line([[(rx0 + rx1) / 2, 0.006, z0 + 0.42], [(rx0 + rx1) / 2, 0.006, z1 - 0.28]], 'stroke="#55657a" stroke-width="1.2"'));
      }
      sfeer(kamer, x0, x1, z0, z1);
      for (const app of kamer.apparaten ?? []) apparaat(app, x0, x1, z0, z1, false);
      // De muur ertussen als doorsnede.
      huis.push(line([[x0, D, z0], [x0, D, z1]], `stroke="#C9D6E2" stroke-opacity="0.35" stroke-width="1.6"`));
      kamerLabel(kamer, x0 + 0.16, z1 - 0.2, false);
    }
    function kamerLabel(kamer, xl, zl, midden) {
      if (kamer.naam && !kamer.stil) {
        const t = P(xl, D, zl);
        const anker = midden ? 'middle' : 'start';
        const kleur = { koelt: KLEUR.ijs, warmt: KLEUR.gloed, wacht: KLEUR.zon, goed: KLEUR.mint }[kamer.stand] ?? KLEUR.zacht;
        labels.push(`<g class="sc-kamer" data-kamer="${esc(kamer.id ?? kamer.naam)}">
          <text x="${t[0]}" y="${t[1]}" text-anchor="${anker}" fill="${KLEUR.zacht}" font-family="Figtree, sans-serif" font-size="12.5" font-weight="600">${esc(kamer.naam)}</text>
          ${kamer.temp ? `<text x="${t[0]}" y="${t[1] + 28}" text-anchor="${anker}" fill="${KLEUR.tekst}" font-family="Bricolage Grotesque, Figtree, sans-serif" font-size="${Math.min(28, k * 0.32)}" font-weight="600">${esc(kamer.temp)}</text>` : ''}
          ${kamer.zin ? `<text x="${t[0]}" y="${t[1] + 46}" text-anchor="${anker}" fill="${kleur}" font-family="Figtree, sans-serif" font-size="12" font-weight="600">${esc(kamer.zin)}</text>` : ''}
        </g>`);
      }
    }

    /* ---- apparaten in een kamer ---- */
    function doos(x0, y0, z0, w, d, h, kleuren) {
      const [boven, voor, zij] = kleuren;
      return [
        poly([[x0 + w, y0, z0], [x0 + w, y0 + d, z0], [x0 + w, y0 + d, z0 + h], [x0 + w, y0, z0 + h]], `fill="${zij}"`),
        poly([[x0, y0 + d, z0], [x0 + w, y0 + d, z0], [x0 + w, y0 + d, z0 + h], [x0, y0 + d, z0 + h]], `fill="${voor}"`),
        poly([[x0, y0, z0 + h], [x0 + w, y0, z0 + h], [x0 + w, y0 + d, z0 + h], [x0, y0 + d, z0 + h]], `fill="${boven}"`),
      ].join('');
    }
    function cirkelOpVoorkant(xc, y, zc, r, attrs) {
      const pts = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push([xc + Math.cos(a) * r, y, zc + Math.sin(a) * r]);
      }
      return poly(pts, attrs);
    }
    function apparaat(app, x0, x1, z0, z1, onderDak) {
      const xm = (x0 + x1) / 2;
      if (app.soort === 'airco') {
        const ax = x1 - 0.95;
        const az = onderDak ? z0 + R * 0.38 : z1 - 0.42;
        plek[`airco:${app.naam ?? ''}`] = [ax + 0.38, 0.1, az];
        huis.push(doos(ax, 0.02, az, 0.75, 0.16, 0.2, ['#dfe7ee', '#c9d3dc', '#aab6c1']));
        if (app.aan) {
          const kleur = app.stand === 'warmt' ? KLEUR.gloed : KLEUR.ijs;
          for (let i = 0; i < 3; i++) {
            const a = P(ax + 0.15 + i * 0.22, 0.3, az - 0.08);
            const b = P(ax + 0.15 + i * 0.22, 0.75, az - 0.38);
            huis.push(`<path class="sc-lucht" style="animation-delay:${i * 0.35}s" d="M ${a[0]} ${a[1]} Q ${a[0] + 8} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`);
          }
        }
      } else if (app.soort === 'radiator') {
        const rx = x0 + 0.25;
        huis.push(doos(rx, 0.02, z0 + 0.12, 0.8, 0.08, 0.36, ['#4b5664', app.aan ? '#c4704f' : '#5a6574', '#3d4754']));
        if (app.aan) {
          const c = P(rx + 0.4, 0.3, z0 + 0.45);
          huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.7}" ry="${k * 0.35}" fill="url(#${id}-warm)"/>`);
        }
      } else if (app.soort === 'vloer') {
        if (app.aan) huis.push(poly([[x0 + 0.1, 0.1, z0 + 0.005], [x1 - 0.1, 0.1, z0 + 0.005], [x1 - 0.1, D - 0.1, z0 + 0.005], [x0 + 0.1, D - 0.1, z0 + 0.005]], `fill="${KLEUR.gloed}" opacity="0.16"`));
      } else if (app.soort === 'lamp') {
        const lx = app.x != null ? x0 + (x1 - x0) * app.x : xm;
        const ly = D * 0.42;
        const top = onderDak ? z0 + R * 0.62 : z1;
        huis.push(line([[lx, ly, top], [lx, ly, top - 0.28]], 'stroke="#8090a0" stroke-width="1"'));
        huis.push(doos(lx - 0.09, ly - 0.09, top - 0.36, 0.18, 0.18, 0.09, [app.aan ? '#FFE2B0' : '#5c6876', app.aan ? '#e8b878' : '#4a5664', app.aan ? '#d6a565' : '#3c4755']));
        if (app.aan) {
          const kleur = app.kleur ?? '#FFD9A0';
          const v = P(lx, ly, z0);
          const r = k * 0.62;
          huis.push(`<ellipse cx="${v[0]}" cy="${v[1]}" rx="${r}" ry="${r * 0.5}" fill="${kleur}" opacity="0.22" filter="url(#${id}-zacht)"/>`);
          const b = P(lx, ly, top - 0.36);
          const l1 = P(lx - 0.45, ly, z0 + 0.05);
          const r1 = P(lx + 0.45, ly, z0 + 0.05);
          huis.push(`<polygon points="${b[0]},${b[1]} ${l1[0]},${l1[1]} ${r1[0]},${r1[1]}" fill="${kleur}" opacity="0.07"/>`);
        }
      } else if (app.soort === 'droger' || app.soort === 'wasmachine' || app.soort === 'vaatwasser') {
        const dx = app.x != null ? x0 + (x1 - x0) * app.x : x1 - 0.7;
        plek[app.soort] = [dx + 0.25, 0.4, z0 + 0.6];
        huis.push(doos(dx, 0.15, z0, 0.5, 0.5, 0.6, ['#e9eef2', '#d7dee5', '#b9c3cd']));
        if (app.soort !== 'vaatwasser') {
          huis.push(cirkelOpVoorkant(dx + 0.25, 0.651, z0 + 0.27, 0.15, 'fill="#5e6c7b" stroke="#9aa7b4" stroke-width="1.5"'));
          if (app.aan) {
            const c = P(dx + 0.25, 0.652, z0 + 0.27);
            huis.push(`<g class="sc-trommel" style="transform-origin:${c[0]}px ${c[1]}px">${cirkelOpVoorkant(dx + 0.25, 0.652, z0 + 0.27, 0.1, `fill="none" stroke="${KLEUR.zon}" stroke-width="2" stroke-dasharray="4 4"`)}</g>`);
          }
        } else {
          huis.push(poly([[dx + 0.06, 0.651, z0 + 0.5], [dx + 0.44, 0.651, z0 + 0.5], [dx + 0.44, 0.651, z0 + 0.53], [dx + 0.06, 0.651, z0 + 0.53]], 'fill="#8a97a4"'));
        }
        if (app.aan) {
          const c = P(dx + 0.25, 0.4, z0 + 0.62);
          huis.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${k * 0.32}" fill="url(#${id}-zon)" opacity="0.35"/>`);
        }
      } else if (app.soort === 'cv') {
        const cx = x0 + 0.2;
        plek.cv = [cx + 0.21, 0.1, z0 + 1.05];
        huis.push(doos(cx, 0.02, z0 + 0.5, 0.42, 0.22, 0.55, ['#e2e7ec', '#cfd6de', '#aeb8c2']));
        if (app.aan) {
          const c = P(cx + 0.21, 0.25, z0 + 0.62);
          huis.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${k * 0.12}" fill="${KLEUR.gloed}" class="sc-vlam"/>`);
        }
      } else if (app.soort === 'tv') {
        huis.push(poly([[x0 + 0.3, 0.03, z0 + 0.45], [x0 + 1.1, 0.03, z0 + 0.45], [x0 + 1.1, 0.03, z0 + 0.9], [x0 + 0.3, 0.03, z0 + 0.9]], `fill="${app.aan ? '#3d6fb0' : '#0b0f14'}" stroke="#2c3642"`));
      } else if (app.soort === 'bank') {
        huis.push(doos(x0 + 0.25, D - 0.85, z0, 1.1, 0.45, 0.28, ['#46536a', '#3a465a', '#2f394a']));
      }
    }

    /* ---- buiten ---- */
    function bouwBuitenunit(unit, Wx, y0) {
      buiten.push(doos(Wx + 0.05, y0, 0, 0.5, 0.7, 0.55, ['#dbe3ea', '#c6d0d9', '#aab5c0']));
      const c = P(Wx + 0.551, y0 + 0.35, 0.28);
      buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.2}" ry="${k * 0.24}" fill="#5c6977"/>`);
      if (unit.aan) buiten.push(`<g class="sc-fan" style="transform-origin:${c[0]}px ${c[1]}px"><line x1="${c[0] - k * 0.16}" y1="${c[1]}" x2="${c[0] + k * 0.16}" y2="${c[1]}" stroke="#cfd8e1" stroke-width="2"/><line x1="${c[0]}" y1="${c[1] - k * 0.18}" x2="${c[0]}" y2="${c[1] + k * 0.18}" stroke="#cfd8e1" stroke-width="2"/></g>`);
      if (unit.aan && winter) {
        for (let i = 0; i < 2; i++) {
          const p = P(Wx + 0.3, y0 + 0.35, 0.8 + i * 0.3);
          buiten.push(`<circle class="sc-damp" style="animation-delay:${i}s" cx="${p[0]}" cy="${p[1]}" r="${k * 0.12}" fill="#dfe6ee" opacity="0.2"/>`);
        }
      }
    }
    function bouwBatterij(b, isSpook) {
      const x = W + 0.02;
      const y = D - 0.75;
      if (isSpook) {
        buiten.push(`<g opacity="0.7">${poly([[x + 0.3, y, 0], [x + 0.3, y + 0.55, 0], [x + 0.3, y + 0.55, 1.1], [x + 0.3, y, 1.1]], `fill="none" stroke="${KLEUR.mint}" stroke-dasharray="4 4"`)}</g>`);
        return;
      }
      buiten.push(doos(x, y, 0, 0.3, 0.55, 1.1, ['#e6ecf1', '#cdd6de', '#eef2f5']));
      const pct = (b.procent ?? 50) / 100;
      // Het niveau als een lichtstrook op de zijkant.
      buiten.push(poly([[x + 0.301, y + 0.22, 0.15], [x + 0.301, y + 0.33, 0.15], [x + 0.301, y + 0.33, 0.95], [x + 0.301, y + 0.22, 0.95]], 'fill="#5c6977"'));
      buiten.push(poly([[x + 0.302, y + 0.22, 0.15], [x + 0.302, y + 0.33, 0.15], [x + 0.302, y + 0.33, 0.15 + 0.8 * pct], [x + 0.302, y + 0.22, 0.15 + 0.8 * pct]], `fill="${KLEUR.mint}" ${b.stand !== 'rust' ? 'class="sc-puls"' : ''}`));
    }
    function bouwAuto(a, isSpook) {
      // Een laadpaal en een auto op de oprit, links voor het huis.
      const px = -0.95;
      const py = D + 0.1;
      buiten.push(doos(px - 0.08, py - 0.08, 0, 0.16, 0.16, 0.75, ['#dfe6ec', '#c5cfd8', '#a7b2bd']));
      if (!isSpook) buiten.push(poly([[px - 0.081, py - 0.04, 0.5], [px - 0.081, py + 0.04, 0.5], [px - 0.081, py + 0.04, 0.62], [px - 0.081, py - 0.04, 0.62]], `fill="${a?.stand === 'laadt' ? KLEUR.mint : '#66727f'}"`));
      const x0 = -2.45;
      const y0 = D - 1.75;
      const L = 2.1;
      const B = 0.95;
      if (isSpook) {
        buiten.push(`<g opacity="0.65">${poly([[x0, y0, 0.02], [x0 + B, y0, 0.02], [x0 + B, y0 + L, 0.02], [x0, y0 + L, 0.02]], `fill="none" stroke="${KLEUR.ijs}" stroke-dasharray="5 5"`)}</g>`);
        return;
      }
      const lak = a?.kleur ?? '#8fa3b8';
      // Schaduw onder de auto.
      buiten.push(`<g filter="url(#${id}-zacht)" opacity="0.55">${poly([[x0 - 0.05, y0 - 0.05, 0], [x0 + B + 0.12, y0 - 0.05, 0], [x0 + B + 0.12, y0 + L + 0.1, 0], [x0 - 0.05, y0 + L + 0.1, 0]], 'fill="#020509"')}</g>`);
      const h0 = 0.16; // bodemvrijheid
      const h1 = 0.52; // tot de gordel
      const kap0 = y0 + L - 0.62; // waar de motorkap begint
      const ruit0 = y0 + 0.5;
      const ruit1 = y0 + L - 0.75;
      // Romp: zijkant, voorkant, motorkap en kofferbak.
      buiten.push(poly([[x0 + B, y0 + 0.05, h0], [x0 + B, y0 + L, h0], [x0 + B, y0 + L, h1 - 0.06], [x0 + B, kap0, h1], [x0 + B, y0 + 0.05, h1]], `fill="${lak}"`));
      buiten.push(poly([[x0, y0 + L, h0], [x0 + B, y0 + L, h0], [x0 + B, y0 + L, h1 - 0.06], [x0, y0 + L, h1 - 0.06]], `fill="${schaduw(lak, 0.72)}"`));
      buiten.push(poly([[x0, kap0, h1], [x0 + B, kap0, h1], [x0 + B, y0 + L, h1 - 0.06], [x0, y0 + L, h1 - 0.06]], `fill="${schaduw(lak, 1.18)}"`));
      buiten.push(poly([[x0, y0 + 0.05, h1], [x0 + B, y0 + 0.05, h1], [x0 + B, ruit0, h1], [x0, ruit0, h1]], `fill="${schaduw(lak, 1.1)}"`));
      // Cabine: glas rondom, dak erop.
      const d0 = 0.08;
      buiten.push(poly([[x0 + B - d0, ruit0, h1], [x0 + B - d0, ruit1 + 0.2, h1], [x0 + B - d0 - 0.06, ruit1, h1 + 0.3], [x0 + B - d0 - 0.06, ruit0 + 0.12, h1 + 0.3]], 'fill="#18273a"'));
      buiten.push(poly([[x0 + d0, ruit1 + 0.2, h1], [x0 + B - d0, ruit1 + 0.2, h1], [x0 + B - d0 - 0.06, ruit1, h1 + 0.3], [x0 + d0 + 0.06, ruit1, h1 + 0.3]], 'fill="#2b4562"'));
      buiten.push(poly([[x0 + d0 + 0.06, ruit0 + 0.12, h1 + 0.3], [x0 + B - d0 - 0.06, ruit0 + 0.12, h1 + 0.3], [x0 + B - d0 - 0.06, ruit1, h1 + 0.3], [x0 + d0 + 0.06, ruit1, h1 + 0.3]], `fill="${schaduw(lak, 1.25)}"`));
      buiten.push(line([[x0 + B - d0 - 0.03, (ruit0 + ruit1) / 2 + 0.05, h1 + 0.02], [x0 + B - d0 - 0.06, (ruit0 + ruit1) / 2 + 0.03, h1 + 0.29]], `stroke="${lak}" stroke-width="2"`));
      // Wielen, op de zijkant.
      for (const wy of [y0 + 0.42, y0 + L - 0.42]) {
        const pts = [];
        for (let i = 0; i < 20; i++) {
          const t = (i / 20) * Math.PI * 2;
          pts.push([x0 + B + 0.012, wy + Math.cos(t) * 0.19, 0.19 + Math.sin(t) * 0.19]);
        }
        buiten.push(poly(pts, 'fill="#0b1016"'));
        const naaf = [];
        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2;
          naaf.push([x0 + B + 0.014, wy + Math.cos(t) * 0.09, 0.19 + Math.sin(t) * 0.09]);
        }
        buiten.push(poly(naaf, 'fill="#7d8a98"'));
      }
      // Koplampen als een lichtstreep.
      buiten.push(poly([[x0 + 0.1, y0 + L + 0.002, h1 - 0.16], [x0 + B - 0.1, y0 + L + 0.002, h1 - 0.16], [x0 + B - 0.1, y0 + L + 0.002, h1 - 0.11], [x0 + 0.1, y0 + L + 0.002, h1 - 0.11]], 'fill="#e9f1f8" opacity="0.9"'));
      // De kabel naar de laadpaal.
      if (a?.stand === 'laadt') {
        const p1 = P(px - 0.08, py, 0.55);
        const p2 = P(x0 + B, y0 + L - 0.25, 0.45);
        buiten.push(`<path d="M ${p1[0]} ${p1[1]} C ${p1[0] - 10} ${p1[1] + 30}, ${p2[0] + 14} ${p2[1] + 28}, ${p2[0]} ${p2[1]}" fill="none" stroke="#2b3542" stroke-width="3"/>`);
        buiten.push(`<path class="sc-stroom" d="M ${p1[0]} ${p1[1]} C ${p1[0] - 10} ${p1[1] + 30}, ${p2[0] + 14} ${p2[1] + 28}, ${p2[0]} ${p2[1]}" fill="none" stroke="${a.bron === 'net' ? KLEUR.net : KLEUR.zon}" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round"/>`);
      }
    }
    function bouwNet() {
      // De aansluiting op het net: een kastje met de kabel de grond in, links voor.
      const x = -0.6;
      const y = D + 1.25;
      buiten.push(doos(x - 0.2, y - 0.15, 0, 0.4, 0.3, 0.55, ['#59677a', '#4a5769', '#3d495a']));
      const t = P(x, y + 0.15, 0.3);
      buiten.push(`<text x="${t[0]}" y="${t[1] + 4}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="11" font-weight="700" fill="#cfd8e1">⚡</text>`);
    }
    function schaduw(hex, f) {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
      return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }

    return `<svg class="sc-huis" viewBox="0 0 ${breed} ${hoog}" width="100%" height="100%" role="img" aria-label="${esc(model.beschrijving ?? 'Het huis')}">
      <defs>${defs.join('')}</defs>
      <g>${lucht.join('')}</g>
      <g>${grond.join('')}</g>
      <g>${huis.join('')}</g>
      <g>${stromen.join('')}</g>
      <g>${buiten.join('')}</g>
      <g>${labels.join('')}</g>
    </svg>`;
  }

  global.huis = { teken, svg, KLEUR };
})(window);
