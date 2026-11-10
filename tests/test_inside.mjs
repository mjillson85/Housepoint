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
// Looking down the street: a clearly visible distant house gets a (smaller) tag; far-off houses and slivers peeking between nearer
// houses don't; at most 6 tags; none hidden under the big label, overlapping, or under the top buttons.
await page.reload(); await sleep(500); await page.click('#goPoint'); await sleep(1200);   // roof outlines back
await page.evaluate(() => { const S = window.__hp.S; const [lat, lon] = S.proj.inv(27, 0); S.pos = { lat, lon }; S.acc = 6; S.beta = 90; window.__hp.setHeading(90); });
await sleep(1600);
const far = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S, f = hp.camFocalPx(), half = Math.atan(innerWidth / 2 / f) * 180 / Math.PI;
  const shown = hp.AR.items.filter((i) => !i.hidden && i.el.style.opacity === '1').map((i) => ({ d: i.dist, n: i.n, r: i.el.getBoundingClientRect(), far: i.el.classList.contains('far') }));
  const cand = hp.arScan(...S.proj.fwd(S.pos.lat, S.pos.lon), S.heading, half).filter((v) => v.L.p.key !== (S.live && S.live.L.p.key));
  const inView = hp.AR.items.filter((i) => Math.abs(((i.bearing - S.heading + 540) % 360) - 180) <= half - 3);
  const lr = document.querySelector('#liveLabel').getBoundingClientRect(), hud = document.querySelector('#arPill').getBoundingClientRect();
  const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  return { inView: inView.length, inViewShown: inView.filter((i) => !i.hidden && i.el.style.opacity === '1').length, farShown: shown.filter((x) => x.d > 80).length, farSmall: shown.filter((x) => x.d > 80).every((x) => x.far),
    count: shown.length, maxD: Math.max(0, ...shown.map((x) => x.d)), sliverFar: shown.some((x) => x.n < 2 && x.d > 50),
    skippedFar: cand.filter((v) => v.dist > 100).length, skippedSliver: cand.filter((v) => v.n < 2 && v.dist > 50 && v.dist <= 100).length,
    clash: shown.some((a, i) => over(a.r, lr) || a.r.top < hud.bottom || shown.some((b, j) => j > i && over(a.r, b.r))) };
});
console.log('down the street:', JSON.stringify(far));
check(far.inViewShown === far.inView && far.farShown >= 1 && far.farSmall, `a clearly visible house 90 m down the street gets a small tag (${far.inViewShown}/${far.inView}, ${far.farShown} far)`);
check(far.maxD <= 110 && !far.sliverFar && far.count <= 6 && far.skippedFar >= 2, `no tags past 100 m or for far slivers, at most 6 (${far.count} shown, farthest ${Math.round(far.maxD)} m; left out ${far.skippedFar} far, ${far.skippedSliver} slivers)`);
check(!far.clash, 'tags don’t overlap each other, the big label, or the top buttons');
// Turning slowly: a tag doesn't vanish and come back (blink). The house under the circle has the big label instead, which counts
// as shown; a one-frame handover between the two isn't a blink either.
const track = new Map(); let step = 0;
for (let h = 84; h <= 96.05; h += 0.2, step++) {
  await page.evaluate((h) => window.__hp.setHeading(h), h); await sleep(110);
  const on = await page.evaluate(() => { const S = window.__hp.S;
    return [...window.__hp.AR.items.filter((i) => !i.hidden && i.el.style.opacity === '1').map((i) => i.k), ...(S.live ? [S.live.L.p.key] : [])]; });
  for (const k of on) { const a = track.get(k) || []; a[step] = 1; track.set(k, a); }
}
let blinks = 0;
for (const a of track.values()) {
  const seq = Array.from({ length: step }, (_, i) => (a[i] ? 1 : 0)).join('');
  blinks += (seq.match(/1(0{2,5})(?=1)/g) || []).length;          // gone for 2–5 steps (0.4–1°), then back
}
console.log('tag blinks while turning 12° slowly:', blinks);
check(blinks === 0, `turning slowly: no tag blinks off and back on (${blinks})`);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
await browser.close();
