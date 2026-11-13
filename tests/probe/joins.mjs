// Before Philadelphia and Allegheny County are added: their values live in tables apart from the parcel shapes (Philadelphia's
// property office on Carto, Allegheny's assessments on the WPRDC's data store). From a real browser page (as the phone asks, so
// the cross-site rules are tested too): the tables' column names, then a few records with property columns only. Owner, mailing
// and legal columns are never asked for (they're dropped from the column list before any query, by the shared owner list).
//   cd tests && node probe/joins.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import { OWNERISH, KEEP_NAME } from '../owner-fields.mjs';

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>probe</title>'); }).listen(8798);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8798/');
const js = (v, n = 900) => (JSON.stringify(v ?? null) || '').slice(0, n);

const out = await page.evaluate(async (OWNsrc, KEEPsrc) => {
  const OWN = new RegExp(OWNsrc, 'i'), KEEP = new RegExp(KEEPsrc, 'i');
  // beyond the shared list: names, phones, notices and free-text descriptions
  const SKIP = /own|mail|name|notice|change|phone|legal|desc1|desc2|desc3|book|page|deed|grantor|grantee|buyer|seller|homestead_exempt_name|care/i;
  const safe = (c) => !(OWN.test(c) && !KEEP.test(c)) && !SKIP.test(c);
  const get = async (u, ms = 30000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms), t0 = performance.now();
    try { const r = await fetch(u, { signal: c.signal }); const j = await r.json(); return { status: r.status, j, ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { err: String(e && e.message || e), ms: Math.round(performance.now() - t0) }; } finally { clearTimeout(t); } };
  const res = {};

  // Philadelphia: the property office's table on Carto (one row per property, a point each)
  const CARTO = 'https://phl.carto.com/api/v2/sql?q=';
  const meta = await get(CARTO + encodeURIComponent('SELECT * FROM opa_properties_public LIMIT 0'));
  const cols = meta.j && meta.j.fields ? Object.keys(meta.j.fields) : [];
  res.phl = { status: meta.status, err: meta.err, ms: meta.ms, columns: cols.join(' '), safe: cols.filter(safe).join(' ') };
  if (cols.length) {
    const pick = cols.filter(safe).filter((c) => !/^the_geom|^cartodb|^objectid$/i.test(c));
    for (const [lat, lon, name] of [[39.9495, -75.170, 'Rittenhouse'], [40.0350, -75.215, 'Roxborough']]) {
      const q = `SELECT ${pick.join(', ')}, ST_Y(the_geom) AS lat, ST_X(the_geom) AS lon FROM opa_properties_public WHERE ST_DWithin(the_geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, 50) LIMIT 6`;
      const r = await get(CARTO + encodeURIComponent(q));
      res.phl[name] = r.j && r.j.rows ? { ms: r.ms, rows: r.j.rows } : { err: r.err || JSON.stringify(r.j).slice(0, 300), ms: r.ms };
    }
  }

  // Allegheny County: the assessments on the WPRDC's data store (CKAN), one row per parcel id
  const RID = '65855e14-549e-4992-b5be-d629afc676fa';
  const am = await get(`https://data.wprdc.org/api/3/action/datastore_search?resource_id=${RID}&limit=0`);
  const acols = am.j && am.j.result ? am.j.result.fields.map((f) => f.id) : [];
  res.alle = { status: am.status, err: am.err, ms: am.ms, columns: acols.join(' '), safe: acols.filter(safe).join(' ') };
  if (acols.length) {
    const pick = acols.filter(safe).filter((c) => c !== '_full_text');
    const q = `SELECT ${pick.map((c) => `"${c}"`).join(', ')} FROM "${RID}" WHERE "MUNIDESC" LIKE '%Pittsburgh%' LIMIT 4`;
    const r = await get(`https://data.wprdc.org/api/3/action/datastore_search_sql?sql=${encodeURIComponent(q)}`);
    res.alle.sample = r.j && r.j.result ? { ms: r.ms, rows: r.j.result.records } : { err: r.err || JSON.stringify(r.j).slice(0, 300), ms: r.ms };
  }
  return res;
}, OWNERISH.source, KEEP_NAME.source);

console.log('==== Philadelphia (Carto opa_properties_public)', out.phl.status || out.phl.err, `${out.phl.ms} ms`);
console.log('columns:', out.phl.columns);
console.log('property columns asked for:', out.phl.safe);
for (const k of ['Rittenhouse', 'Roxborough']) if (out.phl[k]) { console.log(`-- ${k}:`, out.phl[k].err || `${out.phl[k].rows.length} rows in ${out.phl[k].ms} ms`); for (const r of out.phl[k].rows || []) console.log('   ', js(r)); }
console.log('==== Allegheny County (WPRDC assessments)', out.alle.status || out.alle.err, `${out.alle.ms} ms`);
console.log('columns:', out.alle.columns);
console.log('property columns asked for:', out.alle.safe);
if (out.alle.sample) { console.log('-- sample:', out.alle.sample.err || `${out.alle.sample.rows.length} rows in ${out.alle.sample.ms} ms`); for (const r of out.alle.sample.rows || []) console.log('   ', js(r)); }
await browser.close(); srv.close();
