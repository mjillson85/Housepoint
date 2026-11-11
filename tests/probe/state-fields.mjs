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
const js = (v, n) => (JSON.stringify(v ?? null) || '').slice(0, n);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8799/');

// Wisconsin, Washington, Nebraska, Minnesota, New York, DC and Maryland are in git history (November 11, 2026).
// Tier 2 (Colorado, Arkansas, Vermont, Montana, Wyoming, Alaska, Utah's Salt Lake County, Cook County): want 'auto' asks for every field
// except owner, mailing, name, deed and legal fields (AUTO_SKIP below), to learn what each layer holds.
const STATES = {   // Earlier rounds are in git history (November 11, 2026). Round 4: the counties and cities to add, with their codes.
  TX_HARRIS: { layer: 'https://www.gis.hctx.net/arcgishcpid/rest/services/HCAD/Parcels/MapServer/0', want: 'auto', spots: [[29.74, -95.39, 'Houston Montrose'], [29.76, -95.46, 'River Oaks']] },
  TX_TARRANT: { layer: 'https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/MapServer/0', want: 'auto', spots: [[32.71, -97.36, 'Fort Worth Fairmount']] },
  CA_ALAMEDA: { layer: 'https://services5.arcgis.com/ROBnTHSNjoZ2Wm1P/arcgis/rest/services/Parcels/FeatureServer/0', want: 'auto', spots: [[37.87, -122.27, 'Berkeley']] },
  CA_SBD: { layer: 'https://services.arcgis.com/aA3snZwJfFkVyDuP/arcgis/rest/services/Parcels_for_San_Bernardino_County/FeatureServer/0', want: 'auto', spots: [[34.06, -117.18, 'Redlands']] },
  OH_FRANKLIN: { layer: 'https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/0', want: 'auto', spots: [[39.99, -83.01, 'Columbus Short North']] },
  OH_HAMILTON: { layer: 'https://cagisonline.hamilton-co.org/arcgis/rest/services/COUNTYWIDE/Cadastral/MapServer/0', want: 'auto', spots: [[39.13, -84.45, 'Cincinnati Hyde Park']] },
  TN_NASH: { layer: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Parcels_view/FeatureServer/0', want: 'auto', spots: [[36.13, -86.8, 'Nashville Hillsboro']] },
  ND_BIS: { layer: 'https://services1.arcgis.com/XxHmL09eFqJWI0gE/arcgis/rest/services/ParcelsPublic/FeatureServer/0', want: 'auto', spots: [[46.82, -100.77, 'Bismarck homes']] },
  OR_METRO: { layer: 'https://services2.arcgis.com/McQ0OlIABe29rJJy/arcgis/rest/services/Taxlots_with_Right_of_Way_Public/FeatureServer/3', want: 'auto', spots: [[45.52, -122.65, 'Portland']] },
  MO_STLCO: { layer: 'https://services2.arcgis.com/w657bnjzrjguNyOy/arcgis/rest/services/Pardata_JurisFeb2024/FeatureServer/5', want: 'auto', spots: [[38.63, -90.35, 'Clayton']] },
  ID_ADA: { layer: 'https://services2.arcgis.com/dgGjZc6xAH5m5JyP/arcgis/rest/services/Parcels/FeatureServer/5', want: 'auto', spots: [[43.615, -116.2, 'Boise']] },
  MI_MACOMB: { layer: 'https://services6.arcgis.com/K0qS4r8AEJxrE8em/arcgis/rest/services/Macomb_County_Parcel_Data/FeatureServer/10', want: 'auto', spots: [[42.58, -82.92, 'Mount Clemens']] },
  MI_OAKLAND: { layer: 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1', want: 'auto', spots: [[42.49, -83.14, 'Royal Oak']] },
  KS_WICHITA: { layer: 'https://gismaps.wichita.gov/ageweb/rest/services/COWGIS/Property_and_Location/MapServer/4', want: 'auto', spots: [[37.69, -97.3, 'Wichita College Hill']] },
  GA_ATL: { layer: 'https://gis.atlantaga.gov/dpcd/rest/services/AdministrativeArea/TaxParcel/MapServer/0', want: 'auto', spots: [[33.78, -84.36, 'Atlanta Virginia-Highland']] },
  AZ_MARICOPA: { layer: 'https://gis.maricopa.gov/arcgis/rest/services/IndividualService/Parcel/MapServer/1', want: 'auto', spots: [[33.5, -112.05, 'Phoenix'], [33.42, -111.93, 'Tempe']] },
  ME: { layer: 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/10', want: 'auto', spots: [[43.66, -70.26, 'Portland ME']] },
  ME_ADB: { layer: 'https://services1.arcgis.com/RbMX0mRVOFNTdLzd/arcgis/rest/services/Maine_Parcels_Organized_Towns/FeatureServer/9', want: 'auto', spots: [] },
};
// In 'auto' mode: besides BAD, any field that could hold a person's name, a deed reference or a legal description.
// (also "original" and "unmodified" copies of a record, which can hold the owner's name and mailing address: Alabama's do)
const AUTO_SKIP = /name|nam\d|nm\d|party|person|phone|email|contact|grant|deed|book|page|instr|legaldesc|^descr?(iption)?$|careof|^c_?o$|attn|^addr(ess)?[12]$|shape|globalid|orig|unmod|raw|json|own|mail|legal|lgl|user|editor|creat|signed|comment|addr_line/i;
const BAD = /(?<!t)own|mail|madd|^m(unit|city|state|zip|addr|stname)|legdec|legal|careof|grantee|grantor|grntnam|namekey|mortg|po_box|tax_name|tax_add|^address\d|citystzip|asrname|nys_name|buyer|seller|taxpayer/i;

for (const [st, cfg] of Object.entries(STATES)) {
  const out = await page.evaluate(async (cfg, BADsrc, AUTOsrc) => {
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
    const AUTO = new RegExp(AUTOsrc, 'i');
    const have = new Set(fields.map((f) => f.name));
    // a field is skipped when its name or its alias looks like an owner, mailing, name, deed or legal field ("ADDRGL1" is Vermont's
    // "Mailing Address 1")
    const alias = Object.fromEntries(fields.map((f) => [f.name, f.alias || '']));
    const ok = (f) => !BAD.test(f) && !BAD.test(alias[f] || '') && !/mailing|owner|taxpayer|grantee|grantor/i.test(alias[f] || '');
    // auto: only fields that look like property facts (values, sizes, years, types, the property's own address), never a bare
    // "address" or "line 2" (Bexar's addr_line2 is the owner's mailing address) or anything signed by a person
    const FACT = /val|appr|mkt|market|land|impr|imps|bldg|bld|build|year|yr|built|sqft|area|acre|class|cls|use|luc|type|situs|site|prop|city|zip|unit|room|bed|bath|stor|sale|price|tax|county|parcel|pin|apn|acct|account|^id$|_id$|link|url|web/i;
    const NOT_FACT = /addr_?line|line ?[12]|mail|own|signed|comment|note|contact|name/i;
    const want = (cfg.want === 'auto' ? fields.map((f) => f.name).filter((f) => !AUTO.test(f) && !AUTO.test(alias[f] || '') && FACT.test(f) && !NOT_FACT.test(f) && !NOT_FACT.test(alias[f] || '')) : cfg.want).filter((f) => have.has(f) && ok(f));
    res.asked = want.join(',');
    // auto: the property-type fields (use, class or type, not zoning), grouped statewide and near each spot
    const codeF = cfg.want === 'auto' ? want.filter((f) => /use|class|type|cls/i.test(f) && !/zon|exempt|const|area|acre/i.test(f)).slice(0, 3) : cfg.codes || [];
    if (cfg.want === 'auto') { cfg.codes = codeF; cfg.group = codeF.map((f) => [f]); }
    const countyF = (cfg.county || []).find((f) => have.has(f));
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
    for (const g of cfg.group || []) if (g.every((f) => have.has(f))) res.groups[g.join('+')] = await stat('1=1', g, 90000);
    res.spots = [];
    for (const [lat, lon, name] of cfg.spots) {
      const spot = { name };
      const base = { geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', units: 'esriSRUnit_Meter', f: 'json' };
      const near = await get(cfg.layer + '/query', 30000, new URLSearchParams({ ...base, distance: '90', outFields: want.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: cfg.want === 'auto' ? '12' : '40' }).toString());
      if (!near.j || near.j.error) { spot.err = near.err || JSON.stringify(near.j.error).slice(0, 200); res.spots.push(spot); continue; }
      spot.ms = near.ms;
      const feats = near.j.features || [];
      const area = (g) => { if (!g || !g.rings) return null; let a = 0; for (const ring of g.rings) { for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); }
        const k = 111320 * Math.cos(lat * Math.PI / 180) * 110540; return Math.round(Math.abs(a / 2) * k); };
      const ctr = (g) => { if (!g || !g.rings) return ''; const r0 = g.rings[0]; let x = 0, y = 0; for (const p of r0) { x += p[0]; y += p[1]; } return `${(y / r0.length).toFixed(5)},${(x / r0.length).toFixed(5)}`; };
      spot.recs = feats.map((f) => ({ c: ctr(f.geometry), m2: area(f.geometry), ...Object.fromEntries(Object.entries(f.attributes).filter(([k, v]) => want.includes(k) && ok(k) && v !== null && v !== '' && v !== ' ')) }))
        .sort((p, q) => (p.c < q.c ? -1 : p.c > q.c ? 1 : 0));
      spot.n = feats.length;
      res.spots.push(spot);
      // codes used within ~1.5 km
      const env = { geometry: `${lon - 0.018},${lat - 0.0135},${lon + 0.018},${lat + 0.0135}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', returnGeometry: 'false',
        groupByFieldsForStatistics: (cfg.codes || []).filter((f) => have.has(f)).join(','), orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oidF, outStatisticFieldName: 'n' }]) };
      if (!(cfg.codes || []).some((f) => have.has(f))) continue;
      const codes = await get(cfg.layer + '/query', 30000, new URLSearchParams(env).toString());
      spot.codes = codes.j && !codes.j.error ? (codes.j.features || []).slice(0, 40).map((f) => Object.values(f.attributes).join(' | ')) : (codes.err || JSON.stringify(codes.j && codes.j.error).slice(0, 200));
    }
    return res;
  }, cfg, BAD.source, AUTO_SKIP.source);
  log(`==== ${st}  ${cfg.layer}`);
  if (out.metaErr) { log('meta error', out.metaErr); continue; }
  log(`max ${out.max}  sr ${JSON.stringify(out.sr)}`);
  log('fields:', out.fields.join('  '));
  log('asked:', out.asked);
  log('by county:', js(out.byCounty || null, 4000));
  for (const [k, v] of Object.entries(out.groups)) log(`group ${k}:`, js(v, 6000));
  for (const s of out.spots) {
    log(`-- ${s.name}: ${s.err || `${s.n} records in ${s.ms} ms`}`);
    for (const r of s.recs || []) log('   ', js(r, 700));
    log('   codes within ~1.5 km:', js(s.codes, 2500));
  }
}
await browser.close(); srv.close();
