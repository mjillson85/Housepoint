// Owner names are never asked for: every field any region can request (its field map and the fields it detects a layer by), every
// field list written into the app or the scripts, and the free text Vermont's grand list carries, checked against the one shared
// owner list (owner-fields.mjs). A region that adds OWNER1 to its fields fails here, before it can reach a phone.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { OWNERISH, KEEP_NAME, isOwnerish } from './owner-fields.mjs';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
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
  for (const st of ['SC', 'PA', 'TX', 'CA']) hp.regionFor(...{ SC: [34.0, -81.03], PA: [40.273, -76.887], TX: [31.762, -106.485], CA: [32.716, -117.161] }[st]);
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
// 2b. In the scripts, every field list written as text (outFields: F, FEW, OUT and the like), not only those beside outFields
for (const [name, src] of files.slice(1)) {
  src.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/'([A-Za-z][A-Za-z0-9_]*(?:,\s*[A-Za-z][A-Za-z0-9_]*){2,})'/g)) {
      const bad = m[1].split(',').map((x) => x.trim()).filter(isOwnerish);
      if (bad.length) check(false, `${name}:${i + 1}: owner-like fields in a field list: ${bad.join(', ')}`);
    }
  });
}
// 2c. A script that builds its field list from a layer's own fields (whatever the layer has) filters it through the shared owner list:
// its own list alone can miss a name, and the probes' logs are public
for (const [name, src] of files.slice(1)) {
  // outFields from anything but a quoted list or a constant holding one (those are checked above)
  const consts = new Set([...src.matchAll(/const ([A-Z][A-Z0-9_]*) = '/g)].map((m) => m[1]));
  const builds = /\.fields\b/.test(src) && [...src.matchAll(/outFields:\s*([^,}\s]+)/g)].some((m) => !/^'/.test(m[1]) && !consts.has(m[1]));
  if (builds) check(/from '\.\.?\/(\.\.\/)?owner-fields\.mjs'|from '\.\/owner-fields\.mjs'/.test(src), `${name}: builds its field list from a layer's fields, through the shared owner list`);
}
// The column lists for the tables joined to the lots (Philadelphia's property office on Carto, Allegheny's assessments on the WPRDC):
// property columns only. Their owner, mailing ("change notice"), legal and deed columns don't all match the shared list's names, so
// they're named here too.
for (const name of ['PHL_OPA_COLS', 'ALLE_COLS']) {
  const m = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(html);
  const cols = m ? Function(`return ${m[1]}`)() : [];
  const bad = cols.filter((c) => isOwnerish(c) || /owner|mail|care_?of|notice|legal|deed|book|registry|beginning_point|cross_reference/i.test(c));
  check(cols.length > 10 && !bad.length, `${name}: ${cols.length} property columns, none an owner's, mailing, legal or deed column${bad.length ? ': ' + bad.join(', ') : ''}`);
}
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

// The values, not just the names: a service whose columns slip (Alaska's Ketchikan rows did) can put a mailing address, a PO box or a
// deed's wording into an ordinary field. No saved record (or a lot's label) may hold text like that.
// (A property's own address with its state and zip is fine; a mailing address shows up as a PO box, "C/O" or "ATTN".)
const OWNER_TEXT = new RegExp(['\\bP\\.?\\s*O\\.?\\s*BOX\\b', '\\bC/O\\b', '\\bCARE OF\\b', '\\bATTN\\b', '\\bTHENCE\\b', '\\bRECORDED (IN|ON)\\b', '\\bIN VOLUME\\b', '\\bAT PAGE\\b',
  '\\bPLAT BOOK\\b', '\\bSUBJECT TO\\b', '\\bET\\s?(AL|UX|VIR)\\b', '\\bTRUSTS?\\b', '\\bTRUSTEES?\\b', '\\bTTEES?\\b', '\\bLIFE ESTATE\\b', '\\bHEIRS\\b', '\\bESTATE OF\\b',
  '\\bU\\.?\\s?S\\.? SURVEY\\b', '\\bL\\.?L\\.?C\\b', '\\bINC\\b', '\\bCORP\\b', '\\bLTD\\b', '\\bLLP\\b', '\\bBLO?C?K\\.?\\s*\\d'].join('|'), 'i');
const textHits = [];
for (const f of fs.readdirSync(`${HP_ROOT}/tests/fixtures`).filter((n) => n.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(`${HP_ROOT}/tests/fixtures/${f}`, 'utf8'));
  for (const lot of (d && d.lots) || []) {
    for (const v of [lot.kind, lot.spot]) if (typeof v === 'string' && OWNER_TEXT.test(v)) textHits.push(`${f} label`);
    for (const ft of lot.features || []) for (const [k, v] of Object.entries(ft.attributes || {})) if (typeof v === 'string' && OWNER_TEXT.test(v)) textHits.push(`${f} ${k}`);
  }
}
check(!textHits.length, `no saved record holds mailing, deed or owner-like text (${textHits.length ? [...new Set(textHits)].slice(0, 5).join(', ') : 'none'})`);
// Alaska's use fields keep only land-use words
const ak = await page.evaluate(() => ['Single Family Resid. with ADU', 'Office Bldg - low rise 1-4 lvls', 'COMM VACANT', 'R1', 'Multi-Family 5+ units', 'PO BOX 1234', '99901', 'KETCHIKAN', 'AK', 'BAWDEN ST 100',
  ' RECORDED IN THE OFFICE OF THE MAGISTRATE', 'VP REAL ESTATE INVESTMENT SERVICES', ' FIRST JUDICIAL DISTRICT', 'LOT 4 TRACT 2', '12 PARK'].map((v) => window.__hp.scrubAttrs('AK', { property_use: v }).property_use));
check(ak.slice(0, 5).every(Boolean) && ak.slice(5).every((v) => v === null), `Alaska keeps use words and drops addresses, box numbers, names and deed text: ${JSON.stringify(ak)}`);

// Minnesota, DC and Maryland: whether an owner lives there, or is blind, disabled, a senior or a veteran, is cut down on arrival
const st = await page.evaluate(() => { const h = window.__hp;
  return { mn: ['1b Blind/Disabled Homestead', 'Senior Citizen Homestead', 'Single-Family / Owner Occupied', '1a/1b/4bb Residential Single Unit'].map((v) => h.scrubAttrs('MN', { useclass1: v }).useclass1),
    hs: ['Yes', 'No', 'Fractional'].map((v) => h.scrubAttrs('MN', { homestead: v }).homestead), dc: ['1', '5', '0', ''].map((v) => h.scrubAttrs('DC', { HSTDCODE: v }).HSTDCODE),
    md: ['JUR Housing Authority', 'DIS Disabled Veteran', 'BLD Blind'].map((v) => h.scrubAttrs('MD', { DESCEXCL: v }).DESCEXCL) }; });
check(st.mn[0] === 'Homestead' && st.mn[1] === 'Homestead' && st.mn[2] === 'Single-Family' && st.mn[3] === '1a/1b/4bb Residential Single Unit'
  && st.hs.join() === 'Y,N,Y' && st.dc.join() === 'Y,Y,N,N' && st.md[0] === 'JUR Housing Authority' && st.md[1] === null && st.md[2] === null,
  `homestead is a yes or no, and personal status words are dropped: ${JSON.stringify(st)}`);

check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close(); srv.close();
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
process.exit(fails.length ? 1 : 0);
