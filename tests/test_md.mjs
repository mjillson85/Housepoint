// Maryland: region outline (DC inside it, checked first; the Potomac's Virginia and West Virginia shore), the state's parcel
// boundaries (faked with the layer's real field names and real records' shapes), right-of-way left out, condo units added from
// the property data points inside a condo's outline, SDAT's land use and building type, Baltimore's neighborhood post offices,
// a town's rate on top of the county's, search (Baltimore by the city's code).
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8782);
const ORIGIN = 'http://localhost:8782';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLYS = 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0';
const POINTS = 'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0';
const FIELDS = ['OBJECTID', 'JURSCODE', 'ACCTID', 'CT2020', 'BG2020', 'GEOGCODE', 'OOI', 'RESITYP', 'ADDRESS', 'STRTNUM', 'STRTDIR', 'STRTNAM', 'STRTTYP', 'STRTSFX', 'STRTUNT',
  'ADDRTYP', 'CITY', 'ZIPCODE', 'OWNNAME1', 'OWNNAME2', 'OWNADD1', 'OWNADD2', 'OWNCITY', 'OWNSTATE', 'OWNERZIP', 'OWNZIP2', 'PREMSNUM', 'PREMSDIR', 'PREMSNAM', 'PREMSTYP',
  'PREMCITY', 'PREMZIP', 'PREMZIP2', 'LEGAL1', 'LEGAL2', 'LEGAL3', 'DR1LIBER', 'DR1FOLIO', 'TOWNCODE', 'DESCTOWN', 'SUBDIVSN', 'ZONING', 'CIUSE', 'DESCCIUSE', 'EXCLASS',
  'DESCEXCL', 'LU', 'DESCLU', 'ACRES', 'LANDAREA', 'LUOM', 'YEARBLT', 'SQFTSTRC', 'STRUGRAD', 'DESCGRAD', 'STRUCNST', 'DESCCNST', 'STRUSTYL', 'DESCSTYL', 'STRUBLDG',
  'DESCBLDG', 'LASTASSD', 'CONVEY1', 'TRADATE', 'CONSIDR1', 'NFMLNDVL', 'NFMIMPVL', 'NFMTTLVL', 'HOMQLCOD', 'BLDG_STORY', 'BLDG_UNITS', 'PTYPE', 'SDATWEBADR'];
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const lat0 = 38.9784, lon0 = -76.4922;
const ring = (x0, y0, x1, y1, b) => { const kx = Math.cos(b[1] * Math.PI / 180) * 111320, ky = 110540;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [b[0] + x / kx, b[1] + y / ky]); };
const pt = (x, y, b) => ({ x: b[0] + x / (Math.cos(b[1] * Math.PI / 180) * 111320), y: b[1] + y / 110540 });
const secret = { OWNNAME1: 'SECRET OWNER', OWNADD1: 'SECRET MAIL', LEGAL1: 'SECRET LEGAL' };
const ANNE = { JURSCODE: 'ANNE', CITY: 'ANNAPOLIS', ZIPCODE: '21401', DESCTOWN: 'ANNE Annapolis', TOWNCODE: '01', ...secret };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const asked = { where: [], outFields: [], lotWhere: [], points: 0 };
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (u.startsWith(ORIGIN)) return req.continue();
  const q = new URLSearchParams(req.method() === 'POST' ? req.postData() || '' : (u.split('?')[1] || ''));
  if (u.startsWith(POLYS + '?f=json') || u.startsWith(POINTS + '?f=json')) return json({ objectIdField: 'OBJECTID', maxRecordCount: 1000, fields: FIELDS.map((name) => ({ name })) });
  if (u.startsWith(POINTS + '/query')) {
    asked.points++; asked.outFields.push(q.get('outFields'));
    const env = q.get('geometry').split(',').map(Number), b = [lon0, lat0];
    // three condo units inside the condo outline (one a parking space), and one that has its own outline already
    const units = [[1, 'APT 101', 389000, 'DWEL Condo Garden', 'U'], [2, 'APT 102', 412000, 'DWEL Condo Garden', 'U'], [3, 'PKG 7', 18000, 'DWEL Parking Space', 'U']]
      .map(([i, unit, v, bldg, lu]) => ({ geometry: pt(0, 80, b), attributes: { ...ANNE, OBJECTID: 900 + i, ACCTID: `020600090${i}`, ADDRESS: '110 PRINCE GEORGE ST', STRTUNT: unit, LU: lu,
        DESCLU: 'Residential Condominium', DESCBLDG: bldg, YEARBLT: '1984', SQFTSTRC: unit.startsWith('PKG') ? 0 : 940, NFMLNDVL: Math.round(v * 0.25), NFMIMPVL: Math.round(v * 0.75), NFMTTLVL: v,
        TRADATE: i === 2 ? '20230615' : '', CONSIDR1: i === 2 ? 405000 : 0, CONVEY1: i === 2 ? '1' : '', OOI: 'H' } }));
    const inside = (p) => p.x >= env[0] && p.x <= env[2] && p.y >= env[1] && p.y <= env[3];
    return json({ features: [...units, { geometry: pt(30, 0, b), attributes: { ...ANNE, ACCTID: '0206000111', ADDRESS: '57 MARYLAND AVE' } }].filter((f) => inside(f.geometry)) });
  }
  if (u.startsWith(POLYS + '/query')) {
    asked.outFields.push(q.get('outFields'));
    if (q.get('where') && !q.get('geometry')) {
      asked.where.push(q.get('where'));
      const hit = /UPPER\(ADDRESS\) LIKE '57 MARYLAND AVE%'/.test(q.get('where')) || /UPPER\(ADDRESS\) LIKE '1200 LIGHT ST%'.*JURSCODE='BACI'/.test(q.get('where'));
      return json({ features: hit ? [{ geometry: { rings: [ring(15, -12, 40, 12, [lon0, lat0])] }, attributes: { ...ANNE, OBJECTID: 1, ACCTID: '0206000111', ADDRESS: '57 MARYLAND AVE' } }] : [] });
    }
    asked.lotWhere.push(q.get('where'));
    const b = q.get('geometry').split(',').map(Number);
    const feats = [];
    // a downtown Annapolis house: in town, so the town's rate and the county's rate inside it
    feats.push({ geometry: { rings: [ring(15, -12, 40, 12, b)] }, attributes: { ...ANNE, OBJECTID: 1, ACCTID: '0206000111', ADDRESS: '57 MARYLAND AVE', LU: 'R', DESCLU: 'Residential',
      DESCBLDG: 'DWEL Standard Unit', DESCSTYL: 'STRY 2 Story With Basement', YEARBLT: '1890', SQFTSTRC: 2240, NFMLNDVL: 410000, NFMIMPVL: 520000, NFMTTLVL: 930000, TRADATE: '20190830',
      CONSIDR1: 845000, CONVEY1: '1', OOI: 'H', SDATWEBADR: 'https://sdat.dat.maryland.gov/RealProperty/Pages/viewdetails.aspx?County=03&SearchType=ACCT&District=06&AccountNumber=000111',
      RESITYP: 'SF', PTYPE: '2' } });
    // a town house, handed down (not an arm's-length sale)
    feats.push({ geometry: { rings: [ring(-45, -15, -15, 15, b)] }, attributes: { ...ANNE, OBJECTID: 2, ACCTID: '0206000222', ADDRESS: '12 FLEET ST', LU: 'TH', DESCLU: 'Town House',
      DESCBLDG: 'DWEL End Unit', YEARBLT: '1910', SQFTSTRC: 1400, NFMLNDVL: 300000, NFMIMPVL: 330000, NFMTTLVL: 630000, TRADATE: '20210110', CONVEY1: '4', CONSIDR1: 0 } });
    // a condo's outline: no records of its own, the units are points
    feats.push({ geometry: { rings: [ring(-20, 60, 20, 100, b)] }, attributes: { OBJECTID: 3, ACCTID: 'C000599', JURSCODE: 'ANNE' } });
    // a church (exempt), a store
    feats.push({ geometry: { rings: [ring(50, 40, 90, 80, b)] }, attributes: { ...ANNE, OBJECTID: 4, ACCTID: '0206000444', ADDRESS: '61 CHURCH CIR', LU: 'E', DESCLU: 'Exempt',
      DESCEXCL: 'PVT Churches, Synagogues, & Parsonages', EXCLASS: '400', NFMTTLVL: 3100000, NFMIMPVL: 1900000, YEARBLT: '1858' } });
    feats.push({ geometry: { rings: [ring(50, -60, 80, -30, b)] }, attributes: { ...ANNE, OBJECTID: 5, ACCTID: '0206000555', ADDRESS: '184 MAIN ST', LU: 'C', DESCLU: 'Commercial',
      DESCBLDG: 'STORE Retail Store', YEARBLT: '1900', SQFTSTRC: 3100, NFMLNDVL: 600000, NFMIMPVL: 700000, NFMTTLVL: 1300000 } });
    // outside town, in the county: Baltimore City records with a neighborhood post office
    feats.push({ geometry: { rings: [ring(-90, -60, -60, -30, b)] }, attributes: { OBJECTID: 6, JURSCODE: 'BACI', ACCTID: '0323050965 037', ADDRESS: '1200 LIGHT ST', CITY: 'MORRELL PARK',
      DESCTOWN: '', LU: 'R', DESCBLDG: 'DWEL Center Unit', YEARBLT: '1920', SQFTSTRC: 1500, NFMTTLVL: 420000, NFMLNDVL: 120000, NFMIMPVL: 300000 } });
    return json({ features: feats });
  }
  return req.abort();
});
await page.setGeolocation({ latitude: lat0, longitude: lon0, accuracy: 5 });
await page.goto(ORIGIN + '/');

const rg = await page.evaluate(() => {
  const f = (la, lo) => { const r = window.__hp.regionFor(la, lo); return r ? r.id : null; };
  return { annapolis: f(38.9784, -76.4922), baltimore: f(39.2904, -76.6122), bethesda: f(38.9847, -77.0947), silverSpring: f(38.9907, -77.0261), oceanCity: f(38.3365, -75.0849),
    cumberland: f(39.6528, -78.7625), hagerstown: f(39.6418, -77.72), oakland: f(39.4079, -79.4067), elkton: f(39.6068, -75.8333), salisbury: f(38.3607, -75.5994),
    stMarys: f(38.1868, -76.4311), sharpsburg: f(39.4576, -77.7489), brunswick: f(39.3143, -77.6278), crisfield: f(37.9835, -75.8538), dc: f(38.8977, -77.0365),
    harpersFerry: f(39.3254, -77.7389), shepherdstown: f(39.4318, -77.8047), leesburg: f(39.1157, -77.5636), arlington: f(38.88, -77.1), wilmington: f(39.7391, -75.5398),
    newark: f(39.6837, -75.7497), york: f(39.9626, -76.7277), chincoteague: f(37.9332, -75.3788), martinsburg: f(39.4562, -77.9639) };
});
console.log('regions:', JSON.stringify(rg));
check(['annapolis', 'baltimore', 'bethesda', 'silverSpring', 'oceanCity', 'cumberland', 'hagerstown', 'oakland', 'elkton', 'salisbury', 'stMarys', 'sharpsburg', 'brunswick', 'crisfield']
  .every((k) => rg[k] === 'MD'), 'Maryland places land in Maryland');
check(rg.dc === 'DC', 'DC stays DC');
check(['harpersFerry', 'shepherdstown', 'leesburg', 'arlington', 'wilmington', 'newark', 'york', 'chincoteague', 'martinsburg'].every((k) => rg[k] === null),
  'Virginia, West Virginia, Delaware and Pennsylvania stay out');
const decl = await page.evaluate(() => [[39.29, -76.61], [39.41, -79.41], [38.34, -75.08]].map(([a, o]) => +window.__hp.regionFor(a, o).declination(a, o).toFixed(1)));
check(Math.abs(decl[0] + 11.0) < 0.4 && Math.abs(decl[1] + 9.5) < 0.4 && Math.abs(decl[2] + 11.6) < 0.4, 'compass declination: Baltimore, Oakland, Ocean City ' + decl.join(', '));

const kinds = await page.evaluate(() => {
  const k = (lu, extra = {}) => window.__hp.useKind({ USE_CODE: lu, TOTAL_VAL: 500000, BLDG_VAL: 300000, SITE_ADDR: '12 MAIN ST', ...extra }, 'MD');
  return { house: k('R', { BLDG_DESC: 'DWEL Standard Unit' }), lot: k('R', { BLDG_VAL: 0 }), th: k('TH', { BLDG_DESC: 'DWEL Center Unit' }), condo: k('U', { BLDG_DESC: 'DWEL Condo Garden' }),
    slip: k('U', { BLDG_DESC: 'DWEL Boat Slip' }), parking: k('U', { BLDG_DESC: 'DWEL Parking Space' }), mobile: k('R', { BLDG_DESC: 'DWEL Mobile Home' }),
    multi: k('R', { BLDG_DESC: 'HOUSING Multiple Residence' }), apts: k('M'), office: k('C', { BLDG_DESC: 'OFFICE Office Building' }), mixed: k('C', { BLDG_DESC: 'HOUSING Mixed Residential / Retail' }),
    officeCondo: k('CC', { BLDG_DESC: 'OFFICE Office Condominium', SITE_ADDR: '7508 WISCONSIN AVE UNIT 1' }), aptCondo: k('CC', { BLDG_DESC: 'HOUSING Apartment' }), plant: k('I'),
    farm: k('A'), marsh: k('MA'), exempt: k('E'), exComm: k('EC', { EXEMPT_CLASS: 'STA Office Buildings' }), church: k('EC', { EXEMPT_CLASS: 'PVT Churches, Synagogues, & Parsonages' }),
    cr: k('CR'), condoOutline: k(null, { CONDO_OUTLINE: true, TOTAL_VAL: null }), none: k(null, { TOTAL_VAL: 0, BLDG_VAL: 0 }) };
});
const want = { house: 'single', lot: 'vacant', th: 'single', condo: 'resCondo', slip: 'accessory', parking: 'accessory', mobile: 'mobile', multi: 'multi', apts: 'apartments',
  office: 'commercial', mixed: 'mixed', officeCondo: 'comCondo', aptCondo: 'apartments', plant: 'industrial', farm: 'farmForest', marsh: 'farmForest', exempt: 'exempt',
  exComm: 'exempt', church: 'institutional', cr: 'mixed', condoOutline: 'condoMaster', none: 'other' };
const wrong = Object.entries(want).filter(([k, v]) => kinds[k] !== v).map(([k, v]) => `${k}: ${kinds[k]} (want ${v})`);
check(!wrong.length, 'land use and building type read as the right kind' + (wrong.length ? ': ' + wrong.join(', ') : ''));

await page.click('#goPoint'); await sleep(1500);
await page.evaluate(() => window.__hp.setHeading(90)); await sleep(500);
await page.click('#shutter'); await sleep(900);
const card = await page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | '));
console.log('card:', card.slice(0, 1400));
check(/57 Maryland Ave \|/.test(card) && /Annapolis · Single-family home/.test(card) && /MARYLAND/i.test(card), 'address, town and use');
check(/STATE ASSESSED VALUE/i.test(card) && /\$930,000/.test(card) && /Built 1890/.test(card) && /2,240 ft²/.test(card), 'assessed value, year built and size');
check(/Last sold \$845,000 · Aug 2019/.test(card), 'last sale');
check(/ROUGH PROPERTY TAX ESTIMATE/i.test(card) && /≈ \$13,270 per year/.test(card) && /Annapolis’s rate \(\$0\.738\), Anne Arundel County’s rate inside it \(\$0\.577\) and the state’s \(\$0\.112\)/.test(card)
  && /Homestead Tax Credit/.test(card), 'tax from the town’s, the county’s (inside the town) and the state’s rates');
const link = await page.$eval('#cardBody a.rec-link', (a) => [a.href, a.textContent]).catch(() => ['', '']);
check(/sdat\.dat\.maryland\.gov/.test(link[0]) && /State assessment record/.test(link[1]), 'a link to the state’s record');
check(!/SECRET/.test(card) && asked.outFields.every((f) => !/OWN(NAME|ADD|CITY|STATE|ERZIP|ZIP2)|LEGAL|DR1LIBER/.test(f || '')), 'owner, mailing and legal fields are never asked for');
check(asked.lotWhere.every((w) => /ACCTID NOT IN \('ROW','WATER'/.test(w || '')), 'right-of-way and water outlines aren’t asked for');

const open = async (k) => { await page.evaluate((key) => { const S = window.__hp.S; const L = S.local.find((l) => l.p.records.some((r) => String(r.SITE_ADDR || '').startsWith(key)));
  window.__hp.openSheet([{ L, dist: 20, cdist: 30, bearing: 0 }], 0); }, k);
  return page.$eval('#cardBody', (el) => el.innerText.replace(/\n+/g, ' | ')); };
const th = await open('12 FLEET ST');
check(/Annapolis · Townhouse/.test(th) && /Changed hands Jan 2021 \(not a market sale\)|No recorded sale/.test(th), 'a town house; a sale that wasn’t at arm’s length: ' + th.slice(0, 300));
const condo = await open('110 PRINCE GEORGE ST');
const units = await page.$$eval('#cardBody .units .unit', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')));
console.log('condo:', condo.slice(0, 700), '|', units.join(' / '));
check(/110 Prince George St \|/.test(condo) && /Annapolis · Condo building/.test(condo) && /Annapolis’s rate/.test(condo) && /2 units/i.test(condo) && units.some((u) => /Unit 101/.test(u)) && units.some((u) => /Unit 102/.test(u)),
  'the condo outline gets its units from the points inside it');
check(units.some((u) => /Unit PKG/i.test(u) && /Parking/i.test(u)) && asked.points >= 1, 'the parking space is listed, not counted as a unit');
const church = await open('61 CHURCH CIR');
check(/Annapolis · Church/.test(church) && /PROPERTY TAX \| None/i.test(church), 'a church: no tax');
const store = await open('184 MAIN ST');
check(/Annapolis · Retail Store/.test(store), 'a store, by its building type');
const balt = await open('1200 LIGHT ST');
check(/Baltimore · /.test(balt) && /Baltimore City’s rate \(\$2\.248\)/.test(balt) && !/Morrell/i.test(balt), 'Baltimore City: the city, not the neighborhood post office; the city’s rate');

const norm = await page.evaluate(() => {
  const n = (a) => window.__hp.normalizeRecord(a, 'MD');
  const oc = n({ JURSCODE: 'WORC', DESCTOWN: 'WORC Ocean City', ADDRESS: '2815 TERN DR', STRTUNT: '117', LU: 'U', DESCSTYL: 'HOUSING Condominium (residential)' });
  const fr = n({ JURSCODE: 'FRED', DESCTOWN: 'FRED Frederick City', ADDRESS: '7 E PATRICK ST', STRTUNT: '7-9', LU: 'C' });
  const th = n({ JURSCODE: 'BACI', ADDRESS: '223 LANASA LN', LU: 'R', DESCSTYL: 'STRY Townhouse-Center Unit 3 Story With Basem', CITY: 'MORRELL PARK' });
  const cg = n({ JURSCODE: 'WORC', ACCTID: 'CONDO', __COMMON_GROUNDS: true });
  return { oc: [oc.CITY, oc.SITE_ADDR, oc.STYLE], fr: [fr.CITY, fr.SITE_ADDR], th: [th.CITY, th.STYLE], cg: [window.__hp.useKind(cg, 'MD'), window.__hp.REGIONS.MD.useLabel(null, cg)] };
});
check(norm.oc.join('|') === 'Ocean City|2815 TERN DR UNIT 117|' && norm.fr.join('|') === 'Frederick|7-9 E PATRICK ST' && norm.th.join('|') === 'Baltimore|3 Story with basement'
  && norm.cg.join('|') === 'other|Condo common grounds', 'Ocean City keeps its name, Frederick City is Frederick, a number range isn’t a unit, styles tidied, common grounds: ' + JSON.stringify(norm));
const pq = await page.evaluate(() => ['Annapolis, MD', '100 Main St, Frederick, Maryland'].map((t) => window.__hp.parseQuery(t)));
check(pq[0].state === 'MD' && pq[1].state === 'MD', 'Maryland typed as MD or in full');
await page.evaluate(() => window.__hp.startMapMode(null, 'x')); await sleep(300);
check(await page.$$eval('#samples button', (els) => els.some((e) => /Annapolis/.test(e.textContent))), 'Annapolis sample spot');
for (const q of ['57 Maryland Ave, Annapolis, MD', '1200 Light St, Baltimore, MD']) {
  await page.evaluate((t) => { document.querySelector('#q').value = t; document.querySelector('#search').requestSubmit(); }, q); await sleep(1500);
}
console.log('search where:', asked.where.join(' || '));
check(asked.where.some((w) => /UPPER\(ADDRESS\) LIKE '57 MARYLAND AVE%'/.test(w) && /UPPER\(CITY\) LIKE 'ANNAPOLIS%' OR UPPER\(DESCTOWN\) LIKE '% ANNAPOLIS%'/.test(w)), 'search in a town asks both town fields');
check(asked.where.some((w) => /UPPER\(ADDRESS\) LIKE '1200 LIGHT ST%'/.test(w) && /JURSCODE='BACI'/.test(w)), 'search in Baltimore asks for the city’s records');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
