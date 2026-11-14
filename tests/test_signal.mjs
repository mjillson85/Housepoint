// A weak or dropping signal: an answer that stops partway gives up instead of hanging, a map load that finishes after switching to
// pointing doesn't open a card, and a failed load says so and tries again by itself.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
// /stall sends the start of an answer and then nothing more
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/stall')) { r.writeHead(200, { 'content-type': 'application/json' }); r.write('{"features": [{"attributes": {'); return; }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(html);
}).listen(8801);
const ORIGIN = 'http://localhost:8801';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const lat0 = 41.71156, lon0 = -72.65372;
const off = (dx, dy) => [lon0 + dx / (Math.cos(lat0 * Math.PI / 180) * 111320), lat0 + dy / 110540];
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
let parcels = 'ok', delayMs = 0, asked = 0;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', async (req) => {
  const u = req.url();
  const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'Town_Name', 'Location', 'Assessed_Total', 'AYB', 'State_Use', 'State_Use_Description', 'Collection_Year'].map((name) => ({ name })) });
  if (u.startsWith(CT_SVC + '/query')) {
    asked++;
    if (parcels === 'fail') return json({}, 503);
    if (delayMs) await sleep(delayMs);
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    return json({ features: [
      { geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { OBJECTID: 1, Town_Name: 'WETHERSFIELD', Location: '211 MAIN ST', Assessed_Total: 350000, AYB: 1752, State_Use_Description: 'Single Fam', Collection_Year: '2025' } },
      { geometry: { rings: [ring(-40, -12, -15, 12, b)] }, attributes: { OBJECTID: 2, Town_Name: 'WETHERSFIELD', Location: '220 MAIN ST', Assessed_Total: 300000, AYB: 1800, State_Use_Description: 'Single Fam', Collection_Year: '2025' } }] });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => window.__hp && window.__hp.REGIONS);

// 1. An answer that stops partway gives up (after its wait) instead of hanging
const stall = page.evaluate(async (o) => { const t0 = Date.now(); try { await window.__hp.getJSON(o + '/stall', {}, 1000); return { ok: true }; } catch (e) { return { msg: e.message, s: Math.round((Date.now() - t0) / 1000) }; } }, ORIGIN);

// 2. A shared house's map load that finishes after switching to pointing doesn't open a card
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
delayMs = 3000;
await page.evaluate(() => document.querySelector('#toMap').click()); await sleep(400);
const [clon, clat] = off(27, 300);
await page.evaluate((la, lo) => { window.__hp.startMapMode({ lat: la, lon: lo, selectKey: 'gone' }, 'Opening the shared house…'); }, clat, clon);
await sleep(600);
await page.evaluate(() => document.querySelector('#mapToPoint').click()); await sleep(5000);
const after = await page.evaluate(() => ({ mode: window.__hp.S.mode, open: document.querySelector('#sheet').classList.contains('open') }));
check(after.mode === 'point' && !after.open, `a map load that lands after switching to pointing opens no card (${JSON.stringify(after)})`);
delayMs = 0;

// 3. A failed load says so, and tries again by itself
for (let i = 0; i < 40 && (await page.evaluate(() => !!window.__hp.S.loading)); i++) await sleep(500);   // the map's load (and its second try) is done
parcels = 'fail';
await page.evaluate(() => { const S = window.__hp.S; S.local = []; S.center = null; });
await page.setGeolocation({ latitude: lat0 + 0.02, longitude: lon0, accuracy: 5 });
let hint = '';
for (let i = 0; i < 40 && !/Couldn’t load/.test(hint); i++) { await sleep(500); hint = await page.$eval('#hint', (el) => el.textContent); }   // after the backups are tried too
check(/Couldn’t load the property records\. Tap the button to try again/.test(hint), `a failed load says so (${hint})`);
parcels = 'ok'; const before = asked;
for (let i = 0; i < 70 && !(await page.evaluate(() => window.__hp.S.local.length)); i++) await sleep(500);
const loaded = await page.evaluate(() => window.__hp.S.local.length);
check(asked > before && loaded > 0, `it tries again by itself and loads (${asked - before} tries, ${loaded} lots)`);

// 4. Two fingers on the map zoom it (spread apart: closer in) instead of dragging it
await page.evaluate(() => document.querySelector('#toMap').click()); await sleep(800);
const m0 = await page.evaluate(() => ({ R: window.__hp.S.map.R, c: { ...window.__hp.S.map.center } }));
const f1 = await page.touchscreen.touchStart(170, 420); const f2 = await page.touchscreen.touchStart(220, 470);
for (let k = 1; k <= 5; k++) { await f1.move(170 - k * 12, 420 - k * 12); await f2.move(220 + k * 12, 470 + k * 12); await sleep(40); }
await f1.end(); await f2.end(); await sleep(400);
const m1 = await page.evaluate(() => ({ R: window.__hp.S.map.R, c: { ...window.__hp.S.map.center } }));
const moved = Math.hypot((m1.c.lat - m0.c.lat) * 110540, (m1.c.lon - m0.c.lon) * 82000);
check(m1.R < m0.R * 0.8 && moved < 5, `a pinch zooms the map in (${Math.round(m0.R)} → ${Math.round(m1.R)} m) without moving it (${moved.toFixed(1)} m)`);

const st = await stall;
check(st.msg && /stopped partway/.test(st.msg) && st.s <= 35, `an answer that stops partway gives up (${JSON.stringify(st)})`);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close(); process.exit(0);
