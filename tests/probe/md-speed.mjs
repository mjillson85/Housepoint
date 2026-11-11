// Maryland: the state's parcel layer (polygons joined to the assessments) took 1.4 to 6.8 seconds per lot query. This times
// the same 150 m question several ways (fewer fields, no outlines, the FeatureServer copy, ArcGIS Online copies found by
// search) and an address search, to pick the quickest source with the same records. Never asks for owner fields.
//   cd tests && node probe/md-speed.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8797);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8797/');

const SPOTS = [[38.9950, -77.0300, 'Silver Spring'], [39.2780, -76.6100, 'Baltimore Federal Hill'], [38.9784, -76.4922, 'Annapolis'], [39.4143, -77.4105, 'Frederick']];
const FEW = 'ACCTID,ADDRESS,CITY,ZIPCODE,JURSCODE,LU,DESCLU,YEARBLT,SQFTSTRC,NFMTTLVL,NFMLNDVL,NFMIMPVL,TRADATE,CONSIDR1,DESCBLDG,DESCSTYL,BLDG_UNITS,STRTUNT,SDATWEBADR';
const LAYERS = [
  'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0',
  'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/FeatureServer/0',
  'https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0',
  'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0',
  'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/1',
];

const out = await page.evaluate(async (SPOTS, FEW, LAYERS) => {
  const get = async (u, ms = 30000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); return { j: await r.json(), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const res = { layers: [], agol: [], timings: [], search: [] };
  // ArcGIS Online copies of Maryland's parcels
  for (const q of ['title:"Maryland Parcel" AND (type:"Feature Service" OR type:"Map Service")', 'title:"MD Parcel" AND type:"Feature Service"',
    'title:"Property Data" AND Maryland AND type:"Feature Service"', 'owner:MDiMAP AND type:"Feature Service" AND parcel']) {
    const r = await get('https://www.arcgis.com/sharing/rest/search?f=json&num=20&q=' + encodeURIComponent(q));
    for (const it of ((r.j && r.j.results) || [])) res.agol.push(`${it.title} | ${it.owner} | ${it.url} | ${it.access} | ${it.id}`);
  }
  // what each layer is
  const urls = [...LAYERS];
  for (const u of urls) {
    const m = await get(u + '?f=json');
    const f = (m.j && m.j.fields || []).map((x) => x.name);
    res.layers.push({ u, ms: m.ms, err: m.err || (m.j && m.j.error && JSON.stringify(m.j.error)), name: m.j && m.j.name, type: m.j && m.j.type, max: m.j && m.j.maxRecordCount,
      geom: m.j && m.j.geometryType, nFields: f.length, has: ['ADDRESS', 'NFMTTLVL', 'ACCTID', 'LU', 'TRADATE', 'CONSIDR1', 'YEARBLT', 'SDATWEBADR'].filter((x) => f.includes(x)).join(',') });
  }
  const ask = async (u, lat, lon, extra) => {
    const p = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '150',
      units: 'esriSRUnit_Meter', outSR: '4326', returnGeometry: 'true', geometryPrecision: '6', f: 'json', outFields: FEW, ...extra });
    const r = await get(u + '/query?' + p.toString());
    return { ms: r.ms, n: r.j && r.j.features ? r.j.features.length : (r.err || JSON.stringify(r.j && r.j.error)).slice(0, 120) };
  };
  for (const [lat, lon, name] of SPOTS) {
    for (const L of res.layers.filter((x) => !x.err && x.nFields)) {
      const a = await ask(L.u, lat, lon, {});
      const b = await ask(L.u, lat, lon, { returnGeometry: 'false' });
      const c = await ask(L.u, lat, lon, { outFields: 'ACCTID' });
      const d = await ask(L.u, lat, lon, {});      // again: cached?
      res.timings.push(`${name} | ${L.u.replace(/^https:\/\//, '').slice(0, 95)} | few fields ${a.ms} ms (${a.n}) | no outlines ${b.ms} ms | one field ${c.ms} ms | again ${d.ms} ms`);
    }
  }
  for (const [where, label] of [["UPPER(ADDRESS) LIKE '1200 LIGHT ST%'", 'Baltimore address'], ["UPPER(ADDRESS) LIKE '8505 FENTON ST%' AND UPPER(CITY) LIKE 'SILVER SPRING%'", 'Silver Spring with town']]) {
    for (const L of res.layers.filter((x) => !x.err && x.nFields && /ADDRESS/.test(x.has))) {
      const p = new URLSearchParams({ where, outFields: 'ACCTID,ADDRESS,CITY', returnGeometry: 'false', f: 'json', resultRecordCount: '10' });
      const r = await get(L.u + '/query?' + p.toString(), 20000);
      res.search.push(`${label} | ${L.u.replace(/^https:\/\//, '').slice(0, 95)} | ${r.ms} ms | ${r.j && r.j.features ? r.j.features.length + ' found ' + JSON.stringify(r.j.features.slice(0, 2).map((f) => f.attributes)) : (r.err || JSON.stringify(r.j && r.j.error)).slice(0, 150)}`);
    }
  }
  return res;
}, SPOTS, FEW, LAYERS);
console.log('#### MD speed');
console.log('== layers'); for (const l of out.layers) console.log('  ', JSON.stringify(l));
console.log('== ArcGIS Online copies'); for (const a of [...new Set(out.agol)]) console.log('  ', a);
console.log('== lot queries (150 m)'); for (const t of out.timings) console.log('  ', t);
console.log('== address searches'); for (const t of out.search) console.log('  ', t);
await browser.close(); srv.close();
