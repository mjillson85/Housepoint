// Tier 2 states: Vermont, Montana, Arkansas, Cook County (Illinois), Colorado, Wyoming, Utah and Alaska. Region outlines, each
// layer faked with its real field names (owner, mailing and legal fields included, so the test sees they're never asked for),
// property types, values and the card at a lot in each; Vermont's and Alaska's nearest address from the map; Utah's county layers.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8784);
const ORIGIN = 'http://localhost:8784';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const UT = (c) => `https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/Parcels_${c}_LIR/FeatureServer/0`;
const UT_FIELDS = ['OBJECTID', 'COUNTY_NAME', 'COUNTY_ID', 'ASSESSOR_SRC', 'PARCEL_ID', 'SERIAL_NUM', 'PARCEL_ADD', 'PARCEL_CITY', 'TAXEXEMPT_TYPE', 'TAX_DISTRICT',
  'TOTAL_MKT_VALUE', 'LAND_MKT_VALUE', 'PARCEL_ACRES', 'PROP_CLASS', 'PRIMARY_RES', 'HOUSE_CNT', 'SUBDIV_NAME', 'BLDG_SQFT', 'FLOORS_CNT', 'BUILT_YR', 'EFFBUILT_YR', 'CONST_MATERIAL'];

// Each layer: its real fields, a spot, and the lots around it (offsets in meters from the spot)
const STATES = {
  VT: { url: 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0',
    fields: ['OBJECTID', 'SPAN', 'GLIST_SPAN', 'PARCID', 'PROPTYPE', 'YEAR', 'GLYEAR', 'TOWN', 'TNAME', 'OWNER1', 'OWNER2', 'ADDRGL1', 'ADDRGL2', 'CITYGL', 'STGL', 'ZIPGL',
      'DESCPROP', 'LOCAPROP', 'CAT', 'RESCODE', 'ACRESGL', 'REAL_FLV', 'HSTED_FLV', 'NRES_FLV', 'LAND_LV', 'IMPRV_LV', 'HSDECL', 'E911ADDR'],
    spot: [44.4800, -73.2100],
    lots: [[[15, -12, 40, 12], { SPAN: '114-035-15522', TOWN: 'BURLINGTON', GLYEAR: 2025, CAT: 'R1', DESCPROP: '1-FAMILY WITH 3 BEDROOMS', REAL_FLV: 524000, LAND_LV: 210000, IMPRV_LV: 314000, HSDECL: 'Y', PROPTYPE: 'PARCEL' }],
      [[-45, -15, -15, 15], { SPAN: '114-035-15530', TOWN: 'BURLINGTON', GLYEAR: 2025, CAT: 'C', DESCPROP: '0.43 AC & OFFICE BLDG', E911ADDR: '407 PINE ST', REAL_FLV: 1166800, LAND_LV: 400000, IMPRV_LV: 766800, PROPTYPE: 'PARCEL' }]],
    owner: { OWNER1: 'SECRET OWNER', ADDRGL1: 'SECRET MAILING', CITYGL: 'SECRET CITY' },
    card: [/\| 26 Hillcrest Road \|/, /Burlington · Single-family home/, /TOWN LISTED VALUE · 2025 GRAND LIST \| \$524,000/, /nearest one on OpenStreetMap/] },
  MT: { url: 'https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v1/MapServer/1',
    fields: ['OBJECTID', 'PARCELID', 'COUNTYCD', 'CountyName', 'CountyAbbr', 'TaxYear', 'PropertyID', 'LegalDescriptionShort', 'Subdivision', 'AddressLine1', 'AddressLine2', 'CityStateZip',
      'PropType', 'ContinuousCropAcres', 'FallowAcres', 'ForestAcres', 'GrazingAcres', 'WildHayAcres', 'IrrigatedAcres', 'TotalAcres', 'TotalBuildingValue', 'TotalLandValue', 'TotalValue',
      'OwnerName', 'OwnerAddress1', 'OwnerCity', 'OwnerState', 'OwnerZipCode', 'CareOfTaxpayer'],
    spot: [46.8650, -113.9950],
    lots: [[[15, -12, 40, 12], { PARCELID: '04220022308050000', CountyName: 'Missoula', TaxYear: 2026, AddressLine1: '238 S 6TH ST E ', CityStateZip: 'MISSOULA, MT 59801', PropType: 'Townhouse',
      TotalValue: 512000, TotalLandValue: 160000, TotalBuildingValue: 352000 }],
      [[-45, -15, -15, 15], { PARCELID: '04220022308110000', CountyName: 'Missoula', TaxYear: 2026, AddressLine1: '724 GERALD AVE ', CityStateZip: 'MISSOULA, MT 59801', PropType: 'Improved Property',
      TotalValue: 640000, TotalLandValue: 200000, TotalBuildingValue: 440000 }],
      [[60, -15, 90, 15], { PARCELID: '04220022308990000', CountyName: 'Missoula', TaxYear: 2026, AddressLine1: '9000 RANCH RD', CityStateZip: 'MISSOULA, MT 59801', PropType: 'Improved Property',
      GrazingAcres: 300, TotalValue: 900000, TotalLandValue: 400000, TotalBuildingValue: 500000 }]],
    owner: { OwnerName: 'SECRET OWNER', OwnerAddress1: 'SECRET MAILING', CareOfTaxpayer: 'SECRET CARE OF', LegalDescriptionShort: 'SECRET LEGAL' },
    card: [/238 S 6th St E \|/, /Missoula · Townhouse/, /STATE MARKET VALUE · 2026 TAX YEAR \| \$512,000/] },
  AR: { url: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6',
    fields: ['objectid', 'countyfips', 'countyid', 'parcelid', 'parcellgl', 'ownername', 'adrnum', 'predir', 'pstrnam', 'pstrtype', 'psufdir', 'adrcity', 'adrzip5', 'adrlabel', 'parceltype',
      'assessvalue', 'impvalue', 'landvalue', 'totalvalue', 'subdivision', 'county'],
    spot: [34.7600, -92.3100],
    lots: [[[15, -12, 40, 12], { parcelid: '33L-068.01-004.00', adrnum: 3210, pstrnam: 'EDGERSTOUNE', pstrtype: 'LN', adrcity: 'LITTLE ROCK', adrzip5: 72205, adrlabel: '3210  EDGERSTOUNE LN',
      parceltype: 'RI', assessvalue: 119838, impvalue: 473640, landvalue: 125550, totalvalue: 599190, county: 'Pulaski' }],
      [[-45, -15, -15, 15], { parcelid: '33L-055.00-012.00', adrnum: 25, pstrnam: 'OAKWOOD', pstrtype: 'RD', adrcity: 'LITTLE ROCK', adrzip5: 72202, adrlabel: '25  OAKWOOD RD',
      parceltype: 'CI', assessvalue: 902800, impvalue: 3709595, landvalue: 804405, totalvalue: 4514000, county: 'Pulaski' }]],
    owner: { ownername: 'SECRET OWNER', parcellgl: 'SECRET LEGAL' },
    card: [/3210 Edgerstoune Ln \|/, /Little Rock · Residential/, /COUNTY APPRAISED VALUE \| \$599,190/] },
  IL: { url: 'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmc/MapServer/44',
    fields: ['Pin10', 'TaxCode', 'BLDGClass', 'BldgConst', 'BldgSqft', 'BldgAge', 'LandValue', 'NBHD', 'Town', 'HouseNo', 'Dir', 'Street', 'Suffix', 'Address', 'City', 'Zip_Code', 'PIN14',
      'BldgValue', 'LandSqft', 'TotalValue', 'TAXYR', 'value_description', 'SUMMED', 'RECORD_COUNT', 'SV_URL'],
    spot: [41.8850, -87.7850],
    lots: [[[15, -12, 40, 12], { PIN14: '16074110020000', BLDGClass: '205', BldgConst: 'Stucco', BldgSqft: 2077, BldgAge: 117, LandValue: '12250', BldgValue: '41750', TotalValue: '54000',
      Address: '204 S ELMWOOD AVE', City: 'OAK PARK', Zip_Code: '60302', TAXYR: 2025, RECORD_COUNT: 1, SUMMED: '0' }],
      [[-45, -15, -15, 15], { PIN14: '16074110100000', BLDGClass: '299', LandValue: '30000', BldgValue: '270000', TotalValue: '300000', Address: '200 S OAK PARK AVE', City: 'OAK PARK',
      Zip_Code: '60302', TAXYR: 2025, RECORD_COUNT: 24, SUMMED: '1' }]],
    owner: {},
    card: [/204 S Elmwood Ave \|/, /Oak Park · Two-story house/, /Built 1908/, /\$540,000/, /Cook County Assessor’s page/] },
  CO: { url: 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0',
    fields: ['OBJECTID', 'sharing', 'countyName', 'countyFips', 'parcel_id', 'account', 'situsAdd', 'sitAddCty', 'sitAddZip', 'owner', 'owner2', 'ownerAdd', 'ownAddCty', 'ownAddStt',
      'ownAddZip', 'legalDesc', 'landSqft', 'subName', 'landUseCde', 'landUseDsc', 'saleDate', 'salePrice', 'apprValTot', 'asedValTot', 'URL'],
    spot: [39.7000, -104.9700],
    lots: [[[15, -12, 40, 12], { parcel_id: '0523209011000', countyName: 'Denver', situsAdd: '1060 S GAYLORD ST', sitAddCty: 'DENVER', sitAddZip: '80209-4610', landUseDsc: 'SFR Grade B',
      saleDate: '6/27/2019', salePrice: '1245000', apprValTot: '1438500', asedValTot: '96400', URL: 'https://www.denvergov.org/property/realproperty/summary/0523209011000' }],
      [[-45, -15, -15, 15], { parcel_id: '0523209012000', countyName: 'Denver', situsAdd: '1070 S GAYLORD ST', sitAddCty: 'DENVER', landUseDsc: 'RESIDENTIAL-ROWHOUSE',
      saleDate: '12:00:00 AM', salePrice: '0', apprValTot: '845000' }]],
    owner: { owner: 'SECRET OWNER', ownerAdd: 'SECRET MAILING', legalDesc: 'SECRET LEGAL' },
    card: [/1060 S Gaylord St \|/, /Denver · Single-family home/, /COUNTY ACTUAL VALUE \| \$1,438,500/, /Last sold \$1,245,000 · Jun 2019/] },
  WY: { url: 'https://services3.arcgis.com/r0iJ85SKZ4zAzz3P/arcgis/rest/services/Wyoming_Parcels_for_2026/FeatureServer/0',
    fields: ['FID', 'ID', 'taxyear', 'parcelnb', 'accountno', 'jurisdicti', 'ownername1', 'ownername2', 'mailaddres', 'mailcity', 'mailstate', 'mailzipcod', 'locationad', 'legal',
      'actualvalu', 'assessedva', 'landgrossa', 'landgrosss', 'DEFAULTTAX'],
    spot: [41.1400, -104.8100],
    lots: [[[15, -12, 40, 12], { parcelnb: '14663113200900', taxyear: '2026', jurisdicti: 'LARAMIE', locationad: '606 E 21ST ST', actualvalu: 265898, assessedva: 25261 }]],
    owner: { ownername1: 'SECRET OWNER', mailaddres: 'SECRET MAILING', legal: 'SECRET LEGAL' },
    card: [/606 E 21st St \|/, /Laramie County · Use not listed/, /COUNTY ACTUAL VALUE · 2026 TAX YEAR \| \$265,898/, /don’t say what kind of property/] },
  UT: { url: UT('SaltLake'), fields: UT_FIELDS, spot: [40.7500, -111.8700],
    lots: [[[15, -12, 40, 12], { PARCEL_ID: '16081530430000', COUNTY_NAME: 'Salt Lake', PARCEL_ADD: '745 E 900 S', PARCEL_CITY: 'Salt Lake City', TOTAL_MKT_VALUE: 897400, LAND_MKT_VALUE: 171700,
      PROP_CLASS: 'Residential', PRIMARY_RES: 'Y', HOUSE_CNT: '1', BLDG_SQFT: 1708, FLOORS_CNT: 1, BUILT_YR: 1924, EFFBUILT_YR: 2005 }]],
    owner: {},
    card: [/745 E 900 S \|/, /Salt Lake City · Single-family home/, /Built 1924/, /COUNTY MARKET VALUE \| \$897,400/, /LIVING AREA \| 1,708 ft²/i] },
  AK: { url: 'https://services1.arcgis.com/7HDiw78fcUiM2BWn/arcgis/rest/services/AK_Parcels/FeatureServer/0',
    fields: ['OBJECTID', 'parcel_id', 'owner', 'alt_owner', 'property_type', 'property_use', 'land_value', 'building_value', 'total_value', 'local_gov', 'datetime_processed', 'feature_id'],
    spot: [64.8400, -147.7300],
    lots: [[[15, -12, 40, 12], { parcel_id: '40509', property_type: 'Lot', property_use: 'Residential', land_value: 14550, building_value: 229220, total_value: 243770,
      local_gov: 'Fairbanks North Star Borough' }]],
    owner: { owner: 'SECRET OWNER', alt_owner: 'SECRET OWNER 2' },
    card: [/\| 26 Hillcrest Road \|/, /Fairbanks North Star Borough · Single-family home/, /ASSESSED VALUE \| \$243,770/] },
};
// Utah County's layer (Provo): a second county layer, picked by position
const UT_PROVO = { url: UT('Utah'), spot: [40.2338, -111.6585],
  lots: [[[15, -12, 40, 12], { PARCEL_ID: '530010001', COUNTY_NAME: 'Utah', PARCEL_ADD: '450 N 500 W', PARCEL_CITY: 'Provo', TOTAL_MKT_VALUE: 455000, LAND_MKT_VALUE: 150000,
    PROP_CLASS: 'Residential', HOUSE_CNT: '2', BLDG_SQFT: 2100, BUILT_YR: 1948 }]] };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = {}, reverse = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith('https://api.geoapify.com/v1/geocode/reverse')) { reverse.push(u); const q = new URL(u).searchParams;   // the point it's asked about: inside the lot
    return json({ results: [{ housenumber: '26', street: 'Hillcrest Road', distance: 12, lat: +q.get('lat'), lon: +q.get('lon') }] }); }
  const all = [...Object.entries(STATES).map(([st, c]) => [st, c]), ['UT', UT_PROVO]];
  for (const [st, c] of all) {
    if (u.startsWith(c.url + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 2000, geometryType: 'esriGeometryPolygon', fields: (c.fields || UT_FIELDS).map((name) => ({ name })) });
    if (u.startsWith(c.url + '/query')) {
      const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : u.split('?')[1]);
      (asked[c.url] = asked[c.url] || []).push(q.get('outFields') || '');
      if (!q.get('geometry')) return json({ features: [] });
      const g = q.get('geometry').split(',').map(Number);
      const b = [g[0], g[1]];
      return json({ features: c.lots.map(([box, a], i) => ({ geometry: { rings: [ring(...box, b)] }, attributes: { OBJECTID: i + 1, ...(STATES[st].owner || {}), ...a } })) });
    }
  }
  return req.abort();
});
await page.goto(ORIGIN + '/');
await page.click('#goMap'); await sleep(300);

// Outlines
const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { burlington: f(44.4759, -73.2121), brattleboro: f(42.8509, -72.5579), whitehall: f(43.5551, -73.4035), plattsburgh: f(44.6995, -73.4529), williamstown: f(42.712, -73.2037),
    hanover: f(43.7022, -72.2896), billings: f(45.7833, -108.5007), gardiner: f(45.0316, -110.7058), sheridan: f(44.7972, -106.9562), jackson: f(43.4799, -110.7624),
    pineBluffs: f(41.1822, -104.0691), kimball: f(41.2358, -103.6631), julesburg: f(40.9883, -102.2643), denver: f(39.7392, -104.9903), dinosaur: f(40.2436, -109.0157),
    vernal: f(40.4555, -109.5287), wendover: f(40.7369, -114.0378), westWendover: f(40.7391, -114.0733), littleRock: f(34.7465, -92.2896), texarkanaAR: f(33.4418, -94.0377),
    memphis: f(35.1495, -90.049), chicago: f(41.8781, -87.6298), naperville: f(41.7508, -88.1535), hammond: f(41.5834, -87.5), anchorage: f(61.2181, -149.9003),
    juneau: f(58.3019, -134.4197), hyder: f(55.9166, -130.0247), stewart: f(55.9401, -129.9878), whitehorse: f(60.7212, -135.0568) };
});
console.log('regions:', JSON.stringify(rg));
const wantR = { burlington: 'VT', brattleboro: 'VT', whitehall: 'NY', plattsburgh: 'NY', williamstown: 'MA', hanover: 'NH', billings: 'MT', gardiner: 'MT', sheridan: 'WY', jackson: 'WY',
  pineBluffs: 'WY', kimball: 'NE', julesburg: 'CO', denver: 'CO', dinosaur: 'CO', vernal: 'UT', wendover: 'UT', westWendover: 'NV', littleRock: 'AR', texarkanaAR: 'AR',
  memphis: 'US_TN', chicago: 'IL', naperville: 'US_IL', hammond: 'IN', anchorage: 'AK', juneau: 'AK', hyder: 'AK', stewart: null, whitehorse: null };
const badR = Object.entries(wantR).filter(([k, v]) => rg[k] !== v).map(([k, v]) => `${k}: ${rg[k]} (want ${v})`);
check(!badR.length, 'places land in the right state, along the shared state lines too' + (badR.length ? ': ' + badR.join(', ') : ''));
const decl = await page.evaluate(() => [[44.48, -73.21, 'VT'], [45.78, -108.5, 'MT'], [34.75, -92.29, 'AR'], [41.88, -87.63, 'IL'], [39.74, -104.99, 'CO'], [41.14, -104.82, 'WY'],
  [40.76, -111.89, 'UT'], [61.22, -149.9, 'AK'], [58.3, -134.42, 'AK']].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
const wantD = [-13.5, 9.9, -0.4, -4.2, 7.5, 7.5, 10.7, 14.0, 17.5];
check(decl.every((d, i) => Math.abs(d - wantD[i]) < 0.8), `compass declination near the World Magnetic Model: ${decl.join(', ')}`);

// Property types
const kinds = await page.evaluate(() => {
  const k = (rid, r) => window.__hp.useKind({ TOTAL_VAL: 300000, BLDG_VAL: 200000, ...r }, rid);
  return {
    vtHouse: k('VT', { USE_CODE: 'R1', PROP_DESC: '0.06 AC & DWL' }), vtDuplex: k('VT', { USE_CODE: 'R1', PROP_DESC: '2-FAMILY DWL' }), vtCondo: k('VT', { USE_CODE: 'O', PROP_DESC: '1860 HOUSE CONDO UNIT 1' }),
    vtCamp: k('VT', { USE_CODE: 'S1' }), vtLand: k('VT', { USE_CODE: 'R2', BLDG_VAL: 0, LAND_VAL: 300000 }), vtNoValues: k('VT', { USE_CODE: 'R1', BLDG_VAL: null, LAND_VAL: null }),
    vtTwoUnit: k('VT', { USE_CODE: 'R1', PROP_DESC: '2 UNIT DWL & .3 AC' }), vtAptBldg: k('VT', { USE_CODE: 'R1', PROP_DESC: 'APARTMENT BUILDING 8 UNIT/LAND' }), vtShop: k('VT', { USE_CODE: 'C' }), vtFarm: k('VT', { USE_CODE: 'F' }), vtMobile: k('VT', { USE_CODE: 'MHU' }),
    mtImproved: k('MT', { USE_CODE: 'Improved Property' }), mtRanch: k('MT', { USE_CODE: 'Improved Property', AG_ACRES: 300 }), mtLand: k('MT', { USE_CODE: 'Vacant Land', BLDG_VAL: 0 }),
    mtCondo: k('MT', { USE_CODE: 'Condominium' }), mtApts: k('MT', { USE_CODE: 'Apartment' }), mtExempt: k('MT', { USE_CODE: 'Exempt Property' }),
    arHouse: k('AR', { USE_CODE: 'RI' }), arLot: k('AR', { USE_CODE: 'RV' }), arFarm: k('AR', { USE_CODE: 'AI' }), arShop: k('AR', { USE_CODE: 'CI' }), arExempt: k('AR', { USE_CODE: 'EX' }), arMobile: k('AR', { USE_CODE: 'MH' }),
    ilHouse: k('IL', { USE_CODE: '205' }), ilFlat: k('IL', { USE_CODE: '211' }), ilCondoBldg: k('IL', { USE_CODE: '299', UNITS: 24 }), ilCondo: k('IL', { USE_CODE: '299' }),
    ilApts: k('IL', { USE_CODE: '315' }), ilShop: k('IL', { USE_CODE: '517' }), ilPlant: k('IL', { USE_CODE: '663' }), ilExempt: k('IL', { USE_CODE: 'EX' }), ilLand: k('IL', { USE_CODE: '100' }),
    coHouse: k('CO', { USE_DESC: 'SFR Grade C' }), coRow: k('CO', { USE_DESC: 'RESIDENTIAL-ROWHOUSE' }), coCondo: k('CO', { USE_DESC: 'RESIDENTIAL-CONDOMINIUM' }),
    coComCondo: k('CO', { USE_DESC: 'COMMERCIAL CONDO- IMP' }), coDuplex: k('CO', { USE_DESC: 'RESIDENTIAL-DUPLEX' }), coApts: k('CO', { USE_DESC: 'Multi 9 - Up' }),
    coOffice: k('CO', { USE_DESC: 'COMMERCIAL-OFFICE' }), coExempt: k('CO', { USE_DESC: 'EXEMPT-COUNTY-LAND' }), coHoa: k('CO', { USE_DESC: 'HOA LAND' }), coCode: k('CO', { USE_DESC: '70QA' }),
    coLarimer: k('CO', { USE_DESC: 'Residential' }), coMulti: k('CO', { USE_DESC: 'Multiple Unit' }), coBig: k('CO', { USE_DESC: 'MULTI-UNIT (9 AND UP)' }),
    coMixedUse: k('CO', { USE_DESC: 'MULTI-USE' }), coStorage: k('CO', { USE_DESC: 'VACANT STORAGE' }), coRowUnit: k('CO', { USE_DESC: 'SFR Grade B', SITE_ADDR: '1550 N BROADWAY UNIT 4' }),
    wy: k('WY', {}), utHouse: k('UT', { USE_CODE: 'Residential', UNITS: 1 }), utDuplex: k('UT', { USE_CODE: 'Residential', UNITS: 2 }), utCondo: k('UT', { USE_CODE: 'Commercial - Apartment & Condo', UNITS: 1 }),
    utApts: k('UT', { USE_CODE: 'Commercial - Apartment & Condo', UNITS: 28 }), utOffice: k('UT', { USE_CODE: 'Commercial - Office Space' }), utExempt: k('UT', { USE_CODE: 'Tax Exempt - Government' }),
    utGreen: k('UT', { USE_CODE: 'Greenbelt' }), utAg: k('UT', { USE_CODE: 'Agricultural' }), utMixed: k('UT', { USE_CODE: 'Mixed Use' }), utBlank: k('UT', { USE_CODE: '' }), utLand: k('UT', { USE_CODE: 'Residential', BLDG_VAL: 0 }),
    akHouse: k('AK', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'Residential 1 Family' }), akFour: k('AK', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'Fourplex' }), akCondo: k('AK', { USE_CODE: 'CONDO', USE_DESC: 'Condo (Fee simple)' }),
    akShop: k('AK', { USE_CODE: 'COMMERCIAL', USE_DESC: 'Retail single occupancy' }), akLand: k('AK', { USE_CODE: 'VACANT LAND', USE_DESC: 'Residential Vacant Land' }), akJuneau: k('AK', { USE_CODE: 'PARCEL' }),
    akAssembled: k('AK', { USE_CODE: 'Lot', USE_DESC: 'Assembled' }), akEstate: k('AK', { USE_CODE: 'RESIDENTIAL', USE_DESC: 'Estate Lot Residential' }),
    akLot: k('AK', { USE_CODE: 'Lot', USE_DESC: 'Residential', BLDG_VAL: 0 }), utUnit: k('UT', { USE_CODE: 'Residential', UNITS: 1, SITE_ADDR: '55 E CENTER UNIT 201' }) };
});
const wantK = { vtHouse: 'single', vtDuplex: 'multi', vtCondo: 'resCondo', vtCamp: 'single', vtLand: 'vacant', vtNoValues: 'single', vtTwoUnit: 'multi', vtAptBldg: 'apartments', vtShop: 'commercial', vtFarm: 'farmForest', vtMobile: 'mobile',
  mtImproved: 'unknown', mtRanch: 'farmForest', mtLand: 'vacant', mtCondo: 'resCondo', mtApts: 'apartments', mtExempt: 'exempt',
  arHouse: 'single', arLot: 'vacant', arFarm: 'farmForest', arShop: 'commercial', arExempt: 'exempt', arMobile: 'mobile',
  ilHouse: 'single', ilFlat: 'multi', ilCondoBldg: 'condoMaster', ilCondo: 'resCondo', ilApts: 'apartments', ilShop: 'commercial', ilPlant: 'industrial', ilExempt: 'exempt', ilLand: 'vacant',
  coHouse: 'single', coRow: 'single', coCondo: 'resCondo', coComCondo: 'comCondo', coDuplex: 'multi', coApts: 'apartments', coOffice: 'commercial', coExempt: 'exempt', coHoa: 'other',
  coCode: 'unknown', coLarimer: 'single', coMulti: 'multi', coBig: 'apartments', coMixedUse: 'mixed', coStorage: 'vacant', coRowUnit: 'resCondo', wy: 'unknown', utHouse: 'single', utDuplex: 'multi', utCondo: 'resCondo', utApts: 'apartments', utOffice: 'commercial',
  utExempt: 'exempt', utGreen: 'farmForest', utAg: 'farmForest', utMixed: 'mixed', utBlank: 'unknown', utLand: 'vacant', akHouse: 'single', akFour: 'multi', akCondo: 'resCondo', akShop: 'commercial', akLand: 'vacant', akJuneau: 'unknown',
  akAssembled: 'other', akEstate: 'single', akLot: 'vacant', utUnit: 'resCondo' };
const badK = Object.entries(wantK).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!badK.length, 'property types read as the right kind' + (badK.length ? ': ' + badK.join(', ') : ''));

// A card in each state
async function cardAt(lat, lon, pick) {
  return page.evaluate(async (lat, lon, pick) => {
    const hp = window.__hp, S = hp.S;
    await hp.centerMap(lat, lon);
    const L = S.local.find((l) => l.p.records.some((r) => pick.every(([k, v]) => String(r[k] ?? '') === v))) || S.local[0];
    if (!L) return { err: 'no lots', help: document.querySelector('#mapHelpTxt').textContent };
    hp.selectLot(L); await new Promise((r) => setTimeout(r, 400));
    return { card: document.querySelector('#cardBody').innerText.replace(/\n+/g, ' | '), lots: S.local.length };
  }, lat, lon, pick);
}
const PICK = { VT: [['PROP_ID', '114-035-15522']], MT: [['PROP_ID', '04220022308050000']], AR: [['PROP_ID', '33L-068.01-004.00']], IL: [['PROP_ID', '16074110020000']],
  CO: [['PROP_ID', '0523209011000']], WY: [['PROP_ID', '14663113200900']], UT: [['PROP_ID', '16081530430000']], AK: [['PROP_ID', '40509']] };
const cards = {};
for (const [st, c] of Object.entries(STATES)) {
  const r = await cardAt(c.spot[0], c.spot[1], PICK[st]);
  cards[st] = r.card || '';
  console.log(`${st} card:`, (r.card || JSON.stringify(r)).slice(0, 700));
  const miss = c.card.filter((re) => !re.test(r.card || ''));
  check(!miss.length, `${st}: the card shows the address, kind and value` + (miss.length ? ` (missing ${miss.join(' ')})` : ''));
  check(!/SECRET/.test(r.card || ''), `${st}: no owner, mailing or legal text on the card`);
  const outs = (asked[c.url] || []).join(',');
  const bad = Object.keys(c.owner).filter((f) => outs.split(',').includes(f));
  check(outs && !bad.length, `${st}: owner, mailing and legal fields are never asked for` + (bad.length ? `: ${bad.join(', ')}` : ''));
}
// Cook County's condo building: one lot, its units' values added up
const condo = await cardAt(STATES.IL.spot[0], STATES.IL.spot[1], [['PROP_ID', '16074110100000']]);
check(/Oak Park · Condominium/.test(condo.card) && /CONDO BUILDING/i.test(condo.card) && /24 units/.test(condo.card) && /added up/.test(condo.card), 'Cook County condo building: units and the note: ' + condo.card.slice(0, 300));
// Montana: "Improved Property" says what it can; a ranch says ranch
const mtImp = await cardAt(STATES.MT.spot[0], STATES.MT.spot[1], [['PROP_ID', '04220022308110000']]);
check(/Improved property \(home or business\)/.test(mtImp.card), 'Montana: improved property without a use says so');
const mtRanch = await cardAt(STATES.MT.spot[0], STATES.MT.spot[1], [['PROP_ID', '04220022308990000']]);
check(/Farm or ranch/.test(mtRanch.card), 'Montana: a lot mostly in grazing land is a farm or ranch');
check(reverse.length >= 2 && reverse.every((u) => /lat=\d/.test(u)), 'Vermont and Alaska: the nearest address is looked up by position');
// Vermont: a record with its own 911 address doesn't need the lookup
const vtShop = await cardAt(STATES.VT.spot[0], STATES.VT.spot[1], [['PROP_ID', '114-035-15530']]);
check(/407 Pine St \|/.test(vtShop.card) && !/OpenStreetMap; the state/.test(vtShop.card), 'Vermont: a 911 address on the record is used as is');
// Utah: the county layer comes from the spot
const provo = await cardAt(UT_PROVO.spot[0], UT_PROVO.spot[1], [['PROP_ID', '530010001']]);
check(/450 N 500 W \|/.test(provo.card) && /Provo · Multi-family home/.test(provo.card), 'Utah: Provo’s lots come from Utah County’s layer: ' + provo.card.slice(0, 200));
check((asked[UT('Utah')] || []).length > 0 && (asked[UT('SaltLake')] || []).length > 0, 'Utah: each county layer asked for its own area');
check(!errors.length, 'no page errors: ' + errors.join(' | '));
await browser.close(); srv.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nAll passed');
process.exit(fails.length ? 1 : 0);
