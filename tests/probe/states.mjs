// Tries the free statewide parcel services of states Housepoint doesn't cover yet, from a real browser page (as the phone
// would ask, with its cross-site rules), and logs which useful fields each one has and fills in near a test spot. Used to
// plan which states to add next. Run by the "probe services" workflow; nothing is saved.
// Owner and mailing fields are never printed: only field names, and values of a short list of property fields.
//   cd tests && node probe/states.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8798);
const log = (...a) => console.log(...a);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8798/');

// [state, label, layer url, test spots [lat, lon, name]]. Round 1 (MD, DC, NY, VT, WI, NC, UT, MT, WV, MN, TX, WA, AR, CO) is in
// git history; this is round 2: services found by round 1's listings and searches, and other addresses for ones that failed.
const LAYERS = [
  ['MD', 'SDAT parcel points (mdgeodata host)', 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0', [[38.9784, -76.4922, 'Annapolis'], [38.9907, -77.0261, 'Silver Spring']]],
  ['TX', 'StratMap 2025 (tnris host)', 'https://feature.tnris.org/arcgis/rest/services/Parcels/stratmap25_land_parcels_48/MapServer/0', [[30.2672, -97.7431, 'Austin']]],
  ['TX', 'StratMap 2025', 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap25_land_parcels_48/MapServer/0', [[30.2672, -97.7431, 'Austin']]],
  ['OH', 'statewide parcels public view', 'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/OhioStatewidePacels_full_view/FeatureServer/0', [[39.9612, -82.9988, 'Columbus'], [41.4993, -81.6944, 'Cleveland'], [39.1031, -84.5120, 'Cincinnati']]],
  ['AL', 'Alabama parcel data', 'https://services6.arcgis.com/VUsVQlvugJlIRS3I/arcgis/rest/services/Alabama_Parcel_Data/FeatureServer/0', [[33.5186, -86.8104, 'Birmingham'], [34.7304, -86.5861, 'Huntsville']]],
  ['WY', 'Wyoming parcels 2026', 'https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0', [[41.1400, -104.8202, 'Cheyenne'], [42.8666, -106.3131, 'Casper']]],
  ['ID', 'public Idaho parcels', 'https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/0', [[43.6150, -116.2023, 'Boise']]],
  ['ND', 'public parcels', 'https://services1.arcgis.com/XxHmL09eFqJWI0gE/arcgis/rest/services/ParcelsPublic/FeatureServer/0', [[46.8772, -96.7898, 'Fargo'], [46.8083, -100.7837, 'Bismarck']]],
  ['NV', 'county parcels in Nevada', 'https://arcgis.water.nv.gov/arcgis/rest/services/BaseLayers/County_Parcels_in_Nevada/MapServer/0', [[39.5296, -119.8138, 'Reno'], [36.1699, -115.1398, 'Las Vegas']]],
  ['IN', 'parcel boundaries current', 'https://gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0', [[39.7684, -86.1581, 'Indianapolis']]],
  ['VA', 'VGIN parcels', 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0', [[37.5407, -77.4360, 'Richmond']]],
  ['DE', 'state parcels', 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0', [[39.7391, -75.5398, 'Wilmington'], [39.1582, -75.5244, 'Dover']]],
  ['HI', 'parcels and zoning', 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/0', [[21.3069, -157.8583, 'Honolulu']]],
  ['NH', 'parcel mosaic', 'https://nhgeodata.unh.edu/hosting/rest/services/Hosted/CAD_ParcelMosaic/FeatureServer/1', [[43.2081, -71.5376, 'Concord']]],
  ['ME', 'parcels organized towns', 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/0', [[43.6591, -70.2568, 'Portland']]],
  ['IL', 'Cook County parcels with assessment', 'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmc/MapServer/44', [[41.8781, -87.6298, 'Chicago']]],
];
const DIRS = ['https://hawaii.maps.arcgis.com/sharing/rest/search?f=json&q=parcels'].slice(0, 0);
const AGOL = ['Wisconsin', 'Texas', 'Rhode Island', 'Oregon', 'California', 'New Mexico', 'Pennsylvania', 'Kentucky', 'Iowa', 'Georgia'];

const res = await page.evaluate(async (LAYERS, DIRS, AGOL) => {
  const HIDE = /(^|_)OWN|OWNER|MAIL|^NAME|_NAME|NAME_|NAME\d|TAXPAYER|CARE|GRANT|BUYER|SELLER|ADDRESSEE|PSTLADR|DEED_?NAME/i;
  const SHOW = /VAL|MKT|MARKET|ASSESS|APPR|PARVAL|EMV|AV$|_AV|YR|YEAR|BLT|BUILT|SALE|PRICE|CONSID|TRADATE|SITUS|SITE|ADDR|LOCATION|STREET|USE|CLASS|SQFT|SQ_FT|GBA|LIVING|STRUC|UNIT|BED|BATH|STOR|TAX|ZIP|CITY|TOWN|MUNI|COUNTY|ACRE/i;
  const timed = async (f) => { const t0 = performance.now(); try { const v = await f(); return { ms: Math.round(performance.now() - t0), ...v }; } catch (e) { return { ms: Math.round(performance.now() - t0), fetchError: String(e && e.message || e).slice(0, 160) }; } };
  const get = async (u, ms = 25000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); const txt = await r.text(); try { return JSON.parse(txt); } catch (e) { return { notJson: txt.slice(0, 120), status: r.status }; } } finally { clearTimeout(t); } };
  const out = { layers: [], dirs: [], agol: [] };
  for (const [st, label, url, spots] of LAYERS) {
    const row = { st, label, url };
    row.meta = await timed(async () => {
      const j = await get(url + '?f=json');
      if (!j || j.error || j.notJson) return { err: JSON.stringify(j && (j.error || j)).slice(0, 200) };
      const fields = (j.fields || []).map((f) => f.name);
      return { name: j.name, geom: j.geometryType || j.type, max: j.maxRecordCount, n: fields.length, useful: fields.filter((f) => SHOW.test(f) && !HIDE.test(f)).join(','), hidden: fields.filter((f) => HIDE.test(f)).length, caps: j.capabilities };
    });
    row.spots = [];
    for (const [lat, lon, name] of spots) {
      row.spots.push(await timed(async () => {
        const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '60', units: 'esriSRUnit_Meter', outFields: '*', returnGeometry: 'false', resultRecordCount: '5', f: 'json' });
        const j = await get(url + '/query?' + q);
        if (!j || j.error || j.notJson) return { name, err: JSON.stringify(j && (j.error || j)).slice(0, 200) };
        const fs = j.features || [], a = fs[0] && fs[0].attributes;
        const shown = a ? Object.fromEntries(Object.entries(a).filter(([k, v]) => SHOW.test(k) && !HIDE.test(k) && v !== null && v !== '' && v !== 0).slice(0, 40)) : null;
        return { name, n: fs.length, sample: shown };
      }));
    }
    out.layers.push(row);
  }
  for (const d of DIRS) {
    out.dirs.push({ d, ...(await timed(async () => {
      const j = await get(d + '?f=json', 15000);
      if (!j || j.error || j.notJson) return { err: JSON.stringify(j && (j.error || j)).slice(0, 160) };
      const hits = (j.services || []).map((s) => `${s.name}:${s.type}`).filter((s) => /parcel|cadast|tax|property|assess|land/i.test(s));
      const folders = j.folders || [];
      // one level into folders whose name suggests parcels
      for (const f of folders.filter((f) => /parcel|cadast|planning|property|land|tax|hosted|boundar|base/i.test(f)).slice(0, 6)) {
        try { const k = await get(`${d}/${f}?f=json`, 15000); for (const s of (k.services || [])) if (/parcel|cadast|tax|property|assess|land/i.test(s.name)) hits.push(`${s.name}:${s.type}`); } catch (e) { /* skip */ }
      }
      return { folders: folders.slice(0, 40).join(','), hits: hits.slice(0, 30) };
    })) });
  }
  for (const s of AGOL) {
    out.agol.push({ s, ...(await timed(async () => {
      const q = new URLSearchParams({ f: 'json', num: '6', sortField: 'numViews', sortOrder: 'desc', q: `(title:parcels OR title:parcel OR title:statewide) AND (title:"${s}" OR tags:"${s}") AND (tags:statewide OR title:statewide OR tags:state) AND type:"Feature Service"` });
      const j = await get('https://www.arcgis.com/sharing/rest/search?' + q, 15000);
      return { hits: (j.results || []).map((r) => `${r.title} | ${r.url} | views ${r.numViews}`) };
    })) });
  }
  return out;
}, LAYERS, DIRS, AGOL);

log('== statewide parcel layers');
for (const r of res.layers) {
  log(`-- ${r.st} ${r.label}  ${r.url}`);
  log(`   meta: ${JSON.stringify(r.meta).slice(0, 1500)}`);
  for (const s of r.spots) log(`   spot: ${JSON.stringify(s).slice(0, 1500)}`);
}
log('== server listings');
for (const d of res.dirs) log(JSON.stringify(d).slice(0, 2500));
log('== ArcGIS Online searches');
for (const a of res.agol) log(JSON.stringify(a).slice(0, 1500));
await browser.close(); srv.close();
