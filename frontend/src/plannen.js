/*
 * Nieuw in Vast en gepland (besluit 240, schetsen Wand-Gepland-Nieuw en
 * Tel-Gepland-Nieuw). Eerst de keuze: zeg het, of kies het zelf. Zeg je het,
 * dan leest de dienst er een voorstel uit (niets bewaard) en sta je bij Klaar.
 * Kies je zelf, dan vier stappen: wat, wanneer, hoe vaak, klaar. Op de wand
 * staan de stappen links en groeit rechts de zin mee met het moment op de
 * boog; op de telefoon één stap per scherm, de zin bovenaan, de boog bij Klaar.
 *
 * Wat kan: licht, scènes, screens, en klimaat met de hand en witgoed als die er
 * zijn (api/hand en api/witgoed antwoorden alleen in de add-on, en klimaat met
 * de hand alleen als het bij Functies aan staat). Bewaren gaat naar
 * api/te-doen met actie plan; de dienst rekent het eerste moment uit.
 *
 * gepland.js opent het met `plannen.open(hulp)`: de boog, de namen van hoe vaak
 * en van de zon, en wat er na bewaren opnieuw geladen moet worden.
 */
'use strict';

(function (global) {
  const { esc, haal, deur, telStand } = global.app;
  const { klok } = global.taal;
  const t = (k, v) => global.t(k, v);
  const STAPPEN = ['wat', 'wanneer', 'hoevaak', 'klaar'];
  const SOORTEN = ['licht', 'scene', 'scherm', 'klimaat', 'witgoed'];
  const IK = {
    licht: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    scene: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    scherm: '<rect x="4" y="4" width="16" height="4" rx="1"/><path d="M6 8v11h12V8M6 13h12"/>',
    klimaat: '<path d="M12 3v10M8.5 16a3.5 3.5 0 1 0 7 0c0-1.3-.7-2.4-1.5-3V5a2 2 0 0 0-4 0v8c-.8.6-1.5 1.7-1.5 3z"/>',
    witgoed: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7 6.5h2"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  };
  const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const graden = (c) => `${String(c).replace('.', global.taal.code === 'en' ? '.' : ',')}°`;

  /** Wat open staat; null als het blad dicht is. */
  let st = null;
  /** Het huis, klimaat met de hand en het witgoed: waar je uit kiest. */
  let bron = null;
  /** Van gepland.js: boog, herhaalNaam, zonNaam, stapperTekst, voorproef, zon, klaar. */
  let hulp = null;

  function open(h) {
    hulp = h;
    st = { stap: 'kies', soort: null, keuze: null, hoe: {}, moment: { soort: 'tijd', uur: 7, minuut: 0 }, herhaal: { soort: 'een' }, herhaalOpen: false, overslaanWeg: false, aan: true, zeg: '', voorstel: null, momenten: null, bezig: false, fout: '', luistert: false };
    teken();
    void laadBron();
  }

  function sluit() {
    st = null;
    for (const el of document.querySelectorAll('[data-pl]')) el.remove();
  }

  async function laadBron() {
    const [h, k, w] = await Promise.allSettled([haal('api/huis'), haal('api/hand'), haal('api/witgoed')]);
    const ok = (x) => (x.status === 'fulfilled' ? x.value : null);
    bron = { huis: ok(h), hand: ok(k), witgoed: ok(w) };
    if (st) {
      if (!st.soort) st.soort = SOORTEN.find((s) => opties(s).length) ?? null;
      teken();
    }
  }

  /* ------------------------------------------------------------ wat er is */

  function ruimtes() {
    return (bron?.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []);
  }
  function vanSoort(soort) {
    return ruimtes().flatMap((r) => (r.apparaten ?? []).filter((d) => d.soort === soort).map((d) => ({ ...d, kamer: r.naam, kamerId: r.id })));
  }

  /** De keuzes van een soort: naam, onder de naam iets kleins, en de stappen bij een hoe. */
  function opties(soort) {
    if (soort === 'licht') {
      const lampen = vanSoort('licht');
      const kamers = ruimtes().filter((r) => lampen.filter((l) => l.kamerId === r.id).length > 1);
      return [
        ...kamers.map((r) => ({ sleutel: `k:${r.id}`, naam: t('pl.alleLampen', { kamer: r.naam }), sub: t('pl.lampen', { n: lampen.filter((l) => l.kamerId === r.id).length }), alle: true, stappen: (hoe) => [{ pad: 'api/licht', body: { doel: 'kamer', id: r.id, aan: hoe.aan !== false } }] })),
        ...lampen.map((l) => ({ sleutel: `l:${l.id}`, naam: l.naam, sub: l.kamer, stappen: (hoe) => [{ pad: 'api/licht', body: { doel: 'lamp', id: l.id, aan: hoe.aan !== false } }] })),
      ];
    }
    if (soort === 'scene') {
      const gezien = new Set();
      return ruimtes()
        .flatMap((r) => (r.scenes ?? []).map((s) => ({ ...s, kamer: r.naam })))
        .filter((s) => !gezien.has(s.id) && gezien.add(s.id))
        .map((s) => ({ sleutel: `s:${s.id}`, naam: s.naam, sub: s.kamer, stappen: () => [{ pad: 'api/scene', body: { id: s.id } }] }));
    }
    if (soort === 'scherm') {
      const schermen = vanSoort('screen');
      const stap = (s, hoe) => (hoe.actie === 'half' ? { pad: 'api/scherm', body: { id: s.id, actie: 'stand', standPct: 50 } } : { pad: 'api/scherm', body: { id: s.id, actie: hoe.actie ?? 'dicht' } });
      const half = (lijst) => lijst.every((s) => s.scherm?.standKiezen);
      return [
        ...(schermen.length > 1 ? [{ sleutel: 'alle', naam: t('pl.alleSchermen'), sub: t('pl.schermen', { n: schermen.length }), alle: true, half: half(schermen), stappen: (hoe) => schermen.slice(0, 6).map((s) => stap(s, hoe)) }] : []),
        ...schermen.map((s) => ({ sleutel: s.id, naam: s.naam, sub: s.kamer, half: half([s]), stappen: (hoe) => [stap(s, hoe)] })),
      ];
    }
    if (soort === 'klimaat') {
      const h = bron?.hand;
      if (!h?.aan) return [];
      return [
        ...(h.apparaten ?? []).filter((a) => (a.modi ?? []).some((m) => !m.niet)).map((a) => ({ sleutel: a.id, naam: a.naam, sub: a.kamer ?? '', klimaat: a, stappen: (hoe) => [{ pad: 'api/hand', body: { id: a.id, modus: hoe.modus, doelC: hoe.doelC, tot: hoe.tot ?? 'dagdeel' } }] })),
        ...(h.schakelaars ?? []).map((s) => ({ sleutel: s.id, naam: s.naam, sub: s.kamer ?? '', stekker: true, stappen: (hoe) => [{ pad: 'api/hand', body: { id: s.id, tot: hoe.tot === 'doel' ? 'dagdeel' : hoe.tot ?? 'dagdeel' } }] })),
      ];
    }
    if (soort === 'witgoed') return (bron?.witgoed?.apparaten ?? []).map((w) => ({ sleutel: w.id, naam: w.naam, sub: '', stappen: () => [{ pad: 'api/witgoed', body: { id: w.id, start: true } }] }));
    return [];
  }

  /** Begin van hoe, bij een nieuwe keus: een klimaatapparaat op het doel van zijn eerste stand. */
  function beginHoe(o) {
    if (o?.klimaat) {
      const m = o.klimaat.modi.find((x) => !x.niet) ?? o.klimaat.modi[0];
      return { modus: m.modus, doelC: m.doelC ?? m.standaardC ?? 20, tot: 'doel' };
    }
    if (o?.stekker) return { tot: 'uur1' };
    return st.soort === 'scherm' ? { actie: 'dicht' } : { aan: true };
  }

  /** "Screens dicht", "Lamp keuken aan", "Zolder verwarmen tot 21°": de naam van de opdracht. */
  function watZin() {
    if (st.voorstel) return st.voorstel.wat ? st.voorstel.wat.charAt(0).toUpperCase() + st.voorstel.wat.slice(1) : st.voorstel.tekst;
    const o = opties(st.soort).find((x) => x.sleutel === st.keuze);
    if (!o) return '';
    const h = st.hoe;
    if (st.soort === 'licht') return t(h.aan === false ? 'pl.wat.lichtUit' : 'pl.wat.lichtAan', { naam: o.naam });
    if (st.soort === 'scene') return t('pl.wat.scene', { naam: o.naam });
    if (st.soort === 'scherm') return t(`pl.wat.${h.actie ?? 'dicht'}`, { naam: o.naam });
    if (st.soort === 'klimaat') return o.stekker ? t('pl.wat.stekker', { naam: o.naam }) : t(h.modus === 'koelen' ? 'pl.wat.koelen' : 'pl.wat.verwarmen', { naam: o.naam, doel: graden(h.doelC) });
    if (st.soort === 'witgoed') return t('pl.wat.witgoed', { naam: o.naam });
    return '';
  }

  function stappenNu() {
    if (st.voorstel) return st.voorstel.stappen;
    const o = opties(st.soort).find((x) => x.sleutel === st.keuze);
    return o ? o.stappen(st.hoe) : [];
  }

  /** "om 07:00", "10 min voor zonsondergang". */
  const wanneerZin = (m) => (m.soort === 'tijd' ? t('pl.om', { klok: `${String(m.uur).padStart(2, '0')}:${String(m.minuut).padStart(2, '0')}` }) : hulp.zonNaam(m));

  /** Waar het nieuwe moment vandaag op de boog staat; de dienst rekent het echte moment uit. */
  function vandaagMs(m) {
    if (m.soort === 'tijd') return new Date().setHours(m.uur, m.minuut, 0, 0);
    const zon = hulp.zon()?.dag;
    const z = m.zon === 'op' ? zon?.opMs : zon?.onderMs;
    return z == null ? null : z + m.minuten * 60_000;
  }

  /* ------------------------------------------------------------ tekenen */

  function zin() {
    const nr = STAPPEN.indexOf(st.stap);
    const klaar = (i) => st.voorstel || nr > i || (i === 0 && st.keuze);
    const deel = (i, tekst, leeg) => (klaar(i) ? tekst : `<span class="leeg">${esc(leeg)}</span>`);
    const vaak = deel(2, esc(hulp.herhaalNaam(st.herhaal)), t('pl.leeg.hoevaak'));
    const wanneer = deel(1, `<em>${esc(wanneerZin(st.moment))}</em>`, t('pl.leeg.wanneer'));
    const w = watZin();
    const wat = deel(0, esc(w.charAt(0).toLowerCase() + w.slice(1)), t('pl.leeg.wat'));
    return `${vaak}, ${wanneer}, ${wat}.`;
  }

  function boogHtml() {
    // Het moment van de dienst als dat vandaag is, zodat de boog en de lijst dezelfde minuut zeggen.
    const eerste = st.momenten?.[0];
    const ms = eerste != null && new Date(eerste).toDateString() === new Date().toDateString() ? eerste : vandaagMs(st.moment);
    const nr = STAPPEN.indexOf(st.stap);
    const lijst = ms != null && (st.voorstel || nr >= 1) ? [{ ms, wat: watZin(), aan: true, gekozen: true }] : [];
    return hulp.boog(lijst, true);
  }

  function kiesHtml() {
    const mic = global.luisteren?.kan?.() && global.luisteren?.eenmaal ? `<button type="button" class="pl-mic${st.luistert ? ' aan' : ''}" data-pl-mic aria-label="${esc(t('pl.inspreken'))}">${svg(IK.mic)}</button>` : '';
    const voorbeelden = [1, 2, 3].map((i) => `<button type="button" data-pl-voorbeeld="${i}"><span>${esc(t(`pl.voorbeeld.${i}`))}</span><i>›</i></button>`).join('');
    return `<section class="pl-begin">
      <h2>${esc(t('pl.vraag'))}</h2>
      <div class="pl-wegen">
        <div class="pl-weg zeg">
          <h3>${esc(t('pl.zeg'))}</h3><p>${esc(t('pl.zegZin'))}</p>
          <form class="pl-invoer" data-pl-zeg><input type="text" maxlength="200" value="${esc(st.zeg)}" placeholder="${esc(t('pl.zegVoorbeeld'))}" aria-label="${esc(t('pl.zeg'))}">${mic}<button type="submit" class="pl-maak"${st.bezig ? ' disabled' : ''}>${esc(t('pl.maak'))}</button></form>
          ${st.fout ? `<p class="pl-fout">${esc(st.fout)}</p>` : ''}
          <div class="pl-voorbeelden">${voorbeelden}</div>
        </div>
        <div class="pl-weg zelf">
          <h3>${esc(t('pl.zelf'))}</h3><p>${esc(t('pl.zelfZin'))}</p>
          <div class="pl-vier">${STAPPEN.map((s, i) => `<div><i>${i + 1}</i>${esc(t(`pl.s.${s}`))}</div>`).join('')}</div>
          <button type="button" class="pl-gaan" data-pl-stap="wat">${esc(t('pl.begin'))}</button>
        </div>
      </div>
    </section>`;
  }

  function watHtml() {
    const kan = SOORTEN.filter((s) => opties(s).length);
    if (!bron) return `<p class="mini">${esc(t('algemeen.laden'))}</p>`;
    if (!kan.length) return `<p class="pl-leeg">${esc(t('pl.geenSoort'))}</p>`;
    const seg = `<div class="pl-seg pl-soorten" role="group">${kan.map((s) => `<button type="button" data-pl-soort="${s}" aria-pressed="${st.soort === s}">${svg(IK[s])}<span>${esc(t(`pl.soort.${s}`))}</span></button>`).join('')}</div>`;
    const lijst = opties(st.soort);
    const dingen = `<div class="pl-dingen">${lijst.map((o) => `<button type="button" class="pl-ding${o.alle ? ' alle' : ''}" data-pl-keuze="${esc(o.sleutel)}" aria-pressed="${st.keuze === o.sleutel}">${svg(IK[st.soort])}<b>${esc(o.naam)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</button>`).join('')}</div>`;
    const o = lijst.find((x) => x.sleutel === st.keuze);
    return `<h3 class="pl-kop">${esc(t('pl.k.wat'))}</h3>${seg}${dingen}${o ? hoeHtml(o) : ''}`;
  }

  function knop(attr, waarde, naam, gekozen) {
    return `<button type="button" ${attr}="${esc(waarde)}" aria-pressed="${gekozen}">${esc(naam)}</button>`;
  }

  function hoeHtml(o) {
    const h = st.hoe;
    if (st.soort === 'licht') return `<div class="pl-vraag"><span>${esc(t('pl.hoe'))}</span><div class="pl-seg">${knop('data-pl-aan', '1', t('pl.aan'), h.aan !== false)}${knop('data-pl-aan', '0', t('pl.uit'), h.aan === false)}</div></div>`;
    if (st.soort === 'scherm') {
      const acties = ['dicht', ...(o.half ? ['half'] : []), 'open'];
      return `<div class="pl-vraag"><span>${esc(t('pl.hoe'))}</span><div class="pl-seg">${acties.map((a) => knop('data-pl-actie', a, t(`pl.${a}`), (h.actie ?? 'dicht') === a)).join('')}</div></div>`;
    }
    if (st.soort === 'klimaat') {
      const totten = o.stekker ? ['uur1', 'uur2', 'dagdeel'] : ['uur1', 'uur2', 'dagdeel', 'doel'];
      const tot = `<div class="pl-vraag"><span>${esc(t('pl.hoeLang'))}</span><div class="pl-seg">${totten.map((x) => knop('data-pl-tot', x, t(`pl.tot.${x}`), (h.tot ?? 'dagdeel') === x)).join('')}</div></div>`;
      if (o.stekker) return tot;
      const modi = o.klimaat.modi.filter((m) => !m.niet);
      const m = modi.find((x) => x.modus === h.modus) ?? modi[0];
      const modus = modi.length > 1 ? `<div class="pl-seg">${modi.map((x) => knop('data-pl-modus', x.modus, t(`pl.${x.modus}`), x.modus === m.modus)).join('')}</div>` : '';
      const doel = `<div class="pl-stapper"><button type="button" data-pl-doel="-1" aria-label="${esc(t('pl.lager'))}">−</button><b>${esc(graden(h.doelC))}</b><button type="button" data-pl-doel="1" aria-label="${esc(t('pl.hoger'))}">+</button></div>`;
      return `<div class="pl-vraag"><span>${esc(t('pl.hoe'))}</span>${modus}${doel}</div>${tot}`;
    }
    return '';
  }

  function wanneerHtml() {
    const m = st.moment;
    const seg = [['tijd', t('gp.tijd')], ['op', t('gp.op')], ['onder', t('gp.onder')]].map(([k, naam]) => knop('data-pl-wanneer', k, naam, k === 'tijd' ? m.soort === 'tijd' : m.soort === 'zon' && m.zon === k)).join('');
    const tijd = `${String(m.uur ?? 7).padStart(2, '0')}:${String(m.minuut ?? 0).padStart(2, '0')}`;
    const keuze = m.soort === 'tijd'
      ? `<input class="pl-tijd" type="time" value="${tijd}" data-pl-tijd aria-label="${esc(t('gp.tijd'))}">`
      : `<div class="pl-vraag"><span>${esc(t('pl.ervoorErna'))}</span><div class="pl-stapper"><button type="button" data-pl-min="-5" aria-label="${esc(t('gp.eerder'))}">−</button><b>${esc(hulp.stapperTekst(m))}</b><button type="button" data-pl-min="5" aria-label="${esc(t('gp.later'))}">+</button></div><div class="pl-zo">${esc(hulp.voorproef(m))}</div></div>`;
    return `<h3 class="pl-kop">${esc(t('pl.k.wanneer'))}</h3><div class="pl-seg">${seg}</div>${keuze}`;
  }

  function hoevaakHtml() {
    const h = st.herhaal;
    const keuzes = ['een', 'dag', 'werkdagen', 'weekend', 'dagen'].map((s) => `<button type="button" data-pl-herhaal="${s}" aria-pressed="${h.soort === s}"><span>${esc(t(s === 'dagen' ? 'gp.kiesDagen' : `gp.h.${s}`))}</span></button>`).join('');
    const dagen = h.soort === 'dagen' ? `<div class="pl-dagen">${[1, 2, 3, 4, 5, 6, 7].map((d) => knop('data-pl-dag', d, t(`gp.d${d}`), (h.dagen ?? []).includes(d))).join('')}</div>` : '';
    return `<h3 class="pl-kop">${esc(t('pl.k.hoevaak'))}</h3><div class="pl-keus">${keuzes}</div>${dagen}
      <div class="pl-rij"><span>${esc(t('gp.overslaan'))}<small>${esc(t('gp.overslaanZin'))}</small></span><button class="schakelaar" type="button" role="switch" aria-checked="${st.overslaanWeg}" aria-label="${esc(t('gp.overslaan'))}" data-pl-weg></button></div>`;
  }

  function klaarHtml(tel) {
    const ms = st.momenten;
    const dag = (x) => {
      const n = Math.round((new Date(x).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
      // Verder dan een week: de datum erbij, anders staat er twee keer "vr".
      return n === 0 ? t('gp.vandaag') : n === 1 ? t('gp.morgen') : new Intl.DateTimeFormat(global.taal.code === 'en' ? 'en-GB' : 'nl-NL', n > 6 ? { weekday: 'short', day: 'numeric' } : { weekday: 'short' }).format(x).replace('.', '');
    };
    let week = `<p class="mini">${esc(t('algemeen.laden'))}</p>`;
    if (ms && !ms.length) week = `<p class="pl-fout">${esc(t('pl.geenMoment'))}</p>`;
    else if (ms && tel) week = `<div class="pl-keus pl-lijstje">${ms.slice(0, 3).map((x) => `<div><span>${esc(dag(x))}</span><small>${esc(klok(x))}</small></div>`).join('')}</div>`;
    else if (ms) {
      // Hoe vroeger op de dag, hoe hoger: zo zie je de zon meeschuiven.
      const uren = ms.map((x) => new Date(x).getHours() + new Date(x).getMinutes() / 60);
      const lo = Math.min(...uren);
      const hi = Math.max(...uren);
      week = `<div class="pl-week">${ms.map((x, i) => `<div class="${i === 0 ? 'eerst' : ''}"><b>${esc(dag(x))}</b><span style="top: ${30 + (hi === lo ? 30 : ((uren[i] - lo) / (hi - lo)) * 60)}%">${esc(klok(x))}</span></div>`).join('')}</div>`;
    }
    const aan = `<div class="pl-rij"><span>${esc(t('pl.meteenAan'))}<small>${esc(t('pl.meteenAanZin'))}</small></span><button class="schakelaar" type="button" role="switch" aria-checked="${st.aan}" aria-label="${esc(t('pl.meteenAan'))}" data-pl-meteen></button></div>`;
    const kop = tel ? '' : `<h3 class="pl-kop">${esc(t(st.momenten?.length > 1 ? 'pl.k.klaar' : 'pl.k.klaarEen'))}</h3>`;
    return `${kop}${tel ? `<div class="pl-boog">${boogHtml()}</div>` : ''}${week}${aan}${st.fout ? `<p class="pl-fout">${esc(st.fout)}</p>` : ''}`;
  }

  function stapHtml(tel) {
    if (st.stap === 'wat') return watHtml();
    if (st.stap === 'wanneer') return wanneerHtml();
    if (st.stap === 'hoevaak') return hoevaakHtml();
    return klaarHtml(tel);
  }

  /** Mag je door: een keus bij Wat, dagen bij Kies dagen. */
  function kanVerder() {
    if (st.stap === 'wat') return !!st.keuze;
    if (st.stap === 'hoevaak') return st.herhaal.soort !== 'dagen' || (st.herhaal.dagen ?? []).length > 0;
    if (st.stap === 'klaar') return !!st.momenten?.length && !st.bezig;
    return true;
  }

  function knoppenHtml() {
    const laatste = st.stap === 'klaar';
    return `<div class="pl-knoppen"><button type="button" class="pl-terug" data-pl-terug>${esc(t('pl.terug'))}</button><button type="button" class="pl-verder${laatste ? ' zon' : ''}" data-pl-verder${kanVerder() ? '' : ' disabled'}>${esc(t(laatste ? 'pl.bewaar' : 'pl.verder'))}</button></div>`;
  }

  function stappenHtml() {
    const nr = STAPPEN.indexOf(st.stap);
    const waarde = { wat: st.keuze || st.voorstel ? watZin() : '', wanneer: nr > 1 || st.voorstel ? wanneerZin(st.moment) : '', hoevaak: nr > 2 || st.voorstel ? hulp.herhaalNaam(st.herhaal) : '' };
    return `<section class="pl-stappen"><h2>${esc(t('pl.titel'))}</h2><ol>${STAPPEN.map((s, i) => `<li class="${i < nr ? 'klaar' : i === nr ? 'nu' : ''}"><button type="button" data-pl-stap="${s}"${i > nr && !st.voorstel ? ' disabled' : ''}><i>${i < nr ? '✓' : i + 1}</i><b>${esc(t(`pl.s.${s}`))}</b><span>${esc(waarde[s] || t(`pl.s.${s}Leeg`))}</span></button></li>`).join('')}</ol>
      <p class="pl-hulp">${esc(t('pl.hulp'))} <button type="button" data-pl-stap="kies">${esc(t('pl.hulpLink'))}</button></p></section>`;
  }

  function teken() {
    if (!st) return;
    const tel = telStand();
    const ouder = document.getElementById(tel ? 'tel' : 'wand');
    for (const el of document.querySelectorAll('[data-pl]')) if (el.parentElement !== ouder) el.remove();
    let laag = ouder.querySelector(':scope > [data-pl]');
    if (!laag) {
      laag = document.createElement('div');
      laag.className = 'pl-laag';
      laag.setAttribute('data-pl', '');
      ouder.appendChild(laag);
    }
    // Wat je aan het typen was, blijft staan.
    const invoer = laag.querySelector('[data-pl-zeg] input');
    const focus = invoer && document.activeElement === invoer;
    const sluitKnop = `<button class="pl-sluit" type="button" data-pl-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button>`;
    let binnen;
    if (st.stap === 'kies') binnen = kiesHtml();
    else if (tel) {
      const nr = STAPPEN.indexOf(st.stap);
      binnen = `<div class="pl-stip">${STAPPEN.map((s, i) => `<i class="${i < nr ? 'ja' : i === nr ? 'nu' : ''}"></i>`).join('')}</div><div class="pl-zin">${zin()}</div><div class="pl-stap">${stapHtml(true)}</div>${knoppenHtml()}`;
    } else {
      binnen = `${stappenHtml()}<section class="pl-midden">${stapHtml(false)}${knoppenHtml()}</section>
        <section class="pl-voorbeeld"><span>${esc(t('pl.zoWordt'))}</span><div class="pl-zin">${zin()}</div><div class="pl-boog">${boogHtml()}</div><p class="pl-let">${esc(t('pl.let'))}</p></section>`;
    }
    laag.innerHTML = `${tel ? '<div class="pl-achter" data-pl-sluit></div>' : ''}<div class="pl-wiz${st.stap === 'kies' ? ' kies' : ''}" role="dialog" aria-modal="true" aria-label="${esc(t('pl.titel'))}">${tel ? '<div class="pl-greep"></div>' : ''}${sluitKnop}${binnen}</div>`;
    if (focus) {
      const nieuw = laag.querySelector('[data-pl-zeg] input');
      nieuw?.focus();
      nieuw?.setSelectionRange(nieuw.value.length, nieuw.value.length);
    }
  }

  /* ------------------------------------------------------------ doen */

  async function naarStap(s) {
    st.stap = s;
    st.fout = '';
    if (s === 'klaar') {
      st.momenten = null;
      teken();
      const res = await deur('api/te-doen', { actie: 'voorproef', moment: st.moment, herhaal: st.herhaal });
      st.momenten = res?.ok ? ((await res.json().catch(() => null))?.momenten ?? []) : [];
    }
    teken();
  }

  async function zeg(tekst) {
    st.zeg = tekst;
    if (!tekst.trim()) return;
    st.bezig = true;
    st.fout = '';
    teken();
    const q = new URLSearchParams({ v: 'vrij', tekst, taal: global.taal.code, voorstel: '1' });
    const body = await fetch(`api/vraag?${q}`).then((r) => r.json()).catch(() => null);
    st.bezig = false;
    const v = body?.voorstel;
    if (!v) {
      st.fout = body?.antwoord || t('pl.voorstelFout');
      return teken();
    }
    st.voorstel = v;
    st.moment = v.moment;
    st.herhaal = v.herhaal;
    st.soort = SOORTEN.find((s) => v.stappen?.[0]?.pad === { licht: 'api/licht', scene: 'api/scene', scherm: 'api/scherm', klimaat: 'api/hand', witgoed: 'api/witgoed' }[s]) ?? st.soort;
    await naarStap('klaar');
  }

  async function bewaar() {
    st.bezig = true;
    teken();
    const res = await deur('api/te-doen', { actie: 'plan', tekst: watZin(), stappen: stappenNu(), moment: st.moment, herhaal: st.herhaal.soort === 'dagen' ? st.herhaal : { soort: st.herhaal.soort }, overslaanWeg: st.overslaanWeg, aan: st.aan });
    st.bezig = false;
    if (!res) return;
    if (!res.ok) {
      st.fout = (await res.json().catch(() => null))?.fout ?? t('gp.lukteNiet');
      return teken();
    }
    const klaar = hulp.klaar;
    sluit();
    await klaar?.();
  }

  function luister() {
    if (st.luistert) return;
    st.luistert = true;
    teken();
    const op = (b) => {
      if (b.soort === 'tekst' || b.soort === 'fout' || b.soort === 'dicht') {
        st.luistert = false;
        if (b.soort === 'tekst' && b.tekst) return void zeg(b.tekst);
        if (b.soort === 'fout') st.fout = b.reden;
        teken();
      }
    };
    global.luisteren.eenmaal(op).catch(() => {
      st.luistert = false;
      st.fout = t('assistent.geenMicrofoon');
      teken();
    });
  }

  document.addEventListener('click', (e) => {
    if (!st) return;
    const el = (s) => e.target.closest(s);
    if (!el('[data-pl]')) return;
    let x;
    // Een andere keus maakt van een voorstel weer je eigen keus.
    const zelf = () => {
      if (st.voorstel) {
        st.voorstel = null;
        st.keuze = null;
      }
    };
    if (el('[data-pl-sluit]')) return sluit();
    if ((x = el('[data-pl-voorbeeld]'))) return void zeg(t(`pl.voorbeeld.${x.dataset.plVoorbeeld}`));
    if (el('[data-pl-mic]')) return luister();
    if ((x = el('[data-pl-stap]'))) {
      if (x.dataset.plStap === 'wat') zelf();
      return void naarStap(x.dataset.plStap);
    }
    if (el('[data-pl-terug]')) return void naarStap(STAPPEN[STAPPEN.indexOf(st.stap) - 1] ?? 'kies');
    if (el('[data-pl-verder]')) {
      if (!kanVerder()) return;
      if (st.stap === 'klaar') return void bewaar();
      return void naarStap(STAPPEN[STAPPEN.indexOf(st.stap) + 1]);
    }
    if ((x = el('[data-pl-soort]'))) {
      zelf();
      if (st.soort !== x.dataset.plSoort) st.keuze = null;
      st.soort = x.dataset.plSoort;
    } else if ((x = el('[data-pl-keuze]'))) {
      zelf();
      st.keuze = x.dataset.plKeuze;
      st.hoe = beginHoe(opties(st.soort).find((o) => o.sleutel === st.keuze));
    } else if ((x = el('[data-pl-aan]'))) st.hoe = { ...st.hoe, aan: x.dataset.plAan === '1' };
    else if ((x = el('[data-pl-actie]'))) st.hoe = { ...st.hoe, actie: x.dataset.plActie };
    else if ((x = el('[data-pl-tot]'))) st.hoe = { ...st.hoe, tot: x.dataset.plTot };
    else if ((x = el('[data-pl-modus]'))) {
      const o = opties('klimaat').find((y) => y.sleutel === st.keuze);
      const m = o?.klimaat.modi.find((y) => y.modus === x.dataset.plModus);
      st.hoe = { ...st.hoe, modus: x.dataset.plModus, doelC: m?.doelC ?? st.hoe.doelC };
    } else if ((x = el('[data-pl-doel]'))) {
      const o = opties('klimaat').find((y) => y.sleutel === st.keuze);
      const m = o?.klimaat.modi.find((y) => y.modus === st.hoe.modus) ?? o?.klimaat.modi[0];
      const stap = m?.stap ?? 0.5;
      st.hoe = { ...st.hoe, doelC: Math.round(Math.max(m?.min ?? 5, Math.min(m?.max ?? 35, st.hoe.doelC + Number(x.dataset.plDoel) * stap)) * 10) / 10 };
    } else if ((x = el('[data-pl-wanneer]'))) {
      const k = x.dataset.plWanneer;
      if (k === 'tijd' && st.moment.soort !== 'tijd') st.moment = { soort: 'tijd', uur: 7, minuut: 0 };
      else if (k !== 'tijd') st.moment = { soort: 'zon', zon: k, minuten: st.moment.soort === 'zon' ? st.moment.minuten : 0 };
    } else if ((x = el('[data-pl-min]'))) st.moment = { ...st.moment, minuten: Math.max(-180, Math.min(180, st.moment.minuten + Number(x.dataset.plMin))) };
    else if ((x = el('[data-pl-herhaal]'))) {
      const s = x.dataset.plHerhaal;
      st.herhaal = s === 'dagen' ? { soort: 'dagen', dagen: st.herhaal.dagen?.length ? st.herhaal.dagen : [new Date().getDay() || 7] } : { soort: s };
    } else if ((x = el('[data-pl-dag]'))) {
      const d = Number(x.dataset.plDag);
      const dagen = new Set(st.herhaal.dagen ?? []);
      if (dagen.has(d)) dagen.delete(d);
      else dagen.add(d);
      st.herhaal = { soort: 'dagen', dagen: [...dagen].sort((a, b) => a - b) };
    } else if (el('[data-pl-weg]')) st.overslaanWeg = !st.overslaanWeg;
    else if (el('[data-pl-meteen]')) st.aan = !st.aan;
    else return;
    teken();
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.closest?.('[data-pl-zeg]');
    if (!f || !st) return;
    e.preventDefault();
    void zeg(f.querySelector('input').value);
  });

  document.addEventListener('input', (e) => {
    if (st && e.target.closest?.('[data-pl-zeg]')) st.zeg = e.target.value;
  });

  document.addEventListener('change', (e) => {
    const tijd = e.target.closest?.('[data-pl-tijd]');
    if (!tijd || !st) return;
    const [u, m] = tijd.value.split(':').map(Number);
    if (Number.isInteger(u) && Number.isInteger(m)) st.moment = { soort: 'tijd', uur: u, minuut: m };
    teken();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && st) sluit();
  });
  addEventListener('resize', () => st && teken());

  global.plannen = { open, sluit, isOpen: () => st != null };
})(window);
