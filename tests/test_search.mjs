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

const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer';
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
// Mosesso Dr, east of the rest: the Census puts its points out at (20, 0), which is about 145 m from number 6 and 320 m from
// number 8, as it can on a long street.
LOTS.push({ geometry: { rings: [ring(140, 50, 160, 80)] }, attributes: { OBJECTID: 40, LOC_ID: 'M6', POLY_TYPE: 'FEE', SITE_ADDR: '6 MOSESSO DR', CITY: 'HOLBROOK', FY: 2026, TOTAL_VAL: 600000, YEAR_BUILT: 1990, RES_AREA: 2000, UNITS: 1, USE_CODE: '1010' } });
LOTS.push({ geometry: { rings: [ring(330, -10, 350, 20)] }, attributes: { OBJECTID: 41, LOC_ID: 'M8', POLY_TYPE: 'FEE', SITE_ADDR: '8 MOSESSO DR', CITY: 'HOLBROOK', FY: 2026, TOTAL_VAL: 610000, YEAR_BUILT: 1991, RES_AREA: 2000, UNITS: 1, USE_CODE: '1010' } });
const MOS = ll(20, 0);
const OAK40 = ll(-10, -2);          // the Census point for 40 Oak St: out on the street in front of the lot, as geocoders do
const ELM14 = ll(-10, 20);          // inside 14 Elm St

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const seen = { census: [], geo: [], tiger: [], where: [], near: [], other: [] };
// ma: the Massachusetts service never answers a search. maAddr: it never answers one by address alone (the real one doesn't
// index addresses), but a search in a circle around a point is fine.
const hang = { ma: false, maAddr: false, census: false, geo: false };
const NJ_LOT = (addr, town, lat, lon) => ({ attributes: { OBJECTID: 900, PROP_LOC: addr, MUN_NAME: town, PROP_CLASS: '2', NET_VALUE: 300000 },
  geometry: { rings: [[[lon - 0.0001, lat - 0.0001], [lon + 0.0001, lat - 0.0001], [lon + 0.0001, lat + 0.0001], [lon - 0.0001, lat + 0.0001], [lon - 0.0001, lat - 0.0001]]] } });
const MA_LOT = (addr, town, lat, lon) => ({ attributes: { OBJECTID: 901, LOC_ID: 'CLINTON12', POLY_TYPE: 'FEE', SITE_ADDR: addr, CITY: town, FY: 2026, TOTAL_VAL: 1 },
  geometry: { rings: [[[lon - 0.0001, lat - 0.0001], [lon + 0.0001, lat - 0.0001], [lon + 0.0001, lat + 0.0001], [lon - 0.0001, lat + 0.0001], [lon - 0.0001, lat - 0.0001]]] } });
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
      if (q.get('where') && q.get('geometry')) {                     // an address in a circle around a point
        const w = q.get('where'); seen.near.push({ w, g: q.get('geometry'), d: q.get('distance'), units: q.get('units') });
        if (hang.ma) return;
        if (/LIKE '8 MOSESSO DR%'/.test(w)) return json({ features: LOTS.filter((f) => f.attributes.SITE_ADDR === '8 MOSESSO DR') });
        return json({ features: [] });
      }
      if (q.get('where')) {
        const w = q.get('where'); seen.where.push(w);
        if (hang.ma || hang.maAddr) return;                          // never answers
        if (/LIKE '12 ELM ST%'/.test(w)) return json({ features: LOTS.filter((f) => f.attributes.SITE_ADDR === '12 ELM ST') });
        if (/LIKE '36 OAK ST%' AND UPPER\(CITY\) LIKE 'HOLBROOK%'/.test(w)) return json({ features: LOTS.filter((f) => f.attributes.SITE_ADDR === '36 OAK ST') });
        if (/LIKE '12 MAIN ST%' AND UPPER\(CITY\) LIKE 'CLINTON%'/.test(w)) return json({ features: [MA_LOT('12 MAIN ST', 'CLINTON', 42.418, -71.683)] });   // the typo guess's lot
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
      if (q.get('where')) {
        const w = q.get('where'); seen.where.push(w);
        if (u.startsWith(NJ_SVC) && /LIKE '12 MAIN ST%' AND UPPER\(MUN_NAME\) LIKE 'CLIFTON%'/.test(w)) return json({ features: [NJ_LOT('12 MAIN ST', 'CLIFTON', 40.8630, -74.1576)] });
        return json({ features: [] });
      }
      return json({ features: [] });                                 // other states' lots aren't needed: the help line is checked there
    }
    // Census geocoder (JSONP)
    if (u.startsWith(CENSUS)) {
      const a = q.get('address'), cb = q.get('callback'); seen.census.push(a);
      if (hang.census === 'late') return setTimeout(() => script(cb, { result: { addressMatches: [] } }).catch(() => {}), 6800);   // after the app gave up
      if (hang.census) return;
      if (q.get('format') !== 'jsonp' || q.get('benchmark') !== 'Public_AR_Current') return script(cb, { errors: ['bad request'] });
      if (/40 Oak/i.test(a) && !/Holbrok\b/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '40 OAK ST, HOLBROOK, MA, 02343', coordinates: { x: OAK40.lon, y: OAK40.lat } }] } });
      if (/^[68] Mosesso Dr/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: `${a[0]} MOSESSO DR, HOLBROOK, MA, 02343`, coordinates: { x: MOS.lon, y: MOS.lat } }] } });
      if (/14 Elm/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '14 ELM ST, HOLBROOK, MA, 02343', coordinates: { x: ELM14.lon, y: ELM14.lat } }] } });
      if (/100 Warren St, Roxbury, MA$/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '100 WARREN ST, ROXBURY, MA, 02119', coordinates: { x: -71.0832, y: 42.3266 } }] } });
      if (/12 Oak St/i.test(a)) return script(cb, { result: { addressMatches: [{ matchedAddress: '12 OAK ST, HOLBROOK, MA, 02343', coordinates: { x: ll(-30, 3).lon, y: ll(-30, 3).lat } }] } });   // in front of 12 ELM ST
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
      if (id === 22 && /'WASHINGTON'/.test(w)) {      // New Jersey has several
        f.push({ attributes: { BASENAME: 'Washington', STATE: '34', INTPTLAT: '+40.7584', INTPTLON: '-074.9790' } });
        f.push({ attributes: { BASENAME: 'Washington', STATE: '34', INTPTLAT: '+39.7500', INTPTLON: '-075.0700' } });
      }
      if (id === 22 && /'BRAINTREE TOWN'/.test(w)) f.push({ attributes: { BASENAME: 'Braintree Town', STATE: '25', INTPTLAT: '+42.2049', INTPTLON: '-071.0050' } });   // how the Census names it
      if (id === 28 && /'PORT ST\. LUCIE'/.test(w)) f.push({ attributes: { BASENAME: 'Port St. Lucie', STATE: '12', INTPTLAT: '+27.2810', INTPTLON: '-080.3830' } });
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
      if (/99 Oak St/i.test(t)) return json({ results: [{ result_type: 'street', street: 'Oak Street', city: 'Holbrook', lat: OAK40.lat, lon: OAK40.lon, formatted: 'Oak Street, Holbrook, MA', rank: { confidence: 0.6 } }] });
      if (/Oka St/i.test(t)) return json({ results: [{ result_type: 'building', housenumber: '40', street: 'Oak Street', city: 'Holbrook', lat: OAK40.lat, lon: OAK40.lon, formatted: '40 Oak Street, Holbrook, MA 02343' }] });
      if (/^Oak St/i.test(t)) return json({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { result_type: 'street', street: 'Oak Street', city: 'Holbrook', formatted: 'Oak Street, Holbrook, MA' }, geometry: { type: 'Point', coordinates: [OAK40.lon, OAK40.lat] } }] });
      return json({ results: [] });
    }
    seen.other.push(u);
    return req.abort();
  });
  await page.goto(ORIGIN + url);
  await page.evaluate(() => { window.__hp.KEYS.geoapify = ''; });   // without a key first; the Geoapify part sets one
  return page;
}
const help = (page) => page.$eval('#mapHelpTxt', (el) => el.textContent);
async function search(page, text, wait = 15000) {
  const t0 = Date.now();
  await page.evaluate((t) => { document.querySelector('#mapHelpTxt').textContent = ''; document.querySelector('#q').value = t; document.querySelector('#search').requestSubmit(); }, text);
  let h = '';
  while (Date.now() - t0 < wait) {
    h = await help(page);
    if (h && !/^(Searching…|Loading properties…|Finding .*…)$/.test(h)) break;
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
check(!pq2[6].town && /^Main St$/i.test(pq2[6].street), 'an apartment number isn’t a town (and isn’t needed to find the lot)');
check(/Route 9/.test(pq2[7].street) && pq2[7].town === 'Framingham', '"Route 9, Framingham": the town is kept');
check(pq2[8].state === 'MA' && pq2[8].town === 'HOLBROOK' && pq2[8].num === '6', 'no commas at all: number, street, town and state');
const pq3 = await page.evaluate(() => ['25 Main St Hartford CT', '100 Main St Omaha NE', '12 Main St West Hartford', '12 Elm St, Apt 2, Holbrook, MA', '12 Elm St Holbrook MA 02343',
  '500 Beach Dr NE St Petersburg', '12-14 Elm St, Quincy', '100 N Ocean Blvd, Palm Beach, FL', '12 Circle Ct'].map((t) => window.__hp.parseQuery(t)));
check(pq3[0].state === 'CT' && pq3[0].town === 'HARTFORD' && pq3[1].state === 'NE', '"…Hartford CT" is Connecticut and "…Omaha NE" Nebraska, after a street and a town');
check(pq3[2].readings[0].town === 'WEST HARTFORD' && pq3[2].readings.some((r) => r.street === 'MAIN ST WEST' && r.town === 'HARTFORD'), '"Main St West Hartford": West Hartford first, Main St West in Hartford also tried');
check(pq3[3].town === 'Holbrook' && pq3[3].state === 'MA' && /^Elm St$/.test(pq3[3].street), 'an "Apt 2" part is skipped, not taken as the town');
check(pq3[4].state === 'MA' && pq3[4].town === 'HOLBROOK', 'a zip code without a comma is dropped');
check(pq3[5].readings[0].town === 'ST PETERSBURG', '"Beach Dr NE St Petersburg": St is Saint here');
check(pq3[6].num === '12' && pq3[6].numFull === '12-14', '"12-14 Elm St": both numbers kept');
check(pq3[7].state === 'FL' && pq3[7].town === 'Palm Beach', '"…, FL" is Florida, not a floor number');
check(!pq3[8].state && /CIRCLE CT/.test(pq3[8].street), '"12 Circle Ct" is a court');

// 1. Exact lot from the parcel service
reset();
let r = await search(page, '12 Elm Street, Holbrook, MA');
console.log('lot:', JSON.stringify(r), '| where:', seen.where.join(' || '));
check(r.selected === 'E12' && r.open && /12 Elm St/i.test(r.card), 'a parcel hit selects that lot');
check(seen.where.length && seen.where.every((w) => /HOLBROOK/.test(w)), 'typed state only: Massachusetts asked, with the town');

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
check(await page.evaluate(() => !!window.__hp.SVC.MA.addrSlow), 'a state that ran out of time is marked as slow to search by address');
hang.ma = false;
r = await search(page, '99 Nowhere Rd', 20000);
check(r.ms < 11000 && /^No match/.test(r.help), `Census hangs, no town typed: no match after ${r.ms} ms`);
hang.census = false;
const unslow = () => page.evaluate(() => { for (const v of Object.values(window.__hp.SVC)) delete v.addrSlow; });
await unslow();

// 8b. The lot lookup reads the text more than one way
reset();
r = await search(page, '36 oak street holbrook');
console.log('no comma:', seen.where.slice(0, 1).join(''));
check(r.selected === 'O36' && seen.where.some((w) => /LIKE '36 OAK ST%' AND UPPER\(CITY\) LIKE 'HOLBROOK%'/.test(w) && /LIKE '36 OAK STREET HOLBROOK%'/.test(w)), 'no comma: lot found, asking both ways in one request');
reset();
r = await search(page, '36 Oak St, Holbrok');
check(r.selected === 'O36' && seen.where.some((w) => /'HOLBROK%'/.test(w) && !/'HOLBROOK%'/.test(w)) && seen.where.some((w) => /'HOLBROOK%'/.test(w) && !/'HOLBROK%'/.test(w)),
  'misspelled town with a house number: asked as typed, and separately with the corrected spelling, which finds the lot');
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

// 8c. More review fixes
reset();
r = await search(page, '12 Court Street, Holbrook');
check(seen.where.some((w) => /LIKE '12 COURT ST%'/.test(w)) && !seen.where.some((w) => /CT ST/.test(w)), 'only the street type is shortened: COURT ST, not CT ST');
reset();
r = await search(page, "12 O'Brien Way, Holbrook");
check(seen.where.some((w) => /'12 O BRIEN WAY%'/.test(w) && /'12 OBRIEN WAY%'/.test(w) && /'12 O''BRIEN WAY%'/.test(w)), 'an apostrophe is tried three ways (O BRIEN, OBRIEN, O’BRIEN), quoted safely');
reset();
r = await search(page, '12-14 Elm St, Holbrook');
check(seen.where.some((w) => /'12 ELM ST%'/.test(w) && /'12-14 ELM ST%'/.test(w)), 'a hyphenated number is tried both ways');
// The typed town beats a corrected guess: "Clifton" isn't Clinton, MA
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, '12 Main St, Clifton');
check(near(r.center, { lat: 40.863, lon: -74.1576 }, 100), `the town as typed wins: 12 Main St in Clifton, NJ, not Clinton, MA (${JSON.stringify(r.center)})`);
// Roxbury is a Connecticut town and a Boston neighborhood: with the map in Boston, the Census is asked for both, Boston wins
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.33, lon: -71.08 }; });
r = await search(page, '100 Warren St, Roxbury');
console.log('roxbury:', seen.census.join(' || '));
check(seen.census.some((a) => /Roxbury, CT$/.test(a)) && seen.census.some((a) => /Roxbury, MA$/.test(a)) && near(r.center, { lat: 42.3266, lon: -71.0832 }, 50), 'the map’s state is asked too: Roxbury, Boston is found');
// A geocoded point by the wrong house: nothing is picked rather than a neighbor
reset();
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, '12 Oak St, Holbrook');
console.log('no such lot:', r.help);
check(!r.selected && !r.open && /^Here’s 12 Oak St, Holbrook\. Tap the house to see its story\.$/.test(r.help), 'no lot with that number on that street: nothing picked, “tap the house”');
// Town names the way the Census writes them
reset();
r = await search(page, 'Washington Twp, NJ');
check(/^Showing Washington, NJ\./.test(r.help), '"Washington Twp" finds Washington township');
await page.evaluate(() => { window.__hp.S.map.center = { lat: 39.76, lon: -75.06 }; });
r = await search(page, 'Washington, NJ');
check(near(r.center, { lat: 39.75, lon: -75.07 }, 500), 'several Washingtons in New Jersey: the nearest one');
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, 'Braintree');
check(/^Showing Braintree, MA\./.test(r.help) && near(r.center, { lat: 42.2049, lon: -71.005 }, 100), '"Braintree" finds the Census’s "Braintree Town", shown as Braintree');
r = await search(page, 'Port St Lucie FL');
check(/^Showing Port St\. Lucie, FL\./.test(r.help), '"Port St Lucie" finds Port St. Lucie');
// A Census answer that arrives after the app gave up doesn't cause an error
reset(); hang.census = 'late';
r = await search(page, '77 Elm St, Nowhere', 20000);
await sleep(2500);
check(!page.errors.length, 'a late answer after giving up causes no error ' + page.errors.join('; '));
hang.census = false;

// 8d. A state that can't search by address in time (Massachusetts and Florida don't index addresses): the Census answers
//     meanwhile, and the house is found around its point, even a few hundred meters off
reset(); hang.maAddr = true;
await page.evaluate(() => { window.__hp.S.map.center = { lat: 42.15, lon: -71.0 }; });
r = await search(page, '6 Mosesso Drive, Holbrook');
console.log('mosesso 6:', JSON.stringify({ sel: r.selected, ms: r.ms, help: r.help }), '| census:', seen.census.join(' || '));
check(r.selected === 'M6' && r.open && /6 Mosesso Dr/i.test(r.card) && r.ms < 4000, `the state is still searching: the Census point finds the house 145 m away (${r.ms} ms)`);
await sleep(4500);
check(await page.evaluate(() => !!window.__hp.SVC.MA.addrSlow), 'then the state runs out of time and is marked as slow');
reset();
r = await search(page, '8 Mosesso Dr, Holbrook', 20000);
console.log('mosesso 8:', JSON.stringify({ sel: r.selected, ms: r.ms, help: r.help }), '| near:', JSON.stringify(seen.near));
check(!seen.where.some((w) => /SITE_ADDR\) LIKE '8 MOSESSO/.test(w)) && seen.where.some((w) => /MOSESSO/.test(w)), 'a state marked slow isn’t asked by address again (the others still are)');
const nq = seen.near[0] || { g: '0,0' }, [nlon, nlat] = nq.g.split(',').map(Number);
check(seen.near.length === 1 && nq.d === '400' && nq.units === 'esriSRUnit_Meter' && near({ lat: nlat, lon: nlon }, MOS, 5) && /'8 MOSESSO DR%'/.test(nq.w) && !/CITY/.test(nq.w),
  'the house isn’t among the lots around the point: the state is asked for it within 400 m of the point, any town');
check(r.selected === 'M8' && r.open && /8 Mosesso Dr/i.test(r.card), 'and that finds the house 320 m away');
reset();
r = await search(page, '12 Oak St, Holbrook');
check(!r.selected && seen.near.length === 1 && /^Here’s 12 Oak St, Holbrook\. Tap the house to see its story\.$/.test(r.help), 'nothing there either: “tap the house”, as before');
hang.maAddr = false; await unslow();

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
reset();
r = await search(page, '99 Oak St, Holbrook');
check(/^Couldn’t find that address, so here’s Oak Street, Holbrook\. Tap a house\.$/.test(r.help) && !r.selected, 'Geoapify finds only the street for a house number: it says so');
reset(); geoMode = 'fail';
r = await search(page, 'Holbrok');
check(seen.geo.length === 1 && /^Showing Holbrook, MA\./.test(r.help), 'Geoapify fails on a town: the Census town map still finds it');
geoMode = 'ok';
await page.evaluate(() => { window.__hp.KEYS.geoapify = ''; });
check(!seen.other.some((u) => /geocod|tigerweb|geoapify/i.test(u)), 'every lookup went to the expected addresses');
check(!page.errors.length, 'no page errors ' + page.errors.join('; '));

// 9b. A GPS fix while on the map doesn't swap the map's lots for the ones around the phone
{
  const gp = await newPage('/');
  await gp.setGeolocation({ latitude: 42.24, longitude: -71.17, accuracy: 8 });
  await gp.click('#goPoint'); await sleep(5500);            // no compass here: the app switches to the map by itself
  const m0 = await gp.evaluate(() => window.__hp.S.mode);
  reset();
  r = await search(gp, '12 Elm Street, Holbrook, MA');
  await gp.setGeolocation({ latitude: 42.2402, longitude: -71.1702, accuracy: 8 }); await sleep(1500);
  const c = await gp.evaluate(() => ({ data: window.__hp.S.center, map: window.__hp.S.map.center }));
  check(m0 === 'map' && near(c.map, H, 100) && near(c.data, H, 400), `on the map, a new GPS fix leaves the searched place’s lots alone (${JSON.stringify(c)})`);
  // A slow search doesn't yank the map back after you've gone somewhere else
  await gp.evaluate(() => { if (document.querySelector('#sheet').classList.contains('open')) document.querySelector('.grab').click(); }); await sleep(400);
  reset(); hang.ma = true; hang.census = true;          // both slow: the Census no longer waits for the state
  await gp.evaluate(() => { document.querySelector('#q').value = '40 Oak St, Holbrook'; document.querySelector('#search').requestSubmit(); });
  await sleep(400);
  await gp.evaluate(() => window.__hp.centerMap(41.95, -71.3));   // what a sample spot or "Near me" does
  await sleep(7500);
  const m = await gp.evaluate(() => ({ c: window.__hp.S.map.center, open: document.querySelector('#sheet').classList.contains('open') }));
  check(near(m.c, { lat: 41.95, lon: -71.3 }, 50) && !m.open, `a slow search doesn’t move the map after you went elsewhere (${JSON.stringify(m.c)})`);
  hang.ma = false; hang.census = false;
  check(!gp.errors.length, 'no page errors (GPS on the map) ' + gp.errors.join('; '));
  await gp.close();
}

// 9c. A shared house link opens that house on the map
{
  const sp = await newPage('/');
  await sp.click('#goMap'); await sleep(300);
  r = await search(sp, '12 Elm Street, Holbrook, MA');
  const info = await sp.evaluate(() => { const c = window.__hp.S.candidates[window.__hp.S.cIdx]; return { link: window.__hp.houseLink(c), text: window.__hp.shareText(c) }; });
  console.log('share link:', info.link);
  check(r.open && /\?h=42\.\d{6},-71\.\d{6}&k=E12$/.test(info.link) && info.text.endsWith('\n' + info.link), 'sharing a card includes a link to the house');
  const u = new URL(info.link);
  const open = async (q) => {
    const lp = await newPage('/' + q); await sleep(2500);
    const st = await lp.evaluate(() => ({ mode: window.__hp.S.mode, start: !document.querySelector('#start').classList.contains('hidden'),
      open: document.querySelector('#sheet').classList.contains('open'), card: document.querySelector('#sheet').classList.contains('open') ? window.__hp.summarize(window.__hp.S.candidates[window.__hp.S.cIdx].L.p).addr : '' }));
    st.errors = lp.errors; await lp.close(); return st;
  };
  let st = await open(u.search);
  check(st.mode === 'map' && !st.start && st.open && /^12 Elm St$/i.test(st.card), 'opening the link: straight to that house’s card on the map ' + JSON.stringify(st));
  st = await open(u.search.replace(/&k=.*$/, '&k=REDRAWN'));
  check(st.open && /^12 Elm St$/i.test(st.card), 'a link whose record key changed still opens the house by its location');
  st = await open('?h=47.606200,-122.332100');
  check(st.start && st.mode !== 'map', 'a link outside the covered states: the start screen, as usual');
  st = await open('?h=12,abc&k=x');
  check(st.start && !st.errors.length, 'a mangled link: the start screen, no errors');
  await sp.close();
}

// 10. Demo mode: no lookups at all
reset();
const demo = await newPage('/?demo=1');
await demo.click('#goMap'); await sleep(300);
r = await search(demo, 'Holbrook');
check(/^No match/.test(r.help) && !seen.census.length && !seen.tiger.length && !seen.geo.length && !seen.where.length, 'demo mode: search sends nothing');
check(!demo.errors.length, 'no page errors (demo) ' + demo.errors.join('; '));

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
