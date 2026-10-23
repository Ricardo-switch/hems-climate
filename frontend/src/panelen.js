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
  // De teksten in kit/teksten.*.js (besluit 185); de ligging in woorden komt nog van de dienst.
  const t = (k, p) => window.taal.t(k, p);
  const ZON = (z) => t(`panelen.zon.${z}`);
  const KANTEN = [['noorden', 0], ['oosten', 90], ['zuiden', 180], ['westen', 270]];
  const HELLING = [['plat', 10], ['flauw', 25], ['gewoon', 40], ['steil', 50]];
  const WP = [350, 400, 450];
  const kWp = (w) => (w / 1000).toLocaleString(window.taal.locale, { maximumFractionDigits: 2 });
  const watt = (w) => w.toLocaleString(window.taal.locale);
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
    return `<div class="lig-dag"><div class="lig-dagkop"><span>${esc(t('panelen.heldereDag', { datum: l.datumTekst }))}</span><span>${esc(nl(l.kWh))} kWh</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('panelen.lijnLabel', { datum: l.datumTekst }))}">
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
    return `<svg class="lig-roos" viewBox="0 0 116 116" role="img" aria-label="${esc(t('panelen.roos', { richting: woordVan(deg) }))}">
      <circle cx="58" cy="58" r="54" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/>
      ${[['n', 58, 15], ['o', 104, 62], ['z', 58, 110], ['w', 12, 62]].map(([k, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${k === 'n' ? 'var(--tekst)' : 'var(--gedempt)'}" font-size="11" font-weight="700">${esc(t(`panelen.windroos.${k}`))}</text>`).join('')}
      <g transform="rotate(${r} 58 58)">
        <rect x="34" y="34" width="24" height="48" fill="rgba(247,181,72,0.35)" stroke="rgba(247,181,72,0.7)"/>
        <rect x="58" y="34" width="24" height="48" fill="rgba(247,181,72,0.55)" stroke="rgba(247,181,72,0.9)"/>
        <line x1="58" y1="34" x2="58" y2="82" stroke="var(--tekst)" stroke-width="2"/>
        <path d="M 84 58 L 98 58 M 92 52 L 98 58 L 92 64" stroke="var(--ijs)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g></svg>`;
  }
  const RICHTINGEN = ['n', 'no', 'o', 'zo', 'z', 'zw', 'w', 'nw'];
  const woordVan = (deg) => t(deg == null ? 'panelen.onbekend' : `panelen.richting.${RICHTINGEN[Math.round((((deg % 360) + 360) % 360) / 45) % 8]}`);

  /** De regels van een ligging in woorden, zoals de dienst ze geeft. */
  function regels(w, v, a, metOmvormer = true) {
    return `${rij(t('panelen.richting'), zin(w.richting, v.kanten))}
      ${rij(t('panelen.helling'), zin(w.helling))}
      ${rij(t('panelen.vermogen'), zin(w.vermogen, w.perPaneel))}
      ${metOmvormer && w.omvormerW ? rij(t('panelen.omvormer'), `<span class="lig-chip gevonden">✓ ${esc(watt(w.omvormerW))} W</span>`) : ''}`;
  }

  function voorkantVraag(v, a) {
    if (!v.vraagVoorkant) return '';
    return rij(t('energie.kant.voorkant'), `<div class="lig-chips" role="group" aria-label="${esc(t('panelen.wanneerZon'))}">${v.vraagVoorkant.map((z) => chip(`data-lig-zon="${z}"`, ZON(z), a.voorkantZon === z)).join('')}</div>`);
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
        <div class="lig-chips"><span class="mini lig-vol">${esc(t('panelen.kijktNaar'))}</span>
          ${KANTEN.map(([k, d]) => chip(`data-lig-voorgevel="${d}"`, t(`panelen.kant.${k}`), hoek(d, c.voorgevelDeg) <= 22, 'klein')).join('')}
          <label class="mini lig-vol">${esc(t('panelen.fijner', { graden: Math.round(c.voorgevelDeg) }))}<input class="lig-draai" type="range" min="0" max="355" step="1" value="${Math.round(c.voorgevelDeg) % 360}" data-lig-draai aria-label="${esc(t('panelen.draaiLabel'))}"></label>
          ${kaartKnop(c)}
        </div></div>
      ${rij(t('panelen.helling'), `<div class="lig-chips">${HELLING.map(([k, d]) => {
        const hier = helling[1] === d;
        const graden = hier ? c.hellingDeg : d;
        const naam = t(`panelen.dak.${k}`);
        return chip(`data-lig-helling="${graden}"`, k === 'plat' && !hier ? naam : `${naam} ${graden}°`, hier, 'klein');
      }).join('')}</div>`)}
      ${rij(t('panelen.perPaneel'), `<div class="lig-chips">${WP.map((w) => chip(`data-lig-wp="${w}"`, `${w} Wp`, w === c.wpPerPaneel, 'klein')).join('')}${zelf(`data-lig-wpzelf aria-label="${esc(t('panelen.wattpiek'))}"`, esc(t('panelen.anders')), eigenWp ? c.wpPerPaneel : null, 50, 1000, 5, 'Wp')}</div>
        ${v.aantal ? `<small class="lig-onder">${esc(t('panelen.samen', { n: v.aantal, wp: c.wpPerPaneel, kwp: kWp(v.aantal * c.wpPerPaneel) }))}</small>` : ''}`)}
      ${rij(t('panelen.omvormer'), `<div class="lig-chips">${gevonden ? chip(`data-lig-omvormer="${gevonden}"`, `✓ ${watt(gevonden)} W`, c.omvormerW === gevonden, 'gevonden klein') : ''}${zelf(`data-lig-omvormerzelf aria-label="${esc(t('panelen.omvormerLabel'))}"`, esc(t('panelen.anders')), eigenOmvormer ? c.omvormerW : null, 100, 100000, 100, 'W')}${chip('data-lig-omvormer="geen"', t('panelen.weetNiet'), c.omvormerW == null, 'klein')}</div>`)}`;
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
      ? t('panelen.kaart.stuurt')
      : k === 'bezig'
        ? t('panelen.kaart.bezig')
        : k.fout
          ? k.fout
          : t('panelen.kaart.volgens', { graden: k.voorkantDeg });
    return `<div class="lig-vol lig-kaart"><button type="button" class="lig-link" data-lig-kaart ${k === 'bezig' ? 'disabled' : ''}>${esc(t('panelen.kaart.knop'))}</button><small class="mini">${esc(zin)}</small></div>`;
  }
  async function opDeKaart(staat) {
    const c = staat.concept;
    if (!c) return;
    c.kaart = 'bezig';
    let uit;
    try {
      const res = await deur('api/gevel-kaart', { nuDeg: Math.round(c.voorgevelDeg) });
      const body = res ? await res.json().catch(() => ({})) : {};
      uit = res?.ok ? body : { fout: body.fout ?? body.wachten ?? t('panelen.kaart.geenAntwoord') };
    } catch {
      uit = { fout: t('panelen.kaart.geenVerbinding') };
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
    if (!v) return { kop: t('panelen.hoe'), uitleg: t('kamer.kijken'), inhoud: '', knoppen: '', volgende: true };
    if (a?.panelen?.ligging === 'geen') return { kop: t('energie.kant.geen'), uitleg: t('panelen.geenUitleg'), inhoud: '', knoppen: '', volgende: true };
    if (staat.aanpassen) {
      staat.concept ??= beginConcept(v);
      return {
        kop: t('panelen.pasAan'),
        uitleg: t('panelen.pasAanUitleg'),
        inhoud: aanpassen(v, staat.concept),
        knoppen: `<button type="button" class="lig-knop zacht" data-lig-terug>${esc(t('panelen.terug'))}</button><button type="button" class="lig-knop" data-lig-bewaar>${esc(t('panelen.bewaar'))}</button>`,
        volgende: false,
      };
    }
    const knopAanpassen = `<button type="button" class="lig-knop zacht" data-lig-aanpassen>${esc(t('panelen.aanpassen'))}</button>`;
    if (v.stand === 'voorstel') {
      return {
        kop: t('panelen.zoLiggen'),
        uitleg: t('panelen.gevonden'),
        inhoud: `${lijn(v.lijn)}<div class="lig-regels">${regels(v.voorstel, v, a)}${voorkantVraag(v, a)}</div>`,
        knoppen: `${knopAanpassen}<button type="button" class="lig-knop" data-lig-klopt>${esc(t('panelen.klopt'))}</button>`,
        volgende: false,
      };
    }
    if (v.stand === 'bevestigd' || v.stand === 'configuratie') {
      return {
        kop: t('panelen.zoLiggen'),
        uitleg: t(v.stand === 'bevestigd' ? 'panelen.bevestigd' : 'panelen.ingesteld'),
        inhoud: `${v.nu ? `<div class="lig-regels">${regels(v.nu, v, a)}</div>` : ''}${v.stand === 'bevestigd' && v.voorstel ? `<button type="button" class="lig-link" data-lig-meten>${esc(t('panelen.opnieuw'))}</button>` : ''}`,
        knoppen: knopAanpassen,
        volgende: true,
      };
    }
    // Nog geen heldere dag: een schatting tot er een is.
    const n = v.nu;
    return {
      kop: t('panelen.nogEen'),
      uitleg: t('panelen.bewolkt'),
      inhoud: `<div class="lig-regels">${voorkantVraag(v, a)}${v.omvormerGevonden ? rij(t('panelen.omvormer'), `<span class="lig-chip gevonden">✓ ${esc(watt(v.omvormerGevonden))} W</span>`) : ''}</div>
        ${n ? `<div class="lig-tip">${esc(t('panelen.schatting', { richting: n.richting.toLowerCase(), helling: n.helling.toLowerCase(), wp: n.wpPerPaneel ?? 400 }))}</div>` : `<div class="lig-tip">${esc(t('panelen.kiesKant'))}</div>`}`,
      knoppen: knopAanpassen,
      volgende: true,
    };
  }

  /**
   * Een klik op de kaart. Zet de keuze in `a` (de antwoorden) of `staat`, en
   * zegt wat de pagina moet doen: 'bewaar', 'teken' of null (niet van ons).
   */
  function klik(knop, v, a, staat) {
    const ds = knop.dataset;
    if (ds.ligZon) {
      a.voorkantZon = ds.ligZon;
      return 'bewaar';
    }
    if (knop.hasAttribute('data-lig-klopt')) {
      a.dak = 'voorstel';
      staat.aanpassen = false;
      return 'bewaar';
    }
    if (knop.hasAttribute('data-lig-meten')) {
      a.dak = null;
      return 'bewaar';
    }
    if (knop.hasAttribute('data-lig-aanpassen')) {
      staat.aanpassen = true;
      staat.concept = beginConcept(v);
      return 'teken';
    }
    if (knop.hasAttribute('data-lig-terug')) {
      staat.aanpassen = false;
      staat.concept = null;
      return 'teken';
    }
    if (knop.hasAttribute('data-lig-bewaar')) {
      a.dak = { aanpassen: { ...staat.concept } };
      staat.aanpassen = false;
      staat.concept = null;
      return 'bewaar';
    }
    const c = staat.concept;
    if (!c) return null;
    if (knop.hasAttribute('data-lig-kaart')) {
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
  function verander(veld, staat) {
    const c = staat.concept;
    if (!c) return null;
    const n = Math.round(Number(veld.value));
    if (veld.hasAttribute('data-lig-draai')) c.voorgevelDeg = n;
    else if (veld.hasAttribute('data-lig-wpzelf') && n >= 50 && n <= 1000) c.wpPerPaneel = n;
    else if (veld.hasAttribute('data-lig-omvormerzelf') && n >= 100 && n <= 100000) c.omvormerW = n;
    else return null;
    return 'teken';
  }

  /** Voor de rij op Energie en de stip bij Inrichten. */
  const kort = (v) => (v?.nu ? `${v.nu.richting}, ${v.nu.vermogenKort ?? v.nu.vermogen}` : null);

  return { kaart, klik, verander, kort, lijn, roos };
})();
