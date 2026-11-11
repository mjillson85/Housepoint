// The basic card (places without state or county records): what the national building outlines (USA Structures, FEMA and
// Oak Ridge National Laboratory, on ArcGIS Online) hold for each building, and what Geoapify's reverse lookup says about a spot
// (address, town, county, state). Plain Node; prints building facts and addresses only (the layer has no owner fields).
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
const geoKey = (/geoapify:\s*'([^']+)'/.exec(html) || [])[1];
const get = async (url, ms = 20000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = Date.now();
  try { const r = await fetch(url, { signal: c.signal }); return { j: await r.json(), ms: Date.now() - t0 }; } finally { clearTimeout(t); } };
const item = await get('https://www.arcgis.com/sharing/rest/content/items/0ec8512ad21e4bb987d7e848d14e7e24?f=json');
const url = /\/\d+\/?$/.test(item.j.url) ? item.j.url.replace(/\/+$/, '') : item.j.url.replace(/\/+$/, '') + '/0';
console.log('item:', item.j.title, '|', url);
const meta = await get(url + '?f=json');
console.log('fields:', (meta.j.fields || []).map((f) => `${f.name}:${f.type.replace('esriFieldType', '')}`).join('  '));
console.log('max', meta.j.maxRecordCount);
const SPOTS = [[33.9980, -81.0300, 'Columbia SC'], [38.2400, -85.7300, 'Louisville KY Highlands'], [39.9520, -75.1800, 'Philadelphia Rittenhouse'],
  [35.0900, -106.6300, 'Albuquerque Nob Hill'], [29.9300, -90.1000, 'New Orleans Uptown'], [36.1400, -95.9700, 'Tulsa'], [43.5450, -96.7300, 'Sioux Falls'],
  [41.8300, -71.4000, 'Providence East Side'], [41.5900, -93.6500, 'Des Moines'], [33.5000, -86.8000, 'Birmingham AL'], [39.0500, -94.5900, 'Kansas City MO'],
  [32.3200, -90.1800, 'Jackson MS'], [30.2700, -97.7400, 'Austin TX (outside the counties)'], [34.0600, -118.3000, 'Los Angeles'], [41.4900, -81.6900, 'Cleveland'],
  [42.3300, -83.0500, 'Detroit'], [40.4400, -79.9500, 'Pittsburgh']];
for (const [lat, lon, name] of SPOTS) {
  try {
    const p = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '80',
      units: 'esriSRUnit_Meter', outFields: '*', returnGeometry: 'false', f: 'json', resultRecordCount: '40' });
    const r = await get(`${url}/query?${p}`);
    const fs2 = (r.j.features || []).map((f) => f.attributes);
    const occ = {}; for (const a of fs2) { const k = `${a.OCC_CLS ?? a.occ_cls ?? '?'} / ${a.PRIM_OCC ?? a.prim_occ ?? '?'}`; occ[k] = (occ[k] || 0) + 1; }
    const withAddr = fs2.filter((a) => a.PROP_ADDR || a.prop_addr).length;
    console.log(`== ${name}: ${fs2.length} buildings in ${r.ms} ms, ${withAddr} with an address; kinds ${JSON.stringify(occ)}`);
    for (const a of fs2.slice(0, 3)) console.log('   ' + JSON.stringify(a).slice(0, 700));
    if (geoKey) {
      const g = await get(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${geoKey}`);
      const x = (g.j.results || [])[0] || {};
      console.log(`   geoapify (${g.ms} ms): ${JSON.stringify({ housenumber: x.housenumber, street: x.street, city: x.city, town: x.town, village: x.village, suburb: x.suburb, county: x.county, state_code: x.state_code, postcode: x.postcode, result_type: x.result_type, distance: x.distance })}`);
    }
  } catch (e) { console.log(`== ${name}: ${e.message}`); }
}
