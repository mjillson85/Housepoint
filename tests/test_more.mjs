// Monthly cost calculator, Save and compare, Nearby walk times / filters / rings map. All outside services faked.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8777);
const ORIGIN = 'http://localhost:8777';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CT_SVC = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0';
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 41.71156, lon0 = -72.65372;
const off = (dx, dy) => [lon0 + dx / (Math.cos(lat0 * Math.PI / 180) * 111320), lat0 + dy / 110540];
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const pay = (price, down, rate, years) => { const loan = price * (1 - down / 100), r = rate / 1200, n = years * 12; return loan * r / (1 - Math.pow(1 + r, -n)); };
const seen = { overpass: '', tiles: 0, tileUrl: '' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o, status = 200) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(CT_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, fields: ['OBJECTID', 'Town_Name', 'Location', 'Assessed_Total', 'AYB', 'State_Use_Description',
    'Living_Area', 'Number_of_Bedroom', 'Number_of_Baths', 'Number_of_Half_Baths', 'Sale_Price', 'Sale_Date', 'Collection_Year'].map((name) => ({ name })) });
  if (u.startsWith(CT_SVC + '/query')) {
    const b = new URLSearchParams(req.postData() || '').get('geometry').split(',').map(Number);
    return json({ features: [
      { geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { OBJECTID: 1, Town_Name: 'WETHERSFIELD', Location: '211 MAIN ST', Assessed_Total: 560000, AYB: 1752, State_Use_Description: 'Single Fam',
        Living_Area: 2400, Number_of_Bedroom: 4, Number_of_Baths: 2, Number_of_Half_Baths: 1, Sale_Price: 610000, Sale_Date: Date.UTC(2004, 5, 1), Collection_Year: '2025' } },
      { geometry: { rings: [ring(-40, -12, -15, 12, b)] }, attributes: { OBJECTID: 2, Town_Name: 'WETHERSFIELD', Location: '220 MAIN ST', Assessed_Total: 280000, AYB: 1840, State_Use_Description: 'Single Fam',
        Living_Area: 1500, Number_of_Bedroom: 3, Number_of_Baths: 1, Sale_Price: 455000, Sale_Date: Date.UTC(2025, 2, 3), Collection_Year: '2025' } }] });
  }
  if (u.startsWith('https://hazards.fema.gov/')) {
    const body = new URLSearchParams(req.postData() || '');
    const g = body.get('geometry'); const x = g.startsWith('{') ? JSON.parse(g).rings[0][0][0] : +g.split(',')[0];
    return json({ features: [{ attributes: x > lon0 ? { FLD_ZONE: 'AE', SFHA_TF: 'T' } : { FLD_ZONE: 'X', ZONE_SUBTY: 'AREA OF MINIMAL FLOOD HAZARD', SFHA_TF: 'F' } }] });
  }
  if (u.startsWith('https://overpass-api.de/')) {
    seen.overpass = decodeURIComponent((req.postData() || '').replace(/^data=/, ''));
    const n = (dx, dy, tags) => { const [x, y] = off(dx, dy); return { type: 'node', lat: y, lon: x, tags }; };
    return json({ elements: [
      n(500, 400, { shop: 'supermarket', name: 'Stop & Shop' }), n(1200, -900, { shop: 'supermarket', name: 'Big Y' }),
      n(150, 0, { amenity: 'cafe', name: 'Main Street Creamery' }), n(-300, 200, { amenity: 'cafe' }),
      n(260, -40, { leisure: 'park', name: 'Cove Park' }), { ...n(60, 40, { highway: 'bus_stop' }), id: 901 }, { ...n(78, 52, { highway: 'bus_stop' }), id: 902 },   // two unnamed stops across a street
      n(4000, 3000, { railway: 'station', name: 'Hartford Union Station' }),
      { type: 'count', tags: { total: '4' } },
      n(200, 100, { amenity: 'restaurant', name: 'Village Pizza' }), n(400, -250, { amenity: 'fast_food', name: 'Burger Spot' }),
      n(700, 100, { amenity: 'restaurant', name: 'Lucky Lou’s' }), n(200, 100, { amenity: 'restaurant', name: 'Village Pizza' })] });
  }
  if (u.startsWith('https://basemap.nationalmap.gov/')) { seen.tiles++; seen.tileUrl = u; return req.abort(); }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('housepoint.buyOpen', '1'); });
await page.reload(); await sleep(300);
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(1800);

/* ---------- Monthly cost ---------- */
const total = () => page.$eval('#cTotal', (el) => el.textContent.replace(/\s+/g, ' ').trim());
const tax = 560000 * 41.22 / 1000, ins = 2028;
const expect1 = pay(800000, 20, 7.18, 30) + tax / 12 + ins / 12;
const t1 = await total();
console.log('calc default:', t1, 'expected', Math.round(expect1));
check(await page.$eval('#cPrice', (el) => el.value) === '$800,000', 'price starts at the higher of value ($800k) and an old sale ($610k)');
check(t1 === `≈ $${Math.round(expect1).toLocaleString()} a month`, '20% down, 7.18%, 30 years, CT tax and insurance');
const rows1 = await page.$eval('#cRows', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('rows:', rows1);
check(/Loan payment \| \$640,000 at 7\.18% for 30 years \| \$4,336/.test(rows1) && /Property tax \| \$1,924/.test(rows1) && /Insurance \| \$169/.test(rows1) && !/Mortgage insurance/.test(rows1), 'breakdown rows');
await page.evaluate(() => document.querySelector('#bCalc [data-down="5"]').click()); await sleep(100);
const expect2 = pay(800000, 5, 7.18, 30) + tax / 12 + ins / 12 + 800000 * 0.95 * 0.006 / 12;
check(await total() === `≈ $${Math.round(expect2).toLocaleString()} a month` && /Mortgage insurance/.test(await page.$eval('#cRows', (el) => el.innerText)), '5% down adds mortgage insurance');
await page.evaluate(() => { const i = document.querySelector('#cPrice'); i.value = '$700,000'; i.dispatchEvent(new Event('input')); const r = document.querySelector('#cRate'); r.value = '6.5'; r.dispatchEvent(new Event('input')); });
await page.evaluate(() => document.querySelector('#bCalc [data-term="15"]').click()); await sleep(100);
const expect3 = pay(700000, 5, 6.5, 15) + tax / 12 + ins / 12 + 700000 * 0.95 * 0.006 / 12;
check(await total() === `≈ $${Math.round(expect3).toLocaleString()} a month`, 'typed price, rate and a 15-year loan');
const note = await page.$eval('#cNote', (el) => el.textContent);
check(/Freddie Mac’s average 30-year rate was 7\.18% \(Nov 5, 2026\)/.test(note) && /shorter loans usually run a bit lower/.test(note) && /Cash needed: \$35,000 down/.test(note), 'notes: rate source, shorter loans, cash needed');
const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('housepoint.calc')));
check(prefs.down === 5 && prefs.rate === 6.5 && prefs.term === 15, 'down payment, rate and term are remembered');
const onChips = await page.$$eval('#bCalc .cchips button.on', (bs) => bs.map((b) => b.textContent));
check(onChips.join(',') === '5%,15 yr', 'exactly one down payment and one term highlighted (' + onChips.join(',') + ')');
await page.evaluate(() => document.querySelector('#bCalc').scrollIntoView()); await sleep(150);
await page.screenshot({ path: 'calc.png' });
check(await page.$eval('#cPrice', (el) => getComputedStyle(el).fontSize) === '16px', 'calculator fields are 16px (no iPhone zoom on focus)');
const pm = await page.evaluate(() => { const { parseMoney: p, dollars: d } = window.__hp; return [p('$800.000'), p('$650,000'), p('700k'), p('1.2M'), p(' $ 455,000 '), p(''), d(800000), d(1234567.4)]; });
check(JSON.stringify(pm) === JSON.stringify([800000, 650000, 700000, 1200000, 455000, 0, '$800,000', '$1,234,567']), 'money in and out the same on any phone language: ' + JSON.stringify(pm));
const homes = await page.evaluate(() => ['Commercial', 'Industrial', 'Tax-exempt property', 'Mobile home park or parking lot', 'Town or city property', 'Single-family home', 'Condo', 'Two-family', 'Vacant land', 'Farm land', 'Residential', 'Apartments, 4–8 units', 'Mixed use'].map((u) => window.__hp.NOT_A_HOME.test(u)));
check(JSON.stringify(homes) === JSON.stringify([true, true, true, true, true, false, false, false, false, false, false, false, false]), 'calculator skipped only for non-homes');

/* ---------- Nearby: walk times, filters, rings ---------- */
const near = await page.$eval('#bNear', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('nearby (all):', near.slice(0, 400));
check(/Grocery \| Stop & Shop \| \d+ min walk \| 0\.4 mi/.test(near) && /Train \| Hartford Union Station \| \d+ min drive/.test(near), 'walk and drive times beside distances');
check(/Restaurants \| 4 within half a mile/.test(near), 'restaurant count kept');
check(/Bus stop \| 2 within 0\.5 mi/.test(near), 'two unnamed bus stops close together both count');
const z = +(seen.tileUrl.match(/tile\/(\d+)\//) || [])[1];
check(z === 14 && /N ↑/.test(await page.$eval('#bNear .radar svg', (el) => el.textContent)), `base map one zoom finer (z=${z}) and a north mark`);
check(/Services/.test(await page.$eval('#bNear .nchips', (el) => el.textContent)) && (await page.$$eval('#bNear .nchips button[aria-pressed="true"]', (e) => e.length)) === 1, 'Services chip for the purple dots; chips say which is on');
check(/->\.f;\.f out count;\.f out center qt 60;/.test(seen.overpass), 'restaurants counted and listed in the same query');
const dotsAll = await page.$$eval('#bNear .radar circle[fill^="#"]', (els) => els.filter((e) => e.getAttribute('fill') !== '#b4432c').length);
const ringsN = await page.$$eval('#bNear .radar circle[stroke-dasharray]', (els) => els.length);
check(ringsN === 3 && dotsAll >= 8 && seen.tiles > 0, `rings map: 3 rings, ${dotsAll} dots, base map tiles asked for`);
await page.evaluate(() => document.querySelector('#bNear .nchips [data-g="dining"]').click()); await sleep(200);
const dining = await page.$eval('#bNear', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('nearby (dining):', dining.slice(0, 360));
check(/Coffee \| Main Street Creamery/.test(dining) && /Restaurant \| Village Pizza/.test(dining) && /Restaurant \| Burger Spot/.test(dining) && /Coffee \| Café/.test(dining) && !/Stop & Shop/.test(dining), 'Dining filter lists cafés and restaurants, unnamed ones by kind');
check((dining.match(/Village Pizza/g) || []).length === 1, 'a place listed twice in the data shows once');
const dotsDining = await page.$$eval('#bNear .radar circle[fill="#eb6834"]', (els) => els.length);
const dotsOther = await page.$$eval('#bNear .radar circle[fill="#2a78d6"]', (els) => els.length);
check(dotsDining >= 4 && dotsOther === 0, 'the map shows only the chosen kind');
await page.evaluate(() => document.querySelector('#bNear').scrollIntoView()); await sleep(250);
await page.screenshot({ path: 'nearby_rings.png' });

/* ---------- Save and compare ---------- */
await page.evaluate(() => document.querySelector('#cardBody').scrollTo(0, 0)); await sleep(100);
await page.click('#saveBtn'); await sleep(300);
check(await page.$eval('#saveBtn', (el) => el.textContent.trim()) === 'Saved', 'Save button turns into Saved');
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 270 }], 0); });
await sleep(1200);
await page.click('#saveBtn'); await sleep(400);
await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(1500);   // loads the buying section: fills in the grocery
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('housepoint.saved.v1')));
console.log('saved:', saved.map((x) => `${x.addr} flood=${x.flood} grocery=${x.grocery} price=${x.calc.price}`).join(' / '));
check(saved.length === 2 && saved[0].addr === '220 Main St' && saved[1].addr === '211 Main St', 'two houses saved, newest first');
check(saved[1].flood === 'AE · high risk' && saved[0].flood === 'X · minimal', 'flood zones recorded');
check(saved[1].calc.price === 700000, 'the price typed in the calculator is kept with the saved house');
check(/Stop & Shop/.test(saved[0].grocery || '') && /Stop & Shop/.test(saved[1].grocery || ''), 'nearest grocery filled in, whether the section loaded before or after saving');
await page.evaluate(() => window.__hp.openPanel('saved')); await sleep(300);
const cmp = await page.$eval('#panelBody', (el) => el.innerText.replace(/[\n\t]+/g, ' | '));
console.log('compare:', cmp.slice(0, 700));
const heads = await page.$$eval('.cmp thead th.h a', (els) => els.map((e) => e.textContent));
check(heads.join(',') === '220 Main St,211 Main St' && /Saved \(2\)/.test(await page.$eval('#tabSaved', (el) => el.textContent)), 'Saved tab with a column per house');
check(/Value \| \$400k \| appraised \| \$800k/.test(cmp) && /Last sale \| \$455,000/.test(cmp) && /Beds · baths \| 3 · 1 \| 4 · 2 \+ 1 half/.test(cmp), 'value, sale, beds and baths rows');
const exp211 = pay(700000, 5, 6.5, 15) + tax / 12 + ins / 12 + 700000 * 0.95 * 0.006 / 12;
check(new RegExp(`Monthly cost \\| ≈ \\$[\\d,]+ \\| at 5% down, 6\\.5% \\| ≈ \\$${Math.round(exp211).toLocaleString()}`).test(cmp), 'monthly cost uses each house’s price and the current loan settings');
check(/Flood zone \| X · minimal \| AE · high risk/.test(cmp), 'flood row');
await page.screenshot({ path: 'compare.png' });
await page.evaluate(() => document.querySelector('.cmp [data-remove="1"]').click()); await sleep(200);
check((await page.evaluate(() => JSON.parse(localStorage.getItem('housepoint.saved.v1')).length)) === 1 && /Save another house/.test(await page.$eval('#panelBody', (el) => el.innerText)), 'Remove takes a house out');
await page.evaluate(() => document.querySelector('.cmp [data-open="0"]').click()); await sleep(800);
check(await page.$eval('#sheet', (el) => el.classList.contains('open')) && /220 Main St/.test(await page.$eval('#cardBody .addr', (el) => el.textContent)), 'tapping a saved house opens its card');
/* ---------- Fixes from the review ---------- */
// A typed asking price survives a reload for a saved house (220 Main is saved and open).
await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(1500);
await page.evaluate(() => { const i = document.querySelector('#cPrice'); i.value = '$350,000'; i.dispatchEvent(new Event('input')); });
await page.reload(); await sleep(400);
await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(300);   // a compass reading, or the app falls back to the map
const open220 = () => page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 270 }], 0); });
await open220(); await sleep(1200);
await page.evaluate(() => document.querySelector('#buyBox').scrollIntoView()); await sleep(1500);
const kept = await page.evaluate(() => ({ field: document.querySelector('#cPrice').value, saved: JSON.parse(localStorage.getItem('housepoint.saved.v1'))[0].calc.price }));
check(kept.field === '$350,000' && kept.saved === 350000, 'typed price comes back after a reload and isn’t overwritten: ' + JSON.stringify(kept));
// Share image waits until the card has been looked at.
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 90 }], 0); });
await sleep(400);
const early = await page.evaluate(() => { const p = window.__hp.sharePrep; return p ? p.cand.L.p.records[0].SITE_ADDR : null; });
await sleep(2600);
const late = await page.evaluate(() => { const p = window.__hp.sharePrep; return p ? p.cand.L.p.records[0].SITE_ADDR : null; });
check(early !== '211 MAIN ST' && late === '211 MAIN ST', `share image made after a look, not on every card (${early} → ${late})`);
// A lot whose key changed (state redrew it) still opens by location.
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '211 MAIN ST'); const [lat, lon] = L.proj.inv(L.c[0], L.c[1]); window.__reopen = { lat, lon }; });
await page.evaluate(() => window.__hp.startMapMode({ lat: window.__reopen.lat, lon: window.__reopen.lon, selectKey: 'CT:old-shape' }, 'Loading…')); await sleep(1800);
check(/211 Main St/.test(await page.$eval('#cardBody .addr', (el) => el.textContent).catch(() => '')), 'saved house with an outdated key opens by its location');
// Sideways swipe on the compare table doesn't close the panel; a downward pull does.
await page.evaluate(() => window.__hp.openPanel('saved')); await sleep(300);
const tb = await page.$eval('.cmp tbody tr:nth-child(5) td:nth-child(2)', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });   // plain text cell, no links
const cdp = await page.createCDPSession();
const drag = async (pts) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await sleep(40); }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await sleep(60);   // let batched moves arrive
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
await drag([...[0, 1, 2, 3, 4, 5, 6].map((i) => [tb.x - i * 25, tb.y + i * 14]), [tb.x, tb.y]]); await sleep(300);   // headless Chrome delivers a gesture's last move late, so end where it began
const stillOpen = await page.$eval('#panel', (el) => !el.classList.contains('hidden') && el.classList.contains('open')).catch(() => null);
await drag([0, 1, 2, 3, 4, 5, 6].map((i) => [tb.x + 2, tb.y + i * 20])); await sleep(400);
const closed = await page.$eval('#panel', (el) => !el.classList.contains('open')).catch(() => null);
check(stillOpen === true && closed === true, `sideways swipe keeps the panel, pulling down closes it (${stillOpen}, ${closed})`);
// A damaged saved list doesn't break the card or the Saved tab.
await page.evaluate(() => { localStorage.setItem('housepoint.saved.v1', 'null'); localStorage.setItem('housepoint.calc', '{"down":"x","rate":"NaN","term":7}'); });
await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records[0].SITE_ADDR === '220 MAIN ST'); window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 270 }], 0); }); await sleep(800);
const addrNow = await page.$eval('#cardBody .addr', (el) => el.textContent);
await page.evaluate(() => { localStorage.setItem('housepoint.saved.v1', '[{"key":"x","addr":"Old entry"},5,null]'); window.__hp.openPanel('saved'); }); await sleep(300);
const oldTab = await page.$eval('#panelBody', (el) => el.innerText);
check(/220 Main St/.test(addrNow) && /Old entry/.test(oldTab) && /1 saved/.test(oldTab), 'a damaged saved list still shows the card and the Saved tab');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
