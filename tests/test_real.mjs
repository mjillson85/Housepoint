// Every real lot in tests/fixtures/real-*.json (captured from the covered states' services by capture/capture.mjs) is loaded on
// the map and its card checked against rules that should hold for any property: a store isn't a home, a condo's master record
// isn't a unit, a nominal deed isn't a price, and so on. Plus the named problem lots get their own checks.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8790);
const ORIGIN = 'http://localhost:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; let passes = 0;
const check = (ok, msg) => { if (ok) passes++; else { console.log('FAIL ' + msg); fails.push(msg); } };

const FIX = `${HP_ROOT}/tests/fixtures`;
const files = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => /^real-[A-Z]{2}\.json$/.test(f)) : [];
const sets = files.map((f) => JSON.parse(fs.readFileSync(`${FIX}/${f}`, 'utf8')));
if (!sets.length) { console.log('no fixtures yet: ALL PASSED'); process.exit(0); }
const OWNERISH = /(^|_)OWN(?!ERSHIP(_TYPE)?$)|OWNER(?!SHIP(_TYPE)?$)|MAIL|PSTL|TAXPAYER|TAX_NAME|TAX_ADD|CAREOF|^ADDRESS[12]$|CITYSTZIP|LEGAL|LIBER|FOLIO|PRIMARY_OWNER|ADD_OWNER|NYS_NAME|PO_BOX/i;     // Nebraska's Ownership_Type and Minnesota's ownership are Private, Exempt, State…

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let current = null;          // { set, lot }: the lot the fake services hand out
let svcUrls = {};            // region id -> every service address the app may try first
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.startsWith(ORIGIN)) return req.continue();
  const json = (o) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  for (const set of sets) {
    const layer = set.service.replace(/\/+$/, ''), root = layer.replace(/\/\d+$/, ''), id = +(/\/(\d+)$/.exec(layer) || [0, 0])[1];
    const bases = [...new Set([layer, root, ...(svcUrls[set.state] || [])])];
    const base = bases.find((b) => u.startsWith(b + '?') || u.startsWith(b + '/'));
    if (!base) continue;
    const path = u.slice(base.length).split('?')[0];
    const meta = { objectIdField: set.objectIdField, maxRecordCount: set.maxRecordCount, geometryType: 'esriGeometryPolygon', fields: set.fields };
    if (path === '' && /f=json/.test(u)) return json(/\/(FeatureServer|MapServer)$/i.test(base) ? { layers: [{ id, geometryType: 'esriGeometryPolygon' }] } : meta);
    if (/^\/\d+$/.test(path)) return json(meta);
    if (/\/query$/.test(path)) {
      if (current === 'health') return json({ features: set.lots.find((l) => !l.named && l.features.length === 1 && /^\d/.test(String(Object.values(l.features[0].attributes).find((v) => typeof v === 'string' && /^\d+\s+[A-Z]/i.test(v)) || ''))) ? set.lots.filter((l) => !l.named).slice(0, 25).flatMap((l) => l.features) : [] });
      return json({ features: current && current.set === set ? current.lot.features : [] });
    }
  }
  return req.abort();            // imagery, flood maps, building outlines, schools…: not needed for the card's own facts
});
await page.goto(ORIGIN + '/');
svcUrls = await page.evaluate(() => Object.fromEntries(Object.entries(window.__hp.REGIONS).map(([k, v]) => [k, (v.services || []).map((x) => String(x).replace(/\/+$/, ''))])));
await page.click('#goMap'); await sleep(300);

// Clearly not a home, read straight from the use codes (independent of the app's own reading)
function rawNonHome(st, recs) {
  const codes = recs.map((r) => String(r.attributes.USE_CODE ?? r.attributes.DOR_UC ?? r.attributes.PROP_CLASS ?? r.attributes.PROPCLASS ?? r.attributes.LANDUSE_CD ?? r.attributes.Property_Parcel_Type ?? r.attributes.useclass1 ?? r.attributes.USECODE ?? r.attributes.LU ?? '').trim().toUpperCase());
  if (!codes.length || codes.some((c) => !c)) return false;
  if (st === 'MA') return codes.every((c) => /^[2-9]/.test(c.replace(/\D/g, '')) && !/^995/.test(c.replace(/\D/g, '')));
  if (st === 'FL') return codes.every((c) => parseInt(c.replace(/\D/g, '') || '0', 10) >= 10);
  if (st === 'NJ') return codes.every((c) => /^(1|4A|4B|5A|5B|6A|6B|15[A-F])$/.test(c));
  if (st === 'WI') return codes.every((c) => !c.split(',').includes('1'));           // classes 2–7: businesses (and big apartment buildings), farms, land
  if (st === 'WA') return codes.every((c) => +c >= 21);                              // codes 11–19 are the residential ones
  if (st === 'NE') return codes.every((c) => /^(03|04|05|08|09|10|11|12)$/.test(c));     // commercial, industrial, farm, minerals, utilities, exempt
  if (st === 'MN') return codes.every((c) => /^(3A|5E) /.test(c));                     // the state classes 3a (commercial, industrial) and 5e (exempt)
  if (st === 'DC') return codes.every((c) => /^0?(3[1-57-9]|[4-8]\d)$/.test(c));        // hotels, stores, offices, industry, churches, schools, embassies
  if (st === 'MD') return codes.every((c) => /^(C|I|E|EC|A|MA|CA)$/.test(c));           // land use: commercial, industrial, exempt, farm, marsh, country club
  if (st === 'NY') return codes.every((c) => /^(05|06|07|08|09|10|11)$/.test(c) || (/^\d{3}$/.test(c) && +c >= 300 && ![411, 481, 483, 485].includes(+c)));   // businesses, land, institutions
  return false;
}
const KNOWN = new Set(['single', 'multi', 'apartments', 'resCondo', 'comCondo', 'condoMaster', 'mobile', 'mixedRes', 'mixed', 'otherRes', 'commercial',
  'industrial', 'vacant', 'farmForest', 'exempt', 'institutional', 'accessory', 'other', 'unknown']);
const tally = {};
const REPORT = process.env.REPORT ? [] : null;     // REPORT=file.json writes what every lot became, for reading through
let shown = 0, skipped = 0;
for (const set of sets) {
  for (const lot of set.lots) {
    const name = `${set.state} ${lot.spot} ${lot.kind} (${lot.key})`;
    for (const f of lot.features) for (const k of Object.keys(f.attributes)) if (OWNERISH.test(k)) check(false, `owner field ${k} in the fixture: ${name}`);
    current = { set, lot };
    const st = await page.evaluate(async (lat, lon) => {
      const hp = window.__hp, S = hp.S;
      try { await hp.centerMap(lat, lon); } catch (e) { return { err: String(e) }; }
      if (!S.local.length) return { none: true };
      const L = S.local.slice().sort((a, b) => b.p.records.length - a.p.records.length)[0];
      hp.selectLot(L);
      await new Promise((r) => setTimeout(r, 30));
      const s = hp.summarize(L.p), body = document.querySelector('#cardBody');
      const heads = [...body.querySelectorAll('.units-h')].map((h) => h.textContent);
      const lists = [...body.querySelectorAll('.units')].map((ul) => [...ul.querySelectorAll('.unit > span:first-child')].map((x) => x.textContent));
      const details = [...body.querySelectorAll('.udet')].map((d) => d.innerText);
      const cand = S.candidates[S.cIdx];
      return { addr: (body.querySelector('.addr') || {}).textContent || '', text: body.innerText, town: (body.querySelector('.town') || {}).textContent || '', value: (body.querySelector('.value .v') || {}).textContent || '',
        buy: !!body.querySelector('#buyBox'), heads, lists, details, chip: hp.arChipHtml(L).replace(/<[^>]+>/g, ' '), share: hp.shareText(cand),
        kind: s.kind, building: s.building, kinds: s.kinds, isHome: s.isHome, residential: s.residential, houseLike: s.houseLike, condo: s.condo,
        units: s.units, unitCodes: s.unitRecs.map((u) => String(u.USE_CODE ?? '')), unitVals: s.unitRecs.map((u) => +u.TOTAL_VAL || 0), vals: s.vals,
        masterAddrs: s.kinds.map((k, i) => (k === 'condoMaster' ? String(s.recs[i].SITE_ADDR || '') : null)).filter(Boolean),
        r0Sale: { p: +s.r0.LS_PRICE || 0, d: s.r0.LS_DATE ?? s.r0.SALE_YR ?? null }, fy: s.fy, stale: !!hp.staleRecord(s), commonOnly: s.commonOnly, copied: JSON.parse(hp.lotRecordsJson(L)), year: s.year, recs: s.recs.length, rid: s.region.id };
    }, lot.lat, lot.lon);
    if (st.err || st.none) { skipped++; continue; }     // e.g. a road or water outline: the app doesn't load those as lots
    if (REPORT) REPORT.push({ name, town: st.town, value: st.value, chip: st.chip.replace(/\s+/g, ' ').trim(), share: st.share, kind: st.kind, home: st.isHome, units: st.condo ? st.units : null, heads: st.heads, lists: st.lists.map((l) => l.slice(0, 4)),
      codes: lot.features.map((f) => f.attributes.USE_CODE ?? f.attributes.DOR_UC ?? f.attributes.PROP_CLASS ?? f.attributes.State_Use_Description ?? f.attributes.PROPCLASS ?? f.attributes.LANDUSE_CD ?? f.attributes.Property_Parcel_Type ?? null).slice(0, 12) });
    shown++;
    tally[st.kind] = (tally[st.kind] || 0) + 1;
    const T = st.text;
    // Every record gets a known kind; unknown is never treated as a home
    check(st.kinds.every((k) => KNOWN.has(k)), `unknown kind value ${JSON.stringify(st.kinds)}: ${name}`);
    if (st.kind === 'unknown') check(!st.isHome && !st.buy, `an unknown kind gets home tools: ${name}`);
    // Homes only: the buyer's box, living area, rooms, per ft²
    check(st.buy === st.isHome, `buy box ${st.buy} but isHome ${st.isHome}: ${name}`);
    if (!st.residential) check(!/Living area|Bedrooms|\bRooms\b|per ft²/.test(T), `"Living area"/rooms/per ft² on a non-residential card: ${name}`);
    if (rawNonHome(set.state, lot.features) && !st.commonOnly) check(!st.buy && !/Living area|Bedrooms|per ft²/.test(T), `the codes say not a home, but the card treats it as one: ${name}`);
    if (st.building === 'comCondo') check(!st.details.some((d) => /Living area|Bedrooms/.test(d)), `a commercial condo unit shows living area or bedrooms: ${name}`);
    // Condo buildings: only units are counted and listed
    if (st.condo) {
      check(st.units === st.unitCodes.length && st.units >= 2, `unit count ${st.units} vs ${st.unitCodes.length} unit records: ${name}`);
      check(st.heads[0] === `${st.units} units · tap one for its details` && st.lists[0].length === st.units, `unit list doesn't match the unit count: ${name} ${JSON.stringify(st.heads)}`);
      check(!st.masterAddrs.length || st.lists[0].length === st.units, `a master record is listed as a unit: ${name}`);
      check(/Condo building|Commercial condo building/.test(st.town), `condo building not named in the town line: ${name} "${st.town}"`);
      if (st.unitVals.some((v) => v > 0)) check(st.value !== '—', `units have values but the building shows "—": ${name}`);
    } else {
      check(!/Condo building/.test(st.town), `"Condo building" without condo units: ${name} "${st.town}"`);
      check(!st.heads.some((h) => /units · tap one/.test(h)), `a unit list on a lot that isn't a condo building: ${name}`);
    }
    // Values and sales
    // "$4.2M" and "$350k" are big numbers written short
    const dollars = (m) => parseFloat(m[1].replace(/,/g, '')) * ({ k: 1e3, K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1);
    const AMT = String.raw`\$([\d,]+(?:\.\d+)?)([kKMB])?`;
    for (const m of (T + '\n' + st.details.join('\n')).matchAll(new RegExp(AMT + String.raw`\s·\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b`, 'g'))) check(dollars(m) >= 10000, `a nominal deed shown as a sale price (${m[0]}): ${name}`);
    for (const m of T.matchAll(new RegExp(String.raw`(?:Last sold|Latest unit sale|Sold before that for)\s+` + AMT, 'g'))) check(dollars(m) >= 10000, `a nominal deed shown as a sale (${m[0]}): ${name}`);
    for (const m of st.share.matchAll(new RegExp('Last sold ' + AMT, 'g'))) check(dollars(m) >= 10000, `share text: nominal deed as a sale: ${name}`);
    // An address in any of the states' address fields shows on the card
    const rawAddr = lot.features.some((f) => ['SITE_ADDR', 'Location', 'Location_1', 'PROP_LOC', 'PHY_ADDR1', 'siteadd', 'SITEADRESS', 'SITUS_ADDRESS', 'Situs_Address'].some((k) => String(f.attributes[k] ?? '').trim())
      || /^\d/.test(String(f.attributes.PREMISEADD ?? f.attributes.ADDRESS ?? f.attributes.PARCEL_ADDR ?? '').trim())   // DC's address (a reservation's is just "NW"), Maryland's, New York's
      || (f.attributes.anumber > 0 && String(f.attributes.st_name ?? '').trim()));     // Minnesota's address comes in parts
    if (rawAddr) check(st.addr !== 'Address not listed', `the records have an address but the card says "Address not listed": ${name}`);
    // A real sale in the records shows on the card
    if (!st.condo && !st.commonOnly && st.r0Sale.p >= 10000 && st.r0Sale.d) check(/last sold|part of a multi-lot sale/i.test(T), `the record has a ${st.r0Sale.p} sale (${st.r0Sale.d}) but the card shows none: ${name}`);
    // Tax: a residential rate only for residential records; "None" only for exempt ones
    if (set.state === 'MA' && /residential rate/.test(T)) check(st.unitCodes.some((c) => /^1/.test(c.replace(/\D/g, ''))), `MA residential rate on non-residential records: ${name}`);
    if (/Estimated property tax\s*None|Property tax\s*None/.test(T)) check(st.kinds.some((k) => k === 'exempt'), `tax "None" on a lot that isn't exempt: ${name}`);
    // Nothing broken
    check(!/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(T + st.chip + st.share), `undefined/NaN/null on the card: ${name}`);
    check(!/(^|\s)\$0(\s|$)/m.test(st.value), `a $0 value: ${name}`);
    check(st.town.trim().length > 0, `empty town line: ${name}`);
    check(!st.year || (st.year >= 1600 && st.year <= new Date().getFullYear()), `year built ${st.year}: ${name}`);
    for (const m of T.matchAll(/Built (\d{4})/g)) check(+m[1] >= 1600 && +m[1] <= new Date().getFullYear(), `chip year ${m[1]}: ${name}`);
    if (set.state === 'MA' && st.stale) check(/the newest the state has/.test(T), `old fiscal year without the stale note: ${name}`);
    // The AR tag only says "House" for houses
    if (/\bHouse\b/.test(st.chip)) check(st.houseLike, `tag says House for a ${st.kind}: ${name}`);
    // "Copy this lot's records": the records as the service sent them, every one, with nothing owner-like
    check(st.copied.housepoint === 'lot' && st.copied.state === set.state && st.copied.records.length >= st.recs && st.copied.rings.length >= 1
      && st.copied.records.every((a) => Object.keys(a).every((k) => !OWNERISH.test(k))), `copied records don't match the lot: ${name}`);
    // Named lots
    if (lot.key === 'id:F_751960_2913839') {
      console.log('River St:', JSON.stringify({ town: st.town, value: st.value, heads: st.heads, lists: st.lists, buy: st.buy }));
      check(st.condo && st.building === 'comCondo' && st.units === 2 && /Commercial condo building/.test(st.town), 'River St: a commercial condo building with 2 units');
      check(st.lists[0] && st.lists[0].length === 2 && !st.lists[0].some((x) => /47-49/.test(x)), 'River St: the two stores are the units; the master record isn’t listed');
      check(st.heads.includes('Also on this lot · tap for details') && st.lists[1] && st.lists[1].some((x) => /35 River St/.test(x)), 'River St: the strip of land is listed as also on the lot');
      check(!st.buy && !/Living area/.test(T + st.details.join(' ')) && st.details.some((d) => /Floor area/.test(d)), 'River St: no home-buyer box; stores show floor area, not living area');
    }
  }
}
// The service check page, against the same fake services: every state answers, the geocoders (not faked here) don't
current = 'health';
await page.goto(ORIGIN + '/?health=1');
for (let i = 0; i < 120 && !(await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false)); i++) await sleep(250);
const health = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => `${li.className}|${li.innerText.replace(/\s+/g, ' ')}`));
console.log('health:', health.join('\n        '));
for (const st of sets.map((x) => x.state)) {
  const name = { MA: 'Massachusetts', CT: 'Connecticut', NJ: 'New Jersey', FL: 'Florida', NC: 'North Carolina', WI: 'Wisconsin', WA: 'Washington', NE: 'Nebraska', MN: 'Minnesota', DC: 'District of Columbia', MD: 'Maryland', NY: 'New York' }[st];
  const mine = health.filter((h) => h.includes(`${name}:`));
  check(mine.length === 4 && /^ok\|/.test(mine[0]) && /^(ok|warn)\|/.test(mine[1]) && /^(ok|warn)\|.* \d+ lots/.test(mine[2]) && /^(ok|warn)\|/.test(mine[3]), `health: ${name} rows ${JSON.stringify(mine)}`);
}
check(health.some((h) => /^bad\|Census address lookup.*Not answering/.test(h)), 'health: a service that doesn’t answer is shown as not answering');
check(await page.evaluate(() => document.querySelector('#start').classList.contains('hidden')), 'health: the start screen is out of the way');
console.log(`${shown} cards checked (${skipped} outlines not loaded as lots) from ${sets.map((s) => `${s.state} ${s.lots.length}`).join(', ')}`);
console.log('kinds:', JSON.stringify(tally));
if (REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(REPORT, null, 1));
check(!errors.length, 'no page errors ' + errors.slice(0, 3).join('; '));
console.log(`${passes} checks passed`);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
