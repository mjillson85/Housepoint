// Prints the Census Bureau's state outlines (TIGERweb) along the state lines that Housepoint's rough outlines follow, so their
// corners can be set from real lines: Connecticut's and Massachusetts's New York lines, Maryland's Delaware line and the North
// Branch of the Potomac, and the Hudson and the kills between New York and New Jersey. Run by the probe workflow; prints only.
const BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

const info = await get(`${BASE}?f=json`);
const layer = (info.layers || []).find((l) => /^States$/i.test(l.name));
if (!layer) { console.log('no States layer:', (info.layers || []).map((l) => `${l.id} ${l.name}`).join(' | ')); process.exit(0); }
console.log('States layer', layer.id);

// state FIPS -> boxes [west, south, east, north] to print vertices in
const WANT = {
  '09': { name: 'CT', boxes: { 'New York line': [-73.80, 40.95, -73.40, 42.10] } },
  '25': { name: 'MA', boxes: { 'New York line': [-73.56, 42.00, -73.20, 42.80] } },
  '36': { name: 'NY', boxes: { 'Connecticut line': [-73.80, 40.95, -73.40, 42.10], 'Massachusetts line': [-73.56, 42.00, -73.20, 42.80],
    'New Jersey water line': [-74.30, 40.48, -73.88, 41.00], 'Fishers Island': [-72.10, 41.22, -71.85, 41.32] } },
  '34': { name: 'NJ', boxes: { 'New York water line': [-74.30, 40.48, -73.88, 41.00] } },
  '24': { name: 'MD', boxes: { 'Delaware north-south line': [-75.80, 38.44, -75.68, 39.73], 'Transpeninsular line': [-75.70, 38.44, -75.04, 38.47],
    'Potomac North Branch': [-79.50, 39.15, -78.90, 39.75] } },
  '10': { name: 'DE', boxes: { 'Maryland north-south line': [-75.80, 38.44, -75.68, 39.73], 'Transpeninsular line': [-75.70, 38.44, -75.04, 38.47] } },
};

for (const [fips, w] of Object.entries(WANT)) {
  const q = new URLSearchParams({ where: `GEOID='${fips}'`, outFields: 'GEOID,NAME', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.001',
    geometryPrecision: '5', f: 'json' });
  let j;
  try { j = await get(`${BASE}/${layer.id}/query?${q}`); } catch (e) { console.log(w.name, 'failed', e.message); continue; }
  const f = (j.features || [])[0];
  if (!f) { console.log(w.name, 'no feature', JSON.stringify(j).slice(0, 300)); continue; }
  const rings = f.geometry.rings || [];
  console.log(`\n== ${w.name} (${f.attributes.NAME}): ${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} vertices`);
  for (const [label, [W, S, E, N]] of Object.entries(w.boxes)) {
    const inBox = ([x, y]) => x >= W && x <= E && y >= S && y <= N;
    const runs = [];
    for (const r of rings) {
      let run = [];
      for (const p of r) { if (inBox(p)) run.push(p); else if (run.length) { runs.push(run); run = []; } }
      if (run.length) runs.push(run);
    }
    console.log(`-- ${label}: ${runs.length} runs`);
    for (const run of runs.filter((x) => x.length > 1).slice(0, 12)) {
      const pts = run.length > 160 ? run.filter((_, i) => i % Math.ceil(run.length / 160) === 0 || i === run.length - 1) : run;
      console.log(`   ${run.length} pts: ` + JSON.stringify(pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])));
    }
  }
}
