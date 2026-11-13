// Opens every assessor link the card can show from a table (Tennessee's and Kansas's statewide searches, Rhode Island's 39 towns) and logs whether each still answers,
// where it ends up and the page's title, so a town that moved its records shows up here. Plain Node; prints only. Nothing is read
// from the pages beyond their title (they show owners' names).
//   cd tests && node probe/record-links.mjs
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const vgsi = Function(`return (${/const RI_VGSI = (\{[\s\S]*?\});/.exec(html)[1]})`)();
const nereval = Function(`return (${/const RI_NEREVAL = (\[[\s\S]*?\]);/.exec(html)[1]})`)();
const other = Function(`return (${/const RI_OTHER = (\{[\s\S]*?\});/.exec(html)[1]})`)();
// The statewide searches the basic card links to (Tennessee, Kansas)
const sites = Function(`return (${/const STATE_SITES = (\{[\s\S]*?\n\});/.exec(html)[1]})`)();
const links = [
  ...Object.entries(sites).map(([st, x]) => [x.text.replace(/’s .*/, ''), x.url, /Tennessee|Kansas|ORKA|property/i]),
  ...Object.entries(other),
  ...Object.entries(vgsi).map(([t, slug]) => [t, `https://gis.vgsi.com/${slug}`]),
  ...nereval.map((t) => [t, `https://data.nereval.com/SearchInfo.aspx?town=${encodeURIComponent(t).replace(/%20/g, '+')}`]),
];
console.log(`== ${links.length} assessor links: the statewide searches, then Rhode Island's towns`);
let bad = 0;
for (const [town, url, nameRe] of links) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000), t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', signal: c.signal, headers: { 'user-agent': 'Mozilla/5.0 (Housepoint link check)' } });
    const body = await r.text();
    const title = ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    // A dead town page on either site still answers 200 with an error or the vendor's home page: check the town's name is on it
    const named = (nameRe || new RegExp(town.replace(/\s+/g, '\\s*'), 'i')).test(body.slice(0, 200000));
    const ok = r.ok && named, robots = r.status === 403;     // a firewall that turns away robots (and GitHub's servers): check by hand
    if (!ok && !robots) bad++;
    console.log(`${ok ? 'ok  ' : robots ? 'BOT ' : 'BAD '} ${town}: ${r.status} ${Date.now() - t0} ms${r.url !== url ? ` → ${r.url}` : ''} · "${title}"${named ? '' : ' · town not named on the page'}`);
  } catch (e) { bad++; console.log(`BAD  ${town}: ${e.name === 'AbortError' ? 'no answer in 20 s' : e.message} · ${url}`); }
  finally { clearTimeout(t); }
}
console.log(bad ? `${bad} of ${links.length} links need a look` : `none broken (BOT: the site turns away robots, so open those by hand)`);
process.exitCode = bad ? 1 : 0;      // a broken link fails the step, so the run shows it
