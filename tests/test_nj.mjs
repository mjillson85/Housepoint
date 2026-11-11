// New Jersey: region outline, the statewide parcels + MOD-IV layer (faked with its real field names), card, last year's tax, condos, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8774);
const ORIGIN = 'http://localhost:8774';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NJ_SVC = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0';
const NJ_FIELDS = ['OBJECTID', 'PAMS_PIN', 'PCL_MUN', 'PCLBLOCK', 'PCLLOT', 'PCLQCODE', 'PROP_CLASS', 'COUNTY', 'MUN_NAME', 'PROP_LOC', 'OWNER_NAME',
  'ST_ADDRESS', 'CITY_STATE', 'ZIP_CODE', 'ZIP5', 'LAND_VAL', 'IMPRVT_VAL', 'NET_VALUE', 'LAST_YR_TX', 'BLDG_DESC', 'LAND_DESC', 'CALC_ACRE',
  'PROP_USE', 'BLDG_CLASS', 'DEED_BOOK', 'DEED_PAGE', 'DEED_DATE', 'YR_CONSTR', 'SALES_CODE', 'SALE_PRICE', 'DWELL', 'COMM_DWELL'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 38.93389, lon0 = -74.91889;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const base = { MUN_NAME: 'CAPE MAY CITY', COUNTY: 'CAPE MAY', OWNER_NAME: 'SECRET OWNER', ST_ADDRESS: '1 SECRET WAY', CITY_STATE: 'SECRETVILLE NJ', ZIP_CODE: '08204' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: '' };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(NJ_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: NJ_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(NJ_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where')) {
      asked.where.push(q.get('where'));
      return json({ features: /644 HUGHES ST/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...base, OBJECTID: 1, PROP_LOC: '644 HUGHES ST', PROP_CLASS: '2' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...base, OBJECTID: 1, PAMS_PIN: '0502_1034_7', PROP_LOC: '644 HUGHES ST', PROP_CLASS: '2', DWELL: 1,
      LAND_VAL: 410000, IMPRVT_VAL: 390000, NET_VALUE: 800000, LAST_YR_TX: '0000974321', YR_CONSTR: '1879', SALE_PRICE: 1250000, DEED_DATE: '190614', BLDG_DESC: '2.5SF', PCLQCODE: '' } });
    for (let i = 1; i <= 5; i++) feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...base, OBJECTID: 10 + i, PROP_LOC: '100 BEACH AVE', PCLQCODE: `C000${i}`,
      PROP_CLASS: '2', DWELL: 1, LAND_VAL: 200000, IMPRVT_VAL: 150000 + i * 10000, NET_VALUE: 350000 + i * 10000, LAST_YR_TX: `${6000 + i * 100}.45`, YR_CONSTR: '1985',
      SALE_PRICE: i % 2 ? 520000 : 1, DEED_DATE: i % 2 ? `2${i}0315` : '010315', BLDG_DESC: 'CONDO' } });
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...base, OBJECTID: 30, PROP_LOC: '650 HUGHES ST', PROP_CLASS: '15D', LAND_VAL: 500000, IMPRVT_VAL: 900000,
      NET_VALUE: 1400000, LAST_YR_TX: '0', YR_CONSTR: '1853' } });
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { ...base, OBJECTID: 40, PROP_LOC: '30 GURNEY ST', PROP_CLASS: '2', DWELL: 2, LAND_VAL: 180000,
      IMPRVT_VAL: 120000, NET_VALUE: 300000, LAST_YR_TX: '8450', YR_CONSTR: '0', SALE_PRICE: 41000, DEED_DATE: '650501' } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { capeMay: f(38.93389, -74.91889), hoboken: f(40.744, -74.032), newark: f(40.7357, -74.1724), trenton: f(40.2206, -74.7597), camden: f(39.9259, -75.1196),
    princeton: f(40.3487, -74.6593), sandyHook: f(40.43, -74.0), manhattan: f(40.7831, -73.9712), statenIsland: f(40.58, -74.15), philly: f(39.9526, -75.1652),
    greenwich: f(41.0262, -73.6282), boston: f(42.3601, -71.0589) };
});
console.log('regions:', JSON.stringify(rg));
check(['capeMay', 'hoboken', 'newark', 'trenton', 'camden', 'princeton', 'sandyHook'].every((k) => rg[k] === 'NJ'), 'New Jersey places land in New Jersey');
check(rg.manhattan === 'NY' && rg.statenIsland === 'NY' && rg.philly === null, 'Manhattan and Staten Island are New York; Philadelphia stays out');
check(rg.greenwich === 'CT' && rg.boston === 'MA', 'Connecticut and Massachusetts unchanged');

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/644 Hughes St/.test(card) && /Cape May City · Single-family home/.test(card) && /NEW JERSEY/i.test(card), 'address, town and use');
check(/TOWN ASSESSED VALUE/i.test(card) && /\$800,000/.test(card), 'assessed value is land + improvements');
check(/Last sold \$1,250,000 · Jun 2019/.test(card) && !/vs\. sale/.test(card), 'sale from the YYMMDD deed date; no "vs. sale" comparison');
check(/PROPERTY TAX · LAST YEAR’S BILL/i.test(card) && /\$9,743 per year/.test(card) && !/≈ \$9/.test(card), 'last year’s actual tax, read from cents, shown exactly');
check(/Built 1879/.test(card) && /STORIES \| 2\.5/i.test(card), 'year built and stories');
check(/compare assessed values within one town/.test(card), 'source line explains assessment ratios');
check(!/SECRET/.test(card), 'no owner name on the card');
check(asked.outFields && !/OWNER|ST_ADDRESS|CITY_STATE|ZIP/i.test(asked.outFields) && /LAST_YR_TX/.test(asked.outFields), 'owner and mailing fields never requested: ' + asked.outFields);
await page.screenshot({ path: 'nj_card.png' });

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR).startsWith(key))); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k); await sleep(500);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const condo = await open('100 BEACH AVE');
console.log('condo:', condo.slice(0, 600));
check(/5 units/i.test(condo) && /100 Beach Ave/.test(condo) && /Condo building/.test(condo), 'stacked condo units become one building');
check(/\$6,100–6,500 per unit, per year/.test(condo), 'per-unit tax range from last year’s bills');
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('units:', units.join(' / '));
check(/Unit 1\b/.test(units[0]) && /Unit 5\b/.test(units[4]), 'units named from the C qualifier');
await page.evaluate(() => document.querySelectorAll('#cardBody .units .unit')[0].click()); await sleep(200);
const ud = await page.$eval('#ud0', (el) => el.innerText.replace(/\n/g, ' '));
console.log('unit 1:', ud);
check(/Property tax \$6,100\/yr/.test(ud) && /Last sale \$520,000 · Mar 2021/.test(ud), 'unit details show its real tax and sale');
const church = await open('650 HUGHES ST');
check(/PROPERTY TAX \| None/i.test(church) && /Church or charity/.test(church), 'class 15D is tax-exempt');
const two = await open('30 GURNEY ST');
check(/Two-family/.test(two) && /\$8,450 per year/.test(two) && /Last sold \$41,000 · May 1965/.test(two) && !/Built 0/.test(two), 'two-family, dollars without decimals, 1965 deed date, no year built');

await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Cape May/.test(e.textContent))), 'Cape May sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '644 Hughes Street, Cape May, NJ'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /PROP_LOC/.test(w) && /644 HUGHES ST/.test(w) && /MUN_NAME/.test(w)), 'search goes to New Jersey and uses the town');
const share = await page.evaluate(() => { const L = window.__hp.S.local.find((l) => l.p.records[0].SITE_ADDR === '644 HUGHES ST'); return L ? null : null; });
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
