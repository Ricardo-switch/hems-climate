/*
 * De film (besluit 144 en 146): een dag in je huis, in zo'n 45 seconden. Hij
 * begint in het donker; de zon komt op en je huis verschijnt. Dan zes beelden
 * door de dag heen, elk met een groot getal uit je eigen huis, en bij
 * zonsondergang gaan de lampen aan en sluit hij af. Geen video om te laden:
 * de app tekent het, en de muziek speelt de browser zelf. Pauzeren, het
 * geluid uit en overslaan kan altijd. Wie minder beweging wil, krijgt
 * rustige beelden.
 *
 * Gebruik: film.speel({ opEinde }) na een tik (het geluid mag pas na een tik).
 */
(function (global) {
  'use strict';

  const { esc, haal, nl } = global.app;
  const GELUID = 'sc-film-geluid';

  /* ------------------------------------------------------------ de maat */

  /** 112 tellen per minuut, vier tellen in een maat: alles valt op de maat. */
  const BPM = 112;
  const TEL = 60 / BPM;
  const MAAT = 4 * TEL;
  const MAAT_MS = MAAT * 1000;

  /* ------------------------------------------------------------ de muziek */

  /*
   * Een opbouwend nummer in D groot, gespeeld door de Web Audio van de
   * browser: niets om te downloaden, en niets gaat het huis uit. De akkoorden
   * zijn I, V, vi, IV (D, A, Bm, G), de klassieke euforische reeks.
   *
   * - Intro: een warme pad die langzaam opengaat, en een zachte arpeggio.
   * - Opbouw: de bas, een kick die vier op de vloer gaat, hihats.
   * - Aanloop: een maat ruis die stijgt en een roffel die versnelt.
   * - Drop, op het beeld van je dak: volle akkoorden die pompen op de kick,
   *   een bas op de tegentel, en de melodie.
   * - Slot: G, A en dan D, dat blijft hangen en uitklinkt.
   */
  const midi = (m) => 440 * 2 ** ((m - 69) / 12);
  const AKKOORDEN = [
    { grond: 38, noten: [62, 66, 69] }, // D
    { grond: 33, noten: [61, 64, 69] }, // A
    { grond: 35, noten: [62, 66, 71] }, // Bm
    { grond: 31, noten: [62, 67, 71] }, // G
  ];
  const SLOT = [AKKOORDEN[3], AKKOORDEN[1], AKKOORDEN[0], AKKOORDEN[0], AKKOORDEN[0]];
  /** De melodie van de drop, per akkoord in achtsten: [noot, lengte]. */
  const MELODIE = [
    [[78, 2], [81, 2], [86, 3], [85, 1]],
    [[85, 2], [81, 2], [76, 4]],
    [[86, 2], [85, 2], [83, 2], [81, 2]],
    [[83, 2], [81, 2], [79, 2], [78, 1], [76, 1]],
  ];

  function muziek(filmTijd, ctxVast = null) {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx && !ctxVast) return null;
    const ctx = ctxVast ?? new Ctx();
    // Toeval met een vaste start (mulberry32): de galm en de ruis klinken elke keer hetzelfde, en de piek ook.
    let zaad = 0x5c0ffee;
    const toeval = () => {
      zaad = (zaad + 0x6d2b79f5) | 0;
      let t = Math.imul(zaad ^ (zaad >>> 15), 1 | zaad);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Alles door een compressor, zodat het nooit kraakt.
    const pers = ctx.createDynamicsCompressor();
    pers.threshold.value = -16;
    pers.ratio.value = 4;
    pers.attack.value = 0.005;
    pers.release.value = 0.2;
    const hoofd = ctx.createGain();
    hoofd.gain.value = 0;
    // Als laatste een zachte begrenzer: tot 0,8 ongemoeid, daarboven afgerond, nooit boven 0,92.
    // Met ruimte tot 0,95: de galm is ruis, en het overbemonsteren schiet een fractie door.
    // De oude kromme ging tot 0,98, en op 17 oktober 2026 piekte de opname op 0,963.
    const grens = ctx.createWaveShaper();
    const kromme = new Float32Array(2048);
    for (let i = 0; i < kromme.length; i++) {
      const x = (i / (kromme.length - 1)) * 2 - 1;
      const a = Math.abs(x);
      kromme[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.12 * Math.tanh((a - 0.8) / 0.12));
    }
    grens.curve = kromme;
    grens.oversample = '2x';
    pers.connect(hoofd).connect(grens).connect(ctx.destination);
    // Een galm uit ruis die uitsterft, en een echo op drie zestienden.
    const galm = ctx.createConvolver();
    const lengte = Math.round(ctx.sampleRate * 2.8);
    const impuls = ctx.createBuffer(2, lengte, ctx.sampleRate);
    for (let k = 0; k < 2; k++) {
      const c = impuls.getChannelData(k);
      for (let i = 0; i < lengte; i++) c[i] = (toeval() * 2 - 1) * (1 - i / lengte) ** 2.6;
    }
    galm.buffer = impuls;
    const galmIn = ctx.createGain();
    galmIn.gain.value = 0.55;
    galmIn.connect(galm).connect(pers);
    const echo = ctx.createDelay(2);
    echo.delayTime.value = TEL * 0.75;
    const terug = ctx.createGain();
    terug.gain.value = 0.38;
    const echoKleur = ctx.createBiquadFilter();
    echoKleur.type = 'lowpass';
    echoKleur.frequency.value = 2600;
    const echoIn = ctx.createGain();
    echoIn.gain.value = 0.5;
    echoIn.connect(echo).connect(echoKleur).connect(terug).connect(echo);
    echoKleur.connect(pers);
    echoKleur.connect(galmIn);
    // Ruis, één keer gemaakt.
    const ruis = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const rk = ruis.getChannelData(0);
    for (let i = 0; i < rk.length; i++) rk[i] = toeval() * 2 - 1;

    let aan = true;
    let plan = { intro: 4, drop: 10, slot: 16, eind: 21 };
    let volgende = 0;
    /** Per maat een eigen bus, zodat spoelen alles wat al klaarstond kan stilzetten. */
    const bussen = [];

    const env = (g, t, a, piek, r, eind) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(piek, t + a);
      g.gain.setTargetAtTime(0.0001, eind, r / 4);
    };
    function osc(type, f, t, eind, detune = 0) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.start(t);
      o.stop(eind + 1.5);
      return o;
    }
    /** Een brede pad: drie zaagtanden per noot, iets uit elkaar, door een filter. */
    function pad(bus, t, duur, noten, open, sterk) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.7;
      f.frequency.setValueAtTime(open[0], t);
      f.frequency.exponentialRampToValueAtTime(open[1], t + duur);
      const g = ctx.createGain();
      env(g, t, Math.min(0.5, duur / 3), sterk, 1.6, t + duur);
      f.connect(g);
      g.connect(bus);
      g.connect(galmIn);
      for (const n of noten) for (const d of [-14, 0, 14]) osc('sawtooth', midi(n), t, t + duur, d).connect(f);
    }
    function pluk(bus, t, n, sterk, lang = 0.22) {
      const g = ctx.createGain();
      env(g, t, 0.004, sterk, lang, t + 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3200;
      osc('triangle', midi(n), t, t + lang).connect(f);
      osc('square', midi(n), t, t + lang, 7).connect(g);
      f.connect(g);
      g.connect(bus);
      g.connect(echoIn);
    }
    function bas(bus, t, n, duur, sterk) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = ctx.createGain();
      env(g, t, 0.01, sterk, 0.12, t + duur * 0.8);
      osc('sawtooth', midi(n), t, t + duur).connect(f);
      osc('sine', midi(n - 12), t, t + duur).connect(g);
      f.connect(g);
      g.connect(bus);
    }
    function kick(bus, t, sterk) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(sterk, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.35);
    }
    function ruisje(bus, t, duur, type, freq, sterk, naarGalm = 0) {
      const b = ctx.createBufferSource();
      b.buffer = ruis;
      b.playbackRate.value = 0.7 + toeval() * 0.6;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(sterk, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duur);
      b.connect(f).connect(g).connect(bus);
      if (naarGalm) {
        const s = ctx.createGain();
        s.gain.value = naarGalm;
        g.connect(s).connect(galmIn);
      }
      b.start(t, toeval() * 0.5);
      b.stop(t + duur + 0.05);
    }
    function lead(bus, t, n, duur, sterk) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3400;
      const g = ctx.createGain();
      env(g, t, 0.02, sterk, 0.3, t + duur * 0.92);
      for (const d of [-9, 9]) osc('sawtooth', midi(n), t, t + duur, d).connect(f);
      osc('square', midi(n - 12), t, t + duur).connect(f);
      f.connect(g);
      g.connect(bus);
      g.connect(echoIn);
      g.connect(galmIn);
    }
    function aanloop(bus, t) {
      // Ruis die stijgt, een toon die meegaat, en een roffel die versnelt.
      const b = ctx.createBufferSource();
      b.buffer = ruis;
      b.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(320, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + MAAT);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + MAAT * 0.97);
      g.gain.setValueAtTime(0.0001, t + MAAT);
      b.connect(f).connect(g).connect(bus);
      g.connect(galmIn);
      b.start(t);
      b.stop(t + MAAT + 0.02);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(midi(50), t);
      o.frequency.exponentialRampToValueAtTime(midi(74), t + MAAT);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.06, t + MAAT * 0.95);
      og.gain.setValueAtTime(0.0001, t + MAAT);
      o.connect(og).connect(bus);
      o.start(t);
      o.stop(t + MAAT + 0.02);
      const slagen = [...[0, 1, 2, 3].map((i) => i * TEL * 0.5), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => 2 * TEL + i * TEL * 0.25), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => 3 * TEL + i * TEL * 0.125)];
      slagen.forEach((s, i) => ruisje(bus, t + s, 0.09, 'bandpass', 1800, 0.12 + (i / slagen.length) * 0.45, 0.25));
    }

    /** Alles van maat n, vanaf audiotijd t0. */
    function speelMaat(n, t0) {
      if (n >= plan.eind) return;
      const bus = ctx.createGain();
      bus.connect(pers);
      bussen.push({ n, bus });
      const pomp = ctx.createGain();
      pomp.connect(bus);
      const deel = n < plan.intro ? 'intro' : n < plan.drop - 1 ? 'opbouw' : n === plan.drop - 1 ? 'aanloop' : n < plan.slot ? 'drop' : 'slot';
      const a = deel === 'slot' ? SLOT[Math.min(SLOT.length - 1, n - plan.slot)] : AKKOORDEN[n % 4];
      const tel = (i) => t0 + i * TEL;
      if (deel === 'intro') {
        // De zon komt op: de pad gaat langzaam open.
        const open = 300 + (n / plan.intro) * 1400;
        pad(pomp, t0, MAAT, a.noten, [open, open + 700], 0.045);
        bas(pomp, t0, a.grond, MAAT, 0.05);
        if (n >= 1) for (let i = 0; i < 8; i++) pluk(pomp, t0 + i * TEL * 0.5, [...a.noten, a.noten[0] + 12][i % 4] + 12, 0.03 + n * 0.012);
      } else if (deel === 'opbouw' || deel === 'aanloop') {
        const ver = Math.min(1, (n - plan.intro + 1) / Math.max(1, plan.drop - plan.intro));
        pad(pomp, t0, MAAT, a.noten, [900 + ver * 1500, 1400 + ver * 2400], 0.05);
        for (let i = 0; i < 16; i++) pluk(pomp, t0 + i * TEL * 0.25, [a.noten[0], a.noten[1], a.noten[2], a.noten[1]][i % 4] + 12 + (i >= 8 ? 12 : 0), 0.035 + ver * 0.02, 0.16);
        if (deel === 'aanloop') {
          aanloop(bus, t0);
          for (let i = 0; i < 8; i++) bas(pomp, t0 + i * TEL * 0.5, a.grond, TEL * 0.45, 0.07 + i * 0.01);
        } else {
          for (let i = 0; i < 8; i++) bas(pomp, t0 + i * TEL * 0.5, a.grond, TEL * 0.45, 0.08);
          for (let i = 0; i < 4; i++) if (ver > 0.3 || i % 2 === 0) kick(bus, tel(i), 0.5 + ver * 0.3);
          if (ver > 0.5) for (let i = 0; i < 4; i++) ruisje(bus, tel(i) + TEL / 2, 0.04, 'highpass', 8000, 0.08);
        }
      } else if (deel === 'drop') {
        // Pompen op de kick: de pad en de bas duiken bij elke tel even weg.
        for (let i = 0; i < 4; i++) {
          pomp.gain.setValueAtTime(0.25, tel(i));
          pomp.gain.linearRampToValueAtTime(1, tel(i) + TEL * 0.6);
        }
        pad(pomp, t0, MAAT, [...a.noten, a.noten[0] + 12], [2600, 5200], 0.06);
        for (let i = 0; i < 4; i++) {
          kick(bus, tel(i), 0.95);
          bas(pomp, tel(i) + TEL / 2, a.grond + 12, TEL * 0.42, 0.14);
          ruisje(bus, tel(i) + TEL / 2, 0.05, 'highpass', 8000, 0.11);
          if (i % 2 === 1) ruisje(bus, tel(i), 0.16, 'bandpass', 1500, 0.4, 0.35);
        }
        for (let i = 0; i < 16; i++) pluk(pomp, t0 + i * TEL * 0.25, [a.noten[0], a.noten[1], a.noten[2], a.noten[1]][i % 4] + 24, 0.025, 0.12);
        let s = 0;
        for (const [noot, lang] of MELODIE[n % 4]) {
          lead(bus, t0 + s * TEL * 0.5, noot, lang * TEL * 0.5, 0.05);
          s += lang;
        }
        // Een bekken bij de eerste maat van de drop.
        if (n === plan.drop) ruisje(bus, t0, 1.8, 'highpass', 5000, 0.3, 0.6);
      } else {
        // Het slot: G, A, D; de laatste D klinkt uit.
        const laatste = n === plan.slot + 2;
        const duur = laatste ? MAAT * 3 : MAAT;
        if (n > plan.slot + 2) return;
        pad(pomp, t0, duur, [...a.noten, a.noten[0] + 12], [2200, laatste ? 900 : 3000], 0.055);
        bas(pomp, t0, a.grond, duur, 0.07);
        for (let i = 0; i < 8; i++) pluk(pomp, t0 + i * TEL * 0.5, [...a.noten, a.noten[0] + 12][i % 4] + 12, laatste ? 0.03 - i * 0.003 : 0.035);
        if (n === plan.slot) for (let i = 0; i < 2; i++) kick(bus, tel(i * 2), 0.6);
        if (laatste) lead(bus, t0, 86, MAAT * 1.5, 0.04);
      }
    }

    // Een klok die steeds iets vooruit inplant, op de tijd van de film.
    const klok = setInterval(() => {
      if (ctx.state !== 'running') return;
      const nu = filmTijd();
      while (volgende * MAAT < nu + 0.35 && volgende < plan.eind) {
        const t0 = ctx.currentTime + (volgende * MAAT - nu);
        if (t0 > ctx.currentTime - MAAT) speelMaat(volgende, Math.max(t0, ctx.currentTime + 0.01));
        volgende++;
      }
    }, 60);

    const volume = () => (aan ? 0.85 : 0);
    return {
      get aan() {
        return aan;
      },
      zet(v) {
        aan = v;
        hoofd.gain.setTargetAtTime(volume(), ctx.currentTime, 0.08);
      },
      begin(p) {
        plan = p;
        volgende = 0;
        void ctx.resume();
        hoofd.gain.setTargetAtTime(volume(), ctx.currentTime, 0.05);
      },
      /** Spoelen: wat klaarstond stil, en verder vanaf de maat van nu. */
      spoel() {
        for (const { bus } of bussen.splice(0)) {
          bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
          setTimeout(() => bus.disconnect(), 200);
        }
        volgende = Math.floor(filmTijd() / MAAT);
      },
      /** Alles in één keer inplannen, voor het opnemen zonder luidspreker. */
      alles(p) {
        clearInterval(klok);
        plan = p;
        hoofd.gain.value = volume();
        for (let n = 0; n < p.eind; n++) speelMaat(n, n * MAAT + 0.01);
      },
      pauze(p) {
        if (p) void ctx.suspend();
        else void ctx.resume();
      },
      stop() {
        clearInterval(klok);
        hoofd.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        setTimeout(() => void ctx.close(), 1200);
      },
    };
  }

  /* ------------------------------------------------------------ de beelden */

  const binnenVan = (huis) => (huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => (e.ruimtes ?? []).filter((r) => !global.huismodel.isBuiten(e, r)));
  const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
  const naamIn = (r) => (r ? global.huismodel.metLidwoord(r.naam) : null);

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
   * De film als reeks: de intro, zes beelden door de dag, en het slot, elk een
   * aantal maten. Een beeld zonder zijn cijfer valt weg; zo staat er nooit een
   * getal dat niet uit het huis komt. Het beeld van je dak valt op de drop.
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
      { soort: 'intro', maten: 4, tijd: 'ochtend', titel: 'Een dag in je huis', groot: 'Smart Climate', kleur: 'var(--tekst)', kop: 'Dit is je huis.', klein: 'Met de cijfers van je eigen huis.', zoom: 0.94 },
      c.gisterenKwh != null && { maten: 2, tijd: 'ochtend', titel: 'Gisteren, van je dak', groot: `${nl(c.gisterenKwh)} kWh`, kleur: 'var(--zon)', kop: 'Zoveel zon gaf je dak gisteren.', klein: 'Smart Climate ziet wat je huis doet, elke minuut.', zoom: 0.96 },
      { maten: 2, tijd: 'ochtend', titel: 'Je hele huis', groot: String(c.kamers), kleur: 'var(--tekst)', kop: `${c.kamers === 1 ? 'kamer' : 'kamers'}, ${c.apparaten} apparaten. Eén huis.`, klein: 'Gevonden in Home Assistant. Jij kijkt of het klopt.', temp: true, zoom: 1 },
      c.warmKamer && { maten: 2, tijd: 'dag', titel: 'Elke kamer in beeld', groot: `${nl(c.warmKamer.temperatuurC)}°`, kleur: 'var(--gloed)', kop: `in ${warmNaam}, nu.`, klein: 'Het huis weet hoe warm elke kamer is, en zegt bij elk besluit waarom.', warmKamer: true, zoom: 1.06 },
      c.piekKw != null && { maten: 2, drop: true, tijd: 'dag', titel: 'Je dak op zijn best', groot: `${nl(c.piekKw)} kW`, kleur: 'var(--zon)', kop: zonNaam ? `Met wat over is, ${zomer ? 'koelt' : 'warmt'} ${zonNaam} ${zomer ? 'af' : 'op'}.` : 'Met wat over is, draaien je apparaten.', klein: 'Op stroom van je eigen dak, niet van het net.', zonKamer: true, zoom: 1.08 },
      { maten: 2, tijd: 'dag', titel: 'Vraag het je huis', groot: '“Waarom?”', kleur: 'var(--ijs)', kop: 'Het huis antwoordt, hardop.', klein: 'Lokaal, met je eigen gegevens. Niets gaat het huis uit.', zoom: 0.98 },
      c.morgenKwh != null && { maten: 2, tijd: 'avond', titel: 'Kijkt vooruit', groot: `${nl(c.morgenKwh)} kWh`, kleur: 'var(--violet)', kop: 'zon verwacht voor morgen. Het huis weet het al.', klein: 'Uit het weer en wat je panelen leerden.', zoom: 1 },
      c.eigenPct != null
        ? { soort: 'slot', maten: 5, tijd: 'avond', titel: 'Klaar', groot: `${c.eigenPct}%`, kleur: 'var(--mint)', kop: 'van je stroom kwam deze maand van je eigen dak.', klein: 'Je huis kijkt vanaf nu mee.', eind: true, zoom: 1 }
        : { soort: 'slot', maten: 5, tijd: 'avond', titel: 'Klaar', groot: 'Welkom thuis', kleur: 'var(--mint)', kop: 'Je huis staat erin.', klein: 'Je huis kijkt vanaf nu mee.', eind: true, zoom: 1 },
    ].filter(Boolean);
    // Geen beeld van je dak: de drop op het vierde beeld, of het laatste voor het slot.
    if (!lijst.some((b) => b.drop)) lijst[Math.min(4, lijst.length - 2)].drop = true;
    let maat = 0;
    for (const b of lijst) {
      b.vanaf = maat;
      maat += b.maten;
    }
    return lijst;
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
        // 's Avonds gaan de lampen aan.
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
    const zon = b.soort === 'intro'
      ? { stand: 0.06, hoogte: 0.12, aandeel: 0.05, panelen: t.panelen }
      : b.tijd === 'dag' ? { stand: 0.55, hoogte: 0.9, aandeel: b.zonKamer ? 0.9 : 0.6, panelen: t.panelen }
        : b.tijd === 'ochtend' ? { stand: 0.2, hoogte: 0.35, aandeel: 0.25, panelen: t.panelen }
          : { stand: 0.94, hoogte: 0.08, aandeel: 0, panelen: t.panelen };
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
      garage: t.garage,
      stromen: b.zonKamer && c.zonKamer ? [{ van: 'zon', naar: `kamer:${c.zonKamer.naam}`, sterkte: 0.85 }] : b.eind ? [{ van: 'zon', naar: 'huis', sterkte: 0.5 }] : [],
      labels: [],
    };
  }

  /* ------------------------------------------------------------ afspelen */

  const STIJL = `
    .film { position: fixed; inset: 0; z-index: 90; display: grid; grid-template-rows: minmax(0, 1fr) auto; color: var(--tekst); background: #050a14; overflow: hidden; }
    .film-lucht { position: absolute; inset: 0; opacity: 0; transition: opacity 2.4s ease; pointer-events: none; }
    .film-lucht.aan { opacity: 1; }
    .film-lucht.nacht { background: radial-gradient(120% 90% at 50% 10%, #101a33 0%, #070d18 70%); }
    .film-lucht.ochtend { background: radial-gradient(120% 90% at 20% 95%, #6a4a42 0%, #2a2f4f 50%, #0b1424 100%); }
    .film-lucht.dag { background: radial-gradient(120% 90% at 30% 15%, #2b4775 0%, #142545 55%, #0b1424 100%); }
    .film-lucht.avond { background: radial-gradient(120% 90% at 75% 92%, #7a3a3a 0%, #2e2246 50%, #0b1424 100%); }
    .film-beeld { position: relative; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: 24px; padding: 24px 48px 8px; min-height: 0; }
    .film-woord { position: relative; min-width: 0; }
    .film-woord .titel { font-size: 15px; font-weight: 700; color: var(--gedempt); letter-spacing: 0.02em; }
    .film-woord .groot { font-family: var(--kop); font-weight: 800; font-size: clamp(64px, 9vw, 128px); line-height: 0.92; letter-spacing: -0.04em; margin-top: 8px; transform-origin: left center; }
    .film-woord .groot.merkwoord { display: flex; align-items: center; gap: 0.28em; font-size: clamp(44px, 6vw, 84px); letter-spacing: -0.03em; }
    .film-woord .groot.merkwoord i { width: 0.9em; height: 0.9em; border-radius: 0.24em; background: conic-gradient(from 200deg, #ff7a4d, #f7b548, #6ee7b7, #6fd3ff, #8f86ff, #ff7a4d); flex-shrink: 0; }
    .film-woord h2 { margin: 16px 0 0; font-family: var(--kop); font-weight: 600; font-size: clamp(24px, 2.6vw, 36px); line-height: 1.15; max-width: 22ch; }
    .film-woord p { margin: 12px 0 0; font-size: clamp(15px, 1.3vw, 18px); color: var(--zacht); max-width: 40ch; }
    .film-woord .in { animation: film-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-woord .uit { animation: film-uit 0.5s ease both; }
    @keyframes film-in { from { opacity: 0; transform: translateY(22px); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
    @keyframes film-uit { to { opacity: 0; transform: translateY(-10px); filter: blur(6px); } }
    .film-woord .groot.puls { animation: film-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both, film-puls var(--tel) ease-out 0.9s infinite; }
    @keyframes film-puls { 0% { transform: scale(1.035); } 100% { transform: scale(1); } }
    .film-huis { align-self: stretch; min-height: 0; display: grid; place-items: center; }
    .film-huis.opkomst { animation: film-opkomst var(--duur) cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    @keyframes film-opkomst { from { opacity: 0; transform: translateY(40px) scale(0.9); filter: brightness(0.2); } to { opacity: 1; transform: none; filter: none; } }
    .film-huis .sc-huis { width: 100%; height: 100%; }
    .film-zoom { width: 100%; height: 100%; display: grid; place-items: center; }
    .film-flits { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
    .film-flits.aan { animation: film-flits 0.6s ease-out; }
    @keyframes film-flits { from { opacity: 0.35; } to { opacity: 0; } }
    .film-eind { margin-top: 26px; display: flex; align-items: center; gap: 14px; }
    .film-eind .merkje { display: inline-flex; align-items: center; gap: 10px; font-family: var(--kop); font-size: 22px; font-weight: 700; margin-right: 8px; }
    .film-eind .merkje i { width: 30px; height: 30px; border-radius: 9px; background: conic-gradient(from 200deg, #ff7a4d, #f7b548, #6ee7b7, #6fd3ff, #8f86ff, #ff7a4d); }
    .film-eind button { height: 52px; padding: 0 26px; border-radius: 999px; border: 0; background: var(--tekst); color: #0b1424; font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; }
    .film-balk { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 48px 22px; }
    .film-balk button { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.08); color: var(--tekst); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-grid; place-items: center; }
    .film button:focus-visible { outline: 2px solid var(--tekst); outline-offset: 2px; }
    .film-tellen { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
    .film-tellen b { display: block; height: 100%; width: 0; background: var(--tekst); }
    html.tel-stand .film-beeld { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); padding: 24px 20px 0; align-content: start; }
    html.tel-stand .film-balk { padding: 12px 20px 22px; }
    @media (prefers-reduced-motion: reduce) { .film-woord .in, .film-woord .uit, .film-woord .groot.puls, .film-flits.aan, .film-huis.opkomst { animation: none; } .film-zoom { transition: none !important; } }
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
    let t = 0;
    const klank = (() => {
      try {
        return muziek(() => t / 1000);
      } catch {
        return null;
      }
    })();
    klank?.zet(geluidAan);
    const stil = global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const el = document.createElement('div');
    el.className = 'film';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Een dag in je huis, een film van 45 seconden');
    el.style.setProperty('--tel', `${TEL}s`);
    el.innerHTML = `${['nacht', 'ochtend', 'dag', 'avond'].map((x) => `<div class="film-lucht ${x}${x === 'nacht' ? ' aan' : ''}" data-lucht="${x}"></div>`).join('')}
      <div class="film-beeld"><div class="film-woord" aria-live="polite" data-film-tekst></div><div class="film-huis" data-film-huis><div class="film-zoom" data-film-zoom></div></div><div class="film-flits" data-film-flits></div></div>
      <div class="film-balk"><button type="button" data-film-pauze aria-label="Pauzeren">❚❚</button><div class="film-tellen" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100" data-film-tellen><b></b></div><button type="button" data-film-geluid aria-pressed="${geluidAan}">${geluidAan ? 'Geluid aan' : 'Geluid uit'}</button><button type="button" data-film-klaar>Overslaan</button></div>`;
    document.body.append(el);
    el.querySelector('[data-film-klaar]').focus();

    const d = await laad();
    const lijst = beelden(d);
    const totaalMaten = lijst.reduce((s, b) => s + b.maten, 0);
    const totaal = totaalMaten * MAAT_MS;
    const dropMaat = lijst.find((b) => b.drop).vanaf;
    const slotMaat = lijst.at(-1).vanaf;
    klank?.begin({ intro: lijst[0].maten, drop: dropMaat, slot: slotMaat, eind: totaalMaten });

    let gepauzeerd = false;
    let laatste = performance.now();
    let beeldNu = -1;
    let gestopt = false;
    let uitgespeeld = false;
    let stap = 0;

    const huisEl = el.querySelector('[data-film-huis]');
    const zoomEl = el.querySelector('[data-film-zoom]');
    const tekstEl = el.querySelector('[data-film-tekst]');
    const flits = el.querySelector('[data-film-flits]');
    const balk = el.querySelector('[data-film-tellen] b');
    const maat = () => (document.documentElement.classList.contains('tel-stand') ? { breedte: Math.min(innerWidth - 20, 420), hoogte: Math.round(innerHeight * 0.42) } : { breedte: Math.round(innerWidth * 0.55), hoogte: Math.round(innerHeight * 0.78) });
    const lucht = (tijd) => el.querySelectorAll('[data-lucht]').forEach((x) => x.classList.toggle('aan', x.dataset.lucht === tijd));

    function woorden(b) {
      const groot = b.soort === 'intro' ? `<div class="groot merkwoord in" style="color: ${b.kleur}; animation-delay: ${stil ? 0 : MAAT}s"><i aria-hidden="true"></i>${esc(b.groot)}</div>` : `<div class="groot in${b.drop || (beeldNu > lijst.findIndex((x) => x.drop) && !b.eind) ? (stil ? '' : ' puls') : ''}" style="color: ${b.kleur}">${esc(b.groot)}</div>`;
      const vertraag = (n) => (stil ? 0 : b.soort === 'intro' ? MAAT * n : 0.15 * n);
      return `<div class="titel in" style="animation-delay: ${vertraag(b.soort === 'intro' ? 1 : 0)}s">${esc(b.titel)}</div>${groot}<h2 class="in" style="animation-delay: ${vertraag(b.soort === 'intro' ? 2 : 1)}s">${esc(b.kop)}</h2><p class="in" style="animation-delay: ${vertraag(b.soort === 'intro' ? 2.5 : 2)}s">${esc(b.klein)}</p>${b.eind ? `<div class="film-eind in" style="animation-delay: ${stil ? 0 : MAAT * 2}s"><span class="merkje"><i aria-hidden="true"></i>Smart Climate</span><button type="button" data-film-begin>Begin</button></div>` : ''}`;
    }

    function naarBeeld(i) {
      beeldNu = i;
      stap = 0;
      const b = lijst[i];
      lucht(b.soort === 'intro' ? 'nacht' : b.tijd);
      global.huis.teken(zoomEl, model(d, b), { ...maat(), marge: 0.04 });
      // Langzaam inzoomen over het hele beeld.
      zoomEl.style.transition = 'none';
      zoomEl.style.transform = `scale(${b.zoom})`;
      if (!stil) {
        void zoomEl.offsetWidth;
        zoomEl.style.transition = `transform ${b.maten * MAAT}s linear`;
        zoomEl.style.transform = `scale(${b.zoom * 1.06})`;
      }
      huisEl.classList.remove('opkomst');
      if (b.soort === 'intro' && !stil) {
        void huisEl.offsetWidth;
        huisEl.style.setProperty('--duur', `${MAAT * 2.2}s`);
        huisEl.classList.add('opkomst');
      }
      tekstEl.innerHTML = woorden(b);
      if (b.drop && !stil) {
        flits.classList.remove('aan');
        void flits.offsetWidth;
        flits.classList.add('aan');
      }
    }

    /** Binnen een beeld: de zon komt op in de intro, en in het slot wordt het nacht. */
    function binnenBeeld(b, f) {
      if (b.soort === 'intro' && stap === 0 && f > 0.2) {
        stap = 1;
        lucht('ochtend');
      }
      if (b.soort === 'slot' && stap === 0 && f > 0.55) {
        stap = 1;
        lucht('nacht');
      }
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
      if (!gepauzeerd && !uitgespeeld) t += nu - laatste;
      laatste = nu;
      if (t >= totaal && !uitgespeeld) {
        // Het laatste beeld blijft staan tot je tikt, en sluit na een poos vanzelf.
        uitgespeeld = true;
        t = totaal;
        el.querySelector('[data-film-klaar]').textContent = 'Begin';
        setTimeout(stop, 8000);
      }
      const m = Math.min(totaalMaten - 0.001, t / MAAT_MS);
      let i = lijst.findIndex((b) => m >= b.vanaf && m < b.vanaf + b.maten);
      if (i < 0) i = lijst.length - 1;
      if (i !== beeldNu) naarBeeld(i);
      binnenBeeld(lijst[i], (m - lijst[i].vanaf) / lijst[i].maten);
      balk.style.width = `${(t / totaal) * 100}%`;
      el.querySelector('[data-film-tellen]').setAttribute('aria-valuenow', String(Math.round((t / totaal) * 100)));
      requestAnimationFrame(tik);
    }

    function pauze(p) {
      gepauzeerd = p;
      klank?.pauze(p);
      el.querySelectorAll('.in, .puls, .opkomst').forEach((x) => (x.style.animationPlayState = p ? 'paused' : ''));
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
      if (!b) {
        if (uitgespeeld) stop();
        return;
      }
      if (b.hasAttribute('data-film-klaar') || b.hasAttribute('data-film-begin')) stop();
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
    return {
      stop,
      pauze,
      naar: (i) => {
        t = lijst[i].vanaf * MAAT_MS;
        uitgespeeld = false;
        klank?.spoel();
      },
      aantal: lijst.length,
      lengteS: totaal / 1000,
    };
  }

  /** De muziek opnemen zonder luidspreker: om te meten dat hij opbouwt (test). */
  async function opname(plan, rate = 22050) {
    const off = new OfflineAudioContext(2, Math.ceil((plan.eind * MAAT + 3) * rate), rate);
    muziek(() => 0, off).alles(plan);
    return off.startRendering();
  }

  global.film = { speel, beelden, cijfers, opname, MAAT };
})(window);
