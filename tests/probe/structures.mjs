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
const SPOTS = [[33.9980, -81.0300, 'Columbia SC'], [39.9520, -75.1800, 'Philadelphia Rittenhouse'], [35.0900, -106.6300, 'Albuquerque Nob Hill'],
  [29.9300, -90.1000, 'New Orleans Uptown'], [43.5450, -96.7300, 'Sioux Falls'], [30.2700, -97.7400, 'Austin TX (outside the counties)']];
const FIELDS = 'BUILD_ID,OCC_CLS,PRIM_OCC,PROP_ADDR,PROP_CITY,PROP_ZIP,PROP_CNTY,OUTBLDG,HEIGHT,SQFEET';
const box = (lat, lon, m) => { const dlat = m / 111320, dlon = m / (111320 * Math.cos(lat * Math.PI / 180)); return `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`; };
const ask = async (params, ms = 40000) => { const t0 = Date.now(); try { const r = await get(`${url}/query?${new URLSearchParams({ f: 'json', ...params })}`, ms);
  return { n: (r.j.features || []).length, ms: Date.now() - t0, err: r.j.error ? JSON.stringify(r.j.error).slice(0, 120) : '', feats: r.j.features || [] }; } catch (e) { return { n: 0, ms: Date.now() - t0, err: e.name }; } };
for (const [lat, lon, name] of SPOTS) {
  const near = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '220', units: 'esriSRUnit_Meter' };
  const env = { geometry: box(lat, lon, 220), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  const a = await ask({ ...near, returnGeometry: 'true', outSR: '4326', geometryPrecision: '7' });                         // as the app asks for outlines today
  const b = await ask({ ...near, returnGeometry: 'true', outSR: '4326', geometryPrecision: '7', outFields: FIELDS });
  const c = await ask({ ...env, returnGeometry: 'true', outSR: '4326', geometryPrecision: '7', outFields: FIELDS });
  console.log(`== ${name}: outlines only ${a.n} in ${a.ms} ms ${a.err} · with fields ${b.n} in ${b.ms} ms ${b.err} · box with fields ${c.n} in ${c.ms} ms ${c.err}`);
  const fsx = (c.feats.length ? c.feats : b.feats).map((f) => f.attributes);
  const occ = {}; for (const x of fsx) { const k = `${x.OCC_CLS} / ${x.PRIM_OCC}`; occ[k] = (occ[k] || 0) + 1; }
  console.log(`   ${fsx.filter((x) => x.PROP_ADDR).length} of ${fsx.length} with an address; kinds ${JSON.stringify(occ)}`);
  for (const x of fsx.slice(0, 3)) console.log('   ' + JSON.stringify(x));
  if (geoKey) {
    const g = await get(`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${geoKey}`);
    const x = (g.j.results || [])[0] || {};
    console.log(`   geoapify (${g.ms} ms): ${JSON.stringify({ housenumber: x.housenumber, street: x.street, city: x.city, town: x.town, village: x.village, county: x.county, state_code: x.state_code, postcode: x.postcode, distance: x.distance })}`);
  }
}
