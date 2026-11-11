// Why are Madison's lots slow? Times the app's own lot query around a few Wisconsin spots with and without leaving out the
// non-parcel outlines (street right-of-way, water, rail, gaps), and how big those outlines are; then times address searches.
// Property fields only (never owner names or mailing addresses). Run by the "probe services" workflow.
//   cd tests && node probe/wi-speed.mjs
const LAYER = 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0';
const OUT = 'OBJECTID,PARCELID,SITEADRESS,UNITID,PLACENAME,ZIPCODE,CONAME,TAXROLLYEAR,CNTASSDVALUE,LNDVALUE,IMPVALUE,ESTFMKVALUE,NETPRPTA,PROPCLASS,AUXCLASS';
const NON = "(PARCELID IS NULL OR (PARCELID NOT IN ('ROW','HYDRO','WATER','RAIL','GAP') AND PARCELID NOT LIKE '%LAKE%' AND PARCELID NOT LIKE '%RIVER%'))";
const SPOTS = [[43.0790, -89.3800, 'Madison isthmus'], [43.0700, -89.4300, 'Madison Near West'], [43.0730, -89.3870, 'Madison downtown'],
  [43.0500, -89.5000, 'Madison west side'], [44.9591, -89.6301, 'Wausau'], [44.5133, -88.0133, 'Green Bay'], [42.9980, -87.8980, 'Milwaukee Bay View']];
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
// Which filter is quickest: the spots, each filter three times in turn, plus the non-parcel ids around each spot
const FILTERS = { none: null, list: NON, notIn: "PARCELID NOT IN ('ROW','HYDRO','WATER','LAKE','RAIL','GAP','RIVER')", notRow: "PARCELID <> 'ROW'",
  year: 'TAXROLLYEAR IS NOT NULL' };
for (const [lat, lon, name] of SPOTS) {
  const ids = await q(near(lat, lon, { where: '1=1', returnGeometry: 'false', outFields: 'OBJECTID,PARCELID,TAXROLLYEAR' }));
  const odd = (ids.j && ids.j.features || []).map((f) => f.attributes).filter((a) => !/\d/.test(String(a.PARCELID || '')) || !a.TAXROLLYEAR).map((a) => `${a.PARCELID}/${a.TAXROLLYEAR || '-'}`);
  console.log(`${name}: ${(ids.j && ids.j.features || []).length} records; without a number or a tax year: ${JSON.stringify(odd.slice(0, 12))}`);
  for (let round = 0; round < 3; round++) {
    const line = [];
    for (const [k, w] of Object.entries(FILTERS)) {
      if (k === 'none' && round > 0 && /isthmus/.test(name)) { line.push(`${k} skipped`); continue; }
      const r = await q(near(lat, lon, w ? { where: w } : {}), 30000);
      line.push(`${k} ${r.err ? 'ABORT' : ''}${r.ms}ms/${r.kb}KB/${(r.j && r.j.features || []).length}`);
    }
    console.log(`  ${name} round ${round + 1}: ${line.join(' · ')}`);
  }
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
