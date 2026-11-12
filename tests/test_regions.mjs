import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { isOwnerish } from './owner-fields.mjs';
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8765);
const ORIGIN = 'http://localhost:8765';

const FL_SVC = 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer';
const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer';
const FL_FIELDS = ['OBJECTID','CO_NO','PARCEL_ID','MULTI_PAR_SAL1','ASMNT_YR','DOR_UC','JV','LND_VAL','SALE_PRC1','SALE_YR1','SALE_MO1','ACT_YR_BLT','EFF_YR_BLT','TOT_LVG_AREA','NO_RES_UNTS','NO_BULDNG','PHY_ADDR1','PHY_CITY','PHY_ZIPCD','OWN_NAME','OWN_ADDR1','OWN_CITY'];
const MA_FIELDS = ['OBJECTID','LOC_ID','POLY_TYPE','SITE_ADDR','CITY','FY','TOTAL_VAL','LAND_VAL','LS_DATE','LS_PRICE','USE_CODE','YEAR_BUILT','RES_AREA','STYLE','STORIES','NUM_ROOMS','UNITS','OWNER1','OWN_ADDR'];
const seen = { flQueryBodies: [], maQueryBodies: [], itemLookups: 0 };

// Like the real services, the fakes answer with only the fields asked for (and the object id): the owner fields they hold come
// back only if the app asks for them.
const only = (body, feats) => { const want = new Set(String(body.get('outFields') || '').split(',').concat('OBJECTID'));
  return feats.map((f) => ({ ...f, attributes: Object.fromEntries(Object.entries(f.attributes).filter(([k]) => want.has(k) || want.has('*'))) })); };
function lots(lon, lat, make) {
  const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;
  const feats = [];
  for (let j = 0; j < 6; j++) {                      // a row of lots north of the point, across a 12 m street
    const x0 = -60 + j * 20, y0 = 6, y1 = 36;
    const ring = [[x0, y0], [x0 + 20, y0], [x0 + 20, y1], [x0, y1], [x0, y0]].map(([x, y]) => [lon + x / kx, lat + y / ky]);
    feats.push({ attributes: make(j), geometry: { rings: [ring] } });
  }
  return feats;
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(ORIGIN, ['geolocation']);
async function run(lat, lon, tag) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', (e) => errors.push(e.stack.split('\n').slice(0,4).join(' <- ')));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (/OWN/i.test(decodeURIComponent(u) + (req.postData() || ''))) seen.ownerRequests = (seen.ownerRequests || 0) + 1;
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.startsWith(ORIGIN)) return req.continue();
    if (u.includes('/sharing/rest/content/items/55e830fd6c8948baae1601fbfc33a3b2')) { seen.itemLookups++; return json({ id: '55e8…', url: FL_SVC }); }
    if (u.startsWith(FL_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(FL_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: FL_FIELDS.map((name) => ({ name })) });
    if (u.startsWith(FL_SVC + '/0/query')) {
      const body = new URLSearchParams(req.postData() || ''); seen.flQueryBodies.push(body.get('outFields'));
      const [qlon, qlat] = body.get('geometry').split(',').map(Number);
      return json({ features: only(body, lots(qlon, qlat, (j) => ({ OBJECTID: j + 1, PARCEL_ID: 'FL' + j, ASMNT_YR: 2025, MULTI_PAR_SAL1: j === 1 ? 'M' : '', DOR_UC: j === 5 ? '009' : j === 2 ? '004' : '0001', JV: j === 5 ? 0 : 450000 + j * 10000, LND_VAL: 200000, SALE_PRC1: 389000 + j * 1000, SALE_YR1: 2021, SALE_MO1: 6, ACT_YR_BLT: (j === 4 || j === 5) ? 0 : 1926 + j, EFF_YR_BLT: j === 2 ? 1998 : j === 4 ? 1955 : j === 5 ? 0 : 1926 + j, TOT_LVG_AREA: j === 5 ? 0 : 1800 + j * 10, NO_RES_UNTS: j === 2 ? 12 : j === 5 ? 40 : 1, NO_BULDNG: j === 5 ? 3 : 1, PHY_ADDR1: `${12 + j * 2} AVILES ST`, PHY_CITY: 'ST AUGUSTINE', OWN_NAME: 'SECRET OWNER' }))), exceededTransferLimit: false });
    }
    if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: MA_FIELDS.map((name) => ({ name })) });
    if (u.startsWith(MA_SVC + '/0/query')) {
      const body = new URLSearchParams(req.postData() || ''); seen.maQueryBodies.push(body.get('outFields'));
      const [qlon, qlat] = body.get('geometry').split(',').map(Number);
      return json({ features: only(body, lots(qlon, qlat, (j) => ({ OBJECTID: j + 1, LOC_ID: 'MA' + j, POLY_TYPE: 'FEE', SITE_ADDR: `${20 + j} CHESTNUT ST`, CITY: 'SALEM', FY: 2026, TOTAL_VAL: 1200000 + j, LAND_VAL: 500000, LS_DATE: '20190315', LS_PRICE: 900000, USE_CODE: '1010', YEAR_BUILT: 1810 + j, RES_AREA: 3000, STYLE: 'FEDERAL', STORIES: 3, NUM_ROOMS: 10, UNITS: 1, OWNER1: 'SECRET OWNER' }))) });
    }
    if (/fonts\.|arcgisonline|nationalmap/.test(u)) return req.abort();
    return req.abort();
  });
  await page.setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });
  await page.goto(ORIGIN + '/?debug=1');
  await page.click('#goPoint'); await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => window.__hp.setHeading(0)); await new Promise((r) => setTimeout(r, 500));
  const live = await page.$eval('#liveLabel', (el) => el.innerText.replace(/\n/g, ' | '));
  await page.click('#shutter'); await new Promise((r) => setTimeout(r, 900));
  const card = (await page.$eval('#cardBody', (el) => el.innerText)).split('\n').filter(Boolean).slice(0, 18).join(' | ');
  const debug = await page.$eval('#debug', (el) => el.innerText.split('\n')[1]);
  const anyOwner = await page.evaluate(() => JSON.stringify(window.__hp.S.parcels).includes('SECRET'));
  await page.screenshot({ path: `region_${tag}.png` });
  console.log(`\n=== ${tag} ===\nlabel: ${live}\ncard: ${card}\ndebug: ${debug}\nowner data on phone: ${anyOwner}\nerrors: ${errors.length ? errors.join('; ') : 'none'}`);
  check(!anyOwner, `${tag}: the faked owner names never reach the phone's memory`);
  check(/\d+ \S/.test(card), `${tag}: the card shows a house`);
  check(!errors.length, `${tag}: no page errors`);
  return page;
}
const flPage = await run(29.8934, -81.3133, 'FL');
// "Not it" to the condo lot (j=2) to see FL condo + use code + effective-year chip
console.log('FL state:', await flPage.evaluate(() => JSON.stringify({ pos: window.__hp.S.pos, local: window.__hp.S.local.length, failAt: window.__hp.S.failAt })));
await flPage.evaluate(() => { const S = window.__hp.S; if (!S.local.length) return; const L = S.local.find((l) => l.p.records[0].PROP_ID === 'FL2'); window.__hp.openSheet([{ L, dist: 20, cdist: 20, bearing: 0 }], 0); });
console.log('FL condo-coded lot:', (await flPage.$eval('#cardBody', (el) => el.innerText)).split('\n').filter(Boolean).slice(3, 9).join(' | '));
for (const id of ['FL1', 'FL4', 'FL5']) {
  const txt = await flPage.evaluate((pid) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].PROP_ID === pid); if (!L) return 'NOT TARGETABLE/NOT LOADED (built=' + (S.parcels.find((p) => p.records[0].PROP_ID === pid) || {}).built + ')'; window.__hp.openSheet([{ L, dist: 20, cdist: 20, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.split('\n').filter(Boolean).slice(3, 12).join(' | '); }, id);
  console.log(id, '→', txt);
}
console.log('distinct FL lots loaded:', await flPage.evaluate(() => window.__hp.S.parcels.length));
await run(42.5196, -70.8996, 'MA');
console.log('\nrequests mentioning OWN*:', seen.ownerRequests || 0, '\nFL item lookups:', seen.itemLookups, '\nFL outFields requested:', seen.flQueryBodies[0], '\nMA outFields requested:', seen.maQueryBodies[0]);
const outside = await browser.newPage(); await outside.setRequestInterception(true); outside.on('request', (r) => r.url().startsWith(ORIGIN) ? r.continue() : r.abort());
await outside.setGeolocation({ latitude: 40.75, longitude: -73.99, accuracy: 5 });
await outside.goto(ORIGIN + '/'); await outside.click('#goPoint'); await new Promise((r) => setTimeout(r, 1200));
console.log('\nNew York hint:', await outside.$eval('#hint', (el) => el.innerText));
// The fields asked of each service: none owner-like (the fakes above hold owner fields, so asking for one would bring it back)
for (const [st, list] of [['FL', seen.flQueryBodies], ['MA', seen.maQueryBodies]]) {
  check(list.length > 0, `${st}: the lots were asked for`);
  const bad = [...new Set(list.flatMap((b) => String(b || '').split(',')).filter(isOwnerish))];
  check(!bad.length, `${st}: no owner-like field asked for${bad.length ? ': ' + bad.join(', ') : ''}`);
}
await browser.close(); srv.close();
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
process.exit(fails.length ? 1 : 0);
