// Estimated property tax: unit checks on the calculation + the card in demo mode.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`file://${HP_ROOT}/index.html?demo=1`);
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const r = await page.evaluate(() => {
  const { estimateTax: est, MA_TOWNS, FL_COUNTIES } = window.__hp;
  const MA = { id: 'MA' }, FL = { id: 'FL' };
  const one = (region, rec) => est({ region, r0: rec, recs: [rec], commonOnly: false });
  return {
    towns: MA_TOWNS.length, counties: FL_COUNTIES.length,
    byId: [35, 49, 73, 104, 351].map((i) => MA_TOWNS[i - 1].n + ' ' + MA_TOWNS[i - 1].r),
    flById: [23, 58, 65, 77].map((i) => FL_COUNTIES[i - 11].n + ' ' + FL_COUNTIES[i - 11].r),
    salemByName: one(MA, { CITY: 'SALEM', USE_CODE: '1010', TOTAL_VAL: 1200000 }),
    bostonById: one(MA, { TOWN_ID: 35, CITY: 'JAMAICA PLAIN', USE_CODE: '101', TOTAL_VAL: 800000 }),
    exempt: one(MA, { TOWN_ID: 35, USE_CODE: '903', TOTAL_VAL: 5e6 }),
    commercial: one(MA, { TOWN_ID: 35, USE_CODE: '3400', TOTAL_VAL: 5e6 }),
    noTown: one(MA, { CITY: 'NOWHERE', USE_CODE: '101', TOTAL_VAL: 5e5 }),
    condo: est({ region: MA, commonOnly: false, r0: { TOWN_ID: 73, USE_CODE: '102' }, recs: [{ TOWN_ID: 73, USE_CODE: '102', TOTAL_VAL: 400000 }, { TOWN_ID: 73, USE_CODE: '102', TOTAL_VAL: 520000 }] }),
    flHomestead: one(FL, { COUNTY: 65, USE_CODE: '0001', TOTAL_VAL: 450000, TV_NSD: 250000, TV_SD: 275000 }),
    flNoTV: one(FL, { COUNTY: 65, USE_CODE: '0001', TOTAL_VAL: 450000 }),
    flRental: one(FL, { COUNTY: 58, USE_CODE: '0001', TOTAL_VAL: 400000, TV_NSD: 400000, TV_SD: 400000 }),
    flShop: one(FL, { COUNTY: 58, USE_CODE: '0011', TOTAL_VAL: 400000, TV_NSD: 400000 }),
    oldTown: est({ region: MA, commonOnly: false, r0: { CITY: 'REVERE', USE_CODE: '101', FY: 2022 }, recs: [{ CITY: 'REVERE', USE_CODE: '101', TOTAL_VAL: 400000, FY: 2022 }] }),
    stale: [2022, 2023, 2024, 2026, 2027].map((fy) => !!window.__hp.staleRecord({ region: { id: 'MA' }, fy, r0: { CITY: 'REVERE' } })),
    staleCt: !!window.__hp.staleRecord({ region: { id: 'CT' }, fy: 2020, r0: {} }),
    staleText: window.__hp.staleHtml({ region: { id: 'MA' }, fy: 2022, r0: { CITY: 'REVERE' } }),
  };
});
check(r.stale.join() === 'true,true,false,false,false' && !r.staleCt, 'old Massachusetts records (FY2023 or older) are flagged; others aren’t');
check(/Revere’s FY2022 records/.test(r.staleText) && /google\.com\/search\?q=Revere%20MA%20assessor/.test(r.staleText), 'the flag names the town and links to its assessor database');
check(r.oldTown && r.oldTown.notes.some((n) => /FY2026 rate on the town’s FY2022 value \(the newest the state has\), so it’s likely low/.test(n)), 'tax estimate says it’s likely low on an old value');
check(r.towns === 351 && r.counties === 67, 'tables complete (351 towns, 67 counties)');
console.log('  town ids:', r.byId.join(' | '), '\n  county ids:', r.flById.join(' | '));
check(r.byId.join('|') === 'Boston 12.4|Cambridge 6.67|Dedham 12.3|Aquinnah 6.87|Yarmouth 6.97', 'town ids map to the right towns');
check(r.flById.join('|') === 'Miami-Dade 18.4427|Orange 21.3187|Saint Johns 13.0651|Washington 14.5767', 'county numbers map to the right counties');
check(Math.round(r.salemByName.lo) === 12936, `Salem by name: $1.2M × 10.78 = ${Math.round(r.salemByName.lo)}`);
check(Math.round(r.bostonById.lo) === 9920 && r.bostonById.notes.some((n) => /residential exemption/.test(n)), 'Boston by town id (neighborhood name ignored) + exemption note');
check(r.exempt && r.exempt.exempt, 'tax-exempt use code');
check(r.commercial === null, 'no estimate for business property');
check(r.noTown === null, 'no estimate when the town is unknown');
check(r.condo.perUnit && Math.round(r.condo.lo) === 4920 && Math.round(r.condo.hi) === 6396, 'condo units: per-unit range');
check(Math.round(r.flHomestead.lo) === 3416 && Math.round(r.flHomestead.buyer) === 5376, `FL homestead: ${Math.round(r.flHomestead.lo)}, new owner ${Math.round(r.flHomestead.buyer)}`);
check(Math.round(r.flNoTV.lo) === 5879 && /before any exemptions/.test(r.flNoTV.notes[0]) && !r.flNoTV.buyer, 'FL without taxable value: labeled before exemptions');
check(!r.flRental.buyer && Math.round(r.flRental.lo) === 8527, 'FL with no homestead savings: no new-owner line');
check(r.flShop === null, 'FL business property skipped');

// the card in demo mode
await page.click('#goPoint'); await sleep(800);
await page.evaluate(() => window.__hp.setHeading(15)); await sleep(300);
await page.click('#shutter'); await sleep(1200);
const box = await page.$eval('#cardBody .tax', (el) => el.innerText.replace(/\n/g, ' / ')).catch(() => null);
console.log('card tax box:', box);
check(box && /Estimated property tax/i.test(box) && /Bridgewater’s FY2026 residential rate is \$12\.03/.test(box), 'card shows the estimate');
await page.screenshot({ path: 'tax_card.png' });
await page.evaluate(() => document.querySelector('#cardBody').scrollTo(0, 260)); await sleep(200);
await page.screenshot({ path: 'tax_card2.png' });
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close();
