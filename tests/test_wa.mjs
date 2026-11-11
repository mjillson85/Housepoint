// Washington: region outline, WaTech's statewide parcels (faked with its real field names and real records' shapes), the Department
// of Revenue's land use codes, county names, addresses, King County's whole-building condo records, the county levy estimate, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8778);
const ORIGIN = 'http://localhost:8778';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WA_SVC = 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0';
// The layer's real fields. It has no owner fields; SUB_ADDRESS holds building and business names, which aren't asked for either.
const WA_FIELDS = ['OBJECTID', 'FIPS_NR', 'COUNTY_NM', 'PARCEL_ID_NR', 'ORIG_PARCEL_ID', 'SITUS_ADDRESS', 'SUB_ADDRESS', 'SITUS_CITY_NM', 'SITUS_ZIP_NR', 'LANDUSE_CD',
  'ORIG_LANDUSE_CD', 'VALUE_LAND', 'VALUE_BLDG', 'DATA_LINK', 'GlobalID', 'Shape__Area', 'Shape__Length'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 47.6680, lon0 = -122.3850;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const KC = { FIPS_NR: '033', COUNTY_NM: '33', SUB_ADDRESS: 'SECRET TENANT' };
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
  if (u.startsWith(WA_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: WA_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(WA_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where')) {
      asked.where.push(q.get('where'));
      return json({ features: /2814 NW 64TH ST/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...KC, OBJECTID: 1, SITUS_ADDRESS: '2814 NW 64TH ST', SITUS_CITY_NM: 'SEATTLE' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // King County: a Ballard house, with the county's link to its assessor page
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...KC, OBJECTID: 1, PARCEL_ID_NR: '033-2767600000', ORIG_PARCEL_ID: '2767600000',
      SITUS_ADDRESS: '2814 NW 64TH ST', SITUS_CITY_NM: 'SEATTLE', SITUS_ZIP_NR: '98107-2510', LANDUSE_CD: 11, ORIG_LANDUSE_CD: '33-2', VALUE_LAND: 712000, VALUE_BLDG: 398000,
      DATA_LINK: 'https://blue.kingcounty.com/Assessor/eRealProperty/Dashboard.aspx?ParcelNbr=2767600000' } });
    // King County: a townhouse (county code 29, "townhouse plat")
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...KC, OBJECTID: 2, SITUS_ADDRESS: '6411 24TH AVE NW', SITUS_CITY_NM: 'SEATTLE', LANDUSE_CD: 18,
      ORIG_LANDUSE_CD: '33-29', VALUE_LAND: 410000, VALUE_BLDG: 545000, DATA_LINK: 'javascript:alert(1)' } });
    // King County: a condo tower is one record per condo (two here, stacked), each with the whole building's value
    for (const [i, land, bldg, code] of [[10, 4347900, 16504000, '33-20'], [11, 8693500, 43677500, '33-25']])
      feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...KC, OBJECTID: i, SITUS_ADDRESS: '1419 1ST AVE', SITUS_CITY_NM: 'SEATTLE', SITUS_ZIP_NR: '98101-2017',
        LANDUSE_CD: 14, ORIG_LANDUSE_CD: code, VALUE_LAND: land, VALUE_BLDG: bldg } });
    // Pierce County: condo units stacked one per unit, written with a dash; no city
    for (const [i, unit, v] of [[20, '301', 412000], [21, '302', 398000], [22, '401', 455000]])
      feats.push({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { FIPS_NR: '053', COUNTY_NM: '53', OBJECTID: i, SITUS_ADDRESS: `1515 DOCK ST   -${unit}`, SUB_ADDRESS: 'SECRET NAME',
        LANDUSE_CD: 14, ORIG_LANDUSE_CD: '53-1410', VALUE_LAND: 60000, VALUE_BLDG: v - 60000 } });
    // Pierce County: an address range, a store
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { FIPS_NR: '053', COUNTY_NM: '53', OBJECTID: 30, SITUS_ADDRESS: '1113 TO 1117 TACOMA AVE S',
      LANDUSE_CD: 53, ORIG_LANDUSE_CD: '53-5390', VALUE_LAND: 457100, VALUE_BLDG: 1336000 } });
    // Thurston County: state offices (exempt)
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { FIPS_NR: '067', COUNTY_NM: '67', OBJECTID: 40, SITUS_ADDRESS: '1129 WASHINGTON ST SE', SITUS_CITY_NM: 'OLYMPIA',
      SITUS_ZIP_NR: '98501', LANDUSE_CD: 67, VALUE_LAND: 2321900, VALUE_BLDG: 5893100 } });
    // Grays Harbor: the county written as a name; a mobile home park
    feats.push({ geometry: { rings: [ring(50, -60, 120, -10, b)] }, attributes: { COUNTY_NM: 'GraysHarbor', OBJECTID: 50, SITUS_ADDRESS: '200 E PARK ST', SITUS_CITY_NM: 'ABERDEEN',
      SITUS_ZIP_NR: '98520', LANDUSE_CD: 15, VALUE_LAND: 640000, VALUE_BLDG: 210000 } });
    // Yakima County: farmland in the current-use program
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { FIPS_NR: '077', COUNTY_NM: '77', OBJECTID: 60, SITUS_ADDRESS: '1800 OLD STAGE RD', LANDUSE_CD: 83,
      VALUE_LAND: 380000, VALUE_BLDG: 0 } });
    // Okanogan County: no address, no code, no value
    feats.push({ geometry: { rings: [ring(-160, -20, -120, 20, b)] }, attributes: { FIPS_NR: '047', COUNTY_NM: '47', OBJECTID: 70, VALUE_LAND: 0, VALUE_BLDG: 0, SITUS_ZIP_NR: '0' } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { seattle: f(47.6062, -122.3321), spokane: f(47.6588, -117.426), vancouver: f(45.6387, -122.6615), tacoma: f(47.2529, -122.4443), bellingham: f(48.7519, -122.4787),
    blaine: f(48.99, -122.75), pointRoberts: f(48.985, -123.07), fridayHarbor: f(48.5343, -123.0171), portAngeles: f(48.118, -123.43), forks: f(47.95, -124.385),
    longview: f(46.138, -122.938), walla: f(46.0646, -118.343), clarkston: f(46.416, -117.0457), longBeach: f(46.352, -124.054), omak: f(48.411, -119.527),
    portland: f(45.5152, -122.6784), astoria: f(46.188, -123.831), rainier: f(46.089, -122.936), umatilla: f(45.917, -119.34), lewiston: f(46.4165, -117.0177),
    coeurDAlene: f(47.677, -116.78), victoria: f(48.4284, -123.3656), sidney: f(48.65, -123.4), vancouverBC: f(49.2827, -123.1207), tsawwassen: f(49.02, -123.08),
    boston: f(42.3601, -71.0589), madison: f(43.0731, -89.4012) };
});
console.log('regions:', JSON.stringify(rg));
check(['seattle', 'spokane', 'vancouver', 'tacoma', 'bellingham', 'blaine', 'pointRoberts', 'fridayHarbor', 'portAngeles', 'forks', 'longview', 'walla', 'clarkston', 'longBeach', 'omak']
  .every((k) => rg[k] === 'WA'), 'Washington places land in Washington');
check(rg.portland === 'OR_METRO' && ['astoria', 'rainier', 'umatilla', 'lewiston', 'coeurDAlene', 'victoria', 'sidney', 'vancouverBC', 'tsawwassen'].every((k) => rg[k] === null),
  'Oregon, Idaho and British Columbia stay out (Portland is the Portland-area region of its own)');
check(rg.boston === 'MA' && rg.madison === 'WI', 'other states unchanged');
const decl = await page.evaluate(() => [[47.61, -122.33], [46.73, -117.18], [47.95, -124.39]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] - 14.9) < 0.4 && Math.abs(decl[1] - 13.5) < 0.4 && Math.abs(decl[2] - 15.2) < 0.4, 'compass declination: Seattle, Pullman, Forks ' + decl.join(', '));

// The Department of Revenue's land use codes
const kinds = await page.evaluate(() => {
  const k = (code, orig, extra = {}) => window.__hp.useKind({ USE_CODE: code, USE_CODE2: orig, BLDG_VAL: 200000, LAND_VAL: 300000, ...extra }, 'WA');
  return { house: k(11, '33-2'), houseLot: k(11, null, { BLDG_VAL: 0 }), duplex: k(12, '33-3'), apts: k(13), kingCondo: k(14, '33-20'), kingMixedCondo: k(14, '33-25'),
    pierceCondo: k(14, '53-1410'), park: k(15), hotel: k(16), dorm: k(17), townhouse: k(18, '33-29'), cabin: k(19), cannery: k(21), sawmill: k(24), rail: k(41), parking: k(46),
    utility: k(48), comCondo: k(50), warehouse: k(51), store: k(53), restaurant: k(58), bank: k(61), office: k(63), gov: k(67), school: k(68), church: k(69), library: k(71),
    golf: k(74), park2: k(76), farm: k(81), currentUse: k(83), mine: k(85), forest: k(88), vacant: k(91), woods: k(92), water: k(93), openSpace: k(94), timber: k(95),
    undeveloped: k(99), none: k(null), zero: k(0) };
});
console.log('kinds:', JSON.stringify(kinds));
const want = { house: 'single', houseLot: 'vacant', duplex: 'multi', apts: 'apartments', kingCondo: 'condoMaster', kingMixedCondo: 'condoMaster', pierceCondo: 'resCondo',
  park: 'mobile', hotel: 'commercial', dorm: 'otherRes', townhouse: 'single', cabin: 'single', cannery: 'industrial', sawmill: 'industrial', rail: 'other', parking: 'commercial',
  utility: 'other', comCondo: 'comCondo', warehouse: 'commercial', store: 'commercial', restaurant: 'commercial', bank: 'commercial', office: 'commercial', gov: 'exempt',
  school: 'exempt', church: 'institutional', library: 'institutional', golf: 'commercial', park2: 'other', farm: 'farmForest', currentUse: 'farmForest', mine: 'industrial',
  forest: 'farmForest', vacant: 'vacant', woods: 'farmForest', water: 'other', openSpace: 'farmForest', timber: 'farmForest', undeveloped: 'vacant', none: 'unknown', zero: 'unknown' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'land use codes read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/2814 NW 64th St/.test(card) && /Seattle · Single-family home/.test(card) && /WASHINGTON/i.test(card), 'address (NW kept in capitals), city and use');
check(/COUNTY MARKET VALUE/i.test(card) && /\$1,110,000/.test(card), 'county market value: land plus building');
check(/The state’s records don’t include sales/.test(card), 'no sales in the state’s records, said plainly');
check(/ROUGH PROPERTY TAX ESTIMATE/i.test(card) && /≈ \$9,920 per year/.test(card) && /King County’s average levy rate for 2025 taxes, \$8\.94 per \$1,000/.test(card),
  'rough tax from King County’s average levy rate');
const link = await page.$eval('#cardBody a.rec-link', (a) => ({ href: a.href, text: a.textContent, target: a.target })).catch(() => null);
check(link && /blue\.kingcounty\.com/.test(link.href) && /County assessor’s page/.test(link.text) && link.target === '_blank', 'a link to the county assessor’s page for the property');
check(/WaTech/.test(card), 'source line');
check(!/SECRET/.test(card), 'no building or business names on the card');
check(asked.outFields && !/SUB_ADDRESS/i.test(asked.outFields) && /LANDUSE_CD/.test(asked.outFields) && /DATA_LINK/.test(asked.outFields) && /FIPS_NR/.test(asked.outFields),
  'the name field is never requested: ' + asked.outFields);

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const town = await open('6411 24TH AVE NW');
check(/Seattle · Townhouse/.test(town) && !(await page.$('#cardBody a.rec-link')), 'a townhouse; a link that isn’t a web address is dropped');
const king = await open('1419 1ST AVE');
console.log('king condo:', king.slice(0, 600));
check(/1419 1st Ave \|/.test(king) && /Condo building/i.test(king) && /King County lists a condo building as one property/.test(king)
  && /whole building at \$73,222,900/.test(king) && !/ROUGH PROPERTY TAX/i.test(king), 'King County condo tower: one record for the building, its value said as the whole building’s, no tax');
const pierce = await open('1515 DOCK ST');
console.log('pierce condo:', pierce.slice(0, 600));
const pUnits = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
check(/1515 Dock St \|/.test(pierce) && /3 units/i.test(pierce) && /\$398k–\$455k/.test(pierce) && /Pierce County’s average levy rate/.test(pierce) && /per unit, per year/.test(pierce)
  && pUnits.some((u) => /Unit 401/.test(u)), 'Pierce County condo units: one building, “-401” read as unit 401: ' + pUnits.join(' / '));
const range = await open('1113-1117 TACOMA AVE S');
check(/1113-1117 Tacoma Ave S \|/.test(range) && /Store/.test(range), 'an address range written “TO”');
const gov = await open('1129 WASHINGTON ST SE');
check(/Olympia · Government property/.test(gov) && /PROPERTY TAX \| None/i.test(gov), 'state offices: exempt');
const park = await open('200 E PARK ST');
console.log('park:', park.slice(0, 700));
check(/Mobile home park/.test(park) && /taxed on its own as personal property/.test(park) && /Grays Harbor County’s average levy rate/.test(park) && /≈ \$7,310 per year/.test(park),
  'a mobile home park; the county written as a name (“GraysHarbor”) still finds its rate');
const farm = await open('1800 OLD STAGE RD');
check(/Farmland \(current use\)/.test(farm) && !/ROUGH PROPERTY TAX/i.test(farm), 'current-use farmland: no estimate from market value');
const none = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.COUNTY === 'Okanogan'));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '); });
check(/Address not listed/.test(none) && !/ROUGH PROPERTY TAX/i.test(none), 'a record with nothing on it');
const derived = await page.evaluate(() => [{ COUNTY_NM: 'Walla Walla', SITUS_ADDRESS: '210 NICHOLS ST W   -A', SITUS_ZIP_NR: '98250' }, { COUNTY_NM: 'SanJuan', SITUS_ADDRESS: '100 SR-14' },
  { FIPS_NR: '063', COUNTY_NM: '63', SITUS_ADDRESS: '0 W MAIN AVE' }].map((a) => { const o = window.__hp.normalizeRecord(a, 'WA'); return [o.COUNTY, o.SITE_ADDR, o.ZIP]; }));
console.log('derived:', JSON.stringify(derived));
check(derived[0][0] === 'Walla Walla' && derived[0][1] === '210 NICHOLS ST W UNIT A' && derived[1][0] === 'San Juan' && derived[1][1] === '100 SR-14'
  && derived[2][0] === 'Spokane' && derived[2][1] === 'W MAIN AVE', 'county names, “-A” units, route numbers and a 0 house number');

const pq = await page.evaluate(() => ['Seattle WA', '100 Pike St, Seattle, Washington', 'Mount Washington', '12 Main St, Washington'].map((t) => window.__hp.parseQuery(t)));
console.log('parsed:', JSON.stringify(pq));
check(pq[0].state === 'WA' && pq[1].state === 'WA' && !pq[2].state && !pq[3].state, 'Washington typed as WA or in full; Mount Washington and “…, Washington” stay towns');

await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Ballard/.test(e.textContent))), 'Ballard sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '2814 NW 64th St, Seattle, WA'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /SITUS_ADDRESS/i.test(w) && /2814 NW 64TH ST/.test(w) && /SITUS_CITY_NM\) LIKE 'SEATTLE%'/i.test(w)), 'search goes to Washington and uses the city');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
