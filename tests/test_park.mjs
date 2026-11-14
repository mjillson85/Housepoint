// Mobile home parks and condo unit details, against a faked MassGIS service.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8771);
const ORIGIN = 'http://localhost:8771';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer';
const FIELDS = ['OBJECTID', 'LOC_ID', 'POLY_TYPE', 'SITE_ADDR', 'CITY', 'TOWN_ID', 'FY', 'TOTAL_VAL', 'LAND_VAL', 'LS_DATE', 'LS_PRICE', 'USE_CODE', 'YEAR_BUILT', 'RES_AREA', 'STYLE', 'STORIES', 'NUM_ROOMS', 'UNITS'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 42.1, lon0 = -72.59, kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
const ring = (x0, y0, x1, y1, b) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
  if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: FIELDS.map((name) => ({ name })) });
  if (u.startsWith(MA_SVC + '/0/query')) {
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    const feats = [];
    // the park: a big lot you're standing in
    feats.push({ geometry: { rings: [ring(-150, -120, 150, 120, b)] }, attributes: { OBJECTID: 1, LOC_ID: 'PARK', POLY_TYPE: 'FEE', SITE_ADDR: '100 PINE VALLEY DR', CITY: 'NORTON', TOWN_ID: 218,
      FY: 2026, TOTAL_VAL: 9800000, LAND_VAL: 6000000, LS_DATE: '20190610', LS_PRICE: 8200000, USE_CODE: '1030', YEAR_BUILT: 1968, RES_AREA: 1200, UNITS: 120 } });
    // a condo complex across the road: 14 units on one lot
    for (let i = 1; i <= 14; i++) feats.push({ geometry: { rings: [ring(-40, 130, 40, 190, b)] }, attributes: { OBJECTID: 100 + i, LOC_ID: 'CONDO', POLY_TYPE: 'FEE',
      SITE_ADDR: `5 OAK ST UNIT ${i}`, CITY: 'NORTON', TOWN_ID: 218, FY: 2026, TOTAL_VAL: 300000 + i * 5000, LS_DATE: i % 3 ? `20${10 + i}0415` : '', LS_PRICE: i % 3 ? 250000 + i * 4000 : 0,
      USE_CODE: '1020', YEAR_BUILT: 1987, RES_AREA: 900 + i * 10, NUM_ROOMS: 4 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
const live = await page.$eval('#liveLabel', (el) => el.innerText.replace(/\n/g, ' | '));
console.log('live label:', live);
check(/Mobile home park · 120 sites/.test(live) && !/Built 1968/.test(live), 'live label says mobile home park, no "built" year');
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('park card:', card.slice(0, 900));
check(/Norton · Mobile home park/.test(card), 'town line says mobile home park');
check(/individual homes aren’t on the property records/.test(card) && /monthly fee/.test(card), 'explains why the homes aren’t listed');
check(/WHOLE PARK · TOWN ASSESSED VALUE/i.test(card) && /The whole park last sold \$8,200,000/.test(card), 'value and sale marked as the whole park');
check(!/Older than/.test(card) && /Park built 1968/.test(card) && /120 home sites/.test(card), 'park chips (no "older than")');
check(/ESTIMATED PROPERTY TAX · WHOLE PARK/i.test(card) && /park owner’s tax/.test(card), 'tax box labeled for the whole park');
check(/HOME SITES \| 120/i.test(card) && !/LIVING AREA/i.test(card), 'grid shows home sites, not living area');
await page.screenshot({ path: 'park_card.png' });
await page.evaluate(() => document.querySelector('#cardBody').scrollTo(0, 300)); await sleep(150);
await page.screenshot({ path: 'park_card2.png' });

// condo: open its card directly
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.key === 'CONDO'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); });
await sleep(600);
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => ({ t: e.innerText.replace(/\n/g, ' '), shown: getComputedStyle(e).display !== 'none' })));
console.log('units header:', await page.$eval('#cardBody .units-h', (e) => e.innerText), '| first rows:', units.slice(0, 4).map((u) => u.t).join(' / '));
check(units.length === 14 && units.filter((u) => u.shown).length === 12, '12 units shown, 14 in the list');
check(/Unit 1\b/.test(units[0].t) && /Unit 2\b/.test(units[1].t) && /Unit 10\b/.test(units[9].t), 'sorted by unit number (2 before 10)');
await page.evaluate(() => document.querySelectorAll('#cardBody .units .unit')[1].click()); await sleep(200);
const det = await page.$eval('#ud1', (el) => ({ hidden: el.classList.contains('hidden'), t: el.innerText.replace(/\n/g, ' ') }));
console.log('unit 2 details:', det.t);
check(!det.hidden && /Value \$310,000/.test(det.t) && /Last sale \$258,000 · Apr 2012/.test(det.t) && /Living area 920 ft²/.test(det.t) && /Est\. property tax ≈ \$\d/.test(det.t), 'tapping a unit shows its value, sale, size and tax');
await page.evaluate(() => document.querySelectorAll('#cardBody .units .unit')[2].click()); await sleep(150);
check(/No recorded sale/.test(await page.$eval('#ud2', (el) => el.innerText)), 'unit with no sale says so');
await page.click('#cardBody .all-btn'); await sleep(150);
check(await page.$$eval('#cardBody .units .unit', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').length) === 14, '"Show all" reveals every unit');
await page.evaluate(() => document.querySelector('#ud1').scrollIntoView({ block: 'center' })); await sleep(150);
await page.screenshot({ path: 'condo_units.png' });

// Florida code 28: a park only with units; otherwise could be a parking lot
const fl = await page.evaluate(() => {
  const sq = [[[-81.3, 29.9], [-81.299, 29.9], [-81.299, 29.901], [-81.3, 29.901], [-81.3, 29.9]]];
  const s1 = window.__hp.summarize({ region: 'FL', ringsLL: sq, records: [{ USE_CODE: '028', UNITS: 80, TOTAL_VAL: 5e6 }] });
  const s2 = window.__hp.summarize({ region: 'FL', ringsLL: sq, records: [{ USE_CODE: '028', TOTAL_VAL: 5e5 }] });
  const s3 = window.__hp.summarize({ region: 'MA', ringsLL: sq, records: [{ USE_CODE: '103', UNITS: 1, TOTAL_VAL: 2e5 }] });
  return [s1.park, s1.use, s2.park, s2.use, s3.park, s3.use];
});
console.log('FL/MA code checks:', fl.join(' | '));
check(fl[0] === true && fl[2] === false && fl[3] === 'Mobile home park or parking lot', 'Florida code 28: park only with units');
check(fl[4] === false && fl[5] === 'Mobile home', 'a single mobile home on its own small lot stays a mobile home');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
