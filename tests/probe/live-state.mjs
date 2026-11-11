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

// The newest states: [lat, lon, address on the lot to open (or the nearest built lot), what it is], then searches to time.
const STATES = {
  WI: { spots: [[43.06953, -89.42935, '2509 VAN HISE AVE', 'Madison house'], [43.07327, -89.38541, '123 W WASHINGTON AVE', 'Madison condo stack (common record + units + shops)'],
    [43.07161, -89.38699, '309 W WASHINGTON AVE', 'Madison condo common record (CDM)'], [42.9980, -87.8980, '2586 S LENOX ST', 'Milwaukee Bay View house'],
    [43.04076, -87.90474, null, 'Milwaukee downtown condos'], [44.95954, -89.62911, '201 JEFFERSON STREET', 'Wausau stacked units'],
    [45.1300, -87.2400, null, 'Fish Creek (Door County)'], [43.5600, -90.8900, null, 'Vernon County (rural)'], [44.8113, -91.4985, null, 'Eau Claire']],
    searches: ['2509 Van Hise Ave, Madison, WI', '2586 S Lenox St, Milwaukee, WI', '309 S Farwell St, Eau Claire, WI', 'Fish Creek, WI'] },
  WA: { spots: [[47.6680, -122.3850, null, 'Seattle Ballard house'], [47.60804, -122.33966, '1419 1ST AVE', 'Seattle condo tower (King County: one record)'],
    [47.6101, -122.2015, null, 'Bellevue'], [47.2529, -122.4443, '1102 TACOMA AVE S', 'Tacoma library'], [47.2660, -122.4430, null, 'Tacoma Stadium District'],
    [47.6430, -117.4100, null, 'Spokane South Hill house'], [45.6387, -122.6615, null, 'Vancouver'], [46.6021, -120.5059, null, 'Yakima'],
    [48.5343, -123.0171, null, 'Friday Harbor'], [48.3600, -119.5800, null, 'Okanogan (rural)']],
    searches: ['1419 1st Ave, Seattle, WA', '1102 Tacoma Ave S, Tacoma, WA', '1 N Monroe St, Spokane, WA', 'Spokane, WA'] },
};
for (const [st, cfg] of Object.entries(STATES)) {
  log(`######## ${st}`);
  for (const [lat, lon, addr, what] of cfg.spots) {
    const r = await page.evaluate(async (lat, lon, addr) => {
      const hp = window.__hp, S = hp.S, t0 = performance.now();
      try { await hp.centerMap(lat, lon); } catch (e) { return { err: String(e && e.message || e) }; }
      const ms = Math.round(performance.now() - t0);
      const near = (l) => { const [x, y] = S.proj.fwd(lat, lon); return Math.hypot(l.c[0] - x, l.c[1] - y); };
      const L = addr ? S.local.find((l) => l.p.records.some((x) => String(x.SITE_ADDR || '').toUpperCase().startsWith(addr)))
        : S.local.filter((l) => l.p.built).sort((a, b) => near(a) - near(b))[0];
      if (!L) return { ms, lots: S.local.length, err: 'lot not found' };
      hp.selectLot(L); await new Promise((r) => setTimeout(r, 50));
      const kinds = {}; for (const l of S.local) { const k = hp.summarize(l.p).kind; kinds[k] = (kinds[k] || 0) + 1; }
      return { ms, lots: S.local.length, kinds, card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | ').slice(0, 900) };
    }, lat, lon, addr);
    log(`== ${what}: ${r.err ? 'ERROR ' + r.err : ''} map ${r.ms} ms, ${r.lots} lots ${JSON.stringify(r.kinds || {})}`);
    if (r.card) log('   ' + r.card);
  }
  for (const q of cfg.searches) {
    const r = await page.evaluate(async (q) => { const t0 = performance.now(); try { const x = await window.__hp.searchAddress(q); return { ms: Math.round(performance.now() - t0), x }; }
      catch (e) { return { ms: Math.round(performance.now() - t0), err: String(e && e.message || e) }; } }, q);
    log(`== search "${q}": ${r.ms} ms ${JSON.stringify(r.x || r.err).slice(0, 300)}`);
  }
}
await page.goto('http://localhost:8800/?health=1');
for (let i = 0; i < 160 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/Wisconsin|Washington|Census|Geoapify|Schools|Neighborhood|Safety|Nearby/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
