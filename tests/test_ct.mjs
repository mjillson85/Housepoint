// Connecticut: region lookup, the state CAMA + parcel layer (faked), card, tax, condos, parks, border loading, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8773);
const ORIGIN = 'http://localhost:8773';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer';
// The real layer's field names (2023 layer schema plus the newer zip / acres fields).
const CT_FIELDS = ['OBJECTID', 'Town_Name', 'Link', 'Owner', 'Co_Owner', 'Location', 'Property_Zip', 'Mailing_Address', 'Mailing_City', 'Mailing_State', 'Mailing_Zip',
  'Assessed_Total', 'Assessed_Land', 'Assessed_Building', 'Pre_Year_Assessed_Total', 'Appraised_Land', 'Appraised_Building', 'Appraised_Outbuilding',
  'Valuation_Year', 'Zone', 'Model', 'Condition', 'AYB', 'EYB', 'Living_Area', 'Effective_Area', 'Total_Rooms', 'Number_of_Bedroom', 'Number_of_Baths',
  'Number_of_Half_Baths', 'Occupancy', 'Sale_Price', 'Sale_Date', 'Qualified', 'Prior_Sale_Date', 'Prior_Book_Page', 'Prior_Sale_Price', 'Editor', 'Edit_Date',
  'Collection_Year', 'Planning_Region', 'State_Use', 'State_Use_Description', 'Land_Acres', 'FIPS_Code'];
const MA_FIELDS = ['OBJECTID', 'LOC_ID', 'POLY_TYPE', 'SITE_ADDR', 'CITY', 'TOWN_ID', 'FY', 'TOTAL_VAL', 'LAND_VAL', 'LS_DATE', 'LS_PRICE', 'USE_CODE', 'YEAR_BUILT', 'RES_AREA', 'NUM_ROOMS', 'UNITS'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 41.71156, lon0 = -72.65372;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const base = { Town_Name: 'WETHERSFIELD', Collection_Year: '2025', Owner: 'SECRET OWNER', Mailing_Address: '1 SECRET WAY' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { ct: [], ma: 0, outFields: '' };
let border = false;
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: CT_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(CT_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where')) {             // address search
      asked.ct.push(q.get('where'));
      const b = [lon0, lat0];
      return json({ features: /211 MAIN ST/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...base, OBJECTID: 1, Location: '211 MAIN ST', Assessed_Total: 350000 } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    if (border) {                    // the Connecticut side of the line: south of you
      feats.push({ geometry: { rings: [ring(-15, -60, 15, -25, b)] }, attributes: { ...base, OBJECTID: 900, Town_Name: 'ENFIELD', Location: '10 STATE LINE AVE', Assessed_Total: 210000, AYB: 1955, State_Use_Description: 'Single Fam' } });
      return json({ features: feats });
    }
    // the house you point at (east)
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...base, OBJECTID: 1, Link: 'WETH-1', Location: '211 MAIN ST', Property_Zip: '06109',
      Assessed_Total: 350000, Appraised_Land: 140000, Appraised_Building: 360000, AYB: 1752, EYB: 1990, Living_Area: 2400, Total_Rooms: 8, Number_of_Bedroom: 4,
      Number_of_Baths: 2, Number_of_Half_Baths: 1, Occupancy: 1, Sale_Price: 610000, Sale_Date: Date.UTC(2019, 5, 14), Prior_Sale_Price: 240000,
      Prior_Sale_Date: Date.UTC(1998, 2, 2), State_Use: '101', State_Use_Description: 'Single Fam' } });
    // condo building north: six units stacked on one lot
    for (let i = 1; i <= 6; i++) feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...base, OBJECTID: 10 + i, Location: `50 HIGH ST UNIT ${i}`,
      Assessed_Total: 150000 + i * 7000, AYB: 1986, Living_Area: 1000 + i * 20, Total_Rooms: 4, Number_of_Bedroom: 2, Number_of_Baths: 1, Occupancy: 1,
      Sale_Price: i % 2 ? 230000 : 0, Sale_Date: i % 2 ? Date.UTC(2020 + i, 3, 2) : null, State_Use: '102', State_Use_Description: 'Residential Condo' } });
    // mobile home park south
    feats.push({ geometry: { rings: [ring(-90, -260, 90, -70, b)] }, attributes: { ...base, OBJECTID: 30, Location: '300 RIVER RD', Assessed_Total: 1400000, AYB: 1962,
      Occupancy: 40, Sale_Price: 2100000, Sale_Date: Date.UTC(2016, 8, 9), State_Use: '1030', State_Use_Description: 'MH Park' } });
    // church west
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...base, OBJECTID: 40, Location: '250 MAIN ST', Assessed_Total: 900000, AYB: 1761,
      State_Use: '905', State_Use_Description: 'Church' } });
    // an old sale (before 1970, a negative date number)
    feats.push({ geometry: { rings: [ring(50, -12, 80, 12, b)] }, attributes: { ...base, OBJECTID: 50, Location: '215 MAIN ST', Assessed_Total: 280000, AYB: 1800,
      Sale_Price: 21000, Sale_Date: Date.UTC(1965, 4, 1), State_Use: '101', State_Use_Description: 'Single Fam' } });
    return json({ features: feats });
  }
  if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
  if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: MA_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(MA_SVC + '/0/query')) {
    asked.ma++;
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    return json({ features: border ? [{ geometry: { rings: [ring(-15, 25, 15, 60, b)] }, attributes: { OBJECTID: 1, LOC_ID: 'MA-N', POLY_TYPE: 'FEE', SITE_ADDR: '12 STATE LINE AVE',
      CITY: 'LONGMEADOW', TOWN_ID: 159, FY: 2026, TOTAL_VAL: 480000, USE_CODE: '1010', YEAR_BUILT: 1948, RES_AREA: 1800 } }] : [] });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

// 1. Which state is a point in?
const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  const near = (la, lo) => window.__hp.regionsNear(la, lo, 1720).map((r) => r.id).join('+');
  return { hartford: f(41.7637, -72.6851), boston: f(42.3601, -71.0589), springfield: f(42.1015, -72.5898), enfield: f(41.9762, -72.5918),
    jog: f(42.012, -72.79), greenwich: f(41.0262, -73.6282), stonington: f(41.3359, -71.9059), longIsland: f(40.93, -73.0), stAug: f(29.8934, -81.3133),
    nearLine: near(42.02, -72.6), nearHartford: near(41.7637, -72.6851) };
});
console.log('regions:', JSON.stringify(rg));
check(rg.hartford === 'CT' && rg.enfield === 'CT' && rg.greenwich === 'CT' && rg.stonington === 'CT', 'Connecticut towns land in Connecticut');
check(rg.boston === 'MA' && rg.springfield === 'MA' && rg.jog === 'MA', 'Massachusetts stays Massachusetts, including the Southwick jog');
check(rg.longIsland === 'NY' && rg.stAug === 'FL', 'Long Island is New York; Florida unchanged');
check(rg.nearLine === 'CT+MA' && rg.nearHartford === 'CT', 'near the state line both states load; mid-state only one');

// 2. Point at the house in Old Wethersfield
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1400));
check(/211 Main St/.test(card) && /Wethersfield · Single-family home/.test(card) && /CONNECTICUT/i.test(card), 'address, town and use');
check(/TOWN APPRAISED VALUE · 2024 GRAND LIST/i.test(card) && /\$500,000/.test(card), 'appraised value is the assessment ÷ 70%, labeled with the grand list year');
check(/Last sold \$610,000 · Jun 2019/.test(card) && /Sold before that for \$240,000 · Mar 1998/.test(card), 'latest and prior sale');
check(/appraised -18% vs\. sale/.test(card), 'value vs. sale wording');
check(/Built 1752/.test(card) && /Older than the United States/.test(card), 'year built from AYB');
check(/BEDROOMS \| 4/i.test(card) && /BATHS \| 2 \+ 1 half/i.test(card) && /ROOMS \| 8/i.test(card) && /LIVING AREA \| 2,400 ft²/i.test(card), 'rooms, bedrooms, baths, living area');
check(/≈ \$14,430/.test(card) && /Wethersfield’s FY2026 mill rate is 41\.22/.test(card) && /\$350,000 here/.test(card), 'tax: $350,000 assessed × 41.22 mills ≈ $14,430');
check(/fire or special district/.test(card) && /October 2024 grand list/.test(card), 'tax caveats and source line');
check(!/SECRET/.test(card), 'no owner name on the card');
check(asked.outFields && !/Owner|Mailing/i.test(asked.outFields) && /AYB/.test(asked.outFields) && /Assessed_Total/.test(asked.outFields), 'owner and mailing fields are never requested: ' + asked.outFields);
check(asked.ma === 0, 'mid-Connecticut never asks MassGIS');
await page.screenshot({ path: 'ct_card.png' });

// 3. Condo, park, church, old sale
const open = async (key) => { await page.evaluate((k) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.SITE_ADDR === k)); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, key); await sleep(500);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const condo = await open('50 HIGH ST UNIT 1');
console.log('condo:', condo.slice(0, 500));
check(/6 units/i.test(condo) && /Condo building/.test(condo), 'stacked records become a condo building');
await page.evaluate(() => document.querySelectorAll('#cardBody .units .unit')[0].click()); await sleep(200);
const ud = await page.$eval('#ud0', (el) => el.innerText.replace(/\n/g, ' '));
console.log('unit 1:', ud);
check(/Value \$224,300/.test(ud) && /Bedrooms 2/.test(ud) && /Baths 1/.test(ud) && /Est\. property tax ≈ \$6,4\d0/.test(ud), 'unit details: value, bedrooms, baths, tax');
const park = await open('300 RIVER RD');
console.log('park:', park.slice(0, 600));
check(/Mobile home park/.test(park) && /taxed on its own bill/.test(park) && /WHOLE PARK/i.test(park) && /40 home sites/.test(park), 'mobile home park wording for Connecticut');
const church = await open('250 MAIN ST');
check(/ESTIMATED PROPERTY TAX \| None/i.test(church), 'a church is tax-exempt');
const old = await page.evaluate(() => { const L = window.__hp.S.local.find((l) => window.__hp.summarize(l.p).r0.SITE_ADDR === '215 MAIN ST'); const s = window.__hp.summarize(L.p); return s.sales[0] && s.sales[0].d.getFullYear(); });
check(old === 1965, 'a sale from before 1970 reads as 1965');

// 4. Map: the Connecticut sample spot and value legend
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Wethersfield/.test(e.textContent))), 'Old Wethersfield sample spot');
await page.evaluate(() => { const b = [...document.querySelectorAll('#samples button')].find((e) => /Wethersfield/.test(e.textContent)); b.click(); }); await sleep(1200);
await page.evaluate(() => document.querySelector('#colorSeg [data-c="value"]').click()); await sleep(400);
const legend = await page.$eval('#legend', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('legend:', legend);
check(/Appraised value/i.test(legend), 'value legend says appraised value');
await page.screenshot({ path: 'ct_map.png' });
await page.evaluate(() => document.querySelector('#colorSeg [data-c="plain"]').click());

// 5. Search with ", CT"
await page.evaluate(() => { document.querySelector('#q').value = '211 Main Street, Wethersfield, CT'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.ct.join(' || '));
check(asked.ct.some((w) => /211 MAIN ST/.test(w) && /WETHERSFIELD/.test(w)), 'search goes to Connecticut first and uses the town');

// 6. Right on the state line: both states' records load together
border = true;
await page.evaluate(() => window.__hp.centerMap(42.0293, -72.5800)); await sleep(1500);
const both = await page.evaluate(() => window.__hp.S.local.map((l) => `${l.p.region}:${window.__hp.summarize(l.p).addr}`).sort().join(', '));
console.log('border lots:', both);
check(/CT:10 State Line Ave/.test(both) && /MA:12 State Line Ave/.test(both), 'lots from both states load at the border');

check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
