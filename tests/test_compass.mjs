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
let r = await raw(p3, { alpha: 0, beta: 85, gamma: 0, webkitCompassHeading: 10, webkitCompassAccuracy: 10 });
check(r.h === 10 && r.pose === 'portrait', `iPhone upright in portrait: heading as given (10°): ${JSON.stringify(r)}`);
r = await raw(p3, { alpha: 0, beta: 0, gamma: -90, webkitCompassHeading: 10, webkitCompassAccuracy: 10 });
check(r.h === 100 && r.pose === 'sideways', `iPhone on its side, top to the left: the camera looks 90° right of the top (100°): ${JSON.stringify(r)}`);
r = await raw(p3, { alpha: 0, beta: 0, gamma: 90, webkitCompassHeading: 10, webkitCompassAccuracy: 10 });
check(r.h === 280 && r.pose === 'sideways', `iPhone on its side, top to the right: 90° left of the top (280°): ${JSON.stringify(r)}`);
r = await raw(p3, { alpha: 0, beta: 10, gamma: -100, webkitCompassHeading: 10, webkitCompassAccuracy: 10 });   // iPhones' angles for this
check(Math.abs(r.h - 100) <= 3 && r.elev === 10 && r.pose === 'sideways', `iPhone on its side, tipped back to look up: still ~100°, camera 10° up: ${JSON.stringify(r)}`);
// Android: the W3C reading, the same camera direction whichever way the phone is turned
const a1 = await raw(p3, { abs: true, absolute: true, alpha: 350, beta: 90, gamma: 0 }), a2 = await raw(p3, { abs: true, absolute: true, alpha: 80, beta: 0, gamma: -90 });
check(a1.h === 10 && a2.h === 10 && a2.pose === 'sideways', `Android: portrait and on its side give the same camera direction: ${JSON.stringify([a1, a2])}`);
// Where the camera looks, from either browser's angles: an iPhone tipped back past upright reports beta 80 and gamma 180
r = await raw(p3, { alpha: 0, beta: 100, gamma: 0, webkitCompassHeading: 10 });
const r2 = await raw(p3, { alpha: 180, beta: 80, gamma: 180, webkitCompassHeading: 10 });
check(r.pitch === 10 && r2.pitch === 10, `tipped back to look up: +10° in both browsers' angles: ${JSON.stringify([r, r2])}`);
// An iPhone facing north, tipped back to look up: its top leans back past upright, so the heading it gives flips to 180°;
// the camera's direction is still north.
r = await raw(p3, { alpha: 0, beta: 80, gamma: 180, webkitCompassHeading: 180, webkitCompassAccuracy: 10 });
check(r.h === 0 || r.h === 360, `iPhone tipped back to look up: the flipped heading (180°) still gives the camera's north: ${JSON.stringify(r)}`);
// Every pose but flat, against the camera's direction worked out here from the rotation itself (the iPhone heading taken as
// 360° − alpha): a small lean near upright, on its side, tipped back, part-way round.
const camHeading = (a, b, g) => { const [ca, sa, cb, sb, cg, sg] = [a, a, b, b, g, g].map((d, i) => (i % 2 ? Math.sin : Math.cos)(d * Math.PI / 180));
  // R = Rz(a)·Rx(b)·Ry(g); the camera looks along −(third column); east is x, north is y
  const z = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
  return ((Math.atan2(-z[0], -z[1]) * 180 / Math.PI) + 360) % 360; };
const poses = [[80, 5], [85, -15], [70, 30], [10, -100], [-20, 75], [60, 120], [40, -60]];
const errs = [];
for (const [b, g] of poses) {
  const T = 37, want = camHeading(360 - T, b, g);
  const got = (await raw(p3, { alpha: 0, beta: b, gamma: g, webkitCompassHeading: T, webkitCompassAccuracy: 10 })).h;
  const d = Math.abs(((got - want + 540) % 360) - 180); if (d > 1) errs.push(`beta ${b} gamma ${g}: ${got} vs ${Math.round(want)}`);
}
check(!errs.length, `iPhone heading is the camera's direction in every pose but flat (${poses.length} poses) ${errs.join('; ')}`);
r = await raw(p3, { alpha: 0, beta: 15, gamma: 10, webkitCompassHeading: 37 });
check(r.h === 37 && r.pose === 'flat', `lying nearly flat: the top's direction is kept: ${JSON.stringify(r)}`);
r = await raw(p3, { alpha: 0, beta: 0, gamma: -90, webkitCompassHeading: 10 });
check(r.elev === 0 && r.pose === 'sideways', 'on its side and level: the camera is level (no "hold your phone up")');
r = await raw(p3, { alpha: 0, beta: 10, gamma: 5, webkitCompassHeading: 10 });
check(r.pose === 'flat' && r.elev < -55, `lying nearly flat: the camera's at the ground: ${JSON.stringify(r)}`);
await sleep(400); const dbg = await p3.$eval('#debug', (el) => el.textContent);
check(/gamma -?\d+° · flat · camera -\d+°/.test(dbg), 'debug overlay shows the pose and the camera’s angle: ' + (/tilt[^\n]*/.exec(dbg) || [''])[0]);
check(!p3.errors.length, 'no page errors (on its side) ' + p3.errors.join('; '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
