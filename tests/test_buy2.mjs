// "Thinking of buying?" backup routes: Census tract lookups, an inactive Census key, a busy OpenStreetMap server.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8776);
const ORIGIN = 'http://localhost:8776';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const TW = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const ESRI = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Tracts/FeatureServer/0';
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
let mode = 'A'; const seen = []; const geoTimes = [];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  const real = window.fetch;
  window.fetch = (url, init = {}) => {
    if (window.__stall && /overpass/.test(String(url))) {
      window.__stallSeen = (window.__stallSeen || 0) + 1;
      return Promise.resolve(new Response(new ReadableStream({ start(c) {
        c.enqueue(new TextEncoder().encode('{"version":0.6,"generator":"Overpass API","elements":['));
        if (init.signal) init.signal.addEventListener('abort', () => c.error(new DOMException('The operation was aborted.', 'AbortError')));
      } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return real(url, init);
  };
});
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  const cb = /[?&]callback=(__hp\w+)/.exec(u);
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'Town_Name', 'Location', 'Assessed_Total', 'AYB', 'State_Use_Description'].map((name) => ({ name })) });
  if (u.startsWith(CT_SVC + '/query')) {
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    return json({ features: [{ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { OBJECTID: 1, Town_Name: 'WETHERSFIELD', Location: '211 MAIN ST', Assessed_Total: 350000, AYB: 1752, State_Use_Description: 'Single Fam' } }] });
  }
  if (u.startsWith(TW)) {
    seen.push(`${mode}:tiger${cb ? '-script' : ''}`);
    if (cb && mode === 'B') {
      const body = /\?f=json/.test(u) ? { layers: [{ id: 8, name: 'Census Tracts' }] } : { features: [{ attributes: { STATE: '09', COUNTY: '003', TRACT: '491700', BASENAME: '4917' } }] };
      return req.respond({ status: 200, contentType: 'application/javascript', body: `${cb[1]}(${JSON.stringify(body)})` });
    }
    if ('ADEF'.includes(mode)) return json(/\?f=json/.test(u) ? { layers: [{ id: 8, name: 'Census Tracts' }] } : { features: [{ attributes: { STATE: '09', COUNTY: '003', TRACT: { A: '491500', E: '491800', F: '492000' }[mode] || '491600', BASENAME: { A: '4915', E: '4918', F: '4920' }[mode] || '4916' } }] });
    return req.abort();                                                   // like a service that blocks other sites
  }
  if (u.startsWith(ESRI)) { seen.push(`${mode}:esri`); return req.abort(); }
  if (u.startsWith('https://geo.fcc.gov/')) { seen.push(`${mode}:fcc`); return req.abort(); }
  if (u.startsWith('https://api.census.gov/')) {
    seen.push(`${mode}:acs${/[?&]key=/.test(u) ? '-key' : '-nokey'}`);
    if ((mode === 'E' || mode === 'F') && /[?&]key=/.test(u)) return req.abort();         // the key's error page, blocked by the browser
    if (mode === 'D') return req.respond({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html><body>Invalid Key</body></html>' });
    const head = ['NAME', 'B01003_001E', 'B19013_001E', 'B25077_001E', 'B25003_001E', 'B25003_002E', 'B25035_001E', 'B25064_001E'];
    if (/for=tract/.test(u)) return json([[...head, 'state', 'county', 'tract'], ['Tract', '4321', '112500', '355000', '1700', '1350', '1956', '1800', '09', '003', '491900']]);
    return json([[...head, 'state'], ['Connecticut', '3605944', '93760', '343200', '1428313', '940000', '1965', '1431', '09']]);
  }
  if (u.startsWith('https://api.geoapify.com/')) {
    const q = new URL(u).searchParams, cat = q.get('categories'), [lo, la] = q.get('filter').replace('circle:', '').split(',').map(Number);
    seen.push(`${mode}:geo:${cat}`); geoTimes.push(Date.now());
    if (mode === 'R') return json({ message: 'limit' }, 429);
    if (mode === 'T') return json({ message: 'Invalid apiKey' }, 401);
    const f = (i, name, cats, dlat = 0.002) => ({ type: 'Feature', properties: { name, lat: la + dlat + i * 0.0001, lon: lo + 0.001, place_id: `${cat}-${i}`, categories: cats }, geometry: { type: 'Point', coordinates: [lo + 0.001, la + dlat + i * 0.0001] } });
    const feats = /supermarket/.test(cat) ? [f(0, 'Roche Bros.', ['commercial', 'commercial.supermarket'])]
      : /catering\.restaurant/.test(cat) ? Array.from({ length: 60 }, (_, i) => f(i, `Diner ${i}`, ['catering.restaurant'], 0.0005))
      : /public_transport\.bus/.test(cat) ? Array.from({ length: 20 }, (_, i) => f(i, null, ['public_transport.bus'], 0.0005))
      : /public_transport\.train/.test(cat) ? [f(0, 'Endicott', ['public_transport', 'public_transport.train'], 0.01)]
      : [];
    return json({ type: 'FeatureCollection', features: feats });
  }
  if (u.startsWith('https://overpass-api.de/')) { seen.push(`${mode}:op1`); if (mode === 'G') return; return json({ remark: 'too busy' }, 429); }   // G: slow server, never answers
  if (u.startsWith('https://overpass.kumi.systems/')) { seen.push(`${mode}:op3`); return req.abort(); }
  if (u.startsWith('https://overpass.private.coffee/')) {
    seen.push(`${mode}:op2`); if (mode === 'T') return req.abort();
    return json({ elements: [{ type: 'node', lat: 41.7139, lon: -72.652, tags: { shop: 'supermarket', name: 'Stop & Shop' } }, { type: 'count', tags: { total: '5' } }] });
  }
  return req.abort();
});
await page.goto(ORIGIN + '/');
await page.evaluate(() => { localStorage.setItem('housepoint.buyOpen', '1'); });
await page.reload(); await sleep(300);
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(200);
const run = async (m, lat, lon) => {
  mode = m;
  await page.evaluate((la, lo) => window.__hp.centerMap(la, lo), lat, lon); await sleep(1200);
  await page.evaluate(() => { const L = window.__hp.S.local[0]; window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
  await sleep(400); await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView());
  await sleep(3500);
  return page.$eval('#buyBox', (el) => el.innerText.replace(/\n+/g, ' | '));
};
const a = await run('A', 41.71156, -72.65372);
console.log('A hood:', a.slice(a.indexOf('NEIGHBORHOOD'), a.indexOf('NEIGHBORHOOD') + 120));
check(/NEIGHBORHOOD · CENSUS TRACT 4915/i.test(a) && /\$112,500/.test(a) && !seen.some((x) => /esri/.test(x)), 'tract found on the Census map; no Esri-hosted backup is asked');
check(/Grocery \| Stop & Shop/.test(a) && seen.includes('A:op1') && seen.includes('A:op2'), 'busy OpenStreetMap server: the next one answers');
const b = await run('B', 41.75, -72.70);
console.log('B hood:', b.slice(b.indexOf('NEIGHBORHOOD'), b.indexOf('NEIGHBORHOOD') + 60), '| requests:', seen.filter((x) => x.startsWith('B')).join(' '));
check(/NEIGHBORHOOD · CENSUS TRACT 4917/i.test(b), 'both map lookups blocked: the script route works');
const c = await run('C', 41.79, -72.75);
const why = await page.$eval('#bHood .why', (el) => el.textContent).catch(() => '');
console.log('C reason:', why);
check(/Couldn’t load this right now/.test(c) && /Census map: blocked or offline/.test(why) && /FCC: blocked or offline/.test(why), 'every route failed: the card says how');
const d = await run('D', 41.83, -72.80);
const whyD = await page.$eval('#bHood .why', (el) => el.textContent).catch(() => '');
console.log('D reason:', whyD);
check(/Census key isn’t active yet/.test(whyD), 'an inactive Census key is named as the reason');
const e1 = await run('E', 41.87, -72.85);
check(/NEIGHBORHOOD · CENSUS TRACT 4918/i.test(e1) && /\$112,500/.test(e1) && seen.includes('E:acs-key') && seen.includes('E:acs-nokey'), 'key refused: the Census figures load without it');
const e2 = await run('F', 41.95, -72.95);
check(/CENSUS TRACT 4920/i.test(e2) && /\$112,500/.test(e2) && seen.includes('F:acs-nokey') && !seen.includes('F:acs-key'), 'after that, the key is skipped (no wasted requests)');
// A slow first server: the next one is asked after a few seconds and its answer is used.
mode = 'G';
await page.evaluate(() => window.__hp.centerMap(41.65, -72.75)); await sleep(1200);
await page.evaluate(() => { const L = window.__hp.S.local[0]; window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(400); await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView());
const t0 = Date.now();
while (Date.now() - t0 < 15000 && !/5 within half a mile/.test(await page.$eval('#bNear', (el) => el.innerText).catch(() => ''))) await sleep(250);
const tg = (Date.now() - t0) / 1000;
check(tg > 5 && tg < 10 && seen.includes('G:op1') && seen.includes('G:op2') && !seen.includes('G:op3'), `slow server: the next one is asked after ~7 s and answers (${tg.toFixed(1)} s); the third isn’t bothered`);
// Every server sends its first bytes and then stalls (what a phone saw): a waiting note, then a reason and Try again.
mode = 'S'; await page.evaluate(() => { window.__stall = true; window.__stallSeen = 0; });
await page.evaluate(() => window.__hp.centerMap(41.60, -72.85)); await sleep(1200);
await page.evaluate(() => { const L = window.__hp.S.local[0]; window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(400); await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView());
await sleep(10500);
const waiting = await page.$eval('#bNear', (el) => el.innerText);
check(/Still waiting on OpenStreetMap/.test(waiting) && (await page.evaluate(() => window.__stallSeen)) === 2, 'stalled: says it’s still waiting and has asked a second server');
const t1 = Date.now();
while (Date.now() - t1 < 40000 && !(await page.$('#bNear [data-retry]'))) await sleep(500);
const whyS = await page.$eval('#bNear .why', (el) => el.textContent).catch(() => '');
console.log('S reason:', whyS, `(${((Date.now() - t1) / 1000 + 10.9).toFixed(0)} s)`);
check(/no answer in 25 seconds/.test(whyS) && (await page.evaluate(() => window.__stallSeen)) === 3 && (await page.$('#bNear [data-retry]')) !== null, 'gives up with a reason and a Try again button instead of loading forever');
await page.evaluate(() => { window.__stall = false; });
mode = 'G';
await page.click('#bNear [data-retry]');
const t2 = Date.now();
while (Date.now() - t2 < 15000 && !/5 within half a mile/.test(await page.$eval('#bNear', (el) => el.innerText).catch(() => ''))) await sleep(250);
check(/5 within half a mile/.test(await page.$eval('#bNear', (el) => el.innerText)) && /NEIGHBORHOOD/i.test(await page.$eval('#buyBox', (el) => el.innerText)), 'Try again loads it');
// Geoapify, once a key is set: fast, and the volunteer servers aren't asked.
await page.evaluate(() => { window.__hp.KEYS.geoapify = 'testkey'; });
geoTimes.length = 0;
const qa = await run('Q', 41.68, -72.72);
const qgeo = seen.filter((x) => x.startsWith('Q:geo')).length, spread = (geoTimes[geoTimes.length - 1] - geoTimes[0]) / 1000;
console.log('Q nearby:', qa.slice(qa.indexOf('NEARBY'), qa.indexOf('NEARBY') + 400));
check(qgeo === 11 && !seen.some((x) => /^Q:op/.test(x)) && /Grocery \| Roche Bros\./.test(qa) && /Train \| Endicott/.test(qa), `Geoapify answers Nearby; no volunteer server asked (${qgeo} requests)`);
check(spread >= 2.2 && spread < 4, `requests spaced out under the free plan's 5 a second (${spread.toFixed(1)} s for all)`);
check(/Bus stop \| 20\+ within 0\.5 mi/.test(qa) && /Restaurants \| 60\+ within half a mile/.test(qa) && /via Geoapify/.test(qa) && /powered by Geoapify/.test(qa), 'capped counts say “+”, and Geoapify is credited');
const ra = await run('R', 41.715, -72.655);
check(/Grocery \| Stop & Shop/.test(ra) && seen.includes('R:op2'), 'Geoapify out of free lookups: the volunteer servers fill in');
const ta = await run('T', 41.64, -72.80);
await sleep(1500);
const whyT = await page.$eval('#bNear .why', (el) => el.textContent).catch(() => '');
console.log('T reason:', whyT);
check(/^Geoapify: the key was refused · /.test(whyT), 'both fail: the reason names the Geoapify key problem first');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
