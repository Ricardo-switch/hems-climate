/*
 * Het filmpje: hoe je huis leert (besluit 139, schets Wand-Film). Geen video om
 * te laden: je eigen huis, getekend door de app, in vier beelden van samen een
 * minuut. Met de echte cijfers van het huis en met zacht geluid, gemaakt in de
 * browser zelf. Pauzeren, het geluid uit en overslaan kan altijd. Wie minder
 * beweging wil, krijgt stilstaande beelden.
 *
 * Gebruik: film.speel({ opEinde }) na een tik (het geluid mag pas na een tik).
 */
(function (global) {
  'use strict';

  const { esc, haal, nl } = global.app;
  const SCENE_MS = 13_000;
  const GELUID = 'sc-film-geluid';

  /* ------------------------------------------------------------ het geluid */

  /*
   * Een zacht akkoord per beeld en een klokje als het beeld wisselt: sinussen
   * en een driehoek, uit de Web Audio van de browser. Niets om te downloaden.
   */
  const AKKOORD = [
    [110, 130.81, 164.81], // nacht: A klein, laag
    [130.81, 164.81, 196], // middag: C groot
    [87.31, 110, 130.81], // avond: F groot
    [98, 123.47, 146.83], // elke dag: G groot
  ];
  function geluid() {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const hoofd = ctx.createGain();
    hoofd.gain.value = 0;
    hoofd.connect(ctx.destination);
    let stemmen = [];
    let aan = true;
    const volume = () => (aan ? 0.07 : 0);
    return {
      get aan() {
        return aan;
      },
      zet(v) {
        aan = v;
        hoofd.gain.setTargetAtTime(volume(), ctx.currentTime, 0.2);
      },
      beeld(i) {
        const t = ctx.currentTime;
        hoofd.gain.setTargetAtTime(volume(), t, 0.5);
        for (const s of stemmen) {
          s.g.gain.setTargetAtTime(0, t, 0.8);
          s.o.stop(t + 4);
        }
        stemmen = AKKOORD[i].map((f, n) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = f * 2;
          o.detune.value = n * 4 - 4;
          g.gain.value = 0;
          g.gain.setTargetAtTime(0.32 / (n + 1), t + 0.1, 1.2);
          o.connect(g).connect(hoofd);
          o.start(t);
          return { o, g };
        });
        // Het klokje.
        const k = ctx.createOscillator();
        const kg = ctx.createGain();
        k.type = 'triangle';
        k.frequency.value = AKKOORD[i][2] * 8;
        kg.gain.setValueAtTime(0.0001, t);
        kg.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        k.connect(kg).connect(hoofd);
        k.start(t);
        k.stop(t + 1.8);
      },
      pauze(p) {
        if (p) void ctx.suspend();
        else void ctx.resume();
      },
      stop() {
        hoofd.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        setTimeout(() => void ctx.close(), 1200);
      },
    };
  }

  /* ------------------------------------------------------------ de beelden */

  const binnenVan = (huis) => (huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => (e.ruimtes ?? []).filter((r) => !global.huismodel.isBuiten(e, r)));
  const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');

  /** Wat het huis zelf vertelt: de echte cijfers, of null als ze er niet zijn. */
  function cijfers(d) {
    const kamers = binnenVan(d.huis);
    const apparaten = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).reduce((t, r) => t + (r.apparaten?.length ?? 0), 0);
    const zonKamer = kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.rol === 'zon')) ?? kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.kanKoelen)) ?? null;
    const warmKamer = kamers.find((r) => r.soort === 'badkamer' && klimaatIn(r).some((a) => a.klimaat?.kanVerwarmen)) ?? kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.rol === 'houdt')) ?? null;
    const winter = d.terugblik?.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
    return {
      kamers: kamers.length,
      apparaten,
      zonKamer,
      warmKamer,
      gisterenKwh: d.gisteren?.zonWh > 0 ? d.gisteren.zonWh / 1000 : null,
      besluiten: d.vandaag?.besluiten?.length ?? null,
      winter: winter ? { dagen: winter.dagen, doel: winter.doel } : null,
    };
  }
  const naamIn = (r) => (r ? global.huismodel.metLidwoord(r.naam) : null);

  function beelden(d) {
    const c = cijfers(d);
    const zomer = (() => {
      const m = new Date().getMonth() + 1;
      return m >= 4 && m <= 9;
    })();
    const zonNaam = naamIn(c.zonKamer);
    const warmNaam = naamIn(c.warmKamer);
    const hoofd = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    return [
      {
        wanneer: 'nacht',
        kop: 'Dit is je huis',
        zin: `${c.kamers} ${c.kamers === 1 ? 'kamer' : 'kamers'}, ${c.apparaten} apparaten. Smart Climate kijkt de hele dag mee.`,
      },
      {
        wanneer: 'middag',
        kop: zonNaam ? `Zon over? Dan wordt ${zonNaam} ${zomer ? 'koeler' : 'warmer'}` : 'Zon over? Dan draait het huis erop',
        zin: c.gisterenKwh != null
          ? `Gisteren leverde je dak ${nl(c.gisterenKwh)} kWh. Wat over is, gaat in je huis zitten, in plaats van later van het net.`
          : 'Op stroom van je eigen dak, in plaats van later van het net.',
      },
      {
        wanneer: 'avond',
        kop: 'Op tijd warm',
        zin: `${warmNaam ? `${hoofd(warmNaam)} is warm als je hem nodig hebt. ` : ''}${c.besluiten ? `Vandaag zei het huis al ${c.besluiten} keer waarom het iets deed.` : 'Het huis zegt bij elk besluit waarom.'}`,
      },
      {
        wanneer: 'elke dag',
        kop: 'Elke dag een beetje slimmer',
        zin: c.winter
          ? `${c.winter.dagen} van de ${c.winter.doel} winterdagen meegekeken. Daarna weet het hoe je huis warm en koel wordt, en kan het zelf regelen. Dat kies jij.`
          : 'Na 30 winterdagen weet het hoe je huis warm en koel wordt. Dan kan het zelf regelen; dat kies jij.',
        grafiek: c.winter,
      },
    ];
  }

  /** Het huis per beeld: de nacht, de middag met zon, de avond, een gewone dag. */
  function model(d, i, voortgang) {
    const c = cijfers(d);
    const etages = [];
    const buitenRuimtes = [];
    for (const e of [...(d.huis?.etages ?? [])].reverse()) {
      const kamers = [];
      for (const r of e.ruimtes ?? []) {
        if (global.huismodel.isBuiten(e, r)) {
          buitenRuimtes.push(r);
          continue;
        }
        const k = global.huismodel.kamerModel(r, null);
        k.temp = null;
        k.stand = null;
        for (const a of k.apparaten) if ('aan' in a) a.aan = false;
        if (i === 1 && c.zonKamer?.id === r.id) {
          k.stand = new Date().getMonth() + 1 >= 4 && new Date().getMonth() + 1 <= 9 ? 'koelt' : 'warmt';
          for (const a of k.apparaten) if (a.soort === 'airco') Object.assign(a, { aan: true, stand: k.stand });
        }
        if (i === 2) {
          for (const a of k.apparaten) if (a.soort === 'lamp') a.aan = true;
          if (c.warmKamer?.id === r.id) {
            k.stand = 'warmt';
            for (const a of k.apparaten) if (a.soort === 'radiator' || a.soort === 'vloer') a.aan = true;
          }
        }
        if (i === 3 && r.zoneId) k.stand = 'goed';
        kamers.push(k);
      }
      if (kamers.length) etages.push({ naam: e.naam, id: e.id, kamers });
    }
    const top = etages[etages.length - 1];
    if (top && (d.huis?.dakEtage !== undefined ? top.id === d.huis.dakEtage : etages.length >= 3)) top.dak = true;
    const piekW = (d.zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
    const panelen = piekW > 0 ? Math.max(1, Math.round(piekW / 400)) : 0;
    const { oprit, tuin, terras, balkon, voortuin } = global.huismodel.buiten(buitenRuimtes);
    const tijd = ['nacht', 'dag', 'avond', 'dag'][i];
    const zon = i === 1
      ? { stand: 0.3 + 0.35 * voortgang, hoogte: 0.85, aandeel: 0.85, panelen }
      : i === 3
        ? { stand: 0.5, hoogte: 0.7, aandeel: 0.5, panelen }
        : { aandeel: 0, panelen };
    const stromen = i === 1 && c.zonKamer ? [{ van: 'zon', naar: `kamer:${c.zonKamer.naam}`, sterkte: 0.8 }] : [];
    const labels = i === 1 && c.gisterenKwh != null ? [{ bij: 'panelen', titel: `${nl(c.gisterenKwh)} kWh`, groot: true, toon: 'zon', regels: ['gisteren van je dak'], dx: 64, dy: -70 }] : [];
    return {
      beschrijving: 'Je huis in het filmpje.',
      tijd,
      wolken: i === 3 ? 0.3 : 0.1,
      zon,
      etages,
      buitenunit: binnenVan(d.huis).flatMap(klimaatIn).some((a) => a.klimaat?.kanKoelen) ? { aan: i === 1 } : null,
      net: true,
      oprit,
      tuin,
      terras,
      balkon,
      voortuin,
      stromen,
      labels,
    };
  }

  /* ------------------------------------------------------------ afspelen */

  const STIJL = `
    .film { position: fixed; inset: 0; z-index: 90; display: grid; grid-template-rows: minmax(0, 1fr) auto; background: radial-gradient(120% 90% at 30% 20%, #1b2a4a 0%, #0b1424 60%, #070d18 100%); color: var(--tekst); }
    .film.avond { background: radial-gradient(120% 90% at 70% 90%, #4a2a3a 0%, #1a1d3a 50%, #0b1424 100%); }
    .film.nacht { background: radial-gradient(120% 90% at 50% 10%, #101a33 0%, #070d18 70%); }
    .film-beeld { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 34%); align-items: end; gap: 24px; padding: 24px 36px 12px; min-height: 0; }
    .film-huis { align-self: stretch; width: 100%; min-height: 0; display: grid; place-items: center; transition: opacity 0.6s; }
    .film-huis .sc-huis { width: 100%; height: 100%; max-height: 100%; }
    .film-huis.weg { opacity: 0; }
    .film-tekst { padding-bottom: 28px; transition: opacity 0.6s, transform 0.6s; }
    .film-tekst.weg { opacity: 0; transform: translateY(8px); }
    .film-tekst .wanneer { font-size: 14px; font-weight: 600; color: var(--gedempt); }
    .film-tekst h2 { margin: 6px 0 10px; font-family: var(--kop); font-size: clamp(28px, 3.4vw, 46px); line-height: 1.05; }
    .film-tekst p { margin: 0; font-size: clamp(15px, 1.35vw, 19px); line-height: 1.5; color: var(--zacht); max-width: 40ch; }
    .film-grafiek { position: absolute; right: 36px; top: 28px; width: min(420px, 38vw); padding: 16px 18px; border-radius: 20px; background: rgba(12, 20, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); }
    .film-grafiek b { font-size: 15px; }
    .film-grafiek svg { display: block; width: 100%; height: auto; margin-top: 6px; }
    .film-balk { display: flex; align-items: center; gap: 14px; padding: 14px 36px 22px; }
    .film-balk button { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.08); color: var(--tekst); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-grid; place-items: center; }
    .film-balk button:focus-visible { outline: 2px solid var(--tekst); outline-offset: 2px; }
    .film-voortgang { flex: 1; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
    .film-voortgang i { display: block; height: 100%; width: 0; background: var(--tekst); border-radius: 3px; }
    html.tel-stand .film-beeld { grid-template-columns: 1fr; padding: 16px 18px 0; align-content: center; }
    html.tel-stand .film-grafiek { position: static; width: auto; }
    html.tel-stand .film-balk { padding: 12px 18px 22px; }
  `;

  async function laad() {
    const namen = ['huis', 'zon', 'gisteren', 'vandaag', 'terugblik'];
    const uit = await Promise.allSettled(['api/huis', 'api/zon', 'api/vandaag?dag=gisteren', 'api/vandaag', 'api/divergence'].map((p) => haal(p)));
    const d = {};
    uit.forEach((r, i) => (d[namen[i]] = r.status === 'fulfilled' ? r.value : null));
    return d;
  }

  function grafiekSvg(w) {
    const pct = w ? Math.max(0.04, Math.min(1, w.dagen / w.doel)) : 0;
    const x = 20 + 300 * pct;
    return `<svg viewBox="0 0 340 110" aria-hidden="true">
      <path d="M20 95 C 90 80, 150 60, 320 52" fill="none" stroke="#7F8E9C" stroke-width="2" stroke-dasharray="4 5"/>
      <path d="M20 95 C 70 70, 140 40, 320 30" fill="none" stroke="#6EE7B7" stroke-width="2.6"/>
      <text x="22" y="20" font-family="Figtree" font-size="12" fill="#7F8E9C">dag 1: een gok</text>
      <text x="318" y="20" text-anchor="end" font-family="Figtree" font-size="12" fill="#6EE7B7">dag 30: weet het</text>
      ${w ? `<line x1="${x}" y1="28" x2="${x}" y2="104" stroke="#EEF3F7" stroke-opacity="0.6"/><text x="${Math.min(300, x + 6)}" y="104" font-family="Figtree" font-size="12" fill="#EEF3F7">nu</text>` : ''}
    </svg>`;
  }

  async function speel({ opEinde } = {}) {
    if (!document.getElementById('film-stijl')) {
      const s = document.createElement('style');
      s.id = 'film-stijl';
      s.textContent = STIJL;
      document.head.append(s);
    }
    let geluidAan = true;
    try {
      geluidAan = localStorage.getItem(GELUID) !== 'uit';
    } catch {
      // Dan aan.
    }
    const klank = (() => {
      try {
        return geluid();
      } catch {
        return null;
      }
    })();
    klank?.zet(geluidAan);
    const stil = global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const el = document.createElement('div');
    el.className = 'film nacht';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Hoe je huis leert, een filmpje van een minuut');
    el.innerHTML = `<div class="film-beeld"><div class="film-huis" data-film-huis></div><div class="film-tekst" aria-live="polite" data-film-tekst></div><div class="film-grafiek" data-film-grafiek hidden></div></div>
      <div class="film-balk"><button type="button" data-film-pauze aria-label="Pauzeren">❚❚</button><div class="film-voortgang" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100"><i data-film-balk></i></div><button type="button" data-film-geluid aria-pressed="${geluidAan}">${geluidAan ? 'Geluid aan' : 'Geluid uit'}</button><button type="button" data-film-klaar>Overslaan</button></div>`;
    document.body.append(el);
    el.querySelector('[data-film-klaar]').focus();

    const d = await laad();
    const lijst = beelden(d);
    const totaal = SCENE_MS * lijst.length;
    let t = 0;
    let gepauzeerd = false;
    let laatste = performance.now();
    let beeldNu = -1;
    let gestopt = false;
    let tekenTik = 0;

    const huisEl = el.querySelector('[data-film-huis]');
    const tekstEl = el.querySelector('[data-film-tekst]');
    const grafiekEl = el.querySelector('[data-film-grafiek]');
    const maat = () => (document.documentElement.classList.contains('tel-stand') ? { breedte: Math.min(innerWidth - 20, 420), hoogte: Math.round(innerHeight * 0.42) } : { breedte: Math.round(innerWidth * 0.58), hoogte: Math.round(innerHeight * 0.74) });
    const tekenHuis = (i, v) => global.huis.teken(huisEl, model(d, i, v), { ...maat(), marge: 0.04, zoom: 1 });

    function naarBeeld(i) {
      beeldNu = i;
      const b = lijst[i];
      el.className = `film ${b.wanneer === 'nacht' ? 'nacht' : b.wanneer === 'avond' ? 'avond' : ''}`;
      tekstEl.classList.add('weg');
      huisEl.classList.add('weg');
      setTimeout(() => {
        tekenHuis(i, 0);
        tekstEl.innerHTML = `<span class="wanneer">0:${String(Math.round((i * SCENE_MS) / 1000)).padStart(2, '0')} · ${esc(b.wanneer)}</span><h2>${esc(b.kop)}</h2><p>${esc(b.zin)}</p>`;
        grafiekEl.hidden = !('grafiek' in b);
        if ('grafiek' in b) grafiekEl.innerHTML = `<b>Hoe snel je huis warm en koel wordt</b>${grafiekSvg(b.grafiek)}`;
        tekstEl.classList.remove('weg');
        huisEl.classList.remove('weg');
      }, stil ? 0 : 450);
      klank?.beeld(i);
    }

    function stop() {
      if (gestopt) return;
      gestopt = true;
      klank?.stop();
      el.remove();
      removeEventListener('keydown', toets);
      opEinde?.();
    }

    function tik(nu) {
      if (gestopt) return;
      if (!gepauzeerd) t += nu - laatste;
      laatste = nu;
      if (t >= totaal) return stop();
      const i = Math.floor(t / SCENE_MS);
      if (i !== beeldNu) naarBeeld(i);
      // De zon schuift over de middag; twee keer per seconde is genoeg.
      if (!stil && i === 1 && nu - tekenTik > 500 && !gepauzeerd) {
        tekenTik = nu;
        tekenHuis(1, (t % SCENE_MS) / SCENE_MS);
      }
      const pct = (t / totaal) * 100;
      el.querySelector('[data-film-balk]').style.width = `${pct.toFixed(1)}%`;
      el.querySelector('.film-voortgang').setAttribute('aria-valuenow', String(Math.round(pct)));
      requestAnimationFrame(tik);
    }

    function pauze(p) {
      gepauzeerd = p;
      klank?.pauze(p);
      const k = el.querySelector('[data-film-pauze]');
      k.textContent = p ? '▶' : '❚❚';
      k.setAttribute('aria-label', p ? 'Verder afspelen' : 'Pauzeren');
    }
    function toets(e) {
      if (e.key === 'Escape') stop();
      else if (e.key === ' ' && !e.target.closest?.('button')) {
        e.preventDefault();
        pauze(!gepauzeerd);
      }
    }
    addEventListener('keydown', toets);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-film-klaar')) stop();
      else if (b.hasAttribute('data-film-pauze')) pauze(!gepauzeerd);
      else if (b.hasAttribute('data-film-geluid')) {
        geluidAan = !geluidAan;
        klank?.zet(geluidAan);
        b.textContent = geluidAan ? 'Geluid aan' : 'Geluid uit';
        b.setAttribute('aria-pressed', String(geluidAan));
        try {
          localStorage.setItem(GELUID, geluidAan ? 'aan' : 'uit');
        } catch {
          // Dan alleen nu.
        }
      }
    });
    laatste = performance.now();
    requestAnimationFrame(tik);
    return { stop, pauze, naar: (i) => (t = i * SCENE_MS) };
  }

  global.film = { speel, beelden, cijfers };
})(window);
