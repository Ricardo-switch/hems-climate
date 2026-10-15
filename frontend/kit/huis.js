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

  /* De kleuren en soorten van de inrichting (zie inrichten). */
  const MEUBEL = {
    hout: ['#8a7660', '#76634f', '#634f3f'],
    donker: ['#55647a', '#47556a', '#3b475a'],
    stof: ['#62759a', '#55678a', '#495a79'],
    kussen: ['#7b8eb3', '#6b7ea2', '#5f7091'],
    wit: ['#dfe6ec', '#c9d2db', '#b0bcc7'],
    blad: ['#c3ccd5', '#aeb8c2', '#99a4af'],
    dek: ['#7d93b8', '#6a80a5', '#5c7194'],
    doos: ['#a08460', '#8a7151', '#765f44'],
    groen: '#5d9c78',
    kleed: '#8c7aa8',
  };
  const WITGOED = /^(droger|wasmachine|vaatwasser)$/;
  /**
   * Een lijn-icoon per soort kamer, in de stijl van het menu (24 bij 24, lijn
   * 1,8). Het staat voor de naam van de kamer; op het startscherm is dat alles
   * wat er van de inrichting te zien is.
   */
  const KAMER_ICOON = {
    slaapkamer: '<path d="M3 19v-8h18v8"/><path d="M3 15h18"/><path d="M6 11V8.5A1.5 1.5 0 0 1 7.5 7h3A1.5 1.5 0 0 1 12 8.5V11"/>',
    logeerkamer: '<path d="M3 19v-8h18v8"/><path d="M3 15h18"/><path d="M6 11V8.5A1.5 1.5 0 0 1 7.5 7h3A1.5 1.5 0 0 1 12 8.5V11"/>',
    kinderkamer: '<path d="M3 19v-7h13v7"/><path d="M3 16h13"/><path d="M5.5 12v-2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/><path d="M19 3l.7 1.6 1.6.7-1.6.7L19 7.6l-.7-1.6-1.6-.7 1.6-.7z"/>',
    woonkamer: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 2 2v1h14v-1a2 2 0 1 1 2 2v2H3v-2a2 2 0 0 1 0-4z"/><path d="M5 18v2M19 18v2"/>',
    woonkeuken: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 2 2v1h14v-1a2 2 0 1 1 2 2v2H3v-2a2 2 0 0 1 0-4z"/><path d="M5 18v2M19 18v2"/>',
    keuken: '<path d="M3 11h14v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M17 12h4"/><path d="M8 7.5c0-1.2 1-1.3 1-2.5M12 7.5c0-1.2 1-1.3 1-2.5"/>',
    eetkamer: '<path d="M6 3v5a2 2 0 0 0 4 0V3M8 10v11"/><path d="M17 3c-2 1.2-3 3.4-3 6.5V13h3v8"/>',
    badkamer: '<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V6.5a2.5 2.5 0 0 1 5 0"/><path d="M7 19l-1 2M17 19l1 2"/>',
    toilet: '<path d="M7 3h6v6H7z"/><path d="M5 9h14a6 6 0 0 1-6 6h-2l1 6H8l1-6"/>',
    hal: '<path d="M3 20h5v-4h4v-4h4V8h5"/>',
    werkkamer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    wasruimte: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M7 6.5h2"/>',
    berging: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
    kamer: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M14.5 12h.01"/>',
  };
  /**
   * De soort van een hele kamer: zoals de dienst hem doorgeeft (`inrichting`,
   * gekozen of voorgesteld, besluit 119), of anders uit de naam en de zones.
   */
  function soortVanKamer(kamer) {
    if (kamer.inrichting) return kamer.inrichting;
    const zones = (kamer.zones ?? []).map(soortVan).filter(Boolean);
    if (zones.includes('keuken') && zones.includes('woonkamer')) return 'woonkeuken';
    return soortVan(kamer.naam) ?? zones[0] ?? null;
  }
  /** De terugval als de dienst geen soort meegeeft; de dienst raadt ruimer (house.ts). */
  function soortVan(naam) {
    const n = String(naam ?? '').toLowerCase();
    if (/woonkeuken|open keuken|leefkeuken/.test(n)) return 'woonkeuken';
    if (/bijkeuken|wasruimte|washok|laundry/.test(n)) return 'wasruimte';
    if (/keuken|kitchen/.test(n)) return 'keuken';
    if (/logeer|gast|guest/.test(n)) return 'logeerkamer';
    if (/kinder|baby|speelkamer/.test(n)) return 'kinderkamer';
    if (/^(hoofd|ouder|grote |master )?slaapkamer$|master|bedroom$/.test(n)) return 'slaapkamer';
    if (/slaap|bedroom/.test(n)) return 'kinderkamer';
    if (/^(toilet|wc)\b/.test(n)) return 'toilet';
    if (/bad|douche|bathroom/.test(n)) return 'badkamer';
    if (/eetkamer|eethoek|dining/.test(n)) return 'eetkamer';
    if (/woon|zithoek|zitkamer|lounge|living|serre|huiskamer/.test(n)) return 'woonkamer';
    if (/trapkast|meterkast/.test(n)) return 'berging';
    if (/^(hal|gang|overloop|entree|portaal|vide|trap|hall|landing)\b/.test(n)) return 'hal';
    if (/werk|kantoor|studeer|hobby|office|studio|bureau|game|atelier/.test(n)) return 'werkkamer';
    if (/zolder|vliering|berg|attic|opslag|kelder|garage/.test(n)) return 'berging';
    return null;
  }
  // Afmetingen in eenheden van het huis.
  const FH = 1.55; // hoogte van een etage
  const D = 1.5; // diepte van het huis
  /** Een binnenunit op ware grootte: zo'n 90 bij 30 centimeter, bij een etage van 2,6 meter (besluit 131). */
  const AIRCO = { b: 0.56, h: 0.19, d: 0.15 };
  // Hoogte van het dak; hoger als er kamers onder liggen, zoals een zolderverdieping.
  let R = 1.15;
  const KAMER = 1.7; // breedte per gewicht van een kamer
  // De kijkhoek: schuin van rechtsvoor, de voorkant bijna recht, de zijgevel
  // wijkt naar achteren. y loopt van achter (0) naar voor (D).
  const AX = 0.97; // breedte, naar rechts
  const AY = 0.13; // en iets omlaag
  const BX = 0.4; // diepte, naar rechtsachter
  const BY = 0.46; // en omhoog
  const proj = (x, y, z) => [x * AX + (D - y) * BX, x * AY - (D - y) * BY - z];

  let uid = 0;

  /**
   * Een gekleurde lamp (besluit 129): drie tinten van zijn kleur, licht tot
   * donker, voor de kap. Null voor wit licht (een hex-kleur).
   */
  function tintenVan(kleur) {
    const m = /^hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%/.exec(kleur ?? '');
    if (!m) return null;
    const h = Math.round(Number(m[1]));
    const sat = Math.max(55, Math.min(100, Number(m[2])));
    return [`hsl(${h} ${sat}% 80%)`, `hsl(${h} ${sat}% 66%)`, `hsl(${h} ${sat}% 54%)`];
  }

  /** De kleur van de eerste gekleurde lamp die brandt in een kamer, of null. */
  function kleurlampVan(kamer) {
    return (kamer.apparaten ?? []).find((a) => a.soort === 'lamp' && a.aan && tintenVan(a.kleur))?.kleur ?? null;
  }

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
      [-0.4, D + (model.zonderDak ? 0.7 : 0.6), 0],
      [W + 0.8, D + (model.zonderDak ? 0.7 : 0.6), 0],
      [W + 0.6, -0.2, 0],
    ];
    if (model.auto || spook(model, 'auto') || opts.ruimte) pts.push([-2.7, D + 0.7, 0], [-2.7, D - 1.8, 0.9]);
    if (opts.ruimte) pts.push([-0.9, D + 1.4, 0], [g.W / 2, D / 2, g.Ht + R + 1.6]);
    if (model.net) pts.push([-0.9, D + 1.4, 0]);
    if (model.oprit) pts.push([-2.9, D + 1.5, 0], [-2.8, D + 1.4, 1.5], [-2.7, D - 1.8, 0.9]);
    if (model.tuin) pts.push([g.W + 2.0, -1.9, 0], [g.W + 2.0, -1.9, 1.0]);
    if (model.terras) pts.push([g.W + 2.0, D + 0.4, 0], [g.W + 2.0, 0.4, 0.8]);
    if (model.voortuin) pts.push([W + 0.1, D + 1.7, 0], [1.3, D + 1.7, 0]);
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
    R = (model.etages ?? []).some((e) => e.dak && (e.kamers ?? []).length > 0) ? 2.0 : 1.15;
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
    /** Een kamer in de kleur van zijn gekleurde lamp, 's avonds (besluit 129): een verloop per kleur. */
    const wassen = new Map();
    function kleurWas(kamer) {
      const kleur = kleurlampVan(kamer);
      if (!kleur) return null;
      if (!wassen.has(kleur)) {
        const n = `k${wassen.size}`;
        wassen.set(kleur, n);
        huis.push(`<defs><linearGradient id="${id}-w-${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${kleur}" stop-opacity="0.3"/><stop offset="1" stop-color="${kleur}" stop-opacity="0.58"/></linearGradient></defs>`);
      }
      return wassen.get(kleur);
    }
    const buiten = [];
    const stromen = [];
    const labels = [];
    const kamers = [];
    // Met `opts.tik`: per kamer een onzichtbaar vlak om op te tikken, bovenop alles.
    const tikken = [];
    const tik = (kamer, pts) => {
      if (!opts.tik) return;
      const naam = esc(kamer.naam ?? '');
      tikken.push(poly(pts, `class="sc-tik" data-kamer="${esc(kamer.id ?? kamer.naam)}" fill="transparent" role="link" tabindex="0" aria-label="${naam}"`));
    };
    // Waar apparaten staan, voor de labels.
    const plek = {};
    /** Onder het dak hangt de airco tegen de linkermuur; dan staat de droger er niet onder. */
    let aircoLinks = false;
    /** Heeft de inrichting de achterwand nodig, dan hangt de radiator aan de zijmuur. */
    let radiatorZij = false;
    /** Is er een etage boven de kamer die nu getekend wordt? Alleen dan een trap. */
    let erBoven = false;
    /** De kamer waarvan nu de apparaten getekend worden, voor de controle. */
    let blokKamer = null;
    /** En die kamer zelf: de airco zoekt een plek naast het raam (besluit 131). */
    let dezeKamer = null;
    /** Met `opts.controle`: elk meubel en apparaat als blok, voor de tests. */
    const controle = [];

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
      // De zon staat óp de boog: een halve ellips van opkomst (links) tot
      // ondergang (rechts), en `stand` is de hoek erlangs. Zo valt hij nooit
      // naast de stippellijn, ook niet halverwege de ochtend.
      const f = Math.max(0, Math.min(1, model.zon.stand));
      const voet = mid[1] + boog * 0.12;
      const ry = boog * 0.74;
      const sx = mid[0] - boog * Math.cos(Math.PI * f);
      const sy = voet - ry * Math.sin(Math.PI * f);
      lucht.push(`<path d="M ${mid[0] - boog} ${voet} A ${boog} ${ry} 0 0 1 ${mid[0] + boog} ${voet}" fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 7"/>`);
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
    // Ingezoomd op een etage: alleen een smalle rand grond om het huis.
    // Zonder dak strak om het huis, tenzij de oprit of de tuin erbij hoort (de begane grond).
    const gx0 = model.auto || model.oprit || spook(model, 'auto') || opts.ruimte ? -3.0 : model.zonderDak ? -0.45 : -1.4;
    const gx1 = model.tuin || model.terras ? W + 2.1 : model.zonderDak ? W + 0.75 : W + 1.3;
    const gy0 = model.tuin ? -2.0 : model.zonderDak ? -0.35 : -0.6;
    const gy1 = model.oprit || model.voortuin ? D + 1.9 : model.zonderDak ? D + 0.7 : D + 1.9;
    grond.push(poly([[gx0, gy0, 0], [gx1, gy0, 0], [gx1, gy1, 0], [gx0, gy1, 0]], `fill="url(#${id}-gras)"`));
    // De rand van het perceel, als een dikke plaat.
    grond.push(poly([[gx0, gy1, 0], [gx1, gy1, 0], [gx1, gy1, -0.18], [gx0, gy1, -0.18]], `fill="#0b1219"`));
    grond.push(poly([[gx1, gy0, 0], [gx1, gy1, 0], [gx1, gy1, -0.18], [gx1, gy0, -0.18]], `fill="#080e14"`));
    // Een pad van tegels naar de voordeur.
    for (let i = 0; i < (model.zonderDak ? 0 : 4); i++) {
      const y0 = D + 0.35 + i * 0.36;
      grond.push(poly([[0.5, y0, 0.004], [1.0, y0, 0.004], [1.0, y0 + 0.26, 0.004], [0.5, y0 + 0.26, 0.004]], `fill="#ffffff" opacity="0.05"`));
    }
    if (model.auto || model.oprit || spook(model, 'auto')) {
      grond.push(poly([[-2.75, -0.4, 0.005], [-1.2, -0.4, 0.005], [-1.2, D + 1.7, 0.005], [-2.75, D + 1.7, 0.005]], `fill="#1d2933"`));
    }
    // Schaduw onder het huis.
    grond.push(`<g filter="url(#${id}-zacht)" opacity="0.6">${poly([[0.1, 0.1, 0], [W + 0.25, 0.1, 0], [W + 0.25, D + 0.25, 0], [0.1, D + 0.25, 0]], 'fill="#05090d"')}</g>`);

    /* ---- het huis, etage voor etage, van onder naar boven ---- */
    let z0 = 0;
    const gewoon = g.etages.filter((e) => !e.dak);
    const dakEtage = g.etages.find((e) => e.dak);
    for (const [ei, etage] of gewoon.entries()) {
      const z1 = z0 + FH;
      // Een etage die alleen getekend wordt (ingezoomd), zegt het zelf: `erBoven`.
      erBoven = ei < gewoon.length - 1 || (dakEtage?.kamers ?? []).length > 0 || etage.erBoven === true;
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
    // Het dak, met de kamers eronder; elk met zijn stuk van de schuine wand.
    const onderDak = dakEtage?.kamers ?? [];
    const dakZ = (x) => zt + R * (1 - Math.abs(x - W / 2) / (W / 2));
    const stukGevel = (x0, x1) => {
      const pts = [[x0, 0, zt], [x1, 0, zt], [x1, 0, dakZ(x1)]];
      if (x0 < W / 2 && x1 > W / 2) pts.push([W / 2, 0, zt + R]);
      pts.push([x0, 0, dakZ(x0)]);
      return pts;
    };
    if (onderDak.length === 0) huis.push(poly(stukGevel(0, W), `fill="${kleurAchter(null)}"`));
    {
      const totaal = onderDak.reduce((t, k2) => t + (k2.gewicht ?? 1), 0);
      let x0 = 0;
      for (const kamer of onderDak) {
        const x1 = x0 + (W * (kamer.gewicht ?? 1)) / totaal;
        const xm = (x0 + x1) / 2;
        const lampAan = (kamer.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
        const donker = nacht && !lampAan;
        if (x0 > 0) huis.push(poly([[x0, 0, zt], [x0, D, zt], [x0, D, dakZ(x0)], [x0, 0, dakZ(x0)]], `fill="${donker ? '#121a26' : '#3a4a60'}"`));
        huis.push(poly(stukGevel(x0, x1), `fill="${donker ? '#141c29' : kleurAchter(kamer)}"`));
        const tint = (nacht || schemer) && lampAan ? kleurWas(kamer) ?? 'lamp' : kamer.stand ?? 'rust';
        if (!donker) huis.push(poly(stukGevel(x0, x1), `fill="url(#${id}-w-${tint})"`));
        huis.push(poly([[x0, 0, zt], [x1, 0, zt], [x1, D, zt], [x0, D, zt]], `fill="${donker ? '#0f151f' : '#1a2330'}"`));
        sfeer(kamer, x0, x1, zt, zt + R * 0.8);
        erBoven = false;
        inrichten(kamer, x0, x1, zt, zt + R * 0.85, (x) => dakZ(x) - 0.06, donker);
        // Onder het dak volgt alles de schuine wand: het plafond is het dak zelf.
        aircoLinks = (kamer.apparaten ?? []).some((a) => a.soort === 'airco');
        blokKamer = kamer.id ?? kamer.naam;
        for (const app of kamer.apparaten ?? []) apparaat(app, x0, x1, zt, zt + R * 0.85, true, (x) => dakZ(x) - 0.06);
        aircoLinks = false;
        if (x0 > 0) huis.push(line([[x0, D, zt], [x0, D, dakZ(x0)]], `stroke="#C9D6E2" stroke-opacity="0.35" stroke-width="1.6"`));
        kamers.push({ id: kamer.id, naam: kamer.naam, xm, z0: zt, z1: zt + R });
        tik(kamer, stukGevel(x0, x1).map(([x, , z]) => [x, D, z]));
        // Staat er een droger, dan de naam ernaast in plaats van eroverheen.
        let xl = xm;
        const toestel = (kamer.apparaten ?? []).find((a) => a.soort === 'droger' || a.soort === 'wasmachine' || a.soort === 'vaatwasser');
        const opDePlek = toestel ? plek[toestel.soort] : null;
        if (opDePlek) {
          // Op het scherm vergelijken: de droger staat achterin en schuift daardoor naar rechts.
          const half = ((kamer.naam ?? '').length * 6.9 + (kamer.temp ?? '').length * 8.8 + 6) / 2 / k;
          const rechts = opDePlek[0] * AX + (D - opDePlek[1]) * BX + 0.3 * AX;
          if (xm * AX - half < rechts + 0.08) xl = Math.min(x1 - half / AX - 0.05, (rechts + 0.08 + half) / AX);
        }
        const vrij = dakZ(xl) - zt;
        kamerLabel(kamer, xl, vrij * k < 96 ? zt + vrij * 0.58 : zt + vrij * 0.5, true, (x1 - x0) * (onderDak.length > 1 ? 0.8 : 0.6), vrij);
        x0 = x1;
      }
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
    // Panelen alleen als het huis ze heeft: `panelen: 0` is geen panelen.
    if ((model.zon && model.zon.panelen !== 0) || spook(model, 'panelen')) {
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
      // Panelen op het andere dakvlak (besluit 111): dat vlak is open om de zolder te
      // tonen, dus daar alleen de omtrek en een zweem, zodat de zolder zichtbaar blijft.
      const links = model.zon?.panelenLinks ?? 0;
      if (links > 0) {
        const kolL = Math.max(2, Math.min(6, Math.round(links / rijen)));
        for (let r = 0; r < rijen; r++) {
          for (let c = 0; c < kolL; c++) {
            const u0 = 0.12 + r * 0.42;
            const u1 = u0 + 0.38;
            const v0 = 0.12 + c * ((D - 0.24) / kolL);
            const v1 = v0 + (D - 0.24) / kolL - 0.06;
            const q = (u, v) => [u * (W / 2) - 0.02, v, zt + u * R + 0.02];
            huis.push(poly([q(u0, v0), q(u0, v1), q(u1, v1), q(u1, v0)], `fill="#4d7eac" fill-opacity="0.18" stroke="#7fa6cf" stroke-opacity="0.55" stroke-width="0.8"`));
          }
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
    if (model.tuin) bouwTuin(model.tuin);
    if (model.terras) bouwTerras(model.terras);
    if (model.voortuin) bouwVoortuin(model.voortuin);
    if (model.balkon && g.etages.filter((e) => !e.dak).length >= 2) bouwBalkon(model.balkon);
    if (model.auto || spook(model, 'auto')) bouwAuto(model.auto, spook(model, 'auto'), true);
    else if (model.oprit?.auto) bouwAuto({ stand: 'geparkeerd', kleur: model.oprit.auto.kleur }, false, false);
    if (model.oprit?.camera) bouwCamera(model.oprit.camera);
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
      // Beweging (15 oktober 2026): twee zachte ringen over de vloer, die uitdijen en vervagen.
      if (kamer.beweging) {
        const rb = Math.min(r * 0.7, k * 0.9);
        const stil = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (stil) huis.push(`<ellipse class="sc-beweging" cx="${c[0]}" cy="${c[1]}" rx="${rb * 0.6}" ry="${rb * 0.36}" fill="none" stroke="${KLEUR.mint}" stroke-width="2" stroke-opacity="0.7"/>`);
        else for (const vertraging of [0, 1.1]) {
          huis.push(`<ellipse class="sc-beweging" cx="${c[0]}" cy="${c[1]}" rx="${rb * 0.2}" ry="${rb * 0.12}" fill="none" stroke="${KLEUR.mint}" stroke-width="2"><animate attributeName="rx" values="${rb * 0.2};${rb}" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/><animate attributeName="ry" values="${rb * 0.12};${rb * 0.6}" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.9;0" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/></ellipse>`);
        }
      }
    }
    function tekenKamer(kamer, x0, x1, z0, z1) {
      const xm = (x0 + x1) / 2;
      kamers.push({ id: kamer.id, naam: kamer.naam, xm, z0, z1 });
      tik(kamer, [[x0, D, z0], [x1, D, z0], [x1, D, z1], [x0, D, z1]]);
      // Een lege plek voor een nieuwe kamer, in de bewerkstand: alleen een stippellijn.
      if (kamer.nieuw) {
        huis.push(poly([[x0 + 0.06, 0.06, z0 + 0.01], [x1 - 0.06, 0.06, z0 + 0.01], [x1 - 0.06, D - 0.06, z0 + 0.01], [x0 + 0.06, D - 0.06, z0 + 0.01]], `fill="${KLEUR.ijs}" fill-opacity="0.05" stroke="${KLEUR.ijs}" stroke-opacity="0.7" stroke-width="1.6" stroke-dasharray="6 5"`));
        const t = P(xm, D * 0.5, z0);
        labels.push(`<g><circle cx="${t[0]}" cy="${t[1]}" r="16" fill="#0E1828" stroke="${KLEUR.ijs}" stroke-opacity="0.7"/><path d="M ${t[0] - 7} ${t[1]} h 14 M ${t[0]} ${t[1] - 7} v 14" stroke="${KLEUR.ijs}" stroke-width="2.2" stroke-linecap="round"/><text x="${t[0]}" y="${t[1] + 36}" text-anchor="middle" fill="${KLEUR.ijs}" font-family="Figtree, sans-serif" font-size="13" font-weight="700">${esc(kamer.naam ?? 'Kamer toevoegen')}</text></g>`);
        return;
      }
      const donker = nacht && !(kamer.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
      // Linkerwand (de tussenmuur of de buitenmuur), achterwand, vloer.
      huis.push(poly([[x0, 0, z0], [x0, D, z0], [x0, D, z1], [x0, 0, z1]], `fill="${donker ? '#121a26' : '#3a4a60'}"`));
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], `fill="${donker ? '#141c29' : '#33425a'}"`));
      const lampAan = (kamer.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
      const tint = (nacht || schemer) && lampAan ? kleurWas(kamer) ?? 'lamp' : kamer.stand ?? 'rust';
      if (!donker) huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], `fill="url(#${id}-w-${tint})"`));
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, D, z0], [x0, D, z0]], `fill="${donker ? '#0f151f' : `url(#${id}-vloer)`}"`));
      // Donkere hoeken waar muur en vloer elkaar raken.
      huis.push(poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z0 + 0.32], [x0, 0, z0 + 0.32]], `fill="url(#${id}-hoek)"`));
      huis.push(poly([[x0, 0, z0], [x0, D, z0], [x0, D, z0 + 0.25], [x0, 0, z0 + 0.25]], `fill="url(#${id}-hoek)"`));

      // Een raam in de achtermuur, met de lucht erachter.
      const raamPlek = raamVan(kamer, x0, x1);
      if (raamPlek) {
        const [rx0, rx1] = raamPlek;
        if (opts.controle) controle.push({ kamer: kamer.id ?? kamer.naam, wat: 'raam', ruimte: [x0, x1], x0: rx0, x1: rx1, y0: 0, y1: 0.02, z0: z0 + 0.42, z1: z1 - 0.28 });
        const raam = [[rx0, 0.005, z0 + 0.42], [rx1, 0.005, z0 + 0.42], [rx1, 0.005, z1 - 0.28], [rx0, 0.005, z1 - 0.28]];
        huis.push(poly(raam, `fill="${nacht ? '#0a1222' : winter ? '#7f93a8' : '#4d7eac'}" stroke="#55657a" stroke-width="1.5"`));
        if (!nacht) huis.push(poly([raam[0], [rx0 + (rx1 - rx0) * 0.45, 0.005, z0 + 0.42], [rx0, 0.005, z1 - 0.45]], 'fill="#ffffff" opacity="0.12"'));
        huis.push(line([[(rx0 + rx1) / 2, 0.006, z0 + 0.42], [(rx0 + rx1) / 2, 0.006, z1 - 0.28]], 'stroke="#55657a" stroke-width="1.2"'));
      }
      sfeer(kamer, x0, x1, z0, z1);
      inrichten(kamer, x0, x1, z0, z1, null, donker);
      blokKamer = kamer.id ?? kamer.naam;
      dezeKamer = kamer;
      for (const app of kamer.apparaten ?? []) apparaat(app, x0, x1, z0, z1, false);
      radiatorZij = false;
      // In de bewerkstand: de gekozen kamer met een rand, de kamer waar iets heen gaat met een gloed.
      if (kamer.gekozen || kamer.doel) {
        const kl = kamer.doel ? KLEUR.mint : KLEUR.ijs;
        huis.push(poly([[x0 + 0.03, 0.03, z0 + 0.01], [x1 - 0.03, 0.03, z0 + 0.01], [x1 - 0.03, D - 0.03, z0 + 0.01], [x0 + 0.03, D - 0.03, z0 + 0.01]], `fill="${kl}" fill-opacity="${kamer.doel ? 0.16 : 0.06}" stroke="${kl}" stroke-width="2" ${kamer.doel ? '' : 'stroke-dasharray="7 5"'}`));
      }
      // Zones in een kamer: een stippellijn over de vloer, met de naam erbij.
      (kamer.zones ?? []).forEach((zone, i, alle) => {
        if (i === 0) return;
        const xs = x0 + ((x1 - x0) * i) / alle.length;
        huis.push(line([[xs, 0.05, z0 + 0.012], [xs, D - 0.05, z0 + 0.012]], `stroke="#C9D6E2" stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="5 5"`));
      });
      (kamer.stil ? [] : kamer.zones ?? []).forEach((zone, i, alle) => {
        const xz = x0 + ((x1 - x0) * (i + 0.5)) / alle.length;
        const t = P(xz, D - 0.2, z0 + 0.02);
        labels.push(`<text x="${t[0]}" y="${t[1]}" text-anchor="middle" fill="${KLEUR.zacht}" font-family="Figtree, sans-serif" font-size="11.5" font-weight="600" opacity="0.85">${esc(zone)}</text>`);
      });
      // De muur ertussen als doorsnede.
      huis.push(line([[x0, D, z0], [x0, D, z1]], `stroke="#C9D6E2" stroke-opacity="0.35" stroke-width="1.6"`));
      kamerLabel(kamer, x0 + 0.16, z1 - 0.3, false, x1 - x0);
    }
    /**
     * De naam, de temperatuur en de korte zin van een kamer, op de open voorkant.
     * De tekst past zich aan de breedte van de kamer aan: kleiner, de naam op
     * twee regels, en zonder de zin als die er niet meer bij past.
     */
    function kamerLabel(kamer, xl, zl, midden, breedte, hoogte) {
      if (!kamer.naam || kamer.stil) return;
      // Het icoon hoort bij de inrichting: alleen ingezoomd (`opts.meubels`).
      const soortIcoon = soortVanKamer(kamer);
      const icoon = opts.meubels && soortIcoon !== 'leeg' ? KAMER_ICOON[soortIcoon ?? 'kamer'] : null;
      /** Het icoon met de linkerbovenhoek op (x, y), `sz` groot, in de kleur van de naam. */
      const tekenIcoon = (x, y, sz) => (!icoon ? '' : `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(sz / 24).toFixed(3)})" fill="none" stroke="${KLEUR.zacht}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icoon}</g>`);
      // Weinig hoogte, zoals onder de schuine kant van het dak: alles op één regel.
      if (hoogte != null && hoogte * k < 96) {
        const t1 = P(xl, D, zl);
        const kl = { koelt: KLEUR.ijs, warmt: KLEUR.gloed, wacht: KLEUR.zon, goed: KLEUR.mint }[kamer.stand] ?? KLEUR.zacht;
        // Het icoon links van de regel, als er naast de tekst ruimte voor is.
        const breedTekst = kamer.naam.length * 12.5 * 0.55 + (kamer.temp ? 6 + kamer.temp.length * 16 * 0.55 : 0);
        const metIcoon = !!icoon && (breedte == null || breedte * AX * k > breedTekst + 40);
        const sz1 = 15;
        const ix = t1[0] - breedTekst / 2 - (metIcoon ? (sz1 + 5) / 2 : 0);
        // Past het er niet naast, dan erboven.
        const boven = metIcoon ? '' : tekenIcoon(t1[0] - sz1 / 2, t1[1] - sz1 - 16, sz1);
        labels.push(`<g class="sc-kamer" data-kamer="${esc(kamer.id ?? kamer.naam)}">${metIcoon ? tekenIcoon(ix, t1[1] - sz1 + 2, sz1) : boven}<text x="${metIcoon ? t1[0] + (sz1 + 5) / 2 : t1[0]}" y="${t1[1]}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="12.5" font-weight="600" fill="${KLEUR.zacht}">${esc(kamer.naam)}${kamer.temp ? ` <tspan font-family="Bricolage Grotesque, Figtree, sans-serif" font-size="16" fill="${KLEUR.tekst}">${esc(kamer.temp)}</tspan>` : ''}</text>${kamer.stand ? `<circle cx="${t1[0]}" cy="${t1[1] + 12}" r="4" fill="${kl}"><title>${esc(kamer.zin ?? '')}</title></circle>` : ''}</g>`);
        return;
      }
      const t = P(xl, D, zl);
      const anker = midden ? 'middle' : 'start';
      const kleur = { koelt: KLEUR.ijs, warmt: KLEUR.gloed, wacht: KLEUR.zon, goed: KLEUR.mint }[kamer.stand] ?? KLEUR.zacht;
      const ruimte = (breedte ?? 2) * AX * k - 18;
      const past = (tekst, px) => tekst.length * px * 0.55 <= ruimte;
      const naamPx = past(kamer.naam, 12.5) ? 12.5 : 11.5;
      // Een lange naam breekt op de laatste spatie, als hij anders niet past.
      const woorden = kamer.naam.split(' ');
      const regels = past(kamer.naam, naamPx) || woorden.length < 2 ? [kamer.naam] : [woorden.slice(0, -1).join(' '), woorden[woorden.length - 1]];
      const tempPx = Math.min(28, k * 0.32, ruimte / 3.2);
      let y = t[1];
      // Het icoon voor de eerste regel van de naam; past het er niet bij, dan valt het weg.
      const sz = Math.round(naamPx * 1.25);
      const regelBreed = Math.max(...regels.map((r) => r.length * naamPx * 0.55));
      const metIcoon = !!icoon && regelBreed + sz + 6 <= ruimte;
      const schuif = metIcoon ? sz + 6 : 0;
      const ix = midden ? t[0] - (regelBreed + schuif) / 2 : t[0];
      const delen = regels.map((r, i) => `<text x="${midden ? t[0] + schuif / 2 : t[0] + (i === 0 ? schuif : 0)}" y="${y + i * 14}" text-anchor="${anker}" fill="${KLEUR.zacht}" font-family="Figtree, sans-serif" font-size="${naamPx}" font-weight="600">${esc(r)}</text>`);
      // Past het er niet naast, dan erboven.
      delen.unshift(metIcoon ? tekenIcoon(ix, y - sz + 3, sz) : tekenIcoon(midden ? t[0] - sz / 2 : t[0], y - naamPx - sz - 3, sz));
      y += (regels.length - 1) * 14;
      if (kamer.temp) delen.push(`<text x="${t[0]}" y="${y + tempPx + 2}" text-anchor="${anker}" fill="${KLEUR.tekst}" font-family="Bricolage Grotesque, Figtree, sans-serif" font-size="${tempPx.toFixed(1)}" font-weight="600">${esc(kamer.temp)}</text>`);
      const zinY = y + (kamer.temp ? tempPx + 20 : 18);
      if (kamer.zin && past(kamer.zin, 12)) delen.push(`<text x="${t[0]}" y="${zinY}" text-anchor="${anker}" fill="${kleur}" font-family="Figtree, sans-serif" font-size="12" font-weight="600">${esc(kamer.zin)}</text>`);
      else if (kamer.zin && kamer.stand) delen.push(`<circle cx="${midden ? t[0] : t[0] + 4}" cy="${zinY - 4}" r="4" fill="${kleur}"><title>${esc(kamer.zin)}</title></circle>`);
      labels.push(`<g class="sc-kamer" data-kamer="${esc(kamer.id ?? kamer.naam)}">${delen.join('')}</g>`);
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
    /** Het raam in de achtermuur van een gewone kamer: [van, tot], of null. */
    function raamVan(kamer, x0, x1) {
      if (!(x1 - x0 > 1.15) || kamer?.geenRaam) return null;
      return [x0 + 0.28, Math.min(x0 + 0.95, x1 - 1.05 > x0 + 0.95 ? x0 + 0.95 : x1 - 0.25)];
    }
    /**
     * Waar de binnenunit van een gewone kamer hangt (besluit 131): hoog, en
     * nooit voor het raam. Op de achterwand rechts van het raam, waar hij in
     * beeld niet achter de muur met de volgende kamer valt. Staat er een etage
     * boven, dan net onder wat de vloer erboven aan het zicht onttrekt. Past hij
     * daar niet, dan aan de linkermuur, vooraan, waar hij altijd te zien is.
     */
    function aircoPlek(kamer, x0, x1, z1) {
      const raam = raamVan(kamer, x0, x1);
      const vanaf = raam ? raam[1] + 0.12 : x0 + 0.15;
      // Rechts valt de achterwand in beeld achter de muur met de volgende kamer.
      const tot = x1 - 0.7;
      // Alleen een etage die erboven getekend wordt, onttrekt iets aan het zicht.
      const vloerBoven = erBoven && !model.zonderDak;
      if (tot - vanaf >= AIRCO.b) {
        const top = vloerBoven ? z1 - BY * D - 0.04 : z1 - 0.12;
        return { wand: 'achter', ax: Math.max(vanaf, tot - AIRCO.b), az: top - AIRCO.h };
      }
      const ay = 0.2;
      const top = vloerBoven ? z1 - (D - ay) * BY - 0.04 : z1 - 0.12;
      return { wand: 'links', ay, az: top - AIRCO.h };
    }
    function apparaat(app, x0, x1, z0, z1, onderDak, plafond) {
      const xm = (x0 + x1) / 2;
      /** Met `opts.controle`: waar dit apparaat staat, als blok. */
      const blok = (bx0, bx1, by0, by1, bz0, bz1) => {
        if (opts.controle) controle.push({ kamer: blokKamer, wat: 'apparaat', soort: app.soort, ruimte: [x0, x1], x0: bx0, x1: bx1, y0: by0, y1: by1, z0: bz0, z1: bz1 });
      };
      const hoog = (x) => (plafond ? plafond(x) : z1);
      if (app.soort === 'airco') {
        const kleur = app.stand === 'warmt' ? KLEUR.gloed : KLEUR.ijs;
        const KAST = ['#eef3f7', '#dfe7ee', '#b4c0cb'];
        if (plafond) {
          // Onder het dak tegen de linkermuur, hoog: daar is hij altijd te zien,
          // en de droger schuift naar rechts (zie hieronder).
          const { b: AB, h: AH, d: AD } = AIRCO;
          const ay = 0.4;
          const az = Math.min(z0 + 0.95, hoog(x0) - 0.34);
          plek[`airco:${app.naam ?? ''}`] = [x0 + 0.2, ay + AB / 2, az];
          blok(x0 + 0.01, x0 + 0.01 + AD, ay, ay + AB, az, az + AH);
          huis.push(doos(x0 + 0.01, ay, az, AD, AB, AH, KAST));
          // De uitblaas aan de onderkant, naar de kamer toe.
          huis.push(poly([[x0 + 0.012 + AD, ay + 0.05, az + 0.035], [x0 + 0.012 + AD, ay + AB - 0.05, az + 0.035], [x0 + 0.012 + AD, ay + AB - 0.05, az + 0.06], [x0 + 0.012 + AD, ay + 0.05, az + 0.06]], 'fill="#7d8b99"'));
          if (app.aan) {
            for (let i = 0; i < 3; i++) {
              const a = P(x0 + 0.24, ay + 0.2 + i * 0.2, az + 0.02);
              const b = P(x0 + 0.7, ay + 0.25 + i * 0.2, az - 0.35);
              huis.push(`<path class="sc-lucht" style="animation-delay:${i * 0.35}s" d="M ${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2} ${a[1] + 4} ${b[0]} ${b[1]}" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`);
            }
          }
        } else {
          // Op een gewone etage: hoog, naast het raam (besluit 131, zie aircoPlek).
          const { b: AB, h: AH, d: AD } = AIRCO;
          const p = aircoPlek(dezeKamer, x0, x1, z1);
          const az = p.az;
          if (p.wand === 'achter') {
            const ax = p.ax;
            plek[`airco:${app.naam ?? ''}`] = [ax + AB / 2, 0.1, az];
            blok(ax, ax + AB, 0.02, 0.02 + AD, az, az + AH);
            huis.push(doos(ax, 0.02, az, AB, AD, AH, KAST));
            huis.push(poly([[ax + 0.05, 0.022 + AD, az + 0.035], [ax + AB - 0.05, 0.022 + AD, az + 0.035], [ax + AB - 0.05, 0.022 + AD, az + 0.06], [ax + 0.05, 0.022 + AD, az + 0.06]], 'fill="#7d8b99"'));
            if (app.aan) {
              for (let i = 0; i < 3; i++) {
                const a = P(ax + 0.11 + i * 0.17, 0.25, az - 0.02);
                const b = P(ax + 0.11 + i * 0.17, 0.7, az - 0.36);
                huis.push(`<path class="sc-lucht" style="animation-delay:${i * 0.35}s" d="M ${a[0]} ${a[1]} Q ${a[0] + 8} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`);
              }
            }
          } else {
            const ay = p.ay;
            plek[`airco:${app.naam ?? ''}`] = [x0 + 0.1, ay + AB / 2, az];
            blok(x0 + 0.01, x0 + 0.01 + AD, ay, ay + AB, az, az + AH);
            huis.push(doos(x0 + 0.01, ay, az, AD, AB, AH, KAST));
            huis.push(poly([[x0 + 0.012 + AD, ay + 0.05, az + 0.035], [x0 + 0.012 + AD, ay + AB - 0.05, az + 0.035], [x0 + 0.012 + AD, ay + AB - 0.05, az + 0.06], [x0 + 0.012 + AD, ay + 0.05, az + 0.06]], 'fill="#7d8b99"'));
            if (app.aan) {
              for (let i = 0; i < 3; i++) {
                const a = P(x0 + 0.2, ay + 0.11 + i * 0.17, az - 0.02);
                const b = P(x0 + 0.62, ay + 0.15 + i * 0.17, az - 0.34);
                huis.push(`<path class="sc-lucht" style="animation-delay:${i * 0.35}s" d="M ${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2} ${a[1] + 4} ${b[0]} ${b[1]}" fill="none" stroke="${kleur}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`);
              }
            }
          }
        }
      } else if (app.soort === 'radiator') {
        const kl = ['#4b5664', app.aan ? '#c4704f' : '#5a6574', '#3d4754'];
        // Tegen de zijmuur als de achterwand een keuken heeft; anders onder het raam.
        const rx = x0 + 0.25;
        if (radiatorZij) huis.push(doos(x0 + 0.02, 0.5, z0 + 0.12, 0.08, 0.8, 0.36, [kl[0], kl[2], kl[1]]));
        else huis.push(doos(rx, 0.02, z0 + 0.12, 0.8, 0.08, 0.36, kl));
        if (radiatorZij) blok(x0 + 0.02, x0 + 0.1, 0.5, 1.3, z0 + 0.12, z0 + 0.48);
        else blok(rx, rx + 0.8, 0.02, 0.1, z0 + 0.12, z0 + 0.48);
        if (app.aan) {
          const c = radiatorZij ? P(x0 + 0.4, 0.9, z0 + 0.4) : P(rx + 0.4, 0.3, z0 + 0.45);
          huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.7}" ry="${k * 0.35}" fill="url(#${id}-warm)"/>`);
        }
      } else if (app.soort === 'vloer') {
        if (app.aan) huis.push(poly([[x0 + 0.1, 0.1, z0 + 0.005], [x1 - 0.1, 0.1, z0 + 0.005], [x1 - 0.1, D - 0.1, z0 + 0.005], [x0 + 0.1, D - 0.1, z0 + 0.005]], `fill="${KLEUR.gloed}" opacity="0.16"`));
      } else if (app.soort === 'lamp') {
        const lx = app.x != null ? x0 + (x1 - x0) * app.x : xm;
        const ly = D * 0.42;
        const top = Math.min(hoog(lx), z1);
        huis.push(line([[lx, ly, top], [lx, ly, top - 0.28]], 'stroke="#8090a0" stroke-width="1"'));
        blok(lx - 0.09, lx + 0.09, ly - 0.09, ly + 0.09, top - 0.36, top);
        // Een gekleurde lamp (besluit 129): de kap in zijn kleur, en een sterkere gloed.
        const tinten = app.aan ? tintenVan(app.kleur) : null;
        const kap = tinten ?? (app.aan ? ['#FFE2B0', '#e8b878', '#d6a565'] : ['#5c6876', '#4a5664', '#3c4755']);
        huis.push(doos(lx - 0.09, ly - 0.09, top - 0.36, 0.18, 0.18, 0.09, kap));
        if (app.aan) {
          const kleur = app.kleur ?? '#FFD9A0';
          const v = P(lx, ly, z0);
          const r = k * 0.62;
          huis.push(`<ellipse cx="${v[0]}" cy="${v[1]}" rx="${r}" ry="${r * 0.5}" fill="${kleur}" opacity="${tinten ? 0.4 : 0.22}" filter="url(#${id}-zacht)"/>`);
          const b = P(lx, ly, top - 0.36);
          const l1 = P(lx - 0.45, ly, z0 + 0.05);
          const r1 = P(lx + 0.45, ly, z0 + 0.05);
          huis.push(`<polygon points="${b[0]},${b[1]} ${l1[0]},${l1[1]} ${r1[0]},${r1[1]}" fill="${kleur}" opacity="${tinten ? 0.16 : 0.07}"/>`);
          if (tinten) huis.push(`<circle cx="${b[0]}" cy="${b[1]}" r="${(k * 0.22).toFixed(1)}" fill="${kleur}" opacity="0.5" filter="url(#${id}-zacht)"/>`);
        }
      } else if (app.soort === 'droger' || app.soort === 'wasmachine' || app.soort === 'vaatwasser') {
        // In het midden en wat naar voren: rechts hangt de airco aan de
        // achterwand, en linksboven staat de naam van de kamer.
        let dx = app.x != null ? x0 + (x1 - x0) * app.x : x1 - x0 > 1.6 ? xm - 0.1 : x0 + 0.3;
        const dy = app.x != null || plafond ? 0.15 : Math.max(0.15, D * 0.42);
        if (plafond) {
          // Onder het dak: waar hij rechtop past, en zo ver mogelijk van het
          // midden van de kamer, waar de naam en de temperatuur staan.
          const past = (x) => Math.min(hoog(x), hoog(x + 0.5)) >= z0 + 0.8;
          // Hangt er een airco tegen de linkermuur, dan niet daaronder.
          const vanaf = aircoLinks ? x0 + 0.55 : x0 + 0.1;
          const plekken = [];
          for (let x = vanaf; x <= x1 - 0.6; x += 0.05) if (past(x)) plekken.push(x);
          plekken.sort((a, b) => Math.abs(b + 0.25 - xm) - Math.abs(a + 0.25 - xm));
          dx = plekken[0] ?? Math.max(x0 + 0.1, Math.min(x1 - 0.6, W / 2 - 0.25));
        }
        plek[app.soort] = [dx + 0.25, dy + 0.25, z0 + 0.6];
        blok(dx, dx + 0.5, dy, dy + 0.5, z0, z0 + 0.6);
        huis.push(doos(dx, dy, z0, 0.5, 0.5, 0.6, ['#e9eef2', '#d7dee5', '#b9c3cd']));
        if (app.soort !== 'vaatwasser') {
          huis.push(cirkelOpVoorkant(dx + 0.25, dy + 0.501, z0 + 0.27, 0.15, 'fill="#5e6c7b" stroke="#9aa7b4" stroke-width="1.5"'));
          if (app.aan) {
            const c = P(dx + 0.25, dy + 0.502, z0 + 0.27);
            huis.push(`<g class="sc-trommel" style="transform-origin:${c[0]}px ${c[1]}px">${cirkelOpVoorkant(dx + 0.25, dy + 0.502, z0 + 0.27, 0.1, `fill="none" stroke="${KLEUR.zon}" stroke-width="2" stroke-dasharray="4 4"`)}</g>`);
          }
        } else {
          huis.push(poly([[dx + 0.06, dy + 0.501, z0 + 0.5], [dx + 0.44, dy + 0.501, z0 + 0.5], [dx + 0.44, dy + 0.501, z0 + 0.53], [dx + 0.06, dy + 0.501, z0 + 0.53]], 'fill="#8a97a4"'));
        }
        if (app.aan) {
          const c = P(dx + 0.25, dy + 0.25, z0 + 0.62);
          huis.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${k * 0.32}" fill="url(#${id}-zon)" opacity="0.35"/>`);
        }
      } else if (app.soort === 'cv') {
        const cx = x0 + 0.2;
        plek.cv = [cx + 0.21, 0.1, z0 + 1.05];
        blok(cx, cx + 0.42, 0.02, 0.24, z0 + 0.5, z0 + 1.05);
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

    /* ---- de inrichting van een kamer ---- */
    /*
     * Een paar meubels per soort kamer (slaapkamer, woonkamer, keuken,
     * badkamer, hal, werkkamer, wasruimte, zolder, eetkamer), zodat je ziet
     * wat voor kamer het is. De soort komt uit de naam, of per zone uit de
     * naam van de zone ("Keuken", "Zithoek"); `kamer.inrichting` gaat voor.
     *
     * De apparaten blijven te zien: een meubel tegen de achterwand blijft weg
     * bij het raam, de radiator, de cv en de airco, onder het dak alleen waar
     * het rechtop past, en staat er witgoed, dan blijft het midden vrij. De
     * meubels zijn gedempt van kleur, zodat de naam en de temperatuur van de
     * kamer de blikvanger blijven.
     */
    function inrichten(kamer, x0, x1, z0, z1, plafond, donker) {
      if (!opts.meubels) return;
      const apps = kamer.apparaten ?? [];
      const witgoed = apps.some((a) => WITGOED.test(a.soort));
      // Welke delen: een gekozen soort geldt voor de hele kamer, een woonkamer met
      // open keuken is links keuken en rechts zithoek, en anders per zone of de naam.
      // Witgoed houdt het midden vrij.
      const zones = (kamer.zones ?? []).length > 1 ? kamer.zones : [null];
      const gekozen = kamer.inrichting ?? (zones.length > 1 ? null : soortVanKamer(kamer));
      const delen = gekozen === 'woonkeuken'
        ? [['keuken', 0, zones.length === 2 ? 0.5 : 0.45], ['woonkamer', zones.length === 2 ? 0.5 : 0.45, 1]]
        : gekozen
          ? [[gekozen, 0, 1]]
          : zones.map((zone, i) => [soortVan(zone) ?? soortVan(kamer.naam), i / zones.length, (i + 1) / zones.length]);
      const soorten = delen.map(([soort]) => (witgoed && soort !== 'leeg' ? 'wasruimte' : soort));
      // Heeft het grootste meubel de achterwand nodig, dan hangt de radiator aan de zijmuur.
      const ACHTERWAND = ['keuken', 'badkamer', 'toilet', 'woonkamer', 'slaapkamer', 'kinderkamer', 'logeerkamer', 'werkkamer'];
      radiatorZij = !plafond && ACHTERWAND.includes(soorten[0]) && apps.some((a) => a.soort === 'radiator');
      // Waar op de achterwand niets hoogs mag: [van, tot, vanaf welke hoogte].
      const bezet = [];
      const raam = plafond ? null : raamVan(kamer, x0, x1);
      if (raam) bezet.push([raam[0] - 0.06, raam[1] + 0.06, 0.38, 'raam']);
      if (apps.some((a) => a.soort === 'radiator') && !radiatorZij) bezet.push([x0 + 0.2, x0 + 1.1, 0]);
      if (apps.some((a) => a.soort === 'cv')) bezet.push([x0 + 0.15, x0 + 0.67, 0.45]);
      if (!plafond && apps.some((a) => a.soort === 'airco')) {
        const p = aircoPlek(kamer, x0, x1, z1);
        if (p.wand === 'achter') bezet.push([p.ax - 0.05, p.ax + AIRCO.b + 0.05, p.az - 0.02 - z0]);
      }
      if (plafond && apps.some((a) => a.soort === 'airco')) bezet.push([x0, x0 + 0.5, 0.6]);
      const hoogte = (x) => (plafond ? plafond(x) - z0 : z1 - z0);
      // De hanglampen, zoals apparaat() ze tekent: hun onderkant boven de vloer.
      const lampen = apps.filter((a) => a.soort === 'lamp').map((a) => {
        const lx = a.x != null ? x0 + (x1 - x0) * a.x : (x0 + x1) / 2;
        return { x0: lx - 0.12, x1: lx + 0.12, onder: Math.min(hoogte(lx) + z0, z1) - 0.36 - z0 };
      });
      // Rechts staat de muur van de volgende kamer: die schuift achterin over wat
      // er vlak voor staat. Daar blijft een strook vrij.
      let rechts = x1 < W - 0.01 ? x1 - 0.5 : x1;
      /** Wat al tegen de achterwand staat, houdt zijn plek. */
      const neem = (x, w) => bezet.push([x - 0.03, x + w + 0.03, -1]);
      /** Past iets van `w` breed en `h` hoog hier: niet tegen iets op de achterwand, en onder het dak rechtop. */
      const past = (x, w, h, tegenMuur, voorRaam = false, diep = 0.5) =>
        (!tegenMuur || x + w <= rechts + 1e-9) &&
        hoogte(x) >= h + 0.04 &&
        hoogte(x + w) >= h + 0.04 &&
        (!tegenMuur || !bezet.some(([a, b, vanaf, wat]) => x < b && x + w > a && h > vanaf && !(voorRaam && wat === 'raam'))) &&
        // Onder een hanglamp blijft ruimte; alleen wat diep de kamer in staat, komt eronder.
        !(diep > 0.5 && lampen.some((l) => x < l.x1 && x + w > l.x0 && h > l.onder - 0.03));
      /** De beste plek voor iets van `w` breed in [a, b): `kant` links, rechts of midden. */
      const zoek = (a, b, w, h, kant, tegenMuur = true, voorRaam = false, diep = 0.5) => {
        const kandidaten = [];
        for (let x = a + 0.08; x <= b - w - 0.08 + 1e-9; x += 0.04) if (past(x, w, h, tegenMuur, voorRaam, diep)) kandidaten.push(x);
        // Past het nergens met de strook vrij, dan maar tot aan de muur.
        if (!kandidaten.length && rechts < x1) {
          const was = rechts;
          rechts = x1;
          for (let x = a + 0.08; x <= b - w - 0.08 + 1e-9; x += 0.04) if (past(x, w, h, tegenMuur, voorRaam, diep)) kandidaten.push(x);
          rechts = was;
        }
        if (!kandidaten.length) return null;
        const doel = kant === 'links' ? a : kant === 'rechts' ? b - w : (a + b - w) / 2;
        return kandidaten.sort((p, q) => Math.abs(p - doel) - Math.abs(q - doel))[0];
      };
      const stukken = [];
      /** Een meubel op (x, y); `maat` is [breed, diep, hoog], voor de controle. */
      const zet = (y, x, svgTekst, maat) => {
        stukken.push({ y, x, svgTekst });
        if (opts.controle && maat) {
          const [w, d, h, vanaf = 0] = maat;
          controle.push({ kamer: kamer.id ?? kamer.naam, wat: 'meubel', x0: x, x1: x + w, y0: y, y1: y + d, z0: z0 + vanaf, z1: z0 + vanaf + h, ruimte: [x0, x1], plafond: z0 + Math.min(hoogte(x), hoogte(x + w)) });
        }
      };

      const tafel = (x, y, w, d, h, kl = MEUBEL.hout) => {
        const poot = 0.035;
        return [
          doos(x + 0.03, y + 0.03, z0, poot, poot, h - 0.03, kl),
          doos(x + w - 0.03 - poot, y + 0.03, z0, poot, poot, h - 0.03, kl),
          doos(x + 0.03, y + d - 0.03 - poot, z0, poot, poot, h - 0.03, kl),
          doos(x + w - 0.03 - poot, y + d - 0.03 - poot, z0, poot, poot, h - 0.03, kl),
          doos(x, y, z0 + h - 0.03, w, d, 0.03, kl),
        ].join('');
      };
      const stoel = (x, y, rugAchter = false) =>
        doos(x, y, z0, 0.2, 0.2, 0.2, MEUBEL.donker) + (rugAchter ? doos(x, y, z0 + 0.2, 0.2, 0.04, 0.2, MEUBEL.donker) : doos(x, y + 0.16, z0 + 0.2, 0.2, 0.04, 0.2, MEUBEL.donker));
      const plant = (x, y) => {
        const c = P(x + 0.07, y + 0.07, z0 + 0.36);
        return `${doos(x, y, z0, 0.14, 0.14, 0.16, MEUBEL.doos)}<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(k * 0.13).toFixed(1)}" ry="${(k * 0.17).toFixed(1)}" fill="${MEUBEL.groen}"/><ellipse cx="${(c[0] - k * 0.05).toFixed(1)}" cy="${(c[1] - k * 0.06).toFixed(1)}" rx="${(k * 0.06).toFixed(1)}" ry="${(k * 0.08).toFixed(1)}" fill="#76b48f" opacity="0.8"/>`;
      };
      const kleed = (a, b, y0, y1) => poly([[a, y0, z0 + 0.004], [b, y0, z0 + 0.004], [b, y1, z0 + 0.004], [a, y1, z0 + 0.004]], `fill="${MEUBEL.kleed}" opacity="0.3"`);

      function bed(a, b, breed) {
        // Past een tweepersoonsbed niet, dan een eenpersoons.
        if (breed && zoek(a, b, 0.95, 0.34, 'midden', true, false, 1.16) == null) breed = false;
        const bw = breed ? 0.95 : 0.55;
        const L = breed ? 1.12 : 0.98;
        const x = zoek(a, b, bw, 0.34, breed ? 'midden' : 'links', true, false, L + 0.04);
        if (x == null) return;
        const y = 0.04;
        neem(x, bw);
        const kussens = breed ? [x + 0.08, x + bw / 2 + 0.02] : [x + 0.08];
        const kw = breed ? bw / 2 - 0.1 : bw - 0.16;
        zet(y, x, [
          doos(x, y, z0, bw, 0.06, 0.34, MEUBEL.hout),
          doos(x, y + 0.06, z0, bw, L - 0.06, 0.14, MEUBEL.hout),
          doos(x + 0.03, y + 0.08, z0 + 0.14, bw - 0.06, L - 0.12, 0.07, MEUBEL.wit),
          ...kussens.map((kx) => doos(kx, y + 0.1, z0 + 0.21, kw, 0.2, 0.05, MEUBEL.wit)),
          doos(x + 0.02, y + 0.38, z0 + 0.18, bw - 0.04, L - 0.44, 0.07, MEUBEL.dek),
        ].join(''), [bw, L, 0.34]);
        // Een nachtkastje ernaast, als het past.
        if (past(x + bw + 0.05, 0.22, 0.26, true) && x + bw + 0.3 <= b) {
          zet(y, x + bw + 0.05, doos(x + bw + 0.05, y, z0, 0.22, 0.22, 0.24, MEUBEL.hout), [0.22, 0.22, 0.24]);
          neem(x + bw + 0.05, 0.22);
        }
        else if (breed && past(x - 0.27, 0.22, 0.26, true) && x - 0.27 >= a) zet(y, x - 0.27, doos(x - 0.27, y, z0, 0.22, 0.22, 0.24, MEUBEL.hout), [0.22, 0.22, 0.24]);
      }
      function bureau(a, b) {
        const x = zoek(a, b, 0.7, 0.62, 'rechts', true, true);
        if (x == null) return;
        neem(x, 0.7);
        zet(0.04, x, `${tafel(x, 0.04, 0.7, 0.34, 0.42)}${doos(x + 0.22, 0.1, z0 + 0.42, 0.28, 0.03, 0.2, ['#2a3443', '#1c2430', '#161d27'])}`, [0.7, 0.34, 0.62]);
        zet(0.55, x + 0.25, stoel(x + 0.25, 0.55), [0.2, 0.2, 0.4]);
      }
      function kast(a, b) {
        // Een boekenkast tegen de achterwand, met planken.
        const x = zoek(a, b, 0.42, 0.7, 'links');
        if (x == null) return;
        neem(x, 0.42);
        const planken = [0.24, 0.46].map((h) => line([[x + 0.03, 0.26, z0 + h], [x + 0.39, 0.26, z0 + h]], 'stroke="#4e4135" stroke-width="1.2"')).join('');
        zet(0.03, x, `${doos(x, 0.03, z0, 0.42, 0.24, 0.7, MEUBEL.hout)}${planken}`, [0.42, 0.24, 0.7]);
      }

      function meubels(soort, a, b) {
        const w = b - a;
        if (soort === 'slaapkamer' || soort === 'kinderkamer' || soort === 'logeerkamer') {
          bed(a, b, soort !== 'kinderkamer' && w > 1.3);
          if (soort === 'kinderkamer' && w > 1.4) {
            const x = zoek(a, b, 0.5, 0.36, 'rechts');
            if (x != null) {
              neem(x, 0.5);
              zet(0.04, x, tafel(x, 0.04, 0.5, 0.3, 0.36), [0.5, 0.3, 0.36]);
            }
          }
        } else if (soort === 'woonkamer') {
          const sw = Math.min(1.15, w - 0.35);
          if (sw < 0.6) return;
          const x = zoek(a, b, sw, 0.42, 'midden');
          if (x != null) {
            neem(x - 0.06, sw + 0.12);
            stukken.push({ y: -1, x, svgTekst: kleed(x + 0.05, x + sw - 0.05, 0.5, 1.2) });
            zet(0.04, x, [
              doos(x, 0.04, z0, sw, 0.14, 0.42, MEUBEL.stof),
              doos(x, 0.18, z0, sw, 0.3, 0.2, MEUBEL.stof),
              doos(x + 0.04, 0.18, z0 + 0.2, (sw - 0.08) / 2 - 0.01, 0.28, 0.05, MEUBEL.kussen),
              doos(x + sw / 2 + 0.01, 0.18, z0 + 0.2, (sw - 0.08) / 2 - 0.01, 0.28, 0.05, MEUBEL.kussen),
              doos(x - 0.06, 0.04, z0, 0.08, 0.44, 0.3, MEUBEL.stof),
              doos(x + sw - 0.02, 0.04, z0, 0.08, 0.44, 0.3, MEUBEL.stof),
            ].join(''), [sw, 0.44, 0.42]);
            const tw = Math.min(0.55, sw * 0.5);
            zet(0.66, x + (sw - tw) / 2, tafel(x + (sw - tw) / 2, 0.66, tw, 0.32, 0.17), [tw, 0.32, 0.17]);
          }
          if (w > 1.5 && past(b - 0.3, 0.14, 0.4, true)) zet(0.06, b - 0.3, plant(b - 0.3, 0.06), [0.14, 0.14, 0.4]);
        } else if (soort === 'keuken') {
          // Het aanrecht langs de achterwand, de koelkast aan het eind.
          const kl = Math.min(w - 0.25, 1.6);
          const x = a + 0.1;
          const koel = past(x + kl - 0.38, 0.38, 1.0, true) && kl > 0.9;
          const ak = koel ? kl - 0.4 : kl;
          // Het aanrecht mag onder het raam: daar staat de gootsteen.
          if (ak > 0.3 && past(x, ak, 0.36, true)) {
            zet(0.03, x, [
              doos(x, 0.03, z0, ak, 0.32, 0.4, ['#6c7d93', '#5d6d82', '#4f5d70']),
              doos(x - 0.01, 0.02, z0 + 0.4, ak + 0.02, 0.34, 0.03, MEUBEL.blad),
              poly([[x + 0.12, 0.08, z0 + 0.432], [x + 0.36, 0.08, z0 + 0.432], [x + 0.36, 0.26, z0 + 0.432], [x + 0.12, 0.26, z0 + 0.432]], 'fill="#5b6876"'),
              ak > 0.8 ? [0, 1].map((i) => { const c = P(x + ak - 0.32 + i * 0.16, 0.18, z0 + 0.433); return `<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(k * 0.055).toFixed(1)}" ry="${(k * 0.028).toFixed(1)}" fill="#2a323d"/>`; }).join('') : '',
            ].join(''), [ak, 0.33, 0.43]);
            neem(x, ak);
            // Kastjes aan de muur, alleen waar geen raam of airco zit.
            for (let ux = x; ux + 0.3 <= x + ak + 1e-9; ux += 0.32) {
              if (past(ux, 0.3, 1.18, true) && hoogte(ux) > 1.25) zet(0.02, ux, doos(ux, 0.02, z0 + 0.88, 0.3, 0.2, 0.3, ['#7a8aa0', '#6a7a8f', '#5b6a7e']), [0.3, 0.2, 0.3, 0.88]);
            }
          }
          if (koel) zet(0.03, x + kl - 0.38, doos(x + kl - 0.38, 0.03, z0, 0.38, 0.34, 1.0, MEUBEL.wit) + line([[x + kl - 0.38, 0.37, z0 + 0.62], [x + kl, 0.37, z0 + 0.62]], 'stroke="#9aa6b2" stroke-width="1"'), [0.38, 0.34, 1.0]);
        } else if (soort === 'eetkamer') {
          const tw = Math.min(0.9, w - 0.5);
          if (tw < 0.4) return;
          const x = a + (w - tw) / 2;
          if (!past(x, tw, 0.4, false, false, 0.9)) return;
          const plekken = tw >= 0.7 ? [x + 0.12, x + tw - 0.32] : [x + (tw - 0.2) / 2];
          for (const sx of plekken) zet(0.28, sx, stoel(sx, 0.28, true), [0.2, 0.2, 0.4]);
          zet(0.5, x, tafel(x, 0.5, tw, 0.45, 0.36), [tw, 0.45, 0.36]);
          for (const sx of plekken) zet(0.97, sx, stoel(sx, 0.97), [0.2, 0.2, 0.4]);
        } else if (soort === 'badkamer' || soort === 'toilet') {
          // Een bad als het past; anders een douche met glas in de hoek.
          const bad = soort === 'badkamer' && w > 1.6 ? zoek(a, b, 0.85, 0.32, 'rechts') : null;
          if (bad != null) {
            const x = bad;
            neem(x, 0.85);
            zet(0.04, x, [
              doos(x, 0.04, z0, 0.85, 0.42, 0.3, MEUBEL.wit),
              poly([[x + 0.07, 0.1, z0 + 0.301], [x + 0.78, 0.1, z0 + 0.301], [x + 0.78, 0.4, z0 + 0.301], [x + 0.07, 0.4, z0 + 0.301]], 'fill="#8fc6e0" opacity="0.75"'),
            ].join(''), [0.85, 0.42, 0.3]);
          } else if (soort === 'badkamer') {
            const x = zoek(a, b, 0.5, 1.1, 'rechts');
            if (x != null) neem(x, 0.5);
            if (x != null) zet(0.04, x, `${doos(x, 0.04, z0, 0.5, 0.5, 0.04, MEUBEL.wit)}${doos(x, 0.04, z0 + 0.04, 0.5, 0.5, 1.05, ['#bfe3f2', '#9fd3ea', '#8cc6e0']).replace(/fill="/g, 'fill-opacity="0.22" fill="')}`, [0.5, 0.5, 1.09]);
          }
          // De wastafel, een kastje met een wasbak; hij mag onder het raam.
          const xw = zoek(a, b, 0.4, 0.36, 'links');
          if (xw != null) neem(xw, 0.4);
          if (xw != null) zet(0.04, xw, `${doos(xw, 0.04, z0, 0.4, 0.26, 0.3, MEUBEL.hout)}${doos(xw - 0.01, 0.03, z0 + 0.3, 0.42, 0.28, 0.08, MEUBEL.wit)}`, [0.4, 0.27, 0.38]);
          if (soort === 'toilet' || w > 2.2) {
            const xt = zoek(a, b, 0.22, 0.4, soort === 'toilet' ? 'rechts' : 'midden');
            if (xt != null) neem(xt, 0.22);
            if (xt != null) zet(0.04, xt, `${doos(xt, 0.04, z0 + 0.2, 0.22, 0.1, 0.2, MEUBEL.wit)}${doos(xt + 0.02, 0.14, z0, 0.18, 0.26, 0.22, MEUBEL.wit)}`, [0.22, 0.36, 0.4]);
          }
        } else if (soort === 'hal') {
          // Een trap omhoog langs de zijmuur, van voor naar achter; alleen als er een etage boven is.
          const sw = Math.min(0.45, w - 0.3);
          if (sw < 0.3 || !erBoven) return;
          const n = 8;
          const h = hoogte(a + 0.1);
          const xs = zoek(a, b, sw, h - 0.05, 'links', true, true);
          if (xs == null) return;
          neem(xs, sw);
          const diep = 1.25 / n;
          for (let i = n - 1; i >= 0; i--) {
            const y = 0.05 + i * diep;
            const hi = (h - 0.05) * ((n - i) / n);
            zet(y, xs, doos(xs, y, z0, sw, diep, hi, MEUBEL.hout), [sw, diep, hi]);
          }
        } else if (soort === 'werkkamer') {
          bureau(a, b);
          if (w > 1.5) kast(a, b);
        } else if (soort === 'wasruimte') {
          const x = zoek(a, b, 0.32, 0.3, 'links');
          if (x != null) zet(0.06, x, doos(x, 0.06, z0, 0.32, 0.26, 0.26, ['#c7b9a0', '#b1a389', '#9b8e75']), [0.32, 0.26, 0.26]);
        } else if (soort === 'berging') {
          // Dozen, en in een brede ruimte een stellingkast.
          const x = zoek(a, b, 0.73, 0.5, 'midden');
          if (x != null) {
            neem(x, 0.73);
            zet(0.06, x, `${doos(x, 0.06, z0, 0.4, 0.34, 0.26, MEUBEL.doos)}${doos(x + 0.05, 0.1, z0 + 0.26, 0.3, 0.26, 0.2, MEUBEL.doos)}`, [0.4, 0.34, 0.46]);
            zet(0.06, x + 0.45, doos(x + 0.45, 0.06, z0, 0.28, 0.3, 0.22, MEUBEL.doos), [0.28, 0.3, 0.22]);
          }
          if (w > 1.5) kast(a, b);
        } else if (soort === 'leeg') {
          // Bewust leeg.
        } else {
          // Een kamer zonder bekende soort: een kastje en een plant.
          const x = zoek(a, b, 0.6, 0.4, 'midden');
          if (x != null) {
            neem(x, 0.6);
            zet(0.04, x, doos(x, 0.04, z0, 0.6, 0.28, 0.36, MEUBEL.hout), [0.6, 0.28, 0.36]);
          }
          if (w > 1.2 && past(b - 0.3, 0.14, 0.4, true)) zet(0.06, b - 0.3, plant(b - 0.3, 0.06), [0.14, 0.14, 0.4]);
        }
      }

      // Langs een radiator aan de zijmuur blijft een strook vrij.
      soorten.forEach((soort, i) => meubels(soort, x0 + (x1 - x0) * delen[i][1] + (radiatorZij && i === 0 ? 0.12 : 0), x0 + (x1 - x0) * delen[i][2]));
      if (!stukken.length) return;
      // Van achter naar voor, en van links naar rechts: wat dichterbij staat, komt erover.
      stukken.sort((p, q) => p.y - q.y || p.x - q.x);
      huis.push(`<g class="sc-meubels"${donker ? ' opacity="0.4"' : ''}>${stukken.map((s) => s.svgTekst).join('')}</g>`);
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
    function bouwAuto(a, isSpook, metPaal) {
      // Een laadpaal en een auto op de oprit, links voor het huis.
      const px = -0.95;
      const py = D + 0.1;
      if (metPaal) buiten.push(doos(px - 0.08, py - 0.08, 0, 0.16, 0.16, 0.75, ['#dfe6ec', '#c5cfd8', '#a7b2bd']));
      if (!isSpook && metPaal) buiten.push(poly([[px - 0.081, py - 0.04, 0.5], [px - 0.081, py + 0.04, 0.5], [px - 0.081, py + 0.04, 0.62], [px - 0.081, py - 0.04, 0.62]], `fill="${a?.stand === 'laadt' ? KLEUR.mint : '#66727f'}"`));
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
    function bouwCamera(cam) {
      // De schijnwerper met camera op de oprit, op een paal aan de voorkant.
      const x = -2.75;
      const y = D + 1.35;
      buiten.push(doos(x - 0.05, y - 0.05, 0, 0.1, 0.1, 1.35, ['#5a6878', '#4a5868', '#3c4858']));
      buiten.push(doos(x - 0.02, y - 0.22, 1.25, 0.2, 0.2, 0.14, ['#e5ebf0', '#cfd8e0', '#b3bec9']));
      const lens = P(x + 0.181, y - 0.12, 1.32);
      buiten.push(`<circle cx="${lens[0]}" cy="${lens[1]}" r="${k * 0.035}" fill="#1b2633"/><circle cx="${lens[0]}" cy="${lens[1]}" r="${k * 0.012}" fill="${cam.opname ? '#ff5d5d' : '#4d7eac'}"/>`);
      if (cam.aan) {
        const bron = P(x + 0.1, y - 0.12, 1.25);
        const a1 = P(-2.6, D - 1.1, 0.01);
        const a2 = P(-1.3, D - 0.6, 0.01);
        buiten.push(`<polygon points="${bron[0]},${bron[1]} ${a1[0]},${a1[1]} ${a2[0]},${a2[1]}" fill="#FFF1C9" opacity="0.12"/>`);
        const c = P(-1.95, D - 0.85, 0.01);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.9}" ry="${k * 0.4}" fill="#FFF1C9" opacity="0.18" filter="url(#${id}-zacht)"/>`);
      }
    }
    /** Een terras rechts naast het huis: tegels, een tafel en twee stoelen (besluit 113). */
    function bouwTerras(t) {
      const x0 = W + 0.3;
      const x1 = W + 2.05;
      const y0 = 0.45;
      const y1 = D + 0.4;
      buiten.push(poly([[x0, y0, 0.006], [x1, y0, 0.006], [x1, y1, 0.006], [x0, y1, 0.006]], 'fill="#3b4652"'));
      for (let x = x0 + 0.35; x < x1 - 0.05; x += 0.35) buiten.push(line([[x, y0, 0.008], [x, y1, 0.008]], 'stroke="#2c353f" stroke-width="1"'));
      for (let y = y0 + 0.35; y < y1 - 0.05; y += 0.35) buiten.push(line([[x0, y, 0.008], [x1, y, 0.008]], 'stroke="#2c353f" stroke-width="1"'));
      const tx = x0 + 0.75;
      const ty = (y0 + y1) / 2 - 0.2;
      buiten.push(doos(tx, ty, 0.42, 0.5, 0.4, 0.05, ['#c9d3dc', '#9aa7b4', '#7d8a97']));
      buiten.push(doos(tx + 0.22, ty + 0.17, 0, 0.06, 0.06, 0.42, ['#7d8a97', '#6b7885', '#5d6976']));
      for (const sx of [tx - 0.32, tx + 0.62]) buiten.push(doos(sx, ty + 0.08, 0, 0.22, 0.24, 0.26, ['#55626f', '#46525f', '#3a4552']));
      if (t.lampAan) {
        const c = P(tx + 0.25, ty + 0.2, 0.47);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.6}" ry="${k * 0.28}" fill="#FFD39A" opacity="0.25" filter="url(#${id}-zacht)"/>`);
      }
    }
    /** Een voortuin voor het huis: gras met een lage haag langs de rand (besluit 113). */
    function bouwVoortuin(t) {
      const x0 = 1.3;
      const x1 = W + 0.1;
      const yh = D + 1.55;
      buiten.push(doos(x0, yh, 0, x1 - x0, 0.14, 0.18, ['#2f5a3c', '#26492f', '#1f3d27']));
      for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.7) {
        const c = P(x, D + 0.9, 0.02);
        buiten.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${k * 0.06}" fill="${t.lampAan ? '#FFD39A' : '#6e9a6f'}" opacity="0.8"/>`);
      }
    }
    /** Een balkon aan de zijgevel, op de eerste verdieping, met een reling (besluit 113). */
    function bouwBalkon(b) {
      const z = FH;
      const y0 = 0.35;
      const y1 = 1.15;
      buiten.push(doos(W, y0, z - 0.06, 0.55, y1 - y0, 0.06, ['#9aa7b4', '#7d8a97', '#6b7885']));
      const rz = z + 0.42;
      buiten.push(line([[W + 0.55, y0, rz], [W + 0.55, y1, rz]], 'stroke="#C9D6E2" stroke-width="1.6"'));
      buiten.push(line([[W, y1, rz], [W + 0.55, y1, rz]], 'stroke="#C9D6E2" stroke-width="1.6"'));
      for (let y = y0; y <= y1 + 0.001; y += 0.2) buiten.push(line([[W + 0.55, y, z], [W + 0.55, y, rz]], 'stroke="#C9D6E2" stroke-opacity="0.7" stroke-width="1"'));
      if (b.lampAan) {
        const c = P(W + 0.28, (y0 + y1) / 2, z + 0.02);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.4}" ry="${k * 0.2}" fill="#FFD39A" opacity="0.3" filter="url(#${id}-zacht)"/>`);
      }
    }
    function bouwTuin(t) {
      // Het tuinhuis rechtsachter, met een overstek en de lamp eronder; lampen langs het pad.
      // Alleen als de tuin er een heeft (`tuinhuis: false` is geen tuinhuis).
      const x0 = W + 0.85;
      const y0 = -1.75;
      if (t.tuinhuis !== false) {
        buiten.push(doos(x0, y0, 0, 1.05, 0.95, 0.85, ['#3a4656', '#2f3a48', '#46525f']));
        buiten.push(poly([[x0 - 0.05, y0 + 0.95, 0.88], [x0 + 1.1, y0 + 0.95, 0.88], [x0 + 1.1, y0 + 1.45, 0.82], [x0 - 0.05, y0 + 1.45, 0.82]], 'fill="#55626f"'));
        buiten.push(poly([[x0 + 1.051, y0 + 0.3, 0.05], [x0 + 1.051, y0 + 0.62, 0.05], [x0 + 1.051, y0 + 0.62, 0.62], [x0 + 1.051, y0 + 0.3, 0.62]], `fill="${t.tuinhuisAan ? '#F4C27E' : '#1b2633'}"`));
      }
      if (t.tuinhuis !== false && t.overstekAan) {
        const c = P(x0 + 0.5, y0 + 1.2, 0.02);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.7}" ry="${k * 0.3}" fill="${t.overstekKleur ?? '#FFD39A'}" opacity="0.28" filter="url(#${id}-zacht)"/>`);
      }
      (t.lampen ?? []).forEach((lamp, i) => {
        const lx = W + 0.55 + i * 0.55;
        const ly = -0.35 + i * 0.25;
        buiten.push(doos(lx - 0.03, ly - 0.03, 0, 0.06, 0.06, 0.42, ['#6b7a8a', '#56636f', '#47525d']));
        const kop = P(lx, ly, 0.46);
        buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${k * 0.05}" fill="${lamp.aan ? lamp.kleur ?? '#FFD39A' : '#3c4755'}"/>`);
        if (lamp.aan) buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${k * 0.25}" fill="${lamp.kleur ?? '#FFD39A'}" opacity="0.25" filter="url(#${id}-zacht)"/>`);
      });
      if (t.zonnescherm) {
        // Het zonnescherm boven het terras, uitgerold naar wat het nu is.
        const uit = Math.max(0.08, t.zonnescherm.dicht ?? 0) * 0.95;
        buiten.push(doos(W + 0.01, 0.08, 1.12, 0.1, 0.9, 0.1, ['#8a97a5', '#7a8795', '#6a7785']));
        if (uit > 0.1) buiten.push(poly([[W + 0.1, 0.1, 1.15], [W + 0.1, 0.96, 1.15], [W + 0.1 + uit, 0.96, 0.85], [W + 0.1 + uit, 0.1, 0.85]], 'fill="#c98a4a" opacity="0.92"'));
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

    // Buiten om op te tikken: de oprit en de tuin, als ze een kamer in de indeling zijn.
    // Gekozen (in Kamer): een omlijning; zonder dak staat de naam erbij op de grond.
    const vlakOprit = [[-2.9, -0.4, 0.01], [-1.15, -0.4, 0.01], [-1.15, D + 1.7, 0.01], [-2.9, D + 1.7, 0.01]];
    const vlakTuin = [[W + 0.3, -1.95, 0.01], [W + 2.05, -1.95, 0.01], [W + 2.05, 0.25, 0.01], [W + 0.3, 0.25, 0.01]];
    const vlakTerras = [[W + 0.3, 0.45, 0.01], [W + 2.05, 0.45, 0.01], [W + 2.05, D + 0.4, 0.01], [W + 0.3, D + 0.4, 0.01]];
    const vlakVoortuin = [[1.3, D + 0.3, 0.01], [W + 0.1, D + 0.3, 0.01], [W + 0.1, D + 1.7, 0.01], [1.3, D + 1.7, 0.01]];
    const vlakBalkon = [[W, 0.35, FH], [W + 0.55, 0.35, FH], [W + 0.55, 1.15, FH], [W, 1.15, FH]];
    const metBalkon = model.balkon && g.etages.filter((e) => !e.dak).length >= 2 ? model.balkon : null;
    for (const [deel, vlak, midden] of [
      [model.oprit, vlakOprit, [-2.02, D + 0.65, 0]],
      [model.tuin, vlakTuin, [W + 1.18, -0.85, 0]],
      [model.terras, vlakTerras, [W + 1.18, D / 2 + 0.4, 0]],
      [model.voortuin, vlakVoortuin, [(1.3 + W) / 2, D + 1.0, 0]],
      [metBalkon, vlakBalkon, [W + 0.28, 0.75, FH]],
    ]) {
      if (!deel) continue;
      if (deel.gekozen) grond.push(poly(vlak, `fill="${KLEUR.ijs}" fill-opacity="0.06" stroke="${KLEUR.ijs}" stroke-width="2" stroke-dasharray="7 5"`));
      if (model.zonderDak && deel.naam) {
        const t = P(...midden);
        labels.push(`<text x="${t[0]}" y="${t[1] + 30}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="13" font-weight="700" fill="${deel.gekozen ? KLEUR.ijs : KLEUR.zacht}">${esc(deel.naam)}</text>`);
      }
      if (deel.id) tik(deel, vlak);
    }

    return `<svg class="sc-huis${opts.meubels ? ' sc-ingericht' : ''}" viewBox="0 0 ${breed} ${hoog}" width="100%" height="100%" role="img" aria-label="${esc(model.beschrijving ?? 'Het huis')}">
      <defs>${defs.join('')}</defs>
      <g>${lucht.join('')}</g>
      <g>${grond.join('')}</g>
      <g>${huis.join('')}</g>
      <g>${stromen.join('')}</g>
      <g>${buiten.join('')}</g>
      <g>${labels.join('')}</g>
      ${tikken.length ? `<g>${tikken.join('')}</g>` : ''}
      ${opts.controle ? `<desc class="sc-controle">${esc(JSON.stringify(controle))}</desc>` : ''}
    </svg>`;
  }

  global.huis = { teken, svg, KLEUR, KAMER_ICOON, soortVan };
})(window);
