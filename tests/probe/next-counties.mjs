// Before LA County, Philadelphia, Allegheny County, Travis and Bexar are added: the last questions about their layers, from a real
// browser page (as the phone asks, so the cross-site rules are tested too). Every query names its fields: only property fields
// (ids, situs addresses, property types, values, sizes, years) are ever asked for or printed. Run by the "probe services" workflow.
//   cd tests && node probe/next-counties.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import { isOwnerish } from '../owner-fields.mjs';

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>probe</title>'); }).listen(8797);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8797/');
const js = (v, n = 700) => (JSON.stringify(v ?? null) || '').slice(0, n);

// The fields each layer may be asked for (checked against the shared owner list before anything runs)
const ASK = {
  LA: ['APN', 'SitusAddress', 'SitusCity', 'SitusZIP', 'UseCode', 'UseDescription', 'UseType', 'YearBuilt1', 'Units1', 'Bedrooms1', 'Bathrooms1', 'SQFTmain1',
    'Roll_Year', 'Roll_LandValue', 'Roll_ImpValue'],
  PHL: ['parcelid', 'brt_id', 'num_brt', 'num_accounts', 'address', 'bldg_desc', 'pin'],
  OPA: ['parcel_number', 'pin', 'location', 'unit', 'zip_code', 'category_code_description', 'building_code_description', 'market_value', 'taxable_land',
    'taxable_building', 'exempt_land', 'exempt_building', 'year_built', 'total_livable_area', 'number_of_bedrooms', 'number_of_bathrooms', 'number_stories',
    'sale_date', 'sale_price', 'total_area'],
  ALLE: ['PARID', 'PROPERTYHOUSENUM', 'PROPERTYFRACTION', 'PROPERTYADDRESS', 'PROPERTYCITY', 'PROPERTYZIP', 'MUNIDESC', 'CLASSDESC', 'USEDESC', 'SALEDATE',
    'SALEPRICE', 'FAIRMARKETTOTAL', 'FAIRMARKETLAND', 'FAIRMARKETBUILDING', 'YEARBLT', 'FINISHEDLIVINGAREA', 'BEDROOMS', 'FULLBATHS', 'HALFBATHS', 'STORIES',
    'STYLEDESC', 'LOTAREA', 'CONDITIONDESC', 'GRADEDESC'],
  BEXAR: ['PropID', 'Situs', 'State_cd', 'PropUse', 'Roll', 'LandVal', 'ImprVal', 'TotVal', 'YrBlt', 'GBA', 'TOT_GBA', 'Stories', 'NumRooms', 'Acres'],
  TRAVIS: ['PROP_ID', 'situs_num', 'situs_street_prefx', 'situs_street', 'situs_street_suffix', 'situs_city', 'situs_zip', 'land_state_cd', 'land_type_desc',
    'F1year_imprv', 'market_value', 'appraised_val', 'assessed_val', 'hyperlink'],
};
for (const [k, fs] of Object.entries(ASK)) for (const f of fs) if (isOwnerish(f)) { console.log(`STOP: ${k}.${f} is on the owner list`); process.exit(1); }

const out = await page.evaluate(async (ASK) => {
  const get = async (u, ms = 30000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms), t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); const j = await r.json(); return { status: r.status, j, ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const jsonp = (u, ms = 20000) => new Promise((res) => { const cb = `cb${Math.random().toString(36).slice(2)}`, s = document.createElement('script'), t0 = performance.now();
    const done = (v) => { clearTimeout(t); delete window[cb]; s.remove(); res({ ...v, ms: Math.round(performance.now() - t0) }); };
    const t = setTimeout(() => done({ err: 'timeout' }), ms);
    window[cb] = (j) => done({ j }); s.onerror = () => done({ err: 'script error' }); s.src = `${u}${u.includes('?') ? '&' : '?'}callback=${cb}`; document.head.appendChild(s); });
  const near = (layer, lat, lon, fields, radius = 60, extra = {}) => get(`${layer}/query?${new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: String(radius), units: 'esriSRUnit_Meter', outFields: fields.join(','), returnGeometry: 'true',
    outSR: '4326', geometryPrecision: '6', f: 'json', ...extra })}`);
  const where = (layer, w, fields, extra = {}) => get(`${layer}/query?${new URLSearchParams({ where: w, outFields: fields.join(','), returnGeometry: 'false', f: 'json', ...extra })}`);
  const groups = (layer, by, oid = 'OBJECTID') => get(`${layer}/query?${new URLSearchParams({ where: '1=1', returnGeometry: 'false', f: 'json', groupByFieldsForStatistics: by,
    orderByFields: 'n DESC', outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oid, outStatisticFieldName: 'n' }]) })}`);
  const pick = (a, fs) => Object.fromEntries(fs.filter((f) => a && a[f] != null && a[f] !== '').map((f) => [f, a[f]]));
  const shapes = (feats) => new Set(feats.map((f) => JSON.stringify(f.geometry && f.geometry.rings && f.geometry.rings[0] && f.geometry.rings[0].slice(0, 4)))).size;
  const res = {};

  // LA County: condo towers (are the units stacked on one shape, is the unit in the address), a typed address, a hillside lot
  const LA = 'https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/333';
  res.la = {};
  for (const [lat, lon, name] of [[34.0590, -118.4440, 'Westwood condos'], [34.0870, -118.3770, 'West Hollywood condos'], [34.1380, -118.3500, 'Studio City hillside']]) {
    const r = await near(LA, lat, lon, ASK.LA, 50);
    const fs = (r.j && r.j.features) || [];
    res.la[name] = r.j ? { ms: r.ms, n: fs.length, shapes: shapes(fs), exceeded: !!r.j.exceededTransferLimit, err: r.j.error && JSON.stringify(r.j.error).slice(0, 200),
      rows: fs.slice(0, 8).map((f) => pick(f.attributes, ASK.LA)) } : { err: r.err, ms: r.ms };
  }
  const la1 = await where(LA, "SitusAddress = '1317 MAPLE AVE' AND SitusCity LIKE 'TORRANCE%'", ['APN', 'SitusAddress', 'SitusCity']);
  res.la.addr = la1.j ? { ms: la1.ms, rows: (la1.j.features || []).map((f) => f.attributes), err: la1.j.error && JSON.stringify(la1.j.error).slice(0, 200) } : { err: la1.err };
  const la2 = await where(LA, "UPPER(SitusAddress) LIKE '1317 MAPLE%'", ['APN', 'SitusAddress', 'SitusCity']);
  res.la.addrLike = la2.j ? { ms: la2.ms, n: (la2.j.features || []).length, err: la2.j.error && JSON.stringify(la2.j.error).slice(0, 200) } : { err: la2.err };

  // Philadelphia: a condo building's water-department parcel, and how its units are found on the property office's table
  const PWD = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/PWD_PARCELS/FeatureServer/0';
  const CARTO = 'https://phl.carto.com/api/v2/sql?q=';
  const opa = (w, n = 40) => get(CARTO + encodeURIComponent(`SELECT ${ASK.OPA.join(', ')} FROM opa_properties_public WHERE ${w} LIMIT ${n}`));
  res.phl = {};
  for (const [lat, lon, name] of [[39.9493, -75.1707, 'Rittenhouse condo tower'], [40.0350, -75.2150, 'Roxborough'], [39.9690, -75.1340, 'Northern Liberties']]) {
    const r = await near(PWD, lat, lon, ASK.PHL, 40);
    const fs = (r.j && r.j.features) || [];
    const lots = fs.map((f) => pick(f.attributes, ASK.PHL));
    const ids = [...new Set(lots.map((l) => l.brt_id).filter(Boolean))], adds = [...new Set(lots.filter((l) => l.num_accounts > 1 || l.num_brt > 1).map((l) => l.address).filter(Boolean))];
    const q = (xs) => xs.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',');
    const byId = ids.length ? await opa(`parcel_number IN (${q(ids)})`, 100) : null;
    const byAddr = adds.length ? await opa(`location IN (${q(adds)})`, 200) : null;
    const pins = [...new Set(lots.map((l) => l.pin).filter(Boolean))];
    const byPin = pins.length ? await opa(`pin IN (${pins.join(',')})`, 200) : null;
    res.phl[name] = { ms: r.ms, n: fs.length, lots: lots.slice(0, 10),
      byId: byId && (byId.j && byId.j.rows ? { ms: byId.ms, n: byId.j.rows.length, matched: ids.filter((i) => byId.j.rows.some((x) => x.parcel_number === i)).length, of: ids.length } : { err: byId.err || js(byId.j) }),
      byAddr: byAddr && (byAddr.j && byAddr.j.rows ? { ms: byAddr.ms, n: byAddr.j.rows.length, rows: byAddr.j.rows.slice(0, 6) } : { err: byAddr.err || js(byAddr.j) }),
      byPin: byPin && (byPin.j && byPin.j.rows ? { ms: byPin.ms, n: byPin.j.rows.length, of: pins.length } : { err: byPin.err || js(byPin.j) }) };
  }
  // a big IN list, as a dense map asks
  const many = await get(CARTO + encodeURIComponent('SELECT parcel_number FROM opa_properties_public WHERE zip_code = \'19128\' LIMIT 300'));
  if (many.j && many.j.rows) { const ids = many.j.rows.map((x) => `'${x.parcel_number}'`).join(','); const r = await opa(`parcel_number IN (${ids})`, 300);
    res.phl.bigIn = r.j && r.j.rows ? { ms: r.ms, n: r.j.rows.length } : { err: r.err || js(r.j) }; }
  // Carto as a POST (a long IN list can pass a URL's length)
  try { const t0 = performance.now(); const r = await fetch('https://phl.carto.com/api/v2/sql', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q: "SELECT parcel_number, market_value FROM opa_properties_public WHERE parcel_number IN ('213269100','213269420')" }).toString() });
    const j = await r.json(); res.phl.post = { status: r.status, ms: Math.round(performance.now() - t0), n: j.rows && j.rows.length }; } catch (e) { res.phl.post = { err: String(e) }; }

  // Allegheny County: the assessments on the WPRDC (CKAN) by a browser fetch, and by JSONP
  const RID = '65855e14-549e-4992-b5be-d629afc676fa', W = 'https://data.wprdc.org/api/3/action';
  const f1 = await get(`${W}/datastore_search?resource_id=${RID}&limit=0`);
  res.alle = { fetch: f1.j ? { status: f1.status, ms: f1.ms, cols: f1.j.result && f1.j.result.fields.map((f) => f.id).join(' ') } : { err: f1.err, ms: f1.ms } };
  const p1 = await jsonp(`${W}/datastore_search?resource_id=${RID}&limit=0`);
  res.alle.jsonp = p1.j ? { ms: p1.ms, ok: p1.j.success, cols: p1.j.result && p1.j.result.fields.map((f) => f.id).join(' ') } : { err: p1.err, ms: p1.ms };
  const sql = `SELECT ${ASK.ALLE.map((c) => `"${c}"`).join(',')} FROM "${RID}" WHERE "PARID" IN ('0141P00376000000','0141N00057000000','0141N00052000000','0027S00150000003')`;
  const p2 = await jsonp(`${W}/datastore_search_sql?sql=${encodeURIComponent(sql)}`);
  res.alle.sqlJsonp = p2.j ? { ms: p2.ms, ok: p2.j.success, rows: p2.j.result && p2.j.result.records, err: p2.j.error && js(p2.j.error, 300) } : { err: p2.err, ms: p2.ms };
  const f2 = await get(`${W}/datastore_search_sql?sql=${encodeURIComponent(sql)}`);
  res.alle.sqlFetch = f2.j ? { status: f2.status, ms: f2.ms, n: f2.j.result && f2.j.result.records.length } : { err: f2.err, ms: f2.ms };
  // and any county ArcGIS layer with the assessments on the lots
  for (const u of ['https://gisdata.alleghenycounty.us/arcgis/rest/services/OPENDATA?f=json', 'https://gisdata.alleghenycounty.us/arcgis/rest/services?f=json']) {
    const r = await get(u); res.alle[u.includes('OPENDATA') ? 'opendata' : 'root'] = r.j ? js({ services: r.j.services, layers: (r.j.layers || []).map((l) => l.name), folders: r.j.folders }, 1500) : r.err;
  }

  // Bexar: the state property class, the roll year, building sizes; a condo area
  const BX = 'https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0';
  res.bexar = {};
  for (const by of ['Roll', 'State_cd']) { const r = await groups(BX, by); res.bexar[by] = r.j && r.j.features ? r.j.features.slice(0, 40).map((f) => `${f.attributes[by]} | ${f.attributes.n}`) : (r.err || js(r.j, 300)); }
  for (const [lat, lon, name] of [[29.4870, -98.4650, 'Alamo Heights'], [29.4425, -98.4805, 'Pearl condos'], [29.5600, -98.5900, 'Northwest suburb']]) {
    const r = await near(BX, lat, lon, ASK.BEXAR, 50);
    const fs = (r.j && r.j.features) || [];
    res.bexar[name] = { ms: r.ms, n: fs.length, shapes: shapes(fs), rows: fs.slice(0, 8).map((f) => pick(f.attributes, ASK.BEXAR)), err: r.err || (r.j && r.j.error && js(r.j.error, 200)) };
  }
  const bxa = await where(BX, "Situs LIKE '143 WILDROSE%'", ['PropID', 'Situs']);
  res.bexar.addr = bxa.j ? { ms: bxa.ms, rows: (bxa.j.features || []).map((f) => f.attributes), err: bxa.j.error && js(bxa.j.error, 200) } : { err: bxa.err };

  // Travis: every field name (for a tax year), a downtown condo tower, an address
  const TR = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD/MapServer/0';
  const tm = await get(`${TR}?f=json`);
  res.travis = { fields: tm.j && (tm.j.fields || []).map((f) => f.name).join(' '), max: tm.j && tm.j.maxRecordCount };
  for (const [lat, lon, name] of [[30.2655, -97.7460, 'Downtown condos'], [30.2470, -97.7700, 'Zilker'], [30.4400, -97.6900, 'Pflugerville edge']]) {
    const r = await near(TR, lat, lon, ASK.TRAVIS, 50);
    const fs = (r.j && r.j.features) || [];
    res.travis[name] = { ms: r.ms, n: fs.length, shapes: shapes(fs), rows: fs.slice(0, 8).map((f) => pick(f.attributes, ASK.TRAVIS)), err: r.err || (r.j && r.j.error && js(r.j.error, 200)) };
  }
  const tra = await where(TR, "situs_num = '4205' AND situs_street LIKE 'AVENUE H%'", ['PROP_ID', 'situs_num', 'situs_street']);
  res.travis.addr = tra.j ? { ms: tra.ms, rows: (tra.j.features || []).map((f) => f.attributes), err: tra.j.error && js(tra.j.error, 200) } : { err: tra.err };
  for (const by of ['land_state_cd']) { const r = await groups(TR, by); res.travis[by] = r.j && r.j.features ? r.j.features.slice(0, 50).map((f) => `${f.attributes[by]} | ${f.attributes.n}`) : (r.err || js(r.j, 300)); }
  return res;
}, ASK);

const show = (title, o) => { console.log(`==== ${title}`); for (const [k, v] of Object.entries(o)) {
  if (v && Array.isArray(v.rows)) { const { rows, ...rest } = v; console.log(`-- ${k}:`, js(rest, 400)); for (const r of rows) console.log('   ', js(r)); }
  else if (v && Array.isArray(v.lots)) { const { lots, ...rest } = v; console.log(`-- ${k}:`, js(rest, 1500)); for (const r of lots) console.log('   ', js(r)); }
  else console.log(`-- ${k}:`, js(v, 2500)); } };
show('LA County (GISNET 333)', out.la);
show('Philadelphia (PWD parcels + OPA on Carto)', out.phl);
show('Allegheny County (WPRDC assessments)', out.alle);
show('Bexar (maps.bexar.org)', out.bexar);
show('Travis (TCAD MapServer)', out.travis);
await browser.close(); srv.close();
