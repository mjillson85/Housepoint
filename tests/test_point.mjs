import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|Access to manifest at 'file:/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(`file://${HP_ROOT}/index.html?demo=1`);
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.__hp.setHeading(15)); await new Promise(r => setTimeout(r, 300));
await page.click('#shutter'); await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'n_card.png' });
// share image
const dataUrl = await page.evaluate(async () => { const S = window.__hp.S; const b = await window.__hp.makeShareImage(S.candidates[0]); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); });
fs.writeFileSync('n_share.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
// share button path (no navigator.share in headless) -> preview overlay
await page.click('#shareC'); await new Promise(r => setTimeout(r, 1500));
const shareOn = await page.$eval('#shareView', el => !el.classList.contains('hidden'));
console.log(shareOn ? 'PASS sharing shows the preview' : 'FAIL sharing didn’t show the preview');
await page.click('#svClose');
// panel
await page.evaluate(() => window.__hp.openPanel('near')); await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'n_panel.png' });
console.log('panel text:\n' + (await page.$eval('#panelBody', el => el.innerText)).slice(0, 600));
await page.click('#panelBody .item'); await new Promise(r => setTimeout(r, 500));
const tapAddr = await page.$eval('#cardBody .addr', el => el.innerText), tapOpen = await page.$eval('#sheet', el => el.classList.contains('open'));
console.log('after tap, card addr:', tapAddr, '| sheet open:', tapOpen);
console.log(tapOpen && /\d+ \S/.test(tapAddr) ? 'PASS a nearby house opens its card' : 'FAIL nearby tap: ' + tapAddr);
await page.evaluate(() => window.__hp.openPanel('mine')); await new Promise(r => setTimeout(r, 300));
console.log('history:\n' + (await page.$eval('#panelBody', el => el.innerText)));
// map mode
await page.evaluate(() => { document.querySelector('#panel').classList.remove('open'); });
await page.click('#toMap'); await new Promise(r => setTimeout(r, 800));
await page.mouse.click(195, 420); await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => document.querySelector('#sheet').classList.remove('open'));
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'n_map.png' });
console.log(errors.length ? 'FAIL page errors: ' + errors.join(' | ') : 'errors: none');
await browser.close();
