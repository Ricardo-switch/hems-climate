/*
 * Hoe voelt het? (besluit 134, schets Wand-Gevoel). Op Thuis en bij een kamer:
 * te koud, goed of te warm. Tikken kan zonder inlog; het verandert niets aan
 * het huis. De dienst bewaart de temperatuur en het dagdeel van dat moment.
 *
 * Na een tik een antwoord: wat het huis ervan noteerde, en tikt de bewoner in
 * hetzelfde dagdeel vaker hetzelfde, een voorstel voor Comfort ("Voortaan een
 * halve graad warmer?"). Met genoeg tikken laat het zien wat het leerde: elke
 * tik als een stip op de temperatuur van toen, en waar het goed voelde.
 *
 * De pagina vraagt `gevoel.html(...)` en tekent dat waar ze wil; de knoppen
 * werken via één luisteraar hier. Wat er verandert, laat de pagina opnieuw
 * tekenen via `gevoel.bij(fn)`.
 */
(function (global) {
  'use strict';

  const { esc, haal, deur } = global.app;
  const { t, getal } = global.taal;

  /** Het gevoel, de tekst op de knop en de kleur; de teksten in teksten.*.js (besluit 185). */
  const GEVOEL = [
    ['te_koud', 'koud'],
    ['goed', 'goed'],
    ['te_warm', 'warm'],
  ];
  const DAGDEEL = { dag: 'dag', voorverwarmen: 'dag', nacht: 'nacht' };
  const dagdeel = (m) => t(`gevoel.dagdeel.${DAGDEEL[m]}`);
  /** Zoveel keer hetzelfde in twee weken, in hetzelfde dagdeel, en het huis stelt iets voor. */
  const VAKER = 3;
  /** Zoveel tikken met een temperatuur, en het huis laat zien wat het leerde. */
  const GENOEG = 8;

  let tikken = [];
  let comfort = null;
  let opnieuw = () => {};
  /** Per zone: het laatste antwoord, en of een voorstel al beantwoord is. */
  const antwoord = new Map();
  let geladen = false;
  /** Het laden dat nu loopt: hooguit één tegelijk, anders vraagt elke tekenbeurt opnieuw. */
  let bezig = null;

  const graden = (c) => `${getal(c, Number.isInteger(c) ? 0 : 1)}°`;
  const halve = (c) => Math.round(c * 2) / 2;

  function laad() {
    bezig ??= (async () => {
      const [t, c] = await Promise.allSettled([haal('api/gevoel?dagen=56'), haal('api/comfort')]);
      if (t.status === 'fulfilled' && Array.isArray(t.value)) tikken = t.value;
      if (c.status === 'fulfilled') comfort = c.value;
      geladen = true;
      bezig = null;
      opnieuw();
    })();
    return bezig;
  }

  /** Het dagdeel waar een voorstel over gaat: overdag of 's nachts, anders geen. */
  const dagdeelVan = (modus) => (modus === 'nacht' ? 'nacht' : modus === 'dag' || modus === 'voorverwarmen' ? 'dag' : null);

  /** Een voorstel na deze tik, of null. */
  function voorstel(zoneId, gevoel, modus) {
    const m = dagdeelVan(modus);
    const k = comfort?.kamers?.find((x) => x.id === zoneId);
    if (!m || !k || gevoel === 'goed') return null;
    const sinds = Date.now() - 14 * 86_400_000;
    const vaak = tikken.filter((t) => t.zoneId === zoneId && t.gevoel === gevoel && t.t >= sinds && dagdeelVan(t.dagdeel) === m).length;
    if (vaak < VAKER) return null;
    const p = k.modi?.[m] ?? {};
    if (gevoel === 'te_koud' && p.heat != null) {
      const v = Math.min(p.heat + 0.5, p.cool != null ? p.cool - 1 : Infinity);
      return v > p.heat ? { m, soort: 'heat', v, vaak, zin: t('gevoel.voorstel.warmer', { vaak, dagdeel: dagdeel(m), graden: graden(v) }) } : null;
    }
    if (gevoel === 'te_warm' && p.cool != null) {
      const v = Math.max(p.cool - 0.5, p.heat != null ? p.heat + 1 : -Infinity);
      return v < p.cool ? { m, soort: 'cool', v, vaak, zin: t('gevoel.voorstel.koeler', { vaak, dagdeel: dagdeel(m), graden: graden(v) }) } : null;
    }
    if (gevoel === 'te_warm' && p.heat != null) {
      return { m, soort: 'heat', v: p.heat - 0.5, vaak, zin: t('gevoel.voorstel.minder', { vaak, dagdeel: dagdeel(m), graden: graden(p.heat - 0.5) }) };
    }
    return null;
  }

  /** Wat het huis leerde uit genoeg tikken, of null. */
  function leerde(zoneId) {
    const mijn = tikken.filter((t) => t.zoneId === zoneId && typeof t.c === 'number' && t.gevoel);
    const goed = mijn.filter((t) => t.gevoel === 'goed').map((t) => t.c);
    if (mijn.length < GENOEG || goed.length < 3) return null;
    const lo = Math.min(...goed);
    const hi = Math.max(...goed);
    const alle = mijn.map((t) => t.c);
    const van = Math.floor(Math.min(...alle, lo) - 1);
    const tot = Math.ceil(Math.max(...alle, hi) + 1);
    return { mijn, lo: halve(lo), hi: halve(hi), van, tot, weken: Math.max(1, Math.round((Date.now() - Math.min(...mijn.map((t) => t.t))) / (7 * 86_400_000))) };
  }

  function strook(l) {
    const x = (c) => ((c - l.van) / (l.tot - l.van)) * 100;
    const kleur = { te_koud: 'var(--ijs)', goed: 'var(--mint)', te_warm: 'var(--gloed)' };
    const stippen = l.mijn.map((t, i) => `<i style="left: ${x(t.c).toFixed(1)}%; top: ${18 + ((i * 7) % 15)}px; background: ${kleur[t.gevoel]}"></i>`).join('');
    return `<div class="gevoelstrook" aria-hidden="true"><div class="baan"></div><div class="prettig" style="left: ${x(l.lo).toFixed(1)}%; width: ${Math.max(2, x(l.hi) - x(l.lo)).toFixed(1)}%"></div>${stippen}
      <span class="maat" style="left: 0%">${graden(l.van)}</span><span class="maat" style="left: ${x(l.lo).toFixed(1)}%">${graden(l.lo)}</span><span class="maat" style="left: ${x(l.hi).toFixed(1)}%">${graden(l.hi)}</span><span class="maat" style="left: 100%">${graden(l.tot)}</span></div>
      <div class="gevoellegenda"><span><i style="background: var(--ijs)"></i>${esc(t('gevoel.woord.te_koud'))}</span><span><i style="background: var(--mint)"></i>${esc(t('gevoel.woord.goed'))}</span><span><i style="background: var(--gloed)"></i>${esc(t('gevoel.woord.te_warm'))}</span></div>`;
  }

  /**
   * De kaart voor een zone. `kamers` (optioneel) zijn de zones om uit te
   * kiezen, als `[{ zoneId, naam, c }]`; `state` is `api/state`.
   */
  function html({ zoneId, kamers = [], state = null, kort = false }) {
    if (!zoneId) return '';
    if (!geladen) void laad().catch(() => {});
    const a = antwoord.get(zoneId);
    const kies = kamers.length > 1 ? `<div class="gevoelkamers" role="group" aria-label="${esc(t('gevoel.kamer'))}">${kamers.map((k) => `<button type="button" data-gevoel-zone="${esc(k.zoneId)}" aria-pressed="${k.zoneId === zoneId}">${esc(k.naam)}${k.c != null ? ` <small>${graden(k.c)}</small>` : ''}</button>`).join('')}</div>` : '';
    const knoppen = `<div class="gevoel">${GEVOEL.map(([g, kl]) => `<button type="button" class="${kl}" data-gevoel-tik="${g}" data-zone="${esc(zoneId)}" aria-pressed="${a?.gevoel === g}">${esc(t(`gevoel.knop.${g}`))}</button>`).join('')}</div>`;
    let onder = '';
    if (a) {
      const nu = state?.bewoner?.kamers?.find((x) => x.zoneId === zoneId)?.kort;
      const woord = t(`gevoel.woord.${a.gevoel}`);
      onder += `<p class="gevoelantwoord"><b>${esc(a.c != null ? t('gevoel.genoteerdBij', { woord, graden: graden(a.c) }) : t('gevoel.genoteerd', { woord }))}</b>${nu ? ` ${esc(t('gevoel.hetHuis', { zin: nu.charAt(0).toLowerCase() + nu.slice(1) }))}` : ''}</p>`;
      if (a.voorstel && !a.klaar) {
        onder += `<div class="gevoelvoorstel"><span class="wie">${esc(t('gevoel.anders'))}</span><span>${esc(a.voorstel.zin)}</span><div class="knoppen"><button type="button" class="licht" data-gevoel-ja="${esc(zoneId)}">${esc(t('gevoel.ja', { graden: graden(a.voorstel.v) }))}</button><button type="button" data-gevoel-nee="${esc(zoneId)}">${esc(t('gevoel.nee'))}</button></div></div>`;
      } else if (a.klaar) onder += `<p class="mini" style="margin: 6px 0 0">${esc(a.klaar)}</p>`;
    } else if (!kort) {
      onder += `<p class="mini" style="margin: 6px 0 0">${esc(t('gevoel.uitleg'))}</p>`;
    }
    const l = !kort && !a?.voorstel ? leerde(zoneId) : null;
    if (l) {
      onder += `<div class="gevoelvoorstel"><span class="wie">${esc(t('gevoel.leerdeKop'))}</span><span>${global.taal.html('gevoel.leerde', { lo: graden(l.lo), hi: graden(l.hi), tikken: l.mijn.length, n: l.weken })}</span>${strook(l)}</div>`;
    }
    return `${kies}${knoppen}${onder}`;
  }

  /** Comfort bewaren met één waarde anders, en de rest zoals het is. */
  async function zetComfort(zoneId, m, soort, v) {
    if (!comfort) return null;
    const kamers = Object.fromEntries(comfort.kamers.map((k) => {
      const modi = k.id === zoneId ? { ...k.modi, [m]: { ...k.modi[m], [soort]: v } } : k.modi;
      return [k.id, { modi, nooitWarmerC: k.nooitWarmerC, voorrang: k.voorrang, opZonC: k.opZonC }];
    }));
    const res = await deur('api/comfort', { kamers, dagdelen: comfort.dagdelen, ...(comfort.voorrang ? { voorrang: comfort.voorrang } : {}) });
    if (res?.ok) comfort = await res.json();
    return res;
  }

  document.addEventListener('click', async (e) => {
    const knop = e.target.closest('[data-gevoel-tik], [data-gevoel-ja], [data-gevoel-nee], [data-gevoel-zone]');
    if (!knop) return;
    if (knop.dataset.gevoelZone) {
      dispatchEvent(new CustomEvent('gevoelzone', { detail: knop.dataset.gevoelZone }));
      return;
    }
    if (knop.dataset.gevoelTik) {
      const zoneId = knop.dataset.zone;
      const g = knop.dataset.gevoelTik;
      antwoord.set(zoneId, { gevoel: g, c: null, voorstel: null });
      opnieuw();
      const res = await deur('api/gevoel', { zoneId, gevoel: g }).catch(() => null);
      const record = res?.ok ? await res.json().catch(() => null) : null;
      if (!record) {
        antwoord.set(zoneId, { gevoel: g, c: null, voorstel: null, klaar: t('gevoel.mislukt') });
        return opnieuw();
      }
      tikken = [record, ...tikken];
      antwoord.set(zoneId, { gevoel: g, c: record.c ?? null, voorstel: voorstel(zoneId, g, record.dagdeel) });
      return opnieuw();
    }
    const zoneId = knop.dataset.gevoelJa ?? knop.dataset.gevoelNee;
    const a = antwoord.get(zoneId);
    if (!a?.voorstel) return;
    if (knop.dataset.gevoelNee) {
      antwoord.set(zoneId, { ...a, klaar: t('gevoel.blijft') });
      return opnieuw();
    }
    const res = await zetComfort(zoneId, a.voorstel.m, a.voorstel.soort, a.voorstel.v).catch(() => null);
    antwoord.set(zoneId, { ...a, klaar: res?.ok ? t(a.voorstel.soort === 'heat' ? 'gevoel.bewaardWarm' : 'gevoel.bewaardKoel', { graden: graden(a.voorstel.v), dagdeel: dagdeel(a.voorstel.m) }) : t('gevoel.nietBewaard') });
    opnieuw();
  });

  global.gevoel = {
    html,
    /** De pagina tekent opnieuw als hier iets verandert. */
    bij(fn) {
      opnieuw = fn;
    },
    laad,
  };
})(window);
