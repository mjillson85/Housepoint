// Owner names are never asked for: every field any region can request (its field map and the fields it detects a layer by), every
// field list written into the app or the scripts, and the free text Vermont's grand list carries, checked against the one shared
// owner list (owner-fields.mjs). A region that adds OWNER1 to its fields fails here, before it can reach a phone.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { OWNERISH, KEEP_NAME, isOwnerish } from './owner-fields.mjs';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`, 'utf8');
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

// The list itself catches what it should, and lets through what it should
for (const f of ['OWNER1', 'OWN_NAME', 'Owner_Name', 'MAIL_ADDR', 'TAXPAYER', 'CARE_OF', 'CAREOF', 'LEGAL_DESC', 'LEGALDESC', 'DEED_BOOK', 'DEEDPAGE', 'GRANTOR',
  'GRANTEE', 'BOOK', 'LS_BOOK', 'LS_PAGE', 'PAGE', 'TAXPAADD1', 'TAXPACITY', 'TAXPAZIP', 'TAX_DESC', 'PROPDESC', 'PROP_DESC', 'ADDRESS1', 'PO_BOX', 'NAME', 'BUYER_NAME', 'INSTRUMENT', 'DEED_NAME'])
  check(isOwnerish(f), `the owner list catches ${f}`);
for (const f of ['SITE_ADDR', 'LS_DATE', 'LS_PRICE', 'TOTAL_VAL', 'USE_CODE', 'USE_DESC', 'LAND_USE_D', 'CITY', 'TOWN', 'MUN_NAME', 'Ownership_Type', 'ownership',
  'CityStateZip', 'OwnDate', 'DEED_DATE', 'PROP_ADDR', 'YEAR_BUILT', 'CLASS_DESC', 'WEBPAGE_URL'])
  check(!isOwnerish(f), `the owner list lets ${f} through`);

const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8788);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
page.on('request', (req) => (req.url().startsWith('http://localhost:8788') ? req.continue() : req.respond({ status: 503, body: '' })));
await page.goto('http://localhost:8788/');
await page.waitForFunction(() => window.__hp && window.__hp.REGIONS);

// 1. Every region's fields (the basic card's states made too), and the fields it finds its layer by
const regions = await page.evaluate(() => {
  const hp = window.__hp;
  for (const st of ['SC', 'PA', 'TX', 'CA']) hp.regionFor(...{ SC: [34.0, -81.03], PA: [40.44, -79.99], TX: [30.27, -97.74], CA: [34.06, -118.3] }[st]);
  return Object.values(hp.REGIONS).map((r) => ({ id: r.id, fields: Object.values(r.fields || {}).flat(), detect: r.detect || [], scrub: Object.keys(r.scrub || {}) }));
});
check(regions.length > 40, `${regions.length} regions read`);
for (const r of regions) {
  const bad = [...r.fields, ...r.detect].filter((f) => isOwnerish(f) && !r.scrub.includes(f));
  check(!bad.length, `${r.id}: no owner-like field can be asked for${bad.length ? ': ' + bad.join(', ') : ''}`);
}

// 2. Field lists written into the app and the scripts that talk to the parcel services. "*" (every field) only where no person is
// on file: the Census's place names, FEMA's flood zones, and the school layers the services probe takes apart.
const files = [['index.html', html], ...['capture/capture.mjs', 'capture/add-lot.mjs', ...fs.readdirSync(`${HP_ROOT}/tests/probe`).filter((f) => f.endsWith('.mjs')).map((f) => `probe/${f}`)]
  .map((f) => [`tests/${f}`, fs.readFileSync(`${HP_ROOT}/tests/${f}`, 'utf8')])];
const STAR_OK = { 'index.html': [/TIGER/, /flood/i], 'tests/probe/services.mjs': [/School|PUBLICSCH|nces/i] };
for (const [name, src] of files) {
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/outFields:\s*'([^']*)'/g)) {
      const fl = m[1].split(',').map((x) => x.trim()).filter(Boolean);
      if (fl.includes('*')) {
        const near = lines.slice(Math.max(0, i - 8), i + 2).join('\n');
        check((STAR_OK[name] || []).some((re) => re.test(near)), `${name}:${i + 1}: every field ("*") is asked only of a service with no owners on file`);
      } else {
        // the Census's boundary layers (a state's or county's NAME) hold no people
        const bad = fl.filter(isOwnerish).filter((f) => !(f === 'NAME' && /TIGER|tigerweb|GEOID/i.test(lines.slice(Math.max(0, i - 8), i + 2).join('\n'))));
        if (bad.length) check(false, `${name}:${i + 1}: owner-like fields in a field list: ${bad.join(', ')}`);
      }
    }
  });
}
check(true, `field lists in ${files.length} files read`);
const basic = await page.evaluate(() => (window.__hp.REGIONS.US_SC ? true : false));
check(basic, 'the basic card regions were made');

// 3. Vermont's property description: the free text becomes one word as it arrives, in the records, in memory and in the copy
const vt = await page.evaluate(() => {
  const hp = window.__hp;
  const ring = [[-73.2051, 44.4851], [-73.2049, 44.4851], [-73.2049, 44.4849], [-73.2051, 44.4849], [-73.2051, 44.4851]];
  const ft = (desc, span) => ({ geometry: { rings: [ring] }, attributes: { SPAN: span, E911ADDR: '12 PINE ST', TOWN: 'BURLINGTON', CAT: 'R1', DESCPROP: desc, REAL_FLV: 300000, LAND_LV: 100000, IMPRV_LV: 200000 } });
  // the service's fields as the app maps them once it has found the layer
  hp.SVC.VT = { rev: new Map(Object.entries(hp.REGIONS.VT.fields).map(([c, [f]]) => [f, c])) };
  const ps = hp.buildParcels([ft('JANE DOE CONDO UNIT 4', '1'), ft('DWL & 1.2 AC SMITH FARM', '2')], 'VT');
  const p = ps[0];
  const copied = JSON.parse(hp.lotRecordsJson({ p, c: [0, 0], proj: { inv: () => [44.485, -73.205] } }));
  return { raw: p.raw.map((a) => a.DESCPROP), recs: p.records.map((r) => r.PROP_DESC === undefined ? null : r.PROP_DESC), flags: p.records.map((r) => r.VT_DESC),
    copied: (copied.records || []).map((a) => a.DESCPROP), all: JSON.stringify([p.raw, p.records, copied]) };
});
check(JSON.stringify(vt.raw) === JSON.stringify(['CONDO', '']), `Vermont's description is kept as one word: ${JSON.stringify(vt.raw)}`);
check(vt.flags[0] === 'condo', `the condo is still read from it: ${JSON.stringify(vt.flags)}`);
check(!/JANE|DOE|SMITH|DWL/.test(vt.all), 'none of the free text is kept anywhere: records, memory or the copy');
check(JSON.stringify(vt.copied) === JSON.stringify(['CONDO', '']), `the copied records hold the word, not the text: ${JSON.stringify(vt.copied)}`);
const lower = await page.evaluate(() => window.__hp.scrubAttrs('VT', { descprop: 'JANE DOE CONDO UNIT 4', Descprop: 'SMITH FARM' }));
check(lower.descprop === 'CONDO' && lower.Descprop === '', `the description is reduced whatever case the field's name comes in: ${JSON.stringify(lower)}`);

// 4. A parcel layer found by searching ArcGIS Online is used only if it's the same publisher's (same organization or server): a copy
// anyone could publish under the right title, with owner names or made-up values in it, is never read.
const pub = await page.evaluate(() => {
  const hp = window.__hp, same = (id, u) => hp.samePublisher(hp.REGIONS[id])(u);
  return {
    ctSame: same('CT', 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_Parcels_2026/FeatureServer/0'),
    ctOther: same('CT', 'https://services7.arcgis.com/SomeoneElse123/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0'),
    mtSame: same('MT', 'https://gisservice.mt.gov/ArcGIS/rest/services/msdi_cadastral_map_v2/MapServer/1'),
    mtOther: same('MT', 'https://services1.arcgis.com/Copycat/arcgis/rest/services/cadastral_Montana/FeatureServer/0'),
  };
});
check(pub.ctSame && !pub.ctOther && pub.mtSame && !pub.mtOther, `a layer found by searching counts only from the same publisher: ${JSON.stringify(pub)}`);

check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close(); srv.close();
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
process.exit(fails.length ? 1 : 0);
