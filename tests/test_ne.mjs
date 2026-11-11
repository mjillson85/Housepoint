// Nebraska: region outline, the State of Nebraska's statewide parcels (faked with its real field names and real records' shapes),
// the state's property classification code, Lancaster County's missing parcel types, addresses with the city and zip on them,
// Omaha's tax-increment financing twins, stacked condo units, the county average tax rate, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8779);
const ORIGIN = 'http://localhost:8779';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NE_SVC = 'https://giscat.ne.gov/enterprise/rest/services/StatewideParcelsExternal/MapServer/0';
// The layer's real fields (the public copy has no owner names or mailing addresses; the legal description is never asked for).
const NE_FIELDS = ['OBJECTID', 'State_PID', 'Parcel_ID', 'Situs_Address', 'Ph_Rd_Num', 'Ph_Pre_Dir', 'Ph_Rd_Name', 'Ph_Rd_Type', 'Ph_Suf_Dir', 'Ph_City', 'Ph_State',
  'Ph_Zip5', 'Ph_Zip4', 'Ph_Full_Address', 'GeoCode', 'Legal_Description', 'Twn', 'Sect', 'Rng', 'Rng_Direction', 'Qrt', 'Acres_Deeded', 'GIS_Acres', 'Subdivision',
  'County_ID', 'ASSRLOC', 'Total_Assessed_Value', 'Land_Value', 'Improvements_Value', 'Other_Impr_Value', 'Ag_Land_Value', 'Classification_Code',
  'Property_Parcel_Status', 'Property_Parcel_Type', 'Zoning', 'Location', 'City_Size', 'Parcel_Size', 'Property_SubClass', 'Irrigation_Type', 'Ownership_Type',
  'TAXDIST', 'School_District', 'School_District_Name', 'Source_Document', 'Sales_Date', 'Sales_Value', 'Sale_Useability', 'CAMAUpdate', 'ShapeUpdate',
  'Parcel_URL', 'BuildingYear', 'RCN', 'ImpSF', 'QualImp', 'CondImp', 'Neighborhood'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 41.2611, lon0 = -95.9850;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const legal = { Legal_Description: 'SECRET LEGAL DESCRIPTION' };
const DOUG = { County_ID: '055', Ph_City: 'OMAHA', Ownership_Type: 'UNKNOWN', ...legal }, LANC = { County_ID: '109', Ph_City: 'LINCOLN', Ownership_Type: 'Private', ...legal };
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
  if (u.startsWith(NE_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: NE_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(NE_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where') && !q.get('geometry')) {
      asked.where.push(q.get('where'));
      return json({ features: /4745 CAPITOL AV/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...DOUG, OBJECTID: 1, Situs_Address: '4745  CAPITOL AV' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // Douglas County: a Dundee house
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...DOUG, OBJECTID: 1, Parcel_ID: '0716040000', Situs_Address: '4745  CAPITOL AV', Ph_Zip5: '68132',
      Total_Assessed_Value: 214800, Land_Value: 27500, Improvements_Value: 187300, Classification_Code: '010102010101', Property_Parcel_Status: '01', Property_Parcel_Type: '01',
      Sales_Date: 1661904000000, Sales_Value: 260000, BuildingYear: '1924', ImpSF: 1650, TAXDIST: '100',
      Parcel_URL: 'https://beacon.schneidercorp.com/Application.aspx?App=DouglasCountyNE&PageType=Search&KeyValue=0716040000' } });
    // Douglas County: a lot in a tax-increment financing district: two records on one outline, the first without an address
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...DOUG, OBJECTID: 10, Parcel_ID: '0314000001', Total_Assessed_Value: 548900, Land_Value: 139400,
      Improvements_Value: 409500, Classification_Code: '010303010101', Property_Parcel_Status: '01', Property_Parcel_Type: '03', Sales_Date: 1743465600000, Sales_Value: 2000000, TAXDIST: '100' } });
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...DOUG, OBJECTID: 11, Parcel_ID: '0314000003', Situs_Address: '1412  HOWARD ST', Total_Assessed_Value: 17200,
      Land_Value: 0, Improvements_Value: 17200, Classification_Code: '010303010901', Property_Parcel_Status: '01', Property_Parcel_Type: '03', TAXDIST: '2514' } });
    // Douglas County: condo units stacked on one outline, the unit written after the street
    for (const [i, unit, v] of [[20, '102', 210000], [21, '124', 236000], [22, '204', 251000]])
      feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...DOUG, OBJECTID: i, Parcel_ID: `20081080${i}`, Situs_Address: `1403  FARNAM ST  ${unit}`,
        Total_Assessed_Value: v, Land_Value: 12000, Improvements_Value: v - 12000, Classification_Code: '010103010101', Property_Parcel_Status: '01', Property_Parcel_Type: '01' } });
    // Lancaster County (Lincoln): no parcel type; a condo's common record (no value) and units with the city, state and zip on the address
    const LC = (id, extra) => ({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { ...LANC, OBJECTID: id, Ph_Zip5: '68502', ...extra } });
    feats.push(LC(30, { Parcel_ID: '1036204100000', Situs_Address: '2420 A ST  LINCOLN  NE  68502', Total_Assessed_Value: 0, Land_Value: 0, Improvements_Value: 0,
      Classification_Code: '020001010203', Property_Parcel_Status: '02', Sales_Value: 0 }));
    for (const [i, addr, v] of [[31, '2420 A ST  UNIT #2420  LINCOLN  NE  68502', 106100], [32, '2422 A ST  UNIT #2422  LINCOLN  NE  68502', 106100],
      [33, '1335 S 25TH ST  UNIT #1335  LINCOLN  NE  68502', 115900]])
      feats.push(LC(i, { Parcel_ID: `10362041000${i}`, Situs_Address: addr, Total_Assessed_Value: v, Land_Value: 35000, Improvements_Value: v - 35000,
        Classification_Code: '010001010201', Property_Parcel_Status: '01' }));
    // Lancaster County: a house (no parcel type: its zoning says single family) whose "sale date" is a day count
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { ...LANC, OBJECTID: 40, Parcel_ID: '1036206002000', Situs_Address: '2534 A ST  LINCOLN  NE  68502',
      Total_Assessed_Value: 247000, Land_Value: 34400, Improvements_Value: 212600, Classification_Code: '010001010201', Property_Parcel_Status: '01', Sales_Date: 1123 } });
    // Lancaster County: exempt
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { ...LANC, Ownership_Type: 'Exempt', OBJECTID: 41, Situs_Address: '1340 S 27TH ST  LINCOLN  NE  68502',
      Total_Assessed_Value: 1250000, Land_Value: 250000, Improvements_Value: 1000000, Classification_Code: '010001010201', Property_Parcel_Status: '01' } });
    // Sarpy County: the address carries the city, state and zip
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { County_ID: '153', Ph_City: 'BELLEVUE', OBJECTID: 50, Situs_Address: '307 E MISSION AVE  BELLEVUE NE 68005',
      Total_Assessed_Value: 143121, Land_Value: 30000, Improvements_Value: 113121, Classification_Code: '010101010301', Property_Parcel_Status: '01', Property_Parcel_Type: '01' } });
    // Hall County: farmland
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { County_ID: '079', OBJECTID: 60, Situs_Address: '4200 W STOLLEY PARK RD', Ph_City: 'GRAND ISLAND',
      Total_Assessed_Value: 412000, Land_Value: 412000, Improvements_Value: 0, Ag_Land_Value: 412000, Classification_Code: '020505030105', Property_Parcel_Status: '02', Property_Parcel_Type: '05' } });
    // Custer County: an outline with nothing on it
    feats.push({ geometry: { rings: [ring(-160, -20, -120, 20, b)] }, attributes: { County_ID: '041', OBJECTID: 70, Total_Assessed_Value: 0, Land_Value: 0, Improvements_Value: 0,
      Classification_Code: '000000000000', Sales_Value: 0, ImpSF: 0 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { omaha: f(41.2565, -95.9345), dundee: f(41.2611, -95.985), lincoln: f(40.8136, -96.7026), grandIsland: f(40.925, -98.342), kearney: f(40.6993, -99.0832),
    northPlatte: f(41.1239, -100.7654), scottsbluff: f(41.8666, -103.6672), valentine: f(42.873, -100.551), chadron: f(42.829, -102.999), southSioux: f(42.4739, -96.4136),
    nebraskaCity: f(40.676, -95.859), fallsCity: f(40.06, -95.6), councilBluffs: f(41.262, -95.861), siouxCity: f(42.4963, -96.4049), yankton: f(42.871, -97.397),
    denver: f(39.7392, -104.9903), cheyenne: f(41.14, -104.82), julesburg: f(40.988, -102.264), topeka: f(39.05, -95.68), hamburg: f(40.6, -95.65),
    madison: f(43.0731, -89.4012), boston: f(42.3601, -71.0589) };
});
console.log('regions:', JSON.stringify(rg));
check(['omaha', 'dundee', 'lincoln', 'grandIsland', 'kearney', 'northPlatte', 'scottsbluff', 'valentine', 'chadron', 'southSioux', 'nebraskaCity', 'fallsCity']
  .every((k) => rg[k] === 'NE'), 'Nebraska places land in Nebraska');
check(['councilBluffs', 'siouxCity', 'yankton', 'denver', 'cheyenne', 'julesburg', 'topeka', 'hamburg'].every((k) => rg[k] === null), 'Iowa, South Dakota, Colorado, Wyoming and Kansas stay out');
check(rg.madison === 'WI' && rg.boston === 'MA', 'other states unchanged');
const decl = await page.evaluate(() => [[41.26, -95.94], [41.87, -103.67]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] - 2.0) < 0.5 && Math.abs(decl[1] - 7.0) < 0.5, 'compass declination: Omaha, Scottsbluff ' + decl.join(', '));

// The state's parcel types (and Lancaster's zoning standing in for them)
const kinds = await page.evaluate(() => {
  const k = (type, extra = {}) => window.__hp.useKind({ USE_CODE: type, STATUS: '01', TOTAL_VAL: 250000, BLDG_VAL: 200000, SITE_ADDR: '12 MAIN ST', ...extra }, 'NE');
  return { house: k('01'), lot: k('01', { STATUS: '02', BLDG_VAL: 0 }), duplex: k('02'), apts: k('02', { TOTAL_VAL: 4e6 }), shop: k('03'), shopLot: k('03', { STATUS: '02', BLDG_VAL: 0 }),
    plant: k('04'), farm: k('05'), cabin: k('06'), mobile: k('07'), minerals: k('09'), rail: k('10'), exempt: k('11'), gameParks: k('12'), leased: k('01', { STATUS: '03' }),
    condo: k('01', { SITE_ADDR: '1403 FARNAM ST 102' }), noValue: k('01', { TOTAL_VAL: 0, BLDG_VAL: 0 }),
    lancHouse: k(null, { CLASS_CODE: '010001010201', OWN_TYPE: 'Private' }), lancShop: k(null, { CLASS_CODE: '010003010201', OWN_TYPE: 'Private' }),
    lancExempt: k(null, { CLASS_CODE: '010001010201', OWN_TYPE: 'Exempt' }), lancState: k(null, { CLASS_CODE: '010001010201', OWN_TYPE: 'State' }),
    sarpyChurch: k('11', { OWN_TYPE: '9004: RELIGIOUS ORGANIZATIONS EXEMPT' }), railroad: k(null, { OWN_TYPE: '8000: RAILROAD - STATE ASSESSED' }), none: k(null) };
});
console.log('kinds:', JSON.stringify(kinds));
const want = { house: 'single', lot: 'vacant', duplex: 'multi', apts: 'apartments', shop: 'commercial', shopLot: 'vacant', plant: 'industrial', farm: 'farmForest', cabin: 'single',
  mobile: 'mobile', minerals: 'other', rail: 'other', exempt: 'exempt', gameParks: 'exempt', leased: 'single', condo: 'resCondo', noValue: 'other', lancHouse: 'single',
  lancShop: 'commercial', lancExempt: 'exempt', lancState: 'exempt', sarpyChurch: 'exempt', railroad: 'other', none: 'unknown' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'parcel types read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/4745 Capitol Av \|/.test(card) && /Omaha · Single-family home/.test(card) && /NEBRASKA/i.test(card), 'address (double space gone), city and use');
check(/COUNTY ASSESSED VALUE/i.test(card) && /\$214,800/.test(card) && /Built 1924/.test(card), 'assessed value and year built');
check(/Last sold \$260,000 · Aug 2022/.test(card), 'last sale with its price');
check(/ROUGH PROPERTY TAX ESTIMATE/i.test(card) && /≈ \$4,380 per year/.test(card) && /Douglas County’s average tax rate for 2025, 2\.04%/.test(card) && /property tax credits/.test(card),
  'rough tax from Douglas County’s average rate');
check(/LIVING AREA \| 1,650 ft²/i.test(card), 'the building’s square feet');
const link = await page.$eval('#cardBody a.rec-link', (a) => a.href).catch(() => '');
check(/beacon\.schneidercorp\.com/.test(link), 'a link to the county assessor’s page');
check(/State of Nebraska/.test(card) && !/SECRET/.test(card), 'source line; no legal description on the card');
check(asked.outFields && !/Legal|Owner(?!ship_Type)|Mail/i.test(asked.outFields) && /Total_Assessed_Value/.test(asked.outFields) && /Classification_Code/.test(asked.outFields),
  'the legal description is never requested: ' + asked.outFields);

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const tif = await open('1412 HOWARD ST');
console.log('tif:', tif.slice(0, 700));
check(/1412 Howard St \|/.test(tif) && /Omaha · Commercial/.test(tif) && /\$566,100/.test(tif) && /Last sold \$2,000,000 · Apr 2025/.test(tif) && !/Also on this lot/.test(tif)
  && /tax-increment financing/.test(tif), 'a tax-increment financing lot’s two records are one: values added, the sale kept');
const copied = await page.evaluate(() => { const L = window.__hp.S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith('1412 HOWARD'))); return JSON.parse(window.__hp.lotRecordsJson(L)).records.length; });
check(copied === 2, '“copy this lot’s records” still copies both records as the state sent them');
const condo = await open('1403 FARNAM ST');
console.log('condo:', condo.slice(0, 500));
check(/1403 Farnam St \|/.test(condo) && /3 units/i.test(condo) && /Condo building/i.test(condo) && /per unit, per year/.test(condo), 'stacked condo units, unit written after the street');
const lanc = await open('2420 A ST');
console.log('lancaster condo:', lanc.slice(0, 600));
const lUnits = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
check(/2420 A St \|/.test(lanc) && /Lincoln · Condo building/.test(lanc) && /3 units/i.test(lanc) && lUnits.some((u) => /Unit 2420/.test(u)) && !lUnits.some((u) => /Lincoln Ne|#/.test(u)),
  'Lancaster condo: city, state and zip off the addresses, “UNIT #2420” read as a unit, the common record isn’t one: ' + lUnits.join(' / '));
const house = await open('2534 A ST');
check(/2534 A St \|/.test(house) && /Lincoln · Single-family home/.test(house) && /No recorded sale on file/.test(house) && /Lancaster County’s average tax rate for 2025, 1\.60%/.test(house) && /≈ \$3,940/.test(house),
  'Lancaster house: no parcel type, its zoning says single family; a day count isn’t a sale date');
const exempt = await open('1340 S 27TH ST');
check(/Tax-exempt property/.test(exempt) && /ESTIMATED PROPERTY TAX \| None/i.test(exempt), 'Lancaster exempt (ownership type): no tax');
const sarpy = await open('307 E MISSION AVE');
check(/307 E Mission Ave \|/.test(sarpy) && /Bellevue · Single-family home/.test(sarpy), 'Sarpy address: city, state and zip off');
const farm = await open('4200 W STOLLEY PARK RD');
check(/Grand Island · Farmland/.test(farm) && !/ROUGH PROPERTY TAX/i.test(farm), 'farmland: no estimate (taxed on 75% of value, and rates differ)');
const none = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.COUNTY === 'Custer'));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '); });
check(/Address not listed/.test(none) && /No value on the tax roll/.test(none), 'an outline with nothing on it');

const pq = await page.evaluate(() => ['Omaha, NE', '100 Main St, Lincoln, Nebraska', '500 Beach Dr NE'].map((t) => window.__hp.parseQuery(t)));
check(pq[0].state === 'NE' && pq[1].state === 'NE' && !pq[2].state, 'Nebraska typed as NE or in full; “Beach Dr NE” is still northeast');
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Dundee/.test(e.textContent))), 'Dundee sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '4745 Capitol Ave, Omaha, NE'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /Situs_Address/i.test(w) && /4745 CAPITOL AVE?%/.test(w) && /Ph_City\) LIKE 'OMAHA%'/i.test(w)), 'search goes to Nebraska and uses the city');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
