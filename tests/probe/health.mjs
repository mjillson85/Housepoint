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
await page.goto('http://localhost:8801/?health=1');
let done = false;
for (let i = 0; i < 1200 && !done; i++) { await sleep(500); done = await page.$eval('#hDone', (e) => /^Done/.test(e.textContent)).catch(() => false); }
const rows = await page.evaluate(() => [...document.querySelectorAll('#hRows li')].map((li) => ({ cls: li.className, label: (li.querySelector('b') || {}).textContent || '', msg: (li.querySelector('span') || {}).textContent || '' })));
await browser.close(); srv.close();

const MARK = { ok: '  ok  ', warn: ' warn ', bad: ' BAD  ', wait: ' wait ' };
for (const r of rows) console.log(`${MARK[r.cls] || r.cls} ${r.label} | ${r.msg.slice(0, 200)}`);
// What fails the run: a region whose records or lots don't answer, a joined value table that comes back empty, or a check that never finished
const dead = rows.filter((r) => (r.cls === 'bad' && /: property records$|: lots around |^(Assessed|Market) values in /.test(r.label)) || r.cls === 'wait');
console.log(`\n${rows.length} checks: ${rows.filter((r) => r.cls === 'ok').length} ok, ${rows.filter((r) => r.cls === 'warn').length} with a problem, ${rows.filter((r) => r.cls === 'bad').length} not answering${done ? '' : ' (the page never finished)'}`);
if (!done || dead.length) {
  console.log(`\nNeeds a look:\n${dead.map((r) => `  ${r.label}: ${r.msg.slice(0, 200)}`).join('\n') || '  the check page never finished'}`);
  process.exitCode = 1;
}
