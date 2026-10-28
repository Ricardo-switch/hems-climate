/*
 * De rondleiding (besluit 139 en 144, schets Wand-Inrichten-Compleet): twaalf
 * stops op de echte pagina's, langs alle tabbladen en een kamer, met je eigen
 * huis, en dan Klaar. Het scherm wordt donker en
 * licht op waar het om gaat; een kaart vertelt. Iedereen krijgt hem de eerste
 * keer, na het filmpje of de eerste keer op Thuis; daarna achter het vraagteken
 * op Thuis. Overslaan kan altijd.
 *
 * Waar de rondleiding is, onthoudt dit tabblad (sessionStorage), zodat hij over
 * de pagina's heen loopt. Of hij gezien is, onthoudt deze browser.
 */
(function (global) {
  'use strict';

  const { esc } = global.app;
  const GEZIEN = 'sc-rondleiding-gezien';
  const WAAR = 'sc-rondleiding';

  /**
   * Per stop: de pagina, waar en welke tekst (teksten.*.js: rond.<id>), en waar
   * het licht op valt (wand, telefoon). Twaalf stops en Klaar (besluit 144), en
   * in de app van Home Assistant de knop terug naar Home Assistant (besluit 202).
   */
  const ALLE_STOPS = [
    {
      pagina: 'thuis.html',
      plek: 'thuis',
      id: 'huis',
      doel: ['#podium-wand', '#podium-tel'],
    },
    {
      pagina: 'thuis.html',
      plek: 'thuis',
      id: 'kamerTik',
      doel: ['#podium-wand .sc-tik', '#tel [data-kamers] > *'],
      eerste: true,
    },
    {
      pagina: 'kamer.html',
      plek: 'kamer',
      id: 'kamer',
      doel: ['#wand [data-blad]', '#tel [data-blad]'],
    },
    {
      pagina: 'thuis.html',
      plek: 'thuis',
      id: 'gevoel',
      doel: ['#wand [data-gevoel-kaart]', '#tel [data-gevoel-kaart]'],
    },
    {
      pagina: 'vandaag.html',
      plek: 'vandaag',
      id: 'vandaag',
      doel: ['#wand [data-tijdlijn]', '#tel [data-zonkaart]'],
    },
    {
      pagina: 'vandaag.html',
      plek: 'vandaag',
      id: 'gisteren',
      doel: ['#wand [data-wissel]', '#tel [data-wissel]'],
    },
    {
      pagina: 'apparaten.html',
      plek: 'apparaten',
      id: 'apparaten',
      doel: ['#wand [data-apparaten]', '#tel [data-apparaten]'],
    },
    {
      pagina: 'opbrengst.html',
      plek: 'opbrengst',
      id: 'opbrengst',
      doel: ['#wand .midden', '#tel [data-sankey]'],
    },
    {
      pagina: 'assistent.html',
      plek: 'assistent',
      id: 'assistent',
      doel: ['#wand [data-kern]', '#tel [data-kern]'],
    },
    {
      pagina: 'thuis.html',
      plek: 'thuis',
      id: 'bel',
      doel: ['#balk [data-meldbel]', '#tel [data-meldbel]'],
    },
    {
      // Volledig scherm (besluit 202): hoe je naar Home Assistant gaat, en terug. Alleen in Home Assistant.
      pagina: 'thuis.html',
      plek: 'thuis',
      id: 'naarHA',
      doel: ['#balk [data-naar-ha-knop]', '#tel [data-naar-ha-knop]'],
      alleenInHA: true,
    },
    {
      pagina: 'instellingen.html',
      plek: 'instellingen',
      id: 'tandwiel',
      doel: ['#wand [data-groepen]', '#tel [data-groepen]'],
    },
    {
      pagina: 'huis-kan.html',
      plek: 'huisKan',
      id: 'huisKan',
      doel: ['#wand [data-vakken]', '#tel [data-vakken]'],
    },
    {
      pagina: 'thuis.html',
      plek: 'klaar',
      id: 'klaar',
      doel: null,
      klaar: true,
    },
  ];
  const STOPS = ALLE_STOPS.filter((s) => !s.alleenInHA || (global.app.inHA() && global.app.volledigGekozen()));

  const pagina = () => location.pathname.split('/').pop() || 'thuis.html';
  const lees = (opslag, sleutel) => {
    try {
      return opslag.getItem(sleutel);
    } catch {
      return null;
    }
  };
  const schrijf = (opslag, sleutel, waarde) => {
    try {
      if (waarde == null) opslag.removeItem(sleutel);
      else opslag.setItem(sleutel, waarde);
    } catch {
      // Dan alleen nu.
    }
  };
  const gezien = () => lees(localStorage, GEZIEN) === '1';

  /** Waar het licht op valt: alle elementen samen, als één vlak op het scherm. */
  function vlak(stop) {
    if (!stop.doel) return null;
    const tel = document.documentElement.classList.contains('tel-stand');
    const els = [...document.querySelectorAll(stop.doel[tel ? 1 : 0])].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const gekozen = stop.eerste ? els.slice(0, 1) : els;
    if (!gekozen.length) return null;
    const rs = gekozen.map((e) => e.getBoundingClientRect());
    const pad = 8;
    const left = Math.max(4, Math.min(...rs.map((r) => r.left)) - pad);
    const top = Math.max(4, Math.min(...rs.map((r) => r.top)) - pad);
    const right = Math.min(innerWidth - 4, Math.max(...rs.map((r) => r.right)) + pad);
    const bottom = Math.min(innerHeight - 4, Math.max(...rs.map((r) => r.bottom)) + pad);
    return { left, top, width: right - left, height: bottom - top };
  }

  const STIJL = `
    .rl-gat { position: fixed; z-index: 70; border-radius: 22px; box-shadow: 0 0 0 9999px rgba(4, 8, 16, 0.66), 0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 34px rgba(111, 211, 255, 0.55); pointer-events: none; transition: all 0.35s ease; }
    .rl-gat.leeg { left: 50% !important; top: 50% !important; width: 0 !important; height: 0 !important; box-shadow: 0 0 0 9999px rgba(4, 8, 16, 0.72); }
    .rl-kaart { position: fixed; z-index: 71; width: 340px; padding: 20px 22px; border-radius: 22px; background: #f2f6f9; color: #0b1424; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); transition: left 0.35s ease, top 0.35s ease; }
    .rl-kaart .plek { font-size: 12.5px; font-weight: 700; color: #5b6b7b; display: flex; align-items: center; gap: 8px; }
    .rl-kaart .plek b { width: 24px; height: 24px; border-radius: 50%; background: #0b1424; color: #fff; display: grid; place-items: center; font-size: 12px; }
    .rl-kaart h2 { font-family: var(--kop); font-weight: 600; font-size: 24px; line-height: 1.12; margin: 8px 0 0; }
    .rl-kaart p { margin: 8px 0 0; font-size: 15px; line-height: 1.45; color: #34414f; }
    .rl-kaart .onder { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
    .rl-kaart .stippen { display: flex; gap: 5px; }
    .rl-kaart .stippen i { width: 7px; height: 7px; border-radius: 50%; background: #c3ccd5; }
    .rl-kaart .stippen i.aan { background: #0b1424; width: 20px; border-radius: 4px; }
    .rl-kaart button { height: 40px; padding: 0 16px; border-radius: 12px; border: 0; background: #0b1424; color: #fff; font: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; }
    .rl-kaart button.licht { background: none; color: #34414f; padding: 0 6px; }
    .rl-kaart button:focus-visible { outline: 2px solid #0b1424; outline-offset: 2px; }
    html.tel-stand .rl-kaart { left: 12px !important; right: 12px; width: auto; }
    @media (prefers-reduced-motion: reduce) { .rl-gat, .rl-kaart { transition: none; } }
  `;

  let nu = -1;
  let gat = null;
  let kaart = null;

  function opruimen() {
    gat?.remove();
    kaart?.remove();
    gat = null;
    kaart = null;
    removeEventListener('resize', plaats);
    removeEventListener('keydown', toets);
  }

  function stop(klaar = true) {
    opruimen();
    nu = -1;
    schrijf(sessionStorage, WAAR, null);
    if (klaar) schrijf(localStorage, GEZIEN, '1');
  }

  function toets(e) {
    if (e.key === 'Escape') stop();
  }

  /** De kaart naast het licht: rechts als het past, anders links, anders eronder of erboven. */
  function plaats() {
    if (nu < 0 || !kaart) return;
    const s = STOPS[nu];
    const v = vlak(s);
    const tel = document.documentElement.classList.contains('tel-stand');
    if (!v) {
      gat.classList.add('leeg');
      kaart.style.left = `${Math.max(12, (innerWidth - kaart.offsetWidth) / 2)}px`;
      kaart.style.top = `${Math.max(12, (innerHeight - kaart.offsetHeight) / 2)}px`;
      return;
    }
    gat.classList.remove('leeg');
    Object.assign(gat.style, { left: `${v.left}px`, top: `${v.top}px`, width: `${v.width}px`, height: `${v.height}px` });
    const w = kaart.offsetWidth;
    const h = kaart.offsetHeight;
    let left;
    let top;
    if (tel) {
      left = 12;
      top = v.top + v.height + 14 + h < innerHeight ? v.top + v.height + 14 : Math.max(12, v.top - h - 14);
    } else if (v.left + v.width + 20 + w < innerWidth) {
      left = v.left + v.width + 20;
      top = v.top + v.height / 2 - h / 2;
    } else if (v.left - 20 - w > 0) {
      left = v.left - 20 - w;
      top = v.top + v.height / 2 - h / 2;
    } else {
      left = v.left + v.width / 2 - w / 2;
      top = v.top + v.height + 16 + h < innerHeight ? v.top + v.height + 16 : v.top - h - 16;
    }
    kaart.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, left))}px`;
    kaart.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, top))}px`;
  }

  function toon(i) {
    nu = i;
    schrijf(sessionStorage, WAAR, String(i));
    const s = STOPS[i];
    // Een andere pagina: daarheen, en daar verder.
    if (s.pagina !== pagina()) {
      opruimen();
      location.href = s.pagina;
      return;
    }
    if (!document.getElementById('rl-stijl')) {
      const st = document.createElement('style');
      st.id = 'rl-stijl';
      st.textContent = STIJL;
      document.head.append(st);
    }
    if (!gat) {
      gat = document.createElement('div');
      gat.className = 'rl-gat';
      document.body.append(gat);
      kaart = document.createElement('div');
      kaart.className = 'rl-kaart';
      kaart.setAttribute('role', 'dialog');
      kaart.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-rl-overslaan')) stop();
        else if (b.hasAttribute('data-rl-volgende')) toon(nu + 1);
        else if (b.hasAttribute('data-rl-klaar')) stop();
        else if (b.hasAttribute('data-rl-film')) {
          stop();
          void global.film?.speel({});
        }
      });
      document.body.append(kaart);
      addEventListener('resize', plaats);
      addEventListener('keydown', toets);
    }
    const genummerd = STOPS.length - 1;
    const stippen = STOPS.slice(0, genummerd).map((_, n) => `<i class="${n === i ? 'aan' : ''}"></i>`).join('');
    const t = global.t;
    kaart.setAttribute('aria-label', s.klaar ? t('rond.klaarLabel') : t('rond.stopLabel', { nr: i + 1, van: genummerd }));
    kaart.innerHTML = `<span class="plek">${s.klaar ? '' : `<b>${i + 1}</b>`}${esc(t(`rond.plek.${s.plek}`))}</span><h2>${esc(t(`rond.${s.id}.kop`))}</h2><p>${esc(t(`rond.${s.id}.tekst`))}</p>
      <div class="onder">${s.klaar
        ? `${global.film ? `<button type="button" class="licht" data-rl-film>${esc(t('rond.film'))}</button>` : '<span></span>'}<button type="button" data-rl-klaar>${esc(t('algemeen.klaar'))}</button>`
        : `<span class="stippen" aria-hidden="true">${stippen}</span><span><button type="button" class="licht" data-rl-overslaan>${esc(t('rond.overslaan'))}</button><button type="button" data-rl-volgende>${esc(t('rond.volgende'))}</button></span>`}</div>`;
    // Wat buiten beeld staat, eerst in beeld: in een kolom die scrolt, of op de telefoon.
    if (s.doel) {
      const tel = document.documentElement.classList.contains('tel-stand');
      document.querySelector(s.doel[tel ? 1 : 0].split(',')[0])?.scrollIntoView({ block: tel ? 'center' : 'nearest', behavior: 'instant' });
    }
    plaats();
    kaart.querySelector('[data-rl-volgende], [data-rl-klaar]')?.focus({ preventScroll: true });
  }

  /** Wachten tot er iets is om op te lichten, hooguit een paar seconden. */
  function zodraKlaar(i) {
    const begin = Date.now();
    const kijk = () => {
      const s = STOPS[i];
      if (!s.doel || vlak(s) || Date.now() - begin > 4000) toon(i);
      else setTimeout(kijk, 150);
    };
    setTimeout(kijk, 400);
  }

  /** Vanaf de eerste stop op deze pagina (de hulp op elke tab, besluit 187), of van het begin. */
  function start() {
    zodraKlaar(Math.max(0, STOPS.findIndex((s) => s.pagina === pagina())));
  }

  /*
   * Bij het laden: verder waar hij was, als deze pagina aan de beurt is; op Thuis
   * met #rondleiding vanaf het begin; en de eerste keer op Thuis vanzelf.
   */
  function bijLaden() {
    const waar = Number(lees(sessionStorage, WAAR));
    if (lees(sessionStorage, WAAR) != null && Number.isInteger(waar) && STOPS[waar]?.pagina === pagina()) return zodraKlaar(waar);
    if (pagina() !== 'thuis.html') return;
    if (location.hash === '#rondleiding') {
      history.replaceState(null, '', location.pathname);
      return zodraKlaar(0);
    }
    if (!gezien()) zodraKlaar(0);
  }

  global.rondleiding = { start, stop, STOPS, actief: () => nu >= 0 };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bijLaden);
  else bijLaden();
})(window);
