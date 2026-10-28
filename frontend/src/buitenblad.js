/**
 * Buiten op Thuis (28 oktober 2026, besluit 206, schets Wand-Huis-Ligging): een
 * tik op de oprit, de garage of een zone in de tuin opent een blad naast het
 * huis, en je blijft op Thuis. Met de lampen van dat deel, wat er nog meer is
 * (een camera, de garagedeur, de auto aan de lader) en de andere zones. Het
 * blad Alles buiten zet elk deel aan of uit, en alles buiten in één keer uit.
 *
 * Alleen lampen schakelen (besluit 97). De garagedeur staat er om te bekijken:
 * open of dicht doet de app nooit (besluit 148).
 */
(function (global) {
  const { esc } = global.app;
  const t = (k, v) => global.t(k, v);

  /** Wat je net koos, tot Home Assistant het doorgeeft: per lamp aan of uit. */
  const gewenst = new Map();
  const aanVan = (d) => (gewenst.has(d.id) ? gewenst.get(d.id) : !!d.aan);
  const lampenIn = (lijst) => lijst.filter((d) => d.soort === 'licht');

  /** De ruimtes buiten, met hun soort: eerst wat voor het huis ligt, dan de tuin. */
  function ruimtes(huis) {
    const uit = [];
    for (const e of huis?.etages ?? []) {
      for (const r of e.ruimtes ?? []) if (global.huismodel.isBuiten(e, r)) uit.push({ ...r, buitenSoort: global.huismodel.soortBuiten(r).soort });
    }
    return uit;
  }
  const VOOR = ['oprit', 'carport', 'voortuin', 'garage'];
  const isBuiten = (huis, id) => ruimtes(huis).some((r) => r.id === id);

  const ICOON = {
    lamp: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3"/>',
    garage: '<path d="M3 10 12 4l9 6v10H3z"/><path d="M7 20v-7h10v7M7 16h10"/>',
    auto: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/>',
    pijl: '<path d="m9 6 6 6-6 6"/>',
  };
  const ik = (pad) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;
  const schakel = (aan, attr, label) => `<button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="${esc(label)}" ${attr}></button>`;

  /** Hoe een lamp erbij staat: aan met zijn helderheid, of uit. */
  function lampZin(d) {
    if (!aanVan(d)) return t('eigen.lamp.uit');
    return d.dimbaar && d.helderheidPct != null && !gewenst.has(d.id) ? t('eigen.lamp.aanPct', { pct: d.helderheidPct }) : t('eigen.lamp.aan');
  }
  function lampRij(d) {
    const aan = aanVan(d);
    const kleur = aan ? global.huismodel.kleurVanLicht(d) : 'rgb(var(--wit) / 0.25)';
    return `<div class="bb-rij"><i class="bb-ik" style="color: ${kleur}">${ik(ICOON.lamp)}</i><div class="bb-tekst"><b>${esc(d.naam)}</b><span>${esc(lampZin(d))}</span></div>${schakel(aan, `data-bb-lamp="${esc(d.id)}"`, d.naam)}</div>`;
  }
  /** Een deel met lampen: aan als er één brandt; met zijn aantal. */
  function deelZin(lampen) {
    if (!lampen.length) return t('buiten.geenLampen');
    const aan = lampen.filter(aanVan).length;
    return aan ? t('buiten.lampenAan', { n: lampen.length, aan }) : t('buiten.lampen', { n: lampen.length });
  }
  /** Een rij om een ander deel te openen, met een schakelaar als het lampen heeft. */
  function deelRij(sleutel, naam, lampen, schakelAttr) {
    const aan = lampen.some(aanVan);
    const kleur = aan ? global.huismodel.kleurVanLicht(lampen.find(aanVan)) : 'rgb(var(--wit) / 0.25)';
    return `<div class="bb-rij"><i class="bb-ik" style="color: ${kleur}">${ik(ICOON.lamp)}</i><button type="button" class="bb-tekst bb-open" data-bb-open="${esc(sleutel)}"><b>${esc(naam)}</b><span>${esc(deelZin(lampen))}</span></button>${lampen.length ? schakel(aan, schakelAttr, naam) : ''}</div>`;
  }
  const linkRij = (icoon, naam, zin, attr) => `<${attr.startsWith('href') ? 'a' : 'button type="button"'} class="bb-rij bb-link" ${attr}><i class="bb-ik">${ik(icoon)}</i><div class="bb-tekst"><b>${esc(naam)}</b><span>${esc(zin)}</span></div><i class="bb-pijl">${ik(ICOON.pijl)}</i></${attr.startsWith('href') ? 'a' : 'button'}>`;
  const kop = (titel, zin) => `<div class="weerkop"><div><h2 class="kop-3">${esc(titel)}</h2>${zin ? `<p class="mini" style="margin: 2px 0 0">${esc(zin)}</p>` : ''}</div><button class="sluit" type="button" aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>`;

  /** De auto aan de lader, op de oprit of onder de carport (besluit 206). */
  function autoVak(a) {
    if (!a) return '';
    const kw = (w) => `${(w / 1000).toLocaleString(global.taal.locale, { maximumFractionDigits: 1 })} kW`;
    const zin = a.laadt ? (a.vermogenW ? t('thuis.lading.laadtMet', { kw: kw(a.vermogenW) }) : t('thuis.lading.laadt')) : a.aangesloten === true ? t('thuis.lading.aangesloten') : a.aangesloten === false ? t('thuis.lading.nietAangesloten') : '';
    const pct = a.pct == null ? null : Math.max(0, Math.min(100, a.pct));
    return `<div class="bb-auto${a.laadt ? ' laadt' : ''}"><div class="bb-autokop"><i class="bb-ik">${ik(ICOON.auto)}</i><b>${esc(a.naam ?? t('buiten.auto'))}</b><span class="bb-pct">${pct == null ? '–' : `${Math.round(pct)}%`}</span></div>${pct == null ? '' : `<div class="bb-balk"><i style="width: ${pct}%"></i></div>`}${zin ? `<small>${esc(zin)}</small>` : ''}</div>`;
  }

  /** Het blad van één deel: een ruimte buiten, of een zone daarin. */
  function deelHtml(huis, kamerId, zoneId) {
    const r = ruimtes(huis).find((x) => x.id === kamerId);
    if (!r) return null;
    const zone = zoneId ? (r.zones ?? []).find((z) => z.id === zoneId) : null;
    const alle = lampenIn(r.apparaten ?? []);
    const lampen = zone ? alle.filter((d) => d.zone === zone.id) : alle;
    const titel = zone ? zone.naam : r.naam;
    const zin = zone ? `${r.naam} · ${deelZin(lampen)}` : deelZin(lampen);
    const aan = lampen.some(aanVan);
    const doel = zone ? `data-bb-zone="${esc(`${r.id}::${zone.id}`)}"` : `data-bb-kamer="${esc(r.id)}"`;
    const knop = lampen.length ? `<button type="button" class="knop ${aan ? 'knop-licht' : ''} bb-hoofd" ${doel} data-bb-aan="${!aan}">${esc(t(aan ? 'buiten.allesUit' : 'buiten.allesAan'))}</button>` : '';
    // Wat er nog meer is: de auto, een camera, de garagedeur, en de andere zones.
    const meer = [];
    if (!zone && ['oprit', 'carport'].includes(r.buitenSoort)) meer.push(autoVak(huis?.opslag?.auto));
    if (!zone) {
      for (const c of (r.apparaten ?? []).filter((d) => d.soort === 'camera')) meer.push(linkRij(ICOON.camera, c.naam, t('buiten.camera'), `href="kamer.html#${encodeURIComponent(r.id)}"`));
      for (const d of (huis?.toegang ?? []).filter((x) => x.kamerId === r.id)) {
        meer.push(`<div class="bb-rij"><i class="bb-ik">${ik(ICOON.garage)}</i><div class="bb-tekst"><b>${esc(d.naam)}</b><span>${esc(t(d.open === true ? 'buiten.deurOpen' : d.open === false ? 'buiten.deurDicht' : 'buiten.deurOnbekend'))}</span></div></div>`);
      }
    }
    const andere = (r.zones ?? []).filter((z) => z.id !== zone?.id).map((z) => deelRij(`${r.id}::${z.id}`, z.naam, alle.filter((d) => d.zone === z.id), `data-bb-zone="${esc(`${r.id}::${z.id}`)}" data-bb-aan="${!alle.filter((d) => d.zone === z.id).some(aanVan)}"`));
    if (zone) andere.unshift(linkRij(ICOON.lamp, r.naam, deelZin(alle), `data-bb-open="${esc(r.id)}"`));
    return `${kop(titel, zin)}
      ${knop}
      ${lampen.length ? `<div class="bb-lijst">${lampen.map(lampRij).join('')}</div>` : `<p class="mini">${esc(t('buiten.geenLampenHier'))}</p>`}
      ${meer.length ? `<h3 class="bb-sectie">${esc(t('buiten.ookHier'))}</h3><div class="bb-lijst">${meer.join('')}</div>` : ''}
      ${andere.length ? `<h3 class="bb-sectie">${esc(t('buiten.ookIn', { naam: r.naam }))}</h3><div class="bb-lijst">${andere.join('')}</div>` : ''}
      <div class="bb-voet"><button type="button" class="knop" data-bb-open="alles">${esc(t('buiten.allesBuiten'))}</button><a class="knop" href="kamer.html#${encodeURIComponent(r.id)}">${esc(t('buiten.openRuimte', { naam: r.naam }))}</a></div>
      <p class="mini voet">${esc(t(r.buitenSoort === 'garage' || (huis?.toegang ?? []).some((x) => x.kamerId === r.id) ? 'buiten.voetDeur' : 'buiten.voet'))} <a href="indeling.html#${encodeURIComponent(r.id)}">${esc(t('buiten.zonesInrichten', { naam: r.naam }))}</a></p>`;
  }

  /** Alles buiten: per deel aan of uit, voor het huis en in de tuin, en alles in één keer uit. */
  function allesHtml(huis) {
    const lijst = ruimtes(huis);
    const rijen = (r) => {
      const lampen = lampenIn(r.apparaten ?? []);
      const zones = (r.zones ?? []).filter((z) => lampen.some((d) => d.zone === z.id));
      // Een ruimte met lampen in zones: per zone, en de lampen zonder zone los.
      if (zones.length) {
        return [
          ...zones.map((z) => {
            const inZ = lampen.filter((d) => d.zone === z.id);
            return deelRij(`${r.id}::${z.id}`, z.naam, inZ,`data-bb-zone="${esc(`${r.id}::${z.id}`)}" data-bb-aan="${!inZ.some(aanVan)}"`);
          }),
          ...lampen.filter((d) => !zones.some((z) => z.id === d.zone)).map(lampRij),
        ];
      }
      return [deelRij(r.id, r.naam, lampen, `data-bb-kamer="${esc(r.id)}" data-bb-aan="${!lampen.some(aanVan)}"`)];
    };
    const voor = lijst.filter((r) => VOOR.includes(r.buitenSoort)).flatMap(rijen);
    const achter = lijst.filter((r) => !VOOR.includes(r.buitenSoort)).flatMap(rijen);
    const lampen = lijst.flatMap((r) => lampenIn(r.apparaten ?? []));
    const aan = lampen.filter(aanVan).length;
    return `${kop(t('buiten.alles'), aan ? t('buiten.allesZin', { n: aan }) : t('buiten.allesUitZin'))}
      ${lampen.length ? `<button type="button" class="knop ${aan ? 'knop-licht' : ''} bb-hoofd" data-bb-buiten ${aan ? '' : 'disabled'}>${esc(t('buiten.allesBuitenUit'))}</button>` : `<p class="mini">${esc(t('buiten.geenLampen'))}</p>`}
      ${voor.length ? `<h3 class="bb-sectie">${esc(t('buiten.voorHetHuis'))}</h3><div class="bb-lijst">${voor.join('')}</div>` : ''}
      ${achter.length ? `<h3 class="bb-sectie">${esc(t('buiten.inDeTuin'))}</h3><div class="bb-lijst">${achter.join('')}</div>` : ''}
      <p class="mini voet">${esc(t('buiten.allesVoet'))}</p>`;
  }

  /** Het blad voor een keuze: `{ alles: true }` of `{ kamer, zone }`. */
  function html(keuze, huis) {
    if (!keuze) return null;
    return keuze.alles ? allesHtml(huis) : deelHtml(huis, keuze.kamer, keuze.zone ?? null);
  }

  /** Hoeveel lampen buiten branden, voor de knop op Thuis. */
  const aantalAan = (huis) => ruimtes(huis).flatMap((r) => lampenIn(r.apparaten ?? [])).filter(aanVan).length;
  const heeftBuiten = (huis) => ruimtes(huis).length > 0;

  /**
   * Het huis zoals je het net koos: elke lamp die je schakelde staat al aan of
   * uit, ook in de tekening, voordat Home Assistant het doorgeeft (28 oktober
   * 2026: een groep Hue-lampen doet er een paar tellen over).
   */
  function metGewenst(huis) {
    if (!huis || !gewenst.size) return huis;
    return {
      ...huis,
      etages: huis.etages.map((e) => ({
        ...e,
        ruimtes: e.ruimtes.map((r) => (r.apparaten.some((d) => gewenst.has(d.id)) ? { ...r, apparaten: r.apparaten.map((d) => (gewenst.has(d.id) ? { ...d, aan: gewenst.get(d.id) } : d)) } : r)),
      })),
    };
  }

  /**
   * Een tik in het blad. Geeft een nieuwe keuze terug als er een ander deel
   * open moet, `true` als er geschakeld is, anders null. `meteen` tekent wat je
   * koos al voordat Home Assistant antwoordt; `opnieuw` leest het huis opnieuw,
   * zodra Home Assistant de nieuwe stand kan doorgeven.
   */
  async function tik(knop, huis, opnieuw, meteen = () => {}) {
    const ds = knop.dataset;
    if (ds.bbOpen) {
      if (ds.bbOpen === 'alles') return { alles: true };
      const [kamer, zone] = ds.bbOpen.split('::');
      return { kamer, zone: zone ?? null };
    }
    let body = null;
    let raakt = [];
    const alle = ruimtes(huis);
    if (ds.bbLamp) {
      const d = alle.flatMap((r) => r.apparaten ?? []).find((x) => x.id === ds.bbLamp);
      const aan = knop.getAttribute('aria-checked') !== 'true';
      body = { doel: 'lamp', id: ds.bbLamp, aan };
      raakt = d ? [[d, aan]] : [];
    } else if (ds.bbZone) {
      const [kamer, zone] = ds.bbZone.split('::');
      const aan = ds.bbAan === 'true';
      body = { doel: 'zone', id: ds.bbZone, aan };
      raakt = lampenIn(alle.find((r) => r.id === kamer)?.apparaten ?? []).filter((d) => d.zone === zone).map((d) => [d, aan]);
    } else if (ds.bbKamer) {
      const aan = ds.bbAan === 'true';
      body = { doel: 'kamer', id: ds.bbKamer, aan };
      raakt = lampenIn(alle.find((r) => r.id === ds.bbKamer)?.apparaten ?? []).map((d) => [d, aan]);
    } else if (knop.hasAttribute('data-bb-buiten')) {
      body = { doel: 'buiten', id: null, aan: false };
      raakt = alle.flatMap((r) => lampenIn(r.apparaten ?? [])).map((d) => [d, false]);
    }
    if (!body) return null;
    for (const [d, aan] of raakt) gewenst.set(d.id, aan);
    // Meteen omzetten: de schakelaar wacht niet op de lamp.
    meteen();
    await global.app.deur('api/licht', body).catch(() => null);
    // Even wachten tot Home Assistant de nieuwe stand doorgeeft; tot dan staat er wat je koos.
    for (const ms of [800, 2500]) setTimeout(() => void opnieuw(), ms);
    setTimeout(() => {
      for (const [d] of raakt) gewenst.delete(d.id);
      void opnieuw();
    }, 6000);
    return true;
  }

  global.buitenBlad = { html, tik, metGewenst, isBuiten, aantalAan, heeftBuiten };
})(window);
