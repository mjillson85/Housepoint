// The basic card: anywhere in the US without state or county records in Housepoint. The state from its outline, the compass from
// the World Magnetic Model, the national building outlines (faked here with their real field names) as the lots, the card for a
// building (its use, footprint and height, the nearest address and its town from OpenStreetMap, a search for the county's own record),
// and address search that lands there instead of saying "outside".
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8787);
const ORIGIN = 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };

const ITEM = 'https://www.arcgis.com/sharing/rest/content/items/0ec8512ad21e4bb987d7e848d14e7e24';
const LAYER = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0';
const FIELDS = ['OBJECTID', 'BUILD_ID', 'OCC_CLS', 'PRIM_OCC', 'SEC_OCC', 'PROP_ADDR', 'PROP_CITY', 'PROP_ST', 'PROP_ZIP', 'PROP_CNTY', 'OUTBLDG', 'HEIGHT', 'SQMETERS',
  'SQFEET', 'H_ADJ_ELEV', 'L_ADJ_ELEV', 'FIPS', 'CENSUSCODE', 'PROD_DATE', 'SOURCE', 'USNG', 'LONGITUDE', 'LATITUDE', 'UUID', 'POP_MEDIAN', 'STATE_FIPS'];
const COLUMBIA = [33.9980, -81.0300];
// Buildings around the spot (offsets in meters): a house (no address on the outline), a house with one, a shed, apartments
const BLDGS = [[[15, -8, 30, 8], { BUILD_ID: 101, OCC_CLS: 'Residential', PRIM_OCC: 'Single Family Dwelling', PROP_CNTY: 'Richland', OUTBLDG: 'N', HEIGHT: 7.2, SQFEET: 1650 }],
  [[-35, -8, -18, 8], { BUILD_ID: 102, OCC_CLS: 'Residential', PRIM_OCC: 'Single Family Dwelling', PROP_ADDR: '1712 PICKENS ST', PROP_CITY: 'COLUMBIA', PROP_ZIP: '29201',
    PROP_CNTY: 'Richland', HEIGHT: 8.1, SQFEET: 2100 }],
  [[40, 15, 43, 18], { BUILD_ID: 103, OCC_CLS: 'Residential', PRIM_OCC: 'Single Family Dwelling', OUTBLDG: 'Y', SQFEET: 100 }],
  [[-10, 30, 25, 60], { BUILD_ID: 104, OCC_CLS: 'Residential', PRIM_OCC: 'Multi - Family Dwelling', PROP_CNTY: 'Richland', HEIGHT: 12.5, SQFEET: 11200 }]];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const seen = { layer: [], reverse: [], census: [], agol: [], cousub: [] };
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(ITEM)) return json({ title: 'USA Structures', url: LAYER });
  if (u.startsWith('https://www.arcgis.com/sharing/rest/search')) { seen.agol.push(u); return json({ results: [] }); }
  if (u.startsWith(LAYER + '?f=json')) return json({ geometryType: 'esriGeometryPolygon', maxRecordCount: 2000, fields: FIELDS.map((name) => ({ name })) });
  if (u.startsWith(LAYER + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]); seen.layer.push(q.get('outFields') || '');
    const g = (q.get('geometry') || '').split(',').map(Number);
    return json({ features: BLDGS.map(([box, a], i) => ({ geometry: { rings: [ring(...box, [g[0], g[1]])] }, attributes: { OBJECTID: i + 1, ...a } })) });
  }
  if (u.startsWith('https://api.geoapify.com/v1/geocode/reverse')) { seen.reverse.push(u); const q = new URL(u).searchParams;
    // Rhode Island: the map names the village (Wakefield), not the town (South Kingstown)
    if (+q.get('lat') > 41) return json({ results: [{ housenumber: '40', street: 'Main Street', distance: 9, lat: +q.get('lat'), lon: +q.get('lon'), city: 'Wakefield', county: 'Washington County', state_code: 'RI' }] });
    return json({ results: [{ housenumber: '1720', street: 'Pickens Street', distance: 9, lat: +q.get('lat'), lon: +q.get('lon'), city: 'Columbia', county: 'Richland County', state_code: 'SC' }] }); }
  // The Census's map: its layers, and the county subdivision (in Rhode Island, the town) at a point (as a script when asked for one)
  if (u.startsWith(TIGER) && new URL(u).searchParams.get('callback')) return req.abort();
  if (u.startsWith(TIGER + '?f=json')) return json({ layers: [{ id: 22, name: 'County Subdivisions' }, { id: 28, name: 'Incorporated Places' }, { id: 30, name: 'Census Designated Places' }] });
  if (u.startsWith(TIGER + '/22/query')) { const q = new URL(u).searchParams; seen.cousub.push(q.get('geometry'));
    const [x, y] = (q.get('geometry') || '').split(',').map(Number);
    return json({ features: y > 41.7 ? [{ attributes: { BASENAME: 'Providence', NAME: 'Providence city', STATE: '44' } }] : y > 41 ? [{ attributes: { BASENAME: 'South Kingstown', NAME: 'South Kingstown town', STATE: '44' } }] : [] }); }
  if (u.startsWith('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')) {
    const q = new URL(u).searchParams, cb = q.get('callback'); seen.census.push(q.get('address'));
    const body = /Pickens/i.test(q.get('address') || '') ? { result: { addressMatches: [{ matchedAddress: '1712 PICKENS ST, COLUMBIA, SC, 29201', coordinates: { x: COLUMBIA[1] - 0.0003, y: COLUMBIA[0] } }] } } : { result: { addressMatches: [] } };
    return req.respond({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: `${cb}(${JSON.stringify(body)})` });
  }
  return req.abort();
});
await page.goto(ORIGIN + '/');
await page.click('#goMap'); await sleep(300);

// Which region: the covered ones as before; elsewhere in the US the basic one for its state; nothing outside the US
const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { columbia: f(33.998, -81.03), philly: f(39.952, -75.18), albuquerque: f(35.09, -106.63), austin: f(30.27, -97.74), houston: f(29.76, -95.37),
    losAngeles: f(34.06, -118.3), cleveland: f(41.49, -81.69), boston: f(42.36, -71.06), charlotte: f(35.227, -80.843), toronto: f(43.65, -79.38), mexicali: f(32.62, -115.45),
    gulf: f(28.5, -90.0), keyWest: f(24.555, -81.78), valdosta: f(30.83, -83.28), orangeBeach: f(30.28, -87.6), bellevueNE: f(41.137, -95.8908), lambertvilleNJ: f(40.3657, -74.9429), newOrleans: f(29.95, -90.07), providence: f(41.82, -71.41), siouxFalls: f(43.545, -96.73), memphis: f(35.1495, -90.049) };
});
console.log('regions:', JSON.stringify(rg));
const want = { columbia: 'US_SC', philly: 'US_PA', albuquerque: 'US_NM', austin: 'US_TX', houston: 'TX_HARRIS', losAngeles: 'US_CA', cleveland: 'US_OH', boston: 'MA',
  charlotte: 'NC', toronto: null, mexicali: null, gulf: null, keyWest: 'FL', valdosta: 'US_GA', orangeBeach: 'US_AL', bellevueNE: 'NE', lambertvilleNJ: 'NJ', newOrleans: 'US_LA', providence: 'US_RI', siouxFalls: 'US_SD', memphis: 'US_TN' };
const bad = Object.entries(want).filter(([k, v]) => rg[k] !== v).map(([k, v]) => `${k}: ${rg[k]} (want ${v})`);
check(!bad.length, 'places land in their state’s basic region, covered places in theirs, other countries in none' + (bad.length ? ': ' + bad.join(', ') : ''));
// The lines themselves: towns across a river or a line from each other, the western Aleutians past 180°, Liberty Island
const edges = await page.evaluate(() => [
  ['Coventry, RI (near Connecticut)', 41.70, -71.784, 'US_RI'], ['Sterling, CT (near Rhode Island)', 41.70, -71.792, 'CT'],
  ['Bridgeport, OH (across from Wheeling)', 40.07, -80.74, 'US_OH'], ['Wheeling, WV', 40.064, -80.721, 'WV'], ['Gallipolis, OH', 38.81, -82.20, 'US_OH'],
  ['Sarnia, ON', 42.97, -82.40, null], ['Port Huron, MI', 42.97, -82.43, 'US_MI'], ['Sault Ste. Marie, ON', 46.51, -84.34, null],
  ['Sault Ste. Marie, MI', 46.495, -84.345, 'US_MI'], ['Windsor, ON', 42.30, -83.03, null], ['Fort Erie, ON', 42.90, -78.93, null], ['Buffalo, NY', 42.89, -78.88, 'NY'],
  ['Ciudad Juárez', 31.72, -106.45, null], ['El Paso, TX', 31.76, -106.49, 'US_TX'], ['Nuevo Laredo', 27.49, -99.51, null], ['Laredo, TX', 27.51, -99.50, 'US_TX'],
  ['Emerson, MB', 49.0, -97.21, null], ['Pembina, ND', 48.966, -97.24, 'US_ND'], ['St. Stephen, NB', 45.195, -67.285, null], ['Calais, ME', 45.184, -67.276, 'ME'],
  ['Edmundston, NB', 47.373, -68.325, null], ['Fort Frances, ON', 48.61, -93.40, null], ['International Falls, MN', 48.60, -93.41, 'MN'],
  ['White Rock, BC', 49.02, -122.80, null], ['Point Roberts, WA', 48.98, -123.07, 'WA'], ['Attu, AK (past 180°)', 52.85, 173.2, 'AK'], ['Adak, AK', 51.88, -176.65, 'AK'],
  ['Liberty Island (New York’s)', 40.6892, -74.0445, 'NY'], ['Jersey City', 40.718, -74.047, 'NJ'], ['Galveston, TX', 29.27, -94.83, 'US_TX'], ['Mackinac Island, MI', 45.85, -84.62, 'US_MI'],
].map(([n, la, lo, w]) => { const r = window.__hp.regionFor(la, lo); return [n, r ? r.id : null, w]; }));
const edgeBad = edges.filter(([, got, w]) => got !== w).map(([n, got, w]) => `${n}: ${got} (want ${w})`);
check(!edgeBad.length, `state and country lines: ${edges.length} places on either side land right` + (edgeBad.length ? ': ' + edgeBad.join(', ') : ''));

// Compass: the World Magnetic Model where no region has its own fit
const decl = await page.evaluate(() => [[33.998, -81.03], [39.952, -75.18], [35.09, -106.63], [30.27, -97.74], [47.6, -122.3]].map(([a, o]) => +window.__hp.declinationAt({ lat: a, lon: o }).toFixed(1)));
check([-7.8, -11.8, 7.8, 3.1, 14.9].every((w, i) => Math.abs(decl[i] - w) < 0.4), `compass correction from the World Magnetic Model: ${decl.join(', ')}`);

// The lots are the buildings (no shed, no outbuilding), and the card for each
const card = async (pickId) => page.evaluate(async (pickId) => {
  const hp = window.__hp, S = hp.S;
  await hp.centerMap(33.998, -81.03);
  const L = S.local.find((l) => l.p.records.some((r) => String(r.PROP_ID) === pickId));
  if (!L) return { err: 'no lot', lots: S.local.map((l) => l.p.records[0].PROP_ID) };
  hp.selectLot(L); await new Promise((r) => setTimeout(r, 600));
  const a = document.querySelector('#cardBody .rec-link');
  return { lots: S.local.length, ids: S.local.map((l) => l.p.records[0].PROP_ID).sort(), card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '), link: a ? a.href : null };
}, pickId);
const h1 = await card('101');
console.log('house:', JSON.stringify(h1).slice(0, 900));
check(h1.lots === 3 && JSON.stringify(h1.ids.map(String)) === '["101","102","104"]', `the buildings are the lots, without the shed and the outbuilding: ${JSON.stringify(h1.ids)}`);
check(/South Carolina/.test(h1.card) && /1720 Pickens Street/.test(h1.card) && /Columbia · House/.test(h1.card), 'house: state, the nearest address and its town from the map, “House”');
check(/PROPERTY RECORD \| Not in Housepoint yet/i.test(h1.card) && /doesn’t have South Carolina’s property records yet/.test(h1.card), 'house: says there’s no property record here yet');
check(/FOOTPRINT \| 1,650 ft²/i.test(h1.card) && /HEIGHT \| ≈ 24 ft/i.test(h1.card) && !/\bLOT\b \|/i.test(h1.card), 'house: footprint and height, not a lot size');
check(/^https:\/\/www\.google\.com\/search\?q=Richland%20County%20South%20Carolina%20property%20assessor%20parcel%20search$/.test(h1.link || ''), `house: a search for the county’s record: ${h1.link}`);
check(/Thinking of buying\?/.test(h1.card), 'house: the buyer’s box (schools, neighborhood, safety, nearby) is there');
// Save and "Thinking of buying?" use the address and town the map lookup found, not "Address not listed" (the card's first draw)
const sv = await page.evaluate(async () => {
  const hp = window.__hp, S = hp.S;
  const L = S.local.find((l) => l.p.records.some((r) => String(r.PROP_ID) === '101'));
  hp.selectLot(L); await new Promise((r) => setTimeout(r, 600));
  document.querySelector('#saveBtn').click();
  const saved = hp.loadSaved().find((x) => x.key === L.p.key);
  const bb = document.querySelector('#buyBtn'); if (bb) bb.click();
  await new Promise((r) => setTimeout(r, 400));
  return { saved, links: [...document.querySelectorAll('#buyBox .blinks a')].map((a) => a.href) };
});
check(sv.saved && sv.saved.addr === '1720 Pickens Street' && sv.saved.town === 'Columbia', `Save keeps the address and town from the map: ${JSON.stringify(sv.saved && { addr: sv.saved.addr, town: sv.saved.town })}`);
check(sv.links.length === 2 && sv.links.every((u) => /1720.Pickens.Street.*Columbia.*SC/.test(decodeURIComponent(u)) && !/Address.not.listed|Near/.test(decodeURIComponent(u))), `the listing links search the address: ${sv.links.join(' ')}`);
// Rhode Island: towns keep the records, not counties. The link goes to the town's own database, by the town the Census map puts the
// building in (South Kingstown), not the village the address lookup names (Wakefield); Providence's records are on the other site.
const ri = async (lat, lon) => page.evaluate(async (lat, lon) => {
  const hp = window.__hp, S = hp.S;
  await hp.centerMap(lat, lon);
  const L = S.local.find((l) => l.p.records.some((r) => String(r.PROP_ID) === '101'));
  if (!L) return { err: 'no lot' };
  hp.selectLot(L); await new Promise((r) => setTimeout(r, 900));
  const a = document.querySelector('#cardBody .rec-link'), b = document.querySelector('#cardBody .rec-alt');
  return { rid: (hp.regionFor(lat, lon) || {}).id, link: a && a.href, text: a && a.textContent, alt: b && b.href, card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | ') };
}, lat, lon);
const sk = await ri(41.437, -71.501);
console.log('Rhode Island:', JSON.stringify(sk).slice(0, 500));
check(sk.rid === 'US_RI' && sk.link === 'https://gis.vgsi.com/SouthKingstownRI/' && /^South Kingstown’s assessor database ›$/.test(sk.text), `Rhode Island: the town's own database, by the Census town (not the village): ${sk.link} "${sk.text}"`);
check(/google\.com\/search\?q=South%20Kingstown%20RI%20assessor/.test(sk.alt || ''), `Rhode Island: a web search for the town's records beside it: ${sk.alt}`);
check(/the town’s assessor has the record/.test(sk.card) && !/county’s assessor/.test(sk.card), 'Rhode Island: the card says the town keeps the record, not the county');
const pv = await ri(41.824, -71.412);
check(pv.link === 'https://data.nereval.com/SearchInfo.aspx?town=Providence' && /^Providence’s assessor database ›$/.test(pv.text), `Rhode Island: Providence's records on Northeast Revaluation's site: ${pv.link}`);
const town = await page.evaluate(() => [['Burrillville', 'Central Falls', 'West Warwick', 'Cranston', 'New Shoreham', 'Little Compton'].map((t) => window.__hp.riAssessorUrl(t)), window.__hp.riAssessorUrl('Springfield')]);
check(town[0].every(Boolean) && /town=Central\+Falls$/.test(town[0][1]) && town[0][3] === 'https://gis.vgsi.com/CranstonRI' && town[1] === null, `Rhode Island: every town has its site, none for a town that isn't one: ${JSON.stringify(town)}`);
// Tennessee and Kansas: the state's own property search for the counties on it, the county's web search for the big ones that aren't
const sites = await page.evaluate(() => { const f = (st, c) => (window.__hp.recordSiteFor(st, c) || {}).url || null;
  return [f('TN', 'Sumner County'), f('TN', 'Knox'), f('TN', 'Shelby County'), f('TN', null), f('KS', 'Riley'), f('KS', 'Johnson County'), f('SC', 'Richland'),
    f('TN', 'SHELBY'), f('KS', 'JOHNSON COUNTY'), f('TN', 'SUMNER')]; });   // the outlines may send county names in capitals
check(JSON.stringify(sites) === JSON.stringify(['https://assessment.cot.tn.gov/TPAD', null, null, null, 'https://orkahub.kansasgis.org/', null, null, null, null, 'https://assessment.cot.tn.gov/TPAD']),
  `Tennessee's and Kansas's statewide searches only for counties on them (and only once the county is known): ${JSON.stringify(sites)}`);
// Saved before the address arrived, then un-saved and saved again after: the second save has the address
const resave = await page.evaluate(async () => {
  const hp = window.__hp, S = hp.S;
  const L = S.local.find((l) => l.p.records.some((r) => String(r.PROP_ID) === '101'));     // its address comes from the lookup
  hp.selectLot(L); await new Promise((r) => setTimeout(r, 300));
  if (hp.loadSaved().some((x) => x.key === L.p.key)) document.querySelector('#saveBtn').click();   // saved above: start unsaved
  L.p.posAddr = undefined; L.p.posAddrP = undefined; L.p.posPlace = undefined;
  hp.selectLot(L);
  document.querySelector('#saveBtn').click();                                   // before the address lookup answers
  const first = (hp.loadSaved().find((x) => x.key === L.p.key) || {}).addr;
  await new Promise((r) => setTimeout(r, 800));
  document.querySelector('#saveBtn').click(); document.querySelector('#saveBtn').click();   // un-save, save again
  return { first, again: (hp.loadSaved().find((x) => x.key === L.p.key) || {}).addr };
});
check(resave.first === 'Address not listed' && /^\d+ \S/.test(resave.again || ''), `saving again after the address arrives keeps the address: ${JSON.stringify(resave)}`);
const h2 = await card('102');
check(/1712 Pickens St \|/.test(h2.card) && /Columbia · House/.test(h2.card) && !/nearest one on OpenStreetMap/.test(h2.card), `an outline with its own address uses it: ${h2.card.slice(0, 200)}`);
const ap = await card('104');
check(/Multi-family building/.test(ap.card) && /FOOTPRINT \| 11,200 ft²/i.test(ap.card), 'apartments: “Multi-family building”, its footprint');
check(seen.layer.length && seen.layer.every((f) => f === 'BUILD_ID,OCC_CLS,PRIM_OCC,PROP_ADDR,PROP_CITY,PROP_ZIP,PROP_CNTY,OUTBLDG,HEIGHT,SQFEET'), `the outlines are asked for building facts only: ${seen.layer[0]}`);

// Search: a basic state isn't "outside"; the address lands on its building
const sr = await page.evaluate(async () => { const x = await window.__hp.searchAddress('1712 Pickens St, Columbia, SC'); if (x && x.lot && x.lot.then) x.lot = await x.lot.catch(() => null); return x; });
console.log('search:', JSON.stringify(sr).slice(0, 300));
check(sr && sr.kind === 'address' && Math.abs(sr.lat - 33.998) < 0.001, 'search: a South Carolina address is found (not “outside”)');
check(seen.census.some((a) => /Pickens St, Columbia, SC/.test(a)), 'search: asked the Census geocoder');
check(!seen.agol.length, 'search: no parcel service is looked for in a basic state');
const out = await page.evaluate(async () => window.__hp.searchAddress('10 Main St, Toronto, ON'));
check(!out || out.kind !== 'lot', 'search: a place outside the US doesn’t land on a lot');
check(!errors.length, 'no page errors: ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(fails.length ? `\n${fails.length} failed` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
