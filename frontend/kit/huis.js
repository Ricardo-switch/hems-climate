/*
 * SunArc, ontwerp 2: het huis in 3D.
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

  /** Minder beweging: zo ingesteld in de browser, of gekozen bij Weergave in de app (besluit 164). */
  const stilGekozen = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof document !== 'undefined' && document.documentElement.classList.contains('sc-stil'));

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

  /** Dezelfde kleuren als tekst op wit, in het lichte thema (besluit 181): anders halen ze het contrast niet. */
  const TEKST_LICHT = {
    [KLEUR.zon]: '#8a5a00',
    [KLEUR.ijs]: '#0a6f9e',
    [KLEUR.gloed]: '#b83a10',
    [KLEUR.mint]: '#0b7a52',
    [KLEUR.net]: '#46566a',
    [KLEUR.violet]: '#5a4bd1',
    [KLEUR.tekst]: '#0f1b2d',
    [KLEUR.zacht]: '#46566a',
    [KLEUR.gedempt]: '#5a6a7e',
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
  /** Witgoed op ware grootte: 60 bij 60 bij 85 centimeter, bij een etage van 2,6 meter. */
  const TOESTEL = { b: 0.36, h: 0.5 };
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
    // Besluit 166: bijkeuken, kelder en garage.
    bijkeuken: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M7 6.5h2"/>',
    kelder: '<path d="M3 10l9-6 9 6"/><path d="M5 10v10h14V10"/><path d="M9 20v-4h6v4M9 13h6"/>',
    garage: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M6 20v-8h12v8M6 15h12M6 18h12"/>',
  };
  /** Een soort zonder eigen meubels krijgt die van een soort die erop lijkt (besluit 166). */
  const MEUBELS_ALS = { bijkeuken: 'wasruimte', kelder: 'berging', garage: 'berging' };
  /**
   * De soort van een hele kamer: zoals de dienst hem doorgeeft (`inrichting`,
   * gekozen of voorgesteld, besluit 119), of anders uit de naam en de zones.
   */
  /** Een zone is een naam, of { naam, soort } met een gekozen soort (besluit 145). */
  const zoneNaam = (zone) => (typeof zone === 'string' ? zone : zone?.naam ?? '');
  const zoneSoort = (zone) => (typeof zone === 'object' && zone?.soort ? zone.soort : soortVan(zoneNaam(zone)));
  function soortVanKamer(kamer) {
    if (kamer.inrichting) return kamer.inrichting;
    const zones = (kamer.zones ?? []).map(zoneSoort).filter(Boolean);
    if (zones.includes('keuken') && zones.includes('woonkamer')) return 'woonkeuken';
    return soortVan(kamer.naam) ?? zones[0] ?? null;
  }
  /** De terugval als de dienst geen soort meegeeft; de dienst raadt ruimer (house.ts). */
  function soortVan(naam) {
    const n = String(naam ?? '').toLowerCase();
    if (/woonkeuken|open keuken|leefkeuken/.test(n)) return 'woonkeuken';
    if (/bijkeuken/.test(n)) return 'bijkeuken';
    if (/wasruimte|washok|laundry/.test(n)) return 'wasruimte';
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
    if (/garage/.test(n)) return 'garage';
    if (/kelder/.test(n)) return 'kelder';
    if (/zolder|vliering|berg|attic|opslag/.test(n)) return 'berging';
    return null;
  }
  // Afmetingen in eenheden van het huis.
  const FH = 1.55; // hoogte van een etage
  let D = 1.5; // diepte van het huis; dieper met de nok langs de straat (zie svg)
  /** Een binnenunit op ware grootte: zo'n 90 bij 30 centimeter, bij een etage van 2,6 meter (besluit 131). */
  const AIRCO = { b: 0.56, h: 0.19, d: 0.15 };
  /** De radiator op de achtermuur: breedte, hoogte boven de vloer en zelf. */
  const RADIATOR = { b: 0.8, onder: 0.12, h: 0.36 };
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

  /** Een appartement (huis 3.0): hoeveel verdiepingen er onder en boven liggen. */
  const gebouwVan = (model) => ({ onder: model.gebouw?.onder ?? 2, boven: model.gebouw?.boven ?? 1, panelen: model.gebouw?.panelen ?? 0 });

  /**
   * De wereld (huis 3.0): het perceel als een eiland in de lucht, met de
   * voorkant als één doorsnede door huis en grond. Alleen met `opts.wereld`,
   * en niet ingezoomd of bij een appartement. Null: het gewone perceel.
   */
  function eilandVan(model, W, opts) {
    if (!opts.wereld || model.woning === 'appartement') return null;
    const nis = !!model.kelder;
    return {
      x0: model.auto || model.oprit || model.garage || spook(model, 'auto') ? -3.35 : -1.3,
      // Een tuin krijgt ruimte: alles erin moet tegelijk kunnen zonder op elkaar te staan.
      x1: model.tuin ? W + 3.0 : model.terras ? W + 2.45 : W + 1.35,
      y0: model.tuin ? -2.9 : model.garage ? -2.6 : -1.1,
      yF: D + 0.8,
      nis,
      // Een dunne plaat grond: net diep genoeg voor de kelder, de kabel en een paar lagen.
      T: nis ? FH + 0.3 : 0.55,
    };
  }

  /**
   * Ingezoomd op één etage (zonder dak): de etages eronder en erboven als vage
   * lagen (25 oktober 2026), zodat een verdieping niet op het gras staat. Het
   * eiland zakt één etage; eronder één vage etage die naar het gras wegloopt,
   * erboven de omtrek van de volgende etage of het dak. Null: zoals het was.
   */
  function lagenVan(model) {
    if (!model.zonderDak || !model.lagen) return null;
    const onder = Math.max(0, model.lagen.onder ?? 0);
    const boven = Math.max(0, model.lagen.boven ?? 0);
    return { onder, boven, zak: onder > 0 ? FH : 0, dak: boven === 0 && model.lagen.dak !== false };
  }

  /** Alle punten die in beeld moeten, om de schaal te bepalen. */
  /*
   * De ring van de zon (28 oktober 2026, schets Wand-Huis-Ligging): ruim om het
   * huis, met het midden boven de nok. Zo loopt de zon vóór een huis op het
   * zuiden over het dak heen en niet erdoorheen. De hoogte is wat opgerekt, zodat
   * de middag duidelijk boven de ochtend en de avond staat.
   */
  function ringPunt(model, W, Ht, { az, el }) {
    const r = Math.PI / 180;
    const Rd = Math.max(W, D) * 0.7 + 2.8;
    const zc = Ht + R + 1.4;
    const v = voorDegVan(model) ?? 180;
    const c = Math.cos(el * r);
    return [W / 2 - Rd * c * Math.sin((az - v) * r), D / 2 + Rd * c * Math.cos((az - v) * r), zc + Rd * Math.sin(Math.max(0, el) * r)];
  }
  /** Of de ring er is: de echte zon, een kompas en een baan, en niet uitgezet bij Weergave. */
  const metRing = (model) => !!(model.zon?.nu && model.zon.baan?.length && voorDegVan(model) != null && !model.zon.geenRing);
  /** Waar de voorgevel naartoe kijkt (besluit 205): uit het huis, of uit het kompas. */
  function voorDegVan(model) {
    return model.voorgevelDeg ?? model.kompas?.voorgevelDeg ?? null;
  }

  function omtrek(model, g, opts = {}) {
    const { W, Ht } = g;
    const lagen = lagenVan(model);
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
    if (model.garage) pts.push([-2.95, -2.0, 0], [-2.95, -2.0, 1.2], [-1.05, -2.0, 1.2]);
    if (model.oprit?.carport) pts.push([-2.95, D + 1.5, 1.1]);
    if (model.terras) pts.push([g.W + 2.0, D + 0.4, 0], [g.W + 2.0, 0.4, 0.8]);
    if (model.voortuin) pts.push([W + 0.1, D + 1.7, 0], [1.3, D + 1.7, 0]);
    if (model.zon) pts.push([W / 2, D / 2, Ht + R + 1.6]);
    // De ring van de zon past in beeld; zonder ring alleen de zon zelf.
    if (metRing(model)) model.zon.baan.filter((p, i) => i % 3 === 0 && p.el > -1.5).forEach((p) => pts.push(ringPunt(model, W, Ht, p)));
    else if (model.zon?.nu && voorDegVan(model) != null && model.zon.nu.el > 0) pts.push(ringPunt(model, W, Ht, model.zon.nu));
    // Een appartement (huis 3.0): de verdiepingen eronder en erboven.
    if (model.woning === 'appartement') {
      const ge = gebouwVan(model);
      pts.push([-0.2, D, -ge.onder * FH - 0.1], [W + 0.6, D, -ge.onder * FH - 0.1], [0, 0, Ht + ge.boven * FH + 0.3]);
    }
    // Het eiland (huis 3.0): de hoeken en de diepte van de doorsnede.
    const ei = eilandVan(model, W, opts);
    // Een etage hoger (de vage lagen): het eiland een etage lager, en alleen de bovenkant in beeld; de rots loopt toch weg.
    if (ei && lagen?.zak) pts.push([ei.x0, ei.yF, -lagen.zak - 0.4], [ei.x1, ei.yF, -lagen.zak - 0.4], [ei.x0, ei.y0, -lagen.zak], [ei.x1, ei.y0, -lagen.zak]);
    else if (ei) pts.push([ei.x0, ei.yF, -ei.T - 0.3], [ei.x1, ei.yF, -ei.T * 0.75], [ei.x0, ei.y0, 0], [ei.x1, ei.y0, 0], [ei.x0 + 0.4, ei.y0 + 0.45, 1.6], [ei.x1 - 0.45, ei.y0 + 0.4, 1.8]);
    // Erboven de vage etage of het dak, tot waar hij wegloopt.
    if (lagen) pts.push([0, 0, Ht + (lagen.dak ? R : FH * 0.6)], [W, 0, Ht + (lagen.dak ? 0.2 : FH * 0.6)]);
    // De kelder (huis 3.0): onder de grond, met de aarde eromheen.
    if (model.kelder) pts.push([-0.4, D, -FH - 0.35], [W + 0.4, D, -FH - 0.35]);
    return pts;
  }

  function spook(model, wat) {
    return (model.spook ?? []).includes(wat);
  }

  /* -------------------------------------------------------------- tekenen */

  function teken(el, model, opts = {}) {
    el.innerHTML = svg(model, opts);
    beweegApart(el);
  }

  /** Wat in de tekening beweegt: de stroom, een ventilator, damp, regen; en wat met SMIL beweegt, zoals de ring van een camera. */
  const BEWEEGT = '.sc-stroom, .sc-trommel, .sc-fan, .sc-damp, .sc-puls, .sc-vlam, .sc-lucht, .sc-regen, .sc-sneeuw, .sc-vlieg';

  /**
   * Wat beweegt in een eigen laag (25 oktober 2026). Beweegt er iets in de
   * tekening, dan schildert de browser bij elk beeldje alles eronder opnieuw:
   * het eiland, de bomen, de verlopen. Op een oudere tablet aan de wand liep de
   * pagina daar op vast (gemeten op een pc: 316 ms schilderwerk per seconde,
   * zo 15 ms). Nu staat wat beweegt in een tweede, doorzichtige tekening
   * erboven, die de browser apart houdt; het huis eronder staat stil.
   */
  function beweegApart(el) {
    const basis = el.querySelector(':scope > svg.sc-huis');
    if (!basis) return;
    const alles = [...basis.querySelectorAll(BEWEEGT), ...[...basis.querySelectorAll('animate, animateTransform, animateMotion')].map((a) => a.parentElement)];
    // Alleen het buitenste: wat in iets bewegends zit, gaat al mee.
    const stukken = [...new Set(alles)].filter((x) => !alles.some((y) => y !== x && y.contains(x)));
    if (!stukken.length) return;
    const laag = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    laag.setAttribute('viewBox', basis.getAttribute('viewBox'));
    laag.setAttribute('class', 'sc-beweegt');
    laag.setAttribute('aria-hidden', 'true');
    for (const stuk of stukken) {
      // Met de groepen eromheen: een verschuiving, doorzichtigheid of een filter blijft zo gelden.
      let doel = laag;
      const keten = [];
      for (let p = stuk.parentElement; p && p !== basis; p = p.parentElement) keten.unshift(p);
      for (const g of keten) {
        const kopie = g.cloneNode(false);
        kopie.removeAttribute('id');
        doel.appendChild(kopie);
        doel = kopie;
      }
      doel.appendChild(stuk);
    }
    // Een vak dat nergens stond, gaat de laag dragen; zonder verschuiving, want een top of left
    // uit een regel voor de wand telde eerst niet (25 oktober 2026: op de telefoon zakte het huis 96 px).
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
      el.style.inset = 'auto';
    }
    basis.after(laag);
  }

  /**
   * Welke feestdag het is (25 oktober 2026): Halloween (24 oktober tot en met
   * 1 november), Kerst (6 december tot en met 6 januari), Oud en Nieuw (31
   * december vanaf 18:00 tot 1 januari 03:00) of Pasen (Goede Vrijdag tot en
   * met tweede paasdag). Null op een gewone dag.
   */
  function feestdagVan(ms) {
    const d = new Date(ms);
    const m = d.getMonth() + 1;
    const dag = d.getDate();
    const u = d.getHours();
    if ((m === 12 && dag === 31 && u >= 18) || (m === 1 && dag === 1 && u < 3)) return 'oudnieuw';
    if ((m === 12 && dag >= 6) || (m === 1 && dag <= 6)) return 'kerst';
    if ((m === 10 && dag >= 24) || (m === 11 && dag === 1)) return 'halloween';
    const tot = Math.round((Date.UTC(d.getFullYear(), m - 1, dag) - paasdag(d.getFullYear())) / 86_400_000);
    if (tot >= -2 && tot <= 1) return 'pasen';
    return null;
  }
  /** Eerste paasdag (de berekening van Meeus voor de gregoriaanse kalender), als UTC-middernacht. */
  function paasdag(y) {
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30;
    const l = (32 + 2 * e + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const maand = Math.floor((h + l - 7 * m + 114) / 31);
    const dag = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(y, maand - 1, dag);
  }

  function svg(model, kies = {}) {
    // Huis 3.0 overal (besluit 191): het eiland is de standaard, met de lucht van
    // de pagina erachter. Een pagina die het oude perceel wil, zegt `wereld: false`;
    // een eigen lucht achter het eiland is `eigenLucht: true`.
    const opts = { wereld: true, eigenLucht: false, ...kies };
    // Bij Weergave (25 oktober 2026): het seizoen en het weer kunnen uit; dan een gewone groene dag.
    const klassen = typeof document !== 'undefined' ? document.documentElement.classList : null;
    if (klassen?.contains('sc-geen-seizoen')) model = { ...model, seizoen: undefined };
    if (klassen?.contains('sc-geen-weer')) model = { ...model, weer: undefined };
    // De ring van de zon met de uren (28 oktober 2026) kan uit bij Weergave; de zon zelf blijft.
    // De baan van de zon uit bij Weergave (besluit 205): geen ring, en op Thuis ook geen stippelboog (`geenBaan`).
    if (klassen?.contains('sc-geen-zonnebaan') && model.zon) model = { ...model, zon: { ...model.zon, geenRing: true, geenBaan: true } };
    // De feestdag: wat het model zegt (een schets), anders vandaag, op het eiland, als het aan staat.
    const feest = model.feest !== undefined ? model.feest : opts.wereld && !klassen?.contains('sc-geen-feest') ? feestdagVan(Date.now()) : null;
    const id = `h${++uid}`;
    R = (model.etages ?? []).some((e) => e.dak && (e.kamers ?? []).length > 0) ? 2.0 : 1.15;
    // Met de nok langs de straat een dieper huis, zodat het dak met zijn echte helling een zolder overhoudt.
    D = model.dak?.nok === 'langs' ? 2.3 : 1.5;
    const breed = opts.breedte ?? 760;
    const hoog = opts.hoogte ?? 560;
    const g = opbouw(model);
    const { W, Ht } = g;
    /*
     * De gemeten helling (28 oktober 2026, schets Wand-Huis-Ligging): de nok zo
     * hoog als de helling zegt, over de halve diepte (langs de straat) of de
     * halve breedte (haaks). Binnen grenzen, zodat de zolder een kamer blijft.
     */
    if (model.dak?.hellingDeg != null) {
      const halfweg = model.dak.nok === 'langs' ? D / 2 : W / 2;
      R = Math.max(0.9, Math.min(2.4, halfweg * Math.tan((model.dak.hellingDeg * Math.PI) / 180)));
    }

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
    /** Het lichte thema (besluit 181): het huis houdt zijn kleuren, de grond wordt lichter. */
    const licht = typeof document !== 'undefined' && document.documentElement.classList.contains('sc-licht');
    /**
     * In het licht is het donkere huis een zwarte vlek in een lichte lucht. Elke
     * donkere kleur van het huis, de verlopen en wat buiten staat gaat een tint
     * omhoog, tot leisteen: licht genoeg om niet zwart te zijn, donker genoeg
     * voor de witte namen en temperaturen op de muren. Lichte kleuren, zoals een
     * lamp die brandt, blijven zoals ze zijn.
     */
    const lichter = (tekst) => (!licht ? tekst : tekst.replace(/#([0-9a-f]{6})\b/gi, (m, h) => {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l >= 0.45) return m;
      const d = max - min;
      const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      const tint = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      const l2 = 0.24 + 0.78 * l;
      const c = (1 - Math.abs(2 * l2 - 1)) * sat;
      const x = c * (1 - Math.abs((tint % 2) - 1));
      const [r1, g1, b1] = tint < 1 ? [c, x, 0] : tint < 2 ? [x, c, 0] : tint < 3 ? [0, c, x] : tint < 4 ? [0, x, c] : tint < 5 ? [x, 0, c] : [c, 0, x];
      const hex = (v) => Math.round((v + l2 - c / 2) * 255).toString(16).padStart(2, '0');
      return `#${hex(r1)}${hex(g1)}${hex(b1)}`;
    }));

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
    /** Wat buiten achter het huis staat, zoals de bomen en de haag van het eiland (huis 3.0). */
    const buitenAchter = [];
    const stromen = [];
    const labels = [];
    const kamers = [];
    // Met `opts.tik`: per kamer een onzichtbaar vlak om op te tikken, bovenop alles.
    const tikken = [];
    const tik = (kamer, pts, extra = '') => {
      if (!opts.tik) return;
      const naam = esc(kamer.naam ?? '');
      tikken.push(poly(pts, `class="sc-tik" data-kamer="${esc(kamer.id ?? kamer.naam)}"${extra} fill="transparent" role="link" tabindex="0" aria-label="${naam}"`));
    };
    // Waar apparaten staan, voor de labels.
    const plek = {};
    /** Waar het tuinhuis echt getekend is, om erop te tikken (25 oktober 2026: het vak stond ernaast). */
    let tuinhuisVak = null;
    /** Waar de zones van de tuin liggen (besluit 206): per soort een vak op de grond, om op te tikken. */
    let tuinVakken = {};
    /**
     * Onder het dak: waar de airco hangt (besluit 166), tegen de linkermuur of
     * op de achtermuur bij de nok; de droger staat er niet onder.
     */
    let aircoDak = null;
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
      ${[['lamp', '#FFB765', 0.5], ['koelt', KLEUR.ijs, 0.62], ['wacht', KLEUR.zon, 0.42], ['goed', KLEUR.mint, 0.34], ['verwarmt', KLEUR.gloed, 0.6], ['rust', '#9fb3c8', 0.1]]
        .map(([st, c, o]) => `<linearGradient id="${id}-w-${st}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="${(o * 0.5).toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="${o}"/></linearGradient>`)
        .join('')}
      <linearGradient id="${id}-hoek" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-gras" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${licht ? (winter ? '#c4cfda' : nacht ? '#8fa79a' : '#a3c2ad') : winter ? '#2b3a4a' : nacht ? '#0f1a1a' : '#1b2c27'}"/><stop offset="1" stop-color="${licht ? (winter ? '#b3c0cd' : nacht ? '#7f988b' : '#8fb39b') : winter ? '#1f2b38' : nacht ? '#0b1414' : '#14211e'}"/></linearGradient>
      <radialGradient id="${id}-zon"><stop offset="0" stop-color="#FFE7A8"/><stop offset="0.35" stop-color="${KLEUR.zon}"/><stop offset="1" stop-color="${KLEUR.zon}" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-licht"><stop offset="0" stop-color="#FFD9A0" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-koel"><stop offset="0" stop-color="${KLEUR.ijs}" stop-opacity="0.45"/><stop offset="1" stop-color="${KLEUR.ijs}" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}-warm"><stop offset="0" stop-color="${KLEUR.gloed}" stop-opacity="0.45"/><stop offset="1" stop-color="${KLEUR.gloed}" stop-opacity="0"/></radialGradient>
      <filter id="${id}-zacht" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(k * 0.12).toFixed(1)}"/></filter>
      <filter id="${id}-gloed" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(k * 0.05).toFixed(1)}"/></filter>
    `);

    /*
     * ---- de verte (huis 3.0) ----
     * In de wereld: heuvels aan de horizon, in lagen die naar achteren lichter
     * en vager worden, en een gloed van de lucht erachter. Zo krijgt het eiland
     * diepte zonder dat het de aandacht trekt.
     * Met `opts.eigenLucht: false` (de telefoon) niet: dan staat het eiland in
     * de lucht van de pagina.
     */
    if (eilandVan(model, W, opts) && opts.eigenLucht !== false) {
      const horizon = hoog * 0.78;
      // Een eigen lucht per moment: overdag licht naar de horizon toe, 's avonds warm, 's nachts diep.
      const bewolkt = (model.wolken ?? 0) > 0.7 || model.weer === 'regen';
      const verloop = nacht ? ['#060c1c', '#0d1830', '#1a2a4c'] : schemer ? ['#1e1a40', '#5a3a68', '#e88a5e'] : model.weer === 'sneeuw' || (winter && !bewolkt) ? ['#33435a', '#62809e', '#c3d2e0'] : bewolkt ? ['#26323f', '#45566a', '#7d8d9e'] : ['#173563', '#2d68a3', '#8fc6e8'];
      lucht.push(`<defs><linearGradient id="${id}-hemel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${verloop[0]}"/><stop offset="0.6" stop-color="${verloop[1]}"/><stop offset="1" stop-color="${verloop[2]}"/></linearGradient></defs>`);
      lucht.push(`<rect x="0" y="0" width="${breed}" height="${hoog}" fill="url(#${id}-hemel)"/>`);
      const tint = nacht ? ['#101a30', '#16223c', '#1c2a48'] : schemer ? ['#5a3a5a', '#6e4660', '#8a5566'] : winter ? ['#8fa3b8', '#a7b8ca', '#bccbda'] : model.weer === 'regen' ? ['#4a5868', '#5a6878', '#6b7988'] : ['#3d6f8f', '#5a8fae', '#7fb0cb'];
      lucht.push(`<defs><radialGradient id="${id}-horizon" cx="0.5" cy="1" r="0.8"><stop offset="0" stop-color="${schemer ? '#ff9a6b' : nacht ? '#4a5f9a' : '#8fc0e8'}" stop-opacity="${schemer ? 0.32 : nacht ? 0.18 : 0.22}"/><stop offset="1" stop-color="#8fc0e8" stop-opacity="0"/></radialGradient></defs>`);
      lucht.push(`<rect x="0" y="${(horizon - hoog * 0.55).toFixed(0)}" width="${breed}" height="${(hoog * 0.7).toFixed(0)}" fill="url(#${id}-horizon)"/>`);
      [0.0, 0.06, 0.12].forEach((dy, i) => {
        const y = horizon + dy * hoog;
        const pts = Array.from({ length: 13 }, (_, j) => {
          const x = (breed * j) / 12;
          return `${x.toFixed(0)},${(y - Math.abs(Math.sin(j * 0.9 + i * 1.7)) * hoog * (0.05 - i * 0.012)).toFixed(0)}`;
        });
        lucht.push(`<polygon points="0,${hoog} ${pts.join(' ')} ${breed},${hoog}" fill="${tint[2 - i]}" opacity="${(0.55 + i * 0.15).toFixed(2)}"/>`);
      });
    }

    /* ---- lucht: zon, maan, sterren, wolken (achter het huis) ---- */
    const mid = P(W / 2, D / 2, Ht + R * 0.6);
    const boog = k * Math.max(W, 4.2) * 0.95;
    /*
     * Waar de zon opkomt (25 oktober 2026): aan de kant van het oosten. Rechts
     * in de tekening ligt de richting van het kompas min 90° (zie kompas);
     * `zon.opRechts` zegt het, anders het kompas van het model, anders links.
     * Eerst kwam hij altijd links op, ook als daar het westen lag.
     */
    const opRechts = model.zon?.opRechts ?? (voorDegVan(model) != null ? Math.cos(((180 - voorDegVan(model)) * Math.PI) / 180) > 0 : false);
    const opkomst = opRechts ? 1 : -1;
    /*
     * De echte zon (28 oktober 2026, schets Wand-Huis-Ligging): met `zon.nu`
     * ({ az, el } in graden) en het kompas staat hij waar hij echt staat. Een
     * richting op de grond ligt in de tekening zoals het kompas hem tekent; de
     * lucht laat zien hoe die richting van links naar rechts valt, en hoe hoog
     * de zon staat. `zon.baan` is de baan van vandaag, van opkomst tot ondergang.
     */
    const voorgevelDeg = voorDegVan(model);
    const echteZon = model.zon?.nu && voorgevelDeg != null ? model.zon.nu : null;
    const opGrond = (az) => [-Math.sin(((az - voorgevelDeg) * Math.PI) / 180), Math.cos(((az - voorgevelDeg) * Math.PI) / 180)];
    /*
     * De baan van de dag als een ring rond het huis (28 oktober 2026): in 3D,
     * van opkomst tot ondergang, zo hoog als de zon staat. Wat achter het huis
     * loopt, valt achter het huis; wat ervoor loopt, ervoor (`zonVoor`). Wat al
     * voorbij is, doorgetrokken; wat nog komt, gestippeld. Laag oranje, hoog
     * lichtgeel. Bij de uren een stip, bij opkomst en ondergang de tijd.
     */
    const zonVoor = [];
    /** Waar de zon nu in beeld staat, voor de bundel naar het dakvlak dat licht vangt. */
    let zonInBeeld = null;
    if (echteZon && !nacht) {
      const rad = Math.PI / 180;
      const op3 = (p) => ringPunt(model, W, Ht, p);
      // Uit bij Weergave (`geenRing`): geen ring en geen uren, alleen de zon.
      const baan = metRing(model) ? model.zon.baan.filter((p) => p.el > -1.5) : [];
      const top = Math.max(20, ...baan.map((p) => p.el));
      const kleur = (el) => {
        const f = Math.max(0, Math.min(1, el / top));
        const mix = (a, b) => Math.round(a + (b - a) * f).toString(16).padStart(2, '0');
        return `#${mix(0xff, 0xff)}${mix(0x8a, 0xe8)}${mix(0x4c, 0xa8)}`;
      };
      const voor = (p) => op3(p)[1] > D / 2 + 0.4;
      // Een zachte gloed onder de hele ring, achter het huis.
      if (baan.length > 1) lucht.push(`<polyline points="${baan.map((p) => pt(P(...op3(p)))).join(' ')}" fill="none" stroke="#FFC46B" stroke-width="${(k * 0.16).toFixed(1)}" stroke-opacity="0.07" stroke-linecap="round" filter="url(#${id}-zacht)"/>`);
      for (let i = 0; i < baan.length - 1; i++) {
        const a = baan[i];
        const b = baan[i + 1];
        const gedaan = echteZon.t != null && b.t != null && b.t <= echteZon.t;
        const laag = voor({ az: (a.az + b.az) / 2, el: (a.el + b.el) / 2 }) ? zonVoor : lucht;
        laag.push(`<line x1="${P(...op3(a))[0].toFixed(1)}" y1="${P(...op3(a))[1].toFixed(1)}" x2="${P(...op3(b))[0].toFixed(1)}" y2="${P(...op3(b))[1].toFixed(1)}" stroke="${kleur((a.el + b.el) / 2)}" stroke-width="${gedaan ? 2.6 : 1.6}" stroke-opacity="${laag === zonVoor ? (gedaan ? 0.42 : 0.28) : gedaan ? 0.85 : 0.6}" stroke-linecap="round" ${gedaan ? '' : 'stroke-dasharray="1 6"'}/>`);
      }
      // De uren, om de drie uur, en de tijd van opkomst en ondergang.
      for (const p of baan) {
        if (p.uur == null || p.uur % 3 !== 0 || p.el < 1) continue;
        const q = P(...op3(p));
        const laag = voor(p) ? zonVoor : lucht;
        laag.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="${kleur(p.el)}" opacity="0.85"/>`);
        laag.push(`<text x="${q[0].toFixed(1)}" y="${(q[1] - 9).toFixed(1)}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="11.5" font-weight="700" fill="${kleur(p.el)}" opacity="0.8" stroke="#0a1220" stroke-opacity="0.6" stroke-width="3" paint-order="stroke">${p.uur}</text>`);
      }
      for (const [p, pijl] of [[baan[0], '↑'], [baan[baan.length - 1], '↓']]) {
        if (!p?.klok) continue;
        const q = P(...op3({ ...p, el: Math.max(0, p.el) }));
        const laag = voor(p) ? zonVoor : lucht;
        laag.push(`<path d="M ${(q[0] - 9).toFixed(1)} ${q[1].toFixed(1)} a 9 9 0 0 1 18 0 z" fill="#FF9A55" opacity="0.85"/><line x1="${(q[0] - 14).toFixed(1)}" y1="${q[1].toFixed(1)}" x2="${(q[0] + 14).toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="#FFB27A" stroke-width="1.5" opacity="0.8"/>`);
        laag.push(`<text x="${q[0].toFixed(1)}" y="${(q[1] + 18).toFixed(1)}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="12" font-weight="700" fill="#FFC79A" stroke="#0a1220" stroke-opacity="0.6" stroke-width="3" paint-order="stroke">${pijl} ${esc(p.klok)}</text>`);
      }
      // De zon zelf: een gloed, een krans van stralen en een kern.
      if (echteZon.el > 0) {
        const q = P(...op3(echteZon));
        zonInBeeld = q;
        const laag = voor(echteZon) ? zonVoor : lucht;
        // Vóór het huis wat zachter: het huis blijft leesbaar.
        const helder = (1 - 0.5 * (model.wolken ?? 0)) * (laag === zonVoor ? 0.8 : 1);
        defs.push(`<radialGradient id="${id}-kern"><stop offset="0" stop-color="#FFFBEA"/><stop offset="0.55" stop-color="#FFE29A"/><stop offset="1" stop-color="#FFB547"/></radialGradient>`);
        laag.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(k * 1.1).toFixed(1)}" fill="url(#${id}-zon)" opacity="${(0.55 * helder).toFixed(2)}"/>`);
        laag.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(k * 0.5).toFixed(1)}" fill="#FFD27A" opacity="${(0.16 * helder).toFixed(2)}" filter="url(#${id}-zacht)"/>`);
        const stralen = Array.from({ length: 12 }, (_, i) => {
          const h = (i * 30 + 15) * rad;
          const [r0, r1] = [k * 0.32, k * (i % 2 ? 0.44 : 0.52)];
          return `<line x1="${(q[0] + Math.cos(h) * r0).toFixed(1)}" y1="${(q[1] + Math.sin(h) * r0).toFixed(1)}" x2="${(q[0] + Math.cos(h) * r1).toFixed(1)}" y2="${(q[1] + Math.sin(h) * r1).toFixed(1)}"/>`;
        }).join('');
        laag.push(`<g stroke="#FFD98A" stroke-width="2" stroke-linecap="round" opacity="${(0.7 * helder).toFixed(2)}">${stralen}</g>`);
        laag.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(k * 0.24).toFixed(1)}" fill="url(#${id}-kern)" opacity="${helder.toFixed(2)}"/>`);
      }
    } else if (model.zon?.stand != null && !nacht) {
      // De zon staat óp de boog: een halve ellips van opkomst tot ondergang,
      // en `stand` is de hoek erlangs. Zo valt hij nooit naast de stippellijn,
      // ook niet halverwege de ochtend.
      const f = Math.max(0, Math.min(1, model.zon.stand));
      const voet = mid[1] + boog * 0.12;
      // Nooit boven de tekening uit: daar staat op een pagina de tekst (15 oktober).
      // Dan wordt de hele boog lager, niet alleen de zon: zo blijft hij op de lijn (16 oktober).
      const ry = Math.min(boog * 0.74, voet - k * 0.3);
      const sx = mid[0] + opkomst * boog * Math.cos(Math.PI * f);
      const sy = voet - ry * Math.sin(Math.PI * f);
      if (!model.zon.geenBaan) lucht.push(`<path d="M ${mid[0] - boog} ${voet} A ${boog} ${ry} 0 0 1 ${mid[0] + boog} ${voet}" fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 7"/>`);
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
      const my = Math.max(k * 0.5, mid[1] - boog * 0.55);
      lucht.push(`<circle cx="${mx}" cy="${my}" r="${k * 0.42}" fill="${licht ? '#ffffff' : '#E8EEF8'}" opacity="${licht ? 0.5 : 0.08}"/><circle cx="${mx}" cy="${my}" r="${k * 0.2}" fill="${licht ? '#ffffff' : '#E9EEF6'}"/><circle cx="${mx + k * 0.08}" cy="${my - k * 0.05}" r="${k * 0.18}" fill="${licht ? '#d6dcea' : '#101a2b'}"/>`);
    }
    if (model.wolken) {
      const n = Math.round(2 + model.wolken * 3);
      for (let i = 0; i < n; i++) {
        const cx = mid[0] + (i / Math.max(1, n - 1) - 0.5) * boog * 1.7;
        const cy = mid[1] - boog * (0.35 + 0.18 * ((i * 37) % 3) / 2);
        const s = k * (0.7 + ((i * 53) % 5) * 0.12);
        lucht.push(`<g opacity="${((licht ? 0.6 : 0.25) + 0.35 * model.wolken).toFixed(2)}" filter="url(#${id}-zacht)"><ellipse cx="${cx}" cy="${cy}" rx="${s * 1.5}" ry="${s * 0.42}" fill="${licht || (opts.wereld && !nacht) ? '#ffffff' : winter ? '#9fb0c2' : '#8a9bb0'}"/><ellipse cx="${cx + s * 0.4}" cy="${cy - s * 0.25}" rx="${s * 0.8}" ry="${s * 0.45}" fill="${licht || (opts.wereld && !nacht) ? '#f4f7fb' : winter ? '#aebdcc' : '#94a5b9'}"/></g>`);
      }
    }

    /*
     * De voordeur (rapport 15 oktober): in de hal op de begane grond, anders in
     * de eerste kamer. Het huis is aan de voorkant open, dus de deur staat in de
     * snijlijn: het kozijn, en de deur half open naar binnen. Ernaast de
     * deurbel, en in de hal de meterkast. Alleen als het model een voordeur
     * vraagt, en niet ingezoomd op één etage.
     */
    const begane = g.etages.filter((e) => !e.dak)[0];
    const voordeur = (() => {
      if (!model.voordeur || !begane || model.zonderDak) return null;
      const tot = begane.kamers.reduce((t, x) => t + (x.gewicht ?? 1), 0);
      let x = 0;
      let hal = null;
      let eerste = null;
      for (const kamer of begane.kamers) {
        const b = (W * (kamer.gewicht ?? 1)) / tot;
        eerste ??= { x0: x, x1: x + b };
        if (!hal && soortVanKamer(kamer) === 'hal') hal = { x0: x, x1: x + b };
        x += b;
      }
      const r = hal ?? eerste;
      if (!r) return null;
      const breed = 0.48;
      const xd = Math.min(r.x1 - breed - 0.14, Math.max(r.x0 + 0.18, (r.x0 + r.x1) / 2 - breed / 2 + 0.12));
      return { x0: xd, x1: xd + breed, kamer: r, deurbel: model.voordeur.deurbel ?? null };
    })();

    /*
     * De wereld (huis 3.0): het perceel als een eiland in de lucht, met de
     * voorkant als één doorsnede door huis en grond. Alleen met `opts.wereld`,
     * en niet ingezoomd of bij een appartement.
     */
    const eiland = eilandVan(model, W, opts);
    /** Waar de batterij staat: op het eiland (huis 3.0) dun aan de zijgevel achteraan, ver van de buitenunit voorin. */
    const accuPlek = eiland ? { x: W + 0.02, y: 0.12, wand: true } : { x: W + 0.02, y: D - 0.75 };

    /** Waar de kabel van het net het perceel in komt: aan de straat, voor de meterkast. */
    const netStraat = eiland ? [eiland.x0 + 0.45, eiland.yF - 0.28] : voordeur ? [Math.max(0.2, voordeur.x0 - 0.35), D + 1.8] : [-0.6, D + 1.1];

    /* ---- grond: het perceel, de oprit ---- */
    // Ingezoomd op een etage: alleen een smalle rand grond om het huis.
    // Zonder dak strak om het huis, tenzij de oprit of de tuin erbij hoort (de begane grond).
    const gx0 = model.auto || model.oprit || spook(model, 'auto') || opts.ruimte ? -3.0 : model.zonderDak ? -0.45 : -1.4;
    const gx1 = model.tuin || model.terras ? W + 2.1 : model.zonderDak ? W + 0.75 : W + 1.3;
    const gy0 = model.tuin || model.garage ? -2.1 : model.zonderDak ? -0.35 : -0.6;
    const gy1 = model.oprit || model.voortuin ? D + 1.9 : model.zonderDak ? D + 0.7 : D + 1.9;
    grond.push(poly([[gx0, gy0, 0], [gx1, gy0, 0], [gx1, gy1, 0], [gx0, gy1, 0]], `fill="url(#${id}-gras)"`));
    // De rand van het perceel, als een dikke plaat.
    grond.push(poly([[gx0, gy1, 0], [gx1, gy1, 0], [gx1, gy1, -0.18], [gx0, gy1, -0.18]], `fill="${licht ? '#6f8a79' : '#0b1219'}"`));
    grond.push(poly([[gx1, gy0, 0], [gx1, gy1, 0], [gx1, gy1, -0.18], [gx1, gy0, -0.18]], `fill="${licht ? '#5e7768' : '#080e14'}"`));
    // Een pad van tegels naar de voordeur.
    const padX = voordeur ? [voordeur.x0, voordeur.x1] : [0.5, 1.0];
    for (let i = 0; i < (model.zonderDak ? 0 : 4); i++) {
      const y0 = D + 0.18 + i * 0.36;
      grond.push(poly([[padX[0], y0, 0.004], [padX[1], y0, 0.004], [padX[1], y0 + 0.26, 0.004], [padX[0], y0 + 0.26, 0.004]], `fill="#ffffff" opacity="${voordeur ? 0.08 : 0.05}"`));
    }
    // Een tuin is gras, en lichter dan de rest van het perceel; met een terras onder het zonnescherm.
    if (model.tuin && !model.zonderDak) {
      grond.push(poly([[W + 0.3, -1.95, 0.003], [W + 2.05, -1.95, 0.003], [W + 2.05, 0.25, 0.003], [W + 0.3, 0.25, 0.003]], `fill="${licht ? (winter ? '#d3dce5' : '#86b294') : winter ? '#33465a' : nacht ? '#173326' : '#26503a'}"`));
      if (model.tuin.zonnescherm) {
        const tx0 = W + 0.06;
        const tx1 = W + 1.05;
        grond.push(poly([[tx0, 0.06, 0.005], [tx1, 0.06, 0.005], [tx1, 1.0, 0.005], [tx0, 1.0, 0.005]], `fill="${licht ? '#c3cad2' : '#3b4652'}"`));
        for (let x = tx0 + 0.25; x < tx1 - 0.05; x += 0.25) grond.push(line([[x, 0.06, 0.007], [x, 1.0, 0.007]], 'stroke="#2c353f" stroke-width="1"'));
        for (let y = 0.31; y < 0.97; y += 0.25) grond.push(line([[tx0, y, 0.007], [tx1, y, 0.007]], 'stroke="#2c353f" stroke-width="1"'));
      }
    }
    if (model.auto || model.oprit || spook(model, 'auto')) {
      grond.push(poly([[-2.75, -0.4, 0.005], [-1.2, -0.4, 0.005], [-1.2, D + 1.7, 0.005], [-2.75, D + 1.7, 0.005]], `fill="${licht ? '#b9c2cb' : '#1d2933'}"`));
    }
    // Schaduw onder het huis.
    grond.push(`<g filter="url(#${id}-zacht)" opacity="0.6">${poly([[0.1, 0.1, 0], [W + 0.25, 0.1, 0], [W + 0.25, D + 0.25, 0], [0.1, D + 0.25, 0]], `fill="${licht ? '#3a4a58' : '#05090d'}"`)}</g>`);
    // De wereld vervangt het perceel (huis 3.0).
    const lagen = lagenVan(model);
    if (eiland) {
      grond.length = 0;
      const [vanAchter, vanBuiten, vanLabels] = [buitenAchter.length, buiten.length, labels.length];
      bouwEiland();
      // Een etage hoger (de vage lagen): het hele eiland, met zijn bomen en lantaarn, een etage omlaag.
      if (lagen?.zak) {
        const omlaag = (lijst, van) => {
          const stuk = lijst.splice(van).join('');
          if (stuk) lijst.push(`<g transform="translate(0 ${(lagen.zak * k).toFixed(1)})">${stuk}</g>`);
        };
        omlaag(grond, 0);
        omlaag(buitenAchter, vanAchter);
        omlaag(buiten, vanBuiten);
        omlaag(labels, vanLabels);
      }
    }

    /*
     * ---- de kelder (huis 3.0): opengewerkt in de grond ----
     * Onder de begane grond, net zo open als de rest. Eromheen de aarde als
     * doorsnede, met een paar lagen, zodat je ziet dat hij onder de grond ligt.
     * Geen ramen in de achtermuur; de rechtergevel is aarde.
     */
    if (model.kelder && !model.zonderDak) {
      const kz = -FH;
      const bodem = kz - 0.3;
      const aarde = licht ? ['#a08c74', '#8c7963', '#7a6955'] : ['#2b241e', '#231d18', '#1c1713'];
      // In de wereld ligt de kelder in een nis in de doorsnede: daar is de aarde al.
      if (!eiland) {
      // De zijkant van de aarde rechts, dan de voorkant.
      huis.push(poly([[W + 0.35, D, 0], [W + 0.35, -0.6, 0], [W + 0.35, -0.6, bodem], [W + 0.35, D, bodem]], `fill="${aarde[2]}"`));
      huis.push(poly([[-0.35, D, 0], [W + 0.35, D, 0], [W + 0.35, D, bodem], [-0.35, D, bodem]], `fill="${aarde[0]}"`));
      for (const [f, o] of [[0.22, 0.5], [0.55, 0.35], [0.85, 0.25]]) {
        const zl = bodem * f;
        huis.push(line([[-0.35, D + 0.002, zl], [W * 0.3, D + 0.002, zl - 0.04], [W * 0.65, D + 0.002, zl + 0.03], [W + 0.35, D + 0.002, zl - 0.02]], `stroke="${aarde[1]}" stroke-opacity="${o}" stroke-width="3"`));
      }
      // Een paar steentjes in de aarde.
      for (const [x, z] of [[-0.2, -0.5], [W + 0.2, -1.1], [-0.15, -1.4], [W + 0.22, -0.35]]) {
        const c = P(x, D + 0.003, z);
        huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${(k * 0.06).toFixed(1)}" ry="${(k * 0.035).toFixed(1)}" fill="${aarde[1]}"/>`);
      }
      }
      const kamersK = model.kelder.kamers ?? [];
      const totaalK = kamersK.reduce((s2, k2) => s2 + (k2.gewicht ?? 1), 0) || 1;
      let xk = 0;
      erBoven = true;
      for (const kamer of kamersK) {
        const x1 = xk + (W * (kamer.gewicht ?? 1)) / totaalK;
        tekenKamer({ ...kamer, geenRaam: true }, xk, x1, kz, 0, false);
        xk = x1;
      }
      // Het plafond van de kelder als doorsnede, en de grondlijn erboven.
      huis.push(poly([[0, D, 0], [W, D, 0], [W, D, -0.09], [0, D, -0.09]], `fill="#3c4a5b"`));
      if (!eiland) huis.push(line([[-0.35, D + 0.004, 0], [W + 0.35, D + 0.004, 0]], `stroke="${licht ? '#6f8a79' : '#3f6b52'}" stroke-width="3"`));
    }

    // Wat na het huis komt en ervoor ligt, zoals de verdiepingen boven een appartement.
    const burenVoor = [];
    if (lagen) bouwLagen();
    /*
     * ---- een appartement (huis 3.0) ----
     * Jouw verdieping in het gebouw: de verdiepingen eronder en erboven als
     * vage gevels die naar boven en onder vervagen, zonder perceel eromheen.
     * Panelen op het gezamenlijke dak, als die er zijn.
     */
    const appartement = model.woning === 'appartement' && !model.zonderDak ? gebouwVan(model) : null;
    if (appartement) {
      grond.length = 0;
      const gid = `${id}-gebouw`;
      const kleur = licht ? '#9fb0c2' : '#41536a';
      defs.push(`<linearGradient id="${gid}-o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${kleur}" stop-opacity="0.8"/><stop offset="1" stop-color="${kleur}" stop-opacity="0.05"/></linearGradient><linearGradient id="${gid}-b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${kleur}" stop-opacity="0.75"/><stop offset="1" stop-color="${kleur}" stop-opacity="0.1"/></linearGradient>`);
      const zo = -appartement.onder * FH;
      const zb = Ht + appartement.boven * FH;
      const vlak = (z0v, z1v, verloop) => {
        grond.push(poly([[W, 0, z0v], [W, D, z0v], [W, D, z1v], [W, 0, z1v]], `fill="url(#${gid}-${verloop})" opacity="0.7"`));
        grond.push(poly([[0, D, z0v], [W, D, z0v], [W, D, z1v], [0, D, z1v]], `fill="url(#${gid}-${verloop})"`));
        for (let z = z0v; z < z1v - 0.01; z += FH) {
          for (const rx of [0.3, W * 0.55]) grond.push(poly([[rx, D + 0.002, z + 0.45], [rx + 0.7, D + 0.002, z + 0.45], [rx + 0.7, D + 0.002, z + FH - 0.35], [rx, D + 0.002, z + FH - 0.35]], `fill="${nacht ? '#F4C27E' : '#8fb1d1'}" opacity="${nacht ? 0.22 : 0.12}"`));
          grond.push(line([[0, D + 0.003, z], [W, D + 0.003, z]], 'stroke="#C9D6E2" stroke-opacity="0.15" stroke-width="1.2"'));
        }
      };
      if (appartement.onder > 0) vlak(zo, 0, 'o');
      // Erboven alleen de gevels: het dak van het gebouw ligt erop, de kamers blijven te zien.
      if (appartement.boven > 0) burenVoor.push((() => {
        const voor = grond.length;
        vlak(Ht, zb, 'b');
        grond.push(poly([[0, 0, zb], [W, 0, zb], [W, D, zb], [0, D, zb]], `fill="${kleur}" opacity="0.35"`));
        return grond.splice(voor).join('');
      })());
      if (appartement.panelen) {
        const voor = buiten.length;
        plaatPanelen(0.2, 0.15, W - 0.4, D - 0.3, zb + 0.02, appartement.panelen);
        burenVoor.push(buiten.splice(voor).join(''));
        plek.panelenGebouw = [W / 2, D / 2, zb + 0.2];
      }
    }

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

    const dak = !model.zonderDak && !appartement;
    const zt = z0;
    /*
     * De nok langs de straat (28 oktober 2026, schets Wand-Huis-Ligging): de
     * dakvlakken liggen voor en achter, de gevels links en rechts lopen door tot
     * de nok. Het voorste dakvlak is van glas, zodat je de zolder blijft zien;
     * de achterwand van de zolder is het achterste dakvlak, van binnen gezien.
     * Zonder `dak.nok` blijft het zoals het was: de nok van voor naar achter.
     */
    const nokLangs = dak && model.dak?.nok === 'langs';
    /** Hoe fel de zon nu op een dakvlak schijnt (0 tot 1), met de echte zon; null zonder. */
    const opVlak = (vlakDeg) => {
      if (!echteZon || echteZon.el <= 0) return null;
      const r = Math.PI / 180;
      const helling = (model.dak?.hellingDeg ?? 45) * r;
      const c = Math.sin(echteZon.el * r) * Math.cos(helling) + Math.cos(echteZon.el * r) * Math.sin(helling) * Math.cos((echteZon.az - vlakDeg) * r);
      return Math.max(0, Math.min(1, c));
    };
    if (nokLangs) {
      const onderDak = dakEtage?.kamers ?? [];
      const nok = D / 2;
      const totaal = onderDak.reduce((t, k2) => t + (k2.gewicht ?? 1), 0) || 1;
      let x0 = 0;
      for (const kamer of onderDak.length ? onderDak : [null]) {
        const x1 = kamer ? x0 + (W * (kamer.gewicht ?? 1)) / totaal : W;
        const lampAan = (kamer?.apparaten ?? []).some((a) => a.soort === 'lamp' && a.aan);
        const donker = nacht && !lampAan;
        const achter = [[x0, 0, zt], [x1, 0, zt], [x1, nok, zt + R], [x0, nok, zt + R]];
        huis.push(poly(achter, `fill="${donker ? '#141c29' : kleurAchter(kamer)}"`));
        if (kamer && !donker) huis.push(poly(achter, `fill="url(#${id}-w-${(nacht || schemer) && lampAan ? kleurWas(kamer) ?? 'lamp' : kamer.stand ?? 'rust'})"`));
        huis.push(poly([[x0, 0, zt], [x1, 0, zt], [x1, D, zt], [x0, D, zt]], `fill="${donker ? '#0f151f' : '#1a2330'}"`));
        if (x0 > 0) huis.push(poly([[x0, 0, zt], [x0, D, zt], [x0, nok, zt + R]], `fill="${donker ? '#121a26' : '#3a4a60'}"`));
        if (kamer) {
          sfeer(kamer, x0, x1, zt, zt + R * 0.8);
          // De inrichting en de apparaten, tegen de achterwand: die is laag, want daar zit de goot.
          const dakPlafond = () => zt + R * 0.55;
          erBoven = false;
          aircoDak = (kamer.apparaten ?? []).some((a) => a.soort === 'airco') ? aircoOnderDak(x0, x1, zt, dakPlafond) : null;
          inrichten(kamer, x0, x1, zt, zt + R * 0.85, dakPlafond, donker);
          blokKamer = kamer.id ?? kamer.naam;
          dezeKamer = kamer;
          for (const app of kamer.apparaten ?? []) apparaat(app, x0, x1, zt, zt + R * 0.85, true, dakPlafond);
          aircoDak = null;
          const xm = (x0 + x1) / 2;
          kamers.push({ id: kamer.id, naam: kamer.naam, xm, z0: zt, z1: zt + R });
          tik(kamer, [[x0, D, zt], [x1, D, zt], [x1, nok, zt + R], [x0, nok, zt + R]]);
          kamerLabel(kamer, xm, zt + R * 0.4, true, (x1 - x0) * 0.8, R * 0.7);
        }
        x0 = x1;
      }
      huis.push(poly([[0, D, zt], [W, D, zt], [W, D, zt - 0.09], [0, D, zt - 0.09]], `fill="#3c4a5b"`));
    }
    if (dak && !nokLangs) {
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
        // Onder het dak volgt alles de schuine wand: het plafond is het dak zelf.
        const dakPlafond = (x) => dakZ(x) - 0.06;
        aircoDak = (kamer.apparaten ?? []).some((a) => a.soort === 'airco') ? aircoOnderDak(x0, x1, zt, dakPlafond) : null;
        inrichten(kamer, x0, x1, zt, zt + R * 0.85, dakPlafond, donker);
        blokKamer = kamer.id ?? kamer.naam;
        dezeKamer = kamer;
        for (const app of kamer.apparaten ?? []) apparaat(app, x0, x1, zt, zt + R * 0.85, true, dakPlafond);
        aircoDak = null;
        if (x0 > 0) huis.push(line([[x0, D, zt], [x0, D, dakZ(x0)]], `stroke="#C9D6E2" stroke-opacity="0.35" stroke-width="1.6"`));
        kamers.push({ id: kamer.id, naam: kamer.naam, xm, z0: zt, z1: zt + R });
        tik(kamer, stukGevel(x0, x1).map(([x, , z]) => [x, D, z]));
        // Staat er een droger, dan de naam ernaast in plaats van eroverheen.
        let xl = xm;
        let laag = false;
        const toestel = (kamer.apparaten ?? []).find((a) => a.soort === 'droger' || a.soort === 'wasmachine' || a.soort === 'vaatwasser');
        const opDePlek = toestel ? plek[toestel.soort] : null;
        if (opDePlek) {
          // Op het scherm vergelijken: de droger staat achterin en schuift daardoor naar rechts.
          const half = ((kamer.naam ?? '').length * 6.9 + (kamer.temp ?? '').length * 8.8 + 6) / 2 / k;
          const rechts = opDePlek[0] * AX + (D - opDePlek[1]) * BX + 0.3 * AX;
          if (xm * AX - half < rechts + 0.08) xl = Math.min(x1 - half / AX - 0.05, (rechts + 0.08 + half) / AX);
          // Is de kamer daar te smal voor, dan de naam laag aan de voorkant, onder de droger (besluit 166).
          const links = rechts - 0.6 * AX;
          laag = xl * AX - half < rechts + 0.08 && xl * AX + half > links - 0.08;
        }
        const vrij = dakZ(xl) - zt;
        kamerLabel(kamer, xl, laag ? zt + 0.22 : vrij * k < 96 ? zt + vrij * 0.58 : zt + vrij * 0.5, true, (x1 - x0) * (onderDak.length > 1 ? 0.8 : 0.6), laag ? 0 : vrij);
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
        // Waar de accu aan de gevel hangt (huis 3.0), zit geen raam.
        if (accuPlek.wand && (model.batterij || spook(model, 'batterij')) && i === 0 && z0 < 0.01) continue;
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
          const zb = z1 - 0.28 - dicht * (z1 - 0.28 - (z0 + 0.35));
          huis.push(poly([[W + 0.02, y0 - 0.03, z1 - 0.25], [W + 0.02, y1 + 0.03, z1 - 0.25], [W + 0.02, y1 + 0.03, zb], [W + 0.02, y0 - 0.03, zb]], `fill="#3a4757" opacity="0.92"`));
          for (let s = 1; s < 6; s++) {
            const zz = z1 - 0.25 - (s / 6) * (z1 - 0.25 - zb);
            huis.push(line([[W + 0.021, y0 - 0.03, zz], [W + 0.021, y1 + 0.03, zz]], 'stroke="#536376" stroke-width="0.8"'));
          }
        }
      }
      z0 = z1;
    }
    // De nok langs de straat (schets Wand-Huis-Ligging): rechts een puntgevel, voor een dakvlak van glas.
    if (dak && nokLangs) {
      const nok = D / 2;
      const voorDeg = voorDegVan(model) ?? 180;
      huis.push(poly([[W, 0, zt], [W, D, zt], [W, nok, zt + R]], `fill="url(#${id}-muur)"`));
      if (zonKracht > 0) huis.push(poly([[W, 0, zt], [W, D, zt], [W, nok, zt + R]], `fill="url(#${id}-rand)"`));
      // De nok, en de goot achter: van het achterste dakvlak zie je van voren alleen de rand.
      huis.push(poly([[-0.08, nok - 0.05, zt + R + 0.04], [W + 0.14, nok - 0.05, zt + R + 0.04], [W + 0.14, nok + 0.05, zt + R + 0.04], [-0.08, nok + 0.05, zt + R + 0.04]], 'fill="#2c3542"'));
      // Panelen in rijen over een dakvlak, van de goot (u 0) naar de nok (u 1), over de breedte (v).
      const rij = (n, q, stijl) => {
        const aantal = Math.max(0, Math.min(36, Math.round(n)));
        if (!aantal) return;
        const rijen = aantal <= 6 ? 1 : aantal <= 16 ? 2 : 3;
        const kol = Math.ceil(aantal / rijen);
        const hoog = (0.78 - (rijen - 1) * 0.04) / rijen;
        const breed = (W - 0.4) / kol;
        for (let i = 0; i < aantal; i++) {
          const r = Math.floor(i / kol);
          const c = i % kol;
          const u0 = 0.14 + r * (hoog + 0.04);
          const v0 = 0.2 + c * breed;
          huis.push(poly([q(u0, v0), q(u0, v0 + breed - 0.06), q(u0 + hoog, v0 + breed - 0.06), q(u0 + hoog, v0)], stijl));
        }
      };
      const voorQ = (u, v) => [v, D + 0.08 - u * (D + 0.08 - nok), zt - 0.06 + u * (R + 0.06) + 0.02];
      const achterQ = (u, v) => [v, -0.06 + u * (nok + 0.06), zt - 0.06 + u * (R + 0.06) + 0.02];
      const voorN = model.zon?.panelen ?? 0;
      const achterN = model.zon?.panelenLinks ?? 0;
      // Achter: door het glas heen alleen de omtrek, zoals het andere dakvlak eerst.
      rij(achterN, achterQ, `fill="#4d7eac" fill-opacity="0.18" stroke="#9cc0e4" stroke-opacity="0.6" stroke-width="1"`);
      const achterLicht = opVlak(voorDeg + 180);
      if (achterLicht) rij(achterN, achterQ, `fill="#FFC24D" fill-opacity="${(0.4 * achterLicht).toFixed(2)}"`);
      // Het glas van het voorste dakvlak, met een rand en een zweem.
      const glas = [[-0.06, D + 0.1, zt - 0.08], [W + 0.14, D + 0.1, zt - 0.08], [W + 0.14, nok, zt + R], [-0.06, nok, zt + R]];
      huis.push(poly(glas, `fill="#9cc0e4" fill-opacity="0.06" stroke="#C9D6E2" stroke-opacity="0.5" stroke-width="1.2" stroke-linejoin="round"`));
      rij(voorN, voorQ, spook(model, 'panelen') ? `fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.5" stroke-dasharray="3 3"` : `fill="url(#${id}-paneel)" fill-opacity="0.5" stroke="#8fb3d9" stroke-opacity="0.8" stroke-width="0.9"`);
      const voorLicht = opVlak(voorDeg);
      if (voorLicht) rij(voorN, voorQ, `fill="#FFC24D" fill-opacity="${(0.42 * voorLicht).toFixed(2)}"`);
      bundel(voorLicht, glas);
    }
    /*
     * Een zachte bundel van de zon naar een dakvlak dat licht vangt, en een warme
     * glans erover (schets Wand-Huis-Ligging): hoe meer licht, hoe sterker.
     */
    function bundel(licht, vlak) {
      if (!zonInBeeld || !licht || licht < 0.15) return;
      const hoeken = vlak.map((p) => P(...p));
      const midden = hoeken.reduce((s, p) => [s[0] + p[0] / hoeken.length, s[1] + p[1] / hoeken.length], [0, 0]);
      const gid = `${id}-bundel-${Math.round(licht * 100)}-${Math.round(midden[0])}`;
      defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${zonInBeeld[0].toFixed(1)}" y1="${zonInBeeld[1].toFixed(1)}" x2="${midden[0].toFixed(1)}" y2="${midden[1].toFixed(1)}"><stop offset="0" stop-color="#FFD27A" stop-opacity="${(0.45 * licht).toFixed(2)}"/><stop offset="0.65" stop-color="#FFB547" stop-opacity="${(0.14 * licht).toFixed(2)}"/><stop offset="1" stop-color="#FFA53D" stop-opacity="0.02"/></linearGradient>`);
      // Van de zon naar de twee hoeken die het verst uit elkaar liggen, gezien vanaf de zon.
      const hoek = (p) => Math.atan2(p[1] - zonInBeeld[1], p[0] - zonInBeeld[0]);
      const opHoek = [...hoeken].sort((a, b) => hoek(a) - hoek(b));
      zonVoor.push(`<polygon points="${pt(zonInBeeld)} ${pt(opHoek[0])} ${pt(midden)} ${pt(opHoek[opHoek.length - 1])}" fill="url(#${gid})"/>`);
      zonVoor.push(`<polygon points="${hoeken.map(pt).join(' ')}" fill="#FFB547" opacity="${(0.14 * licht).toFixed(2)}"/>`);
    }
    if (dak && !nokLangs) {
    // Rechter dakvlak met panelen.
    huis.push(poly([[W / 2, -0.08, zt + R], [W + 0.14, -0.08, zt - 0.08], [W + 0.14, D + 0.08, zt - 0.08], [W / 2, D + 0.08, zt + R]], `fill="url(#${id}-dak)"`));
    // Panelen alleen als het huis ze heeft: `panelen: 0` is geen panelen.
    if ((model.zon && (model.zon.panelen !== 0 || (model.zon.panelenLinks ?? 0) > 0)) || spook(model, 'panelen')) {
      // Precies zoveel panelen als er liggen (besluit 166), in rijen over het dakvlak;
      // de onderste rij mag korter zijn. Eerst werd het afgerond op twee rijen van 3 tot 6.
      const raster = (n, q, stijl) => {
        const aantal = Math.max(0, Math.min(36, Math.round(n)));
        if (!aantal) return;
        const rijen = aantal <= 4 ? 1 : aantal <= 16 ? 2 : 3;
        const kol = Math.ceil(aantal / rijen);
        const hoog = (0.8 - (rijen - 1) * 0.04) / rijen;
        const breed = (D - 0.24) / kol;
        for (let i = 0; i < aantal; i++) {
          const r = Math.floor(i / kol);
          const c = i % kol;
          const u0 = 0.12 + r * (hoog + 0.04);
          const u1 = u0 + hoog;
          const v0 = 0.12 + c * breed;
          const v1 = v0 + breed - Math.min(0.06, breed * 0.15);
          huis.push(poly([q(u0, v0), q(u0, v1), q(u1, v1), q(u1, v0)], stijl));
        }
      };
      raster(
        model.zon?.panelen ?? 6,
        (u, v) => [W - u * (W / 2) + 0.02, v, zt + u * R + 0.02],
        spook(model, 'panelen') ? `fill="none" stroke="${KLEUR.zon}" stroke-opacity="0.5" stroke-dasharray="3 3"` : `fill="url(#${id}-paneel)" stroke="#5b7aa0" stroke-opacity="0.6" stroke-width="0.8"`,
      );
      // Panelen op het andere dakvlak (besluit 111): dat vlak is open om de zolder te
      // tonen, dus daar alleen de omtrek en een zweem, zodat de zolder zichtbaar blijft.
      raster(model.zon?.panelenLinks ?? 0, (u, v) => [u * (W / 2) - 0.02, v, zt + u * R + 0.02], `fill="#4d7eac" fill-opacity="0.22" stroke="#9cc0e4" stroke-opacity="0.75" stroke-width="1"`);
      if (zonKracht > 0) {
        // Het licht dat de panelen vangen, als een glans over het dakvlak.
        const q = (u, v) => [W - u * (W / 2) + 0.03, v, zt + u * R + 0.03];
        huis.push(`<g class="sc-glans">${poly([q(0.1, 0.05), q(0.1, D - 0.05), q(0.92, D - 0.05), q(0.92, 0.05)], `fill="url(#${id}-glans)"`)}</g>`);
      }
    }
    // De bundel naar het rechter dakvlak (schets Wand-Huis-Ligging), als de zon erop staat.
    if (echteZon) bundel(opVlak((voorDegVan(model) ?? 180) - 90), [[W / 2, -0.08, zt + R], [W + 0.14, -0.08, zt - 0.08], [W + 0.14, D + 0.08, zt - 0.08], [W / 2, D + 0.08, zt + R]]);
    // Sneeuw op het dak (huis 3.0): een witte laag, ook over de panelen.
    if (model.weer === 'sneeuw') huis.push(poly([[W / 2, -0.08, zt + R + 0.03], [W + 0.14, -0.08, zt - 0.05], [W + 0.14, D + 0.08, zt - 0.05], [W / 2, D + 0.08, zt + R + 0.03]], 'fill="#eef3f8" opacity="0.9"'));
    }
    // De doorsnede: de omtrek van het huis aan de voorkant, als een snijlijn.
    if (dak && nokLangs) {
      // Met de nok langs de straat: de rechthoek van de etages, de nok, en de rand van de puntgevel.
      huis.push(line([[0, D, 0], [0, D, zt], [W, D, zt], [W, D, 0]], `stroke="#C9D6E2" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"`));
      huis.push(line([[W, D, zt], [W, D / 2, zt + R], [W, 0, zt]], `stroke="#C9D6E2" stroke-opacity="0.35" stroke-width="1.4" stroke-linejoin="round"`));
      huis.push(line([[0, D / 2, zt + R], [W, D / 2, zt + R]], `stroke="#C9D6E2" stroke-opacity="0.45" stroke-width="1.4"`));
    } else if (dak) {
      huis.push(line([[0, D, 0], [0, D, zt], [W / 2, D, zt + R], [W, D, zt], [W, D, 0]], `stroke="#C9D6E2" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"`));
      huis.push(line([[W / 2, D, zt + R], [W / 2, 0, zt + R]], `stroke="#C9D6E2" stroke-opacity="0.25" stroke-width="1.2"`));
    } else {
      huis.push(line([[0, D, 0], [0, D, zt], [W, D, zt], [W, D, 0]], `stroke="#C9D6E2" stroke-opacity="0.55" stroke-width="2.2" stroke-linejoin="round"`));
      huis.push(line([[0, D, zt], [0, 0, zt], [W, 0, zt], [W, D, zt]], `stroke="#C9D6E2" stroke-opacity="0.3" stroke-width="1.4" stroke-linejoin="round"`));
    }
    // Schoorsteen of afvoer van de cv, als die er is.
    if (model.cv && dak && !nokLangs) {
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

    if (voordeur) bouwVoordeur(voordeur);

    /* ---- buiten: buitenunit, batterij, laadpaal en auto, het net ---- */
    if (model.buitenunit) bouwBuitenunit(model.buitenunit, W);
    // De garage vóór de batterij: die kan ertegenaan staan (huis 3.0).
    if (model.garage && eiland) bouwGarage(model.garage);
    if (eiland) {
      plek.oprit = [-1.95, D - 0.2, 0.2];
      plek.garage = [-2.0, -1.25, 1.15];
    }
    if (model.batterij || spook(model, 'batterij')) bouwBatterij(model.batterij, spook(model, 'batterij'));
    // Op het eiland (huis 3.0) heeft de tuin een vaste indeling, met het terras erin.
    if (model.tuin && eiland) bouwTuin3(model.tuin);
    else if (model.tuin) bouwTuin(model.tuin);
    if (model.terras && !(model.tuin && eiland)) bouwTerras(model.terras);
    if (model.voortuin) bouwVoortuin(model.voortuin);
    if (model.balkon && g.etages.filter((e) => !e.dak).length >= 2) bouwBalkon(model.balkon);
    else if (model.balkon && appartement) bouwBalkon(model.balkon, 0);
    if (model.auto || spook(model, 'auto')) bouwAuto(model.auto, spook(model, 'auto'), true);
    else if (model.oprit?.auto) bouwAuto({ stand: 'geparkeerd', kleur: model.oprit.auto.kleur }, false, false);
    if (model.oprit?.camera) bouwCamera(model.oprit.camera);
    // Een losse garage achter de oprit, en een carport boven de auto (besluit 166); ook zonder dak (besluit 193).
    if (model.garage && !eiland) bouwGarage(model.garage);
    if (model.oprit?.carport) bouwCarport();
    if (model.net) bouwNet();

    /* ---- stromen ---- */
    const hub = [W + 0.25, D + 0.35, 0.02];
    const voetPaneel = [W + 0.12, D - 0.2, zt - 0.05];
    for (const s of model.stromen ?? []) {
      // Zon goud, terug naar het net groen, van het net violet, uit de batterij blauw (huis 3.0).
      const kleur = s.naar === 'net' ? KLEUR.mint : s.van === 'net' ? KLEUR.violet : s.van === 'batterij' ? KLEUR.ijs : KLEUR.zon;
      const pad = route(s.van, s.naar);
      if (!pad) continue;
      const d = pad.map((p) => pt(P(...p))).join(' ');
      const dik = 1.6 + 2.2 * (s.sterkte ?? 0.5);
      stromen.push(`<polyline points="${d}" fill="none" stroke="${kleur}" stroke-opacity="0.18" stroke-width="${dik + 3}" stroke-linejoin="round" stroke-linecap="round"/>`);
      stromen.push(`<polyline class="sc-stroom" style="animation-duration:${(2.6 - 1.6 * (s.sterkte ?? 0.5)).toFixed(2)}s" points="${d}" fill="none" stroke="${kleur}" stroke-width="${dik}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 11"/>`);
    }
    function route(van, naar) {
      const pts = [];
      const accuY = accuPlek.y + 0.3;
      /** In de wereld (huis 3.0): van de straat onder de grond, in de doorsnede, naar de meterkast. */
      const ondergronds = () => {
        const mkp = voordeur ? plek.meterkast : null;
        const xm = mkp ? mkp[0] : W * 0.3;
        const y = eiland.yF + 0.003;
        const uit = [[netStraat[0], netStraat[1], 0.2], [netStraat[0], y, 0.02], [netStraat[0], y, -0.32], [eiland.nis ? -0.12 : xm, y, -0.32]];
        if (eiland.nis) uit.push([-0.12, y, -0.05], [-0.12, D + 0.3, 0.02], [xm, D + 0.3, 0.02]);
        else uit.push([xm, y, 0.02], [xm, D + 0.1, 0.02]);
        if (mkp) uit.push([mkp[0], mkp[1], 0.02], [mkp[0], mkp[1], 0.2]);
        return uit;
      };
      const kamerPunt = (wie) => {
        const k2 = vindKamer(wie);
        return k2 ? [k2.xm, D + 0.02, k2.z0 + 0.03] : [W * 0.5, D + 0.02, 0.03];
      };
      /*
       * Met een voordeur komt het net via de voortuin het huis in, in de
       * meterkast in de hal, en gaat het van daar naar de woonkamer (de
       * bewoner, 16 oktober). Niet meer om de voortuin heen naar de hoek.
       */
      const mk = voordeur ? plek.meterkast : null;
      const voorlangs = D + 0.14;
      // Liggen de panelen alleen op de garage (huis 3.0), dan komt de zon van daar.
      if (van === 'zon' && model.garage?.panelen && model.zon?.panelen === 0) pts.push([-1.6, -1.25, 1.15], [-1.12, -1.25, 1.15], [-1.12, -1.25, 0.02], [-1.12, D + 0.35, 0.02], hub);
      else if (van === 'zon') pts.push(voetPaneel, [W + 0.12, D + 0.02, zt - 0.05], [W + 0.12, D + 0.02, 0.05], hub);
      else if (van === 'batterij') pts.push([accuPlek.x + 0.18, accuY, 0.4], [accuPlek.x + 0.18, accuY, 0.02], ...(accuPlek.x < 0 ? [[accuPlek.x + 0.18, D + 0.35, 0.02]] : []), hub);
      // In de wereld (huis 3.0) loopt de kabel zichtbaar onder de grond, in de doorsnede.
      else if (van === 'net' && eiland) pts.push(...ondergronds());
      else if (van === 'net' && mk) pts.push([netStraat[0], netStraat[1], 0.02], [netStraat[0], voorlangs, 0.02], [mk[0], voorlangs, 0.02], [mk[0], mk[1], 0.02], [mk[0], mk[1], 0.2]);
      else if (van === 'net') pts.push([netStraat[0], netStraat[1], 0.02], [netStraat[0], D + 0.6, 0.02], [W + 0.25, D + 0.6, 0.02], hub);
      else if (van === 'auto') pts.push([-0.95, D + 0.1, 0.4], [-0.95, D + 0.35, 0.02], hub);
      if (van === 'net' && mk && (naar === 'huis' || naar?.startsWith('kamer:'))) {
        // Van de meterkast door de hal naar de woonkamer, of naar de gevraagde kamer.
        const doel = naar === 'huis'
          ? kamers.find((x) => x.z0 < 0.1 && (x.soort === 'woonkamer' || x.soort === 'woonkeuken'))
          : vindKamer(naar.slice(6));
        const x = doel?.xm ?? W * 0.55;
        pts.push([mk[0] + 0.12, mk[1], 0.03], [x, mk[1], 0.03]);
        if (doel && doel.z0 > 0.1) pts.push([x, D + 0.02, 0.03], [x, D + 0.02, doel.z0 + 0.03]);
        return pts;
      }
      if (naar === 'batterij') pts.push(...(accuPlek.x < 0 ? [[accuPlek.x + 0.18, D + 0.35, 0.02]] : []), [accuPlek.x + 0.18, accuY, 0.02], [accuPlek.x + 0.18, accuY, 0.4]);
      else if (naar === 'auto') pts.push([W + 0.25, D + 0.35, 0.02], [-0.95, D + 0.35, 0.02], [-0.95, D + 0.1, 0.4]);
      // Terug naar het net: dezelfde weg andersom, door het huis naar de meterkast en via de voortuin naar de straat.
      else if (naar === 'net' && eiland) pts.push([W - 0.05, D + 0.3, 0.03], ...ondergronds().reverse());
      else if (naar === 'net' && mk) pts.push([W - 0.05, mk[1], 0.03], [mk[0] + 0.12, mk[1], 0.03], [mk[0], mk[1], 0.02], [mk[0], voorlangs, 0.02], [netStraat[0], voorlangs, 0.02], [netStraat[0], netStraat[1], 0.02]);
      else if (naar === 'net') pts.push([W + 0.25, D + 0.6, 0.02], [netStraat[0], D + 0.6, 0.02], [netStraat[0], netStraat[1], 0.02]);
      else if (naar?.startsWith('kamer:')) {
        const kp = kamerPunt(naar.slice(6));
        pts.push([W + 0.02, D + 0.02, 0.03], [kp[0], D + 0.02, 0.03]);
        if (kp[2] > 0.1) pts.push([kp[0], D + 0.02, kp[2]]);
      } else if (naar === 'huis') pts.push([W + 0.02, D + 0.02, 0.03], [W * 0.55, D + 0.02, 0.03]);
      return pts.length > 1 ? pts : null;
    }

    /* ---- labels: getallen op het huis ---- */
    const anker = {
      // Met de nok langs de straat (schets Wand-Huis-Ligging): voor op het glas, achter bij de nok.
      panelen: nokLangs ? [W * 0.62, D * 0.8, zt + R * 0.38] : [W * 0.76, D * 0.55, zt + R * 0.48],
      // Het andere dakvlak (huis 3.0): voor een label bij panelen aan die kant.
      panelenLinks: nokLangs ? [W * 0.3, D * 0.22, zt + R * 0.62] : [W * 0.24, D * 0.55, zt + R * 0.48],
      batterij: plek.batterij ?? [W + 0.32, D - 0.47, 1.0],
      auto: [-1.95, D - 1.0, 0.86],
      laadpaal: [-0.95, D + 0.1, 0.75],
      net: eiland ? [netStraat[0], netStraat[1], 0.42] : voordeur ? [netStraat[0], netStraat[1], 0.02] : [-0.6, D + 1.25, 0.55],
      buitenunit: [W + 0.15, D - 0.4, 0.4],
      deurbel: plek.deurbel ?? [W / 2, D, 0.7],
      camera: plek.camera ?? [-0.1, D, FH],
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
      // In het licht een wit kaartje met donkere tekst, zoals de rest van de app (besluit 181).
      const tl = licht ? (k) => TEKST_LICHT[k] ?? k : (k) => k;
      labels.push(`<g class="sc-label">
        <polyline points="${a[0]},${a[1]} ${lx},${ly}" fill="none" stroke="${kleur}" stroke-opacity="0.55" stroke-width="1"/>
        <circle cx="${a[0]}" cy="${a[1]}" r="3" fill="${kleur}"/>
        <rect x="${bx}" y="${by}" width="${breedte}" height="${hoogte}" rx="12" fill="${licht ? '#ffffff' : '#0E1828'}" fill-opacity="${licht ? 0.88 : 0.78}" stroke="${kleur}" stroke-opacity="${licht ? 0.6 : 0.35}"/>
        ${regels
          .map((r, i) =>
            i === 0
              ? `<text x="${bx + 12}" y="${by + (l.groot ? 30 : 19)}" fill="${tl(l.groot ? kleur : KLEUR.tekst)}" font-family="Bricolage Grotesque, Figtree, sans-serif" font-weight="600" font-size="${l.groot ? fs : 14}">${esc(r)}</text>`
              : `<text x="${bx + 12}" y="${by + (l.groot ? 30 : 19) + i * 17}" fill="${tl(i === 1 ? kleur : KLEUR.zacht)}" font-family="Figtree, sans-serif" font-size="12.5" font-weight="${i === 1 ? 600 : 500}">${esc(r)}</text>`,
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
      if (st === 'verwarmt') return '#5a3324';
      if (st === 'wacht') return '#4a3d22';
      if (st === 'goed') return '#22443d';
      return nacht ? '#1a2331' : '#2e3b4e';
    }
    function sfeer(kamer, x0, x1, z0, z1) {
      const xm = (x0 + x1) / 2;
      const c = P(xm, 0.1, (z0 + z1) / 2);
      const r = k * (x1 - x0) * 0.55;
      if (kamer.stand === 'koelt') huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${r}" ry="${r * 0.6}" fill="url(#${id}-koel)"/>`);
      if (kamer.stand === 'verwarmt') huis.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${r}" ry="${r * 0.6}" fill="url(#${id}-warm)"/>`);
      // Beweging (15 oktober 2026): twee zachte ringen over de vloer, die uitdijen en
      // vervagen. Midden op de vloer en niet groter dan de kamer (besluit 166): eerst
      // stonden ze halverwege de achtermuur, en onder het dak zo boven de nok uit.
      if (kamer.beweging) {
        const c = P(xm, D * 0.55, z0 + 0.02);
        const rb = Math.min(k * (x1 - x0) * 0.42, k * D * 0.5, k * 0.9);
        const stil = stilGekozen();
        if (stil) huis.push(`<ellipse class="sc-beweging" cx="${c[0]}" cy="${c[1]}" rx="${rb * 0.6}" ry="${rb * 0.36}" fill="none" stroke="${KLEUR.mint}" stroke-width="2" stroke-opacity="0.7"/>`);
        else for (const vertraging of [0, 1.1]) {
          huis.push(`<ellipse class="sc-beweging" cx="${c[0]}" cy="${c[1]}" rx="${rb * 0.2}" ry="${rb * 0.12}" fill="none" stroke="${KLEUR.mint}" stroke-width="2"><animate attributeName="rx" values="${rb * 0.2};${rb}" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/><animate attributeName="ry" values="${rb * 0.12};${rb * 0.6}" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.9;0" dur="2.2s" begin="${vertraging}s" repeatCount="indefinite"/></ellipse>`);
        }
      }
    }
    function tekenKamer(kamer, x0, x1, z0, z1) {
      const xm = (x0 + x1) / 2;
      kamers.push({ id: kamer.id, naam: kamer.naam, soort: soortVanKamer(kamer), xm, x0, x1, z0, z1 });
      tik(kamer, [[x0, D, z0], [x1, D, z0], [x1, D, z1], [x0, D, z1]]);
      // Een lege plek voor een nieuwe kamer, in de bewerkstand: alleen een stippellijn.
      if (kamer.nieuw) {
        huis.push(poly([[x0 + 0.06, 0.06, z0 + 0.01], [x1 - 0.06, 0.06, z0 + 0.01], [x1 - 0.06, D - 0.06, z0 + 0.01], [x0 + 0.06, D - 0.06, z0 + 0.01]], `fill="${KLEUR.ijs}" fill-opacity="0.05" stroke="${KLEUR.ijs}" stroke-opacity="0.7" stroke-width="1.6" stroke-dasharray="6 5"`));
        const t = P(xm, D * 0.5, z0);
        labels.push(`<g><circle cx="${t[0]}" cy="${t[1]}" r="16" fill="#0E1828" stroke="${KLEUR.ijs}" stroke-opacity="0.7"/><path d="M ${t[0] - 7} ${t[1]} h 14 M ${t[0]} ${t[1] - 7} v 14" stroke="${KLEUR.ijs}" stroke-width="2.2" stroke-linecap="round"/><text x="${t[0]}" y="${t[1] + 36}" text-anchor="middle" fill="${KLEUR.ijs}" font-family="Figtree, sans-serif" font-size="13" font-weight="700">${esc(kamer.naam ?? global.t?.('huis.kamerToevoegen') ?? '+')}</text></g>`);
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
        labels.push(`<text x="${t[0]}" y="${t[1]}" text-anchor="middle" fill="${KLEUR.zacht}" font-family="Figtree, sans-serif" font-size="11.5" font-weight="600" opacity="0.85">${esc(zoneNaam(zone))}</text>`);
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
        const kl = { koelt: KLEUR.ijs, verwarmt: KLEUR.gloed, wacht: KLEUR.zon, goed: KLEUR.mint }[kamer.stand] ?? KLEUR.zacht;
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
      const kleur = { koelt: KLEUR.ijs, verwarmt: KLEUR.gloed, wacht: KLEUR.zon, goed: KLEUR.mint }[kamer.stand] ?? KLEUR.zacht;
      const ruimte = (breedte ?? 2) * AX * k - 18;
      const past = (tekst, px) => tekst.length * px * 0.6 <= ruimte;
      const naamPx = past(kamer.naam, 12.5) ? 12.5 : past(kamer.naam, 11.5) ? 11.5 : 10.5;
      // Een lange naam breekt op de laatste spatie, als hij anders niet past.
      const woorden = kamer.naam.split(' ');
      const regels = past(kamer.naam, naamPx) || woorden.length < 2 ? [kamer.naam] : [woorden.slice(0, -1).join(' '), woorden[woorden.length - 1]];
      const tempPx = Math.min(28, k * 0.32, ruimte / 3.2);
      let y = t[1];
      // Het icoon voor de eerste regel van de naam; past het er niet bij, dan valt het weg.
      const sz = Math.round(naamPx * 1.25);
      const regelBreed = Math.max(...regels.map((r) => r.length * naamPx * 0.6));
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
    /** Waar de boiler in zijn kamer staat: achterin, iets rechts van het midden. */
    function boilerX(x0, x1) {
      return Math.max(x0 + 0.5, x1 - 0.95);
    }
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
    /** Waar witgoed staat buiten het dak (besluit 167): tegen de achtermuur, rechts van het raam. */
    function toestelPlek(kamer, x0, x1) {
      const raam = raamVan(kamer, x0, x1);
      return Math.max(raam ? raam[1] + 0.06 : x0 + 0.1, x1 - 0.7 - TOESTEL.b);
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
    /**
     * Waar de airco onder het dak hangt (besluit 166). Tegen de linkermuur als
     * die hoog genoeg is, zoals bij een kamer die bij de nok begint; anders op de
     * achtermuur, net links van de nok, want daar is de muur hoog en blijft hij
     * in beeld. Eerst hing hij altijd links, en bij een kamer tegen de
     * buitenmuur kwam hij zo buiten het dak terecht.
     */
    function aircoOnderDak(x0, x1, z0, plafond) {
      const { b: AB, h: AH } = AIRCO;
      if (plafond(x0 + 0.05) >= z0 + 0.95 + AH + 0.12) return { wand: 'links', ay: 0.4, az: Math.min(z0 + 0.95, plafond(x0) - AH - 0.12) };
      // Rechts schuift de muur van de volgende kamer over de achterwand.
      const lo = x0 + 0.1;
      const hi = x1 - (x1 < W - 0.01 ? 0.7 : 0.12) - AB;
      // Links van de nok: rechts ervan valt de achtermuur achter het rechter dakvlak.
      const ax = hi < lo ? Math.max(x0 + 0.05, (x0 + x1 - AB) / 2) : Math.max(lo, Math.min(hi, W / 2 - 0.7 - AB));
      const ruimte = Math.min(plafond(ax), plafond(ax + AB));
      return { wand: 'achter', ax, az: Math.max(z0 + 0.3, Math.min(z0 + 0.95, ruimte - AH - 0.1)) };
    }
    /**
     * Waar de radiator onder het dak staat (21 oktober 2026): op de achtermuur,
     * zo ver naar links als hij rechtop past, en niet onder een airco op de
     * achtermuur. Eerst stond hij altijd links, en bij een kamer tegen de
     * buitenmuur stak hij zo door het dak. Past hij nergens, dan een kleinere,
     * lage radiator, zoals tegen een knieschot. Zonder dak links, onder het raam.
     */
    function radiatorPlek(x0, x1, z0, plafond) {
      const { b: B, onder, h: H } = RADIATOR;
      if (!plafond) return { x: x0 + 0.25, b: B, h: H };
      const maten = [[B, H], [0.55, 0.3], [0.4, 0.24]];
      const past = (x, b, h) => Math.min(plafond(x), plafond(x + b)) >= z0 + onder + h + 0.06;
      const onderAirco = (x, b, h) => aircoDak?.wand === 'achter' && x < aircoDak.ax + AIRCO.b + 0.05 && x + b > aircoDak.ax - 0.05 && aircoDak.az < z0 + onder + h + 0.05;
      // Rechts schuift de muur van de volgende kamer over de achterwand; als het niet anders kan, toch daar.
      for (const strook of [0.7, 0.1]) {
        for (const [b, h] of maten) {
          const tot = Math.min(x1 - b - 0.1, x1 < W - 0.01 ? x1 - strook - b : x1);
          for (let x = x0 + 0.25; x <= tot + 1e-9; x += 0.05) if (past(x, b, h) && !onderAirco(x, b, h)) return { x, b, h };
        }
      }
      // Nergens rechtop: klein, zo dicht mogelijk bij de nok, waar het dak het hoogst is.
      const [b, h] = maten[maten.length - 1];
      return { x: Math.max(x0 + 0.1, Math.min(x1 - b - 0.1, W / 2 - b - 0.1)), b, h };
    }
    function apparaat(app, x0, x1, z0, z1, onderDak, plafond) {
      const xm = (x0 + x1) / 2;
      /** Met `opts.controle`: waar dit apparaat staat, als blok. */
      const blok = (bx0, bx1, by0, by1, bz0, bz1) => {
        if (opts.controle) controle.push({ kamer: blokKamer, wat: 'apparaat', soort: app.soort, ruimte: [x0, x1], x0: bx0, x1: bx1, y0: by0, y1: by1, z0: bz0, z1: bz1 });
      };
      const hoog = (x) => (plafond ? plafond(x) : z1);
      if (app.soort === 'airco') {
        const kleur = app.stand === 'verwarmt' ? KLEUR.gloed : KLEUR.ijs;
        const KAST = ['#eef3f7', '#dfe7ee', '#b4c0cb'];
        const dakPlek = plafond ? aircoDak ?? aircoOnderDak(x0, x1, z0, plafond) : null;
        if (dakPlek?.wand === 'links') {
          // Onder het dak tegen de linkermuur, hoog: daar is hij altijd te zien,
          // en de droger schuift naar rechts (zie hieronder).
          const { b: AB, h: AH, d: AD } = AIRCO;
          const ay = dakPlek.ay;
          const az = dakPlek.az;
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
          // Op een gewone etage: hoog, naast het raam (besluit 131, zie aircoPlek);
          // onder het dak op de achtermuur bij de nok (besluit 166).
          const { b: AB, h: AH, d: AD } = AIRCO;
          const p = dakPlek ?? aircoPlek(dezeKamer, x0, x1, z1);
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
        const { x: rx, b: rb, h: rh } = radiatorPlek(x0, x1, z0, plafond);
        if (radiatorZij) huis.push(doos(x0 + 0.02, 0.5, z0 + 0.12, 0.08, 0.8, 0.36, [kl[0], kl[2], kl[1]]));
        else huis.push(doos(rx, 0.02, z0 + 0.12, rb, 0.08, rh, kl));
        if (radiatorZij) blok(x0 + 0.02, x0 + 0.1, 0.5, 1.3, z0 + 0.12, z0 + 0.48);
        else blok(rx, rx + rb, 0.02, 0.1, z0 + 0.12, z0 + 0.12 + rh);
        if (opts.controle && plafond && !radiatorZij) controle[controle.length - 1].plafond = Math.min(plafond(rx), plafond(rx + rb));
        if (app.aan) {
          const c = radiatorZij ? P(x0 + 0.4, 0.9, z0 + 0.4) : P(rx + rb / 2, 0.3, z0 + 0.09 + rh);
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
        // Tegen de achtermuur, rechts van het raam: linksboven staat de naam
        // van de kamer, en het midden blijft vrij. Helemaal rechts valt de
        // achterwand achter de muur ernaast, daarom niet in de hoek. Eerst
        // stond hij midden in de kamer, wat in het echt nooit zo is (besluit 167).
        let dx = app.x != null ? x0 + (x1 - x0) * app.x : toestelPlek(dezeKamer, x0, x1);
        const dy = 0.15;
        if (plafond) {
          // Onder het dak: waar hij rechtop past, en zo ver mogelijk van het
          // midden van de kamer, waar de naam en de temperatuur staan.
          const past = (x) => Math.min(hoog(x), hoog(x + TOESTEL.b)) >= z0 + TOESTEL.h + 0.2;
          // Hangt er een airco tegen de linkermuur of op de achtermuur, dan niet daaronder.
          const vanaf = aircoDak?.wand === 'links' ? x0 + 0.55 : x0 + 0.1;
          const onderAirco = (x) => aircoDak?.wand === 'achter' && x < aircoDak.ax + AIRCO.b + 0.08 && x + TOESTEL.b > aircoDak.ax - 0.08;
          // En niet voor de radiator.
          const rx = (dezeKamer?.apparaten ?? []).some((a) => a.soort === 'radiator') ? radiatorPlek(x0, x1, z0, plafond) : null;
          const voorRadiator = (x) => rx != null && x < rx.x + rx.b + 0.05 && x + TOESTEL.b > rx.x - 0.05;
          const plekken = [];
          for (let x = vanaf; x <= x1 - TOESTEL.b - 0.1; x += 0.05) if (past(x) && !onderAirco(x) && !voorRadiator(x)) plekken.push(x);
          plekken.sort((a, b) => Math.abs(b + TOESTEL.b / 2 - xm) - Math.abs(a + TOESTEL.b / 2 - xm));
          dx = plekken[0] ?? Math.max(x0 + 0.1, Math.min(x1 - TOESTEL.b - 0.1, W / 2 - TOESTEL.b / 2));
        }
        const { b: TB, h: TH } = TOESTEL;
        plek[app.soort] = [dx + TB / 2, dy + TB / 2, z0 + TH];
        blok(dx, dx + TB, dy, dy + TB, z0, z0 + TH);
        huis.push(doos(dx, dy, z0, TB, TB, TH, ['#e9eef2', '#d7dee5', '#b9c3cd']));
        if (app.soort !== 'vaatwasser') {
          huis.push(cirkelOpVoorkant(dx + TB / 2, dy + TB + 0.001, z0 + TH * 0.45, TB * 0.3, 'fill="#5e6c7b" stroke="#9aa7b4" stroke-width="1.5"'));
          if (app.aan) {
            const c = P(dx + TB / 2, dy + TB + 0.002, z0 + TH * 0.45);
            huis.push(`<g class="sc-trommel" style="transform-origin:${c[0]}px ${c[1]}px">${cirkelOpVoorkant(dx + TB / 2, dy + TB + 0.002, z0 + TH * 0.45, TB * 0.2, `fill="none" stroke="${KLEUR.zon}" stroke-width="2" stroke-dasharray="4 4"`)}</g>`);
          }
        } else {
          huis.push(poly([[dx + 0.04, dy + TB + 0.001, z0 + TH - 0.08], [dx + TB - 0.04, dy + TB + 0.001, z0 + TH - 0.08], [dx + TB - 0.04, dy + TB + 0.001, z0 + TH - 0.05], [dx + 0.04, dy + TB + 0.001, z0 + TH - 0.05]], 'fill="#8a97a4"'));
        }
        if (app.aan) {
          const c = P(dx + TB / 2, dy + TB / 2, z0 + TH + 0.02);
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
      } else if (app.soort === 'boiler') {
        // Een boiler (besluit 186): een ronde witte tank tegen de achterwand, met een strook die zegt hoe warm hij is.
        // Niet in de hoek rechts: daar staat buiten de buitenunit er net boven (huis 3.0).
        const r0 = 0.15;
        const cx = boilerX(x0, x1);
        const cy = 0.06 + r0;
        const bh = Math.min(0.82, (hoog(cx) - z0) * 0.66);
        plek.boiler = [cx, cy, z0 + bh];
        blok(cx - r0, cx + r0, cy - r0, cy + r0, z0, z0 + bh);
        const rand = (z) => Array.from({ length: 24 }, (_, i) => [cx + Math.cos((i / 24) * 2 * Math.PI) * r0, cy + Math.sin((i / 24) * 2 * Math.PI) * r0, z]);
        const mantel = omhulsel([...rand(z0 + 0.04), ...rand(z0 + bh)].map((q) => P(...q)));
        huis.push(`<path d="M ${mantel.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')} Z" fill="#dfe5eb" stroke="#aeb9c4" stroke-width="0.8"/>`);
        // Licht van links: de rechterhelft iets donkerder.
        const schaduwkant = [...rand(z0 + 0.04).filter(([x]) => x >= cx), ...rand(z0 + bh).filter(([x]) => x >= cx).reverse()];
        huis.push(`<path d="M ${schaduwkant.map((q) => P(...q)).map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')} Z" fill="#b9c4ce" opacity="0.5"/>`);
        huis.push(poly(rand(z0 + bh), 'fill="#f6f8fa" stroke="#c9d2da" stroke-width="0.8"'));
        // Twee leidingen naar het plafond.
        for (const dx of [-0.05, 0.05]) huis.push(line([[cx + dx, cy, z0 + bh], [cx + dx, cy, hoog(cx) - 0.02]], 'stroke="#9aa7b4" stroke-width="1.4"'));
        const pct = Math.max(0.05, Math.min(1, app.vol ?? 0.6));
        const yv = cy + r0 + 0.002;
        huis.push(poly([[cx - 0.035, yv, z0 + 0.14], [cx + 0.035, yv, z0 + 0.14], [cx + 0.035, yv, z0 + bh - 0.1], [cx - 0.035, yv, z0 + bh - 0.1]], 'fill="#9aa7b4"'));
        huis.push(poly([[cx - 0.035, yv + 0.001, z0 + 0.14], [cx + 0.035, yv + 0.001, z0 + 0.14], [cx + 0.035, yv + 0.001, z0 + 0.14 + (bh - 0.24) * pct], [cx - 0.035, yv + 0.001, z0 + 0.14 + (bh - 0.24) * pct]], `fill="${app.aan ? KLEUR.gloed : '#ff9a6b'}" ${app.aan ? 'class="sc-puls"' : ''}`));
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
      // Heeft die open keuken een zone die keuken heet, dan staat de keuken onder
      // die naam en de zithoek onder de andere. Witgoed houdt het midden vrij.
      const zones = (kamer.zones ?? []).length > 1 ? kamer.zones : [null];
      const gekozen = kamer.inrichting ?? (zones.length > 1 ? null : soortVanKamer(kamer));
      const perZone = (soort) => zones.map((zone, i) => [soort(zone), i / zones.length, (i + 1) / zones.length]);
      const woonkeuken = zones.some((zone) => zone && zoneSoort(zone) === 'keuken')
        ? perZone((zone) => (zoneSoort(zone) === 'keuken' ? 'keuken' : 'woonkamer'))
        : [['keuken', 0, zones.length === 2 ? 0.5 : 0.45], ['woonkamer', zones.length === 2 ? 0.5 : 0.45, 1]];
      const delen = gekozen === 'woonkeuken'
        ? woonkeuken
        : gekozen
          ? [[gekozen, 0, 1]]
          : perZone((zone) => (zone && zoneSoort(zone)) ?? soortVan(kamer.naam));
      const soorten = delen.map(([soort]) => (witgoed && soort !== 'leeg' ? 'wasruimte' : MEUBELS_ALS[soort] ?? soort));
      // Heeft het grootste meubel de achterwand nodig, dan hangt de radiator aan de zijmuur.
      const ACHTERWAND = ['keuken', 'badkamer', 'toilet', 'woonkamer', 'slaapkamer', 'kinderkamer', 'logeerkamer', 'werkkamer'];
      radiatorZij = !plafond && ACHTERWAND.includes(soorten[0]) && apps.some((a) => a.soort === 'radiator');
      // Waar op de achterwand niets hoogs mag: [van, tot, vanaf welke hoogte].
      const bezet = [];
      const raam = plafond ? null : raamVan(kamer, x0, x1);
      if (raam) bezet.push([raam[0] - 0.06, raam[1] + 0.06, 0.38, 'raam']);
      if (apps.some((a) => a.soort === 'radiator') && !radiatorZij) {
        const r = radiatorPlek(x0, x1, z0, plafond);
        bezet.push([r.x - 0.05, r.x + r.b + 0.05, 0]);
      }
      if (apps.some((a) => a.soort === 'cv')) bezet.push([x0 + 0.15, x0 + 0.67, 0.45]);
      if (apps.some((a) => a.soort === 'boiler')) bezet.push([boilerX(x0, x1) - 0.22, boilerX(x0, x1) + 0.22, 0]);
      if (!plafond && apps.some((a) => a.soort === 'airco')) {
        const p = aircoPlek(kamer, x0, x1, z1);
        if (p.wand === 'achter') bezet.push([p.ax - 0.05, p.ax + AIRCO.b + 0.05, p.az - 0.02 - z0]);
      }
      // Het witgoed tegen de achtermuur (besluit 167): daar komt geen meubel.
      if (!plafond) for (const a of apps.filter((x) => WITGOED.test(x.soort))) {
        const tx = a.x != null ? x0 + (x1 - x0) * a.x : toestelPlek(kamer, x0, x1);
        bezet.push([tx - 0.05, tx + TOESTEL.b + 0.05, 0]);
      }
      if (plafond && aircoDak) bezet.push(aircoDak.wand === 'links' ? [x0, x0 + 0.5, 0.6] : [aircoDak.ax - 0.05, aircoDak.ax + AIRCO.b + 0.05, aircoDak.az - 0.02 - z0]);
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
      /** Welk deel van de kamer nu ingericht wordt, voor de controle. */
      let deel = null;
      /** Een meubel op (x, y); `maat` is [breed, diep, hoog], voor de controle. */
      const zet = (y, x, svgTekst, maat) => {
        stukken.push({ y, x, svgTekst });
        if (opts.controle && maat) {
          const [w, d, h, vanaf = 0] = maat;
          controle.push({ kamer: kamer.id ?? kamer.naam, wat: 'meubel', deel, x0: x, x1: x + w, y0: y, y1: y + d, z0: z0 + vanaf, z1: z0 + vanaf + h, ruimte: [x0, x1], plafond: z0 + Math.min(hoogte(x), hoogte(x + w)) });
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
      soorten.forEach((soort, i) => {
        deel = soort;
        meubels(soort, x0 + (x1 - x0) * delen[i][1] + (radiatorZij && i === 0 ? 0.12 : 0), x0 + (x1 - x0) * delen[i][2]);
      });
      if (!stukken.length) return;
      // Van achter naar voor, en van links naar rechts: wat dichterbij staat, komt erover.
      stukken.sort((p, q) => p.y - q.y || p.x - q.x);
      huis.push(`<g class="sc-meubels"${donker ? ' opacity="0.4"' : ''}>${stukken.map((s) => s.svgTekst).join('')}</g>`);
    }

    /* ---- buiten ---- */
    /**
     * De buitenunits (rapport 15 oktober): tegen de zijgevel, op pootjes, één
     * per airco, op ware grootte (80 bij 30 bij 55 centimeter).
     */
    function bouwBuitenunit(unit, Wx) {
      const n = Math.max(1, Math.min(3, unit.aantal ?? 1));
      for (let i = 0; i < n; i++) {
        // De eerste op de grond, de volgende op een steun hoger tegen de gevel: zo staan ze niet over elkaar.
        const y0 = D - 0.5;
        const z0 = 0.06 + i * 0.55;
        if (i > 0) buiten.push(line([[Wx, y0 + 0.08, z0 - 0.02], [Wx + 0.21, y0 + 0.08, z0 - 0.02]], 'stroke="#7d8b99" stroke-width="2"'), line([[Wx, y0 + 0.4, z0 - 0.02], [Wx + 0.21, y0 + 0.4, z0 - 0.02]], 'stroke="#7d8b99" stroke-width="2"'));
        buiten.push(doos(Wx + 0.03, y0, z0, 0.18, 0.48, 0.33, ['#dbe3ea', '#c6d0d9', '#aab5c0']));
        const c = P(Wx + 0.211, y0 + 0.22, z0 + 0.16);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.065}" ry="${k * 0.12}" fill="#5c6977"/>`);
        if (unit.aan) buiten.push(`<g class="sc-fan" style="transform-origin:${c[0]}px ${c[1]}px"><line x1="${c[0] - k * 0.05}" y1="${c[1]}" x2="${c[0] + k * 0.05}" y2="${c[1]}" stroke="#cfd8e1" stroke-width="1.6"/><line x1="${c[0]}" y1="${c[1] - k * 0.1}" x2="${c[0]}" y2="${c[1] + k * 0.1}" stroke="#cfd8e1" stroke-width="1.6"/></g>`);
        if (unit.aan && winter) {
          for (let j = 0; j < 2; j++) {
            const q = P(Wx + 0.12, y0 + 0.24, z0 + 0.45 + j * 0.25);
            buiten.push(`<circle class="sc-damp" style="animation-delay:${j}s" cx="${q[0]}" cy="${q[1]}" r="${k * 0.08}" fill="#dfe6ee" opacity="0.2"/>`);
          }
        }
      }
    }
    /** De voordeur in de snijlijn, half open, met de deurbel en de meterkast (zie boven). */
    function bouwVoordeur(v) {
      const h = 1.2;
      const blad = nacht ? '#22303f' : '#3b4b5f';
      // De drempel en de deur, half open naar binnen.
      huis.push(poly([[v.x0 - 0.04, D, 0.002], [v.x1 + 0.04, D, 0.002], [v.x1 + 0.04, D + 0.1, 0.002], [v.x0 - 0.04, D + 0.1, 0.002]], 'fill="#5a6776"'));
      huis.push(poly([[v.x0, D, 0.01], [v.x0, D - 0.36, 0.01], [v.x0, D - 0.36, h], [v.x0, D, h]], `fill="${blad}" stroke="#7d8b99" stroke-width="1"`));
      const kruk = P(v.x0, D - 0.31, h * 0.5);
      huis.push(`<circle cx="${kruk[0]}" cy="${kruk[1]}" r="${(k * 0.025).toFixed(1)}" fill="#c9d3dc"/>`);
      // Het kozijn, licht, zodat de deur in de doorsnede te zien is.
      huis.push(line([[v.x0, D, 0], [v.x0, D, h], [v.x1, D, h], [v.x1, D, 0]], 'stroke="#C9D6E2" stroke-opacity="0.85" stroke-width="2.6" stroke-linejoin="round"'));
      // De meterkast in de hal: tegen de achterwand, met de bliksem.
      // Tegen de zijmuur van de hal, vooraan bij de deur, op ooghoogte (de bewoner, 16 oktober).
      const mx = v.kamer.x0 + 0.01;
      const my = D - 0.62;
      huis.push(doos(mx, my, 0.2, 0.09, 0.3, 0.38, ['#59677a', '#3d495a', '#4a5769']));
      const t = P(mx + 0.091, my + 0.15, 0.36);
      huis.push(`<text x="${t[0]}" y="${t[1] + 4}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="11" font-weight="700" fill="#cfd8e1">⚡</text>`);
      plek.meterkast = [mx + 0.09, my + 0.15, 0.4];
      plek.voordeur = [(v.x0 + v.x1) / 2, D, h];
      // De deurbel naast het kozijn: hij licht op bij beweging, en de ringen gaan als er wordt aangebeld.
      const bel = v.deurbel;
      const bx = v.x1 + 0.1;
      huis.push(doos(bx - 0.04, D - 0.02, 0.62, 0.08, 0.04, 0.16, ['#e5ebf0', '#cfd8e0', '#b3bec9']));
      const lens = P(bx, D + 0.021, 0.73);
      const kleur = bel?.belt ? KLEUR.zon : bel?.beweging ? KLEUR.mint : '#4d7eac';
      huis.push(`<circle cx="${lens[0]}" cy="${lens[1]}" r="${(k * 0.022).toFixed(1)}" fill="${kleur}"/>`);
      plek.deurbel = [bx, D, 0.73];
      if (bel?.belt || bel?.beweging) {
        const stil = stilGekozen();
        const r = k * 0.28;
        if (stil) buiten.push(`<circle cx="${lens[0]}" cy="${lens[1]}" r="${r * 0.6}" fill="none" stroke="${kleur}" stroke-width="2" stroke-opacity="0.7"/>`);
        else for (const vertraging of [0, 0.7]) {
          buiten.push(`<circle cx="${lens[0]}" cy="${lens[1]}" r="${r * 0.2}" fill="none" stroke="${kleur}" stroke-width="2"><animate attributeName="r" values="${r * 0.2};${r}" dur="1.4s" begin="${vertraging}s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.9;0" dur="1.4s" begin="${vertraging}s" repeatCount="indefinite"/></circle>`);
        }
      }
    }
    function bouwBatterij(b, isSpook) {
      // Op het eiland (huis 3.0) naast de garagedeur als er een garage is, anders achteraan
      // tegen de gevel: voorin staan de buitenunit en het terras, en eronder de boiler.
      const { x, y } = accuPlek;
      // Bij de garage staat hij achter het huis: dan eerder getekend.
      const laag = x < 0 ? buitenAchter : buiten;
      plek.batterij = accuPlek.wand ? [x + 0.12, y + 0.23, 0.9] : [x + 0.32, y + 0.28, 1.0];
      if (isSpook) {
        laag.push(`<g opacity="0.7">${poly([[x + 0.3, y, 0], [x + 0.3, y + 0.55, 0], [x + 0.3, y + 0.55, 1.1], [x + 0.3, y, 1.1]], `fill="none" stroke="${KLEUR.mint}" stroke-dasharray="4 4"`)}</g>`);
        return;
      }
      const pct = (b.procent ?? 50) / 100;
      if (accuPlek.wand) {
        // Aan de muur: dun, iets van de grond, met de strook op de kant die je ziet.
        laag.push(doos(x, y, 0.12, 0.12, 0.46, 0.82, ['#e6ecf1', '#cdd6de', '#eef2f5']));
        laag.push(poly([[x + 0.121, y + 0.18, 0.24], [x + 0.121, y + 0.28, 0.24], [x + 0.121, y + 0.28, 0.82], [x + 0.121, y + 0.18, 0.82]], 'fill="#5c6977"'));
        laag.push(poly([[x + 0.122, y + 0.18, 0.24], [x + 0.122, y + 0.28, 0.24], [x + 0.122, y + 0.28, 0.24 + 0.58 * pct], [x + 0.122, y + 0.18, 0.24 + 0.58 * pct]], `fill="${KLEUR.mint}" ${b.stand !== 'rust' ? 'class="sc-puls"' : ''}`));
        return;
      }
      laag.push(doos(x, y, 0, 0.3, 0.55, 1.1, ['#e6ecf1', '#cdd6de', '#eef2f5']));
      // Het niveau als een lichtstrook op de zijkant.
      laag.push(poly([[x + 0.301, y + 0.22, 0.15], [x + 0.301, y + 0.33, 0.15], [x + 0.301, y + 0.33, 0.95], [x + 0.301, y + 0.22, 0.95]], 'fill="#5c6977"'));
      laag.push(poly([[x + 0.302, y + 0.22, 0.15], [x + 0.302, y + 0.33, 0.15], [x + 0.302, y + 0.33, 0.15 + 0.8 * pct], [x + 0.302, y + 0.22, 0.15 + 0.8 * pct]], `fill="${KLEUR.mint}" ${b.stand !== 'rust' ? 'class="sc-puls"' : ''}`));
    }
    /**
     * Een garage achter de oprit, met de deur naar voren; licht achter de deur als er een lamp aan is.
     * Vóór het huis en de auto getekend (huis 3.0): hij staat erachter, en viel er eerst doorheen.
     */
    function bouwGarage(gar) {
      const x0 = -2.9;
      const y0 = -2.0;
      const b = 1.8;
      const d = 1.5;
      const h = 1.1;
      buitenAchter.push(doos(x0, y0, 0, b, d, h, ['#3a4656', '#2f3a48', '#46525f']));
      // Een plat dak dat iets uitsteekt.
      buitenAchter.push(poly([[x0 - 0.05, y0 - 0.05, h], [x0 + b + 0.05, y0 - 0.05, h], [x0 + b + 0.05, y0 + d + 0.08, h], [x0 - 0.05, y0 + d + 0.08, h]], `fill="${model.weer === 'sneeuw' ? '#eef3f8' : '#55626f'}"`));
      buitenAchter.push(poly([[x0 - 0.05, y0 + d + 0.08, h], [x0 + b + 0.05, y0 + d + 0.08, h], [x0 + b + 0.05, y0 + d + 0.08, h + 0.06], [x0 - 0.05, y0 + d + 0.08, h + 0.06]], 'fill="#3d4957"'));
      // De kanteldeur, met lamellen.
      const yd = y0 + d + 0.001;
      buitenAchter.push(poly([[x0 + 0.22, yd, 0.02], [x0 + b - 0.22, yd, 0.02], [x0 + b - 0.22, yd, h - 0.18], [x0 + 0.22, yd, h - 0.18]], `fill="${gar.lampAan ? '#6b5a3c' : '#4f5c6a'}"`));
      for (let z = 0.2; z < h - 0.2; z += 0.18) buitenAchter.push(line([[x0 + 0.22, yd + 0.001, z], [x0 + b - 0.22, yd + 0.001, z]], 'stroke="#3b4652" stroke-width="1"'));
      if (gar.lampAan) {
        const c = P(x0 + b / 2, yd + 0.4, 0.02);
        buitenAchter.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.7}" ry="${k * 0.28}" fill="#FFD39A" opacity="0.22" filter="url(#${id}-zacht)"/>`);
      }
      // Panelen op het platte dak (huis 3.0): schuin op rekken, in rijen.
      if (gar.panelen && model.weer !== 'sneeuw') {
        plaatPanelen(x0 + 0.1, y0 + 0.1, b - 0.2, d - 0.15, h + 0.06, gar.panelen, buitenAchter);
        plek.panelenGarage = [x0 + b / 2, y0 + d / 2, h + 0.3];
      }
    }
    /**
     * Panelen op een plat dak (huis 3.0): rijen schuine panelen op rekken, naar
     * de straat gericht. Hoeveel er liggen, bepaalt het aantal rijen en kolommen.
     */
    function plaatPanelen(x0, y0, b, d, z, aantal, laag = buiten) {
      const n = Math.max(1, Math.min(24, Math.round(aantal)));
      const rijen = Math.max(1, Math.min(4, Math.round(d / 0.42)));
      const kol = Math.ceil(n / rijen);
      const pb = b / kol;
      const pd = d / rijen;
      for (let r = 0; r < rijen; r++) {
        for (let c = 0; c < kol && r * kol + c < n; c++) {
          const px = x0 + c * pb + 0.02;
          const py = y0 + r * pd + 0.04;
          const q = [[px, py, z + 0.16], [px + pb - 0.04, py, z + 0.16], [px + pb - 0.04, py + pd - 0.1, z + 0.02], [px, py + pd - 0.1, z + 0.02]];
          laag.push(poly(q, `fill="url(#${id}-paneel)" stroke="#5b7aa0" stroke-opacity="0.7" stroke-width="0.8"`));
          if (zonKracht > 0) laag.push(poly(q, `fill="url(#${id}-glans)" opacity="0.6"`));
        }
      }
    }
    /**
     * Een jacuzzi (besluit 186): rond, op het terras of in de tuin. Warm is het
     * water lichter en komt er damp vanaf; op zon een gouden rand.
     */
    function bouwJacuzzi(j, xc, yc, r = 0.42, z0 = 0) {
      const h = z0 + 0.34;
      const rand = (z, f = 1) => Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        return [xc + Math.cos(a) * r * f, yc + Math.sin(a) * r * f, z];
      });
      // De wand: de voorste helft van de cilinder.
      const voor = rand(z0).filter(([, y]) => y >= yc - 0.02).sort((p1, p2) => p1[0] - p2[0]);
      const zijde = [...voor, ...[...voor].reverse().map(([x, y]) => [x, y, h])];
      buiten.push(poly(zijde, `fill="${j.kleur ?? '#4a5a6e'}"`));
      buiten.push(poly(rand(h), `fill="#5d6e83" stroke="${j.zon ? KLEUR.zon : '#7a8a9d'}" stroke-opacity="${j.zon ? 0.9 : 0.6}" stroke-width="${j.zon ? 2 : 1}"`));
      const warm = j.stand === 'verwarmt' || (j.temp ?? 0) >= 34;
      buiten.push(poly(rand(h - 0.02, 0.8), `fill="${warm ? '#5fb6e0' : '#3d6f96'}" opacity="0.95"`));
      // Bubbels als hij aan staat.
      if (j.bubbels) for (const [dx, dy] of [[-0.12, 0.05], [0.1, -0.08], [0.02, 0.14], [0.16, 0.1]]) {
        const c = P(xc + dx, yc + dy, h - 0.01);
        buiten.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${(k * 0.025).toFixed(1)}" fill="#e6f6ff" opacity="0.8"/>`);
      }
      if (warm && !stilGekozen()) for (let i = 0; i < 3; i++) {
        const c = P(xc - 0.15 + i * 0.15, yc, h + 0.2 + i * 0.12);
        buiten.push(`<circle class="sc-damp" style="animation-delay:${i * 0.9}s" cx="${c[0]}" cy="${c[1]}" r="${k * (0.08 + i * 0.03)}" fill="#e2ebf3" opacity="0.2"/>`);
      }
      plek.jacuzzi = [xc, yc, h];
    }
    /** Een carport: vier palen en een plat dak boven de oprit. */
    function bouwCarport() {
      const x0 = -2.88;
      const x1 = -1.08;
      const y0 = -0.35;
      const y1 = D + 1.4;
      const h = 1.05;
      // Eerst de palen achter, dan het dak, dan de palen voor: zo staat het in de diepte goed.
      for (const [x, y] of [[x0, y0], [x1, y0]]) buiten.push(doos(x, y, 0, 0.06, 0.06, h, ['#9aa7b4', '#8592a0', '#6f7c8a']));
      buiten.push(poly([[x0 - 0.04, y0 - 0.05, h], [x1 + 0.1, y0 - 0.05, h], [x1 + 0.1, y1 + 0.1, h], [x0 - 0.04, y1 + 0.1, h]], 'fill="#5b6a7a" fill-opacity="0.5" stroke="#9aa7b4" stroke-opacity="0.6" stroke-width="1"'));
      buiten.push(poly([[x0 - 0.04, y1 + 0.1, h], [x1 + 0.1, y1 + 0.1, h], [x1 + 0.1, y1 + 0.1, h + 0.07], [x0 - 0.04, y1 + 0.1, h + 0.07]], 'fill="#4a5868"'));
      for (const [x, y] of [[x0, y1], [x1, y1]]) buiten.push(doos(x, y, 0, 0.06, 0.06, h, ['#9aa7b4', '#8592a0', '#6f7c8a']));
      // Panelen op de carport (huis 3.0).
      const cp = model.oprit?.carport;
      if (cp && typeof cp === 'object' && cp.panelen) {
        plaatPanelen(x0 + 0.05, y0 + 0.1, x1 - x0 + 0.0, y1 - y0 - 0.2, h + 0.07, cp.panelen);
        plek.panelenCarport = [(x0 + x1) / 2, (y0 + y1) / 2, h + 0.3];
      }
    }
    function bouwAuto(a, isSpook, metPaal) {
      // Een laadpaal en een auto op de oprit, links voor het huis.
      const px = -0.95;
      const py = D + 0.1;
      // De laadpaal staat dichter bij je dan de auto: na de auto getekend, anders viel hij erachter (huis 3.0).
      const paal = () => {
        if (metPaal) buiten.push(doos(px - 0.08, py - 0.08, 0, 0.16, 0.16, 0.75, ['#dfe6ec', '#c5cfd8', '#a7b2bd']));
        if (!isSpook && metPaal) buiten.push(poly([[px - 0.081, py - 0.04, 0.5], [px - 0.081, py + 0.04, 0.5], [px - 0.081, py + 0.04, 0.62], [px - 0.081, py - 0.04, 0.62]], `fill="${a?.stand === 'laadt' ? KLEUR.mint : '#66727f'}"`));
      };
      const x0 = -2.45;
      const y0 = D - 1.75;
      const L = 2.1;
      const B = 0.95;
      if (isSpook) {
        buiten.push(`<g opacity="0.65">${poly([[x0, y0, 0.02], [x0 + B, y0, 0.02], [x0 + B, y0 + L, 0.02], [x0, y0 + L, 0.02]], `fill="none" stroke="${KLEUR.ijs}" stroke-dasharray="5 5"`)}</g>`);
        paal();
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
      paal();
      // De kabel naar de laadpaal.
      if (a?.stand === 'laadt') {
        const p1 = P(px - 0.08, py, 0.55);
        const p2 = P(x0 + B, y0 + L - 0.25, 0.45);
        buiten.push(`<path d="M ${p1[0]} ${p1[1]} C ${p1[0] - 10} ${p1[1] + 30}, ${p2[0] + 14} ${p2[1] + 28}, ${p2[0]} ${p2[1]}" fill="none" stroke="#2b3542" stroke-width="3"/>`);
        buiten.push(`<path class="sc-stroom" d="M ${p1[0]} ${p1[1]} C ${p1[0] - 10} ${p1[1] + 30}, ${p2[0] + 14} ${p2[1] + 28}, ${p2[0]} ${p2[1]}" fill="none" stroke="${a.bron === 'net' ? KLEUR.net : KLEUR.zon}" stroke-width="2" stroke-dasharray="1 9" stroke-linecap="round"/>`);
      }
    }
    /**
     * De camera met schijnwerper (rapport 15 oktober): aan de gevel bij de
     * oprit, hoog op de hoek. Staat de schijnwerper aan, dan een bundel warm
     * licht over de oprit; ziet hij beweging, dan een koele bundel en een ring.
     */
    function bouwCamera(cam) {
      // Op een paal naast het huis, tussen de gevel en de oprit (de bewoner, 16 oktober).
      const px = -0.55;
      const y = D + 0.35;
      const z = 1.3;
      buiten.push(doos(px - 0.04, y - 0.04, 0, 0.08, 0.08, z, ['#5a6878', '#4a5868', '#3c4858']));
      buiten.push(doos(px - 0.1, y - 0.08, z, 0.16, 0.16, 0.12, ['#e5ebf0', '#cfd8e0', '#b3bec9']));
      const lens = P(px - 0.02, y + 0.081, z + 0.06);
      buiten.push(`<circle cx="${lens[0]}" cy="${lens[1]}" r="${(k * 0.03).toFixed(1)}" fill="#1b2633"/><circle cx="${lens[0]}" cy="${lens[1]}" r="${(k * 0.012).toFixed(1)}" fill="${cam.beweging ? KLEUR.mint : cam.opname ? '#ff5d5d' : '#4d7eac'}"/>`);
      plek.camera = [px, y, z + 0.06];
      if (cam.aan || cam.beweging) {
        const licht = cam.beweging && !cam.aan ? KLEUR.ijs : '#FFF1C9';
        const bron = P(px - 0.05, y, z);
        const a1 = P(-2.6, D - 1.2, 0.01);
        const a2 = P(-1.3, D + 0.9, 0.01);
        buiten.push(`<polygon points="${bron[0]},${bron[1]} ${a1[0]},${a1[1]} ${a2[0]},${a2[1]}" fill="${licht}" opacity="0.12"/>`);
        const c = P(-1.95, D - 0.2, 0.01);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.9}" ry="${k * 0.4}" fill="${licht}" opacity="0.18" filter="url(#${id}-zacht)"/>`);
        if (cam.beweging) buiten.push(`<ellipse class="sc-beweging" cx="${c[0]}" cy="${c[1]}" rx="${k * 0.5}" ry="${k * 0.22}" fill="none" stroke="${KLEUR.mint}" stroke-width="2" stroke-opacity="0.8"/>`);
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
      // Op het eiland (huis 3.0) staat de haag op de rand van de doorsnede.
      const yh = eiland ? eiland.yF - 0.16 : D + 1.55;
      buiten.push(doos(x0, yh, 0, x1 - x0, 0.14, 0.18, ['#2f5a3c', '#26492f', '#1f3d27']));
      for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.7) {
        const c = P(x, eiland ? D + 0.4 : D + 0.9, 0.02);
        buiten.push(`<circle cx="${c[0]}" cy="${c[1]}" r="${k * 0.06}" fill="${t.lampAan ? '#FFD39A' : '#6e9a6f'}" opacity="0.8"/>`);
      }
    }
    /** Een balkon aan de zijgevel, op de eerste verdieping, met een reling (besluit 113). */
    function bouwBalkon(b, z = FH) {
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
        buiten.push(poly([[x0 - 0.05, y0 + 0.95, 0.88], [x0 + 1.1, y0 + 0.95, 0.88], [x0 + 1.1, y0 + 1.45, 0.82], [x0 - 0.05, y0 + 1.45, 0.82]], `fill="${model.weer === 'sneeuw' ? '#eef3f8' : '#55626f'}"`));
        buiten.push(poly([[x0 + 1.051, y0 + 0.3, 0.05], [x0 + 1.051, y0 + 0.62, 0.05], [x0 + 1.051, y0 + 0.62, 0.62], [x0 + 1.051, y0 + 0.3, 0.62]], `fill="${t.tuinhuisAan ? '#F4C27E' : '#1b2633'}"`));
      }
      // Panelen op het schuurtje (huis 3.0): een plat rek op het dak.
      if (t.tuinhuis !== false && t.tuinhuisPanelen) {
        plaatPanelen(x0 + 0.05, y0 + 0.05, 0.95, 0.85, 0.89, t.tuinhuisPanelen);
        plek.panelenSchuur = [x0 + 0.5, y0 + 0.45, 1.1];
      }
      // De jacuzzi (besluit 186): op het gras voor het schuurtje.
      if (t.jacuzzi) bouwJacuzzi(t.jacuzzi, W + 1.25, -0.25, 0.42, 0);
      if (t.tuinhuis !== false && t.overstekAan) {
        const c = P(x0 + 0.5, y0 + 1.2, 0.02);
        buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.7}" ry="${k * 0.3}" fill="${t.overstekKleur ?? '#FFD39A'}" opacity="0.28" filter="url(#${id}-zacht)"/>`);
      }
      // De border (rapport 15 oktober): lage lampjes langs de rand van het gras, per groep in zijn kleur.
      const rand = (t.lampen ?? []).flatMap((lamp, g2) => Array.from({ length: 4 }, (_, i) => ({ lamp, x: W + 0.42 + (g2 * 4 + i) * 0.42 })));
      for (const { lamp, x: lx } of rand.filter((r) => r.x < W + 2.0)) {
        const ly = 0.18;
        buiten.push(doos(lx - 0.025, ly - 0.025, 0, 0.05, 0.05, 0.16, ['#6b7a8a', '#56636f', '#47525d']));
        const kop = P(lx, ly, 0.18);
        buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${(k * 0.05).toFixed(1)}" fill="${lamp.aan ? lamp.kleur ?? '#FFD39A' : '#3c4755'}"/>`);
        if (lamp.aan) buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${(k * 0.28).toFixed(1)}" fill="${lamp.kleur ?? '#FFD39A'}" opacity="0.4" filter="url(#${id}-zacht)"/>`);
      }
      if (t.zonnescherm) {
        // Het zonnescherm boven het terras, uitgerold naar wat het nu is.
        const uit = Math.max(0.08, t.zonnescherm.dicht ?? 0) * 0.95;
        buiten.push(doos(W + 0.01, 0.08, 1.12, 0.1, 0.9, 0.1, ['#8a97a5', '#7a8795', '#6a7785']));
        if (uit > 0.1) buiten.push(poly([[W + 0.1, 0.1, 1.15], [W + 0.1, 0.96, 1.15], [W + 0.1 + uit, 0.96, 0.85], [W + 0.1 + uit, 0.1, 0.85]], 'fill="#c98a4a" opacity="0.92"'));
      }
    }
    function bouwNet() {
      // In de wereld (huis 3.0): een aansluitkast aan de straat, op de rand.
      if (eiland) {
        buiten.push(doos(netStraat[0] - 0.13, netStraat[1] - 0.09, 0, 0.26, 0.18, 0.42, ['#6b7a8a', '#56636f', '#47525d']));
        const t = P(netStraat[0], netStraat[1] + 0.09, 0.24);
        buiten.push(`<text x="${t[0]}" y="${t[1] + 4}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="10" font-weight="700" fill="#cfd8e1">⚡</text>`);
        return;
      }
      // Met een voordeur zit de aansluiting in de meterkast in de hal (rapport 15 oktober):
      // dan alleen het putje aan de straat. Anders het kastje links voor, zoals eerst.
      if (voordeur) {
        const c = P(netStraat[0], netStraat[1], 0.004);
        buiten.push(`<rect x="${c[0] - k * 0.09}" y="${c[1] - k * 0.05}" width="${k * 0.18}" height="${k * 0.1}" rx="2" fill="#2a3442" stroke="#4a5769"/>`);
        return;
      }
      const x = -0.6;
      const y = D + 1.25;
      buiten.push(doos(x - 0.2, y - 0.15, 0, 0.4, 0.3, 0.55, ['#59677a', '#4a5769', '#3d495a']));
      const t = P(x, y + 0.15, 0.3);
      buiten.push(`<text x="${t[0]}" y="${t[1] + 4}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="11" font-weight="700" fill="#cfd8e1">⚡</text>`);
    }
    /*
     * ---- het eiland (huis 3.0) ----
     * Het perceel zweeft in de lucht. De voorkant is een rechte doorsnede: gras
     * met een rand, dan lagen aarde die naar onder wegvagen. Met een kelder een
     * nis in die doorsnede, precies onder het huis, zodat de kelder open ligt.
     * De achterhoeken zijn rond; een haag langs de achterkant, bomen in de
     * hoeken in het seizoen van nu, en de schaduw van het huis die met de zon
     * meedraait.
     */
    /**
     * De vage lagen (25 oktober 2026): ingezoomd op een verdieping de etage
     * eronder, die naar het eiland wegloopt, en erboven de omtrek van de
     * volgende etage of het dak, die naar boven vervaagt. Vaag genoeg dat de
     * kamers van deze etage het beeld blijven.
     */
    function bouwLagen() {
      const kleur = licht ? '#9fb0c2' : '#41536a';
      const rand = licht ? '#5d6f83' : '#C9D6E2';
      const gid = `${id}-laag`;
      const verloop = (naam, ya, yb, c, o0, o1) =>
        defs.push(`<linearGradient id="${gid}-${naam}" gradientUnits="userSpaceOnUse" x1="0" y1="${ya.toFixed(1)}" x2="0" y2="${yb.toFixed(1)}"><stop offset="0" stop-color="${c}" stop-opacity="${o0}"/><stop offset="1" stop-color="${c}" stop-opacity="${o1}"/></linearGradient>`);
      // Eronder: de gevels van één etage, die naar het gras wegloopt.
      if (lagen.zak && eiland) {
        const z0 = -lagen.zak;
        const [ya, yb] = [P(0, D, 0)[1], P(W, D, z0)[1]];
        verloop('o', ya, yb, kleur, 0.5, 0.06);
        verloop('or', ya, yb, rand, 0.3, 0.02);
        // Na de haag en de bomen achterin, die op het gezakte eiland staan; voor het huis.
        const onder = [];
        onder.push(poly([[W, 0, z0], [W, D, z0], [W, D, 0], [W, 0, 0]], `fill="url(#${gid}-o)" opacity="0.75"`));
        onder.push(poly([[0, D, z0], [W, D, z0], [W, D, 0], [0, D, 0]], `fill="url(#${gid}-o)"`));
        for (const rx of [0.35, W * 0.55]) onder.push(poly([[rx, D + 0.002, z0 + 0.45], [rx + 0.7, D + 0.002, z0 + 0.45], [rx + 0.7, D + 0.002, -0.35], [rx, D + 0.002, -0.35]], `fill="${nacht ? '#F4C27E' : '#8fb1d1'}" opacity="${nacht ? 0.12 : 0.1}"`));
        onder.push(line([[0, D, 0], [0, D, z0]], `stroke="url(#${gid}-or)" stroke-width="1.6"`));
        onder.push(line([[W, 0, 0], [W, 0, z0]], `stroke="url(#${gid}-or)" stroke-width="1.2"`));
        onder.push(line([[W, D, 0], [W, D, z0]], `stroke="url(#${gid}-or)" stroke-width="1.6"`));
        buitenAchter.push(onder.join(''));
      }
      // Erboven: de omtrek van de volgende etage, of het dak als dit de bovenste is.
      const z1 = Ht;
      const top = lagen.dak ? z1 + R : z1 + FH;
      const [ya, yb] = [P(0, D, z1)[1], P(W, 0, lagen.dak ? top : z1 + FH * 0.6)[1]];
      verloop('b', ya, yb, rand, 0.42, lagen.dak ? 0.1 : 0);
      verloop('bv', ya, yb, kleur, 0.45, 0);
      const stijl = `stroke="url(#${gid}-b)" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="6 5"`;
      const voor = [];
      if (lagen.dak) {
        voor.push(poly([[W / 2, 0, top], [W, 0, z1], [W, D, z1], [W / 2, D, top]], `fill="url(#${gid}-bv)"`));
        voor.push(line([[0, D, z1], [W / 2, D, top], [W, D, z1]], stijl));
        voor.push(line([[W / 2, D, top], [W / 2, 0, top], [W, 0, z1]], stijl));
      } else {
        voor.push(poly([[W, 0, z1], [W, D, z1], [W, D, top], [W, 0, top]], `fill="url(#${gid}-bv)"`));
        voor.push(line([[0, D, z1], [0, D, top]], stijl));
        voor.push(line([[0, 0, z1], [0, 0, top]], stijl));
        voor.push(line([[W, D, z1], [W, D, top]], stijl));
        voor.push(line([[W, 0, z1], [W, 0, top]], stijl));
      }
      burenVoor.push(lichter(voor.join('')));
    }

    function bouwEiland() {
      const { x0, x1, y0, yF, nis, T } = eiland;
      const r = 0.5;
      const zNis = -FH - 0.12;
      const boog = (cx, cy, a0, a1) => Array.from({ length: 8 }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / 7;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0];
      });
      const top = [[x0, yF, 0], ...boog(x0 + r, y0 + r, Math.PI, 1.5 * Math.PI), ...boog(x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI), [x1, yF, 0]];
      if (nis) top.push([W, yF, 0], [W, D, 0], [0, D, 0], [0, yF, 0]);
      const sneeuw = model.weer === 'sneeuw';
      const aardeBoven = licht ? '#9a8165' : '#4a3a2b';
      const aardeOnder = licht ? '#7d6650' : '#2a2018';
      defs.push(`
        <linearGradient id="${id}-aarde" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${aardeBoven}"/><stop offset="0.55" stop-color="${aardeOnder}"/><stop offset="1" stop-color="${schaduw(aardeOnder, 0.8)}"/></linearGradient>
        <linearGradient id="${id}-rots" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${schaduw(aardeOnder, 0.75)}"/><stop offset="1" stop-color="${schaduw(aardeOnder, 0.6)}" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}-aarde-zij" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${schaduw(aardeBoven, 0.78)}"/><stop offset="0.55" stop-color="${schaduw(aardeOnder, 0.75)}"/><stop offset="1" stop-color="${schaduw(aardeOnder, 0.6)}"/></linearGradient>
        <radialGradient id="${id}-gloed-onder"><stop offset="0" stop-color="${nacht ? '#3a4f8a' : '#8fb4e0'}" stop-opacity="${nacht ? 0.35 : 0.28}"/><stop offset="1" stop-color="#8fb4e0" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}-eiland">${poly(top, '')}</clipPath>`);
      // Een zachte gloed onder het eiland: het zweeft.
      const onder = P((x0 + x1) / 2, (y0 + yF) / 2, -T - 0.5);
      grond.push(`<ellipse cx="${onder[0]}" cy="${onder[1]}" rx="${(k * (x1 - x0) * 0.6).toFixed(1)}" ry="${(k * 1.0).toFixed(1)}" fill="url(#${id}-gloed-onder)"/>`);
      // De onderkant: rots die naar een punt toe loopt en in de lucht wegvaagt.
      // Facetten van rots, elk iets anders van tint, die naar onder in de lucht vervagen.
      const punt = [(x0 + x1) * 0.42, yF - 0.6, -T - 0.55];
      const facetten = [
        [[[x0, yF, -T], [x0 + 1.4, yF, -T], punt], 0.95],
        [[[x0 + 1.4, yF, -T], [(x0 + x1) * 0.62, yF, -T], punt], 1.1],
        [[[(x0 + x1) * 0.62, yF, -T], [x1, yF, -T], [x1 - 0.8, yF - 1.0, -T - 0.3], punt], 0.85],
        [[[x1, yF, -T], [x1, y0 + r, -T * 0.8], [x1 - 0.8, yF - 1.0, -T - 0.3]], 0.7],
      ];
      for (const [pts, f] of facetten) {
        const fid = `${id}-rots-${Math.round(f * 100)}`;
        defs.push(`<linearGradient id="${fid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${schaduw(aardeOnder, f)}"/><stop offset="0.7" stop-color="${schaduw(aardeOnder, f * 0.8)}" stop-opacity="0.55"/><stop offset="1" stop-color="${schaduw(aardeOnder, f * 0.7)}" stop-opacity="0"/></linearGradient>`);
        grond.push(poly(pts, `fill="url(#${fid})"`));
      }
      // De rechterkant en de voorkant: aarde die naar onder wegvaagt.
      grond.push(poly([[x1, yF, 0], [x1, y0 + r, 0], [x1, y0 + r, -T * 0.8], [x1, yF, -T]], `fill="url(#${id}-aarde-zij)"`));
      const voor = (xa, xb, za, zb) => grond.push(poly([[xa, yF, za], [xb, yF, za], [xb, yF, zb], [xa, yF, zb]], `fill="url(#${id}-aarde)"`));
      if (nis) {
        voor(x0, 0, 0, -T);
        voor(W, x1, 0, -T);
        grond.push(poly([[0, yF, zNis], [W, yF, zNis], [W, yF, -T], [0, yF, -T]], `fill="url(#${id}-aarde)"`));
        // De nis: de linkerwand en de bodem, in het licht van de kelder.
        grond.push(poly([[0, D, 0], [0, yF, 0], [0, yF, zNis], [0, D, zNis]], `fill="${schaduw(aardeBoven, 0.62)}"`));
        grond.push(poly([[0, D, zNis], [W, D, zNis], [W, yF, zNis], [0, yF, zNis]], `fill="${schaduw(aardeBoven, 0.9)}"`));
      } else voor(x0, x1, 0, -T);
      // Lagen in de aarde, en een paar stenen.
      for (const [f, o] of [[0.18, 0.45], [0.42, 0.3], [0.7, 0.18]]) {
        const z = -T * f;
        const golf = (xa, xb) => Array.from({ length: 9 }, (_, i) => [xa + ((xb - xa) * i) / 8, yF + 0.002, z + Math.sin(i * 1.7 + f * 9) * 0.035]);
        const stukken = nis && z > zNis ? [[x0, 0], [W, x1]] : [[x0, x1]];
        for (const [xa, xb] of stukken) grond.push(line(golf(xa, xb), `stroke="${licht ? '#6b5642' : '#5a4634'}" stroke-opacity="${o}" stroke-width="2.4" stroke-linecap="round"`));
        grond.push(line(Array.from({ length: 7 }, (_, i) => [x1 + 0.002, yF - ((yF - y0 - r) * i) / 6, z * 0.95 + Math.sin(i * 2.1 + f * 7) * 0.03]), `stroke="#3d3026" stroke-opacity="${o}" stroke-width="2" stroke-linecap="round"`));
      }
      let zaad = 11;
      const rnd = () => ((zaad = (zaad * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 16; i++) {
        const x = x0 + rnd() * (x1 - x0);
        const z = -0.15 - rnd() * T * 0.6;
        if (nis && x > -0.05 && x < W + 0.05 && z > zNis) continue;
        const c = P(x, yF + 0.003, z);
        grond.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(k * (0.03 + rnd() * 0.05)).toFixed(1)}" ry="${(k * 0.025).toFixed(1)}" fill="${licht ? '#7a6550' : '#5e4a38'}" opacity="0.8"/>`);
      }
      // Het gras erop, met een rand die het licht vangt.
      grond.push(poly(top, `fill="url(#${id}-gras)"`));
      if (sneeuw) grond.push(poly(top, 'fill="#e8eef5" opacity="0.72"'));
      const randKleur = sneeuw ? '#f2f6fa' : licht ? '#9cc4a6' : winter ? '#4a5d6e' : nacht ? '#2a4a3a' : '#3f7a58';
      const rand = (xa, xb) => grond.push(poly([[xa, yF, 0], [xb, yF, 0], [xb, yF, -0.07], [xa, yF, -0.07]], `fill="${randKleur}"`));
      if (nis) {
        rand(x0, 0);
        rand(W, x1);
      } else rand(x0, x1);
      grond.push(poly([[x1, yF, 0], [x1, y0 + r, 0], [x1, y0 + r, -0.07], [x1, yF, -0.07]], `fill="${schaduw(randKleur, 0.8)}"`));
      // Een lijn licht langs de snede, zodat de rand scherp staat.
      grond.push(line([[x0, yF + 0.004, -0.07], [nis ? 0 : x1, yF + 0.004, -0.07]], `stroke="#ffffff" stroke-opacity="${nacht ? 0.06 : 0.14}" stroke-width="1.2"`));
      if (nis) grond.push(line([[W, yF + 0.004, -0.07], [x1, yF + 0.004, -0.07]], `stroke="#ffffff" stroke-opacity="${nacht ? 0.06 : 0.14}" stroke-width="1.2"`));
      // Textuur in het gras: sprietjes en vlekjes; in de zomer bloemen, in de herfst bladeren.
      {
        let z2 = 29;
        const rnd2 = () => ((z2 = (z2 * 16807) % 2147483647) / 2147483647);
        const bloem = model.seizoen === 'herfst' ? ['#e0a04a', '#c97a36', '#b5652e'] : !winter && !sneeuw ? ['#f6d36b', '#f2a7c3', '#ffffff'] : null;
        for (let i = 0; i < 90; i++) {
          const x = x0 + 0.15 + rnd2() * (x1 - x0 - 0.3);
          const y = y0 + 0.3 + rnd2() * (yF - y0 - 0.45);
          if (x > -0.1 && x < W + 0.1 && y > -0.1 && y < D + 0.1) continue;
          if ((model.oprit || model.auto) && x > -2.8 && x < -1.15 && y > -0.45) continue;
          const c = P(x, y, 0.004);
          const kleur = bloem && i % 3 === 0 ? bloem[i % bloem.length] : sneeuw ? '#ffffff' : '#000000';
          const o = bloem && i % 3 === 0 ? 0.75 : sneeuw ? 0.5 : 0.12;
          grond.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(k * (bloem && i % 3 === 0 ? 0.022 : 0.03)).toFixed(1)}" fill="${kleur}" opacity="${o}"/>`);
        }
      }
      // De tuin lichter, de oprit van klinkers.
      if (model.tuin) grond.push(poly([[W + 0.3, y0 + 0.3, 0.003], [x1 - 0.12, y0 + 0.3, 0.003], [x1 - 0.12, yF - 0.12, 0.003], [W + 0.3, yF - 0.12, 0.003]], `fill="${sneeuw ? '#f4f7fa' : licht ? (winter ? '#d3dce5' : '#86b294') : winter ? '#33465a' : nacht ? '#173326' : '#26503a'}"`));
      if (model.auto || model.oprit || spook(model, 'auto')) {
        grond.push(poly([[-2.75, -0.4, 0.005], [-1.2, -0.4, 0.005], [-1.2, yF, 0.005], [-2.75, yF, 0.005]], `fill="${sneeuw ? '#cfd8e1' : licht ? '#b9c2cb' : '#1d2933'}"`));
        grond.push(poly([[-2.75, yF, 0], [-1.2, yF, 0], [-1.2, yF, -0.07], [-2.75, yF, -0.07]], `fill="${licht ? '#8d98a3' : '#2a3542'}"`));
      }
      // Een pad van tegels naar de voordeur, tot aan de rand.
      if (voordeur && !nis) {
        for (let y = D + 0.1; y < yF - 0.15; y += 0.3) grond.push(poly([[voordeur.x0, y, 0.004], [voordeur.x1, y, 0.004], [voordeur.x1, y + 0.22, 0.004], [voordeur.x0, y + 0.22, 0.004]], 'fill="#ffffff" opacity="0.1"'));
      }
      // De schaduw van de echte zon (schets Wand-Huis-Ligging): van de zon af, langer als hij laag staat.
      if (!nacht && echteZon && echteZon.el > 2) {
        const [zx, zy] = opGrond(echteZon.az);
        const lang = Math.min(0.55, 0.22 / Math.tan((Math.max(6, echteZon.el) * Math.PI) / 180));
        const val = (x, y, z) => [x - zx * z * lang, y - zy * z * lang, 0.006];
        const nokPunten = model.dak?.nok === 'langs' ? [[0, D / 2, Ht + R], [W, D / 2, Ht + R]] : [[W / 2, 0, Ht + R], [W / 2, D, Ht + R]];
        const hoeken = [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0], [0, 0, Ht], [W, 0, Ht], [W, D, Ht], [0, D, Ht], ...nokPunten].map(([x, y, z]) => val(x, y, z));
        const sterkte = (0.22 + 0.3 * zonKracht) * (1 - 0.5 * (model.wolken ?? 0));
        grond.push(`<g clip-path="url(#${id}-eiland)"><g filter="url(#${id}-zacht)" opacity="${sterkte.toFixed(2)}">${poly(omhulsel(hoeken), `fill="${licht ? '#2c3a48' : '#02050a'}"`)}</g></g>`);
      } else if (!nacht && model.zon?.stand != null) {
        const f = Math.max(0, Math.min(1, model.zon.stand));
        const hoog = Math.max(0.3, Math.sin(Math.PI * f));
        // Van de zon af: komt hij rechts op, dan valt de schaduw 's ochtends naar links.
        const dx = -opkomst * Math.cos(Math.PI * f) * 0.75 * (1.25 - hoog);
        const dy = 0.28 * (1.3 - hoog);
        const val = (x, y, z) => [x + dx * z, y + dy * z, 0.006];
        const hoeken = [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0], [0, 0, Ht], [W, 0, Ht], [W, D, Ht], [0, D, Ht], [W / 2, 0, Ht + R], [W / 2, D, Ht + R]].map(([x, y, z]) => val(x, y, z));
        const sterkte = (0.22 + 0.3 * zonKracht) * (1 - 0.5 * (model.wolken ?? 0));
        grond.push(`<g clip-path="url(#${id}-eiland)"><g filter="url(#${id}-zacht)" opacity="${sterkte.toFixed(2)}">${poly(omhulsel(hoeken), `fill="${licht ? '#2c3a48' : '#02050a'}"`)}</g></g>`);
      }
      // Een haag langs de achterkant.
      const haag = sneeuw ? ['#eef3f8', '#d6dee7', '#c3ccd6'] : winter ? ['#3d5262', '#33465a', '#2a3a4c'] : ['#3d7a55', '#2f6446', '#27553b'];
      // Niet onder een opgetilde etage (de vage lagen): daar schijnt hij als een groene band door de etage eronder.
      if (!lagen?.zak) buitenAchter.push(doos(x0 + r, y0 + 0.08, 0, x1 - x0 - 2 * r, 0.16, 0.22, haag));
      // Bomen in de achterhoeken, en een kleine voorin rechts als er plek is.
      boom(x0 + 0.42, y0 + 0.45, 1.15, buitenAchter);
      boom(x1 - 0.45, y0 + 0.42, 1.3, buitenAchter);
      if (!model.terras && !model.tuin) boom(x1 - 0.35, yF - 0.4, 0.85, buiten);
      // Een lantaarn aan de straat.
      lantaarn(x0 + 0.22, yF - 0.18);
      // Een kompas op het gras voor het huis (huis 3.0), als het model de ligging kent.
      if (model.kompas) {
        // Groot op de oprit als er geen auto staat (zoals bij Zonnepanelen), anders klein voor het huis.
        const groot = model.kompas.groot && !model.auto && !model.oprit?.auto;
        kompas(model.kompas.voorgevelDeg ?? 180, groot ? -2.05 : -0.62, yF - (groot ? 1.05 : 0.42), groot ? 1.0 : 0.34);
      }
    }
    /**
     * Een kompas op de grond (huis 3.0): een ring met de vier windrichtingen,
     * gedraaid naar hoe het huis echt ligt. De voorgevel kijkt naar
     * `voorgevelDeg` (0 is noord); +x in de tekening ligt dan op voorgevel - 90.
     */
    function kompas(v, cx, cy, r0 = 0.34) {
      const rad = (a) => (a * Math.PI) / 180;
      const richting = (a, r) => [cx - Math.sin(rad(a - v)) * r, cy + Math.cos(rad(a - v)) * r, 0.006];
      const cirkel = (r) => Array.from({ length: 48 }, (_, i) => richting(i * 7.5, r));
      // Een plaat op de grond met een rand, streepjes per 30° en een naald: noord in de gloedkleur.
      grond.push(poly(cirkel(r0), `fill="${nacht ? '#0b1422' : '#132233'}" fill-opacity="0.8" stroke="#E6EEF5" stroke-opacity="0.75" stroke-width="1.6"`));
      grond.push(poly(cirkel(r0 * 0.72), 'fill="none" stroke="#E6EEF5" stroke-opacity="0.22" stroke-width="1"'));
      for (let a = 0; a < 360; a += 30) {
        const [p1, p2] = [P(...richting(a, r0 * (a % 90 ? 0.86 : 0.78))), P(...richting(a, r0 * 0.97))];
        grond.push(`<path d="M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" stroke="#E6EEF5" stroke-opacity="${a % 90 ? 0.35 : 0.8}" stroke-width="${a % 90 ? 1 : 1.6}"/>`);
      }
      grond.push(poly([richting(0, r0 * 0.7), richting(90, r0 * 0.13), richting(270, r0 * 0.13)], `fill="${KLEUR.gloed}"`));
      grond.push(poly([richting(180, r0 * 0.7), richting(90, r0 * 0.13), richting(270, r0 * 0.13)], 'fill="#E6EEF5" opacity="0.75"'));
      const midden = P(cx, cy, 0.006);
      grond.push(`<circle cx="${midden[0].toFixed(1)}" cy="${midden[1].toFixed(1)}" r="${(k * r0 * 0.07).toFixed(1)}" fill="#E6EEF5"/>`);
      const maat = r0 > 0.4 ? 18 : 12;
      for (const [a, letter] of [[0, global.t?.('huis.kompas.n') ?? 'N'], [90, global.t?.('huis.kompas.o') ?? 'O'], [180, global.t?.('huis.kompas.z') ?? 'Z'], [270, global.t?.('huis.kompas.w') ?? 'W']]) {
        const t = P(...richting(a, r0 + (r0 > 0.4 ? 0.34 : 0.2)));
        // Een donkere rand om de letter, zodat hij op gras en klinkers leesbaar blijft.
        labels.push(`<text x="${t[0].toFixed(1)}" y="${(t[1] + maat * 0.36).toFixed(1)}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="${maat}" font-weight="800" fill="${a === 0 ? KLEUR.gloed : '#F2F6FA'}" stroke="#0a1220" stroke-opacity="0.85" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${letter}</text>`);
      }
    }
    /** Het omhulsel van punten op de grond (Andrew's monotone keten), voor een schaduw. */
    function omhulsel(pts) {
      const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const kruis = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const keten = (lijst) => {
        const uit = [];
        for (const q of lijst) {
          while (uit.length >= 2 && kruis(uit[uit.length - 2], uit[uit.length - 1], q) <= 0) uit.pop();
          uit.push(q);
        }
        return uit.slice(0, -1);
      };
      return [...keten(p), ...keten([...p].reverse())];
    }
    /** Een boom: een stam en een kroon van drie bollen, in het seizoen van nu (huis 3.0). */
    function boom(x, y, s, laag) {
      const herfst = model.seizoen === 'herfst';
      const sneeuw = model.weer === 'sneeuw';
      const stam = P(x, y, 0);
      const top = P(x, y, 0.62 * s);
      laag.push(`<g filter="url(#${id}-zacht)" opacity="0.35"><ellipse cx="${stam[0]}" cy="${stam[1]}" rx="${(k * 0.36 * s).toFixed(1)}" ry="${(k * 0.14 * s).toFixed(1)}" fill="#02050a"/></g>`);
      laag.push(`<path d="M ${stam[0]} ${stam[1]} L ${top[0]} ${top[1]}" stroke="#4a3a2c" stroke-width="${(k * 0.07 * s).toFixed(1)}" stroke-linecap="round"/>`);
      if (winter && !sneeuw) {
        // Kaal in de winter: alleen takken.
        for (const [dx, dz] of [[-0.18, 0.9], [0.2, 0.95], [0.02, 1.05]]) {
          const t = P(x + dx * s, y, dz * s);
          laag.push(`<path d="M ${top[0]} ${top[1]} L ${t[0]} ${t[1]}" stroke="#5a4838" stroke-width="${(k * 0.03 * s).toFixed(1)}" stroke-linecap="round"/>`);
        }
        return;
      }
      const kleuren = herfst ? ['#e0a04a', '#c97a36', '#9b5a2a'] : nacht ? ['#2f5a45', '#244a39', '#1b3a2c'] : ['#6fbf8a', '#4e9a6c', '#3a7a55'];
      const gid = `${id}-boom-${herfst ? 'h' : nacht ? 'n' : 'z'}`;
      if (!defs.some((d) => d.includes(`id="${gid}"`))) defs.push(`<radialGradient id="${gid}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="${kleuren[0]}"/><stop offset="0.6" stop-color="${kleuren[1]}"/><stop offset="1" stop-color="${kleuren[2]}"/></radialGradient>`);
      for (const [dx, dz, rr] of [[-0.17, 0.82, 0.3], [0.17, 0.86, 0.28], [0, 1.08, 0.33]]) {
        const c = P(x + dx * s, y, dz * s);
        laag.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(k * rr * s).toFixed(1)}" fill="url(#${gid})"/>`);
        if (sneeuw) laag.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${(c[1] - k * rr * s * 0.55).toFixed(1)}" rx="${(k * rr * s * 0.75).toFixed(1)}" ry="${(k * rr * s * 0.32).toFixed(1)}" fill="#f4f7fa"/>`);
      }
    }
    /** Een lantaarn aan de straat; 's avonds en 's nachts brandt hij, met een plas licht (huis 3.0). */
    function lantaarn(x, y) {
      const aan = nacht || schemer;
      buiten.push(doos(x - 0.025, y - 0.025, 0, 0.05, 0.05, 1.05, ['#6b7a8a', '#56636f', '#47525d']));
      buiten.push(doos(x - 0.08, y - 0.08, 1.05, 0.16, 0.16, 0.12, [aan ? '#ffe2a8' : '#8a97a5', aan ? '#f4c27e' : '#6b7885', aan ? '#d9a865' : '#5d6976']));
      if (aan) {
        const kop = P(x, y, 1.1);
        const voet = P(x + 0.15, y + 0.1, 0);
        buiten.push(`<ellipse cx="${voet[0]}" cy="${voet[1]}" rx="${(k * 0.75).toFixed(1)}" ry="${(k * 0.3).toFixed(1)}" fill="#FFD39A" opacity="0.22" filter="url(#${id}-zacht)"/>`);
        buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${(k * 0.35).toFixed(1)}" fill="#FFD39A" opacity="0.35" filter="url(#${id}-zacht)"/>`);
      }
    }
    /*
     * ---- de tuin op het eiland (huis 3.0) ----
     * Elk ding een vaste plek, zodat alles tegelijk kan zonder op elkaar te
     * staan: achterin het tuinhuis, in het midden de jacuzzi op een vlonder,
     * voorin het terras tegen de gevel, ertussen een pad van stapstenen met
     * eigen tuinlampjes, en langs de buitenrand een border met planten. Wat er
     * niet is, laat zijn plek gewoon gras.
     */
    function bouwTuin3(t) {
      const gx1 = eiland.x1 - 0.12;
      const gy0 = eiland.y0 + 0.3;
      const gy1 = eiland.yF - 0.12;
      const sneeuw = model.weer === 'sneeuw';
      const herfst = model.seizoen === 'herfst';
      const padX = W + 1.78;
      const dingen = [];
      // De border: een strook aarde langs de buitenrand, met struiken en bloemen.
      const bx0 = gx1 - 0.34;
      grond.push(poly([[bx0, gy0 + 0.95, 0.004], [gx1, gy0 + 0.95, 0.004], [gx1, gy1 - 0.08, 0.004], [bx0, gy1 - 0.08, 0.004]], `fill="${sneeuw ? '#dfe6ee' : licht ? '#8a7560' : '#3a2e24'}"`));
      grond.push(line([[bx0, gy0 + 0.95, 0.006], [bx0, gy1 - 0.08, 0.006]], `stroke="${sneeuw ? '#c9d3dd' : '#5a4634'}" stroke-width="1.5"`));
      const bloemen = herfst ? ['#e0a04a', '#c9543a', '#e8c25a'] : winter || sneeuw ? null : ['#f2a7c3', '#f6d36b', '#b7a0f2', '#ffffff'];
      /*
       * De tuin in zones (28 oktober 2026, schets Wand-Huis-Ligging): elke zone een
       * vaste plek, voor een label en om op te tikken. De lampen van de border
       * staan in de border, elk in de kleur van zijn lamp.
       */
      const gazon = { x0: W + 0.35, y0: gy0 + 1.0, x1: bx0 - 0.08, y1: 0.22 };
      plek.border = [bx0 + 0.17, (gy0 + 0.95 + gy1) / 2, 0.25];
      plek.gazon = [(gazon.x0 + gazon.x1) / 2 - 0.25, (gazon.y0 + gazon.y1) / 2, 0.05];
      const borderLampen = t.borderLampen ?? [];
      /*
       * Brandt een lamp van de border, dan kleurt zijn stuk border mee: een gloed
       * over de aarde en over de planten (28 oktober 2026). Eén lamp in Home
       * Assistant is vaak een groep wandlampen; die verlicht de hele border.
       */
      const by0 = gy0 + 0.95;
      const by1 = gy1 - 0.08;
      borderLampen.slice(0, 6).forEach((l, i, alle) => {
        if (!l.aan) return;
        const kleur = l.kleur ?? '#FFD39A';
        const y0 = by0 + ((by1 - by0) * i) / alle.length;
        const y1 = by0 + ((by1 - by0) * (i + 1)) / alle.length;
        grond.push(`<g filter="url(#${id}-zacht)" opacity="0.5">${poly([[bx0 - 0.04, y0, 0.005], [gx1 - 0.06, y0, 0.005], [gx1 - 0.06, y1, 0.005], [bx0 - 0.04, y1, 0.005]], `style="fill: ${kleur}" fill-opacity="0.35"`)}</g>`);
        for (let y = y0 + 0.2; y < y1 - 0.05; y += 0.38) {
          dingen.push([y + 0.2, () => {
            const c = P(bx0 + 0.17, y, 0.16);
            buiten.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(k * 0.26).toFixed(1)}" ry="${(k * 0.18).toFixed(1)}" style="fill: ${kleur}" opacity="0.22" filter="url(#${id}-zacht)"/>`);
          }]);
        }
      });
      borderLampen.slice(0, 6).forEach((l, i, alle) => {
        const y = gy0 + 1.25 + ((gy1 - 0.35 - (gy0 + 1.25)) * (i + 0.5)) / alle.length;
        const x = bx0 + 0.1 + (i % 2) * 0.14;
        dingen.push([y + 0.01, () => {
          buiten.push(doos(x - 0.02, y - 0.02, 0, 0.04, 0.04, 0.16, ['#56636f', '#47525d', '#3b4651']));
          const kop = P(x, y, 0.18);
          buiten.push(`<circle cx="${kop[0].toFixed(1)}" cy="${kop[1].toFixed(1)}" r="${(k * 0.065).toFixed(1)}" fill="${l.aan ? l.kleur ?? '#FFD39A' : '#3c4755'}"/>`);
          if (l.aan) {
            const voet = P(x, y, 0.01);
            buiten.push(`<ellipse cx="${voet[0].toFixed(1)}" cy="${voet[1].toFixed(1)}" rx="${(k * 0.4).toFixed(1)}" ry="${(k * 0.18).toFixed(1)}" fill="${l.kleur ?? '#FFD39A'}" opacity="0.4" filter="url(#${id}-zacht)"/>`);
            buiten.push(`<circle cx="${kop[0].toFixed(1)}" cy="${kop[1].toFixed(1)}" r="${(k * 0.12).toFixed(1)}" fill="${l.kleur ?? '#FFD39A'}" opacity="0.3" filter="url(#${id}-zacht)"/>`);
          }
        }]);
      });
      let z3 = 7;
      const rnd3 = () => ((z3 = (z3 * 16807) % 2147483647) / 2147483647);
      for (let y = gy0 + 1.1; y < gy1 - 0.15; y += 0.3) {
        const x = bx0 + 0.17 + (rnd3() - 0.5) * 0.08;
        const s = 0.8 + rnd3() * 0.45;
        dingen.push([y, () => struik(x, y, s, bloemen, sneeuw)]);
      }
      // Het terras tegen de gevel, voorin.
      // Niet tegen de gevel: daar staat de buitenunit.
      const ter = { x0: W + 0.5, x1: W + 1.5, y0: 0.35, y1: gy1 - 0.05 };
      plek.terras = [(ter.x0 + ter.x1) / 2, (ter.y0 + ter.y1) / 2, 0.45];
      if (model.terras || t.terras !== false) {
        grond.push(poly([[ter.x0, ter.y0, 0.006], [ter.x1, ter.y0, 0.006], [ter.x1, ter.y1, 0.006], [ter.x0, ter.y1, 0.006]], `fill="${sneeuw ? '#e6ecf2' : licht ? '#c3cad2' : '#3b4652'}"`));
        for (let x = ter.x0 + 0.3; x < ter.x1 - 0.05; x += 0.3) grond.push(line([[x, ter.y0, 0.008], [x, ter.y1, 0.008]], 'stroke="#2c353f" stroke-width="1"'));
        for (let y = ter.y0 + 0.3; y < ter.y1 - 0.05; y += 0.3) grond.push(line([[ter.x0, y, 0.008], [ter.x1, y, 0.008]], 'stroke="#2c353f" stroke-width="1"'));
        const tx = (ter.x0 + ter.x1) / 2 - 0.22;
        const ty = (ter.y0 + ter.y1) / 2 - 0.15;
        dingen.push([ty, () => {
          for (const sx of [tx - 0.3, tx + 0.52]) buiten.push(doos(sx, ty + 0.07, 0, 0.2, 0.22, 0.24, ['#55626f', '#46525f', '#3a4552']));
          buiten.push(doos(tx + 0.19, ty + 0.15, 0, 0.06, 0.06, 0.38, ['#7d8a97', '#6b7885', '#5d6976']));
          buiten.push(doos(tx, ty, 0.38, 0.44, 0.36, 0.05, ['#c9d3dc', '#9aa7b4', '#7d8a97']));
          if (model.terras?.lampAan || t.terrasAan) {
            const c = P(tx + 0.22, ty + 0.18, 0.43);
            buiten.push(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${k * 0.55}" ry="${k * 0.25}" fill="#FFD39A" opacity="0.25" filter="url(#${id}-zacht)"/>`);
          }
        }]);
      }
      // Het pad van stapstenen, van het terras naar het tuinhuis, met tuinlampjes ernaast.
      for (let y = 0.2; y > gy0 + 0.95; y -= 0.32) {
        const st = [[padX - 0.13, y - 0.1, 0.007], [padX + 0.13, y - 0.1, 0.007], [padX + 0.13, y + 0.1, 0.007], [padX - 0.13, y + 0.1, 0.007]];
        grond.push(poly(st, `fill="${sneeuw ? '#ffffff' : '#9aa7b4'}" opacity="${sneeuw ? 0.9 : 0.55}"`));
      }
      const padAan = (t.lampen ?? []).some((l) => l.aan) || t.padAan;
      const padKleur = (t.lampen ?? []).find((l) => l.aan)?.kleur ?? '#FFD39A';
      for (let y = 0.05, i = 0; y > gy0 + 1.0; y -= 0.55, i++) {
        const lx = padX + (i % 2 === 0 ? 0.24 : -0.24);
        dingen.push([y, () => {
          buiten.push(doos(lx - 0.03, y - 0.03, 0, 0.06, 0.06, 0.2, ['#6b7a8a', '#56636f', '#47525d']));
          const kop = P(lx, y, 0.22);
          buiten.push(`<circle cx="${kop[0]}" cy="${kop[1]}" r="${(k * 0.045).toFixed(1)}" fill="${padAan ? padKleur : '#3c4755'}"/>`);
          if (padAan) {
            const voet = P(lx, y, 0.01);
            buiten.push(`<ellipse cx="${voet[0]}" cy="${voet[1]}" rx="${(k * 0.3).toFixed(1)}" ry="${(k * 0.13).toFixed(1)}" fill="${padKleur}" opacity="0.35" filter="url(#${id}-zacht)"/>`);
          }
        }]);
      }
      // De jacuzzi op een vlonder, in het midden.
      if (t.jacuzzi) {
        const vx0 = W + 0.45;
        const vx1 = W + 1.45;
        const vy0 = -1.3;
        const vy1 = -0.25;
        dingen.push([vy0, () => {
          buiten.push(doos(vx0, vy0, 0, vx1 - vx0, vy1 - vy0, 0.06, [sneeuw ? '#eef3f8' : '#a07a54', '#7d5c3e', '#6b4e35']));
          if (!sneeuw) for (let x = vx0 + 0.1; x < vx1 - 0.02; x += 0.1) buiten.push(line([[x, vy0, 0.061], [x, vy1, 0.061]], 'stroke="#7d5c3e" stroke-width="0.8" stroke-opacity="0.7"'));
          bouwJacuzzi(t.jacuzzi, (vx0 + vx1) / 2, (vy0 + vy1) / 2, 0.38, 0.06);
        }]);
      }
      // Het tuinhuis achterin, met de deur naar het pad.
      // Een schuurtje met puntdak, of een tuinhuis met plat dak en overstek (24 oktober 2026).
      if (t.tuinhuis !== false) dingen.push([gy0, () => (t.tuinhuisSoort === 'schuur' ? tuinhuis3(padX - 0.5, gy0 + 0.02, t) : tuinhuisPlat(padX - 0.55, gy0 + 0.02, t))]);
      dingen.sort((a, b) => a[0] - b[0]).forEach(([, teken]) => teken());
      // De gekozen zone (`zone`) licht op (schets Wand-Huis-Ligging): na een tik, met zijn kaartje ernaast.
      tuinVakken = { border: { x0: bx0 - 0.04, y0: gy0 + 0.9, x1: gx1 + 0.02, y1: gy1 - 0.04 }, terras: ter, gazon, tuinhuis: tuinhuisVak, overstek: tuinhuisVak };
      const vak = tuinVakken[t.zone];
      if (vak) markeer(vak);
    }
    /** Een plek op de grond die oplicht: een rand in ijsblauw met een gloed (schets Wand-Huis-Ligging). */
    function markeer(v) {
      const rand = [[v.x0, v.y0, 0.012], [v.x1, v.y0, 0.012], [v.x1, v.y1, 0.012], [v.x0, v.y1, 0.012]];
      grond.push(`<g filter="url(#${id}-zacht)" opacity="0.7">${poly(rand, `fill="none" stroke="${KLEUR.ijs}" stroke-width="5"`)}</g>`);
      grond.push(poly(rand, `fill="${KLEUR.ijs}" fill-opacity="0.12" stroke="${KLEUR.ijs}" stroke-width="2" stroke-linejoin="round"`));
    }
    /** Een struik in de border: twee bollen, met bloemen of bladeren in het seizoen (huis 3.0). */
    function struik(x, y, s, bloemen, sneeuw) {
      const gid = `${id}-struik`;
      if (!defs.some((d) => d.includes(`id="${gid}"`))) defs.push(`<radialGradient id="${gid}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${nacht ? '#2f5a45' : winter ? '#4a5d55' : '#5fae7a'}"/><stop offset="1" stop-color="${nacht ? '#1b3a2c' : winter ? '#2f3d38' : '#2f6446'}"/></radialGradient>`);
      for (const [dx, dz, r] of [[-0.05, 0.1, 0.11], [0.05, 0.14, 0.09]]) {
        const c = P(x + dx * s, y, dz * s);
        buiten.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(k * r * s).toFixed(1)}" fill="url(#${gid})"/>`);
        if (sneeuw) buiten.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${(c[1] - k * r * s * 0.5).toFixed(1)}" rx="${(k * r * s * 0.7).toFixed(1)}" ry="${(k * r * s * 0.3).toFixed(1)}" fill="#f4f7fa"/>`);
      }
      if (bloemen) {
        for (let i = 0; i < 3; i++) {
          const c = P(x + (i - 1) * 0.06 * s, y + 0.02, (0.16 + (i % 2) * 0.06) * s);
          buiten.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(k * 0.022).toFixed(1)}" fill="${bloemen[(Math.round(y * 10) + i) % bloemen.length]}"/>`);
        }
      }
    }
    /**
     * Het tuinhuis (huis 3.0): houten planken, een puntdak met overstek, een
     * deur met een raampje naar het pad, een raam aan de zijkant met een
     * bloembak, en een lamp boven de deur. Panelen op het dakvlak, als die er
     * liggen.
     */
    /**
     * Het tuinhuis (24 oktober 2026): een strakke doos met een plat dak dat aan
     * de voorkant uitsteekt als overstek, op twee palen, met een vlonder eronder,
     * een glazen pui en een lamp onder het overstek. Panelen liggen op rekken op
     * het dak. Het houten huisje met puntdak is het schuurtje (`tuinhuisSoort: 'schuur'`).
     */
    function tuinhuisPlat(tx, ty, t) {
      const b = 1.08;
      const d = 0.72;
      const h = 0.8;
      const dik = 0.07;
      const over = 0.34;
      const sneeuw = model.weer === 'sneeuw';
      const aan = t.tuinhuisAan;
      const lampAan = t.overstekAan || aan;
      const gevel = licht ? ['#e9e3d8', '#d8d0c2', '#c4baa9'] : ['#3c4654', '#323b47', '#2a323c'];
      const latten = licht ? '#bfb4a2' : '#262e38';
      buiten.push(`<g filter="url(#${id}-zacht)" opacity="0.35">${poly([[tx - 0.06, ty, 0], [tx + b + 0.3, ty, 0], [tx + b + 0.3, ty + d + over + 0.2, 0], [tx - 0.06, ty + d + over + 0.2, 0]], 'fill="#02050a"')}</g>`);
      // De vlonder onder het overstek.
      buiten.push(doos(tx - 0.02, ty + d, 0, b + 0.04, over, 0.04, ['#8a6a4a', '#74583d', '#5e4732']));
      for (let x = tx + 0.08; x < tx + b; x += 0.1) buiten.push(line([[x, ty + d + 0.01, 0.041], [x, ty + d + over - 0.01, 0.041]], 'stroke="#5e4732" stroke-width="0.8" stroke-opacity="0.8"'));
      // Het huis zelf: donker (of licht) met liggende latten.
      buiten.push(doos(tx, ty, 0, b, d, h, gevel));
      for (let z = 0.1; z < h - 0.02; z += 0.075) {
        buiten.push(line([[tx + 0.01, ty + d + 0.001, z], [tx + b - 0.01, ty + d + 0.001, z]], `stroke="${latten}" stroke-width="0.7" stroke-opacity="0.8"`));
        buiten.push(line([[tx + b + 0.001, ty + 0.01, z], [tx + b + 0.001, ty + d - 0.01, z]], `stroke="${latten}" stroke-width="0.7" stroke-opacity="0.6"`));
      }
      // De glazen pui: een schuifdeur en een groot raam, met licht als er iemand is.
      const glas = aan ? '#F4C27E' : nacht ? '#0f1a2a' : '#4d7eac';
      const pui = [[tx + 0.12, ty + d + 0.002, 0.05], [tx + b - 0.12, ty + d + 0.002, 0.05], [tx + b - 0.12, ty + d + 0.002, h - 0.1], [tx + 0.12, ty + d + 0.002, h - 0.1]];
      buiten.push(poly(pui, `fill="${glas}" stroke="#1c232c" stroke-width="1.4"`));
      if (aan) {
        buiten.push(`<g filter="url(#${id}-zacht)" opacity="0.7">${poly(pui, 'fill="#FFB765"')}</g>`);
        // Het licht van binnen valt door de pui naar buiten, over de vlonder en het gras (28 oktober 2026).
        grond.push(`<g filter="url(#${id}-zacht)" opacity="0.9">${poly([[tx + 0.05, ty + d, 0.005], [tx + b - 0.05, ty + d, 0.005], [tx + b + 0.3, ty + d + over + 0.95, 0.005], [tx - 0.3, ty + d + over + 0.95, 0.005]], 'fill="#FFB765" fill-opacity="0.8"')}</g>`);
        const kern = P(tx + b / 2, ty + d + 0.15, h * 0.45);
        buiten.push(`<ellipse cx="${kern[0].toFixed(1)}" cy="${kern[1].toFixed(1)}" rx="${(k * 0.75).toFixed(1)}" ry="${(k * 0.45).toFixed(1)}" fill="#FFB765" opacity="0.3" filter="url(#${id}-zacht)"/>`);
      }
      if (!aan && !nacht) buiten.push(poly([pui[0], [tx + 0.4, ty + d + 0.002, 0.05], [tx + 0.2, ty + d + 0.002, h - 0.1]], 'fill="#ffffff" opacity="0.12"'));
      for (const x of [tx + b * 0.42, tx + b * 0.7]) buiten.push(line([[x, ty + d + 0.003, 0.05], [x, ty + d + 0.003, h - 0.1]], 'stroke="#1c232c" stroke-width="1.4"'));
      // Een smal raam in de zijkant.
      const zij = [[tx + b + 0.002, ty + 0.2, 0.42], [tx + b + 0.002, ty + 0.52, 0.42], [tx + b + 0.002, ty + 0.52, 0.62], [tx + b + 0.002, ty + 0.2, 0.62]];
      buiten.push(poly(zij, `fill="${glas}" stroke="#1c232c" stroke-width="1"`));
      // De palen van het overstek, voor de pui.
      for (const x of [tx + 0.02, tx + b - 0.06]) buiten.push(doos(x, ty + d + over - 0.06, 0.04, 0.04, 0.04, h - 0.04, ['#2a323c', '#20272f', '#1a2027']));
      // Het platte dak, met het overstek naar voren; panelen of sneeuw erop.
      buiten.push(doos(tx - 0.05, ty - 0.05, h, b + 0.1, d + over + 0.05, dik, [sneeuw ? '#eef3f8' : licht ? '#5b6672' : '#4a5562', '#1f262e', '#262e37']));
      /*
       * Twee spots onder het overstek (24 oktober 2026): elk schijnt omlaag in een
       * bundel, in de kleur van zijn lamp, met een plas licht op de vlonder. Met
       * één lamp in Home Assistant schijnen ze samen; zonder lamp onder het
       * overstek gaan ze mee met het licht binnen.
       */
      const spots = t.overstekLampen?.length ? t.overstekLampen : [{ aan: lampAan, kleur: t.overstekKleur ?? '#FFD39A' }];
      [0.27, 0.73].forEach((f, i) => {
        const s = spots[i] ?? spots[0];
        const kleur = s.kleur ?? '#FFD39A';
        const x = tx + b * f;
        const lamp = P(x, ty + d + over - 0.1, h - 0.005);
        const voet = P(x, ty + d + over * 0.55, 0.045);
        if (s.aan) {
          const rx = k * 0.26;
          const ry = k * 0.1;
          buiten.push(`<defs><linearGradient id="${id}-spot${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: ${kleur}" stop-opacity="0.75"/><stop offset="1" style="stop-color: ${kleur}" stop-opacity="0.08"/></linearGradient></defs>`);
          buiten.push(`<polygon points="${[[lamp[0] - k * 0.025, lamp[1]], [lamp[0] + k * 0.025, lamp[1]], [voet[0] + rx, voet[1]], [voet[0] - rx, voet[1]]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="url(#${id}-spot${i})" opacity="0.8" filter="url(#${id}-zacht)"/>`);
          buiten.push(`<ellipse cx="${voet[0].toFixed(1)}" cy="${voet[1].toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" style="fill: ${kleur}" opacity="0.75" filter="url(#${id}-zacht)"/>`);
          // En een plas in zijn kleur op het gras voor het tuinhuis, zodat je het ook klein ziet.
          const plas = P(x, ty + d + over + 0.3, 0.005);
          grond.push(`<ellipse cx="${plas[0].toFixed(1)}" cy="${plas[1].toFixed(1)}" rx="${(k * 0.5).toFixed(1)}" ry="${(k * 0.22).toFixed(1)}" style="fill: ${kleur}" opacity="0.45" filter="url(#${id}-zacht)"/>`);
        }
        buiten.push(`<rect x="${(lamp[0] - k * 0.03).toFixed(1)}" y="${(lamp[1] - k * 0.012).toFixed(1)}" width="${(k * 0.06).toFixed(1)}" height="${(k * 0.024).toFixed(1)}" rx="${(k * 0.01).toFixed(1)}" style="fill: ${s.aan ? kleur : '#55626f'}"/>`);
      });
      if (t.tuinhuisPanelen && !sneeuw) {
        plaatPanelen(tx + 0.04, ty, b - 0.08, d + 0.1, h + dik, Math.min(6, t.tuinhuisPanelen));
        plek.panelenSchuur = [tx + b / 2, ty + d / 2, h + dik + 0.1];
      }
      plek.tuinhuis = [tx + b / 2, ty + d / 2, h + dik];
      tuinhuisVak = { x0: tx - 0.1, y0: ty - 0.1, x1: tx + b + 0.1, y1: ty + d + over, h: h + dik + 0.1 };
    }
    /** Het schuurtje: het houten huisje met puntdak (het tuinhuis van huis 3.0 tot 24 oktober 2026). */
    function tuinhuis3(tx, ty, t) {
      const b = 1.0;
      const d = 0.85;
      const h = 0.7;
      const nok = 1.08;
      const sneeuw = model.weer === 'sneeuw';
      const hout = licht ? ['#b08a62', '#9a7552', '#86643f'] : ['#8a6a4a', '#74583d', '#5e4732'];
      const aan = t.tuinhuisAan;
      buiten.push(`<g filter="url(#${id}-zacht)" opacity="0.35">${poly([[tx - 0.05, ty, 0], [tx + b + 0.25, ty, 0], [tx + b + 0.25, ty + d + 0.2, 0], [tx - 0.05, ty + d + 0.2, 0]], 'fill="#02050a"')}</g>`);
      // Het linker dakvlak eerst: daar zie je alleen de rand van.
      buiten.push(poly([[tx - 0.08, ty - 0.08, h - 0.04], [tx + b / 2, ty - 0.08, nok], [tx + b / 2, ty + d + 0.1, nok], [tx - 0.08, ty + d + 0.1, h - 0.04]], `fill="${sneeuw ? '#d6dee7' : '#2c3542'}"`));
      buiten.push(doos(tx, ty, 0, b, d, h, [hout[0], hout[1], hout[2]]));
      // De planken: verticale lijnen op de voorkant en de zijkant.
      for (let x = tx + 0.1; x < tx + b - 0.02; x += 0.1) buiten.push(line([[x, ty + d + 0.001, 0.02], [x, ty + d + 0.001, h]], `stroke="${hout[2]}" stroke-width="0.8" stroke-opacity="0.8"`));
      for (let y = ty + 0.1; y < ty + d - 0.02; y += 0.1) buiten.push(line([[tx + b + 0.001, y, 0.02], [tx + b + 0.001, y, h]], 'stroke="#4a3828" stroke-width="0.8" stroke-opacity="0.7"'));
      // De punt boven de deur.
      buiten.push(poly([[tx, ty + d, h], [tx + b, ty + d, h], [tx + b / 2, ty + d, nok - 0.02]], `fill="${hout[1]}"`));
      // De deur met een raampje, en een lamp erboven.
      const dx0 = tx + b / 2 - 0.13;
      buiten.push(poly([[dx0, ty + d + 0.002, 0.01], [dx0 + 0.26, ty + d + 0.002, 0.01], [dx0 + 0.26, ty + d + 0.002, 0.56], [dx0, ty + d + 0.002, 0.56]], `fill="${hout[2]}" stroke="#3e2f22" stroke-width="1"`));
      buiten.push(poly([[dx0 + 0.07, ty + d + 0.003, 0.38], [dx0 + 0.19, ty + d + 0.003, 0.38], [dx0 + 0.19, ty + d + 0.003, 0.5], [dx0 + 0.07, ty + d + 0.003, 0.5]], `fill="${aan ? '#F4C27E' : '#1b2633'}"`));
      const lamp = P(tx + b / 2, ty + d + 0.04, 0.64);
      buiten.push(`<circle cx="${lamp[0]}" cy="${lamp[1]}" r="${(k * 0.035).toFixed(1)}" fill="${t.overstekAan || aan ? '#FFD39A' : '#55626f'}"/>`);
      if (t.overstekAan || aan) {
        const voet = P(tx + b / 2, ty + d + 0.25, 0.01);
        buiten.push(`<ellipse cx="${voet[0]}" cy="${voet[1]}" rx="${(k * 0.45).toFixed(1)}" ry="${(k * 0.2).toFixed(1)}" fill="#FFD39A" opacity="0.3" filter="url(#${id}-zacht)"/>`);
      }
      // Een raam aan de zijkant, met een bloembak eronder.
      const raam = [[tx + b + 0.002, ty + 0.25, 0.3], [tx + b + 0.002, ty + 0.58, 0.3], [tx + b + 0.002, ty + 0.58, 0.55], [tx + b + 0.002, ty + 0.25, 0.55]];
      buiten.push(poly(raam, `fill="${aan ? '#F4C27E' : nacht ? '#0f1a2a' : '#4d7eac'}" stroke="#3e2f22" stroke-width="1"`));
      if (aan) buiten.push(`<g filter="url(#${id}-zacht)" opacity="0.5">${poly(raam, 'fill="#FFB765"')}</g>`);
      buiten.push(doos(tx + b, ty + 0.23, 0.22, 0.06, 0.37, 0.07, ['#5e4732', '#4a3828', '#6b4e35']));
      if (!winter && !sneeuw) for (let i = 0; i < 4; i++) {
        const c = P(tx + b + 0.04, ty + 0.28 + i * 0.09, 0.31);
        buiten.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(k * 0.025).toFixed(1)}" fill="${['#f2a7c3', '#f6d36b', '#e8634a', '#ffffff'][i]}"/>`);
      }
      // Het rechter dakvlak, met overstek; panelen of sneeuw erop.
      const q = (u, v) => [tx + b / 2 + u * (b / 2 + 0.08), ty - 0.08 + v * (d + 0.18), nok - u * (nok - h + 0.04) + 0.005];
      buiten.push(poly([q(0, 0), q(1, 0), q(1, 1), q(0, 1)], `fill="${sneeuw ? '#eef3f8' : '#3b4654'}"`));
      buiten.push(line([q(1, 0), q(1, 1)], 'stroke="#2a323d" stroke-width="1.5"'));
      if (t.tuinhuisPanelen && !sneeuw) {
        const n = Math.max(1, Math.min(6, Math.round(t.tuinhuisPanelen)));
        for (let i = 0; i < n; i++) {
          const v0 = 0.08 + (i * 0.84) / n;
          const v1 = v0 + 0.84 / n - 0.03;
          const pan = [q(0.12, v0), q(0.9, v0), q(0.9, v1), q(0.12, v1)].map(([x, y, z]) => [x, y, z + 0.01]);
          buiten.push(poly(pan, `fill="url(#${id}-paneel)" stroke="#5b7aa0" stroke-opacity="0.7" stroke-width="0.8"`));
        }
        plek.panelenSchuur = q(0.5, 0.5);
      }
      plek.tuinhuis = [tx + b / 2, ty + d / 2, nok];
      tuinhuisVak = { x0: tx - 0.1, y0: ty - 0.1, x1: tx + b + 0.1, y1: ty + d + 0.1, h: nok + 0.05 };
    }
    function schaduw(hex, f) {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
      return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }

    // Buiten om op te tikken: de oprit en de tuin, als ze een kamer in de indeling zijn.
    // Gekozen (in Kamer): een omlijning; zonder dak staat de naam erbij op de grond.
    // Op het eiland zo groot als wat er getekend is (25 oktober 2026): de tuin loopt tot de rand.
    const vlakOprit = eiland ? [[-2.9, -0.4, 0.01], [-1.15, -0.4, 0.01], [-1.15, eiland.yF, 0.01], [-2.9, eiland.yF, 0.01]] : [[-2.9, -0.4, 0.01], [-1.15, -0.4, 0.01], [-1.15, D + 1.7, 0.01], [-2.9, D + 1.7, 0.01]];
    const vlakTuin = eiland
      ? [[W + 0.3, eiland.y0 + 0.3, 0.01], [eiland.x1 - 0.12, eiland.y0 + 0.3, 0.01], [eiland.x1 - 0.12, eiland.yF - 0.12, 0.01], [W + 0.3, eiland.yF - 0.12, 0.01]]
      : [[W + 0.3, -1.95, 0.01], [W + 2.05, -1.95, 0.01], [W + 2.05, 0.25, 0.01], [W + 0.3, 0.25, 0.01]];
    const vlakTerras = [[W + 0.3, 0.45, 0.01], [W + 2.05, 0.45, 0.01], [W + 2.05, D + 0.4, 0.01], [W + 0.3, D + 0.4, 0.01]];
    const vlakVoortuin = [[1.3, D + 0.3, 0.01], [W + 0.1, D + 0.3, 0.01], [W + 0.1, D + 1.7, 0.01], [1.3, D + 1.7, 0.01]];
    const vlakBalkon = [[W, 0.35, FH], [W + 0.55, 0.35, FH], [W + 0.55, 1.15, FH], [W, 1.15, FH]];
    // Het tuinhuis zelf, als het een eigen ruimte in Home Assistant is (besluit 166): de omtrek van het huisje.
    const th = [W + 0.85, -1.75];
    const tv = tuinhuisVak ?? { x0: th[0], y0: th[1], x1: th[0] + 1.05, y1: th[1] + 0.95, h: 0.88 };
    const vlakTuinhuis = [[tv.x0, tv.y1, 0], [tv.x1, tv.y1, 0], [tv.x1, tv.y0, 0], [tv.x1, tv.y0, tv.h], [tv.x0, tv.y0, tv.h], [tv.x0, tv.y1, tv.h]];
    const tuinhuis = model.tuin && model.tuin.tuinhuis !== false && model.tuin.tuinhuisId ? { id: model.tuin.tuinhuisId, naam: model.tuin.tuinhuisNaam ?? 'Tuinhuis', gekozen: model.tuin.tuinhuisGekozen } : null;
    const vlakGarage = [[-2.9, -0.5, 0], [-1.1, -0.5, 0], [-1.1, -2.0, 0], [-1.1, -2.0, 1.1], [-2.9, -2.0, 1.1], [-2.9, -0.5, 1.1]];
    const metBalkon = model.balkon && g.etages.filter((e) => !e.dak).length >= 2 ? model.balkon : null;
    for (const [deel, vlak, midden] of [
      [model.oprit, vlakOprit, [-2.02, D + 0.65, 0]],
      [model.tuin, vlakTuin, [W + 1.18, -0.85, 0]],
      [model.terras, vlakTerras, [W + 1.18, D / 2 + 0.4, 0]],
      [model.voortuin, vlakVoortuin, [(1.3 + W) / 2, D + 1.0, 0]],
      [metBalkon, vlakBalkon, [W + 0.28, 0.75, FH]],
      // Na de tuin: het huisje ligt erbovenop.
      [tuinhuis, vlakTuinhuis, [(tv.x0 + tv.x1) / 2, tv.y1 + 0.25, 0]],
      // Na de oprit: de garage staat erachter, maar ligt in beeld deels over de oprit.
      [model.garage, vlakGarage, [-2.0, -0.2, 0]],
    ]) {
      if (!deel) continue;
      if (deel.gekozen) grond.push(poly(vlak, `fill="${KLEUR.ijs}" fill-opacity="0.06" stroke="${KLEUR.ijs}" stroke-width="2" stroke-dasharray="7 5"`));
      if (model.zonderDak && deel.naam) {
        const t = P(...midden);
        labels.push(`<text x="${t[0]}" y="${t[1] + 30}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="13" font-weight="700" fill="${deel.gekozen ? KLEUR.ijs : KLEUR.zacht}">${esc(deel.naam)}</text>`);
      }
      if (deel.id) tik(deel, vlak);
    }
    // De zones van de tuin (besluit 206), na de tuin zelf: die liggen erbovenop. Het
    // tuinhuis als zone van de tuin heeft zijn eigen omtrek, net als een losse ruimte.
    // Is het tuinhuis een eigen ruimte, dan opent het huisje die ruimte en niet de zone.
    for (const [soort, zone] of Object.entries((model.tuin?.id && model.tuin.zones) || {})) {
      const v = tuinVakken[soort];
      const huisje = v != null && v === tuinhuisVak;
      if (!v || !zone?.id || (huisje && tuinhuis)) continue;
      const pts = huisje ? [[v.x0, v.y1, 0], [v.x1, v.y1, 0], [v.x1, v.y0, 0], [v.x1, v.y0, v.h], [v.x0, v.y0, v.h], [v.x0, v.y1, v.h]] : [[v.x0, v.y0, 0], [v.x1, v.y0, 0], [v.x1, v.y1, 0], [v.x0, v.y1, 0]];
      tik({ id: model.tuin.id, naam: zone.naam }, pts, ` data-zone="${esc(zone.id)}"`);
    }

    /*
     * De feestdagen (25 oktober 2026), alleen bij het hele huis: een pompoen bij
     * de deur met Halloween, lichtjes langs de gevel met Kerst, vuurwerk in de
     * lucht met Oud en Nieuw, eieren in het gras met Pasen. Stil, zonder
     * beweging: dat kost een oude tablet niets.
     */
    if (feest && dak) {
      const avond = nacht || schemer;
      if (feest === 'halloween') {
        // Op het pad, net naast de deur.
        const px = voordeur ? Math.min(W - 0.2, voordeur.x1 + 0.22) : 0.45;
        const py = D + 0.45;
        const c = P(px, py, 0.11);
        const rx = k * 0.19;
        const ry = k * 0.135;
        if (avond) buiten.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${(c[1] + ry * 0.6).toFixed(1)}" rx="${(rx * 2.2).toFixed(1)}" ry="${(ry * 1.4).toFixed(1)}" fill="#FF9A3C" opacity="0.28" filter="url(#${id}-zacht)"/>`);
        buiten.push(`<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#E8792B"/>`);
        for (const f of [-0.45, 0, 0.45]) buiten.push(`<ellipse cx="${(c[0] + rx * f).toFixed(1)}" cy="${c[1].toFixed(1)}" rx="${(rx * 0.32).toFixed(1)}" ry="${(ry * 0.96).toFixed(1)}" fill="none" stroke="#C25E1A" stroke-width="1"/>`);
        buiten.push(`<path d="M ${c[0].toFixed(1)} ${(c[1] - ry).toFixed(1)} q ${(rx * 0.15).toFixed(1)} ${(-ry * 0.5).toFixed(1)} ${(rx * 0.35).toFixed(1)} ${(-ry * 0.55).toFixed(1)}" stroke="#4E6B2F" stroke-width="${(k * 0.025).toFixed(1)}" fill="none" stroke-linecap="round"/>`);
        // Het gezicht: 's avonds brandt er een kaarsje in.
        const oog = avond ? '#FFD36B' : '#5A2A0E';
        const ox = rx * 0.38;
        const oy = ry * 0.22;
        const s = rx * 0.17;
        buiten.push(`<path d="M ${(c[0] - ox - s).toFixed(1)} ${(c[1] - oy + s).toFixed(1)} l ${s.toFixed(1)} ${(-2 * s).toFixed(1)} l ${s.toFixed(1)} ${(2 * s).toFixed(1)} z M ${(c[0] + ox - s).toFixed(1)} ${(c[1] - oy + s).toFixed(1)} l ${s.toFixed(1)} ${(-2 * s).toFixed(1)} l ${s.toFixed(1)} ${(2 * s).toFixed(1)} z" fill="${oog}"/>`);
        buiten.push(`<path d="M ${(c[0] - rx * 0.45).toFixed(1)} ${(c[1] + ry * 0.3).toFixed(1)} q ${(rx * 0.45).toFixed(1)} ${(ry * 0.45).toFixed(1)} ${(rx * 0.9).toFixed(1)} 0" fill="none" stroke="${oog}" stroke-width="${(k * 0.022).toFixed(1)}" stroke-linecap="round"/>`);
      }
      if (feest === 'kerst') {
        // Lichtjes langs de voorgevel en de dakgoot rechts; 's avonds met een gloed.
        const KLEUREN = ['#FF5A4A', '#FFD36B', '#6EE7B7', '#6FD3FF'];
        const langs = [[[0, D, zt], [W / 2, D, zt + R]], [[W / 2, D, zt + R], [W, D, zt]], [[W, D, zt], [W, 0, zt]]];
        let i = 0;
        for (const [a, b] of langs) {
          const lengte = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const n = Math.max(2, Math.round(lengte / 0.17));
          for (let j = 0; j < n; j++, i++) {
            const f = (j + 0.5) / n;
            // Een slinger: elk lampje net onder de lijn, om en om iets lager.
            const q = P(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 0.01, a[2] + (b[2] - a[2]) * f - 0.05 - (j % 2) * 0.03);
            const kl = KLEUREN[i % KLEUREN.length];
            if (avond) buiten.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(k * 0.07).toFixed(1)}" fill="${kl}" opacity="0.35" filter="url(#${id}-zacht)"/>`);
            buiten.push(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${(k * 0.026).toFixed(1)}" fill="${kl}"/>`);
          }
        }
      }
      if (feest === 'oudnieuw') {
        // Drie pijlen vuurwerk boven het huis, 's avonds.
        for (const [fx, fz, kl] of [[W * 0.1, zt + R + 1.4, '#FFD36B'], [W * 0.85, zt + R + 1.8, '#FF6FA0'], [W * 0.5, zt + R + 2.3, '#6FD3FF']]) {
          const c = P(fx, D / 2, fz);
          const r = k * 0.42;
          const stralen = Array.from({ length: 14 }, (_, j) => {
            const h = (j / 14) * Math.PI * 2;
            return `M ${(c[0] + Math.cos(h) * r * 0.25).toFixed(1)} ${(c[1] + Math.sin(h) * r * 0.25).toFixed(1)} L ${(c[0] + Math.cos(h) * r).toFixed(1)} ${(c[1] + Math.sin(h) * r).toFixed(1)}`;
          }).join(' ');
          lucht.push(`<g opacity="${avond ? 0.95 : 0.6}"><path d="${stralen}" stroke="${kl}" stroke-width="2" stroke-linecap="round"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(r * 1.1).toFixed(1)}" fill="${kl}" opacity="0.12"/></g>`);
        }
      }
      if (feest === 'pasen') {
        // Zes eieren in het gras voor het huis, rechts van de voordeur.
        const EI = ['#F6D36B', '#F2A7C3', '#9FD3EA', '#B5E3B0', '#C4BCFF', '#FFB088'];
        for (let j = 0; j < 6; j++) {
          const q = P(W + 0.25 + (j % 3) * 0.32, D + 0.2 + Math.floor(j / 3) * 0.28 + (j % 2) * 0.06, 0.04);
          buiten.push(`<ellipse cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" rx="${(k * 0.045).toFixed(1)}" ry="${(k * 0.06).toFixed(1)}" fill="${EI[j]}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>`);
        }
      }
    }

    /*
     * Het weer (huis 3.0): regen als schuine strepen, sneeuw als vlokken, en
     * 's nachts in de wereld een paar vuurvliegjes boven het gras. Met minder
     * beweging staan ze stil.
     */
    const weer = [];
    {
      let zaad = 5;
      const rnd = () => ((zaad = (zaad * 16807) % 2147483647) / 2147483647);
      const beweeg = !stilGekozen();
      if (model.weer === 'regen') {
        for (let i = 0; i < 70; i++) {
          const x = rnd() * breed;
          const y = rnd() * hoog;
          weer.push(`<line class="${beweeg ? 'sc-regen' : ''}" style="animation-delay:-${(rnd() * 1.2).toFixed(2)}s" x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - 6).toFixed(0)}" y2="${(y + 18).toFixed(0)}" stroke="#a9c4e0" stroke-opacity="0.35" stroke-width="1.2" stroke-linecap="round"/>`);
        }
      }
      if (model.weer === 'sneeuw') {
        for (let i = 0; i < 80; i++) {
          weer.push(`<circle class="${beweeg ? 'sc-sneeuw' : ''}" style="animation-delay:-${(rnd() * 8).toFixed(2)}s" cx="${(rnd() * breed).toFixed(0)}" cy="${(rnd() * hoog).toFixed(0)}" r="${(1 + rnd() * 2).toFixed(1)}" fill="#ffffff" opacity="${(0.45 + rnd() * 0.4).toFixed(2)}"/>`);
        }
      }
      if (eiland && nacht && !winter) {
        for (let i = 0; i < 9; i++) {
          const c = P(eiland.x0 + rnd() * (eiland.x1 - eiland.x0), eiland.y0 + rnd() * (eiland.yF - eiland.y0), 0.2 + rnd() * 0.6);
          weer.push(`<circle class="${beweeg ? 'sc-vlieg' : ''}" style="animation-delay:-${(rnd() * 4).toFixed(2)}s" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="1.8" fill="#f6e7a0" filter="url(#${id}-gloed)"/>`);
        }
      }
    }
    const weerStijl = weer.length
      ? '<style>.sc-regen{animation:sc-regen 0.9s linear infinite}@keyframes sc-regen{from{transform:translate(0,-40px)}to{transform:translate(-12px,40px)}}.sc-sneeuw{animation:sc-sneeuw 8s linear infinite}@keyframes sc-sneeuw{from{transform:translate(0,-30px)}to{transform:translate(14px,30px)}}.sc-vlieg{animation:sc-vlieg 4s ease-in-out infinite alternate}@keyframes sc-vlieg{from{transform:translate(0,0);opacity:.2}to{transform:translate(6px,-8px);opacity:1}}</style>'
      : '';

    // Met kamers om op te tikken een groep, geen plaatje: anders ziet een schermlezer de kamers niet (besluit 86, de controle van 22 oktober 2026).
    return `<svg class="sc-huis${opts.meubels ? ' sc-ingericht' : ''}" viewBox="0 0 ${breed} ${hoog}" width="100%" height="100%" role="${tikken.length ? 'group' : 'img'}" aria-label="${esc(model.beschrijving ?? global.t?.('thuis.hetHuis') ?? '')}">
      <defs>${lichter(defs.join(''))}</defs>
      <g>${lucht.join('')}</g>
      <g>${grond.join('')}</g>
      ${buitenAchter.length ? `<g>${lichter(buitenAchter.join(''))}</g>` : ''}
      <g>${lichter(huis.join(''))}</g>
      ${burenVoor.length ? `<g>${burenVoor.join('')}</g>` : ''}
      ${eiland && stromen.length ? `<g filter="url(#${id}-gloed)" opacity="0.7">${stromen.join('').replace(/ class="sc-stroom"/g, '')}</g>` : ''}
      <g>${stromen.join('')}</g>
      <g>${lichter(buiten.join(''))}</g>
      ${zonVoor.length ? `<g>${zonVoor.join('')}</g>` : ''}
      ${weer.length ? `${weerStijl}<g>${weer.join('')}</g>` : ''}
      <g>${labels.join('')}</g>
      ${tikken.length ? `<g>${tikken.join('')}</g>` : ''}
      ${opts.controle ? `<desc class="sc-controle">${esc(JSON.stringify(controle))}</desc>` : ''}
    </svg>`;
  }

  global.huis = { teken, svg, KLEUR, KAMER_ICOON, soortVan };
})(window);
