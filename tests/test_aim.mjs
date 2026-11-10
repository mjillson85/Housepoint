// Aiming with a real phone's error. From spots along the demo street, aim at each house you can see within reach; the phone's position is off
// by GPS error (σ 5 m each way, reporting ±7 m) and its heading by compass error (σ 10°). Over many draws: how often is the house
// you meant the first answer, and how often is it within three "Not it" taps, by distance? And with the aim held on a house while
// the compass jitters a little, does the label stay put?
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const HP_ROOT = process.env.HP_ROOT || fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`file://${HP_ROOT}/index.html?demo=1`);
await page.click('#goPoint'); await sleep(1200);

const res = await page.evaluate(() => {
  const hp = window.__hp, S = hp.S;
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const houses = [];                                  // the main roof of each lot
  for (const L of S.local) { let best = null; for (const b of S.bldgs) if (b.L === L && (!best || b.area > best.area)) best = b; if (best && L.p.built) houses.push({ L, c: best.c }); }
  const spots = []; for (let x = -60; x <= 120; x += 15) spots.push([x, 0]);             // the street, every 15 m
  // Only houses you can see: the line from where you stand to the middle of the roof doesn't cross another roof first
  const roofs = S.bldgs.filter((b) => b.area >= 25);
  const cross = (ax, ay, bx, by, cx, cy, dx, dy) => { const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (!d) return null;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null; };
  const firstT = (b, sx, sy, tx, ty) => { let m = Infinity; for (const r of b.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const t = cross(sx, sy, tx, ty, r[j][0], r[j][1], r[i][0], r[i][1]); if (t != null && t < m) m = t; } return m; };
  const visible = (h, sx, sy) => { const mine = firstT(roofs.find((b) => b.c === h.c), sx, sy, h.c[0], h.c[1]);
    return roofs.every((b) => b.c === h.c || !(firstT(b, sx, sy, h.c[0], h.c[1]) < mine)); };
  const bands = [[0, 20], [20, 35], [35, 55], [55, 80]], out = bands.map(() => ({ n: 0, first: 0, three: 0 }));
  S.acc = 7; S.compassAcc = 10;
  for (const [sx, sy] of spots) for (const h of houses) {
    const d = Math.hypot(h.c[0] - sx, h.c[1] - sy), bi = bands.findIndex(([a, b]) => d >= a && d < b); if (bi < 0 || !visible(h, sx, sy)) continue;
    const trueHd = (Math.atan2(h.c[0] - sx, h.c[1] - sy) * 180 / Math.PI + 360) % 360;
    for (let k = 0; k < 12; k++) {
      const [lat, lon] = S.proj.inv(sx + 5 * gauss(), sy + 5 * gauss());
      const list = hp.findCandidates(lat, lon, (trueHd + 10 * gauss() + 360) % 360);
      const rank = list.findIndex((c) => c.L === h.L);
      const o = out[bi]; o.n++; if (rank === 0) o.first++; if (rank >= 0 && rank < 3) o.three++;
    }
  }
  return bands.map(([a, b], i) => ({ band: `${a}–${b} m`, n: out[i].n, first: Math.round(100 * out[i].first / out[i].n), three: Math.round(100 * out[i].three / out[i].n) }));
});
console.log('aim with GPS ±5 m and compass ±10° (one standard deviation):');
for (const r of res) console.log(`  ${r.band.padEnd(9)} ${String(r.n).padStart(4)} tries: first answer ${r.first}%, within three taps ${r.three}%`);
const by = Object.fromEntries(res.map((r) => [r.band, r]));
check(by['0–20 m'].first >= 70 && by['20–35 m'].first >= 55, `near houses: usually the first answer (${by['0–20 m'].first}% within 20 m, ${by['20–35 m'].first}% at 20–35 m)`);
check(by['0–20 m'].three >= 90 && by['20–35 m'].three >= 85 && by['35–55 m'].three >= 65, `the house you meant is within three taps (${res.map((r) => r.three + '%').join(', ')})`);

// The label holds steady: aim at a house across the street while the compass jitters (σ 3°) for six seconds
await page.evaluate(() => { const S = window.__hp.S; const [lat, lon] = S.proj.inv(10, 0); S.pos = { lat, lon }; S.acc = 7; S.compassAcc = 10; S.beta = 90; });
let seed = 777; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const seen = [];
for (let i = 0; i < 60; i++) {
  await page.evaluate((h) => window.__hp.setHeading(h), (180 + 3 * gauss() + 360) % 360); await sleep(100);
  seen.push(await page.evaluate(() => (window.__hp.S.live ? window.__hp.S.live.L.p.key : '-')));
}
const flips = seen.filter((k, i) => i && k !== seen[i - 1]).length;
console.log('label while the compass jitters ±3°:', flips, 'changes;', [...new Set(seen)].length, 'houses shown');
check(flips <= 2, `the label holds steady while the compass jitters (${flips} changes in 6 s)`);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(fails.length ? 1 : 0);
