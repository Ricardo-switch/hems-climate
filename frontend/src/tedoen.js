/*
 * Te doen (besluit 216 en 217, schetsen Wand-Te-doen-tab en Tel-Te-doen-tab):
 * de kaart op Thuis, de eigen tab, en het moment op de wand als een
 * herinnering afgaat.
 *
 * - De kaart op Thuis: het afval van deze week, de eerstvolgende herinnering
 *   en de boodschappen. Een tik opent de tab. Verbergen kan bij Thuis
 *   aanpassen, zoals elke kaart.
 * - De tab (tedoen.html): je herinneringen (op een scherm die van iedereen),
 *   de agenda van twee weken (afval, gezin en je eigen agenda's, elk een
 *   kleur), en de lijsten van Home Assistant om af te vinken of aan te vullen.
 *   Een nieuwe herinnering schrijf je zoals je hem zegt.
 * - Het moment: op een groot scherm vraagt de pagina elke twintig seconden
 *   wat er speelt. Dan neemt de herinnering het scherm over en zegt het huis
 *   hem één keer hardop, met Gedaan en Later.
 */
(function (global) {
  'use strict';
  if (global.tedoen) return;

  const { esc, haal, deur, telStand } = global.app;
  const t = (k, p) => global.t(k, p);
  const nl = () => global.taal?.code !== 'en';

  const IK = {
    bak: '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    klok: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M5 4 2.5 6.5M19 4l2.5 2.5"/>',
    mand: '<path d="M3 9h18l-2 10H5z"/><path d="M8 9l3-5M16 9l-3-5M9 13v3M15 13v3"/>',
    lijst: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    agenda: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    vink: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    kruis: '<path d="M6 6l12 12M18 6 6 18"/>',
    wand: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6"/>',
    tel: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  };
  const svg = (pad, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;

  let data = null;

  const dagStart = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dagenVan = (ms) => Math.round((dagStart(ms) - dagStart(Date.now())) / 86_400_000);
  const klok = (ms) => global.taal.klok(ms);
  /** "vandaag", "morgen", of "do". */
  function dagKort(ms) {
    const n = dagenVan(ms);
    if (n === 0) return t('tedoen.vandaag');
    if (n === 1) return t('tedoen.morgen');
    return new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'short' }).format(ms).replace('.', '');
  }

  async function laad() {
    // Zelf ophalen, niet via haal: een fout hier is geen "geen verbinding" voor de hele pagina (CI, 30 oktober 2026).
    try {
      const res = await fetch('api/te-doen', { cache: 'no-store', headers: { 'x-taal': global.taal.code } });
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }
    tekenKaarten();
    tekenPagina();
    tekenGetal();
    return data;
  }

  /** Op de tabbalk: hoeveel herinneringen er vandaag nog komen (besluit 217). */
  function tekenGetal() {
    let n = 0;
    if (data) {
      n = data.aan ? data.herinneringen.filter((h) => dagenVan(h.ms) <= 0).length : 0;
      // Onthouden, zodat de andere tabs het getal ook tonen zonder alles op te halen.
      try {
        sessionStorage.setItem('sc-tedoen-getal', JSON.stringify({ n, dag: dagStart(Date.now()) }));
      } catch {}
    } else {
      try {
        const o = JSON.parse(sessionStorage.getItem('sc-tedoen-getal'));
        if (o?.dag === dagStart(Date.now())) n = o.n;
      } catch {}
    }
    for (const a of document.querySelectorAll('.tabs [data-tab="tedoen"]')) {
      a.querySelector('b')?.remove();
      if (n && a.getAttribute('aria-current') !== 'page') a.insertAdjacentHTML('beforeend', `<b>${n}</b>`);
    }
  }

  /* ------------------------------------------------------------ de kaart */

  /** Hooguit drie regels: het afval van vandaag of morgen, de eerstvolgende herinnering, de boodschappen. */
  function regels() {
    if (!data?.aan) return [];
    const uit = [];
    // Het eerstvolgende afval van deze week (30 oktober 2026: eerst alleen vandaag of morgen, dan bleef de kaart vaak weg).
    const komend = data.afspraken.filter((a) => a.bron === 'afval' && dagenVan(a.startMs) >= 0 && dagenVan(a.startMs) <= 6);
    const afval = komend.filter((a) => dagStart(a.startMs) === dagStart(komend[0]?.startMs ?? 0));
    if (afval.length) {
      const n = dagenVan(afval[0].startMs);
      const wat = afval.map((a) => a.tekst).join(nl() ? ' en ' : ' and ');
      const lang = new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'long' });
      const dag = lang.format(afval[0].startMs);
      uit.push({
        ik: 'bak',
        klasse: `td-${afval[0].afval ?? 'anders'}`,
        kop: n === 0 ? t('tedoen.vandaagAfval', { wat }) : n === 1 ? t('tedoen.morgenAfval', { wat }) : t('tedoen.dagAfval', { wat, dag: dag.charAt(0).toUpperCase() + dag.slice(1) }),
        zin: n === 0 ? t('tedoen.afvalVandaag') : n === 1 ? t('tedoen.afvalVanavond') : t('tedoen.afvalAvondervoor', { dag: lang.format(afval[0].startMs - 86_400_000) }),
        // De dag zelf ("za"): vandaag of morgen staat al in de kop.
        wanneer: new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'short' }).format(afval[0].startMs).replace('.', ''),
        // Nu (besluit 226): de avond ervoor vanaf vijf uur, en de dag zelf tot twaalf uur.
        nu: (n === 1 && new Date().getHours() >= 17) || (n === 0 && new Date().getHours() < 12),
      });
    }
    const h = data.herinneringen[0];
    if (h) uit.push({ nu: h.ms - Date.now() < 2 * 3_600_000, ik: 'klok', klasse: 'td-klok', kop: h.tekst, zin: h.eigen ? t('tedoen.jouwHerinnering') : h.naam ? t('tedoen.voor', { naam: h.naam }) : t('tedoen.voorIedereen'), wanneer: dagenVan(h.ms) === 0 ? klok(h.ms) : `${dagKort(h.ms)} ${klok(h.ms)}` });
    const b = data.lijsten.find((l) => l.soort === 'boodschappen');
    const open = (b?.items ?? []).filter((x) => !x.klaar);
    if (open.length) {
      const eerst = open.slice(0, 3).map((x) => x.tekst.toLowerCase());
      uit.push({ ik: 'mand', klasse: 'td-mand', kop: t('tedoen.boodschappen'), zin: open.length > 3 ? t('tedoen.enNog', { wat: eerst.join(', '), n: open.length - 3 }) : eerst.join(', '), wanneer: String(open.length) });
    }
    // Niets: de kaart blijft staan, zodat je altijd bij je lijsten en herinneringen kunt.
    if (!uit.length) uit.push({ ik: 'lijst', klasse: 'td-mand', kop: t('tedoen.niets'), zin: t('tedoen.nietsZin'), wanneer: '' });
    return uit.slice(0, 3);
  }

  function tekenKaarten() {
    const r = regels();
    for (const k of document.querySelectorAll('[data-tedoen]')) {
      // Er als te doen aan staat, ook als er niets is (30 oktober 2026). Verbergen kan bij Thuis aanpassen (besluit 217).
      k.hidden = r.length === 0;
      k.toggleAttribute('data-niet-hier', !data?.aan);
      k.classList.toggle('nu', r.some((x) => x.nu));
      if (!r.length) continue;
      k.innerHTML = `<div class="td-naam">${esc(t('tedoen.kop'))}<span>${esc(t('tedoen.alles'))} ›</span></div>${r
        .map((x) => `<div class="td-rij"><span class="td-ik ${x.klasse}">${svg(IK[x.ik])}</span><div><b>${esc(x.kop)}</b><span>${esc(x.zin)}</span></div><span class="td-wanneer">${esc(x.wanneer)}</span></div>`)
        .join('')}`;
    }
  }

  /* ------------------------------------------------------------ de tab */

  function herinneringHtml(h) {
    const wie = h.eigen ? t('tedoen.jij') : (h.naam ?? t('tedoen.iedereen'));
    const kanalen = h.voor ? `${svg(IK.wand)} ${esc(t('tedoen.wand'))} ${svg(IK.tel)} ${esc(t('tedoen.telefoon'))}` : `${svg(IK.wand)} ${esc(t('tedoen.wand'))}`;
    return `<div class="td-her${h.status === 'nu' ? ' nu' : ''}"><div class="td-uur"><b>${esc(klok(h.ms))}</b><span>${esc(dagenVan(h.ms) === 0 ? t('tedoen.vandaag') : dagKort(h.ms))}</span></div><div class="td-wat"><b>${esc(h.tekst)}</b><span>${esc(wie)} · ${kanalen}</span></div><button type="button" class="td-vink" data-td-gedaan="${esc(h.id)}" aria-label="${esc(t('tedoen.gedaan'))}">${svg(IK.vink, 2.4)}</button></div>`;
  }

  /**
   * Vast en gepland (besluit 234): één regel naar de eigen pagina, met hoeveel
   * er is en wanneer de volgende is. Wat gepauzeerd is, telt niet als volgende.
   */
  function geplandRegel(lijst) {
    const volgende = lijst.filter((g) => g.opdracht?.aan !== false).sort((a, b) => a.ms - b.ms)[0];
    const zin = lijst.length ? t('tedoen.vastGeplandN', { n: lijst.length, klok: volgende ? klok(volgende.ms) : '–' }) : t('tedoen.vastGeplandLeeg');
    return `<a class="td-her td-gepland" href="gepland.html"><div class="td-wat"><b>${esc(t('tedoen.vastGepland'))}</b><span>${esc(zin)}</span></div><span class="td-pijl" aria-hidden="true">›</span></a>`;
  }

  /**
   * De kleur van een afspraak: het afval naar zijn bak, het gezin roze, je eigen
   * agenda's elk een eigen kleur. Op de wand (besluit 219) een kleur per bewoner
   * die thuis is.
   */
  function kleurVan(a) {
    if (a.bron === 'afval') return `td-${a.afval ?? 'anders'}`;
    if (a.bron === 'gezin') return 'td-gezin';
    if (a.wie) return `td-eigen${Math.max(0, [...new Set(data.afspraken.filter((x) => x.wie).map((x) => x.wie))].indexOf(a.wie)) % 4}`;
    const eigen = [...new Set(data.afspraken.filter((x) => x.bron === 'eigen').map((x) => x.agenda))];
    return `td-eigen${Math.max(0, eigen.indexOf(a.agenda)) % 4}`;
  }

  /** Twee weken: vandaag, en elke dag waarop iets staat. */
  function agendaHtml() {
    const vandaag = dagStart(Date.now());
    const dagen = [...new Set([vandaag, ...data.afspraken.map((a) => dagStart(a.startMs)).filter((d) => d >= vandaag)])].sort((a, b) => a - b);
    const kort = new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'short' });
    // De bronnen boven de lijst, met hun kleur.
    const bronnen = new Map();
    for (const a of data.afspraken) {
      // Op de wand een bron per bewoner die thuis is, met zijn naam.
      const sleutel = a.bron === 'afval' ? 'afval' : a.bron === 'gezin' ? 'gezin' : a.wie ? `wie:${a.wie}` : a.agenda;
      if (!bronnen.has(sleutel)) bronnen.set(sleutel, { naam: a.bron === 'afval' ? t('tedoen.afval') : a.bron === 'gezin' ? t('tedoen.gezin') : (a.wie ?? data.agendas?.[a.agenda] ?? a.agenda), kleur: a.bron === 'afval' ? 'td-gft' : kleurVan(a) });
    }
    const legenda = bronnen.size ? `<div class="tdp-bronnen">${[...bronnen.values()].map((b) => `<span class="tdp-bron"><i class="${b.kleur}"></i>${esc(b.naam)}</span>`).join('')}</div>` : '';
    const dag = (ms) => {
      const daar = data.afspraken.filter((a) => dagStart(a.startMs) === ms);
      const items = daar.length
        ? daar.map((a) => `<div class="tdp-item"><i class="${kleurVan(a)}"></i>${esc(a.tekst)}${a.wie ? `<em class="tdp-wie">${esc(a.wie)}</em>` : ''}<small>${esc(a.heleDag ? (a.bron === 'afval' ? '' : t('tedoen.heleDag')) : klok(a.startMs))}</small></div>`).join('')
        : `<div class="tdp-item leeg">${esc(t('tedoen.niets'))}</div>`;
      return `<div class="tdp-dag${ms === vandaag ? ' vandaag' : ''}"><div class="tdp-wanneer"><span>${esc(kort.format(ms).replace('.', ''))}</span><b>${new Date(ms).getDate()}</b></div><div class="tdp-items">${items}</div></div>`;
    };
    return `${legenda}<div class="tdp-dagen">${dagen.map(dag).join('')}</div>`;
  }

  /** Welke lijst net "weghalen?" vroeg: een tweede tik binnen vijf seconden haalt ze weg. */
  let opruimVraag = null;

  function lijstHtml(l) {
    // Alles wat open is, en hooguit vijf afgevinkte (30 oktober 2026: een lijst van jaren stond vol afgevinkte).
    const open = l.items.filter((i) => !i.klaar);
    const af = l.items.filter((i) => i.klaar);
    const items = [...open.slice(0, 30), ...af.slice(-5).reverse()];
    const vraag = opruimVraag === l.soort;
    const opruimen = af.length
      ? `<button type="button" class="td-opruim${vraag ? ' zeker' : ''}" data-td-opruim="${l.soort}">${esc(vraag ? t('tedoen.opruimenZeker', { n: af.length }) : t('tedoen.opruimen', { n: af.length }))}</button>`
      : '';
    const naam = t(l.soort === 'boodschappen' ? 'tedoen.boodschappen' : 'tedoen.todo');
    return `<div class="tdp-lijst">
      <h3>${esc(naam)}<span>${open.length}</span></h3>
      <div class="td-items">${
        items.length
          ? items.map((i) => `<button type="button" class="td-item${i.klaar ? ' af' : ''}" data-td-item="${esc(i.tekst)}" data-td-uid="${esc(i.uid ?? '')}" data-td-lijst="${l.soort}" data-td-klaar="${i.klaar}"><span class="td-box">${i.klaar ? svg(IK.vink, 2.4) : ''}</span>${esc(i.tekst)}</button>`).join('')
          : `<p class="mini">${esc(t('tedoen.leeg'))}</p>`
      }</div>
      <form class="td-erbij" data-td-erbij data-td-lijst="${l.soort}"><input type="text" maxlength="120" placeholder="${esc(t('tedoen.erbij'))}" aria-label="${esc(t('tedoen.erbijLijst', { lijst: naam }))}"></form>
      <div class="td-voet"><p class="td-bron">${esc(t('tedoen.bron', { naam: l.naam ?? naam }))}</p>${opruimen}</div>
    </div>`;
  }

  function paginaHtml() {
    const datum = new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now());
    const kop = `<div class="tdp-kop"><div><h1 class="kop-1">${esc(t('tedoen.kop'))}</h1><p>${esc(datum.charAt(0).toUpperCase() + datum.slice(1))} · ${t('tedoen.tip')}</p></div>
      <div class="tdp-knoppen">${telStand() || !data?.bewoner ? '' : `<a class="pil" href="jij.html#agenda">${esc(t('tedoen.agendasKiezen'))}</a>`}<button type="button" class="pil licht" data-td-nieuwknop>${esc(t('tedoen.plusHerinnering'))}</button></div></div>`;
    if (!data) return `${kop}<p class="mini">${esc(t('algemeen.laden'))}</p>`;
    if (!data.aan) return `${kop}<section class="glas tdp-vak"><p class="uitleg">${esc(t('tedoen.uit'))}</p><a class="pil" href="functies.html?groep=assistent#tedoen">${esc(t('tedoen.naarFuncties'))}</a></section>`;
    return `${kop}<div class="tdp-drie">
      <section class="glas tdp-vak">
        <h2>${esc(t('tedoen.herinneringen'))}<em>${data.herinneringen.length || ''}</em></h2>
        ${data.herinneringen.map(herinneringHtml).join('') || `<p class="mini">${esc(t('tedoen.geenHerinneringen'))}</p>`}
        <form class="td-erbij" data-td-nieuw><input type="text" maxlength="160" placeholder="${esc(t('tedoen.nieuw'))}" aria-label="${esc(t('tedoen.nieuwLabel'))}"></form>
        ${geplandRegel(data.gepland ?? [])}
        <p class="td-bron">${t('tedoen.zoWerkt')}</p>
      </section>
      <section class="glas tdp-vak">
        <h2>${esc(t('tedoen.agenda'))}${telStand() && data.bewoner ? `<a href="jij.html#agenda">${esc(t('tedoen.agendasKiezen'))} ›</a>` : `<em>${esc(t('tedoen.tweeWeken'))}</em>`}</h2>
        ${agendaHtml()}
      </section>
      <section class="glas tdp-vak">
        ${data.lijsten.length ? data.lijsten.map(lijstHtml).join('') : `<p class="mini">${esc(t('tedoen.geenLijsten'))}</p>`}
      </section>
    </div>`;
  }

  function tekenPagina() {
    for (const vak of document.querySelectorAll('[data-td-pagina]')) {
      // Wat je aan het typen was, blijft staan als de pagina zich opnieuw tekent (na een vinkje of nieuwe gegevens).
      const bezig = [...vak.querySelectorAll('form input')].map((i) => [i.closest('form').hasAttribute('data-td-nieuw') ? 'form[data-td-nieuw]' : `form[data-td-lijst="${i.closest('form').dataset.tdLijst}"]`, i.value, i === document.activeElement]);
      vak.innerHTML = paginaHtml();
      for (const [sel, waarde, focus] of bezig) {
        const i = vak.querySelector(`${sel} input`);
        if (!i) continue;
        i.value = waarde;
        if (focus) i.focus();
      }
    }
  }

  /* ------------------------------------------------------------ handelingen */

  /** Ga je naar een andere pagina, dan breekt de browser wat onderweg is af: dat is geen fout om te melden. */
  let weg = false;
  addEventListener('pagehide', () => (weg = true));
  addEventListener('beforeunload', () => (weg = true));
  addEventListener('pageshow', () => (weg = false));

  async function stuur(body) {
    const res = await deur('api/te-doen', body).catch(() => null);
    if (weg) return;
    if (!res?.ok) {
      const f = res ? await res.json().catch(() => ({})) : {};
      global.alert?.(f.fout ?? t('tedoen.lukteNiet'));
    }
    await laad();
  }

  /** Een herinnering zoals je hem zegt: de assistent leest de tijd. */
  async function nieuweHerinnering(zin) {
    const q = new URLSearchParams({ v: 'vrij', tekst: /^(herinner|remind)/i.test(zin) ? zin : `${nl() ? 'herinner me' : 'remind me'} ${zin}`, taal: global.taal.code });
    const b = await haal(`api/vraag?${q}`).catch(() => null);
    if (b?.opdracht?.pad === 'api/te-doen') await stuur(b.opdracht.body);
    else global.alert?.(b?.antwoord ?? t('tedoen.lukteNiet'));
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-tedoen], [data-td-nieuwknop], [data-td-gedaan], [data-td-item], [data-td-later], [data-td-opruim]');
    if (!el) return;
    // De kaart op Thuis opent de tab (besluit 217).
    if (el.matches('[data-tedoen]')) {
      location.href = 'tedoen.html';
      return;
    }
    if (el.matches('[data-td-nieuwknop]')) return el.closest('[data-td-pagina]')?.querySelector('form[data-td-nieuw] input')?.focus();
    if (el.matches('[data-td-gedaan]')) return void stuur({ actie: 'gedaan', id: el.dataset.tdGedaan }).then(sluitMoment);
    if (el.matches('[data-td-later]')) return void stuur({ actie: 'later', id: el.dataset.tdId, minuten: Number(el.dataset.tdLater) }).then(sluitMoment);
    // Afvinken op uid (besluit 218): een naam kan vaker op de lijst staan.
    if (el.matches('[data-td-item]')) return void stuur({ actie: el.dataset.tdKlaar === 'true' ? 'open' : 'klaar', lijst: el.dataset.tdLijst, item: el.dataset.tdItem, ...(el.dataset.tdUid ? { uid: el.dataset.tdUid } : {}) });
    if (el.matches('[data-td-opruim]')) {
      const soort = el.dataset.tdOpruim;
      // Eerst vragen: weghalen kan niet terug.
      if (opruimVraag !== soort) {
        opruimVraag = soort;
        tekenPagina();
        setTimeout(() => {
          if (opruimVraag !== soort) return;
          opruimVraag = null;
          tekenPagina();
        }, 5000);
        return;
      }
      opruimVraag = null;
      return void stuur({ actie: 'opruimen', lijst: soort });
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest?.('[data-td-erbij], [data-td-nieuw]');
    if (!f) return;
    e.preventDefault();
    const veld = f.querySelector('input');
    const v = veld.value.trim();
    veld.value = '';
    if (!v) return;
    if (f.matches('[data-td-nieuw]')) void nieuweHerinnering(v);
    else void stuur({ actie: 'toevoegen', lijst: f.dataset.tdLijst, item: v });
  });

  /* ------------------------------------------------------------ het moment */

  let moment = null;
  const gezegd = new Set();

  function sluitMoment() {
    moment?.remove();
    moment = null;
  }

  async function zeg(tekst) {
    try {
      const a = new Audio(`api/stem?tekst=${encodeURIComponent(tekst)}&taal=${global.taal.code}`);
      await a.play();
    } catch {
      await global.app.zegMetApparaat?.(tekst);
    }
  }

  function toonMoment(h) {
    if (moment?.dataset.id === h.id) return;
    sluitMoment();
    // Een wand in rust of met het scherm uit wordt wakker (besluit 164).
    dispatchEvent(new CustomEvent('sc-wek', { detail: 'herinnering' }));
    moment = document.createElement('div');
    moment.className = 'td-moment';
    moment.dataset.id = h.id;
    moment.setAttribute('role', 'alertdialog');
    moment.innerHTML = `<div class="td-kern"><i class="r3"></i><i class="r2"></i><i class="r1"></i><span class="td-bol"></span></div>
      <div class="td-tekst"><small>${svg(IK.klok)}${esc(klok(h.ms))} · ${esc(h.naam ? t('tedoen.herinneringVoor', { naam: h.naam }) : t('tedoen.herinnering'))}</small><h2>${esc(h.tekst)}</h2>
      <div class="td-knoppen"><button type="button" class="licht" data-td-gedaan="${esc(h.id)}">${svg(IK.vink, 2.4)}${esc(t('tedoen.gedaan'))}</button><button type="button" data-td-later="10" data-td-id="${esc(h.id)}">${esc(t('tedoen.over10'))}</button><button type="button" data-td-later="60" data-td-id="${esc(h.id)}">${esc(t('tedoen.overUur'))}</button></div></div>
      <p class="td-onder">${svg(IK.tel)}${esc(h.voor ? t('tedoen.ookTelefoon', { naam: h.naam ?? '' }) : t('tedoen.zegGedaan'))}</p>`;
    (document.querySelector('#wand') ?? document.body).append(moment);
    if (!gezegd.has(h.id)) {
      gezegd.add(h.id);
      void zeg(t('tedoen.zegHet', { wat: h.tekst }));
    }
  }

  let klok20 = null;
  async function kijk() {
    if (telStand() || document.hidden) return;
    // Zelf vragen, niet via haal: een fout hier is geen "geen verbinding".
    const res = await fetch('api/te-doen?alleen=nu', { cache: 'no-store' }).catch(() => null);
    // Zonder te doen (een dienst zonder lijsten of agenda's): niet meer vragen.
    if (res?.status === 404) {
      clearInterval(klok20);
      return;
    }
    const r = res?.ok ? await res.json().catch(() => null) : null;
    const h = r?.speelt?.[0];
    if (h) toonMoment(h);
    else sluitMoment();
  }

  function start() {
    if (telStand()) return;
    // Eerst de pagina laten laden; daarna elke twintig seconden.
    setTimeout(() => void kijk(), 5000);
    klok20 = setInterval(() => void kijk(), 20_000);
  }

  global.tedoen = { laad, start, kijk };
  start();
  tekenGetal();
  // De tab zelf (besluit 217): de pagina, elke minuut vers.
  if (document.querySelector('[data-td-pagina]')) {
    global.app.start('tedoen');
    void laad();
    setInterval(() => void laad(), 60_000);
  }
})(window);
