// The card in tabs (?tabs=1): Home · Financing · Schools · Nearby · Area, with the same faked services as test_buy.mjs.
// Checks that the long card is untouched without the switch, that nothing outside is asked until a tab is opened, and that
// "Not it" goes back to Home.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8797);
const ORIGIN = 'http://localhost:8797';
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
      { geometry: { rings: [ring(-40, -12, -15, 12, b)] }, attributes: { OBJECTID: 2, Town_Name: 'WETHERSFIELD', Location: '220 MAIN ST', Assessed_Total: 300000, AYB: 1800, State_Use_Description: 'Single Fam', Collection_Year: '2025' } },
      { geometry: { rings: [ring(-12, 30, 12, 60, b)] }, attributes: { OBJECTID: 3, Town_Name: 'WETHERSFIELD', Location: '230 MAIN ST', Assessed_Total: 900000, AYB: 1970, State_Use_Description: 'Store', State_Use: '3220', Collection_Year: '2025' } }] });
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
const asks = () => ({ sch: count.schQ || 0, near: count.overpass || 0, census: asked.census.length, fbi: asked.fbi.length });
const outside = (a) => a.sch + a.near + a.census + a.fbi;
const pick = (addr) => `(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '${addr}'); return [{ L, dist: 20, cdist: 30, bearing: 90 }]; })()`;
const text = (sel) => page.$eval(sel, (el) => el.innerText.replace(/\n+/g, ' | '));
const shown = () => page.evaluate(() => [...document.querySelectorAll('#cardBody .tpane')].filter((p) => !p.hidden).map((p) => p.id));
const cardH = () => page.$eval('#sheet .card', (el) => Math.round(el.getBoundingClientRect().height));
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });

// A. Without the switch: the long card, exactly as before
await page.goto(ORIGIN + '/');
await page.evaluate(() => { try { localStorage.removeItem('housepoint.buyOpen'); localStorage.removeItem('housepoint.tabs'); } catch (e) {} });
await page.reload(); await sleep(400);
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const classic = await page.evaluate(() => ({ head: document.querySelector('#cardHead').innerHTML, cls: document.querySelector('#sheet').className, btn: !!document.querySelector('#buyBtn'),
  addrInBody: !!document.querySelector('#cardBody .addr'), tabs: document.querySelectorAll('.tabbar').length }));
check(classic.head === '' && !/tabcard|tabbed/.test(classic.cls) && classic.btn && classic.addrInBody && classic.tabs === 0, `no ?tabs: the long card with its "Thinking of buying?" button, no tabs (${JSON.stringify(classic)})`);

// B. ?tabs=1 turns it on and remembers it
await page.goto(ORIGIN + '/?tabs=1'); await sleep(400);
check(await page.evaluate(() => localStorage.getItem('housepoint.tabs')) === '1', '?tabs=1 is remembered on the phone');
await page.goto(ORIGIN + '/'); await sleep(400);
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
const before = asks();
await page.click('#shutter'); await sleep(1500);
const strip = await page.$$eval('#cardHead .tabbar [role="tab"]', (bs) => bs.map((b) => `${b.textContent}:${b.getAttribute('aria-selected')}`));
console.log('strip:', strip.join(' '));
check(strip.join(' ') === 'Home:true Financing:false Schools:false Nearby:false Area:false', 'five tabs, Home open');
check(JSON.stringify(await shown()) === '["tp-home"]', 'only the Home pane shows');
check(/211 Main St/.test(await text('#cardHead')) && !(await page.$('#cardBody .addr')) && !(await page.$('#buyBtn')), 'the address sits above the tabs; no buying button');
const h0 = await cardH();
check(h0 > 500 && h0 < 600, `the card opens about two-thirds tall (${h0}px of 844)`);
const home = await text('#tp-home');
console.log('home:', home.slice(0, 400));
check(/APPRAISED VALUE[^|]*\| \$500,000 \| Appraised value is the town’s figure for taxes, not a market estimate; Connecticut taxes 70% of it\./i.test(home), 'what the value is sits right under it, in the source’s words');
check(/PROPERTY TAX/i.test(home) && /How it’s figured, in Financing/.test(home) && !/Doesn’t include exemptions|mill rate/i.test(home), 'Home shows the tax figure; how it’s figured is under Financing');
check(home.indexOf('PROPERTY TAX') < home.indexOf('FOR SALE?') && /flood/i.test(home), 'value, tax and flood come before the rest');
check(/For sale\?/i.test(home) && !!(await page.$('#tp-home .blinks a[href*="zillow.com/homes/211-Main-St-Wethersfield-CT_rb/"]')), 'For sale? links are on Home');
check(/Owner names are never shown/.test(home) && !!(await page.$('#tp-home .aerial')), 'source note and aerial photo are on Home');
check(outside(asks()) === outside(before), `nothing sent to schools, Census, FBI or places on opening the card (${JSON.stringify(asks())})`);

// C. Financing: on the phone, nothing sent; the card grows
await page.click('#tp-home .tmore'); await sleep(500);
check(JSON.stringify(await shown()) === '["tp-fin"]' && (await page.$eval('#tb-fin', (b) => b.getAttribute('aria-selected'))) === 'true', '"How it’s figured" opens Financing');
const fin = await text('#tp-fin');
check(/Worked out on this phone\. Nothing is sent\./.test(fin) && /MONTHLY COST/i.test(fin) && /≈ \$[\d,]+ a month/.test(fin) && /Tax: the estimate below/.test(fin) && /PROPERTY TAX/i.test(fin), 'Financing: monthly cost, then the full tax box (“the estimate below”)');
await sleep(400);
const h1 = await cardH();
check(h1 > 700, `another tab grows the card to full height (${h1}px)`);
check(outside(asks()) === outside(before), 'still nothing sent');
await page.click('#tb-home'); await sleep(200);
await page.screenshot({ path: 'tabs_home.png' });

// D. Schools: schools and safety load when opened, and only they
await page.click('#tb-sch'); await sleep(1800);
const sch = await text('#tp-sch'); const a1 = asks();
console.log('schools:', sch.slice(0, 300));
check(/Looked up when you open this tab/.test(sch) && /NCES/.test(sch) && /Privacy notes/.test(sch), 'Schools says what it sends, and where');
check(/Elementary \| Charles Wright School/.test(sch) && /Safety · Wethersfield Police Department/i.test(sch), 'schools and safety load');
check(a1.sch > before.sch && a1.fbi > before.fbi && a1.census === before.census && a1.near === before.near, `only the school and crime services were asked (${JSON.stringify(a1)})`);
await page.screenshot({ path: 'tabs_schools.png' });

// E. Nearby, with the Walk Score link
await page.click('#tb-near'); await sleep(1800);
const near = await text('#tp-near'); const a2 = asks();
const ws = await page.$eval('#tp-near .twalk a', (a) => a.href);
console.log('walk score:', ws);
check(/^https:\/\/www\.walkscore\.com\/score\/211-main-st-wethersfield-ct\/lat=41\.\d{5}\/lng=-72\.\d{5}$/.test(ws), 'Walk Score link for the address');
check(/Grocery \| Stop & Shop/.test(near) && a2.near > a1.near && a2.census === before.census, 'nearby places load; Census still not asked');
const chip = await page.$('#tp-near .nchips button:nth-child(2)');
const g = chip && await page.evaluate((b) => b.dataset.g, chip);
if (chip) { await chip.click(); await sleep(300); }
check(!!chip && (await page.$eval(`#tp-near .nchips button[data-g="${g}"]`, (b) => b.classList.contains('on'))), `Nearby’s filter chips work in the tab (${g})`);
await page.screenshot({ path: 'tabs_nearby.png' });

// F. Area
await page.click('#tb-hood'); await sleep(1500);
const hood = await text('#tp-hood');
check(/Census Bureau/.test(hood) && /Household income \| \$112,500/.test(hood) && asks().census > 0, 'Area loads the Census figures when opened');

// G. Arrow keys move along the strip
await page.focus('#tb-hood'); await page.keyboard.press('ArrowRight'); await sleep(200);
check((await page.$eval('#tb-home', (b) => b.getAttribute('aria-selected'))) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'tb-home', 'arrow keys move between tabs');
await page.click('#tb-sch'); await sleep(300);

// H. "Not it": the next house opens on Home and sends nothing until a tab is opened
const a3 = asks();
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([...S.candidates.slice(0, S.cIdx + 1), { L, dist: 20, cdist: 30, bearing: 270 }], S.cIdx); });
await sleep(300); await page.click('#nextC'); await sleep(1200);
check(/220 Main St/.test(await text('#cardHead')) && JSON.stringify(await shown()) === '["tp-home"]' && (await page.$eval('#tb-home', (b) => b.getAttribute('aria-selected'))) === 'true', '"Not it" opens the next house on Home');
check(outside(asks()) === outside(a3), `and sends nothing for it (${JSON.stringify(asks())} vs ${JSON.stringify(a3)})`);
check((await cardH()) > 700, 'the card stays full height across "Not it"');
await page.click('#tb-sch'); await sleep(1200);
check(/Charles Wright School/.test(await text('#tp-sch')) && asks().sch === a3.sch, 'the house next door reuses the schools already looked up');

// I. A failed lookup says so and can be tried again
overpassDown = true;
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(200);
await page.evaluate(() => window.__hp.centerMap(41.76, -72.70)); await sleep(1500);
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(400); await page.click('#tb-near'); await sleep(2500);
check(/Couldn’t load this right now/.test(await text('#tp-near')) && !!(await page.$('#tp-near [data-retry]')), 'a failed lookup says so, with Try again');
overpassDown = false;
await page.click('#tp-near [data-retry]'); await sleep(2000);
const again = await text('#tp-near'); console.log('after retry:', again.slice(0, 300));
check(/Grocery \|/.test(again) && !/Couldn’t load/.test(again), 'Try again loads it');

// J. Not a home: no strip, content-sized card
const nh = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '230 MAIN ST'); if (!L) return null;
  window.__hp.closeSheet && window.__hp.closeSheet(); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0);
  return { isHome: window.__hp.summarize(L.p).isHome, strip: !!document.querySelector('#cardHead .tabbar'), cls: document.querySelector('#sheet').className, sale: !!document.querySelector('#tSale') }; });
console.log('not a home:', JSON.stringify(nh));
check(nh && !nh.isHome && !nh.strip && !/tabbed/.test(nh.cls) && !nh.sale, 'a store: just its Home info, no tabs, no for-sale links');
await sleep(300); await page.screenshot({ path: 'tabs_store.png' });

// L. Tabs read by their visible names; panes can take focus; Home and End keys
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(500);
const a11y = await page.evaluate(() => ({ labels: [...document.querySelectorAll('[role="tab"]')].filter((b) => b.hasAttribute('aria-label')).length,
  panes: [...document.querySelectorAll('[role="tabpanel"]')].every((p) => p.tabIndex === 0) }));
check(a11y.labels === 0 && a11y.panes, `tabs go by their visible names; panes take focus (${JSON.stringify(a11y)})`);
await page.focus('#tb-home'); await page.keyboard.press('End'); await sleep(150);
const endOk = (await page.evaluate(() => document.activeElement.id)) === 'tb-hood';
await page.keyboard.press('Home'); await sleep(150);
check(endOk && (await page.evaluate(() => document.activeElement.id)) === 'tb-home', 'End and Home keys jump to the last and first tab');

// M. A phone on its side: the address and the strip scroll with the card, so the tab has room
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(800);
const side = await page.evaluate(() => ({ headin: document.querySelector('#sheet').classList.contains('headin'), strip: !!document.querySelector('#cardBody .theadin .tabbar'),
  head: document.querySelector('#cardHead').innerHTML === '', body: Math.round(document.querySelector('#cardBody').getBoundingClientRect().height) }));
check(side.headin && side.strip && side.head && side.body > 200, `on its side: address and tabs scroll with the card (${JSON.stringify(side)})`);
await page.screenshot({ path: 'tabs_side.png' });
await page.setViewport({ width: 320, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(800);
const narrow = await page.$$eval('.tabbar [role="tab"]', (bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
check(narrow.length === 0, `every tab name fits on a 320px-wide phone (${narrow.join(', ') || 'all fit'})`);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(800);
check(!(await page.evaluate(() => document.querySelector('#sheet').classList.contains('headin'))) && !!(await page.$('#cardHead .tabbar')), 'upright again: the address and tabs stay put');

// K. ?tabs=0 turns it off again
await page.goto(ORIGIN + '/?tabs=0'); await sleep(400);
check(await page.evaluate(() => localStorage.getItem('housepoint.tabs')) === null, '?tabs=0 turns the tabs off again');

check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
