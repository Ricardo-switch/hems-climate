// Het teken van SunArc (besluit 222) als bestanden: de zon op de horizon met
// stralen in mint, ijs en violet (schets design/app2/Logo.html). Eén tekening
// voor alles, zodat het icoon, de zijbalk en de add-on hetzelfde teken zijn.
//
// Draaien vanuit de repository: `node frontend/tools/iconen.cjs`. Maakt
//   frontend/kit/icoon.svg          het icoon met negen stralen (48 px en groter)
//   frontend/kit/icoon-klein.svg    vijf stralen, voor de zijbalk en kleiner
//   frontend/kit/merk.svg           het teken zonder vlak
//   frontend/kit/zon.svg            de zon als stem in rust, voor de kleine bollen
//   frontend/src/icoon-*.png        de app, ook maskable en de beta met een label
//   addon/icon.png, addon/logo.png  de add-on in Home Assistant
//   custom_components/smart_climate/brand/  de integratie (de assistent) in Home Assistant
// De PNG's tekent de Chromium van Playwright uit backend/.
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../backend/node_modules/playwright'));

const wortel = path.join(__dirname, '../..');
const KLEUREN = ['#6ee7b7', '#6fd3ff', '#8f86ff'];
const LENGTES = { 9: [0.56, 0.82, 0.68, 0.94, 1, 0.86, 0.66, 0.8, 0.54], 5: [0.7, 0.95, 1, 0.9, 0.68] };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function meng(t) {
  const d = t * (KLEUREN.length - 1);
  const i = Math.min(KLEUREN.length - 2, Math.floor(d));
  const a = hex(KLEUREN[i]), b = hex(KLEUREN[i + 1]), f = d - i;
  return '#' + a.map((x, k) => Math.round(x + (b[k] - x) * f).toString(16).padStart(2, '0')).join('');
}
const r2 = (x) => Math.round(x * 100) / 100;

/** Het teken in een viewBox van 120 × 64: de zon op y = 60, n stralen eromheen. */
function merk(id, n, { gloed = false } = {}) {
  const cx = 60, cy = 60, zon = 17, r0 = n === 9 ? 24 : 25, R = 57, dik = n === 9 ? 6.2 : 9.5;
  const defs = [
    `<radialGradient id="${id}z" cx="50%" cy="100%" r="100%"><stop offset="0" stop-color="#ffe7ad"/><stop offset="0.55" stop-color="#f7b548"/><stop offset="1" stop-color="#e58a3a"/></radialGradient>`,
  ];
  const delen = [];
  if (gloed) {
    defs.push(`<radialGradient id="${id}g" cx="50%" cy="100%" r="50%"><stop offset="0" stop-color="#f7b548" stop-opacity="0.42"/><stop offset="1" stop-color="#f7b548" stop-opacity="0"/></radialGradient>`);
    delen.push(`<rect x="0" y="4" width="120" height="56" fill="url(#${id}g)"/>`);
  }
  LENGTES[n].forEach((l, i) => {
    const a = ((180 - (180 / (n + 1)) * (i + 1)) * Math.PI) / 180;
    const ri = r0 + dik / 2, ru = ri + l * (R - ri - dik / 2);
    const [x1, y1, x2, y2] = [cx + ri * Math.cos(a), cy - ri * Math.sin(a), cx + ru * Math.cos(a), cy - ru * Math.sin(a)].map(r2);
    const kleur = meng(i / (n - 1));
    defs.push(`<linearGradient id="${id}s${i}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${kleur}" stop-opacity="0.55"/><stop offset="1" stop-color="${kleur}"/></linearGradient>`);
    delen.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#${id}s${i})" stroke-width="${dik}" stroke-linecap="round"/>`);
  });
  delen.push(`<path d="M${cx - zon} ${cy}A${zon} ${zon} 0 0 1 ${cx + zon} ${cy}Z" fill="url(#${id}z)"/>`);
  return { defs: defs.join(''), teken: delen.join('') };
}

/**
 * Het icoon in 100 × 100: een donker vlak met het teken iets onder het midden.
 * Maskable vult het hele vlak en houdt het teken binnen de veilige cirkel; de
 * beta krijgt een label eronder.
 */
function icoon({ n = 9, maskable = false, beta = false } = {}) {
  const m = merk('m', n);
  const klein = n === 5;
  const schaal = maskable ? 0.78 : 1;
  const plek = klein ? { x: 3, y: 22, b: 94 } : { x: 7, y: 25, b: 86 };
  const b = plek.b * schaal;
  const x = 50 - b / 2;
  const y = beta ? (maskable ? 20 : 18) : maskable ? 32 : plek.y;
  const vlak = maskable ? '<rect width="100" height="100" fill="url(#a)"/>' : '<rect width="100" height="100" rx="22.4" fill="url(#a)"/>';
  const gloed = klein ? '' : `<rect width="100" height="100"${maskable ? '' : ' rx="22.4"'} fill="url(#g)"/>`;
  const label = beta ? `<rect x="31" y="${maskable ? 64 : 70}" width="38" height="11" rx="5.5" fill="#eef3f7"/><text x="50" y="${maskable ? 72.2 : 78.2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="7.2" letter-spacing="0.6" fill="#0b1424">BETA</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2a4d"/><stop offset="1" stop-color="#0b1424"/></linearGradient><radialGradient id="g" cx="50%" cy="${beta ? 54 : 66}%" r="42%"><stop offset="0" stop-color="#f7b548" stop-opacity="0.3"/><stop offset="1" stop-color="#f7b548" stop-opacity="0"/></radialGradient>${m.defs}</defs>${vlak}${gloed}<svg x="${r2(x)}" y="${y}" width="${r2(b)}" height="${r2((b * 64) / 120)}" viewBox="0 0 120 64" overflow="visible">${m.teken}</svg>${label}</svg>\n`;
}

function teken(id) {
  const m = merk(id, 9, { gloed: true });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 64"><defs>${m.defs}</defs>${m.teken}</svg>\n`;
}

/**
 * Het teken met de naam, 250 × 100 op een doorzichtige grond. De add-on heeft
 * één logo voor licht en donker: Sun in zon, Arc in ijs, allebei leesbaar op
 * wit en op zwart. De integratie heeft er twee (`logo.png` en `dark_logo.png`).
 */
const LETTERS = { beide: ['#e0962c', '#3d9fd6'], licht: ['#0f1b2d', '#46566a'], donker: ['#eef3f7', '#b8c4cf'] };
function logo(soort) {
  const m = merk('l', 9, { gloed: soort === 'donker' });
  const [sun, arc] = LETTERS[soort];
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap"><style>html,body{margin:0;background:transparent}div{width:250px;height:100px;display:flex;align-items:center;gap:10px;justify-content:center}span{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:40px;letter-spacing:-0.035em;color:${sun}}span b{font-weight:700;color:${arc}}</style></head><body><div><svg width="96" height="51" viewBox="0 0 120 64" style="overflow:visible"><defs>${m.defs}</defs>${m.teken}</svg><span>Sun<b>Arc</b></span></div></body></html>`;
}

/** Het teken alleen, vierkant op een doorzichtige grond: het icoon van de integratie, op licht en donker. */
function vierkant() {
  const m = merk('v', 9);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${m.defs}</defs><svg x="3" y="24" width="94" height="50.13" viewBox="0 0 120 64" overflow="visible">${m.teken}</svg></svg>
`;
}

/** De zon als stem in rust (besluit 224): rond, twintig stralen, voor de kleine bollen. kit/zon.js laat hem bewegen. */
function rond() {
  const n = 20, c = 60, zon = 19, r0 = 26, R = 58, dik = 4.6;
  const defs = ['<radialGradient id="z" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#ffe7ad"/><stop offset="0.5" stop-color="#f7b548"/><stop offset="1" stop-color="#e58a3a"/></radialGradient>'];
  const lijnen = [];
  for (let i = 0; i < n; i++) {
    const a = ((180 - (360 / n) * i) * Math.PI) / 180;
    const l = [0.56, 0.82, 0.68, 0.94, 1, 0.86, 0.66, 0.8, 0.54][i % 9] * 0.92;
    const ri = r0 + dik / 2, ru = ri + l * (R - ri - dik / 2);
    const [x1, y1, x2, y2] = [c + ri * Math.cos(a), c - ri * Math.sin(a), c + ru * Math.cos(a), c - ru * Math.sin(a)].map(r2);
    const kleur = meng((1 + Math.cos(a)) / 2);
    defs.push(`<linearGradient id="s${i}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${kleur}" stop-opacity="0.5"/><stop offset="1" stop-color="${kleur}"/></linearGradient>`);
    lijnen.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#s${i})" stroke-width="${dik}" stroke-linecap="round"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${defs.join('')}</defs>${lijnen.join('')}<circle cx="${c}" cy="${c}" r="${zon}" fill="url(#z)"/></svg>
`;
}

(async () => {
  const schrijf = (p, s) => fs.writeFileSync(path.join(wortel, p), s);
  schrijf('frontend/kit/zon.svg', rond());
  schrijf('frontend/kit/icoon.svg', icoon());
  schrijf('frontend/kit/icoon-klein.svg', icoon({ n: 5 }));
  schrijf('frontend/kit/merk.svg', teken('t'));

  const browser = await chromium.launch();
  const png = async (inhoud, p, w, h = w, html = false, dichtheid = 1) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dichtheid });
    await page.setContent(html ? inhoud : `<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${inhoud}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(wortel, p), omitBackground: true });
    await page.close();
    console.log(`ok ${p}`);
  };
  for (const [voor, beta] of [['icoon', false], ['icoon-beta', true]]) {
    await png(icoon({ beta }), `frontend/src/${voor}-512.png`, 512);
    await png(icoon({ beta }), `frontend/src/${voor}-192.png`, 192);
    await png(icoon({ beta, maskable: true }), `frontend/src/${voor}-512-maskable.png`, 512);
  }
  await png(icoon(), 'addon/icon.png', 128);
  await png(logo('beide'), 'addon/logo.png', 250, 100, true);
  // De integratie (Home Assistant 2026.3 en later leest `brand/` in de integratie zelf).
  const brand = 'custom_components/smart_climate/brand';
  fs.mkdirSync(path.join(wortel, brand), { recursive: true });
  await png(vierkant(), `${brand}/icon.png`, 256);
  await png(vierkant(), `${brand}/icon@2x.png`, 512);
  await png(logo('licht'), `${brand}/logo.png`, 250, 100, true, 1);
  await png(logo('licht'), `${brand}/logo@2x.png`, 250, 100, true, 2);
  await png(logo('donker'), `${brand}/dark_logo.png`, 250, 100, true, 1);
  await png(logo('donker'), `${brand}/dark_logo@2x.png`, 250, 100, true, 2);
  await browser.close();
})();
