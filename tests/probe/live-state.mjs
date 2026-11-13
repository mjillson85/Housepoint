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
const STATES = {   // Earlier rounds: in git history (November 13, 2026). The newest counties (public buildings and landmarks for the searches):
  CA_LA: { spots: [[34.0635, -118.3000, null, 'Los Angeles Koreatown'], [33.8350, -118.3400, null, 'Torrance']], searches: ['3900 Lankershim Blvd, Los Angeles, CA'] },
  PA_PHILA: { spots: [[40.0350, -75.2150, null, 'Philadelphia Roxborough'], [39.9493, -75.1707, null, 'Rittenhouse condos']], searches: ['1500 Market St, Philadelphia, PA'] },
  PA_ALLEGHENY: { spots: [[40.3770, -80.0450, null, 'Mt. Lebanon'], [40.4440, -79.9530, null, 'Pittsburgh Oakland']], searches: ['4400 Forbes Ave, Pittsburgh, PA'] },
  TX_TRAVIS: { spots: [[30.3050, -97.7270, null, 'Austin Hyde Park']], searches: ['1100 Congress Ave, Austin, TX'] },
  TX_BEXAR: { spots: [[29.4870, -98.4650, null, 'Alamo Heights']], searches: ['300 Alamo Plaza, San Antonio, TX'] },
  // Lot-line states: what stands on the lots, from the national building outlines (the counts come after the outlines arrive)
  DE: { spots: [[39.7500, -75.5500, null, 'Wilmington']], searches: [] },
  NH: { spots: [[43.2100, -71.5400, null, 'Concord']], searches: [] },
  VA: { spots: [[37.5500, -77.4600, null, 'Richmond']], searches: [] },
};
// The joined tables' warnings (Philadelphia's property office, Allegheny's assessments), if a join fails
page.on('console', (m) => { if (/Philadelphia records|Allegheny assessments|extra records/.test(m.text())) log('  [console]', m.text().slice(0, 300)); });
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
      const recs = S.local.flatMap((l) => l.p.records);
      kinds.withValue = recs.filter((x) => Number(x.TOTAL_VAL) > 0).length; kinds.withAddress = recs.filter((x) => x.SITE_ADDR).length; kinds.records = recs.length;
      if (hp.REGIONS[S.local[0] ? S.local[0].p.region : ''] && hp.REGIONS[S.local[0].p.region].noValues) {
        await new Promise((r) => setTimeout(r, 4000));      // the outlines come after the lots
        const b = S.local.filter((l) => l.p.bldg); kinds.withBuilding = b.length; kinds.homes = S.local.filter((l) => hp.summarize(l.p).isHome).length;
        kinds.buildingKinds = b.reduce((m, l) => { m[l.p.bldg.kind] = (m[l.p.bldg.kind] || 0) + 1; return m; }, {});
      }
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
// The service check (?health=1) is its own step now: probe/health.mjs
await browser.close(); srv.close();
