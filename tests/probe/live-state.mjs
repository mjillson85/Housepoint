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
const STATES = {   // Wisconsin, Washington and Nebraska: in git history (November 11, 2026)
  MN: { spots: [[44.92415, -93.31931, '4332 XERXES AVE S', 'Minneapolis Linden Hills double bungalow'], [44.92488, -93.31962, '3115 43RD ST W', 'Minneapolis stacked condos'],
    [44.97889, -93.26972, '415 NICOLLET MALL', 'Minneapolis apartments over shops'], [44.93813, -93.14504, '1061 GOODRICH AVE', 'St Paul Summit Hill house'],
    [44.93972, -93.14467, '1060 GRAND AVE', 'St Paul condo units'], [44.94885, -93.08974, '168 6TH ST', 'St Paul condo tower with garage stalls'],
    [44.0234, -92.4630, null, 'Rochester'], [46.7867, -92.1005, null, 'Duluth'], [44.9239, -92.9594, null, 'Woodbury (Washington County numbers)'],
    [47.2372, -93.5302, null, 'Grand Rapids (Itasca numbers)'], [46.3580, -94.2000, null, 'Brainerd lakes (Crow Wing numbers)'], [48.6011, -93.4108, null, 'International Falls'],
    [44.1636, -93.9994, null, 'Mankato (a county that doesn’t share)']],
    searches: ['4332 Xerxes Ave S, Minneapolis, MN', '1061 Goodrich Ave, St Paul, MN', '3005 W 43rd St, Minneapolis, MN', '803 N Pokegama Ave, Grand Rapids, MN', 'Duluth, MN'] },
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
      if (!L) return { ms, lots: S.local.length, err: 'lot not found', help: document.querySelector('#mapHelpTxt').textContent };
      hp.selectLot(L); await new Promise((r) => setTimeout(r, 50));
      const kinds = {}; for (const l of S.local) { const k = hp.summarize(l.p).kind; kinds[k] = (kinds[k] || 0) + 1; }
      return { ms, lots: S.local.length, kinds, card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | ').slice(0, 900) };
    }, lat, lon, addr);
    log(`== ${what}: ${r.err ? 'ERROR ' + r.err : ''} map ${r.ms} ms, ${r.lots} lots ${JSON.stringify(r.kinds || {})}${r.help ? ' · ' + r.help : ''}`);
    if (r.card) log('   ' + r.card);
  }
  for (const q of cfg.searches) {
    const r = await page.evaluate(async (q) => { const t0 = performance.now(); try { const x = await window.__hp.searchAddress(q);
      if (x && x.lot && x.lot.then) x.lot = await x.lot.catch(() => null);
      return { ms: Math.round(performance.now() - t0), x }; }
      catch (e) { return { ms: Math.round(performance.now() - t0), err: String(e && e.message || e) }; } }, q);
    log(`== search "${q}": ${r.ms} ms ${JSON.stringify(r.x || r.err).slice(0, 300)}`);
  }
}
await page.goto('http://localhost:8800/?health=1');
for (let i = 0; i < 160 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/Minnesota|Census|Geoapify|Schools|Neighborhood|Safety|Nearby/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
