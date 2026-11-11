// Prints simplified Census Bureau outlines (TIGERweb) for the states, and Cook County, that Housepoint is adding, to write
// their rough outlines from. Only the biggest ring of each, vertices rounded. Plain Node; prints only. Run by the probe workflow.
const BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const info = await get(`${BASE}?f=json`);
const states = (info.layers || []).find((l) => /^States$/i.test(l.name)), counties = (info.layers || []).find((l) => /^Counties$/i.test(l.name));
const WANT = [[states, "GEOID='08'", 'CO', 0.01], [states, "GEOID='05'", 'AR', 0.01], [states, "GEOID='50'", 'VT', 0.004], [states, "GEOID='30'", 'MT', 0.01],
  [states, "GEOID='56'", 'WY', 0.005], [states, "GEOID='49'", 'UT', 0.005], [counties, "GEOID='17031'", 'Cook County', 0.002]];
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };
for (const [layer, where, name, off] of WANT) {
  try {
    const q = new URLSearchParams({ where, outFields: 'GEOID,NAME', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: String(off), geometryPrecision: '4', f: 'json' });
    const j = await get(`${BASE}/${layer.id}/query?${q}`);
    const rings = (j.features[0].geometry.rings || []).sort((a, b) => area(b) - area(a));
    console.log(`== ${name}: ${rings.length} rings; biggest ${rings[0].length} vertices; next ${rings.slice(1, 4).map((r) => r.length).join(',')}`);
    console.log(JSON.stringify(rings[0].map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])));
  } catch (e) { console.log(name, 'failed', e.message); }
}
