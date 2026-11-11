// Maine's parcels (layer 10) hold the lot lines and street address; the assessing table (9) holds values and sales by STATE_ID.
// Checks whether a lot's STATE_ID finds its row, and how fast. Also prints Macomb's and Ada's address fields for a few lots.
// Plain Node; prints only property facts (never the owner fields both layers also hold).
const get = async (url, params) => { const t0 = Date.now(); const r = await fetch(`${url}/query?${new URLSearchParams({ f: 'json', ...params })}`); const j = await r.json(); return [j, Date.now() - t0]; };
const box = (lat, lon, m) => { const dlat = m / 111320, dlon = m / (111320 * Math.cos(lat * Math.PI / 180)); return `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`; };
const near = (lat, lon, m) => ({ geometry: box(lat, lon, m), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'false' });
const ME = 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer';
for (const [lat, lon, name] of [[43.6594, -70.2601, 'Portland'], [44.8016, -68.7712, 'Bangor'], [43.9140, -69.9650, 'Brunswick']]) {
  try {
    const [a, ms1] = await get(`${ME}/10`, { ...near(lat, lon, 150), outFields: 'STATE_ID,PROP_LOC,TOWN,MAP_BK_LOT,GEOCODE,TYPE' });
    const lots = a.features || [];
    console.log(`ME ${name}: ${lots.length} lots in ${ms1} ms; first: ${JSON.stringify(lots.slice(0, 3).map((f) => f.attributes))}`);
    const ids = [...new Set(lots.map((f) => f.attributes.STATE_ID).filter(Boolean))].slice(0, 60);
    if (!ids.length) continue;
    const where = `STATE_ID IN (${ids.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')})`;
    const [b, ms2] = await get(`${ME}/9`, { where, outFields: 'STATE_ID,MAP_BK_LOT,LAND_VAL,BLDG_VAL,LS_DATE,LS_PRICE,LAND_USE,LAND_USE_D,LIV_UNITS,RES_AREA,YEAR_CREAT', returnGeometry: 'false' });
    const rows = b.features || [];
    console.log(`  table: ${rows.length} rows for ${ids.length} ids in ${ms2} ms${b.error ? ' ERR ' + JSON.stringify(b.error).slice(0, 200) : ''}; first: ${JSON.stringify(rows.slice(0, 3).map((f) => f.attributes))}`);
    // and by MAP_BK_LOT within the town, in case STATE_ID doesn't match
    const mbl = lots.map((f) => f.attributes.MAP_BK_LOT).filter(Boolean).slice(0, 5);
    if (mbl.length) {
      const [c, ms3] = await get(`${ME}/9`, { where: `MAP_BK_LOT IN (${mbl.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')})`, outFields: 'STATE_ID,MAP_BK_LOT,LAND_VAL', returnGeometry: 'false' });
      console.log(`  by map-block-lot: ${(c.features || []).length} rows in ${ms3} ms; ${JSON.stringify((c.features || []).slice(0, 4).map((f) => f.attributes))}`);
    }
  } catch (e) { console.log(`ME ${name}: ${e.message}`); }
}
const OTHER = [
  ['Macomb', 'https://services6.arcgis.com/K0qS4r8AEJxrE8em/arcgis/rest/services/Macomb_County_Parcel_Data/FeatureServer/10', 'TAX_ID,ADDRESS,CVT_NAME,propstreetcombined,propertyCityStateZip,mborsev_0,mbortax,TAX_URL', [[42.5792, -82.9193], [42.4970, -82.8880]]],
  ['Ada', 'https://services2.arcgis.com/dgGjZc6xAH5m5JyP/arcgis/rest/services/Parcels/FeatureServer/5', 'PARCEL,ADDRESS,CITY_STATE,PROPCODE,TOTALVALUE,PROPUNIT', [[43.6142, -116.1999], [43.6000, -116.2600]]],
  ['San Bernardino', 'https://services.arcgis.com/aA3snZwJfFkVyDuP/arcgis/rest/services/Parcels_for_San_Bernardino_County/FeatureServer/0', 'ParcelNumber,AssessClass,AssessDescription,Jurisdiction,BaseYear,LandValue,ImprovementValue', [[34.0592, -117.1806], [34.1080, -117.2890]]],
];
for (const [name, url, fields, spots] of OTHER) {
  for (const [lat, lon] of spots) {
    try { const [j, ms] = await get(url, { ...near(lat, lon, 60), outFields: fields }); console.log(`${name} ${lat},${lon}: ${(j.features || []).length} in ${ms} ms ${JSON.stringify((j.features || []).slice(0, 4).map((f) => f.attributes))}${j.error ? ' ERR ' + JSON.stringify(j.error) : ''}`); }
    catch (e) { console.log(`${name}: ${e.message}`); }
  }
}
