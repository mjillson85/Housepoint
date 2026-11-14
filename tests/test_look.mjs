// The new look, on trial behind a switch: off by default (the old card exactly as it was), on with ?look=new or the list
// panel's switch, kept on the phone, and off again with ?look=old or the switch. In it: point mode without the status pills
// and with the first tip under the aim circle; the small card (three numbers and the flood line, the camera still in view);
// "Full story" to the overview with its sections; each section one tap away and back; "Not it" keeping the section; a fresh
// house starting small again; the buying section loading only when opened; plain words in place of service errors.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const html = fs.readFileSync(`${HP_ROOT}/index.html`);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); }).listen(8792);
const ORIGIN = 'http://localhost:8792';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

async function newPage(url, ctx) {
  const page = await (ctx || browser).newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  page.asked = []; await page.setRequestInterception(true);
  page.on('request', (r) => { if (r.url().startsWith(ORIGIN)) return r.continue(); page.asked.push(r.url()); return r.abort(); });
  await page.goto(ORIGIN + url);
  return page;
}
const vis = (page, sel) => page.$$eval(sel, (els) => els.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').length);
const sheetCls = (page) => page.$eval('#sheet', (el) => el.className);
async function pointAndShoot(page, h = 15) {
  await page.click('#goPoint'); await sleep(900);
  await page.evaluate((h) => window.__hp.setHeading(h), h); await sleep(800);
  await page.click('#shutter'); await sleep(1600);
}

// 1. Off by default: the old card, exactly as it was
{
  const ctx = await browser.createBrowserContext();
  const page = await newPage('/?demo=1', ctx);
  check(!(await page.evaluate(() => document.body.classList.contains('calm'))), 'off by default');
  await pointAndShoot(page);
  check(!/cv-/.test(await sheetCls(page)) && !(await page.$('#cardBody .cv-head')), 'the old card: no new-look parts');
  check(await vis(page, '#cardBody .value') === 1 && await vis(page, '#cardBody .grid') === 1 && await vis(page, '#fullC') === 0, 'the old card shows its value box and grid, and no Full story button');
  check(await vis(page, '#gpsPill') === 1 && await vis(page, '#arPill') === 1, 'the old point mode keeps its pills');
  check(!page.errors.length, 'no page errors (old look) ' + page.errors.join('; '));
  await ctx.close();
}

// 2. The new look, from a link
const ctx = await browser.createBrowserContext();
const page = await newPage('/?demo=1&look=new', ctx);
check(await page.evaluate(() => document.body.classList.contains('calm')), '?look=new turns it on');
check(await page.evaluate(() => !/look=/.test(location.search) && /demo=1/.test(location.search)), '?look= is taken off the address once applied (the switch decides after that)');
await page.click('#goPoint'); await sleep(1500);
check(await vis(page, '#gpsPill') === 0 && await vis(page, '#hdgPill') === 0 && await vis(page, '#arPill') === 0 && await vis(page, '#brandPill') === 1, 'point mode: no status pills, just the name');
await page.evaluate(() => window.__hp.setHeading(15)); await sleep(1200);
check(/Aim the circle at a house/.test(await page.$eval('#hint', (el) => el.textContent)) && (await page.$eval('#toast', (el) => el.classList.contains('off'))), 'the first tip is a line under the aim circle, not a box');
await page.click('#shutter'); await sleep(1800);

// The small card
check(/cv-peek/.test(await sheetCls(page)), 'the card opens small');
const peek = await page.evaluate(() => {
  const body = document.querySelector('#cardBody'), card = document.querySelector('#sheet .card').getBoundingClientRect();
  const v = (sel) => [...body.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
  return { top: card.top, nums: v('.cv-nums > div').map((d) => d.innerText.replace(/\n/g, ' | ')), addr: (v('.addr')[0] || {}).textContent, facts: (v('.cv-facts')[0] || {}).textContent,
    flood: (v('.cv-fl')[0] || {}).textContent, hidden: ['.value', '.tax', '.grid', '#floodBox', '.note', '.cv-rows', '.chips', '.aerial'].filter((q) => v(q).length),
    scrolls: body.scrollHeight > body.clientHeight + 2 };
});
console.log('  small card:', JSON.stringify(peek));
check(peek.top > 380, `the camera stays in view above the small card (card top at ${Math.round(peek.top)} px)`);
check(peek.nums.length === 3 && /Assessed/.test(peek.nums[0]) && /Last sold/.test(peek.nums[1]) && /Tax/.test(peek.nums[2]), 'three numbers: assessed, last sold, tax');
check(peek.addr === '144 Chestnut St' && /Built 1816/.test(peek.facts || ''), 'the address and the facts line');
check(/Zone X · minimal flood risk/.test(peek.flood || '') && /not official/.test(peek.flood || ''), `the flood line, marked not official: ${peek.flood}`);
check(!peek.hidden.length, 'nothing else on the small card: ' + peek.hidden.join(', '));
check(!peek.scrolls, 'the small card doesn’t scroll');
check(await vis(page, '#fullC') === 1 && await vis(page, '#prevC') === 0 && await vis(page, '#nextC') === 1 && await vis(page, '#shareC') === 1, 'small card buttons: Not it, Share, Full story (no back on the first match)');
await page.click('#nextC'); await sleep(700);
check(/cv-peek/.test(await sheetCls(page)) && await vis(page, '#prevC') === 1 && await page.$eval('#prevC', (el) => el.innerText.trim()) === '‹', 'the next match: still small, with a compact ‹ back');
await page.click('#prevC'); await sleep(700);
check(await page.$eval('#cardBody .addr', (el) => el.textContent) === '144 Chestnut St', '‹ goes back to the first match');

// The overview
await page.click('#fullC'); await sleep(500);
check(/cv-hub/.test(await sheetCls(page)), 'Full story opens the overview');
check(await page.evaluate(() => document.activeElement && document.activeElement.dataset.cv === 'money'), 'focus moves to the first section');
const hub = await page.evaluate(() => [...document.querySelectorAll('#cardBody .cv-rows.cv-hub-only > .cv-row')].map((b) => [b.dataset.cv, b.innerText.replace(/\n/g, ' | ')]));
console.log('  overview rows:', JSON.stringify(hub));
check(hub.map((x) => x[0]).join() === 'money,house,flood,buy', 'four sections: Money, The house, Flood and ground, Thinking of buying?');
check(/Assessed \+21% vs\. the 2006 sale/.test(hub[0][1]) && /3,171 ft²/.test(hub[1][1]) && /Zone X · minimal flood risk · ground at 77 ft/.test(hub[2][1]) && /≈ \$[\d,]+ a month/.test(hub[3][1]), 'each section says its answer in a line');
check(await vis(page, '#cardBody .cv-src') === 1 && await vis(page, '#cardBody .aerial') === 1 && await vis(page, '#cardBody .value') === 0, 'the overview: photo, source line, no value box');

// Each section and back
for (const [pg, sel, title] of [['money', '.value', 'Money'], ['house', '.grid', 'The house'], ['flood', '#floodBox', 'Flood and ground'], ['sources', '.note', 'Sources']]) {
  await page.evaluate((pg) => document.querySelector(`#cardBody [data-cv="${pg}"]`).click(), pg); await sleep(300);
  const st = await page.evaluate((pg) => { const sec = document.querySelector('#cardBody .cv-page.on'); return { on: sec && sec.dataset.page, title: sec && sec.querySelector('.cv-title').textContent, back: sec && sec.querySelector('.cv-back').textContent }; }, pg);
  check(st.on === pg && st.title === title && /144 Chestnut St$/.test(st.back) && await vis(page, `#cardBody ${sel}`) === 1 && await vis(page, '#cardBody .cv-head') === 0, `${title}: opens on its own, with a way back`);
  check(await page.evaluate(() => document.activeElement && document.activeElement.matches('.cv-back') && /^Back to 144 Chestnut St$/.test(document.activeElement.getAttribute('aria-label'))), `${title}: focus on its back button, which says where it goes`);
  await page.evaluate(() => document.querySelector('#cardBody .cv-page.on .cv-back').click()); await sleep(200);
  check(/cv-hub/.test(await sheetCls(page)) && await page.evaluate((pg) => document.activeElement && document.activeElement.dataset.cv === pg, pg), `${title}: back to the overview, focus on its row`);
}
const money = await page.evaluate(() => { document.querySelector('#cardBody [data-cv="money"]').click(); return document.querySelector('#cardBody .cv-page.on').innerText; });
check(/\$1,138,000/.test(money) && /Value per ft²\s+\$359/.test(money) && /Land value\s+\$512k/.test(money) && /ESTIMATED PROPERTY TAX/i.test(money) && /Monthly cost if you bought it/.test(money), 'Money: value, sale, per ft², land value, tax and the monthly cost');
const flood = await page.evaluate(() => { document.querySelector('#cardBody .cv-page.on .cv-back').click(); document.querySelector('#cardBody [data-cv="flood"]').click(); return document.querySelector('#cardBody .cv-page.on').innerText; });
check(/not an official flood determination/.test(flood), 'Flood and ground: says it isn’t an official determination');

// "Not it" keeps the section; a fresh house starts small
const before = await page.$eval('#cardBody .addr', (el) => el.textContent);
await page.click('#nextC'); await sleep(900);
const after = await page.evaluate(() => ({ addr: document.querySelector('#cardBody .addr').textContent, cls: document.querySelector('#sheet').className, on: ((document.querySelector('#cardBody .cv-page.on') || {}).dataset || {}).page }));
check(after.addr !== before && /cv-pg/.test(after.cls) && after.on === 'flood', `Not it: the next house, same section (${before} → ${after.addr}; ${after.cls}; ${after.on})`);
await page.evaluate(() => { document.querySelector('.grab').click(); }); await sleep(500);
await page.click('#shutter'); await sleep(1500);
check(/cv-peek/.test(await sheetCls(page)), 'a fresh house starts small again');

// Buying: nothing asked until the section opens, then it loads; plain words for a service that doesn't answer
await page.click('#fullC'); await sleep(300);
const askedBefore = page.asked.filter((u) => !/basemap|imagery|tile|nationalmap|arcgisonline|MapServer\/export|ImageServer/i.test(u)).length;
check(await page.$eval('#cardBody #buyBox', (el) => !el.querySelector('#bSchools')), 'buying isn’t looked up until its section opens');
await page.evaluate(() => document.querySelector('#cardBody [data-cv="buy"]').click()); await sleep(2500);
const buy = await page.evaluate(() => ({ schools: !!document.querySelector('#cardBody #bSchools'), why: [...document.querySelectorAll('#cardBody .why')].filter((el) => el.getClientRects().length).length,
  head: document.querySelectorAll('#cardBody .cv-page.on .buy-h').length, txt: document.querySelector('#cardBody .cv-page.on').innerText }));
check(buy.schools && /Looked up when you open this section/.test(buy.txt), 'opening Thinking of buying? loads it, and says when it looks things up');
check(buy.why === 0 && /Couldn’t load this right now/.test(buy.txt), 'a service that doesn’t answer: plain words, no service error');
check(buy.head === 0, 'the section’s title isn’t repeated');
check(await page.evaluate(() => localStorage.getItem('housepoint.buyOpen')) === null, 'opening it in the new look doesn’t switch on the old look’s auto-loading');
await page.click('#nextC'); await sleep(1500);
check(await page.evaluate(() => /cv-pg/.test(document.querySelector('#sheet').className) && !!document.querySelector('#cardBody .cv-page.on #bSchools')), 'Not it on the buying section: the next house’s buying details, since the section is open');
await page.evaluate(() => document.querySelector('#cardBody .cv-page.on .cv-back').click()); await sleep(200);
await page.click('#nextC'); await sleep(1200);
check(await page.evaluate(() => !document.querySelector('#cardBody #bSchools')), 'Not it from the overview: the next house’s buying details wait for its section');
console.log('  outside requests before opening buying:', askedBefore);

// The switch in the list panel: Floating labels and New look; off again goes back to the old card
await page.evaluate(() => document.querySelector('.grab').click()); await sleep(400);
await page.evaluate(() => window.__hp.openPanel('near')); await sleep(500);
check(await vis(page, '#lookSw') === 1 && await vis(page, '#labelsSw') === 1, 'the list panel has New look and Floating labels switches');
const ar0 = await page.evaluate(() => window.__hp.S && document.querySelector('#arPill').getAttribute('aria-pressed'));
await page.click('#labelsSw'); await sleep(200);
check(await page.evaluate(() => document.querySelector('#arPill').getAttribute('aria-pressed')) !== ar0 && await page.$eval('#labelsSw', (el) => el.getAttribute('aria-checked')) !== String(ar0 === 'true'), 'Floating labels switches the labels');
await page.click('#labelsSw'); await sleep(200);
await page.click('#lookSw'); await sleep(300);
check(!(await page.evaluate(() => document.body.classList.contains('calm'))) && await page.evaluate(() => localStorage.getItem('housepoint.look')) === 'old', 'New look off: back to the old look, kept');
check(await vis(page, '#labelsSw') === 0, 'Floating labels goes back to its pill in the old look');
await page.evaluate(() => document.querySelector('#panelGrab').click()); await sleep(400);
await page.click('#shutter'); await sleep(1500);
check(!/cv-/.test(await sheetCls(page)) && await vis(page, '#cardBody .value') === 1 && !(await page.$('#cardBody .cv-head')), 'the old card again');
check(!page.errors.length, 'no page errors (new look) ' + page.errors.join('; '));
await page.close();

// Kept on the phone: a plain reload stays on the last choice; ?look=new again
const p2 = await newPage('/?demo=1&look=new', ctx); await sleep(300);
const p3 = await newPage('/?demo=1', ctx); await sleep(300);
check(await p3.evaluate(() => document.body.classList.contains('calm')), 'the choice is kept on the phone');
const p4 = await newPage('/?demo=1&look=old', ctx); await sleep(300);
const p5 = await newPage('/?demo=1', ctx); await sleep(300);
check(!(await p5.evaluate(() => document.body.classList.contains('calm'))), '?look=old turns it off, and that’s kept too');
for (const p of [p2, p3, p4, p5]) await p.close();
await ctx.close();

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close(); srv.close();
process.exit(fails.length ? 1 : 0);
