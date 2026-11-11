// Times the slow Tier 2 layers the way the app would ask (from a browser page): lots within QUERY_RADIUS of a spot as a distance
// query and as a box, with geometry, a handful of fields. Prints timings and counts only.
import puppeteer from 'puppeteer-core';
import http from 'http';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<html></html>'); }).listen(8798);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8798/');
const L = {
  MT: ['https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v1/MapServer/1', 'PARCELID,AddressLine1,AddressLine2,CityStateZip,CountyName,TaxYear,PropType,TotalValue,TotalLandValue,TotalBuildingValue,GrazingAcres',
    [[45.7800, -108.5300, 'Billings'], [46.8650, -113.9950, 'Missoula'], [47.5000, -111.3000, 'Great Falls']]],
  CO: ['https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0', 'parcel_id,situsAdd,sitAddCty,landUseDsc,apprValTot,salePrice,saleDate',
    [[39.7000, -104.9700, 'Denver Washington Park'], [40.5730, -105.0790, 'Fort Collins'], [39.5500, -105.0000, 'Highlands Ranch'], [40.0150, -105.2700, 'Boulder']]],
  UT: ['https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_SaltLake_LIR/FeatureServer/0', 'PARCEL_ID,PARCEL_ADD,PARCEL_CITY,TOTAL_MKT_VALUE,PROP_CLASS,BUILT_YR',
    [[40.7500, -111.8700, 'Salt Lake City Sugar House'], [40.6200, -111.8500, 'Cottonwood Heights']]],
  UTC: ['https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_Utah_LIR/FeatureServer/0', 'PARCEL_ID,PARCEL_ADD,PARCEL_CITY,TOTAL_MKT_VALUE,PROP_CLASS,BUILT_YR',
    [[40.2338, -111.6585, 'Provo']]],
  WY: ['https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0', 'parcelnb,locationad,jurisdicti,actualvalu,assessedva',
    [[41.1400, -104.8100, 'Cheyenne'], [43.4800, -110.7600, 'Jackson']]],
  AK: ['https://services1.arcgis.com/7HDiw78fcUiM2BWn/arcgis/rest/services/AK_Parcels/FeatureServer/0', 'parcel_id,property_type,property_use,total_value,building_value,local_gov',
    [[61.1900, -149.8800, 'Anchorage'], [64.8400, -147.7300, 'Fairbanks']]],
};
for (const [st, [url, fields, spots]] of Object.entries(L)) {
  for (const [lat, lon, name] of spots) {
    const r = await page.evaluate(async (url, fields, lat, lon) => {
      const t = async (params) => { const t0 = performance.now(); const c = new AbortController(); const to = setTimeout(() => c.abort(), 40000);
        try { const res = await fetch(url + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(), signal: c.signal });
          const j = await res.json(); return `${Math.round(performance.now() - t0)} ms ${j.error ? 'ERR ' + JSON.stringify(j.error).slice(0, 120) : (j.features || []).length + ' lots' + (j.exceededTransferLimit ? '+' : '')}`; }
        catch (e) { return `${Math.round(performance.now() - t0)} ms ${e.name}`; } finally { clearTimeout(to); } };
      const base = { outFields: fields, returnGeometry: 'true', outSR: '4326', geometryPrecision: '7', f: 'json', resultRecordCount: '1000' };
      const dlat = 250 / 111320, dlon = 250 / (111320 * Math.cos(lat * Math.PI / 180));
      return {
        dist: await t({ ...base, geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '250', units: 'esriSRUnit_Meter' }),
        box: await t({ ...base, geometry: `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }),
        box2: await t({ ...base, geometry: `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }),
        noGeom: await t({ ...base, returnGeometry: 'false', geometry: `${lon - dlon},${lat - dlat},${lon + dlon},${lat + dlat}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }),
      };
    }, url, fields, lat, lon);
    console.log(`${st} ${name}: distance ${r.dist} · box ${r.box} · box again ${r.box2} · box without shapes ${r.noGeom}`);
  }
}
await browser.close(); srv.close();
