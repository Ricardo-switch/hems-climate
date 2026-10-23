/*
 * De taal van de app (besluit 185, stap 8 van het stappenplan; besluit 86).
 *
 * Alle teksten staan per taal op één plek: teksten.nl.js en teksten.en.js,
 * met een sleutel per tekst. De code vraagt ze op met `t('thuis.vandaag')`, en
 * de HTML met `data-t="thuis.vandaag"` (de tekst) of `data-t-aria-label="…"`
 * (een attribuut). `{naam}` vult zich met wat je meegeeft. Meervoud staat per
 * taal als `{ one: '…', other: '…' }` met `n` erbij (zie `vorm`); een functie
 * mag ook, voor wat per taal echt anders loopt.
 *
 * Welke taal: wat de bewoner bij Jij koos (op de telefoon, onthouden in
 * `sc-taal`), anders de taal van zijn account in Home Assistant, anders die
 * van de browser. De wand heeft geen profiel en volgt zijn eigen account.
 * Getallen, tijden en datums volgen de taal; Engels in Britse stijl: 22:00 en
 * 20.5°.
 *
 * Laden onderaan de pagina, na de tekstbestanden en voor de rest: de taal
 * staat vast voordat er iets getekend wordt. Een andere keuze laadt de pagina
 * opnieuw.
 */
(function (global) {
  'use strict';
  const TALEN = global.TALEN ?? {};
  const KAN = Object.keys(TALEN);
  /**
   * De talen die de hele app spreekt: alleen die kiest de app vanzelf, uit het
   * account of de browser. Een taal die nog half af is, kies je zelf bij Jij;
   * anders zag iemand met zo'n account op de andere pagina's een mengtaal.
   * Engels sinds stap 9 af is (23 oktober 2026): de app, de dienst en de
   * assistent spreken het.
   */
  const HEEL = ['nl', 'en'];
  const SLEUTEL = 'sc-taal';
  /** Engels in Britse stijl (besluit 185): 24-uursklok, punt als decimaalteken. */
  const LOCALE = { nl: 'nl-NL', en: 'en-GB' };

  /** De taal van het account in Home Assistant: binnen Home Assistant leest de app die van het paneel eromheen. */
  function haTaal() {
    try {
      return global.parent?.document?.querySelector('home-assistant')?.hass?.language ?? null;
    } catch {
      return null;
    }
  }
  /** "en-GB", "nl" of "EN" wordt een taal die de app kent (of in `lijst` staat), of null. */
  const past = (code, lijst = KAN) => {
    const c = String(code ?? '').toLowerCase().split(/[-_]/)[0];
    return lijst.includes(c) ? c : null;
  };
  function gekozen() {
    try {
      return past(global.localStorage?.getItem(SLEUTEL));
    } catch {
      return null;
    }
  }
  /** Vanzelf: het account, dan de browser; een taal die de app nog niet helemaal spreekt, telt niet. */
  const vanzelf = () => past(haTaal(), HEEL) ?? past(global.navigator?.language, HEEL) ?? (global.navigator?.languages ?? []).map((x) => past(x, HEEL)).find(Boolean) ?? HEEL[0];
  const code = gekozen() ?? vanzelf();
  const locale = LOCALE[code] ?? code;
  if (global.document?.documentElement) global.document.documentElement.lang = code;

  /**
   * Meervoud: een tekst als `{ one: '1 lamp', other: '{n} lampen' }` kiest zijn
   * vorm naar `n`, met de regels van de taal (Intl.PluralRules), zodat een taal
   * met meer vormen, zoals later misschien een andere, er gewoon bij kan. Met
   * `zero` een eigen zin voor nul ("geen lampen").
   */
  const MEERVOUD = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(LOCALE[code] ?? code) : null;
  function vorm(w, n) {
    if (n === 0 && w.zero != null) return w.zero;
    return w[MEERVOUD?.select(n) ?? (n === 1 ? 'one' : 'other')] ?? w.other;
  }

  /** De tekst bij een sleutel, in de taal van de app; mist hij, dan de Nederlandse en een waarschuwing. */
  function t(sleutel, p = {}) {
    const w = TALEN[code]?.[sleutel] ?? TALEN.nl?.[sleutel];
    if (w == null) {
      console.warn(`Geen tekst voor ${sleutel}`);
      return sleutel;
    }
    const s = typeof w === 'function' ? w(p) : typeof w === 'object' ? vorm(w, Number(p.n ?? 0)) : w;
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] == null ? m : String(p[k])));
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /** Dezelfde tekst als HTML: ontsnapt, en `**zo**` vet. Voor een zin met een vet getal erin. */
  const html = (sleutel, p = {}) => esc(t(sleutel, p)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  /** Een getal in de taal van de app, met `d` cijfers achter de komma (of de punt). */
  const getal = (n, d = 1) => Number(n).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  /** De klok: 14:05. */
  const klok = (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  /** Een datum of tijd met de opties van Intl. */
  const datum = (d, opties) => new Date(d).toLocaleDateString(locale, opties);
  const opmaak = (opties) => new Intl.DateTimeFormat(locale, opties);

  /** Vult de vaste teksten in de HTML: `data-t`, `data-t-html` (met **vet**) en `data-t-<attribuut>`. */
  function vul(root = global.document) {
    if (!root?.querySelectorAll) return;
    for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    for (const el of root.querySelectorAll('[data-t-html]')) el.innerHTML = html(el.dataset.tHtml);
    for (const el of root.querySelectorAll('*')) {
      for (const a of [...el.attributes]) {
        if (a.name.startsWith('data-t-') && a.name !== 'data-t-html') el.setAttribute(a.name.slice('data-t-'.length), t(a.value));
      }
    }
  }

  /**
   * De keuze bij Jij (`auto`, `nl` of `en`), uit de voorkeuren. Op een scherm
   * geldt geen keuze: daar telt het account. Verandert de taal daarmee, dan de
   * pagina opnieuw, zodat alles in die taal staat.
   */
  function zetKeuze(keuze, { scherm = false } = {}) {
    const nieuw = scherm || !past(keuze) ? null : past(keuze);
    try {
      if (nieuw) global.localStorage.setItem(SLEUTEL, nieuw);
      else global.localStorage.removeItem(SLEUTEL);
    } catch {
      return;
    }
    const wordt = nieuw ?? vanzelf();
    if (wordt !== code) global.location.reload();
  }

  global.taal = { code, locale, talen: KAN, t, html, getal, klok, datum, opmaak, vul, zetKeuze };
  global.t = t;
  // Het script staat onderaan de pagina: wat erboven staat, is er al.
  vul();
})(window);
