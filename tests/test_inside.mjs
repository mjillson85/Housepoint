// Standing on a lot and aiming at other houses: the house under the circle wins, not the lot you're on.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
const file = `${HP_ROOT}/index.html`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + file + '?demo=1');
await page.click('#goPoint'); await new Promise(r => setTimeout(r, 900));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
// Demo lots: 22 m wide (x), y from 6..34 north of the street at y=0; house on that lot: x 5..17, y 12..22.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function probe(name, x, y, heading) {
  await page.evaluate((x, y, h) => {
    const S = window.__hp.S; const [lat, lon] = S.proj.inv(x, y); S.pos = { lat, lon }; S.acc = 6; S.beta = 90;
    window.__hp.setHeading(h);
  }, x, y, heading);
  await sleep(700);
  const r = await page.evaluate(() => {
    const S = window.__hp.S, hp = window.__hp;
    const [ox, oy] = S.proj.fwd(S.pos.lat, S.pos.lon);
    const c = hp.findCandidates(S.pos.lat, S.pos.lon, S.heading).slice(0, 4).map((c) => `${hp.summarize(c.L.p).addr}${c.inside ? ` [ON LOT across=${c.across.toFixed(1)}m]` : ` @${c.dist.toFixed(0)}m center=${c.center} score=${c.score.toFixed(2)}`}`);
    const tags = hp.AR.items.filter((i) => !i.hidden).map((i) => `${hp.summarize(i.L.p).addr} rel=${(((i.bearing - S.heading + 540) % 360) - 180).toFixed(0)}° x=${i.x == null ? '-' : i.x.toFixed(0)}`);
    return { label: document.querySelector('#liveLabel').innerText.replace(/\n/g, ' | '), dim: document.querySelector('#liveLabel').classList.contains('dim'), cands: c, tags, pos: [ox.toFixed(1), oy.toFixed(1)] };
  });
  // tap the shutter: what opens?
  await page.click('#shutter'); await sleep(700);
  const opened = await page.evaluate(() => { const S = window.__hp.S; const c = S.candidates[S.cIdx]; return c ? window.__hp.summarize(c.L.p).addr + (c.inside ? ' [ON LOT]' : '') : null; });
  await page.evaluate(() => document.querySelector('.grab').click()); await sleep(300);
  console.log(`\n### ${name}  pos=(${r.pos}) heading=${heading}`);
  console.log('  live label :', r.dim ? '(hidden)' : r.label);
  console.log('  candidates :', r.cands.join('  ||  '));
  console.log('  tap opens  :', opened);
  console.log('  AR tags    :', r.tags.join('  ||  ') || '(none)');
  return { opened, label: r.label };
}
// Standing on your own lot (146 Chestnut; its house is x 21–33, y 12–22; driveway x 33–38), aiming elsewhere.
const cases = [
  ['street, aim N at the house', 27, 0, 0, /^146 Chestnut St$/],
  ['driveway, aim N over the back fence', 35.5, 15, 0, /^236 Prospect Hill Rd$/],
  ['driveway by the garage, aim S across the street', 36, 20, 180, /^176 Chestnut St$/],
  ['driveway by the garage, aim SSE across the street', 36, 20, 165, /^178 Chestnut St$/],
  ['driveway, aim NE at the neighbor', 35.5, 15, 20, /^238 Prospect Hill Rd$/],
  ['driveway, aim NW over your own roof', 35.5, 15, 315, /^146 Chestnut St \[ON LOT\]$/],
  ['front lawn, aim S across the street', 27, 9, 180, /^176 Chestnut St$/],
];
for (const [name, x, y, h, want] of cases) { const r = await probe(name, x, y, h); check(want.test(r.opened || ''), `${name} → ${r.opened}`); }
await page.evaluate(() => window.__hp.setBuildings([]));
for (const [name, x, y, h, want] of [['no roof outlines: driveway, aim N over the back fence', 35.5, 15, 0, /^236 Prospect Hill Rd$/], ['no roof outlines: by the garage, aim S across the street', 36, 20, 180, /^176 Chestnut St$/]]) {
  const r = await probe(name, x, y, h); check(want.test(r.opened || ''), `${name} → ${r.opened}`);
}
// Looking down the street: distant houses get (smaller) tags too, none hidden under the big label, none overlapping, none under the top buttons.
await page.reload(); await sleep(500); await page.click('#goPoint'); await sleep(1200);   // roof outlines back
await page.evaluate(() => { const S = window.__hp.S; const [lat, lon] = S.proj.inv(27, 0); S.pos = { lat, lon }; S.acc = 6; S.beta = 90; window.__hp.setHeading(90); });
await sleep(1600);
const far = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S, f = hp.camFocalPx(), half = Math.atan(innerWidth / 2 / f) * 180 / Math.PI;
  const shown = hp.AR.items.filter((i) => !i.hidden && i.el.style.opacity === '1').map((i) => ({ d: i.dist, r: i.el.getBoundingClientRect(), far: i.el.classList.contains('far') }));
  const inView = hp.AR.items.filter((i) => Math.abs(((i.bearing - S.heading + 540) % 360) - 180) <= half - 3);
  const lr = document.querySelector('#liveLabel').getBoundingClientRect(), hud = document.querySelector('#arPill').getBoundingClientRect();
  const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  return { inView: inView.length, inViewShown: inView.filter((i) => !i.hidden && i.el.style.opacity === '1').length, farShown: shown.filter((x) => x.d > 80).length, farSmall: shown.filter((x) => x.d > 80).every((x) => x.far),
    clash: shown.some((a, i) => over(a.r, lr) || a.r.top < hud.bottom || shown.some((b, j) => j > i && over(a.r, b.r))) };
});
console.log('down the street:', JSON.stringify(far));
check(far.inViewShown === far.inView && far.farShown >= 4 && far.farSmall, `every house in view has a tag, distant ones included (${far.inViewShown}/${far.inView}, ${far.farShown} far)`);
check(!far.clash, 'tags don’t overlap each other, the big label, or the top buttons');
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
await browser.close();
