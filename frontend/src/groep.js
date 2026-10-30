/*
 * Eén opbouw voor elke groep achter het tandwiel (besluit 130; schetsen
 * Wand-Instellingen-Groep en Instellingen-Tel-Groep, besluit 163): de delen
 * van de groep als regels met een icoon, wat mist bovenaan; het deel dat je
 * kiest; waarvoor het nodig is; en onderaan door naar het vorige of volgende
 * deel. Wat je verandert, wordt meteen bewaard.
 *
 * Op de wand staan de delen links en het gekozen deel rechts, met de uitleg
 * achter "Waarvoor is dit?". Op de telefoon eerst alleen de lijst; een deel
 * opent als eigen scherm, met terug naar de groep.
 *
 * Een pagina geeft haar delen en tekent zelf het deel in `[data-vorm]` en de
 * uitleg in `[data-naast]`. Het gekozen deel staat in het adres
 * (`comfort.html#woonkamer`), zodat terug en vooruit gewoon werken.
 */
'use strict';

(function (global) {
  const { $$, esc } = global.app;
  const t = (k, p) => global.taal.t(k, p);

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /** Per deel een icoon en zijn kleur; een kamer krijgt er een naar zijn naam. */
  const ICOON = {
    panelen: ['var(--zon)', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'],
    aansluiting: ['var(--ijs)', '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>'],
    meters: ['var(--mint)', '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/><path d="M3 21h18"/>'],
    prijzen: ['var(--zon)', '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>'],
    verwarming: ['var(--gloed)', '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1.5 2 1.5 3 1.5-1.5 1.5-5 1.5-8z"/>'],
    dagdelen: ['var(--ijs)', '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'],
    voorrang: ['var(--violet)', '<path d="M4 7h11M4 12h8M4 17h5"/><path d="M18 20V8M15 11l3-3 3 3"/>'],
    // Terug naar standaard (besluit 204): een pijl die terugdraait.
    standaard: ['var(--zacht)', '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/>'],
    afwezig: ['var(--zon)', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'],
    klimaat: ['var(--ijs)', '<rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18c0-1.5 1-2 1-3M12 19c0-1.5 1-2 1-3M17 18c0-1.5 1-2 1-3"/>'],
    opzon: ['var(--zon)', '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h2"/>'],
    licht: ['var(--zon)', '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
    cameras: ['var(--zacht)', '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>'],
    deurbel: ['var(--violet)', '<rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="9" r="2.2"/><circle cx="12" cy="16" r="1.4"/>'],
    weer: ['var(--ijs)', '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 3.3 3.3 0 0 0 7 18z"/>'],
    meldingen: ['var(--gloed)', '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>'],
    praten: ['var(--violet)', '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'],
    // Stem en luisteren (besluit 212): een luidspreker met geluid.
    stem: ['var(--mint)', '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'],
    // Te doen (besluit 216): het lijstje van de tab, sinds 0.92.0 overal hetzelfde.
    tedoen: ['var(--mint)', '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'],
    bewoners: ['var(--mint)', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'],
    inloggen: ['var(--ijs)', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
    scherm: ['var(--zacht)', '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'],
    // Weergave bij Functies (besluit 167): het always-on display (een scherm met een klok) en scherm uit (een maan).
    aod: ['var(--ijs)', '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M12 7.5v3l2 1.2"/>'],
    uit: ['var(--violet)', '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
    assistent: ['var(--violet)', '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'],
    gegevens: ['var(--mint)', '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'],
    versie: ['var(--zacht)', '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'],
    bed: ['var(--mint)', '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="11" r="1.5"/>'],
    bank: ['var(--mint)', '<path d="M4 12V9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M3 12h18v5H3zM5 17v2M19 17v2"/>'],
    dak: ['var(--mint)', '<path d="M3 13l9-8 9 8"/><path d="M6 11v9h12v-9"/><path d="M10 15h4"/>'],
    kamer: ['var(--mint)', '<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18"/><path d="M15 12h.01"/>'],
    // Kamers en indeling (besluit 193): de etages, buiten, en wat nog geen plek heeft of verborgen is.
    trap: ['var(--mint)', '<path d="M3 20h5v-4h4v-4h4V8h5"/>'],
    deur: ['var(--mint)', '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M14.5 12h.01"/>'],
    kelder: ['var(--mint)', '<path d="M3 4h5v4h4v4h4v4h5"/><path d="M3 20h18"/>'],
    buiten: ['var(--mint)', '<path d="M12 21v-8M8 13c0-4 4-8 4-8s4 4 4 8a4 4 0 0 1-8 0z"/>'],
    los: ['var(--zon)', '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 13l2-8h10l2 8v6H5z"/>'],
    verborgen: ['var(--zacht)', '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.6 3.2M6.4 7.6C4.3 9.2 3 12 3 12s4 6 9 6a8 8 0 0 0 3.6-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'],
  };
  function icoonVan(d) {
    const naam = (d.titel ?? '').toLowerCase();
    const sleutel = ICOON[d.icoon] ? d.icoon : ICOON[d.id] ? d.id : /slaap|logeer/.test(naam) ? 'bed' : /woon|zit/.test(naam) ? 'bank' : /zolder|boven/.test(naam) ? 'dak' : 'kamer';
    const [kleur, pad] = ICOON[sleutel];
    return `<span class="ik" style="color: ${global.app.tekstKleur(d.stand === 'mist' ? 'var(--gloed)' : kleur)}">${S(pad)}</span>`;
  }

  /** Wat mist bovenaan, binnen elk kopje; verder de volgorde van de pagina. */
  function volgorde(delen) {
    const uit = [];
    let stuk = [];
    const leeg = () => {
      uit.push(...stuk.filter((d) => d.stand === 'mist'), ...stuk.filter((d) => d.stand !== 'mist'));
      stuk = [];
    };
    for (const d of delen) {
      if (d.kop) {
        leeg();
        uit.push(d);
      } else stuk.push(d);
    }
    leeg();
    return uit;
  }

  /** Het deel uit het adres, of null. */
  function gekozen(delen) {
    const id = decodeURIComponent(location.hash.slice(1));
    return delen.some((d) => !d.kop && d.id === id) ? id : null;
  }

  /** Het deel uit het adres, of het bovenste. */
  function actief(delen) {
    return gekozen(delen) ?? volgorde(delen).find((d) => !d.kop && !d.erbij)?.id ?? null;
  }

  let vorigNu;
  let vanLijst = false;

  /**
   * De delen: [{ id, titel, zin, stand: 'goed' | 'mist' | 'leeg', icoon }], met
   * tussenkoppen als { kop: 'Kamers' }. Een deel met `erbij` is een stippelregel
   * om iets toe te voegen, zoals "+ Etage erbij" (besluit 193): het telt niet mee
   * bij wat er mist of klaar is, en niet bij Vorige en Volgende.
   */
  function tekenDelen(delen) {
    const rij = volgorde(delen);
    const nu = actief(delen);
    const open = gekozen(delen) != null;
    // Alleen wat ontbreekt krijgt een bolletje; wat goed staat, zegt niets extra (15 oktober).
    const stip = (d) => (d.stand === 'mist' ? `<span class="stip" style="background: var(--gloed)" aria-label="${esc(t('groep.ermist'))}"></span>` : '');
    const html = rij
      .map((d) => (d.kop
        ? `<h4>${esc(d.kop)}</h4>`
        : d.erbij
          ? `<a class="deel erbij${d.id === nu ? ' nu' : ''}" href="#${encodeURIComponent(d.id)}" ${d.id === nu ? 'aria-current="page"' : ''}>${esc(d.titel)}</a>`
          : `<a class="deel${d.id === nu ? ' nu' : ''}${d.stand === 'mist' ? ' mist' : ''}" href="#${encodeURIComponent(d.id)}" ${d.id === nu ? 'aria-current="page"' : ''}>${icoonVan(d)}<b>${esc(d.titel)}</b><span class="zin">${esc(d.zin ?? '')}</span><span class="eind">${stip(d)}<span class="pijl" aria-hidden="true">›</span></span></a>`))
      .join('');
    $$('[data-delen]').forEach((el) => (el.innerHTML = html));

    // Bovenaan in één oogopslag hoe de groep ervoor staat.
    const echt = rij.filter((d) => !d.kop && !d.erbij);
    const mist = echt.filter((d) => d.stand === 'mist').length;
    const klaar = echt.filter((d) => d.stand === 'goed').length;
    const samen = echt.every((d) => d.stand == null) ? '' : `${mist ? `<span class="mis">${esc(t('instellingen.mist', { n: mist }))}</span>` : ''}${klaar ? `<span class="goed">${esc(t('groep.klaar', { n: klaar }))}</span>` : ''}`;
    $$('[data-samen]').forEach((el) => (el.innerHTML = samen));

    // Onderaan door naar het vorige of volgende deel, in de volgorde van de lijst.
    const i = echt.findIndex((d) => d.id === nu);
    const stap = (d, soort) => (d
      ? `<a class="${soort}" href="#${encodeURIComponent(d.id)}" data-stap><small>${esc(t(`groep.${soort}`))}</small><b>${esc(d.titel)}${stip(d)}</b></a>`
      : `<span class="${soort}"></span>`);
    const verder = echt.length > 1 && i >= 0 ? `<span class="waar">${esc(t('instellingen.vanTotaal', { a: i + 1, b: echt.length }))}</span>${stap(echt[i - 1], 'vorige')}${stap(echt[i + 1], 'volgende')}` : '';
    $$('[data-verder]').forEach((el) => (el.innerHTML = verder));

    // De telefoon: eerst de lijst, een deel als eigen scherm met terug naar de groep.
    document.documentElement.classList.toggle('deel-open', open);
    const naam = document.querySelector('#tel h1')?.textContent?.trim() ?? '';
    $$('#tel [data-terug]').forEach((el) => {
      el.textContent = open ? `‹ ${naam}` : t('jij.terugInstellingen');
      el.setAttribute('href', open ? location.pathname + location.search : 'instellingen.html');
    });
    if (nu !== vorigNu) {
      $$('[data-waarvoor-vak].open').forEach(sluitWaarvoor);
      if (vorigNu !== undefined && global.app.telStand()) global.scrollTo(0, 0);
      vorigNu = nu;
    }
    return nu;
  }

  /* -------------------------------------------- waarvoor is dit? (de wand) */

  function sluitWaarvoor(vak) {
    vak.classList.remove('open');
    vak.querySelector('[data-waarvoor]')?.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', (e) => {
    const knop = e.target.closest?.('[data-waarvoor]');
    if (knop) {
      const vak = knop.closest('[data-waarvoor-vak]');
      const open = !vak.classList.contains('open');
      vak.classList.toggle('open', open);
      knop.setAttribute('aria-expanded', String(open));
      return;
    }
    // Vorige en volgende vervangen het adres: terug gaat naar de lijst, niet langs elk deel.
    const stap = e.target.closest?.('[data-stap]');
    if (stap) {
      e.preventDefault();
      location.replace(stap.getAttribute('href'));
      return;
    }
    if (e.target.closest?.('#tel [data-delen] .deel')) vanLijst = true;
    // Terug naar de groep: kwam je uit de lijst, dan gewoon een stap terug.
    const terug = e.target.closest?.('#tel [data-terug]');
    if (terug && document.documentElement.classList.contains('deel-open')) {
      e.preventDefault();
      if (vanLijst) {
        vanLijst = false;
        history.back();
      } else {
        history.replaceState(null, '', location.pathname + location.search);
        global.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('[data-waarvoor-vak] .naast, [data-waarvoor]')) $$('[data-waarvoor-vak].open').forEach(sluitWaarvoor);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('[data-waarvoor-vak].open').forEach(sluitWaarvoor);
  });

  /* ---------------------------------------------------- meteen bewaren */

  let wacht = null;
  let bezig = Promise.resolve();
  function zegBewaard(stand, tekst) {
    // Een bolletje alleen als het misging; anders gewoon de tekst.
    const kleur = { rust: 'var(--gedempt)', bezig: 'var(--zacht)', ok: 'var(--mint)', fout: 'var(--gloed)' }[stand];
    $$('[data-bewaard]').forEach((el) => {
      el.style.color = kleur;
      el.innerHTML = `${stand === 'fout' ? `<span class="stip" style="background: ${kleur}"></span>` : ''}${esc(tekst)}`;
    });
  }

  /**
   * Bewaart even na de laatste wijziging. `doe` stuurt en geeft
   * { ok: true } of { ok: false, fout: 'reden' }; null is "even naar de inlog".
   */
  function bewaarStraks(doe, ms = 600) {
    clearTimeout(wacht);
    zegBewaard('bezig', t('groep.bewaren'));
    wacht = setTimeout(() => {
      bezig = bezig.then(async () => {
        try {
          const uit = await doe();
          if (uit == null) return;
          if (uit.ok) zegBewaard('ok', t('groep.bewaard'));
          else zegBewaard('fout', uit.fout ?? t('groep.nietBewaard'));
        } catch {
          zegBewaard('fout', t('groep.geenVerbinding'));
        }
      });
    }, ms);
  }

  /** Stuurt een POST en vertaalt het antwoord voor `bewaarStraks`. */
  async function stuur(pad, body) {
    const res = await global.app.deur(pad, body);
    if (res === null) return null;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return { ok: false, fout: t('groep.beheerder') };
    if (!res.ok) return { ok: false, fout: uit.fout ?? t('groep.nietBewaard') };
    return { ok: true, antwoord: uit };
  }

  global.groep = { actief, tekenDelen, bewaarStraks, stuur, zegBewaard };
  // Bij het openen staat er wat er geldt.
  addEventListener('DOMContentLoaded', () => zegBewaard('rust', t('groep.meteen')));
})(window);
