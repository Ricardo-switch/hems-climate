// Maakt PNG-schermafdrukken van de schetsen van ontwerp 2, met de Playwright uit backend/.
// Gebruik: node render.cjs Wand-Thuis.html:1280:800 Thuis.html:390:844
// Een stand met een hash wordt een eigen plaatje: Wand-Inrichten.html#warmte:1280:800 geeft Wand-Inrichten-warmte.png.
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.join(__dirname, '../../backend/node_modules/playwright'));

const root = __dirname;
const out = path.join(root, 'screens');
const jobs = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const [bestand, w, h, full] = job.split(':');
    const [file, hash] = bestand.split('#');
    const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(e.message));
    await page.goto(pathToFileURL(path.join(root, file)).href + (hash ? `#${hash}` : ''));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const name = path.basename(file).replace(/\.html$/, '') + (hash ? `-${hash}` : '') + '.png';
    await page.screenshot({ path: path.join(out, name), animations: 'disabled', fullPage: full === 'vol' });
    console.log(fouten.length ? `FOUT ${name}: ${fouten.join(' | ')}` : `ok ${name}`);
    await page.close();
  }
  await browser.close();
})();
