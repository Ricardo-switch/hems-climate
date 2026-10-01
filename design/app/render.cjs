// Maakt PNG-screenshots van de wandschermen (en de tablet-aan-de-muur-compositie).
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.join(__dirname, '../../backend/node_modules/playwright'));

const root = __dirname;
const out = path.join(root, 'screens');
const jobs = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const job of jobs) {
    const [file, w, h] = job.split(':');
    const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(path.join(root, file)).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const name = path.basename(file).replace(/\.dc\.html$|\.html$/, '') + '.png';
    await page.screenshot({ path: path.join(out, name), animations: 'disabled' });
    console.log('ok', name);
    await page.close();
  }
  await browser.close();
})();
