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

// Held on its side. An iPhone's heading is where the phone's top points, so turned sideways it's 90° off the camera unless
// worked out from the tilt; Android's is already the camera's. The tilt also says how it's held and where the camera looks.
const p3 = await newPage('/?demo=1&debug=1');
await p3.click('#goPoint'); await sleep(900);
const raw = (pg, o) => pg.evaluate((o) => { const e = new Event(o.abs ? 'deviceorientationabsolute' : 'deviceorientation'); Object.assign(e, o); window.dispatchEvent(e);
  const { S, phonePose, camElev, arPitch } = window.__hp; return { h: Math.round(S.rawHeading), pose: phonePose(), elev: Math.round(camElev()), pitch: Math.round(arPitch()) }; }, o);
// The iPhone's heading is used as the iPhone gives it, whichever way the phone is held: working the camera's direction out
// from the tilt instead (on the theory that it gives where the top points) jumped around upright and pointed the wrong way
// on its side on a real phone (Nov 2026).
const iphone = [];
for (const [b, g] of [[85, 0], [80, 5], [0, -90], [0, 90], [10, -100], [80, 180], [40, -60]]) {
  const x = await raw(p3, { alpha: 123, beta: b, gamma: g, webkitCompassHeading: 37, webkitCompassAccuracy: 10 });
  if (x.h !== 37) iphone.push(`beta ${b} gamma ${g}: ${x.h}`);
}
check(!iphone.length, `iPhone: its heading is used as given, upright, leaning, on its side, tipped back ${iphone.join('; ')}`);
let r = await raw(p3, { alpha: 0, beta: 0, gamma: -90, webkitCompassHeading: 10, webkitCompassAccuracy: 10 });
check(r.pose === 'sideways' && r.elev === 0, `on its side: the tilt still says so, and the camera is level: ${JSON.stringify(r)}`);
// Android: the W3C reading, the same camera direction whichever way the phone is turned
const a1 = await raw(p3, { abs: true, absolute: true, alpha: 350, beta: 90, gamma: 0 }), a2 = await raw(p3, { abs: true, absolute: true, alpha: 80, beta: 0, gamma: -90 });
check(a1.h === 10 && a2.h === 10 && a2.pose === 'sideways', `Android: portrait and on its side give the same camera direction: ${JSON.stringify([a1, a2])}`);
// Where the camera looks, from either browser's angles: an iPhone tipped back past upright reports beta 80 and gamma 180
r = await raw(p3, { alpha: 0, beta: 100, gamma: 0, webkitCompassHeading: 10 });
const r2 = await raw(p3, { alpha: 180, beta: 80, gamma: 180, webkitCompassHeading: 10 });
check(r.pitch === 10 && r2.pitch === 10, `tipped back to look up: +10° in both browsers' angles: ${JSON.stringify([r, r2])}`);
r = await raw(p3, { alpha: 0, beta: 0, gamma: -90, webkitCompassHeading: 10 });
check(r.elev === 0 && r.pose === 'sideways', 'on its side and level: the camera is level (no "hold your phone up")');
r = await raw(p3, { alpha: 0, beta: 10, gamma: 5, webkitCompassHeading: 10 });
check(r.pose === 'flat' && r.elev < -55, `lying nearly flat: the camera's at the ground: ${JSON.stringify(r)}`);
await sleep(400); const dbg = await p3.$eval('#debug', (el) => el.textContent);
check(/gamma -?\d+° · flat · camera -\d+°/.test(dbg), 'debug overlay shows the pose and the camera’s angle: ' + (/tilt[^\n]*/.exec(dbg) || [''])[0]);
// Rotation lock on, phone on its side (the screen stays portrait): the aim circle moves to the screen's middle (the camera's
// middle) and the mini map, label, hint and button icons turn to stay upright for the person holding it. Not in between,
// and not when the screen turns too.
const turned = async (b, g) => { await raw(p3, { alpha: 0, beta: b, gamma: g, webkitCompassHeading: 10 }); await sleep(450);
  return p3.evaluate(() => { const r = document.querySelector('#reticle').getBoundingClientRect(), rw = getComputedStyle(document.querySelector('#radarWrap')).transform;
    return { on: document.body.classList.contains('turned'), rot: document.body.style.getPropertyValue('--uirot'), ry: Math.round(r.top + r.height / 2), radar: rw === 'none' ? 0 : Math.round(Math.atan2(+rw.split(/[(,]/)[2], +rw.split(/[(,]/)[1]) * 180 / Math.PI) }; }); };
let tu = await turned(0, -90);
check(tu.on && tu.rot === '90deg' && tu.ry === 422 && tu.radar === 90, `on its side, top to the left: turned 90°, aim circle in the middle, mini map turned: ${JSON.stringify(tu)}`);
tu = await turned(0, 90);
check(tu.on && tu.rot === '-90deg' && tu.radar === -90, `on its side, top to the right: turned −90°: ${JSON.stringify(tu)}`);
tu = await turned(40, 60);      // part-way round (about 46°): stays as it was
check(tu.on && tu.rot === '-90deg', `part-way back: no flicker, stays turned: ${JSON.stringify(tu)}`);
tu = await turned(85, 0);
check(!tu.on && tu.rot === '0deg' && tu.ry < 422, `upright again: back to normal: ${JSON.stringify(tu)}`);
await p3.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
tu = await turned(0, -90);
check(!tu.on, 'on its side with the screen turned too (landscape): nothing to turn');
await p3.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await raw(p3, { alpha: 0, beta: 10, gamma: 5, webkitCompassHeading: 10 }); await sleep(200);
const log = await p3.evaluate(() => (window.__hp.S.sensLog || []).slice(-1)[0]);
check(log && 'ios' in log && 'b' in log && 'g' in log && 'used' in log && 'scr' in log && (await p3.$('#dbgCopy')) !== null, 'debug mode keeps the raw readings, with a Copy readings button: ' + JSON.stringify(log));
check(!p3.errors.length, 'no page errors (on its side) ' + p3.errors.join('; '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
