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
const STATES = {   // Wisconsin through Tier 2: in git history (November 11, 2026). The big counties, Maine and the lot-line states:
  TX_HARRIS: { spots: [[29.7400, -95.3900, null, 'Houston Montrose'], [29.7600, -95.4600, null, 'River Oaks'], [29.9900, -95.5500, null, 'Cypress']], searches: ['816 Marshall St, Houston, TX'] },
  TX_TARRANT: { spots: [[32.7300, -97.3500, null, 'Fort Worth Fairmount'], [32.7350, -97.1100, null, 'Arlington']], searches: ['3111 Main Dr, Fort Worth, TX'] },
  CA_ALAMEDA: { spots: [[37.8690, -122.2710, null, 'Berkeley'], [37.8440, -122.2510, null, 'Oakland Rockridge']], searches: ['2180 Milvia St, Berkeley, CA'] },
  CA_SBD: { spots: [[34.0590, -117.1810, null, 'Redlands'], [34.1080, -117.2890, null, 'San Bernardino']], searches: [] },
  OH_FRANKLIN: { spots: [[39.9890, -83.0100, null, 'Columbus Short North'], [40.0000, -83.0600, null, 'Upper Arlington']], searches: ['1325 Hunter Ave, Columbus, OH'] },
  OH_HAMILTON: { spots: [[39.1400, -84.4400, null, 'Cincinnati Hyde Park'], [39.1030, -84.5120, null, 'Cincinnati downtown']], searches: ['801 Plum St, Cincinnati, OH'] },
  TN_DAVIDSON: { spots: [[36.1300, -86.8000, null, 'Nashville Hillsboro'], [36.1520, -86.7880, null, 'The Gulch condos']], searches: ['1916 Ashwood Ave, Nashville, TN'] },
  ND_BISMARCK: { spots: [[46.8190, -100.7700, null, 'Bismarck'], [46.8500, -100.7800, null, 'Bismarck north']], searches: [] },
  OR_METRO: { spots: [[45.5120, -122.6400, null, 'Portland Sunnyside'], [45.4870, -122.8040, null, 'Beaverton'], [45.5300, -122.6800, null, 'Pearl District condos']], searches: [] },
  ID_ADA: { spots: [[43.6000, -116.2600, null, 'Boise'], [43.6142, -116.1999, null, 'Boise downtown']], searches: ['6242 W Daytona Cir, Boise, ID'] },
  MI_OAKLAND: { spots: [[42.4890, -83.1410, null, 'Royal Oak'], [42.5800, -83.2400, null, 'Bloomfield Hills']], searches: ['203 S Troy St, Royal Oak, MI'] },
  MI_MACOMB: { spots: [[42.4970, -82.8880, null, 'St. Clair Shores'], [42.5792, -82.9193, null, 'Clinton Township']], searches: ['22500 Shorewood Dr, St Clair Shores, MI'] },
  KS_SEDGWICK: { spots: [[37.6890, -97.3000, null, 'Wichita College Hill'], [37.6900, -97.4300, null, 'Wichita west']], searches: ['225 N Lorraine Ave, Wichita, KS'] },
  GA_ATLANTA: { spots: [[33.7800, -84.3600, null, 'Atlanta Virginia-Highland'], [33.7840, -84.3840, null, 'Midtown condos']], searches: ['864 Adair Ave NE, Atlanta, GA'] },
  AZ_MARICOPA: { spots: [[33.4990, -112.0500, null, 'Phoenix'], [33.4200, -111.9400, null, 'Tempe'], [33.5000, -111.9260, null, 'Scottsdale']], searches: ['4352 N 16th St, Phoenix, AZ'] },
  ME: { spots: [[43.6594, -70.2601, null, 'Portland'], [44.8016, -68.7712, null, 'Bangor'], [43.9140, -69.9650, null, 'Brunswick']], searches: ['341 Cumberland Ave, Portland, ME'] },
  IN: { spots: [[39.7900, -86.1500, null, 'Indianapolis'], [41.6800, -86.2500, null, 'South Bend']], searches: [] },
  NH: { spots: [[43.2100, -71.5400, null, 'Concord'], [42.9900, -71.4600, null, 'Manchester']], searches: [] },
  WV: { spots: [[38.3500, -81.6300, null, 'Charleston'], [39.6300, -79.9550, null, 'Morgantown']], searches: [] },
  NV: { spots: [[39.5200, -119.8100, null, 'Reno'], [36.1500, -115.1500, null, 'Las Vegas']], searches: [] },
  HI: { spots: [[21.2790, -157.8000, null, 'Honolulu Kaimuki']], searches: [] },
  DE: { spots: [[39.7500, -75.5500, null, 'Wilmington']], searches: [] },
  VA: { spots: [[37.5500, -77.4600, null, 'Richmond'], [38.8800, -77.1000, null, 'Arlington']], searches: [] },
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
for (let i = 0; i < 160 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
log('== health rows'); for (const h of rows) if (/Texas|California|Ohio|Tennessee|North Dakota|Oregon|Idaho|Michigan|Kansas|Georgia|Arizona|Maine|Indiana|New Hampshire|West Virginia|Nevada|Hawaii|Delaware|Virginia/.test(h)) log('   ' + h.slice(0, 300));
await browser.close(); srv.close();
