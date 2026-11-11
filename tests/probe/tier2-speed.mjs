// Times the slow Tier 2 layers the way the app would ask (from a browser page): lots within QUERY_RADIUS of a spot as a distance
// query and as a box, with geometry, a handful of fields. Prints timings and counts only.
import puppeteer from 'puppeteer-core';
import http from 'http';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<html></html>'); }).listen(8798);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8798/');
const L = {
  OR: ['https://services2.arcgis.com/McQ0OlIABe29rJJy/arcgis/rest/services/Taxlots_with_Right_of_Way_Public/FeatureServer/3', 'SITEADDR,SITECITY,SITEZIP,LANDUSE,STATECLASS,TOTALVAL,YEARBUILT',
    [[45.5120, -122.6400, 'Portland Sunnyside'], [45.4870, -122.8040, 'Beaverton'], [45.3700, -122.6000, 'Oregon City']]],
  TN: ['https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Parcels_view/FeatureServer/0', 'PropAddr,PropCity,LUCode,TotlAppr,SalePrice',
    [[36.1300, -86.8000, 'Nashville Hillsboro'], [36.1750, -86.7600, 'East Nashville']]],
  TXT: ['https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/MapServer/0', 'TAXPIN,SITUS_ADDR,CITY,YEAR_BUILT,TOTAL_VALU',
    [[32.7300, -97.3500, 'Fort Worth Fairmount'], [32.7350, -97.1100, 'Arlington']]],
  TXH: ['https://www.gis.hctx.net/arcgishcpid/rest/services/HCAD/Parcels/MapServer/0', 'HCAD_NUM,Situs_Address,state_class,total_market_val',
    [[29.7400, -95.3900, 'Houston Montrose'], [29.9900, -95.5500, 'Cypress']]],
  WV: ['https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/0', 'CleanParcelID,FullPhysicalAddress,COUNTY',
    [[38.3500, -81.6300, 'Charleston'], [39.6300, -79.9550, 'Morgantown']]],
  VA: ['https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0', 'PARCELID,LOCALITY',
    [[38.8800, -77.1000, 'Arlington'], [37.5400, -77.4400, 'Richmond'], [36.8500, -76.2900, 'Norfolk']]],
  AZ: ['https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer/1', 'APN,PropertyFullStreetAddress,PropertyCity,PropertyUseCode,FullCashValue',
    [[33.4990, -112.0500, 'Phoenix'], [33.4200, -111.9400, 'Tempe']]],
  MIO: ['https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1', 'PIN,SITEADDRESS,SITECITY,CLASSCODE,ASSESSEDVALUE',
    [[42.4890, -83.1410, 'Royal Oak'], [42.5800, -83.2400, 'Bloomfield Hills']]],
  OHH: ['https://cagisonline.hamilton-co.org/arcgis/rest/services/COUNTYWIDE/Cadastral/MapServer/0', 'PARCELID,ADDRNO,ADDRST,ADDRSF,CLASS,MKT_TOTAL_VAL',
    [[39.1400, -84.4400, 'Cincinnati Hyde Park']]],
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
