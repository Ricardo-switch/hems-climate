/*
 * Thuis naar eigen smaak (besluit 162, schetsen Thuis-Tel-Eigen en
 * Wand-Thuis-Eigen).
 *
 * Op de telefoon kies je zelf welke kaarten Thuis heeft en in welke volgorde,
 * en welke scènes en lampen in Favorieten staan; dat bewaart de dienst bij je
 * account. De wand is van iedereen: de hoofdgebruiker of een beheerder past
 * hem aan, met het potlood bovenin. Straks schuift er vanzelf bovenin bij.
 * De kaarten op de wand staan in een kolom die zelf schuift: zoveel kaarten
 * als je wilt (besluit 167; eerst waren het vier vakken).
 *
 * Aanpassen gebeurt op Thuis zelf: elke kaart krijgt een greep om te schuiven
 * en een oog om te verbergen, en op de wand bovenin "+ Kaart". Sleep je een
 * kaart naar de rand van de kolom, dan schuift de kolom mee. Favorieten
 * schakelen via dezelfde deuren als de knoppen in een kamer (`api/licht`,
 * `api/scene`).
 */
(function (global) {
  'use strict';

  const { $$, esc, haal, deur } = global.app;

  /** Zolang de dienst niets zegt: zoals Thuis altijd was. */
  const STANDAARD = {
    tel: { kaarten: ['kamers', 'favorieten', 'straks', 'apparaat', 'gevoel', 'vandaag'], favorieten: [], weergave: { eenvoudig: false, groteLetters: false, minderBeweging: false } },
    wand: { kaarten: ['vandaag', 'gevoel', 'apparaat'], favorieten: [], magAanpassen: false },
    maxFavorieten: 12,
  };
  const KORT = {
    kamers: 'De temperatuur en wat elke kamer doet',
    favorieten: 'Lampen, scènes en screens met één tik',
    straks: 'Wat het huis gaat doen als er zon is',
    apparaat: 'Een apparaat dat draait of op zon wacht',
    gevoel: 'Te koud, goed of te warm; daar leert het huis van',
    vandaag: 'De zon van vandaag en wat er draaide',
    morgen: 'Het weer en de zon van morgen',
  };
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICOON = {
    kamers: S('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>'),
    favorieten: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
    straks: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    apparaat: S('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h2"/>'),
    gevoel: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>'),
    vandaag: S('<path d="M3 17c3-6 6-9 9-9s6 3 9 9"/><path d="M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6 17 7"/><path d="M3 21h18"/>'),
    morgen: S('<path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7.3 11.2 3.5 3.5 0 0 0 7 18z"/>'),
    lamp: S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    scene: S('<path d="M5 19l4-11 4 6 3-4 3 9z"/><circle cx="17" cy="6" r="1.6"/>'),
    screen: S('<path d="M4 4h16"/><path d="M5.5 4v9h13V4"/><path d="M5.5 7h13M5.5 10h13"/><path d="M12 13v3"/>'),
    zonnescherm: S('<path d="M3 6h18"/><path d="M4 6l2 7h12l2-7"/><path d="M6 13l-1 3M18 13l1 3"/>'),
    greep: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
    oog: S('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  };

  let v = STANDAARD;
  /** Kan er bewaard worden? Zonder logmap (503) staat Thuis zoals altijd. */
  let kan = false;
  let huis = null;
  /** Aan het aanpassen: 'tel' of 'wand', anders null. */
  let bewerk = null;
  let opnieuw = () => {};
  /** Wat er net getikt is: tot de dienst het weet, staat er wat je koos. */
  const gewenst = new Map();

  const plekNu = () => (global.app.telStand() ? 'tel' : 'wand');
  const box = (plek) => document.querySelector(`[data-kaarten="${plek}"]`);
  const kaartenIn = (plek) => [...box(plek).querySelectorAll(':scope > [data-kaart]')];
  const zichtbaar = (el) => el.getClientRects().length > 0;
  const deel = (plek) => (plek === 'tel' ? v.tel : v.wand);

  async function laad() {
    try {
      v = await haal('api/voorkeuren');
      kan = true;
      // De weergave (besluit 164) bij je account: ook hier bijhouden.
      if (v?.tel?.weergave) global.app.zetWeergave(v.tel.weergave);
      // Het thema en de kleur (besluit 181): op de wand wisselt de kleur mee met wiens comfort geldt.
      global.app.zetThema(v);
    } catch {
      v = STANDAARD;
      kan = false;
    }
  }

  async function bewaar(plek, wat) {
    if (!kan) return;
    // Meteen zo laten staan; de dienst bevestigt.
    v = { ...v, [plek]: { ...deel(plek), ...wat } };
    try {
      const res = await deur('api/voorkeuren', { plek, ...wat });
      if (res?.ok) v = await res.json();
      else if (res) await laad();
      if (wat.weergave) global.app.zetWeergave(v.tel.weergave);
    } catch {
      // De volgende keer.
    }
    opnieuw();
  }

  /* ------------------------------------------------------------ ordenen */

  /** De kaarten in de gekozen volgorde; wat niet gekozen is, staat er niet. */
  function orden(plek) {
    const b = box(plek);
    if (!b) return;
    const lijst = deel(plek).kaarten;
    const eind = b.querySelector(':scope > .aanpasrij, :scope > [data-vrijvak]');
    for (const id of lijst) {
      const k = b.querySelector(`:scope > [data-kaart="${id}"]`);
      if (k) b.insertBefore(k, eind);
    }
    for (const k of kaartenIn(plek)) k.toggleAttribute('data-uit', !lijst.includes(k.dataset.kaart));
  }

  /**
   * De kolom op de wand schuift zelf (besluit 167). Staat er meer onder de
   * rand, dan loopt de onderste kaart zacht weg: zo zie je dat er meer is.
   */
  function wandRuimte() {
    const b = box('wand');
    if (!b) return;
    const meer = () => b.classList.toggle('meer', b.scrollHeight > b.clientHeight + 2 && b.scrollTop + b.clientHeight < b.scrollHeight - 2);
    if (!b.dataset.meer) {
      b.dataset.meer = '1';
      b.addEventListener('scroll', meer, { passive: true });
      addEventListener('resize', meer);
    }
    meer();
    const vrij = b.querySelector('[data-vrijvak]');
    if (vrij) vrij.hidden = !(bewerk === 'wand' && kaartenIn('wand').some((k) => k.hasAttribute('data-uit')));
  }

  /* --------------------------------------------------------- favorieten */

  /*
   * Favorieten (21 oktober 2026, schets Wand-Favorieten): twaalf in plaats van
   * vier, vier per pagina; met de vinger schuif je naar de volgende vier, de
   * stipjes zeggen waar je bent. Ook screens en het zonnescherm. Elke lamp en
   * elk scherm heeft het icoon van zijn kamer en de naam van de kamer eronder:
   * twee plafonnières waren anders niet uit elkaar te houden. Een tik schakelt,
   * vasthouden opent het blad in de kamer.
   */
  const PER_PAGINA = 4;
  const ZON_IK = '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/>';

  /**
   * Elk apparaat van een soort, met zijn kamer: de naam, de id en het icoon. Staat
   * het in een zone van een open ruimte, dan die zone (21 oktober 2026): anders
   * stond bij elke plafonnière van een samengevoegde begane grond "Beneden".
   */
  function vanSoort(soort) {
    return (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((d) => d.soort === soort).map((d) => {
      const zone = d.zone ? (r.zones ?? []).find((z) => z.id === d.zone) : null;
      return { ...d, kamer: zone?.naam ?? r.naam, kamerId: r.id, kamerIk: r.buiten ? 'buiten' : zone?.soort ?? r.soort ?? 'kamer' };
    })));
  }
  const lampen = () => vanSoort('licht');
  const schermen = () => vanSoort('screen');
  function scenes() {
    const gezien = new Set();
    return (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.scenes ?? []).map((s) => ({ ...s, kamer: r.naam, kamerId: r.id })))).filter((s) => !gezien.has(s.id) && gezien.add(s.id));
  }
  /** Het icoon van de kamer, klein op het icoon van de lamp of het scherm. */
  function kamerIcoon(soort) {
    const d = soort === 'buiten' ? ZON_IK : global.huis?.KAMER_ICOON?.[soort] ?? global.huis?.KAMER_ICOON?.kamer;
    return d ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>` : '';
  }

  /** Staat een scherm nu open (een screen omhoog, een zonnescherm uitgevouwen)? Null als niemand het weet. */
  function schermOpen(d) {
    const zon = d.scherm?.zonnescherm === true;
    if (d.scherm?.terugmelding !== false) return zon ? !!d.aan : !d.aan;
    const laatste = d.scherm?.laatste;
    return laatste == null ? null : laatste === 'open';
  }

  function tegel(f) {
    const licht = huis?.lichtBedienen !== false;
    if (f.soort === 'scene') {
      const s = scenes().find((x) => x.id === f.id);
      if (!s) return '';
      const zin = gewenst.get(s.id) === 'gezet' ? 'Gezet' : s.kamer;
      return `<button type="button" class="tegel" data-tegel="${esc(s.id)}" data-soort="scene" ${licht ? '' : 'disabled'}><span class="ik">${ICOON.scene}</span><b>${esc(s.naam)}</b><span>${esc(zin)}</span></button>`;
    }
    if (f.soort === 'scherm') {
      const d = schermen().find((x) => x.id === f.id);
      if (!d) return '';
      const mag = huis?.schermenBedienen === true;
      const zin = gewenst.has(d.id) ? (gewenst.get(d.id) === 'open' ? (d.scherm?.zonnescherm ? 'vouwt uit' : 'gaat open') : d.scherm?.zonnescherm ? 'klapt in' : 'gaat dicht') : d.stand;
      return `<button type="button" class="tegel scherm" data-tegel="${esc(d.id)}" data-soort="scherm" data-kamer="${esc(d.kamerId)}" ${mag ? '' : 'disabled'}><span class="ik">${d.scherm?.zonnescherm ? ICOON.zonnescherm : ICOON.screen}<i class="kamer-ik">${kamerIcoon(d.kamerIk)}</i></span><b>${esc(d.naam)}</b><span>${esc(`${d.kamer} · ${zin}`)}</span></button>`;
    }
    const d = lampen().find((x) => x.id === f.id);
    if (!d) return '';
    const aan = gewenst.has(d.id) ? gewenst.get(d.id) : d.aan;
    const zin = aan ? (d.dimbaar && d.helderheidPct != null && !gewenst.has(d.id) ? `aan, ${d.helderheidPct}%` : 'aan') : 'uit';
    return `<button type="button" class="tegel" data-tegel="${esc(d.id)}" data-soort="lamp" data-kamer="${esc(d.kamerId)}" aria-pressed="${aan}" ${licht ? '' : 'disabled'}><span class="ik">${ICOON.lamp}<i class="kamer-ik">${kamerIcoon(d.kamerIk)}</i></span><b>${esc(d.naam)}</b><span>${esc(`${d.kamer} · ${zin}`)}</span></button>`;
  }

  /** De kaart Favorieten, op de telefoon en op de wand, elk met zijn eigen lijst. */
  function tekenFavorieten(nieuwHuis) {
    huis = nieuwHuis;
    const iets = lampen().length + scenes().length + schermen().length > 0;
    for (const plek of ['tel', 'wand']) {
      const kaart = box(plek)?.querySelector(':scope > [data-kaart="favorieten"]');
      if (!kaart) continue;
      const lijst = deel(plek).favorieten;
      const mag = plek === 'tel' ? kan : kan && v.wand.magAanpassen;
      const alle = lijst.map(tegel).filter(Boolean);
      const paginas = [];
      for (let i = 0; i < alle.length; i += PER_PAGINA) paginas.push(alle.slice(i, i + PER_PAGINA).join(''));
      const kies = mag && iets ? '<button type="button" class="favkies" data-fav-kies>Kies favorieten</button>' : '';
      const stipjes = paginas.length > 1 ? `<div class="stipjes" data-stipjes aria-hidden="true">${paginas.map((_, i) => `<i class="${i === 0 ? 'aan' : ''}"></i>`).join('')}</div>` : '';
      const html = alle.length
        ? `<div class="favpaginas" data-favpaginas>${paginas.map((p) => `<div class="tegels favpagina">${p}</div>`).join('')}</div>${stipjes}${kies}`
        : mag && iets
          ? '<div class="favleeg"><p class="mini">Zet hier lampen, scènes en screens die je vaak gebruikt.</p><button type="button" data-fav-kies>Kiezen</button></div>'
          : '';
      // Zonder lampen, scènes of screens, of op de wand zonder keuze en zonder recht: niets te tonen.
      kaart.hidden = !html;
      const plekje = kaart.querySelector('[data-favorieten]');
      if (plekje.dataset.html !== html) {
        // Op dezelfde pagina blijven als er iets verandert.
        const was = plekje.querySelector('[data-favpaginas]')?.scrollLeft ?? 0;
        plekje.innerHTML = html;
        plekje.dataset.html = html;
        const strook = plekje.querySelector('[data-favpaginas]');
        if (strook) {
          strook.scrollLeft = was;
          strook.addEventListener('scroll', () => stipjesBij(strook), { passive: true });
          stipjesBij(strook);
        }
      }
      const uitleg = kaart.querySelector('[data-fav-uitleg]');
      if (uitleg) uitleg.textContent = !alle.length ? '' : paginas.length > 1 ? 'Schuif voor meer' : 'Tik om te schakelen';
    }
  }
  /** Welke pagina in beeld is. */
  function stipjesBij(strook) {
    const i = Math.round(strook.scrollLeft / Math.max(1, strook.clientWidth));
    strook.parentElement.querySelectorAll('[data-stipjes] i').forEach((s, j) => s.classList.toggle('aan', j === i));
  }

  async function schakel(knop) {
    const id = knop.dataset.tegel;
    if (knop.dataset.soort === 'scene') {
      gewenst.set(id, 'gezet');
      tekenFavorieten(huis);
      await deur('api/scene', { id }).catch(() => null);
      setTimeout(() => {
        gewenst.delete(id);
        opnieuw(true);
      }, 2500);
      return;
    }
    if (knop.dataset.soort === 'scherm') {
      // Open wordt dicht en andersom; weet niemand hoe hij staat, dan dicht (besluit 121).
      const d = schermen().find((x) => x.id === id);
      const actie = d && schermOpen(d) === false ? 'open' : 'dicht';
      gewenst.set(id, actie);
      tekenFavorieten(huis);
      await deur('api/scherm', { id, actie }).catch(() => null);
      for (const t of [1500, 5000]) setTimeout(() => opnieuw(true), t);
      setTimeout(() => {
        gewenst.delete(id);
        opnieuw(true);
      }, 20000);
      return;
    }
    const aan = knop.getAttribute('aria-pressed') !== 'true';
    gewenst.set(id, aan);
    tekenFavorieten(huis);
    await deur('api/licht', { doel: 'lamp', id, aan }).catch(() => null);
    // Even wachten tot Home Assistant de nieuwe stand doorgeeft; tot dan staat er wat je koos.
    for (const t of [800, 2500]) setTimeout(() => opnieuw(true), t);
    setTimeout(() => {
      gewenst.delete(id);
      opnieuw(true);
    }, 6000);
  }

  /** Vasthouden opent het blad van de lamp of het scherm in zijn kamer. */
  let vast = null;
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest?.('[data-tegel][data-kamer]');
    if (!t || bewerk || t.disabled) return;
    const x = e.clientX;
    const y = e.clientY;
    const stop = () => {
      clearTimeout(vast?.timer);
      removeEventListener('pointermove', beweegt);
    };
    const beweegt = (m) => Math.hypot(m.clientX - x, m.clientY - y) > 10 && stop();
    addEventListener('pointermove', beweegt, { passive: true });
    addEventListener('pointerup', stop, { once: true });
    addEventListener('pointercancel', stop, { once: true });
    vast = {
      tegel: t,
      timer: setTimeout(() => {
        vast.gedaan = true;
        removeEventListener('pointermove', beweegt);
        location.href = `kamer.html#${encodeURIComponent(t.dataset.kamer)}/${encodeURIComponent(t.dataset.tegel)}`;
      }, 550),
      gedaan: false,
    };
  });
  addEventListener('contextmenu', (e) => e.target.closest?.('[data-tegel]') && e.preventDefault());

  /* ------------------------------------------------------- de bewerkstand */

  /** Een greep en een oog op elke kaart; de greep is alleen een icoon (besluit 167). */
  function zetKnoppen() {
    for (const k of $$('[data-kaarten] > [data-kaart]')) {
      if (k.querySelector(':scope > .kaartgreep')) continue;
      const naam = k.dataset.naam ?? k.dataset.kaart;
      k.insertAdjacentHTML(
        'afterbegin',
        `<span class="kaartgreep" data-greep role="button" tabindex="0" aria-label="Schuif ${esc(naam)}; of met de pijltjes op het toetsenbord">${ICOON.greep}</span><span class="kaartoog" data-oog role="button" tabindex="0" aria-label="Verberg ${esc(naam)}">${ICOON.oog}</span>`,
      );
    }
  }

  function wandVanWie() {
    const esc = global.app.esc;
    if (v.wand.van == null) return 'Je past de wand aan <b>voor iedereen in huis</b>';
    if (v.wand.eigen) return 'Je past <b>jouw Thuis</b> aan, ook op je telefoon';
    return `Je past Thuis aan <b>van ${esc(v.wand.naam ?? 'wie er geldt')}</b>, ook op diens telefoon`;
  }

  function begin(plek) {
    if (!kan || (plek === 'wand' && !v.wand.magAanpassen)) return;
    bewerk = plek;
    zetKnoppen();
    document.body.classList.add('aanpassen');
    $$('[data-bewerkbalk], [data-bewerkkop]').forEach((el) => (el.hidden = false));
    // Van wie de wand is (besluit 181): één indeling per bewoner, dus wat je hier verandert, staat ook op diens telefoon.
    $$('[data-bewerkwie]').forEach((el) => (el.innerHTML = wandVanWie()));
    na();
    // Naar de kaarten, met ruimte erboven om een kaart helemaal naar boven te schuiven.
    const eerste = plek === 'tel' ? box('tel').querySelector(':scope > [data-kaart]:not([data-uit])') : null;
    if (eerste) scrollTo(0, Math.max(0, eerste.getBoundingClientRect().top + scrollY - 130));
  }

  function klaar() {
    if (!bewerk) return;
    bewerk = null;
    sluitBlad();
    document.body.classList.remove('aanpassen');
    $$('[data-bewerkbalk], [data-bewerkkop]').forEach((el) => (el.hidden = true));
    opnieuw();
  }

  /** De volgorde zoals hij nu in beeld staat. */
  function volgorde(plek) {
    return kaartenIn(plek).filter((k) => !k.hasAttribute('data-uit')).map((k) => k.dataset.kaart);
  }

  function verberg(kaart) {
    const plek = kaart.closest('#wand') ? 'wand' : 'tel';
    kaart.setAttribute('data-uit', '');
    void bewaar(plek, { kaarten: volgorde(plek) });
    na();
  }

  /** Met de pijltjes op het toetsenbord, op de greep: één plek omhoog of omlaag. */
  function schuifMetToets(kaart, richting, focus = '[data-greep]') {
    const plek = kaart.closest('#wand') ? 'wand' : 'tel';
    const rij = kaartenIn(plek).filter((k) => !k.hasAttribute('data-uit'));
    const i = rij.indexOf(kaart);
    const j = i + richting;
    if (j < 0 || j >= rij.length) return;
    if (richting < 0) rij[j].before(kaart);
    else rij[j].after(kaart);
    kaart.querySelector(focus)?.focus();
    void bewaar(plek, { kaarten: volgorde(plek) });
  }

  /** Schuiven aan de greep, met de vinger of de muis. */
  function sleep(e) {
    const greep = e.target.closest('[data-greep]');
    if (!greep || !bewerk || e.button > 0) return;
    e.preventDefault();
    const kaart = greep.closest('[data-kaart]');
    const plek = kaart.closest('#wand') ? 'wand' : 'tel';
    const b = kaart.parentElement;
    // Op de wand is alles geschaald: de vinger beweegt in schermpunten.
    const schaal = kaart.getBoundingClientRect().height / (kaart.offsetHeight || 1) || 1;
    let vanY = e.clientY;
    try {
      greep.setPointerCapture(e.pointerId);
    } catch {
      // Dan volgen we de vinger via het document.
    }
    kaart.classList.add('sleept');
    const beweeg = (ev) => {
      // Op de telefoon schuift de pagina mee bij de rand, boven de balken onderin.
      if (plek === 'tel') {
        const was = scrollY;
        if (ev.clientY < 90) scrollBy(0, -14);
        else if (ev.clientY > innerHeight - 170) scrollBy(0, 14);
        vanY -= scrollY - was;
      } else {
        // Op de wand schuift de kolom mee bij zijn rand.
        const rand = b.getBoundingClientRect();
        const was = b.scrollTop;
        if (ev.clientY < rand.top + 50 * schaal) b.scrollTop -= 12;
        else if (ev.clientY > rand.bottom - 60 * schaal) b.scrollTop += 12;
        vanY -= (b.scrollTop - was) * schaal;
      }
      const dy = ev.clientY - vanY;
      kaart.style.transform = `translateY(${dy / schaal}px)`;
      const r = kaart.getBoundingClientRect();
      // De vinger zit aan de greep, bovenaan de kaart: waar hij is, komt de kaart.
      const midden = ev.clientY;
      const andere = kaartenIn(plek).filter((k) => k !== kaart && !k.hasAttribute('data-uit') && zichtbaar(k));
      const voor = andere.find((k) => {
        const q = k.getBoundingClientRect();
        return midden < q.top + q.height / 2;
      });
      const nu = andere.filter((k) => k.compareDocumentPosition(kaart) & Node.DOCUMENT_POSITION_FOLLOWING).length;
      const straks = voor ? andere.indexOf(voor) : andere.length;
      if (straks === nu) return;
      const was = r.top;
      b.insertBefore(kaart, voor ?? b.querySelector(':scope > .aanpasrij, :scope > [data-vrijvak]'));
      kaart.style.transform = '';
      const basis = kaart.getBoundingClientRect().top;
      vanY = ev.clientY - (was - basis);
      kaart.style.transform = `translateY(${(was - basis) / schaal}px)`;
    };
    const los = () => {
      document.removeEventListener('pointermove', beweeg);
      document.removeEventListener('pointerup', los);
      document.removeEventListener('pointercancel', los);
      kaart.classList.remove('sleept');
      kaart.style.transform = '';
      void bewaar(plek, { kaarten: volgorde(plek) });
    };
    document.addEventListener('pointermove', beweeg);
    document.addEventListener('pointerup', los);
    document.addEventListener('pointercancel', los);
  }

  /* ----------------------------------------------------------- de bladen */

  let blad = null;

  function openBlad(soort, plek) {
    blad = { soort, plek, keuze: soort === 'favorieten' ? [...deel(plek).favorieten] : null, open: new Set() };

    // Het blad van Thuis zelf (de stand, wie er thuis is) is dit niet meer.
    delete document.querySelector('[data-kiesblad]').dataset.blad;
    tekenBlad();
    document.querySelector('[data-kies-achter]').hidden = false;
    const el = document.querySelector('[data-kiesblad]');
    el.hidden = false;
    el.querySelector('button')?.focus();
  }

  function sluitBlad() {
    blad = null;
    $$('[data-kiesblad], [data-kies-achter]').forEach((el) => (el.hidden = true));
  }

  function keus({ ik, naam, klein, rechts, data, aan, uit }) {
    const vink = aan == null ? '' : `role="switch" aria-checked="${aan}"`;
    return `<button type="button" class="keus" ${data} ${vink} ${uit ? 'disabled' : ''}><span class="ik">${ik}</span><b>${esc(naam)}</b><span class="rechts-ik" aria-hidden="true">${rechts}</span><small>${esc(klein)}</small></button>`;
  }

  function tekenBlad() {
    const el = document.querySelector('[data-kiesblad]');
    if (!blad || !el) return;
    const { soort, plek } = blad;
    if (soort === 'weergave') return tekenWeergave(el);
    if (soort === 'erbij') {
      // Welke kaarten er nog niet staan, met wat ze laten zien.
      const weg = kaartenIn(plek).filter((k) => k.hasAttribute('data-uit'));
      const rijen = weg.map((k) => {
        const id = k.dataset.kaart;
        return keus({ ik: ICOON[id] ?? '', naam: k.dataset.naam ?? id, klein: KORT[id] ?? '', rechts: '+', data: `data-erbij="${esc(id)}"` });
      });
      el.setAttribute('aria-label', 'Kaart toevoegen');
      el.innerHTML = `<div class="bladkop"><h2 class="kop-2">${plek === 'wand' ? 'Wat komt erbij?' : 'Kaart toevoegen'}</h2><button type="button" class="knop" data-blad-dicht>Sluit</button></div>
        ${plek === 'wand' ? '<p class="mini" style="margin: 0">Een nieuwe kaart komt onderaan. Passen ze niet allemaal, dan schuif je de kolom met een vinger.</p>' : ''}
        ${rijen.length ? rijen.join('') : '<p class="mini">Alle kaarten staan er al.</p>'}`;
      return;
    }
    /*
     * Favorieten kiezen (besluit 168, 21 oktober 2026): bovenaan wat je koos,
     * op volgorde, om te verslepen; daaronder per kamer, met het icoon van de
     * kamer, de lampen en screens eerst en de scènes ingeklapt. Een filter
     * toont alleen lampen, scènes of screens. Hooguit twaalf.
     */
    const gekozen = blad.keuze;
    const vol = gekozen.length >= v.maxFavorieten;
    const filter = blad.filter ?? 'alles';
    const rij = (soortF, x, ik, klein = '') => {
      const aan = gekozen.some((f) => f.id === x.id);
      return keus({ ik, naam: x.naam, klein, rechts: aan ? '✓' : '', data: `data-fav="${esc(x.id)}" data-fav-soort="${soortF}"`, aan, uit: vol && !aan });
    };
    const klein = (d) => (d.soort === 'screen' ? (d.scherm?.zonnescherm ? 'Zonnescherm' : 'Screen') + (d.scherm?.standKiezen ? ', met stand' : d.scherm?.terugmelding === false ? ', open, dicht en stop' : '') : `Lamp${d.kleur ? ', kleur' : d.dimbaar ? ', dimbaar' : ''}`);
    el.setAttribute('aria-label', 'Favorieten kiezen');
    const kamers = perKamer();
    const tel = (wat) => kamers.reduce((n, k) => n + k[wat].length, 0);
    const naamVan = (f) => {
      const k = kamers.find((x) => [...x.lampen, ...x.schermen, ...x.scenes].some((d) => d.id === f.id));
      const d = k && [...k.lampen, ...k.schermen, ...k.scenes].find((x) => x.id === f.id);
      return d ? { naam: d.naam, kamer: f.soort === 'scene' ? '' : k.naam } : null;
    };
    /*
     * De gekozen favorieten zoals op de kaart (21 oktober 2026): dezelfde
     * tegels, met hun plek en een greep om te schuiven. Een tik op een tegel
     * schakelt hier niets; het blad is om te kiezen en te ordenen.
     */
    const chips = gekozen
      .map((f, i) => {
        const n = naamVan(f);
        const t = n ? tegel(f) : '';
        return t ? `<div class="favvoorbeeld" data-favchip="${esc(f.id)}" tabindex="0" aria-label="${esc(`${i + 1}: ${n.naam}${n.kamer ? ` in ${n.kamer}` : ''}; schuif met de greep, of met de pijltjes`)}"><i class="favnr" aria-hidden="true">${i + 1}</i><div class="favtegel" inert>${t}</div><span class="favgreep" data-favgreep aria-hidden="true">${ICOON.greep}</span></div>` : '';
      })
      .join('');
    const knop = (id, label, n) => `<button type="button" data-fav-filter="${id}" aria-pressed="${filter === id}">${label}${n == null ? '' : `<i>${n}</i>`}</button>`;
    const filters = `<div class="favfilter" role="group" aria-label="Wat je ziet">${knop('alles', 'Alles')}${tel('lampen') ? knop('lamp', 'Lampen', tel('lampen')) : ''}${tel('scenes') ? knop('scene', 'Scènes', tel('scenes')) : ''}${tel('schermen') ? knop('scherm', 'Screens', tel('schermen')) : ''}</div>`;
    const ruimtes = kamers
      .map((k) => {
        const lamp = filter === 'alles' || filter === 'lamp' ? k.lampen.map((d) => rij('lamp', d, ICOON.lamp, klein(d))).join('') : '';
        const scherm = filter === 'alles' || filter === 'scherm' ? k.schermen.map((d) => rij('scherm', d, d.scherm?.zonnescherm ? ICOON.zonnescherm : ICOON.screen, klein(d))).join('') : '';
        let sc = '';
        if (k.scenes.length && filter === 'scene') sc = k.scenes.map((s) => rij('scene', s, ICOON.scene, 'Scène')).join('');
        else if (k.scenes.length && filter === 'alles') {
          // Open als je er al een koos, of als je hem net openklapte.
          const open = blad.open.has(k.id) || k.scenes.some((s) => gekozen.some((f) => f.id === s.id));
          sc = `<details class="favscenes" data-fav-kamer="${esc(k.id)}" ${open ? 'open' : ''}><summary>Scènes (${k.scenes.length})</summary>${k.scenes.map((s) => rij('scene', s, ICOON.scene, 'Scène')).join('')}</details>`;
        }
        return lamp || scherm || sc ? `<h3 class="favkamer"><span aria-hidden="true">${kamerIcoon(k.ik)}</span>${esc(k.naam)}</h3>${lamp}${scherm}${sc}` : '';
      })
      .join('');
    el.innerHTML = `<div class="bladkop"><h2 class="kop-2">Favorieten</h2><button type="button" class="knop knop-licht" data-fav-klaar>Klaar</button></div>
      <p class="mini" style="margin: 0" data-fav-teller>${gekozen.length} van ${v.maxFavorieten} gekozen, vier per pagina.${plek === 'wand' ? (v.wand.van == null ? ' Voor de wand, voor iedereen.' : v.wand.eigen ? ' Ook op je telefoon.' : ` Van ${global.app.esc(v.wand.naam ?? 'wie er geldt')}, ook op diens telefoon.`) : ' Ze staan met één tik op Thuis.'}${gekozen.length > 1 ? ' Schuif met de greep om de volgorde te veranderen.' : ''}</p>
      ${chips ? `<div class="favchips tegels" data-favchips>${chips}</div>` : ''}
      ${filters}
      ${ruimtes}`;
  }

  /** De lampen, screens en scènes per kamer, in de volgorde van het huis; dezelfde scènenaam in een kamer één keer. */
  function perKamer() {
    const gezien = new Set();
    const uit = [];
    for (const e of huis?.etages ?? []) {
      for (const r of e.ruimtes ?? []) {
        const lampenHier = (r.apparaten ?? []).filter((d) => d.soort === 'licht');
        const schermenHier = (r.apparaten ?? []).filter((d) => d.soort === 'screen');
        const namen = new Set();
        const scenesHier = (r.scenes ?? [])
          .filter((s) => !gezien.has(s.id) && gezien.add(s.id))
          .filter((s) => !namen.has(s.naam.toLowerCase()) && namen.add(s.naam.toLowerCase()))
          .sort((a, b) => (b.gebruiktMs ?? 0) - (a.gebruiktMs ?? 0));
        if (lampenHier.length || schermenHier.length || scenesHier.length) uit.push({ id: r.id, naam: r.naam, ik: r.buiten ? 'buiten' : r.soort ?? 'kamer', lampen: lampenHier, schermen: schermenHier, scenes: scenesHier });
      }
    }
    return uit;
  }

  /*
   * De volgorde van de gekozen favorieten: een tegel aan zijn greep slepen
   * (21 oktober 2026; eerst een chip, overal vast te pakken, zodat het blad niet
   * meer scrolde onder de vinger). Tijdens het slepen schuiven alleen de tegels;
   * bij loslaten neemt het blad de nieuwe volgorde over.
   */
  document.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest?.('[data-favgreep]')?.closest('[data-favchip]');
    if (!chip || blad?.soort !== 'favorieten') return;
    const rij = chip.parentElement;
    e.preventDefault();
    chip.classList.add('sleept');
    const beweeg = (m) => {
      const onder = document.elementFromPoint(m.clientX, m.clientY)?.closest?.('[data-favchip]');
      if (!onder || onder === chip || onder.parentElement !== rij) return;
      const alle = [...rij.children];
      // In een raster: naar voren geschoven komt hij ervoor, naar achteren erna.
      rij.insertBefore(chip, alle.indexOf(chip) > alle.indexOf(onder) ? onder : onder.nextSibling);
    };
    const los = () => {
      removeEventListener('pointermove', beweeg);
      chip.classList.remove('sleept');
      const ids = [...rij.querySelectorAll('[data-favchip]')].map((c) => c.dataset.favchip);
      blad.keuze.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      tekenBlad();
    };
    addEventListener('pointermove', beweeg);
    addEventListener('pointerup', los, { once: true });
    addEventListener('pointercancel', los, { once: true });
  });
  // Met het toetsenbord: de pijltjes verplaatsen een tegel, links en rechts één plek, op en neer een rij.
  const STAP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 };
  document.addEventListener('keydown', (e) => {
    const chip = e.target.closest?.('[data-favchip]');
    if (!chip || blad?.soort !== 'favorieten' || !(e.key in STAP)) return;
    e.preventDefault();
    const i = blad.keuze.findIndex((f) => f.id === chip.dataset.favchip);
    const j = i + STAP[e.key];
    if (i < 0 || j < 0 || j >= blad.keuze.length) return;
    [blad.keuze[i], blad.keuze[j]] = [blad.keuze[j], blad.keuze[i]];
    tekenBlad();
    document.querySelector(`[data-favchip="${CSS.escape(chip.dataset.favchip)}"]`)?.focus();
  });

  /*
   * Weergave (besluit 164, schets Thuis-Tel-Eigen #weergave): eenvoudig of
   * uitgebreid, grotere letters en minder beweging. Voor jou, op elk scherm.
   */
  function tekenWeergave(el) {
    const w = v.tel.weergave ?? STANDAARD.tel.weergave;
    const keuze = (eenvoudig, naam, zin, tel) => `<button type="button" role="radio" aria-checked="${w.eenvoudig === eenvoudig}" data-wg-eenvoudig="${eenvoudig}"><span class="mini-tel" aria-hidden="true">${tel}</span><b>${naam}</b><p>${zin}</p></button>`;
    const schakel = (id, naam, zin) => `<button type="button" class="schakel" role="switch" aria-checked="${!!w[id]}" data-wg-schakel="${id}"><div><b>${naam}</b><span>${zin}</span></div><span class="knopje" aria-hidden="true"></span></button>`;
    el.setAttribute('aria-label', 'Weergave');
    el.innerHTML = `<div class="bladkop"><h2 class="kop-2">Weergave</h2><button type="button" class="knop knop-licht" data-blad-dicht>Klaar</button></div>
      <p class="mini" style="margin: 0">Voor jou, op elk scherm waar je inlogt.${global.app.telStand() ? '' : ' Op de wand geldt alleen minder beweging.'}</p>
      <div class="twee" role="radiogroup" aria-label="Eenvoudig of uitgebreid">
        ${keuze(true, 'Eenvoudig', 'De temperatuur en wat het huis doet, in zinnen. Minder getallen.', '<i style="width: 70%; height: 10px; background: rgb(var(--wit) / 0.45)"></i><i style="width: 92%; height: 8px"></i><i style="width: 60%; height: 8px"></i>')}
        ${keuze(false, 'Uitgebreid', 'Alles: kW op het huis, de grafiek van vandaag en de apparaten.', '<i style="width: 60%; height: 7px; background: rgb(var(--wit) / 0.45)"></i><i style="width: 90%"></i><i style="width: 80%"></i><i style="width: 45%; background: rgba(247,181,72,0.55)"></i><i style="width: 70%"></i>')}
      </div>
      <div style="margin-top: 10px">${schakel('groteLetters', 'Grotere letters', 'Alle tekst een maat groter')}${schakel('minderBeweging', 'Minder beweging', 'Geen lopende stromen en geen ademende bol')}</div>`;
  }

  /* --------------------------------------------------------------- tikken */

  document.addEventListener(
    'click',
    (e) => {
      // In de bewerkstand doen de kaarten zelf niets: geen links, geen lampen. De greep en het oog wel.
      if (!bewerk || !e.target.closest('[data-kaarten] > [data-kaart]')) return;
      e.preventDefault();
      if (!e.target.closest('[data-greep], [data-oog], [data-fav-kies]')) e.stopPropagation();
    },
    true,
  );

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-aanpassen]')) return begin(plekNu());
    if (t.closest('[data-weergave]')) return openBlad('weergave', 'tel');
    const wg = t.closest('[data-wg-eenvoudig], [data-wg-schakel]');
    if (wg && blad?.soort === 'weergave') {
      const nu = v.tel.weergave ?? STANDAARD.tel.weergave;
      const wat = wg.dataset.wgSchakel ? { [wg.dataset.wgSchakel]: !nu[wg.dataset.wgSchakel] } : { eenvoudig: wg.dataset.wgEenvoudig === 'true' };
      const nieuw = { ...nu, ...wat };
      // Meteen zo laten zien; de dienst bewaart het bij je account.
      global.app.zetWeergave(nieuw);
      void bewaar('tel', { weergave: nieuw });
      tekenBlad();
      const sel = wg.dataset.wgSchakel ? `[data-wg-schakel="${wg.dataset.wgSchakel}"]` : `[data-wg-eenvoudig="${wg.dataset.wgEenvoudig}"]`;
      document.querySelector(`[data-kiesblad] ${sel}`)?.focus();
      return;
    }
    if (t.closest('[data-klaar]')) return klaar();
    if (t.closest('[data-kaart-erbij]')) return openBlad('erbij', bewerk ?? plekNu());
    if (t.closest('[data-vrijvak]')) return openBlad('erbij', 'wand');
    if (t.closest('[data-blad-dicht]') || t.closest('[data-kies-achter]')) return sluitBlad();
    const oog = t.closest('[data-oog]');
    if (oog && bewerk) return verberg(oog.closest('[data-kaart]'));
    const kies = t.closest('[data-fav-kies]');
    if (kies) return openBlad('favorieten', kies.closest('#wand') ? 'wand' : 'tel');
    const erbij = t.closest('[data-erbij]');
    if (erbij && blad) {
      const plek = blad.plek;
      const id = erbij.dataset.erbij;
      const k = box(plek).querySelector(`:scope > [data-kaart="${id}"]`);
      k?.removeAttribute('data-uit');
      sluitBlad();
      const kaarten = [...volgorde(plek).filter((x) => x !== id), id];
      void bewaar(plek, { kaarten });
      na();
      k?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const filterKnop = t.closest('[data-fav-filter]');
    if (filterKnop && blad?.soort === 'favorieten') {
      blad.filter = filterKnop.dataset.favFilter;
      tekenBlad();
      document.querySelector(`[data-kiesblad] [data-fav-filter="${blad.filter}"]`)?.focus();
      return;
    }
    const fav = t.closest('[data-fav]');
    if (fav && blad?.soort === 'favorieten') {
      const id = fav.dataset.fav;
      const i = blad.keuze.findIndex((f) => f.id === id);
      if (i >= 0) blad.keuze.splice(i, 1);
      else if (blad.keuze.length < v.maxFavorieten) blad.keuze.push({ soort: fav.dataset.favSoort, id });
      tekenBlad();
      document.querySelector(`[data-kiesblad] [data-fav="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    if (t.closest('[data-fav-klaar]') && blad) {
      const { plek, keuze } = blad;
      sluitBlad();
      // Wie favorieten kiest, wil ze ook zien.
      const kaarten = deel(plek).kaarten.includes('favorieten') ? deel(plek).kaarten : [...deel(plek).kaarten, 'favorieten'];
      void bewaar(plek, { favorieten: keuze, kaarten });
      return;
    }
    const tegelKnop = t.closest('[data-tegel]');
    // Net vastgehouden: dan opent de kamer, en schakelt er niets.
    if (tegelKnop && vast?.gedaan && vast.tegel === tegelKnop) return void (vast = null);
    if (tegelKnop && !bewerk) void schakel(tegelKnop);
  });

  // Een kamer met scènes die je openklapt, blijft open als het blad opnieuw tekent (besluit 168).
  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target.closest?.('[data-fav-kamer]');
      if (!d || blad?.soort !== 'favorieten') return;
      if (d.open) blad.open.add(d.dataset.favKamer);
      else blad.open.delete(d.dataset.favKamer);
    },
    true,
  );
    document.addEventListener('pointerdown', sleep);
  document.addEventListener('keydown', (e) => {
    const greep = e.target.closest?.('[data-greep]');
    if (greep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      schuifMetToets(greep.closest('[data-kaart]'), e.key === 'ArrowUp' ? -1 : 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-oog]')) {
      e.preventDefault();
      verberg(e.target.closest('[data-kaart]'));
    } else if (e.key === 'Escape') {
      if (blad) sluitBlad();
      else klaar();
    }
  });
  addEventListener('standwissel', () => klaar());

  /** Na elke keer tekenen: de volgorde, of er meer onder de rand staat, en wie mag aanpassen. */

  function na() {
    // Niet terugzetten terwijl er geschoven wordt.
    if (document.querySelector('[data-kaart].sleept')) return;
    orden('tel');
    orden('wand');
    wandRuimte();
    $$('#wand [data-aanpassen]').forEach((el) => (el.hidden = !(kan && v.wand.magAanpassen)));
    $$('#tel [data-aanpassen], #tel [data-weergave]').forEach((el) => (el.hidden = !kan));
  }

  /** Uit Instellingen › Weergave: thuis.html#weergave opent het blad. */
  function vanInstellingen() {
    if (location.hash !== '#weergave' || !kan) return;
    history.replaceState(null, '', location.pathname);
    openBlad('weergave', 'tel');
  }

  global.eigen = {
    laad,
    vanInstellingen,
    na,
    tekenFavorieten,
    /** Wat thuis.js doet als er iets veranderde; `huisOok` haalt ook het huis opnieuw. */
    bij: (fn) => (opnieuw = fn),
    get bewerkt() {
      return bewerk;
    },
  };
})(window);
