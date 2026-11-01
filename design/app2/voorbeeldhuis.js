/*
 * Het voorbeeldhuis voor de schetsen (1 november 2026): één dag in de zomer of
 * de winter, en wat het huis op elk moment doet. Wand-Voorbeeldhuis en
 * Tel-Voorbeeldhuis tekenen ermee; in de app komt dit uit de dienst.
 */
(function (global) {
  const ZON = { zomer: [334, 1312], winter: [522, 1012] };
  const DATUM = { zomer: 'woensdag 15 juli', winter: 'dinsdag 13 januari' };
  const uur = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const kommaKw = (kw) => String(kw).replace('.', ',');

  /** Het voorbeeldhuis op minuut m van de dag, in seizoen s. */
  function moment(m, s) {
    const [op, onder] = ZON[s];
    const winter = s === 'winter';
    const licht = m > op && m < onder;
    const stand = licht ? (m - op) / (onder - op) : 0;
    const hoogte = licht ? Math.sin(Math.PI * stand) * (winter ? 0.45 : 0.95) : 0;
    const kw = licht ? +(hoogte * (winter ? 1.6 : 4.4)).toFixed(1) : 0;
    const tijd = !licht ? (m < op - 60 || m > onder + 90 ? 'nacht' : 'avond') : m < op + 120 ? 'ochtend' : m > onder - 120 ? 'avond' : 'dag';
    const avond = !licht || tijd === 'avond';
    const droger = !winter && m >= 690 && m < 860;
    const koelt = !winter && licht && m > 660 && m < 1020;
    const warmt = winter && m > 360 && m < 1350;
    const laadtAuto = !winter && licht && m > 660 && m < 990;
    const batterijLaadt = kw > 1.5;
    const batterij = Math.round(Math.max(18, Math.min(96, winter ? 40 + kw * 10 : 30 + (Math.min(m, 1020) - 540) / 7)));
    const auto = winter ? 55 : Math.round(Math.min(100, 40 + Math.max(0, Math.min(m, 990) - 660) / 6));
    const lamp = avond || (winter && m < 600);
    const screensDicht = avond || (!winter && m > 780 && m < 1020);
    const voedt = !batterijLaadt && avond && batterij > 20;
    const model = {
      tijd, seizoen: winter ? 'winter' : undefined, weer: winter && m < 720 ? 'sneeuw' : undefined,
      zon: { stand, hoogte, aandeel: Math.min(1, kw / 4), panelen: 12 },
      wolken: winter ? 0.4 : 0.15,
      etages: [
        { naam: 'Begane grond', kamers: [
          { naam: 'Keuken', gewicht: 0.9, temp: winter ? '20,4°' : '23,2°', zin: droger ? 'droger, op zon' : lamp ? 'licht aan' : 'rustig', stand: droger ? 'wacht' : lamp ? 'lamp' : 'goed', apparaten: [{ soort: 'droger', aan: droger, x: 0.6 }, { soort: 'lamp', aan: lamp, x: 0.3 }] },
          { naam: 'Woonkamer', gewicht: 1.35, temp: winter ? '20,8°' : koelt ? '23,6°' : '24,4°', zin: koelt ? 'koelt op zon' : warmt ? 'warmtepomp verwarmt' : 'op temperatuur', stand: koelt ? 'koelt' : warmt ? 'warmt' : 'goed', apparaten: [{ soort: 'airco', aan: koelt, stand: 'koelt' }, { soort: 'vloer' }, { soort: 'bank' }, { soort: 'lamp', aan: avond, x: 0.5 }] },
        ] },
        { naam: 'Eerste', kamers: [
          { naam: 'Badkamer', gewicht: 0.8, temp: winter ? '21,5°' : '23,5°', zin: 'op temperatuur', stand: 'goed', apparaten: [{ soort: 'vloer' }] },
          { naam: 'Slaapkamer', gewicht: 1.3, temp: winter ? '18,1°' : '22,6°', zin: screensDicht ? 'screens dicht' : 'screens open', apparaten: [{ soort: 'screen', dicht: screensDicht ? 0.85 : 0.05 }, { soort: 'radiator' }] },
        ] },
        { dak: true, kamers: [{ naam: 'Zolder', temp: winter ? '17,2°' : '25,4°', zin: winter ? 'wacht op zon' : licht ? 'wacht op meer zon' : 'rustig', stand: licht ? 'wacht' : 'rust', apparaten: [{ soort: 'airco', aan: false }] }] },
      ],
      buitenunit: { aan: warmt || koelt },
      batterij: { procent: batterij, stand: batterijLaadt ? 'laadt' : voedt ? 'ontlaadt' : 'rust' },
      auto: { procent: auto, stand: laadtAuto ? 'laadt' : 'rust', bron: 'zon', kleur: '#7f97b0' },
      net: true,
      stromen: [
        ...(kw > 0.3 ? [{ van: 'zon', naar: 'kamer:Woonkamer', sterkte: 0.6 }] : []),
        ...(batterijLaadt ? [{ van: 'zon', naar: 'batterij', sterkte: 0.4 }] : []),
        ...(laadtAuto ? [{ van: 'zon', naar: 'auto', sterkte: 0.5 }] : []),
      ],
      labels: [
        ...(kw > 0 ? [{ bij: 'panelen', titel: `${kommaKw(kw)} kW`, groot: true, toon: 'zon', regels: ['de panelen, nu'], dx: 64, dy: -70 }] : []),
        { bij: 'batterij', titel: `Batterij ${batterij}%`, toon: 'mint', regels: [batterijLaadt ? 'laadt op zon' : voedt ? 'voedt het huis' : 'staat klaar'], dx: 24, dy: 92 },
      ],
    };
    const kop = winter
      ? (warmt && kw > 0.8 ? 'De warmtepomp draait op zon' : warmt ? 'Het huis warmt op' : 'Het huis rust')
      : koelt ? 'Het huis koelt op zon' : voedt && m < 1380 ? 'De batterij neemt het over' : licht ? 'Het huis wacht op zon' : 'Het huis rust';
    const stroom = kw > 0
      ? `${kommaKw(kw)} kW van de panelen${koelt ? ', ook naar de airco' : warmt ? ', naar de warmtepomp' : ''}${batterijLaadt ? ' en de batterij' : ''}.${voedt ? ` De batterij (${batterij}%) vult aan.` : ''}`
      : `Geen zon. ${voedt ? `De batterij (${batterij}%) voedt het huis.` : 'Wat het huis gebruikt, komt van het net, op het daltarief.'}`;
    const lucht = tijd === 'nacht' ? 'lucht-nacht' : tijd === 'avond' ? 'lucht-avond' : tijd === 'ochtend' ? 'lucht-ochtend' : 'lucht-dag';
    return { model, kop, stroom, lucht, kw, batterij, auto, droger, koelt, warmt };
  }

  /** De baan onder de dag: nacht, zon, wat er gebeurt, en waar je bent. Breedte b in eenheden van de viewBox. */
  function baan(m, s, b = 640, klein = false) {
    const [op, onder] = ZON[s];
    const x = (t) => (t / 1440) * b;
    const piek = s === 'winter' ? 26 : 50;
    const punten = [];
    for (let t = op; t <= onder; t += 10) punten.push(`${x(t).toFixed(1)},${(58 - Math.sin((Math.PI * (t - op)) / (onder - op)) * piek).toFixed(1)}`);
    const gebeurt = s === 'winter'
      ? [[390, 'warmtepomp', '#ff7a4d'], [700, 'zon', '#f7b548']]
      : [[690, 'droger', '#f7b548'], [990, 'auto vol', '#6ee7b7'], [1230, 'screens', '#6fd3ff']];
    const tekst = klein ? 9.5 : 10.5;
    return `
      <rect x="0" y="56" width="${x(op)}" height="4" rx="2" fill="#8f86ff" opacity="0.35"/>
      <rect x="${x(op)}" y="56" width="${x(onder) - x(op)}" height="4" rx="2" fill="#f7b548" opacity="0.5"/>
      <rect x="${x(onder)}" y="56" width="${b - x(onder)}" height="4" rx="2" fill="#8f86ff" opacity="0.35"/>
      <polyline points="${punten.join(' ')}" fill="none" stroke="#f7b548" stroke-width="2" stroke-dasharray="2 4" opacity="0.7"/>
      ${gebeurt.map(([t, w, k]) => `<circle cx="${x(t)}" cy="58" r="4" fill="${k}"/>${klein ? '' : `<text x="${x(t)}" y="46" fill="#b8c4cf" font-size="${tekst}" font-family="Figtree" text-anchor="middle" font-weight="600">${w}</text>`}`).join('')}
      ${[0, 6, 12, 18, 24].map((u) => `<text x="${x(u * 60)}" y="76" fill="#7f8e9c" font-size="${tekst}" font-family="Figtree" text-anchor="${u === 0 ? 'start' : u === 24 ? 'end' : 'middle'}">${String(u).padStart(2, '0')}</text>`).join('')}
      <line x1="${x(m)}" y1="${klein ? 18 : 4}" x2="${x(m)}" y2="62" stroke="#eef3f7" stroke-width="2"/>
      <circle cx="${x(m)}" cy="58" r="8" fill="#eef3f7" stroke="#8f86ff" stroke-width="3"/>
      ${klein ? '' : `<text x="${x(m)}" y="0" fill="#eef3f7" font-size="11.5" font-family="Figtree" text-anchor="middle" font-weight="700">${uur(m)}</text>`}`;
  }

  global.voorbeeldhuis = { ZON, DATUM, uur, moment, baan };
})(window);
