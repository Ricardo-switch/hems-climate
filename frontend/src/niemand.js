/*
 * Het scherm aan de wand als niemand kijkt (besluiten 164 en 165, schets
 * Wand-Nacht). Alleen op het scherm dat bij Bewoners een scherm is (besluit
 * 149); een telefoon of laptop doet nooit mee.
 *
 * - Een always-on display, na 2, 5 of 15 minuten zonder iemand aan het scherm:
 *   de dagstand (groot de klok, wat het huis doet en het weer) vanaf het einde
 *   van de nacht tot zonsondergang, daarna de avondstand (de klok, gedimd, een
 *   donker huis zonder getallen, alles rustig en het weer van morgen) tot de
 *   nacht (besluit 168). Elk is uit te zetten; dan neemt de andere het over.
 * - De nachtstand is uit: van bedtijd tot de ochtend, of als iemand het huis
 *   op Nacht zet, en als niemand thuis is, gaat het scherm uit na 1, 5, 15 of
 *   30 minuten zonder beweging.
 * - Beweging (de bewegingsmelder die de hoofdgebruiker koos; de dienst stuurt
 *   `wekken`) zet het display weer aan. Een tik, "Hé huis" en aanbellen
 *   openen de app (`sc-wek`).
 *
 * Instellen doet de hoofdgebruiker bij Functies, onder Weergave: Always-on
 * display en Scherm uit (besluit 167; eerst bij het potlood op Thuis). De app
 * kan het scherm alleen donkerder kleuren; draait de wand in Fully Kiosk, dan
 * gaat ook de echte helderheid mee, en 's nachts het scherm echt uit.
 *
 * Op een pagina om naar te kijken (Vandaag, Apparaten, Opbrengst, de
 * Assistent, een kamer) gaat de wand na dezelfde tijd terug naar Thuis.
 */
(function (global) {
  'use strict';
  if (global.niemand) return;

  const { nl, esc, haal, telStand } = global.app;

  const STANDAARD = { nacht: true, van: '23:00', tot: '07:00', rustMin: 5, aanMin: 5, weg: true, dag: true, avond: true, melder: null };
  /** Pagina's om naar te kijken: daar gaat de wand terug naar Thuis. Wie iets invult, laat hij met rust. */
  const KIJKPAGINAS = /\/(vandaag|apparaten|opbrengst|assistent|kamer)\.html$/;
  const DIRECT = 'sc-niemand-direct';
  /** De helderheid van de avondstand in Fully Kiosk, van 255. */
  const FULLY_AVOND = 12;

  let instelling = STANDAARD;
  let magAanpassen = false;
  let modus = null;
  /** Wat Thuis geeft: het huis, de stand, het weer. Zonder: een andere pagina. */
  let bron = null;
  /** De laatste tik op het scherm, en de laatste beweging van de melder. */
  let laatst = Date.now();
  let laatstBeweging = 0;
  /** Is dit het scherm aan de wand (bij Bewoners een scherm)? */
  let scherm = false;
  let bewoners = null;
  /** Wat er nu staat: 'dag', 'avond', 'uit' of null (Thuis). */
  let toont = null;
  let helderVoor = null;

  /* ------------------------------------------------------------ de tijd */

  const minuten = (hhmm) => {
    const [u, m] = String(hhmm).split(':').map(Number);
    return u * 60 + m;
  };
  /** Binnen de nacht, ook als die over middernacht loopt. */
  function inNacht(nu = new Date()) {
    const m = nu.getHours() * 60 + nu.getMinutes();
    const van = minuten(instelling.van);
    const tot = minuten(instelling.tot);
    return van < tot ? m >= van && m < tot : m >= van || m < tot;
  }
  /** Iemand zette het huis zelf op Nacht; de Nacht van de dagdelen telt niet (die begint al om 22:00). */
  const huisOpNacht = () => modus?.mode === 'nacht' && modus?.modeSource === 'override';
  /** Niemand thuis, volgens de bewoners; of het huis staat op Afwezig of Vakantie. */
  function niemandThuis() {
    const bekend = (bewoners?.bewoners ?? []).filter((b) => b.thuis != null);
    return (bekend.length > 0 && bekend.every((b) => !b.thuis)) || ['afwezig', 'vakantie'].includes(modus?.mode);
  }
  /** Moet het scherm uit, na de tijd zonder beweging? */
  const uitNodig = () => (instelling.nacht && (inNacht() || huisOpNacht())) || (instelling.weg && niemandThuis());
  /**
   * De dagstand vanaf het einde van de nacht (Scherm uit) tot zonsondergang,
   * daarna de avondstand tot de nacht (besluit 168). Zonder nacht begint de dag
   * bij zonsopkomst. Staat er één uit, dan neemt de andere zijn tijd over.
   */
  function stand(nu = new Date()) {
    if (instelling.avond === false) return 'dag';
    if (instelling.dag === false) return 'avond';
    const z = bron?.zon?.();
    const klok = (ms) => {
      const d = new Date(ms);
      return d.getHours() * 60 + d.getMinutes();
    };
    const m = nu.getHours() * 60 + nu.getMinutes();
    const onder = z?.dag?.onderMs != null ? klok(z.dag.onderMs) : 19 * 60;
    const op = z?.dag?.opMs != null ? klok(z.dag.opMs) : 7 * 60;
    const vanaf = instelling.nacht ? minuten(instelling.tot) : op;
    return m >= vanaf && m < onder ? 'dag' : 'avond';
  }

  /** Er gebeurt iets op het scherm: dan is er iemand, ook zonder tik. */
  function bezig() {
    if (document.body.classList.contains('aanpassen')) return true;
    if (document.querySelector('.sc-laag.open, .aanbel, .film, dialog[open], .rl-kaart')) return true;
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  /* ------------------------------------------------------- de helderheid */

  function fully(fn) {
    try {
      if (global.fully) fn(global.fully);
    } catch {
      // Geen Fully Kiosk, of een oudere.
    }
  }
  function onthoud(f) {
    if (helderVoor == null && typeof f.getScreenBrightness === 'function') helderVoor = Number(f.getScreenBrightness());
  }
  /** Per stand: gedimd, uit, of zoals hij was. */
  function helderheid(st) {
    fully((f) => {
      if (st === 'uit') {
        onthoud(f);
        f.turnScreenOff?.(true);
        return;
      }
      f.turnScreenOn?.();
      if (st === 'avond') {
        onthoud(f);
        f.setScreenBrightness?.(FULLY_AVOND);
      } else if (helderVoor != null) {
        f.setScreenBrightness?.(helderVoor);
        helderVoor = null;
      }
    });
  }

  /* ------------------------------------------------------------ tekenen */

  const DAG = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const klokNu = () => new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const ICOON_HUIS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/></svg>';
  const WOLK = '<path d="M12 29h14a5.5 5.5 0 0 0 .5-11A7.5 7.5 0 0 0 12.4 20 4.5 4.5 0 0 0 12 29z" fill="#B8C4CF"/>';
  const WEER = {
    zon: '<circle cx="18" cy="18" r="7" fill="#F7B548"/><g stroke="#F7B548" stroke-width="2.2" stroke-linecap="round"><path d="M18 4v3M18 29v3M4 18h3M29 18h3M8 8l2 2M26 26l2 2M8 28l2-2M26 10l2-2"/></g>',
    half: `<circle cx="13" cy="13" r="6" fill="#F7B548"/>${WOLK}`,
    bewolkt: WOLK,
    regen: `${WOLK}<g stroke="#6FD3FF" stroke-width="2" stroke-linecap="round"><path d="M14 31l-1 3M19 31l-1 3M24 31l-1 3"/></g>`,
    onweer: `${WOLK}<path d="M19 28l-3 5h3l-1 3 4-6h-3l1-2z" fill="#F7B548"/>`,
    sneeuw: `${WOLK}<g fill="#EEF3F7"><circle cx="14" cy="32" r="1.4"/><circle cx="19" cy="33" r="1.4"/><circle cx="24" cy="32" r="1.4"/></g>`,
    mist: '<g stroke="#B8C4CF" stroke-width="2.2" stroke-linecap="round"><path d="M6 13h24M9 19h22M6 25h20"/></g>',
  };
  const WOORD = { zon: 'zonnig', half: 'half bewolkt', bewolkt: 'bewolkt', regen: 'regen', onweer: 'onweer', sneeuw: 'sneeuw', mist: 'mist' };
  const weerIcoon = (soort) => `<svg viewBox="0 0 36 36" aria-hidden="true">${WEER[soort] ?? WOLK}</svg>`;

  /** De kamers met een temperatuur: eerst waar je slaapt, dan waar je woont. */
  function kamers() {
    const h = bron?.huis();
    const alle = (h?.etages ?? []).flatMap((e) => e.ruimtes ?? []).filter((r) => r.zoneId && r.temperatuurC != null);
    const rang = (r) => (/slaap/i.test(r.naam) ? 0 : /woon/i.test(r.naam) ? 1 : 2);
    return [...alle].sort((a, b) => rang(a) - rang(b));
  }

  /** Alles rustig, of wat er draait; met de temperatuur van twee kamers. */
  function nachtZin() {
    const st = bron?.state();
    const lijst = kamers();
    const bezigNu = lijst.map((r) => ({ r, stand: global.huismodel?.standVan?.(r.zoneId, st) })).filter((x) => x.stand === 'koelt' || x.stand === 'warmt');
    const kop = bezigNu.length ? `${bezigNu.map((x, i) => `${i ? x.r.naam.toLowerCase() : x.r.naam} ${x.stand}`).join(', ')}.` : 'Alles rustig.';
    const temps = lijst.slice(0, 2).map((r, i) => `${esc(i ? r.naam.toLowerCase() : r.naam)} <b>${nl(r.temperatuurC)}°</b>`).join(', ');
    return `${esc(kop)}${temps ? ` ${temps}` : ''}`;
  }

  function morgenZin() {
    const d = bron?.weer()?.dagen?.[0];
    if (!d) return '';
    const delen = [d.maxC == null ? null : `<b>${nl(d.maxC, 0)}°</b>`, WOORD[d.soort] ?? null, d.verwachtKwh == null ? null : `ongeveer <b>${nl(d.verwachtKwh, 0)}&nbsp;kWh</b> van je panelen`].filter(Boolean);
    return delen.length ? { soort: d.soort, html: `Morgen ${delen.join(', ')}` } : '';
  }

  /**
   * De droger of wasmachine die draait (besluit 166): de kaart zoals Thuis hem
   * tekent, met de ring en wanneer hij klaar is. Leeg als er niets draait.
   */
  function apparaatNu() {
    const k = document.querySelector('#wand [data-apparaatkaart]:not([hidden]) [data-apparaat-inhoud]');
    return k ? k.innerHTML : '';
  }

  function laag() {
    let el = document.querySelector('[data-niemand]');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'niemand lucht';
    el.setAttribute('data-niemand', '');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Tik om de wand te wekken');
    el.tabIndex = 0;
    el.hidden = true;
    el.addEventListener('click', () => wek('tik'));
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), wek('tik')));
    (document.getElementById('wand') ?? document.body).append(el);
    return el;
  }

  function teken() {
    if (!toont) return;
    const el = laag();
    const st = bron?.state();
    const datum = DAG.format(new Date());
    el.dataset.stand = toont;
    el.classList.toggle('lucht-nacht', toont === 'avond');
    el.classList.toggle('lucht-dag', toont === 'dag');
    if (toont === 'uit') {
      // Zwart: in Fully Kiosk is het scherm echt uit.
      el.innerHTML = '<div class="nk-uit">Beweging zet het scherm aan, een tik opent de app</div>';
      return;
    }
    if (toont === 'avond') {
      const morgen = morgenZin();
      const apparaat = apparaatNu();
      el.innerHTML = `<div class="nk-huis" data-nk-huis></div>
        <div class="nk-klok"><div class="tijd" data-nk-tijd>${klokNu()}</div><div class="datum">${esc(datum)}</div></div>
        <div class="nk-regels">
          <span>${ICOON_HUIS}<i data-nk-rustig>${nachtZin()}</i></span>
          ${apparaat ? `<span class="nk-apparaat" data-nk-apparaat>${apparaat}</span>` : ''}
          ${morgen ? `<span>${weerIcoon(morgen.soort)}<i data-nk-morgen>${morgen.html}</i></span>` : ''}
        </div>
        <div class="nk-dim"></div>
        <div class="nk-wek">Tik om de wand te wekken</div>`;
    } else {
      const w = bron?.weer();
      const buitenC = st?.explanation?.outdoorTemperatureC ?? w?.vandaag?.buitenC ?? null;
      const d = w?.dagen?.[0];
      const tegels = [
        buitenC != null || w?.vandaag ? `<div class="glas-klein">${weerIcoon(w?.vandaag?.soort)}<span><b>${buitenC == null ? '–' : `${nl(buitenC, 0)}°`}</b><span>Nu${w?.vandaag?.soort ? `, ${WOORD[w.vandaag.soort] ?? ''}` : ''}</span></span></div>` : '',
        d ? `<div class="glas-klein">${weerIcoon(d.soort)}<span><b>${d.maxC == null ? '–' : `${nl(d.maxC, 0)}°`}</b><span>Morgen${d.verwachtKwh == null ? '' : `, ${nl(d.verwachtKwh, 0)} kWh`}</span></span></div>` : '',
        // De droger erbij, zolang hij draait (besluit 166).
        apparaatNu() ? `<div class="glas-klein nr-apparaat" data-nk-apparaat>${apparaatNu()}</div>` : '',
      ].join('');
      el.innerHTML = `<div class="nr-huis" data-nk-huis></div>
        <div class="nr-klok"><div class="tijd" data-nk-tijd>${klokNu()}</div><div class="datum">${esc(datum)}</div></div>
        <div class="nr-kop"><h1 class="kop-1" data-nk-kop>${esc(st?.bewoner?.kop?.titel ?? 'Het huis')}</h1><p class="lead">${esc(st?.bewoner?.kop?.zin ?? '')}</p></div>
        <div class="nr-weer">${tegels}</div>`;
    }
    tekenHuis(el.querySelector('[data-nk-huis]'));
  }

  /** Het huis zonder getallen, de kamers stil; 's avonds ook zonder stromen. */
  function tekenHuis(vak) {
    const model = bron?.model?.();
    if (!vak || !model || !global.huis) return;
    const nacht = toont === 'avond';
    const stil = {
      ...model,
      labels: [],
      etages: model.etages.map((et) => ({ ...et, kamers: et.kamers.map((k) => ({ ...k, stil: true, ...(nacht ? { stand: undefined } : {}) })) })),
      // 's Nachts zoals de schets: donker, zonder zon, wolken of stromen.
      ...(nacht ? { beschrijving: 'Het huis bij nacht, gedimd. Alles is rustig.', tijd: 'nacht', wolken: 0, zon: { ...model.zon, aandeel: 0, stand: undefined, hoogte: undefined }, stromen: [] } : {}),
    };
    const breed = nacht ? 600 : 720;
    const hoog = nacht ? 480 : 700;
    global.huis.teken(vak, stil, { breedte: breed, hoogte: hoog, marge: 0.04 });
  }

  /* ------------------------------------------------------ tonen en wekken */

  function toon(stand) {
    if (telStand()) return;
    if (!bron) {
      // Op een kijkpagina: terug naar Thuis, en daar meteen rusten.
      if (!KIJKPAGINAS.test(location.pathname)) return;
      try {
        sessionStorage.setItem(DIRECT, '1');
      } catch {
        // Dan rust Thuis na de gewone tijd.
      }
      location.href = 'thuis.html';
      return;
    }
    toont = stand;
    teken();
    const el = laag();
    el.hidden = false;
    document.documentElement.classList.add('sc-niemand');
    helderheid(stand);
  }

  function wek(waarom) {
    laatst = Date.now();
    if (!toont) {
      // Het scherm kan uit staan in Fully Kiosk: bij beweging weer aan.
      if (waarom === 'beweging') fully((f) => f.turnScreenOn?.());
      return;
    }
    toont = null;
    const el = document.querySelector('[data-niemand]');
    if (el) {
      el.hidden = true;
      el.innerHTML = '';
    }
    document.documentElement.classList.remove('sc-niemand');
    helderheid('app');
    dispatchEvent(new CustomEvent('niemandwakker', { detail: waarom }));
  }

  /** Beweging: het display weer aan als het scherm uit was; de app opent pas bij een tik. */
  function beweging() {
    laatstBeweging = Date.now();
    if (toont === 'uit') toon(stand());
    else if (!toont) fully((f) => f.turnScreenOn?.());
  }

  /** Elke paar seconden: wat hoort er nu te staan? */
  function kijk() {
    if (telStand() || !scherm) {
      if (toont) wek('geen wand');
      return;
    }
    const nu = Date.now();
    if (bezig()) {
      if (!toont) laatst = nu;
      return;
    }
    const uit = uitNodig();
    const stil = nu - Math.max(laatst, laatstBeweging);
    let wil = null;
    if (uit && stil >= instelling.aanMin * 60_000) wil = 'uit';
    // Uit tot er beweging is; in de ochtend, of als er iemand thuiskomt, het display weer aan.
    else if (toont === 'uit') wil = uit ? 'uit' : instelling.rustMin > 0 ? stand() : null;
    else if (toont) wil = stand();
    else if (instelling.rustMin > 0 && nu - laatst >= instelling.rustMin * 60_000) wil = stand();
    if (wil === toont) {
      const t = document.querySelector('[data-nk-tijd]');
      if (t) t.textContent = klokNu();
    } else if (wil == null) wek('ochtend');
    else toon(wil);
  }

  /* ------------------------------------------------------------ gegevens */

  async function laad() {
    try {
      const v = await haal('api/voorkeuren');
      instelling = { ...STANDAARD, ...v?.wand?.niemand };
      magAanpassen = !!v?.wand?.magAanpassen;
    } catch {
      // Zonder logmap: zoals het standaard staat.
    }
  }
  async function laadModus() {
    // Wie er kijkt (een scherm?) en wie er thuis is.
    try {
      bewoners = await haal('api/bewoners');
      scherm = bewoners?.ik?.soort === 'scherm';
    } catch {
      scherm = false;
    }
    if (bron) {
      modus = bron.state()?.explanation ?? null;
      return;
    }
    try {
      modus = (await haal('api/state'))?.explanation ?? null;
    } catch {
      // De volgende keer.
    }
  }

  /* ------------------------------------------------------------- starten */

  // Iemand aan het scherm: een tik, een toets, de muis.
  for (const soort of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(soort, () => !toont && (laatst = Date.now()), { capture: true, passive: true });
  let muis = null;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const was = muis;
    muis = [e.clientX, e.clientY];
    if (was && Math.hypot(e.clientX - was[0], e.clientY - was[1]) > 8) {
      if (toont) wek('muis');
      else laatst = Date.now();
    }
  }, { passive: true });
  // Aanbellen, "Hé huis" en de bewegingsmelder (via de dienst).
  addEventListener('sc-wek', (e) => (e.detail === 'beweging' ? beweging() : wek(e.detail ?? 'iets')));
  addEventListener('standwissel', () => telStand() && wek('telefoon'));

  async function begin() {
    await laad();
    await laadModus();
    try {
      if (sessionStorage.getItem(DIRECT) && bron) {
        sessionStorage.removeItem(DIRECT);
        laatst = 0;
      }
    } catch {
      // Geen sessionStorage.
    }
    kijk();
  }
  setInterval(kijk, 5_000);
  setInterval(() => void laad(), 5 * 60_000);
  setInterval(() => void laadModus(), 60_000);

  global.niemand = {
    /** Thuis geeft het huis, de stand en het weer: dan rust de wand hier, anders gaat hij naar Thuis. */
    bij(b) {
      bron = b;
      void begin();
    },
    /** Na nieuwe gegevens: de stand van het huis bij, en opnieuw tekenen als er iets staat. */
    ververs() {
      modus = bron?.state()?.explanation ?? modus;
      if (toont) teken();
    },
    toon,
    wek,
    get toont() {
      return toont;
    },
    get magAanpassen() {
      return magAanpassen;
    },
  };
  // Op een andere pagina geeft niemand het huis: dan meteen beginnen.
  setTimeout(() => {
    if (!bron) void begin();
  }, 0);
})(window);
