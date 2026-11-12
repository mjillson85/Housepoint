// Tries the services behind "Thinking of buying?" from a real browser (on GitHub, which can reach them), and logs what each
// one answers, so a section that doesn't load on the phone can be traced. Run by the "probe services" workflow; nothing is saved.
//   cd tests && node probe/services.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8797);
const log = (...a) => console.log(...a);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (/error|warn/i.test(m.type())) log('  [page]', m.text().slice(0, 300)); });
await page.goto('http://localhost:8797/');

// 1. Each school and district service, raw: does it answer, from a page (as the phone asks, with its cross-site rules)?
const raw = await page.evaluate(async () => {
  const hp = window.__hp, out = [];
  for (const u of [...hp.SCHOOL_SVCS, ...hp.DISTRICT_SVCS]) {
    const t0 = performance.now();
    try {
      const r = await fetch(u + '?f=json'); const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* not json */ }
      out.push({ u, ms: Math.round(performance.now() - t0), status: r.status, err: j && j.error ? JSON.stringify(j.error).slice(0, 200) : j ? null : 'not JSON: ' + txt.slice(0, 120),
        layers: j && j.layers ? j.layers.map((l) => `${l.id}:${l.name}:${l.geometryType || ''}`).slice(0, 6) : null });
    } catch (e) { out.push({ u, ms: Math.round(performance.now() - t0), fetchError: String(e) }); }
  }
  return out;
});
log('== school and district services, asked from a web page');
for (const r of raw) log(JSON.stringify(r));

// 2. The app's own lookups, for Boston's Back Bay and Holbrook
for (const [name, lat, lon] of [['Boston Back Bay', 42.3505, -71.0810], ['Holbrook', 42.1606, -70.9959]]) {
  log(`== the app's lookups at ${name}`);
  const r = await page.evaluate(async (lat, lon) => {
    const hp = window.__hp, out = {};
    const t = async (k, f) => { const t0 = performance.now(); try { out[k] = { ms: Math.round(performance.now() - t0), v: await f() }; out[k].ms = Math.round(performance.now() - t0); } catch (e) { out[k] = { ms: Math.round(performance.now() - t0), error: String(e && e.message || e) }; } };
    await t('schoolLayer', async () => (await hp.findLayer(hp.SCHOOL_SVCS, ['SCH_NAME', 'GSLO', 'GSHI'], /Point/i)).url);
    await t('districtLayers', async () => (await hp.findLayer(hp.DISTRICT_SVCS, ['LEA_NAME', 'LEAID'], /Polygon/i, true)).map((l) => l.url));
    await t('schools', async () => { const d = await hp.schoolsFor(lat, lon); return { schools: d.schools.length, sample: d.schools.slice(0, 3).map((x) => `${x.name} ${x.gslo}-${x.gshi}`), districts: d.districts.map((x) => x.name) }; });
    await t('neighborhood', async () => { const d = await hp.neighborhoodFor(lat, lon); return d && { tract: d.tract.tract, here: !!d.here }; });
    await t('nearby', async () => { const d = await hp.nearbyFor(lat, lon); return { via: d.via, n: (d.cats || []).reduce((k, c) => k + (c.hits || []).length, 0) }; });
    return out;
  }, lat, lon);
  for (const [k, v] of Object.entries(r)) log(`  ${k}: ${JSON.stringify(v).slice(0, 400)}`);
}
// 3. The school query, taken apart: which part does the service refuse?
const variants = await page.evaluate(async () => {
  const layer = 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_Characteristics_Current/FeatureServer/1';
  const meta = await (await fetch(layer + '?f=json')).json();
  const names = (meta.fields || []).map((f) => f.name);
  const want = ['NCESSCH', 'SCH_NAME', 'LEAID', 'LEA_NAME', 'SCHOOL_LEVEL', 'GSLO', 'GSHI', 'TOTAL', 'MEMBER', 'STUTERATIO', 'CHARTER_TEXT', 'MAGNET_TEXT', 'VIRTUAL', 'SCHOOL_TYPE_TEXT', 'SY_STATUS_TEXT', 'SURVYEAR', 'LATCOD', 'LONCOD'];
  const up = new Map(names.map((n) => [n.toUpperCase(), n])), have = want.map((n) => up.get(n)).filter(Boolean);
  const base = { geometry: '-71.0810,42.3505', geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json' };
  const tries = {
    app: { ...base, outFields: have.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: '400', distance: '6500', units: 'esriSRUnit_Meter' },
    noRecordCount: { ...base, outFields: have.join(','), returnGeometry: 'true', outSR: '4326', distance: '6500', units: 'esriSRUnit_Meter' },
    noOutSR: { ...base, outFields: have.join(','), returnGeometry: 'true', resultRecordCount: '400', distance: '6500', units: 'esriSRUnit_Meter' },
    star: { ...base, outFields: '*', returnGeometry: 'false', distance: '6500', units: 'esriSRUnit_Meter' },
    smallDistance: { ...base, outFields: have.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: '400', distance: '2000', units: 'esriSRUnit_Meter' },
    envelope: { geometry: '-71.25,42.19,-71.10,42.30', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', outFields: have.join(','), returnGeometry: 'true', outSR: '4326', resultRecordCount: '400' },
    where: { where: "LSTATE = 'MA'", outFields: 'SCH_NAME', returnGeometry: 'false', resultRecordCount: '3', f: 'json' },
  };
  const out = { fields: names.join(','), maxRecordCount: meta.maxRecordCount, capabilities: meta.capabilities, adv: meta.advancedQueryCapabilities, missing: want.filter((n) => !up.has(n)) };
  for (const [k, q] of Object.entries(tries)) {
    const t0 = performance.now();
    try { const j = await (await fetch(layer + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(q).toString() })).json();
      out[k] = { ms: Math.round(performance.now() - t0), n: j.features ? j.features.length : null, err: j.error ? JSON.stringify(j.error).slice(0, 300) : null }; }
    catch (e) { out[k] = { ms: Math.round(performance.now() - t0), fetchError: String(e) }; }
  }
  return out;
});
const nces = await page.evaluate(async () => {
  const out = {};
  for (const svc of ['https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_ADMINDATA_PUBLICSCH_2324/MapServer/1',
    'https://nces.ed.gov/opengis/rest/services/School_District_Boundaries/EDGE_ADMINDATA_SCHOOLDISTRICTS_SY2324/MapServer/1']) {
    const meta = await (await fetch(svc + '?f=json')).json();
    const q = { geometry: '-71.0810,42.3505', geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', outFields: '*', returnGeometry: 'true', outSR: '4326', distance: /PUBLICSCH/.test(svc) ? '6500' : '0', units: 'esriSRUnit_Meter' };
    const t0 = performance.now(); let r;
    try { const j = await (await fetch(svc + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(q).toString() })).json();
      r = { ms: Math.round(performance.now() - t0), n: j.features ? j.features.length : null, err: j.error ? JSON.stringify(j.error).slice(0, 200) : null, sample: j.features && j.features[0] ? JSON.stringify(j.features[0].attributes).slice(0, 500) : null }; }
    catch (e) { r = { ms: Math.round(performance.now() - t0), fetchError: String(e) }; }
    out[svc.split('/services/')[1]] = { fields: (meta.fields || []).map((f) => f.name).join(','), ...r };
  }
  return out;
});
log('== the Department of Education servers');
for (const [k, v] of Object.entries(nces)) log(`  ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
log('== the school query, taken apart');
for (const [k, v] of Object.entries(variants)) log(`  ${k}: ${JSON.stringify(v).slice(0, 900)}`);
await browser.close(); srv.close();
// 2026-11-10
