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

// [state, label, layer url, test spots [lat, lon, name]]. Rounds 1-3 are in git history; this is round 4: Nebraska, Alaska,
// Maryland's lot outlines, Hawaii's parcel layer, and ordinary houses (not downtown buildings) in the states found so far.
const LAYERS = [
  ['NE', 'statewide parcels', 'https://giscat.ne.gov/enterprise/rest/services/StatewideParcelsExternal/MapServer/0', [[41.2611, -95.9850, 'Omaha Dundee'], [40.8000, -96.6700, 'Lincoln']]],
  ['AK', 'statewide parcels', 'https://services1.arcgis.com/7HDiw78fcUiM2BWn/arcgis/rest/services/AK_Parcels/FeatureServer/0', [[61.1900, -149.8700, 'Anchorage'], [64.8400, -147.7500, 'Fairbanks']]],
  ['NC', 'NC OneMap parcels', 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1', [[35.8085, -78.6430, 'Raleigh Five Points'], [35.2050, -80.8500, 'Charlotte Dilworth'], [35.6000, -82.5400, 'Asheville']]],
  ['MD', 'SDAT parcel points', 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0', [[39.0050, -77.0150, 'Silver Spring houses'], [39.3330, -76.6330, 'Baltimore Hampden']]],
  ['DC', 'common ownership lots', 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer/49', [[38.9290, -77.0310, 'Columbia Heights']]],
  ['NY', 'tax parcels (sharing counties)', 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1', [[42.6600, -73.7950, 'Albany houses'], [40.8710, -73.4150, 'Huntington'], [40.9890, -73.7840, 'Scarsdale']]],
  ['NY', 'parcel centroid points', 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcel_Centroid_Points/MapServer/0', [[40.8710, -73.4150, 'Huntington'], [40.9890, -73.7840, 'Scarsdale'], [43.1300, -77.5700, 'Rochester houses']]],
  ['MN', 'opt-in open parcels', 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer/1', [[44.9245, -93.3150, 'Minneapolis Linden Hills'], [44.9350, -93.1700, 'St Paul Mac-Groveland'], [44.0200, -92.4700, 'Rochester MN']]],
  ['UT', 'Salt Lake LIR parcels', 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_SaltLake_LIR/FeatureServer/0', [[40.7250, -111.8600, 'Sugar House']]],
  ['UT', 'Utah County LIR parcels', 'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_Utah_LIR/FeatureServer/0', [[40.2500, -111.6600, 'Provo']]],
  ['WI', 'statewide parcels', 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0', [[43.0700, -89.4300, 'Madison Near West']]],
  ['WA', 'statewide current parcels', 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0', [[47.6680, -122.3850, 'Seattle Ballard']]],
  ['CO', 'public parcels', 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0', [[39.7500, -104.9200, 'Denver Park Hill'], [40.5700, -105.0800, 'Fort Collins']]],
  ['VT', 'VCGI parcels', 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0', [[44.4850, -73.2050, 'Burlington houses']]],
  ['MT', 'cadastral parcels', 'https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v1/MapServer/1', [[45.6700, -111.0500, 'Bozeman houses'], [45.7800, -108.5300, 'Billings']]],
  ['IL', 'Cook County parcels', 'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmc/MapServer/44', [[41.9690, -87.6880, 'Chicago Lincoln Square']]],
  ['AR', 'CAMP parcel polygons', 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6', [[34.7550, -92.3100, 'Little Rock Hillcrest']]],
  ['HI', 'statewide TMKs', 'https://geodata.hawaii.gov/arcgis/rest/services/ParcelsZoning/MapServer/25', [[21.2850, -157.8000, 'Honolulu Kaimuki']]],
  ['WY', 'Wyoming parcels 2026', 'https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0', [[41.1500, -104.8000, 'Cheyenne houses']]],
  ['ID', 'public Idaho parcels', 'https://services1.arcgis.com/CNPdEkvnGl65jCX8/arcgis/rest/services/Public_Idaho_Parcels_/FeatureServer/0', [[43.6300, -116.2050, 'Boise North End']]],
];
// Listings: Maryland's parcel services (for lot outlines), Maine's layers.
const DIRS = ['https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre', 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer'];
const AGOL = [];

const res = await page.evaluate(async (LAYERS, DIRS, AGOL) => {
  const HIDE = /(^|_)OWN|OWNER|MAIL|^NAME|_NAME|NAME_|NAME\d|TAXPAYER|CARE|GRANT|BUYER|SELLER|ADDRESSEE|PSTLADR|DEED_?NAME|ADD|ADR|CITY|ZIP|STREET|SITUS|SITE|LOCATION|^M(ADDR|UNIT|CITY|ZIP|STATE|STNAME)|ASSESSOR$/i;
  const SHOW = /VAL|VL$|MKT|MARKET|ASSESS|APPR|PARVAL|EMV|AV$|_AV|FLV|YR|YEAR|BLT|BUILT|SALE|PRICE|CONSID|TRADATE|USE|CLASS|SQFT|SQ_FT|GBA|LIVING|STRUC|UNIT|BED|BATH|STOR|TAX|ACRE|TYPE/i;
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
        const fs = j.features || [], score = (x) => Object.entries(x.attributes || {}).filter(([k, v]) => SHOW.test(k) && !HIDE.test(k) && v !== null && v !== '' && v !== 0 && v !== ' ').length;
        const best = fs.slice().sort((p, q) => score(q) - score(p))[0], a = best && best.attributes;
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
      const hits = (j.services || []).map((s) => `${s.name}:${s.type}`).filter((s) => /parcel|cadast|tax|property|assess|land/i.test(s)).concat((j.layers || []).map((l) => `layer ${l.id}:${l.name}:${l.geometryType || ''}`));
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
