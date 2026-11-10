// Captures real parcel records from the four states' public services into tests/fixtures/real-<state>.json, for
// test_real.mjs. It runs on GitHub (the capture workflow), which can reach the services; nothing here runs in the normal tests.
//
// What it takes: around a set of sample spots in each state (downtowns, suburbs, the countryside, the shore), every lot,
// then a spread of them: one or two of each kind of lot (its use codes and how many records it holds), plus a few named
// lots that have shown problems. Only the fields the app itself asks for are requested, found the way the app finds them
// (the app's own service lookup, in a browser), so owner names are never fetched.
//
//   cd tests && node capture/capture.mjs [MA CT NJ FL]
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const OUT = `${ROOT}/tests/fixtures`;
const html = fs.readFileSync(`${ROOT}/index.html`);
const PORT = 8799;
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Sample spots: [name, lat, lon, radius in meters]
const SPOTS = {
  MA: [['Dedham Square', 42.2493, -71.1752, 350], ['Boston Back Bay', 42.3505, -71.0810, 250], ['Boston Downtown', 42.3555, -71.0605, 250],
    ['Cambridge Central Sq', 42.3650, -71.1035, 300], ['Holbrook center', 42.1550, -71.0090, 450], ['Hyannis', 41.6528, -70.2830, 400],
    ['Springfield downtown', 42.1015, -72.5898, 350], ['Worcester Canal District', 42.2585, -71.7980, 350], ['Hawley (rural)', 42.5800, -72.8900, 1500],
    ['Plymouth (shore, parks)', 41.9050, -70.6300, 900], ['Nantucket town', 41.2835, -70.0995, 350]],
  CT: [['Hartford downtown', 41.7637, -72.6851, 350], ['Greenwich Ave', 41.0262, -73.6282, 350], ['New Haven', 41.3083, -72.9279, 350],
    ['Storrs (Mansfield)', 41.8077, -72.2495, 700], ['Salisbury (rural)', 41.9834, -73.4215, 1200], ['Stamford', 41.0534, -73.5387, 350]],
  NJ: [['Hoboken', 40.7440, -74.0324, 300], ['Newark downtown', 40.7357, -74.1724, 350], ['Princeton', 40.3487, -74.6590, 400],
    ['Cape May', 38.9351, -74.9060, 400], ['Sussex County (rural)', 41.1590, -74.7380, 1500], ['Hammonton (farms)', 39.6365, -74.8024, 1200]],
  FL: [['Miami Brickell', 25.7617, -80.1918, 250], ['West Palm Beach', 26.7153, -80.0534, 350], ['Tequesta', 26.9662, -80.1040, 500],
    ['Tampa downtown', 27.9506, -82.4572, 300], ['Okeechobee (rural)', 27.2439, -80.8298, 1500], ['The Villages', 28.9005, -81.9750, 500]],
};
// Lots that have shown problems on Matt's walks, found by their MassGIS LOC_ID through the state's own server (indexed there).
const NAMED = { MA: [['47-49 River St, Dedham (commercial condo, land and master records)', 'F_751960_2913839'], ['6 Mosesso Dr, Holbrook', 'F_792474_2883742']] };
const MA_STATE_PARCELS = 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/MassachusettsPropertyTaxParcels/FeatureServer/1';
const PER_STATE = 120, PER_KIND = 2, MAX_RECS = 80;

async function getJSON(url, body, ms = 60000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: ctl.signal } : { signal: ctl.signal });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'service error');
      return j;
    } catch (e) { log('  retry', attempt + 1, String(e.message || e).slice(0, 120)); await sleep(2000 * (attempt + 1)); }
    finally { clearTimeout(t); }
  }
  throw new Error('gave up: ' + url.slice(0, 120));
}
// The app's way of grouping stacked records that have no lot id (Connecticut, New Jersey, Florida): identical outlines.
function shapeHash(rings) {
  let h = 5381;
  for (const r of rings) for (const [x, y] of r) { const t = `${x.toFixed(6)},${y.toFixed(6)};`; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36) + '.' + rings.reduce((n, r) => n + r.length, 0);
}
const OWNERISH = /(^|_)OWN|OWNER|MAIL|^NAME|_NAME1|TAXPAYER/i, KEEP_NAME = /^(MUN_NAME|Town_Name)$/i;   // TOWN_ID is fine

async function main() {
  const states = process.argv.slice(2).length ? process.argv.slice(2) : ['MA', 'CT', 'NJ', 'FL'];
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  fs.mkdirSync(OUT, { recursive: true });
  for (const st of states) { try { await captureState(page, st); } catch (e) { log(st, 'FAILED:', e.message); process.exitCode = 1; } }
  await browser.close(); srv.close();
}
async function captureState(page, st) {
  {
    log(st, 'finding the service the way the app does');
    const sv = await page.evaluate(async (id) => { const hp = window.__hp; await hp.initService(hp.REGIONS[id]); const s = hp.SVC[id];
      return { layerUrl: s.layerUrl, outFields: s.outFields, oid: s.oid, pageSize: s.pageSize, canon: [...s.canon.entries()] }; }, st);
    const bad = sv.outFields.filter((f) => OWNERISH.test(f) && !KEEP_NAME.test(f));
    if (bad.length) throw new Error(`${st}: the app asks for owner-like fields ${bad.join(', ')}; stopping`);
    const meta = await getJSON(sv.layerUrl + '?f=json');
    const fields = (meta.fields || []).filter((f) => sv.outFields.includes(f.name) || f.name === meta.objectIdField).map((f) => ({ name: f.name, type: f.type }));
    const lotKey = (ft) => { const id = ft.attributes && (ft.attributes.LOC_ID || ft.attributes.loc_id); return id ? `id:${id}` : `shape:${shapeHash(ft.geometry.rings)}`; };
    const outFields = [...new Set([...sv.outFields, meta.objectIdField].filter(Boolean))].join(',');
    const ask = (geom, extra = {}) => {
      const p = new URLSearchParams({ outFields, returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', maxAllowableOffset: '0.000004', f: 'json', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', resultRecordCount: String(sv.pageSize || 1000), ...geom, ...extra });
      if (sv.oid) p.set('orderByFields', sv.oid);
      return p;
    };
    const fetchAll = async (geom, pages = 4) => {
      const feats = [];
      for (let i = 0, off = 0; i < pages; i++) {
        const j = await getJSON(sv.layerUrl + '/query', ask(geom, { resultOffset: String(off) }).toString());
        const got = (j.features || []).filter((f) => f.geometry && f.geometry.rings && f.geometry.rings.length);
        feats.push(...got); off += (j.features || []).length;
        if (!j.exceededTransferLimit || !(j.features || []).length) break;
      }
      return feats;
    };
    const useCode = (a) => { const k = sv.canon.find(([c]) => c === 'USE_CODE'); return k ? String(a[k[1]] ?? '').trim() : ''; };
    const useDesc = (a) => { const k = sv.canon.find(([c]) => c === 'USE_DESC'); return k ? String(a[k[1]] ?? '').trim() : ''; };
    const qual = (a) => { const k = sv.canon.find(([c]) => c === 'QCODE'); return k ? String(a[k[1]] ?? '').trim() : ''; };
    const kindOf = (a) => st === 'MA' ? (String(useCode(a)).replace(/\D/g, '').slice(0, 3) || '?')
      : st === 'CT' ? (useDesc(a).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim() || '?')
      : st === 'NJ' ? `${useCode(a).toUpperCase() || '?'}${/^C/i.test(qual(a)) ? 'C' : ''}`
      : String(parseInt(String(useCode(a)).replace(/\D/g, '') || 'x', 10));
    const signature = (feats) => { const ks = [...new Set(feats.map((f) => kindOf(f.attributes)))].sort();
      const n = feats.length; return `${ks.join('+')}|${n === 1 ? '1' : n <= 4 ? '2-4' : n <= 20 ? '5-20' : '21+'}`; };

    const chosen = new Map();     // lot key -> { spot, sig, feats }
    const bySig = new Map();
    for (const [name, lat, lon, m] of SPOTS[st]) {
      log(st, name);
      let feats;
      try { feats = await fetchAll({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', distance: String(m), units: 'esriSRUnit_Meter' }); }
      catch (e) { log('  skipped:', e.message); continue; }
      const lots = new Map();
      for (const f of feats) { const k = lotKey(f); if (!lots.has(k)) lots.set(k, []); lots.get(k).push(f); }
      log(`  ${feats.length} records on ${lots.size} lots`);
      // At most PER_KIND lots of each kind across the whole state
      const list = [...lots.entries()].map(([k, fs]) => ({ k, fs, sig: signature(fs) }));
      for (const x of list) { if (chosen.has(x.k)) continue; const n = bySig.get(x.sig) || 0; if (n >= PER_KIND) continue;
        bySig.set(x.sig, n + 1); chosen.set(x.k, { spot: name, sig: x.sig, feats: x.fs }); }
    }
    // Named lots (Massachusetts): the outline from the state's own server, then everything the app's layer has on that lot
    for (const [label, id] of NAMED[st] || []) {
      try {
        const j = await getJSON(`${MA_STATE_PARCELS}/query?` + new URLSearchParams({ where: `LOC_ID = '${id}'`, outFields: 'LOC_ID', returnGeometry: 'true', outSR: '4326', f: 'json' }));
        const g = j.features && j.features[0] && j.features[0].geometry; if (!g) { log('  named lot not found', id); continue; }
        const xs = g.rings.flat().map((p) => p[0]), ys = g.rings.flat().map((p) => p[1]);
        const env = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;
        const feats = (await fetchAll({ geometry: env, geometryType: 'esriGeometryEnvelope' }, 2)).filter((f) => lotKey(f) === `id:${id}`);
        if (feats.length) chosen.set(`id:${id}`, { spot: label, sig: signature(feats), feats, named: true });
        log('  named:', label, feats.length, 'records');
      } catch (e) { log('  named lot failed', id, e.message); }
    }
    // Keep the named lots, then the most varied: one of every kind before a second of any
    let lots = [...chosen.entries()];
    const named = lots.filter(([, v]) => v.named), rest = lots.filter(([, v]) => !v.named);
    const firsts = [], seconds = [], seen = new Set();
    for (const x of rest) (seen.has(x[1].sig) ? seconds : (seen.add(x[1].sig), firsts)).push(x);
    lots = [...named, ...firsts, ...seconds].slice(0, PER_STATE);
    // Each kept lot again, by its own outline, so a lot cut off at the edge of a spot comes back whole
    const outLots = [];
    for (const [k, v] of lots) {
      let feats = v.feats;
      if (!v.named) {
        try {
          const g = feats[0].geometry, xs = g.rings.flat().map((p) => p[0]), ys = g.rings.flat().map((p) => p[1]);
          const env = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`;
          const again = (await fetchAll({ geometry: env, geometryType: 'esriGeometryEnvelope' }, 3)).filter((f) => lotKey(f) === k);
          if (again.length >= feats.length) feats = again;
        } catch (e) { log('  re-fetch failed, keeping the first copy', k); }
      }
      const total = feats.length;
      feats = feats.slice(0, MAX_RECS).map((f) => {
        const a = {}; for (const [n, val] of Object.entries(f.attributes || {})) if (!(OWNERISH.test(n) && !KEEP_NAME.test(n))) a[n] = val;
        // A huge outline (a river, a highway, a county forest) becomes its bounding box: it's never a house, and it keeps the files small.
        let rings = f.geometry.rings;
        if (rings.reduce((n, r) => n + r.length, 0) > 1500) {
          const xs = rings.flat().map((q) => q[0]), ys = rings.flat().map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          rings = [[[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]];
        }
        return { attributes: a, geometry: { rings } };
      });
      const r0 = feats[0].geometry.rings[0], lon = r0.reduce((s, p) => s + p[0], 0) / r0.length, lat = r0.reduce((s, p) => s + p[1], 0) / r0.length;
      outLots.push({ key: k, spot: v.spot, kind: signature(feats), named: !!v.named, records: total, truncated: total > feats.length, lat: +lat.toFixed(6), lon: +lon.toFixed(6), features: feats });
    }
    const file = { state: st, captured: new Date().toISOString().slice(0, 10), service: sv.layerUrl, objectIdField: meta.objectIdField || null,
      maxRecordCount: meta.maxRecordCount || 1000, fields, lots: outLots };
    fs.writeFileSync(`${OUT}/real-${st}.json`, JSON.stringify(file));
    log(st, `saved ${outLots.length} lots (${outLots.reduce((n, l) => n + l.features.length, 0)} records), ${new Set(outLots.map((l) => l.kind)).size} kinds`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
