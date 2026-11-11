// Why are Madison's lots slow? Times the app's own lot query around a few Wisconsin spots with and without leaving out the
// non-parcel outlines (street right-of-way, water, rail, gaps), and how big those outlines are; then times address searches.
// Property fields only (never owner names or mailing addresses). Run by the "probe services" workflow.
//   cd tests && node probe/wi-speed.mjs
const LAYER = 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0';
const OUT = 'OBJECTID,PARCELID,SITEADRESS,UNITID,PLACENAME,ZIPCODE,CONAME,TAXROLLYEAR,CNTASSDVALUE,LNDVALUE,IMPVALUE,ESTFMKVALUE,NETPRPTA,PROPCLASS,AUXCLASS';
const NON = "(PARCELID IS NULL OR (PARCELID NOT IN ('ROW','HYDRO','WATER','RAIL','GAP') AND PARCELID NOT LIKE '%LAKE%' AND PARCELID NOT LIKE '%RIVER%'))";
const SPOTS = [[43.0790, -89.3800, 'Madison isthmus'], [43.0700, -89.4300, 'Madison Near West'], [43.0730, -89.3870, 'Madison downtown'],
  [43.0606, -88.1065, 'Brookfield'], [44.9591, -89.6301, 'Wausau'], [42.9980, -87.8980, 'Milwaukee Bay View']];
async function q(params, ms = 45000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms), t0 = Date.now();
  try {
    const r = await fetch(LAYER + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ f: 'json', ...params }).toString(), signal: ctl.signal });
    const text = await r.text(); const j = JSON.parse(text);
    return { ms: Date.now() - t0, kb: Math.round(text.length / 1024), j };
  } catch (e) { return { ms: Date.now() - t0, err: String(e.message || e) }; } finally { clearTimeout(t); }
}
const near = (lat, lon, extra = {}) => ({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '220',
  units: 'esriSRUnit_Meter', outFields: OUT, returnGeometry: 'true', outSR: '4326', geometryPrecision: '7', resultRecordCount: '2000', orderByFields: 'OBJECTID', ...extra });
for (const [lat, lon, name] of SPOTS) {
  const a = await q(near(lat, lon));
  const big = (a.j && a.j.features || []).map((f) => ({ id: f.attributes.PARCELID, pts: (f.geometry && f.geometry.rings || []).reduce((n, r) => n + r.length, 0) }))
    .sort((x, y) => y.pts - x.pts).slice(0, 4);
  console.log(`${name}: as the app asks ${a.err || ''} ${a.ms} ms, ${a.kb} KB, ${(a.j && a.j.features || []).length} records; most points: ${JSON.stringify(big)}`);
  const b = await q(near(lat, lon, { where: NON }));
  console.log(`${name}: without non-parcels ${b.err || ''} ${b.ms} ms, ${b.kb} KB, ${(b.j && b.j.features || []).length} records`);
  const c = await q(near(lat, lon, { where: NON }));
  console.log(`${name}: again ${c.err || ''} ${c.ms} ms`);
  const d = await q(near(lat, lon, { where: '1=1', returnGeometry: 'false', outFields: 'OBJECTID,PARCELID' }));
  console.log(`${name}: no geometry ${d.err || ''} ${d.ms} ms, ${(d.j && d.j.features || []).length} records`);
}
const W = (where) => ({ where, outFields: 'OBJECTID,SITEADRESS,PLACENAME', returnGeometry: 'false', resultRecordCount: '10' });
for (const where of ["UPPER(SITEADRESS) LIKE '2509 VAN HISE AVE%'", "SITEADRESS LIKE '2509 VAN HISE AVE%'", "SITEADRESS = '2509 VAN HISE AVE'",
  "UPPER(SITEADRESS) LIKE '2509 VAN HISE AVE%' AND (UPPER(PLACENAME) LIKE 'MADISON%' OR UPPER(PLACENAME) LIKE 'CITY OF MADISON%')",
  "SITEADRESS LIKE '2509 VAN HISE AVE%' AND PLACENAME = 'CITY OF MADISON'", "ADDNUM = '2509' AND STREETNAME = 'VAN HISE'", "SITEADRESS_STAND LIKE '2509 VAN HISE AVENUE%'"]) {
  const r = await q(W(where), 20000);
  console.log(`search ${where}: ${r.err || ''} ${r.ms} ms ${JSON.stringify(r.j && (r.j.error || (r.j.features || []).map((f) => f.attributes.SITEADRESS))).slice(0, 160)}`);
}
const idx = await (await fetch(LAYER + '?f=json')).json().catch(() => ({}));
console.log('indexes:', JSON.stringify((idx.indexes || []).map((i) => `${i.name}:${i.fields}`)));
