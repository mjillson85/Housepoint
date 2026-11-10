// Small things: the screen stays awake while pointing, distances in feet and miles, price per square foot (card and Saved).
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8789);
const ORIGIN = 'http://localhost:8789';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
// A fake screen wake lock that counts requests and releases, and a fake document.hidden.
await page.evaluateOnNewDocument(() => {
  window.__wake = { req: 0, rel: 0, delay: 0, live: [] }; window.__hidden = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
    window.__wake.req++;
    if (window.__wake.delay) await new Promise((r) => setTimeout(r, window.__wake.delay));
    const l = new EventTarget(); l.released = false;
    l.release = async () => { if (!l.released) { l.released = true; window.__wake.rel++; l.dispatchEvent(new Event('release')); } };
    window.__wake.live.push(l); return l;
  } } });
});
await page.goto(ORIGIN + '/?demo=1'); await sleep(500);
const wake = () => page.evaluate(() => ({ req: window.__wake.req, rel: window.__wake.rel, held: !!window.__hp.wakeLock && !window.__hp.wakeLock.released }));

// 1. Screen awake
let w = await wake();
check(w.req === 0, 'start screen: the screen isn’t kept awake');
await page.click('#goPoint'); await sleep(600);
w = await wake();
check(w.req === 1 && w.held, 'pointing: the screen is kept awake ' + JSON.stringify(w));
await page.click('#toMap'); await sleep(300);
w = await wake();
check(w.rel === 1 && !w.held, 'map: the screen may dim again ' + JSON.stringify(w));
await page.click('#mapToPoint'); await sleep(400);
w = await wake();
check(w.req === 2 && w.held, 'back to pointing: kept awake again ' + JSON.stringify(w));
// The phone drops the lock in the background; coming back asks again.
await page.evaluate(() => { window.__hidden = true; window.__wake.live.forEach((l) => l.release()); document.dispatchEvent(new Event('visibilitychange')); });
await sleep(200);
await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
await sleep(400);
w = await wake();
check(w.req === 3 && w.held, 'back from the background while pointing: kept awake again ' + JSON.stringify(w));
// Granted only after you'd already left for the map: let go of it straight away.
await page.evaluate(() => { window.__wake.delay = 600; });
await page.click('#toMap'); await sleep(200); await page.click('#mapToPoint'); await sleep(100); await page.click('#toMap'); await sleep(1000);
w = await wake();
check(!w.held && w.req - w.rel === 0, 'a lock granted after leaving pointing is let go ' + JSON.stringify(w));
await page.evaluate(() => { window.__wake.delay = 0; });

// 2. Feet and miles
const f = await page.evaluate(() => [3, 9, 30.5, 127, 160, 200, 400].map((m) => window.__hp.feet(m)));
check(JSON.stringify(f) === JSON.stringify(['10 ft', '30 ft', '100 ft', '420 ft', '520 ft', '0.1 mi', '0.2 mi']), 'distances in feet, then miles: ' + f.join(', '));
await page.click('#mapToPoint'); await sleep(500);
await page.evaluate(() => { window.__hp.S.beta = 90; window.__hp.setHeading(0); }); await sleep(900);   // at the house across the lawn
const live = await page.$eval('#liveLabel', (el) => el.innerText);
const gps = await page.$eval('#gpsTxt', (el) => el.textContent);
check(/\d+ ft away/.test(live) && !/\d m away/.test(live), 'the label says how far in feet: ' + live.replace(/\n/g, ' | '));
check(/^GPS ±\d+ ft$/.test(gps), 'GPS accuracy in feet: ' + gps);
await page.click('#shutter'); await sleep(1500);
const card = await page.$eval('#cardBody', (el) => el.innerText);
check(/\d+ ft [NSEW]{1,2}\b/.test(card) && !/\d+ m [NSEW]{1,2}\b/.test(card), 'the card says how far and which way, in feet: ' + (card.match(/\d+ (ft|m) [NSEW]{1,2}/) || [''])[0]);

// 3. Price per square foot
const pf = await page.evaluate(() => {
  const ago = (y) => new Date(Date.now() - y * 3.156e10), P = window.__hp.perSqft;
  const base = (o) => ({ r0: { RES_AREA: 2000, TOTAL_VAL: 600000 }, sales: [{ p: 500000, d: ago(3) }], region: { id: 'MA' }, condo: false, park: false, isHome: true, ...o });
  return [P(base()), P(base({ sales: [{ p: 300000, d: ago(15) }] })), P(base({ region: { id: 'NJ' }, sales: [{ p: 300000, d: ago(15) }] })), P(base({ condo: true })),
    P(base({ multiSale: true })), P(base({ sales: [{ p: 1, d: ago(1) }] })), P(base({ r0: { RES_AREA: 0, TOTAL_VAL: 600000 } })), P(base({ isHome: false }))].map((x) => (x ? `${x.kind}:${Math.round(x.v)}` : null));
});
check(JSON.stringify(pf) === JSON.stringify(['sale:250', 'value:300', null, null, 'value:300', 'value:300', null, null]),
  'per ft²: a recent sale; else the value; none in New Jersey from value, for condos, without a living area, or for a business: ' + JSON.stringify(pf));
check(/(Sale|Value) per ft²\s*\$\d{2,4}\b/i.test(card), 'the card shows price per ft²: ' + (card.match(/(Sale|Value) per ft²\s*\$\d+/i) || ['none'])[0].replace(/\s+/g, ' '));
await page.click('#saveBtn'); await sleep(400);
await page.evaluate(() => document.querySelector('.grab').click()); await sleep(300);
await page.evaluate(() => window.__hp.openPanel('saved')); await sleep(400);
const saved = await page.$eval('#panelBody', (el) => el.innerText);
check(/Per ft²\s+\$\d{2,4}/.test(saved), 'Saved: a per ft² row to compare ' + (saved.match(/Per ft²[^\n]*/) || [''])[0]);

check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
await browser.close(); srv.close();
