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
const STATES = {   // Earlier rounds: in git history (November 11, 2026). The basic card, and a covered state's county that shares nothing:
  US_SC: { spots: [[33.9980, -81.0300, null, 'Columbia SC'], [34.0150, -81.0150, null, 'Columbia Elmwood Park']], searches: ['1100 Gervais St, Columbia, SC'] },
  US_PA: { spots: [[39.9520, -75.1800, null, 'Philadelphia Rittenhouse'], [40.4400, -79.9500, null, 'Pittsburgh']], searches: ['1500 Market St, Philadelphia, PA'] },
  US_NM: { spots: [[35.0900, -106.6300, null, 'Albuquerque Nob Hill']], searches: ['1119 Las Lomas Rd NE, Albuquerque, NM'] },
  US_LA: { spots: [[29.9300, -90.1000, null, 'New Orleans Uptown']], searches: [] },
  US_SD: { spots: [[43.5450, -96.7300, null, 'Sioux Falls']], searches: [] },
  US_TX: { spots: [[30.2700, -97.7400, null, 'Austin'], [32.8100, -96.7900, null, 'Dallas Uptown']], searches: ['112 E 7th St, Austin, TX'] },
  US_CA: { spots: [[34.0600, -118.3000, null, 'Los Angeles Koreatown']], searches: [] },
  NY_GAP: { spots: [[40.7268, -73.6343, null, 'Garden City NY (Nassau shares no records)']], searches: [] },
};
for (const [st, cfg] of Object.entries(STATES)) {
  log(`######## ${st}`);
  for (const [lat, lon, addr, what] of cfg.spots) {
    const r = await page.evaluate(async (lat, lon, addr) => {
      const hp = window.__hp, S = hp.S, t0 = performance.now();
      try { await hp.centerMap(lat, lon); } catch (e) { return { err: String(e && e.message || e) }; }
      const ms = Math.round(performance.now() - t0);
      for (let i = 0; i < 30 && !S.bldgs.length; i++) await new Promise((r) => setTimeout(r, 100));   // outlines (Wyoming, Colorado: what makes a lot built)
      const near = (l) => { const [x, y] = S.proj.fwd(lat, lon); return Math.hypot(l.c[0] - x, l.c[1] - y); };
      const L = addr ? S.local.find((l) => l.p.records.some((x) => String(x.SITE_ADDR || '').toUpperCase().startsWith(addr)))
        : S.local.filter((l) => l.p.built).sort((a, b) => near(a) - near(b))[0];
      if (!L) return { ms, lots: S.local.length, err: 'lot not found', help: document.querySelector('#mapHelpTxt').textContent };
      hp.selectLot(L); await new Promise((r) => setTimeout(r, 50));
      // Vermont and Alaska: the nearest address arrives a moment later
      if (/Address not listed/.test(document.querySelector('#cardBody').innerText)) await new Promise((r) => setTimeout(r, 2500));
      const kinds = {}; for (const l of S.local) { const k = hp.summarize(l.p).kind; kinds[k] = (kinds[k] || 0) + 1; }
      return { ms, rid: (hp.regionFor(lat, lon) || {}).id || null, lots: S.local.length, kinds, card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | ').slice(0, 900) };
    }, lat, lon, addr);
    log(`== ${what} [${r.rid}]: ${r.err ? 'ERROR ' + r.err : ''} map ${r.ms} ms, ${r.lots} lots ${JSON.stringify(r.kinds || {})}${r.help ? ' · ' + r.help : ''}`);
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
for (let i = 0; i < 600 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/Building outlines|Texas|Ohio|Maine|Indiana|Virginia|Flood|elevation|Aerial/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
