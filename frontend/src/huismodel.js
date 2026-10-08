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
  const GANG = /^(hal|gang|overloop|trap|entree|toilet|wc)\b/i;

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
      apparaten,
    };
  }

  global.huismodel = { ACTIEF, BUITEN, GANG, kleurVanLicht, zoneNaam, standVan, kortVan, kamerModel };
})(window);
