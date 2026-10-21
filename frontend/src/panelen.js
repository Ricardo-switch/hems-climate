/*
 * Hoe de panelen liggen (besluit 157, schets Wand-Inrichten-Panelen): het
 * voorstel uit de meting met de lijn van een heldere dag, aanpassen, en wachten
 * op een zonnige dag. Voor Inrichten en Energie samen. De dienst meet en zegt
 * het in woorden (`api/aansluiting`, veld `ligging`); deze kant zet het neer
 * en zet de keuze van de bewoner in de antwoorden (`voorkantZon`, `dak`).
 */
'use strict';

const ligging = (() => {
  const { esc, nl, deur } = app;
  const ZON = { ochtend: 'ochtendzon', middag: 'middagzon', avond: 'avondzon', weetniet: 'weet ik niet' };
  const KANTEN = [['noorden', 0], ['oosten', 90], ['zuiden', 180], ['westen', 270]];
  const HELLING = [['plat', 10], ['flauw', 25], ['gewoon', 40], ['steil', 50]];
  const WP = [350, 400, 450];
  const kWp = (w) => (w / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
  const hoek = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  const chip = (attrs, tekst, aan = false, klasse = '') => `<button type="button" class="lig-chip${aan ? ' aan' : ''}${klasse ? ` ${klasse}` : ''}" ${attrs} aria-pressed="${aan}">${esc(tekst)}</button>`;
  const rij = (kop, inhoud) => `<div class="lig-rij"><b>${esc(kop)}</b><div>${inhoud}</div></div>`;
  const zin = (tekst, onder) => `<span class="lig-zin">${esc(tekst)}${onder ? `<small>${esc(onder)}</small>` : ''}</span>`;

  /** De dag als lijn: gemeten (zon) en wat bij de ligging hoort (gestippeld). */
  function lijn(l) {
    if (!l || !l.punten.length) return '';
    const W = 404;
    const H = 78;
    const van = Math.floor(l.punten[0][0]) - 0.5;
    const tot = Math.ceil(l.punten.at(-1)[0]) + 0.5;
    const top = Math.max(...l.punten.flatMap((p) => [p[1], p[2]])) * 1.05 || 1;
    const X = (h) => 8 + ((h + 0.125 - van) / (tot - van)) * (W - 16);
    const Y = (w) => 62 - (w / top) * 56;
    const pad = (k) => l.punten.map((p, i) => `${i ? 'L' : 'M'} ${X(p[0]).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(' ');
    const uren = [];
    for (let h = Math.ceil(van); h <= tot; h++) if (h % 3 === 0) uren.push(h);
    return `<div class="lig-dag"><div class="lig-dagkop"><span>Een heldere dag, ${esc(l.datumTekst)}</span><span>${esc(nl(l.kWh))} kWh</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="De opbrengst op ${esc(l.datumTekst)}, met de lijn die bij deze ligging hoort">
        <path d="${pad(1)} L ${X(l.punten.at(-1)[0])} 62 L ${X(l.punten[0][0])} 62 Z" fill="rgba(247,181,72,0.16)"/>
        <path d="${pad(1)}" fill="none" stroke="var(--zon)" stroke-width="2"/>
        <path d="${pad(2)}" fill="none" stroke="var(--tekst)" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.7"/>
        <line x1="8" x2="${W - 8}" y1="62" y2="62" stroke="rgba(255,255,255,0.12)"/>
        ${uren.map((h) => `<text x="${X(h - 0.125)}" y="76" text-anchor="middle" fill="var(--gedempt)" font-size="11">${h}:00</text>`).join('')}
      </svg></div>`;
  }

  /** Het dak van boven, met de voorkant als pijl. */
  function roos(deg) {
    const r = (deg ?? 0) - 90;
    return `<svg class="lig-roos" viewBox="0 0 116 116" role="img" aria-label="Het dak van boven: de voorkant kijkt naar ${esc(woordVan(deg))}">
      <circle cx="58" cy="58" r="54" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/>
      ${[['N', 58, 15], ['O', 104, 62], ['Z', 58, 110], ['W', 12, 62]].map(([t, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${t === 'N' ? 'var(--tekst)' : 'var(--gedempt)'}" font-size="11" font-weight="700">${t}</text>`).join('')}
      <g transform="rotate(${r} 58 58)">
        <rect x="34" y="34" width="24" height="48" fill="rgba(247,181,72,0.35)" stroke="rgba(247,181,72,0.7)"/>
        <rect x="58" y="34" width="24" height="48" fill="rgba(247,181,72,0.55)" stroke="rgba(247,181,72,0.9)"/>
        <line x1="58" y1="34" x2="58" y2="82" stroke="var(--tekst)" stroke-width="2"/>
        <path d="M 84 58 L 98 58 M 92 52 L 98 58 L 92 64" stroke="var(--ijs)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g></svg>`;
  }
  const woordVan = (deg) => (deg == null ? 'onbekend' : `het ${['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]}`);

  /** De regels van een ligging in woorden, zoals de dienst ze geeft. */
  function regels(w, v, a, metOmvormer = true) {
    return `${rij('Richting', zin(w.richting, v.kanten))}
      ${rij('Helling', zin(w.helling))}
      ${rij('Vermogen', zin(w.vermogen, w.perPaneel))}
      ${metOmvormer && w.omvormerW ? rij('Omvormer', `<span class="lig-chip gevonden">✓ ${esc(w.omvormerW.toLocaleString('nl-NL'))} W</span>`) : ''}`;
  }

  function voorkantVraag(v, a) {
    if (!v.vraagVoorkant) return '';
    return rij('Voorkant', `<div class="lig-chips" role="group" aria-label="Wanneer schijnt de zon op de voorkant?">${v.vraagVoorkant.map((z) => chip(`data-lig-zon="${z}"`, ZON[z], a.voorkantZon === z)).join('')}</div>`);
  }

  /** Wat er op Aanpassen staat: uit wat nu geldt of het voorstel. */
  function beginConcept(v) {
    const w = v.nu ?? v.voorstel;
    return {
      voorgevelDeg: w?.voorgevelDeg ?? w?.vlakken?.[0]?.azimuthDeg ?? 180,
      hellingDeg: w?.hellingDeg ?? 40,
      wpPerPaneel: w?.wpPerPaneel ?? 400,
      omvormerW: w?.omvormerW ?? v.omvormerGevonden ?? null,
    };
  }

  function aanpassen(v, c) {
    const dichtst = (lijst, x) => lijst.reduce((b, y) => (Math.abs(y[1] - x) < Math.abs(b[1] - x) ? y : b));
    const helling = dichtst(HELLING, c.hellingDeg);
    const gevonden = v.omvormerGevonden;
    const eigenWp = !WP.includes(c.wpPerPaneel);
    const eigenOmvormer = c.omvormerW != null && c.omvormerW !== gevonden;
    // Het vak "anders" toont een eigen getal, en staat dan aan.
    const zelf = (attr, label, waarde, min, max, stap, eenheid) =>
      `<label class="lig-zelf${waarde != null ? ' aan' : ''}">${label}<input type="number" inputmode="numeric" min="${min}" max="${max}" step="${stap}" ${attr} value="${waarde ?? ''}" placeholder="${eenheid}"></label>`;
    return `<div class="lig-kompas">${roos(c.voorgevelDeg)}
        <div class="lig-chips"><span class="mini lig-vol">De voorkant kijkt naar het</span>
          ${KANTEN.map(([t, d]) => chip(`data-lig-voorgevel="${d}"`, t, hoek(d, c.voorgevelDeg) <= 22, 'klein')).join('')}
          <label class="mini lig-vol">Fijner: ${esc(String(Math.round(c.voorgevelDeg)))}°<input class="lig-draai" type="range" min="0" max="355" step="1" value="${Math.round(c.voorgevelDeg) % 360}" data-lig-draai aria-label="De richting van de voorkant in graden"></label>
          ${kaartKnop(c)}
        </div></div>
      ${rij('Helling', `<div class="lig-chips">${HELLING.map(([t, d]) => {
        const hier = helling[1] === d;
        const graden = hier ? c.hellingDeg : d;
        return chip(`data-lig-helling="${graden}"`, t === 'plat' && !hier ? 'plat' : `${t} ${graden}°`, hier, 'klein');
      }).join('')}</div>`)}
      ${rij('Per paneel', `<div class="lig-chips">${WP.map((w) => chip(`data-lig-wp="${w}"`, `${w} Wp`, w === c.wpPerPaneel, 'klein')).join('')}${zelf('data-lig-wpzelf aria-label="Wattpiek per paneel"', 'anders', eigenWp ? c.wpPerPaneel : null, 50, 1000, 5, 'Wp')}</div>
        ${v.aantal ? `<small class="lig-onder">Samen ${v.aantal} × ${c.wpPerPaneel} Wp = ${esc(kWp(v.aantal * c.wpPerPaneel))} kWp</small>` : ''}`)}
      ${rij('Omvormer', `<div class="lig-chips">${gevonden ? chip(`data-lig-omvormer="${gevonden}"`, `✓ ${gevonden.toLocaleString('nl-NL')} W`, c.omvormerW === gevonden, 'gevonden klein') : ''}${zelf('data-lig-omvormerzelf aria-label="Vermogen van de omvormer in watt"', 'anders', eigenOmvormer ? c.omvormerW : null, 100, 100000, 100, 'W')}${chip('data-lig-omvormer="geen"', 'weet ik niet', c.omvormerW == null, 'klein')}</div>`)}`;
  }

  /*
   * Opmeten op de kaart (21 oktober 2026): de omtrek van het huis in
   * OpenStreetMap geeft de richting van de gevels op een graad. Een kompas
   * binnen tegen de muur zat hier 15° naast. Alleen na een tik: de ligging
   * van het huis gaat dan eenmalig naar OpenStreetMap.
   */
  function kaartKnop(c) {
    const k = c.kaart;
    const zin = !k
      ? 'Stuurt de ligging van je huis eenmalig naar OpenStreetMap.'
      : k === 'bezig'
        ? 'Even kijken op de kaart…'
        : k.fout
          ? k.fout
          : `Volgens de kaart kijkt de voorkant naar ${k.voorkantDeg}°. Staat hij verkeerd om, kies dan een andere kant.`;
    return `<div class="lig-vol lig-kaart"><button type="button" class="lig-link" data-lig-kaart ${k === 'bezig' ? 'disabled' : ''}>Opmeten op de kaart</button><small class="mini">${esc(zin)}</small></div>`;
  }
  async function opDeKaart(staat) {
    const c = staat.concept;
    if (!c) return;
    c.kaart = 'bezig';
    let uit;
    try {
      const res = await deur('api/gevel-kaart', { nuDeg: Math.round(c.voorgevelDeg) });
      const body = res ? await res.json().catch(() => ({})) : {};
      uit = res?.ok ? body : { fout: body.fout ?? body.wachten ?? 'De kaart gaf geen antwoord.' };
    } catch {
      uit = { fout: 'Geen verbinding met de kaart.' };
    }
    if (staat.concept !== c) return;
    c.kaart = uit;
    if (uit.voorkantDeg != null) c.voorgevelDeg = uit.voorkantDeg;
    staat.na?.();
  }

  /**
   * De kaart voor de stand van nu: een kop, een uitleg, de inhoud en de knoppen,
   * en of er daarnaast een gewone "Volgende" hoort (niet bij een vraag die op
   * de bewoner wacht). `staat` houdt bij of de bewoner aan het aanpassen is.
   */
  function kaart(v, a, staat) {
    if (!v) return { kop: 'Hoe je panelen liggen', uitleg: 'Even kijken…', inhoud: '', knoppen: '', volgende: true };
    if (a?.panelen?.ligging === 'geen') return { kop: 'Geen panelen', uitleg: 'Dan is er niets te meten. Komen er panelen bij, kies dan de kant van het dak.', inhoud: '', knoppen: '', volgende: true };
    if (staat.aanpassen) {
      staat.concept ??= beginConcept(v);
      return {
        kop: 'Pas aan wat niet klopt',
        uitleg: 'Wat je hier zet, gaat voor wat Smart Climate meet.',
        inhoud: aanpassen(v, staat.concept),
        knoppen: `<button type="button" class="lig-knop zacht" data-lig-terug>Terug</button><button type="button" class="lig-knop" data-lig-bewaar>Bewaar</button>`,
        volgende: false,
      };
    }
    const knopAanpassen = `<button type="button" class="lig-knop zacht" data-lig-aanpassen>Aanpassen</button>`;
    if (v.stand === 'voorstel') {
      return {
        kop: 'Zo liggen je panelen',
        uitleg: 'Gevonden in wat ze de afgelopen tien dagen leverden. Klopt het?',
        inhoud: `${lijn(v.lijn)}<div class="lig-regels">${regels(v.voorstel, v, a)}${voorkantVraag(v, a)}</div>`,
        knoppen: `${knopAanpassen}<button type="button" class="lig-knop" data-lig-klopt>Klopt</button>`,
        volgende: false,
      };
    }
    if (v.stand === 'bevestigd' || v.stand === 'configuratie') {
      return {
        kop: 'Zo liggen je panelen',
        uitleg: v.stand === 'bevestigd' ? 'Zon, het weer en de verwachting rekenen hiermee.' : 'Zoals ingesteld. Na een heldere dag staat hier wat Smart Climate meet.',
        inhoud: `${v.nu ? `<div class="lig-regels">${regels(v.nu, v, a)}</div>` : ''}${v.stand === 'bevestigd' && v.voorstel ? '<button type="button" class="lig-link" data-lig-meten>Laat Smart Climate het opnieuw meten</button>' : ''}`,
        knoppen: knopAanpassen,
        volgende: true,
      };
    }
    // Nog geen heldere dag: een schatting tot er een is.
    const n = v.nu;
    return {
      kop: 'Nog één zonnige dag',
      uitleg: 'De afgelopen tien dagen waren te bewolkt om te zien hoe je panelen liggen. Na de eerste heldere dag staat het voorstel klaar, met een melding.',
      inhoud: `<div class="lig-regels">${voorkantVraag(v, a)}${v.omvormerGevonden ? rij('Omvormer', `<span class="lig-chip gevonden">✓ ${esc(v.omvormerGevonden.toLocaleString('nl-NL'))} W</span>`) : ''}</div>
        ${n ? `<div class="lig-tip">Tot dan rekent het huis met een schatting: ${esc(n.richting.toLowerCase())}, ${esc(n.helling.toLowerCase())}, ${esc(String(n.wpPerPaneel ?? 400))} Wp per paneel. Zon, het weer en de verwachting werken al.</div>` : '<div class="lig-tip">Kies de kant van het dak en het aantal panelen, dan rekent het huis tot die dag met een schatting.</div>'}`,
      knoppen: knopAanpassen,
      volgende: true,
    };
  }

  /**
   * Een klik op de kaart. Zet de keuze in `a` (de antwoorden) of `staat`, en
   * zegt wat de pagina moet doen: 'bewaar', 'teken' of null (niet van ons).
   */
  function klik(t, v, a, staat) {
    const ds = t.dataset;
    if (ds.ligZon) {
      a.voorkantZon = ds.ligZon;
      return 'bewaar';
    }
    if (t.hasAttribute('data-lig-klopt')) {
      a.dak = 'voorstel';
      staat.aanpassen = false;
      return 'bewaar';
    }
    if (t.hasAttribute('data-lig-meten')) {
      a.dak = null;
      return 'bewaar';
    }
    if (t.hasAttribute('data-lig-aanpassen')) {
      staat.aanpassen = true;
      staat.concept = beginConcept(v);
      return 'teken';
    }
    if (t.hasAttribute('data-lig-terug')) {
      staat.aanpassen = false;
      staat.concept = null;
      return 'teken';
    }
    if (t.hasAttribute('data-lig-bewaar')) {
      a.dak = { aanpassen: { ...staat.concept } };
      staat.aanpassen = false;
      staat.concept = null;
      return 'bewaar';
    }
    const c = staat.concept;
    if (!c) return null;
    if (t.hasAttribute('data-lig-kaart')) {
      void opDeKaart(staat);
      return 'teken';
    }
    if (ds.ligVoorgevel) c.voorgevelDeg = Number(ds.ligVoorgevel);
    else if (ds.ligHelling) c.hellingDeg = Number(ds.ligHelling);
    else if (ds.ligWp) c.wpPerPaneel = Number(ds.ligWp);
    else if (ds.ligOmvormer) c.omvormerW = ds.ligOmvormer === 'geen' ? null : Number(ds.ligOmvormer);
    else return null;
    return 'teken';
  }

  /** Een veld op Aanpassen: de fijne richting, een eigen wattpiek of omvormer. */
  function verander(t, staat) {
    const c = staat.concept;
    if (!c) return null;
    const n = Math.round(Number(t.value));
    if (t.hasAttribute('data-lig-draai')) c.voorgevelDeg = n;
    else if (t.hasAttribute('data-lig-wpzelf') && n >= 50 && n <= 1000) c.wpPerPaneel = n;
    else if (t.hasAttribute('data-lig-omvormerzelf') && n >= 100 && n <= 100000) c.omvormerW = n;
    else return null;
    return 'teken';
  }

  /** Voor de rij op Energie en de stip bij Inrichten. */
  const kort = (v) => (v?.nu ? `${v.nu.richting}, ${v.nu.vermogen.replace(/^Samen /, '')}` : null);

  return { kaart, klik, verander, kort, lijn, roos };
})();
