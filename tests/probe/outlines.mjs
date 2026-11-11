// Prints simplified Census Bureau outlines (TIGERweb) for the states and counties Housepoint is adding: every ring bigger than
// a few km² (Hawaii's islands), vertices rounded. Plain Node; prints only. Run by the probe workflow.
const BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
const info = await get(`${BASE}?f=json`);
const states = (info.layers || []).find((l) => /^States$/i.test(l.name)), counties = (info.layers || []).find((l) => /^Counties$/i.test(l.name));
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };
const WANT = [['IN', states, '18'], ['NH', states, '33'], ['WV', states, '54'], ['NV', states, '32'], ['HI', states, '15'], ['DE', states, '10'], ['VA', states, '51'],
  ['TX_HARRIS', counties, '48201'], ['TX_TARRANT', counties, '48439'], ['CA_ALAMEDA', counties, '06001'], ['CA_SBD', counties, '06071'], ['OH_FRANKLIN', counties, '39049'],
  ['OH_HAMILTON', counties, '39061'], ['TN_DAVIDSON', counties, '47037'], ['ND_BURLEIGH', counties, '38015'], ['MI_WAYNE', counties, '26163'], ['GA_FULTON', counties, '13121'],
  ['MI_OAKLAND', counties, '26125'], ['ID_ADA', counties, '16001'], ['KS_SEDGWICK', counties, '20173'], ['AZ_MARICOPA', counties, '04013'], ['OR_MULTNOMAH', counties, '41051'],
  ['OR_WASHINGTON', counties, '41067'], ['OR_CLACKAMAS', counties, '41005'], ['PA_ALLEGHENY', counties, '42003']];
const out = {};
for (const [name, layer, geoid] of WANT) {
  try {
    const q = new URLSearchParams({ where: `GEOID='${geoid}'`, outFields: 'GEOID', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.003', geometryPrecision: '4', f: 'json' });
    const j = await get(`${BASE}/${layer.id}/query?${q}`);
    const rings = (j.features[0].geometry.rings || []).filter((r) => area(r) > 0.0004).sort((a, b) => area(b) - area(a));
    out[name] = rings.map((r) => r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
  } catch (e) { out[name] = 'failed ' + e.message; }
}
console.log('OUTLINES ' + JSON.stringify(out));
