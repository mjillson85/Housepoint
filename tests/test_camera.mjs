// Camera on only while pointing: off on the map and in the background, back on when you return, never asked for by map-only
// users, no stray or doubled camera requests. getUserMedia is faked with a canvas stream so its tracks can be checked.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8781);
const ORIGIN = 'http://localhost:8781';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);

// A fake camera: counts requests, can answer late (window.__camDelay) or refuse (window.__camDeny), and keeps every stream it gave out.
// document.hidden is faked too, so the page can be "sent to the background".
const FAKE = () => {
  window.__camCalls = 0; window.__streams = []; window.__camDelay = 0; window.__camDeny = false; window.__hidden = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
  const gum = async () => {
    window.__camCalls++;
    const delay = window.__camDelay, deny = window.__camDeny;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (deny) throw new DOMException('denied', 'NotAllowedError');
    if (window.__camErr) throw new DOMException('busy', window.__camErr);
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; c.getContext('2d').fillRect(0, 0, 64, 48);
    const s = c.captureStream(5); window.__streams.push(s); return s;
  };
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
  navigator.mediaDevices.getUserMedia = gum;
};
async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.evaluateOnNewDocument(FAKE);
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(ORIGIN) ? req.continue() : req.abort()));
  await page.setGeolocation({ latitude: 42.32, longitude: -72.63, accuracy: 5 });
  await page.goto(ORIGIN + url);
  await page.evaluate((g) => { window.__hp.CAM.graceMs = g; }, page.grace ?? 0);   // most checks: the map stops the camera at once
  return page;
}
const state = (page) => page.evaluate(() => {
  const v = document.querySelector('#cam'), st = v.srcObject;
  return { calls: window.__camCalls, mode: window.__hp.S.mode, live: !!st && st.getTracks().every((t) => t.readyState === 'live'), hasSrc: !!st,
    streams: window.__streams.map((s) => s.getTracks().map((t) => t.readyState).join('/')), camShown: !v.classList.contains('hidden'),
    fakeShown: !document.querySelector('#fakecam').classList.contains('hidden') };
});
const setHidden = (page, h) => page.evaluate((x) => { window.__hidden = x; document.dispatchEvent(new Event('visibilitychange')); }, h);

// 1. Demo mode: point, map, back, background
const page = await newPage('/?demo=1');
await sleep(500);
check((await state(page)).calls === 0, 'no camera request before pointing');
await page.click('#goPoint'); await sleep(800);
let s = await state(page);
check(s.calls === 1 && s.live && s.camShown && !s.fakeShown, 'point mode turns the camera on ' + JSON.stringify(s));
await page.click('#toMap'); await sleep(300);
s = await state(page);
check(s.mode === 'map' && !s.hasSrc && s.streams[0] === 'ended', 'map mode stops every camera track and clears the video ' + JSON.stringify(s));
await setHidden(page, true); await setHidden(page, false); await sleep(300);
check((await state(page)).calls === 1, 'coming back from the background on the map doesn’t turn the camera on');
await page.click('#mapToPoint'); await sleep(600);
s = await state(page);
check(s.mode === 'point' && s.calls === 2 && s.live && s.camShown, 'back to point mode asks for the camera again ' + JSON.stringify(s));
await setHidden(page, true); await sleep(200);
s = await state(page);
check(!s.hasSrc && s.streams[1] === 'ended' && !s.camShown && s.fakeShown, 'page hidden: camera stopped, plain background shown ' + JSON.stringify(s));
await setHidden(page, false); await sleep(500);
s = await state(page);
check(s.calls === 3 && s.live && s.camShown, 'page visible again in point mode: camera back on ' + JSON.stringify(s));

// 2. A camera that answers after you've left point mode is stopped, not left running.
await page.evaluate(() => { window.__camDelay = 700; });
await page.click('#toMap'); await sleep(100);
await page.click('#mapToPoint'); await sleep(100);           // request #4 is pending...
await page.click('#toMap'); await sleep(1100);                // ...and you're back on the map before it answers
s = await state(page);
check(s.calls === 4 && !s.hasSrc && s.streams.length === 4 && s.streams.every((x) => x === 'ended'), 'a late camera after leaving point mode is stopped ' + JSON.stringify(s));

// 3. No double requests: several start triggers while one request is pending make one request.
await page.click('#mapToPoint');
await setHidden(page, false);                                  // a "visible" event while the request is pending
await page.evaluate(() => { window.__hp.startCamera(); window.__hp.startCamera(); });
await sleep(1100);
s = await state(page);
check(s.calls === 5 && s.live && s.streams.filter((x) => x === 'live').length === 1, 'one camera request at a time ' + JSON.stringify(s));
// Leave and come back while the request is still pending: the one request is used, no second one.
await page.click('#toMap'); await sleep(100);
await page.click('#mapToPoint'); await sleep(100);
await page.click('#toMap'); await sleep(100);
await page.click('#mapToPoint'); await sleep(1100);
s = await state(page);
check(s.calls === 6 && s.live && s.streams.filter((x) => x === 'live').length === 1, 'map and back twice while waiting: one request, one live stream ' + JSON.stringify(s));
check(!page.errors.length, 'no page errors (demo) ' + page.errors.join('; '));

// 4. Camera refused: the fake background and the toast stay, and going map -> point doesn't keep asking.
const p2 = await newPage('/?demo=1');
await p2.evaluate(() => { window.__camDeny = true; });
await p2.click('#goPoint'); await sleep(500);
s = await state(p2);
const toastTxt = await p2.$eval('#toast', (el) => el.textContent);
check(s.calls === 1 && s.fakeShown && !s.camShown && /Camera is off/.test(toastTxt), 'camera refused: fake background and toast ' + JSON.stringify(s));
await p2.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
await sleep(400);
s = await state(p2);
check(s.calls === 1 && s.fakeShown, 'after a refusal, coming back to the app doesn’t ask again on its own ' + JSON.stringify(s));
await p2.click('#toMap'); await sleep(200); await p2.click('#mapToPoint'); await sleep(400);
s = await state(p2);
const toast2 = await p2.$eval('#toast', (el) => el.textContent); console.log('toast after second refusal:', toast2);
check(s.calls === 2 && s.fakeShown && /Camera is off/.test(toast2), 'after a refusal, tapping back to pointing asks again (refused again: plain background) ' + JSON.stringify(s));
await p2.click('#toMap'); await sleep(200);
await p2.evaluate(() => { window.__camDeny = false; });
check(!p2.errors.length, 'no page errors (refused) ' + p2.errors.join('; '));

// 4b. Camera busy (another app has it): not a refusal, so the next return to point mode tries again.
const p2b = await newPage('/?demo=1');
await p2b.evaluate(() => { window.__camErr = 'NotReadableError'; });
await p2b.click('#goPoint'); await sleep(500);
s = await state(p2b);
check(s.calls === 1 && s.fakeShown && !s.hasSrc, 'camera busy: plain background ' + JSON.stringify(s));
await p2b.evaluate(() => { window.__camErr = null; });
await p2b.click('#toMap'); await sleep(200); await p2b.click('#mapToPoint'); await sleep(500);
s = await state(p2b);
check(s.calls === 2 && s.live && s.camShown && !s.fakeShown, 'camera busy the first time: asked again on the way back, and it works ' + JSON.stringify(s));
check(!p2b.errors.length, 'no page errors (busy) ' + p2b.errors.join('; '));

// 5. Map-only users never get a camera request (real mode, not the demo).
const p3 = await newPage('/');
await p3.click('#goMap'); await sleep(400);
await setHidden(p3, true); await setHidden(p3, false); await sleep(200);
await p3.evaluate(() => window.__hp.centerMap(42.32, -72.63)); await sleep(500);
s = await state(p3);
check(s.calls === 0 && s.mode === 'map', 'map-only use never asks for the camera ' + JSON.stringify(s));

// 6. Real mode, point then map (the GPS and compass keep running; the camera stops).
const p4 = await newPage('/');
await p4.click('#goPoint'); await p4.evaluate(() => window.__hp.setHeading(0)); await sleep(600);
s = await state(p4);
check(s.calls === 1 && s.live, 'real mode: pointing turns the camera on');
await p4.click('#toMap'); await sleep(300);
s = await state(p4);
check(!s.hasSrc && s.streams[0] === 'ended', 'real mode: map stops the camera');

// The map keeps a running camera for a short grace period (an iPhone may ask for permission again once it has been off
// for about a minute), paused; back to pointing in time reuses it, otherwise it stops. Leaving the app stops it at once.
{
  const pg = await newPage('/?demo=1');
  await pg.evaluate(() => { window.__hp.CAM.graceMs = 1500; });
  await pg.click('#goPoint'); await sleep(500);
  await pg.click('#toMap'); await sleep(300);
  let t = await state(pg);
  const paused = await pg.evaluate(() => document.querySelector('#cam').paused);
  check(t.live && paused && !t.camShown, 'map: the camera is paused and hidden, not stopped yet ' + JSON.stringify(t));
  await pg.click('#mapToPoint'); await sleep(400);
  t = await state(pg);
  check(t.calls === 1 && t.live && t.camShown, 'back to pointing within the grace period: the same camera, no new request ' + JSON.stringify(t));
  await pg.click('#toMap'); await sleep(2000);
  t = await state(pg);
  check(!t.hasSrc && t.streams.every((x) => x === 'ended'), 'after the grace period on the map: stopped ' + JSON.stringify(t));
  await pg.click('#mapToPoint'); await sleep(400);
  await pg.click('#toMap'); await sleep(200);
  await pg.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  t = await state(pg);
  check(!t.hasSrc && t.streams.every((x) => x === 'ended'), 'leaving the app during the grace period stops it at once ' + JSON.stringify(t));
  await pg.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  // The phone ends the camera while you're pointing (a call): a fresh one is asked for.
  await pg.click('#mapToPoint'); await sleep(400);
  const before = (await state(pg)).calls;
  await pg.evaluate(() => { const tr = document.querySelector('#cam').srcObject.getVideoTracks()[0]; tr.stop(); tr.dispatchEvent(new Event('ended')); });
  await sleep(400);
  t = await state(pg);
  check(t.calls === before + 1 && t.live && t.camShown, 'camera ended by the phone while pointing: a fresh one ' + JSON.stringify(t));
  check(!pg.errors.length, 'no page errors (grace) ' + pg.errors.join('; '));
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
