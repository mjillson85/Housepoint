// Wisconsin: region outline, the State Cartographer's statewide parcels (faked with its real field names and real records' shapes),
// classes of property, addresses and places, condos (stacked, with a common record or Dane County's "CDM"), the real tax bill, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8777);
const ORIGIN = 'http://localhost:8777';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WI_SVC = 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0';
// The layer's real fields (owner and mailing ones included, so the test can tell they're never asked for).
const WI_FIELDS = ['OBJECTID', 'STATEID', 'PARCELID', 'TAXPARCELID', 'PARCELDATE', 'TAXROLLYEAR', 'OWNERNME1', 'OWNERNME2', 'PSTLADRESS', 'SITEADRESS', 'ADDNUMPREFIX',
  'ADDNUM', 'ADDNUMSUFFIX', 'PREFIX', 'STREETNAME', 'STREETTYPE', 'SUFFIX', 'LANDMARKNAME', 'UNITTYPE', 'UNITID', 'PLACENAME', 'ZIPCODE', 'ZIP4', 'STATE', 'SCHOOLDIST',
  'SCHOOLDISTNO', 'CNTASSDVALUE', 'LNDVALUE', 'IMPVALUE', 'MFLVALUE', 'ESTFMKVALUE', 'NETPRPTA', 'GRSPRPTA', 'PROPCLASS', 'AUXCLASS', 'ASSDACRES', 'DEEDACRES',
  'GISACRES', 'CONAME', 'LOADDATE', 'PARCELFIPS', 'PARCELSRC', 'LONGITUDE', 'LATITUDE', 'SITEADRESS_STAND'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 43.0697, lon0 = -89.4300;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const secret = { OWNERNME1: 'SECRET OWNER', OWNERNME2: 'SECRET TWO', PSTLADRESS: '1 SECRET WAY SECRETVILLE WI 53000' };
const yr = { TAXROLLYEAR: '2025', STATE: 'WI' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: '', lotWhere: [], lotQueries: 0, hangNext: false };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(WI_SVC + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: WI_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(WI_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where') && !q.get('geometry')) {
      asked.where.push(q.get('where'));
      return json({ features: /2509 VAN HISE AVE/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...secret, OBJECTID: 1, SITEADRESS: '2509 VAN HISE AVE', PLACENAME: 'CITY OF MADISON' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    asked.lotWhere.push(q.get('where'));
    // The layer's habit: now and then one request hangs (Madison, 20 to 45 seconds) while the same one asked again answers at once
    asked.lotQueries++;
    if (asked.hangNext) { asked.hangNext = false; return setTimeout(() => { try { json({ features: [] }); } catch (e) { /* the app gave up on it */ } }, 30000); }
    const feats = [];
    // Madison: a house, assessed below the state's market estimate
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...secret, ...yr, OBJECTID: 1, PARCELID: '070921124023', SITEADRESS: '2509 VAN HISE AVE',
      PLACENAME: 'CITY OF MADISON', ZIPCODE: '53705', CONAME: 'DANE', CNTASSDVALUE: 750700, LNDVALUE: 181400, IMPVALUE: 569300, ESTFMKVALUE: 812000, NETPRPTA: 13421.55,
      GRSPRPTA: 13702.4, PROPCLASS: '1', SCHOOLDIST: 'MADISON METROPOLITAN SCHOOL DISTRICT' } });
    // Madison: condo units stacked on one outline with the common record (class 1, no value) and two shops
    const C = (id, extra) => ({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...secret, ...yr, OBJECTID: id, PLACENAME: 'CITY OF MADISON', ZIPCODE: '53703', CONAME: 'DANE', ...extra } });
    feats.push(C(10, { SITEADRESS: '123 W WASHINGTON AVE', CNTASSDVALUE: 0, LNDVALUE: 0, IMPVALUE: 0, ESTFMKVALUE: 0, NETPRPTA: 0, PROPCLASS: '1' }));
    for (const [i, unit, v, t] of [[11, '202', 506800, 9089.9], [12, '206', 555900, 10005.93], [13, '301', 750000, 13900.95]])
      feats.push(C(i, { SITEADRESS: `123 W WASHINGTON AVE UNIT ${unit}`, UNITTYPE: 'UNIT', UNITID: unit, CNTASSDVALUE: v, LNDVALUE: 60000, IMPVALUE: v - 60000, ESTFMKVALUE: Math.round(v * 1.026), NETPRPTA: t, PROPCLASS: '1' }));
    feats.push(C(14, { SITEADRESS: '115 W WASHINGTON AVE', CNTASSDVALUE: 1078000, LNDVALUE: 85000, IMPVALUE: 993000, ESTFMKVALUE: 1078000, NETPRPTA: 20020.23, PROPCLASS: '2' }));
    // Dane County: a condo's common record alone, with the unit "CDM"
    feats.push({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { ...secret, ...yr, OBJECTID: 20, SITEADRESS: '309 W WASHINGTON AVE UNIT CDM', UNITTYPE: 'UNIT', UNITID: 'CDM',
      PLACENAME: 'CITY OF MADISON', CONAME: 'DANE', CNTASSDVALUE: 0, LNDVALUE: 0, IMPVALUE: 0, ESTFMKVALUE: 0, NETPRPTA: 0, PROPCLASS: '2' } });
    // Wausau: stacked commercial units written right after the street ("201 JEFFERSON STREET 419")
    for (const [i, unit, v] of [[30, '419', 97500], [31, '319', 97500], [32, '323', 161600]])
      feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { ...secret, ...yr, OBJECTID: i, SITEADRESS: `201 JEFFERSON STREET ${unit}`, UNITID: unit,
        PLACENAME: 'CITY OF WAUSAU', ZIPCODE: '54403', CONAME: 'MARATHON', CNTASSDVALUE: v, LNDVALUE: 10600, IMPVALUE: v - 10600, MFLVALUE: 0, ESTFMKVALUE: Math.round(v * 1.05),
        NETPRPTA: v * 0.0183, GRSPRPTA: v * 0.0189, PROPCLASS: '2' } });
    // Exempt (X4: city, school, church, charity) with no values
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...secret, ...yr, OBJECTID: 40, SITEADRESS: '131 JEFFERSON STREET', PLACENAME: 'CITY OF WAUSAU',
      CONAME: 'MARATHON', CNTASSDVALUE: 0, LNDVALUE: 0, IMPVALUE: 0, MFLVALUE: 0, AUXCLASS: 'X4' } });
    // Door County: a farm with its home, in a town; no house number ("0")
    feats.push({ geometry: { rings: [ring(50, 40, 120, 110, b)] }, attributes: { ...secret, ...yr, OBJECTID: 50, SITEADRESS: '0 W SHORE RD', PLACENAME: 'TOWN OF GIBRALTAR',
      ZIPCODE: '54212', CONAME: 'DOOR', CNTASSDVALUE: 312000, LNDVALUE: 41000, IMPVALUE: 271000, NETPRPTA: 4410.12, PROPCLASS: '4,5,7' } });
    // Forest in the state's Managed Forest Law program: no class, no value
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { ...secret, ...yr, OBJECTID: 60, PLACENAME: 'TOWN OF GIBRALTAR', CONAME: 'DOOR', MFLVALUE: 52000, AUXCLASS: 'W6' } });
    // Milwaukee: an apartment building (class 2, like any business)
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { ...secret, ...yr, OBJECTID: 70, SITEADRESS: '2632 S KINNICKINNIC AVE', PLACENAME: 'CITY OF MILWAUKEE',
      ZIPCODE: '53207', CONAME: 'MILWAUKEE', CNTASSDVALUE: 421700, LNDVALUE: 41400, IMPVALUE: 380300, ESTFMKVALUE: 422000, NETPRPTA: 9012.33, PROPCLASS: '2' } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { madison: f(43.0731, -89.4012), milwaukee: f(43.0389, -87.9065), greenBay: f(44.5133, -88.0133), eauClaire: f(44.8113, -91.4985), laCrosse: f(43.8136, -91.2519),
    superior: f(46.7208, -92.1041), wiPoint: f(46.70, -92.03), hurley: f(46.4497, -90.1868), prairie: f(43.0514, -91.1412), kenosha: f(42.5847, -87.8212), hudson: f(44.975, -92.757),
    washIsland: f(45.38, -86.90), fishCreek: f(45.13, -87.24), bayfield: f(46.81, -90.82), minneapolis: f(44.9778, -93.265), duluth: f(46.7867, -92.1005),
    parkPoint: f(46.74, -92.06), stillwater: f(45.056, -92.806), laCrescent: f(43.828, -91.304), marquetteIA: f(43.04, -91.19), dubuque: f(42.5006, -90.6646),
    chicago: f(41.8781, -87.6298), ironwood: f(46.4547, -90.1710), escanaba: f(45.745, -87.065), ludington: f(43.955, -86.452), boston: f(42.3601, -71.0589), raleigh: f(35.7796, -78.6382) };
});
console.log('regions:', JSON.stringify(rg));
check(['madison', 'milwaukee', 'greenBay', 'eauClaire', 'laCrosse', 'superior', 'wiPoint', 'hurley', 'prairie', 'kenosha', 'hudson', 'washIsland', 'fishCreek', 'bayfield'].every((k) => rg[k] === 'WI'),
  'Wisconsin places land in Wisconsin');
check(['marquetteIA', 'dubuque'].every((k) => rg[k] === 'US_IA') && ['ironwood', 'escanaba', 'ludington'].every((k) => rg[k] === 'US_MI') && rg.chicago === 'IL', 'Iowa and Michigan stay out (their own basic card); Chicago is Cook County');
check(['minneapolis', 'duluth', 'parkPoint', 'stillwater', 'laCrescent'].every((k) => rg[k] === 'MN'), 'Minnesota’s side of the rivers is Minnesota');
check(rg.boston === 'MA' && rg.raleigh === 'NC', 'other states unchanged');
const decl = await page.evaluate(() => [[43.07, -89.40], [44.97, -92.75], [45.05, -87.2]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] + 3.0) < 0.4 && Math.abs(decl[1] + 0.6) < 0.4 && Math.abs(decl[2] + 4.9) < 0.4, 'compass declination: Madison, Hudson, Door County ' + decl.join(', '));

// Classes of property, as the state writes them
const kinds = await page.evaluate(() => {
  const k = (cls, aux, extra = {}) => window.__hp.useKind({ USE_CODE: cls, AUX: aux, TOTAL_VAL: 300000, BLDG_VAL: 200000, SITE_ADDR: '12 MAIN ST', ...extra }, 'WI');
  return { house: k('1'), lot: k('1', null, { BLDG_VAL: 0 }), condo: k('1', null, { SITE_ADDR: '123 W WASHINGTON AVE UNIT 202' }), common: k('1', null, { TOTAL_VAL: 0, BLDG_VAL: 0 }),
    cdm: k('2', null, { CONDO_COMMON: true }), shop: k('2'), shopUnit: k('2', null, { SITE_ADDR: '201 JEFFERSON ST UNIT 419' }), commLand: k('2', null, { BLDG_VAL: 0 }),
    mfg: k('3'), mixed: k('1,2'), farm: k('4'), farmHome: k('4,5,7'), homeOnFarm: k('1,4'), farmLotNoHome: k('1,4', null, { BLDG_VAL: 0 }), forest: k('6'), agForest: k('5M'),
    undeveloped: k('5', null, { BLDG_VAL: 0 }), other: k('7'), exempt: k(null, 'X4', { TOTAL_VAL: 0, BLDG_VAL: 0 }), federal: k('', 'X1'), mfl: k(null, 'W6'),
    withOther: k(null, 'AWO', { TOTAL_VAL: null, BLDG_VAL: null }), partlyExempt: k('2', 'X4'), noValues: k('1', null, { TOTAL_VAL: null, BLDG_VAL: null }), none: k(null, null) };
});
console.log('kinds:', JSON.stringify(kinds));
const want = { house: 'single', lot: 'vacant', condo: 'resCondo', common: 'condoMaster', cdm: 'condoMaster', shop: 'commercial', shopUnit: 'comCondo', commLand: 'vacant',
  mfg: 'industrial', mixed: 'mixed', farm: 'farmForest', farmHome: 'farmForest', homeOnFarm: 'single', farmLotNoHome: 'farmForest', forest: 'farmForest', agForest: 'farmForest',
  undeveloped: 'vacant', other: 'farmForest', exempt: 'exempt', federal: 'exempt', mfl: 'farmForest', withOther: 'other', partlyExempt: 'commercial', noValues: 'single', none: 'unknown' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'classes of property read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/2509 Van Hise Ave/.test(card) && /Madison · Residential \(1 to 3 units\)/.test(card) && /WISCONSIN/i.test(card), 'address, place (without “City of”) and use');
check(/ASSESSED VALUE · 2025 TAX ROLL/i.test(card) && /\$750,700/.test(card), 'assessed value and the tax roll year');
check(/The state’s records don’t include sales/.test(card) && !/No recorded sale/.test(card), 'no sales in the state’s records, said plainly');
check(/PROPERTY TAX · LAST YEAR’S BILL/i.test(card) && /\$13,422 per year/.test(card) && /2025 tax bill/.test(card) && /lottery credit/.test(card) && !/≈/.test(card.split('PER YEAR')[0].split('BILL')[1] || ''),
  'the real 2025 tax bill, to the dollar');
check(/State market estimate \| \$812k/i.test(card), 'the state’s market estimate where it differs from the assessed value');
check(/State Cartographer/.test(card) && /different shares of market value/.test(card), 'source line');
check(!/SECRET/.test(card), 'no owner name or mailing address on the card');
check(asked.lotWhere.every((w) => /PARCELID NOT IN \('ROW','HYDRO','WATER','LAKE','RAIL','GAP'/.test(w || '')), 'street right-of-way, water, rail and gap outlines are never asked for');
check(asked.outFields && !/OWNER|PSTL/i.test(asked.outFields) && /CNTASSDVALUE/.test(asked.outFields) && /NETPRPTA/.test(asked.outFields) && /AUXCLASS/.test(asked.outFields),
  'owner and mailing fields never requested: ' + asked.outFields);
const calc = await page.evaluate(() => { const L = window.__hp.S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith('2509'))); return window.__hp.calcDefaults(window.__hp.summarize(L.p)); }).catch(() => null);
if (calc) check(calc.price === 812000 && calc.taxKind === 'actual' && calc.ins === 1488, 'monthly cost starts at the market estimate, the real tax and Wisconsin’s average insurance ' + JSON.stringify(calc));

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const condo = await open('123 W WASHINGTON AVE');
console.log('condo:', condo.slice(0, 800));
check(/123 W Washington Ave \|/.test(condo) && /4 units/i.test(condo) && /Condo building · homes and businesses/.test(condo), 'stacked units with a common record: one building, homes and a shop');
check(/The state’s records don’t include sales/.test(condo) && /per unit, per year/.test(condo) && /\$9,090–20,020/.test(condo), 'each unit’s real tax bill');
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('units:', units.join(' / '));
check(units.length === 4 && units.some((u) => /Unit 301/.test(u)), 'units listed with their numbers');
const cdm = await open('309 W WASHINGTON AVE');
console.log('cdm:', cdm.slice(0, 400));
check(/309 W Washington Ave \|/.test(cdm) && !/Cdm/i.test(cdm.split('|').slice(0, 3).join('|')) && /Condo building/i.test(cdm) && /no value of its own/.test(cdm) && /Madison · Condo common area/.test(cdm) && !/LAST YEAR’S BILL/i.test(cdm),
  'a condo’s common record alone (unit “CDM”): said plainly, no tax');
const wausau = await open('201 JEFFERSON STREET');
console.log('wausau:', wausau.slice(0, 500));
const wUnits = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
check(/201 Jefferson Street \|/.test(wausau) && /3 units/i.test(wausau) && /Commercial condo building/.test(wausau) && wUnits.some((u) => /Unit 419/.test(u)),
  'a unit written right after the street is read as a unit: ' + wUnits.join(' / '));
const exempt = await open('131 JEFFERSON STREET');
check(/Tax-exempt property/.test(exempt) && /PROPERTY TAX \| None/i.test(exempt), 'exempt (X4): no tax');
const farm = await open('W SHORE RD');
console.log('farm:', farm.slice(0, 400));
check(/W Shore Rd \|/.test(farm) && /Gibraltar · Farm with a home or buildings/.test(farm) && /\$4,410 per year/.test(farm) && /town tax roll/.test(farm) && !/State market estimate/.test(farm),
  'a farm in a town: no “0” house number, the town’s name, its tax bill');
const apt = await open('2632 S KINNICKINNIC AVE');
check(/Milwaukee · Commercial or apartment building/.test(apt), 'class 2 says it can be an apartment building');
const forest = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.AUX === 'W6'));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '); });
check(/Address not listed/.test(forest) && /Forest land \(state forestry program\)/.test(forest), 'forest in the state’s program, no address');

// Condo units stacked on one outline with or without unit numbers; an apartment tower filed as class 1; parking spaces
const stacks = await page.evaluate(() => {
  const hp = window.__hp, rec = (a) => hp.normalizeRecord({ TAXROLLYEAR: '2025', PLACENAME: 'CITY OF MILWAUKEE', ...a }, 'WI');
  const four = [rec({ SITEADRESS: '15260 MARILYN DR UNIT 3', UNITID: '3', PROPCLASS: '1', CNTASSDVALUE: 110300, IMPVALUE: 53000 }),
    ...[110300, 101600, 101600].map((v) => rec({ SITEADRESS: '15260 MARILYN DR', PROPCLASS: '1', CNTASSDVALUE: v, IMPVALUE: v / 2 }))];
  const tower = [rec({ SITEADRESS: '777 N VAN BUREN ST', PROPCLASS: '1', CNTASSDVALUE: 105237900, IMPVALUE: 102990100 }),
    rec({ SITEADRESS: '777 N VAN BUREN ST 2', UNITID: '2', PROPCLASS: '2', CNTASSDVALUE: 13010600, IMPVALUE: 10776000 }),
    rec({ SITEADRESS: '777 N VAN BUREN ST', PROPCLASS: '2', CNTASSDVALUE: 2551400, IMPVALUE: 2054800 })];
  const a = hp.classifyLot(four, 'WI'), b = hp.classifyLot(tower, 'WI');
  return { four: [a.condo, a.units.length, a.building], tower: [b.condo, b.units.length, b.building], lone: hp.useKind(tower[0], 'WI'),
    parking: rec({ SITEADRESS: '321 W MIFFLIN ST PARKING 94', UNITID: '94', PROPCLASS: '1', CNTASSDVALUE: 15000, IMPVALUE: 7000 }).SITE_ADDR };
});
console.log('stacks:', JSON.stringify(stacks));
check(stacks.four.join() === 'true,4,resCondo', 'four stacked homes, one with a unit number: a condo building with 4 units');
check(stacks.tower.join() === 'true,3,mixedCondo' && stacks.lone === 'apartments', 'a $105M tower filed as class 1 isn’t a 1-to-3-unit home; with its shop and garage, a 3-unit condo');
check(stacks.parking === '321 W MIFFLIN ST PARKING 94', 'a parking space keeps its own label: ' + stacks.parking);

// The layer's habit: now and then one request hangs while the same one asked again answers at once
asked.hangNext = true; const before = asked.lotQueries;
const hedge = await page.evaluate(async () => { const t0 = performance.now(); await window.__hp.centerMap(43.0750, -89.4100);
  return { ms: Math.round(performance.now() - t0), lots: window.__hp.S.local.length }; });
console.log('hedge:', JSON.stringify(hedge), asked.lotQueries - before, 'lot queries');
check(hedge.lots > 0 && hedge.ms >= 4500 && hedge.ms < 9000 && asked.lotQueries - before >= 2, 'a lot query that hangs is asked again after 5 seconds, and that answer is used');

const pq = await page.evaluate(() => ['Port Washington', '12 Main St, Port Washington, WI', 'Madison WI', '100 Main St, Madison, Wisconsin'].map((t) => window.__hp.parseQuery(t)));
console.log('parsed:', JSON.stringify(pq));
check(/PORT WASHINGTON/i.test(pq[0].town) && !pq[0].state, '“Port Washington” is a Wisconsin city, not Washington state');
check(pq[1].state === 'WI' && /Port Washington/i.test(pq[1].town) && pq[2].state === 'WI' && pq[3].state === 'WI', 'Wisconsin typed as WI or in full');

await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Madison, WI/.test(e.textContent))), 'Madison sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '2509 Van Hise Ave, Madison, WI'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /SITEADRESS/i.test(w) && /2509 VAN HISE AVE/.test(w) && /PLACENAME\) LIKE 'CITY OF MADISON%'/i.test(w)), 'search goes to Wisconsin and finds the place as “City of Madison”');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
