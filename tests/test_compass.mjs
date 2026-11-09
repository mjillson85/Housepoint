// Compass accuracy (iPhone's webkitCompassAccuracy): a hint, a red dot on the heading pill and a one-time toast when it's poor
// (worse than ±30°, or -1 = needs calibrating), nothing when it's good, and the value on the ?debug=1 overlay.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8782);
const ORIGIN = 'http://localhost:8782';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(ORIGIN) ? req.continue() : req.abort()));
  await page.setGeolocation({ latitude: 42.0, longitude: -71.0, accuracy: 5 });
  await page.goto(ORIGIN + url);
  return page;
}
// An iPhone-style reading: heading plus accuracy (or, with acc undefined, an Android-style one with neither).
const send = (page, heading, acc, n = 12) => page.evaluate((h, a, k) => {
  for (let i = 0; i < k; i++) {
    const e = new Event('deviceorientation');
    Object.assign(e, { alpha: 0, beta: 80, gamma: 0 });
    if (a !== null) { e.webkitCompassHeading = h; e.webkitCompassAccuracy = a; }
    window.dispatchEvent(e);
  }
}, heading, acc === undefined ? null : acc, n);
const look = (page) => page.evaluate(() => ({ hint: document.querySelector('#hint').textContent, dot: document.querySelector('#hdgPill .dot').className,
  debug: (document.querySelector('#debug') || {}).textContent || '', acc: window.__hp.S.compassAcc }));
const tap = async (page) => { await page.evaluate(() => { document.querySelector('#toast').textContent = ''; }); await page.click('#shutter'); await sleep(150);
  const t = await page.$eval('#toast', (el) => el.textContent); await sleep(500); await page.evaluate(() => document.querySelector('.grab').click()); await sleep(200); return t; };

const page = await newPage('/?demo=1&debug=1');
await page.click('#goPoint'); await sleep(900);
await send(page, 10, 10); await sleep(250);
let s = await look(page);
console.log('good:', JSON.stringify(s));
check(!/Compass is off/.test(s.hint), 'good compass (±10°): no hint');
check(s.dot === 'dot ok', 'good compass: green dot on the heading pill');
check(/acc ±10°/.test(s.debug.split('\n')[0]), 'debug overlay shows the compass accuracy');
check(!/compass/i.test(await tap(page)), 'good compass: no compass toast on the shutter');

await send(page, 10, 90, 1); await sleep(250);
s = await look(page);
check(!/Compass is off/.test(s.hint) && s.dot === 'dot ok', 'one bad reading doesn’t flash a warning');

await send(page, 10, 25); await sleep(250);
check((await look(page)).dot === 'dot', 'fair compass (±25°): amber dot, no hint');
check(!/Compass is off/.test((await look(page)).hint), 'fair compass: no hint');

await send(page, 10, 45); await sleep(250);
s = await look(page);
console.log('poor:', JSON.stringify(s));
check(/Compass is off\. Wave your phone in a figure 8/.test(s.hint), 'poor compass (±45°): hint');
check(s.dot === 'dot bad', 'poor compass: red dot');
check(/acc ±45°.*POOR/.test(s.debug.split('\n')[0]), 'debug overlay marks it poor');
check(/compass is off/i.test(await tap(page)), 'poor compass: toast when you tap the shutter');
check(!/compass/i.test(await tap(page)), 'the toast shows once per episode');
check(await page.evaluate(() => document.querySelector('#sheet').classList.contains('open') === false), 'the card still opened and closed (nothing blocked)');

await send(page, 10, 28); await sleep(250);        // just inside the line: not yet "fixed", so the warning doesn't flicker at the edge
s = await look(page);
check(/Compass is off/.test(s.hint) && s.dot === 'dot bad', 'just back inside the line (±28°): warning stays');
await send(page, 10, 24); await sleep(250);
s = await look(page);
check(!/Compass is off/.test(s.hint) && s.dot === 'dot', 'clearly better (±24°): warning gone');
await send(page, 10, 10); await sleep(250);
s = await look(page);
check(!/Compass is off/.test(s.hint) && s.dot === 'dot ok', 'compass fixed: warning gone');
await send(page, 10, -1); await sleep(250);
s = await look(page);
console.log('needs calibrating:', JSON.stringify(s));
check(/Compass is off/.test(s.hint) && s.dot === 'dot bad', '-1 (needs calibrating): hint and red dot');
check(/needs calibrating/.test(s.debug.split('\n')[0]), 'debug overlay says it needs calibrating');
check(/compass is off/i.test(await tap(page)), 'a new bad episode toasts again');
check(!page.errors.length, 'no page errors ' + page.errors.join('; '));

// Android-style readings carry no accuracy: no dot, no hint.
const p2 = await newPage('/?demo=1&debug=1');
await p2.click('#goPoint'); await sleep(900);
await send(p2, 0, undefined); await sleep(250);
s = await look(p2);
check(s.dot === 'dot hidden' && !/Compass is off/.test(s.hint) && s.acc === null, 'no accuracy reported: no dot, no warning');
check(/acc —/.test(s.debug.split('\n')[0]), 'debug overlay shows a dash with no accuracy');
check(!p2.errors.length, 'no page errors (no accuracy) ' + p2.errors.join('; '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
