// The page's script rules (Content-Security-Policy) and the JSONP loader: the app runs under them without being refused anything,
// the rules' script hosts are exactly the JSONP hosts in the code, JSONP refuses any other host and any answer that isn't an
// object, an inline event handler that got into the page doesn't run, and a records service's link is used only if it's a web
// address. Also the privacy page's rules.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`, 'utf8');
const files = { '/': html, '/index.html': html, '/privacy.html': fs.readFileSync(`${HP_ROOT}/privacy.html`, 'utf8') };
const srv = http.createServer((q, r) => {
  const path = q.url.split('?')[0];
  if (files[path]) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(files[path]); }
  const f = `${HP_ROOT}${decodeURIComponent(path)}`;   // fonts, icons, the manifest
  if (/^\/(fonts|icons)\/[\w.-]+$|^\/manifest\.webmanifest$/.test(path) && fs.existsSync(f)) {
    r.writeHead(200, { 'content-type': path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.png') ? 'image/png' : 'application/manifest+json' });
    return r.end(fs.readFileSync(f));
  }
  r.writeHead(404); r.end();
}).listen(8796);
const ORIGIN = 'http://localhost:8796';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

// The rules as written in the page
const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
check(!!meta, 'the page has script rules');
const rules = Object.fromEntries((meta ? meta[1] : '').split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
const codeHosts = JSON.parse((/const JSONP_HOSTS = (\[[^\]]+\])/.exec(html) || [0, '[]'])[1].replace(/'/g, '"'));
const ruleHosts = (rules['script-src-elem'] || []).filter((v) => /^https:\/\//.test(v)).map((v) => v.replace(/^https:\/\//, '')).sort();
check(codeHosts.length > 0 && JSON.stringify(ruleHosts) === JSON.stringify([...codeHosts].sort()), `script hosts in the rules match JSONP_HOSTS: ${ruleHosts.join(', ')}`);
check(JSON.stringify((rules['script-src'] || []).slice().sort()) === JSON.stringify((rules['script-src-elem'] || []).slice().sort()), 'script-src (older browsers) lists the same as script-src-elem');
check((rules['script-src-attr'] || []).join(' ') === "'none'", 'no inline event handlers');
check(!(rules['script-src'] || []).includes("'unsafe-eval'") && (rules['object-src'] || []).join(' ') === "'none'" && (rules['base-uri'] || []).join(' ') === "'none'", 'no eval, no plugins, no <base> rewrites');
check(!/\son[a-z]+="/i.test(html.replace(/<script>[\s\S]*<\/script>/, '')), 'the page’s markup has no inline handlers of its own');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
async function newPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.refused = []; page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) page.refused.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => { window.__refused = []; document.addEventListener('securitypolicyviolation', (e) => window.__refused.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return req.continue();
    const cb = (new URL(u).searchParams.get('callback')) || '';
    if (u.startsWith('https://data.wprdc.org/')) return req.respond({ status: 200, contentType: 'application/javascript', body: `${cb}({"success":true,"result":{"records":[]}})` });
    if (u.startsWith('https://geocoding.geo.census.gov/')) return req.respond({ status: 200, contentType: 'application/javascript', body: `${cb}(${JSON.stringify(page.censusAnswer)})` });
    if (u.startsWith('https://evil.example/')) { page.evilAsked = true; return req.respond({ status: 200, contentType: 'application/javascript', body: `window.__evil=1;${cb}({})` }); }
    return req.abort();
  });
  await page.setGeolocation({ latitude: 42.32, longitude: -72.63, accuracy: 5 });
  await page.goto(ORIGIN + url);
  return page;
}

// The app's own screens, under the rules: pointing, a card, the share picture (a blob: image), the map, the panels
const page = await newPage('/?demo=1');
await page.click('#goPoint'); await sleep(900);
await page.evaluate(() => window.__hp.setHeading(15)); await sleep(400);
await page.click('#shutter'); await sleep(1300);
check(await page.$eval('#sheet', (el) => el.classList.contains('open')), 'a card opens');
await page.click('#shareC'); await sleep(1500);
check(await page.$eval('#shareView', (el) => !el.classList.contains('hidden')), 'the share picture shows (a blob: image)');
await page.click('#svClose'); await sleep(300);
await page.evaluate(() => window.__hp.openPanel('near')); await sleep(500);
await page.evaluate(() => document.querySelector('#panel').classList.remove('open'));
await page.click('#toMap'); await sleep(900);
await page.evaluate(() => window.__hp.openAbout && window.__hp.openAbout()); await sleep(400);
const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length; });
check(fontsOk > 0, `the app’s own fonts load (${fontsOk})`);
let refused = await page.evaluate(() => window.__refused);
check(!refused.length && !page.refused.length, 'nothing the app does is refused: ' + [...refused, ...page.refused].join(' | '));

// JSONP: a listed host works, any other host is refused before a script is added, and a non-object answer isn't an answer
page.censusAnswer = { result: { addressMatches: [{ matchedAddress: '12 OAK ST, HOPKINTON, MA, 01748', coordinates: { x: -71.52, y: 42.23 } }] } };
const census = await page.evaluate(async () => { try { const r = await window.__hp.censusSearch('12 Oak St, Hopkinton', 'MA'); return JSON.stringify(r); } catch (e) { return 'failed: ' + e.message; } });
check(/Oak St/.test(census), `the Census geocoder by JSONP still works under the rules: ${census}`);
const evil = await page.evaluate(async () => { const before = document.scripts.length;
  try { await window.__hp.jsonp('https://evil.example/x?f=json'); return 'answered'; } catch (e) { return `${e.message} | scripts added ${document.scripts.length - before} | ran ${!!window.__evil}`; } });
check(/not a JSONP host/.test(evil) && /scripts added 0/.test(evil) && /ran false/.test(evil) && !page.evilAsked, `JSONP refuses a host that isn't listed: ${evil}`);
const plain = await page.evaluate(async () => { try { await window.__hp.jsonp('http://data.wprdc.org/api/3/action/x'); return 'answered'; } catch (e) { return e.message; } });
check(/not a JSONP host/.test(plain), 'JSONP refuses plain http, even for a listed host');
page.censusAnswer = 'just a string';
const notObj = await page.evaluate(async () => { try { await window.__hp.jsonp('https://geocoding.geo.census.gov/geocoder/x?format=jsonp'); return 'answered'; } catch (e) { return e.message; } });
check(/not an answer/.test(notObj), 'a JSONP answer that isn’t an object doesn’t count: ' + notObj);
// The rules themselves stop a script from a host that isn't listed, even if something added one
const blocked = await page.evaluate(() => new Promise((res) => { const s = document.createElement('script'); s.src = 'https://evil.example/y.js';
  s.onload = () => res('loaded'); s.onerror = () => res('refused'); document.head.appendChild(s); setTimeout(() => res('timeout'), 3000); }));
check(blocked === 'refused' && !page.evilAsked, `the page’s rules refuse a script from any other host: ${blocked}`);

// An inline handler in text that got into the page (say, a service's field shown without escaping) doesn't run
await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<img src="data:," onerror="window.__ran=1"><a id="jsl" href="javascript:window.__ran2=1">x</a>'); });
await sleep(300);
await page.evaluate(() => document.querySelector('#jsl').click()); await sleep(300);
check(await page.evaluate(() => !window.__ran), 'an inline onerror handler doesn’t run');
check(await page.evaluate(() => !window.__ran2), 'a javascript: link that got into the page does nothing when clicked');
await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<a id="jsl2" href="java&#9;script:window.__ran3=1">y</a><svg width="40" height="20"><a id="jsl3" xlink:href="javascript:window.__ran4=1" href="javascript:window.__ran4=1"><text x="2" y="14">z</text></a></svg>'); });
await page.evaluate(() => { document.querySelector('#jsl2').click(); document.querySelector('#jsl3 text').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await sleep(300);
check(await page.evaluate(() => !window.__ran3 && !window.__ran4), 'nor does one hidden with an entity (java&#9;script:) or inside an SVG drawing');

// Record links from a service: web addresses only
const links = await page.evaluate(() => ['https://county.example/rec?id=1', 'http://www.okanogancounty.org/x', 'https://county.example/search?addr=12 OAK ST&o=O\'Neil',
  'https://a.example/"><b>', 'javascript:alert(1)', 'data:text/html,hi', ' JAVASCRIPT:x', 'https://localhost/x', 'not a link']
  .map((u) => window.__hp.normalizeRecord({ __RECORD_URL: u }, null).RECORD_URL || null));
check(links[0] === 'https://county.example/rec?id=1' && links[1] === 'http://www.okanogancounty.org/x', 'record links: http(s) kept');
check(/^https:\/\/county\.example\/search\?addr=12%20OAK%20ST/.test(links[2] || ''), 'a link with a space or an apostrophe is kept (encoded): ' + links[2]);
check(links[3] && !/["<>]/.test(links[3]), 'quotes and angle brackets in a link come out encoded: ' + links[3]);
check(links.slice(4).every((x) => x === null), 'anything else is dropped: ' + JSON.stringify(links.slice(4)));
check(!page.errors.length, 'no page errors ' + page.errors.join('; '));

// The privacy page: no scripts at all, its fonts still load
const priv = await newPage('/privacy.html');
await sleep(500);
const pmeta = await priv.$eval('meta[http-equiv="Content-Security-Policy"]', (el) => el.content).catch(() => '');
check(/script-src 'none'/.test(pmeta), 'the privacy page allows no scripts');
const pf = await priv.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length; });
check(pf > 0 && !(await priv.evaluate(() => window.__refused.length)) && !priv.refused.length, `the privacy page’s fonts load and nothing is refused (${pf}) ${priv.refused.join(' | ')}`);

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
