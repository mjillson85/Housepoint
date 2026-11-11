// North Carolina: region outline, NC OneMap's statewide parcels (faked with its real field names and real records' shapes),
// how each county's use codes are read, addresses, sale dates without prices, condos, the county + town tax, search.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8776);
const ORIGIN = 'http://localhost:8776';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NC_SVC = 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1';
// The layer's real fields (owner and mailing ones included, so the test can tell they're never asked for).
const NC_FIELDS = ['objectid', 'parno', 'altparno', 'ownname', 'improvval', 'landval', 'parval', 'mailadd', 'munit', 'mcity', 'mstate', 'mzip', 'siteadd', 'sunit',
  'scity', 'gisacres', 'struct', 'multistruc', 'saledate', 'saledatetx', 'legdecfull', 'parusecode', 'parusedesc', 'parusecd2', 'parusedsc2', 'parvaltype',
  'owntype', 'cntyname', 'cntyfips', 'maddpref', 'maddrno', 'maddstname', 'ownfrst', 'ownlast', 'saddno', 'saddstname', 'sstate', 'szip', 'structno',
  'structyear', 'ownname2', 'presentval'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 35.8081, lon0 = -78.6429;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const secret = { ownname: 'SECRET OWNER', ownfrst: 'SECRET', ownlast: 'OWNER', mailadd: '1 SECRET WAY', mcity: 'SECRETVILLE', mstate: 'NC', mzip: '27000', legdecfull: 'LO1 SECRET' };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: '' };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(NC_SVC + '?f=json')) return json({ objectIdField: 'objectid', maxRecordCount: 5000, geometryType: 'esriGeometryPolygon', fields: NC_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(NC_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where')) {
      asked.where.push(q.get('where'));
      return json({ features: /2207 ALEXANDER RD/.test(q.get('where')) ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...secret, objectid: 1, siteadd: '2207 ALEXANDER RD', scity: 'RALEIGH' } }] : [] });
    }
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // Wake County: a house (real record shape: code RHS/R, 01 SINGLFAM)
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...secret, objectid: 1, parno: '1704599243', siteadd: '2207 ALEXANDER RD', scity: 'RALEIGH', szip: '27608',
      cntyname: 'Wake', parval: 913620, landval: 625000, improvval: 288620, parvaltype: 'Assessed', parusecode: 'RHS', parusedesc: 'R', parusecd2: '01', parusedsc2: 'SINGLFAM',
      struct: 'Y', multistruc: 'N', structno: 1, structyear: 1943, saledate: 796453200000, saledatetx: '1995-03-29T00:00:00Z' } });
    // Buncombe County: condo units stacked on one outline, with the common area record (no value), padded address
    for (let i = 1; i <= 4; i++) feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...secret, objectid: 10 + i, siteadd: '12 LEXINGTON  AVE', sunit: `20${i}`,
      scity: 'ASHEVILLE', cntyname: 'Buncombe', parval: 400000 + i * 10000, landval: 0, improvval: 400000 + i * 10000, parvaltype: 'Assessed', parusecode: '120', parusedesc: 'CONDOMINIUM',
      parusedsc2: 'Improved', struct: 'Y', structyear: 2004, saledate: i === 2 ? 1709269200000 : null } });
    feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...secret, objectid: 20, siteadd: '12 LEXINGTON  AVE', scity: 'ASHEVILLE', cntyname: 'Buncombe', parval: 0,
      parusecode: '317', parusedesc: 'COMMON AREA', parusedsc2: 'Not improved', struct: 'N', structyear: 0 } });
    // Wake County: a church (XMT/E, 66 CHURCH) with Wake's "unknown" sale date, January 1, 2001
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...secret, objectid: 30, siteadd: '2300 WHITE OAK RD', scity: 'RALEIGH', cntyname: 'Wake', parval: 2400000,
      landval: 900000, improvval: 1500000, parusecode: 'XMT', parusedesc: 'E', parusecd2: '66', parusedsc2: 'CHURCH', structyear: 1955, saledate: 978325200000 } });
    // Mecklenburg County: the address carries the city and state, and double spaces; a duplex
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { ...secret, objectid: 40, siteadd: '1900  DILWORTH RD WEST CHARLOTTE NC', scity: 'CHARLOTTE', cntyname: 'Mecklenburg',
      parval: 1815600, landval: 718800, improvval: 1096800, parvaltype: 'Market', parusecode: 'R200', parusedesc: 'TWO FAMILY RESIDENTIAL', parusecd2: '02', parusedsc2: 'DUPLEX',
      struct: '1', structyear: 1927, saledate: 1414990800000 } });
    // Wake County: a condo building's association record, the only record on its lot (Wake doesn't map units one by one)
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { ...secret, objectid: 50, siteadd: '401 W HARGETT ST', scity: 'RALEIGH', cntyname: 'Wake', parval: 0,
      landval: 0, improvval: 0, parusecode: 'HOA', parusedesc: 'I', parusecd2: '09', parusedsc2: 'ELEV APT', struct: 'Y', multistruc: 'Y', structno: 8, structyear: 2017, saledate: 978325200000 } });
    // Guilford County: no address on the state layer, 1899 for an unknown sale date
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { ...secret, objectid: 60, siteadd: null, scity: null, cntyname: 'Guilford', parval: 310000, landval: 90000,
      improvval: 220000, parusedesc: 'RESIDENTIAL', parusedsc2: '01-SFR', structyear: 1962, saledate: -2208970800000 } });
    // Durham: units share the building's parcel number and write the unit after the house number
    for (let i = 1; i <= 3; i++) feats.push({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { ...secret, objectid: 70 + i, parno: '0821972317',
      siteadd: `110 210${i} N CORCORAN ST`, scity: 'DURHAM', cntyname: 'Durham', parval: 500000 + (i % 2) * 1000, parusedesc: 'RES/ CONDOMINIUM', saledatetx: `3/${i}/2019 12:00:00 AM` } });
    feats.push({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { ...secret, objectid: 79, parno: '0821972317', siteadd: '0 N CORCORAN ST', scity: 'DURHAM', cntyname: 'Durham',
      parval: 1, parusedesc: 'COM/ HOMEOWNERS ASSO', saledatetx: '12/30/1899 12:00:00 AM' } });
    // Mecklenburg: one apartment tower listed once per building section, the same value each time
    for (const [i, use, addr] of [[81, 'PARKING GARAGE', null], [82, 'APARTMENT-HIRISE >=7 STORIES', '225 S POPLAR ST CHARLOTTE NC'], [83, 'RETAIL FREESTANDING', null]])
      feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { ...secret, objectid: i, parno: '07802101', siteadd: addr, scity: 'CHARLOTTE', cntyname: 'Mecklenburg',
        parval: 103059400, parusecode: 'A500', parusedesc: 'MULTI FAMILY', parusecd2: '60H', parusedsc2: use, saledate: 1672722000000 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { raleigh: f(35.7796, -78.6382), charlotte: f(35.2271, -80.8431), pineville: f(35.083, -80.887), asheville: f(35.5951, -82.5515), wilmington: f(34.2257, -77.9447),
    nagsHead: f(35.9574, -75.6241), hatteras: f(35.2190, -75.6900), boone: f(36.2168, -81.6746), murphy: f(35.0876, -84.0349), greensboro: f(36.0726, -79.792),
    myrtle: f(33.6891, -78.8867), greenvilleSC: f(34.8526, -82.394), rockHill: f(34.9249, -81.0251), knoxville: f(35.9606, -83.9207), norfolk: f(36.8508, -76.2859),
    danville: f(36.5860, -79.3950), boston: f(42.3601, -71.0589), miami: f(25.7617, -80.1918) };
});
console.log('regions:', JSON.stringify(rg));
check(['raleigh', 'charlotte', 'pineville', 'asheville', 'wilmington', 'nagsHead', 'hatteras', 'boone', 'murphy', 'greensboro'].every((k) => rg[k] === 'NC'), 'North Carolina places land in North Carolina');
check(['myrtle', 'greenvilleSC', 'rockHill', 'knoxville', 'norfolk', 'danville'].every((k) => rg[k] === null), 'South Carolina, Tennessee and Virginia stay out');
check(rg.boston === 'MA' && rg.miami === 'FL', 'other states unchanged');

// How each county's codes are read (descriptions from the real records the probe found)
const kinds = await page.evaluate(() => {
  const k = (code, desc, code2, desc2, extra = {}) => window.__hp.useKind({ USE_CODE: code, USE_DESC: desc, USE_CODE2: code2, USE_DESC2: desc2, YEAR_BUILT: 1990, BLDG_VAL: 100000, ...extra }, 'NC');
  return {
    wakeHouse: k('RHS', 'R', '01', 'SINGLFAM'), wakeTwo: k('RHS', 'R', '02', 'TWOFAM'), wakeApt: k('APT', 'G', '07', 'GRDN APT'), wakeOffice: k('COM', 'C', '34', 'OFC GROSS'),
    wakeConv: k('COM', 'C', '35', 'RES CONV'), wakeWarehouse: k('IND', 'D', '83', 'WAREHSE'), wakeVacant: k('VAC', 'V', '47', 'SNGL TEN', { YEAR_BUILT: null, BLDG_VAL: 0 }),
    wakeChurch: k('XMT', 'E', '66', 'CHURCH'), wakeHoaCondo: k('HOA', 'I', '09', 'ELEV APT'), wakeHoaLand: k('HOA', 'I', null, null, { YEAR_BUILT: null, BLDG_VAL: 0 }),
    meckHouse: k('R100', 'SINGLE FAMILY RESIDENTIAL', '01', 'SINGLE FAMILY RESIDENTIAL'), meckTown: k('R309', 'TOWN HOUSE  SFR', '09', 'TOWNHOUSE'),
    meckCondo: k('R300', 'CONDOMINIUM', '04', 'RESIDENTIAL CONDOMINIUM < 7 STORIES'), meckHiRise: k('R306', 'CONDOMINIUM HIGH RISE', '06', 'RESIDENTIAL CONDO HI-RISE > 6 STORIES'),
    meckOfficeCondo: k('O424', 'OFFICE CONDOMINIUM', '24', 'OFFICE CONDOMINIUM'), meckStadium: k('9010', 'NO LAND INTEREST', '55', 'STADIUM'),
    buncHouse: k('100', 'RESIDENTIAL', null, 'Improved'), buncLot: k('311', 'RES BUILDING LOT', null, 'Not improved', { YEAR_BUILT: null, BLDG_VAL: 0 }),
    buncCommon: k('317', 'COMMON AREA', null, 'Not improved', { YEAR_BUILT: null, BLDG_VAL: 0 }), buncRetail: k('481', 'ROW RETAIL BLD.', null, 'Improved'),
    buncGov: k('365', 'GOVERNMENT/EXMT/VAC', null, 'Not improved'), guilCondo: k(null, 'CONDO', null, '04-CONDO'), guilTownhome: k(null, 'TOWNHOUSE', null, '041-TOWNHOME'),
    guilDuplex: k(null, 'RESIDENTIAL', null, '08-DUPLEX/TRIPLEX'), guilChurch: k(null, 'INSTITUTIONAL', null, '16-309-Church'), durhamHouse: k('RU-5(2)', 'RES/ 1-FAMILY'),
    durhamTwo: k('RU-5(2)', 'RES/ 2-FAMILY'), durhamCondo: k(null, 'RES/ CONDOMINIUM'), durhamGov: k('DD-C', 'CMNTY SVC/ GOVT BLDG'), durhamShop: k('DD-C', 'COM/ RETAIL SERVICES'),
    hanoverHouse: k('RES', 'Residential', '10', '1 Family Residential'), hanoverLand: k('RES', 'Residential', '958', 'Unused Land', { YEAR_BUILT: null, BLDG_VAL: 0 }),
    dareMulti: k('1900', 'MULTI-USE'), dareShed: k('9900', 'SECONDARY IMPROVEMENT'), wataugaApt: k('A11', 'APARTMENT-GARDEN (1-3 STORIES)', 'CO'),
    mobile: k(null, null, '0202', 'MANUFACTURED HOME-DOUBLE WIDE'), farm: k('AG', null), none: k(null, null, null, null),
    wataugaCommon: k('E17', 'EXCLUSIONS (COMMONE AREAS)', 'EC'), durhamAssoc: k('DD-C', 'VAC COM/ CONDO ASSOC'), durhamHoa: k(null, 'COM/ HOMEOWNERS ASSO'),
    buncStorage: k('122', 'CONDO STORAGE', null, 'Improved'), meckCommonArea: k(null, 'OFFICE CONDOMINIUM COMMON AREA'),
    meckOfficeTower: k('9010', 'NO LAND INTEREST', '18A', 'OFFICE HI-RISE A > 4 STORIES'), wataugaShop: k('C73', 'RETAIL - SINGLE OCCUPANCY', 'CO'),
    wataugaGrocery: k('C47', 'SUPERMARKET', 'CO'), meckOfficeConv: k('O400', 'OFFICE', '17R', 'OFFICE CONVERSION FROM SFR'), dareState: k('9100', 'STATE OF NORTH CAROLINA'),
    meckAir: k('9403', 'AIR RIGHTS PARCEL'), buncPolice: k('662', 'POLICE-FIRE DEPT.', null, 'Improved'), styleRanch: k(null, null, null, 'RANCH'),
  };
});
console.log('kinds:', JSON.stringify(kinds));
const want = { wakeHouse: 'single', wakeTwo: 'multi', wakeApt: 'apartments', wakeOffice: 'commercial', wakeConv: 'commercial', wakeWarehouse: 'industrial', wakeVacant: 'vacant',
  wakeChurch: 'exempt', wakeHoaCondo: 'condoMaster', wakeHoaLand: 'other', meckHouse: 'single', meckTown: 'single', meckCondo: 'resCondo', meckHiRise: 'resCondo',
  meckOfficeCondo: 'comCondo', meckStadium: 'commercial', buncHouse: 'single', buncLot: 'vacant', buncCommon: 'other', buncRetail: 'commercial', buncGov: 'exempt',
  guilCondo: 'resCondo', guilTownhome: 'single', guilDuplex: 'multi', guilChurch: 'exempt', durhamHouse: 'single', durhamTwo: 'multi', durhamCondo: 'resCondo',
  durhamGov: 'exempt', durhamShop: 'commercial', hanoverHouse: 'single', hanoverLand: 'vacant', dareMulti: 'mixed', dareShed: 'accessory', wataugaApt: 'apartments',
  mobile: 'mobile', farm: 'farmForest', none: 'unknown', wataugaCommon: 'other', durhamAssoc: 'condoMaster', durhamHoa: 'other', buncStorage: 'accessory',
  meckCommonArea: 'condoMaster', meckOfficeTower: 'commercial', wataugaShop: 'commercial', wataugaGrocery: 'commercial', meckOfficeConv: 'commercial',
  dareState: 'exempt', meckAir: 'other', buncPolice: 'exempt', styleRanch: 'single' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'each county’s use codes read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/2207 Alexander Rd/.test(card) && /Raleigh · Single-family home/.test(card) && /NORTH CAROLINA/i.test(card), 'address, town and use');
check(/COUNTY TAX VALUE/i.test(card) && /\$913,620/.test(card), 'county tax value');
check(/Last sold Mar 1995 \(\d+ yrs ago\) · the state’s records don’t list the price/.test(card) && !/not a market sale/.test(card), 'sale date without a price, said plainly');
check(/Built 1943/.test(card), 'year built');
check(/ESTIMATED PROPERTY TAX/i.test(card) && /≈ \$8,310 per year/.test(card) && /Wake County’s rate \(\$0\.5371\) plus Raleigh’s \(\$0\.372\)/.test(card)
  && /Outside Raleigh’s town limits .* about \$4,910/.test(card), 'county + town tax, and the county-only figure for outside town limits');
check(/NC OneMap/.test(card) && /reappraise/.test(card), 'source line');
check(!/SECRET/.test(card), 'no owner name or mailing address on the card');
check(asked.outFields && !/own|mail|madd|mcity|mzip|mstate|munit|legdec/i.test(asked.outFields) && /parval/.test(asked.outFields) && /parusedsc2/.test(asked.outFields),
  'owner, mailing and legal-description fields never requested: ' + asked.outFields);

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const condo = await open('12 LEXINGTON AVE');
console.log('condo:', condo.slice(0, 700));
check(/4 units/i.test(condo) && /12 Lexington Ave/.test(condo) && /Condo building/.test(condo), 'stacked condo units become one building; the double space is gone');
check(/\$410k–\$440k/i.test(condo), 'unit value range');
check(/Latest unit sale Mar 2024 · the state’s records don’t list prices/.test(condo), 'unit sale date without a price');
check(/Buncombe County’s rate \(\$0\.6154\) plus Asheville’s/.test(condo) && /per unit, per year/.test(condo), 'per-unit tax with the town’s rate');
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('units:', units.join(' / '));
check(units.length === 4 && units.some((u) => /201/.test(u)), 'units listed with their numbers');
const church = await open('2300 WHITE OAK RD');
console.log('church:', church.slice(0, 400));
check(/PROPERTY TAX \| None/i.test(church) && /Church/.test(church) && /No recorded sale on file/.test(church), 'church is tax-exempt; January 1, 2001 isn’t a sale');
const duplex = await open('1900 DILWORTH RD WEST');
console.log('duplex:', duplex.slice(0, 400));
check(/1900 Dilworth Rd West \|/.test(duplex) && !/Charlotte Nc/i.test(duplex.split('|')[0]) && /Two-family/.test(duplex), 'city and state taken off the address; two-family');
const hoa = await open('401 W HARGETT ST');
console.log('hoa:', hoa.slice(0, 400));
check(/Condo building/i.test(hoa) && /doesn’t map its condo units one by one/.test(hoa) && !/ESTIMATED PROPERTY TAX/i.test(hoa), 'a condo association record alone: said plainly, no tax');
const noAddr = await page.evaluate(() => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => r.COUNTY === 'Guilford'));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); return document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '); });
console.log('no address:', noAddr.slice(0, 300));
check(/Address not listed/.test(noAddr) && /Single-family home/.test(noAddr) && /No recorded sale on file/.test(noAddr), 'no address on the state layer; 1899 isn’t a sale');

const durham = await open('N CORCORAN ST');
console.log('durham:', durham.slice(0, 500));
check(/North Carolina \| 110 N Corcoran St \|/.test(durham) && /3 units/i.test(durham), 'units sharing a parcel number stay separate units; the building takes the units’ house number');
const durhamUnits = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
check(durhamUnits.some((u) => /Unit 2101/.test(u)) && !durhamUnits.some((u) => /110 2101/.test(u)), 'unit number moved after the street: ' + durhamUnits.join(' / '));
const tower = await open('225 S POPLAR ST');
console.log('tower:', tower.slice(0, 500));
check(/225 S Poplar St/.test(tower) && /Apartments/.test(tower) && !/Also on this lot/.test(tower) && /\$103,059,400/.test(tower), 'a parcel listed once per building section is one record');

await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Raleigh/.test(e.textContent))), 'Raleigh sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '2207 Alexander Rd, Raleigh, NC'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /siteadd/i.test(w) && /2207 ALEXANDER RD/.test(w) && /scity/i.test(w)), 'search goes to North Carolina and uses the town');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
