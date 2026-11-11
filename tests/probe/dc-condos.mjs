// Washington, DC: the tax lot layer (Property_and_Land, layer 40) has each condo building as one lot marked CONDOLOT = Y with
// its condo regime number, and no units. This lists the service's layers and tables, finds the one that holds condo units
// (by regime number or by the square's unit lots, 2000 and up), and times an address search, so condo buildings can show
// their units. Never asks for owner fields.
//   cd tests && node probe/dc-condos.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8796);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8796/');

const out = await page.evaluate(async () => {
  const BAD = /own|mail|careof|address1|address2|citystzip|legal|grantor|grantee|asrname|deed|book|page_num/i;
  const get = async (u, ms = 30000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); return { j: await r.json(), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const res = { services: [], layers: [], tries: [], search: [] };
  const roots = ['https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer',
    'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer'];
  const dir = await get('https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA?f=json');
  res.services = ((dir.j && dir.j.services) || []).map((s) => `${s.name} (${s.type})`).filter((n) => /PROPERTY|LAND|TAX|CONDO|PARCEL|CAMA|REAL/i.test(n));
  const tables = [];
  for (const root of roots) {
    const m = await get(root + '?f=json');
    const all = [...((m.j && m.j.layers) || []).map((l) => ({ ...l, kind: 'layer' })), ...((m.j && m.j.tables) || []).map((t) => ({ ...t, kind: 'table' }))];
    for (const l of all) res.layers.push(`${root.split('/').slice(-2, -1)[0]} ${l.kind} ${l.id}: ${l.name}`);
    if (!tables.length) for (const l of all) if (/condo|itspe|integrated|tax system|cama|sales|assess|regime/i.test(l.name)) tables.push({ root, id: l.id, name: l.name, kind: l.kind });
  }
  // a Logan Circle condo lot (square 0279, lot 0048, regime 2470) and a Capitol Hill one
  for (const t of tables.slice(0, 12)) {
    const u = `${t.root}/${t.id}`;
    const m = await get(u + '?f=json');
    const fields = ((m.j && m.j.fields) || []).map((f) => f.name);
    const good = fields.filter((f) => !BAD.test(f));
    const entry = { t: `${t.kind} ${t.id} ${t.name}`, fields: fields.join(','), tries: [] };
    const regimeF = fields.find((f) => /REGIME/i.test(f)), sslF = fields.find((f) => /^SSL$/i.test(f)), sqF = fields.find((f) => /^SQUARE$/i.test(f));
    const wheres = [];
    if (regimeF) wheres.push(`${regimeF}='2470'`, `${regimeF}=2470`);
    if (sslF) wheres.push(`${sslF} LIKE '0279    2%'`, `${sslF} = '0279    0048'`);
    if (sqF) wheres.push(`${sqF}='0279'`);
    for (const where of wheres) {
      const p = new URLSearchParams({ where, outFields: good.join(','), returnGeometry: 'false', f: 'json', resultRecordCount: '8' });
      const r = await get(u + '/query?' + p.toString(), 20000);
      entry.tries.push({ where, ms: r.ms, n: r.j && r.j.features ? r.j.features.length : (r.err || JSON.stringify(r.j && r.j.error)).slice(0, 150),
        sample: r.j && r.j.features ? r.j.features.slice(0, 4).map((f) => f.attributes) : null });
    }
    res.tries.push(entry);
  }
  // address search on the tax lot layer
  const L40 = roots[0] + '/40';
  for (const where of ["UPPER(PREMISEADD) LIKE '239 8TH ST SE%'", "UPPER(PREMISEADD) LIKE '1300 RHODE ISLAND AVE NW%'"]) {
    const p = new URLSearchParams({ where, outFields: 'SSL,PREMISEADD,USECODE', returnGeometry: 'true', outSR: '4326', f: 'json', resultRecordCount: '10' });
    const r = await get(L40 + '/query?' + p.toString(), 20000);
    res.search.push(`${where} | ${r.ms} ms | ${r.j && r.j.features ? r.j.features.length + ' ' + JSON.stringify(r.j.features.slice(0, 2).map((f) => f.attributes)) : (r.err || JSON.stringify(r.j && r.j.error)).slice(0, 150)}`);
  }
  return res;
});
console.log('#### DC condos');
console.log('== services'); for (const s of out.services) console.log('  ', s);
console.log('== layers and tables'); for (const l of out.layers) console.log('  ', l);
for (const t of out.tries) {
  console.log(`== ${t.t}`); console.log('   fields:', t.fields);
  for (const x of t.tries) { console.log(`   ${x.where}: ${x.ms} ms, ${x.n}`); for (const s of (x.sample || [])) console.log('     ', JSON.stringify(s).slice(0, 700)); }
}
console.log('== address searches'); for (const s of out.search) console.log('  ', s);
await browser.close(); srv.close();
