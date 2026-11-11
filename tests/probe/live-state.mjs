// After a state is added: runs the app against the state's real service from a browser page on GitHub and logs what the
// cards say at a few real addresses, how long the map and an address search take, and the service check (?health=1) rows
// for the state. Cards never show owner names, so the log doesn't either. Run by the "probe services" workflow.
//   cd tests && node probe/live-state.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8800);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => log('  [page error]', e.message));
await page.goto('http://localhost:8800/');

const STATE = 'NC';
const SPOTS = [  // [lat, lon, address on the lot to open, what it is]
  [35.8081, -78.6429, '2207 ALEXANDER RD', 'Raleigh house'], [35.2045, -80.8501, '1814 DILWORTH RD WEST', 'Charlotte house'],
  [35.5951, -82.5515, '12 LEXINGTON AVE', 'Asheville condo building'], [35.9958, -78.9012, '110 N CORCORAN ST', 'Durham condo tower'],
  [34.2263, -77.9445, '709 S 3RD ST', 'Wilmington house'], [35.9574, -75.6241, '4008 VA DARE TRL', 'Nags Head beach house'],
  [35.9132, -79.0558, null, 'Chapel Hill (a county with no use codes)'], [36.0727, -79.7922, null, 'Greensboro (a county with no addresses)'],
];
for (const [lat, lon, addr, what] of SPOTS) {
  const r = await page.evaluate(async (lat, lon, addr) => {
    const hp = window.__hp, S = hp.S, t0 = performance.now();
    try { await hp.centerMap(lat, lon); } catch (e) { return { err: String(e && e.message || e) }; }
    const ms = Math.round(performance.now() - t0);
    const near = (l) => { const [x, y] = S.proj.fwd(lat, lon); return Math.hypot(l.c[0] - x, l.c[1] - y); };
    const L = addr ? S.local.find((l) => l.p.records.some((x) => String(x.SITE_ADDR || '').toUpperCase().startsWith(addr)))
      : S.local.filter((l) => l.p.built).sort((a, b) => near(a) - near(b))[0];
    if (!L) return { ms, lots: S.local.length, err: 'lot not found' };
    hp.selectLot(L); await new Promise((r) => setTimeout(r, 50));
    return { ms, lots: S.local.length, card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | ').slice(0, 900) };
  }, lat, lon, addr);
  log(`== ${what}: ${r.err ? 'ERROR ' + r.err : ''} map ${r.ms} ms, ${r.lots} lots`);
  if (r.card) log('   ' + r.card);
}
for (const q of ['2207 Alexander Rd, Raleigh, NC', '1814 Dilworth Rd W, Charlotte NC', 'Boone, NC']) {
  const r = await page.evaluate(async (q) => { const t0 = performance.now(); try { const x = await window.__hp.searchAddress(q); return { ms: Math.round(performance.now() - t0), x }; }
    catch (e) { return { ms: Math.round(performance.now() - t0), err: String(e && e.message || e) }; } }, q);
  log(`== search "${q}": ${r.ms} ms ${JSON.stringify(r.x || r.err).slice(0, 300)}`);
}
await page.goto('http://localhost:8800/?health=1');
for (let i = 0; i < 160 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/North Carolina|Census|Geoapify|Schools|Neighborhood|Safety|Nearby/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
