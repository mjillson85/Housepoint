// "Thinking of buying?": listing links, schools (NCES), neighborhood (Census), safety (FBI), nearby (OpenStreetMap), all faked.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8775);
const ORIGIN = 'http://localhost:8775';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const SCH = 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_Characteristics_Current/FeatureServer';
const NCES_SCH = 'https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2324/MapServer';
const DIS = 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_District_Characteristics_Current/FeatureServer';
const TW = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 41.71156, lon0 = -72.65372;
const off = (dx, dy) => [lon0 + dx / (Math.cos(lat0 * Math.PI / 180) * 111320), lat0 + dy / 110540];   // meters east/north -> [lon, lat]
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const school = (id, name, lea, lo, hi, level, dx, dy, extra = {}) => { const [x, y] = off(dx, dy);
  return { geometry: { x, y }, attributes: { NCESSCH: id, SCH_NAME: name, LEAID: lea, LEA_NAME: lea === '0905040' ? 'WETHERSFIELD SCHOOL DISTRICT' : 'OTHER', GSLO: lo, GSHI: hi, SCHOOL_LEVEL: level,
    MEMBER: 400, STUTERATIO: 12.34, CHARTER_TEXT: 'No', MAGNET_TEXT: 'No', VIRTUAL: 'Not Virtual', SCHOOL_TYPE_TEXT: 'Regular School', SY_STATUS_TEXT: 'Open', SURVYEAR: '2023-2024', LATCOD: y, LONCOD: x, ...extra } }; };
const count = {}; const hit = (k) => { count[k] = (count[k] || 0) + 1; };
let overpassDown = false;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { overpass: '', census: [], fbi: [] };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  // parcels: one house east, one west
  if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'Town_Name', 'Location', 'Assessed_Total', 'AYB', 'State_Use', 'State_Use_Description', 'Collection_Year'].map((name) => ({ name })) });
  if (u.startsWith(CT_SVC + '/query')) {
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    return json({ features: [
      { geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { OBJECTID: 1, Town_Name: 'WETHERSFIELD', Location: '211 MAIN ST', Assessed_Total: 350000, AYB: 1752, State_Use_Description: 'Single Fam', Collection_Year: '2025' } },
      { geometry: { rings: [ring(-40, -12, -15, 12, b)] }, attributes: { OBJECTID: 2, Town_Name: 'WETHERSFIELD', Location: '220 MAIN ST', Assessed_Total: 300000, AYB: 1800, State_Use_Description: 'Single Fam', Collection_Year: '2025' } }] });
  }
  // The Department of Education's 2023-24 server: lists its layer, then refuses every search (as the ArcGIS Online copy did in
  // November 2026). The app moves on to the next service.
  if (u.startsWith(NCES_SCH + '?f=json')) return json({ layers: [{ id: 1, name: 'Public School Administrative Data 2023-24', geometryType: 'esriGeometryPoint' }] });
  if (u.startsWith(NCES_SCH + '/1?f=json')) return json({ geometryType: 'esriGeometryPoint', fields: ['NCESSCH', 'SCH_NAME', 'GSLO', 'GSHI'].map((name) => ({ name })) });
  if (u.startsWith(NCES_SCH + '/1/query')) { hit('ncesQuery'); return json({ error: { code: 400, message: 'Cannot perform query. Invalid query parameters.' } }); }
  // NCES schools and districts (layer numbers found through the service list)
  if (u.startsWith(SCH + '?f=json')) { hit('schSvc'); return json({ layers: [{ id: 3, name: 'Public School Characteristics', geometryType: 'esriGeometryPoint' }] }); }
  if (u.startsWith(SCH + '/3?f=json')) return json({ geometryType: 'esriGeometryPoint', fields: ['OBJECTID', 'NCESSCH', 'SCH_NAME', 'LEAID', 'LEA_NAME', 'SCHOOL_LEVEL', 'GSLO', 'GSHI', 'TOTAL', 'MEMBER', 'STUTERATIO',
    'CHARTER_TEXT', 'MAGNET_TEXT', 'VIRTUAL', 'SCHOOL_TYPE_TEXT', 'SY_STATUS_TEXT', 'SURVYEAR', 'LATCOD', 'LONCOD', 'TOTFRL'].map((name) => ({ name })) });
  if (u.startsWith(SCH + '/3/query')) {
    hit('schQ');
    return json({ features: [
      school('090504001', 'CHARLES WRIGHT SCHOOL', '0905040', 'KG', '05', 'Elementary', 600, 300),
      school('090504002', 'ALPHA CHARTER ACADEMY', '0900099', 'KG', '08', 'Elementary', 200, 0, { CHARTER_TEXT: 'Yes' }),   // nearer but a charter
      school('090504003', 'SILAS DEANE MIDDLE SCHOOL', '0905040', '06', '08', 'Middle', -900, 800),
      school('090504004', 'WETHERSFIELD HIGH SCHOOL', '0905040', '09', '12', 'High', 1500, -400),
      school('090504007', 'RIVERSIDE HIGH SCHOOL', '0905040', '09', '12', 'High', 120, 60),
      school('090504005', 'VIRTUAL LEARNING ACADEMY', '0905040', '09', '12', 'High', 50, 50, { VIRTUAL: 'Full Virtual' }),
      school('090504006', 'SPECIAL ED CENTER', '0905040', 'PK', '12', 'Other', 60, 60, { SCHOOL_TYPE_TEXT: 'Special Education School' })] });
  }
  if (u.startsWith(DIS + '?f=json')) return json({ layers: [{ id: 0, name: 'School District Characteristics', geometryType: 'esriGeometryPolygon' }] });
  if (u.startsWith(DIS + '/0?f=json')) return json({ geometryType: 'esriGeometryPolygon', fields: ['OBJECTID', 'LEAID', 'LEA_NAME', 'MEMBER', 'STUTERATIO', 'GSLO', 'GSHI', 'SCH'].map((name) => ({ name })) });
  if (u.startsWith(DIS + '/0/query')) return json({ features: [{ attributes: { LEAID: '0905040', LEA_NAME: 'WETHERSFIELD SCHOOL DISTRICT', MEMBER: 3712, STUTERATIO: 12.81, GSLO: 'PK', GSHI: '12' } }] });
  // Census tract and ACS
  if (u.startsWith(TW + '?f=json')) return json({ layers: [{ id: 6, name: 'Census Block Groups' }, { id: 8, name: 'Census Tracts' }] });
  if (u.startsWith(TW + '/8/query')) return json({ features: [{ attributes: { STATE: '09', COUNTY: '003', TRACT: '491900', BASENAME: '4919' } }] });
  if (u.startsWith('https://api.census.gov/data/')) {
    asked.census.push(u);
    if (/\/data\/2024\//.test(u)) return json({ error: 'unknown dataset' }, 404);     // the newest year isn't out yet: fall back
    const head = ['NAME', 'B01003_001E', 'B19013_001E', 'B25077_001E', 'B25003_001E', 'B25003_002E', 'B25035_001E', 'B25064_001E'];
    if (/for=tract/.test(u)) return json([[...head, 'state', 'county', 'tract'], ['Census Tract 4919; Hartford County; Connecticut', '4321', '112500', '355000', '1700', '1350', '1956', '-666666666', '09', '003', '491900']]);
    return json([[...head, 'state'], ['Connecticut', '3605944', '93760', '343200', '1428313', '940000', '1965', '1431', '09']]);
  }
  // FBI
  if (u.startsWith('https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/CT')) {
    asked.fbi.push(u);
    return json({ HARTFORD: [{ ori: 'CT0006400', agency_name: 'Hartford Police Department', agency_type_name: 'City', latitude: 41.76, longitude: -72.68 },
      { ori: 'CT0016400', agency_name: 'Wethersfield Police Department', agency_type_name: 'City', latitude: 41.71, longitude: -72.65 },
      { ori: 'CT0000000', agency_name: 'Hartford County Sheriff', agency_type_name: 'County', latitude: 41.8, longitude: -72.7 }] });
  }
  if (u.startsWith('https://api.usa.gov/crime/fbi/cde/summarized/agency/')) {
    asked.fbi.push(u);
    const y = /from=01-(\d{4})/.exec(u)[1], violent = /violent-crime/.test(u);
    const months = (v, n = 12) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${String(i + 1).padStart(2, '0')}-${y}`, v]));
    if (y === '2025') return json({ offenses: { rates: {} } });                         // last year not in yet
    return json({ offenses: { rates: { 'Wethersfield Police Department Offenses': months(violent ? 10 : 80, 9), 'Connecticut Offenses': months(violent ? 15 : 120), 'United States Offenses': months(violent ? 31 : 160) },
      actuals: {} } });
  }
  // OpenStreetMap
  if (u.startsWith('https://overpass-api.de/') || u.startsWith('https://overpass.kumi.systems/')) {
    hit('overpass');
    if (overpassDown) return json({ remark: 'busy' }, 429);
    asked.overpass = decodeURIComponent((req.postData() || '').replace(/^data=/, ''));
    const withCoords = !/out tags/.test(asked.overpass);   // like the real service: "out tags" leaves point coordinates out
    const [x1, y1] = off(500, 400), [x2, y2] = off(-300, 0), [x3, y3] = off(0, 150), [x4, y4] = off(250, -200), [x5, y5] = off(60, 40);
    return json({ elements: [
      { type: 'node', ...(withCoords ? { lat: y1, lon: x1 } : {}), tags: { shop: 'supermarket', name: 'Stop & Shop' } },
      { type: 'node', lat: y2, lon: x2, tags: { amenity: 'pharmacy', name: 'CVS Pharmacy' } },
      { type: 'node', lat: y3, lon: x3, tags: { amenity: 'cafe', name: 'Main Street Creamery' } },
      { type: 'way', center: { lat: y4, lon: x4 }, tags: { leisure: 'park', name: 'Cove Park' } },
      { type: 'node', lat: y5, lon: x5, tags: { highway: 'bus_stop' } }, { type: 'node', lat: y4, lon: x4, tags: { highway: 'bus_stop' } },
      { type: 'way', center: { lat: y1 + 0.03, lon: x1 }, tags: { amenity: 'hospital', name: 'Hartford Hospital' } },
      { type: 'node', lat: y3, lon: x3 + 0.002, tags: { amenity: 'library', name: 'Wethersfield Library' } },
      { type: 'count', tags: { nodes: '15', ways: '2', total: '17' } }] });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');
await page.evaluate(() => { try { localStorage.removeItem('housepoint.buyOpen'); } catch (e) {} });
await page.reload(); await sleep(400);

// Helpers on their own
const unit = await page.evaluate(() => {
  const h = window.__hp;
  const months = (v) => Object.fromEntries([1, 2, 3].map((m) => [`0${m}-2024`, v]));
  const s1 = h.cdeSeries({ offenses: { rates: { 'Salem Police Department Offenses': months(20), 'Massachusetts Offenses': months(25), 'United States Offenses': months(30) } } }, 'Massachusetts');
  const gaps = { '01-2024': 100, '02-2024': 100, '03-2024': 100 }; for (let m = 4; m <= 12; m++) gaps[`${String(m).padStart(2, '0')}-2024`] = null;
  const s2 = h.cdeSeries({ offenses: { rates: { 'Florida City Police Department Offenses': gaps, 'Florida Offenses': months(30), 'United States Offenses': months(30) } } }, 'Florida');
  const s3 = h.cdeSeries({ offenses: { rates: { 'Quiet Police Department Offenses': { '01-2024': null, '02-2024': '' }, 'Florida Offenses': months(30) } } }, 'Florida');
  return { s1, s2, s3, n5: h.normPlace('WEST ORANGE TWP'), n6: h.normPlace('West Orange Police Department'), n7: h.normPlace('HADDON HEIGHTS BORO'), n8: h.normPlace('Haddon Heights Police Dept'), n1: h.normPlace('Wethersfield Police Department'), n2: h.normPlace('Town of Wethersfield'), n3: h.normPlace('Cape May City Police Dept') , n4: h.normPlace('Cape May City') };
});
console.log('helpers:', JSON.stringify(unit));
check(Math.abs(unit.s1.here - 2.4) < 1e-9 && Math.abs(unit.s1.state - 3) < 1e-9 && unit.s1.months === 3, 'FBI monthly rates per 100k become a yearly rate per 1,000 (partial years scaled)');
check(unit.n1 === unit.n2 && unit.n3 === unit.n4, 'police department names match town names');
check(unit.n5 === unit.n6 && unit.n7 === unit.n8, 'New Jersey township and borough names match their police departments');
check(Math.abs(unit.s2.here - 12) < 1e-9 && unit.s2.months === 3 && Math.abs(unit.s2.state - 3.6) < 1e-9, 'unreported months are skipped, not counted as zero; "Florida City" isn’t taken for Florida');
check(unit.s3 === null, 'a department with no reported months has no rate (not 0.0)');

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
check(await page.$('#buyBtn') !== null && count.overpass === undefined && count.schQ === undefined, 'card shows the button and loads nothing until tapped');
await page.evaluate(() => document.querySelector('#buyBtn').scrollIntoView()); await sleep(100);
await page.click('#buyBtn'); await sleep(1800);
const buy = await page.$eval('#buyBox', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('buy:', buy);
const links = await page.$$eval('#buyBox .blinks a', (as) => as.map((a) => a.href));
console.log('links:', links.join('  '));
check(/pending or under contract/.test(buy) && /zillow\.com\/homes\/211-Main-St-Wethersfield-CT_rb\//.test(links[0]) && /google\.com\/search\?q=211%20Main%20St%20Wethersfield%20CT%20for%20sale/.test(links[1]), 'listing links to Zillow and a listings search');
check(/District: Wethersfield School District · 3,712 students · 12\.8 per teacher/.test(buy), 'school district');
check(/Elementary \| Charles Wright School/.test(buy) && !/Alpha Charter/.test(buy), 'elementary: in-district school beats a nearer charter');
check(/Middle \| Silas Deane Middle School/.test(buy) && /High \| Riverside High School/.test(buy) && !/Virtual Learning|Special Ed/.test(buy), 'middle and high; virtual and special schools left out');
check(!/(Elementary|Middle) \| Riverside High/.test(buy), 'a nearer high school is never picked as the elementary or middle school');
check(/Grades K–5 · 400 students · 12\.3 per teacher/.test(buy) && /0\.4 mi/.test(buy), 'school details and distance');
check(/Source: NCES, 2023-2024/.test(buy) && /state report cards/.test(buy), 'school source and report-card link');
check(count.ncesQuery >= 1 && /Elementary/.test(buy), `a school service that refuses the search: the next one is asked, and schools still show (${count.ncesQuery} refused)`);
check(/census tract 4919/i.test(buy) && /Household income \| \$112,500 \| Connecticut \| \$93,760/.test(buy), 'neighborhood income next to the state');
check(/Owner-occupied \| 79% \| Connecticut \| 66%/.test(buy) && /Typical home built \| 1956/.test(buy) && !/Rent \|/.test(buy), 'owner share computed; missing rent hidden');
check(/2019–2023/.test(buy) && asked.census.some((x) => /\/data\/2023\//.test(x)), 'falls back to the previous Census year');
check(asked.census.length && asked.census.every((x) => /&key=d7e5755c018834c78e91aaa1039626e6baedd907(&|$)/.test(x)), 'every Census request carries the key');
check(/Safety · Wethersfield Police Department, 2024/i.test(buy) && /Violent crime \| 1\.2 \| per 1,000 residents a year \| Connecticut \| 1\.8/.test(buy) && /Property crime \| 9\.6 \| per 1,000 residents a year \| Connecticut \| 14\.4/.test(buy), 'crime rates per 1,000 for the town and state, falling back a year');
check(/reported 9 months of 2024, scaled/.test(buy), 'partial-year reporting is explained');
check(asked.fbi.every((x) => /API_KEY=QJ7CG8JwMNtGqqNg8BNCBD9kqQd8tLrqhbhRbDc8/.test(x)) && asked.fbi.some((x) => /CT0016400/.test(x)), 'FBI asked for the Wethersfield department with the key');
check(/Grocery \| Stop & Shop \| \d+ min walk \| 0\.4 mi/.test(buy) && /Pharmacy \| CVS Pharmacy/.test(buy) && /Park \| Cove Park/.test(buy) && /Bus stop \| 2 within 0\.5 mi \| 1 min walk \| 150 ft/.test(buy) && /Hospital \| Hartford Hospital \| \d+ min drive/.test(buy), 'nearby places with walk/drive times and distances');
check(/Train \| None within 4\.0 mi/.test(buy) && /Restaurants \| 17 within half a mile/.test(buy) && /OpenStreetMap contributors/.test(buy), 'missing categories and restaurant count');
check(/around:800,41\.71/.test(asked.overpass) && /out count/.test(asked.overpass), 'one Overpass query with a restaurant count');
check(/out center qt;/.test(asked.overpass) && !/out tags/.test(asked.overpass), 'asks for coordinates of single-point places too');
await page.evaluate(() => document.querySelector('#bSchools').scrollIntoView()); await sleep(150);
await page.screenshot({ path: 'buy1.png' });
await page.evaluate(() => document.querySelector('#bSafety').scrollIntoView()); await sleep(150);
await page.screenshot({ path: 'buy2.png' });

// Next card next door: opens by itself and reuses what was loaded for this spot
const before = { ...count };
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 270 }], 0); });
await sleep(600);
const waiting = await page.$eval('#buyBox', (el) => el.innerText);
check(/Scroll down to load/.test(waiting) && count.schQ === before.schQ, 'next card waits until the section is on screen');
await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(1500);
const buy2 = await page.$eval('#buyBox', (el) => el.innerText.replace(/\n+/g, ' | '));
check(!(await page.$('#buyBtn')) && /Thinking of buying\?/.test(buy2), 'after the first tap, cards open the section by themselves');
check(count.schQ === before.schQ && count.overpass === before.overpass, 'the house next door reuses schools and places already loaded');
check(/Loads by itself on each home’s card/.test(buy2) && !!(await page.$('#buyBox [data-buyoff]')), 'the section says it loads by itself, with a Turn off button');
check(/Grocery \| Stop & Shop \| \d+ min walk \| 0\.4 mi/.test(buy2) && /Coffee \| Main Street Creamery/.test(buy2), 'distances are measured from the new house');
// Turned off: back to the button, the choice forgotten, and nothing sent for the next house until it's tapped
await page.click('#buyBox [data-buyoff]'); await sleep(200);
const offState = await page.evaluate(() => ({ btn: !!document.querySelector('#buyBtn'), stored: localStorage.getItem('housepoint.buyOpen') }));
const beforeOff = { ...count };
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 270 }], 0); });
await sleep(400); await page.evaluate(() => { const b = document.querySelector('#buyBox'); if (b) b.scrollIntoView(); }); await sleep(800);
check(offState.btn && offState.stored === null && !!(await page.$('#buyBtn')) && count.schQ === beforeOff.schQ, `Turn off brings back the button and loads nothing more: ${JSON.stringify(offState)}`);
await page.click('#buyBtn'); await sleep(1500);      // on again for the checks below

// Far away with OpenStreetMap down: that part says so, the rest still loads
overpassDown = true;
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(200);
await page.evaluate(() => window.__hp.centerMap(41.76, -72.70)); await sleep(1500);
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(400); await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(2500);
const buy3 = await page.$eval('#buyBox', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('far, overpass down:', buy3.slice(buy3.indexOf('NEARBY'), buy3.indexOf('NEARBY') + 80));
check(/NEARBY \| Couldn’t load this right now/i.test(buy3) && /SCHOOLS \| District: Wethersfield/i.test(buy3) && /SAFETY · Wethersfield/i.test(buy3), 'a failed source says so while the others still show');
await page.screenshot({ path: 'buy3.png' });
// "Your houses": a house skipped with "Not it" within a couple of seconds isn't saved; the one you stay on is
await page.evaluate(() => localStorage.removeItem('housepoint.history.v1'));
await page.evaluate(() => { const S = window.__hp.S; const a = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'), b = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST');
  const c = [{ L: a, dist: 20, cdist: 30, bearing: 90 }, { L: b, dist: 20, cdist: 30, bearing: 270 }]; window.__hp.openSheet(c, 0); setTimeout(() => window.__hp.openSheet(c, 1), 500); });
await sleep(3500);
const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('housepoint.history.v1') || '[]').map((h) => h.addr));
console.log('history:', hist.join(', '));
check(hist.length === 1 && hist[0] === '220 Main St', 'skipped houses stay out of "Your houses"');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
