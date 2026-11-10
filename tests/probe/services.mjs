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

// 2. The app's own lookups, for Dedham Square and Holbrook
for (const [name, lat, lon] of [['Dedham Square', 42.2493, -71.1752], ['Holbrook', 42.1606, -70.9959]]) {
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
await browser.close(); srv.close();
