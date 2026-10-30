/*
 * Te doen (besluit 216, schetsen Wand-Te-doen en Tel-Te-doen): de kaart op
 * Thuis, het blad met herinneringen, de week en de lijsten, en het moment op
 * de wand als een herinnering afgaat.
 *
 * - De kaart staat er alleen als er iets is: het afval van vandaag of morgen,
 *   de eerstvolgende herinnering, en wat er op de boodschappen staat.
 * - Het blad: je herinneringen (op een scherm die van iedereen), de week met
 *   afval en de agenda's, en de lijsten van Home Assistant om af te vinken of
 *   aan te vullen. Een nieuwe herinnering schrijf je zoals je hem zegt.
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
    wand: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6"/>',
    tel: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  };
  const svg = (pad, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg>`;

  let data = null;
  let tab = 'boodschappen';
  let blad = null;

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
    if (blad) tekenBlad();
    return data;
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
      });
    }
    const h = data.herinneringen[0];
    if (h) uit.push({ ik: 'klok', klasse: 'td-klok', kop: h.tekst, zin: h.eigen ? t('tedoen.jouwHerinnering') : h.naam ? t('tedoen.voor', { naam: h.naam }) : t('tedoen.voorIedereen'), wanneer: dagenVan(h.ms) === 0 ? klok(h.ms) : `${dagKort(h.ms)} ${klok(h.ms)}` });
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
      // Er als te doen aan staat, ook als er niets is (30 oktober 2026).
      k.hidden = r.length === 0;
      if (!r.length) continue;
      k.innerHTML = `<div class="td-naam">${esc(t('tedoen.kop'))}<span>${esc(t('tedoen.alles'))} ›</span></div>${r
        .map((x) => `<div class="td-rij"><span class="td-ik ${x.klasse}">${svg(IK[x.ik])}</span><div><b>${esc(x.kop)}</b><span>${esc(x.zin)}</span></div><span class="td-wanneer">${esc(x.wanneer)}</span></div>`)
        .join('')}`;
    }
  }

  /* ------------------------------------------------------------ het blad */

  function openBlad() {
    if (!blad) {
      blad = document.createElement('div');
      blad.className = 'td-laag';
      blad.innerHTML = '<div class="td-achter" data-td-sluit></div><aside class="glas td-blad" role="dialog" aria-modal="true"></aside>';
      (document.querySelector(telStand() ? '#tel' : '#wand') ?? document.body).append(blad);
    }
    tekenBlad();
    void laad();
  }
  function sluitBlad() {
    blad?.remove();
    blad = null;
  }

  function herinneringHtml(h) {
    const wie = h.eigen ? t('tedoen.jij') : (h.naam ?? t('tedoen.iedereen'));
    const kanalen = h.voor ? `${svg(IK.wand)} ${esc(t('tedoen.wand'))} ${svg(IK.tel)} ${esc(t('tedoen.telefoon'))}` : `${svg(IK.wand)} ${esc(t('tedoen.wand'))}`;
    return `<div class="td-her${h.status === 'nu' ? ' nu' : ''}"><div class="td-uur"><b>${esc(klok(h.ms))}</b><span>${esc(dagenVan(h.ms) === 0 ? t('tedoen.vandaag') : dagKort(h.ms))}</span></div><div class="td-wat"><b>${esc(h.tekst)}</b><span>${esc(wie)} · ${kanalen}</span></div><button type="button" class="td-vink" data-td-gedaan="${esc(h.id)}" aria-label="${esc(t('tedoen.gedaan'))}">${svg(IK.vink, 2.4)}</button></div>`;
  }

  function weekHtml() {
    const dagen = Array.from({ length: 7 }, (_, i) => dagStart(Date.now()) + i * 86_400_000);
    const kort = new Intl.DateTimeFormat(nl() ? 'nl-NL' : 'en-GB', { weekday: 'short' });
    const vak = (ms, i) => {
      const daar = data.afspraken.filter((a) => dagStart(a.startMs) === ms);
      const regel = (a) =>
        a.bron === 'afval'
          ? `<span class="td-bak td-${a.afval ?? 'anders'}">${svg(IK.bak)}${esc(a.tekst)}</span>`
          : `<span class="td-bak td-${a.bron}">${svg(IK.agenda)}${a.heleDag ? '' : `${esc(klok(a.startMs))} `}${esc(a.tekst)}</span>`;
      return `<div class="td-dag${i === 0 ? ' vandaag' : ''}"><b>${esc(kort.format(ms).replace('.', ''))}<span>${new Date(ms).getDate()}</span></b>${daar.map(regel).join('')}</div>`;
    };
    const later = data.afspraken.filter((a) => dagStart(a.startMs) >= dagen[6] + 86_400_000).slice(0, 3);
    const daarna = later.length ? `<p class="td-verder">${esc(t('tedoen.daarna'))} ${later.map((a) => `<b>${esc(`${dagKort(a.startMs)} ${new Date(a.startMs).getDate()}`)}</b> ${esc(a.tekst)}`).join(', ')}</p>` : '';
    return `<div class="td-week">${dagen.map(vak).join('')}</div>${daarna}`;
  }

  function lijstenHtml() {
    if (!data.lijsten.length) return `<div class="td-lijsten"><p class="mini">${esc(t('tedoen.geenLijsten'))}</p></div>`;
    if (!data.lijsten.some((l) => l.soort === tab)) tab = data.lijsten[0].soort;
    const l = data.lijsten.find((x) => x.soort === tab);
    const items = [...l.items].sort((a, b) => Number(a.klaar) - Number(b.klaar)).slice(0, 14);
    return `<div class="td-lijsten">
      <div class="td-tabs" role="tablist">${data.lijsten
        .map((x) => `<button type="button" role="tab" aria-selected="${x.soort === tab}" data-td-tab="${x.soort}">${esc(t(x.soort === 'boodschappen' ? 'tedoen.boodschappen' : 'tedoen.todo'))} <em>${x.items.filter((i) => !i.klaar).length}</em></button>`)
        .join('')}</div>
      <div class="td-items">${
        items.length
          ? items.map((i) => `<button type="button" class="td-item${i.klaar ? ' af' : ''}" data-td-item="${esc(i.tekst)}" data-td-klaar="${i.klaar}"><span class="td-box">${i.klaar ? svg(IK.vink, 2.4) : ''}</span>${esc(i.tekst)}</button>`).join('')
          : `<p class="mini">${esc(t('tedoen.leeg'))}</p>`
      }</div>
      <form class="td-erbij" data-td-erbij><input type="text" maxlength="120" placeholder="${esc(t('tedoen.erbij'))}" aria-label="${esc(t('tedoen.erbij'))}"></form>
      <p class="td-bron">${esc(t('tedoen.bron', { naam: l.naam }))}</p>
    </div>`;
  }

  function tekenBlad() {
    const vak = blad?.querySelector('.td-blad');
    if (!vak) return;
    // Wat je aan het typen was, blijft staan als het blad zich opnieuw tekent (na een vinkje of nieuwe gegevens).
    const bezig = [...vak.querySelectorAll('form input')].map((i) => [i.closest('form').hasAttribute('data-td-nieuw') ? 'nieuw' : 'erbij', i.value, i === document.activeElement]);
    teken(vak);
    for (const [soort, waarde, focus] of bezig) {
      const i = vak.querySelector(`form[data-td-${soort}] input`);
      if (!i) continue;
      i.value = waarde;
      if (focus) i.focus();
    }
  }

  function teken(vak) {
    if (!data) {
      vak.innerHTML = `<div class="td-bovenkop"><h2 class="kop-2">${esc(t('tedoen.kop'))}</h2><button type="button" class="td-sluit" data-td-sluit aria-label="${esc(t('tedoen.sluit'))}">×</button></div><p class="mini">${esc(t('algemeen.laden'))}</p>`;
      return;
    }
    if (!data.aan) {
      vak.innerHTML = `<div class="td-bovenkop"><h2 class="kop-2">${esc(t('tedoen.kop'))}</h2><button type="button" class="td-sluit" data-td-sluit aria-label="${esc(t('tedoen.sluit'))}">×</button></div><p class="uitleg">${esc(t('tedoen.uit'))}</p>`;
      return;
    }
    vak.innerHTML = `<div class="td-bovenkop"><div><h2 class="kop-2">${esc(t('tedoen.kop'))}</h2><p>${t('tedoen.tip')}</p></div><button type="button" class="td-sluit" data-td-sluit aria-label="${esc(t('tedoen.sluit'))}">×</button></div>
      <div class="td-kolom">
        <h3>${esc(t('tedoen.herinneringen'))}</h3>
        ${data.herinneringen.slice(0, 4).map(herinneringHtml).join('') || `<p class="mini">${esc(t('tedoen.geenHerinneringen'))}</p>`}
        <form class="td-erbij" data-td-nieuw><input type="text" maxlength="160" placeholder="${esc(t('tedoen.nieuw'))}" aria-label="${esc(t('tedoen.nieuwLabel'))}"></form>
        <h3 class="td-weekkop">${esc(t('tedoen.week'))}${telStand() ? `<a href="jij.html#agenda">${esc(t('tedoen.agendasKiezen'))} ›</a>` : ''}</h3>
        ${weekHtml()}
        <p class="td-zowerkt">${svg(IK.tel)}<span>${t('tedoen.zoWerkt')}</span></p>
      </div>
      ${lijstenHtml()}`;
  }

  /* ------------------------------------------------------------ handelingen */

  async function stuur(body) {
    const res = await deur('api/te-doen', body).catch(() => null);
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
    const el = e.target.closest?.('[data-tedoen], [data-td-sluit], [data-td-gedaan], [data-td-tab], [data-td-item], [data-td-later]');
    if (!el) return;
    if (el.matches('[data-tedoen]')) return openBlad();
    if (el.matches('[data-td-sluit]')) return sluitBlad();
    if (el.matches('[data-td-tab]')) {
      tab = el.dataset.tdTab;
      return tekenBlad();
    }
    if (el.matches('[data-td-gedaan]')) return void stuur({ actie: 'gedaan', id: el.dataset.tdGedaan }).then(sluitMoment);
    if (el.matches('[data-td-later]')) return void stuur({ actie: 'later', id: el.dataset.tdId, minuten: Number(el.dataset.tdLater) }).then(sluitMoment);
    if (el.matches('[data-td-item]')) return void stuur({ actie: el.dataset.tdKlaar === 'true' ? 'open' : 'klaar', lijst: tab, item: el.dataset.tdItem });
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
    else void stuur({ actie: 'toevoegen', lijst: tab, item: v });
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && blad && sluitBlad());

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

  global.tedoen = { laad, openBlad, sluitBlad, start, kijk };
  start();
})(window);
