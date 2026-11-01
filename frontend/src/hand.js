/*
 * Klimaat met de hand (besluit 235, schetsen Wand-Klimaat-Hand en
 * Tel-Klimaat-Hand). Een laag over de pagina: links de klimaatapparaten en de
 * stekkers met een warmtebron, met wat ze nu doen en wat met de hand staat;
 * rechts het blad van het gekozen apparaat: het doel met min en plus, wat
 * (warm of koelen), hoe lang, de dag als balk, en eerlijk via welke knop het
 * gaat. Op de telefoon eerst de lijst, dan het blad, van onderen.
 *
 * De dienst (`api/hand`) doet het werk: de knop van de regeling, de airco zelf
 * op warm, de stekker, en op tijd terug.
 */
(function (global) {
  'use strict';
  if (global.hand) return;

  const { esc, nl, haal, deur, telStand, klokVan } = global.app;
  const t = (k, p) => global.t(k, p);

  let data = null;
  /** Het gekozen apparaat en wat je erin kiest; null zonder laag. */
  let open = null;
  let fout = '';

  const graden = (n) => `${nl(n, Number.isInteger(n) ? 0 : 1)}°`;
  const alle = () => [...(data?.apparaten ?? []), ...(data?.schakelaars ?? []).map((s) => ({ ...s, schakelaar: true }))];
  const vind = (id) => alle().find((a) => a.id === id) ?? null;

  /** Wat het apparaat nu doet, als korte zin. */
  function nuZin(a) {
    if (a.schakelaar) return a.totMs ? t('hand.aanTot', { klok: klokVan(a.totMs) }) : t(a.aan ? 'hand.staatAan' : 'hand.staatUit');
    if (a.actief) return a.actief.modus === 'koelen' ? t('hand.handKoelen', { doel: graden(a.actief.doelC), klok: klokVan(a.actief.totMs) }) : t('hand.handOp', { doel: graden(a.actief.doelC), klok: klokVan(a.actief.totMs) });
    const hvac = a.hvac === 'heat' ? t('hand.verwarmt') : a.hvac === 'cool' ? t('hand.koelt') : a.hvac === 'off' ? t('hand.uit') : '';
    return [t('hand.volgt'), hvac].filter(Boolean).join(' · ');
  }

  function regel(a) {
    const m = a.modi?.[0];
    const rechts = a.schakelaar ? (a.totMs || a.aan ? t('hand.aan') : t('hand.uitKort')) : m?.doelC != null ? graden(m.doelC) : '';
    const onder = a.schakelaar ? t('hand.direct') : m?.modus === 'koelen' && a.modi.length === 1 ? t('hand.koelenBij') : t('hand.doel');
    return `<button type="button" class="hand-regel${open?.id === a.id ? ' gekozen' : ''}" data-hand-kies="${esc(a.id)}"><div><b>${esc(a.naam)}</b><span class="${a.actief || a.totMs ? 'hand-actief' : ''}">${esc(nuZin(a))}</span></div><div class="temp">${esc(rechts)}<small>${esc(onder)}</small></div></button>`;
  }

  /** Tot wanneer, uit de keuze: een uur, twee uur, of het eind van het dagdeel. */
  const totVan = (keus) => (keus === 'u1' ? Date.now() + 3_600_000 : keus === 'u2' ? Date.now() + 2 * 3_600_000 : data.dagdeelTotMs);

  /** De dag als balk: van nu tot de eindtijd in zonkleur. */
  function dagbalk(totMs) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const pct = (ms) => Math.max(0, Math.min(100, ((ms - d.getTime()) / 86_400_000) * 100));
    const nu = pct(Date.now());
    const tot = pct(totMs);
    return `<div class="hand-dag" role="img" aria-label="${esc(t('hand.balkUitleg', { klok: klokVan(totMs) }))}"><div class="balk24"><i class="hand" style="left: ${nu.toFixed(1)}%; width: ${Math.max(1, tot - nu).toFixed(1)}%"></i><b style="left: ${nu.toFixed(1)}%"></b></div><div class="assen"><span style="left: 0; transform: none">0</span>${tot - nu > 14 ? `<span style="left: ${nu.toFixed(1)}%">${esc(t('hand.nu'))}</span>` : ''}<span style="left: ${Math.min(tot, 88).toFixed(1)}%" class="tot">${esc(t('hand.terugOm', { klok: klokVan(totMs) }))}</span><span style="right: 0; left: auto; transform: none">24</span></div></div>`;
  }

  /** Eerlijk: via welke knop, wat de regeling ermee doet, en wanneer het terug gaat. */
  function hoeZin(a, m, totMs) {
    const klok = klokVan(totMs);
    if (!data.aan) return { let: true, tekst: t('hand.staatUitZin') };
    if (m.niet === 'koelstrategie') return { let: true, tekst: t('hand.nietKoelen') };
    if (m.niet === 'vakantie') return { let: true, tekst: t('hand.nietVakantie') };
    const terug = m.standaardC != null ? graden(m.standaardC) : '';
    if (m.via === 'direct') return { let: true, tekst: t('hand.zinDirect', { doel: graden(open.doel), klok }) };
    if (m.modus === 'koelen') return { tekst: t('hand.zinKoelen', { doel: graden(open.doel), klok, terug }) };
    if (/badkamer/.test(a.id)) return { tekst: t('hand.zinBadkamer', { doel: graden(open.doel), klok, terug }) };
    return { tekst: t('hand.zinKnop', { klok, terug }) };
  }

  function blad(a) {
    const totMs = totVan(open.tot);
    const seg = (naam, keuzes) => `<div class="chips seg hand-seg" role="group" aria-label="${esc(naam)}">${keuzes.map(([k, w, aan, attr]) => `<button type="button" class="chip" ${attr}="${k}" aria-pressed="${aan}">${esc(w)}</button>`).join('')}</div>`;
    const lang = seg(t('hand.hoeLang'), [['u1', t('hand.uur1'), open.tot === 'u1', 'data-hand-tot'], ['u2', t('hand.uur2'), open.tot === 'u2', 'data-hand-tot'], ['dagdeel', t('hand.totKlok', { klok: klokVan(data.dagdeelTotMs) }), open.tot === 'dagdeel', 'data-hand-tot']]);
    const kop = `<div class="hand-boven"><div><button type="button" class="hand-lijstknop" data-hand-lijst>‹ ${esc(t('hand.alle'))}</button><h2>${esc(a.naam)}</h2><p class="nu">${esc([a.kamer, a.nuC != null ? t('hand.nuGraden', { graden: graden(a.nuC) }) : null, nuZin(a)].filter(Boolean).join(' · '))}</p></div><button type="button" class="sluit" data-hand-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>`;
    const terugKnop = a.actief || a.totMs ? `<button type="button" class="hand-terug" data-hand-terug>${esc(t(a.schakelaar ? 'hand.zetUit' : 'hand.terug'))}</button>` : '';
    if (a.schakelaar) {
      return `${kop}<div class="hand-vraag"><span>${esc(t('hand.hoeLang'))}</span>${lang}</div>${dagbalk(totMs)}<div class="hand-hoe">${esc(data.aan ? t('hand.zinStekker', { klok: klokVan(totMs) }) : t('hand.staatUitZin'))}</div>${fout ? `<p class="hand-fout">${esc(fout)}</p>` : ''}<div class="hand-onder">${terugKnop}<button type="button" class="hand-zet" data-hand-zet ${data.aan ? '' : 'disabled'}>${esc(t('hand.zetAanTot', { klok: klokVan(totMs) }))}</button></div>`;
    }
    const m = a.modi.find((x) => x.modus === open.modus) ?? a.modi[0];
    const wat = a.modi.length > 1 ? `<div class="hand-vraag"><span>${esc(t('hand.wat'))}</span>${seg(t('hand.wat'), a.modi.map((x) => [x.modus, t(`hand.modus.${x.modus}`), x.modus === m.modus, 'data-hand-modus']))}</div>` : '';
    const hoe = hoeZin(a, m, totMs);
    const kan = data.aan && !m.niet;
    const zet = m.via === 'direct' ? t('hand.zetWarm', { klok: klokVan(totMs) }) : m.modus === 'koelen' ? t('hand.zetKoel', { doel: graden(open.doel) }) : a.actief ? t('hand.bewaar') : t('hand.zetOp', { doel: graden(open.doel) });
    const doelZin = m.modus === 'koelen' ? t('hand.doelKoelen', { doel: graden(open.doel) }) : m.via === 'direct' ? t('hand.doelWarm', { doel: graden(open.doel) }) : t('hand.doelKnop', { standaard: m.standaardC != null ? graden(m.standaardC) : '–' });
    return `${kop}
      <div class="hand-doel"><button type="button" data-hand-doel="-1" aria-label="${esc(t('hand.lager'))}" ${open.doel - m.stap < m.min ? 'disabled' : ''}>−</button><div class="getal"><b>${esc(graden(open.doel))}</b><span>${esc(doelZin)}</span></div><button type="button" data-hand-doel="1" aria-label="${esc(t('hand.hoger'))}" ${open.doel + m.stap > m.max ? 'disabled' : ''}>+</button></div>
      ${wat}
      <div class="hand-vraag"><span>${esc(t('hand.hoeLang'))}</span>${lang}</div>
      ${dagbalk(totMs)}
      <div class="hand-hoe${hoe.let ? ' let' : ''}">${esc(hoe.tekst)}</div>
      ${fout ? `<p class="hand-fout">${esc(fout)}</p>` : ''}
      <div class="hand-onder">${terugKnop}<button type="button" class="hand-zet" data-hand-zet ${kan ? '' : 'disabled'}>${esc(zet)}</button></div>`;
  }

  function teken() {
    let laag = document.querySelector('[data-hand]');
    if (!open) {
      laag?.remove();
      return;
    }
    if (!laag) {
      laag = document.createElement('div');
      laag.className = 'hand-laag';
      laag.setAttribute('data-hand', '');
      laag.setAttribute('role', 'dialog');
      laag.setAttribute('aria-modal', 'true');
      laag.setAttribute('aria-label', t('hand.kop'));
      (telStand() ? document.body : (document.getElementById('wand') ?? document.body)).append(laag);
    }
    laag.classList.toggle('tel', telStand());
    const a = open.id ? vind(open.id) : null;
    const lijst = `<section class="glas hand-lijst"><div class="hand-lijstkop"><h2>${esc(t('hand.kop'))}</h2><button type="button" class="sluit hand-lijstsluit" data-hand-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>${alle().map(regel).join('') || `<p class="mini">${esc(t('hand.niets'))}</p>`}<p class="tip">${esc(t('hand.tip'))}</p></section>`;
    const rechts = a ? `<section class="glas hand-blad">${blad(a)}</section>` : '';
    // Op de telefoon één tegelijk: de lijst, of het blad.
    laag.innerHTML = telStand() ? `<div class="hand-achter" data-hand-sluit></div><div class="hand-vel">${a ? rechts : lijst}</div>` : `<div class="hand-achter" data-hand-sluit></div><div class="hand-vak">${lijst}${rechts}</div>`;
  }

  function kies(id) {
    const a = vind(id);
    if (!a) return;
    const actief = a.actief ?? null;
    const m = a.modi?.find((x) => x.modus === actief?.modus) ?? a.modi?.find((x) => !x.niet) ?? a.modi?.[0];
    open = { id, modus: m?.modus ?? null, doel: actief?.doelC ?? m?.doelC ?? 20, tot: 'dagdeel' };
    fout = '';
    teken();
  }

  async function laad() {
    try {
      data = await haal('api/hand');
    } catch {
      data = null;
    }
    return data;
  }

  /** Opent de laag, met een apparaat als dat gegeven is (op de wand anders het eerste). */
  async function openen(id = null) {
    if (!data) await laad();
    if (!data) return;
    open = { id: null };
    if (id || !telStand()) kies(id ?? alle()[0]?.id);
    else teken();
  }

  async function stuur(body) {
    const res = await deur('api/hand', body);
    if (!res) return false;
    if (!res.ok) {
      fout = (await res.json().catch(() => null))?.fout ?? t('hand.lukteNiet');
      teken();
      return false;
    }
    fout = '';
    await laad();
    global.dispatchEvent(new CustomEvent('handveranderd'));
    return true;
  }

  document.addEventListener('click', async (e) => {
    if (!open) return;
    const el = (s) => e.target.closest(s);
    let x;
    if (el('[data-hand-sluit]')) open = null;
    else if (el('[data-hand-lijst]')) open = { id: null };
    else if ((x = el('[data-hand-kies]'))) return kies(x.dataset.handKies);
    else if ((x = el('[data-hand-tot]'))) open.tot = x.dataset.handTot;
    else if ((x = el('[data-hand-modus]'))) {
      const m = vind(open.id)?.modi.find((y) => y.modus === x.dataset.handModus);
      if (m) Object.assign(open, { modus: m.modus, doel: m.doelC ?? open.doel });
    } else if ((x = el('[data-hand-doel]'))) {
      const m = vind(open.id)?.modi.find((y) => y.modus === open.modus);
      if (m) open.doel = Math.max(m.min, Math.min(m.max, Math.round((open.doel + Number(x.dataset.handDoel) * m.stap) * 10) / 10));
    } else if (el('[data-hand-terug]')) {
      await stuur({ id: open.id, terug: true });
    } else if (el('[data-hand-zet]')) {
      const a = vind(open.id);
      await stuur(a?.schakelaar ? { id: open.id, totMs: totVan(open.tot) } : { id: open.id, modus: open.modus, doelC: open.doel, totMs: totVan(open.tot) });
    } else return;
    teken();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      open = null;
      teken();
    }
  });

  global.hand = { laad, openen, data: () => data, nuZin };
})(window);
