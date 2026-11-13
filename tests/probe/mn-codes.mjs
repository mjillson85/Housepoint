// Minnesota's open parcels: which counties write their property class as a bare number ("201", "765"), what those numbers
// hold (building or not, typical values), and how quickly the layer answers an address made of its parts (number, street
// name, city). Run by the "probe services" workflow before Minnesota is added. Never asks for owner fields.
//   cd tests && node probe/mn-codes.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8798);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8798/');

const LAYER = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer/0';
const NUMS = ['0', '100', '101', '111', '115', '140', '151', '200', '201', '204', '205', '209', '211', '233', '244', '660', '662', '670', '671', '710', '725',
  '730', '760', '765', '770', '771', '776', '958'];
const SEARCHES = [
  ['4332', 'XERXES', 'MINNEAPOLIS'], ['1061', 'GOODRICH', 'SAINT PAUL'], ['1060', 'GRAND', 'SAINT PAUL'], ['3005', '43RD', 'MINNEAPOLIS'],
  ['803', 'POKEGAMA', 'GRAND RAPIDS'], ['4332', 'XERXES', ''],
];

const out = await page.evaluate(async (LAYER, NUMS, SEARCHES) => {
  const get = async (u, ms = 30000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); return { j: await r.json(), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const res = {};
  const stat = async (where, groupBy, stats) => {
    const q = new URLSearchParams({ where, f: 'json', returnGeometry: 'false', groupByFieldsForStatistics: groupBy.join(','),
      outStatistics: JSON.stringify(stats || [{ statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'n' }]) });
    const r = await get(LAYER + '/query?' + q.toString(), 60000);
    if (!r.j || r.j.error) return { err: r.err || JSON.stringify(r.j.error), ms: r.ms };
    return { ms: r.ms, rows: (r.j.features || []).map((f) => f.attributes) };
  };
  const inList = `useclass1 IN (${NUMS.map((n) => `'${n}'`).join(',')})`;
  res.byCounty = await stat(inList, ['co_name', 'useclass1'], [
    { statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'n' },
    { statisticType: 'avg', onStatisticField: 'emv_bldg', outStatisticFieldName: 'bldg' },
    { statisticType: 'avg', onStatisticField: 'emv_total', outStatisticFieldName: 'total' },
    { statisticType: 'avg', onStatisticField: 'num_units', outStatisticFieldName: 'units' },
    { statisticType: 'avg', onStatisticField: 'total_tax', outStatisticFieldName: 'tax' }]);
  res.dwell = await stat(inList, ['useclass1', 'dwell_type']);
  res.exempt = await stat(inList, ['useclass1', 'tax_exempt', 'ownership']);
  res.homestead = await stat(inList, ['useclass1', 'homestead']);
  // the counties not in the open layer at all
  res.counties = await stat('1=1', ['co_name', 'co_code']);
  // a few records per numeric code, without owner fields
  res.samples = {};
  for (const n of NUMS) {
    const q = new URLSearchParams({ where: `useclass1='${n}'`, outFields: 'co_name,ctu_name,anumber,st_name,st_pos_typ,sub_id1,emv_land,emv_bldg,emv_total,total_tax,useclass2,tax_exempt,dwell_type,home_style,year_built,num_units,homestead,ownership,acres_poly', returnGeometry: 'false', resultRecordCount: '6', f: 'json' });
    const r = await get(LAYER + '/query?' + q.toString());
    res.samples[n] = r.j && r.j.features ? r.j.features.map((f) => f.attributes) : (r.err || r.j && r.j.error);
  }
  // address searches built from the parts
  res.search = [];
  for (const [num, name, city] of SEARCHES) {
    const where = `anumber=${num} AND UPPER(st_name) LIKE '${name}%'` + (city ? ` AND UPPER(ctu_name) LIKE '${city}%'` : '');
    const q = new URLSearchParams({ where, outFields: 'anumber,st_pre_dir,st_name,st_pos_typ,st_pos_dir,sub_id1,ctu_name,postcomm,co_name', returnGeometry: 'true', outSR: '4326', resultRecordCount: '10', f: 'json' });
    const r = await get(LAYER + '/query?' + q.toString(), 20000);
    res.search.push({ where, ms: r.ms, n: r.j && r.j.features ? r.j.features.length : (r.err || JSON.stringify(r.j && r.j.error)), first: r.j && r.j.features && r.j.features.slice(0, 3).map((f) => f.attributes) });
  }
  return res;
}, LAYER, NUMS, SEARCHES);

console.log('#### MN numeric property classes by county');
for (const k of ['byCounty', 'dwell', 'exempt', 'homestead', 'counties']) {
  const v = out[k];
  console.log(`== ${k} (${v.ms} ms)`, v.err || '');
  for (const r of (v.rows || []).sort((a, b) => (b.n || 0) - (a.n || 0))) console.log('  ', JSON.stringify(r));
}
console.log('== samples');
for (const [n, rows] of Object.entries(out.samples)) { console.log(` -- ${n}`); for (const r of [].concat(rows)) console.log('   ', JSON.stringify(r)); }
console.log('== searches');
for (const s of out.search) console.log('  ', s.ms, 'ms', s.n, s.where, JSON.stringify(s.first));
await browser.close(); srv.close();
