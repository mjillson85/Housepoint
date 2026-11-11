// Maryland: short records (chosen fields only) at houses, townhouses and condos on the state's parcel layer, so the field
// mapping, condo handling and town tax rates can be written from them: which outlines are right-of-way, water or a condo's
// common outline, whether condo units are outlines or points, the incorporated town (for its tax rate), and how quick the
// lot query is without the right-of-way outlines. Never asks for owner fields.
//   cd tests && node probe/md-records.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8795);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8795/');

const POLYS = 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0';
const POINTS = 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0';
const F = 'ACCTID,JURSCODE,ADDRESS,STRTUNT,CITY,ZIPCODE,DESCTOWN,TOWNCODE,LU,DESCLU,DESCBLDG,DESCSTYL,DESCCNST,YEARBLT,SQFTSTRC,NFMLNDVL,NFMIMPVL,NFMTTLVL,LASTASSD,TRADATE,CONSIDR1,CONVEY1,OOI,RESITYP,BLDG_UNITS,BLDG_STORY,PTYPE,EXCLASS,DESCEXCL,CIUSE,DESCCIUSE,SDATWEBADR,ACRES,LANDAREA,LUOM';
const SPOTS = [[38.9950, -77.0300, 'Silver Spring', 120], [39.2780, -76.6100, 'Baltimore Federal Hill', 90], [39.2840, -76.6060, 'Baltimore Inner Harbor condos', 120],
  [38.9784, -76.4922, 'Annapolis', 100], [38.3600, -75.0800, 'Ocean City condos', 120], [38.9847, -77.0947, 'Bethesda condos', 120],
  [39.4143, -77.4105, 'Frederick', 100], [39.1500, -76.8500, 'Columbia (Howard)', 150], [38.9000, -76.9000, 'Prince George’s', 150], [39.5000, -79.3000, 'Garrett (rural)', 600]];

const out = await page.evaluate(async (POLYS, POINTS, F, SPOTS) => {
  const get = async (u, ms = 30000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); return { j: await r.json(), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const area = (rings) => { let a = 0; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) * 111320 * 111320 * 0.78; };
  const res = [];
  for (const [lat, lon, name, m] of SPOTS) {
    const ask = async (u, extra) => {
      const p = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: String(m),
        units: 'esriSRUnit_Meter', outSR: '4326', returnGeometry: 'true', geometryPrecision: '6', f: 'json', outFields: F, ...extra });
      return get(u + '/query?' + p.toString());
    };
    const a = await ask(POLYS, {});
    const b = await ask(POLYS, { where: "ACCTID NOT IN ('ROW','WATER','RAIL','RR','HYDRO')" });
    const c = await ask(POINTS, {});
    const polys = (a.j && a.j.features || []).map((f) => { const g = f.geometry && f.geometry.rings; const x = f.attributes;
      return { m2: g ? Math.round(area(g)) : null, pts: g ? g.reduce((n, r) => n + r.length, 0) : 0, ...x }; });
    const shapes = new Map(); for (const f of (a.j && a.j.features || [])) { const k = JSON.stringify(f.geometry && f.geometry.rings && f.geometry.rings[0] && f.geometry.rings[0].slice(0, 3)); shapes.set(k, (shapes.get(k) || 0) + 1); }
    res.push({ name, all: `${a.ms} ms ${polys.length}`, noRow: `${b.ms} ms ${(b.j && b.j.features || []).length}`, points: `${c.ms} ms ${(c.j && c.j.features || []).length}`,
      stacked: [...shapes.values()].filter((n) => n > 1).join(','),
      polys: polys.slice(0, 40), pointsOnly: (c.j && c.j.features || []).filter((f) => !polys.some((p) => p.ACCTID === f.attributes.ACCTID)).slice(0, 12).map((f) => f.attributes) });
  }
  return res;
}, POLYS, POINTS, F, SPOTS);
const short = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '' && v !== 0 && v !== '0').map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(' | ');
console.log('#### MD records');
for (const s of out) {
  console.log(`-- ${s.name}: all outlines ${s.all}; without right-of-way ${s.noRow}; points ${s.points}; stacked outlines ${s.stacked || 'none'}`);
  for (const p of s.polys) console.log('   ' + short(p));
  if (s.pointsOnly.length) { console.log('   points with no outline of their own:'); for (const p of s.pointsOnly) console.log('     ' + short(p)); }
}
await browser.close(); srv.close();
