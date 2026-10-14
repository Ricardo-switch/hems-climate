/*
 * Van de gegevens van de dienst naar de beschrijving van een kamer voor de
 * tekenmotor (kit/huis.js). Gedeeld door Thuis en Kamer, zodat een kamer er op
 * beide hetzelfde uitziet.
 */
'use strict';

(function (global) {
  const nl = (n, d = 1) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

  const ACTIEF = ['koelt', 'verwarmt', 'warmt voor', 'droogt', 'ventileert'];
  const BUITEN = /tuin|oprit|terras|balkon|buiten|veranda|carport/i;
  const GANG = /^(hal|gang|overloop|trap|entree|toilet|wc|trapkast|meterkast)\b/i;

  function kleurVanLicht(a) {
    const l = a.licht;
    if (l?.tint) return `hsl(${Math.round(l.tint[0])} ${Math.round(Math.min(100, l.tint[1]))}% 70%)`;
    if (l?.kelvin) return l.kelvin < 2800 ? '#FFC27A' : l.kelvin < 4000 ? '#FFD9A0' : '#FFF1DC';
    return '#FFD9A0';
  }

  /** De naam van een zone in een zin: "woonkamer", zoals de regeling hem noemt. */
  function zoneNaam(zoneId) {
    return String(zoneId).replace(/[-_]+/g, ' ').toLowerCase();
  }

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
    for (const a of klimaat) {
      const aan = a.aan || ACTIEF.includes(a.klimaat?.actie);
      const warm = /verwarmt|warmt voor/.test(a.klimaat?.actie ?? '');
      if (a.klimaat?.kanKoelen) apparaten.push({ soort: 'airco', aan, naam: a.id, stand: warm ? 'warmt' : 'koelt' });
      else apparaten.push({ soort: 'radiator', aan });
    }
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

  global.huismodel = { ACTIEF, BUITEN, GANG, kleurVanLicht, zoneNaam, standVan, kortVan, kamerModel, isBuiten, soortBuiten, buiten };
})(window);
