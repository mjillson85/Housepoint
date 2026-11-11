// New York: short records (chosen fields only) from the state's public tax parcels at houses, condos and New York City lots,
// what New York City's property classes are ("01", "02"…), how condo units and stacked duplicates (DUP_GEO) look, and how
// quick a lot query and an address search are. Never asks for owner or mailing fields.
//   cd tests && node probe/ny-records.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8794);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8794/');

const L = 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1';
const F = 'COUNTY_NAME,MUNI_NAME,SWIS,PARCEL_ADDR,PRINT_KEY,LOC_ST_NBR,LOC_STREET,LOC_UNIT,LOC_ZIP,PROP_CLASS,ROLL_SECTION,LAND_AV,TOTAL_AV,FULL_MARKET_VAL,YR_BLT,SQ_FT,ACRES,'
  + 'BLDG_STYLE_DESC,SQFT_LIVING,GFA,NBR_BEDROOMS,NBR_FULL_BATHS,USED_AS_DESC,ROLL_YR,DUP_GEO,CITYTOWN_NAME,SCHOOL_NAME';
const SPOTS = [[40.6720, -73.9780, 'Brooklyn Park Slope', 80], [40.7870, -73.9750, 'Manhattan Upper West Side', 60], [40.7640, -73.9230, 'Queens Astoria', 80],
  [40.6400, -74.0760, 'Staten Island St George', 100], [40.8370, -73.8650, 'Bronx', 80], [40.7080, -74.0120, 'Manhattan downtown condos', 60],
  [41.0310, -73.7650, 'White Plains condo towers', 120], [42.9180, -78.8770, 'Buffalo Elmwood', 100], [43.0400, -76.1350, 'Syracuse', 100], [42.6620, -73.7700, 'Albany Center Square', 80],
  [41.1220, -73.7950, 'Westchester condos', 150], [40.8680, -73.4260, 'Suffolk (Huntington)', 120]];

const out = await page.evaluate(async (L, F, SPOTS) => {
  const get = async (u, ms = 30000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); return { j: await r.json(), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const stat = async (where, groupBy) => {
    const q = new URLSearchParams({ where, f: 'json', returnGeometry: 'false', groupByFieldsForStatistics: groupBy.join(','),
      outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]) });
    const r = await get(L + '/query?' + q.toString(), 60000);
    return r.j && r.j.features ? r.j.features.map((f) => f.attributes).sort((a, b) => b.n - a.n).slice(0, 60) : (r.err || JSON.stringify(r.j && r.j.error));
  };
  const res = { groups: {}, spots: [], search: [] };
  res.groups.nycClass = await stat("COUNTY_NAME IN ('Kings','Queens','NewYork','Bronx','Richmond')", ['COUNTY_NAME', 'PROP_CLASS']);
  res.groups.nycUsed = await stat("COUNTY_NAME IN ('Kings','NewYork')", ['PROP_CLASS', 'USED_AS_DESC', 'BLDG_STYLE_DESC']);
  res.groups.dup = await stat("DUP_GEO='Y'", ['COUNTY_NAME', 'PROP_CLASS']);
  res.groups.unit = await stat("LOC_UNIT IS NOT NULL AND LOC_UNIT <> ''", ['COUNTY_NAME', 'PROP_CLASS']);
  res.groups.section = await stat('1=1', ['ROLL_SECTION', 'PROP_CLASS']);
  for (const [lat, lon, name, m] of SPOTS) {
    const p = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: String(m),
      units: 'esriSRUnit_Meter', outSR: '4326', returnGeometry: 'true', geometryPrecision: '6', f: 'json', outFields: F });
    const r = await get(L + '/query?' + p.toString());
    const feats = (r.j && r.j.features) || [];
    const shapes = new Map(); for (const f of feats) { const k = JSON.stringify(f.geometry && f.geometry.rings && f.geometry.rings[0] && f.geometry.rings[0].slice(0, 3)); shapes.set(k, (shapes.get(k) || 0) + 1); }
    res.spots.push({ name, ms: r.ms, n: feats.length, err: r.err || (r.j && r.j.error && JSON.stringify(r.j.error)), stacked: [...shapes.values()].filter((n) => n > 1).join(','),
      recs: feats.slice(0, 30).map((f) => f.attributes) });
  }
  for (const [where, label] of [["UPPER(PARCEL_ADDR) LIKE '51 TOMPKINS RD%'", 'Scarsdale'], ["UPPER(PARCEL_ADDR) LIKE '337 ONONDAGA ST%'", 'Syracuse'],
    ["UPPER(PARCEL_ADDR) LIKE '100 HALE AVE%' AND UPPER(MUNI_NAME) LIKE 'WHITE PLAINS%'", 'White Plains with town']]) {
    const p = new URLSearchParams({ where, outFields: 'PARCEL_ADDR,MUNI_NAME,COUNTY_NAME', returnGeometry: 'false', f: 'json', resultRecordCount: '10' });
    const r = await get(L + '/query?' + p.toString(), 20000);
    res.search.push(`${label} | ${r.ms} ms | ${r.j && r.j.features ? r.j.features.length + ' ' + JSON.stringify(r.j.features.slice(0, 2).map((f) => f.attributes)) : (r.err || JSON.stringify(r.j && r.j.error)).slice(0, 150)}`);
  }
  return res;
}, L, F, SPOTS);
const short = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '' && v !== 0).map(([k, v]) => `${k}=${String(v).slice(0, 36)}`).join(' | ');
console.log('#### NY records');
for (const [k, v] of Object.entries(out.groups)) { console.log(`== ${k}`); for (const r of [].concat(v)) console.log('   ' + (typeof r === 'string' ? r : short(r))); }
for (const s of out.spots) { console.log(`-- ${s.name}: ${s.n} records in ${s.ms} ms${s.err ? ' ' + s.err : ''}; stacked outlines ${s.stacked || 'none'}`); for (const r of s.recs) console.log('   ' + short(r)); }
console.log('== address searches'); for (const s of out.search) console.log('   ' + s);
await browser.close(); srv.close();
