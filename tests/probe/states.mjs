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

// [state, label, layer url, test spots [lat, lon, name]]
const LAYERS = [
  ['MD', 'SDAT parcel points', 'https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0', [[38.9784, -76.4922, 'Annapolis'], [38.9907, -77.0261, 'Silver Spring']]],
  ['MD', 'property sales', 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertySales/MapServer/0', [[38.9784, -76.4922, 'Annapolis']]],
  ['DC', 'common ownership lots', 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer/49', [[38.8869, -76.9958, 'Capitol Hill']]],
  ['DC', 'residential CAMA (table)', 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer/25', []],
  ['NY', 'tax parcels (sharing counties)', 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1', [[42.6526, -73.7562, 'Albany'], [42.8864, -78.8784, 'Buffalo'], [43.1566, -77.6088, 'Rochester']]],
  ['NY', 'parcel centroid points (all counties)', 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcel_Centroid_Points/MapServer/0', [[43.1566, -77.6088, 'Rochester'], [41.0340, -73.7629, 'White Plains']]],
  ['NY', 'NYC MapPLUTO', 'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0', [[40.6710, -73.9814, 'Park Slope']]],
  ['VT', 'VCGI parcels + grand list', 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0', [[44.4759, -73.2121, 'Burlington']]],
  ['WI', 'V11 statewide parcels', 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels/FeatureServer/0', [[43.0731, -89.4012, 'Madison'], [43.0389, -87.9065, 'Milwaukee']]],
  ['NC', 'NC OneMap parcels', 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1', [[35.7796, -78.6382, 'Raleigh'], [35.2271, -80.8431, 'Charlotte']]],
  ['UT', 'Salt Lake LIR parcels', 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_SaltLake_LIR/FeatureServer/0', [[40.7608, -111.8910, 'Salt Lake City']]],
  ['MT', 'cadastral parcels', 'https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v1/MapServer/1', [[45.6770, -111.0429, 'Bozeman']]],
  ['WV', 'statewide parcels', 'https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/0', [[39.6295, -79.9559, 'Morgantown']]],
  ['MN', 'opt-in open parcels', 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer/1', [[44.9778, -93.2650, 'Minneapolis'], [44.9537, -93.0900, 'St Paul']]],
  ['TX', 'StratMap parcels', 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0', [[30.2672, -97.7431, 'Austin'], [29.7604, -95.3698, 'Houston'], [32.7767, -96.7970, 'Dallas']]],
  ['WA', 'statewide current parcels', 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0', [[47.6062, -122.3321, 'Seattle'], [47.6588, -117.4260, 'Spokane']]],
  ['AR', 'CAMP parcel polygons', 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6', [[34.7465, -92.2896, 'Little Rock']]],
  ['CO', 'public parcels', 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0', [[39.7392, -104.9903, 'Denver'], [38.8339, -104.8214, 'Colorado Springs']]],
];
// Servers to list, looking for a parcel service by name.
const DIRS = ['https://tnmap.tn.gov/arcgis/rest/services', 'https://gisdata.in.gov/server/rest/services', 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services',
  'https://geodata.hawaii.gov/arcgis/rest/services', 'https://gis.colorado.gov/public/rest/services', 'https://services.wvgis.wvu.edu/arcgis/rest/services',
  'https://gis.ohio.gov/arcgis/rest/services', 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services', 'https://kygisserver.ky.gov/arcgis/rest/services',
  'https://gis.nd.gov/arcgis/rest/services', 'https://risegis.ri.gov/hosting/rest/services', 'https://nhgeodata.unh.edu/nhgeodata/rest/services'];
// ArcGIS Online searches for statewide parcel services, for states with no known one.
const AGOL = ['Rhode Island', 'New Hampshire', 'Maine', 'Delaware', 'Pennsylvania', 'Ohio', 'Michigan', 'Indiana', 'Illinois', 'Iowa', 'Kentucky', 'Tennessee',
  'Virginia', 'South Carolina', 'Georgia', 'Alabama', 'Mississippi', 'Louisiana', 'Missouri', 'Kansas', 'Nebraska', 'Oklahoma', 'North Dakota', 'South Dakota',
  'Wyoming', 'Idaho', 'Nevada', 'Arizona', 'New Mexico', 'California', 'Oregon', 'Alaska', 'Hawaii'];

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
      const q = new URLSearchParams({ f: 'json', num: '6', sortField: 'numViews', sortOrder: 'desc', q: `(title:parcels OR title:parcel OR title:"tax parcels") AND (title:"${s}" OR tags:"${s}") AND type:"Feature Service" AND -title:county` });
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
