// Esri removal, building outlines, denial paths, start screen, About, tax labels, badges.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const ROOT = `${HP_ROOT}`;
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0]; const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const type = f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
  r.writeHead(200, { 'content-type': type }); r.end(fs.readFileSync(f));
}).listen(8772);
const ORIGIN = 'http://localhost:8772';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const newPage = async (errors, w = 390, h = 844) => {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
};

/* A. start screen, About, privacy page, fonts served locally */
{
  const errors = []; const page = await newPage(errors);
  const external = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN)) external.push(r.url()); return r.url().startsWith(ORIGIN) ? r.continue() : r.abort(); });
  await page.goto(ORIGIN + '/'); await sleep(400);
  const start = await page.$eval('#start', (el) => el.innerText);
  check(/Try a sample neighborhood/.test(start) && /No owner names, ever/.test(start), 'first screen has the demo button and the no-owner-names line');
  check(!external.some((u) => /fonts\.g|arcgisonline/.test(u)), 'no Google Fonts or Esri requests on load: ' + external.filter((u) => /fonts|arcgisonline/.test(u)).join(' '));
  const fontOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px Fraunces'); });
  check(fontOk, 'fonts load from the site itself');
  await page.click('#openAbout'); await sleep(300);
  const about = await page.$eval('#aboutBody', (el) => el.innerText);
  check(/MassGIS/.test(about) && /FEMA/.test(about) && /USA Structures/.test(about) && /Florida TaxWatch/.test(about) && /No owner names/.test(about) && !/Esri World/.test(about), 'About lists every source and the privacy promise');
  await page.screenshot({ path: 'about.png' });
  await page.click('#aboutClose'); await sleep(200);
  const pr = await (await fetch(ORIGIN + '/privacy.html')).text();
  check(/Housepoint privacy policy/.test(pr) && /never asks for or shows owner names/.test(pr), 'privacy page is served');
  await page.click('#goDemo'); await sleep(900);
  check((await page.evaluate(() => location.search)) === '?demo=1', 'demo button opens the sample neighborhood');
  check(!errors.length, 'no page errors (start) ' + errors.join('; '));
  await page.close();
}

/* B. demo: buildings, aiming, tags, badges */
{
  const errors = []; const page = await newPage(errors);
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(ORIGIN) ? r.continue() : r.abort()));
  await page.goto(ORIGIN + '/?demo=1');
  await page.click('#goPoint'); await sleep(900);
  const b = await page.evaluate(() => { const S = window.__hp.S; return { n: S.bldgs.length, lots: S.local.length, withB: S.local.filter((l) => l.hasBldg).length }; });
  console.log('demo buildings:', JSON.stringify(b));
  check(b.n > 100 && b.withB === b.lots, 'every demo lot has a house outline');
  await page.evaluate(() => window.__hp.setHeading(60)); await sleep(900);
  const tags = await page.$$eval('.arc', (els) => els.filter((e) => e.style.opacity !== '0').length);
  check(tags >= 1, `tags still show with roof anchors (${tags})`);
  // the oldest demo house gets a badge
  const badge = await page.evaluate(() => {
    const S = window.__hp.S, sum = window.__hp.summarize;
    const L = S.local.filter((l) => sum(l.p).year).sort((a, b) => sum(a.p).year - sum(b.p).year)[0];
    return window.__hp.badgesFor(L);
  });
  console.log('oldest demo house badges:', badge.join(' | '));
  check(badge.some((x) => /^Oldest of \d+ houses nearby$/.test(x)), 'oldest house gets an "Oldest of N nearby" badge');
  await page.evaluate(() => { const S = window.__hp.S, sum = window.__hp.summarize;
    const L = S.local.filter((l) => sum(l.p).year).sort((a, b) => sum(a.p).year - sum(b.p).year)[0];
    window.__hp.openSheet([{ L, dist: 20, cdist: 20, bearing: 0 }], 0); });
  await sleep(500);
  const chips = await page.$eval('#cardBody .chips', (el) => el.innerText.replace(/\n/g, ' | '));
  console.log('card chips:', chips);
  check(/Oldest of \d+ houses nearby/.test(chips), 'badge shows on the card');
  check(!/Street view/.test(await page.$eval('#cardBody .aerial', (el) => el.innerText)), 'the demo card has no Street view link (its houses are made up)');
  await page.screenshot({ path: 'fix_card.png' });
  // map draws building outlines
  await page.evaluate(() => document.querySelector('.grab').click()); await sleep(300);
  await page.click('#toMap'); await sleep(900);
  await page.click('#colorSeg button[data-c="plain"]'); await sleep(300);
  const nb = await page.$$eval('#mBld path', (els) => els.length);
  check(nb > 100, `map shows building outlines (${nb})`);
  await page.screenshot({ path: 'fix_map.png' });
  check(!errors.length, 'no page errors (demo) ' + errors.join('; '));
  await page.close();
}

/* C. Massachusetts with fake services: roofs beat lawns, MassGIS photos, FY note */
{
  const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer';
  const BLD = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Building_Structures/FeatureServer/0';
  const FIELDS = ['OBJECTID', 'LOC_ID', 'POLY_TYPE', 'SITE_ADDR', 'CITY', 'TOWN_ID', 'FY', 'TOTAL_VAL', 'LS_DATE', 'LS_PRICE', 'USE_CODE', 'YEAR_BUILT', 'RES_AREA', 'UNITS'];
  const lat0 = 42.3, lon0 = -71.2, kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
  const ll = (b, x, y) => [b[0] + x / kx, b[1] + y / ky];
  const rect = (b, x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => ll(b, x, y));
  let base = null; const seen = { tiles: 0, naip: 0, bld: 0 };
  const errors = []; const page = await newPage(errors);
  await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.startsWith(ORIGIN)) return req.continue();
    if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: FIELDS.map((name) => ({ name })) });
    if (u.startsWith(MA_SVC + '/0/query')) {
      base = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
      const rec = (id, addr, extra = {}) => ({ OBJECTID: id, LOC_ID: addr.replace(/\W/g, ''), POLY_TYPE: 'FEE', SITE_ADDR: addr, CITY: 'NEWTON', TOWN_ID: 207, FY: 2025,
        TOTAL_VAL: 900000, USE_CODE: '1010', YEAR_BUILT: 1925, RES_AREA: 2000, UNITS: 1, ...extra });
      // Lot A: wide front lot with its house far to the left; Lot B: behind it, house visible across A's lawn.
      return json({ features: [
        { geometry: { rings: [rect(base, -60, 8, 60, 48)] }, attributes: rec(1, '10 ELM ST') },
        { geometry: { rings: [rect(base, -60, 48, 60, 90)] }, attributes: rec(2, '20 ELM ST', { YEAR_BUILT: 1890 }) },
      ] });
    }
    if (u.startsWith(BLD + '?f=json')) return json({ geometryType: 'esriGeometryPolygon', maxRecordCount: 2000 });
    if (u.startsWith(BLD + '/query')) { seen.bld++; return json({ features: [
      { geometry: { rings: [rect(base, -55, 20, -35, 35)] } },     // house A, far left
      { geometry: { rings: [rect(base, -8, 60, 8, 75)] } },        // house B, straight ahead behind A's lawn
    ] }); }
    if (u.includes('tiles.arcgis.com/tiles/hGdibHYSPO59RG1h')) { seen.tiles++; return req.abort(); }
    if (u.includes('imagery.nationalmap.gov')) { seen.naip++; return req.abort(); }
    return req.abort();
  });
  await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
  await page.goto(ORIGIN + '/');
  await page.click('#goPoint'); await sleep(1600);
  await page.evaluate(() => window.__hp.setHeading(0)); await sleep(500);
  const top = await page.evaluate(() => { const S = window.__hp.S; const c = window.__hp.findCandidates(S.pos.lat, S.pos.lon, 0); return c.map((x) => window.__hp.summarize(x.L.p).addr + ' @' + Math.round(x.dist)); });
  console.log('aiming north across lot A’s lawn:', top.join(' / '), '| building requests:', seen.bld);
  check(/^20 Elm St/.test(top[0] || ''), 'with roof outlines, the house you can see (20 Elm, behind the lawn) comes first');
  await page.click('#shutter'); await sleep(900);
  const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
  check(/This uses the FY2026 rate on the town’s FY2025 value \(the newest the state has\)\./.test(card) && !/likely low/.test(card), 'tax notes the year mismatch (not flagged as old)');
  const imgs = await page.$$eval('#cardBody .imgs image', (els) => els.map((e) => e.getAttribute('href')));
  console.log('card images after failures:', imgs.map((h) => h.split('/').slice(2, 3)).join(', '), '| credit:', await page.$eval('#cardBody .attr', (e) => e.innerText), '| tile requests:', seen.tiles, 'naip:', seen.naip);
  check(seen.tiles >= 4, 'card asked for MassGIS tiles');
  check(imgs.length === 1 && /nationalmap/.test(imgs[0]) && /USGS NAIP/.test(await page.$eval('#cardBody .attr', (e) => e.innerText)), 'when the MassGIS tiles fail, the USGS photo fills in and the credit changes');
  const share = await page.evaluate(async () => { const S = window.__hp.S; const b = await window.__hp.makeShareImage(S.candidates[0]); return b && b.size; });
  check(share > 10000, 'share image still renders when photos fail');
  check(!errors.length, 'no page errors (MA) ' + errors.join('; '));
  await page.close();
}

/* D. Florida: USGS photo only; rough tax title */
{
  const errors = []; const page = await newPage(errors);
  await page.goto(ORIGIN + '/');                     // not the demo: it shows no photos at all
  const r = await page.evaluate(() => {
    const set = window.__hp.imagerySet({ x0: -50, y0: -25, w: 100, h: 50 }, 780, 390, { inv: (x, y) => [29.9 + y / 110540, -81.3 + x / 96000], fwd: () => [0, 0] });
    const ma = window.__hp.imagerySet({ x0: -50, y0: -25, w: 100, h: 50 }, 780, 390, { inv: (x, y) => [42.36 + y / 110540, -71.06 + x / 82000], fwd: (la, lo) => [(lo + 71.06) * 82000, (la - 42.36) * 110540] });
    return { fl: [set.credit, set.parts.length, /nationalmap/.test(set.parts[0].href)], ma: [ma.credit, ma.parts.length, ma.parts[0].href.split('/tile/')[1]] };
  });
  console.log('imagery sets:', JSON.stringify(r));
  check(r.fl[0] === 'Imagery: USGS NAIP' && r.fl[1] === 1 && r.fl[2], 'Florida uses one USGS photo');
  check(r.ma[0] === 'Imagery: MassGIS 2025' && r.ma[1] >= 4 && r.ma[1] <= 96 && /^20\//.test(r.ma[2]), 'Massachusetts uses MassGIS tiles at full detail');
  check(!errors.length, 'no page errors (FL) ' + errors.join('; '));
  await page.close();
}

/* E. location denied -> map */
{
  const errors = []; const page = await newPage(errors);
  const ctx = await browser.createBrowserContext();
  const p2 = await ctx.newPage();
  await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.setRequestInterception(true);
  p2.on('request', (r) => (r.url().startsWith(ORIGIN) ? r.continue() : r.abort()));
  await p2.goto(ORIGIN + '/');
  await p2.click('#goPoint'); await sleep(2500);
  const st = await p2.evaluate(() => ({ mode: window.__hp.S.mode, help: document.querySelector('#mapHelpTxt').innerText }));
  console.log('location denied ->', JSON.stringify(st));
  check(st.mode === 'map' && /Location is off/.test(st.help), 'location turned off: goes to the map with a message');
  await ctx.close(); await page.close();
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
