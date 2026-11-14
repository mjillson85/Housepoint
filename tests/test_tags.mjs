import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${HP_ROOT}/index.html?demo=1`);
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.__hp.setHeading(15));
await page.click('#shutter'); await new Promise(r => setTimeout(r, 900));
await page.click('.grab'); await new Promise(r => setTimeout(r, 500));
await page.click('#toMap'); await new Promise(r => setTimeout(r, 900));
const mapOn = await page.$eval('#mapView', el => !el.classList.contains('hidden')), drawn = await page.$$eval('#mParcels path', els => els.length);
console.log('map visible:', mapOn, '| parcels drawn:', drawn, '| photo tiles:', await page.$$eval('#mImg image', els => els.length));
console.log(mapOn && drawn > 0 ? 'PASS the map opens with lots drawn' : 'FAIL the map: visible ' + mapOn + ', lots ' + drawn);
// Moving the map moves the drawn lots as one piece: the lot outlines aren't drawn again on every step of a drag
const mv = await page.evaluate(() => {
  const hp = window.__hp, g = document.querySelector('#mParcels'), d0 = g.innerHTML, t0 = g.getAttribute('transform');
  hp.S.map.center = { lat: hp.S.map.center.lat + 0.0002, lon: hp.S.map.center.lon + 0.0002 }; hp.drawMap();
  return { same: g.innerHTML === d0, moved: g.getAttribute('transform') !== t0 };
});
console.log(mv.same && mv.moved ? 'PASS panning the map moves the lots without redrawing them' : 'FAIL panning the map: ' + JSON.stringify(mv));
// ...but redraws them when the building outlines arrive, since a roof can mark a lot built (Wyoming, the basic card's regions)
const roofs = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S, g = document.querySelector('#mParcels');
  const L = S.local.find((l) => l.p.built); if (!L) return { err: 'no built lot' };
  L.p.built = false; S.bldgVer++; hp.drawMap(); const vacant = g.innerHTML;     // drawn as empty land
  L.p.built = true; S.bldgVer++; hp.drawMap();                                   // a roof arrives (setBuildings bumps the version)
  return { changed: g.innerHTML !== vacant };
});
console.log(roofs.changed ? 'PASS lots are drawn again when building outlines arrive' : 'FAIL the lots stayed as they were after the outlines arrived: ' + JSON.stringify(roofs));
await page.screenshot({ path: 'n_map.png' });
await page.mouse.click(250, 520); await new Promise(r => setTimeout(r, 500));
const mapAddr = await page.$eval('#cardBody .addr', el => el.innerText);
console.log('map card:', mapAddr, '| next button:', await page.$eval('#nextC', el => el.innerText));
console.log(/\d+ \S/.test(mapAddr) ? 'PASS tapping a lot on the map shows its address' : 'FAIL map card address: ' + mapAddr);
await page.click('#useHighlights').catch(() => {});
const dataUrl = await page.evaluate(async () => { const b = await window.__hp.makeShareImage(window.__hp.S.candidates[0]); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); });
fs.writeFileSync('n_share2.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(errors.length ? 'FAIL page errors: ' + errors.join(' | ') : 'errors: none');
await browser.close();
