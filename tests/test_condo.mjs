import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${HP_ROOT}/index.html?demo=1&debug=1`);
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 800));
const res = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S;
  // Make the lot south of the street (x 0..22, y -6..-34) a 6-unit condo complex.
  const L = S.local.find((l) => l.c[1] < -10 && l.c[1] > -30 && l.c[0] > 0 && l.c[0] < 22);
  const base = L.p.records[0];
  L.p.records = [1,2,3,4,5,6].map((u) => ({ ...base, SITE_ADDR: base.SITE_ADDR + ' UNIT ' + u, TOTAL_VAL: 400000 + u * 25000, USE_CODE: '102', LS_DATE: u === 6 ? '20241215' : '2024031' + u, LS_PRICE: u === 6 ? 1 : 380000 + u * 20000 }));   // unit 6: a $1 deed to a trust
  const out = { condo: hp.summarize(L.p).addr };
  // Stand just inside the condo lot's north edge (y = -8), i.e. on the complex grounds.
  const [la, lo] = S.proj.inv(10, -8); S.pos = { lat: la, lon: lo }; S.acc = 6;
  const pick = (h) => hp.findCandidates(la, lo, h).slice(0, 3).map((c) => (c.inside ? '[ON LOT] ' : '') + hp.summarize(c.L.p).addr + (c.inside ? ` (${Math.round(c.across)} m across)` : ` @${Math.round(c.dist)}m`));
  out.pointSouthAcrossComplex = pick(180);
  out.pointNorthOutOfComplex = pick(0);
  // Old behaviour check: someone on the sidewalk (outside any lot) still targets across-street houses
  const [la2, lo2] = S.proj.inv(10, 0);
  out.sidewalkNorth = hp.findCandidates(la2, lo2, 0).slice(0, 1).map((c) => (c.inside ? '[ON LOT] ' : '') + hp.summarize(c.L.p).addr);
  return out;
});
console.log(JSON.stringify(res, null, 1));
await page.evaluate(() => window.__hp.setHeading(180)); await new Promise(r => setTimeout(r, 400));
console.log('live label:', await page.$eval('#liveLabel', el => el.innerText.replace(/\n/g, ' | ')));
await page.click('#shutter'); await new Promise(r => setTimeout(r, 900));
console.log('card:', (await page.$eval('#cardBody', el => el.innerText)).split('\n').slice(0, 10).join(' | '));
await page.screenshot({ path: 'condo_card.png' });
const cardTxt = await page.$eval('#cardBody', el => el.innerText);
console.log(/Latest unit sale \$480k · Mar 2024/.test(cardTxt) && !/\$1 ·/.test(cardTxt) ? 'PASS $1 deed skipped; latest real unit sale shown' : 'FAIL condo sale line: ' + (cardTxt.match(/Latest[^\n]*|No market[^\n]*/) || [''])[0]);
console.log('debug overlay:', await page.$eval('#debug', el => el.innerText.replace(/\n/g, ' / ')));
// camera/map round trip still works
await page.click('.grab'); await new Promise(r => setTimeout(r, 400));
await page.click('#toMap'); await new Promise(r => setTimeout(r, 600));
await page.click('#mapToPoint'); await new Promise(r => setTimeout(r, 600));
console.log('back in point mode:', await page.evaluate(() => window.__hp.S.mode), '| fakecam/cam visible:', await page.evaluate(() => !document.querySelector('#fakecam').classList.contains('hidden') || !document.querySelector('#cam').classList.contains('hidden')));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
