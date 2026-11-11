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
const STATES = {   // Wisconsin through New York and the review fixes: in git history (November 11, 2026). Tier 2:
  VT: { spots: [[44.4800, -73.2100, null, 'Burlington'], [44.4650, -72.6850, null, 'Stowe'], [42.8510, -72.5580, null, 'Brattleboro']], searches: ['Montpelier, VT'] },
  MT: { spots: [[45.7800, -108.5300, null, 'Billings'], [46.8650, -113.9950, null, 'Missoula'], [45.6770, -111.0400, null, 'Bozeman']], searches: ['724 Gerald Ave, Missoula, MT'] },
  AR: { spots: [[34.7600, -92.3100, null, 'Little Rock Hillcrest'], [36.0700, -94.1600, null, 'Fayetteville'], [34.5000, -93.0550, null, 'Hot Springs']], searches: ['21 Oakwood Rd, Little Rock, AR'] },
  IL: { spots: [[41.8850, -87.7850, null, 'Oak Park'], [42.0450, -87.6900, null, 'Evanston'], [41.8920, -87.6250, null, 'Chicago downtown condos']], searches: ['204 S Elmwood Ave, Oak Park, IL'] },
  CO: { spots: [[39.7000, -104.9700, null, 'Denver Washington Park'], [40.5730, -105.0790, null, 'Fort Collins'], [38.8600, -104.8200, null, 'Colorado Springs (no values)'],
    [40.0150, -105.2700, null, 'Boulder']], searches: ['1060 S Gaylord St, Denver, CO'] },
  WY: { spots: [[41.1400, -104.8100, null, 'Cheyenne'], [43.4800, -110.7600, null, 'Jackson']], searches: ['606 E 21st St, Cheyenne, WY'] },
  UT: { spots: [[40.7500, -111.8700, null, 'Salt Lake City Sugar House'], [40.2338, -111.6585, null, 'Provo'], [41.0350, -111.9380, null, 'Kaysville (Davis)'],
    [37.1000, -113.5700, null, 'St. George']], searches: ['745 E 900 S, Salt Lake City, UT'] },
  AK: { spots: [[61.1900, -149.8800, null, 'Anchorage'], [64.8400, -147.7300, null, 'Fairbanks'], [58.3000, -134.4200, null, 'Juneau (no values)']], searches: ['Fairbanks, AK'] },
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
for (let i = 0; i < 160 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/Vermont|Montana|Arkansas|Cook County|Colorado|Wyoming|Utah|Alaska/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
