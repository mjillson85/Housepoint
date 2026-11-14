import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${HP_ROOT}/index.html?demo=1`);
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => window.__hp.setHeading(15)); await new Promise(r => setTimeout(r, 400));
const label = await page.$eval('#liveLabel', el => el.innerText.replace(/\n/g, ' | '));
console.log('label:', label);
console.log(/\d/.test(label) ? 'PASS the live label names a house' : 'FAIL the live label is empty: ' + label);
await page.screenshot({ path: 'label.png' });
await page.click('#liveLabel'); await new Promise(r => setTimeout(r, 900));
const opened = await page.$eval('#sheet', el => el.classList.contains('open'));
console.log(opened ? 'PASS tapping the label opens the card' : 'FAIL tapping the label didn’t open the card');
console.log(errors.length ? 'FAIL page errors: ' + errors.join(' | ') : 'errors: none');
await browser.close();
