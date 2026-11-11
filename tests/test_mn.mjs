// Minnesota: region outline (Wisconsin wins the river line), MnGeo's open parcels (faked with its real field names and real
// records' shapes), addresses built from their parts, each county's own words for a property's class (and the numbered ones),
// condo units stacked on one outline with garage stalls left out, the county's tax figure, search by the address's parts,
// and the note for counties that don't share their records.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8780);
const ORIGIN = 'http://localhost:8780';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MN_SVC = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/plan_parcels_open/MapServer/1';
// The layer's real fields, owner and tax-mailing ones included (they must never be asked for).
const MN_FIELDS = ['objectid', 'county_pin', 'state_pin', 'anumberpre', 'anumber', 'anumbersuf', 'st_pre_mod', 'st_pre_dir', 'st_pre_typ', 'st_pre_sep', 'st_name',
  'st_pos_typ', 'st_pos_dir', 'st_pos_mod', 'sub_type1', 'sub_id1', 'sub_type2', 'sub_id2', 'zip', 'zip4', 'ctu_name', 'ctu_id_txt', 'postcomm', 'co_code', 'co_name',
  'state_code', 'lot', 'block', 'plat_name', 'owner_name', 'owner_more', 'own_add_l1', 'own_add_l2', 'own_add_l3', 'own_add_l4', 'tax_name', 'tax_add_l1',
  'tax_add_l2', 'tax_add_l3', 'tax_add_l4', 'landmark', 'homestead', 'acres_poly', 'acres_deed', 'emv_land', 'emv_bldg', 'emv_total', 'tax_year', 'mkt_year',
  'tax_capac', 'total_tax', 'spec_asses', 'useclass1', 'useclass2', 'useclass3', 'useclass4', 'multi_uses', 'tax_exempt', 'xuseclass1', 'xuseclass2', 'xuseclass3',
  'xuseclass4', 'dwell_type', 'home_style', 'fin_sq_ft', 'garage', 'garagesqft', 'basement', 'heating', 'cooling', 'year_built', 'num_units', 'sale_date',
  'sale_value', 'green_acre', 'open_space', 'ag_preserv', 'agpre_enrd', 'agpre_expd', 'abb_legal', 'edit_date', 'exp_date', 'polyptrel', 'n_standard', 'ownership',
  'school_dst', 'wshd_dst', 'section', 'township', 'range', 'range_dir', 'prin_mer'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 44.9244, lon0 = -93.3195;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const secret = { owner_name: 'SECRET OWNER', own_add_l1: 'SECRET MAIL', tax_name: 'SECRET TAXPAYER', abb_legal: 'SECRET LEGAL' };
const HENN = { co_name: 'Hennepin', co_code: '27053', ctu_name: 'Minneapolis', postcomm: 'Minneapolis', tax_year: 0, ...secret };
const RAMS = { co_name: 'Ramsey', co_code: '27123', ctu_name: 'Saint Paul', postcomm: 'St Paul', tax_year: 2026, ...secret };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: '' };
let empty = false;          // a county that doesn't share its records: the layer answers with nothing
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith(MN_SVC + '?f=json')) return json({ objectIdField: 'objectid', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: MN_FIELDS.map((name) => ({ name })) });
  if (u.startsWith(MN_SVC + '/query')) {
    const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
    asked.outFields = q.get('outFields');
    if (q.get('where') && !q.get('geometry')) {
      const w = q.get('where'); asked.where.push(w);
      const hit = /anumber=4332 AND UPPER\(st_name\) LIKE 'XERXES%'/.test(w) && /UPPER\(ctu_name\) LIKE 'MINNEAPOLIS%'|UPPER\(postcomm\) LIKE 'MINNEAPOLIS%'/.test(w);
      return json({ features: hit ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...HENN, objectid: 1, anumber: 4332, st_name: 'Xerxes', st_pos_typ: 'Avenue', st_pos_dir: 'South', emv_total: 606200 } }] : [] });
    }
    if (empty) return json({ features: [] });
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // Hennepin: a Linden Hills house, its sale and the county's tax figure
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...HENN, objectid: 1, county_pin: '0802824310040', anumber: 4332, st_name: 'Xerxes', st_pos_typ: 'Avenue',
      st_pos_dir: 'South', zip: '55410', homestead: 'Yes', emv_land: 330000, emv_bldg: 276200, emv_total: 606200, total_tax: 9720, spec_asses: 0, useclass1: 'Double Bungalow',
      tax_exempt: 'N', fin_sq_ft: 0, year_built: 1915, num_units: 0, sale_date: 1769904000000, sale_value: 750000, ownership: 'Unknown' } });
    // Hennepin: a plain residential one, west 43rd street
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...HENN, objectid: 2, county_pin: '0802824420110', anumber: 3005, st_name: '43rd', st_pos_typ: 'Street',
      st_pos_dir: 'West', zip: '55410', homestead: 'No', emv_land: 760000, emv_bldg: 386000, emv_total: 1146000, total_tax: 19931, useclass1: 'Residential', tax_exempt: 'N',
      year_built: 1900, sale_date: 557452800000, sale_value: 162000 } });
    // Hennepin: three condos stacked on one outline, each its own address
    for (const [i, n, v] of [[10, 3115, 1335000], [11, 3119, 1302000], [12, 3123, 1335000]])
      feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { ...HENN, objectid: i, county_pin: `08028243101${i}`, anumber: n, st_name: '43rd', st_pos_typ: 'Street',
        st_pos_dir: 'West', emv_land: 860000, emv_bldg: v - 860000, emv_total: v, total_tax: Math.round(v * 0.0176), useclass1: 'Condominium (also Market Rate Cooperative)',
        tax_exempt: 'N', year_built: 2020 } });
    // Hennepin: exempt (the county still calls it Commercial)
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { ...HENN, objectid: 20, anumber: 4230, st_name: 'Xerxes', st_pos_typ: 'Avenue', st_pos_dir: 'South',
      emv_total: 0, emv_bldg: 0, total_tax: 0, useclass1: 'Commercial', tax_exempt: 'Y', year_built: 1973 } });
    // Ramsey (St Paul): a Summit Hill house with its dwelling type and finished area
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { ...RAMS, objectid: 30, county_pin: '022823330098', anumber: 1061, st_name: 'Goodrich', st_pos_typ: 'Avenue',
      zip: '55105', homestead: 'Yes', emv_land: 189800, emv_bldg: 612800, emv_total: 802600, total_tax: 15016, useclass1: '1a/1b/4bb Residential Single Unit', tax_exempt: 'N',
      dwell_type: 'Single Family Dwelling, Platt', home_style: 'Two Story', fin_sq_ft: 2252, year_built: 1912, sale_date: 1655769600000, sale_value: 715000 } });
    // Ramsey: condo units on one outline (sub_id1), with garage stalls among them
    for (const [i, id, v, sf] of [[40, '208', 668300, 1858], [41, '301', 417200, 1080], [42, '405', 1308700, 2588], [43, 'G31', 19300, 0]])
      feats.push({ geometry: { rings: [ring(-90, 40, -60, 80, b)] }, attributes: { ...RAMS, objectid: i, county_pin: `0228233300${i}`, anumber: 1060, st_name: 'Grand',
        st_pos_typ: 'Avenue', sub_type1: 'Unit', sub_id1: id, emv_land: 1000, emv_bldg: v - 1000, emv_total: v, total_tax: Math.round(v * 0.0183),
        useclass1: '1a/1b/4bb Residential Single Unit', tax_exempt: 'N', dwell_type: id.startsWith('G') ? null : 'Condo', home_style: 'Condo/Apt', fin_sq_ft: sf, year_built: 1984 } });
    // Ramsey: a church
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { ...RAMS, objectid: 50, anumber: 1100, st_name: 'Grand', st_pos_typ: 'Avenue', emv_total: 2400000,
      emv_bldg: 1900000, total_tax: 0, useclass1: '5e Church', tax_exempt: 'Y' } });
    // Itasca: numbered classes, a Grand Rapids house (201) and a cabin (151), and state land (765)
    const ITA = { co_name: 'Itasca', ctu_name: 'Grand Rapids City', ...secret };
    feats.push({ geometry: { rings: [ring(-15, -70, 15, -40, b)] }, attributes: { ...ITA, objectid: 60, anumber: 803, st_pre_dir: 'North', st_name: 'Pokegama', st_pos_typ: 'Avenue',
      emv_land: 30100, emv_bldg: 287800, emv_total: 317900, useclass1: '201', homestead: 'No' } });
    feats.push({ geometry: { rings: [ring(-160, -20, -120, 20, b)] }, attributes: { ...ITA, ctu_name: 'Carpenter Twp', objectid: 61, anumber: 26607, st_name: '1', st_pre_typ: 'County Road',
      emv_land: 70100, emv_bldg: 20400, emv_total: 90500, useclass1: '151', homestead: 'No' } });
    feats.push({ geometry: { rings: [ring(120, -20, 160, 20, b)] }, attributes: { co_name: 'Koochiching', ctu_name: 'Unorg 155-28 And 156-28', objectid: 62, emv_land: 6800,
      useclass1: '765', homestead: 'No', total_tax: 0 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { minneapolis: f(44.9778, -93.265), stPaul: f(44.9537, -93.09), duluth: f(46.7867, -92.1005), rochester: f(44.0121, -92.4802), stCloud: f(45.5579, -94.1632),
    moorhead: f(46.8738, -96.7678), grandMarais: f(47.7504, -90.334), intlFalls: f(48.6011, -93.4108), stillwater: f(45.0564, -92.8085), redWing: f(44.5625, -92.5338),
    winona: f(44.05, -91.6393), worthington: f(43.6199, -95.5964), angle: f(49.35, -95.06), ely: f(47.9032, -91.8671), grandRapids: f(47.2372, -93.5302),
    fargo: f(46.8772, -96.7898), grandForks: f(47.9253, -97.0329), siouxFalls: f(43.5446, -96.7311), superior: f(46.7208, -92.1041), hudson: f(44.9747, -92.7568),
    laCrosse: f(43.8014, -91.2396), masonCity: f(43.1536, -93.201), thunderBay: f(48.3809, -89.2477), winnipeg: f(49.8951, -97.1384), madison: f(43.0731, -89.4012), omaha: f(41.2565, -95.9345) };
});
console.log('regions:', JSON.stringify(rg));
check(['minneapolis', 'stPaul', 'duluth', 'rochester', 'stCloud', 'moorhead', 'grandMarais', 'intlFalls', 'stillwater', 'redWing', 'winona', 'worthington', 'angle', 'ely', 'grandRapids']
  .every((k) => rg[k] === 'MN'), 'Minnesota places land in Minnesota');
check(['fargo', 'grandForks', 'siouxFalls', 'masonCity', 'thunderBay', 'winnipeg'].every((k) => rg[k] === null), 'North Dakota, South Dakota, Iowa and Canada stay out');
check(rg.superior === 'WI' && rg.hudson === 'WI' && rg.laCrosse === 'WI' && rg.madison === 'WI' && rg.omaha === 'NE', 'Wisconsin keeps Superior, Hudson and La Crosse');
const decl = await page.evaluate(() => [[44.98, -93.27], [46.87, -96.77], [47.96, -89.68]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] + 0.3) < 0.6 && Math.abs(decl[1] - 2.4) < 0.6 && Math.abs(decl[2] + 3.4) < 0.8, 'compass declination: Minneapolis, Moorhead, Grand Portage ' + decl.join(', '));

// Each county's words for the class, and the numbered ones
const kinds = await page.evaluate(() => {
  const k = (use, extra = {}) => window.__hp.useKind({ USE_CODE: use, TOTAL_VAL: 400000, BLDG_VAL: 250000, SITE_ADDR: '12 MAIN ST', TAX_LAST: 5000, COUNTY: 'Hennepin', ...extra }, 'MN');
  return { res: k('Residential'), ramsey: k('1a/1b/4bb Residential Single Unit', { DWELL: 'Single Family Dwelling, Platt' }), olmsted: k('1a/4bb(1) RESIDENTIAL SINGLE UNIT'),
    duluth: k('Non-Homestead Qualifying Single Res Unit', { DWELL: 'House' }), garageOnly: k('Residential 1 Unit', { DWELL: 'Garage' }),
    townhome: k('1a/1b/4bb Residential Single Unit', { DWELL: 'Townhome - Outer Unit' }), condoR: k('1a/1b/4bb Residential Single Unit', { DWELL: 'Condo' }),
    condoH: k('Condominium (also Market Rate Cooperative)'), coopBldg: k('Cooperative (Limited Equity)', { TOTAL_VAL: 9e6 }), duplex: k('Double Bungalow'),
    upDown: k('1a/1b/4b1 Residential 1-3 Units', { DWELL: 'Two Family Dwelling - Up/Dwn' }), apts: k('4a Apartment 4 Or More Units', { TOTAL_VAL: 3e6 }),
    aptsShops: k('4a Apartment 4 Or More Units', { USE_CODE2: '3a Commercial Land And Building', TOTAL_VAL: 3e7 }), aptH: k('Apartment', { TOTAL_VAL: 6e7 }),
    lowInc: k('4d1 Non-Homestd Qualify Low Inc Rental', { DWELL: 'Apartments 7-19 Rental Units' }), shop: k('3a Commercial Land And Building'), shopH: k('Commercial'),
    office: k('Commercial Preferred', { DWELL: 'Office' }), parking: k('Commercial Preferred', { DWELL: 'Parking Lot', BLDG_VAL: 0 }), plant: k('3a Industrial Land And Building'),
    vacRes: k('Vacant Land - Residential', { BLDG_VAL: 0 }), vacCom: k('Vacant Land - Commercial', { BLDG_VAL: 0 }), unimp: k('4b4 Unimproved Residential Land', { BLDG_VAL: 0 }),
    cabin: k('Non-Comm Seasonal Residential Recreational'), resort: k('Seasonal Recreational Commercial Resort'), farm: k('2a/1b/4bb Agricultural'),
    rural: k('Rural Vacant Land', { BLDG_VAL: 0 }), forest: k('Federal National Forest', { TAX_LAST: 0 }), church: k('5e Church', { EXEMPT: 'Y', TAX_LAST: 0 }),
    school: k('5e K-12 School-Public', { TAX_LAST: 0 }), forfeit: k('Tax Forfeited County Administered/PILT', { TAX_LAST: 0 }), rail: k('Railroad'), utility: k('Utility'),
    common: k('Common Area (No Value)', { TOTAL_VAL: 0, BLDG_VAL: 0 }), condoGarage: k('Condo - Garage/Miscellaneous', { TOTAL_VAL: 25000 }),
    stall: k('1a/1b/4bb Residential Single Unit', { UNIT_ID: 'G31', TOTAL_VAL: 19300, SITE_ADDR: '174 6TH ST UNIT G31' }), mobile: k('Manufactured Home', { DWELL: 'Mobile Home' }),
    nursing: k('Nursing Home'), exemptFlag: k('Residential', { EXEMPT: 'Y' }), stateOwned: k('Residential', { OWN_TYPE: 'State' }), houseLot: k('Residential', { BLDG_VAL: 0 }),
    n201: k('201', { COUNTY: 'Itasca' }), n151: k('151', { COUNTY: 'Crow Wing' }), n151lot: k('151', { COUNTY: 'Crow Wing', BLDG_VAL: 0 }), n101: k('101', { COUNTY: 'Itasca' }),
    n111: k('111', { COUNTY: 'Koochiching', BLDG_VAL: 0 }), n205: k('205', { COUNTY: 'Crow Wing', TOTAL_VAL: 5.8e6 }), n211: k('211', { COUNTY: 'Itasca', BLDG_VAL: 0 }),
    n233: k('233', { COUNTY: 'Itasca' }), n725: k('725', { COUNTY: 'Itasca', TAX_LAST: 0 }), n765: k('765', { COUNTY: 'Koochiching', TAX_LAST: 0, BLDG_VAL: 0 }),
    n671taxed: k('671', { COUNTY: 'Koochiching', TAX_LAST: 1688 }), w100: k('100', { COUNTY: 'Washington', DWELL: 'Single-Family / Owner Occupied' }),
    w100condo: k('100', { COUNTY: 'Washington', DWELL: 'Condominium' }), w140: k('140', { COUNTY: 'Washington', BLDG_VAL: 0 }), w200: k('200', { COUNTY: 'Washington' }),
    lotw: k('0', { COUNTY: 'Lake of the Woods' }), none: k(null) };
});
console.log('kinds:', JSON.stringify(kinds));
const want = { res: 'single', ramsey: 'single', olmsted: 'single', duluth: 'single', garageOnly: 'accessory', townhome: 'single', condoR: 'resCondo', condoH: 'resCondo',
  coopBldg: 'apartments', duplex: 'multi', upDown: 'multi', apts: 'apartments', aptsShops: 'mixed', aptH: 'apartments', lowInc: 'apartments', shop: 'commercial',
  shopH: 'commercial', office: 'commercial', parking: 'commercial', plant: 'industrial', vacRes: 'vacant', vacCom: 'vacant', unimp: 'vacant', cabin: 'single',
  resort: 'commercial', farm: 'farmForest', rural: 'farmForest', forest: 'exempt', church: 'exempt', school: 'exempt', forfeit: 'exempt', rail: 'other', utility: 'other',
  common: 'other', condoGarage: 'accessory', stall: 'accessory', mobile: 'mobile', nursing: 'institutional', exemptFlag: 'exempt', stateOwned: 'exempt', houseLot: 'vacant',
  n201: 'single', n151: 'single', n151lot: 'vacant', n101: 'farmForest', n111: 'farmForest', n205: 'apartments', n211: 'vacant', n233: 'commercial', n725: 'exempt',
  n765: 'exempt', n671taxed: 'other', w100: 'single', w100condo: 'resCondo', w140: 'vacant', w200: 'farmForest', lotw: 'unknown', none: 'unknown' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'classes read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));
const labels = await page.evaluate(() => {
  const l = (use, extra = {}) => window.__hp.REGIONS.MN.useLabel(use, { USE_CODE: use, TOTAL_VAL: 400000, BLDG_VAL: 250000, SITE_ADDR: '12 MAIN ST', TAX_LAST: 5000, COUNTY: 'Hennepin', ...extra });
  return [l('Double Bungalow'), l('1a/1b/4bb Residential Single Unit', { DWELL: 'Townhome - Outer Unit' }), l('Non-Comm Seasonal Residential Recreational'),
    l('5e Church', { TAX_LAST: 0 }), l('151', { COUNTY: 'Crow Wing' }), l('Commercial Preferred', { DWELL: 'Office' }), l('765', { COUNTY: 'Koochiching', TAX_LAST: 0, BLDG_VAL: 0 }),
    l('Residential'), l('1a/1b/4b1 Residential 1-3 Units', { DWELL: 'Two Family Dwelling - Up/Dwn' }), l('Tax Forfeited County Administered/PILT', { TAX_LAST: 0 })];
});
console.log('labels:', labels.join(' / '));
check(labels.join('/') === 'Duplex (double bungalow)/Townhouse/Cabin or seasonal home/Church/Cabin or seasonal home/Office building/Tax-exempt property/Single-family home/Duplex/Tax-forfeited land',
  'labels from the county’s words');

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1300));
check(/4332 Xerxes Ave S \|/.test(card) && /Minneapolis · Duplex \(double bungalow\)/.test(card) && /MINNESOTA/i.test(card), 'address joined from its parts, city and use');
check(/COUNTY ESTIMATED MARKET VALUE/i.test(card) && /\$606,200/.test(card) && /Built 1915/.test(card), 'market value and year built');
check(/Last sold \$750,000 · (Jan|Feb) 2026/.test(card), 'last sale with its price');
check(/PROPERTY TAX · LATEST BILL/i.test(card) && /\$9,720 per year/.test(card) && /homestead/.test(card) && !/≈/.test(card.split('PROPERTY TAX')[1] || ''), 'the county’s tax figure, not an estimate');
check(/MnGeo/.test(card) && !/SECRET/.test(card), 'source line; no owner, mailing address or legal description on the card');
check(asked.outFields && !/owner_|own_add|tax_name|tax_add|abb_legal/i.test(asked.outFields) && /emv_total/.test(asked.outFields) && /useclass1/.test(asked.outFields),
  'owner, mailing and legal fields are never requested: ' + asked.outFields);

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const w43 = await open('3005 43RD ST W');
check(/3005 43rd St W \|/.test(w43) && /Minneapolis · Single-family home/.test(w43) && /\$19,931 per year/.test(w43) && /homestead exclusion/.test(w43), 'a residential lot; a non-homestead’s tax note');
const stack = await open('3115 43RD ST W');
console.log('stack:', stack.slice(0, 500));
check(/3 units/i.test(stack) && /Condo building/i.test(stack) && /per unit, per year/.test(stack), 'condos with their own addresses on one outline are one building');
const grand = await open('1060 GRAND AVE');
const gUnits = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('grand:', grand.slice(0, 600), gUnits.join(' / '));
check(/1060 Grand Ave \|/.test(grand) && /Saint Paul · Condo building/.test(grand) && /3 units/i.test(grand) && gUnits.some((u) => /Unit 208/.test(u)) && gUnits.filter((u) => /G31/.test(u)).every((u) => /Garage/.test(u)),
  'St Paul condo units by unit number; the garage stall isn’t a unit');
const summit = await open('1061 GOODRICH AVE');
check(/Saint Paul · Single-family home/.test(summit) && /Built 1912/.test(summit) && /2,252 ft²/.test(summit) && /PROPERTY TAX · 2026 BILL/i.test(summit) && /\$15,016/.test(summit),
  'Ramsey house: finished area, the 2026 tax');
const church = await open('1100 GRAND AVE');
check(/Saint Paul · Church/.test(church) && /PROPERTY TAX \| None/i.test(church), 'a church: no tax');
const exempt = await open('4230 XERXES AVE S');
check(/Tax-exempt property/.test(exempt), 'exempt flag wins over “Commercial”');
const gr = await open('803 N POKEGAMA AVE');
check(/803 N Pokegama Ave \|/.test(gr) && /Grand Rapids · Single-family home/.test(gr) && /\$317,900/.test(gr), 'Itasca: “Grand Rapids City” is Grand Rapids; class 201 is a home');
const cabin = await open('26607 COUNTY ROAD 1');
check(/26607 County Road 1 \|/.test(cabin) && /Carpenter Township · Cabin or seasonal home/.test(cabin), 'Itasca cabin (151) on a county road, in a township');
const parts = await page.evaluate(() => [['4332 XERXES AVE S'], ['3005 W 43RD ST'], ['26607 COUNTY ROAD 1'], ['1060 GRAND AVE UNIT 208'], ['803 N POKEGAMA AVE']]
  .map(([a]) => window.__hp.REGIONS.MN.addrWhere(a, (k) => ({ A_NUM: 'anumber', S_NAME: 'st_name' })[k])));
check(parts[0] === "(anumber=4332 AND UPPER(st_name) LIKE 'XERXES%')" && /anumber=3005 AND UPPER\(st_name\) LIKE '43RD%'/.test(parts[1]) && /LIKE '1%'/.test(parts[2])
  && /anumber=1060 AND UPPER\(st_name\) LIKE 'GRAND%'/.test(parts[3]) && /LIKE 'POKEGAMA%'/.test(parts[4]), 'an address asked as its number and street name: ' + parts.join(' ; '));

const pq = await page.evaluate(() => ['Duluth, MN', '100 Main St, Rochester, Minnesota'].map((t) => window.__hp.parseQuery(t)));
check(pq[0].state === 'MN' && pq[1].state === 'MN', 'Minnesota typed as MN or in full');
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Summit Hill/.test(e.textContent))), 'Summit Hill sample spot');
await page.evaluate(() => { document.querySelector('#q').value = '4332 Xerxes Ave S, Minneapolis, MN'; document.querySelector('#search').requestSubmit(); }); await sleep(1500);
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /anumber=4332/.test(w) && /UPPER\(ctu_name\) LIKE 'MINNEAPOLIS%' OR UPPER\(postcomm\) LIKE 'MINNEAPOLIS%'/.test(w)), 'search asks by number and street name, in either town field');
const found = await page.evaluate(() => document.body.innerText);
check(/4332 Xerxes Ave S/i.test(found), 'the address is found');

// A county that doesn't share its records
empty = true;
await page.evaluate(() => window.__hp.centerMap(46.5, -93.8, true)); await sleep(1500);
const help = await page.$eval('#mapHelpTxt', (el) => el.textContent);
check(/don’t share their property records/.test(help), 'no lots in a county that doesn’t share: says why: ' + help);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
