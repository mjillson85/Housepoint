// Before a state is added: reads its parcel layer from a real browser page (as the phone asks) and logs its field names,
// which property-type codes it uses near a set of spots, and sample records at houses, condos and townhomes, so the
// state's field mapping and property types can be written from real records. Run by the "probe services" workflow.
// Only a list of property fields is ever requested: never owner names, mailing addresses or legal descriptions.
//   cd tests && node probe/state-fields.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8799);
const log = (...a) => console.log(...a);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8799/');

const STATES = {
  WI: {
    layer: 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0',
    want: ['OBJECTID', 'STATEID', 'PARCELID', 'TAXPARCELID', 'PARCELDATE', 'TAXROLLYEAR', 'SITEADRESS', 'ADDNUMPREFIX', 'ADDNUM', 'ADDNUMSUFFIX', 'PREFIX', 'STREETNAME',
      'STREETTYPE', 'SUFFIX', 'LANDMARKNAME', 'UNITTYPE', 'UNITID', 'PLACENAME', 'ZIPCODE', 'ZIP4', 'STATE', 'SCHOOLDIST', 'SCHOOLDISTNO', 'CNTASSDVALUE', 'LNDVALUE',
      'IMPVALUE', 'MFLVALUE', 'ESTFMKVALUE', 'NETPRPTA', 'GRSPRPTA', 'PROPCLASS', 'AUXCLASS', 'ASSDACRES', 'DEEDACRES', 'GISACRES', 'CONAME', 'LOADDATE', 'PARCELFIPS',
      'PARCELSRC', 'SITEADRESS_STAND'],
    group: [['PROPCLASS'], ['AUXCLASS'], ['TAXROLLYEAR']],
    codes: ['PROPCLASS', 'AUXCLASS'],
    county: ['CONAME'],
    spots: [[43.0790, -89.3800, 'Madison isthmus houses'], [43.0700, -89.4300, 'Madison Near West'], [43.0730, -89.3870, 'Madison downtown condos'],
      [42.9980, -87.8980, 'Milwaukee Bay View'], [43.0400, -87.9050, 'Milwaukee downtown condos'], [44.5133, -88.0133, 'Green Bay'],
      [45.1300, -87.2400, 'Fish Creek (Door County)'], [43.5600, -90.8900, 'Vernon County (rural)'], [44.8113, -91.4985, 'Eau Claire'], [44.9591, -89.6301, 'Wausau']],
  },
  WA: {
    layer: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer/0',
    want: ['OBJECTID', 'FIPS_NR', 'COUNTY_NM', 'PARCEL_ID_NR', 'ORIG_PARCEL_ID', 'SITUS_ADDRESS', 'SUB_ADDRESS', 'SITUS_CITY_NM', 'SITUS_ZIP_NR', 'LANDUSE_CD',
      'ORIG_LANDUSE_CD', 'VALUE_LAND', 'VALUE_BLDG', 'DATA_LINK', 'FILE_DATE'],
    group: [['LANDUSE_CD'], ['COUNTY_NM']],
    codes: ['LANDUSE_CD', 'ORIG_LANDUSE_CD'],
    county: ['COUNTY_NM'],
    spots: [[47.6680, -122.3850, 'Seattle Ballard houses'], [47.6090, -122.3400, 'Seattle downtown condos'], [47.6101, -122.2015, 'Bellevue'],
      [47.2529, -122.4443, 'Tacoma'], [47.6588, -117.4260, 'Spokane'], [45.6387, -122.6615, 'Vancouver'], [46.6021, -120.5059, 'Yakima'],
      [47.0379, -122.9007, 'Olympia'], [48.5343, -123.0171, 'Friday Harbor'], [48.3600, -119.5800, 'Okanogan (rural)']],
  },
};

const BAD = /own|mail|madd|^m(unit|city|state|zip|addr|stname)|legdec|careof|grantee|grantor|buyer|seller|taxpayer/i;

for (const [st, cfg] of Object.entries(STATES)) {
  const out = await page.evaluate(async (cfg, BADsrc) => {
    const BAD = new RegExp(BADsrc, 'i');
    const get = async (u, ms = 30000, body) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
      try { const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: c.signal } : { signal: c.signal });
        const j = await r.json(); return { j, ms: Math.round(performance.now() - t0) }; }
      catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
    const res = {};
    const m = await get(cfg.layer + '?f=json');
    if (!m.j || m.j.error) return { metaErr: m.err || JSON.stringify(m.j.error) };
    const fields = (m.j.fields || []);
    const oidF = m.j.objectIdField || (fields.find((f) => f.type === 'esriFieldTypeOID') || {}).name || 'objectid';
    res.fields = fields.map((f) => `${f.name}:${f.type.replace('esriFieldType', '')}${f.alias && f.alias !== f.name ? `(${f.alias})` : ''}`);
    res.max = m.j.maxRecordCount; res.sr = m.j.extent && m.j.extent.spatialReference; res.adv = m.j.advancedQueryCapabilities;
    const have = new Set(fields.map((f) => f.name)), want = cfg.want.filter((f) => have.has(f) && !BAD.test(f));
    res.asked = want.join(',');
    const countyF = cfg.county.find((f) => have.has(f));
    // statewide: records per county, and the property-type groups
    const stat = async (where, groupBy, ms) => {
      const q = new URLSearchParams({ where, f: 'json', returnGeometry: 'false', groupByFieldsForStatistics: groupBy.join(','), orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oidF, outStatisticFieldName: 'n' }]) });
      const r = await get(cfg.layer + '/query', ms, q.toString());
      if (!r.j || r.j.error) return { err: r.err || JSON.stringify(r.j.error).slice(0, 200), ms: r.ms };
      return { ms: r.ms, rows: (r.j.features || []).map((f) => Object.values(f.attributes).join(' | ')) };
    };
    if (countyF) res.byCounty = await stat('1=1', [countyF], 90000);
    res.groups = {};
    for (const g of cfg.group) if (g.every((f) => have.has(f))) res.groups[g.join('+')] = await stat('1=1', g, 90000);
    res.spots = [];
    for (const [lat, lon, name] of cfg.spots) {
      const spot = { name };
      const base = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', units: 'esriSRUnit_Meter', f: 'json' };
      const near = await get(cfg.layer + '/query', 30000, new URLSearchParams({ ...base, distance: '90', outFields: want.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: '40' }).toString());
      if (!near.j || near.j.error) { spot.err = near.err || JSON.stringify(near.j.error).slice(0, 200); res.spots.push(spot); continue; }
      spot.ms = near.ms;
      const feats = near.j.features || [];
      const area = (g) => { if (!g || !g.rings) return null; let a = 0; for (const ring of g.rings) { for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); }
        const k = 111320 * Math.cos(lat * Math.PI / 180) * 110540; return Math.round(Math.abs(a / 2) * k); };
      const ctr = (g) => { if (!g || !g.rings) return ''; const r0 = g.rings[0]; let x = 0, y = 0; for (const p of r0) { x += p[0]; y += p[1]; } return `${(y / r0.length).toFixed(5)},${(x / r0.length).toFixed(5)}`; };
      spot.recs = feats.map((f) => ({ c: ctr(f.geometry), m2: area(f.geometry), ...Object.fromEntries(Object.entries(f.attributes).filter(([k, v]) => !BAD.test(k) && v !== null && v !== '' && v !== ' ')) }))
        .sort((p, q) => (p.c < q.c ? -1 : p.c > q.c ? 1 : 0));
      spot.n = feats.length;
      res.spots.push(spot);
      // codes used within ~1.5 km
      const env = { geometry: `${lon - 0.018},${lat - 0.0135},${lon + 0.018},${lat + 0.0135}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', returnGeometry: 'false',
        groupByFieldsForStatistics: cfg.codes.filter((f) => have.has(f)).join(','), orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oidF, outStatisticFieldName: 'n' }]) };
      const codes = await get(cfg.layer + '/query', 30000, new URLSearchParams(env).toString());
      spot.codes = codes.j && !codes.j.error ? (codes.j.features || []).slice(0, 40).map((f) => Object.values(f.attributes).join(' | ')) : (codes.err || JSON.stringify(codes.j && codes.j.error).slice(0, 200));
    }
    return res;
  }, cfg, BAD.source);
  log(`==== ${st}  ${cfg.layer}`);
  if (out.metaErr) { log('meta error', out.metaErr); continue; }
  log(`max ${out.max}  sr ${JSON.stringify(out.sr)}`);
  log('fields:', out.fields.join('  '));
  log('asked:', out.asked);
  log('by county:', JSON.stringify(out.byCounty).slice(0, 4000));
  for (const [k, v] of Object.entries(out.groups)) log(`group ${k}:`, JSON.stringify(v).slice(0, 6000));
  for (const s of out.spots) {
    log(`-- ${s.name}: ${s.err || `${s.n} records in ${s.ms} ms`}`);
    for (const r of s.recs || []) log('   ', JSON.stringify(r).slice(0, 700));
    log('   codes within ~1.5 km:', JSON.stringify(s.codes).slice(0, 2500));
  }
}
await browser.close(); srv.close();
