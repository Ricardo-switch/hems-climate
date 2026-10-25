/*
 * Wat elke tab van ontwerp 2 deelt (besluit 104): de wand van 800 hoog (en 1280 of breder) die
 * als geheel naar het scherm schaalt, de navigatie, de lucht van het moment,
 * de klok, ophalen, de deuren met de inlog (besluit 99) en de live-stroom.
 *
 * Een tab is een eigen pagina met een #wand en een #tel; deze basis zet de
 * stand en de navigatie, de tab tekent zijn eigen inhoud.
 */
'use strict';

(function (global) {
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  /** Een getal in de taal van de app (besluit 185); de naam is van voor er talen waren. */
  const nl = (n, d = 1) => global.taal.getal(n, d);
  const zet = (sel, text) => $$(sel).forEach((e) => (e.textContent = text));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /**
   * Bijna op (besluit 149): onder de drempel die de bewoner koos bij Functies,
   * per soort ('batterij' of 'filter'). Zonder huis 10%; null is nooit.
   */
  const bijnaOp = (pct, soort, huis) => {
    const d = huis?.drempels?.[soort];
    return pct != null && (d === undefined ? pct < 10 : d != null && pct < d);
  };
  const klokVan = (ms) => global.taal.klok(ms);
  /**
   * Wanneer iets was: de klok vandaag, "gisteren" met de klok, of de datum.
   * Kort (voor een melding): binnen het uur in minuten, en gisteren zonder klok.
   */
  function wanneer(ms, { kort = false } = {}) {
    const min = Math.round((Date.now() - ms) / 60_000);
    const t = global.t;
    if (kort && min < 60) return t('algemeen.minuten', { n: Math.max(1, min) });
    const d = new Date(ms);
    const vandaag = new Date();
    if (d.toDateString() === vandaag.toDateString()) return klokVan(ms);
    const gisteren = new Date(vandaag.getTime() - 86_400_000);
    if (d.toDateString() === gisteren.toDateString()) return kort ? t('algemeen.gisteren') : t('algemeen.gisterenOm', { klok: klokVan(ms) });
    return global.taal.datum(d, { day: 'numeric', month: 'long' });
  }

  /* Waar de tabs staan: tot ze in ontwerp 2 zijn, in de proefomgeving. */
  const LINKS = {
    thuis: 'thuis.html',
    vandaag: 'vandaag.html',
    apparaten: 'apparaten.html',
    opbrengst: 'opbrengst.html',
    assistent: 'assistent.html',
    instellingen: 'instellingen.html',
  };

  /**
   * De telefoonweergave alleen staand, of op een heel smal scherm. Een telefoon
   * die ligt, krijgt de wand van de tablet, verkleind tot hij past. Dezelfde
   * regel staat in het script in de <head> van elke pagina.
   */
  function telStand() {
    return innerHeight > innerWidth || innerWidth < 560;
  }

  /** De stand en de schaal, op <html>; het script in de <head> deed dit al vóór de eerste weergave. */
  /** Een onzichtbaar vak om de inkeping van een telefoon te meten (safe-area). */
  let peil = null;
  function inzet() {
    if (!peil) {
      peil = document.createElement('div');
      peil.setAttribute('aria-hidden', 'true');
      peil.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.documentElement.append(peil);
    }
    const s = getComputedStyle(peil);
    // Boven en onder ook (besluit 129): op een liggende telefoon tekent de browser
    // tot onder de balk met de veegstreep, en daar viel de onderkant van de wand weg.
    return { l: parseFloat(s.paddingLeft) || 0, r: parseFloat(s.paddingRight) || 0, t: parseFloat(s.paddingTop) || 0, b: parseFloat(s.paddingBottom) || 0 };
  }

  /**
   * Het schermtoetsenbord (besluit 124): komt het in beeld, dan wordt het scherm
   * even hoog als wat erboven overblijft. Dat is geen nieuwe stand: de wand
   * houdt zijn maat, en schuift alleen omhoog tot het veld waarin je typt
   * zichtbaar is. Gaat het toetsenbord weg, dan staat alles weer op zijn plek.
   */
  let maat = { w: 0, h: 0 };
  const typt = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
  function toetsenbord() {
    const d = document.documentElement;
    const veld = document.activeElement;
    if (telStand() || !typt() || !veld?.closest?.('#wand')) {
      d.style.setProperty('--toetsschuif', '0px');
      return;
    }
    const zicht = global.visualViewport?.height ?? innerHeight;
    const r = veld.getBoundingClientRect();
    const nu = parseFloat(getComputedStyle(d).getPropertyValue('--toetsschuif')) || 0;
    const nodig = Math.max(0, r.bottom + nu + 12 - zicht);
    d.style.setProperty('--toetsschuif', `${Math.round(nodig)}px`);
  }

  function schaal() {
    const d = document.documentElement;
    // Een toetsenbord: zelfde breedte, minder hoog, en je typt. Dan niets herschalen.
    if (maat.w === innerWidth && innerHeight < maat.h && typt()) {
      toetsenbord();
      return;
    }
    maat = { w: innerWidth, h: innerHeight };
    d.style.setProperty('--toetsschuif', '0px');
    d.classList.toggle('tel-stand', telStand());
    // Een liggende telefoon heeft een inkeping aan de zijkant: de wand blijft ernaast.
    const { l, r, t, b } = inzet();
    const vrij = innerWidth - l - r;
    const hoog = innerHeight - t - b;
    // Een breder scherm dan 16:10 (een tablet zonder de balken van het systeem):
    // de wand groeit mee in de breedte, de hoogte blijft 800. Zo vult hij het scherm.
    const breed = Math.min(1700, Math.max(1280, Math.round((800 * vrij) / hoog)));
    d.style.setProperty('--wandbreedte', `${breed}px`);
    d.style.setProperty('--wandschaal', String(Math.min(vrij / breed, hoog / 800)));
    d.style.setProperty('--wandmidden', `${(l - r) / 2}px`);
    d.style.setProperty('--wandmiddenY', `${(t - b) / 2}px`);
  }

  async function haal(pad, opnieuw = false) {
    let res;
    try {
      // De taal van de app (besluit 185): de dienst zet zijn uitleg in die taal.
      res = await fetch(pad, { cache: 'no-store', headers: { 'x-taal': global.taal.code } });
    } catch (fout) {
      // Geen antwoord van de NAS: de laatste stand blijft, grijs (besluit 82).
      offline();
      throw fout;
    }
    online();
    // De toegang van Home Assistant verliep (21 oktober 2026): vernieuwen en nog eens.
    if (ingressDicht(res)) {
      if (!opnieuw && (await verseToegang())) return haal(pad, true);
      throw new Error(`${pad}: Home Assistant laat even niet door`);
    }
    // Niet (meer) ingelogd (besluit 147): naar het inloggen, met de weg terug naar deze pagina.
    if (res.status === 401) {
      location.href = `inloggen.html?terug=${encodeURIComponent(location.pathname + location.hash)}`;
      throw new Error(`${pad}: log eerst in`);
    }
    if (!res.ok) throw new Error(`${pad}: ${res.status}`);
    return res.json();
  }

  /*
   * Zonder verbinding (besluit 82): de pagina houdt de laatste stand, grijs, met
   * sinds wanneer. De regeling draait op de NAS gewoon door; alleen deze pagina
   * hoort niets meer. Komt er weer antwoord, dan is het weg.
   */
  let wegSinds = null;
  function offline(sinds = Date.now()) {
    if (wegSinds != null) return;
    wegSinds = sinds;
    document.body.classList.add('offline');
    const balk = document.createElement('div');
    balk.className = 'geenverbinding';
    balk.setAttribute('role', 'status');
    balk.textContent = global.t('basis.offline', { klok: klokVan(sinds) });
    document.body.append(balk);
  }
  function online() {
    if (wegSinds == null) return;
    wegSinds = null;
    document.body.classList.remove('offline');
    document.querySelector('.geenverbinding')?.remove();
  }

  /**
   * Een deur van de dienst (POST). Zonder inlog stuurt de dienst 401; dan naar
   * de inlog van Home Assistant, en daarna terug naar deze plek (besluit 99).
   */
  async function deur(pad, body, opnieuw = false) {
    const res = await fetch(pad, { method: 'POST', headers: { 'content-type': 'application/json', 'x-taal': global.taal.code }, body: JSON.stringify(body) });
    if (ingressDicht(res)) return !opnieuw && (await verseToegang()) ? deur(pad, body, true) : res;
    if (res.status === 401) {
      location.href = `auth/login?terug=${encodeURIComponent(location.pathname + location.hash)}`;
      return null;
    }
    return res;
  }

  /** Dag, ochtend, avond of nacht, uit de zon van de dienst (`api/zon`). */
  function tijdVanDeDag(zon) {
    const d = zon?.dag;
    if (!zon?.zon?.boven) {
      const na = d?.onderMs != null ? Date.now() - d.onderMs : Infinity;
      const voor = d?.opMs != null ? d.opMs - Date.now() : Infinity;
      if ((na > 0 && na < 60 * 60_000) || (voor > 0 && voor < 45 * 60_000)) return na < Infinity && na > 0 ? 'avond' : 'ochtend';
      return 'nacht';
    }
    if (d?.fractie < 0.1) return 'ochtend';
    if (d?.fractie > 0.9) return 'avond';
    return 'dag';
  }

  function lucht(tijd, seizoen, wolken) {
    const b = document.body.classList;
    for (const c of [...b]) if (c.startsWith('lucht-')) b.remove(c);
    b.add(seizoen === 'winter' && tijd !== 'nacht' ? 'lucht-winter' : tijd === 'nacht' ? 'lucht-nacht' : tijd === 'avond' ? 'lucht-avond' : tijd === 'ochtend' ? 'lucht-ochtend' : wolken > 0.6 ? 'lucht-bewolkt' : 'lucht-dag');
    luchtAchterVak();
  }

  /**
   * In Home Assistant laadt een andere pagina in het vak van het paneel, en
   * tot die er staat is het vak leeg: zwart op de tablet, langer dan op de
   * NAS omdat alles via Home Assistant komt. Het vak krijgt de lucht van nu
   * als achtergrond, zodat je die ziet in plaats van zwart.
   */
  function luchtAchterVak() {
    try {
      const vak = inHA() ? global.frameElement : null;
      if (!vak) return;
      vak.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
      vak.style.backgroundImage = getComputedStyle(document.body, '::before').backgroundImage;
    } catch {
      // Een vak van een andere herkomst: dan niets.
    }
  }

  /** De lucht van nu, voor een tab zonder huis: uit de zon en wat de panelen leveren. */
  function luchtVan(zon, zonKw) {
    const helder = zon?.heldereLuchtW ?? 0;
    const wolken = zon?.zon?.boven && helder > 300 ? (zonKw * 1000 < helder * 0.35 ? 0.8 : zonKw * 1000 < helder * 0.7 ? 0.4 : 0.1) : 0.3;
    const maand = new Date().getMonth() + 1;
    lucht(tijdVanDeDag(zon), maand >= 11 || maand <= 2 ? 'winter' : 'zomer', wolken);
  }

  function klok() {
    const nu = new Date();
    zet('[data-tijd]', klokVan(nu));
    zet('[data-datum]', global.taal.datum(nu, { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  /**
   * De stippellijn bij de zon van vandaag (besluit 105): de verwachting uit het
   * weer en wat de panelen leerden, en zonder weer de zon bij een heldere lucht.
   */
  function verwachting(zon, weer) {
    const kw = weer?.vandaag?.kwartieren ?? [];
    if (kw.length) return { punten: kw.map((q) => ({ tMs: q.tMs, w: q.verwachtW })), naam: global.t('algemeen.verwachting') };
    return { punten: (zon?.kwartieren ?? []).map((q) => ({ tMs: q.tMs, w: q.heldereLuchtW ?? 0 })), naam: global.t('algemeen.heldereLucht') };
  }

  /** Eén live-stroom per pagina: de besluiten, en de deurbel (besluit 107). */
  let bron = null;
  let opLive = null;
  function stroom() {
    if (bron) return bron;
    try {
      bron = new EventSource(`api/events?taal=${global.taal.code}`);
      if (opLive) bron.onmessage = opLive;
      // Valt de stroom weg en komt hij niet snel terug, dan zonder verbinding.
      let wacht = null;
      let wasWeg = false;
      const deze = bron;
      deze.addEventListener('error', () => {
        wasWeg = true;
        const toen = Date.now();
        clearTimeout(wacht);
        wacht = setTimeout(() => deze.readyState !== EventSource.OPEN && offline(toen), 15_000);
        // Dicht en niet vanzelf terug (een 401 van Home Assistant, 21 oktober 2026):
        // de toegang vernieuwen en zelf opnieuw verbinden.
        if (deze.readyState === EventSource.CLOSED && bron === deze) {
          bron = null;
          setTimeout(() => void verseToegang().finally(() => stroom()), 5_000);
        }
      });
      deze.addEventListener('open', () => {
        clearTimeout(wacht);
        online();
        // Terug na een onderbreking: wat er intussen veranderde, haalt de pagina nu op.
        if (wasWeg) {
          for (const soort of ['huis', 'bewoners']) signaal(soort, true);
          void meldLaad();
        }
        wasWeg = false;
      });
      // Het huis of wie er thuis is veranderde (21 oktober 2026): de pagina haalt het op.
      for (const soort of ['huis', 'bewoners']) {
        deze.addEventListener(soort, (ev) => {
          let snel = true;
          try {
            snel = JSON.parse(ev.data).snel !== false;
          } catch {
            // Een half bericht: dan maar meteen.
          }
          signaal(soort, snel);
        });
      }
      // Een nieuwe melding, of een die weg is (21 oktober 2026): meteen bij de bel.
      deze.addEventListener('meldingen', () => void meldLaad());
      // De gekozen bewegingsmelder ziet iemand (besluit 164): de wand wordt wakker.
      deze.addEventListener('wekken', () => dispatchEvent(new CustomEvent('sc-wek', { detail: 'beweging' })));
      // Een rookmelder ziet iets, of niet meer (21 oktober 2026).
      deze.addEventListener('alarm', (ev) => {
        try {
          alarm(JSON.parse(ev.data));
        } catch {
          // Een half bericht.
        }
      });
      deze.addEventListener('aanbellen', (ev) => {
        try {
          aanbellen(JSON.parse(ev.data));
        } catch {
          // Een half bericht.
        }
      });
    } catch {
      // Geen EventSource: het verversen per minuut doet het werk.
    }
    return bron;
  }

  /*
   * Het huis en wie er thuis is, live (21 oktober 2026). De dienst zegt het als
   * er iets veranderde; de pagina haalt het dan op, alleen als ze in beeld is.
   * Wat je bedient of ziet bewegen meteen; een temperatuur of verbruik dat
   * verschuift hooguit eens per `rustig`, zoals de pagina het eerst zelf vroeg.
   */
  const bijSoort = new Map();
  function signaal(soort, snel) {
    for (const a of bijSoort.get(soort) ?? []) a(snel);
  }
  function bijVerandering(soort, opnieuw, { rustig = 15_000 } = {}) {
    let laatst = Date.now();
    let bezig = false;
    let nogEens = false;
    let later = null;
    let verborgen = false;
    const haalOp = async () => {
      clearTimeout(later);
      later = null;
      if (bezig) return void (nogEens = true);
      bezig = true;
      laatst = Date.now();
      try {
        await opnieuw();
      } catch {
        // Dan de volgende keer.
      } finally {
        bezig = false;
        if (nogEens) {
          nogEens = false;
          void haalOp();
        }
      }
    };
    const prik = (snel) => {
      if (document.visibilityState !== 'visible') return void (verborgen = true);
      if (snel || Date.now() - laatst >= rustig) return void haalOp();
      later ??= setTimeout(() => void haalOp(), laatst + rustig - Date.now());
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && verborgen) {
        verborgen = false;
        void haalOp();
      }
    });
    bijSoort.set(soort, [...(bijSoort.get(soort) ?? []), prik]);
  }

  /*
   * Op je startscherm (21 oktober 2026). Chrome biedt het installeren aan met
   * `beforeinstallprompt`, alleen over https en buiten Home Assistant; dat
   * bewaren we, zodat de knop bij Functies › Weergave het kan vragen.
   */
  let installeerVraag = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installeerVraag = e;
    dispatchEvent(new Event('sc-installeer'));
  });
  addEventListener('appinstalled', () => {
    installeerVraag = null;
    dispatchEvent(new Event('sc-installeer'));
  });
  const kanInstalleren = () => installeerVraag != null;
  const geinstalleerd = () => global.matchMedia?.('(display-mode: standalone)').matches === true || global.navigator.standalone === true;
  async function installeer() {
    const vraag = installeerVraag;
    if (!vraag) return false;
    installeerVraag = null;
    await vraag.prompt();
    const keuze = await vraag.userChoice.catch(() => null);
    dispatchEvent(new Event('sc-installeer'));
    return keuze?.outcome === 'accepted';
  }

  /** De live-stroom van besluiten; zonder valt de tab terug op verversen per minuut. */
  function live(opState) {
    opLive = (ev) => {
      try {
        opState(JSON.parse(ev.data));
      } catch {
        // Een half bericht: de volgende komt zo.
      }
    };
    const b = stroom();
    if (b) b.onmessage = opLive;
  }

  /*
   * Rook, koolmonoxide of hitte (21 oktober 2026, schets Wand-Rook): op elke
   * pagina, zoals aanbellen, rood en schermvullend, met de kamer en wat de
   * andere melders zien. Sluiten haalt het weg tot een melder iets nieuws ziet;
   * ziet niemand meer iets, dan gaat het vanzelf weg. Smart Climate zet het
   * alarm zelf niet uit: dat doe je op de melder.
   */
  /** Wat een melder ziet: rook, co of hitte; als kop en in een zin (teksten.*.js). */
  const GEVAAR = (g) => global.t(`basis.alarm.gevaar.${g}`);
  const WAT = (g) => global.t(`basis.alarm.wat.${g}`);
  let alarmGesloten = '';
  function alarm(m) {
    const aan = (m.melders ?? []).filter((x) => x.gevaar);
    const sleutel = aan.map((x) => `${x.id}:${x.gevaar}`).join('|');
    let laag = document.querySelector('.alarmlaag');
    if (!aan.length || sleutel === alarmGesloten) {
      if (!aan.length) alarmGesloten = '';
      laag?.remove();
      return;
    }
    dispatchEvent(new CustomEvent('sc-wek', { detail: 'alarm' }));
    try {
      global.fully?.turnScreenOn?.();
      global.fully?.bringToForeground?.();
    } catch {
      // Geen Fully Kiosk.
    }
    if (!laag) {
      laag = document.createElement('div');
      laag.className = 'alarmlaag';
      laag.setAttribute('role', 'alertdialog');
      laag.addEventListener('click', (e) => {
        if (!e.target.closest('[data-alarm-dicht]')) return;
        alarmGesloten = laag.dataset.sleutel;
        laag.remove();
      });
      document.body.append(laag);
    }
    laag.dataset.sleutel = sleutel;
    const eerste = aan[0];
    const kamers = [...new Set(aan.filter((x) => x.gevaar === eerste.gevaar).map((x) => metLidwoord(x.kamer)))];
    const waar = kamers.length > 1 ? `${kamers.slice(0, -1).join(', ')} ${global.t('algemeen.en')} ${kamers.at(-1)}` : kamers[0];
    const titel = global.t('basis.alarm.titel', { gevaar: GEVAAR(eerste.gevaar), waar });
    const raad = global.t(eerste.gevaar === 'co' ? 'basis.alarm.raadCo' : 'basis.alarm.raad');
    const ziet = eerste.sindsMs ? global.t('basis.alarm.zietSinds', { kamer: metLidwoord(eerste.kamer), wat: WAT(eerste.gevaar), klok: klokVan(eerste.sindsMs) }) : global.t('basis.alarm.ziet', { kamer: metLidwoord(eerste.kamer), wat: WAT(eerste.gevaar) });
    laag.setAttribute('aria-label', titel);
    laag.innerHTML = `<div class="alarm-in">
      <span class="alarm-puls" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20c-2.5 0-4-1.8-4-3.8 0-2.6 2.4-3.4 2.4-6.2 2 1 3 2.8 3 4.4.6-.8 1-2 1-3.4 2.4 1.4 4.6 3.6 4.6 6.6 0 1.7-1.3 2.4-2 2.4"/><path d="M14 6c1-1 1-2.5 0-3.5M18 8c1-1 1-2.5 0-3.5"/></svg></span>
      <h1>${esc(titel)}</h1>
      <p class="alarm-zin">${esc(`${ziet} ${raad}`)}</p>
      <div class="alarm-lijst">${(m.melders ?? []).map((x) => `<div><b>${esc(x.kamer)}</b><span class="${x.gevaar ? '' : 'ok'}">${esc(x.gevaar ? WAT(x.gevaar) : global.t('basis.alarm.niets'))}</span></div>`).join('')}</div>
      <button type="button" class="knop knop-licht" data-alarm-dicht>${esc(global.t('algemeen.sluiten'))}</button>
      <p class="alarm-klein">${esc(global.t('basis.alarm.uitzetten'))}</p>
    </div>`;
    laag.querySelector('[data-alarm-dicht]').focus();
  }

  /*
   * Er wordt aangebeld (besluit 107): het beeld van de deurbel schermvullend,
   * op elke pagina, en na de ingestelde tijd weer weg (besluit 109). In Fully Kiosk Browser gaat
   * ook het scherm aan; een gewone browser kan dat niet.
   */
  let belTimer = null;
  function aanbellen(m) {
    // Een wand in de nachtstand of in rust wordt wakker (besluit 164).
    dispatchEvent(new CustomEvent('sc-wek', { detail: 'bel' }));
    // Het scherm aan, als dat zo is ingesteld (besluit 109); kan alleen in Fully Kiosk.
    if (m.schermAan !== false) {
      try {
        global.fully?.turnScreenOn?.();
        global.fully?.bringToForeground?.();
      } catch {
        // Geen Fully Kiosk.
      }
    }
    let laag = document.querySelector('.aanbel');
    if (!laag) {
      laag = document.createElement('div');
      laag.className = 'aanbel';
      laag.setAttribute('role', 'dialog');
      laag.setAttribute('aria-label', m.titel ?? global.t('basis.bel.titel'));
      laag.addEventListener('click', (e) => {
        if (e.target.closest('[data-bel-dicht]')) sluitBel();
      });
      document.body.append(laag);
    }
    // Belt er opnieuw iemand terwijl het beeld er staat: eerst het oude beeld stoppen.
    stopBeelden(laag);
    laag.innerHTML = `<div class="aanbel-kop"><span class="bol adem" style="width: 34px; height: 34px"></span><div><b>${esc(m.titel ?? global.t('basis.bel.titel'))}</b><span>${esc(m.naam ?? global.t('basis.bel.deurbel'))}, ${klokVan(m.tMs ?? Date.now())}</span></div><button type="button" class="knop" data-bel-dicht>${esc(global.t('algemeen.sluiten'))}</button></div>
      <div class="aanbel-beeld"><p class="zacht">${esc(global.t('basis.bel.komt'))}</p></div>`;
    void belBeeld(laag, [m.camera, ...(Array.isArray(m.reserve) ? m.reserve : [])], m.naam ?? global.t('thuis.deurbel.deDeurbel'));
    laag.querySelector('[data-bel-dicht]').focus();
    clearTimeout(belTimer);
    belTimer = setTimeout(sluitBel, Math.max(30, Math.min(600, Number(m.seconden) || 120)) * 1000);
  }
  /*
   * Het beeld van de deurbel, zoals in Kamer (21 oktober 2026): eerst een
   * plaatje, dan het live beeld eroverheen zodra dat er is. Eerst wachtte de
   * laag alleen op het live beeld, en bleef hij zwart als dat niet kwam,
   * terwijl dezelfde camera in Kamer meteen beeld gaf. Geeft een beeld geen
   * plaatje, dan het volgende beeld van dezelfde camera; komt live niet, dan
   * elke seconde een nieuw plaatje.
   */
  let belVers = null;
  /** Het live beeld dat nog laadt; buiten de pagina, dus apart stoppen. */
  let belStroom = null;
  /** Het live beeld opnieuw starten, bijvoorbeeld als het scherm net aanging. */
  let belOpnieuw = null;
  /*
   * Meteen het vloeiende beeld (25 oktober 2026): het live beeld start tegelijk
   * met het plaatje, niet erna, en met voorrang (`bel=1`): telefoons met een
   * camera open tellen dan niet mee in de grens van vier. Valt het weg of komt
   * het niet, dan opnieuw; tot dan na anderhalve tel elke seconde een vers
   * plaatje. Gaat het scherm net aan (een tablet die sliep), dan begint het
   * live beeld opnieuw: de oude stroom is dan dood.
   */
  async function belBeeld(laag, ids, naam) {
    const vak = laag.querySelector('.aanbel-beeld');
    let live = false;
    let id = encodeURIComponent(ids[0]);
    let pogingen = 0;
    const startLive = () => {
      if (!laag.isConnected) return;
      belStroom?.removeAttribute('src');
      const stroom = new Image();
      belStroom = stroom;
      live = false;
      stroom.alt = global.t('basis.bel.liveVan', { naam });
      stroom.onload = () => {
        if (!laag.isConnected || belStroom !== stroom) return void stroom.removeAttribute('src');
        live = true;
        const nu = vak.querySelector('img');
        if (nu && nu !== stroom) nu.replaceWith(stroom);
        else if (!nu) vak.replaceChildren(stroom);
      };
      stroom.onerror = () => {
        if (belStroom !== stroom || !laag.isConnected || pogingen >= 4) return;
        pogingen += 1;
        setTimeout(startLive, 1500);
      };
      stroom.src = `api/camera?id=${id}&live=1&bel=1&t=${Date.now()}`;
    };
    belOpnieuw = () => {
      pogingen = 0;
      startLive();
    };
    startLive();
    let res = null;
    for (const kandidaat of ids) {
      id = encodeURIComponent(kandidaat);
      res = await fetch(`api/camera?id=${id}`, { cache: 'no-store' }).catch(() => null);
      if (!laag.isConnected) return;
      if (res?.ok || res?.status === 401) break;
    }
    if (!res?.ok) {
      if (live) return;
      vak.innerHTML = res?.status === 401
        ? `<p>${esc(global.t('basis.bel.inloggen'))} <a href="auth/login?terug=${encodeURIComponent(location.pathname + location.hash)}">${esc(global.t('basis.bel.inlogKnop'))}</a></p>`
        : `<p>${esc(global.t('basis.bel.geenBeeld'))}</p>`;
      return;
    }
    // Het eerste beeld gaf niets: het live beeld van het beeld dat wel werkt.
    if (id !== encodeURIComponent(ids[0])) startLive();
    const url = URL.createObjectURL(await res.blob());
    if (!laag.isConnected) return URL.revokeObjectURL(url);
    // Is het live beeld er al, dan het plaatje niet eroverheen.
    if (!live) vak.innerHTML = `<img alt="${esc(global.t('basis.bel.beeldVan', { naam }))}" src="${url}">`;
    else URL.revokeObjectURL(url);
    clearInterval(belVers);
    let bezig = false;
    setTimeout(() => {
      if (live || !laag.isConnected) return;
      belVers = setInterval(async () => {
        if (live || bezig || !laag.isConnected) return;
        const img = vak.querySelector('img');
        if (!img || img === belStroom) return;
        bezig = true;
        const r = await fetch(`api/camera?id=${id}`, { cache: 'no-store' }).catch(() => null);
        bezig = false;
        if (!r?.ok || live || !laag.isConnected || !img.isConnected) return;
        const oud = img.src;
        img.src = URL.createObjectURL(await r.blob());
        URL.revokeObjectURL(oud);
      }, 1000);
    }, 1500);
  }
  // Het scherm gaat aan terwijl het beeld er staat: het live beeld opnieuw.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.querySelector('.aanbel')) belOpnieuw?.();
  });
  function sluitBel() {
    clearTimeout(belTimer);
    clearInterval(belVers);
    const laag = document.querySelector('.aanbel');
    if (laag) stopBeelden(laag);
    laag?.remove();
  }
  /** Zonder bron stopt de stroom; alleen weghalen laat hem soms doorlopen. */
  function stopBeelden(laag) {
    clearInterval(belVers);
    belStroom?.removeAttribute('src');
    belStroom = null;
    belOpnieuw = null;
    laag.querySelectorAll('img').forEach((img) => img.removeAttribute('src'));
  }

  /**
   * Tekenen, gebundeld: hoe vaak er ook om gevraagd wordt (een klik, de
   * live-stroom, een verversing), hooguit één keer per beeld. Zonder dit liep
   * de pagina vast bij snel klikken: elke klik tekende het hele huis opnieuw.
   */
  function gebundeld(fn) {
    let gepland = false;
    return () => {
      if (gepland) return;
      gepland = true;
      requestAnimationFrame(() => {
        gepland = false;
        fn();
      });
    };
  }

  /** Welke stand er te zien is: '#wand' of '#tel'. Alleen die wordt getekend. */
  const zicht = () => (telStand() ? '#tel' : '#wand');

  /**
   * Een gast verandert geen instellingen (besluit 151). De dienst weigert het
   * al; hier ziet hij het ook: een instellingenpagina gaat terug naar
   * Instellingen, die hem alleen Bewoners en toegang laat zien (om uit te
   * loggen) en Wat je huis kan.
   */
  async function gastGrens() {
    const pagina = location.pathname.split('/').pop() || '';
    if (['instellingen.html', 'toegang.html', 'huis-kan.html'].includes(pagina)) return;
    const ik = await haal('api/bewoners').then((b) => b.ik, () => null);
    if (ik?.soort === 'gast') location.replace('instellingen.html');
  }

  /*
   * Volledig scherm in Home Assistant (besluit 155), per apparaat.
   *
   * Achter Ingress staat de app in een paneel van Home Assistant, met de
   * zijbalk en een kopbalk eromheen. Home Assistant kent zelf een kioskstand
   * voor een app: die vraagt de app met een bericht (`subscribe-properties`
   * met `kioskMode`), en het paneel zet hem zelf weer uit als je het verlaat.
   * Een andere pagina van de app laat hem staan. Voor de balken van de
   * browser zelf vraagt de app het hele scherm, op het document van Home
   * Assistant: dat blijft staan als de app een andere pagina laadt. Dat mag
   * alleen na een tik, dus bij de eerste.
   *
   * De keuze staat in dit apparaat (localStorage): de wand wel, de telefoon niet.
   */
  const VOLLEDIG = 'sc-volledig-scherm';
  const inHA = () => global.parent !== global && /^\/api\/hassio_ingress\//.test(location.pathname);

  /*
   * De toegang via Home Assistant (21 oktober 2026). In Home Assistant opent
   * de app via ingress, met een sessie die na een tijd verloopt; Home
   * Assistant houdt hem elke minuut vast. Sliep de tablet aan de wand, dan
   * verliep hij toch, en gaf de eerstvolgende vraag 401 van Home Assistant
   * zelf. De app dacht dat je moest inloggen en ging naar de inlogpagina, en
   * ook die weigerde Home Assistant: "401: Unauthorized" tot iemand ververste.
   * Nu houdt de app de sessie zelf ook vast, vernieuwt hij hem bij zo'n 401
   * en vraagt hij het opnieuw. Een 401 van de dienst zelf is JSON, en gaat
   * nog steeds naar het inloggen.
   */
  const SESSIE = 'ingress_session';
  function haHass() {
    try {
      return global.parent.document.querySelector('home-assistant')?.hass ?? null;
    } catch {
      return null;
    }
  }
  const sessieNu = () => document.cookie.split('; ').find((c) => c.startsWith(`${SESSIE}=`))?.slice(SESSIE.length + 1) ?? null;
  /** Een 401 van Home Assistant zelf, niet van de dienst: dan is de sessie verlopen. */
  const ingressDicht = (res) => res.status === 401 && inHA() && !(res.headers.get('content-type') ?? '').includes('json');
  let verversen = null;
  /** Een nieuwe sessie bij Home Assistant, zoals het paneel van Home Assistant dat doet. */
  function verseToegang() {
    if (!inHA()) return Promise.resolve(false);
    verversen ??= (async () => {
      const hass = haHass();
      if (!hass?.callWS) return false;
      try {
        const r = await hass.callWS({ type: 'supervisor/api', endpoint: '/ingress/session', method: 'post' });
        if (!r?.session) return false;
        document.cookie = `${SESSIE}=${r.session};path=/api/hassio_ingress/;SameSite=Strict${location.protocol === 'https:' ? ';Secure' : ''}`;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (verversen = null), 0);
      }
    })();
    return verversen;
  }
  /** De sessie vasthouden: nog geldig, dan langer; anders een nieuwe. Elke minuut, en voor een nieuwe pagina. */
  async function houToegang() {
    if (!inHA()) return true;
    const hass = haHass();
    const s = sessieNu();
    if (!hass?.callWS) return false;
    if (s) {
      try {
        await hass.callWS({ type: 'supervisor/api', endpoint: '/ingress/validate_session', method: 'post', data: { session: s } });
        return true;
      } catch {
        // Verlopen: een nieuwe.
      }
    }
    return verseToegang();
  }
  if (inHA()) {
    setInterval(() => document.visibilityState === 'visible' && void houToegang(), 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void houToegang());
    addEventListener('online', () => void houToegang());
  }
  function volledigGekozen() {
    try {
      return localStorage.getItem(VOLLEDIG) === '1';
    } catch {
      return false;
    }
  }
  /*
   * Naar Home Assistant zet het volledige scherm even uit: je blijft in de app,
   * met de zijbalk en de kopbalk van Home Assistant, en kiest daar zelf waar je
   * heen gaat. Dat geldt voor dit paneel; de volgende keer dat je de app opent
   * (een nieuw vak), of met dezelfde knop, is het er weer. Het onthouden staat
   * bij Home Assistant, want het vak laadt bij elke pagina opnieuw.
   */
  const PAUZE = '__scVolledigPauze';
  function gepauzeerd() {
    try {
      return !!global.frameElement && global.parent[PAUZE] === global.frameElement;
    } catch {
      return false;
    }
  }
  const volledigNu = () => inHA() && volledigGekozen() && !gepauzeerd();
  /** Een bericht aan het paneel van Home Assistant om de app heen; alleen naar dezelfde herkomst. */
  const aanHA = (bericht) => global.parent.postMessage(bericht, location.origin);
  /** Het document van Home Assistant, als het mag; anders null. */
  function haDocument() {
    try {
      return global.parent.document;
    } catch {
      return null;
    }
  }
  /**
   * Een telefoon krijgt nooit het hele scherm van de browser, alleen de
   * kioskstand: dan ziet hij eruit als de app van de NAS, met de statusbalk
   * erboven. Met het hele scherm schoof de statusbalk na de terugknop over de
   * pagina, of was hij er op de ene pagina wel en op de andere niet. Een
   * telefoon is een scherm met een kortste kant onder 600, ook liggend.
   */
  const isTelefoon = () => Math.min(global.screen?.width ?? 0, global.screen?.height ?? 0) < 600;
  function heelScherm(e) {
    // De eerste tik is Naar Home Assistant: dan juist niet.
    if (e?.target?.closest?.('[data-naar-ha]') || isTelefoon()) return;
    const doc = haDocument();
    if (doc && volledigNu() && !doc.fullscreenElement) doc.documentElement.requestFullscreen?.().catch(() => {});
  }
  /** Bij de eerste tik het hele scherm, en na de terugknop van Android weer bij de volgende. */
  const opTik = () => addEventListener('click', heelScherm, { once: true, capture: true });
  function volledig() {
    if (!inHA() || !volledigGekozen()) return;
    const doc = haDocument();
    const weer = () => {
      if (!doc.fullscreenElement && volledigNu()) opTik();
    };
    doc?.addEventListener('fullscreenchange', weer);
    // Het document van Home Assistant blijft; de luisteraar gaat mee met deze pagina.
    addEventListener('pagehide', () => doc?.removeEventListener('fullscreenchange', weer));
    // Een telefoon die het hele scherm nog had van een eerdere versie: weer met statusbalk.
    if (isTelefoon() && doc?.fullscreenElement) doc.exitFullscreen().catch(() => {});
    if (!volledigNu()) return;
    aanHA({ type: 'home-assistant/subscribe-properties', kioskMode: true });
    statusbalk(true);
    opTik();
  }
  /** Het hele scherm en de balken van Home Assistant uit, of weer aan. */
  /*
   * De statusbalk in de kleur van de app (#0b1424, licht #e9eff6), zoals de app van de NAS.
   * De app van Home Assistant kleurt de statusbalk en de balk onderin naar het
   * thema van Home Assistant (`--app-header-background-color` en
   * `--primary-background-color`), en leest die opnieuw bij het bericht
   * `theme-update`. Zolang Smart Climate volledig scherm heeft, zet de app die
   * twee op het document van Home Assistant; daarna komt het thema terug. Dat
   * terugzetten leeft bij Home Assistant zelf, want deze pagina is dan al weg
   * als je het paneel verlaat. Alleen in de app van Home Assistant.
   */
  const statusbalkKleur = () => (document.documentElement.classList.contains('sc-licht') ? '#e9eff6' : '#0b1424');
  const STATUSBALK_CODE = `
    const html = document.documentElement;
    const namen = ['--app-header-background-color', '--primary-background-color'];
    const meld = () => {
      try {
        document.querySelector('home-assistant')?.hass?.auth?.external?.fireMessage({ type: 'theme-update' });
      } catch {}
    };
    const balk = {
      oud: null,
      pad: '',
      zet(kleur) {
        if (!balk.oud) balk.oud = namen.map((n) => [n, html.style.getPropertyValue(n)]);
        for (const n of namen) html.style.setProperty(n, kleur);
        balk.pad = location.pathname;
        addEventListener('location-changed', balk.weg);
        meld();
      },
      terug() {
        removeEventListener('location-changed', balk.weg);
        if (!balk.oud) return;
        for (const [n, v] of balk.oud) v ? html.style.setProperty(n, v) : html.style.removeProperty(n);
        balk.oud = null;
        meld();
      },
      weg() {
        if (location.pathname !== balk.pad) balk.terug();
      },
    };
    return balk;`;
  function statusbalk(aan) {
    try {
      const w = global.parent;
      if (!w.document.querySelector('home-assistant')?.hass?.auth?.external) return;
      w.__scStatusbalk ??= new w.Function(STATUSBALK_CODE)();
      if (aan) w.__scStatusbalk.zet(statusbalkKleur());
      else w.__scStatusbalk.terug();
    } catch {
      // Een vak van een andere herkomst, of Home Assistant laat het niet toe.
    }
  }
  /*
   * Wisselt het thema (de telefoon draait, of hij wordt 's avonds donker), dan
   * de balken van Home Assistant mee, anders bleven ze licht om een donkere
   * pagina staan, of andersom.
   */
  let lichtWas = document.documentElement.classList.contains('sc-licht');
  new MutationObserver(() => {
    const licht = document.documentElement.classList.contains('sc-licht');
    if (licht === lichtWas) return;
    lichtWas = licht;
    if (inHA() && volledigNu() && !gepauzeerd()) statusbalk(true);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  function balkenVanHA(terug) {
    statusbalk(!terug);
    if (terug) {
      aanHA({ type: 'home-assistant/unsubscribe-properties' });
      const doc = haDocument();
      if (doc?.fullscreenElement) doc.exitFullscreen().catch(() => {});
    } else {
      aanHA({ type: 'home-assistant/subscribe-properties', kioskMode: true });
      heelScherm();
    }
  }
  /** Aan of uit op dit apparaat, en meteen zo. */
  function zetVolledig(aan) {
    try {
      if (aan) localStorage.setItem(VOLLEDIG, '1');
      else localStorage.removeItem(VOLLEDIG);
    } catch {
      // Geen opslag (privévenster): dan alleen voor nu.
    }
    if (!inHA()) return;
    pauze(false);
    knoppenNaarHA();
    balkenVanHA(!aan);
  }
  function pauze(aan) {
    try {
      if (aan) global.parent[PAUZE] = global.frameElement;
      else if (gepauzeerd()) delete global.parent[PAUZE];
    } catch {
      // Een vak van een andere herkomst.
    }
  }
  /** Naar Home Assistant: het volledige scherm uit, en de balken van Home Assistant terug. */
  function naarHA() {
    pauze(true);
    balkenVanHA(true);
    knoppenNaarHA();
  }
  /*
   * Een scherm van Home Assistant openen (besluit 179), zoals Instellingen ›
   * Personen. De app draait in een paneel van dezelfde herkomst; Home Assistant
   * navigeert zelf als zijn adres verandert en het "location-changed" hoort.
   * Het volledige scherm gaat eerst uit, zoals bij de knop naar Home Assistant.
   */
  function naarHAScherm(pad) {
    if (!inHA()) return false;
    try {
      naarHA();
      global.parent.history.pushState(null, '', pad);
      global.parent.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return true;
    } catch {
      return false;
    }
  }
  /** Weer volledig scherm, met dezelfde knop. */
  function weerVolledig() {
    pauze(false);
    balkenVanHA(false);
    knoppenNaarHA();
  }
  /**
   * De knop naar Home Assistant: op de wand boven de bel, op de telefoon naast
   * het tandwiel. Staat het volledige scherm even uit, dan zet dezelfde knop
   * het weer aan.
   */
  function knoppenNaarHA() {
    $$('[data-naar-ha-knop]').forEach((k) => k.remove());
    if (!inHA() || !volledigGekozen()) return;
    const uit = gepauzeerd();
    const label = esc(global.t(uit ? 'basis.volledig' : 'basis.naarHA'));
    const wat = uit ? `data-weer-volledig aria-label="${label}" title="${label}"` : `data-naar-ha aria-label="${label}" title="${label}"`;
    const icoon = uit ? VOLLEDIG_ICOON : NAAR_HA;
    document.getElementById('balk')?.querySelector('[data-meldbel]')?.insertAdjacentHTML('beforebegin', `<button type="button" class="meldbel naarha" data-naar-ha-knop ${wat}>${icoon}</button>`);
    $$('#tel [data-tandwiel]').forEach((t) => {
      const naast = t.parentElement.querySelector(':scope > [data-meldbel]') ?? t;
      naast.insertAdjacentHTML('beforebegin', `<button type="button" class="pil naarha" data-naar-ha-knop ${wat}>${icoon}</button>`);
    });
  }
  const NAAR_HA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h5"/><path d="M14 15.5h7M18 12.5l3 3-3 3"/></svg>';
  const VOLLEDIG_ICOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-naar-ha]')) naarHA();
    else if (e.target.closest?.('[data-weer-volledig]')) weerVolledig();
  });

  /**
   * Eén bovenbalk op de telefoon (besluit 187): op elke tab de hulp, de bel en
   * het tandwiel, even groot (36 px) en op dezelfde plek, rechtsboven, naast de
   * titel als de tab er een heeft. Thuis heeft ze al in zijn kopregel, met het
   * weer ervoor. De hulp is de rondleiding, vanaf deze tab.
   */
  const TEL_TABS = ['vandaag', 'apparaten', 'opbrengst', 'assistent'];
  function telBalk(tab) {
    const tel = document.getElementById('tel');
    if (!tel || !TEL_TABS.includes(tab) || tel.querySelector('[data-meldbel]')) return;
    // Elke tab laadt de rondleiding; soms pas na deze regel, dus niet op global.rondleiding wachten.
    const hulp = `<button type="button" class="pil telknop uitlegknop" aria-label="${esc(global.t('thuis.uitleg'))}" data-tel-hulp>?</button>`;
    const knoppen = `<span class="telknoppen">${hulp}<button type="button" class="pil telknop meldbel" aria-label="${esc(global.t('nav.meldingen'))}" aria-haspopup="dialog" data-meldbel data-meldicoon><b data-meldaantal hidden></b></button><a class="pil telknop" aria-label="${esc(global.t('nav.instellingen'))}" data-tandwiel></a></span>`;
    const oud = tel.querySelector('[data-tandwiel]');
    // Alleen een titel die bovenaan staat; op Opbrengst staat de periode erboven.
    const titel = tel.querySelector('.inhoud > h1.kop-1:first-child');
    if (oud) oud.outerHTML = knoppen;
    else if (titel) titel.outerHTML = `<div class="telbalk metkop">${titel.outerHTML}${knoppen}</div>`;
    else (tel.querySelector('.inhoud') ?? tel).insertAdjacentHTML('afterbegin', `<div class="telbalk">${knoppen}</div>`);
  }
  document.addEventListener('click', (e) => e.target.closest?.('[data-tel-hulp]') && global.rondleiding?.start());

  /*
   * Wat het huis heeft (besluit 196): een slimme meter en een zonnemeting.
   * Zonder panelen heet Opbrengst Verbruik, zonder meter is wat er over is
   * geschat. Onthouden, zodat de navigatie het bij de volgende pagina meteen
   * goed zegt; null zolang de dienst het nog niet zei.
   */
  let soort = (() => {
    try {
      return JSON.parse(localStorage.getItem('sc-huissoort')) ?? null;
    } catch {
      return null;
    }
  })();
  const huisSoort = () => soort;
  function zetNav(tab) {
    const balk = document.getElementById('balk');
    const tabs = document.getElementById('tabs');
    if (balk) nav.balk(balk, tab, LINKS);
    if (tabs) nav.tabs(tabs, tab, LINKS);
  }
  async function leesHuisSoort(tab) {
    let s;
    try {
      s = await haal('api/site');
    } catch {
      return;
    }
    const nieuw = { meter: s.meter !== false, zon: s.zonMeter !== false };
    if (JSON.stringify(nieuw) === JSON.stringify(soort)) return;
    soort = nieuw;
    try {
      localStorage.setItem('sc-huissoort', JSON.stringify(nieuw));
    } catch {
      // Dan zegt de navigatie het pas na het laden goed.
    }
    // De bel staat in de navigatie: zijn getal opnieuw.
    zetNav(tab);
    void meldLaad();
    dispatchEvent(new Event('huissoort'));
  }

  /** Zet de navigatie, de stand en de klok voor een tab. */
  function start(tab) {
    zetNav(tab);
    void leesHuisSoort(tab);
    telBalk(tab);
    // Volledig scherm in Home Assistant (besluit 155): de weg terug staat boven de bel.
    knoppenNaarHA();
    luchtAchterVak();
    $$('[data-tandwiel]').forEach((a) => {
      a.innerHTML = nav.svg('instellingen');
      a.setAttribute('href', LINKS.instellingen);
    });
    // De live-stroom, ook voor de deurbel op een pagina zonder live gegevens.
    stroom();
    // Om de app te installeren; dat kan alleen over HTTPS (of met een uitzondering in Chrome).
    if ('serviceWorker' in navigator && global.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    addEventListener('keydown', (e) => e.key === 'Escape' && sluitBel());
    // Het toetsenbord gaat weg als het veld de focus verliest: dan weer op zijn plek.
    global.visualViewport?.addEventListener('resize', toetsenbord);
    document.addEventListener('focusin', () => setTimeout(toetsenbord, 350));
    document.addEventListener('focusout', () => setTimeout(() => {
      if (!typt()) schaal();
    }, 50));
    // Wisselt de stand (de tablet draait), dan tekent de pagina de andere opnieuw.
    let stand = telStand();
    addEventListener('resize', () => {
      schaal();
      if (telStand() !== stand) {
        stand = telStand();
        dispatchEvent(new Event('standwissel'));
      }
    });
    schaal();
    klok();
    setInterval(klok, 10_000);
    nieuweVersie();
    meldingenStart();
    luisterStart();
    void weergaveLaden();
    niemandStart();
    if (tab === 'instellingen') void gastGrens();
  }

  /*
   * Weergave (besluit 164): eenvoudig of uitgebreid, grotere letters en minder
   * beweging, bewaard bij je account. Hier ook onthouden, zodat de pagina
   * meteen goed staat; de dienst heeft het laatste woord.
   */
  const WEERGAVE = 'sc-weergave';
  const GEEN_WEERGAVE = { eenvoudig: false, groteLetters: false, minderBeweging: false, seizoen: true, weer: true, feestdagen: true };
  let weergaveNu = GEEN_WEERGAVE;
  function zetWeergave(w, onthoud = true) {
    weergaveNu = { ...GEEN_WEERGAVE, ...w };
    const d = document.documentElement.classList;
    d.toggle('sc-eenvoudig', weergaveNu.eenvoudig);
    d.toggle('sc-groot', weergaveNu.groteLetters);
    d.toggle('sc-stil', weergaveNu.minderBeweging);
    // Het seizoen, het weer en de feestdagen in het huis (25 oktober 2026): de tekening leest het.
    d.toggle('sc-geen-seizoen', weergaveNu.seizoen === false);
    d.toggle('sc-geen-weer', weergaveNu.weer === false);
    d.toggle('sc-geen-feest', weergaveNu.feestdagen === false);
    if (onthoud) {
      try {
        localStorage.setItem(WEERGAVE, JSON.stringify(weergaveNu));
      } catch {
        // Dan alleen voor nu.
      }
    }
    dispatchEvent(new Event('weergave'));
  }
  try {
    const w = JSON.parse(localStorage.getItem(WEERGAVE) ?? 'null');
    if (w) zetWeergave(w, false);
  } catch {
    // Niets onthouden.
  }
  /*
   * Wat geldt op dit scherm (25 oktober 2026): op een scherm aan de wand de
   * weergave, het thema, de kleur en de taal van wie de wand volgt, net als zijn
   * kaarten; anders die van jou. `volgt` is dan diens naam.
   */
  function persoonlijk(v) {
    const p = v?.scherm && v.wand?.persoon ? v.wand.persoon : null;
    return {
      weergave: p?.weergave ?? v?.tel?.weergave ?? null,
      thema: p?.thema ?? v?.tel?.thema,
      taal: p?.taal ?? v?.tel?.taal,
      kleur: p ? v.wand.kleur : v?.tel?.kleur,
      scherm: v?.scherm === true && !p,
      volgt: p ? (v.wand.naam ?? '') : null,
    };
  }
  async function weergaveLaden() {
    try {
      const v = await haal('api/voorkeuren');
      const w = persoonlijk(v).weergave;
      if (w) zetWeergave(w);
      zetThema(v);
    } catch {
      // Zonder logmap: zoals het was.
    }
  }

  /*
   * Het thema en de kleur (besluit 181): op de telefoon jouw thema en kleur,
   * op de wand de kleur van wiens comfort geldt. Het script in de <head> zet
   * ze vóór de eerste weergave uit wat het onthield; hier houden we dat bij.
   * De kleuren van alle bewoners zijn voor de begroeting en de rondjes.
   */
  let kleurenNu = {};
  function zetThema(v) {
    if (!v?.tel) return;
    // Op een scherm dat iemand volgt, diens thema, kleur en taal (25 oktober 2026).
    const p = persoonlijk(v);
    global.scThema?.({ thema: p.thema, kleur: p.kleur, wandKleur: v.wand?.kleur, scherm: p.scherm });
    // De taal bij Jij (besluit 185); een scherm zonder bewoners volgt zijn account.
    global.taal.zetKeuze(p.taal, { scherm: p.scherm });
    const nieuw = v.kleuren ?? {};
    if (JSON.stringify(nieuw) === JSON.stringify(kleurenNu)) return;
    kleurenNu = nieuw;
    dispatchEvent(new Event('sc-kleuren'));
  }
  /** Een betekeniskleur als tekst: in het lichte thema de donkere tint, anders haalt hij het contrast niet. */
  const tekstKleur = (k) => String(k).replace(/var\(--(zon|ijs|mint|gloed)\)/, 'var(--$1-t)').replace('var(--violet)', 'var(--violet-t)');
  /** De kleur van een bewoner (zijn id): `data-kleur="${app.kleurVan(id)}"` kleurt met var(--accent). */
  const kleurVan = (bewonerId) => kleurenNu[bewonerId] ?? 'lucht';

  /** De wand als niemand kijkt (besluit 164): op Thuis en de pagina's om naar te kijken. */
  function niemandStart() {
    if (global.niemand || !/\/(thuis|vandaag|apparaten|opbrengst|assistent|kamer)\.html$/.test(location.pathname)) return;
    const s = document.createElement('script');
    s.src = 'niemand.js';
    document.head.append(s);
  }

  /**
   * "Hé huis" (besluit 150): op een scherm waar luisteren aan staat, laadt elke pagina het
   * luisteren erbij. Op een telefoon nooit vanzelf; daar tik je op de microfoon.
   */
  function luisterStart() {
    let aan = false;
    try {
      aan = localStorage.getItem('sc-luisteren') === 'aan';
    } catch {
      aan = false;
    }
    if (!aan || telStand() || global.luisteren || !global.isSecureContext) return;
    const s = document.createElement('script');
    s.src = 'luisteren.js';
    document.head.appendChild(s);
  }

  /* ------------------------------------------------- meldingen (besluit 136) */

  /*
   * De bel in het menu (schets Wand-Meldingen): een getal als er iets aandacht
   * vraagt, een blad met Vraagt aandacht, Eerder en Onderhoud. Elke twee
   * minuten bij, en als je de app weer opent. Na een update één keer "Wat is
   * er nieuw", als pop-up.
   */
  let meld = { actief: [], eerder: [] };
  let meldZicht = 'lijst';
  const MELDICOON = {
    nieuw: ['blauw', '<path d="M12 5v14M5 12h14"/>'],
    stil: ['rood', '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>'],
    batterij: ['geel', '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M5 10v4"/>'],
    filter: ['geel', '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'],
    meter: ['rood', '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
    versie: ['paars', '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>'],
    mijlpaal: ['blauw', '<path d="M4 18c3-8 6-10 8-10s4 3 8 0"/>'],
    // Wiens comfort geldt (besluit 147): een persoon.
    comfort: ['geel', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'],
    // De panelen zijn gemeten (besluit 157): een zon.
    // Een nieuwe versie die klaarstaat (21 oktober 2026): een pijl omlaag.
    update: ['blauw', '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'],
    panelen: ['geel', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    // Een rookmelder (21 oktober 2026): rook, koolmonoxide of hitte, of vervangen.
    rook: ['rood', '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2"/>'],
    goed: ['groen', '<path d="M5 12l5 5 9-10"/>'],
    onderhoud: ['grijs', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
  };
  const meldIcoon = (soort) => {
    const [kleur, pad] = MELDICOON[soort] ?? MELDICOON.nieuw;
    return `<span class="ik ${kleur}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pad}</svg></span>`;
  };
  const wanneerMeld = (ms) => wanneer(ms, { kort: true });

  /*
   * Elke melding is aan te tikken en weg te halen (aangevuld 15 oktober): een
   * versie opent weer wat er nieuw was, de rest gaat naar het apparaat.
   */
  const weg = (m) => `<button type="button" class="meldweg" data-meld-weg="${esc(m.id)}" aria-label="${esc(global.t('basis.meld.verwijder', { titel: m.titel }))}">×</button>`;
  const doel = (m) => (m.soort === 'versie' ? `data-meld-versie="${esc(m.id.replace(/^versie:/, ''))}"` : m.soort === 'update' ? 'data-meld-update' : m.actie ? `data-meld-href="${esc(m.actie.href)}"` : '');
  function meldLijst() {
    const kaart = (m) => `<div class="melding" ${doel(m)}>${meldIcoon(m.soort)}<b>${esc(m.titel)}</b>${weg(m)}<p>${esc(m.tekst)}</p>
      <div class="acties">${m.actie ? `<a class="licht" href="${esc(m.actie.href)}">${esc(m.actie.label)}</a>` : ''}<span class="tijd">${esc(wanneerMeld(m.sindsMs))}</span></div></div>`;
    const oud = (m) => `<div class="melding oud" ${doel(m)}>${meldIcoon(m.soort === 'versie' || m.soort === 'mijlpaal' ? m.soort : 'goed')}<b>${esc(m.titel)}</b>${weg(m)}<p>${esc(m.tekst)}</p></div>`;
    const aandacht = meld.actief.length
      ? `<h3>${esc(global.t('basis.meld.aandacht'))}</h3>${meld.actief.map(kaart).join('')}`
      : `<div class="stil"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><b>${esc(global.t('basis.meld.allesWerkt'))}</b>${esc(global.t('basis.meld.allesWerktZin'))}</div>`;
    const eerder = meld.eerder.length ? `<h3>${esc(global.t('basis.meld.eerder'))}</h3>${meld.eerder.slice(0, 5).map(oud).join('')}` : '';
    // Alles wissen (besluit 187): alleen als er iets te wissen is.
    const alles = meld.actief.length || meld.eerder.length ? `<button type="button" class="meldalles" data-meld-alles>${esc(global.t('basis.meld.allesWissen'))}</button>` : '';
    return `<div class="kop"><h2 class="kop-2">${esc(global.t('nav.meldingen'))}</h2>${alles}<button type="button" class="sluit" data-meld-sluit aria-label="${esc(global.t('algemeen.sluiten'))}">×</button></div>
      ${aandacht}${eerder}
      ${onderhoudKnop()}`;
  }

  /*
   * Wat bij Onderhoud bijna op is (besluit 167): uit dezelfde batterijen en
   * filters als de sleutel op Thuis, ook als de melding al weg is getikt. Eerst
   * keek de knop alleen naar de meldingen, en zei hij "Alle batterijen en
   * filters" terwijl Thuis een lege batterij liet zien.
   */
  let onderhoudOp = null;
  async function onderhoudBij() {
    try {
      const huis = await haal('api/huis');
      onderhoudOp = [
        ...(huis?.batterijen ?? []).filter((b) => bijnaOp(b.pct, 'batterij', huis)).map((b) => ({ soort: 'batterij', naam: b.naam, pct: b.pct })),
        ...(huis?.filters ?? []).map((f) => ({ soort: 'filter', naam: f.naam, pct: f.pct })),
      ];
    } catch {
      // Dan wat de meldingen zeggen.
    }
    $$('[data-meldblad] [data-meld-onderhoud]').forEach((k) => (k.outerHTML = onderhoudKnop()));
  }

  /** De knop naar Onderhoud: een geel stipje en wat bijna op is, anders gewoon. */
  function onderhoudKnop() {
    const op = onderhoudOp ?? meld.actief.filter((m) => m.soort === 'batterij' || m.soort === 'filter').map((m) => ({ soort: m.soort, naam: null }));
    const een = op[0];
    const t = global.t;
    const zin = !op.length
      ? t('basis.onderhoud.inOrde')
      : op.length === 1
        ? een.soort === 'batterij'
          ? (een.naam ? (een.pct != null ? t('thuis.onderhoud.batterijLang', { naam: een.naam, pct: een.pct }) : t('basis.onderhoud.batterijNaam', { naam: een.naam })) : t('basis.onderhoud.batterij'))
          : (een.naam ? t('basis.onderhoud.filterNaam', { naam: een.naam }) : t('basis.onderhoud.filter'))
        : t('basis.onderhoud.meer', { n: op.length });
    return `<button type="button" class="onderhoud${op.length ? ' aandacht' : ''}" data-meld-onderhoud>${meldIcoon(op.length ? een.soort : 'onderhoud')}<span><b>${esc(t('basis.onderhoud.kop'))}${op.length ? `<span class="stip" style="background: var(--zon); margin-left: 8px" aria-label="${esc(t('basis.onderhoud.aandacht'))}"></span>` : ''}</b><span>${esc(zin)}</span></span><span class="pijl" aria-hidden="true">›</span></button>`;
  }

  /** Wanneer er een melding komt, in een zin (besluit 149). */
  function drempelZin(d) {
    const b = d ? d.batterij : 10;
    const f = d ? d.filter : 10;
    const t = global.t;
    if (b == null && f == null) return t('basis.drempel.nooit');
    if (b === f) return t('basis.drempel.onder', { pct: b });
    const deel = (pct, wat) => (pct == null ? t('basis.drempel.deelNooit', { wat: t(wat) }) : t('basis.drempel.deelOnder', { wat: t(wat), pct }));
    return t('basis.drempel.apart', { batterij: deel(b, 'basis.drempel.batterij'), filter: deel(f, 'basis.drempel.filter') });
  }

  async function meldOnderhoud() {
    let huis = null;
    try {
      huis = await haal('api/huis');
    } catch {
      // Dan een lege lijst.
    }
    const balk = (pct, soort) => `<div class="meter"><i style="width: ${Math.max(2, pct)}%; background: ${bijnaOp(pct, soort, huis) ? 'var(--gloed)' : pct < 40 ? 'var(--zon)' : 'var(--mint)'}"></i></div>`;
    const regel = (naam, onder, pct, soort) => `<div class="regel"><div><b>${esc(naam)}</b><span>${esc(onder ?? '')}</span></div>${balk(pct, soort)}<span class="pct">${pct}%</span></div>`;
    // De rookmelders apart (21 oktober 2026): de batterij, de laatste test en wanneer vervangen.
    const melders = (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.soort === 'rookmelder').map((a) => ({ ...a, kamer: r.naam }))));
    const datum = (d, opties) => (d ? global.taal.datum(new Date(`${d}T12:00:00`), opties) : null);
    const t = global.t;
    const melderRegel = (m) => {
      const r = m.rookmelder ?? {};
      const onder = [m.kamer, r.getestOp ? t('basis.melder.getest', { datum: datum(r.getestOp, { day: 'numeric', month: 'long' }) }) : null, r.vervangenVoor ? t('basis.melder.vervangen', { datum: datum(r.vervangenVoor, { month: 'short', year: 'numeric' }) }) : null, r.batterijProbleem ? t('basis.melder.batterijOp') : null].filter(Boolean).join(' · ');
      return m.batterijPct != null ? regel(m.naam, onder, m.batterijPct, 'batterij') : `<div class="regel"><div><b>${esc(m.naam)}</b><span>${esc(onder)}</span></div></div>`;
    };
    const melderNamen = new Set(melders.map((m) => m.naam));
    const batt = (huis?.batterijen ?? []).filter((b) => !melderNamen.has(b.naam));
    const filters = (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.klimaat?.filter?.pct != null).map((a) => ({ naam: a.naam, kamer: r.naam, pct: a.klimaat.filter.pct }))));
    return `<div class="kop"><div><button type="button" class="terugmeld" data-meld-terug>‹ ${esc(t('nav.meldingen'))}</button><h2 class="kop-2" style="margin: 2px 0 0">${esc(t('basis.onderhoud.kop'))}</h2></div><button type="button" class="sluit" data-meld-sluit aria-label="${esc(t('algemeen.sluiten'))}">×</button></div>
      ${melders.length ? `<h3>${esc(t('basis.melder.kop'))}</h3>${melders.map(melderRegel).join('')}` : ''}
      <h3>${esc(t('basis.onderhoud.batterijen'))}</h3>
      ${batt.length ? batt.map((b) => regel(b.naam, b.kamer, b.pct, 'batterij')).join('') : `<p class="mini" style="margin: 0">${esc(t('thuis.batterijen.geen'))}</p>`}
      ${filters.length ? `<h3>${esc(t('basis.onderhoud.filters'))}</h3>${filters.map((f) => regel(f.naam, f.kamer, f.pct, 'filter')).join('')}` : ''}
      <p class="mini" style="margin: auto 0 0">${esc(drempelZin(huis?.drempels))} <a href="functies.html#meldingen">${esc(t('basis.onderhoud.wanneer'))}</a> ${esc(t('thuis.batterijen.nietBij'))}</p>`;
  }

  /*
   * Gelezen (15 oktober 2026): wat je in het blad zag, telt niet meer mee in het
   * getal bij de bel. De melding blijft staan tot hij is opgelost of weg is.
   * Onthouden in deze browser.
   */
  const GELEZEN = 'sc-meldingen-gelezen';
  const gelezen = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(GELEZEN) ?? '[]'));
    } catch {
      return new Set();
    }
  };
  function markeerGelezen() {
    try {
      localStorage.setItem(GELEZEN, JSON.stringify(meld.actief.map((m) => m.id)));
    } catch {
      // Dan telt hij de volgende keer nog mee.
    }
    meldGetal();
  }
  function meldGetal() {
    const al = gelezen();
    const n = meld.actief.filter((m) => !al.has(m.id)).length;
    $$('[data-meldaantal]').forEach((b) => {
      b.hidden = n === 0;
      b.textContent = n > 9 ? '9+' : String(n);
    });
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-label', n ? global.t('basis.meld.bel', { n }) : global.t('nav.meldingen')));
  }

  async function meldLaad() {
    try {
      meld = await haal('api/meldingen');
    } catch {
      return;
    }
    meldGetal();
    const blad = document.querySelector('[data-meldblad]');
    if (blad && !blad.hidden && meldZicht === 'lijst') blad.innerHTML = meldLijst();
    // Het display aan de wand toont een nieuwe versie ook (21 oktober 2026, niemand.js).
    dispatchEvent(new Event('sc-meldingen'));
  }
  /** De melding van een nieuwe versie die klaarstaat, of null. */
  const updateKlaar = () => meld.actief.find((m) => m.soort === 'update') ?? null;

  function meldBlad() {
    let blad = document.querySelector('[data-meldblad]');
    if (!blad) {
      document.body.insertAdjacentHTML('beforeend', `<div class="meldachter" data-meld-achter hidden></div><aside class="glas meldblad" role="dialog" aria-label="${esc(global.t('nav.meldingen'))}" data-meldblad hidden></aside>`);
      blad = document.querySelector('[data-meldblad]');
    }
    return blad;
  }
  async function meldOpen(zicht = 'lijst') {
    const blad = meldBlad();
    meldZicht = zicht;
    blad.innerHTML = zicht === 'lijst' ? meldLijst() : await meldOnderhoud();
    if (zicht === 'lijst') void onderhoudBij();

    blad.hidden = false;
    if (zicht === 'lijst') markeerGelezen();
    document.querySelector('[data-meld-achter]').hidden = false;
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    blad.querySelector('[data-meld-sluit]')?.focus();
  }
  function meldDicht() {
    $$('[data-meldblad], [data-meld-achter]').forEach((el) => (el.hidden = true));
    $$('[data-meldbel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  /** Na een update één keer: wat is er nieuw (besluit 136). De eerste keer ooit niet: dan is alles nieuw. */
  const VERSIE_GEZIEN = 'sc-versie-gezien';
/*
   * Een nieuwe versie (21 oktober 2026): wat er nieuw is, uit de releasenotes
   * van Home Assistant, en een knop Bijwerken voor de beheerder. De dienst
   * vraagt Home Assistant de add-on bij te werken; de app start daarna opnieuw,
   * en deze pagina laadt vanzelf als de nieuwe versie draait.
   */
  const UPDATE_SOORT = ['nieuw', 'beter', 'opgelost'];
  const soortNaam = (k) => global.t(`basis.versie.${k}`);
  async function bijwerkVenster() {
    let u;
    try {
      u = await haal('api/update');
    } catch {
      return;
    }
    $$('[data-nieuwpop], [data-nieuw-achter]').forEach((el) => el.remove());
    if (!u?.beschikbaar) {
      document.body.insertAdjacentHTML('beforeend', `<div class="meldachter" data-nieuw-achter></div><div class="glas nieuwpop" role="dialog" aria-modal="true" aria-labelledby="nieuwkop" data-nieuwpop><h2 class="kop-2" id="nieuwkop" style="margin: 0">${esc(global.t('basis.versie.nieuwste'))}</h2><p class="klein" style="margin: 0">${esc(global.t('basis.versie.isBij', { versie: u?.nu ?? '' }))}</p><div class="knoppen"><button type="button" class="knop knop-licht" data-nieuw-dicht>${esc(global.t('algemeen.oke'))}</button></div></div>`);
      document.querySelector('[data-nieuw-dicht]').focus();
      return;
    }
    const meer = u.notities.length > 1;
    const notities = u.notities.length
      ? u.notities.map((n) => `${meer ? `<h3 class="kop-3" style="margin: 6px 0 0">${esc(n.versie)}</h3>` : ''}${UPDATE_SOORT.filter((k) => n[k].length).map((k) => `<div class="soort ${k}"><span class="label">${esc(soortNaam(k))}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}`).join('')
      : `<p class="klein" style="margin: 0">${esc(global.t('basis.versie.inHA'))}</p>`;
    const knop = u.bezig
      ? `<button type="button" class="knop knop-licht" disabled>${esc(global.t('basis.versie.bezig'))}</button>`
      : u.magBijwerken
        ? `<button type="button" class="knop knop-licht" data-bijwerken>${esc(global.t('basis.versie.bijwerken'))}</button>`
        : '';
    document.body.insertAdjacentHTML('beforeend', `<div class="meldachter" data-nieuw-achter></div><div class="glas nieuwpop" role="dialog" aria-modal="true" aria-labelledby="nieuwkop" data-nieuwpop>
      <span class="mini">${esc(global.t('basis.versie.jeHebt', { versie: u.nu }))}</span><h2 class="kop-2" id="nieuwkop" style="margin: 2px 0 0">${esc(global.t('basis.versie.klaar', { versie: u.nieuwste }))}</h2>${notities}
      <p class="mini" data-bijwerk-zin style="margin: 0">${esc(global.t(u.bezig ? 'basis.versie.wordtBijgewerkt' : u.magBijwerken ? 'basis.versie.duurt' : 'basis.versie.beheerder'))}</p>
      <div class="knoppen"><button type="button" class="knop" data-nieuw-dicht>${esc(global.t('basis.versie.later'))}</button>${knop}</div></div>`);
    (document.querySelector('[data-bijwerken]') ?? document.querySelector('[data-nieuw-dicht]')).focus();
    if (u.bezig) void wachtOpNieuweVersie(u.nu);
  }
  async function bijwerken(knop) {
    knop.disabled = true;
    knop.textContent = global.t('basis.versie.bezig');
    const zin = document.querySelector('[data-bijwerk-zin]');
    const res = await deur('api/update', {}).catch(() => null);
    if (!res?.ok) {
      const f = res ? await res.json().catch(() => ({})) : {};
      knop.disabled = false;
      knop.textContent = global.t('basis.versie.bijwerken');
      if (zin) zin.textContent = global.t('basis.versie.mislukt', { fout: String(f.fout ?? global.t('basis.versie.geenVerbinding')).replace(/\.$/, '') });
      return;
    }
    const u = await res.json().catch(() => null);
    if (zin) zin.textContent = global.t('basis.versie.wordtBijgewerktLaadt');
    void wachtOpNieuweVersie(u?.nu ?? null);
  }
  /** Tot de nieuwe versie draait: elke vijf tellen kijken, ook als de dienst even weg is. */
  async function wachtOpNieuweVersie(was) {
    for (let i = 0; i < 180; i++) {
      await new Promise((ok) => setTimeout(ok, 5000));
      try {
        const h = await (await fetch('api/health', { cache: 'no-store' })).json();
        if (h?.versie?.nummer && h.versie.nummer !== was) {
          await houToegang();
          location.reload();
          return;
        }
      } catch {
        // De dienst start opnieuw.
      }
    }
  }

  async function watIsErNieuw(welke = null) {
    let v;
    try {
      v = await haal('api/versie');
    } catch {
      return;
    }
    let n;
    if (welke) {
      // Opnieuw geopend vanuit Meldingen.
      n = (v.nieuw ?? []).find((x) => x.versie === welke);
      if (!n) {
        location.href = 'toegang.html#versie';
        return;
      }
    } else {
      let gezien = null;
      try {
        gezien = localStorage.getItem(VERSIE_GEZIEN);
        localStorage.setItem(VERSIE_GEZIEN, v.nummer);
      } catch {
        return;
      }
      n = v.nieuw?.[0];
      if (gezien == null || gezien === v.nummer || !n || n.versie !== v.nummer) return;
    }
    const delen = UPDATE_SOORT.filter((k) => (n[k] ?? []).length).map((k) => `<div class="soort ${k}"><span class="label">${esc(soortNaam(k))}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<div class="meldachter" data-nieuw-achter></div><div class="glas nieuwpop" role="dialog" aria-modal="true" aria-labelledby="nieuwkop" data-nieuwpop>
      <span class="mini">${esc(welke ? global.taal.datum(new Date(`${n.datum}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : global.t('basis.versie.bijgewerkt'))}</span><h2 class="kop-2" id="nieuwkop" style="margin: 2px 0 0">${esc(global.t('basis.versie.watNieuw', { versie: n.versie }))}</h2>${delen}
      <div class="knoppen"><a class="knop" href="toegang.html#versie">${esc(global.t('basis.versie.alle'))}</a><button type="button" class="knop knop-licht" data-nieuw-dicht>${esc(global.t('algemeen.oke'))}</button></div></div>`);
    document.querySelector('[data-nieuw-dicht]').focus();
  }

  function meldingenStart() {
    $$('[data-meldicoon]').forEach((b) => b.insertAdjacentHTML('afterbegin', nav.svg('meldingen')));
    void meldLaad();
    setInterval(() => void meldLaad(), 2 * 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void meldLaad());
    setTimeout(() => void watIsErNieuw(), 1200);
    document.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-meldbel], [data-meld-sluit], [data-meld-achter], [data-meld-onderhoud], [data-meld-terug], [data-meld-weg], [data-meld-alles], [data-nieuw-dicht], [data-nieuw-achter], a, [data-meld-versie], [data-meld-update], [data-meld-href], [data-bijwerken]');
      if (!t || (t.matches('a') && !t.closest('[data-meldblad]'))) return;
      if (t.matches('a')) return meldDicht();
      if (t.matches('[data-nieuw-dicht], [data-nieuw-achter]')) {
        $$('[data-nieuwpop], [data-nieuw-achter]').forEach((el) => el.remove());
      } else if (t.matches('[data-meldbel]')) {
        if (document.querySelector('[data-meldblad]:not([hidden])')) meldDicht();
        else await meldOpen('lijst');
      } else if (t.matches('[data-meld-sluit], [data-meld-achter]')) meldDicht();
      else if (t.matches('[data-meld-onderhoud]')) await meldOpen('onderhoud');
      else if (t.matches('[data-meld-terug]')) await meldOpen('lijst');
      else if (t.matches('[data-meld-alles]')) {
        $$('[data-meldblad] .melding').forEach((m) => m.classList.add('gaat'));
        const res = await deur('api/meldingen', { alles: true }).catch(() => null);
        if (res?.ok) meld = await res.json();
        meldGetal();
        await meldOpen('lijst');
      } else if (t.dataset.meldWeg) {
        t.closest('.melding')?.classList.add('gaat');
        const res = await deur('api/meldingen', { verwijder: t.dataset.meldWeg }).catch(() => null);
        if (res?.ok) meld = await res.json();
        meldGetal();
        await meldOpen('lijst');
      } else if (t.matches('[data-meld-update]')) {
        meldDicht();
        await bijwerkVenster();
      } else if (t.matches('[data-bijwerken]')) {
        await bijwerken(t);
      } else if (t.dataset.meldVersie) {
        meldDicht();
        await watIsErNieuw(t.dataset.meldVersie);
      } else if (t.dataset.meldHref) {
        location.href = t.dataset.meldHref;
      }
    });
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-nieuwpop]')) $$('[data-nieuwpop], [data-nieuw-achter]').forEach((el) => el.remove());
      else meldDicht();
    });
  }

  /*
   * Een nieuwe versie op de server (besluit 133): de app op een telefoon of
   * tablet blijft vaak open staan met de pagina van toen. Is er intussen een
   * andere versie, dan laadt de pagina opnieuw: als je de app weer opent, of
   * hooguit elke tien minuten, en nooit terwijl je typt.
   */
  let draaitNu = null;
  async function versieNu() {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      const h = await r.json();
      return h?.versie?.commit && h.versie.commit !== 'onbekend' ? h.versie.commit : null;
    } catch {
      return null;
    }
  }
  async function kijkVersie() {
    const v = await versieNu();
    if (!v) return;
    if (draaitNu == null) draaitNu = v;
    else if (v !== draaitNu && !typt() && !document.querySelector('dialog[open]')) {
      await houToegang();
      location.reload();
    }
  }
  function nieuweVersie() {
    void kijkVersie();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void kijkVersie());
    setInterval(() => void kijkVersie(), 10 * 60_000);
  }

  // Op elke pagina, ook die zonder menu (inrichten, het welkom).
  volledig();

  /*
   * Een scherm zoals de wand neemt over wat er bij De wand voor hem gekozen is
   * (besluit 166): het hele scherm en luisteren naar "Hé huis", ook als dat
   * vanaf de pc of de telefoon werd gezet. Niets gekozen: zoals dit apparaat
   * het zelf heeft. Uitzetten geldt vanaf de volgende pagina.
   */
  async function schermOpties() {
    if (telStand()) return;
    let b;
    try {
      const res = await fetch('api/bewoners', { cache: 'no-store' });
      if (!res.ok) return;
      b = await res.json();
    } catch {
      return;
    }
    const o = (b?.schermen ?? []).find((s) => s.ik)?.opties;
    if (!o) return;
    if (o.volledig != null && o.volledig !== volledigGekozen()) {
      zetVolledig(o.volledig);
      if (o.volledig) volledig();
    }
    if (o.luisteren == null) return;
    try {
      if ((localStorage.getItem('sc-luisteren') === 'aan') === o.luisteren) return;
      localStorage.setItem('sc-luisteren', o.luisteren ? 'aan' : 'uit');
    } catch {
      return;
    }
    // Aan: luisteren.js erbij, die meteen begint; staat hij er al, dan zelf starten.
    if (o.luisteren) {
      if (global.luisteren) global.luisteren.start();
      else luisterStart();
    }
  }
  setTimeout(() => void schermOpties(), 1500);

  /*
   * Gewone kamerwoorden en hun lidwoord (besluit 131): "de zolder", "het
   * kantoor", en een eigen naam zoals "Beneden" zoals hij is. Dezelfde lijst als
   * `backend/src/web/kamerwoorden.ts`; een test houdt ze gelijk.
   */
  const KAMERWOORDEN = {
    zolder: 'de', vliering: 'de', woonkamer: 'de', huiskamer: 'de', woonkeuken: 'de', keuken: 'de', bijkeuken: 'de',
    eetkamer: 'de', zithoek: 'de', serre: 'de', slaapkamer: 'de', kinderkamer: 'de', logeerkamer: 'de', speelkamer: 'de',
    studeerkamer: 'de', werkkamer: 'de', hobbykamer: 'de', kamer: 'de', badkamer: 'de', wasruimte: 'de', hal: 'de',
    gang: 'de', entree: 'de', overloop: 'de', trap: 'de', berging: 'de', garage: 'de', kelder: 'de', meterkast: 'de',
    schuur: 'de', zone: 'de', tuin: 'de', achtertuin: 'de', voortuin: 'de', oprit: 'de', carport: 'de',
    kantoor: 'het', toilet: 'het', washok: 'het', portaal: 'het', atelier: 'het', tuinhuis: 'het', terras: 'het', balkon: 'het',
  };
  const EERSTE_WOORD = new RegExp(`^(${Object.keys(KAMERWOORDEN).join('|')})\\b`, 'i');
  /** "Zolder" wordt "de zolder", "Kantoor" "het kantoor", "Beneden" blijft "Beneden". */
  function metLidwoord(naam) {
    // Het lidwoord is Nederlands; in een andere taal blijft de naam zoals hij is (besluit 185).
    if (global.taal.code !== 'nl') return naam;
    const m = EERSTE_WOORD.exec(String(naam ?? '').trim());
    const lw = m ? KAMERWOORDEN[m[1].toLowerCase()] : null;
    return lw ? `${lw} ${naam.charAt(0).toLowerCase()}${naam.slice(1)}` : naam;
  }

  global.app = { huisSoort, persoonlijk, $$, metLidwoord, nl, zet, esc, bijnaOp, klokVan, wanneer, LINKS, telStand, schaal, haal, deur, tijdVanDeDag, lucht, luchtVan, klok, live, start, verwachting, gebundeld, zicht, aanbellen, offline, online, inHA, volledigGekozen, zetVolledig, naarHA, zetWeergave, weergave: () => weergaveNu, zetThema, kleurVan, tekstKleur, houToegang, updateKlaar, bijwerkVenster, bijVerandering, kanInstalleren, geinstalleerd, installeer, naarHAScherm };
})(window);
