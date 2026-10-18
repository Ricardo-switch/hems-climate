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
    maxFavorieten: 4,
  };
  const KORT = {
    kamers: 'De temperatuur en wat elke kamer doet',
    favorieten: 'Scènes en lampen met één tik',
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

  function lampen() {
    return (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((d) => d.soort === 'licht').map((d) => ({ ...d, kamer: r.naam }))));
  }
  function scenes() {
    const gezien = new Set();
    return (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.scenes ?? []).map((s) => ({ ...s, kamer: r.naam })))).filter((s) => !gezien.has(s.id) && gezien.add(s.id));
  }

  function tegel(f) {
    const mag = huis?.lichtBedienen !== false;
    if (f.soort === 'scene') {
      const s = scenes().find((x) => x.id === f.id);
      if (!s) return '';
      const zin = gewenst.get(s.id) === 'gezet' ? 'Gezet' : s.kamer;
      return `<button type="button" class="tegel" data-tegel="${esc(s.id)}" data-soort="scene" ${mag ? '' : 'disabled'}><span class="ik">${ICOON.scene}</span><b>${esc(s.naam)}</b><span>${esc(zin)}</span></button>`;
    }
    const d = lampen().find((x) => x.id === f.id);
    if (!d) return '';
    const aan = gewenst.has(d.id) ? gewenst.get(d.id) : d.aan;
    const zin = aan ? (d.dimbaar && d.helderheidPct != null && !gewenst.has(d.id) ? `Aan, ${d.helderheidPct}%` : 'Aan') : 'Uit';
    return `<button type="button" class="tegel" data-tegel="${esc(d.id)}" data-soort="lamp" aria-pressed="${aan}" ${mag ? '' : 'disabled'}><span class="ik">${ICOON.lamp}</span><b>${esc(d.naam)}</b><span>${esc(zin)}</span></button>`;
  }

  /** De kaart Favorieten, op de telefoon en op de wand, elk met zijn eigen lijst. */
  function tekenFavorieten(nieuwHuis) {
    huis = nieuwHuis;
    const iets = lampen().length + scenes().length > 0;
    for (const plek of ['tel', 'wand']) {
      const kaart = box(plek)?.querySelector(':scope > [data-kaart="favorieten"]');
      if (!kaart) continue;
      const lijst = deel(plek).favorieten;
      const mag = plek === 'tel' ? kan : kan && v.wand.magAanpassen;
      const tegels = lijst.map(tegel).join('');
      const kies = mag && iets ? '<button type="button" class="favkies" data-fav-kies>Kies scènes en lampen</button>' : '';
      const html = tegels
        ? `<div class="tegels">${tegels}</div>${kies}`
        : mag && iets
          ? '<div class="favleeg"><p class="mini">Zet hier scènes en lampen die je vaak gebruikt.</p><button type="button" data-fav-kies>Kiezen</button></div>'
          : '';
      // Zonder lampen of scènes, of op de wand zonder keuze en zonder recht: niets te tonen.
      kaart.hidden = !html;
      const plekje = kaart.querySelector('[data-favorieten]');
      if (plekje.dataset.html !== html) {
        plekje.innerHTML = html;
        plekje.dataset.html = html;
      }
      const uitleg = kaart.querySelector('[data-fav-uitleg]');
      if (uitleg) uitleg.textContent = !tegels ? '' : huis?.lichtBedienen === false ? 'Licht bedienen staat uit' : 'Tik om te schakelen';
    }
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

  function begin(plek) {
    if (!kan || (plek === 'wand' && !v.wand.magAanpassen)) return;
    bewerk = plek;
    zetKnoppen();
    document.body.classList.add('aanpassen');
    $$('[data-bewerkbalk], [data-bewerkkop]').forEach((el) => (el.hidden = false));
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
     * Favorieten kiezen (besluit 168): per kamer, de lampen eerst; de scènes
     * van die kamer ingeklapt eronder, elke naam één keer. Hooguit vier.
     * Eerst stonden alle scènes bovenaan, en dat was een lange lijst.
     */
    const gekozen = blad.keuze;
    const vol = gekozen.length >= v.maxFavorieten;
    const rij = (soortF, x, ik, klein = '') => {
      const aan = gekozen.some((f) => f.id === x.id);
      return keus({ ik, naam: x.naam, klein, rechts: aan ? '✓' : '', data: `data-fav="${esc(x.id)}" data-fav-soort="${soortF}"`, aan, uit: vol && !aan });
    };
    el.setAttribute('aria-label', 'Favorieten kiezen');
    const kamers = perKamer();
    el.innerHTML = `<div class="bladkop"><h2 class="kop-2">Favorieten</h2><button type="button" class="knop knop-licht" data-fav-klaar>Klaar</button></div>
      <p class="mini" style="margin: 0" data-fav-teller>${gekozen.length} van ${v.maxFavorieten} gekozen.${plek === 'wand' ? ' Voor de wand, voor iedereen.' : ' Ze staan met één tik op Thuis.'}</p>
      ${kamers.map((k) => {
        // Open als je er al een koos, of als je hem net openklapte.
        const open = blad.open.has(k.id) || k.scenes.some((s) => gekozen.some((f) => f.id === s.id));
        const sc = k.scenes.length
          ? `<details class="favscenes" data-fav-kamer="${esc(k.id)}" ${open ? 'open' : ''}><summary>Scènes (${k.scenes.length})</summary>${k.scenes.map((s) => rij('scene', s, ICOON.scene)).join('')}</details>`
          : '';
        return `<h3>${esc(k.naam)}</h3>${k.lampen.map((d) => rij('lamp', d, ICOON.lamp)).join('')}${sc}`;
      }).join('')}`;
  }

  /** De lampen en scènes per kamer, in de volgorde van het huis; dezelfde scènenaam in een kamer één keer. */
  function perKamer() {
    const gezien = new Set();
    const uit = [];
    for (const e of huis?.etages ?? []) {
      for (const r of e.ruimtes ?? []) {
        const lampenHier = (r.apparaten ?? []).filter((d) => d.soort === 'licht');
        const namen = new Set();
        const scenesHier = (r.scenes ?? [])
          .filter((s) => !gezien.has(s.id) && gezien.add(s.id))
          .filter((s) => !namen.has(s.naam.toLowerCase()) && namen.add(s.naam.toLowerCase()))
          .sort((a, b) => (b.gebruiktMs ?? 0) - (a.gebruiktMs ?? 0));
        if (lampenHier.length || scenesHier.length) uit.push({ id: r.id, naam: r.naam, lampen: lampenHier, scenes: scenesHier });
      }
    }
    return uit;
  }

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
        ${keuze(true, 'Eenvoudig', 'De temperatuur en wat het huis doet, in zinnen. Minder getallen.', '<i style="width: 70%; height: 10px; background: rgba(255,255,255,0.45)"></i><i style="width: 92%; height: 8px"></i><i style="width: 60%; height: 8px"></i>')}
        ${keuze(false, 'Uitgebreid', 'Alles: kW op het huis, de grafiek van vandaag en de apparaten.', '<i style="width: 60%; height: 7px; background: rgba(255,255,255,0.45)"></i><i style="width: 90%"></i><i style="width: 80%"></i><i style="width: 45%; background: rgba(247,181,72,0.55)"></i><i style="width: 70%"></i>')}
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
