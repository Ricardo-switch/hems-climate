/*
 * Praten met je stem (besluit 150, schetsen Wand-Luisteren en Assistent-Tel-Microfoon).
 *
 * De microfoon neemt op in 16 kHz, mono, en stuurt het geluid over een websocket naar de
 * dienst (`/api/luister`); de dienst geeft het door aan Home Assistant, dat het wekwoord
 * hoort (openWakeWord) en uitschrijft (Whisper), en verder niets doet. Wat je zei gaat
 * daarna dezelfde weg als een getypte zin (`api/vraag`, besluit 148). Je stem gaat niet
 * naar buiten en wordt niet bewaard.
 *
 * Twee manieren:
 * - De wand luistert altijd naar het wekwoord, als dat op dit scherm aan staat (Functies ›
 *   Praten met je huis, bewaard in deze browser). Hoort hij "Hé huis", dan schuift er een
 *   laag over de pagina: een zacht tikje, het huis luistert, schrijft mee, doet het en
 *   zegt het. Daarna luistert het nog vijf seconden zonder wekwoord, en sluit de laag acht
 *   seconden nadat het huis klaar is met praten. "Niet begrepen" zegt het één keer per
 *   gesprek; hoort het daarna weer alleen ruis, dan stopt het stil (besluit 166).
 * - De telefoon luistert nooit vanzelf: de Assistent heeft een microfoonknop
 *   (`luisteren.eenmaal`).
 *
 * De microfoon kan alleen over https; zonder https zegt `luisteren.kan()` nee.
 */
(function (global) {
  'use strict';
  if (global.luisteren) return;
  // De teksten staan in kit/teksten.*.js (besluit 185). Het wekwoord blijft "Hé huis".
  const tk = (k, p) => global.taal.t(k, p);

  const HIER = 'sc-luisteren';
  const DOORPRATEN_MS = 5000;
  const SLUITEN_MS = 8000;

  const aanHier = () => {
    try {
      return localStorage.getItem(HIER) === 'aan';
    } catch {
      return false;
    }
  };
  const zetHier = (aan) => {
    try {
      localStorage.setItem(HIER, aan ? 'aan' : 'uit');
    } catch {
      // Dan alleen voor nu.
    }
  };
  /** Of de microfoon hier kan: alleen over https, en als de browser hem heeft. */
  const kan = () => !!(global.isSecureContext && navigator.mediaDevices?.getUserMedia);

  /* -------------------------------------------------------------- de microfoon */

  let mic = null;

  /** Van wat de browser opneemt naar 16 kHz, 16 bit: Home Assistant wil niets anders. */
  function naarPcm(f, sr) {
    const stap = sr / 16000;
    const n = Math.floor(f.length / stap);
    const uit = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const x = f[Math.floor(i * stap)];
      uit[i] = Math.max(-1, Math.min(1, x)) * 0x7fff;
    }
    return uit;
  }

  /** Eén opname voor de hele pagina; wie luistert, krijgt de stukjes. */
  async function microfoon() {
    if (mic) return mic;
    const stroom = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = global.AudioContext || global.webkitAudioContext;
    let ctx;
    try {
      ctx = new Ctx({ sampleRate: 16000 });
    } catch {
      ctx = new Ctx();
    }
    const bron = ctx.createMediaStreamSource(stroom);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const m = { ctx, stroom, naar: new Set(), niveau: 0 };
    proc.onaudioprocess = (e) => {
      const f = e.inputBuffer.getChannelData(0);
      let som = 0;
      for (let i = 0; i < f.length; i++) som += f[i] * f[i];
      m.niveau = Math.min(1, Math.sqrt(som / f.length) * 6);
      if (!m.naar.size) return;
      const pcm = naarPcm(f, ctx.sampleRate);
      for (const fn of m.naar) fn(pcm.buffer);
    };
    bron.connect(proc);
    // Zonder uitgang loopt hij niet; er komt geen geluid uit, de uitgang blijft stil.
    proc.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    mic = m;
    return m;
  }

  /** Of de opname echt loopt; zonder tik weigert een browser soms. */
  const loopt = () => mic?.ctx.state === 'running';

  /** Eén ronde via de dienst: 'wekwoord' of 'spraak'. */
  function ronde(start, op) {
    // Naast deze pagina, net als `api/…` elders: in Home Assistant staat de app onder
    // /api/hassio_ingress/…, en /api/luister ging naar Home Assistant zelf, dat hem meteen sloot.
    const adres = new URL(`api/luister?start=${start}`, location.href);
    adres.protocol = adres.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(adres);
    ws.binaryType = 'arraybuffer';
    let dicht = false;
    const stuur = (buf) => ws.readyState === 1 && ws.send(buf);
    ws.onopen = () => {
      microfoon().then(
        (m) => m.naar.add(stuur),
        () => {
          op({ soort: 'fout', reden: tk('assistent.geenMicrofoon') });
          ws.close();
        },
      );
    };
    ws.onmessage = (e) => {
      try {
        op(JSON.parse(e.data));
      } catch {
        // Geen bericht van ons.
      }
    };
    ws.onclose = () => {
      mic?.naar.delete(stuur);
      if (!dicht) {
        dicht = true;
        op({ soort: 'dicht' });
      }
    };
    return { klaar: () => ws.readyState === 1 && ws.send('klaar'), stop: () => ws.close() };
  }

  /** Een zacht tikje: het huis luistert. */
  function tikje() {
    try {
      const ctx = mic?.ctx ?? new (global.AudioContext || global.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.18);
    } catch {
      // Geen geluid, dan alleen beeld.
    }
  }

  /* ------------------------------------------------------ de vraag en het antwoord */

  let scherm = null;

  /** Wat je zei, als vraag aan het huis; een opdracht gaat meteen naar zijn deur (besluit 148). */
  async function vraag(tekst) {
    const q = new URLSearchParams({ v: 'vrij', tekst, taal: global.taal.code, ...(scherm && Date.now() - scherm.sinds < 60_000 ? { scherm: scherm.id } : {}) });
    const res = await fetch(`api/vraag?${q}`);
    const body = await res.json().catch(() => ({}));
    const uit = { antwoord: res.ok ? body.antwoord : body.fout ?? body.wachten ?? tk('assistent.geenAntwoord'), gesproken: res.ok ? body.gesproken ?? null : null, onbekend: res.ok && body.vraag === 'onbekend', klaar: res.ok && body.vraag === 'klaar', ruis: res.ok && body.vraag === 'ruis', voorbeelden: body.voorbeelden ?? [], gedaan: [] };
    if (res.ok && body.opdracht) {
      const r = await fetch(body.opdracht.pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.opdracht.body) }).catch(() => null);
      if (!r?.ok) {
        const f = r ? await r.json().catch(() => ({})) : {};
        uit.antwoord = tk('basis.versie.mislukt', { fout: String(f.fout ?? f.wachten ?? tk('assistent.haGeenAntwoord')).replace(/\.$/, '') });
      } else {
        uit.gedaan = body.gedaan ?? [];
        scherm = body.beweegt ? { ...body.beweegt, sinds: Date.now() } : body.opdracht.body?.actie === 'stop' ? null : scherm;
      }
    }
    return uit;
  }

  let stemNaam;
  /** Zegt het antwoord met Piper in Home Assistant, als die er is; anders alleen tekst. */
  async function zeg(tekst) {
    if (stemNaam === undefined) {
      // Piper in de taal van de app, als die stem er is (besluit 185); anders alleen tekst.
      const s = await fetch(`api/stem?taal=${global.taal.code}`).then((r) => r.json()).catch(() => null);
      stemNaam = s?.stem && s?.taal ? s.stem : null;
    }
    if (!stemNaam) return new Promise((ok) => setTimeout(ok, Math.max(1500, tekst.length * 55)));
    return new Promise((ok) => {
      const a = new Audio(`api/stem?tekst=${encodeURIComponent(tekst)}&taal=${global.taal.code}`);
      a.onended = ok;
      a.onerror = ok;
      a.play().catch(() => setTimeout(ok, Math.max(1500, tekst.length * 55)));
    });
  }

  /* ---------------------------------------------------------------- de laag */

  const STIJL = `
  .sc-laag { position: absolute; inset: 0; z-index: 60; display: none; background: radial-gradient(ellipse at 30% 45%, rgba(16, 40, 48, 0.86), rgba(6, 10, 20, 0.92) 70%); backdrop-filter: blur(8px); color: var(--tekst); }
  .sc-laag.open { display: block; }
  .sc-laag .kern { position: absolute; left: 150px; top: 200px; width: 320px; height: 320px; display: grid; place-items: center; }
  .sc-laag .bol { width: 160px; height: 160px; border-radius: 50%; position: relative; z-index: 2; background: radial-gradient(circle at 34% 28%, #ffffff 0%, #c9fff0 16%, #6ee7b7 42%, #2f8f8a 75%, #103a40 100%); box-shadow: 0 0 70px rgba(110, 231, 183, 0.55), 0 0 160px rgba(110, 231, 183, 0.25), inset -18px -24px 40px rgba(5, 40, 40, 0.55); transition: background 0.4s, box-shadow 0.4s, transform 0.15s; }
  .sc-laag[data-stand='denkt'] .bol, .sc-laag[data-stand='antwoord'] .bol { background: radial-gradient(circle at 34% 28%, #ffffff 0%, #bfe3ff 16%, #6fb7ff 40%, #6a5cff 72%, #2a1f6b 100%); box-shadow: 0 0 60px rgba(111, 170, 255, 0.55), 0 0 140px rgba(143, 134, 255, 0.35), inset -18px -24px 40px rgba(20, 10, 70, 0.55); }
  .sc-laag .ring { position: absolute; border-radius: 50%; border: 2px solid rgba(110, 231, 183, 0.5); inset: 60px; }
  .sc-laag[data-stand='luistert'] .ring { animation: sc-golf 1.8s ease-out infinite; }
  .sc-laag[data-stand='luistert'] .ring.r2 { animation-delay: 0.9s; }
  @keyframes sc-golf { from { transform: scale(0.9); opacity: 0.8; } to { transform: scale(1.5); opacity: 0; } }
  .sc-laag .tekst { position: absolute; left: 520px; top: 214px; width: 640px; }
  .sc-laag .wie { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 9px; color: var(--mint); }
  .sc-laag .wie i { width: 9px; height: 9px; border-radius: 50%; background: currentColor; display: block; box-shadow: 0 0 10px currentColor; }
  .sc-laag[data-stand='denkt'] .wie, .sc-laag[data-stand='antwoord'] .wie { color: #B7B0FF; }
  .sc-laag .groot { font-family: var(--kop); font-weight: 600; font-size: 46px; line-height: 1.08; letter-spacing: -0.015em; margin: 12px 0 0; }
  .sc-laag .groot.lang { font-size: 34px; }
  .sc-laag .groot.nog { color: rgba(238, 243, 247, 0.35); }
  .sc-laag .klein { font-size: 18px; color: var(--zacht); margin: 16px 0 0; line-height: 1.45; }
  .sc-laag .jij { display: inline-flex; align-items: center; gap: 9px; padding: 9px 16px; border-radius: 18px 18px 18px 4px; background: rgba(255, 255, 255, 0.08); font-size: 17px; margin-bottom: 22px; }
  .sc-laag .ding { display: inline-grid; grid-template-columns: auto; gap: 1px; margin: 26px 10px 0 0; padding: 10px 18px; border-radius: 16px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
  .sc-laag .ding b { font-family: var(--kop); font-size: 21px; font-weight: 600; }
  .sc-laag .ding span { font-size: 13px; color: var(--gedempt); }
  .sc-laag .onder { position: absolute; left: 150px; right: 120px; bottom: 56px; display: flex; align-items: center; gap: 16px; }
  .sc-laag .knopje { height: 52px; padding: 0 24px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.1); color: var(--tekst); font: inherit; font-weight: 700; font-size: 16px; cursor: pointer; }
  .sc-laag .hint { font-size: 14.5px; color: var(--gedempt); }
  .sc-laag .privacy { position: absolute; right: 30px; top: 26px; font-size: 12.5px; color: var(--gedempt); }
  @media (prefers-reduced-motion: reduce) { .sc-laag .ring { animation: none !important; } }
  body.sc-luistert .dok .bol { box-shadow: 0 0 0 3px #0b1424, 0 0 0 5px var(--mint), 0 0 14px rgba(110, 231, 183, 0.6); }
  `;

  let laag = null;
  function maakLaag() {
    if (laag) return laag;
    const wand = document.getElementById('wand');
    if (!wand) return null;
    const stijl = document.createElement('style');
    stijl.textContent = STIJL;
    document.head.appendChild(stijl);
    laag = document.createElement('div');
    laag.className = 'sc-laag';
    laag.setAttribute('role', 'dialog');
    laag.setAttribute('aria-live', 'polite');
    laag.innerHTML = `<div class="privacy">${esc(tk('luisteren.privacy'))}</div><div class="kern" aria-hidden="true"><div class="ring"></div><div class="ring r2"></div><div class="bol" data-bol></div></div><div class="tekst" data-tekst></div><div class="onder"><button type="button" class="knopje" data-sluit>${esc(tk('kamer.scherm.stop'))}</button><span class="hint" data-hint></span></div>`;
    laag.querySelector('[data-sluit]').addEventListener('click', () => sluit());
    wand.appendChild(laag);
    return laag;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Getallen in zonnekleur, zoals bij de Assistent; eerst knippen, dan pas veilig maken. */
  const getal = (s) =>
    String(s)
      .split(/(\d+(?:[.,]\d+)?\s?(?:%|°|kWh|kW|W)?)/)
      .map((deel, i) => (i % 2 ? `<span style="color: var(--zon-t)">${esc(deel)}</span>` : esc(deel)))
      .join('');

  function toon(stand, inhoud) {
    const l = maakLaag();
    if (!l) return;
    l.classList.add('open');
    l.dataset.stand = stand;
    const jij = inhoud.jij ? `<span class="jij">${esc(inhoud.jij)}</span><br>` : '';
    const wie = esc(tk({ luistert: 'luisteren.luistert', denkt: 'assistent.denkt', nietverstaan: 'luisteren.nogEven' }[stand] ?? 'assistent.jeHuis'));
    const groot = inhoud.groot ?? '';
    l.querySelector('[data-tekst]').innerHTML = `${jij}<span class="wie"><i></i>${wie}</span><p class="groot${groot.length > 90 ? ' lang' : ''}${stand === 'denkt' ? ' nog' : ''}">${getal(groot)}</p>${inhoud.klein ? `<p class="klein">${esc(inhoud.klein)}</p>` : ''}${(inhoud.gedaan ?? []).map((k) => `<div class="ding"><b>${esc(k.waarde)}</b><span>${esc(k.uitleg)}</span></div>`).join('')}`;
    l.querySelector('[data-sluit]').textContent = tk(stand === 'antwoord' ? 'algemeen.sluiten' : 'kamer.scherm.stop');
    l.querySelector('[data-hint]').textContent = inhoud.hint ?? '';
  }

  /* ------------------------------------------------------------ de wand luistert */

  let aan = false;
  let huidig = null;
  let gesprek = false;
  let sluitTimer = 0;
  let niveauRaf = 0;
  let pauze = 1000;
  /** Hoe vaak het huis in dit gesprek al zei dat het je niet begreep (besluit 166). */
  let nietBegrepen = 0;

  /** De bol leeft mee met je stem, zolang het huis luistert. */
  function leefMee() {
    cancelAnimationFrame(niveauRaf);
    const stap = () => {
      const bol = laag?.querySelector('[data-bol]');
      if (bol && laag.dataset.stand === 'luistert') bol.style.transform = `scale(${1 + (mic?.niveau ?? 0) * 0.25})`;
      niveauRaf = requestAnimationFrame(stap);
    };
    niveauRaf = requestAnimationFrame(stap);
  }

  function sluit() {
    clearTimeout(sluitTimer);
    sluitTimer = 0;
    huidig?.stop();
    huidig = null;
    gesprek = false;
    cancelAnimationFrame(niveauRaf);
    laag?.classList.remove('open');
    if (aan) setTimeout(wacht, 300);
  }

  /** Wacht op het wekwoord; na elke ronde (of fout) opnieuw. */
  function wacht() {
    if (!aan || gesprek || huidig) return;
    document.body.classList.add('sc-luistert');
    huidig = ronde('wekwoord', (b) => {
      if (b.soort === 'klaar') pauze = 1000;
      if (b.soort === 'wakker') {
        gesprek = true;
        // Een wand in de nachtstand of in rust wordt wakker (besluit 164).
        dispatchEvent(new CustomEvent('sc-wek', { detail: 'stem' }));
        nietBegrepen = 0;
        tikje();
        toon('luistert', { groot: tk('luisteren.zegHet'), klein: tk('luisteren.bijvoorbeeld'), hint: tk('luisteren.totStop') });
        leefMee();
      } else if (b.soort === 'tekst') {
        huidig = null;
        void verwerk(b.tekst);
      } else if (b.soort === 'fout') {
        document.body.classList.remove('sc-luistert');
        if (gesprek) toon('antwoord', { groot: b.reden, hint: '' });
        // Even wachten voor een nieuwe poging; steeds iets langer, tot een minuut.
        pauze = Math.min(60_000, pauze * 2);
      } else if (b.soort === 'dicht') {
        huidig = null;
        if (!gesprek) setTimeout(wacht, pauze);
      }
    });
  }

  /** Wat je zei: vragen, doen, zeggen; daarna nog even luisteren zonder wekwoord. */
  async function verwerk(tekst) {
    clearTimeout(sluitTimer);
    sluitTimer = 0;
    // Niet verstaan of niet begrepen: één keer zeggen; de tweede keer is het ruis, dan stil stoppen.
    if (!tekst) {
      if (nietBegrepen++ > 0) return sluit();
      toon('nietverstaan', { groot: tk('luisteren.nietVerstaan'), klein: tk('luisteren.nogEens') });
      return doorpraten();
    }
    toon('denkt', { jij: tekst, groot: tk('kamer.kijken') });
    let uit;
    try {
      uit = await vraag(tekst);
    } catch {
      uit = { antwoord: tk('assistent.nietBereikbaar'), gedaan: [] };
    }
    // Alleen geluid: zoals niets gezegd (21 oktober 2026).
    if (uit.ruis) return verwerk('');
    // "Oké bedankt" of "dat was het": iets terug zeggen en niet verder luisteren.
    if (uit.klaar) {
      toon('antwoord', { jij: tekst, groot: uit.antwoord, hint: '' });
      await zeg(uit.gesproken ?? uit.antwoord);
      return sluit();
    }
    if (uit.onbekend && nietBegrepen++ > 0) return sluit();
    if (!uit.onbekend) nietBegrepen = 0;
    const vb = uit.onbekend ? uit.voorbeelden.slice(0, 2).map((x) => `"${x}"`).join(` ${tk('luisteren.of')} `) : '';
    toon('antwoord', { jij: tekst, groot: uit.onbekend ? tk('luisteren.begrijpNiet') : uit.antwoord, klein: vb ? tk('luisteren.vraagBijvoorbeeld', { voorbeelden: vb }) : '', gedaan: uit.gedaan.slice(0, 2), hint: tk('luisteren.nogIets') });
    await zeg(uit.gesproken ?? uit.antwoord);
    if (!laag?.classList.contains('open')) return;
    sluitTimer = setTimeout(sluit, SLUITEN_MS);
    doorpraten();
  }

  /** Na het antwoord: nog vijf seconden luisteren, zonder wekwoord. */
  function doorpraten() {
    let gesproken = false;
    const r = ronde('spraak', (b) => {
      if (b.soort === 'praat') {
        gesproken = true;
        clearTimeout(sluitTimer);
        sluitTimer = 0;
        laag.dataset.stand = 'luistert';
        leefMee();
      } else if (b.soort === 'tekst') {
        huidig = null;
        if (gesproken && b.tekst) void verwerk(b.tekst);
        else if (!laag?.classList.contains('open')) return;
        else if (!sluitTimer) sluitTimer = setTimeout(sluit, 3000);
      }
    });
    huidig = r;
    setTimeout(() => {
      if (!gesproken && huidig === r) {
        r.stop();
        huidig = null;
        if (!sluitTimer) sluitTimer = setTimeout(sluit, SLUITEN_MS - DOORPRATEN_MS);
      }
    }, DOORPRATEN_MS);
  }

  /** Begint met luisteren op deze wand, als dat hier aan staat en kan. */
  function start() {
    if (aan || !aanHier() || !kan() || global.app?.telStand?.()) return;
    aan = true;
    // Zonder tik weigert een browser soms het geluid; dan begint het bij de eerste tik.
    microfoon().then(
      () => {
        if (!loopt()) document.addEventListener('pointerdown', () => mic?.ctx.resume().catch(() => {}), { once: true });
        wacht();
      },
      () => {
        aan = false;
      },
    );
    const dok = document.querySelector('.dok .vraag');
    if (dok) dok.innerHTML = global.taal.html('luisteren.dok');
  }

  /* ------------------------------------------------------- de telefoon: één keer */

  /**
   * Eén keer luisteren, na een tik (de Assistent). `op` krijgt 'praat', 'stil', 'tekst'
   * (met de tekst), 'fout' (met de reden) en 'dicht'. `klaar()` zegt dat je klaar bent.
   */
  async function eenmaal(op) {
    // Meteen bij de tik: anders weigert de browser het geluid soms.
    await microfoon();
    if (!loopt()) await mic.ctx.resume().catch(() => {});
    // Zonder tik (de microfoon op Thuis) houdt een browser het geluid soms tegen: dan zelf tikken.
    if (!loopt()) throw new Error('tik');
    return ronde('spraak', op);
  }

  /* ------------------------------------------ verstaan via de browser (besluit 203) */

  /*
   * Zonder Whisper in Home Assistant kan de browser zelf verstaan: Chrome en Safari
   * hebben dat, de app van Home Assistant en Fully Kiosk meestal niet. Chrome stuurt
   * het geluid daarvoor naar Google; daarom alleen als dat bij Functies › Praten aan
   * staat. Dezelfde berichten als `eenmaal`, zodat de Assistent het verschil niet ziet.
   */
  const Herkenner = global.SpeechRecognition || global.webkitSpeechRecognition;
  /** Of deze browser zelf kan verstaan. */
  const kanBrowser = () => !!(Herkenner && global.isSecureContext);
  /** Zonder eigen opname geen echt niveau: half zolang je praat. */
  let browserNiveau = 0;

  function viaBrowser(op, taalCode) {
    const r = new Herkenner();
    r.lang = taalCode === 'en' ? 'en-GB' : 'nl-NL';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    let tekst = '';
    let mis = false;
    r.onspeechstart = () => {
      browserNiveau = 0.5;
      op({ soort: 'praat' });
    };
    r.onspeechend = () => {
      browserNiveau = 0;
      op({ soort: 'stil' });
    };
    r.onresult = (e) => (tekst = String(e.results?.[0]?.[0]?.transcript ?? '').trim());
    r.onerror = (e) => {
      // Niets gehoord: dan zegt 'tekst' zonder tekst dat het niet verstaan is.
      if (e.error === 'no-speech') return;
      mis = true;
      if (e.error === 'aborted') return;
      op({ soort: 'fout', reden: tk(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'assistent.geenMicrofoon' : e.error === 'network' ? 'assistent.geenNet' : 'assistent.nietVerstaan') });
    };
    r.onend = () => {
      browserNiveau = 0;
      if (!mis) op({ soort: 'tekst', tekst });
      op({ soort: 'dicht' });
    };
    r.start();
    return { klaar: () => r.stop(), stop: () => r.abort() };
  }

  global.luisteren = { kan, aanHier, zetHier, start, eenmaal, kanBrowser, viaBrowser, niveau: () => mic?.niveau ?? browserNiveau };
  // De wand: meteen beginnen als het hier aan staat.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
