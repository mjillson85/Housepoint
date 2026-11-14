// The site's own files: icons, install manifest, link preview tags, and the ?service= testing override.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HP_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');   // the folder with index.html
process.chdir(`${HP_ROOT}/tests`);   // screenshots land in tests/ (ignored by git), wherever the test is run from
const fails = []; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const html = fs.readFileSync(path.join(HP_ROOT, 'index.html'), 'utf8');
const exists = (f) => fs.existsSync(path.join(HP_ROOT, f)) && fs.statSync(path.join(HP_ROOT, f)).size > 0;

// Every local file the page points at is there.
const local = [...html.matchAll(/(?:href|src)="([^"#:]+\.(?:png|webmanifest|html|woff2))"/g), ...html.matchAll(/url\(([^)"']+\.woff2)\)/g)].map((m) => m[1]);
check(local.length >= 8 && local.every(exists), `all ${local.length} local files the page uses exist (${local.filter((f) => !exists(f)).join(', ') || 'none missing'})`);
const man = JSON.parse(fs.readFileSync(path.join(HP_ROOT, 'manifest.webmanifest'), 'utf8'));
check(man.name === 'Housepoint' && man.display === 'standalone' && man.icons.length >= 2 && man.icons.every((i) => exists(i.src)), 'install manifest is valid and its icons exist');
check(man.icons.every((i) => ['any', 'maskable'].includes(i.purpose)) && man.icons.some((i) => i.purpose === 'maskable'), 'icons list "any" and "maskable" separately');
check(/apple-mobile-web-app-status-bar-style" content="black-translucent"/.test(html) && /viewport-fit=cover/.test(html) && /env\(safe-area-inset-top/.test(html), 'home-screen app runs full-screen under the status bar, and the layout keeps clear of it');
const png = (f) => { const b = fs.readFileSync(path.join(HP_ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)].join('x'); };
check(png('icons/icon-180.png') === '180x180' && png('icons/icon-192.png') === '192x192' && png('icons/icon-512.png') === '512x512' && png('icons/preview.png') === '1200x630', 'icons and the link preview image are the sizes they claim');
check(/<meta name="description" content="[^"]{60,}">/.test(html) && /og:image" content="https:\/\/mjillson85\.github\.io\/Housepoint\/icons\/preview\.png"/.test(html) && /rel="apple-touch-icon" href="icons\/icon-180\.png"/.test(html), 'description, link preview and home-screen icon tags are present');
check(/href="\.\/">‹ Back to Housepoint/.test(fs.readFileSync(path.join(HP_ROOT, 'privacy.html'), 'utf8')), 'the privacy page links back to the app');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const override = async (v) => { await page.goto(`file://${HP_ROOT}/index.html?demo=1&service=${encodeURIComponent(v)}`); return page.evaluate(() => window.__hp.SERVICE_OVERRIDE); };
check(await override('https://evil.example/arcgis/rest/services/Fake/FeatureServer') === null, '?service= pointing at an unknown site is ignored');
check(await override('http://services1.arcgis.com/x/arcgis/rest/services/Y/FeatureServer') === null, '?service= over plain http is ignored');
check(await override('https://evil.example/?x=.arcgis.com/') === null, '?service= with a look-alike address is ignored');
check(await override('https://services1.arcgis.com/someoneelse/arcgis/rest/services/Parcels/FeatureServer') === null, '?service= on someone else’s ArcGIS account is ignored');
check(await override('https://records.example.us/arcgis/rest/services/Parcels/FeatureServer') === null && await override('https://gov.example.com/x') === null, '?service= on a look-alike government address is ignored');
check(await override('https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Parcels/FeatureServer') !== null && await override('https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer') !== null, '?service= on MassGIS’s own account or a .gov site still works for testing');
const live = await page.evaluate(() => { const f = window.__hp.serviceOverride, svc = '?service=' + encodeURIComponent('https://gis.example.gov/arcgis/rest/services/Parcels/FeatureServer');
  return { plain: f(svc, 'mjillson85.github.io'), debug: f(svc + '&debug=1', 'mjillson85.github.io') }; });
check(live.plain === null && live.debug === null, `on the live site ?service= is ignored, ?debug or not (${JSON.stringify(live)})`);
check(!errors.length, 'no page errors ' + errors.join('; '));
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
await browser.close();
