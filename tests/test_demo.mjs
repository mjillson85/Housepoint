// The demo (?demo=1) is made up from end to end: it sends nothing to any outside service, in either card layout, the buying
// section, the map or the share image, and says its schools, places and figures are made up.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8798);
const ORIGIN = 'http://localhost:8798';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

async function demoPage(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.outside = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); page.outside.push(new URL(u).host); return r.abort(); });
  await page.goto(ORIGIN + url);
  await page.click('#goPoint'); await sleep(1200);
  await page.evaluate(() => window.__hp.setHeading(15)); await sleep(300);
  await page.click('#shutter'); await sleep(1200);
  return page;
}

// The long card, with "Thinking of buying?" opened, the map and the share image
{
  const page = await demoPage('/?demo=1');
  await page.evaluate(() => document.querySelector('#buyBtn').scrollIntoView()); await page.click('#buyBtn'); await sleep(1200);
  const buy = await page.$eval('#buyBox', (el) => el.innerText.replace(/\n+/g, ' | '));
  check(/These schools are made up for the demo/.test(buy) && /made up for the demo/.test(buy.slice(buy.indexOf('NEIGHBORHOOD'))) && /These places are made up for the demo/.test(buy), 'the demo’s schools, figures and places say they’re made up');
  check(/Demo Town Elementary/.test(buy) && /Grocery \| Demo Town Market/.test(buy), 'made-up schools and places show');
  const aerial = await page.$eval('#cardBody .aerial', (el) => ({ imgs: el.querySelectorAll('image').length, text: el.innerText }));
  check(aerial.imgs === 0 && /Demo: no aerial photo/.test(aerial.text) && !/Street view/.test(aerial.text), 'no aerial photo or Street view link for a made-up house');
  const tax = await page.$eval('#cardBody .tax', (el) => el.innerText);
  check(/Demo Town’s FY\d{4} residential rate/.test(tax) && !/Bridgewater/.test(tax), 'the tax note names the made-up town');
  await page.click('#shareC'); await sleep(1500);
  await page.click('.grab'); await sleep(300);
  await page.click('#toMap'); await sleep(1200);
  check(!page.outside.length, `the demo sends nothing anywhere (asked: ${[...new Set(page.outside)].join(', ') || 'nothing'})`);
  check(!page.errors.length, 'no page errors ' + page.errors.join('; '));
  await page.close();
}
// The card in tabs, every tab opened
{
  const page = await demoPage('/?demo=1&tabs=1');
  for (const t of ['fin', 'sch', 'near', 'hood']) { await page.click('#tb-' + t); await sleep(500); }
  const near = await page.$eval('#tp-near', (el) => el.innerText);
  check(/These places are made up for the demo/.test(near) && /Made-up places/.test(near), 'the Nearby tab says its places are made up');
  check(!page.outside.length, `with tabs, the demo sends nothing anywhere (asked: ${[...new Set(page.outside)].join(', ') || 'nothing'})`);
  check(!page.errors.length, 'no page errors ' + page.errors.join('; '));
  await page.evaluate(() => localStorage.removeItem('housepoint.tabs'));
  await page.close();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
