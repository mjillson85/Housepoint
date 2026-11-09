// Map search: exact lot from the parcel services, then the Census geocoder (JSONP), a town alone via TIGERweb, Geoapify when a key
// is set (Census as its backup), places outside the four states, no match, slow services, demo mode, and escaping what was typed.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8783);
const ORIGIN = 'http://localhost:8783';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/L3_TAXPAR_POLY_ASSESS_gdb/FeatureServer';
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const NJ_SVC = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0';
const FL_SVC = 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer';
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const GEOAPIFY = 'https://api.geoapify.com/v1/geocode/search';
const MA_FIELDS = ['OBJECTID', 'LOC_ID', 'POLY_TYPE', 'SITE_ADDR', 'CITY', 'FY', 'TOTAL_VAL', 'LAND_VAL', 'LS_DATE', 'LS_PRICE', 'USE_CODE', 'YEAR_BUILT', 'RES_AREA', 'UNITS'];

// A made-up Holbrook: Elm St lots north of a street line, Oak St lots south of it, around the town's center point.
const H = { lat: 42.1543, lon: -71.009 };
const kx = Math.cos(H.lat * Math.PI / 180) * 111320, ky = 110540;
const ll = (x, y) => ({ lat: H.lat + y / ky, lon: H.lon + x / kx });
const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => { const p = ll(x, y); return [p.lon, p.lat]; });
const LOTS = [];
for (let j = 0; j < 6; j++) {
  const x0 = -60 + j * 20;
  LOTS.push({ geometry: { rings: [ring(x0, 6, x0 + 20, 36)] }, attributes: { OBJECTID: 1 + j, LOC_ID: `E${10 + 2 * j}`, POLY_TYPE: 'FEE', SITE_ADDR: `${10 + 2 * j} ELM ST`, CITY: 'HOLBROOK', FY: 2026, TOTAL_VAL: 400000 + j, YEAR_BUILT: 1950 + j, RES_AREA: 1500, UNITS: 1, USE_CODE: '1010' } });
  LOTS.push({ geometry: { rings: [ring(x0, -36, x0 + 20, -6)] }, attributes: { OBJECTID: 20 + j, LOC_ID: `O${36 + 2 * j}`, POLY_TYPE: 'FEE', SITE_ADDR: `${36 + 2 * j} OAK ST`, CITY: 'HOLBROOK', FY: 2026, TOTAL_VAL: 500000 + j, YEAR_BUILT: 1960 + j, RES_AREA: 1700, UNITS: 1, USE_CODE: '1010' } });
}
const OAK40 = ll(-10, -2);          // the Census point for 40 Oak St: out on the street in front of the lot, as geocoders do
const ELM14 = ll(-10, 20);          // inside 14 Elm St

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const seen = { census: [], geo: [], tiger: [], where: [], other: [] };
const hang = { ma: false, census: false, geo: false };
let geoMode = 'ok';

async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    const script = (cb, o) => req.respond({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(o)});` });
    if (u.startsWith(ORIGIN)) return req.continue();
    const q = new URLSearchParams(u.split('?')[1] || '');
    // State parcel services
    if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: MA_FIELDS.map((name) => ({ name })) });
    if (u.startsWith(MA_SVC + '/0/query')) {
      if (q.get('where')) {
        const w = q.get('where'); seen.where.push(w);
        if (hang.ma) return;                                         // never answers
        if (/LIKE '12 ELM ST%'/.test(w)) return json({ features: LOTS.filter((f) => f.attributes.SITE_ADDR === '12 ELM ST') });
        if (/LIKE '36 OAK ST%' AND UPPER\(CITY\) LIKE 'HOLBROOK%'/.test(w)) return json({ features: LOTS.filter((f) => f.attributes.SITE_ADDR === '36 OAK ST') });
        if (/LIKE '% ELM ST'/.test(w)) return json({ features: LOTS.filter((f) => /ELM/.test(f.attributes.SITE_ADDR)) });
        return json({ features: [] });
      }
      return json({ features: LOTS });                               // the area around the map center
    }
    if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'Location', 'Town_Name', 'Assessed_Total', 'State_Use'].map((name) => ({ name })) });
    if (u.startsWith(NJ_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'PROP_LOC', 'MUN_NAME', 'PROP_CLASS', 'NET_VALUE', 'LAST_YR_TX'].map((name) => ({ name })) });
    if (u.startsWith(FL_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(FL_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'PHY_ADDR1', 'PHY_CITY', 'JV', 'DOR_UC', 'ACT_YR_BLT'].map((name) => ({ name })) });
    if (u.startsWith(CT_SVC + '/query') || u.startsWith(NJ_SVC + '/query') || u.startsWith(FL_SVC + '/0/query')) {
      if (q.get('where')) { seen.where.push(q.get('where')); return json({ features: [] }); }
      return json({ features: [] });                                 // other states' lots aren't needed: the help line is checked there
    }
    // Census geocoder (JSONP)
    if (u.startsWith(CENSUS)) {
      const a = q.get('address'), cb = q.get('callback'); seen.census.push(a);
      if (hang.census) return;
      if (q.get('format') !== 'jsonp' || q.get('benchmark') !== 'Public_AR_Current') return script(cb, { errors: ['bad request'] });
      if (/40 Oak/i.test(a) && !/Holbrok\b/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '40 OAK ST, HOLBROOK, MA, 02343', coordinates: { x: OAK40.lon, y: OAK40.lat } }] } });
      if (/14 Elm/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '14 ELM ST, HOLBROOK, MA, 02343', coordinates: { x: ELM14.lon, y: ELM14.lat } }] } });
      if (/44 Oak St, Clifton, NJ$/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '44 OAK ST, CLIFTON, NJ, 07011', coordinates: { x: -74.1576, y: 40.863 } }] } });
      if (/Broad/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '500 BROAD ST, COLUMBUS, OH, 43215', coordinates: { x: -82.99, y: 39.96 } }] } });
      return script(cb, { result: { addressMatches: [] } });
    }
    // TIGERweb
    if (u.startsWith(TIGER)) {
      seen.tiger.push(decodeURIComponent(u));
      if (u.startsWith(TIGER + '?')) return json({ layers: [{ id: 8, name: 'Census Tracts' }, { id: 22, name: 'County Subdivisions' }, { id: 28, name: 'Incorporated Places' }, { id: 30, name: 'Census Designated Places' }] });
      const m = /MapServer\/(\d+)\/query/.exec(u); const id = m && +m[1]; const w = q.get('where') || '';
      const f = [];
      if (!/STATE IN \('12','25','34','09'\)|STATE IN/.test(w)) return json({ features: [] });
      if (id === 22 && /'HOLBROOK'/.test(w)) f.push({ attributes: { BASENAME: 'Holbrook', NAME: 'Holbrook town', STATE: '25', INTPTLAT: '+' + H.lat.toFixed(7), INTPTLON: H.lon.toFixed(7) } });
      if (id === 22 && /'SPRINGFIELD'/.test(w)) {
        f.push({ attributes: { BASENAME: 'Springfield', STATE: '25', INTPTLAT: '+42.1015', INTPTLON: '-072.5898' } });
        f.push({ attributes: { BASENAME: 'Springfield', STATE: '34', INTPTLAT: '+40.6990', INTPTLON: '-074.3245' } });
      }
      if (id === 28 && /'WEST PALM BEACH'/.test(w)) f.push({ attributes: { BASENAME: 'West Palm Beach', STATE: '12' }, geometry: { rings: [[[-80.10, 26.68], [-80.04, 26.68], [-80.04, 26.74], [-80.10, 26.74], [-80.10, 26.68]]] } });
      if (id === 22 && /'CLIFTON'/.test(w)) f.push({ attributes: { BASENAME: 'Clifton', STATE: '34', INTPTLAT: '+40.8630', INTPTLON: '-074.1576' } });
      if (id === 22 && /'CLINTON'/.test(w)) f.push({ attributes: { BASENAME: 'Clinton', STATE: '25', INTPTLAT: '+42.4180', INTPTLON: '-071.6830' } });
      if (id === 22 && /'WASHINGTON'/.test(w)) f.push({ attributes: { BASENAME: 'Washington', STATE: '34', INTPTLAT: '+40.7584', INTPTLON: '-074.9790' } });
      if (id === 22 && /'EVILTOWN'/.test(w)) f.push({ attributes: { BASENAME: '<b>Evil</b>town', STATE: '25', INTPTLAT: '+' + H.lat.toFixed(7), INTPTLON: H.lon.toFixed(7) } });
      return json({ features: f });
    }
    // Geoapify
    if (u.startsWith(GEOAPIFY)) {
      seen.geo.push(u);
      if (hang.geo) return;
      if (geoMode === 'fail') return json({ statusCode: 500, error: 'Internal', message: 'down' }, 500);
      const t = q.get('text');
      if (/Holbrok/i.test(t)) return json({ results: [{ result_type: 'city', city: 'Holbrook', state_code: 'MA', lat: H.lat, lon: H.lon, formatted: 'Holbrook, MA, United States of America', rank: { confidence: 0.9 } }] });
      if (/Oka St/i.test(t)) return json({ results: [{ result_type: 'building', housenumber: '40', street: 'Oak Street', city: 'Holbrook', lat: OAK40.lat, lon: OAK40.lon, formatted: '40 Oak Street, Holbrook, MA 02343' }] });
      if (/^Oak St/i.test(t)) return json({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { result_type: 'street', street: 'Oak Street', city: 'Holbrook', formatted: 'Oak Street, Holbrook, MA' }, geometry: { type: 'Point', coordinates: [OAK40.lon, OAK40.lat] } }] });
      return json({ results: [] });
    }
    seen.other.push(u);
    return req.abort();
  });
  await page.goto(ORIGIN + url);
  return page;
}
const help = (page) => page.$eval('#mapHelpTxt', (el) => el.textContent);
async function search(page, text, wait = 15000) {
  const t0 = Date.now();
  await page.evaluate((t) => { document.querySelector('#mapHelpTxt').textContent = ''; document.querySelector('#q').value = t; document.querySelector('#search').requestSubmit(); }, text);
  let h = '';
  while (Date.now() - t0 < wait) {
    h = await help(page);
    if (h && !/^(Searching…|Loading properties…)$/.test(h)) break;
    await sleep(100);
  }
  await sleep(300);
  const st = await page.evaluate(() => {
    const S = window.__hp.S, open = document.querySelector('#sheet').classList.contains('open');
    return { center: S.map.center, R: S.map.R, selected: S.map.selectedKey, open, card: open ? window.__hp.summarize(window.__hp.S.candidates[window.__hp.S.cIdx].L.p).addr : '' };
  });
  return { help: await help(page), ms: Date.now() - t0, ...st };
}
const near = (c, p, m = 30) => c && Math.hypot((c.lat - p.lat) * 110540, (c.lon - p.lon) * kx) < m;
const reset = () => { for (const k of Object.keys(seen)) seen[k] = []; };

const page = await newPage('/');
await page.click('#goMap'); await sleep(300);

// Reading what was typed
const pq = await page.evaluate(() => ['Holbrook MA', '12 Elm Ct', 'West Palm Beach FL', 'Mount Washington', '12 Main St, Holbrook, MA 02343', 'Austin, TX', 'Elm St, Holbrook']
  .map((t) => window.__hp.parseQuery(t)));
console.log('parsed:', JSON.stringify(pq));
check(pq[0].town === 'HOLBROOK' && pq[0].state === 'MA' && !pq[0].num, '"Holbrook MA": a town and a state');
check(pq[1].num === '12' && /Elm Ct/i.test(pq[1].street) && !pq[1].state, '"12 Elm Ct": a court, not Connecticut');
check(pq[2].town === 'WEST PALM BEACH' && pq[2].state === 'FL', '"West Palm Beach FL"');
check(pq[3].town === 'Mount Washington' && !pq[3].state, '"Mount Washington" is a town, not Washington state');
check(pq[4].num === '12' && pq[4].town === 'Holbrook' && pq[4].state === 'MA', 'zip code dropped, number, town and state read');
check(pq[5].state === 'TX', '"Austin, TX" reads as Texas');
check(!pq[6].num && /Elm St/.test(pq[6].street) && pq[6].town === 'Holbrook', 'a street without a number');
check((await page.evaluate(() => window.__hp.knownTown('Holbrok'))).name === 'Holbrook', 'a misspelled Massachusetts town is corrected');
const pq2 = await page.evaluate(() => ['6 mosesso drive Holbrook', '500 Beach Dr NE', '12 Main St, Washington', '12 Main St, Delaware', 'Seattle, Washington', '12 Elm St CT', '1 Main St Apt 2', 'Route 9, Framingham', '6 Mosesso Dr Holbrook MA']
  .map((t) => window.__hp.parseQuery(t)));
check(pq2[0].num === '6' && pq2[0].street === 'MOSESSO DRIVE' && pq2[0].town === 'HOLBROOK' && pq2[0].loose, 'no comma: the word after "Drive" is read as the town');
check(!pq2[1].state && /Beach Dr NE/i.test(pq2[1].street) && !pq2[1].town, '"500 Beach Dr NE" is northeast, not Nebraska');
check(!pq2[2].state && pq2[2].town === 'Washington' && !pq2[3].state && pq2[3].town === 'Delaware', 'after a street, Washington and Delaware are towns');
check(pq2[4].state === 'WA' && pq2[4].town === 'Seattle', '"Seattle, Washington" is still the state');
check(pq2[5].state === 'CT' && /^ELM ST$/i.test(pq2[5].street), '"12 Elm St CT" is Connecticut');
check(!pq2[6].town && /Main St Apt 2/i.test(pq2[6].street), 'an apartment number isn’t a town');
check(/Route 9/.test(pq2[7].street) && pq2[7].town === 'Framingham', '"Route 9, Framingham": the town is kept');
check(pq2[8].state === 'MA' && pq2[8].town === 'HOLBROOK' && pq2[8].num === '6', 'no commas at all: number, street, town and state');

// 1. Exact lot from the parcel service
reset();
let r = await search(page, '12 Elm Street, Holbrook, MA');
console.log('lot:', JSON.stringify(r), '| where:', seen.where.join(' || '));
check(r.selected === 'E12' && r.open && /12 Elm St/i.test(r.card), 'a parcel hit selects that lot');
check(seen.where.length && seen.where.every((w) => /HOLBROOK/.test(w)) && !seen.census.length, 'typed state only: Massachusetts asked, with the town; no geocoder needed');

// 2. Parcel miss -> Census geocoder -> the lot at that point (house number nearby wins over the street it landed on)
reset();
r = await search(page, '40 Oak Street, Holbrook');
console.log('census:', JSON.stringify(r), '| census asked:', seen.census.join(' || '));
check(seen.census.length === 1 && /40 Oak Street, Holbrook, MA$/.test(seen.census[0]), 'Census asked once, with the state added');
check(r.selected === 'O40' && r.open && /40 Oak St/i.test(r.card), 'Census point selects the lot for that address');
check(r.R === 70, 'zoomed in on the house');
reset();
r = await search(page, '14 Elm Rd, Holbrook, MA');
check(r.selected === 'E14', 'a Census point inside a lot selects that lot');

// 3. Town alone -> TIGERweb -> centered, nothing selected, help line
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 26.7, lon: -80.07 }; });   // the map is in Florida, so the state order puts Florida first
r = await search(page, 'Holbrook');
console.log('town:', JSON.stringify(r), '| tiger:', seen.tiger.filter((x) => /query/.test(x)).slice(0, 1).join(''));
check(near(r.center, H) && !r.selected && !r.open, 'town: centered on it, nothing selected');
check(/^Showing Holbrook, MA\. Tap a house, or add a street address\.$/.test(r.help), 'town: help line says what to do');
check(!seen.census.length && !seen.where.length, 'town: no parcel or address lookups');
check(r.R > 150, 'town: zoomed out');
r = await search(page, 'West Palm Beach FL');
check(near(r.center, { lat: 26.71, lon: -80.07 }, 500) && /Showing West Palm Beach, FL/.test(r.help), 'Florida city from Incorporated Places (middle of its outline)');
// Same name in two states: the map's state wins, otherwise Massachusetts first
await page.evaluate(() => { window.__hp.S.map.center = { lat: 40.7, lon: -74.3 }; });
r = await search(page, 'Springfield');
check(/Springfield, NJ/.test(r.help), 'Springfield with the map in New Jersey: New Jersey');
await page.evaluate(() => { window.__hp.S.map.center = { lat: 41.7, lon: -72.6 }; });
r = await search(page, 'Springfield');
check(/Springfield, MA/.test(r.help), 'Springfield with the map in Connecticut: Massachusetts (no Connecticut Springfield)');
r = await search(page, 'Springfield, NJ');
check(/Springfield, NJ/.test(r.help), 'Springfield, NJ: the state typed wins');
// A misspelled town is fixed from the town list, but a real town with a similar name wins over the guess
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, 'Holbrok');
check(/^Showing Holbrook, MA\./.test(r.help), 'no key: "Holbrok" finds Holbrook');
r = await search(page, 'Clifton');
check(/^Showing Clifton, NJ\./.test(r.help), '"Clifton" finds Clifton, NJ, not Clinton, MA');

// 4. Street without a number (no Geoapify key): lots on that street in that town
reset();
r = await search(page, 'Elm St, Holbrook');
console.log('street:', JSON.stringify(r));
check(/^Showing Elm St, Holbrook\. Tap a house, or add a house number\.$/.test(r.help) && !r.selected && near(r.center, ll(-10, 21), 25), 'street: centered on its lots, nothing selected');

// 5. Outside the four states
reset();
r = await search(page, '100 Congress Ave, Austin, TX');
check(/^Texas is outside Housepoint’s area\. It covers Massachusetts, Connecticut, New Jersey and Florida for now\.$/.test(r.help), 'typed state outside coverage: said plainly');
check(!seen.census.length && !seen.where.length && !seen.tiger.length, 'typed state outside coverage: nothing sent anywhere');
r = await search(page, '500 Broad St, Columbus');
check(/^That place is outside Housepoint’s area/.test(r.help), 'geocoded point outside coverage: said plainly');

// 6. Nothing found
r = await search(page, 'Qwertyville');
check(/^No match\. Try “number street, town”, or just a town\.$/.test(r.help), 'nothing found: helpful no-match line');
r = await search(page, '7 Nowhere Ln');
check(/^No match/.test(r.help), 'address not found and no town: no match');

// 7. Escaping: what was typed and what a service returns show as text
r = await search(page, 'Elm St, <img src=x onerror="window.__xss=1">');
const esc1 = await page.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('#mapHelp img, #mapHelp b').length, txt: document.querySelector('#mapHelpTxt').textContent }));
console.log('escaping:', JSON.stringify(esc1));
check(!esc1.xss && !esc1.imgs && /<img src=x/.test(esc1.txt), 'typed text is shown as text, not run');
r = await search(page, 'Eviltown');
const esc2 = await page.evaluate(() => ({ b: document.querySelectorAll('#mapHelp b').length, txt: document.querySelector('#mapHelpTxt').textContent }));
check(!esc2.b && /<b>evil<\/b>town/i.test(esc2.txt), 'a service’s town name is shown as text');

// 8. Slow services: still an answer in about 10 seconds
reset(); hang.ma = true; hang.census = true;
r = await search(page, '99 Nowhere Rd, Holbrook', 20000);
console.log('slow:', JSON.stringify({ help: r.help, ms: r.ms }));
check(r.ms < 11000 && /^Couldn’t find that address, so here’s Holbrook, MA\. Tap a house\.$/.test(r.help), `parcel service and Census both hang: town shown after ${r.ms} ms`);
hang.ma = false;
r = await search(page, '99 Nowhere Rd', 20000);
check(r.ms < 11000 && /^No match/.test(r.help), `Census hangs, no town typed: no match after ${r.ms} ms`);
hang.census = false;

// 8b. The lot lookup reads the text more than one way
reset();
r = await search(page, '36 oak street holbrook');
console.log('no comma:', seen.where.slice(0, 1).join(''));
check(r.selected === 'O36' && !seen.census.length && seen.where.some((w) => /LIKE '36 OAK ST%' AND UPPER\(CITY\) LIKE 'HOLBROOK%'/.test(w) && /LIKE '36 OAK ST HOLBROOK%'/.test(w)), 'no comma: lot found, asking both ways in one request');
reset();
r = await search(page, '36 Oak St, Holbrok');
check(r.selected === 'O36' && seen.where.some((w) => /'HOLBROK%'/.test(w) && /'HOLBROOK%'/.test(w)), 'misspelled town with a house number: lot found under the corrected spelling');
reset();
r = await search(page, '12 Main St, Washington');
check(/^Couldn’t find that address, so here’s Washington, NJ\. Tap a house\.$/.test(r.help), '"12 Main St, Washington" isn’t sent off to Washington state');
reset();
r = await search(page, '500 Beach Dr NE');
check(!/outside/.test(r.help) && seen.census.length >= 1, '"500 Beach Dr NE" is searched, not called Nebraska');
// No state typed and the first guess is wrong: the town lookup supplies the state for a second Census try
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });      // the map is in Massachusetts
r = await search(page, '44 Oak St, Clifton');
console.log('census retry:', seen.census.join(' || '));
check(seen.census.length === 2 && /Clifton, MA$/.test(seen.census[0]) && /Clifton, NJ$/.test(seen.census[1]) && near(r.center, { lat: 40.863, lon: -74.1576 }, 50), 'Census tried again in the town’s own state (and “Clifton” isn’t “corrected” to Clinton)');
// A misspelled town with an address the lot lookup doesn't have: the Census is asked again with the right spelling
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, '40 Oak St, Holbrok');
console.log('census respell:', seen.census.join(' || '));
check(seen.census.length === 2 && /Holbrok, MA$/.test(seen.census[0]) && /Holbrook, MA$/.test(seen.census[1]) && r.selected === 'O40', 'misspelled town: the Census is asked again with the right spelling');

// 9. With a Geoapify key: it leads for towns and streets; for a house number the Census leads and Geoapify backs it up
await page.evaluate(() => { window.__hp.KEYS.geoapify = 'TESTKEY'; window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
reset();
r = await search(page, 'Holbrok');
console.log('geoapify:', seen.geo[0]);
check(seen.geo.length === 1 && /filter=countrycode(:|%3A)us/.test(seen.geo[0]) && /bias=proximity(:|%3A)-71\.0/.test(seen.geo[0]) && /apiKey=TESTKEY/.test(seen.geo[0]), 'Geoapify asked, limited to the US, near the map');
check(/^Showing Holbrook\. Tap a house, or add a street address\.$/.test(r.help) && near(r.center, H) && !r.selected, 'Geoapify town result: centered, nothing selected');
r = await search(page, 'Oak St, Holbrook');
check(/^Showing Oak Street, Holbrook\. Tap a house, or add a house number\./.test(r.help), 'Geoapify GeoJSON street result understood');
reset();
r = await search(page, '40 Oak St, Holbrook');
check(seen.census.length === 1 && seen.geo.length === 0 && r.selected === 'O40', 'house number: the Census answers, Geoapify isn’t needed');
reset();
r = await search(page, '40 Oka St, Holbrook');
check(seen.census.length === 1 && seen.geo.length === 1 && r.selected === 'O40', 'street typo: the Census finds nothing, Geoapify finds the house');
reset(); hang.census = true;
r = await search(page, '40 Oka St, Holbrook', 20000);
check(seen.geo.length === 1 && r.selected === 'O40' && r.ms < 11000, `Census hangs: Geoapify asked as a backup (${r.ms} ms)`);
hang.census = false;
reset(); geoMode = 'fail';
r = await search(page, 'Holbrok');
check(seen.geo.length === 1 && /^Showing Holbrook, MA\./.test(r.help), 'Geoapify fails on a town: the Census town map still finds it');
geoMode = 'ok';
await page.evaluate(() => { window.__hp.KEYS.geoapify = ''; });
check(!seen.other.some((u) => /geocod|tigerweb|geoapify/i.test(u)), 'every lookup went to the expected addresses');
check(!page.errors.length, 'no page errors ' + page.errors.join('; '));

// 10. Demo mode: no lookups at all
reset();
const demo = await newPage('/?demo=1');
await demo.click('#goMap'); await sleep(300);
r = await search(demo, 'Holbrook');
check(/^No match/.test(r.help) && !seen.census.length && !seen.tiger.length && !seen.geo.length && !seen.where.length, 'demo mode: search sends nothing');
check(!demo.errors.length, 'no page errors (demo) ' + demo.errors.join('; '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
