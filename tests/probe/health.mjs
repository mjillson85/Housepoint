// The app's own service check (?health=1), from a browser on GitHub: every region's parcel layer, its fields, lots at a sample
// spot and an address search, then the joined value tables, flood, elevation and imagery. Prints each row, and fails (exit 1)
// when a region's records or lots don't answer, or a joined table comes back empty, so a county that moves its layer is
// found here, not by someone on the sidewalk. Run weekly and on probe changes by the "probe services" workflow.
//   cd tests && node probe/health.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${ROOT}/index.html`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8801);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
// Anything the page's script rules (Content-Security-Policy) refuse while asking the real services: a service the rules don't
// allow is a broken feature, so it fails the run too. Only the rule and the address's host are kept.
await page.evaluateOnNewDocument(() => { window.__refused = []; document.addEventListener('securitypolicyviolation', (e) => {
  let host = e.blockedURI; try { host = new URL(e.blockedURI).host || e.blockedURI; } catch (x) { /* inline, eval */ } window.__refused.push(`${e.effectiveDirective} ${host}`); }); });
await page.goto('http://localhost:8801/?health=1');
let done = false;
for (let i = 0; i < 1200 && !done; i++) { await sleep(500); done = await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false); }
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => ({ cls: li.className, label: (li.querySelector('b') || {}).textContent || '', msg: (li.querySelector('span') || {}).textContent || '' })));
// For a region whose records don't answer: is the server down, turning GitHub away, or refusing browsers (its cross-site rules)?
// Asked once from the browser page and once from plain Node; only the status and the layer's name are printed.
const services = await page.evaluate(() => Object.fromEntries(Object.values(window.__hp.REGIONS).map((r) => [r.name, (r.services || [])[0]])));
const why = [];
for (const r of rows.filter((x) => x.cls === 'bad' && /: property records$/.test(x.label))) {
  const name = r.label.replace(/: property records$/, ''), url = services[name]; if (!url) continue;
  const browserTry = await page.evaluate(async (u) => { try { const res = await fetch(u + '?f=json', { signal: AbortSignal.timeout(15000) }); const j = await res.json(); return `${res.status} ${j.name ? 'layer ' + j.name : (j.error && 'error ' + j.error.message) || ''}`; } catch (e) { return `failed: ${e.message || e}`; } }, url);
  // The layer answers but isn't the parcels any more: list the service's layers (numbers and names only) to find where they went.
  let moved = '';
  if (/^200 layer /.test(browserTry) && /\/(FeatureServer|MapServer)\/\d+$/i.test(url)) {
    moved = await page.evaluate(async (u) => { try { const j = await (await fetch(u.replace(/\/\d+$/, '') + '?f=json', { signal: AbortSignal.timeout(15000) })).json();
      return [...(j.layers || []), ...(j.tables || [])].map((l) => `${l.id} ${l.name}${l.geometryType ? '' : ' (table)'}`).join('; '); } catch (e) { return `failed: ${e.message || e}`; } }, url);
    moved = `\n    the service's layers: ${moved}`;
  }
  let nodeTry; try { const res = await fetch(url + '?f=json', { signal: AbortSignal.timeout(15000) }); const t = await res.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ }
    nodeTry = `${res.status} ${j.name || (j.error && j.error.message) || t.slice(0, 60).replace(/\s+/g, ' ')}`; } catch (e) { nodeTry = `failed: ${(e.cause && e.cause.code) || e.message || e}`; }
  why.push(`  ${name} (${url.replace(/^https:\/\//, '').split('/')[0]}): from the browser page ${browserTry}; from Node ${nodeTry}${moved}`);
}
const movedLayers = await page.evaluate(() => Object.values(window.__hp.REGIONS).filter((r) => /\/(FeatureServer|MapServer)\/\d+\/?$/i.test((r.services || [])[0] || '') && window.__hp.SVC[r.id] && window.__hp.SVC[r.id].layerUrl
  && window.__hp.SVC[r.id].layerUrl !== r.services[0].replace(/\/+$/, '')).map((r) => `  ${r.name}: answered from ${window.__hp.SVC[r.id].layerUrl}, not ${r.services[0]} (update the address)`));
const refused = [...new Set(await page.evaluate(() => window.__refused))];
await browser.close(); srv.close();
if (refused.length) console.log(`\nRefused by the page's script rules (index.html's Content-Security-Policy):\n${refused.map((x) => '  ' + x).join('\n')}`);
if (movedLayers.length) console.log(`\nRegions whose records came from another layer:\n${movedLayers.join('\n')}`);

const MARK = { ok: '  ok  ', warn: ' warn ', bad: ' BAD  ', wait: ' wait ' };
for (const r of rows) console.log(`${MARK[r.cls] || r.cls} ${r.label} | ${r.msg.slice(0, 200)}`);
// What fails the run: a region whose records or lots don't answer, a joined value table that comes back empty, or a check that never finished
const dead = rows.filter((r) => (r.cls === 'bad' && /: property records$|: lots around |^(Assessed|Market) values in /.test(r.label)) || r.cls === 'wait');
console.log(`\n${rows.length} checks: ${rows.filter((r) => r.cls === 'ok').length} ok, ${rows.filter((r) => r.cls === 'warn').length} with a problem, ${rows.filter((r) => r.cls === 'bad').length} not answering${done ? '' : ' (the page never finished)'}`);
if (why.length) console.log(`\nWhy the records didn't answer:\n${why.join('\n')}`);
if (!done || dead.length || refused.length) {
  console.log(`\nNeeds a look:\n${dead.map((r) => `  ${r.label}: ${r.msg.slice(0, 200)}`).join('\n') || (refused.length ? '  the page refused something (above)' : '  the check page never finished')}`);
  process.exitCode = 1;
}
