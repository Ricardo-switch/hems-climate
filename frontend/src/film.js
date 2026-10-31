/*
 * De film (besluit 144 en 146), als trailer (besluit 200): je huis in acht
 * shots op de maat, zo'n veertig seconden. Een camera vliegt over het
 * getekende huis: het eiland op, de etages in, naar het dak; de kaarten uit
 * de app schuiven in beeld, de assistent praat, het getal van de maand valt op
 * de drop, en het slot is een eigen kaart met Naar je huis of Nog een keer.
 * Geen video om te laden: de app tekent het, en de muziek speelt de browser
 * zelf. Pauzeren, het geluid uit en overslaan kan altijd. Wie minder beweging
 * wil, krijgt dezelfde shots zonder vliegen.
 *
 * Gebruik: film.speel({ opEinde, opGeladen }) na een tik (het geluid mag pas na
 * een tik). opGeladen komt als de cijfers binnen zijn: daarna heeft de film de
 * verbinding niet meer nodig (besluit 202).
 */
(function (global) {
  'use strict';

  const { esc, haal, nl } = global.app;
  // De teksten in kit/teksten.*.js (besluit 185); `t` is hier de tijd van de film.
  const tk = (k, p) => global.taal.t(k, p);
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

  const hm = () => global.huismodel;
  const binnenIn = (e) => (e.ruimtes ?? []).filter((r) => !hm().isBuiten(e, r));
  const binnenEtages = (huis) => (huis?.etages ?? []).filter((e) => e.id !== 'buiten' && e.id !== 'kelder' && binnenIn(e).length > 0);
  const binnenVan = (huis) => (huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap(binnenIn);
  const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
  const naamIn = (r) => (r ? hm().metLidwoord(r.naam) : null);

  /** De etage voor het beeld van de etages: liefst een in het midden, met de meeste kamers. */
  function etageVan(huis) {
    const alle = binnenEtages(huis);
    if (!alle.length) return null;
    const midden = alle.filter((e, i) => i > 0 && i < alle.length - 1);
    const etage = [...(midden.length ? midden : alle)].sort((a, b) => binnenIn(b).length - binnenIn(a).length)[0];
    const i = alle.indexOf(etage);
    return { etage, boven: i, onder: alle.length - 1 - i };
  }

  /** De kaarten uit de app voor het beeld van de apparaten: wat nu iets doet eerst, hooguit drie. */
  function kaartenVan(d) {
    const b = d.state?.bewoner ?? {};
    const kaarten = [];
    for (const r of binnenVan(d.huis)) {
      for (const a of klimaatIn(r)) {
        const code = a.klimaat?.actieCode ?? '';
        const doet = /^(koelt|verwarmt|verwarmt-voor|droogt|ventileert)$/.test(code);
        const zin = doet ? a.klimaat.actie : a.stand;
        if (!zin) continue;
        kaarten.push({ naam: a.naam, zin: hm().metHoofdletter(zin), ring: r.temperatuurC == null ? '' : `${nl(r.temperatuurC)}°`, deel: doet ? 1 : 0, kleur: code === 'koelt' ? '#6FD3FF' : '#FF7A4D', toon: doet ? (code === 'koelt' ? 'ijs-t' : 'gloed-t') : 'zacht', actief: doet, zon: a.klimaat?.rol === 'zon' });
      }
    }
    for (const u of b.uitstelbaar ?? []) if (u.kop) kaarten.push({ naam: u.naam, zin: u.kop, ring: '', deel: u.stand === 'running' ? 0.62 : 0, kleur: '#F7B548', toon: 'zon-t', actief: u.stand === 'running' || u.stand === 'would_start', zon: true });
    for (const w of b.warmtebuffers ?? []) if (w.kop) kaarten.push({ naam: w.naam, zin: w.kop, ring: w.temperatuurC == null ? '' : `${nl(w.temperatuurC, 0)}°`, deel: w.temperatuurC == null ? 0 : Math.max(0, Math.min(1, (w.temperatuurC - 20) / Math.max(1, w.zonC - 20))), kleur: '#FF7A4D', toon: 'gloed-t', actief: !!w.stookt || w.stand === 'would_heat', zon: w.bron === 'zon' });
    return kaarten.sort((x, y) => Number(y.actief) - Number(x.actief) || Number(y.zon) - Number(x.zon)).slice(0, 3);
  }

  /** Wat het huis zelf vertelt: de echte cijfers, of null als ze er niet zijn. */
  function cijfers(d) {
    const kamers = binnenVan(d.huis);
    const apparaten = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).reduce((t, r) => t + (r.apparaten?.length ?? 0), 0);
    const zonKamer = kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.rol === 'zon')) ?? kamers.find((r) => klimaatIn(r).some((a) => a.klimaat?.kanKoelen)) ?? null;
    const warmKamer = kamers.find((r) => r.soort === 'badkamer' && r.temperatuurC != null) ?? kamers.find((r) => r.zoneId && r.temperatuurC != null) ?? null;
    return {
      kamers: kamers.length,
      apparaten,
      zonKamer,
      warmKamer,
      etage: etageVan(d.huis),
      bovenste: binnenEtages(d.huis)[0] ?? null,
      kaarten: kaartenVan(d),
      overKw: Math.max(0, (d.state?.explanation?.budget?.surplusW ?? 0) / 1000),
      gisterenKwh: d.gisteren?.zonWh > 0 ? d.gisteren.zonWh / 1000 : null,
      morgenKwh: d.weer?.dagen?.[0]?.verwachtKwh ?? null,
      eigenPct: d.opbrengst?.stroom?.eigenZonPct ?? null,
    };
  }

  /*
   * De film als trailer (25 oktober 2026): acht shots op de maat, elk met een
   * camera die van een begin naar een eind beweegt. Een camera is [vergroting,
   * [px, py], [qx, qy]]: het punt p van de tekening (als deel van het scherm)
   * komt op plek q van het scherm. Een shot zonder zijn cijfer valt weg; zo
   * staat er nooit een getal dat niet uit het huis komt. Het getal van de maand
   * valt op de drop.
   */
  function beelden(d) {
    const c = cijfers(d);
    const kamer = naamIn(c.warmKamer);
    const morgen = c.morgenKwh != null ? tk('film.ass.morgen', { kwh: nl(c.morgenKwh) }) : '';
    const assistent = c.warmKamer
      ? { vraag: tk('film.ass.vraagWarm', { kamer }), zegt: `${hm().metHoofdletter(tk('film.ass.warm', { kamer, temp: `${nl(c.warmKamer.temperatuurC)}°` }))}${morgen ? ` ${morgen}` : ''}` }
      : morgen ? { vraag: tk('film.ass.vraagZon'), zegt: morgen } : null;
    const lijst = [
      { soort: 'opkomst', tijd: 'nacht', cam: [[0.42, [0.5, 0.525], [0.5, 0.75]], [0.7, [0.5, 0.525], [0.5, 0.55]]] },
      { soort: 'huis', tijd: 'ochtend', temp: true, tekst: { kicker: tk('film.huis.kicker'), groot: String(c.kamers), zin: tk('film.huis.zin', { n: c.kamers, apparaten: c.apparaten }) }, cam: [[0.75, [0.5, 0.525], [0.594, 0.575]], [0.95, [0.5, 0.513], [0.688, 0.588]]] },
      c.etage && { soort: 'etage', tijd: 'ochtend', temp: true, tekst: { kicker: tk('film.etage.kicker'), groot: tk('film.etage.groot'), zin: tk('film.etage.zin') }, cam: [[0.8, [0.5, 0.5], [0.727, 0.588]], [0.95, [0.5, 0.488], [0.75, 0.588]]] },
      c.gisterenKwh != null && { soort: 'dak', tijd: 'dag', temp: true, anker: 'dak', tekst: { kicker: tk('film.dak.kicker'), groot: `${nl(c.gisterenKwh)} kWh`, kleur: 'var(--zon)', zin: tk('film.dak.zin') }, cam: [[1.3, [0.5, 0.375], [0.75, 0.588]], [1.7, [0.508, 0.363], [0.773, 0.588]]] },
      c.kaarten.length > 0 && { soort: 'apparaten', tijd: 'dag', temp: true, anker: 'zonKamer', cam: [[1.6, [0.516, 0.4], [0.367, 0.588]], [1.9, [0.523, 0.413], [0.352, 0.6]]] },
      assistent && { soort: 'assistent', tijd: 'avond', temp: true, assistent, cam: [[1.2, [0.5, 0.5], [0.789, 0.575]], [1.05, [0.5, 0.513], [0.781, 0.588]]] },
      c.eigenPct != null && { soort: 'drop', tijd: 'avond', temp: true, drop: true, tekst: { kicker: tk('film.drop.kicker'), groot: `${c.eigenPct}%`, kleur: 'var(--mint)', zin: tk('film.drop.zin') }, cam: [[1.1, [0.5, 0.525], [0.703, 0.575]], [0.9, [0.5, 0.525], [0.688, 0.588]]] },
      { soort: 'slot', tijd: 'nacht', maten: 4, cam: [[0.92, [0.5, 0.525], [0.5, 0.65]], [0.5, [0.5, 0.525], [0.5, 0.8]]] },
    ].filter(Boolean);
    // Geen getal van de maand: de drop op je dak, of op het shot voor het slot.
    if (!lijst.some((b) => b.drop)) (lijst.find((b) => b.soort === 'dak') ?? lijst.at(-2)).drop = true;
    let maat = 0;
    for (const b of lijst) {
      b.maten ??= 2;
      b.vanaf = maat;
      maat += b.maten;
    }
    return lijst;
  }

  /** Het huis bij een shot, uit dezelfde opbouw als Thuis (huismodel.tekening). */
  function model(d, c, b) {
    const m = new Date().getMonth() + 1;
    const stand = m >= 4 && m <= 9 ? 'koelt' : 'warmt';
    const avond = b.tijd === 'avond' || b.soort === 'slot';
    const kamer = (r) => {
      const k = hm().kamerModel(r, null);
      if (!b.temp) k.temp = null;
      k.stand = null;
      k.zin = null;
      // 's Avonds gaan de lampen aan.
      for (const a of k.apparaten) if ('aan' in a) a.aan = avond && a.soort === 'lamp';
      if (b.soort === 'apparaten' && c.zonKamer?.id === r.id) {
        k.stand = stand;
        for (const a of k.apparaten) if (a.soort === 'airco') Object.assign(a, { aan: true, stand });
      }
      return k;
    };
    const tek = hm().tekening(d.huis, { zon: d.zon, kamer });
    const ant = d.aansluiting?.antwoorden ?? {};
    const [zs, zh, za] = { nacht: [0.02, 0, 0], ochtend: [0.2, 0.35, 0.25], dag: [0.55, 0.9, b.soort === 'apparaten' ? 0.9 : 0.7], avond: [0.94, 0.08, 0.05] }[b.tijd];
    const zon = { stand: zs, hoogte: zh, aandeel: za, opRechts: hm().zonOpRechts(d.aansluiting?.ligging, ant.panelen) ?? undefined, ...hm().panelenOpDak(ant.panelen, tek.piekW) };
    const basis = { beschrijving: tk('film.beschrijving', { titel: b.tekst?.kicker ?? tk('film.label') }), tijd: b.tijd, wolken: 0.15, zon, labels: [] };
    if (b.soort === 'etage') {
      // Zoals Kamer: de etage op hoogte, de etages eronder en erboven vaag.
      const { etage, boven, onder } = c.etage;
      return { ...basis, zonderDak: true, etages: [{ naam: etage.naam, erBoven: boven > 0, kamers: binnenIn(etage).map(kamer) }], lagen: { onder, boven } };
    }
    const naarZon = b.soort === 'apparaten' && c.zonKamer ? `kamer:${c.zonKamer.naam}` : 'huis';
    return {
      ...basis,
      // Het huis zelf, zoals elke pagina het tekent (besluit 191).
      ...hm().huisDelen(tek, ant.elders ?? {}),
      buitenunit: tek.buitenunit ? { ...tek.buitenunit, aan: b.soort === 'apparaten' && !!c.zonKamer } : null,
      net: true,
      stromen: b.soort === 'dak' || b.soort === 'apparaten' ? [{ van: 'zon', naar: naarZon, sterkte: 0.8 }] : b.soort === 'drop' ? [{ van: 'net', naar: 'huis', sterkte: 0.5 }] : [],
    };
  }

  /* ------------------------------------------------------------ afspelen */

  const VERLOOP = 'linear-gradient(90deg, rgba(5, 10, 20, 0.72) 0%, rgba(5, 10, 20, 0.35) 38%, rgba(5, 10, 20, 0) 60%)';
  const STIJL = `
    .film { position: fixed; inset: 0; z-index: 90; color: var(--tekst); background: #050a14; overflow: hidden; }
    /* De film is altijd donker, ook in het lichte thema (29 oktober 2026): anders donkere letters op een donkere kaart. */
    .film { color-scheme: dark; --tekst: #eef3f7; --zacht: #b8c4cf; --gedempt: #7f8e9c; --wit: 255 255 255; --glas: rgba(255, 255, 255, 0.055); --glas-rand: rgba(255, 255, 255, 0.09); --zon-t: var(--zon); --ijs-t: var(--ijs); --mint-t: var(--mint); --gloed-t: var(--gloed); --violet-t: #b7b0ff; }
    .film-lucht { position: absolute; inset: 0; opacity: 0; transition: opacity 1.6s ease; pointer-events: none; }
    .film-lucht.aan { opacity: 1; }
    .film-lucht.nacht { background: radial-gradient(120% 90% at 50% 10%, #101a33 0%, #070d18 70%); }
    .film-lucht.ochtend { background: radial-gradient(120% 90% at 20% 95%, #6a4a42 0%, #2a2f4f 50%, #0b1424 100%); }
    .film-lucht.dag { background: radial-gradient(120% 90% at 30% 15%, #2b4775 0%, #142545 55%, #0b1424 100%); }
    .film-lucht.avond { background: radial-gradient(120% 90% at 75% 92%, #7a3a3a 0%, #2e2246 50%, #0b1424 100%); }
    .film-cam { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
    .film-cam [data-film-huis] { position: relative; width: 100%; height: 100%; }
    .film-cam [data-film-huis] > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .film-waas { position: absolute; inset: 0; background: ${VERLOOP}; pointer-events: none; opacity: 0; transition: opacity 0.8s; }
    .film-waas.aan { opacity: 1; }
    .film-woord { position: absolute; left: 6vw; top: 50%; transform: translateY(-50%); max-width: min(470px, 40vw); }
    .film-woord .kicker { font-size: 15px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--zacht); }
    .film-woord .groot { margin-top: 8px; font-family: var(--kop); font-weight: 800; font-size: clamp(72px, 10.3vw, 150px); line-height: 0.9; letter-spacing: -0.045em; }
    .film-woord .zin { margin: 16px 0 0; font-family: var(--kop); font-weight: 600; font-size: clamp(22px, 2.5vw, 36px); line-height: 1.12; letter-spacing: -0.01em; }
    .film-woord > *, .film-ui .film-kop > * { animation: film-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-woord .groot, .film-ui .film-kop .groot { animation-delay: 0.08s; }
    .film-woord .zin { animation-delay: 0.2s; }
    .film-woord .groot.puls { animation: film-in 0.6s 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) both, film-puls var(--tel) ease-out 0.7s infinite; transform-origin: left center; }
    @keyframes film-in { from { opacity: 0; transform: translateY(22px); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
    @keyframes film-puls { 0% { transform: scale(1.035); } 100% { transform: scale(1); } }
    .film-ui { position: absolute; inset: 0; pointer-events: none; }
    .film-kaarten { position: absolute; right: 5.5vw; top: 50%; transform: translateY(-50%); width: 300px; display: grid; gap: 14px; }
    .film-kop .kicker { font-size: 15px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--zacht); }
    .film-kop .groot { font-family: var(--kop); font-weight: 800; font-size: 46px; letter-spacing: -0.03em; color: var(--zon); margin: 4px 0 8px; }
    .film-kaart { padding: 16px 18px; border-radius: 22px; background: rgba(14, 24, 40, 0.82); border: 1px solid rgba(255, 255, 255, 0.12); display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 14px; align-items: center; animation: film-kaart 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-kaart:nth-of-type(2) { animation-delay: 0.35s; }
    .film-kaart:nth-of-type(3) { animation-delay: 0.7s; }
    @keyframes film-kaart { from { opacity: 0; transform: translateX(40px) scale(0.96); } to { opacity: 1; transform: none; } }
    .film-kaart b { display: block; font-size: 17px; }
    .film-kaart span { display: block; font-size: 13.5px; margin-top: 2px; }
    .film-kaart svg { width: 54px; height: 54px; }
    .film-ass { position: absolute; left: 6vw; top: 50%; transform: translateY(-50%); width: min(560px, 46vw); }
    .film-ass .vraag { font-size: 18px; color: var(--zacht); font-weight: 600; animation: film-in 0.6s both; }
    .film-ass .rij { display: flex; align-items: center; gap: 26px; margin-top: 22px; }
    .film-ass .bol { width: 120px; height: 120px; flex: none; background: url('kit/zon.svg') center / contain no-repeat; animation: film-praat 0.5s ease-in-out infinite alternate; }
    @keyframes film-praat { from { transform: scale(1); } to { transform: scale(1.06); } }
    .film-ass .zegt { margin: 0; font-family: var(--kop); font-weight: 600; font-size: clamp(24px, 3vw, 40px); line-height: 1.12; letter-spacing: -0.01em; }
    .film-ass .w { color: rgba(255, 255, 255, 0.24); animation: film-woord 0.2s forwards; }
    @keyframes film-woord { to { color: var(--tekst); } }
    .film-slot { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; padding-top: 19vh; text-align: center; }
    .film-slot.aan { display: flex; }
    .film-slot .merk { display: flex; align-items: center; gap: 22px; animation: film-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-slot .merk i { width: 84px; height: 84px; border-radius: 26px; background: url('kit/icoon.svg') center / cover; box-shadow: 0 0 80px rgba(247, 181, 72, 0.3); }
    .film-slot .merk b { font-family: var(--kop); font-weight: 800; font-size: clamp(52px, 8vw, 104px); letter-spacing: -0.045em; line-height: 1; }
    .film-slot p { margin: 20px 0 0; font-family: var(--kop); font-weight: 600; font-size: clamp(22px, 2.6vw, 34px); color: var(--zacht); animation: film-in 0.9s 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-slot .knoppen { margin-top: 34px; display: flex; gap: 12px; animation: film-in 0.9s 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
    .film-slot button { height: 56px; padding: 0 28px; border-radius: 18px; font: inherit; font-weight: 700; font-size: 17px; cursor: pointer; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.08); color: var(--tekst); }
    .film-slot button[data-film-thuis] { background: var(--tekst); color: var(--inkt); border-color: transparent; }
    .film-flits { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
    .film-flits.aan { animation: film-flits 0.4s ease-out; }
    @keyframes film-flits { from { opacity: 0.3; } to { opacity: 0; } }
    .film-balk { position: absolute; left: 6vw; right: 6vw; bottom: 24px; display: flex; align-items: center; gap: 12px; }
    .film-balk button { height: 44px; min-width: 44px; padding: 0 16px; border-radius: 999px; border: 0; background: rgba(255, 255, 255, 0.08); color: var(--tekst); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-grid; place-items: center; }
    .film button:focus-visible { outline: 2px solid var(--tekst); outline-offset: 2px; }
    .film-tellen { flex: 1; display: flex; gap: 6px; }
    .film-tellen i { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); }
    .film-tellen i.al { background: var(--tekst); }
    html.tel-stand .film-waas { background: linear-gradient(180deg, rgba(5, 10, 20, 0.78) 0%, rgba(5, 10, 20, 0.4) 42%, rgba(5, 10, 20, 0) 62%); }
    html.tel-stand .film-woord, html.tel-stand .film-ass { left: 22px; right: 22px; top: 64px; transform: none; max-width: none; width: auto; }
    html.tel-stand .film-woord .groot { font-size: 76px; }
    html.tel-stand .film-woord .zin { font-size: 22px; }
    html.tel-stand .film-ass .bol { width: 72px; height: 72px; }
    html.tel-stand .film-ass .rij { gap: 18px; }
    html.tel-stand .film-ass .zegt { font-size: 24px; }
    html.tel-stand .film-kaarten { left: 22px; right: 22px; top: 56px; width: auto; transform: none; gap: 10px; }
    html.tel-stand .film-kaart { padding: 12px 14px; }
    html.tel-stand .film-kop .groot { font-size: 36px; }
    html.tel-stand .film-slot .merk { gap: 14px; }
    html.tel-stand .film-slot .merk i { width: 44px; height: 44px; border-radius: 14px; }
    html.tel-stand .film-slot .merk b { font-size: 40px; }
    html.tel-stand .film-balk { left: 20px; right: 20px; bottom: 22px; gap: 8px; }
    html.tel-stand .film-tellen { gap: 3px; }
    @media (prefers-reduced-motion: reduce) { .film *, .film-flits.aan { animation: none !important; } .film-ass .w { color: var(--tekst); } .film-lucht { transition: none; } }
  `;

  async function laad() {
    const namen = ['huis', 'zon', 'gisteren', 'weer', 'opbrengst', 'aansluiting', 'state'];
    const uit = await Promise.allSettled(['api/huis', 'api/zon', 'api/vandaag?dag=gisteren', 'api/weer', 'api/opbrengst?soort=maand', 'api/aansluiting', 'api/state'].map((p) => haal(p)));
    const d = {};
    uit.forEach((r, i) => (d[namen[i]] = r.status === 'fulfilled' ? r.value : null));
    return d;
  }

  /** Een ring zoals op de kaarten van Apparaten. */
  function ring({ deel, kleur, tekst }) {
    const o = 2 * Math.PI * 22;
    const boog = deel > 0 ? `<circle cx="27" cy="27" r="22" fill="none" stroke="${kleur}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(deel * o).toFixed(1)} ${o.toFixed(1)}" transform="rotate(-90 27 27)"/>` : `<circle cx="27" cy="27" r="22" fill="none" stroke="${kleur}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="4 6"/>`;
    return `<svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="5"/>${boog}${tekst ? `<text x="27" y="31" text-anchor="middle" font-family="Figtree, sans-serif" font-size="12" font-weight="700" fill="#EEF3F7">${esc(tekst)}</text>` : ''}</svg>`;
  }

  /** Langzaam op gang, langzaam tot stilstand. */
  const zacht = (f) => (f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2);

  async function speel({ opEinde, opGeladen } = {}) {
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
    // Minder beweging: uit de browser, of bij Weergave (besluit 164).
    const stil = (global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) || document.documentElement.classList.contains('sc-stil');

    const el = document.createElement('div');
    el.className = 'film';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', tk('film.label'));
    el.style.setProperty('--tel', `${TEL}s`);
    el.innerHTML = `${['nacht', 'ochtend', 'dag', 'avond'].map((x) => `<div class="film-lucht ${x}${x === 'nacht' ? ' aan' : ''}" data-lucht="${x}"></div>`).join('')}
      <div class="film-cam" data-film-cam><div data-film-huis></div></div>
      <div class="film-waas" data-film-waas></div>
      <div class="film-woord" aria-live="polite" data-film-tekst></div>
      <div class="film-ui" aria-live="polite" data-film-ui></div>
      <div class="film-slot" data-film-slot><div class="merk"><i aria-hidden="true"></i><b>SunArc</b></div><p>${esc(tk('film.slot.zin'))}</p><div class="knoppen"><button type="button" data-film-thuis>${esc(tk('film.slot.thuis'))}</button><button type="button" data-film-opnieuw>${esc(tk('film.slot.opnieuw'))}</button></div></div>
      <div class="film-flits" data-film-flits></div>
      <div class="film-balk"><button type="button" data-film-pauze aria-label="${esc(tk('film.pauze'))}">❚❚</button><div class="film-tellen" role="progressbar" aria-label="${esc(tk('film.voortgang'))}" aria-valuemin="0" aria-valuemax="100" data-film-tellen></div><button type="button" data-film-geluid aria-pressed="${geluidAan}">${esc(tk(geluidAan ? 'film.geluidAan' : 'film.geluidUit'))}</button><button type="button" data-film-klaar>${esc(tk('rond.overslaan'))}</button></div>`;
    document.body.append(el);
    el.querySelector('[data-film-klaar]').focus();

    const d = await laad();
    opGeladen?.();
    const c = cijfers(d);
    const lijst = beelden(d);
    const totaalMaten = lijst.reduce((s, b) => s + b.maten, 0);
    const totaal = totaalMaten * MAAT_MS;
    const dropMaat = lijst.find((b) => b.drop).vanaf;
    const slotMaat = lijst.at(-1).vanaf;
    const plan = { intro: Math.min(lijst[0].maten + lijst[1].maten, dropMaat - 1), drop: dropMaat, slot: slotMaat, eind: totaalMaten };
    klank?.begin(plan);

    let gepauzeerd = false;
    let laatste = performance.now();
    let beeldNu = -1;
    let gestopt = false;
    let uitgespeeld = false;
    let sluiten = null;
    let stap = 0;
    let cam = null;

    const camEl = el.querySelector('[data-film-cam]');
    const huisEl = el.querySelector('[data-film-huis]');
    const tekstEl = el.querySelector('[data-film-tekst]');
    const uiEl = el.querySelector('[data-film-ui]');
    const flits = el.querySelector('[data-film-flits]');
    const tellen = el.querySelector('[data-film-tellen]');
    tellen.innerHTML = '<i></i>'.repeat(totaalMaten);
    const telStand = () => document.documentElement.classList.contains('tel-stand');
    const lucht = (tijd) => el.querySelectorAll('[data-lucht]').forEach((x) => x.classList.toggle('aan', x.dataset.lucht === tijd));

    /** Waar een kamer of het dak in de tekening staat, als deel van het scherm. */
    function anker(b, W, H) {
      const vak = (ids) => {
        const r = ids.map((id) => huisEl.querySelector(`.sc-tik[data-kamer="${CSS.escape(String(id))}"]`)?.getBoundingClientRect()).filter(Boolean);
        if (!r.length) return null;
        const l = Math.min(...r.map((x) => x.left)), o = Math.min(...r.map((x) => x.top)), re = Math.max(...r.map((x) => x.right)), on = Math.max(...r.map((x) => x.bottom));
        return { x: (l + re) / 2, y: o, h: on - o };
      };
      const v = b.anker === 'dak' ? vak(c.bovenste ? binnenIn(c.bovenste).map((r) => r.id) : []) : b.anker === 'zonKamer' ? vak(c.zonKamer ? [c.zonKamer.id] : c.bovenste ? binnenIn(c.bovenste).map((r) => r.id) : []) : null;
      if (!v) return null;
      return [v.x / W, (v.y + v.h * (b.anker === 'dak' ? 0.3 : 0.5)) / H];
    }

    /** De camera van een shot, met de plek op de telefoon: het huis onder de woorden. */
    function camVan(b, W, H) {
      const p = anker(b, W, H);
      const onder = { apparaten: 0.8, assistent: 0.74 }[b.soort] ?? 0.7;
      return b.cam.map(([s, pp, q]) => [telStand() ? Math.min(s * 1.6, 2.4) : s, p ?? pp, telStand() && b.soort !== 'opkomst' && b.soort !== 'slot' ? [0.5, onder] : q]);
    }

    function camera(f) {
      if (!cam) return;
      const { W, H, van, naar } = cam;
      const e = stil ? 1 : zacht(Math.max(0, Math.min(1, f)));
      const tus = (a, z) => a + (z - a) * e;
      const s = tus(van[0], naar[0]);
      const p = [tus(van[1][0], naar[1][0]), tus(van[1][1], naar[1][1])];
      const q = [tus(van[2][0], naar[2][0]), tus(van[2][1], naar[2][1])];
      camEl.style.transform = `translate(${(q[0] * W - s * p[0] * W).toFixed(1)}px, ${(q[1] * H - s * p[1] * H).toFixed(1)}px) scale(${s.toFixed(4)})`;
    }

    function woorden(b) {
      if (!b.tekst) return '';
      const puls = !stil && (b.drop || (beeldNu > lijst.findIndex((x) => x.drop) && b.soort !== 'slot'));
      return `<div class="kicker">${esc(b.tekst.kicker)}</div><div class="groot${puls ? ' puls' : ''}" style="color: ${b.tekst.kleur ?? 'var(--tekst)'}">${esc(b.tekst.groot)}</div><p class="zin">${esc(b.tekst.zin)}</p>`;
    }

    function stukken(b) {
      if (b.soort === 'apparaten') {
        const kop = c.overKw >= 0.1 ? `<div class="film-kop"><div class="kicker">${esc(tk('film.app.kicker'))}</div><div class="groot">${esc(tk('film.app.over', { kw: nl(c.overKw) }))}</div></div>` : `<div class="film-kop"><div class="kicker">${esc(tk('film.app.kicker'))}</div><div class="groot">${esc(tk('film.app.groot'))}</div></div>`;
        return `<div class="film-kaarten">${kop}${c.kaarten.map((k) => `<div class="film-kaart">${ring({ ...k, tekst: k.ring })}<div><b>${esc(k.naam)}</b><span class="${k.toon}">${esc(k.zin)}</span></div></div>`).join('')}</div>`;
      }
      if (b.soort === 'assistent') {
        const w = b.assistent.zegt.split(' ');
        const stapje = Math.min(0.28, (b.maten * MAAT - 1.6) / w.length);
        return `<div class="film-ass"><div class="vraag">${esc(b.assistent.vraag)}</div><div class="rij"><span class="bol" aria-hidden="true"></span><p class="zegt">${w.map((x, j) => `<span class="w" style="animation-delay: ${(0.9 + j * stapje).toFixed(2)}s">${esc(x)}</span>`).join(' ')}</p></div></div>`;
      }
      return '';
    }

    function naarBeeld(i) {
      beeldNu = i;
      stap = 0;
      const b = lijst[i];
      const W = innerWidth, H = innerHeight;
      lucht(b.tijd);
      // Tekenen zonder camera, de kamers opmeten, en dan de vlakken om op te tikken weg: de film is om te kijken.
      camEl.style.willChange = 'auto';
      camEl.style.transform = 'none';
      // Op de telefoon zonder namen in het huis, zoals op Thuis.
      const mo = model(d, c, b);
      if (telStand()) mo.etages = mo.etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) }));
      global.huis.teken(huisEl, mo, { breedte: W, hoogte: H, marge: 0.12, tik: true });
      const [van, naar] = camVan(b, W, H);
      huisEl.querySelectorAll('.sc-tik').forEach((x) => x.remove());
      cam = { W, H, van, naar };
      camera(0);
      requestAnimationFrame(() => (camEl.style.willChange = 'transform'));
      tekstEl.innerHTML = woorden(b);
      uiEl.innerHTML = stukken(b);
      el.querySelector('[data-film-waas]').classList.toggle('aan', !!b.tekst || b.soort === 'assistent' || (b.soort === 'apparaten' && telStand()));
      el.querySelector('[data-film-slot]').classList.toggle('aan', b.soort === 'slot');
      if (b.drop && !stil) {
        flits.classList.remove('aan');
        void flits.offsetWidth;
        flits.classList.add('aan');
      }
    }

    /** Binnen een shot: in de opkomst komt de ochtend. */
    function binnenBeeld(b, f) {
      if (b.soort === 'opkomst' && stap === 0 && f > 0.35) {
        stap = 1;
        lucht('ochtend');
      }
    }

    function stop() {
      if (gestopt) return;
      gestopt = true;
      clearTimeout(sluiten);
      klank?.stop();
      el.remove();
      removeEventListener('keydown', toets);
      removeEventListener('resize', opnieuwTekenen);
      opEinde?.();
    }

    function opnieuw() {
      clearTimeout(sluiten);
      t = 0;
      uitgespeeld = false;
      beeldNu = -1;
      klank?.spoel();
      klank?.begin(plan);
      pauze(false);
    }

    function tik(nu) {
      if (gestopt) return;
      if (!gepauzeerd && !uitgespeeld) t += nu - laatste;
      laatste = nu;
      if (t >= totaal && !uitgespeeld) {
        // Het slot blijft staan tot je kiest, en sluit na een poos vanzelf.
        uitgespeeld = true;
        t = totaal;
        sluiten = setTimeout(stop, 20_000);
      }
      const m = Math.min(totaalMaten - 0.001, t / MAAT_MS);
      let i = lijst.findIndex((b) => m >= b.vanaf && m < b.vanaf + b.maten);
      if (i < 0) i = lijst.length - 1;
      if (i !== beeldNu) naarBeeld(i);
      const f = (m - lijst[i].vanaf) / lijst[i].maten;
      binnenBeeld(lijst[i], f);
      camera(f);
      const al = Math.floor(m) + 1;
      tellen.querySelectorAll('i').forEach((x, j) => x.classList.toggle('al', j < al));
      tellen.setAttribute('aria-valuenow', String(Math.round((t / totaal) * 100)));
      requestAnimationFrame(tik);
    }

    function opnieuwTekenen() {
      if (beeldNu >= 0) naarBeeld(beeldNu);
    }

    function pauze(p) {
      gepauzeerd = p;
      klank?.pauze(p);
      el.querySelectorAll('.film-woord *, .film-ui *, .film-slot *').forEach((x) => (x.style.animationPlayState = p ? 'paused' : ''));
      const k = el.querySelector('[data-film-pauze]');
      k.textContent = p ? '▶' : '❚❚';
      k.setAttribute('aria-label', tk(p ? 'film.verder' : 'film.pauze'));
    }
    function toets(e) {
      if (e.key === 'Escape') stop();
      else if (e.key === ' ' && !e.target.closest?.('button')) {
        e.preventDefault();
        pauze(!gepauzeerd);
      }
    }
    addEventListener('keydown', toets);
    addEventListener('resize', opnieuwTekenen);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-film-klaar') || b.hasAttribute('data-film-thuis')) stop();
      else if (b.hasAttribute('data-film-opnieuw')) opnieuw();
      else if (b.hasAttribute('data-film-pauze')) pauze(!gepauzeerd);
      else if (b.hasAttribute('data-film-geluid')) {
        geluidAan = !geluidAan;
        klank?.zet(geluidAan);
        b.textContent = tk(geluidAan ? 'film.geluidAan' : 'film.geluidUit');
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
      soorten: lijst.map((b) => b.soort),
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
