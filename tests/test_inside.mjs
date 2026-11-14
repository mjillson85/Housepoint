// Standing on a lot and aiming at other houses: the house under the circle wins, not the lot you're on.
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
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
    const c = hp.findCandidates(S.pos.lat, S.pos.lon, S.heading).slice(0, 4).map((c) => `${hp.summarize(c.L.p).addr} ${Math.round(c.p * 100)}%${c.inside ? ' [ON LOT]' : ` @${c.dist.toFixed(0)}m`}`);
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
// Tags go on houses that are wide enough on screen that a compass a little off still puts the tag over the right one, and near
// enough (within 55 m). Looking across at the houses they get tags; looking straight down the street, houses seen edge-on don't.
await page.reload(); await sleep(500); await page.click('#goPoint'); await sleep(1200);   // roof outlines back
const tagsAt = async (h) => {
  await page.evaluate((h) => { const S = window.__hp.S; const [lat, lon] = S.proj.inv(27, 0); S.pos = { lat, lon }; S.acc = 6; S.beta = 90; window.__hp.setHeading(h); }, h);
  await sleep(1600);
  return page.evaluate(() => {
    const hp = window.__hp, S = hp.S, f = hp.camFocalPx(), half = Math.atan(innerWidth / 2 / f) * 180 / Math.PI;
    const shown = hp.AR.items.filter((i) => !i.hidden && i.el.style.opacity === '1').map((i) => ({ a: hp.summarize(i.L.p).addr, d: i.dist, n: i.n, r: i.el.getBoundingClientRect(), far: i.el.classList.contains('far') }));
    const scan = hp.arScan(...S.proj.fwd(S.pos.lat, S.pos.lon), S.heading, half).filter((v) => v.L.p.key !== (S.live && S.live.L.p.key)).map((v) => ({ a: hp.summarize(v.L.p).addr, n: v.n, d: v.dist }));
    const lr = document.querySelector('#liveLabel').getBoundingClientRect(), hud = document.querySelector('#arPill').getBoundingClientRect();
    const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const inView = hp.AR.items.filter((i) => Math.abs(((i.bearing - S.heading + 540) % 360) - 180) <= half - 3);
    return { shown: shown.map((x) => `${x.a} n=${x.n} d=${Math.round(x.d)}${x.far ? ' far' : ''}`), scan: scan.map((x) => `${x.a} n=${x.n} d=${Math.round(x.d)}`), scanN: scan.map((x) => x.n),
      wideInView: inView.filter((i) => i.n >= 8 && i.dist <= 50).length,
      count: shown.length, maxD: Math.max(0, ...shown.map((x) => x.d)), minN: Math.min(99, ...shown.map((x) => x.n)), farSmall: shown.filter((x) => x.d > 40).every((x) => x.far),
      wide: scan.filter((x) => x.n >= 8 && x.d <= 50).length, clash: shown.some((a, i) => over(a.r, lr) || a.r.top < hud.bottom || shown.some((b, j) => j > i && over(a.r, b.r))) };
  });
};
// A full turn from the kerb: every tag that shows is near and wide enough; some do show; none clash
const turn = [];
for (let h = 0; h < 360; h += 15) turn.push({ h, ...(await tagsAt(h)) });
const tagged = turn.filter((t) => t.count);
console.log('turning around:', turn.map((t) => `${t.h}°: ${t.shown.join(', ') || '—'}`).join(' | '));
check(tagged.length >= 2 && turn.every((t) => t.maxD <= 63 && t.minN >= 3 && t.farSmall), `tags show at ${tagged.length} of ${turn.length} headings, all within 55 m and wide enough on screen`);
check(turn.every((t) => !t.clash && t.count <= 6), 'tags don’t overlap each other, the big label, or the top buttons');
const down = await tagsAt(90);
console.log('looking down the street:', JSON.stringify(down));
check(down.count === 0 && down.scanN.every((n) => n < 8), `looking straight down the street: houses seen edge-on (a few degrees wide) get no tags (${down.scan.join('; ')})`);
// Turning slowly: a tag doesn't vanish and come back (blink). The house under the circle has the big label instead, which counts
// as shown; a one-frame handover between the two isn't a blink either.
const track = new Map(); let step = 0;
for (let h = 22; h <= 38.05; h += 0.2, step++) {
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
console.log('tag blinks while turning 16° slowly:', blinks, 'houses seen:', track.size);
check(blinks === 0 && track.size >= 2, `turning slowly: no tag blinks off and back on (${blinks})`);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
await browser.close();
