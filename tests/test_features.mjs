// AR tags, map coloring, flood + elevation.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8766);
const ORIGIN = 'http://localhost:8766';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

async function newPage(errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.stack.split('\n').slice(0, 3).join(' <- ')));
  return page;
}

/* ---------- A. AR tags (demo data) ---------- */
{
  const errors = [];
  const page = await newPage(errors);
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().startsWith(ORIGIN) ? r.continue() : r.abort()));
  await page.goto(ORIGIN + '/?demo=1&debug=1');
  await page.click('#goPoint'); await sleep(900);
  const fov = await page.evaluate(() => window.__hp.viewFovDeg());
  check(fov > 30 && fov < 40, `default view width on a 390x844 phone is ~34° (got ${fov.toFixed(1)}°)`);
  await page.evaluate(() => window.__hp.setHeading(80)); await sleep(900);
  const tags = await page.$$eval('.arc', (els) => els.map((el) => { const r = el.getBoundingClientRect(); return { k: el.dataset.k, t: el.innerText.replace(/\n/g, ' / '), op: getComputedStyle(el).opacity, x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const shown = tags.filter((t) => +t.op > 0.4);
  console.log('tags shown:', shown.map((t) => `${t.t} @${Math.round(t.x)},${Math.round(t.y)}`).join(' | '));
  check(shown.length >= 3 && shown.length <= 7, `3–7 tags visible looking down the street (got ${shown.length})`);
  check(shown.every((t) => t.x + t.w / 2 >= 0 && t.x + t.w / 2 <= 390 && t.y > 100 && t.y < 700), 'tag centers sit inside the camera area');
  let overlap = 0;
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    const a = shown[i], b = shown[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap++;
  }
  check(overlap === 0, `no overlapping tags (${overlap} overlaps)`);
  const live = await page.evaluate(() => window.__hp.S.live && window.__hp.S.live.L.p.key);
  check(!tags.some((t) => t.k === live), 'the house in the circle gets the big label, not a tag');
  await page.screenshot({ path: 'ar_tags.png' });

  // turning moves the tags the right way (turn right -> things slide left)
  const vis = (els) => Object.fromEntries(els.filter((el) => el.style.opacity !== '0').map((el) => [el.dataset.k, el.getBoundingClientRect().left]));
  const before = await page.$$eval('.arc', vis);
  await page.evaluate(() => window.__hp.setHeading(83)); await sleep(500);
  const after = await page.$$eval('.arc', vis);
  const common = Object.keys(before).filter((k) => k in after);
  check(common.length > 0 && common.every((k) => after[k] < before[k]), `turning right slides tags left (${common.length} compared)`);

  // tap a tag -> its card
  const tgt = await page.evaluate(() => { const v = window.__hp.AR.items.find((i) => !i.hidden && i.el.style.opacity === '1'); return v && { k: v.k, addr: window.__hp.summarize(v.L.p).addr }; });
  await page.evaluate((k) => document.querySelector(`.arc[data-k="${k}"]`).click(), tgt.k);
  await sleep(700);
  const addr = await page.$eval('#cardBody .addr', (el) => el.innerText);
  check(addr === tgt.addr, `tapping a tag opens that house (${tgt.addr} → ${addr})`);
  check(await page.$$eval('.arc', (els) => els.length) === 0, 'tags clear while the card is open');
  const flood = await page.$eval('#floodBox', (el) => el.className + ' | ' + el.innerText.replace(/\n/g, ' / '));
  console.log('demo flood box:', flood);
  check(/Ground ≈/.test(flood) && !/Checking/.test(flood), 'flood box filled in (demo values)');
  await page.screenshot({ path: 'ar_card.png' });
  await page.click('.grab'); await sleep(600);
  check(await page.$$eval('.arc', (els) => els.length) > 0, 'tags come back when the card closes');

  // labels toggle
  await page.click('#arPill'); await sleep(300);
  check(await page.$$eval('.arc', (els) => els.length) === 0 && await page.$eval('#arPill', (el) => el.innerText) === 'Labels off', 'Labels off hides tags');
  await page.click('#arPill'); await sleep(500);
  check(await page.$$eval('.arc', (els) => els.length) > 0, 'Labels on brings them back');

  // landscape: no tags (they assume a phone held up in portrait)
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(500);
  check(await page.$$eval('.arc', (els) => els.length) === 0, 'no tags in landscape');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await sleep(600);
  check(await page.$$eval('.arc', (els) => els.length) > 0, 'tags return in portrait');
  // debug overlay has the view line
  console.log('debug:', (await page.$eval('#debug', (el) => el.innerText)).split('\n').find((l) => l.startsWith('view')));

  /* ---------- B. Map coloring (same demo page) ---------- */
  await page.click('#toMap'); await sleep(900);
  check(await page.$$eval('.arc', (els) => els.length) === 0, 'no tags in map mode');
  for (const mode of ['age', 'value', 'sold', 'plain']) {
    await page.click(`#colorSeg button[data-c="${mode}"]`); await sleep(400);
    const info = await page.evaluate(() => {
      const fills = [...document.querySelectorAll('#mParcels path')].map((p) => p.getAttribute('fill'));
      const lg = document.querySelector('#legend');
      return { distinct: [...new Set(fills)].length, legend: lg.classList.contains('hidden') ? '' : lg.innerText.replace(/\n/g, ' '), on: document.querySelector('#colorSeg .on').dataset.c };
    });
    console.log(`map ${mode}: ${info.distinct} fill colors | legend: ${info.legend}`);
    if (mode === 'plain') check(!info.legend, 'Photo mode has no legend');
    else check(info.legend && info.distinct >= 4 && info.on === mode, `${mode} colors lots and shows a legend`);
    if (mode === 'age') await page.screenshot({ path: 'map_age.png' });
    if (mode === 'value') await page.screenshot({ path: 'map_value.png' });
  }
  await page.click('#colorSeg button[data-c="age"]'); await sleep(200);
  await page.mouse.click(195, 470); await sleep(700);
  check(await page.$eval('#sheet', (el) => el.classList.contains('open')), 'tapping a colored lot still opens its card');
  await page.screenshot({ path: 'map_age_card.png' });
  const stored = await page.evaluate(() => localStorage.getItem('housepoint.colorBy'));
  check(stored === 'age', 'map color choice is remembered');
  check(!errors.length, 'no page errors (demo): ' + errors.join('; '));
  await page.close();
}

/* ---------- C. ?fov override ---------- */
{
  const errors = []; const page = await newPage(errors);
  await page.goto(`file://${HP_ROOT}/index.html?demo=1&fov=60`);
  const fov = await page.evaluate(() => window.__hp.viewFovDeg());
  check(Math.abs(fov - 60) < 0.01, `?fov=60 sets the view width (got ${fov.toFixed(2)})`);
  await page.close();
}

/* ---------- D. Flood + elevation against faked FEMA / Esri / USGS ---------- */
{
  const MA_SVC = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/L3_TAXPAR_POLY_ASSESS_gdb/FeatureServer';
  const FEMA = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
  const ESRI = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query';
  const MA_FIELDS = ['OBJECTID', 'LOC_ID', 'POLY_TYPE', 'SITE_ADDR', 'CITY', 'FY', 'TOTAL_VAL', 'LAND_VAL', 'LS_DATE', 'LS_PRICE', 'USE_CODE', 'YEAR_BUILT', 'RES_AREA', 'STYLE', 'STORIES', 'NUM_ROOMS', 'UNITS'];
  let base = null; const seen = { fema: [], esri: 0, epqs: [] };
  const lat0 = 42.5196, lon0 = -70.8996, kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
  const lotIndex = (lon) => Math.floor(((lon - base[0]) * kx + 60 + 0.5) / 20);
  const errors = []; const page = await newPage(errors);
  await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.startsWith(ORIGIN)) return req.continue();
    if (u.startsWith(MA_SVC + '?f=json')) return json({ layers: [{ id: 0, geometryType: 'esriGeometryPolygon' }] });
    if (u.startsWith(MA_SVC + '/0?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: MA_FIELDS.map((name) => ({ name })) });
    if (u.startsWith(MA_SVC + '/0/query')) {
      const body = new URLSearchParams(req.postData() || '');
      base = body.get('geometry').split(',').map(Number);
      const feats = [];
      for (let j = 0; j < 6; j++) {
        const x0 = -60 + j * 20;
        const ring = [[x0, 6], [x0 + 20, 6], [x0 + 20, 36], [x0, 36], [x0, 6]].map(([x, y]) => [base[0] + x / kx, base[1] + y / ky]);
        feats.push({ geometry: { rings: [ring] }, attributes: { OBJECTID: j + 1, LOC_ID: 'MA' + j, POLY_TYPE: 'FEE', SITE_ADDR: `${20 + j} DERBY ST`, CITY: 'SALEM', FY: 2026, TOTAL_VAL: 800000 + j * 1000, LS_DATE: '20190315', LS_PRICE: 700000, USE_CODE: '1010', YEAR_BUILT: 1850 + j, RES_AREA: 2000, UNITS: 1 } });
      }
      return json({ features: feats });
    }
    const lotOf = (body) => { const type = body.get('geometryType'); return { type, j: lotIndex(type === 'esriGeometryPoint' ? +body.get('geometry').split(',')[0] : JSON.parse(body.get('geometry')).rings[0][0][0] + 1e-6) }; };
    const zonesFor = (j, type) => {
      const A = (o) => ({ attributes: o });
      if (j === 0) return [A({ FLD_ZONE: 'AE', ZONE_SUBTY: null, SFHA_TF: 'T', STATIC_BFE: 11, V_DATUM: 'NAVD88' })];
      if (j === 1) return type === 'esriGeometryPoint' ? [A({ FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 })]
        : [A({ FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F', STATIC_BFE: -9999 }), A({ FLD_ZONE: 'AE', SFHA_TF: 'T', STATIC_BFE: 9, V_DATUM: 'NGVD29' })];
      if (j === 2) return [A({ FLD_ZONE: 'X', ZONE_SUBTY: '0.2 PCT ANNUAL CHANCE FLOOD HAZARD', SFHA_TF: 'F' })];
      if (j === 3) return [];
      if (j === 5) return type === 'esriGeometryPoint' ? [A({ FLD_ZONE: 'OPEN WATER' })]
        : [A({ FLD_ZONE: 'OPEN WATER' }), A({ FLD_ZONE: 'VE', SFHA_TF: 'T', STATIC_BFE: 13, V_DATUM: 'NAVD88' }), A({ FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD' })];
      return [A({ FLD_ZONE: 'VE', SFHA_TF: 'T', STATIC_BFE: 14 })];
    };
    const lower = (fs) => fs.map((f) => ({ attributes: Object.fromEntries(Object.entries(f.attributes).map(([k, v]) => [k.toLowerCase(), v])) }));
    if (u.startsWith(ESRI)) {          // Esri's copy: same zones, lower-case field names
      seen.esri++;
      const { type, j } = lotOf(new URLSearchParams(req.postData() || ''));
      return json({ features: lower(zonesFor(j, type)) });
    }
    if (u.startsWith(FEMA)) {
      const body = new URLSearchParams(req.postData() || ''); seen.fema.push(body.get('geometryType'));
      const { type, j } = lotOf(body);
      if (j === 2) return json({ error: { code: 500, message: 'down' } });
      return json({ features: zonesFor(j, type) });
    }
    if (u.startsWith('https://epqs.nationalmap.gov/v1/json')) {
      const q = new URL(u).searchParams; seen.epqs.push(q.toString());
      const j = lotIndex(+q.get('x'));
      return json({ location: {}, locationId: 0, value: j === 3 ? -1000000 : String(4.6 + j * 3.1), rasterId: 1, resolution: 1 });
    }
    return req.abort();
  });
  await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
  await page.goto(ORIGIN + '/');
  await page.click('#goPoint'); await sleep(1500);
  const expect = {
    0: ['high', /AE.*High flood risk.*insurance.*Ground ≈ 5 ft.*100-year flood level ≈ 11 ft/s],
    1: ['moderate', /^(?!.*100-year).*X.*Next to a high-risk flood zone.*Part of the lot is in zone AE.*Ground ≈ 8 ft/s],
    3: ['', /No FEMA flood map/],
    2: ['', /Flood map didn’t load.*Ground ≈ 11 ft/s],          // FEMA is down and there's no longer an Esri-hosted backup
    4: ['high', /^(?!.*100-year).*VE.*coastal/s],
    5: ['high', /VE.*coastal.*100-year flood level ≈ 13 ft/s],
  };
  for (const j of [0, 1, 3, 2, 4, 5]) {
    const r = await page.evaluate(async (id) => {
      const S = window.__hp.S; const L = S.local.find((l) => l.p.key === id);
      if (!L) return null;
      window.__hp.openSheet([{ L, dist: 10, cdist: 20, bearing: 0 }], 0);
      await new Promise((ok) => setTimeout(ok, 600));
      const b = document.querySelector('#floodBox'); return { cls: b.className, txt: b.innerText.replace(/\n/g, ' / ') };
    }, 'MA' + j);
    console.log(`lot ${j}: [${r && r.cls}] ${r && r.txt}`);
    check(r && r.cls.replace(/^flood\s*/, '').trim() === expect[j][0], `lot ${j} risk style`);
    check(r && expect[j][1].test(r.txt), `lot ${j} text`);
  }
  const fc = await page.evaluate(() => {
    const f = window.__hp.floodClass;
    return ['1 PCT DEPTH LESS THAN 1 FOOT', '1 PCT DRAINAGE AREA LESS THAN 1 SQUARE MILE', '1 PCT FUTURE CONDITIONS', 'AREA OF MINIMAL FLOOD HAZARD', 'AREA WITH REDUCED FLOOD RISK DUE TO LEVEE', '']
      .map((st) => f({ FLD_ZONE: 'X', ZONE_SUBTY: st }).risk).concat([f({ FLD_ZONE: 'AE' }).risk, f({ FLD_ZONE: 'A99' }).risk, f({ FLD_ZONE: 'D' }).risk, f({ FLD_ZONE: 'ZZ', SFHA_TF: 'T' }).risk, String(f({ FLD_ZONE: 'AREA NOT INCLUDED' }))]);
  });
  console.log('floodClass:', fc.join(', '));
  check(fc.join(',') === 'moderate,moderate,moderate,low,moderate,low,high,high,unknown,high,null', 'zone X subtypes and SFHA flag classified correctly');
  check(seen.esri === 0, 'never asks Esri’s hosted copy (dropped over its terms)');
  check(seen.fema.includes('esriGeometryPoint'), 'checks the middle of a lot that crosses zones');
  check(!seen.epqs.some((q) => /DERBY|SALEM/i.test(q)), 'elevation request carries only coordinates');
  await page.screenshot({ path: 'flood_card.png' });
  // reopening uses the cache (no new FEMA calls)
  const n = seen.fema.length;
  await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.key === 'MA0'); window.__hp.openSheet([{ L, dist: 10, cdist: 20, bearing: 0 }], 0); });
  await sleep(300);
  check(seen.fema.length === n, 'flood result cached per lot');
  check(!errors.length, 'no page errors (flood): ' + errors.join('; '));
  await page.close();
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
