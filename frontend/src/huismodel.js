/*
 * Van de gegevens van de dienst naar de beschrijving van een kamer voor de
 * tekenmotor (kit/huis.js). Gedeeld door Thuis en Kamer, zodat een kamer er op
 * beide hetzelfde uitziet.
 */
'use strict';

(function (global) {
  /** Een getal in de taal van de app (besluit 185). */
  const nl = (n, d = 1) => global.taal.getal(n, d);

  /** Wat een airco doet, als vaste code uit api/huis (`klimaat.actieCode`, besluit 185): de woorden verschillen per taal. */
  const ACTIEF = /^(koelt|verwarmt|verwarmt-voor|droogt|ventileert)$/;
  const BUITEN = /tuin|oprit|terras|balkon|buiten|veranda|carport|garden|driveway|patio|terrace|balcony|outside/i;
  const GANG = /^(hal|gang|overloop|trap|entree|toilet|wc|trapkast|meterkast)\b/i;

  function kleurVanLicht(a) {
    const l = a.licht;
    if (l?.tint) return `hsl(${Math.round(l.tint[0])} ${Math.round(Math.min(100, l.tint[1]))}% 70%)`;
    if (l?.kelvin) return l.kelvin < 2800 ? '#FFC27A' : l.kelvin < 4000 ? '#FFD9A0' : '#FFF1DC';
    return '#FFD9A0';
  }

  /**
   * De naam van een zone in een zin, zoals de kamer in de indeling heet (besluit
   * 131): "de woonkamer", of "Beneden". Zonder huis de id, zoals de regeling hem noemt.
   */
  function zoneNaam(zoneId, huis) {
    const kamer = (huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((r) => r.zoneId === zoneId);
    const naam = kamer?.naam ?? String(zoneId).replace(/[-_]+/g, ' ');
    return metLidwoord(naam);
  }
  /** "de badkamer" bij een gewone kamer, en een eigen naam zoals hij is: de lijst staat in basis.js. */
  function metLidwoord(naam) {
    return global.app.metLidwoord(naam);
  }
  /**
   * De etages naast elkaar, zoals je ze telt (besluit 131): de begane grond
   * links, de zolder rechts, buiten achteraan. Onder elkaar blijven ze zoals
   * het huis staat, met de zolder boven; zo komen ze uit api/huis.
   */
  function etagesNaast(etages) {
    const binnen = (etages ?? []).filter((e) => e.id !== 'buiten');
    return [...binnen.reverse(), ...(etages ?? []).filter((e) => e.id === 'buiten')];
  }
  /** Wat er in een kamer warmt of koelt (besluit 132), in woorden. */
  const BRON_NAAM = Object.fromEntries(['radiator', 'vloer', 'vloer-elektrisch', 'paneel', 'kachel', 'airco'].map((s) => [s, global.taal.t(`bron.${s}`)]));
  const ELEKTRISCH = new Set(['vloer-elektrisch', 'paneel', 'kachel']);
  /** "Vloerverwarming en infraroodpaneel". */
  function bronNaam(b) {
    const w = b.soorten.map((s) => BRON_NAAM[s] ?? s);
    const zin = opsomming(w);
    return zin.charAt(0).toUpperCase() + zin.slice(1);
  }
  /** "a, b en c" in de taal van de app. */
  const opsomming = (w) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} ${global.taal.t('algemeen.en')} ${w.at(-1)}` : w[0] ?? '');
  const isElektrischSlim = (b) => b.aan !== 'hand' && b.soorten.some((s) => ELEKTRISCH.has(s));
  /** "in Beneden en Zolder", of "in 5 kamers" als het er meer dan drie zijn. */
  function inKamers(namen) {
    if (namen.length > 3) return global.taal.t('huis.inNKamers', { n: namen.length });
    return global.taal.t('huis.inKamers', { namen: opsomming(namen) });
  }
  /** Met een hoofdletter, aan het begin van een zin. */
  const metHoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function standVan(zoneId, state) {
    const k = state?.bewoner?.kamers?.find((x) => x.zoneId === zoneId);
    if (!k) return null;
    return { cool: 'koelt', heat: 'warmt', wait: 'wacht', ok: 'goed' }[k.soort] ?? null;
  }

  function kortVan(zoneId, state) {
    const k = state?.bewoner?.kamers?.find((x) => x.zoneId === zoneId);
    if (!k?.kort) return null;
    return k.kort.charAt(0).toLowerCase() + k.kort.slice(1);
  }

  /** Hoe warm een boiler of jacuzzi is, van zijn ondergrens (0) tot zijn doel op zon (1); zonder meting half. */
  function hoeVol(w) {
    if (w?.tempC == null) return 0.5;
    return Math.max(0.05, Math.min(1, (w.tempC - (w.minC - 10)) / Math.max(1, w.zonC - (w.minC - 10))));
  }

  /** Een kamer uit `api/huis` naar de beschrijving voor de tekenmotor, met de stand uit `api/state`. */
  function kamerModel(r, state) {
    const apps = r.apparaten ?? [];
    const klimaat = apps.filter((a) => a.soort === 'klimaat');
    const lampen = apps.filter((a) => a.soort === 'licht');
    const screens = apps.filter((a) => a.soort === 'screen');
    // Uitstelbare apparaten (besluit 98): de droger draait zichtbaar in zijn kamer.
    // Een boiler of jacuzzi (besluit 186) is geen witgoed: die tekent zichzelf (besluit 187).
    const witgoed = apps.filter((a) => a.soort === 'apparaat' && !a.warmte);
    const boilers = apps.filter((a) => a.warmte?.soort === 'boiler');
    const apparaten = [];
    // Wat de bewoner bij de kamer vastlegde (besluit 132): een thermostaat met
    // vloerverwarming eraan tekent de vloer, niet een radiator.
    const bronnen = r.bronnen ?? [];
    const bronVan = (a) => bronnen.find((b) => b.apparaat && (b.apparaat === a.actuatorId || b.apparaat === a.id));
    const vloer = (b) => b.soorten.some((x) => x === 'vloer' || x === 'vloer-elektrisch');
    for (const a of klimaat) {
      const aan = a.aan || ACTIEF.test(a.klimaat?.actieCode ?? '');
      const warm = /verwarmt/.test(a.klimaat?.actieCode ?? '');
      const b = bronVan(a);
      if (a.klimaat?.kanKoelen) apparaten.push({ soort: 'airco', aan, naam: a.id, stand: warm ? 'warmt' : 'koelt' });
      else if (b && !b.soorten.includes('radiator')) {
        if (vloer(b)) apparaten.push({ soort: 'vloer', aan });
      } else apparaten.push({ soort: 'radiator', aan });
    }
    if (bronnen.some((b) => vloer(b) && !klimaat.some((a) => bronVan(a) === b)) && !apparaten.some((x) => x.soort === 'vloer')) apparaten.push({ soort: 'vloer', aan: false });
    if (bronnen.some((b) => b.soorten.includes('radiator')) && !apparaten.some((x) => x.soort === 'radiator')) apparaten.push({ soort: 'radiator', aan: false });
    // Hooguit twee lampen in beeld: wat aan is eerst.
    [...lampen].sort((a, b) => Number(b.aan) - Number(a.aan)).slice(0, 2).forEach((a, i) => apparaten.push({ soort: 'lamp', aan: a.aan, kleur: kleurVanLicht(a), x: i === 0 ? 0.35 : 0.72 }));
    for (const a of witgoed.slice(0, 2)) apparaten.push({ soort: /vaat/i.test(a.naam) ? 'vaatwasser' : /was/i.test(a.naam) && !/droog|droger/i.test(a.naam) ? 'wasmachine' : 'droger', aan: a.aan });
    for (const a of boilers.slice(0, 1)) apparaten.push({ soort: 'boiler', aan: a.aan, vol: hoeVol(a.warmte) });
    if (screens[0]) apparaten.push({ soort: 'screen', dicht: screens[0].positiePct == null ? 0 : 1 - screens[0].positiePct / 100 });
    const zid = r.zoneId ?? r.meedoenMet?.zoneId ?? null;
    const gewicht = klimaat.length ? 1.4 : GANG.test(r.naam) ? 0.55 : r.temperatuurC != null ? 1.0 : 0.8;
    return {
      id: r.id,
      naam: r.naam,
      gewicht,
      temp: r.temperatuurC == null ? null : `${nl(r.temperatuurC)}°`,
      // Een kamer die meedoet met een andere (besluit 142), kleurt mee met die regeling.
      stand: zid ? standVan(zid, state) : null,
      zin: zid ? kortVan(zid, state) : r.lampenAan ? global.t('huis.lampenAan', { n: r.lampenAan }) : null,
      zones: (r.zones ?? []).length > 1 ? r.zones.map((z) => (z.soort ? { naam: z.naam, soort: z.soort } : z.naam)) : undefined,
      // Wat voor kamer, voor de inrichting ingezoomd (besluit 119). Hebben de zones
      // een gekozen soort en de kamer niet, dan per zone (besluit 145).
      inrichting: (r.soortGekozen || !(r.zones ?? []).some((z) => z.soort) ? r.soort : null) ?? undefined,
      // Beweging nu (15 oktober 2026): een melder in de kamer ziet iemand.
      beweging: apps.some((a) => a.meting?.beweging?.nu) || undefined,
      apparaten,
    };
  }

  /** Een lijst [code, naam] met de namen uit de teksten (besluit 185). */
  const soorten = (soort, codes) => codes.map((c) => [c, global.taal.t(`soort.${soort}.${c}`)]);
  /** Wat voor kamer (besluit 119), voor Indeling en Inrichten. */
  const KAMER_SOORTEN = soorten('kamer', ['woonkamer', 'woonkeuken', 'keuken', 'eetkamer', 'slaapkamer', 'kinderkamer', 'logeerkamer', 'badkamer', 'toilet', 'hal', 'werkkamer', 'wasruimte', 'bijkeuken', 'berging', 'kelder', 'garage', 'leeg']);
  /** Wat voor deel van een kamer (besluit 145): dezelfde soorten, met namen voor een deel. */
  const ZONE_SOORTEN = soorten('zone', ['woonkamer', 'keuken', 'eetkamer', 'werkkamer', 'slaapkamer', 'kinderkamer', 'badkamer', 'toilet', 'wasruimte', 'hal', 'berging', 'leeg']);

  /**
   * Ligt deze ruimte buiten (de tuin, de oprit)? Dan hoort hij niet als kamer in
   * het huis. Het huis zegt het (`buiten`, besluit 109); de naam is de terugval
   * voor een indeling die nog niet door de dienst ging.
   */
  function isBuiten(etage, r) {
    return r.buiten != null || etage.id === 'buiten' || BUITEN.test(r.naam) || BUITEN.test(r.id);
  }

  /** Wat voor buitenruimte: zoals de bewoner het koos, of uit de naam. */
  /** Wat een buitenruimte uit zijn naam is, zoals de dienst het voorstelt (besluiten 109 en 167). */
  function buitenUitNaam(naam) {
    const n = naam ?? '';
    return /carport/i.test(n) ? 'carport' : /oprit|driveway/i.test(n) ? 'oprit' : /voortuin|front garden|front yard/i.test(n) ? 'voortuin' : /zijtuin|side garden/i.test(n) ? 'zijtuin' : /dakterras|roof terrace/i.test(n) ? 'dakterras' : /terras|veranda|patio|terrace/i.test(n) ? 'terras' : /balkon|balcony/i.test(n) ? 'balkon' : /tuinhuis|schuur|shed/i.test(n) ? 'tuinhuis' : /garage/i.test(n) ? 'garage' : /tuin|garden|yard/i.test(n) ? 'tuin' : null;
  }
  /** Een deel van een buitenruimte uit zijn naam (besluit 167). */
  function buitenZoneUitNaam(naam) {
    const n = naam ?? '';
    return /tuinhuis|schuur|huisje|berging|shed/i.test(n) ? 'tuinhuis' : /border|bloem|perk|haag|flower|bed|hedge/i.test(n) ? 'border' : /gazon|gras|lawn/i.test(n) ? 'gazon' : /terras|zithoek|lounge|patio|terrace/i.test(n) ? 'terras' : /moestuin|groente|kas|vegetable|greenhouse/i.test(n) ? 'moestuin' : /vijver|water|pond/i.test(n) ? 'vijver' : /pad|tegel|path/i.test(n) ? 'pad' : /speel|schommel|trampoline|play|swing/i.test(n) ? 'speelplek' : /carport/i.test(n) ? 'carport' : /oprit|driveway/i.test(n) ? 'oprit' : null;
  }
  /** Een schuurtje, geen tuinhuis: aan de naam (24 oktober 2026). */
  const SCHUUR = /schuur|berging|shed/i;
  const heeftHuisje = (r) => (r.zones ?? []).some((z) => (z.soort ?? buitenZoneUitNaam(z.naam)) === 'tuinhuis');
  function soortBuiten(r) {
    if (r.buiten) return { ...r.buiten, tuinhuis: r.buiten.tuinhuis || ((r.buiten.soort === 'tuin' || r.buiten.soort === 'zijtuin') && heeftHuisje(r)) };
    const soort = buitenUitNaam(r.naam) ?? 'tuin';
    return { soort, auto: soort === 'oprit' || soort === 'carport', tuinhuis: (soort === 'tuin' || soort === 'zijtuin') && heeftHuisje(r) };
  }

  /**
   * De buitenruimtes voor de tekening (besluiten 109 en 113): een oprit, een
   * tuin achter, een terras, een voortuin en een balkon, elk op zijn eigen plek;
   * wat erbij hoort (een auto, een tuinhuis) komt uit de indeling. Welke lamp het tuinhuis verlicht:
   * een lamp in een zone die zo heet, of die zelf zo heet, of een lamp in een
   * ruimte die zelf het tuinhuis is (besluit 158).
   *
   * `rond` is wat de bewoner zei dat er rond het huis is (besluit 158). Dat gaat
   * voor de ruimtes: een deel dat er niet is, valt weg; een deel zonder ruimte
   * komt erbij, zonder lampen en zonder iets om op te tikken.
   */
  function buiten(ruimtes, rond = null) {
    let oprit = null;
    let tuin = null;
    let terras = null;
    let balkon = null;
    let voortuin = null;
    let garage = null;
    // De lampen van een ruimte die het tuinhuis is, horen bij het tuinhuis in de tuin.
    const huisjes = ruimtes.filter((r) => soortBuiten(r).soort === 'tuinhuis');
    const huisjeLampen = huisjes.flatMap((r) => (r.apparaten ?? []).filter((a) => a.soort === 'licht'));
    for (const r of ruimtes) {
      const b = soortBuiten(r);
      if (b.soort === 'tuinhuis') continue;
      const lampen = (r.apparaten ?? []).filter((a) => a.soort === 'licht');
      const zoneNaam = (a) => (r.zones ?? []).find((z) => z.id === a.zone)?.naam ?? '';
      const lampAan = lampen.some((a) => a.aan);
      // Een terras, balkon of voortuin heeft zijn eigen plek (besluit 113); een tweede tuin wordt de voortuin.
      if (b.soort === 'terras') {
        terras ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      if (b.soort === 'balkon' || b.soort === 'dakterras') {
        balkon ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      // Een losse garage achter de oprit (besluit 166).
      if (b.soort === 'garage') {
        garage ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      // Een zijtuin, of een tweede tuin, krijgt de plek van de voortuin als die vrij is.
      if (b.soort === 'voortuin' || ((b.soort === 'tuin' || b.soort === 'zijtuin') && tuin && !voortuin)) {
        voortuin ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      if (b.soort === 'oprit' || b.soort === 'carport') {
        if (oprit) continue;
        const cam = lampen.find((a) => /camera|schijnwerper/i.test(a.id + a.naam));
        oprit = { id: r.id, naam: r.naam, auto: b.auto ? {} : null, camera: cam || (r.apparaten ?? []).some((a) => a.soort === 'camera') ? { aan: !!cam?.aan } : null, ...(b.soort === 'carport' ? { carport: true } : {}) };
      } else {
        if (tuin) continue;
        const huisje = b.tuinhuis || huisjes.length ? [...lampen.filter((a) => /tuinhuis|schuur|berging|huisje/i.test(`${a.id} ${a.naam} ${zoneNaam(a)}`)), ...huisjeLampen] : [];
        const overstek = huisje.find((a) => /overstek|luifel/i.test(a.id + a.naam));
        const binnenlamp = huisje.find((a) => a !== overstek);
        const scherm = (r.apparaten ?? []).find((a) => a.soort === 'screen');
        tuin = {
          id: r.id,
          naam: r.naam,
          tuinhuis: b.tuinhuis || huisjes.length > 0,
          // Een schuur, berging of shed is het schuurtje met puntdak; anders het tuinhuis met plat dak (24 oktober 2026).
          tuinhuisSoort: SCHUUR.test([huisjes[0]?.naam, ...(r.zones ?? []).filter((z) => (z.soort ?? buitenZoneUitNaam(z.naam)) === 'tuinhuis').map((z) => z.naam)].filter(Boolean).join(' ')) ? 'schuur' : 'tuinhuis',
          // Is het tuinhuis een eigen ruimte, dan is het huisje zelf aan te tikken (besluit 166).
          tuinhuisId: huisjes[0]?.id ?? null,
          tuinhuisNaam: huisjes[0]?.naam ?? null,
          tuinhuisAan: !!binnenlamp?.aan,
          overstekAan: !!overstek?.aan,
          overstekKleur: overstek ? kleurVanLicht(overstek) : undefined,
          lampen: lampen.filter((a) => !huisje.includes(a)).slice(0, 3).map((a) => ({ aan: a.aan, kleur: kleurVanLicht(a) })),
          zonnescherm: scherm ? { dicht: scherm.positiePct == null ? 0 : 1 - scherm.positiePct / 100 } : null,
        };
      }
    }
    // Alleen een tuinhuis in Home Assistant: dan is er een tuin om hem in te zetten.
    if (!tuin && huisjes.length) tuin = { id: null, naam: global.t('huis.buiten.tuin'), tuinhuis: true, tuinhuisSoort: SCHUUR.test(huisjes[0].naam ?? '') ? 'schuur' : 'tuinhuis', tuinhuisId: huisjes[0].id, tuinhuisNaam: huisjes[0].naam, tuinhuisAan: huisjeLampen.some((a) => a.aan), overstekAan: false, lampen: [], zonnescherm: null };
    if (rond) {
      const leeg = (naam) => ({ id: null, naam, lampAan: false });
      oprit = rond.oprit ? (oprit ?? { id: null, naam: global.t('huis.buiten.oprit'), auto: null, camera: null }) : null;
      if (oprit) oprit = { ...oprit, auto: rond.auto ? (oprit.auto ?? {}) : null };
      tuin = rond.tuin || rond.tuinhuis ? { ...(tuin ?? { id: null, naam: global.t('huis.buiten.tuin'), tuinhuisAan: false, overstekAan: false, lampen: [], zonnescherm: null }), tuinhuis: rond.tuinhuis } : null;
      // Een plek buiten zonder eigen naam heet zoals de plek (besluit 185: in de taal van de app).
      terras = rond.terras ? (terras ?? leeg(global.t('huis.buiten.terras'))) : null;
      balkon = rond.balkon ? (balkon ?? leeg(global.t('huis.buiten.balkon'))) : null;
      voortuin = rond.voortuin ? (voortuin ?? leeg(global.t('huis.buiten.voortuin'))) : null;
      garage = rond.garage ? (garage ?? leeg(global.t('huis.buiten.garage'))) : null;
      if (oprit) oprit = { ...oprit, carport: !!rond.carport };
    }
    return { oprit, tuin, terras, balkon, voortuin, garage };
  }

  /**
   * Wat er rond het huis is, zoals de tekening het nu laat zien (besluit 158):
   * het startpunt voor de vraag "Wat is er rond je huis?".
   */
  function rondNu(huis) {
    if (huis?.rond) return { ...huis.rond };
    const ruimtes = (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).filter((r) => isBuiten(e, r)));
    const b = buiten(ruimtes);
    return { oprit: !!b.oprit, auto: !!b.oprit?.auto, voortuin: !!b.voortuin, tuin: !!b.tuin, terras: !!b.terras, balkon: !!b.balkon, tuinhuis: !!b.tuin?.tuinhuis, garage: !!b.garage, carport: false };
  }

  /**
   * De tekening van het huis, één keer voor alle pagina's (5S, rapport 15
   * oktober): de etages van onder naar boven met het dak erop, wat er buiten
   * is, de voordeur met de deurbel, de buitenunits en hoeveel panelen. `kamer`
   * maakt van een ruimte een kamer in de tekening (null laat hem weg);
   * `aantalPanelen` is wat de bewoner opgaf. Met `kelderOnder` komt de kelder
   * apart, om onder de grond te tekenen (besluit 187).
   */
  function tekening(huis, { kamer = (r) => kamerModel(r, null), aantalPanelen = null, zon = null, kelderOnder = false } = {}) {
    const buitenRuimtes = [];
    const etages = [];
    let kelder = null;
    for (const e of [...(huis?.etages ?? [])].reverse()) {
      const kamers = [];
      for (const r of e.ruimtes ?? []) {
        if (isBuiten(e, r)) buitenRuimtes.push(r);
        else {
          const k = kamer(r, e);
          if (k) kamers.push(k);
        }
      }
      // In de wereld van huis 3.0 (`kelderOnder`) ligt de kelder opengewerkt in de grond (besluit 187).
      if (kamers.length && kelderOnder && e.id === 'kelder') kelder = { naam: e.naam, id: e.id, kamers };
      else if (kamers.length) etages.push({ naam: e.naam, id: e.id, kamers });
    }
    // Onder het schuine dak: zoals de indeling zegt (besluit 111); een oudere dienst raadt het.
    const top = etages.at(-1);
    if (top && (huis?.dakEtage !== undefined ? top.id === huis.dakEtage : etages.length >= 3 || /zolder|dak/i.test(top.naam))) top.dak = true;
    const alles = (huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
    const aircos = alles.filter((a) => a.soort === 'klimaat' && a.klimaat?.kanKoelen);
    const delen = buiten(buitenRuimtes, huis?.rond ?? null);
    // De deurbel en de camera op de oprit, met hun bewegingsmelders (rapport 15 oktober).
    const naam = (a) => `${a.id} ${a.naam}`;
    const isBel = (a) => /deurbel|doorbell/i.test(naam(a));
    const bel = alles.find((a) => a.soort === 'camera' && isBel(a));
    const belZiet = alles.find((a) => a.meting?.beweging && isBel(a));
    const camZiet = alles.find((a) => a.meting?.beweging && /camera/i.test(naam(a)) && !isBel(a));
    if (delen.oprit?.camera) delen.oprit.camera.beweging = !!camZiet?.meting.beweging.nu;
    // De jacuzzi (besluit 186) staat in de tuin, op zijn vlonder; zonder tuin komt er een.
    const jacuzzi = alles.find((a) => a.warmte?.soort === 'jacuzzi');
    if (jacuzzi) {
      const w = jacuzzi.warmte;
      delen.tuin = { ...(delen.tuin ?? { id: null, naam: global.t('huis.buiten.tuin'), tuinhuis: false, tuinhuisAan: false, overstekAan: false, lampen: [], zonnescherm: null }), jacuzzi: { temp: w.tempC, stand: jacuzzi.aan ? 'warmt' : 'rust', zon: jacuzzi.aan && w.opZon } };
    }
    const piekW = (zon?.panelen ?? []).reduce((t, p) => t + (p.wattpiek ?? 0), 0);
    return {
      etages,
      kelder,
      buitenRuimtes,
      ...delen,
      voordeur: { deurbel: bel || belZiet ? { beweging: !!belZiet?.meting.beweging.nu } : null },
      buitenunit: aircos.length ? { aan: aircos.some((a) => a.aan || ACTIEF.test(a.klimaat?.actieCode ?? '')), aantal: aircos.length } : null,
      piekW,
      panelen: aantalPanelen ?? (piekW > 0 ? Math.max(1, Math.round(piekW / 400)) : 0),
    };
  }

  /**
   * Hoe de panelen over het dak liggen (besluit 111, 166), één keer voor Thuis en
   * Inrichten: wat de bewoner opgaf, per kant bij "beide", anders geschat uit de
   * wattpiek (een paneel van rond de 400 Wp). De voorkant ligt op het dichte
   * dakvlak rechts, de achterkant op het open vlak links. Geen panelen: 0.
   */
  function panelenOpDak(p, piekW = 0) {
    if (p?.ligging === 'geen') return { panelen: 0, panelenLinks: 0 };
    const geschat = piekW > 0 ? Math.max(1, Math.round(piekW / 400)) : 0;
    if (p?.ligging === 'beide') {
      const voor = p.voorkant ?? null;
      const achter = p.achterkant ?? null;
      if (voor == null && achter == null) return { panelen: Math.ceil(geschat / 2), panelenLinks: Math.floor(geschat / 2) };
      return { panelen: voor ?? 0, panelenLinks: achter ?? 0 };
    }
    // Alleen aan de achterkant: dan op het andere vlak.
    const aantal = p?.aantal ?? geschat;
    return p?.ligging === 'achterkant' ? { panelen: 0, panelenLinks: aantal } : { panelen: aantal, panelenLinks: 0 };
  }

  /**
   * Hoe het kompas op het eiland staat (besluit 187). In de tekening ligt de
   * voorkant van het dak op het vlak rechts en de achterkant links (zie
   * panelenOpDak); het kompas draait zo dat die vlakken naar hun gemeten
   * richting wijzen. Zonder vlakken de richting van de voorgevel; anders null.
   */
  function kompasVan(lig, p) {
    const w = lig?.nu ?? lig?.voorstel;
    const vlak = w?.vlakken?.[0];
    if (vlak) return { voorgevelDeg: (vlak.azimuthDeg + (p?.ligging === 'achterkant' ? -90 : 90) + 360) % 360 };
    return w?.voorgevelDeg != null ? { voorgevelDeg: w.voorgevelDeg } : null;
  }

  /**
   * Wie de begroeting noemt (besluit 147): op je telefoon jij; op een scherm
   * zoals de wand wie er thuis is, op volgorde. Zonder bewoners niemand.
   */
  function groetWie(bewoners) {
    const iedereen = [...(bewoners?.bewoners ?? []), ...(bewoners?.gasten ?? [])];
    if (!iedereen.length) return [];
    if (bewoners.ik?.soort === 'bewoner' || bewoners.ik?.soort === 'gast') return bewoners.ik.naam ? [{ id: bewoners.ik.id, naam: bewoners.ik.naam }] : [];
    // Op een scherm: wie er thuis is, bewoners op volgorde en dan gasten. Thuis zoals
    // Home Assistant het ziet, net als de rondjes (besluit 169, 21 oktober 2026).
    return iedereen.filter((b) => b.thuis).map((b) => ({ id: b.id, naam: b.naam }));
  }
  /** Alleen de namen, voor wat ze uitspreekt. */
  const groetNamen = (bewoners) => groetWie(bewoners).map((w) => w.naam);

  /*
   * De thermostaat van de cv-ketel (besluit 167), zoals een Nest: die stuurt de
   * ketel, en de radiatoren in alle kamers gaan mee aan. Gekozen bij Energie ›
   * Verwarming; anders het voorstel: een thermostaat uit Home Assistant die
   * verwarmt en niet koelt, en geen radiatorknop is. "geen": er is er geen.
   */
  function thermostaten(huis) {
    return (huis?.etages ?? []).flatMap((e) => (e.ruimtes ?? []).flatMap((r) => (r.apparaten ?? []).filter((a) => a.soort === 'klimaat' && !a.radiatorknop && a.klimaat?.kanVerwarmen && !a.klimaat?.kanKoelen).map((a) => ({ sleutel: a.actuatorId ?? a.id, naam: a.naam, kamerId: r.id, kamer: r.naam }))));
  }
  function cvThermostaat(huis, verwarming) {
    const keus = verwarming?.thermostaat ?? null;
    if (keus === 'geen') return null;
    const lijst = thermostaten(huis);
    return (keus ? lijst.find((x) => x.sleutel === keus) : lijst[0]) ?? null;
  }

  /** Wat een buitenruimte is (besluit 167): een eigen lijst, zoals Soort kamer binnen. */
  const BUITEN_SOORTEN = soorten('buiten', ['tuin', 'voortuin', 'zijtuin', 'oprit', 'carport', 'terras', 'balkon', 'dakterras', 'tuinhuis', 'garage']);
  /** De delen van een buitenruimte (besluit 167). Een tuinhuis tekent het huisje in de tuin. */
  const BUITEN_ZONES = soorten('buitenZone', ['gazon', 'border', 'terras', 'tuinhuis', 'moestuin', 'vijver', 'pad', 'speelplek', 'oprit', 'carport']);
  global.huismodel = { KAMER_SOORTEN, ZONE_SOORTEN, BUITEN_SOORTEN, BUITEN_ZONES, buitenUitNaam, buitenZoneUitNaam, thermostaten, cvThermostaat, ACTIEF,

 BUITEN, GANG, kleurVanLicht, zoneNaam, metLidwoord, metHoofdletter, etagesNaast, BRON_NAAM, ELEKTRISCH, bronNaam, opsomming, isElektrischSlim, inKamers, standVan, kortVan, kamerModel, isBuiten, soortBuiten, buiten, rondNu, tekening, panelenOpDak, kompasVan, groetNamen, groetWie };
})(window);
