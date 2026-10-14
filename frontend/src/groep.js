/*
 * Eén opbouw voor elke groep achter het tandwiel (besluit 130, schetsen
 * Wand-Instellingen-Energie en -Comfort): links de delen van de groep, elk met
 * zijn stand; in het midden het deel dat je kiest; rechts waarvoor het nodig is.
 * Wat je verandert, wordt meteen bewaard.
 *
 * Een pagina geeft haar delen en tekent zelf het midden en de rechterkant in
 * `[data-vorm]` en `[data-naast]`. Het gekozen deel staat in het adres
 * (`comfort.html#woonkamer`), zodat terug en vooruit gewoon werken.
 */
'use strict';

(function (global) {
  const { $$, esc } = global.app;

  /** Het deel uit het adres, of het eerste. */
  function actief(delen) {
    const id = decodeURIComponent(location.hash.slice(1));
    return delen.some((d) => d.id === id) ? id : delen.find((d) => !d.kop)?.id ?? null;
  }

  /**
   * De delen: [{ id, titel, zin, stand: 'goed' | 'mist' | 'leeg' }], met
   * tussenkoppen als { kop: 'Kamers' }.
   */
  function tekenDelen(delen) {
    const nu = actief(delen);
    const kleur = { goed: 'var(--mint)', mist: 'var(--gloed)', leeg: 'var(--gedempt)' };
    const html = delen
      .map((d) => (d.kop
        ? `<h4>${esc(d.kop)}</h4>`
        : `<a class="deel${d.id === nu ? ' nu' : ''}" href="#${encodeURIComponent(d.id)}" ${d.id === nu ? 'aria-current="page"' : ''}><b>${esc(d.titel)}</b><span>${esc(d.zin ?? '')}</span>${d.stand ? `<span class="stip" style="background: ${kleur[d.stand] ?? kleur.leeg}" aria-label="${d.stand === 'mist' ? 'er mist iets' : d.stand === 'goed' ? 'klaar' : ''}"></span>` : ''}</a>`))
      .join('');
    $$('[data-delen]').forEach((el) => (el.innerHTML = html));
    // Op de telefoon staan de delen in een rij: het gekozen deel in beeld.
    document.querySelector('#tel [data-delen] .deel.nu')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return nu;
  }

  /* ---------------------------------------------------- meteen bewaren */

  let wacht = null;
  let bezig = Promise.resolve();
  function zegBewaard(stand, tekst) {
    const kleur = { bezig: 'var(--zacht)', ok: 'var(--mint)', fout: 'var(--gloed)' }[stand];
    $$('[data-bewaard]').forEach((el) => {
      el.style.color = kleur;
      el.innerHTML = `<span class="stip" style="background: ${kleur}"></span>${esc(tekst)}`;
    });
  }

  /**
   * Bewaart even na de laatste wijziging. `doe` stuurt en geeft
   * { ok: true } of { ok: false, fout: 'reden' }; null is "even naar de inlog".
   */
  function bewaarStraks(doe, ms = 600) {
    clearTimeout(wacht);
    zegBewaard('bezig', 'Bewaren…');
    wacht = setTimeout(() => {
      bezig = bezig.then(async () => {
        try {
          const uit = await doe();
          if (uit == null) return;
          if (uit.ok) zegBewaard('ok', 'Bewaard');
          else zegBewaard('fout', uit.fout ?? 'Niet bewaard');
        } catch {
          zegBewaard('fout', 'Niet bewaard: geen verbinding met Smart Climate');
        }
      });
    }, ms);
  }

  /** Stuurt een POST en vertaalt het antwoord voor `bewaarStraks`. */
  async function stuur(pad, body) {
    const res = await global.app.deur(pad, body);
    if (res === null) return null;
    const uit = await res.json().catch(() => ({}));
    if (res.status === 403) return { ok: false, fout: 'Alleen de beheerder kan dit bewaren' };
    if (!res.ok) return { ok: false, fout: uit.fout ?? 'Niet bewaard' };
    return { ok: true, antwoord: uit };
  }

  global.groep = { actief, tekenDelen, bewaarStraks, stuur, zegBewaard };
  // Bij het openen staat er wat er geldt.
  addEventListener('DOMContentLoaded', () => zegBewaard('ok', 'Alles wordt meteen bewaard'));
})(window);
