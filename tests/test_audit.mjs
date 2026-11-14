// Fixes from the November 2026 audit, checked on their own: Connecticut values where a town doesn't assess at 70%, Greenwich's
// spelling, restaurants, the police department for a town name two places share, fractional values off the label, non-market
// sales, the saved comparison's tax and flood, and small formatting.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8800);
const ORIGIN = 'http://localhost:8800';
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setRequestInterception(true);
// The FBI's list of departments for New Jersey: two Washington Township departments, far apart
page.on('request', (req) => {
  const u = req.url();
  if (u.startsWith(ORIGIN)) return req.continue();
  if (u.startsWith('https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/NJ')) return req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ BERGEN: [{ ori: 'NJ0029400', agency_name: 'Washington Township Police Department', agency_type_name: 'City', latitude: 40.99, longitude: -74.06 }],
      GLOUCESTER: [{ ori: 'NJ0082100', agency_name: 'Washington Township Police Department', agency_type_name: 'City', latitude: 39.75, longitude: -75.07 }] }) });
  return req.abort();
});
await page.goto(ORIGIN + '/');
await page.waitForFunction(() => window.__hp && window.__hp.REGIONS);

const r = await page.evaluate(async () => {
  const hp = window.__hp, CT = hp.REGIONS.CT;
  const ct = (o) => { const x = { ...o }; CT.derive(x); return x; };
  const hartford = ct({ CITY: 'HARTFORD', ASSESSED: 110950, LAND_VAL: 50000, BLDG_VAL: 251900 });
  const usual = ct({ CITY: 'WETHERSFIELD', ASSESSED: 70000, LAND_VAL: 40000, BLDG_VAL: 60000 });
  const misspelled = ct({ CITY: 'GREENWHICH', ASSESSED: 700000, LAND_VAL: 600000, BLDG_VAL: 400000 });
  const est = (rec) => hp.estimateTax({ region: CT, r0: rec, recs: [rec], commonOnly: false });
  const hartTax = est({ ...hartford, USE_DESC: 'Three Family' }), greenTax = est({ ...misspelled, USE_DESC: 'Single Family' });
  const kind = (d) => hp.useKind({ USE_DESC: d, USE_CODE: '' }, 'CT');
  // Safety: the Gloucester County house gets Gloucester County's department
  const ag = await hp.agencyFor({ region: { id: 'NJ' }, town: 'Washington Township' }, 39.76, -75.06).catch((e) => ({ err: e.message }));
  // A New York City value is a fraction of market value: not on the label or in the priciest badge
  const nyc = hp.fractionalValue({ region: { id: 'NY' }, r0: { VALUE_KIND: 'nyc' } }), nyFull = hp.fractionalValue({ region: { id: 'NY' }, r0: { VALUE_KIND: 'full' } });
  // The saved comparison: a Florida homestead with nothing taxable now shows what a buyer would pay; a lot partly in AE says so
  localStorage.setItem('housepoint.saved.v1', JSON.stringify([
    { key: 'a', addr: '1 Test St', town: 'X', rid: 'FL', lat: 27, lon: -82, ts: 1, tax: { lo: 0, hi: 0, actual: false, buyer: 9740 } },
    { key: 'b', addr: '2 Test St', town: 'X', rid: 'FL', lat: 27, lon: -82, ts: 2, tax: { lo: 0, hi: 0, actual: false } }]));
  const saved = hp.renderSaved();
  const edge = hp.floodShort({ flood: { here: { badge: 'X', risk: 'low' }, partial: true, exact: true, top: { badge: 'AE', risk: 'high' } } });
  return {
    hartford: hartford.TOTAL_VAL, usual: usual.TOTAL_VAL, city: misspelled.CITY, hartNote: hartTax && hartTax.notes[0], green: !!greenTax,
    rest: kind('RESTAURANT'), res: kind('RESIDENTIAL'), ag: ag && (ag.ori || ag.err), nyc, nyFull,
    saved, edge,
    money: [hp.money(999600), hp.money(1234000), hp.money(845300)],
    pre1970: hp.parseSaleDate(-157766400000) && hp.parseSaleDate(-157766400000).getFullYear(),
    sea: hp.floodView({ flood: null, elev: 0.3 }).html,
  };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1500));
check(r.hartford === 301900 && r.usual === 100000, `Connecticut: the town’s own appraisal where it doesn’t assess at 70% (${r.hartford}), assessed ÷ 0.7 where it does (${r.usual})`);
check(/assesses this one at \$110,950, 37% of its appraisal/.test(r.hartNote || '') && !/Connecticut assesses at 70%/.test(r.hartNote || ''), 'the tax note gives the real share');
check(r.city === 'GREENWICH' && r.green, 'Greenwich spelled right, and its tax found');
check(r.rest === 'commercial' && r.res === 'single', `Connecticut restaurants aren’t homes (${r.rest}, ${r.res})`);
check(r.ag === 'NJ0082100', `a town name two places share: the nearer department (${r.ag})`);
check(r.nyc === true && r.nyFull === false, 'New York City’s fractional value is kept off the label and badge');
check(/≈ \$9,740/.test(r.saved) && /a new owner, per year/.test(r.saved) && !/null/.test(r.saved) && /\$0/.test(r.saved), 'saved comparison: a buyer’s Florida tax, and $0 instead of “null”');
check(r.edge === 'X · minimal · part in AE', `saved comparison: the flood cell keeps the high-risk part (${r.edge})`);
check(r.money.join(' ') === '$1M $1.23M $845k', `money: ${r.money.join(' ')}`);
check(r.pre1970 === 1965, `a sale date from before 1970 reads right (${r.pre1970})`);
check(/at sea level/.test(r.sea) && !/0 ft below/.test(r.sea), 'ground at sea level, not “0 ft below”');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
