// New York: region outline (New Jersey, Connecticut and Massachusetts checked first; Pennsylvania, Vermont and Canada out), the
// state's public tax parcels (faked with the layer's real field names and real records' shapes), the state's property classes and
// New York City's groups, full market value where a town's figure carried over and the assessment (called what it is) where it
// didn't, stacked condo units, no sales or tax, and an address found by its position (the layer's address search is too slow).
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8783);
const ORIGIN = 'http://localhost:8783';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1';
const FIELDS = ['OBJECTID', 'COUNTY_NAME', 'MUNI_NAME', 'SWIS', 'PARCEL_ADDR', 'PRINT_KEY', 'SBL', 'CITYTOWN_NAME', 'CITYTOWN_SWIS', 'LOC_ST_NBR', 'LOC_STREET', 'LOC_UNIT',
  'LOC_ZIP', 'PROP_CLASS', 'ROLL_SECTION', 'LAND_AV', 'TOTAL_AV', 'FULL_MARKET_VAL', 'YR_BLT', 'FRONT', 'DEPTH', 'SQ_FT', 'ACRES', 'SCHOOL_CODE', 'SCHOOL_NAME', 'SEWER_TYPE',
  'SEWER_DESC', 'WATER_SUPPLY', 'WATER_DESC', 'UTILITIES', 'UTILITIES_DESC', 'BLDG_STYLE', 'BLDG_STYLE_DESC', 'HEAT_TYPE', 'HEAT_TYPE_DESC', 'FUEL_TYPE', 'FUEL_TYPE_DESC',
  'SQFT_LIVING', 'GFA', 'NBR_KITCHENS', 'NBR_FULL_BATHS', 'NBR_BEDROOMS', 'USED_AS_CODE', 'USED_AS_DESC', 'AG_DIST_CODE', 'AG_DIST_NAME', 'MAIL_ADDR', 'PO_BOX', 'MAIL_CITY',
  'MAIL_STATE', 'MAIL_ZIP', 'ADD_MAIL_ADDR', 'ADD_MAIL_PO_BOX', 'ADD_MAIL_CITY', 'ADD_MAIL_STATE', 'ADD_MAIL_ZIP', 'BOOK', 'PAGE', 'GRID_EAST', 'GRID_NORTH', 'MUNI_PARCEL_ID',
  'SWIS_SBL_ID', 'SWIS_PRINT_KEY_ID', 'ROLL_YR', 'SPATIAL_YR', 'OWNER_TYPE', 'PRIMARY_OWNER', 'ADD_OWNER', 'NYS_NAME', 'NYS_NAME_SOURCE', 'DUP_GEO', 'CALC_ACRES'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 40.6720, lon0 = -73.9780;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const secret = { PRIMARY_OWNER: 'SECRET OWNER', MAIL_ADDR: 'SECRET MAIL', NYS_NAME: 'SECRET NAME' };
const BK = { COUNTY_NAME: 'Kings', MUNI_NAME: 'Brooklyn', SWIS: '610100', CITYTOWN_NAME: 'Brooklyn', LOC_ZIP: '11215', ROLL_YR: 2025, ...secret };
const WP = { COUNTY_NAME: 'Westchester', MUNI_NAME: 'White Plains', SWIS: '551700', CITYTOWN_NAME: 'White Plains', ROLL_YR: 2025, ROLL_SECTION: '1', ...secret };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: [], near: [] };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : (u.split('?')[1] || ''));
  if (u.startsWith(L + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 50000, fields: FIELDS.map((name) => ({ name })) });
  if (u.startsWith(L + '/query')) {
    asked.outFields.push(q.get('outFields'));
    if (q.get('where') && !q.get('geometry')) { asked.where.push(q.get('where')); return json({ features: [] }); }
    if (q.get('where')) asked.near.push(q.get('where'));
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // Park Slope: a one-family (01), a three-family (02), apartments with stores (04), a co-op (02), a school (08)
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...BK, OBJECTID: 1, PRINT_KEY: '1066-29', PARCEL_ADDR: '174A GARFIELD PLACE', LOC_ST_NBR: '174A',
      LOC_STREET: 'GARFIELD PLACE', PROP_CLASS: '01', LAND_AV: 32880, TOTAL_AV: 186360, YR_BLT: 1901, SQ_FT: 1333, BLDG_STYLE_DESC: 'Attached or Semi-Detatched', SQFT_LIVING: 1560 } });
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...BK, OBJECTID: 2, PRINT_KEY: '1066-31', PARCEL_ADDR: '176 GARFIELD PLACE', PROP_CLASS: '02', LAND_AV: 39480,
      TOTAL_AV: 269820, YR_BLT: 1899, BLDG_STYLE_DESC: 'Three Families', SQFT_LIVING: 2400 } });
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { ...BK, OBJECTID: 3, PRINT_KEY: '1059-1', PARCEL_ADDR: '162 7 AVENUE', PROP_CLASS: '04', LAND_AV: 69750,
      TOTAL_AV: 1149300, YR_BLT: 1931, BLDG_STYLE_DESC: 'Over Six Families with Stores', SQFT_LIVING: 6195, GFA: 2065 } });
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { ...BK, OBJECTID: 4, PRINT_KEY: '1059-9', PARCEL_ADDR: '457 1 STREET', PROP_CLASS: '02', LAND_AV: 8550,
      TOTAL_AV: 699750, YR_BLT: 1940, BLDG_STYLE_DESC: 'Cooperative (Other Than Condominiums', SQFT_LIVING: 2180 } });
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { ...BK, OBJECTID: 5, PRINT_KEY: '1060-1', PARCEL_ADDR: '174 7 AVENUE', PROP_CLASS: '08', ROLL_SECTION: '8',
      LAND_AV: 3010500, TOTAL_AV: 14782050, YR_BLT: 1931, BLDG_STYLE_DESC: 'Public Elementary Junior and Senior', GFA: 94170 } });
    // New York City's condo billing lot (the units aren't on the state's map)
    feats.push({ geometry: { rings: [ring(-160, -20, -120, 20, b)] }, attributes: { ...BK, OBJECTID: 6, PRINT_KEY: '1070-7501', PARCEL_ADDR: '300 4 STREET', PROP_CLASS: '02',
      BLDG_STYLE_DESC: 'Condo Billing Lot', TOTAL_AV: 0, LAND_AV: 0 } });
    // White Plains: a house whose full market value carried over; one in a town where it didn't; condo units stacked on one outline
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { ...WP, OBJECTID: 7, PRINT_KEY: '125.76-2-9', PARCEL_ADDR: '33 PAULDING ST', PROP_CLASS: '210', LAND_AV: 156500,
      TOTAL_AV: 477000, FULL_MARKET_VAL: 1083000, YR_BLT: 1925, SQFT_LIVING: 2400, NBR_BEDROOMS: 4, NBR_FULL_BATHS: 2, BLDG_STYLE_DESC: 'Colonial', SCHOOL_NAME: 'White Plains' } });
    feats.push({ geometry: { rings: [ring(120, -20, 160, 20, b)] }, attributes: { ...WP, MUNI_NAME: 'Mount Pleasant', OBJECTID: 8, PRINT_KEY: '106.13-3-61', PARCEL_ADDR: '46 WALNUT ST',
      PROP_CLASS: '210', LAND_AV: 1150, TOTAL_AV: 6450, FULL_MARKET_VAL: 6450, YR_BLT: 1962, SQFT_LIVING: 1800, BLDG_STYLE_DESC: 'Colonial' } });
    for (const [i, unit, av] of [[20, '..28', 6800], [21, '..17', 10400], [22, '..8', 10000]])
      feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...WP, OBJECTID: i, PRINT_KEY: `125.76-1-6${unit}`, PARCEL_ADDR: '25 CITY PLACE', PROP_CLASS: '411',
        LAND_AV: Math.round(av / 10), TOTAL_AV: av, FULL_MARKET_VAL: 347000, DUP_GEO: 'Y' } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { brooklyn: f(40.672, -73.978), manhattan: f(40.7831, -73.9712), bronx: f(40.8448, -73.8648), statenIsland: f(40.5795, -74.1502), queens: f(40.7282, -73.7949),
    montauk: f(41.0359, -71.9545), albany: f(42.6526, -73.7562), buffalo: f(42.8864, -78.8784), rochester: f(43.1566, -77.6088), syracuse: f(43.0481, -76.1474),
    plattsburgh: f(44.6995, -73.4529), watertown: f(43.9748, -75.9108), binghamton: f(42.0987, -75.918), portJervis: f(41.3751, -74.6927), whitePlains: f(41.034, -73.7629),
    jerseyCity: f(40.7178, -74.0431), hoboken: f(40.744, -74.0324), greenwich: f(41.0262, -73.6282), stamford: f(41.0534, -73.5387), pittsfield: f(42.4501, -73.2454),
    bennington: f(42.8781, -73.1968), erie: f(42.1292, -80.0851), scranton: f(41.4090, -75.6624), kingston: f(44.2312, -76.486), montreal: f(45.5017, -73.5673) };
});
console.log('regions:', JSON.stringify(rg));
check(['brooklyn', 'manhattan', 'bronx', 'statenIsland', 'queens', 'montauk', 'albany', 'buffalo', 'rochester', 'syracuse', 'plattsburgh', 'watertown', 'binghamton', 'portJervis', 'whitePlains']
  .every((k) => rg[k] === 'NY'), 'New York places land in New York');
check(rg.jerseyCity === 'NJ' && rg.hoboken === 'NJ' && rg.greenwich === 'CT' && rg.stamford === 'CT' && rg.pittsfield === 'MA', 'New Jersey, Connecticut and Massachusetts keep their side');
check(rg.bennington !== 'NY' && ['erie', 'scranton', 'kingston', 'montreal'].every((k) => rg[k] === null), 'Vermont, Pennsylvania and Canada stay out of New York');
const decl = await page.evaluate(() => [[40.78, -73.97], [42.89, -78.88], [42.65, -73.76]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] + 12.6) < 0.5 && Math.abs(decl[1] + 10.2) < 0.5 && Math.abs(decl[2] + 13.1) < 0.5, 'compass declination: Manhattan, Buffalo, Albany ' + decl.join(', '));

const kinds = await page.evaluate(() => {
  const k = (c, extra = {}) => window.__hp.useKind({ USE_CODE: c, TOTAL_VAL: 500000, BLDG_VAL: 300000, SITE_ADDR: '12 MAIN ST', ...extra }, 'NY');
  const nyc = (c, style) => k(c, { NYC: true, STYLE: style });
  return { one: k('210'), apt: k('215'), two: k('220'), three: k('230'), rural: k('240'), seasonal: k('260'), mobile: k('270'), multi: k('280'), resBiz: k('283'), resLot: k('311', { BLDG_VAL: 0 }),
    rurLot: k('322'), comLot: k('330'), apts: k('411'), hotel: k('414'), store: k('450'), office: k('464'), row: k('481'), church: k('620', { ROLL_SECTION: '8' }), taxedClub: k('682'),
    plant: k('710'), utility: k('822'), forest: k('910'), stateForest: k('931'), park: k('963'), farm: k('105'),
    n01: nyc('01', 'Brick'), n02: nyc('02', 'Three Families'), n02walk: nyc('02', 'Over Six Families Without Stores'), n03: nyc('03', 'Fireproof'), n04: nyc('04', 'Stores, Apartments Above'),
    n04home: nyc('04', 'Primarily Three Family with Store or'), n05: nyc('05', 'Semi-Fireproof'), n06: nyc('06', 'Fireproof'), n08: nyc('08', 'Church, Synagogue, Chapel'), n10: nyc('10', 'Unlicensed Parking Lot'),
    n11: nyc('11', null), condo: nyc('02', 'Condo Billing Lot') };
});
const want = { one: 'single', apt: 'single', two: 'multi', three: 'multi', rural: 'single', seasonal: 'single', mobile: 'mobile', multi: 'multi', resBiz: 'mixedRes', resLot: 'vacant',
  rurLot: 'vacant', comLot: 'vacant', apts: 'apartments', hotel: 'commercial', store: 'commercial', office: 'commercial', row: 'mixed', church: 'exempt', taxedClub: 'institutional',
  plant: 'industrial', utility: 'other', forest: 'farmForest', stateForest: 'exempt', park: 'exempt', farm: 'farmForest', n01: 'single', n02: 'multi', n02walk: 'apartments',
  n03: 'apartments', n04: 'mixed', n04home: 'mixedRes', n05: 'commercial', n06: 'industrial', n08: 'exempt', n10: 'commercial', n11: 'vacant', condo: 'condoMaster' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'classes and New York City groups read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1200));
check(/174A Garfield Place \|/.test(card) && !/VALUE PER FT/i.test(card) && /Brooklyn · Single-family home/.test(card) && /New York/i.test(card), 'address, borough and use');
check(/CITY ASSESSED VALUE \(A FRACTION OF MARKET VALUE\)/i.test(card) && /\$186,360/.test(card) && /Built 1901/.test(card) && /1,560 ft²/.test(card), 'New York City’s assessment, called what it is');
check(/The state’s records don’t include sales/.test(card) && !/ESTIMATED PROPERTY TAX|ROUGH PROPERTY TAX/i.test(card) && !/LAND VALUE/i.test(card), 'no sales, no tax estimate, no fractional land value');
check(!/SECRET/.test(card) && asked.outFields.every((f) => !/PRIMARY_OWNER|ADD_OWNER|MAIL_|NYS_NAME|PO_BOX/.test(f || '')), 'owner and mailing fields are never asked for');

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
check(/Brooklyn · Three-family home/.test(await open('176 GARFIELD PLACE')), 'a three-family home');
check(/Brooklyn · Homes and stores/.test(await open('162 7 AVENUE')), 'apartments over stores');
check(/Brooklyn · Co-op building/.test(await open('457 1 STREET')), 'a co-op');
check(/Brooklyn · Institution|Brooklyn · School/.test(await open('174 7 AVENUE')), 'a school');
const condoLot = await open('300 4 STREET');
check(/Condominium/.test(condoLot) && /units separately/.test(condoLot), 'New York City’s condo billing lot says its units aren’t here: ' + condoLot.slice(0, 200));
const wp = await open('33 PAULDING ST');
check(/White Plains · Single-family home/.test(wp) && /FULL MARKET VALUE \(STATE ESTIMATE\)/i.test(wp) && /\$1,083,000/.test(wp) && /4 BEDROOMS|BEDROOMS \| 4/i.test(wp), 'full market value where it carried over: ' + wp.slice(0, 400));
const mp = await open('46 WALNUT ST');
check(/Mount Pleasant · Single-family home/.test(mp) && /TOWN ASSESSED VALUE \(A FRACTION OF MARKET VALUE\)/i.test(mp) && /\$6,450/.test(mp), 'a town’s fractional assessment, called what it is');
const stack = await open('25 CITY PLACE');
check(/3 units/i.test(stack) && /Condo building/i.test(stack), 'condo units stacked on one outline');

const pq = await page.evaluate(() => ['Buffalo, NY', '100 Main St, Ithaca, New York', '12 Main St, Brooklyn, NY'].map((t) => window.__hp.parseQuery(t)));
check(pq.every((q) => q.state === 'NY'), 'New York typed as NY or in full');
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Park Slope/.test(e.textContent))), 'Park Slope sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '33 Paulding St, White Plains, NY'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
check(!asked.where.length, 'the slow address search isn’t asked (the address is found by its position): ' + asked.where.join(' | '));
const forms = await page.evaluate(() => ['457 1ST ST', '169 W 85TH ST', '31-14 31ST AVE'].map((a) => window.__hp.REGIONS.NY.searchForms(a)));
check(forms[0].includes('457 1 ST') && forms[1].includes('169 WEST 85 ST') && forms[2].includes('31-14 31 AVE'), 'New York City’s way of writing addresses: ' + JSON.stringify(forms));
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
