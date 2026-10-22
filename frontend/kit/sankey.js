/*
 * Een sankey op schaal: bronnen links, waar het heen ging rechts, de breedte
 * is de hoeveelheid. Klein en zonder bibliotheek.
 *
 * sankey.svg({ breedte, hoogte, bronnen: [{ id, naam, kleur }], doelen: [...], stromen: [{ van, naar, kwh }] })
 */
(function (global) {
  'use strict';
  function svg(o) {
    const B = o.breedte;
    const H = o.hoogte;
    const bw = 12;
    const som = (id, kant) => o.stromen.filter((s) => s[kant] === id).reduce((t, s) => t + s.kwh, 0);
    const fmt = (n) => Math.round(n).toLocaleString('nl-NL');
    // Links zo veel ruimte als de namen en getallen nodig hebben, geschat op de tekengrootte.
    const nodigLinks = Math.max(...o.bronnen.map((b) => Math.max(b.naam.length * 8.6, `${fmt(som(b.id, 'van'))} kWh`.length * 7.2))) + 16;
    const xL = Math.max(o.links ?? 0, Math.ceil(nodigLinks));
    const xR = B - (o.rechts ?? 230);
    const totaal = o.bronnen.reduce((t, b) => t + som(b.id, 'van'), 0);
    const gatL = 18;
    const gatR = 12;
    const schaal = (H - 20 - Math.max(gatL * (o.bronnen.length - 1), gatR * (o.doelen.length - 1))) / totaal;
    const plek = {};
    let y = 10;
    for (const b of o.bronnen) {
      const h = som(b.id, 'van') * schaal;
      plek[b.id] = { y, h, vrij: y };
      y += h + gatL;
    }
    y = 10;
    for (const d of o.doelen) {
      const h = som(d.id, 'naar') * schaal;
      plek[d.id] = { y, h, vrij: y };
      y += h + gatR;
    }
    const kleur = Object.fromEntries([...o.bronnen, ...o.doelen].map((x) => [x.id, x.kleur]));
    const banden = o.stromen
      .map((s) => {
        const h = s.kwh * schaal;
        const a = plek[s.van];
        const b = plek[s.naar];
        const y0 = a.vrij;
        const y1 = b.vrij;
        a.vrij += h;
        b.vrij += h;
        const m = (xL + bw + xR) / 2;
        return `<path d="M ${xL + bw} ${y0} C ${m} ${y0}, ${m} ${y1}, ${xR} ${y1} L ${xR} ${y1 + h} C ${m} ${y1 + h}, ${m} ${y0 + h}, ${xL + bw} ${y0 + h} Z" fill="${kleur[s.van]}" opacity="0.32"/>`;
      })
      .join('');
    const lbL = o.bronnen
      .map((b) => {
        const p = plek[b.id];
        return `<rect x="${xL}" y="${p.y}" width="${bw}" height="${p.h}" rx="4" fill="${b.kleur}"/>
          <text x="${xL - 12}" y="${p.y + p.h / 2 - 2}" text-anchor="end" font-family="Figtree" font-weight="700" font-size="14" fill="#EEF3F7">${b.naam}</text>
          <text x="${xL - 12}" y="${p.y + p.h / 2 + 15}" text-anchor="end" font-family="Figtree" font-size="12.5" fill="#B8C4CF">${fmt(som(b.id, 'van'))} kWh</text>`;
      })
      .join('');
    const lbR = o.doelen
      .map((d) => {
        const p = plek[d.id];
        return `<rect x="${xR}" y="${p.y}" width="${bw}" height="${p.h}" rx="4" fill="${d.kleur}"/>
          <text x="${xR + bw + 12}" y="${p.y + p.h / 2 + 5}" font-family="Figtree" font-size="14" fill="#EEF3F7"><tspan font-weight="700">${d.naam}</tspan><tspan fill="#B8C4CF"> ${fmt(som(d.id, 'naar'))} kWh</tspan></text>`;
      })
      .join('');
    // Met `vul` vult hij de breedte van zijn vak en schaalt hij mee.
    return `<svg viewBox="0 0 ${B} ${H}" ${o.vul ? 'width="100%" style="height: auto; display: block"' : `width="${B}" height="${H}"`} role="img" aria-label="${o.beschrijving ?? ''}">${banden}${lbL}${lbR}</svg>`;
  }
  global.sankey = { svg };
})(window);
