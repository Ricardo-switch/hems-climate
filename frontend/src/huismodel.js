/*
 * Van de gegevens van de dienst naar de beschrijving van een kamer voor de
 * tekenmotor (kit/huis.js). Gedeeld door Thuis en Kamer, zodat een kamer er op
 * beide hetzelfde uitziet.
 */
'use strict';

(function (global) {
  const nl = (n, d = 1) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

  const ACTIEF = ['koelt', 'verwarmt', 'verwarmt voor', 'droogt', 'ventileert'];
  const BUITEN = /tuin|oprit|terras|balkon|buiten|veranda|carport/i;
  const GANG = /^(hal|gang|overloop|trap|entree|toilet|wc|trapkast|meterkast)\b/i;

  function kleurVanLicht(a) {
    const l = a.licht;
    if (l?.tint) return `hsl(${Math.round(l.tint[0])} ${Math.round(Math.min(100, l.tint[1]))}% 70%)`;
    if (l?.kelvin) return l.kelvin < 2800 ? '#FFC27A' : l.kelvin < 4000 ? '#FFD9A0' : '#FFF1DC';
    return '#FFD9A0';
  }

  /** Gewone kamerwoorden krijgen "de"; een eigen naam als "Beneden" niet (besluit 131). */
  const GEWOON = /^(zolder|woonkamer|badkamer|keuken|slaapkamer|kamer|hal|overloop|kantoor|werkkamer|hobbykamer|wasruimte|bijkeuken|eetkamer|kinderkamer|logeerkamer|zithoek|studeerkamer|berging|garage|kelder|zone)\b/i;
  /**
   * De naam van een zone in een zin, zoals de kamer in de indeling heet (besluit
   * 131): "de woonkamer", of "Beneden". Zonder huis de id, zoals de regeling hem noemt.
   */
  function zoneNaam(zoneId, huis) {
    const kamer = (huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((r) => r.zoneId === zoneId);
    const naam = kamer?.naam ?? String(zoneId).replace(/[-_]+/g, ' ');
    return metLidwoord(naam);
  }
  /** "de badkamer" bij een gewone kamer, en een eigen naam zoals hij is. */
  function metLidwoord(naam) {
    return GEWOON.test(naam) ? `de ${naam.charAt(0).toLowerCase()}${naam.slice(1)}` : naam;
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
  const BRON_NAAM = { radiator: 'radiator', vloer: 'vloerverwarming', 'vloer-elektrisch': 'elektrische vloerverwarming', paneel: 'infraroodpaneel', kachel: 'elektrische kachel', airco: 'airco' };
  const ELEKTRISCH = new Set(['vloer-elektrisch', 'paneel', 'kachel']);
  /** "Vloerverwarming en infraroodpaneel". */
  function bronNaam(b) {
    const w = b.soorten.map((s) => BRON_NAAM[s] ?? s);
    const t = w.length > 1 ? `${w.slice(0, -1).join(', ')} en ${w.at(-1)}` : w[0] ?? '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const isElektrischSlim = (b) => b.aan !== 'hand' && b.soorten.some((s) => ELEKTRISCH.has(s));
  /** "in Beneden en Zolder", of "in 5 kamers" als het er meer dan drie zijn. */
  function inKamers(namen) {
    if (namen.length > 3) return `in ${namen.length} kamers`;
    return `in ${namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en ${namen.at(-1)}` : namen[0] ?? ''}`;
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

  /** Een kamer uit `api/huis` naar de beschrijving voor de tekenmotor, met de stand uit `api/state`. */
  function kamerModel(r, state) {
    const apps = r.apparaten ?? [];
    const klimaat = apps.filter((a) => a.soort === 'klimaat');
    const lampen = apps.filter((a) => a.soort === 'licht');
    const screens = apps.filter((a) => a.soort === 'screen');
    // Uitstelbare apparaten (besluit 98): de droger draait zichtbaar in zijn kamer.
    const witgoed = apps.filter((a) => a.soort === 'apparaat');
    const apparaten = [];
    // Wat de bewoner bij de kamer vastlegde (besluit 132): een thermostaat met
    // vloerverwarming eraan tekent de vloer, niet een radiator.
    const bronnen = r.bronnen ?? [];
    const bronVan = (a) => bronnen.find((b) => b.apparaat && (b.apparaat === a.actuatorId || b.apparaat === a.id));
    const vloer = (b) => b.soorten.some((x) => x === 'vloer' || x === 'vloer-elektrisch');
    for (const a of klimaat) {
      const aan = a.aan || ACTIEF.includes(a.klimaat?.actie);
      const warm = /verwarmt/.test(a.klimaat?.actie ?? '');
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
    if (screens[0]) apparaten.push({ soort: 'screen', dicht: screens[0].positiePct == null ? 0 : 1 - screens[0].positiePct / 100 });
    const gewicht = klimaat.length ? 1.4 : GANG.test(r.naam) ? 0.55 : r.temperatuurC != null ? 1.0 : 0.8;
    return {
      id: r.id,
      naam: r.naam,
      gewicht,
      temp: r.temperatuurC == null ? null : `${nl(r.temperatuurC)}°`,
      stand: r.zoneId ? standVan(r.zoneId, state) : null,
      zin: r.zoneId ? kortVan(r.zoneId, state) : r.lampenAan ? `${r.lampenAan === 1 ? '1 lamp' : `${r.lampenAan} lampen`} aan` : null,
      zones: (r.zones ?? []).length > 1 ? r.zones.map((z) => z.naam) : undefined,
      // Wat voor kamer, voor de inrichting ingezoomd (besluit 119).
      inrichting: r.soort ?? undefined,
      apparaten,
    };
  }

  /**
   * Ligt deze ruimte buiten (de tuin, de oprit)? Dan hoort hij niet als kamer in
   * het huis. Het huis zegt het (`buiten`, besluit 109); de naam is de terugval
   * voor een indeling die nog niet door de dienst ging.
   */
  function isBuiten(etage, r) {
    return r.buiten != null || etage.id === 'buiten' || BUITEN.test(r.naam) || BUITEN.test(r.id);
  }

  /** Wat voor buitenruimte: zoals de bewoner het koos, of uit de naam. */
  function soortBuiten(r) {
    if (r.buiten) return r.buiten;
    const oprit = /oprit|carport/i.test(r.naam);
    const soort = oprit ? 'oprit' : /voortuin/i.test(r.naam) ? 'voortuin' : /terras|veranda/i.test(r.naam) ? 'terras' : /balkon/i.test(r.naam) ? 'balkon' : 'tuin';
    return { soort, auto: oprit, tuinhuis: soort === 'tuin' };
  }

  /**
   * De buitenruimtes voor de tekening (besluiten 109 en 113): een oprit, een
   * tuin achter, een terras, een voortuin en een balkon, elk op zijn eigen plek;
   * wat erbij hoort (een auto, een tuinhuis) komt uit de indeling. Welke lamp het tuinhuis verlicht:
   * een lamp in een zone die zo heet, of die zelf zo heet.
   */
  function buiten(ruimtes) {
    let oprit = null;
    let tuin = null;
    let terras = null;
    let balkon = null;
    let voortuin = null;
    for (const r of ruimtes) {
      const b = soortBuiten(r);
      const lampen = (r.apparaten ?? []).filter((a) => a.soort === 'licht');
      const zoneNaam = (a) => (r.zones ?? []).find((z) => z.id === a.zone)?.naam ?? '';
      const lampAan = lampen.some((a) => a.aan);
      // Een terras, balkon of voortuin heeft zijn eigen plek (besluit 113); een tweede tuin wordt de voortuin.
      if (b.soort === 'terras') {
        terras ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      if (b.soort === 'balkon') {
        balkon ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      if (b.soort === 'voortuin' || (b.soort === 'tuin' && tuin && !voortuin)) {
        voortuin ??= { id: r.id, naam: r.naam, lampAan };
        continue;
      }
      if (b.soort === 'oprit') {
        if (oprit) continue;
        const cam = lampen.find((a) => /camera|schijnwerper/i.test(a.id + a.naam));
        oprit = { id: r.id, naam: r.naam, auto: b.auto ? {} : null, camera: cam || (r.apparaten ?? []).some((a) => a.soort === 'camera') ? { aan: !!cam?.aan } : null };
      } else {
        if (tuin) continue;
        const huisje = b.tuinhuis ? lampen.filter((a) => /tuinhuis|schuur|berging|huisje/i.test(`${a.id} ${a.naam} ${zoneNaam(a)}`)) : [];
        const overstek = huisje.find((a) => /overstek|luifel/i.test(a.id + a.naam));
        const binnenlamp = huisje.find((a) => a !== overstek);
        const scherm = (r.apparaten ?? []).find((a) => a.soort === 'screen');
        tuin = {
          id: r.id,
          naam: r.naam,
          tuinhuis: b.tuinhuis,
          tuinhuisAan: !!binnenlamp?.aan,
          overstekAan: !!overstek?.aan,
          overstekKleur: overstek ? kleurVanLicht(overstek) : undefined,
          lampen: lampen.filter((a) => !huisje.includes(a)).slice(0, 3).map((a) => ({ aan: a.aan, kleur: kleurVanLicht(a) })),
          zonnescherm: scherm ? { dicht: scherm.positiePct == null ? 0 : 1 - scherm.positiePct / 100 } : null,
        };
      }
    }
    return { oprit, tuin, terras, balkon, voortuin };
  }

  global.huismodel = { ACTIEF, BUITEN, GANG, kleurVanLicht, zoneNaam, metLidwoord, metHoofdletter, etagesNaast, BRON_NAAM, ELEKTRISCH, bronNaam, isElektrischSlim, inKamers, standVan, kortVan, kamerModel, isBuiten, soortBuiten, buiten };
})(window);
