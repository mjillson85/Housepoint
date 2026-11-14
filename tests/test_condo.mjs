import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${HP_ROOT}/index.html?demo=1&debug=1`);
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 800));
const res = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S;
  // Make the lot south of the street (x 0..22, y -6..-34) a 6-unit condo complex.
  const L = S.local.find((l) => l.c[1] < -10 && l.c[1] > -30 && l.c[0] > 0 && l.c[0] < 22);
  const base = L.p.records[0];
  L.p.records = [1,2,3,4,5,6].map((u) => ({ ...base, SITE_ADDR: base.SITE_ADDR + ' UNIT ' + u, TOTAL_VAL: 400000 + u * 25000, USE_CODE: '102', LS_DATE: u === 6 ? '20241215' : '2024031' + u, LS_PRICE: u === 6 ? 1 : 380000 + u * 20000 }));   // unit 6: a $1 deed to a trust
  const out = { condo: hp.summarize(L.p).addr };
  // Stand just inside the condo lot's north edge (y = -8), i.e. on the complex grounds.
  const [la, lo] = S.proj.inv(10, -8); S.pos = { lat: la, lon: lo }; S.acc = 6;
  const pick = (h) => hp.findCandidates(la, lo, h).slice(0, 3).map((c) => (c.inside ? '[ON LOT] ' : '') + hp.summarize(c.L.p).addr + (c.inside ? ` (${Math.round(c.across)} m across)` : ` @${Math.round(c.dist)}m`));
  out.pointSouthAcrossComplex = pick(180);
  out.pointNorthOutOfComplex = pick(0);
  // Old behaviour check: someone on the sidewalk (outside any lot) still targets across-street houses
  const [la2, lo2] = S.proj.inv(10, 0);
  out.sidewalkNorth = hp.findCandidates(la2, lo2, 0).slice(0, 1).map((c) => (c.inside ? '[ON LOT] ' : '') + hp.summarize(c.L.p).addr);
  return out;
});
console.log(JSON.stringify(res, null, 1));
await page.evaluate(() => window.__hp.setHeading(180)); await new Promise(r => setTimeout(r, 400));
console.log('live label:', await page.$eval('#liveLabel', el => el.innerText.replace(/\n/g, ' | ')));
await page.click('#shutter'); await new Promise(r => setTimeout(r, 900));
console.log('card:', (await page.$eval('#cardBody', el => el.innerText)).split('\n').slice(0, 10).join(' | '));
await page.screenshot({ path: 'condo_card.png' });
const cardTxt = await page.$eval('#cardBody', el => el.innerText);
console.log(/Latest unit sale \$480k · Mar 2024/.test(cardTxt) && !/\$1 ·/.test(cardTxt) ? 'PASS $1 deed skipped; latest real unit sale shown' : 'FAIL condo sale line: ' + (cardTxt.match(/Latest[^\n]*|No market[^\n]*/) || [''])[0]);
// A commercial condo building: two store units, the building's master record and a strip of land on the same lot (made up, in the
// shape a Massachusetts town's records take).
await page.click('.grab'); await new Promise(r => setTimeout(r, 300));
const mixed = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S;
  const L = S.local.find((l) => l.c[1] > 10 && l.c[1] < 30 && l.c[0] > 0 && l.c[0] < 22);
  const b = L.p.records[0], c = { CITY: b.CITY, TOWN_ID: b.TOWN_ID, FY: b.FY, LOC_ID: b.LOC_ID, POLY_TYPE: 'FEE', LOT_UNITS: 'Acres', OTHER_VAL: 0, STORIES: '0', NUM_ROOMS: 0 };
  L.p.records = [
    { ...c, PROP_ID: 'M_1', SITE_ADDR: '49 MILL ST #1', ADDR_NUM: '49', FULL_STR: 'MILL ST', LOCATION: '1', TOTAL_VAL: 221100, BLDG_VAL: 221100, LAND_VAL: 0, LOT_SIZE: 0, LS_DATE: '20120510', LS_PRICE: 393500, USE_CODE: '3221', YEAR_BUILT: 1954, BLD_AREA: 2000, UNITS: 0, RES_AREA: 2000, STYLE: 'Retail Condo' },
    { ...c, PROP_ID: 'M_A', SITE_ADDR: '35 MILL ST', ADDR_NUM: '35', FULL_STR: 'MILL ST', TOTAL_VAL: 60000, BLDG_VAL: 0, LAND_VAL: 60000, LOT_SIZE: 0.069, LS_PRICE: 0, USE_CODE: '925V', BLD_AREA: 0, UNITS: 0, RES_AREA: 0, STYLE: 'Vacant Land' },
    { ...c, PROP_ID: 'M_0', SITE_ADDR: '47-49  MILL ST', ADDR_NUM: '47-49', FULL_STR: 'MILL ST', TOTAL_VAL: 0, BLDG_VAL: 0, LAND_VAL: 0, LOT_SIZE: 0.93, LS_DATE: '20120510', LS_PRICE: 0, USE_CODE: '995', YEAR_BUILT: 1954, BLD_AREA: 0, UNITS: 2, RES_AREA: 0, STYLE: 'Retail Condo' },
    { ...c, PROP_ID: 'M_2', SITE_ADDR: '47 MILL ST #2', ADDR_NUM: '47', FULL_STR: 'MILL ST', LOCATION: '2', TOTAL_VAL: 861000, BLDG_VAL: 847500, LAND_VAL: 0, OTHER_VAL: 13500, LOT_SIZE: 0, LS_DATE: '20120510', LS_PRICE: 0, USE_CODE: '3221', YEAR_BUILT: 1966, BLD_AREA: 12024, UNITS: 0, RES_AREA: 12000, STYLE: 'Retail Condo' }];
  L.badges = null;
  hp.openSheet([{ L, dist: 20, cdist: 20, bearing: 0 }], 0);
  const lists = [...document.querySelectorAll('#cardBody .units')].map((u) => [...u.querySelectorAll('.unit span:first-child')].map((x) => x.textContent));
  return { town: document.querySelector('#sheet .town').textContent, heads: [...document.querySelectorAll('#cardBody .units-h')].map((h) => h.textContent), lists,
    buy: !!document.querySelector('#buyBox'), text: document.querySelector('#cardBody').textContent };   // the units' details too (folded away)
});
console.log('mixed lot:', JSON.stringify({ town: mixed.town, heads: mixed.heads, lists: mixed.lists, buy: mixed.buy }));
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
ok(/Commercial condo building/.test(mixed.town) && /^2 units/.test(mixed.heads[0] || ''), 'a commercial condo building with 2 units');
ok(mixed.lists[0] && mixed.lists[0].length === 2 && !mixed.lists[0].some((x) => /47-49/.test(x)), 'the two stores are the units; the master record isn’t listed');
ok(mixed.heads.includes('Also on this lot · tap for details') && mixed.lists[1] && mixed.lists[1].some((x) => /35 Mill St/.test(x)), 'the strip of land is listed as also on the lot');
ok(!mixed.buy && !/Living area/.test(mixed.text) && /Floor area/.test(mixed.text), 'no home-buyer box; stores show floor area, not living area');
console.log('debug overlay:', await page.$eval('#debug', el => el.innerText.replace(/\n/g, ' / ')));
// camera/map round trip still works
await page.click('.grab'); await new Promise(r => setTimeout(r, 400));
await page.click('#toMap'); await new Promise(r => setTimeout(r, 600));
await page.click('#mapToPoint'); await new Promise(r => setTimeout(r, 600));
console.log('back in point mode:', await page.evaluate(() => window.__hp.S.mode), '| fakecam/cam visible:', await page.evaluate(() => !document.querySelector('#fakecam').classList.contains('hidden') || !document.querySelector('#cam').classList.contains('hidden')));
const backMode = await page.evaluate(() => window.__hp.S.mode);
console.log(backMode === 'point' ? 'PASS back in point mode after the map' : 'FAIL mode after the map: ' + backMode);
console.log(errors.length ? 'FAIL page errors: ' + errors.join(' | ') : 'errors: none');
await browser.close();
