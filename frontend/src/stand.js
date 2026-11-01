/*
 * Hoe het huis ervoor staat (besluit 130): wat er nog mist in de instellingen,
 * en waar elke instelling staat om ernaar te zoeken. Voor de hoofdpagina van
 * Instellingen en voor Wat je huis kan; uit wat de dienst al geeft.
 */
'use strict';

(function (global) {
  /** Waar elke groep staat. */
  const GROEPEN = {
    huis: 'indeling.html',
    comfort: 'comfort.html',
    energie: 'energie.html',
    regeling: 'regeling.html',
    functies: 'functies.html',
    assistent: 'functies.html?groep=assistent',
    // Inrichten, stap voor stap, als tegel (0.90.1).
    inrichten: 'inrichten.html',
    toegang: 'toegang.html',
  };

  /**
   * Wat er nog mist: elk met waarom het telt en een knop ernaartoe. Alleen wat
   * SunArc echt nodig heeft; wat erbij kan, staat bij Wat je huis kan.
   */
  function nogTeDoen(d) {
    const t = global.taal.t;
    const uit = [];
    const e = d.energie?.instellingen;
    const p = e?.prijzen;
    // Een huis zonder slimme meter (besluit 196) mist geen meter van het net: dan alleen als er helemaal niets gekozen is.
    const geenP1 = d.site?.meter === false;
    if (d.energie && (e == null || ((e.net?.afname ?? []).length === 0 && !(geenP1 && ((e.zon ?? []).length || (e.apparaten ?? []).length))))) {
      uit.push({ id: 'meters', groep: 'energie', wat: t('stand.meters'), waarom: t('stand.metersZin'), knop: t('stand.kiezen'), href: 'energie.html#meters' });
    }
    if (e && p?.stroom == null) {
      uit.push({ id: 'stroomprijs', groep: 'energie', wat: t('stand.stroomprijs'), waarom: t('stand.stroomprijsZin'), knop: t('stand.invullen'), href: 'energie.html#prijzen' });
    }
    if (e && e.gas && p?.gas == null) {
      uit.push({ id: 'gasprijs', groep: 'energie', wat: t('stand.gasprijs'), waarom: t('stand.gasprijsZin'), knop: t('stand.invullen'), href: 'energie.html#prijzen' });
    }
    const a = d.aansluiting;
    if (a && a.antwoorden?.zekering == null && a.configuratie?.zekering == null) {
      uit.push({ id: 'zekering', groep: 'energie', wat: t('stand.zekering'), waarom: t('stand.zekeringZin'), knop: t('stand.kiezen'), href: 'energie.html#aansluiting' });
    }
    if (a && a.antwoorden?.panelen?.ligging == null && !(a.configuratie?.panelen ?? []).length && !['bevestigd', 'configuratie'].includes(a.ligging?.stand)) {
      uit.push({ id: 'panelen', groep: 'energie', wat: t('stand.panelen'), waarom: t('stand.panelenZin'), knop: t('stand.kiezen'), href: 'energie.html#panelen' });
    }
    const zonder = d.huis?.zonderRuimte?.length ?? 0;
    if (zonder > 0) {
      const namen = d.huis.zonderRuimte.slice(0, 2).map((x) => x.naam).join(` ${t('algemeen.en')} `);
      uit.push({ id: 'indelen', groep: 'huis', wat: t('stand.indelen.wat', { n: zonder }), waarom: t(zonder > 2 ? 'stand.indelen.zinMeer' : 'stand.indelen.zin', { namen }), knop: t('stand.indelen'), href: 'indeling.html' });
    }
    return uit;
  }

  /**
   * Om te zoeken: elke instelling, met de woorden waarop je hem vindt, in de
   * taal van de app (kit/teksten.*.js, zoek.<id>). Het adres wijst naar het
   * deel van de groep; waar is een groep of een eigen plek (zoek.waar.*).
   */
  const ZOEK = [
    ['temperatuur', 'comfort', 'comfort.html'],
    ['plafond', 'comfort', 'comfort.html'],
    ['dagdelen', 'comfort', 'comfort.html#dagdelen'],
    ['afwezig', 'comfort', 'comfort.html#afwezig'],
    ['panelen', 'energie', 'energie.html#panelen'],
    ['zekering', 'energie', 'energie.html#aansluiting'],
    ['meters', 'energie', 'energie.html#meters'],
    ['prijzen', 'energie', 'energie.html#prijzen'],
    ['verwarming', 'energie', 'energie.html#verwarming'],
    ['regelt', 'regeling', 'regeling.html'],
    ['opzon', 'regeling', 'regeling.html#opzon'],
    ['kamers', 'huis', 'indeling.html'],
    ['meten', 'huis', 'indeling.html'],
    ['cameras', 'functies', 'functies.html#cameras'],
    ['deurbel', 'functies', 'functies.html#deurbel'],
    ['licht', 'functies', 'functies.html#licht'],
    ['weer', 'functies', 'functies.html#weer'],
    ['weergave', 'zoek.waar.thuis', 'thuis.html#weergave'],
    ['aod', 'zoek.waar.weergave', 'functies.html#aod'],
    ['uit', 'zoek.waar.weergave', 'functies.html#uit'],
    ['scherm', 'zoek.waar.weergave', 'functies.html#scherm'],
    ['meldingen', 'functies', 'functies.html#meldingen'],
    ['praten', 'assistent', 'functies.html?groep=assistent#praten'],
    ['stem', 'assistent', 'functies.html?groep=assistent#stem'],
    ['tedoen', 'assistent', 'functies.html?groep=assistent#tedoen'],
    ['bewoners', 'toegang', 'bewoners.html'],
    ['eigen', 'toegang', 'bewoners.html'],
    ['inloggen', 'toegang', 'toegang.html#bewoners'],
    ['sleutel', 'toegang', 'toegang.html#assistent'],
    ['thema', 'zoek.waar.jij', 'jij.html'],
    ['export', 'toegang', 'toegang.html#gegevens'],
    ['batterijen', 'zoek.waar.thuis', 'thuis.html#batterijen'],
    ['warmte', 'huis', 'indeling.html'],
    ['naam', 'huis', 'indeling.html'],
    ['kan', 'zoek.waar.instellingen', 'huis-kan.html'],
    ['voortgang', 'zoek.waar.instellingen', 'voortgang.html'],
    ['versie', 'toegang', 'toegang.html#versie'],
  ];
  const zoekLijst = () => {
    const t = global.taal.t;
    return ZOEK.map(([id, waar, href]) => ({ titel: t(`zoek.${id}`), waar: t(waar.includes('.') ? waar : `groep.${waar}`), href, woorden: t(`zoek.${id}.woorden`) }));
  };

  /*
   * Zoeken (besluit 132): op losse woorden, het begin van een woord, zonder
   * accenten en zonder meervoud. Behalve de vaste lijst ook de kamers en
   * apparaten van dit huis en alles uit Wat je huis kan, als `d` er is.
   */
  const plat = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  const stam = (w) => (w.length > 5 ? w.replace(/(tjes|jes|en|s)$/, '') : w);
  const woordenVan = (t) => plat(t).split(/\s+/).filter(Boolean).map(stam);
  function lijstVoor(d) {
    const uit = zoekLijst();
    if (!d) return uit;
    for (const x of kan(d)) uit.push({ titel: x.titel, waar: global.taal.t('zoek.kan'), href: `huis-kan.html#${x.id}`, woorden: `${x.wat ?? ''} ${x.nu ?? ''}` });
    for (const e of d.huis?.etages ?? []) {
      for (const r of e.ruimtes ?? []) {
        uit.push({ titel: r.naam, waar: global.taal.t('stand.kamerIn', { etage: e.naam }), href: `indeling.html#${encodeURIComponent(r.id)}`, woorden: global.taal.t('stand.kamerWoord') });
        for (const a of r.apparaten ?? []) uit.push({ titel: a.naam, waar: r.naam, href: `kamer.html#${encodeURIComponent(r.id)}/${encodeURIComponent(a.id)}`, woorden: `${a.haNaam ?? ''} ${a.soort}` });
      }
    }
    return uit;
  }
  function zoek(tekst, d) {
    const vraag = woordenVan(tekst).filter((w) => w.length >= 2);
    if (!vraag.length || plat(tekst).trim().length < 2) return [];
    // Ook midden in een samengesteld woord: "zekering" in "hoofdzekering".
    const past = (w, lijst) => lijst.some((x) => x.startsWith(w) || (w.length >= 4 && x.includes(w)) || (w.length >= 4 && x.length >= 4 && w.startsWith(x)));
    const gezien = new Set();
    return lijstVoor(d)
      .map((z) => {
        const titel = woordenVan(z.titel);
        const rest = woordenVan(z.woorden ?? '');
        let score = 0;
        for (const w of vraag) score += past(w, titel) ? 3 : past(w, rest) ? 1 : -10;
        return { z, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.z)
      // Dezelfde titel één keer: de vaste lijst gaat voor.
      .filter((z) => (gezien.has(plat(z.titel)) ? false : gezien.add(plat(z.titel))))
      .slice(0, 7);
  }

  /* ------------------------------------------------- wat je huis kan */

  const LABEL = (s) => (['werkt', 'leert', 'kijkt', 'uit'].includes(s) ? global.taal.t(`stand.label.${s}`) : null);

  /**
   * Wat een thuisbatterij zou opleveren (besluit 230): het afgelopen jaar per
   * uur nagerekend door de dienst (`api/accu`). Welke maat past, wat die zelf
   * had geleverd, wat er toch van het net kwam, en wanneer hij bijsprong.
   * Zolang er gesaldeerd wordt bijna niets; vanaf 2027 het verschil tussen je
   * stroomprijs en wat je voor teruglevering krijgt, plus de terugleverkosten.
   * Per maand: het gemiddelde over het jaar. Een schatting.
   */
  function batterijSom(d) {
    const a = d.accu;
    const p = d.energie?.instellingen?.prijzen;
    if (!a || p?.stroom == null || !(a.dagen > 0)) return null;
    const na2027 = p.stroom - (p.vanaf2027?.vergoeding ?? 0) + (p.vanaf2027?.kosten ?? 0);
    const perMaand = (a.gedektKwh / a.dagen) * (365 / 12);
    if (perMaand < 1 || na2027 <= 0) return null;
    const groter = a.maten.find((m) => m.kwh > a.aanbevolenKwh) ?? null;
    return {
      kwh: a.aanbevolenKwh,
      euro: Math.round(perMaand * na2027),
      dagen: a.dagen,
      vanNetKwh: Math.round(a.vanNetKwh),
      gedektKwh: Math.round(a.gedektKwh),
      tekortKwh: Math.round(a.tekortKwh),
      legeDagen: a.legeDagen,
      uren: a.uren,
      groter: groter ? { kwh: groter.kwh, meerKwh: Math.round(groter.gedektKwh - a.gedektKwh) } : null,
    };
  }

  /**
   * Hoe je huis warmte vasthoudt (besluit 231): wat de dienst per kamer heeft
   * geleerd (`api/thermisch`), en wat het nog nodig heeft. Een apparaat zonder
   * getal is nog niet gezien, of doet nog niets merkbaars.
   */
  function thermischRegel(d) {
    const t = global.taal.t;
    const r = d.thermisch;
    const zones = r?.zones ?? [];
    const kent = zones.length > 0 && zones.every((z) => z.zeker.afkoelen >= 3);
    const wacht = zones.flatMap((z) => z.apparaten.filter((a) => a.perUur == null));
    const uren = Math.max(0, ...zones.map((z) => z.rustUren));
    const nu = !r ? t('kan.thermisch.nu') : !kent ? t('kan.thermisch.uren', { n: uren }) : wacht.some((a) => a.stand === 'warmt') ? t('kan.thermisch.wachtWarmen') : wacht.length ? t('kan.thermisch.wachtKoelen') : t('kan.thermisch.kent');
    const nodig = [
      ...(kent ? [] : [t('kan.thermisch.nodig.nachten')]),
      ...[...new Map(wacht.map((a) => [`${a.id}:${a.stand}`, a])).values()].map((a) => t(a.kwartieren >= 8 ? 'kan.thermisch.nodig.onduidelijk' : `kan.thermisch.nodig.${a.stand}`, { naam: a.naam })),
    ];
    const sinds = r?.sindsMs ? new Date(r.sindsMs).toLocaleDateString(global.taal.code === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long' }) : null;
    return {
      ...teksten('thermisch'),
      groep: 'leert',
      stand: r?.stand === 'werkt' ? 'werkt' : 'leert',
      nu,
      href: 'huis-kan.html#thermisch',
      // Op Wat je huis kan wijst het blad door naar wat het straks doet.
      ga: t('kan.optijd'),
      gaHref: 'huis-kan.html#optijd',
      // Hoe ver het leren is, voor de waaier: afkoelen, zon en de beste warmer per kamer.
      deel: zones.length ? zones.reduce((t, z) => t + (z.zeker.afkoelen + z.zeker.zon + Math.max(0, ...z.apparaten.filter((a) => a.stand === 'warmt').map((a) => a.zeker))) / 12, 0) / zones.length : 0,
      thermisch: zones.length ? r : null,
      extra: [sinds && uren ? t('kan.thermisch.sinds', { datum: sinds, n: uren }) : '', zones.length ? t('kan.thermisch.perUur') : ''].filter(Boolean).join(' ') || null,
      wanneer: nodig.length ? nodig.slice(0, 3) : [t('kan.thermisch.nodig.niets')],
      wanneerKop: t('kan.thermisch.nodigKop'),
    };
  }

  /*
   * Waar het werkt (besluit 132): niet hoeveel er ontbreekt, maar in welke
   * kamers. Wat er nog bij kan, is een idee, en staat apart.
   */
  const binnen = (d) => (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten').flatMap((e) => e.ruimtes ?? []);
  const klimaatIn = (r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat');
  /** Een kamer met eigen warmte: een thermostaat, een radiatorknop of een slimme bron die geen airco is. */
  const warmtPerKamer = (r) => klimaatIn(r).some((a) => a.radiatorknop || (a.klimaat?.kanVerwarmen && !a.klimaat?.kanKoelen)) || (r.bronnen ?? []).some((b) => b.aan !== 'hand' && b.soorten.some((x) => x !== 'airco'));
  const aircoIn = (r) => klimaatIn(r).filter((a) => a.klimaat?.kanKoelen);
  const opZonIn = (r) => (r.bronnen ?? []).filter((b) => b.opZon);
  const warmteVan = (r) => [...(r.bronnen ?? []).filter((b) => b.soorten.some((x) => x !== 'airco')).map((b) => huismodel.bronNaam(b).toLowerCase()), ...klimaatIn(r).filter((a) => a.radiatorknop).map(() => global.taal.t('kan.radiatorknop'))];

  /**
   * Wat je huis nog slimmer maakt (besluit 132), de grootste winst eerst: wat
   * het al kan maar uit staat, dan wat je eigen meters uitrekenen, dan wat er
   * te koop is. Een bedrag alleen als de meters het kunnen uitrekenen.
   */
  function ideeen(d) {
    const t = global.taal.t;
    const uit = [];
    for (const r of binnen(d)) {
      for (const b of r.bronnen ?? []) {
        if (huismodel.isElektrischSlim(b) && b.vermogenW && b.apparaat && !b.opZon) uit.push({ id: `zon-${r.id}`, soort: 'aan', titel: t('kan.idee.zon', { kamer: huismodel.metHoofdletter(huismodel.zoneNaam(r.zoneId ?? r.id, d.huis)) }), zin: t('kan.idee.zonZin', { bron: huismodel.bronNaam(b).toLowerCase() }), wint: t('kan.idee.zonWint'), href: `indeling.html#${encodeURIComponent(r.id)}/warmte` });
      }
    }
    const accu = batterijSom(d);
    if (accu) uit.push({ id: 'batterij', soort: 'som', titel: t('kan.idee.batterij'), zin: t('kan.idee.batterijZin'), euro: accu.euro, wint: t('kan.idee.batterijWint'), href: 'opbrengst.html' });
    for (const r of binnen(d)) {
      for (const b of r.bronnen ?? []) {
        if (b.aan === 'hand' && b.soorten.some((x) => huismodel.ELEKTRISCH.has(x))) uit.push({ id: `slim-${r.id}-${b.id}`, soort: 'koop', titel: t('kan.idee.slim', { bron: huismodel.bronNaam(b).toLowerCase(), kamer: r.naam }), zin: t('kan.idee.slimZin'), wint: t('kan.idee.slimWint'), href: `indeling.html#${encodeURIComponent(r.id)}/warmte` });
      }
    }
    const zonderMeting = binnen(d).filter((r) => r.temperatuurC == null && !huismodel.GANG.test(r.naam));
    if (zonderMeting.length) uit.push({ id: 'meten', soort: 'koop', titel: zonderMeting.length === 1 ? t('kan.idee.meten', { kamer: zonderMeting[0].naam }) : t('kan.idee.metenN', { n: zonderMeting.length }), zin: t('kan.idee.metenZin'), wint: t('kan.idee.metenWint'), href: 'indeling.html' });
    return uit;
  }

  /** Hoeveel regels "Zo werkt het" en "Wanneer het werkt" elk onderwerp heeft (kan.<id>.zo.<n>). */
  const REGELS = { ligging: [3, 3], boiler: [3, 2], jacuzzi: [3, 2], temperatuur: [3, 2], thermisch: [2, 2], optijd: [3, 2], perkamer: [3, 2], gevoel: [2, 1], opzon: [3, 2], apparaten: [3, 2], batterij: [3, 1], goedkoop: [2, 1], auto: [2, 1], licht: [2, 2], screens: [2, 1], afwezig: [2, 1], vraag: [2, 1], opbrengst: [2, 1], zekering: [2, 1], sluip: [2, 1], camera: [2, 1], batterijen: [2, 1], weer: [2, 1], tedoen: [3, 2] };
  /** De vaste teksten van een onderwerp: de titel, wat het is, hoe en wanneer. */
  function teksten(id) {
    const t = global.taal.t;
    const [zo, wanneer] = REGELS[id];
    const reeks = (soort, n) => Array.from({ length: n }, (_, i) => t(`kan.${id}.${soort}.${i + 1}`));
    return { id, titel: t(`kan.${id}`), wat: t(`kan.${id}.wat`), zo: reeks('zo', zo), wanneer: reeks('wanneer', wanneer) };
  }

  /**
   * Alles wat SunArc voor je doet, per onderwerp, met een stand: werkt,
   * kijkt mee (de schaduw, besluit 64: tot het zelf regelt), leert nog, staat
   * uit, vul in (een instelling mist) of nodig (er hoort iets bij). De regel
   * "nu" zegt wat het op dit moment doet. Alleen wat bij dit huis kan bestaan.
   */
  function kan(d) {
    const t = global.taal.t;
    const alles = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
    const acts = d.site?.actuators ?? [];
    // Een huis zonder slimme regeling (besluit 194): geen kamers die de app regelt.
    const geenRegeling = d.site != null && (d.site.zones ?? []).length === 0;
    const airco = acts.some((x) => x.capabilities?.canCool);
    const panelen = (d.zon?.panelen ?? []).length > 0 || (d.aansluiting?.configuratie?.panelen ?? []).length > 0;
    // Klimaat kijkt mee tot het zelf regelt (besluit 64); dan wordt het "werkt".
    const meekijk = 'kijkt';
    const kamers = d.state?.bewoner?.kamers ?? [];
    const f = d.functies?.instellingen ?? d.functies?.voorstel;
    const e = d.energie?.instellingen;
    const p = e?.prijzen;
    const winter = d.divergence?.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
    const bewijs = winter ? t('kan.winterdagen', { n: winter.dagen, doel: winter.doel }) : null;
    const lampenAan = alles.filter((x) => x.soort === 'licht' && x.aan).length;
    const screens = alles.filter((x) => x.soort === 'screen');
    const leegB = (d.huis?.batterijen ?? []).filter((b) => app.bijnaOp(b.pct, 'batterij', d.huis)).length;
    const volF = (d.huis?.filters ?? []).length;
    const z = d.aansluiting?.antwoorden?.zekering ?? d.aansluiting?.configuratie?.zekering;
    const opZon = Object.values(d.aansluiting?.antwoorden?.opZon ?? {}).filter(Boolean).length + (d.aansluiting?.configuratie?.apparaten?.length ?? 0);
    const kanOpZon = (d.aansluiting?.gevonden?.apparaten ?? []).length;
    const accu = batterijSom(d);
    const kop = d.state?.bewoner?.kop?.titel;
    const weerNaam = (d.functies?.gevonden?.weerbronnen ?? []).find((b) => b.id === f?.weer?.bron)?.naam?.replace(' (via internet)', '');
    const dagen = d.divergence?.dataset?.dagenOpgenomen != null ? Math.round(d.divergence.dataset.dagenOpgenomen) : null;
    // Zonder slimme meter (besluit 196): op zon en het sluipverbruik kunnen erbij; Opbrengst schat.
    const geenP1 = d.site?.meter === false;
    const geschat = geenP1 && (e?.zon ?? []).length > 0;
    const zonderMeter = d.energie && (e?.net?.afname ?? []).length === 0 && !geschat;
    const zonderPrijs = d.energie && !zonderMeter && p?.stroom == null;
    // Waar het werkt (besluit 132).
    const geregeld = binnen(d).filter((r) => r.zoneId);
    const perKamer = binnen(d).filter(warmtPerKamer);
    const opZonKamers = binnen(d).filter((r) => aircoIn(r).length || opZonIn(r).length);
    const idee = ideeen(d);
    // De boiler en de jacuzzi (besluit 186), met hun temperatuur; en hoe de panelen liggen (157).
    const buffer = (soort) => alles.find((x) => x.warmte?.soort === soort);
    const warmteNu = (x) => {
      const w = x.warmte;
      if (w.tempC == null) return t('kan.warmte.onbekend');
      return w.doelC != null && w.doelC > w.tempC ? t('kan.warmte.naar', { temp: w.tempC, doel: w.doelC }) : t('kan.warmte.temp', { temp: w.tempC });
    };
    const opZonAan = (x) => d.aansluiting?.antwoorden?.opZon?.[x.id] === true || (d.aansluiting?.configuratie?.apparaten ?? []).some((a) => a.id === x.id);
    const lig = d.aansluiting?.ligging;
    const ligStand = !lig || !panelen ? null : lig.stand === 'wachten' ? 'leert' : lig.stand === 'voorstel' ? 'mis' : 'werkt';

    const lijst = [
      // Comfort
      {
        ...teksten('temperatuur'), groep: 'comfort', stand: acts.length ? meekijk : 'nodig', label: acts.length ? null : t('kan.temperatuur.nodig'),
        nu: geregeld.length ? huismodel.inKamers(geregeld.map((r) => r.naam)) : t('kan.temperatuur.nu'), href: 'comfort.html',
        waar: geregeld.map((r) => ({ naam: r.naam, wat: kamers.find((k) => k.zoneId === r.zoneId)?.kort ?? (r.temperatuurC != null ? `${global.taal.getal(r.temperatuurC, Number.isInteger(r.temperatuurC) ? 0 : 1)}°` : '') })),
        extra: bewijs ? t('kan.temperatuur.extra', { bewijs }) : null,
      },
      // Hoe je huis warmte vasthoudt (besluit 231): het thermisch model, uit het logboek.
      ...(geenRegeling ? [] : [thermischRegel(d)]),
      // Zonder slimme regeling (besluit 194) is er niets om te leren of per kamer te regelen: het kan erbij.
      geenRegeling
        ? { ...teksten('optijd'), groep: 'leert', stand: 'nodig', label: t('kan.temperatuur.nodig'), nu: t('kan.zonderRegeling'), href: 'huis-kan.html#temperatuur' }
        : { ...teksten('optijd'), groep: 'leert', stand: 'leert', nu: d.thermisch?.stand === 'leert' ? t('kan.optijd.wacht') : dagen ? t('kan.optijd.dagen', { n: dagen }) : t('kan.optijd.nu'), href: 'vandaag.html' },
      {
        ...teksten('perkamer'), groep: 'comfort', stand: perKamer.length && !geenRegeling ? meekijk : 'nodig', label: perKamer.length && !geenRegeling ? null : t('kan.perkamer.nodig'),
        nu: perKamer.length && !geenRegeling ? huismodel.inKamers(perKamer.map((r) => r.naam)) : t('kan.perkamer.nu'), href: 'indeling.html',
        waar: perKamer.map((r) => ({ naam: r.naam, wat: warmteVan(r).join(', ') || t('kan.thermostaat') })),
        idee: idee.find((x) => x.soort === 'koop' && x.id.startsWith('slim-')) ?? null,
      },
      { ...teksten('gevoel'), groep: 'leert', stand: 'werkt', nu: t('kan.gevoel.nu'), href: 'thuis.html' },
      // Wat het huis eerst leert (besluit 187): ook hoe de panelen liggen.
      ...(ligStand ? [{
        ...teksten('ligging'), groep: 'leert', stand: ligStand, label: ligStand === 'mis' ? t('kan.ligging.klopt') : null,
        nu: ligStand === 'leert' ? t('kan.ligging.wacht') : lig.nu ? `${lig.nu.richting}, ${lig.nu.vermogenKort ?? lig.nu.vermogen}` : t('kan.ligging.voorstel'), href: 'energie.html#panelen',
      }] : []),
      // Op zon
      ...(airco ? [{
        ...teksten('opzon'), groep: 'zon', stand: panelen && !geenP1 ? meekijk : 'nodig', label: !panelen ? t('kan.opzon.nodig') : geenP1 ? t('kan.meterNodig') : null,
        nu: geenP1 && panelen ? t('kan.zonderMeter') : panelen && opZonKamers.length ? huismodel.inKamers(opZonKamers.map((r) => r.naam)) : panelen ? (kop ?? t('kan.opzon.wacht')) : t('kan.opzon.nu'), href: 'vandaag.html',
        waar: opZonKamers.map((r) => ({ naam: r.naam, wat: [...aircoIn(r).map((a) => t(a.klimaat?.kanVerwarmen ? 'kan.opzon.koeltWarmt' : 'kan.opzon.koelt')), ...opZonIn(r).map((b) => t('kan.opzon.warmtOpZon', { bron: huismodel.bronNaam(b).toLowerCase() }))].join(' · ') })),
        idee: idee.find((x) => x.soort === 'aan') ?? null,
      }] : []),
      {
        // Zonder panelen of zonder slimme meter kan dit niet (besluit 196).
        ...teksten('apparaten'), groep: 'zon', stand: !panelen || geenP1 ? 'nodig' : opZon ? meekijk : kanOpZon ? 'uit' : 'nodig', label: !panelen ? t('kan.opzon.nodig') : geenP1 ? t('kan.meterNodig') : opZon || kanOpZon ? null : t('kan.apparaten.nodig'),
        nu: !panelen ? t('kan.zonderPanelen') : geenP1 ? t('kan.zonderMeter') : t(opZon ? 'kan.apparaten.start' : kanOpZon ? 'kan.apparaten.zetAan' : 'kan.apparaten.nu'), href: geenP1 ? 'energie.html#meters' : 'regeling.html#opzon',
      },
      ...['boiler', 'jacuzzi'].flatMap((soort) => {
        const x = buffer(soort);
        return x ? [{ ...teksten(soort), groep: 'zon', stand: opZonAan(x) ? meekijk : 'uit', nu: warmteNu(x), href: 'apparaten.html' }] : [];
      }),
      // Kosten
      { ...teksten('batterij'), groep: 'kosten', stand: 'nodig', label: t('kan.batterij.nodig'), nu: accu ? t('kan.batterij.som', { euro: accu.euro, kwh: global.taal.getal(accu.kwh, accu.kwh % 1 ? 1 : 0) }) : t('kan.idee.batterijZin'), href: 'opbrengst.html', som: accu },
      ...(d.aansluiting?.antwoorden?.tarief !== 'dynamisch' ? [{ ...teksten('goedkoop'), groep: 'kosten', stand: 'nodig', label: t('kan.goedkoop.nodig'), nu: t('kan.goedkoop.nu'), href: 'energie.html#prijzen' }] : []),
      { ...teksten('auto'), groep: 'kosten', stand: 'nodig', label: t('kan.auto.nodig'), nu: t('kan.auto.nu'), href: 'opbrengst.html' },
      // Het sluipverbruik (besluit 192): elke nacht gemeten uit de slimme meter.
      { ...teksten('sluip'), groep: 'kosten', stand: d.sluip ? 'werkt' : geenP1 ? 'nodig' : 'uit', ...(geenP1 && !d.sluip ? { label: t('kan.meterNodig') } : {}), nu: geenP1 && !d.sluip ? t('kan.zonderMeter') : d.sluip ? t(d.sluip.hoog ? 'kan.sluip.hoog' : 'kan.sluip.gewoon', { w: Math.round(d.sluip.vannacht.w), boven: Math.round(d.sluip.bovenW) }) : t('kan.sluip.nog'), href: geenP1 && !d.sluip ? 'energie.html#meters' : 'sluipverbruik.html' },
      // Gemak
      { ...teksten('licht'), groep: 'gemak', stand: d.functies?.lichtMogelijk && f?.licht?.bedienen !== false ? 'werkt' : 'uit', nu: lampenAan ? t('kan.licht.aan', { n: lampenAan }) : t('kan.licht.uit'), href: 'functies.html#licht' },
      ...(screens.length ? [{ ...teksten('screens'), groep: 'gemak', stand: d.functies?.schermMogelijk && f?.schermen?.bedienen !== false ? 'werkt' : 'uit', nu: t('kan.screens.n', { n: screens.length }), href: 'functies.html#licht' }] : []),
      { ...teksten('afwezig'), groep: 'comfort', stand: geenRegeling ? 'nodig' : meekijk, ...(geenRegeling ? { label: t('kan.temperatuur.nodig') } : {}), nu: geenRegeling ? t('kan.zonderRegeling') : t('kan.afwezig.nu'), href: 'comfort.html#afwezig' },
      { ...teksten('vraag'), groep: 'gemak', stand: 'werkt', nu: t('kan.vraag.nu'), href: 'assistent.html' },
      // Te doen (besluit 216 en 217): herinneringen, de agenda en de lijsten, in een eigen tab.
      ...(f ? [teDoenOnderwerp(f, t)] : []),
      // Overzicht
      {
        ...teksten('opbrengst'), groep: 'overzicht', stand: zonderMeter || zonderPrijs ? 'mis' : 'werkt', label: zonderMeter ? t('kan.opbrengst.meters') : zonderPrijs ? t('kan.opbrengst.prijs') : null,
        nu: zonderMeter ? t('kan.opbrengst.kiesMeters') : zonderPrijs ? t('kan.opbrengst.geenEuro') : geschat ? t('kan.opbrengst.geschat') : d.opbrengst?.stroom && d.opbrengst.stroom.eigenZonPct == null ? t('kan.opbrengst.verbruik', { kwh: Math.round(d.opbrengst.stroom.verbruikKwh) }) : d.opbrengst?.stroom ? t('kan.opbrengst.eigen', { pct: d.opbrengst.stroom.eigenZonPct }) : t('kan.opbrengst.nu'),
        href: zonderMeter ? 'energie.html#meters' : zonderPrijs ? 'energie.html#prijzen' : 'opbrengst.html',
      },
      { ...teksten('zekering'), groep: 'kosten', stand: z ? meekijk : 'mis', label: z ? null : t('kan.zekering.label'), nu: z ? `${z.fasen} × ${z.ampere} A` : t('kan.zekering.nu'), href: 'energie.html#aansluiting' },
      ...((d.functies?.gevonden?.cameras ?? []).length ? [{ ...teksten('camera'), groep: 'gemak', stand: f?.cameras?.aan || f?.deurbel?.aan ? 'werkt' : 'uit', nu: t(f?.deurbel?.aan ? 'kan.camera.bel' : 'kan.camera.nu'), href: 'functies.html#cameras' }] : []),
      {
        ...teksten('batterijen'), groep: 'overzicht', stand: 'werkt', let: leegB > 0 || volF > 0, href: 'thuis.html#batterijen',
        nu: leegB || volF ? [leegB ? t('kan.batterijen.leeg', { n: leegB }) : null, volF ? t('kan.batterijen.vol', { n: volF }) : null].filter(Boolean).join(', ') : t('kan.batterijen.orde'),
      },
      { ...teksten('weer'), groep: 'overzicht', stand: f?.weer?.bron ? 'werkt' : 'uit', nu: weerNaam ? t('kan.weer.van', { bron: weerNaam }) : t('kan.weer.nu'), href: 'functies.html#weer' },
    ];
    return lijst.map((x) => ({ ...x, label: x.label ?? LABEL(x.stand) ?? x.stand }));
  }

  /** Te doen in Wat je huis kan: aan met wat er gekozen is, of uit met de weg ernaartoe. */
  function teDoenOnderwerp(f, t) {
    const td = f.tedoen;
    const n = td ? ['boodschappen', 'todo', 'afval', 'gezin'].filter((k) => td[k]).length : 0;
    return { ...teksten('tedoen'), groep: 'gemak', stand: td?.aan ? 'werkt' : 'uit', nu: td?.aan ? t('kan.tedoen.n', { n }) : t('kan.tedoen.nu'), href: td?.aan ? 'tedoen.html' : 'functies.html?groep=assistent#tedoen' };
  }

  /** De groepen op de zonnewaaier, van links naar rechts: wat nog leert staat bovenin. */
  const WAAIER = ['gemak', 'overzicht', 'comfort', 'leert', 'zon', 'kosten'];
  /**
   * Hoe ver je huis is (schets Wand-Voortgang): alles uit kan() wat er in Home
   * Assistant is, met hoe ver het is van gevonden tot werkt (kit/waaier.js).
   * Wat er nog bij kan ("nodig") blijft op Wat je huis kan; wat uit staat of
   * een instelling mist, staat op de eerste ring. Het klimaat kijkt mee tot de
   * datasetmeter vol is (besluit 64); zo ver groeit zijn straal naar buiten.
   */
  function voortgang(d) {
    const t = global.taal.t;
    const dataset = d.divergence?.dataset ?? null;
    const gereedheid = dataset?.gereedheid ?? null;
    const klaar = gereedheid ? gereedheid.totaal / 100 : 0;
    const onderwerpen = kan(d)
      .filter((x) => x.stand !== 'nodig')
      .map((x) => {
        // Op tijd warm leert de seizoenen, het thermisch model zijn kamers (besluit 231); van de ligging weten we alleen of er een heldere dag was.
        const deel = x.id === 'optijd' && gereedheid ? gereedheid.tijd / 100 : x.id === 'thermisch' ? x.deel : 0;
        return { ...x, kort: t(`voortgang.kort.${x.id}`), p: global.waaier.voortgang(x.stand, deel, klaar) };
      });
    const groepen = WAAIER.map((id) => ({ id, naam: t(id === 'leert' ? 'voortgang.groep.leert' : `kan.groep.${id}`), onderwerpen: onderwerpen.filter((x) => x.groep === id) }));
    const totaal = onderwerpen.length ? Math.round((onderwerpen.reduce((s, x) => s + x.p, 0) / onderwerpen.length) * 100) : 0;
    const winter = dataset?.seizoenen?.find((s) => s.seizoen === 'winter') ?? null;
    return { groepen, onderwerpen, totaal, klaar, gereedheid, dataset, winter, tel: (s) => onderwerpen.filter((x) => x.stand === s).length };
  }
  global.stand = { GROEPEN, nogTeDoen, zoek, kan, batterijSom, ideeen, voortgang };
})(window);
