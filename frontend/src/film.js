/*
 * De film (besluit 144, schets Wand-Film-Trailer): wat je huis kan, in twintig
 * tellen. Zeven beelden van drie tellen op een beat van 120 per minuut; elk
 * beeld één ding dat de app echt doet, met een groot getal uit je eigen huis,
 * een korte zin, en het huis dat meebeweegt. Geen video om te laden: de app
 * tekent het, en de beat komt uit de browser zelf. Pauzeren, het geluid uit
 * en overslaan kan altijd. Wie minder beweging wil, krijgt rustige beelden.
 *
 * Gebruik: film.speel({ opEinde }) na een tik (het geluid mag pas na een tik).
 */
(function (global) {
  'use strict';

  const { esc, haal, nl } = global.app;
  /** Zes tellen van een halve seconde: 120 per minuut. */
  const TEL_MS = 500;
  const SCENE_MS = 6 * TEL_MS;
  const GELUID = 'sc-film-geluid';

  /* ------------------------------------------------------------ de beat */

  /*
   * Een korte beat uit de Web Audio van de browser: een bas op elke tel, een
   * tikje ertussen, een grondtoon per beeld en een akkoord als het beeld
   * wisselt. Niets om te downloaden, en niets gaat het huis uit.
   */
  const GRONDTOON = [55, 65.41, 73.42, 61.74, 55, 82.41, 65.41];
  function geluid() {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const hoofd = ctx.createGain();
    hoofd.gain.value = 0;
    hoofd.connect(ctx.destination);
    let aan = true;
    const volume = () => (aan ? 0.16 : 0);
    // Ruis voor het tikje, één keer gemaakt.
    const ruis = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const kanaal = ruis.getChannelData(0);
    for (let i = 0; i < kanaal.length; i++) kanaal[i] = (Math.random() * 2 - 1) * (1 - i / kanaal.length);
    function bas(t) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(hoofd);
      o.start(t);
      o.stop(t + 0.25);
    }
    function tikje(t) {
      const b = ctx.createBufferSource();
      b.buffer = ruis;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      b.connect(f).connect(g).connect(hoofd);
      b.start(t);
    }
    function toon(t, f, duur, sterk, type = 'sawtooth') {
      const o = ctx.createOscillator();
      const flt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(1800, t);
      flt.frequency.exponentialRampToValueAtTime(300, t + duur);
      g.gain.setValueAtTime(sterk, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duur);
      o.connect(flt).connect(g).connect(hoofd);
      o.start(t);
      o.stop(t + duur + 0.05);
    }
    return {
      get aan() {
        return aan;
      },
      zet(v) {
        aan = v;
        hoofd.gain.setTargetAtTime(volume(), ctx.currentTime, 0.1);
      },
      /** Zes tellen voor beeld i, vanaf nu. */
      beeld(i) {
        const t0 = ctx.currentTime + 0.02;
        hoofd.gain.setTargetAtTime(volume(), t0, 0.05);
        const f = GRONDTOON[i % GRONDTOON.length];
        // Het akkoord bij de wissel: grondtoon, terts en kwint, kort.
        for (const m of [1, 1.26, 1.5]) toon(t0, f * 4 * m, 0.45, 0.07);
        for (let n = 0; n < 6; n++) {
          const t = t0 + (n * TEL_MS) / 1000;
          bas(t);
          tikje(t + TEL_MS / 2000);
          if (n % 2 === 0) toon(t, f, 0.4, 0.18, 'triangle');
        }
      },
      pauze(p) {
        if (p) void ctx.suspend();
        else void ctx.resume();
      },
      stop() {
        hoofd.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        setTimeout(() => void ctx.close(), 600);
      },
    };
  }

  /* ------------------------------------------------------------ de beelden */

  const binnenVan = (huis) => (huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => (e.ruimtes ?? []).filter((r) => !global.huismodel.isBuiten(e, r)));
  const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
  const naamIn = (r) => (r ? global.huismodel.metLidwoord(r.naam) : null);
  const hoofd = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** Wat het huis zelf vertelt: de echte cijfers, of null als ze er niet zijn. */
  function cijfers(d) {
    const kamers = binnenVan(d.huis);
    const apparaten = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).reduce((t, r) => t + (r.apparaten?.length ?? 0), 0);
    const zonKamer = kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.rol === 'zon')) ?? kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.kanKoelen)) ?? null;
    const warmKamer = kamers.find((r) => r.soort === 'badkamer' && r.temperatuurC != null) ?? kamers.find((r) => r.zoneId && r.temperatuurC != null) ?? null;
    const piek = (r) => Math.max(0, ...(r?.kwartieren ?? []).map((q) => q.zonW ?? 0)) / 1000;
    return {
      kamers: kamers.length,
      apparaten,
      zonKamer,
      warmKamer,
      gisterenKwh: d.gisteren?.zonWh > 0 ? d.gisteren.zonWh / 1000 : null,
      piekKw: piek(d.vandaag) > 0.05 ? piek(d.vandaag) : piek(d.gisteren) > 0.05 ? piek(d.gisteren) : null,
      morgenKwh: d.weer?.dagen?.[0]?.verwachtKwh ?? null,
      eigenPct: d.opbrengst?.stroom?.eigenZonPct ?? null,
    };
  }

  /**
   * Zeven beelden. Een beeld zonder zijn cijfer valt weg; zo staat er nooit
   * een getal dat niet uit het huis komt.
   */
  function beelden(d) {
    const c = cijfers(d);
    const zomer = (() => {
      const m = new Date().getMonth() + 1;
      return m >= 4 && m <= 9;
    })();
    const zonNaam = naamIn(c.zonKamer);
    const warmNaam = naamIn(c.warmKamer);
    const lijst = [
      c.gisterenKwh != null && { tijd: 'nacht', titel: 'Gisteren, van je dak', groot: `${nl(c.gisterenKwh)} kWh`, kleur: 'var(--zon)', kop: 'Zoveel zon gaf je dak gisteren.', klein: 'Smart Climate ziet wat je huis doet, elke minuut.', zoom: 0.92 },
      { tijd: 'ochtend', titel: 'Je hele huis', groot: String(c.kamers), kleur: 'var(--tekst)', kop: `${c.kamers === 1 ? 'kamer' : 'kamers'}, ${c.apparaten} apparaten. Eén huis.`, klein: 'Gevonden in Home Assistant. Jij kijkt of het klopt.', temp: true, zoom: 1 },
      c.piekKw != null && { tijd: 'dag', titel: 'Je dak op zijn best', groot: `${nl(c.piekKw)} kW`, kleur: 'var(--zon)', kop: zonNaam ? `Met wat over is, ${zomer ? 'koelt' : 'warmt'} ${zonNaam} ${zomer ? 'af' : 'op'}.` : 'Met wat over is, draaien je apparaten.', klein: 'Op stroom van je eigen dak, niet van het net.', zonKamer: true, zoom: 1.08 },
      c.morgenKwh != null && { tijd: 'avond', titel: 'Kijkt vooruit', groot: `${nl(c.morgenKwh)} kWh`, kleur: 'var(--violet)', kop: 'zon verwacht voor morgen. Het huis weet het al.', klein: 'Uit het weer en wat je panelen leerden.', zoom: 1 },
      c.warmKamer && { tijd: 'ochtend', titel: 'Elke kamer in beeld', groot: `${nl(c.warmKamer.temperatuurC)}°`, kleur: 'var(--gloed)', kop: `in ${warmNaam}, nu.`, klein: 'Het huis weet hoe warm elke kamer is, en zegt bij elk besluit waarom.', warmKamer: true, zoom: 1.1 },
      { tijd: 'dag', titel: 'Vraag het je huis', groot: '“Waarom?”', kleur: 'var(--ijs)', kop: 'Het huis antwoordt, hardop.', klein: 'Lokaal, met je eigen gegevens. Niets gaat het huis uit.', zoom: 0.95 },
      c.eigenPct != null
        ? { tijd: 'dag', titel: 'Klaar', groot: `${c.eigenPct}%`, kleur: 'var(--mint)', kop: 'van je stroom kwam deze maand van je eigen dak.', klein: 'Smart Climate. Tik om te beginnen.', eind: true, zoom: 1 }
        : { tijd: 'dag', titel: 'Klaar', groot: 'Klaar', kleur: 'var(--mint)', kop: 'Je huis staat erin.', klein: 'Smart Climate. Tik om te beginnen.', eind: true, zoom: 1 },
    ];
    return lijst.filter(Boolean);
  }

  /** Het huis bij een beeld, uit dezelfde opbouw als Thuis (huismodel.tekening). */
  function model(d, b) {
    const c = cijfers(d);
    const stand = new Date().getMonth() + 1 >= 4 && new Date().getMonth() + 1 <= 9 ? 'koelt' : 'warmt';
    const t = global.huismodel.tekening(d.huis, {
      zon: d.zon,
      kamer: (r) => {
        const k = global.huismodel.kamerModel(r, null);
        if (!b.temp) k.temp = null;
        k.stand = null;
        k.zin = null;
        for (const a of k.apparaten) if ('aan' in a) a.aan = b.tijd === 'avond' && a.soort === 'lamp';
        if (b.zonKamer && c.zonKamer?.id === r.id) {
          k.stand = stand;
          for (const a of k.apparaten) if (a.soort === 'airco') Object.assign(a, { aan: true, stand });
        }
        if (b.warmKamer && c.warmKamer?.id === r.id) k.temp = `${nl(r.temperatuurC)}°`;
        if (b.eind && (r.zoneId || r.meedoenMet)) k.stand = 'goed';
        return k;
      },
    });
    const zon = b.tijd === 'dag' ? { stand: 0.55, hoogte: 0.9, aandeel: b.zonKamer ? 0.9 : 0.6, panelen: t.panelen } : b.tijd === 'ochtend' ? { stand: 0.15, hoogte: 0.25, aandeel: 0.2, panelen: t.panelen } : { aandeel: 0, panelen: t.panelen };
    return {
      beschrijving: `Je huis in de film: ${b.titel}.`,
      tijd: b.tijd,
      wolken: 0.1,
      zon,
      etages: t.etages,
      voordeur: t.voordeur,
      buitenunit: t.buitenunit ? { ...t.buitenunit, aan: !!b.zonKamer } : null,
      net: true,
      oprit: t.oprit,
      tuin: t.tuin,
      terras: t.terras,
      balkon: t.balkon,
      voortuin: t.voortuin,
      stromen: b.zonKamer && c.zonKamer ? [{ van: 'zon', naar: `kamer:${c.zonKamer.naam}`, sterkte: 0.85 }] : b.eind ? [{ van: 'zon', naar: 'huis', sterkte: 0.6 }] : [],
      labels: [],
    };
  }

  /* ------------------------------------------------------------ afspelen */

  const STIJL = `
    .film { position: fixed; inset: 0; z-index: 90; display: grid; grid-template-rows: minmax(0, 1fr) auto; color: var(--tekst); background: radial-gradient(120% 90% at 30% 20%, #1b2a4a 0%, #0b1424 60%, #070d18 100%); transition: background 0.6s; }
    .film.nacht { background: radial-gradient(120% 90% at 50% 10%, #101a33 0%, #070d18 70%); }
    .film.avond { background: radial-gradient(120% 90% at 70% 90%, #4a2a3a 0%, #1a1d3a 50%, #0b1424 100%); }
    .film.ochtend { background: radial-gradient(120% 90% at 20% 90%, #4a3a3a 0%, #1d2440 55%, #0b1424 100%); }
    .film-beeld { position: relative; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: 24px; padding: 24px 40px 8px; min-height: 0; overflow: hidden; }
    .film-woord { min-width: 0; }
    .film-woord .titel { font-size: 15px; font-weight: 700; color: var(--gedempt); }
    .film-woord .groot { font-family: var(--kop); font-weight: 800; font-size: clamp(64px, 9vw, 128px); line-height: 0.92; letter-spacing: -0.04em; margin-top: 6px; }
    .film-woord h2 { margin: 14px 0 0; font-family: var(--kop); font-weight: 600; font-size: clamp(24px, 2.6vw, 36px); line-height: 1.15; max-width: 22ch; }
    .film-woord p { margin: 10px 0 0; font-size: clamp(15px, 1.3vw, 18px); color: var(--zacht); max-width: 40ch; }
    .film-woord .in { animation: film-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-woord .in2 { animation: film-in 0.5s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-woord .in3 { animation: film-in 0.5s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    @keyframes film-in { from { opacity: 0; transform: translateY(16px) scale(0.98); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
    .film-huis { align-self: stretch; min-height: 0; display: grid; place-items: center; transition: transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1); }
    .film-huis .sc-huis { width: 100%; height: 100%; }
    .film-flits { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
    .film-flits.aan { animation: film-flits 0.35s ease-out; }
    @keyframes film-flits { from { opacity: 0.18; } to { opacity: 0; } }
    .film-balk { display: flex; align-items: center; gap: 12px; padding: 12px 40px 22px; }
    .film-balk button { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.08); color: var(--tekst); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-grid; place-items: center; }
    .film-balk button:focus-visible { outline: 2px solid var(--tekst); outline-offset: 2px; }
    .film-tellen { flex: 1; display: flex; gap: 6px; }
    .film-tellen i { flex: 1; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
    .film-tellen i b { display: block; height: 100%; width: 0; background: var(--tekst); }
    html.tel-stand .film-beeld { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); padding: 24px 20px 0; align-content: start; }
    html.tel-stand .film-balk { padding: 12px 20px 22px; }
    @media (prefers-reduced-motion: reduce) { .film-woord .in, .film-woord .in2, .film-woord .in3, .film-flits.aan { animation: none; } .film-huis { transition: none; } }
  `;

  async function laad() {
    const namen = ['huis', 'zon', 'gisteren', 'vandaag', 'weer', 'opbrengst'];
    const uit = await Promise.allSettled(['api/huis', 'api/zon', 'api/vandaag?dag=gisteren', 'api/vandaag', 'api/weer', 'api/opbrengst?soort=maand'].map((p) => haal(p)));
    const d = {};
    uit.forEach((r, i) => (d[namen[i]] = r.status === 'fulfilled' ? r.value : null));
    return d;
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
    el.setAttribute('aria-label', 'Wat je huis kan, een film van twintig seconden');
    el.innerHTML = `<div class="film-beeld"><div class="film-woord" aria-live="polite" data-film-tekst></div><div class="film-huis" data-film-huis></div><div class="film-flits" data-film-flits></div></div>
      <div class="film-balk"><button type="button" data-film-pauze aria-label="Pauzeren">❚❚</button><div class="film-tellen" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100" data-film-tellen></div><button type="button" data-film-geluid aria-pressed="${geluidAan}">${geluidAan ? 'Geluid aan' : 'Geluid uit'}</button><button type="button" data-film-klaar>Overslaan</button></div>`;
    document.body.append(el);
    el.querySelector('[data-film-klaar]').focus();

    const d = await laad();
    const lijst = beelden(d);
    const totaal = SCENE_MS * lijst.length;
    el.querySelector('[data-film-tellen]').innerHTML = lijst.map(() => '<i><b></b></i>').join('');
    let t = 0;
    let gepauzeerd = false;
    let laatste = performance.now();
    let beeldNu = -1;
    let gestopt = false;

    const huisEl = el.querySelector('[data-film-huis]');
    const tekstEl = el.querySelector('[data-film-tekst]');
    const flits = el.querySelector('[data-film-flits]');
    const maat = () => (document.documentElement.classList.contains('tel-stand') ? { breedte: Math.min(innerWidth - 20, 420), hoogte: Math.round(innerHeight * 0.42) } : { breedte: Math.round(innerWidth * 0.55), hoogte: Math.round(innerHeight * 0.78) });

    function naarBeeld(i) {
      beeldNu = i;
      const b = lijst[i];
      el.className = `film ${b.tijd}`;
      global.huis.teken(huisEl, model(d, b), { ...maat(), marge: 0.04 });
      huisEl.style.transform = stil ? '' : `scale(${b.zoom ?? 1})`;
      tekstEl.innerHTML = `<div class="titel in">${esc(b.titel)}</div><div class="groot in" style="color: ${b.kleur}">${esc(b.groot)}</div><h2 class="in2">${esc(b.kop)}</h2><p class="in3">${esc(b.klein)}</p>`;
      if (!stil) {
        flits.classList.remove('aan');
        void flits.offsetWidth;
        flits.classList.add('aan');
      }
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
      el.querySelectorAll('[data-film-tellen] b').forEach((x, k) => (x.style.width = `${k < i ? 100 : k > i ? 0 : ((t % SCENE_MS) / SCENE_MS) * 100}%`));
      el.querySelector('[data-film-tellen]').setAttribute('aria-valuenow', String(Math.round((t / totaal) * 100)));
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
    return { stop, pauze, naar: (i) => (t = i * SCENE_MS), aantal: lijst.length };
  }

  global.film = { speel, beelden, cijfers };
})(window);
