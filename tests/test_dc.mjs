// Washington, DC: the diamond and the Potomac, the tax lots (faked with the layer's real field names and real records' shapes),
// building records joined from the CAMA tables, condo units joined from CONDORELATE and ITSPE onto the condo lot, the city's
// use codes, the tax for this tax year, search, and the lots still loading when the other tables don't answer.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8781);
const ORIGIN = 'http://localhost:8781';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer';
const L40 = ROOT + '/40';
const L40_FIELDS = ['OBJECTID', 'MAR_ID', 'SSL', 'SQUARE', 'SUFFIX', 'LOT', 'LOT_TYPE', 'UNDERLIES_CONDO', 'EFFECTIVETAXYEAR', 'QUADRANT', 'COL', 'ARN', 'ASRNAME', 'PROPTYPE',
  'TRIGROUP', 'USECODE', 'LANDAREA', 'PRMSWARD', 'PREMISEADD', 'NBHD', 'NBHDNAME', 'SUBNBHD', 'UNITNUMBER', 'OWNERNAME', 'CAREOFNAME', 'ADDRESS1', 'ADDRESS2', 'CITYSTZIP',
  'OLDLAND', 'OLDIMPR', 'OLDTOTAL', 'NEWLAND', 'NEWIMPR', 'NEWTOTAL', 'PHASELAND', 'PHASEBUILD', 'PARTPART', 'VACLNDUSE', 'LOWNUMBER', 'STREETNAME', 'QDRNTNAME', 'DELCODE',
  'HSTDCODE', 'CLASSTYPE', 'TAXRATE', 'MIXEDUSE', 'SALEPRICE', 'SALEDATE', 'SALETYPE', 'DEEDDATE', 'ASSESSMENT', 'ANNUALTAX', 'EXTRACTDAT', 'CY1TAX', 'CY2TAX', 'CONDOLOT',
  'CONDO_REGIME_NUM', 'CALCULATEDAREA'];
const ITSPE_FIELDS = L40_FIELDS.filter((f) => !/^(MAR_ID|LOT_TYPE|UNDERLIES_CONDO|EFFECTIVETAXYEAR|COL|CONDOLOT|CONDO_REGIME_NUM|CALCULATEDAREA)$/.test(f));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 38.8862, lon0 = -76.9955;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const secret = { OWNERNAME: 'SECRET OWNER', CAREOFNAME: 'SECRET CARE OF', ADDRESS1: 'SECRET MAIL', CITYSTZIP: 'SECRET CITY' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: [], tables: [] };
let tablesDown = false;
const UNITS = [['0279    2034', '1', 1026160, 9100.5, 1, 1920, 980], ['0279    2038', '5', 1023500, 8699.75, 0, 1920, 1010], ['0279    2048', 'PS1', 25000, 212.5, 0, null, 0]];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : (u.split('?')[1] || ''));
  if (u.startsWith(L40 + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: L40_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(ROOT + '?f=json')) {
    if (tablesDown) return req.respond({ status: 500, body: 'down' });
    return json({ layers: [{ id: 40, name: 'Owner Polygons (Common Ownership Layer)' }], tables: [{ id: 52, name: 'CONDORELATE' }, { id: 53, name: 'ITSPE' }, { id: 23, name: 'COMMERCIAL (CAMA)' },
      { id: 24, name: 'CONDOMINIUM (CAMA)' }, { id: 25, name: 'RESIDENTIAL (CAMA)' }] });
  }
  if (u.startsWith(ROOT + '/53?f=json')) return json({ fields: ITSPE_FIELDS.map((name) => ({ name })) });
  const table = /MapServer\/(\d+)\/query/.exec(u);
  if (table && table[1] !== '40') {
    asked.tables.push(`${table[1]}: ${q.get('outFields')} where ${q.get('where')}`);
    const w = q.get('where') || '';
    if (table[1] === '25') return json({ features: /0900    0043/.test(w) ? [{ attributes: { SSL: '0900    0043', AYB: 1890, GBA: 1840, BEDRM: 3, BATHRM: 2, HF_BATHRM: 1, ROOMS: 8, STORIES: 2, STYLE_D: '2 Story', NUM_UNITS: 1, BLDG_NUM: 1 } }] : [] });
    if (table[1] === '23') return json({ features: /0900    0068/.test(w) ? [{ attributes: { SSL: '0900    0068', AYB: 1900, LIVING_GBA: 5200, NUM_UNITS: 0, BLDG_NUM: 1 } }] : [] });
    if (table[1] === '52') return json({ features: /MAT_SSL IN \('0279    0048'\)/.test(w) ? UNITS.map(([ssl, unit]) => ({ attributes: { SSL: ssl, MAT_SSL: '0279    0048', UNITNUM: unit, NAME: 'LOGAN MANSIONS CONDO', REGIME: '2470' } })) : [] });
    if (table[1] === '53') return json({ features: UNITS.filter(([ssl]) => w.includes(ssl)).map(([ssl, unit, v, tax, hstd]) => ({ attributes: { SSL: ssl, PREMISEADD: `1300 13TH ST NW ${unit === 'PS1' ? '' : '#' + unit} WASHINGTON DC 20005`.replace(/\s+/g, ' '),
      UNITNUMBER: unit, USECODE: unit === 'PS1' ? '018' : '016', PROPTYPE: 'Residential-Condo', ASSESSMENT: v, PHASELAND: Math.round(v * 0.3), PHASEBUILD: Math.round(v * 0.7), ANNUALTAX: tax,
      TAXRATE: 0.85, HSTDCODE: hstd ? '1' : null, SALEPRICE: unit === '5' ? 980000 : 0, SALEDATE: unit === '5' ? 1700000000000 : null, ...secret } })) });
    if (table[1] === '24') return json({ features: UNITS.filter(([ssl, , , , , y]) => w.includes(ssl) && y).map(([ssl, , , , , y, gba]) => ({ attributes: { SSL: ssl, AYB: y, LIVING_GBA: gba, BEDRM: 2, BATHRM: 2, HF_BATHRM: 0, ROOMS: 4, BLDG_NUM: 1 } })) });
    return json({ features: [] });
  }
  if (u.startsWith(L40 + '/query')) {
    asked.outFields.push(q.get('outFields'));
    if (q.get('where') && !q.get('geometry')) {
      asked.where.push(q.get('where'));
      return json({ features: /UPPER\(PREMISEADD\) LIKE '239 8TH ST SE%'/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { SSL: '0900    0043', PREMISEADD: '239 8TH ST SE WASHINGTON DC 20003' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // a Capitol Hill row house
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { OBJECTID: 1, SSL: '0900    0043', PREMISEADD: '239 8TH ST SE WASHINGTON DC 20003', PROPTYPE: 'Residential-Single Family (Row',
      USECODE: '011', UNDERLIES_CONDO: 0, CONDOLOT: 'N', NEWTOTAL: 1695790, ASSESSMENT: 1630810, PHASELAND: 863370, PHASEBUILD: 767440, ANNUALTAX: 13861.88, SALEPRICE: 1750000,
      SALEDATE: 1745899200000, SALETYPE: 'Improved', CLASSTYPE: '1B', TAXRATE: 0.85, HSTDCODE: '1', NBHDNAME: 'Capitol Hill', ...secret } });
    // a store with its commercial building record
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { OBJECTID: 2, SSL: '0900    0068', PREMISEADD: '218 7TH ST SE WASHINGTON DC 20003', PROPTYPE: 'Store-Miscellaneous',
      USECODE: '042', CONDOLOT: 'N', ASSESSMENT: 3631620, PHASELAND: 730490, PHASEBUILD: 2901130, ANNUALTAX: 59921.74, SALEPRICE: 3600000, SALEDATE: 1645506000000, CLASSTYPE: '2', TAXRATE: 1.65, ...secret } });
    // a condo lot: no values on the lot, the units are in other tables
    feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { OBJECTID: 3, SSL: '0279    0048', UNDERLIES_CONDO: 1, CONDOLOT: 'Y', CONDO_REGIME_NUM: '2470', COL: 'Y' } });
    // a church: no tax
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { OBJECTID: 4, SSL: '0872    0800', PREMISEADD: '535 8TH ST SE WASHINGTON DC 20003', PROPTYPE: 'Religious', USECODE: '081',
      ASSESSMENT: 2860000, PHASELAND: 1900000, PHASEBUILD: 960000, ANNUALTAX: 0, CLASSTYPE: '2', TAXRATE: 0 } });
    // a reservation with no number, and a vacant lot (code 191)
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { OBJECTID: 5, SSL: 'RES 01520000', PREMISEADD: 'NW WASHINGTON DC 00000', PROPTYPE: 'Vacant-True', USECODE: '191',
      ASSESSMENT: 161890, PHASELAND: 161890, PHASEBUILD: 0, ANNUALTAX: 0 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { capitol: f(38.8899, -77.0091), whiteHouse: f(38.8977, -77.0365), georgetown: f(38.9055, -77.065), anacostia: f(38.8625, -76.9886), tenley: f(38.9479, -77.0796),
    chevyChaseDC: f(38.9650, -77.0750), bolling: f(38.8420, -77.0160), rosslyn: f(38.8963, -77.0707), pentagon: f(38.8719, -77.0563), dca: f(38.8512, -77.0402),
    alexandria: f(38.8048, -77.0469), bethesda: f(38.9847, -77.0947), silverSpring: f(38.9907, -77.0261), hyattsville: f(38.9559, -76.9455), boston: f(42.3601, -71.0589) };
});
console.log('regions:', JSON.stringify(rg));
check(['capitol', 'whiteHouse', 'georgetown', 'anacostia', 'tenley', 'chevyChaseDC', 'bolling'].every((k) => rg[k] === 'DC'), 'DC places land in DC');
check(['rosslyn', 'pentagon', 'dca', 'alexandria'].every((k) => rg[k] !== 'DC'), 'Virginia across the Potomac stays out');
check(['bethesda', 'silverSpring', 'hyattsville'].every((k) => rg[k] !== 'DC') && rg.boston === 'MA', 'Maryland suburbs aren’t DC');
const decl = await page.evaluate(() => +window.__hp.regionFor(38.8977, -77.0365).declination(38.8977, -77.0365).toFixed(1));
check(Math.abs(decl + 10.7) < 0.4, 'compass declination downtown ' + decl);

const kinds = await page.evaluate(() => {
  const k = (code, extra = {}) => window.__hp.useKind({ USE_CODE: code, TOTAL_VAL: 900000, BLDG_VAL: 500000, TAX_LAST: 7000, ...extra }, 'DC');
  return { row: k('011'), det: k('012'), semi: k('013'), garage: k('014'), condo: k('016'), parking: k('018'), walkup: k('021'), elevator: k('022'), flat: k('023'), conv: k('024'),
    threeFour: k('025'), coop: k('027'), hotel: k('032'), dorm: k('036'), store: k('042'), office: k('052'), officeCondo: k('053'), parkingLot: k('064'), warehouse: k('074'),
    church: k('081', { TAX_LAST: 0 }), taxedChurch: k('081'), school: k('083', { TAX_LAST: 0 }), embassy: k('085', { TAX_LAST: 0 }), vacant: k('091', { BLDG_VAL: 0 }),
    vacant191: k('191', { BLDG_VAL: 0 }), garage214: k('214'), condoLot: k(null, { CONDO_LOT: true, TOTAL_VAL: null }) };
});
const want = { row: 'single', det: 'single', semi: 'single', garage: 'accessory', condo: 'resCondo', parking: 'accessory', walkup: 'apartments', elevator: 'apartments', flat: 'multi',
  conv: 'multi', threeFour: 'multi', coop: 'apartments', hotel: 'commercial', dorm: 'institutional', store: 'commercial', office: 'commercial', officeCondo: 'comCondo',
  parkingLot: 'commercial', warehouse: 'industrial', church: 'exempt', taxedChurch: 'institutional', school: 'exempt', embassy: 'exempt', vacant: 'vacant', vacant191: 'vacant',
  garage214: 'accessory', condoLot: 'condoMaster' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'use codes read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/239 8th St Se \||239 8th St SE \|/.test(card) && /Washington · Row house/.test(card) && /District of Columbia/i.test(card), 'address without the city and zip, the use');
check(/ASSESSED VALUE/i.test(card) && /\$1,630,810/.test(card) && /Built 1890/.test(card) && /1,840 ft²/.test(card), 'assessed value; year built and size from the building records');
check(/Last sold \$1,750,000 · Apr 2025/.test(card), 'last sale');
check(/PROPERTY TAX · THIS TAX YEAR/i.test(card) && /\$13,862 per year/.test(card) && /\$0\.85 per \$100/.test(card) && /homestead deduction/.test(card), 'DC’s tax for this tax year');
check(/Office of Tax and Revenue/.test(card) && !/SECRET/.test(card), 'source line; no owner or mailing address on the card');
check(asked.outFields.every((f) => !/OWNERNAME|CAREOFNAME|ADDRESS1|ADDRESS2|CITYSTZIP|ASRNAME/.test(f || '')) && asked.tables.every((t) => !/OWNERNAME|CAREOFNAME|ADDRESS1|CITYSTZIP|(: |,)NAME(,| where)/.test(t)),
  'owner and mailing fields are never asked for, on the lots or the other tables');

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const store = await open('218 7TH ST SE');
check(/Washington · Store/.test(store) && /Built 1900/.test(store) && /5,200 ft²/.test(store) && /\$59,922 per year/.test(store), 'a store: commercial building record, its tax');
const condo = await open('1300 13TH ST NW');
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('condo:', condo.slice(0, 700), '|', units.join(' / '));
check(/1300 13th St Nw \||1300 13th St NW \|/.test(condo) && /Condo building/.test(condo) && /2 units/i.test(condo) && units.some((u) => /Unit 1\b/.test(u)) && units.some((u) => /Unit 5\b/.test(u)),
  'a condo lot gets its units from the other tables, with the street address');
check(/Built 1920/.test(condo) && /per unit, per year/.test(condo) && units.some((u) => /Unit PS1/i.test(u) && /parking|storage/i.test(u)), 'units’ year built and tax; the parking space isn’t a unit');
const church = await open('535 8TH ST SE');
check(/Washington · Church/.test(church) && /PROPERTY TAX \| None/i.test(church), 'a church: no tax');
const res = await page.evaluate(() => window.__hp.S.local.some((l) => l.p.records.some((r) => /^NW$/.test(String(r.SITE_ADDR || '')))));
check(!res, '“NW” alone isn’t an address');

const pq = await page.evaluate(() => ['1600 Pennsylvania Ave NW, Washington, DC', 'Georgetown, DC', '12 Main St, Washington'].map((t) => window.__hp.parseQuery(t)));
check(pq[0].state === 'DC' && pq[1].state === 'DC' && pq[2].state !== 'DC', 'DC typed as DC; “Washington” alone after a street stays a town');
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Capitol Hill/.test(e.textContent))), 'Capitol Hill sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '239 8th St SE, Washington, DC'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /UPPER\(PREMISEADD\) LIKE '239 8TH ST SE%'/.test(w)), 'search asks the tax lots by address');

// the other tables down: the lots still load, the condo lot says why it has no units
tablesDown = true;
await page.evaluate(() => { const S = window.__hp.S; S.local = []; });
await page.goto(ORIGIN + '/?x=2'); await sleep(500);
await page.evaluate(() => window.__hp.centerMap(38.8862, -76.9955)); await sleep(1500);
const n = await page.evaluate(() => window.__hp.S.local.length);
const lone = await open('').catch(() => '');
const condoLone = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.CONDO_LOT));
  if (!L) return 'no condo lot'; window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '); });
check(n >= 4 && /units separately/.test(condoLone), 'with the other tables down the lots still load, and the condo lot says its units didn’t: ' + condoLone.slice(0, 200));
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
