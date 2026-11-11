// Prints simplified Census Bureau outlines (TIGERweb) for the states and counties Housepoint is adding: every ring bigger than
// a few km² (Hawaii's islands), vertices rounded. Plain Node; prints only. Run by the probe workflow.
const BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const info = await get(`${BASE}?f=json`);
const states = (info.layers || []).find((l) => /^States$/i.test(l.name)), counties = (info.layers || []).find((l) => /^Counties$/i.test(l.name));
// Cities whose parcel layers cover the city alone (Atlanta, Bismarck)
const PBASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer';
const pinfo = await get(`${PBASE}?f=json`);
const places = { ...(pinfo.layers || []).find((l) => /^Incorporated Places$/i.test(l.name)), base: PBASE };
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };
const WANT = [['AL', states, '01'], ['IA', states, '19'], ['KY', states, '21'], ['LA', states, '22'], ['MS', states, '28'], ['MO', states, '29'],
  ['NM', states, '35'], ['OK', states, '40'], ['PA', states, '42'], ['RI', states, '44'], ['SC', states, '45'], ['SD', states, '46'], ['IL', states, '17'],
  ['TX', states, '48'], ['CA', states, '06'], ['OH', states, '39'], ['TN', states, '47'], ['ND', states, '38'], ['OR', states, '41'], ['ID', states, '16'],
  ['MI', states, '26'], ['KS', states, '20'], ['GA', states, '13'], ['AZ', states, '04'], ['FL', states, '12'], ['NJ', states, '34'], ['NY', states, '36'], ['NE', states, '31']];
const out = {};
for (const [name, layer, geoid] of WANT) {
  try {
    const q = new URLSearchParams({ where: `GEOID='${geoid}'`, outFields: 'GEOID', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0005', geometryPrecision: '4', f: 'json' });
    const j = await get(`${layer.base || BASE}/${layer.id}/query?${q}`);
    const rings = (j.features[0].geometry.rings || []).filter((r) => area(r) > 0.00005).sort((a, b) => area(b) - area(a));
    out[name] = rings.map((r) => r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
  } catch (e) { out[name] = 'failed ' + e.message; }
}
// one line per ring, in pieces (GitHub drops very long log lines)
for (const [name, rings] of Object.entries(out)) {
  if (!Array.isArray(rings)) { console.log(`OUTLINE ${name} failed ${rings}`); continue; }
  rings.forEach((r, i) => { const t = JSON.stringify(r); for (let k = 0; k * 3000 < t.length; k++) console.log(`OUTLINE ${name} ${i} ${k} ${t.slice(k * 3000, (k + 1) * 3000)}`); });
}
